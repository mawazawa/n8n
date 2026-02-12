/**
 * Custom Node Builder - Code Generator
 * TypeScript code generation for n8n nodes
 */

import type {
	NodeDefinition,
	CredentialDefinition,
	PropertyDefinition,
	ResourceDefinition,
} from './types';

/**
 * Generate node class TypeScript code
 */
export function generateNodeClass(definition: NodeDefinition): string {
	const {
		name,
		displayName,
		description,
		version,
		defaults,
		icon,
		category,
		credentials,
		resources,
		properties,
		inputs,
		outputs,
		webhooks,
		polling,
		subtitle,
		documentationUrl,
	} = definition;

	const lines: string[] = [];

	// Imports
	lines.push("import type {");
	lines.push("\tIExecuteFunctions,");
	lines.push("\tINodeType,");
	lines.push("\tINodeTypeDescription,");
	if (webhooks && webhooks.length > 0) {
		lines.push("\tIWebhookFunctions,");
		lines.push("\tIWebhookResponseData,");
	}
	if (polling) {
		lines.push("\tIPollFunctions,");
	}
	lines.push("} from 'n8n-workflow';");
	lines.push("");

	// Class definition
	lines.push(`export class ${name} implements INodeType {`);
	lines.push(`\tdescription: INodeTypeDescription = {`);
	lines.push(`\t\tdisplayName: '${escapeString(displayName)}',`);
	lines.push(`\t\tname: '${camelCase(name)}',`);

	// Icon
	if (icon) {
		if (icon.type === 'emoji') {
			lines.push(`\t\ticon: 'fa:${icon.value}',`);
		} else if (icon.type === 'file') {
			lines.push(`\t\ticon: 'file:${icon.value}',`);
		} else if (icon.type === 'fontawesome') {
			lines.push(`\t\ticon: '${icon.value}',`);
		}
	}

	lines.push(`\t\tgroup: ['${category}'],`);
	lines.push(`\t\tversion: ${version},`);
	lines.push(`\t\tdescription: '${escapeString(description)}',`);

	// Defaults
	lines.push(`\t\tdefaults: {`);
	lines.push(`\t\t\tname: '${escapeString(defaults.name)}',`);
	if (defaults.color) {
		lines.push(`\t\t\tcolor: '${defaults.color}',`);
	}
	lines.push(`\t\t},`);

	// Inputs/Outputs
	lines.push(`\t\tinputs: ${JSON.stringify(inputs || ['main'])},`);
	lines.push(`\t\toutputs: ${JSON.stringify(outputs || ['main'])},`);

	// Credentials
	if (credentials && credentials.length > 0) {
		lines.push(`\t\tcredentials: [`);
		credentials.forEach((cred, idx) => {
			const comma = idx < credentials.length - 1 ? ',' : '';
			lines.push(`\t\t\t{`);
			lines.push(`\t\t\t\tname: '${camelCase(cred.name)}',`);
			lines.push(`\t\t\t\trequired: true,`);
			lines.push(`\t\t\t}${comma}`);
		});
		lines.push(`\t\t],`);
	}

	// Webhooks
	if (webhooks && webhooks.length > 0) {
		lines.push(`\t\twebhooks: [`);
		webhooks.forEach((webhook, idx) => {
			const comma = idx < webhooks.length - 1 ? ',' : '';
			lines.push(`\t\t\t{`);
			lines.push(`\t\t\t\tname: '${webhook.name}',`);
			lines.push(`\t\t\t\thttpMethod: '${webhook.httpMethod}',`);
			if (webhook.path) {
				lines.push(`\t\t\t\tpath: '${webhook.path}',`);
			}
			lines.push(`\t\t\t\tresponseMode: 'onReceived',`);
			lines.push(`\t\t\t}${comma}`);
		});
		lines.push(`\t\t],`);
	}

	// Polling
	if (polling) {
		lines.push(`\t\tpolling: true,`);
	}

	// Subtitle
	if (subtitle) {
		lines.push(`\t\tsubtitle: '${escapeString(subtitle)}',`);
	}

	// Documentation URL
	if (documentationUrl) {
		lines.push(`\t\tdocumentationUrl: '${documentationUrl}',`);
	}

	// Properties
	lines.push(`\t\tproperties: [`);

	if (resources && resources.length > 0) {
		// Generate resource-based properties
		lines.push(...generateResourceProperties(resources));
	} else if (properties && properties.length > 0) {
		// Generate flat properties
		properties.forEach((prop, idx) => {
			const comma = idx < properties.length - 1 ? ',' : '';
			lines.push(...generateProperty(prop, 3, comma));
		});
	}

	lines.push(`\t\t],`);
	lines.push(`\t};`);
	lines.push("");

	// Methods
	if (webhooks && webhooks.length > 0) {
		lines.push(...generateWebhookMethod());
		lines.push("");
	}

	if (polling) {
		lines.push(...generatePollMethod());
		lines.push("");
	}

	lines.push(...generateExecuteMethod(resources));

	lines.push(`}`);

	return lines.join('\n');
}

/**
 * Generate credential class TypeScript code
 */
export function generateCredentialClass(definition: CredentialDefinition): string {
	const { name, displayName, documentationUrl, properties, test, authenticate } = definition;

	const lines: string[] = [];

	// Imports
	lines.push("import type {");
	lines.push("\tICredentialType,");
	lines.push("\tINodeProperties,");
	if (test) {
		lines.push("\tICredentialTestRequest,");
	}
	if (authenticate) {
		lines.push("\tIAuthenticateGeneric,");
	}
	lines.push("} from 'n8n-workflow';");
	lines.push("");

	// Class definition
	lines.push(`export class ${name} implements ICredentialType {`);
	lines.push(`\tname = '${camelCase(name)}';`);
	lines.push(`\tdisplayName = '${escapeString(displayName)}';`);

	if (documentationUrl) {
		lines.push(`\tdocumentationUrl = '${documentationUrl}';`);
	}

	lines.push(`\tproperties: INodeProperties[] = [`);

	properties.forEach((prop, idx) => {
		const comma = idx < properties.length - 1 ? ',' : '';
		lines.push(`\t\t{`);
		lines.push(`\t\t\tdisplayName: '${escapeString(prop.displayName)}',`);
		lines.push(`\t\t\tname: '${prop.name}',`);
		lines.push(`\t\t\ttype: '${prop.type}',`);
		if (prop.default !== undefined) {
			lines.push(`\t\t\tdefault: '${escapeString(String(prop.default))}',`);
		}
		if (prop.description) {
			lines.push(`\t\t\tdescription: '${escapeString(prop.description)}',`);
		}
		if (prop.required) {
			lines.push(`\t\t\trequired: true,`);
		}
		if (prop.typeOptions?.password) {
			lines.push(`\t\t\ttypeOptions: {`);
			lines.push(`\t\t\t\tpassword: true,`);
			lines.push(`\t\t\t},`);
		}
		lines.push(`\t\t}${comma}`);
	});

	lines.push(`\t];`);

	// Authenticate
	if (authenticate) {
		lines.push("");
		lines.push(`\tauthenticate: IAuthenticateGeneric = {`);
		lines.push(`\t\ttype: '${authenticate.type}',`);
		if (authenticate.properties) {
			lines.push(`\t\tproperties: ${JSON.stringify(authenticate.properties, null, 2).replace(/\n/g, '\n\t\t')},`);
		}
		lines.push(`\t};`);
	}

	// Test
	if (test) {
		lines.push("");
		lines.push(`\ttest: ICredentialTestRequest = {`);
		lines.push(`\t\trequest: {`);
		lines.push(`\t\t\tmethod: '${test.method}',`);
		lines.push(`\t\t\turl: '${test.url}',`);
		if (test.headers) {
			lines.push(`\t\t\theaders: ${JSON.stringify(test.headers, null, 2).replace(/\n/g, '\n\t\t\t')},`);
		}
		if (test.body) {
			lines.push(`\t\t\tbody: ${JSON.stringify(test.body, null, 2).replace(/\n/g, '\n\t\t\t')},`);
		}
		lines.push(`\t\t},`);
		lines.push(`\t};`);
	}

	lines.push(`}`);

	return lines.join('\n');
}

/**
 * Generate index.ts file
 */
export function generateIndex(nodes: string[], credentials: string[]): string {
	const lines: string[] = [];

	// Import nodes
	nodes.forEach((node) => {
		lines.push(`import { ${node} } from './nodes/${node}/${node}.node';`);
	});

	// Import credentials
	credentials.forEach((cred) => {
		lines.push(`import { ${cred} } from './credentials/${cred}.credentials';`);
	});

	lines.push("");

	// Export
	lines.push("export const nodes = [");
	nodes.forEach((node) => {
		lines.push(`\tnew ${node}(),`);
	});
	lines.push("];");

	lines.push("");
	lines.push("export const credentials = [");
	credentials.forEach((cred) => {
		lines.push(`\tnew ${cred}(),`);
	});
	lines.push("];");

	return lines.join('\n');
}

/**
 * Generate resource-based properties
 */
function generateResourceProperties(resources: ResourceDefinition[]): string[] {
	const lines: string[] = [];

	// Resource selector
	lines.push(`\t\t\t{`);
	lines.push(`\t\t\t\tdisplayName: 'Resource',`);
	lines.push(`\t\t\t\tname: 'resource',`);
	lines.push(`\t\t\t\ttype: 'options',`);
	lines.push(`\t\t\t\tnoDataExpression: true,`);
	lines.push(`\t\t\t\toptions: [`);

	resources.forEach((resource, idx) => {
		const comma = idx < resources.length - 1 ? ',' : '';
		lines.push(`\t\t\t\t\t{`);
		lines.push(`\t\t\t\t\t\tname: '${escapeString(resource.displayName)}',`);
		lines.push(`\t\t\t\t\t\tvalue: '${resource.name}',`);
		if (resource.description) {
			lines.push(`\t\t\t\t\t\tdescription: '${escapeString(resource.description)}',`);
		}
		lines.push(`\t\t\t\t\t}${comma}`);
	});

	lines.push(`\t\t\t\t],`);
	lines.push(`\t\t\t\tdefault: '${resources[0].name}',`);
	lines.push(`\t\t\t},`);

	// Operations for each resource
	resources.forEach((resource) => {
		lines.push(`\t\t\t{`);
		lines.push(`\t\t\t\tdisplayName: 'Operation',`);
		lines.push(`\t\t\t\tname: 'operation',`);
		lines.push(`\t\t\t\ttype: 'options',`);
		lines.push(`\t\t\t\tnoDataExpression: true,`);
		lines.push(`\t\t\t\tdisplayOptions: {`);
		lines.push(`\t\t\t\t\tshow: {`);
		lines.push(`\t\t\t\t\t\tresource: ['${resource.name}'],`);
		lines.push(`\t\t\t\t\t},`);
		lines.push(`\t\t\t\t},`);
		lines.push(`\t\t\t\toptions: [`);

		resource.operations.forEach((op, idx) => {
			const comma = idx < resource.operations.length - 1 ? ',' : '';
			lines.push(`\t\t\t\t\t{`);
			lines.push(`\t\t\t\t\t\tname: '${escapeString(op.displayName)}',`);
			lines.push(`\t\t\t\t\t\tvalue: '${op.name}',`);
			lines.push(`\t\t\t\t\t\tdescription: '${escapeString(op.description)}',`);
			lines.push(`\t\t\t\t\t\taction: '${escapeString(op.displayName.toLowerCase())}',`);
			lines.push(`\t\t\t\t\t}${comma}`);
		});

		lines.push(`\t\t\t\t],`);
		lines.push(`\t\t\t\tdefault: '${resource.operations[0].name}',`);
		lines.push(`\t\t\t},`);

		// Properties for each operation
		resource.operations.forEach((op) => {
			if (op.properties && op.properties.length > 0) {
				op.properties.forEach((prop) => {
					lines.push(...generateProperty(prop, 3, ',', {
						resource: [resource.name],
						operation: [op.name],
					}));
				});
			}
		});
	});

	return lines;
}

/**
 * Generate property definition
 */
function generateProperty(
	prop: PropertyDefinition,
	indent: number,
	comma: string,
	additionalDisplayOptions?: Record<string, string[]>,
): string[] {
	const lines: string[] = [];
	const tab = '\t'.repeat(indent);

	lines.push(`${tab}{`);
	lines.push(`${tab}\tdisplayName: '${escapeString(prop.displayName)}',`);
	lines.push(`${tab}\tname: '${prop.name}',`);
	lines.push(`${tab}\ttype: '${prop.type}',`);

	if (prop.default !== undefined) {
		const defaultValue =
			typeof prop.default === 'string' ? `'${escapeString(prop.default)}'` : JSON.stringify(prop.default);
		lines.push(`${tab}\tdefault: ${defaultValue},`);
	}

	if (prop.description) {
		lines.push(`${tab}\tdescription: '${escapeString(prop.description)}',`);
	}

	if (prop.placeholder) {
		lines.push(`${tab}\tplaceholder: '${escapeString(prop.placeholder)}',`);
	}

	if (prop.required) {
		lines.push(`${tab}\trequired: true,`);
	}

	if (prop.options && prop.options.length > 0) {
		lines.push(`${tab}\toptions: [`);
		prop.options.forEach((opt, idx) => {
			const optComma = idx < prop.options!.length - 1 ? ',' : '';
			lines.push(`${tab}\t\t{`);
			lines.push(`${tab}\t\t\tname: '${escapeString(opt.name)}',`);
			const optValue = typeof opt.value === 'string' ? `'${escapeString(opt.value)}'` : opt.value;
			lines.push(`${tab}\t\t\tvalue: ${optValue},`);
			if (opt.description) {
				lines.push(`${tab}\t\t\tdescription: '${escapeString(opt.description)}',`);
			}
			lines.push(`${tab}\t\t}${optComma}`);
		});
		lines.push(`${tab}\t],`);
	}

	if (prop.displayOptions || additionalDisplayOptions) {
		lines.push(`${tab}\tdisplayOptions: {`);
		const displayOpts = { ...prop.displayOptions };

		if (additionalDisplayOptions) {
			displayOpts.show = { ...displayOpts.show, ...additionalDisplayOptions };
		}

		if (displayOpts.show) {
			lines.push(`${tab}\t\tshow: {`);
			Object.entries(displayOpts.show).forEach(([key, values]) => {
				lines.push(`${tab}\t\t\t${key}: ${JSON.stringify(values)},`);
			});
			lines.push(`${tab}\t\t},`);
		}

		if (displayOpts.hide) {
			lines.push(`${tab}\t\thide: {`);
			Object.entries(displayOpts.hide).forEach(([key, values]) => {
				lines.push(`${tab}\t\t\t${key}: ${JSON.stringify(values)},`);
			});
			lines.push(`${tab}\t\t},`);
		}

		lines.push(`${tab}\t},`);
	}

	if (prop.typeOptions) {
		lines.push(`${tab}\ttypeOptions: ${JSON.stringify(prop.typeOptions, null, 2).replace(/\n/g, '\n' + tab + '\t')},`);
	}

	if (prop.routing) {
		lines.push(`${tab}\trouting: ${JSON.stringify(prop.routing, null, 2).replace(/\n/g, '\n' + tab + '\t')},`);
	}

	lines.push(`${tab}}${comma}`);

	return lines;
}

/**
 * Generate webhook method
 */
function generateWebhookMethod(): string[] {
	return [
		`\tasync webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {`,
		`\t\tconst req = this.getRequestObject();`,
		`\t\tconst resp = this.getResponseObject();`,
		`\t\t`,
		`\t\t// Process webhook data`,
		`\t\tconst returnData = {`,
		`\t\t\tworkflowData: [`,
		`\t\t\t\t[`,
		`\t\t\t\t\t{`,
		`\t\t\t\t\t\tjson: req.body,`,
		`\t\t\t\t\t},`,
		`\t\t\t\t],`,
		`\t\t\t],`,
		`\t\t};`,
		`\t\t`,
		`\t\treturn returnData;`,
		`\t}`,
	];
}

/**
 * Generate poll method
 */
function generatePollMethod(): string[] {
	return [
		`\tasync poll(this: IPollFunctions): Promise<INodeExecutionData[][]> {`,
		`\t\t// Implement polling logic`,
		`\t\tconst returnData: INodeExecutionData[] = [];`,
		`\t\t`,
		`\t\t// TODO: Add polling implementation`,
		`\t\t`,
		`\t\treturn [returnData];`,
		`\t}`,
	];
}

/**
 * Generate execute method
 */
function generateExecuteMethod(resources?: ResourceDefinition[]): string[] {
	const lines: string[] = [];

	lines.push(`\tasync execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {`);
	lines.push(`\t\tconst items = this.getInputData();`);
	lines.push(`\t\tconst returnData: INodeExecutionData[] = [];`);
	lines.push(`\t\t`);

	if (resources && resources.length > 0) {
		lines.push(`\t\tconst resource = this.getNodeParameter('resource', 0) as string;`);
		lines.push(`\t\tconst operation = this.getNodeParameter('operation', 0) as string;`);
		lines.push(`\t\t`);
		lines.push(`\t\tfor (let i = 0; i < items.length; i++) {`);
		lines.push(`\t\t\ttry {`);
		lines.push(`\t\t\t\tif (resource === '${resources[0].name}') {`);
		lines.push(`\t\t\t\t\tif (operation === '${resources[0].operations[0].name}') {`);
		lines.push(`\t\t\t\t\t\t// TODO: Implement operation logic`);
		lines.push(`\t\t\t\t\t\treturnData.push({ json: { success: true } });`);
		lines.push(`\t\t\t\t\t}`);
		lines.push(`\t\t\t\t}`);
		lines.push(`\t\t\t} catch (error) {`);
		lines.push(`\t\t\t\tif (this.continueOnFail()) {`);
		lines.push(`\t\t\t\t\treturnData.push({ json: { error: error.message } });`);
		lines.push(`\t\t\t\t\tcontinue;`);
		lines.push(`\t\t\t\t}`);
		lines.push(`\t\t\t\tthrow error;`);
		lines.push(`\t\t\t}`);
		lines.push(`\t\t}`);
	} else {
		lines.push(`\t\t// TODO: Implement execution logic`);
		lines.push(`\t\treturnData.push(...items);`);
	}

	lines.push(`\t\t`);
	lines.push(`\t\treturn [returnData];`);
	lines.push(`\t}`);

	return lines;
}

/**
 * Convert PascalCase to camelCase
 */
function camelCase(str: string): string {
	return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Escape string for TypeScript
 */
function escapeString(str: string): string {
	return str.replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}
