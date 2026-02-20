import { useState, useEffect } from 'react';
import '../styles/theme.css';

export type UserStatus = 'online' | 'away' | 'dnd' | 'offline';

export interface User {
  id: string;
  username: string;
  status: UserStatus;
  isInVoice?: boolean;
  isMuted?: boolean;
  isDeafened?: boolean;
}

interface UserListProps {
  users: User[];
  currentUserId?: string;
  onUserClick?: (user: User) => void;
}

function UserList({ users, currentUserId }: UserListProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    'Online': true,
    'Voice': true,
  });

  // Group users by status
  const onlineUsers = users.filter(u => u.status === 'online' && !u.isInVoice);
  const awayUsers = users.filter(u => u.status === 'away' && !u.isInVoice);
  const dndUsers = users.filter(u => u.status === 'dnd' && !u.isInVoice);
  const voiceUsers = users.filter(u => u.isInVoice);
  const offlineUsers = users.filter(u => u.status === 'offline');

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [group]: !prev[group]
    }));
  };

  const getStatusColor = (status: UserStatus): string => {
    switch (status) {
      case 'online': return '#3ba55c';
      case 'away': return '#faa61a';
      case 'dnd': return '#ed4245';
      case 'offline': return '#72767d';
      default: return '#72767d';
    }
  };

  const getStatusText = (status: UserStatus): string => {
    switch (status) {
      case 'online': return 'Online';
      case 'away': return 'Idle';
      case 'dnd': return 'Do Not Disturb';
      case 'offline': return 'Offline';
      default: return 'Offline';
    }
  };

  const renderUser = (user: User) => (
    <div key={user.id} className="user-list-item" title={user.username}>
      <div className="user-list-avatar">
        {user.username.charAt(0).toUpperCase()}
        <div 
          className="user-list-status" 
          style={{ backgroundColor: getStatusColor(user.status) }}
        />
      </div>
      <div className="user-list-info">
        <span className="user-list-name">
          {user.username}
          {user.id === currentUserId && <span className="you-badge">(you)</span>}
        </span>
        {user.isInVoice && (
          <span className="user-list-voice-status">
            {user.isMuted ? '🔇' : ''} {user.isDeafened ? '🔊' : ''} in voice
          </span>
        )}
      </div>
    </div>
  );

  const renderGroup = (title: string, userList: User[], groupKey: string) => {
    if (userList.length === 0) return null;
    
    const isExpanded = expandedGroups[groupKey] ?? true;
    
    return (
      <div className="user-list-group">
        <div 
          className="user-list-group-header" 
          onClick={() => toggleGroup(groupKey)}
        >
          <span className="group-toggle">{isExpanded ? '▼' : '▶'}</span>
          <span className="group-title">{title}</span>
          <span className="group-count">{userList.length}</span>
        </div>
        {isExpanded && (
          <div className="user-list-group-content">
            {userList.map(renderUser)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="user-list">
      <div className="user-list-header">
        <span className="user-list-title">Users</span>
        <span className="user-list-count">{users.length}</span>
      </div>
      
      <div className="user-list-content">
        {renderGroup('Online — ' + (onlineUsers.length + awayUsers.length + dndUsers.length), 
          [...onlineUsers, ...awayUsers, ...dndUsers], 'Online')}
        {renderGroup('Voice — ' + voiceUsers.length, voiceUsers, 'Voice')}
        {renderGroup('Offline — ' + offlineUsers.length, offlineUsers, 'Offline')}
        
        {users.length === 0 && (
          <div className="user-list-empty">
            <p>No users online</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default UserList;
