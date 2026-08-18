'use strict';
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
  } else if (p.kind === 'soulheart') {
    // soul heart: cold blue with a ghostly shimmer
    g.save();
    g.globalAlpha = 0.35 + 0.2 * Math.sin(p.anim * 3);
    g.fillStyle = '#9db6e8';
    g.beginPath(); g.arc(p.x, p.y - 1, 15, 0, TAU); g.fill();
    g.restore();
    drawHeartShape(g, p.x, p.y, 13, '#9db6e8', PAL.outline);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath(); g.arc(p.x - 4, p.y - 5, 2.2, 0, TAU); g.fill();
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
  } else if (p.kind === 'bomb') {
    g.save();
    g.translate(p.x, p.y);
    g.fillStyle = '#232019';
    g.strokeStyle = PAL.outline;
    g.lineWidth = 3;
    g.beginPath(); g.arc(0, 2, 10, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath(); g.arc(-3.5, -1.5, 3.5, 0, TAU); g.fill();
    // fuse
    g.strokeStyle = '#c9a437';
    g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(3, -6); g.quadraticCurveTo(8, -13, 4, -16); g.stroke();
    g.fillStyle = '#e8452f';
    g.beginPath(); g.arc(4, -16, 2, 0, TAU); g.fill();
    g.restore();
  } else if (p.kind === 'battery') {
    g.save();
    g.translate(p.x, p.y);
    g.fillStyle = '#e7c93c';
    g.strokeStyle = PAL.outline;
    g.lineWidth = 3;
    g.beginPath(); g.rect(-6, -8, 12, 18); g.fill(); g.stroke();
    g.fillStyle = '#9c7418';
    g.beginPath(); g.rect(-3, -11, 6, 3.5); g.fill(); g.stroke();
    // lightning mark
    g.fillStyle = '#17110c';
    g.beginPath();
    g.moveTo(1.5, -5); g.lineTo(-2.5, 1); g.lineTo(0, 1); g.lineTo(-1.5, 7); g.lineTo(2.5, 0.5); g.lineTo(0, 0.5);
    g.closePath(); g.fill();
    g.restore();
  }
  g.restore();
}

// a placed, ticking bomb — flashes faster as the fuse runs out
function drawLiveBomb(g, b) {
  const panic = b.t < 0.6;
  const blink = panic && Math.floor(b.t * 12) % 2 === 0;
  g.save();
  g.translate(b.x, b.y);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.ellipse(0, 12, 12, 4.5, 0, 0, TAU); g.fill();
  const puls = 1 + Math.sin(b.anim * (panic ? 22 : 9)) * 0.05;
  g.scale(puls, puls);
  g.fillStyle = blink ? '#a3271b' : '#232019';
  g.strokeStyle = PAL.outline;
  g.lineWidth = 3;
  g.beginPath(); g.arc(0, 0, 12, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath(); g.arc(-4, -4, 4, 0, TAU); g.fill();
  // fuse burns down with remaining time
  const k = clamp(b.t / b.maxT, 0, 1);
  g.strokeStyle = '#c9a437';
  g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(4, -9); g.quadraticCurveTo(4 + 6 * k, -15 - 4 * k, 2 + 4 * k, -17 - 3 * k); g.stroke();
  // spark
  g.fillStyle = chance(0.5) ? '#f0b23c' : '#e8452f';
  g.beginPath(); g.arc(2 + 4 * k, -17 - 3 * k, 2.5 + rand(1), 0, TAU); g.fill();
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

// shop ware: pedestal (or bare heart) plus a price tag underneath.
// Price goes red the moment the purse can't cover it.
function drawShopWare(g, w, coins) {
  if (w.kind === 'item' || w.kind === 'active') {
    drawPedestal(g, w);
  } else if (!w.taken) {
    // consumables (heart / bomb / battery) reuse the floor pickup sprites
    drawPickup(g, w);
  }
  if (w.taken) return;
  // price tag
  g.save();
  const can = coins >= w.price;
  const ty = w.y + 34;
  g.fillStyle = '#e7b93c';
  g.strokeStyle = PAL.outline;
  g.lineWidth = 2;
  g.beginPath(); g.arc(w.x - 14, ty, 6.5, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = '#9c7418';
  g.font = 'bold 9px Trebuchet MS';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('¢', w.x - 14, ty + 1);
  g.font = 'bold 15px Trebuchet MS';
  g.textAlign = 'left';
  g.strokeStyle = 'rgba(12,8,6,0.85)';
  g.lineWidth = 3;
  g.strokeText(String(w.price), w.x - 4, ty + 1);
  g.fillStyle = can ? '#efe6d2' : '#e8452f';
  g.fillText(String(w.price), w.x - 4, ty + 1);
  g.restore();
}

// info card pinned to the object's top-left: name, effect and price.
// tips = { name, desc, price?, x, y }; wares carry a price, free pickups
// (hearts/coins/chests) show "碰撞获取" instead.
function drawItemTooltip(g, t, coins) {
  const action = t.priceLabel != null ? t.priceLabel
    : (t.price != null ? '价格　' + t.price + ' 金币' : '碰撞获取');
  g.save();
  g.font = 'bold 16px Trebuchet MS';
  const wName = g.measureText(t.name).width;
  g.font = '13px Trebuchet MS';
  const wDesc = g.measureText(t.desc).width;
  const wPrice = g.measureText(action).width;
  const pw = Math.max(wName, wDesc, wPrice) + 28;
  const ph = 76;
  // anchor: card sits to the upper-left of the object
  const px = clamp(t.x - pw - 18, 8, W - pw - 8);
  const py = clamp(t.y - ph - 26, 8, H - ph - 8);
  g.fillStyle = 'rgba(12,8,6,0.88)';
  g.strokeStyle = '#8a7454';
  g.lineWidth = 2;
  g.beginPath(); g.rect(px, py, pw, ph); g.fill(); g.stroke();
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.font = 'bold 16px Trebuchet MS';
  g.fillStyle = '#f4d03f';
  g.fillText(t.name, px + 14, py + 18);
  g.font = '13px Trebuchet MS';
  g.fillStyle = '#d8ccb0';
  g.fillText(t.desc, px + 14, py + 40);
  const affordable = t.priceLabel != null ? t.can !== false
    : (t.price == null || coins >= t.price);
  g.fillStyle = affordable ? '#a8d86a' : '#e8452f';
  g.fillText(action, px + 14, py + 60);
  g.restore();
}

// ---- sacrifice room spike bed + devil room statue ----
// Both are drawn live (not baked) so the spikes can glisten and the statue's
// candles can flicker.
function drawSpikeBed(g, x, y, anim) {
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.ellipse(0, 12, 52, 18, 0, 0, TAU); g.fill();
  // dried blood ring around the altar
  g.fillStyle = 'rgba(110,20,12,0.35)';
  g.beginPath(); g.ellipse(0, 10, 44, 15, 0, 0, TAU); g.fill();
  for (let i = 0; i < 7; i++) {
    const sx = -36 + i * 12, sy = (i % 2) * 8 - 2;
    g.fillStyle = '#b9b2a2';
    g.strokeStyle = PAL.outline;
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(sx - 5, sy + 10); g.lineTo(sx, sy - 16); g.lineTo(sx + 5, sy + 10);
    g.closePath(); g.fill(); g.stroke();
    // glint crawling along the tips
    const gl = Math.sin(anim * 2 + i) > 0.86;
    if (gl) {
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath(); g.arc(sx, sy - 12, 1.6, 0, TAU); g.fill();
    }
  }
  g.restore();
}

function drawDevilStatue(g, x, y, anim) {
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.beginPath(); g.ellipse(0, 34, 46, 14, 0, 0, TAU); g.fill();
  // hooded black figure
  g.fillStyle = '#17090b';
  g.strokeStyle = '#050203';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(-30, 32);
  g.quadraticCurveTo(-34, -12, -12, -34);
  g.quadraticCurveTo(0, -42, 12, -34);
  g.quadraticCurveTo(34, -12, 30, 32);
  g.closePath(); g.fill(); g.stroke();
  // horns
  g.fillStyle = '#2b1210';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 8, -34);
    g.quadraticCurveTo(s * 22, -46, s * 18, -60);
    g.quadraticCurveTo(s * 14, -46, s * 3, -38);
    g.closePath(); g.fill();
  }
  // burning red eyes
  const flick = 0.7 + 0.3 * Math.sin(anim * 7);
  g.fillStyle = 'rgba(232,69,47,' + flick + ')';
  g.beginPath(); g.arc(-8, -22, 3.2, 0, TAU); g.arc(8, -22, 3.2, 0, TAU); g.fill();
  // candles flanking the statue
  for (const s of [-1, 1]) {
    const cx = s * 52;
    g.fillStyle = '#d8ccb0';
    g.strokeStyle = PAL.outline;
    g.lineWidth = 2;
    g.beginPath(); g.rect(cx - 4, 8, 8, 22); g.fill(); g.stroke();
    const fl = 1 + Math.sin(anim * 9 + s) * 0.25;
    g.fillStyle = 'rgba(240,178,60,0.9)';
    g.beginPath(); g.ellipse(cx, 2 - 3 * fl, 3, 5.5 * fl, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,240,180,0.9)';
    g.beginPath(); g.ellipse(cx, 3 - 2 * fl, 1.4, 2.6 * fl, 0, 0, TAU); g.fill();
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
    case 'compass':
      g.fillStyle = tint || '#c9c3b2';
      g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, 12, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#efe6d2';
      g.beginPath(); g.arc(0, 0, 8.5, 0, TAU); g.fill();
      // needle: red north, dark south
      g.fillStyle = '#c9231a';
      g.beginPath(); g.moveTo(0, -7); g.lineTo(-2.6, 0); g.lineTo(2.6, 0); g.closePath(); g.fill();
      g.fillStyle = '#17110c';
      g.beginPath(); g.moveTo(0, 7); g.lineTo(-2.6, 0); g.lineTo(2.6, 0); g.closePath(); g.fill();
      break;
    case 'map':
      g.fillStyle = tint || '#e5d9b8';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-11, -9); g.lineTo(11, -12); g.lineTo(12, 10); g.lineTo(-10, 13);
      g.closePath(); g.fill(); g.stroke();
      // dashed trail ending at an X
      g.strokeStyle = '#8a5a2b';
      g.lineWidth = 2;
      g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(-7, 8); g.quadraticCurveTo(0, 2, 4, -4); g.stroke();
      g.setLineDash([]);
      g.strokeStyle = '#c9231a';
      g.beginPath();
      g.moveTo(3, -7); g.lineTo(8, -2);
      g.moveTo(8, -7); g.lineTo(3, -2);
      g.stroke();
      break;
    default:
      g.fillStyle = '#ccc';
      g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.fill(); g.stroke();
  }
  g.restore();
}

