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
function rand(a = 1, b) { if (b === undefined) { b = a; a = 0; } return a + Math.random() * (b - a); }
function randi(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function chance(p) { return Math.random() < p; }

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
