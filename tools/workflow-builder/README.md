# Claude Workflow Builder

A beautiful, minimal frontend for creating GitHub Actions workflows that use Claude Code Opus 4.5 with ultrathink mode for intelligent code review.

![Claude Workflow Builder](./preview.png)

## Features

- **Visual Workflow Builder** - Configure triggers, branches, and review settings through an intuitive UI
- **Claude Model Selection** - Choose between Opus 4.5, Sonnet 4, or Haiku 3.5 based on your needs
- **Thinking Modes** - Ultrathink for deep analysis, Extended for thorough review, Normal for quick checks
- **Review Scopes** - Full review, diff-only, or security-focused analysis
- **Live YAML Preview** - See your workflow configuration in real-time with syntax highlighting
- **One-Click Export** - Download your workflow file ready for `.github/workflows/`
- **Cost Estimation** - Get approximate cost per review based on your configuration

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build
```

## Usage

1. **Build Workflow Tab** - Configure your triggers, select Claude model, and set thinking mode
2. **YAML Preview Tab** - View and copy the generated GitHub Actions workflow
3. **Review Settings Tab** - Fine-tune review behavior and add custom prompts

## Configuration Options

### Triggers
- **Pull Request** - Run on PR open, sync, and ready for review
- **Push to Branch** - Run when code is pushed to specified branches
- **Manual Trigger** - Allow running workflow manually from GitHub UI

### Claude Models
| Model | Best For | Cost |
|-------|----------|------|
| **Opus 4.5** | Complex reviews, architecture decisions | $$$ |
| **Sonnet 4** | Balanced quality and speed | $$ |
| **Haiku 3.5** | Quick checks, large PRs | $ |

### Thinking Modes
- **Ultrathink** - Maximum reasoning depth (128k token budget)
- **Extended** - Enhanced reasoning (32k token budget)
- **Normal** - Standard reasoning (8k token budget)

### Review Scopes
- **Full Review** - Comprehensive code quality, patterns, and security
- **Diff Only** - Focus only on changed lines and their context
- **Security Focus** - Prioritize security vulnerabilities and risks

## Generated Workflow

The builder generates a complete GitHub Actions workflow that:

1. Checks out your code
2. Installs Claude Code CLI
3. Runs intelligent code review with your settings
4. Posts review summary as PR comment
5. Optionally blocks merge on critical issues

## Requirements

To use the generated workflow, you need:

- **ANTHROPIC_API_KEY** - Set as a GitHub repository secret
- **Claude Code CLI** - Installed automatically by the workflow

## Tech Stack

- React 18 + TypeScript
- Vite for blazing fast development
- Tailwind CSS for beautiful styling
- Lucide React for crisp icons

## License

MIT - Use freely in your projects
