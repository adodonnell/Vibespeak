import React, { useState, useEffect } from 'react';
import './ServerSetupScreen.css';

const SERVER_CONFIGURED_KEY = 'disorder:server-configured';
const API_URL_KEY = 'disorder:api-url';
const WS_URL_KEY = 'disorder:ws-url';

interface ServerSetupScreenProps {
  onConnected: () => void;
}

type ConnectionState = 'idle' | 'testing' | 'success' | 'error';

const ServerSetupScreen: React.FC<ServerSetupScreenProps> = ({ onConnected }) => {
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('3001');
  const [wsPort, setWsPort] = useState('3002');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [serverInfo, setServerInfo] = useState<{ name?: string; database?: string } | null>(null);

  // Pre-fill from localStorage if user is revisiting the setup screen
  useEffect(() => {
    const savedApiUrl = localStorage.getItem(API_URL_KEY);
    if (savedApiUrl) {
      try {
        const url = new URL(savedApiUrl);
        setHost(url.hostname);
        setPort(url.port || '3001');
      } catch { /* ignore */ }
    }
    const savedWsUrl = localStorage.getItem(WS_URL_KEY);
    if (savedWsUrl) {
      try {
        const url = new URL(savedWsUrl);
        setWsPort(url.port || '3002');
      } catch { /* ignore */ }
    }
  }, []);

  // Derive URLs from host/port
  const getApiUrl = () => {
    const h = host.trim() || 'localhost';
    const p = port.trim() || '3001';
    const protocol = (h !== 'localhost' && !h.startsWith('192.168.') && !h.startsWith('10.')) ? 'https' : 'http';
    return `${protocol}://${h}:${p}`;
  };

  const getWsUrl = () => {
    const h = host.trim() || 'localhost';
    const p = wsPort.trim() || '3002';
    const protocol = (h !== 'localhost' && !h.startsWith('192.168.') && !h.startsWith('10.')) ? 'wss' : 'ws';
    return `${protocol}://${h}:${p}`;
  };

  const testConnection = async (): Promise<boolean> => {
    setConnectionState('testing');
    setErrorMessage('');
    setServerInfo(null);

    const apiUrl = getApiUrl();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${apiUrl}/health`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      const data = await response.json();
      setServerInfo({ name: 'Disorder Server', database: data.database ?? 'memory' });
      setConnectionState('success');
      return true;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setErrorMessage(`Connection timed out. Is the server running at ${apiUrl}?`);
      } else if (err?.message?.includes('fetch') || err?.message?.includes('Failed')) {
        setErrorMessage(`Cannot reach server at ${apiUrl}. Make sure server-brain is running.`);
      } else {
        setErrorMessage(err?.message || 'Connection failed.');
      }
      setConnectionState('error');
      return false;
    }
  };

  const handleConnect = async () => {
    const ok = await testConnection();
    if (!ok) return;

    // Persist configuration
    const apiUrl = getApiUrl();
    const wsUrl = getWsUrl();
    localStorage.setItem(API_URL_KEY, apiUrl);
    localStorage.setItem(WS_URL_KEY, wsUrl);
    localStorage.setItem(SERVER_CONFIGURED_KEY, 'true');

    // Short delay so user sees the success state
    setTimeout(() => {
      onConnected();
    }, 800);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConnect();
  };

  const isConnecting = connectionState === 'testing';
  const isSuccess = connectionState === 'success';

  return (
    <div className="setup-screen">
      <div className="setup-container">
        <div className="setup-card">
          {/* Logo / Brand */}
          <div className="setup-header">
            <div className="setup-logo">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                {/* Background circle with gradient */}
                <defs>
                  <linearGradient id="vibeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4D88FF" />
                    <stop offset="100%" stopColor="#3363AA" />
                  </linearGradient>
                </defs>
                <circle cx="24" cy="24" r="24" fill="url(#vibeGradient)" />
                {/* Sound wave bars representing voice/vibes */}
                <rect x="10" y="18" width="4" height="12" rx="2" fill="white" opacity="0.7" />
                <rect x="17" y="14" width="4" height="20" rx="2" fill="white" />
                <rect x="24" y="10" width="4" height="28" rx="2" fill="white" />
                <rect x="31" y="14" width="4" height="20" rx="2" fill="white" />
                <rect x="38" y="18" width="4" height="12" rx="2" fill="white" opacity="0.7" />
              </svg>
            </div>
            <h1 className="setup-title">VibeSpeak</h1>
            <p className="setup-subtitle">Connect to a server to get started</p>
          </div>

          {/* Server info badge on success */}
          {isSuccess && serverInfo && (
            <div className="setup-success-badge">
              <span className="success-dot" />
              Connected · {serverInfo.name} · db: {serverInfo.database}
            </div>
          )}

          {/* Error message */}
          {connectionState === 'error' && (
            <div className="setup-error">
              <span>⚠</span>
              {errorMessage}
            </div>
          )}

          {/* Form */}
          <div className="setup-form">
            <div className="setup-field">
              <label className="setup-label">Server Address</label>
              <input
                type="text"
                className={`setup-input ${connectionState === 'error' ? 'error' : ''} ${isSuccess ? 'success' : ''}`}
                value={host}
                onChange={e => { setHost(e.target.value); setConnectionState('idle'); }}
                onKeyDown={handleKeyDown}
                placeholder="localhost"
                autoFocus
                spellCheck={false}
              />
              <p className="setup-hint">
                Your server's hostname or IP address. Leave as <code>localhost</code> for local use.
              </p>
            </div>

            <div className="setup-field">
              <label className="setup-label">Port</label>
              <input
                type="text"
                className={`setup-input port-input ${connectionState === 'error' ? 'error' : ''} ${isSuccess ? 'success' : ''}`}
                value={port}
                onChange={e => { setPort(e.target.value); setConnectionState('idle'); }}
                onKeyDown={handleKeyDown}
                placeholder="3001"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={5}
              />
            </div>

            {/* Advanced toggle */}
            <button
              type="button"
              className="setup-advanced-toggle"
              onClick={() => setShowAdvanced(v => !v)}
            >
              {showAdvanced ? '▲' : '▼'} Advanced
            </button>

            {showAdvanced && (
              <div className="setup-field">
                <label className="setup-label">WebSocket Port</label>
                <input
                  type="text"
                  className="setup-input port-input"
                  value={wsPort}
                  onChange={e => { setWsPort(e.target.value); setConnectionState('idle'); }}
                  placeholder="3002"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={5}
                />
                <p className="setup-hint">
                  Real-time + voice signaling port. Usually API port + 1.
                </p>
              </div>
            )}

            {/* Preview */}
            <div className="setup-preview">
              <span className="preview-label">API:</span>
              <code className="preview-url">{getApiUrl()}</code>
              <span className="preview-label">WS:</span>
              <code className="preview-url">{getWsUrl()}</code>
            </div>
          </div>

          {/* Actions */}
          <div className="setup-actions">
            <button
              type="button"
              className="setup-btn-secondary"
              onClick={testConnection}
              disabled={isConnecting}
            >
              {isConnecting ? <span className="setup-spinner" /> : null}
              {isConnecting ? 'Testing…' : 'Test Connection'}
            </button>

            <button
              type="button"
              className={`setup-btn-primary ${isSuccess ? 'is-success' : ''}`}
              onClick={handleConnect}
              disabled={isConnecting}
            >
              {isConnecting ? <span className="setup-spinner" /> : null}
              {isSuccess ? '✓ Connecting…' : isConnecting ? 'Connecting…' : 'Connect'}
            </button>
          </div>

          <p className="setup-footer-hint">
            Your credentials are stored locally. No account required to join.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ServerSetupScreen;
