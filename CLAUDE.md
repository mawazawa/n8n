# CLAUDE.md - AI Assistant Guide for n8n

This document provides essential context for AI assistants working on the n8n codebase.

## AI Assistant Guidelines

When working on this codebase, AI assistants should:

- **Prefer small, focused changes**: Make minimal modifications to accomplish the task. Avoid refactoring unrelated code.
- **Avoid sensitive packages**: Do not modify `packages/core/` without explicit approval from the n8n team.
- **Surface uncertainties**: If unsure about architectural decisions or conventions, ask clarifying questions rather than guessing.
- **Run tests before committing**: Always run `pnpm test` for affected packages to catch regressions.
- **Follow existing patterns**: Match the code style and patterns already present in the file or package you're modifying.
- **Reference canonical docs**: For detailed contributor guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Project Overview

n8n is a workflow automation platform that combines no-code visual workflow building with the flexibility of writing code. It features 400+ integrations, native AI/LangChain capabilities, and is distributed under a fair-code license.

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
│   ├── node-dev/         # CLI tool for developing custom nodes
│   ├── frontend/
│   │   ├── editor-ui/    # Vue 3 workflow editor (main frontend)
│   │   └── @n8n/         # Frontend shared packages
│   │       ├── design-system/  # UI component library
│   │       ├── chat/           # Chat widget
│   │       ├── composables/    # Vue composables
│   │       ├── i18n/           # Internationalization
│   │       ├── rest-api-client/# API client
│   │       └── stores/         # Pinia stores
│   ├── @n8n/             # Backend shared packages
│   │   ├── api-types/    # API type definitions
│   │   ├── backend-common/# Backend utilities
│   │   ├── config/       # Configuration management
│   │   ├── constants/    # Shared constants
│   │   ├── db/           # Database layer
│   │   ├── decorators/   # TypeScript decorators
│   │   ├── di/           # Dependency injection
│   │   ├── errors/       # Error types
│   │   ├── nodes-langchain/# AI/LangChain nodes
│   │   ├── permissions/  # Permission system
│   │   ├── task-runner/  # Code execution sandbox
│   │   └── eslint-config/# ESLint configuration
│   ├── testing/
│   │   ├── playwright/   # E2E tests with Playwright
│   │   └── containers/   # Test container utilities
│   └── extensions/       # n8n extensions
├── cypress/              # Legacy E2E tests (Cypress)
├── docker/               # Docker configurations
└── scripts/              # Build and utility scripts
```

## Quick Commands

### Development
```bash
pnpm install          # Install all dependencies
pnpm build            # Build all packages
pnpm dev              # Start development mode (all packages)
pnpm dev:be           # Backend-only development
pnpm dev:fe           # Frontend-only development
pnpm dev:ai           # AI/LangChain nodes development
pnpm start            # Start n8n in production mode
```

### Testing
```bash
pnpm test             # Run all unit tests
pnpm test:backend     # Run backend tests only
pnpm test:frontend    # Run frontend tests only
pnpm test:nodes       # Run node tests only
pnpm dev:e2e          # Run E2E tests interactively
```

### Code Quality
```bash
pnpm lint             # Run ESLint
pnpm lintfix          # Fix linting issues
pnpm format           # Format code (Biome + Prettier)
pnpm typecheck        # Run TypeScript type checking
```

### Package-specific Commands
Run commands in specific packages:
```bash
cd packages/cli && pnpm test     # Run CLI tests
cd packages/nodes-base && pnpm lint  # Lint nodes
```

## Technology Stack

### Backend
- **Runtime**: Node.js (see `package.json` for version)
- **Framework**: Express
- **Database**: SQLite (default), PostgreSQL, MySQL/MariaDB
- **ORM**: TypeORM (forked as @n8n/typeorm)
- **Queue**: Bull (Redis-based)
- **Testing**: Jest, Vitest

### Frontend
- **Framework**: Vue 3 with Composition API
- **State**: Pinia
- **UI Components**: Element Plus + custom @n8n/design-system
- **Build**: Vite
- **Testing**: Vitest, Playwright
- **i18n**: vue-i18n

### Shared
- **Language**: TypeScript (strict mode)
- **Monorepo**: pnpm workspaces + Turborepo
- **Linting**: ESLint (flat config)
- **Formatting**: Biome + Prettier (frontend)

## Code Conventions

### PR Title Format

Follow Angular commit convention. See [PR Title Conventions](.github/pull_request_title_conventions.md) for full details.

```
<type>(<scope>): <summary>
```

Append `(no-changelog)` for changes that shouldn't appear in changelog.

### TypeScript Guidelines
- Do NOT use `ts-ignore`
- Strict TypeScript compliance required
- Use proper typing, avoid `any`
- Reuse existing types from `n8n-workflow` package

### Node Development

Nodes live in `packages/nodes-base/nodes/`. See [Creating Nodes Guide](https://docs.n8n.io/integrations/creating-nodes/) for structure and best practices.

Credentials go in `packages/nodes-base/credentials/`.

### Testing Requirements

All PRs must include tests. See [CONTRIBUTING.md](./CONTRIBUTING.md#test-suite) for detailed testing requirements.

### File Naming
- Node files: `PascalCase.node.ts`
- Credential files: `PascalCase.credentials.ts`
- Test files: `*.test.ts` or `*.spec.ts`
- Vue components: `PascalCase.vue`

## Important Files

- `packages/cli/BREAKING-CHANGES.md` - Document breaking changes here
- `packages/cli/src/commands/` - CLI command implementations
- `packages/workflow/src/` - Core workflow types and interfaces
- `packages/nodes-base/nodes/` - All built-in nodes
- `packages/frontend/editor-ui/src/` - Main frontend application

## Database Support

The CLI supports multiple databases:
- **SQLite**: Default, file-based
- **PostgreSQL**: Production recommended
- **MySQL/MariaDB**: Supported

Run tests against specific databases:
```bash
pnpm test:sqlite   # Default
pnpm test:postgres
pnpm test:mysql
pnpm test:mariadb
```

## Environment Variables

Key development environment variables:
- `N8N_DEV_RELOAD=true` - Enable hot reload for nodes
- `N8N_LOG_LEVEL` - Logging level (debug, info, warn, error)
- `DB_TYPE` - Database type (sqlite, postgresdb, mysqldb, mariadb)
- `COVERAGE_ENABLED=true` - Enable test coverage

## Common Tasks

### Adding a New Node
1. Create directory in `packages/nodes-base/nodes/YourNode/`
2. Implement node class extending `INodeType`
3. Add credentials in `packages/nodes-base/credentials/`
4. Register in `packages/nodes-base/package.json` under `n8n.nodes` and `n8n.credentials`
5. Add workflow tests

### Modifying the Frontend
1. Run `pnpm dev:fe` for hot reloading
2. Components are in `packages/frontend/editor-ui/src/components/`
3. Use design system components from `@n8n/design-system`
4. State management via Pinia stores in `@n8n/stores`

### Backend API Changes
1. API routes are in `packages/cli/src/controllers/`
2. API types go in `packages/@n8n/api-types/`
3. Update OpenAPI spec if applicable

## Warnings

- **Core Package**: Contact the n8n team before making changes to `packages/core/`
- **New Nodes**: PRs adding new nodes are auto-closed unless requested by the n8n team
- **Typo-only PRs**: Will be rejected
- **Security**: Be aware of XSS, SQL injection, command injection risks
- **Breaking Changes**: Must be documented in `packages/cli/BREAKING-CHANGES.md`

## Resources

- [Documentation](https://docs.n8n.io)
- [Creating Nodes Guide](https://docs.n8n.io/integrations/creating-nodes/)
- [Community Forum](https://community.n8n.io)
- [Contributing Guide](./CONTRIBUTING.md)
- [PR Title Conventions](.github/pull_request_title_conventions.md)
