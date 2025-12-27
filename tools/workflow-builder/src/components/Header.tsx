import { Sparkles, Github, Download } from 'lucide-react';

export function Header() {
  return (
    <header className="border-b border-dark-800 glass sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-claude-500 to-claude-700 flex items-center justify-center shadow-lg shadow-claude-600/30">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Claude Workflow Builder</h1>
            <p className="text-xs text-dark-400">GitHub Actions + Claude Code Review</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary flex items-center gap-2"
          >
            <Github className="w-4 h-4" />
            <span>View on GitHub</span>
          </a>
          <button className="btn-primary flex items-center gap-2">
            <Download className="w-4 h-4" />
            <span>Export Workflow</span>
          </button>
        </div>
      </div>
    </header>
  );
}
