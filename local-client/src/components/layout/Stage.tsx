import React, { useState, useEffect } from 'react';
import VoiceDashboard from '../stage/VoiceDashboard';
import ScreenShareViewer from '../stage/ScreenShareViewer';
import ChatArea from '../ChatArea';
import Pinboard from '../stage/Pinboard';
import type { ChatMessage } from './MainPane';

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

export type { ChatMessage };


interface OnlineMember {
  id: number;
  username: string;
  status: string;
  inVoiceChannel?: string;
}

interface ScreenShareInfo {
  stream: MediaStream;
  presenterName: string;
  isLocal: boolean;
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
  // Screen share - support multiple simultaneous shares
  screenShareStream?: MediaStream | null;
  screenSharePresenter?: string;
  isLocalScreenShare?: boolean;
  screenShares?: Map<string, ScreenShareInfo>; // New: multiple shares support
  onStartScreenShare?: () => void;
  onStopScreenShare?: () => void;
}

// ─── Live stream notification banner ─────────────────────────────────────────
interface LiveBannerProps {
  presenterName: string;
  channelName: string;
  onWatch: () => void;
}

// ─── Video component that handles srcObject via ref ───────────────────────────
interface VideoPlayerProps {
  stream: MediaStream;
  style?: React.CSSProperties;
  className?: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ stream, style, className }) => {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      style={style}
      className={className}
    />
  );
};

// ─── Multi-Stream Grid View Component ─────────────────────────────────────────
interface ScreenShareGridProps {
  shares: Map<string, ScreenShareInfo>;
  onStopSharing?: () => void;
  currentUsername: string;
  channelName: string;
  isGridView: boolean;
  onToggleGridView: () => void;
  focusedShareId: string | null;
  onFocusShare: (id: string | null) => void;
}

const ScreenShareGrid: React.FC<ScreenShareGridProps> = ({
  shares,
  onStopSharing,
  currentUsername,
  channelName,
  isGridView,
  onToggleGridView,
  focusedShareId,
  onFocusShare,
}) => {
  const sharesArray = Array.from(shares.entries());
  const count = sharesArray.length;

  if (count === 0) return null;

  // Single stream - full size
  if (count === 1) {
    const [id, info] = sharesArray[0];
    return (
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <ScreenShareViewer
          stream={info.stream}
          presenterName={info.isLocal ? currentUsername : info.presenterName}
          isLocalShare={info.isLocal}
          onStopSharing={info.isLocal ? onStopSharing : undefined}
          channelName={channelName}
        />
      </div>
    );
  }

  // Focused view - one large, others as thumbnails
  if (focusedShareId && shares.has(focusedShareId)) {
    const focusedShare = shares.get(focusedShareId)!;
    const others = sharesArray.filter(([id]) => id !== focusedShareId);

    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
        {/* Main focused view */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
          <ScreenShareViewer
            stream={focusedShare.stream}
            presenterName={focusedShare.isLocal ? currentUsername : focusedShare.presenterName}
            isLocalShare={focusedShare.isLocal}
            onStopSharing={focusedShare.isLocal ? onStopSharing : undefined}
            channelName={channelName}
          />
        </div>
        
        {/* Thumbnail strip */}
        <div style={{
          display: 'flex',
          gap: 8,
          height: 100,
          padding: '4px 0',
          overflowX: 'auto',
        }}>
          {others.map(([id, info]) => (
            <div
              key={id}
              onClick={() => onFocusShare(id)}
              style={{
                width: 160,
                height: 100,
                flexShrink: 0,
                borderRadius: 6,
                overflow: 'hidden',
                cursor: 'pointer',
                border: '2px solid transparent',
                transition: 'border-color 0.2s',
              }}
            >
              <div style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                background: '#1a1b1e',
              }}>
                <VideoPlayer
                  stream={info.stream}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
                <div style={{
                  position: 'absolute',
                  bottom: 4,
                  left: 4,
                  padding: '2px 6px',
                  background: 'rgba(0,0,0,0.7)',
                  borderRadius: 4,
                  fontSize: 10,
                  color: '#fff',
                }}>
                  {info.presenterName}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Grid view for 2+ streams
  const getGridStyle = (): React.CSSProperties => {
    const cols = count <= 2 ? 2 : count <= 4 ? 2 : 3;
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: 8,
      padding: 8,
      flex: 1,
      minHeight: 0,
    };
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Grid controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{ fontSize: 12, color: '#949ba4' }}>
          📺 {count} screen shares
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onFocusShare(null)}
            style={{
              padding: '4px 8px',
              background: isGridView ? '#5865f2' : 'rgba(88,101,242,0.2)',
              border: 'none',
              borderRadius: 4,
              color: '#fff',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Grid
          </button>
          <button
            onClick={() => onFocusShare(sharesArray[0][0])}
            style={{
              padding: '4px 8px',
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: 4,
              color: '#fff',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Focus
          </button>
        </div>
      </div>

      {/* Grid content */}
      <div style={getGridStyle()}>
        {sharesArray.map(([id, info]) => (
          <div
            key={id}
            onClick={() => onFocusShare(id)}
            style={{
              position: 'relative',
              borderRadius: 8,
              overflow: 'hidden',
              background: '#1a1b1e',
              cursor: 'pointer',
              minHeight: 150,
            }}
          >
            <VideoPlayer
              stream={info.stream}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
            <div style={{
              position: 'absolute',
              top: 8,
              left: 8,
              padding: '4px 8px',
              background: 'rgba(0,0,0,0.7)',
              borderRadius: 4,
              fontSize: 11,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}>
              <span style={{
                background: info.isLocal ? '#3ba55c' : '#ed4245',
                width: 6,
                height: 6,
                borderRadius: '50%',
              }} />
              {info.isLocal ? 'You' : info.presenterName}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Live Banner (single stream notification) ─────────────────────────────────
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
  
  // Grid view for multiple streams
  const [isGridView, setIsGridView] = useState(false);

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

  // Auto-enable grid view when multiple streams are available
  useEffect(() => {
    // This would be triggered by the parent component when multiple screenShares are detected
    // For now, we'll add a button to toggle grid view manually
  }, []);

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
