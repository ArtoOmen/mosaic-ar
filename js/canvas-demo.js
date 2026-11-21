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
    for (const { effect } of ordered) {
      if (!effect.mesh.visible) continue;
      ctx.globalAlpha = effect.mesh.material.opacity;
      draw(effect.mesh, effect.texture.image, effect.size, effect.size);
    }
    ctx.globalAlpha = 1;
    ctx.resetTransform();
    const faces = [];
    for (const bird of ordered) {
      if (!bird.mesh.visible) continue;
      bird.mesh.traverse(part => {
        if (!part.isMesh) return;
        const { position, aColor } = part.geometry.attributes;
        const indices = part.geometry.index;
        const points = Array.from({length: position.count}, (_, i) => {
          const v = this.point.fromBufferAttribute(position, i).applyMatrix4(part.matrixWorld).project(camera);
          return [(v.x + 1) * el.width / 2, (1 - v.y) * el.height / 2, v.z];
        });
        const count = indices?.count ?? position.count;
        for (let i = 0; i < count; i += 3) {
          const id = indices ? indices.getX(i) : i;
          const a = points[id], b = points[indices ? indices.getX(i+1) : i+1];
          const c = points[indices ? indices.getX(i+2) : i+2];
          const color = aColor
            ? `rgb(${255*aColor.getX(id)},${255*aColor.getY(id)},${255*aColor.getZ(id)})`
            : part.material.color.getStyle();
          faces.push({a,b,c,color,depth:a[2]+b[2]+c[2]});
        }
      });
    }
    faces.sort((a,b) => b.depth-a.depth);
    for (const {a,b,c,color} of faces) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.lineTo(c[0],c[1]);
      ctx.closePath();
      ctx.fill();
    }
  }

  dispose() { this.setAnimationLoop(null); }
}
