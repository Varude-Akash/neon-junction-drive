import * as THREE from "three";

const canvas = document.getElementById("game");
const speedEl = document.getElementById("speed");
const routeEl = document.getElementById("route");
const styleEl = document.getElementById("style");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b0d);
scene.fog = new THREE.Fog(0x070b0d, 90, 520);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
const clock = new THREE.Clock();
const keys = new Set();

const city = new THREE.Group();
scene.add(city);

const car = {
  position: new THREE.Vector3(0, 0.45, 0),
  heading: 0,
  speed: 0,
  style: 0,
  bestStyle: 0,
  route: 0,
};

const roads = [];
const colliders = [];
const traffic = [];
const checkpoints = [
  new THREE.Vector3(0, 0, -125),
  new THREE.Vector3(150, 0, -125),
  new THREE.Vector3(150, 0, 25),
  new THREE.Vector3(300, 0, 25),
  new THREE.Vector3(300, 0, 175),
  new THREE.Vector3(0, 0, 175),
  new THREE.Vector3(-150, 0, 25),
  new THREE.Vector3(-150, 0, -125),
];
const checkpointMeshes = [];
const skidMarks = [];

const materials = {
  asphalt: new THREE.MeshStandardMaterial({ color: 0x25292b, roughness: 0.88 }),
  lane: new THREE.MeshBasicMaterial({ color: 0xd8c46f }),
  sidewalk: new THREE.MeshStandardMaterial({ color: 0x8b805f, roughness: 0.9 }),
  ground: new THREE.MeshStandardMaterial({ color: 0x162219, roughness: 1 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x20343a, roughness: 0.45, metalness: 0.15 }),
  red: new THREE.MeshStandardMaterial({ color: 0xc84035, roughness: 0.55, metalness: 0.2 }),
  trim: new THREE.MeshStandardMaterial({ color: 0xf2d377, roughness: 0.4, metalness: 0.1 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x080909, roughness: 0.92 }),
};

function box(w, h, d, material, x = 0, y = 0, z = 0, shadows = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  return mesh;
}

function addLights() {
  scene.add(new THREE.HemisphereLight(0xb7d7ff, 0x1f160f, 1.25));

  const sun = new THREE.DirectionalLight(0xffd9a3, 2.2);
  sun.position.set(-110, 180, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -330;
  sun.shadow.camera.right = 330;
  sun.shadow.camera.top = 330;
  sun.shadow.camera.bottom = -330;
  scene.add(sun);

  for (const [x, z, color] of [[-210, -130, 0xff5a45], [190, -80, 0x45d7c6], [260, 190, 0xffca5f], [-190, 150, 0x6f8cff]]) {
    const light = new THREE.PointLight(color, 2.2, 150, 1.6);
    light.position.set(x, 8, z);
    scene.add(light);
  }
}

function addRoad(horizontal, offset) {
  const roadMesh = horizontal
    ? box(760, 0.08, 34, materials.asphalt, 0, 0.02, offset)
    : box(34, 0.08, 560, materials.asphalt, offset, 0.02, 0);
  const walkMesh = horizontal
    ? box(760, 0.06, 48, materials.sidewalk, 0, 0.0, offset)
    : box(48, 0.06, 560, materials.sidewalk, offset, 0.0, 0);
  city.add(walkMesh, roadMesh);
  roads.push(horizontal
    ? { x: -380, z: offset - 17, w: 760, d: 34 }
    : { x: offset - 17, z: -280, w: 34, d: 560 });

  for (let i = -350; i <= 350; i += 42) {
    const lane = horizontal
      ? box(20, 0.03, 1.5, materials.lane, i, 0.09, offset)
      : box(1.5, 0.03, 20, materials.lane, offset, 0.09, i);
    city.add(lane);
  }
}

function addBuilding(x, z, w, d, h, color, signColor) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.08 });
  const building = box(w, h, d, mat, x, h / 2, z);
  colliders.push({ x: x - w / 2, z: z - d / 2, w, d });
  city.add(building);

  const rows = Math.floor(h / 8);
  for (let iy = 0; iy < rows; iy += 1) {
    for (let ix = -1; ix <= 1; ix += 1) {
      const windowMesh = box(4, 2.5, 0.12, materials.glass, x + ix * w * 0.23, 6 + iy * 7, z + d / 2 + 0.08, false);
      city.add(windowMesh);
    }
  }

  if (signColor) {
    const sign = box(Math.min(w * 0.58, 34), 4, 0.5, new THREE.MeshBasicMaterial({ color: signColor }), x, 7, z + d / 2 + 0.4, false);
    city.add(sign);
  }
}

function buildCity() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 700), materials.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  city.add(ground);

  for (const z of [-125, 25, 175]) addRoad(true, z);
  for (const x of [-300, -150, 0, 150, 300]) addRoad(false, x);

  const buildingData = [
    [-225, -205, 82, 74, 46, 0x3c4a48, 0xff5544],
    [-72, -205, 64, 74, 36, 0x4b453e, 0xf0c85f],
    [80, -205, 82, 74, 52, 0x34434f, 0x47d5c7],
    [230, -205, 76, 74, 40, 0x493940, 0xff5544],
    [-225, -50, 82, 68, 32, 0x4d4639, 0],
    [78, -50, 84, 68, 60, 0x354344, 0xf0c85f],
    [228, -50, 78, 68, 42, 0x3d4a37, 0x47d5c7],
    [-225, 100, 82, 68, 48, 0x34404d, 0x47d5c7],
    [-72, 100, 64, 68, 28, 0x4b3f36, 0],
    [80, 100, 82, 68, 44, 0x404b3f, 0xff5544],
    [230, 100, 76, 68, 54, 0x33394d, 0xf0c85f],
    [-72, 248, 64, 72, 42, 0x4a3d47, 0xff5544],
    [80, 248, 82, 72, 36, 0x334746, 0x47d5c7],
    [230, 248, 76, 72, 34, 0x504737, 0],
  ];
  for (const data of buildingData) addBuilding(...data);

  for (let i = 0; i < 54; i += 1) {
    const x = -350 + (i * 61) % 700;
    const z = [-142, -108, 8, 42, 158, 192][i % 6];
    const pole = box(0.9, 8, 0.9, materials.tire, x, 4, z, false);
    const lamp = box(4, 1.2, 4, new THREE.MeshBasicMaterial({ color: 0xffd67a }), x, 8.6, z, false);
    city.add(pole, lamp);
  }
}

function makeCar() {
  const group = new THREE.Group();
  const body = box(4.2, 1.35, 7.2, materials.red, 0, 1.15, 0);
  const cabin = box(3.2, 1.15, 3.2, materials.glass, 0, 2.25, -0.7);
  const hoodStripe = box(0.55, 0.08, 6.8, materials.trim, 0, 1.86, 0.05, false);
  group.add(body, cabin, hoodStripe);

  for (const x of [-2.25, 2.25]) {
    for (const z of [-2.55, 2.55]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.58, 16), materials.tire);
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
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0.12 });
  const group = new THREE.Group();
  group.add(box(3.9, 1.2, 6.8, mat, 0, 0.95, 0));
  group.add(box(2.8, 0.9, 2.7, materials.glass, 0, 1.85, -0.55));
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  traffic.push({ group, heading, speed });
}

function addTraffic() {
  const colors = [0xd4503f, 0xe6bd58, 0x4ca89d, 0xd8d3c8, 0x6376cb];
  for (let i = 0; i < 18; i += 1) {
    if (i % 2 === 0) {
      makeTrafficCar(colors[i % colors.length], -330 + i * 40, [-125, 25, 175][i % 3] + (i % 4 < 2 ? -7 : 7), Math.PI / 2, 14 + (i % 5) * 3);
    } else {
      makeTrafficCar(colors[i % colors.length], [-300, -150, 150, 300][i % 4] + (i % 3 ? -7 : 7), -250 + i * 27, 0, 12 + (i % 5) * 3);
    }
  }
}

function addCheckpoints() {
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd35c, transparent: true, opacity: 0.75 });
  for (const point of checkpoints) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.42, 10, 48), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(point).add(new THREE.Vector3(0, 0.4, 0));
    scene.add(ring);
    checkpointMeshes.push(ring);
  }
}

const carMesh = makeCar();
addLights();
buildCity();
addTraffic();
addCheckpoints();

function isOnRoad(position) {
  return roads.some((r) => position.x > r.x && position.x < r.x + r.w && position.z > r.z && position.z < r.z + r.d);
}

function hitsBuilding(position) {
  return colliders.some((r) => position.x > r.x - 2.4 && position.x < r.x + r.w + 2.4 && position.z > r.z - 3.2 && position.z < r.z + r.d + 3.2);
}

function reset() {
  car.position.set(0, 0.45, 0);
  car.heading = 0;
  car.speed = 0;
  car.style = 0;
  car.bestStyle = 0;
  car.route = 0;
}

function updateCar(dt) {
  const accel = keys.has("w") || keys.has("arrowup");
  const brake = keys.has("s") || keys.has("arrowdown");
  const left = keys.has("a") || keys.has("arrowleft");
  const right = keys.has("d") || keys.has("arrowright");
  const handbrake = keys.has(" ");
  const steer = (left ? 1 : 0) - (right ? 1 : 0);
  const roadGrip = isOnRoad(car.position) ? 1 : 0.48;

  if (accel) car.speed += 34 * dt;
  if (brake) car.speed -= 45 * dt;
  car.speed *= Math.pow(handbrake ? 0.973 : 0.988, dt * 60);
  car.speed *= Math.pow(roadGrip, dt * 5);
  car.speed = THREE.MathUtils.clamp(car.speed, -20, 58);

  const steerPower = THREE.MathUtils.clamp(Math.abs(car.speed) / 28, 0.15, 1.3);
  car.heading += steer * steerPower * (handbrake ? 2.4 : 1.55) * dt * (car.speed < 0 ? -1 : 1);

  const old = car.position.clone();
  const forward = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
  const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
  car.position.addScaledVector(forward, car.speed * dt);
  if (handbrake) car.position.addScaledVector(side, steer * Math.abs(car.speed) * 0.16 * dt);

  if (hitsBuilding(car.position)) {
    car.position.copy(old);
    car.speed *= -0.28;
  }

  if ((handbrake || Math.abs(steer) > 0.6) && Math.abs(car.speed) > 24) {
    car.style += Math.round(Math.abs(car.speed) * dt * 7);
    car.bestStyle = Math.max(car.bestStyle, car.style);
    addSkid(car.position, car.heading);
  } else {
    car.style = Math.max(0, car.style - Math.round(55 * dt));
  }

  carMesh.position.copy(car.position);
  carMesh.rotation.y = car.heading;
}

function addSkid(position, heading) {
  if (skidMarks.length > 120) {
    const old = skidMarks.shift();
    scene.remove(old);
  }
  const mark = box(0.18, 0.025, 3.2, new THREE.MeshBasicMaterial({ color: 0x030404, transparent: true, opacity: 0.45 }), position.x, 0.04, position.z, false);
  mark.rotation.y = heading;
  scene.add(mark);
  skidMarks.push(mark);
}

function updateTraffic(dt) {
  for (const npc of traffic) {
    const forward = new THREE.Vector3(Math.sin(npc.heading), 0, Math.cos(npc.heading));
    npc.group.position.addScaledVector(forward, npc.speed * dt);
    if (Math.abs(npc.group.position.x) > 390) npc.group.position.x *= -0.96;
    if (Math.abs(npc.group.position.z) > 290) npc.group.position.z *= -0.96;

    if (npc.group.position.distanceTo(car.position) < 6.2) {
      const away = car.position.clone().sub(npc.group.position).normalize();
      car.position.addScaledVector(away, 2.8);
      car.speed *= -0.36;
    }
  }
}

function updateCheckpoints(dt) {
  for (let i = 0; i < checkpointMeshes.length; i += 1) {
    const ring = checkpointMeshes[i];
    ring.visible = i === car.route;
    ring.rotation.z += dt * 1.8;
    ring.scale.setScalar(1 + Math.sin(performance.now() * 0.006) * 0.08);
  }

  const target = checkpoints[car.route];
  if (target && car.position.distanceTo(target) < 10) {
    car.route = (car.route + 1) % checkpoints.length;
    car.bestStyle += 120;
  }
}

function updateCamera(dt) {
  const follow = new THREE.Vector3(
    car.position.x - Math.sin(car.heading) * 18,
    9.5,
    car.position.z - Math.cos(car.heading) * 18
  );
  const lookAt = new THREE.Vector3(
    car.position.x + Math.sin(car.heading) * 12,
    2.4,
    car.position.z + Math.cos(car.heading) * 12
  );
  camera.position.lerp(follow, 1 - Math.pow(0.001, dt));
  camera.lookAt(lookAt);
}

function updateHud() {
  speedEl.textContent = String(Math.round(Math.abs(car.speed) * 3.1));
  routeEl.textContent = String(car.route);
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
  updateCar(dt);
  updateTraffic(dt);
  updateCheckpoints(dt);
  updateCamera(dt);
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
