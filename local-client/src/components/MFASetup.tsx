import { useState, useEffect } from 'react';
import { apiClient } from '../services/api-client';

interface MFASetupProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

export default function MFASetup({ onComplete, onCancel }: MFASetupProps) {
  const [step, setStep] = useState<'intro' | 'setup' | 'verify' | 'backup' | 'done'>('intro');
  const [secret, setSecret] = useState('');
  const [totpUrl, setTotpUrl] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadMFAStatus();
  }, []);

  const loadMFAStatus = async () => {
    try {
      const status = await apiClient.getMFAStatus();
      if (status.enabled) {
        setStep('done');
      }
    } catch (err) {
      // User doesn't have MFA setup yet
    }
  };

  const handleSetup = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiClient.setupMFA();
      setSecret(result.secret);
      setTotpUrl(result.totpUrl);
      setBackupCodes(result.backupCodes);
      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to setup MFA');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiClient.verifyMFA(code);
      if (result.valid) {
        setStep('backup');
      } else {
        setError('Invalid code. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    setLoading(true);
    setError('');
    try {
      await apiClient.disableMFA(code);
      setStep('intro');
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable MFA');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (step === 'intro') {
    return (
      <div className="mfa-setup">
        <h2>Two-Factor Authentication</h2>
        <p>Add an extra layer of security to your account by requiring a code from your authenticator app.</p>
        
        <div className="mfa-info">
          <div className="info-item">
            <span className="icon">🔐</span>
            <div>
              <strong>Authenticator App</strong>
              <p>Use an app like Google Authenticator, Authy, or 1Password</p>
            </div>
          </div>
          <div className="info-item">
            <span className="icon">📋</span>
            <div>
              <strong>Backup Codes</strong>
              <p>Get 10 one-time codes to use if you lose access to your device</p>
            </div>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="actions">
          <button className="btn-primary" onClick={handleSetup} disabled={loading}>
            {loading ? 'Setting up...' : 'Enable Two-Factor Auth'}
          </button>
          {onCancel && (
            <button className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  if (step === 'verify') {
    return (
      <div className="mfa-setup">
        <h2>Scan QR Code</h2>
        <p>Scan this QR code with your authenticator app, then enter the 6-digit code.</p>
        
        <div className="qr-container">
          <img 
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totpUrl)}`} 
            alt="MFA QR Code"
          />
        </div>

        <div className="secret-manual">
          <p>Can't scan? Enter this code manually:</p>
          <code>{secret}</code>
        </div>

        <div className="verify-input">
          <label>Enter 6-digit code:</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            maxLength={6}
          />
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="actions">
          <button 
            className="btn-primary" 
            onClick={handleVerify} 
            disabled={loading || code.length !== 6}
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>
          <button className="btn-secondary" onClick={() => setStep('intro')}>
            Back
          </button>
        </div>
      </div>
    );
  }

  if (step === 'backup') {
    return (
      <div className="mfa-setup">
        <h2>Backup Codes</h2>
        <p>Save these codes in a safe place. You can use them to access your account if you lose your authenticator device.</p>
        
        <div className="backup-codes">
          {backupCodes.map((code, index) => (
            <div key={index} className="code" onClick={() => copyToClipboard(code)}>
              <code>{code}</code>
              <span className="copy-hint">Click to copy</span>
            </div>
          ))}
        </div>

        <div className="warning">
          ⚠️ Each code can only be used once
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="actions">
          <button className="btn-primary" onClick={() => {
            setStep('done');
            onComplete?.();
          }}>
            I've Saved My Codes
          </button>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="mfa-setup">
        <h2>Two-Factor Enabled</h2>
        <div className="success-icon">✓</div>
        <p>Your account is now protected with two-factor authentication.</p>

        <div className="disable-section">
          <h3>Disable Two-Factor Auth</h3>
          <p>Enter your authenticator code to disable:</p>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            maxLength={6}
          />
          {error && <div className="error-message">{error}</div>}
          <button 
            className="btn-danger" 
            onClick={handleDisable}
            disabled={loading || code.length !== 6}
          >
            {loading ? 'Disabling...' : 'Disable Two-Factor Auth'}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
