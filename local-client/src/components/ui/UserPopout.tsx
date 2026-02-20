// VibeSpeak User Popout Card
// Shows when clicking on a user's avatar/name

import React, { useEffect, useRef } from 'react';
import './UserPopout.css';

export interface UserPopoutData {
  id: number;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  customStatus?: string;
  roles?: string[];
  joinedAt?: string;
  isOwner?: boolean;
}

interface UserPopoutProps {
  user: UserPopoutData;
  position: { x: number; y: number };
  onClose: () => void;
  onMessage?: () => void;
  onProfile?: () => void;
}

// Status color mapping
const STATUS_COLORS: Record<string, string> = {
  online: 'var(--status-online)',
  idle: 'var(--status-idle)',
  dnd: 'var(--status-dnd)',
  offline: 'var(--status-offline)',
};

const STATUS_LABELS: Record<string, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  offline: 'Offline',
};

// Avatar gradient helper
function getAvatarGradient(username: string) {
  const hash = username.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const gradients = [
    'linear-gradient(135deg,#667eea 0%,#764ba2 100%)',
    'linear-gradient(135deg,#f093fb 0%,#f5576c 100%)',
    'linear-gradient(135deg,#4facfe 0%,#00f2fe 100%)',
    'linear-gradient(135deg,#43e97b 0%,#38f9d7 100%)',
    'linear-gradient(135deg,#fa709a 0%,#fee140 100%)',
    'linear-gradient(135deg,#a8edea 0%,#fed6e3 100%)',
  ];
  return gradients[hash % gradients.length];
}

export const UserPopout: React.FC<UserPopoutProps> = ({
  user,
  position,
  onClose,
  onMessage,
  onProfile,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Close on escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Adjust position to stay in viewport
  const adjustedPosition = { ...position };
  if (cardRef.current) {
    const rect = cardRef.current.getBoundingClientRect();
    if (position.x + 300 > window.innerWidth) {
      adjustedPosition.x = window.innerWidth - 320;
    }
    if (position.y + rect.height > window.innerHeight) {
      adjustedPosition.y = window.innerHeight - rect.height - 20;
    }
  }

  return (
    <div
      ref={cardRef}
      className="user-popout"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
    >
      {/* Banner area with avatar */}
      <div className="popout-banner">
        <div className="popout-avatar-wrapper">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.username} className="popout-avatar" />
          ) : (
            <div
              className="popout-avatar popout-avatar-default"
              style={{ background: getAvatarGradient(user.username) }}
            >
              {user.username.charAt(0).toUpperCase()}
            </div>
          )}
          <div
            className="popout-status-indicator"
            style={{ background: STATUS_COLORS[user.status] }}
          />
        </div>
      </div>

      {/* User info */}
      <div className="popout-info">
        <div className="popout-username-section">
          <span className="popout-display-name">
            {user.displayName || user.username}
          </span>
          <span className="popout-username-tag">#{user.username}</span>
          {user.isOwner && (
            <span className="popout-owner-badge" title="Server Owner">
              👑
            </span>
          )}
        </div>

        {/* Status text */}
        <div className="popout-status-text">
          <span
            className="popout-status-dot"
            style={{ background: STATUS_COLORS[user.status] }}
          />
          <span>{user.customStatus || STATUS_LABELS[user.status]}</span>
        </div>

        {/* Roles */}
        {user.roles && user.roles.length > 0 && (
          <div className="popout-roles">
            <div className="popout-roles-label">ROLES</div>
            <div className="popout-roles-list">
              {user.roles.map((role, i) => (
                <span key={i} className="popout-role-tag">
                  {role}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Member since */}
        {user.joinedAt && (
          <div className="popout-member-since">
            <div className="popout-section-label">MEMBER SINCE</div>
            <div className="popout-member-date">
              {new Date(user.joinedAt).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="popout-actions">
        <button className="popout-action-btn" onClick={onMessage} title="Send Message">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
          </svg>
          <span>Message</span>
        </button>
        <button className="popout-action-btn" onClick={onProfile} title="View Profile">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
          <span>Profile</span>
        </button>
      </div>
    </div>
  );
};

export default UserPopout;