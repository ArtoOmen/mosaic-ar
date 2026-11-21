import * as THREE from 'three';

// MindAR estimates arrive less frequently than display frames. Ignore an
// isolated competing solution before easing the display toward the next pose.
export class TrackedPose {
  constructor() {
    this.root = new THREE.Group();
    this.root.visible = false;
    this.pose = new THREE.Object3D();
    this.candidate = new THREE.Object3D();
    this.sample = new THREE.Object3D();
    this.votes = 0;
    this.ready = false;
  }

  near(a, b) {
    return a.position.distanceTo(b.position) < Math.abs(b.scale.x) * .16 &&
      a.quaternion.angleTo(b.quaternion) < .35 &&
      Math.abs(a.scale.x / b.scale.x - 1) < .18;
  }

  accept(matrix) {
    matrix.decompose(this.sample.position, this.sample.quaternion, this.sample.scale);
    if (this.ready && !this.near(this.sample, this.pose)) {
      this.votes = this.votes && this.near(this.sample, this.candidate) ? this.votes + 1 : 1;
      this.candidate.copy(this.sample, false);
      if (this.votes < 4) return;
    }
    this.votes = 0;
    this.pose.copy(this.sample, false);
    if (!this.ready) {
      this.root.position.copy(this.pose.position);
      this.root.quaternion.copy(this.pose.quaternion);
      this.root.scale.copy(this.pose.scale);
    }
    this.ready = true;
  }

  update(dt) {
    const a = -Math.expm1(-dt * 18);
    this.root.position.lerp(this.pose.position, a);
    this.root.quaternion.slerp(this.pose.quaternion, a);
    this.root.scale.lerp(this.pose.scale, a);
  }
}
