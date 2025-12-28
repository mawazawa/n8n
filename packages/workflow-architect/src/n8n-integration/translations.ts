/**
 * i18n Translations for Workflow Architect
 *
 * This file contains all translations for the Workflow Architect feature.
 * These should be added to n8n's @n8n/i18n package.
 */

export const translations = {
  en: {
    workflowArchitect: {
      title: 'AI Workflow Architect',
      subtitle: 'Build workflows with AI assistance',

      // Panel
      panel: {
        open: 'Open AI Architect',
        close: 'Close AI Architect',
        minimize: 'Minimize panel',
        maximize: 'Restore panel',
      },

      // Chat interface
      chat: {
        inputPlaceholder: 'Describe the workflow you want to build...',
        examplePrompts: {
          title: 'Try asking:',
          slack: 'Send a Slack message when a new email arrives',
          github: 'Monitor GitHub issues and create tasks in Notion',
          webhook: 'Create a webhook that processes form submissions',
          schedule: 'Run a daily report and email the results',
        },
        send: 'Send',
        clear: 'Clear chat',
        newConversation: 'New conversation',
      },

      // Status messages
      status: {
        connecting: 'Connecting to AI Architect...',
        connected: 'AI Architect ready',
        disconnected: 'Disconnected from AI Architect',
        thinking: 'Thinking...',
        analyzing: 'Analyzing your request...',
        building: 'Building workflow...',
        configuring: 'Configuring nodes...',
        finalizing: 'Finalizing workflow...',
        error: 'An error occurred',
        retrying: 'Retrying...',
      },

      // Phases
      phases: {
        discovery: 'Understanding requirements',
        builder: 'Creating workflow structure',
        configurator: 'Setting up nodes',
        responder: 'Preparing response',
        done: 'Workflow ready',
      },

      // Messages
      messages: {
        welcomeTitle: 'Welcome to AI Workflow Architect',
        welcomeMessage: 'I can help you build complex workflows in seconds. Just describe what you want to automate, and I\'ll create the workflow for you.',
        noWorkflowYet: 'No workflow created yet',
        workflowCreated: 'Workflow created successfully',
        workflowUpdated: 'Workflow updated',
        errorCreatingWorkflow: 'Failed to create workflow',
        errorConnecting: 'Failed to connect to AI Architect service',
      },

      // Actions
      actions: {
        apply: 'Apply to canvas',
        edit: 'Edit workflow',
        save: 'Save workflow',
        discard: 'Discard',
        retry: 'Retry',
        copy: 'Copy workflow JSON',
        export: 'Export workflow',
      },

      // Settings
      settings: {
        title: 'AI Architect Settings',
        enableFeature: 'Enable AI Workflow Architect',
        model: 'AI Model',
        temperature: 'Creativity level',
        maxTokens: 'Response length',
        streamResponse: 'Stream responses',
      },

      // Keyboard shortcuts
      shortcuts: {
        open: 'Open AI Architect',
        send: 'Send message',
        clear: 'Clear input',
        newConversation: 'New conversation',
      },

      // Errors
      errors: {
        featureDisabled: 'AI Workflow Architect is not enabled',
        apiKeyMissing: 'API key not configured',
        invalidWorkflow: 'Invalid workflow structure',
        networkError: 'Network error - please check your connection',
        serverError: 'Server error - please try again',
        timeout: 'Request timeout - please try again',
        unauthorized: 'Unauthorized - please check your credentials',
      },

      // Tooltips
      tooltips: {
        openArchitect: 'Open AI Workflow Architect (Cmd+Shift+A)',
        closeArchitect: 'Close AI Architect',
        sendMessage: 'Send message (Cmd+Enter)',
        clearChat: 'Clear chat history',
        applyWorkflow: 'Apply this workflow to the canvas',
        copyWorkflow: 'Copy workflow JSON to clipboard',
      },
    },
  },
};

/**
 * Type definition for translation keys
 */
export type TranslationKey = keyof typeof translations.en.workflowArchitect;

/**
 * Helper to get translation key path
 */
export function getTranslationKey(path: string): string {
  return `workflowArchitect.${path}`;
}

/**
 * Export translation structure for type safety
 */
export type WorkflowArchitectTranslations = typeof translations.en.workflowArchitect;
