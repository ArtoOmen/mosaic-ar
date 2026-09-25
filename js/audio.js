// Synthesised birdsong: no audio files, just Web Audio oscillators and noise.
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
      this.out.gain.value = this.on ? 0.9 : 0;
      this.bus = ctx.createGain();
      // a little air: filtered feedback echo
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.17;
      const fb = ctx.createGain();
      fb.gain.value = 0.25;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      this.bus.connect(this.out);
      this.bus.connect(delay);
      delay.connect(lp);
      lp.connect(fb);
      fb.connect(delay);
      lp.connect(this.out);
      this.out.connect(ctx.destination);
      const noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
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
    if (this.ctx) this.out.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }

  _voice(pan) {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      p.connect(this.bus);
    } else g.connect(this.bus);
    return g;
  }

  _note(t, f0, f1, dur, vol, pan, type = 'sine') {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this._voice(pan);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.012, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  _hoot(t, f, dur, vol, pan) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.04, t);
    o.frequency.linearRampToValueAtTime(f, t + dur * 0.3);
    o.frequency.linearRampToValueAtTime(f * 0.9, t + dur);
    const g = this._voice(pan);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.25);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _flutter(t, pan, vol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 0.7;
    const g = this._voice(pan);
    const beats = 6;
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < beats; i++) {
      const bt = t + i * 0.065;
      g.gain.linearRampToValueAtTime(vol * (1 - i / beats), bt + 0.012);
      g.gain.linearRampToValueAtTime(0.0001, bt + 0.05);
    }
    src.connect(bp);
    bp.connect(g);
    src.start(t);
    src.stop(t + beats * 0.065 + 0.05);
  }

  play(kind = 'tweet', pan = 0, vol = 0.16) {
    if (!this.ctx || !this.on || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.01;
    switch (kind) {
      case 'tweet': {
        const n = 2 + ((Math.random() * 3) | 0), base = rand(2600, 4200), up = Math.random() < 0.5;
        for (let i = 0; i < n; i++) {
          const f = base * rand(0.94, 1.06);
          this._note(t + i * rand(0.09, 0.14), f, f * (up ? 1.35 : 0.72), rand(0.05, 0.09), vol, pan);
        }
        break;
      }
      case 'trill': {
        const f = rand(3000, 4400), n = 8 + ((Math.random() * 6) | 0);
        for (let i = 0; i < n; i++) this._note(t + i * 0.034, f * (1 + 0.06 * Math.sin(i * 1.7)), f * 1.12, 0.026, vol * 0.75, pan);
        break;
      }
      case 'whistle': {
        const f = rand(1700, 2300);
        this._note(t, f, f * 1.6, 0.22, vol, pan);
        this._note(t + 0.28, f * 1.5, f * 1.1, 0.18, vol * 0.8, pan);
        break;
      }
      case 'hoot': {
        const f = rand(380, 420);
        this._hoot(t, f, 0.36, vol * 1.4, pan);
        this._hoot(t + 0.52, f * 0.94, 0.55, vol * 1.4, pan);
        break;
      }
      case 'flutter':
        this._flutter(t, pan, vol * 1.2);
        break;
      case 'magic':
        [1046.5, 1318.5, 1568, 2093, 2637].forEach((f, i) => this._note(t + i * 0.075, f, f * 1.002, 0.7, vol * 0.45, (i - 2) * 0.3, 'triangle'));
        break;
    }
  }

  ambient(hasOwl) {
    const r = Math.random();
    const kind = hasOwl && r < 0.1 ? 'hoot' : r < 0.55 ? 'tweet' : r < 0.78 ? 'trill' : 'whistle';
    this.play(kind, rand(-0.7, 0.7), rand(0.08, 0.15));
  }
}
