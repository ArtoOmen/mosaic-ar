import * as THREE from 'three';
import { px2local } from './rig.js';

export class PerchedFlock {
  constructor(target, onEvent) {
    this.group = new THREE.Group();
    this.onEvent = onEvent;
    this.visibility = 1;
    this.birds = target.rig.birds.map(({ rect, direction, voice }, i) => {
      const [x, y, w, h] = rect;
      const rig = target.rig;
      const homePx = [x + w / 2, y + h / 2];
      const [cx, cy] = px2local(rig, ...homePx);
      const geometry = new THREE.PlaneGeometry(w / rig.w, h / rig.w);
      const material = new THREE.MeshBasicMaterial({ map: target.sprites[i], transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(cx, cy, .00015);
      mesh.renderOrder = 3;
      mesh.visible = false;
      const parts = target.flightParts[i];
      const wings = (rig.birds[i].wings || []).map(({ pivot, direction }, j) => {
        const joint = new THREE.Group();
        joint.position.set((pivot[0] - w/2)/rig.w, (h/2 - pivot[1])/rig.w, .0001);
        const feather = new THREE.Mesh(geometry, material.clone());
        feather.material.map = parts.wings[j];
        feather.material.side = THREE.DoubleSide;
        feather.position.set(-joint.position.x, -joint.position.y, 0);
        feather.renderOrder = 4;
        joint.add(feather);
        joint.visible = false;
        mesh.add(joint);
        return { joint, feather, direction };
      });
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
      return { mesh, body, pos: mesh.position, home: mesh.position.clone(), rect, homePx, voice, direction,
        wings, parts, folded: target.sprites[i], start: null, airborne: false, duration: voice === "hoot" ? 6.6 : 4.9 + (i % 4) * .32 };
    });
  }

  start(t) {
    this.birds.forEach((bird, i) => { bird.start = t + .45 + i * 1.7; });
  }

  stop() {
    for (const bird of this.birds) this.land(bird);
  }

  land(bird) {
    bird.mesh.visible = false;
    bird.mesh.position.copy(bird.home);
    bird.mesh.rotation.set(0, 0, 0);
    bird.mesh.material.map = bird.folded;
    for (const wing of bird.wings) wing.joint.visible = false;
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
      const opacity = edge * edge * (3-2*edge) * this.visibility;
      bird.mesh.visible = true;
      bird.mesh.material.opacity = opacity;
      if (bird.body) bird.body.material.opacity = opacity * Math.min(1, arc * 7);
      const owl = bird.voice === 'hoot';
      const inward = bird.home.x > 0 ? -1 : 1;
      const sweep = Math.sin(2 * angle);
      const turn = Math.cos(2 * angle);
      const glide = THREE.MathUtils.smootherstep(phase, .31, .45)
        * (1 - THREE.MathUtils.smootherstep(phase, .60, .73));
      // Offset the outbound and return legs in height and depth.
      const width = owl ? .38 : .21 + .035 * (i % 4);
      const rise = bird.home.y > .23 ? .055 : .16 + .03 * (i % 3);
      const wingRate = owl ? 6.4 : 7.6 + .5 * (i % 3);
      const wingCycle = (phase - .12) * bird.duration * wingRate;
      const lift = .009 * Math.sin(wingCycle) * (1 - glide);
      bird.pos.set(
        bird.home.x + inward * arc * (width + .13 * sweep),
        bird.home.y + arc * (rise + .09 * sweep + lift),
        bird.home.z + arc * (.22 + .075 * turn)
      );
      bird.mesh.rotation.set(arc * (.08 - .15 * sweep),
        inward * arc * (.34 + .36 * sweep), inward * arc * (.12 + .38 * sweep));
      if (bird.parts) bird.mesh.material.map = bird.parts.body;
      // Open before lift-off, beat in flight, then hold a braking pose and tuck.
      const open = THREE.MathUtils.smootherstep(phase, 0, .12);
      const tuck = 1 - THREE.MathUtils.smootherstep(phase, .77, 1);
      const stroke = (1 - Math.cos(wingCycle)) / 2;
      const beating = THREE.MathUtils.smoothstep(phase, .12, .21)
        * (1 - THREE.MathUtils.smoothstep(phase, .63, .77));
      const spread = open * tuck * (1 - .62 * beating * stroke * (1 - glide));
      for (const { joint, feather, direction } of bird.wings) {
        joint.visible = true;
        joint.rotation.set(.28 * spread, direction * .22 * spread, -direction * 1.78 * spread);
        feather.material.opacity = opacity;
      }
    }
  }
}
