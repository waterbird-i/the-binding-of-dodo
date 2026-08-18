'use strict';
// ---------------- render ----------------
function render() {
  ctx.save();
  if (G.shake > 0 && !G.paused) ctx.translate(rand(-G.shake, G.shake) * 0.5, rand(-G.shake, G.shake) * 0.5);

  if (G.state === 'menu') { renderMenu(); ctx.restore(); applyPostFX(ctx); return; }

  // room base
  const room = G.room;
  if (!room._base) buildRoomBase(room);
  ctx.drawImage(room._base, 0, 0);

  // blood stains
  for (const s of room.stains) drawStain(ctx, s);

  // trapdoor
  if (room.trapdoor) {
    ctx.save();
    ctx.translate(room.trapdoor.x, room.trapdoor.y);
    ctx.fillStyle = '#0c0906';
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, 0, 26, 18, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#3a2c1c';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, 19, 12, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  // the spiked hatch: same hole, ringed with red spikes and an ominous pulse
  if (room.trapdoorHard) {
    const td = room.trapdoorHard;
    ctx.save();
    ctx.translate(td.x, td.y);
    ctx.fillStyle = '#a3271b';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 22, Math.sin(a) * 15);
      ctx.lineTo(Math.cos(a + 0.2) * 32, Math.sin(a + 0.2) * 22.5);
      ctx.lineTo(Math.cos(a - 0.2) * 32, Math.sin(a - 0.2) * 22.5);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#160806';
    ctx.strokeStyle = '#7e1a10';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, 0, 26, 18, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(201,35,26,' + (0.3 + 0.3 * Math.sin(performance.now() / 220)) + ')';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 36, 26, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  // doors (hidden secret walls draw nothing — the wall looks solid)
  const DOOR_KINDS = { boss: 1, treasure: 1, shop: 1, curse: 1, challenge: 1, secret: 1, devil: 1, sacrifice: 1 };
  for (const side of ['N', 'S', 'W', 'E']) {
    const next = room.doors[side];
    if (!next) continue;
    if (room.hiddenSides && room.hiddenSides[side]) continue;
    const doorKind = DOOR_KINDS[next.kind] ? next.kind
      : (room.kind === 'curse' ? 'curse' : 'normal');   // curse spikes hurt on the way out too
    drawDoor(ctx, side, room.cleared ? 'open' : 'closed', doorKind);
  }

  // rocks
  for (const rk of room.rocks) drawRock(ctx, rk.cx, rk.cy, room.seed);

  // sacrifice altar spikes / devil statue (room furniture, drawn live)
  if (room.kind === 'sacrifice') drawSpikeBed(ctx, W / 2, H / 2, performance.now() / 1000);
  if (room.kind === 'devil') drawDevilStatue(ctx, W / 2, H / 2 - 65, performance.now() / 1000);

  // pedestals & pickups
  for (const ped of room.pedestals) {
    drawPedestal(ctx, ped);
    // devil deals wear their price in hearts under the pedestal
    if (ped.devilPrice && !ped.taken && ped.def) {
      for (let i = 0; i < ped.devilPrice; i++) {
        drawHeartShape(ctx, ped.x - (ped.devilPrice - 1) * 10 + i * 20, ped.y + 36, 11, '#c9231a', PAL.outline);
      }
    }
  }
  for (const pk of room.pickups) drawPickup(ctx, pk);
  if (room.shopItems) for (const w of room.shopItems) drawShopWare(ctx, w, G.player.coins);
  for (const b of G.liveBombs) drawLiveBomb(ctx, b);

  // entities sorted by y for painter's order
  const drawList = [];
  for (const e of G.enemies) drawList.push({ y: e.y, fn: () => drawEnemyByType(e) });
  for (const f of G.familiars) drawList.push({ y: f.y, fn: () => drawFamiliar(ctx, f) });
  const p = G.player;
  if (G.state !== 'dead' || true) drawList.push({
    y: p.y, fn: () => {
      if (p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0 && G.state === 'play') return; // blink
      // facing for the 8-direction wing pose: movement wins, else aim
      const fdx = p.moving ? p.vx : p.aimX, fdy = p.moving ? p.vy : p.aimY;
      drawDodo(ctx, p.x, p.y, {
        walk: p.walk, moving: p.moving, aimX: p.aimX, aimY: p.aimY,
        hurtFlash: p.hurtFlash > 0,
        headColor: p.appearance.headColor, eyeColor: p.appearance.eyeColor,
        hat: p.appearance.hat, big: p.appearance.big,
        aura: rageBerserk(p) ? 'rgba(201,35,26,0.42)' : p.appearance.aura,
        brow: p.appearance.brow,
        blink: p.blink > 0,
        wings: p.flight, wingGrow: p.wingGrow, flap: p.flap,
        dirX: fdx, dirY: fdy,
      });
      // Holy Mantle bubble
      if (p.shieldUp) {
        ctx.save();
        ctx.strokeStyle = 'rgba(180,220,255,' + (0.45 + 0.2 * Math.sin(p.walk * 2)) + ')';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(p.x, p.y - 10, 30, 36, 0, 0, TAU); ctx.stroke();
        ctx.restore();
      }
      // Brimstone charge-up: a blood orb swells at the beak + progress ring
      if (p.laser && p.laserCharge > 0) {
        const k = clamp(p.laserCharge / laserChargeTime(p), 0, 1);
        const ox = p.x + p.aimX * 22, oy = p.y - 10 + p.aimY * 22;
        ctx.save();
        ctx.globalAlpha = 0.45 + 0.55 * k;
        ctx.fillStyle = '#c9231a';
        ctx.beginPath();
        ctx.arc(ox, oy, 3 + 8 * k + Math.sin(performance.now() / 35) * 1.5 * k, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,140,120,' + (0.35 + 0.65 * k) + ')';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(ox, oy, 14, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
        ctx.restore();
      }
    }
  });
  drawList.sort((a, b) => a.y - b.y);
  for (const d of drawList) d.fn();

  // projectiles + particles on top
  for (const t of G.tears) drawTear(ctx, t);
  for (const s of G.eshots) drawEnemyShot(ctx, s);
  for (const b of G.beams) drawBeam(ctx, b);
  for (const l of G.lasers) drawLaser(ctx, l);
  for (const o of G.orbits) drawOrbital(ctx, o);
  for (const pa of G.particles) {
    ctx.globalAlpha = clamp(pa.life / pa.maxLife, 0, 1);
    ctx.fillStyle = pa.color;
    ctx.beginPath(); ctx.arc(pa.x, pa.y, pa.r, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // item info cards float above everything else in the room: pedestals,
  // pickups and shop wares all show name + effect when the player is near
  const tips = [];
  for (const ped of room.pedestals) {
    if (ped.taken || !ped.def) continue;
    if (dist(ped.x, ped.y, p.x, p.y) < 90) {
      const tip = { name: ped.def.name, desc: ped.def.desc, x: ped.x, y: ped.y };
      if (ped.devilPrice) {
        tip.priceLabel = '代价　' + devilDealLabel(p, ped.devilPrice);
        tip.can = devilDealAfford(p, ped.devilPrice);
      }
      tips.push(tip);
    }
  }
  for (const pk of room.pickups) {
    if (pk.taken) continue;
    if (dist(pk.x, pk.y, p.x, p.y) < 90) {
      const t = { heart: ['红心', '回复一颗心!'], halfheart: ['半颗心', '回复半颗心!'],
        soulheart: ['魂心', '蓝色护心 先于红心消耗!'],
        coin: ['金币', '捡起来存进钱袋!'], chest: ['宝箱', '开启宝箱拿奖励!'],
        bomb: ['炸弹', (IS_TOUCH ? '点「炸弹」按钮放置' : '按 E 放置') + ' 能炸开裂缝的墙!'],
        battery: ['电池', '为主动道具充能一层!'],
        soulflame: ['魂火', '充能一层 集齐 3 团凝成半颗魂心!'] }[pk.kind];
      if (t) tips.push({ name: t[0], desc: t[1], x: pk.x, y: pk.y });
    }
  }
  if (room.kind === 'sacrifice' && dist(W / 2, H / 2, p.x, p.y) < 130) {
    tips.push(room.altarDone
      ? { name: '献祭尖刺', desc: '祭坛已经餍足 不再回应', x: W / 2, y: H / 2 }
      : { name: '献祭尖刺', desc: '以血换取馈赠　已献祭 ' + (room.sacrifices || 0) + '/7',
          x: W / 2, y: H / 2 });
  }
  if (room.shopItems) {
    for (const w of room.shopItems) {
      if (w.near && !w.taken) {
        tips.push({ name: w.def ? w.def.name : w.name,
          desc: w.def ? w.def.desc : w.desc, price: w.price, x: w.x, y: w.y });
      }
    }
  }
  if (room.trapdoorHard && room.trapdoor) {
    if (dist(room.trapdoor.x, room.trapdoor.y, p.x, p.y) < 90) {
      tips.push({ name: '安稳之路', desc: '普普通通的下一层', x: room.trapdoor.x, y: room.trapdoor.y });
    }
    if (dist(room.trapdoorHard.x, room.trapdoorHard.y, p.x, p.y) < 90) {
      tips.push({ name: '危险之路', desc: '敌人更强 但宝物翻倍!', x: room.trapdoorHard.x, y: room.trapdoorHard.y });
    }
  }
  for (const t of tips) drawItemTooltip(ctx, t, G.player.coins);

  // curse of darkness: the room falls into shadow around a small lantern
  // radius — devil rooms live in the same gloom by nature
  if (G.state === 'play' && (G.floorCurse === 'darkness' || room.kind === 'devil')) {
    const dark = ctx.createRadialGradient(p.x, p.y, 55, p.x, p.y, 320);
    dark.addColorStop(0, 'rgba(4,2,1,0)');
    dark.addColorStop(0.55, 'rgba(4,2,1,0.4)');
    dark.addColorStop(1, 'rgba(4,2,1,0.86)');
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, W, H);
  }

  renderHUD();
  if (G.state === 'play' && G.floorIntro) renderFloorIntro();
  ctx.restore();

  if (G.state === 'play' && G.mapOverlay && G.floorCurse !== 'lost') drawFullMap(ctx, G.floor, G.room);
  if (G.state === 'dead') renderDeath();
  if (G.state === 'win') renderWin();
  // the map overlay stands in for the pause panel: on touch it opens by pausing
  if (G.paused && !G.mapOverlay) (G.unlockPanel ? renderUnlockPanel() : renderPause());
  if (G.unlockPopups.length) renderUnlockPopups();
  applyPostFX(ctx);
}

function drawEnemyByType(e) {
  // materialize animation: rises out of the floor, fades in, with a
  // shrinking ring on the ground so the grace window reads clearly
  if (e.spawnT > 0) {
    const k = clamp(1 - e.spawnT / (e.spawnMax || 0.55), 0, 1);
    const groundY = e.y + e.r * 0.95;
    ctx.save();
    ctx.strokeStyle = 'rgba(240,230,210,' + (0.35 + 0.3 * Math.abs(Math.sin(e.anim * 18))) + ')';
    ctx.lineWidth = 3;
    const ringR = e.r * (2.4 - 1.5 * k);
    ctx.beginPath(); ctx.ellipse(e.x, groundY, ringR, ringR * 0.42, 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.2 + 0.8 * k;
    ctx.beginPath(); ctx.rect(e.x - e.r * 3.2, groundY - 420, e.r * 6.4, 420);
    ctx.clip();
    ctx.translate(0, (1 - k) * e.r * 1.8);
    drawEnemyCore(e);
    ctx.restore();
    return;
  }
  drawEnemyCore(e);
}

// Each enemy's art is authored at a fixed reference radius; before drawing we
// scale the whole sprite by (e.r / ref) around its position. Tuning a
// collision radius therefore rescales face and body together — features can
// never drift out of sync with the hitbox.
const ENEMY_REF_R = {
  gaper: 16, fly: 9, spitter: 16, hopper: 13, sentry: 17,
  boomfly: 12, globin: 15, knight: 15, vis: 16,
};
function drawEnemyCore(e) {
  const ref = ENEMY_REF_R[e.type];
  const k = ref ? e.r / ref : 1;
  const scaled = Math.abs(k - 1) > 0.01;
  if (scaled) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(k, k);
    ctx.translate(-e.x, -e.y);
  }
  switch (e.type) {
    case 'gaper': drawGaper(ctx, e); break;
    case 'fly': drawFly(ctx, e); break;
    case 'spitter': drawSpitter(ctx, e); break;
    case 'hopper': drawHopper(ctx, e); break;
    case 'sentry': drawSentry(ctx, e); break;
    case 'boomfly': drawBoomfly(ctx, e); break;
    case 'globin': drawGlobin(ctx, e); break;
    case 'knight': drawKnight(ctx, e); break;
    case 'vis': drawVis(ctx, e); break;
    case 'boss': drawBossByDef(ctx, e); break;
  }
  if (scaled) ctx.restore();
}

function renderHUD() {
  const p = G.player;
  // on touch the left column slides below the corner buttons (see syncHudTop)
  ctx.save();
  ctx.translate(0, G.hudTop);
  if (G.floorCurse === 'unknown') {
    // curse of the unknown: the heart row collapses into a single '?'
    drawHeartShape(ctx, 34, 30, 15, '#3a2c22', PAL.outline);
    ctx.save();
    ctx.fillStyle = '#efe6d2';
    ctx.font = 'bold 18px Trebuchet MS';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('?', 54, 31);
    ctx.restore();
  } else {
    drawHUDHearts(ctx, p.hp, p.maxHp, p.soulHp);
  }
  ctx.restore();
  // curse of the lost: no minimap at all (the Tab overlay is gated below too)
  if (G.floorCurse !== 'lost') drawMinimap(ctx, G.floor, G.room);
  // coins
  ctx.save();
  ctx.translate(0, G.hudTop);
  ctx.fillStyle = '#e7b93c';
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(34, 60, 8, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#efe6d2';
  ctx.font = 'bold 16px Trebuchet MS';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('× ' + p.coins, 48, 61);
  // bombs
  ctx.fillStyle = '#232019';
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(34, 86, 8, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#c9a437';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(37, 79); ctx.quadraticCurveTo(41, 74, 38, 72); ctx.stroke();
  ctx.fillStyle = '#efe6d2';
  ctx.font = 'bold 16px Trebuchet MS';
  ctx.fillText('× ' + p.bombs, 48, 87);
  // 生气 dodo: the rage meter sits beside the consumables
  if (p.charId === 'rage') {
    const rx = 104, ry = 80, rw = 84, rh = 9;
    const k = p.rageMeter || 0;
    ctx.fillStyle = 'rgba(10,8,6,0.55)';
    ctx.fillRect(rx - 2, ry - 2, rw + 4, rh + 4);
    ctx.fillStyle = rageBerserk(p) ? '#e8452f' : '#a3271b';
    ctx.fillRect(rx, ry, rw * k, rh);
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.fillStyle = rageBerserk(p) ? '#e8452f' : 'rgba(240,230,210,0.7)';
    ctx.font = 'bold 11px Trebuchet MS';
    ctx.fillText(rageBerserk(p) ? '暴走!' : '怒气', rx + rw + 6, ry + 8);
  }
  // 暗黑 dodo: reaped soul flames toward the next half soul heart
  if (p.charId === 'dark') {
    ctx.fillStyle = '#8fb8dd';
    ctx.font = 'bold 12px Trebuchet MS';
    ctx.fillText('魂火 ' + ((p.soulSparks || 0) % 3) + ' / 3', 104, 88);
  }
  // active item slot: icon in a frame, charge pips underneath
  if (p.active) {
    const ax = 34, ay = 130;
    const def = p.active.def;
    const full = p.active.charge >= def.cost;
    ctx.fillStyle = 'rgba(10,8,6,0.55)';
    ctx.strokeStyle = full ? '#f4d03f' : '#5d4c33';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.rect(ax - 22, ay - 22, 44, 44); ctx.fill(); ctx.stroke();
    ctx.save();
    ctx.translate(ax, ay);
    ctx.scale(0.95, 0.95);
    drawItemIcon(ctx, 0, 0, def);
    ctx.restore();
    // pips: one bar per charge level this item needs
    const pw = Math.min(12, (44 - (def.cost - 1) * 3) / def.cost);
    const totalW = def.cost * pw + (def.cost - 1) * 3;
    for (let i = 0; i < def.cost; i++) {
      const bx = ax - totalW / 2 + i * (pw + 3);
      ctx.fillStyle = i < p.active.charge ? '#f4d03f' : '#3a3128';
      ctx.strokeStyle = PAL.outline;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.rect(bx, ay + 27, pw, 7); ctx.fill(); ctx.stroke();
    }
    if (full) {
      ctx.fillStyle = 'rgba(244,208,63,' + (0.55 + 0.35 * Math.sin(performance.now() / 250)) + ')';
      ctx.font = 'bold 12px Trebuchet MS';
      ctx.textAlign = 'center';
      ctx.fillText(IS_TOUCH ? '道具' : '空格', ax, ay + 47);
      ctx.textAlign = 'left';
    }
  }
  ctx.restore();

  // floor name (screen-fixed, so outside the HUD column shift)
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 13px Georgia';
  ctx.fillStyle = 'rgba(240,230,210,0.5)';
  ctx.fillText(FLOOR_NAMES[G.floorNum - 1] || 'BASEMENT', W / 2, H - 18);
  if (G.dev) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#7fbf4a';
    ctx.fillText('DEV　' + (devIdx + 1) + '/' + ITEM_DEFS.length + '　[ / ]', W - 18, H - 18);
  }
  ctx.restore();

  // boss hp bar
  const boss = G.enemies.find(e => e.isBoss);
  if (boss) {
    ctx.save();
    const bw = 300, bx = W / 2 - bw / 2, by = H - 44;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 4, by - 4, bw + 8, 18);
    ctx.fillStyle = '#5c0f09';
    ctx.fillRect(bx, by, bw, 10);
    ctx.fillStyle = boss.rage ? '#e8452f' : '#c9231a';
    ctx.fillRect(bx, by, bw * clamp(boss.hp / boss.maxHpRef, 0, 1), 10);
    ctx.strokeStyle = PAL.outline; ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, 10);
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px Georgia';
    ctx.fillStyle = '#efe6d2';
    ctx.strokeStyle = 'rgba(12,8,6,0.85)';
    ctx.lineWidth = 4;
    const label = boss.name + (boss.rage ? '　【狂暴】' : '');
    ctx.strokeText(label, W / 2, by - 12);
    ctx.fillText(label, W / 2, by - 12);
    ctx.restore();
  }

  // item toast
  if (G.toast) {
    ctx.save();
    ctx.globalAlpha = clamp(G.toast.t / 0.4, 0, 1);
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px Georgia';
    ctx.fillStyle = '#f3ecd8';
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 5;
    ctx.strokeText(G.toast.title, W / 2, 96);
    ctx.fillText(G.toast.title, W / 2, 96);
    ctx.font = 'italic 17px Georgia';
    ctx.strokeStyle = 'rgba(23,17,12,0.9)';
    ctx.lineWidth = 4;
    ctx.strokeText(G.toast.desc, W / 2, 122);
    ctx.fillStyle = '#d8ccb0';
    ctx.fillText(G.toast.desc, W / 2, 122);
    ctx.restore();
  }
}

// floor entry banner: big location name over a dark band, fades in and out
function renderFloorIntro() {
  const fi = G.floorIntro;
  const a = clamp(Math.min((fi.max - fi.t) / 0.35, fi.t / 0.6), 0, 1);
  ctx.save();
  ctx.globalAlpha = a;
  const bandY = H / 2 - 92, bandH = 150;
  const grad = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
  grad.addColorStop(0, 'rgba(8,5,3,0)');
  grad.addColorStop(0.25, 'rgba(8,5,3,0.78)');
  grad.addColorStop(0.75, 'rgba(8,5,3,0.78)');
  grad.addColorStop(1, 'rgba(8,5,3,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, bandY, W, bandH);

  ctx.textAlign = 'center';
  ctx.font = 'bold 52px Georgia';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#0f0a07';
  ctx.strokeText(fi.name, W / 2, H / 2 - 14);
  ctx.fillStyle = '#e8dcc0';
  ctx.fillText(fi.name, W / 2, H / 2 - 14);

  ctx.font = 'bold 20px Georgia';
  ctx.fillStyle = 'rgba(216,204,176,0.9)';
  ctx.fillText('第 ' + fi.num + ' 层　/　共 ' + FLOOR_COUNT + ' 层', W / 2, H / 2 + 28);
  if (fi.hard) {
    ctx.font = 'bold 17px Georgia';
    ctx.fillStyle = '#e8452f';
    ctx.fillText('危险之路　·　敌人更强　宝物翻倍', W / 2, H / 2 + 54);
  }
  if (fi.curse) {
    const c = FLOOR_CURSES[fi.curse];
    ctx.font = 'bold 17px Georgia';
    ctx.fillStyle = '#a06be0';
    ctx.fillText(c.name + '　·　' + c.desc, W / 2, H / 2 + (fi.hard ? 78 : 54));
  }
  ctx.restore();
}

