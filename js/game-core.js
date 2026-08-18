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
// floors whose boss room ends in a fork: a safe hatch and a spiked one that
// makes the next floor meaner but doubles its treasure
const BRANCH_FLOORS = { 4: true, 8: true };

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
  charIdx: 0,             // menu character selection
  menuDeny: 0,            // flash timer after trying to start a locked character
  menuRot: 0,             // animated ring rotation, in character-index units
  menuRotT: 0,            // rotation target menuRot eases toward
  unlockPanel: false,     // the unlock codex overlay (toggled with I, menu or mid-run)
  unlockPopups: [],       // queued unlock cards popped during a run
  hardFloor: false,       // the current floor was entered through the spiked hatch
  floorDamage: 0,         // damage taken since entering this floor
  bossFightHurt: false,   // damage taken during the current boss fight
  newUnlocks: [],         // unlock defs earned this run, shown on the end screen
  seedStr: '',            // this run's seed, Isaac style (8 chars)
  runSeed: 0,             // numeric form driving floor generation
  pendingSeedStr: null,   // seed typed on the menu, applied to the next run
  floorCurse: null,       // null | 'darkness' | 'lost' | 'unknown'
};

// floor curses: one may strike each floor from floor 2 on, making runs
// differ beyond the layout roll
const FLOOR_CURSES = {
  darkness: { name: '黑暗诅咒', desc: '伸手不见五指' },
  lost:     { name: '迷失诅咒', desc: '地图失效了' },
  unknown:  { name: '未知诅咒', desc: '看不清自己的生命' },
};
G.charIdx = Math.max(0, CHAR_DEFS.findIndex(c => c.id === META.selChar));
G.menuRot = G.menuRotT = G.charIdx;

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
  // I toggles the unlock codex; P stays pause-only so the two never collide.
  // On the menu the codex overlays the title; mid-run it pauses the game
  // underneath, and closing it resumes play.
  if (e.code === 'KeyI' || (e.code === 'Escape' && G.unlockPanel)) {
    e.preventDefault();
    if (G.state === 'menu') {
      G.unlockPanel = !G.unlockPanel;
      SFX.item();
    } else if (G.state === 'play') {
      if (G.unlockPanel) { G.unlockPanel = false; setPaused(false); }
      else { setPaused(true); G.unlockPanel = true; }
      SFX.item();
    }
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    // P while the codex is up closes it and resumes, same as I
    if (G.unlockPanel && G.state === 'play') { G.unlockPanel = false; setPaused(false); return; }
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
  if (G.state === 'menu' && (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'ArrowRight' || e.code === 'KeyD')) {
    menuSelectChar((e.code === 'ArrowLeft' || e.code === 'KeyA') ? -1 : 1);
    return;
  }
  if (G.state === 'menu' && e.code === 'KeyS') {
    // seed entry: same seed -> same floors, same curses, same item rolls
    const v = prompt('输入种子（任意文字都行 留空取消）\n种子局不计入排行榜与解锁');
    G.pendingSeedStr = v && v.trim() ? v.trim().toUpperCase().slice(0, 16) : null;
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
canvas.addEventListener('pointerdown', e => {
  SFX.unlock();
  if (G.paused) {
    // tapping the codex closes it and resumes; otherwise the pause overlay
    // keeps its one clickable region: the changelog doc link
    if (G.unlockPanel) { G.unlockPanel = false; setPaused(false); return; }
    if (pauseDocLinkHit(e)) { window.open(LB_DOC_URL, '_blank'); return; }
    setPaused(false); return;
  }
  if (G.state === 'menu') {
    if (G.unlockPanel) { G.unlockPanel = false; return; }
    const pos = canvasXY(e);
    // the codex line doubles as a tap target so touch players can open it too
    if (menuCodexHit(pos.x, pos.y)) { G.unlockPanel = true; SFX.item(); return; }
    const hit = menuCharHit(pos.x, pos.y);
    if (hit >= 0 && hit !== G.charIdx) {
      menuRotateTo(hit);
      return;
    }
    confirmScreen();
    return;
  }
  if (G.state !== 'play') confirmScreen();
});

function confirmScreen() {
  if (G.state === 'menu' && G.unlockPanel) { G.unlockPanel = false; return; }
  if (G.state === 'menu' && charLocked(CHAR_DEFS[G.charIdx])) {
    G.menuDeny = 1.2;   // flash the unlock condition instead of starting
    SFX.thud();
    return;
  }
  if (G.state === 'menu' || G.state === 'dead' || G.state === 'win') startRun();
}

function menuSelectChar(step) {
  menuRotateTo((G.charIdx + step + CHAR_DEFS.length) % CHAR_DEFS.length);
}

// canvas-space coordinates of a pointer event (the canvas is CSS-scaled)
function canvasXY(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
}

// menu character slots sit on a ring now — see js/menu-unlocks.js

// ---------------- dev mode ----------------
// ` toggles it. [ / ] walk the whole item catalogue; every step rebuilds the
// player from base stats so each item is tested on its own instead of piling
// up. Dev mode also makes the player immune, so a test run can't be cut short.
// Press P to read the full stat sheet the item produced.
let devIdx = -1;
function toggleDev() {
  G.dev = !G.dev;
  // a run touched by dev mode (immunity / free items) never posts to the leaderboard
  if (G.dev && G.state === 'play') G.devTainted = true;
  G.toast = { title: G.dev ? '开发者模式 开' : '开发者模式 关',
    desc: G.dev ? '[ / ] 逐个试道具　·　无敌　·　P 看面板' : '恢复正常游戏', t: 2.4 };
  SFX.item();
}
function devStepItem(step) {
  const p = G.player;
  devIdx = (devIdx + step + ITEM_DEFS.length) % ITEM_DEFS.length;
  const def = ITEM_DEFS[devIdx];
  Object.assign(p, makePlayer(p.charId), { x: p.x, y: p.y });   // wipe previous item, keep position
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
    lbRefresh(false);   // warm up the leaderboard panel (no-op when offline)
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
const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (IS_TOUCH) {
  touchUI.classList.remove('hidden');
  document.body.classList.add('touch');
  // the game is landscape-only on phones: portrait shows a fullscreen rotate
  // hint (CSS-driven) and freezes the run underneath it
  const portraitMq = window.matchMedia('(orientation: portrait)');
  const onFlip = () => { if (portraitMq.matches) setPaused(true); };
  if (portraitMq.addEventListener) portraitMq.addEventListener('change', onFlip);
  else portraitMq.addListener(onFlip);
  onFlip();
  // best effort: fullscreen + landscape lock on the first touch (Android);
  // iOS has no lock API, so there the rotate hint does the guiding
  window.addEventListener('touchend', () => {
    const el = document.documentElement;
    if (el.requestFullscreen && screen.orientation && screen.orientation.lock) {
      el.requestFullscreen()
        .then(() => screen.orientation.lock('landscape'))
        .catch(() => {});
    }
  }, { once: true });
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
      if (G.paused) { G.unlockPanel = false; setPaused(false); return; }
      touch.fire = dirVec[d];
      if (G.state !== 'play') confirmScreen();
    }, { passive: false });
    btn.addEventListener('touchend', e => { e.preventDefault(); if (touch.fire === dirVec[d]) touch.fire = null; }, { passive: false });
  });

  // bomb / active-item buttons: the two keyboard-only actions (E / Space)
  // that used to be unreachable on touch
  const bindAction = (id, fn) => {
    document.getElementById(id).addEventListener('touchstart', e => {
      e.preventDefault();
      SFX.unlock();
      if (G.paused) { G.unlockPanel = false; setPaused(false); return; }
      if (G.state === 'play') fn();
    }, { passive: false });
  };
  bindAction('btn-bomb', placeBomb);
  bindAction('btn-item', useActiveItem);
})();

// ---------------- meta progress plumbing ----------------
// Dev-tainted runs earn nothing — same anti-cheat rule as the leaderboard.
function metaEvent(ev) {
  if (G.devTainted) return;
  const fresh = metaCheck(ev);
  for (const u of fresh) {
    G.newUnlocks.push(u);
    // pop the unlock card; a freshly unlocked item also lands in the bag
    // right away (this run only — see grantUnlockedItem)
    G.unlockPopups.push({ u, t: 5, max: 5,
      granted: u.kind === 'item' && grantUnlockedItem(u) });
  }
  if (fresh.length) SFX.chest();
}

// every taken item counts toward the single-run unlock (四重羽毛)
function noteItemTaken() {
  G.stats.items++;
  if (G.stats.items >= 12) metaEvent('run_items_12');
}

