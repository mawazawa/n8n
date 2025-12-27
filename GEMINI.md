# GEMINI.md - AI Assistant Guide for n8n

This document provides essential context for Google Gemini AI assistants working on the n8n codebase.

> **See also**: [AGENTS.md](./AGENTS.md) for general agent guidelines shared across all AI assistants.

## Gemini-Specific Guidelines

When working on this codebase, leverage Gemini's strengths:

### Multi-Modal Capabilities
- **Analyze screenshots** of workflow diagrams when debugging UI issues
- **Process workflow JSON files** to understand complex node configurations
- **Review visual diff outputs** when comparing workflow versions

### Long Context Utilization
- **Load entire package directories** when understanding cross-file dependencies
- **Analyze full test suites** to understand testing patterns before writing new tests
- **Review complete changelog history** to understand feature evolution

### Code Generation Best Practices
- **Generate TypeScript with strict types** - n8n uses strict mode
- **Include comprehensive JSDoc comments** for complex functions
- **Produce complete, runnable code** rather than snippets

## AI Assistant Guidelines

When working on this codebase, AI assistants should:

- **Prefer small, focused changes**: Make minimal modifications to accomplish the task. Avoid refactoring unrelated code.
- **Avoid sensitive packages**: Do not modify `packages/core/` without explicit approval from the n8n team.
- **Surface uncertainties**: If unsure about architectural decisions or conventions, ask clarifying questions rather than guessing.
- **Run tests before committing**: Always run `pnpm test` for affected packages to catch regressions.
- **Follow existing patterns**: Match the code style and patterns already present in the file or package you're modifying.
- **Reference canonical docs**: For detailed contributor guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## n8n 2.0 Key Changes

This repository is now on **n8n 2.x**. Key differences from 1.x:

### Security Hardening (Default in 2.0)
- **Task Runners enabled by default**: All Code node executions run in isolated environments
- **Environment variables blocked** from Code nodes by default
- **File access restricted** to `~/.n8n-files` directory by default
- **Python Code nodes** require task runners in external mode

### Workflow Paradigm Change
- **Save vs Publish**: Save button preserves edits without affecting production
- **Explicit Publish**: New Publish button required to push changes live
- Sub-workflow behavior fixed for Wait nodes and webhooks

### Database Changes
- **MySQL/MariaDB removed**: Only PostgreSQL and SQLite supported
- **SQLite pooling driver** is now the default and only SQLite driver

## Project Overview

n8n is a workflow automation platform that combines no-code visual workflow building with the flexibility of writing code. It features 400+ integrations, native AI/LangChain capabilities, and is distributed under a fair-code license.

- **Version**: 2.1.4
- **License**: Sustainable Use License / n8n Enterprise License
- **Requirements**: See `engines` field in root `package.json` for Node.js and pnpm versions

## Architecture for Gemini Context

```
┌─────────────────────────────────────────────────────────────────┐
│                        n8n Architecture                          │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (Vue 3 + Pinia)                                        │
│  ├── editor-ui/          → Workflow canvas, node configuration   │
│  ├── @n8n/design-system/ → Reusable UI components               │
│  └── @n8n/i18n/          → All UI text (mandatory)              │
├─────────────────────────────────────────────────────────────────┤
│  API Layer (@n8n/api-types)                                      │
│  └── Shared TypeScript interfaces for FE ↔ BE communication     │
├─────────────────────────────────────────────────────────────────┤
│  Backend (Node.js + Express)                                     │
│  ├── cli/                → REST API, controllers, services      │
│  ├── core/               → Workflow execution (⚠️ protected)    │
│  ├── workflow/           → Core interfaces and types            │
│  └── @n8n/di/            → Dependency injection container       │
├─────────────────────────────────────────────────────────────────┤
│  Nodes & AI                                                      │
│  ├── nodes-base/         → 400+ built-in integrations           │
│  ├── @n8n/nodes-langchain/ → AI/LLM nodes                       │
│  └── @n8n/task-runner/   → Isolated code execution (2.0)        │
├─────────────────────────────────────────────────────────────────┤
│  Data Layer                                                      │
│  ├── TypeORM             → Database abstraction                 │
│  ├── SQLite              → Default (development)                │
│  └── PostgreSQL          → Production recommended               │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Commands

### Development
```bash
pnpm install              # Install all dependencies
pnpm build > build.log 2>&1  # Build (redirect output to file)
pnpm dev                  # Start development mode
pnpm dev:ai               # AI/LangChain nodes development
```

### Testing
```bash
pnpm test                 # Run all unit tests
pnpm test:affected        # Run tests for changed files only
pnpm typecheck            # TypeScript type checking
pnpm --filter=n8n-playwright test:local  # E2E tests
```

### Code Quality
```bash
pnpm lint                 # Run ESLint
pnpm lint:fix             # Auto-fix linting issues
pnpm format               # Format code (Biome + Prettier)
```

## Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | Vue 3 + Composition API | Pinia for state |
| UI Library | Element Plus + @n8n/design-system | Custom components |
| Build | Vite | Fast HMR |
| Backend | Node.js + Express | TypeORM for DB |
| Database | SQLite / PostgreSQL | No MySQL in 2.0 |
| Testing | Jest (BE) + Vitest (FE) + Playwright (E2E) | |
| Language | TypeScript (strict) | No `any`, no `ts-ignore` |
| Monorepo | pnpm workspaces + Turborepo | |
| Formatting | Biome + Prettier | |

## Code Conventions for Gemini

### TypeScript Patterns
```typescript
// ✅ CORRECT: Proper typing
interface WorkflowData {
  id: string;
  nodes: INode[];
  connections: IConnections;
}

// ❌ WRONG: Using any
function processData(data: any) { ... }

// ✅ CORRECT: Use unknown with type guards
function processData(data: unknown): WorkflowData {
  if (isWorkflowData(data)) {
    return data;
  }
  throw new UserError('Invalid workflow data');
}
```

### Error Handling (2.0 Pattern)
```typescript
// ❌ DEPRECATED: Don't use ApplicationError
throw new ApplicationError('Something went wrong');

// ✅ CORRECT: Use specific error types
import { UserError, OperationalError, UnexpectedError } from '@n8n/errors';

throw new UserError('Invalid input provided');
throw new OperationalError('External service unavailable');
throw new UnexpectedError('This should never happen');
```

### Frontend i18n Pattern
```typescript
// ❌ WRONG: Hardcoded text
<span>Save Workflow</span>

// ✅ CORRECT: Use i18n
<span>{{ $t('workflows.save') }}</span>

// Add translation in @n8n/i18n package
```

## Common Development Tasks

### Implementing a Feature
1. **Types first**: Define interfaces in `packages/@n8n/api-types`
2. **Backend**: Implement in `packages/cli` (controller → service → repository)
3. **API**: Add REST endpoints
4. **Frontend**: Update `packages/editor-ui` with i18n
5. **Tests**: Unit tests + E2E if UI changes
6. **Verify**: Run `pnpm typecheck` and `pnpm lint`

### Adding a Node
1. Create `packages/nodes-base/nodes/YourNode/`
2. Implement `INodeType` interface
3. Add credentials if needed
4. Register in `packages/nodes-base/package.json`
5. Add workflow tests in `test/` subdirectory

## Warnings

| Issue | Guidance |
|-------|----------|
| Core Package | Contact n8n team before modifying `packages/core/` |
| New Nodes | PRs auto-closed unless requested by n8n team |
| Task Runners | Code nodes run isolated by default in 2.0 |
| Security | Watch for XSS, SQL injection, command injection |
| Breaking Changes | Document in `packages/cli/BREAKING-CHANGES.md` |

## Resources

- [n8n Documentation](https://docs.n8n.io)
- [Creating Nodes Guide](https://docs.n8n.io/integrations/creating-nodes/)
- [n8n 2.0 Breaking Changes](https://docs.n8n.io/2-0-breaking-changes/)
- [Migration Tool](https://docs.n8n.io/migration-tool-v2/)
- [Community Forum](https://community.n8n.io)
- [Contributing Guide](./CONTRIBUTING.md)
- [AGENTS.md](./AGENTS.md) - Shared agent guidelines
- [CLAUDE.md](./CLAUDE.md) - Claude-specific guidelines
