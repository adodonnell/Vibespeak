import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './contexts/ToastContext';
import './styles/theme.css';
import './styles/voice-core.css';
import './styles/toast.css';

// Lazy load the main app for faster initial load
const VibeSpeakApp = lazy(() => import('./components/VibeSpeakApp'));

// High-quality loading spinner for VibeSpeak
const LoadingScreen: React.FC = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    width: '100vw',
    background: '#1E1F22',
    color: '#B5BAC1',
    gap: 24,
  }}>
    {/* VibeSpeak spinner */}
    <div style={{
      width: 58,
      height: 58,
      position: 'relative',
    }}>
      <svg viewBox="0 0 58 58" style={{ width: '100%', height: '100%' }}>
        <circle
          cx="29"
          cy="29"
          r="26"
          fill="none"
          stroke="#5865F2"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="163.36"
          strokeDashoffset="122.52"
          style={{
            transformOrigin: 'center',
            animation: 'spin 1.4s linear infinite',
          }}
        />
      </svg>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
    }}>
      <span style={{
        fontSize: '1.5rem',
        fontWeight: 700,
        letterSpacing: '-0.02em',
        color: '#F2F3F5',
      }}>
        VibeSpeak
      </span>
      <span style={{
        fontSize: '0.875rem',
        color: '#80848E',
      }}>
        Loading…
      </span>
    </div>
  </div>
);

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find root element. Make sure index.html has a <div id="root"></div>');
}

// Font preloading is handled in index.html via Google Fonts CSS
// which automatically serves the correct woff2 files

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <Suspense fallback={<LoadingScreen />}>
          <VibeSpeakApp />
        </Suspense>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);