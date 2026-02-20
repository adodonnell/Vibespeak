import React, { useState, useEffect, useRef } from 'react';
import { voiceClient } from '../services/voice-client';
import { apiClient } from '../services/api-client';

// Inline notification helpers (replaces deleted notification-service / push-notifications)
const notificationService = {
  playNotification() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    } catch { /* AudioContext not available */ }
  },
  // volume / enabled are local UI state only — no external service needed
  setEnabled(_: boolean) {},
  setVolume(_: number) {},
};

const pushNotificationService = {
  show({ title, body }: { title: string; body: string; tag?: string }) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(p => {
        if (p === 'granted') new Notification(title, { body });
      });
    }
  },
  setEnabled(_: boolean) {},
};

export interface AppSettings {
  theme: 'dark' | 'light';
  fontSize: 'small' | 'medium' | 'large';
  appearance: { theme: 'dark' | 'light'; fontSize: 'small' | 'medium' | 'large' };
  notifications: { enabled: boolean; sound: boolean; soundVolume: number; desktop: boolean; mentions: boolean };
  voice: {
    inputDevice: string;
    outputDevice: string;
    inputVolume: number;
    outputVolume: number;
    noiseSuppression: boolean;
    echoCancellation: boolean;
  };
  privacy: { showOnlineStatus: boolean; allowServerInvites: boolean };
}

interface AppSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  className?: string;
  username?: string;
  email?: string;
  onLogout?: () => void;
  onOpenMFA?: () => void;
  onOpenPasswordReset?: () => void;
  onOpenModeration?: () => void;
  onAvatarChange?: (dataUrl: string) => void;
}

const defaultSettings: AppSettings = {
  theme: 'dark',
  fontSize: 'medium',
  appearance: { theme: 'dark', fontSize: 'medium' },
  notifications: { enabled: true, sound: true, soundVolume: 0.5, desktop: true, mentions: true },
  voice: { inputDevice: 'default', outputDevice: 'default', inputVolume: 1, outputVolume: 1, noiseSuppression: true, echoCancellation: true },
  privacy: { showOnlineStatus: true, allowServerInvites: true },
};

// Noise suppression modes
type NsMode = 'off' | 'standard' | 'high' | 'ai';
const NS_LABELS: Record<NsMode, { label: string; desc: string }> = {
  off:      { label: 'None',       desc: 'No noise processing. Best for music or high-end interfaces.' },
  standard: { label: 'Standard',   desc: 'Browser-native WebRTC noise suppression. Light and fast.' },
  high:     { label: 'High',       desc: 'Aggressive suppression with noise gate + compressor chain.' },
  ai:       { label: 'AI-Powered', desc: 'Max processing: suppression + noise gate + compressor + limiter. Best for noisy environments.' },
};

const AVATAR_STORAGE_KEY = 'disorder:avatar';

function getNsMode(settings: ReturnType<typeof voiceClient.getAudioSettings>): NsMode {
  if (!settings.noiseSuppression) return 'off';
  if (settings.enableNoiseGate && settings.enableCompressor) {
    return settings.noiseSuppressionLevel === 'aggressive' ? 'ai' : 'high';
  }
  return 'standard';
}

function nsModeToPatch(mode: NsMode): Parameters<typeof voiceClient.setAudioSettings>[0] {
  switch (mode) {
    case 'off':      return { noiseSuppression: false, noiseSuppressionLevel: 'mild',       enableNoiseGate: false, enableCompressor: false };
    case 'standard': return { noiseSuppression: true,  noiseSuppressionLevel: 'mild',       enableNoiseGate: false, enableCompressor: false };
    case 'high':     return { noiseSuppression: true,  noiseSuppressionLevel: 'mild',       enableNoiseGate: true,  enableCompressor: true  };
    case 'ai':       return { noiseSuppression: true,  noiseSuppressionLevel: 'aggressive', enableNoiseGate: true,  enableCompressor: true  };
  }
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function resizeImageToDataUrl(file: File, size = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      // Draw circle clip
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
      // Cover-fit the image
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png', 0.9));
    };
    img.onerror = reject;
    img.src = url;
  });
}

const AppSettingsPanel: React.FC<AppSettingsPanelProps> = ({
  isOpen, onClose, settings, onSave,
  className = '', username = 'Unknown', email = '',
  onLogout, onOpenMFA, onOpenPasswordReset, onOpenModeration, onAvatarChange,
}) => {
  type Section = 'account' | 'appearance' | 'notifications' | 'voice' | 'privacy';
  const [activeSection, setActiveSection] = useState<Section>('account');
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings || defaultSettings);
  const [hasChanges, setHasChanges] = useState(false);

  // Audio device lists
  const [audioIn, setAudioIn] = useState<MediaDeviceInfo[]>([]);
  const [audioOut, setAudioOut] = useState<MediaDeviceInfo[]>([]);
  const [devicesLoaded, setDevicesLoaded] = useState(false);

  // Voice settings pulled directly from voiceClient
  const [vsIn, setVsIn] = useState(voiceClient.getAudioSettings().inputVolume);
  const [vsOut, setVsOut] = useState(voiceClient.getAudioSettings().outputVolume);
  const [vsNs, setVsNs] = useState<NsMode>(() => getNsMode(voiceClient.getAudioSettings()));
  const [vsEc, setVsEc] = useState(voiceClient.getAudioSettings().echoCancellation);
  const [vsAgc, setVsAgc] = useState(voiceClient.getAudioSettings().autoGainControl);
  const [vsMode, setVsMode] = useState<'voice-activity' | 'push-to-talk'>(voiceClient.getAudioSettings().transmissionMode);
  const [vsPttKey, setVsPttKey] = useState(voiceClient.getAudioSettings().pttKey);
  const [vsVad, setVsVad] = useState(voiceClient.getAudioSettings().vadSensitivity);
  const [vsQuality, setVsQuality] = useState(voiceClient.getAudioSettings().opusBitrate);
  const [vsInDev, setVsInDev] = useState(voiceClient.getAudioSettings().inputDeviceId);
  const [vsOutDev, setVsOutDev] = useState(voiceClient.getAudioSettings().outputDeviceId);
  const [isTesting, setIsTesting] = useState(false);
  const [capturingPtt, setCapturingPtt] = useState(false);
  const pttRef = useRef<HTMLButtonElement>(null);

  // Avatar
  const [avatarDataUrl, setAvatarDataUrl] = useState<string>(() => localStorage.getItem(AVATAR_STORAGE_KEY) || '');
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!isOpen || !devicesLoaded) {
      const fetchDevices = async () => {
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
          const devs = await navigator.mediaDevices.enumerateDevices();
          setAudioIn(devs.filter(d => d.kind === 'audioinput'));
          setAudioOut(devs.filter(d => d.kind === 'audiooutput'));
          setDevicesLoaded(true);
        } catch {
          setAudioIn([{ deviceId: 'default', label: 'Default Microphone', kind: 'audioinput', groupId: '', toJSON() { return {}; } }] as MediaDeviceInfo[]);
          setAudioOut([{ deviceId: 'default', label: 'Default Speakers',   kind: 'audiooutput', groupId: '', toJSON() { return {}; } }] as MediaDeviceInfo[]);
          setDevicesLoaded(true);
        }
      };
      if (isOpen) fetchDevices();
    }
  }, [isOpen]);

  // PTT key capture
  useEffect(() => {
    if (!capturingPtt) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      setVsPttKey(e.code);
      setHasChanges(true);
      setCapturingPtt(false);
    };
    window.addEventListener('keydown', handler, { once: true });
    return () => window.removeEventListener('keydown', handler);
  }, [capturingPtt]);

  const handleChange = (section: string, key: string, value: unknown) => {
    setLocalSettings(prev => {
      const next = { ...prev } as Record<string, unknown>;
      next[section] = { ...(next[section] as Record<string, unknown>), [key]: value };
      return next as unknown as AppSettings;
    });
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave(localSettings);
    setHasChanges(false);
    // Sync voice settings to voiceClient
    voiceClient.setAudioSettings({
      inputVolume: vsIn,
      outputVolume: vsOut,
      echoCancellation: vsEc,
      autoGainControl: vsAgc,
      transmissionMode: vsMode,
      pttKey: vsPttKey,
      vadSensitivity: vsVad,
      opusBitrate: vsQuality,
      inputDeviceId: vsInDev,
      outputDeviceId: vsOutDev,
      ...nsModeToPatch(vsNs),
    });
    notificationService.setEnabled(localSettings.notifications.sound);
    notificationService.setVolume(localSettings.notifications.soundVolume);
    pushNotificationService.setEnabled(localSettings.notifications.desktop);
  };

  // Avatar upload
  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setAvatarError('Image must be under 8 MB'); return; }
    setAvatarError('');
    setAvatarSaving(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 128);
      localStorage.setItem(AVATAR_STORAGE_KEY, dataUrl);
      setAvatarDataUrl(dataUrl);
      onAvatarChange?.(dataUrl);
      // Fire-and-forget to backend (best-effort)
      apiClient.updateProfile({ avatar_url: dataUrl }).catch(() => {});
    } catch {
      setAvatarError('Failed to process image');
    } finally {
      setAvatarSaving(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = () => {
    localStorage.removeItem(AVATAR_STORAGE_KEY);
    setAvatarDataUrl('');
    onAvatarChange?.('');
    apiClient.updateProfile({ avatar_url: '' }).catch(() => {});
  };

  const handleTestMic = async () => {
    if (isTesting) { voiceClient.stopMicrophoneTest(); setIsTesting(false); return; }
    try { await voiceClient.testMicrophone(); setIsTesting(true); }
    catch { /* ignore */ }
  };

  if (!isOpen) return null;

  // ─── Shared style atoms ───────────────────────────────────────────────────
  const S = {
    input: { width: '100%', padding: '9px 12px', background: '#1e1f22', border: '1px solid #3a3c40', borderRadius: '4px', color: '#dbdee1', fontSize: '14px' } as React.CSSProperties,
    label: { display: 'block', color: '#b5bac1', fontSize: '11px', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: '6px' } as React.CSSProperties,
    row: { display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '16px' } as React.CSSProperties,
    group: { marginBottom: '24px' } as React.CSSProperties,
    divider: { borderTop: '1px solid #3a3c40', margin: '24px 0' } as React.CSSProperties,
    h4: { color: '#f2f3f5', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '16px' } as React.CSSProperties,
    btnGhost: { padding: '6px 14px', background: '#4e5058', border: 'none', borderRadius: '4px', color: '#dbdee1', cursor: 'pointer', fontSize: '13px' } as React.CSSProperties,
    navBtn: (active: boolean): React.CSSProperties => ({
      display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', width: '100%',
      border: 'none', borderRadius: '4px', background: active ? '#404249' : 'transparent',
      color: active ? '#fff' : '#b5bac1', cursor: 'pointer', fontSize: '14px', textAlign: 'left', marginBottom: '2px',
    }),
    navCat: { padding: '16px 12px 4px', color: '#949ba4', fontSize: '11px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' } as React.CSSProperties,
    tag: (on: boolean): React.CSSProperties => ({
      display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
      background: on ? 'rgba(87,242,135,.15)' : 'rgba(255,255,255,.08)', color: on ? '#57f287' : '#949ba4',
    }),
  };

  const sections = [
    { id: 'account',       label: 'My Account',    icon: '👤' },
    { id: 'appearance',    label: 'Appearance',     icon: '🎨' },
    { id: 'notifications', label: 'Notifications',  icon: '🔔' },
    { id: 'voice',         label: 'Voice & Audio',  icon: '🎤' },
    { id: 'privacy',       label: 'Privacy & Safety', icon: '🔒' },
  ] as const;

  const qualityOptions = [
    { label: 'Low  (16 kbps)',     value: 16000  },
    { label: 'Medium (48 kbps)',   value: 48000  },
    { label: 'High  (64 kbps)',    value: 64000  },
    { label: 'Studio (128 kbps)', value: 128000 },
    { label: 'Ultra (256 kbps)',  value: 256000 },
  ];

  return (
    <div className={className}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}>
      <div
        style={{ position: 'relative', width: '820px', height: '620px', background: '#313338', borderRadius: '8px', display: 'flex', overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,.6)' }}
        onClick={e => e.stopPropagation()}>

        {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
        <div style={{ width: '232px', background: '#2b2d31', padding: '60px 8px 16px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <p style={S.navCat}>User Settings</p>
          {sections.map(s => (
            <button key={s.id} style={S.navBtn(activeSection === s.id)} onClick={() => setActiveSection(s.id)}>
              <span style={{ fontSize: '15px' }}>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>

        {/* ── Main content ────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'auto', padding: '40px 28px 80px' }}>

          {/* ═══ ACCOUNT ═══════════════════════════════════════════════════════ */}
          {activeSection === 'account' && (
            <div>
              <h3 style={{ color: '#f2f3f5', fontSize: '20px', fontWeight: 700, marginBottom: '28px' }}>My Account</h3>

              {/* Avatar picker */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '28px' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  {avatarDataUrl
                    ? <img src={avatarDataUrl} alt="avatar" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '3px solid #5865f2' }} />
                    : <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#5865f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, color: '#fff', border: '3px solid transparent' }}>{initials(username)}</div>
                  }
                  {avatarSaving && (
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff' }}>…</div>
                  )}
                </div>
                <div>
                  <p style={{ color: '#f2f3f5', fontWeight: 700, fontSize: '16px', marginBottom: '6px' }}>{username}</p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button style={{ ...S.btnGhost, background: '#5865f2', color: '#fff' }} onClick={() => avatarInputRef.current?.click()}>
                      Change Avatar
                    </button>
                    {avatarDataUrl && (
                      <button style={{ ...S.btnGhost, background: '#da373c', color: '#fff' }} onClick={handleRemoveAvatar}>Remove</button>
                    )}
                  </div>
                  {avatarError && <p style={{ color: '#da373c', fontSize: '12px', marginTop: '4px' }}>{avatarError}</p>}
                  <p style={{ color: '#949ba4', fontSize: '11px', marginTop: '4px' }}>Recommended: square image, at least 128×128 px. Max 8 MB.</p>
                  <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarFile} />
                </div>
              </div>

              <hr style={S.divider} />

              {/* Username / email (read-only for now) */}
              <div style={S.group}>
                <label style={S.label}>Username</label>
                <input type="text" value={username} readOnly style={S.input} />
              </div>
              <div style={S.group}>
                <label style={S.label}>Email</label>
                <input type="email" value={email || '—'} readOnly style={S.input} />
              </div>

              <hr style={S.divider} />
              <p style={S.h4}>🔒 Security</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                {[
                  { label: 'Two-Factor Authentication', cb: onOpenMFA },
                  { label: 'Change Password', cb: onOpenPasswordReset },
                ].map(item => (
                  <button key={item.label} onClick={item.cb} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#1e1f22', border: '1px solid #3a3c40', borderRadius: '6px', color: '#dbdee1', cursor: 'pointer', fontSize: '14px' }}>
                    {item.label}<span style={{ color: '#5865f2' }}>›</span>
                  </button>
                ))}
              </div>

              <p style={S.h4}>🛡️ Moderation</p>
              <button onClick={onOpenModeration} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#1e1f22', border: '1px solid #3a3c40', borderRadius: '6px', color: '#dbdee1', cursor: 'pointer', fontSize: '14px', width: '100%', marginBottom: '24px' }}>
                Moderation Panel<span style={{ color: '#5865f2' }}>›</span>
              </button>

              <button onClick={() => { onClose(); onLogout?.(); }} style={{ padding: '10px 18px', background: '#da373c', border: 'none', borderRadius: '4px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                Log Out
              </button>
            </div>
          )}

          {/* ═══ APPEARANCE ═════════════════════════════════════════════════════ */}
          {activeSection === 'appearance' && (
            <div>
              <h3 style={{ color: '#f2f3f5', fontSize: '20px', fontWeight: 700, marginBottom: '28px' }}>Appearance</h3>
              <div style={S.group}>
                <label style={S.label}>Theme</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {(['dark', 'light'] as const).map(t => (
                    <button key={t} onClick={() => { handleChange('appearance', 'theme', t); handleChange('', 'theme', t); }}
                      style={{ flex: 1, padding: '18px', background: localSettings.theme === t ? '#5865f2' : '#1e1f22', border: '2px solid', borderColor: localSettings.theme === t ? '#5865f2' : 'transparent', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px' }}>
                      {t === 'dark' ? '🌙 Dark' : '☀️ Light'}
                    </button>
                  ))}
                </div>
              </div>
              <div style={S.group}>
                <label style={S.label}>Font Size</label>
                <select value={localSettings.fontSize} onChange={e => handleChange('appearance', 'fontSize', e.target.value)} style={S.input}>
                  <option value="small">Small</option>
                  <option value="medium">Medium (Default)</option>
                  <option value="large">Large</option>
                </select>
              </div>
            </div>
          )}

          {/* ═══ NOTIFICATIONS ══════════════════════════════════════════════════ */}
          {activeSection === 'notifications' && (
            <div>
              <h3 style={{ color: '#f2f3f5', fontSize: '20px', fontWeight: 700, marginBottom: '28px' }}>Notifications</h3>
              {[
                { key: 'enabled', label: 'Enable Notifications' },
                { key: 'sound',   label: 'Notification Sound' },
                { key: 'desktop', label: 'Desktop Notifications' },
                { key: 'mentions',label: 'Notify on @Mentions' },
              ].map(item => (
                <label key={item.key} style={S.row}>
                  <input type="checkbox" checked={(localSettings.notifications as Record<string,unknown>)[item.key] as boolean}
                    onChange={e => handleChange('notifications', item.key, e.target.checked)} style={{ width: 18, height: 18, accentColor: '#5865f2' }} />
                  <span style={{ color: '#f2f3f5', fontSize: '14px' }}>{item.label}</span>
                </label>
              ))}
              {localSettings.notifications.sound && (
                <div style={{ marginLeft: 28, ...S.group }}>
                  <label style={S.label}>Sound Volume — {Math.round(localSettings.notifications.soundVolume * 100)}%</label>
                  <input type="range" min={0} max={1} step={0.05} value={localSettings.notifications.soundVolume}
                    onChange={e => handleChange('notifications', 'soundVolume', parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: '#5865f2' }} />
                  <button style={{ ...S.btnGhost, marginTop: 8 }} onClick={() => notificationService.playNotification()}>🔊 Test Sound</button>
                </div>
              )}
              {localSettings.notifications.desktop && (
                <div style={{ marginLeft: 28 }}>
                  <button style={S.btnGhost} onClick={() => pushNotificationService.show({ title: 'Test', body: 'VibeSpeak notification', tag: 'test' })}>🔔 Test Desktop</button>
                </div>
              )}
            </div>
          )}

          {/* ═══ VOICE & AUDIO ══════════════════════════════════════════════════ */}
          {activeSection === 'voice' && (
            <div>
              <h3 style={{ color: '#f2f3f5', fontSize: '20px', fontWeight: 700, marginBottom: '28px' }}>Voice &amp; Audio</h3>

              {/* ── Input ─────────────────────────────────────────────────────── */}
              <p style={S.h4}>🎙️ Input</p>
              <div style={S.group}>
                <label style={S.label}>Microphone</label>
                <select value={vsInDev} onChange={e => { setVsInDev(e.target.value); setHasChanges(true); }} style={S.input}>
                  <option value="">Default</option>
                  {audioIn.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 20)}</option>)}
                </select>
              </div>
              <div style={S.group}>
                <label style={S.label}>Input Volume — {vsIn}%</label>
                <input type="range" min={0} max={200} step={1} value={vsIn}
                  onChange={e => { setVsIn(+e.target.value); setHasChanges(true); }} style={{ width: '100%', accentColor: '#5865f2' }} />
              </div>
              <div style={S.group}>
                <button
                  style={{ ...S.btnGhost, background: isTesting ? '#da373c' : '#4e5058' }}
                  onClick={handleTestMic}>
                  {isTesting ? '⏹ Stop Mic Test' : '🎤 Test Microphone (hear yourself)'}
                </button>
              </div>

              <hr style={S.divider} />

              {/* ── Output ────────────────────────────────────────────────────── */}
              <p style={S.h4}>🔊 Output</p>
              <div style={S.group}>
                <label style={S.label}>Speaker / Headset</label>
                <select value={vsOutDev} onChange={e => { setVsOutDev(e.target.value); setHasChanges(true); }} style={S.input}>
                  <option value="">Default</option>
                  {audioOut.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 20)}</option>)}
                </select>
              </div>
              <div style={S.group}>
                <label style={S.label}>Output Volume — {vsOut}%</label>
                <input type="range" min={0} max={200} step={1} value={vsOut}
                  onChange={e => { setVsOut(+e.target.value); setHasChanges(true); }} style={{ width: '100%', accentColor: '#5865f2' }} />
              </div>

              <hr style={S.divider} />

              {/* ── Noise Suppression ─────────────────────────────────────────── */}
              <p style={S.h4}>🧹 Noise Suppression</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '24px' }}>
                {(Object.keys(NS_LABELS) as NsMode[]).map(mode => {
                  const active = vsNs === mode;
                  return (
                    <button key={mode} onClick={() => { setVsNs(mode); setHasChanges(true); }} style={{
                      padding: '12px 14px', textAlign: 'left', background: active ? 'rgba(88,101,242,.2)' : '#1e1f22',
                      border: `2px solid ${active ? '#5865f2' : '#3a3c40'}`, borderRadius: '8px', cursor: 'pointer',
                    }}>
                      <div style={{ color: active ? '#fff' : '#b5bac1', fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>
                        {active && <span style={{ color: '#5865f2', marginRight: 4 }}>✓</span>}
                        {NS_LABELS[mode].label}
                        {mode === 'ai' && <span style={{ marginLeft: 6, fontSize: '10px', background: '#5865f2', color: '#fff', borderRadius: 4, padding: '1px 5px' }}>NEW</span>}
                      </div>
                      <div style={{ color: '#949ba4', fontSize: '11px', lineHeight: 1.4 }}>{NS_LABELS[mode].desc}</div>
                    </button>
                  );
                })}
              </div>

              {/* ── Echo Cancellation & AGC ───────────────────────────────────── */}
              <p style={S.h4}>⚙️ Processing</p>
              <label style={S.row}>
                <input type="checkbox" checked={vsEc} onChange={e => { setVsEc(e.target.checked); setHasChanges(true); }} style={{ width: 18, height: 18, accentColor: '#5865f2' }} />
                <div>
                  <span style={{ color: '#f2f3f5', fontSize: '14px' }}>Echo Cancellation</span>
                  <p style={{ color: '#949ba4', fontSize: '12px', margin: 0 }}>Removes your own audio from what others hear. Disable only if using a hardware interface.</p>
                </div>
              </label>
              <label style={S.row}>
                <input type="checkbox" checked={vsAgc} onChange={e => { setVsAgc(e.target.checked); setHasChanges(true); }} style={{ width: 18, height: 18, accentColor: '#5865f2' }} />
                <div>
                  <span style={{ color: '#f2f3f5', fontSize: '14px' }}>Automatic Gain Control</span>
                  <p style={{ color: '#949ba4', fontSize: '12px', margin: 0 }}>Normalises your mic volume. Disable for music or when using your interface's own gain.</p>
                </div>
              </label>

              <hr style={S.divider} />

              {/* ── Voice Transmission ────────────────────────────────────────── */}
              <p style={S.h4}>🎚️ Voice Transmission</p>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {(['voice-activity', 'push-to-talk'] as const).map(m => (
                  <button key={m} onClick={() => { setVsMode(m); setHasChanges(true); }} style={{
                    flex: 1, padding: '10px', background: vsMode === m ? 'rgba(88,101,242,.2)' : '#1e1f22',
                    border: `2px solid ${vsMode === m ? '#5865f2' : '#3a3c40'}`, borderRadius: '6px',
                    color: vsMode === m ? '#fff' : '#b5bac1', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                  }}>
                    {m === 'voice-activity' ? '🔊 Voice Activity' : '🔘 Push to Talk'}
                  </button>
                ))}
              </div>

              {vsMode === 'voice-activity' && (
                <div style={S.group}>
                  <label style={S.label}>Input Sensitivity — {vsVad}%</label>
                  <input type="range" min={0} max={100} step={1} value={vsVad}
                    onChange={e => { setVsVad(+e.target.value); setHasChanges(true); }} style={{ width: '100%', accentColor: '#5865f2' }} />
                  <p style={{ color: '#949ba4', fontSize: '12px', marginTop: 4 }}>Higher = only loud sounds trigger transmission. Lower = very sensitive.</p>
                </div>
              )}

              {vsMode === 'push-to-talk' && (
                <div style={S.group}>
                  <label style={S.label}>Push-to-Talk Key</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ padding: '8px 14px', background: '#1e1f22', border: '1px solid #3a3c40', borderRadius: '4px', color: '#f2f3f5', fontSize: '14px', minWidth: 80, textAlign: 'center' }}>
                      {vsPttKey.replace('Key', '').replace('Digit', '')}
                    </div>
                    <button ref={pttRef}
                      style={{ ...S.btnGhost, background: capturingPtt ? '#5865f2' : '#4e5058', color: '#fff' }}
                      onClick={() => setCapturingPtt(true)}>
                      {capturingPtt ? '⌨️ Press a key…' : 'Change Key'}
                    </button>
                  </div>
                </div>
              )}

              <hr style={S.divider} />

              {/* ── Audio Quality ─────────────────────────────────────────────── */}
              <p style={S.h4}>📻 Audio Quality</p>
              <div style={S.group}>
                <label style={S.label}>Bitrate</label>
                <select value={vsQuality} onChange={e => { setVsQuality(+e.target.value); setHasChanges(true); }} style={S.input}>
                  {qualityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <p style={{ color: '#949ba4', fontSize: '12px', marginTop: 4 }}>Higher bitrate = better sound quality but more bandwidth.</p>
              </div>
            </div>
          )}

          {/* ═══ PRIVACY ════════════════════════════════════════════════════════ */}
          {activeSection === 'privacy' && (
            <div>
              <h3 style={{ color: '#f2f3f5', fontSize: '20px', fontWeight: 700, marginBottom: '28px' }}>Privacy &amp; Safety</h3>
              {[
                { key: 'showOnlineStatus',   label: 'Show Online Status',  desc: 'Other users can see when you are online.' },
                { key: 'allowServerInvites', label: 'Allow Server Invites', desc: 'Let other users invite you to servers.' },
              ].map(item => (
                <label key={item.key} style={{ display: 'flex', gap: 14, cursor: 'pointer', marginBottom: 20, alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={(localSettings.privacy as Record<string,unknown>)[item.key] as boolean}
                    onChange={e => handleChange('privacy', item.key, e.target.checked)}
                    style={{ width: 18, height: 18, marginTop: 2, accentColor: '#5865f2' }} />
                  <div>
                    <span style={{ color: '#f2f3f5', fontSize: '14px', display: 'block' }}>{item.label}</span>
                    <span style={{ color: '#949ba4', fontSize: '12px' }}>{item.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          )}

        </div>

        {/* ── Footer ──────────────────────────────────────────────────────────── */}
        <div style={{ position: 'absolute', bottom: 0, left: 232, right: 0, padding: '14px 28px', background: '#2b2d31', borderTop: '1px solid #1e1f22', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={() => { setLocalSettings(defaultSettings); setHasChanges(true); }} style={{ ...S.btnGhost, background: 'transparent', color: '#b5bac1' }}>Reset to Default</button>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={onClose} style={S.btnGhost}>Cancel</button>
            <button onClick={handleSave} disabled={!hasChanges} style={{
              padding: '8px 20px', background: hasChanges ? '#5865f2' : '#4e5058', border: 'none', borderRadius: '4px',
              color: '#fff', cursor: hasChanges ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: 600, opacity: hasChanges ? 1 : 0.6,
            }}>Save Changes</button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AppSettingsPanel;
