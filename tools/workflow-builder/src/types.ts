export interface WorkflowConfig {
  name: string;
  triggers: {
    pullRequest: boolean;
    push: boolean;
    manual: boolean;
  };
  model: 'opus' | 'sonnet' | 'haiku';
  thinkingMode: 'ultrathink' | 'extended' | 'normal';
  reviewScope: 'full' | 'diff' | 'security';
  branches: string[];
  autoFix: boolean;
  createComments: boolean;
  blockOnIssues: boolean;
  customPrompt?: string;
}

export interface ReviewResult {
  severity: 'info' | 'warning' | 'error';
  message: string;
  file?: string;
  line?: number;
}
