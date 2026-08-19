import * as THREE from "three";

const canvas = document.getElementById("game");
const speedEl = document.getElementById("speed");
const routeEl = document.getElementById("route");
const damageEl = document.getElementById("damage");

const scene = new THREE.Scene();
const clock = new THREE.Clock();
const keys = new Set();
const WORLD = 3600;
const PLAY_LIMIT = 1350;
const roadSegments = [];
const roadRoutes = [];
const colliders = [];
const traffic = [];
const parkedCars = [];
const pedestrians = [];
const checkpoints = [];
const checkpointMeshes = [];
let playerCar, activeVehicle, person, contactShadow, smoke;
let inCar = true;
let cooldown = 0;

function rand(seed) {
  const x = Math.sin(seed * 127.31) * 43758.5453;
  return x - Math.floor(x);
}
function segmentDistance(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az, apx = px - ax, apz = pz - az;
  const t = THREE.MathUtils.clamp((apx * abx + apz * abz) / (abx * abx + abz * abz || 1), 0, 1);
  const cx = ax + abx * t, cz = az + abz * t;
  return Math.hypot(px - cx, pz - cz);
}
function isOnRoad(pos, pad = 0) {
  return roadSegments.some((s) => segmentDistance(pos.x, pos.z, s.ax, s.az, s.bx, s.bz) < s.width * 0.5 + pad);
}
function nearestRoadSample(pos) {
  let best = null, bestDist = Infinity;
  for (const route of roadRoutes) for (const sample of route.samples) {
    const d = Math.hypot(pos.x - sample.position.x, pos.z - sample.position.z);
    if (d < bestDist) { best = sample; bestDist = d; }
  }
  return best;
}

function makeSkyTexture() {
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#62b9ff");
  g.addColorStop(0.52, "#c8efff");
  g.addColorStop(1, "#ffffff");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 96, 256);
  for (let i = 0; i < 42; i += 1) {
    const x = rand(i) * 96, y = 18 + rand(i + 4) * 112, r = 6 + rand(i + 9) * 18;
    const cloud = ctx.createRadialGradient(x, y, 0, x, y, r);
    cloud.addColorStop(0, "rgba(255,255,255,.74)");
    cloud.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = cloud;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
scene.background = makeSkyTexture();
scene.fog = new THREE.Fog(0xc8eaff, 180, 1700);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.3));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 3000);
scene.add(new THREE.HemisphereLight(0xf8fbff, 0x6d8550, 2.35));
const sun = new THREE.DirectionalLight(0xffffff, 2.7);
sun.position.set(-260, 560, 290);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -650;
sun.shadow.camera.right = 650;
sun.shadow.camera.top = 650;
sun.shadow.camera.bottom = -650;
scene.add(sun);

function tex(c1, c2, scale = 4, noise = 48) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = c1;
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < noise; i += 1) {
    ctx.fillStyle = c2;
    ctx.globalAlpha = 0.05 + rand(i + scale) * 0.13;
    ctx.fillRect(rand(i) * 128, rand(i + 2) * 128, 4 + rand(i + 3) * 26, 1 + rand(i + 4) * 16);
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(scale, scale);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const mat = {
  grass: new THREE.MeshStandardMaterial({ map: tex("#62aa5c", "#2e7136", 36, 160), roughness: .98 }),
  asphalt: new THREE.MeshStandardMaterial({ map: tex("#30363b", "#15191d", 8, 90), roughness: .94 }),
  shoulder: new THREE.MeshStandardMaterial({ color: 0x858d86, roughness: .86 }),
  lane: new THREE.MeshStandardMaterial({ color: 0xf8f1d4, roughness: .58 }),
  dirt: new THREE.MeshStandardMaterial({ map: tex("#816a45", "#594331", 10, 100), roughness: .98 }),
  sand: new THREE.MeshStandardMaterial({ map: tex("#d8bf86", "#bea56e", 12, 90), roughness: 1 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x8d938a, roughness: .9 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x122638, roughness: .2, metalness: .28 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x070707, roughness: .95 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xc2c8c0, roughness: .34, metalness: .45 }),
  white: new THREE.MeshStandardMaterial({ color: 0xe9eef0, roughness: .34, metalness: .3 }),
  black: new THREE.MeshStandardMaterial({ color: 0x050606, roughness: .9 }),
  lamp: new THREE.MeshBasicMaterial({ color: 0xfff0b2 }),
  brake: new THREE.MeshBasicMaterial({ color: 0xc41521 }),
  smoke: new THREE.MeshBasicMaterial({ color: 0x45484d, transparent: true, opacity: 0, depthWrite: false }),
};
function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function cyl(r1, r2, h, material, x, y, z, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const roads = [
  { w: 36, p: [[-510,-500],[-360,-360],[-120,-270],[120,-220],[315,-90],[430,120],[600,250],[700,460],[520,650],[230,700],[-40,590],[-225,390],[-440,280],[-590,70],[-650,-170],[-510,-500]], closed: true },
  { w: 31, p: [[-650,540],[-470,380],[-245,180],[-35,30],[150,-110],[370,-245],[590,-315],[805,-430]], closed: false },
  { w: 28, p: [[-820,40],[-620,10],[-390,-30],[-145,-55],[105,-40],[345,20],[575,85],[790,120]], closed: false },
  { w: 25, p: [[-520,-720],[-430,-530],[-305,-305],[-250,-120],[-315,90],[-265,315],[-95,520],[130,760]], closed: false },
  { w: 24, p: [[260,720],[330,560],[430,420],[565,320],[735,250],[850,160]], closed: false },
];
const startPoint = new THREE.Vector3(-510, 0.45, -500);
const car = { position: startPoint.clone(), heading: .74, speed: 0, steer: 0, turnVelocity: 0, tilt: 0, boost: 100, drop: 0, damage: 0, hitCooldown: 0 };

function drawRoad(route) {
  const pts = route.p.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, route.closed, "catmullrom", .18);
  const steps = Math.max(120, Math.floor(curve.getLength() / 8));
  const samples = [];
  let laneCarry = 0;
  for (let i = 1; i <= steps; i += 1) {
    const a = curve.getPoint((i - 1) / steps), b = curve.getPoint(i / steps), c = a.clone().lerp(b, .5);
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) + 5.5, heading = Math.atan2(dx, dz);
    const shoulder = box(route.w + 12, .08, len + 1, mat.shoulder, c.x, .06, c.z);
    shoulder.rotation.y = heading;
    scene.add(shoulder);
    const asphalt = box(route.w, .09, len + 2.5, mat.asphalt, c.x, .13, c.z);
    asphalt.rotation.y = heading;
    scene.add(asphalt);
    roadSegments.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, width: route.w + 10 });
    laneCarry += len;
    if (laneCarry > 31) {
      const lane = box(1.2, .035, 13.5, mat.lane, c.x, .21, c.z);
      lane.rotation.y = heading;
      scene.add(lane);
      laneCarry = 0;
    }
    if (i % 2 === 0) samples.push({ position: c.clone(), heading, width: route.w });
  }
  roadRoutes.push({ samples, width: route.w, closed: route.closed });
}
function addGround() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD, 1, 1), mat.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);
  const dirt = box(500, .04, 310, mat.dirt, 390, .03, 455);
  dirt.rotation.y = .32;
  scene.add(dirt);
  const sand = box(360, .04, 900, mat.sand, -1260, .02, 0);
  sand.castShadow = false;
  scene.add(sand);
}
function addBuildings() {
  [[-455,-170,90,56,92,-.18],[-330,-250,70,72,58,.24],[-190,-145,115,62,126,.07],[-80,-10,78,92,74,-.32],[80,-155,94,58,82,.38],[255,-215,72,84,60,-.12],[380,-20,105,70,92,.28],[505,170,80,74,54,-.28],[-535,155,78,62,48,.44],[-325,210,92,74,68,-.36],[-90,300,120,80,42,.16],[135,430,78,62,50,-.24]].forEach((b, i) => {
    const [x, z, w, d, h, rot] = b;
    const body = box(w, h, d, new THREE.MeshStandardMaterial({ color: [0x39464f,0x514437,0x374b43,0x4a3948,0x30384e][i % 5], roughness: .8 }), x, h / 2, z);
    body.rotation.y = rot;
    scene.add(body);
    colliders.push({ x: x - w / 2, z: z - d / 2, w, d });
    for (let r = 0; r < Math.max(2, Math.floor(h / 14)); r += 1) for (let c = 0; c < Math.max(2, Math.floor(w / 18)); c += 1) if (rand(i + r * 9 + c) > .35) {
      const win = box(4.5, 3, .16, rand(i + r + c) > .86 ? new THREE.MeshBasicMaterial({ color: 0xffcf69 }) : mat.glass, x - w * .32 + c * 14, 7 + r * 10, z + d / 2 + .12);
      win.rotation.y = rot;
      scene.add(win);
    }
  });
}
function addBackgroundHill(x, z, sx, sy, sz, color, seed) {
  if (isOnRoad(new THREE.Vector3(x, 0, z), 90)) return;
  const hill = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color, roughness: .98 }));
  hill.position.set(x, sy * .42 - .35, z);
  hill.scale.set(sx, sy, sz);
  hill.rotation.set(rand(seed) * .2, rand(seed + 1) * Math.PI, rand(seed + 2) * .18);
  hill.receiveShadow = true;
  scene.add(hill);
}
function addTree(x, z, s, seed, type = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(cyl(.34 * s, .5 * s, 5.2 * s, new THREE.MeshStandardMaterial({ color: 0x5d4127, roughness: .9 }), 0, 2.6 * s, 0, 8));
  const leafMat = new THREE.MeshStandardMaterial({ color: type ? 0x1d5c35 : 0x327d3f, roughness: .94 });
  if (type) for (let i = 0; i < 3; i += 1) { const m = new THREE.Mesh(new THREE.ConeGeometry((2.8 - i * .45) * s, 4.1 * s, 9), leafMat); m.position.y = (4.5 + i * 1.55) * s; m.castShadow = true; g.add(m); }
  else for (let i = 0; i < 5; i += 1) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry((2.1 + rand(seed + i) * 1.15) * s, 1), leafMat); m.position.set((rand(seed + i * 3) - .5) * 2.2 * s, (5.3 + rand(seed + i * 5) * 2.2) * s, (rand(seed + i * 7) - .5) * 2.4 * s); m.scale.y = .8 + rand(seed + i * 11) * .4; m.castShadow = true; g.add(m); }
  scene.add(g);
}
function addBush(x, z, s, seed) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8 * s, 1), new THREE.MeshStandardMaterial({ color: seed % 2 ? 0x3f8b3f : 0x527b36, roughness: .98 }));
  m.position.set(x, .9 * s, z);
  m.scale.set(1.4, .65, 1);
  m.castShadow = true;
  scene.add(m);
}
function addRock(x, z, s, seed) {
  const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat.rock);
  r.position.set(x, s * .42, z);
  r.rotation.set(rand(seed) * 1.4, rand(seed + 2) * Math.PI, rand(seed + 4) * .7);
  r.scale.set(1.5, .65 + rand(seed + 5) * .7, 1);
  r.castShadow = true;
  r.receiveShadow = true;
  scene.add(r);
}
function addNature() {
  const samples = roadRoutes.flatMap((r) => r.samples);
  for (let i = 0; i < samples.length; i += 3) {
    const s = samples[i], side = i % 2 ? -1 : 1, n = new THREE.Vector3(Math.cos(s.heading), 0, -Math.sin(s.heading));
    const x = s.position.x + n.x * side * (s.width * .82 + 30 + rand(i) * 40), z = s.position.z + n.z * side * (s.width * .82 + 30 + rand(i + 1) * 40);
    if (Math.abs(x) < 1100 && Math.abs(z) < 1100 && !isOnRoad(new THREE.Vector3(x, 0, z), 25)) (i % 3 === 0 ? addTree : addBush)(x, z, .8 + rand(i + 5) * .7, i, i % 2);
  }
  for (let i = 0; i < 390; i += 1) {
    const x = -1250 + rand(i) * 2500, z = -1250 + rand(i + 11) * 2500;
    if (isOnRoad(new THREE.Vector3(x, 0, z), 35)) continue;
    if (rand(i + 2) > .68) addTree(x, z, .65 + rand(i + 3) * .75, i, rand(i + 8) > .55 ? 1 : 0);
    else if (rand(i + 4) > .47) addBush(x, z, .8 + rand(i + 5) * 1.2, i);
    if (rand(i + 17) > .75) addRock(x + rand(i + 9) * 22, z + rand(i + 13) * 22, 1.2 + rand(i + 19) * 5, i);
  }
  for (let i = 0; i < 20; i += 1) {
    const angle = rand(i) * Math.PI * 2;
    const radius = 1150 + rand(i + 3) * 420;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    addBackgroundHill(x, z, 35 + rand(i + 8) * 80, 7 + rand(i + 10) * 18, 28 + rand(i + 12) * 80, rand(i + 6) > .5 ? 0x4c9851 : 0x6b8b52, i);
  }
}
function buildWorld() {
  addGround();
  roads.forEach(drawRoad);
  roads[0].p.filter((_, i) => i % 2 === 1).forEach(([x, z]) => checkpoints.push(new THREE.Vector3(x, 1.3, z)));
  addBuildings();
  addNature();
  checkpoints.forEach((p) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(13, .7, 12, 64), new THREE.MeshBasicMaterial({ color: 0xffd35c, transparent: true, opacity: .84 })); ring.rotation.x = Math.PI / 2; ring.position.copy(p); scene.add(ring); checkpointMeshes.push(ring); });
}
function makeCar(bodyMat = mat.white) {
  const g = new THREE.Group();
  const body = box(5.8, .75, 9.4, bodyMat, 0, .65, 0), hood = box(5.2, .38, 3.4, bodyMat, 0, 1.02, 2.25), rear = box(5.35, .5, 2.2, bodyMat, 0, 1.0, -3.05), cabin = box(4.15, .9, 2.7, mat.glass, 0, 1.55, -.55);
  cabin.rotation.x = -.05;
  g.add(body, hood, rear, cabin, box(5.9, .28, .5, mat.black, 0, .48, -4.8), box(1, .22, .18, mat.brake, -1.6, .9, -4.95), box(1, .22, .18, mat.brake, 1.6, .9, -4.95), box(1, .18, .16, mat.lamp, -1.55, .95, 4.8), box(1, .18, .16, mat.lamp, 1.55, .95, 4.8));
  for (const x of [-2.9, 2.9]) for (const z of [-3.1, 3.1]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(.72, .72, .58, 18), mat.tire); wh.rotation.z = Math.PI / 2; wh.position.set(x, .45, z); wh.castShadow = true; g.add(wh); }
  scene.add(g);
  return g;
}
function makeHuman(shirt, pants, skin) {
  const g = new THREE.Group(), limbs = [];
  g.add(cyl(.42, .55, 1.25, new THREE.MeshStandardMaterial({ color: shirt, roughness: .78 }), 0, 1.8, 0, 10));
  for (const side of [-1, 1]) { const arm = cyl(.11, .13, .9, new THREE.MeshStandardMaterial({ color: skin, roughness: .78 }), side * .55, 1.75, 0, 8), leg = cyl(.13, .15, .9, new THREE.MeshStandardMaterial({ color: pants, roughness: .84 }), side * .2, .72, 0, 8); limbs.push({ arm, leg, side }); g.add(arm, leg, box(.32, .14, .5, mat.black, side * .2, .12, .1)); }
  const head = new THREE.Mesh(new THREE.SphereGeometry(.42, 14, 10), new THREE.MeshStandardMaterial({ color: skin, roughness: .78 }));
  head.position.y = 2.75;
  head.castShadow = true;
  g.add(head);
  g.userData.limbs = limbs;
  scene.add(g);
  return g;
}
function walk(g, phase, amount, fallen = false) {
  for (const l of g.userData.limbs || []) {
    if (fallen) { l.arm.rotation.z = l.side * 1.1; l.leg.rotation.z = l.side * .45; }
    else { const s = Math.sin(phase) * amount; l.arm.rotation.x = -s * l.side; l.leg.rotation.x = s * l.side; }
  }
}
function addActors() {
  playerCar = makeCar(mat.white);
  activeVehicle = playerCar;
  person = makeHuman(0x2c5fd7, 0x1b1b22, 0xb77955);
  person.visible = false;
  const colors = [0xd4503f,0xe6bd58,0x4ca89d,0xd8d3c8,0x6376cb,0x9c4163];
  for (let i = 0; i < 32; i += 1) {
    const route = roadRoutes[i % roadRoutes.length], si = Math.floor(rand(i + 4) * route.samples.length), s = route.samples[si], off = i % 2 ? -6 : 6, n = new THREE.Vector3(Math.cos(s.heading), 0, -Math.sin(s.heading)), p = s.position.clone().addScaledVector(n, off), mesh = makeCar(new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: .55, metalness: .12 }));
    mesh.position.set(p.x, .45, p.z);
    mesh.rotation.y = s.heading;
    traffic.push({ group: mesh, routeIndex: i % roadRoutes.length, sampleIndex: si, laneOffset: off, dir: i % 2 ? -1 : 1, heading: s.heading, speed: 17 + rand(i + 3) * 16, baseSpeed: 17 + rand(i + 3) * 16 });
  }
  const samples = roadRoutes.flatMap((r) => r.samples);
  for (let i = 8, c = 0; i < samples.length && c < 22; i += 17, c += 1) {
    const s = samples[i], side = c % 2 ? -1 : 1, n = new THREE.Vector3(Math.cos(s.heading), 0, -Math.sin(s.heading)), p = s.position.clone().addScaledVector(n, side * (s.width * .75 + 7)), mesh = makeCar(new THREE.MeshStandardMaterial({ color: colors[c % colors.length], roughness: .58, metalness: .12 }));
    mesh.position.set(p.x, .45, p.z);
    mesh.rotation.y = s.heading + (side > 0 ? .08 : Math.PI - .08);
    parkedCars.push({ group: mesh });
  }
  for (let i = 0; i < 62; i += 1) {
    const s = samples[(i * 11 + 7) % samples.length], side = i % 2 ? -1 : 1, n = new THREE.Vector3(Math.cos(s.heading), 0, -Math.sin(s.heading)), p = s.position.clone().addScaledVector(n, side * (24 + rand(i) * 36)), h = makeHuman([0xd64b38,0x315bd8,0x2f9c58,0xe0c15c,0x9b4aa0][i % 5], [0x1a1d24,0x293850,0x3b332a][i % 3], [0x8d5a3f,0xbf8361,0x6e4939][i % 3]);
    h.position.set(p.x, 0, p.z);
    pedestrians.push({ group: h, base: h.position.clone(), target: h.position.clone().add(new THREE.Vector3(Math.sin(i) * 35, 0, Math.cos(i) * 35)), speed: 3.2 + rand(i + 9) * 2.7, panic: 0, injured: 0, fallen: 0, hitVelocity: new THREE.Vector3(), phase: rand(i + 12) * Math.PI * 2, seed: i });
  }
  contactShadow = new THREE.Mesh(new THREE.CircleGeometry(4.4, 32), new THREE.MeshBasicMaterial({ color: 0x02060d, transparent: true, opacity: .42, depthWrite: false }));
  contactShadow.rotation.x = -Math.PI / 2;
  scene.add(contactShadow);
  smoke = new THREE.Group();
  for (let i = 0; i < 7; i += 1) smoke.add(new THREE.Mesh(new THREE.SphereGeometry(.55 + i * .08, 8, 6), mat.smoke.clone()));
  scene.add(smoke);
}
function reset() {
  car.position.copy(startPoint);
  car.heading = .74;
  car.speed = 0;
  car.steer = 0;
  car.turnVelocity = 0;
  car.tilt = 0;
  car.boost = 100;
  car.drop = 0;
  car.damage = 0;
  car.hitCooldown = 0;
  inCar = true;
  activeVehicle = playerCar;
  playerCar.visible = true;
  person.visible = false;
}
function rescueToRoad(pos = car.position) {
  const sample = nearestRoadSample(pos) || roadRoutes[0].samples[0];
  car.position.set(sample.position.x, .45, sample.position.z);
  car.heading = sample.heading;
  car.speed = 0;
  if (activeVehicle) { activeVehicle.position.copy(car.position); activeVehicle.rotation.y = car.heading; activeVehicle.rotation.x = 0; activeVehicle.rotation.z = 0; }
  if (!inCar && person) { person.position.set(car.position.x, 0, car.position.z); person.rotation.y = car.heading; }
}
function nearestParked(max = 14) {
  let nearest = null, best = max;
  for (const p of parkedCars.concat([{ group: activeVehicle, own: true }])) { const d = p.group.position.distanceTo(person.position); if (d < best) { nearest = p; best = d; } }
  return nearest;
}
function toggleEnterExit() {
  if (cooldown > 0) return;
  cooldown = .35;
  if (inCar) { inCar = false; car.speed = 0; person.visible = true; person.position.copy(car.position).add(new THREE.Vector3(Math.cos(car.heading) * 6, 0, -Math.sin(car.heading) * 6)); person.position.y = 0; person.rotation.y = car.heading; return; }
  const target = nearestParked();
  if (!target) return;
  inCar = true;
  activeVehicle = target.group;
  car.position.copy(target.group.position);
  car.position.y = .45;
  car.heading = target.group.rotation.y;
  car.speed = 0;
  car.damage = target.own ? car.damage : 0;
  person.visible = false;
}
function hitBuilding(pos) { return colliders.some((r) => pos.x > r.x - 4 && pos.x < r.x + r.w + 4 && pos.z > r.z - 4 && pos.z < r.z + r.d + 4); }
function addDamage(n, dir) { car.damage = THREE.MathUtils.clamp(car.damage + n, 0, 100); car.hitCooldown = .24; if (dir) { activeVehicle.rotation.z += THREE.MathUtils.clamp(dir.x * .08, -.14, .14); activeVehicle.rotation.x += THREE.MathUtils.clamp(dir.z * .04, -.08, .08); } }
function updatePerson(dt) {
  const f = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0), t = (keys.has("a") || keys.has("arrowleft") ? 1 : 0) - (keys.has("d") || keys.has("arrowright") ? 1 : 0);
  person.rotation.y += t * 2.8 * dt;
  const old = person.position.clone(), fw = new THREE.Vector3(Math.sin(person.rotation.y), 0, Math.cos(person.rotation.y));
  person.position.addScaledVector(fw, f * (keys.has("shift") ? 18 : 10) * dt);
  person.position.x = THREE.MathUtils.clamp(person.position.x, -PLAY_LIMIT, PLAY_LIMIT);
  person.position.z = THREE.MathUtils.clamp(person.position.z, -PLAY_LIMIT, PLAY_LIMIT);
  person.position.y = 0;
  if (hitBuilding(person.position)) person.position.copy(old);
  walk(person, performance.now() * .01, Math.abs(f) * 1.1);
  car.position.copy(person.position);
  car.heading = person.rotation.y;
}
function updatePlayer(dt) {
  cooldown = Math.max(0, cooldown - dt);
  car.hitCooldown = Math.max(0, car.hitCooldown - dt);
  if (keys.has("e")) toggleEnterExit();
  if (!inCar) { updatePerson(dt); return; }
  const accel = keys.has("w") || keys.has("arrowup"), brake = keys.has("s") || keys.has("arrowdown"), left = keys.has("a") || keys.has("arrowleft"), right = keys.has("d") || keys.has("arrowright"), hand = keys.has(" "), boosting = (keys.has("shift") || keys.has("shiftleft") || keys.has("shiftright")) && car.boost > 0 && car.speed > 12;
  const steerTarget = (left ? 1 : 0) - (right ? 1 : 0), roadGrip = isOnRoad(car.position) ? 1 : .76, damageGrip = THREE.MathUtils.lerp(1, .56, car.damage / 100), max = (boosting ? 96 : 72) * THREE.MathUtils.lerp(1, .58, car.damage / 100);
  car.steer = THREE.MathUtils.lerp(car.steer, steerTarget, 1 - Math.pow(.0009, dt));
  if (Math.abs(steerTarget) < .01) car.steer *= Math.pow(.08, dt);
  if (accel) car.speed += (boosting ? 82 : 50) * dt;
  if (brake) car.speed -= car.speed > 8 ? 74 * dt : 46 * dt;
  car.speed *= Math.pow(hand ? .965 : .992, dt * 60);
  car.speed *= Math.pow(roadGrip, dt * 5);
  car.speed = THREE.MathUtils.clamp(car.speed, -22, max);
  car.boost = THREE.MathUtils.clamp(car.boost + (boosting ? -38 : 10) * dt, 0, 100);
  const turn = car.steer * THREE.MathUtils.clamp(Math.abs(car.speed) / 38, .05, 1.22) * damageGrip * (hand ? 2.45 : 1.45) * (car.speed < 0 ? -1 : 1);
  car.turnVelocity = THREE.MathUtils.lerp(car.turnVelocity, turn, 1 - Math.pow(.0016, dt));
  car.heading += car.turnVelocity * dt;
  const old = car.position.clone(), fw = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading)), side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
  car.position.addScaledVector(fw, car.speed * dt);
  if (hand) car.position.addScaledVector(side, car.steer * Math.abs(car.speed) * .23 * dt);
  car.position.x = THREE.MathUtils.clamp(car.position.x, -PLAY_LIMIT, PLAY_LIMIT);
  car.position.z = THREE.MathUtils.clamp(car.position.z, -PLAY_LIMIT, PLAY_LIMIT);
  car.position.y = .45;
  if (Math.abs(car.position.x) >= PLAY_LIMIT - 1 || Math.abs(car.position.z) >= PLAY_LIMIT - 1) rescueToRoad(car.position);
  if (hitBuilding(car.position) || parkedCars.some((p) => p.group !== activeVehicle && p.group.position.distanceTo(car.position) < 7.4)) { const force = Math.abs(car.speed), dir = car.position.clone().sub(old).normalize(); car.position.copy(old); car.speed *= -.28; if (force > 10) addDamage(5 + force * .26, dir); }
  activeVehicle.position.copy(car.position);
  activeVehicle.rotation.y = car.heading;
  const impact = car.hitCooldown > 0 ? Math.sin(performance.now() * .07) * car.hitCooldown * .18 : 0;
  car.tilt = THREE.MathUtils.lerp(car.tilt, -car.steer * THREE.MathUtils.clamp(Math.abs(car.speed) / 80, 0, 1) * .12 + impact, 1 - Math.pow(.002, dt));
  activeVehicle.rotation.z = car.tilt;
  activeVehicle.rotation.x = THREE.MathUtils.lerp(activeVehicle.rotation.x, 0, 1 - Math.pow(.006, dt));
  document.body.classList.toggle("boosting", boosting);
}
function updateTraffic(dt) {
  for (const npc of traffic) {
    const route = roadRoutes[npc.routeIndex];
    if (!route || route.samples.length < 2) continue;
    let nextIndex = npc.sampleIndex + npc.dir;
    if (route.closed) {
      nextIndex = (nextIndex + route.samples.length) % route.samples.length;
    } else if (nextIndex <= 0 || nextIndex >= route.samples.length - 1) {
      npc.dir *= -1;
      nextIndex = THREE.MathUtils.clamp(npc.sampleIndex + npc.dir, 0, route.samples.length - 1);
    }
    const sample = route.samples[nextIndex];
    const normal = new THREE.Vector3(Math.cos(sample.heading), 0, -Math.sin(sample.heading));
    const target = sample.position.clone().addScaledVector(normal, npc.laneOffset);
    const toTarget = target.sub(npc.group.position);
    if (toTarget.length() < 7) npc.sampleIndex = nextIndex;
    const dir = toTarget.normalize();
    npc.heading = Math.atan2(dir.x, dir.z);
    npc.group.position.addScaledVector(dir, npc.speed * dt);
    npc.group.position.y = .45;
    npc.group.rotation.y = THREE.MathUtils.lerp(npc.group.rotation.y, npc.heading, 1 - Math.pow(.001, dt));
    npc.speed = npc.baseSpeed * (.8 + Math.sin(performance.now() * .001 + npc.baseSpeed) * .18);
    if (npc.group.position.distanceTo(car.position) < 7.5) {
      const away = car.position.clone().sub(npc.group.position).normalize();
      car.position.addScaledVector(away, 4.2);
      addDamage(7 + Math.abs(car.speed) * .18, away);
      car.speed *= -.42;
    }
  }
}
function updatePedestrians(dt) {
  const now = performance.now() * .001;
  for (const p of pedestrians) {
    const toCar = p.group.position.clone().sub(car.position), dc = toCar.length();
    if (p.fallen > 0) { p.fallen -= dt; p.group.position.addScaledVector(p.hitVelocity, dt); p.hitVelocity.multiplyScalar(Math.pow(.08, dt)); p.group.position.y = .18; p.group.rotation.x = THREE.MathUtils.lerp(p.group.rotation.x, Math.PI / 2, 1 - Math.pow(.0003, dt)); walk(p.group, p.phase, 0, true); continue; }
    if (p.injured > 0) p.injured = Math.max(0, p.injured - dt * .12);
    if (inCar && dc < 46 && Math.abs(car.speed) > 18 && p.injured <= 0) { p.panic = Math.max(p.panic, 1.6); const flee = toCar.lengthSq() > .01 ? toCar.normalize() : new THREE.Vector3(Math.sin(p.seed), 0, Math.cos(p.seed)); p.target.copy(p.group.position).addScaledVector(flee, 48); }
    if (inCar && dc < 5.2 && Math.abs(car.speed) > 10 && p.injured <= .2) { const push = p.group.position.clone().sub(car.position).normalize(); p.injured = 1; p.fallen = 2.8 + THREE.MathUtils.clamp(Math.abs(car.speed) / 24, 0, 2.2); p.hitVelocity.copy(push).multiplyScalar(10 + Math.abs(car.speed) * .36); car.speed *= .5; addDamage(4 + Math.abs(car.speed) * .18, push); continue; }
    p.panic = Math.max(0, p.panic - dt);
    const to = p.target.clone().sub(p.group.position);
    if (to.length() < 4) { const a = rand(p.seed + Math.floor(now * .21) + Math.floor(p.base.x)) * Math.PI * 2, rr = 14 + rand(p.seed + Math.floor(now * .17) + 9) * 72; p.target.set(THREE.MathUtils.clamp(p.base.x + Math.sin(a) * rr, -870, 870), 0, THREE.MathUtils.clamp(p.base.z + Math.cos(a) * rr, -870, 870)); }
    else { const dir = to.normalize(), sp = p.speed * (p.panic > 0 ? 2.6 : 1) * (p.injured > 0 ? .42 : 1), old = p.group.position.clone(); p.group.position.addScaledVector(dir, sp * dt); if (hitBuilding(p.group.position)) p.group.position.copy(old); p.group.rotation.y = Math.atan2(dir.x, dir.z); p.phase += dt * sp * 2.2; p.group.position.y = Math.abs(Math.sin(p.phase)) * .08; walk(p.group, p.phase, p.panic > 0 ? 1.35 : .85); }
  }
}
function updateCheckpoints(dt) {
  checkpointMeshes.forEach((r, i) => { r.visible = i === car.drop; r.rotation.z += dt * 2.2; r.scale.setScalar(1 + Math.sin(performance.now() * .006) * .1); });
  const t = checkpoints[car.drop];
  if (t && car.position.distanceTo(t) < 20) { car.drop = (car.drop + 1) % checkpoints.length; car.boost = Math.min(100, car.boost + 28); }
}
function updateEffects(dt) {
  contactShadow.visible = inCar;
  smoke.visible = inCar && car.damage > 22;
  if (!inCar) return;
  contactShadow.position.set(car.position.x, .08, car.position.z);
  contactShadow.material.opacity = .42;
  const amount = THREE.MathUtils.clamp((car.damage - 18) / 82, 0, 1), fw = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
  smoke.position.copy(car.position).addScaledVector(fw, 2.8);
  smoke.position.y += 1.2;
  smoke.rotation.y = car.heading;
  for (let i = 0; i < smoke.children.length; i += 1) { const puff = smoke.children[i]; puff.material.opacity = amount * (.12 + rand(i + Math.floor(performance.now() * .003)) * .22); puff.scale.setScalar(.8 + amount * 1.6 + Math.sin(performance.now() * .004 + i) * .16); puff.position.y += dt * (.8 + i * .06); if (puff.position.y > 3.4) puff.position.y = .8 + rand(i) * .6; }
}
function updateCamera(dt) {
  const target = inCar ? car.position : person.position, h = inCar ? car.heading : person.rotation.y, lean = inCar ? THREE.MathUtils.clamp(Math.abs(car.speed) / 70, 0, 1) : 0, dist = inCar ? 18 + lean * 11 : 13, height = inCar ? 7.2 + lean * 2.3 : 8, side = inCar ? -car.steer * 3.2 * lean : 0;
  const follow = new THREE.Vector3(target.x - Math.sin(h) * dist + Math.cos(h) * side, target.y + height, target.z - Math.cos(h) * dist - Math.sin(h) * side), look = new THREE.Vector3(target.x + Math.sin(h) * (inCar ? 18 + lean * 22 : 7), target.y + 2.4 + lean * .6, target.z + Math.cos(h) * (inCar ? 18 + lean * 22 : 7));
  camera.fov = THREE.MathUtils.lerp(camera.fov, car.boost < 92 && Math.abs(car.speed) > 18 ? 70 : 64, 1 - Math.pow(.004, dt));
  camera.updateProjectionMatrix();
  camera.position.lerp(follow, 1 - Math.pow(.0007, dt));
  camera.lookAt(look);
}
function updateHud() { speedEl.textContent = inCar ? String(Math.round(Math.abs(car.speed) * 2.55)) : "on foot"; routeEl.textContent = String(car.drop); damageEl.textContent = `${Math.round(car.damage)}%`; }
function resize() { const r = canvas.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); }
addEventListener("resize", resize);
addEventListener("keydown", (e) => { const k = e.key.toLowerCase(); if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault(); if (k === "r") reset(); keys.add(k); });
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
buildWorld();
addActors();
resize();
reset();
function animate() { const dt = Math.min(clock.getDelta(), .033); updatePlayer(dt); updateTraffic(dt); updatePedestrians(dt); updateCheckpoints(dt); updateEffects(dt); updateCamera(dt); updateHud(); renderer.render(scene, camera); requestAnimationFrame(animate); }
animate();
