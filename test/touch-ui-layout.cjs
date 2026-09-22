'use strict';
// ============================================================================
// touch-ui-layout.cjs — 移动端触屏 UI 布局自测
//
//   node test/touch-ui-layout.cjs
//
// 背景：style.css 曾被工具输出（<file> / "N→" 行号前缀）污染，整张样式表
// 解析失败，触屏按钮全部失去样式（SVG 按默认 300x150 撑成大黑板、
// 道具/炸弹按钮落回左上角）。本测试做两件事：
//   1. 源文件卫生检查：index.html / style.css / js/*.js 不含污染标记
//   2. 手机横屏视口下逐个断言触屏控件的尺寸与落位
// ============================================================================
const fs = require('fs');
const path = require('path');
const { ROOT, INDEX_URL, loadPlaywright, findChromium, results, section, ok, eq } =
  require('./helpers.cjs');

// ---------------- 1. 源文件卫生检查 ----------------
function hygiene() {
  section('文件卫生');
  const files = ['index.html', 'style.css',
    ...fs.readdirSync(path.join(ROOT, 'js')).map(f => 'js/' + f)];
  for (const f of files) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const dirty = text.includes('<file>') || /^\s*\d+→/m.test(text);
    ok(f + ' 无行号污染', !dirty);
  }
}

// ---------------- 2. 手机横屏布局断言 ----------------
async function layout() {
  const pw = loadPlaywright();
  const browser = await pw.chromium.launch({ executablePath: findChromium() || undefined });
  // iPhone 尺寸横屏 + 触屏：game-core.js 靠 maxTouchPoints 判定后亮出触屏 UI
  const context = await browser.newContext({
    viewport: { width: 812, height: 375 },
    hasTouch: true, isMobile: true, deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(INDEX_URL);
  await page.waitForTimeout(400);

  const vw = 812, vh = 375;
  const box = sel => page.$eval(sel, el => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });

  section('触屏 UI 可见性');
  eq('#touch-ui 已亮出（hidden 类被移除）',
    await page.$eval('#touch-ui', el => el.classList.contains('hidden')), false);
  eq('横屏下不启用 rot90 假横屏',
    await page.$eval('body', el => el.classList.contains('rot90')), false);

  section('左上角 暂停/图鉴');
  // --corner:clamp(30px, 9vh, 42px)；375 高时 9vh=33.75
  for (const [sel, name] of [['#btn-pause', '暂停'], ['#btn-codex', '图鉴']]) {
    const b = await box(sel);
    ok(name + '键为小方钮（30~42px 见方）',
      b.w >= 30 && b.w <= 42 && Math.abs(b.w - b.h) < 1,
      JSON.stringify(b));
    ok(name + '键贴左上角', b.x < 110 && b.y < 60, JSON.stringify(b));
    // 污染事故的直接症状：SVG 无固有尺寸时按默认 300x150 渲染
    const svg = await page.$eval(sel + ' svg', el => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    ok(name + '键图标未按 SVG 默认 300x150 渲染', svg.w < 40 && svg.h < 40,
      JSON.stringify(svg));
  }

  section('底部操作区落位');
  const stick = await box('#stick-base');
  // --stick = 2 * clamp(30px, 12vh, 56px)；375 高时 12vh=45 → 90px
  ok('摇杆有实际尺寸（60~112px）', stick.w >= 60 && stick.w <= 112, JSON.stringify(stick));
  ok('摇杆在左下象限', stick.x < vw / 2 && stick.y > vh / 2, JSON.stringify(stick));

  const fire = await box('#fire-pad');
  ok('射击键盘在右下象限', fire.x > vw / 2 && fire.y > vh / 2, JSON.stringify(fire));

  const action = await box('#action-pad');
  ok('道具/炸弹在右下象限（不在左上角）',
    action.x > vw / 2 && action.y > vh / 2, JSON.stringify(action));
  const item = await box('#btn-item');
  ok('道具键为圆钮（30~56px）', item.w >= 30 && item.w <= 56 && Math.abs(item.w - item.h) < 1,
    JSON.stringify(item));

  section('控件互不侵占');
  const pad = await box('#top-pad');
  ok('顶部按钮组不超过屏幕四分之一宽', pad.w < vw / 4, JSON.stringify(pad));
  const canvas = await box('#game');
  ok('画布仍占满视口高', Math.abs(canvas.h - vh) < 2, JSON.stringify(canvas));

  section('竖屏假横屏（rot90）');
  // 竖屏视口不再弹转屏提示（App 内置浏览器锁死竖屏时那是条死路），而是把
  // 整个游戏旋转 90° 直接玩。往返三次断言开关状态与画布铺法。
  const rotOn = () => page.$eval('body', el => el.classList.contains('rot90'));
  for (let i = 1; i <= 3; i++) {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(650);
    ok('第' + i + '次竖屏：启用 rot90', await rotOn());
    const cb = await box('#game');
    ok('第' + i + '次竖屏：画布随旋转竖向铺开', cb.h > cb.w, JSON.stringify(cb));
    await page.setViewportSize({ width: 812, height: 375 });
    await page.waitForTimeout(650);
    ok('第' + i + '次转回横屏：rot90 关闭', !(await rotOn()));
  }

  section('rot90 触摸坐标映射');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(650);
  // 旋转后画布中央 ≈ 视口 (187, 406)：菜单确认，对局应当开场
  await page.touchscreen.tap(187, 406);
  await page.waitForTimeout(300);
  eq('旋转态下点画布中央可开局', await page.evaluate(() => G.state), 'play');
  // 摇杆区旋转后落在视口左上；向"视口下方"划应映射为游戏里向右移动
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart',
    touchPoints: [{ x: 90, y: 150, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
    touchPoints: [{ x: 90, y: 210, id: 1 }] });
  await page.waitForTimeout(100);
  const mv = await page.evaluate(() => ({ x: touch.moveX, y: touch.moveY }));
  ok('旋转态摇杆：视口向下划 = 游戏向右', mv.x > 0.5 && Math.abs(mv.y) < 0.3,
    JSON.stringify(mv));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // tap 会触发游戏那个一次性的 requestFullscreen，先退出再恢复视口
  await page.evaluate(() =>
    document.fullscreenElement ? document.exitFullscreen().catch(() => {}) : null);
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 812, height: 375 });
  await page.waitForTimeout(650);

  // ---------------------------------------------------------- 手感细节
  // 尺寸对了不代表按得住 / 按得准：这一节断的是命中区、死区与按钮状态，
  // 都是「看截图看不出来、只有真的摸一下才知道」的东西
  section('触控手感细节');
  const cornerGeo = await page.evaluate(() => {
    const b = document.getElementById('btn-pause').getBoundingClientRect();
    const c = document.getElementById('btn-codex').getBoundingClientRect();
    // 命中区由 .corner-btn::after 的 inset 撑出：从视觉框外 3px 处反查命中的元素
    const probe = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el ? (el.id || el.className || el.tagName) : null;
    };
    return {
      w: b.width, h: b.height,
      gap: c.left - b.right,
      leftOutside: probe(b.left - 3, b.top + b.height / 2),
    };
  });
  ok('角落按钮视觉尺寸仍在 30-42px 区间（与既有断言一致）',
    cornerGeo.w >= 30 && cornerGeo.w <= 42, cornerGeo.w.toFixed(1) + 'px');
  ok('视觉框外 3px 仍命中暂停按钮（命中区被 ::after 撑大）',
    cornerGeo.leftOutside === 'btn-pause', String(cornerGeo.leftOutside));
  ok('两个角落按钮的命中区不重叠（gap 12px > 两侧各外扩 4px）',
    cornerGeo.gap >= 12, 'gap=' + cornerGeo.gap.toFixed(1) + 'px');
  const stickFeel = await page.evaluate(() => {
    const zone = document.getElementById('stick-zone');
    const base = document.getElementById('stick-base');
    const zr = zone.getBoundingClientRect();
    const cx = zr.left + 60, cy = zr.top + 60;
    const mk = (x, y) => new Touch({ identifier: 11, target: zone, clientX: x, clientY: y });
    const send = (type, t) => zone.dispatchEvent(new TouchEvent(type, {
      touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true,
    }));
    send('touchstart', mk(cx, cy));
    const max = base.offsetWidth * 0.42;
    send('touchmove', mk(cx + max * 0.08, cy));   // 死区内
    const inDead = touch.moveX;
    send('touchmove', mk(cx + max * 3, cy));      // 拉满（超出也会被夹到 1）
    const full = touch.moveX;
    send('touchend', mk(cx, cy));
    return { inDead, full, released: touch.moveX, max };
  });
  ok('摇杆死区：8% 行程读作 0（拇指静止不会漂移）', stickFeel.inDead === 0, 'moveX=' + stickFeel.inDead);
  ok('摇杆死区：拉满仍是 1（最高速没被削弱）', Math.abs(stickFeel.full - 1) < 0.02,
    'moveX=' + stickFeel.full.toFixed(3));
  ok('摇杆松手后输入归零', stickFeel.released === 0);

  const btnState = await page.evaluate(() => {
    G.state = 'play'; G.paused = false;
    const bomb = document.getElementById('btn-bomb');
    const item = document.getElementById('btn-item');
    G.player.bombs = 0;
    G.player.active = null;
    syncTouchButtons();
    const off = bomb.classList.contains('off') && item.classList.contains('off');
    G.player.bombs = 3;
    syncTouchButtons();
    const on = !bomb.classList.contains('off');
    return { off, on };
  });
  ok('没炸弹 / 没主动道具时按钮灰化，有了就恢复', btnState.off && btnState.on, JSON.stringify(btnState));

  const fireCancel = await page.evaluate(() => {
    // 射击键的 touchcancel 兜底：来电/通知打断后方向不该粘住
    const btn = document.querySelector('.fire-btn[data-dir="up"]');
    const t = new Touch({ identifier: 12, target: btn, clientX: 0, clientY: 0 });
    btn.dispatchEvent(new TouchEvent('touchstart', { touches: [t], changedTouches: [t], bubbles: true, cancelable: true }));
    const firing = !!touch.fire;
    btn.dispatchEvent(new TouchEvent('touchcancel', { touches: [], changedTouches: [t], bubbles: true, cancelable: true }));
    return { firing, afterCancel: touch.fire };
  });
  ok('射击键按下即开火，touchcancel 后方向不残留',
    fireCancel.firing && fireCancel.afterCancel === null, JSON.stringify(fireCancel));
  await page.screenshot({ path: '/tmp/touch-ui-layout.png' });
  console.log('screenshot: /tmp/touch-ui-layout.png');
  await browser.close();
}

(async () => {
  hygiene();
  await layout();
  const fail = results.filter(r => !r.pass);
  console.log('\n' + (results.length - fail.length) + '/' + results.length + ' passed');
  if (fail.length) {
    for (const f of fail) console.log(' FAIL [' + f.group + '] ' + f.name + ' ' + f.extra);
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(1); });
