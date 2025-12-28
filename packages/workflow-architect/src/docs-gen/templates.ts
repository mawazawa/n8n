import type { Template, Section, TemplateVariable, ConditionalSection } from './types';
import { TemplateSchema, SectionType, TemplateType } from './types';

/**
 * Template Manager
 *
 * Manages documentation templates with support for built-in and custom templates
 */

export class TemplateManager {
	private templates: Map<string, Template> = new Map();

	constructor() {
		this.registerBuiltInTemplates();
	}

	/**
	 * Register all built-in templates
	 */
	private registerBuiltInTemplates(): void {
		this.registerTemplate(this.createTechnicalTemplate());
		this.registerTemplate(this.createUserGuideTemplate());
		this.registerTemplate(this.createRunbookTemplate());
		this.registerTemplate(this.createAPIReferenceTemplate());
		this.registerTemplate(this.createChangelogTemplate());
		this.registerTemplate(this.createTutorialTemplate());
	}

	/**
	 * Register a custom template
	 */
	registerTemplate(template: Template): void {
		const validated = TemplateSchema.parse(template);
		this.templates.set(validated.id, validated);
	}

	/**
	 * Get a template by ID
	 */
	getTemplate(id: string): Template | undefined {
		return this.templates.get(id);
	}

	/**
	 * List all available templates
	 */
	listTemplates(): Template[] {
		return Array.from(this.templates.values());
	}

	/**
	 * Delete a custom template
	 */
	deleteTemplate(id: string): boolean {
		return this.templates.delete(id);
	}

	/**
	 * Evaluate conditional sections based on variables
	 */
	evaluateConditionals(
		conditionals: ConditionalSection[],
		variables: Record<string, unknown>,
	): string[] {
		const activeSections: string[] = [];

		for (const conditional of conditionals) {
			if (this.evaluateCondition(conditional.condition, variables)) {
				activeSections.push(conditional.sectionId);
			} else if (conditional.elseSection) {
				activeSections.push(conditional.elseSection);
			}
		}

		return activeSections;
	}

	/**
	 * Evaluate a condition expression
	 */
	private evaluateCondition(condition: string, variables: Record<string, unknown>): boolean {
		try {
			// Simple expression evaluator
			// Supports: variable == value, variable != value, variable > value, etc.
			const operators = ['==', '!=', '>', '<', '>=', '<='];

			for (const op of operators) {
				if (condition.includes(op)) {
					const [left, right] = condition.split(op).map((s) => s.trim());
					const leftValue = this.resolveVariable(left, variables);
					const rightValue = this.resolveVariable(right, variables);

					switch (op) {
						case '==':
							return leftValue === rightValue;
						case '!=':
							return leftValue !== rightValue;
						case '>':
							return Number(leftValue) > Number(rightValue);
						case '<':
							return Number(leftValue) < Number(rightValue);
						case '>=':
							return Number(leftValue) >= Number(rightValue);
						case '<=':
							return Number(leftValue) <= Number(rightValue);
					}
				}
			}

			// If no operator, treat as boolean variable
			return Boolean(this.resolveVariable(condition, variables));
		} catch {
			return false;
		}
	}

	/**
	 * Resolve a variable reference
	 */
	private resolveVariable(ref: string, variables: Record<string, unknown>): unknown {
		// Remove quotes if present
		if ((ref.startsWith('"') && ref.endsWith('"')) || (ref.startsWith("'") && ref.endsWith("'"))) {
			return ref.slice(1, -1);
		}

		// Check if it's a number
		if (!isNaN(Number(ref))) {
			return Number(ref);
		}

		// Resolve from variables
		return variables[ref];
	}

	/**
	 * Substitute template variables in content
	 */
	substituteVariables(content: string, variables: Record<string, unknown>): string {
		let result = content;

		// Replace {{variable}} syntax
		const regex = /\{\{([^}]+)\}\}/g;
		result = result.replace(regex, (match, varName) => {
			const value = variables[varName.trim()];
			return value !== undefined ? String(value) : match;
		});

		return result;
	}

	// ============================================================================
	// Built-in Templates
	// ============================================================================

	private createTechnicalTemplate(): Template {
		return {
			id: 'technical',
			name: 'Technical Documentation',
			type: TemplateType.TECHNICAL,
			description: 'Comprehensive technical documentation for workflows',
			variables: [
				{
					name: 'workflowName',
					type: 'string',
					description: 'Name of the workflow',
					required: true,
				},
				{
					name: 'version',
					type: 'string',
					description: 'Version of the workflow',
					required: true,
				},
				{
					name: 'author',
					type: 'string',
					description: 'Author of the workflow',
					required: false,
				},
			],
			sections: [
				{
					id: 'overview',
					type: SectionType.OVERVIEW,
					title: 'Overview',
					content: `# {{workflowName}}

**Version:** {{version}}
**Author:** {{author}}

## Purpose

This document provides technical documentation for the {{workflowName}} workflow.

## Architecture

The workflow is designed to process data through a series of connected nodes, each performing specific operations.`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 1,
				},
				{
					id: 'configuration',
					type: SectionType.CONFIGURATION,
					title: 'Configuration',
					content: `## Configuration

### Environment Variables

List of required environment variables and their purposes.

### Node Configuration

Detailed configuration for each node in the workflow.`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 2,
				},
				{
					id: 'usage',
					type: SectionType.USAGE,
					title: 'Usage',
					content: `## Usage

### Triggering the Workflow

Instructions on how to trigger and execute the workflow.

### Expected Inputs

Description of input data format and requirements.

### Expected Outputs

Description of output data format and structure.`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 3,
				},
				{
					id: 'troubleshooting',
					type: SectionType.TROUBLESHOOTING,
					title: 'Troubleshooting',
					content: `## Troubleshooting

### Common Issues

Solutions to frequently encountered problems.

### Debugging

Steps to debug workflow execution issues.`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 4,
				},
			],
			conditionalSections: [],
			metadata: {},
		};
	}

	private createUserGuideTemplate(): Template {
		return {
			id: 'user-guide',
			name: 'User Guide',
			type: TemplateType.USER_GUIDE,
			description: 'User-friendly guide for end users',
			variables: [
				{
					name: 'workflowName',
					type: 'string',
					description: 'Name of the workflow',
					required: true,
				},
			],
			sections: [
				{
					id: 'introduction',
					type: SectionType.OVERVIEW,
					title: 'Introduction',
					content: `# {{workflowName}} - User Guide

Welcome to the {{workflowName}} user guide. This document will help you understand and use the workflow effectively.

## What Does This Workflow Do?

A simple explanation of the workflow's purpose and benefits.`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 1,
				},
				{
					id: 'getting-started',
					type: SectionType.PREREQUISITES,
					title: 'Getting Started',
					content: `## Getting Started

### Prerequisites

What you need before using this workflow.

### Setup

Step-by-step setup instructions.`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 2,
				},
				{
					id: 'how-to-use',
					type: SectionType.USAGE,
					title: 'How to Use',
					content: `## How to Use

### Step-by-Step Instructions

1. First step
2. Second step
3. Third step

### Tips and Best Practices

Helpful tips for optimal usage.`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 3,
				},
				{
					id: 'faq',
					type: SectionType.FAQ,
					title: 'FAQ',
					content: `## Frequently Asked Questions

### Q: Common question?
A: Answer to common question.`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 4,
				},
			],
			conditionalSections: [],
			metadata: {},
		};
	}

	private createRunbookTemplate(): Template {
		return {
			id: 'runbook',
			name: 'Operational Runbook',
			type: TemplateType.RUNBOOK,
			description: 'Operational procedures and troubleshooting',
			variables: [
				{
					name: 'workflowName',
					type: 'string',
					description: 'Name of the workflow',
					required: true,
				},
				{
					name: 'team',
					type: 'string',
					description: 'Responsible team',
					required: false,
				},
			],
			sections: [
				{
					id: 'overview',
					type: SectionType.OVERVIEW,
					title: 'Runbook Overview',
					content: `# {{workflowName}} Runbook

**Responsible Team:** {{team}}

## Scope

This runbook covers operational procedures for the {{workflowName}} workflow.`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 1,
				},
				{
					id: 'procedures',
					type: SectionType.DEPLOYMENT,
					title: 'Standard Procedures',
					content: `## Standard Operating Procedures

### Deployment

Steps for deploying the workflow to production.

### Monitoring

How to monitor workflow health and performance.

### Maintenance

Regular maintenance tasks and schedule.`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 2,
				},
				{
					id: 'troubleshooting',
					type: SectionType.TROUBLESHOOTING,
					title: 'Troubleshooting Guide',
					content: `## Troubleshooting

### Issue: Workflow fails to start

**Symptoms:**
- Error messages
- Indicators

**Diagnosis:**
- Check logs
- Verify configuration

**Resolution:**
- Step-by-step fix`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 3,
				},
				{
					id: 'emergency',
					type: SectionType.CUSTOM,
					title: 'Emergency Contacts',
					content: `## Emergency Contacts

### On-Call Engineer
- Name: [Name]
- Email: [email]
- Phone: [phone]

### Escalation Path
1. Team Lead
2. Engineering Manager
3. VP Engineering`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 4,
				},
			],
			conditionalSections: [],
			metadata: {},
		};
	}

	private createAPIReferenceTemplate(): Template {
		return {
			id: 'api-reference',
			name: 'API Reference',
			type: TemplateType.API_REFERENCE,
			description: 'API endpoint documentation',
			variables: [
				{
					name: 'apiName',
					type: 'string',
					description: 'Name of the API',
					required: true,
				},
				{
					name: 'baseUrl',
					type: 'string',
					description: 'Base URL of the API',
					required: true,
				},
			],
			sections: [
				{
					id: 'introduction',
					type: SectionType.OVERVIEW,
					title: 'API Introduction',
					content: `# {{apiName}} API Reference

**Base URL:** \`{{baseUrl}}\`

## Overview

This API provides programmatic access to {{apiName}} functionality.`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 1,
				},
				{
					id: 'authentication',
					type: SectionType.SECURITY,
					title: 'Authentication',
					content: `## Authentication

### API Keys

How to obtain and use API keys.

### OAuth 2.0

OAuth 2.0 authentication flow.`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 2,
				},
				{
					id: 'endpoints',
					type: SectionType.API_REFERENCE,
					title: 'Endpoints',
					content: `## API Endpoints

Detailed documentation for all available endpoints.`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 3,
				},
				{
					id: 'errors',
					type: SectionType.TROUBLESHOOTING,
					title: 'Error Codes',
					content: `## Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| 400  | Bad Request | Check request format |
| 401  | Unauthorized | Verify authentication |
| 404  | Not Found | Check endpoint URL |
| 500  | Server Error | Contact support |`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 4,
				},
			],
			conditionalSections: [],
			metadata: {},
		};
	}

	private createChangelogTemplate(): Template {
		return {
			id: 'changelog',
			name: 'Changelog',
			type: TemplateType.CHANGELOG,
			description: 'Version history and changes',
			variables: [
				{
					name: 'projectName',
					type: 'string',
					description: 'Name of the project',
					required: true,
				},
			],
			sections: [
				{
					id: 'header',
					type: SectionType.OVERVIEW,
					title: 'Changelog',
					content: `# {{projectName}} Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 1,
				},
			],
			conditionalSections: [],
			metadata: {},
		};
	}

	private createTutorialTemplate(): Template {
		return {
			id: 'tutorial',
			name: 'Tutorial',
			type: TemplateType.TUTORIAL,
			description: 'Step-by-step tutorial',
			variables: [
				{
					name: 'tutorialName',
					type: 'string',
					description: 'Name of the tutorial',
					required: true,
				},
				{
					name: 'difficulty',
					type: 'string',
					description: 'Difficulty level',
					defaultValue: 'Beginner',
				},
			],
			sections: [
				{
					id: 'introduction',
					type: SectionType.OVERVIEW,
					title: 'Introduction',
					content: `# {{tutorialName}}

**Difficulty:** {{difficulty}}

## What You'll Learn

In this tutorial, you'll learn how to...`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 1,
				},
				{
					id: 'prerequisites',
					type: SectionType.PREREQUISITES,
					title: 'Prerequisites',
					content: `## Prerequisites

Before starting this tutorial, you should have:

- Required knowledge
- Required tools
- Required access`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 2,
				},
				{
					id: 'steps',
					type: SectionType.USAGE,
					title: 'Tutorial Steps',
					content: `## Steps

### Step 1: Setup

Instructions for the first step.

### Step 2: Implementation

Instructions for the second step.

### Step 3: Testing

Instructions for testing.`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 3,
				},
				{
					id: 'conclusion',
					type: SectionType.CUSTOM,
					title: 'Conclusion',
					content: `## Conclusion

Congratulations! You've completed this tutorial.

### Next Steps

- Additional resources
- Related tutorials
- Further reading`,
					subsections: [],
					examples: [],
					diagrams: [],
					metadata: {},
					order: 4,
				},
			],
			conditionalSections: [],
			metadata: {},
		};
	}
}
