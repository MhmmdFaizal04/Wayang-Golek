/**
 * Gamelan.
 *
 * Synthesised rather than sampled, so the project carries no audio files.
 *
 * Two things make a struck bronze key sound like bronze:
 *   — inharmonic partials. A gong's overtones are not integer multiples of
 *     the fundamental, which is why it shimmers instead of ringing clean.
 *   — a fast attack and a very long, slightly wavering decay.
 *
 * The melody is laid out on sléndro, the five-tone tuning. The intervals
 * below are a reasonable approximation in cents; real gamelan sets are each
 * tuned by ear and no two agree, which is rather the point.
 */

const SLENDRO_CENTS = [0, 231, 474, 717, 955]; // one octave, five tones
const ROOT = 146.83; // roughly D3

/** Frequency of scale degree `i`, where i may run past one octave. */
function tone(i) {
  const oct = Math.floor(i / 5);
  const deg = ((i % 5) + 5) % 5;
  return ROOT * Math.pow(2, oct + SLENDRO_CENTS[deg] / 1200);
}

/**
 * A balungan — the skeletal melody. Sixteen beats, in degrees of the scale.
 * `null` is a rest. This is an original phrase written for the piece, in the
 * shape of a lancaran: short, cyclic, and ending where it began.
 */
const BALUNGAN = [2, 3, 2, 1, 2, 3, 5, 3, 6, 5, 3, 2, 3, 1, 2, null];

/** The panerus doubles the melody an octave up at twice the density. */
const PANERUS_OFFSET = 5;

export class Gamelan {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.reverb = null;
    this.started = false;
    this.muted = false;
    this.volume = 0.6;

    this.bpm = 92;
    this.beat = 0; // index into the cycle
    this.beatPhase = 0; // 0..1 within the current beat
    this._nextNoteTime = 0;
    this._lookahead = 0.12;
    this._timer = null;
  }

  /** Beat info the rig uses to sync the dance. */
  get clock() {
    return { beat: this.beat, phase: this.beatPhase, bpm: this.bpm };
  }

  get secPerBeat() {
    return 60 / this.bpm / 2; // the balungan moves in half-beats
  }

  /* ── setup ─────────────────────────────────────────────────────────── */

  async start() {
    if (this.started) {
      await this.ctx.resume();
      return;
    }

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    this.ctx = new AC({ latencyHint: "interactive" });
    await this.ctx.resume().catch(() => {});

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume * 0.42;

    /* A gentle low-shelf keeps the fundamentals from muddying up, and a
       lowpass takes the digital edge off the partials. */
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5200;
    lp.Q.value = 0.4;

    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this._makeRoom(2.9);
    const wet = this.ctx.createGain();
    wet.gain.value = 0.34;

    lp.connect(this.master);
    lp.connect(this.reverb);
    this.reverb.connect(wet);
    wet.connect(this.master);
    this.master.connect(this.ctx.destination);
    this._bus = lp;

    this.started = true;
    this._nextNoteTime = this.ctx.currentTime + 0.08;
    this.beat = 0;
    this._timer = setInterval(() => this._schedule(), 25);
  }

  /** A decaying noise burst as an impulse response — a pavilion, roughly. */
  _makeRoom(seconds) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Early reflections, then a smooth exponential tail.
        const env = Math.pow(1 - t, 2.6);
        d[i] = (Math.random() * 2 - 1) * env * 0.5;
      }
    }
    return buf;
  }

  /* ── the scheduler ─────────────────────────────────────────────────── */

  _schedule() {
    if (!this.ctx || this.ctx.state !== "running") return;
    const spb = this.secPerBeat;

    while (this._nextNoteTime < this.ctx.currentTime + this._lookahead) {
      this._playBeat(this.beat, this._nextNoteTime);
      this._nextNoteTime += spb;
      this.beat = (this.beat + 1) % 16;
    }
  }

  _playBeat(i, at) {
    const deg = BALUNGAN[i];

    /* ── the saron: the main metallophone, one note per beat ── */
    if (deg !== null) {
      this._strike(tone(deg), at, {
        gain: 0.3,
        decay: 1.5,
        bright: 1,
        kind: "saron",
      });

      // The panerus, an octave up, filling in between the beats.
      this._strike(tone(deg + PANERUS_OFFSET), at, {
        gain: 0.1,
        decay: 0.7,
        bright: 1.5,
        kind: "saron",
      });
      const nxt = BALUNGAN[(i + 1) % 16];
      if (nxt !== null) {
        this._strike(tone(nxt + PANERUS_OFFSET), at + this.secPerBeat * 0.5, {
          gain: 0.07,
          decay: 0.55,
          bright: 1.5,
          kind: "saron",
        });
      }
    }

    /* ── the kempul, a hanging gong, on the even off-beats ── */
    if (i % 4 === 2) {
      this._strike(tone(deg ?? 2) / 2, at, {
        gain: 0.2,
        decay: 3.4,
        bright: 0.5,
        kind: "gong",
      });
    }

    /* ── the great gong closes the cycle ── */
    if (i === 0) {
      this._strike(ROOT / 2, at, {
        gain: 0.34,
        decay: 6.5,
        bright: 0.34,
        kind: "gong",
      });
    }

    /* ── the kethuk, a small dry punctuation ── */
    if (i % 4 === 1) {
      this._strike(tone(4) * 2, at, {
        gain: 0.05,
        decay: 0.2,
        bright: 2.2,
        kind: "saron",
      });
    }
  }

  /**
   * One struck key or gong.
   *
   * The partial ratios are deliberately inharmonic. A gong gets wider,
   * flatter-tuned partials and a slow beating between two close voices,
   * which is what produces the characteristic shimmer (ombak).
   */
  _strike(freq, at, { gain, decay, bright, kind }) {
    const ctx = this.ctx;
    if (!ctx || freq > 9000) return;

    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(this._bus);

    const partials =
      kind === "gong"
        ? [
            [1, 1],
            [2.02, 0.4],
            [2.94, 0.18],
            [4.17, 0.09],
            [5.43, 0.05],
          ]
        : [
            [1, 1],
            [2.76, 0.32],
            [5.4, 0.14],
            [8.93, 0.06],
          ];

    for (const [ratio, amp] of partials) {
      const f = freq * ratio;
      if (f > 11000) continue;

      /* Two detuned voices per partial. Their slow beat is the shimmer. */
      const voices = kind === "gong" ? [-0.6, 0.6] : [0];
      for (const cents of voices) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f * Math.pow(2, cents / 1200);

        const g = ctx.createGain();
        // Higher partials die away faster, as they do on real bronze.
        const d = decay / Math.pow(ratio, 0.55);
        const peak = gain * amp * bright * (voices.length > 1 ? 0.6 : 1);

        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(peak, at + 0.004);
        g.gain.exponentialRampToValueAtTime(1e-4, at + Math.max(0.05, d));

        osc.connect(g);
        g.connect(out);
        osc.start(at);
        osc.stop(at + d + 0.1);
        osc.onended = () => {
          g.disconnect();
          osc.disconnect();
        };
      }
    }

    // A touch of mallet noise on the attack, so it reads as struck.
    if (kind === "saron") {
      const n = ctx.createBufferSource();
      const len = Math.floor(ctx.sampleRate * 0.03);
      const b = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      n.buffer = b;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = freq * 3.4;
      bp.Q.value = 1.4;
      const ng = ctx.createGain();
      ng.gain.value = gain * 0.24;
      n.connect(bp);
      bp.connect(ng);
      ng.connect(out);
      n.start(at);
    }

    setTimeout(() => out.disconnect(), (decay + 0.4) * 1000 + 200);
  }

  /* ── per-frame, for the dance clock ────────────────────────────────── */

  update() {
    if (!this.ctx || !this.started) {
      // Keep a free-running clock even with the audio muted or unstarted,
      // so the dance still has a beat to move to.
      this.beatPhase = (performance.now() / 1000 / this.secPerBeat) % 1;
      return;
    }
    const spb = this.secPerBeat;
    const until = this._nextNoteTime - this.ctx.currentTime;
    this.beatPhase = 1 - Math.max(0, Math.min(1, until / spb));
  }

  /* ── controls ──────────────────────────────────────────────────────── */

  setVolume(v) {
    this.volume = v;
    if (this.master && !this.muted) {
      this.master.gain.setTargetAtTime(
        v * 0.42,
        this.ctx.currentTime,
        0.05,
      );
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) {
      this.master.gain.setTargetAtTime(
        m ? 0 : this.volume * 0.42,
        this.ctx.currentTime,
        0.06,
      );
    }
    return this.muted;
  }

  toggleMute() {
    return this.setMuted(!this.muted);
  }

  dispose() {
    clearInterval(this._timer);
    this.ctx?.close();
    this.started = false;
  }
}
