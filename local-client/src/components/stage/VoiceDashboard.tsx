import React from 'react';
import UserCard, { VoiceUser } from '../ui/UserCard';

// Re-export VoiceUser for backwards compatibility
export type { VoiceUser } from '../ui/UserCard';

interface VoiceDashboardProps {
  users: VoiceUser[];
  currentUsername: string;
  onVolumeChange?: (userId: string, volume: number) => void;
  showStats?: boolean;
}

const VoiceDashboard: React.FC<VoiceDashboardProps> = ({
  users,
  currentUsername,
  onVolumeChange,
  showStats = true
}) => {
  if (users.length === 0) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100%',
        color: 'var(--text-muted)'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎤</div>
        <div style={{ fontSize: '18px', marginBottom: '8px' }}>No one is in this channel</div>
        <div style={{ fontSize: '14px' }}>Double-click a channel to join</div>
      </div>
    );
  }

  return (
    <div className="voice-dashboard">
      {users.map(user => (
        <UserCard
          key={user.id}
          user={user}
          isCurrentUser={user.username === currentUsername}
          onVolumeChange={onVolumeChange}
          showStats={showStats}
        />
      ))}
    </div>
  );
};

export default VoiceDashboard;
