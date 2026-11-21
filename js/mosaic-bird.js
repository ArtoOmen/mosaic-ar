import * as THREE from 'three';

// Both faces of the relief use the photographed face. Every vertex retains
// its source UV, including the beak, ears, feet and outer tail feathers.
export function makeMosaicBird(rig, atlas, profile, index) {
  const obj = new THREE.Group(), model = new THREE.Group();
  obj.add(model);
  obj.visible = false;
  const [, , width, height] = rig.rect, unit = Math.max(width, height);
  const owl = rig.voice === 'hoot';
  const facing = [1, 1, 0, 1, 1, -1, 1, -1, 1][index];
  const material = new THREE.MeshBasicMaterial({map: atlas, side: THREE.DoubleSide,
    alphaTest: .38, toneMapped: false, vertexColors: true});

  function skin(part, place) {
    const positions = [], uv = [], colors = [], indices = [];
    for (const side of [1,-1]) {
      const [x0,y0,w,h] = side < 0 && part.backRect ? part.backRect : part.rect;
      const offset = positions.length/3;
      for (const [x,y,depth] of part.points) {
        const relief = Math.sqrt(Math.max(0,depth/4-1)*unit)*.32;
        positions.push(...place(x,y,side*relief));
        uv.push((x0+(x+.5)*w/width)/atlas.image.width,1-(y0+(y+.5)*h/height)/atlas.image.height);
        const shade = .85+.15*Math.min(1,relief/(.12*unit));
        colors.push(shade,shade,shade);
      }
      for (const id of part.triangles) indices.push(id+offset);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geo.setIndex(indices);
    geo.userData.preview = indices;
    return new THREE.Mesh(geo,material);
  }

  // Pitch the original profile into its flying posture, preserving proportions.
  const necks = [[.72,.33],[.64,.29],[.54,.39],[.68,.18],[.78,.29],
    [.50,.28],[.74,.34],[.25,.25],[.65,.46]];
  const [nx,ny] = necks[index];
  function bodyPoint(x,y,d) {
    const u=(x-width*.5)/unit, v=(height*.5-y)/unit;
    const below = THREE.MathUtils.smoothstep(y/height,ny-.06,ny+.21);
    if (owl) {
      const beak = d > 0 ? .05*Math.exp(-((u/.045)**2 + ((y/height-.33)/.046)**2)) : 0;
      return [u,v,d/unit*(y/height < .43 ? 1.55 : 1.22) + beak
        + Math.min(0,ny*height-y)*.70/unit];
    }
    // Lean the breast and tail into flight around the neck; keep the painted
    // beak and eye line level instead of pitching the entire head nose-down.
    const tilt = below * [.84,.72,0,.55,.62,.77,.43,.46,.64][index];
    const sn=Math.sin(tilt), cs=Math.cos(tilt);
    const du=(x-nx*width)*facing/unit, dv=(ny*height-y)/unit;
    return [d/unit, v + dv*(cs-1)-du*sn, u*facing + du*(cs-1)+dv*sn];
  }
  model.add(skin(profile.body,bodyPoint));
  if (profile.head) {
    const neck = new THREE.Group();
    neck.position.fromArray(bodyPoint(.73*width,.30*height,0));
    const face = skin(profile.head,bodyPoint);
    face.position.copy(neck.position).multiplyScalar(-1);
    neck.add(face);
    // The first bird looks over its back in the mosaic. Turn towards the
    // flight path first, then lower the bill while the torso keeps its heading.
    neck.rotation.set(1.22, Math.PI, 0, 'XYZ');
    model.add(neck);
  }
  const legs = profile.legs.map(({shape,hip}) => {
    const joint = new THREE.Group();
    joint.position.fromArray(bodyPoint(...hip,0));
    const foot = skin(shape,bodyPoint);
    foot.position.copy(joint.position).multiplyScalar(-1);
    joint.add(foot); model.add(joint);
    return joint;
  });

  function wing(side, j) {
    const part = profile.wings[j];
    const pivot = profile.shoulders[j];
    const sh = new THREE.Group(), el = new THREE.Group();
    // Sweep aft around the torso, then flap around the shoulder. Pitch feathers
    // in their own frame so raising the wing cannot swing its tip over the beak.
    sh.rotation.order = el.rotation.order = 'YZX';
    sh.position.fromArray(bodyPoint(...pivot,0));
    if (!owl) {
      sh.position.x = side*.08;
      sh.position.z -= .035;
    }
    model.add(sh);
    sh.add(el);
    // Extend the actual cutout along its shoulder-to-tip axis. In particular
    // the raised fan and the owl's two differently patterned wings stay distinct.
    let tip = pivot, reach = 0;
    for (const p of part.points) {
      const dist = Math.hypot(p[0]-pivot[0],p[1]-pivot[1]);
      if (dist > reach) { reach=dist; tip=p; }
    }
    const dx=(tip[0]-pivot[0])/reach, dy=(tip[1]-pivot[1])/reach;
    const length=reach/unit, hinge=length*.46;
    el.position.x=side*hinge;
    const wingMesh = skin(part,(x,y,d)=>{
      const a=(x-pivot[0])/unit,b=(y-pivot[1])/unit;
      const span=a*dx+b*dy, chord=-a*dy+b*dx;
      return [side*span,.15*d/unit+.05*span, -rig.wings[j].direction*chord*1.15-.31*span];
    });
    sh.add(wingMesh);
    wingMesh.frustumCulled=false;
    const pos=wingMesh.geometry.attributes.position, rest=pos.clone();
    pos.setUsage(THREE.DynamicDrawUsage);
    const base=new THREE.Vector3(), bent=new THREE.Vector3();
    const weights=part.points.map(([x,y])=>THREE.MathUtils.smoothstep(
      ((x-pivot[0])*dx+(y-pivot[1])*dy)/reach,.28,.68));
    function bend() {
      for(let i=0;i<pos.count;i++) {
        base.fromBufferAttribute(rest,i);
        bent.copy(base).sub(el.position).applyQuaternion(el.quaternion).add(el.position);
        base.lerp(bent,weights[i%weights.length]);
        pos.setXYZ(i,base.x,base.y,base.z);
      }
      pos.needsUpdate=true;
    }
    return {sh,el,bend};
  }
  return {obj,model,legs,wl:wing(-1,0),wr:wing(1,profile.wings.length-1)};
}
