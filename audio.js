// Authentic Procedural NES 8-bit Chiptune Audio Synthesizer via Web Audio API

class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.bgmPlaying = false;
    this.bgmTimer = null;
    this.bgmGain = null;
    this.masterGain = null;
    
    this.melodyNotes = [
      [659, 0.14], [659, 0.14], [0, 0.14], [659, 0.14],
      [0, 0.14], [523, 0.14], [659, 0.28], [784, 0.28],
      [0, 0.28], [392, 0.28], [0, 0.28],
      [523, 0.21], [0, 0.07], [392, 0.21], [0, 0.07], [330, 0.28],
      [440, 0.21], [494, 0.21], [466, 0.14], [440, 0.28]
    ];
    this.melodyDuration = this.melodyNotes.reduce((sum, n) => sum + n[1], 0);
  }

  init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0.0 : 1.0, this.ctx.currentTime);
    }
    return this.muted;
  }

  playNesSound(freqStart, freqEnd, durationSec, volume = 0.24, steps = 1) {
    if (this.muted || !this.ctx) return;
    try {
      if (this.ctx.state === "suspended") this.ctx.resume();
      
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "square"; // Authentic NES 2A03 pulse wave

      if (steps > 1) {
        const stepDur = durationSec / steps;
        for (let i = 0; i < steps; i++) {
          const t = now + i * stepDur;
          const f = freqStart + (freqEnd - freqStart) * (i / (steps - 1 || 1));
          osc.frequency.setValueAtTime(f, t);
        }
      } else {
        osc.frequency.setValueAtTime(freqStart, now);
        osc.frequency.linearRampToValueAtTime(freqEnd, now + durationSec);
      }

      // Linear envelope decay
      gain.gain.setValueAtTime(volume, now);
      gain.gain.linearRampToValueAtTime(volume * 0.15, now + durationSec);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + durationSec);
    } catch (e) {
      // Audio autoplay policy error ignore
    }
  }

  playSfx(name) {
    switch (name) {
      case "jump":
        this.playNesSound(180, 540, 0.15, 0.22);
        break;
      case "coin":
        this.playNesSound(988, 1319, 0.18, 0.22, 2);
        break;
      case "stomp":
        this.playNesSound(420, 140, 0.12, 0.25);
        break;
      case "spring":
        this.playNesSound(220, 880, 0.24, 0.25, 4);
        break;
      case "hurt":
        this.playNesSound(500, 110, 0.35, 0.25, 5);
        break;
      case "clear":
        this.playNesSound(440, 880, 0.45, 0.26, 6);
        break;
      case "snap":
        this.playNesSound(800, 1200, 0.10, 0.22, 2);
        break;
    }
  }

  startBgm() {
    if (this.bgmPlaying) return;
    this.bgmPlaying = true;
    this.scheduleBgmLoop();
  }

  scheduleBgmLoop() {
    if (!this.bgmPlaying) return;
    this.init();
    if (!this.ctx) return;

    let offset = this.ctx.currentTime + 0.05;
    for (const [freq, dur] of this.melodyNotes) {
      if (freq > 0 && !this.muted) {
        try {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = "square";
          osc.frequency.setValueAtTime(freq, offset);

          gain.gain.setValueAtTime(0.07, offset);
          gain.gain.linearRampToValueAtTime(0.02, offset + dur);

          osc.connect(gain);
          gain.connect(this.masterGain);

          osc.start(offset);
          osc.stop(offset + dur);
        } catch (e) {}
      }
      offset += dur;
    }

    const waitMs = Math.max(100, (this.melodyDuration - 0.05) * 1000);
    this.bgmTimer = setTimeout(() => {
      this.scheduleBgmLoop();
    }, waitMs);
  }

  stopBgm() {
    this.bgmPlaying = false;
    if (this.bgmTimer) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

export const audio = new AudioManager();

