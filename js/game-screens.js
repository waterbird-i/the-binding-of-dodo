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
  ctx.font = 'bold 30px ' + UI_SERIF;
  ctx.fillText('The Binding of', W / 2, 140);
  ctx.font = 'bold 92px ' + UI_SERIF;
  ctx.lineWidth = 10;
  ctx.strokeText('dodo', W / 2, 232);
  ctx.fillStyle = '#c9231a';
  ctx.fillText('dodo', W / 2, 232);
  ctx.restore();

  // difficulty chip, top-right: ↑↓ on desktop, a tap on touch (see menuDiffHit)
  const dr = MENU_DIFF_RECT;
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(dr.x, dr.y, dr.w, dr.h, 9);
  else ctx.rect(dr.x, dr.y, dr.w, dr.h);
  const diffHot = G.hover.kind === 'diff';
  ctx.fillStyle = diffHot ? 'rgba(44,34,20,0.85)' : 'rgba(28,22,16,0.72)';
  ctx.fill();
  ctx.strokeStyle = diffHot ? 'rgba(244,208,63,0.8)' : 'rgba(200,170,120,0.35)';
  ctx.lineWidth = diffHot ? 2.5 : 1.5;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = DIFF_KEY === 'hard' ? '#e8452f' : (DIFF_KEY === 'easy' ? '#7fd8a8' : '#f4d03f');
  ctx.font = 'bold 17px ' + UI_SANS;
  ctx.fillText('难度 · ' + diffDef().label, dr.x + dr.w / 2, dr.y + 19);
  ctx.font = '12px ' + UI_SANS;
  ctx.fillStyle = 'rgba(200,186,158,0.62)';
  ctx.fillText((IS_TOUCH ? '点击切换' : '↑↓ 切换') + '　' + diffDef().desc, dr.x + dr.w / 2, dr.y + 34);
  ctx.restore();

  // character ring, Isaac style: the picked dodo stands front and center,
  // the other two wait behind on the ellipse
  G.menuDeny = Math.max(0, G.menuDeny - 1 / 60);
  G.menuRot += (G.menuRotT - G.menuRot) * 0.14;
  if (Math.abs(G.menuRotT - G.menuRot) < 0.002) G.menuRot = G.menuRotT;
  const slots = CHAR_DEFS.map((c, i) => ({ c, i, pos: menuCharPos(i) }))
    .sort((a, b) => a.pos.depth - b.pos.depth);   // paint back to front
  for (const { c, i, pos } of slots) {
    const locked = charLocked(c);
    const selected = i === G.charIdx;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.scale(pos.scale, pos.scale);
    ctx.globalAlpha = 0.42 + 0.58 * pos.depth;
    if (selected) {
      ctx.strokeStyle = locked
        ? 'rgba(163,39,27,' + (0.5 + 0.3 * Math.sin(G.menuAnim * 6)) + ')'
        : 'rgba(244,208,63,' + (0.55 + 0.35 * Math.sin(G.menuAnim * 4)) + ')';
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.ellipse(0, 30, 55, 17, 0, 0, TAU); ctx.stroke();
    }
    // the ring slots are click targets too — a quiet ring under the pointer says
    // so without competing with the gold pulse on the selected one
    if (G.hover.kind === 'char' && G.hover.idx === i && !selected) {
      ctx.strokeStyle = 'rgba(240,230,210,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 30, 55, 17, 0, 0, TAU); ctx.stroke();
    }
    const prev = makePlayer(c.id).appearance;
    drawDodo(ctx, 0, 0, {
      walk: G.menuAnim * 11, moving: selected, aimX: 0, aimY: 0.3,
      headColor: locked ? '#332e29' : prev.headColor,
      eyeColor: locked ? '#1c1915' : prev.eyeColor,
      aura: locked ? null : prev.aura,
      brow: locked ? null : prev.brow,
    });
    ctx.restore();
  }

  // the selected character's card sits under the ring; unlock conditions
  // moved into the codex (P) so the menu only whispers that one exists
  const sel = CHAR_DEFS[G.charIdx];
  const selLocked = charLocked(sel);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 19px ' + UI_SERIF;
  ctx.fillStyle = selLocked ? 'rgba(200,186,158,0.8)' : '#f4d03f';
  ctx.fillText(selLocked ? '???' : sel.name, W / 2, 418);
  ctx.font = '14px ' + UI_SANS;
  if (selLocked) {
    ctx.fillStyle = G.menuDeny > 0 ? '#e8452f' : 'rgba(200,186,158,0.6)';
    ctx.fillText('未解锁　·　按 I 查看解锁条件', W / 2, 440);
  } else {
    ctx.fillStyle = 'rgba(200,186,158,0.7)';
    ctx.fillText(sel.desc, W / 2, 440);
  }
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px ' + UI_SERIF;
  ctx.fillStyle = Math.sin(G.menuAnim * 5) > -0.2 ? '#efe6d2' : 'rgba(239,230,210,0.25)';
  ctx.fillText('← → 选择角色　·　按 Enter 或 点击屏幕 开始', W / 2, 466);
  ctx.font = '15px ' + UI_SANS;
  ctx.fillStyle = 'rgba(220,205,180,0.65)';
  ctx.fillText(IS_TOUCH
    ? '左摇杆 移动　四向键 发射眼泪　炸弹 / 道具 悬浮按钮　左上角 暂停 / 图鉴　点小地图看全图'
    : 'WASD 移动　方向键 发射眼泪　E 放炸弹　空格 主动道具　Tab 地图', W / 2, 492);
  ctx.fillText('清空房间开门前进 · 打倒每层 Boss · 炸开秘密房 · 碰撞获取道具变强'
    + (G.pendingSeedStr ? '　·　种子 ' + G.pendingSeedStr : '　·　S 输入种子'), W / 2, 514);
  // goals live in the codex now; the menu only counts them
  // goals live in the codex now; the menu only counts them — and the line is a
  // click target, so it answers the pointer like one
  const doneN = UNLOCK_DEFS.filter(u => metaHas(u.id)).length;
  ctx.font = '13px ' + UI_SANS;
  ctx.fillStyle = G.hover.kind === 'codex' ? 'rgba(232,220,192,0.95)' : 'rgba(180,166,140,0.55)';
  ctx.fillText((IS_TOUCH ? '点这里打开解锁图鉴' : '按 I 或点这里打开解锁图鉴') + '　·　已解锁 ' + doneN + ' / ' + UNLOCK_DEFS.length, W / 2, 540);
  ctx.restore();

  // the codex overlay is drawn by render() instead, above the grain pass
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

// Entrance timing for the end-of-run sheet, counted in 1/60 steps like the unlock
// card. It is ticked from the main loop (not only from the drawing call), because
// the reset has to happen while the game is *out* of the end state: with the call
// sitting inside renderStatsPaper alone, the "left the screen" branch was
// unreachable and the second death of a session skipped its animation entirely.
let _endRef = null, _endAge = 0;
function endAnimK() {
  if (G.state !== 'dead' && G.state !== 'win') { _endRef = null; _endAge = 0; return 1; }
  if (_endRef !== G.state) { _endRef = G.state; _endAge = 0; }
  _endAge += 1 / 60;
  return clamp(_endAge / 0.4, 0, 1);
}
// End-of-run screens: a page torn from a kid's sketchbook — wobbly crayon
// borders, every glyph hand-jittered (seeds are fixed so nothing shimmers).
function renderStatsPaper(dead) {
  // 讨伐 dumate 成功的一局也走这里：账按通关记，纸却是死亡样式——
  // 它认下了你的胜利，但没放你走（见 game-flow.js 的斩杀演出）
  const executed = !dead && G.dumateWin;
  // The sheet used to be there the instant the run ended. Now it falls in: the
  // scrim fades, the paper drops 26px and unwinds its tilt. Same crayon page,
  // but the moment reads as an event instead of a screen swap.
  const inK = endAnimK();
  const ease = 1 - Math.pow(1 - inK, 3);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,' + (0.74 * ease).toFixed(3) + ')';
  ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2 + (1 - ease) * 26);
  ctx.rotate((dead ? -0.035 : 0.025) * ease);
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
  const borderCol = dead ? '#b8432e' : (executed ? '#5f6ee9' : '#d8a02a');
  const brng = mulberry32(dead ? 77 : 88);
  const bx = pw / 2 - 22, by = ph / 2 - 22;
  drawCrayonLine(ctx, -bx, -by, bx, -by, brng, borderCol, 3);
  drawCrayonLine(ctx, bx, -by, bx, by, brng, borderCol, 3);
  drawCrayonLine(ctx, bx, by, -bx, by, brng, borderCol, 3);
  drawCrayonLine(ctx, -bx, by, -bx, -by, brng, borderCol, 3);

  // title（讨伐 dumate 归来的那张纸也写着「你死了」，只是墨色是它的蓝）
  const title = (dead || executed) ? '你死了' : '通关啦!';
  drawCrayonText(ctx, title, 0, -ph / 2 + 72, 52,
    dead ? '#b8432e' : (executed ? '#5f6ee9' : '#c77f21'), dead ? 314 : 217, { spacing: 10 });

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
  if (dead || executed) {
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

  // 本局难度：一行小字压在涂鸦下面（纸条上那段空白刚好够，不挤统计）
  drawCrayonText(ctx, '难度 · ' + diffDef().label, 0, -4, 16, '#6b6152', 512, { spacing: 1 });
  // stats in wobbly handwriting
  drawCrayonText(ctx, '打倒了 ' + G.stats.kills + ' 只怪物', 0, 26, 23, '#4a4136', 511, { spacing: 2 });
  drawCrayonText(ctx, '捡到了 ' + G.stats.items + ' 个宝贝', 0, 62, 23, '#4a4136', 622, { spacing: 2 });
  drawCrayonText(ctx, '走了 ' + fmtTime(G.stats.time) + ' 那么久', 0, 98, 23, '#4a4136', 733, { spacing: 2 });
  if (G.newUnlocks.length) {
    drawCrayonText(ctx, '新解锁　' + G.newUnlocks.map(u => u.label).join('、'), 0, 124, 15,
      '#b8860b', 424, { spacing: 1 });
  }

  if (executed) {
    drawCrayonText(ctx, '你赢下了那一战，却没能走出地牢', 0, G.newUnlocks.length ? 170 : 158, 16,
      '#5f6ee9', 777, { spacing: 1 });
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
// Canvas-space test, shared by the click handler and the hover pass. It also
// fixes a quiet bug: the old version mapped the pointer with a plain rect scale,
// which is wrong in fake-landscape mode where the canvas is rotated 90°.
function pauseDocLinkHitXY(cx, cy) {
  const r = PAUSE_DOC_RECT;
  return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
}
function pauseDocLinkHit(e) {
  const pos = canvasXY(e);
  return pauseDocLinkHitXY(pos.x, pos.y);
}

// Taken-item grid geometry, shared by the drawing pass and pauseItemHit. The
// icons shrink to fit any count, so the hit boxes have to be derived from the
// same numbers rather than hard-coded.
function pauseItemGrid() {
  const taken = G.player ? G.player.itemsTaken : [];
  const rowsN = taken.length > 29 ? 2 : 1;
  const cols = Math.ceil(taken.length / rowsN);
  const gap = Math.min(30, (W - 100) / Math.max(cols - 1, 1));
  return { taken, rowsN, cols, gap, scale: clamp(gap / 38, 0.42, 0.78),
    gridY: rowsN === 2 ? 452 : 466 };
}
function pauseItemHit(cx, cy) {
  if (!G.paused || G.mapOverlay || G.unlockPanel || !G.player) return null;
  const g = pauseItemGrid();
  if (!g.taken.length) return null;
  const r = 20 * g.scale + 4;
  for (let i = 0; i < g.taken.length; i++) {
    const row = Math.floor(i / g.cols), col = i % g.cols;
    const n = Math.min(g.cols, g.taken.length - row * g.cols);
    const startX = W / 2 - ((n - 1) * g.gap) / 2;
    const x = startX + col * g.gap, y = g.gridY + row * 34;
    if (Math.abs(cx - x) > r || Math.abs(cy - y) > r) continue;
    const def = ITEM_BY_ID[g.taken[i]];
    // i + x/y come along so the caller can highlight this exact slot (ids can
    // repeat) and anchor the tooltip on the icon that was actually hovered
    if (def) return { i, x, y, id: g.taken[i], def };
  }
  return null;
}

function lbTimeStr(ms) {
  const sec = ms / 1000;
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}

// Right-hand pause panel: fastest-clear leaderboard from platform dynamic data.
function renderLeaderboardPanel(rx, py, rw) {
  ctx.font = '14px ' + UI_SANS;
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
  ctx.font = '15px ' + UI_SANS;
  const drawRow = (rank, row, y) => {
    const self = row.player === meName;
    ctx.fillStyle = self ? '#f4c95d' : (rank === 1 ? '#e8b64a' : 'rgba(216,204,176,0.85)');
    ctx.textAlign = 'left';
    ctx.fillText(rank + '.', rx + 26, y);
    ctx.fillText(row.player + (self ? ' (我)' : ''), rx + 62, y);
    ctx.textAlign = 'right';
    // 讨伐过 dumate 的记录带荣誉后缀：主用时+(讨伐用时)
    ctx.fillText(lbTimeStr(row.timeMs)
      + (row.dumateMs ? '+(' + lbTimeStr(row.dumateMs) + ')' : ''), rx + rw - 26, y);
  };
  const top = LB.rows.slice(0, 8);
  top.forEach((row, i) => drawRow(i + 1, row, py + 18 + i * rowH));
  // own rank still shows when outside the top 8
  const myIdx = meName ? LB.rows.findIndex(r => r.player === meName) : -1;
  if (myIdx >= 8) drawRow(myIdx + 1, LB.rows[myIdx], py + 18 + 8 * rowH);
}

function renderPause() {
  const p = G.player;
  // The overlay used to appear in a single frame. It eases in over 0.15s and the
  // sheet drifts up 12px, so pausing reads as the run stopping rather than the
  // screen being swapped out from under the player. pauseAnim is reset in
  // setPaused, so every pause animates.
  const inK = clamp(G.pauseAnim / 0.15, 0, 1);
  ctx.save();
  // Only the world behind the sheet is still brightening down: the sheet itself
  // slides up at full opacity, so the readout is legible on the very first frame
  // (a whole-overlay fade made the panel a ghost for its first ~9 frames).
  ctx.fillStyle = 'rgba(8,6,4,' + (0.68 * inK).toFixed(3) + ')';
  ctx.fillRect(0, 0, W, H);
  ctx.translate(0, (1 - inK) * 12);
  ctx.textAlign = 'center';
  ctx.font = 'bold 58px ' + UI_SERIF;
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#0f0a07';
  ctx.strokeText('暂 停', W / 2, 132);
  ctx.fillStyle = '#e8dcc0';
  ctx.fillText('暂 停', W / 2, 132);

  // attribute sheet (left); leaderboard (right) only when the platform SDK is present.
  // Each attribute carries a bar whose middle tick is *this character's* starting
  // value, because a bare "3.5 攻击力" never answered the only question a player
  // has — is that more or less than I began with? makePlayer is pure, so asking
  // it for the baseline here is safe.
  const base = makePlayer(p.charId);
  const rows = [
    ['生命', G.floorCurse === 'unknown' ? '???'
      : Math.ceil(p.hp / 2) + ' / ' + Math.ceil(p.maxHp / 2) + ' 心'
      + (p.soulHp > 0 ? '　+ ' + (p.soulHp / 2) + ' 魂心' : ''), null, null],
    ['攻击力', p.damage.toFixed(1), p.damage, base.damage],
    ['射速', (1 / p.fireDelay).toFixed(2) + ' 发/秒', 1 / p.fireDelay, 1 / base.fireDelay],
    ['弹速', String(Math.round(p.shotSpeed)), p.shotSpeed, base.shotSpeed],
    ['射程', String(Math.round(p.range)), p.range, base.range],
    ['移速', String(Math.round(p.moveSpeed)), p.moveSpeed, base.moveSpeed],
  ];
  // Character meters (怒气 / 魂火 / 复活) only ever existed in the HUD during play,
  // so pausing to take stock was the one moment they were invisible. They share a
  // single extra row so the panel never grows into the item grid below it.
  const meters = [];
  if (p.charId === 'rage') meters.push('怒气 ' + (rageBerserk(p) ? '暴走中' : Math.round((p.rageMeter || 0) * 100) + '%'));
  if (p.charId === 'dark') meters.push('魂火 ' + ((p.soulSparks || 0) % 3) + '/3');
  if (p.extraLives > 0) meters.push('复活 ' + p.extraLives + ' 次');
  if (meters.length) rows.push(['状态', meters.join('　'), null, null]);
  const rowH = rows.length > 6 ? 27 : 30;
  const boxY = 152, boxH = rows.length * rowH + 96;
  const showBoard = LB.sdkPresent;
  const lw = 432, lx = showBoard ? 44 : (W - lw) / 2;
  const px = lx + 26, py = boxY + 34;
  const rx = 500, rw = 416;
  ctx.fillStyle = 'rgba(20,14,10,0.72)';
  ctx.strokeStyle = '#3b2c1d';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.rect(lx, boxY, lw, boxH); ctx.fill(); ctx.stroke();
  if (showBoard) { ctx.beginPath(); ctx.rect(rx, boxY, rw, boxH); ctx.fill(); ctx.stroke(); }

  ctx.font = 'bold 15px ' + UI_SANS;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(232,220,192,0.55)';
  const curseTag = G.floorCurse ? '　·　' + FLOOR_CURSES[G.floorCurse].name : '';
  ctx.fillText(FLOOR_NAMES[G.floorNum - 1] + '　第 ' + G.floorNum + ' / ' + FLOOR_COUNT + ' 层' + curseTag, px, py - 12);
  // 本局难度另起一行：楼层名和诅咒名都可能很长，2026-09 实测最长组合挤在同一行会到
  // 386px，超过面板 380px 的内宽。拆开之后两行各自都有 300px+ 余量。
  ctx.font = '13px ' + UI_SANS;
  ctx.fillStyle = 'rgba(200,186,158,0.6)';
  ctx.fillText('难度 ' + diffDef().label, px, py + 2);
  // 恢复字体：下面的属性行沿用当前 canvas 字体，不还原会把整张表缩成 13px
  ctx.font = 'bold 15px ' + UI_SANS;
  if (showBoard) ctx.fillText('最速通关榜', rx + 26, py - 12);
  rows.forEach(([k, v, cur, baseV], i) => {
    const y = py + 18 + i * rowH;
    ctx.fillStyle = 'rgba(216,204,176,0.8)';
    ctx.fillText(k, px, y);
    // relative bar: half length = exactly the character's baseline
    if (cur != null && baseV) {
      const bx = px + 84, bw = 128, by = y - 3;
      const rel = cur / baseV;
      ctx.fillStyle = 'rgba(10,8,6,0.6)';
      ctx.fillRect(bx, by, bw, 6);
      ctx.fillStyle = rel > 1.02 ? '#7fd8a8' : (rel < 0.98 ? '#e8452f' : '#c9a437');
      ctx.fillRect(bx, by, bw * clamp(rel / 2, 0, 1), 6);
      ctx.fillStyle = 'rgba(240,230,210,0.75)';
      ctx.fillRect(bx + bw / 2 - 1, by - 3, 2, 12);   // the baseline tick
      if (Math.abs(rel - 1) > 0.02) {
        ctx.font = 'bold 11px ' + UI_SANS;
        ctx.textAlign = 'right';
        ctx.fillStyle = rel > 1 ? 'rgba(127,216,168,0.9)' : 'rgba(232,69,47,0.9)';
        ctx.fillText((rel > 1 ? '+' : '') + Math.round((rel - 1) * 100) + '%', px + 296, y);
        ctx.font = 'bold 15px ' + UI_SANS;
        ctx.textAlign = 'left';
      }
    }
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
  ctx.font = '14px ' + UI_SANS;
  ctx.fillStyle = 'rgba(200,186,158,0.75)';
  ctx.fillText('道具 ' + G.stats.items + ' 件　击杀 ' + G.stats.kills + '　金币 ' + p.coins +
    '　时间 ' + fmtTime(G.stats.time) + '　种子 ' + G.seedStr, lx + lw / 2, py + 36 + rows.length * rowH);

  if (showBoard) renderLeaderboardPanel(rx, py, rw);

  // Taken items: every icon, no names — wrapped and shrunk so any count fits.
  // Hovering one names it. This panel is the only place a build can be inspected,
  // and 89 hand-drawn icons with subtle differences are not readable off a grid
  // scaled down to 0.42×. Geometry comes from pauseItemGrid so the drawing pass
  // and the hit test can never drift apart.
  const g = pauseItemGrid();
  const hot = pauseItemHit(G.hoverPos ? G.hoverPos.x : -1, G.hoverPos ? G.hoverPos.y : -1);
  if (g.taken.length) {
    for (let r = 0; r < g.rowsN; r++) {
      const rowItems = g.taken.slice(r * g.cols, (r + 1) * g.cols);
      const startX = W / 2 - ((rowItems.length - 1) * g.gap) / 2;
      rowItems.forEach((id, c) => {
        const def = ITEM_BY_ID[id];
        if (!def) return;
        const x = startX + c * g.gap, y = g.gridY + r * 34;
        const box = 17 * g.scale + 3;
        if (hot && hot.i === r * g.cols + c) {
          ctx.strokeStyle = 'rgba(244,208,63,0.85)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.rect(x - box, y - box, box * 2, box * 2); ctx.stroke();
        }
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(g.scale, g.scale);
        drawItemIcon(ctx, 0, 0, def);
        ctx.restore();
      });
    }
    if (hot) drawItemTooltip(ctx, { name: hot.def.name, desc: hot.def.desc, x: hot.x, y: hot.y }, p.coins);
  }

  ctx.textAlign = 'center';
  ctx.font = 'bold 19px ' + UI_SERIF;
  ctx.fillStyle = Math.sin(G.pauseAnim * 4) > -0.3 ? '#efe6d2' : 'rgba(239,230,210,0.3)';
  ctx.fillText(IS_TOUCH
    ? '点击屏幕继续　·　切换窗口会自动暂停'
    : '按 P 继续　·　按 I 看解锁图鉴　·　切换窗口会自动暂停', W / 2, H - 46);

  // changelog / manual doc link (the one clickable spot on this overlay)
  const docHot = G.hover.kind === 'doc';
  const link = '更新日志与玩法说明 · 点这里查看';
  ctx.font = '15px ' + UI_SANS;
  ctx.fillStyle = docHot ? '#cfe6ff' : '#8fb8dd';
  ctx.fillText(link, W / 2, H - 16);
  const tw = ctx.measureText(link).width;
  ctx.strokeStyle = docHot ? 'rgba(207,230,255,0.95)' : 'rgba(143,184,221,0.55)';
  ctx.lineWidth = docHot ? 2 : 1;
  ctx.beginPath(); ctx.moveTo(W / 2 - tw / 2, H - 12); ctx.lineTo(W / 2 + tw / 2, H - 12); ctx.stroke();
  ctx.restore();
}

// ---------------- dumate：终极抉择界面 ----------------
// 击杀 MEGA dodo 且全部角色都通关过之后弹出（js/game-flow.js openDumateOffer）。
// 键盘 ←→/AD 换选项、Enter/空格确认；鼠标与触屏直接点选项框。
const DUMATE_OFFER_BTNS = [
  { x: W / 2 - 330, y: 392, w: 310, h: 104, label: '迎战 dumate', sub: '这座地牢轮不到它做主　战败即一无所有' },
  { x: W / 2 + 20, y: 392, w: 310, h: 104, label: '见好就收', sub: '立即通关　成绩计入排行榜' },
];
function dumateOfferHit(cx, cy) {
  for (let i = 0; i < DUMATE_OFFER_BTNS.length; i++) {
    const b = DUMATE_OFFER_BTNS[i];
    if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) return i;
  }
  return -1;
}

function renderDumateOffer() {
  const off = G.dumateOffer;
  if (!off) return;
  const t = performance.now() / 1000;
  ctx.save();
  ctx.fillStyle = 'rgba(4,4,10,0.82)';
  ctx.fillRect(0, 0, W, H);
  const rad = ctx.createRadialGradient(W / 2, 190, 30, W / 2, 190, 320);
  rad.addColorStop(0, 'rgba(110,126,240,0.3)');
  rad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, W, H);
  // dumate 在门口悬浮着等答复
  ctx.save();
  ctx.translate(W / 2, 176 + Math.sin(t * 1.6) * 6);
  drawDumateBody(ctx, 70, t, {});
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.font = 'bold 40px ' + UI_SERIF;
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#05050c';
  ctx.strokeText('dumate', W / 2, 306);
  ctx.fillStyle = '#aab6ff';
  ctx.fillText('dumate', W / 2, 306);
  ctx.font = '16px ' + UI_SANS;
  ctx.fillStyle = 'rgba(216,214,236,0.9)';
  ctx.fillText('每一位 dodo 都走出过地牢，这一次，出口前浮着一道蓝色的影子', W / 2, 338);
  ctx.fillText('它客气地告知：这座地牢连同里面的一切，如今都归它了，包括你', W / 2, 361);
  const ready = performance.now() - off.openedAt > 900;
  DUMATE_OFFER_BTNS.forEach((b, i) => {
    // the choice responds to the pointer the same way the keyboard selection does
    const sel = off.sel === i || (G.hover.kind === 'offer' && G.hover.idx === i);
    ctx.fillStyle = sel ? 'rgba(38,40,74,0.92)' : 'rgba(14,14,24,0.85)';
    ctx.strokeStyle = sel ? (i === 0 ? '#8f9df5' : '#f4d03f') : '#33334a';
    ctx.lineWidth = sel ? 3.5 : 2;
    ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.fill(); ctx.stroke();
    ctx.font = 'bold 24px ' + UI_SERIF;
    ctx.fillStyle = sel ? '#f3ecd8' : 'rgba(200,196,214,0.75)';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + 44);
    ctx.font = '13px ' + UI_SANS;
    ctx.fillStyle = sel ? 'rgba(216,214,236,0.9)' : 'rgba(160,156,178,0.7)';
    const sub = (i === 1 && !LB.sdkPresent) ? '立即通关' : b.sub;
    ctx.fillText(sub, b.x + b.w / 2, b.y + 72);
  });
  ctx.font = 'bold 16px ' + UI_SERIF;
  ctx.fillStyle = ready && Math.sin(t * 5) > -0.3 ? '#efe6d2' : 'rgba(239,230,210,0.35)';
  ctx.fillText(IS_TOUCH ? '点击选项做出抉择' : '← → 选择　·　Enter 确认　·　也可直接点击', W / 2, H - 40);
  ctx.restore();
}

// ---------------- dumate：斩杀特写 ----------------
// 血条清零后 dumate 并没有死：画面压暗，它瞬移到 dodo 面前，
// 一记斩击带走玩家。时间轴见 game-flow.js 的 updateDumateExec。
function renderDumateExec() {
  const ex = G.dumateExec;
  if (!ex) return;
  const t = ex.t;
  ctx.save();
  // 战场沉入黑暗
  ctx.fillStyle = 'rgba(3,3,8,' + (clamp(t / 0.9, 0, 1) * 0.8) + ')';
  ctx.fillRect(0, 0, W, H);
  // 特写从 0.9s 起浮现
  const k = clamp((t - 0.9) / 0.5, 0, 1);
  if (k > 0) {
    ctx.save();
    ctx.globalAlpha = k;
    const rad = ctx.createRadialGradient(W / 2, H / 2 - 20, 60, W / 2, H / 2 - 20, 380);
    rad.addColorStop(0, 'rgba(110,126,240,0.28)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // dodo 特写：挨了那一击就倒下
    const slashed = ex.slashed;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(W / 2 - 120, H / 2 + 46);
    ctx.scale(2.6, 2.6);
    if (slashed) { ctx.rotate(1.25); ctx.translate(0, -6); }
    const ap = G.player.appearance || {};
    drawDodo(ctx, 0, 0, { walk: 0, moving: false, aimX: slashed ? 0 : 1, aimY: 0,
      headColor: ap.headColor, eyeColor: ap.eyeColor, brow: ap.brow, hurtFlash: slashed });
    if (slashed) {   // 蜡笔叉眼，盖在原本的瞳孔上
      ctx.strokeStyle = '#17110c';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-12.2, -21.5); ctx.lineTo(-5.8, -15.5);
      ctx.moveTo(-5.8, -21.5); ctx.lineTo(-12.2, -15.5);
      ctx.moveTo(-0.5, -20); ctx.lineTo(5.5, -14);
      ctx.moveTo(5.5, -20); ctx.lineTo(-0.5, -14);
      ctx.stroke();
    }
    ctx.restore();

    // dumate 特写：材质化闪烁着靠近，斩击后凑得更近
    ctx.save();
    ctx.globalAlpha = slashed ? 1 : k * (0.7 + 0.3 * Math.abs(Math.sin(t * 26)));
    ctx.translate(W / 2 + 150 - (slashed ? 26 : k * 18), H / 2 - 40 + Math.sin(t * 2.2) * 5);
    drawDumateBody(ctx, 120, t, { mouthOpen: slashed ? 0.6 : 0 });
    ctx.restore();

    if (slashed) {
      const st = t - 1.6;
      // 斩击闪白
      if (st < 0.14) {
        ctx.save();
        ctx.globalAlpha = 1 - st / 0.14;
        ctx.fillStyle = '#dfe6ff';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      // 斩痕划过 dodo
      ctx.save();
      ctx.globalAlpha = clamp(1 - st / 1.1, 0, 1);
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#aab6ff';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 260, H / 2 - 150);
      ctx.lineTo(W / 2 + 40, H / 2 + 130);
      ctx.stroke();
      ctx.strokeStyle = '#eef1ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 248, H / 2 - 152);
      ctx.lineTo(W / 2 + 52, H / 2 + 128);
      ctx.stroke();
      ctx.restore();
      if (t > 2.1) {
        ctx.save();
        ctx.globalAlpha = clamp((t - 2.1) / 0.4, 0, 1);
        ctx.textAlign = 'center';
        ctx.font = 'bold 22px ' + UI_SERIF;
        ctx.fillStyle = '#aab6ff';
        ctx.fillText('它认下了你的胜利，却没打算放你走', W / 2, H - 92);
        ctx.restore();
      }
    }
  }
  // 收尾淡出到黑，等结算纸接场
  const fade = clamp((t - 2.5) / 0.9, 0, 1);
  if (fade > 0) {
    ctx.fillStyle = 'rgba(0,0,0,' + fade + ')';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// ---------------- main loop ----------------
let lastT = performance.now();
function loop(t) {
  const dt = Math.min(1 / 30, (t - lastT) / 1000);
  lastT = t;
  if (G.paused) G.pauseAnim += dt;
  else if (G.state === 'play') updatePlay(dt);
  else {
    if (G.state === 'dumateExec') updateDumateExec(dt);
    updateParticles(G, dt);
    G.shake = Math.max(0, G.shake - dt * 40);
  }
  // screen damage bloom decays on wall-clock time so it also fades on the death
  // screen, where updatePlay no longer runs
  G.hurtT = Math.max(0, (G.hurtT || 0) - dt);
  // hover is re-derived every frame: hit regions appear and disappear with the
  // game state (pause panel, dumate choice) while the pointer sits still
  refreshHover();
  // ticked here so leaving the end screen (which happens outside renderStatsPaper)
  // resets the sheet's entrance timer — see endAnimK
  endAnimK();
  syncTouchButtons();
  syncAnnounce();
  syncMusic();
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
