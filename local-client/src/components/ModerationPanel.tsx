import { useState, useEffect } from 'react';
import { apiClient } from '../services/api-client';

interface Ban {
  id: number;
  user_id: number;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  reason: string | null;
  banned_at: string;
}

interface AuditLog {
  id: number;
  server_id: number;
  user_id: number;
  action: string;
  target_user_id: number;
  reason: string;
  created_at: string;
  actor_username: string;
}

interface ModerationPanelProps {
  serverId: number;
  onClose?: () => void;
}

export default function ModerationPanel({ serverId, onClose }: ModerationPanelProps) {
  const [activeTab, setActiveTab] = useState<'bans' | 'audit'>('bans');
  const [bans, setBans] = useState<Ban[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (activeTab === 'bans') {
      loadBans();
    } else {
      loadAuditLogs();
    }
  }, [activeTab, serverId]);

  const loadBans = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiClient.getBans(serverId);
      setBans(data);
    } catch (err) {
      setError('Failed to load bans');
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiClient.getAuditLogs(serverId);
      setAuditLogs(data);
    } catch (err) {
      setError('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const handleUnban = async (userId: number) => {
    if (!confirm('Are you sure you want to unban this user?')) return;
    
    setLoading(true);
    setError('');
    try {
      await apiClient.unbanUser(serverId, userId);
      loadBans();
    } catch (err) {
      setError('Failed to unban user');
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'ban': return '🚫';
      case 'kick': return '👢';
      case 'mute': return '🔇';
      case 'warn': return '⚠️';
      case 'unban': return '✅';
      default: return '📋';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <div className="moderation-panel">
      <div className="panel-header">
        <h2>Moderation</h2>
        {onClose && <button className="btn-close" onClick={onClose}>×</button>}
      </div>

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'bans' ? 'active' : ''}`}
          onClick={() => setActiveTab('bans')}
        >
          Bans ({bans.length})
        </button>
        <button 
          className={`tab ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          Audit Logs
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {activeTab === 'bans' && (
        <div className="bans-list">
          {loading && <div className="loading">Loading bans...</div>}
          {!loading && bans.length === 0 && (
            <div className="empty-state">
              <p>No banned users</p>
            </div>
          )}
          {bans.map(ban => (
            <div key={ban.id} className="ban-item">
              <div className="user-info">
                <div className="avatar">
                  {ban.avatar_url ? (
                    <img src={ban.avatar_url} alt={ban.username} />
                  ) : (
                    ban.username.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="user-details">
                  <span className="username">{ban.display_name || ban.username}</span>
                  <span className="reason">{ban.reason || 'No reason provided'}</span>
                </div>
              </div>
              <div className="ban-meta">
                <span className="date">Banned {formatDate(ban.banned_at)}</span>
                <button 
                  className="btn-secondary"
                  onClick={() => handleUnban(ban.user_id)}
                  disabled={loading}
                >
                  Unban
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="audit-logs">
          {loading && <div className="loading">Loading audit logs...</div>}
          {!loading && auditLogs.length === 0 && (
            <div className="empty-state">
              <p>No audit logs yet</p>
            </div>
          )}
          {auditLogs.map(log => (
            <div key={log.id} className="audit-item">
              <div className="action-icon">{getActionIcon(log.action)}</div>
              <div className="audit-details">
                <span className="action">
                  <strong>{log.actor_username}</strong> {log.action} user ID {log.target_user_id}
                </span>
                {log.reason && <span className="reason">{log.reason}</span>}
                <span className="date">{formatDate(log.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
