import React, { useState, useEffect } from 'react';

export type ScreenShareQuality = '1080p60' | '1080p30' | '720p60' | '720p30' | '480p30';

export interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
  type: 'screen' | 'window';
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

type TabType = 'screen' | 'window';

const ScreenShareStartModal: React.FC<Props> = ({
  isOpen,
  channelName,
  defaultQuality = '1080p60',
  onStart,
  onCancel,
}) => {
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<ScreenSource | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('screen');
  const [selectedQuality, setSelectedQuality] = useState<ScreenShareQuality>(defaultQuality);
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const [step, setStep] = useState<'source' | 'quality'>('source');

  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && 
    typeof (window as any).electronAPI?.getScreenSources === 'function';

  // Load screen sources when modal opens (Electron only)
  useEffect(() => {
    if (isOpen && isElectron) {
      setIsLoadingSources(true);
      (window as any).electronAPI.getScreenSources()
        .then((srcs: Array<{ id: string; name: string; thumbnail: string; type: 'screen' | 'window' }>) => {
          console.log('[ScreenShare] Received', srcs.length, 'sources from Electron');
          
          // Process sources - thumbnail is already a data URL string
          const processedSources: ScreenSource[] = srcs.map(s => {
            console.log(`[ScreenShare] Source: "${s.name}" -> ${s.type}`);
            return {
              id: s.id,
              name: s.name,
              thumbnail: s.thumbnail, // Already a data URL from main process
              type: s.type,
            };
          });
          
          setSources(processedSources);
        })
        .catch(console.error)
        .finally(() => setIsLoadingSources(false));
    }
  }, [isOpen, isElectron]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('source');
      setSelectedSource(null);
      setSelectedQuality(defaultQuality);
      setActiveTab('screen');
    }
  }, [isOpen, defaultQuality]);

  if (!isOpen) return null;

  const filteredSources = sources.filter(s => s.type === activeTab);

  const handleSourceSelect = (source: ScreenSource) => {
    setSelectedSource(source);
  };

  const handleContinue = () => {
    if (selectedSource) {
      // Store the selected source ID for the main process
      if (isElectron) {
        sessionStorage.setItem('vibespeak:screen-source', selectedSource.id);
      }
      setStep('quality');
    }
  };

  const handleStart = () => {
    onStart(selectedQuality);
  };

  const handleBack = () => {
    setStep('source');
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
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
          width: 520,
          maxWidth: '90vw',
          maxHeight: '90vh',
          background: '#313338',
          borderRadius: 8,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #3a3c40' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 24 }}>🖥️</span>
            <div>
              <h2 style={{ color: '#f2f3f5', fontSize: 20, fontWeight: 700, margin: 0 }}>
                {step === 'source' ? 'Choose what to share' : 'Stream settings'}
              </h2>
              <p style={{ color: '#949ba4', fontSize: 13, margin: '4px 0 0' }}>
                {step === 'source' 
                  ? `Select a screen or window to share in ${channelName}`
                  : 'Choose your stream quality'}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {step === 'source' ? (
            <>
              {/* Tabs */}
              {isElectron ? (
                <div style={{ 
                  display: 'flex', 
                  borderBottom: '1px solid #3a3c40',
                  background: '#2b2d31',
                }}>
                  <button
                    onClick={() => setActiveTab('screen')}
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      background: activeTab === 'screen' ? '#313338' : 'transparent',
                      border: 'none',
                      borderBottom: activeTab === 'screen' ? '2px solid #5865f2' : '2px solid transparent',
                      color: activeTab === 'screen' ? '#fff' : '#b5bac1',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 18 }}>🖥️</span>
                    Screens
                  </button>
                  <button
                    onClick={() => setActiveTab('window')}
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      background: activeTab === 'window' ? '#313338' : 'transparent',
                      border: 'none',
                      borderBottom: activeTab === 'window' ? '2px solid #5865f2' : '2px solid transparent',
                      color: activeTab === 'window' ? '#fff' : '#b5bac1',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 18 }}>🪟</span>
                    Windows
                  </button>
                </div>
              ) : (
                <div style={{ padding: '16px 24px', color: '#72767d', fontSize: 13, textAlign: 'center', background: '#2b2d31' }}>
                  ℹ️ Click "Go Live" to use your browser's screen picker
                </div>
              )}

              {/* Source Grid */}
              <div style={{ 
                flex: 1, 
                overflowY: 'auto', 
                padding: '16px',
                minHeight: 200,
              }}>
                {isLoadingSources ? (
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    height: '100%',
                    color: '#72767d',
                    gap: 12,
                  }}>
                    <div style={{ 
                      width: 32, 
                      height: 32, 
                      border: '3px solid #5865f2', 
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }} />
                    <span>Loading {activeTab}s...</span>
                  </div>
                ) : filteredSources.length === 0 ? (
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    height: '100%',
                    color: '#72767d',
                    gap: 12,
                    padding: 20,
                    textAlign: 'center',
                  }}>
                    <span style={{ fontSize: 48 }}>
                      {activeTab === 'screen' ? '🖥️' : '🪟'}
                    </span>
                    <div>
                      <p style={{ color: '#b5bac1', fontSize: 14, margin: 0 }}>No {activeTab}s detected</p>
                      <p style={{ fontSize: 12, margin: '4px 0 0' }}>
                        Make sure screen recording permissions are granted
                      </p>
                    </div>
                  </div>
                ) : (
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
                    gap: 12,
                  }}>
                    {filteredSources.map(source => (
                      <button
                        key={source.id}
                        onClick={() => handleSourceSelect(source)}
                        style={{
                          padding: 0,
                          background: selectedSource?.id === source.id ? 'rgba(88,101,242,0.15)' : '#2b2d31',
                          border: `2px solid ${selectedSource?.id === source.id ? '#5865f2' : 'transparent'}`,
                          borderRadius: 8,
                          cursor: 'pointer',
                          textAlign: 'left',
                          overflow: 'hidden',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (selectedSource?.id !== source.id) {
                            e.currentTarget.style.borderColor = '#4e5058';
                            e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedSource?.id !== source.id) {
                            e.currentTarget.style.borderColor = 'transparent';
                            e.currentTarget.style.background = '#2b2d31';
                          }
                        }}
                      >
                        {/* Thumbnail */}
                        <div style={{ 
                          position: 'relative',
                          paddingTop: '56.25%', /* 16:9 aspect ratio */
                          background: '#1e1f22',
                        }}>
                          <img 
                            src={source.thumbnail} 
                            alt={source.name}
                            style={{ 
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%', 
                              height: '100%',
                              objectFit: 'cover',
                            }}
                          />
                          {/* Selection indicator */}
                          {selectedSource?.id === source.id && (
                            <div style={{
                              position: 'absolute',
                              top: 8,
                              right: 8,
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              background: '#5865f2',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                              <span style={{ color: '#fff', fontSize: 14 }}>✓</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Label */}
                        <div style={{ padding: '8px 10px' }}>
                          <div style={{ 
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}>
                            <span style={{ fontSize: 14 }}>
                              {source.type === 'screen' ? '🖥️' : '🪟'}
                            </span>
                            <span style={{ 
                              color: '#dbdee1', 
                              fontSize: 13, 
                              fontWeight: 500,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {source.name}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Quality Step */
            <div style={{ padding: '16px 24px', overflowY: 'auto' }}>
              {/* Selected source summary */}
              {selectedSource && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 12, 
                  padding: '12px',
                  background: '#2b2d31',
                  borderRadius: 6,
                  marginBottom: 16,
                }}>
                  <img 
                    src={selectedSource.thumbnail} 
                    alt={selectedSource.name}
                    style={{ 
                      width: 80, 
                      height: 45,
                      objectFit: 'cover',
                      borderRadius: 4,
                    }}
                  />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{selectedSource.type === 'screen' ? '🖥️' : '🪟'}</span>
                      <span style={{ color: '#fff', fontWeight: 600 }}>{selectedSource.name}</span>
                    </div>
                    <span style={{ color: '#72767d', fontSize: 12 }}>
                      {selectedSource.type === 'screen' ? 'Entire screen' : 'Application window'}
                    </span>
                  </div>
                </div>
              )}

              {/* Quality options */}
              <p style={{
                color: '#b5bac1',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}>
                Stream Quality
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {QUALITY_OPTIONS.map(opt => {
                  const active = selectedQuality === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setSelectedQuality(opt.value)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 16px',
                        background: active ? 'rgba(88,101,242,0.15)' : '#2b2d31',
                        border: `2px solid ${active ? '#5865f2' : 'transparent'}`,
                        borderRadius: 6,
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {/* Radio dot */}
                      <div style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        border: `2px solid ${active ? '#5865f2' : '#72767d'}`,
                        background: active ? '#5865f2' : 'transparent',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        {active && (
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
                        )}
                      </div>

                      {/* Resolution badge */}
                      <div style={{
                        minWidth: 48,
                        textAlign: 'center',
                        background: active ? '#5865f2' : '#4e5058',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 700,
                        borderRadius: 4,
                        padding: '4px 8px',
                      }}>
                        {opt.label}
                      </div>

                      {/* FPS badge */}
                      <div style={{
                        minWidth: 50,
                        textAlign: 'center',
                        background: active ? 'rgba(88,101,242,0.3)' : '#383a40',
                        color: active ? '#c9cdfb' : '#949ba4',
                        fontSize: 12,
                        fontWeight: 600,
                        borderRadius: 4,
                        padding: '4px 8px',
                      }}>
                        {opt.fps} fps
                      </div>

                      {/* Resolution text + description */}
                      <div style={{ flex: 1 }}>
                        <span style={{ color: active ? '#fff' : '#b5bac1', fontSize: 14, fontWeight: 600 }}>
                          {opt.res}
                        </span>
                        <p style={{ color: '#72767d', fontSize: 12, margin: '2px 0 0' }}>{opt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid #3a3c40',
          background: '#2b2d31',
        }}>
          {step === 'source' ? (
            <>
              <div style={{ color: '#72767d', fontSize: 12 }}>
                {sources.length > 0 && (
                  <span>{sources.filter(s => s.type === 'screen').length} screens, {sources.filter(s => s.type === 'window').length} windows</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={onCancel}
                  style={{
                    padding: '10px 20px',
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
                  onClick={handleContinue}
                  disabled={!selectedSource}
                  style={{
                    padding: '10px 24px',
                    background: selectedSource ? '#5865f2' : '#4e5058',
                    border: 'none',
                    borderRadius: 4,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: selectedSource ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  Continue →
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={handleBack}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 4,
                  color: '#00a8fc',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ← Back
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={onCancel}
                  style={{
                    padding: '10px 20px',
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
                  onClick={handleStart}
                  style={{
                    padding: '10px 24px',
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
            </>
          )}
        </div>
      </div>

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ScreenShareStartModal;