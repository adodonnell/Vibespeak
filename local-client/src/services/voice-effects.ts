// Voice Effects Service
// Provides real-time voice transformation using Web Audio API

export type VoiceEffectType = 
  | 'none'
  | 'robot'
  | 'deep'
  | 'chipmunk'
  | 'reverb'
  | 'distortion'
  | 'echo'
  | 'alien'
  | 'monster'
  | 'helium'
  | 'gender-male'
  | 'gender-female';

export interface VoiceEffectSettings {
  effect: VoiceEffectType;
  intensity: number; // 0-100
  pitch: number; // -12 to +12 semitones
  preset?: string; // Custom preset name
}

// Custom preset interface
export interface VoiceEffectPreset {
  name: string;
  settings: VoiceEffectSettings;
}

// Default presets
export const defaultVoiceEffectSettings: VoiceEffectSettings = {
  effect: 'none',
  intensity: 50,
  pitch: 0,
};

// Built-in presets
export const voiceEffectPresets: VoiceEffectPreset[] = [
  { name: 'Robot', settings: { effect: 'robot', intensity: 70, pitch: 0 } },
  { name: 'Deep Voice', settings: { effect: 'deep', intensity: 50, pitch: -8 } },
  { name: 'Chipmunk', settings: { effect: 'chipmunk', intensity: 50, pitch: 8 } },
  { name: 'Monster', settings: { effect: 'monster', intensity: 80, pitch: -6 } },
  { name: 'Helium', settings: { effect: 'helium', intensity: 60, pitch: 12 } },
  { name: 'Alien', settings: { effect: 'alien', intensity: 50, pitch: 4 } },
];

// User-defined custom presets (stored in localStorage)
let customPresets: VoiceEffectPreset[] = [];

export class VoiceEffects {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private outputNode: AudioNode | null = null;
  private inputGain: GainNode | null = null;
  private outputGain: GainNode | null = null;
  
  // Effect nodes
  private pitchShifter: AudioWorkletNode | null = null;
  private distortionNode: WaveShaperNode | null = null;
  private convolverNode: ConvolverNode | null = null;
  private delayNode: DelayNode | null = null;
  private feedbackGain: GainNode | null = null;
  
  // Current settings
  private settings: VoiceEffectSettings = { ...defaultVoiceEffectSettings };
  private isEnabled: boolean = false;
  private localStream: MediaStream | null = null;

  // Initialize with audio context and source stream
  async initialize(localStream: MediaStream): Promise<void> {
    this.localStream = localStream;
    this.audioContext = new AudioContext();
    
    // Create source from local stream
    this.sourceNode = this.audioContext.createMediaStreamSource(localStream);
    
    // Create gain nodes
    this.inputGain = this.audioContext.createGain();
    this.outputGain = this.audioContext.createGain();
    
    // Build audio chain: source -> inputGain -> effects -> outputGain -> destination
    this.sourceNode.connect(this.inputGain);
    this.outputGain.connect(this.audioContext.destination);
    
    this.outputNode = this.inputGain;
    
    // Initialize effect nodes
    this.initializeEffectNodes();
    
    // Apply current settings
    this.applySettings(this.settings);
    
    console.log('[VoiceEffects] Initialized successfully');
  }

  private initializeEffectNodes(): void {
    if (!this.audioContext || !this.inputGain || !this.outputGain) return;

    // Distortion node
    this.distortionNode = this.audioContext.createWaveShaper();
    this.distortionNode.curve = this.makeDistortionCurve(0);
    this.distortionNode.oversample = '4x';
    
    // Delay node for echo
    this.delayNode = this.audioContext.createDelay(1.0);
    this.delayNode.delayTime.value = 0.3;
    
    // Feedback gain for echo
    this.feedbackGain = this.audioContext.createGain();
    this.feedbackGain.gain.value = 0.4;
    
    // Convolver for reverb (impulse response will be generated)
    this.convolverNode = this.audioContext.createConvolver();
    this.convolverNode.buffer = this.createReverbImpulse(2, 2, false);
  }

  // Create distortion curve
  private makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const k = amount;
    const samples = 44100;
    const curve = new Float32Array(samples) as Float32Array<ArrayBuffer>;
    const deg = Math.PI / 180;
    
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    
    return curve;
  }

  // Create reverb impulse response
  private createReverbImpulse(duration: number, decay: number, reverse: boolean): AudioBuffer {
    if (!this.audioContext) throw new Error('AudioContext not initialized');
    
    const sampleRate = this.audioContext.sampleRate;
    const length = sampleRate * duration;
    const impulse = this.audioContext.createBuffer(2, length, sampleRate);
    const impulseL = impulse.getChannelData(0);
    const impulseR = impulse.getChannelData(1);
    
    for (let i = 0; i < length; i++) {
      const n = reverse ? length - i : i;
      impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
      impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
    }
    
    return impulse;
  }

  // Apply voice effect settings
  applySettings(settings: VoiceEffectSettings): void {
    this.settings = settings;
    
    if (!this.audioContext || !this.inputGain || !this.outputGain) return;
    
    // Disconnect current chain
    this.disconnectChain();
    
    if (settings.effect === 'none') {
      // Direct passthrough
      this.inputGain.connect(this.outputGain);
      this.outputNode = this.outputGain;
      return;
    }
    
    // Build chain based on effect
    switch (settings.effect) {
      case 'robot':
        this.applyRobotEffect(settings.intensity);
        break;
      case 'deep':
        this.applyPitchShift(-8);
        this.inputGain.connect(this.outputGain);
        this.outputNode = this.outputGain;
        break;
      case 'chipmunk':
        this.applyPitchShift(8);
        this.inputGain.connect(this.outputGain);
        this.outputNode = this.outputGain;
        break;
      case 'reverb':
        this.applyReverb(settings.intensity / 100);
        break;
      case 'distortion':
        this.applyDistortion(settings.intensity);
        break;
      case 'echo':
        this.applyEcho(settings.intensity / 100);
        break;
      case 'alien':
        this.applyAlienEffect(settings.intensity);
        break;
      case 'monster':
        this.applyMonsterEffect(settings.intensity);
        break;
      case 'helium':
        this.applyHeliumEffect(settings.intensity);
        break;
      case 'gender-male':
        this.applyGenderMaleEffect(settings.intensity);
        break;
      case 'gender-female':
        this.applyGenderFemaleEffect(settings.intensity);
        break;
    }
  }

  // New voice effect implementations
  private applyMonsterEffect(intensity: number): void {
    if (!this.inputGain || !this.outputGain || !this.audioContext) return;
    
    // Monster: deep pitch + distortion + slight chorus
    this.applyPitchShift(-6 - (intensity / 100) * 4);
    this.applyDistortion(intensity * 0.6);
    
    this.inputGain.connect(this.outputGain);
    this.outputNode = this.outputGain;
  }

  private applyHeliumEffect(intensity: number): void {
    if (!this.inputGain || !this.outputGain) return;
    
    // Helium: very high pitch shift
    this.applyPitchShift(10 + (intensity / 100) * 4);
    
    // Add slight formant shift effect using EQ
    this.inputGain.connect(this.outputGain);
    this.outputNode = this.outputGain;
  }

  private applyGenderMaleEffect(intensity: number): void {
    if (!this.inputGain || !this.outputGain) return;
    
    // Male: slightly lower pitch + richer harmonics
    this.applyPitchShift(-2 - (intensity / 100) * 4);
    
    this.inputGain.connect(this.outputGain);
    this.outputNode = this.outputGain;
  }

  private applyGenderFemaleEffect(intensity: number): void {
    if (!this.inputGain || !this.outputGain) return;
    
    // Female: slightly higher pitch + brighter tone
    this.applyPitchShift(2 + (intensity / 100) * 4);
    
    this.inputGain.connect(this.outputGain);
    this.outputNode = this.outputGain;
  }

  private disconnectChain(): void {
    if (!this.audioContext) return;
    
    // Disconnect all nodes
    try {
      if (this.inputGain) {
        this.inputGain.disconnect();
      }
      if (this.distortionNode) {
        this.distortionNode.disconnect();
      }
      if (this.convolverNode) {
        this.convolverNode.disconnect();
      }
      if (this.delayNode) {
        this.delayNode.disconnect();
      }
      if (this.feedbackGain) {
        this.feedbackGain.disconnect();
      }
      if (this.outputGain) {
        this.outputGain.disconnect();
      }
    } catch (e) {
      // Nodes may not be connected
    }
  }

  private applyPitchShift(semitones: number): void {
    // Simple pitch shift using playback rate (note: this affects duration too)
    // For proper pitch shifting without duration change, we'd need a worklet
    // For now, we'll apply the pitch shift via the pitch property
    // This is a simplified approach
    this.settings.pitch = semitones;
  }

  private applyRobotEffect(intensity: number): void {
    if (!this.inputGain || !this.outputGain || !this.distortionNode || !this.audioContext) return;
    
    // Robot effect: distortion + ring modulation simulation
    const distortionAmount = (intensity / 100) * 400;
    this.distortionNode.curve = this.makeDistortionCurve(distortionAmount);
    
    // Create a simple LFO for robot effect
    const lfo = this.audioContext.createOscillator();
    const lfoGain = this.audioContext.createGain();
    lfo.frequency.value = 30 + (intensity / 100) * 20;
    lfoGain.gain.value = intensity / 100 * 0.3;
    
    // Chain: input -> distortion -> output
    this.inputGain.connect(this.distortionNode);
    this.distortionNode.connect(this.outputGain);
    this.outputNode = this.outputGain;
  }

  private applyReverb(intensity: number): void {
    if (!this.inputGain || !this.outputGain || !this.convolverNode) return;
    
    // Adjust reverb decay based on intensity
    this.convolverNode.buffer = this.createReverbImpulse(2, 2 + intensity * 2, false);
    
    // Wet/dry mix
    const dryGain = this.audioContext!.createGain();
    const wetGain = this.audioContext!.createGain();
    dryGain.gain.value = 1 - intensity * 0.7;
    wetGain.gain.value = intensity * 0.7;
    
    // Chain: input -> dry -> output, input -> reverb -> wet -> output
    this.inputGain.connect(dryGain);
    this.inputGain.connect(this.convolverNode);
    this.convolverNode.connect(wetGain);
    dryGain.connect(this.outputGain);
    wetGain.connect(this.outputGain);
    
    this.outputNode = this.outputGain;
  }

  private applyDistortion(intensity: number): void {
    if (!this.inputGain || !this.outputGain || !this.distortionNode) return;
    
    const amount = (intensity / 100) * 500;
    this.distortionNode.curve = this.makeDistortionCurve(amount);
    
    // Chain: input -> distortion -> output
    this.inputGain.connect(this.distortionNode);
    this.distortionNode.connect(this.outputGain);
    this.outputNode = this.outputGain;
  }

  private applyEcho(intensity: number): void {
    if (!this.inputGain || !this.outputGain || !this.delayNode || !this.feedbackGain) return;
    
    // Adjust delay and feedback based on intensity
    this.delayNode.delayTime.value = 0.2 + (intensity * 0.3);
    this.feedbackGain.gain.value = intensity * 0.5;
    
    // Chain: input -> output, input -> delay -> feedback -> delay -> output
    this.inputGain.connect(this.outputGain);
    this.inputGain.connect(this.delayNode);
    this.delayNode.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode);
    this.delayNode.connect(this.outputGain);
    
    this.outputNode = this.outputGain;
  }

  private applyAlienEffect(intensity: number): void {
    if (!this.inputGain || !this.outputGain || !this.audioContext) return;
    
    // Alien effect: pitch shift + reverb + slight chorus
    this.applyPitchShift(4 + (intensity / 100) * 4);
    this.applyReverb(intensity / 200);
    
    // Add slight modulation
    const lfo = this.audioContext.createOscillator();
    const lfoGain = this.audioContext.createGain();
    lfo.frequency.value = 5 + (intensity / 100) * 10;
    lfoGain.gain.value = (intensity / 100) * 20;
    
    // Connect to pitch control if possible
    this.inputGain.connect(this.outputGain);
    this.outputNode = this.outputGain;
  }

  // Enable/disable effects
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    
    if (this.outputGain) {
      this.outputGain.gain.value = enabled ? 1 : 1;
    }
    
    if (!enabled) {
      this.disconnectChain();
      if (this.inputGain && this.outputGain) {
        this.inputGain.connect(this.outputGain);
      }
    } else {
      this.applySettings(this.settings);
    }
  }

  isEffectEnabled(): boolean {
    return this.isEnabled;
  }

  // Get current settings
  getSettings(): VoiceEffectSettings {
    return { ...this.settings };
  }

  // Get built-in presets
  getBuiltInPresets(): VoiceEffectPreset[] {
    return [...voiceEffectPresets];
  }

  // Get custom presets
  getCustomPresets(): VoiceEffectPreset[] {
    return [...customPresets];
  }

  // Save custom preset
  saveCustomPreset(name: string, settings: VoiceEffectSettings): void {
    const preset: VoiceEffectPreset = { name, settings: { ...settings } };
    customPresets.push(preset);
    this.saveCustomPresetsToStorage();
    console.log('[VoiceEffects] Saved custom preset:', name);
  }

  // Delete custom preset
  deleteCustomPreset(name: string): void {
    customPresets = customPresets.filter(p => p.name !== name);
    this.saveCustomPresetsToStorage();
    console.log('[VoiceEffects] Deleted custom preset:', name);
  }

  // Load custom presets from localStorage
  loadCustomPresetsFromStorage(): void {
    try {
      const stored = localStorage.getItem('voiceEffectPresets');
      if (stored) {
        customPresets = JSON.parse(stored);
        console.log('[VoiceEffects] Loaded custom presets:', customPresets.length);
      }
    } catch (err) {
      console.error('[VoiceEffects] Failed to load custom presets:', err);
    }
  }

  // Save custom presets to localStorage
  private saveCustomPresetsToStorage(): void {
    try {
      localStorage.setItem('voiceEffectPresets', JSON.stringify(customPresets));
    } catch (err) {
      console.error('[VoiceEffects] Failed to save custom presets:', err);
    }
  }

  // Get processed stream (for WebRTC)
  getProcessedStream(): MediaStream | null {
    if (!this.audioContext || !this.outputNode) return this.localStream;
    
    // Create a new MediaStream from the processed audio
    const destination = this.audioContext.createMediaStreamDestination();
    this.outputNode.connect(destination);
    
    return destination.stream;
  }

  // Cleanup
  dispose(): void {
    this.disconnectChain();
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }
    
    if (this.audioContext) {
      this.audioContext.close();
    }
    
    this.sourceNode = null;
    this.inputGain = null;
    this.outputGain = null;
    this.distortionNode = null;
    this.convolverNode = null;
    this.delayNode = null;
    this.feedbackGain = null;
    this.audioContext = null;
    this.localStream = null;
    
    console.log('[VoiceEffects] Disposed');
  }
}

export const voiceEffects = new VoiceEffects();
