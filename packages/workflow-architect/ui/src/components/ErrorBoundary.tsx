/**
 * Error Boundary Component
 * Catches and handles React component errors gracefully
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKeys?: Array<string | number>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    // Update state with error details
    this.setState((prevState) => ({
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));

    // Call optional error handler
    this.props.onError?.(error, errorInfo);

    // In production, send to error tracking service
    if (process.env.NODE_ENV === 'production') {
      this.logErrorToService(error, errorInfo);
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    const { resetKeys } = this.props;
    const { hasError } = this.state;

    // Reset error boundary when resetKeys change
    if (hasError && resetKeys && prevProps.resetKeys) {
      const hasResetKeyChanged = resetKeys.some(
        (key, index) => key !== prevProps.resetKeys?.[index],
      );

      if (hasResetKeyChanged) {
        this.resetErrorBoundary();
      }
    }
  }

  logErrorToService(error: Error, errorInfo: ErrorInfo): void {
    // TODO: Integrate with error tracking service (e.g., Sentry, DataDog)
    // For now, log to console
    console.error('Production error:', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      errorInfo: {
        componentStack: errorInfo.componentStack,
      },
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    });
  }

  resetErrorBoundary = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    const { hasError, error, errorInfo, errorCount } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <div
          style={{
            padding: '2rem',
            maxWidth: '800px',
            margin: '2rem auto',
            backgroundColor: '#fff',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ marginBottom: '1.5rem' }}>
            <h1
              style={{
                color: '#e53e3e',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                marginBottom: '0.5rem',
              }}
            >
              Something went wrong
            </h1>
            <p style={{ color: '#4a5568', fontSize: '1rem' }}>
              We encountered an unexpected error. Please try refreshing the page.
            </p>
          </div>

          {process.env.NODE_ENV === 'development' && (
            <div
              style={{
                backgroundColor: '#f7fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                padding: '1rem',
                marginBottom: '1rem',
              }}
            >
              <h2
                style={{
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem',
                  color: '#2d3748',
                }}
              >
                Error Details:
              </h2>
              <pre
                style={{
                  fontSize: '0.875rem',
                  color: '#e53e3e',
                  overflow: 'auto',
                  marginBottom: '1rem',
                }}
              >
                {error.toString()}
              </pre>
              {errorInfo && (
                <details style={{ fontSize: '0.875rem', color: '#4a5568' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                    Component Stack
                  </summary>
                  <pre
                    style={{
                      marginTop: '0.5rem',
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {errorInfo.componentStack}
                  </pre>
                </details>
              )}
              {errorCount > 1 && (
                <p style={{ marginTop: '0.5rem', color: '#ed8936' }}>
                  This error has occurred {errorCount} times
                </p>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={this.resetErrorBoundary}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#3182ce',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '1rem',
                cursor: 'pointer',
                fontWeight: '500',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#2c5282';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = '#3182ce';
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#718096',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '1rem',
                cursor: 'pointer',
                fontWeight: '500',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#4a5568';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = '#718096';
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
