# Intelligent Error Recovery System

A comprehensive error recovery system for n8n workflows that provides pattern matching, analysis, suggestions, and automatic fixes.

## Features

- **Pattern Matching**: 30+ built-in error patterns for common API and service errors
- **Error Analysis**: Categorizes errors as transient, configuration, external, logic, or unknown
- **Smart Suggestions**: Generates ranked recovery suggestions with confidence scores
- **Auto-Fix**: Safely applies fixes like retry with backoff, parameter adjustments, and credential rotation
- **Extensible**: Add custom error patterns at runtime

## Quick Start

```typescript
import {
  ErrorAnalyzer,
  RecoverySuggestionGenerator,
  AutoRecovery,
  type ErrorContext,
} from './recovery/index.js';

// Create error context
const errorContext: ErrorContext = {
  executionId: 'exec-123',
  workflowId: 'workflow-456',
  nodeName: 'HTTP Request',
  nodeType: 'n8n-nodes-base.httpRequest',
  errorMessage: '429 Too Many Requests - Rate limit exceeded',
  timestamp: Date.now(),
};

// Analyze the error
const analyzer = new ErrorAnalyzer();
const analysis = analyzer.analyzeError(errorContext);

console.log('Category:', analysis.category); // 'transient'
console.log('Root cause:', analysis.rootCause); // 'API rate limit has been exceeded'
console.log('Is transient:', analysis.isTransient); // true

// Generate recovery suggestions
const suggestionGen = new RecoverySuggestionGenerator();
const suggestions = suggestionGen.generateSuggestions(errorContext);

console.log('Top suggestion:', suggestions[0]);
// {
//   type: 'retry',
//   title: 'Retry with exponential backoff',
//   confidence: 0.9,
//   action: { type: 'retry_with_delay', params: { delayMs: 1000, ... } }
// }

// Auto-apply safe fixes
const autoRecovery = new AutoRecovery();
if (autoRecovery.canAutoFix(suggestions[0])) {
  const result = await autoRecovery.applyFix(suggestions[0], errorContext);
  console.log('Fix applied:', result.success);
}
```

## Architecture

### 1. Error Patterns (`patterns.ts`)

Built-in database of common error patterns with:
- Regex pattern matching
- Error categorization
- Node-type specific patterns
- Recommended solutions

```typescript
import { matchPattern, addPattern } from './recovery/index.js';

// Match error message to patterns
const matches = matchPattern('401 Unauthorized', 'n8n-nodes-base.httpRequest');

// Add custom pattern
addPattern({
  id: 'custom-api-error',
  pattern: 'custom.*error',
  category: 'configuration',
  description: 'Custom API error',
  solutions: ['Check API configuration'],
});
```

### 2. Error Analyzer (`analyzer.ts`)

Analyzes errors to determine:
- Root cause
- Error category (transient, configuration, external, logic, unknown)
- Severity level
- Whether error is retryable
- Similar errors in history

```typescript
const analyzer = new ErrorAnalyzer();

// Check if error is transient (safe to retry)
const isTransient = analyzer.isTransient(errorContext);

// Find similar errors in history
const similarErrors = analyzer.getSimilarErrors(errorContext, errorHistory);

// Get error frequency
const frequency = analyzer.getErrorFrequency(errorContext, errorHistory);
```

### 3. Suggestion Generator (`suggestions.ts`)

Generates and ranks recovery suggestions:
- Retry with exponential backoff
- Credential rotation
- Parameter adjustments
- Alternative services
- Manual interventions

```typescript
const generator = new RecoverySuggestionGenerator();

// Generate all suggestions
const allSuggestions = generator.generateSuggestions(errorContext);

// Filter by confidence
const highConfidence = generator.filterByConfidence(allSuggestions, 0.8);

// Get top N suggestions
const topSuggestions = generator.getTopSuggestions(allSuggestions, 3);
```

### 4. Auto Recovery (`auto-fix.ts`)

Automatically applies safe, reversible fixes:
- Retry scheduling with delays
- Workflow parameter updates
- Credential swapping
- Batching enablement

```typescript
const recovery = new AutoRecovery();

// Check if suggestion can be auto-fixed
const canFix = recovery.canAutoFix(suggestion);

// Apply single fix
const result = await recovery.applyFix(suggestion, errorContext, workflow);

// Apply multiple fixes (stops at first success)
const results = await recovery.applyFixes(suggestions, errorContext, workflow);

// Rollback if needed
if (!result.success) {
  await recovery.rollbackFix(result);
}
```

## Error Categories

- **transient**: Temporary issues that usually resolve with retry (rate limits, timeouts, 503)
- **configuration**: Setup issues requiring manual fixes (auth failures, invalid parameters)
- **external**: Third-party service issues (connection refused, DNS failures)
- **logic**: Code/workflow logic errors (null references, memory issues)
- **unknown**: Unrecognized errors

## Suggestion Types

- **retry**: Retry the operation (with or without delay/backoff)
- **credential**: Credential-related fixes (rotate, verify, swap)
- **parameter**: Workflow parameter adjustments (timeout, batch size)
- **alternative**: Use alternative service or approach
- **manual**: Requires manual intervention

## Built-in Patterns

### API Errors
- Rate limiting (429, quota exceeded)
- Authentication (401, unauthorized)
- Authorization (403, forbidden)
- Not found (404)
- Validation (400, 422)
- Server errors (500, 502, 503, 504)

### Network Errors
- Connection refused (ECONNREFUSED)
- Connection reset (ECONNRESET)
- DNS failures (ENOTFOUND)
- Timeouts (ETIMEDOUT)
- SSL/TLS errors

### Service-Specific
- OpenAI quota exceeded
- Slack channel not found
- Google Sheets quota
- Database connection pool exhausted

## Extending with Custom Patterns

```typescript
import { addPattern } from './recovery/index.js';

addPattern({
  id: 'my-service-rate-limit',
  pattern: 'MyService.*rate.*limit',
  category: 'transient',
  nodeTypes: ['n8n-nodes-base.myService'],
  description: 'MyService API rate limit',
  solutions: [
    'Wait 60 seconds and retry',
    'Reduce request frequency',
    'Contact MyService support for higher limits',
  ],
});
```

## Success Criteria

✅ Pattern matching correctly identifies 90%+ of common errors
✅ Suggestions are ranked by confidence and actionability
✅ Auto-fix only applies safe, reversible changes
✅ Comprehensive error handling with no uncaught exceptions
✅ TypeScript strict mode compliance (no `any`, no `ts-ignore`)

## Integration Example

```typescript
// In workflow execution error handler
async function handleWorkflowError(error: Error, context: ErrorContext) {
  const analyzer = new ErrorAnalyzer();
  const generator = new RecoverySuggestionGenerator();
  const recovery = new AutoRecovery();

  // Analyze error
  const analysis = analyzer.analyzeError(context);

  // Generate suggestions
  const suggestions = generator.generateSuggestions(context);

  // Try auto-fix for high-confidence suggestions
  const autoFixable = recovery.getAutoFixableSuggestions(suggestions);

  if (autoFixable.length > 0) {
    const result = await recovery.applyFix(autoFixable[0], context);

    if (result.success) {
      console.log('Auto-recovered:', result.suggestion.title);
      return result;
    }
  }

  // Present manual suggestions to user
  return {
    analysis,
    suggestions: generator.getTopSuggestions(suggestions, 5),
  };
}
```

## Files

- `types.ts` - TypeScript type definitions
- `patterns.ts` - Error pattern database and matching
- `analyzer.ts` - Error analysis and categorization
- `suggestions.ts` - Recovery suggestion generation
- `auto-fix.ts` - Automatic fix application
- `index.ts` - Main export file
