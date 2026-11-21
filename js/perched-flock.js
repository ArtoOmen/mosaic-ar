import * as THREE from 'three';
import { makeMosaicBird } from './mosaic-bird.js';
import { PerchEffect } from './perch-effect.js';
import { px2local } from './rig.js';

export class PerchedFlock {
  constructor(target, onEvent) {
    this.group = new THREE.Group();
    this.onEvent = onEvent;
    this.visibility = 1;
    this.aim = new THREE.Matrix4();
    this.heading = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.origin = new THREE.Vector3();
    this.ahead = new THREE.Vector3();
    this.headAim = new THREE.Quaternion();
    this.viewer = new THREE.Vector3();
    this.birds = target.rig.birds.map(({ rect, direction, voice, flight }, i) => {
      const [x, y, w, h] = rect;
      const rig = target.rig;
      const homePx = [x + w / 2, y + h / 2];
      const [cx, cy] = px2local(rig, ...homePx);
      const model = makeMosaicBird(rig.birds[i], target.plumage[i]);
      const mesh = model.obj;
      mesh.position.set(cx, cy, .00015);
      const effect = new PerchEffect(mesh.position, h / rig.w);
      this.group.add(mesh, effect.mesh);
      const points = flight?.points ?? [[direction * .14, .13, .14], [direction * .22, .07, .18], [direction * .12, .02, .08]];
      const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(), ...points.map(([x, y, z]) => new THREE.Vector3(x * 1.15, y, z * 1.42))
      ], true);
      return { mesh, model, size: Math.max(w, h) / rig.w * .93, pos: mesh.position, home: mesh.position.clone(), rect, homePx, voice, direction,
        effect, wingHz: [2.3, 1.55, .72, 2.7, 1.9, 1.35, 2.05, 1.75, 3.25][i] ?? 1.8, start: null, airborne: false, path, tangent: new THREE.Vector3(), duration: flight?.duration ?? 5 };
    });
  }

  start(t) {
    this.birds.forEach((bird, i) => { bird.start = t + .45 + i * 1.7; });
  }

  stop() {
    for (const bird of this.birds) { this.land(bird); bird.effect.mesh.visible = false; }
  }

  land(bird) {
    bird.mesh.visible = false;
    bird.mesh.position.copy(bird.home);
    bird.mesh.rotation.set(0, 0, 0);
    bird.model.head?.quaternion.identity();
    bird.start = null;
    bird.airborne = false;
  }

  launchFrom(t, x, y) {
    const bird = this.birds.find(({rect: [bx, by, w, h], start}) =>
      (start === null || start > t) && x >= bx && x <= bx+w && y >= by && y <= by+h);
    if (bird) bird.start = t;
    return Boolean(bird);
  }

  update(t, frameDelta, cameraPosition) {
    for (const bird of this.birds) {
      bird.effect.update(t, this.visibility);
      if (bird.start === null || t < bird.start) continue;
      const elapsed = t - bird.start, phase = elapsed / bird.duration;
      if (phase >= 1) {
        if (bird.airborne) { bird.effect.start(t, true); this.onEvent('merge', bird); }
        this.land(bird);
        continue;
      }
      if (!bird.airborne) {
        bird.effect.start(t, false);
        bird.lastTime = t;
        bird.oriented = false;
        this.onEvent('emerge', bird);
        bird.airborne = true;
      }
      const angle = Math.PI * phase, arc = Math.sin(angle) ** 2;
      const edge = Math.min(1, elapsed / .25, (bird.duration-elapsed)/.28);
      const opacity = edge * edge * (3-2*edge) * this.visibility;
      bird.mesh.visible = true;
      const owl = bird.voice === 'hoot';
      const glide = owl
        ? THREE.MathUtils.smootherstep(phase, .14, .25) * (1 - THREE.MathUtils.smootherstep(phase, .80, .92))
        : THREE.MathUtils.smootherstep(phase, .31, .45) * (1 - THREE.MathUtils.smootherstep(phase, .60, .73));
      const wingRate = 2 * Math.PI * bird.wingHz;
      // Integral of a varying cadence: quick departure, relaxed cruise, landing flare.
      const cycles = .82*elapsed + .32*(1-Math.exp(-elapsed/.65))
        + .16*bird.duration*phase**5;
      const wingCycle = cycles * wingRate;
      // Ease only near the perch to keep the glide moving at cruising speed.
      const progress = phase - Math.sin(2 * angle) / (2 * Math.PI) * .85;
      bird.path.getPointAt(progress, bird.pos).add(bird.home);
      bird.path.getTangentAt(progress, bird.tangent);
      bird.pos.y += arc * .006 * Math.sin(wingCycle) * (1 - glide);
      // Keep the beak aligned in three dimensions. Banking follows path curvature.
      const dt = Math.max(0, t - bird.lastTime);
      bird.lastTime = t;
      this.aim.lookAt(bird.tangent, this.origin, this.up);
      this.heading.setFromRotationMatrix(this.aim);
      if (bird.oriented) bird.mesh.quaternion.slerp(this.heading, -Math.expm1(-dt * 12));
      else bird.mesh.quaternion.copy(this.heading);
      bird.oriented = true;
      const ahead = bird.path.getTangentAt(Math.min(1, progress + .035), this.ahead);
      const bend = ahead.x * bird.tangent.z - ahead.z * bird.tangent.x;
      const brake = THREE.MathUtils.smootherstep(phase, .78, .94);
      const model = bird.model;
      model.model.rotation.z = THREE.MathUtils.clamp(-bend * 1.65, -.66, .66) * arc;
      model.model.rotation.x = -.24 * brake;
      if (model.head) {
        this.viewer.copy(cameraPosition ?? this.up).sub(bird.pos);
        if (!cameraPosition) this.viewer.set(0,0,1);
        this.aim.lookAt(this.viewer, this.origin, this.up);
        this.heading.setFromRotationMatrix(this.aim);
        this.headAim.copy(bird.mesh.quaternion).multiply(model.model.quaternion).invert().multiply(this.heading);
        model.head.quaternion.slerp(this.headAim, -Math.expm1(-dt*5));
      }
      bird.mesh.scale.setScalar(bird.size * Math.sqrt(opacity));
      const open = THREE.MathUtils.smootherstep(phase, 0, .095)
        * (1 - THREE.MathUtils.smootherstep(phase, .89, 1));
      const effort = (.94 - .89 * glide) * open;
      const stroke = Math.sin(wingCycle);
      const recovery = .5 - .5 * Math.cos(wingCycle);
      const shoulder = .16 + effort * (.90 * stroke + .12 * Math.sin(2 * wingCycle));
      const wrist = effort * (.48 * Math.sin(wingCycle - .85) - .27 * recovery);
      for (const [wing, side] of [[model.wl, -1], [model.wr, 1]]) {
        // Feather pitch presents the broad surface on the power stroke and slices air on recovery.
        wing.sh.rotation.x = .26 + .38 * effort * Math.cos(wingCycle);
        wing.el.rotation.x = .12 + .21 * effort * Math.cos(wingCycle - .85);
        wing.sh.rotation.z = side * shoulder;
        wing.el.rotation.z = side * wrist;
        wing.sh.rotation.y = side * ((1-open) * 1.15 + recovery * effort * .20);
        wing.el.rotation.y = side * ((1-open) * .52 + recovery * effort * .42);
        wing.sh.scale.x = (owl ? 1.27 : 1.06) * (.76 + .24 * open);
      }
    }
  }
}
