/**
 * Voice Command Handlers Registry
 * Manages registration and routing of voice command handlers
 */

import type { VoiceCommand, VoiceCommandHandler, VoiceCommandResult, VoiceCommandType } from '../types.js';

export class CommandRegistry {
  private handlers: Map<VoiceCommandType, VoiceCommandHandler>;

  constructor() {
    this.handlers = new Map();
  }

  /**
   * Register a command handler
   */
  registerCommand(handler: VoiceCommandHandler): void {
    if (this.handlers.has(handler.type)) {
      console.warn(`Handler for ${handler.type} already registered. Overwriting.`);
    }
    this.handlers.set(handler.type, handler);
  }

  /**
   * Register multiple command handlers
   */
  registerCommands(handlers: VoiceCommandHandler[]): void {
    for (const handler of handlers) {
      this.registerCommand(handler);
    }
  }

  /**
   * Get handler for a command type
   */
  getHandler(type: VoiceCommandType): VoiceCommandHandler | undefined {
    return this.handlers.get(type);
  }

  /**
   * Execute a voice command
   */
  async executeCommand(command: VoiceCommand): Promise<VoiceCommandResult> {
    const handler = this.handlers.get(command.type);

    if (!handler) {
      return {
        success: false,
        message: `No handler registered for command type: ${command.type}`,
        speak: `I don't know how to handle ${command.type} commands yet.`,
      };
    }

    try {
      // Check if command matches any of the handler's patterns
      const matchesPattern = handler.patterns.some((pattern) => {
        const regex = new RegExp(pattern, 'i');
        return regex.test(command.rawText);
      });

      if (!matchesPattern) {
        return {
          success: false,
          message: 'Command does not match handler patterns',
          speak: "I'm not sure I understood that correctly. Could you try rephrasing?",
        };
      }

      return await handler.handler(command);
    } catch (error) {
      console.error(`Error executing command ${command.type}:`, error);
      return {
        success: false,
        message: `Error executing command: ${error instanceof Error ? error.message : 'Unknown error'}`,
        speak: 'Sorry, something went wrong while executing that command.',
      };
    }
  }

  /**
   * Get all registered command types
   */
  getRegisteredTypes(): VoiceCommandType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if a handler is registered for a type
   */
  hasHandler(type: VoiceCommandType): boolean {
    return this.handlers.has(type);
  }

  /**
   * Unregister a command handler
   */
  unregisterCommand(type: VoiceCommandType): boolean {
    return this.handlers.delete(type);
  }

  /**
   * Clear all handlers
   */
  clearAll(): void {
    this.handlers.clear();
  }

  /**
   * Get help text for all registered commands
   */
  getHelpText(): string {
    const commands: string[] = [];

    for (const [type, handler] of this.handlers.entries()) {
      commands.push(`${type}:`);
      for (const pattern of handler.patterns) {
        // Convert regex pattern to human-readable example
        const example = this.patternToExample(pattern);
        commands.push(`  - ${example}`);
      }
    }

    return commands.join('\n');
  }

  /**
   * Convert regex pattern to human-readable example
   */
  private patternToExample(pattern: string): string {
    // Remove regex markers and make it readable
    return pattern
      .replace(/\\/g, '')
      .replace(/\(\?:/g, '')
      .replace(/\)/g, '')
      .replace(/\[.*?\]/g, 'value')
      .replace(/\.\+\?/g, '...')
      .replace(/\w\+/g, 'name')
      .replace(/\|/g, ' or ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// Export singleton instance
export const commandRegistry = new CommandRegistry();
