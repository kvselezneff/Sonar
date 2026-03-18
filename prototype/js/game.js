'use strict';
// ═══════════════════════════════════════════════════════════════════
//  ECHOSWEEPER — Prototype v0.2
//  New: predefined shapes, vertical battery, ephemer tracker,
//       encyclopedia popup, tool cards
// ═══════════════════════════════════════════════════════════════════

// ─── CONSTANTS ────────────────────────────────────────────────────
const GRID_W = 10, GRID_H = 10;
const BAT_MAX   = 7;
const BAT_START = 3;
const HP_MAX    = 3;
const ECHO_COST = 2;

// ─── PREDEFINED SHAPES (from Echonautics reference image) ─────────
// Each entry: cells = [[x,y]...], memIdx = index of membrane cell
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

// Act 1 config
const ROOM_CONFIG = [
  { type: 'green',  shapes: GREEN_SHAPES,  count: 2 },
  { type: 'yellow', shapes: YELLOW_SHAPES, count: 1 },
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
function playTone(freq, dur = 0.15, type = 'sine', vol = 0.2) {
  try {
    const ctx = getAudio();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(); osc.stop(ctx.currentTime + dur);
  } catch(e) {}
}
const SFX = {
  oi:      () => playTone(880, 0.12, 'sine',     0.2),
  green:   () => playTone(523, 0.15, 'triangle', 0.25),
  yellow:  () => { playTone(660, 0.1, 'sine', 0.2); setTimeout(() => playTone(880, 0.1, 'sine', 0.15), 80); },
  money:   () => { playTone(660, 0.07, 'square', 0.12); setTimeout(() => playTone(880, 0.07, 'square', 0.12), 70); },
  battery: () => playTone(330, 0.12, 'triangle', 0.2),
  warn:    () => { [0, 150, 300].forEach(d => setTimeout(() => playTone(180, 0.12, 'sawtooth', 0.3), d)); },
  combo:   () => playTone(1047, 0.22, 'sine', 0.28),
};

// ─── PERSISTENT STATE (survives newRun) ───────────────────────────
const encyclopedia = new Set(); // ephemer names completed at least once
let encyclopediaAtRunStart = new Set(); // snapshot taken before each run

// ─── STATE ────────────────────────────────────────────────────────
let S = {};

function newState() {
  return {
    grid: makeGrid(),
    ephemers: [],
    player: {
      hp: HP_MAX,
      battery: BAT_START,
      batMax:  BAT_MAX,
      res: { green: 0, yellow: 0, pearl: 0, money: 0, oi: 0 },
    comboNums: 0,
    },
    tool:  'locator',
    turn:  0,
    phase: 'playing',
    log:   [],
  };
}

// ─── GRID ─────────────────────────────────────────────────────────
function makeGrid() {
  const g = [];
  for (let y = 0; y < GRID_H; y++) {
    g[y] = [];
    for (let x = 0; x < GRID_W; x++)
      g[y][x] = { x, y, vis: false, state: 'hidden', resNum: 0, eIdx: -1, isMembrane: false };
  }
  return g;
}
const cell = (x, y) =>
  (x >= 0 && x < GRID_W && y >= 0 && y < GRID_H) ? S.grid[y][x] : null;
const nb8 = (x, y) => {
  const r = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (dx || dy) { const c = cell(x+dx, y+dy); if (c) r.push(c); }
  return r;
};
const nb4 = (x, y) =>
  [[-1,0],[1,0],[0,-1],[0,1]].map(([dx,dy]) => cell(x+dx,y+dy)).filter(Boolean);

// ─── EPHEMER PLACEMENT ────────────────────────────────────────────
function placeEphemers() {
  const occupied = new Set();
  const usedShapes = new Set();

  for (const cfg of ROOM_CONFIG) {
    for (let i = 0; i < cfg.count; i++) {
      // Pick a shape not yet used this run
      const available = cfg.shapes.filter((_, idx) => !usedShapes.has(cfg.type + idx));
      const shapeDef  = available[Math.floor(Math.random() * available.length)];
      const shapeIdx  = cfg.shapes.indexOf(shapeDef);
      usedShapes.add(cfg.type + shapeIdx);

      // Rotate randomly
      const rotCells = randomRotation(shapeDef.cells);

      // Try to place
      const placed = tryPlace(rotCells, occupied, shapeDef.memIdx, shapeDef.cells, rotCells);
      if (!placed) { addLog('⚠ Не удалось разместить эфемер', 'warn'); continue; }

      placed.forEach(s => occupied.add(`${s.x},${s.y}`));

      const memCell = placed[placed.memIdx];
      const eph = {
        id: S.ephemers.length,
        type: cfg.type,
        name: shapeDef.name,
        segs: placed,       // [{x,y,isMembrane}]
        scanned: 0,
        opened:  0,
        done:    false,
        triggered: false,
        discovered: false,  // any segment revealed
      };

      placed.forEach(s => {
        const c = cell(s.x, s.y);
        c.eIdx       = eph.id;
        c.isMembrane = s.isMembrane;
      });
      S.ephemers.push(eph);
    }
  }
}

function tryPlace(rotCells, occupied, origMemIdx, origCells, _rotCells) {
  // rotCells = already-rotated [[x,y]...]
  // After rotation, memIdx in original → need to track which rotated cell is the membrane
  // Simple approach: mark membrane by position match won't work after rotation
  // Instead: track memIdx through rotation
  // We re-rotate here to preserve membrane index
  for (let attempt = 0; attempt < 60; attempt++) {
    const ox = 1 + Math.floor(Math.random() * (GRID_W - 4));
    const oy = 1 + Math.floor(Math.random() * (GRID_H - 4));
    const placed = rotCells.map(([cx, cy], idx) => ({
      x: cx + ox,
      y: cy + oy,
      isMembrane: (idx === origMemIdx),
    }));
    if (placed.some(s => s.x >= GRID_W || s.y >= GRID_H)) continue;
    if (placed.some(s => occupied.has(`${s.x},${s.y}`))) continue;
    // No side-adjacency with cells from other ephemers (diagonal only)
    const placedKeys = new Set(placed.map(s => `${s.x},${s.y}`));
    const sideBlocked = placed.some(s =>
      [[0,1],[0,-1],[1,0],[-1,0]].some(([dx,dy]) => {
        const k = `${s.x+dx},${s.y+dy}`;
        return occupied.has(k) && !placedKeys.has(k);
      })
    );
    if (sideBlocked) continue;
    placed.memIdx = origMemIdx;
    return placed;
  }
  return null;
}

// ─── RESONANCE NUMBERS ────────────────────────────────────────────
function calcResonance() {
  for (let y = 0; y < GRID_H; y++)
    for (let x = 0; x < GRID_W; x++) {
      const c = S.grid[y][x];
      if (c.eIdx !== -1) continue;
      c.resNum = nb8(x, y).filter(n => n.eIdx !== -1).length;
    }
}

// ─── HELPERS ──────────────────────────────────────────────────────
function addOI(n) {
  S.player.res.oi += n;
  SFX.oi();
}

// ─── TOOL APPLICATION ─────────────────────────────────────────────
function applyTool(x, y) {
  if (S.phase !== 'playing') return;
  const c = cell(x, y);
  if (!c || c.state !== 'hidden') return;
  if (S.tool === 'locator') doLocator(c);
  else                       doEchobeamer(c);
  S.turn++;
  checkWinLose();
  renderAll();
}

// ── LOCATOR ──
function doLocator(c) {
  if (c.eIdx !== -1) {
    const eph = S.ephemers[c.eIdx];
    eph.discovered = true;
    takeDamage(1);
    c.state = 'open'; c.vis = true;
    eph.opened++;

    if (eph.type === 'yellow') {
      addLog(`💥 ВЗРЫВ! Жёлтый – 1 HP. Взрыв 3×3 +2э`, 'err');
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nc = cell(c.x+dx, c.y+dy);
          if (nc && nc.state === 'hidden') explodeReveal(nc);
        }
      addEnergy(2, true);
    } else {
      addLog(`⚡ Штраф! Локатор на ${eph.name}. –1 HP. Сегмент потерян.`, 'err');
    }
    checkEphDone(eph);
  } else {
    if (c.resNum === 0) {
      c.state = 'empty'; c.vis = true;
      addEnergy(1, true);
      addLog(`📡 Пустая. +1э.`, 'ok');
      SFX.battery();
    } else {
      c.state = 'number'; c.vis = true;
      addLog(`📍 Число ${c.resNum}.`, 'info');
      // Combo counter: 5 numbers → +1 OI
      S.player.comboNums++;
      if (S.player.comboNums >= 5) {
        S.player.comboNums = 0;
        addOI(1);
        addLog(`💡 КОМБО-РАЗРЯД! 5 чисел → +1 ОИ`, 'ok');
        SFX.combo();
      }
    }
  }
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
      if (n.resNum === 0) { n.state = 'empty';  n.vis = true; queue.push({ x: n.x, y: n.y }); }
      else                { n.state = 'number'; n.vis = true; }
    }
  }
}

// ── ECHOBEAMER ──
function doEchobeamer(c) {
  if (S.player.battery < ECHO_COST) {
    addLog(`❌ Нет энергии для Эхолуча (нужно ${ECHO_COST}э).`, 'warn');
    return;
  }
  if (c.eIdx === -1) {
    addEnergy(-ECHO_COST, false);
    c.state = c.resNum === 0 ? 'empty' : 'number'; c.vis = true;
    addLog(`🔊 Эхолуч на пустую. –${ECHO_COST}э. Впустую.`, 'warn');
    return;
  }
  const eph = S.ephemers[c.eIdx];
  eph.discovered = true;
  addEnergy(-ECHO_COST, false);
  c.state = 'scanned'; c.vis = true;
  eph.scanned++;

  if (eph.type === 'green') {
    S.player.res.green++;
    addOI(1);
    addLog(`✅ Зелёный сегмент. +1 эссенция +1 ОИ. –${ECHO_COST}э.`, 'ok');
    SFX.green();
  } else if (eph.type === 'yellow') {
    const room = S.player.batMax - S.player.battery;
    if (room >= 4) {
      addEnergy(4, false);
      addLog(`✅ Жёлтый сегмент. +4э. Итого: ${S.player.battery}/${S.player.batMax}.`, 'ok');
      SFX.yellow();
    } else {
      if (room > 0) addEnergy(room, false);
      S.player.res.yellow++;
      addLog(`✅ Жёлтый. Батарея заполнена. +1 эфир.`, 'ok');
      SFX.yellow();
    }
  }

  // Membrane Trigger check
  if (c.isMembrane) {
    const revealed = eph.scanned + eph.opened;
    if (revealed === eph.segs.length) {
      eph.triggered = true;
      addEnergy(2, false);
      addOI(3);
      addLog(`🎯 MEMBRANE TRIGGER! +2э +3 ОИ!`, 'trigger');
    }
  }
  checkEphDone(eph);
}

// ─── EPHEMER COMPLETION ───────────────────────────────────────────
function checkEphDone(eph) {
  if (eph.done) return;
  if (eph.scanned + eph.opened >= eph.segs.length) {
    eph.done = true;
    const clean = eph.opened === 0;
    encyclopedia.add(eph.name); // unlock shape for future runs
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
    const next = prev + delta;
    if (overflow && next > S.player.batMax) {
      S.player.battery = S.player.batMax;
      addLog(`⚡ Перегрузка батареи! –1 HP`, 'err');
      takeDamage(1);
    } else {
      S.player.battery = Math.min(S.player.batMax, next);
    }
    // Warn when battery REACHES max
    if (S.player.battery === S.player.batMax && prev < S.player.batMax) {
      addLog(`❗ РИСК ПЕРЕГРУЗКИ — батарея полна!`, 'err');
      addLog(`❗ Следующая пустая ячейка нанесёт −1 HP`, 'err');
      addLog(`❗ Переключитесь на Эхолуч!`, 'err');
      SFX.warn();
    }
  } else {
    S.player.battery = Math.max(0, S.player.battery + delta);
  }
}
function takeDamage(n) {
  S.player.hp = Math.max(0, S.player.hp - n);
  if (S.player.hp <= 0) { S.phase = 'lost'; addLog(`💀 HP = 0.`, 'err'); }
}
function checkWinLose() {
  if (S.phase === 'playing' && S.ephemers.every(e => e.done)) {
    S.phase = 'won';
    addLog(`🏆 Все Эфемеры завершены!`, 'ok');
  }
}
function exitRoom() {
  if (S.phase !== 'playing') return;
  S.phase = 'escaped';
  addLog(`🚪 Вы покинули комнату. HP ${S.player.hp}/3 сохранено.`, 'warn');
  renderAll();
}

// ─── LOG ──────────────────────────────────────────────────────────
function addLog(msg, type = 'info') {
  S.log.unshift({ msg, type });
  if (S.log.length > 20) S.log.pop();
}

// ─── RENDER ───────────────────────────────────────────────────────
function renderAll() {
  renderResBar();
  renderBattery();
  renderGrid();
  renderToolCards();
  renderComboLamps();
  renderHP();
  renderEphTracker();
  renderLog();
  renderOverlay();
}

// Resources bar
function renderResBar() {
  document.getElementById('r-oi').textContent     = S.player.res.oi;
  document.getElementById('r-green').textContent  = S.player.res.green;
  document.getElementById('r-yellow').textContent = S.player.res.yellow;
  document.getElementById('r-pearl').textContent  = S.player.res.pearl;
  document.getElementById('r-money').textContent  = S.player.res.money;
  document.getElementById('turn-val').textContent = S.turn;
}

// Vertical battery
function renderBattery() {
  const el = document.getElementById('bat-pips');
  el.innerHTML = '';
  // Render from index 0 = bottom pip to batMax-1 = top pip
  for (let i = 0; i < S.player.batMax; i++) {
    const pip = document.createElement('div');
    const filled = i < S.player.battery;
    const isTop  = (i === S.player.batMax - 1); // last pip = overflow warning
    pip.className = 'bat-pip ' + (filled ? (isTop ? 'full warn' : 'full') : 'empty');
    el.appendChild(pip); // column-reverse CSS handles visual reversal
  }
  document.getElementById('bat-val').textContent = `${S.player.battery}/${S.player.batMax}`;
}

// Grid
function renderGrid() {
  const wrap = document.getElementById('grid-wrap');
  wrap.className = S.tool === 'locator' ? 'tool-locator' : 'tool-echobeamer';
  const container = document.getElementById('grid');
  container.innerHTML = '';

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const c  = S.grid[y][x];
      const el = document.createElement('div');
      el.className  = 'cell';
      el.dataset.xy = `${x},${y}`;

      if (!c.vis) {
        el.classList.add('cell-hidden');
      } else {
        switch (c.state) {
          case 'empty':
            el.classList.add('cell-empty');
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
            if (c.isMembrane) {
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
}

// Tool cards
function renderToolCards() {
  document.getElementById('card-0').className =
    'card-slot' + (S.tool === 'locator'    ? ' sel-locator' : '');
  document.getElementById('card-1').className =
    'card-slot' + (S.tool === 'echobeamer' ? ' sel-echobeamer' : '');
}

// HP
function renderHP() {
  const el = document.getElementById('hp-display');
  el.innerHTML = '';
  for (let i = 0; i < HP_MAX; i++) {
    const h = document.createElement('span');
    h.className = 'heart ' + (i < S.player.hp ? 'full' : 'empty');
    h.textContent = i < S.player.hp ? '♥' : '♡';
    el.appendChild(h);
  }
}

// Ephemer tracker
function renderEphTracker() {
  const el = document.getElementById('eph-list');
  el.innerHTML = '';

  S.ephemers.forEach(eph => {
    const card = document.createElement('div');
    const total   = eph.segs.length;
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
      const known = encyclopediaAtRunStart.has(eph.name);
      const totalStr = known ? `${total}` : '?';
      const prog = eph.done
        ? `${eph.scanned}/${totalStr} ✓`
        : `${revealed}/${totalStr} сегментов`;
      const memStr = eph.triggered ? '★ тригер!' : (memFound ? '◆ найдена' : '· не найдена');

      card.innerHTML = `
        <div class="eph-icon ${eph.type}-icon">${icon}</div>
        <div class="eph-info">
          <div class="eph-name">${eph.name.toUpperCase()}</div>
          <div class="eph-prog">${prog}</div>
          <div class="eph-mem">${memStr}</div>
        </div>`;
      // Mini shape preview — only if known from a previous run
      if (known) {
        card.appendChild(buildMiniShape(eph));
      }
      card.addEventListener('click', () => showEncyclopedia(eph));
    }
    el.appendChild(card);
  });
}

// Mini shape grid (5×5)
function buildMiniShape(eph) {
  // Compute bounding box of shape
  const xs = eph.segs.map(s => s.x), ys = eph.segs.map(s => s.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const maxX = Math.max(...xs), maxY = Math.max(...ys);
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const size = Math.max(w, h, 3);

  const grid = document.createElement('div');
  grid.className = 'mini-shape';
  grid.style.gridTemplateColumns = `repeat(${size}, 7px)`;
  grid.style.gridTemplateRows    = `repeat(${size}, 7px)`;

  // Build lookup
  const segSet = new Map(eph.segs.map(s => [`${s.x - minX},${s.y - minY}`, s]));

  for (let gy = 0; gy < size; gy++) {
    for (let gx = 0; gx < size; gx++) {
      const div = document.createElement('div');
      div.className = 'ms-cell';
      const seg = segSet.get(`${gx},${gy}`);
      if (seg) {
        const c = cell(seg.x, seg.y);
        if (c && c.vis) {
          div.classList.add(seg.isMembrane ? 'seg-mem' : `seg-${eph.type}`);
        } else {
          div.style.background = '#1a2e44';
        }
      }
      grid.appendChild(div);
    }
  }
  return grid;
}

// Combo lamps (5 under locator)
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

// Log
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

// Overlay
function renderOverlay() {
  const ov = document.getElementById('overlay');
  if (S.phase === 'playing') { ov.classList.add('hidden'); return; }
  ov.classList.remove('hidden');
  const p = S.player;
  const titles = { won: '🏆 КОМНАТА ОЧИЩЕНА', lost: '💀 ЗАБЕГ ОКОНЧЕН', escaped: '🚪 ВЫХОД ИЗ КОМНАТЫ' };
  document.getElementById('overlay-title').textContent = titles[S.phase] || '';
  const clean = S.ephemers.filter(e => e.done && e.opened === 0).length;
  const subs = {
    won:     `Чисто: ${clean}/${S.ephemers.length} Эфемеров.`,
    lost:    'HP = 0. Разблокировки сохранены.',
    escaped: `HP ${S.player.hp}/3 сохранено. ${S.ephemers.filter(e=>e.done).length}/${S.ephemers.length} Эфемеров завершено.`,
  };
  document.getElementById('overlay-sub').textContent = subs[S.phase] || '';
  document.getElementById('overlay-stats').textContent =
    `Эссенция: ${p.res.green}\nЭфир: ${p.res.yellow}\nМонеты: ${p.res.money}\nОИ: ${p.res.oi}`;
}

// ─── ENCYCLOPEDIA POPUP ───────────────────────────────────────────
function showEncyclopedia(eph) {
  const box = document.getElementById('ency-body');
  const title = document.getElementById('ency-title');
  title.style.color = eph.type === 'green' ? '#2ecc71' : '#f39c12';
  title.textContent = eph.name.toUpperCase();

  const total    = eph.segs.length;
  const revealed = eph.scanned + eph.opened;
  const memFound = eph.segs.some(s => {
    const c = cell(s.x, s.y);
    return s.isMembrane && c && c.vis;
  });

  const known = encyclopediaAtRunStart.has(eph.name);
  const rows = [
    ['Тип',       eph.type === 'green' ? 'Зелёный' : 'Жёлтый'],
    ['Сегментов', known ? `${total}` : '?'],
    ['Просканировано', `${eph.scanned}/${known ? total : '?'}`],
    ['Потеряно',  `${eph.opened}`],
    ['Мембрана',  memFound ? (eph.triggered ? '★ Тригер сработал' : '◆ Обнаружена') : '· Не найдена'],
    ['Статус',    eph.done ? '✓ Завершён' : 'В процессе'],
  ];

  box.innerHTML = rows.map(([k, v]) =>
    `<div class="ency-row"><span class="ency-key">${k}</span><span class="ency-val">${v}</span></div>`
  ).join('') +
  `<div class="ency-empty">Энциклопедия пуста.<br>Купить данные в Институте.</div>`;

  document.getElementById('ency-popup').classList.remove('hidden');
}

// ─── INIT ─────────────────────────────────────────────────────────
function newRun() {
  encyclopediaAtRunStart = new Set(encyclopedia); // snapshot before run
  S = newState();
  placeEphemers();
  calcResonance();
  renderAll();
  addLog(`📻 Эфир активен. ${S.ephemers.length} Эфемера в секторе.`, 'info');
  renderLog();
}

document.addEventListener('DOMContentLoaded', () => {
  // Tool card clicks
  document.getElementById('card-0').addEventListener('click', () => {
    S.tool = 'locator'; renderToolCards(); renderGrid();
  });
  document.getElementById('card-1').addEventListener('click', () => {
    S.tool = 'echobeamer'; renderToolCards(); renderGrid();
  });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (S.phase !== 'playing') return;
    if (e.key.toLowerCase() === 'l') { S.tool = 'locator';    renderToolCards(); renderGrid(); }
    if (e.key.toLowerCase() === 'e') { S.tool = 'echobeamer'; renderToolCards(); renderGrid(); }
  });

  // Overlay restart
  document.getElementById('btn-new-run').addEventListener('click', newRun);

  // Exit room button
  document.getElementById('btn-exit-room').addEventListener('click', exitRoom);

  // Encyclopedia close
  document.getElementById('ency-close').addEventListener('click', () => {
    document.getElementById('ency-popup').classList.add('hidden');
  });
  document.getElementById('ency-popup').addEventListener('click', e => {
    if (e.target === document.getElementById('ency-popup'))
      document.getElementById('ency-popup').classList.add('hidden');
  });

  newRun();
});
