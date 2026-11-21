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
const soundEnabledInput = document.querySelector("#soundEnabled");

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
let audioContext = null;
let engineOscillator = null;
let engineGain = null;
let musicInterval = null;
let musicNoteIndex = 0;
const totalLives = 3;
let lives = totalLives;
const storedSensitivity = Number(localStorage.getItem("nightRacerSteeringSensitivity"));
let steeringMultiplier = Number.isFinite(storedSensitivity)
  ? Math.max(0.5, Math.min(2, storedSensitivity))
  : 1;
let soundEnabled = localStorage.getItem("nightRacerSoundEnabled") !== "false";

const car = { x: 450, y: 465, width: 46, height: 82, angle: 0, speed: 0, lateralVelocity: 0 };
const maxSpeed = 1.25;
const maxSpeedKmh = 180;
const raceDuration = 60000;

if (best) bestEl.textContent = formatTime(best);
steeringSensitivity.value = steeringMultiplier.toFixed(1);
soundEnabledInput.checked = soundEnabled;
updateSensitivityLabel();
updateLevelDisplay();

function getTrafficLaneX() {
  const lanes = [210, 450, 690];
  return lanes[Math.floor(Math.random() * lanes.length)] + (Math.random() * 28 - 14);
}

function createOpponent(index, baseSpeed) {
  const type = index === 0 || Math.random() < 0.42 ? "motorcycle" : "car";
  const style = ["sedan", "sport", "van", "taxi"][Math.floor(Math.random() * 4)];
  const dimensions = type === "motorcycle"
    ? { width: 30, height: 62 }
    : style === "van"
      ? { width: 52, height: 88 }
      : style === "sport"
        ? { width: 39, height: 70 }
        : { width: 44, height: 78 };
  const colors = type === "motorcycle"
    ? ["#3895e8", "#f4a62a", "#a46deb", "#44c69a", "#e84b5f"]
    : ["#3895e8", "#f4a62a", "#a46deb", "#44c69a", "#e84b5f", "#e7e8eb"];
  return {
    x: getTrafficLaneX(),
    y: 70 - index * 155,
    ...dimensions,
    speed: baseSpeed + index * 0.18,
    type,
    style,
    color: colors[Math.floor(Math.random() * colors.length)],
  };
}

function respawnOpponent(opponent, y = -100) {
  const index = Math.max(0, opponents.indexOf(opponent));
  const baseSpeed = 2 + (currentLevel - 1) * 0.025;
  Object.assign(opponent, createOpponent(index, baseSpeed), { y });
}

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
  const trafficCount = Math.min(7, 2 + Math.floor((currentLevel - 1) / 15));
  const baseSpeed = 2 + (currentLevel - 1) * 0.025;
  opponents = Array.from({ length: trafficCount }, (_, index) => createOpponent(index, baseSpeed));
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
  syncAudioState();
}

function updateSensitivityLabel() {
  sensitivityValue.textContent = `${steeringMultiplier.toFixed(1).replace(".", ",")}×`;
}

function pauseRace() {
  if (!running || paused) return;
  paused = true;
  pauseOverlay.classList.remove("hidden");
  pauseButton.textContent = "Reprendre";
  syncAudioState();
}

function resumeRace() {
  if (!running || !paused) return;
  paused = false;
  pauseOverlay.classList.add("hidden");
  settingsOverlay.classList.add("hidden");
  pauseButton.textContent = "Pause";
  syncAudioState();
}

function openSettings() {
  returnToPauseAfterSettings = running;
  if (running) {
    paused = true;
    pauseOverlay.classList.add("hidden");
    pauseButton.textContent = "Reprendre";
    syncAudioState();
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
  levelHint.textContent = "Évitez le trafic et les obstacles. Gardez le contrôle jusqu'à l'arrivée.";
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

  const roadLighting = ctx.createLinearGradient(0, 0, 0, canvas.height);
  roadLighting.addColorStop(0, "rgba(120, 157, 181, .12)");
  roadLighting.addColorStop(0.35, "rgba(120, 157, 181, .015)");
  roadLighting.addColorStop(1, "rgba(0, 0, 0, .22)");
  ctx.fillStyle = roadLighting;
  ctx.fillRect(90, 0, 720, canvas.height);

  for (let y = -42 + (roadOffset % 52), index = 0; y < canvas.height; y += 52, index += 1) {
    ctx.fillStyle = index % 2 === 0 ? "#d9dce0" : "#b83c4b";
    ctx.fillRect(84, y, 7, 26);
    ctx.fillRect(809, y, 7, 26);
  }

  for (let y = -30 + (roadOffset % 52); y < canvas.height; y += 52) {
    ctx.fillStyle = "rgba(224, 232, 238, .035)";
    ctx.fillRect(96, y, 708, 1);
  }

  for (let y = -18 + (roadOffset % 104); y < canvas.height; y += 104) {
    ctx.fillStyle = "rgba(206, 221, 231, .035)";
    ctx.fillRect(144, y, 34, 2);
    ctx.fillRect(716, y + 38, 42, 2);
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

  drawRoadMotion();

  if (running || elapsed >= raceDuration) {
    const progress = Math.min(finishProgressMs / raceDuration, 1);
    drawFinishLine(-70 + progress * (car.y + 70));
  }
}

function drawRoadMotion() {
  const speedRatio = car.speed / maxSpeed;
  if (!running || speedRatio < 0.62) return;

  const opacity = Math.min(0.22, (speedRatio - 0.62) * 0.45);
  const offset = (roadOffset * 2.4) % 112;
  ctx.save();
  ctx.strokeStyle = `rgba(199, 222, 239, ${opacity})`;
  ctx.lineWidth = 2;
  for (let index = 0; index < 5; index += 1) {
    const y = (index * 112 + offset) % canvas.height;
    ctx.beginPath();
    ctx.moveTo(124 + (index % 2) * 12, y);
    ctx.lineTo(157 + (index % 2) * 12, y - 18);
    ctx.moveTo(743 - (index % 2) * 12, y + 34);
    ctx.lineTo(776 - (index % 2) * 12, y + 16);
    ctx.stroke();
  }
  ctx.restore();
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
        ctx.shadowColor = "rgba(255, 190, 104, .25)";
        ctx.shadowBlur = 7 * size;
        ctx.fillRect(buildingX + 12, windowY, 8 * size, 10 * size);
        ctx.fillRect(buildingX + 38, windowY, 8 * size, 10 * size);
      }
      ctx.shadowBlur = 0;

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
  const width = vehicle.width || 46;
  const height = vehicle.height || 82;

  ctx.fillStyle = "rgba(0, 0, 0, .35)";
  ctx.beginPath();
  ctx.ellipse(3, 5, width * 0.72, height * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#080b0f";
  for (const wheelY of [-height * 0.29, height * 0.2]) {
    ctx.fillRect(-width / 2 - 4, wheelY, 7, height * 0.24);
    ctx.fillRect(width / 2 - 3, wheelY, 7, height * 0.24);
    ctx.fillStyle = "#77818a";
    ctx.fillRect(-width / 2 - 2, wheelY + 4, 2, height * 0.12);
    ctx.fillRect(width / 2, wheelY + 4, 2, height * 0.12);
    ctx.fillStyle = "#080b0f";
  }

  const bodyPaint = ctx.createLinearGradient(-vehicle.width / 2, 0, vehicle.width / 2, 0);
  bodyPaint.addColorStop(0, "#20252b");
  bodyPaint.addColorStop(0.24, color);
  bodyPaint.addColorStop(0.72, color);
  bodyPaint.addColorStop(1, "#232931");
  ctx.fillStyle = bodyPaint;
  roundedRect(-width / 2, -height / 2, width, height, vehicle.style === "van" ? 7 : 12);
  ctx.fill();

  const glass = ctx.createLinearGradient(0, -25, 0, 4);
  glass.addColorStop(0, "#b8d5df");
  glass.addColorStop(0.55, "#476575");
  glass.addColorStop(1, "#243944");
  ctx.fillStyle = glass;
  const cabinWidth = vehicle.style === "van" ? width * 0.7 : width * 0.64;
  const cabinHeight = vehicle.style === "sport" ? height * 0.22 : height * 0.29;
  roundedRect(-cabinWidth / 2, -height * 0.33, cabinWidth, cabinHeight, 6);
  ctx.fill();
  ctx.fillStyle = "#263846";
  roundedRect(-cabinWidth / 2, height * 0.1, cabinWidth, height * 0.22, 5);
  ctx.fill();

  ctx.fillStyle = "#101820";
  roundedRect(-cabinWidth * 0.34, -height * 0.03, cabinWidth * 0.68, 3, 1);
  ctx.fill();
  ctx.fillStyle = bodyPaint;
  roundedRect(-width / 2 - 3, -height * 0.2, 5, 9, 2);
  ctx.fill();
  roundedRect(width / 2 - 2, -height * 0.2, 5, 9, 2);
  ctx.fill();

  ctx.fillStyle = "#fff5ca";
  ctx.shadowColor = "#ffe39b";
  ctx.shadowBlur = isPlayer ? 13 : 7;
  ctx.fillRect(-width * 0.36, -height / 2 + 3, 7, 5);
  ctx.fillRect(width * 0.2, -height / 2 + 3, 7, 5);
  ctx.fillStyle = "#ff3449";
  ctx.shadowColor = "#ff2948";
  ctx.shadowBlur = 9;
  ctx.fillRect(-width * 0.36, height / 2 - 8, 7, 5);
  ctx.fillRect(width * 0.2, height / 2 - 8, 7, 5);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,.22)";
  ctx.fillRect(-width / 2 + 5, -height * 0.38, 2, height * 0.3);

  if (vehicle.style === "van") {
    ctx.fillStyle = "rgba(225, 238, 245, .5)";
    ctx.fillRect(-width / 2 + 3, -height * 0.06, 3, height * 0.16);
    ctx.fillRect(width / 2 - 6, -height * 0.06, 3, height * 0.16);
  } else if (vehicle.style === "sport") {
    ctx.fillStyle = "#252b32";
    ctx.fillRect(-width * 0.42, height * 0.36, width * 0.84, 3);
  } else if (vehicle.style === "taxi") {
    ctx.fillStyle = "#ffe47a";
    roundedRect(-7, -height * 0.08, 14, 6, 2);
    ctx.fill();
  }
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

  ctx.fillStyle = "#d4dde5";
  ctx.shadowColor = "#fff0bd";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.ellipse(0, -18, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

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
    drawCar(opponent, opponent.style === "taxi" ? "#e5b933" : opponent.color, false);
  }
}

function ensureAudio() {
  if (!soundEnabled) return false;
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      soundEnabled = false;
      soundEnabledInput.checked = false;
      soundEnabledInput.disabled = true;
      return false;
    }
    audioContext = new AudioContextClass();
    engineOscillator = audioContext.createOscillator();
    engineGain = audioContext.createGain();
    const engineFilter = audioContext.createBiquadFilter();
    engineOscillator.type = "sawtooth";
    engineOscillator.frequency.value = 45;
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 240;
    engineGain.gain.value = 0.0001;
    engineOscillator.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(audioContext.destination);
    engineOscillator.start();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch((error) => console.warn("Impossible de démarrer le son du jeu.", error));
  }
  return true;
}

function playTone(frequency, duration, volume = 0.04, type = "triangle") {
  if (!ensureAudio()) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.03);
}

function syncAudioState() {
  if (!soundEnabled || !ensureAudio()) {
    if (engineGain && audioContext) {
      engineGain.gain.setTargetAtTime(0.0001, audioContext.currentTime, 0.08);
    }
    if (musicInterval) {
      clearInterval(musicInterval);
      musicInterval = null;
    }
    return;
  }

  const active = running && !paused;
  const now = audioContext.currentTime;
  engineGain.gain.setTargetAtTime(active ? 0.018 + (car.speed / maxSpeed) * 0.035 : 0.0001, now, 0.08);
  engineOscillator.frequency.setTargetAtTime(active ? 48 + (car.speed / maxSpeed) * 110 : 45, now, 0.08);

  if (!active && musicInterval) {
    clearInterval(musicInterval);
    musicInterval = null;
    return;
  }
  if (active && !musicInterval) {
    const melody = [659, 0, 784, 880, 0, 784, 659, 0, 587, 659, 0, 784, 880, 0, 784, 659];
    musicInterval = setInterval(() => {
      const note = melody[musicNoteIndex % melody.length];
      if (note) playTone(note, 0.2, 0.018);
      if (musicNoteIndex % 4 === 0) playTone(110, 0.16, 0.012, "sine");
      musicNoteIndex += 1;
    }, 280);
  }
}

function playCrashSound() {
  playTone(115, 0.22, 0.1, "sawtooth");
  playTone(78, 0.28, 0.07, "square");
}

function playFinishJingle() {
  [523, 659, 784].forEach((note, index) => {
    setTimeout(() => playTone(note, 0.32, 0.04), index * 160);
  });
}

function drawObstacle(obstacle) {
  ctx.save();
  ctx.translate(obstacle.x, obstacle.y);
  ctx.fillStyle = "rgba(0, 0, 0, .35)";
  ctx.beginPath();
  ctx.ellipse(2, 11, obstacle.type === "oil" ? 25 : 19, 8, 0, 0, Math.PI * 2);
  ctx.fill();
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

  if (soundEnabled && audioContext && engineOscillator && !paused) {
    const speedRatio = car.speed / maxSpeed;
    engineOscillator.frequency.setTargetAtTime(48 + speedRatio * 110, audioContext.currentTime, 0.12);
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
      respawnOpponent(opponent, -90);
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
      playCrashSound();
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
      playCrashSound();
      respawnOpponent(opponent);
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
  syncAudioState();
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
  syncAudioState();
  playFinishJingle();
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
soundEnabledInput.addEventListener("change", () => {
  soundEnabled = soundEnabledInput.checked;
  localStorage.setItem("nightRacerSoundEnabled", String(soundEnabled));
  syncAudioState();
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
