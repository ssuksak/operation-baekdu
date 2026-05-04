const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const hpEl = document.getElementById("hp");
const ammoEl = document.getElementById("ammo");
const objectiveTextEl = document.getElementById("objectiveText");
const classNameEl = document.getElementById("className");
const squadListEl = document.getElementById("squadList");
const restartBtn = document.getElementById("restartBtn");
const classButtons = [...document.querySelectorAll(".class-btn")];
const missionButtons = [...document.querySelectorAll(".mission-btn")];
const commandButtons = [...document.querySelectorAll(".command-btn")];
const commandTextEl = document.getElementById("commandText");
const alertTextEl = document.getElementById("alertText");
const fireBtn = document.getElementById("fireBtn");
const skillBtn = document.getElementById("skillBtn");
const interactBtn = document.getElementById("interactBtn");
const moveStick = document.getElementById("moveStick");
const stickKnob = moveStick.querySelector(".stick-knob");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const classConfigs = {
  rifleman: {
    label: "소총수",
    color: "#6fd36f",
    maxHp: 100,
    magSize: 30,
    reserve: 90,
    fireRate: 0.16,
    damage: 18,
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
    damage: 15,
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
    damage: 17,
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
    damage: 14,
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
};

const state = {
  selectedClass: "rifleman",
  selectedMission: "intelRaid",
  squadCommand: "follow",
  player: null,
  allies: [],
  enemies: [],
  bullets: [],
  effects: [],
  cover: [],
  intel: null,
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
  lastTime: 0,
};

function makeRect(x, y, w, h, type = "rock") {
  return { x, y, w, h, type, hp: type === "placedCover" ? 70 : Infinity };
}

function createUnit(x, y, team, role, opts = {}) {
  const cfg = classConfigs[role] || classConfigs.rifleman;
  const preferredRange =
    opts.preferredRange ??
    (role === "heavy" ? 185 : role === "grenadier" ? 210 : role === "marksman" ? 260 : 150);
  return {
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
  };
}

function getMissionConfig() {
  if (state.selectedMission === "outpostDefense") {
    return {
      objectiveText: "전초기지를 방어하라",
      playerSpawn: { x: 240, y: 270 },
      allySpawns: [
        { x: 200, y: 310, color: "#86f096" },
        { x: 240, y: 335, color: "#72dcff" },
        { x: 280, y: 305, color: "#ffc76d" },
      ],
      cover: [
        makeRect(155, 180, 120, 24, "sandbag"),
        makeRect(155, 332, 120, 24, "sandbag"),
        makeRect(330, 170, 95, 28, "wall"),
        makeRect(330, 342, 95, 28, "wall"),
        makeRect(470, 115, 120, 32, "rock"),
        makeRect(470, 395, 120, 32, "rock"),
        makeRect(650, 220, 150, 100, "building"),
      ],
      enemies: [
        createUnit(810, 120, "enemy", "marksman", { color: "#ff8ad8", hp: 85, maxHp: 85 }),
        createUnit(840, 255, "enemy", "heavy", { color: "#ff845d", hp: 145, maxHp: 145 }),
        createUnit(810, 420, "enemy", "grenadier", { color: "#ffb05e", hp: 95, maxHp: 95, damage: 20 }),
      ],
      defendZone: { x: 245, y: 270, radius: 78 },
      extraction: null,
      intel: null,
      phase: "defend",
      missionClock: 75,
      wavesRemaining: 4,
      waveTimer: 10,
      intro: "전초기지를 사수하고 적의 파상공세를 막아라",
    };
  }

  return {
    objectiveText: "자료 회수 후 탈출",
    playerSpawn: { x: 120, y: HEIGHT - 90 },
    allySpawns: [
      { x: 90, y: HEIGHT - 130, color: "#86f096" },
      { x: 150, y: HEIGHT - 130, color: "#72dcff" },
      { x: 190, y: HEIGHT - 95, color: "#ffc76d" },
    ],
    cover: [
      makeRect(220, 390, 85, 26, "sandbag"),
      makeRect(310, 250, 110, 34, "rock"),
      makeRect(490, 150, 120, 26, "wall"),
      makeRect(590, 330, 90, 30, "sandbag"),
      makeRect(760, 90, 90, 120, "building"),
      makeRect(760, 280, 110, 130, "building"),
      makeRect(450, 430, 100, 28, "rock"),
    ],
      enemies: [
      createUnit(690, 120, "enemy", "rifleman", {
        color: "#ff7c7c",
        hp: 65,
        maxHp: 65,
        patrol: [{ x: 650, y: 120 }, { x: 760, y: 110 }],
      }),
      createUnit(800, 170, "enemy", "marksman", {
        color: "#ff8ad8",
        hp: 82,
        maxHp: 82,
        patrol: [{ x: 805, y: 170 }, { x: 875, y: 205 }],
      }),
      createUnit(680, 270, "enemy", "grenadier", {
        color: "#ffb05e",
        hp: 95,
        maxHp: 95,
        damage: 20,
        patrol: [{ x: 640, y: 255 }, { x: 720, y: 315 }],
      }),
      createUnit(830, 315, "enemy", "rifleman", {
        color: "#ff7c7c",
        hp: 70,
        maxHp: 70,
        patrol: [{ x: 800, y: 320 }, { x: 875, y: 345 }],
      }),
      createUnit(720, 420, "enemy", "heavy", { color: "#ff845d", hp: 145, maxHp: 145 }),
    ],
    defendZone: null,
    extraction: { x: 110, y: 90, radius: 26 },
    intel: { x: 808, y: 348, radius: 18, collected: false },
    phase: "retrieve",
    missionClock: 0,
    wavesRemaining: 0,
    waveTimer: 0,
    intro: "적 경비를 제압하고 정보 자료를 회수하라",
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
  state.intel = mission.intel;
  state.extraction = mission.extraction;
  state.defendZone = mission.defendZone;
  state.bullets = [];
  state.effects = [];
  state.objectivePhase = mission.phase;
  state.alertLevel = "낮음";
  state.missionClock = mission.missionClock;
  state.wavesRemaining = mission.wavesRemaining;
  state.waveTimer = mission.waveTimer;
  state.message = mission.intro;
  state.messageTimer = 4;
  state.gameOver = false;
  state.victory = false;
  state.stats = {
    shots: 0,
    hits: 0,
    kills: 0,
    revives: 0,
    startedAt: performance.now(),
    finishedAt: null,
  };
  skillBtn.textContent = cfg.skillName;
  updateHud();
}

function updateHud() {
  const p = state.player;
  hpEl.textContent = Math.max(0, Math.ceil(p.hp));
  ammoEl.textContent = `${p.ammo} / ${p.reserve}`;
  classNameEl.textContent = classConfigs[state.selectedClass].label;
  objectiveTextEl.textContent =
    state.selectedMission === "outpostDefense"
      ? `전초기지 방어 ${Math.max(0, Math.ceil(state.missionClock))}초`
      : state.objectivePhase === "retrieve"
      ? "자료 회수 후 탈출"
      : "탈출 지점으로 복귀";
  commandTextEl.textContent =
    state.squadCommand === "follow" ? "집결" : state.squadCommand === "hold" ? "고정" : "돌격";
  alertTextEl.textContent = state.alertLevel;

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

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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
  unit.x = clamp(unit.x, unit.radius, WIDTH - unit.radius);
  unit.y = clamp(unit.y, unit.radius, HEIGHT - unit.radius);
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
  const spread =
    shooter.role === "heavy"
      ? 0.14
      : shooter.role === "marksman"
      ? 0.02
      : shooter.role === "grenadier"
      ? 0.08
      : 0.05;
  const finalAngle = angle + (Math.random() - 0.5) * spread;
  state.bullets.push({
    x: shooter.x,
    y: shooter.y,
    vx: Math.cos(finalAngle) * (shooter.role === "marksman" ? 520 : 450),
    vy: Math.sin(finalAngle) * (shooter.role === "marksman" ? 520 : 450),
    team: shooter.team,
    damage: shooter.damage,
    life: 1.4,
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
    const vision = range + (unit.visionBoost > 0 ? 120 : 0);
    if (d < bestD && d < vision && hasLineOfSight(unit, enemy)) {
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
    if (d < bestD && hasLineOfSight(enemy, u)) {
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
  updateHud();
}

function alertNearbyEnemies(origin, radius = 180) {
  state.enemies.forEach((enemy) => {
    if (enemy.hp > 0 && dist(origin, enemy) < radius) enemy.alert = "alert";
  });
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

function triggerExplosion(x, y, radius, damage, sourceTeam) {
  state.effects.push({ x, y, r: radius, life: 0.45, color: "#ffbb66" });
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

function usePlayerSkill() {
  const p = state.player;
  if (p.skillCooldown > 0 || state.gameOver || state.victory) return;
  const cfg = classConfigs[p.role];
  p.skillCooldown = cfg.skillCooldown;

  if (p.role === "medic") {
    [p, ...state.allies].forEach((u) => {
      if (dist(p, u) < 90 && u.hp > 0) {
        u.hp = Math.min(u.maxHp, u.hp + 28);
      }
    });
    setMessage("의무병 치료 실시");
  } else if (p.role === "engineer") {
    state.cover.push(makeRect(p.x + Math.cos(p.angle) * 28 - 22, p.y + Math.sin(p.angle) * 28 - 10, 44, 20, "placedCover"));
    setMessage("공병 엄폐물 설치");
  } else if (p.role === "scout") {
    p.visionBoost = 7;
    state.enemies.forEach((e) => {
      if (dist(p, e) < 240) {
        state.effects.push({ x: e.x, y: e.y, r: 18, life: 1.5, color: "#d29bff" });
      }
    });
    setMessage("정찰 드론으로 적 위치 노출");
  } else {
    state.enemies.forEach((e) => {
      if (dist(p, e) < 120) {
        e.cooldown += 0.65;
      }
    });
    state.effects.push({ x: p.x + Math.cos(p.angle) * 55, y: p.y + Math.sin(p.angle) * 55, r: 70, life: 0.35, color: "#fff1a6" });
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
  p.angle = Math.atan2(input.mouseY - p.y, input.mouseX - p.x);
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
      ? nearestEnemy(ally, 500) || { x: 760, y: 270 }
      : !state.intel?.collected
      ? state.intel
      : state.extraction || { x: 120, y: 80 };
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
      triggerExplosion(target.x + (Math.random() - 0.5) * 28, target.y + (Math.random() - 0.5) * 28, 46, 26, "enemy");
      enemy.specialCooldown = 5.5;
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
    if (enemy.alert === "alert") enemy.alert = "search";
    if (enemy.patrol && enemy.patrol.length > 0) {
      const point = enemy.patrol[enemy.patrolIndex];
      const d = Math.hypot(point.x - enemy.x, point.y - enemy.y);
      if (d < 10) {
        enemy.patrolIndex = (enemy.patrolIndex + 1) % enemy.patrol.length;
      } else {
        moveToward(enemy, point.x, point.y, 0.38, dt);
      }
    } else {
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
  });

  state.bullets = state.bullets.filter((b) => {
    if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WIDTH || b.y > HEIGHT) return false;

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
        if (b.team === "player") state.stats.hits += 1;
        if (b.team !== "enemy") alertNearbyEnemies(t, 220);
        if (t.team !== "enemy" && t !== state.player && t.hp <= 0) {
          t.downed = true;
          t.hp = t.maxHp * 0.25;
          t.bleedout = 12;
          setMessage(`${classConfigs[t.role].label} 다운! 접근하여 회복하라`);
        }
        if (t.team === "enemy" && t.hp <= 0 && b.team === "player") state.stats.kills += 1;
        state.effects.push({ x: t.x, y: t.y, r: 15, life: 0.2, color: "#ff6b6b" });
        updateHud();
        return false;
      }
    }
    return true;
  });

  state.cover = state.cover.filter((c) => c.hp > 0);
}

function updateEffects(dt) {
  state.effects.forEach((e) => (e.life -= dt));
  state.effects = state.effects.filter((e) => e.life > 0);
}

function handleInteract() {
  input.interact = false;
  const p = state.player;
  const downedAlly = state.allies.find((ally) => ally.downed && dist(p, ally) < 34);
  if (downedAlly) {
    downedAlly.downed = false;
    downedAlly.hp = downedAlly.maxHp * 0.55;
    state.stats.revives += 1;
    setMessage(`${classConfigs[downedAlly.role].label} 회복 완료`);
    updateHud();
    return;
  }

  if (state.selectedMission === "outpostDefense") return;

  if (!state.intel.collected && Math.hypot(p.x - state.intel.x, p.y - state.intel.y) < 28) {
    state.intel.collected = true;
    state.objectivePhase = "extract";
    state.enemies.push(
      createUnit(900, 140, "enemy", "enemy", { color: "#ff7c7c", hp: 85, maxHp: 85, damage: 18 }),
      createUnit(900, 410, "enemy", "enemy", { color: "#ff7c7c", hp: 85, maxHp: 85, damage: 18 })
    );
    setMessage("정보 자료 확보. 탈출 지점으로 복귀하라", 4);
    updateHud();
    return;
  }

  if (state.objectivePhase === "extract" && Math.hypot(p.x - state.extraction.x, p.y - state.extraction.y) < 36) {
    state.victory = true;
    if (!state.stats.finishedAt) state.stats.finishedAt = performance.now();
    setMessage("작전 성공! 분대가 임무를 완수했다", 10);
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
  updateEffects(dt);

  if (state.selectedMission === "outpostDefense") {
    state.missionClock = Math.max(0, state.missionClock - dt);
    state.waveTimer -= dt;
    if (state.waveTimer <= 0 && state.wavesRemaining > 0) {
      state.waveTimer = 14;
      state.wavesRemaining -= 1;
      state.enemies.push(
        createUnit(910, 110 + Math.random() * 80, "enemy", "enemy", { color: "#ff9c6b", hp: 78, maxHp: 78, damage: 16 }),
        createUnit(920, 250 + Math.random() * 40, "enemy", "rifleman", { color: "#ff7c7c", hp: 72, maxHp: 72 }),
        createUnit(910, 360 + Math.random() * 80, "enemy", "enemy", { color: "#ff6b6b", hp: 88, maxHp: 88, damage: 18 })
      );
      setMessage("적 증원 도착! 방어선을 유지하라");
    }
  }

  const alertCount = state.enemies.filter((enemy) => enemy.hp > 0 && enemy.alert === "alert").length;
  state.alertLevel = alertCount >= 4 ? "높음" : alertCount >= 2 ? "중간" : "낮음";
  checkGameState();

  if (state.messageTimer > 0) state.messageTimer -= dt;
  updateHud();
}

function drawGrid() {
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let x = 0; x < WIDTH; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y < HEIGHT; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
}

function drawTerrain() {
  ctx.fillStyle = "#2f4b3e";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#3d5f50";
  ctx.fillRect(0, 0, 220, 145);

  state.cover.forEach((c) => {
    if (c.type === "building") ctx.fillStyle = "#51606d";
    else if (c.type === "sandbag") ctx.fillStyle = "#8a7f62";
    else if (c.type === "placedCover") ctx.fillStyle = "#c79e55";
    else if (c.type === "wall") ctx.fillStyle = "#7a6e66";
    else ctx.fillStyle = "#5f6c57";
    ctx.fillRect(c.x, c.y, c.w, c.h);
  });
}

function drawUnit(unit) {
  if (unit.hp <= 0 && !unit.downed) return;
  ctx.save();
  ctx.translate(unit.x, unit.y);
  ctx.rotate(unit.angle);

  ctx.fillStyle = unit.downed ? "#9aa4a0" : unit.color;
  ctx.beginPath();
  ctx.arc(0, 0, unit.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#18211a";
  ctx.fillRect(0, -3, unit.radius + 10, 6);
  ctx.restore();

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(unit.x - 16, unit.y - 22, 32, 5);
  ctx.fillStyle = unit.team === "enemy" ? "#ff7474" : "#86e886";
  ctx.fillRect(unit.x - 16, unit.y - 22, 32 * (unit.hp / unit.maxHp), 5);
}

function drawObjectives() {
  if (state.selectedMission === "outpostDefense" && state.defendZone) {
    ctx.strokeStyle = "rgba(137,247,198,0.9)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(state.defendZone.x, state.defendZone.y, state.defendZone.radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (state.intel && !state.intel.collected) {
    ctx.fillStyle = "#ffe082";
    ctx.beginPath();
    ctx.arc(state.intel.x, state.intel.y, state.intel.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4d4218";
    ctx.fillRect(state.intel.x - 8, state.intel.y - 10, 16, 20);
  }

  if (state.extraction) {
    ctx.strokeStyle = "#89f7c6";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(state.extraction.x, state.extraction.y, state.extraction.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBullets() {
  state.bullets.forEach((b) => {
    ctx.fillStyle = b.team === "enemy" ? "#ff9e9e" : "#fff5a5";
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawEffects() {
  state.effects.forEach((e) => {
    ctx.globalAlpha = Math.max(0, e.life * 2);
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * (2 - e.life), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
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
  if (!state.gameOver && !state.victory) return;
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "bold 34px sans-serif";
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

function render() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawTerrain();
  drawGrid();
  drawObjectives();
  [...state.enemies, ...state.allies, state.player].forEach(drawUnit);
  drawBullets();
  drawEffects();
  drawMessage();
  drawOverlay();
}

function loop(timestamp) {
  const dt = Math.min(0.033, (timestamp - state.lastTime) / 1000 || 0.016);
  state.lastTime = timestamp;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (e) => {
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

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  input.mouseX = ((e.clientX - rect.left) / rect.width) * WIDTH;
  input.mouseY = ((e.clientY - rect.top) / rect.height) * HEIGHT;
});

canvas.addEventListener("touchstart", (e) => {
  const touch = e.touches[0];
  if (!touch) return;
  const rect = canvas.getBoundingClientRect();
  input.mouseX = ((touch.clientX - rect.left) / rect.width) * WIDTH;
  input.mouseY = ((touch.clientY - rect.top) / rect.height) * HEIGHT;
});

canvas.addEventListener("touchmove", (e) => {
  const touch = e.touches[0];
  if (!touch) return;
  const rect = canvas.getBoundingClientRect();
  input.mouseX = ((touch.clientX - rect.left) / rect.width) * WIDTH;
  input.mouseY = ((touch.clientY - rect.top) / rect.height) * HEIGHT;
});

canvas.addEventListener("mousedown", () => (input.fire = true));
window.addEventListener("mouseup", () => (input.fire = false));

function pressButtonStart(btn, handler) {
  btn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    handler(true);
  });
  btn.addEventListener("touchend", (e) => {
    e.preventDefault();
    handler(false);
  });
  btn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    handler(true);
  });
  btn.addEventListener("mouseup", (e) => {
    e.preventDefault();
    handler(false);
  });
}

pressButtonStart(fireBtn, (v) => (input.fire = v));
pressButtonStart(interactBtn, (v) => {
  if (v) input.interact = true;
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

moveStick.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const t = e.changedTouches[0];
  stickTouchId = t.identifier;
  updateStick(t.clientX, t.clientY);
});

moveStick.addEventListener("touchmove", (e) => {
  e.preventDefault();
  const t = [...e.changedTouches].find((touch) => touch.identifier === stickTouchId);
  if (t) updateStick(t.clientX, t.clientY);
});

moveStick.addEventListener("touchend", (e) => {
  const t = [...e.changedTouches].find((touch) => touch.identifier === stickTouchId);
  if (t) resetStick();
});

classButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    classButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.selectedClass = btn.dataset.class;
    resetGame();
  });
});

missionButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    missionButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.selectedMission = btn.dataset.mission;
    resetGame();
  });
});

commandButtons.forEach((btn) => {
  btn.addEventListener("click", () => setSquadCommand(btn.dataset.command));
});

restartBtn.addEventListener("click", resetGame);

resetGame();
setSquadCommand("follow");
requestAnimationFrame(loop);
