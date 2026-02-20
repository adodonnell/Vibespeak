import React, { useState, useEffect } from 'react';
import VoiceDashboard from '../stage/VoiceDashboard';
import ScreenShareViewer from '../stage/ScreenShareViewer';
import ChatArea from '../ChatArea';
import Pinboard from '../stage/Pinboard';

export interface VoiceUser {
  id: string;
  username: string;
  avatar?: string;
  ping: number;
  packetLoss: number;
  isSpeaking: boolean;
  audioLevel: number;
  isMuted: boolean;
  isDeafened: boolean;
}

export interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
}


interface OnlineMember {
  id: number;
  username: string;
  status: string;
  inVoiceChannel?: string;
}

interface StageProps {
  viewMode: 'voice' | 'text';
  channelName: string;
  channelId?: number | null;
  voiceUsers: VoiceUser[];
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onReactMessage?: (messageId: string, emoji: string) => void;
  messageInput: string;
  onMessageInputChange: (value: string) => void;
  currentUsername: string;
  onPinboardToggle?: () => void;
  isPinboardOpen?: boolean;
  onlineUsers?: OnlineMember[];
  // Screen share
  screenShareStream?: MediaStream | null;
  screenSharePresenter?: string;
  isLocalScreenShare?: boolean;
  onStartScreenShare?: () => void;
  onStopScreenShare?: () => void;
}

// ─── Live stream notification banner ─────────────────────────────────────────
interface LiveBannerProps {
  presenterName: string;
  channelName: string;
  onWatch: () => void;
}

const LiveBanner: React.FC<LiveBannerProps> = ({ presenterName, channelName, onWatch }) => (
  <div style={{
    margin: '8px 12px',
    padding: '10px 14px',
    background: 'rgba(237,66,69,0.08)',
    border: '1px solid rgba(237,66,69,0.3)',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  }}>
    {/* Live dot */}
    <span style={{
      background: '#ED4245',
      color: '#fff',
      fontSize: 10,
      fontWeight: 700,
      padding: '2px 5px',
      borderRadius: 3,
      letterSpacing: 1,
      flexShrink: 0,
    }}>LIVE</span>

    {/* Avatar initial */}
    <div style={{
      width: 26,
      height: 26,
      borderRadius: '50%',
      background: '#5865f2',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 11,
      fontWeight: 700,
      color: '#fff',
      flexShrink: 0,
    }}>
      {presenterName.charAt(0).toUpperCase()}
    </div>

    {/* Text */}
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#f2f3f5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {presenterName} is sharing their screen
      </p>
      <p style={{ margin: 0, fontSize: 11, color: '#949ba4' }}>🔊 {channelName}</p>
    </div>

    {/* Watch button */}
    <button
      onClick={onWatch}
      style={{
        padding: '5px 14px',
        background: '#5865f2',
        border: 'none',
        borderRadius: 4,
        color: '#fff',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      Watch
    </button>
  </div>
);

// ─── Stage ────────────────────────────────────────────────────────────────────
const Stage: React.FC<StageProps> = ({
  viewMode,
  channelName,
  channelId,
  voiceUsers,
  messages,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onReactMessage,
  messageInput,
  onMessageInputChange,
  currentUsername,
  onPinboardToggle,
  isPinboardOpen = true,
  onlineUsers = [],
  screenShareStream,
  screenSharePresenter = '',
  isLocalScreenShare = false,
  onStartScreenShare,
  onStopScreenShare,
}) => {
  const [membersExpanded, setMembersExpanded] = useState(true);

  // Per-viewer opt-in: false = see the notification banner, true = watching the stream
  const [isWatchingStream, setIsWatchingStream] = useState(false);

  // Reset watch state when the stream ends
  useEffect(() => {
    if (!screenShareStream) {
      setIsWatchingStream(false);
    }
  }, [screenShareStream]);

  // Auto-watch when you are the broadcaster (local share)
  useEffect(() => {
    if (isLocalScreenShare && screenShareStream) {
      setIsWatchingStream(true);
    }
  }, [isLocalScreenShare, screenShareStream]);

  // Member list helpers
  const voiceChannelMembers = voiceUsers.map(u => ({
    id: u.id,
    username: u.username,
    status: 'voice',
    inVoiceChannel: channelName,
  }));

  const allMembers = onlineUsers.map(user => ({
    ...user,
    inVoiceChannel: voiceUsers.find(vu => vu.username === user.username) ? channelName : undefined,
  }));

  const displayMembers = viewMode === 'voice' ? voiceChannelMembers : allMembers;

  // Whether to show the full-screen theater or just the banner
  const showTheater = !!screenShareStream && (isLocalScreenShare || isWatchingStream);
  const showBanner  = !!screenShareStream && !isLocalScreenShare && !isWatchingStream;

  return (
    <div className="stage">
      <div className="stage-header">
        <span className="channel-hash">{viewMode === 'voice' ? '🔊' : '#'}</span>
        <span className="stage-header-title">{channelName}</span>
        {/* "Watching" badge when a viewer is watching */}
        {showTheater && !isLocalScreenShare && (
          <button
            onClick={() => setIsWatchingStream(false)}
            title="Stop watching"
            style={{
              marginLeft: 'auto',
              marginRight: 8,
              padding: '3px 10px',
              background: 'rgba(237,66,69,0.12)',
              border: '1px solid rgba(237,66,69,0.4)',
              borderRadius: 4,
              color: '#f38ba8',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ✕ Stop Watching
          </button>
        )}
      </div>

      <div className="stage-content">
        {viewMode === 'voice' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, minHeight: 0 }}>

            {/* ── THEATER: broadcaster preview or opt-in viewer ── */}
            {showTheater && (
              <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                <ScreenShareViewer
                  stream={screenShareStream!}
                  presenterName={isLocalScreenShare ? currentUsername : screenSharePresenter}
                  isLocalShare={isLocalScreenShare}
                  onStopSharing={onStopScreenShare}
                  channelName={channelName}
                />
              </div>
            )}

            {/* ── NORMAL VOICE TILES (always shown; compact strip when theater is open) ── */}
            <div style={{
              height: showTheater ? 120 : undefined,
              flex: showTheater ? undefined : 1,
              flexShrink: 0,
              minHeight: showTheater ? 120 : undefined,
              borderTop: showTheater ? '1px solid rgba(255,255,255,0.06)' : undefined,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <VoiceDashboard users={voiceUsers} currentUsername={currentUsername} />

              {/* "Someone is streaming" opt-in banner — shown instead of theater */}
              {showBanner && (
                <LiveBanner
                  presenterName={screenSharePresenter}
                  channelName={channelName}
                  onWatch={() => setIsWatchingStream(true)}
                />
              )}

              {/* Share Screen button — only when nobody is sharing and user is in voice */}
              {!screenShareStream && voiceUsers.length > 0 && onStartScreenShare && (
                <div style={{ padding: '10px 12px', flexShrink: 0 }}>
                  <button
                    onClick={onStartScreenShare}
                    style={{
                      width: '100%',
                      padding: '8px 0',
                      background: 'rgba(88,101,242,0.12)',
                      border: '1px solid rgba(88,101,242,0.35)',
                      borderRadius: 6,
                      color: '#7289da',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    🖥️ Share Screen
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', height: '100%', minWidth: 0, flex: 1 }}>
              {/* ChatArea stub — chat is handled by MainPane in the active layout */}
              <ChatArea />
              <Pinboard
                channelId={channelId ?? null}
                isOpen={isPinboardOpen}
                onToggle={onPinboardToggle}
              />
            </div>

            {/* Members sidebar */}
            <div className="members-panel">
              <div
                className="members-header"
                onClick={() => setMembersExpanded(v => !v)}
              >
                <span className="members-title">
                  {membersExpanded ? '▼' : '▶'} Online — {displayMembers.length}
                </span>
              </div>

              {membersExpanded && (
                <div className="members-list">
                  {displayMembers.length === 0 ? (
                    <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>
                      No members online
                    </div>
                  ) : (
                    displayMembers.map((member, index) => (
                      <div
                        key={`${member.id}-${index}`}
                        className="member-row"
                        style={{ display: 'flex', alignItems: 'center', padding: '6px 16px', gap: '10px', cursor: 'pointer' }}
                      >
                        <div style={{ position: 'relative' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--accent-color)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontWeight: 'bold',
                            fontSize: '14px',
                          }}>
                            {member.username.charAt(0).toUpperCase()}
                          </div>
                          <div style={{
                            position: 'absolute',
                            bottom: '-2px',
                            right: '-2px',
                            width: '14px',
                            height: '14px',
                            borderRadius: '50%',
                            backgroundColor: member.inVoiceChannel ? '#3ba55c' : '#747f8d',
                            border: '3px solid var(--bg-secondary)',
                          }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                            {member.username}
                            {member.username === currentUsername && (
                              <span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}> (you)</span>
                            )}
                          </div>
                          {member.inVoiceChannel && (
                            <div style={{ fontSize: '11px', color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              🔊 {member.inVoiceChannel}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Stage;
