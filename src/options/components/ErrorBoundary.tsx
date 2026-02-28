import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

const MAX_RETRIES = 3;

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, retryCount: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ApplySharp] React error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const canRetry = this.state.retryCount < MAX_RETRIES;

      return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2 style={{ color: '#ef4444', marginBottom: '1rem' }}>Something went wrong</h2>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          {canRetry ? (
            <button
              onClick={() =>
                this.setState((prev) => ({
                  hasError: false,
                  error: null,
                  retryCount: prev.retryCount + 1,
                }))
              }
              style={{
                padding: '0.5rem 1rem',
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
              }}
            >
              Try Again ({this.state.retryCount + 1}/{MAX_RETRIES})
            </button>
          ) : (
            <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
              Max retries reached. Please reload the page.
            </p>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
