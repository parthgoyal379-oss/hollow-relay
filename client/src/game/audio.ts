export class AudioDirector {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private hum: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private heartbeatTimer = 0;
  private lastMode = "patrol";

  unlock() {
    if (!this.context) {
      const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      this.context = new AudioCtor();
      this.master = this.context.createGain();
      this.master.gain.value = 0.12;
      this.master.connect(this.context.destination);
      const filter = this.context.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 160;
      filter.connect(this.master);
      this.hum = this.context.createOscillator(); this.hum.type = "triangle"; this.hum.frequency.value = 43;
      this.humGain = this.context.createGain(); this.humGain.gain.value = 0.12;
      this.hum.connect(this.humGain).connect(filter); this.hum.start();
      this.context.resume().catch(() => undefined);
    } else if (this.context.state === "suspended") this.context.resume().catch(() => undefined);
  }

  cue(frequency = 240, duration = 0.11, volume = 0.08) {
    if (!this.context || !this.master) return;
    const osc = this.context.createOscillator(); const gain = this.context.createGain();
    const now = this.context.currentTime;
    osc.type = "sine"; osc.frequency.setValueAtTime(frequency, now); osc.frequency.exponentialRampToValueAtTime(Math.max(50, frequency * 0.72), now + duration);
    gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(this.master); osc.start(now); osc.stop(now + duration + 0.02);
  }

  update(dt: number, mode: string, distance: number, flashlight: boolean) {
    if (!this.context) return;
    if (this.humGain) {
      const target = mode === "chase" || mode === "enraged" ? 0.28 : mode === "investigate" || mode === "search" ? 0.18 : 0.1;
      this.humGain.gain.setTargetAtTime(target, this.context.currentTime, 0.55);
    }
    if (mode !== this.lastMode) {
      if (mode === "chase" || mode === "enraged") this.cue(68, 0.7, 0.16);
      if (mode === "investigate") this.cue(176, 0.24, 0.08);
      if (mode === "return") this.cue(118, 0.35, 0.07);
      this.lastMode = mode;
    }
    const danger = Math.max(0, Math.min(1, 1 - distance / 20));
    this.heartbeatTimer -= dt;
    if (danger > 0.18 && this.heartbeatTimer <= 0) {
      this.cue(52 + danger * 8, 0.12, 0.04 + danger * 0.07);
      this.heartbeatTimer = (mode === "chase" || mode === "enraged" ? 0.42 : 0.95) - danger * 0.22;
    }
    if (flashlight && Math.random() < dt * 0.035) this.cue(330, 0.04, 0.018);
  }

  dispose() {
    try { this.hum?.stop(); } catch { /* already stopped */ }
    this.context?.close().catch(() => undefined);
    this.context = null;
  }
}
