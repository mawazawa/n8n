# GEMINI.md - AI Assistant Guide for n8n

> **Optimized for Gemini's 1M+ token context window**
> Today's Date: Check system date - this matters for temporal reasoning

This document provides essential context for Gemini AI assistants working on the n8n codebase. Leverage your extended context window to maintain comprehensive awareness across the entire codebase.

---

## Context Window Strategy

**You have 1,000,000+ tokens of context.** Use this strategically:

1. **Load full file contents** rather than snippets when analyzing
2. **Keep entire TODO.md, ROADMAP.md, and CHANGELOG in context** for coherent planning
3. **Reference multiple related files simultaneously** for cross-cutting changes
4. **Maintain conversation history** for complex multi-step tasks
5. **Include test files alongside implementation** for verification

### Recommended Context Loading Order

```
1. GEMINI.md (this file)
2. ROADMAP.md (strategic vision)
3. TODO.md (all atomic subtasks)
4. AI_CHANGELOG.md (recent progress)
5. Relevant package.json files
6. Source files for current task
7. Related test files
8. Documentation files
```

---

## Project Overview

n8n is a workflow automation platform that combines no-code visual workflow building with the flexibility of writing code. It features 400+ integrations, native AI/LangChain capabilities, and is distributed under a fair-code license.

- **Version**: 1.103.0 (monorepo)
- **License**: Sustainable Use License / n8n Enterprise License
- **Node.js**: >=22.16
- **Package Manager**: pnpm >=10.2.1 (use corepack)

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

## Technology Stack

### Backend
- **Runtime**: Node.js 22+
- **Framework**: Express 5
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
- **Language**: TypeScript 5.8+
- **Monorepo**: pnpm workspaces + Turborepo
- **Linting**: ESLint 9 (flat config)
- **Formatting**: Biome + Prettier (frontend)

## Code Conventions

### PR Title Format
Follow Angular commit convention:
```
<type>(<scope>): <summary>
```

**Types**: `feat`, `fix`, `perf`, `test`, `docs`, `refactor`, `build`, `ci`, `chore`

**Scopes**: `API`, `benchmark`, `core`, `editor`, `* Node` (e.g., "Slack Node")

### TypeScript Guidelines
- Do NOT use `ts-ignore`
- Strict TypeScript compliance required
- Use proper typing, avoid `any`
- Reuse existing types from `n8n-workflow` package

### File Naming
- Node files: `PascalCase.node.ts`
- Credential files: `PascalCase.credentials.ts`
- Test files: `*.test.ts` or `*.spec.ts`
- Vue components: `PascalCase.vue`

---

## AI Agent Operating Rules

> **CRITICAL**: Every AI agent working on this repository MUST follow these rules.

### Rule 1: High-Leverage Action Awareness

Every AI agent must maintain awareness of the **next 10 highest-leverage actions** that could be taken to achieve this repository's goals. These actions must:

1. Be ranked by impact/effort ratio
2. Align with the strategic vision in `ROADMAP.md`
3. Be broken down into 10-20 atomic subtasks each
4. Have clear, measurable success criteria
5. Be scoped to touch no more than 5 files per subtask

### Rule 2: Atomic Subtask Structure

Each subtask in `TODO.md` must have:

| Field | Requirement |
|-------|-------------|
| **ID** | Unique identifier (e.g., 1.2.3) |
| **Task** | Clear, actionable description |
| **Files** | Maximum 5 files affected |
| **Success Criteria** | Measurable condition for "done" |
| **Status** | ⬜/🔄/✅/❌ |

### Rule 3: Web Research First (Temporal Metacognition)

**NEVER rely on training data for solutions.** AI and tooling evolve daily. Before implementing any solution:

1. **Search the web** for current best practices (include today's year in search)
2. **Check official documentation** for latest API/syntax
3. **Verify package versions** are current
4. **Look for breaking changes** in recent releases
5. **Consider alternatives** that may have emerged

### Rule 4: Temporal Awareness - DATE MATTERS

> **IMPORTANT FOR GEMINI**: Always check the current date before making decisions.

- **Today's date** should inform your search queries
- Include the **current year** in all web searches
- Be aware that your training data may be **outdated**
- Verify solutions against **current** documentation
- Note when package versions have changed since training

**Example search patterns:**
```
"Vitest migration best practices 2025"
"Vue 3 Module Federation December 2025"
"Zod TypeScript inference latest"
```

### Rule 5: Changelog Discipline

After completing **every** tested action, immediately update `AI_CHANGELOG.md`:

```markdown
| YYYY-MM-DD HH:MM | Completed [TODO.md ID]: [Description] | Gemini | ✅ |
```

### Rule 6: Leverage Your Context Window

**Gemini-specific guidance for 1M+ context:**

1. **Load holistically**: Read entire files, not just snippets
2. **Cross-reference**: Keep multiple related files in context simultaneously
3. **Pattern recognition**: Use your context to identify patterns across the codebase
4. **Coherent changes**: Make consistent changes across many files at once
5. **Full test coverage**: Include both implementation and test files in context

### Rule 7: Success Criteria via Web Research

Success criteria must be determined through web research, not assumed:

```
❌ Wrong: "Tests pass"
✅ Right: "All 50 tests pass with Vitest 3.x (verified via `pnpm test`),
         coverage >80% per 2025 Vitest best practices"
```

### Rule 8: File Documentation Links

Key files for AI agents:

| File | Purpose |
|------|---------|
| `ROADMAP.md` | Strategic vision and phase planning |
| `TODO.md` | Atomic subtasks with success criteria |
| `AI_CHANGELOG.md` | AI agent progress tracking |
| `CLAUDE.md` | Claude-specific guidance |
| `GEMINI.md` | This file - Gemini-specific guidance |

### Rule 9: Scope Discipline

Never exceed 5 files per subtask. If a task requires more:

1. **Split the task** into smaller subtasks
2. **Create dependencies** between subtasks
3. **Document the split** in TODO.md
4. **Update progress tracking** accordingly

### Rule 10: Verification Before Completion

Before marking any task ✅ Complete:

1. Run relevant tests (`pnpm test`, `pnpm lint`, `pnpm typecheck`)
2. Verify the success criteria are met
3. Check for regressions in related functionality
4. Update AI_CHANGELOG.md with timestamp
5. Determine next high-leverage actions

---

## Gemini-Specific Optimizations

### Using Your Extended Context

With 1M+ tokens, you can:

1. **Analyze entire packages** at once for refactoring
2. **Compare all node implementations** to find patterns
3. **Review full test suites** for consistency
4. **Track complex dependencies** across the monorepo
5. **Maintain full conversation history** for multi-step tasks

### Recommended Workflows

**For Package Migration (e.g., Jest→Vitest):**
```
1. Load: jest.config.js + all *.test.ts files in package
2. Load: Vitest migration guide from web search
3. Transform all files with consistent patterns
4. Verify with test run
5. Update TODO.md and AI_CHANGELOG.md
```

**For Cross-Cutting Changes (e.g., Zod adoption):**
```
1. Load: All node definition files (patterns)
2. Load: Target node + related test files
3. Load: Zod schemas from workflow package
4. Implement with type inference
5. Verify types + runtime behavior
```

---

## Current High-Leverage Actions

> See `TODO.md` for the full breakdown. Below are the current top 10:

1. **[1.1.x]** Set up Vitest infrastructure for monorepo migration
2. **[1.2.x]** Migrate @n8n/* packages from Jest to Vitest
3. **[1.3.x]** Migrate core packages (cli, core, workflow, nodes-base)
4. **[2.1.x]** Create Zod schema infrastructure for node definitions
5. **[2.2.x]** Build type inference utilities for Zod→INodeProperties
6. **[2.3.x]** Convert pilot nodes to Zod-based definitions
7. **[3.1.x]** Set up Module Federation host application
8. **[3.2.x]** Extract node panels as federated remotes
9. **[3.3.x]** Implement lazy loading with prefetching
10. **[3.4.x]** Configure build and deploy for federated modules

---

## Resources

- [Documentation](https://docs.n8n.io)
- [Creating Nodes Guide](https://docs.n8n.io/integrations/creating-nodes/)
- [Community Forum](https://community.n8n.io)
- [Contributing Guide](./CONTRIBUTING.md)
- [PR Title Conventions](.github/pull_request_title_conventions.md)

---

*Last Updated: 2025-12-27*
*This document is maintained by AI agents and human reviewers.*
*Optimized for Gemini's 1M+ token context window.*
