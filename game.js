(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const speedEl = document.getElementById("speed");
  const scoreEl = document.getElementById("score");
  const targetEl = document.getElementById("target");
  const chainEl = document.getElementById("chain");
  const districtEl = document.getElementById("district");

  const keys = new Set();
  const world = { width: 3600, height: 2600 };
  const roadsX = [250, 620, 1000, 1430, 1890, 2380, 2940, 3350];
  const roadsY = [220, 520, 860, 1240, 1650, 2070, 2440];
  const road = 112;
  const routeGoal = 12;
  const camera = { x: 0, y: 0, zoom: 1 };
  const marks = [];
  const sparks = [];
  const route = [];
  const traffic = [];
  const props = [];
  const buildings = [];

  const districts = [
    { name: "Vice Canal", x: 0, y: 0, w: 1220, h: 860 },
    { name: "Market Run", x: 1220, y: 0, w: 1180, h: 1100 },
    { name: "Neon Row", x: 2400, y: 0, w: 1200, h: 1260 },
    { name: "Sunset Docks", x: 0, y: 860, w: 1260, h: 1740 },
    { name: "Little Havana", x: 1260, y: 1100, w: 1180, h: 1500 },
    { name: "Airport Cut", x: 2440, y: 1260, w: 1160, h: 1340 },
  ];

  const car = {
    x: 620,
    y: 520,
    prevX: 620,
    prevY: 520,
    angle: 0,
    velocity: 0,
    score: 0,
    style: 0,
    bestStyle: 0,
    shake: 0,
  };

  let currentTarget = 0;
  let lastTime = performance.now();

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function rand(seed) {
    const s = Math.sin(seed * 91.917) * 10000;
    return s - Math.floor(s);
  }

  function roadInfo(x, y) {
    let dx = Infinity;
    let dy = Infinity;
    for (const rx of roadsX) dx = Math.min(dx, Math.abs(x - rx));
    for (const ry of roadsY) dy = Math.min(dy, Math.abs(y - ry));
    return {
      onRoad: dx < road / 2 || dy < road / 2,
      onSidewalk: dx < road / 2 + 18 || dy < road / 2 + 18,
    };
  }

  function nearestRoadPoint(x, y) {
    let rx = roadsX[0];
    let ry = roadsY[0];
    for (const value of roadsX) if (Math.abs(value - x) < Math.abs(rx - x)) rx = value;
    for (const value of roadsY) if (Math.abs(value - y) < Math.abs(ry - y)) ry = value;
    return Math.abs(rx - x) < Math.abs(ry - y) ? { x: rx, y } : { x, y: ry };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function generateCity() {
    buildings.length = 0;
    props.length = 0;

    for (let xi = 0; xi < roadsX.length - 1; xi += 1) {
      for (let yi = 0; yi < roadsY.length - 1; yi += 1) {
        const left = roadsX[xi] + road / 2 + 28;
        const right = roadsX[xi + 1] - road / 2 - 28;
        const top = roadsY[yi] + road / 2 + 28;
        const bottom = roadsY[yi + 1] - road / 2 - 28;
        const w = right - left;
        const h = bottom - top;
        if (w < 90 || h < 90) continue;

        const seed = xi * 31 + yi * 73;
        const split = rand(seed) > 0.45 && w > 260 && h > 200;
        const color = ["#324348", "#4a413a", "#39483d", "#4a3741", "#3b3d55"][seed % 5];

        if (split) {
          buildings.push({ x: left, y: top, w: w * 0.46, h, color, seed });
          buildings.push({ x: right - w * 0.42, y: top + 28, w: w * 0.42, h: h - 56, color: "#2f3c3a", seed: seed + 9 });
        } else {
          buildings.push({ x: left, y: top, w, h, color, seed });
        }
      }
    }

    for (let i = 0; i < 90; i += 1) {
      const base = nearestRoadPoint(rand(i) * world.width, rand(i + 3) * world.height);
      props.push({
        x: clamp(base.x + (rand(i + 8) - 0.5) * 96, 40, world.width - 40),
        y: clamp(base.y + (rand(i + 10) - 0.5) * 96, 40, world.height - 40),
        kind: i % 3,
        seed: i,
      });
    }
  }

  function seedRoute() {
    route.length = 0;
    const points = [
      [1000, 520], [1430, 520], [1890, 860], [2380, 860],
      [2940, 1240], [2380, 1650], [1890, 1650], [1430, 2070],
      [1000, 2070], [620, 1650], [250, 1240], [620, 860],
    ];
    for (const [x, y] of points) route.push({ x, y, hit: false, pulse: rand(x + y) * 3 });
    targetEl.textContent = String(routeGoal);
  }

  function seedTraffic() {
    traffic.length = 0;
    for (let i = 0; i < 34; i += 1) {
      const horizontal = rand(i) > 0.48;
      const laneOffset = rand(i + 1) > 0.5 ? 22 : -22;
      traffic.push({
        x: horizontal ? rand(i + 2) * world.width : roadsX[i % roadsX.length] + laneOffset,
        y: horizontal ? roadsY[i % roadsY.length] + laneOffset : rand(i + 4) * world.height,
        horizontal,
        angle: horizontal ? 0 : Math.PI / 2,
        speed: 62 + rand(i + 6) * 58,
        color: ["#d0523f", "#e5c45e", "#54a89f", "#d8d7cd", "#6177c9", "#963b54"][i % 6],
      });
    }
  }

  function resetGame() {
    car.x = 620;
    car.y = 520;
    car.prevX = car.x;
    car.prevY = car.y;
    car.angle = 0;
    car.velocity = 0;
    car.score = 0;
    car.style = 0;
    car.bestStyle = 0;
    car.shake = 0;
    currentTarget = 0;
    marks.length = 0;
    sparks.length = 0;
    seedRoute();
  }

  function currentDistrict() {
    return districts.find((d) => car.x >= d.x && car.x < d.x + d.w && car.y >= d.y && car.y < d.y + d.h) || districts[0];
  }

  function updateHud() {
    speedEl.textContent = String(Math.round(Math.abs(car.velocity) * 0.7));
    scoreEl.textContent = String(car.score);
    chainEl.textContent = String(car.bestStyle);
    districtEl.textContent = currentDistrict().name;
  }

  function burst(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      sparks.push({
        x,
        y,
        vx: (rand(performance.now() + i) - 0.5) * 240,
        vy: (rand(performance.now() + i + 2) - 0.5) * 240,
        life: 0.45 + rand(i + x) * 0.25,
      });
    }
  }

  function collideBuildings() {
    const player = { x: car.x - 17, y: car.y - 25, w: 34, h: 50 };
    for (const b of buildings) {
      if (!rectsOverlap(player, b)) continue;
      car.x = car.prevX;
      car.y = car.prevY;
      car.velocity *= -0.22;
      car.shake = 0.35;
      burst(car.x, car.y, 12);
      return;
    }
  }

  function updateCar(dt) {
    const accel = keys.has("w") || keys.has("arrowup");
    const reverse = keys.has("s") || keys.has("arrowdown");
    const left = keys.has("a") || keys.has("arrowleft");
    const right = keys.has("d") || keys.has("arrowright");
    const handbrake = keys.has(" ");
    const steer = (right ? 1 : 0) - (left ? 1 : 0);
    const info = roadInfo(car.x, car.y);

    car.prevX = car.x;
    car.prevY = car.y;

    if (accel) car.velocity += 360 * dt;
    if (reverse) car.velocity -= 440 * dt;

    const maxSpeed = info.onRoad ? 470 : info.onSidewalk ? 320 : 180;
    const grip = info.onRoad ? 1 : info.onSidewalk ? 0.82 : 0.58;
    const drag = handbrake ? 0.966 : 0.988;
    car.velocity *= Math.pow(drag * grip, dt * 60);
    car.velocity = clamp(car.velocity, -185, maxSpeed);

    const steerBase = clamp(Math.abs(car.velocity) / 190, 0.2, 1.35);
    const direction = car.velocity < 0 ? -1 : 1;
    car.angle += steer * direction * steerBase * (handbrake ? 3.5 : 2.35) * dt;

    const slide = handbrake ? steer * Math.abs(car.velocity) * 0.22 : steer * Math.abs(car.velocity) * 0.045;
    car.x += Math.cos(car.angle) * car.velocity * dt + Math.cos(car.angle + Math.PI / 2) * slide * dt;
    car.y += Math.sin(car.angle) * car.velocity * dt + Math.sin(car.angle + Math.PI / 2) * slide * dt;
    car.x = clamp(car.x, 20, world.width - 20);
    car.y = clamp(car.y, 20, world.height - 20);

    collideBuildings();

    const drifting = handbrake && Math.abs(car.velocity) > 90 || Math.abs(steer) > 0.5 && Math.abs(car.velocity) > 260;
    if (drifting) {
      marks.push({ x: car.x - Math.cos(car.angle) * 24, y: car.y - Math.sin(car.angle) * 24, angle: car.angle, life: 1 });
      car.style += Math.round(Math.abs(car.velocity) * dt * 0.08);
      car.bestStyle = Math.max(car.bestStyle, car.style);
      if (marks.length > 260) marks.shift();
    } else {
      car.style = Math.max(0, car.style - Math.round(85 * dt));
    }
  }

  function updateTraffic(dt) {
    for (const npc of traffic) {
      if (npc.horizontal) {
        npc.x += npc.speed * dt;
        if (npc.x > world.width + 120) npc.x = -120;
      } else {
        npc.y += npc.speed * dt;
        if (npc.y > world.height + 120) npc.y = -120;
      }

      const distance = Math.hypot(npc.x - car.x, npc.y - car.y);
      if (distance < 43) {
        const push = Math.atan2(car.y - npc.y, car.x - npc.x);
        car.x += Math.cos(push) * 18;
        car.y += Math.sin(push) * 18;
        car.velocity *= -0.28;
        car.shake = 0.42;
        burst(car.x, car.y, 16);
      } else if (distance < 82 && Math.abs(car.velocity) > 260) {
        car.style += 1;
        car.bestStyle = Math.max(car.bestStyle, car.style);
      }
    }
  }

  function updateRoute(dt) {
    const target = route[currentTarget];
    if (!target) return;
    target.pulse += dt;
    if (Math.hypot(target.x - car.x, target.y - car.y) < 72) {
      target.hit = true;
      currentTarget = (currentTarget + 1) % route.length;
      car.score += 1;
      car.style += 150;
      car.bestStyle = Math.max(car.bestStyle, car.style);
      burst(target.x, target.y, 18);
    }
  }

  function updateEffects(dt) {
    for (const mark of marks) mark.life -= dt * 0.045;
    while (marks[0] && marks[0].life <= 0) marks.shift();
    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const p = sparks[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.life -= dt;
      if (p.life <= 0) sparks.splice(i, 1);
    }
    car.shake = Math.max(0, car.shake - dt);
  }

  function worldToScreen(x, y) {
    return {
      x: (x - camera.x) * camera.zoom + canvas.width / 2,
      y: (y - camera.y) * camera.zoom + canvas.height / 2,
    };
  }

  function drawWorldRect(x, y, w, h, fill) {
    const p = worldToScreen(x, y);
    ctx.fillStyle = fill;
    ctx.fillRect(p.x, p.y, w * camera.zoom, h * camera.zoom);
  }

  function drawBackground() {
    ctx.fillStyle = "#172018";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawWorldRect(-420, -420, world.width + 840, world.height + 840, "#182419");
    drawWorldRect(0, 0, 160, world.height, "#244447");
    drawWorldRect(160, 0, 36, world.height, "#86784b");

    for (const ry of roadsY) {
      drawWorldRect(0, ry - road / 2 - 18, world.width, road + 36, "#8a7c4d");
      drawWorldRect(0, ry - road / 2, world.width, road, "#242827");
      for (let x = 30; x < world.width; x += 118) drawWorldRect(x, ry - 3, 54, 6, "rgba(230, 218, 143, 0.72)");
      for (let x = 0; x < world.width; x += 260) {
        drawWorldRect(x + 32, ry - road / 2 + 12, 58, 9, "rgba(240, 240, 225, 0.62)");
        drawWorldRect(x + 32, ry + road / 2 - 21, 58, 9, "rgba(240, 240, 225, 0.62)");
      }
    }

    for (const rx of roadsX) {
      drawWorldRect(rx - road / 2 - 18, 0, road + 36, world.height, "#8a7c4d");
      drawWorldRect(rx - road / 2, 0, road, world.height, "#242827");
      for (let y = 25; y < world.height; y += 118) drawWorldRect(rx - 3, y, 6, 54, "rgba(230, 218, 143, 0.72)");
      for (let y = 0; y < world.height; y += 260) {
        drawWorldRect(rx - road / 2 + 12, y + 32, 9, 58, "rgba(240, 240, 225, 0.62)");
        drawWorldRect(rx + road / 2 - 21, y + 32, 9, 58, "rgba(240, 240, 225, 0.62)");
      }
    }

    for (const b of buildings) drawBuilding(b);
    for (const prop of props) drawProp(prop);
  }

  function drawBuilding(b) {
    drawWorldRect(b.x + 8, b.y + 8, b.w, b.h, "rgba(0, 0, 0, 0.28)");
    drawWorldRect(b.x, b.y, b.w, b.h, b.color);
    drawWorldRect(b.x + 10, b.y + 10, b.w - 20, b.h - 20, "rgba(255, 255, 255, 0.04)");
    for (let x = b.x + 24; x < b.x + b.w - 18; x += 42) {
      for (let y = b.y + 24; y < b.y + b.h - 18; y += 48) {
        if (rand(b.seed + x * 0.2 + y) > 0.5) {
          drawWorldRect(x, y, 13, 18, rand(x + y) > 0.72 ? "#eec55c" : "rgba(223, 204, 132, 0.35)");
        }
      }
    }
    if (b.w > 180 && rand(b.seed) > 0.62) {
      const sign = worldToScreen(b.x + b.w / 2, b.y - 12);
      ctx.save();
      ctx.translate(sign.x, sign.y);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.fillStyle = "#d94842";
      ctx.fillRect(-44, -9, 88, 18);
      ctx.fillStyle = "#f6e8b1";
      ctx.fillRect(-34, -2, 68, 4);
      ctx.restore();
    }
  }

  function drawProp(prop) {
    const p = worldToScreen(prop.x, prop.y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(camera.zoom, camera.zoom);
    if (prop.kind === 0) {
      ctx.fillStyle = "#0d1010";
      ctx.fillRect(-4, -18, 8, 18);
      ctx.fillStyle = "#f0c85f";
      ctx.fillRect(-7, -24, 14, 8);
    } else if (prop.kind === 1) {
      ctx.fillStyle = "#2d5137";
      ctx.fillRect(-10, -10, 20, 20);
      ctx.fillStyle = "#4d7b4d";
      ctx.fillRect(-6, -16, 12, 32);
    } else {
      ctx.fillStyle = "#202425";
      ctx.fillRect(-16, -8, 32, 16);
      ctx.fillStyle = "#d6cfaa";
      ctx.fillRect(-11, -4, 22, 4);
    }
    ctx.restore();
  }

  function drawRotatedRect(x, y, w, h, angle, fill, stroke) {
    const p = worldToScreen(x, y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.fillStyle = fill;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 3;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
  }

  function drawCar(x, y, angle, color, player) {
    drawRotatedRect(x + 6, y + 8, 38, 60, angle, "rgba(0, 0, 0, 0.3)", null);
    drawRotatedRect(x, y, 35, 61, angle, color, player ? "#f5ead0" : "#101414");
    drawRotatedRect(x + Math.cos(angle) * 6, y + Math.sin(angle) * 6, 23, 25, angle, "#172427", null);
    drawRotatedRect(x + Math.cos(angle) * 26, y + Math.sin(angle) * 26, 21, 8, angle, player ? "#f0ca5c" : "#ece4c3", null);
    drawRotatedRect(x - Math.cos(angle) * 25, y - Math.sin(angle) * 25, 24, 9, angle, "#5f2027", null);
    if (player && Math.abs(car.velocity) > 180) {
      drawRotatedRect(x - Math.cos(angle) * 38, y - Math.sin(angle) * 38, 9, 22, angle, "rgba(242, 191, 72, 0.65)", null);
    }
  }

  function drawEffects() {
    for (const mark of marks) {
      ctx.globalAlpha = clamp(mark.life * 0.4, 0, 0.38);
      drawRotatedRect(mark.x, mark.y, 46, 5, mark.angle, "#080b0b", null);
    }
    ctx.globalAlpha = 1;

    for (const p of sparks) {
      const s = worldToScreen(p.x, p.y);
      ctx.globalAlpha = clamp(p.life * 2, 0, 1);
      ctx.fillStyle = "#f0c85f";
      ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  function drawRoute() {
    const target = route[currentTarget];
    if (!target) return;
    const p = worldToScreen(target.x, target.y);
    const radius = (42 + Math.sin(target.pulse * 5) * 6) * camera.zoom;
    ctx.strokeStyle = "#f0ca5c";
    ctx.lineWidth = 7 * camera.zoom;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    const angle = Math.atan2(target.y - car.y, target.x - car.x);
    ctx.save();
    ctx.translate(canvas.width / 2, 94);
    ctx.rotate(angle);
    ctx.fillStyle = "#f0ca5c";
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-13, -10);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-13, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawMinimap() {
    const w = 170;
    const h = 126;
    const x = canvas.width - w - 18;
    const y = canvas.height - h - 18;
    const sx = w / world.width;
    const sy = h / world.height;
    ctx.fillStyle = "rgba(8, 12, 12, 0.72)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "rgba(228, 212, 134, 0.46)";
    for (const rx of roadsX) ctx.fillRect(x + rx * sx - 1, y, 2, h);
    for (const ry of roadsY) ctx.fillRect(x, y + ry * sy - 1, w, 2);
    const target = route[currentTarget];
    if (target) {
      ctx.fillStyle = "#f0ca5c";
      ctx.fillRect(x + target.x * sx - 3, y + target.y * sy - 3, 6, 6);
    }
    ctx.fillStyle = "#e24d3e";
    ctx.beginPath();
    ctx.arc(x + car.x * sx, y + car.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function render() {
    const speedLookahead = clamp(Math.abs(car.velocity) * 0.34, 0, 120);
    const shakeX = (rand(performance.now()) - 0.5) * car.shake * 18;
    const shakeY = (rand(performance.now() + 4) - 0.5) * car.shake * 18;
    camera.zoom = canvas.width < 760 ? 0.72 : 0.86;
    camera.x = lerp(camera.x, car.x + Math.cos(car.angle) * speedLookahead + shakeX, 0.11);
    camera.y = lerp(camera.y, car.y + Math.sin(car.angle) * speedLookahead + shakeY, 0.11);

    drawBackground();
    drawEffects();
    drawRoute();
    for (const npc of traffic) drawCar(npc.x, npc.y, npc.angle, npc.color, false);
    drawCar(car.x, car.y, car.angle, "#d94a3b", true);

    ctx.fillStyle = "rgba(4, 8, 9, 0.2)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawMinimap();
  }

  function frame(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    updateCar(dt);
    updateTraffic(dt);
    updateRoute(dt);
    updateEffects(dt);
    updateHud();
    render();
    requestAnimationFrame(frame);
  }

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
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
  generateCity();
  seedRoute();
  seedTraffic();
  updateHud();
  requestAnimationFrame(frame);
})();
