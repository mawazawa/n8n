import { useState } from 'react';
import { Header } from './components/Header';
import { WorkflowBuilder } from './components/WorkflowBuilder';
import { YamlPreview } from './components/YamlPreview';
import { ReviewPanel } from './components/ReviewPanel';
import type { WorkflowConfig } from './types';

const defaultConfig: WorkflowConfig = {
  name: 'Claude Code Review',
  triggers: {
    pullRequest: true,
    push: false,
    manual: true,
  },
  model: 'opus',
  thinkingMode: 'ultrathink',
  reviewScope: 'full',
  branches: ['main', 'develop'],
  autoFix: false,
  createComments: true,
  blockOnIssues: false,
};

function App() {
  const [config, setConfig] = useState<WorkflowConfig>(defaultConfig);
  const [activeTab, setActiveTab] = useState<'build' | 'preview' | 'review'>('build');

  return (
    <div className="min-h-screen bg-dark-950">
      <Header />

      {/* Tab Navigation */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="flex gap-1 p-1 bg-dark-900 rounded-xl w-fit">
          {(['build', 'preview', 'review'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2.5 rounded-lg font-medium capitalize transition-all duration-200 ${
                activeTab === tab
                  ? 'bg-claude-600 text-white shadow-lg shadow-claude-600/25'
                  : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800'
              }`}
            >
              {tab === 'build' ? 'Build Workflow' : tab === 'preview' ? 'YAML Preview' : 'Review Settings'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'build' && (
          <WorkflowBuilder config={config} onChange={setConfig} />
        )}
        {activeTab === 'preview' && (
          <YamlPreview config={config} />
        )}
        {activeTab === 'review' && (
          <ReviewPanel config={config} onChange={setConfig} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-dark-800 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-6 text-center text-dark-500 text-sm">
          Built for creating GitHub Actions workflows with Claude Code Opus 4.5
        </div>
      </footer>
    </div>
  );
}

export default App;
