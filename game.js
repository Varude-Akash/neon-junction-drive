import * as THREE from "three";

const canvas = document.getElementById("game");
const speedEl = document.getElementById("speed");
const routeEl = document.getElementById("route");
const damageEl = document.getElementById("damage");
const scene = new THREE.Scene();
const clock = new THREE.Clock();
const keys = new Set();

const WORLD = 1800;
const roadSamples = [];
const roadRoutes = [];
const colliders = [];
const traffic = [];
const pedestrians = [];
const parkedCars = [];
const checkpointMeshes = [];
const skidMarks = [];
let activeVehicle;
let playerCar;
let person;
let inCar = true;
let interactCooldown = 0;
let contactShadow;
let damageSmoke;

function rand(seed) {
  const x = Math.sin(seed * 127.31) * 43758.5453;
  return x - Math.floor(x);
}

function skyTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#67bdff");
  grad.addColorStop(0.54, "#bdeaff");
  grad.addColorStop(1, "#fbfdff");
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 22; i += 1) {
    const x = rand(i) * 64;
    const y = 18 + rand(i + 4) * 112;
    const r = 4 + rand(i + 9) * 14;
    const cloud = g.createRadialGradient(x, y, 0, x, y, r);
    cloud.addColorStop(0, "rgba(255,255,255,.82)");
    cloud.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = cloud;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

scene.background = skyTexture();
scene.fog = new THREE.Fog(0xc8eaff, 120, 1050);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.15));
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 2600);
scene.add(new THREE.HemisphereLight(0xf5fbff, 0x748f52, 2.25));
const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.position.set(-220, 560, 250);
scene.add(sun);

const mat = {
  grass: new THREE.MeshStandardMaterial({ color: 0x4f9650, roughness: 0.96 }),
  grass2: new THREE.MeshStandardMaterial({ color: 0x7abb61, roughness: 0.96 }),
  sand: new THREE.MeshStandardMaterial({ color: 0xd8bf86, roughness: 1 }),
  water: new THREE.MeshStandardMaterial({ color: 0x45b8cd, roughness: 0.2, metalness: 0.05, emissive: 0x0a6578, emissiveIntensity: 0.2 }),
  asphalt: new THREE.MeshStandardMaterial({ color: 0x30363c, roughness: 0.92 }),
  shoulder: new THREE.MeshStandardMaterial({ color: 0x83979e, roughness: 0.74 }),
  lane: new THREE.MeshStandardMaterial({ color: 0xf7f2d8, roughness: 0.6 }),
  dirt: new THREE.MeshStandardMaterial({ color: 0x7c6848, roughness: 0.98 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x8b9188, roughness: 0.9 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x13283a, roughness: 0.22, metalness: 0.25 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x070707, roughness: 0.95 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xbfc4bc, roughness: 0.34, metalness: 0.45 }),
  white: new THREE.MeshStandardMaterial({ color: 0xe9eef0, roughness: 0.34, metalness: 0.3 }),
  red: new THREE.MeshStandardMaterial({ color: 0xb7322c, roughness: 0.45, metalness: 0.15 }),
  black: new THREE.MeshBasicMaterial({ color: 0x030506 }),
  lamp: new THREE.MeshBasicMaterial({ color: 0xfff1b0 }),
  brake: new THREE.MeshBasicMaterial({ color: 0xc41521 }),
  smoke: new THREE.MeshBasicMaterial({ color: 0x45484d, transparent: true, opacity: 0, depthWrite: false }),
};

const roadBlueprints = [
  [[-700, -640], [-520, -470], [-335, -410], [-130, -255], [80, -230], [285, -95], [410, 105], [575, 235], [710, 455], [525, 650], [245, 705], [-15, 600], [-205, 410], [-420, 315], [-615, 95], [-760, -165], [-700, -640]],
  [[-650, 565], [-470, 395], [-250, 190], [-45, 35], [135, -100], [350, -245], [585, -315], [805, -430]],
  [[-820, 45], [-620, 20], [-390, -25], [-150, -55], [100, -40], [345, 15], [570, 80], [790, 110]],
  [[-535, -730], [-445, -535], [-310, -300], [-250, -120], [-315, 85], [-270, 310], [-95, 520], [125, 760]],
];
const roadWidths = [34, 28, 24, 22];
const checkpoints = roadBlueprints[0].slice(1, -1).filter((_, i) => i % 2 === 0).map(([x, z]) => new THREE.Vector3(x, 0, z));

const car = {
  position: new THREE.Vector3(-700, 0.45, -640),
  heading: 0.7,
  speed: 0,
  steer: 0,
  turnVelocity: 0,
  tilt: 0,
  boost: 100,
  drop: 0,
  damage: 0,
  hitCooldown: 0,
  airborne: 0,
  yVelocity: 0,
};

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}

function cyl(r1, r2, h, material, x, y, z, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), material);
  m.position.set(x, y, z);
  return m;
}

function roadSegment(center, length, width, material, heading, y, h) {
  const m = box(width, h, length, material, center.x, y, center.z);
  m.rotation.y = heading;
  scene.add(m);
}

function addRoad(points, width, closed) {
  const pts = points.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, closed, "catmullrom", 0.24);
  const steps = Math.max(75, Math.floor(curve.getLength() / 12));
  const samples = [];
  let carry = 0;
  for (let i = 1; i <= steps; i += 1) {
    const a = curve.getPoint((i - 1) / steps);
    const b = curve.getPoint(i / steps);
    const c = a.clone().lerp(b, 0.5);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) + 0.9;
    const heading = Math.atan2(dx, dz);
    roadSegment(c, len, width + 9, mat.shoulder, heading, 0.025, 0.055);
    roadSegment(c, len + 0.6, width, mat.asphalt, heading, 0.075, 0.08);
    carry += len;
    if (carry > 30) {
      roadSegment(c, 13, 1.25, mat.lane, heading, 0.14, 0.035);
      carry = 0;
    }
    if (i % 4 === 0) {
      samples.push({ position: c.clone(), heading, width });
      roadSamples.push({ x: c.x, z: c.z, radius: width * 0.7 });
    }
  }
  roadRoutes.push({ curve, samples, width });
}

function addGround() {
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, 72, 72);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i);
    const y = p.getY(i);
    const fade = THREE.MathUtils.clamp((x + 820) / 900, 0, 1);
    p.setZ(i, (Math.sin(x * 0.012) * 0.35 + Math.cos(y * 0.01) * 0.25 + Math.sin((x + y) * 0.006) * 0.45) * fade);
  }
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, mat.grass);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  scene.add(box(330, 0.05, WORLD, mat.sand, -860, 0.03, 0));
  scene.add(box(560, 0.02, WORLD, mat.water, -1140, 0, 0));
  const town = box(520, 0.04, 360, new THREE.MeshStandardMaterial({ color: 0x6f8a75, roughness: 0.92 }), -250, 0.045, -60);
  town.rotation.y = -0.18;
  scene.add(town);
  const dirt = box(420, 0.04, 260, mat.dirt, 390, 0.05, 455);
  dirt.rotation.y = 0.32;
  scene.add(dirt);
}

function addBuilding(x, z, w, d, h, seed, rot = 0) {
  const colors = [0x39464f, 0x514437, 0x374b43, 0x4a3948, 0x30384e, 0x4f4a3c];
  const body = box(w, h, d, new THREE.MeshStandardMaterial({ color: colors[seed % colors.length], roughness: 0.8 }), x, h / 2, z);
  body.rotation.y = rot;
  scene.add(body);
  colliders.push({ x: x - w / 2, z: z - d / 2, w, d });
  const rotate = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot).add(new THREE.Vector3(x, 0, z));
  for (let r = 0; r < Math.max(2, Math.floor(h / 12)); r += 1) {
    for (let c = 0; c < Math.max(2, Math.floor(w / 18)); c += 1) {
      if (rand(seed + r * 11 + c) < 0.34) continue;
      const pos = rotate(-w * 0.34 + c * (w * 0.68 / Math.max(1, Math.floor(w / 18) - 1)), Math.min(h - 4, 7 + r * 10), d / 2 + 0.08);
      const win = box(4.5, 3, 0.16, rand(seed + c + r * 9) > 0.82 ? new THREE.MeshBasicMaterial({ color: 0xffcf69 }) : mat.glass, pos.x, pos.y, pos.z);
      win.rotation.y = rot;
      scene.add(win);
    }
  }
}

function addGrassPatch(x, z, radius, seed) {
  const group = new THREE.Group();
  group.position.set(x, 0.08, z);
  for (let i = 0; i < 10 + Math.floor(rand(seed) * 10); i += 1) {
    const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.35 + rand(seed + i) * 0.55, 3.2 + rand(seed + i + 2) * 4.6), i % 2 ? mat.grass : mat.grass2);
    const a = rand(seed + i + 4) * Math.PI * 2;
    const d = rand(seed + i + 8) * radius;
    blade.position.set(Math.sin(a) * d, 1.2, Math.cos(a) * d);
    blade.rotation.y = a;
    blade.rotation.z = (rand(seed + i + 12) - 0.5) * 0.45;
    group.add(blade);
  }
  scene.add(group);
}

function addPalm(x, z, s = 1) {
  const trunk = cyl(0.3 * s, 0.46 * s, 7.2 * s, new THREE.MeshStandardMaterial({ color: 0x715333, roughness: 0.88 }), x, 3.6 * s, z, 9);
  trunk.rotation.z = (rand(x + z) - 0.5) * 0.14;
  scene.add(trunk);
  const leaves = new THREE.Group();
  leaves.position.set(x, 7.3 * s, z);
  for (let i = 0; i < 8; i += 1) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(1.1 * s, 6.2 * s), new THREE.MeshStandardMaterial({ color: 0x276f38, roughness: 0.8, side: THREE.DoubleSide }));
    leaf.position.z = 2.4 * s;
    leaf.rotation.x = Math.PI / 2.45;
    leaf.rotation.y = i * Math.PI * 2 / 8;
    leaves.add(leaf);
  }
  scene.add(leaves);
}

function addWorld() {
  addGround();
  roadBlueprints.forEach((p, i) => addRoad(p, roadWidths[i], i === 0));
  const buildings = [[-455, -170, 90, 56, 92, -0.18], [-330, -250, 70, 72, 58, 0.24], [-190, -145, 115, 62, 126, 0.07], [-80, -10, 78, 92, 74, -0.32], [80, -155, 94, 58, 82, 0.38], [255, -215, 72, 84, 60, -0.12], [380, -20, 105, 70, 92, 0.28], [505, 170, 80, 74, 54, -0.28], [-535, 155, 78, 62, 48, 0.44], [-325, 210, 92, 74, 68, -0.36], [-90, 300, 120, 80, 42, 0.16], [135, 430, 78, 62, 50, -0.24]];
  buildings.forEach((b, i) => addBuilding(b[0], b[1], b[2], b[3], b[4], i + 1, b[5]));
  for (let i = 0; i < 70; i += 1) {
    const x = -760 + rand(i) * 1520;
    const z = -790 + rand(i + 11) * 1580;
    if (rand(i + 31) > 0.42) addGrassPatch(x, z, 8 + rand(i + 7) * 15, i);
    if (rand(i + 17) > 0.75) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2 + rand(i + 19) * 5, 0), mat.rock);
      rock.position.set(x + rand(i + 9) * 26, 1.2, z + rand(i + 13) * 26);
      rock.scale.set(1.5, 0.75, 1);
      scene.add(rock);
    }
  }
  for (let i = 0; i < 42; i += 1) addPalm(-850 + rand(i) * 1650, -820 + rand(i + 6) * 1650, 0.58 + rand(i + 8) * 0.45);
  for (const point of checkpoints) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(13, 0.7, 12, 64), new THREE.MeshBasicMaterial({ color: 0xffd35c, transparent: true, opacity: 0.84 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(point).add(new THREE.Vector3(0, 1.2, 0));
    scene.add(ring);
    checkpointMeshes.push(ring);
  }
}

function makeCar(bodyMat = mat.white) {
  const g = new THREE.Group();
  g.add(box(5.8, 0.7, 9.4, bodyMat, 0, 0.65, 0));
  g.add(box(5.2, 0.8, 5.8, bodyMat, 0, 1.15, -0.25));
  g.add(box(4.2, 0.75, 2.5, mat.glass, 0, 1.65, 0.9));
  g.add(box(4.5, 0.55, 1.35, mat.glass, 0, 1.45, -2.2));
  g.add(box(1, 0.2, 0.18, mat.brake, -1.55, 0.9, -4.8));
  g.add(box(1, 0.2, 0.18, mat.brake, 1.55, 0.9, -4.8));
  g.add(box(1, 0.18, 0.16, mat.lamp, -1.55, 0.95, 4.8));
  g.add(box(1, 0.18, 0.16, mat.lamp, 1.55, 0.95, 4.8));
  for (const x of [-2.9, 2.9]) for (const z of [-3.1, 3.1]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.58, 18), mat.tire);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.45, z);
    g.add(wheel);
  }
  scene.add(g);
  return g;
}

function makeHuman(shirt, pants, skin) {
  const g = new THREE.Group();
  const limbs = [];
  g.add(cyl(0.42, 0.55, 1.25, new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.78 }), 0, 1.8, 0, 10));
  for (const side of [-1, 1]) {
    const arm = cyl(0.11, 0.13, 0.9, new THREE.MeshStandardMaterial({ color: skin, roughness: 0.78 }), side * 0.55, 1.75, 0, 8);
    const leg = cyl(0.13, 0.15, 0.9, new THREE.MeshStandardMaterial({ color: pants, roughness: 0.84 }), side * 0.2, 0.72, 0, 8);
    limbs.push({ arm, leg, side });
    g.add(arm, leg, box(0.32, 0.14, 0.5, mat.black, side * 0.2, 0.12, 0.1));
  }
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), new THREE.MeshStandardMaterial({ color: skin, roughness: 0.78 })).translateY(2.75));
  g.userData.limbs = limbs;
  scene.add(g);
  return g;
}

function walk(g, phase, amount, fallen = false) {
  for (const l of g.userData.limbs || []) {
    if (fallen) {
      l.arm.rotation.z = l.side * 1.1;
      l.leg.rotation.z = l.side * 0.45;
    } else {
      const s = Math.sin(phase) * amount;
      l.arm.rotation.x = -s * l.side;
      l.leg.rotation.x = s * l.side;
    }
  }
}

function addActors() {
  playerCar = makeCar(mat.white);
  activeVehicle = playerCar;
  person = makeHuman(0x2c5fd7, 0x1b1b22, 0xb77955);
  person.visible = false;
  const colors = [0xd4503f, 0xe6bd58, 0x4ca89d, 0xd8d3c8, 0x6376cb, 0x9c4163];
  for (let i = 0; i < 28; i += 1) {
    const route = roadRoutes[i % roadRoutes.length];
    const sampleIndex = Math.floor(rand(i + 4) * route.samples.length);
    const s = route.samples[sampleIndex];
    const laneOffset = i % 2 ? -6 : 6;
    const n = new THREE.Vector3(Math.cos(s.heading), 0, -Math.sin(s.heading));
    const p = s.position.clone().addScaledVector(n, laneOffset);
    const carMesh = makeCar(new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.55, metalness: 0.12 }));
    carMesh.position.copy(p);
    carMesh.rotation.y = s.heading;
    traffic.push({ group: carMesh, routeIndex: i % roadRoutes.length, sampleIndex, laneOffset, heading: s.heading, speed: 17 + rand(i + 3) * 16, baseSpeed: 17 + rand(i + 3) * 16 });
  }
  for (let i = 6, count = 0; i < roadSamples.length && count < 18; i += 19, count += 1) {
    const s = roadSamples[i];
    const side = count % 2 ? -1 : 1;
    const n = new THREE.Vector3(Math.cos(s.heading), 0, -Math.sin(s.heading));
    const p = new THREE.Vector3(s.x, 0, s.z).addScaledVector(n, side * (s.radius + 4));
    const parked = makeCar(new THREE.MeshStandardMaterial({ color: colors[count % colors.length], roughness: 0.58, metalness: 0.12 }));
    parked.position.copy(p);
    parked.rotation.y = s.heading + (side > 0 ? 0.08 : Math.PI - 0.08);
    parkedCars.push({ group: parked });
  }
  for (let i = 0; i < 48; i += 1) {
    const s = roadSamples[(i * 11 + 7) % roadSamples.length];
    const side = i % 2 ? -1 : 1;
    const n = new THREE.Vector3(Math.cos(s.heading), 0, -Math.sin(s.heading));
    const p = new THREE.Vector3(s.x, 0, s.z).addScaledVector(n, side * (24 + rand(i) * 34));
    const h = makeHuman([0xd64b38, 0x315bd8, 0x2f9c58, 0xe0c15c, 0x9b4aa0][i % 5], [0x1a1d24, 0x293850, 0x3b332a][i % 3], [0x8d5a3f, 0xbf8361, 0x6e4939][i % 3]);
    h.position.copy(p);
    pedestrians.push({ group: h, base: p.clone(), target: p.clone().add(new THREE.Vector3(Math.sin(i) * 35, 0, Math.cos(i) * 35)), speed: 3.2 + rand(i + 9) * 2.7, panic: 0, injured: 0, fallen: 0, hitVelocity: new THREE.Vector3(), phase: rand(i + 12) * Math.PI * 2, seed: i });
  }
  contactShadow = new THREE.Mesh(new THREE.CircleGeometry(4.4, 32), new THREE.MeshBasicMaterial({ color: 0x02060d, transparent: true, opacity: 0.42, depthWrite: false }));
  contactShadow.rotation.x = -Math.PI / 2;
  scene.add(contactShadow);
  damageSmoke = new THREE.Group();
  for (let i = 0; i < 7; i += 1) damageSmoke.add(new THREE.Mesh(new THREE.SphereGeometry(0.55 + i * 0.08, 8, 6), mat.smoke.clone()));
  scene.add(damageSmoke);
}

function isOnRoad(pos) {
  return roadSamples.some((s) => {
    const dx = pos.x - s.x;
    const dz = pos.z - s.z;
    return dx * dx + dz * dz < s.radius * s.radius;
  });
}

function hitsBuilding(pos) {
  return colliders.some((r) => pos.x > r.x - 4 && pos.x < r.x + r.w + 4 && pos.z > r.z - 4 && pos.z < r.z + r.d + 4);
}

function addDamage(amount, dir) {
  car.damage = THREE.MathUtils.clamp(car.damage + amount, 0, 100);
  car.hitCooldown = 0.25;
  if (dir) {
    activeVehicle.rotation.x += THREE.MathUtils.clamp(dir.z * 0.04, -0.08, 0.08);
    activeVehicle.rotation.z += THREE.MathUtils.clamp(dir.x * 0.08, -0.14, 0.14);
  }
}

function reset() {
  car.position.set(-700, 0.45, -640);
  car.heading = 0.7;
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
  person.visible = false;
  playerCar.visible = true;
  document.body.classList.remove("boosting");
}

function updatePerson(dt) {
  const f = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
  const t = (keys.has("a") || keys.has("arrowleft") ? 1 : 0) - (keys.has("d") || keys.has("arrowright") ? 1 : 0);
  person.rotation.y += t * 2.8 * dt;
  const old = person.position.clone();
  const forward = new THREE.Vector3(Math.sin(person.rotation.y), 0, Math.cos(person.rotation.y));
  person.position.addScaledVector(forward, f * (keys.has("shift") ? 18 : 10) * dt);
  if (hitsBuilding(person.position)) person.position.copy(old);
  walk(person, performance.now() * 0.01, Math.abs(f) * 1.1);
  car.position.copy(person.position);
  car.heading = person.rotation.y;
}

function toggleEnterExit() {
  if (interactCooldown > 0) return;
  interactCooldown = 0.35;
  if (inCar) {
    inCar = false;
    car.speed = 0;
    person.visible = true;
    person.position.copy(car.position).add(new THREE.Vector3(Math.cos(car.heading) * 6, 0, -Math.sin(car.heading) * 6));
    person.rotation.y = car.heading;
    document.body.classList.remove("boosting");
    return;
  }
  let nearest = null;
  let best = 13;
  for (const p of parkedCars.concat([{ group: activeVehicle }])) {
    const d = p.group.position.distanceTo(person.position);
    if (d < best) {
      nearest = p.group;
      best = d;
    }
  }
  if (!nearest) return;
  inCar = true;
  activeVehicle = nearest;
  car.position.copy(nearest.position);
  car.position.y = 0.45;
  car.heading = nearest.rotation.y;
  car.speed = 0;
  car.damage = nearest === playerCar ? car.damage : 0;
  person.visible = false;
}

function updatePlayer(dt) {
  interactCooldown = Math.max(0, interactCooldown - dt);
  car.hitCooldown = Math.max(0, car.hitCooldown - dt);
  if (keys.has("e")) toggleEnterExit();
  if (!inCar) return updatePerson(dt);

  const accel = keys.has("w") || keys.has("arrowup");
  const brake = keys.has("s") || keys.has("arrowdown");
  const left = keys.has("a") || keys.has("arrowleft");
  const right = keys.has("d") || keys.has("arrowright");
  const handbrake = keys.has(" ");
  const boosting = (keys.has("shift") || keys.has("shiftleft") || keys.has("shiftright")) && car.boost > 0 && car.speed > 12;
  const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
  const grip = (isOnRoad(car.position) ? 1 : 0.46) * THREE.MathUtils.lerp(1, 0.56, car.damage / 100);
  const maxSpeed = (boosting ? 96 : 72) * THREE.MathUtils.lerp(1, 0.58, car.damage / 100);
  car.steer = THREE.MathUtils.lerp(car.steer, steerTarget, 1 - Math.pow(0.0009, dt));
  if (Math.abs(steerTarget) < 0.01) car.steer *= Math.pow(0.08, dt);
  if (accel) car.speed += (boosting ? 82 : 50) * dt;
  if (brake) car.speed -= car.speed > 8 ? 74 * dt : 46 * dt;
  car.speed *= Math.pow(handbrake ? 0.965 : 0.992, dt * 60);
  car.speed *= Math.pow(grip, dt * 5);
  if (car.damage > 65 && Math.sin(performance.now() * 0.018) > 0.78) car.speed *= 0.985;
  car.speed = THREE.MathUtils.clamp(car.speed, -22, maxSpeed);
  car.boost = THREE.MathUtils.clamp(car.boost + (boosting ? -38 : 10) * dt, 0, 100);
  const turn = car.steer * THREE.MathUtils.clamp(Math.abs(car.speed) / 38, 0.05, 1.22) * (handbrake ? 2.45 : 1.45) * (car.speed < 0 ? -1 : 1);
  car.turnVelocity = THREE.MathUtils.lerp(car.turnVelocity, turn, 1 - Math.pow(0.0016, dt));
  car.heading += car.turnVelocity * dt;
  const old = car.position.clone();
  const forward = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
  const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
  car.position.addScaledVector(forward, car.speed * dt);
  if (handbrake) car.position.addScaledVector(side, car.steer * Math.abs(car.speed) * 0.23 * dt);
  if (hitsBuilding(car.position) || parkedCars.some((p) => p.group !== activeVehicle && p.group.position.distanceTo(car.position) < 7.4)) {
    const force = Math.abs(car.speed);
    const dir = car.position.clone().sub(old).normalize();
    car.position.copy(old);
    car.speed *= -0.28;
    if (force > 10) addDamage(5 + force * 0.26, dir);
  }
  activeVehicle.position.copy(car.position);
  activeVehicle.rotation.y = car.heading;
  const impact = car.hitCooldown > 0 ? Math.sin(performance.now() * 0.07) * car.hitCooldown * 0.18 : 0;
  car.tilt = THREE.MathUtils.lerp(car.tilt, -car.steer * THREE.MathUtils.clamp(Math.abs(car.speed) / 80, 0, 1) * 0.12 + impact, 1 - Math.pow(0.002, dt));
  activeVehicle.rotation.z = car.tilt;
  activeVehicle.rotation.x = THREE.MathUtils.lerp(activeVehicle.rotation.x, 0, 1 - Math.pow(0.006, dt));
  document.body.classList.toggle("boosting", boosting);
}

function updateTraffic(dt) {
  for (const npc of traffic) {
    const route = roadRoutes[npc.routeIndex];
    const nextIndex = (npc.sampleIndex + 1) % route.samples.length;
    const next = route.samples[nextIndex];
    const normal = new THREE.Vector3(Math.cos(next.heading), 0, -Math.sin(next.heading));
    const target = next.position.clone().addScaledVector(normal, npc.laneOffset);
    const to = target.sub(npc.group.position);
    if (to.length() < 7) npc.sampleIndex = nextIndex;
    const dir = to.normalize();
    npc.heading = Math.atan2(dir.x, dir.z);
    npc.group.position.addScaledVector(dir, npc.speed * dt);
    npc.group.rotation.y = THREE.MathUtils.lerp(npc.group.rotation.y, npc.heading, 1 - Math.pow(0.001, dt));
    npc.speed = npc.baseSpeed * (0.82 + Math.sin(performance.now() * 0.001 + npc.baseSpeed) * 0.16);
    const d = npc.group.position.distanceTo(car.position);
    if (d < 7.5) {
      const away = car.position.clone().sub(npc.group.position).normalize();
      car.position.addScaledVector(away, 4.2);
      addDamage(7 + Math.abs(car.speed) * 0.18, away);
      car.speed *= -0.42;
    }
  }
}

function updatePedestrians(dt) {
  const now = performance.now() * 0.001;
  for (const p of pedestrians) {
    const toCar = p.group.position.clone().sub(car.position);
    const distCar = toCar.length();
    if (p.fallen > 0) {
      p.fallen -= dt;
      p.group.position.addScaledVector(p.hitVelocity, dt);
      p.hitVelocity.multiplyScalar(Math.pow(0.08, dt));
      p.group.position.y = 0.18;
      p.group.rotation.x = THREE.MathUtils.lerp(p.group.rotation.x, Math.PI / 2, 1 - Math.pow(0.0003, dt));
      walk(p.group, p.phase, 0, true);
      continue;
    }
    if (p.injured > 0) {
      p.injured = Math.max(0, p.injured - dt * 0.12);
      p.group.rotation.x = THREE.MathUtils.lerp(p.group.rotation.x, 0, 1 - Math.pow(0.002, dt));
    }
    if (inCar && distCar < 46 && Math.abs(car.speed) > 18 && p.injured <= 0) {
      p.panic = Math.max(p.panic, 1.6);
      const flee = toCar.lengthSq() > 0.01 ? toCar.normalize() : new THREE.Vector3(Math.sin(p.seed), 0, Math.cos(p.seed));
      p.target.copy(p.group.position).addScaledVector(flee, 48);
    }
    if (inCar && distCar < 5.2 && Math.abs(car.speed) > 10 && p.injured <= 0.2) {
      const push = p.group.position.clone().sub(car.position).normalize();
      p.injured = 1;
      p.fallen = 2.8 + THREE.MathUtils.clamp(Math.abs(car.speed) / 24, 0, 2.2);
      p.panic = 0;
      p.hitVelocity.copy(push).multiplyScalar(10 + Math.abs(car.speed) * 0.36);
      p.group.rotation.y = Math.atan2(push.x, push.z);
      car.speed *= 0.5;
      addDamage(4 + Math.abs(car.speed) * 0.18, push);
      continue;
    }
    p.panic = Math.max(0, p.panic - dt);
    const toTarget = p.target.clone().sub(p.group.position);
    if (toTarget.length() < 4) {
      const a = rand(p.seed + Math.floor(now * 0.21) + Math.floor(p.base.x)) * Math.PI * 2;
      const r = 14 + rand(p.seed + Math.floor(now * 0.17) + 9) * 72;
      p.target.set(THREE.MathUtils.clamp(p.base.x + Math.sin(a) * r, -870, 870), 0, THREE.MathUtils.clamp(p.base.z + Math.cos(a) * r, -870, 870));
    } else {
      const dir = toTarget.normalize();
      const speed = p.speed * (p.panic > 0 ? 2.6 : 1) * (p.injured > 0 ? 0.42 : 1);
      const old = p.group.position.clone();
      p.group.position.addScaledVector(dir, speed * dt);
      if (hitsBuilding(p.group.position)) p.group.position.copy(old);
      p.group.rotation.y = Math.atan2(dir.x, dir.z);
      p.phase += dt * speed * 2.2;
      p.group.position.y = Math.abs(Math.sin(p.phase)) * 0.08;
      walk(p.group, p.phase, p.panic > 0 ? 1.35 : 0.85);
    }
  }
}

function updateCheckpoints(dt) {
  for (let i = 0; i < checkpointMeshes.length; i += 1) {
    const ring = checkpointMeshes[i];
    ring.visible = i === car.drop;
    ring.rotation.z += dt * 2.2;
    ring.scale.setScalar(1 + Math.sin(performance.now() * 0.006) * 0.1);
  }
  const target = checkpoints[car.drop];
  if (target && car.position.distanceTo(target) < 18) {
    car.drop = (car.drop + 1) % checkpoints.length;
    car.boost = Math.min(100, car.boost + 28);
  }
}

function updateEffects(dt) {
  contactShadow.visible = inCar;
  damageSmoke.visible = inCar && car.damage > 22;
  if (!inCar) return;
  contactShadow.position.set(car.position.x, 0.08, car.position.z);
  contactShadow.material.opacity = 0.32 + THREE.MathUtils.clamp(Math.abs(car.speed) / 120, 0, 0.16);
  damageSmoke.position.set(car.position.x + Math.sin(car.heading) * 2.8, 1.7, car.position.z + Math.cos(car.heading) * 2.8);
  damageSmoke.rotation.y = car.heading;
  const amount = THREE.MathUtils.clamp((car.damage - 18) / 82, 0, 1);
  for (let i = 0; i < damageSmoke.children.length; i += 1) {
    const puff = damageSmoke.children[i];
    puff.material.opacity = amount * (0.12 + rand(i + Math.floor(performance.now() * 0.003)) * 0.22);
    puff.scale.setScalar(0.8 + amount * 1.6 + Math.sin(performance.now() * 0.004 + i) * 0.16);
    puff.position.set((rand(i) - 0.5) * 1.2, (puff.position.y + dt * (0.8 + i * 0.06)) % 3.4, 3.1 + rand(i + 8) * 1.8);
  }
}

function updateCamera(dt) {
  const target = inCar ? car.position : person.position;
  const heading = inCar ? car.heading : person.rotation.y;
  const speedLean = inCar ? THREE.MathUtils.clamp(Math.abs(car.speed) / 70, 0, 1) : 0;
  const followDistance = inCar ? 18 + speedLean * 11 : 13;
  const followHeight = inCar ? 7.2 + speedLean * 2.3 : 8;
  const sideLean = inCar ? -car.steer * 3.2 * speedLean : 0;
  const follow = new THREE.Vector3(target.x - Math.sin(heading) * followDistance + Math.cos(heading) * sideLean, followHeight + target.y, target.z - Math.cos(heading) * followDistance - Math.sin(heading) * sideLean);
  const lookAt = new THREE.Vector3(target.x + Math.sin(heading) * (inCar ? 18 + speedLean * 22 : 7), 2.4 + target.y + speedLean * 0.6, target.z + Math.cos(heading) * (inCar ? 18 + speedLean * 22 : 7));
  camera.fov = THREE.MathUtils.lerp(camera.fov, car.boost < 92 && Math.abs(car.speed) > 18 ? 70 : 64, 1 - Math.pow(0.004, dt));
  camera.updateProjectionMatrix();
  camera.position.lerp(follow, 1 - Math.pow(0.0007, dt));
  camera.lookAt(lookAt);
}

function updateHud() {
  speedEl.textContent = inCar ? String(Math.round(Math.abs(car.speed) * 2.55)) : "on foot";
  routeEl.textContent = String(car.drop);
  damageEl.textContent = `${Math.round(car.damage)}%`;
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
  if (k === "r") reset();
  keys.add(k);
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

addWorld();
addActors();
resize();
reset();

function animate() {
  const dt = Math.min(clock.getDelta(), 0.033);
  updatePlayer(dt);
  updateTraffic(dt);
  updatePedestrians(dt);
  updateCheckpoints(dt);
  updateEffects(dt);
  updateCamera(dt);
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
