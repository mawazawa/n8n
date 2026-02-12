/**
 * Configurator Agent Integration Test
 * Verifies all 10 tasks of Action 3 are working together
 */

import { describe, it, expect } from 'vitest';
import type { WorkflowDefinition } from '../../src/types/workflow';
import type { AvailableCredential } from '../../src/tools/assign-credentials.tool';

// Task 3.1: Import prompt template
import {
  CONFIGURATOR_SYSTEM_PROMPT,
  CONFIGURATOR_TASK_PROMPT,
  formatConfiguratorPrompt,
  getNodeParameterReference,
} from '../../src/graph/agents/configurator.prompt';

// Task 3.2: Import update params tool
import { createUpdateParamsTool, updateNodeParameters } from '../../src/tools/update-params.tool';

// Task 3.3: Import get params tool
import { createGetParamsTool, getNodeParameters } from '../../src/tools/get-params.tool';

// Task 3.4: Import assign credentials tool
import { createAssignCredentialsTool, assignCredentials } from '../../src/tools/assign-credentials.tool';

// Task 3.5: Import configurator agent
import { createConfiguratorAgent, configureWorkflowDefaults } from '../../src/graph/agents/configurator';

// Task 3.6: Import credential type detection
import {
  getCredentialTypesForNode,
  nodeRequiresCredentials,
  findMatchingCredentials,
  suggestCredential,
} from '../../src/n8n/credentials';

// Task 3.8: Import validation
import {
  validateNodeParameters,
  validateWorkflow,
  isWorkflowReady,
} from '../../src/tools/validate-params';

describe('Configurator Agent - Full Integration', () => {
  // Test workflow
  const workflow: WorkflowDefinition = {
    name: 'Integration Test Workflow',
    active: false,
    nodes: [
      {
        id: 'webhook_1',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 1,
        position: [250, 300],
        parameters: {},
      },
      {
        id: 'slack_1',
        name: 'Slack',
        type: 'n8n-nodes-base.slack',
        typeVersion: 2,
        position: [450, 300],
        parameters: {},
      },
      {
        id: 'openai_1',
        name: 'OpenAI',
        type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
        typeVersion: 1,
        position: [650, 300],
        parameters: {},
      },
    ],
    connections: {
      Webhook: {
        main: [[{ node: 'Slack', type: 'main', index: 0 }]],
      },
      Slack: {
        main: [[{ node: 'OpenAI', type: 'main', index: 0 }]],
      },
    },
  };

  const credentials: AvailableCredential[] = [
    { id: '1', name: 'Slack Bot', type: 'slackOAuth2Api', createdAt: '2024-01-01' },
    { id: '2', name: 'OpenAI Key', type: 'openAiApi', createdAt: '2024-01-02' },
  ];

  describe('Task 3.1: Configurator Prompt Template', () => {
    it('should have system prompt defined', () => {
      expect(CONFIGURATOR_SYSTEM_PROMPT).toBeDefined();
      expect(CONFIGURATOR_SYSTEM_PROMPT).toContain('Configurator Agent');
      expect(CONFIGURATOR_SYSTEM_PROMPT).toContain('get_node_parameters');
      expect(CONFIGURATOR_SYSTEM_PROMPT).toContain('update_node_parameters');
      expect(CONFIGURATOR_SYSTEM_PROMPT).toContain('assign_credentials');
    });

    it('should have task prompt template', () => {
      expect(CONFIGURATOR_TASK_PROMPT).toBeDefined();
      expect(CONFIGURATOR_TASK_PROMPT).toContain('{workflow_json}');
      expect(CONFIGURATOR_TASK_PROMPT).toContain('{nodes_to_configure}');
      expect(CONFIGURATOR_TASK_PROMPT).toContain('{available_credentials}');
    });

    it('should format prompt with variables', () => {
      const formatted = formatConfiguratorPrompt({
        workflow_json: '{"nodes":[]}',
        nodes_to_configure: 'Node1, Node2',
        user_requirements: 'Test requirements',
        available_credentials: 'Cred1, Cred2',
      });

      expect(formatted).toContain('{"nodes":[]}');
      expect(formatted).toContain('Node1, Node2');
      expect(formatted).toContain('Test requirements');
      expect(formatted).toContain('Cred1, Cred2');
    });

    it('should get node parameter reference', () => {
      const ref = getNodeParameterReference('n8n-nodes-base.slack');
      expect(ref).not.toBeNull();
      expect(ref!.parameters).toContain('resource');
      expect(ref!.credentials).toContain('slackApi');
    });
  });

  describe('Task 3.2: Update Node Parameters Tool', () => {
    it('should update node parameters', () => {
      const testWorkflow = JSON.parse(JSON.stringify(workflow));
      const result = updateNodeParameters(testWorkflow, {
        node_name: 'Slack',
        parameters: { resource: 'message', operation: 'post', channel: '#test' },
      });

      expect(result.success).toBe(true);
      expect(result.updated_parameters).toEqual(['resource', 'operation', 'channel']);

      const node = testWorkflow.nodes.find((n) => n.name === 'Slack');
      expect(node?.parameters?.resource).toBe('message');
    });

    it('should create tool for LangGraph', () => {
      const tool = createUpdateParamsTool(
        () => workflow,
        () => {},
      );

      expect(tool.name).toBe('update_node_parameters');
      expect(tool.description).toBeDefined();
    });
  });

  describe('Task 3.3: Get Node Parameters Tool', () => {
    it('should get node parameters', () => {
      const result = getNodeParameters(workflow, {
        node_name: 'Slack',
        include_reference: true,
      });

      expect(result).not.toBeNull();
      expect(result!.node_name).toBe('Slack');
      expect(result!.node_type).toBe('n8n-nodes-base.slack');
      expect(result!.available_parameters).toBeDefined();
      expect(result!.required_credentials).toBeDefined();
    });

    it('should create tool for LangGraph', () => {
      const tool = createGetParamsTool(() => workflow);

      expect(tool.name).toBe('get_node_parameters');
      expect(tool.description).toBeDefined();
    });
  });

  describe('Task 3.4: Assign Credentials Tool', () => {
    it('should assign credentials to node', () => {
      const testWorkflow = JSON.parse(JSON.stringify(workflow));
      const result = assignCredentials(
        testWorkflow,
        {
          node_name: 'Slack',
          credential_type: 'slackOAuth2Api',
          credential_name: 'Slack Bot',
        },
        credentials,
      );

      expect(result.success).toBe(true);

      const node = testWorkflow.nodes.find((n) => n.name === 'Slack') as typeof testWorkflow.nodes[0] & {
        credentials?: Record<string, { id: string; name: string }>;
      };
      expect(node.credentials).toBeDefined();
      expect(node.credentials!.slackOAuth2Api.name).toBe('Slack Bot');
    });

    it('should create tool for LangGraph', async () => {
      const tool = createAssignCredentialsTool(
        () => workflow,
        () => {},
        async () => credentials,
      );

      expect(tool.name).toBe('assign_credentials');
      expect(tool.description).toBeDefined();
    });
  });

  describe('Task 3.5: Configurator Agent', () => {
    it('should create configurator agent function', () => {
      const agent = createConfiguratorAgent(async () => credentials);
      expect(agent).toBeDefined();
      expect(typeof agent).toBe('function');
    });

    it('should configure workflow defaults', async () => {
      const testWorkflow = JSON.parse(JSON.stringify(workflow));
      const configured = await configureWorkflowDefaults(testWorkflow, credentials);

      expect(configured).toBeDefined();
      expect(configured.nodes).toHaveLength(3);
    });
  });

  describe('Task 3.6: Credential Type Detection', () => {
    it('should detect credential types for node', () => {
      const types = getCredentialTypesForNode('n8n-nodes-base.slack');
      expect(types).toContain('slackApi');
      expect(types).toContain('slackOAuth2Api');
    });

    it('should check if node requires credentials', () => {
      expect(nodeRequiresCredentials('n8n-nodes-base.slack')).toBe(true);
      expect(nodeRequiresCredentials('n8n-nodes-base.webhook')).toBe(false);
    });

    it('should find matching credentials', () => {
      const matching = findMatchingCredentials('n8n-nodes-base.slack', credentials);
      expect(matching).toHaveLength(1);
      expect(matching[0].name).toBe('Slack Bot');
    });

    it('should suggest best credential', () => {
      const suggestion = suggestCredential('n8n-nodes-base.slack', credentials);
      expect(suggestion).not.toBeNull();
      expect(suggestion!.type).toBe('slackOAuth2Api');
    });
  });

  describe('Task 3.7: Integration into Main Graph', () => {
    it('should be importable from graph index', async () => {
      // This verifies the integration by importing
      const { createWorkflowArchitect } = await import('../../src/graph/index');
      expect(createWorkflowArchitect).toBeDefined();
    });
  });

  describe('Task 3.8: Parameter Validation', () => {
    it('should validate node parameters', () => {
      const result = validateNodeParameters(workflow, 'Slack');
      expect(result.node_name).toBe('Slack');
      expect(result.node_type).toBe('n8n-nodes-base.slack');
    });

    it('should validate entire workflow', () => {
      const results = validateWorkflow(workflow);
      expect(results).toHaveLength(3);
    });

    it('should check workflow readiness', () => {
      const result = isWorkflowReady(workflow);
      expect(result).toBeDefined();
      expect(typeof result.ready).toBe('boolean');
      expect(Array.isArray(result.blockers)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe('Full Configuration Flow', () => {
    it('should complete full configuration cycle', async () => {
      const testWorkflow = JSON.parse(JSON.stringify(workflow));

      // Step 1: Get node parameters
      const slackParams = getNodeParameters(testWorkflow, {
        node_name: 'Slack',
        include_reference: true,
      });
      expect(slackParams).not.toBeNull();

      // Step 2: Update parameters
      const updateResult = updateNodeParameters(testWorkflow, {
        node_name: 'Slack',
        parameters: {
          resource: 'message',
          operation: 'post',
          channel: '#general',
          text: 'Test message',
        },
      });
      expect(updateResult.success).toBe(true);

      // Step 3: Assign credentials
      const credResult = assignCredentials(
        testWorkflow,
        {
          node_name: 'Slack',
          credential_type: 'slackOAuth2Api',
          credential_name: 'Slack Bot',
        },
        credentials,
      );
      expect(credResult.success).toBe(true);

      // Step 4: Validate
      const validation = validateNodeParameters(testWorkflow, 'Slack');
      expect(validation.node_type).toBe('n8n-nodes-base.slack');

      // Step 5: Check readiness
      const readiness = isWorkflowReady(testWorkflow);
      expect(readiness).toBeDefined();
    });
  });
});
