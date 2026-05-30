/**
 * ChiptuneEngine.js
 * Web Audio API procedural chiptune — zero external files.
 */
export class ChiptuneEngine {
  constructor() {
    this.ctx = null;
    this.currentLoopTimeout = null;
    this.loopRunning = false;
    this.masterGain = null;
    this._initialized = false;
  }

  _ensureInit() {
    if (this._initialized) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(this.ctx.destination);
    this._initialized = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // ── Core note player ──────────────────────────────────────────────────────
  playNote(frequency, duration, type = 'square', volume = 0.15, startTime = 0) {
    this._ensureInit();
    if (this.ctx.state === 'suspended') return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.type = type;
    osc.frequency.value = frequency;

    const t = this.ctx.currentTime + startTime;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  // ── Melody sequencer ─────────────────────────────────────────────────────
  // notes: array of { freq, dur, type, vol } — freq 0 = rest
  playMelody(notes, loop = false, onComplete = null) {
    this._ensureInit();
    this.loopRunning = true;

    const playSequence = () => {
      if (!this.loopRunning) return;

      let time = 0;
      for (const n of notes) {
        if (n.freq > 0) {
          this.playNote(n.freq, n.dur, n.type || 'square', n.vol || 0.12, time);
        }
        time += n.dur + (n.gap || 0.02);
      }

      if (loop && this.loopRunning) {
        this.currentLoopTimeout = setTimeout(playSequence, time * 1000);
      } else if (onComplete) {
        setTimeout(onComplete, time * 1000);
      }
    };

    playSequence();
  }

  stopAll() {
    this.loopRunning = false;
    if (this.currentLoopTimeout) {
      clearTimeout(this.currentLoopTimeout);
      this.currentLoopTimeout = null;
    }
  }

  setVolume(vol) {
    if (this.masterGain && this.ctx) {
      const clamped = Math.max(0, Math.min(1, vol));
      const t = this.ctx.currentTime;
      // Cancel any in-flight ramp (e.g. a fadeOut that hasn't finished)
      this.masterGain.gain.cancelScheduledValues(t);
      this.masterGain.gain.setValueAtTime(clamped, t);
    }
  }

  fadeOut(durationMs, onComplete) {
    if (!this.masterGain || !this.ctx) return;
    this.stopAll(); // stop loop scheduling immediately

    const t   = this.ctx.currentTime;
    const dur = Math.max(0.05, durationMs / 1000);
    const cur = this.masterGain.gain.value;

    // Use Web Audio ramp — no setTimeout callbacks to race with scene changes
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setValueAtTime(cur, t);
    this.masterGain.gain.linearRampToValueAtTime(0.0001, t + dur);

    if (onComplete) {
      // Tiny extra buffer so the ramp finishes before the callback fires
      setTimeout(onComplete, durationMs + 50);
    }
  }

  // ── SFX ──────────────────────────────────────────────────────────────────
  playSFX(type) {
    this._ensureInit();
    switch (type) {

      case 'notify': {
        // Two-tone ascending chime, square, 80ms each
        this.playNote(523, 0.08, 'square', 0.12, 0.0);
        this.playNote(784, 0.08, 'square', 0.12, 0.1);
        break;
      }

      case 'dayup': {
        // Single high ping, triangle, 120ms
        this.playNote(1047, 0.12, 'triangle', 0.15, 0.0);
        break;
      }

      case 'danger': {
        // Low buzz pulse, sawtooth, 200ms
        this.playNote(80, 0.2, 'sawtooth', 0.18, 0.0);
        this.playNote(80, 0.2, 'sawtooth', 0.18, 0.3);
        break;
      }

      case 'gameover': {
        // Descending glissando, sawtooth, 1500ms
        const freqs = [440, 392, 349, 311, 277, 247, 220, 196];
        freqs.forEach((f, i) => {
          this.playNote(f, 0.18, 'sawtooth', 0.14, i * 0.18);
        });
        break;
      }

      case 'correct': {
        // Short upward blip — correct slot
        this.playNote(659, 0.06, 'square', 0.10, 0.0);
        this.playNote(880, 0.08, 'square', 0.10, 0.07);
        break;
      }

      case 'wrong': {
        // Buzzer — wrong slot
        this.playNote(150, 0.15, 'sawtooth', 0.20, 0.0);
        break;
      }

      case 'kronos_warn': {
        // High-pitched beep for Kronos under 5 seconds
        this.playNote(1200, 0.04, 'square', 0.08, 0.0);
        break;
      }

      case 'kronos_tick': {
        // Short beep, square wave, high pitch — plays once per second in red zone
        this.playNote(880, 0.06, 'square', 0.2);
        break;
      }

      case 'audit': {
        // Low gong-like tone for audits
        this.playNote(110, 0.5, 'triangle', 0.2, 0.0);
        this.playNote(82,  0.8, 'triangle', 0.15, 0.1);
        break;
      }

      case 'transition': {
        // World transfer ascending sweep
        this.playNote(261, 0.08, 'triangle', 0.12, 0.0);
        this.playNote(330, 0.08, 'triangle', 0.12, 0.1);
        this.playNote(392, 0.08, 'triangle', 0.12, 0.2);
        this.playNote(523, 0.16, 'triangle', 0.15, 0.3);
        break;
      }
    }
  }

  // ── Scene Melodies ────────────────────────────────────────────────────────

  playIntroMelody() {
    // D minor, triangle wave, 75bpm, 8-note loop
    // Melancholic, slow, ancient feeling
    const bpm = 75;
    const beat = 60 / bpm;
    const half = beat * 2;

    const notes = [
      { freq: 293.66, dur: half,   type: 'triangle', vol: 0.10 },  // D4
      { freq: 349.23, dur: beat,   type: 'triangle', vol: 0.09 },  // F4
      { freq: 440.00, dur: beat,   type: 'triangle', vol: 0.09 },  // A4
      { freq: 523.25, dur: half,   type: 'triangle', vol: 0.10 },  // C5
      { freq: 440.00, dur: beat,   type: 'triangle', vol: 0.08 },  // A4
      { freq: 349.23, dur: beat,   type: 'triangle', vol: 0.08 },  // F4
      { freq: 293.66, dur: half,   type: 'triangle', vol: 0.09 },  // D4
      { freq: 0,      dur: beat,   type: 'triangle', vol: 0    },  // rest
    ];
    // Add subtle harmony layer
    const harmony = [
      { freq: 220.00, dur: half * 2, type: 'triangle', vol: 0.05 },  // A3
      { freq: 174.61, dur: half * 2, type: 'triangle', vol: 0.05 },  // F3
      { freq: 220.00, dur: half,     type: 'triangle', vol: 0.05 },  // A3
      { freq: 174.61, dur: half,     type: 'triangle', vol: 0.05 },  // F3
    ];

    this.playMelody(notes, true);
    // Stagger harmony slightly for depth
    setTimeout(() => {
      if (this.loopRunning) this.playMelody(harmony, true);
    }, 200);
  }

  playWorld1Melody() {
    // Square wave, 118bpm. Mechanical, slightly anxious.
    const bpm = 118;
    const beat = 60 / bpm;
    const e = beat / 2; // eighth

    const notes = [
      { freq: 330, dur: e,    type: 'square', vol: 0.10 },
      { freq: 330, dur: e,    type: 'square', vol: 0.08 },
      { freq: 392, dur: e,    type: 'square', vol: 0.10 },
      { freq: 0,   dur: e,    type: 'square', vol: 0    },
      { freq: 349, dur: e,    type: 'square', vol: 0.09 },
      { freq: 330, dur: e,    type: 'square', vol: 0.09 },
      { freq: 294, dur: beat, type: 'square', vol: 0.10 },
      // Bar 2
      { freq: 294, dur: e,    type: 'square', vol: 0.10 },
      { freq: 262, dur: e,    type: 'square', vol: 0.08 },
      { freq: 330, dur: e,    type: 'square', vol: 0.09 },
      { freq: 0,   dur: e,    type: 'square', vol: 0    },
      { freq: 294, dur: e,    type: 'square', vol: 0.09 },
      { freq: 262, dur: e,    type: 'square', vol: 0.09 },
      { freq: 247, dur: beat, type: 'square', vol: 0.10 },
      // Bar 3
      { freq: 247, dur: e,    type: 'square', vol: 0.09 },
      { freq: 262, dur: e,    type: 'square', vol: 0.08 },
      { freq: 294, dur: e,    type: 'square', vol: 0.09 },
      { freq: 330, dur: e,    type: 'square', vol: 0.09 },
      { freq: 349, dur: e,    type: 'square', vol: 0.08 },
      { freq: 330, dur: e,    type: 'square', vol: 0.08 },
      { freq: 294, dur: beat, type: 'square', vol: 0.10 },
      // Bar 4 — tension
      { freq: 330, dur: e,    type: 'square', vol: 0.10 },
      { freq: 0,   dur: e,    type: 'square', vol: 0    },
      { freq: 330, dur: e,    type: 'square', vol: 0.10 },
      { freq: 0,   dur: e,    type: 'square', vol: 0    },
      { freq: 370, dur: beat, type: 'square', vol: 0.11 },
      { freq: 349, dur: beat, type: 'square', vol: 0.10 },
    ];

    // Bassline
    const bass = [
      { freq: 82,  dur: beat, type: 'square', vol: 0.08 },
      { freq: 82,  dur: beat, type: 'square', vol: 0.07 },
      { freq: 73,  dur: beat, type: 'square', vol: 0.08 },
      { freq: 73,  dur: beat, type: 'square', vol: 0.07 },
      { freq: 62,  dur: beat, type: 'square', vol: 0.08 },
      { freq: 65,  dur: beat, type: 'square', vol: 0.07 },
      { freq: 73,  dur: beat, type: 'square', vol: 0.08 },
      { freq: 82,  dur: beat, type: 'square', vol: 0.07 },
    ];

    this.playMelody(notes, true);
    setTimeout(() => {
      if (this.loopRunning) this.playMelody(bass, true);
    }, 100);
  }

  playWorld2Melody() {
    // Sawtooth wave, 118bpm — feels like progress, still loops endlessly
    const bpm = 118;
    const beat = 60 / bpm;
    const e = beat / 2;

    const notes = [
      // Bar 1 — ascending motif
      { freq: 392, dur: e,    type: 'sawtooth', vol: 0.08 },
      { freq: 440, dur: e,    type: 'sawtooth', vol: 0.08 },
      { freq: 494, dur: beat, type: 'sawtooth', vol: 0.09 },
      { freq: 440, dur: e,    type: 'sawtooth', vol: 0.08 },
      { freq: 392, dur: e,    type: 'sawtooth', vol: 0.08 },
      // Bar 2
      { freq: 349, dur: e,    type: 'sawtooth', vol: 0.08 },
      { freq: 392, dur: e,    type: 'sawtooth', vol: 0.08 },
      { freq: 440, dur: beat, type: 'sawtooth', vol: 0.09 },
      { freq: 0,   dur: beat, type: 'sawtooth', vol: 0    },
      // Bar 3 — variation
      { freq: 523, dur: e,    type: 'sawtooth', vol: 0.09 },
      { freq: 494, dur: e,    type: 'sawtooth', vol: 0.08 },
      { freq: 440, dur: e,    type: 'sawtooth', vol: 0.08 },
      { freq: 494, dur: e,    type: 'sawtooth', vol: 0.08 },
      { freq: 523, dur: beat, type: 'sawtooth', vol: 0.09 },
      // Bar 4
      { freq: 494, dur: e,    type: 'sawtooth', vol: 0.08 },
      { freq: 440, dur: e,    type: 'sawtooth', vol: 0.08 },
      { freq: 392, dur: beat, type: 'sawtooth', vol: 0.09 },
      { freq: 0,   dur: beat, type: 'sawtooth', vol: 0    },
      // Bar 5
      { freq: 330, dur: e,    type: 'sawtooth', vol: 0.08 },
      { freq: 349, dur: e,    type: 'sawtooth', vol: 0.08 },
      { freq: 392, dur: e,    type: 'sawtooth', vol: 0.08 },
      { freq: 440, dur: e,    type: 'sawtooth', vol: 0.08 },
      { freq: 494, dur: beat, type: 'sawtooth', vol: 0.09 },
      // Bar 6 — resolve upward then loop back
      { freq: 523, dur: beat, type: 'sawtooth', vol: 0.09 },
      { freq: 494, dur: e,    type: 'sawtooth', vol: 0.08 },
      { freq: 440, dur: e,    type: 'sawtooth', vol: 0.08 },
    ];

    const bass = [
      { freq: 98,  dur: beat * 2, type: 'sawtooth', vol: 0.07 },
      { freq: 87,  dur: beat * 2, type: 'sawtooth', vol: 0.07 },
      { freq: 98,  dur: beat * 2, type: 'sawtooth', vol: 0.07 },
      { freq: 110, dur: beat * 2, type: 'sawtooth', vol: 0.07 },
      { freq: 98,  dur: beat * 2, type: 'sawtooth', vol: 0.07 },
      { freq: 87,  dur: beat * 2, type: 'sawtooth', vol: 0.07 },
    ];

    this.playMelody(notes, true);
    setTimeout(() => {
      if (this.loopRunning) this.playMelody(bass, true);
    }, 100);
  }

  playGameOverPandora() {
    // Descending chromatic, sawtooth, does NOT resolve. One-shot.
    const notes = [
      { freq: 440, dur: 0.4, type: 'sawtooth', vol: 0.12 },
      { freq: 415, dur: 0.4, type: 'sawtooth', vol: 0.11 },
      { freq: 392, dur: 0.4, type: 'sawtooth', vol: 0.11 },
      { freq: 370, dur: 0.4, type: 'sawtooth', vol: 0.10 },
      { freq: 349, dur: 0.4, type: 'sawtooth', vol: 0.10 },
      { freq: 330, dur: 0.4, type: 'sawtooth', vol: 0.09 },
      { freq: 311, dur: 0.5, type: 'sawtooth', vol: 0.09 },
      { freq: 277, dur: 0.7, type: 'sawtooth', vol: 0.10 }, // ends dissonant
    ];
    this.playMelody(notes, false);
  }

  playGameOverFired() {
    // Four low notes. Slow. Final. System shutting down.
    const notes = [
      { freq: 110, dur: 0.6, type: 'triangle', vol: 0.15, gap: 0.1 },
      { freq: 98,  dur: 0.6, type: 'triangle', vol: 0.13, gap: 0.1 },
      { freq: 82,  dur: 0.8, type: 'triangle', vol: 0.12, gap: 0.15 },
      { freq: 65,  dur: 1.2, type: 'triangle', vol: 0.10 },
    ];
    this.playMelody(notes, false);
  }
}
