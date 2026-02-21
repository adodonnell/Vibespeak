import React, { useState, useEffect } from 'react';
import { useAuth } from '../../stores/AuthContext';
import { apiClient } from '../../services/api-client';
import './LoginScreen.css';

const GUEST_USERNAME_KEY = 'disorder:guest_username';

interface LoginScreenProps {
  onLoginSuccess?: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  // Default to guest mode — most users join without an account (TeamSpeak-like)
  const [isGuestMode, setIsGuestMode] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, guestLogin, isLoading, error, clearError } = useAuth();

  // Pre-fill saved guest username on mount
  useEffect(() => {
    const saved = localStorage.getItem(GUEST_USERNAME_KEY);
    if (saved) setUsername(saved);
  }, []);

  // Handle OAuth token redirect (e.g. after OAuth callback from server)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const oauthSuccess = params.get('oauth');
    if (token && oauthSuccess === 'success') {
      apiClient.setTokens(token);
      // Clean URL without reload
      window.history.replaceState({}, document.title, '/');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const trimmed = username.trim();
    if (!trimmed) return;

    try {
      if (isGuestMode) {
        await guestLogin(trimmed);
        // Persist guest username so the field is pre-filled next session
        localStorage.setItem(GUEST_USERNAME_KEY, trimmed);
      } else {
        await login(trimmed, password);
        // Clear any stale guest username when signing in as registered user
        localStorage.removeItem(GUEST_USERNAME_KEY);
      }
      onLoginSuccess?.();
    } catch (_) {
      // Error is surfaced via AuthContext's `error` state
    }
  };

  const toggleMode = () => {
    setIsGuestMode(prev => !prev);
    clearError();
    setPassword('');
  };

  return (
    <div className="login-screen">
      <div className="login-container">
        <div className="login-form-wrapper">
          {/* Logo / Title */}
          <div className="login-header">
            <div className="login-logo">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                {/* Background circle with gradient */}
                <defs>
                  <linearGradient id="vibeGradientLogin" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4D88FF" />
                    <stop offset="100%" stopColor="#3363AA" />
                  </linearGradient>
                </defs>
                <circle cx="24" cy="24" r="24" fill="url(#vibeGradientLogin)" />
                {/* Sound wave bars representing voice/vibes */}
                <rect x="10" y="18" width="4" height="12" rx="2" fill="white" opacity="0.7" />
                <rect x="17" y="14" width="4" height="20" rx="2" fill="white" />
                <rect x="24" y="10" width="4" height="28" rx="2" fill="white" />
                <rect x="31" y="14" width="4" height="20" rx="2" fill="white" />
                <rect x="38" y="18" width="4" height="12" rx="2" fill="white" opacity="0.7" />
              </svg>
            </div>
            <h1 className="login-title">VibeSpeak</h1>
            <p className="login-subtitle">
              {isGuestMode
                ? 'Pick a username and start chatting!'
                : 'Admin / Registered user sign-in'}
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="login-error">
              <span className="error-icon">⚠</span>
              {error}
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="login-form">
            {/* Username */}
            <div className="login-field">
              <label className="login-label">
                {isGuestMode ? 'Choose a username' : 'Username'}
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder={isGuestMode ? 'e.g. CoolGamer99' : 'username'}
                className="login-input"
                autoFocus
                required
                minLength={3}
                maxLength={32}
                pattern="[a-zA-Z0-9_]+"
                title="Letters, numbers and underscores only (3-32 chars)"
              />
            </div>

            {/* Password — only for registered login */}
            {!isGuestMode && (
              <div className="login-field">
                <label className="login-label">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="login-input"
                  required
                />
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading || !username.trim()}
              className="login-button"
            >
              {isLoading
                ? <span className="loading-spinner">⟳</span>
                : isGuestMode ? 'Join' : 'Sign In'}
            </button>
          </form>

          {/* Toggle between guest and registered */}
          <div className="login-divider"><span>or</span></div>
          <button
            type="button"
            onClick={toggleMode}
            className="login-toggle"
          >
            {isGuestMode
              ? 'Sign in with a registered account'
              : 'Continue as Guest (no account needed)'}
          </button>

          {/* Hint for guest users */}
          {isGuestMode && (
            <p className="login-guest-hint">
              No registration required. Your username is saved locally so you
              reconnect automatically next time.
            </p>
          )}

          {/* Change server link */}
          <div className="login-change-server">
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem('disorder:server-configured');
                localStorage.removeItem('disorder:api-url');
                localStorage.removeItem('disorder:ws-url');
                window.location.reload();
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#00A8FC',
                cursor: 'pointer',
                fontSize: '13px',
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              Change Server
            </button>
          </div>

          <div className="login-footer">
            <span className="version">v1.0.0</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
