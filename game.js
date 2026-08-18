import * as THREE from "three";

const canvas = document.getElementById("game");
const speedEl = document.getElementById("speed");
const routeEl = document.getElementById("route");
const styleEl = document.getElementById("style");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x081016);
scene.fog = new THREE.FogExp2(0x081016, 0.0019);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
const checkpointMeshes = [];
const skidMarks = [];
const billboards = [];
const jumpPads = [];
const driftZones = [];

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
};

const checkpoints = [
  [-360, -520], [-160, -320], [40, -120], [240, -320], [470, -120],
  [720, 90], [470, 310], [240, 540], [40, 760], [-160, 540],
  [-360, 310], [-560, 90], [-760, -120], [-560, -520],
].map(([x, z]) => new THREE.Vector3(x, 0, z));

const mat = {
  ground: new THREE.MeshStandardMaterial({ color: 0x132118, roughness: 1 }),
  sand: new THREE.MeshStandardMaterial({ color: 0xb19766, roughness: 1 }),
  water: new THREE.MeshStandardMaterial({ color: 0x1f6674, roughness: 0.35, metalness: 0.05 }),
  asphalt: new THREE.MeshStandardMaterial({ color: 0x24282b, roughness: 0.86 }),
  curb: new THREE.MeshStandardMaterial({ color: 0x95895f, roughness: 0.86 }),
  lane: new THREE.MeshBasicMaterial({ color: 0xe4cb71 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x163642, roughness: 0.28, metalness: 0.25 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.92 }),
  red: new THREE.MeshStandardMaterial({ color: 0xd64235, roughness: 0.48, metalness: 0.18 }),
  trim: new THREE.MeshStandardMaterial({ color: 0xf3ce61, roughness: 0.35, metalness: 0.12 }),
  glowGold: new THREE.MeshBasicMaterial({ color: 0xffcf5a }),
  glowPink: new THREE.MeshBasicMaterial({ color: 0xff4d74 }),
  glowCyan: new THREE.MeshBasicMaterial({ color: 0x46e2d0 }),
  black: new THREE.MeshStandardMaterial({ color: 0x050606, roughness: 0.9 }),
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

function addLights() {
  scene.add(new THREE.HemisphereLight(0xbedbff, 0x21140d, 1.7));
  const sun = new THREE.DirectionalLight(0xffca93, 2.8);
  sun.position.set(-240, 520, 180);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -950;
  sun.shadow.camera.right = 950;
  sun.shadow.camera.top = 950;
  sun.shadow.camera.bottom = -950;
  scene.add(sun);

  for (let i = 0; i < 42; i += 1) {
    const color = [0xff4d74, 0x46e2d0, 0xffcf5a][i % 3];
    const light = new THREE.PointLight(color, 1.7, 120, 1.7);
    light.position.set(-820 + rand(i) * 1640, 9, -780 + rand(i + 4) * 1560);
    scene.add(light);
  }
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
      const lit = rand(seed + col * 7 + row * 19) > 0.72;
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
  const trunk = cyl(1.6 * scale, 2.2 * scale, 16 * scale, new THREE.MeshStandardMaterial({ color: 0x765d3d, roughness: 0.9 }), x, 8 * scale, z, 8);
  const crown = new THREE.Group();
  crown.position.set(x, 16 * scale, z);
  for (let i = 0; i < 7; i += 1) {
    const leaf = box(3 * scale, 0.55 * scale, 18 * scale, new THREE.MeshStandardMaterial({ color: 0x2f7444, roughness: 0.75 }), 0, 0, 8 * scale, false);
    leaf.rotation.y = i * Math.PI * 2 / 7;
    leaf.rotation.x = 0.28;
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
        addPalm((x1 + x2) / 2, (z1 + z2) / 2, 1.4);
      } else if (rand(seed + 4) > 0.48 && w > 95) {
        addBuilding(x1 + w * 0.28, z1 + d * 0.5, w * 0.42, d * 0.74, 28 + rand(seed + 6) * 80, seed);
        addBuilding(x2 - w * 0.24, z1 + d * 0.5, w * 0.36, d * 0.58, 22 + rand(seed + 7) * 64, seed + 12);
      } else {
        addBuilding((x1 + x2) / 2, (z1 + z2) / 2, w * 0.76, d * 0.72, 22 + rand(seed + 8) * 86, seed);
      }
      seed += 1;
    }
  }

  for (let i = 0; i < 65; i += 1) addPalm(-835 + rand(i) * 110, -840 + rand(i + 6) * 1680, 0.85 + rand(i + 8) * 0.45);

  addRamp(-160, -120, Math.PI / 2);
  addRamp(240, 310, 0);
  addRamp(610, 540, -Math.PI / 2);
  addRamp(-560, 310, Math.PI / 2);

  driftZones.push({ x: 470, z: -320, r: 70 }, { x: -360, z: 540, r: 80 }, { x: 720, z: 310, r: 74 });
}

function makePlayerCar() {
  const group = new THREE.Group();
  group.add(box(5.2, 1.4, 8.7, mat.red, 0, 1.1, 0));
  group.add(box(3.5, 1.25, 3.9, mat.glass, 0, 2.25, -0.7));
  group.add(box(0.62, 0.08, 8.2, mat.trim, 0, 1.86, 0.1, false));
  group.add(box(5.6, 0.32, 1, mat.black, 0, 0.62, -4.2));
  for (const x of [-2.8, 2.8]) {
    for (const z of [-3.15, 3.15]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.62, 18), mat.tire);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.62, z);
      wheel.castShadow = true;
      group.add(wheel);
    }
  }
  scene.add(group);
  return group;
}

function makeTrafficCar(color, x, z, heading, speed) {
  const carMat = new THREE.MeshStandardMaterial({ color, roughness: 0.56, metalness: 0.15 });
  const group = new THREE.Group();
  group.add(box(4.8, 1.25, 8.2, carMat, 0, 0.95, 0));
  group.add(box(3.2, 0.95, 3.1, mat.glass, 0, 1.85, -0.55));
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  traffic.push({ group, heading, speed, baseSpeed: speed });
}

function addTraffic() {
  const colors = [0xd4503f, 0xe6bd58, 0x4ca89d, 0xd8d3c8, 0x6376cb, 0x9c4163];
  for (let i = 0; i < 55; i += 1) {
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

const playerCar = makePlayerCar();
addLights();
buildWorld();
addTraffic();
addCheckpoints();

function inRect(pos, r, pad = 0) {
  return pos.x > r.x - pad && pos.x < r.x + r.w + pad && pos.z > r.z - pad && pos.z < r.z + r.d + pad;
}

function isOnRoad(pos) {
  return roads.some((r) => inRect(pos, r));
}

function hitsBuilding(pos) {
  return colliders.some((r) => inRect(pos, r, 4.2));
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

function updatePlayer(dt) {
  const accel = keys.has("w") || keys.has("arrowup");
  const brake = keys.has("s") || keys.has("arrowdown");
  const left = keys.has("a") || keys.has("arrowleft");
  const right = keys.has("d") || keys.has("arrowright");
  const handbrake = keys.has(" ");
  const boosting = (keys.has("shift") || keys.has("shiftleft") || keys.has("shiftright")) && car.boost > 0 && car.speed > 12;
  const steer = (left ? 1 : 0) - (right ? 1 : 0);
  const roadGrip = isOnRoad(car.position) ? 1 : 0.46;

  if (accel) car.speed += (boosting ? 74 : 46) * dt;
  if (brake) car.speed -= 58 * dt;
  car.speed *= Math.pow(handbrake ? 0.974 : 0.989, dt * 60);
  car.speed *= Math.pow(roadGrip, dt * 5);
  car.speed = THREE.MathUtils.clamp(car.speed, -24, boosting ? 92 : 68);
  car.boost = THREE.MathUtils.clamp(car.boost + (boosting ? -38 : 10) * dt, 0, 100);

  const steerPower = THREE.MathUtils.clamp(Math.abs(car.speed) / 34, 0.08, 1.28);
  car.heading += steer * steerPower * (handbrake ? 2.75 : 1.6) * dt * (car.speed < 0 ? -1 : 1);

  const old = car.position.clone();
  const forward = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
  const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
  car.position.addScaledVector(forward, car.speed * dt);
  if (handbrake) car.position.addScaledVector(side, steer * Math.abs(car.speed) * 0.2 * dt);

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

  if (hitsBuilding(car.position)) {
    car.position.copy(old);
    car.speed *= -0.34;
  }

  for (const zone of driftZones) {
    if (Math.hypot(car.position.x - zone.x, car.position.z - zone.z) < zone.r && handbrake && Math.abs(car.speed) > 28) {
      car.bestStyle += Math.round(22 * dt);
    }
  }

  const drifting = (handbrake || Math.abs(steer) > 0.6) && Math.abs(car.speed) > 28;
  if (drifting) {
    car.style += Math.round(Math.abs(car.speed) * dt * 9);
    car.bestStyle = Math.max(car.bestStyle, car.style);
    addSkid(car.position, car.heading);
  } else {
    car.style = Math.max(0, car.style - Math.round(70 * dt));
  }

  playerCar.position.copy(car.position);
  playerCar.rotation.y = car.heading;
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
      car.speed *= -0.42;
      car.bestStyle = Math.max(0, car.bestStyle - 25);
    } else if (d < 15 && Math.abs(car.speed) > 45) {
      car.bestStyle += Math.round(18 * dt);
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

function updateCamera(dt) {
  const speedLean = THREE.MathUtils.clamp(Math.abs(car.speed) / 70, 0, 1);
  const followDistance = 24 + speedLean * 13;
  const followHeight = 11 + speedLean * 3;
  const follow = new THREE.Vector3(
    car.position.x - Math.sin(car.heading) * followDistance,
    followHeight + car.position.y,
    car.position.z - Math.cos(car.heading) * followDistance
  );
  const lookAt = new THREE.Vector3(
    car.position.x + Math.sin(car.heading) * (18 + speedLean * 18),
    2.8 + car.position.y,
    car.position.z + Math.cos(car.heading) * (18 + speedLean * 18)
  );
  camera.position.lerp(follow, 1 - Math.pow(0.0007, dt));
  camera.lookAt(lookAt);
}

function updateHud() {
  speedEl.textContent = String(Math.round(Math.abs(car.speed) * 2.55));
  routeEl.textContent = String(car.drop);
  styleEl.textContent = String(car.bestStyle);
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
  updateCheckpoints(dt);
  updateBillboards(dt);
  updateCamera(dt);
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
