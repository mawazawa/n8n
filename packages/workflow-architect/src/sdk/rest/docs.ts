/**
 * REST API documentation generator
 * Generates Markdown documentation with examples
 */

/**
 * Generate REST API documentation
 * Integration: const docs = new RESTDocsGenerator().generate();
 */
export class RESTDocsGenerator {
	generate(): string {
		return `# Workflow Architect REST API Documentation

## Authentication

All requests require authentication using Bearer tokens:

\`\`\`bash
curl -H "Authorization: Bearer YOUR_API_KEY" https://api.workflow-architect.com/workflows
\`\`\`

## Rate Limiting

- Rate limit: 1000 requests per hour
- Headers: \`X-RateLimit-Limit\`, \`X-RateLimit-Remaining\`, \`X-RateLimit-Reset\`
- Status code 429 when exceeded

## Endpoints

### List Workflows

\`\`\`http
GET /workflows?limit=20&cursor=abc123
\`\`\`

**Response:**
\`\`\`json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "My Workflow",
      "description": "Example workflow",
      "nodes": [],
      "connections": {},
      "created_at": "2025-01-01T00:00:00Z",
      "updated_at": "2025-01-01T00:00:00Z"
    }
  ],
  "cursor": "next_page_cursor",
  "hasMore": true
}
\`\`\`

### Create Workflow

\`\`\`http
POST /workflows
Content-Type: application/json

{
  "name": "New Workflow",
  "description": "Created via API",
  "nodes": [],
  "connections": {}
}
\`\`\`

### Execute Workflow

\`\`\`http
POST /workflows/:id/execute
Content-Type: application/json

{
  "input": {
    "data": "example"
  }
}
\`\`\`

**Response:**
\`\`\`json
{
  "executionId": "660e8400-e29b-41d4-a716-446655440000"
}
\`\`\`

## Error Handling

All errors follow this format:

\`\`\`json
{
  "code": "WORKFLOW_NOT_FOUND",
  "message": "Workflow with ID abc123 not found",
  "details": {},
  "statusCode": 404
}
\`\`\`

## Pagination

Use cursor-based pagination:

1. Initial request: \`GET /workflows?limit=20\`
2. Next page: \`GET /workflows?limit=20&cursor=CURSOR_FROM_PREVIOUS_RESPONSE\`
3. Continue until \`hasMore\` is \`false\`
`;
	}
}
