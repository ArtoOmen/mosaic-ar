// A small transparent layer shared by the AR and canvas renderers.
import * as THREE from 'three';

const colors = ['#ffd76b', '#58acbd', '#fff1d3', '#e88644'];
export class PerchEffect {
  constructor(home, height) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    this.ctx = canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.size = height * .92;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.size, this.size),
      new THREE.MeshBasicMaterial({map: this.texture, transparent: true, depthWrite: false, depthTest: false}));
    this.mesh.position.copy(home);
    this.mesh.position.y -= height * .34;
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
  }

  start(time, landing) {
    this.startTime = time;
    this.landing = landing;
    this.mesh.visible = true;
    this.update(time, 1);
  }

  update(time, visibility) {
    if (!this.mesh.visible) return;
    const p = (time - this.startTime) / (this.landing ? .9 : .68);
    if (p >= 1 || p < 0) { this.mesh.visible = false; return; }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 128, 128);
    this.mesh.material.opacity = visibility * (1 - p) ** 1.4;
    if (this.landing) {
      ctx.strokeStyle = '#ffe19c';
      ctx.shadowColor = '#ffbf61';
      ctx.shadowBlur = 5;
      ctx.lineWidth = 2.6 - p;
      ctx.beginPath();
      ctx.ellipse(64, 72, 6 + 47*p, 2 + 12*p, 0, 0, 2*Math.PI);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    for (let i = 0; i < 12; i++) {
      const angle = i * 2.4;
      const r = (8 + 46 * p) * (.68 + .32 * Math.sin(i * 8.3) ** 2);
      ctx.save();
      ctx.translate(64 + Math.cos(angle)*r, 72 + Math.sin(angle)*r*.46 - p*(this.landing ? 8 : 41));
      ctx.rotate(angle + p * 2);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(-1.8, -2.8, 3.6, 5.6);
      ctx.restore();
    }
    this.texture.needsUpdate = true;
  }
}
