import React, { useEffect, useRef, useState } from 'react';

interface TelemetryBarProps {
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  ping: number;
  codec: string;
  bitrate: number;
  ramUsage?: number;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleScreenShare: () => void;
  onOpenSettings?: () => void;
}

const TelemetryBar: React.FC<TelemetryBarProps> = ({
  isMuted,
  isDeafened,
  isScreenSharing,
  ping,
  codec,
  bitrate,
  ramUsage = 140,
  onToggleMute,
  onToggleDeafen,
  onToggleScreenShare,
  onOpenSettings
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pingHistory, setPingHistory] = useState<number[]>([]);

  // Simulate ping history
  useEffect(() => {
    const interval = setInterval(() => {
      setPingHistory(prev => {
        const newHistory = [...prev, ping];
        return newHistory.slice(-30);
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [ping]);

  // Draw ping graph
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, width, height);

    if (pingHistory.length < 2) return;

    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = ping < 50 ? '#27ae60' : ping < 100 ? '#f39c12' : '#e74c3c';
    ctx.lineWidth = 1.5;

    const maxPing = Math.max(...pingHistory, 100);
    const minPing = 0;

    pingHistory.forEach((value, index) => {
      const x = (index / (pingHistory.length - 1)) * width;
      const y = height - ((value - minPing) / (maxPing - minPing)) * height;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
  }, [pingHistory, ping]);

  return (
    <div className="telemetry-bar">
      {/* Self State - Mic */}
      <div 
        className={`telemetry-item ${isMuted ? 'active' : ''}`}
        onClick={onToggleMute}
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        <span className={`telemetry-icon mic-icon ${isMuted ? 'muted' : ''}`} />
      </div>

      {/* Self State - Headphones */}
      <div 
        className={`telemetry-item ${isDeafened ? 'active' : ''}`}
        onClick={onToggleDeafen}
        title={isDeafened ? 'Undeafen' : 'Deafen'}
      >
        <span className={`telemetry-icon headphone-icon ${isDeafened ? 'muted' : ''}`} />
      </div>

      {/* Screen Share */}
      <div 
        className={`telemetry-item ${isScreenSharing ? 'active' : ''}`}
        onClick={onToggleScreenShare}
        title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
      >
        <span className="telemetry-icon screen-icon" />
      </div>

      <div className="telemetry-spacer" />

      {/* Connection Graph - Ping History */}
      <div className="telemetry-graph" title={`Ping: ${ping}ms`}>
        <canvas ref={canvasRef} width={60} height={20} />
      </div>

      {/* Codec Info */}
      <div 
        className="telemetry-item telemetry-codec"
        onClick={onOpenSettings}
        title="Click to open audio settings"
      >
        {codec} | {bitrate}kbps
      </div>

      {/* Resource Usage */}
      <div className="telemetry-item telemetry-resource">
        RAM: {ramUsage}MB
      </div>
    </div>
  );
};

export default TelemetryBar;
