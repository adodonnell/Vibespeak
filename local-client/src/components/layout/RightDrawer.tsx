import React, { useState } from 'react';
import './RightDrawer.css';
import { ContextMenu, ContextMenuItem, ContextMenuIcons } from '../ui/ContextMenu';

export interface Member {
  id: number;
  username: string;
  displayName?: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  roles?: { id: number; name: string; color: string }[];
}

interface RightDrawerProps {
  isOpen: boolean;
  mode: 'members' | 'profile';
  members?: Member[];
  selectedMember?: Member | null;
  onClose: () => void;
  onMemberClick?: (member: Member) => void;
  // Moderation props
  serverId?: number;
  currentUserId?: number;
  isServerOwner?: boolean;
  onKickUser?: (member: Member) => void;
  onBanUser?: (member: Member) => void;
  onMuteUser?: (member: Member, durationMinutes?: number) => void;
}

const RightDrawer: React.FC<RightDrawerProps> = ({
  isOpen,
  mode,
  members = [],
  selectedMember,
  onClose,
  onMemberClick,
  serverId,
  currentUserId,
  isServerOwner,
  onKickUser,
  onBanUser,
  onMuteUser,
}) => {
  const [expandedRoles, setExpandedRoles] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; member: Member } | null>(null);

  if (!isOpen) return null;

  const toggleRoleGroup = (roleName: string) => {
    setExpandedRoles(prev => ({
      ...prev,
      [roleName]: !prev[roleName]
    }));
  };

  // Group members by online status first, then by role
  const onlineMembers = members.filter(m => m.status === 'online');
  const offlineMembers = members.filter(m => m.status !== 'online');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'var(--status-online)';
      case 'idle': return 'var(--status-idle)';
      case 'dnd': return 'var(--status-dnd)';
      default: return 'var(--status-offline)';
    }
  };

  const handleContextMenu = (e: React.MouseEvent, member: Member) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Don't show moderation options for yourself
    if (member.id === currentUserId) {
      return;
    }
    
    setContextMenu({ x: e.clientX, y: e.clientY, member });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const getContextMenuItems = (): ContextMenuItem[] => {
    if (!contextMenu?.member || !serverId) return [];
    
    const member = contextMenu.member;
    const items: ContextMenuItem[] = [
      {
        id: 'profile',
        label: 'View Profile',
        icon: ContextMenuIcons.profile,
        onClick: () => {
          onMemberClick?.(member);
        },
      },
    ];

    // Add moderation options if user has permissions
    if (isServerOwner && onKickUser) {
      items.push(
        { id: '---', label: '', disabled: true },
        {
          id: 'kick',
          label: 'Kick User',
          icon: ContextMenuIcons.kick,
          danger: true,
          onClick: () => {
            if (confirm(`Kick ${member.displayName || member.username}?`)) {
              onKickUser(member);
            }
          },
        }
      );
    }

    if (isServerOwner && onBanUser) {
      items.push({
        id: 'ban',
        label: 'Ban User',
        icon: ContextMenuIcons.ban,
        danger: true,
        onClick: () => {
          if (confirm(`Ban ${member.displayName || member.username}?`)) {
            onBanUser(member);
          }
        },
      });
    }

    if (isServerOwner && onMuteUser) {
      items.push({
        id: 'mute',
        label: 'Mute User',
        icon: ContextMenuIcons.mute,
        danger: true,
        submenu: [
          { id: 'mute-1h', label: '1 Hour', onClick: () => onMuteUser(member, 60) },
          { id: 'mute-24h', label: '24 Hours', onClick: () => onMuteUser(member, 1440) },
          { id: 'mute-7d', label: '7 Days', onClick: () => onMuteUser(member, 10080) },
          { id: 'mute-perm', label: 'Permanent', onClick: () => onMuteUser(member) },
        ],
      });
    }

    return items;
  };

  const MemberItem: React.FC<{ member: Member }> = ({ member }) => (
    <div 
      className="member-item"
      onClick={() => onMemberClick?.(member)}
      onContextMenu={(e) => handleContextMenu(e, member)}
    >
      <div className="member-avatar">
        {(member.username || '?').charAt(0).toUpperCase()}
        <span 
          className="status-indicator" 
          style={{ backgroundColor: getStatusColor(member.status) }}
        />
      </div>
      <div className="member-info">
        <span className="member-name">
          {member.displayName || member.username}
        </span>
        {member.roles && member.roles.length > 0 && (
          <span className="member-roles">
            {member.roles.slice(0, 2).map(role => (
              <span 
                key={role.id} 
                className="role-badge"
                style={{ color: role.color }}
              >
                {role.name}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="right-drawer">
      <div className="drawer-header">
        <h3 className="drawer-title">
          {mode === 'members' && `${members.length} Members`}
          {mode === 'profile' && 'Profile'}
        </h3>
        <button className="drawer-close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="drawer-content">
        {mode === 'members' && (
          <>
            {/* Online Members */}
            {onlineMembers.length > 0 && (
              <div className="member-group">
                <div 
                  className="member-group-header"
                  onClick={() => toggleRoleGroup('online')}
                >
                  <span className="group-toggle">
                    {expandedRoles['online'] ? '▼' : '▶'}
                  </span>
                  <span className="group-name">
                    Online — {onlineMembers.length}
                  </span>
                </div>
                {expandedRoles['online'] !== false && (
                  <div className="member-list">
                    {onlineMembers.map(member => (
                      <MemberItem key={member.id} member={member} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Offline Members */}
            {offlineMembers.length > 0 && (
              <div className="member-group">
                <div 
                  className="member-group-header"
                  onClick={() => toggleRoleGroup('offline')}
                >
                  <span className="group-toggle">
                    {expandedRoles['offline'] ? '▼' : '▶'}
                  </span>
                  <span className="group-name">
                    Offline — {offlineMembers.length}
                  </span>
                </div>
                {expandedRoles['offline'] !== false && (
                  <div className="member-list">
                    {offlineMembers.map(member => (
                      <MemberItem key={member.id} member={member} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {mode === 'profile' && (
          <div className="profile-view">
            <div className="profile-avatar">
              <span>{(selectedMember?.username ?? '?').charAt(0).toUpperCase()}</span>
              {selectedMember && (
                <span
                  className="status-indicator"
                  style={{ backgroundColor: getStatusColor(selectedMember.status) }}
                />
              )}
            </div>
            <h2 className="profile-username">
              {selectedMember?.displayName ?? selectedMember?.username ?? 'Unknown'}
            </h2>
            {selectedMember?.displayName && selectedMember.displayName !== selectedMember.username && (
              <p className="profile-discriminator">{selectedMember.username}</p>
            )}

            {selectedMember?.roles && selectedMember.roles.length > 0 && (
              <div className="profile-section">
                <h4>Roles</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                  {selectedMember.roles.map(role => (
                    <span
                      key={role.id}
                      className="role-badge"
                      style={{ color: role.color, border: `1px solid ${role.color}`, padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}
                    >
                      {role.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="profile-section">
              <h4>Status</h4>
              <p style={{ color: getStatusColor(selectedMember?.status ?? 'offline'), textTransform: 'capitalize' }}>
                {selectedMember?.status ?? 'offline'}
              </p>
            </div>
            
            <div className="profile-actions">
              <button className="profile-btn">Voice Call</button>
            </div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          items={getContextMenuItems()}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
};

export default RightDrawer;