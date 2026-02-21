import React, { useState, useEffect } from 'react';

export interface VoiceUser {
  id: string;
  username: string;
  avatar?: string;
  ping: number;
  packetLoss: number;
  isSpeaking: boolean;
  audioLevel: number;
  isMuted: boolean;
  isDeafened: boolean;
  isAdmin?: boolean;
  // Extended stats
  bytesSent?: number;
  bytesReceived?: number;
  packetsReceived?: number;
  packetsLost?: number;
  jitter?: number;
  codec?: string;
  bitrate?: number;
  connectedSince?: number;
  idleTime?: number;
}

interface UserCardProps {
  user: VoiceUser;
  isCurrentUser: boolean;
  onVolumeChange?: (userId: string, volume: number) => void;
  showStats?: boolean;
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format duration to human readable
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

const UserCard: React.FC<UserCardProps> = ({
  user,
  isCurrentUser,
  onVolumeChange,
  showStats = false
}) => {
  const [volume, setVolume] = useState(100);
  const [expanded, setExpanded] = useState(false);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseInt(e.target.value);
    setVolume(newVolume);
    if (onVolumeChange) {
      onVolumeChange(user.id, newVolume);
    }
  };

  const getPingClass = () => {
    if (user.ping < 30) return 'good';
    if (user.ping < 100) return '';
    return 'bad';
  };

  const getLossClass = () => {
    if (user.packetLoss === 0) return 'good';
    if (user.packetLoss < 1) return '';
    return 'bad';
  };

  // Generate mock spectrogram data
  const [spectrogramData, setSpectrogramData] = useState<number[]>([]);
  
  useEffect(() => {
    // Simulate audio visualization data
    const interval = setInterval(() => {
      if (user.isSpeaking && !user.isMuted) {
        setSpectrogramData(prev => {
          const newData = [...prev, Math.random() * 100];
          return newData.slice(-20);
        });
      } else {
        setSpectrogramData(prev => {
          const newData = [...prev, 0];
          return newData.slice(-20);
        });
      }
    }, 50);
    
    return () => clearInterval(interval);
  }, [user.isSpeaking, user.isMuted]);

  return (
    <div 
      className={`user-card ${user.isSpeaking && !user.isMuted ? 'speaking' : ''}`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Background avatar image */}
      <div 
        className="user-card-bg"
        style={{
          backgroundImage: user.avatar ? `url(${user.avatar})` : undefined,
          backgroundColor: user.avatar ? undefined : 'var(--accent)'
        }}
      />
      
      <div className="user-card-content">
        {/* Avatar with speaking indicator */}
        <div className={`user-card-avatar-wrapper ${user.isSpeaking && !user.isMuted ? 'speaking' : ''}`}>
          <div className="user-card-avatar">
            {user.avatar ? (
              <img 
                src={user.avatar} 
                alt={user.username}
                style={{ width: '100%', height: '100%', borderRadius: '12px', objectFit: 'cover' }}
              />
            ) : (
              user.username.charAt(0).toUpperCase()
            )}
          </div>
          {/* Speaking ring animation */}
          {user.isSpeaking && !user.isMuted && (
            <div className="speaking-ring" />
          )}
        </div>
        
        {/* Name */}
        <div className="user-card-name">
          {user.isAdmin && <span style={{ marginRight: '4px', fontSize: '12px' }} title="Admin">🛡️</span>}
          {user.username}
          {isCurrentUser && <span style={{ fontSize: '10px', marginLeft: '4px', opacity: 0.7 }}>(You)</span>}
        </div>
        
        {/* Tech Stats */}
        <div className="user-card-stats">
          <span className={`user-card-stat ${getPingClass()}`}>
            <span className="stat-icon ping-icon" /> {user.ping}ms
          </span>
          <span className={`user-card-stat ${getLossClass()}`}>
            <span className="stat-icon signal-icon" /> {user.packetLoss}% loss
          </span>
        </div>

        {/* Status indicators */}
        <div className="user-card-status">
          {user.isMuted && (
            <span className="status-badge muted" title="Muted">🔇</span>
          )}
          {user.isDeafened && (
            <span className="status-badge deafened" title="Deafened">🔇🎧</span>
          )}
          {user.isSpeaking && !user.isMuted && (
            <span className="status-badge speaking" title="Speaking">🎤</span>
          )}
        </div>
        
        {/* Volume Slider */}
        {!isCurrentUser && (
          <div className="user-card-volume">
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolumeChange}
              className="volume-slider-vc"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* Expanded connection stats */}
        {expanded && showStats && (
          <div className="user-card-expanded" onClick={(e) => e.stopPropagation()}>
            <div className="stats-section">
              <div className="stats-title">Connection Info</div>
              
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-label">Ping</span>
                  <span className={`stat-value ${getPingClass()}`}>{user.ping}ms</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Jitter</span>
                  <span className="stat-value">{user.jitter?.toFixed(1) || '0'}ms</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Packet Loss</span>
                  <span className={`stat-value ${getLossClass()}`}>{user.packetLoss}%</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Packets Lost</span>
                  <span className="stat-value">{user.packetsLost || 0}</span>
                </div>
              </div>

              <div className="stats-divider" />

              <div className="stats-title">Data Transfer</div>
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-label">↑ Sent</span>
                  <span className="stat-value">{formatBytes(user.bytesSent || 0)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">↓ Received</span>
                  <span className="stat-value">{formatBytes(user.bytesReceived || 0)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Packets In</span>
                  <span className="stat-value">{user.packetsReceived?.toLocaleString() || '0'}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Bitrate</span>
                  <span className="stat-value">{user.bitrate ? `${Math.round(user.bitrate / 1000)} kbps` : '—'}</span>
                </div>
              </div>

              <div className="stats-divider" />

              <div className="stats-title">Session</div>
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-label">Connected</span>
                  <span className="stat-value">
                    {user.connectedSince ? formatDuration(Date.now() - user.connectedSince) : '—'}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Idle</span>
                  <span className="stat-value">
                    {user.idleTime ? formatDuration(user.idleTime) : '—'}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Codec</span>
                  <span className="stat-value">{user.codec || 'Opus'}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserCard;