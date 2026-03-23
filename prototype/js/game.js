'use strict';
// ═══════════════════════════════════════════════════════════════════
//  ECHOSWEEPER — Prototype v0.6
//  New: purple ephemers (inversion + Warp), final victory screen with full run stats
// ═══════════════════════════════════════════════════════════════════

// ─── CONSTANTS ────────────────────────────────────────────────────
const HP_MAX_BASE              = 3;
const BAT_MAX_BASE             = 6;
const BAT_START                = 3;
const ECHO_COST                = 2;
const HOSTILE_BOSS_SEG_TURNS   = 3;
const RED_AGGR_INTERVAL        = 3;   // red ephemer generates hostile cell every N turns

// ─── MEMBRANE TYPES (M-01..M-12) ─────────────────────────────────
// 2 types randomly assigned per color each run.
const MEMBRANE_DEFS = {
  'M-01': { name: 'Пульс',        symbol: 'Ψ', desc: '+3э; переполнение → +1 лимит батареи' },
  'M-02': { name: 'Волна',        symbol: '≋', desc: 'Раскрыть строку мембраны' },
  'M-03': { name: 'Сонар',        symbol: '◎', desc: 'Все числовые клетки раскрыты' },
  'M-04': { name: 'Усиление',     symbol: '⊕', desc: '+3 бесплатных Эхолуча' },
  'M-05': { name: 'Исследование', symbol: '✦', desc: '+3 ОИ +10м' },
  'M-06': { name: 'Щит',         symbol: '△', desc: 'Следующий штраф отменён' },
  'M-07': { name: 'Эхолот',       symbol: '⊙', desc: '3 клетки с макс. числами раскрыты' },
  'M-08': { name: 'Взрыв',        symbol: '✸', desc: 'Раскрытие 3×3 + 2э' },
  'M-09': { name: 'Память',       symbol: '◈', desc: 'Форма следующего эфемера того же цвета видна' },
  'M-10': { name: 'Резонанс',     symbol: '∞', desc: 'Следующий Trigger срабатывает дважды' },
  'M-11': { name: 'Прозрение',    symbol: '◇', desc: '2 эфемера добавляются в Энциклопедию' },
  'M-12': { name: 'Регенерация',  symbol: '♥', desc: '+1 HP; при макс. HP → +1 лимит HP' },
};
function assignColorMembranes() {
  const pool = Object.keys(MEMBRANE_DEFS);
  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return {
    green:  [pool[0],  pool[1]],
    yellow: [pool[2],  pool[3]],
    red:    [pool[4],  pool[5]],
    blue:   [pool[6],  pool[7]],
    purple: [pool[8],  pool[9]],
  };
}

// ─── EQUIPMENT DATABASE ───────────────────────────────────────────
const EQUIPMENT_DB = {
  hospital: {
    standard: [],
    locked: [
      { id: 'H-01', name: 'Гарпун',         type: 'tool',      price: 80,  desc: 'Скан (5э). <3 сегм. → авто-засчёт. Квест.' },
      { id: 'H-03', name: 'Анестезия',      type: 'consumable',price: 60,  desc: 'Заморозить таймеры 1 эфемера на 5 ходов' },
      { id: 'H-04', name: 'Сканер жизни',   type: 'tool',      price: 70,  desc: 'Кол-во нераскрытых сегментов (1э)' },
      { id: 'H-05', name: 'Стимулятор',     type: 'passive',   price: 90,  desc: 'При HP=1 → авто +2 HP. Одноразовый.' },
      { id: 'H-06', name: 'Биоэкстрактор',  type: 'consumable',price: 75,  desc: 'Гарантирует редкий ресурс следующего эфемера' },
    ],
  },
  institute: {
    standard: [
      { id: 'I-05', name: 'Архивная метка', type: 'consumable',price: 50,  desc: '+3 строки Энц. для следующего эфемера' },
    ],
    locked: [
      { id: 'I-01', name: 'Датчик слежения',type: 'passive',   price: 65,  desc: '+1 ОИ каждые 5 ходов. Побег → +5 ОИ.' },
      { id: 'I-02', name: 'Спектроскоп',    type: 'tool',      price: 70,  desc: 'Тип мембраны без скана (1э)' },
      { id: 'I-03', name: 'Анализатор',     type: 'passive',   price: 50,  desc: 'После скана: след. сегмент — мембрана?' },
      { id: 'I-04', name: 'Нейронная карта',type: 'tool',      price: 80,  desc: 'Числа в 5×5 (3э)' },
      { id: 'I-06', name: 'Резонансный зонд',type:'consumable', price: 60,  desc: 'Форма и размер нераскрытого эфемера' },
    ],
  },
  market: {
    standard: [
      { id: 'BM-04', name: 'Инсайдер',      type: 'consumable',price: 35,  desc: 'Цвета и кол-во эфемеров следующей комнаты' },
    ],
    locked: [
      { id: 'BM-01', name: 'Двойная ставка',type: 'consumable',price: 55,  desc: 'Следующий ресурс ×2, след. штраф ×2 (–2 HP)' },
      { id: 'BM-02', name: 'Контрабандный скан',type:'tool',   price: 75,  desc: 'Скан (3э), ресурс без цветовых эффектов' },
      { id: 'BM-03', name: 'Детонатор',     type: 'tool',      price: 50,  desc: 'Взрыв жёлтого 3×3+2э без штрафа (2э)' },
      { id: 'BM-05', name: 'Фальшивый след',type: 'consumable',price: 45,  desc: 'Следующий штраф → –5 ОИ вместо –1 HP' },
      { id: 'BM-06', name: 'Резервуар ксиллы',type:'passive',  price: 100, desc: 'Хранит до 3 кристаллов ксиллы. 80м/шт.' },
    ],
  },
};

// ─── EPHEMER EFFECT DESCRIPTIONS ─────────────────────────────────
// Shown in tracker after first Echobeam on this ephemer (or if known from prev run)
const EPH_EFFECTS_ECHO = {
  green:  'Эхолуч: +1 эссенция, +1 ОИ',
  yellow: 'Эхолуч: +4 энергии (без перегрузки), +1 сгусток',
  red:    'Эхолуч: агрессия + 30% → жемчуг',
  blue:   'Эхолуч: 50% страх (5 ходов) + 20% → ксилла (+10 ОИ)',
  purple: 'Эхолуч: ресурс / ±1 HP / Варп-эссенция',
};
// Shown only after Locator was used on this ephemer (or if known from prev run)
const EPH_EFFECTS_LOC = {
  green:  null,
  yellow: 'Локатор: взрыв 3×3, +2 энергии',
  red:    'Локатор: активирует агрессию',
  blue:   'Локатор: испугать (5 ходов до побега)',
  purple: 'Локатор: ИНВЕРСИЯ (пустые = –1 энергии)',
};

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
// Глаза зигзагом: [3,1] верх-лево, [8,1] верх-право, [5,3] низ-центр — треугольник
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
  eyeIndices: [4, 9, 22],   // [3,1] верх-лево, [8,1] верх-право, [5,3] низ-центр
};

// Boss 3: «Абсолютный Резонанс» — 40 сег., 4 Глаза разбросаны
// Глаза по «компасу»: верх-центр, лево, право, низ
const BOSS3_SHAPE = {
  name: 'Абсолютный Резонанс',
  cells: [
    [5,0],[6,0],[7,0],[8,0],                                                    // row0 idx 0-3
    [3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],                           // row1 idx 4-11
    [2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],              // row2 idx 12-21
    [3,3],[4,3],[5,3],[6,3],[7,3],[8,3],[9,3],[10,3],                           // row3 idx 22-29
    [4,4],[5,4],[6,4],[7,4],[8,4],[9,4],                                        // row4 idx 30-35
    [5,5],[6,5],[7,5],[8,5],                                                    // row5 idx 36-39
  ],
  eyeIndices: [0, 12, 21, 37],  // [5,0] верх, [2,2] лево, [11,2] право, [6,5] низ
};

const BOSS_SHAPES = [BOSS1_SHAPE, BOSS2_SHAPE, BOSS3_SHAPE];

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
const RED_SHAPES = [
  { name: 'Коготь', cells: [[0,0],[1,0],[2,0],[2,1],[2,2]], memIdx: 2 },
  { name: 'Шип',    cells: [[1,0],[0,1],[1,1],[0,2],[1,2]], memIdx: 2 },
  { name: 'Захват', cells: [[0,0],[2,0],[0,1],[1,1],[2,1]], memIdx: 1 },
];
const BLUE_SHAPES = [
  { name: 'Линза',  cells: [[1,0],[0,1],[1,1],[2,1],[1,2]], memIdx: 2 },
  { name: 'Луч',    cells: [[0,0],[1,0],[2,0],[3,0],[4,0]], memIdx: 2 },
  { name: 'Стрела', cells: [[2,0],[0,1],[1,1],[2,1],[2,2]], memIdx: 0 },
];
const PURPLE_SHAPES = [
  { name: 'Призма',  cells: [[1,0],[0,1],[1,1],[2,1],[1,2]], memIdx: 1 },
  { name: 'Скоба',   cells: [[0,0],[0,1],[1,1],[0,2],[0,3]], memIdx: 2 },
  { name: 'Варп-Г',  cells: [[0,0],[1,0],[2,0],[0,1],[0,2]], memIdx: 0 },
];

// ─── ROOM CONFIGS ─────────────────────────────────────────────────
// Structure: K1 K2 → B1 → K3 K4 → B2 → K5 K6 → B3 (2 rooms before each boss)
const ROOM_CONFIGS = [
  {  // [0]
    label: 'Комната 1', gridW: 10, gridH: 10, cellSize: 46, isBoss: false, bossIdx: null, pulseInterval: 5,
    ephConfig: [
      { type: 'green',  shapes: GREEN_SHAPES,  count: 2 },
      { type: 'yellow', shapes: YELLOW_SHAPES, count: 1 },
    ],
  },
  {  // [1]
    label: 'Комната 2', gridW: 10, gridH: 10, cellSize: 46, isBoss: false, bossIdx: null, pulseInterval: 5,
    ephConfig: [
      { type: 'green',  shapes: GREEN_SHAPES,  count: 3 },
      { type: 'yellow', shapes: YELLOW_SHAPES, count: 2 },
      { type: 'red',    shapes: RED_SHAPES,    count: 1 },
    ],
  },
  {  // [2]
    label: '⚡ БОСС 1', gridW: 12, gridH: 12, cellSize: 38, isBoss: true, bossIdx: 0, pulseInterval: 5,
    pulseHostileCount: 2, ephConfig: null,
  },
  {  // [3] — first room after Boss 1
    label: 'Комната 3', gridW: 10, gridH: 10, cellSize: 46, isBoss: false, bossIdx: null, pulseInterval: 5,
    ephConfig: [
      { type: 'green',  shapes: GREEN_SHAPES,  count: 3 },
      { type: 'yellow', shapes: YELLOW_SHAPES, count: 2 },
      { type: 'red',    shapes: RED_SHAPES,    count: 1 },
      { type: 'blue',   shapes: BLUE_SHAPES,   count: 1 },
      { type: 'purple', shapes: PURPLE_SHAPES, count: 1 },
    ],
  },
  {  // [4] — second room before Boss 2 (NEW)
    label: 'Комната 4', gridW: 10, gridH: 10, cellSize: 46, isBoss: false, bossIdx: null, pulseInterval: 5,
    ephConfig: [
      { type: 'green',  shapes: GREEN_SHAPES,  count: 2 },
      { type: 'yellow', shapes: YELLOW_SHAPES, count: 2 },
      { type: 'red',    shapes: RED_SHAPES,    count: 2 },
      { type: 'blue',   shapes: BLUE_SHAPES,   count: 1 },
      { type: 'purple', shapes: PURPLE_SHAPES, count: 1 },
    ],
  },
  {  // [5]
    label: '⚡ БОСС 2', gridW: 14, gridH: 14, cellSize: 32, isBoss: true, bossIdx: 1, pulseInterval: 3,
    pulseHostileCount: 2, emiProbs: [0.10, 0.30, 0.50, 1.00], ephConfig: null,
  },
  {  // [6] — first room after Boss 2
    label: 'Комната 5', gridW: 10, gridH: 10, cellSize: 46, isBoss: false, bossIdx: null, pulseInterval: 5,
    ephConfig: [
      { type: 'green',  shapes: GREEN_SHAPES,  count: 2 },
      { type: 'yellow', shapes: YELLOW_SHAPES, count: 2 },
      { type: 'red',    shapes: RED_SHAPES,    count: 2 },
      { type: 'blue',   shapes: BLUE_SHAPES,   count: 1 },
      { type: 'purple', shapes: PURPLE_SHAPES, count: 1 },
    ],
  },
  {  // [7] — second room before Boss 3 (NEW)
    label: 'Комната 6', gridW: 10, gridH: 10, cellSize: 46, isBoss: false, bossIdx: null, pulseInterval: 5,
    ephConfig: [
      { type: 'green',  shapes: GREEN_SHAPES,  count: 2 },
      { type: 'yellow', shapes: YELLOW_SHAPES, count: 2 },
      { type: 'red',    shapes: RED_SHAPES,    count: 2 },
      { type: 'blue',   shapes: BLUE_SHAPES,   count: 2 },
      { type: 'purple', shapes: PURPLE_SHAPES, count: 2 },
    ],
  },
  {  // [8]
    label: '⚡ БОСС 3', gridW: 16, gridH: 16, cellSize: 24, isBoss: true, bossIdx: 2, pulseInterval: 2,
    pulseHostileCount: 3, emiProbs: [0.20, 0.50, 0.80, 1.00], ephConfig: null,
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
const SONAR_FREQS = [260, 350, 470, 620, 840];
function playSonarPing(lampIdx) {
  try {
    const ctx  = getAudio();
    const freq = SONAR_FREQS[Math.min(lampIdx, SONAR_FREQS.length - 1)];
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 0.92, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.03, ctx.currentTime + 0.15);
    osc.frequency.exponentialRampToValueAtTime(freq,        ctx.currentTime + 0.36);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.38,  ctx.currentTime + 0.027);
    gain.gain.setValueAtTime(0.38,           ctx.currentTime + 0.50);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.65);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.65);
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
  red:     () => { playTone(220, 0.4, 'sawtooth', 0.28); setTimeout(() => playTone(180, 0.6, 'sawtooth', 0.22), 300); },
  blue:    () => { playTone(440, 0.5, 'triangle', 0.2); setTimeout(() => playTone(550, 0.4, 'triangle', 0.18), 200); },
  money:   () => { playTone(660, 0.21, 'square', 0.12); setTimeout(() => playTone(880, 0.21, 'square', 0.12), 210); },
  battery: () => playTone(330, 0.36, 'triangle', 0.2),
  warn:    () => { [0, 450, 900].forEach(d => setTimeout(() => playTone(180, 0.36, 'sawtooth', 0.3), d)); },
  combo:   () => playTone(1047, 0.66, 'sine', 0.28),
  pulse:   () => { playTone(200, 0.9, 'sawtooth', 0.35); setTimeout(() => playTone(150, 1.2, 'sawtooth', 0.28), 600); },
  victory: () => { [0,450,900,1350].forEach((d,i) => setTimeout(() => playTone(523*(1+i*0.15), 0.75, 'sine', 0.3), d)); },
  shop:      () => { playTone(440, 0.3, 'sine', 0.15); setTimeout(() => playTone(550, 0.45, 'sine', 0.2), 300); },
  blocked:   () => playTone(120, 0.6, 'square', 0.25),
  emi:       () => {
    [0, 90, 200, 360].forEach((d, i) =>
      setTimeout(() => playTone(260 - i * 45, 0.45, 'sawtooth', 0.32 - i * 0.05), d)
    );
  },
  sonarPing: (i) => playSonarPing(i),
  purple:  () => { playTone(350, 0.6, 'triangle', 0.2); setTimeout(() => playTone(280, 0.8, 'sine', 0.15), 320); },
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
    res:         { green: 0, yellow: 0, pearl: 0, money: 0, oi: 0, warpEssence: 0 },
    inventory:         [],
    inventorySlots:    2,
    freeEchobeams:     0,
    nextTriggerDouble: false,
    colorMembranes:    assignColorMembranes(),
    colorCounts: { green: 0, yellow: 0, red: 0, blue: 0, purple: 0 },
    shapeCounts: {},
    stats: {
      totalTurns:     0,
      emptyCells:     0,
      numberCells:    0,
      segsScanned:    0,
      oiEarned:       0,
      dmgOverload:    0,
      dmgEphemeral:   0,
      resEarned:      { green: 0, yellow: 0, pearl: 0, money: 0 },
      ephemersMet:    0,
      ephemersClean:  0,
      ephemersLost:   0,
      ephemersEscaped:0,
      bossesKilled:   0,
    },
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
      inventory:         [...RUN.inventory],
      inventorySlots:    RUN.inventorySlots,
      freeEchobeams:     RUN.freeEchobeams,
      nextTriggerDouble: RUN.nextTriggerDouble,
      colorCounts: { ...RUN.colorCounts },
      shapeCounts: { ...RUN.shapeCounts },
    },
    tool:         'locator',
    turn:         0,
    phase:        'playing',
    pendingPhase: null,
    log:          [],
    pulseTimer:      cfg.pulseInterval,
    hostileCells:    [],
    emiPulseCount:   0,
    emiBlockedSlot:  null,
    newEmptyCells:   new Set(),
    invertActive:    false,
    warpSnapshot:    null,
    stats: {
      emptyCells:   0,
      numberCells:  0,
      segsScanned:  0,
      oiEarned:     0,
      dmgOverload:  0,
      dmgEphemeral: 0,
      resStart:     { ...RUN.res },  // snapshot for «заработано в этой комнате»
    },
  };
  if (cfg.isBoss) placeBoss(cfg.bossIdx);
  else            placeEphemers(cfg.ephConfig);
  // Full battery warning at room start
  if (S.player.battery >= S.player.batMax) {
    addLog(`⚠ Батарея полна — Эхолучи недоступны, пока не потратишь энергию!`, 'warn');
    SFX.warn();
  }
  calcResonance();
  tickPurpleInversion();  // set invertActive correctly from turn 0
  hideShopOverlay();
  renderAll();
  const bossMsg = cfg.isBoss
    ? `Уничтожь все Глаза Эхолучом → остановишь пульс. Затем добей босса!`
    : `${S.ephemers.length} эфемеров в секторе.`;
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
  RUN.inventory         = [...S.player.inventory];
  RUN.inventorySlots    = S.player.inventorySlots;
  RUN.freeEchobeams     = S.player.freeEchobeams;
  RUN.nextTriggerDouble = S.player.nextTriggerDouble;
  RUN.colorCounts = { ...S.player.colorCounts };
  RUN.shapeCounts = { ...S.player.shapeCounts };

  // Accumulate room stats into run-wide stats
  const rs = S.stats;
  const ps = S.stats.resStart;
  const p  = S.player;
  RUN.stats.totalTurns    += S.turn;
  RUN.stats.emptyCells    += rs.emptyCells;
  RUN.stats.numberCells   += rs.numberCells;
  RUN.stats.segsScanned   += rs.segsScanned;
  RUN.stats.oiEarned      += rs.oiEarned;
  RUN.stats.dmgOverload   += rs.dmgOverload;
  RUN.stats.dmgEphemeral  += rs.dmgEphemeral;
  RUN.stats.resEarned.green  += Math.max(0, p.res.green  - ps.green);
  RUN.stats.resEarned.yellow += Math.max(0, p.res.yellow - ps.yellow);
  RUN.stats.resEarned.pearl  += Math.max(0, p.res.pearl  - ps.pearl);
  RUN.stats.resEarned.money  += Math.max(0, p.res.money  - ps.money);
  S.ephemers.forEach(e => {
    if (e.type === 'boss') {
      if (e.done) RUN.stats.bossesKilled++;
      return;
    }
    RUN.stats.ephemersMet++;
    if (e.done && e.opened === 0) RUN.stats.ephemersClean++;
    if (e.done && e.opened > 0)  RUN.stats.ephemersLost += e.opened;
    if (e.type === 'blue' && e.escaped) RUN.stats.ephemersEscaped++;
  });
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

// ─── EPHEMER PLACEMENT ────────────────────────────────────────────
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
        discovered: encyclopedia.has(shapeDef.name),
        // red: aggressive state
        aggrActive: false, aggrTimer: RED_AGGR_INTERVAL,
        // blue: fear/escape state
        fearActive: false, fearTimer: 5, escaped: false,
        // discovery tracking
        locatorHit: false,
        // membrane: which type this ephemer has (set from run's colorMembranes)
        memType: (() => {
          const mems = RUN.colorMembranes?.[cfg.type];
          return mems ? mems[Math.floor(Math.random() * mems.length)] : null;
        })(),
        // purple: inversion only triggered after Locator hit, not on mere presence
        invertTriggered: false,
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
    eyesNeutralized: false,  // true when all eyes destroyed → pulse/EMI stop, exit unlocks
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

// ─── SHARED HOSTILE CELL CLEANUP ──────────────────────────────────
function tickHostileCells() {
  S.hostileCells = S.hostileCells.filter(h => {
    if (h.permanent) return true;
    h.turnsLeft--;
    return h.turnsLeft > 0;
  });
  for (let y = 0; y < S.gridH; y++)
    for (let x = 0; x < S.gridW; x++)
      S.grid[y][x].isHostile = false;
  S.hostileCells.forEach(h => { const c = cell(h.x, h.y); if (c) c.isHostile = true; });
}

// ─── BOSS PULSE ───────────────────────────────────────────────────
function tickBossPulse() {
  const cfg = ROOM_CONFIGS[currentRoomIdx];
  if (!cfg.isBoss || S.phase !== 'playing') return;
  const boss = S.ephemers[0];
  if (boss?.eyesNeutralized) return;  // Eyes destroyed — no more pulse

  tickHostileCells();

  S.pulseTimer--;
  if (S.pulseTimer <= 0) {
    triggerPulse();
    S.pulseTimer = cfg.pulseInterval;
  }
}

// ─── RED EPHEMER AGGRESSION ───────────────────────────────────────
// Per-ephemer: every RED_AGGR_INTERVAL turns while aggrActive → –1 HP directly
function tickRedAggression() {
  if (ROOM_CONFIGS[currentRoomIdx].isBoss) return;
  S.ephemers.forEach(eph => {
    if (eph.type !== 'red' || eph.done || !eph.aggrActive) return;
    eph.aggrTimer--;
    if (eph.aggrTimer <= 0) {
      eph.aggrTimer = RED_AGGR_INTERVAL;
      const nm = eph.discovered ? eph.name : 'Красный эфемер';
      addLog(`🔴 ${nm} АТАКУЕТ! –1 HP!`, 'err');
      S.stats.dmgEphemeral++;
      takeDamage(1);
      SFX.red();
    }
  });
}

// ─── BLUE EPHEMER FEAR / ESCAPE ───────────────────────────────────
function stealResources(count) {
  const p = S.player;
  const pool = [];
  for (let i = 0; i < p.res.green;  i++) pool.push('green');
  for (let i = 0; i < p.res.yellow; i++) pool.push('yellow');
  for (let i = 0; i < p.res.pearl;  i++) pool.push('pearl');
  for (let i = 0; i < Math.floor(p.res.money / 10); i++) pool.push('money');
  const toSteal = Math.min(count, pool.length);
  for (let i = 0; i < toSteal; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
    const r = pool[i];
    if      (r === 'green')  p.res.green--;
    else if (r === 'yellow') p.res.yellow--;
    else if (r === 'pearl')  p.res.pearl--;
    else if (r === 'money')  p.res.money -= 10;
  }
  return toSteal;
}

function blueEscape(eph) {
  eph.done    = true;
  eph.escaped = true;
  eph.segs.forEach(s => {
    const c = cell(s.x, s.y);
    if (c && c.state === 'hidden') { c.state = 'open'; c.vis = true; eph.opened++; }
  });
  encyclopedia.add(eph.name);
  const stolen = stealResources(5);
  addLog(`💙 ${eph.discovered ? eph.name.toUpperCase() : 'СИНИЙ'} СБЕЖАЛ! –${stolen} ресурсов похищено!`, 'err');
  SFX.warn();
}

function tickBlueEphemers() {
  if (ROOM_CONFIGS[currentRoomIdx].isBoss) return;
  S.ephemers.forEach(eph => {
    if (eph.type !== 'blue' || eph.done || !eph.fearActive) return;
    eph.fearTimer--;
    if (eph.fearTimer <= 0) {
      blueEscape(eph);
    } else if (eph.fearTimer <= 3) {
      const nm = eph.discovered ? eph.name : 'Синий эфемер';
      addLog(`💙 ${nm} испуган! Сбежит через ${eph.fearTimer} ходов!`, 'warn');
    }
  });
}

// ─── PURPLE EPHEMER INVERSION ─────────────────────────────────────
// Active only after Locator hit on a purple ephemer — not on mere presence.
function tickPurpleInversion() {
  S.invertActive = S.ephemers.some(e => e.type === 'purple' && !e.done && e.invertTriggered);
}

function triggerEMI() {
  const p = S.player;
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
  S.emiBlockedSlot = 1 + Math.floor(Math.random() * 3);
  const slotNames = ['', 'Эхолуч', 'Слот 3', 'Слот 4'];
  addLog(msg, dmg ? 'err' : 'warn');
  addLog(`🔒 ${slotNames[S.emiBlockedSlot]} заблокирован на 1 ход!`, 'warn');
  SFX.emi();
}

function triggerPulse() {
  const cfg  = ROOM_CONFIGS[currentRoomIdx];
  const boss = S.ephemers[0];
  if (boss?.eyesNeutralized) return;

  // EMI check for bosses with emiProbs config
  if (cfg.emiProbs) {
    S.emiPulseCount++;
    const prob = cfg.emiProbs[Math.min(S.emiPulseCount - 1, cfg.emiProbs.length - 1)];
    if (Math.random() < prob) {
      triggerEMI();
      S.emiPulseCount = 0;
      return;
    }
  }

  const bossSegSet = new Set(boss.segs.map(s => `${s.x},${s.y}`));

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

  const maxCount = cfg.pulseHostileCount ?? 2;
  const count = Math.min(maxCount, candidates.length);
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
function deepCloneS() {
  const savedSet   = S.newEmptyCells;
  const savedSnap  = S.warpSnapshot;
  S.newEmptyCells  = [...savedSet];
  S.warpSnapshot   = null;  // don't serialize snapshot recursively
  const clone      = JSON.parse(JSON.stringify(S));
  S.newEmptyCells  = savedSet;
  S.warpSnapshot   = savedSnap;
  clone.newEmptyCells = [];
  return clone;
}

function applyTool(x, y) {
  if (S.phase !== 'playing') return;
  const c = cell(x, y);
  if (!c || c.state !== 'hidden') return;
  if (S.tool === 'echobeamer' && S.emiBlockedSlot === 1) {
    addLog('🔒 ЭХОЛУЧ ЗАБЛОКИРОВАН ЭМИ! (этот ход)', 'warn');
    SFX.blocked();
    renderLog();
    renderToolCards();
    return;
  }
  // Save warp snapshot in boss rooms when warpEssence is available
  const cfg = ROOM_CONFIGS[currentRoomIdx];
  if (cfg.isBoss && S.player.res.warpEssence > 0) {
    S.warpSnapshot = deepCloneS();
  }
  S.newEmptyCells = new Set();
  const turnConsumed = S.tool === 'locator' ? doLocator(c) : doEchobeamer(c);
  if (turnConsumed !== false) {
    S.turn++;
    tickBossPulse();
    tickRedAggression();
    tickBlueEphemers();
    tickPurpleInversion();
    S.emiBlockedSlot = null;
  }
  checkWinLose();
  if (S.phase !== 'playing' && S.phase !== 'countdown') {
    startCountdown(S.phase);
  } else {
    renderAll();
  }
}

// ── LOCATOR ──
function doLocator(c) {
  if (c.isHostile) {
    addLog(`🚫 Враждебная клетка — Локатор заблокирован!`, 'warn');
    SFX.blocked();
    renderLog();
    return false;
  }

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
    eph.locatorHit = true;
    S.stats.dmgEphemeral++;
    takeDamage(1);
    c.state = 'open'; c.vis = true;
    eph.opened++;
    const nd = eph.discovered ? eph.name : 'В ИЗУЧЕНИИ';
    if (eph.type === 'boss') {
      addLog(`⚠ Локатор на Босса! –1 HP. Сегмент потерян.`, 'err');
    } else if (eph.type === 'yellow') {
      addLog(`Локатор на ${nd}. ${nd} атакует. Энергетический ВЗРЫВ 3×3! –1 HP. +2э.`, 'err');
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nc = cell(c.x+dx, c.y+dy);
          if (nc && nc.state === 'hidden') explodeReveal(nc);
        }
      addEnergy(2, true);
    } else if (eph.type === 'red') {
      eph.aggrActive = true;
      addLog(`Локатор на ${nd}. ${nd} переходит в режим Агрессии.`, 'err');
    } else if (eph.type === 'blue') {
      if (!eph.fearActive) { eph.fearActive = true; eph.fearTimer = 5; }
      addLog(`Локатор на ${nd}. ${nd} пугается! Сбежит через 5 ходов.`, 'err');
    } else if (eph.type === 'purple') {
      eph.invertTriggered = true;
      addLog(`Локатор на ${nd}. ИНВЕРСИЯ активирована! Пустые клетки = –1э, пока не исследован.`, 'err');
    } else {
      addLog(`Локатор на ${nd}. ${nd} атакует. –1 HP.`, 'err');
    }
    checkEphDone(eph);
  } else {
    if (c.resNum === 0) {
      c.state = 'empty'; c.vis = true;
      S.newEmptyCells.add(`${c.x},${c.y}`);
      S.stats.emptyCells++;
      if (S.invertActive) {
        addEnergy(-1, false);
        addLog(`📡 Пустая. ⚠ ИНВЕРСИЯ! –1э. (фиолетовый активен)`, 'warn');
        SFX.purple();
      } else {
        addEnergy(1, true);
        addLog(`📡 Пустая. +1э.`, 'ok');
        SFX.battery();
      }
    } else {
      c.state = 'number'; c.vis = true;
      S.stats.numberCells++;
      addLog(`📍 Число ${c.resNum}.`, 'info');
      SFX.sonarPing(S.player.comboNums);
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
    const cfg = ROOM_CONFIGS[currentRoomIdx];
    if (c.isEye) {
      eph.eyesScanned++;
      if (!eph.eyesNeutralized) {
        if (cfg.bossIdx === 2) {
          // Boss 3: eye scan triggers immediate pulse AND EMI
          addLog(`👁 ГЛАЗ! НЕМЕДЛЕННЫЙ ПУЛЬС + ЭМИ! (${eph.eyesScanned}/${eph.totalEyes})`, 'trigger');
          triggerPulse();
          triggerEMI();
        } else {
          // Boss 1 & 2: speed up pulse timer
          S.pulseTimer = Math.max(1, S.pulseTimer - 2);
          addLog(`👁 ГЛАЗ! Пульс ускорился! (${eph.eyesScanned}/${eph.totalEyes})`, 'trigger');
        }
      }
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
    S.player.res.yellow++;
    const room = S.player.batMax - S.player.battery;
    if (room >= 4) {
      addEnergy(4, false);
      addLog(`✅ Жёлтый. +4 энергии +1 сгусток. Батарея: ${S.player.battery}/${S.player.batMax}.`, 'ok');
    } else if (room > 0) {
      addEnergy(room, false);
      addLog(`✅ Жёлтый. Батарея почти полна. +${room} энергии +1 сгусток.`, 'ok');
    } else {
      addLog(`✅ Жёлтый. Батарея полна. +1 сгусток.`, 'ok');
    }
    SFX.yellow();
  } else if (eph.type === 'red') {
    eph.aggrActive = true;
    if (Math.random() < 0.3) {
      S.player.res.pearl++;
      addLog(`✅ Красный. Агрессия! 30% → +1 жемчуг. –${ECHO_COST}э.`, 'ok');
    } else {
      addLog(`✅ Красный. Агрессия активирована. –${ECHO_COST}э.`, 'warn');
    }
    SFX.red();
  } else if (eph.type === 'blue') {
    const msgs = [];
    if (Math.random() < 0.5) {
      if (!eph.fearActive) { eph.fearActive = true; eph.fearTimer = 5; }
      msgs.push('СТРАХ активирован!');
    } else {
      msgs.push('спокоен');
    }
    if (Math.random() < 0.2) {
      addOI(10);
      msgs.push('💎 Ксилла +10 ОИ');
    }
    const fearNow = msgs.includes('СТРАХ активирован!');
    addLog(`✅ Синий. ${msgs.join(' ')} –${ECHO_COST}э.`, fearNow ? 'warn' : 'ok');
    SFX.blue();
  } else if (eph.type === 'purple') {
    const roll = Math.random();
    if (roll < 0.4) {
      // 40%: случайный ресурс
      const rnd = Math.random();
      if (rnd < 0.33) {
        S.player.res.green++;
        addLog(`✅ Фиолетовый. +1 эссенция. –${ECHO_COST}э.`, 'ok'); SFX.green();
      } else if (rnd < 0.66) {
        S.player.res.yellow++;
        addLog(`✅ Фиолетовый. +1 сгусток. –${ECHO_COST}э.`, 'ok'); SFX.yellow();
      } else {
        S.player.res.pearl++;
        addLog(`✅ Фиолетовый. +1 жемчуг. –${ECHO_COST}э.`, 'ok'); SFX.red();
      }
    } else if (roll < 0.8) {
      // 40%: ±1 HP
      if (Math.random() < 0.5) {
        if (S.player.hp < S.player.hpMax) {
          S.player.hp++;
          addLog(`✅ Фиолетовый. +1 HP! –${ECHO_COST}э.`, 'ok');
        } else {
          addLog(`✅ Фиолетовый. HP уже макс. –${ECHO_COST}э.`, 'ok');
        }
      } else {
        takeDamage(1);
        addLog(`✅ Фиолетовый. –1 HP! –${ECHO_COST}э.`, 'warn');
      }
      SFX.purple();
    } else if (roll < 0.9) {
      // 10%: Варп-эссенция
      S.player.res.warpEssence++;
      addLog(`✅ Фиолетовый. 💜 ВАРП-ЭССЕНЦИЯ! –${ECHO_COST}э.`, 'trigger'); SFX.purple();
    } else {
      // 10%: ничего особого
      addLog(`✅ Фиолетовый. Без эффекта. –${ECHO_COST}э.`, 'ok'); SFX.purple();
    }
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
    // Step 1: all eyes scanned → neutralize (stop effects, unlock exit)
    if (!eph.eyesNeutralized && eph.eyesScanned >= eph.totalEyes) {
      eph.eyesNeutralized = true;
      S.emiBlockedSlot = null;
      addLog(`💥 ВСЕ ГЛАЗА УНИЧТОЖЕНЫ! Новых угроз не будет.`, 'trigger');
      addLog(`🚪 Выход разблокирован. Добей босса для полной победы!`, 'ok');
      SFX.victory();
    }
    // Step 2: all segments revealed (or hostile-blocked) → final victory
    if (eph.eyesNeutralized) {
      const hostileBlocked = eph.segs.filter(s => {
        const c = cell(s.x, s.y);
        return c && !c.vis && c.isHostile;
      }).length;
      if (eph.scanned + eph.opened + hostileBlocked >= eph.segs.length) {
        eph.done = true;
        S.phase = 'boss-won';
        addLog(`🏆 БОСС УНИЧТОЖЕН! Полная победа!`, 'trigger');
        SFX.victory();
      }
    }
    return;
  }

  if (eph.scanned + eph.opened >= eph.segs.length) {
    eph.done = true;
    const clean = eph.opened === 0;
    encyclopedia.add(eph.name);

    // Achievement: every 3 of same color or same shape → +3 ОИ
    const colorRu = { green: 'зелёных', yellow: 'жёлтых', red: 'красных', blue: 'синих', purple: 'фиолетовых' };
    const colCount = ++S.player.colorCounts[eph.type];
    const shpCount = S.player.shapeCounts[eph.name] = (S.player.shapeCounts[eph.name] || 0) + 1;
    if (colCount % 3 === 0) {
      addOI(3);
      addLog(`🏅 Исследовано ${colCount} ${colorRu[eph.type]} эфемеров → +3 ОИ!`, 'trigger');
    }
    if (shpCount % 3 === 0) {
      addOI(3);
      addLog(`🏅 ${shpCount} «${eph.name}» исследовано → +3 ОИ!`, 'trigger');
    }

    if (eph.type === 'green') {
      S.player.res.money += clean ? 10 : 5;
      addOI(clean ? 5 : 2);
      SFX.money();
      addLog(`🏁 ${eph.name} завершён. ${clean ? '✦ Чисто! +10м +5 ОИ' : `${eph.opened} потеряно. +5м +2 ОИ`}`, 'ok');
    } else if (eph.type === 'yellow') {
      S.player.res.money += clean ? 10 : 5;
      addOI(clean ? 5 : 2);
      SFX.money();
      addLog(`🏁 ${eph.name} завершён. ${clean ? '✦ Чисто! +10м +5 ОИ' : `${eph.opened} потеряно. +5м +2 ОИ`}`, 'ok');
    } else if (eph.type === 'red') {
      S.player.res.money += clean ? 8 : 3;
      addOI(clean ? 3 : 1);
      SFX.money();
      addLog(`🏁 ${eph.name} завершён. ${clean ? '🔴 Чисто! +8м +3 ОИ' : `+3м +1 ОИ`}`, 'ok');
    } else if (eph.type === 'blue') {
      if (!eph.escaped) {
        S.player.res.money += clean ? 10 : 5;
        addOI(clean ? 5 : 2);
        SFX.money();
        addLog(`🏁 ${eph.name} завершён. ${clean ? '💙 Чисто! +5 ОИ +10м' : `+2 ОИ +5м`}`, 'ok');
      }
    } else if (eph.type === 'purple') {
      S.player.res.money += clean ? 12 : 4;
      addOI(clean ? 6 : 2);
      SFX.money();
      addLog(`🏁 ${eph.name} завершён. ${clean ? '💜 Чисто! +6 ОИ +12м' : '+2 ОИ +4м'}`, 'ok');
      // Inversion lifts after completion
      tickPurpleInversion();
    }
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
    if (S.player.battery === S.player.batMax && prev < S.player.batMax && S.tool === 'locator') {
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
    const shield = S.player.inventory[shieldIdx];
    shield.hp = (shield.hp ?? 2) - 1;
    if (shield.hp <= 0) {
      S.player.inventory.splice(shieldIdx, 1);
      addLog(`🛡 Щит сломан! Поглотил последний удар.`, 'ok');
    } else {
      addLog(`🛡 Щит треснул (HP щита: ${shield.hp}). Поглотил удар!`, 'ok');
    }
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
    const boss = S.ephemers[0];
    // Extra lose only while pulse is active (eyes not neutralized)
    if (!boss?.eyesNeutralized) {
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
    }
  } else {
    if (S.ephemers.every(e => e.done)) {
      S.phase = 'won';
      addLog(`🏆 Все Эфемеры завершены!`, 'ok');
    }
  }
}

function exitRoom() {
  const cfg = ROOM_CONFIGS[currentRoomIdx];
  // In boss rooms: blocked until all eyes are neutralized
  if (cfg.isBoss && !S.ephemers[0]?.eyesNeutralized) return;
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
  renderAll();

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
      if (res.yellow < cost) { msg = `❌ Нужно ${cost} жёлт. сгустка`; break; }
      res.yellow -= cost; RUN.batMax++; RUN.batUpgrades++;
      msg = `🔋 Батарея макс. +1 → ${RUN.batMax}. Следующее: ${BAT_UPGRADE_COSTS[idx+1] ? BAT_UPGRADE_COSTS[idx+1] + ' сгустков' : '—'}`;
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
      if (res.yellow === 0) { msg = '❌ Нет жёлт. сгустка'; break; }
      { const ye = res.yellow * 15; res.money += ye; msg = `💰 Продано ${res.yellow} сгустков за ${ye}м.`; res.yellow = 0; }
      break;
    case 'sell-pearl':
      if (res.pearl === 0) { msg = '❌ Нет красного жемчуга'; break; }
      { const pe = res.pearl * 20; res.money += pe; msg = `💰 Продано ${res.pearl} жемчуга за ${pe}м.`; res.pearl = 0; }
      break;
    case 'buy-shield':
      if (RUN.inventory.length >= RUN.inventorySlots) { msg = `❌ Нет свободных слотов (${RUN.inventorySlots})`; break; }
      if (res.money < 40) { msg = '❌ Нужно 40 монет'; break; }
      res.money -= 40; RUN.inventory.push({ type: 'shield', hp: 2 });
      msg = `🛡 Щит (2 удара) помещён в слот ${RUN.inventory.length}.`;
      break;
    case 'buy-powerbank':
      if (RUN.inventory.length >= RUN.inventorySlots) { msg = `❌ Нет свободных слотов (${RUN.inventorySlots})`; break; }
      if (res.money < 50) { msg = '❌ Нужно 50 монет'; break; }
      res.money -= 50; RUN.inventory.push({ type: 'powerbank' });
      msg = `⚡ Повербанк помещён в слот ${RUN.inventory.length}.`;
      break;
    case 'buy-slot': {
      if (RUN.inventorySlots >= 6) { msg = '❌ Максимум 6 слотов инвентаря'; break; }
      if (res.money < 80) { msg = '❌ Нужно 80 монет'; break; }
      res.money -= 80; RUN.inventorySlots++;
      msg = `🏥 Дополнительный слот открыт! Слотов: ${RUN.inventorySlots}.`;
      break;
    }
    default: msg = '?';
  }
  shopMsg = msg;
  renderShopOverlay();
}

// ─── TRANSITIONS ──────────────────────────────────────────────────
function onOverlayBtn() {
  const ph = S.phase;
  if (ph === 'lost') { newGameRun(); return; }
  if (ph === 'boss-won' && currentRoomIdx >= ROOM_CONFIGS.length - 1) {
    newGameRun(); return;
  }
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
  const warp = S.player.res.warpEssence || 0;
  const warpEl = document.getElementById('res-warp');
  if (warpEl) {
    document.getElementById('r-warp').textContent = warp;
    warpEl.classList.toggle('hidden', warp === 0);
  }
}

function renderPhaseBar() {
  // Steps (17): K1 s1 K2 s2 B1 s3 K3 s4 K4 s5 B2 s6 K5 s7 K6 s8 B3
  // roomIdx*2 → step; shopVisible → shopNextRoomIdx*2-1
  let active = currentRoomIdx * 2;
  const shopVisible = !document.getElementById('shop-overlay').classList.contains('hidden');
  if (shopVisible) active = shopNextRoomIdx * 2 - 1;
  [
    'ps-room1','ps-shop1','ps-room2','ps-shop2','ps-boss1',
    'ps-shop3','ps-room3','ps-shop4','ps-room4','ps-shop5','ps-boss2',
    'ps-shop6','ps-room5','ps-shop7','ps-room6','ps-shop8','ps-boss3',
  ].forEach((id, idx) => {
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
      el.style.fontSize = cs < 40 ? (cs < 28 ? '9px' : '11px') : '15px';
      el.dataset.xy = `${x},${y}`;

      if (!c.vis) {
        el.classList.add('cell-hidden');
        if (c.isHostile) {
          el.classList.add('cell-hostile');
          el.textContent = '☠';
        } else if (nb8(x, y).some(n => n.isHostile)) {
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
              const memSym = (eph.memType && MEMBRANE_DEFS[eph.memType]) ? MEMBRANE_DEFS[eph.memType].symbol : '◆';
              el.textContent = eph.triggered ? '★' : memSym;
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

  // Exit button: disabled in boss rooms until eyes are neutralized
  const boss = S.ephemers[0];
  const bossLocked = cfg.isBoss && !boss?.eyesNeutralized;
  const exitBtn = document.getElementById('btn-exit-room');
  exitBtn.style.display  = 'inline-block';
  exitBtn.disabled       = bossLocked;
  exitBtn.style.opacity  = bossLocked ? '0.35' : '1';
  exitBtn.style.cursor   = bossLocked ? 'not-allowed' : 'pointer';

  // Warp button: visible only in boss rooms when warpEssence > 0 and snapshot ready
  const warpBtn = document.getElementById('btn-warp');
  if (warpBtn) {
    const showWarp = cfg.isBoss && S.player.res.warpEssence > 0 && S.warpSnapshot !== null;
    warpBtn.classList.toggle('hidden', !showWarp);
    if (showWarp) warpBtn.textContent = `💜 ВАРП (${S.player.res.warpEssence})`;
  }
}

function renderToolCards() {
  const blocked = S.emiBlockedSlot;
  document.getElementById('card-0').className =
    'card-slot' + (S.tool === 'locator'    ? ' sel-locator' : '');
  document.getElementById('card-1').className =
    'card-slot' + (S.tool === 'echobeamer' ? ' sel-echobeamer' : '') +
    (blocked === 1 ? ' slot-blocked' : '');

  const maxSlots = S.player.inventorySlots || 2;
  for (let i = 0; i < 6; i++) {
    const slotEl = document.getElementById(`card-${i + 2}`);
    if (!slotEl) continue;
    if (i >= maxSlots) {
      // Locked slot — show with lock icon and unlock hint
      slotEl.className = 'card-slot slot-locked';
      slotEl.innerHTML = `<div class="card-inner empty-inner"><div class="locked-icon">🔒</div><div class="empty-label">80м</div></div>`;
      continue;
    }
    const item  = S.player.inventory[i];
    const isBlk = blocked === (i + 2);
    if (!item) {
      slotEl.className = 'card-slot empty' + (isBlk ? ' slot-blocked' : '');
      slotEl.innerHTML = `<div class="card-inner empty-inner"><div class="empty-plus">+</div><div class="empty-label">слот</div></div>`;
    } else if (item.type === 'shield') {
      const cracked = item.hp !== undefined && item.hp < 2;
      const shieldColor = cracked ? '#e7943c' : '#4ecdc4';
      const shieldLabel = cracked ? '⚠ ТРЕЩИНА' : 'авто-защита';
      slotEl.className = 'card-slot consumable-shield' + (cracked ? ' shield-cracked' : '') + (isBlk ? ' slot-blocked' : '');
      slotEl.innerHTML = `
        <div class="card-inner">
          <svg class="card-art" viewBox="0 0 64 64">
            <path d="M32 8 L54 18 L54 34 Q54 50 32 58 Q10 50 10 34 L10 18 Z" fill="none" stroke="${shieldColor}" stroke-width="2" opacity=".8"/>
            <path d="M32 16 L46 23 L46 33 Q46 44 32 50 Q18 44 18 33 L18 23 Z" fill="rgba(78,205,196,.1)" stroke="${shieldColor}" stroke-width="1"/>
            ${cracked ? '<line x1="28" y1="14" x2="36" y2="52" stroke="#e74c3c" stroke-width="1.5" opacity=".7"/>' : ''}
            <text x="32" y="37" text-anchor="middle" font-size="14" fill="${shieldColor}">🛡</text>
          </svg>
          <div class="card-name">ЩИТ${cracked ? ' ✦1' : ' ✦2'}</div>
          <div class="card-cost" style="color:${shieldColor}">${isBlk ? '🔒 БЛОК' : shieldLabel}</div>
        </div>`;
    } else if (item.type === 'powerbank') {
      slotEl.className = 'card-slot consumable-powerbank' + (isBlk ? ' slot-blocked' : '');
      slotEl.innerHTML = `
        <div class="card-inner">
          <svg class="card-art" viewBox="0 0 64 64"><rect x="14" y="20" width="36" height="24" rx="4" fill="none" stroke="#f39c12" stroke-width="2"/><rect x="50" y="28" width="5" height="8" rx="2" fill="#f39c12" opacity=".7"/><rect x="16" y="22" width="14" height="20" rx="2" fill="rgba(243,156,18,.35)"/><rect x="31" y="22" width="7" height="20" rx="2" fill="rgba(243,156,18,.2)"/><text x="32" y="37" text-anchor="middle" font-size="11" fill="#f39c12">+4э</text></svg>
          <div class="card-name">ПОВЕРБАНК</div>
          <div class="card-cost gold">${isBlk ? '🔒 БЛОК' : 'нажать → +4э'}</div>
        </div>`;
    }
  }
}

function useWarp() {
  const snap = S.warpSnapshot;
  if (!snap || S.player.res.warpEssence <= 0) return;
  if (S.phase !== 'playing') return;
  const newEssence = S.player.res.warpEssence - 1;
  S = JSON.parse(JSON.stringify(snap));
  S.newEmptyCells = new Set();
  S.player.res.warpEssence = newEssence;
  S.warpSnapshot = null;  // no double-warp
  addLog(`💜 ВАРП! Последний ход отменён. Варп-эссенции: ${newEssence}`, 'trigger');
  SFX.purple();
  renderAll();
}

function useInventorySlot(slotIdx) {
  if (S.phase !== 'playing') return;
  const cardIdx = slotIdx + 2;
  if (S.emiBlockedSlot === cardIdx) {
    addLog(`🔒 СЛОТ ${cardIdx + 1} ЗАБЛОКИРОВАН ЭМИ! (этот ход)`, 'warn');
    SFX.blocked();
    renderLog();
    return;
  }
  const item = S.player.inventory[slotIdx];
  if (!item) return;
  if (item.type === 'powerbank') {
    addEnergy(4, false);
    S.player.inventory.splice(slotIdx, 1);
    addLog(`⚡ Повербанк! +4э. Батарея: ${S.player.battery}/${S.player.batMax}`, 'ok');
    SFX.battery();
    renderAll();
  }
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
      const eyesLeft   = eph.totalEyes - eph.eyesScanned;
      const totalSegs  = eph.segs.length;
      const revealedSegs = eph.scanned + eph.opened;
      card.className = 'eph-card boss-eph' + (eph.done ? ' done-eph' : '');
      let statusText, memLine;
      if (eph.done) {
        statusText = '✓ ПОВЕРЖЕН';
        memLine = '★ ПОБЕДА!';
      } else if (eph.eyesNeutralized) {
        statusText = `Сегм: ${revealedSegs}/${totalSegs}`;
        memLine = '◆ Добей — сканируй оставшиеся сегменты';
      } else {
        statusText = `Глаза: ${eph.eyesScanned}/${eph.totalEyes} — осталось ${eyesLeft}`;
        memLine = '◆ Сканируй Глаза Эхолучом';
      }
      card.innerHTML = `
        <div class="eph-icon boss-icon">⚡</div>
        <div class="eph-info">
          <div class="eph-name">${eph.name.toUpperCase()}</div>
          <div class="eph-prog">${statusText}</div>
          <div class="eph-mem">${memLine}</div>
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
        const icon = eph.type === 'green' ? '◉' : eph.type === 'yellow' ? '◈' : eph.type === 'red' ? '◇' : eph.type === 'purple' ? '◈' : '◆';
        const nameToShow = eph.done ? eph.name.toUpperCase() : 'В ИЗУЧЕНИИ';
        const knownNow    = encyclopedia.has(eph.name);
        const knownBefore = encyclopediaAtRunStart.has(eph.name);
        const totalStr    = (knownNow || knownBefore) ? total : '?';
        const prog  = eph.done
          ? `${eph.scanned}/${totalStr} ✓`
          : `${revealed}/${knownBefore ? total : '?'} сегментов`;
        const memStr = eph.triggered ? '★ триггер!' : (memFound ? '◆ найдена' : '· не найдена');
        // Синие сбежавшие — скрыть карточку
        if (eph.type === 'blue' && eph.escaped) return;

        const effectColors = { green: '#2ecc71', yellow: '#f39c12', red: '#e74c3c', blue: '#3b82f6', purple: '#9b59b6' };
        // Show Echobeamer effect only after first scan; show Locator effect only after Locator hit
        // Exception: if known from a previous run, show everything
        const knownPrev = encyclopediaAtRunStart.has(eph.name);
        const showEcho  = knownPrev || eph.scanned > 0;
        const showLoc   = knownPrev || eph.locatorHit;
        let effectLine  = '';
        if (showEcho && EPH_EFFECTS_ECHO[eph.type]) effectLine += EPH_EFFECTS_ECHO[eph.type];
        if (showLoc  && EPH_EFFECTS_LOC[eph.type])  effectLine += (effectLine ? '. ' : '') + EPH_EFFECTS_LOC[eph.type];

        // Агрессия красного — счётчик до следующего удара
        const redBadge = eph.type === 'red' && eph.aggrActive && !eph.done
          ? `<span class="timer-badge red-badge">⚔${eph.aggrTimer}</span>` : '';

        // Побег синего — счётчик страха
        const blueBadge = eph.type === 'blue' && eph.fearActive && !eph.done
          ? `<span class="timer-badge blue-badge">⏱${eph.fearTimer}</span>` : '';

        // Мембрана — тип
        const memTypeInfo = eph.memType && MEMBRANE_DEFS[eph.memType]
          ? ` <span class="mem-type-badge">${MEMBRANE_DEFS[eph.memType].symbol} ${MEMBRANE_DEFS[eph.memType].name}</span>` : '';

        card.innerHTML = `
          <div class="eph-icon ${eph.type}-icon">${icon}</div>
          <div class="eph-info">
            <div class="eph-name-row"><span class="eph-name">${nameToShow}</span>${redBadge}${blueBadge}</div>
            <div class="eph-prog">${prog}</div>
            <div class="eph-mem">${memStr}${memTypeInfo}</div>
            ${eph.type === 'purple' && !eph.done && eph.invertTriggered ? `<div class="eph-effect" style="color:#9b59b6">⚠ ИНВЕРСИЯ АКТИВНА — пустые клетки: –1э</div>` : ''}
            ${eph.type === 'purple' && !eph.done && !eph.invertTriggered ? `<div class="eph-effect" style="color:#9b59b6;opacity:.6">💜 Не тронут — инверсия неактивна</div>` : ''}
            ${eph.type === 'red' && eph.aggrActive && !eph.done ? `<div class="eph-effect" style="color:#e74c3c">⚔ Удар каждые ${RED_AGGR_INTERVAL} хода</div>` : ''}
            ${eph.type === 'blue' && eph.fearActive && !eph.done ? `<div class="eph-effect" style="color:#3b82f6">⏱ Сбежит через ${eph.fearTimer} ход${eph.fearTimer === 1 ? '' : 'а'}</div>` : ''}
            ${effectLine ? `<div class="eph-effect" style="color:${effectColors[eph.type]}">${effectLine}</div>` : ''}
          </div>`;
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
    const lit = i < S.player.comboNums;
    d.className = 'combo-lamp' + (lit ? ' lit' : '') + (S.invertActive ? ' invert' : '');
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
  const bar = document.getElementById('boss-bar');
  const cfg = ROOM_CONFIGS[currentRoomIdx];
  const isBoss = cfg?.isBoss;
  if (!isBoss || S.phase !== 'playing') { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');

  const boss = S.ephemers[0];

  // After eyes destroyed: show "finish boss" mode
  if (boss?.eyesNeutralized) {
    const totalSegs    = boss.segs.length;
    const revealedSegs = boss.scanned + boss.opened;
    bar.innerHTML = `
      <div class="boss-stat"><span style="color:#f0d060">ДОБЕЙ БОССА</span></div>
      <div class="boss-stat">
        <span style="color:#9b59b6">СЕГМЕНТЫ: </span>
        <span class="boss-val" style="color:#9b59b6">${revealedSegs}/${totalSegs}</span>
      </div>
      <div class="boss-stat"><span style="color:#2ecc71">🚪 ВЫХОД ОТКРЫТ</span></div>
    `;
    return;
  }

  // Normal boss bar
  const pColor = S.pulseTimer <= 2 ? '#e74c3c' : S.pulseTimer <= 3 ? '#f39c12' : '#4ecdc4';
  let html = `
    <div class="boss-stat">
      <span style="color:${pColor}">ПУЛЬС: </span>
      <span class="boss-val" style="color:${pColor}">${S.pulseTimer}</span>
      <span class="boss-unit">ходов</span>
    </div>
    <div class="boss-stat">
      <span style="color:#f0d060">ГЛАЗА: </span>
      <span class="boss-val">${boss?.eyesScanned ?? 0}/${boss?.totalEyes ?? 0}</span>
    </div>
    <div class="boss-stat">
      <span style="color:#e74c3c">ВРАЖДЕБНЫЕ: </span>
      <span class="boss-val">${S.hostileCells.filter(h => h.permanent).length} / ${S.hostileCells.length}</span>
    </div>
  `;

  if (cfg.emiProbs) {
    const nextProb  = cfg.emiProbs[Math.min(S.emiPulseCount, cfg.emiProbs.length - 1)];
    const emiColor  = nextProb >= 1.0 ? '#e74c3c' : nextProb >= 0.5 ? '#f39c12' : '#f0d060';
    const slotNames = ['', 'Эхолуч', 'Слот 3', 'Слот 4'];
    const blockedTxt = S.emiBlockedSlot ? `<span style="font-size:13px;color:#f39c12;margin-left:6px">🔒 ${slotNames[S.emiBlockedSlot]}</span>` : '';
    html += `
      <div class="boss-stat">
        <span style="color:#f39c12">ЭМИ: </span>
        <span class="boss-val" style="color:${emiColor}">${Math.round(nextProb * 100)}%</span>
        ${blockedTxt}
      </div>
    `;
  }

  bar.innerHTML = html;
}

function renderOverlay() {
  const ov = document.getElementById('overlay');
  const ph = S.phase;
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
    'boss-won': isFinalBoss ? '🌟 ФИНАЛ! ВСЕ БОССЫ ПОВЕРЖЕНЫ!' : '⚡ БОСС ПОВЕРЖЕН!',
  };
  document.getElementById('overlay-title').textContent = titles[ph] || '';

  const clean = S.ephemers.filter(e => e.done && e.opened === 0 && e.type !== 'boss').length;
  const total = S.ephemers.filter(e => e.type !== 'boss').length;

  const subs = {
    won:        ph === 'won' && total > 0 ? `Чисто: ${clean}/${total} эфемеров. Поздравляем — миссия завершена!` : 'Поздравляем — миссия завершена!',
    lost:       'Вы погибли. Слава храбрым исследователям Эфира.',
    escaped:    `HP ${p.hp}/${p.hpMax}. ${S.ephemers.filter(e=>e.done).length}/${total} эфемеров. Миссия завершена.`,
    'boss-won': isFinalBoss
      ? `${bossName} уничтожен! Все три босса повержены — забег завершён!`
      : `${bossName} повержен за ${S.turn} ходов! Поздравляем — миссия завершена!`,
  };
  document.getElementById('overlay-sub').textContent = subs[ph] || '';

  const rows = [];

  // ── ФИНАЛЬНЫЙ ЭКРАН ПОБЕДЫ ──────────────────────────────────────
  if (isFinalBoss && ph === 'boss-won') {
    // Merge RUN.stats (prev rooms) + current boss room S.stats
    const rs = S.stats.resStart;
    const runSt  = RUN.stats;
    const totalOI    = runSt.oiEarned    + st.oiEarned;
    const totalTurns = runSt.totalTurns  + S.turn;
    const totalDmgOv = runSt.dmgOverload + st.dmgOverload;
    const totalDmgEph= runSt.dmgEphemeral+ st.dmgEphemeral;
    // Ephemer totals (current boss room has no ephs)
    const metTotal   = runSt.ephemersMet;
    const cleanTotal = runSt.ephemersClean;
    const lostTotal  = runSt.ephemersLost;
    const escTotal   = runSt.ephemersEscaped;
    const bossesKilled = runSt.bossesKilled + 1; // +1 for current
    // Resources earned across all rooms
    const earnG = runSt.resEarned.green  + Math.max(0, p.res.green  - rs.green);
    const earnY = runSt.resEarned.yellow + Math.max(0, p.res.yellow - rs.yellow);
    const earnP = runSt.resEarned.pearl  + Math.max(0, p.res.pearl  - rs.pearl);
    const earnM = runSt.resEarned.money  + Math.max(0, p.res.money  - rs.money);
    // Final score
    const cleanRatio = metTotal > 0 ? cleanTotal / metTotal : 1;
    const score = Math.round(totalOI * p.hp * (1 + cleanRatio));

    rows.push(['── ИТОГОВЫЙ СЧЁТ ────────────────', '']);
    rows.push([`<span style="color:#f0d060;font-size:1.2em">★ СЧЁТ:</span>`,
               `<span style="color:#f0d060;font-size:1.2em">${score}</span>`]);
    rows.push([`<small style="color:#3a6a8a">ОИ × HP × (1 + чистых/всего)</small>`, `<small style="color:#3a6a8a">${totalOI} × ${p.hp} × ${(1 + cleanRatio).toFixed(2)}</small>`]);
    rows.push(['']);
    rows.push(['── ПОЛНЫЙ ОТЧЁТ О ЗАБЕГЕ ────────', '']);
    rows.push(['Боссов уничтожено:', `${bossesKilled}/3`]);
    rows.push(['Всего ходов:', totalTurns]);
    rows.push(['ОИ за забег:', totalOI]);
    rows.push(['HP финальный:', `${p.hp}/${p.hpMax}`]);
    rows.push(['']);
    rows.push(['── ЭФЕМЕРЫ ──────────────────────', '']);
    rows.push(['Встречено:', metTotal]);
    rows.push(['Чисто (без потерь):', cleanTotal]);
    if (lostTotal > 0)  rows.push(['Сегментов потеряно:', lostTotal]);
    if (escTotal > 0)   rows.push(['Сбежало синих:', escTotal]);
    rows.push(['']);
    rows.push(['── ДОБЫТО ЗА ВЕСЬ ЗАБЕГ ─────────', '']);
    rows.push([`<span style="color:#2ecc71">Зелёная эссенция:</span>`, earnG]);
    rows.push([`<span style="color:#f39c12">Жёлтый сгусток:</span>`,   earnY]);
    rows.push([`<span style="color:#e74c3c">Красный жемчуг:</span>`,   earnP]);
    rows.push([`<span style="color:#f0d060">Монеты:</span>`,            earnM]);
    if (totalDmgOv > 0 || totalDmgEph > 0) {
      rows.push(['']);
      rows.push(['── ПОЛУЧЕННЫЙ УЩЕРБ ─────────────', '']);
      if (totalDmgOv  > 0) rows.push(['Перегрузок:', totalDmgOv]);
      if (totalDmgEph > 0) rows.push(['Атак эфемеров:', totalDmgEph]);
    }
  } else {
    // ── ОБЫЧНЫЙ ЭКРАН КОМНАТЫ / ПРОИГРЫША ──────────────────────────
    const premiumData = institutePremium(st.oiEarned);
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
        if (st.dmgEphemeral > 0) rows.push([`<span style="color:#e74c3c;font-weight:bold">–1 HP × атака эфириала:</span>`, `<span style="color:#e74c3c;font-weight:bold">${st.dmgEphemeral}</span>`]);
      }
    } else {
      rows.push(['ОИ:', st.oiEarned]);
      rows.push(['Ходов сделано:', S.turn]);
      if (st.dmgOverload  > 0) rows.push(['Перегрузок:', st.dmgOverload]);
      if (st.dmgEphemeral > 0) rows.push(['Атак эфириала:', st.dmgEphemeral]);
    }
    const rs = S.stats.resStart;
    const earned = {
      green:  Math.max(0, p.res.green  - rs.green),
      yellow: Math.max(0, p.res.yellow - rs.yellow),
      pearl:  Math.max(0, p.res.pearl  - rs.pearl),
      money:  Math.max(0, p.res.money  - rs.money),
    };
    rows.push(['']);
    rows.push(['── Добыто в этой комнате ────────', '']);
    rows.push([`<span style="color:#2ecc71">Зелёная эссенция:</span>`, earned.green]);
    rows.push([`<span style="color:#f39c12">Жёлтый сгусток:</span>`,   earned.yellow]);
    rows.push([`<span style="color:#e74c3c">Красный жемчуг:</span>`,   earned.pearl]);
    rows.push([`<span style="color:#f0d060">Монеты:</span>`,            earned.money]);

    // After Boss 1: hint about purple ephemers (next rooms have them)
    if (ph === 'boss-won' && currentRoomIdx === 2) {
      rows.push(['']);
      rows.push([`<span style="color:#9b59b6">── 💜 НОВЫЙ ТИП: ФИОЛЕТОВЫЕ ──────</span>`, '']);
      rows.push([`<span style="color:#9b59b6">Локатор:</span>`, 'ИНВЕРСИЯ — пустые клетки не дают +1э, а снимают 1э, пока эфемер не исследован']);
      rows.push([`<span style="color:#9b59b6">Эхолуч:</span>`, '40% — случайный ресурс; 40% — ±1 HP; 10% — Варп-эссенция (отмена хода у босса)']);
      rows.push([`<span style="color:#9b59b6">Визуальный эффект:</span>`, 'лампочки Локатора становятся фиолетовыми']);
    }
  }

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
  const itemIcons = { shield: '🛡', powerbank: '⚡' };
  document.getElementById('s-shield').textContent =
    RUN.inventory.map(i => itemIcons[i.type] ?? '?').join(' ') +
    ` (слотов: ${RUN.inventory.length}/${RUN.inventorySlots})`;

  const batIdx  = RUN.batUpgrades;
  const batCostEl = document.getElementById('bat-up-cost');
  if (batCostEl) batCostEl.textContent =
    batIdx < BAT_UPGRADE_COSTS.length ? `${BAT_UPGRADE_COSTS[batIdx]} 🟡 сгустков` : 'МАКСИМУМ';

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
  const typeColors = { green: '#2ecc71', yellow: '#f39c12', red: '#e74c3c', blue: '#4ecdc4', purple: '#9b59b6' };
  title.style.color = typeColors[eph.type] ?? '#4ecdc4';
  title.textContent = eph.name.toUpperCase();
  const total    = eph.segs.length;
  const revealed = eph.scanned + eph.opened;
  const memFound = eph.segs.some(s => { const c = cell(s.x, s.y); return s.isMembrane && c && c.vis; });
  const known    = encyclopedia.has(eph.name) || encyclopediaAtRunStart.has(eph.name);
  const typeNames = { green: 'Зелёный', yellow: 'Жёлтый', red: 'Красный', blue: 'Синий', purple: 'Фиолетовый' };
  const rows = [
    ['Тип',            typeNames[eph.type] ?? eph.type],
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
  document.getElementById('card-4').addEventListener('click', () => useInventorySlot(2));
  document.getElementById('card-5').addEventListener('click', () => useInventorySlot(3));
  document.getElementById('card-6')?.addEventListener('click', () => useInventorySlot(4));
  document.getElementById('card-7')?.addEventListener('click', () => useInventorySlot(5));
  document.addEventListener('keydown', e => {
    if (S.phase !== 'playing') return;
    if (e.key.toLowerCase() === 'l') { S.tool = 'locator';    renderToolCards(); renderGrid(); }
    if (e.key.toLowerCase() === 'e') { S.tool = 'echobeamer'; renderToolCards(); renderGrid(); }
  });
  document.getElementById('btn-overlay-action').addEventListener('click', onOverlayBtn);
  document.getElementById('btn-exit-room').addEventListener('click', exitRoom);
  document.getElementById('btn-warp').addEventListener('click', useWarp);
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
