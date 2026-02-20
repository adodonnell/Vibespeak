import React, { useState } from 'react';

export interface ChannelUser {
  id: string;
  username: string;
  avatar?: string;
  isCommander?: boolean;
  isMuted?: boolean;
  isDeafened?: boolean;
  isRecording?: boolean;
  status?: 'online' | 'idle' | 'dnd' | 'offline';
}

export interface Channel {
  id: string;
  name: string;
  type: 'text' | 'voice';
  codec?: string;
  bitrate?: number;
  children?: Channel[];
  users?: ChannelUser[];
  icon?: string;
  unread?: number;
  mentions?: number;
}

export interface ChannelCategory {
  id: string;
  name: string;
  channels: Channel[];
  isExpanded: boolean;
}

interface VoiceChannelUser {
  clientId: string;
  displayName?: string;
}

interface VoiceChannelWithUsers {
  channelId: string;
  users: VoiceChannelUser[];
}

interface ConnectTreeProps {
  categories: ChannelCategory[];
  voiceChannels?: VoiceChannelWithUsers[];
  currentChannelId: string;
  currentChannelName: string;
  onChannelSelect: (channelId: string, channelType: 'text' | 'voice') => void;
  onChannelDoubleClick?: (channel: Channel) => void;
  onToggleCategory: (categoryId: string) => void;
  onCreateChannel?: (categoryId: string, channelType: 'text' | 'voice') => void;
  serverName: string;
}

// Channel icon component
const ChannelIcon: React.FC<{ type: 'text' | 'voice'; icon?: string }> = ({ type, icon }) => {
  if (type === 'voice') {
    return (
      <span style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        width: '18px',
        height: '18px',
        opacity: 0.7,
      }}>
        {icon || '🔊'}
      </span>
    );
  }
  return (
    <span style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      width: '18px',
      height: '18px',
      opacity: 0.5,
      fontWeight: 600,
      fontSize: '16px',
    }}>
      #
    </span>
  );
};

// Single channel item
const ChannelItem: React.FC<{
  channel: Channel;
  isActive: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  depth?: number;
}> = ({ channel, isActive, onClick, onDoubleClick, depth = 0 }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 8px',
        margin: '2px 8px',
        borderRadius: '4px',
        cursor: 'pointer',
        background: isActive 
          ? 'rgba(76, 147, 255, 0.15)' 
          : isHovered 
            ? 'rgba(255, 255, 255, 0.06)' 
            : 'transparent',
        transition: 'background 0.15s',
        paddingLeft: `${12 + depth * 12}px`,
      }}
    >
      {/* Unread/mention indicator */}
      {channel.mentions !== undefined && channel.mentions > 0 && (
        <div style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: 'var(--alert-color)',
          marginRight: '6px',
          flexShrink: 0,
        }} />
      )}
      
      <ChannelIcon type={channel.type} icon={channel.icon} />
      
      <span style={{
        flex: 1,
        marginLeft: '6px',
        fontSize: '14px',
        fontWeight: 500,
        color: isActive 
          ? 'var(--text-color)' 
          : channel.mentions !== undefined && channel.mentions > 0
            ? 'var(--text-color)'
            : 'var(--text-muted)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {channel.name}
      </span>
      
      {/* User count for voice channels */}
      {channel.type === 'voice' && channel.users && channel.users.length > 0 && (
        <span style={{
          fontSize: '12px',
          color: 'var(--text-muted)',
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}>
          {channel.users.length}
        </span>
      )}
      
      {/* Notification settings icon if has unread */}
      {channel.unread !== undefined && channel.unread > 0 && !channel.mentions && (
        <span style={{
          fontSize: '12px',
          color: 'var(--text-muted)',
          marginLeft: 'auto',
        }}>
          🔔
        </span>
      )}
    </div>
  );
};

// User in voice channel
const VoiceChannelUser: React.FC<{
  user: ChannelUser;
}> = ({ user }) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '4px 8px',
      paddingLeft: '28px',
      gap: '8px',
    }}>
      {/* Avatar */}
      <div style={{
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, var(--primary-color), var(--accent-teal))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '11px',
        fontWeight: 600,
        color: 'white',
        flexShrink: 0,
      }}>
        {user.username.charAt(0).toUpperCase()}
      </div>
      
      {/* Name */}
      <span style={{
        fontSize: '13px',
        color: 'var(--text-color)',
        flex: 1,
      }}>
        {user.username}
      </span>
      
      {/* Status icons */}
      <div style={{ display: 'flex', gap: '4px' }}>
        {user.isMuted && <span style={{ opacity: 0.7 }}>🔇</span>}
        {user.isDeafened && <span style={{ opacity: 0.7 }}>🎧</span>}
        {user.isRecording && <span style={{ color: 'var(--alert-color)' }}>⏺</span>}
        {user.isCommander && (
          <span style={{
            fontSize: '10px',
            padding: '1px 4px',
            borderRadius: '3px',
            background: 'var(--primary-color)',
            color: 'white',
          }}>
            CDR
          </span>
        )}
      </div>
    </div>
  );
};

// Category header
const CategoryHeader: React.FC<{
  name: string;
  isExpanded: boolean;
  onClick: () => void;
}> = ({ name, isExpanded, onClick }) => {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 8px',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <span style={{
        fontSize: '10px',
        color: 'var(--text-muted)',
        marginRight: '4px',
        width: '16px',
        opacity: 0.7,
        transition: 'transform 0.15s',
        transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
      }}>
        ▼
      </span>
      <span style={{
        fontSize: '12px',
        fontWeight: 600,
        textTransform: 'uppercase',
        color: 'rgba(255, 255, 255, 0.5)',
        letterSpacing: '0.5px',
        flex: 1,
      }}>
        {name}
      </span>
    </div>
  );
};

const ConnectTree: React.FC<ConnectTreeProps> = ({
  categories,
  voiceChannels = [],
  currentChannelId,
  currentChannelName,
  onChannelSelect,
  onChannelDoubleClick,
  onToggleCategory,
}) => {
  // Track which categories are expanded locally if no handler provided
  const [localExpanded, setLocalExpanded] = useState<Record<string, boolean>>(() => {
    const expanded: Record<string, boolean> = {};
    categories.forEach(cat => {
      expanded[cat.id] = cat.isExpanded;
    });
    return expanded;
  });

  const handleToggle = (categoryId: string) => {
    if (onToggleCategory) {
      onToggleCategory(categoryId);
    } else {
      setLocalExpanded(prev => ({
        ...prev,
        [categoryId]: !prev[categoryId]
      }));
    }
  };

  const isExpanded = (categoryId: string) => {
    const cat = categories.find(c => c.id === categoryId);
    return localExpanded[categoryId] ?? cat?.isExpanded ?? true;
  };

  return (
    <div 
      style={{
        width: '240px',
        minWidth: '180px',
        maxWidth: '300px',
        background: 'var(--side-pane-color)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        fontWeight: 600,
        fontSize: '14px',
        borderBottom: '1px solid var(--divider)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        color: 'var(--text-color)',
        boxShadow: '0 1px 0 rgba(0, 0, 0, 0.2)',
        zIndex: 1,
      }}>
        <span>{currentChannelName || 'Select a channel'}</span>
      </div>
      
      {/* Content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px 0',
      }}>
        {categories.map(category => (
          <div key={category.id}>
            <CategoryHeader
              name={category.name}
              isExpanded={isExpanded(category.id)}
              onClick={() => handleToggle(category.id)}
            />
            
            {isExpanded(category.id) && (
              <div>
                {category.channels.map(channel => (
                  <div key={channel.id}>
                    <ChannelItem
                      channel={channel}
                      isActive={currentChannelId === channel.id}
                      onClick={() => onChannelSelect(channel.id, channel.type)}
                      onDoubleClick={() => onChannelDoubleClick?.(channel)}
                    />
                    
                    {/* Show users inside voice channels */}
                    {channel.type === 'voice' && channel.users && channel.users.length > 0 && (
                      <div>
                        {channel.users.map(user => (
                          <VoiceChannelUser key={user.id} user={user} />
                        ))}
                      </div>
                    )}
                    
                    {/* Show users from voiceChannels prop */}
                    {channel.type === 'voice' && 
                     !channel.users && 
                     voiceChannels.find(vc => vc.channelId === channel.id)?.users.map(user => (
                      <VoiceChannelUser 
                        key={user.clientId} 
                        user={{ id: user.clientId, username: user.displayName || user.clientId }} 
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        
        {categories.length === 0 && (
          <div style={{
            padding: '20px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '14px',
          }}>
            No channels yet
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectTree;
