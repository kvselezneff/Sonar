'use strict';
// ═══════════════════════════════════════════════════════════════════
//  ECHOSWEEPER — Prototype v0.4
//  New: 2 bosses + room 3, reworked hostile mechanics, HP/bat upgrades
// ═══════════════════════════════════════════════════════════════════

// ─── CONSTANTS ────────────────────────────────────────────────────
const HP_MAX_BASE              = 3;
const BAT_MAX_BASE             = 6;   // was 7, reduced per bug report
const BAT_START                = 3;
const ECHO_COST                = 2;
const HOSTILE_BOSS_SEG_TURNS   = 3;   // expires after 3 turns if on boss segment
// Boss 2 EMI pulse: escalating probability each pulse, resets after EMI fires
const EMI_PROBS = [0.10, 0.30, 0.50, 1.00];

// ─── BOSS SHAPES ──────────────────────────────────────────────────
// Boss 1: «Медленный Пульс» — 24 сег., 2 Глаза
const BOSS1_SHAPE = {
  name: 'Медленный Пульс',
  cells: [
    [3,0],[4,0],
    [1,1],[2,1],[3,1],[4,1],[5,1],[6,1],
    [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],
    [1,3],[2,3],[3,3],[4,3],[5,3],[6,3],
    [3,4],[4,4],
  ],
  eyeIndices: [10, 13],   // [2,2] and [5,2]
};

// Boss 2: «Хаотический Разряд» — 34 сег., 3 Глаза
const BOSS2_SHAPE = {
  name: 'Хаотический Разряд',
  cells: [
    [4,0],[5,0],[6,0],                                              // row0  idx 0-2
    [2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],                     // row1  idx 3-9
    [1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],[9,2],         // row2  idx 10-18
    [2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[8,3],                     // row3  idx 19-25
    [3,4],[4,4],[5,4],[6,4],[7,4],                                 // row4  idx 26-30
    [4,5],[5,5],[6,5],                                             // row5  idx 31-33
  ],
  eyeIndices: [6, 14, 22],   // [5,1], [5,2], [5,3] — vertical spine
};

const BOSS_SHAPES = [BOSS1_SHAPE, BOSS2_SHAPE];

// ─── PREDEFINED SHAPES ────────────────────────────────────────────
const GREEN_SHAPES = [
  { name: 'Галка',    cells: [[0,0],[0,1],[0,2],[1,2],[1,3]], memIdx: 0 },
  { name: 'Присоска', cells: [[1,0],[1,1],[0,2],[1,2],[1,3]], memIdx: 0 },
  { name: 'Жало',     cells: [[2,0],[0,1],[1,1],[2,1],[2,2]], memIdx: 0 },
  { name: 'Ключ',     cells: [[0,0],[1,0],[2,0],[3,0],[2,1]], memIdx: 0 },
  { name: 'Рогатка',  cells: [[0,0],[2,0],[1,1],[1,2],[1,3]], memIdx: 1 },
  { name: 'Заплатка', cells: [[1,0],[0,1],[1,1],[2,1],[1,2]], memIdx: 2 },
];
const YELLOW_SHAPES = [
  { name: 'Мини-Г', cells: [[0,0],[1,0],[2,0],[2,1]], memIdx: 0 },
  { name: 'Мини-Т', cells: [[0,0],[1,0],[2,0],[1,1]], memIdx: 1 },
  { name: 'Крюк',   cells: [[0,0],[0,1],[1,1],[1,2]], memIdx: 0 },
];

// ─── ROOM CONFIGS ─────────────────────────────────────────────────
const ROOM_CONFIGS = [
  {
    label: 'Комната 1', gridW: 10, gridH: 10, cellSize: 46, isBoss: false, bossIdx: null, pulseInterval: 5,
    ephConfig: [
      { type: 'green',  shapes: GREEN_SHAPES,  count: 2 },
      { type: 'yellow', shapes: YELLOW_SHAPES, count: 1 },
    ],
  },
  {
    label: 'Комната 2', gridW: 10, gridH: 10, cellSize: 46, isBoss: false, bossIdx: null, pulseInterval: 5,
    ephConfig: [
      { type: 'green',  shapes: GREEN_SHAPES,  count: 3 },
      { type: 'yellow', shapes: YELLOW_SHAPES, count: 2 },
    ],
  },
  {
    label: '⚡ БОСС 1', gridW: 12, gridH: 12, cellSize: 38, isBoss: true, bossIdx: 0, pulseInterval: 5,
    ephConfig: null,
  },
  {
    label: 'Комната 3', gridW: 10, gridH: 10, cellSize: 46, isBoss: false, bossIdx: null, pulseInterval: 5,
    ephConfig: [
      { type: 'green',  shapes: GREEN_SHAPES,  count: 3 },
      { type: 'yellow', shapes: YELLOW_SHAPES, count: 3 },
    ],
  },
  {
    label: '⚡ БОСС 2', gridW: 14, gridH: 14, cellSize: 32, isBoss: true, bossIdx: 1, pulseInterval: 3,
    ephConfig: null,
  },
];

// ─── SHAPE UTILITIES ──────────────────────────────────────────────
function rotate90(cells) {
  const maxY = Math.max(...cells.map(c => c[1]));
  return cells.map(([x, y]) => [maxY - y, x]);
}
function normalize(cells) {
  const minX = Math.min(...cells.map(c => c[0]));
  const minY = Math.min(...cells.map(c => c[1]));
  return cells.map(([x, y]) => [x - minX, y - minY]);
}
function randomRotation(cells) {
  const n = Math.floor(Math.random() * 4);
  let r = cells;
  for (let i = 0; i < n; i++) r = normalize(rotate90(r));
  return r;
}

// ─── AUDIO ────────────────────────────────────────────────────────
let _audioCtx = null;
function getAudio() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}
// Sonar ping: sine chirp + faint echo, pitch controlled by lamp index (0–4)
const SONAR_FREQS = [260, 350, 470, 620, 840];
function playSonarPing(lampIdx) {
  try {
    const ctx  = getAudio();
    const freq = SONAR_FREQS[Math.min(lampIdx, SONAR_FREQS.length - 1)];

    // ── Main ping (3× duration, slow fade-out) ───────────────────
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    // Upward chirp: starts 8% below target, sweeps to 3% above, settles
    osc.frequency.setValueAtTime(freq * 0.92, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.03, ctx.currentTime + 0.15);
    osc.frequency.exponentialRampToValueAtTime(freq,        ctx.currentTime + 0.36);
    // Envelope: near-instant attack, sustain 30%, then slow exponential decay
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.38,  ctx.currentTime + 0.027);
    gain.gain.setValueAtTime(0.38,           ctx.currentTime + 0.50);  // sustain
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.65);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.65);

    // ── Faint echo (~900 ms later, half volume) ──────────────────
    const osc2  = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2); gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.value = freq;
    const t2 = ctx.currentTime + 0.90;
    gain2.gain.setValueAtTime(0.001, t2);
    gain2.gain.linearRampToValueAtTime(0.10, t2 + 0.024);
    gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 1.20);
    osc2.start(t2);
    osc2.stop(t2 + 1.20);
  } catch(e) {}
}

function playTone(freq, dur = 0.45, type = 'sine', vol = 0.2) {
  try {
    const ctx = getAudio();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    // Sustain 30%, then slow exponential fade-out
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime + dur * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(); osc.stop(ctx.currentTime + dur);
  } catch(e) {}
}
const SFX = {
  oi:      () => playTone(880, 0.36, 'sine',     0.2),
  green:   () => playTone(523, 0.45, 'triangle', 0.25),
  yellow:  () => { playTone(660, 0.3, 'sine', 0.2); setTimeout(() => playTone(880, 0.3, 'sine', 0.15), 240); },
  money:   () => { playTone(660, 0.21, 'square', 0.12); setTimeout(() => playTone(880, 0.21, 'square', 0.12), 210); },
  battery: () => playTone(330, 0.36, 'triangle', 0.2),
  warn:    () => { [0, 450, 900].forEach(d => setTimeout(() => playTone(180, 0.36, 'sawtooth', 0.3), d)); },
  combo:   () => playTone(1047, 0.66, 'sine', 0.28),
  pulse:   () => { playTone(200, 0.9, 'sawtooth', 0.35); setTimeout(() => playTone(150, 1.2, 'sawtooth', 0.28), 600); },
  victory: () => { [0,450,900,1350].forEach((d,i) => setTimeout(() => playTone(523*(1+i*0.15), 0.75, 'sine', 0.3), d)); },
  shop:      () => { playTone(440, 0.3, 'sine', 0.15); setTimeout(() => playTone(550, 0.45, 'sine', 0.2), 300); },
  blocked:   () => playTone(120, 0.6, 'square', 0.25),
  emi:       () => {
    // EMP buzz: descending electric sweep
    [0, 90, 200, 360].forEach((d, i) =>
      setTimeout(() => playTone(260 - i * 45, 0.45, 'sawtooth', 0.32 - i * 0.05), d)
    );
  },
  sonarPing: (i) => playSonarPing(i),
};

// ─── PERSISTENT STATE (survives newRun) ───────────────────────────
const encyclopedia = new Set();
let encyclopediaAtRunStart = new Set();

// ─── RUN STATE ────────────────────────────────────────────────────
let RUN = {};
let currentRoomIdx = 0;

function initRun() {
  encyclopediaAtRunStart = new Set(encyclopedia);
  RUN = {
    hp:          HP_MAX_BASE,
    hpMax:       HP_MAX_BASE,
    hpUpgrades:  0,
    batMax:      BAT_MAX_BASE,
    batUpgrades: 0,
    battery:     BAT_START,
    comboNums:   0,
    res:         { green: 0, yellow: 0, pearl: 0, money: 0, oi: 0 },
    inventory:   [],   // consumable items in card slots (max 2)
  };
}

// ─── ROOM STATE ───────────────────────────────────────────────────
let S = {};

function startRoom(roomIdx) {
  currentRoomIdx = roomIdx;
  const cfg = ROOM_CONFIGS[roomIdx];
  S = {
    gridW:    cfg.gridW,
    gridH:    cfg.gridH,
    cellSize: cfg.cellSize,
    grid:     makeGrid(cfg.gridW, cfg.gridH),
    ephemers: [],
    player: {
      hp:          RUN.hp,
      hpMax:       RUN.hpMax,
      hpUpgrades:  RUN.hpUpgrades,
      battery:     RUN.battery,
      batMax:      RUN.batMax,
      batUpgrades: RUN.batUpgrades,
      res:         { ...RUN.res },
      comboNums:   RUN.comboNums,
      inventory:   [...RUN.inventory],
    },
    tool:         'locator',
    turn:         0,
    phase:        'playing',
    pendingPhase: null,
    log:          [],
    pulseTimer:      cfg.pulseInterval,
    hostileCells:    [],
    emiPulseCount:   0,     // how many pulses since last EMI (Boss 2 only)
    emiBlockedSlot:  null,  // card index 1–3 blocked for 1 turn (null = none)
    newEmptyCells: new Set(),
    stats: {
      emptyCells:   0,
      numberCells:  0,
      segsScanned:  0,
      oiEarned:     0,
      dmgOverload:  0,
      dmgEphemeral: 0,
    },
  };
  if (cfg.isBoss) placeBoss(cfg.bossIdx);
  else            placeEphemers(cfg.ephConfig);
  calcResonance();
  hideShopOverlay();
  renderAll();
  const bossMsg = cfg.isBoss
    ? `⚡ Найди и просканируй все Глаза Эхолучом!`
    : `${S.ephemers.length} Эфемера в секторе.`;
  addLog(`📻 ${cfg.label}. ${bossMsg}`, 'info');
  renderLog();
}

function saveRoomToRun() {
  RUN.hp          = S.player.hp;
  RUN.hpMax       = S.player.hpMax;
  RUN.hpUpgrades  = S.player.hpUpgrades;
  RUN.battery     = S.player.battery;
  RUN.batMax      = S.player.batMax;
  RUN.batUpgrades = S.player.batUpgrades;
  RUN.comboNums   = S.player.comboNums;
  RUN.res         = { ...S.player.res };
  RUN.inventory   = [...S.player.inventory];
}

// ─── GRID ─────────────────────────────────────────────────────────
function makeGrid(w, h) {
  const g = [];
  for (let y = 0; y < h; y++) {
    g[y] = [];
    for (let x = 0; x < w; x++)
      g[y][x] = { x, y, vis: false, state: 'hidden', resNum: 0, eIdx: -1,
                  isMembrane: false, isEye: false, isHostile: false };
  }
  return g;
}
const cell = (x, y) =>
  (x >= 0 && x < S.gridW && y >= 0 && y < S.gridH) ? S.grid[y][x] : null;
const nb8 = (x, y) => {
  const r = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (dx || dy) { const c = cell(x+dx, y+dy); if (c) r.push(c); }
  return r;
};

// ─── EPHEMER PLACEMENT (3 attempts, pick fewest empty cells) ──────
function placeEphemers(ephConfig) {
  let bestGrid = null, bestEphemers = null, bestScore = Infinity;
  for (let attempt = 0; attempt < 3; attempt++) {
    const trialGrid     = makeGrid(S.gridW, S.gridH);
    const trialEphemers = [];
    _placeEphemersOnGrid(trialGrid, trialEphemers, ephConfig);
    _calcResOnGrid(trialGrid, S.gridW, S.gridH);
    let emptyCount = 0;
    for (let y = 0; y < S.gridH; y++)
      for (let x = 0; x < S.gridW; x++)
        if (trialGrid[y][x].eIdx === -1 && trialGrid[y][x].resNum === 0) emptyCount++;
    if (emptyCount < bestScore) {
      bestScore    = emptyCount;
      bestGrid     = trialGrid;
      bestEphemers = trialEphemers;
    }
  }
  S.grid     = bestGrid;
  S.ephemers = bestEphemers;
}

function _placeEphemersOnGrid(grid, ephemers, ephConfig) {
  const occupied   = new Set();
  const usedShapes = new Set();
  for (const cfg of ephConfig) {
    for (let i = 0; i < cfg.count; i++) {
      const available = cfg.shapes.filter((_, idx) => !usedShapes.has(cfg.type + idx));
      const pool      = available.length ? available : cfg.shapes;
      const shapeDef  = pool[Math.floor(Math.random() * pool.length)];
      const shapeIdx  = cfg.shapes.indexOf(shapeDef);
      usedShapes.add(cfg.type + shapeIdx);
      const rotCells = randomRotation(shapeDef.cells);
      const placed   = _tryPlace(rotCells, occupied, shapeDef.memIdx);
      if (!placed) { continue; }
      placed.forEach(s => occupied.add(`${s.x},${s.y}`));
      const eph = {
        id: ephemers.length, type: cfg.type, name: shapeDef.name,
        segs: placed, scanned: 0, opened: 0,
        done: false, triggered: false,
        discovered: encyclopedia.has(shapeDef.name),  // fix: mark known
      };
      placed.forEach(s => {
        const c = grid[s.y][s.x];
        c.eIdx = eph.id; c.isMembrane = s.isMembrane;
      });
      ephemers.push(eph);
    }
  }
}

function _tryPlace(rotCells, occupied, origMemIdx) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const ox = 1 + Math.floor(Math.random() * (S.gridW - 4));
    const oy = 1 + Math.floor(Math.random() * (S.gridH - 4));
    const placed = rotCells.map(([cx, cy], idx) => ({
      x: cx + ox, y: cy + oy, isMembrane: (idx === origMemIdx),
    }));
    if (placed.some(s => s.x >= S.gridW || s.y >= S.gridH)) continue;
    if (placed.some(s => occupied.has(`${s.x},${s.y}`))) continue;
    const placedKeys = new Set(placed.map(s => `${s.x},${s.y}`));
    const sideBlocked = placed.some(s =>
      [[0,1],[0,-1],[1,0],[-1,0]].some(([dx,dy]) => {
        const k = `${s.x+dx},${s.y+dy}`;
        return occupied.has(k) && !placedKeys.has(k);
      })
    );
    if (sideBlocked) continue;
    return placed;
  }
  return null;
}

function _calcResOnGrid(grid, w, h) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = grid[y][x];
      if (c.eIdx !== -1) continue;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x+dx, ny = y+dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && grid[ny][nx].eIdx !== -1) count++;
        }
      c.resNum = count;
    }
}

// ─── BOSS PLACEMENT ───────────────────────────────────────────────
function placeBoss(bossIdx) {
  const shape = BOSS_SHAPES[bossIdx ?? 0];
  const maxX  = Math.max(...shape.cells.map(c => c[0]));
  const maxY  = Math.max(...shape.cells.map(c => c[1]));
  const ox = 1 + Math.floor(Math.random() * Math.max(1, S.gridW - maxX - 2));
  const oy = 1 + Math.floor(Math.random() * Math.max(1, S.gridH - maxY - 2));
  const segs = shape.cells.map(([cx, cy], idx) => ({
    x: cx + ox, y: cy + oy,
    isMembrane: shape.eyeIndices.includes(idx),
    isEye:      shape.eyeIndices.includes(idx),
  }));
  const boss = {
    id: 0, type: 'boss', name: shape.name,
    segs, scanned: 0, opened: 0,
    done: false, triggered: false, discovered: true,
    eyesScanned: 0, totalEyes: shape.eyeIndices.length,
  };
  segs.forEach(s => {
    const c = cell(s.x, s.y);
    if (c) { c.eIdx = 0; c.isMembrane = s.isMembrane; c.isEye = s.isEye; }
  });
  S.ephemers.push(boss);
}

// ─── RESONANCE NUMBERS ────────────────────────────────────────────
function calcResonance() {
  _calcResOnGrid(S.grid, S.gridW, S.gridH);
}

// ─── BOSS PULSE ───────────────────────────────────────────────────
function tickBossPulse() {
  const cfg = ROOM_CONFIGS[currentRoomIdx];
  if (!cfg.isBoss || S.phase !== 'playing') return;

  // Only boss-segment hostiles have a timer; permanent ones stay forever
  S.hostileCells = S.hostileCells.filter(h => {
    if (h.permanent) return true;
    h.turnsLeft--;
    return h.turnsLeft > 0;
  });

  // Sync isHostile flags on grid
  for (let y = 0; y < S.gridH; y++)
    for (let x = 0; x < S.gridW; x++)
      S.grid[y][x].isHostile = false;
  S.hostileCells.forEach(h => { const c = cell(h.x, h.y); if (c) c.isHostile = true; });

  S.pulseTimer--;
  if (S.pulseTimer <= 0) {
    triggerPulse();
    S.pulseTimer = cfg.pulseInterval;
  }
}

function triggerEMI() {
  const p = S.player;

  // 50/50: add or drain 3 energy
  const addEnergy3 = Math.random() < 0.5;
  let dmg = false;
  let msg;
  if (addEnergy3) {
    if (p.battery + 3 > p.batMax) {
      p.battery = p.batMax;
      dmg = true;
      msg = `⚡ ЭМИ ИМПУЛЬС! +3э → ПЕРЕГРУЗКА → –1 HP!`;
    } else {
      p.battery += 3;
      msg = `⚡ ЭМИ ИМПУЛЬС! +3э (повезло)`;
    }
  } else {
    if (p.battery < 3) {
      p.battery = Math.max(0, p.battery - 3);
      dmg = true;
      msg = `⚡ ЭМИ ИМПУЛЬС! –3э → РАЗРЯД → –1 HP!`;
    } else {
      p.battery -= 3;
      msg = `⚡ ЭМИ ИМПУЛЬС! –3э (не повезло)`;
    }
  }
  if (dmg) takeDamage(1);

  // Block a random slot 1–3 (never slot 0 = Locator)
  S.emiBlockedSlot = 1 + Math.floor(Math.random() * 3);
  const slotNames = ['', 'Эхолуч', 'Слот 3', 'Слот 4'];
  addLog(msg, dmg ? 'err' : 'warn');
  addLog(`🔒 ${slotNames[S.emiBlockedSlot]} заблокирован на 1 ход!`, 'warn');
  SFX.emi();
}

function triggerPulse() {
  // Boss 2: check for EMI instead of hostile cells
  const cfg = ROOM_CONFIGS[currentRoomIdx];
  if (cfg.isBoss && cfg.bossIdx === 1) {
    S.emiPulseCount++;
    const prob = EMI_PROBS[Math.min(S.emiPulseCount - 1, EMI_PROBS.length - 1)];
    if (Math.random() < prob) {
      triggerEMI();
      S.emiPulseCount = 0;
      return; // EMI fires — no hostile cells this pulse
    }
  }

  const boss       = S.ephemers[0];
  const bossSegSet = new Set(boss.segs.map(s => `${s.x},${s.y}`));

  // Exclusion zone: all existing hostile cells + their 8-neighbours
  const excludeSet = new Set();
  S.hostileCells.forEach(h => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        excludeSet.add(`${h.x+dx},${h.y+dy}`);
  });

  const candidates = [];
  for (let y = 0; y < S.gridH; y++)
    for (let x = 0; x < S.gridW; x++) {
      const c = S.grid[y][x];
      if (c.state === 'hidden' && !c.isHostile && !excludeSet.has(`${x},${y}`))
        candidates.push(c);
    }

  const count = Math.min(2, candidates.length);
  for (let i = 0; i < count; i++) {
    const idx    = Math.floor(Math.random() * candidates.length);
    const chosen = candidates.splice(idx, 1)[0];
    chosen.isHostile = true;
    const onBoss = bossSegSet.has(`${chosen.x},${chosen.y}`);
    S.hostileCells.push({
      x: chosen.x, y: chosen.y,
      permanent:  !onBoss,
      turnsLeft:  onBoss ? HOSTILE_BOSS_SEG_TURNS : Infinity,
    });
    // Expand exclusion so the second pick respects the first
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        excludeSet.add(`${chosen.x+dx},${chosen.y+dy}`);
  }
  addLog(`⚡ ПУЛЬС! ${count} клетки враждебны!`, 'err');
  SFX.pulse();
}

// ─── HELPERS ──────────────────────────────────────────────────────
function addOI(n) { S.player.res.oi += n; S.stats.oiEarned += n; SFX.oi(); }

// ─── TOOL APPLICATION ─────────────────────────────────────────────
function applyTool(x, y) {
  if (S.phase !== 'playing') return;
  const c = cell(x, y);
  if (!c || c.state !== 'hidden') return;
  // EMI block: Echobeamer blocked → refuse, turn NOT consumed
  if (S.tool === 'echobeamer' && S.emiBlockedSlot === 1) {
    addLog('🔒 ЭХОЛУЧ ЗАБЛОКИРОВАН ЭМИ! (этот ход)', 'warn');
    SFX.blocked();
    renderLog();
    renderToolCards();
    return;
  }
  S.newEmptyCells = new Set();
  const turnConsumed = S.tool === 'locator' ? doLocator(c) : doEchobeamer(c);
  if (turnConsumed !== false) {
    S.turn++;
    tickBossPulse();
    S.emiBlockedSlot = null; // 1 turn has passed — unblock
  }
  checkWinLose();
  // If phase just changed to terminal — start countdown, don't show overlay yet
  if (S.phase !== 'playing' && S.phase !== 'countdown') {
    startCountdown(S.phase);
  } else {
    renderAll();
  }
}

// ── LOCATOR ──
function doLocator(c) {
  // BLOCKED on hostile cell — no turn spent
  if (c.isHostile) {
    addLog(`🚫 Враждебная клетка — Локатор заблокирован!`, 'warn');
    SFX.blocked();
    renderLog();
    return false;
  }

  // Adjacent to hostile → -1э (or -1 HP if empty)
  if (nb8(c.x, c.y).some(n => n.isHostile)) {
    if (S.player.battery > 0) {
      addEnergy(-1, false);
      addLog(`⚡ Зона помех! –1э.`, 'warn');
    } else {
      S.stats.dmgEphemeral++;
      takeDamage(1);
      addLog(`⚡ Зона помех! Нет энергии — –1 HP!`, 'err');
      if (S.phase !== 'playing') return true;
    }
  }

  if (c.eIdx !== -1) {
    const eph = S.ephemers[c.eIdx];
    eph.discovered = true;
    S.stats.dmgEphemeral++;
    takeDamage(1);
    c.state = 'open'; c.vis = true;
    eph.opened++;
    if (eph.type === 'boss') {
      addLog(`⚠ Локатор на Босса! –1 HP. Сегмент потерян.`, 'err');
    } else if (eph.type === 'yellow') {
      addLog(`💥 ВЗРЫВ! Жёлтый –1 HP. Взрыв 3×3 +2э`, 'err');
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nc = cell(c.x+dx, c.y+dy);
          if (nc && nc.state === 'hidden') explodeReveal(nc);
        }
      addEnergy(2, true);
    } else {
      addLog(`⚡ Штраф! Локатор на ${eph.name}. –1 HP.`, 'err');
    }
    checkEphDone(eph);
  } else {
    if (c.resNum === 0) {
      c.state = 'empty'; c.vis = true;
      S.newEmptyCells.add(`${c.x},${c.y}`);
      S.stats.emptyCells++;
      addEnergy(1, true);
      addLog(`📡 Пустая. +1э.`, 'ok');
      SFX.battery();
    } else {
      c.state = 'number'; c.vis = true;
      S.stats.numberCells++;
      addLog(`📍 Число ${c.resNum}.`, 'info');
      SFX.sonarPing(S.player.comboNums);   // ping BEFORE increment: 0→4 = lamp index
      S.player.comboNums++;
      if (S.player.comboNums >= 5) {
        S.player.comboNums = 0;
        addOI(1);
        addLog(`💡 КОМБО-РАЗРЯД! 5 чисел → +1 ОИ`, 'ok');
        SFX.combo();
      }
    }
  }
  return true;
}

function explodeReveal(c) {
  if (c.eIdx !== -1) {
    const eph = S.ephemers[c.eIdx];
    eph.discovered = true;
    c.state = 'open'; c.vis = true;
    eph.opened++;
    checkEphDone(eph);
  } else if (c.resNum === 0) {
    floodFill(c.x, c.y);
  } else {
    c.state = 'number'; c.vis = true;
  }
}

function floodFill(sx, sy) {
  const start = cell(sx, sy);
  if (!start || start.state !== 'hidden' || start.eIdx !== -1) return;
  start.state = 'empty'; start.vis = true;
  S.newEmptyCells.add(`${sx},${sy}`);
  const queue   = [{ x: sx, y: sy }];
  const visited = new Set([`${sx},${sy}`]);
  while (queue.length) {
    const { x, y } = queue.shift();
    const cur = cell(x, y);
    if (!cur || cur.resNum !== 0 || cur.eIdx !== -1) continue;
    for (const n of nb8(x, y)) {
      const k = `${n.x},${n.y}`;
      if (visited.has(k) || n.state !== 'hidden' || n.eIdx !== -1) continue;
      visited.add(k);
      if (n.resNum === 0) {
        n.state = 'empty'; n.vis = true;
        S.newEmptyCells.add(k);
        queue.push({ x: n.x, y: n.y });
      } else {
        n.state = 'number'; n.vis = true;
      }
    }
  }
}

// ── ECHOBEAMER ──
function doEchobeamer(c) {
  if (S.player.battery < ECHO_COST) {
    addLog(`❌ Нет энергии для Эхолуча (нужно ${ECHO_COST}э).`, 'warn');
    return false;
  }
  if (c.eIdx === -1) {
    addEnergy(-ECHO_COST, false);
    c.state = c.resNum === 0 ? 'empty' : 'number'; c.vis = true;
    addLog(`🔊 Эхолуч на пустую. –${ECHO_COST}э. Впустую.`, 'warn');
    return true;
  }
  const eph = S.ephemers[c.eIdx];
  eph.discovered = true;
  addEnergy(-ECHO_COST, false);
  c.state = 'scanned'; c.vis = true;
  eph.scanned++;

  S.stats.segsScanned++;
  if (eph.type === 'boss') {
    if (c.isEye) {
      eph.eyesScanned++;
      // Speed up pulse by 2 turns (find eye → danger rises!)
      S.pulseTimer = Math.max(1, S.pulseTimer - 2);
      addLog(`👁 ГЛАЗ! Пульс ускорился! (${eph.eyesScanned}/${eph.totalEyes})`, 'trigger');
      SFX.combo();
    } else {
      addEnergy(1, false);
      addLog(`✅ Сегмент Босса. –${ECHO_COST}э. +1э обратно.`, 'ok');
      SFX.green();
    }
  } else if (eph.type === 'green') {
    S.player.res.green++;
    addOI(1);
    addLog(`✅ Зелёный. +1 эссенция +1 ОИ. –${ECHO_COST}э.`, 'ok');
    SFX.green();
  } else if (eph.type === 'yellow') {
    const room = S.player.batMax - S.player.battery;
    if (room >= 4) {
      addEnergy(4, false);
      addLog(`✅ Жёлтый. +4э. Итого: ${S.player.battery}/${S.player.batMax}.`, 'ok');
    } else {
      if (room > 0) addEnergy(room, false);
      S.player.res.yellow++;
      addLog(`✅ Жёлтый. Батарея полна. +1 эфир.`, 'ok');
    }
    SFX.yellow();
  }

  if (c.isMembrane && eph.type !== 'boss') {
    const revealed = eph.scanned + eph.opened;
    if (revealed === eph.segs.length) {
      eph.triggered = true;
      addEnergy(2, false);
      addOI(3);
      S.player.res.money += 10;
      addLog(`🎯 MEMBRANE TRIGGER! +2э +3 ОИ +10м!`, 'trigger');
    }
  }
  checkEphDone(eph);
  return true;
}

// ─── EPHEMER COMPLETION ───────────────────────────────────────────
function checkEphDone(eph) {
  if (eph.done) return;
  if (eph.type === 'boss') {
    if (eph.eyesScanned >= eph.totalEyes) {
      eph.done  = true;
      S.phase   = 'boss-won';
      addLog(`🏆 ВСЕ ГЛАЗА УНИЧТОЖЕНЫ! БОСС ПОВЕРЖЕН!`, 'trigger');
      SFX.victory();
    }
    return;
  }
  if (eph.scanned + eph.opened >= eph.segs.length) {
    eph.done = true;
    const clean = eph.opened === 0;
    encyclopedia.add(eph.name);
    S.player.res.money += clean ? 10 : 5;
    addOI(clean ? 5 : 2);
    SFX.money();
    addLog(`🏁 ${eph.name} завершён. ${clean ? '✦ Чисто! +10м +5 ОИ' : `${eph.opened} потеряно. +5м +2 ОИ`}`, 'ok');
  }
}

// ─── PLAYER STATS ─────────────────────────────────────────────────
function addEnergy(delta, overflow) {
  if (delta > 0) {
    const prev = S.player.battery;
    const next  = prev + delta;
    if (overflow && next > S.player.batMax) {
      S.player.battery = S.player.batMax;
      addLog(`⚡ Перегрузка батареи! –1 HP`, 'err');
      S.stats.dmgOverload++;
      takeDamage(1);
    } else {
      S.player.battery = Math.min(S.player.batMax, next);
    }
    if (S.player.battery === S.player.batMax && prev < S.player.batMax) {
      addLog(`❗ РИСК ПЕРЕГРУЗКИ — батарея полна! Переключитесь на Эхолуч!`, 'err');
      SFX.warn();
    }
  } else {
    S.player.battery = Math.max(0, S.player.battery + delta);
  }
}

function takeDamage(n) {
  const shieldIdx = S.player.inventory.findIndex(i => i.type === 'shield');
  if (shieldIdx !== -1) {
    S.player.inventory.splice(shieldIdx, 1);
    addLog(`🛡 Резонансный щит поглотил урон!`, 'ok');
    return;
  }
  S.player.hp = Math.max(0, S.player.hp - n);
  if (S.player.hp <= 0) { S.phase = 'lost'; addLog(`💀 HP = 0. Забег окончен.`, 'err'); }
}

// ─── WIN / LOSE CHECK ─────────────────────────────────────────────
function checkWinLose() {
  if (S.phase === 'boss-won' || S.phase === 'lost') return;
  if (S.phase !== 'playing') return;

  const cfg = ROOM_CONFIGS[currentRoomIdx];
  if (cfg.isBoss) {
    // Extra lose: no safe (non-hostile, non-adjacent-to-hostile) hidden cells
    let hasPlayable = false;
    outer:
    for (let y = 0; y < S.gridH; y++)
      for (let x = 0; x < S.gridW; x++) {
        const c = S.grid[y][x];
        if (c.state === 'hidden' && !c.isHostile && !nb8(x, y).some(n => n.isHostile)) {
          hasPlayable = true; break outer;
        }
      }
    if (!hasPlayable) {
      S.phase = 'lost';
      addLog(`💀 Пульс заполнил сектор! Нет безопасных клеток!`, 'err');
    }
  } else {
    if (S.ephemers.every(e => e.done)) {
      S.phase = 'won';
      addLog(`🏆 Все Эфемеры завершены!`, 'ok');
    }
  }
}

function exitRoom() {
  if (ROOM_CONFIGS[currentRoomIdx].isBoss) return;  // blocked in boss rooms
  if (S.phase !== 'playing') return;
  S.phase = 'escaped';
  addLog(`🚪 Покинули комнату. HP ${S.player.hp}/${S.player.hpMax} сохранено.`, 'warn');
  startCountdown('escaped');
}

// ─── INSTITUTE PREMIUM ────────────────────────────────────────────
function institutePremium(oi) {
  if (oi > 70) return { amount: 60, label: 'феноменальный объём' };
  if (oi > 50) return { amount: 45, label: 'большой объём' };
  if (oi > 30) return { amount: 30, label: 'средний объём' };
  return { amount: 0, label: null };
}

// ─── COUNTDOWN SEQUENCE ───────────────────────────────────────────
function startCountdown(finalPhase) {
  S.phase        = 'countdown';
  S.pendingPhase = finalPhase;
  renderAll();  // render without overlay (countdown phase hides it)

  const steps = [
    { msg: 'ВАША ТЕКУЩАЯ РАБОТА ЗАКОНЧЕНА',       type: 'trigger' },
    { msg: 'ПОДГОТОВЬТЕСЬ ПОКИНУТЬ ЭХО-КАМЕРУ',  type: 'warn'    },
    { msg: '5', type: 'dim' },
    { msg: '4', type: 'dim' },
    { msg: '3', type: 'dim' },
    { msg: '2', type: 'dim' },
    { msg: '1', type: 'dim' },
    { msg: '……………………', type: 'dim' },
  ];
  steps.forEach(({ msg, type }, i) => {
    setTimeout(() => { addLog(msg, type); renderLog(); }, i * 1000);
  });

  // After countdown: add Institute premium, finalize
  setTimeout(() => {
    const { amount } = institutePremium(S.stats.oiEarned);
    if (amount > 0) S.player.res.money += amount;
    S.phase = S.pendingPhase;
    renderAll();
  }, steps.length * 1000);
}

// ─── SHOP LOGIC ───────────────────────────────────────────────────
const BAT_UPGRADE_COSTS = [5, 7, 10];
const HP_UPGRADE_COSTS  = [5, 7, 10];

let shopNextRoomIdx = 1;
let shopMsg = '';

function showShopOverlay(nextRoomIdx) {
  shopNextRoomIdx = nextRoomIdx;
  shopMsg = '';
  const isBeforeBoss = ROOM_CONFIGS[nextRoomIdx]?.isBoss;
  document.getElementById('shop-subtitle').textContent =
    isBeforeBoss ? '⚡ Последний шанс перед Боссом!' : `Перед ${ROOM_CONFIGS[nextRoomIdx]?.label}`;
  document.getElementById('shop-overlay').classList.remove('hidden');
  SFX.shop();
  renderShopOverlay();
}

function hideShopOverlay() {
  document.getElementById('shop-overlay').classList.add('hidden');
}

function shopAction(action) {
  const res = RUN.res;
  let msg = '';
  switch(action) {
    case 'heal-essence':
      if (RUN.hp >= RUN.hpMax) { msg = '❌ HP уже максимальный'; break; }
      if (res.green < 3)       { msg = '❌ Нужно 3 зел. эссенции'; break; }
      res.green -= 3; RUN.hp++;
      msg = `🏥 +1 HP. Эссенции осталось: ${res.green}`;
      break;
    case 'heal-money':
      if (RUN.hp >= RUN.hpMax) { msg = '❌ HP уже максимальный'; break; }
      if (res.money < 50)      { msg = '❌ Нужно 50 монет'; break; }
      res.money -= 50; RUN.hp++;
      msg = `🏥 +1 HP. Монет осталось: ${res.money}`;
      break;
    case 'hp-up': {
      const idx = RUN.hpUpgrades;
      if (idx >= HP_UPGRADE_COSTS.length) { msg = '❌ Максимум улучшений HP'; break; }
      const cost = HP_UPGRADE_COSTS[idx];
      if (res.green < cost) { msg = `❌ Нужно ${cost} зел. эссенции`; break; }
      res.green -= cost; RUN.hpMax++; RUN.hpUpgrades++;
      msg = `🏥 HP макс. +1 → ${RUN.hpMax}. Следующее: ${HP_UPGRADE_COSTS[idx+1] ?? '—'}`;
      break;
    }
    case 'battery-up': {
      const idx = RUN.batUpgrades;
      if (idx >= BAT_UPGRADE_COSTS.length) { msg = '❌ Максимум улучшений батареи'; break; }
      const cost = BAT_UPGRADE_COSTS[idx];
      if (res.yellow < cost) { msg = `❌ Нужно ${cost} жёлт. эфира`; break; }
      res.yellow -= cost; RUN.batMax++; RUN.batUpgrades++;
      msg = `🔋 Батарея макс. +1 → ${RUN.batMax}. Следующее: ${BAT_UPGRADE_COSTS[idx+1] ?? '—'}`;
      break;
    }
    case 'battery-charge':
      if (res.oi < 20) { msg = '❌ Нужно 20 ОИ'; break; }
      res.oi -= 20;
      RUN.battery = Math.min(RUN.batMax, RUN.battery + 3);
      msg = `⚡ +3э. Батарея: ${RUN.battery}/${RUN.batMax}. ОИ осталось: ${res.oi}`;
      break;
    case 'sell-green':
      if (res.green === 0) { msg = '❌ Нет зел. эссенции'; break; }
      { const ge = res.green * 10; res.money += ge; msg = `💰 Продано ${res.green} эссенции за ${ge}м.`; res.green = 0; }
      break;
    case 'sell-yellow':
      if (res.yellow === 0) { msg = '❌ Нет жёлт. эфира'; break; }
      { const ye = res.yellow * 15; res.money += ye; msg = `💰 Продано ${res.yellow} эфира за ${ye}м.`; res.yellow = 0; }
      break;
    case 'buy-shield':
      if (RUN.inventory.length >= 2) { msg = '❌ Оба слота заняты'; break; }
      if (res.money < 40) { msg = '❌ Нужно 40 монет'; break; }
      res.money -= 40; RUN.inventory.push({ type: 'shield' });
      msg = `🛡 Щит помещён в слот ${RUN.inventory.length}.`;
      break;
    case 'buy-powerbank':
      if (RUN.inventory.length >= 2) { msg = '❌ Оба слота заняты'; break; }
      if (res.money < 50) { msg = '❌ Нужно 50 монет'; break; }
      res.money -= 50; RUN.inventory.push({ type: 'powerbank' });
      msg = `⚡ Повербанк помещён в слот ${RUN.inventory.length}.`;
      break;
    default: msg = '?';
  }
  shopMsg = msg;
  renderShopOverlay();
}

// ─── TRANSITIONS ──────────────────────────────────────────────────
function onOverlayBtn() {
  const ph = S.phase;
  if (ph === 'lost') { newGameRun(); return; }
  // Final boss defeated → new run
  if (ph === 'boss-won' && currentRoomIdx >= ROOM_CONFIGS.length - 1) {
    newGameRun(); return;
  }
  // Continue: go to shop before next room
  if (currentRoomIdx < ROOM_CONFIGS.length - 1) {
    saveRoomToRun();
    document.getElementById('overlay').classList.add('hidden');
    showShopOverlay(currentRoomIdx + 1);
  } else {
    newGameRun();
  }
}

function newGameRun() {
  document.getElementById('overlay').classList.add('hidden');
  hideShopOverlay();
  initRun();
  startRoom(0);
}

// ─── LOG ──────────────────────────────────────────────────────────
function addLog(msg, type = 'info') {
  S.log.unshift({ msg, type });
  if (S.log.length > 20) S.log.pop();
}

// ─── RENDER ───────────────────────────────────────────────────────
function renderAll() {
  renderResBar();
  renderPhaseBar();
  renderBattery();
  renderGrid();
  renderToolCards();
  renderComboLamps();
  renderHP();
  renderEphTracker();
  renderLog();
  renderBossBar();
  renderOverlay();
}

function renderResBar() {
  document.getElementById('r-oi').textContent     = S.player.res.oi;
  document.getElementById('r-green').textContent  = S.player.res.green;
  document.getElementById('r-yellow').textContent = S.player.res.yellow;
  document.getElementById('r-pearl').textContent  = S.player.res.pearl;
  document.getElementById('r-money').textContent  = S.player.res.money;
  document.getElementById('turn-val').textContent = S.turn;
}

function renderPhaseBar() {
  // Steps: room1(0) shop1(1) room2(2) shop2(3) boss1(4) shop3(5) room3(6) shop4(7) boss2(8)
  let active = currentRoomIdx * 2;
  const shopVisible = !document.getElementById('shop-overlay').classList.contains('hidden');
  if (shopVisible) active = shopNextRoomIdx * 2 - 1;
  ['ps-room1','ps-shop1','ps-room2','ps-shop2','ps-boss1','ps-shop3','ps-room3','ps-shop4','ps-boss2']
    .forEach((id, idx) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.className = 'phase-step ' + (idx < active ? 'done' : idx === active ? 'active' : 'upcoming');
    });
}

function renderBattery() {
  const el = document.getElementById('bat-pips');
  el.innerHTML = '';
  for (let i = 0; i < S.player.batMax; i++) {
    const pip = document.createElement('div');
    const filled = i < S.player.battery;
    const isTop  = (i === S.player.batMax - 1);
    pip.className = 'bat-pip ' + (filled ? (isTop ? 'full warn' : 'full') : 'empty');
    el.appendChild(pip);
  }
  document.getElementById('bat-val').textContent = `${S.player.battery}/${S.player.batMax}`;
}

function renderGrid() {
  const cfg = ROOM_CONFIGS[currentRoomIdx];
  const wrap = document.getElementById('grid-wrap');
  wrap.className = S.tool === 'locator' ? 'tool-locator' : 'tool-echobeamer';
  const container = document.getElementById('grid');
  container.innerHTML = '';
  const cs = S.cellSize;
  container.style.gridTemplateColumns = `repeat(${S.gridW}, ${cs}px)`;
  container.style.gridTemplateRows    = `repeat(${S.gridH}, ${cs}px)`;

  for (let y = 0; y < S.gridH; y++) {
    for (let x = 0; x < S.gridW; x++) {
      const c  = S.grid[y][x];
      const el = document.createElement('div');
      el.className = 'cell';
      el.style.width = el.style.height = `${cs}px`;
      el.style.fontSize = cs < 40 ? '11px' : '15px';
      el.dataset.xy = `${x},${y}`;

      if (!c.vis) {
        el.classList.add('cell-hidden');
        if (c.isHostile) {
          el.classList.add('cell-hostile');
          el.textContent = '☠';
        } else if (cfg.isBoss && nb8(x, y).some(n => n.isHostile)) {
          el.classList.add('cell-hostile-neighbor');
        }
      } else {
        switch (c.state) {
          case 'empty':
            el.classList.add('cell-empty');
            if (S.newEmptyCells && S.newEmptyCells.has(`${x},${y}`))
              el.classList.add('cell-empty-anim');
            break;
          case 'number':
            el.classList.add('cell-number', `num-${c.resNum}`);
            if (c.resNum > 0) el.textContent = c.resNum;
            break;
          case 'open': {
            const eph = S.ephemers[c.eIdx];
            el.classList.add('cell-open', `open-${eph.type}`);
            el.textContent = c.isMembrane ? '◉' : '✕';
            break;
          }
          case 'scanned': {
            const eph = S.ephemers[c.eIdx];
            el.classList.add('cell-scanned', `scanned-${eph.type}`);
            if (c.isEye) {
              el.textContent = '★';
              el.classList.add('cell-eye');
            } else if (c.isMembrane) {
              el.textContent = eph.triggered ? '★' : '◆';
              if (eph.triggered) el.classList.add('membrane-triggered');
            } else {
              el.textContent = '●';
            }
            break;
          }
        }
      }
      el.addEventListener('click', () => applyTool(x, y));
      container.appendChild(el);
    }
  }

  // Exit button: visible but DISABLED in boss rooms
  const exitBtn = document.getElementById('btn-exit-room');
  exitBtn.style.display  = 'inline-block';
  exitBtn.disabled       = cfg.isBoss;
  exitBtn.style.opacity  = cfg.isBoss ? '0.35' : '1';
  exitBtn.style.cursor   = cfg.isBoss ? 'not-allowed' : 'pointer';
}

function renderToolCards() {
  const blocked = S.emiBlockedSlot;
  document.getElementById('card-0').className =
    'card-slot' + (S.tool === 'locator'    ? ' sel-locator' : '');
  document.getElementById('card-1').className =
    'card-slot' + (S.tool === 'echobeamer' ? ' sel-echobeamer' : '') +
    (blocked === 1 ? ' slot-blocked' : '');

  // Slots 2 & 3 — consumable inventory
  for (let i = 0; i < 2; i++) {
    const slotEl  = document.getElementById(`card-${i + 2}`);
    const item    = S.player.inventory[i];
    const isBlk   = blocked === (i + 2);
    if (!item) {
      slotEl.className = 'card-slot empty' + (isBlk ? ' slot-blocked' : '');
      slotEl.innerHTML = `<div class="card-inner empty-inner"><div class="empty-plus">+</div><div class="empty-label">слот</div></div>`;
    } else if (item.type === 'shield') {
      slotEl.className = 'card-slot consumable-shield' + (isBlk ? ' slot-blocked' : '');
      slotEl.innerHTML = `
        <div class="card-inner">
          <svg class="card-art" viewBox="0 0 64 64"><path d="M32 8 L54 18 L54 34 Q54 50 32 58 Q10 50 10 34 L10 18 Z" fill="none" stroke="#4ecdc4" stroke-width="2" opacity=".8"/><path d="M32 16 L46 23 L46 33 Q46 44 32 50 Q18 44 18 33 L18 23 Z" fill="rgba(78,205,196,.1)" stroke="#4ecdc4" stroke-width="1"/><text x="32" y="37" text-anchor="middle" font-size="14" fill="#4ecdc4">🛡</text></svg>
          <div class="card-name">ЩИТ</div>
          <div class="card-cost teal">${isBlk ? '🔒 БЛОК' : 'авто-защита'}</div>
        </div>`;
    } else if (item.type === 'powerbank') {
      slotEl.className = 'card-slot consumable-powerbank' + (isBlk ? ' slot-blocked' : '');
      slotEl.innerHTML = `
        <div class="card-inner">
          <svg class="card-art" viewBox="0 0 64 64"><rect x="14" y="20" width="36" height="24" rx="4" fill="none" stroke="#f39c12" stroke-width="2"/><rect x="50" y="28" width="5" height="8" rx="2" fill="#f39c12" opacity=".7"/><rect x="16" y="22" width="14" height="20" rx="2" fill="rgba(243,156,18,.35)"/><rect x="31" y="22" width="7" height="20" rx="2" fill="rgba(243,156,18,.2)"/><text x="32" y="37" text-anchor="middle" font-size="11" fill="#f39c12">+3э</text></svg>
          <div class="card-name">ПОВЕРБАНК</div>
          <div class="card-cost gold">${isBlk ? '🔒 БЛОК' : 'нажать → +3э'}</div>
        </div>`;
    }
  }
}

function useInventorySlot(slotIdx) {
  if (S.phase !== 'playing') return;
  const cardIdx = slotIdx + 2; // inventory slot 0 = card-2, slot 1 = card-3
  if (S.emiBlockedSlot === cardIdx) {
    addLog(`🔒 СЛОТ ${cardIdx + 1} ЗАБЛОКИРОВАН ЭМИ! (этот ход)`, 'warn');
    SFX.blocked();
    renderLog();
    return;
  }
  const item = S.player.inventory[slotIdx];
  if (!item) return;
  if (item.type === 'powerbank') {
    addEnergy(3, false);
    S.player.inventory.splice(slotIdx, 1);
    addLog(`⚡ Повербанк! +3э. Батарея: ${S.player.battery}/${S.player.batMax}`, 'ok');
    SFX.battery();
    renderAll();
  }
  // Shield: passive — absorbs next hit automatically, no click needed
}

function renderHP() {
  const el = document.getElementById('hp-display');
  el.innerHTML = '';
  for (let i = 0; i < S.player.hpMax; i++) {
    const h = document.createElement('span');
    h.className = 'heart ' + (i < S.player.hp ? 'full' : 'empty');
    h.textContent = i < S.player.hp ? '♥' : '♡';
    el.appendChild(h);
  }
}

function renderEphTracker() {
  const el = document.getElementById('eph-list');
  el.innerHTML = '';
  S.ephemers.forEach(eph => {
    const card = document.createElement('div');
    if (eph.type === 'boss') {
      const eyesLeft = eph.totalEyes - eph.eyesScanned;
      card.className = 'eph-card boss-eph' + (eph.done ? ' done-eph' : '');
      card.innerHTML = `
        <div class="eph-icon boss-icon">⚡</div>
        <div class="eph-info">
          <div class="eph-name">${eph.name.toUpperCase()}</div>
          <div class="eph-prog">Глаза: ${eph.eyesScanned}/${eph.totalEyes} — ${eph.done ? '✓ ПОВЕРЖЕН' : `осталось ${eyesLeft}`}</div>
          <div class="eph-mem">${eph.done ? '★ ПОБЕДА!' : '◆ Сканируй Глаза Эхолучом'}</div>
        </div>`;
    } else {
      const total    = eph.segs.length;
      const revealed = eph.scanned + eph.opened;
      const memFound = eph.segs.some(s => {
        const c = cell(s.x, s.y);
        return s.isMembrane && c && c.vis;
      });
      if (!eph.discovered) {
        card.className = 'eph-card unknown';
        card.innerHTML = `
          <div class="eph-icon unknown-icon">?</div>
          <div class="eph-info">
            <div class="eph-name">НЕИЗВЕСТНО</div>
            <div class="eph-prog">не обнаружен</div>
          </div>`;
      } else {
        card.className = `eph-card ${eph.type}-eph${eph.done ? ' done-eph' : ''}`;
        const icon = eph.type === 'green' ? '◉' : '◈';
        // Имя раскрывается только после завершения изучения
        const nameToShow = eph.done ? eph.name.toUpperCase() : 'В ИЗУЧЕНИИ';
        // Кол-во сегментов: показываем точное число если эфемер в энциклопедии (этот или прошлый забег)
        const knownNow    = encyclopedia.has(eph.name);
        const knownBefore = encyclopediaAtRunStart.has(eph.name);
        const totalStr    = (knownNow || knownBefore) ? total : '?';
        const prog  = eph.done
          ? `${eph.scanned}/${totalStr} ✓`
          : `${revealed}/${knownBefore ? total : '?'} сегментов`;
        const memStr = eph.triggered ? '★ триггер!' : (memFound ? '◆ найдена' : '· не найдена');
        card.innerHTML = `
          <div class="eph-icon ${eph.type}-icon">${icon}</div>
          <div class="eph-info">
            <div class="eph-name">${nameToShow}</div>
            <div class="eph-prog">${prog}</div>
            <div class="eph-mem">${memStr}</div>
          </div>`;
        // Форма появляется сразу после завершения (encyclopedia.has), не только в следующем забеге
        if (knownNow || knownBefore) card.appendChild(buildMiniShape(eph));
        if (eph.done) card.addEventListener('click', () => showEncyclopedia(eph));
      }
    }
    el.appendChild(card);
  });
}

function buildMiniShape(eph) {
  const xs = eph.segs.map(s => s.x), ys = eph.segs.map(s => s.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const maxX = Math.max(...xs), maxY = Math.max(...ys);
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const size = Math.max(w, h, 3);
  const grid = document.createElement('div');
  grid.className = 'mini-shape';
  grid.style.gridTemplateColumns = `repeat(${size}, 7px)`;
  grid.style.gridTemplateRows    = `repeat(${size}, 7px)`;
  const segSet = new Map(eph.segs.map(s => [`${s.x - minX},${s.y - minY}`, s]));
  for (let gy = 0; gy < size; gy++) {
    for (let gx = 0; gx < size; gx++) {
      const div = document.createElement('div');
      div.className = 'ms-cell';
      const seg = segSet.get(`${gx},${gy}`);
      if (seg) {
        const c = cell(seg.x, seg.y);
        if (c && c.vis) div.classList.add(seg.isMembrane ? 'seg-mem' : `seg-${eph.type}`);
        else div.style.background = '#1a2e44';
      }
      grid.appendChild(div);
    }
  }
  return grid;
}

function renderComboLamps() {
  const el = document.getElementById('combo-lamps');
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const d = document.createElement('div');
    d.className = 'combo-lamp' + (i < S.player.comboNums ? ' lit' : '');
    el.appendChild(d);
  }
}

function renderLog() {
  const el = document.getElementById('log-entries');
  el.innerHTML = '';
  S.log.slice(0, 9).forEach(e => {
    const d = document.createElement('div');
    d.className = `log-line log-${e.type}`;
    d.textContent = e.msg;
    el.appendChild(d);
  });
}

function renderBossBar() {
  const bar    = document.getElementById('boss-bar');
  const cfg    = ROOM_CONFIGS[currentRoomIdx];
  const isBoss = cfg?.isBoss;
  if (!isBoss || S.phase !== 'playing') { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const boss = S.ephemers[0];
  document.getElementById('boss-pulse-val').textContent  = S.pulseTimer;
  document.getElementById('boss-eyes-val').textContent   = `${boss?.eyesScanned ?? 0}/${boss?.totalEyes ?? 2}`;
  const pLabel = document.getElementById('boss-pulse-label');
  pLabel.style.color = S.pulseTimer <= 2 ? '#e74c3c' : S.pulseTimer <= 3 ? '#f39c12' : '#4ecdc4';
  document.getElementById('boss-hostile-val').textContent = S.hostileCells.filter(h => h.permanent).length +
    ' / ' + S.hostileCells.length;

  // EMI stats (Boss 2 only)
  const emiStat = document.getElementById('boss-emi-stat');
  if (emiStat) {
    const isBoss2 = cfg.bossIdx === 1;
    emiStat.style.display = isBoss2 ? 'flex' : 'none';
    if (isBoss2) {
      const nextProb = EMI_PROBS[Math.min(S.emiPulseCount, EMI_PROBS.length - 1)];
      const emiVal   = document.getElementById('boss-emi-val');
      emiVal.textContent  = Math.round(nextProb * 100) + '%';
      emiVal.style.color  = nextProb >= 1.0 ? '#e74c3c' : nextProb >= 0.5 ? '#f39c12' : '#f0d060';
      const blkEl = document.getElementById('boss-emi-blocked');
      if (blkEl) {
        const slotNames = ['', 'Эхолуч', 'Слот 3', 'Слот 4'];
        blkEl.textContent = S.emiBlockedSlot ? `🔒 ${slotNames[S.emiBlockedSlot]}` : '';
      }
    }
  }
}

function renderOverlay() {
  const ov = document.getElementById('overlay');
  const ph = S.phase;
  // Hide during countdown and normal play
  if (ph === 'playing' || ph === 'countdown') { ov.classList.add('hidden'); return; }
  ov.classList.remove('hidden');
  const p = S.player;
  const st = S.stats;

  const isFinalBoss = currentRoomIdx >= ROOM_CONFIGS.length - 1;
  const hasNextRoom = currentRoomIdx < ROOM_CONFIGS.length - 1;
  const bossName    = S.ephemers[0]?.name ?? '';

  const titles = {
    won:        '🏆 КОМНАТА ОЧИЩЕНА',
    lost:       '💀 ЗАБЕГ ОКОНЧЕН',
    escaped:    '🚪 ВЫХОД ИЗ КОМНАТЫ',
    'boss-won': isFinalBoss ? '🌟 ФИНАЛ! БОСС ПОВЕРЖЕН!' : '⚡ БОСС ПОВЕРЖЕН!',
  };
  document.getElementById('overlay-title').textContent = titles[ph] || '';

  const clean = S.ephemers.filter(e => e.done && e.opened === 0 && e.type !== 'boss').length;
  const total = S.ephemers.filter(e => e.type !== 'boss').length;

  const subs = {
    won:        ph === 'won' && total > 0 ? `Чисто: ${clean}/${total} эфемеров. Поздравляем — миссия завершена!` : 'Поздравляем — миссия завершена!',
    lost:       'Вы погибли. Слава храбрым исследователям Эфира.',
    escaped:    `HP ${p.hp}/${p.hpMax}. ${S.ephemers.filter(e=>e.done).length}/${total} эфемеров. Миссия завершена.`,
    'boss-won': isFinalBoss
      ? `${bossName} уничтожен за ${S.turn} ходов! Вы прошли оба босса! Поздравляем!`
      : `${bossName} повержен за ${S.turn} ходов! Поздравляем — миссия завершена!`,
  };
  document.getElementById('overlay-sub').textContent = subs[ph] || '';

  // ── Detailed report ───────────────────────────────────────────
  const premiumData = institutePremium(st.oiEarned);
  const rows = [];
  if (ph !== 'lost') {
    rows.push(['── РАПОРТ ──────────────────────', '']);
    rows.push(['Пустых клеток:', st.emptyCells]);
    rows.push(['Числовых клеток:', st.numberCells]);
    rows.push(['Сегментов (Эхолуч):', st.segsScanned]);
    rows.push(['']);
    rows.push(['Объём исследований (ОИ):', st.oiEarned]);
    rows.push(['Премия Института:', premiumData.amount > 0 ? `+${premiumData.amount} монет (${premiumData.label})` : 'нет']);
    if (st.dmgOverload > 0 || st.dmgEphemeral > 0) {
      rows.push(['']);
      rows.push(['── Полученный ущерб ─────────────', '']);
      if (st.dmgOverload  > 0) rows.push(['–1 HP × перегрузка:', st.dmgOverload]);
      if (st.dmgEphemeral > 0) rows.push(['–1 HP × атака эфириала:', st.dmgEphemeral]);
    }
  } else {
    rows.push(['ОИ:', st.oiEarned]);
    rows.push(['Ходов сделано:', S.turn]);
    if (st.dmgOverload  > 0) rows.push(['Перегрузок:', st.dmgOverload]);
    if (st.dmgEphemeral > 0) rows.push(['Атак эфириала:', st.dmgEphemeral]);
  }
  rows.push(['']);
  rows.push(['Эссенция:', p.res.green]);
  rows.push(['Эфир:', p.res.yellow]);
  rows.push(['Монеты:', p.res.money]);

  const statsEl = document.getElementById('overlay-stats');
  statsEl.innerHTML = rows.map(r => {
    if (!r || r.length === 0 || (r.length === 2 && r[1] === '' && r[0].startsWith('──')))
      return `<div class="report-section">${r[0] || ''}</div>`;
    if (r.length === 1 || r[0] === '') return '<div class="report-gap"></div>';
    return `<div class="report-row"><span class="report-key">${r[0]}</span><span class="report-val">${r[1]}</span></div>`;
  }).join('');

  const btn = document.getElementById('btn-overlay-action');
  if (ph === 'lost') {
    btn.textContent = 'НОВЫЙ ЗАБЕГ';
    btn.style.background = 'var(--teal)';
    btn.style.color = 'var(--bg)';
  } else if (ph === 'boss-won' && isFinalBoss) {
    btn.textContent = '🌟 НОВЫЙ ЗАБЕГ';
    btn.style.background = '#f0d060';
    btn.style.color = 'var(--bg)';
  } else if (hasNextRoom) {
    btn.textContent = '→ К ОРГАНИЗАЦИЯМ';
    btn.style.background = 'var(--teal)';
    btn.style.color = 'var(--bg)';
  } else {
    btn.textContent = 'НОВЫЙ ЗАБЕГ';
    btn.style.background = 'var(--teal)';
    btn.style.color = 'var(--bg)';
  }
}

function renderShopOverlay() {
  const res = RUN.res;
  document.getElementById('s-oi').textContent     = res.oi;
  document.getElementById('s-green').textContent  = res.green;
  document.getElementById('s-yellow').textContent = res.yellow;
  document.getElementById('s-money').textContent  = res.money;
  document.getElementById('s-hp').textContent     = `${RUN.hp}/${RUN.hpMax}`;
  document.getElementById('s-bat').textContent    = RUN.battery;
  document.getElementById('s-batmax').textContent = RUN.batMax;
  document.getElementById('s-shield').textContent = RUN.inventory.map(i => i.type === 'shield' ? '🛡' : '⚡').join(' ');

  // Update upgrade cost labels
  const batIdx  = RUN.batUpgrades;
  const batCostEl = document.getElementById('bat-up-cost');
  if (batCostEl) batCostEl.textContent =
    batIdx < BAT_UPGRADE_COSTS.length ? `${BAT_UPGRADE_COSTS[batIdx]} 🟡 жёлт. эфира` : 'МАКСИМУМ';

  const hpIdx  = RUN.hpUpgrades;
  const hpCostEl = document.getElementById('hp-up-cost');
  if (hpCostEl) hpCostEl.textContent =
    hpIdx < HP_UPGRADE_COSTS.length ? `${HP_UPGRADE_COSTS[hpIdx]} 🟢 эссенции` : 'МАКСИМУМ';

  const msgEl = document.getElementById('shop-msg');
  msgEl.textContent = shopMsg;
  msgEl.className   = shopMsg.startsWith('❌') ? 'shop-msg err' : 'shop-msg ok';

  const nextCfg = ROOM_CONFIGS[shopNextRoomIdx];
  document.getElementById('btn-shop-continue').textContent =
    nextCfg?.isBoss ? '⚡ К БОССУ!' : `→ ${nextCfg?.label ?? 'ПРОДОЛЖИТЬ'}`;

  renderPhaseBar();
}

// ─── ENCYCLOPEDIA POPUP ───────────────────────────────────────────
function showEncyclopedia(eph) {
  const box   = document.getElementById('ency-body');
  const title = document.getElementById('ency-title');
  title.style.color = eph.type === 'green' ? '#2ecc71' : '#f39c12';
  title.textContent = eph.name.toUpperCase();
  const total    = eph.segs.length;
  const revealed = eph.scanned + eph.opened;
  const memFound = eph.segs.some(s => { const c = cell(s.x, s.y); return s.isMembrane && c && c.vis; });
  const known    = encyclopedia.has(eph.name) || encyclopediaAtRunStart.has(eph.name);
  const rows = [
    ['Тип',            eph.type === 'green' ? 'Зелёный' : 'Жёлтый'],
    ['Сегментов',      known ? `${total}` : '?'],
    ['Просканировано', `${eph.scanned}/${known ? total : '?'}`],
    ['Потеряно',       `${eph.opened}`],
    ['Мембрана',       memFound ? (eph.triggered ? '★ Триггер сработал' : '◆ Обнаружена') : '· Не найдена'],
    ['Статус',         eph.done ? '✓ Завершён' : 'В процессе'],
  ];
  box.innerHTML = rows.map(([k, v]) =>
    `<div class="ency-row"><span class="ency-key">${k}</span><span class="ency-val">${v}</span></div>`
  ).join('');
  document.getElementById('ency-popup').classList.remove('hidden');
}

// ─── INIT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('card-0').addEventListener('click', () => {
    S.tool = 'locator'; renderToolCards(); renderGrid();
  });
  document.getElementById('card-1').addEventListener('click', () => {
    S.tool = 'echobeamer'; renderToolCards(); renderGrid();
  });
  document.getElementById('card-2').addEventListener('click', () => useInventorySlot(0));
  document.getElementById('card-3').addEventListener('click', () => useInventorySlot(1));
  document.addEventListener('keydown', e => {
    if (S.phase !== 'playing') return;
    if (e.key.toLowerCase() === 'l') { S.tool = 'locator';    renderToolCards(); renderGrid(); }
    if (e.key.toLowerCase() === 'e') { S.tool = 'echobeamer'; renderToolCards(); renderGrid(); }
  });
  document.getElementById('btn-overlay-action').addEventListener('click', onOverlayBtn);
  document.getElementById('btn-exit-room').addEventListener('click', exitRoom);
  document.getElementById('btn-shop-continue').addEventListener('click', () => {
    startRoom(shopNextRoomIdx);
  });
  document.querySelectorAll('.btn-shop').forEach(btn => {
    btn.addEventListener('click', () => shopAction(btn.dataset.action));
  });
  document.getElementById('ency-close').addEventListener('click', () => {
    document.getElementById('ency-popup').classList.add('hidden');
  });
  document.getElementById('ency-popup').addEventListener('click', e => {
    if (e.target === document.getElementById('ency-popup'))
      document.getElementById('ency-popup').classList.add('hidden');
  });

  initRun();
  startRoom(0);
});
