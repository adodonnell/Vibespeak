import React, { useState, useEffect } from 'react';

export type ScreenShareQuality = '1080p60' | '1080p30' | '720p60' | '720p30' | '480p30';

export interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
}

interface QualityOption {
  value: ScreenShareQuality;
  label: string;
  fps: number;
  res: string;
  desc: string;
}

const QUALITY_OPTIONS: QualityOption[] = [
  { value: '1080p60', label: '1080p', fps: 60, res: '1920×1080', desc: 'Best quality. Requires fast upload.' },
  { value: '1080p30', label: '1080p', fps: 30, res: '1920×1080', desc: 'High quality, lower bandwidth.' },
  { value: '720p60',  label: '720p',  fps: 60, res: '1280×720',  desc: 'Smooth motion, moderate bandwidth.' },
  { value: '720p30',  label: '720p',  fps: 30, res: '1280×720',  desc: 'Good balance of quality and speed.' },
  { value: '480p30',  label: '480p',  fps: 30, res: '854×480',   desc: 'Low bandwidth. Best for slow connections.' },
];

interface Props {
  isOpen: boolean;
  channelName: string;
  defaultQuality?: ScreenShareQuality;
  onStart: (quality: ScreenShareQuality) => void;
  onCancel: () => void;
}

const ScreenShareStartModal: React.FC<Props> = ({
  isOpen,
  channelName,
  defaultQuality = '1080p60',
  onStart,
  onCancel,
}) => {
  const [selected, setSelected] = useState<ScreenShareQuality>(defaultQuality);
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [isLoadingSources, setIsLoadingSources] = useState(false);

  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && 
    typeof (window as any).electronAPI?.getScreenSources === 'function';

  // Load screen sources when modal opens (Electron only)
  useEffect(() => {
    if (isOpen && isElectron) {
      setIsLoadingSources(true);
      (window as any).electronAPI.getScreenSources()
        .then((srcs: Array<{ id: string; name: string; thumbnail: { toDataURL: () => string } }>) => {
          setSources(srcs.map(s => ({
            id: s.id,
            name: s.name,
            thumbnail: s.thumbnail.toDataURL(),
          })));
          // Auto-select first source
          if (srcs.length > 0) {
            setSelectedSource(srcs[0].id);
          }
        })
        .catch(console.error)
        .finally(() => setIsLoadingSources(false));
    }
  }, [isOpen, isElectron]);

  if (!isOpen) return null;

  const handleStart = () => {
    // In Electron, we need to tell the main process which source to use
    if (isElectron && selectedSource) {
      // Store the selected source ID so the main process can use it
      sessionStorage.setItem('vibespeak:screen-source', selectedSource);
    }
    onStart(selected);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 440,
          background: '#313338',
          borderRadius: 8,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 20 }}>🖥️</span>
            <h2 style={{ color: '#f2f3f5', fontSize: 18, fontWeight: 700, margin: 0 }}>
              Share Your Screen
            </h2>
          </div>
          <p style={{ color: '#949ba4', fontSize: 13, margin: '4px 0 16px' }}>
            Going live in <strong style={{ color: '#5865f2' }}>🔊 {channelName}</strong>
          </p>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #3a3c40', margin: 0 }} />

        {/* Quality picker */}
        <div style={{ padding: '16px 24px' }}>
          <p style={{
            color: '#b5bac1',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}>
            Stream Quality
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {QUALITY_OPTIONS.map(opt => {
              const active = selected === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setSelected(opt.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 14px',
                    background: active ? 'rgba(88,101,242,0.15)' : '#2b2d31',
                    border: `2px solid ${active ? '#5865f2' : 'transparent'}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  {/* Radio dot */}
                  <div style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: `2px solid ${active ? '#5865f2' : '#72767d'}`,
                    background: active ? '#5865f2' : 'transparent',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {active && (
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
                    )}
                  </div>

                  {/* Resolution badge */}
                  <div style={{
                    minWidth: 38,
                    textAlign: 'center',
                    background: active ? '#5865f2' : '#4e5058',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 4,
                    padding: '2px 6px',
                  }}>
                    {opt.label}
                  </div>

                  {/* FPS badge */}
                  <div style={{
                    minWidth: 44,
                    textAlign: 'center',
                    background: active ? 'rgba(88,101,242,0.3)' : '#383a40',
                    color: active ? '#c9cdfb' : '#949ba4',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    padding: '2px 6px',
                  }}>
                    {opt.fps} fps
                  </div>

                  {/* Resolution text + description */}
                  <div style={{ flex: 1 }}>
                    <span style={{ color: active ? '#fff' : '#b5bac1', fontSize: 13, fontWeight: 600 }}>
                      {opt.res}
                    </span>
                    <p style={{ color: '#72767d', fontSize: 11, margin: 0 }}>{opt.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <p style={{ color: '#72767d', fontSize: 11, marginTop: 10 }}>
            ℹ️ Your browser will prompt you to choose a screen, window, or tab after clicking Go Live.
          </p>
        </div>

        {/* Screen/Window source picker (Electron only) */}
        {isElectron && (
          <div style={{ padding: '0 24px 16px' }}>
            <p style={{
              color: '#b5bac1',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}>
              Select Source
            </p>
            
            {isLoadingSources ? (
              <div style={{ textAlign: 'center', padding: 20, color: '#72767d' }}>
                Loading sources...
              </div>
            ) : sources.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: '#72767d' }}>
                No screen sources available. Make sure screen recording permissions are granted.
              </div>
            ) : (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(2, 1fr)', 
                gap: 8,
                maxHeight: 200,
                overflowY: 'auto',
              }}>
                {sources.map(source => (
                  <button
                    key={source.id}
                    onClick={() => setSelectedSource(source.id)}
                    style={{
                      padding: 8,
                      background: selectedSource === source.id ? 'rgba(88,101,242,0.15)' : '#2b2d31',
                      border: `2px solid ${selectedSource === source.id ? '#5865f2' : 'transparent'}`,
                      borderRadius: 6,
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <img 
                      src={source.thumbnail} 
                      alt={source.name}
                      style={{ 
                        width: '100%', 
                        height: 60, 
                        objectFit: 'cover', 
                        borderRadius: 4,
                        background: '#1e1f22',
                      }}
                    />
                    <span style={{ 
                      color: '#dbdee1', 
                      fontSize: 11, 
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {source.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '12px 24px 20px',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10,
          borderTop: '1px solid #3a3c40',
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 20px',
              background: 'transparent',
              border: '1px solid #4e5058',
              borderRadius: 4,
              color: '#dbdee1',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onStart(selected)}
            style={{
              padding: '8px 24px',
              background: '#5865f2',
              border: 'none',
              borderRadius: 4,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            🔴 Go Live
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScreenShareStartModal;
