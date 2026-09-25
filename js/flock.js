import * as THREE from 'three';
import { PAL, NESTS, px2local } from './rig.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeOutBack = (x) => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const hexRGB = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

// Colour schemes echo the painted birds
const SCHEMES = [
  { head: PAL.black, face: PAL.cream, chest: PAL.cream, back: PAL.red, side: PAL.verm, belly: PAL.cream, beak: PAL.ochre,
    wingIn: [PAL.red, PAL.black, PAL.ochre], wingOut: [PAL.black, PAL.ochre, PAL.black, PAL.cream, PAL.black],
    tail: [PAL.black, PAL.ochre, PAL.cream, PAL.ochre, PAL.black] },
  { head: PAL.red, face: PAL.ochre, chest: PAL.cream, back: PAL.orange, side: PAL.ochre, belly: PAL.cream, beak: PAL.black,
    wingIn: [PAL.orange, PAL.ochre, PAL.black], wingOut: [PAL.black, PAL.cream, PAL.black, PAL.ochre, PAL.black],
    tail: [PAL.red, PAL.black, PAL.ochre, PAL.black, PAL.red] },
  { head: PAL.black, face: PAL.cream, chest: PAL.verm, back: PAL.blue, side: PAL.sky, belly: PAL.cream, beak: PAL.orange,
    wingIn: [PAL.blue, PAL.cream, PAL.black], wingOut: [PAL.black, PAL.sky, PAL.black, PAL.cream, PAL.black],
    tail: [PAL.blue, PAL.black, PAL.cream, PAL.black, PAL.blue] },
  { head: PAL.black, face: PAL.cream, chest: PAL.cream, back: PAL.black, side: PAL.orange, belly: PAL.ochre, beak: PAL.orange,
    wingIn: [PAL.black, PAL.ochre, PAL.black], wingOut: [PAL.ochre, PAL.black, PAL.ochre, PAL.black, PAL.ochre],
    tail: [PAL.black, PAL.ochre, PAL.black, PAL.ochre, PAL.black] },
];

// Tessera texture: R = tile (1) / grout (0), G = per-tile shade
function makeTileTexture() {
  const S = 256, N = 8, cs = S / N;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x0 = i * cs, y0 = j * cs, gap = 2.2, jit = () => (rnd() - 0.5) * 2.6;
      g.fillStyle = `rgb(255,${Math.floor(70 + rnd() * 150)},0)`;
      g.beginPath();
      g.moveTo(x0 + gap + jit(), y0 + gap + jit());
      g.lineTo(x0 + cs - gap + jit(), y0 + gap + jit());
      g.lineTo(x0 + cs - gap + jit(), y0 + cs - gap + jit());
      g.lineTo(x0 + gap + jit(), y0 + cs - gap + jit());
      g.closePath();
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function makeBirdMaterial(tiles) {
  return new THREE.ShaderMaterial({
    uniforms: { uTiles: { value: tiles } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      varying vec3 vColor; varying vec3 vPos; varying vec2 vUv;
      void main() {
        vColor = aColor; vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vPos = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uTiles;
      varying vec3 vColor; varying vec3 vPos; varying vec2 vUv;
      void main() {
        vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
        if (dot(n, vPos) > 0.0) n = -n;
        float dif = max(dot(n, normalize(vec3(0.35, 0.85, 0.45))), 0.0);
        float rim = pow(1.0 - max(dot(n, normalize(-vPos)), 0.0), 2.0);
        vec4 t = texture2D(uTiles, vUv);
        float fw = fwidth(vUv.x) + fwidth(vUv.y);
        float tileAmt = 1.0 - smoothstep(0.1, 0.35, fw);          // hide seams when tiles get tiny
        float tile = mix(1.0, smoothstep(0.3, 0.7, t.r), tileAmt);
        vec3 base = vColor * (1.0 + 0.24 * (t.g - 0.55) * tileAmt);
        vec3 c = mix(vColor * 0.38 + 0.05, base, tile);
        c = c * (0.64 + 0.5 * dif) + rim * 0.08;
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.DoubleSide,
    extensions: { derivatives: true },
  });
}

// Build a flat-shaded geometry from triangles [a, b, c, hex]
function trisToGeometry(tris, uvScale = 2.3) {
  const pos = [], col = [], uv = [];
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), T = new THREE.Vector3();
  for (const [a, b, c, hex, shade = 1] of tris) {
    A.fromArray(a); B.fromArray(b); C.fromArray(c);
    N.subVectors(B, A).cross(T.subVectors(C, A)).normalize();
    const ax = Math.abs(N.x), ay = Math.abs(N.y), az = Math.abs(N.z);
    const rgb = hexRGB(hex).map((v) => v * shade);
    for (const P of [A, B, C]) {
      pos.push(P.x, P.y, P.z);
      col.push(...rgb);
      if (ax >= ay && ax >= az) uv.push(P.z * uvScale, P.y * uvScale);
      else if (ay >= az) uv.push(P.x * uvScale, P.z * uvScale);
      else uv.push(P.x * uvScale, P.y * uvScale);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

const mirror = (tris) => tris.map(([a, b, c, h, s]) => [[-a[0], a[1], a[2]], [-c[0], c[1], c[2]], [-b[0], b[1], b[2]], h, s]);
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Bird is modelled facing +z, ~1 unit long, left wing along -x
function buildBirdGeometries(s) {
  const P = {
    tip: [0, 0.03, 0.62], bu: [0, 0.1, 0.42], bl: [-0.045, 0.045, 0.4], br: [0.045, 0.045, 0.4], bd: [0, 0.0, 0.41],
    ht: [0, 0.19, 0.29], hl: [-0.085, 0.08, 0.29], hr: [0.085, 0.08, 0.29], hb: [0, -0.03, 0.3], hf: [0, 0.07, 0.42],
    nape: [0, 0.14, 0.14], cl: [-0.13, 0.0, 0.1], cr: [0.13, 0.0, 0.1], ch: [0, -0.15, 0.1],
    bk: [0, 0.13, -0.04], sl: [-0.115, -0.02, -0.14], sr: [0.115, -0.02, -0.14], bb: [0, -0.11, -0.13], tb: [0, 0.03, -0.34],
  };
  const body = [
    [P.tip, P.bu, P.bl, s.beak], [P.tip, P.br, P.bu, s.beak], [P.tip, P.bl, P.bd, s.beak, 0.8], [P.tip, P.bd, P.br, s.beak, 0.8],
    [P.ht, P.hf, P.hl, s.head], [P.ht, P.hr, P.hf, s.head], [P.ht, P.hl, P.nape, s.head, 0.9], [P.ht, P.nape, P.hr, s.head, 0.9],
    [P.hb, P.hl, P.hf, s.face], [P.hb, P.hf, P.hr, s.face],
    [P.hl, P.cl, P.nape, s.back], [P.hr, P.nape, P.cr, s.back], [P.hl, P.hb, P.cl, s.chest], [P.hr, P.cr, P.hb, s.chest],
    [P.nape, P.cl, P.bk, s.back], [P.nape, P.bk, P.cr, s.back],
    [P.hb, P.ch, P.cl, s.chest], [P.hb, P.cr, P.ch, s.chest],
    [P.cl, P.sl, P.bk, s.side], [P.cr, P.bk, P.sr, s.side], [P.cl, P.ch, P.sl, s.side, 0.85], [P.cr, P.sr, P.ch, s.side, 0.85],
    [P.ch, P.bb, P.sl, s.belly], [P.ch, P.sr, P.bb, s.belly],
    [P.bk, P.sl, P.tb, s.back, 0.9], [P.bk, P.tb, P.sr, s.back, 0.9], [P.sl, P.bb, P.tb, s.belly, 0.8], [P.sr, P.tb, P.bb, s.belly, 0.8],
  ];
  // inner wing: three stripes along the chord
  const L0 = [0, 0, 0.12], L1 = [-0.3, 0, 0.07], T0 = [0, 0, -0.16], T1 = [-0.3, 0, -0.17];
  const inner = [];
  for (let k = 0; k < 3; k++) {
    const a = lerp3(L0, T0, k / 3), b = lerp3(L0, T0, (k + 1) / 3), c = lerp3(L1, T1, (k + 1) / 3), d = lerp3(L1, T1, k / 3);
    inner.push([a, b, c, s.wingIn[k]], [a, c, d, s.wingIn[k]]);
  }
  // outer wing: a striped feather fan from the elbow
  const O = [0, 0, -0.03], lens = [0.3, 0.36, 0.38, 0.36, 0.31, 0.24];
  const arc = lens.map((l, k) => { const th = (160 + k * 16) * Math.PI / 180; return [O[0] + Math.cos(th) * l, 0, O[2] + Math.sin(th) * l]; });
  const outer = [[[0, 0, 0.07], arc[0], O, s.wingOut[0]]];
  for (let k = 0; k < 5; k++) outer.push([O, arc[k], arc[k + 1], s.wingOut[k]]);
  outer.push([O, arc[5], [0, 0, -0.17], s.wingOut[4]]);
  // tail fan
  const tail = [];
  const tarc = [0, 1, 2, 3, 4, 5].map((k) => { const th = (238 + k * 13) * Math.PI / 180; const l = 0.36 - Math.abs(k - 2.5) * 0.03; return [Math.cos(th) * l, 0, Math.sin(th) * l]; });
  for (let k = 0; k < 5; k++) tail.push([[0, 0, 0], tarc[k], tarc[k + 1], s.tail[k]]);
  return {
    body: trisToGeometry(body),
    innerL: trisToGeometry(inner), innerR: trisToGeometry(mirror(inner)),
    outerL: trisToGeometry(outer), outerR: trisToGeometry(mirror(outer)),
    tail: trisToGeometry(tail),
    tailBase: P.tb,
  };
}

class Bird {
  constructor(geo, mat, eyeMats, scheme) {
    this.scheme = scheme;
    const o = new THREE.Group();
    this.obj = o;
    this.model = new THREE.Group();
    o.add(this.model);
    this.model.add(new THREE.Mesh(geo.body, mat));
    const mkWing = (inner, outer, side) => {
      const sh = new THREE.Group();
      sh.position.set(0.1 * side, 0.07, 0.03);
      sh.add(new THREE.Mesh(inner, mat));
      const el = new THREE.Group();
      el.position.set(0.3 * side, 0, 0);
      el.add(new THREE.Mesh(outer, mat));
      sh.add(el);
      this.model.add(sh);
      return { sh, el };
    };
    this.wl = mkWing(geo.innerL, geo.outerL, -1);
    this.wr = mkWing(geo.innerR, geo.outerR, 1);
    this.tail = new THREE.Group();
    this.tail.position.fromArray(geo.tailBase);
    this.tail.rotation.x = 0.1;
    this.tail.add(new THREE.Mesh(geo.tail, mat));
    this.model.add(this.tail);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeMats.discGeo, eyeMats.yellow);
      eye.position.set(0.092 * side, 0.115, 0.3);
      eye.rotation.y = side * Math.PI / 2;
      const pupil = new THREE.Mesh(eyeMats.pupilGeo, eyeMats.black);
      pupil.position.set(0, 0, 0.003);
      eye.add(pupil);
      this.model.add(eye);
    }
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.acc = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.home = new THREE.Vector3();
    this.homePx = [0, 0];
    this.state = 'rest';
    this.stateT = 0;
    this.until = rand(0.5, 2);
    this.phase = rand(0, 6.28);
    this.flap = 1;
    this.bank = 0;
    this.size = rand(0.12, 0.15);
    this.nextTarget = 0;
    this.nextTrail = 0;
    o.visible = false;
  }
}

class TileBits {
  constructor(max = 420) {
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.max = max;
    this.p = Array.from({ length: max }, () => ({ life: 0, max: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), axis: new THREE.Vector3(1, 0, 0), ang: 0, spin: 0, w: 0.01, h: 0.01 }));
    this.i = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
    for (let k = 0; k < max; k++) {
      this.mesh.setMatrixAt(k, this.m.makeScale(0, 0, 0));
      this.mesh.setColorAt(k, this.c.setHex(PAL.ochre));
    }
  }
  emit(at, n, colors, speed = 0.35, dir = null) {
    for (let k = 0; k < n; k++) {
      const p = this.p[this.i];
      this.mesh.setColorAt(this.i, this.c.setHex(colors[(Math.random() * colors.length) | 0]));
      this.i = (this.i + 1) % this.max;
      p.pos.copy(at);
      p.vel.set(rand(-1, 1), rand(-0.6, 1), rand(-0.3, 1)).normalize().multiplyScalar(speed * rand(0.3, 1));
      if (dir) p.vel.addScaledVector(dir, 0.6);
      p.axis.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      p.ang = rand(0, 6.28);
      p.spin = rand(-9, 9);
      p.max = p.life = rand(0.9, 1.8);
      p.w = rand(0.008, 0.014);
      p.h = p.w * rand(0.75, 1.25);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    for (let k = 0; k < this.max; k++) {
      const p = this.p[k];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vel.y -= 0.45 * dt;
      p.vel.multiplyScalar(1 - 1.4 * dt);
      p.pos.addScaledVector(p.vel, dt);
      p.ang += p.spin * dt;
      const f = p.life <= 0 ? 0 : Math.min(1, p.life / 0.45);
      this.q.setFromAxisAngle(p.axis, p.ang);
      this.s.set(p.w * f, p.h * f, 1);
      this.mesh.setMatrixAt(k, this.m.compose(p.pos, this.q, this.s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Flock {
  constructor({ count = 5, onEvent = () => {} } = {}) {
    this.group = new THREE.Group();
    this.onEvent = onEvent;
    const tiles = makeTileTexture();
    const mat = makeBirdMaterial(tiles);
    const eyeMats = {
      discGeo: new THREE.CircleGeometry(0.036, 14), pupilGeo: new THREE.CircleGeometry(0.018, 10),
      yellow: new THREE.MeshBasicMaterial({ color: PAL.ochre, side: THREE.DoubleSide }),
      black: new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide }),
    };
    const geos = SCHEMES.map(buildBirdGeometries);
    this.birds = [];
    for (let i = 0; i < count; i++) {
      const scheme = i % SCHEMES.length;
      const b = new Bird(geos[scheme], mat, eyeMats, scheme);
      b.geos = geos;
      b.until = 1.3 + i * 1.3;
      this.group.add(b.obj);
      this.birds.push(b);
    }
    this.bits = new TileBits();
    this.group.add(this.bits.mesh);
    this.active = false;
    this.used = new Set();
    this.box = { x: 0.62, yMin: -0.5, yMax: 0.62, zMin: 0.12, zMax: 0.62 };
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
    this._t = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this._fw = new THREE.Vector3();
  }

  start(t) {
    this.active = true;
    this.birds.forEach((b, i) => {
      if (b.state === 'rest') { b.stateT = t; b.until = 1.2 + i * 1.3; }
    });
  }

  stop() {
    this.active = false;
    for (const b of this.birds) { b.state = 'rest'; b.obj.visible = false; b.until = 1; }
    this.used.clear();
  }

  pickNest(near) {
    let best = null, bestD = Infinity;
    const free = NESTS.map((n, i) => i).filter((i) => !this.used.has(i));
    const pool = free.length ? free : NESTS.map((n, i) => i);
    if (near) {
      for (const i of pool) { const d = Math.hypot(NESTS[i].c[0] - near[0], NESTS[i].c[1] - near[1]); if (d < bestD) { bestD = d; best = i; } }
      return best;
    }
    return pool[(Math.random() * pool.length) | 0];
  }

  // Launch a bird from the painted bird closest to (px, py); used for taps
  launchFrom(t, px, py) {
    const b = this.birds.find((x) => x.state === 'rest') || null;
    if (!b) return false;
    this._emerge(b, t, this.pickNest([px, py]));
    return true;
  }

  _setScheme(b, scheme) {
    if (b.scheme === scheme) return;
    // swap geometries to repaint the bird
    const g = b.geos[scheme];
    b.model.children[0].geometry = g.body;
    b.wl.sh.children[0].geometry = g.innerL; b.wl.el.children[0].geometry = g.outerL;
    b.wr.sh.children[0].geometry = g.innerR; b.wr.el.children[0].geometry = g.outerR;
    b.tail.children[0].geometry = g.tail;
    b.scheme = scheme;
  }

  _colors(b) {
    const s = SCHEMES[b.scheme];
    return [s.head, s.back, s.side, s.chest, ...s.wingOut, ...s.wingIn];
  }

  _emerge(b, t, nestIndex) {
    const nest = NESTS[nestIndex];
    this.used.add(nestIndex);
    b.nest = nestIndex;
    this._setScheme(b, nest.scheme);
    const [x, y] = px2local(nest.c[0], nest.c[1]);
    b.home.set(x, y, 0);
    b.homePx = nest.c;
    b.pos.set(x, y, -0.03);
    b.vel.set(rand(-0.1, 0.1), 0.18, 0.35);
    b.state = 'emerge';
    b.stateT = t;
    b.until = t + 0.8;
    b.obj.visible = true;
    this.bits.emit(this._t.set(x, y, 0.01), 26, this._colors(b), 0.4, this._r.set(0, 0, 0.5));
    this.onEvent('emerge', b);
  }

  update(t, dt, camLocal) {
    dt = Math.min(dt, 0.05);
    const box = this.box;
    for (const b of this.birds) {
      if (b.state === 'rest') {
        if (this.active && t > b.stateT + b.until) this._emerge(b, t, this.pickNest());
        continue;
      }
      let scale = 1;
      if (b.state === 'emerge') {
        const u = clamp01((t - b.stateT) / 0.8);
        b.pos.set(b.home.x, b.home.y + 0.04 * easeOut(u), -0.03 + 0.19 * easeOut(u));
        scale = 0.25 + 0.75 * easeOutBack(u);
        b.flap = 1.4;
        if (u >= 1) {
          b.state = 'fly'; b.stateT = t; b.until = t + rand(9, 16);
          b.vel.set(rand(-0.2, 0.2), 0.12, 0.22);
          b.nextTarget = 0;
        }
      } else if (b.state === 'fly' || b.state === 'return') {
        const acc = b.acc.set(0, 0, 0);
        if (b.state === 'fly') {
          if (t > b.nextTarget) {
            b.target.set(rand(-box.x, box.x) * 0.9, rand(box.yMin, box.yMax) * 0.9, rand(box.zMin + 0.03, box.zMax));
            if (camLocal && Math.random() < 0.18) b.target.copy(camLocal).multiplyScalar(0.55).setZ(Math.min(camLocal.z * 0.55, 0.7));
            b.nextTarget = t + rand(1.6, 3.4);
          }
          if (t > b.until || !this.active) { b.state = 'return'; b.target.set(b.home.x, b.home.y, 0.12); }
        }
        const want = this._t.subVectors(b.target, b.pos);
        const dist = want.length();
        const cruise = b.state === 'return' ? Math.max(0.12, Math.min(0.32, dist * 1.4)) : 0.3;
        want.multiplyScalar(cruise / Math.max(dist, 1e-4)).sub(b.vel);
        const maxF = b.state === 'return' ? 1.3 : 0.85;
        if (want.length() > maxF) want.setLength(maxF);
        acc.add(want);
        for (const o of this.birds) {
          if (o === b || o.state !== 'fly') continue;
          const d = this._r.subVectors(b.pos, o.pos);
          const l = d.length();
          if (l < 0.14 && l > 1e-4) acc.addScaledVector(d, (0.14 - l) * 9 / l);
        }
        if (camLocal) {
          const d = this._r.subVectors(b.pos, camLocal);
          const l = d.length();
          if (l < 0.32) acc.addScaledVector(d, (0.32 - l) * 7 / l);
        }
        if (b.state === 'fly' && b.pos.z < 0.07) acc.z += (0.07 - b.pos.z) * 18;
        b.vel.addScaledVector(acc, dt);
        const sp = b.vel.length();
        const lo = b.state === 'return' ? 0.05 : 0.16;
        if (sp > 0.46) b.vel.multiplyScalar(0.46 / sp); else if (sp < lo) b.vel.multiplyScalar(lo / Math.max(sp, 1e-4));
        b.pos.addScaledVector(b.vel, dt);
        const right = this._r.crossVectors(this._fw.copy(b.vel).normalize(), this._up).normalize();
        const bankT = Math.max(-0.9, Math.min(0.9, -acc.dot(right) * 0.9));
        b.bank += (bankT - b.bank) * (1 - Math.exp(-dt * 5));
        const flapT = b.vel.y < -0.07 ? 0.15 : 1;
        b.flap += (flapT - b.flap) * (1 - Math.exp(-dt * 3));
        if (b.state === 'return' && dist < 0.035) {
          b.state = 'merge'; b.stateT = t;
          this.bits.emit(this._t.set(b.home.x, b.home.y, 0.02), 18, this._colors(b), 0.3);
          this.onEvent('merge', b);
        }
        if (t > b.nextTrail) {
          this.bits.emit(b.pos, 1, this._colors(b), 0.05);
          b.nextTrail = t + rand(0.12, 0.3);
        }
      } else if (b.state === 'merge') {
        const u = clamp01((t - b.stateT) / 0.55);
        b.pos.lerp(this._t.set(b.home.x, b.home.y, -0.03), 1 - Math.exp(-dt * 9));
        scale = 1 - 0.8 * easeOut(u);
        b.flap = 1.2;
        if (u >= 1) {
          b.state = 'rest'; b.stateT = t; b.until = rand(1.5, 5); b.obj.visible = false;
          this.used.delete(b.nest);
          continue;
        }
      }

      // pose
      const fw = this._fw.copy(b.vel);
      if (fw.lengthSq() < 1e-6) fw.set(0, 0, 1);
      fw.normalize();
      this._m.lookAt(this._t.addVectors(b.pos, fw), b.pos, this._up);
      b.obj.quaternion.setFromRotationMatrix(this._m);
      b.obj.quaternion.multiply(this._q.setFromAxisAngle(this._fw.set(0, 0, 1), b.bank));
      b.phase += dt * 6.2832 * (b.state === 'emerge' || b.state === 'merge' ? 10 : 7.5);
      const wing = (0.2 + 0.75 * Math.sin(b.phase)) * b.flap + 0.3 * (1 - Math.min(1, b.flap));
      const tip = 0.5 * Math.sin(b.phase - 0.7) * b.flap;
      b.wl.sh.rotation.z = -wing; b.wl.el.rotation.z = -tip;
      b.wr.sh.rotation.z = wing; b.wr.el.rotation.z = tip;
      b.tail.scale.x = 0.9 + 0.2 * Math.sin(b.phase * 0.25);
      b.obj.position.copy(b.pos);
      b.obj.position.y += 0.004 * Math.sin(b.phase + Math.PI) * b.flap;
      b.obj.scale.setScalar(b.size * scale);
    }
    this.bits.update(dt);
  }
}
