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
        const { position, uv } = part.geometry.attributes;
        const indices = part.geometry.userData.preview;
        const img = part.material.map.image;
        const points = Array.from({length: position.count}, (_, i) => {
          const v = this.point.fromBufferAttribute(position, i).applyMatrix4(part.matrixWorld).project(camera);
          return [(v.x + 1) * el.width / 2, (1 - v.y) * el.height / 2, v.z];
        });
        const count = indices.length;
        for (let i = 0; i < count; i += 3) {
          const ids = indices.slice(i,i+3);
          const [a,b,c] = ids.map(id=>points[id]);
          const src = ids.map(id=>[uv.getX(id)*img.width,(1-uv.getY(id))*img.height]);
          faces.push({a,b,c,img,src,depth:a[2]+b[2]+c[2]});
        }
      });
    }
    faces.sort((a,b) => b.depth-a.depth);
    for (const {a,b,c,img,src:[o,u,v]} of faces) {
      const ux=u[0]-o[0], uy=u[1]-o[1], vx=v[0]-o[0], vy=v[1]-o[1];
      const det=ux*vy-uy*vx;
      if (Math.abs(det)<.001) continue;
      const x1=b[0]-a[0], x2=c[0]-a[0], y1=b[1]-a[1], y2=c[1]-a[1];
      const xx=(x1*vy-x2*uy)/det, xy=(x2*ux-x1*vx)/det;
      const yx=(y1*vy-y2*uy)/det, yy=(y2*ux-y1*vx)/det;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.lineTo(c[0],c[1]);
      ctx.closePath(); ctx.clip();
      ctx.setTransform(xx,yx,xy,yy,a[0]-xx*o[0]-xy*o[1],a[1]-yx*o[0]-yy*o[1]);
      ctx.drawImage(img,0,0);
      ctx.restore();
    }
  }

  dispose() { this.setAnimationLoop(null); }
}
