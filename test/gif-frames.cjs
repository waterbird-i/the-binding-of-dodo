'use strict';
// ============================================================================
// gif-frames.cjs — README GIF 抓帧（冻结时间步进版）
//
//   node test/gif-frames.cjs
//
// 劫持页面的 requestAnimationFrame，把游戏主循环变成手动步进：每截一张图只
// 让游戏前进固定的 2×1/30s（主循环 dt 上限就是 1/30），这样无论无头截图
// 多慢，回放都是稳定的 15fps 实时速度。帧序列落在 .playtest/gif-frames/，
// 再用 test/make-gifs.py 拼成 GIF。
// ============================================================================
const fs = require('fs');
const path = require('path');
const { ROOT, INDEX_URL, loadPlaywright, findChromium } = require('./helpers.cjs');

const FRAMES = path.join(ROOT, '.playtest', 'gif-frames');
const STEP_MS = 66.7;              // 每张 GIF 帧代表的游戏时间
const CLIP_A = 72, CLIP_B = 76;    // 帧数（~4.8s / ~5.1s）

(async () => {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  const pw = loadPlaywright();
  const exe = findChromium();
  const browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});
  const context = await browser.newContext({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(INDEX_URL);
  const canvas = page.locator('#game');

  // 让页面先真跑几帧完成初始化，再夺走 rAF 的控制权
  await page.evaluate(() => new Promise(r => {
    let n = 6;
    const tick = () => (--n <= 0 ? r() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }));
  await page.evaluate(() => {
    window.__cbs = [];
    window.__now = performance.now();
    window.requestAnimationFrame = cb => { window.__cbs.push(cb); return 0; };
    window.__step = (frames, dtMs) => {
      for (let i = 0; i < frames; i++) {
        window.__now += dtMs;
        const cur = window.__cbs; window.__cbs = [];
        for (const cb of cur) cb(window.__now);
      }
    };
  });
  const step = (n, dt) => page.evaluate(([n, dt]) => window.__step(n, dt), [n, dt]);

  // 胶片颗粒每帧随机偏移会让 GIF 每个像素都在变、完全压不动；
  // 抓帧期间换成纯静态暗角（不改游戏源码，只在页面里覆盖函数）
  await page.evaluate(() => {
    let overlay = null;
    window.applyPostFX = g => {
      if (!overlay) {
        overlay = document.createElement('canvas');
        overlay.width = W; overlay.height = H;
        const vg = overlay.getContext('2d');
        const grad = vg.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.98);
        grad.addColorStop(0, 'rgba(8,4,2,0)');
        grad.addColorStop(0.65, 'rgba(8,4,2,0.22)');
        grad.addColorStop(1, 'rgba(6,3,2,0.52)');
        vg.fillStyle = grad;
        vg.fillRect(0, 0, W, H);
      }
      g.drawImage(overlay, 0, 0);
    };
  });

  // ---------- A. 普通战斗 ----------
  await page.evaluate(() => {
    startRun();
    G.floorIntro = null;
    const p = G.player;
    p.maxHp = 12; p.hp = 12;
    p.damage += 2;
    ITEM_BY_ID['triple_feather'].apply(p);
    p.x = W / 2 - 170; p.y = H / 2 + 40;
    G.enemies = [];
    for (const [t, x, y] of [
      ['gaper', W / 2 + 140, H / 2 - 30], ['gaper', W / 2 + 230, H / 2 + 70],
      ['fly', W / 2 + 180, H / 2 - 140], ['spitter', W / 2 + 40, H / 2 - 170],
      ['hopper', W / 2 - 230, H / 2 - 120],
    ]) {
      const e = makeEnemy(t, x, y, 1);
      e.spawnT = 0.4;
      G.enemies.push(e);
    }
  });
  for (let i = 0; i < CLIP_A; i++) {
    await page.evaluate(i => {
      const p = G.player;
      p.hp = p.maxHp;
      for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) keys[k] = false;
      const phase = Math.floor(i / 16) % 4;
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
      if (n < 2 && i < 48) {
        for (const [t, x, y] of [['gaper', W / 2 + 210, H / 2 - 40], ['fly', W / 2 + 120, H / 2 + 110]]) {
          const e = makeEnemy(t, x, y, 1);
          e.spawnT = 0.4;
          G.enemies.push(e);
        }
      }
    }, i);
    await step(2, STEP_MS / 2);
    await canvas.screenshot({ path: path.join(FRAMES, 'gp-' + String(i).padStart(3, '0') + '.png') });
  }
  await page.evaluate(() => { fireStack.length = 0; for (const k in keys) keys[k] = false; });
  fs.writeFileSync(path.join(FRAMES, 'gp-times.json'), JSON.stringify(Array(CLIP_A).fill(STEP_MS)));
  console.log('clip A done');

  // ---------- B. Boss 战 ----------
  await page.evaluate(() => {
    startRun();
    G.floorNum = 8; loadFloor();
    G.floorIntro = null;
    const br = G.floor.rooms.find(r => r.kind === 'boss');
    enterRoom(br, 'N');
    const p = G.player;
    p.maxHp = 24; p.hp = 24;
    p.damage += 5;
    p.x = W / 2; p.y = FLOOR_Y + FLOOR_H - 80;
  });
  await step(4, STEP_MS / 2);
  await page.evaluate(() => {
    const b = G.enemies.find(e => e.isBoss);
    if (b) b.spawnT = 0;
  });
  // 预热 2 游戏秒让弹幕铺开（玩家无敌，最后清掉闪烁）
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => { G.player.hp = G.player.maxHp; G.player.invuln = 9999; });
    await step(2, STEP_MS / 2);
  }
  await page.evaluate(() => { G.player.invuln = 0; });
  for (let i = 0; i < CLIP_B; i++) {
    await page.evaluate(i => {
      const p = G.player;
      p.hp = p.maxHp;
      for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) keys[k] = false;
      const phase = Math.floor(i / 19) % 2;
      keys[phase ? 'KeyA' : 'KeyD'] = true;
      if (p.y > FLOOR_Y + FLOOR_H - 100) keys.KeyW = true;
      if (p.y < FLOOR_Y + 130) keys.KeyS = true;
      const b = G.enemies.find(e => e.isBoss);
      fireStack.length = 0;
      if (b) {
        const tx = b.x - p.x, ty = b.y - p.y;
        fireStack.push(Math.abs(tx) > Math.abs(ty)
          ? (tx > 0 ? 'ArrowRight' : 'ArrowLeft')
          : (ty > 0 ? 'ArrowDown' : 'ArrowUp'));
      }
    }, i);
    await step(2, STEP_MS / 2);
    await canvas.screenshot({ path: path.join(FRAMES, 'boss-' + String(i).padStart(3, '0') + '.png') });
  }
  await page.evaluate(() => { fireStack.length = 0; for (const k in keys) keys[k] = false; });
  fs.writeFileSync(path.join(FRAMES, 'boss-times.json'), JSON.stringify(Array(CLIP_B).fill(STEP_MS)));
  console.log('clip B done');

  await browser.close();
  console.log('frames -> ' + FRAMES);
})().catch(e => { console.error(e); process.exit(1); });
