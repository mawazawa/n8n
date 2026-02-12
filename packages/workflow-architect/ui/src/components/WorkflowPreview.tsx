import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, Download, ChevronDown, ChevronUp } from 'lucide-react';
import type { WorkflowState } from '../hooks/useWorkflowStream';

interface WorkflowPreviewProps {
  workflow: WorkflowState | null;
  collapsed?: boolean;
}

export function WorkflowPreview({ workflow, collapsed = false }: WorkflowPreviewProps) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const [copied, setCopied] = useState(false);

  if (!workflow) {
    return (
      <div className="p-6 text-center text-gray-500 dark:text-gray-400">
        No workflow created yet. Start chatting to build one!
      </div>
    );
  }

  const workflowJson = JSON.stringify(workflow, null, 2);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(workflowJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadWorkflow = () => {
    const blob = new Blob([workflowJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-gray-100">Workflow Preview</span>
          <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
            {workflow.nodes.length} nodes
          </span>
        </div>
        {isCollapsed ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {!isCollapsed && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          {/* Workflow summary */}
          <div className="p-4 space-y-3 bg-gray-50 dark:bg-gray-800">
            <h4 className="font-medium text-gray-900 dark:text-gray-100">{workflow.name}</h4>
            <div className="flex flex-wrap gap-2">
              {workflow.nodes.map((node) => (
                <span
                  key={node.id}
                  className="px-2 py-1 text-xs rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300"
                >
                  {node.name}
                </span>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 px-4 py-2 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy JSON
                </>
              )}
            </button>
            <button
              onClick={downloadWorkflow}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>

          {/* JSON preview */}
          <div className="max-h-96 overflow-auto">
            <SyntaxHighlighter
              language="json"
              style={oneDark}
              customStyle={{ margin: 0, borderRadius: 0 }}
            >
              {workflowJson}
            </SyntaxHighlighter>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkflowPreview;
