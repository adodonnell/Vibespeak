import { useState, useEffect } from 'react';
import { apiClient } from '../services/api-client';

interface PresenceIndicatorProps {
  userId: number;
  showStatus?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export default function PresenceIndicator({ userId, showStatus = false, size = 'medium' }: PresenceIndicatorProps) {
  const [presence, setPresence] = useState<{ status: string; game?: string }>({ status: 'offline' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPresence();
    // Poll for presence updates every 30 seconds
    const interval = setInterval(loadPresence, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  const loadPresence = async () => {
    try {
      const data = await apiClient.getUserPresence(userId);
      setPresence(data);
    } catch (err) {
      // User is offline or not found
      setPresence({ status: 'offline' });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return '#3ba55c';
      case 'idle': return '#faa61a';
      case 'dnd': return '#ed4245';
      case 'invisible': return '#747f8d';
      default: return '#747f8d';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online': return 'Online';
      case 'idle': return 'Idle';
      case 'dnd': return 'Do Not Disturb';
      case 'invisible': return 'Invisible';
      default: return 'Offline';
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'small': return 'presence-small';
      case 'large': return 'presence-large';
      default: return 'presence-medium';
    }
  };

  if (loading) {
    return <div className={`presence-indicator ${getSizeClasses()} presence-loading`} />;
  }

  return (
    <div className={`presence-indicator ${getSizeClasses()}`}>
      <div 
        className="presence-dot" 
        style={{ backgroundColor: getStatusColor(presence.status) }}
      />
      {showStatus && (
        <span className="presence-status">{getStatusText(presence.status)}</span>
      )}
    </div>
  );
}

// Status selector component for changing own status
export function StatusSelector() {
  const [status, setStatus] = useState('online');
  const [game, setGame] = useState('');
  const [saving, setSaving] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    setSaving(true);
    try {
      await apiClient.updatePresence(newStatus, game || undefined);
      setStatus(newStatus);
    } catch (err) {
      console.error('Failed to update presence:', err);
    } finally {
      setSaving(false);
    }
  };

  const statusOptions = [
    { value: 'online', label: 'Online', color: '#3ba55c' },
    { value: 'idle', label: 'Idle', color: '#faa61a' },
    { value: 'dnd', label: 'Do Not Disturb', color: '#ed4245' },
    { value: 'invisible', label: 'Invisible', color: '#747f8d' },
  ];

  return (
    <div className="status-selector">
      <div className="status-options">
        {statusOptions.map(option => (
          <button
            key={option.value}
            className={`status-option ${status === option.value ? 'active' : ''}`}
            onClick={() => handleStatusChange(option.value)}
            disabled={saving}
          >
            <div 
              className="status-dot" 
              style={{ backgroundColor: option.color }}
            />
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
