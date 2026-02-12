# n8n Editor Integration Guide

This directory contains all the necessary files to integrate the Workflow Architect into the n8n editor. These files are designed to be copied into the appropriate n8n packages.

## Overview

The Workflow Architect integration consists of:
- **Frontend**: Vue 3 components, Pinia store, composables
- **Backend**: Express controllers, services
- **Shared**: TypeScript types, API client, feature flags

## File Structure

```
src/n8n-integration/
├── README.md                              # This file
├── translations.ts                        # i18n translations
├── feature-flags.ts                       # Feature flag definitions
├── architect.api.ts                       # API client for SSE/REST
├── architect.store.ts                     # Pinia store
├── useArchitectCanvas.ts                  # Canvas integration composable
├── useArchitectShortcuts.ts               # Keyboard shortcuts composable
├── styles.scss                            # Component styles
├── WorkflowArchitect.vue                  # Main component
├── WorkflowArchitectPanel.vue             # Panel wrapper
├── workflow-architect.service.ts          # Backend service
└── workflow-architect.controller.ts       # Backend controller

tests/e2e/
└── n8n-integration.test.ts                # E2E tests
```

## Integration Steps

### Step 1: Install Dependencies

The workflow-architect package is already a dependency in the n8n monorepo. Make sure to install it:

```bash
pnpm install @n8n/workflow-architect --workspace
```

### Step 2: Frontend Integration (packages/editor-ui)

#### 2.1 Copy Frontend Files

Copy the following files to `packages/editor-ui/src/components/WorkflowArchitect/`:

```bash
# Create directory
mkdir -p packages/editor-ui/src/components/WorkflowArchitect

# Copy files
cp packages/workflow-architect/src/n8n-integration/WorkflowArchitect.vue \
   packages/editor-ui/src/components/WorkflowArchitect/

cp packages/workflow-architect/src/n8n-integration/WorkflowArchitectPanel.vue \
   packages/editor-ui/src/components/WorkflowArchitect/

cp packages/workflow-architect/src/n8n-integration/architect.store.ts \
   packages/editor-ui/src/stores/

cp packages/workflow-architect/src/n8n-integration/architect.api.ts \
   packages/editor-ui/src/api/

cp packages/workflow-architect/src/n8n-integration/useArchitectCanvas.ts \
   packages/editor-ui/src/composables/

cp packages/workflow-architect/src/n8n-integration/useArchitectShortcuts.ts \
   packages/editor-ui/src/composables/

cp packages/workflow-architect/src/n8n-integration/styles.scss \
   packages/editor-ui/src/components/WorkflowArchitect/

cp packages/workflow-architect/src/n8n-integration/feature-flags.ts \
   packages/editor-ui/src/utils/
```

#### 2.2 Add Translations

Add the translations to `packages/@n8n/i18n/locales/en/index.ts`:

```typescript
import { translations } from '@n8n/workflow-architect/n8n-integration/translations';

export default {
  // ... existing translations
  ...translations.en,
};
```

#### 2.3 Register the Component

In `packages/editor-ui/src/views/WorkflowView.vue`:

```vue
<template>
  <div class="workflow-view">
    <!-- Existing canvas and components -->

    <!-- Add Workflow Architect Panel -->
    <WorkflowArchitectPanel
      :canvas-operations="canvasOperations"
      :feature-flags="settingsStore.settings"
    />
  </div>
</template>

<script setup lang="ts">
import WorkflowArchitectPanel from '@/components/WorkflowArchitect/WorkflowArchitectPanel.vue';
import { useCanvasOperations } from '@/composables/useCanvasOperations';

const canvasOperations = useCanvasOperations();
// ... rest of the component
</script>
```

#### 2.4 Register Pinia Store

In `packages/editor-ui/src/stores/index.ts`:

```typescript
import { useWorkflowArchitectStore } from './architect.store';

export {
  // ... existing stores
  useWorkflowArchitectStore,
};
```

### Step 3: Backend Integration (packages/cli)

#### 3.1 Copy Backend Files

Copy the backend files to the CLI package:

```bash
# Create directory
mkdir -p packages/cli/src/workflows/architect

# Copy files
cp packages/workflow-architect/src/n8n-integration/workflow-architect.service.ts \
   packages/cli/src/workflows/architect/

cp packages/workflow-architect/src/n8n-integration/workflow-architect.controller.ts \
   packages/cli/src/workflows/architect/

cp packages/workflow-architect/src/n8n-integration/feature-flags.ts \
   packages/cli/src/workflows/architect/
```

#### 3.2 Register Routes

In `packages/cli/src/Server.ts` (or wherever routes are registered):

```typescript
import { registerWorkflowArchitectRoutes } from './workflows/architect/workflow-architect.controller';

// In the route registration section:
export class Server extends AbstractServer {
  async configure(): Promise<void> {
    // ... existing configuration

    // Register Workflow Architect routes
    const apiRouter = this.app.router('/api');
    registerWorkflowArchitectRoutes(apiRouter);
  }
}
```

Alternatively, if using n8n's route registration pattern:

```typescript
import { architectRoutes } from './workflows/architect/workflow-architect.controller';

// Add to routes array
this.registerRoutes([
  // ... existing routes
  architectRoutes.streamChat,
  architectRoutes.chat,
  architectRoutes.getHistory,
  architectRoutes.clearHistory,
  architectRoutes.health,
]);
```

#### 3.3 Add Environment Variables

Add to `.env.schema` and `.env.example`:

```bash
# Workflow Architect
N8N_AI_ARCHITECT_ENABLED=false
N8N_AI_ARCHITECT_MODEL=claude-opus-4-5
N8N_AI_ARCHITECT_BASE_URL=http://localhost:3000
N8N_AI_ARCHITECT_TIMEOUT=60000
N8N_AI_ARCHITECT_MAX_TOKENS=4096
ANTHROPIC_API_KEY=
```

#### 3.4 Add to Config Service

In `packages/@n8n/config/src/configs/workflow.config.ts`:

```typescript
import { Config, Env } from '../decorators';

@Config
export class WorkflowArchitectConfig {
  @Env('N8N_AI_ARCHITECT_ENABLED')
  enabled: boolean = false;

  @Env('N8N_AI_ARCHITECT_MODEL')
  model: string = 'claude-opus-4-5';

  @Env('N8N_AI_ARCHITECT_BASE_URL')
  baseUrl: string = 'http://localhost:3000';

  @Env('N8N_AI_ARCHITECT_TIMEOUT')
  timeout: number = 60000;

  @Env('N8N_AI_ARCHITECT_MAX_TOKENS')
  maxTokens: number = 4096;
}
```

### Step 4: E2E Tests

#### 4.1 Copy Test Files

Copy the E2E tests to the Playwright package:

```bash
cp packages/workflow-architect/tests/e2e/n8n-integration.test.ts \
   packages/@n8n/n8n-playwright/tests/features/
```

#### 4.2 Run Tests

```bash
pnpm --filter=n8n-playwright test:local
```

### Step 5: Build and Start

#### 5.1 Build All Packages

```bash
pnpm build
```

#### 5.2 Set Environment Variables

Create or update `.env` file:

```bash
N8N_AI_ARCHITECT_ENABLED=true
ANTHROPIC_API_KEY=your-api-key-here
```

#### 5.3 Start n8n

```bash
pnpm start
```

#### 5.4 Test the Integration

1. Open n8n in your browser
2. Create a new workflow
3. Press `Cmd+Shift+A` (Mac) or `Ctrl+Shift+A` (Windows/Linux)
4. The AI Workflow Architect panel should open
5. Type a workflow description and press Enter
6. Watch as the AI creates your workflow!

## Architecture

### Frontend Flow

```
User Input
    ↓
WorkflowArchitect.vue (UI)
    ↓
architect.store.ts (State Management)
    ↓
architect.api.ts (API Client)
    ↓
Backend (SSE/REST)
    ↓
useArchitectCanvas.ts (Canvas Integration)
    ↓
n8n Canvas (Workflow Applied)
```

### Backend Flow

```
HTTP Request
    ↓
workflow-architect.controller.ts (Router)
    ↓
workflow-architect.service.ts (Business Logic)
    ↓
@n8n/workflow-architect (Core Package)
    ↓
LangGraph → Agents → n8n API
    ↓
Response (SSE Stream or JSON)
```

## Key Features

### 1. Real-time Streaming (SSE)

The architect uses Server-Sent Events for real-time streaming of AI responses:

```typescript
// Backend sends events
res.write(`data: ${JSON.stringify(event)}\n\n`);

// Frontend receives events
for await (const event of apiClient.streamChat(request)) {
  // Handle event
}
```

### 2. Keyboard Shortcuts

- `Cmd+Shift+A` (Mac) / `Ctrl+Shift+A` (Windows/Linux): Open/Close architect
- `Cmd+Enter` / `Ctrl+Enter`: Send message
- `Escape`: Close panel or abort request
- `Cmd+Shift+N` / `Ctrl+Shift+N`: New conversation

### 3. Canvas Integration

The `useArchitectCanvas` composable transforms workflow-architect output into n8n format:

```typescript
const { applyWorkflowToCanvas } = useArchitectCanvas(canvasOperations);
await applyWorkflowToCanvas({ clearExisting: true });
```

### 4. Feature Flags

The architect can be enabled/disabled via feature flags:

```typescript
// Environment variable
N8N_AI_ARCHITECT_ENABLED=true

// Runtime check
if (isAiArchitectEnabled(featureFlags)) {
  // Show architect
}
```

### 5. State Management

Pinia store manages all architect state:

```typescript
const architectStore = useWorkflowArchitectStore();

// Actions
architectStore.sendMessage('Create a workflow');
architectStore.openPanel();
architectStore.clearChat();

// State
architectStore.messages
architectStore.currentWorkflow
architectStore.isProcessing
```

## Customization

### Custom Styling

Modify `styles.scss` to match your design system. All styles use CSS variables:

```scss
.workflow-architect-panel {
  background: var(--color-background-xlight);
  border-left: var(--border-width-base) solid var(--color-foreground-base);
}
```

### Custom Translations

Add translations for additional languages in the translations file:

```typescript
export const translations = {
  en: { /* English */ },
  de: { /* German */ },
  es: { /* Spanish */ },
};
```

### Custom Models

Configure different AI models via environment variables:

```bash
N8N_AI_ARCHITECT_MODEL=claude-sonnet-4-5
# or
N8N_AI_ARCHITECT_MODEL=gpt-4
```

## Troubleshooting

### Panel Not Opening

1. Check feature flag: `N8N_AI_ARCHITECT_ENABLED=true`
2. Check browser console for errors
3. Verify keyboard shortcut is not conflicting

### No Response from Backend

1. Check backend logs for errors
2. Verify API key is set: `ANTHROPIC_API_KEY`
3. Check network tab for API calls to `/api/architect/chat/stream`
4. Ensure workflow-architect service is initialized

### Workflow Not Applied to Canvas

1. Check `useArchitectCanvas` has access to `canvasOperations`
2. Verify workflow format is correct
3. Check browser console for transformation errors

### Build Errors

1. Ensure all dependencies are installed: `pnpm install`
2. Build workflow-architect first: `pnpm --filter=@n8n/workflow-architect build`
3. Then build editor-ui: `pnpm --filter=editor-ui build`

## Performance Considerations

### 1. SSE Connection Management

- Connections auto-cleanup after 30 minutes of inactivity
- Use `abortController` to cancel in-flight requests
- Implement reconnection logic for dropped connections

### 2. State Management

- Messages are stored in memory (Pinia store)
- Consider persisting to localStorage for long sessions
- Implement pagination for message history

### 3. Canvas Operations

- Batch node creation when possible
- Use `clearCanvas()` sparingly (expensive operation)
- Implement optimistic UI updates

## Security Considerations

1. **API Key Protection**: Never expose API keys to frontend
2. **Rate Limiting**: Implement rate limits on backend endpoints
3. **Input Validation**: Sanitize all user inputs
4. **Authentication**: Ensure endpoints are protected by n8n auth
5. **CORS**: Configure appropriate CORS policies

## Future Enhancements

1. **Workflow Templates**: Pre-defined workflow templates
2. **Multi-turn Conversations**: Maintain context across sessions
3. **Workflow Versioning**: Track workflow generation history
4. **Collaborative Editing**: Multi-user architect sessions
5. **Custom Instructions**: User-defined generation preferences

## Support

For issues or questions:
- Check the main [ROADMAP.md](../../ROADMAP.md)
- Review [ARCHITECTURE.md](../../ARCHITECTURE.md)
- Open an issue on GitHub

## License

Same as n8n - Sustainable Use License
