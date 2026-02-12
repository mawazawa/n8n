/**
 * Go SDK client code generator
 * Generates type-safe Go client with context support
 */

/**
 * Generate Go SDK client code
 * Integration: const goCode = generateGoClient();
 */
export function generateGoClient(): string {
	return `// Package workflowarchitect provides a Go SDK for the Workflow Architect API
package workflowarchitect

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Client is the main Workflow Architect API client
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// Workflow represents a workflow definition
type Workflow struct {
	ID          string                 \`json:"id"\`
	Name        string                 \`json:"name"\`
	Description string                 \`json:"description,omitempty"\`
	Nodes       []map[string]any       \`json:"nodes"\`
	Connections map[string]any         \`json:"connections"\`
	CreatedAt   time.Time              \`json:"created_at"\`
	UpdatedAt   time.Time              \`json:"updated_at"\`
}

// Execution represents a workflow execution
type Execution struct {
	ID         string         \`json:"id"\`
	WorkflowID string         \`json:"workflow_id"\`
	Status     string         \`json:"status"\`
	StartedAt  time.Time      \`json:"started_at"\`
	FinishedAt *time.Time     \`json:"finished_at,omitempty"\`
	Input      map[string]any \`json:"input"\`
	Output     map[string]any \`json:"output,omitempty"\`
}

// NewClient creates a new Workflow Architect client
func NewClient(baseURL, apiKey string, opts ...ClientOption) *Client {
	c := &Client{
		baseURL: baseURL,
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

// GetWorkflow retrieves a workflow by ID
func (c *Client) GetWorkflow(ctx context.Context, id string) (*Workflow, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("%s/workflows/%s", c.baseURL, id), nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var workflow Workflow
	if err := json.NewDecoder(resp.Body).Decode(&workflow); err != nil {
		return nil, err
	}

	return &workflow, nil
}
`;
}
