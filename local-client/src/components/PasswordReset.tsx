import { useState, useEffect } from 'react';
import { apiClient } from '../services/api-client';

interface PasswordResetProps {
  resetToken?: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

export default function PasswordReset({ resetToken, onComplete, onCancel }: PasswordResetProps) {
  const [step, setStep] = useState<'request' | 'sent' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (resetToken) {
      setStep('reset');
    }
  }, [resetToken]);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await apiClient.requestPasswordReset(email);
      setStep('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request reset');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await apiClient.resetPassword(resetToken!, password);
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'request') {
    return (
      <div className="password-reset">
        <h2>Reset Password</h2>
        <p>Enter your email address and we'll send you a link to reset your password.</p>

        <form onSubmit={handleRequestReset}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="actions">
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
            {onCancel && (
              <button type="button" className="btn-secondary" onClick={onCancel}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    );
  }

  if (step === 'sent') {
    return (
      <div className="password-reset">
        <h2>Check Your Email</h2>
        <div className="success-icon">✓</div>
        <p>We've sent a password reset link to <strong>{email}</strong>.</p>
        <p className="hint">Click the link in the email to reset your password. The link will expire in 1 hour.</p>

        <div className="actions">
          <button className="btn-secondary" onClick={() => setStep('request')}>
            Didn't receive? Resend
          </button>
        </div>
      </div>
    );
  }

  if (step === 'reset') {
    return (
      <div className="password-reset">
        <h2>New Password</h2>
        <p>Enter your new password below.</p>

        <form onSubmit={handleResetPassword}>
          <div className="form-group">
            <label htmlFor="password">New Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
            />
          </div>

          <div className="password-requirements">
            <p>Password must:</p>
            <ul>
              <li className={password.length >= 8 ? 'met' : ''}>Be at least 8 characters</li>
              <li className={/[A-Z]/.test(password) ? 'met' : ''}>Contain an uppercase letter</li>
              <li className={/[a-z]/.test(password) ? 'met' : ''}>Contain a lowercase letter</li>
              <li className={/[0-9]/.test(password) ? 'met' : ''}>Contain a number</li>
            </ul>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="actions">
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return null;
}
