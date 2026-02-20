import React, { useEffect, useRef, useState, useCallback } from 'react';

interface ScreenShareViewerProps {
  stream: MediaStream;
  presenterName: string;
  isLocalShare: boolean;          // true if this client is the broadcaster
  onStopSharing?: () => void;
  channelName?: string;
}

// Fullscreen icon (expand)
const FullscreenIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
  </svg>
);

// Exit fullscreen icon (shrink)
const ExitFullscreenIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
  </svg>
);

const ScreenShareViewer: React.FC<ScreenShareViewerProps> = ({
  stream,
  presenterName,
  isLocalShare,
  onStopSharing,
  channelName = 'Voice Channel',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Attach stream to video element
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [stream]);

  // Listen for fullscreen changes (including user pressing Escape)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Auto-hide controls after 3s of no mouse movement
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    resetHideTimer();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [resetHideTimer]);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  }, []);

  // Double-click to toggle fullscreen
  const handleDoubleClick = useCallback(() => {
    toggleFullscreen();
  }, [toggleFullscreen]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
      onMouseMove={resetHideTimer}
      onDoubleClick={handleDoubleClick}
    >
      {/* Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocalShare}           // mute local preview to avoid echo
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          background: '#000',
        }}
      />

      {/* Twitch-style presenter badge — top-left */}
      <div style={{
        position: 'absolute',
        top: 12,
        left: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        opacity: showControls ? 1 : 0,
        transition: 'opacity 0.3s',
        pointerEvents: 'none',
      }}>
        {/* Live dot */}
        <span style={{
          background: '#E91916',
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          padding: '2px 6px',
          borderRadius: 3,
          letterSpacing: 1,
        }}>LIVE</span>

        {/* Presenter avatar initial */}
        <div style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: '#5865F2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
          color: '#fff',
          border: '2px solid rgba(255,255,255,0.2)',
        }}>
          {presenterName.charAt(0).toUpperCase()}
        </div>

        {/* Presenter name + channel */}
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
            {presenterName}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
            🔊 {channelName}
          </div>
        </div>
      </div>

      {/* Controls bar — bottom */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '32px 16px 12px',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 8,
        opacity: showControls ? 1 : 0,
        transition: 'opacity 0.3s',
      }}>
        {/* Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen (or press Escape)' : 'Fullscreen (or double-click)'}
          style={controlBtn}
        >
          {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
          <span style={{ fontSize: 11, marginLeft: 6 }}>
            {isFullscreen ? 'Exit' : 'Fullscreen'}
          </span>
        </button>

        {/* Stop sharing (only shown for broadcaster) */}
        {isLocalShare && onStopSharing && (
          <button
            onClick={onStopSharing}
            title="Stop sharing"
            style={{ ...controlBtn, background: 'rgba(237,66,69,0.8)', border: '1px solid #ED4245' }}
          >
            ⏹ Stop Sharing
          </button>
        )}
      </div>

      {/* If local share — tiny preview label */}
      {isLocalShare && (
        <div style={{
          position: 'absolute',
          top: 12,
          right: 12,
          background: 'rgba(0,0,0,0.6)',
          color: '#57F287',
          fontSize: 11,
          fontWeight: 700,
          padding: '3px 8px',
          borderRadius: 4,
          border: '1px solid #57F287',
          pointerEvents: 'none',
        }}>
          YOU ARE SHARING
        </div>
      )}
    </div>
  );
};

const controlBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '6px 12px',
  borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(0,0,0,0.6)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  backdropFilter: 'blur(4px)',
};

export default ScreenShareViewer;
