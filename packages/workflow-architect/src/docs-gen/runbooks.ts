import type { Runbook, WorkflowAnalysis } from './types';
import { RunbookSchema } from './types';

/**
 * Runbook Generator
 *
 * Generates operational runbooks for workflows
 */

export class RunbookGenerator {
	/**
	 * Generate runbook from workflow analysis
	 */
	async generate(workflow: WorkflowAnalysis): Promise<Runbook> {
		const runbook: Runbook = {
			id: `runbook-${workflow.workflowId}`,
			title: `${workflow.name} - Operational Runbook`,
			workflowId: workflow.workflowId,
			description: this.generateDescription(workflow),
			prerequisites: this.generatePrerequisites(workflow),
			procedures: this.generateProcedures(workflow),
			troubleshooting: this.generateTroubleshooting(workflow),
			emergencyContacts: this.generateEmergencyContacts(),
			metadata: {
				title: `${workflow.name} - Runbook`,
				version: '1.0.0',
				author: 'Runbook Generator',
				createdAt: new Date(),
				updatedAt: new Date(),
				tags: ['runbook', 'operations', workflow.workflowId],
				workflowId: workflow.workflowId,
			},
		};

		return RunbookSchema.parse(runbook);
	}

	/**
	 * Generate runbook description
	 */
	private generateDescription(workflow: WorkflowAnalysis): string {
		let description = `This runbook provides operational procedures for the ${workflow.name} workflow.\n\n`;

		if (workflow.description) {
			description += `${workflow.description}\n\n`;
		}

		description += `**Complexity Score:** ${workflow.complexity.score.toFixed(2)}\n`;
		description += `**Estimated Execution Time:** ${this.formatDuration(workflow.estimatedExecutionTime || 0)}\n\n`;

		if (workflow.purposes.length > 0) {
			description += '**Purposes:**\n';
			for (const purpose of workflow.purposes) {
				description += `- ${purpose}\n`;
			}
		}

		return description;
	}

	/**
	 * Generate prerequisites
	 */
	private generatePrerequisites(workflow: WorkflowAnalysis): string[] {
		const prerequisites: string[] = [
			'Access to n8n workflow management interface',
			'Appropriate permissions to view and modify workflows',
			'Understanding of the workflow purpose and data flow',
		];

		// Add trigger-specific prerequisites
		for (const triggerId of workflow.triggers) {
			const trigger = workflow.nodes.find((n) => n.id === triggerId);
			if (trigger) {
				if (trigger.type.includes('webhook')) {
					prerequisites.push('Webhook endpoint configured and accessible');
				}
				if (trigger.type.includes('cron') || trigger.type.includes('schedule')) {
					prerequisites.push('Cron schedule configured correctly');
				}
				if (trigger.type.includes('database')) {
					prerequisites.push('Database connection credentials and access');
				}
			}
		}

		// Add data store prerequisites
		for (const node of workflow.nodes) {
			if (node.type.includes('database')) {
				prerequisites.push(`${node.name}: Database connection and credentials`);
			}
			if (node.type.includes('http') || node.type.includes('api')) {
				prerequisites.push(`${node.name}: API credentials and endpoint access`);
			}
		}

		return [...new Set(prerequisites)]; // Remove duplicates
	}

	/**
	 * Generate operational procedures
	 */
	private generateProcedures(workflow: WorkflowAnalysis): Runbook['procedures'] {
		return [
			this.generateDeploymentProcedure(workflow),
			this.generateMonitoringProcedure(workflow),
			this.generateMaintenanceProcedure(workflow),
			this.generateRecoveryProcedure(workflow),
		];
	}

	/**
	 * Generate deployment procedure
	 */
	private generateDeploymentProcedure(workflow: WorkflowAnalysis): Runbook['procedures'][0] {
		return {
			id: 'deployment',
			title: 'Deployment Procedure',
			steps: [
				{
					order: 1,
					description: 'Review workflow configuration and verify all nodes are properly configured',
					expectedResult: 'All nodes show green status with no configuration warnings',
					troubleshooting: 'Check each node configuration and ensure required fields are filled',
				},
				{
					order: 2,
					description: 'Test workflow in development environment',
					command: 'Execute workflow manually with test data',
					expectedResult: 'Workflow completes successfully with expected output',
					troubleshooting: 'Review execution logs and fix any errors in node configuration',
				},
				{
					order: 3,
					description: 'Enable workflow triggers',
					command: 'Activate workflow using the toggle switch',
					expectedResult: 'Workflow status changes to "Active"',
					troubleshooting: 'Ensure triggers are properly configured and accessible',
				},
				{
					order: 4,
					description: 'Monitor initial executions',
					expectedResult: 'Workflow executes successfully on trigger events',
					troubleshooting: 'Check execution history for any failures',
				},
				{
					order: 5,
					description: 'Set up monitoring and alerts',
					expectedResult: 'Monitoring dashboards show workflow metrics',
					troubleshooting: 'Verify monitoring integration is configured correctly',
				},
			],
			rollback: [
				'Deactivate the workflow using the toggle switch',
				'Revert to previous workflow version if available',
				'Notify stakeholders of the rollback',
				'Investigate and fix issues before redeployment',
			],
		};
	}

	/**
	 * Generate monitoring procedure
	 */
	private generateMonitoringProcedure(workflow: WorkflowAnalysis): Runbook['procedures'][0] {
		return {
			id: 'monitoring',
			title: 'Monitoring and Health Checks',
			steps: [
				{
					order: 1,
					description: 'Check workflow execution status',
					command: 'Navigate to workflow executions tab',
					expectedResult: 'Recent executions show success status',
					troubleshooting: 'Investigate any failed or warning executions',
				},
				{
					order: 2,
					description: 'Review execution logs',
					expectedResult: 'No errors or warnings in execution logs',
					troubleshooting: 'Analyze error messages and stack traces',
				},
				{
					order: 3,
					description: 'Monitor execution time',
					expectedResult: `Execution time within expected range (~${this.formatDuration(workflow.estimatedExecutionTime || 0)})`,
					troubleshooting: 'Check for performance bottlenecks in specific nodes',
				},
				{
					order: 4,
					description: 'Verify data integrity',
					expectedResult: 'Output data matches expected format and values',
					troubleshooting: 'Review data transformations and node configurations',
				},
			],
			rollback: [],
		};
	}

	/**
	 * Generate maintenance procedure
	 */
	private generateMaintenanceProcedure(workflow: WorkflowAnalysis): Runbook['procedures'][0] {
		return {
			id: 'maintenance',
			title: 'Regular Maintenance',
			steps: [
				{
					order: 1,
					description: 'Review and update node configurations',
					expectedResult: 'All nodes use latest configuration best practices',
				},
				{
					order: 2,
					description: 'Update API credentials if needed',
					expectedResult: 'All API connections are valid and not expired',
				},
				{
					order: 3,
					description: 'Clean up old execution data',
					command: 'Delete executions older than retention policy',
					expectedResult: 'Execution history within retention limits',
				},
				{
					order: 4,
					description: 'Review and optimize workflow performance',
					expectedResult: 'Workflow maintains acceptable execution time',
				},
				{
					order: 5,
					description: 'Update documentation',
					expectedResult: 'Runbook and documentation reflect current state',
				},
			],
			rollback: [],
		};
	}

	/**
	 * Generate recovery procedure
	 */
	private generateRecoveryProcedure(workflow: WorkflowAnalysis): Runbook['procedures'][0] {
		return {
			id: 'recovery',
			title: 'Disaster Recovery',
			steps: [
				{
					order: 1,
					description: 'Identify the failure point',
					expectedResult: 'Root cause of failure identified',
				},
				{
					order: 2,
					description: 'Stop the workflow to prevent further issues',
					command: 'Deactivate workflow',
					expectedResult: 'Workflow is deactivated',
				},
				{
					order: 3,
					description: 'Restore from backup if necessary',
					command: 'Import workflow from backup file',
					expectedResult: 'Workflow restored to last known good state',
				},
				{
					order: 4,
					description: 'Fix the identified issue',
					expectedResult: 'Issue resolved and workflow passes tests',
				},
				{
					order: 5,
					description: 'Reactivate workflow and monitor',
					expectedResult: 'Workflow returns to normal operation',
				},
			],
			rollback: [
				'Keep workflow deactivated',
				'Engage emergency contacts for assistance',
				'Document the incident for post-mortem analysis',
			],
		};
	}

	/**
	 * Generate troubleshooting guide
	 */
	private generateTroubleshooting(workflow: WorkflowAnalysis): Runbook['troubleshooting'] {
		const issues: Runbook['troubleshooting'] = [
			{
				issue: 'Workflow fails to start',
				symptoms: [
					'Workflow remains in inactive state',
					'Trigger events are not processed',
					'Error message on activation',
				],
				diagnosis: 'Check trigger configuration and ensure all required credentials are valid',
				resolution: [
					'Verify trigger node configuration',
					'Check webhook URLs are accessible',
					'Validate API credentials',
					'Review workflow execution permissions',
				],
				preventiveMeasures: [
					'Set up monitoring alerts for activation failures',
					'Regularly test trigger configurations',
					'Maintain backup workflows',
				],
			},
			{
				issue: 'Execution fails at specific node',
				symptoms: ['Node shows error status', 'Execution stops at failed node', 'Error in logs'],
				diagnosis: 'Review node configuration and input data format',
				resolution: [
					'Check node parameters and credentials',
					'Verify input data format matches expected schema',
					'Review API endpoint availability',
					'Check network connectivity',
				],
				preventiveMeasures: [
					'Add error handling nodes',
					'Implement retry logic',
					'Validate input data before processing',
				],
			},
			{
				issue: 'Slow execution time',
				symptoms: [
					`Execution time exceeds ${this.formatDuration(workflow.estimatedExecutionTime || 0)}`,
					'Timeout errors',
					'Resource exhaustion',
				],
				diagnosis: 'Identify performance bottlenecks in workflow',
				resolution: [
					'Optimize database queries',
					'Reduce data processing batch sizes',
					'Add caching where appropriate',
					'Parallelize independent operations',
				],
				preventiveMeasures: [
					'Monitor execution time trends',
					'Set up performance alerts',
					'Regular performance reviews',
				],
			},
			{
				issue: 'Incorrect output data',
				symptoms: ['Data format mismatch', 'Missing fields', 'Incorrect values'],
				diagnosis: 'Review data transformations and mappings',
				resolution: [
					'Check data mapping configurations',
					'Verify transformation logic',
					'Review node execution order',
					'Test with sample data',
				],
				preventiveMeasures: [
					'Add data validation nodes',
					'Implement data quality checks',
					'Maintain test cases',
				],
			},
		];

		// Add pattern-specific troubleshooting
		for (const pattern of workflow.patterns) {
			if (pattern.type === 'Error Handling') {
				issues.push({
					issue: 'Error handling not working',
					symptoms: ['Errors not caught by error handlers', 'Workflow stops on errors'],
					diagnosis: 'Review error handling configuration',
					resolution: [
						'Check error trigger configuration',
						'Verify error handling node placement',
						'Review error condition logic',
					],
					preventiveMeasures: ['Test error scenarios', 'Document error handling flows'],
				});
			}
		}

		return issues;
	}

	/**
	 * Generate emergency contacts
	 */
	private generateEmergencyContacts(): Runbook['emergencyContacts'] {
		return [
			{
				name: 'On-Call Engineer',
				role: 'Primary Support',
				email: 'oncall@example.com',
				phone: '+1-555-0100',
				availability: '24/7',
			},
			{
				name: 'Workflow Owner',
				role: 'Workflow Maintainer',
				email: 'workflow-owner@example.com',
				availability: 'Business hours',
			},
			{
				name: 'Engineering Manager',
				role: 'Escalation Point',
				email: 'eng-manager@example.com',
				availability: 'Business hours',
			},
		];
	}

	/**
	 * Format duration in milliseconds to human-readable string
	 */
	private formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
		if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`;
		return `${(ms / 3600000).toFixed(2)}h`;
	}

	/**
	 * Export runbook to different formats
	 */
	async export(runbook: Runbook, format: 'markdown' | 'json' | 'pdf'): Promise<string | Buffer> {
		switch (format) {
			case 'markdown':
				return this.exportToMarkdown(runbook);
			case 'json':
				return JSON.stringify(runbook, null, 2);
			case 'pdf':
				// Would integrate with PDF generator
				return this.exportToMarkdown(runbook);
			default:
				throw new Error(`Unsupported format: ${format}`);
		}
	}

	/**
	 * Export runbook to Markdown
	 */
	private exportToMarkdown(runbook: Runbook): string {
		const lines: string[] = [];

		lines.push(`# ${runbook.title}`);
		lines.push('');
		lines.push(runbook.description);
		lines.push('');

		// Prerequisites
		lines.push('## Prerequisites');
		lines.push('');
		for (const prereq of runbook.prerequisites) {
			lines.push(`- ${prereq}`);
		}
		lines.push('');

		// Procedures
		lines.push('## Operational Procedures');
		lines.push('');

		for (const procedure of runbook.procedures) {
			lines.push(`### ${procedure.title}`);
			lines.push('');

			for (const step of procedure.steps) {
				lines.push(`#### Step ${step.order}: ${step.description}`);
				lines.push('');

				if (step.command) {
					lines.push(`**Command:** \`${step.command}\``);
					lines.push('');
				}

				if (step.expectedResult) {
					lines.push(`**Expected Result:** ${step.expectedResult}`);
					lines.push('');
				}

				if (step.troubleshooting) {
					lines.push(`**Troubleshooting:** ${step.troubleshooting}`);
					lines.push('');
				}
			}

			if (procedure.rollback.length > 0) {
				lines.push('**Rollback Steps:**');
				lines.push('');
				for (const rollbackStep of procedure.rollback) {
					lines.push(`- ${rollbackStep}`);
				}
				lines.push('');
			}
		}

		// Troubleshooting
		lines.push('## Troubleshooting Guide');
		lines.push('');

		for (const issue of runbook.troubleshooting) {
			lines.push(`### ${issue.issue}`);
			lines.push('');

			lines.push('**Symptoms:**');
			for (const symptom of issue.symptoms) {
				lines.push(`- ${symptom}`);
			}
			lines.push('');

			lines.push(`**Diagnosis:** ${issue.diagnosis}`);
			lines.push('');

			lines.push('**Resolution:**');
			for (const step of issue.resolution) {
				lines.push(`- ${step}`);
			}
			lines.push('');

			if (issue.preventiveMeasures.length > 0) {
				lines.push('**Preventive Measures:**');
				for (const measure of issue.preventiveMeasures) {
					lines.push(`- ${measure}`);
				}
				lines.push('');
			}
		}

		// Emergency Contacts
		lines.push('## Emergency Contacts');
		lines.push('');

		for (const contact of runbook.emergencyContacts) {
			lines.push(`### ${contact.name} - ${contact.role}`);
			if (contact.email) lines.push(`- Email: ${contact.email}`);
			if (contact.phone) lines.push(`- Phone: ${contact.phone}`);
			if (contact.availability) lines.push(`- Availability: ${contact.availability}`);
			lines.push('');
		}

		return lines.join('\n');
	}
}
