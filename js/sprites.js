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
    const panel = kind === 'boss' ? '#5d1810' : (kind === 'treasure' ? '#7a5a24' : '#77552f');
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

// ================= DODO (player) =================
// o: {walk, moving, aimX, aimY, hurtFlash, headColor, eyeColor, hat, big,
//     blink, wings, wingGrow, flap, dirX, dirY}
// Strictly follows 全身-走路-白底.png: one giant head walking on two
// outlined legs with chunky white boots — no torso, no arms; a C-ring ear
// on each side; a short tilted antenna with a round knob; two solid dot
// eyes (left bigger); a single thick smile stroke with bare round ends.
function drawDodo(g, x, y, o) {
  const moving = o.moving;
  const swing = moving ? Math.sin(o.walk) : 0;
  const bob = moving ? Math.abs(Math.sin(o.walk)) * 2.5 : 0;
  const scale = o.big ? 1.18 : 1;
  const headColor = o.hurtFlash ? '#ff9d94' : (o.headColor || '#ffffff');
  // with wings dodo hovers: body lifts off, shadow shrinks under it
  const hover = o.wings ? 4 + Math.sin((o.flap || 0) * 0.8) * 2 : 0;
  g.save();
  g.translate(x, y);
  // shadow
  g.fillStyle = o.wings ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(0, 28, 20 * scale * (o.wings ? 0.85 : 1), 8, 0, 0, TAU); g.fill();
  g.scale(scale, scale);
  g.translate(0, -bob - hover);

  g.lineCap = 'round';
  g.lineJoin = 'round';

  // item aura glows behind the whole body
  if (o.aura) {
    g.save();
    g.globalAlpha = 0.75;
    g.fillStyle = o.aura;
    g.beginPath(); g.ellipse(0, -8, 32, 30, 0, 0, TAU); g.fill();
    g.restore();
  }

  // ---- wings (flight item): drawn behind legs & head ----
  if (o.wings) drawDodoWings(g, o, headColor);

  // ---- legs: outlined white tubes ending in big white boots ----
  // Each limb is a black stroke with a lighter core stroke on top,
  // producing the outlined doodle look of the reference. No torso, no arms.
  const strokeLimb = (pts, color, lw) => {
    g.strokeStyle = color; g.lineWidth = lw;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.stroke();
  };
  const drawLeg = (leg, foot) => {
    strokeLimb(leg, PAL.outline, 7.5);
    strokeLimb(foot, PAL.outline, 13.5);
    strokeLimb(leg, headColor, 3.2);
    strokeLimb(foot, headColor, 8);
  };
  // back (right) leg: bent at the knee, boot pointing left
  const kneeR = [13 - swing * 2.5, 13.5];
  const ankleR = [11 - swing * 7, 23.5 - Math.abs(swing)];
  drawLeg([[7, 2], kneeR, ankleR], [ankleR, [ankleR[0] - 8.5, ankleR[1] + 1.5]]);
  // front (left) leg: straight long stride, big boot pointing down-left
  const ankleL = [-13 + swing * 7, 23 - Math.abs(swing) * 1.5];
  drawLeg([[-6, 2], ankleL], [ankleL, [ankleL[0] - 9, ankleL[1] + 4]]);

  // ---- C-ring ears on both sides (drawn behind the head so the head
  // outline slices them into crescents, as in the reference) ----
  g.fillStyle = headColor;
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  g.beginPath(); g.ellipse(-24.5, -12.7, 6.2, 6.8, -0.2, 0, TAU); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(24.5, -8, 6.0, 6.6, 0.2, 0, TAU); g.fill(); g.stroke();

  // ---- head: giant, wider than tall, extra-thick outline ----
  g.save();
  g.rotate(-0.05);
  g.fillStyle = headColor;
  g.strokeStyle = PAL.outline;
  g.lineWidth = 5.5;
  g.beginPath();
  g.ellipse(0, -12, 23, 18.7, 0, 0, TAU);
  g.fill();
  g.stroke();
  g.restore();

  // ---- antenna: short thick stem leaning right + small round knob ----
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4.2;
  g.beginPath();
  g.moveTo(0.5, -28);
  g.lineTo(3.5, -38.5);
  g.stroke();
  g.fillStyle = PAL.outline;
  g.beginPath();
  g.ellipse(4.3, -41, 4.3, 3.3, -0.35, 0, TAU);
  g.fill();

  // ---- face: two solid dot eyes — left bigger and higher; follow aim.
  // While a tear is leaving, both eyes squeeze shut (blink) ----
  const ax = clamp(o.aimX || 0, -1, 1) * 3;
  const ay = clamp(o.aimY || 0, -1, 1) * 2.5;
  if (o.blink) {
    g.strokeStyle = o.eyeColor || '#17110c';
    g.lineWidth = 2.8;
    g.beginPath();
    g.moveTo(-12.2 + ax, -18.5 + ay);
    g.quadraticCurveTo(-9 + ax, -16 + ay, -5.8 + ax, -18.5 + ay);
    g.moveTo(0 + ax, -17 + ay);
    g.quadraticCurveTo(2.5 + ax, -15 + ay, 5 + ax, -17 + ay);
    g.stroke();
  } else {
    g.fillStyle = o.eyeColor || '#17110c';
    g.beginPath();
    g.ellipse(-9 + ax, -18.5 + ay, 3.2, 4.1, -0.15, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(2.5 + ax, -17 + ay, 2.5, 3.2, 0.12, 0, TAU);
    g.fill();
  }
  // ---- mouth: one thick smile arc, bare round ends (no end knob) ----
  g.strokeStyle = PAL.outline;
  g.lineWidth = 3.8;
  if (o.hurtFlash) {
    g.beginPath(); g.arc(3 + ax, -9 + ay, 4.5, 0, TAU); g.stroke();
  } else {
    g.beginPath();
    g.arc(3.2 + ax, -16.5 + ay, 10.3, 0.14 * Math.PI, 0.62 * Math.PI);
    g.stroke();
  }

  // hat / crown (item appearance)
  if (o.hat === 'crown') {
    g.fillStyle = '#f4d03f';
    g.strokeStyle = PAL.outline;
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(-13, -32); g.lineTo(-13, -44) ; g.lineTo(-6, -37); g.lineTo(0, -46); g.lineTo(6, -37); g.lineTo(13, -44); g.lineTo(13, -32);
    g.closePath(); g.fill(); g.stroke();
  }
  if (o.hat === 'halo') {
    g.strokeStyle = '#f7e463';
    g.lineWidth = 4;
    g.beginPath(); g.ellipse(0, -47, 14, 4.5, 0, 0, TAU); g.stroke();
  }
  g.restore();
}

// Flight wings. The facing (dirX/dirY) is quantized to 8 directions and each
// octant gets its own pose: facing away spreads both wings wide (you see the
// back), facing the camera tucks them, and side/diagonal facings enlarge the
// trailing wing while shrinking the leading one. wingGrow (1 → 0) plays the
// sprout-in animation right after the item is taken.
function drawDodoWings(g, o, headColor) {
  const grow = clamp(1 - (o.wingGrow || 0), 0, 1);
  const wScale = grow * (1 + 0.3 * Math.sin(grow * Math.PI));   // pop overshoot
  if (wScale < 0.04) return;
  let qx = 0, qy = 1;
  if (Math.hypot(o.dirX || 0, o.dirY || 0) > 0.01) {
    const oct = Math.round(Math.atan2(o.dirY, o.dirX) / (Math.PI / 4)) * (Math.PI / 4);
    qx = Math.sign(Math.round(Math.cos(oct) * 10));
    qy = Math.sign(Math.round(Math.sin(oct) * 10));
  }
  const flap = Math.sin(o.flap != null ? o.flap : o.walk * 1.2) * (o.moving ? 0.55 : 0.32);
  const spread = qy < 0 ? 1.22 : (qy > 0 ? 0.9 : 1.05);
  const lift = qy < 0 ? -5 : 0;
  for (const side of [-1, 1]) {
    const faceMul = qx === 0 ? 1 : (side === -qx ? 1.18 : 0.72);
    g.save();
    g.translate(side * 15, -16 + lift);
    g.scale(side * spread * faceMul * wScale, spread * wScale);
    g.rotate(-0.2 - flap * 0.5);
    g.fillStyle = headColor;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 3.4;
    g.beginPath();
    g.moveTo(2, 3);
    g.quadraticCurveTo(15, -13 - flap * 9, 30, -9 - flap * 14);
    g.quadraticCurveTo(23, -2, 27, 3 - flap * 8);
    g.quadraticCurveTo(19, 6, 21, 11 - flap * 5);
    g.quadraticCurveTo(9, 12, 2, 8);
    g.closePath();
    g.fill(); g.stroke();
    // feather separations
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(6, 4); g.quadraticCurveTo(14, 0, 23, -5 - flap * 10);
    g.moveTo(6, 7); g.quadraticCurveTo(13, 6, 19, 3 - flap * 6);
    g.stroke();
    g.restore();
  }
}

// ================= TEARS =================
function drawTear(g, t) {
  g.save();
  // shadow on floor
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath(); g.ellipse(t.x, t.y + 14, t.r * 0.9, t.r * 0.4, 0, 0, TAU); g.fill();
  // tear body
  g.fillStyle = t.color || PAL.tear;
  g.strokeStyle = t.outline || PAL.tearOutline;
  g.lineWidth = 2.5;
  g.beginPath(); g.arc(t.x, t.y, t.r, 0, TAU); g.fill(); g.stroke();
  // highlight
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.arc(t.x - t.r * 0.35, t.y - t.r * 0.35, t.r * 0.28, 0, TAU); g.fill();
  g.restore();
}

function drawEnemyShot(g, s) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath(); g.ellipse(s.x, s.y + 12, s.r * 0.9, s.r * 0.4, 0, 0, TAU); g.fill();
  g.fillStyle = '#b3241a';
  g.strokeStyle = '#5c0f09';
  g.lineWidth = 2.5;
  g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,160,150,0.8)';
  g.beginPath(); g.arc(s.x - s.r * 0.3, s.y - s.r * 0.3, s.r * 0.25, 0, TAU); g.fill();
  g.restore();
}

// ================= ENEMIES =================
function drawGaper(g, e) {
  const bob = Math.abs(Math.sin(e.anim * 6)) * 2;
  g.save();
  g.translate(e.x, e.y);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(0, 22, 18, 7, 0, 0, TAU); g.fill();
  g.translate(0, -bob);
  g.lineCap = 'round';

  // shuffling legs
  const swing = Math.sin(e.anim * 6) * 5;
  g.strokeStyle = PAL.outline;
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(-6, 8); g.lineTo(-6 + swing, 20);
  g.moveTo(6, 8); g.lineTo(6 - swing, 20);
  g.stroke();

  // body blob
  const skin = e.flash > 0 ? '#ffffff' : PAL.gaper;
  g.fillStyle = skin;
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  g.beginPath(); g.ellipse(0, 2, 13, 11, 0, 0, TAU); g.fill(); g.stroke();

  // head
  g.beginPath(); g.ellipse(0, -14, 18, 17, 0, 0, TAU); g.fill(); g.stroke();

  // hollow black eyes (dripping)
  g.fillStyle = '#141010';
  g.beginPath();
  g.ellipse(-7, -17, 4.5, 6, 0, 0, TAU);
  g.ellipse(7, -17, 4.5, 6, 0, 0, TAU);
  g.fill();
  // gaping mouth with blood
  g.fillStyle = '#4a0d08';
  g.beginPath(); g.ellipse(0, -4, 6.5, 7.5, 0, 0, TAU); g.fill();
  g.strokeStyle = PAL.outline; g.lineWidth = 2.5; g.stroke();
  g.fillStyle = PAL.blood;
  g.beginPath();
  g.moveTo(-5, -1); g.quadraticCurveTo(-4, 6, -6, 9); g.quadraticCurveTo(-8, 5, -8, 0);
  g.closePath(); g.fill();
  g.restore();
}

function drawFly(g, e) {
  const bz = Math.sin(e.anim * 14) * 3;
  g.save();
  g.translate(e.x, e.y + bz);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.ellipse(0, 16 - bz, 8, 3.5, 0, 0, TAU); g.fill();
  // wings
  const wf = Math.sin(e.anim * 40) * 0.6;
  g.fillStyle = 'rgba(220,225,235,0.75)';
  g.strokeStyle = 'rgba(40,40,50,0.8)';
  g.lineWidth = 1.5;
  g.save(); g.rotate(-0.5 + wf);
  g.beginPath(); g.ellipse(-9, -6, 8, 4, -0.5, 0, TAU); g.fill(); g.stroke();
  g.restore();
  g.save(); g.rotate(0.5 - wf);
  g.beginPath(); g.ellipse(9, -6, 8, 4, 0.5, 0, TAU); g.fill(); g.stroke();
  g.restore();
  // body
  g.fillStyle = e.flash > 0 ? '#fff' : '#2b2622';
  g.strokeStyle = PAL.outline;
  g.lineWidth = 3;
  g.beginPath(); g.arc(0, 0, 8.5, 0, TAU); g.fill(); g.stroke();
  // red eyes
  g.fillStyle = '#c92f1f';
  g.beginPath(); g.arc(-3, -1, 2.2, 0, TAU); g.arc(3, -1, 2.2, 0, TAU); g.fill();
  g.restore();
}

function drawSpitter(g, e) {
  const bz = Math.sin(e.anim * 8) * 4;
  g.save();
  g.translate(e.x, e.y + bz);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.ellipse(0, 20 - bz, 14, 6, 0, 0, TAU); g.fill();
  // round fat body
  const skin = e.flash > 0 ? '#fff' : '#c98f8f';
  g.fillStyle = skin;
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  g.beginPath(); g.ellipse(0, 0, 17, 15, 0, 0, TAU); g.fill(); g.stroke();
  // small wings
  const wf = Math.sin(e.anim * 30) * 0.5;
  g.fillStyle = 'rgba(230,220,220,0.8)';
  g.strokeStyle = 'rgba(60,40,40,0.8)';
  g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(-16, -8 + wf * 4, 7, 3.5, -0.6, 0, TAU); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(16, -8 - wf * 4, 7, 3.5, 0.6, 0, TAU); g.fill(); g.stroke();
  // single big eye
  g.fillStyle = '#f5efe4';
  g.beginPath(); g.arc(0, -4, 6.5, 0, TAU); g.fill();
  g.strokeStyle = PAL.outline; g.lineWidth = 2.5; g.stroke();
  g.fillStyle = '#17110c';
  g.beginPath(); g.arc(e.eyeX || 0, -4 + (e.eyeY || 0), 3, 0, TAU); g.fill();
  // puckered mouth (charging -> open)
  const open = e.charge > 0.7 ? 5.5 : 2.5;
  g.fillStyle = '#4a0d08';
  g.beginPath(); g.ellipse(0, 7, open, open * 0.8, 0, 0, TAU); g.fill();
  g.strokeStyle = PAL.outline; g.lineWidth = 2; g.stroke();
  g.restore();
}

function drawHopper(g, e) {
  // small jumping enemy
  const air = e.z || 0;
  g.save();
  g.translate(e.x, e.y);
  g.fillStyle = 'rgba(0,0,0,0.28)';
  const shScale = 1 - clamp(air / 60, 0, 0.6);
  g.beginPath(); g.ellipse(0, 18, 14 * shScale, 6 * shScale, 0, 0, TAU); g.fill();
  g.translate(0, -air);
  const squash = e.squash || 0;
  g.scale(1 + squash * 0.35, 1 - squash * 0.3);
  const skin = e.flash > 0 ? '#fff' : '#9dbb72';
  g.fillStyle = skin;
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  // body
  g.beginPath(); g.ellipse(0, 0, 14, 13, 0, 0, TAU); g.fill(); g.stroke();
  // legs folded
  g.lineWidth = 3.5;
  g.beginPath();
  g.moveTo(-10, 8); g.quadraticCurveTo(-16, 12, -12, 16);
  g.moveTo(10, 8); g.quadraticCurveTo(16, 12, 12, 16);
  g.stroke();
  // eyes
  g.fillStyle = '#17110c';
  g.beginPath(); g.ellipse(-5, -3, 2.5, 3.5, 0, 0, TAU); g.ellipse(5, -3, 2.5, 3.5, 0, 0, TAU); g.fill();
  // frown
  g.strokeStyle = PAL.outline; g.lineWidth = 2.5;
  g.beginPath(); g.arc(0, 9, 5, 1.2 * Math.PI, 1.8 * Math.PI); g.stroke();
  g.restore();
}

// rooted turret: a fleshy stump with a rotating cross of eyes
function drawSentry(g, e) {
  g.save();
  g.translate(e.x, e.y);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(0, 20, 18, 7, 0, 0, TAU); g.fill();
  const skin = e.flash > 0 ? '#fff' : '#b9a2c4';
  // stone base
  g.fillStyle = '#8d8371';
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(-16, 18); g.lineTo(-11, 4); g.lineTo(11, 4); g.lineTo(16, 18);
  g.closePath(); g.fill(); g.stroke();
  // bulb
  g.fillStyle = skin;
  g.beginPath(); g.ellipse(0, -6, 16, 15, 0, 0, TAU); g.fill(); g.stroke();
  // four muzzles spinning with e.spin
  g.save();
  g.translate(0, -6);
  g.rotate(e.spin || 0);
  const charge = clamp((e.charge || 0) / 0.7, 0, 1);
  for (let i = 0; i < 4; i++) {
    g.rotate(TAU / 4);
    g.fillStyle = '#4a0d08';
    g.strokeStyle = PAL.outline;
    g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(13, 0, 4.5 + charge * 2, 3.5 + charge * 1.5, 0, 0, TAU); g.fill(); g.stroke();
  }
  g.restore();
  // single angry eye that reddens while charging
  g.fillStyle = '#f5efe4';
  g.beginPath(); g.arc(0, -8, 6, 0, TAU); g.fill();
  g.strokeStyle = PAL.outline; g.lineWidth = 2.5; g.stroke();
  g.fillStyle = charge > 0.4 ? '#c9231a' : '#17110c';
  g.beginPath(); g.arc(0, -8, 3, 0, TAU); g.fill();
  g.restore();
}

// Boom Fly: fat red fly, glows hotter the lower its hp gets
function drawBoomfly(g, e) {
  const bz = Math.sin(e.anim * 12) * 3;
  g.save();
  g.translate(e.x, e.y + bz);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.ellipse(0, 18 - bz, 10, 4.5, 0, 0, TAU); g.fill();
  const wf = Math.sin(e.anim * 38) * 0.6;
  g.fillStyle = 'rgba(230,215,215,0.75)';
  g.strokeStyle = 'rgba(50,30,30,0.8)';
  g.lineWidth = 1.5;
  g.save(); g.rotate(-0.5 + wf);
  g.beginPath(); g.ellipse(-11, -7, 9, 4.5, -0.5, 0, TAU); g.fill(); g.stroke();
  g.restore();
  g.save(); g.rotate(0.5 - wf);
  g.beginPath(); g.ellipse(11, -7, 9, 4.5, 0.5, 0, TAU); g.fill(); g.stroke();
  g.restore();
  g.fillStyle = e.flash > 0 ? '#fff' : '#a3231a';
  g.strokeStyle = PAL.outline;
  g.lineWidth = 3.5;
  g.beginPath(); g.arc(0, 0, 11.5, 0, TAU); g.fill(); g.stroke();
  // pulsing fuse glow
  g.fillStyle = 'rgba(255,180,60,' + (0.35 + 0.3 * Math.abs(Math.sin(e.anim * 7))) + ')';
  g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill();
  g.fillStyle = '#17110c';
  g.beginPath(); g.arc(-3.5, -2, 2, 0, TAU); g.arc(3.5, -2, 2, 0, TAU); g.fill();
  g.restore();
}

// Globin: dripping red glob; while reforming it's just a puddle
function drawGlobin(g, e) {
  g.save();
  g.translate(e.x, e.y);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(0, 20, 17, 6.5, 0, 0, TAU); g.fill();
  const skin = e.flash > 0 ? '#fff' : '#b3372a';
  if (e.pile > 0) {
    // reforming puddle bubbles up as the timer runs out
    const k = clamp(1 - e.pile / 2.2, 0, 1);
    g.fillStyle = skin;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 3.5;
    g.beginPath(); g.ellipse(0, 14, 17, 6 + k * 5, 0, 0, TAU); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(-4, 10 - k * 6, 6 + k * 5, 4 + k * 5, 0, 0, TAU); g.fill(); g.stroke();
    g.restore();
    return;
  }
  const wob = Math.sin(e.anim * 5) * 2;
  g.fillStyle = skin;
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  g.beginPath(); g.ellipse(0, 4, 12, 9 + wob * 0.4, 0, 0, TAU); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(0, -10, 15, 14, 0, 0, TAU); g.fill(); g.stroke();
  // drips
  g.fillStyle = '#7a1f12';
  g.beginPath();
  g.moveTo(-8, 0); g.quadraticCurveTo(-7, 8, -9, 12); g.quadraticCurveTo(-11, 7, -11, 1);
  g.closePath(); g.fill();
  g.fillStyle = '#2a0b06';
  g.beginPath();
  g.ellipse(-6, -12, 3.5, 5, 0, 0, TAU);
  g.ellipse(6, -12, 3.5, 5, 0, 0, TAU);
  g.fill();
  g.fillStyle = '#4a0d08';
  g.beginPath(); g.ellipse(0, -2, 5, 4, 0, 0, TAU); g.fill();
  g.restore();
}

// Knight: armored helmet facing the player, shield reads as the hard side
function drawKnight(g, e) {
  g.save();
  g.translate(e.x, e.y);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(0, 20, 17, 7, 0, 0, TAU); g.fill();
  const face = Math.atan2(e.faceY || 1, e.faceX || 0);
  // body
  const skin = e.flash > 0 ? '#fff' : '#8f96a3';
  g.fillStyle = skin;
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  g.beginPath(); g.ellipse(0, 2, 13, 12, 0, 0, TAU); g.fill(); g.stroke();
  // helmet head
  g.fillStyle = e.flash > 0 ? '#fff' : '#aeb6c4';
  g.beginPath(); g.ellipse(0, -12, 15, 14, 0, 0, TAU); g.fill(); g.stroke();
  // visor slit rotated toward facing
  g.save();
  g.translate(0, -12);
  g.rotate(face);
  g.fillStyle = '#17110c';
  g.fillRect(4, -6, 7, 12);
  g.fillStyle = '#c9231a';
  g.fillRect(6, -3, 3.5, 6);
  // frontal shield plate
  g.strokeStyle = '#d8dde6';
  g.lineWidth = 5;
  g.beginPath(); g.arc(0, 0, 18, -0.85, 0.85); g.stroke();
  g.strokeStyle = PAL.outline;
  g.lineWidth = 1.5;
  g.beginPath(); g.arc(0, 0, 20.5, -0.85, 0.85); g.stroke();
  g.restore();
  // plume
  g.fillStyle = '#c9231a';
  g.beginPath(); g.ellipse(0, -27, 4, 6 + Math.sin(e.anim * 4) * 1.5, 0, 0, TAU); g.fill();
  g.restore();
}

// Vis: pale slug with one huge eye that burns purple while charging
function drawVis(g, e) {
  g.save();
  g.translate(e.x, e.y);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(0, 18, 18, 7, 0, 0, TAU); g.fill();
  const skin = e.flash > 0 ? '#fff' : '#cbb8d8';
  g.fillStyle = skin;
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  const sq = e.charging > 0 ? Math.sin(e.anim * 18) * 0.04 : 0;
  g.save();
  g.scale(1 + sq, 1 - sq);
  g.beginPath(); g.ellipse(0, 0, 17, 15, 0, 0, TAU); g.fill(); g.stroke();
  g.restore();
  // folds
  g.strokeStyle = 'rgba(80,60,90,0.4)';
  g.lineWidth = 3;
  g.beginPath(); g.arc(0, 6, 11, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  // the eye: purple glow ramps up while a laser charges
  const chg = clamp((e.charging || 0) / 1.35, 0, 1);
  g.fillStyle = '#f5efe4';
  g.beginPath(); g.arc(0, -3, 8, 0, TAU); g.fill();
  g.strokeStyle = PAL.outline; g.lineWidth = 2.5; g.stroke();
  g.fillStyle = chg > 0 ? '#a85ceb' : '#2a2030';
  g.beginPath(); g.arc(0, -3, 3.5 + chg * 2.5, 0, TAU); g.fill();
  if (chg > 0) {
    g.globalAlpha = 0.35 + 0.3 * Math.abs(Math.sin(e.anim * 16));
    g.fillStyle = '#b06cf0';
    g.beginPath(); g.arc(0, -3, 11 + chg * 5, 0, TAU); g.fill();
    g.globalAlpha = 1;
  }
  g.restore();
}

// enemy lasers are purple on purpose: the player's Brimstone beam is red,
// so hostile beams must never read as the player's own shot
const ENEMY_LASER = {
  bright: 'rgba(196,130,255,0.95)',
  fade: 'rgba(90,40,150,0.12)',
  core: 'rgba(240,225,255,0.9)',
  glow: '#5b2a8e',
  warn: 'rgba(168,92,235,',
};

// hitscan beam: hot core with a soft glow, fades over its short life
function drawBeam(g, b) {
  const a = clamp(b.life / b.maxLife, 0, 1);
  g.save();
  g.translate(b.x, b.y);
  g.rotate(b.angle);
  // Godhead trail: a faint smouldering band left where the beam passed
  if (b.trail) {
    const flick = 0.5 + 0.5 * Math.abs(Math.sin(b.life * 26));
    g.globalAlpha = a * 0.35 * flick;
    g.fillStyle = '#f0b23c';
    g.fillRect(0, -b.w * 0.4, b.len, b.w * 0.8);
    g.globalAlpha = a * 0.25;
    g.fillStyle = '#8e1b12';
    g.fillRect(0, -b.w * 0.2, b.len, b.w * 0.4);
    g.restore();
    return;
  }
  g.globalAlpha = a;
  const w = b.w * (0.7 + a * 0.3);
  const grad = g.createLinearGradient(0, 0, b.len, 0);
  if (b.friendly && b.crit) {
    // crit beams flash gold, matching the golden crit tears
    grad.addColorStop(0, 'rgba(255,222,120,0.95)');
    grad.addColorStop(1, 'rgba(180,120,20,0.15)');
  } else if (b.friendly) {
    grad.addColorStop(0, 'rgba(255,120,110,0.95)');
    grad.addColorStop(1, 'rgba(140,20,14,0.15)');
  } else {
    grad.addColorStop(0, ENEMY_LASER.bright);
    grad.addColorStop(1, ENEMY_LASER.fade);
  }
  g.fillStyle = grad;
  g.fillRect(0, -w / 2, b.len, w);
  g.fillStyle = b.friendly ? (b.crit ? 'rgba(255,250,220,0.95)' : 'rgba(255,240,230,0.9)') : ENEMY_LASER.core;
  g.fillRect(0, -w * 0.18, b.len, w * 0.36);
  g.globalAlpha = a * 0.5;
  g.fillStyle = b.friendly ? (b.crit ? '#8a6a10' : '#5c0f09') : ENEMY_LASER.glow;
  g.beginPath(); g.arc(0, 0, w * 0.9, 0, TAU); g.fill();
  g.restore();
}

// sustained enemy laser: dashed warning line while warming, then a fat
// pulsing purple beam that stays on screen and sweeps
function drawLaser(g, l) {
  g.save();
  g.translate(l.x, l.y);
  g.rotate(l.angle);
  if (l.warm > 0) {
    g.setLineDash([12, 9]);
    g.strokeStyle = ENEMY_LASER.warn + (0.35 + 0.4 * Math.abs(Math.sin(l.anim * 14))) + ')';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(l.len, 0); g.stroke();
    g.setLineDash([]);
  } else {
    const w = l.w * (0.85 + 0.15 * Math.sin(l.anim * 22));
    const grad = g.createLinearGradient(0, 0, l.len, 0);
    grad.addColorStop(0, ENEMY_LASER.bright);
    grad.addColorStop(1, 'rgba(110,50,180,0.35)');
    g.fillStyle = grad;
    g.fillRect(0, -w / 2, l.len, w);
    g.fillStyle = ENEMY_LASER.core;
    g.fillRect(0, -w * 0.2, l.len, w * 0.4);
    // muzzle glow
    g.globalAlpha = 0.6;
    g.fillStyle = ENEMY_LASER.glow;
    g.beginPath(); g.arc(0, 0, w * 1.1, 0, TAU); g.fill();
  }
  g.restore();
}

// orbiting tear
function drawOrbital(g, o) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.beginPath(); g.ellipse(o.x, o.y + 12, 7, 3, 0, 0, TAU); g.fill();
  g.fillStyle = '#dcecfb';
  g.strokeStyle = '#8fb2d6';
  g.lineWidth = 2.5;
  g.beginPath(); g.arc(o.x, o.y, 8, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.arc(o.x - 2.5, o.y - 2.5, 2.5, 0, TAU); g.fill();
  g.restore();
}

// little friend: a floating baby head that spits tears
function drawFamiliar(g, f) {
  const bob = Math.sin(f.anim * 3) * 3;
  g.save();
  g.translate(f.x, f.y + bob);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.ellipse(0, 16 - bob, 10, 4, 0, 0, TAU); g.fill();
  g.fillStyle = '#f7f3e9';
  g.strokeStyle = PAL.outline;
  g.lineWidth = 3.5;
  g.beginPath(); g.ellipse(0, 0, 12, 11, 0, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = '#17110c';
  g.beginPath();
  g.ellipse(-4, -2, 2, 2.8, 0, 0, TAU);
  g.ellipse(4, -2, 2, 2.8, 0, 0, TAU);
  g.fill();
  g.strokeStyle = PAL.outline;
  g.lineWidth = 2;
  g.beginPath(); g.arc(0, 4, 4, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  g.restore();
}

// ================= PICKUPS & ITEMS =================
function drawHeartShape(g, x, y, s, fill, outline) {
  g.save();
  g.translate(x, y);
  g.scale(s / 20, s / 20);
  g.beginPath();
  g.moveTo(0, 6);
  g.bezierCurveTo(-2, 0, -10, -4, -10, -10);
  g.bezierCurveTo(-10, -16, -3, -17, 0, -11);
  g.bezierCurveTo(3, -17, 10, -16, 10, -10);
  g.bezierCurveTo(10, -4, 2, 0, 0, 6);
  g.bezierCurveTo(0, 8, 0, 10, 0, 12);
  g.lineTo(0, 12);
  g.closePath();
  // simpler: classic heart
  g.beginPath();
  g.moveTo(0, 12);
  g.bezierCurveTo(-12, 2, -12, -8, -6, -10);
  g.bezierCurveTo(-2, -12, 0, -8, 0, -6);
  g.bezierCurveTo(0, -8, 2, -12, 6, -10);
  g.bezierCurveTo(12, -8, 12, 2, 0, 12);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (outline) { g.strokeStyle = outline; g.lineWidth = 3; g.stroke(); }
  g.restore();
}

function drawPickup(g, p) {
  const bob = Math.sin(p.anim * 4) * 2;
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.ellipse(p.x, p.y + 12, 10, 4, 0, 0, TAU); g.fill();
  g.translate(0, bob);
  if (p.kind === 'heart') {
    drawHeartShape(g, p.x, p.y, 13, '#c9231a', PAL.outline);
  } else if (p.kind === 'halfheart') {
    drawHeartShape(g, p.x, p.y, 9, '#c9231a', PAL.outline);
  } else if (p.kind === 'coin') {
    g.fillStyle = '#e7b93c';
    g.strokeStyle = PAL.outline;
    g.lineWidth = 3;
    g.beginPath(); g.arc(p.x, p.y, 9, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#9c7418';
    g.font = 'bold 11px Trebuchet MS';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('¢', p.x, p.y + 1);
  } else if (p.kind === 'chest') {
    g.save();
    g.translate(p.x, p.y);
    g.fillStyle = '#8a5a2b';
    g.strokeStyle = PAL.outline;
    g.lineWidth = 3.5;
    // base
    g.beginPath();
    g.rect(-16, -6, 32, 16);
    g.fill(); g.stroke();
    // lid
    g.fillStyle = '#a3702f';
    g.beginPath();
    g.moveTo(-16, -6);
    g.quadraticCurveTo(0, -20, 16, -6);
    g.closePath();
    g.fill(); g.stroke();
    // lock
    g.fillStyle = '#e7b93c';
    g.beginPath(); g.rect(-4, -8, 8, 8); g.fill(); g.stroke();
    g.restore();
  }
  g.restore();
}

// item pedestal with floating item
function drawPedestal(g, it) {
  g.save();
  g.translate(it.x, it.y);
  // pedestal stone
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(0, 18, 22, 8, 0, 0, TAU); g.fill();
  g.fillStyle = '#b0a58d';
  g.strokeStyle = PAL.outline;
  g.lineWidth = 3.5;
  g.beginPath();
  g.moveTo(-18, 14); g.lineTo(-12, 2); g.lineTo(12, 2); g.lineTo(18, 14);
  g.closePath();
  g.fill(); g.stroke();
  g.fillStyle = '#8f846c';
  g.fillRect(-12, 0, 24, 4);
  if (!it.taken) {
    const bob = Math.sin(it.anim * 3) * 3;
    g.save();
    g.translate(0, -20 + bob);
    g.scale(1.35, 1.35);
    drawItemIcon(g, 0, 0, it.def);
    g.restore();
  }
  g.restore();
}

// small icon representing an item (used on pedestal & HUD toast)
// def.tint recolors shared shapes, keeping all 55 items readable apart
function drawItemIcon(g, x, y, def) {
  const tint = def.tint;
  g.save();
  g.translate(x, y);
  g.lineCap = 'round';
  g.strokeStyle = PAL.outline;
  switch (def.icon) {
    case 'onion': // tears up
      g.fillStyle = '#d9c8e8';
      g.lineWidth = 3;
      g.beginPath(); g.ellipse(0, 2, 11, 12, 0, 0, TAU); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(0, -10); g.quadraticCurveTo(3, -16, 0, -19); g.stroke();
      g.fillStyle = 'rgba(120,90,150,0.5)';
      g.beginPath(); g.ellipse(-3, 3, 3, 8, 0.2, 0, TAU); g.fill();
      break;
    case 'pepper': // damage up
      g.fillStyle = '#c92f1f';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-3, -8);
      g.quadraticCurveTo(-12, -2, -8, 8);
      g.quadraticCurveTo(-4, 14, 2, 12);
      g.quadraticCurveTo(10, 8, 6, -6);
      g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = '#3f6d28'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(0, -8); g.quadraticCurveTo(4, -14, 8, -13); g.stroke();
      break;
    case 'coffee': // speed up
      g.fillStyle = '#f0ebe0';
      g.lineWidth = 3;
      g.beginPath(); g.rect(-9, -8, 18, 18); g.fill(); g.stroke();
      g.beginPath(); g.arc(11, 0, 5, -1.2, 1.2); g.stroke();
      g.fillStyle = '#6b4423';
      g.beginPath(); g.ellipse(0, -8, 9, 3, 0, 0, TAU); g.fill(); g.stroke();
      break;
    case 'lens': // range up
      g.fillStyle = tint || '#9fc6e8';
      g.lineWidth = 3;
      g.beginPath(); g.arc(-2, -3, 9, 0, TAU); g.fill(); g.stroke();
      g.strokeStyle = PAL.outline; g.lineWidth = 4;
      g.beginPath(); g.moveTo(5, 4); g.lineTo(12, 12); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath(); g.arc(-5, -6, 3, 0, TAU); g.fill();
      break;
    case 'heart':
      drawHeartShape(g, 0, 0, 14, '#c9231a', PAL.outline);
      break;
    case 'feather': // triple shot
      g.fillStyle = tint || '#f5f0e2';
      g.lineWidth = 2.5;
      for (let i = -1; i <= 1; i++) {
        g.save();
        g.rotate(i * 0.5);
        g.beginPath();
        g.ellipse(0, -4, 4, 11, 0, 0, TAU);
        g.fill(); g.stroke();
        g.restore();
      }
      break;
    case 'magnet': // homing
      g.strokeStyle = '#c9231a';
      g.lineWidth = 6;
      g.beginPath(); g.arc(0, -2, 9, Math.PI, 0, false); g.stroke();
      g.strokeStyle = PAL.outline; g.lineWidth = 6.5;
      g.beginPath(); g.arc(0, -2, 9, Math.PI * 1.02, -0.02 * Math.PI, false); g.stroke();
      g.strokeStyle = '#c9231a'; g.lineWidth = 5.5;
      g.beginPath(); g.arc(0, -2, 9, Math.PI, 0, false); g.stroke();
      g.fillStyle = '#e8e3d3';
      g.fillRect(-12, -4, 5, 10); g.fillRect(7, -4, 5, 10);
      g.strokeStyle = PAL.outline; g.lineWidth = 2;
      g.strokeRect(-12, -4, 5, 10); g.strokeRect(7, -4, 5, 10);
      break;
    case 'needle': // piercing
      g.strokeStyle = '#c8c8d0';
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(-10, 10); g.lineTo(10, -10); g.stroke();
      g.strokeStyle = PAL.outline; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-10, 10); g.lineTo(10, -10); g.stroke();
      g.fillStyle = '#c8c8d0';
      g.beginPath(); g.arc(10, -10, 3, 0, TAU); g.fill();
      break;
    case 'bigtear':
      g.fillStyle = PAL.tear;
      g.strokeStyle = PAL.tearOutline;
      g.lineWidth = 3;
      g.beginPath(); g.arc(0, 2, 12, 0, TAU); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(0, -14); g.quadraticCurveTo(6, -4, 0, 2); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath(); g.arc(-4, -2, 3.5, 0, TAU); g.fill();
      break;
    case 'crown':
      g.fillStyle = tint || '#f4d03f';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-12, 8); g.lineTo(-12, -6); g.lineTo(-6, 0); g.lineTo(0, -10); g.lineTo(6, 0); g.lineTo(12, -6); g.lineTo(12, 8);
      g.closePath(); g.fill(); g.stroke();
      break;
    case 'halo':
      g.strokeStyle = '#f7e463';
      g.lineWidth = 5;
      g.beginPath(); g.ellipse(0, 0, 12, 6, 0, 0, TAU); g.stroke();
      g.strokeStyle = PAL.outline; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(0, 0, 12, 6, 0, 0, TAU); g.stroke();
      break;
    case 'brim': // brimstone: bleeding maw firing a laser
      g.fillStyle = '#4a0d08';
      g.lineWidth = 3;
      g.beginPath(); g.ellipse(0, -2, 12, 9, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#e8ddc8';
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(i * 6 - 3, -7); g.lineTo(i * 6 + 3, -7); g.lineTo(i * 6, -2);
        g.closePath(); g.fill();
      }
      g.fillStyle = tint || '#c9231a';
      g.fillRect(-3, 4, 6, 12);
      g.fillStyle = 'rgba(255,220,210,0.9)';
      g.fillRect(-1, 4, 2, 12);
      break;
    case 'bomb':
      g.fillStyle = '#2b2622';
      g.lineWidth = 3;
      g.beginPath(); g.arc(0, 3, 10, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#5a5148';
      g.fillRect(-3, -9, 6, 5); g.strokeRect(-3, -9, 6, 5);
      g.strokeStyle = '#c9a437'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(0, -9); g.quadraticCurveTo(7, -14, 4, -19); g.stroke();
      g.fillStyle = '#f0b23c';
      g.beginPath(); g.arc(4, -20, 2.5, 0, TAU); g.fill();
      break;
    case 'ball':
      g.fillStyle = tint || '#8fd3c1';
      g.lineWidth = 3;
      g.beginPath(); g.arc(0, 1, 11, 0, TAU); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(30,70,60,0.5)'; g.lineWidth = 2.5;
      g.beginPath(); g.ellipse(0, 1, 5, 11, 0, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.beginPath(); g.arc(-4, -4, 3, 0, TAU); g.fill();
      break;
    case 'flask':
      g.fillStyle = '#d8d2c4';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-4, -12); g.lineTo(-4, -5); g.quadraticCurveTo(-12, 2, -8, 11);
      g.lineTo(8, 11); g.quadraticCurveTo(12, 2, 4, -5); g.lineTo(4, -12);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = tint || '#7fbf4a';
      g.beginPath();
      g.moveTo(-9, 3); g.quadraticCurveTo(0, 6, 9, 3); g.lineTo(8, 11); g.lineTo(-8, 11);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.beginPath(); g.arc(-3, 6, 1.8, 0, TAU); g.arc(3, 8, 1.3, 0, TAU); g.fill();
      break;
    case 'ice':
      g.strokeStyle = tint || '#bfe6ff';
      g.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        g.save(); g.rotate(i * Math.PI / 3);
        g.beginPath(); g.moveTo(0, -12); g.lineTo(0, 12); g.stroke();
        g.beginPath(); g.moveTo(0, -8); g.lineTo(-4, -12); g.moveTo(0, -8); g.lineTo(4, -12); g.stroke();
        g.restore();
      }
      g.strokeStyle = 'rgba(60,110,150,0.8)'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(0, 0, 3, 0, TAU); g.stroke();
      break;
    case 'clover':
      g.fillStyle = tint || '#3f8f28';
      g.lineWidth = 2.5;
      for (let i = 0; i < 4; i++) {
        g.save(); g.rotate(i * TAU / 4);
        g.beginPath(); g.ellipse(0, -7, 5, 6.5, 0, 0, TAU); g.fill(); g.stroke();
        g.restore();
      }
      g.strokeStyle = '#2c6b1c'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, 4); g.quadraticCurveTo(4, 10, 1, 15); g.stroke();
      break;
    case 'tooth':
      g.fillStyle = tint || '#f7f2e2';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-9, -10); g.quadraticCurveTo(0, -14, 9, -10);
      g.quadraticCurveTo(8, 4, 4, 13); g.quadraticCurveTo(0, 4, -4, 13);
      g.quadraticCurveTo(-8, 4, -9, -10);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = 'rgba(150,140,120,0.35)';
      g.beginPath(); g.ellipse(4, -4, 3, 6, 0.2, 0, TAU); g.fill();
      break;
    case 'orbit':
      g.strokeStyle = 'rgba(220,236,251,0.8)';
      g.lineWidth = 2.5;
      g.beginPath(); g.ellipse(0, 0, 13, 6, 0, 0, TAU); g.stroke();
      g.fillStyle = tint || PAL.tear;
      g.strokeStyle = PAL.tearOutline; g.lineWidth = 2.5;
      g.beginPath(); g.arc(0, 1, 6, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = tint || '#dcecfb';
      g.beginPath(); g.arc(13, 0, 4, 0, TAU); g.fill();
      g.beginPath(); g.arc(-13, 0, 4, 0, TAU); g.fill();
      break;
    case 'baby':
      g.fillStyle = tint || '#f7f3e9';
      g.lineWidth = 3;
      g.beginPath(); g.ellipse(0, 0, 11, 10, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#17110c';
      g.beginPath();
      g.ellipse(-4, -2, 2, 2.8, 0, 0, TAU); g.ellipse(4, -2, 2, 2.8, 0, 0, TAU);
      g.fill();
      g.strokeStyle = PAL.outline; g.lineWidth = 2;
      g.beginPath(); g.arc(0, 3, 4, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      g.strokeStyle = '#8fb2d6'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(-6, 4); g.lineTo(-7, 10); g.stroke();
      break;
    case 'spike':
      g.fillStyle = tint || '#b7ac95';
      g.lineWidth = 3;
      g.beginPath(); g.arc(0, 2, 9, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#e8e2d0';
      for (let i = 0; i < 8; i++) {
        g.save(); g.rotate(i * TAU / 8);
        g.beginPath(); g.moveTo(-3, -9); g.lineTo(3, -9); g.lineTo(0, -16);
        g.closePath(); g.fill(); g.stroke();
        g.restore();
      }
      break;
    case 'bloodbag':
      g.fillStyle = '#e8e2d0';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-8, -11); g.lineTo(8, -11); g.quadraticCurveTo(11, 4, 0, 13);
      g.quadraticCurveTo(-11, 4, -8, -11);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = tint || '#a3231a';
      g.beginPath();
      g.moveTo(-7, -3); g.lineTo(7, -3); g.quadraticCurveTo(9, 4, 0, 12);
      g.quadraticCurveTo(-9, 4, -7, -3);
      g.closePath(); g.fill();
      g.strokeStyle = PAL.outline; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(-5, -14); g.lineTo(5, -14); g.stroke();
      break;
    case 'mushroom':
      g.fillStyle = tint || '#c9231a';
      g.lineWidth = 3;
      g.beginPath(); g.arc(0, -1, 12, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#f5efe0';
      for (const s of [-6, 0, 6]) { g.beginPath(); g.arc(s, -5, 2.6, 0, TAU); g.fill(); }
      g.fillStyle = '#efe6d2';
      g.beginPath(); g.rect(-5, -1, 10, 12); g.fill(); g.stroke();
      break;
    case 'star':
      g.fillStyle = tint || '#f4d03f';
      g.lineWidth = 3;
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const r = i % 2 ? 5.5 : 13;
        const px = Math.cos(a) * r, py = Math.sin(a) * r;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath(); g.fill(); g.stroke();
      break;
    case 'iron':
      g.fillStyle = tint || '#8d8b8f';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-12, 8); g.lineTo(-8, -8); g.lineTo(12, -8); g.lineTo(8, 8);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.beginPath(); g.moveTo(-8, -8); g.lineTo(12, -8); g.lineTo(10, -3); g.lineTo(-7, -3);
      g.closePath(); g.fill();
      break;
    case 'pill':
      g.save();
      g.rotate(-0.6);
      g.fillStyle = tint || '#7fa8e8';
      g.lineWidth = 3;
      g.beginPath();
      if (g.roundRect) g.roundRect(-7, -13, 14, 26, 7);
      else { g.arc(0, -6, 7, Math.PI, 0); g.lineTo(7, 6); g.arc(0, 6, 7, 0, Math.PI); g.closePath(); }
      g.fill(); g.stroke();
      g.fillStyle = '#f2ede0';
      g.beginPath(); g.arc(0, 6, 7, 0, Math.PI); g.lineTo(-7, 0); g.lineTo(7, 0); g.closePath(); g.fill();
      g.strokeStyle = PAL.outline; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-7, 0); g.lineTo(7, 0); g.stroke();
      g.restore();
      break;
    case 'eye':
      g.fillStyle = '#f7f2e6';
      g.lineWidth = 3;
      g.beginPath(); g.ellipse(0, 0, 13, 9, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = tint || '#4a7fb5';
      g.beginPath(); g.arc(0, 0, 5.5, 0, TAU); g.fill();
      g.fillStyle = '#17110c';
      g.beginPath(); g.arc(0, 0, 2.6, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath(); g.arc(-3, -3, 1.8, 0, TAU); g.fill();
      break;
    case 'bolt':
      g.fillStyle = tint || '#f4d03f';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(3, -15); g.lineTo(-8, 2); g.lineTo(-1, 2); g.lineTo(-4, 15);
      g.lineTo(9, -3); g.lineTo(1, -3);
      g.closePath(); g.fill(); g.stroke();
      break;
    case 'book':
      g.fillStyle = tint || '#8a3b2a';
      g.lineWidth = 3;
      g.beginPath(); g.rect(-11, -12, 22, 24); g.fill(); g.stroke();
      g.fillStyle = '#efe6d2';
      g.beginPath(); g.rect(-7, -10, 16, 20); g.fill();
      g.strokeStyle = 'rgba(80,60,40,0.5)'; g.lineWidth = 1.5;
      for (let i = -6; i <= 6; i += 4) { g.beginPath(); g.moveTo(-5, i); g.lineTo(7, i); g.stroke(); }
      g.fillStyle = tint || '#8a3b2a';
      g.fillRect(-11, -12, 5, 24);
      g.strokeStyle = PAL.outline; g.lineWidth = 3;
      g.strokeRect(-11, -12, 22, 24);
      break;
    case 'horn':
      g.fillStyle = tint || '#8e2b1c';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-9, 13); g.quadraticCurveTo(-13, -6, 2, -15);
      g.quadraticCurveTo(-1, -3, 4, 11);
      g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(40,10,6,0.5)'; g.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(-8 + i * 1.5, 8 - i * 6); g.lineTo(1 + i, 6 - i * 6);
        g.stroke();
      }
      break;
    case 'wing':
      g.fillStyle = tint || '#f5f1e6';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-2, 12);
      g.quadraticCurveTo(-16, 2, -10, -13);
      g.quadraticCurveTo(-2, -6, 2, 10);
      g.closePath(); g.fill(); g.stroke();
      g.beginPath();
      g.moveTo(2, 12);
      g.quadraticCurveTo(16, 2, 10, -13);
      g.quadraticCurveTo(2, -6, -2, 10);
      g.closePath(); g.fill(); g.stroke();
      break;
    case 'skull':
      g.fillStyle = tint || '#e8e2d0';
      g.lineWidth = 3;
      g.beginPath(); g.ellipse(0, -3, 11, 10, 0, 0, TAU); g.fill(); g.stroke();
      g.beginPath();
      g.moveTo(-6, 5); g.quadraticCurveTo(0, 15, 6, 5);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#17110c';
      g.beginPath();
      g.ellipse(-4, -4, 3, 3.6, 0, 0, TAU); g.ellipse(4, -4, 3, 3.6, 0, 0, TAU);
      g.fill();
      g.fillRect(-1.4, 1, 2.8, 3.5);
      g.fillStyle = '#efe6d2';
      for (let i = -1; i <= 1; i++) g.fillRect(i * 3.4 - 1.2, 6, 2.4, 4);
      break;
    case 'candle':
      g.fillStyle = '#efe6d2';
      g.lineWidth = 3;
      g.beginPath(); g.rect(-5, -2, 10, 15); g.fill(); g.stroke();
      g.fillStyle = '#b0a58d';
      g.beginPath(); g.ellipse(0, 13, 9, 3.5, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = tint || '#f0b23c';
      g.beginPath();
      g.moveTo(0, -16); g.quadraticCurveTo(6, -8, 0, -2); g.quadraticCurveTo(-6, -8, 0, -16);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,240,190,0.9)';
      g.beginPath(); g.ellipse(0, -7, 1.8, 3.5, 0, 0, TAU); g.fill();
      break;
    case 'spider':
      g.strokeStyle = PAL.outline;
      g.lineWidth = 2.5;
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.moveTo(s * 4, 0);
          g.quadraticCurveTo(s * 12, -6 + i * 6, s * 14, 2 + i * 5);
          g.stroke();
        }
      }
      g.fillStyle = tint || '#241f26';
      g.lineWidth = 3;
      g.beginPath(); g.ellipse(0, 2, 8, 7, 0, 0, TAU); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(0, -6, 5, 4.5, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#c92f1f';
      g.beginPath(); g.arc(-2, -7, 1.6, 0, TAU); g.arc(2, -7, 1.6, 0, TAU); g.fill();
      break;
    case 'meat':
      g.fillStyle = tint || '#c96a5e';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-11, 6); g.quadraticCurveTo(-13, -8, -2, -11);
      g.quadraticCurveTo(11, -13, 12, 0); g.quadraticCurveTo(12, 11, -2, 11);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#f0d9d2';
      g.beginPath(); g.ellipse(4, 2, 5, 6, 0.3, 0, TAU); g.fill();
      g.fillStyle = '#e8e2d0';
      g.beginPath(); g.ellipse(-9, 8, 5, 4, 0.4, 0, TAU); g.fill(); g.stroke();
      break;
    case 'key':
      g.strokeStyle = tint || '#e7b93c';
      g.lineWidth = 4;
      g.beginPath(); g.arc(0, -7, 6, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(0, -1); g.lineTo(0, 14); g.stroke();
      g.beginPath(); g.moveTo(0, 8); g.lineTo(6, 8); g.moveTo(0, 12); g.lineTo(5, 12); g.stroke();
      g.strokeStyle = PAL.outline; g.lineWidth = 1.5;
      g.beginPath(); g.arc(0, -7, 6, 0, TAU); g.stroke();
      break;
    case 'battery':
      g.fillStyle = tint || '#3f6d28';
      g.lineWidth = 3;
      g.beginPath(); g.rect(-9, -11, 18, 23); g.fill(); g.stroke();
      g.fillStyle = '#c9c3b2';
      g.beginPath(); g.rect(-4, -15, 8, 4); g.fill(); g.stroke();
      g.fillStyle = '#f4d03f';
      g.beginPath();
      g.moveTo(1, -7); g.lineTo(-5, 2); g.lineTo(-1, 2); g.lineTo(-3, 9);
      g.lineTo(5, -1); g.lineTo(0, -1);
      g.closePath(); g.fill();
      break;
    case 'gear':
      g.fillStyle = tint || '#9b9280';
      g.lineWidth = 3;
      for (let i = 0; i < 8; i++) {
        g.save(); g.rotate(i * TAU / 8);
        g.beginPath(); g.rect(-3, -14, 6, 7); g.fill(); g.stroke();
        g.restore();
      }
      g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#3a352c';
      g.beginPath(); g.arc(0, 0, 3.5, 0, TAU); g.fill();
      break;
    case 'cloak':
      g.fillStyle = tint || '#2b2733';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, -13);
      g.quadraticCurveTo(-12, -8, -10, 13);
      g.quadraticCurveTo(0, 8, 10, 13);
      g.quadraticCurveTo(12, -8, 0, -13);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.beginPath(); g.ellipse(0, -7, 5.5, 5, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(230,225,210,0.75)';
      g.beginPath(); g.arc(-2, -8, 1.3, 0, TAU); g.arc(2, -8, 1.3, 0, TAU); g.fill();
      break;
    case 'poop':
      g.fillStyle = tint || '#7a5a35';
      g.lineWidth = 3;
      g.beginPath(); g.ellipse(0, 9, 12, 6, 0, 0, TAU); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(-1, 1, 9, 5.5, 0, 0, TAU); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(1, -6, 6, 4.5, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.beginPath(); g.ellipse(-4, -7, 2.5, 1.6, 0.3, 0, TAU); g.fill();
      break;
    case 'dice':
      g.save();
      g.rotate(0.18);
      g.fillStyle = tint || '#f2ede0';
      g.lineWidth = 3;
      g.beginPath();
      if (g.roundRect) g.roundRect(-11, -11, 22, 22, 4); else g.rect(-11, -11, 22, 22);
      g.fill(); g.stroke();
      g.fillStyle = '#17110c';
      for (const [dx, dy] of [[-5, -5], [5, -5], [0, 0], [-5, 5], [5, 5]]) {
        g.beginPath(); g.arc(dx, dy, 2.2, 0, TAU); g.fill();
      }
      g.restore();
      break;
    case 'moon':
      g.fillStyle = tint || '#dfe6ff';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 0, 12, 0.6, -0.6);
      g.arc(5, 0, 11, -0.75, 0.75, true);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = 'rgba(120,130,180,0.4)';
      g.beginPath(); g.arc(-4, -4, 2.2, 0, TAU); g.arc(-6, 4, 1.6, 0, TAU); g.fill();
      break;
    case 'sun':
      g.strokeStyle = tint || '#f4d03f';
      g.lineWidth = 3.5;
      for (let i = 0; i < 8; i++) {
        g.save(); g.rotate(i * TAU / 8);
        g.beginPath(); g.moveTo(0, -10); g.lineTo(0, -15); g.stroke();
        g.restore();
      }
      g.fillStyle = tint || '#f4d03f';
      g.strokeStyle = PAL.outline; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,250,210,0.8)';
      g.beginPath(); g.arc(-3, -3, 3, 0, TAU); g.fill();
      break;
    case 'cross':
      g.fillStyle = tint || '#e7dcbe';
      g.lineWidth = 3;
      g.beginPath();
      g.rect(-3.5, -14, 7, 27);
      g.fill(); g.stroke();
      g.beginPath();
      g.rect(-11, -7, 22, 7);
      g.fill(); g.stroke();
      g.fillStyle = 'rgba(140,120,80,0.35)';
      g.fillRect(-3.5, -7, 7, 7);
      break;
    case 'bandage':
      g.save();
      g.rotate(-0.5);
      g.fillStyle = tint || '#e8d9b5';
      g.lineWidth = 3;
      g.beginPath();
      if (g.roundRect) g.roundRect(-14, -6, 28, 12, 6); else g.rect(-14, -6, 28, 12);
      g.fill(); g.stroke();
      g.fillStyle = '#cdbb92';
      g.beginPath(); g.rect(-5, -6, 10, 12); g.fill(); g.stroke();
      g.fillStyle = 'rgba(90,70,40,0.5)';
      for (const dx of [-2, 2]) for (const dy of [-2, 2]) {
        g.beginPath(); g.arc(dx, dy, 1.1, 0, TAU); g.fill();
      }
      g.restore();
      break;
    case 'blooddrop':
      g.fillStyle = tint || '#c3241a';
      g.strokeStyle = '#5c0f09';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, -15);
      g.quadraticCurveTo(10, -1, 10, 4);
      g.arc(0, 4, 10, 0, Math.PI);
      g.quadraticCurveTo(-10, -1, 0, -15);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,180,170,0.8)';
      g.beginPath(); g.arc(-3.5, 3, 3, 0, TAU); g.fill();
      break;
    case 'bone':
      g.save();
      g.rotate(-0.7);
      g.fillStyle = tint || '#efe6d2';
      g.lineWidth = 3;
      g.beginPath(); g.rect(-3.5, -9, 7, 18); g.fill(); g.stroke();
      for (const sy of [-9, 9]) {
        g.beginPath();
        g.arc(-4, sy, 4.5, 0, TAU); g.fill(); g.stroke();
        g.beginPath();
        g.arc(4, sy, 4.5, 0, TAU); g.fill(); g.stroke();
      }
      g.restore();
      break;
    case 'ring':
      g.strokeStyle = tint || '#e7b93c';
      g.lineWidth = 5;
      g.beginPath(); g.arc(0, 4, 9, 0, TAU); g.stroke();
      g.strokeStyle = PAL.outline; g.lineWidth = 1.5;
      g.beginPath(); g.arc(0, 4, 11.5, 0, TAU); g.stroke();
      g.beginPath(); g.arc(0, 4, 6.5, 0, TAU); g.stroke();
      g.fillStyle = '#8fd3e8';
      g.beginPath();
      g.moveTo(0, -16); g.lineTo(6, -9); g.lineTo(0, -3); g.lineTo(-6, -9);
      g.closePath(); g.fill(); g.stroke();
      break;
    default:
      g.fillStyle = '#ccc';
      g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.fill(); g.stroke();
  }
  g.restore();
}

// ================= POST FX =================
// Radial vignette (baked once) + animated film grain (tiled noise pattern,
// re-offset every frame). Applied over the whole frame including HUD.
let _vignette = null, _grainPattern = null;
function ensurePostFX(g) {
  if (!_vignette) {
    _vignette = document.createElement('canvas');
    _vignette.width = W; _vignette.height = H;
    const vg = _vignette.getContext('2d');
    const grad = vg.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.98);
    grad.addColorStop(0, 'rgba(8,4,2,0)');
    grad.addColorStop(0.65, 'rgba(8,4,2,0.22)');
    grad.addColorStop(1, 'rgba(6,3,2,0.52)');
    vg.fillStyle = grad;
    vg.fillRect(0, 0, W, H);
  }
  if (!_grainPattern) {
    const gc = document.createElement('canvas');
    gc.width = 160; gc.height = 160;
    const gg = gc.getContext('2d');
    const img = gg.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 90 + (Math.random() * 130) | 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    gg.putImageData(img, 0, 0);
    _grainPattern = g.createPattern(gc, 'repeat');
  }
}
function applyPostFX(g) {
  ensurePostFX(g);
  g.drawImage(_vignette, 0, 0);
  g.save();
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = 0.10;
  const ox = (Math.random() * 160) | 0, oy = (Math.random() * 160) | 0;
  g.translate(-ox, -oy);
  g.fillStyle = _grainPattern;
  g.fillRect(0, 0, W + 160, H + 160);
  g.restore();
}

// ================= CHILD-CRAYON TEXT =================
// End-of-run screens are "drawn by a kid": every glyph gets its own seeded
// size/rotation/baseline wobble plus double offset passes for a waxy edge.
const CRAYON_FONT = '"Wawati SC","Hannotate SC","HanziPen SC","Chalkboard SE","Comic Sans MS",cursive';
function drawCrayonText(g, text, x, y, size, color, seed, opts = {}) {
  const rng = mulberry32(seed);
  const chars = [...text];
  g.save();
  g.textBaseline = 'middle';
  g.font = 'bold ' + size + 'px ' + CRAYON_FONT;
  const spacing = opts.spacing || 0;
  const widths = chars.map(ch => g.measureText(ch).width);
  let total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = (opts.align === 'left' ? x : x - total / 2);
  g.textAlign = 'center';
  for (let i = 0; i < chars.length; i++) {
    const s = size * (0.9 + rng() * 0.2);
    const rot = (rng() - 0.5) * 0.16;
    const dy = (rng() - 0.5) * size * 0.18;
    g.save();
    g.translate(cx + widths[i] / 2, y + dy);
    g.rotate(rot);
    g.font = 'bold ' + s.toFixed(1) + 'px ' + CRAYON_FONT;
    g.fillStyle = color;
    g.globalAlpha = (opts.alpha != null ? opts.alpha : 1) * 0.35;
    g.fillText(chars[i], 1.3, 1);
    g.fillText(chars[i], -1, -0.7);
    g.globalAlpha = opts.alpha != null ? opts.alpha : 1;
    g.fillText(chars[i], 0, 0);
    g.restore();
    cx += widths[i] + spacing;
  }
  g.restore();
}

// hand-wobbled line for crayon borders / doodles
function drawCrayonLine(g, x1, y1, x2, y2, rng, color, width) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const segs = Math.max(2, Math.round(len / 34));
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x1 + (rng() - 0.5) * 3, y1 + (rng() - 0.5) * 3);
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    g.lineTo(x1 + (x2 - x1) * t + (rng() - 0.5) * 4, y1 + (y2 - y1) * t + (rng() - 0.5) * 4);
  }
  g.stroke();
}

// ================= HUD =================
function drawHUDHearts(g, hp, maxHp) {
  const hearts = Math.ceil(maxHp / 2);
  for (let i = 0; i < hearts; i++) {
    const x = 34 + i * 30, y = 30;
    const v = hp - i * 2; // 2 = full, 1 = half, <=0 empty
    drawHeartShape(g, x, y, 15, '#3a2c22', PAL.outline); // empty container
    if (v >= 2) drawHeartShape(g, x, y, 15, '#c9231a', PAL.outline);
    else if (v === 1) {
      g.save();
      g.beginPath(); g.rect(x - 16, y - 18, 16, 36); g.clip();
      drawHeartShape(g, x, y, 15, '#c9231a', PAL.outline);
      g.restore();
      drawHeartShape(g, x, y, 15, null, PAL.outline);
    }
  }
}
