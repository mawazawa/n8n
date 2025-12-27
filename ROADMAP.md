# n8n Roadmap

> Strategic vision for n8n repository improvements and AI-assisted development

## Vision Statement

Transform n8n into a more maintainable, performant, and developer-friendly platform through three strategic upgrades while establishing best practices for AI-assisted development workflows.

---

## Phase 1: Testing Infrastructure Modernization (Weeks 1-3)

### Goal
Unify the testing framework by migrating all Jest-based tests to Vitest, reducing complexity and improving developer experience.

### Strategic Value
- **Performance**: 2-5x faster test execution
- **Consistency**: Single testing API across all packages
- **ESM Native**: Better support for modern JavaScript
- **DX**: Improved watch mode and error reporting

### Key Metrics
- [ ] 0 Jest config files remaining
- [ ] 100% test pass rate maintained
- [ ] CI pipeline time reduced by 40%+
- [ ] All 17 backend packages migrated

---

## Phase 2: Type-Safe Node Definitions with Zod (Weeks 4-6)

### Goal
Implement Zod-based schema validation for node definitions, enabling auto-generated TypeScript types and runtime validation.

### Strategic Value
- **Type Safety**: Runtime validation matches compile-time types
- **Developer Experience**: 40-50% less boilerplate in node definitions
- **Auto-generation**: JSON Schema for UI derived from Zod schemas
- **Error Prevention**: Catch configuration errors at build time

### Key Metrics
- [ ] Core node definition types use Zod
- [ ] 10 pilot nodes converted to new system
- [ ] Documentation for node developers updated
- [ ] Zero runtime type errors in converted nodes

---

## Phase 3: Frontend Module Federation (Weeks 7-10)

### Goal
Implement Module Federation for the editor-ui to enable lazy-loading of node panels and improve initial load performance.

### Strategic Value
- **Performance**: 60%+ reduction in initial bundle size
- **Scalability**: Support for 400+ nodes without bundle bloat
- **Extensibility**: Foundation for community UI plugins
- **Independence**: Deploy node UIs independently

### Key Metrics
- [ ] Initial bundle size < 500KB
- [ ] Node panels load on-demand
- [ ] Time to interactive < 2 seconds
- [ ] Core UI and node panels decoupled

---

## Continuous: AI-Assisted Development Standards

### Goal
Establish best practices for AI agents working on this codebase through CLAUDE.md, GEMINI.md, and structured task management.

### Standards
- **High-Leverage Actions**: Always maintain top 10 prioritized actions
- **Atomic Subtasks**: Each task scoped to ≤5 files with clear success criteria
- **Web Research First**: Use current 2025 sources, not training data
- **Documentation**: CHANGELOG.md updated after each completed action
- **Temporal Awareness**: Account for rapidly evolving AI/tooling landscape

---

## Success Indicators

| Phase | Indicator | Target | Current |
|-------|-----------|--------|---------|
| 1 | Jest configs remaining | 0 | 17 |
| 1 | Test execution time | -40% | Baseline |
| 2 | Nodes using Zod | 10+ | 0 |
| 2 | Boilerplate reduction | 40% | 0% |
| 3 | Initial bundle size | <500KB | ~2MB |
| 3 | Time to interactive | <2s | ~4s |

---

## Dependencies & Risks

### Dependencies
- Vitest 3.x stable (✓ Available)
- Zod 3.x (✓ Already in use)
- vite-plugin-federation (✓ Maintained)
- Vue 3.5+ (✓ Already in use)

### Risks
- **Jest-specific mocking patterns** - Mitigate with codemod + manual review
- **Node definition backwards compatibility** - Mitigate with gradual migration
- **Module Federation dev mode limitations** - Mitigate with fallback bundling

---

## Timeline Overview

```
Week 1-2:   Jest→Vitest: Backend shared packages (@n8n/*)
Week 2-3:   Jest→Vitest: Core packages (cli, core, workflow, nodes-base)
Week 4-5:   Zod: Core type definitions and infrastructure
Week 5-6:   Zod: Pilot node conversions and documentation
Week 7-8:   Module Federation: Infrastructure and host setup
Week 9-10:  Module Federation: Remote extraction and optimization
```

---

*Last Updated: 2025-12-27*
*Maintained by: AI Agents (Claude, Gemini) + Human Reviewers*
