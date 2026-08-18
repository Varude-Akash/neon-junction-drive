import * as THREE from "three";

const canvas = document.getElementById("game");
const speedEl = document.getElementById("speed");
const routeEl = document.getElementById("route");
const damageEl = document.getElementById("damage");

const scene = new THREE.Scene();

function makeSkyTexture() {
  const sky = document.createElement("canvas");
  sky.width = 32;
  sky.height = 256;
  const ctx = sky.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "#5db7ff");
  gradient.addColorStop(0.46, "#aee2ff");
  gradient.addColorStop(1, "#f9fcff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 256);
  for (let i = 0; i < 18; i += 1) {
    const x = rand(i) * 32;
    const y = 22 + rand(i + 3) * 95;
    const r = 2 + rand(i + 8) * 5;
    const cloud = ctx.createRadialGradient(x, y, 0, x, y, r);
    cloud.addColorStop(0, "rgba(255,255,255,0.82)");
    cloud.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = cloud;
    ctx.fillRect(Math.max(0, x - r), Math.max(0, y - r), r * 2, r * 2);
  }
  const texture = new THREE.CanvasTexture(sky);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

scene.background = makeSkyTexture();
scene.fog = new THREE.Fog(0xc8eaff, 120, 1050);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.15));
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 2600);
const clock = new THREE.Clock();
const keys = new Set();

const WORLD = 1800;
const ROAD_W = 30;
const roadXs = [-760, -560, -360, -160, 40, 240, 470, 720];
const roadZs = [-740, -520, -320, -120, 90, 310, 540, 760];
const roads = [];
const colliders = [];
const traffic = [];
const parkedCars = [];
const pedestrians = [];
const checkpointMeshes = [];
const skidMarks = [];
const billboards = [];
const jumpPads = [];
const driftZones = [];
let visibilityTimer = 0;

const car = {
  position: new THREE.Vector3(-560, 0.45, -520),
  heading: Math.PI / 2,
  speed: 0,
  style: 0,
  bestStyle: 0,
  drop: 0,
  boost: 100,
  airborne: 0,
  yVelocity: 0,
  steer: 0,
  turnVelocity: 0,
  visualTilt: 0,
  damage: 0,
  hitCooldown: 0,
};

let inCar = true;
let activeVehicle = null;
let person = null;
let interactCooldown = 0;
let contactShadow = null;
let underGlow = null;
let damageSmoke = null;

const checkpoints = [
  [-360, -520], [-160, -320], [40, -120], [240, -320], [470, -120],
  [720, 90], [470, 310], [240, 540], [40, 760], [-160, 540],
  [-360, 310], [-560, 90], [-760, -120], [-560, -520],
].map(([x, z]) => new THREE.Vector3(x, 0, z));

const mat = {
  ground: new THREE.MeshStandardMaterial({ color: 0x3f8c55, roughness: 0.94 }),
  sand: new THREE.MeshStandardMaterial({ color: 0xd6bd83, roughness: 1 }),
  water: new THREE.MeshStandardMaterial({ color: 0x42b7cd, roughness: 0.18, metalness: 0.06, emissive: 0x0b6f8b, emissiveIntensity: 0.25 }),
  asphalt: new THREE.MeshStandardMaterial({ color: 0x25282d, roughness: 0.88 }),
  curb: new THREE.MeshStandardMaterial({ color: 0x52616a, roughness: 0.54, emissive: 0x14333b, emissiveIntensity: 0.12 }),
  lane: new THREE.MeshStandardMaterial({ color: 0xf8f2c6, roughness: 0.55, emissive: 0xd8ff3e, emissiveIntensity: 0.7 }),
  rail: new THREE.MeshStandardMaterial({ color: 0x132126, roughness: 0.35, emissive: 0x24d6ff, emissiveIntensity: 1.35 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x142535, roughness: 0.18, metalness: 0.3, emissive: 0x061522, emissiveIntensity: 0.35 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.92 }),
  red: new THREE.MeshStandardMaterial({ color: 0xe8edf2, roughness: 0.3, metalness: 0.45 }),
  trim: new THREE.MeshStandardMaterial({ color: 0xd8ff3e, roughness: 0.35, metalness: 0.12, emissive: 0xd8ff3e, emissiveIntensity: 0.95 }),
  glowGold: new THREE.MeshBasicMaterial({ color: 0xffcf5a }),
  glowPink: new THREE.MeshBasicMaterial({ color: 0xff4d74 }),
  glowCyan: new THREE.MeshBasicMaterial({ color: 0x46e2d0 }),
  black: new THREE.MeshStandardMaterial({ color: 0x050606, roughness: 0.9 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xc8c8bc, roughness: 0.32, metalness: 0.5 }),
  headlight: new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
  brake: new THREE.MeshBasicMaterial({ color: 0xb51622 }),
  smoke: new THREE.MeshBasicMaterial({ color: 0x404348, transparent: true, opacity: 0.0, depthWrite: false }),
};

function rand(seed) {
  const x = Math.sin(seed * 127.31) * 43758.5453;
  return x - Math.floor(x);
}

function box(w, h, d, material, x = 0, y = 0, z = 0, shadows = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  return mesh;
}

function cyl(r1, r2, h, material, x, y, z, segments = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, segments), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function sedanHull(material, width = 5.8, length = 9.6) {
  const half = length / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0.3);
  shape.lineTo(-half + 0.8, 1.1);
  shape.lineTo(-half + 2.3, 1.35);
  shape.lineTo(-half + 3.6, 2.35);
  shape.lineTo(half - 2.9, 2.35);
  shape.lineTo(half - 1.75, 1.35);
  shape.lineTo(half - 0.55, 1.15);
  shape.lineTo(half, 0.45);
  shape.lineTo(half - 0.15, 0.0);
  shape.lineTo(-half + 0.2, 0.0);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.08, bevelSegments: 1 });
  geometry.translate(0, 0, -width / 2);
  geometry.rotateY(-Math.PI / 2);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function pane(w, h, material, x, y, z, ry = 0) {
  const mesh = box(w, h, 0.08, material, x, y, z, false);
  mesh.rotation.y = ry;
  return mesh;
}

function addLights() {
  scene.add(new THREE.HemisphereLight(0xf2fbff, 0x6c8656, 2.25));
  const sun = new THREE.DirectionalLight(0xffffff, 2.65);
  sun.position.set(-220, 560, 250);
  scene.add(sun);
}

function addRoad(horizontal, offset) {
  const length = WORLD;
  const road = horizontal
    ? box(length, 0.1, ROAD_W, mat.asphalt, 0, 0.04, offset)
    : box(ROAD_W, 0.1, length, mat.asphalt, offset, 0.04, 0);
  const curb = horizontal
    ? box(length, 0.08, ROAD_W + 14, mat.curb, 0, 0.015, offset)
    : box(ROAD_W + 14, 0.08, length, mat.curb, offset, 0.015, 0);
  scene.add(curb, road);
  roads.push(horizontal
    ? { x: -length / 2, z: offset - ROAD_W / 2, w: length, d: ROAD_W }
    : { x: offset - ROAD_W / 2, z: -length / 2, w: ROAD_W, d: length });

  for (let i = -860; i < 860; i += 54) {
    const stripe = horizontal
      ? box(25, 0.04, 1.5, mat.lane, i, 0.13, offset)
      : box(1.5, 0.04, 25, mat.lane, offset, 0.13, i);
    scene.add(stripe);
  }

  const edgeA = horizontal
    ? box(length, 0.12, 0.7, mat.rail, 0, 0.2, offset - ROAD_W / 2 - 1.3, false)
    : box(0.7, 0.12, length, mat.rail, offset - ROAD_W / 2 - 1.3, 0.2, 0, false);
  const edgeB = horizontal
    ? box(length, 0.12, 0.7, mat.rail, 0, 0.2, offset + ROAD_W / 2 + 1.3, false)
    : box(0.7, 0.12, length, mat.rail, offset + ROAD_W / 2 + 1.3, 0.2, 0, false);
  scene.add(edgeA, edgeB);
}

function addBuilding(x, z, w, d, h, seed) {
  const colors = [0x39464f, 0x514437, 0x374b43, 0x4a3948, 0x30384e, 0x4f4a3c];
  const buildingMat = new THREE.MeshStandardMaterial({ color: colors[seed % colors.length], roughness: 0.78, metalness: 0.08 });
  const b = box(w, h, d, buildingMat, x, h / 2, z);
  scene.add(b);
  colliders.push({ x: x - w / 2, z: z - d / 2, w, d });

  const faceZ = z + d / 2 + 0.08;
  const cols = Math.max(2, Math.floor(w / 14));
  const rows = Math.max(2, Math.floor(h / 10));
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (rand(seed + row * 13 + col) < 0.28) continue;
      const wx = x - w * 0.38 + col * (w * 0.76 / Math.max(1, cols - 1));
      const wy = 7 + row * 8;
      const lit = rand(seed + col * 7 + row * 19) > 0.82;
      scene.add(box(4.8, 3.2, 0.2, lit ? mat.glowGold : mat.glass, wx, wy, faceZ, false));
    }
  }

  if (rand(seed) > 0.52) {
    const signMat = [mat.glowPink, mat.glowCyan, mat.glowGold][seed % 3];
    const sign = box(Math.min(w * 0.72, 38), 5, 0.7, signMat, x, 8, z + d / 2 + 0.7, false);
    scene.add(sign);
    billboards.push(sign);
  }
}

function addPalm(x, z, scale = 1) {
  const trunkHeight = 7.2 * scale;
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x715333, roughness: 0.88 });
  const trunk = cyl(0.3 * scale, 0.46 * scale, trunkHeight, trunkMat, x, trunkHeight / 2, z, 9);
  trunk.rotation.z = (rand(x + z) - 0.5) * 0.12;
  const crown = new THREE.Group();
  crown.position.set(x, trunkHeight + 0.15 * scale, z);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x276f38, roughness: 0.8, side: THREE.DoubleSide });
  for (let i = 0; i < 9; i += 1) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(1.15 * scale, 6.4 * scale), leafMat);
    leaf.position.set(0, -0.35 * scale, 2.45 * scale);
    leaf.rotation.x = Math.PI / 2.45;
    leaf.rotation.y = i * Math.PI * 2 / 9;
    leaf.rotation.z = Math.sin(i) * 0.22;
    leaf.castShadow = true;
    crown.add(leaf);
  }
  scene.add(trunk, crown);
}

function addRamp(x, z, rot = 0) {
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(26, 3, 34), new THREE.MeshStandardMaterial({ color: 0x6f6555, roughness: 0.65 }));
  ramp.position.set(x, 1.2, z);
  ramp.rotation.x = -0.26;
  ramp.rotation.y = rot;
  ramp.castShadow = true;
  ramp.receiveShadow = true;
  scene.add(ramp);
  jumpPads.push({ x, z, rot, radius: 18 });
}

function addStreetLight(x, z, rot = 0) {
  const pole = cyl(0.16, 0.2, 8.2, mat.chrome, 0, 4.1, 0, 10);
  const arm = box(0.18, 0.18, 4.6, mat.chrome, 0, 7.95, 1.95, true);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), mat.headlight);
  bulb.position.set(0, 7.8, 4.2);
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;
  group.add(pole, arm, bulb);
  scene.add(group);

}

function buildWorld() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD), mat.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const beach = box(260, 0.05, WORLD, mat.sand, -880, 0.03, 0, false);
  const water = box(520, 0.02, WORLD, mat.water, -1115, 0.0, 0, false);
  scene.add(beach, water);

  for (const z of roadZs) addRoad(true, z);
  for (const x of roadXs) addRoad(false, x);

  for (let i = 0; i < roadXs.length; i += 2) {
    for (let z = -620; z <= 620; z += 360) addStreetLight(roadXs[i] + 26, z, Math.PI);
  }
  for (let i = 0; i < roadZs.length; i += 2) {
    for (let x = -620; x <= 620; x += 420) addStreetLight(x, roadZs[i] - 26, Math.PI / 2);
  }

  let seed = 1;
  for (let xi = 0; xi < roadXs.length - 1; xi += 1) {
    for (let zi = 0; zi < roadZs.length - 1; zi += 1) {
      const x1 = roadXs[xi] + ROAD_W / 2 + 18;
      const x2 = roadXs[xi + 1] - ROAD_W / 2 - 18;
      const z1 = roadZs[zi] + ROAD_W / 2 + 18;
      const z2 = roadZs[zi + 1] - ROAD_W / 2 - 18;
      const w = x2 - x1;
      const d = z2 - z1;
      if (w < 42 || d < 42) continue;
      if (rand(seed) < 0.16) {
        addPalm((x1 + x2) / 2, (z1 + z2) / 2, 0.85);
      } else if (rand(seed + 4) > 0.63 && w > 95) {
        addBuilding(x1 + w * 0.28, z1 + d * 0.5, w * 0.42, d * 0.74, 28 + rand(seed + 6) * 80, seed);
        addBuilding(x2 - w * 0.24, z1 + d * 0.5, w * 0.36, d * 0.58, 22 + rand(seed + 7) * 64, seed + 12);
      } else {
        addBuilding((x1 + x2) / 2, (z1 + z2) / 2, w * 0.76, d * 0.72, 22 + rand(seed + 8) * 86, seed);
      }
      seed += 1;
    }
  }

  for (let i = 0; i < 28; i += 1) addPalm(-835 + rand(i) * 110, -840 + rand(i + 6) * 1680, 0.62 + rand(i + 8) * 0.28);

  addRamp(-160, -120, Math.PI / 2);
  addRamp(240, 310, 0);
  addRamp(610, 540, -Math.PI / 2);
  addRamp(-560, 310, Math.PI / 2);

  driftZones.push({ x: 470, z: -320, r: 70 }, { x: -360, z: 540, r: 80 }, { x: 720, z: 310, r: 74 });
}

function makeCarModel(bodyMaterial, accentMaterial = mat.trim) {
  const group = new THREE.Group();
  group.add(sedanHull(bodyMaterial));
  group.add(pane(3.1, 0.72, mat.glass, -2.94, 1.82, -0.55, Math.PI / 2));
  group.add(pane(3.1, 0.72, mat.glass, 2.94, 1.82, -0.55, -Math.PI / 2));
  group.add(pane(3.0, 0.64, mat.glass, 0, 1.82, 1.88, 0));
  group.add(pane(2.7, 0.58, mat.glass, 0, 1.58, -2.85, 0));
  group.add(box(0.35, 0.12, 7.6, accentMaterial, -2.96, 1.15, -0.1, false));
  group.add(box(0.35, 0.12, 7.6, accentMaterial, 2.96, 1.15, -0.1, false));
  group.add(box(4.9, 0.28, 0.5, mat.black, 0, 0.46, -4.64));
  group.add(box(4.7, 0.24, 0.42, mat.chrome, 0, 0.58, 4.72));
  group.add(box(1.0, 0.24, 0.16, mat.headlight, -1.45, 0.92, 4.96, false));
  group.add(box(1.0, 0.24, 0.16, mat.headlight, 1.45, 0.92, 4.96, false));
  group.add(box(1.0, 0.25, 0.18, mat.brake, -1.62, 0.86, -4.86, false));
  group.add(box(1.0, 0.25, 0.18, mat.brake, 1.62, 0.86, -4.86, false));
  for (const x of [-2.8, 2.8]) {
    for (const z of [-3.0, 3.05]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.58, 22), mat.tire);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.48, z);
      wheel.castShadow = true;
      group.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.62, 18), mat.chrome);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x, 0.48, z);
      group.add(hub);
    }
  }
  return group;
}

function makePlayerCar() {
  const group = makeCarModel(mat.red, mat.trim);
  scene.add(group);
  return group;
}

function makeHuman(shirtColor, pantsColor, skinColor, hairColor) {
  const group = new THREE.Group();
  const limbs = { arms: [], legs: [], shoes: [] };
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.72 });
  const pants = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.82 });
  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.78 });
  const hair = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.88 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.9, 4, 10), shirt);
  torso.position.set(0, 2.05, 0);
  torso.scale.set(0.92, 1, 0.55);
  torso.castShadow = true;
  group.add(torso);

  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.88, 4, 8), skin);
    arm.position.set(side * 0.62, 1.86, 0);
    arm.rotation.z = side * 0.16;
    arm.castShadow = true;
    group.add(arm);
    limbs.arms.push({ mesh: arm, side });

    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.86, 4, 8), pants);
    leg.position.set(side * 0.22, 0.78, 0);
    leg.castShadow = true;
    group.add(leg);
    limbs.legs.push({ mesh: leg, side });

    const shoe = box(0.34, 0.14, 0.58, mat.black, side * 0.22, 0.13, 0.12, true);
    group.add(shoe);
    limbs.shoes.push({ mesh: shoe, side });
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 12), skin);
  head.position.set(0, 3.08, 0);
  head.castShadow = true;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.49, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair);
  cap.position.set(0, 3.2, 0);
  cap.castShadow = true;
  group.add(head, cap);
  group.userData.limbs = limbs;
  return group;
}

function animateHuman(group, phase, speed = 1, fallen = false) {
  const limbs = group.userData.limbs;
  if (!limbs) return;
  if (fallen) {
    for (const item of limbs.arms) {
      item.mesh.rotation.x = item.side * 0.85;
      item.mesh.rotation.z = item.side * 1.2;
    }
    for (const item of limbs.legs) {
      item.mesh.rotation.x = -0.55 + item.side * 0.12;
      item.mesh.rotation.z = item.side * 0.36;
    }
    return;
  }
  const stride = Math.sin(phase) * speed;
  for (const item of limbs.arms) {
    item.mesh.rotation.x = -stride * item.side * 0.9;
    item.mesh.rotation.z = item.side * (0.16 + Math.abs(stride) * 0.18);
  }
  for (const item of limbs.legs) {
    item.mesh.rotation.x = stride * item.side * 0.95;
    item.mesh.rotation.z = item.side * 0.04;
  }
  for (const item of limbs.shoes) {
    item.mesh.position.z = 0.12 + Math.max(0, stride * item.side) * 0.15;
  }
}

function makePerson() {
  const group = makeHuman(0x2c5fd7, 0x1b1b22, 0xb77955, 0x22160e);
  group.visible = false;
  scene.add(group);
  return group;
}

function makeTrafficCar(color, x, z, heading, speed) {
  const carMat = new THREE.MeshStandardMaterial({ color, roughness: 0.56, metalness: 0.15 });
  const group = makeCarModel(carMat, mat.chrome);
  group.scale.setScalar(0.92);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  traffic.push({ group, heading, speed, baseSpeed: speed });
  return group;
}

function makeParkedCar(color, x, z, heading) {
  const carMat = new THREE.MeshStandardMaterial({ color, roughness: 0.52, metalness: 0.2 });
  const group = makeCarModel(carMat, mat.chrome);
  group.scale.setScalar(0.96);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  parkedCars.push({ group, heading, taken: false });
  return group;
}

function addTraffic() {
  const colors = [0xd4503f, 0xe6bd58, 0x4ca89d, 0xd8d3c8, 0x6376cb, 0x9c4163];
  for (let i = 0; i < 30; i += 1) {
    const horizontal = i % 2 === 0;
    if (horizontal) {
      const z = roadZs[i % roadZs.length] + (i % 4 < 2 ? -8 : 8);
      makeTrafficCar(colors[i % colors.length], -860 + rand(i) * 1720, z, Math.PI / 2, 18 + rand(i + 3) * 18);
    } else {
      const x = roadXs[i % roadXs.length] + (i % 3 ? -8 : 8);
      makeTrafficCar(colors[i % colors.length], x, -860 + rand(i + 5) * 1720, 0, 16 + rand(i + 9) * 17);
    }
  }
}

function addParkedCars() {
  const colors = [0x1f72d8, 0x2e9e60, 0xe3d8c6, 0x111318, 0xb83d59, 0xe0a83e];
  const spots = [
    [-730, -548, Math.PI / 2], [-390, -548, Math.PI / 2], [-105, -348, 0],
    [72, -148, 0], [282, -348, Math.PI], [505, -148, Math.PI],
    [690, 118, Math.PI / 2], [430, 338, -Math.PI / 2], [270, 568, 0],
    [72, 788, Math.PI], [-198, 568, Math.PI], [-405, 338, Math.PI / 2],
    [-600, 118, 0], [-790, -92, -Math.PI / 2], [-592, -548, -Math.PI / 2],
  ];
  spots.forEach((spot, i) => makeParkedCar(colors[i % colors.length], spot[0], spot[1], spot[2]));
}

function makePedestrian(x, z, seed) {
  const group = makeHuman(
    [0xd64b38, 0x315bd8, 0x2f9c58, 0xe0c15c, 0x9b4aa0][seed % 5],
    [0x1a1d24, 0x293850, 0x3b332a][seed % 3],
    [0x8d5a3f, 0xbf8361, 0x6e4939][seed % 3],
    [0x15100c, 0x3b2519, 0xc48a45][seed % 3]
  );
  group.position.set(x, 0, z);
  scene.add(group);
  const angle = rand(seed + 20) * Math.PI * 2;
  const radius = 18 + rand(seed + 21) * 58;
  pedestrians.push({
    group,
    base: new THREE.Vector3(x, 0, z),
    target: new THREE.Vector3(x + Math.sin(angle) * radius, 0, z + Math.cos(angle) * radius),
    speed: 3.2 + rand(seed + 9) * 2.7,
    panic: 0,
    injured: 0,
    fallen: 0,
    hitVelocity: new THREE.Vector3(),
    phase: rand(seed + 12) * Math.PI * 2,
    seed,
  });
}

function addPedestrians() {
  for (let i = 0; i < 42; i += 1) {
    const roadX = roadXs[i % roadXs.length] + (i % 3 === 0 ? 27 : -27);
    const roadZ = roadZs[(i * 3) % roadZs.length] + (i % 4 < 2 ? 27 : -27);
    const x = i % 2 === 0 ? roadX : -820 + rand(i) * 1640;
    const z = i % 2 === 0 ? -820 + rand(i + 4) * 1640 : roadZ;
    makePedestrian(x, z, i);
  }
}

function addCheckpoints() {
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd35c, transparent: true, opacity: 0.84 });
  for (const point of checkpoints) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(13, 0.7, 12, 64), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(point).add(new THREE.Vector3(0, 1.2, 0));
    scene.add(ring);
    checkpointMeshes.push(ring);
  }
}

function addVehicleEffects() {
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x02060d, transparent: true, opacity: 0.42, depthWrite: false });
  contactShadow = new THREE.Mesh(new THREE.CircleGeometry(4.4, 32), shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.renderOrder = 1;
  scene.add(contactShadow);

  underGlow = new THREE.PointLight(0x24d6ff, 1.8, 28, 2);
  scene.add(underGlow);

  damageSmoke = new THREE.Group();
  for (let i = 0; i < 7; i += 1) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.55 + i * 0.08, 8, 6), mat.smoke.clone());
    puff.position.set((rand(i) - 0.5) * 1.2, 0.8 + rand(i + 4) * 1.3, 3.1 + rand(i + 8) * 1.8);
    damageSmoke.add(puff);
  }
  scene.add(damageSmoke);
}

const playerCar = makePlayerCar();
activeVehicle = playerCar;
person = makePerson();
addLights();
buildWorld();
addTraffic();
addParkedCars();
addPedestrians();
addCheckpoints();
addVehicleEffects();

function inRect(pos, r, pad = 0) {
  return pos.x > r.x - pad && pos.x < r.x + r.w + pad && pos.z > r.z - pad && pos.z < r.z + r.d + pad;
}

function isOnRoad(pos) {
  return roads.some((r) => inRect(pos, r));
}

function hitsBuilding(pos) {
  return colliders.some((r) => inRect(pos, r, 4.2));
}

function hitsParkedCar(pos) {
  return parkedCars.some((parked) => parked.group !== activeVehicle && parked.group.position.distanceTo(pos) < 7.4);
}

function addCarDamage(amount, impactDir = null) {
  car.damage = THREE.MathUtils.clamp(car.damage + amount, 0, 100);
  car.hitCooldown = 0.24;
  if (activeVehicle && impactDir) {
    activeVehicle.rotation.z += THREE.MathUtils.clamp(impactDir.x * 0.08, -0.14, 0.14);
    activeVehicle.rotation.x += THREE.MathUtils.clamp(impactDir.z * 0.04, -0.08, 0.08);
  }
}

function hitPedestrian(ped, force) {
  if (ped.injured > 0.2) return;
  const push = ped.group.position.clone().sub(car.position);
  if (push.lengthSq() < 0.01) push.set(Math.sin(car.heading), 0, Math.cos(car.heading));
  push.normalize();
  ped.injured = 1;
  ped.fallen = 2.8 + THREE.MathUtils.clamp(force / 24, 0, 2.2);
  ped.panic = 0;
  ped.hitVelocity.copy(push).multiplyScalar(10 + force * 0.36);
  ped.group.rotation.y = Math.atan2(push.x, push.z);
  car.speed *= 0.5;
  addCarDamage(4 + force * 0.18, push);
}

function reset() {
  car.position.set(-560, 0.45, -520);
  car.heading = Math.PI / 2;
  car.speed = 0;
  car.style = 0;
  car.bestStyle = 0;
  car.drop = 0;
  car.boost = 100;
  car.airborne = 0;
  car.yVelocity = 0;
  car.steer = 0;
  car.turnVelocity = 0;
  car.visualTilt = 0;
  car.damage = 0;
  car.hitCooldown = 0;
  inCar = true;
  activeVehicle = playerCar;
  playerCar.visible = true;
  playerCar.rotation.x = 0;
  playerCar.rotation.z = 0;
  person.visible = false;
  person.position.copy(car.position);
  person.rotation.y = car.heading;
  interactCooldown = 0;
  document.body.classList.remove("boosting");
}

function addSkid(pos, heading) {
  if (skidMarks.length > 180) {
    const old = skidMarks.shift();
    scene.remove(old);
    old.geometry.dispose();
  }
  const mark = box(0.24, 0.025, 5.6, new THREE.MeshBasicMaterial({ color: 0x020303, transparent: true, opacity: 0.46 }), pos.x, 0.055, pos.z, false);
  mark.rotation.y = heading;
  scene.add(mark);
  skidMarks.push(mark);
}

function nearestParkedCar(maxDistance = 13) {
  let nearest = null;
  let best = maxDistance;
  for (const parked of parkedCars) {
    const d = parked.group.position.distanceTo(person.position);
    if (d < best) {
      nearest = parked;
      best = d;
    }
  }
  const ownDistance = activeVehicle.position.distanceTo(person.position);
  if (ownDistance < best) {
    nearest = { group: activeVehicle, heading: activeVehicle.rotation.y, own: true };
  }
  return nearest;
}

function toggleEnterExit() {
  if (interactCooldown > 0) return;
  interactCooldown = 0.35;
  if (inCar) {
    inCar = false;
    car.speed = 0;
    car.visualTilt = 0;
    activeVehicle.rotation.z = 0;
    document.body.classList.remove("boosting");
    person.visible = true;
    person.position.copy(car.position).add(new THREE.Vector3(Math.cos(car.heading) * 6, 0, -Math.sin(car.heading) * 6));
    person.rotation.y = car.heading;
    return;
  }

  const target = nearestParkedCar();
  if (!target) return;
  inCar = true;
  activeVehicle = target.group;
  car.position.copy(target.group.position);
  car.position.y = 0.45;
  car.heading = target.group.rotation.y;
  car.speed = 0;
  car.visualTilt = 0;
  car.damage = target.own ? car.damage : 0;
  car.hitCooldown = 0;
  activeVehicle.rotation.x = 0;
  target.group.rotation.z = 0;
  person.visible = false;
}

function updatePerson(dt) {
  const forwardInput = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
  const turnInput = (keys.has("a") || keys.has("arrowleft") ? 1 : 0) - (keys.has("d") || keys.has("arrowright") ? 1 : 0);
  person.rotation.y += turnInput * 2.8 * dt;
  const walk = keys.has("shift") ? 18 : 10;
  const forward = new THREE.Vector3(Math.sin(person.rotation.y), 0, Math.cos(person.rotation.y));
  const old = person.position.clone();
  person.position.addScaledVector(forward, forwardInput * walk * dt);
  animateHuman(person, performance.now() * 0.01, Math.abs(forwardInput) * (keys.has("shift") ? 1.4 : 0.85), false);
  car.position.copy(person.position);
  car.heading = person.rotation.y;
  if (hitsBuilding(person.position)) person.position.copy(old);
}

function updatePlayer(dt) {
  interactCooldown = Math.max(0, interactCooldown - dt);
  car.hitCooldown = Math.max(0, car.hitCooldown - dt);
  if (keys.has("e")) toggleEnterExit();
  if (!inCar) {
    document.body.classList.remove("boosting");
    updatePerson(dt);
    return;
  }

  const accel = keys.has("w") || keys.has("arrowup");
  const brake = keys.has("s") || keys.has("arrowdown");
  const left = keys.has("a") || keys.has("arrowleft");
  const right = keys.has("d") || keys.has("arrowright");
  const handbrake = keys.has(" ");
  const boosting = (keys.has("shift") || keys.has("shiftleft") || keys.has("shiftright")) && car.boost > 0 && car.speed > 12;
  const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
  const roadGrip = isOnRoad(car.position) ? 1 : 0.46;
  const damageGrip = THREE.MathUtils.lerp(1, 0.56, car.damage / 100);
  const maxForward = (boosting ? 96 : 72) * THREE.MathUtils.lerp(1, 0.58, car.damage / 100);
  const steerEase = 1 - Math.pow(0.0009, dt);

  car.steer = THREE.MathUtils.lerp(car.steer, steerTarget, steerEase);
  if (Math.abs(steerTarget) < 0.01) car.steer *= Math.pow(0.08, dt);

  if (accel) car.speed += (boosting ? 82 : 50) * dt;
  if (brake) car.speed -= car.speed > 8 ? 74 * dt : 46 * dt;
  car.speed *= Math.pow(handbrake ? 0.965 : 0.992, dt * 60);
  car.speed *= Math.pow(roadGrip, dt * 5);
  if (car.damage > 65 && Math.sin(performance.now() * 0.018) > 0.78) car.speed *= 0.985;
  car.speed = THREE.MathUtils.clamp(car.speed, -22, maxForward);
  car.boost = THREE.MathUtils.clamp(car.boost + (boosting ? -38 : 10) * dt, 0, 100);

  const steerPower = THREE.MathUtils.clamp(Math.abs(car.speed) / 38, 0.05, 1.22) * damageGrip;
  const targetTurn = car.steer * steerPower * (handbrake ? 2.45 : 1.45) * (car.speed < 0 ? -1 : 1);
  car.turnVelocity = THREE.MathUtils.lerp(car.turnVelocity, targetTurn, 1 - Math.pow(0.0016, dt));
  car.heading += car.turnVelocity * dt;

  const old = car.position.clone();
  const forward = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
  const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
  car.position.addScaledVector(forward, car.speed * dt);
  if (handbrake) car.position.addScaledVector(side, car.steer * Math.abs(car.speed) * 0.23 * dt);

  for (const ramp of jumpPads) {
    if (Math.hypot(car.position.x - ramp.x, car.position.z - ramp.z) < ramp.radius && Math.abs(car.speed) > 35 && car.airborne <= 0) {
      car.airborne = 1;
      car.yVelocity = 30;
      car.bestStyle += 90;
    }
  }

  if (car.airborne > 0 || car.position.y > 0.45) {
    car.yVelocity -= 46 * dt;
    car.position.y += car.yVelocity * dt;
    if (car.position.y <= 0.45) {
      car.position.y = 0.45;
      car.airborne = 0;
      car.yVelocity = 0;
    }
  }

  if (hitsBuilding(car.position) || hitsParkedCar(car.position)) {
    const hitForce = Math.abs(car.speed);
    const impactDir = car.position.clone().sub(old);
    if (impactDir.lengthSq() < 0.001) impactDir.set(Math.sin(car.heading), 0, Math.cos(car.heading));
    impactDir.normalize();
    car.position.copy(old);
    car.speed *= -0.28;
    if (hitForce > 10) addCarDamage(5 + hitForce * 0.26, impactDir);
  }

  for (const zone of driftZones) {
    if (Math.hypot(car.position.x - zone.x, car.position.z - zone.z) < zone.r && handbrake && Math.abs(car.speed) > 28) {
      car.bestStyle += Math.round(22 * dt);
    }
  }

  const drifting = (handbrake || Math.abs(car.steer) > 0.62) && Math.abs(car.speed) > 28;
  if (drifting) {
    car.style += Math.round(Math.abs(car.speed) * dt * 9);
    car.bestStyle = Math.max(car.bestStyle, car.style);
    addSkid(car.position, car.heading);
  } else {
    car.style = Math.max(0, car.style - Math.round(70 * dt));
  }

  activeVehicle.position.copy(car.position);
  activeVehicle.rotation.y = car.heading;
  const impactRock = car.hitCooldown > 0 ? Math.sin(performance.now() * 0.07) * car.hitCooldown * 0.18 : 0;
  car.visualTilt = THREE.MathUtils.lerp(car.visualTilt, -car.steer * THREE.MathUtils.clamp(Math.abs(car.speed) / 80, 0, 1) * 0.12 + impactRock, 1 - Math.pow(0.002, dt));
  activeVehicle.rotation.z = car.visualTilt;
  activeVehicle.rotation.x = THREE.MathUtils.lerp(activeVehicle.rotation.x, 0, 1 - Math.pow(0.006, dt));
  document.body.classList.toggle("boosting", boosting);
}

function updateTraffic(dt) {
  for (const npc of traffic) {
    const forward = new THREE.Vector3(Math.sin(npc.heading), 0, Math.cos(npc.heading));
    npc.group.position.addScaledVector(forward, npc.speed * dt);
    if (Math.abs(npc.group.position.x) > 900) npc.group.position.x *= -0.96;
    if (Math.abs(npc.group.position.z) > 900) npc.group.position.z *= -0.96;
    npc.speed = npc.baseSpeed * (0.8 + Math.sin(performance.now() * 0.001 + npc.baseSpeed) * 0.18);

    const d = npc.group.position.distanceTo(car.position);
    if (d < 7.5) {
      const away = car.position.clone().sub(npc.group.position).normalize();
      car.position.addScaledVector(away, 4.2);
      addCarDamage(7 + Math.abs(car.speed) * 0.18, away);
      car.speed *= -0.42;
      car.bestStyle = Math.max(0, car.bestStyle - 25);
    } else if (d < 15 && Math.abs(car.speed) > 45) {
      car.bestStyle += Math.round(18 * dt);
    }
  }
}

function updatePedestrians(dt) {
  for (const ped of pedestrians) {
    const now = performance.now() * 0.001;
    const toCar = ped.group.position.clone().sub(car.position);
    const carDistance = toCar.length();

    if (ped.fallen > 0) {
      ped.fallen -= dt;
      ped.group.position.addScaledVector(ped.hitVelocity, dt);
      ped.hitVelocity.multiplyScalar(Math.pow(0.08, dt));
      ped.group.position.y = 0.18;
      ped.group.rotation.x = THREE.MathUtils.lerp(ped.group.rotation.x, Math.PI / 2, 1 - Math.pow(0.0003, dt));
      ped.group.rotation.z = THREE.MathUtils.lerp(ped.group.rotation.z, 0.34, 1 - Math.pow(0.002, dt));
      animateHuman(ped.group, now * 8 + ped.seed, 0, true);
      continue;
    }

    if (ped.injured > 0) {
      ped.injured = Math.max(0, ped.injured - dt * 0.12);
      ped.group.rotation.x = THREE.MathUtils.lerp(ped.group.rotation.x, 0, 1 - Math.pow(0.002, dt));
      ped.group.rotation.z = THREE.MathUtils.lerp(ped.group.rotation.z, 0, 1 - Math.pow(0.002, dt));
    }

    if (inCar && carDistance < 46 && Math.abs(car.speed) > 18 && ped.injured <= 0) {
      ped.panic = Math.max(ped.panic, 1.6);
      const flee = toCar.lengthSq() > 0.01 ? toCar.normalize() : new THREE.Vector3(Math.sin(ped.seed), 0, Math.cos(ped.seed));
      ped.target.copy(ped.group.position).addScaledVector(flee, 48);
    }

    if (inCar && carDistance < 5.2 && Math.abs(car.speed) > 10) {
      hitPedestrian(ped, Math.abs(car.speed));
      continue;
    }

    ped.panic = Math.max(0, ped.panic - dt);
    const toTarget = ped.target.clone().sub(ped.group.position);
    const dist = toTarget.length();
    if (dist < 4) {
      const angle = rand(ped.seed + Math.floor(now * 0.21) + Math.floor(ped.base.x)) * Math.PI * 2;
      const radius = 14 + rand(ped.seed + Math.floor(now * 0.17) + 9) * 72;
      ped.target.set(
        THREE.MathUtils.clamp(ped.base.x + Math.sin(angle) * radius, -870, 870),
        0,
        THREE.MathUtils.clamp(ped.base.z + Math.cos(angle) * radius, -870, 870)
      );
    } else {
      const dir = toTarget.normalize();
      const moveSpeed = ped.speed * (ped.panic > 0 ? 2.6 : 1) * (ped.injured > 0 ? 0.42 : 1);
      const old = ped.group.position.clone();
      ped.group.position.addScaledVector(dir, moveSpeed * dt);
      if (hitsBuilding(ped.group.position) || !isOnRoad(ped.group.position) && ped.panic > 0.5 && rand(ped.seed + Math.floor(now * 7)) < 0.025) {
        ped.group.position.copy(old);
        ped.target.copy(ped.base);
      }
      ped.group.rotation.y = Math.atan2(dir.x, dir.z);
      ped.phase += dt * moveSpeed * 2.2;
      ped.group.position.y = Math.abs(Math.sin(ped.phase)) * 0.08;
      animateHuman(ped.group, ped.phase, ped.panic > 0 ? 1.35 : 0.85, false);
    }
  }
}

function updateCheckpoints(dt) {
  for (let i = 0; i < checkpointMeshes.length; i += 1) {
    const ring = checkpointMeshes[i];
    ring.visible = i === car.drop;
    ring.rotation.z += dt * 2.2;
    const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.1;
    ring.scale.setScalar(pulse);
  }

  const target = checkpoints[car.drop];
  if (target && car.position.distanceTo(target) < 18) {
    car.drop = (car.drop + 1) % checkpoints.length;
    car.bestStyle += 180;
    car.boost = Math.min(100, car.boost + 28);
  }
}

function updateBillboards(dt) {
  for (const sign of billboards) {
    sign.material.opacity = 0.75 + Math.sin(performance.now() * 0.004 + sign.position.x) * 0.25;
  }
}

function updateVisibility(dt) {
  visibilityTimer -= dt;
  if (visibilityTimer > 0) return;
  visibilityTimer = 0.35;

  const near = car.position;
  const trafficRange = 520 * 520;
  const pedestrianRange = 360 * 360;
  const signRange = 600 * 600;

  for (const npc of traffic) {
    npc.group.visible = npc.group.position.distanceToSquared(near) < trafficRange;
  }
  for (const parked of parkedCars) {
    parked.group.visible = parked.group === activeVehicle || parked.group.position.distanceToSquared(near) < trafficRange;
  }
  for (const ped of pedestrians) {
    ped.group.visible = !inCar || ped.group.position.distanceToSquared(near) < pedestrianRange;
  }
  for (const sign of billboards) {
    sign.visible = sign.position.distanceToSquared(near) < signRange;
  }
}

function updateVehicleEffects(dt) {
  if (!contactShadow || !underGlow) return;
  contactShadow.visible = inCar;
  underGlow.visible = inCar;
  if (damageSmoke) damageSmoke.visible = inCar && car.damage > 22;
  if (!inCar) return;

  contactShadow.position.set(car.position.x, 0.08, car.position.z);
  const shadowScale = 1 + THREE.MathUtils.clamp(Math.abs(car.speed) / 95, 0, 1) * 0.18;
  contactShadow.scale.lerp(new THREE.Vector3(1.25 * shadowScale, 0.62 * shadowScale, 1), 1 - Math.pow(0.002, dt));
  contactShadow.material.opacity = car.airborne > 0 ? 0.18 : 0.42;

  underGlow.position.set(car.position.x, 0.55, car.position.z);
  underGlow.intensity = 1.4 + THREE.MathUtils.clamp(Math.abs(car.speed) / 90, 0, 1) * 1.2 + (car.boost < 94 ? 0.6 : 0);

  if (damageSmoke) {
    const forward = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
    damageSmoke.position.copy(car.position).addScaledVector(forward, 2.8);
    damageSmoke.position.y += 1.2;
    damageSmoke.rotation.y = car.heading;
    const smokeAmount = THREE.MathUtils.clamp((car.damage - 18) / 82, 0, 1);
    for (let i = 0; i < damageSmoke.children.length; i += 1) {
      const puff = damageSmoke.children[i];
      puff.material.opacity = smokeAmount * (0.12 + rand(i + Math.floor(performance.now() * 0.003)) * 0.22);
      puff.scale.setScalar(0.8 + smokeAmount * 1.6 + Math.sin(performance.now() * 0.004 + i) * 0.16);
      puff.position.y += dt * (0.8 + i * 0.06);
      if (puff.position.y > 3.4) puff.position.y = 0.8 + rand(i) * 0.6;
    }
  }
}

function updateCamera(dt) {
  if (!inCar) {
    const follow = new THREE.Vector3(
      person.position.x - Math.sin(person.rotation.y) * 13,
      8,
      person.position.z - Math.cos(person.rotation.y) * 13
    );
    const lookAt = new THREE.Vector3(
      person.position.x + Math.sin(person.rotation.y) * 7,
      2.8,
      person.position.z + Math.cos(person.rotation.y) * 7
    );
    camera.position.lerp(follow, 1 - Math.pow(0.0008, dt));
    camera.lookAt(lookAt);
    return;
  }

  const speedLean = THREE.MathUtils.clamp(Math.abs(car.speed) / 70, 0, 1);
  const followDistance = 18 + speedLean * 11;
  const followHeight = 7.2 + speedLean * 2.3;
  const sideLean = -car.steer * 3.2 * speedLean;
  const follow = new THREE.Vector3(
    car.position.x - Math.sin(car.heading) * followDistance + Math.cos(car.heading) * sideLean,
    followHeight + car.position.y,
    car.position.z - Math.cos(car.heading) * followDistance - Math.sin(car.heading) * sideLean
  );
  const lookAt = new THREE.Vector3(
    car.position.x + Math.sin(car.heading) * (18 + speedLean * 22),
    2.4 + car.position.y + speedLean * 0.6,
    car.position.z + Math.cos(car.heading) * (18 + speedLean * 22)
  );
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
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
  if (key === "r") reset();
  keys.add(key);
});
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));

resize();
reset();

function animate() {
  const dt = Math.min(clock.getDelta(), 0.033);
  updatePlayer(dt);
  updateTraffic(dt);
  updatePedestrians(dt);
  updateCheckpoints(dt);
  updateBillboards(dt);
  updateVisibility(dt);
  updateVehicleEffects(dt);
  updateCamera(dt);
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
