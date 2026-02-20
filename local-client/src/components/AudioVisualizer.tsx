import { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  audioLevel: number; // 0-100
  isActive: boolean;
  showWaveform?: boolean;
  width?: number;
  height?: number;
}

function AudioVisualizer({ 
  audioLevel, 
  isActive, 
  showWaveform = false,
  width = 200,
  height = 40 
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const levelHistoryRef = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Add current level to history
    levelHistoryRef.current.push(audioLevel);
    if (levelHistoryRef.current.length > width / 2) {
      levelHistoryRef.current.shift();
    }

    const draw = () => {
      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      if (!isActive) {
        // Draw inactive state
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(0, 0, width, height);
        
        // Draw inactive bars
        const barWidth = 3;
        const gap = 2;
        const numBars = Math.floor(width / (barWidth + gap));
        
        for (let i = 0; i < numBars; i++) {
          const barHeight = 4;
          const x = i * (barWidth + gap);
          const y = (height - barHeight) / 2;
          
          ctx.fillStyle = '#555';
          ctx.fillRect(x, y, barWidth, barHeight);
        }
        
        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      // Background
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(0, 0, width, height);

      if (showWaveform) {
        // Draw waveform style
        const history = levelHistoryRef.current;
        const barWidth = 2;
        const gap = 1;
        
        for (let i = 0; i < history.length; i++) {
          const level = history[i] / 100;
          const barHeight = Math.max(4, level * height * 0.8);
          const x = i * (barWidth + gap);
          const y = (height - barHeight) / 2;
          
          // Color based on level
          const hue = 120 - (level * 120); // Green to red
          ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
          
          ctx.fillRect(x, y, barWidth, barHeight);
        }
      } else {
        // Draw level meter style
        const barWidth = 4;
        const gap = 2;
        const numBars = Math.floor(width / (barWidth + gap));
        
        for (let i = 0; i < numBars; i++) {
          const threshold = (i / numBars) * 100;
          const isActive = audioLevel >= threshold;
          
          let barHeight: number;
          if (isActive) {
            // Active bar - height based on proximity to current level
            const distance = audioLevel - threshold;
            barHeight = Math.max(4, Math.min(height * 0.9, (distance / (100 / numBars)) * height * 0.9 + 4));
          } else {
            barHeight = 4;
          }
          
          const x = i * (barWidth + gap);
          const y = (height - barHeight) / 2;
          
          // Color gradient based on position
          const position = i / numBars;
          let color: string;
          if (position < 0.6) {
            color = '#4ade80'; // Green
          } else if (position < 0.85) {
            color = '#fbbf24'; // Yellow
          } else {
            color = '#ef4444'; // Red
          }
          
          ctx.fillStyle = isActive ? color : '#3a3a3a';
          ctx.fillRect(x, y, barWidth, barHeight);
        }
        
        // Draw current level indicator
        const levelX = (audioLevel / 100) * width;
        ctx.fillStyle = '#fff';
        ctx.fillRect(levelX - 1, 0, 2, height);
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [audioLevel, isActive, showWaveform, width, height]);

  return (
    <div className="audio-visualizer">
      <canvas 
        ref={canvasRef} 
        width={width} 
        height={height}
        style={{ 
          borderRadius: '4px',
          display: 'block'
        }}
      />
      <div className="visualizer-labels">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

export default AudioVisualizer;
