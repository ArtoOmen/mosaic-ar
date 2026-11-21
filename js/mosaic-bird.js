import * as THREE from 'three';

// Each plumage-atlas row belongs to one bird. Columns hold its breast, crown,
// photographed left and right wing patterns, and tail stripes.
export function makeMosaicBird(rig, atlas, index) {
  const obj = new THREE.Group(), model = new THREE.Group();
  obj.add(model);
  obj.visible = false;
  const owl = rig.voice === 'hoot', chick = Boolean(rig.hiddenBody);
  const material = new THREE.MeshBasicMaterial({map:atlas, vertexColors:true, side:THREE.DoubleSide});
  const light = new THREE.Vector3(-.35,.82,.45).normalize();
  function surface(parent, column, length, around, point, color) {
    const vertices=[], uvs=[], triangles=[], preview=[];
    for (let i=0;i<=length;i++) for (let j=0;j<=around;j++) {
      const t=i/length, u=j/around, p=point(t,2*Math.PI*u);
      vertices.push(p[0],p[1],p[2]);
      // Use the same feather pattern on both faces of each cambered wing.
      const wing = column===2 || column===3;
      const a = wing ? p[3] : u, b = wing ? .5-.49*Math.cos(2*Math.PI*u) : t;
      uvs.push((column+.006+.988*a)/5,1-(index+.006+.988*b)/9);
    }
    function grid(out,step) {
      for(let i=0;i<length;i+=step) for(let j=0;j<around;j+=step) {
        const k=Math.min(length,i+step), l=Math.min(around,j+step);
        const a=i*(around+1)+j,b=k*(around+1)+j,c=i*(around+1)+l,d=k*(around+1)+l;
        out.push(a,b,c,c,b,d);
      }
    }
    grid(triangles,1);grid(preview,2);
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geo.setIndex(triangles);geo.computeVertexNormals();geo.userData.preview=preview;
    const colors=[], n=new THREE.Vector3(), base=new THREE.Color(color ?? 0xffffff);
    for(let k=0;k<vertices.length/3;k++) {
      n.fromBufferAttribute(geo.attributes.normal,k);
      const shade=.74+.26*Math.abs(n.dot(light));
      colors.push(base.r*shade,base.g*shade,base.b*shade);
    }
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    const mesh=new THREE.Mesh(geo,color===undefined?material:new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}));
    parent.add(mesh);return mesh;
  }

  function oval(parent,col,center,radius,color) {
    return surface(parent,col,color === undefined ? 14 : 8,color === undefined ? 24 : 12,(t,a)=>{
      const z=Math.cos(Math.PI*t), r=Math.sin(Math.PI*t);
      return [center[0]+radius[0]*r*Math.sin(a),center[1]+radius[1]*r*Math.cos(a),center[2]+radius[2]*z];
    },color);
  }
  // Length, breadth and breast depth follow the nine profiles in panel order.
  const [length,girth,chest,tailLength] = [
    [.58,.155,.174,.25], [.68,.152,.172,.38], [.54,.228,.224,.20],
    [.71,.135,.151,.51], [.60,.185,.204,.24], [.69,.156,.192,.31],
    [.66,.15,.171,.40], [.68,.147,.164,.43], [.46,.171,.172,.15]
  ][index];
  surface(model,0,20,28,(t,a)=>{
    const r=Math.sin(Math.PI*t)**.76*(1.16-.44*t);
    return [girth*r*Math.sin(a),chest*r*Math.cos(a)+.065-.115*t,.26-length*t];
  });

  const head = new THREE.Group();
  head.position.set(0,owl?.194:chick ? .158 : .162,owl ? .198 : .25);
  model.add(head);
  const hr=owl?.194:chick ? .158 : .132;
  oval(head,1,[0,0,0],[hr*(owl ? 1.1 : 1),hr,hr*.94]);
  for (const side of [-1,1]) {
    const eye=new THREE.Group();
    const angle=side*(owl ? .40 : 1.04);
    eye.position.set(Math.sin(angle)*hr,hr*.19,Math.cos(angle)*hr*.90);
    eye.rotation.y=angle;
    head.add(eye);
    const r=hr*(owl ? .39 : .34);
    if (owl) oval(eye,1,[0,-r*.08,-r*.18],[r*1.39,r*1.39,r*.44],0x59412f);
    oval(eye,1,[0,0,0],[r*1.12,r*1.12,r*.40],0x37231c);
    oval(eye,1,[0,0,r*.22],[r,r,r*.35],0xffc738);
    oval(eye,1,[0,0,r*.48],[r*.57,r*.61,r*.25],0x19191a);
    oval(eye,1,[-r*.16,r*.28,r*.68],[r*.15,r*.15,r*.08],0xfff5d5);
    if (owl) surface(head,1,10,12,(t,a)=>{
      const r=.073*(1-t);
      return [side*(.127+.076*t)+r*Math.sin(a),.103+.194*t,.012+r*Math.cos(a)];
    });
  }
  surface(head,1,10,14,(t,a)=>{
    const r=(1-t)**.75*(owl ? .051 : .039);
    return [r*Math.sin(a),-.025+r*Math.cos(a)-(owl ? .09 : .018)*t,hr*.74+(owl?.093:index===5 ? .225 : .146)*t];
  },owl?0x48322a:index===5?0xdc9625:0x38282a);

  // The shoulder and wrist use identical sections at their hinge. Long primaries
  // taper towards the swept tip; the broad rear edge separates into feather lobes.
  function wing(side) {
    const sh=new THREE.Group(), el=new THREE.Group();
    sh.position.set(side*girth*.64,.064,.077);
    model.add(sh);sh.add(el);
    const span=owl?.78:chick ? .52 : .68, joint=.47;
    function center(t) {return [side*span*t,.052*Math.sin(Math.PI*t),-.18*t*t];}
    const hinge=center(joint);
    el.position.fromArray(hinge);
    const skin=surface(sh,side<0?2:3,24,16,(t,a)=>{
      const c=center(t);
      const chord=(.28+.14*Math.sin(Math.PI*t))*(1-t**3)**.72*(owl ? 1.23 : 1);
      const rear=.60+.10*Math.max(0,-Math.cos(a))*Math.sin(t*5*Math.PI)**2;
      return [c[0],c[1]+chord*(.115*Math.sin(a)+.10*Math.sin(a)**2),
        c[2]+chord*(Math.cos(a)*rear-.23),t];
    });
    const positions=skin.geometry.attributes.position, rest=positions.clone();
    const scratch=new THREE.Vector3(), base=new THREE.Vector3();
    positions.setUsage(THREE.DynamicDrawUsage);
    skin.frustumCulled=false;
    function bend() {
      for(let row=7;row<=24;row++) {
        const weight=THREE.MathUtils.smoothstep(row/24,.30,.64);
        for(let j=0;j<=16;j++) {
          const k=row*17+j;
          base.fromBufferAttribute(rest,k);
          scratch.copy(base).sub(el.position).applyQuaternion(el.quaternion).add(el.position);
          base.lerp(scratch,weight);
          positions.setXYZ(k,base.x,base.y,base.z);
        }
      }
      positions.needsUpdate=true;
    }
    return {sh,el,bend};
  }
  surface(model,4,14,20,(t,a)=>{
    const w=(.044+(owl ? .121 : .095)*t)*(1-.80*Math.max(0,(t-.86)/.14));
    return [w*Math.sin(a),-.059+.018*Math.cos(a)-.036*t,
      .30-length-tailLength*t+.043*t*Math.sin(a)**2];
  });
  return {obj,model,head:owl?head:null,wl:wing(-1),wr:wing(1)};
}
