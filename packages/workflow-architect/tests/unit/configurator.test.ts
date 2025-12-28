import { describe, it, expect } from 'vitest';
import { updateNodeParameters } from '../../src/tools/update-params.tool';
import { getNodeParameters, getAllNodesStatus } from '../../src/tools/get-params.tool';
import {
  validateNodeParameters,
  validateWorkflow,
  isWorkflowReady,
} from '../../src/tools/validate-params';
import type { WorkflowDefinition } from '../../src/types/workflow';

// Test workflow fixture
const testWorkflow: WorkflowDefinition = {
  name: 'Test Workflow',
  active: true,
  nodes: [
    {
      id: 'webhook_1',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 1,
      position: [250, 300],
      parameters: {
        httpMethod: 'POST',
        path: 'test-webhook',
      },
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
      id: 'http_1',
      name: 'HTTP Request',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4,
      position: [650, 300],
      parameters: {
        method: 'GET',
        url: 'https://api.example.com/data',
      },
    },
  ],
  connections: {
    Webhook: {
      main: [[{ node: 'Slack', type: 'main', index: 0 }]],
    },
    Slack: {
      main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]],
    },
  },
};

describe('Update Node Parameters', () => {
  it('should update parameters for an existing node', () => {
    const workflow = JSON.parse(JSON.stringify(testWorkflow)) as WorkflowDefinition;

    const result = updateNodeParameters(workflow, {
      node_name: 'Slack',
      parameters: {
        resource: 'message',
        operation: 'post',
        channel: '#general',
        text: 'Hello from n8n!',
      },
    });

    expect(result.success).toBe(true);
    expect(result.node_name).toBe('Slack');
    expect(result.updated_parameters).toContain('resource');
    expect(result.updated_parameters).toContain('operation');

    // Verify workflow was updated
    const slackNode = workflow.nodes.find((n) => n.name === 'Slack');
    expect(slackNode?.parameters?.resource).toBe('message');
    expect(slackNode?.parameters?.operation).toBe('post');
    expect(slackNode?.parameters?.channel).toBe('#general');
  });

  it('should fail for non-existent node', () => {
    const workflow = JSON.parse(JSON.stringify(testWorkflow)) as WorkflowDefinition;

    const result = updateNodeParameters(workflow, {
      node_name: 'NonExistent',
      parameters: { foo: 'bar' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should initialize parameters if not present', () => {
    const workflow: WorkflowDefinition = {
      name: 'Test',
      active: true,
      nodes: [
        {
          id: 'node_1',
          name: 'Test Node',
          type: 'n8n-nodes-base.code',
          typeVersion: 1,
          position: [250, 300],
          // No parameters property
        },
      ],
      connections: {},
    };

    const result = updateNodeParameters(workflow, {
      node_name: 'Test Node',
      parameters: { jsCode: 'return items;' },
    });

    expect(result.success).toBe(true);
    expect(workflow.nodes[0].parameters).toBeDefined();
    expect(workflow.nodes[0].parameters?.jsCode).toBe('return items;');
  });
});

describe('Get Node Parameters', () => {
  it('should return current parameters for a node', () => {
    const result = getNodeParameters(testWorkflow, {
      node_name: 'HTTP Request',
      include_reference: true,
    });

    expect(result).not.toBeNull();
    expect(result!.node_name).toBe('HTTP Request');
    expect(result!.node_type).toBe('n8n-nodes-base.httpRequest');
    expect(result!.current_parameters.method).toBe('GET');
    expect(result!.current_parameters.url).toBe('https://api.example.com/data');
    expect(result!.available_parameters).toBeDefined();
    expect(result!.required_credentials).toBeDefined();
  });

  it('should return null for non-existent node', () => {
    const result = getNodeParameters(testWorkflow, {
      node_name: 'NonExistent',
      include_reference: false,
    });

    expect(result).toBeNull();
  });

  it('should get all nodes status', () => {
    const status = getAllNodesStatus(testWorkflow);

    expect(status).toHaveLength(3);
    expect(status.map((s) => s.node_name)).toContain('Webhook');
    expect(status.map((s) => s.node_name)).toContain('Slack');
    expect(status.map((s) => s.node_name)).toContain('HTTP Request');
  });
});

describe('Validate Parameters', () => {
  it('should validate HTTP request parameters', () => {
    const result = validateNodeParameters(testWorkflow, 'HTTP Request');

    expect(result.node_name).toBe('HTTP Request');
    expect(result.node_type).toBe('n8n-nodes-base.httpRequest');
    expect(result.is_valid).toBe(true);
  });

  it('should flag missing required credentials', () => {
    const result = validateNodeParameters(testWorkflow, 'Slack');

    expect(result.node_name).toBe('Slack');
    expect(result.missing_credentials).toBe(true);
    expect(result.issues.some((i) => i.message.includes('credentials'))).toBe(true);
  });

  it('should flag invalid method value', () => {
    const workflow = JSON.parse(JSON.stringify(testWorkflow)) as WorkflowDefinition;
    const httpNode = workflow.nodes.find((n) => n.name === 'HTTP Request');
    if (httpNode) {
      httpNode.parameters = { method: 'INVALID', url: 'https://api.example.com' };
    }

    const result = validateNodeParameters(workflow, 'HTTP Request');

    expect(result.is_valid).toBe(false);
    expect(result.issues.some((i) => i.parameter === 'method')).toBe(true);
  });

  it('should validate entire workflow', () => {
    const results = validateWorkflow(testWorkflow);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.node_name)).toBe(true);
  });
});

describe('Workflow Readiness', () => {
  it('should check if workflow is ready for deployment', () => {
    const result = isWorkflowReady(testWorkflow);

    expect(result).toBeDefined();
    expect(typeof result.ready).toBe('boolean');
    expect(Array.isArray(result.blockers)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('should report missing credentials as warnings', () => {
    const result = isWorkflowReady(testWorkflow);

    // Slack node needs credentials
    expect(result.warnings.some((w) => w.includes('Slack'))).toBe(true);
  });
});
