import { Settings, MessageSquare, AlertTriangle, Wrench, FileText } from 'lucide-react';
import type { WorkflowConfig } from '../types';

interface Props {
  config: WorkflowConfig;
  onChange: (config: WorkflowConfig) => void;
}

export function ReviewPanel({ config, onChange }: Props) {
  const updateConfig = (updates: Partial<WorkflowConfig>) => {
    onChange({ ...config, ...updates });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Review Behavior */}
      <div className="space-y-6">
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5 text-claude-500" />
            Review Behavior
          </h2>

          <div className="space-y-4">
            <ToggleOption
              icon={<MessageSquare className="w-5 h-5" />}
              label="Create PR Comments"
              description="Post inline comments on specific code lines"
              checked={config.createComments}
              onChange={(checked) => updateConfig({ createComments: checked })}
            />

            <ToggleOption
              icon={<Wrench className="w-5 h-5" />}
              label="Auto-fix Suggestions"
              description="Automatically apply safe code fixes when possible"
              checked={config.autoFix}
              onChange={(checked) => updateConfig({ autoFix: checked })}
            />

            <ToggleOption
              icon={<AlertTriangle className="w-5 h-5" />}
              label="Block on Critical Issues"
              description="Fail the workflow if critical issues are found"
              checked={config.blockOnIssues}
              onChange={(checked) => updateConfig({ blockOnIssues: checked })}
            />
          </div>
        </div>

        {/* Info Cards */}
        <div className="card bg-gradient-to-br from-claude-600/10 to-claude-800/10 border-claude-500/20">
          <h3 className="text-sm font-semibold text-claude-400 mb-2">About Ultrathink Mode</h3>
          <p className="text-sm text-dark-300">
            Ultrathink enables Claude to spend more time reasoning about complex code patterns,
            security implications, and architectural decisions. This is ideal for critical code
            paths and security-sensitive reviews.
          </p>
        </div>

        <div className="card bg-gradient-to-br from-emerald-600/10 to-emerald-800/10 border-emerald-500/20">
          <h3 className="text-sm font-semibold text-emerald-400 mb-2">Cost Optimization</h3>
          <p className="text-sm text-dark-300">
            Use "Diff Only" scope for routine PRs to reduce token usage. Reserve "Full Review"
            for major features and "Security Focus" for auth or payment code changes.
          </p>
        </div>
      </div>

      {/* Custom Prompt */}
      <div className="space-y-6">
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-claude-500" />
            Custom Review Instructions
          </h2>
          <p className="text-sm text-dark-400 mb-4">
            Add custom instructions to guide Claude's review focus. These will be prepended to the
            default review prompt.
          </p>
          <textarea
            value={config.customPrompt || ''}
            onChange={(e) => updateConfig({ customPrompt: e.target.value })}
            placeholder="Example: Focus on TypeScript type safety. Flag any use of 'any' type. Check for proper error handling in async functions..."
            className="input min-h-[200px] resize-y font-mono text-sm"
          />
          <div className="mt-3 text-xs text-dark-500">
            {(config.customPrompt?.length || 0)} / 2000 characters
          </div>
        </div>

        {/* Quick Templates */}
        <div className="card">
          <h3 className="text-sm font-semibold text-dark-300 mb-3">Quick Templates</h3>
          <div className="flex flex-wrap gap-2">
            {promptTemplates.map((template) => (
              <button
                key={template.name}
                onClick={() => updateConfig({ customPrompt: template.prompt })}
                className="px-3 py-1.5 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-lg text-sm text-dark-300 hover:text-white transition-colors"
              >
                {template.name}
              </button>
            ))}
          </div>
        </div>

        {/* Current Config Summary */}
        <div className="card">
          <h3 className="text-sm font-semibold text-dark-300 mb-3">Configuration Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-dark-400">Model</span>
              <span className="text-claude-400 font-medium capitalize">{config.model} 4.5</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-400">Thinking Mode</span>
              <span className="text-claude-400 font-medium capitalize">{config.thinkingMode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-400">Review Scope</span>
              <span className="text-claude-400 font-medium capitalize">{config.reviewScope}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-400">Target Branches</span>
              <span className="text-dark-200">{config.branches.join(', ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-400">Est. Cost per Review</span>
              <span className="text-emerald-400 font-medium">
                ${estimateCost(config).toFixed(2)} - ${(estimateCost(config) * 3).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleOption({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-4 p-4 bg-dark-800/50 rounded-lg cursor-pointer hover:bg-dark-800 transition-colors">
      <div className="flex-1">
        <div className="flex items-center gap-2 text-white font-medium">
          <span className="text-claude-500">{icon}</span>
          {label}
        </div>
        <p className="text-sm text-dark-400 mt-0.5">{description}</p>
      </div>
      <div className="relative inline-flex items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-dark-700 rounded-full peer-checked:bg-claude-600 transition-colors
                        after:content-[''] after:absolute after:top-0.5 after:left-0.5
                        after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow
                        after:transition-all peer-checked:after:translate-x-5"></div>
      </div>
    </label>
  );
}

const promptTemplates = [
  {
    name: 'TypeScript Strict',
    prompt:
      'Focus on TypeScript type safety. Flag any use of "any" type. Check for proper generic constraints. Verify null checks are in place.',
  },
  {
    name: 'Security Review',
    prompt:
      'Focus on security vulnerabilities. Check for XSS, SQL injection, command injection. Verify input validation. Check authentication and authorization.',
  },
  {
    name: 'Performance',
    prompt:
      'Focus on performance issues. Flag N+1 queries, unnecessary re-renders, memory leaks. Check for proper caching strategies.',
  },
  {
    name: 'React Best Practices',
    prompt:
      'Focus on React patterns. Check hook dependencies, avoid prop drilling, verify proper memo usage. Flag direct state mutations.',
  },
];

function estimateCost(config: WorkflowConfig): number {
  const baseCosts = {
    opus: 0.15,
    sonnet: 0.03,
    haiku: 0.008,
  };

  const thinkingMultiplier = {
    ultrathink: 3,
    extended: 1.5,
    normal: 1,
  };

  const scopeMultiplier = {
    full: 2,
    diff: 1,
    security: 1.5,
  };

  return (
    baseCosts[config.model] *
    thinkingMultiplier[config.thinkingMode] *
    scopeMultiplier[config.reviewScope]
  );
}
