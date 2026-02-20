/**
 * Audio Engine — Singleton AudioContext for efficient sound playback
 * Prevents recreation of AudioContext on every sound effect
 */

class AudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume: number = 0.1;

  private ensureContext(): AudioContext {
    if (!this.context || this.context.state === 'closed') {
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.context.createGain();
      this.masterGain.connect(this.context.destination);
      this.masterGain.gain.value = this.volume;
    }
    // Resume if suspended (browser autoplay policy)
    if (this.context.state === 'suspended') {
      this.context.resume();
    }
    return this.context;
  }

  /**
   * Play a simple synthesized beep
   */
  playBeep(type: 'join' | 'leave' | 'notification' | 'error' = 'join'): void {
    try {
      const ctx = this.ensureContext();
      if (!this.masterGain) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(this.masterGain);

      const now = ctx.currentTime;

      switch (type) {
        case 'join':
          // Rising tone
          osc.frequency.setValueAtTime(800, now);
          osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
          osc.start(now);
          osc.stop(now + 0.2);
          break;

        case 'leave':
          // Falling tone
          osc.frequency.setValueAtTime(600, now);
          osc.frequency.exponentialRampToValueAtTime(400, now + 0.15);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
          osc.start(now);
          osc.stop(now + 0.2);
          break;

        case 'notification':
          // Double beep
          osc.frequency.setValueAtTime(880, now);
          osc.frequency.setValueAtTime(880, now + 0.15);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
          gain.gain.setValueAtTime(0.1, now + 0.15);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
          osc.start(now);
          osc.stop(now + 0.3);
          break;

        case 'error':
          // Harsh buzz
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(200, now);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
          osc.start(now);
          osc.stop(now + 0.3);
          break;
      }
    } catch {
      // Ignore audio errors (browser may block)
    }
  }

  /**
   * Play a custom frequency pattern
   */
  playPattern(frequencies: number[], duration: number = 0.1): void {
    try {
      const ctx = this.ensureContext();
      if (!this.masterGain) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(this.masterGain);

      const now = ctx.currentTime;
      let time = now;

      frequencies.forEach((freq, i) => {
        osc.frequency.setValueAtTime(freq, time);
        time += duration;
      });

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, time);

      osc.start(now);
      osc.stop(time);
    } catch {
      // Ignore
    }
  }

  /**
   * Set master volume (0-1)
   */
  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }

  /**
   * Get current volume
   */
  getVolume(): number {
    return this.volume;
  }

  /**
   * Mute/unmute
   */
  setMuted(muted: boolean): void {
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : this.volume;
    }
  }

  /**
   * Cleanup (call on app unload)
   */
  dispose(): void {
    if (this.context) {
      this.context.close();
      this.context = null;
      this.masterGain = null;
    }
  }
}

// Export singleton instance
export const audioEngine = new AudioEngine();