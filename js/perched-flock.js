import * as THREE from 'three';
import { px2local } from './rig.js';

// Wing centres in each cutout, measured from the top left.
const wings = [[.52,.59],[.48,.49],[.24,.65],[.44,.42],[.45,.65],[.69,.58],[.29,.27],[.60,.54],[.42,.65]];

export class PerchedFlock {
  constructor(target, onEvent, cameraOverlay = false) {
    this.group = new THREE.Group();
    this.onEvent = onEvent;
    this.cameraOverlay = cameraOverlay;
    this.visibility = 1;
    this.birds = target.rig.birds.map(({ rect, direction, voice }, i) => {
      const [x, y, w, h] = rect;
      const rig = target.rig;
      const homePx = [x + w / 2, y + h / 2];
      const [cx, cy] = px2local(rig, ...homePx);
      const geometry = new THREE.PlaneGeometry(w / rig.w, h / rig.w, 24, 28);
      const positions = geometry.attributes.position;
      const rest = positions.array.slice();
      const weights = new Float32Array(positions.count);
      const [wx, wy] = wings[i];
      for (let j = 0; j < weights.length; j++) {
        const u = geometry.attributes.uv.getX(j), v = 1 - geometry.attributes.uv.getY(j);
        weights[j] = Math.exp(-(((u-wx)/.27)**2 + ((v-wy)/.24)**2) * 1.5) * h / rig.w;
      }
      const material = new THREE.MeshBasicMaterial({ map: target.sprites[i], transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(cx, cy, .00015);
      mesh.renderOrder = 3;
      mesh.visible = !cameraOverlay;
      let patch;
      if (cameraOverlay) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(target.map.image, x, y, w, h, 0, 0, w, h);
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(target.sprites[i].image, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        patch = new THREE.Mesh(new THREE.PlaneGeometry(w/rig.w, h/rig.w),
          new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
        patch.position.copy(mesh.position);
        patch.renderOrder = 1;
        patch.visible = false;
        this.group.add(patch);
      }
      let body;
      if (target.hiddenBodies[i]) {
        body = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
          map: target.hiddenBodies[i], transparent: true, opacity: 0, depthTest: false, depthWrite: false
        }));
        body.position.z = -.00004;
        body.renderOrder = 2;
        mesh.add(body);
      }
      this.group.add(mesh);
      return { mesh, patch, body, pos: mesh.position, home: mesh.position.clone(), rect, homePx, voice, direction,
        rest, weights, start: null, airborne: false, duration: 3.8 + (i % 3) * .25 };
    });
  }

  start(t) {
    this.birds.forEach((bird, i) => { bird.start = t + .45 + i * .68; });
  }

  stop() {
    for (const bird of this.birds) this.land(bird);
  }

  land(bird) {
    bird.mesh.visible = !this.cameraOverlay;
    if (bird.patch) bird.patch.visible = false;
    bird.mesh.position.copy(bird.home);
    bird.mesh.rotation.set(0, 0, 0);
    const p = bird.mesh.geometry.attributes.position;
    p.array.set(bird.rest);
    p.needsUpdate = true;
    if (bird.body) bird.body.material.opacity = 0;
    bird.start = null;
    bird.airborne = false;
  }

  launchFrom(t, x, y) {
    const bird = this.birds.find(({rect: [bx, by, w, h], start}) =>
      start === null && x >= bx && x <= bx+w && y >= by && y <= by+h);
    if (bird) bird.start = t;
    return Boolean(bird);
  }

  update(t) {
    for (const [i, bird] of this.birds.entries()) {
      if (bird.start === null || t < bird.start) continue;
      const elapsed = t - bird.start, phase = elapsed / bird.duration;
      if (phase >= 1) {
        if (bird.airborne) this.onEvent('merge', bird);
        this.land(bird);
        continue;
      }
      if (!bird.airborne) {
        this.onEvent('emerge', bird);
        bird.airborne = true;
      }
      const angle = Math.PI * phase, arc = Math.sin(angle) ** 2;
      const edge = Math.min(1, elapsed / .25, (bird.duration-elapsed)/.28);
      const opacity = this.cameraOverlay ? edge * edge * (3-2*edge) * this.visibility : 1;
      bird.mesh.visible = true;
      bird.mesh.material.opacity = opacity;
      if (bird.patch) {
        bird.patch.visible = true;
        bird.patch.material.opacity = opacity;
      }
      if (bird.body) bird.body.material.opacity = opacity * Math.min(1, arc * 7);
      const beat = Math.sin(elapsed * (12 + i % 3));
      bird.pos.set(
        bird.home.x + bird.direction * arc * (.082 + .054 * Math.sin(2 * angle)),
        bird.home.y + arc * (.095 + .018 * Math.cos(2 * angle + i)),
        bird.home.z + arc * (.07 + .012 * (i % 3))
      );
      bird.mesh.rotation.set(.045 * arc * Math.sin(2 * angle), bird.direction * .16 * arc, bird.direction * .19 * Math.sin(2 * angle) * arc);
      const p = bird.mesh.geometry.attributes.position;
      for (let j = 0; j < p.count; j++) {
        const lift = arc * beat * bird.weights[j];
        p.setY(j, bird.rest[j*3+1] + lift * .072);
        p.setZ(j, lift * .14);
      }
      p.needsUpdate = true;
    }
  }
}
