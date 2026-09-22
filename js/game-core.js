'use strict';
// ============ main game ============
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
// every font assigned to this context is routed through uiF (see utils.js)
installFontScale(ctx);

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
  state: 'menu',          // menu | play | dead | win | dumateOffer
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
  mapOverlay: false,      // hold Tab (or tap the minimap): full floor map
  hudTop: 0,              // touch: HUD column drops below the corner buttons
  shake: 0,
  freeze: 0,              // world hit-stop in seconds (set by killEnemy)
  hurtT: 0,               // screen damage bloom countdown (see drawScreenDamage)
  hover: { kind: null, idx: -1 },   // pointer over a canvas-drawn hit region
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
  dumateOffer: null,      // {sel, megaHp, openedAt} — 击杀 MEGA dodo 后的终极抉择
  dumateWin: false,       // 本局是击败 dumate 后通关的
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
// fraction of the stick's travel that reads as "centred" (see the touchmove handler)
const STICK_DEAD = 0.14;
// fake-landscape flag: a portrait viewport plays the game rotated 90° (see
// the touch controls section); every touch coordinate then needs remapping
let rot90 = false;

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
  // I toggles the unlock codex; P stays pause-only so the two never collide
  if (e.code === 'KeyI' || (e.code === 'Escape' && G.unlockPanel)) {
    e.preventDefault();
    toggleCodex();
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
  if (G.state === 'dumateOffer' && G.dumateOffer &&
      (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'ArrowRight' || e.code === 'KeyD')) {
    G.dumateOffer.sel = 1 - G.dumateOffer.sel;
    SFX.coin();
    return;
  }
  if (G.state === 'menu' && (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'ArrowRight' || e.code === 'KeyD')) {
    menuSelectChar((e.code === 'ArrowLeft' || e.code === 'KeyA') ? -1 : 1);
    return;
  }
  if (G.state === 'menu' && !G.unlockPanel && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
    cycleDifficulty(e.code === 'ArrowUp' ? 1 : -1);
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
    // tapping the codex or the full map closes it and resumes; otherwise the
    // pause overlay keeps its one clickable region: the changelog doc link
    if (G.unlockPanel) { G.unlockPanel = false; setPaused(false); return; }
    if (G.mapOverlay) { G.mapOverlay = false; setPaused(false); return; }
    if (pauseDocLinkHit(e)) { window.open(LB_DOC_URL, '_blank'); return; }
    setPaused(false); return;
  }
  if (G.state === 'play') {
    // tapping the minimap opens the full floor map and freezes the run,
    // the equivalent of holding Tab on a keyboard
    const pos = canvasXY(e);
    if (G.floorCurse !== 'lost' && minimapHit(pos.x, pos.y)) {
      setPaused(true);
      G.mapOverlay = true;   // after setPaused: pausing releases held input
      SFX.item();
    }
    return;
  }
  if (G.state === 'dumateOffer') {
    const pos = canvasXY(e);
    const hit = dumateOfferHit(pos.x, pos.y);
    if (hit >= 0 && G.dumateOffer) { G.dumateOffer.sel = hit; resolveDumateOffer(hit === 0); }
    return;
  }
  if (G.state === 'menu') {
    if (G.unlockPanel) { G.unlockPanel = false; return; }
    const pos = canvasXY(e);
    // the codex line doubles as a tap target so touch players can open it too
    if (menuDiffHit(pos.x, pos.y)) { cycleDifficulty(1); return; }
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

// ---------------- pointer hover ----------------
// Nothing on the canvas is a DOM node, so no region can be hovered for free:
// every clickable spot is a hand-written hit test. On a desktop that made the
// interface look inert — the cursor never changed and nothing reacted to the
// pointer, so the only way to find the six clickable regions was to click them
// and see what happened. pointermove only records where the pointer is;
// hoverRegion() re-runs the same hit tests the click handlers use, and the main
// loop refreshes it every frame, so a region that appears later (the pause
// panel, the dumate choice) is hoverable the moment it is drawn.
G.hoverPos = null;
function hoverRegion(cx, cy) {
  const none = { kind: null, idx: -1 };
  if (cx == null) return none;
  if (G.state === 'menu') {
    if (G.unlockPanel) return none;
    if (menuDiffHit(cx, cy)) return { kind: 'diff', idx: -1 };
    if (menuCodexHit(cx, cy)) return { kind: 'codex', idx: -1 };
    const i = menuCharHit(cx, cy);
    return i >= 0 ? { kind: 'char', idx: i } : none;
  }
  if (G.state === 'play') {
    // paused first: the pause panel is an overlay on a 'play' state, so testing
    // the minimap before it swallowed every panel hit test
    if (G.paused) {
      if (G.mapOverlay || G.unlockPanel) return none;
      if (pauseDocLinkHitXY(cx, cy)) return { kind: 'doc', idx: -1 };
      const it = pauseItemHit(cx, cy);
      return it ? { kind: 'item', idx: it.i } : none;
    }
    if (G.floorCurse !== 'lost' && minimapHit(cx, cy)) return { kind: 'map', idx: -1 };
    return none;
  }
  if (G.state === 'dumateOffer') {
    const i = dumateOfferHit(cx, cy);
    return i >= 0 ? { kind: 'offer', idx: i } : none;
  }
  return none;
}
function refreshHover() {
  const pos = G.hoverPos;
  const h = hoverRegion(pos ? pos.x : null, pos ? pos.y : null);
  if (h.kind === G.hover.kind && h.idx === G.hover.idx) return;
  G.hover = h;
  canvas.style.cursor = h.kind ? 'pointer' : '';
}
canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch') return;   // a finger dragging the stick is not hovering
  G.hoverPos = canvasXY(e);
  refreshHover();
});
canvas.addEventListener('pointerleave', () => { G.hoverPos = null; refreshHover(); });

// On the menu the codex overlays the title; mid-run it pauses the game
// underneath, and closing it resumes play. Shared by the I key and the
// touch 「图鉴」 button.
function toggleCodex() {
  if (G.state === 'menu') {
    G.unlockPanel = !G.unlockPanel;
  } else if (G.state === 'play') {
    if (G.unlockPanel) { G.unlockPanel = false; setPaused(false); }
    else { setPaused(true); G.mapOverlay = false; G.unlockPanel = true; }
  } else return;
  SFX.item();
}

function confirmScreen() {
  if (G.state === 'dumateOffer') {
    resolveDumateOffer(!!G.dumateOffer && G.dumateOffer.sel === 0);
    return;
  }
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

// canvas-space coordinates of a pointer event. The canvas is CSS-scaled, and
// in fake-landscape mode (rot90) also rotated 90° clockwise: the canvas' own
// top-left corner sits at the top-RIGHT of its bounding rect, game-x runs down
// the screen and game-y runs toward the screen's left edge.
function canvasXY(e) {
  const r = canvas.getBoundingClientRect();
  if (rot90) return { x: (e.clientY - r.top) * (W / r.height), y: (r.right - e.clientX) * (H / r.width) };
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
  applyItemToPlayer(p, def);
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
  // overlays (pause panel / codex / full map) would sit under the stick and the
  // shooting pad, so those fold away while one is up — the corner buttons stay
  // (the pause icon flips to a play arrow through this same class)
  touchUI.classList.toggle('overlay', on);
  if (on) {
    G.pauseStart = performance.now();
    G.pauseAnim = 0;   // drives the overlay's fade-in, so it restarts every pause
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
    SFX.deny();
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
    SFX.deny();
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
  // the 暂停 / 图鉴 buttons float over the canvas' top-left corner, exactly
  // where the heart row is drawn. Measure how far down they reach (in canvas
  // units — the canvas is CSS-scaled) and let renderHUD start below them.
  const syncHudTop = () => {
    syncUiScale();   // same triggers, so the two stay in step on rotation
    const c = canvas.getBoundingClientRect();
    const pad = document.getElementById('top-pad').getBoundingClientRect();
    // in rot90 mode the canvas' game-y axis runs along the screen's x axis
    const dispH = rot90 ? c.width : c.height;
    const reach = rot90 ? (c.right - pad.left) : (pad.bottom - c.top);
    G.hudTop = dispH ? Math.max(0, reach * (H / dispH) + 6) : 0;
  };
  // Phones play in landscape, but plenty of mobile browsers never rotate the
  // viewport: in-app webviews (如流 etc.) are usually portrait-locked, and iOS
  // users often keep the Control Center orientation lock on. A rotate hint
  // dead-ends there — so a portrait viewport instead gets the whole game
  // rotated 90° via CSS (body.rot90) and plays in fake landscape. Touch
  // coordinates are mapped back in canvasXY and the stick handler.
  const syncRot = () => {
    const flip = window.innerHeight > window.innerWidth;
    if (flip !== rot90) {
      rot90 = flip;
      document.body.classList.toggle('rot90', flip);
    }
    syncHudTop();
  };
  window.addEventListener('resize', syncRot);
  window.addEventListener('orientationchange', syncRot);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', syncRot);
  setInterval(syncRot, 500);   // some webviews fire no resize at all on rotation
  syncRot();
  // still worth trying where allowed: a real fullscreen landscape beats the
  // fake one (guarded — webviews reject this in creative ways)
  window.addEventListener('touchend', () => {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen && screen.orientation && screen.orientation.lock) {
        el.requestFullscreen()
          .then(() => screen.orientation.lock('landscape'))
          .catch(() => {});
      }
    } catch (err) { /* some webviews throw synchronously */ }
  }, { once: true });
}
(function setupTouch() {
  const zone = document.getElementById('stick-zone');
  const base = document.getElementById('stick-base');
  const knob = document.getElementById('stick-knob');
  let stickId = null, cx = 0, cy = 0;
  // the pad scales with the screen (CSS vars), so every offset is measured
  // instead of hard-coded, and the knob rides on a transform
  const maxTravel = () => base.offsetWidth * 0.42;
  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    stickId = t.identifier;
    cx = t.clientX; cy = t.clientY;
    const zr = zone.getBoundingClientRect(), half = base.offsetWidth / 2;
    // zone-local coords: the zone rotates with the UI in rot90 mode, so a
    // viewport point maps into it through the same 90° flip as canvasXY
    const lx = rot90 ? (cy - zr.top) : (cx - zr.left);
    const ly = rot90 ? (zr.right - cx) : (cy - zr.top);
    base.style.left = (lx - half) + 'px';
    base.style.top = (ly - half) + 'px';
    base.style.bottom = 'auto';
  }, { passive: false });
  zone.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      let dx = t.clientX - cx, dy = t.clientY - cy;
      if (rot90) { const vx = dx; dx = dy; dy = -vx; }   // viewport → rotated-UI axes
      const d = Math.hypot(dx, dy);
      const max = maxTravel();
      // dead zone: a resting thumb jitters a pixel or two, and a stick that
      // reports that as input walks the player into every bullet in the room.
      // Past the dead zone the remaining travel is rescaled to 0..1 so the top
      // speed is unchanged — the stick just ignores the noise near the centre.
      const dead = max * STICK_DEAD;
      const k = max > 0 && d > dead ? Math.min(1, (d - dead) / (max - dead)) : 0;
      const ux = d > 0 ? dx / d : 0, uy = d > 0 ? dy / d : 0;
      dx = ux * k * max; dy = uy * k * max;
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      // max is 0 when the pad is display:none (an overlay is up). Dividing there
      // would push NaN into touch.moveX and from there into the player's position,
      // so the guard keeps the value at 0 instead of poisoning the whole run.
      touch.moveX = max > 0 ? dx / max : 0;
      touch.moveY = max > 0 ? dy / max : 0;
    }
  }, { passive: false });
  const endStick = e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      stickId = null;
      touch.moveX = 0; touch.moveY = 0;
      knob.style.transform = '';
    }
  };
  zone.addEventListener('touchend', endStick);
  zone.addEventListener('touchcancel', endStick);

  // every touch button doubles as "close whatever overlay is up and resume"
  const closeOverlays = () => { G.unlockPanel = false; G.mapOverlay = false; setPaused(false); };

  const dirVec = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  document.querySelectorAll('.fire-btn').forEach(btn => {
    const d = btn.dataset.dir;
    btn.addEventListener('touchstart', e => {
      e.preventDefault();
      if (G.paused) { closeOverlays(); return; }
      touch.fire = dirVec[d];
      if (G.state !== 'play') confirmScreen();
    }, { passive: false });
    btn.addEventListener('touchend', e => { e.preventDefault(); if (touch.fire === dirVec[d]) touch.fire = null; }, { passive: false });
    // a call, a notification or a gesture can cancel a touch without ever
    // sending touchend; without this the direction stuck and the player kept
    // firing at whatever was in front of them until the next tap
    btn.addEventListener('touchcancel', e => { e.preventDefault(); if (touch.fire === dirVec[d]) touch.fire = null; }, { passive: false });
    // keyboard: hold Enter/Space on a focused direction to keep firing that way.
    // stopPropagation for the same reason as bindKey — the global handler would
    // otherwise read Space as "use active item" on top of the shot.
    btn.addEventListener('keydown', e => {
      if (e.code !== 'Enter' && e.code !== 'Space') return;
      e.preventDefault();
      e.stopPropagation();
      SFX.unlock();
      if (G.paused) { closeOverlays(); return; }
      touch.fire = dirVec[d];
      if (G.state !== 'play') confirmScreen();
    });
    btn.addEventListener('keyup', e => {
      if (e.code !== 'Enter' && e.code !== 'Space') return;
      e.preventDefault();
      e.stopPropagation();
      if (touch.fire === dirVec[d]) touch.fire = null;
    });
  });

  // Enter/Space on a focused touch button. Not a `click` listener for the *action*
  // itself: touchstart already calls preventDefault, but a tap can still produce a
  // synthesized click on some engines and the action would fire twice. Assistive
  // tech, on the other hand, activates a focused button with a click and never a
  // keydown, so `click` is handled too — guarded by the timestamp of the last
  // touchstart, which is the one path that must not double-fire.
  const bindKey = (el, fn) => {
    let lastTouch = 0;
    el.addEventListener('touchstart', () => { lastTouch = performance.now(); }, { passive: true });
    el.addEventListener('keydown', e => {
      if (e.code !== 'Enter' && e.code !== 'Space') return;
      e.preventDefault();
      // stopPropagation matters: the window-level keydown handler below also acts
      // on Enter/Space (start / confirm / resume), so without this a focused
      // 暂停 button would pause and then be immediately resumed by the global one.
      e.stopPropagation();
      SFX.unlock();
      fn();
    });
    el.addEventListener('click', () => {
      if (performance.now() - lastTouch < 700) return;   // already handled by touchstart
      SFX.unlock();
      fn();
    });
  };
  // bomb / active-item buttons: the two keyboard-only actions (E / Space)
  // that used to be unreachable on touch
  const bindAction = (id, fn) => {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      SFX.unlock();
      if (G.paused) { closeOverlays(); return; }
      if (G.state === 'play') fn();
    }, { passive: false });
    // these are real <button>s, so a keyboard (touch laptop) or a screen reader's
    // virtual cursor can focus them — and until now Enter/Space did nothing
    bindKey(el, () => {
      if (G.paused) { closeOverlays(); return; }
      if (G.state === 'play') fn();
    });
  };
  bindAction('btn-bomb', placeBomb);
  bindAction('btn-item', useActiveItem);

  // top-left pair: P and I have no keyboard on a phone
  const bindTap = (id, fn) => {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      SFX.unlock();
      fn();
    }, { passive: false });
    bindKey(el, fn);
  };
  bindTap('btn-pause', () => {
    if (G.paused) closeOverlays();
    else setPaused(true);
  });
  bindTap('btn-codex', toggleCodex);
})();

// ---------------- UI scale, touch button state, a11y ----------------
// The canvas is CSS-scaled, so a font size in the source is only a relative
// size: measure how many CSS px the 960-wide stage actually gets and lift UI
// text back to a readable physical size on small screens (UIK, see utils.js).
function syncUiScale() {
  const r = canvas.getBoundingClientRect();
  const cssW = rot90 ? r.height : r.width;   // game-x runs along this axis
  UIK = cssW > 0 ? clamp(W / cssW, 1, 1.3) : 1;
}
window.addEventListener('resize', syncUiScale);
window.addEventListener('orientationchange', syncUiScale);
syncUiScale();

// The touch buttons are plain DOM, so nothing stopped them from being pressed
// when the action behind them could not happen: tapping 炸弹 with no bombs just
// produced a toast explaining it afterwards. Mirror the game state onto them so
// a dead button looks dead. Called from the main loop; the DOM is only touched
// when the state actually flips.
const touchButtons = IS_TOUCH ? {
  bomb: document.getElementById('btn-bomb'),
  item: document.getElementById('btn-item'),
} : null;
let touchBtnState = '';
function syncTouchButtons() {
  if (!touchButtons) return;
  const p = G.player;
  const live = G.state === 'play' && !G.paused;
  const bomb = live && !!p && p.bombs > 0;
  const item = live && !!p && !!p.active && p.active.charge >= p.active.def.cost;
  const key = (bomb ? 'b' : '-') + (item ? 'i' : '-');
  if (key === touchBtnState) return;
  touchBtnState = key;
  touchButtons.bomb.classList.toggle('off', !bomb);
  touchButtons.item.classList.toggle('off', !item);
}

// short haptic tick alongside the events that already shake the screen.
// Android Chrome only — iOS Safari has no vibrate — so it is a bonus where it
// exists and silently nothing where it doesn't.
function haptic(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* some webviews throw */ }
}

// The HUD is canvas pixels: a screen reader sees an empty element. Mirror the
// state that matters into a live region so the game is at least followable
// without sight — the toast line, the screen transitions, and the three numbers
// that change constantly during play.
const srLive = document.getElementById('sr-live');
let srLast = '';
function syncAnnounce() {
  const p = G.player;
  let msg = '';
  if (G.state === 'menu') msg = '标题界面　按 Enter 开始';
  else if (G.state === 'dead') msg = '你死了　按 Enter 再来一次';
  else if (G.state === 'win') msg = '通关　按 Enter 再来一次';
  else if (G.state === 'dumateOffer') msg = 'dumate 抉择　左右选择　Enter 确认';
  else if (G.paused) msg = '已暂停　按 P 继续';
  else if (G.toast) msg = G.toast.title + '，' + G.toast.desc;
  else if (p) msg = '生命 ' + Math.ceil(p.hp / 2) + ' 心　金币 ' + p.coins + '　炸弹 ' + p.bombs;
  if (msg === srLast) return;
  srLast = msg;
  if (srLive) srLive.textContent = msg;
}

// ---- ambient bed ----
// SFX has no music and never had any: every sound in the game is a one-shot, so
// rooms were silent until something happened. This drives the drone defined in
// js/audio.js: the root note walks down the chapters as you descend, opens up
// while a boss is alive, and ducks to nothing while paused or on an end screen.
// Only re-tuned when the situation actually changes, so it costs nothing per frame.
const MUSIC_ROOTS = [98, 92.5, 87.3, 82.4, 77.8, 73.4, 69.3, 65.4, 61.7, 58.3, 55, 51.9];
let _musicKey = '';
function syncMusic() {
  const boss = G.state === 'play' && G.enemies.some(e => e.isBoss);
  const key = G.state + ':' + G.floorNum + ':' + (boss ? 1 : 0) + ':' + (G.paused ? 1 : 0);
  if (key === _musicKey) return;
  // Remember the request only if the bed actually accepted it: before the first
  // user gesture the AudioContext is locked, and caching the key then would leave
  // the ambience silent until the next floor / boss / pause change.
  let ok = false;
  if (G.state === 'menu') {
    ok = SFX.music(MUSIC_ROOTS[0] * 0.75, 0.15);
  } else {
    const root = MUSIC_ROOTS[Math.min(MUSIC_ROOTS.length - 1, Math.max(0, G.floorNum - 1))];
    ok = (G.paused || G.state === 'dead' || G.state === 'win')
      ? SFX.music(root, -1)
      : SFX.music(root, boss ? 1 : 0.35);
  }
  if (ok) _musicKey = key;
}

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

