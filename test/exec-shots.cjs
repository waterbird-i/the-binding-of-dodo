'use strict';
// 一次性截图脚本：dumate 斩杀特写 + 死亡样式结算纸，供人工核对
const path = require('path');
const { loadPlaywright, findChromium, INDEX_URL, frames } = require('./helpers.cjs');

async function main() {
  const { chromium } = loadPlaywright();
  const exe = findChromium();
  const browser = await chromium.launch(Object.assign({ headless: true }, exe ? { executablePath: exe } : {}));
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
  await page.goto(INDEX_URL);
  await page.waitForFunction(() => typeof G !== 'undefined');
  await frames(page, 4);

  await page.evaluate(() => {
    for (const c of CHAR_DEFS) META.charWins[c.id] = true;
    startRun();
    G.floorNum = FLOOR_COUNT;
    const bossRoom = G.floor.rooms.find(r => r.kind === 'boss');
    enterRoom(bossRoom, 'N');
    G.enemies = [];
    const mega = makeBoss(FINAL_BOSS_DEF, W / 2, H / 2);
    onBossKilled(G, mega);
    G.dumateOffer.openedAt -= 2000;
    resolveDumateOffer(true);
    G.stats.startTime -= 2000;
    const d = G.enemies.find(e => e.isBoss && e.def.dumate);
    damageEnemy(G, d, 1e9, 0, -1);
  });
  // 推到斩击后的瞬间（t≈1.75s）
  await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    while (G.dumateExec && G.dumateExec.t < 1.78) await frame();
  });
  await page.locator('#game').screenshot({ path: path.join(__dirname, '../screenshots/dumate-exec.png') });

  await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    let i = 0;
    while (G.state === 'dumateExec' && i++ < 400) await frame();
  });
  await frames(page, 6);
  await page.locator('#game').screenshot({ path: path.join(__dirname, '../screenshots/dumate-exec-paper.png') });

  await page.evaluate(() => { META.charWins = {}; META.unlocked.boss_dumate = false; metaSave(); });
  await browser.close();
  console.log('shots saved');
}
main().catch(e => { console.error(e); process.exit(1); });
