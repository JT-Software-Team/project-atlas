import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled UI Error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg, #080D12)',
          color: 'var(--text, #E7EEF5)',
          padding: 24,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          <div style={{
            maxWidth: 480,
            width: '100%',
            background: 'var(--card, #101820)',
            border: '1px solid var(--border, #202B35)',
            borderRadius: 10,
            padding: 32,
            textAlign: 'center',
          }}>
            <div style={{
              width: 54,
              height: 54,
              borderRadius: 8,
              background: 'rgba(229, 83, 75, 0.1)',
              color: 'var(--error, #E5534B)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
            }}>
              <AlertTriangle size={28} />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 8 }}>Something went wrong</h2>
            <p style={{ color: 'var(--text-2, #8B9AA9)', fontSize: '0.9rem', marginBottom: 24, lineHeight: 1.5 }}>
              {this.state.error?.message || 'An unexpected rendering error occurred. Please refresh or try again.'}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 0,
                  background: 'var(--accent, #20E3B2)',
                  color: 'var(--accent-contrast, #03120D)',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={16} />Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
