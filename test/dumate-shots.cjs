'use strict';
// 一次性截图脚本：dumate 抉择界面 + Boss 战画面，供人工核对形象
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
  });
  await frames(page, 6);
  await page.locator('#game').screenshot({ path: path.join(__dirname, '../screenshots/dumate-offer.png') });

  await page.evaluate(() => {
    G.dumateOffer.openedAt -= 2000;
    resolveDumateOffer(true);
  });
  // 打一会儿，让 dumate 出招（玩家无敌顶住）
  await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    for (let i = 0; i < 210; i++) {
      G.player.maxHp = 24; G.player.hp = 24; G.player.invuln = 5;
      await frame();
    }
  });
  await page.locator('#game').screenshot({ path: path.join(__dirname, '../screenshots/dumate-fight.png') });

  await page.evaluate(() => { META.charWins = {}; metaSave(); });
  await browser.close();
  console.log('shots saved');
}
main().catch(e => { console.error(e); process.exit(1); });
