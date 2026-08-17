'use strict';
// ============ main game ============
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const FLOOR_COUNT = 12;
const FLOOR_NAMES = [
  'BASEMENT I', 'BASEMENT II', 'CAVES I', 'CAVES II',
  'DEPTHS I', 'DEPTHS II', 'WOMB I', 'WOMB II',
  'SHEOL', 'CATHEDRAL', 'THE CHEST', 'DARK ROOM',
];

const G = {
  state: 'menu',          // menu | play | dead | win
  paused: false,
  pauseAnim: 0,
  pauseStart: 0,
  player: null,
  floor: null,
  room: null,
  enemies: [],
  tears: [],
  eshots: [],
  beams: [],
  lasers: [],             // sustained enemy lasers (Vis / boss sweeps)
  orbits: [],
  familiars: [],
  particles: [],
  liveBombs: [],          // placed bombs ticking down in the current room
  mapOverlay: false,      // hold Tab: full floor map
  shake: 0,
  dev: false,             // developer mode: item stepping + immunity
  floorNum: 1,
  stats: { kills: 0, items: 0, startTime: 0, time: 0 },
  toast: null,            // {title, desc, t}
  floorIntro: null,       // {name, num, t, max} — banner shown entering a floor
  fadeT: 0,
  menuAnim: 0,
};

// ---------------- input ----------------
const keys = {};
const fireStack = [];    // latest-pressed arrow wins
const FIRE_DIRS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const touch = { moveX: 0, moveY: 0, fire: null };

window.addEventListener('keydown', e => {
  // suppress browser defaults before the repeat early-return: holding Tab
  // fires auto-repeat keydowns, and any unprevented one moves focus into
  // the browser UI (URL bar); repeated Space/arrows would scroll the page
  if (e.code === 'Tab' || e.code === 'Space' || FIRE_DIRS[e.code]) e.preventDefault();
  if (e.repeat) return;
  SFX.unlock();
  keys[e.code] = true;
  if (FIRE_DIRS[e.code]) {
    if (!fireStack.includes(e.code)) fireStack.push(e.code);
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    togglePause();
    return;
  }
  if (e.code === 'Backquote') { e.preventDefault(); toggleDev(); return; }
  if (G.dev && (e.code === 'BracketRight' || e.code === 'BracketLeft')) {
    e.preventDefault();
    devStepItem(e.code === 'BracketRight' ? 1 : -1);
    return;
  }
  if (e.code === 'Tab') {
    e.preventDefault();
    if (G.state === 'play' && !G.paused) G.mapOverlay = true;
    return;
  }
  if (e.code === 'KeyE' && G.state === 'play' && !G.paused) {
    e.preventDefault();
    placeBomb();
    return;
  }
  if (e.code === 'Space' && G.state === 'play' && !G.paused) {
    e.preventDefault();
    useActiveItem();
    return;
  }
  if ((e.code === 'Enter' || e.code === 'Space') && G.state !== 'play') confirmScreen();
  else if ((e.code === 'Enter' || e.code === 'Space') && G.paused) setPaused(false);
});
window.addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Tab') { e.preventDefault(); G.mapOverlay = false; }
  const i = fireStack.indexOf(e.code);
  if (i >= 0) fireStack.splice(i, 1);
});
// keep keyboard focus anchored on the canvas: even if a focus-moving key
// ever slipped past preventDefault, the walk starts inside the page instead
// of jumping straight to the browser UI
canvas.setAttribute('tabindex', '-1');
canvas.style.outline = 'none';
canvas.focus();
window.addEventListener('pointerdown', () => canvas.focus());
canvas.addEventListener('pointerdown', () => {
  SFX.unlock();
  if (G.paused) { setPaused(false); return; }
  if (G.state !== 'play') confirmScreen();
});

function confirmScreen() {
  if (G.state === 'menu' || G.state === 'dead' || G.state === 'win') startRun();
}

// ---------------- dev mode ----------------
// ` toggles it. [ / ] walk the whole item catalogue; every step rebuilds the
// player from base stats so each item is tested on its own instead of piling
// up. Dev mode also makes the player immune, so a test run can't be cut short.
// Press P to read the full stat sheet the item produced.
let devIdx = -1;
function toggleDev() {
  G.dev = !G.dev;
  G.toast = { title: G.dev ? '开发者模式 开' : '开发者模式 关',
    desc: G.dev ? '[ / ] 逐个试道具　·　无敌　·　P 看面板' : '恢复正常游戏', t: 2.4 };
  SFX.item();
}
function devStepItem(step) {
  const p = G.player;
  devIdx = (devIdx + step + ITEM_DEFS.length) % ITEM_DEFS.length;
  const def = ITEM_DEFS[devIdx];
  Object.assign(p, makePlayer(), { x: p.x, y: p.y });   // wipe previous item, keep position
  def.apply(p);
  clampPlayerStats(p);
  if (p.flight) spawnFeathers(G, p.x, p.y);
  p.itemsTaken.push(def.id);
  G.toast = { title: (devIdx + 1) + '/' + ITEM_DEFS.length + '　' + def.name, desc: def.desc, t: 2.6 };
  SFX.item();
}

// ---------------- pause ----------------
// Manual toggle with P/Esc; auto-pause whenever the tab/window loses focus so
// the run never keeps ticking off-screen. Auto-pause never auto-resumes —
// the player decides when to jump back in.
function setPaused(on) {
  if (G.state !== 'play' || G.paused === on) return;
  G.paused = on;
  if (on) {
    G.pauseStart = performance.now();
    releaseInput();
    SFX.pause(true);
  } else {
    // don't let paused wall-clock time count toward the run timer
    G.stats.startTime += performance.now() - G.pauseStart;
    SFX.pause(false);
  }
}
function togglePause() { setPaused(!G.paused); }

// drop every held key/touch so the player doesn't drift after refocusing
function releaseInput() {
  for (const k in keys) keys[k] = false;
  fireStack.length = 0;
  touch.moveX = 0; touch.moveY = 0; touch.fire = null;
  G.mapOverlay = false;
}

window.addEventListener('blur', () => setPaused(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
window.addEventListener('pagehide', () => setPaused(true));

// ---------------- bombs ----------------
const BOMB_FUSE = 1.6, BOMB_RADIUS = 95, BOMB_DAMAGE = 26;

function placeBomb() {
  const p = G.player;
  if (p.bombs <= 0) {
    G.toast = { title: '没有炸弹', desc: '击杀敌人或去商店购买炸弹', t: 1.2 };
    return;
  }
  p.bombs--;
  G.liveBombs.push({ x: p.x, y: p.y + 4, t: BOMB_FUSE, maxT: BOMB_FUSE, anim: rand(10) });
  SFX.thud();
}

function updateBombs(dt) {
  for (const b of G.liveBombs) {
    b.anim += dt;
    b.t -= dt;
    if (b.t <= 0) bombExplode(b);
  }
  G.liveBombs = G.liveBombs.filter(b => b.t > 0);
}

function bombExplode(b) {
  const room = G.room;
  // hurts enemies and the careless bomber alike
  explodeAt(G, b.x, b.y, BOMB_RADIUS, BOMB_DAMAGE, true);
  G.shake = Math.max(G.shake, 10);
  // clear rocks caught in the blast
  const before = room.rocks.length;
  room.rocks = room.rocks.filter(rk => {
    const t = tileRect(rk.cx, rk.cy);
    return dist(b.x, b.y, t.x + TILE / 2, t.y + TILE / 2) > BOMB_RADIUS - 5;
  });
  if (room.rocks.length < before) {
    for (let i = 0; i < 8; i++) {
      const a = rand(TAU), s = rand(40, 140);
      G.particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
        life: rand(0.3, 0.6), maxLife: 0.6, r: rand(2, 4.5), color: '#8b8375', grav: 500 });
    }
  }
  // crack open a hidden wall to the secret room
  if (room.hiddenSides) {
    for (const side in room.hiddenSides) {
      const dp = DOOR_POS[side];
      if (dist(b.x, b.y, dp.x, dp.y) > BOMB_RADIUS + 20) continue;
      const other = room.doors[side];
      delete room.hiddenSides[side];
      if (other.hiddenSides) delete other.hiddenSides[OPP[side]];
      other.seen = true;
      G.toast = { title: '墙裂开了!', desc: other.kind === 'secret' ? '发现了秘密房间!' : '发现了一条暗道!', t: 2.2 };
      SFX.doorOpen();
    }
  }
}

// ---------------- active item (spacebar) ----------------
function useActiveItem() {
  const p = G.player;
  if (!p.active) return;
  const a = p.active;
  if (a.charge < a.def.cost) {
    G.toast = { title: '充能不足', desc: '清理房间或拾取电池来充能', t: 1.2 };
    return;
  }
  a.charge = 0;
  G.toast = { title: a.def.name, desc: a.def.desc, t: 1.4 };
  a.def.use(G);
}


// ---------------- touch controls ----------------
const touchUI = document.getElementById('touch-ui');
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  touchUI.classList.remove('hidden');
}
(function setupTouch() {
  const zone = document.getElementById('stick-zone');
  const base = document.getElementById('stick-base');
  const knob = document.getElementById('stick-knob');
  let stickId = null, cx = 0, cy = 0;
  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    stickId = t.identifier;
    cx = t.clientX; cy = t.clientY;
    base.style.left = (cx - 60 - zone.getBoundingClientRect().left) + 'px';
    base.style.top = (cy - 60 - zone.getBoundingClientRect().top) + 'px';
    base.style.bottom = 'auto';
  }, { passive: false });
  zone.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const d = Math.hypot(dx, dy);
      const max = 50;
      if (d > max) { dx *= max / d; dy *= max / d; }
      knob.style.left = (35 + dx) + 'px';
      knob.style.top = (35 + dy) + 'px';
      touch.moveX = dx / max; touch.moveY = dy / max;
    }
  }, { passive: false });
  const endStick = e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      stickId = null;
      touch.moveX = 0; touch.moveY = 0;
      knob.style.left = '35px'; knob.style.top = '35px';
    }
  };
  zone.addEventListener('touchend', endStick);
  zone.addEventListener('touchcancel', endStick);

  const dirVec = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  document.querySelectorAll('.fire-btn').forEach(btn => {
    const d = btn.dataset.dir;
    btn.addEventListener('touchstart', e => {
      e.preventDefault();
      if (G.paused) { setPaused(false); return; }
      touch.fire = dirVec[d];
      if (G.state !== 'play') confirmScreen();
    }, { passive: false });
    btn.addEventListener('touchend', e => { e.preventDefault(); if (touch.fire === dirVec[d]) touch.fire = null; }, { passive: false });
  });
})();

// ---------------- run / floor / room flow ----------------
function startRun() {
  G.player = makePlayer();
  G.floorNum = 1;
  G.paused = false;
  G.stats = { kills: 0, items: 0, startTime: performance.now(), time: 0 };
  G.toast = null;
  loadFloor();
  G.state = 'play';
  SFX.start();
}

function loadFloor() {
  applyFloorTheme(G.floorNum);
  G.floor = generateFloor(G.floorNum);
  revealFloorMap();   // mapping items keep working on every new floor
  // brief location card: floor name + how deep into the run you are
  G.floorIntro = { name: FLOOR_NAMES[G.floorNum - 1] || 'BASEMENT', num: G.floorNum, t: 3.0, max: 3.0 };
  enterRoom(G.floor.start, null);
}

function enterRoom(room, fromSide) {
  if (fromSide) SFX.door();
  G.room = room;
  G.tears = [];
  G.eshots = [];
  G.beams = [];
  G.lasers = [];
  G.particles = [];
  G.enemies = [];
  G.liveBombs = [];
  // Holy Mantle: shield recharges on every room change
  if (G.player.shieldMax > 0) G.player.shieldUp = true;
  room.visited = true;
  for (const side in room.doors) {
    if (room.hiddenSides && room.hiddenSides[side]) continue;  // secret walls stay secret
    room.doors[side].seen = true;
  }
  if (!room._base) buildRoomBase(room);

  const p = G.player;
  if (fromSide === 'N') { p.x = W / 2; p.y = FLOOR_Y + 40; }
  else if (fromSide === 'S') { p.x = W / 2; p.y = FLOOR_Y + FLOOR_H - 40; }
  else if (fromSide === 'W') { p.x = FLOOR_X + 40; p.y = H / 2; }
  else if (fromSide === 'E') { p.x = FLOOR_X + FLOOR_W - 40; p.y = H / 2; }
  else { p.x = W / 2; p.y = H / 2 + 60; }
  p.vx = 0; p.vy = 0;
  // keep the trinket entourage on top of the player after a room change
  for (const o of G.orbits) { o.x = p.x; o.y = p.y; }
  for (const f of G.familiars) { f.x = p.x; f.y = p.y; }

  // shop: stock the shelves on first visit (excludes items already taken)
  if (room.kind === 'shop' && !room.shopStocked) stockShop(room, G.floorNum);

  if (!room.cleared && !room.enemiesSpawned) {
    spawnRoomEnemies(room);
    room.enemiesSpawned = true;
  }
  // resolve pending random pedestal items
  resolvePedestals(room, G.player);
}

// enemy mix per chapter — deeper floors trade fodder for ranged pressure,
// lasers, armor and death-bombs
function roomEnemyPool(depth) {
  if (depth <= 2) return ['gaper', 'gaper', 'fly', 'hopper'];
  if (depth <= 4) return ['gaper', 'fly', 'fly', 'hopper', 'spitter', 'boomfly'];
  if (depth <= 6) return ['gaper', 'fly', 'hopper', 'spitter', 'sentry', 'globin', 'boomfly'];
  if (depth <= 8) return ['gaper', 'hopper', 'spitter', 'sentry', 'globin', 'knight', 'vis'];
  if (depth <= 10) return ['gaper', 'spitter', 'sentry', 'hopper', 'knight', 'vis', 'boomfly'];
  return ['spitter', 'sentry', 'globin', 'knight', 'vis', 'boomfly', 'sentry'];
}

function spawnRoomEnemies(room) {
  const depth = G.floorNum;
  if (room.kind === 'boss') {
    const def = bossDefForFloor(depth);
    G.enemies.push(makeBoss(def, W / 2, H / 2 - 40));
    room.bossDef = def;
    return;
  }
  // mini-boss: an earlier floor's boss at reduced hp, ambushing a normal room
  if (room.kind === 'miniboss') {
    const def = bossDefForFloor(Math.max(1, depth - 2));
    const b = makeBoss(def, W / 2, H / 2 - 40);
    b.miniboss = true;
    b.hp *= 0.5;
    b.maxHpRef = b.hp;
    b.name = '小 ' + def.name;
    G.enemies.push(b);
    room.bossDef = def;
    return;
  }
  // exponential-ish pressure curve: room population compounds with depth;
  // the shopkeeper only hires a small guard detail
  const n = room.kind === 'shop'
    ? Math.min(5, randi(2, 3) + Math.floor(depth / 5))
    : Math.min(10, randi(3, 5) + Math.floor(Math.pow(depth, 1.35) / 3));
  const types = roomEnemyPool(depth);
  const wares = room.shopItems || [];
  for (let i = 0; i < n; i++) {
    let x, y, tries = 0;
    do {
      x = rand(FLOOR_X + 60, FLOOR_X + FLOOR_W - 60);
      y = rand(FLOOR_Y + 60, FLOOR_Y + FLOOR_H - 60);
      tries++;
    } while (tries < 30 && (dist(x, y, G.player.x, G.player.y) < 190 || pointHitsRock(room, x, y) ||
      wares.some(w => dist(x, y, w.x, w.y) < 80)));
    G.enemies.push(makeEnemy(pick(types), x, y, depth));
  }
}

// one wave of a challenge room: a burst of enemies teleporting in around the walls
function spawnChallengeWave(room) {
  const depth = G.floorNum;
  const n = Math.min(8, randi(3, 4) + Math.floor(depth / 3));
  const types = roomEnemyPool(depth);
  for (let i = 0; i < n; i++) {
    let x, y, tries = 0;
    do {
      x = rand(FLOOR_X + 60, FLOOR_X + FLOOR_W - 60);
      y = rand(FLOOR_Y + 60, FLOOR_Y + FLOOR_H - 60);
      tries++;
    } while (tries < 30 && (dist(x, y, G.player.x, G.player.y) < 170 || pointHitsRock(room, x, y)));
    G.enemies.push(makeEnemy(pick(types), x, y, depth));
  }
}

function onRoomCleared(room) {
  room.cleared = true;
  G.shake = Math.max(G.shake, 4);
  SFX.doorOpen();
  // every cleared fight charges the spacebar item by one bar
  addActiveCharge(G.player, 1);
  // room clear reward, Isaac style
  const roll = Math.random();
  const cx = clamp(G.player.x, FLOOR_X + 60, FLOOR_X + FLOOR_W - 60);
  const cy = clamp(G.player.y, FLOOR_Y + 60, FLOOR_Y + FLOOR_H - 60);
  if (roll < 0.12) room.pickups.push(makePickup('chest', W / 2, H / 2));
  else if (roll < 0.3) room.pickups.push(makePickup('coin', cx, cy - 50));
  else if (roll < 0.42) room.pickups.push(makePickup('halfheart', cx, cy - 50));
  else if (roll < 0.5) room.pickups.push(makePickup('bomb', cx, cy - 50));
  else if (roll < 0.56) room.pickups.push(makePickup('battery', cx, cy - 50));
}

function onBossKilled(Gm, boss) {
  const room = Gm.room;
  // a dead boss takes its sweeping lasers with it
  Gm.lasers = Gm.lasers.filter(l => l.src !== boss);
  // Dark Room: killing the floor boss summons the true final boss instead of
  // ending the run — that second fight is boss #13.
  if (Gm.floorNum >= FLOOR_COUNT && boss && !boss.def.final) {
    Gm.shake = 20;
    Gm.toast = { title: FINAL_BOSS_DEF.name, desc: '最终之影现身了!', t: 3 };
    Gm.enemies.push(makeBoss(FINAL_BOSS_DEF, W / 2, H / 2 - 40));
    room.bossDef = FINAL_BOSS_DEF;
    SFX.bossDie();
    return;
  }
  room.bossKilled = true;
  if (Gm.floorNum >= FLOOR_COUNT) {
    Gm.stats.time = (performance.now() - Gm.stats.startTime) / 1000;
    Gm.state = 'win';
    SFX.win();
  } else {
    room.trapdoor = { x: W / 2, y: H / 2 };
    // reward pedestal next to trapdoor
    spawnItemPedestal(room, W / 2 + 90, H / 2);
    resolvePedestals(room, Gm.player);
  }
}

function onPlayerDeath(Gm) {
  Gm.stats.time = (performance.now() - Gm.stats.startTime) / 1000;
  Gm.state = 'dead';
  Gm.shake = 14;
  SFX.death();
}

function nextFloor() {
  G.floorNum++;
  loadFloor();
  SFX.stairs();
}

// ---------------- update ----------------
function updatePlay(dt) {
  const p = G.player;
  G.stats.time = (performance.now() - G.stats.startTime) / 1000;

  // --- movement input ---
  let ix = 0, iy = 0;
  if (keys.KeyW) iy -= 1;
  if (keys.KeyS) iy += 1;
  if (keys.KeyA) ix -= 1;
  if (keys.KeyD) ix += 1;
  ix += touch.moveX; iy += touch.moveY;
  const il = Math.hypot(ix, iy);
  if (il > 1) { ix /= il; iy /= il; }
  const damp = 1 - Math.pow(0.0001, dt); // ~fast approach
  p.vx += (ix * p.moveSpeed - p.vx) * Math.min(1, dt * 11);
  p.vy += (iy * p.moveSpeed - p.vy) * Math.min(1, dt * 11);
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  // dodo wings: flying ignores rocks and other floor obstacles
  collideWithRoom(p, G.room, p.flight);
  p.moving = Math.hypot(p.vx, p.vy) > 30;
  if (p.moving) p.walk += dt * 11;
  if (p.flight) p.flap += dt * (p.moving ? 13 : 8);
  p.fireCd -= dt;
  p.invuln = Math.max(0, p.invuln - dt);
  p.hurtFlash = Math.max(0, p.hurtFlash - dt);
  p.blink = Math.max(0, p.blink - dt);
  p.wingGrow = Math.max(0, p.wingGrow - dt * 1.4);

  // --- fire input ---
  let fd = null;
  if (fireStack.length) fd = FIRE_DIRS[fireStack[fireStack.length - 1]];
  if (touch.fire) fd = touch.fire;
  if (fd) { p.aimX = fd[0]; p.aimY = fd[1]; }
  else if (il > 0.1) { p.aimX = ix / (il || 1); p.aimY = iy / (il || 1); }
  // Brimstone: holding the fire key charges the laser; it releases on its own
  // the moment the charge completes. Letting go early bleeds the charge away.
  if (p.laser) {
    if (fd && p.fireCd <= 0) {
      p.laserCharge += dt;
      if (p.laserCharge >= laserChargeTime(p)) {
        p.laserCharge = 0;
        fireBrimstone(G, fd[0], fd[1]);
      }
    } else if (p.laserCharge > 0) {
      p.laserCharge = Math.max(0, p.laserCharge - dt * 4);
    }
  } else if (fd && p.fireCd <= 0) {
    spawnPlayerTears(G, fd[0], fd[1]);
  }

  updateTears(G, dt);
  updateEnemies(G, dt);
  updateEnemyShots(G, dt);
  updateBeams(G, dt);
  updateLasers(G, dt);
  updateOrbitals(G, dt);
  updateFamiliars(G, dt);
  updateParticles(G, dt);
  updateBombs(dt);

  // --- pickups ---
  for (const pk of G.room.pickups) {
    pk.anim += dt;
    if (pk.taken) continue;
    // magnet items drag nearby coins/hearts in
    if (p.pickupMagnet > 0) {
      const d = dist(pk.x, pk.y, p.x, p.y);
      if (d < p.pickupMagnet && d > 1) {
        pk.x += (p.x - pk.x) / d * 150 * dt;
        pk.y += (p.y - pk.y) / d * 150 * dt;
      }
    }
    if (dist(pk.x, pk.y, p.x, p.y) < 22 + p.r) {
      if (pk.kind === 'heart') {
        if (p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + 2); pk.taken = true; SFX.heart(); }
      } else if (pk.kind === 'halfheart') {
        if (p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + 1); pk.taken = true; SFX.heart(); }
      } else if (pk.kind === 'coin') {
        p.coins++; pk.taken = true; SFX.coin();
      } else if (pk.kind === 'bomb') {
        p.bombs++; pk.taken = true; SFX.thud();
      } else if (pk.kind === 'battery') {
        // only consumed when it actually charges something
        if (p.active && p.active.charge < p.active.def.cost) {
          addActiveCharge(p, 1);
          pk.taken = true;
          SFX.coin();
        }
      } else if (pk.kind === 'chest') {
        pk.taken = true;
        SFX.chest();
        if (chance(0.6)) spawnItemPedestal(G.room, pk.x, pk.y - 10);
        else {
          G.room.pickups.push(makePickup('coin', pk.x - 24, pk.y));
          G.room.pickups.push(makePickup(chance(0.5) ? 'heart' : 'coin', pk.x + 24, pk.y));
        }
        resolvePedestals(G.room, p);
      }
    }
  }
  G.room.pickups = G.room.pickups.filter(pk => !pk.taken);

  // --- item pedestals ---
  for (const ped of G.room.pedestals) {
    ped.anim += dt;
    ped.swapT = Math.max(0, (ped.swapT || 0) - dt);
    if (ped.taken || !ped.def || ped.swapT > 0) continue;
    if (dist(ped.x, ped.y, p.x, p.y) < 26 + p.r) {
      if (ped.def.active) {
        // spacebar item: swap with whatever is currently held
        const old = equipActive(p, ped.def);
        G.stats.items++;
        G.toast = { title: ped.def.name, desc: ped.def.desc + '　(空格使用)', t: 2.6 };
        SFX.item();
        if (old) { ped.def = old; ped.swapT = 1.2; }
        else ped.taken = true;
      } else {
        ped.taken = true;
        const hadFlight = p.flight;
        ped.def.apply(p);
        clampPlayerStats(p);
        p.itemsTaken.push(ped.def.id);
        G.stats.items++;
        G.toast = { title: ped.def.name, desc: ped.def.desc, t: 2.6 };
        SFX.item();
        // flight pickup flourish: feathers burst out as the wings sprout
        if (!hadFlight && p.flight) spawnFeathers(G, p.x, p.y);
      }
      // challenge room: grabbing the prize slams the doors and starts the waves
      if (G.room.kind === 'challenge' && !G.room.challengeStarted) {
        G.room.challengeStarted = true;
        G.room.cleared = false;
        G.room.enemiesSpawned = true;
        G.room.challengeWaves = 1;   // one more wave after this first one
        spawnChallengeWave(G.room);
        G.toast = { title: '挑战开始!', desc: '击退所有来袭的敌人!', t: 2.2 };
        G.shake = Math.max(G.shake, 6);
        SFX.door();
      }
    }
  }

  // --- shop wares ---
  // walking into a ware buys it instantly when the coin purse covers the
  // price; otherwise a short "not enough" toast (throttled per ware)
  if (G.room.shopItems) {
    for (const w of G.room.shopItems) {
      w.anim += dt;
      w.denyT = Math.max(0, w.denyT - dt);
      w.near = false;
      if (w.taken) continue;
      const d = dist(w.x, w.y, p.x, p.y);
      w.near = d < 90;
      if (d >= 26 + p.r) continue;
      if (p.coins < w.price) {
        if (w.denyT <= 0) {
          w.denyT = 1.2;
          G.toast = { title: '金币不足', desc: '还差 ' + (w.price - p.coins) + ' 金币', t: 1.2 };
        }
        continue;
      }
      if (w.kind === 'heart') {
        if (p.hp >= p.maxHp) continue;      // don't waste coins at full health
        p.coins -= w.price;
        p.hp = Math.min(p.maxHp, p.hp + 2);
        w.taken = true;
        SFX.coin(); SFX.heart();
      } else if (w.kind === 'bomb') {
        p.coins -= w.price;
        p.bombs += 2;
        w.taken = true;
        SFX.coin(); SFX.thud();
      } else if (w.kind === 'battery') {
        // useless without a chargeable spacebar item — don't take the money
        if (!p.active || p.active.charge >= p.active.def.cost) {
          if (w.denyT <= 0) {
            w.denyT = 1.2;
            G.toast = { title: '暂时用不上', desc: p.active ? '主动道具已充满' : '还没有主动道具', t: 1.2 };
          }
          continue;
        }
        p.coins -= w.price;
        addActiveCharge(p, 1);
        w.taken = true;
        SFX.coin();
      } else if (w.kind === 'active') {
        p.coins -= w.price;
        w.taken = true;
        equipActive(p, w.def);   // shop swaps discard the old item
        G.stats.items++;
        G.toast = { title: w.def.name, desc: w.def.desc + '　(空格使用)', t: 2.6 };
        SFX.coin(); SFX.item();
      } else {
        p.coins -= w.price;
        w.taken = true;
        const hadFlight = p.flight;
        w.def.apply(p);
        clampPlayerStats(p);
        p.itemsTaken.push(w.def.id);
        G.stats.items++;
        G.toast = { title: w.def.name, desc: w.def.desc, t: 2.6 };
        SFX.coin(); SFX.item();
        if (!hadFlight && p.flight) spawnFeathers(G, p.x, p.y);
      }
    }
  }

  // --- room cleared? ---
  if (!G.room.cleared && G.room.enemiesSpawned && G.enemies.length === 0) {
    if (G.room.challengeWaves > 0) {
      // next challenge wave rolls in instead of opening the doors
      G.room.challengeWaves--;
      spawnChallengeWave(G.room);
      G.toast = { title: '下一波!', desc: '守住!', t: 1.4 };
      SFX.door();
    } else {
      onRoomCleared(G.room);
    }
  }

  // --- trapdoor to next floor ---
  if (G.room.trapdoor && dist(G.room.trapdoor.x, G.room.trapdoor.y, p.x, p.y) < 26) {
    nextFloor();
    return;
  }

  // --- door transitions (multi-room floors) ---
  if (G.room.cleared) {
    for (const side in G.room.doors) {
      if (G.room.hiddenSides && G.room.hiddenSides[side]) continue;  // unbombed secret wall
      const dp = DOOR_POS[side];
      if (dist(p.x, p.y, dp.x, dp.y) < 30) {
        const next = G.room.doors[side];
        const opposite = { N: 'S', S: 'N', W: 'E', E: 'W' }[side];
        // curse room doors are lined with spikes — half a heart to cross,
        // unless dodo can fly over them
        const spiked = (G.room.kind === 'curse' || next.kind === 'curse') && !p.flight;
        enterRoom(next, opposite);
        if (spiked) hurtPlayer(G, 1, DOOR_POS[opposite].x, DOOR_POS[opposite].y);
        return;
      }
    }
  }

  if (G.toast) { G.toast.t -= dt; if (G.toast.t <= 0) G.toast = null; }
  if (G.floorIntro) { G.floorIntro.t -= dt; if (G.floorIntro.t <= 0) G.floorIntro = null; }
  G.shake = Math.max(0, G.shake - dt * 40);
}

// ---------------- render ----------------
function render() {
  ctx.save();
  if (G.shake > 0 && !G.paused) ctx.translate(rand(-G.shake, G.shake) * 0.5, rand(-G.shake, G.shake) * 0.5);

  if (G.state === 'menu') { renderMenu(); ctx.restore(); applyPostFX(ctx); return; }

  // room base
  const room = G.room;
  if (!room._base) buildRoomBase(room);
  ctx.drawImage(room._base, 0, 0);

  // blood stains
  for (const s of room.stains) drawStain(ctx, s);

  // trapdoor
  if (room.trapdoor) {
    ctx.save();
    ctx.translate(room.trapdoor.x, room.trapdoor.y);
    ctx.fillStyle = '#0c0906';
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, 0, 26, 18, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#3a2c1c';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, 19, 12, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  // doors (hidden secret walls draw nothing — the wall looks solid)
  const DOOR_KINDS = { boss: 1, treasure: 1, shop: 1, curse: 1, challenge: 1, secret: 1 };
  for (const side of ['N', 'S', 'W', 'E']) {
    const next = room.doors[side];
    if (!next) continue;
    if (room.hiddenSides && room.hiddenSides[side]) continue;
    const doorKind = DOOR_KINDS[next.kind] ? next.kind
      : (room.kind === 'curse' ? 'curse' : 'normal');   // curse spikes hurt on the way out too
    drawDoor(ctx, side, room.cleared ? 'open' : 'closed', doorKind);
  }

  // rocks
  for (const rk of room.rocks) drawRock(ctx, rk.cx, rk.cy, room.seed);

  // pedestals & pickups
  for (const ped of room.pedestals) drawPedestal(ctx, ped);
  for (const pk of room.pickups) drawPickup(ctx, pk);
  if (room.shopItems) for (const w of room.shopItems) drawShopWare(ctx, w, G.player.coins);
  for (const b of G.liveBombs) drawLiveBomb(ctx, b);

  // entities sorted by y for painter's order
  const drawList = [];
  for (const e of G.enemies) drawList.push({ y: e.y, fn: () => drawEnemyByType(e) });
  for (const f of G.familiars) drawList.push({ y: f.y, fn: () => drawFamiliar(ctx, f) });
  const p = G.player;
  if (G.state !== 'dead' || true) drawList.push({
    y: p.y, fn: () => {
      if (p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0 && G.state === 'play') return; // blink
      // facing for the 8-direction wing pose: movement wins, else aim
      const fdx = p.moving ? p.vx : p.aimX, fdy = p.moving ? p.vy : p.aimY;
      drawDodo(ctx, p.x, p.y, {
        walk: p.walk, moving: p.moving, aimX: p.aimX, aimY: p.aimY,
        hurtFlash: p.hurtFlash > 0,
        headColor: p.appearance.headColor, eyeColor: p.appearance.eyeColor,
        hat: p.appearance.hat, big: p.appearance.big, aura: p.appearance.aura,
        blink: p.blink > 0,
        wings: p.flight, wingGrow: p.wingGrow, flap: p.flap,
        dirX: fdx, dirY: fdy,
      });
      // Holy Mantle bubble
      if (p.shieldUp) {
        ctx.save();
        ctx.strokeStyle = 'rgba(180,220,255,' + (0.45 + 0.2 * Math.sin(p.walk * 2)) + ')';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(p.x, p.y - 10, 30, 36, 0, 0, TAU); ctx.stroke();
        ctx.restore();
      }
      // Brimstone charge-up: a blood orb swells at the beak + progress ring
      if (p.laser && p.laserCharge > 0) {
        const k = clamp(p.laserCharge / laserChargeTime(p), 0, 1);
        const ox = p.x + p.aimX * 22, oy = p.y - 10 + p.aimY * 22;
        ctx.save();
        ctx.globalAlpha = 0.45 + 0.55 * k;
        ctx.fillStyle = '#c9231a';
        ctx.beginPath();
        ctx.arc(ox, oy, 3 + 8 * k + Math.sin(performance.now() / 35) * 1.5 * k, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,140,120,' + (0.35 + 0.65 * k) + ')';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(ox, oy, 14, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
        ctx.restore();
      }
    }
  });
  drawList.sort((a, b) => a.y - b.y);
  for (const d of drawList) d.fn();

  // projectiles + particles on top
  for (const t of G.tears) drawTear(ctx, t);
  for (const s of G.eshots) drawEnemyShot(ctx, s);
  for (const b of G.beams) drawBeam(ctx, b);
  for (const l of G.lasers) drawLaser(ctx, l);
  for (const o of G.orbits) drawOrbital(ctx, o);
  for (const pa of G.particles) {
    ctx.globalAlpha = clamp(pa.life / pa.maxLife, 0, 1);
    ctx.fillStyle = pa.color;
    ctx.beginPath(); ctx.arc(pa.x, pa.y, pa.r, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // item info cards float above everything else in the room: pedestals,
  // pickups and shop wares all show name + effect when the player is near
  const tips = [];
  for (const ped of room.pedestals) {
    if (ped.taken || !ped.def) continue;
    if (dist(ped.x, ped.y, p.x, p.y) < 90) {
      tips.push({ name: ped.def.name, desc: ped.def.desc, x: ped.x, y: ped.y });
    }
  }
  for (const pk of room.pickups) {
    if (pk.taken) continue;
    if (dist(pk.x, pk.y, p.x, p.y) < 90) {
      const t = { heart: ['红心', '回复一颗心!'], halfheart: ['半颗心', '回复半颗心!'],
        coin: ['金币', '捡起来存进钱袋!'], chest: ['宝箱', '开启宝箱拿奖励!'],
        bomb: ['炸弹', '按 E 放置 能炸开裂缝的墙!'],
        battery: ['电池', '为主动道具充能一层!'] }[pk.kind];
      if (t) tips.push({ name: t[0], desc: t[1], x: pk.x, y: pk.y });
    }
  }
  if (room.shopItems) {
    for (const w of room.shopItems) {
      if (w.near && !w.taken) {
        tips.push({ name: w.def ? w.def.name : w.name,
          desc: w.def ? w.def.desc : w.desc, price: w.price, x: w.x, y: w.y });
      }
    }
  }
  for (const t of tips) drawItemTooltip(ctx, t, G.player.coins);

  renderHUD();
  if (G.state === 'play' && G.floorIntro) renderFloorIntro();
  ctx.restore();

  if (G.state === 'play' && !G.paused && G.mapOverlay) drawFullMap(ctx, G.floor, G.room);
  if (G.state === 'dead') renderDeath();
  if (G.state === 'win') renderWin();
  if (G.paused) renderPause();
  applyPostFX(ctx);
}

function drawEnemyByType(e) {
  // materialize animation: rises out of the floor, fades in, with a
  // shrinking ring on the ground so the grace window reads clearly
  if (e.spawnT > 0) {
    const k = clamp(1 - e.spawnT / (e.spawnMax || 0.55), 0, 1);
    const groundY = e.y + e.r * 0.95;
    ctx.save();
    ctx.strokeStyle = 'rgba(240,230,210,' + (0.35 + 0.3 * Math.abs(Math.sin(e.anim * 18))) + ')';
    ctx.lineWidth = 3;
    const ringR = e.r * (2.4 - 1.5 * k);
    ctx.beginPath(); ctx.ellipse(e.x, groundY, ringR, ringR * 0.42, 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.2 + 0.8 * k;
    ctx.beginPath(); ctx.rect(e.x - e.r * 3.2, groundY - 420, e.r * 6.4, 420);
    ctx.clip();
    ctx.translate(0, (1 - k) * e.r * 1.8);
    drawEnemyCore(e);
    ctx.restore();
    return;
  }
  drawEnemyCore(e);
}

// Each enemy's art is authored at a fixed reference radius; before drawing we
// scale the whole sprite by (e.r / ref) around its position. Tuning a
// collision radius therefore rescales face and body together — features can
// never drift out of sync with the hitbox.
const ENEMY_REF_R = {
  gaper: 16, fly: 9, spitter: 16, hopper: 13, sentry: 17,
  boomfly: 12, globin: 15, knight: 15, vis: 16,
};
function drawEnemyCore(e) {
  const ref = ENEMY_REF_R[e.type];
  const k = ref ? e.r / ref : 1;
  const scaled = Math.abs(k - 1) > 0.01;
  if (scaled) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(k, k);
    ctx.translate(-e.x, -e.y);
  }
  switch (e.type) {
    case 'gaper': drawGaper(ctx, e); break;
    case 'fly': drawFly(ctx, e); break;
    case 'spitter': drawSpitter(ctx, e); break;
    case 'hopper': drawHopper(ctx, e); break;
    case 'sentry': drawSentry(ctx, e); break;
    case 'boomfly': drawBoomfly(ctx, e); break;
    case 'globin': drawGlobin(ctx, e); break;
    case 'knight': drawKnight(ctx, e); break;
    case 'vis': drawVis(ctx, e); break;
    case 'boss': drawBossByDef(ctx, e); break;
  }
  if (scaled) ctx.restore();
}

function renderHUD() {
  const p = G.player;
  drawHUDHearts(ctx, p.hp, p.maxHp);
  drawMinimap(ctx, G.floor, G.room);
  // coins
  ctx.save();
  ctx.fillStyle = '#e7b93c';
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(34, 60, 8, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#efe6d2';
  ctx.font = 'bold 16px Trebuchet MS';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('× ' + p.coins, 48, 61);
  // bombs
  ctx.fillStyle = '#232019';
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(34, 86, 8, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#c9a437';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(37, 79); ctx.quadraticCurveTo(41, 74, 38, 72); ctx.stroke();
  ctx.fillStyle = '#efe6d2';
  ctx.font = 'bold 16px Trebuchet MS';
  ctx.fillText('× ' + p.bombs, 48, 87);
  // active item slot: icon in a frame, charge pips underneath
  if (p.active) {
    const ax = 34, ay = 130;
    const def = p.active.def;
    const full = p.active.charge >= def.cost;
    ctx.fillStyle = 'rgba(10,8,6,0.55)';
    ctx.strokeStyle = full ? '#f4d03f' : '#5d4c33';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.rect(ax - 22, ay - 22, 44, 44); ctx.fill(); ctx.stroke();
    ctx.save();
    ctx.translate(ax, ay);
    ctx.scale(0.95, 0.95);
    drawItemIcon(ctx, 0, 0, def);
    ctx.restore();
    // pips: one bar per charge level this item needs
    const pw = Math.min(12, (44 - (def.cost - 1) * 3) / def.cost);
    const totalW = def.cost * pw + (def.cost - 1) * 3;
    for (let i = 0; i < def.cost; i++) {
      const bx = ax - totalW / 2 + i * (pw + 3);
      ctx.fillStyle = i < p.active.charge ? '#f4d03f' : '#3a3128';
      ctx.strokeStyle = PAL.outline;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.rect(bx, ay + 27, pw, 7); ctx.fill(); ctx.stroke();
    }
    if (full) {
      ctx.fillStyle = 'rgba(244,208,63,' + (0.55 + 0.35 * Math.sin(performance.now() / 250)) + ')';
      ctx.font = 'bold 12px Trebuchet MS';
      ctx.textAlign = 'center';
      ctx.fillText('空格', ax, ay + 47);
      ctx.textAlign = 'left';
    }
  }
  // floor name
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px Georgia';
  ctx.fillStyle = 'rgba(240,230,210,0.5)';
  ctx.fillText(FLOOR_NAMES[G.floorNum - 1] || 'BASEMENT', W / 2, H - 18);
  if (G.dev) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#7fbf4a';
    ctx.fillText('DEV　' + (devIdx + 1) + '/' + ITEM_DEFS.length + '　[ / ]', W - 18, H - 18);
  }
  ctx.restore();

  // boss hp bar
  const boss = G.enemies.find(e => e.isBoss);
  if (boss) {
    ctx.save();
    const bw = 300, bx = W / 2 - bw / 2, by = H - 44;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 4, by - 4, bw + 8, 18);
    ctx.fillStyle = '#5c0f09';
    ctx.fillRect(bx, by, bw, 10);
    ctx.fillStyle = boss.rage ? '#e8452f' : '#c9231a';
    ctx.fillRect(bx, by, bw * clamp(boss.hp / boss.maxHpRef, 0, 1), 10);
    ctx.strokeStyle = PAL.outline; ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, 10);
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px Georgia';
    ctx.fillStyle = '#efe6d2';
    ctx.strokeStyle = 'rgba(12,8,6,0.85)';
    ctx.lineWidth = 4;
    const label = boss.name + (boss.rage ? '　【狂暴】' : '');
    ctx.strokeText(label, W / 2, by - 12);
    ctx.fillText(label, W / 2, by - 12);
    ctx.restore();
  }

  // item toast
  if (G.toast) {
    ctx.save();
    ctx.globalAlpha = clamp(G.toast.t / 0.4, 0, 1);
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px Georgia';
    ctx.fillStyle = '#f3ecd8';
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 5;
    ctx.strokeText(G.toast.title, W / 2, 96);
    ctx.fillText(G.toast.title, W / 2, 96);
    ctx.font = 'italic 17px Georgia';
    ctx.strokeStyle = 'rgba(23,17,12,0.9)';
    ctx.lineWidth = 4;
    ctx.strokeText(G.toast.desc, W / 2, 122);
    ctx.fillStyle = '#d8ccb0';
    ctx.fillText(G.toast.desc, W / 2, 122);
    ctx.restore();
  }
}

// floor entry banner: big location name over a dark band, fades in and out
function renderFloorIntro() {
  const fi = G.floorIntro;
  const a = clamp(Math.min((fi.max - fi.t) / 0.35, fi.t / 0.6), 0, 1);
  ctx.save();
  ctx.globalAlpha = a;
  const bandY = H / 2 - 92, bandH = 150;
  const grad = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
  grad.addColorStop(0, 'rgba(8,5,3,0)');
  grad.addColorStop(0.25, 'rgba(8,5,3,0.78)');
  grad.addColorStop(0.75, 'rgba(8,5,3,0.78)');
  grad.addColorStop(1, 'rgba(8,5,3,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, bandY, W, bandH);

  ctx.textAlign = 'center';
  ctx.font = 'bold 52px Georgia';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#0f0a07';
  ctx.strokeText(fi.name, W / 2, H / 2 - 14);
  ctx.fillStyle = '#e8dcc0';
  ctx.fillText(fi.name, W / 2, H / 2 - 14);

  ctx.font = 'bold 20px Georgia';
  ctx.fillStyle = 'rgba(216,204,176,0.9)';
  ctx.fillText('第 ' + fi.num + ' 层　/　共 ' + FLOOR_COUNT + ' 层', W / 2, H / 2 + 28);
  ctx.restore();
}

// ---------------- screens ----------------
function renderMenu() {
  G.menuAnim += 1 / 60;
  // dark backdrop
  ctx.fillStyle = '#120d09';
  ctx.fillRect(0, 0, W, H);
  // vignette spot
  const rad = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 480);
  rad.addColorStop(0, 'rgba(200,170,120,0.18)');
  rad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, W, H);

  // title
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8dcc0';
  ctx.strokeStyle = '#000';
  ctx.font = 'bold 30px Georgia';
  ctx.fillText('The Binding of', W / 2, 140);
  ctx.font = 'bold 92px Georgia';
  ctx.lineWidth = 10;
  ctx.strokeText('dodo', W / 2, 232);
  ctx.fillStyle = '#c9231a';
  ctx.fillText('dodo', W / 2, 232);
  ctx.restore();

  // dodo mascot walking in place
  drawDodo(ctx, W / 2, 340, { walk: G.menuAnim * 11, moving: true, aimX: 0, aimY: 0.3 });

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px Georgia';
  ctx.fillStyle = Math.sin(G.menuAnim * 5) > -0.2 ? '#efe6d2' : 'rgba(239,230,210,0.25)';
  ctx.fillText('按 Enter 或 点击屏幕 开始', W / 2, 430);
  ctx.font = '15px Trebuchet MS';
  ctx.fillStyle = 'rgba(220,205,180,0.65)';
  ctx.fillText('WASD 移动　方向键 发射眼泪　E 放炸弹　空格 主动道具　Tab 地图', W / 2, 470);
  ctx.fillText('清空房间开门前进 · 打倒每层 Boss · 炸开秘密房 · 拾取道具变强', W / 2, 494);
  ctx.restore();
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

// End-of-run screens: a page torn from a kid's sketchbook — wobbly crayon
// borders, every glyph hand-jittered (seeds are fixed so nothing shimmers).
function renderStatsPaper(dead) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.74)';
  ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2);
  ctx.rotate(dead ? -0.035 : 0.025);
  const pw = 440, ph = 430;
  // paper with a slightly torn edge
  const rng = mulberry32(dead ? 4210 : 9182);
  ctx.fillStyle = '#efe7d2';
  ctx.strokeStyle = '#1a130b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const edge = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) edge.push([-pw / 2 + (pw * i) / steps, -ph / 2 + (rng() - 0.5) * 5]);
  for (let i = 0; i <= steps; i++) edge.push([pw / 2 + (rng() - 0.5) * 5, -ph / 2 + (ph * i) / steps]);
  for (let i = steps; i >= 0; i--) edge.push([-pw / 2 + (pw * i) / steps, ph / 2 + (rng() - 0.5) * 5]);
  for (let i = steps; i >= 0; i--) edge.push([-pw / 2 + (rng() - 0.5) * 5, -ph / 2 + (ph * i) / steps]);
  ctx.moveTo(edge[0][0], edge[0][1]);
  for (const [ex, ey] of edge) ctx.lineTo(ex, ey);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // crayon double border, like a kid framing their drawing
  const borderCol = dead ? '#b8432e' : '#d8a02a';
  const brng = mulberry32(dead ? 77 : 88);
  const bx = pw / 2 - 22, by = ph / 2 - 22;
  drawCrayonLine(ctx, -bx, -by, bx, -by, brng, borderCol, 3);
  drawCrayonLine(ctx, bx, -by, bx, by, brng, borderCol, 3);
  drawCrayonLine(ctx, bx, by, -bx, by, brng, borderCol, 3);
  drawCrayonLine(ctx, -bx, by, -bx, -by, brng, borderCol, 3);

  // title
  drawCrayonText(ctx, dead ? '你死了' : '通关啦!', 0, -ph / 2 + 72, 52,
    dead ? '#b8432e' : '#c77f21', dead ? 314 : 217, { spacing: 10 });

  // dodo face doodle (dead: X eyes / win: happy)
  ctx.save();
  ctx.translate(0, -62);
  ctx.rotate(0.04);
  ctx.lineCap = 'round';
  ctx.fillStyle = '#f8f4e8';
  ctx.strokeStyle = '#3a332b';
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.ellipse(0, 0, 30, 27, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(2, -26); ctx.lineTo(4, -34); ctx.stroke();
  ctx.fillStyle = '#3a332b';
  ctx.beginPath(); ctx.ellipse(6, -36, 5.5, 3, -0.5, 0, TAU); ctx.fill();
  if (dead) {
    ctx.beginPath();
    ctx.moveTo(-15, -10); ctx.lineTo(-5, 0); ctx.moveTo(-5, -10); ctx.lineTo(-15, 0);
    ctx.moveTo(15, -10); ctx.lineTo(5, 0); ctx.moveTo(5, -10); ctx.lineTo(15, 0);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 12, 6, 0, TAU); ctx.stroke();
    // crayon tear drops falling off the face
    ctx.fillStyle = '#7d9ab5';
    for (const [tx, ty, ts] of [[-24, 16, 1], [26, 22, 0.8], [-32, 34, 0.6]]) {
      ctx.save();
      ctx.translate(tx, ty); ctx.scale(ts, ts);
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.quadraticCurveTo(6, 2, 0, 6); ctx.quadraticCurveTo(-6, 2, 0, -7);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  } else {
    ctx.fillStyle = '#3a332b';
    ctx.beginPath();
    ctx.ellipse(-10, -6, 3.5, 5, 0, 0, TAU);
    ctx.ellipse(10, -6, 3.5, 5, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath(); ctx.arc(0, 6, 10, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    // crayon sun in the paper corner
    ctx.save();
    ctx.translate(pw / 2 - 64, -ph / 2 + 66);
    ctx.strokeStyle = '#d8a02a';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.3;
      ctx.moveTo(Math.cos(a) * 16, Math.sin(a) * 16);
      ctx.lineTo(Math.cos(a) * 23, Math.sin(a) * 23);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // stats in wobbly handwriting
  drawCrayonText(ctx, '打倒了 ' + G.stats.kills + ' 只怪物', 0, 26, 23, '#4a4136', 511, { spacing: 2 });
  drawCrayonText(ctx, '捡到了 ' + G.stats.items + ' 个宝贝', 0, 62, 23, '#4a4136', 622, { spacing: 2 });
  drawCrayonText(ctx, '走了 ' + fmtTime(G.stats.time) + ' 那么久', 0, 98, 23, '#4a4136', 733, { spacing: 2 });

  if (dead) {
    // the small sad line, in teary blue-gray pencil
    drawCrayonText(ctx, '眼泪流干了，也还是没能走出去', 0, 138, 16, '#7b8794', 999, { spacing: 1 });
  }

  const blink = Math.sin(performance.now() / 300) > -0.3;
  drawCrayonText(ctx, '按 Enter 或 点一下 再来一次', 0, ph / 2 - 44, 19,
    dead ? '#8a3a2a' : '#7a6222', 846, { spacing: 1, alpha: blink ? 1 : 0.3 });
  ctx.restore();
}

function renderDeath() { renderStatsPaper(true); }
function renderWin() { renderStatsPaper(false); }

// ---------------- pause overlay ----------------
function renderPause() {
  const p = G.player;
  ctx.save();
  ctx.fillStyle = 'rgba(8,6,4,0.68)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.font = 'bold 58px Georgia';
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#0f0a07';
  ctx.strokeText('暂 停', W / 2, 132);
  ctx.fillStyle = '#e8dcc0';
  ctx.fillText('暂 停', W / 2, 132);

  // stat panel: the six attributes plus current tear mods
  const rows = [
    ['生命', Math.ceil(p.hp / 2) + ' / ' + Math.ceil(p.maxHp / 2) + ' 心'],
    ['攻击力', p.damage.toFixed(1)],
    ['射速', (1 / p.fireDelay).toFixed(2) + ' 发/秒'],
    ['弹速', Math.round(p.shotSpeed)],
    ['射程', Math.round(p.range)],
    ['移速', Math.round(p.moveSpeed)],
  ];
  const px = W / 2 - 190, py = 186, rowH = 30;
  ctx.fillStyle = 'rgba(20,14,10,0.72)';
  ctx.strokeStyle = '#3b2c1d';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.rect(px - 26, py - 34, 432, rows.length * rowH + 96); ctx.fill(); ctx.stroke();

  ctx.font = 'bold 15px Trebuchet MS';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(232,220,192,0.55)';
  ctx.fillText(FLOOR_NAMES[G.floorNum - 1] + '　第 ' + G.floorNum + ' / ' + FLOOR_COUNT + ' 层', px, py - 12);
  rows.forEach(([k, v], i) => {
    const y = py + 18 + i * rowH;
    ctx.fillStyle = 'rgba(216,204,176,0.8)';
    ctx.fillText(k, px, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#efe6d2';
    ctx.fillText(v, px + 380, y);
    ctx.textAlign = 'left';
    ctx.strokeStyle = 'rgba(120,100,72,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, y + 8); ctx.lineTo(px + 380, y + 8); ctx.stroke();
  });

  // tear / body modifiers granted by items
  const mods = [];
  if (p.laser) mods.push('血腥激光');
  if (p.multishot > 1) mods.push(p.multishot + ' 连发');
  // laser runs relabel the converted tear mods so the player sees the payoff
  if (p.homing) mods.push(p.laser ? '光束追踪' : '追踪');
  if (p.piercing) mods.push(p.laser ? '穿透(化为增伤)' : '穿透');
  if (p.bounce) mods.push(p.laser ? '光束反射' : '弹跳');
  if (p.explosive) mods.push(p.laser ? '末端爆炸' : '爆炸');
  if (p.poison) mods.push('中毒');
  if (p.slowOnHit) mods.push('减速');
  if (p.spectral) mods.push(p.laser ? '幽灵(化为增伤)' : '幽灵弹');
  if (p.split > 0) mods.push(p.laser ? '末端分裂' : '落地分裂');
  if (p.tearAura > 0) mods.push(p.laser ? '灼烧光束' : '伤害光环');
  if (p.distGrow > 0) mods.push('远程增伤');
  if (p.distShrink > 0) mods.push('近程增伤');
  if (p.shieldMax > 0) mods.push('神圣护盾');
  if (p.dmgReduce > 0) mods.push('减伤');
  if (p.crit > 0) mods.push('暴击 ' + Math.round(p.crit * 100) + '%');
  if (p.orbitals > 0) mods.push('环绕泪 ×' + p.orbitals);
  if (p.familiars > 0) mods.push('跟随物 ×' + p.familiars);
  if (p.contactDamage > 0) mods.push('接触伤害');
  if (p.vampirism > 0) mods.push('吸血');
  if (p.extraLives > 0) mods.push('复活 ×' + p.extraLives);
  ctx.textAlign = 'center';
  ctx.font = '14px Trebuchet MS';
  ctx.fillStyle = 'rgba(200,186,158,0.75)';
  ctx.fillText(mods.length ? mods.join(' · ') : '尚无特殊效果', W / 2, py + 24 + rows.length * rowH);
  ctx.fillStyle = 'rgba(200,186,158,0.55)';
  ctx.fillText('道具 ' + G.stats.items + ' 件　击杀 ' + G.stats.kills + '　金币 ' + p.coins +
    '　时间 ' + fmtTime(G.stats.time), W / 2, py + 48 + rows.length * rowH);

  // taken item icons
  if (p.itemsTaken.length) {
    const per = 14;
    const shown = p.itemsTaken.slice(-per);
    const startX = W / 2 - (shown.length - 1) * 15;
    shown.forEach((id, i) => {
      const def = ITEM_BY_ID[id];
      if (!def) return;
      ctx.save();
      ctx.translate(startX + i * 30, H - 108);
      ctx.scale(0.78, 0.78);
      drawItemIcon(ctx, 0, 0, def);
      ctx.restore();
    });
  }

  ctx.textAlign = 'center';
  ctx.font = 'bold 19px Georgia';
  ctx.fillStyle = Math.sin(G.pauseAnim * 4) > -0.3 ? '#efe6d2' : 'rgba(239,230,210,0.3)';
  ctx.fillText('按 P 继续　·　切换窗口会自动暂停', W / 2, H - 54);
  ctx.restore();
}

// ---------------- main loop ----------------
let lastT = performance.now();
function loop(t) {
  const dt = Math.min(1 / 30, (t - lastT) / 1000);
  lastT = t;
  if (G.paused) G.pauseAnim += dt;
  else if (G.state === 'play') updatePlay(dt);
  else { updateParticles(G, dt); G.shake = Math.max(0, G.shake - dt * 40); }
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
