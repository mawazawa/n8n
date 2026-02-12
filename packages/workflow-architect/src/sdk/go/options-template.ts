/**
 * Go SDK options pattern code generator
 * Generates functional options for the Go client
 */

/**
 * Generate Go SDK options code
 * Integration: const goOptionsCode = generateGoOptions();
 */
export function generateGoOptions(): string {
	return `// Package workflowarchitect options
package workflowarchitect

import (
	"net/http"
	"time"
)

// ClientOption is a functional option for configuring the Client
type ClientOption func(*Client)

// WithTimeout sets the HTTP client timeout
func WithTimeout(timeout time.Duration) ClientOption {
	return func(c *Client) {
		c.httpClient.Timeout = timeout
	}
}

// WithHTTPClient sets a custom HTTP client
func WithHTTPClient(client *http.Client) ClientOption {
	return func(c *Client) {
		c.httpClient = client
	}
}

// WithBaseURL sets a custom base URL
func WithBaseURL(baseURL string) ClientOption {
	return func(c *Client) {
		c.baseURL = baseURL
	}
}

// WithRetries configures retry behavior
func WithRetries(maxRetries int) ClientOption {
	return func(c *Client) {
		// Retry logic would be implemented here
	}
}

// RequestOption is a functional option for individual requests
type RequestOption func(*requestConfig)

type requestConfig struct {
	timeout time.Duration
	headers map[string]string
}

// WithRequestTimeout sets timeout for a specific request
func WithRequestTimeout(timeout time.Duration) RequestOption {
	return func(cfg *requestConfig) {
		cfg.timeout = timeout
	}
}

// WithHeader adds a custom header to a request
func WithHeader(key, value string) RequestOption {
	return func(cfg *requestConfig) {
		if cfg.headers == nil {
			cfg.headers = make(map[string]string)
		}
		cfg.headers[key] = value
	}
}
`;
}
