import type { ErrorPattern, ErrorCategory } from './types.js';

/**
 * Built-in error patterns database
 * Matches common error messages to categories and suggests solutions
 */
const builtInPatterns: ErrorPattern[] = [
  // Rate Limiting Errors
  {
    id: 'rate_limit_429',
    pattern: '(429|rate limit|too many requests|quota exceeded)',
    category: 'transient',
    description: 'API rate limit exceeded',
    solutions: [
      'Wait and retry with exponential backoff',
      'Reduce request frequency',
      'Upgrade API tier if available',
      'Implement request queuing',
    ],
  },
  {
    id: 'openai_quota',
    pattern: '(insufficient_quota|quota exceeded|billing.*exceeded)',
    category: 'configuration',
    nodeTypes: ['@n8n/n8n-nodes-langchain.openAi', 'n8n-nodes-base.openAi'],
    description: 'OpenAI quota or billing limit exceeded',
    solutions: [
      'Check OpenAI billing and add credits',
      'Switch to a different AI provider',
      'Reduce token usage per request',
    ],
  },

  // Authentication Errors
  {
    id: 'auth_401',
    pattern: '(401|unauthorized|authentication.*fail|invalid.*credentials?)',
    category: 'configuration',
    description: 'Authentication failed',
    solutions: [
      'Verify credentials are correct and not expired',
      'Regenerate API key or access token',
      'Check credential permissions and scopes',
      'Verify OAuth token is still valid',
    ],
  },
  {
    id: 'auth_403',
    pattern: '(403|forbidden|access.*denied|permission.*denied)',
    category: 'configuration',
    description: 'Insufficient permissions',
    solutions: [
      'Check API key or token has required permissions',
      'Verify account has access to the resource',
      'Contact service administrator for access',
      'Update credential scopes',
    ],
  },

  // Timeout Errors
  {
    id: 'timeout_general',
    pattern: '(timeout|timed out|ETIMEDOUT|ESOCKETTIMEDOUT)',
    category: 'transient',
    description: 'Request timed out',
    solutions: [
      'Retry the request',
      'Increase timeout duration',
      'Check network connectivity',
      'Process data in smaller batches',
    ],
  },
  {
    id: 'timeout_gateway',
    pattern: '(504|gateway timeout|upstream.*timeout)',
    category: 'transient',
    description: 'Gateway timeout',
    solutions: [
      'Retry the request after a delay',
      'Check service status page',
      'Use alternative endpoint if available',
    ],
  },

  // Connection Errors
  {
    id: 'connection_refused',
    pattern: '(ECONNREFUSED|connection refused|cannot connect)',
    category: 'external',
    description: 'Connection refused',
    solutions: [
      'Verify service URL is correct',
      'Check if service is running',
      'Verify network connectivity and firewall rules',
      'Check if service is behind a proxy',
    ],
  },
  {
    id: 'connection_reset',
    pattern: '(ECONNRESET|connection reset|socket hang up)',
    category: 'transient',
    description: 'Connection reset by server',
    solutions: [
      'Retry the request',
      'Check service stability',
      'Reduce request payload size',
    ],
  },
  {
    id: 'dns_failure',
    pattern: '(ENOTFOUND|ENOENT|dns.*fail|host.*not.*found)',
    category: 'configuration',
    description: 'DNS resolution failed',
    solutions: [
      'Verify hostname is correct',
      'Check DNS configuration',
      'Try using IP address instead of hostname',
      'Check network connectivity',
    ],
  },

  // Service Unavailable
  {
    id: 'service_503',
    pattern: '(503|service unavailable|temporarily unavailable)',
    category: 'transient',
    description: 'Service temporarily unavailable',
    solutions: [
      'Retry after a delay',
      'Check service status page',
      'Use alternative service if available',
      'Implement circuit breaker pattern',
    ],
  },
  {
    id: 'service_502',
    pattern: '(502|bad gateway|invalid.*response)',
    category: 'transient',
    description: 'Bad gateway or invalid response',
    solutions: [
      'Retry the request',
      'Check if service is experiencing issues',
      'Verify API endpoint is correct',
    ],
  },

  // Validation Errors
  {
    id: 'validation_400',
    pattern: '(400|bad request|invalid.*parameter|invalid.*input)',
    category: 'configuration',
    description: 'Invalid request parameters',
    solutions: [
      'Review and correct request parameters',
      'Check API documentation for required fields',
      'Validate input data format',
      'Check for missing required fields',
    ],
  },
  {
    id: 'validation_422',
    pattern: '(422|unprocessable entity|validation.*fail)',
    category: 'configuration',
    description: 'Request validation failed',
    solutions: [
      'Check data format matches API requirements',
      'Verify all required fields are present',
      'Review field constraints (min/max, format)',
      'Check for type mismatches',
    ],
  },

  // Resource Not Found
  {
    id: 'not_found_404',
    pattern: '(404|not found|resource.*not.*found)',
    category: 'configuration',
    description: 'Resource not found',
    solutions: [
      'Verify resource ID or path is correct',
      'Check if resource was deleted',
      'Verify API endpoint URL',
      'Create the resource if it should exist',
    ],
  },

  // Node-Specific: Slack
  {
    id: 'slack_channel_not_found',
    pattern: '(channel_not_found|invalid.*channel)',
    category: 'configuration',
    nodeTypes: ['n8n-nodes-base.slack'],
    description: 'Slack channel not found',
    solutions: [
      'Verify channel name or ID is correct',
      'Check bot has access to the channel',
      'Invite bot to private channel if needed',
      'Use channel ID instead of name',
    ],
  },
  {
    id: 'slack_not_in_channel',
    pattern: '(not_in_channel|bot.*not.*in.*channel)',
    category: 'configuration',
    nodeTypes: ['n8n-nodes-base.slack'],
    description: 'Bot not in channel',
    solutions: [
      'Invite bot to the channel',
      'Check bot permissions',
      'Verify bot is not removed from channel',
    ],
  },

  // Node-Specific: Google Sheets
  {
    id: 'google_sheets_quota',
    pattern: '(quota.*exceeded|rate.*limit.*exceeded)',
    category: 'transient',
    nodeTypes: ['n8n-nodes-base.googleSheets'],
    description: 'Google Sheets API quota exceeded',
    solutions: [
      'Wait and retry with exponential backoff',
      'Batch requests to reduce API calls',
      'Request quota increase from Google',
      'Process data in smaller chunks',
    ],
  },

  // Node-Specific: HTTP Request
  {
    id: 'http_ssl_error',
    pattern: '(ssl.*error|certificate.*error|self.*signed.*certificate)',
    category: 'configuration',
    nodeTypes: ['n8n-nodes-base.httpRequest'],
    description: 'SSL/TLS certificate error',
    solutions: [
      'Verify SSL certificate is valid',
      'Update certificate if expired',
      'Disable SSL verification for self-signed certs (not recommended for production)',
      'Install proper CA certificate',
    ],
  },

  // Node-Specific: Database
  {
    id: 'db_connection_pool',
    pattern: '(connection.*pool.*exhausted|too many connections)',
    category: 'configuration',
    nodeTypes: ['n8n-nodes-base.postgres', 'n8n-nodes-base.mysql', 'n8n-nodes-base.mongodb'],
    description: 'Database connection pool exhausted',
    solutions: [
      'Increase connection pool size',
      'Close unused connections',
      'Reduce concurrent database operations',
      'Check for connection leaks',
    ],
  },

  // Memory and Resource Errors
  {
    id: 'memory_limit',
    pattern: '(out of memory|memory.*exceeded|heap.*out.*of.*memory)',
    category: 'logic',
    description: 'Memory limit exceeded',
    solutions: [
      'Process data in smaller batches',
      'Increase memory allocation',
      'Optimize data processing logic',
      'Use streaming for large datasets',
    ],
  },

  // Generic Server Errors
  {
    id: 'server_500',
    pattern: '(500|internal server error)',
    category: 'external',
    description: 'Internal server error',
    solutions: [
      'Retry after a delay',
      'Check service status',
      'Contact service support if persistent',
      'Review request for potential issues',
    ],
  },
];

/**
 * Custom patterns added at runtime
 */
const customPatterns: ErrorPattern[] = [];

/**
 * Get all error patterns (built-in + custom)
 */
export function getPatterns(): ErrorPattern[] {
  return [...builtInPatterns, ...customPatterns];
}

/**
 * Match an error message against patterns
 * Returns all matching patterns sorted by specificity
 */
export function matchPattern(
  errorMessage: string,
  nodeType?: string,
): ErrorPattern[] {
  const message = errorMessage.toLowerCase();
  const matches: Array<{ pattern: ErrorPattern; score: number }> = [];

  for (const pattern of getPatterns()) {
    // Check if pattern applies to this node type
    if (pattern.nodeTypes && nodeType) {
      if (!pattern.nodeTypes.some((type) => nodeType.includes(type))) {
        continue;
      }
    }

    // Check if error message matches pattern
    const regex = new RegExp(pattern.pattern, 'i');
    if (regex.test(message)) {
      // Calculate match score (higher = more specific)
      let score = 0;

      // Node-specific patterns score higher
      if (pattern.nodeTypes && nodeType) {
        score += 100;
      }

      // Longer patterns are more specific
      score += pattern.pattern.length;

      matches.push({ pattern, score });
    }
  }

  // Sort by score descending (most specific first)
  matches.sort((a, b) => b.score - a.score);

  return matches.map((m) => m.pattern);
}

/**
 * Add a custom error pattern
 */
export function addPattern(pattern: ErrorPattern): void {
  // Validate pattern
  if (!pattern.id || !pattern.pattern || !pattern.category) {
    throw new Error('Invalid pattern: id, pattern, and category are required');
  }

  // Check for duplicate ID
  const existingIndex = customPatterns.findIndex((p) => p.id === pattern.id);
  if (existingIndex >= 0) {
    // Replace existing pattern
    customPatterns[existingIndex] = pattern;
  } else {
    // Add new pattern
    customPatterns.push(pattern);
  }
}

/**
 * Remove a custom error pattern
 */
export function removePattern(patternId: string): boolean {
  const index = customPatterns.findIndex((p) => p.id === patternId);
  if (index >= 0) {
    customPatterns.splice(index, 1);
    return true;
  }
  return false;
}

/**
 * Get pattern by ID
 */
export function getPatternById(patternId: string): ErrorPattern | undefined {
  return getPatterns().find((p) => p.id === patternId);
}

/**
 * Clear all custom patterns
 */
export function clearCustomPatterns(): void {
  customPatterns.length = 0;
}

/**
 * Get patterns by category
 */
export function getPatternsByCategory(category: ErrorCategory): ErrorPattern[] {
  return getPatterns().filter((p) => p.category === category);
}

/**
 * Get patterns by node type
 */
export function getPatternsByNodeType(nodeType: string): ErrorPattern[] {
  return getPatterns().filter((p) => {
    if (!p.nodeTypes) return false;
    return p.nodeTypes.some((type) => nodeType.includes(type));
  });
}
