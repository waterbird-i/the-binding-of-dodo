'use strict';
// ---- The Binding of Isaac basement-like palette ----
// 原作视觉基调：极重的近黑描边、病态苍白的肉色、褪色脏污的棕石、无处不在的血
const PAL = {
  outline: '#0f0a07',
  backdrop: '#0c0805',
  wall: '#4b3b27',
  wallLight: '#635034',
  wallDark: '#312517',
  floor: '#bcab87',
  floorDark: '#9d8c68',
  floorEdge: '#6f5f44',
  rock: '#a3937a',
  rockDark: '#7d6e57',
  blood: '#8e1b12',
  bloodDark: '#5c0f09',
  tear: '#dcecfb',
  tearOutline: '#8fb2d6',
  gaper: '#ece0cb',
  gaperDark: '#bbaa8e',
};

// hex -> lighten/darken by amt (-255..255); baked per-tile / per-brick tint
// jitter lives on this so nothing reads as a flat programmatic fill
function shadeColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

// Per-chapter repaint: 12 floors span 8 visual chapters, Isaac style.
// applyFloorTheme() mutates PAL before a floor is generated, so every room
// baked afterwards picks up the new stone/floor colors.
const BASE_PAL = Object.assign({}, PAL);
const FLOOR_THEMES = [
  {}, {},                                                                       // BASEMENT I / II
  { wall: '#54402a', wallLight: '#6b5335', wallDark: '#33260f', floor: '#a68d63', floorDark: '#8b7550', rock: '#8f7f66', rockDark: '#6c5f4a' },
  { wall: '#54402a', wallLight: '#6b5335', wallDark: '#33260f', floor: '#a68d63', floorDark: '#8b7550', rock: '#8f7f66', rockDark: '#6c5f4a' },
  { wall: '#3b3a3c', wallLight: '#514f52', wallDark: '#242325', floor: '#948f88', floorDark: '#7a746d', rock: '#726f6b', rockDark: '#514f4c' },
  { wall: '#3b3a3c', wallLight: '#514f52', wallDark: '#242325', floor: '#948f88', floorDark: '#7a746d', rock: '#726f6b', rockDark: '#514f4c' },
  { wall: '#5e1c1c', wallLight: '#7b2a26', wallDark: '#3c1010', floor: '#a9584f', floorDark: '#8c453e', rock: '#89372f', rockDark: '#63241e' },
  { wall: '#5e1c1c', wallLight: '#7b2a26', wallDark: '#3c1010', floor: '#a9584f', floorDark: '#8c453e', rock: '#89372f', rockDark: '#63241e' },
  { wall: '#2b1512', wallLight: '#43201a', wallDark: '#170a08', floor: '#6b463c', floorDark: '#53342c', rock: '#4d2f28', rockDark: '#35201b' },  // SHEOL
  { wall: '#4a5a70', wallLight: '#5f7288', wallDark: '#2f3b4c', floor: '#c3cbd6', floorDark: '#a5aebc', rock: '#9fa9b8', rockDark: '#78818f' }, // CATHEDRAL
  { wall: '#6a5230', wallLight: '#8a6c3d', wallDark: '#453419', floor: '#cbb27c', floorDark: '#ab9463', rock: '#b09763', rockDark: '#87724a' },  // THE CHEST
  { wall: '#241d1b', wallLight: '#382d29', wallDark: '#120d0c', floor: '#4e4744', floorDark: '#3b3532', rock: '#3a3330', rockDark: '#262120' },  // DARK ROOM
];

// Which bake pipeline a floor uses. WOMB I/II are living flesh; the run has
// no literal "???" floor, so DARK ROOM inherits the ???-style cold variant:
// same flesh bake but the veins glow cold blue instead of pumping red.
let THEME_DEPTH = 1;
function chapterStyle(depth) {
  if (depth === 7 || depth === 8) return 'womb';
  if (depth === 12) return 'womb-cold';
  return 'stone';
}
function applyFloorTheme(depth) {
  THEME_DEPTH = depth;
  Object.assign(PAL, BASE_PAL, FLOOR_THEMES[clamp(depth, 1, FLOOR_THEMES.length) - 1] || {});
}

// ================= ROOM =================
// Static parts of a room are baked once per room into an offscreen canvas.
// Two full pipelines: dirty faded stone (default chapters) and living flesh
// (Womb chapters; DARK ROOM reuses it with cold blue glowing veins).
function buildRoomBase(room) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rng = mulberry32(room.seed);
  const style = chapterStyle(THEME_DEPTH);
  if (style === 'stone') bakeStoneRoom(g, rng, THEME_DEPTH);
  else bakeFleshRoom(g, rng, style === 'womb-cold');
  room._base = c;
  return c;
}

// wall trapezoids (between the 8px outer border and the floor rect)
const WALL_POLYS = {
  N: [[8, 8], [W - 8, 8], [FLOOR_X + FLOOR_W, FLOOR_Y], [FLOOR_X, FLOOR_Y]],
  S: [[8, H - 8], [W - 8, H - 8], [FLOOR_X + FLOOR_W, FLOOR_Y + FLOOR_H], [FLOOR_X, FLOOR_Y + FLOOR_H]],
  W: [[8, 8], [FLOOR_X, FLOOR_Y], [FLOOR_X, FLOOR_Y + FLOOR_H], [8, H - 8]],
  E: [[W - 8, 8], [FLOOR_X + FLOOR_W, FLOOR_Y], [FLOOR_X + FLOOR_W, FLOOR_Y + FLOOR_H], [W - 8, H - 8]],
};
function clipPoly(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.clip();
}
function clipFloor(g, pad = 0) {
  g.beginPath();
  g.rect(FLOOR_X - pad, FLOOR_Y - pad, FLOOR_W + pad * 2, FLOOR_H + pad * 2);
  g.clip();
}

// ---- stone pipeline ----
function paintBrick(g, rng, x, y, w, h) {
  g.fillStyle = shadeColor(PAL.wall, Math.round((rng() - 0.5) * 40));
  g.fillRect(x, y, w, h);
  // top-lit bevel
  g.fillStyle = 'rgba(255,250,235,0.06)';
  g.fillRect(x, y, w, 2);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(x, y + h - 2, w, 2);
  if (rng() < 0.14) {                     // chipped / water-stained brick
    g.fillStyle = 'rgba(0,0,0,' + (0.08 + rng() * 0.14).toFixed(3) + ')';
    g.fillRect(x + rng() * w * 0.5, y + rng() * h * 0.4,
      w * (0.3 + rng() * 0.5), h * (0.3 + rng() * 0.5));
  }
}

// staggered coursing (错缝): odd rows shift half a brick
function bakeBrickBand(g, rng, side) {
  g.save();
  clipPoly(g, WALL_POLYS[side]);
  const course = 27, blen = 58;
  if (side === 'N' || side === 'S') {
    const y0 = side === 'N' ? 6 : FLOOR_Y + FLOOR_H - 3;
    for (let row = 0; row < 3; row++) {
      const y = y0 + row * course;
      const off = (row % 2) * blen * 0.5 + (rng() - 0.5) * 8;
      for (let x = -blen + off; x < W + blen; x += blen + rng() * 8) {
        paintBrick(g, rng, x, y, blen - 4 + rng() * 8, course - 4);
      }
    }
  } else {
    const x0 = side === 'W' ? 6 : FLOOR_X + FLOOR_W - 3;
    for (let col = 0; col < 3; col++) {
      const x = x0 + col * course;
      const off = (col % 2) * blen * 0.5 + (rng() - 0.5) * 8;
      for (let y = -blen + off; y < H + blen; y += blen + rng() * 8) {
        paintBrick(g, rng, x, y, course - 4, blen - 4 + rng() * 8);
      }
    }
  }
  g.restore();
}

// skull half-sunk into the wall masonry (Catacombs / Necropolis)
function bakeWallSkull(g, rng, x, y, s) {
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,0.5)';                       // recess behind it
  g.beginPath(); g.ellipse(0, 0, s * 1.3, s * 1.2, 0, 0, TAU); g.fill();
  g.fillStyle = '#c9bd9e';
  g.strokeStyle = PAL.outline;
  g.lineWidth = 2.5;
  g.beginPath(); g.arc(0, -s * 0.12, s, 0, TAU); g.fill(); g.stroke();
  g.beginPath();                                          // jaw
  g.rect(-s * 0.45, s * 0.42, s * 0.9, s * 0.5);
  g.fill(); g.stroke();
  g.fillStyle = '#17110c';
  g.beginPath();
  g.ellipse(-s * 0.38, -s * 0.2, s * 0.24, s * 0.3, 0, 0, TAU);
  g.ellipse(s * 0.38, -s * 0.2, s * 0.24, s * 0.3, 0, 0, TAU);
  g.fill();
  g.beginPath();                                          // nasal hole
  g.moveTo(0, s * 0.05); g.lineTo(-s * 0.12, s * 0.34); g.lineTo(s * 0.12, s * 0.34);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(23,17,12,0.7)';
  g.lineWidth = 1.4;
  g.beginPath();
  for (let i = -1; i <= 1; i++) { g.moveTo(i * s * 0.22, s * 0.44); g.lineTo(i * s * 0.22, s * 0.86); }
  g.stroke();
  g.restore();
}

// dark dried drips running down the wall face
function bakeWallBlood(g, rng, count) {
  for (let i = 0; i < count; i++) {
    const onTop = rng() < 0.7;
    const x = FLOOR_X + 20 + rng() * (FLOOR_W - 40);
    const top = onTop ? 12 + rng() * 16 : FLOOR_Y + FLOOR_H + 6 + rng() * 14;
    const len = 18 + rng() * (onTop ? 36 : 22);
    const w = 3 + rng() * 6;
    g.fillStyle = 'rgba(88,14,8,' + (0.5 + rng() * 0.3).toFixed(2) + ')';
    g.beginPath();
    g.moveTo(x - w / 2, top);
    g.lineTo(x + w / 2, top);
    g.lineTo(x + w * 0.18, top + len);
    g.arc(x, top + len, w * 0.22, 0, Math.PI);
    g.closePath();
    g.fill();
  }
}

// quarter cobweb hanging in a wall corner
function bakeCobweb(g, rng, cx, cy, dx, dy, r) {
  g.save();
  g.strokeStyle = 'rgba(235,232,220,0.16)';
  g.lineWidth = 1.1;
  const n = 5;
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * r * dx, cy + Math.sin(a) * r * dy);
  }
  g.stroke();
  for (let k = 1; k <= 3; k++) {
    const rr = r * (0.28 + 0.24 * k + rng() * 0.05);
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * (Math.PI / 2);
      const px = cx + Math.cos(a) * rr * dx, py = cy + Math.sin(a) * rr * dy;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
  }
  g.restore();
}

// per-tile stone tint + grain + faint seams + cracks
function bakeStoneFloor(g, rng) {
  g.fillStyle = PAL.floor;
  g.fillRect(FLOOR_X, FLOOR_Y, FLOOR_W, FLOOR_H);
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const t = tileRect(cx, cy);
      g.fillStyle = shadeColor(PAL.floor, Math.round((rng() - 0.5) * 28));
      g.fillRect(t.x, t.y, t.w, t.h);
      const grains = 6 + (rng() * 8 | 0);
      for (let i = 0; i < grains; i++) {
        g.fillStyle = (rng() < 0.55 ? 'rgba(30,20,10,' : 'rgba(255,250,235,') +
          (0.05 + rng() * 0.09).toFixed(3) + ')';
        g.fillRect(t.x + rng() * TILE, t.y + rng() * TILE, 1 + rng() * 2, 1 + rng() * 2);
      }
      g.strokeStyle = 'rgba(40,28,15,0.16)';
      g.lineWidth = 1;
      g.strokeRect(t.x + 0.5, t.y + 0.5, TILE - 1, TILE - 1);
      if (rng() < 0.24) {
        g.strokeStyle = 'rgba(60,45,28,' + (0.3 + rng() * 0.25).toFixed(2) + ')';
        g.lineWidth = 1 + rng();
        g.beginPath();
        let px = t.x + 8 + rng() * 48, py = t.y + 8 + rng() * 48;
        g.moveTo(px, py);
        const segs = 2 + (rng() * 3 | 0);
        for (let s = 0; s < segs; s++) {
          px += (rng() - 0.5) * 32; py += (rng() - 0.5) * 26;
          g.lineTo(px, py);
        }
        g.stroke();
      }
    }
  }
}

// big soft organic blotches crossing tile boundaries — kills the grid feel
function bakeOrganicPatches(g, rng, count) {
  g.save();
  clipFloor(g);
  for (let i = 0; i < count; i++) {
    const cx = FLOOR_X + rng() * FLOOR_W, cy = FLOOR_Y + rng() * FLOOR_H;
    const base = 45 + rng() * 100;
    g.fillStyle = rng() < 0.62 ? 'rgb(52,38,22)' : 'rgb(255,246,218)';
    g.globalAlpha = 0.05 + rng() * 0.07;
    const blobs = 5 + (rng() * 5 | 0);
    for (let b = 0; b < blobs; b++) {
      g.beginPath();
      g.ellipse(cx + (rng() - 0.5) * base * 1.7, cy + (rng() - 0.5) * base * 1.2,
        base * (0.3 + rng() * 0.5), base * (0.25 + rng() * 0.4), rng() * TAU, 0, TAU);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  g.restore();
}

// grime piled up in the four floor corners
function bakeCornerGrime(g, rng, strength) {
  const corners = [
    [FLOOR_X, FLOOR_Y, 1, 1], [FLOOR_X + FLOOR_W, FLOOR_Y, -1, 1],
    [FLOOR_X, FLOOR_Y + FLOOR_H, 1, -1], [FLOOR_X + FLOOR_W, FLOOR_Y + FLOOR_H, -1, -1],
  ];
  g.save();
  clipFloor(g);
  for (const [x, y, sx, sy] of corners) {
    const r = 60 + rng() * 60;
    const grad = g.createRadialGradient(x, y, 6, x, y, r);
    grad.addColorStop(0, 'rgba(16,9,4,' + strength + ')');
    grad.addColorStop(1, 'rgba(16,9,4,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
    for (let i = 0; i < 12; i++) {
      g.fillStyle = 'rgba(24,14,7,' + (0.1 + rng() * 0.2).toFixed(2) + ')';
      const d = rng() * r * 0.7, a = rng() * Math.PI / 2;
      g.beginPath();
      g.ellipse(x + Math.cos(a) * d * sx, y + Math.sin(a) * d * sy,
        1.5 + rng() * 4, 1 + rng() * 3, rng() * TAU, 0, TAU);
      g.fill();
    }
  }
  g.restore();
}

// dried pools with directional splatter trails
function bakeBlood(g, rng, pools, rgb) {
  g.save();
  clipFloor(g, 2);
  for (let i = 0; i < pools; i++) {
    const x = FLOOR_X + 30 + rng() * (FLOOR_W - 60);
    const y = FLOOR_Y + 30 + rng() * (FLOOR_H - 60);
    const r = 13 + rng() * 30;
    g.fillStyle = 'rgba(' + rgb + ',' + (0.4 + rng() * 0.3).toFixed(2) + ')';
    for (let b = 0; b < 5; b++) {
      g.beginPath();
      g.ellipse(x + (rng() - 0.5) * r * 1.4, y + (rng() - 0.5) * r,
        r * (0.3 + rng() * 0.4), r * (0.22 + rng() * 0.35), rng() * TAU, 0, TAU);
      g.fill();
    }
    const dir = rng() * TAU;
    const drops = 8 + (rng() * 14 | 0);
    for (let s = 0; s < drops; s++) {
      const d = r * (0.8 + rng() * 2.3);
      const a = dir + (rng() - 0.5) * 1.1;
      g.beginPath();
      g.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7,
        1 + rng() * 2.6, 0.8 + rng() * 1.8, a, 0, TAU);
      g.fill();
    }
  }
  g.restore();
}

// scattered skeleton bits (Catacombs / Necropolis floors)
function bakeBone(g, rng, x, y) {
  const a = rng() * TAU, len = 13 + rng() * 15;
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.lineCap = 'round';
  g.strokeStyle = PAL.outline;
  g.lineWidth = 6.5;
  g.beginPath(); g.moveTo(-len / 2, 0); g.lineTo(len / 2, 0); g.stroke();
  g.strokeStyle = '#d3c8a8';
  g.lineWidth = 3.6;
  g.beginPath(); g.moveTo(-len / 2, 0); g.lineTo(len / 2, 0); g.stroke();
  g.fillStyle = '#d3c8a8';
  for (const ex of [-len / 2, len / 2]) {
    g.beginPath();
    g.arc(ex, -2.4, 3, 0, TAU);
    g.arc(ex, 2.4, 3, 0, TAU);
    g.fill();
  }
  g.restore();
}

// smoldering ember spots + drifting ash (Sheol)
function bakeEmbers(g, rng, count) {
  g.save();
  clipFloor(g);
  for (let i = 0; i < count; i++) {
    const x = FLOOR_X + rng() * FLOOR_W, y = FLOOR_Y + rng() * FLOOR_H;
    const r = 9 + rng() * 22;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,150,60,' + (0.3 + rng() * 0.25).toFixed(2) + ')');
    grad.addColorStop(0.5, 'rgba(220,80,30,' + (0.12 + rng() * 0.1).toFixed(2) + ')');
    grad.addColorStop(1, 'rgba(120,30,10,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
    for (let k = 0; k < 3; k++) {
      g.fillStyle = 'rgba(255,220,130,' + (0.5 + rng() * 0.4).toFixed(2) + ')';
      g.fillRect(x + (rng() - 0.5) * r, y + (rng() - 0.5) * r, 1.5 + rng() * 1.5, 1.5 + rng() * 1.5);
    }
  }
  for (let i = 0; i < 40; i++) {          // ash specks
    g.fillStyle = 'rgba(210,200,190,' + (0.06 + rng() * 0.1).toFixed(2) + ')';
    g.fillRect(FLOOR_X + rng() * FLOOR_W, FLOOR_Y + rng() * FLOOR_H, 1 + rng() * 1.6, 1 + rng() * 1.6);
  }
  g.restore();
}

// pale marble veining (Cathedral / The Chest)
function bakeMarble(g, rng) {
  g.save();
  clipFloor(g);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 24; i++) {
    g.lineWidth = 0.8 + rng() * 1.3;
    g.globalAlpha = 0.05 + rng() * 0.08;
    let px = FLOOR_X + rng() * FLOOR_W, py = FLOOR_Y + rng() * FLOOR_H;
    g.beginPath();
    g.moveTo(px, py);
    const segs = 3 + (rng() * 4 | 0);
    for (let s = 0; s < segs; s++) {
      const nx = px + (rng() - 0.5) * 95, ny = py + (rng() - 0.5) * 60;
      g.quadraticCurveTo(px + (rng() - 0.5) * 40, py + (rng() - 0.5) * 40, nx, ny);
      px = nx; py = ny;
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  g.restore();
}

// warm arched pools of light, as if thrown through stained-glass windows
function bakeWindowLight(g, rng) {
  g.save();
  clipFloor(g);
  for (const fx of [0.28, 0.72]) {
    const x = FLOOR_X + FLOOR_W * (fx + (rng() - 0.5) * 0.06);
    const y = FLOOR_Y + FLOOR_H * (0.34 + rng() * 0.14);
    const w = 68 + rng() * 22, h = 150 + rng() * 40;
    g.save();
    g.translate(x, y);
    g.rotate((rng() - 0.5) * 0.12);
    const grad = g.createLinearGradient(0, -h / 2, 0, h / 2);
    grad.addColorStop(0, 'rgba(255,220,150,0.34)');
    grad.addColorStop(1, 'rgba(255,220,150,0.08)');
    g.fillStyle = grad;
    g.beginPath();                        // arch: rect topped by a semicircle
    g.moveTo(-w / 2, h / 2);
    g.lineTo(-w / 2, -h / 2 + w / 2);
    g.arc(0, -h / 2 + w / 2, w / 2, Math.PI, 0);
    g.lineTo(w / 2, h / 2);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(60,40,20,0.10)';  // mullion shadows
    g.fillRect(-2.2, -h / 2, 4.4, h);
    g.fillRect(-w / 2, -h * 0.1, w, 4);
    const tints = ['rgba(200,60,50,0.07)', 'rgba(70,110,200,0.07)', 'rgba(225,185,60,0.08)'];
    for (let i = 0; i < 3; i++) {
      g.fillStyle = tints[i];
      g.beginPath();
      g.ellipse((rng() - 0.5) * w * 0.6, (rng() - 0.4) * h * 0.4,
        10 + rng() * 14, 16 + rng() * 18, 0, 0, TAU);
      g.fill();
    }
    g.restore();
  }
  g.restore();
}

// shadow the wall casts onto the floor edge
function bakeWallFootShadow(g, rgba) {
  const d = 36;
  const mk = (x0, y0, x1, y1) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, rgba + '0.55)');
    gr.addColorStop(1, rgba + '0)');
    return gr;
  };
  g.fillStyle = mk(0, FLOOR_Y, 0, FLOOR_Y + d);
  g.fillRect(FLOOR_X, FLOOR_Y, FLOOR_W, d);
  g.fillStyle = mk(0, FLOOR_Y + FLOOR_H, 0, FLOOR_Y + FLOOR_H - d);
  g.fillRect(FLOOR_X, FLOOR_Y + FLOOR_H - d, FLOOR_W, d);
  g.fillStyle = mk(FLOOR_X, 0, FLOOR_X + d, 0);
  g.fillRect(FLOOR_X, FLOOR_Y, d, FLOOR_H);
  g.fillStyle = mk(FLOOR_X + FLOOR_W, 0, FLOOR_X + FLOOR_W - d, 0);
  g.fillRect(FLOOR_X + FLOOR_W - d, FLOOR_Y, d, FLOOR_H);
}

function bakeStoneRoom(g, rng, depth) {
  g.fillStyle = PAL.backdrop;
  g.fillRect(0, 0, W, H);
  g.fillStyle = shadeColor(PAL.wallDark, -10);   // mortar shows between bricks
  g.fillRect(8, 8, W - 16, H - 16);
  for (const side of ['N', 'S', 'W', 'E']) bakeBrickBand(g, rng, side);

  // corner seams (diagonals from screen corner to floor corner)
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(10, 10); g.lineTo(FLOOR_X, FLOOR_Y);
  g.moveTo(W - 10, 10); g.lineTo(FLOOR_X + FLOOR_W, FLOOR_Y);
  g.moveTo(10, H - 10); g.lineTo(FLOOR_X, FLOOR_Y + FLOOR_H);
  g.moveTo(W - 10, H - 10); g.lineTo(FLOOR_X + FLOOR_W, FLOOR_Y + FLOOR_H);
  g.stroke();

  // wall dressing
  if (depth >= 3 && depth <= 6) {
    const skulls = 1 + (rng() * 2 | 0);
    for (let i = 0; i < skulls; i++) {
      bakeWallSkull(g, rng, FLOOR_X + 50 + rng() * (FLOOR_W - 100),
        rng() < 0.65 ? 35 : H - 35, 12 + rng() * 5);
    }
  }
  bakeWallBlood(g, rng, 2 + (rng() * 3 | 0));
  if (rng() < 0.75) bakeCobweb(g, rng, 14, 14, 1, 1, 44 + rng() * 16);
  if (rng() < 0.75) bakeCobweb(g, rng, W - 14, 14, -1, 1, 44 + rng() * 16);

  // floor
  bakeStoneFloor(g, rng);
  bakeOrganicPatches(g, rng, 5 + (rng() * 4 | 0));
  if (depth >= 3 && depth <= 6) {
    const bones = 4 + (rng() * 5 | 0) + (depth >= 5 ? 2 : 0);
    for (let i = 0; i < bones; i++) {
      bakeBone(g, rng, FLOOR_X + 24 + rng() * (FLOOR_W - 48), FLOOR_Y + 24 + rng() * (FLOOR_H - 48));
    }
  }
  if (depth === 9) bakeEmbers(g, rng, 7 + (rng() * 5 | 0));
  if (depth === 10 || depth === 11) { bakeMarble(g, rng); bakeWindowLight(g, rng); }
  bakeCornerGrime(g, rng, 0.42);
  bakeBlood(g, rng, 1 + (rng() * 2 | 0), '74,15,9');
  bakeWallFootShadow(g, 'rgba(12,7,3,');

  g.strokeStyle = PAL.outline;
  g.lineWidth = 5;
  g.strokeRect(FLOOR_X, FLOOR_Y, FLOOR_W, FLOOR_H);
}

// ---- flesh pipeline (Womb chapters) ----
// One meandering vessel with tapering passes; cold=??? variant glows blue
function bakeVein(g, rng, x, y, cold, C, segsMax) {
  const segs = 3 + (rng() * segsMax | 0);
  const pts = [[x, y]];
  let a = rng() * TAU;
  for (let i = 0; i < segs; i++) {
    a += (rng() - 0.5) * 1.2;
    const d = 28 + rng() * 55;
    const last = pts[pts.length - 1];
    pts.push([last[0] + Math.cos(a) * d, last[1] + Math.sin(a) * d]);
  }
  const stroke = (w, style, alpha) => {
    g.strokeStyle = style;
    g.lineWidth = w;
    g.globalAlpha = alpha;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const mx = (pts[i - 1][0] + pts[i][0]) / 2, my = (pts[i - 1][1] + pts[i][1]) / 2;
      g.quadraticCurveTo(pts[i - 1][0], pts[i - 1][1], mx, my);
    }
    g.stroke();
    g.globalAlpha = 1;
  };
  if (cold) {
    stroke(10, C.veinGlow + '0.14)', 1);
    stroke(4.5, C.veinGlow + '0.5)', 1);
    stroke(1.8, C.veinCore, 0.95);
  } else {
    stroke(6.5, C.veinDark, 1);
    stroke(3, C.veinCore, 0.9);
  }
  return pts;
}

// one fleshy lobe: irregular smooth blob + crease + wet sheen
function bakeLobe(g, rng, x, y, r, C) {
  const n = 9, ring = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = r * (0.72 + rng() * 0.5);
    ring.push([x + Math.cos(a) * rr * 1.25, y + Math.sin(a) * rr * 0.9]);
  }
  g.beginPath();
  g.moveTo((ring[n - 1][0] + ring[0][0]) / 2, (ring[n - 1][1] + ring[0][1]) / 2);
  for (let i = 0; i < n; i++) {
    const nxt = ring[(i + 1) % n];
    g.quadraticCurveTo(ring[i][0], ring[i][1], (ring[i][0] + nxt[0]) / 2, (ring[i][1] + nxt[1]) / 2);
  }
  g.closePath();
  g.fillStyle = shadeColor(rng() < 0.5 ? C.lobeA : C.lobeB, Math.round((rng() - 0.5) * 20));
  g.fill();
  g.strokeStyle = C.crease;
  g.lineWidth = 2.5;
  g.globalAlpha = 0.55;
  g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = C.lobeHi;
  g.beginPath();
  g.ellipse(x - r * 0.15, y - r * 0.35, r * 0.55, r * 0.26, -0.3, 0, TAU);
  g.fill();
}

function bakeFleshRoom(g, rng, cold) {
  const C = cold ? {   // ???-like: pallid cold flesh, veins glow blue
    back: '#06060c', wall: '#2b2637', wallHi: '#3e3852', crease: '#120e1d',
    floor: '#332c40', lobeA: '#413a50', lobeB: '#4d455c',
    lobeHi: 'rgba(205,215,240,0.06)',
    veinGlow: 'rgba(110,215,255,', veinCore: '#bfeaff', veinDark: 'rgba(60,130,170,0.5)',
    pore: 'rgba(8,6,16,', blood: '46,26,66', foot: 'rgba(4,4,10,',
  } : {                // Womb: pumping warm meat
    back: '#150604', wall: '#591f19', wallHi: '#722d23', crease: '#2c0b07',
    floor: '#6e2520', lobeA: '#84332a', lobeB: '#97433a',
    lobeHi: 'rgba(255,190,170,0.10)',
    veinGlow: 'rgba(150,20,14,', veinCore: '#a92318', veinDark: 'rgba(66,10,6,0.55)',
    pore: 'rgba(30,5,3,', blood: '112,14,8', foot: 'rgba(20,4,2,',
  };
  g.fillStyle = C.back;
  g.fillRect(0, 0, W, H);
  g.fillStyle = C.wall;
  g.fillRect(8, 8, W - 16, H - 16);

  // membrane walls: overlapping bulges + creases instead of brick seams
  for (const side of ['N', 'S', 'W', 'E']) {
    g.save();
    clipPoly(g, WALL_POLYS[side]);
    const horiz = side === 'N' || side === 'S';
    const n = horiz ? 13 : 8;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      let x, y;
      if (horiz) {
        x = 8 + t * (W - 16);
        y = (side === 'N' ? 34 : H - 34) + (rng() - 0.5) * 16;
      } else {
        x = (side === 'W' ? 34 : W - 34) + (rng() - 0.5) * 16;
        y = 8 + t * (H - 16);
      }
      const r = 24 + rng() * 26;
      g.fillStyle = rng() < 0.5 ? C.wallHi : shadeColor(C.wall, Math.round(rng() * 22));
      g.globalAlpha = 0.55;
      g.beginPath();
      g.ellipse(x, y, r * 1.5, r, (rng() - 0.5) * 0.6, 0, TAU);
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = C.crease;
      g.lineWidth = 2.2;
      g.globalAlpha = 0.5;
      g.beginPath();
      g.arc(x, y + r * 0.2, r * 1.15, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
      g.globalAlpha = 1;
    }
    // wall veins + pores
    const veins = 2 + (rng() * 2 | 0);
    for (let i = 0; i < veins; i++) {
      const x = horiz ? 30 + rng() * (W - 60) : (side === 'W' ? 10 + rng() * 44 : W - 54 + rng() * 44);
      const y = horiz ? (side === 'N' ? 10 + rng() * 44 : H - 54 + rng() * 44) : 30 + rng() * (H - 60);
      bakeVein(g, rng, x, y, cold, C, 3);
    }
    for (let i = 0; i < 16; i++) {
      const px = 8 + rng() * (W - 16), py = 8 + rng() * (H - 16);
      g.fillStyle = C.pore + (0.2 + rng() * 0.25).toFixed(2) + ')';
      g.beginPath();
      g.ellipse(px, py, 1 + rng() * 2, 0.8 + rng() * 1.6, rng() * TAU, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  // floor: layered flesh lobes, no tile grid at all
  g.fillStyle = C.floor;
  g.fillRect(FLOOR_X, FLOOR_Y, FLOOR_W, FLOOR_H);
  g.save();
  clipFloor(g);
  const lobes = 17 + (rng() * 7 | 0);
  for (let i = 0; i < lobes; i++) {
    bakeLobe(g, rng, FLOOR_X + rng() * FLOOR_W, FLOOR_Y + rng() * FLOOR_H, 42 + rng() * 62, C);
  }
  // crawling vessels over the lobes
  const veins = 9 + (rng() * 5 | 0);
  for (let i = 0; i < veins; i++) {
    const pts = bakeVein(g, rng, FLOOR_X + rng() * FLOOR_W, FLOOR_Y + rng() * FLOOR_H, cold, C, 5);
    if (rng() < 0.6) {                     // short branch off a joint
      const j = pts[1 + (rng() * (pts.length - 1) | 0)];
      bakeVein(g, rng, j[0], j[1], cold, C, 2);
    }
  }
  // pores
  const pores = 60 + (rng() * 30 | 0);
  for (let i = 0; i < pores; i++) {
    const x = FLOOR_X + rng() * FLOOR_W, y = FLOOR_Y + rng() * FLOOR_H;
    const r = 1 + rng() * 2.4;
    g.fillStyle = C.pore + (0.25 + rng() * 0.3).toFixed(2) + ')';
    g.beginPath();
    g.ellipse(x, y, r, r * 0.75, rng() * TAU, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.beginPath();
    g.arc(x, y + r + 0.8, r * 0.5, 0, TAU);
    g.fill();
  }
  g.restore();

  bakeCornerGrime(g, rng, 0.5);
  bakeBlood(g, rng, 2 + (rng() * 3 | 0), C.blood);
  bakeWallFootShadow(g, C.foot);

  g.strokeStyle = PAL.outline;
  g.lineWidth = 5;
  g.strokeRect(FLOOR_X, FLOOR_Y, FLOOR_W, FLOOR_H);
}

// rocks (drawn each frame is fine, few of them)
function drawRock(g, cx, cy, seed) {
  const t = tileRect(cx, cy);
  const rng = mulberry32(seed + cx * 31 + cy * 137);
  const x = t.x + TILE / 2, y = t.y + TILE / 2;
  g.save();
  g.translate(x, y);
  // shadow
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.beginPath(); g.ellipse(0, 16, 24, 10, 0, 0, TAU); g.fill();
  // body: irregular blob
  g.beginPath();
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r = 22 + rng() * 6;
    const px = Math.cos(a) * r, py = Math.sin(a) * r * 0.85 - 4;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
  g.fillStyle = PAL.rock;
  g.fill();
  g.strokeStyle = PAL.outline;
  g.lineWidth = 3.5;
  g.stroke();
  // darker bottom
  g.fillStyle = PAL.rockDark;
  g.beginPath(); g.ellipse(0, 6, 18, 9, 0, 0, Math.PI); g.fill();
  // crack lines
  g.strokeStyle = 'rgba(40,30,20,0.55)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-8, -12); g.lineTo(-2, -4); g.lineTo(-8, 3);
  g.moveTo(8, -8); g.lineTo(12, 0);
  g.stroke();
  g.restore();
}

// ---- doors ----
// side: 'N' | 'S' | 'W' | 'E' ; state: 'open' | 'closed' | 'wall'
// kind: 'normal' | 'boss' | 'treasure'
const DOOR_POS = {
  N: { x: W / 2, y: FLOOR_Y, rot: 0 },
  S: { x: W / 2, y: FLOOR_Y + FLOOR_H, rot: Math.PI },
  W: { x: FLOOR_X, y: H / 2, rot: -Math.PI / 2 },
  E: { x: FLOOR_X + FLOOR_W, y: H / 2, rot: Math.PI / 2 },
};
// five-point star on the treasure door panels
function traceStar(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * TAU;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
}

function drawDoor(g, side, state, kind) {
  const p = DOOR_POS[side];
  g.save();
  g.translate(p.x, p.y);
  g.rotate(p.rot);
  // frame colors by kind
  let frame = '#8a7454', frameDark = '#5d4c33';
  if (kind === 'boss') { frame = '#7d1f16'; frameDark = '#4c110b'; }
  if (kind === 'treasure') { frame = '#c9a437'; frameDark = '#8a6d1d'; }
  if (kind === 'shop') { frame = '#b0783c'; frameDark = '#7a4f22'; }
  if (kind === 'curse') { frame = '#5a1220'; frameDark = '#380a12'; }
  if (kind === 'challenge') { frame = '#5f6673'; frameDark = '#3c414a'; }
  if (kind === 'secret') { frame = '#4a4238'; frameDark = '#2e2921'; }
  if (kind === 'devil') { frame = '#2a1014'; frameDark = '#160608'; }
  if (kind === 'sacrifice') { frame = '#7a4a44'; frameDark = '#4c2b26'; }

  // open door: warm light from the next room spills onto this floor
  if (state === 'open') {
    const spill = g.createRadialGradient(0, 8, 4, 0, 8, 86);
    spill.addColorStop(0, 'rgba(255,213,150,0.30)');
    spill.addColorStop(0.55, 'rgba(255,196,120,0.13)');
    spill.addColorStop(1, 'rgba(255,196,120,0)');
    g.fillStyle = spill;
    g.beginPath();
    g.ellipse(0, 26, 64, 42, 0, 0, TAU);
    g.fill();
  }

  // dark opening (into the wall; local -y is the wall side)
  g.fillStyle = '#0c0906';
  g.beginPath();
  g.moveTo(-34, 2);
  g.lineTo(-34, -30);
  g.arc(0, -30, 34, Math.PI, 0);
  g.lineTo(34, 2);
  g.closePath();
  g.fill();

  if (state === 'open') {
    // faint glow deep in the passage
    const deep = g.createRadialGradient(0, -24, 2, 0, -24, 30);
    deep.addColorStop(0, 'rgba(255,196,130,0.30)');
    deep.addColorStop(1, 'rgba(255,196,130,0)');
    g.fillStyle = deep;
    g.beginPath();
    g.ellipse(0, -22, 26, 30, 0, 0, TAU);
    g.fill();
    // both panels swung back into the passage (recessed perspective quads)
    g.strokeStyle = PAL.outline;
    g.lineWidth = 2.5;
    for (const s of [-1, 1]) {
      g.fillStyle = '#241407';
      g.beginPath();
      g.moveTo(s * 32, 1);
      g.lineTo(s * 32, -46);
      g.lineTo(s * 15, -50);
      g.lineTo(s * 15, -8);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(255,190,120,0.10)';   // lit inner edge
      g.beginPath();
      g.moveTo(s * 17, -50);
      g.lineTo(s * 15, -50);
      g.lineTo(s * 15, -8);
      g.lineTo(s * 17, -6);
      g.closePath();
      g.fill();
    }
  }

  if (state === 'closed') {
    // double door panels
    const panel = kind === 'boss' ? '#5d1810'
      : (kind === 'treasure' ? '#7a5a24'
        : (kind === 'shop' ? '#6e5426'
          : (kind === 'curse' ? '#3d1016'
            : (kind === 'devil' ? '#1c0e10'
              : (kind === 'sacrifice' ? '#5c3830'
                : (kind === 'challenge' ? '#4a5058' : '#77552f'))))));
    g.fillStyle = panel;
    g.beginPath();
    g.moveTo(-30, 1);
    g.lineTo(-30, -28);
    g.arc(0, -28, 30, Math.PI, 0);
    g.lineTo(30, 1);
    g.closePath();
    g.fill();
    g.strokeStyle = PAL.outline;
    g.lineWidth = 3;
    g.stroke();
    // vertical plank grain per panel
    g.strokeStyle = 'rgba(0,0,0,0.28)';
    g.lineWidth = 1.5;
    g.beginPath();
    for (const px of [-20, -10, 10, 20]) {
      g.moveTo(px, 0);
      g.lineTo(px, -30 - Math.sqrt(Math.max(0, 900 - px * px)) * 0.55);
    }
    g.stroke();
    // middle seam
    g.strokeStyle = PAL.outline;
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 1); g.lineTo(0, -57); g.stroke();

    if (kind === 'boss') {
      // skull painted across the two panels
      g.fillStyle = '#e3d7bd';
      g.strokeStyle = PAL.outline;
      g.lineWidth = 2.5;
      g.beginPath(); g.arc(0, -26, 11, 0, TAU); g.fill(); g.stroke();
      g.beginPath(); g.rect(-5.5, -17, 11, 6.5); g.fill(); g.stroke();
      g.fillStyle = '#17110c';
      g.beginPath();
      g.ellipse(-4.2, -28, 2.8, 3.4, 0, 0, TAU);
      g.ellipse(4.2, -28, 2.8, 3.4, 0, 0, TAU);
      g.fill();
      g.beginPath();
      g.moveTo(0, -24); g.lineTo(-1.6, -20.5); g.lineTo(1.6, -20.5);
      g.closePath(); g.fill();
    } else if (kind === 'treasure') {
      // one gold star per panel
      g.fillStyle = '#f4d03f';
      g.strokeStyle = PAL.outline;
      g.lineWidth = 2;
      traceStar(g, -14, -22, 8); g.fill(); g.stroke();
      traceStar(g, 14, -22, 8); g.fill(); g.stroke();
    } else if (kind === 'shop') {
      // one gold coin per panel
      g.strokeStyle = PAL.outline;
      g.lineWidth = 2;
      for (const sx of [-14, 14]) {
        g.fillStyle = '#e7b93c';
        g.beginPath(); g.arc(sx, -22, 7.5, 0, TAU); g.fill(); g.stroke();
        g.fillStyle = '#9c7418';
        g.font = 'bold 10px Trebuchet MS';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('¢', sx, -21);
      }
    } else if (kind === 'challenge') {
      // crossed swords painted across the panels
      g.strokeStyle = '#d8d2c4';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-12, -36); g.lineTo(10, -12);
      g.moveTo(12, -36); g.lineTo(-10, -12);
      g.stroke();
      g.strokeStyle = '#8a7454';
      g.lineWidth = 3.5;
      g.beginPath();
      g.moveTo(-15, -18); g.lineTo(-7, -18);
      g.moveTo(7, -18); g.lineTo(15, -18);
      g.stroke();
    } else {
      // iron studs
      g.fillStyle = '#1d150c';
      g.strokeStyle = 'rgba(255,240,210,0.18)';
      g.lineWidth = 1;
      for (const [sx, sy] of [[-19, -12], [-9, -34], [-19, -40], [19, -12], [9, -34], [19, -40]]) {
        g.beginPath(); g.arc(sx, sy, 2.6, 0, TAU); g.fill(); g.stroke();
      }
    }
  }

  // arch frame
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  g.fillStyle = frame;
  g.beginPath();
  g.moveTo(-44, 4);
  g.lineTo(-44, -32);
  g.arc(0, -32, 44, Math.PI, 0);
  g.lineTo(44, 4);
  g.lineTo(34, 4);
  g.lineTo(34, -30);
  g.arc(0, -30, 34, 0, Math.PI, true);
  g.lineTo(-34, 4);
  g.closePath();
  g.fill();
  g.stroke();
  // voussoir seams radiating through the arch ring
  g.strokeStyle = 'rgba(0,0,0,0.38)';
  g.lineWidth = 2;
  g.beginPath();
  for (let i = 1; i < 6; i++) {
    const a = Math.PI + (i / 6) * Math.PI;
    g.moveTo(Math.cos(a) * 34, -31 + Math.sin(a) * 34);
    g.lineTo(Math.cos(a) * 44, -31 + Math.sin(a) * 44);
  }
  // jamb seams on the vertical legs
  for (const s of [-1, 1]) {
    g.moveTo(s * 34, -16); g.lineTo(s * 44, -16);
    g.moveTo(s * 34, -2); g.lineTo(s * 44, -2);
  }
  g.stroke();
  // frame shading
  g.fillStyle = frameDark;
  g.beginPath();
  g.moveTo(-44, 4); g.lineTo(-44, -10); g.lineTo(-34, -10); g.lineTo(-34, 4); g.closePath();
  g.moveTo(44, 4); g.lineTo(44, -10); g.lineTo(34, -10); g.lineTo(34, 4); g.closePath();
  g.fill();

  if (kind === 'boss') {
    // skull mark on top of arch
    g.fillStyle = '#e8ddc8';
    g.beginPath(); g.arc(0, -52, 9, 0, TAU); g.fill();
    g.strokeStyle = PAL.outline; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#17110c';
    g.beginPath(); g.arc(-3.5, -54, 2.5, 0, TAU); g.arc(3.5, -54, 2.5, 0, TAU); g.fill();
    g.fillRect(-4, -47, 8, 3);
  } else if (kind === 'treasure') {
    // crown mark
    g.fillStyle = '#f4d03f';
    g.strokeStyle = PAL.outline; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-10, -46); g.lineTo(-10, -54); g.lineTo(-5, -49); g.lineTo(0, -56); g.lineTo(5, -49); g.lineTo(10, -54); g.lineTo(10, -46);
    g.closePath(); g.fill(); g.stroke();
  } else if (kind === 'curse') {
    // spikes in the doorway — crossing them costs half a heart either way
    g.fillStyle = '#b8b2a4';
    g.strokeStyle = PAL.outline;
    g.lineWidth = 2;
    for (const sx of [-24, -8, 8, 24]) {
      g.beginPath();
      g.moveTo(sx - 6, 4);
      g.lineTo(sx, -14);
      g.lineTo(sx + 6, 4);
      g.closePath();
      g.fill(); g.stroke();
    }
  }
  g.restore();
}

// blood stains on floor
function drawStain(g, s) {
  g.save();
  g.globalAlpha = 0.7;
  g.fillStyle = s.color || PAL.blood;
  const rng = mulberry32(s.seed);
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.ellipse(s.x + (rng() - 0.5) * s.r * 1.6, s.y + (rng() - 0.5) * s.r * 1.2,
      s.r * (0.25 + rng() * 0.45), s.r * (0.2 + rng() * 0.35), rng() * TAU, 0, TAU);
    g.fill();
  }
  g.restore();
}

