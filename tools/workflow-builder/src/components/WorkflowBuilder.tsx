import { GitPullRequest, GitBranch, Play, Zap, Brain, Shield, Wand2 } from 'lucide-react';
import type { WorkflowConfig } from '../types';

interface Props {
  config: WorkflowConfig;
  onChange: (config: WorkflowConfig) => void;
}

export function WorkflowBuilder({ config, onChange }: Props) {
  const updateConfig = (updates: Partial<WorkflowConfig>) => {
    onChange({ ...config, ...updates });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Column - Basic Settings */}
      <div className="space-y-6">
        {/* Workflow Name */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-claude-500" />
            Workflow Name
          </h2>
          <input
            type="text"
            value={config.name}
            onChange={(e) => updateConfig({ name: e.target.value })}
            className="input"
            placeholder="My Claude Review Workflow"
          />
        </div>

        {/* Triggers */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Play className="w-5 h-5 text-claude-500" />
            Triggers
          </h2>
          <div className="space-y-3">
            <TriggerOption
              icon={<GitPullRequest className="w-5 h-5" />}
              label="Pull Request"
              description="Run on PR open, sync, and ready for review"
              checked={config.triggers.pullRequest}
              onChange={(checked) =>
                updateConfig({ triggers: { ...config.triggers, pullRequest: checked } })
              }
            />
            <TriggerOption
              icon={<GitBranch className="w-5 h-5" />}
              label="Push to Branch"
              description="Run when code is pushed to specified branches"
              checked={config.triggers.push}
              onChange={(checked) =>
                updateConfig({ triggers: { ...config.triggers, push: checked } })
              }
            />
            <TriggerOption
              icon={<Play className="w-5 h-5" />}
              label="Manual Trigger"
              description="Allow running workflow manually from GitHub UI"
              checked={config.triggers.manual}
              onChange={(checked) =>
                updateConfig({ triggers: { ...config.triggers, manual: checked } })
              }
            />
          </div>
        </div>

        {/* Target Branches */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-claude-500" />
            Target Branches
          </h2>
          <div className="flex flex-wrap gap-2">
            {config.branches.map((branch, index) => (
              <span
                key={index}
                className="px-3 py-1.5 bg-dark-800 border border-dark-700 rounded-lg text-sm text-dark-200 flex items-center gap-2"
              >
                {branch}
                <button
                  onClick={() =>
                    updateConfig({
                      branches: config.branches.filter((_, i) => i !== index),
                    })
                  }
                  className="text-dark-500 hover:text-red-400 transition-colors"
                >
                  &times;
                </button>
              </span>
            ))}
            <input
              type="text"
              placeholder="Add branch..."
              className="px-3 py-1.5 bg-transparent border border-dashed border-dark-600 rounded-lg text-sm text-dark-300 placeholder-dark-500 focus:outline-none focus:border-claude-500 w-32"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const input = e.target as HTMLInputElement;
                  if (input.value.trim()) {
                    updateConfig({ branches: [...config.branches, input.value.trim()] });
                    input.value = '';
                  }
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Right Column - Claude Settings */}
      <div className="space-y-6">
        {/* Model Selection */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Brain className="w-5 h-5 text-claude-500" />
            Claude Model
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <ModelOption
              model="opus"
              label="Opus 4.5"
              description="Most capable"
              selected={config.model === 'opus'}
              onSelect={() => updateConfig({ model: 'opus' })}
            />
            <ModelOption
              model="sonnet"
              label="Sonnet 4"
              description="Balanced"
              selected={config.model === 'sonnet'}
              onSelect={() => updateConfig({ model: 'sonnet' })}
            />
            <ModelOption
              model="haiku"
              label="Haiku 3.5"
              description="Fast & light"
              selected={config.model === 'haiku'}
              onSelect={() => updateConfig({ model: 'haiku' })}
            />
          </div>
        </div>

        {/* Thinking Mode */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-claude-500" />
            Thinking Mode
          </h2>
          <div className="space-y-3">
            <ThinkingOption
              mode="ultrathink"
              label="Ultrathink"
              description="Maximum reasoning depth for complex code review"
              selected={config.thinkingMode === 'ultrathink'}
              onSelect={() => updateConfig({ thinkingMode: 'ultrathink' })}
            />
            <ThinkingOption
              mode="extended"
              label="Extended Thinking"
              description="Enhanced reasoning for thorough analysis"
              selected={config.thinkingMode === 'extended'}
              onSelect={() => updateConfig({ thinkingMode: 'extended' })}
            />
            <ThinkingOption
              mode="normal"
              label="Normal"
              description="Standard reasoning for quick reviews"
              selected={config.thinkingMode === 'normal'}
              onSelect={() => updateConfig({ thinkingMode: 'normal' })}
            />
          </div>
        </div>

        {/* Review Scope */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-claude-500" />
            Review Scope
          </h2>
          <div className="space-y-3">
            <ScopeOption
              scope="full"
              label="Full Review"
              description="Comprehensive code quality, patterns, and security"
              selected={config.reviewScope === 'full'}
              onSelect={() => updateConfig({ reviewScope: 'full' })}
            />
            <ScopeOption
              scope="diff"
              label="Diff Only"
              description="Focus only on changed lines and their context"
              selected={config.reviewScope === 'diff'}
              onSelect={() => updateConfig({ reviewScope: 'diff' })}
            />
            <ScopeOption
              scope="security"
              label="Security Focus"
              description="Prioritize security vulnerabilities and risks"
              selected={config.reviewScope === 'security'}
              onSelect={() => updateConfig({ reviewScope: 'security' })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TriggerOption({
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
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 w-5 h-5 rounded border-dark-600 bg-dark-700 text-claude-600 focus:ring-claude-500/30"
      />
      <div className="flex-1">
        <div className="flex items-center gap-2 text-white font-medium">
          <span className="text-claude-500">{icon}</span>
          {label}
        </div>
        <p className="text-sm text-dark-400 mt-0.5">{description}</p>
      </div>
    </label>
  );
}

function ModelOption({
  model,
  label,
  description,
  selected,
  onSelect,
}: {
  model: string;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`p-4 rounded-xl border-2 text-left transition-all duration-200 ${
        selected
          ? 'border-claude-500 bg-claude-500/10 shadow-lg shadow-claude-500/10'
          : 'border-dark-700 bg-dark-800/50 hover:border-dark-600'
      }`}
    >
      <div className={`text-sm font-semibold ${selected ? 'text-claude-400' : 'text-white'}`}>
        {label}
      </div>
      <div className="text-xs text-dark-400 mt-1">{description}</div>
    </button>
  );
}

function ThinkingOption({
  mode,
  label,
  description,
  selected,
  onSelect,
}: {
  mode: string;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`flex items-center gap-4 p-4 rounded-lg cursor-pointer transition-all duration-200 ${
        selected
          ? 'bg-claude-500/10 border border-claude-500/30'
          : 'bg-dark-800/50 border border-transparent hover:bg-dark-800'
      }`}
    >
      <input
        type="radio"
        name="thinkingMode"
        checked={selected}
        onChange={onSelect}
        className="w-5 h-5 border-dark-600 bg-dark-700 text-claude-600 focus:ring-claude-500/30"
      />
      <div>
        <div className={`font-medium ${selected ? 'text-claude-400' : 'text-white'}`}>{label}</div>
        <p className="text-sm text-dark-400">{description}</p>
      </div>
    </label>
  );
}

function ScopeOption({
  scope,
  label,
  description,
  selected,
  onSelect,
}: {
  scope: string;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`flex items-center gap-4 p-4 rounded-lg cursor-pointer transition-all duration-200 ${
        selected
          ? 'bg-claude-500/10 border border-claude-500/30'
          : 'bg-dark-800/50 border border-transparent hover:bg-dark-800'
      }`}
    >
      <input
        type="radio"
        name="reviewScope"
        checked={selected}
        onChange={onSelect}
        className="w-5 h-5 border-dark-600 bg-dark-700 text-claude-600 focus:ring-claude-500/30"
      />
      <div>
        <div className={`font-medium ${selected ? 'text-claude-400' : 'text-white'}`}>{label}</div>
        <p className="text-sm text-dark-400">{description}</p>
      </div>
    </label>
  );
}
