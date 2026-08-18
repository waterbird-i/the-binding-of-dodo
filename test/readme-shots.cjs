'use strict';
// ============================================================================
// readme-shots.cjs — README 配图摆拍
//
//   node test/readme-shots.cjs          # 出全部截图到 screenshots/
//   node test/readme-shots.cjs --gif    # 另外抓 GIF 帧序列到 .playtest/gif-frames/
//
// 与 playtest.cjs 共用 helpers：借全局 @playwright/cli 的 playwright 无头驱动
// file:// 页面，直接操纵 window 上的游戏全局（G / startRun / enterRoom …）摆场景。
// ============================================================================
const fs = require('fs');
const path = require('path');
const { ROOT, INDEX_URL, loadPlaywright, findChromium } = require('./helpers.cjs');

const OUT = path.join(ROOT, 'screenshots');
const FRAMES = path.join(ROOT, '.playtest', 'gif-frames');
const WANT_GIF = process.argv.includes('--gif');

// 解锁全部角色与图鉴条目，标题环形选人才好看
const metaInit = () => {
  localStorage.setItem('dodo_meta_v1', JSON.stringify({
    totals: { kills: 641, deaths: 31, wins: 2 },
    unlocked: {
      kings_mark: true, godhead: true, quad_feather: true, glass_cannon: true,
      one_up: true, dead_cat: true, char_rage: true, char_dark: true,
      char_lost: true, char_gambler: true,
    },
    selChar: 'dodo',
  }));
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const pw = loadPlaywright();
  const exe = findChromium();
  const browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});
  const context = await browser.newContext({
    viewport: { width: 1100, height: 660 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript(metaInit);
  const page = await context.newPage();
  page.on('pageerror', e => console.error('PAGEERROR', e.message));
  await page.goto(INDEX_URL);
  const canvas = page.locator('#game');
  const shot = name => canvas.screenshot({ path: path.join(OUT, name) });
  const frames = n => page.evaluate(n => new Promise(res => {
    let left = n;
    const step = () => (--left <= 0 ? res(true) : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), n);

  // 摆拍前把角色挪到离所有敌方弹幕最远的空地，并清掉无敌闪烁
  const settle = () => page.evaluate(() => {
    const p = G.player;
    let best = null, bestD = -1;
    for (let sy = FLOOR_Y + 70; sy < FLOOR_Y + FLOOR_H - 50; sy += 30)
      for (let sx = FLOOR_X + 70; sx < FLOOR_X + FLOOR_W - 50; sx += 30) {
        let d = 1e9;
        for (const s of G.eshots) d = Math.min(d, dist(sx, sy, s.x, s.y));
        for (const e of G.enemies) d = Math.min(d, dist(sx, sy, e.x, e.y) - 40);
        if (G.room.rocks) for (const r of G.room.rocks) d = Math.min(d, dist(sx, sy, r.x, r.y) - 20);
        if (d > bestD) { bestD = d; best = { x: sx, y: sy }; }
      }
    if (best) { p.x = best.x; p.y = best.y; }
    p.invuln = 0; p.hp = p.maxHp;
  });

  // ---------------------------------------------------------------- 01 标题
  await frames(40);
  await shot('01-title.png');
  console.log('01-title');

  // ---------------------------------------------------------------- 02 图鉴
  await page.keyboard.press('KeyI');
  await frames(12);
  await shot('02-unlocks.png');
  await page.keyboard.press('KeyI');
  console.log('02-unlocks');

  // ------------------------------------------------------------ 03 地下室战斗
  await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    startRun();
    G.floorIntro = null;
    const p = G.player;
    const d = ITEM_BY_ID['triple_feather'];
    if (d) d.apply(p);
    p.x = W / 2 - 190; p.y = H / 2 + 10;
    G.enemies = [];
    const spots = [
      ['gaper', W / 2 + 90, H / 2 - 20], ['gaper', W / 2 + 170, H / 2 + 70],
      ['fly', W / 2 + 120, H / 2 - 120], ['spitter', W / 2 + 230, H / 2 - 60],
      ['hopper', W / 2 - 60, H / 2 - 160],
    ];
    for (const [t, x, y] of spots) {
      const e = makeEnemy(t, x, y, 1);
      e.spawnT = 0;
      G.enemies.push(e);
    }
    // 打一会儿攒点血渍和粒子，结尾保证有一波齐射在途
    fireStack.length = 0; fireStack.push('ArrowRight');
    for (let i = 0; i < 40; i++) { p.hp = p.maxHp; p.invuln = 0; await frame(); }
    p.fireCd = 0;
    for (let i = 0; i < 6; i++) { p.hp = p.maxHp; p.invuln = 0; await frame(); }
  });
  await shot('03-combat.png');
  await page.evaluate(() => { fireStack.length = 0; });
  console.log('03-combat');

  // ---------------------------------------------------------- 04 宝藏房二选一
  await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    for (let tries = 0; tries < 60; tries++) {
      startRun();
      const tr = G.floor.rooms.find(r => r.kind === 'treasure');
      if (!tr) continue;
      enterRoom(tr, 'S');
      if (G.room.pedestals && G.room.pedestals.length >= 2) break;
    }
    G.floorIntro = null;
    G.player.x = W / 2; G.player.y = H / 2 + 150;
    for (let i = 0; i < 12; i++) await frame();
  });
  await shot('04-treasure.png');
  console.log('04-treasure');

  // -------------------------------------------------------------- 05 恶魔房
  await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    startRun();
    G.floorIntro = null;
    const br = G.floor.rooms.find(r => r.kind === 'boss');
    enterRoom(br, 'N');
    await frame();
    const b = G.enemies.find(e => e.isBoss);
    if (b) damageEnemy(G, b, 1e6, 0, -1);
    for (let i = 0; i < 10; i++) { G.player.hp = G.player.maxHp; await frame(); }
    let dr = G.floor.rooms.find(r => r.kind === 'devil');
    if (!dr) {
      dr = attachRoomToFloor(G.floor, G.room, 'devil');
      if (dr) {
        dr.seen = true;
        dr.pedestals.push({ x: W / 2 - 85, y: H / 2 + 55, def: null, anim: rand(10), taken: false,
          pendingRandom: true, pool: 'devil', devilPrice: 1 });
        dr.pedestals.push({ x: W / 2 + 85, y: H / 2 + 55, def: null, anim: rand(10), taken: false,
          pendingRandom: true, pool: 'devil', devilPrice: 2 });
        dr.pickups.push({ kind: 'soulheart', x: W / 2, y: H / 2 + 130, anim: rand(10), taken: false });
      }
    }
    G.toast = null;
    enterRoom(dr, 'N');
    G.player.x = W / 2; G.player.y = H / 2 + 185;
    for (let i = 0; i < 12; i++) await frame();
  });
  await shot('05-devil.png');
  console.log('05-devil');

  // ------------------------------------------------- 06 Boss 战（死神激光扫场）
  await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    startRun();
    G.floorNum = 6; loadFloor();
    G.floorIntro = null;
    const br = G.floor.rooms.find(r => r.kind === 'boss');
    enterRoom(br, 'N');
    await frame();
    const b = G.enemies.find(e => e.isBoss);
    if (b) b.spawnT = 0;
    const p = G.player;
    p.maxHp = 24;
    // 打到 50% 以下进狂暴，激光更多
    if (b) b.hp = b.maxHpRef * 0.4;
    for (let i = 0; i < 600; i++) {
      p.hp = p.maxHp; p.invuln = 9999;
      await frame();
      if (G.lasers.length >= 3 && i > 60) break;
    }
    // 再走 10 帧让激光转起来
    for (let i = 0; i < 10; i++) { p.hp = p.maxHp; p.invuln = 9999; await frame(); }
  });
  await settle();
  await page.evaluate(() => { fireStack.length = 0; fireStack.push('ArrowUp'); });
  await frames(4);
  await shot('06-boss-laser.png');
  await page.evaluate(() => { fireStack.length = 0; });
  console.log('06-boss-laser');

  // ---------------------------------------------------- 07 最终 Boss（天启）
  await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    startRun();
    G.floorNum = 12; loadFloor();
    G.floorIntro = null;
    const br = G.floor.rooms.find(r => r.kind === 'boss');
    enterRoom(br, 'N');
    await frame();
    const p = G.player;
    p.maxHp = 24;
    const b0 = G.enemies.find(e => e.isBoss);
    if (b0) damageEnemy(G, b0, 1e6, 0, -1);
    for (let i = 0; i < 20; i++) { p.hp = p.maxHp; p.invuln = 9999; await frame(); }
    const fin = G.enemies.find(e => e.isBoss && !e.dead);
    if (fin) fin.spawnT = 0;
    for (let i = 0; i < 900; i++) {
      p.hp = p.maxHp; p.invuln = 9999;
      await frame();
      const marks = fin && fin.marks && fin.marks.length >= 10;
      if ((marks || G.eshots.length >= 36) && i > 90) break;
    }
  });
  await settle();
  await frames(2);
  await shot('07-final-boss.png');
  console.log('07-final-boss');

  // ------------------------------------------------- 08 深层章节 + 楼层横幅
  await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    startRun();
    G.floorNum = 10; loadFloor();
    for (let i = 0; i < 30; i++) await frame();
  });
  await shot('08-cathedral.png');
  console.log('08-cathedral');

  // --------------------------------------------- 09 成型 build（飞行 + 激光）
  await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    startRun();
    G.floorIntro = null;
    const p = G.player;
    const ids = ['dodo_wings', 'brimstone', 'triple_feather', 'orbit_tear',
      'candle_flame', 'baby_friend', 'sun_shard'];
    for (const id of ids) {
      const d = ITEM_BY_ID[id];
      if (d) { d.apply(p); G.stats.items++; }
    }
    p.x = W / 2 - 170; p.y = H / 2;
    G.enemies = [];
    for (const [t, x, y] of [['gaper', W / 2 + 140, H / 2 - 10], ['gaper', W / 2 + 220, H / 2 + 40],
      ['globin', W / 2 + 260, H / 2 - 60], ['fly', W / 2 + 180, H / 2 - 120]]) {
      const e = makeEnemy(t, x, y, 3);
      e.spawnT = 0;
      G.enemies.push(e);
    }
    // 等翅膀长完
    for (let i = 0; i < 55; i++) { p.hp = p.maxHp; p.invuln = 0; await frame(); }
    fireStack.length = 0; fireStack.push('ArrowRight');
    for (let i = 0; i < 90; i++) {
      p.hp = p.maxHp;
      await frame();
      if (G.beams.length > 0) break;
    }
    // 光束存活期内定格
    for (let i = 0; i < 3; i++) await frame();
  });
  await shot('09-build.png');
  await page.evaluate(() => { fireStack.length = 0; });
  console.log('09-build');

  // -------------------------------------------------------------- 10 结算
  await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    if (G.state !== 'play') startRun();
    // 给结算界面一组像样的战绩
    G.stats.kills = 86; G.stats.items = 9;
    G.stats.startTime = performance.now() - 754 * 1000;
    G.floorNum = 7;
    const p = G.player;
    p.hp = 1; p.extraLives = 0; p.invuln = 0;
    hurtPlayer(G, 4, p.x + 10, p.y);
    for (let i = 0; i < 12; i++) await frame();
  });
  await shot('10-death.png');
  console.log('10-death');

  // ------------------------------------------ 11 / 12 移动端触控（含点开全图）
  // 视口按「横屏手机减掉浏览器工具栏」取，正好是控件缩放到最小档的场景
  {
    const mob = await browser.newContext({
      viewport: { width: 844, height: 330 },
      deviceScaleFactor: 2, hasTouch: true, isMobile: true,
    });
    await mob.addInitScript(metaInit);
    const mp = await mob.newPage();
    mp.on('pageerror', e => console.error('PAGEERROR', e.message));
    await mp.goto(INDEX_URL);
    await mp.evaluate(async () => {
      const frame = () => new Promise(r => requestAnimationFrame(r));
      startRun();
      G.floorIntro = null;
      const p = G.player;
      const d = ITEM_BY_ID['triple_feather'];
      if (d) d.apply(p);
      p.x = W / 2 - 140; p.y = H / 2 + 30;
      G.enemies = [];
      for (const [t, x, y] of [['gaper', W / 2 + 70, H / 2 - 40], ['fly', W / 2 + 160, H / 2 - 130],
        ['spitter', W / 2 + 210, H / 2 + 30]]) {
        const e = makeEnemy(t, x, y, 1);
        e.spawnT = 0;
        G.enemies.push(e);
      }
      fireStack.length = 0; fireStack.push('ArrowRight');
      for (let i = 0; i < 34; i++) { p.hp = p.maxHp; p.invuln = 0; await frame(); }
      fireStack.length = 0;
      for (let i = 0; i < 4; i++) await frame();
    });
    await mp.screenshot({ path: path.join(OUT, '11-mobile.png') });
    console.log('11-mobile');

    // 点右上角小地图：展开本层全图、冻结对局、收起摇杆和射击键
    await mp.evaluate(() => {
      G.floor.rooms.forEach((r, i) => { r.seen = true; if (i % 4 !== 3) r.visited = true; });
      G.room.visited = true;
      const b = minimapBox(), r = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true,
        clientX: r.left + (b.x + b.w / 2) * (r.width / W),
        clientY: r.top + (b.y + b.h / 2) * (r.height / H) }));
    });
    await mp.waitForTimeout(160);
    await mp.screenshot({ path: path.join(OUT, '12-mobile-map.png') });
    console.log('12-mobile-map');
    await mob.close();
  }

  // ================================================================= GIF 帧
  if (WANT_GIF) {
    fs.rmSync(FRAMES, { recursive: true, force: true });
    fs.mkdirSync(FRAMES, { recursive: true });

    // ---------- A. 普通战斗：走位 + 射击 + 击杀 ----------
    await page.evaluate(() => {
      startRun();
      G.floorIntro = null;
      const p = G.player;
      p.maxHp = 12; p.hp = 12;
      p.damage += 2.5;
      const d = ITEM_BY_ID['triple_feather'];
      if (d) d.apply(p);
      p.x = W / 2 - 150; p.y = H / 2 + 60;
      G.enemies = [];
      for (const [t, x, y] of [
        ['gaper', W / 2 + 150, H / 2 - 30], ['gaper', W / 2 + 240, H / 2 + 70],
        ['fly', W / 2 + 190, H / 2 - 140], ['spitter', W / 2 + 40, H / 2 - 170],
        ['hopper', W / 2 - 230, H / 2 - 120], ['gaper', W / 2 - 100, H / 2 - 190],
      ]) {
        const e = makeEnemy(t, x, y, 1);
        e.spawnT = 0.3;
        G.enemies.push(e);
      }
    });
    const gpTimes = [];
    for (let i = 0; i < 56; i++) {
      await page.evaluate(i => {
        const p = G.player;
        p.hp = p.maxHp;
        for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) keys[k] = false;
        // 简单走位脚本：向右压进 → 下拉 → 左撤 → 上顶，全程朝敌人多的方向开火
        const phase = Math.floor(i / 14) % 4;
        keys[['KeyD', 'KeyS', 'KeyA', 'KeyW'][phase]] = true;
        let tx = 0, ty = 0, n = 0;
        for (const e of G.enemies) { tx += e.x; ty += e.y; n++; }
        fireStack.length = 0;
        if (n > 0) {
          tx = tx / n - p.x; ty = ty / n - p.y;
          fireStack.push(Math.abs(tx) > Math.abs(ty)
            ? (tx > 0 ? 'ArrowRight' : 'ArrowLeft')
            : (ty > 0 ? 'ArrowDown' : 'ArrowUp'));
        }
        // 打光了就补怪，别让画面空掉
        if (n < 2 && i < 40) {
          for (const [t, x, y] of [['gaper', W / 2 + 200, H / 2 - 60], ['fly', W / 2 + 120, H / 2 + 100]]) {
            const e = makeEnemy(t, x, y, 1);
            e.spawnT = 0.3;
            G.enemies.push(e);
          }
        }
      }, i);
      gpTimes.push(Date.now());
      await canvas.screenshot({ path: path.join(FRAMES, 'gp-' + String(i).padStart(3, '0') + '.png') });
    }
    await page.evaluate(() => { fireStack.length = 0; for (const k in keys) keys[k] = false; });
    fs.writeFileSync(path.join(FRAMES, 'gp-times.json'), JSON.stringify(gpTimes));
    console.log('gif frames: gameplay');

    // ---------- B. Boss 战：弹幕下走位 ----------
    await page.evaluate(async () => {
      const frame = () => new Promise(r => requestAnimationFrame(r));
      startRun();
      G.floorNum = 8; loadFloor();
      G.floorIntro = null;
      const br = G.floor.rooms.find(r => r.kind === 'boss');
      enterRoom(br, 'N');
      await frame();
      const b = G.enemies.find(e => e.isBoss);
      if (b) b.spawnT = 0;
      const p = G.player;
      p.maxHp = 24; p.hp = 24;
      p.damage += 6;
      p.x = W / 2; p.y = FLOOR_Y + FLOOR_H - 70;
      // 预热几十帧让弹幕铺开
      for (let i = 0; i < 50; i++) { p.hp = p.maxHp; p.invuln = 9999; await frame(); }
      p.invuln = 0;
    });
    const bossTimes = [];
    for (let i = 0; i < 64; i++) {
      await page.evaluate(i => {
        const p = G.player;
        p.hp = p.maxHp;
        for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) keys[k] = false;
        // 底边左右横移拉扯，永远朝 Boss 开火
        const phase = Math.floor(i / 16) % 2;
        keys[phase ? 'KeyA' : 'KeyD'] = true;
        if (p.y > FLOOR_Y + FLOOR_H - 90) keys.KeyW = true;
        if (p.y < FLOOR_Y + 120) keys.KeyS = true;
        const b = G.enemies.find(e => e.isBoss);
        fireStack.length = 0;
        if (b) {
          const tx = b.x - p.x, ty = b.y - p.y;
          fireStack.push(Math.abs(tx) > Math.abs(ty)
            ? (tx > 0 ? 'ArrowRight' : 'ArrowLeft')
            : (ty > 0 ? 'ArrowDown' : 'ArrowUp'));
        }
      }, i);
      bossTimes.push(Date.now());
      await canvas.screenshot({ path: path.join(FRAMES, 'boss-' + String(i).padStart(3, '0') + '.png') });
    }
    await page.evaluate(() => { fireStack.length = 0; for (const k in keys) keys[k] = false; });
    fs.writeFileSync(path.join(FRAMES, 'boss-times.json'), JSON.stringify(bossTimes));
    console.log('gif frames: boss');
  }

  await browser.close();
  console.log('done -> ' + OUT + (WANT_GIF ? ' & ' + FRAMES : ''));
})().catch(e => { console.error(e); process.exit(1); });
