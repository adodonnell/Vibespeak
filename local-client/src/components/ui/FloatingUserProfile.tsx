import React, { useState, useEffect, useRef } from 'react';
import './FloatingUserProfile.css';

interface FloatingUserProfileProps {
  username: string;
  userId?: number;
  status?: 'online' | 'idle' | 'dnd' | 'offline';
  avatar?: string;
  customStatus?: string;
  roles?: string[];
  joinDate?: string;
  onClose?: () => void;
  targetRef: React.RefObject<HTMLElement>;
}

const STATUS_COLORS: Record<string, string> = {
  online: '#23A559',
  idle: '#F0B232',
  dnd: '#F23F43',
  offline: '#80848E',
};

const STATUS_LABELS: Record<string, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  offline: 'Offline',
};

function getAvatarGradient(username: string) {
  const hash = username.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const gradients = [
    'linear-gradient(135deg,#667eea 0%,#764ba2 100%)',
    'linear-gradient(135deg,#f093fb 0%,#f5576c 100%)',
    'linear-gradient(135deg,#4facfe 0%,#00f2fe 100%)',
    'linear-gradient(135deg,#43e97b 0%,#38f9d7 100%)',
    'linear-gradient(135deg,#fa709a 0%,#fee140 100%)',
  ];
  return gradients[hash % gradients.length];
}

const FloatingUserProfile: React.FC<FloatingUserProfileProps> = ({
  username,
  userId,
  status = 'online',
  avatar,
  customStatus,
  roles = [],
  joinDate,
  onClose,
  targetRef,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (targetRef.current && popupRef.current) {
      const targetRect = targetRef.current.getBoundingClientRect();
      const popupRect = popupRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left = targetRect.right + 12;
      let top = targetRect.top;

      // Flip to left if no room on right
      if (left + popupRect.width > viewportWidth - 16) {
        left = targetRect.left - popupRect.width - 12;
      }

      // Clamp to bottom
      if (top + popupRect.height > viewportHeight - 16) {
        top = viewportHeight - popupRect.height - 16;
      }

      // Clamp to top
      if (top < 16) top = 16;

      setPosition({ top, left });
    }
  }, [targetRef]);

  return (
    <div
      ref={popupRef}
      className="floating-user-profile"
      style={{ top: position.top, left: position.left }}
      onMouseLeave={onClose}
    >
      {/* Banner with avatar */}
      <div className="fup-banner">
        <div className="fup-banner-bg" />
        <div className="fup-avatar-wrapper">
          <div
            className="fup-avatar"
            style={{ background: avatar ? undefined : getAvatarGradient(username) }}
          >
            {avatar ? (
              <img src={avatar} alt={username} />
            ) : (
              username.charAt(0).toUpperCase()
            )}
          </div>
          <div
            className="fup-status-ring"
            style={{ borderColor: STATUS_COLORS[status] }}
          />
        </div>
      </div>

      {/* User info */}
      <div className="fup-info">
        <div className="fup-username">{username}</div>
        <div className="fup-status-row">
          <span className="fup-status-dot" style={{ background: STATUS_COLORS[status] }} />
          <span className="fup-status-text">{STATUS_LABELS[status]}</span>
          {customStatus && <span className="fup-custom-status"> — {customStatus}</span>}
        </div>

        {/* Roles */}
        {roles.length > 0 && (
          <div className="fup-roles">
            <div className="fup-section-label">ROLES</div>
            <div className="fup-role-list">
              {roles.map((role, i) => (
                <span key={i} className="fup-role">{role}</span>
              ))}
            </div>
          </div>
        )}

        {/* Member since */}
        {joinDate && (
          <div className="fup-member-since">
            <div className="fup-section-label">MEMBER SINCE</div>
            <div className="fup-date">{joinDate}</div>
          </div>
        )}

        {/* Actions */}
        <div className="fup-actions">
          <button className="fup-action-btn" title="Message">
            💬
          </button>
          <button className="fup-action-btn" title="Add Friend">
            ➕
          </button>
          <button className="fup-action-btn" title="More">
            ⋯
          </button>
        </div>
      </div>
    </div>
  );
};

export default FloatingUserProfile;