import { useRef } from 'react';

export interface Channel {
  id: string;
  name: string;
  type: 'text' | 'voice';
  unreadCount?: number;
  mentioned?: boolean;
}

export interface ChannelCategory {
  id: string;
  name: string;
  channels: Channel[];
  isExpanded: boolean;
}

interface ChannelListProps {
  categories: ChannelCategory[];
  currentChannel: string;
  onSelectChannel: (channelId: string) => void;
  onDoubleClickChannel?: (channel: Channel) => void;
  onToggleCategory: (categoryId: string) => void;
  voiceUsers?: { channelId: string; username: string }[];
}

function ChannelList({ categories, currentChannel, onSelectChannel, onDoubleClickChannel, onToggleCategory, voiceUsers = [] }: ChannelListProps) {
  // Group voice users by channel
  const usersByChannel: Record<string, string[]> = {};
  voiceUsers.forEach(vu => {
    if (!usersByChannel[vu.channelId]) {
      usersByChannel[vu.channelId] = [];
    }
    usersByChannel[vu.channelId].push(vu.username);
  });

  // Track timeout for single-click debounce
  const clickTimeout = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const lastClickTime = useRef<number>(0);

  const handleClick = (channel: Channel) => {
    const now = Date.now();
    const channelKey = channel.id;
    
    // Check if this is a double-click (within 300ms)
    if (now - lastClickTime.current < 300 && clickTimeout.current[channelKey]) {
      // Double-click detected - cancel the single-click timeout
      clearTimeout(clickTimeout.current[channelKey]);
      delete clickTimeout.current[channelKey];
      
      // Execute double-click action
      if (onDoubleClickChannel) {
        onDoubleClickChannel(channel);
      }
      lastClickTime.current = 0;
    } else {
      // First click - set timeout for single-click action
      lastClickTime.current = now;
      clickTimeout.current[channelKey] = setTimeout(() => {
        onSelectChannel(channel.id);
        delete clickTimeout.current[channelKey];
      }, 300);
    }
  };

  return (
    <div className="channel-list">
      <div className="channel-header">Channels</div>
      
      {categories.map(category => (
        <div key={category.id} className="channel-category">
          <div 
            className="channel-category-header"
            onClick={() => onToggleCategory(category.id)}
          >
            <span className="category-toggle">
              {category.isExpanded ? '▼' : '▶'}
            </span>
            <span className="category-name">{category.name}</span>
          </div>
          
          {category.isExpanded && (
            <div className="channel-category-channels">
              {category.channels.map(channel => {
                const usersInChannel = usersByChannel[channel.id] || [];
                const isActive = currentChannel === channel.id;
                
                return (
                  <div key={channel.id}>
                    <div 
                      className={`channel-item ${isActive ? 'active' : ''} ${channel.unreadCount && !isActive ? 'has-unread' : ''}`}
                      onClick={() => handleClick(channel)}
                    >
                      {channel.type === 'voice' ? '🔊' : '#'} {channel.name}
                      {usersInChannel.length > 0 && (
                        <span className="voice-user-count">({usersInChannel.length})</span>
                      )}
                      {/* Unread badge */}
                      {channel.unreadCount && !isActive && channel.type === 'text' && (
                        <span className={`unread-badge ${channel.mentioned ? 'mentioned' : ''}`}>
                          {channel.mentioned ? '@' : channel.unreadCount > 99 ? '99+' : channel.unreadCount}
                        </span>
                      )}
                    </div>
                    
                    {/* Show voice users under voice channel */}
                    {channel.type === 'voice' && usersInChannel.length > 0 && (
                      <div className="voice-channel-users">
                        {usersInChannel.map((username, idx) => (
                          <div key={idx} className="voice-channel-user">
                            <span className="voice-user-icon">👤</span>
                            <span className="voice-user-name">{username}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default ChannelList;
