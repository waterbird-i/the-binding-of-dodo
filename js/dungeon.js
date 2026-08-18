'use strict';
// ============ dungeon / floor generation ============

// kinds without enemies waiting behind the door start cleared (doors open)
const PEACEFUL_KINDS = ['start', 'treasure', 'curse', 'challenge', 'secret', 'sacrifice', 'devil'];

function makeRoom(gx, gy, kind) {
  return {
    gx, gy, kind,                    // start | normal | boss | treasure | shop | curse | challenge | miniboss | secret | sacrifice | devil
    seed: randi(1, 1e9),
    visited: false,
    seen: false,                     // shows on minimap as unexplored neighbor
    cleared: PEACEFUL_KINDS.includes(kind),
    doors: {},                       // side -> neighbor room
    hiddenSides: null,               // { side: true } — walls hiding a secret room, bomb to open
    challengeWaves: 0,               // remaining challenge-room enemy waves
    challengeStarted: false,
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

// link two adjacent rooms through a solid-looking wall: the door exists but
// is invisible and impassable until a bomb blast reveals it from either side
function linkHidden(a, b) {
  for (const d of DIRS) {
    if (a.gx + d.dx === b.gx && a.gy + d.dy === b.gy) {
      a.doors[d.side] = b;
      b.doors[OPP[d.side]] = a;
      if (!a.hiddenSides) a.hiddenSides = {};
      if (!b.hiddenSides) b.hiddenSides = {};
      a.hiddenSides[d.side] = true;
      b.hiddenSides[OPP[d.side]] = true;
      return;
    }
  }
}

// Random-walk floor layout: 5-8 rooms + boss room + treasure room
function generateFloor(depth, hard) {
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
    if (!hard && chance(0.35)) {
      // choice pair: two treasures share one fate — take one, the other
      // crumbles to dust (Isaac's alt-path "options" pedestals)
      for (const dx of [-75, 75]) {
        treasureRoom.pedestals.push({ x: W / 2 + dx, y: H / 2, def: null, anim: rand(10), taken: false,
          pendingRandom: true, pool: 'treasure', choiceGroup: 1 });
      }
    } else {
      // a quarter of treasure rooms offer a spacebar item instead of a passive
      const active = chance(0.25);
      treasureRoom.pedestals.push({ x: W / 2 - (hard ? 70 : 0), y: H / 2, def: null, anim: rand(10), taken: false,
        pendingRandom: !active, pendingActive: active, pool: 'treasure' });
      // the risky route pays double treasure
      if (hard) {
        treasureRoom.pedestals.push({ x: W / 2 + 70, y: H / 2, def: null, anim: rand(10), taken: false,
          pendingRandom: true, pool: 'treasure' });
      }
    }
  }

  // shop room: also attached near the start; wares are stocked on first
  // entry (needs the live player's item list to avoid selling duplicates)
  for (const cand of nearSorted) {
    if (attachSpecial(cand, 'shop')) break;
  }

  // random-anchor pool for the risk rooms below
  // rng() (not Math.random) so seeded runs shuffle the same way every time
  const shuffled = () => [...rooms].filter(r => r.kind === 'normal').sort(() => rng() - 0.5);

  // curse room (60%): spiked door taxes half a heart on the way in and out
  if (chance(0.6)) {
    for (const cand of shuffled()) {
      const room = attachSpecial(cand, 'curse');
      if (!room) continue;
      room.pedestals.push({ x: W / 2, y: H / 2, def: null, anim: rand(10), taken: false, pendingRandom: true });
      if (chance(0.4)) room.pickups.push({ kind: 'chest', x: W / 2 - 110, y: H / 2, anim: rand(10), taken: false });
      break;
    }
  }

  // challenge room (55%): grab the pedestal, fight the waves it summons
  if (chance(0.55)) {
    for (const cand of shuffled()) {
      const room = attachSpecial(cand, 'challenge');
      if (!room) continue;
      room.pedestals.push({ x: W / 2, y: H / 2, def: null, anim: rand(10), taken: false, pendingRandom: true });
      break;
    }
  }

  // sacrifice room (45%): a spike bed in the center — bleed on it repeatedly
  // and the altar pays out on an escalating table (see sacrificeReward)
  if (chance(0.45)) {
    for (const cand of shuffled()) {
      const room = attachSpecial(cand, 'sacrifice');
      if (!room) continue;
      room.sacrifices = 0;
      break;
    }
  }

  // mini-boss room (50%): converts a normal room; looks identical on the map
  // until entered — the surprise is the point
  if (chance(0.5)) {
    const cands = rooms.filter(r => r.kind === 'normal' && (distMap.get(r) || 0) >= 2);
    if (cands.length) pick(cands).kind = 'miniboss';
  }

  // secret room: always one per floor, wedged into the empty cell touching
  // the most rooms, sealed behind bombable walls on every touching side
  {
    const cellMap = new Map();  // "x,y" -> { x, y, list: [rooms] }
    for (const room of rooms) {
      if (room.kind === 'boss' || room.kind === 'secret') continue;
      for (const d of DIRS) {
        const nx = room.gx + d.dx, ny = room.gy + d.dy;
        const k = key(nx, ny);
        if (byKey.has(k)) continue;
        if (!cellMap.has(k)) cellMap.set(k, { x: nx, y: ny, list: [] });
        cellMap.get(k).list.push(room);
      }
    }
    let best = null;
    for (const cell of cellMap.values()) {
      if (!best || cell.list.length > best.list.length ||
        (cell.list.length === best.list.length && chance(0.5))) best = cell;
    }
    if (best) {
      const secret = makeRoom(best.x, best.y, 'secret');
      byKey.set(key(best.x, best.y), secret);
      rooms.push(secret);
      for (const nb of best.list) linkHidden(nb, secret);
      // stash: coins plus a bomb/battery, sometimes a pedestal
      for (const [dx, k2] of [[-60, 'coin'], [0, 'coin'], [60, 'coin']]) {
        secret.pickups.push({ kind: k2, x: W / 2 + dx, y: H / 2 + 50, anim: rand(10), taken: false });
      }
      if (chance(0.6)) secret.pickups.push({ kind: 'bomb', x: W / 2 - 90, y: H / 2 - 20, anim: rand(10), taken: false });
      if (chance(0.5)) secret.pickups.push({ kind: 'battery', x: W / 2 + 90, y: H / 2 - 20, anim: rand(10), taken: false });
      if (chance(0.3)) secret.pickups.push({ kind: 'soulheart', x: W / 2, y: H / 2 + 110, anim: rand(10), taken: false });
      if (chance(0.35)) {
        const active = chance(0.5);
        secret.pedestals.push({ x: W / 2, y: H / 2 - 60, def: null, anim: rand(10), taken: false,
          pendingRandom: !active, pendingActive: active });
      }
    }
  }

  for (const room of rooms) populateRocks(room);

  start.visited = true;
  return { rooms, start, depth, hard: !!hard, name: FLOOR_NAMES[depth - 1] || 'BASEMENT' };
}

// attach a new special room to an already-generated floor in a free cell
// next to `anchor` — used by the devil deal that appears after a boss dies
function attachRoomToFloor(floor, anchor, kind) {
  const occupied = new Set(floor.rooms.map(r => r.gx + ',' + r.gy));
  const options = DIRS.filter(d => !occupied.has((anchor.gx + d.dx) + ',' + (anchor.gy + d.dy)));
  if (!options.length) return null;
  const d = pick(options);
  const room = makeRoom(anchor.gx + d.dx, anchor.gy + d.dy, kind);
  floor.rooms.push(room);
  linkRooms(anchor, room);
  return room;
}

// re-run mapping-item reveals against the current floor; called on floor
// entry and the moment a mapping item is picked up
function revealFloorMap() {
  if (typeof G === 'undefined' || !G.floor || !G.player) return;
  const p = G.player;
  const SPECIAL = { boss: 1, treasure: 1, shop: 1, curse: 1, challenge: 1, sacrifice: 1 };
  for (const r of G.floor.rooms) {
    if (p.treasureMap && r.kind !== 'secret') r.seen = true;
    if (p.compass && SPECIAL[r.kind]) r.seen = true;
    if (p.blueMap && r.kind === 'secret') r.seen = true;
  }
}

// ============ minimap ============

// what's still lying around in a cleared, visited room — Isaac marks these so
// the map doubles as a to-do list. Priority: item > chest > battery > bomb > heart > coin.
function roomLeftoverGlyph(r) {
  if (r.pedestals.some(pd => !pd.taken && (pd.def || pd.pendingRandom || pd.pendingActive))) return 'item';
  const kinds = new Set(r.pickups.filter(pk => !pk.taken).map(pk => pk.kind));
  for (const k of ['chest', 'battery', 'bomb', 'heart', 'halfheart', 'soulheart', 'coin']) {
    if (kinds.has(k)) return (k === 'halfheart' || k === 'soulheart') ? 'heart' : k;
  }
  return null;
}

// one room's glyph, drawn centered at (cx, cy). Special-room icons override
// leftover icons which override the start marker — same precedence as Isaac.
function drawRoomGlyph(g, r, cx, cy, s) {
  g.save();
  g.translate(cx, cy);
  g.scale(s, s);
  g.lineWidth = 1.4;
  g.strokeStyle = '#17110c';
  const text = (t, col, size) => {
    g.fillStyle = col;
    g.font = 'bold ' + size + 'px Trebuchet MS';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, 0, 0.5);
  };
  const skull = (col) => {
    g.fillStyle = col;
    g.beginPath(); g.arc(0, -1, 4.4, 0, TAU); g.fill();
    g.fillRect(-2.6, 1.5, 5.2, 3);
    g.fillStyle = '#17110c';
    g.beginPath(); g.arc(-1.8, -1.4, 1.1, 0, TAU); g.arc(1.8, -1.4, 1.1, 0, TAU); g.fill();
  };
  if (r.trapdoor) {
    // way down: dark hatch + chevron
    g.fillStyle = '#141009';
    g.beginPath(); g.ellipse(0, 0, 5.5, 4.2, 0, 0, TAU); g.fill();
    g.strokeStyle = '#d8ccb0'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-2.6, -1.2); g.lineTo(0, 1.6); g.lineTo(2.6, -1.2); g.stroke();
  } else if (r.kind === 'boss') {
    skull('#a3271b');
  } else if (r.kind === 'treasure') {
    g.fillStyle = '#d9b53a';
    g.fillRect(-3.5, -3.5, 7, 7);
    g.strokeRect(-3.5, -3.5, 7, 7);
  } else if (r.kind === 'shop') {
    g.fillStyle = '#e7b93c';
    g.beginPath(); g.arc(0, 0, 4.5, 0, TAU); g.fill();
    g.strokeStyle = '#9c7418'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(0, 0, 2.5, 0, TAU); g.stroke();
  } else if (r.kind === 'secret') {
    text('?', '#cfc4a8', 11);
  } else if (r.kind === 'curse') {
    // horned devil face
    g.fillStyle = '#8e2430';
    g.beginPath(); g.arc(0, 0.5, 4, 0, TAU); g.fill();
    g.beginPath();
    g.moveTo(-3.2, -1.5); g.lineTo(-4.6, -5); g.lineTo(-1.6, -3.2);
    g.moveTo(3.2, -1.5); g.lineTo(4.6, -5); g.lineTo(1.6, -3.2);
    g.fill();
    g.fillStyle = '#f2d9a0';
    g.beginPath(); g.arc(-1.5, 0, 0.8, 0, TAU); g.arc(1.5, 0, 0.8, 0, TAU); g.fill();
  } else if (r.kind === 'challenge') {
    // little sword, point down
    g.strokeStyle = '#d8d2c4'; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(0, -5); g.lineTo(0, 3.5); g.stroke();
    g.beginPath(); g.moveTo(-3, 1); g.lineTo(3, 1); g.stroke();
    g.strokeStyle = '#8a7454';
    g.beginPath(); g.moveTo(0, 3.5); g.lineTo(0, 5.5); g.stroke();
  } else if (r.kind === 'sacrifice') {
    // three spikes with a blood drop hovering above
    g.fillStyle = '#b8ab92';
    g.beginPath();
    for (const sx of [-4, 0, 4]) {
      g.moveTo(sx - 2, 5); g.lineTo(sx, -1); g.lineTo(sx + 2, 5);
    }
    g.closePath(); g.fill();
    g.fillStyle = '#a3271b';
    g.beginPath(); g.arc(0, -4.5, 2.2, 0, TAU); g.fill();
  } else if (r.kind === 'devil') {
    // black goat head with red eyes
    g.fillStyle = '#1c1210';
    g.beginPath(); g.arc(0, 0.5, 4.2, 0, TAU); g.fill();
    g.beginPath();
    g.moveTo(-3.4, -1.5); g.lineTo(-5, -5.5); g.lineTo(-1.6, -3.4);
    g.moveTo(3.4, -1.5); g.lineTo(5, -5.5); g.lineTo(1.6, -3.4);
    g.fill();
    g.fillStyle = '#e8452f';
    g.beginPath(); g.arc(-1.6, 0, 0.9, 0, TAU); g.arc(1.6, 0, 0.9, 0, TAU); g.fill();
  } else if (r.kind === 'miniboss' && r.visited) {
    skull('#8b8375');
  } else {
    const lo = r.visited ? roomLeftoverGlyph(r) : null;
    if (lo === 'item') {
      g.fillStyle = '#f4d03f';
      traceStar(g, 0, 0, 5);
      g.fill(); g.stroke();
    } else if (lo === 'chest') {
      g.fillStyle = '#8a5a2b';
      g.fillRect(-4, -2.5, 8, 5.5);
      g.strokeRect(-4, -2.5, 8, 5.5);
      g.fillStyle = '#e7b93c';
      g.fillRect(-1, -2, 2, 2.4);
    } else if (lo === 'battery') {
      g.fillStyle = '#e7c93c';
      g.fillRect(-2.2, -3, 4.4, 7);
      g.strokeRect(-2.2, -3, 4.4, 7);
      g.fillStyle = '#9c7418';
      g.fillRect(-1.1, -4.2, 2.2, 1.4);
    } else if (lo === 'bomb') {
      g.fillStyle = '#232019';
      g.beginPath(); g.arc(0, 0.8, 3.6, 0, TAU); g.fill(); g.stroke();
      g.strokeStyle = '#c9a437'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(1, -2.2); g.quadraticCurveTo(2.8, -4.4, 1.4, -5.4); g.stroke();
    } else if (lo === 'heart') {
      drawHeartShape(g, 0, 0.5, 6.5, '#c9231a', null);
    } else if (lo === 'coin') {
      g.fillStyle = '#e7b93c';
      g.beginPath(); g.arc(0, 0, 3.2, 0, TAU); g.fill(); g.stroke();
    } else if (r.kind === 'start') {
      // spawn marker: a faint little house
      g.strokeStyle = '#8b8375'; g.lineWidth = 1.4;
      g.strokeRect(-3, -0.5, 6, 4);
      g.beginPath(); g.moveTo(-4.2, -0.5); g.lineTo(0, -4.4); g.lineTo(4.2, -0.5); g.stroke();
    }
  }
  g.restore();
}

function minimapRoomFill(r, current) {
  let fill = '#5a5147';
  if (r.visited) fill = '#b8ab92';
  if (r === current) fill = '#efe6d2';
  return fill;
}

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
    g.fillStyle = minimapRoomFill(r, current);
    g.fillRect(x, y, cell, cell);
    drawRoomGlyph(g, r, x + cell / 2, y + cell / 2, 1);
  }
  // Tab hint under the map
  g.font = '11px Trebuchet MS';
  g.textAlign = 'center';
  g.fillStyle = 'rgba(216,204,176,0.4)';
  g.fillText('Tab 全图', ox, oy + (mapH / 2) * (cell + gap) + 16);
  g.restore();
}

// the held-Tab overlay: every known room of the floor at once
function drawFullMap(g, floor, current) {
  const known = floor.rooms.filter(r => r.visited || r.seen);
  if (!known.length) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const r of known) {
    minX = Math.min(minX, r.gx); maxX = Math.max(maxX, r.gx);
    minY = Math.min(minY, r.gy); maxY = Math.max(maxY, r.gy);
  }
  const cell = 30, gap = 5;
  const gw = (maxX - minX + 1) * (cell + gap) - gap;
  const gh = (maxY - minY + 1) * (cell + gap) - gap;
  const px = W / 2 - gw / 2, py = H / 2 - gh / 2 + 10;
  g.save();
  g.fillStyle = 'rgba(6,4,3,0.82)';
  g.fillRect(0, 0, W, H);
  g.textAlign = 'center';
  g.font = 'bold 24px Georgia';
  g.fillStyle = '#e8dcc0';
  g.fillText('本 层 地 图', W / 2, py - 46);
  g.font = '13px Trebuchet MS';
  g.fillStyle = 'rgba(216,204,176,0.55)';
  g.fillText('松开 Tab 继续', W / 2, py + gh + 34);
  for (const r of known) {
    const x = px + (r.gx - minX) * (cell + gap);
    const y = py + (r.gy - minY) * (cell + gap);
    g.fillStyle = minimapRoomFill(r, current);
    g.fillRect(x, y, cell, cell);
    if (r === current) {
      g.strokeStyle = 'rgba(244,208,63,' + (0.55 + 0.45 * Math.sin(performance.now() / 180)) + ')';
      g.lineWidth = 2.5;
      g.strokeRect(x - 2, y - 2, cell + 4, cell + 4);
    }
    drawRoomGlyph(g, r, x + cell / 2, y + cell / 2, 1.6);
  }
  g.restore();
}
