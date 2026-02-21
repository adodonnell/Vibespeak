import React, { useState } from 'react';
import './ChannelPane.css';
import UserPanel from './UserPanel';

export interface Channel {
  id: number;
  name: string;
  type: 'text' | 'voice';
  topic?: string;
}

export interface ChannelCategory {
  id: string;
  name: string;
  isExpanded: boolean;
  channels: Channel[];
}

export interface VoiceChannelUser {
  clientId: string;
  username: string;
  displayName?: string;
  isSpeaking?: boolean;
  isMuted?: boolean;
}

export interface VoiceChannelData {
  channelId: string; // channel name
  users: VoiceChannelUser[];
}

interface ChannelPaneProps {
  serverName: string;
  categories: ChannelCategory[];
  currentChannelId: number | null;
  onChannelSelect: (channelId: number, type: 'text' | 'voice') => void;
  onChannelDoubleClick?: (channel: Channel) => void;
  onToggleCategory: (categoryId: string) => void;
  onCreateChannel?: (categoryId: string, type: 'text' | 'voice') => void;
  onSettingsClick?: () => void;
  // Voice channel presence
  voiceChannels?: VoiceChannelData[];
  currentUserVoiceChannel?: string;
  // Current user info (for footer panel)
  currentUsername?: string;
  currentUserAvatarUrl?: string;
  currentUserStatus?: 'online' | 'idle' | 'dnd' | 'offline';
  isMuted?: boolean;
  isDeafened?: boolean;
  onMuteToggle?: () => void;
  onDeafenToggle?: () => void;
  onUserSettingsClick?: () => void;
  onStatusChange?: (status: 'online' | 'idle' | 'dnd' | 'offline') => void;
}

function getAvatarColor(name: string): string {
  const colors = ['#5865F2','#eb459e','#57F287','#FEE75C','#ED4245','#00b0f4','#f47fff'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}

const ChannelPane: React.FC<ChannelPaneProps> = ({
  serverName,
  categories,
  currentChannelId,
  onChannelSelect,
  onChannelDoubleClick,
  onToggleCategory,
  onCreateChannel,
  onSettingsClick,
  voiceChannels = [],
  currentUserVoiceChannel,
  currentUsername,
  currentUserAvatarUrl,
  currentUserStatus = 'online',
  isMuted = false,
  isDeafened = false,
  onMuteToggle,
  onDeafenToggle,
  onUserSettingsClick,
  onStatusChange,
}) => {
  const [showCreateMenu, setShowCreateMenu] = useState(false);

  const handleCreateChannel = (type: 'text' | 'voice') => {
    setShowCreateMenu(false);
    if (onCreateChannel && categories.length > 0) {
      onCreateChannel(categories[0].id, type);
    }
  };

  // Look up voice users for a given channel name
  const getVoiceUsers = (channelName: string): VoiceChannelUser[] => {
    const found = voiceChannels.find(vc => vc.channelId === channelName);
    return found?.users ?? [];
  };

  return (
    <div className="channel-pane">
      {/* Server Header */}
      <div className="channel-pane-header">
        <h2 className="server-name">{serverName}</h2>
        <button
          className="settings-btn"
          onClick={onSettingsClick}
          title="Server Settings"
        >
          ⚙
        </button>
      </div>

      {/* Channel Categories */}
      <div className="channel-list">
        {categories.map((category) => (
          <div key={category.id} className="channel-category">
            {/* Category Header */}
            <div
              className="category-header"
              onClick={() => onToggleCategory(category.id)}
            >
              <span className="category-toggle">{category.isExpanded ? '▼' : '▶'}</span>
              <span className="category-name">{category.name}</span>
              <button
                className="add-channel-btn"
                onClick={(e) => { e.stopPropagation(); setShowCreateMenu(!showCreateMenu); }}
                title="Create Channel"
              >
                +
              </button>
            </div>

            {/* Channels in Category */}
            {category.isExpanded && (
              <div className="category-channels">
                {category.channels.map((channel) => {
                  const voiceUsers = channel.type === 'voice' ? getVoiceUsers(channel.name) : [];
                  const isCurrentUserHere = channel.type === 'voice' && currentUserVoiceChannel === channel.name;
                  const hasUsers = voiceUsers.length > 0;

                  return (
                    <div key={channel.id} className="channel-entry">
                      {/* Channel Row */}
                      <div
                        className={`channel-item ${currentChannelId === channel.id ? 'active' : ''} ${isCurrentUserHere ? 'in-voice' : ''}`}
                        onClick={() => onChannelSelect(channel.id, channel.type)}
                        onDoubleClick={() => onChannelDoubleClick?.(channel)}
                        title={channel.topic || channel.name}
                      >
                        <span className="channel-icon">
                          {channel.type === 'text' ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                            </svg>
                          )}
                        </span>
                        <span className="channel-name">{channel.name}</span>

                        {/* User count badge for voice channels */}
                        {channel.type === 'voice' && hasUsers && (
                          <span className="voice-user-count" title={`${voiceUsers.length} user${voiceUsers.length !== 1 ? 's' : ''} in channel`}>
                            {voiceUsers.length}
                          </span>
                        )}

                        {/* "You're here" indicator */}
                        {isCurrentUserHere && (
                          <span className="in-voice-indicator" title="You are in this channel">●</span>
                        )}
                      </div>

                      {/* Voice Channel Members — shown when users are present */}
                      {channel.type === 'voice' && hasUsers && (
                        <div className="voice-channel-members">
                          {voiceUsers.map((u) => {
                            const name = u.displayName || u.username || 'Unknown';
                            return (
                              <div
                                key={u.clientId}
                                className={`voice-member-row ${u.isSpeaking ? 'speaking' : ''}`}
                                title={name}
                              >
                                {/* Speaking ring + avatar */}
                                <div className={`voice-member-avatar-wrap ${u.isSpeaking ? 'speaking' : ''}`}>
                                  <div
                                    className="voice-member-avatar"
                                    style={{ background: getAvatarColor(name) }}
                                  >
                                    {name.charAt(0).toUpperCase()}
                                  </div>
                                </div>
                                <span className="voice-member-name">{name}</span>
                                {u.isMuted && <span className="voice-member-muted" title="Muted">🔇</span>}
                                {u.isSpeaking && !u.isMuted && (
                                  <span className="voice-member-speaking-icon" title="Speaking">🎤</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {/* Create Channel Menu */}
        {showCreateMenu && (
          <div className="create-channel-menu">
            <button onClick={() => handleCreateChannel('text')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
              </svg>
              Text Channel
            </button>
            <button onClick={() => handleCreateChannel('voice')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
              </svg>
              Voice Channel
            </button>
          </div>
        )}
      </div>
      {/* Current User Panel — footer pinned to bottom of channel pane */}
      {currentUsername && (
        <UserPanel
          username={currentUsername}
          status={currentUserStatus}
          isMuted={isMuted}
          isDeafened={isDeafened}
          onToggleMute={onMuteToggle}
          onToggleDeafen={onDeafenToggle}
          onOpenSettings={onUserSettingsClick}
          onStatusChange={onStatusChange}
        />
      )}
    </div>
  );
};

export default ChannelPane;
