'use strict';
// ============ dungeon / floor generation ============

function makeRoom(gx, gy, kind) {
  return {
    gx, gy, kind,                    // kind: start | normal | boss | treasure
    seed: randi(1, 1e9),
    visited: false,
    seen: false,                     // shows on minimap as unexplored neighbor
    cleared: kind === 'start' || kind === 'treasure',
    doors: {},                       // side -> neighbor room
    rocks: [],                       // [{cx, cy}]
    stains: [],
    pickups: [],
    pedestals: [],
    enemiesSpawned: false,
    trapdoor: null,
    _base: null,
  };
}

// keep door lanes + center clear
function rockAllowed(cx, cy) {
  const midC = Math.floor(COLS / 2), midR = Math.floor(ROWS / 2);
  if (Math.abs(cx - midC) <= 1 && Math.abs(cy - midR) <= 1) return false; // center spawn
  if (cx === midC && (cy <= 1 || cy >= ROWS - 2)) return false;           // N/S door lanes
  if (cy === midR && (cx <= 1 || cx >= COLS - 2)) return false;           // W/E door lanes
  return true;
}

function populateRocks(room) {
  if (room.kind !== 'normal') return;
  const rng = mulberry32(room.seed);
  const layouts = ['scatter', 'corners', 'pillars', 'none'];
  const layout = layouts[Math.floor(rng() * layouts.length)];
  if (layout === 'scatter') {
    for (let cy = 0; cy < ROWS; cy++)
      for (let cx = 0; cx < COLS; cx++)
        if (rng() < 0.07 && rockAllowed(cx, cy)) room.rocks.push({ cx, cy });
  } else if (layout === 'corners') {
    const pts = [[2, 1], [COLS - 3, 1], [2, ROWS - 2], [COLS - 3, ROWS - 2]];
    for (const [cx, cy] of pts) {
      room.rocks.push({ cx, cy });
      if (rng() < 0.5 && rockAllowed(cx + 1, cy)) room.rocks.push({ cx: cx + 1, cy });
      if (rng() < 0.5 && rockAllowed(cx, cy + 1)) room.rocks.push({ cx, cy: cy + 1 });
    }
  } else if (layout === 'pillars') {
    for (const cx of [3, 6, 9]) {
      for (const cy of [2, 4]) {
        if (rockAllowed(cx, cy)) room.rocks.push({ cx, cy });
      }
    }
  }
}

const DIRS = [
  { side: 'N', dx: 0, dy: -1 },
  { side: 'S', dx: 0, dy: 1 },
  { side: 'W', dx: -1, dy: 0 },
  { side: 'E', dx: 1, dy: 0 },
];
const OPP = { N: 'S', S: 'N', W: 'E', E: 'W' };

function linkRooms(a, b) {
  for (const d of DIRS) {
    if (a.gx + d.dx === b.gx && a.gy + d.dy === b.gy) {
      a.doors[d.side] = b;
      b.doors[OPP[d.side]] = a;
      return;
    }
  }
}

// Random-walk floor layout: 5-8 rooms + boss room + treasure room
function generateFloor(depth) {
  const byKey = new Map();
  const key = (x, y) => x + ',' + y;
  const rooms = [];

  const start = makeRoom(0, 0, 'start');
  byKey.set(key(0, 0), start);
  rooms.push(start);

  // deeper floors get a couple more rooms, Isaac's count also scales with level
  const normalCount = Math.min(10, randi(5, 8) + Math.floor((depth - 1) / 4));
  let guard = 0;
  while (rooms.length < normalCount && guard++ < 400) {
    const from = pick(rooms);
    const d = pick(DIRS);
    const nx = from.gx + d.dx, ny = from.gy + d.dy;
    if (byKey.has(key(nx, ny))) continue;
    // avoid too many neighbors (keeps layout branchy, isaac-like)
    let neighbors = 0;
    for (const dd of DIRS) if (byKey.has(key(nx + dd.dx, ny + dd.dy))) neighbors++;
    if (neighbors > 1 && chance(0.7)) continue;
    const room = makeRoom(nx, ny, 'normal');
    byKey.set(key(nx, ny), room);
    rooms.push(room);
  }

  // link all adjacent rooms
  for (const room of rooms) {
    for (const d of DIRS) {
      const nb = byKey.get(key(room.gx + d.dx, room.gy + d.dy));
      if (nb) room.doors[d.side] = nb;
    }
  }

  // BFS distance from start to find the farthest room for boss placement
  const distMap = new Map([[start, 0]]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    for (const side in cur.doors) {
      const nb = cur.doors[side];
      if (!distMap.has(nb)) { distMap.set(nb, distMap.get(cur) + 1); queue.push(nb); }
    }
  }

  // attach special room in a free slot adjacent to `anchor`
  function attachSpecial(anchor, kind) {
    const options = DIRS.filter(d => !byKey.has(key(anchor.gx + d.dx, anchor.gy + d.dy)));
    if (!options.length) return null;
    const d = pick(options);
    const room = makeRoom(anchor.gx + d.dx, anchor.gy + d.dy, kind);
    byKey.set(key(room.gx, room.gy), room);
    rooms.push(room);
    linkRooms(anchor, room);
    return room;
  }

  // boss room: attach to farthest room (fall back through sorted candidates)
  const sorted = [...rooms].filter(r => r.kind !== 'start' || rooms.length === 1)
    .sort((a, b) => distMap.get(b) - distMap.get(a));
  let bossRoom = null;
  for (const cand of [...sorted, start]) {
    bossRoom = attachSpecial(cand, 'boss');
    if (bossRoom) break;
  }

  // treasure room: attach near start
  const nearSorted = [...rooms].filter(r => r.kind === 'normal' || r.kind === 'start')
    .sort((a, b) => distMap.get(a) - distMap.get(b));
  let treasureRoom = null;
  for (const cand of nearSorted) {
    treasureRoom = attachSpecial(cand, 'treasure');
    if (treasureRoom) break;
  }
  if (treasureRoom) {
    treasureRoom.pedestals.push({ x: W / 2, y: H / 2, def: null, anim: rand(10), taken: false, pendingRandom: true });
  }

  for (const room of rooms) populateRocks(room);

  start.visited = true;
  return { rooms, start, depth, name: FLOOR_NAMES[depth - 1] || 'BASEMENT' };
}

// ============ minimap ============
function drawMinimap(g, floor, current) {
  const cell = 17, gap = 3;
  // bounds of known rooms
  const known = floor.rooms.filter(r => r.visited || r.seen);
  if (!known.length) return;
  const mapW = 5, mapH = 5; // cells viewport centered on current
  const ox = W - 24 - (mapW * (cell + gap)) / 2;
  const oy = 24 + (mapH * (cell + gap)) / 2;
  g.save();
  g.globalAlpha = 0.92;
  // backdrop
  g.fillStyle = 'rgba(10,8,6,0.55)';
  g.fillRect(ox - (mapW / 2) * (cell + gap) - 6, oy - (mapH / 2) * (cell + gap) - 6,
    mapW * (cell + gap) + 12, mapH * (cell + gap) + 12);
  for (const r of known) {
    const rx = r.gx - current.gx, ry = r.gy - current.gy;
    if (Math.abs(rx) > 2 || Math.abs(ry) > 2) continue;
    const x = ox + rx * (cell + gap) - cell / 2;
    const y = oy + ry * (cell + gap) - cell / 2;
    let fill = '#5a5147';
    if (r.visited) fill = '#b8ab92';
    if (r === current) fill = '#efe6d2';
    g.fillStyle = fill;
    g.fillRect(x, y, cell, cell);
    if (r.kind === 'boss') {
      g.fillStyle = '#a3271b';
      g.beginPath(); g.arc(x + cell / 2, y + cell / 2, 4.5, 0, TAU); g.fill();
    } else if (r.kind === 'treasure') {
      g.fillStyle = '#d9b53a';
      g.fillRect(x + cell / 2 - 3.5, y + cell / 2 - 3.5, 7, 7);
    }
  }
  g.restore();
}
