# Workflow Templates Library

Production-ready TypeScript implementation for managing, validating, and instantiating workflow templates.

## Features

- **Template Registry**: In-memory cache with search and validation
- **Variable Extraction**: Automatic detection of `{{variable}}` patterns in nested objects
- **Template Instantiation**: Type-safe variable replacement with validation
- **File Loader**: Load templates from filesystem with watch support
- **Fuzzy Search**: Search templates by name, description, tags with relevance scoring
- **Error Handling**: Descriptive error messages using custom error system

## Usage

### Basic Template Management

```typescript
import { TemplateRegistry } from './templates/index.js';
import { loadFromDirectory } from './templates/loaders/file-loader.js';

// Create registry
const registry = new TemplateRegistry({ maxCacheSize: 1000 });

// Load templates from directory
const { templates, errors } = await loadFromDirectory('./templates');

// Add templates to registry
for (const template of templates) {
  registry.addTemplate(template);
}

// Search templates
const aiTemplates = registry.searchTemplates({
  category: 'ai',
  tags: ['chatbot'],
  complexity: 'beginner',
  limit: 10
});
```

### Template Instantiation

```typescript
import { instantiate, extractVariables } from './templates/instantiator.js';

// Get template
const template = registry.getTemplate('my-template-id');

// Extract all variables
const variables = extractVariables(template);
console.log('Required variables:', variables);

// Instantiate with values
const result = instantiate(template, {
  apiKey: 'sk-...',
  webhookUrl: 'https://example.com/webhook',
  maxRetries: 3
});

// Use instantiated workflow
console.log('Workflow ready:', result.workflow);
```

### File Watching

```typescript
import { watchDirectory } from './templates/loaders/file-loader.js';

// Watch for template changes
const stopWatching = await watchDirectory('./templates', (event, file, template) => {
  console.log(`Template ${file} was ${event}`);

  if (event === 'added' || event === 'changed') {
    if (template) {
      registry.addTemplate(template);
    }
  } else if (event === 'removed') {
    registry.removeTemplate(template.metadata.id);
  }
});

// Stop watching when done
stopWatching();
```

## Template Format

Templates are JSON files with the following structure:

```json
{
  "metadata": {
    "id": "simple-webhook",
    "name": "Simple Webhook Handler",
    "description": "Basic webhook receiver with response",
    "category": "automation",
    "tags": ["webhook", "api"],
    "complexity": "beginner",
    "estimatedNodes": 3,
    "author": "n8n Team",
    "version": "1.0.0",
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-01T00:00:00Z"
  },
  "variables": [
    {
      "name": "webhookPath",
      "type": "string",
      "description": "URL path for the webhook",
      "required": true,
      "validation": "^[a-z0-9-]+$"
    },
    {
      "name": "responseMessage",
      "type": "string",
      "description": "Message to return in response",
      "required": false,
      "default": "OK"
    }
  ],
  "prerequisites": [
    {
      "type": "node",
      "name": "Webhook",
      "description": "Webhook trigger node must be available"
    }
  ],
  "workflow": {
    "nodes": [
      {
        "name": "Webhook",
        "type": "n8n-nodes-base.webhook",
        "parameters": {
          "path": "{{webhookPath}}",
          "responseMode": "onReceived",
          "responseData": "{{responseMessage}}"
        }
      }
    ]
  }
}
```

## API Reference

### TemplateRegistry

- `addTemplate(template)` - Add template with validation
- `getTemplate(id)` - Get template by ID
- `searchTemplates(options)` - Search with filters and fuzzy matching
- `listCategories()` - Get all available categories
- `listTags()` - Get all available tags
- `clear()` - Remove all templates

### Instantiator

- `extractVariables(template)` - Find all {{variable}} patterns
- `validateValues(template, values)` - Validate values against definitions
- `instantiate(template, values)` - Replace variables and return workflow
- `checkPrerequisites(template, credentials)` - Check missing prerequisites

### File Loader

- `loadFromFile(path)` - Load single template with validation
- `loadFromDirectory(path)` - Load all templates from directory
- `watchDirectory(path, callback)` - Watch for file changes
