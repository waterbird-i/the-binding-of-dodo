'use strict';
const TAU = Math.PI * 2;
const TILE = 64;
const COLS = 13, ROWS = 7;
const W = TILE * (COLS + 2);   // 960
const H = TILE * (ROWS + 2);   // 576
const FLOOR_X = TILE, FLOOR_Y = TILE;
const FLOOR_W = TILE * COLS, FLOOR_H = TILE * ROWS;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
// All randomness funnels through rng(): normally Math.random, but withRng()
// can swap in a seeded stream — that's how the run-seed system makes floor
// layouts / item rolls reproducible without threading an rng everywhere.
let RNG_SRC = null;
function rng() { return RNG_SRC ? RNG_SRC() : Math.random(); }
function withRng(seed, fn) {
  const prev = RNG_SRC;
  RNG_SRC = mulberry32(seed);
  try { return fn(); } finally { RNG_SRC = prev; }
}
function rand(a = 1, b) { if (b === undefined) { b = a; a = 0; } return a + rng() * (b - a); }
function randi(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
function chance(p) { return rng() < p; }

// ---------------- difficulty presets ----------------
// Three presets scale a small set of knobs. Nothing here touches the seeded
// rng stream: every consumer feeds these numbers into arithmetic *after* the
// rng draw that decides structure, so the same seed still builds the same
// dungeon, room kinds, curses and item pool rolls on all three presets —
// only the numbers differ. Consumers ask for one knob by name.
const DIFFICULTY_PRESETS = {
  easy:   { label: '轻松', desc: '敌人更脆更少更迟钝',
            enemyHp: 0.85, enemyCount: 0.80, enemySpeed: 0.92, enemyDmg: 0.85,
            bossHp: 0.85, bossCap: 0.85, bossMin: 0.85, bossGap: 1.15, bulletSpeed: 0.92 },
  normal: { label: '标准', desc: '原始手感',
            enemyHp: 1,    enemyCount: 1,    enemySpeed: 1,    enemyDmg: 1,
            bossHp: 1,    bossCap: 1,    bossMin: 1,    bossGap: 1,    bulletSpeed: 1 },
  hard:   { label: '硬核', desc: '敌人更厚更凶更快',
            enemyHp: 1.25, enemyCount: 1.15, enemySpeed: 1.08, enemyDmg: 1.25,
            bossHp: 1.20, bossCap: 1.15, bossMin: 1.30, bossGap: 0.88, bulletSpeed: 1.08 },
};
const DIFF_ORDER = ['easy', 'normal', 'hard'];
let DIFF_KEY = 'normal';
function setDifficulty(k) { DIFF_KEY = DIFFICULTY_PRESETS[k] ? k : 'normal'; }
function diffDef() { return DIFFICULTY_PRESETS[DIFF_KEY]; }
// unknown keys degrade to 1 (= no-op), so a typo can never zero the game out
function diffMul(key) {
  const d = DIFFICULTY_PRESETS[DIFF_KEY];
  const v = d ? d[key] : 1;
  return typeof v === 'number' ? v : 1;
}

// ---- run seeds (Isaac style): 8 chars of A-Z1-9 <-> 32-bit int ----
const SEED_CHARS = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789'; // no O/0 confusion
function seedFromString(str) {
  // any text works as a seed: FNV-1a hash of the uppercased input
  let h = 0x811c9dc5;
  const s = String(str).toUpperCase().trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function randomSeedString() {
  let s = '';
  for (let i = 0; i < 8; i++) s += SEED_CHARS[Math.floor(Math.random() * SEED_CHARS.length)];
  return s;
}
// per-floor stream derived from the run seed, so floor N generates the same
// for everyone with the seed no matter how floor N-1 was played
function floorSeed(runSeed, floorNum, salt) {
  let h = (runSeed ^ Math.imul(floorNum, 0x9E3779B1) ^ (salt || 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

// seeded rng for room textures
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// circle vs rect collision resolve: returns corrected {x,y} or null if no hit
function circleRectPush(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx, dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  const d = Math.sqrt(d2) || 0.0001;
  const push = (r - d) / d;
  return { x: cx + dx * push, y: cy + dy * push };
}

function tileRect(cx, cy) {
  return { x: FLOOR_X + cx * TILE, y: FLOOR_Y + cy * TILE, w: TILE, h: TILE };
}

// shortest-path angle interpolation (used by boss aiming)
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * t;
}

// does a segment from (x,y) along `angle` for `len` px touch circle (cx,cy,r)?
function segCircleHit(x, y, angle, len, cx, cy, r) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const t = clamp((cx - x) * dx + (cy - y) * dy, 0, len);
  return dist(x + dx * t, y + dy * t, cx, cy) <= r;
}

// ---------------- UI typography ----------------
// Two problems live here, both invisible on a laptop and obvious in the hand.
//
// 1. The game is authored at a fixed 960×576 and CSS-scaled to the viewport, so
//    a font size in the source is only a *relative* size. A phone canvas is
//    about 0.68×, which lands the 11–16px HUD labels at 7–11 CSS px — legible
//    on a desktop, a grey smudge on a phone. UIK is raised when the canvas is
//    scaled down (see syncUiScale in game-core.js) and every font assigned to
//    the main context is multiplied by it (see installFontScale).
let UIK = 1;
function uiF(px) { return Math.round(px * UIK * 10) / 10; }

// 2. Georgia and Trebuchet MS carry no CJK glyphs, so every Chinese string used
//    to fall through to whatever the OS happened to pick — PingFang on macOS,
//    Microsoft YaHei on Windows, Roboto/Noto on Android. The interface read as
//    three different games on three platforms, and the serif voice of the
//    floor banners and the pause sheet was lost entirely. Both stacks now name
//    a CJK partner, so 中文 keeps the intended serif / slab character.
const UI_SERIF = 'Georgia,"Songti SC","Noto Serif SC","Noto Serif CJK SC",serif';
const UI_SANS = '"Trebuchet MS","PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif';

// Route every `ctx.font = '... 16px ...'` through uiF without touching the ~60
// call sites: shadow the accessor on this one context. measureText sees the same
// scaled font, so anything that lays itself out from measured text stays
// consistent. Nothing in the project reads ctx.font back, so no double scaling.
function installFontScale(g) {
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(g), 'font');
  if (!desc || !desc.get || !desc.set) return;
  Object.defineProperty(g, 'font', {
    configurable: true,
    get() { return desc.get.call(g); },
    set(v) {
      desc.set.call(g, typeof v === 'string'
        ? v.replace(/(\d+(?:\.\d+)?)px/, (m, n) => uiF(parseFloat(n)) + 'px')
        : v);
    },
  });
}
