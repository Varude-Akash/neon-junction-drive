(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const speedEl = document.getElementById("speed");
  const scoreEl = document.getElementById("score");
  const targetEl = document.getElementById("target");
  const chainEl = document.getElementById("chain");
  const districtEl = document.getElementById("district");

  const keys = new Set();
  const world = { width: 3200, height: 2400, block: 360, road: 118 };
  const targetScore = 8;
  const districts = ["Downtown Loop", "Marina Mile", "Market Grid", "Palm Quarter"];
  const roadColor = "#2a2e2c";
  const curbColor = "#d8c485";
  const grassColor = "#273829";
  const laneColor = "rgba(244, 226, 150, 0.55)";

  const car = {
    x: 620,
    y: 570,
    angle: -Math.PI / 2,
    speed: 0,
    width: 34,
    height: 58,
    score: 0,
    bestChain: 0,
    chain: 0,
    shake: 0,
  };

  const camera = { x: 0, y: 0 };
  const marks = [];
  const particles = [];
  const checkpoints = [];
  const traffic = [];

  let lastTime = performance.now();

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function rand(seed) {
    const s = Math.sin(seed * 999.91) * 43758.5453;
    return s - Math.floor(s);
  }

  function isRoad(x, y) {
    const bx = ((x % world.block) + world.block) % world.block;
    const by = ((y % world.block) + world.block) % world.block;
    return bx < world.road || by < world.road;
  }

  function nextRoadPoint(seed) {
    const gx = Math.floor(rand(seed) * 8) * world.block + world.road / 2;
    const gy = Math.floor(rand(seed + 11) * 6) * world.block + world.road / 2;
    if (rand(seed + 19) > 0.5) {
      return { x: gx, y: Math.floor(rand(seed + 3) * 6) * world.block + world.road / 2 };
    }
    return { x: Math.floor(rand(seed + 7) * 8) * world.block + world.road / 2, y: gy };
  }

  function seedCheckpoints() {
    checkpoints.length = 0;
    for (let i = 0; i < targetScore; i += 1) {
      checkpoints.push({ ...nextRoadPoint(i + 5), pulse: i * 0.7, hit: false });
    }
    targetEl.textContent = String(targetScore);
  }

  function seedTraffic() {
    traffic.length = 0;
    for (let i = 0; i < 28; i += 1) {
      const horizontal = i % 2 === 0;
      const lane = Math.floor(rand(i + 2) * (horizontal ? 6 : 8)) * world.block + world.road * 0.72;
      traffic.push({
        x: horizontal ? rand(i + 1) * world.width : lane,
        y: horizontal ? lane : rand(i + 4) * world.height,
        angle: horizontal ? 0 : Math.PI / 2,
        speed: 48 + rand(i + 8) * 42,
        color: ["#c94f3d", "#e1bb57", "#5aa39b", "#d9d6c7", "#577bca"][i % 5],
        horizontal,
      });
    }
  }

  function resetGame() {
    car.x = 620;
    car.y = 570;
    car.angle = -Math.PI / 2;
    car.speed = 0;
    car.score = 0;
    car.chain = 0;
    car.shake = 0;
    marks.length = 0;
    particles.length = 0;
    seedCheckpoints();
    updateHud();
  }

  function updateHud() {
    speedEl.textContent = String(Math.round(Math.abs(car.speed) * 0.72));
    scoreEl.textContent = String(car.score);
    chainEl.textContent = String(car.bestChain);
    const districtIndex = Math.floor(car.x / 800 + car.y / 700) % districts.length;
    districtEl.textContent = districts[districtIndex];
  }

  function createSkid(dt, handbrake, turn) {
    const drifting = handbrake || (Math.abs(turn) > 0.6 && Math.abs(car.speed) > 130);
    if (!drifting) return;
    const rearX = car.x - Math.cos(car.angle) * 22;
    const rearY = car.y - Math.sin(car.angle) * 22;
    marks.push({
      x: rearX,
      y: rearY,
      angle: car.angle,
      life: 1,
    });
    car.chain += Math.round(Math.abs(car.speed) * dt * 0.08);
    car.bestChain = Math.max(car.bestChain, car.chain);
    if (marks.length > 220) marks.shift();
  }

  function updateCar(dt) {
    const throttle = keys.has("w") || keys.has("arrowup");
    const brake = keys.has("s") || keys.has("arrowdown");
    const left = keys.has("a") || keys.has("arrowleft");
    const right = keys.has("d") || keys.has("arrowright");
    const handbrake = keys.has(" ");
    const turn = (right ? 1 : 0) - (left ? 1 : 0);

    if (throttle) car.speed += 260 * dt;
    if (brake) car.speed -= 330 * dt;

    const surfaceGrip = isRoad(car.x, car.y) ? 1 : 0.62;
    const drag = handbrake ? 0.972 : 0.988;
    car.speed *= Math.pow(drag * surfaceGrip, dt * 60);
    car.speed = clamp(car.speed, -165, 390);

    const steerPower = clamp(Math.abs(car.speed) / 170, 0.25, 1.35);
    const reverse = car.speed < 0 ? -1 : 1;
    car.angle += turn * reverse * steerPower * (handbrake ? 3.0 : 2.25) * dt;

    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(car.x, 24, world.width - 24);
    car.y = clamp(car.y, 24, world.height - 24);

    if (!handbrake && Math.abs(turn) < 0.2) car.chain = Math.max(0, car.chain - Math.round(70 * dt));
    createSkid(dt, handbrake, turn);
  }

  function updateTraffic(dt) {
    for (const npc of traffic) {
      npc.x += Math.cos(npc.angle) * npc.speed * dt;
      npc.y += Math.sin(npc.angle) * npc.speed * dt;
      if (npc.horizontal && npc.x > world.width + 80) npc.x = -80;
      if (!npc.horizontal && npc.y > world.height + 80) npc.y = -80;

      const dx = npc.x - car.x;
      const dy = npc.y - car.y;
      if (Math.hypot(dx, dy) < 42) {
        car.x -= dx * 0.08;
        car.y -= dy * 0.08;
        car.speed *= -0.28;
        car.shake = 0.45;
        for (let i = 0; i < 10; i += 1) {
          particles.push({
            x: car.x,
            y: car.y,
            vx: (rand(performance.now() + i) - 0.5) * 180,
            vy: (rand(performance.now() + i + 7) - 0.5) * 180,
            life: 0.5,
          });
        }
      }
    }
  }

  function updateCheckpoints(dt) {
    for (const point of checkpoints) {
      point.pulse += dt;
      if (!point.hit && Math.hypot(point.x - car.x, point.y - car.y) < 62) {
        point.hit = true;
        car.score += 1;
        car.chain += 125;
        car.bestChain = Math.max(car.bestChain, car.chain);
      }
    }

    if (checkpoints.every((point) => point.hit)) {
      seedCheckpoints();
    }
  }

  function updateParticles(dt) {
    for (const mark of marks) mark.life -= dt * 0.018;
    while (marks[0] && marks[0].life <= 0) marks.shift();

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    car.shake = Math.max(0, car.shake - dt);
  }

  function drawRect(cx, cy, w, h, angle, fill, stroke) {
    ctx.save();
    ctx.translate(cx - camera.x, cy - camera.y);
    ctx.rotate(angle);
    ctx.fillStyle = fill;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 3;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
  }

  function drawWorld() {
    ctx.fillStyle = grassColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const startX = Math.floor(camera.x / world.block) * world.block - world.block;
    const startY = Math.floor(camera.y / world.block) * world.block - world.block;
    const endX = camera.x + canvas.width + world.block;
    const endY = camera.y + canvas.height + world.block;

    for (let x = startX; x < endX; x += world.block) {
      ctx.fillStyle = roadColor;
      ctx.fillRect(x - camera.x, -camera.y, world.road, world.height);
      ctx.fillStyle = curbColor;
      ctx.fillRect(x + world.road - 6 - camera.x, -camera.y, 6, world.height);
      ctx.fillStyle = laneColor;
      for (let y = startY; y < endY; y += 72) {
        ctx.fillRect(x + world.road / 2 - 3 - camera.x, y - camera.y, 6, 34);
      }
    }

    for (let y = startY; y < endY; y += world.block) {
      ctx.fillStyle = roadColor;
      ctx.fillRect(-camera.x, y - camera.y, world.width, world.road);
      ctx.fillStyle = curbColor;
      ctx.fillRect(-camera.x, y + world.road - 6 - camera.y, world.width, 6);
      ctx.fillStyle = laneColor;
      for (let x = startX; x < endX; x += 72) {
        ctx.fillRect(x - camera.x, y + world.road / 2 - 3 - camera.y, 34, 6);
      }
    }

    drawBuildings(startX, startY, endX, endY);
  }

  function drawBuildings(startX, startY, endX, endY) {
    for (let x = startX; x < endX; x += world.block) {
      for (let y = startY; y < endY; y += world.block) {
        const bx = x + world.road + 24;
        const by = y + world.road + 24;
        const bw = world.block - world.road - 48;
        const bh = world.block - world.road - 48;
        const seed = Math.floor(x * 0.03 + y * 0.07);
        ctx.fillStyle = ["#45514a", "#5d5548", "#384f55", "#61514f"][Math.abs(seed) % 4];
        ctx.fillRect(bx - camera.x, by - camera.y, bw, bh);
        ctx.fillStyle = "rgba(255, 226, 140, 0.35)";
        for (let wx = bx + 18; wx < bx + bw - 18; wx += 34) {
          for (let wy = by + 18; wy < by + bh - 18; wy += 42) {
            if (rand(seed + wx + wy) > 0.58) ctx.fillRect(wx - camera.x, wy - camera.y, 12, 16);
          }
        }
      }
    }
  }

  function drawCheckpoints() {
    for (const point of checkpoints) {
      if (point.hit) continue;
      const radius = 34 + Math.sin(point.pulse * 5) * 5;
      ctx.save();
      ctx.translate(point.x - camera.x, point.y - camera.y);
      ctx.strokeStyle = "#f0d05c";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(240, 208, 92, 0.16)";
      ctx.beginPath();
      ctx.arc(0, 0, radius - 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawMarksAndParticles() {
    for (const mark of marks) {
      ctx.save();
      ctx.globalAlpha = clamp(mark.life, 0, 0.42);
      ctx.translate(mark.x - camera.x, mark.y - camera.y);
      ctx.rotate(mark.angle);
      ctx.fillStyle = "#0d0f0f";
      ctx.fillRect(-18, -2, 36, 4);
      ctx.restore();
    }

    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life * 2, 0, 1);
      ctx.fillStyle = "#f2c45e";
      ctx.fillRect(p.x - camera.x, p.y - camera.y, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  function drawCar(cx, cy, angle, body, player) {
    drawRect(cx, cy, 34, 58, angle, body, player ? "#f7edd4" : "#1a1d1c");
    drawRect(cx + Math.cos(angle) * 2, cy + Math.sin(angle) * 2, 22, 24, angle, "#263137", null);
    drawRect(cx + Math.cos(angle) * 21, cy + Math.sin(angle) * 21, 20, 8, angle, player ? "#f0d05c" : "#ebe0c0", null);
    drawRect(cx - Math.cos(angle) * 21, cy - Math.sin(angle) * 21, 22, 9, angle, "#772e2e", null);
  }

  function render() {
    const shakeX = (rand(performance.now()) - 0.5) * car.shake * 18;
    const shakeY = (rand(performance.now() + 9) - 0.5) * car.shake * 18;
    camera.x = clamp(lerp(camera.x, car.x - canvas.width / 2 + shakeX, 0.12), 0, world.width - canvas.width);
    camera.y = clamp(lerp(camera.y, car.y - canvas.height / 2 + shakeY, 0.12), 0, world.height - canvas.height);

    drawWorld();
    drawMarksAndParticles();
    drawCheckpoints();
    for (const npc of traffic) drawCar(npc.x, npc.y, npc.angle, npc.color, false);
    drawCar(car.x, car.y, car.angle, "#e64b3b", true);

    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function frame(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    updateCar(dt);
    updateTraffic(dt);
    updateCheckpoints(dt);
    updateParticles(dt);
    updateHud();
    render();
    requestAnimationFrame(frame);
  }

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
      event.preventDefault();
    }
    if (key === "r") resetGame();
    keys.add(key);
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
  });

  for (const button of document.querySelectorAll(".control")) {
    const controlKey = button.dataset.key;
    const release = () => {
      if (controlKey) keys.delete(controlKey);
      button.classList.remove("is-active");
    };

    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (button.dataset.reset !== undefined) {
        resetGame();
        button.classList.add("is-active");
        window.setTimeout(() => button.classList.remove("is-active"), 140);
        return;
      }
      keys.add(controlKey);
      button.classList.add("is-active");
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  }

  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(640, Math.floor(rect.width));
    canvas.height = Math.max(420, Math.floor(rect.height));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  window.addEventListener("resize", fitCanvas);
  fitCanvas();
  seedCheckpoints();
  seedTraffic();
  updateHud();
  requestAnimationFrame(frame);
})();
