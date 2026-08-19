'use strict';
// ============================================================================
// playtest runner — 按顺序执行 test/suites/ 下的全部章节套件
//
//   node test/playtest.cjs            # 无头跑全部断言
//   node test/playtest.cjs --headed   # 打开浏览器观察
//
// 公共设施（启动 playwright / 断言 harness / 页面辅助）在 test/helpers.cjs，
// 各章节断言按主题拆在 test/suites/NN-*.cjs，编号即执行顺序（章节间共享
// 同一个页面实例，顺序不可打乱）。
// ============================================================================
const { loadPlaywright, findChromium, frames, results, INDEX_URL, HEADED } = require('./helpers.cjs');

const SUITES = [
  require('./suites/01-core.cjs'),
  require('./suites/02-bosses.cjs'),
  require('./suites/03-items.cjs'),
  require('./suites/04-rooms.cjs'),
  require('./suites/05-pools-and-curses.cjs'),
  require('./suites/06-map-dungeon.cjs'),
  require('./suites/07-meta-branch.cjs'),
  require('./suites/08-endgame.cjs'),
  require('./suites/09-dumate.cjs'),
];

async function main() {
  const { chromium } = loadPlaywright();
  const exe = findChromium();
  const browser = await chromium.launch(Object.assign({ headless: !HEADED }, exe ? { executablePath: exe } : {}));
  const context = await browser.newContext({ viewport: { width: 1100, height: 720 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

  await page.goto(INDEX_URL);
  await page.waitForFunction(() => typeof G !== 'undefined');
  await frames(page, 4);
  try {
    for (const suite of SUITES) await suite({ page, context, consoleErrors });
  } finally {
    await browser.close();
  }

  const failed = results.filter(r => !r.pass);
  console.log('\n' + '='.repeat(64));
  console.log(results.length - failed.length + ' / ' + results.length + ' checks passed');
  if (failed.length) {
    console.log('\nfailures:');
    for (const f of failed) console.log('  - [' + f.group + '] ' + f.name + '  ' + f.extra);
  }
  console.log('='.repeat(64));
  process.exit(failed.length ? 1 : 0);
}

main().catch(err => {
  console.error('\nplaytest crashed: ' + (err && err.stack || err));
  process.exit(2);
});
