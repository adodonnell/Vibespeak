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

  // Auto-reconnect state
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;
  private isReconnecting: boolean = false;
  private wasInVoiceChannel: boolean = false;

  // Join-lock: prevents concurrent or duplicate join calls
  private isJoining: boolean = false;

  // ICE servers — assigned in constructor (STUN always, TURN if env var set)
  private iceServers!: RTCIceServer[];

  private static readonly SETTINGS_KEY = 'disorder:voice-settings';

  constructor() {
    // Build ICE server list — always include STUN; add TURN if configured via env vars
    const baseStun: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ];

    const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
    if (turnUrl) {
      const turnUser = (import.meta.env.VITE_TURN_USER as string | undefined) || '';
      const turnPass = (import.meta.env.VITE_TURN_PASS as string | undefined) || '';
      baseStun.push({
        urls: turnUrl,
        username: turnUser,
        credential: turnPass,
      });
      console.log('[Voice] TURN server configured:', turnUrl);
    } else if (import.meta.env.DEV) {
      console.log('[Voice] No TURN server configured — set VITE_TURN_URL for NAT traversal');
    }

    this.iceServers = baseStun;
    // User ID is managed by the server via WebSocket
    this.loadSettings();
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
        console.log('[Voice] Connected to signaling server, sending join with username:', this.username);
      }
      // Send username along with join message - ensure username is always included
      console.log('[Voice] WS sending join with username:', this.username);
      this.ws?.send(JSON.stringify({
        type: 'join',
        roomId: this.roomId,
        username: this.username || 'UNKNOWN_NO_USERNAME',
      }));
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
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peers.set(peerId, pc);

    // Add local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
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
      await pc.setLocalDescription(offer);
      this.ws?.send(JSON.stringify({
        type: 'offer',
        to: peerId,
        data: offer,
      }));
    }
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
      this.peers.forEach((pc) => {
        try {
          pc.addTrack(videoTrack, this.screenStream!);
        } catch (err) {
          console.warn('[Voice] Could not add screen track to peer:', err);
        }
      });

      // Handle when user stops sharing via browser UI (click "Stop sharing")
      videoTrack.onended = () => {
        this.stopScreenShare();
      };
    }

    // Notify handlers
    this.onScreenShareStartHandlers.forEach(handler => handler(this.screenStream!));

    // Send screen share notification to server
    this.sendScreenShareToServer(true);

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
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }
    this.isScreenSharing = false;

    // Notify handlers
    this.onScreenShareStopHandlers.forEach(handler => handler());

    // Send stop event to server
    this.sendScreenShareToServer(false);
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
}

export const voiceClient = new VoiceClient();
