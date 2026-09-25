// Synthesised birdsong: no audio files, just Web Audio oscillators and noise.
// Kept deliberately soft: low-ish pitches, slow swells, a little room echo, and a
// compressor so nothing pokes out.
const rand = (a, b) => a + Math.random() * (b - a);

export class BirdSong {
  constructor() {
    this.ctx = null;
    this.on = true;
  }

  // Must be called from a user gesture (tap) — iOS only allows audio after one.
  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      const ctx = (this.ctx = new AC());
      this.out = ctx.createGain();
      this.out.gain.value = this.on ? 0.55 : 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -24;
      comp.knee.value = 20;
      comp.ratio.value = 3;
      comp.attack.value = 0.01;
      comp.release.value = 0.3;
      // everything goes through a gentle low-pass, then dry + room
      this.bus = ctx.createGain();
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 3800;
      tone.Q.value = 0.5;
      const dry = ctx.createGain();
      dry.gain.value = 0.75;
      const wet = ctx.createGain();
      wet.gain.value = 0.4;
      const room = ctx.createConvolver();
      room.buffer = this._roomImpulse(1.8);
      this.bus.connect(tone);
      tone.connect(dry);
      tone.connect(room);
      room.connect(wet);
      dry.connect(comp);
      wet.connect(comp);
      comp.connect(this.out);
      this.out.connect(ctx.destination);
      const noise = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = noise;
      // silent blip unlocks iOS
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, 22050);
      s.connect(ctx.destination);
      s.start(0);
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  setOn(v) {
    this.on = v;
    if (this.ctx) this.out.gain.setTargetAtTime(v ? 0.55 : 0, this.ctx.currentTime, 0.08);
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }

  // dark, decaying noise: a small open-air room
  _roomImpulse(secs) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * secs);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    const fade = ctx.sampleRate * 0.012;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        lp += 0.2 * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.pow(1 - i / n, 3) * Math.min(1, i / fade);
      }
    }
    return buf;
  }

  _voice(pan) {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan)) * 0.7;
      g.connect(p);
      p.connect(this.bus);
    } else g.connect(this.bus);
    return g;
  }

  // one soft chirp: a sine glide with a light vibrato, swelling in and fading out
  _note(t, f0, f1, dur, vol, pan, { vib = 0.012, vibHz = 14, attack = 0.03 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (vib > 0) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = vibHz;
      const depth = ctx.createGain();
      depth.gain.value = f0 * vib;
      lfo.connect(depth);
      depth.connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.4);
    }
    const g = this._voice(pan);
    const a = Math.min(attack, dur * 0.45);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setTargetAtTime(0, t + a, Math.max(0.02, (dur - a) / 3));
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.4);
  }

  _hoot(t, f, dur, vol, pan) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.03, t);
    o.frequency.linearRampToValueAtTime(f, t + dur * 0.3);
    o.frequency.linearRampToValueAtTime(f * 0.92, t + dur);
    const g = this._voice(pan);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.setTargetAtTime(0, t + dur * 0.55, dur * 0.2);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.3);
  }

  // soft wing beats: low filtered noise puffs
  _flutter(t, pan, vol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 620;
    bp.Q.value = 0.6;
    const g = this._voice(pan);
    const beats = 5;
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < beats; i++) {
      const bt = t + i * 0.085;
      g.gain.linearRampToValueAtTime(vol * (1 - i / (beats + 1)), bt + 0.025);
      g.gain.linearRampToValueAtTime(0, bt + 0.075);
    }
    src.connect(bp);
    bp.connect(g);
    src.start(t);
    src.stop(t + beats * 0.085 + 0.1);
  }

  play(kind = 'tweet', pan = 0, vol = 0.1, when = 0) {
    if (!this.ctx || !this.on || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.02 + when;
    switch (kind) {
      case 'tweet': {
        const n = 2 + ((Math.random() * 2) | 0), base = rand(2000, 2800), up = Math.random() < 0.5;
        for (let i = 0; i < n; i++) {
          const f = base * rand(0.96, 1.04);
          this._note(t + i * rand(0.15, 0.22), f, f * (up ? 1.16 : 0.87), rand(0.09, 0.14), vol, pan);
        }
        break;
      }
      case 'warble': {
        const f = rand(2200, 2700), n = 4 + ((Math.random() * 3) | 0);
        for (let i = 0; i < n; i++) this._note(t + i * 0.085, f * (i % 2 ? 1.07 : 1), f * (i % 2 ? 1.02 : 1.05), 0.08, vol * 0.7, pan, { vib: 0.006, attack: 0.02 });
        break;
      }
      case 'whistle': {
        const f = rand(1300, 1750);
        this._note(t, f, f * 1.3, 0.34, vol, pan, { vib: 0.015, vibHz: 6, attack: 0.07 });
        this._note(t + 0.42, f * 1.22, f * 1.05, 0.28, vol * 0.8, pan, { vib: 0.015, vibHz: 6, attack: 0.06 });
        break;
      }
      case 'hoot': {
        const f = rand(360, 400);
        this._hoot(t, f, 0.42, vol * 1.3, pan);
        this._hoot(t + 0.6, f * 0.94, 0.6, vol * 1.3, pan);
        break;
      }
      case 'flutter':
        this._flutter(t, pan, vol);
        break;
      case 'magic':
        // a gentle chime when the mosaic wakes up
        [784, 988, 1175, 1568].forEach((f, i) => this._note(t + i * 0.1, f, f * 1.001, 1.2, vol * 0.5, (i - 1.5) * 0.25, { vib: 0.004, vibHz: 5, attack: 0.05 }));
        break;
    }
  }

  ambient(hasOwl) {
    const r = Math.random();
    const kind = hasOwl && r < 0.1 ? 'hoot' : r < 0.6 ? 'tweet' : r < 0.8 ? 'whistle' : 'warble';
    this.play(kind, rand(-0.7, 0.7), rand(0.05, 0.09));
  }
}
