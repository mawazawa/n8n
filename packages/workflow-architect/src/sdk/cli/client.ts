/**
 * CLI client for Workflow Architect
 * Interactive command-line interface for managing workflows
 */

import { WorkflowArchitectClient } from '../typescript/client.js';
import type { SDKConfig } from '../types.js';

interface CLIConfig extends SDKConfig {
	configFile?: string;
	interactive?: boolean;
}

/**
 * CLI client with interactive mode
 * Integration: const cli = new WorkflowArchitectCLI(config); await cli.run();
 */
export class WorkflowArchitectCLI {
	private client: WorkflowArchitectClient;

	constructor(private config: CLIConfig) {
		this.client = new WorkflowArchitectClient(config);
	}

	async run(args: string[]): Promise<void> {
		const [command, ...params] = args;

		switch (command) {
			case 'workflow':
				await this.handleWorkflowCommand(params);
				break;
			case 'execution':
				await this.handleExecutionCommand(params);
				break;
			case 'template':
				await this.handleTemplateCommand(params);
				break;
			default:
				this.printHelp();
		}
	}

	private async handleWorkflowCommand(params: string[]): Promise<void> {
		const [action, ...args] = params;

		switch (action) {
			case 'list':
				const workflows = await this.client.workflows.list();
				console.log(JSON.stringify(workflows, null, 2));
				break;
			case 'get':
				const workflow = await this.client.workflows.get(args[0]);
				console.log(JSON.stringify(workflow, null, 2));
				break;
			case 'delete':
				await this.client.workflows.delete(args[0]);
				console.log('Workflow deleted successfully');
				break;
			default:
				console.log('Unknown workflow action:', action);
		}
	}

	private async handleExecutionCommand(params: string[]): Promise<void> {
		const [action, ...args] = params;

		switch (action) {
			case 'get':
				const execution = await this.client.executions.get(args[0]);
				console.log(JSON.stringify(execution, null, 2));
				break;
			case 'cancel':
				await this.client.executions.cancel(args[0]);
				console.log('Execution cancelled');
				break;
			default:
				console.log('Unknown execution action:', action);
		}
	}

	private async handleTemplateCommand(params: string[]): Promise<void> {
		const [action] = params;

		switch (action) {
			case 'list':
				const templates = await this.client.templates.list();
				console.log(JSON.stringify(templates, null, 2));
				break;
			default:
				console.log('Unknown template action:', action);
		}
	}

	private printHelp(): void {
		console.log(`
Workflow Architect CLI

Usage:
  workflow-architect <command> [options]

Commands:
  workflow list              List all workflows
  workflow get <id>          Get workflow by ID
  workflow delete <id>       Delete workflow
  execution get <id>         Get execution details
  execution cancel <id>      Cancel execution
  template list              List all templates

Options:
  --config <file>            Config file path
  --api-key <key>            API key for authentication
		`);
	}
}
