import React, { useState, useEffect, useRef, useCallback } from 'react';
import { voiceClient, audioQualityPresets } from '../../services/voice-client';
import ScreenShareStartModal, { ScreenShareQuality } from './ScreenShareStartModal';
import './VoiceControlPanel.css';

interface VoiceControlPanelProps {
  channelName: string;
  onLeave: () => void;
}

const NUM_BARS = 20;

const VoiceControlPanel: React.FC<VoiceControlPanelProps> = ({ channelName, onLeave }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Settings state — loaded from voice client
  const settings = voiceClient.getAudioSettings();
  const [inputVolume, setInputVolume] = useState(settings.inputVolume);
  const [outputVolume, setOutputVolume] = useState(settings.outputVolume);
  const [noiseSuppression, setNoiseSuppression] = useState(settings.noiseSuppression);
  const [echoCancellation, setEchoCancellation] = useState(settings.echoCancellation);
  const [autoGainControl, setAutoGainControl] = useState(settings.autoGainControl);
  const [enableNoiseGate, setEnableNoiseGate] = useState(settings.enableNoiseGate);
  const [enableCompressor, setEnableCompressor] = useState(settings.enableCompressor);
  const [transmissionMode, setTransmissionMode] = useState<'voice-activity' | 'push-to-talk'>(settings.transmissionMode);
  const [vadSensitivity, setVadSensitivity] = useState(settings.vadSensitivity);
  const [pttKey, setPttKey] = useState(settings.pttKey.toUpperCase());
  const [capturingPtt, setCapturingPtt] = useState(false);
  const [qualityPreset, setQualityPreset] = useState('Medium Quality (Default)');
  const [screenShareQuality, setScreenShareQuality] = useState<ScreenShareQuality>('1080p60');

  // Device lists
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState(settings.inputDeviceId);
  const [selectedOutput, setSelectedOutput] = useState(settings.outputDeviceId);

  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number>(0);

  // Load devices
  useEffect(() => {
    const load = async () => {
      try {
        const inp = await voiceClient.getAudioDevices();
        const out = await voiceClient.getAudioOutputDevices();
        setInputDevices(inp);
        setOutputDevices(out);
      } catch (_) {}
    };
    load();
    const handler = () => load();
    navigator.mediaDevices.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
  }, []);

  // Animated VU meter
  useEffect(() => {
    const update = () => {
      const level = voiceClient.getAudioLevel();
      const speaking = voiceClient.isVoiceActivityDetected();
      setAudioLevel(level);
      setIsSpeaking(speaking && !isMuted);

      // Update bars directly via refs for performance (no re-render)
      for (let i = 0; i < NUM_BARS; i++) {
        const bar = barsRef.current[i];
        if (!bar) continue;
        const threshold = (i / NUM_BARS) * 100;
        const active = level >= threshold;
        bar.style.opacity = active ? '1' : '0.15';
        if (active) {
          if (i < NUM_BARS * 0.6) bar.style.background = '#57F287';
          else if (i < NUM_BARS * 0.85) bar.style.background = '#FEE75C';
          else bar.style.background = '#ED4245';
        }
      }

      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isMuted]);

  // PTT key listener
  useEffect(() => {
    if (transmissionMode !== 'push-to-talk') return;
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === pttKey.toLowerCase()) voiceClient.setPttPressed(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === pttKey.toLowerCase()) voiceClient.setPttPressed(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [transmissionMode, pttKey]);

  // PTT key capture
  const handlePttCapture = useCallback((e: React.KeyboardEvent) => {
    e.preventDefault();
    const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
    setPttKey(key);
    voiceClient.setPttKey(key.toLowerCase());
    voiceClient.setAudioSettings({ pttKey: key.toLowerCase() });
    setCapturingPtt(false);
  }, []);

  const applySettings = useCallback(() => {
    voiceClient.setAudioSettings({
      inputVolume,
      outputVolume,
      noiseSuppression,
      echoCancellation,
      autoGainControl,
      enableNoiseGate,
      enableCompressor,
      transmissionMode,
      vadSensitivity,
      inputDeviceId: selectedInput,
      outputDeviceId: selectedOutput,
    });
    // Apply quality preset
    const preset = audioQualityPresets.find(p => p.name === qualityPreset);
    if (preset) voiceClient.setAudioSettings(preset.settings);
    // Save to localStorage
    try {
      localStorage.setItem('disorder_voice_settings', JSON.stringify(voiceClient.getAudioSettings()));
    } catch (_) {}
  }, [inputVolume, outputVolume, noiseSuppression, echoCancellation, autoGainControl,
      enableNoiseGate, enableCompressor, transmissionMode, vadSensitivity, selectedInput, selectedOutput, qualityPreset]);

  const handleToggleMute = () => {
    const muted = voiceClient.toggleMute();
    setIsMuted(muted);
  };

  const handleToggleDeafen = () => {
    const muted = voiceClient.toggleMute();
    setIsMuted(muted);
    setIsDeafened(muted);
  };

  // Opens the quality picker modal; actual start happens via modal's onStart
  const handleScreenShareClick = () => {
    if (isScreenSharing) {
      voiceClient.stopScreenShare();
      setIsScreenSharing(false);
    } else {
      setShowShareModal(true);
    }
  };

  const handleScreenShareStart = async (quality: ScreenShareQuality) => {
    setShowShareModal(false);
    setScreenShareQuality(quality);
    // voice-client only knows 1080p/720p presets; map 480p to 720p30 (lower bitrate is set via constraints)
    const vcQuality = quality === '480p30' ? '720p30' : quality as '1080p60' | '1080p30' | '720p60' | '720p30';
    try {
      await voiceClient.startScreenShare(vcQuality);
      setIsScreenSharing(true);
    } catch (_) {
      // User cancelled the browser source picker or permission denied
    }
  };

  const transmitting = voiceClient.isTransmitting();

  return (
    <div className="voice-control-panel">
      {/* Channel info bar */}
      <div className="vcp-channel-bar">
        <div className={`vcp-signal-dot ${transmitting ? 'active' : ''}`} />
        <div className="vcp-channel-info">
          <span className="vcp-channel-label">🔊 {channelName}</span>
          <span className="vcp-channel-status">
            {isMuted ? 'Muted' : isDeafened ? 'Deafened' : isScreenSharing ? 'Sharing Screen' : transmitting ? 'Transmitting' : 'Connected'}
          </span>
        </div>
      </div>

      {/* VU Meter */}
      <div className="vcp-vu-meter" title={`Audio Level: ${audioLevel}%`}>
        {Array.from({ length: NUM_BARS }, (_, i) => (
          <div
            key={i}
            className="vcp-vu-bar"
            ref={el => { barsRef.current[i] = el; }}
          />
        ))}
      </div>
      <div className="vcp-vu-labels">
        <span>0</span>
        <span style={{ opacity: 0.5, fontSize: 9 }}>Input Level</span>
        <span>MAX</span>
      </div>

      {/* PTT indicator */}
      {transmissionMode === 'push-to-talk' && (
        <div className={`vcp-ptt-badge ${voiceClient.getAudioSettings().isPttActive ? 'active' : ''}`}>
          {voiceClient.getAudioSettings().isPttActive ? '🎤 Transmitting' : `Hold [${pttKey}] to talk`}
        </div>
      )}

      {/* Main controls */}
      <div className="vcp-controls">
        <button
          className={`vcp-btn ${isMuted ? 'danger' : ''} ${isSpeaking && !isMuted ? 'speaking' : ''}`}
          onClick={handleToggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          <span className="vcp-btn-icon">{isMuted ? '🔇' : '🎤'}</span>
          <span className="vcp-btn-label">{isMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        <button
          className={`vcp-btn ${isDeafened ? 'danger' : ''}`}
          onClick={handleToggleDeafen}
          title={isDeafened ? 'Undeafen' : 'Deafen'}
        >
          <span className="vcp-btn-icon">{isDeafened ? '�' : '🎧'}</span>
          <span className="vcp-btn-label">{isDeafened ? 'Undeafen' : 'Deafen'}</span>
        </button>

        <button
          className={`vcp-btn ${isScreenSharing ? 'active' : ''}`}
          onClick={handleScreenShareClick}
          title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
        >
          <span className="vcp-btn-icon">{isScreenSharing ? '🛑' : '🖥️'}</span>
          <span className="vcp-btn-label">{isScreenSharing ? 'Stop' : 'Share'}</span>
        </button>

        <button
          className={`vcp-btn ${showSettings ? 'active' : ''}`}
          onClick={() => setShowSettings(s => !s)}
          title="Voice Settings"
        >
          <span className="vcp-btn-icon">⚙️</span>
          <span className="vcp-btn-label">Settings</span>
        </button>

        <button className="vcp-btn vcp-leave" onClick={onLeave} title="Leave Channel">
          <span className="vcp-btn-icon">📴</span>
          <span className="vcp-btn-label">Leave</span>
        </button>
      </div>

      {/* ── Pre-share quality modal ── */}
      <ScreenShareStartModal
        isOpen={showShareModal}
        channelName={channelName}
        defaultQuality={screenShareQuality}
        onStart={handleScreenShareStart}
        onCancel={() => setShowShareModal(false)}
      />

      {/* ── Settings panel ── */}
      {showSettings && (
        <div className="vcp-settings">
          <div className="vcp-settings-title">Voice Settings</div>

          {/* ── Devices ── */}
          <div className="vcp-section-label">Input Device (Microphone)</div>
          <select className="vcp-select" value={selectedInput} onChange={e => setSelectedInput(e.target.value)}>
            <option value="">Default</option>
            {inputDevices.map(d => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0, 6)}`}</option>
            ))}
          </select>

          <div className="vcp-section-label">Output Device (Speakers)</div>
          <select className="vcp-select" value={selectedOutput} onChange={e => setSelectedOutput(e.target.value)}>
            <option value="">Default</option>
            {outputDevices.map(d => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${d.deviceId.slice(0, 6)}`}</option>
            ))}
          </select>

          {/* ── Volume ── */}
          <div className="vcp-row-label">
            <span>Input Volume</span><span className="vcp-val">{inputVolume}%</span>
          </div>
          <input type="range" min={0} max={200} value={inputVolume}
            className="vcp-slider"
            onChange={e => { setInputVolume(+e.target.value); voiceClient.setInputVolume(+e.target.value); }} />

          <div className="vcp-row-label">
            <span>Output Volume</span><span className="vcp-val">{outputVolume}%</span>
          </div>
          <input type="range" min={0} max={200} value={outputVolume}
            className="vcp-slider"
            onChange={e => { setOutputVolume(+e.target.value); voiceClient.setOutputVolume(+e.target.value); }} />

          {/* ── Voice Mode ── */}
          <div className="vcp-section-label">Voice Mode</div>
          <div className="vcp-toggle-group">
            <button
              className={`vcp-toggle-btn ${transmissionMode === 'voice-activity' ? 'active' : ''}`}
              onClick={() => { setTransmissionMode('voice-activity'); voiceClient.setTransmissionMode('voice-activity'); }}
            >🎤 Voice Activity</button>
            <button
              className={`vcp-toggle-btn ${transmissionMode === 'push-to-talk' ? 'active' : ''}`}
              onClick={() => { setTransmissionMode('push-to-talk'); voiceClient.setTransmissionMode('push-to-talk'); }}
            >🔒 Push to Talk</button>
          </div>

          {transmissionMode === 'voice-activity' && (
            <>
              <div className="vcp-row-label">
                <span>VAD Sensitivity</span><span className="vcp-val">{vadSensitivity}%</span>
              </div>
              <input type="range" min={0} max={100} value={vadSensitivity}
                className="vcp-slider"
                onChange={e => { setVadSensitivity(+e.target.value); voiceClient.setVadSensitivity(+e.target.value); }} />
            </>
          )}

          {transmissionMode === 'push-to-talk' && (
            <div className="vcp-ptt-bind">
              <span>PTT Key:</span>
              {capturingPtt ? (
                <input
                  autoFocus
                  className="vcp-ptt-input"
                  placeholder="Press a key…"
                  onKeyDown={handlePttCapture}
                  onBlur={() => setCapturingPtt(false)}
                  readOnly
                />
              ) : (
                <button className="vcp-ptt-key-btn" onClick={() => setCapturingPtt(true)}>
                  [{pttKey}] — click to change
                </button>
              )}
            </div>
          )}

          {/* ── Audio Processing ── */}
          <div className="vcp-section-label">Audio Processing</div>

          <div className="vcp-checkbox-row">
            <input type="checkbox" id="ns" checked={noiseSuppression}
              onChange={e => { setNoiseSuppression(e.target.checked); voiceClient.setAudioSettings({ noiseSuppression: e.target.checked }); }} />
            <label htmlFor="ns">Noise Suppression</label>
          </div>
          <div className="vcp-checkbox-row">
            <input type="checkbox" id="ec" checked={echoCancellation}
              onChange={e => { setEchoCancellation(e.target.checked); voiceClient.setAudioSettings({ echoCancellation: e.target.checked }); }} />
            <label htmlFor="ec">Echo Cancellation</label>
          </div>
          <div className="vcp-checkbox-row">
            <input type="checkbox" id="agc" checked={autoGainControl}
              onChange={e => { setAutoGainControl(e.target.checked); voiceClient.setAudioSettings({ autoGainControl: e.target.checked }); }} />
            <label htmlFor="agc">Auto Gain Control</label>
          </div>
          <div className="vcp-checkbox-row">
            <input type="checkbox" id="ng" checked={enableNoiseGate}
              onChange={e => { setEnableNoiseGate(e.target.checked); voiceClient.setAudioSettings({ enableNoiseGate: e.target.checked }); }} />
            <label htmlFor="ng">Noise Gate</label>
          </div>
          <div className="vcp-checkbox-row">
            <input type="checkbox" id="comp" checked={enableCompressor}
              onChange={e => { setEnableCompressor(e.target.checked); voiceClient.setAudioSettings({ enableCompressor: e.target.checked }); }} />
            <label htmlFor="comp">Compressor (even out volume)</label>
          </div>

          {/* ── Quality Preset ── */}
          <div className="vcp-section-label">Audio Quality Preset</div>
          <select className="vcp-select" value={qualityPreset} onChange={e => setQualityPreset(e.target.value)}>
            {audioQualityPresets.map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>

          {/* ── Screen Share Quality (default for next share) ── */}
          <div className="vcp-section-label">Default Screen Share Quality</div>
          <select className="vcp-select" value={screenShareQuality}
            onChange={e => setScreenShareQuality(e.target.value as ScreenShareQuality)}>
            <option value="1080p60">1080p 60 fps</option>
            <option value="1080p30">1080p 30 fps</option>
            <option value="720p60">720p 60 fps</option>
            <option value="720p30">720p 30 fps</option>
            <option value="480p30">480p 30 fps</option>
          </select>
          <p style={{ color: '#72767d', fontSize: 11, margin: '4px 0 0' }}>
            You can also choose quality each time you click "Share".
          </p>

          {/* Save button */}
          <button className="vcp-save-btn" onClick={applySettings}>
            ✓ Save & Apply Settings
          </button>
        </div>
      )}
    </div>
  );
};

export default VoiceControlPanel;
