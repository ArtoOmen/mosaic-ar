// Software preview for browsers without WebGL. Project the same scene and
// flight poses as the AR renderer onto a canvas.
import * as THREE from 'three';

export class CanvasDemo {
  constructor(world) {
    this.world = world;
    this.domElement = document.createElement('canvas');
    this.ctx = this.domElement.getContext('2d');
    this.ratio = 1;
    this.frame = null;
    this.point = new THREE.Vector3();
  }

  setPixelRatio(ratio) { this.ratio = ratio; }

  setSize(w, h) {
    const el = this.domElement;
    el.width = Math.round(w * this.ratio);
    el.height = Math.round(h * this.ratio);
    el.style.width = w + 'px';
    el.style.height = h + 'px';
  }

  setAnimationLoop(callback) {
    cancelAnimationFrame(this.frame);
    if (!callback) return;
    const tick = () => { this.frame = requestAnimationFrame(tick); callback(); };
    this.frame = requestAnimationFrame(tick);
  }

  render(scene, camera) {
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    const world = this.world();
    const { rig, map } = world.target;
    const ctx = this.ctx, el = this.domElement;
    ctx.resetTransform();
    ctx.clearRect(0, 0, el.width, el.height);
    const project = (mesh, x, y) => {
      const pt = this.point.set(x, y, 0).applyMatrix4(mesh.matrixWorld).project(camera);
      return [(pt.x + 1) * el.width / 2, (1 - pt.y) * el.height / 2];
    };
    const draw = (mesh, img, w, h) => {
      const [x,y] = project(mesh,-w/2,h/2);
      const [right,ry] = project(mesh,w/2,h/2);
      const [bx,bottom] = project(mesh,-w/2,-h/2);
      ctx.setTransform((right-x)/img.width,(ry-y)/img.width,(bx-x)/img.height,(bottom-y)/img.height,x,y);
      ctx.drawImage(img,0,0);
    };
    draw(world.mural.mesh,map.image,1,rig.h/rig.w);
    const ordered = [...world.flock.birds].sort((a, b) => a.pos.z - b.pos.z);
    for (const bird of ordered) {
      if (!bird.mesh.visible) continue;
      const w = bird.rect[2]/rig.w, h = bird.rect[3]/rig.w;
      if (bird.body && bird.airborne) {
        ctx.globalAlpha = bird.body.material.opacity;
        draw(bird.mesh, bird.body.material.map.image, w, h);
        ctx.globalAlpha = 1;
      }
      ctx.globalAlpha = bird.mesh.material.opacity;
      draw(bird.mesh, bird.mesh.material.map.image, w, h);
      for (const { joint, feather } of bird.wings) {
        if (joint.visible) draw(feather, feather.material.map.image, w, h);
      }
      ctx.globalAlpha = 1;
    }
  }

  dispose() { this.setAnimationLoop(null); }
}
