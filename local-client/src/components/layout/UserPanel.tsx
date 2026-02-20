import React, { useState } from 'react';
import './UserPanel.css';

interface UserPanelProps {
  username: string;
  userId?: number;
  status?: 'online' | 'idle' | 'dnd' | 'offline';
  isMuted?: boolean;
  isDeafened?: boolean;
  isInVoice?: boolean;
  onToggleMute?: () => void;
  onToggleDeafen?: () => void;
  onOpenSettings?: () => void;
  onLeaveVoice?: () => void;
  onStatusChange?: (status: 'online' | 'idle' | 'dnd' | 'offline') => void;
}

// ── SVG Icons ────────────────────────────────────────────────
const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
  </svg>
);
const MicOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.34 3 3 3 .23 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
  </svg>
);
const HeadphonesIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h1v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-2v8h1c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/>
  </svg>
);
const HeadphonesOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3.27 3L2 4.27l7 7H5v2H3v5c0 1.1.9 2 2 2h1v-6h2v6h1c.42 0 .79-.17 1.08-.42L16.73 22 18 20.73 3.27 3zm9-2c-1.53 0-2.99.38-4.28 1.05l1.43 1.43C10.25 3.17 11.1 3 12 3c3.87 0 7 3.13 7 7v2h-2v3.73l2 2V12c0-4.97-4.03-9-9-9z"/>
  </svg>
);
const SettingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
  </svg>
);
const LeaveVoiceIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
  </svg>
);

function getAvatarGradient(username: string) {
  const hash = username.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const gradients = [
    'linear-gradient(135deg,#667eea 0%,#764ba2 100%)',
    'linear-gradient(135deg,#f093fb 0%,#f5576c 100%)',
    'linear-gradient(135deg,#4facfe 0%,#00f2fe 100%)',
    'linear-gradient(135deg,#43e97b 0%,#38f9d7 100%)',
    'linear-gradient(135deg,#fa709a 0%,#fee140 100%)',
    'linear-gradient(135deg,#a8edea 0%,#fed6e3 100%)',
    'linear-gradient(135deg,#ff9a9e 0%,#fecfef 100%)',
    'linear-gradient(135deg,#fbc2eb 0%,#a6c1ee 100%)',
  ];
  return gradients[hash % gradients.length];
}

const STATUS_COLORS: Record<string, string> = {
  online: '#23A559',
  idle: '#F0B232',
  dnd: '#F23F43',
  offline: '#80848E',
};

const STATUS_OPTIONS: Array<{ value: 'online' | 'idle' | 'dnd' | 'offline'; label: string; emoji: string }> = [
  { value: 'online', label: 'Online', emoji: '🟢' },
  { value: 'idle', label: 'Idle', emoji: '🟡' },
  { value: 'dnd', label: 'Do Not Disturb', emoji: '🔴' },
  { value: 'offline', label: 'Invisible', emoji: '⚫' },
];

const UserPanel: React.FC<UserPanelProps> = ({
  username,
  userId,
  status = 'online',
  isMuted = false,
  isDeafened = false,
  isInVoice = false,
  onToggleMute,
  onToggleDeafen,
  onOpenSettings,
  onLeaveVoice,
  onStatusChange,
}) => {
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const handleStatusSelect = (newStatus: 'online' | 'idle' | 'dnd' | 'offline') => {
    onStatusChange?.(newStatus);
    setShowStatusMenu(false);
  };

  return (
    <div className="user-panel">
      {/* Avatar + name */}
      <div 
        className="user-panel-identity" 
        title={`${username} — Click to change status`}
        onClick={() => setShowStatusMenu(!showStatusMenu)}
      >
        <div className="user-panel-avatar-wrap">
          <div
            className="user-panel-avatar"
            style={{ background: getAvatarGradient(username) }}
          >
            {username.charAt(0).toUpperCase()}
          </div>
          <div
            className="user-status-dot"
            style={{ background: STATUS_COLORS[status] }}
          />
        </div>
        <div className="user-panel-names">
          <span className="user-panel-username">{username}</span>
          <span className="user-panel-tag">{STATUS_OPTIONS.find(s => s.value === status)?.label || status}</span>
        </div>
        
        {/* Status dropdown menu */}
        {showStatusMenu && (
          <div className="status-dropdown">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`status-option ${status === opt.value ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleStatusSelect(opt.value); }}
              >
                <span className="status-emoji">{opt.emoji}</span>
                <span className="status-label">{opt.label}</span>
                {status === opt.value && <span className="status-check">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="user-panel-controls">
        {/* Mute */}
        <button
          className={`user-ctrl-btn ${isMuted ? 'active danger' : ''}`}
          onClick={onToggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOffIcon /> : <MicIcon />}
        </button>

        {/* Deafen */}
        <button
          className={`user-ctrl-btn ${isDeafened ? 'active danger' : ''}`}
          onClick={onToggleDeafen}
          title={isDeafened ? 'Undeafen' : 'Deafen'}
        >
          {isDeafened ? <HeadphonesOffIcon /> : <HeadphonesIcon />}
        </button>

        {/* Leave voice (only when in voice) */}
        {isInVoice && (
          <button className="user-ctrl-btn danger" onClick={onLeaveVoice} title="Disconnect">
            <LeaveVoiceIcon />
          </button>
        )}

        {/* Settings */}
        <button className="user-ctrl-btn" onClick={onOpenSettings} title="User Settings">
          <SettingsIcon />
        </button>
      </div>
    </div>
  );
};

export default UserPanel;
