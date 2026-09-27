export class AudioDirector {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private hum: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private noiseNode: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private heartbeatTimer = 0;
  private footstepTimer = 0;
  private lastMode = "patrol";

  unlock() {
    if (!this.context) {
      const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      this.context = new AudioCtor();
      this.master = this.context.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.context.destination);

      // Low rumble filter for ambient drone
      const filter = this.context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 180;
      filter.connect(this.master);

      this.hum = this.context.createOscillator();
      this.hum.type = "triangle";
      this.hum.frequency.value = 46;
      this.humGain = this.context.createGain();
      this.humGain.gain.value = 0.14;
      this.hum.connect(this.humGain).connect(filter);
      this.hum.start();

      // Atmospheric wind/rain buffer
      try {
        const bufferSize = this.context.sampleRate * 3;
        const noiseBuffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          output[i] = (lastOut + 0.02 * white) / 1.02; // Brown noise (rain/wind rumble)
          lastOut = output[i];
        }
        this.noiseNode = this.context.createBufferSource();
        this.noiseNode.buffer = noiseBuffer;
        this.noiseNode.loop = true;
        this.noiseGain = this.context.createGain();
        this.noiseGain.gain.value = 0.06;
        const windFilter = this.context.createBiquadFilter();
        windFilter.type = "bandpass";
        windFilter.frequency.value = 320;
        windFilter.Q.value = 1.2;
        this.noiseNode.connect(windFilter).connect(this.noiseGain).connect(this.master);
        this.noiseNode.start();
      } catch {
        /* buffer audio optional */
      }

      this.context.resume().catch(() => undefined);
    } else if (this.context.state === "suspended") {
      this.context.resume().catch(() => undefined);
    }
  }

  cue(frequency = 240, duration = 0.11, volume = 0.08) {
    if (!this.context || !this.master) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.72), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  footstep(sprinting = false, crouching = false) {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(crouching ? 80 : 130, now);

    const basePitch = sprinting ? 75 : crouching ? 52 : 62;
    osc.type = "sine";
    osc.frequency.setValueAtTime(basePitch + (Math.random() - 0.5) * 8, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.08);

    const vol = crouching ? 0.025 : sprinting ? 0.09 : 0.055;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (sprinting ? 0.1 : 0.08));

    osc.connect(filter).connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  pickupItem() {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    for (let i = 0; i < 2; i++) {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      const freq = i === 0 ? 440 : 660;
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      gain.gain.setValueAtTime(0.06, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.14);
      osc.connect(gain).connect(this.master);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.15);
    }
  }

  flashlightSwitch(on: boolean) {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(on ? 1200 : 850, now);
    osc.frequency.exponentialRampToValueAtTime(on ? 600 : 400, now + 0.035);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  pageRustle() {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    try {
      const bufferSize = Math.floor(this.context.sampleRate * 0.16);
      const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
      }
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      const filter = this.context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1400, now);
      filter.frequency.exponentialRampToValueAtTime(700, now + 0.15);
      filter.Q.value = 1.8;
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      source.connect(filter).connect(gain).connect(this.master);
      source.start(now);
    } catch {
      this.cue(800, 0.08, 0.04);
    }
  }

  radioStatic() {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    try {
      const bufferSize = Math.floor(this.context.sampleRate * 0.22);
      const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      const filter = this.context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(2200, now);
      filter.Q.value = 4.0;
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0.10, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
      source.connect(filter).connect(gain).connect(this.master);
      source.start(now);

      const osc = this.context.createOscillator();
      const oscGain = this.context.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(1750, now);
      oscGain.gain.setValueAtTime(0.03, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.connect(oscGain).connect(this.master);
      osc.start(now);
      osc.stop(now + 0.08);
    } catch {
      this.cue(1200, 0.12, 0.05);
    }
  }

  chaseStinger() {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const osc2 = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.85);

    osc2.type = "sawtooth";
    osc2.frequency.setValueAtTime(98, now); // Dissonant beating
    osc2.frequency.exponentialRampToValueAtTime(42, now + 0.85);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.exponentialRampToValueAtTime(140, now + 0.85);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(this.master);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.95);
    osc2.stop(now + 0.95);
  }

  update(dt: number, mode: string, distance: number, flashlight: boolean, moving = false, sprinting = false, crouching = false) {
    if (!this.context) return;
    if (this.humGain) {
      const target = mode === "chase" || mode === "enraged" ? 0.32 : mode === "investigate" || mode === "search" ? 0.2 : 0.12;
      this.humGain.gain.setTargetAtTime(target, this.context.currentTime, 0.4);
    }
    if (this.noiseGain) {
      const windTarget = mode === "chase" ? 0.11 : 0.05;
      this.noiseGain.gain.setTargetAtTime(windTarget, this.context.currentTime, 0.5);
    }

    if (mode !== this.lastMode) {
      if (mode === "chase" || mode === "enraged") {
        this.chaseStinger();
      } else if (mode === "investigate") {
        this.cue(165, 0.35, 0.09);
      } else if (mode === "return") {
        this.cue(110, 0.45, 0.07);
      }
      this.lastMode = mode;
    }

    // Footsteps
    if (moving) {
      this.footstepTimer -= dt;
      const interval = sprinting ? 0.32 : crouching ? 0.65 : 0.48;
      if (this.footstepTimer <= 0) {
        this.footstep(sprinting, crouching);
        this.footstepTimer = interval;
      }
    } else {
      this.footstepTimer = 0.1;
    }

    // Proximity heartbeat
    const danger = Math.max(0, Math.min(1, 1 - distance / 22));
    this.heartbeatTimer -= dt;
    if (danger > 0.15 && this.heartbeatTimer <= 0) {
      // Lub-dub double pulse
      this.cue(48 + danger * 12, 0.08, 0.05 + danger * 0.09);
      setTimeout(() => this.cue(42 + danger * 10, 0.08, 0.035 + danger * 0.07), 110);
      this.heartbeatTimer = (mode === "chase" || mode === "enraged" ? 0.45 : 0.95) - danger * 0.32;
    }

    // Subtle flashlight electrical flicker
    if (flashlight && Math.random() < dt * 0.02) {
      this.cue(380, 0.03, 0.015);
    }
  }

  dispose() {
    try { this.hum?.stop(); } catch { /* ignore */ }
    try { this.noiseNode?.stop(); } catch { /* ignore */ }
    this.context?.close().catch(() => undefined);
    this.context = null;
  }
}
