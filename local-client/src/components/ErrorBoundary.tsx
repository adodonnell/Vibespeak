import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0d1117',
          color: '#e6edf3',
          padding: '20px',
        }}>
          <div style={{
            background: '#161b22',
            padding: '32px',
            borderRadius: '8px',
            maxWidth: '500px',
            width: '100%',
            border: '1px solid #30363d',
          }}>
            <h2 style={{ color: '#f85149', marginTop: 0 }}>Something went wrong</h2>
            <p style={{ color: '#8b949e' }}>
              An unexpected error occurred. You can try refreshing the application or continue using the parts that are still working.
            </p>
            {this.state.error && (
              <pre style={{
                background: '#0d1117',
                padding: '12px',
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '12px',
                color: '#f85149',
                maxHeight: '150px',
              }}>
                {this.state.error.message}
              </pre>
            )}
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button
                onClick={this.handleRetry}
                style={{
                  padding: '10px 20px',
                  background: '#238636',
                  border: 'none',
                  borderRadius: '4px',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '10px 20px',
                  background: '#30363d',
                  border: 'none',
                  borderRadius: '4px',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook for functional components to report errors
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  return setError;
}
