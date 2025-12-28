import React from 'react';

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-2">
      <div className="flex items-center gap-1">
        <span
          className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </div>
      <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Thinking...</span>
    </div>
  );
}

export default TypingIndicator;
