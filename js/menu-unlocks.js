'use strict';
// ============ menu character ring / unlock codex / unlock popups ============
// Isaac-style character select: the picked dodo stands front and center on an
// elliptical ring, the others wait behind. The unlock goals moved off the
// menu into a codex overlay (P). Unlocks earned mid-run pop a card and the
// item lands in the bag immediately — that run only; later runs must find it
// in the dungeon like anything else.

// ---------------- character ring ----------------
const MENU_RING = { cy: 306, rx: 210, ry: 42 };

// ring slot of character i: angle 0 faces the camera; menuRot eases toward
// menuRotT so a new pick walks around the ring instead of teleporting
function menuCharPos(i) {
  const a = ((i - G.menuRot) / CHAR_DEFS.length) * TAU;
  const depth = (Math.cos(a) + 1) / 2;    // 1 = front, 0 = back
  return {
    x: W / 2 + Math.sin(a) * MENU_RING.rx,
    y: MENU_RING.cy + Math.cos(a) * MENU_RING.ry,
    depth,
    scale: 0.6 + 0.5 * depth,
  };
}

// front-most character under the pointer (front slots win overlaps)
function menuCharHit(cx, cy) {
  let best = -1, bestDepth = -1;
  for (let i = 0; i < CHAR_DEFS.length; i++) {
    const pos = menuCharPos(i);
    if (Math.abs(cx - pos.x) < 80 * pos.scale &&
        cy > pos.y - 110 * pos.scale && cy < pos.y + 80 * pos.scale &&
        pos.depth > bestDepth) { best = i; bestDepth = pos.depth; }
  }
  return best;
}

// rotate the ring so idx lands in front, taking the short way around
function menuRotateTo(idx) {
  const n = CHAR_DEFS.length;
  let d = idx - G.charIdx;
  if (d > n / 2) d -= n;
  if (d < -n / 2) d += n;
  G.menuRotT += d;
  G.charIdx = idx;
  META.selChar = CHAR_DEFS[idx].id;
  metaSave();
  SFX.coin();
}

// ---------------- unlock codex (P on the menu) ----------------
// scratch canvas so locked entries render as a near-black silhouette
const SIL = document.createElement('canvas');
SIL.width = SIL.height = 96;
const SIL_CTX = SIL.getContext('2d');

// paint `fn` (which draws around 0,0) at x,y on the main ctx; locked entries
// go through the scratch canvas and come out as a dark silhouette
function drawUnlockArt(fn, x, y, unlocked) {
  if (unlocked) {
    ctx.save(); ctx.translate(x, y); fn(ctx); ctx.restore();
    return;
  }
  SIL_CTX.clearRect(0, 0, 96, 96);
  SIL_CTX.save(); SIL_CTX.translate(48, 48); fn(SIL_CTX); SIL_CTX.restore();
  SIL_CTX.save();
  SIL_CTX.globalCompositeOperation = 'source-atop';
  SIL_CTX.fillStyle = '#25211b';
  SIL_CTX.fillRect(0, 0, 96, 96);
  SIL_CTX.restore();
  ctx.drawImage(SIL, x - 48, y - 48);
}

// icon painter for one unlock def: the item's pedestal icon, or a mini dodo
// tinted like the character it unlocks
function unlockArtFn(u) {
  if (u.kind === 'item') {
    const def = ITEM_BY_ID[u.id];
    return g => { g.scale(1.1, 1.1); drawItemIcon(g, 0, 0, def); };
  }
  const c = CHAR_DEFS.find(ch => ch.unlock === u.id);
  const prev = makePlayer(c.id).appearance;
  return g => {
    g.scale(0.52, 0.52);
    g.translate(0, 14);
    drawDodo(g, 0, 0, { walk: 0, moving: false, aimX: 0, aimY: 0.3,
      headColor: prev.headColor, eyeColor: prev.eyeColor,
      aura: prev.aura, brow: prev.brow });
  };
}

function renderUnlockPanel() {
  ctx.save();
  ctx.fillStyle = 'rgba(6,4,3,0.9)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 32px Georgia';
  ctx.fillStyle = '#e8dcc0';
  ctx.fillText('解锁图鉴', W / 2, 54);
  const done = UNLOCK_DEFS.filter(u => metaHas(u.id)).length;
  ctx.font = '14px Trebuchet MS';
  ctx.fillStyle = 'rgba(200,186,158,0.7)';
  ctx.fillText('已解锁 ' + done + ' / ' + UNLOCK_DEFS.length
    + '　·　达成条件的瞬间立即获得道具，之后的冒险需在地牢中寻获', W / 2, 82);

  const colW = 440, rowH = 88, x0 = (W - colW * 2 - 20) / 2, y0 = 100;
  UNLOCK_DEFS.forEach((u, i) => {
    const x = x0 + (i % 2) * (colW + 20), y = y0 + Math.floor(i / 2) * rowH;
    const has = metaHas(u.id);
    ctx.fillStyle = has ? 'rgba(38,28,16,0.75)' : 'rgba(16,12,9,0.75)';
    ctx.strokeStyle = has ? '#8a6b2f' : '#2e261c';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.rect(x, y, colW, rowH - 10); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = has ? '#c9a437' : '#3a3128';
    ctx.strokeRect(x + 12, y + 11, 56, 56);
    drawUnlockArt(unlockArtFn(u), x + 40, y + 39, has);
    const tx = x + 84;
    ctx.textAlign = 'left';
    ctx.font = 'bold 16px Georgia';
    ctx.fillStyle = has ? '#f4d03f' : 'rgba(150,138,118,0.85)';
    ctx.fillText(u.label + (u.kind === 'char' ? '（角色）' : ''), tx, y + 25);
    ctx.font = '12px Trebuchet MS';
    ctx.fillStyle = has ? 'rgba(216,204,176,0.9)' : 'rgba(140,128,110,0.7)';
    const info = u.kind === 'item' ? (ITEM_BY_ID[u.id] || {}).desc
      : (CHAR_DEFS.find(ch => ch.unlock === u.id) || {}).desc;
    ctx.fillText(info || '', tx, y + 45);
    ctx.fillStyle = has ? 'rgba(160,200,130,0.9)' : 'rgba(150,138,118,0.8)';
    ctx.fillText((has ? '已解锁　·　' : '解锁条件　') + u.how, tx, y + 64);
    ctx.textAlign = 'right';
    ctx.font = 'bold 12px Trebuchet MS';
    ctx.fillStyle = has ? '#c9a437' : 'rgba(110,100,86,0.8)';
    ctx.fillText(has ? '已解锁' : '未解锁', x + colW - 12, y + 25);
    ctx.textAlign = 'left';
  });

  ctx.textAlign = 'center';
  ctx.font = 'bold 17px Georgia';
  ctx.fillStyle = Math.sin(G.menuAnim * 5) > -0.2 ? '#efe6d2' : 'rgba(239,230,210,0.35)';
  ctx.fillText('按 P 或 Esc 关闭', W / 2, H - 24);
  ctx.restore();
}

// ---------------- mid-run unlock popup ----------------
// one card at a time; the queue drains front to back
function renderUnlockPopups() {
  const pop = G.unlockPopups[0];
  if (!pop) return;
  if (!G.paused) pop.t -= 1 / 60;
  if (pop.t <= 0) { G.unlockPopups.shift(); return; }
  const u = pop.u;
  const inK = Math.min(1, (pop.max - pop.t) / 0.3);
  const outK = Math.min(1, pop.t / 0.35);
  const cw = 480, ch = 92;
  const cx0 = W / 2 - cw / 2;
  const cy0 = -ch + (58 + ch) * (1 - Math.pow(1 - inK, 3));
  ctx.save();
  ctx.globalAlpha = outK;
  ctx.fillStyle = 'rgba(14,10,7,0.92)';
  ctx.strokeStyle = '#c9a437';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.rect(cx0, cy0, cw, ch); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#8a6b2f';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx0 + 12, cy0 + 12, 68, 68);
  ctx.save();
  ctx.translate(cx0 + 46, cy0 + 46);
  unlockArtFn(u)(ctx);
  ctx.restore();
  const tx = cx0 + 96;
  ctx.textAlign = 'left';
  ctx.font = 'bold 15px Trebuchet MS';
  ctx.fillStyle = '#c9a437';
  ctx.fillText(u.kind === 'char' ? '新角色解锁！' : '新道具解锁！', tx, cy0 + 26);
  ctx.font = 'bold 19px Georgia';
  ctx.fillStyle = '#f3ecd8';
  ctx.fillText(u.label, tx, cy0 + 50);
  ctx.font = '13px Trebuchet MS';
  ctx.fillStyle = 'rgba(216,204,176,0.85)';
  const tail = u.kind === 'char' ? '选人界面已可选用'
    : pop.granted ? '已立即获得！之后的冒险需在地牢中寻获'
      : '已加入道具池，之后的冒险中可能出现';
  ctx.fillText(u.how + '　达成　·　' + tail, tx, cy0 + 74);
  ctx.restore();
}

// a freshly unlocked item lands in the bag right away — this run only; later
// runs roll it out of the pools like anything else
function grantUnlockedItem(u) {
  const def = ITEM_BY_ID[u.id];
  const p = G.player;
  if (!def || !p || G.state !== 'play') return false;
  def.apply(p);
  clampPlayerStats(p);
  p.itemsTaken.push(def.id);
  spawnSplash(G, p.x, p.y - 20, '#f4d03f');
  checkTransformations(G, p);
  noteItemTaken();
  return true;
}
