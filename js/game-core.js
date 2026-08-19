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
  // overlays (pause panel / codex / full map) would sit under the stick and the
  // shooting pad, so those fold away while one is up — the corner buttons stay
  // (the pause icon flips to a play arrow through this same class)
  touchUI.classList.toggle('overlay', on);
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
  // the 暂停 / 图鉴 buttons float over the canvas' top-left corner, exactly
  // where the heart row is drawn. Measure how far down they reach (in canvas
  // units — the canvas is CSS-scaled) and let renderHUD start below them.
  const syncHudTop = () => {
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
      if (d > max) { dx *= max / d; dy *= max / d; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      touch.moveX = dx / max; touch.moveY = dy / max;
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
  });

  // bomb / active-item buttons: the two keyboard-only actions (E / Space)
  // that used to be unreachable on touch
  const bindAction = (id, fn) => {
    document.getElementById(id).addEventListener('touchstart', e => {
      e.preventDefault();
      SFX.unlock();
      if (G.paused) { closeOverlays(); return; }
      if (G.state === 'play') fn();
    }, { passive: false });
  };
  bindAction('btn-bomb', placeBomb);
  bindAction('btn-item', useActiveItem);

  // top-left pair: P and I have no keyboard on a phone
  const bindTap = (id, fn) => {
    document.getElementById(id).addEventListener('touchstart', e => {
      e.preventDefault();
      SFX.unlock();
      fn();
    }, { passive: false });
  };
  bindTap('btn-pause', () => {
    if (G.paused) closeOverlays();
    else setPaused(true);
  });
  bindTap('btn-codex', toggleCodex);
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

