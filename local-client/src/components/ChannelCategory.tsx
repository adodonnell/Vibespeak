import { useState } from 'react';

export interface Channel {
  id: string;
  name: string;
  type: 'text' | 'voice';
  unread?: number;
  mentions?: number;
}

export interface ChannelCategory {
  id: string;
  name: string;
  channels: Channel[];
  collapsed?: boolean;
}

interface ChannelCategoryProps {
  category: ChannelCategory;
  activeChannel?: string;
  onChannelClick: (channelId: string) => void;
  onToggleCollapse?: () => void;
}

export function ChannelCategory({ 
  category, 
  activeChannel, 
  onChannelClick,
  onToggleCollapse 
}: ChannelCategoryProps) {
  const [isCollapsed, setIsCollapsed] = useState(category.collapsed || false);

  const handleToggle = () => {
    setIsCollapsed(!isCollapsed);
    onToggleCollapse?.();
  };

  const hasUnread = category.channels.some(c => c.unread && c.unread > 0);
  const hasMentions = category.channels.some(c => c.mentions && c.mentions > 0);

  return (
    <div className="channel-category">
      <div 
        className="channel-category-header" 
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleToggle()}
      >
        <span className="category-toggle">
          {isCollapsed ? '▶' : '▼'}
        </span>
        <span className="category-name">{category.name}</span>
        <span className="category-count">
          {category.channels.length}
        </span>
        {hasMentions && <span className="category-mention-indicator">●</span>}
      </div>
      
      {!isCollapsed && (
        <div className="channel-category-channels">
          {category.channels.map(channel => (
            <div
              key={channel.id}
              className={`channel-item ${activeChannel === channel.id ? 'active' : ''} ${channel.mentions ? 'has-mentions' : ''}`}
              onClick={() => onChannelClick(channel.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onChannelClick(channel.id)}
            >
              <span className="channel-hash">
                {channel.type === 'text' ? '#' : '🔊'}
              </span>
              <span className="channel-name">{channel.name}</span>
              
              {channel.mentions && channel.mentions > 0 && (
                <span className="channel-mention-badge">{channel.mentions}</span>
              )}
              
              {channel.unread && channel.unread > 0 && !channel.mentions && (
                <span className="channel-unread-badge">{channel.unread}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Demo categories
export const demoCategories: ChannelCategory[] = [
  {
    id: '1',
    name: 'Welcome',
    channels: [
      { id: 'welcome', name: 'welcome', type: 'text' },
      { id: 'rules', name: 'rules', type: 'text' },
    ]
  },
  {
    id: '2',
    name: 'General',
    channels: [
      { id: 'general', name: 'general', type: 'text', unread: 3 },
      { id: 'off-topic', name: 'off-topic', type: 'text' },
      { id: 'music', name: 'music', type: 'text' },
    ]
  },
  {
    id: '3',
    name: 'Voice Channels',
    channels: [
      { id: 'voice-lounge', name: 'Voice Lounge', type: 'voice' },
      { id: 'gaming', name: 'Gaming', type: 'voice' },
      { id: 'music-room', name: 'Music Room', type: 'voice' },
    ]
  },
  {
    id: '4',
    name: 'Support',
    channels: [
      { id: 'help', name: 'help', type: 'text', mentions: 2 },
      { id: 'feedback', name: 'feedback', type: 'text' },
    ]
  },
];
