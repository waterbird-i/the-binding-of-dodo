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
  eq('横屏下不显示旋转提示',
    await page.$eval('#rotate-hint', el => getComputedStyle(el).display), 'none');

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
