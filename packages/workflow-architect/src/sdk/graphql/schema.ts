/**
 * GraphQL schema definition for Workflow Architect
 * Complete schema with queries, mutations, and subscriptions
 */

/**
 * GraphQL schema definition
 * Integration: const schema = buildGraphQLSchema();
 */
export function buildGraphQLSchema(): string {
	return `
type Workflow {
  id: ID!
  name: String!
  description: String
  nodes: [JSONObject!]!
  connections: JSONObject!
  createdAt: DateTime!
  updatedAt: DateTime!
  executions(limit: Int = 20, cursor: String): ExecutionConnection!
}

type Execution {
  id: ID!
  workflowId: ID!
  workflow: Workflow!
  status: ExecutionStatus!
  startedAt: DateTime!
  finishedAt: DateTime
  input: JSONObject!
  output: JSONObject
  error: String
}

enum ExecutionStatus {
  RUNNING
  SUCCESS
  ERROR
  CANCELLED
}

type Template {
  id: ID!
  name: String!
  description: String!
  category: String!
  variables: [TemplateVariable!]!
  workflow: JSONObject!
  tags: [String!]!
}

type TemplateVariable {
  name: String!
  type: VariableType!
  required: Boolean!
  default: JSONObject
}

enum VariableType {
  STRING
  NUMBER
  BOOLEAN
}

type WorkflowConnection {
  items: [Workflow!]!
  cursor: String
  hasMore: Boolean!
  total: Int
}

type ExecutionConnection {
  items: [Execution!]!
  cursor: String
  hasMore: Boolean!
  total: Int
}

type Query {
  workflow(id: ID!): Workflow
  workflows(limit: Int = 20, cursor: String, name: String): WorkflowConnection!
  execution(id: ID!): Execution
  executions(workflowId: ID!, limit: Int = 20, cursor: String): ExecutionConnection!
  template(id: ID!): Template
  templates(limit: Int = 20, cursor: String, category: String): [Template!]!
}

type Mutation {
  createWorkflow(input: CreateWorkflowInput!): Workflow!
  updateWorkflow(id: ID!, input: UpdateWorkflowInput!): Workflow!
  deleteWorkflow(id: ID!): Boolean!
  executeWorkflow(id: ID!, input: JSONObject!): Execution!
  cancelExecution(id: ID!): Execution!
  retryExecution(id: ID!): Execution!
  instantiateTemplate(id: ID!, variables: JSONObject!): Workflow!
}

type Subscription {
  executionUpdated(id: ID!): Execution!
  workflowExecutionStarted(workflowId: ID!): Execution!
}

input CreateWorkflowInput {
  name: String!
  description: String
  nodes: [JSONObject!]!
  connections: JSONObject!
}

input UpdateWorkflowInput {
  name: String
  description: String
  nodes: [JSONObject!]
  connections: JSONObject
}

scalar DateTime
scalar JSONObject
`;
}
