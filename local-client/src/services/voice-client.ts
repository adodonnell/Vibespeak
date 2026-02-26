// WebRTC Voice Client Service
// Handles peer-to-peer voice connections

type VoiceEventHandler = (userId: string) => void;

export interface VoiceUser {
  id: string;
  stream?: MediaStream;
}

// Audio codec types
export type AudioCodec = 'opus' | 'pcmu' | 'pcma';

// Enhanced audio settings interface with quality controls
export interface AudioSettings {
  // Input settings
  inputDeviceId: string;
  inputVolume: number; // 0-200
  noiseSuppression: boolean;
  noiseSuppressionLevel: 'mild' | 'aggressive';
  echoCancellation: boolean;
  echoCancellationStrength: number; // 0-100
  autoGainControl: boolean;
  
  // Output settings
  outputDeviceId: string;
  outputVolume: number; // 0-200
  
  // Voice transmission mode
  transmissionMode: 'voice-activity' | 'push-to-talk';
  pttKey: string; // Keyboard key for PTT
  vadSensitivity: number; // 0-100, threshold for voice detection
  
  // Audio quality settings (Enhanced for better sound)
  codec: AudioCodec;
  opusBitrate: number; // 6000 - 510000 (higher = better quality)
  sampleRate: 16000 | 48000;
  opusFrameSize: 20 | 40 | 60; // ms per frame
  enableStereo: boolean;
  enableDtx: boolean; // Discontinuous transmission
  enableFec: boolean; // Forward Error Correction for packet loss
  
  // Audio processing (new)
  enableNoiseGate: boolean;
  noiseGateThreshold: number; // -60 to 0 dB
  enableCompressor: boolean;
  compressorThreshold: number; // -60 to 0 dB
  compressorRatio: number; // 1-20
  
  // PTT state
  isPttActive: boolean;
}

export const defaultAudioSettings: AudioSettings = {
  inputDeviceId: '',
  inputVolume: 100,
  noiseSuppression: true,
  noiseSuppressionLevel: 'mild',
  echoCancellation: true,
  echoCancellationStrength: 50,
  autoGainControl: true,
  outputDeviceId: '',
  outputVolume: 100,
  transmissionMode: 'voice-activity',
  pttKey: 'v',
  vadSensitivity: 50,
  codec: 'opus',
  opusBitrate: 64000, // Increased from 48000 for better quality
  sampleRate: 48000,
  opusFrameSize: 20, // Lower = less latency
  enableStereo: false,
  enableDtx: true, // Save bandwidth when not speaking
  enableFec: true, // Forward Error Correction for packet loss recovery
  
  // Audio processing defaults
  enableNoiseGate: true,
  noiseGateThreshold: -40,
  enableCompressor: true,
  compressorThreshold: -20,
  compressorRatio: 4,
  
  isPttActive: false,
};

// Audio quality presets (Enhanced)
export interface AudioQualityPreset {
  name: string;
  settings: Partial<AudioSettings>;
}

export const audioQualityPresets: AudioQualityPreset[] = [
  { name: 'Low Quality (Low Bandwidth)', settings: { opusBitrate: 16000, sampleRate: 16000, noiseSuppressionLevel: 'aggressive', opusFrameSize: 60, enableDtx: true, enableStereo: false } },
  { name: 'Medium Quality (Default)', settings: { opusBitrate: 48000, sampleRate: 48000, noiseSuppressionLevel: 'mild', opusFrameSize: 20, enableDtx: true, enableStereo: false } },
  { name: 'High Quality', settings: { opusBitrate: 128000, sampleRate: 48000, noiseSuppressionLevel: 'mild', opusFrameSize: 20, enableDtx: false, enableStereo: false } },
  { name: 'Ultra Quality (Stereo)', settings: { opusBitrate: 256000, sampleRate: 48000, noiseSuppressionLevel: 'mild', opusFrameSize: 20, enableDtx: false, enableStereo: true } },
  { name: 'Music Mode (High Fidelity)', settings: { opusBitrate: 256000, sampleRate: 48000, noiseSuppression: false, autoGainControl: false, enableDtx: false, enableStereo: true, enableNoiseGate: false, enableCompressor: false } },
  { name: 'Voice Optimized', settings: { opusBitrate: 64000, sampleRate: 48000, noiseSuppressionLevel: 'aggressive', opusFrameSize: 20, enableDtx: true, enableStereo: false, enableNoiseGate: true, enableCompressor: true } },
];

// Audio presets
export interface AudioPreset {
  name: string;
  settings: Partial<AudioSettings>;
}

export const audioPresets: AudioPreset[] = [
  { name: 'Default', settings: { inputVolume: 100, outputVolume: 100, vadSensitivity: 50, noiseSuppression: true, echoCancellation: true, autoGainControl: true } },
  { name: 'High Quality', settings: { inputVolume: 120, outputVolume: 110, vadSensitivity: 40, noiseSuppression: true, echoCancellation: true, autoGainControl: false } },
  { name: 'No Processing', settings: { inputVolume: 100, outputVolume: 100, vadSensitivity: 50, noiseSuppression: false, echoCancellation: false, autoGainControl: false } },
  { name: 'Quiet Environment', settings: { inputVolume: 150, outputVolume: 100, vadSensitivity: 70, noiseSuppression: true, echoCancellation: true, autoGainControl: true } },
  { name: 'Gaming', settings: { inputVolume: 110, outputVolume: 120, vadSensitivity: 30, noiseSuppression: true, echoCancellation: false, autoGainControl: true } },
];

// Voice statistics - enhanced with more detail
export interface VoiceStatistics {
  bytesReceived: number;
  bytesSent: number;
  packetsReceived: number;
  packetsLost: number;
  packetsLostOutbound: number;
  jitter: number;
  roundTripTime: number;
  connectionState: RTCPeerConnectionState | null;
  // Extended stats
  connectedSince: number | null;
  idleTime: number;
  lastSpeakingTime: number;
  codec: string;
  bitrate: number;
  availableOutgoingBitrate: number;
}

// Screen share source types (Electron desktopCapturer)
export interface ScreenShareSource {
  id: string;
  name: string;
  thumbnail: string;
  displayId: string;
}

export class VoiceClient {
  private ws: WebSocket | null = null;
  private peers: Map<string, RTCPeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private roomId: string = '';
  private username: string = ''; // Store username for voice channel
  
  private onUserJoinedHandlers: VoiceEventHandler[] = [];
  private onUserLeftHandlers: VoiceEventHandler[] = [];
  private onErrorHandlers: ((error: string) => void)[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private onAudioLevelHandlers: ((level: number) => void)[] = [];
  
  // Audio settings
  private audioSettings: AudioSettings = { ...defaultAudioSettings };
  private inputGainNode: GainNode | null = null;
  private outputGainNode: GainNode | null = null;
  private currentAudioTrack: MediaStreamTrack | null = null;
  
  // PTT state
  private isPttPressed: boolean = false;
  
  // Voice activity detection
  private vadThreshold: number = 10;
  private minSpeakingDuration: number = 150; // ms
  private lastSpeechTime: number = 0;
  private isVoiceActive: boolean = false;
  
  // Manual mute state (different from PTT)
  private isManuallyMuted: boolean = false;
  
  // Store audio elements for output volume control
  private remoteAudioElements: Map<string, HTMLAudioElement> = new Map();

  // Screen share state
  private screenStream: MediaStream | null = null;
  private isScreenSharing: boolean = false;
  private onScreenShareStartHandlers: ((stream: MediaStream) => void)[] = [];
  private onScreenShareStopHandlers: (() => void)[] = [];
  private onIncomingScreenShareHandlers: ((userId: string, stream: MediaStream) => void)[] = [];
  
  // Bandwidth management
  private bandwidthMonitorInterval: ReturnType<typeof setInterval> | null = null;
  private currentBandwidth: number = 0; // bytes per second
  private availableOutgoingBitrate: number = 0;
  private screenShareQuality: '1080p60' | '1080p30' | '720p60' | '720p30' | '480p30' = '1080p60';
  private bandwidthHistory: number[] = [];
  private readonly BANDWIDTH_HISTORY_SIZE = 10;
  private readonly LOW_BANDWIDTH_THRESHOLD = 1500000; // 1.5 Mbps
  private readonly VERY_LOW_BANDWIDTH_THRESHOLD = 800000; // 800 Kbps
  
  // Screen share senders for renegotiation
  private screenShareSenders: Map<string, RTCRtpSender> = new Map();
  // Guard flag to prevent concurrent screen share stop operations
  private isStoppingScreenShare: boolean = false;

  // Auto-reconnect state
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;
  private isReconnecting: boolean = false;
  private wasInVoiceChannel: boolean = false;

  // Join-lock: prevents concurrent or duplicate join calls
  private isJoining: boolean = false;

  // ICE servers — fetched dynamically from server API
  private iceServers: RTCIceServer[] = [];
  private iceServersFetched: boolean = false;
  private iceServersExpiry: number = 0; // Timestamp when ICE servers need refresh

  private static readonly SETTINGS_KEY = 'disorder:voice-settings';
  private static readonly ICE_CACHE_KEY = 'disorder:ice-servers';
  private static readonly ICE_TTL_MS = 23 * 60 * 60 * 1000; // 23 hours (server gives 24h ttl)

  constructor() {
    // Initialize with STUN servers immediately (always works)
    this.iceServers = this.getDefaultStunServers();
    
    // Try to load cached ICE servers from localStorage
    this.loadCachedIceServers();
    
    // Fetch fresh ICE servers from server (includes TURN if configured)
    this.fetchIceServers();
    
    // User ID is managed by the server via WebSocket
    this.loadSettings();
  }

  private getDefaultStunServers(): RTCIceServer[] {
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ];
  }

  /**
   * Load cached ICE servers from localStorage (survives page refresh)
   */
  private loadCachedIceServers(): void {
    try {
      const raw = localStorage.getItem(VoiceClient.ICE_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { servers: RTCIceServer[]; expiry: number };
        if (cached.expiry > Date.now()) {
          this.iceServers = cached.servers;
          this.iceServersExpiry = cached.expiry;
          this.iceServersFetched = true;
          console.log('[Voice] Loaded cached ICE servers from localStorage');
        }
      }
    } catch (_) {
      // Corrupted cache, ignore
    }
  }

  /**
   * Fetch ICE servers from the server API.
   * This includes TURN servers with time-limited credentials.
   */
  async fetchIceServers(): Promise<RTCIceServer[]> {
    // Check if we have fresh ICE servers
    if (this.iceServersFetched && Date.now() < this.iceServersExpiry) {
      return this.iceServers;
    }

    try {
      // Get API base URL
      let apiUrl: string;
      try {
        apiUrl =
          localStorage.getItem('disorder:api-url') ||
          (import.meta.env.VITE_API_URL as string | undefined) ||
          'http://localhost:3001';
      } catch {
        apiUrl = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3001';
      }

      // Get auth token
      let token: string | null = null;
      try {
        token = localStorage.getItem('disorder:token');
      } catch {
        // Ignore
      }

      const response = await fetch(`${apiUrl}/api/turn/ice-servers`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error(`ICE servers fetch failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.iceServers && Array.isArray(data.iceServers)) {
        this.iceServers = data.iceServers;
        this.iceServersFetched = true;
        this.iceServersExpiry = Date.now() + VoiceClient.ICE_TTL_MS;

        // Cache to localStorage
        try {
          localStorage.setItem(VoiceClient.ICE_CACHE_KEY, JSON.stringify({
            servers: this.iceServers,
            expiry: this.iceServersExpiry,
          }));
        } catch {
          // Storage full, ignore
        }

        // Log TURN configuration
        const turnServers = this.iceServers.filter(s => 
          typeof s.urls === 'string' ? s.urls.startsWith('turn') :
          Array.isArray(s.urls) ? s.urls.some(u => u.startsWith('turn')) : false
        );
        
        if (turnServers.length > 0) {
          console.log('[Voice] TURN server configured via API:', turnServers.length, 'server(s)');
        } else {
          console.log('[Voice] Using STUN only (no TURN configured on server)');
        }
      }
    } catch (err) {
      console.warn('[Voice] Failed to fetch ICE servers from API, using STUN fallback:', err);
      // Keep using STUN servers
      this.iceServers = this.getDefaultStunServers();
    }

    return this.iceServers;
  }

  /**
   * Get current ICE servers (triggers refresh if expired)
   */
  async getIceServers(): Promise<RTCIceServer[]> {
    if (!this.iceServersFetched || Date.now() >= this.iceServersExpiry) {
      await this.fetchIceServers();
    }
    return this.iceServers;
  }

  // ── localStorage persistence ──────────────────────────────────────────────
  private loadSettings(): void {
    try {
      const raw = localStorage.getItem(VoiceClient.SETTINGS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<AudioSettings>;
        // Merge saved values over defaults (never restore transient PTT state)
        this.audioSettings = { ...defaultAudioSettings, ...saved, isPttActive: false };
      }
    } catch (_) {
      // Corrupted storage — silently fall back to defaults
    }
  }

  private saveSettings(): void {
    try {
      // Never persist the transient PTT-active flag
      const { isPttActive: _ptt, ...persisted } = this.audioSettings;
      localStorage.setItem(VoiceClient.SETTINGS_KEY, JSON.stringify(persisted));
    } catch (_) {
      // Quota exceeded or private-mode — ignore
    }
  }
  // ─────────────────────────────────────────────────────────────────────────
  
  // Set username for voice channel
  setUsername(username: string): void {
    this.username = username;
  }
  
  // Get/Set audio settings
  getAudioSettings(): AudioSettings {
    return { ...this.audioSettings };
  }
  
  setAudioSettings(settings: Partial<AudioSettings>): void {
    this.audioSettings = { ...this.audioSettings, ...settings };
    
    // Apply settings immediately if already in a call
    if (this.localStream) {
      this.applyAudioSettings();
    }

    // Persist to localStorage
    this.saveSettings();
  }
  
  private applyAudioSettings(): void {
    // Update VAD threshold based on sensitivity (inverse - lower sensitivity = higher threshold)
    this.vadThreshold = 100 - this.audioSettings.vadSensitivity;
    this.vadThreshold = Math.max(5, Math.min(50, this.vadThreshold)); // Clamp between 5-50
    
    // Apply input gain
    if (this.inputGainNode) {
      this.inputGainNode.gain.value = this.audioSettings.inputVolume / 100;
    }
    
    // Apply output gain
    if (this.outputGainNode) {
      this.outputGainNode.gain.value = this.audioSettings.outputVolume / 100;
    }
    
    // Update track settings
    if (this.currentAudioTrack) {
      const track = this.currentAudioTrack as MediaStreamTrack;
      const settings: MediaTrackSettings = {
        ...track.getSettings(),
        noiseSuppression: this.audioSettings.noiseSuppression,
        echoCancellation: this.audioSettings.echoCancellation,
        autoGainControl: this.audioSettings.autoGainControl,
      };
      track.applyConstraints(settings as MediaTrackConstraints).catch(console.error);
    }
  }
  
  // Push-to-Talk methods
  setPttPressed(pressed: boolean): void {
    this.isPttPressed = pressed;
    this.audioSettings.isPttActive = pressed;
    this.updateTransmissionState();
  }
  
  getPttKey(): string {
    return this.audioSettings.pttKey;
  }
  
  setPttKey(key: string): void {
    this.audioSettings.pttKey = key;
  }
  
  getTransmissionMode(): 'voice-activity' | 'push-to-talk' {
    return this.audioSettings.transmissionMode;
  }
  
  setTransmissionMode(mode: 'voice-activity' | 'push-to-talk'): void {
    this.audioSettings.transmissionMode = mode;
    this.updateTransmissionState();
  }
  
  getVadSensitivity(): number {
    return this.audioSettings.vadSensitivity;
  }
  
  setVadSensitivity(sensitivity: number): void {
    this.audioSettings.vadSensitivity = sensitivity;
    this.applyAudioSettings();
  }
  
  // Get input/output volume
  getInputVolume(): number {
    return this.audioSettings.inputVolume;
  }
  
  setInputVolume(volume: number): void {
    this.audioSettings.inputVolume = Math.max(0, Math.min(200, volume));
    this.applyAudioSettings();
  }
  
  getOutputVolume(): number {
    return this.audioSettings.outputVolume;
  }
  
  setOutputVolume(volume: number): void {
    this.audioSettings.outputVolume = Math.max(0, Math.min(200, volume));
    this.applyAudioSettings();
  }
  
  // Update transmission based on PTT or VAD
  private updateTransmissionState(): void {
    // In voice-activity mode, we ALWAYS keep the track enabled for analysis
    // The VAD detection will naturally gate when audio is sent
    // PTT mode still needs to enable/disable the track
    
    if (this.audioSettings.transmissionMode === 'push-to-talk') {
      const shouldTransmit = this.isPttPressed && !this.isManuallyMuted;
      // For PTT, we can disable the track when not pressing the key
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach(track => {
          track.enabled = shouldTransmit;
        });
      }
    } else {
      // Voice-activity mode: ALWAYS keep track enabled so AudioContext can analyze it
      // The isManuallyMuted check still applies
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach(track => {
          track.enabled = !this.isManuallyMuted;
        });
      }
    }
  }
  
  // Check if currently transmitting
  isTransmitting(): boolean {
    if (this.audioSettings.transmissionMode === 'push-to-talk') {
      return this.isPttPressed && !this.isManuallyMuted;
    }
    return this.isVoiceActive && !this.isManuallyMuted;
  }
  
  // Get VAD state
  isVoiceActivityDetected(): boolean {
    return this.isVoiceActive;
  }

  async joinVoiceChannel(roomId: string, audioDeviceId?: string, forcedUsername?: string): Promise<void> {
    // ── Synchronous guards (must run before any await) ──────────────────────
    // 1. Already in this exact room and connected
    if (this.roomId === roomId && this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[Voice] Already in room:', roomId);
      return;
    }
    // 2. Another join is in flight (e.g. rapid double-click)
    if (this.isJoining) {
      console.log('[Voice] Join already in progress — ignoring duplicate call');
      return;
    }
    this.isJoining = true;
    // ────────────────────────────────────────────────────────────────────────

    // If we're in a different room, tear it down first
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      this.leaveVoiceChannel();
      // Give the WS close a tick to flush before we open a new one
      await new Promise(resolve => setTimeout(resolve, 80));
    }

    // If forcedUsername is provided, use it immediately
    if (forcedUsername) {
      this.username = forcedUsername;
      console.log('[Voice] joinVoiceChannel using forced username:', forcedUsername);
    }
    
    this.roomId = roomId;
    this.wasInVoiceChannel = true;
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
    this.connectedSince = Date.now(); // Track connection start time
    
    try {
      // Enhanced audio constraints for better sound quality
      const audioConstraints: MediaTrackConstraints = {
        // Enable all browser audio processing for best quality
        echoCancellation: this.audioSettings.echoCancellation,
        noiseSuppression: this.audioSettings.noiseSuppression,
        autoGainControl: this.audioSettings.autoGainControl,
        
        // Use stereo for music mode, mono for voice
        channelCount: this.audioSettings.enableStereo ? 2 : 1,
        
        // Sample rate - 48kHz is the gold standard for WebRTC
        sampleRate: { ideal: 48000 },
        sampleSize: { ideal: 16 },
      };
      
      // Add device ID if specified
      if (audioDeviceId) {
        audioConstraints.deviceId = { exact: audioDeviceId };
      }
      
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
      
      // Log stream details for debugging
      if (import.meta.env.DEV) {
        const track = this.localStream.getAudioTracks()[0];
        const settings = track.getSettings();
        console.log('[Voice] Got local stream with settings:', {
          sampleRate: settings.sampleRate,
          channelCount: settings.channelCount,
          echoCancellation: settings.echoCancellation,
          noiseSuppression: settings.noiseSuppression,
          autoGainControl: settings.autoGainControl,
        });
      }
      
      // Set up audio analysis for voice indicator - MUST be called before connect
      this.setupAudioAnalysis();
      
      // Connect to signaling server
      this.connect();
    } catch (error) {
      console.error('Failed to join voice channel:', error);
      this.notifyError('Failed to access microphone. Please check permissions.');
    } finally {
      this.isJoining = false;
    }
  }

  // Get available audio input devices
  async getAudioDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'audioinput');
  }

  // Get available audio output devices (speakers)
  async getAudioOutputDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'audiooutput');
  }

  private connect(): void {
    // Compute WS URL fresh — picks up ServerSetupScreen changes stored in localStorage
    let wsUrl: string;
    try {
      wsUrl =
        localStorage.getItem('disorder:ws-url') ||
        (import.meta.env.VITE_WS_URL as string | undefined) ||
        'ws://localhost:3002';
    } catch {
      wsUrl = (import.meta.env.VITE_WS_URL as string | undefined) || 'ws://localhost:3002';
    }
    if (import.meta.env.DEV) {
      console.log('[Voice] Connecting to:', wsUrl);
    }
    
    this.ws = new WebSocket(wsUrl);

    let socketOpened = false;

    this.ws.onopen = () => {
      socketOpened = true;
      if (import.meta.env.DEV) {
        console.log('[Voice] Connected to signaling server');
      }
      
      // IMPORTANT: Server requires JWT authentication before any other messages
      // Get token from localStorage (set by AuthContext after login)
      let token: string | null = null;
      try {
        token = localStorage.getItem('disorder:token');
      } catch {
        // localStorage unavailable
      }
      
      if (token) {
        console.log('[Voice] Sending auth with token');
        this.ws?.send(JSON.stringify({
          type: 'auth',
          token: token,
        }));
      } else {
        console.warn('[Voice] No auth token available - connection may be rejected');
        // Fallback: try joining without auth (for dev/backward compatibility)
        this.ws?.send(JSON.stringify({
          type: 'join',
          roomId: this.roomId,
          username: this.username || 'UNKNOWN_NO_USERNAME',
        }));
      }
    };

    this.ws.onmessage = (event) => {
      if (import.meta.env.DEV) {
        console.log('[Voice] Received:', event.data);
      }
      const message = JSON.parse(event.data);
      this.handleSignalingMessage(message);
    };

    this.ws.onclose = (event) => {
      if (import.meta.env.DEV) {
        console.log('[Voice] Disconnected:', event.code, event.reason);
      }

      // Only reset the reconnect counter if the socket actually opened successfully.
      // Resetting on every close (including failed CONNECTING→CLOSED transitions) would
      // make the retry loop infinite.
      if (socketOpened) {
        this.reconnectAttempts = 0;
      }
      
      // Attempt auto-reconnect if we were in a voice channel
      if (this.wasInVoiceChannel && this.roomId && !this.isReconnecting) {
        this.attemptReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('[Voice] WebSocket error:', error);
      this.notifyError('Connection to voice server failed. Make sure the backend is running.');
    };
  }

  private async handleSignalingMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'auth-success':
        // Server confirmed our JWT auth - now we can join the voice channel
        console.log('[Voice] Auth successful, joining room:', this.roomId, 'as', this.username);
        this.ws?.send(JSON.stringify({
          type: 'join',
          roomId: this.roomId,
          username: this.username || 'UNKNOWN_NO_USERNAME',
        }));
        break;

      case 'auth-failed':
        console.error('[Voice] Auth failed:', message.error);
        this.notifyError('Voice authentication failed. Please log in again.');
        break;

      case 'auth-required':
        console.warn('[Voice] Server requires authentication');
        // Try to re-auth with token
        let token: string | null = null;
        try {
          token = localStorage.getItem('disorder:token');
        } catch {
          // localStorage unavailable
        }
        if (token) {
          this.ws?.send(JSON.stringify({ type: 'auth', token }));
        }
        break;

      case 'room-joined':
        if (import.meta.env.DEV) {
          console.log('[Voice] Joined room, users:', message.users);
        }
        // users is now { id: string; username: string }[] — handle both old (string) and new format
        for (const userEntry of (message.users || [])) {
          const userId = typeof userEntry === 'string' ? userEntry : userEntry.id;
          await this.createPeerConnection(userId, true);
        }
        break;

      case 'user-joined':
        if (import.meta.env.DEV) {
          console.log('[Voice] User joined:', message.from, 'username:', message.username);
        }
        // Pass the display username (not the socket ID) to handlers
        this.onUserJoinedHandlers.forEach(h => h(message.username || message.from));
        await this.createPeerConnection(message.from, false);
        break;

      case 'user-left':
        if (import.meta.env.DEV) {
          console.log('[Voice] User left:', message.from, 'username:', message.username);
        }
        this.onUserLeftHandlers.forEach(h => h(message.username || message.from));
        this.closePeerConnection(message.from);
        break;

      case 'offer':
        await this.handleOffer(message.from, message.data);
        break;

      case 'answer':
        await this.handleAnswer(message.from, message.data);
        break;

      case 'ice-candidate':
        await this.handleIceCandidate(message.from, message.data);
        break;
    }
  }

  private async createPeerConnection(peerId: string, initiator: boolean): Promise<void> {
    // Ensure we have fresh ICE servers (includes TURN if configured)
    const iceServers = await this.getIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    this.peers.set(peerId, pc);

    // Add local audio stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Also add screen share video track if actively sharing
    // This ensures new peers joining after screen share started can see it
    if (this.screenStream && this.isScreenSharing) {
      const videoTrack = this.screenStream.getVideoTracks()[0];
      if (videoTrack) {
        const sender = pc.addTrack(videoTrack, this.screenStream);
        this.screenShareSenders.set(peerId, sender);
        console.log('[Voice] Added screen share track for new peer:', peerId);
      }
    }

    // Handle incoming stream
    pc.ontrack = (event) => {
      console.log('[Voice] Received remote track from', peerId, 'kind:', event.track.kind);
      
      if (event.track.kind === 'video') {
        // This is a screen share video track — route to the screen share handler
        console.log('[Voice] Incoming screen share from', peerId);
        if (event.streams[0]) {
          this.onIncomingScreenShareHandlers.forEach(h => h(peerId, event.streams[0]));
        }
        return;
      }

      // Audio track — route to speakers
      const user = this.getUser(peerId);
      if (user) {
        user.stream = event.streams[0];
      }
      if (event.streams[0]) {
        this.playStream(event.streams[0], peerId);
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws?.send(JSON.stringify({
          type: 'ice-candidate',
          to: peerId,
          data: event.candidate,
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[Voice] Peer ${peerId} state:`, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.closePeerConnection(peerId);
      }
    };

    // If initiator, create offer
    if (initiator) {
      const offer = await pc.createOffer();
      
      // Apply Opus codec settings (FEC, stereo, bitrate) via SDP munging
      if (offer.sdp) {
        offer.sdp = this.applyOpusCodecSettings(offer.sdp);
      }
      
      await pc.setLocalDescription(offer);
      this.ws?.send(JSON.stringify({
        type: 'offer',
        to: peerId,
        data: offer,
      }));
    }
  }

  /**
   * Apply Opus codec settings to SDP for FEC, stereo, bitrate, etc.
   * This enables Forward Error Correction which helps recover from packet loss.
   */
  private applyOpusCodecSettings(sdp: string): string {
    // Parse SDP and modify Opus fmtp line
    const lines = sdp.split('\n');
    const modifiedLines: string[] = [];
    
    for (const line of lines) {
      // Find the Opus fmtp line and append our parameters
      if (line.startsWith('a=fmtp:111') || line.includes('opus/48000')) {
        // Opus format parameters - add FEC if enabled
        const params: string[] = [];
        
        if (this.audioSettings.enableFec) {
          params.push('useinbandfec=1');
        }
        
        if (this.audioSettings.enableDtx) {
          params.push('usedtx=1');
        }
        
        if (this.audioSettings.enableStereo) {
          params.push('stereo=1');
        } else {
          params.push('stereo=0');
        }
        
        // Add bitrate setting
        params.push(`maxaveragebitrate=${this.audioSettings.opusBitrate}`);
        
        // Append parameters to existing line or create new one
        if (line.includes(';')) {
          // Already has parameters, append ours
          modifiedLines.push(`${line};${params.join(';')}`);
        } else if (line.startsWith('a=rtpmap:')) {
          // rtpmap line, keep as is (fmtp will be added separately)
          modifiedLines.push(line);
        } else {
          // fmtp line without parameters
          modifiedLines.push(`${line};${params.join(';')}`);
        }
      } else if (line.startsWith('a=rtpmap:111')) {
        // Keep the rtpmap line for Opus
        modifiedLines.push(line);
      } else {
        modifiedLines.push(line);
      }
    }
    
    return modifiedLines.join('\n');
  }

  /**
   * Apply video codec settings to SDP for screen sharing.
   * Prioritizes VP9 for better screen share quality, with fallback to VP8.
   */
  private applyVideoCodecSettings(sdp: string): string {
    // For screen sharing, we want to:
    // 1. Prioritize VP9 if available (better for screen content)
    // 2. Set appropriate bitrate for screen share
    // 3. Enable screen content extensions if available
    
    const lines = sdp.split('\n');
    const modifiedLines: string[] = [];
    
    // Find video codecs and their payload types
    let vp9PayloadType: string | null = null;
    let vp8PayloadType: string | null = null;
    let h264PayloadType: string | null = null;
    
    for (const line of lines) {
      // Extract payload types for video codecs
      if (line.startsWith('a=rtpmap:') && line.includes('VP9')) {
        vp9PayloadType = line.substring(9).split(' ')[0];
      } else if (line.startsWith('a=rtpmap:') && line.includes('VP8')) {
        vp8PayloadType = line.substring(9).split(' ')[0];
      } else if (line.startsWith('a=rtpmap:') && line.includes('H264')) {
        h264PayloadType = line.substring(9).split(' ')[0];
      }
    }
    
    // Reorder codecs in m= line to prefer VP9, then VP8, then H264
    for (const line of lines) {
      if (line.startsWith('m=video') && (vp9PayloadType || vp8PayloadType)) {
        // Parse existing payload types
        const parts = line.split(' ');
        const payloadTypes = parts.slice(3);
        
        // Reorder: VP9 first, then VP8, then H264, then others
        const reordered: string[] = [];
        const added = new Set<string>();
        
        // Add VP9 first (best for screen share)
        if (vp9PayloadType && payloadTypes.includes(vp9PayloadType)) {
          reordered.push(vp9PayloadType);
          added.add(vp9PayloadType);
        }
        
        // Then VP8
        if (vp8PayloadType && payloadTypes.includes(vp8PayloadType) && !added.has(vp8PayloadType)) {
          reordered.push(vp8PayloadType);
          added.add(vp8PayloadType);
        }
        
        // Then H264
        if (h264PayloadType && payloadTypes.includes(h264PayloadType) && !added.has(h264PayloadType)) {
          reordered.push(h264PayloadType);
          added.add(h264PayloadType);
        }
        
        // Then add any remaining codecs
        for (const pt of payloadTypes) {
          if (!added.has(pt)) {
            reordered.push(pt);
          }
        }
        
        // Reconstruct the m= line
        modifiedLines.push(`${parts[0]} ${parts[1]} ${parts[2]} ${reordered.join(' ')}`);
      } else {
        modifiedLines.push(line);
      }
    }
    
    return modifiedLines.join('\n');
  }

  private async handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    let pc = this.peers.get(peerId);
    if (!pc) {
      await this.createPeerConnection(peerId, false);
      pc = this.peers.get(peerId);
    }

    if (!pc) return;

    try {
      // Handle different signaling states
      switch (pc.signalingState) {
        case 'stable':
          // We initiated but got an offer - need to set remote and create answer
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.ws?.send(JSON.stringify({
            type: 'answer',
            to: peerId,
            data: answer,
          }));
          break;
          
        case 'have-local-offer':
          // We sent an offer, now receiving one - this is a race condition
          // Close and recreate the connection
          pc.close();
          this.peers.delete(peerId);
          await this.createPeerConnection(peerId, false);
          const newPc = this.peers.get(peerId);
          if (newPc) {
            await newPc.setRemoteDescription(new RTCSessionDescription(offer));
            const newAnswer = await newPc.createAnswer();
            await newPc.setLocalDescription(newAnswer);
            this.ws?.send(JSON.stringify({
              type: 'answer',
              to: peerId,
              data: newAnswer,
            }));
          }
          break;
          
        case 'have-remote-offer':
          // We have their offer, just need to answer
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer2 = await pc.createAnswer();
          await pc.setLocalDescription(answer2);
          this.ws?.send(JSON.stringify({
            type: 'answer',
            to: peerId,
            data: answer2,
          }));
          break;
          
        case 'have-local-pranswer':
        case 'have-remote-pranswer':
          // Pranswer states - set remote description
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          break;
          
        default:
          console.log('[Voice] Unknown signaling state:', pc.signalingState);
      }
      
      // Process any queued ICE candidates after setting remote description
      await this.processPendingIceCandidates(peerId);
    } catch (err) {
      console.error('[Voice] Error handling offer:', err);
    }
  }

  private async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.peers.get(peerId);
    if (!pc) {
      console.log('[Voice] Received answer for unknown peer:', peerId);
      return;
    }
    
    const currentState = pc.signalingState;
    console.log('[Voice] handleAnswer - peerId:', peerId, 'signalingState:', currentState);
    
    try {
      switch (currentState) {
        case 'have-local-offer':
          // Correct state - we sent an offer, now receiving the answer
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          console.log('[Voice] Successfully set remote answer for', peerId);
          break;
          
        case 'stable':
          // Already connected or connection was reset - this is normal in reconnects
          // Just log and ignore, don't error
          console.log('[Voice] Received answer in stable state - peer already connected, ignoring');
          break;
          
        case 'have-remote-offer':
          // Race condition: both sides sent offers. We need to handle this carefully.
          // This happens when both peers try to initiate simultaneously
          console.log('[Voice] Race condition: both peers sent offers. Resolving...');
          // In a proper "glare" resolution, the offer with the lower tie-breaker wins
          // For simplicity, we'll accept the answer if we can
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          } catch (e) {
            console.log('[Voice] Could not resolve glare, ignoring answer');
          }
          break;
          
        case 'closed':
          // Connection was closed, ignore
          console.log('[Voice] Received answer for closed connection, ignoring');
          break;
          
        default:
          console.log('[Voice] Answer received in unexpected state:', currentState);
          // Try anyway
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          } catch (e) {
            console.warn('[Voice] Could not set remote description:', e);
          }
      }
      
      // Process any queued ICE candidates
      await this.processPendingIceCandidates(peerId);
    } catch (err) {
      console.error('[Voice] Error handling answer:', err, 'state was:', currentState);
      // Don't throw - this is recoverable in many cases
    }
  }

  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.peers.get(peerId);
    if (pc) {
      try {
        // Only add ICE candidate if remote description is set
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          // Queue the candidate for later
          console.log('[Voice] Queuing ICE candidate for', peerId, '- remote description not ready yet');
          if (!this.pendingIceCandidates) {
            this.pendingIceCandidates = new Map();
          }
          if (!this.pendingIceCandidates.has(peerId)) {
            this.pendingIceCandidates.set(peerId, []);
          }
          this.pendingIceCandidates.get(peerId)!.push(candidate);
        }
      } catch (err) {
        console.warn('[Voice] Failed to add ICE candidate:', err);
      }
    }
  }
  
  // Helper to store pending ICE candidates
  private pendingIceCandidates: Map<string, RTCIceCandidateInit[]> | null = null;
  
  // Helper to process queued ICE candidates
  private async processPendingIceCandidates(peerId: string): Promise<void> {
    const pc = this.peers.get(peerId);
    if (!pc || !this.pendingIceCandidates) return;
    
    const candidates = this.pendingIceCandidates.get(peerId);
    if (!candidates) return;
    
    for (const candidate of candidates) {
      try {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.warn('[Voice] Failed to add queued ICE candidate:', err);
      }
    }
    
    this.pendingIceCandidates.delete(peerId);
  }

  private closePeerConnection(peerId: string): void {
    const pc = this.peers.get(peerId);
    if (pc) {
      pc.close();
      this.peers.delete(peerId);
    }
    
    // Clean up audio element for this peer (memory leak fix)
    const audioElement = this.remoteAudioElements.get(peerId);
    if (audioElement) {
      audioElement.pause();
      audioElement.srcObject = null;
      this.remoteAudioElements.delete(peerId);
    }
    
    // Clean up screen share sender for this peer
    this.screenShareSenders.delete(peerId);
  }

  private getUser(_peerId: string): VoiceUser | undefined {
    // This would be stored in a Map in a full implementation
    return undefined;
  }

  leaveVoiceChannel(): void {
    // Reset reconnect state
    this.wasInVoiceChannel = false;
    this.isReconnecting = false;
    
    // Close all peer connections
    this.peers.forEach((pc) => {
      pc.close();
    });
    this.peers.clear();

    // Clean up all remote audio elements (memory leak fix)
    this.remoteAudioElements.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
    });
    this.remoteAudioElements.clear();

    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Clean up audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // Disconnect from signaling
    if (this.ws) {
      // Only send leave message if socket is open
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'leave' }));
        this.ws.close();
      }
      // For CONNECTING sockets, just null out - closing causes browser warnings
      this.ws = null;
    }

    this.roomId = '';
    console.log('[Voice] Left voice channel');
  }

  // ── Mute / Deafen ────────────────────────────────────────────────────────

  /**
   * Mute or unmute the local microphone.
   * Calls updateTransmissionState() which actually disables the WebRTC audio track.
   */
  setMuted(muted: boolean): void {
    this.isManuallyMuted = muted;
    this.updateTransmissionState(); // ← actually apply to the WebRTC track
  }

  isMuted(): boolean {
    return this.isManuallyMuted;
  }

  /** Toggle microphone mute. Returns the new muted state. */
  toggleMute(): boolean {
    this.isManuallyMuted = !this.isManuallyMuted;
    this.updateTransmissionState(); // ← actually apply to the WebRTC track
    return this.isManuallyMuted;
  }

  /**
   * Deafen or un-deafen:
   * - Mutes all remote audio elements (can't hear others)
   * - Force-mutes local microphone (can't speak while deafened)
   */
  setDeafened(deafened: boolean): void {
    // Mute/unmute all remote audio streams
    this.remoteAudioElements.forEach((audio) => {
      audio.muted = deafened;
    });
    // Also mute/unmute the microphone
    this.isManuallyMuted = deafened;
    this.updateTransmissionState();
  }

  // Get audio level (0-100)
  getAudioLevel(): number {
    if (!this.analyser || !this.localStream) {
      if (import.meta.env.DEV) {
        console.log('[Voice] getAudioLevel: no analyser or stream', { 
          hasAnalyser: !!this.analyser, 
          hasStream: !!this.localStream,
          audioContextState: this.audioContext?.state 
        });
      }
      return 0;
    }
    
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(dataArray);
    
    // Simple max value approach - find the loudest sample
    let maxVal = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const val = Math.abs(dataArray[i] - 128);
      if (val > maxVal) maxVal = val;
    }
    
    // maxVal is 0-128, convert to percentage with big boost
    const level = Math.min(100, Math.round((maxVal / 128) * 500));
    
    return level;
  }

  // Set up audio analysis with gain nodes for volume control
  private setupAudioAnalysis(): void {
    if (!this.localStream) return;
    
    try {
      const track = this.localStream.getAudioTracks()[0];
      this.currentAudioTrack = track;
      
      this.audioContext = new AudioContext();
      
      // CRITICAL: Resume audio context immediately (browsers require user interaction)
      // This must happen synchronously during the click handler
      if (this.audioContext.state === 'suspended') {
        if (import.meta.env.DEV) {
          console.log('[Voice] AudioContext suspended, resuming immediately...');
        }
        // Resume synchronously - the user just clicked "Join Voice" so we have permission
        this.audioContext.resume().then(() => {
          if (import.meta.env.DEV) {
            console.log('[Voice] AudioContext resumed successfully, state:', this.audioContext?.state);
          }
        }).catch((err) => {
          console.error('[Voice] Failed to resume AudioContext:', err);
        });
      } else {
        if (import.meta.env.DEV) {
          console.log('[Voice] AudioContext state:', this.audioContext.state);
        }
      }
      
      // Create source from local stream
      const source = this.audioContext.createMediaStreamSource(this.localStream);
      
      // Create input gain node for volume control
      this.inputGainNode = this.audioContext.createGain();
      this.inputGainNode.gain.value = this.audioSettings.inputVolume / 100;
      
      // Create analyser for voice detection
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0;
      
      // Connect: source -> inputGain -> analyser
      // This allows us to monitor the audio levels after volume adjustment
      source.connect(this.inputGainNode);
      this.inputGainNode.connect(this.analyser);
      
      // Apply initial audio settings
      this.applyAudioSettings();
      
      if (import.meta.env.DEV) {
        console.log('[Voice] Audio analysis set up successfully');
      }
      
      // Start monitoring audio levels and VAD
      this.monitorAudioLevels();
    } catch (err) {
      console.error('[Voice] Failed to set up audio analysis:', err);
    }
  }
  
  // Improved audio level detection with VAD
  private updateVoiceActivityDetection(level: number): void {
    const now = Date.now();
    
    // Check if audio level exceeds VAD threshold
    if (level > this.vadThreshold) {
      // First detection or continuing speech
      if (!this.isVoiceActive) {
        this.lastSpeechTime = now;
      }
      this.isVoiceActive = true;
    } else {
      // Check if speech has been long enough to register
      if (this.isVoiceActive && (now - this.lastSpeechTime) < this.minSpeakingDuration) {
        // Was speaking but too short, don't count it
        this.isVoiceActive = false;
      } else if (this.isVoiceActive) {
        // End of speech
        this.isVoiceActive = false;
      }
    }
    
    // In voice activity mode, update transmission state
    if (this.audioSettings.transmissionMode === 'voice-activity') {
      this.updateTransmissionState();
    }
  }

  private monitorAudioLevels(): void {
    const updateLevel = () => {
      if (!this.analyser) return;
      
      const level = this.getAudioLevel();
      this.onAudioLevelHandlers.forEach(handler => handler(level));
      
      // Update voice activity detection
      this.updateVoiceActivityDetection(level);
      
      requestAnimationFrame(updateLevel);
    };
    
    updateLevel();
  }

  onAudioLevel(handler: (level: number) => void): void {
    if (!this.onAudioLevelHandlers.includes(handler)) {
      this.onAudioLevelHandlers.push(handler);
    }
  }
  
  offAudioLevel(handler: (level: number) => void): void {
    this.onAudioLevelHandlers = this.onAudioLevelHandlers.filter(h => h !== handler);
  }

  // Event handlers - with deduplication
  onUserJoined(handler: VoiceEventHandler): void {
    if (!this.onUserJoinedHandlers.includes(handler)) {
      this.onUserJoinedHandlers.push(handler);
    }
  }
  
  offUserJoined(handler: VoiceEventHandler): void {
    this.onUserJoinedHandlers = this.onUserJoinedHandlers.filter(h => h !== handler);
  }

  onUserLeft(handler: VoiceEventHandler): void {
    if (!this.onUserLeftHandlers.includes(handler)) {
      this.onUserLeftHandlers.push(handler);
    }
  }
  
  offUserLeft(handler: VoiceEventHandler): void {
    this.onUserLeftHandlers = this.onUserLeftHandlers.filter(h => h !== handler);
  }

  onError(handler: (error: string) => void): void {
    if (!this.onErrorHandlers.includes(handler)) {
      this.onErrorHandlers.push(handler);
    }
  }
  
  offError(handler: (error: string) => void): void {
    this.onErrorHandlers = this.onErrorHandlers.filter(h => h !== handler);
  }

  private notifyError(error: string): void {
    this.onErrorHandlers.forEach(h => h(error));
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // Play a remote audio stream through the speakers
  private playStream(stream: MediaStream, peerId?: string): void {
    try {
      // Create an audio element to play the stream
      const audio = new Audio();
      audio.srcObject = stream;
      audio.autoplay = true;
      audio.muted = false; // Enable audio output
      
      // Apply output volume setting
      audio.volume = this.audioSettings.outputVolume / 100;
      
      // Store audio element for cleanup and volume control
      if (peerId) {
        this.remoteAudioElements.set(peerId, audio);
      }
      
      // Play the audio
      audio.play().catch(err => {
        console.error('[Voice] Failed to play audio:', err);
      });
    } catch (err) {
      console.error('[Voice] Error setting up audio playback:', err);
    }
  }
  
  // Update output volume for all remote audio streams
  private updateAllOutputVolumes(): void {
    this.remoteAudioElements.forEach((audio) => {
      audio.volume = this.audioSettings.outputVolume / 100;
    });
  }
  
  // Connection tracking for stats
  private connectedSince: number | null = null;
  private lastSpeakingTime: number = 0;
  
  // Get voice statistics for all peers
  getVoiceStatistics(): VoiceStatistics {
    const stats: VoiceStatistics = {
      bytesReceived: 0,
      bytesSent: 0,
      packetsReceived: 0,
      packetsLost: 0,
      packetsLostOutbound: 0,
      jitter: 0,
      roundTripTime: 0,
      connectionState: null,
      connectedSince: this.connectedSince,
      idleTime: this.lastSpeakingTime > 0 ? Date.now() - this.lastSpeakingTime : 0,
      lastSpeakingTime: this.lastSpeakingTime,
      codec: 'Opus',
      bitrate: 0,
      availableOutgoingBitrate: 0,
    };
    
    // Aggregate stats from all peers
    this.peers.forEach((pc) => {
      pc.getStats().then((report) => {
        report.forEach((stat) => {
          if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
            stats.bytesReceived += stat.bytesReceived || 0;
            stats.packetsReceived += stat.packetsReceived || 0;
            stats.packetsLost += stat.packetsLost || 0;
            stats.jitter = stat.jitter || 0;
          }
          if (stat.type === 'outbound-rtp' && stat.kind === 'audio') {
            stats.bytesSent += stat.bytesSent || 0;
            stats.packetsLostOutbound += stat.packetsLost || 0;
            stats.bitrate = stat.bitrate || 0;
          }
          if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
            stats.roundTripTime = stat.currentRoundTripTime || 0;
            stats.availableOutgoingBitrate = stat.availableOutgoingBitrate || 0;
          }
        });
      });
    });
    
    // Get connection state from first peer
    if (this.peers.size > 0) {
      const firstPc = this.peers.values().next().value;
      if (firstPc) {
        stats.connectionState = firstPc.connectionState;
      }
    }
    
    return stats;
  }
  
  // Get audio input device label
  async getCurrentInputDeviceLabel(): Promise<string> {
    const devices = await this.getAudioDevices();
    const currentDevice = devices.find(d => d.deviceId === this.audioSettings.inputDeviceId);
    return currentDevice?.label || 'Default Microphone';
  }
  
  // Get audio output device label
  async getCurrentOutputDeviceLabel(): Promise<string> {
    const devices = await this.getAudioOutputDevices();
    const currentDevice = devices.find(d => d.deviceId === this.audioSettings.outputDeviceId);
    return currentDevice?.label || 'Default Speakers';
  }
  
  // Apply audio preset
  applyPreset(presetName: string): void {
    const preset = audioPresets.find(p => p.name === presetName);
    if (preset) {
      this.setAudioSettings(preset.settings);
    }
  }
  
  // Get available presets
  getPresets(): AudioPreset[] {
    return audioPresets;
  }
  
  // Set up device change listener
  setupDeviceChangeListener(onChange: () => void): void {
    navigator.mediaDevices.addEventListener('devicechange', onChange);
  }
  
  // Remove device change listener
  removeDeviceChangeListener(onChange: () => void): void {
    navigator.mediaDevices.removeEventListener('devicechange', onChange);
  }
  
  // Test microphone - play back input through speakers
  private testMicStream: MediaStream | null = null;
  private testMicAudio: HTMLAudioElement | null = null;
  
  async testMicrophone(): Promise<void> {
    try {
      // Stop any existing test
      if (this.testMicStream) {
        this.testMicStream.getTracks().forEach(track => track.stop());
        this.testMicStream = null;
      }
      if (this.testMicAudio) {
        this.testMicAudio.pause();
        this.testMicAudio = null;
      }
      
      // Get microphone access
      this.testMicStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      });
      
      // Create audio element to play back
      this.testMicAudio = new Audio();
      this.testMicAudio.srcObject = this.testMicStream;
      this.testMicAudio.autoplay = true;
      this.testMicAudio.muted = false;
      this.testMicAudio.volume = this.audioSettings.outputVolume / 100;
      
      await this.testMicAudio.play();
      console.log('[Voice] Microphone test started');
    } catch (err) {
      console.error('[Voice] Failed to test microphone:', err);
      throw err;
    }
  }
  
  stopMicrophoneTest(): void {
    if (this.testMicStream) {
      this.testMicStream.getTracks().forEach(track => track.stop());
      this.testMicStream = null;
    }
    if (this.testMicAudio) {
      this.testMicAudio.pause();
      this.testMicAudio = null;
    }
    console.log('[Voice] Microphone test stopped');
  }
  
  // Test output device (play a tone)
  async testOutputDevice(deviceId: string): Promise<void> {
    try {
      // Create a simple beep using oscillator
      const ctx = this.audioContext || new AudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      gainNode.gain.value = this.audioSettings.outputVolume / 100;
      oscillator.frequency.value = 440; // A4 note
      oscillator.start();
      
      setTimeout(() => {
        oscillator.stop();
        ctx.close();
      }, 500);
    } catch (err) {
      console.error('[Voice] Failed to test output device:', err);
    }
  }

  // ======= Screen Share Methods =======

  // Get available screen share sources (uses Electron API)
  async getScreenShareSources(): Promise<ScreenShareSource[]> {
    // This will use Electron's desktopCapturer in the actual implementation
    // For now, return empty - requires Electron context
    console.log('[Voice] getScreenShareSources - requires Electron desktopCapturer');
    return [];
  }

  // Start screen share - captures screen and sends to server
  async startScreenShare(quality: '1080p60' | '1080p30' | '720p60' | '720p30' = '1080p60'): Promise<MediaStream> {
    // ── Availability check ────────────────────────────────────────────────
    // getDisplayMedia requires: browser support + HTTPS/localhost + user gesture.
    // In Electron 20+ it also requires setDisplayMediaRequestHandler in main.ts.
    if (typeof navigator?.mediaDevices?.getDisplayMedia !== 'function') {
      const msg =
        'Screen sharing is not supported in this environment.\n' +
        'If you are using the desktop app, please update to the latest version.\n' +
        'If you are using the browser, make sure you are on HTTPS or localhost.';
      console.error('[Voice] getDisplayMedia unavailable');
      throw new Error(msg);
    }
    // ─────────────────────────────────────────────────────────────────────

    const constraints = this.getScreenShareConstraints(quality);

    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia(constraints);
    } catch (err: any) {
      // User cancelled → AbortError / NotAllowedError — not a hard failure
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
        throw new Error('Screen share cancelled.');
      }
      // "Not supported" in Electron without the main-process handler
      if (err?.name === 'NotSupportedError' || err?.message?.includes('Not supported')) {
        throw new Error(
          'Screen sharing requires the Electron desktop app with screen capture permissions. ' +
          'Running as a web app in the browser also works on Chrome/Edge from localhost or HTTPS.'
        );
      }
      throw err; // re-throw unknown errors
    }

    this.isScreenSharing = true;

    // Add the video track to all existing peer connections so remote peers see it
    const videoTrack = this.screenStream.getVideoTracks()[0];
    if (videoTrack) {
      // ============================================
      // WEBRTC RENEGOTIATION FOR SCREEN SHARE
      // ============================================
      // When adding a new track (video) to an existing connection,
      // we need to create a new offer and exchange SDP with remote peers.
      // This is called "renegotiation".
      
      // IMPORTANT: Use for...of instead of forEach to properly await async operations
      // forEach does NOT wait for async callbacks to complete!
      for (const [peerId, pc] of this.peers.entries()) {
        try {
          // Add the video track to the connection
          const sender = pc.addTrack(videoTrack, this.screenStream!);
          
          // Store sender reference for later removal
          this.screenShareSenders.set(peerId, sender);
          
          // Check if we need to renegotiate
          // If we're already in a stable state, we initiate the renegotiation
          if (pc.signalingState === 'stable') {
            console.log('[Voice] Initiating renegotiation for screen share with peer:', peerId);
            
            // Create a new offer that includes the video track
            const offer = await pc.createOffer();
            
            // Apply Opus codec settings to the offer
            if (offer.sdp) {
              offer.sdp = this.applyOpusCodecSettings(offer.sdp);
              // Also apply video codec preferences for screen share
              offer.sdp = this.applyVideoCodecSettings(offer.sdp);
            }
            
            await pc.setLocalDescription(offer);
            
            // Send the new offer via WebSocket signaling
            this.ws?.send(JSON.stringify({
              type: 'offer',
              to: peerId,
              data: offer,
              isScreenShare: true,  // Flag to indicate this is a screen share renegotiation
            }));
            
            console.log('[Voice] Sent renegotiation offer to peer:', peerId);
          }
        } catch (err) {
          console.warn('[Voice] Could not add screen track to peer:', err);
        }
      }

      // Handle when user stops sharing via browser UI (click "Stop sharing")
      videoTrack.onended = () => {
        this.stopScreenShare();
      };
    }

    // Notify handlers
    this.onScreenShareStartHandlers.forEach(handler => handler(this.screenStream!));

    // Send screen share notification to server
    this.sendScreenShareToServer(true);

    // Start bandwidth monitoring for adaptive quality
    this.startBandwidthMonitoring();
    this.screenShareQuality = quality;

    return this.screenStream;
  }

  // Start screen share with specific source (for Electron)
  async startScreenShareWithSource(sourceId: string, quality: string): Promise<MediaStream> {
    const constraints = this.getScreenShareConstraints(quality);
    
    // In Electron, we can use the specific source ID
    const displayMediaOptions: DisplayMediaStreamOptions = {
      ...constraints,
      // @ts-ignore - Electron specific
      systemAudio: 'include',
      // @ts-ignore - Electron specific  
      surfaceSwitching: 'include',
    };
    
    this.screenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
    this.isScreenSharing = true;

    this.screenStream.getVideoTracks()[0].onended = () => {
      this.stopScreenShare();
    };

    this.onScreenShareStartHandlers.forEach(handler => handler(this.screenStream!));
    this.sendScreenShareToServer(true);

    return this.screenStream;
  }

  // Get available monitors/screens (Electron specific)
  async getMonitors(): Promise<ScreenShareSource[]> {
    // This uses Electron's desktopCapturer API
    // Return empty for now - requires Electron context
    console.log('[Voice] getMonitors - requires Electron desktopCapturer');
    return [];
  }
  
  // Auto-reconnect logic
  private async attemptReconnect(): Promise<void> {
    if (this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.isReconnecting = false;
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.notifyError('Failed to reconnect to voice channel after multiple attempts');
        this.wasInVoiceChannel = false;
      }
      return;
    }
    
    this.isReconnecting = true;
    this.reconnectAttempts++;
    
    if (import.meta.env.DEV) {
      console.log(`[Voice] Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms`);
    }
    
    // Wait before reconnecting
    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));
    
    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
    
    // Try to reconnect
    try {
      this.connect();
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[Voice] Reconnect failed:', err);
      }
      // Will try again on next disconnect
      this.isReconnecting = false;
    }
  }

  // Stop screen share
  stopScreenShare(): void {
    // Guard against concurrent stop operations
    if (this.isStoppingScreenShare) {
      console.log('[Voice] Stop screen share already in progress, skipping');
      return;
    }
    this.isStoppingScreenShare = true;
    
    try {
      // Stop bandwidth monitoring
      this.stopBandwidthMonitoring();

      // Remove the video track from all peer connections via renegotiation
      for (const [peerId, sender] of this.screenShareSenders.entries()) {
        const pc = this.peers.get(peerId);
        if (pc) {
          try {
            pc.removeTrack(sender);
            console.log('[Voice] Removed screen share track from peer:', peerId);
            
            // Renegotiate to remove the video track
            if (pc.signalingState === 'stable') {
              pc.createOffer().then(offer => {
                if (offer.sdp) {
                  offer.sdp = this.applyOpusCodecSettings(offer.sdp);
                }
                return pc.setLocalDescription(offer);
              }).then(() => {
                this.ws?.send(JSON.stringify({
                  type: 'offer',
                  to: peerId,
                  data: pc.localDescription,
                }));
              }).catch(err => {
                console.warn('[Voice] Failed to renegotiate after removing screen share:', err);
              });
            }
          } catch (err) {
            console.warn('[Voice] Failed to remove screen share track:', err);
          }
        }
      }
      this.screenShareSenders.clear();

      if (this.screenStream) {
        this.screenStream.getTracks().forEach(track => track.stop());
        this.screenStream = null;
      }
      this.isScreenSharing = false;

      // Reset quality to default for next share
      this.screenShareQuality = '1080p60';
      this.bandwidthHistory = [];
      this.lastVideoStats = null;

      // Notify handlers
      this.onScreenShareStopHandlers.forEach(handler => handler());

      // Send stop event to server
      this.sendScreenShareToServer(false);
    } finally {
      this.isStoppingScreenShare = false;
    }
  }

  // Get screen share constraints for 1080p 60fps
  private getScreenShareConstraints(quality: string): DisplayMediaStreamOptions {
    // audio: false — system-audio capture is unreliable on Windows/Electron and
    // will throw NotSupportedError on platforms that don't support it.
    // We prefer a reliable video-only share over a broken audio share.
    const base = { audio: false } as const;
    switch (quality) {
      case '1080p60':
        return { ...base, video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60, max: 60 } } };
      case '1080p30':
        return { ...base, video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } } };
      case '720p60':
        return { ...base, video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, max: 60 } } };
      case '720p30':
      default:
        return { ...base, video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } };
    }
  }

  // Send screen share data to server (via WebSocket)
  private sendScreenShareToServer(isStarting: boolean): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(JSON.stringify({
      type: isStarting ? 'screen-share-start' : 'screen-share-stop',
      roomId: this.roomId,
      quality: '1080p60',
    }));
  }

  // Handle incoming screen share from server
  handleIncomingScreenShare(userId: string, stream: MediaStream): void {
    this.onIncomingScreenShareHandlers.forEach(handler => handler(userId, stream));
  }

  // Check if currently sharing screen
  isScreenSharingNow(): boolean {
    return this.isScreenSharing;
  }

  // Get current screen stream
  getScreenStream(): MediaStream | null {
    return this.screenStream;
  }

  // Event handlers for screen share
  onScreenShareStart(handler: (stream: MediaStream) => void): void {
    this.onScreenShareStartHandlers.push(handler);
  }

  onScreenShareStop(handler: () => void): void {
    this.onScreenShareStopHandlers.push(handler);
  }

  onIncomingScreenShare(handler: (userId: string, stream: MediaStream) => void): void {
    this.onIncomingScreenShareHandlers.push(handler);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BANDWIDTH MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Start monitoring bandwidth for adaptive quality.
   * Call this when screen sharing starts.
   */
  startBandwidthMonitoring(): void {
    if (this.bandwidthMonitorInterval) {
      clearInterval(this.bandwidthMonitorInterval);
    }

    this.bandwidthMonitorInterval = setInterval(() => {
      this.measureBandwidth();
    }, 2000); // Check every 2 seconds

    console.log('[Voice] Bandwidth monitoring started');
  }

  /**
   * Stop bandwidth monitoring.
   */
  stopBandwidthMonitoring(): void {
    if (this.bandwidthMonitorInterval) {
      clearInterval(this.bandwidthMonitorInterval);
      this.bandwidthMonitorInterval = null;
    }
    this.bandwidthHistory = [];
    console.log('[Voice] Bandwidth monitoring stopped');
  }

  /**
   * Measure current bandwidth using WebRTC stats.
   */
  private async measureBandwidth(): Promise<void> {
    let totalBitrate = 0;
    let totalAvailable = 0;

    for (const pc of this.peers.values()) {
      try {
        const stats = await pc.getStats();
        stats.forEach((report) => {
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            // Calculate bitrate from bytes sent
            const bytesSent = report.bytesSent || 0;
            const timestamp = report.timestamp || Date.now();
            
            // Store for next calculation
            if (this.lastVideoStats) {
              const timeDiff = (timestamp - this.lastVideoStats.timestamp) / 1000;
              const bytesDiff = bytesSent - this.lastVideoStats.bytesSent;
              totalBitrate = (bytesDiff * 8) / timeDiff; // bits per second
            }
            
            this.lastVideoStats = { bytesSent, timestamp };
          }
          
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            totalAvailable = report.availableOutgoingBitrate || 0;
          }
        });
      } catch (err) {
        console.warn('[Voice] Error getting stats for bandwidth:', err);
      }
    }

    this.currentBandwidth = totalBitrate;
    this.availableOutgoingBitrate = totalAvailable;

    // Add to history for averaging
    this.bandwidthHistory.push(totalAvailable);
    if (this.bandwidthHistory.length > this.BANDWIDTH_HISTORY_SIZE) {
      this.bandwidthHistory.shift();
    }

    // Check if we need to adapt quality
    this.adaptScreenShareQuality();
  }

  private lastVideoStats: { bytesSent: number; timestamp: number } | null = null;

  /**
   * Adapt screen share quality based on available bandwidth.
   */
  private adaptScreenShareQuality(): void {
    if (!this.isScreenSharing || !this.screenStream) return;

    // Calculate average bandwidth from history
    const avgBandwidth = this.bandwidthHistory.length > 0
      ? this.bandwidthHistory.reduce((a, b) => a + b, 0) / this.bandwidthHistory.length
      : this.availableOutgoingBitrate;

    // Determine optimal quality based on bandwidth
    const currentQuality = this.screenShareQuality;
    let newQuality: typeof this.screenShareQuality;

    if (avgBandwidth < this.VERY_LOW_BANDWIDTH_THRESHOLD) {
      // Very low bandwidth - drop to 480p
      newQuality = '480p30';
    } else if (avgBandwidth < this.LOW_BANDWIDTH_THRESHOLD) {
      // Low bandwidth - 720p30
      newQuality = '720p30';
    } else if (avgBandwidth < 3000000) {
      // Medium bandwidth - 720p60 or 1080p30
      newQuality = currentQuality.includes('60') ? '720p60' : '1080p30';
    } else if (avgBandwidth < 5000000) {
      // Good bandwidth - 1080p30
      newQuality = '1080p30';
    } else {
      // Excellent bandwidth - 1080p60
      newQuality = '1080p60';
    }

    // Only change if different and not changing too frequently
    if (newQuality !== currentQuality) {
      console.log(`[Voice] Adapting screen share quality: ${currentQuality} -> ${newQuality} (bandwidth: ${(avgBandwidth / 1000000).toFixed(2)} Mbps)`);
      this.applyScreenShareQuality(newQuality);
    }
  }

  /**
   * Apply new quality settings to the screen share stream.
   */
  private async applyScreenShareQuality(quality: typeof this.screenShareQuality): Promise<void> {
    if (!this.screenStream) return;

    const videoTrack = this.screenStream.getVideoTracks()[0];
    if (!videoTrack) return;

    const constraints: MediaTrackConstraints = {};

    switch (quality) {
      case '1080p60':
        constraints.width = { ideal: 1920 };
        constraints.height = { ideal: 1080 };
        constraints.frameRate = { ideal: 60, max: 60 };
        break;
      case '1080p30':
        constraints.width = { ideal: 1920 };
        constraints.height = { ideal: 1080 };
        constraints.frameRate = { ideal: 30, max: 30 };
        break;
      case '720p60':
        constraints.width = { ideal: 1280 };
        constraints.height = { ideal: 720 };
        constraints.frameRate = { ideal: 60, max: 60 };
        break;
      case '720p30':
        constraints.width = { ideal: 1280 };
        constraints.height = { ideal: 720 };
        constraints.frameRate = { ideal: 30, max: 30 };
        break;
      case '480p30':
        constraints.width = { ideal: 854 };
        constraints.height = { ideal: 480 };
        constraints.frameRate = { ideal: 30, max: 30 };
        break;
    }

    try {
      await videoTrack.applyConstraints(constraints);
      this.screenShareQuality = quality;
      console.log('[Voice] Screen share quality applied:', quality);
    } catch (err) {
      console.warn('[Voice] Failed to apply quality constraints:', err);
    }
  }

  /**
   * Get current bandwidth stats for UI display.
   */
  getBandwidthStats(): {
    currentBitrate: number;
    availableBandwidth: number;
    quality: string;
    isLowBandwidth: boolean;
  } {
    const avgBandwidth = this.bandwidthHistory.length > 0
      ? this.bandwidthHistory.reduce((a, b) => a + b, 0) / this.bandwidthHistory.length
      : this.availableOutgoingBitrate;

    return {
      currentBitrate: this.currentBandwidth,
      availableBandwidth: avgBandwidth,
      quality: this.screenShareQuality,
      isLowBandwidth: avgBandwidth < this.LOW_BANDWIDTH_THRESHOLD,
    };
  }

  /**
   * Get current screen share quality.
   */
  getScreenShareQuality(): string {
    return this.screenShareQuality;
  }

  /**
   * Manually set screen share quality (overrides auto-adaptation).
   */
  async setScreenShareQuality(quality: typeof this.screenShareQuality): Promise<void> {
    this.screenShareQuality = quality;
    await this.applyScreenShareQuality(quality);
  }
}

export const voiceClient = new VoiceClient();
