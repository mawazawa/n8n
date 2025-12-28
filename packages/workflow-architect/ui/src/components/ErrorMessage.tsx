import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorMessageProps {
  error: Error;
  onRetry?: () => void;
}

export function ErrorMessage({ error, onRetry }: ErrorMessageProps) {
  return (
    <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-red-800 dark:text-red-200">Something went wrong</h4>
        <p className="mt-1 text-sm text-red-600 dark:text-red-300">{error.message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-200 bg-red-100 dark:bg-red-800/50 hover:bg-red-200 dark:hover:bg-red-800 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export default ErrorMessage;
