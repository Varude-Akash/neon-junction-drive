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
const people = [];
const checkpoints = [];
const rings = [];
const WORLD = 2600;
const LIMIT = 1120;
let playerCar, activeVehicle, person, shadow, smoke;
let inCar = true;
let cooldown = 0;

const car = { pos: new THREE.Vector3(-610, 0.7, -470), heading: 0.72, speed: 0, steer: 0, turn: 0, boost: 100, damage: 0, drop: 0, hit: 0 };

function rand(seed) { const x = Math.sin(seed * 127.31) * 43758.5453; return x - Math.floor(x); }
function distSeg(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az, apx = px - ax, apz = pz - az;
  const t = THREE.MathUtils.clamp((apx * abx + apz * abz) / (abx * abx + abz * abz || 1), 0, 1);
  const x = ax + abx * t, z = az + abz * t;
  return Math.hypot(px - x, pz - z);
}
function onRoad(pos, pad = 0) { return roadSegments.some((s) => distSeg(pos.x, pos.z, s.ax, s.az, s.bx, s.bz) < s.w * 0.5 + pad); }
function footprintOnRoad(x, z, w, d, rot = 0, pad = 24) {
  const pts = [[0,0],[-w/2,-d/2],[w/2,-d/2],[-w/2,d/2],[w/2,d/2],[-w/2,0],[w/2,0],[0,-d/2],[0,d/2]];
  const c = Math.cos(rot), s = Math.sin(rot);
  return pts.some(([lx,lz]) => onRoad(new THREE.Vector3(x + lx*c - lz*s, 0, z + lx*s + lz*c), pad));
}
function surfaceY() { return 0.7; }

function skyTexture() {
  const c = document.createElement("canvas"); c.width = 80; c.height = 256;
  const ctx = c.getContext("2d"); const g = ctx.createLinearGradient(0,0,0,256);
  g.addColorStop(0,"#62bbff"); g.addColorStop(.55,"#c7efff"); g.addColorStop(1,"#ffffff");
  ctx.fillStyle = g; ctx.fillRect(0,0,80,256);
  for (let i=0;i<34;i++) { const x=rand(i)*80, y=20+rand(i+4)*120, r=6+rand(i+8)*16; const cg=ctx.createRadialGradient(x,y,0,x,y,r); cg.addColorStop(0,"rgba(255,255,255,.7)"); cg.addColorStop(1,"rgba(255,255,255,0)"); ctx.fillStyle=cg; ctx.fillRect(x-r,y-r,r*2,r*2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
scene.background = skyTexture();
scene.fog = new THREE.Fog(0xccefff, 210, 1500);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 2600);
scene.add(new THREE.HemisphereLight(0xf6fbff, 0x6b8857, 2.35));
const sun = new THREE.DirectionalLight(0xffffff, 2.75);
sun.position.set(-260, 560, 290); sun.castShadow = true; sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.left = -580; sun.shadow.camera.right = 580; sun.shadow.camera.top = 580; sun.shadow.camera.bottom = -580;
scene.add(sun);

function tex(a,b,rep=8,n=80){ const c=document.createElement("canvas"); c.width=c.height=128; const x=c.getContext("2d"); x.fillStyle=a; x.fillRect(0,0,128,128); for(let i=0;i<n;i++){x.globalAlpha=.04+rand(i+rep)*.13; x.fillStyle=b; x.fillRect(rand(i)*128,rand(i+2)*128,4+rand(i+3)*26,1+rand(i+4)*16);} x.globalAlpha=1; const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rep,rep); t.colorSpace=THREE.SRGBColorSpace; return t; }
const mat = {
  grass: new THREE.MeshStandardMaterial({ map: tex("#68b866", "#2f7b3b", 34, 160), roughness: .98 }),
  asphalt: new THREE.MeshStandardMaterial({ map: tex("#32393e", "#181c20", 7, 90), roughness: .94 }),
  curb: new THREE.MeshStandardMaterial({ color: 0xa7b7ba, roughness: .75 }),
  lane: new THREE.MeshStandardMaterial({ color: 0xf8f1d4, roughness: .6 }),
  sand: new THREE.MeshStandardMaterial({ map: tex("#d6bf89", "#bea46d", 12, 90), roughness: 1 }),
  dirt: new THREE.MeshStandardMaterial({ map: tex("#7e6949", "#5b4531", 10, 90), roughness: .98 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x112638, roughness: .18, metalness: .25 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x050607, roughness: .94 }),
  black: new THREE.MeshStandardMaterial({ color: 0x050606, roughness: .9 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xc6c9bf, roughness: .32, metalness: .5 }),
  lamp: new THREE.MeshBasicMaterial({ color: 0xfff0b2 }),
  brake: new THREE.MeshBasicMaterial({ color: 0xc31522 }),
  smoke: new THREE.MeshBasicMaterial({ color: 0x3f4348, transparent: true, opacity: 0, depthWrite: false }),
  rock: new THREE.MeshStandardMaterial({ color: 0x8a9188, roughness: .9 })
};
function box(w,h,d,m,x=0,y=0,z=0,shadow=true){ const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m); o.position.set(x,y,z); o.castShadow=shadow; o.receiveShadow=shadow; return o; }
function cyl(r1,r2,h,m,x,y,z,n=12){ const o=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,n),m); o.position.set(x,y,z); o.castShadow=true; o.receiveShadow=true; return o; }

const roads = [
  { w: 34, closed: true, p: [[-610,-470],[-450,-330],[-220,-285],[-40,-165],[155,-180],[350,-55],[455,135],[640,285],[690,475],[510,650],[220,685],[-30,585],[-205,410],[-430,315],[-625,100],[-715,-145],[-610,-470]] },
  { w: 28, closed: false, p: [[-700,555],[-500,385],[-260,190],[-40,35],[145,-100],[360,-245],[600,-315],[830,-430]] },
  { w: 25, closed: false, p: [[-850,50],[-640,15],[-390,-25],[-150,-55],[100,-40],[360,15],[585,85],[830,120]] },
  { w: 23, closed: false, p: [[-535,-735],[-445,-535],[-315,-305],[-250,-125],[-320,80],[-270,310],[-95,520],[125,760]] },
  { w: 22, closed: false, p: [[270,735],[340,565],[440,420],[575,320],[750,250],[875,165]] }
];
function segment(c,len,w,m,head,y,h){ const s=box(w,h,len,m,c.x,y,c.z,false); s.rotation.y=head; scene.add(s); return s; }
function drawRoad(r){
  const pts=(r.closed?r.p.slice(0,-1):r.p).map(([x,z])=>new THREE.Vector3(x,0,z));
  const curve=new THREE.CatmullRomCurve3(pts,r.closed,"catmullrom",.18);
  const steps=Math.max(140,Math.floor(curve.getLength()/8)); const samples=[]; let lane=0;
  for(let i=1;i<=steps;i++){ const a=curve.getPoint((i-1)/steps), b=curve.getPoint(i/steps), c=a.clone().lerp(b,.5); const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)+5,head=Math.atan2(dx,dz); segment(c,len+1,r.w+12,mat.curb,head,.06,.08); segment(c,len+2.5,r.w,mat.asphalt,head,.14,.1); roadSegments.push({ax:a.x,az:a.z,bx:b.x,bz:b.z,w:r.w+11}); lane+=len; if(lane>31){segment(c,13.5,1.2,mat.lane,head,.23,.035); lane=0;} if(i%2===0)samples.push({pos:c.clone(),heading:head,width:r.w}); }
  roadRoutes.push({samples,width:r.w,closed:r.closed});
}
function buildWorld(){
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(WORLD,WORLD,1,1),mat.grass); ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);
  scene.add(box(360,.04,WORLD,mat.sand,-975,.03,0,false));
  scene.add(box(620,.03,WORLD,new THREE.MeshStandardMaterial({color:0x4ec0d8,roughness:.18,metalness:.05}),-1250,-.24,0,false));
  const dirt=box(430,.05,260,mat.dirt,405,.055,450,false); dirt.rotation.y=.32; scene.add(dirt);
  roads.forEach(drawRoad);
  roads[0].p.slice(1,-1).filter((_,i)=>i%2===0).forEach(([x,z])=>checkpoints.push(new THREE.Vector3(x,0,z)));
  [[-455,-170,90,56,92,-.18],[-330,-250,70,72,58,.24],[-190,-145,115,62,126,.07],[-80,-10,78,92,74,-.32],[80,-155,94,58,82,.38],[255,-215,72,84,60,-.12],[380,-20,105,70,92,.28],[505,170,80,74,54,-.28],[-535,155,78,62,48,.44],[-325,210,92,74,68,-.36],[-90,300,120,80,42,.16],[135,430,78,62,50,-.24]].forEach((b,i)=>addBuilding(b[0],b[1],b[2],b[3],b[4],b[5],i));
  const samples=roadRoutes.flatMap(r=>r.samples);
  for(let i=0;i<samples.length;i+=4){ const s=samples[i],side=i%2?-1:1,n=new THREE.Vector3(Math.cos(s.heading),0,-Math.sin(s.heading)); addTree(s.pos.x+n.x*side*(s.width*.85+25+rand(i)*38),s.pos.z+n.z*side*(s.width*.85+25+rand(i+1)*38),.8+rand(i+2)*.65,i,i%3===0); }
  for(let i=0;i<230;i++){ const x=-890+rand(i)*1780,z=-870+rand(i+11)*1740;if(onRoad(new THREE.Vector3(x,0,z),32))continue;if(rand(i+3)>.58)addTree(x,z,.6+rand(i+4)*.75,i+300,rand(i+8)>.55);else if(rand(i+7)>.62)addRock(x,z,1.2+rand(i+9)*4.8,i); }
  for(let i=0;i<18;i++){ const x=-950+rand(i)*1900,z=-900+rand(i+9)*1800;if(onRoad(new THREE.Vector3(x,0,z),90))continue; const h=new THREE.Mesh(new THREE.DodecahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:rand(i)>.5?0x5aa25b:0x6e9b55,roughness:.98})); h.position.set(x,4+rand(i+3)*5,z); h.scale.set(40+rand(i+5)*85,8+rand(i+6)*18,36+rand(i+7)*90); h.receiveShadow=true; scene.add(h); }
  checkpoints.forEach(p=>{ const r=new THREE.Mesh(new THREE.TorusGeometry(13,.7,12,64),new THREE.MeshBasicMaterial({color:0xffd35c,transparent:true,opacity:.84})); r.rotation.x=Math.PI/2; r.position.set(p.x,1.45,p.z); scene.add(r); rings.push(r); });
}
function addBuilding(x,z,w,d,h,rot,seed){ if(footprintOnRoad(x,z,w,d,rot,30))return; const m=new THREE.MeshStandardMaterial({color:[0x39464f,0x514437,0x374b43,0x4a3948,0x30384e][seed%5],roughness:.8,metalness:.06}); const b=box(w,h,d,m,x,h/2,z); b.rotation.y=rot; scene.add(b); colliders.push({x:x-w/2,z:z-d/2,w,d}); for(let r=0;r<Math.max(2,Math.floor(h/13));r++)for(let c=0;c<Math.max(2,Math.floor(w/18));c++)if(rand(seed+r*11+c)>.38){const win=box(4.5,3,.16,rand(seed+r+c)>.86?mat.lamp:mat.glass,x-w*.33+c*14,8+r*10,z+d/2+.13,false);win.rotation.y=rot;scene.add(win);} }
function addTree(x,z,s,seed,pine=false){ if(onRoad(new THREE.Vector3(x,0,z),24))return; const g=new THREE.Group(); g.position.set(x,0,z); g.add(cyl(.34*s,.5*s,5.4*s,new THREE.MeshStandardMaterial({color:0x604225,roughness:.9}),0,2.7*s,0,8)); const lm=new THREE.MeshStandardMaterial({color:pine?0x195b35:0x318044,roughness:.95}); if(pine)for(let i=0;i<3;i++){const l=new THREE.Mesh(new THREE.ConeGeometry((2.8-i*.45)*s,4.1*s,9),lm);l.position.y=(4.5+i*1.55)*s;l.castShadow=true;g.add(l);}else for(let i=0;i<5;i++){const l=new THREE.Mesh(new THREE.IcosahedronGeometry((2+rand(seed+i)*1.1)*s,1),lm);l.position.set((rand(seed+i*3)-.5)*2*s,(5.3+rand(seed+i*5)*2.2)*s,(rand(seed+i*7)-.5)*2.4*s);l.castShadow=true;g.add(l);}scene.add(g);}
function addRock(x,z,s,seed){ if(onRoad(new THREE.Vector3(x,0,z),22))return; const r=new THREE.Mesh(new THREE.DodecahedronGeometry(s,0),mat.rock); r.position.set(x,s*.42,z); r.rotation.set(rand(seed),rand(seed+2)*Math.PI,rand(seed+4)); r.scale.set(1.5,.65+rand(seed+5)*.7,1); r.castShadow=r.receiveShadow=true; scene.add(r); }
function makeCar(color=0xe9eef0){ const g=new THREE.Group(),body=new THREE.MeshStandardMaterial({color,roughness:.42,metalness:.18}),parts=[]; g.add(box(5.9,.82,9.4,body,0,.65,0),box(5.3,.35,3.4,body,0,1.05,2.2),box(5.2,.5,2.2,body,0,1.0,-3.05),box(4.2,.9,2.7,mat.glass,0,1.55,-.5),box(5.8,.28,.5,mat.black,0,.46,-4.8),box(1,.22,.16,mat.brake,-1.6,.9,-4.95,false),box(1,.22,.16,mat.brake,1.6,.9,-4.95,false),box(1,.18,.16,mat.lamp,-1.55,.95,4.85,false),box(1,.18,.16,mat.lamp,1.55,.95,4.85,false)); for(const x of[-2.9,2.9])for(const z of[-3.1,3.1]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.72,.72,.58,18),mat.tire);w.rotation.z=Math.PI/2;w.position.set(x,.45,z);w.castShadow=true;g.add(w);} const dent=new THREE.MeshBasicMaterial({color:0x16191b,transparent:true,opacity:0}),scrape=new THREE.MeshBasicMaterial({color:0xf1e2ac,transparent:true,opacity:0}); [box(1.7,.18,.08,dent.clone(),-1.2,1.12,4.96,false),box(1.7,.18,.08,dent.clone(),1.2,1.1,4.96,false),box(1.5,.2,.08,dent.clone(),0,1.0,-4.96,false),box(.08,.16,1.7,scrape.clone(),-3.02,1.15,0,false),box(.08,.16,1.7,scrape.clone(),3.02,1.15,.2,false)].forEach(p=>{p.visible=false;parts.push(p);g.add(p);}); const sg=new THREE.Group();for(let i=0;i<4;i++){const p=new THREE.Mesh(new THREE.SphereGeometry(.42+i*.08,8,6),mat.smoke.clone());p.position.set((rand(i+90)-.5)*1.1,1.3+rand(i+92),3.4+rand(i+94));sg.add(p);}sg.visible=false;g.add(sg);g.userData={damage:0,parts,smoke:sg};scene.add(g);return g; }
function setDamage(g,d){ const a=THREE.MathUtils.clamp(d/100,0,1);g.userData.damage=d;(g.userData.parts||[]).forEach((p,i)=>{p.visible=a>.08+i*.06;p.material.opacity=THREE.MathUtils.clamp(a*1.25-i*.08,0,.9);}); if(g.userData.smoke){g.userData.smoke.visible=a>.28;g.userData.smoke.children.forEach((p,i)=>{p.material.opacity=a*(.08+rand(i+Math.floor(performance.now()*.003))*.16);p.scale.setScalar(.8+a*1.25+Math.sin(performance.now()*.005+i)*.14);});}}
function makeHuman(shirt=0x2c5fd7,pants=0x1b1b22,skin=0xb77955){ const g=new THREE.Group(),limbs=[]; g.add(cyl(.42,.55,1.25,new THREE.MeshStandardMaterial({color:shirt,roughness:.78}),0,1.8,0,10)); for(const side of[-1,1]){const a=cyl(.11,.13,.9,new THREE.MeshStandardMaterial({color:skin,roughness:.78}),side*.55,1.75,0,8),l=cyl(.13,.15,.9,new THREE.MeshStandardMaterial({color:pants,roughness:.84}),side*.2,.72,0,8);limbs.push({a,l,side});g.add(a,l,box(.32,.14,.5,mat.black,side*.2,.12,.1));} const h=new THREE.Mesh(new THREE.SphereGeometry(.42,14,10),new THREE.MeshStandardMaterial({color:skin,roughness:.78}));h.position.y=2.75;h.castShadow=true;g.add(h);g.userData.limbs=limbs;scene.add(g);return g;}
function walk(g,phase,amt,fallen=false){for(const l of g.userData.limbs||[]){if(fallen){l.a.rotation.z=l.side*1.1;l.l.rotation.z=l.side*.45;}else{const s=Math.sin(phase)*amt;l.a.rotation.x=-s*l.side;l.l.rotation.x=s*l.side;}}}
function spawnActors(){ playerCar=makeCar(0xe9eef0);activeVehicle=playerCar;person=makeHuman();person.visible=false; const colors=[0xd4503f,0xe6bd58,0x4ca89d,0xd8d3c8,0x6376cb,0x9c4163]; for(let i=0;i<30;i++){const r=roadRoutes[i%roadRoutes.length],si=Math.floor(rand(i+4)*r.samples.length),s=r.samples[si],off=i%2?-6:6,n=new THREE.Vector3(Math.cos(s.heading),0,-Math.sin(s.heading)),p=s.pos.clone().addScaledVector(n,off),g=makeCar(colors[i%colors.length]);g.position.set(p.x,surfaceY(),p.z);g.rotation.y=s.heading;traffic.push({group:g,routeIndex:i%roadRoutes.length,sampleIndex:si,laneOffset:off,dir:off<0?-1:1,heading:s.heading,speed:17+rand(i+3)*16,base:17+rand(i+3)*16,damage:0,hit:0});} const all=roadRoutes.flatMap(r=>r.samples); for(let i=8,c=0;i<all.length&&c<18;i+=17,c++){const s=all[i],side=c%2?-1:1,n=new THREE.Vector3(Math.cos(s.heading),0,-Math.sin(s.heading)),p=s.pos.clone().addScaledVector(n,side*(s.width*.8+7)),g=makeCar(colors[c%colors.length]);g.position.set(p.x,surfaceY(),p.z);g.rotation.y=s.heading+(side>0?.08:Math.PI-.08);parkedCars.push({group:g,damage:0});} for(let i=0;i<55;i++){const s=all[(i*11+7)%all.length],side=i%2?-1:1,n=new THREE.Vector3(Math.cos(s.heading),0,-Math.sin(s.heading)),p=s.pos.clone().addScaledVector(n,side*(25+rand(i)*36)),h=makeHuman([0xd64b38,0x315bd8,0x2f9c58,0xe0c15c,0x9b4aa0][i%5],[0x1a1d24,0x293850,0x3b332a][i%3],[0x8d5a3f,0xbf8361,0x6e4939][i%3]);h.position.set(p.x,0,p.z);people.push({group:h,base:h.position.clone(),target:h.position.clone().add(new THREE.Vector3(Math.sin(i)*36,0,Math.cos(i)*36)),speed:3+rand(i+9)*2.8,panic:0,injured:0,fallen:0,hitVel:new THREE.Vector3(),phase:rand(i+12)*Math.PI*2,seed:i});} shadow=new THREE.Mesh(new THREE.CircleGeometry(4.4,32),new THREE.MeshBasicMaterial({color:0x02060d,transparent:true,opacity:.42,depthWrite:false}));shadow.rotation.x=-Math.PI/2;scene.add(shadow);smoke=new THREE.Group();for(let i=0;i<7;i++)smoke.add(new THREE.Mesh(new THREE.SphereGeometry(.55+i*.08,8,6),mat.smoke.clone()));scene.add(smoke);}
function hitBuilding(pos){return colliders.some(r=>pos.x>r.x-4&&pos.x<r.x+r.w+4&&pos.z>r.z-4&&pos.z<r.z+r.d+4);} function hitParked(pos){return parkedCars.find(p=>p.group!==activeVehicle&&p.group.position.distanceTo(pos)<7.4);} function damagePlayer(n,dir){car.damage=THREE.MathUtils.clamp(car.damage+n,0,100);car.hit=.24;setDamage(activeVehicle,car.damage);if(dir){activeVehicle.rotation.z+=THREE.MathUtils.clamp(dir.x*.08,-.14,.14);activeVehicle.rotation.x+=THREE.MathUtils.clamp(dir.z*.04,-.08,.08);}} function damageOther(v,n,dir){v.damage=THREE.MathUtils.clamp((v.damage||0)+n,0,100);v.hit=.22;setDamage(v.group,v.damage);if(dir){v.group.rotation.z+=THREE.MathUtils.clamp(-dir.x*.08,-.16,.16);v.group.rotation.x+=THREE.MathUtils.clamp(-dir.z*.04,-.1,.1);}}
function nearestParked(max=13){let best=null,bd=max;for(const p of parkedCars.concat([{group:activeVehicle,own:true,damage:car.damage}])){const d=p.group.position.distanceTo(person.position);if(d<bd){best=p;bd=d;}}return best;} function toggleCar(){if(cooldown>0)return;cooldown=.35;if(inCar){inCar=false;car.speed=0;person.visible=true;person.position.copy(car.pos).add(new THREE.Vector3(Math.cos(car.heading)*6,0,-Math.sin(car.heading)*6));person.position.y=0;person.rotation.y=car.heading;return;}const t=nearestParked();if(!t)return;inCar=true;activeVehicle=t.group;car.pos.copy(t.group.position);car.heading=t.group.rotation.y;car.speed=0;car.damage=t.own?car.damage:(t.damage||0);person.visible=false;} function reset(){car.pos.set(-610,surfaceY(),-470);car.heading=.72;car.speed=0;car.steer=0;car.turn=0;car.boost=100;car.damage=0;car.drop=0;car.hit=0;inCar=true;activeVehicle=playerCar;setDamage(playerCar,0);person.visible=false;playerCar.position.copy(car.pos);}
function updatePerson(dt){const f=(keys.has("w")||keys.has("arrowup")?1:0)-(keys.has("s")||keys.has("arrowdown")?1:0),t=(keys.has("a")||keys.has("arrowleft")?1:0)-(keys.has("d")||keys.has("arrowright")?1:0);person.rotation.y+=t*2.8*dt;const old=person.position.clone(),fw=new THREE.Vector3(Math.sin(person.rotation.y),0,Math.cos(person.rotation.y));person.position.addScaledVector(fw,f*(keys.has("shift")?18:10)*dt);person.position.x=THREE.MathUtils.clamp(person.position.x,-LIMIT,LIMIT);person.position.z=THREE.MathUtils.clamp(person.position.z,-LIMIT,LIMIT);person.position.y=0;if(hitBuilding(person.position))person.position.copy(old);walk(person,performance.now()*.01,Math.abs(f)*1.1);car.pos.copy(person.position);car.heading=person.rotation.y;}
function updatePlayer(dt){cooldown=Math.max(0,cooldown-dt);car.hit=Math.max(0,car.hit-dt);if(keys.has("e"))toggleCar();if(!inCar){document.body.classList.remove("boosting");updatePerson(dt);return;}const accel=keys.has("w")||keys.has("arrowup"),brake=keys.has("s")||keys.has("arrowdown"),left=keys.has("a")||keys.has("arrowleft"),right=keys.has("d")||keys.has("arrowright"),hand=keys.has(" "),boost=(keys.has("shift")||keys.has("shiftleft")||keys.has("shiftright"))&&car.boost>0&&car.speed>12;const steerTarget=(left?1:0)-(right?1:0),roadGrip=onRoad(car.pos)?1:.62,damageGrip=THREE.MathUtils.lerp(1,.55,car.damage/100),max=(boost?96:72)*THREE.MathUtils.lerp(1,.58,car.damage/100);car.steer=THREE.MathUtils.lerp(car.steer,steerTarget,1-Math.pow(.0009,dt));if(Math.abs(steerTarget)<.01)car.steer*=Math.pow(.08,dt);if(accel)car.speed+=(boost?82:50)*dt;if(brake)car.speed-=car.speed>8?74*dt:46*dt;car.speed*=Math.pow(hand?.965:.992,dt*60);car.speed*=Math.pow(roadGrip,dt*5);car.speed=THREE.MathUtils.clamp(car.speed,-22,max);car.boost=THREE.MathUtils.clamp(car.boost+(boost?-38:10)*dt,0,100);const turn=car.steer*THREE.MathUtils.clamp(Math.abs(car.speed)/38,.05,1.22)*damageGrip*(hand?2.45:1.45)*(car.speed<0?-1:1);car.turn=THREE.MathUtils.lerp(car.turn,turn,1-Math.pow(.0016,dt));car.heading+=car.turn*dt;const old=car.pos.clone(),fw=new THREE.Vector3(Math.sin(car.heading),0,Math.cos(car.heading)),side=new THREE.Vector3(Math.cos(car.heading),0,-Math.sin(car.heading));car.pos.addScaledVector(fw,car.speed*dt);if(hand)car.pos.addScaledVector(side,car.steer*Math.abs(car.speed)*.23*dt);car.pos.x=THREE.MathUtils.clamp(car.pos.x,-LIMIT,LIMIT);car.pos.z=THREE.MathUtils.clamp(car.pos.z,-LIMIT,LIMIT);car.pos.y=surfaceY();const parked=hitParked(car.pos);if(hitBuilding(car.pos)||parked){const force=Math.abs(car.speed),dir=car.pos.clone().sub(old).normalize();car.pos.copy(old);car.speed*=-.28;if(force>10)damagePlayer(5+force*.26,dir);if(parked&&force>8)damageOther(parked,5+force*.22,dir);}activeVehicle.position.copy(car.pos);activeVehicle.rotation.y=car.heading;const impact=car.hit>0?Math.sin(performance.now()*.07)*car.hit*.18:0;activeVehicle.rotation.z=THREE.MathUtils.lerp(activeVehicle.rotation.z,-car.steer*THREE.MathUtils.clamp(Math.abs(car.speed)/80,0,1)*.12+impact,1-Math.pow(.002,dt));activeVehicle.rotation.x=THREE.MathUtils.lerp(activeVehicle.rotation.x,0,1-Math.pow(.006,dt));document.body.classList.toggle("boosting",boost);}
function updateTraffic(dt){for(const npc of traffic){npc.hit=Math.max(0,(npc.hit||0)-dt);const r=roadRoutes[npc.routeIndex];let ni=npc.sampleIndex+npc.dir;if(r.closed)ni=(ni+r.samples.length)%r.samples.length;else if(ni<=0||ni>=r.samples.length-1){npc.dir*=-1;ni=THREE.MathUtils.clamp(npc.sampleIndex+npc.dir,0,r.samples.length-1);}const s=r.samples[ni],n=new THREE.Vector3(Math.cos(s.heading),0,-Math.sin(s.heading)),target=s.pos.clone().addScaledVector(n,npc.laneOffset),to=target.sub(npc.group.position);if(to.length()<7)npc.sampleIndex=ni;const dir=to.normalize();npc.heading=Math.atan2(dir.x,dir.z);npc.group.position.addScaledVector(dir,npc.speed*dt);npc.group.position.y=surfaceY();npc.group.rotation.y=THREE.MathUtils.lerp(npc.group.rotation.y,npc.heading,1-Math.pow(.001,dt));npc.speed=npc.base*(.8+Math.sin(performance.now()*.001+npc.base)*.18);const d=npc.group.position.distanceTo(car.pos);if(d<7.5){const away=car.pos.clone().sub(npc.group.position).normalize();car.pos.addScaledVector(away,4.2);npc.group.position.addScaledVector(away,-2.8);damagePlayer(7+Math.abs(car.speed)*.18,away);damageOther(npc,6+Math.abs(car.speed)*.2,away);npc.speed*=.35;car.speed*=-.42;}if(npc.hit>0)npc.group.rotation.z=THREE.MathUtils.lerp(npc.group.rotation.z,Math.sin(performance.now()*.07)*npc.hit*.2,1-Math.pow(.004,dt));else npc.group.rotation.z=THREE.MathUtils.lerp(npc.group.rotation.z,0,1-Math.pow(.004,dt));if(npc.group.userData.damage>28)setDamage(npc.group,npc.group.userData.damage);}}
function updatePeople(dt){const now=performance.now()*.001;for(const p of people){const toCar=p.group.position.clone().sub(car.pos),dc=toCar.length();if(p.fallen>0){p.fallen-=dt;p.group.position.addScaledVector(p.hitVel,dt);p.hitVel.multiplyScalar(Math.pow(.08,dt));p.group.position.y=.18;p.group.rotation.x=THREE.MathUtils.lerp(p.group.rotation.x,Math.PI/2,1-Math.pow(.0003,dt));walk(p.group,p.phase,0,true);continue;}if(p.injured>0)p.injured=Math.max(0,p.injured-dt*.12);if(inCar&&dc<46&&Math.abs(car.speed)>18&&p.injured<=0){p.panic=Math.max(p.panic,1.6);p.target.copy(p.group.position).addScaledVector(toCar.normalize(),48);}if(inCar&&dc<5.2&&Math.abs(car.speed)>10&&p.injured<=.2){const push=p.group.position.clone().sub(car.pos).normalize();p.injured=1;p.fallen=2.8+THREE.MathUtils.clamp(Math.abs(car.speed)/24,0,2.2);p.hitVel.copy(push).multiplyScalar(10+Math.abs(car.speed)*.36);car.speed*=.5;damagePlayer(4+Math.abs(car.speed)*.18,push);continue;}p.panic=Math.max(0,p.panic-dt);const to=p.target.clone().sub(p.group.position);if(to.length()<4){const a=rand(p.seed+Math.floor(now*.21)+Math.floor(p.base.x))*Math.PI*2,rr=14+rand(p.seed+Math.floor(now*.17)+9)*72;p.target.set(THREE.MathUtils.clamp(p.base.x+Math.sin(a)*rr,-870,870),0,THREE.MathUtils.clamp(p.base.z+Math.cos(a)*rr,-870,870));}else{const dir=to.normalize(),sp=p.speed*(p.panic>0?2.6:1)*(p.injured>0?.42:1),old=p.group.position.clone();p.group.position.addScaledVector(dir,sp*dt);if(hitBuilding(p.group.position))p.group.position.copy(old);p.group.rotation.y=Math.atan2(dir.x,dir.z);p.phase+=dt*sp*2.2;p.group.position.y=Math.abs(Math.sin(p.phase))*.08;walk(p.group,p.phase,p.panic>0?1.35:.85);}}}
function updateRings(dt){rings.forEach((r,i)=>{r.visible=i===car.drop;r.rotation.z+=dt*2.2;r.scale.setScalar(1+Math.sin(performance.now()*.006)*.1);});const t=checkpoints[car.drop];if(t&&Math.hypot(car.pos.x-t.x,car.pos.z-t.z)<18){car.drop=(car.drop+1)%checkpoints.length;car.boost=Math.min(100,car.boost+28);}}
function updateEffects(dt){shadow.visible=inCar;smoke.visible=inCar&&car.damage>22;if(!inCar)return;shadow.position.set(car.pos.x,.08,car.pos.z);const fw=new THREE.Vector3(Math.sin(car.heading),0,Math.cos(car.heading));smoke.position.copy(car.pos).addScaledVector(fw,2.8);smoke.position.y+=1.2;smoke.rotation.y=car.heading;const a=THREE.MathUtils.clamp((car.damage-18)/82,0,1);smoke.children.forEach((p,i)=>{p.material.opacity=a*(.12+rand(i+Math.floor(performance.now()*.003))*.22);p.scale.setScalar(.8+a*1.6+Math.sin(performance.now()*.004+i)*.16);p.position.y+=dt*(.8+i*.06);if(p.position.y>3.4)p.position.y=.8+rand(i)*.6;});}
function updateCamera(dt){const target=inCar?car.pos:person.position,h=inCar?car.heading:person.rotation.y,lean=inCar?THREE.MathUtils.clamp(Math.abs(car.speed)/70,0,1):0,dist=inCar?20+lean*10:14,height=inCar?9.5+lean*2.5:8.5,side=inCar?-car.steer*3*lean:0;const follow=new THREE.Vector3(target.x-Math.sin(h)*dist+Math.cos(h)*side,height,target.z-Math.cos(h)*dist-Math.sin(h)*side),look=new THREE.Vector3(target.x+Math.sin(h)*(18+lean*22),2.8+lean*.7,target.z+Math.cos(h)*(18+lean*22));camera.fov=THREE.MathUtils.lerp(camera.fov,car.boost<92&&Math.abs(car.speed)>18?70:64,1-Math.pow(.004,dt));camera.updateProjectionMatrix();camera.position.lerp(follow,1-Math.pow(.0007,dt));camera.lookAt(look);}
function hud(){speedEl.textContent=inCar?String(Math.round(Math.abs(car.speed)*2.55)):"on foot";routeEl.textContent=String(car.drop);damageEl.textContent=`${Math.round(car.damage)}%`;}
function resize(){const r=canvas.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();}
addEventListener("resize",resize);addEventListener("keydown",e=>{const k=e.key.toLowerCase();if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k))e.preventDefault();if(k==="r")reset();keys.add(k);});addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));
buildWorld();spawnActors();resize();reset();
function animate(){const dt=Math.min(clock.getDelta(),.033);updatePlayer(dt);updateTraffic(dt);updatePeople(dt);updateRings(dt);updateEffects(dt);updateCamera(dt);hud();renderer.render(scene,camera);requestAnimationFrame(animate);}
animate();
