import React, { useState, useEffect } from 'react';
import { useAuth } from '../../stores/AuthContext';
import { apiClient } from '../../services/api-client';
import './LoginScreen.css';
import '../../styles/modals.css';

const GUEST_USERNAME_KEY = 'disorder:guest_username';

interface LoginScreenProps {
  onLoginSuccess?: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  // Guest-only login — TeamSpeak style (no password login)
  const [username, setUsername] = useState('');
  const { guestLogin, isLoading, error, clearError } = useAuth();

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
      await guestLogin(trimmed);
      // Persist guest username so the field is pre-filled next session
      localStorage.setItem(GUEST_USERNAME_KEY, trimmed);
      onLoginSuccess?.();
    } catch (_) {
      // Error is surfaced via AuthContext's `error` state
    }
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
              Pick a username and start chatting!
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
                Choose a username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="e.g. CoolGamer99"
                className="login-input"
                autoFocus
                required
                minLength={3}
                maxLength={32}
                pattern="[a-zA-Z0-9_]+"
                title="Letters, numbers and underscores only (3-32 chars)"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading || !username.trim()}
              className="login-button"
            >
              {isLoading
                ? <span className="loading-spinner">⟳</span>
                : 'Join'}
            </button>
          </form>

          {/* Hint for guest users */}
          <p className="login-guest-hint">
            No registration required. Your username is saved locally so you
            reconnect automatically next time. Admin privileges can be claimed
            from Settings after joining.
          </p>

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
              className="link-button"
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