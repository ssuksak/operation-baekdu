const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
let audioCtx = null;
const atmosphericsCache = {
  width: 0,
  height: 0,
  sun: null,
  vignette: null,
};

const visibilityMaskCache = {
  canvas: document.createElement("canvas"),
  ctx: null,
  width: 0,
  height: 0,
  scale: 0.5,
};

const minimapCache = {
  canvas: document.createElement("canvas"),
  ctx: null,
  width: 0,
  height: 0,
  dirty: true,
};

const damageVignetteCache = {
  canvas: document.createElement("canvas"),
  ctx: null,
  width: 0,
  height: 0,
};

function resizeCanvasToDisplaySize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const displayWidth = Math.max(1, Math.round(rect.width * dpr));
  const displayHeight = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = WIDTH = displayWidth;
    canvas.height = HEIGHT = displayHeight;
  }
}

function rebuildAtmosphericsCache() {
  atmosphericsCache.width = WIDTH;
  atmosphericsCache.height = HEIGHT;
  const sun = ctx.createRadialGradient(130, 90, 30, 130, 90, 520);
  sun.addColorStop(0, "rgba(255,244,186,0.12)");
  sun.addColorStop(0.45, "rgba(255,244,186,0.06)");
  sun.addColorStop(1, "rgba(255,244,186,0)");
  atmosphericsCache.sun = sun;

  const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.25, WIDTH / 2, HEIGHT / 2, HEIGHT * 0.85);
  vignette.addColorStop(0.65, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.18)");
  atmosphericsCache.vignette = vignette;
}

function rebuildMinimapCache(mapW, mapH) {
  if (!minimapCache.ctx) {
    minimapCache.ctx = minimapCache.canvas.getContext("2d");
  }
  if (minimapCache.width !== mapW || minimapCache.height !== mapH) {
    minimapCache.width = mapW;
    minimapCache.height = mapH;
    minimapCache.canvas.width = mapW;
    minimapCache.canvas.height = mapH;
    minimapCache.ctx = minimapCache.canvas.getContext("2d");
  }

  const mctx = minimapCache.ctx;
  mctx.clearRect(0, 0, mapW, mapH);
  mctx.fillStyle = "rgba(10,18,20,0.78)";
  mctx.fillRect(0, 0, mapW, mapH);

  mctx.strokeStyle = "rgba(255,255,255,0.08)";
  for (let i = 1; i < 4; i++) {
    const gx = (mapW / 4) * i;
    mctx.beginPath();
    mctx.moveTo(gx, 10);
    mctx.lineTo(gx, mapH - 10);
    mctx.stroke();
  }
  for (let i = 1; i < 3; i++) {
    const gy = (mapH / 3) * i;
    mctx.beginPath();
    mctx.moveTo(10, gy);
    mctx.lineTo(mapW - 10, gy);
    mctx.stroke();
  }

  state.terrain.forEach((zone) => {
    const zx = (zone.x / WORLD_WIDTH) * mapW;
    const zy = (zone.y / WORLD_HEIGHT) * mapH;
    const zw = (zone.w / WORLD_WIDTH) * mapW;
    const zh = (zone.h / WORLD_HEIGHT) * mapH;
    mctx.fillStyle =
      zone.type === "road" ? "rgba(160,150,125,0.55)" :
      zone.type === "water" ? "rgba(90,170,220,0.55)" :
      zone.type === "hill" ? "rgba(120,170,115,0.32)" :
      "rgba(70,150,80,0.42)";
    mctx.fillRect(zx, zy, zw, zh);
  });

  minimapCache.dirty = false;
}

function rebuildDamageVignetteCache() {
  if (!damageVignetteCache.ctx) {
    damageVignetteCache.ctx = damageVignetteCache.canvas.getContext("2d");
  }
  if (damageVignetteCache.width !== WIDTH || damageVignetteCache.height !== HEIGHT) {
    damageVignetteCache.width = WIDTH;
    damageVignetteCache.height = HEIGHT;
    damageVignetteCache.canvas.width = WIDTH;
    damageVignetteCache.canvas.height = HEIGHT;
    damageVignetteCache.ctx = damageVignetteCache.canvas.getContext("2d");
  }

  const dctx = damageVignetteCache.ctx;
  dctx.clearRect(0, 0, WIDTH, HEIGHT);
  const edge = dctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.2, WIDTH / 2, HEIGHT / 2, HEIGHT * 0.82);
  edge.addColorStop(0.55, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(255,70,70,1)");
  dctx.fillStyle = edge;
  dctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function suppressBrowserInteraction(e) {
  e.preventDefault();
}

function primeAudioOnInteraction() {
  ensureAudio();
  window.removeEventListener("pointerdown", primeAudioOnInteraction);
  window.removeEventListener("mousedown", primeAudioOnInteraction);
  window.removeEventListener("touchstart", primeAudioOnInteraction);
  window.removeEventListener("keydown", primeAudioOnInteraction);
}

function ensureAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playTone(freq, duration, type = "square", volume = 0.03, sweepTo = null) {
  if (state.audioMuted) return;
  const ac = ensureAudio();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + duration);
}

function playNoiseBurst(duration = 0.08, volume = 0.018) {
  if (state.audioMuted) return;
  const ac = ensureAudio();
  if (!ac) return;
  const now = ac.currentTime;
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * duration), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();
  filter.type = "highpass";
  filter.frequency.value = 700;
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.buffer = buffer;
  source.connect(filter).connect(gain).connect(ac.destination);
  source.start(now);
}

function playShotSound(shooter) {
  if (shooter === state.player) {
    playTone(shooter.role === "marksman" ? 210 : shooter.role === "heavy" ? 120 : 165, 0.06, "square", 0.035, 90);
    playNoiseBurst(0.05, 0.012);
    return;
  }
  if (Math.hypot(shooter.x - state.player.x, shooter.y - state.player.y) < 420) {
    playTone(110, 0.04, "triangle", 0.012, 70);
  }
}

function playExplosionSound(strength = 1) {
  playNoiseBurst(0.12 * strength, 0.022 * strength);
  playTone(90, 0.14 * strength, "sawtooth", 0.028 * strength, 40);
}

function playUiChirp(freq = 720, freq2 = 980, volume = 0.02) {
  playTone(freq, 0.05, "triangle", volume, freq2);
}

const hpEl = document.getElementById("hp");
const ammoEl = document.getElementById("ammo");
const objectiveTextEl = document.getElementById("objectiveText");
const classNameEl = document.getElementById("className");
const squadListEl = document.getElementById("squadList");
const perfBtn = document.getElementById("perfBtn");
const pointerBtn = document.getElementById("pointerBtn");
const difficultyBtn = document.getElementById("difficultyBtn");
const defaultsBtn = document.getElementById("defaultsBtn");
const shakeBtn = document.getElementById("shakeBtn");
const hudBtn = document.getElementById("hudBtn");
const minimapBtn = document.getElementById("minimapBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const audioBtn = document.getElementById("audioBtn");
const restartBtn = document.getElementById("restartBtn");
const pauseBtn = document.getElementById("pauseBtn");
const classButtons = [...document.querySelectorAll(".class-btn")];
const missionButtons = [...document.querySelectorAll(".mission-btn")];
const commandButtons = [...document.querySelectorAll(".command-btn")];
const commandTextEl = document.getElementById("commandText");
const alertTextEl = document.getElementById("alertText");
const phaseTextEl = document.getElementById("phaseText");
const interactHintEl = document.getElementById("interactHint");
const fireBtn = document.getElementById("fireBtn");
const skillBtn = document.getElementById("skillBtn");
const interactBtn = document.getElementById("interactBtn");
const moveStick = document.getElementById("moveStick");
const stickKnob = moveStick.querySelector(".stick-knob");

let WIDTH = canvas.width;
let HEIGHT = canvas.height;
const WORLD_WIDTH = 4200;
const WORLD_HEIGHT = 2800;

const difficultyPresets = {
  easy: {
    label: "쉬움",
    playerHp: 1.18,
    playerDamage: 1.12,
    allyHp: 1.12,
    allyDamage: 1.08,
    enemyHp: 0.9,
    enemyDamage: 0.88,
  },
  normal: {
    label: "보통",
    playerHp: 1,
    playerDamage: 1,
    allyHp: 1,
    allyDamage: 1,
    enemyHp: 1,
    enemyDamage: 1,
  },
  hard: {
    label: "어려움",
    playerHp: 0.94,
    playerDamage: 0.95,
    allyHp: 0.94,
    allyDamage: 0.95,
    enemyHp: 1.12,
    enemyDamage: 1.14,
  },
};

const classConfigs = {
  rifleman: {
    label: "소총수",
    color: "#6fd36f",
    maxHp: 100,
    magSize: 30,
    reserve: 90,
    fireRate: 0.16,
    damage: 20,
    speed: 170,
    skillCooldown: 10,
    skillName: "섬광탄",
  },
  medic: {
    label: "의무병",
    color: "#70d7ff",
    maxHp: 110,
    magSize: 24,
    reserve: 72,
    fireRate: 0.18,
    damage: 16,
    speed: 160,
    skillCooldown: 12,
    skillName: "응급치료",
  },
  engineer: {
    label: "공병",
    color: "#ffc76d",
    maxHp: 105,
    magSize: 26,
    reserve: 78,
    fireRate: 0.2,
    damage: 18,
    speed: 155,
    skillCooldown: 14,
    skillName: "엄폐 설치",
  },
  scout: {
    label: "정찰병",
    color: "#d29bff",
    maxHp: 85,
    magSize: 22,
    reserve: 66,
    fireRate: 0.13,
    damage: 15,
    speed: 190,
    skillCooldown: 9,
    skillName: "정찰 드론",
  },
  heavy: {
    label: "중기관총 사수",
    color: "#ff845d",
    maxHp: 145,
    magSize: 40,
    reserve: 120,
    fireRate: 0.11,
    damage: 14,
    speed: 125,
    skillCooldown: 0,
    skillName: "",
  },
  grenadier: {
    label: "유탄병",
    color: "#ffb05e",
    maxHp: 95,
    magSize: 18,
    reserve: 54,
    fireRate: 0.35,
    damage: 20,
    speed: 140,
    skillCooldown: 0,
    skillName: "",
  },
  marksman: {
    label: "지정사수",
    color: "#ff8ad8",
    maxHp: 85,
    magSize: 12,
    reserve: 36,
    fireRate: 0.55,
    damage: 28,
    speed: 135,
    skillCooldown: 0,
    skillName: "",
  },
};

const input = {
  up: false,
  down: false,
  left: false,
  right: false,
  fire: false,
  interact: false,
  skill: false,
  mouseX: WIDTH / 2,
  mouseY: HEIGHT / 2,
  touchMoveX: 0,
  touchMoveY: 0,
  touchAiming: false,
};

const state = {
  selectedClass: "rifleman",
  selectedMission: "intelRaid",
  squadCommand: "follow",
  paused: false,
  audioMuted: false,
  minimapVisible: true,
  hudVisible: true,
  screenShakeEnabled: true,
  difficulty: "normal",
  objectivePointerVisible: true,
  performanceMode: false,
  perfStatsVisible: false,
  tutorialCompleted: false,
  tutorialStep: 0,
  player: null,
  allies: [],
  enemies: [],
  bullets: [],
  projectiles: [],
  effects: [],
  noiseBursts: [],
  cover: [],
  terrain: [],
  supplies: [],
  intel: null,
  reconA: null,
  reconB: null,
  jammer: null,
  extraction: null,
  defendZone: null,
  objectivePhase: "retrieve",
  alertLevel: "낮음",
  message: "작전 지역에 진입하라",
  messageTimer: 0,
  gameOver: false,
  victory: false,
  waveTimer: 0,
  missionClock: 0,
  wavesRemaining: 0,
  stats: null,
  camera: { x: 0, y: 0 },
  hitMarkerTimer: 0,
  killMarkerTimer: 0,
  killBannerTimer: 0,
  killBannerText: "",
  screenFlashTimer: 0,
  screenFlashColor: "rgba(255,245,210,0.38)",
  playerDamageTimer: 0,
  nearMissTimer: 0,
  eventBannerTimer: 0,
  eventBannerText: "",
  eventBannerColor: "#ffe082",
  hitStopTimer: 0,
  recoilKick: 0,
  cameraShakeTimer: 0,
  cameraShakeStrength: 0,
  fps: 0,
  frameMs: 0,
  updateMs: 0,
  renderMs: 0,
  lastTime: 0,
};

const PREFERENCES_KEY = "operationBaekduPreferences";

function savePreferences() {
  try {
    localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({
        selectedClass: state.selectedClass,
        selectedMission: state.selectedMission,
        squadCommand: state.squadCommand,
        audioMuted: state.audioMuted,
        minimapVisible: state.minimapVisible,
        hudVisible: state.hudVisible,
        screenShakeEnabled: state.screenShakeEnabled,
        difficulty: state.difficulty,
        objectivePointerVisible: state.objectivePointerVisible,
        performanceMode: state.performanceMode,
        perfStatsVisible: state.perfStatsVisible,
        tutorialCompleted: state.tutorialCompleted,
      })
    );
  } catch {}
}

function loadPreferences() {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return "follow";
    const parsed = JSON.parse(raw);
    if (parsed.selectedClass && classConfigs[parsed.selectedClass]) {
      state.selectedClass = parsed.selectedClass;
    }
    if (parsed.selectedMission && ["intelRaid", "reconSweep", "outpostDefense"].includes(parsed.selectedMission)) {
      state.selectedMission = parsed.selectedMission;
    }
    if (parsed.squadCommand && ["follow", "hold", "assault"].includes(parsed.squadCommand)) {
      state.squadCommand = parsed.squadCommand;
    }
    if (typeof parsed.audioMuted === "boolean") {
      state.audioMuted = parsed.audioMuted;
    }
    if (typeof parsed.minimapVisible === "boolean") {
      state.minimapVisible = parsed.minimapVisible;
    }
    if (typeof parsed.hudVisible === "boolean") {
      state.hudVisible = parsed.hudVisible;
    }
    if (typeof parsed.screenShakeEnabled === "boolean") {
      state.screenShakeEnabled = parsed.screenShakeEnabled;
    }
    if (parsed.difficulty && difficultyPresets[parsed.difficulty]) {
      state.difficulty = parsed.difficulty;
    }
    if (typeof parsed.objectivePointerVisible === "boolean") {
      state.objectivePointerVisible = parsed.objectivePointerVisible;
    }
    if (typeof parsed.performanceMode === "boolean") {
      state.performanceMode = parsed.performanceMode;
    }
    if (typeof parsed.perfStatsVisible === "boolean") {
      state.perfStatsVisible = parsed.perfStatsVisible;
    }
    if (typeof parsed.tutorialCompleted === "boolean") {
      state.tutorialCompleted = parsed.tutorialCompleted;
    }
  } catch {}
  return state.squadCommand;
}

function makeRect(x, y, w, h, type = "rock") {
  return { x, y, w, h, type, hp: type === "placedCover" ? 90 : Infinity };
}

function createUnit(x, y, team, role, opts = {}) {
  const cfg = classConfigs[role] || classConfigs.rifleman;
  const difficulty = difficultyPresets[state.difficulty] || difficultyPresets.normal;
  const preferredRange =
    opts.preferredRange ??
    (role === "heavy" ? 185 : role === "grenadier" ? 210 : role === "marksman" ? 260 : 150);
  const unit = {
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: opts.radius || 12,
    team,
    role,
    color: opts.color || cfg.color,
    maxHp: opts.maxHp || cfg.maxHp,
    hp: opts.hp || cfg.maxHp,
    fireRate: opts.fireRate || cfg.fireRate,
    damage: opts.damage || cfg.damage,
    speed: opts.speed || cfg.speed,
    preferredRange,
    cooldown: 0,
    reloadTimer: 0,
    magSize: opts.magSize || cfg.magSize,
    ammo: opts.ammo || cfg.magSize,
    reserve: opts.reserve ?? cfg.reserve,
    aiTimer: 0,
    alert: "idle",
    target: null,
    revivePower: 0,
    downed: false,
    bleedout: 0,
    holdX: x,
    holdY: y,
    patrol: opts.patrol || null,
    patrolIndex: 0,
    specialCooldown: 0,
    skillCooldown: 0,
    visionBoost: 0,
    lastKnownTargetX: x,
    lastKnownTargetY: y,
    searchTimer: 0,
    hitFlash: 0,
    hitScale: 0,
    deathTimer: 0,
    deathTilt: 0,
  };
  if (team === "player") {
    unit.maxHp = Math.round(unit.maxHp * difficulty.playerHp);
    unit.hp = Math.round(unit.hp * difficulty.playerHp);
    unit.damage = Math.round(unit.damage * difficulty.playerDamage);
  } else if (team === "ally") {
    unit.maxHp = Math.round(unit.maxHp * difficulty.allyHp);
    unit.hp = Math.round(unit.hp * difficulty.allyHp);
    unit.damage = Math.round(unit.damage * difficulty.allyDamage);
  } else if (team === "enemy") {
    unit.maxHp = Math.round(unit.maxHp * difficulty.enemyHp);
    unit.hp = Math.round(unit.hp * difficulty.enemyHp);
    unit.damage = Math.round(unit.damage * difficulty.enemyDamage);
  }
  return unit;
}

function getMissionConfig() {
  if (state.selectedMission === "reconSweep") {
    return {
      objectiveText: "정찰 지점 확보 후 탈출",
      playerSpawn: { x: 520, y: 2260 },
      allySpawns: [
        { x: 460, y: 2210, color: "#86f096" },
        { x: 560, y: 2200, color: "#72dcff" },
        { x: 610, y: 2280, color: "#ffc76d" },
      ],
      cover: [
        makeRect(760, 2120, 150, 34, "sandbag"),
        makeRect(1180, 1870, 170, 40, "rock"),
        makeRect(1660, 1490, 120, 220, "wall"),
        makeRect(2100, 960, 220, 180, "building"),
        makeRect(2870, 780, 200, 46, "rock"),
        makeRect(3180, 1280, 180, 170, "building"),
        makeRect(3520, 920, 140, 36, "sandbag"),
      ],
      terrain: [
        { type: "hill", x: 120, y: 1820, w: 820, h: 440 },
        { type: "brush", x: 980, y: 1930, w: 360, h: 220 },
        { type: "road", x: 1240, y: 1480, w: 2140, h: 120 },
        { type: "hill", x: 2080, y: 300, w: 940, h: 420 },
        { type: "brush", x: 2700, y: 980, w: 340, h: 220 },
        { type: "brush", x: 3340, y: 620, w: 280, h: 180 },
      ],
      supplies: [
        { x: 1010, y: 2020, radius: 20, type: "ammo", used: false },
        { x: 2440, y: 1360, radius: 20, type: "med", used: false },
      ],
      enemies: [
        createUnit(1320, 1880, "enemy", "rifleman", { color: "#ff7c7c", hp: 68, maxHp: 68, patrol: [{ x: 1240, y: 1930 }, { x: 1430, y: 1830 }] }),
        createUnit(2010, 1100, "enemy", "marksman", { color: "#ff8ad8", hp: 82, maxHp: 82, patrol: [{ x: 1940, y: 1040 }, { x: 2160, y: 1180 }] }),
        createUnit(2540, 1420, "enemy", "grenadier", { color: "#ffb05e", hp: 94, maxHp: 94, patrol: [{ x: 2460, y: 1360 }, { x: 2650, y: 1490 }] }),
        createUnit(3200, 970, "enemy", "rifleman", { color: "#ff7c7c", hp: 70, maxHp: 70, patrol: [{ x: 3120, y: 910 }, { x: 3340, y: 1020 }] }),
        createUnit(3560, 760, "enemy", "heavy", { color: "#ff845d", hp: 145, maxHp: 145 }),
      ],
      defendZone: null,
      extraction: { x: 3820, y: 420, radius: 42 },
      intel: null,
      jammer: null,
      reconA: { x: 1480, y: 1880, radius: 26, complete: false },
      reconB: { x: 2960, y: 980, radius: 26, complete: false },
      phase: "reconAlpha",
      missionClock: 0,
      wavesRemaining: 0,
      waveTimer: 0,
      intro: "2개 정찰 지점을 확보한 뒤 탈출 지점으로 복귀하라",
    };
  }

  if (state.selectedMission === "outpostDefense") {
    return {
      objectiveText: "전초기지를 방어하라",
      playerSpawn: { x: 980, y: 1500 },
      allySpawns: [
        { x: 920, y: 1540, color: "#86f096" },
        { x: 980, y: 1580, color: "#72dcff" },
        { x: 1040, y: 1535, color: "#ffc76d" },
      ],
      cover: [
        makeRect(850, 1360, 180, 28, "sandbag"),
        makeRect(850, 1625, 180, 28, "sandbag"),
        makeRect(1140, 1340, 120, 30, "wall"),
        makeRect(1140, 1640, 120, 30, "wall"),
        makeRect(1520, 1190, 180, 42, "rock"),
        makeRect(1520, 1830, 180, 42, "rock"),
        makeRect(1900, 1450, 220, 140, "building"),
        makeRect(2200, 1280, 160, 160, "building"),
        makeRect(2380, 1650, 180, 180, "building"),
      ],
      terrain: [
        { type: "hill", x: 260, y: 700, w: 820, h: 420 },
        { type: "road", x: 1040, y: 1440, w: 2450, h: 120 },
        { type: "brush", x: 1280, y: 920, w: 320, h: 220 },
        { type: "brush", x: 1520, y: 1810, w: 340, h: 200 },
        { type: "hill", x: 2040, y: 740, w: 540, h: 280 },
        { type: "brush", x: 2740, y: 920, w: 360, h: 220 },
        { type: "hill", x: 3050, y: 1520, w: 680, h: 360 },
        { type: "brush", x: 3320, y: 1960, w: 260, h: 180 },
      ],
      supplies: [
        { x: 1240, y: 1490, radius: 20, type: "ammo", used: false },
        { x: 2150, y: 1510, radius: 20, type: "med", used: false },
      ],
      enemies: [
        createUnit(2350, 1160, "enemy", "marksman", { color: "#ff8ad8", hp: 85, maxHp: 85 }),
        createUnit(2500, 1500, "enemy", "heavy", { color: "#ff845d", hp: 145, maxHp: 145 }),
        createUnit(2410, 1870, "enemy", "grenadier", { color: "#ffb05e", hp: 95, maxHp: 95, damage: 20 }),
        createUnit(3320, 1130, "enemy", "marksman", { color: "#ff8ad8", hp: 82, maxHp: 82 }),
        createUnit(3480, 1700, "enemy", "grenadier", { color: "#ffb05e", hp: 92, maxHp: 92, damage: 20 }),
      ],
      defendZone: { x: 995, y: 1505, radius: 138 },
      extraction: null,
      intel: null,
      phase: "defend",
      missionClock: 320,
      wavesRemaining: 8,
      waveTimer: 20,
      intro: "전초기지를 사수하고 적의 파상공세를 막아라",
    };
  }

  return {
      objectiveText: "자료 회수 후 탈출",
    playerSpawn: { x: 360, y: 2250 },
    allySpawns: [
      { x: 300, y: 2195, color: "#86f096" },
      { x: 380, y: 2190, color: "#72dcff" },
      { x: 450, y: 2235, color: "#ffc76d" },
    ],
    cover: [
      makeRect(560, 2080, 140, 32, "sandbag"),
      makeRect(940, 1880, 170, 42, "rock"),
      makeRect(1280, 1700, 220, 34, "wall"),
      makeRect(1710, 1860, 130, 38, "sandbag"),
      makeRect(2210, 900, 240, 220, "building"),
      makeRect(2780, 1320, 260, 240, "building"),
      makeRect(3260, 1200, 180, 42, "rock"),
      makeRect(1540, 1180, 160, 160, "building"),
      makeRect(2400, 1100, 90, 220, "wall"),
      makeRect(3440, 1500, 210, 170, "building"),
    ],
    terrain: [
      { type: "hill", x: 80, y: 1850, w: 980, h: 460 },
      { type: "road", x: 900, y: 1880, w: 2500, h: 130 },
      { type: "brush", x: 1050, y: 2040, w: 360, h: 200 },
      { type: "brush", x: 1620, y: 1560, w: 420, h: 230 },
      { type: "hill", x: 2220, y: 360, w: 980, h: 440 },
      { type: "brush", x: 3140, y: 1030, w: 360, h: 250 },
      { type: "brush", x: 3420, y: 1820, w: 260, h: 220 },
      { type: "water", x: 1880, y: 2140, w: 920, h: 180 },
    ],
    supplies: [
      { x: 860, y: 1960, radius: 20, type: "ammo", used: false },
      { x: 1940, y: 1710, radius: 20, type: "med", used: false },
      { x: 2860, y: 1430, radius: 20, type: "ammo", used: false },
    ],
    enemies: [
      createUnit(1560, 1040, "enemy", "rifleman", {
        color: "#ff7c7c",
        hp: 65,
        maxHp: 65,
        patrol: [{ x: 1480, y: 1080 }, { x: 1660, y: 1020 }],
      }),
      createUnit(2380, 820, "enemy", "marksman", {
        color: "#ff8ad8",
        hp: 82,
        maxHp: 82,
        patrol: [{ x: 2320, y: 760 }, { x: 2510, y: 900 }],
      }),
      createUnit(2100, 1540, "enemy", "grenadier", {
        color: "#ffb05e",
        hp: 95,
        maxHp: 95,
        damage: 20,
        patrol: [{ x: 2000, y: 1470 }, { x: 2200, y: 1650 }],
      }),
      createUnit(2890, 1500, "enemy", "rifleman", {
        color: "#ff7c7c",
        hp: 70,
        maxHp: 70,
        patrol: [{ x: 2810, y: 1440 }, { x: 3000, y: 1610 }],
      }),
      createUnit(3500, 1820, "enemy", "heavy", { color: "#ff845d", hp: 145, maxHp: 145 }),
      createUnit(1140, 2010, "enemy", "rifleman", {
        color: "#ff7c7c",
        hp: 68,
        maxHp: 68,
        patrol: [{ x: 1050, y: 2000 }, { x: 1260, y: 2100 }],
      }),
      createUnit(1760, 1830, "enemy", "grenadier", {
        color: "#ffb05e",
        hp: 94,
        maxHp: 94,
        patrol: [{ x: 1680, y: 1780 }, { x: 1870, y: 1920 }],
      }),
      createUnit(3210, 1210, "enemy", "marksman", {
        color: "#ff8ad8",
        hp: 82,
        maxHp: 82,
        patrol: [{ x: 3160, y: 1160 }, { x: 3320, y: 1320 }],
      }),
      createUnit(3740, 1280, "enemy", "rifleman", {
        color: "#ff7c7c",
        hp: 72,
        maxHp: 72,
        patrol: [{ x: 3680, y: 1220 }, { x: 3860, y: 1380 }],
      }),
    ],
    defendZone: null,
    extraction: { x: 260, y: 260, radius: 40 },
    intel: { x: 3620, y: 1380, radius: 26, collected: false },
    jammer: { x: 2040, y: 1660, radius: 28, disabled: false },
    phase: "disableJammer",
    missionClock: 0,
    wavesRemaining: 0,
    waveTimer: 0,
    intro: "교란기를 파괴하고 정보 자료를 확보한 뒤 탈출하라",
  };
}

function resetGame() {
  const cfg = classConfigs[state.selectedClass];
  const mission = getMissionConfig();
  state.player = createUnit(mission.playerSpawn.x, mission.playerSpawn.y, "player", state.selectedClass, {
    maxHp: cfg.maxHp,
    hp: cfg.maxHp,
    ammo: cfg.magSize,
    reserve: cfg.reserve,
  });

  const allyRoles = ["rifleman", "medic", "engineer", "scout"].filter((role) => role !== state.selectedClass);
  state.allies = allyRoles.map((role, index) =>
    createUnit(mission.allySpawns[index].x, mission.allySpawns[index].y, "ally", role, { color: mission.allySpawns[index].color })
  );
  state.enemies = mission.enemies;
  state.cover = mission.cover;
  state.terrain = mission.terrain || [];
  minimapCache.dirty = true;
  state.supplies = mission.supplies || [];
  state.intel = mission.intel;
  state.reconA = mission.reconA || null;
  state.reconB = mission.reconB || null;
  state.jammer = mission.jammer || null;
  state.extraction = mission.extraction;
  state.defendZone = mission.defendZone;
  state.bullets = [];
  state.projectiles = [];
  state.effects = [];
  state.noiseBursts = [];
  state.objectivePhase = mission.phase;
  state.alertLevel = "낮음";
  state.missionClock = mission.missionClock;
  state.wavesRemaining = mission.wavesRemaining;
  state.waveTimer = mission.waveTimer;
  state.message = mission.intro;
  state.messageTimer = 4;
  state.gameOver = false;
  state.victory = false;
  state.paused = false;
  state.hitMarkerTimer = 0;
  state.killMarkerTimer = 0;
  state.killBannerTimer = 0;
  state.killBannerText = "";
  state.screenFlashTimer = 0;
  state.screenFlashColor = "rgba(255,245,210,0.38)";
  state.playerDamageTimer = 0;
  state.nearMissTimer = 0;
  state.eventBannerTimer = 0;
  state.eventBannerText = "";
  state.eventBannerColor = "#ffe082";
  state.hitStopTimer = 0;
  state.recoilKick = 0;
  state.cameraShakeTimer = 0;
  state.cameraShakeStrength = 0;
  state.squadCommand = "follow";
  state.stats = {
    shots: 0,
    hits: 0,
    kills: 0,
    revives: 0,
    startedAt: performance.now(),
    finishedAt: null,
  };
  state.tutorialStep = state.tutorialCompleted ? 99 : 0;
  input.fire = false;
  input.interact = false;
  input.touchAiming = false;
  input.mouseX = state.player.x + 100;
  input.mouseY = state.player.y;
  resetStick();
  aimTouchId = null;
  aimAnchorClientX = 0;
  aimAnchorClientY = 0;
  classButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.class === state.selectedClass));
  missionButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.mission === state.selectedMission));
  commandButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.command === state.squadCommand));
  pauseBtn.textContent = "일시정지";
  audioBtn.textContent = state.audioMuted ? "음소거 해제" : "오디오 켜짐";
  perfBtn.textContent = state.performanceMode ? "경량 모드 켜짐" : "경량 모드 꺼짐";
  difficultyBtn.textContent = `난이도: ${difficultyPresets[state.difficulty].label}`;
  pointerBtn.textContent = state.objectivePointerVisible ? "목표 화살표 켜짐" : "목표 화살표 꺼짐";
  shakeBtn.textContent = state.screenShakeEnabled ? "흔들림 켜짐" : "흔들림 꺼짐";
  hudBtn.textContent = state.hudVisible ? "HUD 숨기기" : "HUD 보이기";
  minimapBtn.textContent = state.minimapVisible ? "미니맵 숨기기" : "미니맵 보이기";
  updateFullscreenButton();
  document.body.classList.toggle("hud-collapsed", !state.hudVisible);
  updateControlHints();
  skillBtn.textContent = cfg.skillName;
  if (state.selectedMission === "reconSweep") {
    triggerEventBanner("정찰 소탕 · A/B 지점 확보 후 탈출", "#9fe7ff", 2.8);
  }
  updateCamera();
  updateHud();
}

function updateHud() {
  const p = state.player;
  const objectiveTarget = getCurrentObjectiveTarget();
  const objectiveDistance = objectiveTarget ? Math.floor(dist(p, objectiveTarget)) : 0;
  hpEl.textContent = Math.max(0, Math.ceil(p.hp));
  ammoEl.textContent = `${p.ammo} / ${p.reserve}`;
  classNameEl.textContent = classConfigs[state.selectedClass].label;
  const skillBaseName = classConfigs[state.selectedClass].skillName || "스킬";
  skillBtn.textContent = p.skillCooldown > 0 ? `${skillBaseName} ${p.skillCooldown.toFixed(1)}s` : skillBaseName;
  objectiveTextEl.textContent =
    state.selectedMission === "outpostDefense"
      ? `전초기지 방어 ${Math.max(0, Math.ceil(state.missionClock))}초 / ${objectiveDistance}m`
      : state.selectedMission === "reconSweep"
      ? state.objectivePhase === "reconAlpha"
        ? `정찰 지점 A 확보 / ${objectiveDistance}m`
        : state.objectivePhase === "reconBravo"
        ? `정찰 지점 B 확보 / ${objectiveDistance}m`
        : `탈출 지점으로 복귀 / ${objectiveDistance}m`
      : state.objectivePhase === "disableJammer"
      ? `교란기 파괴 / ${objectiveDistance}m`
      : state.objectivePhase === "retrieve"
      ? `자료 회수 / ${objectiveDistance}m`
      : `탈출 지점으로 복귀 / ${objectiveDistance}m`;
  if (phaseTextEl) phaseTextEl.textContent = getPhaseGuideText();
  if (interactHintEl) interactHintEl.textContent = getInteractHint();
  commandTextEl.textContent =
    state.squadCommand === "follow" ? "집결" : state.squadCommand === "hold" ? "고정" : "돌격";
  alertTextEl.textContent = state.alertLevel;
  pauseBtn.textContent = state.paused ? "계속하기" : "일시정지";

  audioBtn.textContent = state.audioMuted ? "음소거 해제" : "오디오 켜짐";
  perfBtn.textContent = state.performanceMode ? "경량 모드 켜짐" : "경량 모드 꺼짐";
  difficultyBtn.textContent = `난이도: ${difficultyPresets[state.difficulty].label}`;
  pointerBtn.textContent = state.objectivePointerVisible ? "목표 화살표 켜짐" : "목표 화살표 꺼짐";
  shakeBtn.textContent = state.screenShakeEnabled ? "흔들림 켜짐" : "흔들림 꺼짐";
  hudBtn.textContent = state.hudVisible ? "HUD 숨기기" : "HUD 보이기";
  minimapBtn.textContent = state.minimapVisible ? "미니맵 숨기기" : "미니맵 보이기";
  updateFullscreenButton();
  updateControlHints();
  squadListEl.innerHTML = "";
  const members = [state.player, ...state.allies];
  members.forEach((m) => {
    const li = document.createElement("li");
    const suffix = m.downed ? " (다운)" : "";
    li.textContent = `${classConfigs[m.role]?.label || "대원"} - ${Math.max(0, Math.ceil(m.hp))} HP${suffix}`;
    squadListEl.appendChild(li);
  });
}

function setMessage(text, seconds = 2.8) {
  state.message = text;
  state.messageTimer = seconds;
}

function triggerEventBanner(text, color = "#ffe082", seconds = 2.2) {
  state.eventBannerText = text;
  state.eventBannerColor = color;
  state.eventBannerTimer = seconds;
  playUiChirp(color === "#ffb0a0" ? 380 : 720, color === "#ffb0a0" ? 300 : 980, color === "#ffb0a0" ? 0.018 : 0.02);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function screenToWorld(clientX, clientY, rect) {
  return {
    x: ((clientX - rect.left) / rect.width) * WIDTH + state.camera.x,
    y: ((clientY - rect.top) / rect.height) * HEIGHT + state.camera.y,
  };
}

function updateCamera() {
  state.camera.x = clamp(state.player.x - WIDTH / 2, 0, WORLD_WIDTH - WIDTH);
  state.camera.y = clamp(state.player.y - HEIGHT / 2, 0, WORLD_HEIGHT - HEIGHT);
  if (state.screenShakeEnabled && state.cameraShakeTimer > 0) {
    state.camera.x = clamp(state.camera.x + (Math.random() - 0.5) * state.cameraShakeStrength, 0, WORLD_WIDTH - WIDTH);
    state.camera.y = clamp(state.camera.y + (Math.random() - 0.5) * state.cameraShakeStrength, 0, WORLD_HEIGHT - HEIGHT);
  }
}

function isInBrush(unit) {
  return state.terrain.some(
    (zone) => zone.type === "brush" && unit.x >= zone.x && unit.x <= zone.x + zone.w && unit.y >= zone.y && unit.y <= zone.y + zone.h
  );
}

function isOnHill(unit) {
  return state.terrain.some((zone) => {
    if (zone.type !== "hill") return false;
    const rx = zone.w / 2;
    const ry = zone.h / 2;
    const cx = zone.x + rx;
    const cy = zone.y + ry;
    const nx = (unit.x - cx) / rx;
    const ny = (unit.y - cy) / ry;
    return nx * nx + ny * ny <= 1;
  });
}

function isVisibleToSquad(target) {
  const viewers = [state.player, ...state.allies].filter((u) => u.hp > 0 && !u.downed);
  return viewers.some((viewer) => {
    const baseRange = viewer === state.player ? 340 : 230;
    const hillBonus = isOnHill(viewer) ? 90 : 0;
    const exposedPenalty = isOnHill(target) ? 35 : 0;
    const adjustedRange = isInBrush(target) ? (baseRange + hillBonus + exposedPenalty) * 0.48 : baseRange + hillBonus + exposedPenalty;
    return dist(viewer, target) < adjustedRange && hasLineOfSight(viewer, target);
  });
}

function isOnScreen(x, y, padding = 80) {
  return x >= state.camera.x - padding &&
    x <= state.camera.x + WIDTH + padding &&
    y >= state.camera.y - padding &&
    y <= state.camera.y + HEIGHT + padding;
}

function getCurrentObjectiveTarget() {
  if (state.selectedMission === "outpostDefense") return state.defendZone;
  if (state.selectedMission === "reconSweep") {
    if (state.objectivePhase === "reconAlpha") return state.reconA;
    if (state.objectivePhase === "reconBravo") return state.reconB;
    return state.extraction;
  }
  if (state.objectivePhase === "disableJammer") return state.jammer;
  if (state.objectivePhase === "retrieve") return state.intel;
  return state.extraction;
}

function getPhaseGuideText() {
  if (state.selectedMission === "outpostDefense") {
    return `방어 단계 · 잔여 웨이브 ${state.wavesRemaining} · 다음 증원 ${Math.max(0, Math.ceil(state.waveTimer))}초`;
  }
  if (state.selectedMission === "reconSweep") {
    if (state.objectivePhase === "reconAlpha") return "1단계 · 정찰 지점 A를 확보하라";
    if (state.objectivePhase === "reconBravo") return "2단계 · 정찰 지점 B를 확보하라";
    return "3단계 · 탈출 지점까지 복귀하라";
  }
  if (state.objectivePhase === "disableJammer") return "1단계 · 교란기를 찾아 파괴하라";
  if (state.objectivePhase === "retrieve") return "2단계 · 확보한 구역에서 정보 자료를 회수하라";
  return "3단계 · 탈출 지점까지 분대를 생존시켜 복귀하라";
}

function getInteractHint() {
  const p = state.player;
  const downedAlly = state.allies.find((ally) => ally.downed && dist(p, ally) < 42);
  if (downedAlly) return `${classConfigs[downedAlly.role].label} 회복 가능 · 작전 버튼 / E`;
  const supply = state.supplies.find((item) => !item.used && Math.hypot(p.x - item.x, p.y - item.y) < 40);
  if (supply) return supply.type === "ammo" ? "탄약 보급 가능 · 작전 버튼 / E" : "의무 보급품 사용 가능 · 작전 버튼 / E";
  if (state.selectedMission === "reconSweep") {
    if (state.reconA && !state.reconA.complete && Math.hypot(p.x - state.reconA.x, p.y - state.reconA.y) < 40) return "정찰 지점 A 확보 가능 · 작전 버튼 / E";
    if (state.reconB && !state.reconB.complete && Math.hypot(p.x - state.reconB.x, p.y - state.reconB.y) < 40) return "정찰 지점 B 확보 가능 · 작전 버튼 / E";
    if (state.objectivePhase === "extract" && state.extraction && Math.hypot(p.x - state.extraction.x, p.y - state.extraction.y) < 48) return "탈출 완료 가능 · 작전 버튼 / E";
  }
  if (state.selectedMission !== "outpostDefense") {
    if (state.jammer && !state.jammer.disabled && Math.hypot(p.x - state.jammer.x, p.y - state.jammer.y) < 42) return "교란기 파괴 가능 · 작전 버튼 / E";
    if (state.jammer?.disabled && state.intel && !state.intel.collected && Math.hypot(p.x - state.intel.x, p.y - state.intel.y) < 40) return "정보 자료 회수 가능 · 작전 버튼 / E";
    if (state.objectivePhase === "extract" && state.extraction && Math.hypot(p.x - state.extraction.x, p.y - state.extraction.y) < 48) return "탈출 완료 가능 · 작전 버튼 / E";
  }
  return "근처 목표나 보급품에 접근하면 상호작용 가능";
}

function getTutorialStepText() {
  if (state.tutorialCompleted || state.tutorialStep >= 99) return "";
  if (state.tutorialStep === 0) return "이동해보세요 · WASD 또는 좌측 스틱";
  if (state.tutorialStep === 1) return "조준해보세요 · 마우스 또는 우측 화면 드래그";
  if (state.tutorialStep === 2) return "사격해보세요 · 좌클릭 또는 사격 버튼";
  return "목표에 접근해 상호작용하세요 · E 또는 작전 버튼";
}

function updateTutorialProgress() {
  if (state.tutorialCompleted || state.tutorialStep >= 99 || !state.player) return;
  if (state.tutorialStep === 0) {
    const moved = Math.hypot(state.player.x - state.player.holdX, state.player.y - state.player.holdY);
    if (moved > 36 || input.up || input.down || input.left || input.right || Math.hypot(input.touchMoveX, input.touchMoveY) > 0.2) {
      state.tutorialStep = 1;
      announceSettingChange("튜토리얼 · 이동 완료", "#bde9ff");
    }
    return;
  }
  if (state.tutorialStep === 1) {
    const aimMoved = Math.hypot(input.mouseX - state.player.x, input.mouseY - state.player.y);
    if (aimMoved > 42 || input.touchAiming) {
      state.tutorialStep = 2;
      announceSettingChange("튜토리얼 · 조준 완료", "#bde9ff");
    }
    return;
  }
  if (state.tutorialStep === 2) {
    if (state.stats?.shots > 0) {
      state.tutorialStep = 3;
      announceSettingChange("튜토리얼 · 사격 완료", "#bde9ff");
    }
    return;
  }
  const objective = getCurrentObjectiveTarget();
  if (objective && Math.hypot(state.player.x - objective.x, state.player.y - objective.y) < 90) {
    state.tutorialCompleted = true;
    state.tutorialStep = 99;
    savePreferences();
    announceSettingChange("튜토리얼 완료", "#c7f0a2");
  }
}

function hasLineOfSight(a, b) {
  const steps = 18;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (state.cover.some((c) => pointInRect(x, y, c))) return false;
  }
  return true;
}

function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function circleRectCollision(unit, rect) {
  const closestX = clamp(unit.x, rect.x, rect.x + rect.w);
  const closestY = clamp(unit.y, rect.y, rect.y + rect.h);
  const dx = unit.x - closestX;
  const dy = unit.y - closestY;
  return dx * dx + dy * dy < unit.radius * unit.radius;
}

function resolveCollisions(unit) {
  unit.x = clamp(unit.x, unit.radius, WORLD_WIDTH - unit.radius);
  unit.y = clamp(unit.y, unit.radius, WORLD_HEIGHT - unit.radius);
  state.cover.forEach((rect) => {
    if (!circleRectCollision(unit, rect)) return;
    const centerX = clamp(unit.x, rect.x, rect.x + rect.w);
    const centerY = clamp(unit.y, rect.y, rect.y + rect.h);
    let dx = unit.x - centerX;
    let dy = unit.y - centerY;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    unit.x = centerX + dx * (unit.radius + 1);
    unit.y = centerY + dy * (unit.radius + 1);
  });
}

function shoot(shooter, angle) {
  if (shooter.cooldown > 0 || shooter.reloadTimer > 0 || shooter.ammo <= 0) return;
  shooter.cooldown = shooter.fireRate;
  shooter.ammo -= 1;
  if (shooter === state.player) state.stats.shots += 1;
  playShotSound(shooter);
  if (shooter === state.player) {
    state.recoilKick = Math.min(1, state.recoilKick + 0.55);
    state.cameraShakeTimer = 0.08;
    state.cameraShakeStrength = shooter.role === "heavy" ? 12 : shooter.role === "marksman" ? 7 : 9;
  }
  emitNoise(
    shooter.x,
    shooter.y,
    shooter.role === "heavy" ? 420 : shooter.role === "marksman" ? 320 : 360,
    shooter.team
  );
  const spread =
    shooter.role === "heavy"
      ? 0.14
      : shooter.role === "marksman"
      ? 0.02
      : shooter.role === "grenadier"
      ? 0.08
      : 0.05;
  const finalAngle = angle + (Math.random() - 0.5) * spread;
  const muzzleX = shooter.x + Math.cos(finalAngle) * (shooter.radius + 14);
  const muzzleY = shooter.y + Math.sin(finalAngle) * (shooter.radius + 14);
  const ballisticProfile =
    shooter.role === "heavy"
      ? { speed: 430, trailLength: 220, tracerWidth: 6, coreRadius: 4.5, muzzleLife: 0.1 }
      : shooter.role === "marksman"
      ? { speed: 560, trailLength: 260, tracerWidth: 4, coreRadius: 3, muzzleLife: 0.06 }
      : shooter.role === "grenadier"
      ? { speed: 440, trailLength: 170, tracerWidth: 4, coreRadius: 3.8, muzzleLife: 0.08 }
      : { speed: 450, trailLength: 180, tracerWidth: 5, coreRadius: 4, muzzleLife: 0.08 };
  state.bullets.push({
    x: muzzleX,
    y: muzzleY,
    vx: Math.cos(finalAngle) * ballisticProfile.speed,
    vy: Math.sin(finalAngle) * ballisticProfile.speed,
    team: shooter.team,
    damage: shooter.damage,
    life: 1.7,
    trailLength: ballisticProfile.trailLength,
    tracerWidth: ballisticProfile.tracerWidth,
    coreRadius: ballisticProfile.coreRadius,
    nearMissed: false,
  });
  state.effects.push({
    kind: "muzzle",
    x: muzzleX,
    y: muzzleY,
    angle: finalAngle,
    life: ballisticProfile.muzzleLife,
    scale: shooter.role === "heavy" ? 1.25 : shooter.role === "marksman" ? 0.8 : 1,
    color: shooter.team === "enemy" ? "#ffb2a0" : "#ffe7a0",
  });
  state.effects.push({
    kind: "tracer",
    x1: muzzleX,
    y1: muzzleY,
    x2: muzzleX + Math.cos(finalAngle) * ballisticProfile.trailLength,
    y2: muzzleY + Math.sin(finalAngle) * ballisticProfile.trailLength,
    life: 0.28,
    width: ballisticProfile.tracerWidth,
    color: shooter.team === "enemy" ? "#ff9e9e" : "#fff1a6",
  });
  if (shooter === state.player) updateHud();
}

function reload(unit) {
  if (unit.reloadTimer > 0 || unit.ammo === unit.magSize || unit.reserve <= 0) return;
  unit.reloadTimer = 1.2;
}

function finishReload(unit) {
  const needed = unit.magSize - unit.ammo;
  const amount = Math.min(needed, unit.reserve);
  unit.ammo += amount;
  unit.reserve -= amount;
  if (unit === state.player) updateHud();
}

function nearestEnemy(unit, range = 280) {
  let best = null;
  let bestD = range;
  state.enemies.forEach((enemy) => {
    if (enemy.hp <= 0) return;
    const d = dist(unit, enemy);
    const vision = range + (unit.visionBoost > 0 ? 120 : 0) + (isOnHill(unit) ? 80 : 0) + (isOnHill(enemy) ? 30 : 0);
    if (d < bestD && d < vision && hasLineOfSight(unit, enemy)) {
      best = enemy;
      bestD = d;
    }
  });
  return best;
}

function findEnemyInAimCone(unit, range = 340, cone = 0.6) {
  let best = null;
  let bestD = range;
  state.enemies.forEach((enemy) => {
    if (enemy.hp <= 0) return;
    const d = dist(unit, enemy);
    if (d > bestD || !hasLineOfSight(unit, enemy)) return;
    const angleTo = Math.atan2(enemy.y - unit.y, enemy.x - unit.x);
    let diff = Math.atan2(Math.sin(angleTo - unit.angle), Math.cos(angleTo - unit.angle));
    if (Math.abs(diff) <= cone / 2) {
      best = enemy;
      bestD = d;
    }
  });
  return best;
}

function nearestPlayerTarget(enemy, range = 260) {
  const candidates = [state.player, ...state.allies].filter((u) => u.hp > 0);
  let best = null;
  let bestD = range;
  candidates.forEach((u) => {
    const d = dist(enemy, u);
    const detectionRange = range + (isOnHill(enemy) ? 70 : 0) + (isOnHill(u) ? 25 : 0);
    const brushFactor = isInBrush(u) ? 0.6 : 1;
    if (d < bestD && d < detectionRange * brushFactor && hasLineOfSight(enemy, u)) {
      best = u;
      bestD = d;
    }
  });
  return best;
}

function setSquadCommand(command) {
  state.squadCommand = command;
  if (command === "hold") {
    state.allies.forEach((ally) => {
      ally.holdX = ally.x;
      ally.holdY = ally.y;
    });
  }
  commandButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.command === command));
  savePreferences();
  updateHud();
}

function togglePause(forceValue = null) {
  if (state.gameOver || state.victory) return;
  const nextPaused = forceValue === null ? !state.paused : !!forceValue;
  if (state.paused === nextPaused) return;
  state.paused = nextPaused;
  if (state.paused) {
    releaseTransientInputs();
    playUiChirp(520, 360, 0.018);
  } else {
    state.lastTime = performance.now();
    playUiChirp(620, 880, 0.018);
  }
  updateHud();
  announceSettingChange(state.paused ? "일시정지" : "계속 진행", "#ffe7a8");
}

function toggleAudioMuted(forceValue = null) {
  state.audioMuted = forceValue === null ? !state.audioMuted : !!forceValue;
  savePreferences();
  updateHud();
  announceSettingChange(state.audioMuted ? "오디오 음소거" : "오디오 켜짐", "#b6e3ff");
}

function toggleMinimap(forceValue = null) {
  state.minimapVisible = forceValue === null ? !state.minimapVisible : !!forceValue;
  savePreferences();
  updateHud();
  announceSettingChange(state.minimapVisible ? "미니맵 표시" : "미니맵 숨김", "#d8f0a8");
}

function toggleHud(forceValue = null) {
  state.hudVisible = forceValue === null ? !state.hudVisible : !!forceValue;
  document.body.classList.toggle("hud-collapsed", !state.hudVisible);
  savePreferences();
  updateHud();
  announceSettingChange(state.hudVisible ? "HUD 표시" : "HUD 숨김", "#f5e7a8");
}

function toggleScreenShake(forceValue = null) {
  state.screenShakeEnabled = forceValue === null ? !state.screenShakeEnabled : !!forceValue;
  if (!state.screenShakeEnabled) {
    state.cameraShakeTimer = 0;
    state.cameraShakeStrength = 0;
  }
  savePreferences();
  updateHud();
  announceSettingChange(state.screenShakeEnabled ? "화면 흔들림 켜짐" : "화면 흔들림 꺼짐", "#ffd39a");
}

function cycleDifficulty() {
  const order = ["easy", "normal", "hard"];
  const currentIndex = order.indexOf(state.difficulty);
  state.difficulty = order[(currentIndex + 1) % order.length];
  savePreferences();
  resetGame();
  announceSettingChange(`난이도 ${difficultyPresets[state.difficulty].label}`, "#ffdf8f");
}

function restoreDefaultPreferences() {
  state.selectedClass = "rifleman";
  state.selectedMission = "intelRaid";
  state.squadCommand = "follow";
  state.audioMuted = false;
  state.minimapVisible = true;
  state.hudVisible = true;
  state.screenShakeEnabled = true;
  state.difficulty = "normal";
  state.objectivePointerVisible = true;
  state.performanceMode = false;
  document.body.classList.remove("hud-collapsed");
  savePreferences();
  resetGame();
  setSquadCommand("follow");
  announceSettingChange("기본 설정 복원", "#d7ffd0");
}

function updateFullscreenButton() {
  fullscreenBtn.textContent = document.fullscreenElement ? "전체화면 종료" : "전체화면";
}

function setButtonHint(button, label, hint = "") {
  if (!button) return;
  const fullLabel = hint ? `${label} (${hint})` : label;
  button.title = fullLabel;
  button.setAttribute("aria-label", fullLabel);
}

function announceSettingChange(text, color = "#c7f0a2") {
  triggerEventBanner(text, color, 1.4);
}

function updateControlHints() {
  setButtonHint(perfBtn, state.performanceMode ? "경량 모드 켜짐" : "경량 모드 꺼짐");
  setButtonHint(difficultyBtn, `난이도: ${difficultyPresets[state.difficulty].label}`, "N");
  setButtonHint(defaultsBtn, "기본 설정 복원");
  setButtonHint(shakeBtn, state.screenShakeEnabled ? "화면 흔들림 켜짐" : "화면 흔들림 꺼짐");
  setButtonHint(hudBtn, state.hudVisible ? "HUD 숨기기" : "HUD 보이기", "H");
  setButtonHint(minimapBtn, state.minimapVisible ? "미니맵 숨기기" : "미니맵 보이기", "M");
  setButtonHint(fullscreenBtn, document.fullscreenElement ? "전체화면 종료" : "전체화면", "F");
  setButtonHint(audioBtn, state.audioMuted ? "오디오 음소거 해제" : "오디오 켜짐", "O");
  setButtonHint(pauseBtn, state.paused ? "계속하기" : "일시정지", "P / Esc");
  setButtonHint(restartBtn, "현재 작전 다시 시작");
  setButtonHint(fireBtn, "사격");
  setButtonHint(skillBtn, "스킬 사용");
  setButtonHint(interactBtn, "작전 상호작용");
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch {}
  updateFullscreenButton();
  updateControlHints();
  announceSettingChange(document.fullscreenElement ? "전체화면 시작" : "전체화면 종료", "#b8f5ff");
}

function alertNearbyEnemies(origin, radius = 180) {
  state.enemies.forEach((enemy) => {
    if (enemy.hp > 0 && dist(origin, enemy) < radius) enemy.alert = "alert";
  });
}

function broadcastEnemyContact(caller, target, radius = 260) {
  state.enemies.forEach((enemy) => {
    if (enemy === caller || enemy.hp <= 0) return;
    if (Math.hypot(enemy.x - caller.x, enemy.y - caller.y) > radius) return;
    enemy.alert = "search";
    enemy.lastKnownTargetX = target.x;
    enemy.lastKnownTargetY = target.y;
    enemy.searchTimer = Math.max(enemy.searchTimer, 3.6);
  });
}

function emitNoise(x, y, radius, sourceTeam = "player") {
  const sourceUnit = sourceTeam === "player"
    ? state.player
    : sourceTeam === "ally"
    ? state.allies.find((a) => Math.hypot(a.x - x, a.y - y) < 8) || null
    : state.enemies.find((e) => Math.hypot(e.x - x, e.y - y) < 8) || null;
  const adjustedRadius = sourceUnit && isInBrush(sourceUnit) ? radius * 0.72 : radius;
  state.noiseBursts.push({ x, y, radius: adjustedRadius, life: 0.55, sourceTeam });
}

function findNearestCover(unit) {
  let best = null;
  let bestD = Infinity;
  state.cover.forEach((cover) => {
    const cx = cover.x + cover.w / 2;
    const cy = cover.y + cover.h / 2;
    const d = Math.hypot(unit.x - cx, unit.y - cy);
    if (d < bestD) {
      best = { x: cx, y: cy, rect: cover };
      bestD = d;
    }
  });
  return best;
}

function moveToward(unit, tx, ty, speedFactor, dt) {
  const angle = Math.atan2(ty - unit.y, tx - unit.x);
  unit.x += Math.cos(angle) * unit.speed * speedFactor * dt;
  unit.y += Math.sin(angle) * unit.speed * speedFactor * dt;
  unit.angle = angle;
}

function triggerScreenFlash(color, amount) {
  state.screenFlashColor = color;
  state.screenFlashTimer = Math.max(state.screenFlashTimer, amount);
}

function triggerExplosion(x, y, radius, damage, sourceTeam) {
  playExplosionSound(sourceTeam === "enemy" ? 1 : 0.9);
  emitNoise(x, y, radius * 7, sourceTeam);
  state.effects.push({ x, y, r: radius, life: 0.45, color: "#ffbb66" });
  state.effects.push({ kind: "shockwave", x, y, r: radius * 1.4, life: 0.42, color: "#ffb866" });
  state.effects.push({ kind: "burst", x, y, r: radius * 0.75, life: 0.24, color: "#ffd3a0" });
  if (Math.hypot(state.player.x - x, state.player.y - y) < radius * 2.2) {
    triggerScreenFlash("rgba(255,178,102,0.24)", 0.18);
  }
  const targets = sourceTeam === "enemy" ? [state.player, ...state.allies] : state.enemies;
  targets.forEach((unit) => {
    if (unit.hp <= 0 || unit.downed) return;
    const d = Math.hypot(unit.x - x, unit.y - y);
    if (d < radius) {
      unit.hp -= damage * (1 - d / radius);
      if (unit.team !== "enemy" && unit !== state.player && unit.hp <= 0) {
        unit.downed = true;
        unit.hp = unit.maxHp * 0.25;
        unit.bleedout = 12;
      }
    }
  });
  updateHud();
}

function toggleObjectivePointer(forceValue = null) {
  state.objectivePointerVisible = forceValue === null ? !state.objectivePointerVisible : !!forceValue;
  savePreferences();
  updateHud();
  announceSettingChange(
    state.objectivePointerVisible ? "목표 화살표 표시" : "목표 화살표 숨김",
    "#d2f0ff"
  );
}

function togglePerformanceMode(forceValue = null) {
  state.performanceMode = forceValue === null ? !state.performanceMode : !!forceValue;
  savePreferences();
  updateHud();
  announceSettingChange(state.performanceMode ? "경량 모드 켜짐" : "경량 모드 꺼짐", "#ffd2f5");
}

function togglePerfStats(forceValue = null) {
  state.perfStatsVisible = forceValue === null ? !state.perfStatsVisible : !!forceValue;
  savePreferences();
  announceSettingChange(state.perfStatsVisible ? "성능 통계 표시" : "성능 통계 숨김", "#b8f5ff");
}

function launchProjectile(kind, x, y, angle, distance, speed, color) {
  const tx = x + Math.cos(angle) * distance;
  const ty = y + Math.sin(angle) * distance;
  const dx = tx - x;
  const dy = ty - y;
  const len = Math.hypot(dx, dy) || 1;
  state.projectiles.push({
    kind,
    x,
    y,
    tx,
    ty,
    vx: (dx / len) * speed,
    vy: (dy / len) * speed,
    color,
    radius: kind === "flashbang" ? 11 : 9,
  });
}

function usePlayerSkill() {
  const p = state.player;
  if (p.skillCooldown > 0 || state.gameOver || state.victory || state.paused) return;
  const cfg = classConfigs[p.role];
  p.skillCooldown = cfg.skillCooldown;

  if (p.role === "medic") {
    [p, ...state.allies].forEach((u) => {
      if (dist(p, u) < 90 && u.hp > 0) {
        u.hp = Math.min(u.maxHp, u.hp + 32);
      }
    });
    state.effects.push({ kind: "pulse", x: p.x, y: p.y, r: 96, life: 0.55, color: "#9cffb8" });
    setMessage("의무병 치료 실시");
  } else if (p.role === "engineer") {
    state.cover.push(makeRect(p.x + Math.cos(p.angle) * 28 - 22, p.y + Math.sin(p.angle) * 28 - 10, 44, 20, "placedCover"));
    state.effects.push({ kind: "pulse", x: p.x + Math.cos(p.angle) * 28, y: p.y + Math.sin(p.angle) * 28, r: 54, life: 0.45, color: "#ffd27a" });
    setMessage("공병 엄폐물 설치");
  } else if (p.role === "scout") {
    p.visionBoost = 9;
    launchProjectile("scoutPulse", p.x + Math.cos(p.angle) * 22, p.y + Math.sin(p.angle) * 22, p.angle, 180, 360, "#c88cff");
    setMessage("정찰 드론으로 적 위치 노출");
  } else {
    launchProjectile("flashbang", p.x + Math.cos(p.angle) * 22, p.y + Math.sin(p.angle) * 22, p.angle, 210, 340, "#fff1a6");
    setMessage("섬광탄 투척");
  }

  updateHud();
}

function updatePlayer(dt) {
  const p = state.player;
  let dx = 0;
  let dy = 0;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  dx += input.touchMoveX;
  dy += input.touchMoveY;

  const len = Math.hypot(dx, dy) || 1;
  p.vx = (dx / len) * p.speed;
  p.vy = (dy / len) * p.speed;
  if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) {
    p.vx = 0;
    p.vy = 0;
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;

  if (input.touchAiming) {
    p.angle = Math.atan2(input.mouseY - p.y, input.mouseX - p.x);
  } else if ("ontouchstart" in window) {
    if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
      p.angle = Math.atan2(dy, dx);
    }
  } else {
    p.angle = Math.atan2(input.mouseY - p.y, input.mouseX - p.x);
  }
  resolveCollisions(p);

  if (input.fire) {
    if ("ontouchstart" in window) {
      const autoEnemy = nearestEnemy(p, 320);
      if (autoEnemy) {
        p.angle = Math.atan2(autoEnemy.y - p.y, autoEnemy.x - p.x);
      }
    }
    shoot(p, p.angle);
  }

  if (input.touchAiming && !input.fire) {
    const target = findEnemyInAimCone(p, 360, 0.72);
    if (target || p.role === "heavy" || p.role === "marksman") {
      shoot(p, p.angle);
    }
  }
  if (p.ammo <= 0) reload(p);
  if (input.interact) handleInteract();
}

function updateAlly(ally, dt, index) {
  if (ally.hp <= 0 && !ally.downed) return;
  if (ally.downed) {
    ally.bleedout -= dt;
    if (ally.bleedout <= 0) {
      ally.hp = 0;
      ally.downed = false;
    }
    const medic = [state.player, ...state.allies].find((u) => u.role === "medic" && !u.downed && u.hp > 0 && dist(u, ally) < 45);
    if (medic) {
      ally.hp = Math.min(ally.maxHp * 0.45, ally.hp + 24 * dt);
      if (ally.hp >= ally.maxHp * 0.4) {
        ally.downed = false;
        setMessage(`${classConfigs[ally.role].label} 복귀`);
      }
    }
    return;
  }

  const anchor = index === 0 ? state.player : state.allies[index - 1] || state.player;
  let desiredX = anchor.x - 38 + (index % 2) * 28;
  let desiredY = anchor.y + 34 + index * 6;

  if (state.squadCommand === "hold") {
    desiredX = ally.holdX;
    desiredY = ally.holdY;
  }
  if (state.squadCommand === "assault") {
    const pushTarget = state.selectedMission === "outpostDefense"
      ? nearestEnemy(ally, 700) || { x: 2200, y: 1500 }
      : state.objectivePhase === "disableJammer"
      ? state.jammer
      : !state.intel?.collected
      ? state.intel
      : state.extraction || { x: 260, y: 260 };
    desiredX = pushTarget.x;
    desiredY = pushTarget.y;
  }

  const enemy = nearestEnemy(ally, ally.role === "scout" ? 320 : 250);
  if (enemy) {
    enemy.alert = "alert";
    ally.angle = Math.atan2(enemy.y - ally.y, enemy.x - ally.x);
    if (state.squadCommand !== "hold" && dist(ally, enemy) > 120) {
      ally.x += Math.cos(ally.angle) * ally.speed * 0.45 * dt;
      ally.y += Math.sin(ally.angle) * ally.speed * 0.45 * dt;
    }
    shoot(ally, ally.angle);
  } else {
    const angle = Math.atan2(desiredY - ally.y, desiredX - ally.x);
    const d = Math.hypot(desiredX - ally.x, desiredY - ally.y);
    if (d > 14) {
      ally.x += Math.cos(angle) * ally.speed * 0.8 * dt;
      ally.y += Math.sin(angle) * ally.speed * 0.8 * dt;
      ally.angle = angle;
    }
  }

  if (ally.role === "medic") {
    const wounded = [state.player, ...state.allies].find((u) => !u.downed && u.hp > 0 && u.hp < u.maxHp * 0.65 && dist(u, ally) < 90);
    if (wounded) wounded.hp = Math.min(wounded.maxHp, wounded.hp + 8 * dt);
  }

  if (ally.ammo <= 0) reload(ally);
  resolveCollisions(ally);
}

function updateEnemy(enemy, dt) {
  if (enemy.hp <= 0) return;
  const detectionRange = state.selectedMission === "outpostDefense" ? 320 : 240;
  const target = nearestPlayerTarget(enemy, enemy.alert === "alert" ? detectionRange + 80 : detectionRange);
  if (target) {
    enemy.target = target;
    enemy.alert = "alert";
    enemy.lastKnownTargetX = target.x;
    enemy.lastKnownTargetY = target.y;
    enemy.searchTimer = 4.5;
    broadcastEnemyContact(enemy, target, enemy.role === "marksman" ? 320 : 270);
    enemy.angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    const d = dist(enemy, target);
    const lowHp = enemy.hp < enemy.maxHp * 0.4;
    const nearestCover = findNearestCover(enemy);

    if (lowHp && nearestCover && d < 220) {
      moveToward(enemy, nearestCover.x, nearestCover.y, 0.8, dt);
    } else if (d > enemy.preferredRange + 10) {
      const flankOffset = enemy.role === "rifleman" ? (Math.sin(performance.now() * 0.001 + enemy.x) > 0 ? 42 : -42) : 0;
      moveToward(enemy, target.x + flankOffset, target.y - flankOffset * 0.3, 0.55, dt);
    } else if (d < enemy.preferredRange - 28) {
      moveToward(enemy, enemy.x - Math.cos(enemy.angle) * 60, enemy.y - Math.sin(enemy.angle) * 60, 0.45, dt);
    }

    if (enemy.role === "grenadier" && enemy.specialCooldown <= 0 && d > 120 && d < 260) {
      triggerExplosion(target.x + (Math.random() - 0.5) * 28, target.y + (Math.random() - 0.5) * 28, 46, 22, "enemy");
      enemy.specialCooldown = 6.5;
      setMessage("적 유탄병이 폭발 공격을 감행했다!", 1.8);
    } else {
      if (enemy.role === "heavy") {
        enemy.cooldown = Math.max(enemy.cooldown - dt * 0.35, 0);
      }
      shoot(enemy, enemy.angle);
    }

    if (enemy.role === "marksman" && nearestCover && d < 190) {
      moveToward(enemy, nearestCover.x, nearestCover.y, 0.5, dt);
    }
  } else {
    const heardNoise = state.noiseBursts.find((noise) =>
      noise.sourceTeam !== "enemy" && Math.hypot(enemy.x - noise.x, enemy.y - noise.y) < noise.radius
    );
    if (heardNoise) {
      enemy.lastKnownTargetX = heardNoise.x;
      enemy.lastKnownTargetY = heardNoise.y;
      enemy.searchTimer = Math.max(enemy.searchTimer, 3.2);
      enemy.alert = "search";
    }
    if (enemy.searchTimer > 0) {
      enemy.searchTimer -= dt;
      enemy.alert = "search";
      const searchPoint = { x: enemy.lastKnownTargetX, y: enemy.lastKnownTargetY };
      const d = dist(enemy, searchPoint);
      if (d > 18) {
        moveToward(enemy, searchPoint.x, searchPoint.y, 0.48, dt);
      } else {
        enemy.angle += dt * 1.8;
      }
    } else if (enemy.patrol && enemy.patrol.length > 0) {
      const point = enemy.patrol[enemy.patrolIndex];
      const d = Math.hypot(point.x - enemy.x, point.y - enemy.y);
      if (d < 10) {
        enemy.patrolIndex = (enemy.patrolIndex + 1) % enemy.patrol.length;
      } else {
        moveToward(enemy, point.x, point.y, 0.38, dt);
      }
    } else {
      enemy.alert = "idle";
      enemy.aiTimer -= dt;
      if (enemy.aiTimer <= 0) {
        enemy.aiTimer = 1.5 + Math.random() * 2;
        enemy.angle = Math.random() * Math.PI * 2;
      }
      enemy.x += Math.cos(enemy.angle) * 28 * dt;
      enemy.y += Math.sin(enemy.angle) * 28 * dt;
    }
  }

  if (enemy.ammo <= 0) reload(enemy);
  resolveCollisions(enemy);
}

function updateUnitsCooldowns(units, dt) {
  units.forEach((u) => {
    u.hitFlash = Math.max(0, u.hitFlash - dt * 3.2);
    u.hitScale = Math.max(0, u.hitScale - dt * 5.2);
    if (u.deathTimer > 0) u.deathTimer = Math.max(0, u.deathTimer - dt);
    if (u.downed) return;
    u.cooldown = Math.max(0, u.cooldown - dt);
    u.skillCooldown = Math.max(0, u.skillCooldown - dt);
    u.specialCooldown = Math.max(0, u.specialCooldown - dt);
    if (u.visionBoost > 0) u.visionBoost = Math.max(0, u.visionBoost - dt);
    if (u.reloadTimer > 0) {
      u.reloadTimer -= dt;
      if (u.reloadTimer <= 0) finishReload(u);
    }
  });
}

function updateBullets(dt) {
  state.bullets.forEach((b) => {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.team === "enemy" && !b.nearMissed && state.player.hp > 0) {
      const d = Math.hypot(b.x - state.player.x, b.y - state.player.y);
      if (d > state.player.radius + 8 && d < 42) {
        b.nearMissed = true;
        state.nearMissTimer = Math.max(state.nearMissTimer, 0.14);
      }
    }
  });

  state.bullets = state.bullets.filter((b) => {
    if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD_WIDTH || b.y > WORLD_HEIGHT) return false;

    for (const c of state.cover) {
      if (pointInRect(b.x, b.y, c)) {
        if (c.hp !== Infinity) c.hp -= b.damage * 0.8;
        return false;
      }
    }

    const targets = b.team === "enemy" ? [state.player, ...state.allies] : state.enemies;
    for (const t of targets) {
      if (t.hp <= 0 || t.downed) continue;
      if (Math.hypot(b.x - t.x, b.y - t.y) <= t.radius) {
        t.hp -= b.damage;
        t.hitFlash = Math.max(t.hitFlash, 0.85);
        t.hitScale = Math.max(t.hitScale, 1);
        if (b.team === "player") {
          state.stats.hits += 1;
          state.hitMarkerTimer = 0.12;
          state.hitStopTimer = Math.max(state.hitStopTimer, 0.024);
        }
        if (b.team === "enemy" && t === state.player) {
          state.playerDamageTimer = 0.28;
        }
        if (b.team !== "enemy") alertNearbyEnemies(t, 220);
        if (t.team !== "enemy" && t !== state.player && t.hp <= 0) {
          t.downed = true;
          t.hp = t.maxHp * 0.25;
          t.bleedout = 12;
          setMessage(`${classConfigs[t.role].label} 다운! 접근하여 회복하라`);
        }
        if (t.team === "enemy" && t.hp <= 0 && b.team === "player") {
          state.stats.kills += 1;
          t.deathTimer = 0.7;
          t.deathTilt = (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 0.35);
          state.hitStopTimer = Math.max(state.hitStopTimer, 0.05);
          state.killMarkerTimer = 0.24;
          state.killBannerTimer = 0.75;
          state.killBannerText = `${classConfigs[t.role]?.label || "적"} 처치`;
          state.cameraShakeTimer = 0.12;
          state.cameraShakeStrength = Math.max(state.cameraShakeStrength, 14);
          state.effects.push({ kind: "shockwave", x: t.x, y: t.y, r: 56, life: 0.22, color: "#ff9a9a" });
        }
        state.effects.push({
          kind: "damageText",
          x: t.x,
          y: t.y - 14,
          vy: -28,
          life: 0.55,
          text: `${Math.max(1, Math.round(b.damage))}`,
          color: t.team === "enemy" ? "#fff1a6" : "#ffb3b3",
        });
        state.effects.push({ kind: "impact", x: t.x, y: t.y, r: 18, life: 0.22, color: b.team === "enemy" ? "#ff8787" : "#ffe08a" });
        state.effects.push({ x: t.x, y: t.y, r: 15, life: 0.2, color: "#ff6b6b" });
        updateHud();
        return false;
      }
    }
    return true;
  });

  state.cover = state.cover.filter((c) => c.hp > 0);
}

function updateProjectiles(dt) {
  state.projectiles.forEach((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  });

  state.projectiles = state.projectiles.filter((p) => {
    const arrived = Math.hypot(p.tx - p.x, p.ty - p.y) < 16;
    if (!arrived) return true;

    if (p.kind === "flashbang") {
      playExplosionSound(0.8);
      emitNoise(p.x, p.y, 420, "player");
      state.effects.push({ kind: "flash", x: p.x, y: p.y, r: 140, life: 0.65, color: "#fff1a6" });
      state.effects.push({ kind: "shockwave", x: p.x, y: p.y, r: 180, life: 0.4, color: "#fff4b8" });
      state.effects.push({ kind: "burst", x: p.x, y: p.y, r: 92, life: 0.2, color: "#fffdf0" });
      if (Math.hypot(state.player.x - p.x, state.player.y - p.y) < 220) {
        triggerScreenFlash("rgba(255,248,220,0.42)", 0.2);
      }
      state.enemies.forEach((e) => {
        if (Math.hypot(e.x - p.x, e.y - p.y) < 190) e.cooldown += 1.2;
      });
    } else if (p.kind === "scoutPulse") {
      playUiChirp(540, 860, 0.018);
      state.effects.push({ kind: "pulse", x: p.x, y: p.y, r: 220, life: 0.9, color: "#c88cff" });
      state.enemies.forEach((e) => {
        if (Math.hypot(e.x - p.x, e.y - p.y) < 420) {
          state.effects.push({ kind: "marker", x: e.x, y: e.y, r: 18, life: 1.5, color: "#d29bff" });
        }
      });
    }
    return false;
  });
}

function updateEffects(dt) {
  state.effects.forEach((e) => {
    e.life -= dt;
    if (e.kind === "damageText") e.y += e.vy * dt;
  });
  state.effects = state.effects.filter((e) => e.life > 0);
  state.noiseBursts.forEach((n) => (n.life -= dt));
  state.noiseBursts = state.noiseBursts.filter((n) => n.life > 0);
  if (state.screenFlashTimer > 0) state.screenFlashTimer = Math.max(0, state.screenFlashTimer - dt);
}

function handleInteract() {
  input.interact = false;
  const p = state.player;
  const downedAlly = state.allies.find((ally) => ally.downed && dist(p, ally) < 42);
  if (downedAlly) {
    downedAlly.downed = false;
    downedAlly.hp = downedAlly.maxHp * 0.55;
    state.stats.revives += 1;
    setMessage(`${classConfigs[downedAlly.role].label} 회복 완료`);
    updateHud();
    return;
  }

  const supply = state.supplies.find((item) => !item.used && Math.hypot(p.x - item.x, p.y - item.y) < 40);
  if (supply) {
    supply.used = true;
    if (supply.type === "ammo") {
      p.reserve += 30;
      setMessage("탄약 보급 완료");
    } else {
      [p, ...state.allies].forEach((unit) => {
        if (unit.hp > 0) unit.hp = Math.min(unit.maxHp, unit.hp + 30);
      });
      setMessage("의무 보급품 사용");
    }
    updateHud();
    return;
  }

  if (state.selectedMission === "outpostDefense") return;

  if (state.selectedMission === "reconSweep") {
    if (state.reconA && !state.reconA.complete && Math.hypot(p.x - state.reconA.x, p.y - state.reconA.y) < 40) {
      state.reconA.complete = true;
      state.objectivePhase = "reconBravo";
      setMessage("정찰 지점 A 확보 완료. 다음 지점으로 이동하라", 4);
      triggerEventBanner("정찰 지점 A 확보", "#9fe7ff", 2.6);
      updateHud();
      return;
    }
    if (state.reconB && !state.reconB.complete && Math.hypot(p.x - state.reconB.x, p.y - state.reconB.y) < 40) {
      state.reconB.complete = true;
      state.objectivePhase = "extract";
      state.enemies.push(
        createUnit(3300, 880, "enemy", "rifleman", { color: "#ff7c7c", hp: 78, maxHp: 78 }),
        createUnit(3440, 980, "enemy", "marksman", { color: "#ff8ad8", hp: 82, maxHp: 82 })
      );
      setMessage("정찰 지점 B 확보 완료. 탈출 지점으로 복귀하라", 4);
      triggerEventBanner("정찰 완료 · 탈출 단계 시작", "#b6f7ff", 2.8);
      updateHud();
      return;
    }
    if (state.objectivePhase === "extract" && state.extraction && Math.hypot(p.x - state.extraction.x, p.y - state.extraction.y) < 48) {
      state.victory = true;
      if (!state.stats.finishedAt) state.stats.finishedAt = performance.now();
      setMessage("정찰 성공! 수집한 정보를 회수했다", 10);
      triggerEventBanner("정찰 임무 완수", "#b8ffbe", 3.2);
      return;
    }
  }

  if (state.jammer && !state.jammer.disabled && Math.hypot(p.x - state.jammer.x, p.y - state.jammer.y) < 42) {
    state.jammer.disabled = true;
    state.objectivePhase = "retrieve";
    state.enemies.push(
      createUnit(2340, 1540, "enemy", "rifleman", { color: "#ff7c7c", hp: 74, maxHp: 74 }),
      createUnit(2460, 1490, "enemy", "grenadier", { color: "#ffb05e", hp: 92, maxHp: 92, damage: 20 })
    );
    setMessage("교란기 파괴 완료. 자료를 확보하라", 4);
    triggerEventBanner("1단계 완료 · 자료 확보로 전환", "#ffd78a", 2.8);
    updateHud();
    return;
  }

  if (state.jammer?.disabled && !state.intel.collected && Math.hypot(p.x - state.intel.x, p.y - state.intel.y) < 40) {
    state.intel.collected = true;
    state.objectivePhase = "extract";
    state.enemies.push(
      createUnit(3220, 980, "enemy", "rifleman", { color: "#ff7c7c", hp: 85, maxHp: 85, damage: 18 }),
      createUnit(3380, 1760, "enemy", "rifleman", { color: "#ff7c7c", hp: 85, maxHp: 85, damage: 18 })
    );
    setMessage("정보 자료 확보. 탈출 지점으로 복귀하라", 4);
    triggerEventBanner("2단계 완료 · 탈출 단계 시작", "#ffe69a", 2.8);
    updateHud();
    return;
  }

  if (state.objectivePhase === "extract" && Math.hypot(p.x - state.extraction.x, p.y - state.extraction.y) < 48) {
    state.victory = true;
    if (!state.stats.finishedAt) state.stats.finishedAt = performance.now();
    setMessage("작전 성공! 분대가 임무를 완수했다", 10);
    triggerEventBanner("임무 완수", "#b8ffbe", 3.2);
  }
}

function checkGameState() {
  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.gameOver = true;
    if (!state.stats.finishedAt) state.stats.finishedAt = performance.now();
    setMessage("작전 실패. 재정비 후 다시 투입하라", 10);
  }
  if (state.selectedMission === "outpostDefense") {
    if (state.missionClock <= 0) {
      state.victory = true;
      if (!state.stats.finishedAt) state.stats.finishedAt = performance.now();
      setMessage("방어 성공! 전초기지를 지켜냈다", 10);
    }
  } else if (!state.victory && state.intel.collected && state.enemies.every((e) => e.hp <= 0)) {
    setMessage("적을 정리했다. 탈출 지점으로 복귀하라");
  }
}

function update(dt) {
  if (state.gameOver || state.victory) return;

  updateUnitsCooldowns([state.player, ...state.allies, ...state.enemies], dt);
  updatePlayer(dt);
  state.allies.forEach((ally, index) => updateAlly(ally, dt, index));
  state.enemies.forEach((enemy) => updateEnemy(enemy, dt));
  updateBullets(dt);
  updateProjectiles(dt);
  updateEffects(dt);

  if (state.selectedMission === "outpostDefense") {
    state.missionClock = Math.max(0, state.missionClock - dt);
    state.waveTimer -= dt;
    if (state.waveTimer <= 0 && state.wavesRemaining > 0) {
      state.waveTimer = 28;
      state.wavesRemaining -= 1;
      state.enemies.push(
        createUnit(1940, 360 + Math.random() * 120, "enemy", "grenadier", { color: "#ff9c6b", hp: 96, maxHp: 96, damage: 18 }),
        createUnit(1980, 650 + Math.random() * 90, "enemy", "rifleman", { color: "#ff7c7c", hp: 72, maxHp: 72 }),
        createUnit(1940, 960 + Math.random() * 120, "enemy", "heavy", { color: "#ff6b6b", hp: 148, maxHp: 148, damage: 18 })
      );
      setMessage("적 증원 도착! 방어선을 유지하라");
      triggerEventBanner(`적 증원 도착 · 잔여 웨이브 ${state.wavesRemaining}`, "#ffb0a0", 2.6);
    }
  }

  const alertCount = state.enemies.filter((enemy) => enemy.hp > 0 && enemy.alert === "alert").length;
  state.alertLevel = alertCount >= 4 ? "높음" : alertCount >= 2 ? "중간" : "낮음";
  checkGameState();
  updateCamera();

  if (state.messageTimer > 0) state.messageTimer -= dt;
  if (state.hitMarkerTimer > 0) state.hitMarkerTimer = Math.max(0, state.hitMarkerTimer - dt);
  if (state.killMarkerTimer > 0) state.killMarkerTimer = Math.max(0, state.killMarkerTimer - dt);
  if (state.killBannerTimer > 0) state.killBannerTimer = Math.max(0, state.killBannerTimer - dt);
  if (state.playerDamageTimer > 0) state.playerDamageTimer = Math.max(0, state.playerDamageTimer - dt);
  if (state.nearMissTimer > 0) state.nearMissTimer = Math.max(0, state.nearMissTimer - dt);
  if (state.eventBannerTimer > 0) state.eventBannerTimer = Math.max(0, state.eventBannerTimer - dt);
  if (state.recoilKick > 0) state.recoilKick = Math.max(0, state.recoilKick - dt * 3.4);
  if (state.cameraShakeTimer > 0) state.cameraShakeTimer = Math.max(0, state.cameraShakeTimer - dt);
  updateTutorialProgress();
  updateHud();
}

function drawGrid() {
  if (state.performanceMode) return;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  const startX = Math.floor(state.camera.x / 40) * 40;
  const endX = state.camera.x + WIDTH;
  const startY = Math.floor(state.camera.y / 40) * 40;
  const endY = state.camera.y + HEIGHT;
  ctx.beginPath();
  for (let x = startX; x < endX; x += 40) {
    ctx.moveTo(x - state.camera.x, 0);
    ctx.lineTo(x - state.camera.x, HEIGHT);
  }
  for (let y = startY; y < endY; y += 40) {
    ctx.moveTo(0, y - state.camera.y);
    ctx.lineTo(WIDTH, y - state.camera.y);
  }
  ctx.stroke();
}

function drawRoundedRect(x, y, w, h, r, fill, stroke = null) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawCoverVisual(c) {
  const x = c.x - state.camera.x;
  const y = c.y - state.camera.y;
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.roundRect(x + 8, y + 8, c.w, c.h, 10);
  ctx.fill();

  if (c.type === "building") {
    drawRoundedRect(x, y, c.w, c.h, 10, "#8a949e", "#d7dfe6");
    drawRoundedRect(x + 8, y + 8, c.w - 16, c.h - 16, 8, "#6f7881");
    ctx.fillStyle = "rgba(255,255,255,0.09)";
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 14);
    ctx.lineTo(x + c.w - 14, y + 14);
    ctx.lineTo(x + c.w - 26, y + 26);
    ctx.lineTo(x + 22, y + 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#5a4742";
    ctx.fillRect(x + c.w * 0.42, y + c.h - 34, 18, 26);
    ctx.fillStyle = "rgba(35,25,22,0.45)";
    ctx.fillRect(x + c.w * 0.42 + 12, y + c.h - 34, 4, 26);
    ctx.fillStyle = "rgba(210,230,255,0.28)";
    for (let row = 0; row < Math.max(1, Math.floor(c.h / 48)); row++) {
      for (let col = 0; col < Math.max(1, Math.floor(c.w / 42)); col++) {
        ctx.fillRect(x + 14 + col * 34, y + 14 + row * 28, 14, 10);
      }
    }
    return;
  }

  if (c.type === "sandbag") {
    drawRoundedRect(x, y, c.w, c.h, 8, "#bea978", "#e4d1a2");
    ctx.strokeStyle = "rgba(100,75,35,0.45)";
    for (let i = 1; i < Math.floor(c.w / 18); i++) {
      const sx = x + i * 18;
      ctx.beginPath();
      ctx.moveTo(sx, y + 4);
      ctx.lineTo(sx, y + c.h - 4);
      ctx.stroke();
    }
    return;
  }

  if (c.type === "wall") {
    drawRoundedRect(x, y, c.w, c.h, 5, "#9f8e85", "#d7c4b8");
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(x, y + c.h / 2);
    ctx.lineTo(x + c.w, y + c.h / 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(92,70,58,0.35)";
    for (let i = 14; i < c.w; i += 22) {
      ctx.beginPath();
      ctx.moveTo(x + i, y + 4);
      ctx.lineTo(x + i - 6, y + c.h - 4);
      ctx.stroke();
    }
    return;
  }

  if (c.type === "placedCover") {
    drawRoundedRect(x, y, c.w, c.h, 6, "#d8ae5b", "#f5d17d");
    return;
  }

  ctx.fillStyle = "#85906f";
  ctx.beginPath();
  ctx.moveTo(x + c.w * 0.1, y + c.h * 0.82);
  ctx.lineTo(x + c.w * 0.26, y + c.h * 0.24);
  ctx.lineTo(x + c.w * 0.48, y + c.h * 0.12);
  ctx.lineTo(x + c.w * 0.62, y + c.h * 0.42);
  ctx.lineTo(x + c.w * 0.8, y + c.h * 0.16);
  ctx.lineTo(x + c.w * 0.92, y + c.h * 0.7);
  ctx.lineTo(x + c.w * 0.72, y + c.h * 0.9);
  ctx.lineTo(x + c.w * 0.28, y + c.h * 0.96);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(x + c.w * 0.28, y + c.h * 0.26);
  ctx.lineTo(x + c.w * 0.46, y + c.h * 0.16);
  ctx.lineTo(x + c.w * 0.38, y + c.h * 0.54);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#c7d3b1";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawAtmospherics() {
  if (state.performanceMode) return;
  if (atmosphericsCache.width !== WIDTH || atmosphericsCache.height !== HEIGHT || !atmosphericsCache.sun) {
    rebuildAtmosphericsCache();
  }
  ctx.fillStyle = atmosphericsCache.sun;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = atmosphericsCache.vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawTerrain() {
  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bg.addColorStop(0, "#5f815c");
  bg.addColorStop(1, "#3f5a46");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(255,255,255,0.03)";
  const speckleCount = state.performanceMode ? 24 : 80;
  for (let i = 0; i < speckleCount; i++) {
    const px = ((i * 97) + state.camera.x * 0.12) % WIDTH;
    const py = ((i * 53) + state.camera.y * 0.09) % HEIGHT;
    ctx.fillRect(px, py, 2, 2);
  }

  state.terrain.forEach((zone) => {
    const sx = zone.x - state.camera.x;
    const sy = zone.y - state.camera.y;
    if (zone.type === "hill") {
      ctx.fillStyle = "#6a8a67";
      ctx.beginPath();
      ctx.ellipse(sx + zone.w / 2, sy + zone.h / 2, zone.w / 2, zone.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      const ridge = ctx.createLinearGradient(sx, sy, sx + zone.w, sy + zone.h);
      ridge.addColorStop(0, "rgba(210,235,180,0.10)");
      ridge.addColorStop(1, "rgba(35,65,36,0.18)");
      ctx.fillStyle = ridge;
      ctx.beginPath();
      ctx.ellipse(sx + zone.w / 2, sy + zone.h / 2, zone.w / 2, zone.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(230,255,210,0.10)";
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.ellipse(
          sx + zone.w / 2,
          sy + zone.h / 2,
          zone.w / 2 - i * 50,
          zone.h / 2 - i * 26,
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(40,75,44,0.28)";
      ctx.beginPath();
      ctx.moveTo(sx + zone.w * 0.16, sy + zone.h * 0.72);
      ctx.lineTo(sx + zone.w * 0.34, sy + zone.h * 0.46);
      ctx.lineTo(sx + zone.w * 0.56, sy + zone.h * 0.52);
      ctx.lineTo(sx + zone.w * 0.8, sy + zone.h * 0.28);
      ctx.stroke();
    } else if (zone.type === "road") {
      drawRoundedRect(sx, sy, zone.w, zone.h, 16, "#7a7568", "#a39d8d");
      ctx.fillStyle = "rgba(90,75,55,0.18)";
      ctx.fillRect(sx, sy + 8, zone.w, 10);
      ctx.fillRect(sx, sy + zone.h - 18, zone.w, 10);
      ctx.strokeStyle = "rgba(245,235,190,0.32)";
      ctx.setLineDash([18, 14]);
      ctx.beginPath();
      ctx.moveTo(sx + 22, sy + zone.h / 2);
      ctx.lineTo(sx + zone.w - 22, sy + zone.h / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (zone.type === "water") {
      drawRoundedRect(sx, sy, zone.w, zone.h, 20, "#3f7ea0", "#7cc0e8");
      ctx.strokeStyle = "rgba(210,240,255,0.25)";
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(sx + 40, sy + 30 + i * 34);
        ctx.lineTo(sx + zone.w - 40, sy + 30 + i * 34);
        ctx.stroke();
      }
    } else if (zone.type === "brush") {
      ctx.fillStyle = "rgba(45, 117, 59, 0.95)";
      ctx.fillRect(sx, sy, zone.w, zone.h);
      ctx.fillStyle = "rgba(110, 184, 104, 0.45)";
      for (let i = 0; i < 12; i++) {
        ctx.fillRect(sx + ((i * 19) % zone.w), sy + ((i * 23) % zone.h), 16, 8);
      }
      ctx.fillStyle = "rgba(20,70,26,0.35)";
      for (let i = 0; i < 10; i++) {
        const tx = sx + ((i * 41) % Math.max(1, zone.w - 20));
        const ty = sy + ((i * 37) % Math.max(1, zone.h - 18));
        ctx.beginPath();
        ctx.arc(tx + 8, ty + 8, 9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(64,44,28,0.46)";
      for (let i = 0; i < 7; i++) {
        const tx = sx + 22 + ((i * 53) % Math.max(1, zone.w - 30));
        const ty = sy + 18 + ((i * 47) % Math.max(1, zone.h - 28));
        ctx.fillRect(tx, ty + 6, 4, 10);
        ctx.fillStyle = "rgba(42,98,40,0.92)";
        ctx.beginPath();
        ctx.arc(tx + 2, ty + 4, 9, 0, Math.PI * 2);
        ctx.arc(tx - 4, ty + 8, 7, 0, Math.PI * 2);
        ctx.arc(tx + 8, ty + 8, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(64,44,28,0.46)";
      }
    }
  });

  state.cover.forEach((c) => {
    drawCoverVisual(c);
  });
}

function drawUnit(unit) {
  const isCorpse = unit.hp <= 0 && !unit.downed;
  if (isCorpse && unit.deathTimer <= 0) return;
  const visibleEnemy = unit.team === "enemy" ? isVisibleToSquad(unit) : false;
  if (unit.team === "enemy" && !visibleEnemy && !isCorpse) return;
  const sx = unit.x - state.camera.x;
  const sy = unit.y - state.camera.y;
  const pulseScale = 1 + unit.hitScale * 0.1;
  const bodyAlpha = isCorpse ? Math.max(0.18, unit.deathTimer / 0.7) : 1;
  const corpseTilt = isCorpse ? unit.deathTilt || 1 : 0;

  ctx.fillStyle = isCorpse ? `rgba(90,0,0,${0.12 * bodyAlpha})` : "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(sx, sy + unit.radius + 5, unit.radius + 5 + unit.hitScale * 2, unit.radius * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(unit.angle + corpseTilt);
  ctx.scale(pulseScale, pulseScale);
  ctx.globalAlpha = bodyAlpha;

  if (unit.hitFlash > 0 && !isCorpse) {
    ctx.fillStyle = unit.team === "enemy" ? "#ffd1d1" : "#f4ffd2";
  } else if (isCorpse) {
    ctx.fillStyle = "#7d6262";
  } else {
    ctx.fillStyle = unit.downed ? "#9aa4a0" : unit.color;
  }
  ctx.beginPath();
  ctx.roundRect(-7, -10, 14, 20, 5);
  ctx.fill();

  ctx.fillStyle = isCorpse ? "#473434" : unit.team === "enemy" ? "#3d2a2a" : "#253229";
  ctx.beginPath();
  ctx.arc(-1, -6, unit.radius * 0.65, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = isCorpse ? "#3b2d2d" : unit.team === "enemy" ? "#5e4747" : "#131c14";
  ctx.fillRect(2, -3, unit.radius + 11, 6);
  ctx.fillRect(-6, 7, 4, 8);
  ctx.fillRect(2, 7, 4, 8);

  if (isCorpse) {
    ctx.fillStyle = `rgba(255,120,120,${0.35 * bodyAlpha})`;
    ctx.fillRect(-5, -1, 10, 4);
  } else if (unit.team === "enemy") {
    ctx.fillStyle = "rgba(255,115,115,0.82)";
    ctx.fillRect(-5, -1, 10, 4);
  } else {
    ctx.fillStyle = "rgba(210,255,185,0.82)";
    ctx.fillRect(-5, -1, 10, 4);
  }

  if (unit.team !== "enemy") {
    ctx.strokeStyle = unit === state.player ? "#d9ffab" : "rgba(180,255,210,0.65)";
    ctx.lineWidth = unit === state.player ? 3 : 2;
    ctx.beginPath();
    ctx.arc(0, 0, unit.radius + (unit === state.player ? 4 : 2), 0, Math.PI * 2);
    ctx.stroke();
    if (unit === state.player) {
      ctx.fillStyle = "#f4ffd2";
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = unit.hitFlash > 0 && !isCorpse ? "rgba(255,235,235,0.98)" : "rgba(255,120,120,0.95)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, unit.radius + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = isCorpse ? `rgba(140,20,20,${0.16 * bodyAlpha})` : "rgba(255,90,90,0.18)";
    ctx.beginPath();
    ctx.arc(0, 0, unit.radius + 8 + unit.hitScale * 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  if (visibleEnemy && !isCorpse) {
    ctx.save();
    ctx.strokeStyle = unit.hitFlash > 0 ? "rgba(255,240,240,0.98)" : "rgba(255,90,90,0.98)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx - 9, sy - unit.radius - 14);
    ctx.lineTo(sx, sy - unit.radius - 5);
    ctx.lineTo(sx + 9, sy - unit.radius - 14);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,90,90,0.24)";
    ctx.beginPath();
    ctx.arc(sx, sy, unit.radius + 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (unit.hitFlash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.45, unit.hitFlash * 0.5);
    ctx.fillStyle = unit.team === "enemy" ? "#ffd8d8" : "#f4ffd2";
    ctx.beginPath();
    ctx.arc(sx, sy, unit.radius + 12 + unit.hitScale * 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(sx - 16, sy - 24, 32, 5);
  ctx.fillStyle = unit.team === "enemy" ? "#ff7474" : "#86e886";
  ctx.fillRect(sx - 16, sy - 24, 32 * Math.max(0, unit.hp / unit.maxHp), 5);
}

function drawObjectives() {
  if (state.selectedMission === "outpostDefense" && state.defendZone) {
    ctx.strokeStyle = "rgba(137,247,198,0.9)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(state.defendZone.x - state.camera.x, state.defendZone.y - state.camera.y, state.defendZone.radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (state.selectedMission === "reconSweep") {
    [state.reconA, state.reconB].forEach((point, index) => {
      if (!point || point.complete) return;
      if (!isVisibleToSquad(point) && state.objectivePhase !== (index === 0 ? "reconAlpha" : "reconBravo")) return;
      ctx.fillStyle = index === 0 ? "rgba(120,220,255,0.28)" : "rgba(180,255,210,0.28)";
      ctx.beginPath();
      ctx.arc(point.x - state.camera.x, point.y - state.camera.y, point.radius + 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = index === 0 ? "#8fe6ff" : "#b8ffd2";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(point.x - state.camera.x, point.y - state.camera.y, point.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = index === 0 ? "#dff8ff" : "#eafff1";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(index === 0 ? "A" : "B", point.x - state.camera.x, point.y - state.camera.y + 6);
      ctx.textAlign = "left";
    });
  }

  state.supplies.forEach((supply) => {
    if (supply.used || !isVisibleToSquad(supply)) return;
    ctx.fillStyle = supply.type === "ammo" ? "#89b4ff" : "#8fffb0";
    ctx.beginPath();
    ctx.arc(supply.x - state.camera.x, supply.y - state.camera.y, supply.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  if (state.jammer && !state.jammer.disabled && isVisibleToSquad(state.jammer)) {
    ctx.fillStyle = "#ffb3cf";
    ctx.beginPath();
    ctx.arc(state.jammer.x - state.camera.x, state.jammer.y - state.camera.y, state.jammer.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff0f7";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#5e2640";
    ctx.fillRect(state.jammer.x - state.camera.x - 8, state.jammer.y - state.camera.y - 14, 16, 28);
  }

  if (state.intel && !state.intel.collected && isVisibleToSquad(state.intel)) {
    ctx.fillStyle = "#ffe082";
    ctx.beginPath();
    ctx.arc(state.intel.x - state.camera.x, state.intel.y - state.camera.y, state.intel.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff2b8";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#4d4218";
    ctx.fillRect(state.intel.x - state.camera.x - 8, state.intel.y - state.camera.y - 10, 16, 20);
  }

  const shouldShowExtraction =
    !!state.extraction &&
    (state.selectedMission === "reconSweep" || state.selectedMission === "intelRaid"
      ? state.objectivePhase === "extract"
      : true);
  if (shouldShowExtraction) {
    ctx.strokeStyle = state.selectedMission === "reconSweep" ? "#ffe082" : "#89f7c6";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(state.extraction.x - state.camera.x, state.extraction.y - state.camera.y, state.extraction.radius, 0, Math.PI * 2);
    ctx.stroke();
    if (state.selectedMission === "reconSweep") {
      ctx.fillStyle = "#fff1a6";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("EX", state.extraction.x - state.camera.x - 10, state.extraction.y - state.camera.y + 5);
    }
  }
}

function drawBullets() {
  state.bullets.forEach((b) => {
    if (!isOnScreen(b.x, b.y, 20)) return;
    const angle = Math.atan2(b.vy, b.vx);
    const sx = b.x - state.camera.x;
    const sy = b.y - state.camera.y;
    ctx.strokeStyle = b.team === "enemy" ? "rgba(255,140,140,0.95)" : "rgba(255,240,150,0.95)";
    ctx.lineWidth = state.performanceMode ? Math.max(2, (b.tracerWidth || 3) - 2) : b.tracerWidth || 3;
    ctx.beginPath();
    ctx.moveTo(sx - Math.cos(angle) * (b.trailLength ? Math.min(26, b.trailLength * 0.08) : 14), sy - Math.sin(angle) * (b.trailLength ? Math.min(26, b.trailLength * 0.08) : 14));
    ctx.lineTo(sx, sy);
    ctx.stroke();
    if (state.performanceMode) return;
    ctx.fillStyle = b.team === "enemy" ? "#ff9e9e" : "#fff5a5";
    ctx.beginPath();
    ctx.arc(sx, sy, b.coreRadius || 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawProjectiles() {
  state.projectiles.forEach((p) => {
    if (!isOnScreen(p.x, p.y, 30)) return;
    const angle = Math.atan2(p.vy, p.vx);
    const sx = p.x - state.camera.x;
    const sy = p.y - state.camera.y;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = state.performanceMode ? 3 : 4;
    ctx.beginPath();
    ctx.moveTo(sx - Math.cos(angle) * 24, sy - Math.sin(angle) * 24);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    if (state.performanceMode) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sx, sy, p.radius, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.arc(sx, sy, p.radius + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(sx, sy, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function drawEffects() {
  const lightweight = state.performanceMode;
  const maxEffectsToRender = lightweight ? 18 : Number.POSITIVE_INFINITY;
  let renderedEffects = 0;

  if (!lightweight) {
  state.noiseBursts.forEach((n) => {
    if (!isOnScreen(n.x, n.y, 180)) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, n.life * 0.45);
    ctx.strokeStyle = "rgba(180,220,255,0.55)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.arc(n.x - state.camera.x, n.y - state.camera.y, n.radius * (1.15 - n.life * 0.4), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
  });
  }
  state.effects.forEach((e) => {
    if (renderedEffects >= maxEffectsToRender) return;
    const sampleX = e.kind === "tracer" ? e.x1 : e.x;
    const sampleY = e.kind === "tracer" ? e.y1 : e.y;
    if (!isOnScreen(sampleX, sampleY, 120)) return;
    if (lightweight && (e.kind === "flash" || e.kind === "shockwave" || e.kind === "burst")) return;
    if (e.kind === "muzzle") {
      renderedEffects += 1;
      ctx.save();
      ctx.translate(e.x - state.camera.x, e.y - state.camera.y);
      ctx.rotate(e.angle);
      ctx.globalAlpha = Math.max(0, e.life * 12);
      ctx.scale(e.scale || 1, e.scale || 1);
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-4, -6);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-4, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    if (e.kind === "tracer") {
      renderedEffects += 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, e.life * 6);
      ctx.strokeStyle = e.color;
      ctx.lineWidth = lightweight ? Math.max(2, (e.width || 5) - 2) : e.width || 5;
      ctx.beginPath();
      ctx.moveTo(e.x1 - state.camera.x, e.y1 - state.camera.y);
      ctx.lineTo(e.x2 - state.camera.x, e.y2 - state.camera.y);
      ctx.stroke();
      if (!lightweight) {
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = Math.max(1.2, (e.width || 5) * 0.4);
      ctx.beginPath();
      ctx.moveTo(e.x1 - state.camera.x, e.y1 - state.camera.y);
      ctx.lineTo(e.x2 - state.camera.x, e.y2 - state.camera.y);
      ctx.stroke();
      }
      ctx.restore();
      return;
    }
    if (e.kind === "marker") {
      renderedEffects += 1;
      ctx.save();
      ctx.translate(e.x - state.camera.x, e.y - state.camera.y);
      ctx.globalAlpha = Math.max(0, e.life * 1.2);
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(0, -30);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (e.kind === "impact") {
      renderedEffects += 1;
      ctx.save();
      ctx.translate(e.x - state.camera.x, e.y - state.camera.y);
      ctx.globalAlpha = Math.max(0, e.life * 4);
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3;
      const rayCount = lightweight ? 4 : 6;
      for (let i = 0; i < rayCount; i++) {
        const a = (Math.PI * 2 * i) / rayCount;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
        ctx.lineTo(Math.cos(a) * 14, Math.sin(a) * 14);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    if (e.kind === "damageText") {
      renderedEffects += 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, e.life * 1.8);
      ctx.fillStyle = e.color;
      ctx.font = lightweight ? "bold 16px Arial" : "bold 18px Arial";
      ctx.textAlign = "center";
      if (!lightweight) {
        ctx.strokeStyle = "rgba(15,18,30,0.88)";
        ctx.lineWidth = 4;
        ctx.strokeText(e.text, e.x - state.camera.x, e.y - state.camera.y);
      }
      ctx.fillText(e.text, e.x - state.camera.x, e.y - state.camera.y);
      ctx.restore();
      return;
    }
    if (e.kind === "shockwave") {
      renderedEffects += 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, e.life * 2.2);
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(e.x - state.camera.x, e.y - state.camera.y, e.r * (1.2 - e.life * 0.35), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (e.kind === "burst") {
      renderedEffects += 1;
      ctx.save();
      ctx.translate(e.x - state.camera.x, e.y - state.camera.y);
      ctx.globalAlpha = Math.max(0, e.life * 4);
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3;
      const spokeCount = lightweight ? 6 : 10;
      for (let i = 0; i < spokeCount; i++) {
        const a = (Math.PI * 2 * i) / spokeCount;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
        ctx.lineTo(Math.cos(a) * e.r * (1.05 - e.life), Math.sin(a) * e.r * (1.05 - e.life));
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    if (e.kind === "flash") {
      renderedEffects += 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, e.life * 1.7);
      ctx.fillStyle = "rgba(255,245,190,0.35)";
      ctx.beginPath();
      ctx.arc(e.x - state.camera.x, e.y - state.camera.y, e.r * (1.5 - e.life), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff8d5";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x - state.camera.x, e.y - state.camera.y, e.r * (1.25 - e.life * 0.3), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (e.kind === "pulse") {
      renderedEffects += 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, e.life * 1.4);
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(e.x - state.camera.x, e.y - state.camera.y, e.r * (1.2 - e.life * 0.35), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    renderedEffects += 1;
    ctx.globalAlpha = Math.max(0, e.life * 2);
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x - state.camera.x, e.y - state.camera.y, e.r * (2 - e.life), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
}

function drawObjectivePointer() {
  const target = getCurrentObjectiveTarget();
  if (!target) return;
  if (isOnScreen(target.x, target.y, 0)) return;

  const centerX = WIDTH / 2;
  const centerY = HEIGHT / 2;
  const dx = target.x - state.player.x;
  const dy = target.y - state.player.y;
  const angle = Math.atan2(dy, dx);
  const radius = Math.min(WIDTH, HEIGHT) * 0.36;
  const px = centerX + Math.cos(angle) * radius;
  const py = centerY + Math.sin(angle) * radius;

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle);
  ctx.fillStyle = "#ffe082";
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-10, -10);
  ctx.lineTo(-10, 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawAimReticle() {
  const shouldDraw = input.touchAiming || input.fire;
  if (!shouldDraw) return;
  const px = state.player.x - state.camera.x;
  const py = state.player.y - state.camera.y;
  const sx = input.mouseX - state.camera.x;
  const sy = input.mouseY - state.camera.y;
  const recoilSpread = state.recoilKick * 16;
  ctx.save();
  ctx.setLineDash([10, 7]);
  ctx.strokeStyle = "rgba(255,230,140,0.42)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(sx, sy);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "rgba(255,230,140,0.95)";
  ctx.beginPath();
  ctx.arc(sx, sy, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(255,230,140,0.95)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(sx, sy, 10 + recoilSpread * 0.25, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx - (14 + recoilSpread), sy);
  ctx.lineTo(sx - (6 + recoilSpread * 0.5), sy);
  ctx.moveTo(sx + (6 + recoilSpread * 0.5), sy);
  ctx.lineTo(sx + (14 + recoilSpread), sy);
  ctx.moveTo(sx, sy - (14 + recoilSpread));
  ctx.lineTo(sx, sy - (6 + recoilSpread * 0.5));
  ctx.moveTo(sx, sy + (6 + recoilSpread * 0.5));
  ctx.lineTo(sx, sy + (14 + recoilSpread));
  ctx.stroke();
}

function drawKillBanner() {
  if (state.killBannerTimer <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, state.killBannerTimer * 2.2);
  ctx.fillStyle = "rgba(34, 12, 12, 0.72)";
  ctx.fillRect(WIDTH / 2 - 120, 74, 240, 42);
  ctx.strokeStyle = "rgba(255, 143, 143, 0.7)";
  ctx.lineWidth = 2;
  ctx.strokeRect(WIDTH / 2 - 120, 74, 240, 42);
  ctx.fillStyle = "#ffd0d0";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(state.killBannerText || "적 처치", WIDTH / 2, 101);
  ctx.restore();
  ctx.textAlign = "left";
}

function drawScreenFlash() {
  if (state.screenFlashTimer <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, state.screenFlashTimer * 3.2);
  ctx.fillStyle = state.screenFlashColor || "rgba(255,245,210,0.38)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.restore();
}

function drawPlayerDamageVignette() {
  if (state.playerDamageTimer <= 0) return;
  if (damageVignetteCache.width !== WIDTH || damageVignetteCache.height !== HEIGHT) {
    rebuildDamageVignetteCache();
  }
  ctx.save();
  ctx.globalAlpha = Math.min(0.45, state.playerDamageTimer * 1.4);
  ctx.drawImage(damageVignetteCache.canvas, 0, 0, WIDTH, HEIGHT);
  ctx.restore();
}

function drawNearMissCue() {
  if (state.nearMissTimer <= 0) return;
  const edge = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.16, WIDTH / 2, HEIGHT / 2, HEIGHT * 0.72);
  edge.addColorStop(0.7, "rgba(0,0,0,0)");
  edge.addColorStop(1, `rgba(255,236,180,${Math.min(0.32, state.nearMissTimer * 1.8)})`);
  ctx.save();
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.restore();
}

function drawTutorialCard() {
  const text = getTutorialStepText();
  if (!text) return;
  const w = 320;
  const h = 72;
  const x = WIDTH - w - 18;
  const y = HEIGHT - h - 18;
  ctx.save();
  ctx.fillStyle = "rgba(7, 12, 18, 0.82)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(190, 235, 255, 0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "#d7f4ff";
  ctx.font = "bold 15px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("초기 전술 안내", x + 14, y + 24);
  ctx.fillStyle = "#edf8f1";
  ctx.font = "14px sans-serif";
  ctx.fillText(text, x + 14, y + 48);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "12px sans-serif";
  ctx.fillText(`단계 ${Math.min(4, state.tutorialStep + 1)} / 4`, x + 14, y + 64);
  ctx.restore();
}

function drawPerfStats() {
  if (!state.perfStatsVisible) return;
  const x = 18;
  const y = HEIGHT - 86;
  ctx.save();
  ctx.fillStyle = "rgba(7, 12, 18, 0.78)";
  ctx.fillRect(x, y, 162, 68);
  ctx.strokeStyle = "rgba(150, 220, 255, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, 162, 68);
  ctx.fillStyle = "#d7f4ff";
  ctx.font = "12px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`FPS ${state.fps.toFixed(1)}`, x + 10, y + 18);
  ctx.fillText(`Frame ${state.frameMs.toFixed(1)} ms`, x + 10, y + 34);
  ctx.fillText(`Update ${state.updateMs.toFixed(1)} ms`, x + 10, y + 50);
  ctx.fillText(`Render ${state.renderMs.toFixed(1)} ms`, x + 10, y + 64);
  ctx.restore();
}

function drawMinimap() {
  const mapW = 170;
  const mapH = 115;
  const x = WIDTH - mapW - 18;
  const y = 18;
  drawRoundedRect(x, y, mapW, mapH, 10, "rgba(10,18,20,0.78)", "rgba(190,220,200,0.28)");
  if (minimapCache.dirty || minimapCache.width !== mapW || minimapCache.height !== mapH) {
    rebuildMinimapCache(mapW, mapH);
  }
  ctx.drawImage(minimapCache.canvas, x, y, mapW, mapH);

  const target = getCurrentObjectiveTarget();
  if (target) {
    ctx.fillStyle = "#ffd966";
    ctx.beginPath();
    ctx.arc(x + (target.x / WORLD_WIDTH) * mapW, y + (target.y / WORLD_HEIGHT) * mapH, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  [...state.allies, state.player].forEach((unit) => {
    if (unit.hp <= 0 || unit.downed) return;
    ctx.fillStyle = unit === state.player ? "#c7ff8b" : "#9cebd0";
    ctx.beginPath();
    ctx.arc(x + (unit.x / WORLD_WIDTH) * mapW, y + (unit.y / WORLD_HEIGHT) * mapH, unit === state.player ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  });

  const camX = x + (state.camera.x / WORLD_WIDTH) * mapW;
  const camY = y + (state.camera.y / WORLD_HEIGHT) * mapH;
  const camW = (WIDTH / WORLD_WIDTH) * mapW;
  const camH = (HEIGHT / WORLD_HEIGHT) * mapH;
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.strokeRect(camX, camY, camW, camH);
}

function drawVisibilityMask() {
  if (state.performanceMode) {
    const viewers = [state.player, ...state.allies].filter((u) => u.hp > 0 && !u.downed);
    const scale = visibilityMaskCache.scale;
    const targetWidth = Math.max(1, Math.floor(WIDTH * scale));
    const targetHeight = Math.max(1, Math.floor(HEIGHT * scale));

    if (!visibilityMaskCache.ctx) {
      visibilityMaskCache.ctx = visibilityMaskCache.canvas.getContext("2d");
    }
    if (visibilityMaskCache.width !== targetWidth || visibilityMaskCache.height !== targetHeight) {
      visibilityMaskCache.width = targetWidth;
      visibilityMaskCache.height = targetHeight;
      visibilityMaskCache.canvas.width = targetWidth;
      visibilityMaskCache.canvas.height = targetHeight;
      visibilityMaskCache.ctx = visibilityMaskCache.canvas.getContext("2d");
    }

    const maskCtx = visibilityMaskCache.ctx;
    maskCtx.clearRect(0, 0, targetWidth, targetHeight);
    maskCtx.fillStyle = "rgba(5, 8, 10, 0.56)";
    maskCtx.fillRect(0, 0, targetWidth, targetHeight);
    maskCtx.globalCompositeOperation = "destination-out";

    viewers.forEach((viewer, index) => {
      const sx = (viewer.x - state.camera.x) * scale;
      const sy = (viewer.y - state.camera.y) * scale;
      const radius = (index === 0 ? 280 : 185) * scale;

      maskCtx.beginPath();
      maskCtx.arc(sx, sy, radius * 0.72, 0, Math.PI * 2);
      maskCtx.fill();

      if (index === 0) {
        const coneLength = 360 * scale;
        const spread = 1.18;
        maskCtx.beginPath();
        maskCtx.moveTo(sx, sy);
        maskCtx.arc(sx, sy, coneLength, viewer.angle - spread / 2, viewer.angle + spread / 2);
        maskCtx.closePath();
        maskCtx.fill();
      }
    });

    maskCtx.globalCompositeOperation = "source-over";
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(visibilityMaskCache.canvas, 0, 0, targetWidth, targetHeight, 0, 0, WIDTH, HEIGHT);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.fillStyle = "rgba(5, 8, 10, 0.52)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.globalCompositeOperation = "destination-out";

  const viewers = [state.player, ...state.allies].filter((u) => u.hp > 0 && !u.downed);
  viewers.forEach((viewer, index) => {
    const sx = viewer.x - state.camera.x;
    const sy = viewer.y - state.camera.y;
    const radius = index === 0 ? 280 : 185;

    ctx.beginPath();
    ctx.arc(sx, sy, radius * 0.72, 0, Math.PI * 2);
    ctx.fill();

    if (index === 0) {
      const coneLength = 360;
      const spread = 1.18;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.arc(sx, sy, coneLength, viewer.angle - spread / 2, viewer.angle + spread / 2);
      ctx.closePath();
      ctx.fill();
    }
  });

  ctx.restore();
}

function drawVisionLighting() {
  if (state.performanceMode) return;
  const viewers = [state.player, ...state.allies].filter((u) => u.hp > 0 && !u.downed);
  viewers.forEach((viewer, index) => {
    const sx = viewer.x - state.camera.x;
    const sy = viewer.y - state.camera.y;

    const halo = ctx.createRadialGradient(sx, sy, 12, sx, sy, index === 0 ? 250 : 150);
    halo.addColorStop(0, index === 0 ? "rgba(255,255,220,0.28)" : "rgba(220,255,220,0.14)");
    halo.addColorStop(0.45, index === 0 ? "rgba(255,255,220,0.12)" : "rgba(220,255,220,0.08)");
    halo.addColorStop(1, "rgba(255,255,220,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(sx, sy, index === 0 ? 250 : 150, 0, Math.PI * 2);
    ctx.fill();

    if (index === 0) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(viewer.angle);
      const beam = ctx.createRadialGradient(0, 0, 20, 0, 0, 360);
      beam.addColorStop(0, "rgba(255,250,210,0.18)");
      beam.addColorStop(0.4, "rgba(255,245,200,0.10)");
      beam.addColorStop(1, "rgba(255,245,200,0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 360, -0.62, 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  });
}

function drawMessage() {
  if (state.messageTimer <= 0) return;
  ctx.fillStyle = "rgba(5,8,10,0.72)";
  ctx.fillRect(WIDTH / 2 - 250, 20, 500, 44);
  ctx.fillStyle = "#edf8f1";
  ctx.font = "18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(state.message, WIDTH / 2, 48);
  ctx.textAlign = "left";
}

function drawEventBanner() {
  if (state.eventBannerTimer <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, state.eventBannerTimer * 1.4);
  ctx.fillStyle = "rgba(8,12,18,0.78)";
  ctx.fillRect(WIDTH / 2 - 220, 72, 440, 40);
  ctx.strokeStyle = state.eventBannerColor || "#ffe082";
  ctx.lineWidth = 2;
  ctx.strokeRect(WIDTH / 2 - 220, 72, 440, 40);
  ctx.fillStyle = state.eventBannerColor || "#ffe082";
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(state.eventBannerText, WIDTH / 2, 98);
  ctx.restore();
  ctx.textAlign = "left";
}

function getResultGrade() {
  if (!state.stats) return "C";
  if (state.gameOver) return "F";
  const accuracy = state.stats.shots > 0 ? state.stats.hits / state.stats.shots : 0;
  const score =
    state.stats.kills * 10 +
    state.stats.revives * 8 +
    (state.selectedMission === "outpostDefense" ? Math.max(0, state.missionClock) : 15) +
    accuracy * 35;
  if (score >= 95) return "S";
  if (score >= 72) return "A";
  if (score >= 52) return "B";
  return "C";
}

function getElapsedSeconds() {
  if (!state.stats) return 0;
  const end = state.stats.finishedAt || performance.now();
  return Math.max(1, Math.floor((end - state.stats.startedAt) / 1000));
}

function drawOverlay() {
  if (!state.gameOver && !state.victory && !state.paused) return;
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "bold 34px sans-serif";
  if (state.paused && !state.gameOver && !state.victory) {
    ctx.fillText("일시정지", WIDTH / 2, HEIGHT / 2 - 12);
    ctx.font = "18px sans-serif";
    ctx.fillText("P 또는 Esc, 상단 버튼으로 계속할 수 있습니다.", WIDTH / 2, HEIGHT / 2 + 28);
    ctx.textAlign = "left";
    return;
  }
  ctx.fillText(state.victory ? "작전 성공" : "작전 실패", WIDTH / 2, HEIGHT / 2 - 12);
  ctx.font = "18px sans-serif";
  ctx.fillText(`작전 등급: ${getResultGrade()}`, WIDTH / 2, HEIGHT / 2 + 24);
  ctx.fillText(
    `처치 ${state.stats.kills} / 명중 ${state.stats.hits} / 발사 ${state.stats.shots} / 구조 ${state.stats.revives} / ${getElapsedSeconds()}초`,
    WIDTH / 2,
    HEIGHT / 2 + 52
  );
  ctx.fillText("상단 재시작 버튼으로 다시 시작할 수 있습니다.", WIDTH / 2, HEIGHT / 2 + 84);
  ctx.textAlign = "left";
}

function drawHitMarkers() {
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;

  if (state.hitMarkerTimer > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, state.hitMarkerTimer * 8);
    ctx.strokeStyle = "#fff4b3";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy - 12);
    ctx.lineTo(cx - 4, cy - 4);
    ctx.moveTo(cx + 12, cy - 12);
    ctx.lineTo(cx + 4, cy - 4);
    ctx.moveTo(cx - 12, cy + 12);
    ctx.lineTo(cx - 4, cy + 4);
    ctx.moveTo(cx + 12, cy + 12);
    ctx.lineTo(cx + 4, cy + 4);
    ctx.stroke();
    ctx.restore();
  }

  if (state.killMarkerTimer > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, state.killMarkerTimer * 5);
    ctx.strokeStyle = "#ff8f8f";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 18, cy - 18);
    ctx.lineTo(cx + 18, cy + 18);
    ctx.moveTo(cx + 18, cy - 18);
    ctx.lineTo(cx - 18, cy + 18);
    ctx.stroke();
    ctx.restore();
  }
}

function render() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawTerrain();
  drawGrid();
  drawAtmospherics();
  drawObjectives();
  state.enemies.forEach(drawUnit);
  drawVisibilityMask();
  drawVisionLighting();
  drawProjectiles();
  drawBullets();
  drawEffects();
  [...state.allies, state.player].forEach(drawUnit);
  drawAimReticle();
  if (state.objectivePointerVisible) drawObjectivePointer();
  if (state.minimapVisible) drawMinimap();
  drawMessage();
  drawEventBanner();
  drawHitMarkers();
  drawKillBanner();
  drawScreenFlash();
  drawPlayerDamageVignette();
  drawNearMissCue();
  drawTutorialCard();
  drawPerfStats();
  drawOverlay();
}

function loop(timestamp) {
  resizeCanvasToDisplaySize();
  const rawFrameMs = Math.max(0.0001, timestamp - state.lastTime || 16);
  const dt = Math.min(0.033, rawFrameMs / 1000 || 0.016);
  state.lastTime = timestamp;
  if (state.hitStopTimer > 0) {
    state.hitStopTimer = Math.max(0, state.hitStopTimer - rawFrameMs / 1000);
  }
  const effectiveDt = state.hitStopTimer > 0 ? 0 : dt;
  const updateStart = performance.now();
  if (!state.paused) update(effectiveDt);
  const updateElapsed = performance.now() - updateStart;
  const renderStart = performance.now();
  render();
  const renderElapsed = performance.now() - renderStart;
  state.frameMs = state.frameMs ? state.frameMs * 0.88 + rawFrameMs * 0.12 : rawFrameMs;
  state.updateMs = state.updateMs ? state.updateMs * 0.88 + updateElapsed * 0.12 : updateElapsed;
  state.renderMs = state.renderMs ? state.renderMs * 0.88 + renderElapsed * 0.12 : renderElapsed;
  const instantFps = 1000 / rawFrameMs;
  state.fps = state.fps ? state.fps * 0.88 + instantFps * 0.12 : instantFps;
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (e) => {
  if (e.key === "p" || e.key === "P" || e.key === "Escape") {
    e.preventDefault();
    togglePause();
    return;
  }
  if (e.key === "m" || e.key === "M") {
    e.preventDefault();
    toggleMinimap();
    return;
  }
  if (e.key === "g" || e.key === "G") {
    e.preventDefault();
    toggleObjectivePointer();
    return;
  }
  if (e.key === "n" || e.key === "N") {
    e.preventDefault();
    cycleDifficulty();
    return;
  }
  if (e.key === "h" || e.key === "H") {
    e.preventDefault();
    toggleHud();
    return;
  }
  if (e.key === "o" || e.key === "O") {
    e.preventDefault();
    toggleAudioMuted();
    return;
  }
  if (e.key === "f" || e.key === "F") {
    e.preventDefault();
    toggleFullscreen();
    return;
  }
  if (e.key === "j" || e.key === "J") {
    e.preventDefault();
    togglePerfStats();
    return;
  }
  if (state.paused) return;
  if (e.key === "w" || e.key === "W") input.up = true;
  if (e.key === "s" || e.key === "S") input.down = true;
  if (e.key === "a" || e.key === "A") input.left = true;
  if (e.key === "d" || e.key === "D") input.right = true;
  if (e.key === "e" || e.key === "E") input.interact = true;
  if (e.key === "1") setSquadCommand("follow");
  if (e.key === "2") setSquadCommand("hold");
  if (e.key === "3") setSquadCommand("assault");
  if (e.code === "Space") {
    input.skill = true;
    usePlayerSkill();
  }
  if (e.key === "r" || e.key === "R") reload(state.player);
});

window.addEventListener("keyup", (e) => {
  if (e.key === "w" || e.key === "W") input.up = false;
  if (e.key === "s" || e.key === "S") input.down = false;
  if (e.key === "a" || e.key === "A") input.left = false;
  if (e.key === "d" || e.key === "D") input.right = false;
  if (e.code === "Space") input.skill = false;
});

window.addEventListener("pointerdown", primeAudioOnInteraction, { passive: true });
window.addEventListener("mousedown", primeAudioOnInteraction, { passive: true });
window.addEventListener("touchstart", primeAudioOnInteraction, { passive: true });
window.addEventListener("keydown", primeAudioOnInteraction);
canvas.addEventListener("contextmenu", suppressBrowserInteraction);
canvas.addEventListener("dragstart", suppressBrowserInteraction);
fireBtn.addEventListener("contextmenu", suppressBrowserInteraction);
interactBtn.addEventListener("contextmenu", suppressBrowserInteraction);
skillBtn.addEventListener("contextmenu", suppressBrowserInteraction);
moveStick.addEventListener("contextmenu", suppressBrowserInteraction);

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const pos = screenToWorld(e.clientX, e.clientY, rect);
  input.mouseX = pos.x;
  input.mouseY = pos.y;
});

let aimTouchId = null;
let aimAnchorClientX = 0;
let aimAnchorClientY = 0;

function updateTouchAim(clientX, clientY, rect) {
  const maxRadius = 150;
  const dx = ((clientX - aimAnchorClientX) / rect.width) * WIDTH * 1.25;
  const dy = ((clientY - aimAnchorClientY) / rect.height) * HEIGHT * 1.25;
  const len = Math.hypot(dx, dy) || 1;
  const clamped = Math.min(maxRadius, len);
  const aimDx = len < 6 ? Math.cos(state.player.angle) * 70 : (dx / len) * clamped;
  const aimDy = len < 6 ? Math.sin(state.player.angle) * 70 : (dy / len) * clamped;
  input.mouseX = state.player.x + aimDx;
  input.mouseY = state.player.y + aimDy;
  input.touchAiming = true;
}

canvas.addEventListener("touchstart", (e) => {
  const rect = canvas.getBoundingClientRect();
  const touch = [...e.changedTouches].find((t) => t.clientX > rect.left + rect.width * 0.5);
  if (!touch) return;
  aimTouchId = touch.identifier;
  aimAnchorClientX = touch.clientX;
  aimAnchorClientY = touch.clientY;
  updateTouchAim(touch.clientX, touch.clientY, rect);
});

function handleAimTouchMove(e) {
  if (e.cancelable) e.preventDefault();
  if (aimTouchId === null) return;
  const rect = canvas.getBoundingClientRect();
  const touch = [...e.touches].find((t) => t.identifier === aimTouchId);
  if (!touch) return;
  updateTouchAim(touch.clientX, touch.clientY, rect);
}

function handleAimTouchEnd(e) {
  if (e.cancelable) e.preventDefault();
  if (![...e.changedTouches].some((t) => t.identifier === aimTouchId)) return;
  aimTouchId = null;
  input.touchAiming = false;
}

function clearAimTouch(e) {
  if (e?.cancelable) e.preventDefault();
  aimTouchId = null;
  input.touchAiming = false;
}

canvas.addEventListener("touchmove", handleAimTouchMove);
window.addEventListener("touchmove", handleAimTouchMove, { passive: false });
canvas.addEventListener("touchend", handleAimTouchEnd);
window.addEventListener("touchend", handleAimTouchEnd, { passive: false });
canvas.addEventListener("touchcancel", clearAimTouch);
window.addEventListener("touchcancel", clearAimTouch, { passive: false });

function beginPlayerFire() {
  if (state.paused) return;
  input.fire = true;
  if (state.player && !state.gameOver && !state.victory) {
    shoot(state.player, state.player.angle);
  }
}

canvas.addEventListener("mousedown", () => beginPlayerFire());
window.addEventListener("mouseup", () => (input.fire = false));

function pressButtonStart(btn, handler) {
  let activeTouchId = null;
  const release = () => {
    activeTouchId = null;
    btn.classList.remove("active");
    handler(false);
  };
  btn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    activeTouchId = e.changedTouches[0]?.identifier ?? null;
    btn.classList.add("active");
    handler(true);
  });
  btn.addEventListener("touchend", (e) => {
    e.preventDefault();
    release();
  });
  window.addEventListener(
    "touchend",
    (e) => {
      if (activeTouchId === null) return;
      if ([...e.changedTouches].some((t) => t.identifier === activeTouchId)) {
        release();
      }
    },
    { passive: false }
  );
  window.addEventListener(
    "touchcancel",
    (e) => {
      if (activeTouchId === null) return;
      if ([...e.changedTouches].some((t) => t.identifier === activeTouchId)) {
        release();
      }
    },
    { passive: false }
  );
  btn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    btn.classList.add("active");
    handler(true);
  });
  btn.addEventListener("mouseup", (e) => {
    e.preventDefault();
    release();
  });
  btn.addEventListener("mouseleave", release);
  btn.addEventListener("touchcancel", release);
}

pressButtonStart(fireBtn, (v) => {
  if (v) beginPlayerFire();
  else input.fire = false;
});
pressButtonStart(interactBtn, (v) => {
  if (v) input.interact = true;
  else input.interact = false;
});
pressButtonStart(skillBtn, (v) => {
  if (v) usePlayerSkill();
});

let stickTouchId = null;
function updateStick(clientX, clientY) {
  const rect = moveStick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const max = 38;
  const len = Math.hypot(dx, dy) || 1;
  const clamped = Math.min(max, len);
  const nx = (dx / len) * clamped;
  const ny = (dy / len) * clamped;
  stickKnob.style.left = `${34 + nx}px`;
  stickKnob.style.top = `${34 + ny}px`;
  input.touchMoveX = nx / max;
  input.touchMoveY = ny / max;
}

function resetStick() {
  stickKnob.style.left = "34px";
  stickKnob.style.top = "34px";
  input.touchMoveX = 0;
  input.touchMoveY = 0;
  stickTouchId = null;
}

function releaseTransientInputs() {
  input.up = false;
  input.down = false;
  input.left = false;
  input.right = false;
  input.fire = false;
  input.interact = false;
  input.touchAiming = false;
  aimTouchId = null;
  aimAnchorClientX = 0;
  aimAnchorClientY = 0;
  fireBtn.classList.remove("active");
  interactBtn.classList.remove("active");
  skillBtn.classList.remove("active");
  resetStick();
}

moveStick.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const t = e.changedTouches[0];
  stickTouchId = t.identifier;
  updateStick(t.clientX, t.clientY);
});

function handleStickTouchMove(e) {
  e.preventDefault();
  const t = [...e.changedTouches].find((touch) => touch.identifier === stickTouchId);
  if (t) updateStick(t.clientX, t.clientY);
}

function handleStickTouchEnd(e) {
  if (e.cancelable) e.preventDefault();
  const t = [...e.changedTouches].find((touch) => touch.identifier === stickTouchId);
  if (t) resetStick();
}

moveStick.addEventListener("touchmove", handleStickTouchMove);
window.addEventListener("touchmove", handleStickTouchMove, { passive: false });
moveStick.addEventListener("touchend", handleStickTouchEnd);
window.addEventListener("touchend", handleStickTouchEnd, { passive: false });
moveStick.addEventListener("touchcancel", resetStick);
window.addEventListener("touchcancel", resetStick, { passive: false });
window.addEventListener("blur", releaseTransientInputs);
window.addEventListener("pagehide", releaseTransientInputs);
window.addEventListener("resize", resizeCanvasToDisplaySize);
window.addEventListener("orientationchange", resizeCanvasToDisplaySize);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") {
    releaseTransientInputs();
  }
});
document.addEventListener("fullscreenchange", () => {
  updateFullscreenButton();
  updateControlHints();
});

classButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    classButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.selectedClass = btn.dataset.class;
    savePreferences();
    resetGame();
  });
});

missionButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    missionButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.selectedMission = btn.dataset.mission;
    savePreferences();
    resetGame();
  });
});

commandButtons.forEach((btn) => {
  btn.addEventListener("click", () => setSquadCommand(btn.dataset.command));
});

restartBtn.addEventListener("click", resetGame);
perfBtn.addEventListener("click", () => togglePerformanceMode());
pointerBtn.addEventListener("click", () => toggleObjectivePointer());
difficultyBtn.addEventListener("click", () => cycleDifficulty());
defaultsBtn.addEventListener("click", () => restoreDefaultPreferences());
shakeBtn.addEventListener("click", () => toggleScreenShake());
hudBtn.addEventListener("click", () => toggleHud());
minimapBtn.addEventListener("click", () => toggleMinimap());
fullscreenBtn.addEventListener("click", () => toggleFullscreen());
audioBtn.addEventListener("click", () => toggleAudioMuted());
pauseBtn.addEventListener("click", () => togglePause());

const startupCommand = loadPreferences();
resizeCanvasToDisplaySize();
resetGame();
setSquadCommand(startupCommand || "follow");
requestAnimationFrame(loop);
