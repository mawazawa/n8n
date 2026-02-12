/**
 * Pinia Store for Workflow Architect
 *
 * Manages state for the AI Workflow Architect feature in n8n editor.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  WorkflowArchitectApi,
  getArchitectApi,
  type StreamEvent,
  StreamEventType,
  type ChatRequest,
  type ChatResponse,
  ArchitectApiError,
} from './architect.api';

/**
 * Chat message interface
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  workflow?: unknown;
  phases?: string[];
}

/**
 * Connection status
 */
export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

/**
 * Processing phase
 */
export enum ProcessingPhase {
  IDLE = 'idle',
  THINKING = 'thinking',
  DISCOVERY = 'discovery',
  BUILDER = 'builder',
  CONFIGURATOR = 'configurator',
  RESPONDER = 'responder',
  DONE = 'done',
}

/**
 * Store state interface
 */
export interface ArchitectState {
  // UI state
  isPanelOpen: boolean;
  isMinimized: boolean;

  // Connection state
  connectionStatus: ConnectionStatus;
  connectionError: string | null;

  // Chat state
  messages: ChatMessage[];
  threadId: string | null;
  currentPhase: ProcessingPhase;
  isProcessing: boolean;

  // Workflow state
  currentWorkflow: unknown;
  workflowHistory: unknown[];

  // Settings
  streamEnabled: boolean;
  autoApply: boolean;
}

/**
 * Workflow Architect Store
 */
export const useWorkflowArchitectStore = defineStore('workflowArchitect', () => {
  // State
  const isPanelOpen = ref(false);
  const isMinimized = ref(false);
  const connectionStatus = ref<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const connectionError = ref<string | null>(null);
  const messages = ref<ChatMessage[]>([]);
  const threadId = ref<string | null>(null);
  const currentPhase = ref<ProcessingPhase>(ProcessingPhase.IDLE);
  const isProcessing = ref(false);
  const currentWorkflow = ref<unknown>(null);
  const workflowHistory = ref<unknown[]>([]);
  const streamEnabled = ref(true);
  const autoApply = ref(false);

  // API client
  let apiClient: WorkflowArchitectApi | null = null;

  // Computed
  const hasMessages = computed(() => messages.value.length > 0);
  const lastMessage = computed(() =>
    messages.value.length > 0 ? messages.value[messages.value.length - 1] : null,
  );
  const isConnected = computed(() => connectionStatus.value === ConnectionStatus.CONNECTED);
  const canSendMessage = computed(() => isConnected.value && !isProcessing.value);

  // Actions

  /**
   * Initialize the architect store
   */
  function initialize() {
    if (!apiClient) {
      apiClient = getArchitectApi();
    }

    // Generate a new thread ID
    if (!threadId.value) {
      threadId.value = `thread-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    // Add welcome message
    if (messages.value.length === 0) {
      messages.value.push({
        id: 'welcome',
        role: 'system',
        content:
          "Welcome to AI Workflow Architect! I can help you build complex workflows in seconds. Just describe what you want to automate, and I'll create the workflow for you.",
        timestamp: Date.now(),
      });
    }

    connectionStatus.value = ConnectionStatus.CONNECTED;
  }

  /**
   * Open the architect panel
   */
  function openPanel() {
    isPanelOpen.value = true;
    isMinimized.value = false;

    if (connectionStatus.value === ConnectionStatus.DISCONNECTED) {
      initialize();
    }
  }

  /**
   * Close the architect panel
   */
  function closePanel() {
    isPanelOpen.value = false;
  }

  /**
   * Toggle panel minimize state
   */
  function toggleMinimize() {
    isMinimized.value = !isMinimized.value;
  }

  /**
   * Send a chat message
   */
  async function sendMessage(message: string): Promise<void> {
    if (!canSendMessage.value) {
      throw new Error('Cannot send message: not connected or already processing');
    }

    if (!apiClient) {
      throw new Error('API client not initialized');
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };
    messages.value.push(userMessage);

    // Start processing
    isProcessing.value = true;
    currentPhase.value = ProcessingPhase.THINKING;
    connectionError.value = null;

    try {
      const request: ChatRequest = {
        message,
        threadId: threadId.value ?? undefined,
        stream: streamEnabled.value,
      };

      if (streamEnabled.value) {
        await handleStreamingResponse(request);
      } else {
        await handleNonStreamingResponse(request);
      }
    } catch (error) {
      handleError(error);
    } finally {
      isProcessing.value = false;
      currentPhase.value = ProcessingPhase.IDLE;
    }
  }

  /**
   * Handle streaming response
   */
  async function handleStreamingResponse(request: ChatRequest): Promise<void> {
    if (!apiClient) return;

    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    messages.value.push(assistantMessage);

    try {
      for await (const event of apiClient.streamChat(request)) {
        handleStreamEvent(event, assistantMessage);
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle non-streaming response
   */
  async function handleNonStreamingResponse(request: ChatRequest): Promise<void> {
    if (!apiClient) return;

    try {
      const response: ChatResponse = await apiClient.chat(request);

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: response.response,
        timestamp: Date.now(),
        workflow: response.workflow,
        phases: response.phases,
      };
      messages.value.push(assistantMessage);

      if (response.workflow) {
        currentWorkflow.value = response.workflow;
        workflowHistory.value.push(response.workflow);
      }

      if (response.threadId) {
        threadId.value = response.threadId;
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle individual stream events
   */
  function handleStreamEvent(event: StreamEvent, message: ChatMessage): void {
    switch (event.type) {
      case StreamEventType.THINKING:
        currentPhase.value = ProcessingPhase.THINKING;
        break;

      case StreamEventType.PHASE:
        updatePhase(event.data as string);
        if (message.phases) {
          message.phases.push(event.data as string);
        } else {
          message.phases = [event.data as string];
        }
        break;

      case StreamEventType.WORKFLOW:
        currentWorkflow.value = event.data;
        message.workflow = event.data;
        workflowHistory.value.push(event.data);
        break;

      case StreamEventType.RESPONSE:
        message.content += event.data as string;
        break;

      case StreamEventType.DONE:
        currentPhase.value = ProcessingPhase.DONE;
        break;

      case StreamEventType.ERROR:
        throw new ArchitectApiError(event.data as string);
    }
  }

  /**
   * Update current processing phase
   */
  function updatePhase(phaseName: string): void {
    const phaseMap: Record<string, ProcessingPhase> = {
      supervisor: ProcessingPhase.THINKING,
      discovery: ProcessingPhase.DISCOVERY,
      builder: ProcessingPhase.BUILDER,
      configurator: ProcessingPhase.CONFIGURATOR,
      responder: ProcessingPhase.RESPONDER,
      process_operations: ProcessingPhase.BUILDER,
    };

    currentPhase.value = phaseMap[phaseName] || ProcessingPhase.THINKING;
  }

  /**
   * Handle errors
   */
  function handleError(error: unknown): void {
    console.error('Architect error:', error);

    let errorMessage = 'An unexpected error occurred';

    if (error instanceof ArchitectApiError) {
      if (error.statusCode === 408) {
        errorMessage = 'Request timeout - please try again';
      } else if (error.statusCode === 401) {
        errorMessage = 'Unauthorized - please check your credentials';
      } else if (error.statusCode && error.statusCode >= 500) {
        errorMessage = 'Server error - please try again later';
      } else {
        errorMessage = error.message;
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    connectionError.value = errorMessage;
    connectionStatus.value = ConnectionStatus.ERROR;

    // Add error message to chat
    messages.value.push({
      id: `error-${Date.now()}`,
      role: 'system',
      content: `Error: ${errorMessage}`,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear chat history
   */
  async function clearChat(): Promise<void> {
    if (!apiClient || !threadId.value) return;

    try {
      await apiClient.clearHistory(threadId.value);
      messages.value = [];
      currentWorkflow.value = null;
      workflowHistory.value = [];

      // Add welcome message back
      messages.value.push({
        id: 'welcome',
        role: 'system',
        content:
          "Welcome to AI Workflow Architect! I can help you build complex workflows in seconds. Just describe what you want to automate, and I'll create the workflow for you.",
        timestamp: Date.now(),
      });
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Start a new conversation
   */
  function newConversation(): void {
    threadId.value = `thread-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    messages.value = [];
    currentWorkflow.value = null;
    workflowHistory.value = [];

    // Add welcome message
    messages.value.push({
      id: 'welcome',
      role: 'system',
      content:
        "Welcome to AI Workflow Architect! I can help you build complex workflows in seconds. Just describe what you want to automate, and I'll create the workflow for you.",
      timestamp: Date.now(),
    });
  }

  /**
   * Abort current request
   */
  function abortRequest(): void {
    if (apiClient) {
      apiClient.abort();
    }
    isProcessing.value = false;
    currentPhase.value = ProcessingPhase.IDLE;
  }

  /**
   * Retry last message
   */
  async function retryLastMessage(): Promise<void> {
    // Find the last user message
    const lastUserMessage = [...messages.value]
      .reverse()
      .find((msg) => msg.role === 'user');

    if (!lastUserMessage) {
      throw new Error('No user message to retry');
    }

    // Remove messages after the last user message
    const lastUserIndex = messages.value.findIndex((msg) => msg.id === lastUserMessage.id);
    messages.value = messages.value.slice(0, lastUserIndex + 1);

    // Resend the message
    await sendMessage(lastUserMessage.content);
  }

  /**
   * Reset store state
   */
  function reset(): void {
    isPanelOpen.value = false;
    isMinimized.value = false;
    connectionStatus.value = ConnectionStatus.DISCONNECTED;
    connectionError.value = null;
    messages.value = [];
    threadId.value = null;
    currentPhase.value = ProcessingPhase.IDLE;
    isProcessing.value = false;
    currentWorkflow.value = null;
    workflowHistory.value = [];
  }

  return {
    // State
    isPanelOpen,
    isMinimized,
    connectionStatus,
    connectionError,
    messages,
    threadId,
    currentPhase,
    isProcessing,
    currentWorkflow,
    workflowHistory,
    streamEnabled,
    autoApply,

    // Computed
    hasMessages,
    lastMessage,
    isConnected,
    canSendMessage,

    // Actions
    initialize,
    openPanel,
    closePanel,
    toggleMinimize,
    sendMessage,
    clearChat,
    newConversation,
    abortRequest,
    retryLastMessage,
    reset,
  };
});
