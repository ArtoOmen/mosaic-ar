import * as THREE from 'three';

// Sample cross-sections perpendicular to the long axis of a photographed part.
// UVs on both sides come from the same cutout; the elliptical section gives it depth.
function sections(texture, axis, origin, count) {
  const image = texture.image;
  const canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const pixels = [];
  let low = Infinity, high = -Infinity;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (rgba[(y * image.width + x) * 4 + 3] < 70) continue;
    const dx = x - origin[0], dy = y - origin[1];
    const s = dx * axis[0] + dy * axis[1], v = -dx * axis[1] + dy * axis[0];
    low = Math.min(low, s); high = Math.max(high, s);
    pixels.push([s, v]);
  }
  const rows = Array.from({length: count + 1}, () => [Infinity, -Infinity]);
  for (const [s,v] of pixels) {
    const row = rows[Math.round((s-low)/(high-low)*count)];
    row[0] = Math.min(row[0], v-1); row[1] = Math.max(row[1], v+1);
  }
  return rows.map(([left,right], i) => {
    const s = low + i/count*(high-low);
    if (left > right) left = right = 0;
    return { s, mid: (left+right)/2, radius: (right-left)/2 };
  });
}

function shell(texture, rows, axis, origin, place) {
  const position = [], uv = [], indices = [];
  const sides = 12;
  for (const row of rows) {
    for (let j = 0; j <= sides; j++) {
      const angle = 2*Math.PI*j/sides;
      const v = row.mid + row.radius * Math.cos(angle);
      const x = origin[0]+row.s*axis[0]-v*axis[1], y = origin[1]+row.s*axis[1]+v*axis[0];
      uv.push(x/texture.image.width, 1-y/texture.image.height);
      position.push(...place(row.s, v, row.radius*Math.sin(angle), x, y));
    }
  }
  for (let i=0; i<rows.length-1; i++) for (let j=0; j<sides; j++) {
    const a=i*(sides+1)+j, b=a+sides+1;
    indices.push(a,b,a+1,a+1,b,b+1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);
  // A coarser mesh keeps textured Canvas rendering affordable on phones without WebGL.
  const preview = [];
  for (let i=0; i<rows.length-1; i+=4) for (let j=0; j<sides; j+=2) {
    const a=i*(sides+1)+j, b=Math.min(i+4,rows.length-1)*(sides+1)+j;
    preview.push(a,b,a+2,a+2,b,b+2);
  }
  geometry.userData.preview = preview;
  return new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture, side:THREE.DoubleSide, alphaTest:.42, toneMapped:false}));
}

export function makeMosaicBird(rig, textures) {
  const obj = new THREE.Group(), model = new THREE.Group();
  obj.add(model); obj.visible = false;
  const [, , w, h] = rig.rect, unit = Math.max(w,h), owl = rig.voice === 'hoot';
  function bodyPoint(x,y,depth) {
    const u=(x-w/2)/unit, v=(h/2-y)/unit;
    return owl ? [u,v,depth/unit*.64] :
      [depth/unit*.62, v*.86-u*rig.direction*.48, u*rig.direction*.86+v*.48];
  }
  const bodyRows=sections(textures.body,[0,1],[0,0],40);
  const makeBody = rows => shell(textures.body, rows, [0,1], [0,0],
    (s,v,d,x,y)=>bodyPoint(x,y,d));
  let head;
  if (owl) {
    // Keep the two yellow eyes and the ear tufts together as the head tracks the viewer.
    const neck = bodyRows.findIndex(row => row.s >= h*.39);
    model.add(makeBody(bodyRows.slice(neck)));
    head = new THREE.Group();
    const face = makeBody(bodyRows.slice(0,neck+1));
    head.position.y = (h/2-bodyRows[neck].s)/unit;
    face.position.y = -head.position.y;
    head.add(face);
    model.add(head);
  } else {
    model.add(makeBody(bodyRows));
  }
  if (textures.hidden) {
    const rows=sections(textures.hidden,[0,1],[0,0],26);
    model.add(shell(textures.hidden,rows,[0,1],[0,0],(s,v,d,x,y)=>bodyPoint(x,y,d*.7)));
  }
  function wing(side,index) {
    const source = textures.wings[index], pivot = rig.wings[index].pivot;
    const axis = new THREE.Vector2(-rig.wings[index].direction*.60,1).normalize().toArray();
    const rows = sections(source,axis,pivot,24);
    const sh = new THREE.Group(), el = new THREE.Group();
    const [x,y,z] = bodyPoint(...pivot,0);
    sh.position.set(owl ? x : side*.075,y,z);
    model.add(sh); sh.add(el);
    const joint = rows[12].s;
    el.position.x = side*joint/unit;
    function piece(part,offset) {
      return shell(source,part,axis,pivot,(s,v,d)=>[side*(s-offset)/unit,(d*.16+.06*s)/unit,(-rig.wings[index].direction*v-.12*s)/unit]);
    }
    sh.add(piece(rows.slice(0,13),0));
    el.add(piece(rows.slice(12),joint));
    return {sh,el};
  }
  return {obj,model,head,wl:wing(-1,0),wr:wing(1,textures.wings.length-1)};
}
