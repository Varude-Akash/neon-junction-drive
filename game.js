import * as THREE from "three";

const canvas = document.getElementById("game");
const speedEl = document.getElementById("speed");
const routeEl = document.getElementById("route");
const damageEl = document.getElementById("damage");

const scene = new THREE.Scene();
const clock = new THREE.Clock();
const keys = new Set();
const roadSegments = [];
const roadRoutes = [];
const colliders = [];
const traffic = [];
const parkedCars = [];
const pedestrians = [];
const checkpoints = [];
const rings = [];
const WORLD = 2400;
const LIMIT = 1080;
let playerCar, activeVehicle, person, contactShadow, smoke;
let inCar = true;
let cooldown = 0;

const car = { pos: new THREE.Vector3(-585, 0.45, -455), heading: 0.72, speed: 0, steer: 0, turn: 0, boost: 100, damage: 0, drop: 0, hit: 0 };

function rand(seed) { const x = Math.sin(seed * 128.13) * 43758.5453; return x - Math.floor(x); }
function distSeg(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az, apx = px - ax, apz = pz - az;
  const t = THREE.MathUtils.clamp((apx * abx + apz * abz) / (abx * abx + abz * abz || 1), 0, 1);
  const x = ax + abx * t, z = az + abz * t;
  return Math.hypot(px - x, pz - z);
}
function onRoad(pos, pad = 0) { return roadSegments.some((s) => distSeg(pos.x, pos.z, s.ax, s.az, s.bx, s.bz) < s.w * 0.5 + pad); }
function footprintOnRoad(x, z, w, d, rot = 0, pad = 26) {
  const pts = [[0,0],[-w/2,-d/2],[w/2,-d/2],[-w/2,d/2],[w/2,d/2],[-w/2,0],[w/2,0],[0,-d/2],[0,d/2]];
  const c = Math.cos(rot), s = Math.sin(rot);
  return pts.some(([lx,lz]) => onRoad(new THREE.Vector3(x + lx * c - lz * s, 0, z + lx * s + lz * c), pad));
}
function groundY(x, z) {
  const roll = Math.sin(x * .006 + z * .003) * 2.3 + Math.cos(z * .005 - x * .002) * 1.8;
  const hill = Math.exp(-((x - 560) ** 2 + (z - 560) ** 2) / 210000) * 22 + Math.exp(-((x + 620) ** 2 + (z - 360) ** 2) / 190000) * 18;
  const coast = THREE.MathUtils.clamp((x + 820) / 760, 0, 1);
  return (roll + hill) * coast;
}
function surfaceY(x, z) { return groundY(x, z) + 0.45; }

function makeSky() {
  const c = document.createElement("canvas"); c.width = 64; c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#61bbff"); g.addColorStop(.52, "#c8efff"); g.addColorStop(1, "#ffffff");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 28; i++) {
    const x = rand(i) * 64, y = 22 + rand(i + 4) * 105, r = 5 + rand(i + 8) * 14;
    const cg = ctx.createRadialGradient(x, y, 0, x, y, r);
    cg.addColorStop(0, "rgba(255,255,255,.72)"); cg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = cg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
scene.background = makeSky();
scene.fog = new THREE.Fog(0xc8eaff, 160, 1450);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
const camera = new THREE.PerspectiveCamera(66, 1, .1, 2600);
scene.add(new THREE.HemisphereLight(0xf8fbff, 0x6f8756, 2.25));
const sun = new THREE.DirectionalLight(0xffffff, 2.7);
sun.position.set(-260, 560, 290); sun.castShadow = true; sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.left = -520; sun.shadow.camera.right = 520; sun.shadow.camera.top = 520; sun.shadow.camera.bottom = -520; scene.add(sun);

function texture(c1, c2, repeat = 8, count = 80) {
  const c = document.createElement("canvas"); c.width = c.height = 128; const ctx = c.getContext("2d");
  ctx.fillStyle = c1; ctx.fillRect(0,0,128,128);
  for (let i = 0; i < count; i++) { ctx.globalAlpha = .04 + rand(i + repeat) * .12; ctx.fillStyle = c2; ctx.fillRect(rand(i)*128, rand(i+2)*128, 3 + rand(i+3)*24, 1 + rand(i+4)*14); }
  ctx.globalAlpha = 1; const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const mat = {
  grass: new THREE.MeshStandardMaterial({ map: texture("#69b964", "#2f7a39", 30, 150), roughness: .96 }),
  asphalt: new THREE.MeshStandardMaterial({ map: texture("#31383d", "#171b1f", 7, 95), roughness: .94 }),
  curb: new THREE.MeshStandardMaterial({ color: 0x9db1b6, roughness: .7 }), lane: new THREE.MeshStandardMaterial({ color: 0xf7f0d7, roughness: .58 }),
  sand: new THREE.MeshStandardMaterial({ map: texture("#d6be85", "#bda269", 10, 80), roughness: 1 }), dirt: new THREE.MeshStandardMaterial({ map: texture("#806b48", "#5b4531", 9, 90), roughness: .98 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x102436, roughness: .18, metalness: .25 }), tire: new THREE.MeshStandardMaterial({ color: 0x050607, roughness: .92 }),
  black: new THREE.MeshStandardMaterial({ color: 0x050606, roughness: .9 }), chrome: new THREE.MeshStandardMaterial({ color: 0xc5c8bd, roughness: .32, metalness: .5 }),
  lamp: new THREE.MeshBasicMaterial({ color: 0xfff0b0 }), brake: new THREE.MeshBasicMaterial({ color: 0xc31522 }), smoke: new THREE.MeshBasicMaterial({ color: 0x3e4248, transparent: true, opacity: 0, depthWrite: false }),
  rock: new THREE.MeshStandardMaterial({ color: 0x8a9188, roughness: .9 })
};
function box(w,h,d,m,x=0,y=0,z=0,shadow=true){ const o = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m); o.position.set(x,y,z); o.castShadow=shadow; o.receiveShadow=shadow; return o; }
function cyl(r1,r2,h,m,x,y,z,n=12){ const o = new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,n),m); o.position.set(x,y,z); o.castShadow=true; o.receiveShadow=true; return o; }

const roads = [
  { w: 34, closed: true, p: [[-585,-455],[-430,-330],[-215,-290],[-45,-170],[150,-180],[345,-55],[455,135],[640,285],[690,475],[510,650],[220,685],[-30,585],[-205,410],[-430,315],[-625,100],[-715,-145],[-585,-455]] },
  { w: 28, closed: false, p: [[-695,555],[-500,385],[-260,190],[-40,35],[145,-100],[360,-245],[600,-315],[830,-430]] },
  { w: 25, closed: false, p: [[-850,50],[-640,15],[-390,-25],[-150,-55],[100,-40],[360,15],[585,85],[830,120]] },
  { w: 23, closed: false, p: [[-535,-735],[-445,-535],[-315,-305],[-250,-125],[-320,80],[-270,310],[-95,520],[125,760]] },
  { w: 22, closed: false, p: [[270,735],[340,565],[440,420],[575,320],[750,250],[875,165]] }
];
function segment(center, length, width, material, heading, y, h){ const m = box(width,h,length,material,center.x,y,center.z,false); m.rotation.y = heading; scene.add(m); return m; }
function drawRoad(route) {
  const pts = (route.closed ? route.p.slice(0,-1) : route.p).map(([x,z]) => new THREE.Vector3(x,0,z));
  const curve = new THREE.CatmullRomCurve3(pts, route.closed, "catmullrom", .18);
  const steps = Math.max(140, Math.floor(curve.getLength()/8));
  const samples = []; let lane = 0;
  for (let i=1;i<=steps;i++) {
    const a = curve.getPoint((i-1)/steps), b = curve.getPoint(i/steps), c = a.clone().lerp(b,.5);
    const dx = b.x-a.x, dz = b.z-a.z, len = Math.hypot(dx,dz)+5, head = Math.atan2(dx,dz), y = groundY(c.x,c.z);
    segment(c, len+1, route.w+12, mat.curb, head, y+.06, .08);
    segment(c, len+2.5, route.w, mat.asphalt, head, y+.14, .1);
    roadSegments.push({ ax:a.x, az:a.z, bx:b.x, bz:b.z, w: route.w + 11 });
    lane += len;
    if (lane > 31) { segment(c, 13.5, 1.2, mat.lane, head, y+.23, .035); lane = 0; }
    if (i % 2 === 0) samples.push({ pos: c.clone(), heading: head, width: route.w });
  }
  roadRoutes.push({ samples, width: route.w, closed: route.closed });
}
function buildGround(){
  const g = new THREE.PlaneGeometry(WORLD,WORLD,60,60); const p = g.attributes.position;
  for (let i=0;i<p.count;i++) p.setZ(i, groundY(p.getX(i), p.getY(i)));
  g.computeVertexNormals(); const ground = new THREE.Mesh(g, mat.grass); ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);
  scene.add(box(350,.04,WORLD,mat.sand,-965,groundY(-965,0)+.02,0,false));
  const water = box(620,.03,WORLD,new THREE.MeshStandardMaterial({color:0x50bdd4,roughness:.18,metalness:.05}),-1240,-.25,0,false); scene.add(water);
  const dirt = box(430,.05,260,mat.dirt,405,groundY(405,450)+.05,450,false); dirt.rotation.y=.32; scene.add(dirt);
}
function addBuilding(x,z,w,d,h,rot,seed){
  if (footprintOnRoad(x,z,w,d,rot,30)) return;
  const m = new THREE.MeshStandardMaterial({ color:[0x39464f,0x514437,0x374b43,0x4a3948,0x30384e][seed%5], roughness:.8, metalness:.06 });
  const y = groundY(x,z), b = box(w,h,d,m,x,y+h/2,z); b.rotation.y = rot; scene.add(b); colliders.push({x:x-w/2,z:z-d/2,w,d});
  const cols = Math.max(2, Math.floor(w/18)), rows = Math.max(2, Math.floor(h/13));
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) if(rand(seed+r*11+c)>.38){ const win=box(4.5,3,.16, rand(seed+r+c)>.86 ? mat.lamp : mat.glass, x-w*.33+c*14, y+8+r*10, z+d/2+.13, false); win.rotation.y=rot; scene.add(win); }
}
function addTree(x,z,s,seed,pine=false){
  if (onRoad(new THREE.Vector3(x,0,z),24)) return;
  const y=groundY(x,z), g=new THREE.Group(); g.position.set(x,y,z); g.add(cyl(.34*s,.5*s,5.4*s,new THREE.MeshStandardMaterial({color:0x604225,roughness:.9}),0,2.7*s,0,8));
  const lm = new THREE.MeshStandardMaterial({color: pine ? 0x195b35 : 0x318044, roughness:.95});
  if(pine) for(let i=0;i<3;i++){ const l=new THREE.Mesh(new THREE.ConeGeometry((2.8-i*.45)*s,4.1*s,9),lm); l.position.y=(4.5+i*1.55)*s; l.castShadow=true; g.add(l); }
  else for(let i=0;i<5;i++){ const l=new THREE.Mesh(new THREE.IcosahedronGeometry((2.0+rand(seed+i)*1.1)*s,1),lm); l.position.set((rand(seed+i*3)-.5)*2*s,(5.3+rand(seed+i*5)*2.2)*s,(rand(seed+i*7)-.5)*2.4*s); l.castShadow=true; g.add(l); }
  scene.add(g);
}
function addRock(x,z,s,seed){ if(onRoad(new THREE.Vector3(x,0,z),22)) return; const r=new THREE.Mesh(new THREE.DodecahedronGeometry(s,0),mat.rock); r.position.set(x,groundY(x,z)+s*.42,z); r.rotation.set(rand(seed),rand(seed+2)*Math.PI,rand(seed+4)); r.scale.set(1.5,.65+rand(seed+5)*.7,1); r.castShadow=r.receiveShadow=true; scene.add(r); }
function buildWorld(){
  buildGround(); roads.forEach(drawRoad);
  roads[0].p.slice(1,-1).filter((_,i)=>i%2===0).forEach(([x,z])=>checkpoints.push(new THREE.Vector3(x,0,z)));
  [[-455,-170,90,56,92,-.18],[-330,-250,70,72,58,.24],[-190,-145,115,62,126,.07],[-80,-10,78,92,74,-.32],[80,-155,94,58,82,.38],[255,-215,72,84,60,-.12],[380,-20,105,70,92,.28],[505,170,80,74,54,-.28],[-535,155,78,62,48,.44],[-325,210,92,74,68,-.36],[-90,300,120,80,42,.16],[135,430,78,62,50,-.24]].forEach((b,i)=>addBuilding(b[0],b[1],b[2],b[3],b[4],b[5],i));
  const samples = roadRoutes.flatMap(r=>r.samples);
  for(let i=0;i<samples.length;i+=4){ const s=samples[i], side=i%2?-1:1, n=new THREE.Vector3(Math.cos(s.heading),0,-Math.sin(s.heading)); const x=s.pos.x+n.x*side*(s.width*.85+25+rand(i)*38), z=s.pos.z+n.z*side*(s.width*.85+25+rand(i+1)*38); addTree(x,z,.8+rand(i+2)*.65,i,i%3===0); }
  for(let i=0;i<260;i++){ const x=-880+rand(i)*1760, z=-860+rand(i+11)*1720; if(onRoad(new THREE.Vector3(x,0,z),32)) continue; if(rand(i+3)>.58)addTree(x,z,.6+rand(i+4)*.75,i+300,rand(i+8)>.55); else if(rand(i+7)>.62)addRock(x,z,1.2+rand(i+9)*4.8,i); }
  checkpoints.forEach((p)=>{ const r=new THREE.Mesh(new THREE.TorusGeometry(13,.7,12,64),new THREE.MeshBasicMaterial({color:0xffd35c,transparent:true,opacity:.84})); r.rotation.x=Math.PI/2; r.position.set(p.x,surfaceY(p.x,p.z)+.75,p.z); scene.add(r); rings.push(r); });
}
function makeCar(bodyColor=0xe9eef0){
  const g=new THREE.Group(), body=new THREE.MeshStandardMaterial({color:bodyColor,roughness:.42,metalness:.18}), parts=[];
  g.add(box(5.9,.82,9.4,body,0,.65,0),box(5.3,.35,3.4,body,0,1.05,2.2),box(5.2,.5,2.2,body,0,1.0,-3.05),box(4.2,.9,2.7,mat.glass,0,1.55,-.5),box(5.8,.28,.5,mat.black,0,.46,-4.8),box(1,.22,.16,mat.brake,-1.6,.9,-4.95,false),box(1,.22,.16,mat.brake,1.6,.9,-4.95,false),box(1,.18,.16,mat.lamp,-1.55,.95,4.85,false),box(1,.18,.16,mat.lamp,1.55,.95,4.85,false));
  for(const x of[-2.9,2.9])for(const z of[-3.1,3.1]){ const w=new THREE.Mesh(new THREE.CylinderGeometry(.72,.72,.58,18),mat.tire); w.rotation.z=Math.PI/2; w.position.set(x,.45,z); w.castShadow=true; g.add(w); }
  const dent=new THREE.MeshBasicMaterial({color:0x16191b,transparent:true,opacity:0}), scrape=new THREE.MeshBasicMaterial({color:0xf1e2ac,transparent:true,opacity:0});
  [box(1.7,.18,.08,dent.clone(),-1.2,1.12,4.96,false),box(1.7,.18,.08,dent.clone(),1.2,1.1,4.96,false),box(1.5,.2,.08,dent.clone(),0,1.0,-4.96,false),box(.08,.16,1.7,scrape.clone(),-3.02,1.15,0,false),box(.08,.16,1.7,scrape.clone(),3.02,1.15,.2,false)].forEach(p=>{p.visible=false;parts.push(p);g.add(p);});
  const sg=new THREE.Group(); for(let i=0;i<4;i++){ const p=new THREE.Mesh(new THREE.SphereGeometry(.42+i*.08,8,6),mat.smoke.clone()); p.position.set((rand(i+90)-.5)*1.1,1.3+rand(i+92),3.4+rand(i+94)); sg.add(p); } sg.visible=false; g.add(sg); g.userData={damage:0,parts,smoke:sg}; scene.add(g); return g;
}
function setDamage(g,d){ const a=THREE.MathUtils.clamp(d/100,0,1); g.userData.damage=d; (g.userData.parts||[]).forEach((p,i)=>{p.visible=a>.08+i*.06;p.material.opacity=THREE.MathUtils.clamp(a*1.25-i*.08,0,.9);}); if(g.userData.smoke){g.userData.smoke.visible=a>.28; g.userData.smoke.children.forEach((p,i)=>{p.material.opacity=a*(.08+rand(i+Math.floor(performance.now()*.003))*.16); p.scale.setScalar(.8+a*1.25+Math.sin(performance.now()*.005+i)*.14);});}}
function makeHuman(shirt=0x2c5fd7,pants=0x1b1b22,skin=0xb77955){ const g=new THREE.Group(), limbs=[]; g.add(cyl(.42,.55,1.25,new THREE.MeshStandardMaterial({color:shirt,roughness:.78}),0,1.8,0,10)); for(const side of[-1,1]){ const a=cyl(.11,.13,.9,new THREE.MeshStandardMaterial({color:skin,roughness:.78}),side*.55,1.75,0,8), l=cyl(.13,.15,.9,new THREE.MeshStandardMaterial({color:pants,roughness:.84}),side*.2,.72,0,8); limbs.push({a,l,side}); g.add(a,l,box(.32,.14,.5,mat.black,side*.2,.12,.1)); } const h=new THREE.Mesh(new THREE.SphereGeometry(.42,14,10),new THREE.MeshStandardMaterial({color:skin,roughness:.78})); h.position.y=2.75; h.castShadow=true; g.add(h); g.userData.limbs=limbs; scene.add(g); return g; }
function walk(g,phase,amt,fallen=false){ for(const l of g.userData.limbs||[]){ if(fallen){l.a.rotation.z=l.side*1.1;l.l.rotation.z=l.side*.45;} else {const s=Math.sin(phase)*amt; l.a.rotation.x=-s*l.side; l.l.rotation.x=s*l.side;} } }
function spawnActors(){
  playerCar=makeCar(0xe9eef0); activeVehicle=playerCar; person=makeHuman(); person.visible=false;
  const colors=[0xd4503f,0xe6bd58,0x4ca89d,0xd8d3c8,0x6376cb,0x9c4163];
  for(let i=0;i<30;i++){ const route=roadRoutes[i%roadRoutes.length], si=Math.floor(rand(i+4)*route.samples.length), s=route.samples[si], off=i%2?-6:6, n=new THREE.Vector3(Math.cos(s.heading),0,-Math.sin(s.heading)), p=s.pos.clone().addScaledVector(n,off), g=makeCar(colors[i%colors.length]); g.position.set(p.x,surfaceY(p.x,p.z),p.z); g.rotation.y=s.heading; traffic.push({group:g,routeIndex:i%roadRoutes.length,sampleIndex:si,laneOffset:off,dir:off<0?-1:1,heading:s.heading,speed:17+rand(i+3)*16,base:17+rand(i+3)*16,damage:0,hit:0}); }
  const all=roadRoutes.flatMap(r=>r.samples); for(let i=8,c=0;i<all.length&&c<18;i+=17,c++){ const s=all[i], side=c%2?-1:1, n=new THREE.Vector3(Math.cos(s.heading),0,-Math.sin(s.heading)), p=s.pos.clone().addScaledVector(n,side*(s.width*.8+7)), g=makeCar(colors[c%colors.length]); g.position.set(p.x,surfaceY(p.x,p.z),p.z); g.rotation.y=s.heading+(side>0?.08:Math.PI-.08); parkedCars.push({group:g,damage:0}); }
  for(let i=0;i<55;i++){ const s=all[(i*11+7)%all.length], side=i%2?-1:1, n=new THREE.Vector3(Math.cos(s.heading),0,-Math.sin(s.heading)), p=s.pos.clone().addScaledVector(n,side*(25+rand(i)*36)), h=makeHuman([0xd64b38,0x315bd8,0x2f9c58,0xe0c15c,0x9b4aa0][i%5],[0x1a1d24,0x293850,0x3b332a][i%3],[0x8d5a3f,0xbf8361,0x6e4939][i%3]); h.position.set(p.x,groundY(p.x,p.z),p.z); pedestrians.push({group:h,base:h.position.clone(),target:h.position.clone().add(new THREE.Vector3(Math.sin(i)*36,0,Math.cos(i)*36)),speed:3+rand(i+9)*2.8,panic:0,injured:0,fallen:0,hitVel:new THREE.Vector3(),phase:rand(i+12)*Math.PI*2,seed:i}); }
  contactShadow=new THREE.Mesh(new THREE.CircleGeometry(4.4,32),new THREE.MeshBasicMaterial({color:0x02060d,transparent:true,opacity:.42,depthWrite:false})); contactShadow.rotation.x=-Math.PI/2; scene.add(contactShadow); smoke=new THREE.Group(); for(let i=0;i<7;i++)smoke.add(new THREE.Mesh(new THREE.SphereGeometry(.55+i*.08,8,6),mat.smoke.clone())); scene.add(smoke);
}
function hitBuilding(pos){ return colliders.some(r=>pos.x>r.x-4&&pos.x<r.x+r.w+4&&pos.z>r.z-4&&pos.z<r.z+r.d+4); }
function hitParked(pos){ return parkedCars.find(p=>p.group!==activeVehicle&&p.group.position.distanceTo(pos)<7.4); }
function damagePlayer(n,dir){ car.damage=THREE.MathUtils.clamp(car.damage+n,0,100); car.hit=.24; setDamage(activeVehicle,car.damage); if(dir){activeVehicle.rotation.z+=THREE.MathUtils.clamp(dir.x*.08,-.14,.14); activeVehicle.rotation.x+=THREE.MathUtils.clamp(dir.z*.04,-.08,.08);} }
function damageOther(v,n,dir){ v.damage=THREE.MathUtils.clamp((v.damage||0)+n,0,100); v.hit=.22; setDamage(v.group,v.damage); if(dir){v.group.rotation.z+=THREE.MathUtils.clamp(-dir.x*.08,-.16,.16); v.group.rotation.x+=THREE.MathUtils.clamp(-dir.z*.04,-.1,.1);} }
function nearestParked(max=13){ let best=null,bd=max; for(const p of parkedCars.concat([{group:activeVehicle,own:true,damage:car.damage}])){ const d=p.group.position.distanceTo(person.position); if(d<bd){best=p;bd=d;} } return best; }
function toggleCar(){ if(cooldown>0)return; cooldown=.35; if(inCar){inCar=false; car.speed=0; person.visible=true; person.position.copy(car.pos).add(new THREE.Vector3(Math.cos(car.heading)*6,0,-Math.sin(car.heading)*6)); person.position.y=groundY(person.position.x,person.position.z); person.rotation.y=car.heading; return;} const t=nearestParked(); if(!t)return; inCar=true; activeVehicle=t.group; car.pos.copy(t.group.position); car.heading=t.group.rotation.y; car.speed=0; car.damage=t.own?car.damage:(t.damage||0); person.visible=false; }
function reset(){ car.pos.set(-585,surfaceY(-585,-455),-455); car.heading=.72; car.speed=0; car.steer=0; car.turn=0; car.boost=100; car.damage=0; car.drop=0; car.hit=0; inCar=true; activeVehicle=playerCar; setDamage(playerCar,0); person.visible=false; }
function updatePerson(dt){ const f=(keys.has("w")||keys.has("arrowup")?1:0)-(keys.has("s")||keys.has("arrowdown")?1:0), t=(keys.has("a")||keys.has("arrowleft")?1:0)-(keys.has("d")||keys.has("arrowright")?1:0); person.rotation.y+=t*2.8*dt; const old=person.position.clone(), fw=new THREE.Vector3(Math.sin(person.rotation.y),0,Math.cos(person.rotation.y)); person.position.addScaledVector(fw,f*(keys.has("shift")?18:10)*dt); person.position.x=THREE.MathUtils.clamp(person.position.x,-LIMIT,LIMIT); person.position.z=THREE.MathUtils.clamp(person.position.z,-LIMIT,LIMIT); person.position.y=groundY(person.position.x,person.position.z); if(hitBuilding(person.position))person.position.copy(old); walk(person,performance.now()*.01,Math.abs(f)*1.1); car.pos.copy(person.position); car.heading=person.rotation.y; }
function updatePlayer(dt){ cooldown=Math.max(0,cooldown-dt); car.hit=Math.max(0,car.hit-dt); if(keys.has("e"))toggleCar(); if(!inCar){document.body.classList.remove("boosting"); updatePerson(dt); return;} const accel=keys.has("w")||keys.has("arrowup"), brake=keys.has("s")||keys.has("arrowdown"), left=keys.has("a")||keys.has("arrowleft"), right=keys.has("d")||keys.has("arrowright"), hand=keys.has(" "), boost=(keys.has("shift")||keys.has("shiftleft")||keys.has("shiftright"))&&car.boost>0&&car.speed>12; const steerTarget=(left?1:0)-(right?1:0), roadGrip=onRoad(car.pos)?1:.62, damageGrip=THREE.MathUtils.lerp(1,.55,car.damage/100), max=(boost?96:72)*THREE.MathUtils.lerp(1,.58,car.damage/100); car.steer=THREE.MathUtils.lerp(car.steer,steerTarget,1-Math.pow(.0009,dt)); if(Math.abs(steerTarget)<.01)car.steer*=Math.pow(.08,dt); if(accel)car.speed+=(boost?82:50)*dt; if(brake)car.speed-=car.speed>8?74*dt:46*dt; car.speed*=Math.pow(hand?.965:.992,dt*60); car.speed*=Math.pow(roadGrip,dt*5); car.speed=THREE.MathUtils.clamp(car.speed,-22,max); car.boost=THREE.MathUtils.clamp(car.boost+(boost?-38:10)*dt,0,100); const turn=car.steer*THREE.MathUtils.clamp(Math.abs(car.speed)/38,.05,1.22)*damageGrip*(hand?2.45:1.45)*(car.speed<0?-1:1); car.turn=THREE.MathUtils.lerp(car.turn,turn,1-Math.pow(.0016,dt)); car.heading+=car.turn*dt; const old=car.pos.clone(), fw=new THREE.Vector3(Math.sin(car.heading),0,Math.cos(car.heading)), side=new THREE.Vector3(Math.cos(car.heading),0,-Math.sin(car.heading)); car.pos.addScaledVector(fw,car.speed*dt); if(hand)car.pos.addScaledVector(side,car.steer*Math.abs(car.speed)*.23*dt); car.pos.x=THREE.MathUtils.clamp(car.pos.x,-LIMIT,LIMIT); car.pos.z=THREE.MathUtils.clamp(car.pos.z,-LIMIT,LIMIT); car.pos.y=surfaceY(car.pos.x,car.pos.z); const parked=hitParked(car.pos); if(hitBuilding(car.pos)||parked){ const force=Math.abs(car.speed), dir=car.pos.clone().sub(old).normalize(); car.pos.copy(old); car.speed*=-.28; if(force>10)damagePlayer(5+force*.26,dir); if(parked&&force>8)damageOther(parked,5+force*.22,dir); } activeVehicle.position.copy(car.pos); activeVehicle.rotation.y=car.heading; const impact=car.hit>0?Math.sin(performance.now()*.07)*car.hit*.18:0; activeVehicle.rotation.z=THREE.MathUtils.lerp(activeVehicle.rotation.z,-car.steer*THREE.MathUtils.clamp(Math.abs(car.speed)/80,0,1)*.12+impact,1-Math.pow(.002,dt)); activeVehicle.rotation.x=THREE.MathUtils.lerp(activeVehicle.rotation.x,0,1-Math.pow(.006,dt)); document.body.classList.toggle("boosting",boost); }
function updateTraffic(dt){ for(const npc of traffic){ npc.hit=Math.max(0,(npc.hit||0)-dt); const r=roadRoutes[npc.routeIndex]; let ni=npc.sampleIndex+npc.dir; if(r.closed)ni=(ni+r.samples.length)%r.samples.length; else if(ni<=0||ni>=r.samples.length-1){npc.dir*=-1; ni=THREE.MathUtils.clamp(npc.sampleIndex+npc.dir,0,r.samples.length-1);} const s=r.samples[ni], n=new THREE.Vector3(Math.cos(s.heading),0,-Math.sin(s.heading)), target=s.pos.clone().addScaledVector(n,npc.laneOffset), to=target.sub(npc.group.position); if(to.length()<7)npc.sampleIndex=ni; const dir=to.normalize(); npc.heading=Math.atan2(dir.x,dir.z); npc.group.position.addScaledVector(dir,npc.speed*dt); npc.group.position.y=surfaceY(npc.group.position.x,npc.group.position.z); npc.group.rotation.y=THREE.MathUtils.lerp(npc.group.rotation.y,npc.heading,1-Math.pow(.001,dt)); npc.speed=npc.base*(.8+Math.sin(performance.now()*.001+npc.base)*.18); const d=npc.group.position.distanceTo(car.pos); if(d<7.5){ const away=car.pos.clone().sub(npc.group.position).normalize(); car.pos.addScaledVector(away,4.2); npc.group.position.addScaledVector(away,-2.8); damagePlayer(7+Math.abs(car.speed)*.18,away); damageOther(npc,6+Math.abs(car.speed)*.2,away); npc.speed*=.35; car.speed*=-.42; } if(npc.hit>0)npc.group.rotation.z=THREE.MathUtils.lerp(npc.group.rotation.z,Math.sin(performance.now()*.07)*npc.hit*.2,1-Math.pow(.004,dt)); else npc.group.rotation.z=THREE.MathUtils.lerp(npc.group.rotation.z,0,1-Math.pow(.004,dt)); if(npc.group.userData.damage>28)setDamage(npc.group,npc.group.userData.damage); } }
function updatePedestrians(dt){ const now=performance.now()*.001; for(const p of pedestrians){ const toCar=p.group.position.clone().sub(car.pos), dc=toCar.length(); if(p.fallen>0){p.fallen-=dt; p.group.position.addScaledVector(p.hitVel,dt); p.hitVel.multiplyScalar(Math.pow(.08,dt)); p.group.position.y=groundY(p.group.position.x,p.group.position.z)+.18; p.group.rotation.x=THREE.MathUtils.lerp(p.group.rotation.x,Math.PI/2,1-Math.pow(.0003,dt)); walk(p.group,p.phase,0,true); continue;} if(p.injured>0)p.injured=Math.max(0,p.injured-dt*.12); if(inCar&&dc<46&&Math.abs(car.speed)>18&&p.injured<=0){p.panic=Math.max(p.panic,1.6); p.target.copy(p.group.position).addScaledVector(toCar.normalize(),48);} if(inCar&&dc<5.2&&Math.abs(car.speed)>10&&p.injured<=.2){ const push=p.group.position.clone().sub(car.pos).normalize(); p.injured=1; p.fallen=2.8+THREE.MathUtils.clamp(Math.abs(car.speed)/24,0,2.2); p.hitVel.copy(push).multiplyScalar(10+Math.abs(car.speed)*.36); car.speed*=.5; damagePlayer(4+Math.abs(car.speed)*.18,push); continue;} p.panic=Math.max(0,p.panic-dt); const to=p.target.clone().sub(p.group.position); if(to.length()<4){ const a=rand(p.seed+Math.floor(now*.21)+Math.floor(p.base.x))*Math.PI*2, rr=14+rand(p.seed+Math.floor(now*.17)+9)*72; p.target.set(THREE.MathUtils.clamp(p.base.x+Math.sin(a)*rr,-870,870),0,THREE.MathUtils.clamp(p.base.z+Math.cos(a)*rr,-870,870)); } else { const dir=to.normalize(), sp=p.speed*(p.panic>0?2.6:1)*(p.injured>0?.42:1), old=p.group.position.clone(); p.group.position.addScaledVector(dir,sp*dt); if(hitBuilding(p.group.position))p.group.position.copy(old); p.group.rotation.y=Math.atan2(dir.x,dir.z); p.phase+=dt*sp*2.2; p.group.position.y=groundY(p.group.position.x,p.group.position.z)+Math.abs(Math.sin(p.phase))*.08; walk(p.group,p.phase,p.panic>0?1.35:.85); } } }
function updateRings(dt){ rings.forEach((r,i)=>{r.visible=i===car.drop; r.rotation.z+=dt*2.2; r.scale.setScalar(1+Math.sin(performance.now()*.006)*.1);}); const t=checkpoints[car.drop]; if(t&&Math.hypot(car.pos.x-t.x,car.pos.z-t.z)<18){car.drop=(car.drop+1)%checkpoints.length; car.boost=Math.min(100,car.boost+28);} }
function updateEffects(dt){ contactShadow.visible=inCar; smoke.visible=inCar&&car.damage>22; if(!inCar)return; contactShadow.position.set(car.pos.x,.08,car.pos.z); const fw=new THREE.Vector3(Math.sin(car.heading),0,Math.cos(car.heading)); smoke.position.copy(car.pos).addScaledVector(fw,2.8); smoke.position.y+=1.2; smoke.rotation.y=car.heading; const a=THREE.MathUtils.clamp((car.damage-18)/82,0,1); smoke.children.forEach((p,i)=>{p.material.opacity=a*(.12+rand(i+Math.floor(performance.now()*.003))*.22); p.scale.setScalar(.8+a*1.6+Math.sin(performance.now()*.004+i)*.16); p.position.y+=dt*(.8+i*.06); if(p.position.y>3.4)p.position.y=.8+rand(i)*.6;}); }
function updateCamera(dt){ const target=inCar?car.pos:person.position, h=inCar?car.heading:person.rotation.y, lean=inCar?THREE.MathUtils.clamp(Math.abs(car.speed)/70,0,1):0, dist=inCar?18+lean*11:13, height=inCar?7.2+lean*2.3:8, side=inCar?-car.steer*3.2*lean:0; const follow=new THREE.Vector3(target.x-Math.sin(h)*dist+Math.cos(h)*side,target.y+height,target.z-Math.cos(h)*dist-Math.sin(h)*side), look=new THREE.Vector3(target.x+Math.sin(h)*(inCar?18+lean*22:7),target.y+2.4+lean*.6,target.z+Math.cos(h)*(inCar?18+lean*22:7)); camera.fov=THREE.MathUtils.lerp(camera.fov,car.boost<92&&Math.abs(car.speed)>18?70:64,1-Math.pow(.004,dt)); camera.updateProjectionMatrix(); camera.position.lerp(follow,1-Math.pow(.0007,dt)); camera.lookAt(look); }
function hud(){ speedEl.textContent=inCar?String(Math.round(Math.abs(car.speed)*2.55)):"on foot"; routeEl.textContent=String(car.drop); damageEl.textContent=`${Math.round(car.damage)}%`; }
function resize(){ const r=canvas.getBoundingClientRect(); renderer.setSize(r.width,r.height,false); camera.aspect=r.width/r.height; camera.updateProjectionMatrix(); }
addEventListener("resize",resize); addEventListener("keydown",e=>{const k=e.key.toLowerCase(); if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k))e.preventDefault(); if(k==="r")reset(); keys.add(k);}); addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));
buildWorld(); spawnActors(); resize(); reset();
function animate(){ const dt=Math.min(clock.getDelta(),.033); updatePlayer(dt); updateTraffic(dt); updatePedestrians(dt); updateRings(dt); updateEffects(dt); updateCamera(dt); hud(); renderer.render(scene,camera); requestAnimationFrame(animate); }
animate();
