'use strict';
const fs = require('fs');
const path = require('path');
const { section, ok, eq, near, frames, state, luma, press, ROOT, INDEX_URL } = require('../helpers.cjs');

module.exports = async ({ page, context, consoleErrors }) => {
  // ---------------------------------------------------------------- delivery
  section('交付形态');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok('index.html 用普通 script 标签（无 type=module）', !/type\s*=\s*"?module/.test(html));
  ok('没有构建产物 / npm 依赖', !fs.existsSync(path.join(ROOT, 'package.json')) &&
    !fs.existsSync(path.join(ROOT, 'node_modules')));
  const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
  const esm = jsFiles.filter(f => /^\s*(import|export)\s/m.test(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')));
  ok('js 里没有 import/export（file:// 下不会被 CORS 拦）', esm.length === 0, esm.join(','));
  ok('file:// 直接打开即可运行', await page.evaluate(() => location.protocol === 'file:' && typeof G === 'object'));

  // ------------------------------------------------------------- title / boot
  section('标题与启动');
  const boot = await state(page);
  eq('初始状态是 menu', boot.state, 'menu');
  ok('标题画面已绘制（画面不是纯黑）', await luma(page) > 4);
  await press(page, 'Enter');
  await frames(page, 3);
  let s = await state(page);
  eq('按 Enter 进入游戏', s.state, 'play');
  eq('从第 1 层开始', s.floorNum, 1);
  eq('起始房是 start', s.roomKind, 'start');
  eq('开局 3 颗心（6 半心）', s.hp, 6);

  // --------------------------------------------------------------- movement
  section('移动与射击');
  const before = await state(page);
  await press(page, 'KeyD', 260);
  await frames(page, 3);
  let after = await state(page);
  ok('按 D 向右移动', after.x > before.x + 20, 'dx=' + (after.x - before.x).toFixed(1));
  await press(page, 'KeyW', 260);
  await frames(page, 3);
  const after2 = await state(page);
  ok('按 W 向上移动', after2.y < after.y - 15, 'dy=' + (after2.y - after.y).toFixed(1));
  await page.keyboard.down('ArrowRight');
  await frames(page, 4);
  const shooting = await state(page);
  await page.keyboard.up('ArrowRight');
  ok('按方向键发射眼泪', shooting.tears > 0, 'tears=' + shooting.tears);
  await page.waitForTimeout(400);

  // ------------------------------------------------------------------ pause
  section('暂停（P 键）');
  const lumaPlay = await luma(page);
  await page.keyboard.down('KeyW');           // hold a movement key across the pause
  await frames(page, 2);
  await press(page, 'KeyP');
  await frames(page, 2);
  let p1 = await state(page);
  ok('按 P 进入暂停', p1.paused === true);
  eq('暂停时游戏状态仍是 play', p1.state, 'play');
  ok('暂停时释放按住的键（不会漂移）', await page.evaluate(() => keys.KeyW !== true));
  const lumaPaused = await luma(page);
  ok('暂停遮罩压暗了画面', lumaPaused < lumaPlay - 3,
    'play=' + lumaPlay.toFixed(1) + ' paused=' + lumaPaused.toFixed(1));
  ok('暂停界面画出了文字/属性面板', await page.evaluate(() => {
    // sample the row where 「暂 停」 is drawn; it must contain bright pixels
    const d = ctx.getImageData(0, 90, canvas.width, 60).data;
    let bright = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] > 170) bright++;
    return bright > 120;
  }));
  await page.keyboard.up('KeyW');

  const froz1 = await page.evaluate(() => ({
    px: G.player.x, py: G.player.y, t: G.stats.time,
    epos: G.enemies.map(e => [e.x, e.y]), anim: G.pauseAnim,
  }));
  await page.waitForTimeout(600);
  const froz2 = await page.evaluate(() => ({
    px: G.player.x, py: G.player.y, t: G.stats.time,
    epos: G.enemies.map(e => [e.x, e.y]), anim: G.pauseAnim,
  }));
  near('暂停时玩家不动 (x)', froz2.px, froz1.px, 0.01);
  near('暂停时玩家不动 (y)', froz2.py, froz1.py, 0.01);
  near('暂停时计时器冻结', froz2.t, froz1.t, 0.02);
  ok('暂停时敌人不动', JSON.stringify(froz1.epos) === JSON.stringify(froz2.epos));
  ok('暂停界面仍在刷新（pauseAnim 在走）', froz2.anim > froz1.anim);

  await press(page, 'KeyP');
  await frames(page, 3);
  let p2 = await state(page);
  eq('再按 P 恢复游戏', p2.paused, false);
  const tResume = p2.time;
  await page.waitForTimeout(500);
  const p3 = await state(page);
  near('恢复后计时继续（且没把暂停时长算进去）', p3.time - tResume, 0.5, 0.35);
  await press(page, 'KeyD', 220);
  await frames(page, 2);
  const p4 = await state(page);
  ok('恢复后可以继续移动', Math.abs(p4.x - p2.x) > 10, 'dx=' + (p4.x - p2.x).toFixed(1));

  section('开发者模式（` 键）');
  await press(page, 'Backquote');
  await frames(page, 2);
  ok('按 ` 开启开发者模式', await page.evaluate(() => G.dev === true));
  await press(page, 'BracketRight');
  await press(page, 'BracketRight');
  await frames(page, 2);
  const dev1 = await page.evaluate(() => ({ taken: G.player.itemsTaken.slice(), idx: devIdx }));
  ok('] 走到第 2 件道具，且身上只有这一件', dev1.idx === 1 && dev1.taken.length === 1,
    JSON.stringify(dev1));
  await press(page, 'BracketLeft');
  await frames(page, 2);
  ok('[ 退回上一件道具',
    await page.evaluate(() => devIdx === 0 && G.player.itemsTaken.length === 1));
  await press(page, 'Backquote');
  await frames(page, 2);
  ok('再按 ` 关掉开发者模式', await page.evaluate(() => G.dev === false));
  await page.evaluate(() => {
    const { x, y } = G.player;
    Object.assign(G.player, makePlayer(), { x, y });   // 后面的用例回到基础属性
  });

  section('自动暂停（切换窗口）');
  await page.evaluate(() => { G.paused = false; });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await frames(page, 2);
  ok('窗口失焦自动暂停', (await state(page)).paused === true);
  await press(page, 'KeyP');
  ok('P 可以解除自动暂停', (await state(page)).paused === false);

  // chrome-headless-shell never really hides a page, so drive the same code
  // path the browser uses: flip document.hidden and fire visibilitychange.
  const vis = await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    G.paused = false;
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    await frame();
    const pausedWhenHidden = G.paused;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    await frame();
    const stillPausedAfterReturn = G.paused;
    delete document.hidden;
    if (desc) Object.defineProperty(Document.prototype, 'hidden', desc);
    return { pausedWhenHidden, stillPausedAfterReturn, hidden: document.hidden };
  });
  ok('切到别的标签页（visibilitychange）自动暂停', vis.pausedWhenHidden === true);
  ok('回到窗口后仍保持暂停，等玩家自己继续', vis.stillPausedAfterReturn === true);
  ok('document.hidden 还原正常', vis.hidden === false);
  await press(page, 'KeyP');
  eq('继续游戏', (await state(page)).paused, false);

  await page.evaluate(() => { G.state = 'menu'; G.paused = false; });
  await press(page, 'KeyP');
  ok('菜单/结算界面按 P 不会进入暂停', (await state(page)).paused === false);
  await page.evaluate(() => { G.state = 'play'; });

  // ------------------------------------------------------------ floors: 12
};
