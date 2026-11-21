const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const speedEl = document.querySelector("#speed");
const timeEl = document.querySelector("#time");
const bestEl = document.querySelector("#best");
const levelEl = document.querySelector("#level");
const livesEl = document.querySelector("#lives");
const startOverlay = document.querySelector("#startOverlay");
const finishOverlay = document.querySelector("#finishOverlay");
const pauseOverlay = document.querySelector("#pauseOverlay");
const settingsOverlay = document.querySelector("#settingsOverlay");
const finishTimeEl = document.querySelector("#finishTime");
const finishLabel = document.querySelector("#finishLabel");
const finishHint = document.querySelector("#finishHint");
const nextLevelButton = document.querySelector("#nextLevel");
const startTitle = document.querySelector("#startTitle");
const levelHint = document.querySelector("#levelHint");
const controllerStatus = document.querySelector("#controllerStatus");
const pauseButton = document.querySelector("#pause");
const steeringSensitivity = document.querySelector("#steeringSensitivity");
const sensitivityValue = document.querySelector("#sensitivityValue");

const keys = {};
const touchInput = { left: false, right: false, accelerate: false, brake: false };
let controller = null;
let previousButtons = [];
let lastControllerStatus = "";
let running = false;
let paused = false;
let returnToPauseAfterSettings = false;
let elapsed = 0;
let best = Number(localStorage.getItem("nightRacerBest")) || 0;
const savedLevel = Number.parseInt(localStorage.getItem("nightRacerLevel") || "1", 10);
let currentLevel = Number.isInteger(savedLevel) ? Math.max(1, Math.min(100, savedLevel)) : 1;
let roadOffset = 0;
let finishProgressMs = 0;
let obstacleTimer = 0;
let opponents = [];
let obstacles = [];
const totalLives = 3;
let lives = totalLives;
const storedSensitivity = Number(localStorage.getItem("nightRacerSteeringSensitivity"));
let steeringMultiplier = Number.isFinite(storedSensitivity)
  ? Math.max(0.5, Math.min(2, storedSensitivity))
  : 1;

const car = { x: 450, y: 465, width: 46, height: 82, angle: 0, speed: 0, lateralVelocity: 0 };
const maxSpeed = 1.25;
const maxSpeedKmh = 180;
const raceDuration = 60000;

if (best) bestEl.textContent = formatTime(best);
steeringSensitivity.value = steeringMultiplier.toFixed(1);
updateSensitivityLabel();
updateLevelDisplay();

function formatTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

function resetRace() {
  car.x = 450;
  car.y = 465;
  car.angle = 0;
  car.speed = 0;
  car.lateralVelocity = 0;
  const trafficCount = Math.min(5, 1 + Math.floor((currentLevel - 1) / 20));
  const baseSpeed = 2 + (currentLevel - 1) * 0.025;
  opponents = Array.from({ length: trafficCount }, (_, index) => ({
    x: [220, 380, 540, 700][Math.floor(Math.random() * 4)],
    y: 80 - index * 190,
    width: 42,
    height: 74,
    speed: baseSpeed + index * 0.18,
    type: index === 0 || Math.random() < 0.4 ? "motorcycle" : "car",
    color: ["#3895e8", "#f4a62a", "#a46deb", "#44c69a"][index % 4],
  }));
  obstacles = [{
    x: [160, 300, 450, 600, 750][Math.floor(Math.random() * 5)],
    y: 130,
    type: ["cone", "barrel", "oil"][Math.floor(Math.random() * 3)],
    speed: 4.2 + currentLevel * 0.02,
  }];
  lives = totalLives;
  updateLivesDisplay();
  obstacleTimer = 0;
  roadOffset = 0;
  finishProgressMs = 0;
  elapsed = 0;
  running = true;
  paused = false;
  elapsed = 0;
  pauseOverlay.classList.add("hidden");
  settingsOverlay.classList.add("hidden");
  pauseButton.disabled = false;
  pauseButton.textContent = "Pause";
  startOverlay.classList.add("hidden");
  finishOverlay.classList.add("hidden");
}

function updateSensitivityLabel() {
  sensitivityValue.textContent = `${steeringMultiplier.toFixed(1).replace(".", ",")}×`;
}

function pauseRace() {
  if (!running || paused) return;
  paused = true;
  pauseOverlay.classList.remove("hidden");
  pauseButton.textContent = "Reprendre";
}

function resumeRace() {
  if (!running || !paused) return;
  paused = false;
  pauseOverlay.classList.add("hidden");
  settingsOverlay.classList.add("hidden");
  pauseButton.textContent = "Pause";
}

function openSettings() {
  returnToPauseAfterSettings = running;
  if (running) {
    paused = true;
    pauseOverlay.classList.add("hidden");
    pauseButton.textContent = "Reprendre";
  }
  settingsOverlay.classList.remove("hidden");
}

function closeSettings() {
  settingsOverlay.classList.add("hidden");
  if (returnToPauseAfterSettings && running) {
    pauseOverlay.classList.remove("hidden");
  }
}

function updateLevelDisplay() {
  levelEl.innerHTML = `${currentLevel} <small>/ 100</small>`;
  startTitle.textContent = `Niveau ${currentLevel}`;
  const trafficCount = Math.min(5, 1 + Math.floor((currentLevel - 1) / 20));
  levelHint.textContent = `Évitez les voitures, les motos et les obstacles. Tenez 1 minute pour finir.`;
}

function updateLivesDisplay() {
  livesEl.innerHTML = `${lives} <small>/ ${totalLives}</small>`;
}

function loseLife() {
  if (lives === 0) return;
  lives = Math.max(0, lives - 1);
  updateLivesDisplay();
  if (lives === 0) {
    endRaceWithoutLives();
    return;
  }
}

function getGamepad() {
  if (!navigator.getGamepads) return null;
  return Array.from(navigator.getGamepads()).find((pad) => pad && pad.connected) || null;
}

function buttonPressed(pad, index) {
  return Boolean(pad?.buttons[index]?.pressed);
}

function readController() {
  controller = getGamepad();
  if (!controller) {
    if (lastControllerStatus !== "missing") {
      controllerStatus.textContent = "Manette PS5 : non détectée";
      lastControllerStatus = "missing";
    }
    previousButtons = [];
    return null;
  }

  const statusName = controller.id || "Manette PS5";
  if (lastControllerStatus !== statusName) {
    controllerStatus.textContent = `Manette : ${statusName.includes("054C") ? "PS5 DualSense" : "connectée"}`;
    lastControllerStatus = statusName;
  }
  return controller;
}

function justPressed(pad, index) {
  const pressed = buttonPressed(pad, index);
  const isNew = pressed && !previousButtons[index];
  return isNew;
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawRoad() {
  const ground = ctx.createLinearGradient(0, 0, 0, canvas.height);
  ground.addColorStop(0, "#172b31");
  ground.addColorStop(1, "#243c34");
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawRoadside();

  ctx.fillStyle = "#8b9292";
  ctx.fillRect(70, 0, 760, canvas.height);
  ctx.fillStyle = "#30343a";
  ctx.fillRect(86, 0, 728, canvas.height);

  const asphalt = ctx.createLinearGradient(90, 0, 810, 0);
  asphalt.addColorStop(0, "#282e35");
  asphalt.addColorStop(0.5, "#373c42");
  asphalt.addColorStop(1, "#282e35");
  ctx.fillStyle = asphalt;
  ctx.fillRect(90, 0, 720, canvas.height);

  for (let y = -30 + (roadOffset % 52); y < canvas.height; y += 52) {
    ctx.fillStyle = "rgba(224, 232, 238, .035)";
    ctx.fillRect(96, y, 708, 1);
  }

  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.fillRect(103, 0, 3, canvas.height);
  ctx.fillRect(794, 0, 3, canvas.height);

  ctx.strokeStyle = "rgba(239, 241, 230, .7)";
  ctx.lineWidth = 3;
  ctx.setLineDash([30, 30]);
  ctx.lineDashOffset = -roadOffset;
  for (const laneX of [330, 570]) {
    ctx.beginPath();
    ctx.moveTo(laneX, 0);
    ctx.lineTo(laneX, canvas.height);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  if (running || elapsed >= raceDuration) {
    const progress = Math.min(finishProgressMs / raceDuration, 1);
    drawFinishLine(-70 + progress * (car.y + 70));
  }
}

function drawRoadside() {
  const scroll = roadOffset % 210;
  for (let index = -1; index < 5; index += 1) {
    const y = index * 210 + scroll;
    const size = 0.65 + Math.max(0, y) / 1400;
    for (const side of [-1, 1]) {
      const x = side < 0 ? 18 : 882;
      const buildingX = side < 0 ? 0 : 830;
      ctx.fillStyle = index % 2 === 0 ? "#111b24" : "#18222b";
      ctx.fillRect(buildingX, y - 120 * size, 70, 120 * size);

      ctx.fillStyle = "rgba(248, 190, 104, .28)";
      for (let windowY = y - 105 * size; windowY < y - 18 * size; windowY += 24 * size) {
        ctx.fillRect(buildingX + 12, windowY, 8 * size, 10 * size);
        ctx.fillRect(buildingX + 38, windowY, 8 * size, 10 * size);
      }

      ctx.fillStyle = "#41484a";
      ctx.fillRect(x - 2, y - 40 * size, 5 * size, 40 * size);
      ctx.strokeStyle = "#555d60";
      ctx.lineWidth = 3 * size;
      ctx.beginPath();
      ctx.moveTo(x, y - 38 * size);
      ctx.lineTo(x + (side < 0 ? 18 : -18) * size, y - 42 * size);
      ctx.stroke();
      const lampX = x + (side < 0 ? 18 : -18) * size;
      const glow = ctx.createRadialGradient(lampX, y - 42 * size, 1, lampX, y - 42 * size, 28 * size);
      glow.addColorStop(0, "rgba(255, 222, 154, .7)");
      glow.addColorStop(1, "rgba(255, 222, 154, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(lampX, y - 42 * size, 28 * size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawFinishLine(y) {
  const tileSize = 24;
  for (let row = 0; row < 2; row += 1) {
    for (let x = 90, column = 0; x < 810; x += tileSize, column += 1) {
      ctx.fillStyle = (row + column) % 2 === 0 ? "#f5f7fa" : "#121820";
      ctx.fillRect(x, y + row * 12, tileSize, 12);
    }
  }
  ctx.fillStyle = "#f5f7fa";
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ARRIVÉE", 450, y - 7);
}

function drawHeadlights() {
  if (!running || car.speed < 0.12) return;
  ctx.save();
  ctx.translate(car.x, car.y - 36);
  ctx.rotate(car.angle);
  const beam = ctx.createLinearGradient(0, -330, 0, 0);
  beam.addColorStop(0, "rgba(255, 242, 194, 0)");
  beam.addColorStop(0.7, "rgba(255, 242, 194, .025)");
  beam.addColorStop(1, "rgba(255, 242, 194, .16)");
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(-145, -330);
  ctx.lineTo(145, -330);
  ctx.lineTo(40, 0);
  ctx.lineTo(-40, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCar(vehicle, color, isPlayer) {
  ctx.save();
  ctx.translate(vehicle.x, vehicle.y);
  ctx.rotate(isPlayer ? vehicle.angle : 0);

  ctx.fillStyle = "rgba(0, 0, 0, .35)";
  ctx.beginPath();
  ctx.ellipse(3, 5, vehicle.width * 0.72, vehicle.height * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#080b0f";
  ctx.fillRect(-vehicle.width / 2 - 5, -22, 8, 35);
  ctx.fillRect(vehicle.width / 2 - 3, -22, 8, 35);
  ctx.fillRect(-vehicle.width / 2 - 5, 18, 8, 35);
  ctx.fillRect(vehicle.width / 2 - 3, 18, 8, 35);

  const bodyPaint = ctx.createLinearGradient(-vehicle.width / 2, 0, vehicle.width / 2, 0);
  bodyPaint.addColorStop(0, "#20252b");
  bodyPaint.addColorStop(0.24, color);
  bodyPaint.addColorStop(0.72, color);
  bodyPaint.addColorStop(1, "#232931");
  ctx.fillStyle = bodyPaint;
  roundedRect(-vehicle.width / 2, -vehicle.height / 2, vehicle.width, vehicle.height, 12);
  ctx.fill();

  const glass = ctx.createLinearGradient(0, -25, 0, 4);
  glass.addColorStop(0, "#b8d5df");
  glass.addColorStop(0.55, "#476575");
  glass.addColorStop(1, "#243944");
  ctx.fillStyle = glass;
  roundedRect(-15, -24, 30, 24, 6);
  ctx.fill();
  ctx.fillStyle = "#263846";
  roundedRect(-15, 8, 30, 19, 5);
  ctx.fill();

  ctx.fillStyle = "#fff5ca";
  ctx.fillRect(-16, -40, 8, 5);
  ctx.fillRect(8, -40, 8, 5);
  ctx.fillStyle = "#ff3449";
  ctx.fillRect(-16, 36, 8, 5);
  ctx.fillRect(8, 36, 8, 5);
  ctx.fillStyle = "rgba(255,255,255,.22)";
  ctx.fillRect(-vehicle.width / 2 + 5, -32, 2, 18);
  ctx.restore();
}

function drawMotorcycle(vehicle) {
  ctx.save();
  ctx.translate(vehicle.x, vehicle.y);

  ctx.shadowColor = "rgba(255, 190, 60, .4)";
  ctx.shadowBlur = 12;

  ctx.fillStyle = "#080b0f";
  ctx.beginPath();
  ctx.ellipse(0, -23, 6, 11, 0, 0, Math.PI * 2);
  ctx.ellipse(0, 23, 6, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#aebac5";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(0, 20);
  ctx.moveTo(-10, -13);
  ctx.lineTo(10, -13);
  ctx.stroke();

  ctx.fillStyle = vehicle.color;
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(9, -5);
  ctx.lineTo(7, 11);
  ctx.lineTo(0, 17);
  ctx.lineTo(-7, 11);
  ctx.lineTo(-9, -5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#263846";
  roundedRect(-5, -12, 10, 13, 4);
  ctx.fill();
  ctx.fillStyle = "#ffe9a8";
  ctx.fillRect(-3, -19, 6, 4);
  ctx.fillStyle = "#dce5ed";
  ctx.beginPath();
  ctx.arc(0, -3, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#18212b";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-2, 1);
  ctx.lineTo(-8, 10);
  ctx.moveTo(2, 1);
  ctx.lineTo(8, 10);
  ctx.stroke();

  ctx.strokeStyle = "#e7b28a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-4, -2);
  ctx.lineTo(-10, -13);
  ctx.moveTo(4, -2);
  ctx.lineTo(10, -13);
  ctx.stroke();

  ctx.fillStyle = "#f4a62a";
  roundedRect(-5, -8, 10, 14, 4);
  ctx.fill();
  ctx.fillStyle = "#f0c5a1";
  ctx.beginPath();
  ctx.arc(0, -12, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ef294f";
  ctx.beginPath();
  ctx.arc(0, -13, 5, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-5, -13, 10, 2);

  ctx.restore();
}

function drawOpponent(opponent) {
  if (opponent.type === "motorcycle") {
    drawMotorcycle(opponent);
  } else {
    drawCar(opponent, opponent.color, false);
  }
}

function drawObstacle(obstacle) {
  ctx.save();
  ctx.translate(obstacle.x, obstacle.y);
  if (obstacle.type === "oil") {
    ctx.fillStyle = "rgba(8, 12, 17, .9)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 23, 12, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(154, 185, 202, .4)";
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (obstacle.type === "barrel") {
    ctx.fillStyle = "#f4a62a";
    roundedRect(-13, -16, 26, 32, 5);
    ctx.fill();
    ctx.fillStyle = "#273342";
    ctx.fillRect(-13, -7, 26, 5);
    ctx.fillRect(-13, 7, 26, 5);
  } else {
    ctx.fillStyle = "#ff7438";
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(15, 14);
    ctx.lineTo(-15, 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffe1bd";
    ctx.fillRect(-10, 4, 20, 4);
    ctx.fillStyle = "#303844";
    ctx.fillRect(-18, 13, 36, 5);
  }
  ctx.restore();
}

function update(delta) {
  const pad = readController();

  if (pad && (justPressed(pad, 0) || justPressed(pad, 9))) {
    if (paused) resumeRace();
    else if (!running) resetRace();
  }

  if (pad) {
    const startPressed = pad.buttons.map((button) => button.pressed);
    previousButtons = startPressed;
  }

  if (!running || paused) return;

  let accelerationInput = keys.ArrowUp || touchInput.accelerate ? 1 : 0;
  let brakingInput = keys.ArrowDown || touchInput.brake ? 1 : 0;
  let steeringInput = keys.ArrowLeft || touchInput.left ? -1 : keys.ArrowRight || touchInput.right ? 1 : 0;

  if (pad) {
    const leftStick = Math.abs(pad.axes[0] || 0) > 0.14 ? pad.axes[0] : 0;
    const dpadLeft = buttonPressed(pad, 14) ? -1 : 0;
    const dpadRight = buttonPressed(pad, 15) ? 1 : 0;
    steeringInput = leftStick || dpadLeft || dpadRight || steeringInput;

    accelerationInput = Math.max(
      accelerationInput,
      pad.buttons[7]?.value || 0,
      buttonPressed(pad, 0) ? 1 : 0,
      buttonPressed(pad, 12) ? 1 : 0
    );
    brakingInput = Math.max(
      brakingInput,
      pad.buttons[6]?.value || 0,
      buttonPressed(pad, 13) ? 1 : 0,
      buttonPressed(pad, 2) ? 1 : 0
    );
  }

  const acceleration = accelerationInput * 0.00018 * delta;
  const braking = brakingInput * 0.0003 * delta;
  if (accelerationInput === 0 && brakingInput === 0) {
    car.speed = 0;
  } else {
    car.speed = Math.min(maxSpeed, Math.max(0, car.speed + acceleration - braking));
  }

  if (car.speed === 0) {
    car.lateralVelocity = 0;
    car.angle = 0;
  } else {
    car.lateralVelocity += steeringInput * 0.00012 * steeringMultiplier * delta * (car.speed / maxSpeed);
    car.lateralVelocity *= Math.exp(-delta / 650);
    car.angle = Math.max(-0.42, Math.min(0.42, car.lateralVelocity * 4));
    car.x += car.lateralVelocity * delta;
  }

  car.x = Math.max(115, Math.min(785, car.x));
  if (car.x < 145 || car.x > 755) {
    car.speed *= Math.exp(-delta * 0.0007);
  }

  roadOffset += car.speed * delta * 0.25;
  const movementFactor = car.speed / maxSpeed;
  finishProgressMs += delta * movementFactor;
  for (const opponent of opponents) {
    opponent.y += (opponent.speed + car.speed * 0.018) * movementFactor * (delta / 16.67);
    if (opponent.y > 620) {
      opponent.y = -90;
      opponent.x = [220, 380, 540, 700][Math.floor(Math.random() * 4)];
      opponent.type = Math.random() < 0.4 ? "motorcycle" : "car";
    }
  }

  obstacleTimer += delta * movementFactor;
  const obstacleInterval = Math.max(650, 1700 - (currentLevel - 1) * 10);
  if (obstacleTimer >= obstacleInterval) {
    obstacleTimer = 0;
    obstacles.push({
      x: [160, 300, 450, 600, 750][Math.floor(Math.random() * 5)],
      y: -30,
      type: ["cone", "barrel", "oil"][Math.floor(Math.random() * 3)],
      speed: 4.2 + currentLevel * 0.02,
    });
  }

  obstacles = obstacles.filter((obstacle) => {
    obstacle.y += obstacle.speed * movementFactor * (delta / 16.67);
    const hit = Math.abs(car.x - obstacle.x) < (obstacle.type === "oil" ? 35 : 32)
      && Math.abs(car.y - obstacle.y) < (obstacle.type === "oil" ? 42 : 48);
    if (hit) {
      car.speed *= obstacle.type === "oil" ? 0.55 : 0.68;
      loseLife();
      return false;
    }
    return obstacle.y < 610;
  });

  if (!running) return;

  elapsed += delta;
  speedEl.innerHTML = `${Math.round((car.speed / maxSpeed) * maxSpeedKmh)} <small>km/h</small>`;
  timeEl.textContent = formatTime(elapsed);

  if (finishProgressMs >= raceDuration) {
    finishRace();
    return;
  }

  for (const opponent of opponents) {
    const dx = Math.abs(car.x - opponent.x);
    const dy = Math.abs(car.y - opponent.y);
    const hitWidth = opponent.type === "motorcycle" ? 30 : 42;
    const hitHeight = opponent.type === "motorcycle" ? 54 : 70;
    if (dx < hitWidth && dy < hitHeight) {
      car.speed *= 0.72;
      car.x += car.x < opponent.x ? -8 : 8;
      opponent.y = -100;
      opponent.x = [220, 380, 540, 700][Math.floor(Math.random() * 4)];
      loseLife();
      break;
    }
  }
}

function endRaceWithoutLives() {
  running = false;
  paused = false;
  pauseButton.disabled = true;
  pauseOverlay.classList.add("hidden");
  finishLabel.textContent = "Course terminée";
  finishTimeEl.textContent = "0 vie restante";
  finishHint.textContent = `Vous avez perdu vos 3 vies au niveau ${currentLevel}. Réessayez pour le terminer.`;
  nextLevelButton.textContent = `Réessayer le niveau ${currentLevel}`;
  finishOverlay.classList.remove("hidden");
}

function finishRace() {
  running = false;
  paused = false;
  pauseButton.disabled = true;
  pauseOverlay.classList.add("hidden");
  finishTimeEl.textContent = formatTime(elapsed);
  if (!best || elapsed < best) {
    best = elapsed;
    localStorage.setItem("nightRacerBest", String(best));
    bestEl.textContent = formatTime(best);
  }
  const completedLevel = currentLevel;
  if (currentLevel < 100) {
    currentLevel += 1;
    localStorage.setItem("nightRacerLevel", String(currentLevel));
    finishLabel.textContent = `Niveau ${completedLevel} terminé`;
    finishHint.textContent = `Niveau ${currentLevel} débloqué ! Les voitures vont plus vite et les obstacles sont plus nombreux.`;
    nextLevelButton.textContent = `Passer au niveau ${currentLevel}`;
  } else {
    finishLabel.textContent = "Course terminée !";
    finishHint.textContent = "Bravo, vous avez terminé les 100 niveaux !";
    nextLevelButton.textContent = "Rejouer le niveau 100";
  }
  updateLevelDisplay();
  finishOverlay.classList.remove("hidden");
}

let previous = performance.now();
function loop(now) {
  const delta = Math.min(now - previous, 32);
  previous = now;
  update(delta);
  drawRoad();
  drawHeadlights();
  for (const opponent of opponents) drawOpponent(opponent);
  for (const obstacle of obstacles) drawObstacle(obstacle);
  drawCar(car, "#ef294f", true);
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
  keys[event.key] = true;
});
window.addEventListener("keyup", (event) => { keys[event.key] = false; });
document.querySelector("#start").addEventListener("click", resetRace);
nextLevelButton.addEventListener("click", resetRace);
document.querySelector("#restart").addEventListener("click", resetRace);
pauseButton.addEventListener("click", () => {
  if (paused) resumeRace();
  else pauseRace();
});
document.querySelector("#resume").addEventListener("click", resumeRace);
document.querySelector("#openSettings").addEventListener("click", openSettings);
document.querySelector("#pauseSettings").addEventListener("click", openSettings);
document.querySelector("#closeSettings").addEventListener("click", closeSettings);
steeringSensitivity.addEventListener("input", () => {
  steeringMultiplier = Number(steeringSensitivity.value);
  localStorage.setItem("nightRacerSteeringSensitivity", steeringMultiplier.toFixed(1));
  updateSensitivityLabel();
});

for (const button of document.querySelectorAll("#touchControls [data-control]")) {
  const control = button.dataset.control;
  const release = (event) => {
    event.preventDefault();
    touchInput[control] = false;
    button.classList.remove("pressed");
  };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    touchInput[control] = true;
    button.classList.add("pressed");
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}

drawRoad();
drawHeadlights();
for (const opponent of opponents) drawOpponent(opponent);
drawCar(car, "#ef294f", true);
requestAnimationFrame(loop);
