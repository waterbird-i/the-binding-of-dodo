'use strict';
// ---------------- screens ----------------
function renderMenu() {
  G.menuAnim += 1 / 60;
  // dark backdrop
  ctx.fillStyle = '#120d09';
  ctx.fillRect(0, 0, W, H);
  // vignette spot
  const rad = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 480);
  rad.addColorStop(0, 'rgba(200,170,120,0.18)');
  rad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, W, H);

  // title
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8dcc0';
  ctx.strokeStyle = '#000';
  ctx.font = 'bold 30px Georgia';
  ctx.fillText('The Binding of', W / 2, 140);
  ctx.font = 'bold 92px Georgia';
  ctx.lineWidth = 10;
  ctx.strokeText('dodo', W / 2, 232);
  ctx.fillStyle = '#c9231a';
  ctx.fillText('dodo', W / 2, 232);
  ctx.restore();

  // character select: the three dodos share one rig, so they all walk in place
  G.menuDeny = Math.max(0, G.menuDeny - 1 / 60);
  for (let i = 0; i < CHAR_DEFS.length; i++) {
    const c = CHAR_DEFS[i];
    const cx = MENU_CHAR_X(i), cy = MENU_CHAR_Y;
    const locked = charLocked(c);
    const selected = i === G.charIdx;
    if (selected) {
      ctx.save();
      ctx.strokeStyle = locked
        ? 'rgba(163,39,27,' + (0.5 + 0.3 * Math.sin(G.menuAnim * 6)) + ')'
        : 'rgba(244,208,63,' + (0.55 + 0.35 * Math.sin(G.menuAnim * 4)) + ')';
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.ellipse(cx, cy + 30, 55, 17, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    const prev = makePlayer(c.id).appearance;
    drawDodo(ctx, cx, cy, {
      walk: G.menuAnim * 11, moving: selected, aimX: 0, aimY: 0.3,
      headColor: locked ? '#332e29' : prev.headColor,
      eyeColor: locked ? '#1c1915' : prev.eyeColor,
      aura: locked ? null : prev.aura,
      brow: locked ? null : prev.brow,
    });
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 17px Georgia';
    ctx.fillStyle = selected ? '#f4d03f' : 'rgba(232,220,192,0.75)';
    ctx.fillText(locked ? '???' : c.name, cx, cy + 66);
    ctx.font = '13px Trebuchet MS';
    if (locked) {
      const u = UNLOCK_DEFS.find(x => x.id === c.unlock);
      const denied = selected && G.menuDeny > 0;
      ctx.fillStyle = denied ? '#e8452f' : 'rgba(200,186,158,0.6)';
      ctx.fillText('未解锁 · ' + (u ? u.how : '完成挑战'), cx, cy + 88);
    } else {
      ctx.fillStyle = 'rgba(200,186,158,0.7)';
      ctx.fillText(c.desc, cx, cy + 88);
    }
    ctx.restore();
  }

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px Georgia';
  ctx.fillStyle = Math.sin(G.menuAnim * 5) > -0.2 ? '#efe6d2' : 'rgba(239,230,210,0.25)';
  ctx.fillText('← → 选择角色　·　按 Enter 或 点击屏幕 开始', W / 2, 452);
  ctx.font = '15px Trebuchet MS';
  ctx.fillStyle = 'rgba(220,205,180,0.65)';
  ctx.fillText('WASD 移动　方向键 发射眼泪　E 放炸弹　空格 主动道具　Tab 地图', W / 2, 482);
  ctx.fillText('清空房间开门前进 · 打倒每层 Boss · 炸开秘密房 · 碰撞获取道具变强'
    + (G.pendingSeedStr ? '　·　种子 ' + G.pendingSeedStr : '　·　S 输入种子'), W / 2, 504);
  // tease the meta goals that are still open
  const lockedGoals = UNLOCK_DEFS.filter(u => !metaHas(u.id));
  ctx.font = '13px Trebuchet MS';
  ctx.fillStyle = 'rgba(180,166,140,0.55)';
  if (lockedGoals.length) {
    const shown = lockedGoals.slice(0, 3).map(u => u.how + ' → ' + u.label).join('　·　');
    ctx.fillText('解锁目标（已 ' + (UNLOCK_DEFS.length - lockedGoals.length) + '/' + UNLOCK_DEFS.length + '）　' + shown, W / 2, 532);
  } else {
    ctx.fillText('全部解锁达成!', W / 2, 532);
  }
  ctx.restore();
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

// End-of-run screens: a page torn from a kid's sketchbook — wobbly crayon
// borders, every glyph hand-jittered (seeds are fixed so nothing shimmers).
function renderStatsPaper(dead) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.74)';
  ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2);
  ctx.rotate(dead ? -0.035 : 0.025);
  const pw = 440, ph = 430;
  // paper with a slightly torn edge
  const rng = mulberry32(dead ? 4210 : 9182);
  ctx.fillStyle = '#efe7d2';
  ctx.strokeStyle = '#1a130b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const edge = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) edge.push([-pw / 2 + (pw * i) / steps, -ph / 2 + (rng() - 0.5) * 5]);
  for (let i = 0; i <= steps; i++) edge.push([pw / 2 + (rng() - 0.5) * 5, -ph / 2 + (ph * i) / steps]);
  for (let i = steps; i >= 0; i--) edge.push([-pw / 2 + (pw * i) / steps, ph / 2 + (rng() - 0.5) * 5]);
  for (let i = steps; i >= 0; i--) edge.push([-pw / 2 + (rng() - 0.5) * 5, -ph / 2 + (ph * i) / steps]);
  ctx.moveTo(edge[0][0], edge[0][1]);
  for (const [ex, ey] of edge) ctx.lineTo(ex, ey);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // crayon double border, like a kid framing their drawing
  const borderCol = dead ? '#b8432e' : '#d8a02a';
  const brng = mulberry32(dead ? 77 : 88);
  const bx = pw / 2 - 22, by = ph / 2 - 22;
  drawCrayonLine(ctx, -bx, -by, bx, -by, brng, borderCol, 3);
  drawCrayonLine(ctx, bx, -by, bx, by, brng, borderCol, 3);
  drawCrayonLine(ctx, bx, by, -bx, by, brng, borderCol, 3);
  drawCrayonLine(ctx, -bx, by, -bx, -by, brng, borderCol, 3);

  // title
  drawCrayonText(ctx, dead ? '你死了' : '通关啦!', 0, -ph / 2 + 72, 52,
    dead ? '#b8432e' : '#c77f21', dead ? 314 : 217, { spacing: 10 });

  // dodo face doodle (dead: X eyes / win: happy)
  ctx.save();
  ctx.translate(0, -62);
  ctx.rotate(0.04);
  ctx.lineCap = 'round';
  ctx.fillStyle = '#f8f4e8';
  ctx.strokeStyle = '#3a332b';
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.ellipse(0, 0, 30, 27, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(2, -26); ctx.lineTo(4, -34); ctx.stroke();
  ctx.fillStyle = '#3a332b';
  ctx.beginPath(); ctx.ellipse(6, -36, 5.5, 3, -0.5, 0, TAU); ctx.fill();
  if (dead) {
    ctx.beginPath();
    ctx.moveTo(-15, -10); ctx.lineTo(-5, 0); ctx.moveTo(-5, -10); ctx.lineTo(-15, 0);
    ctx.moveTo(15, -10); ctx.lineTo(5, 0); ctx.moveTo(5, -10); ctx.lineTo(15, 0);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 12, 6, 0, TAU); ctx.stroke();
    // crayon tear drops falling off the face
    ctx.fillStyle = '#7d9ab5';
    for (const [tx, ty, ts] of [[-24, 16, 1], [26, 22, 0.8], [-32, 34, 0.6]]) {
      ctx.save();
      ctx.translate(tx, ty); ctx.scale(ts, ts);
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.quadraticCurveTo(6, 2, 0, 6); ctx.quadraticCurveTo(-6, 2, 0, -7);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  } else {
    ctx.fillStyle = '#3a332b';
    ctx.beginPath();
    ctx.ellipse(-10, -6, 3.5, 5, 0, 0, TAU);
    ctx.ellipse(10, -6, 3.5, 5, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath(); ctx.arc(0, 6, 10, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    // crayon sun in the paper corner
    ctx.save();
    ctx.translate(pw / 2 - 64, -ph / 2 + 66);
    ctx.strokeStyle = '#d8a02a';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.3;
      ctx.moveTo(Math.cos(a) * 16, Math.sin(a) * 16);
      ctx.lineTo(Math.cos(a) * 23, Math.sin(a) * 23);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // stats in wobbly handwriting
  drawCrayonText(ctx, '打倒了 ' + G.stats.kills + ' 只怪物', 0, 26, 23, '#4a4136', 511, { spacing: 2 });
  drawCrayonText(ctx, '捡到了 ' + G.stats.items + ' 个宝贝', 0, 62, 23, '#4a4136', 622, { spacing: 2 });
  drawCrayonText(ctx, '走了 ' + fmtTime(G.stats.time) + ' 那么久', 0, 98, 23, '#4a4136', 733, { spacing: 2 });
  if (G.newUnlocks.length) {
    drawCrayonText(ctx, '新解锁　' + G.newUnlocks.map(u => u.label).join('、'), 0, 124, 15,
      '#b8860b', 424, { spacing: 1 });
  }

  if (dead) {
    // the small sad line, in teary blue-gray pencil
    drawCrayonText(ctx, '眼泪流干了，也还是没能走出去', 0, G.newUnlocks.length ? 150 : 138, 16, '#7b8794', 999, { spacing: 1 });
  } else if (LB.submitState) {
    const msg = {
      saving: '成绩上传中…',
      best: '新纪录! 已登上排行榜，暂停可查看',
      kept: '没打破你的最佳成绩，榜单保持不变',
      failed: '成绩上传失败了，下次通关再试吧',
    }[LB.submitState];
    drawCrayonText(ctx, msg, 0, G.newUnlocks.length ? 150 : 138, 16, '#5f7a4a', 999, { spacing: 1 });
  }

  const blink = Math.sin(performance.now() / 300) > -0.3;
  drawCrayonText(ctx, '按 Enter 或 点一下 再来一次', 0, ph / 2 - 44, 19,
    dead ? '#8a3a2a' : '#7a6222', 846, { spacing: 1, alpha: blink ? 1 : 0.3 });
  ctx.restore();
}

function renderDeath() { renderStatsPaper(true); }
function renderWin() { renderStatsPaper(false); }

// ---------------- pause overlay ----------------
// Clickable region for the changelog / manual link at the bottom of the overlay.
const PAUSE_DOC_RECT = { x: W / 2 - 200, y: H - 36, w: 400, h: 32 };
function pauseDocLinkHit(e) {
  const r = canvas.getBoundingClientRect();
  const cx = (e.clientX - r.left) * (W / r.width);
  const cy = (e.clientY - r.top) * (H / r.height);
  return cx >= PAUSE_DOC_RECT.x && cx <= PAUSE_DOC_RECT.x + PAUSE_DOC_RECT.w &&
         cy >= PAUSE_DOC_RECT.y && cy <= PAUSE_DOC_RECT.y + PAUSE_DOC_RECT.h;
}

function lbTimeStr(ms) {
  const sec = ms / 1000;
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}

// Right-hand pause panel: fastest-clear leaderboard from popo Runtime data.
function renderLeaderboardPanel(rx, py, rw) {
  ctx.font = '14px Trebuchet MS';
  ctx.textAlign = 'center';
  const hint = msg => {
    ctx.fillStyle = 'rgba(200,186,158,0.6)';
    ctx.fillText(msg, rx + rw / 2, py + 96);
  };
  if (!LB.sdkPresent) { hint('排行榜仅在线上版可用'); return; }
  if (!LB.available) { hint('排行榜连接中…'); return; }
  if (!LB.rows) { hint(LB.error ? '排行榜加载失败' : '加载中…'); return; }
  if (!LB.rows.length) { hint('还没有人通关，冲第一个!'); return; }

  const meName = LB.me && LB.me.userName;
  const rowH = 27;
  ctx.font = '15px Trebuchet MS';
  const drawRow = (rank, row, y) => {
    const self = row.player === meName;
    ctx.fillStyle = self ? '#f4c95d' : (rank === 1 ? '#e8b64a' : 'rgba(216,204,176,0.85)');
    ctx.textAlign = 'left';
    ctx.fillText(rank + '.', rx + 26, y);
    ctx.fillText(row.player + (self ? ' (我)' : ''), rx + 62, y);
    ctx.textAlign = 'right';
    ctx.fillText(lbTimeStr(row.timeMs), rx + rw - 26, y);
  };
  const top = LB.rows.slice(0, 8);
  top.forEach((row, i) => drawRow(i + 1, row, py + 18 + i * rowH));
  // own rank still shows when outside the top 8
  const myIdx = meName ? LB.rows.findIndex(r => r.player === meName) : -1;
  if (myIdx >= 8) drawRow(myIdx + 1, LB.rows[myIdx], py + 18 + 8 * rowH);
}

function renderPause() {
  const p = G.player;
  ctx.save();
  ctx.fillStyle = 'rgba(8,6,4,0.68)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.font = 'bold 58px Georgia';
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#0f0a07';
  ctx.strokeText('暂 停', W / 2, 132);
  ctx.fillStyle = '#e8dcc0';
  ctx.fillText('暂 停', W / 2, 132);

  // two panels side by side: attribute sheet (left) + leaderboard (right)
  const rows = [
    ['生命', G.floorCurse === 'unknown' ? '???'
      : Math.ceil(p.hp / 2) + ' / ' + Math.ceil(p.maxHp / 2) + ' 心'
      + (p.soulHp > 0 ? '　+ ' + (p.soulHp / 2) + ' 魂心' : '')],
    ['攻击力', p.damage.toFixed(1)],
    ['射速', (1 / p.fireDelay).toFixed(2) + ' 发/秒'],
    ['弹速', Math.round(p.shotSpeed)],
    ['射程', Math.round(p.range)],
    ['移速', Math.round(p.moveSpeed)],
  ];
  const rowH = 30, boxY = 152, boxH = rows.length * rowH + 96;
  const lx = 44, lw = 432, px = lx + 26, py = boxY + 34;
  const rx = 500, rw = 416;
  ctx.fillStyle = 'rgba(20,14,10,0.72)';
  ctx.strokeStyle = '#3b2c1d';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.rect(lx, boxY, lw, boxH); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.rect(rx, boxY, rw, boxH); ctx.fill(); ctx.stroke();

  ctx.font = 'bold 15px Trebuchet MS';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(232,220,192,0.55)';
  const curseTag = G.floorCurse ? '　·　' + FLOOR_CURSES[G.floorCurse].name : '';
  ctx.fillText(FLOOR_NAMES[G.floorNum - 1] + '　第 ' + G.floorNum + ' / ' + FLOOR_COUNT + ' 层' + curseTag, px, py - 12);
  ctx.fillText('最速通关榜', rx + 26, py - 12);
  rows.forEach(([k, v], i) => {
    const y = py + 18 + i * rowH;
    ctx.fillStyle = 'rgba(216,204,176,0.8)';
    ctx.fillText(k, px, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#efe6d2';
    ctx.fillText(v, px + 380, y);
    ctx.textAlign = 'left';
    ctx.strokeStyle = 'rgba(120,100,72,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, y + 8); ctx.lineTo(px + 380, y + 8); ctx.stroke();
  });
  // run summary sits at the bottom of the left panel
  ctx.textAlign = 'center';
  ctx.font = '14px Trebuchet MS';
  ctx.fillStyle = 'rgba(200,186,158,0.75)';
  ctx.fillText('道具 ' + G.stats.items + ' 件　击杀 ' + G.stats.kills + '　金币 ' + p.coins +
    '　时间 ' + fmtTime(G.stats.time) + '　种子 ' + G.seedStr, lx + lw / 2, py + 36 + rows.length * rowH);

  renderLeaderboardPanel(rx, py, rw);

  // taken items: every icon, no names — wrapped and shrunk so any count fits
  const taken = p.itemsTaken;
  if (taken.length) {
    const rowsN = taken.length > 29 ? 2 : 1;
    const cols = Math.ceil(taken.length / rowsN);
    const gap = Math.min(30, (W - 100) / Math.max(cols - 1, 1));
    const scale = clamp(gap / 38, 0.42, 0.78);
    const gridY = rowsN === 2 ? 452 : 466;
    for (let r = 0; r < rowsN; r++) {
      const rowItems = taken.slice(r * cols, (r + 1) * cols);
      const startX = W / 2 - ((rowItems.length - 1) * gap) / 2;
      rowItems.forEach((id, c) => {
        const def = ITEM_BY_ID[id];
        if (!def) return;
        ctx.save();
        ctx.translate(startX + c * gap, gridY + r * 34);
        ctx.scale(scale, scale);
        drawItemIcon(ctx, 0, 0, def);
        ctx.restore();
      });
    }
  }

  ctx.textAlign = 'center';
  ctx.font = 'bold 19px Georgia';
  ctx.fillStyle = Math.sin(G.pauseAnim * 4) > -0.3 ? '#efe6d2' : 'rgba(239,230,210,0.3)';
  ctx.fillText('按 P 继续　·　切换窗口会自动暂停', W / 2, H - 46);

  // changelog / manual doc link (the one clickable spot on this overlay)
  const link = '更新日志与玩法说明 · 点这里查看';
  ctx.font = '15px Trebuchet MS';
  ctx.fillStyle = '#8fb8dd';
  ctx.fillText(link, W / 2, H - 16);
  const tw = ctx.measureText(link).width;
  ctx.strokeStyle = 'rgba(143,184,221,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W / 2 - tw / 2, H - 12); ctx.lineTo(W / 2 + tw / 2, H - 12); ctx.stroke();
  ctx.restore();
}

// ---------------- main loop ----------------
let lastT = performance.now();
function loop(t) {
  const dt = Math.min(1 / 30, (t - lastT) / 1000);
  lastT = t;
  if (G.paused) G.pauseAnim += dt;
  else if (G.state === 'play') updatePlay(dt);
  else { updateParticles(G, dt); G.shake = Math.max(0, G.shake - dt * 40); }
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
