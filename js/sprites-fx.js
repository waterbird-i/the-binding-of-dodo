'use strict';
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
function drawHUDHearts(g, hp, maxHp, soulHp = 0) {
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
  // soul hearts ride after the red row — no containers, they burn away first
  const souls = Math.ceil(soulHp / 2);
  for (let i = 0; i < souls; i++) {
    const x = 34 + (hearts + i) * 30, y = 30;
    const v = soulHp - i * 2;
    if (v >= 2) drawHeartShape(g, x, y, 15, '#9db6e8', PAL.outline);
    else {
      g.save();
      g.beginPath(); g.rect(x - 16, y - 18, 16, 36); g.clip();
      drawHeartShape(g, x, y, 15, '#9db6e8', PAL.outline);
      g.restore();
      drawHeartShape(g, x, y, 15, null, PAL.outline);
    }
  }
}
