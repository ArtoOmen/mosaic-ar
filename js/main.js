import * as THREE from 'three';
import { LivingMural } from './mural.js';
import { Flock } from './flock.js';
import { BirdSong } from './audio.js';
import { loadManifest } from './rig.js';

const $ = (s) => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- i18n
const I18N = {
  ru: {
    chip: 'Дополненная реальность · без приложения',
    title: 'Живая <em>мозаика</em>',
    lead: 'Наведите камеру на мозаику — птицы проснутся, начнут крутить головами, моргать и вылетать прямо из стены.',
    start: 'Оживить птиц', demo: 'Посмотреть без камеры',
    note: 'Работает прямо в браузере. Включите звук — птицы поют.',
    phoneTitle: 'Откройте на телефоне',
    step1: 'Отсканируйте QR-код камерой телефона', step2: 'Нажмите «Оживить птиц» и разрешите камеру', step3: 'Наведите телефон на картинку на экране',
    standCaption: 'Наведите телефон на эту картинку — птицы оживут',
    noMural: 'Мозаики рядом нет? Откройте эту же ссылку на компьютере и наведите телефон на экран — или посмотрите без камеры.',
    posterLink: 'Плакат с QR-кодом для печати →',
    loadingCam: 'Запускаем камеру…', loadingAR: 'Учимся узнавать мозаику…', loadingDemo: 'Будим птиц…',
    scan: 'Наведите камеру на мозаику', scanSub: 'Поместите её целиком в рамку',
    awake: 'Птицы проснулись! Коснитесь птицы — она вылетит',
    demoToast: 'Коснитесь птицы — она вылетит. Двигайте телефон или мышь, чтобы заглянуть сбоку',
    demoBadge: 'Демо без камеры',
    errTitle: 'Нет доступа к камере',
    errDenied: 'Разрешите этому сайту доступ к камере (в настройках браузера или по значку «аА» / замка в адресной строке) и попробуйте снова.',
    errInsecure: 'Камера работает только по защищённой ссылке https://.',
    errNoCam: 'На этом устройстве не нашлось камеры.',
    errBusy: 'Камера занята другим приложением. Закройте его и попробуйте снова.',
    errInApp: 'Похоже, ссылка открыта во встроенном браузере приложения. Откройте её в Safari или Chrome — там камера работает.',
    errGeneric: 'Не удалось запустить дополненную реальность на этом устройстве.',
    retry: 'Попробовать снова', close: 'Закрыть', sound: 'Звук', other: 'Другая мозаика',
  },
  en: {
    chip: 'Augmented reality · no app needed',
    title: 'Living <em>mosaic</em>',
    lead: 'Point your camera at the mosaic — the birds wake up, turn their heads, blink and fly right out of the wall.',
    start: 'Wake the birds', demo: 'Watch without camera',
    note: 'Runs right in your browser. Turn the sound on — the birds sing.',
    phoneTitle: 'Open on your phone',
    step1: 'Scan the QR code with your phone camera', step2: 'Tap “Wake the birds” and allow the camera', step3: 'Point the phone at the picture on this screen',
    standCaption: 'Point your phone at this picture — the birds come alive',
    noMural: 'No mosaic nearby? Open this same link on a computer and point the phone at the screen — or watch without camera.',
    posterLink: 'Printable QR poster →',
    loadingCam: 'Starting the camera…', loadingAR: 'Learning the mosaic…', loadingDemo: 'Waking the birds…',
    scan: 'Point the camera at the mosaic', scanSub: 'Fit the whole mosaic in the frame',
    awake: 'The birds are awake! Tap a bird to make it fly',
    demoToast: 'Tap a bird to make it fly. Tilt the phone or move the mouse to look around',
    demoBadge: 'Demo without camera',
    errTitle: 'No camera access',
    errDenied: 'Allow this site to use the camera (browser settings or the lock icon in the address bar) and try again.',
    errInsecure: 'The camera only works over a secure https:// link.',
    errNoCam: 'No camera was found on this device.',
    errBusy: 'The camera is busy in another app. Close it and try again.',
    errInApp: 'Looks like this link opened inside an app. Open it in Safari or Chrome — the camera works there.',
    errGeneric: 'Could not start augmented reality on this device.',
    retry: 'Try again', close: 'Close', sound: 'Sound', other: 'Another mosaic',
  },
};
const lang = qs.get('lang') === 'en' ? 'en' : 'ru';
const T = I18N[lang] || I18N.ru;
document.documentElement.lang = lang;
document.querySelectorAll('[data-i18n]').forEach((el) => { const v = T[el.dataset.i18n]; if (v) el.textContent = v; });
document.querySelectorAll('[data-i18n-html]').forEach((el) => { const v = T[el.dataset.i18nHtml]; if (v) el.innerHTML = v; });
$('#btnClose').setAttribute('aria-label', T.close);
$('#btnSound').setAttribute('aria-label', T.sound);
$('#btnSwitch').setAttribute('aria-label', T.other);

// ---------------------------------------------------------------- UI helpers
const screens = ['#intro', '#loading', '#error'];
function show(id) { screens.forEach((s) => $(s).classList.toggle('hidden', s !== id)); }
function hideScreens() { screens.forEach((s) => $(s).classList.add('hidden')); }
let toastTimer = 0;
function toast(text, ms = 4200) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
function setLoading(text) { $('#loadingText').textContent = text; show('#loading'); }

// QR for desktop visitors: open the same page on a phone
(function drawQR() {
  if (typeof window.qrcode !== 'function') return;
  const url = new URL('./', location.href).href;
  const qr = window.qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
  $('#qr').innerHTML = `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path d="${d}" fill="#12100e"/></svg>`;
})();

// ---------------------------------------------------------------- shared world
const song = new BirdSong();
let assetsP = null;
function loadAssets() {
  assetsP = assetsP || (async () => {
    const targets = await loadManifest();
    const L = new THREE.TextureLoader();
    await Promise.all(targets.map(async (t) => {
      const [map, mask] = await Promise.all([L.loadAsync(t.dir + 'mural.jpg'), L.loadAsync(t.dir + 'mask.png')]);
      for (const x of [map, mask]) { x.colorSpace = THREE.NoColorSpace; x.anisotropy = 4; }
      Object.assign(t, { map, mask });
    }));
    return targets;
  })().catch((e) => { assetsP = null; throw e; });
  return assetsP;
}

function buildWorld(parent, target, { count }) {
  const mural = new LivingMural({ map: target.map, mask: target.mask, rig: target.rig });
  const flock = new Flock({
    count,
    rig: target.rig,
    onEvent(type, b) {
      const pan = Math.max(-1, Math.min(1, b.pos.x * 1.8));
      if (type === 'emerge') {
        song.play('flutter', pan, 0.12);
        song.play(b.scheme === 3 ? 'whistle' : Math.random() < 0.5 ? 'tweet' : 'trill', pan, 0.17);
        mural.pulse(b.homePx[0], b.homePx[1], 85);
      } else if (type === 'merge') {
        song.play('flutter', pan, 0.1);
        mural.pulse(b.homePx[0], b.homePx[1], 65);
      }
    },
  });
  parent.add(mural.mesh);
  parent.add(flock.group);
  return { mural, flock, target };
}

function disposeWorld(world) {
  for (const root of [world.mural.mesh, world.flock.group]) {
    root.parent && root.parent.remove(root);
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}

// Tap a painted bird: ripple + one of the birds flies out of it
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function tapWorld(ev, camera, world, t) {
  ndc.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(world.mural.mesh, false)[0];
  if (!hit || !hit.uv) return;
  const { rig } = world.target;
  const px = hit.uv.x * rig.w, py = (1 - hit.uv.y) * rig.h;
  world.mural.pulse(px, py, 55);
  song.unlock();
  if (!world.flock.launchFrom(t, px, py)) song.play('tweet', ndc.x * 0.8, 0.15);
  if (navigator.vibrate) navigator.vibrate(12);
}

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { /* not critical */ }
}

// ---------------------------------------------------------------- AR session
class CameraError extends Error { constructor(kind, cause) { super(kind); this.kind = kind; this.cause = cause; } }

async function openCamera() {
  if (!window.isSecureContext) throw new CameraError('insecure');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new CameraError('nocam');
  const res = +qs.get('res') || 1280;
  const tries = [
    { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: res }, height: { ideal: Math.round(res * 9 / 16) } } },
    { audio: false, video: { facingMode: 'environment' } },
    { audio: false, video: true },
  ];
  let last;
  for (const c of tries) {
    try { return await navigator.mediaDevices.getUserMedia(c); } catch (e) {
      last = e;
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw new CameraError('denied', e);
    }
  }
  if (last && last.name === 'NotFoundError') throw new CameraError('nocam', last);
  if (last && last.name === 'NotReadableError') throw new CameraError('busy', last);
  throw new CameraError('generic', last);
}

class ARSession {
  async start() {
    setLoading(T.loadingCam);
    const [stream, targets] = await Promise.all([openCamera(), loadAssets()]);
    this.stream = stream;
    setLoading(T.loadingAR);
    const { MindARThree } = await import('mindar-image-three');
    const container = $('#stage');
    const mindar = new MindARThree({
      container,
      imageTargetSrc: 'assets/targets.mind',
      maxTrack: 1,
      uiLoading: 'no', uiScanning: 'no', uiError: 'no',
      filterMinCF: qs.has('cf') ? +qs.get('cf') : 0.001,
      filterBeta: qs.has('beta') ? +qs.get('beta') : 100,
      warmupTolerance: 3,
      missTolerance: 8,
    });
    this.mindar = mindar;
    // Use the stream we already opened (better errors, higher resolution)
    mindar._startVideo = function () {
      return new Promise((resolve) => {
        const v = (this.video = document.createElement('video'));
        v.setAttribute('autoplay', ''); v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
        v.muted = true; v.playsInline = true;
        Object.assign(v.style, { position: 'absolute', top: '0px', left: '0px', zIndex: '-2' });
        this.container.appendChild(v);
        v.addEventListener('loadedmetadata', () => {
          v.setAttribute('width', v.videoWidth); v.setAttribute('height', v.videoHeight);
          resolve();
        }, { once: true });
        v.srcObject = stream;
        v.play().catch(() => {});
      });
    };
    mindar.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.clock = new THREE.Clock();
    this.inv = new THREE.Matrix4();
    this.cam = new THREE.Vector3(0, 0, 1.5);
    this.tracking = false;
    this.current = null;
    this.nextChirp = 0;
    // one anchor + one living world per picture; MindAR reports whichever it sees
    this.entries = targets.map((target) => {
      const anchor = mindar.addAnchor(target.index);
      const world = buildWorld(anchor.group, target, { count: 5 });
      if (qs.has('debug')) world.mural.uniforms.uOpacity.value = 0.5;   // see-through: shows alignment
      const e = { anchor, world, awake: false, lostAt: -1e9 };
      anchor.onTargetFound = () => this.found(e);
      anchor.onTargetLost = () => this.lost(e);
      return e;
    });
    // MindAR swallows some async failures (e.g. a missing target file), so guard with a timeout
    await Promise.race([
      mindar.start(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AR start timeout')), 60000)),
    ]);
    mindar.resize();

    hideScreens();
    $('#hud').classList.remove('hidden');
    $('#badge').classList.add('hidden');
    $('#btnSwitch').classList.add('hidden');
    $('#scan').classList.toggle('hidden', this.tracking);
    this.scanPics = startScanSlideshow(targets);
    keepAwake(true);

    this.onTap = (ev) => { if (this.tracking && this.current) tapWorld(ev, mindar.camera, this.current.world, this.clock.elapsedTime); };
    container.addEventListener('pointerdown', this.onTap);
    mindar.renderer.setAnimationLoop(() => this.frame());
    window.__mosaic = this; // handy for debugging
  }

  get world() { return this.current && this.current.world; }
  get targetId() { return this.current && this.current.world.target.id; }

  found(e) {
    const t = this.clock.elapsedTime;
    console.log('[mosaic] target found', e.world.target.id, t.toFixed(2));
    this.tracking = true;
    this.current = e;
    clearTimeout(this.scanTimer);
    $('#scan').classList.add('hidden');
    const { mural, flock } = e.world;
    if (!e.awake || t - e.lostAt > 8) {
      mural.sleep();
      flock.stop();
      mural.awaken(t);
      flock.start(t);
      e.awake = true;
      song.play('magic', 0, 0.2);
      this.nextChirp = t + 1.2;
      toast(T.awake);
      if (navigator.vibrate) navigator.vibrate([18, 40, 18]);
    }
  }

  lost(e) {
    e.lostAt = this.clock.elapsedTime;
    console.log('[mosaic] target lost', e.world.target.id, e.lostAt.toFixed(2));
    if (this.current !== e) return;
    this.tracking = false;
    clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(() => { if (!this.tracking) $('#scan').classList.remove('hidden'); }, 600);
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    const e = this.current;
    if (e) {
      const g = e.anchor.group;
      if (this.tracking && g.visible) {
        this.inv.copy(g.matrix).invert();
        this.cam.set(0, 0, 0).applyMatrix4(this.inv);
      }
      e.world.mural.update(t, dt, this.cam);
      e.world.flock.update(t, dt, this.cam);
    }
    if (this.tracking && t > this.nextChirp) { song.ambient(true); this.nextChirp = t + rand(1.4, 4.2); }
    this.mindar.renderer.render(this.mindar.scene, this.mindar.camera);
  }

  stop() {
    if (this.stream) this.stream.getTracks().forEach((tr) => tr.stop());
    if (this.scanPics) this.scanPics();
    const m = this.mindar;
    if (!m) return;
    m.renderer.setAnimationLoop(null);
    try { m.stop(); } catch (e) { /* video may not have started */ }
    $('#stage').removeEventListener('pointerdown', this.onTap);
    m.renderer.dispose();
    m.renderer.domElement.remove();
    m.cssRenderer.domElement.remove();
    $('#stage').querySelectorAll('video').forEach((v) => v.remove());
    clearTimeout(this.scanTimer);
    keepAwake(false);
    this.mindar = null;
  }
}

// The scanning frame shows the pictures we can recognise, one after another
function startScanSlideshow(targets) {
  const img = $('.frame img');
  const frame = $('.frame');
  let i = 0;
  const showPic = () => {
    const t = targets[i % targets.length];
    img.src = t.dir + 'mural.jpg';
    frame.style.aspectRatio = `${t.rig.w} / ${t.rig.h}`;
    i++;
  };
  showPic();
  const id = targets.length > 1 ? setInterval(showPic, 2600) : 0;
  return () => clearInterval(id);
}

// ---------------------------------------------------------------- demo session (no camera)
class DemoSession {
  constructor(which = 0) { this.which = which; }   // index, or a picture id

  async start() {
    setLoading(T.loadingDemo);
    this.targets = await loadAssets();
    const byId = this.targets.findIndex((t) => t.id === this.which);
    this.index = byId >= 0 ? byId : Math.min(+this.which || 0, this.targets.length - 1);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(innerWidth, innerHeight);
    $('#stage').appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.01, 50);
    this.root = new THREE.Group();
    scene.add(this.root);
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.clock = new THREE.Clock();
    this.look = new THREE.Vector2();
    this.lookT = new THREE.Vector2();
    this.nextChirp = 1.5;

    this.onResize = () => {
      camera.aspect = innerWidth / innerHeight;
      const f = 2 * Math.tan((camera.fov * Math.PI) / 360);
      const pad = 1.14;
      const rig = this.world ? this.world.target.rig : this.targets[this.index].rig;
      this.dist = Math.max((rig.h / rig.w) * pad / f, pad / (f * camera.aspect));
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    };
    this.onMove = (e) => { if (e.pointerType === 'mouse') this.lookT.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1); };
    this.onOrient = (e) => {
      if (e.gamma == null) return;
      if (!this.base) this.base = { b: e.beta, g: e.gamma };
      this.lookT.set(Math.max(-1, Math.min(1, (e.gamma - this.base.g) / 25)), Math.max(-1, Math.min(1, (e.beta - this.base.b) / 25)));
      this.gyro = true;
    };
    this.onTap = (ev) => tapWorld(ev, camera, this.world, this.clock.elapsedTime);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('deviceorientation', this.onOrient);
    $('#stage').addEventListener('pointerdown', this.onTap);

    this.show(this.index);
    hideScreens();
    $('#hud').classList.remove('hidden');
    $('#badge').classList.remove('hidden');
    $('#btnSwitch').classList.toggle('hidden', this.targets.length < 2);
    $('#scan').classList.add('hidden');
    setTimeout(() => toast(T.demoToast, 5200), 1600);
    renderer.setAnimationLoop(() => this.frame());
    window.__mosaic = this;
  }

  // show picture i (used for the first one and by the "another mosaic" button)
  show(i) {
    const t = this.clock.elapsedTime;
    if (this.world) disposeWorld(this.world);
    this.index = i % this.targets.length;
    this.world = buildWorld(this.root, this.targets[this.index], { count: qs.has('birds') ? +qs.get('birds') : 6 });
    this.onResize();
    this.world.mural.awaken(t + 0.35);
    this.world.flock.start(t + 0.4);
    song.play('magic', 0, 0.2);
  }

  next() { this.show(this.index + 1); }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    const idle = this.gyro || qs.has('still') ? 0 : 1;
    this.look.lerp(this.lookT, 1 - Math.exp(-dt * 4));
    const yaw = this.look.x * 0.32 + idle * 0.1 * Math.sin(t * 0.23);
    const pitch = -this.look.y * 0.2 + idle * 0.05 * Math.sin(t * 0.17);
    const d = this.dist;
    this.camera.position.set(Math.sin(yaw) * d, Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d);
    this.camera.lookAt(0, 0, 0);
    this.world.mural.update(t, dt, this.camera.position);
    this.world.flock.update(t, dt, this.camera.position);
    if (t > this.nextChirp) { song.ambient(true); this.nextChirp = t + rand(1.6, 4.5); }
    this.renderer.render(this.scene, this.camera);
  }

  stop() {
    if (!this.renderer) return;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('deviceorientation', this.onOrient);
    $('#stage').removeEventListener('pointerdown', this.onTap);
    if (this.world) disposeWorld(this.world);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// ---------------------------------------------------------------- flow
let session = null;

function inAppBrowser() {
  return /FBAN|FBAV|Instagram|Line\/|Telegram|VKClient|MicroMessenger|Snapchat|TikTok|; wv\)/i.test(navigator.userAgent);
}

function showError(err) {
  console.error(err);
  const kind = err && err.kind;
  let text = T.errGeneric;
  if (kind === 'denied') text = inAppBrowser() ? T.errInApp : T.errDenied;
  else if (kind === 'insecure') text = T.errInsecure;
  else if (kind === 'nocam') text = T.errNoCam;
  else if (kind === 'busy') text = T.errBusy;
  else if (inAppBrowser()) text = T.errInApp;
  $('#errorText').textContent = text;
  $('#hud').classList.add('hidden');
  $('#scan').classList.add('hidden');
  show('#error');
}

async function run(Kind, ...args) {
  song.unlock();
  if (session) { session.stop(); session = null; }
  const s = new Kind(...args);
  try {
    await s.start();
    session = s;
  } catch (err) {
    try { s.stop(); } catch (e) { /* partial start */ }
    showError(err);
  }
}

async function startDemo(which = standIndex) {
  // iOS asks for motion permission; the tap we are in counts as the gesture
  try {
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().catch(() => {});
    }
  } catch (e) { /* ignore */ }
  run(DemoSession, which);
}

// Desktop test stand: pick which mosaic is shown on the big picture (and in the demo)
let standIndex = 0;
async function setupStand() {
  const targets = await loadManifest();
  const byParam = targets.findIndex((t) => t.id === qs.get('t'));
  const tabs = $('#standTabs');
  const select = (i) => {
    standIndex = i;
    $('#standImg').src = targets[i].dir + 'photo.jpg';
    tabs.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', i === j));
  };
  if (targets.length > 1) {
    tabs.innerHTML = targets.map((t) => `<button type="button">${t.title}</button>`).join('');
    tabs.querySelectorAll('button').forEach((b, i) => b.addEventListener('click', () => select(i)));
  }
  select(Math.max(0, byParam));
}

function closeSession() {
  if (session) { session.stop(); session = null; }
  $('#hud').classList.add('hidden');
  $('#scan').classList.add('hidden');
  $('#toast').classList.remove('show');
  show('#intro');
}

$('#btnAR').addEventListener('click', () => run(ARSession));
$('#btnDemo').addEventListener('click', () => startDemo());
$('#btnRetry').addEventListener('click', () => run(ARSession));
$('#btnErrDemo').addEventListener('click', () => startDemo());
$('#btnClose').addEventListener('click', closeSession);
$('#btnSwitch').addEventListener('click', () => { if (session instanceof DemoSession) session.next(); });
$('#btnSound').addEventListener('click', () => {
  song.unlock();
  const on = !$('#btnSound').classList.toggle('muted');
  song.setOn(on);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { song.suspend(); return; }
  song.resume();
  if (session instanceof ARSession) {
    keepAwake(true);
    const v = session.mindar && session.mindar.video;
    if (v && v.paused) v.play().catch(() => {});   // iOS pauses the camera in the background
  }
});

// warm up heavy downloads while the visitor reads the intro
setupStand().catch(() => {});
loadAssets().catch(() => {});
if (qs.get('mode') === 'demo') startDemo(qs.get('t') || 0);
