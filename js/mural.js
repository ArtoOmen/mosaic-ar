import * as THREE from 'three';
import { IMG, EYES, BONES, px2local } from './rig.js';

const NB = BONES.length;
const NE = EYES.length;
const NP = 6; // simultaneous glow pulses
const DEG = Math.PI / 180;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOutBack = (x) => { const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const easeInOut = (x) => x * x * (3 - 2 * x);

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = /* glsl */ `
precision highp float;
#define NB ${NB}
#define NE ${NE}
#define NP ${NP}
uniform sampler2D uMap;
uniform sampler2D uMask;      // r = flexible (inside panels), g = overlay alpha, b = panel
uniform vec2 uSize;
uniform float uTime;
uniform float uLive;          // 0..1 how awake the mosaic is
uniform float uReveal;        // 0..1 activation wave
uniform vec2 uRevealC;
uniform float uOpacity;
uniform float uFull;          // 1 = draw the whole picture (demo), 0 = only the mural (AR)
uniform vec2 uView;           // viewing direction, drives the glass sheen
uniform vec4 uBoneA[NB];      // pivot.xy, centre.xy   (pivot.x < 0 => translation bone)
uniform vec4 uBoneB[NB];      // radius.xy, angle, scale | shift.xy
uniform vec4 uEyeA[NE];       // centre.xy, R, -
uniform vec4 uEyeB[NE];       // pupil offset.xy (px), lid 0..1, -
uniform vec3 uEyeC[NE];       // lid colour
uniform vec4 uPulse[NP];      // centre.xy, radius, strength
varying vec2 vUv;

vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uSize;
  vec4 m = texture2D(uMask, vUv);
  float flex = m.r * uLive;

  // puppet warp: sum of soft local rotations / scales / shifts (inverse mapping)
  vec2 disp = vec2(0.0);
  for (int i = 0; i < NB; i++) {
    vec4 A = uBoneA[i];
    vec4 B = uBoneB[i];
    vec2 d = (p - A.zw) / B.xy;
    if (abs(d.x) > 1.6 || abs(d.y) > 1.6) continue;
    float dd = dot(d, d);
    float w = exp(-dd * dd * 1.2);   // flat-topped falloff: parts turn almost rigidly
    if (A.x < 0.0) {
      disp -= B.zw * w;
    } else {
      vec2 q = A.xy + rot(p - A.xy, -B.z * w) / (1.0 + B.w * w);
      disp += q - p;
    }
  }
  vec2 src = p + disp * flex;

  // eyes: pupils follow the viewer, lids blink
  float lidMix = 0.0;
  float lash = 0.0;
  vec3 lidCol = vec3(0.0);
  for (int i = 0; i < NE; i++) {
    vec4 E = uEyeA[i];
    vec4 S = uEyeB[i];
    vec2 d = (src - E.xy) / E.z;
    if (abs(d.x) > 1.4 || abs(d.y) > 1.4) continue;
    float r = length(d);
    float k = 1.0 - smoothstep(0.5, 0.92, r);
    src -= S.xy * k * uLive;
    float on = step(0.001, S.z) * uLive;
    float edge = mix(-1.3, 1.25, S.z) + 0.28 * d.x * d.x;
    float inside = 1.0 - smoothstep(1.0, 1.16, r);
    float cover = smoothstep(edge + 0.08, edge - 0.08, d.y) * inside * on;
    lidMix = max(lidMix, cover);
    lidCol = mix(lidCol, uEyeC[i], cover);
    lash = max(lash, (1.0 - smoothstep(0.0, 0.15, abs(d.y - edge))) * inside * on * step(S.z, 0.97));
  }

  vec3 col = texture2D(uMap, vec2(src.x / uSize.x, 1.0 - src.y / uSize.y)).rgb;
  col = mix(col, lidCol, lidMix);
  col = mix(col, vec3(0.06), lash * 0.85);

  // smalti glass: a slow sheen plus a few twinkling tiles (only on the mosaic)
  float panel = m.b * uLive;
  vec2 n = p / uSize.x;
  float sweep = fract(uTime * 0.055) * 2.6 - 0.7 + uView.x * 0.35 + uView.y * 0.25;
  float sheen = exp(-pow((dot(n, vec2(0.83, 0.55)) - sweep) * 6.5, 2.0));
  vec2 cell = floor(p / 9.0);
  float h = hash(cell);
  vec2 gp = (cell + 0.25 + 0.5 * vec2(hash(cell + 7.1), hash(cell + 3.7))) * 9.0;   // glint position in the cell
  vec2 gd = p - gp;
  float star = exp(-dot(gd, gd) / 2.2) + 0.5 * exp(-abs(gd.x) * 1.4 - gd.y * gd.y * 1.5) + 0.5 * exp(-abs(gd.y) * 1.4 - gd.x * gd.x * 1.5);
  float tw = step(0.965, h) * pow(max(0.0, sin(uTime * 1.3 + h * 91.0 + uView.x * 16.0 - uView.y * 11.0)), 24.0) * star;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col += panel * (sheen * 0.14 * (0.35 + lum) + tw * vec3(1.0, 0.95, 0.85) * 0.75);

  // glowing rings where a bird leaves or comes back
  for (int i = 0; i < NP; i++) {
    vec4 P = uPulse[i];
    if (P.w <= 0.0) continue;
    float d = length(p - P.xy) / P.z;
    float ring = exp(-pow((d - (1.0 - P.w) * 1.5) * 3.5, 2.0)) * P.w;
    col += vec3(1.0, 0.86, 0.55) * ring * 0.6 * m.b;
  }

  // activation wave
  float dr = length(p - uRevealC) / uSize.x;
  float front = uReveal * 0.9;
  float shown = smoothstep(front, front - 0.07, dr);
  float wave = exp(-pow((dr - front) * 20.0, 2.0)) * (1.0 - smoothstep(0.8, 1.0, uReveal)) * step(0.001, uReveal);
  col += vec3(1.0, 0.88, 0.6) * wave;
  float alpha = mix(m.g, 1.0, uFull) * max(shown, wave * 0.9) * uOpacity;
  gl_FragColor = vec4(col, alpha);
}`;

export class LivingMural {
  constructor({ map, mask, full = false }) {
    this.aspect = IMG.h / IMG.w;
    const u = {
      uMap: { value: map }, uMask: { value: mask },
      uSize: { value: new THREE.Vector2(IMG.w, IMG.h) },
      uTime: { value: 0 }, uLive: { value: 0 }, uReveal: { value: 0 },
      uRevealC: { value: new THREE.Vector2(IMG.w / 2, IMG.h / 2) },
      uOpacity: { value: 1 }, uFull: { value: full ? 1 : 0 },
      uView: { value: new THREE.Vector2() },
      uBoneA: { value: BONES.map(() => new THREE.Vector4()) },
      uBoneB: { value: BONES.map(() => new THREE.Vector4()) },
      uEyeA: { value: EYES.map((e) => new THREE.Vector4(e.c[0], e.c[1], e.R, 0)) },
      uEyeB: { value: EYES.map(() => new THREE.Vector4()) },
      uEyeC: { value: EYES.map((e) => new THREE.Vector3(e.lid[0] / 255, e.lid[1] / 255, e.lid[2] / 255)) },
      uPulse: { value: Array.from({ length: NP }, () => new THREE.Vector4()) },
    };
    this.uniforms = u;
    this.material = new THREE.ShaderMaterial({
      uniforms: u, vertexShader, fragmentShader, transparent: true, depthWrite: true,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, this.aspect), this.material);

    this.bones = BONES.map((b, i) => {
      const s = { ...b, cur: 0, from: 0, to: 0, t0: 0, dur: 0.1, next: rand(0.3, 2.5), phase: rand(0, 6.28), phase2: rand(0, 6.28), burst: -10, burstDur: 0, freq: 7 };
      const A = u.uBoneA.value[i], B = u.uBoneB.value[i];
      if (b.t === 'bob') A.set(-1, -1, b.c[0], b.c[1]);
      else A.set((b.p || b.c)[0], (b.p || b.c)[1], b.c[0], b.c[1]);
      B.set(b.r[0], b.r[1], 0, 0);
      return s;
    });

    // eyes blink in groups (the owl blinks with both eyes)
    const groups = new Map();
    this.eyes = EYES.map((e, i) => {
      const key = e.g || e.id;
      if (!groups.has(key)) groups.set(key, { next: rand(0.8, 4), t0: -10, dur: 0.16, twice: false, slow: key === 'owl' });
      const [lx, ly] = px2local(e.c[0], e.c[1]);
      return { ...e, i, grp: groups.get(key), local: new THREE.Vector3(lx, ly, 0), off: new THREE.Vector2(), sac: new THREE.Vector2(), sacNext: rand(0.5, 2) };
    });
    this.blinkGroups = [...groups.values()];

    this.live = 0;
    this.liveTarget = 0;
    this.revealT0 = -1;
    this.pulses = [];
    this._v = new THREE.Vector3();
  }

  // Start the activation wave from a point on the picture (px). instant = skip the wave.
  awaken(t, cx = IMG.w / 2, cy = IMG.h / 2, instant = false) {
    this.uniforms.uRevealC.value.set(cx, cy);
    this.revealT0 = instant ? t - 10 : t;
    this.liveTarget = 1;
    if (instant) this.live = Math.max(this.live, 0.6);
  }

  sleep() { this.revealT0 = -1; this.liveTarget = 0; this.live = 0; this.uniforms.uReveal.value = 0; this.uniforms.uLive.value = 0; }

  pulse(x, y, radius = 70) {
    this.pulses.push({ x, y, radius, t: 0, dur: 0.9 });
    if (this.pulses.length > NP) this.pulses.shift();
  }

  update(t, dt, camLocal) {
    const u = this.uniforms;
    u.uTime.value = t;

    // activation wave, then the birds wake up
    if (this.revealT0 >= 0) {
      const r = clamp01((t - this.revealT0) / 1.5);
      u.uReveal.value = r;
      if (r > 0.55 && this.liveTarget > 0) this.live = Math.min(1, this.live + dt / 0.9);
    }
    u.uLive.value = easeInOut(this.live);

    // bones
    for (let i = 0; i < this.bones.length; i++) {
      const b = this.bones[i];
      const B = u.uBoneB.value[i];
      let ang = 0, scale = 0, shift = 0;
      switch (b.t) {
        case 'head':
        case 'owl': {
          const owl = b.t === 'owl';
          if (t > b.next) {
            b.from = b.cur;
            const roll = Math.random();
            b.to = roll < 0.22 ? 0 : rand(-b.a, b.a) * (owl ? 1 : rand(0.55, 1));
            b.t0 = t;
            b.dur = owl ? rand(0.35, 0.6) : rand(0.08, 0.16);
            b.next = t + b.dur + (owl ? rand(1.4, 3.8) : (Math.random() < 0.25 ? rand(0.15, 0.3) : rand(0.5, 2.4)));
          }
          const x = clamp01((t - b.t0) / b.dur);
          b.cur = b.from + (b.to - b.from) * (owl ? easeInOut(x) : easeOutBack(x));
          ang = b.cur * DEG;
          break;
        }
        case 'flap': {
          if (t > b.next) {
            b.burst = t; b.burstDur = rand(0.45, 1.1); b.freq = rand(6, 9);
            b.next = t + b.burstDur + rand(2.2, 6.5);
          }
          const x = (t - b.burst) / b.burstDur;
          const env = x >= 0 && x <= 1 ? Math.sin(Math.PI * x) : 0;
          ang = (b.a * env * Math.sin(6.2832 * b.freq * (t - b.burst)) + b.a * 0.12 * Math.sin(t * 4.4 + b.phase)) * DEG;
          break;
        }
        case 'sway':
          ang = b.a * (0.8 * Math.sin(6.2832 * b.f * t + b.phase) + 0.2 * Math.sin(6.2832 * b.f * 2.3 * t + b.phase2)) * DEG;
          break;
        case 'bob':
          shift = b.a * Math.sin(6.2832 * b.f * t + b.phase);
          break;
        case 'breath':
          scale = b.a * Math.sin(t * 2.2 + b.phase);
          break;
      }
      if (b.t === 'bob') { B.z = 0; B.w = shift; } else { B.z = ang; B.w = scale; }
    }

    // eyes: look at the viewer, with small saccades
    const view = u.uView.value;
    view.set(0, 0);
    for (const e of this.eyes) {
      let lx = 0, ly = 0;
      if (camLocal) {
        this._v.subVectors(camLocal, e.local);
        if (this._v.z > 0.05) { lx = this._v.x / this._v.z; ly = this._v.y / this._v.z; }
      }
      if (t > e.sacNext) {
        const a = rand(0, 6.28), m = Math.random() < 0.35 ? 0 : rand(0.15, 0.55);
        e.sac.set(Math.cos(a) * m, Math.sin(a) * m);
        e.sacNext = t + rand(0.6, 2.8);
      }
      let gx = lx * 1.6 + e.sac.x, gy = ly * 1.6 + e.sac.y;
      const len = Math.hypot(gx, gy);
      if (len > 1) { gx /= len; gy /= len; }
      const k = 1 - Math.exp(-dt * 14);
      e.off.x += (gx * 0.3 * e.R - e.off.x) * k;
      e.off.y += (-gy * 0.3 * e.R - e.off.y) * k;
      u.uEyeB.value[e.i].x = e.off.x;
      u.uEyeB.value[e.i].y = e.off.y;
      view.x += lx; view.y += ly;
    }
    view.multiplyScalar(1 / this.eyes.length);

    for (const g of this.blinkGroups) {
      if (t > g.next) {
        g.t0 = t;
        g.dur = g.slow ? rand(0.28, 0.4) : rand(0.12, 0.18);
        g.twice = Math.random() < 0.2;
        g.next = t + (g.twice ? g.dur * 2.2 : g.dur) + rand(1.6, 5.5);
      }
    }
    for (const e of this.eyes) {
      const g = e.grp;
      const total = g.twice ? g.dur * 2.2 : g.dur;
      let x = (t - g.t0);
      let lid = 0;
      if (x >= 0 && x <= total) {
        if (g.twice && x > g.dur * 1.2) x -= g.dur * 1.2;
        lid = x <= g.dur ? Math.sin(Math.PI * x / g.dur) : 0;
      }
      u.uEyeB.value[e.i].z = lid;
    }

    // pulses
    const P = u.uPulse.value;
    for (let i = 0; i < NP; i++) P[i].w = 0;
    this.pulses = this.pulses.filter((p) => (p.t += dt) < p.dur);
    this.pulses.forEach((p, i) => P[i].set(p.x, p.y, p.radius, 1 - p.t / p.dur));
  }
}
