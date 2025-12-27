# CLAUDE.md - AI Assistant Guide for n8n

This document provides essential context for Claude AI assistants working on the n8n codebase.

> **See also**: [AGENTS.md](./AGENTS.md) for general agent guidelines shared across all AI assistants.

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

### Environment Variables (2.0)
```bash
N8N_RUNNERS_ENABLED=true          # Task runner (default: true in 2.0)
N8N_RESTRICT_FILE_ACCESS_TO=...   # File access restrictions
N8N_SKIP_AUTH_ON_OAUTH_CALLBACK=false  # OAuth security
```

## Project Overview

n8n is a workflow automation platform that combines no-code visual workflow building with the flexibility of writing code. It features 400+ integrations, native AI/LangChain capabilities, and is distributed under a fair-code license.

- **Version**: 2.1.4
- **License**: Sustainable Use License / n8n Enterprise License
- **Requirements**: See `engines` field in root `package.json` for current Node.js and pnpm version requirements

## Repository Structure

```
n8n/
├── packages/
│   ├── cli/              # Main n8n CLI application & backend server
│   ├── core/             # Core workflow execution engine (⚠️ contact n8n before changes)
│   ├── workflow/         # Workflow interfaces shared by frontend & backend
│   ├── nodes-base/       # 400+ built-in node integrations
│   ├── @n8n/
│   │   ├── api-types/    # Shared TypeScript interfaces (FE/BE)
│   │   ├── config/       # Centralized configuration management
│   │   ├── di/           # Dependency injection container
│   │   ├── nodes-langchain/  # AI/LangChain nodes
│   │   ├── task-runner/  # Code execution sandbox (key in 2.0)
│   │   └── i18n/         # Internationalization
│   ├── frontend/
│   │   ├── editor-ui/    # Vue 3 workflow editor
│   │   └── @n8n/design-system/  # UI component library
│   └── testing/
│       └── playwright/   # E2E tests (replaced Cypress in 2.0)
├── docker/               # Docker configurations
└── scripts/              # Build and utility scripts
```

## Quick Commands

### Development
```bash
pnpm install              # Install all dependencies
pnpm build > build.log 2>&1  # Build all packages (redirect output)
pnpm dev                  # Start development mode (all packages)
pnpm dev:be               # Backend-only development
pnpm dev:fe               # Frontend-only development
pnpm dev:ai               # AI/LangChain nodes development
pnpm start                # Start n8n in production mode
```

### Testing
```bash
pnpm test                 # Run all unit tests
pnpm test:affected        # Run tests for changed files only
pnpm typecheck            # Run TypeScript type checking
pnpm --filter=n8n-playwright test:local  # Run E2E tests (Playwright)
```

### Code Quality
```bash
pnpm lint                 # Run ESLint
pnpm lint:fix             # Fix linting issues
pnpm format               # Format code (Biome + Prettier)
```

## Technology Stack

### Backend
- **Runtime**: Node.js (see `package.json` for version)
- **Framework**: Express
- **Database**: SQLite (default), PostgreSQL (production recommended)
- **ORM**: TypeORM (forked as @n8n/typeorm)
- **Queue**: Bull (Redis-based)
- **DI**: @n8n/di for dependency injection
- **Testing**: Jest, Vitest

### Frontend
- **Framework**: Vue 3 with Composition API
- **State**: Pinia
- **UI Components**: Element Plus + custom @n8n/design-system
- **Build**: Vite
- **Testing**: Vitest, Playwright (E2E)
- **i18n**: vue-i18n

### Shared
- **Language**: TypeScript (strict mode, no `any`, no `ts-ignore`)
- **Monorepo**: pnpm workspaces + Turborepo
- **Linting**: ESLint (flat config)
- **Formatting**: Biome + Prettier
- **Git Hooks**: lefthook

## Code Conventions

### TypeScript Best Practices
- **NEVER use `any` type** - use proper types or `unknown`
- **Avoid type casting with `as`** - use type guards instead
- **Define shared interfaces** in `@n8n/api-types` for FE/BE communication
- Do NOT use `ts-ignore`

### Error Handling (2.0)
- **Don't use `ApplicationError`** - it's deprecated
- Use `UnexpectedError`, `OperationalError`, or `UserError` instead
- Import appropriate error classes from each package

### Frontend Development
- **All UI text must use i18n** - add translations to `@n8n/i18n`
- **Use CSS variables directly** - never hardcode spacing as px values
- **data-test-id must be single value** - no spaces or multiple values
- See `packages/frontend/CLAUDE.md` for CSS guidelines

### PR Title Format
Follow Angular commit convention. See [PR Title Conventions](.github/pull_request_title_conventions.md) for details.

```
<type>(<scope>): <summary>
```

### Testing Requirements
All PRs must include tests. See [CONTRIBUTING.md](./CONTRIBUTING.md#test-suite) for detailed requirements.

- **Backend**: Jest for unit tests, `nock` for server mocking
- **Frontend**: Vitest
- **E2E**: Playwright (run with `pnpm --filter=n8n-playwright test:local`)

## Common Development Tasks

### Implementing Features
1. Define API types in `packages/@n8n/api-types`
2. Implement backend logic in `packages/cli` module
3. Add API endpoints via controllers
4. Update frontend in `packages/editor-ui` with i18n support
5. Write tests with proper mocks
6. Run `pnpm typecheck` to verify types

### Adding a New Node
1. Create directory in `packages/nodes-base/nodes/YourNode/`
2. Implement node class extending `INodeType`
3. Add credentials in `packages/nodes-base/credentials/`
4. Register in `packages/nodes-base/package.json`
5. Add workflow tests

## Warnings

- **Core Package**: Contact the n8n team before making changes to `packages/core/`
- **New Nodes**: PRs adding new nodes are auto-closed unless requested by the n8n team
- **Typo-only PRs**: Will be rejected
- **Security**: Be aware of XSS, SQL injection, command injection risks
- **Breaking Changes**: Must be documented in `packages/cli/BREAKING-CHANGES.md`
- **Task Runners**: Code nodes now run in isolated environments by default

## Resources

- [Documentation](https://docs.n8n.io)
- [Creating Nodes Guide](https://docs.n8n.io/integrations/creating-nodes/)
- [n8n 2.0 Breaking Changes](https://docs.n8n.io/2-0-breaking-changes/)
- [Migration Tool](https://docs.n8n.io/migration-tool-v2/)
- [Community Forum](https://community.n8n.io)
- [Contributing Guide](./CONTRIBUTING.md)
