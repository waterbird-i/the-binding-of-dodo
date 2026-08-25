'use strict';
const { section, ok, eq, near, frames, state, luma, press, ROOT, INDEX_URL } = require('../helpers.cjs');

module.exports = async ({ page, context, consoleErrors }) => {
  section('12 层完整流程 + 13 Boss');
  const run = await page.evaluate(async () => {
    const log = [];
    const frame = () => new Promise(r => requestAnimationFrame(r));
    // 强 build：Boss 血量按 60s 站桩输出封顶、不设下限（js/boss-core.js），
    // 只有 DPS 够高才看得到设计血量曲线——弱 build 的上限断言在 02 套件
    const godMode = () => { G.player.maxHp = 24; G.player.hp = 24; G.player.invuln = 5; G.player.damage = 400; };
    startRun();
    for (let floor = 1; floor <= FLOOR_COUNT; floor++) {
      godMode();
      if (G.floorNum !== floor) return { error: 'expected floor ' + floor + ' got ' + G.floorNum, log };
      const bossRoom = G.floor.rooms.find(r => r.kind === 'boss');
      if (!bossRoom) return { error: 'floor ' + floor + ' has no boss room', log };
      enterRoom(bossRoom, 'N');
      await frame();
      const boss = G.enemies.find(e => e.isBoss);
      if (!boss) return { error: 'floor ' + floor + ' boss did not spawn', log };
      log.push({ floor, name: boss.name, id: boss.def.id, hp: boss.maxHpRef, theme: PAL.floor });
      // let the fight actually run for a bit, then finish it
      for (let i = 0; i < 40; i++) { godMode(); await frame(); }
      godMode();
      damageEnemy(G, boss, 1e6, 0, -1);
      // give the death sequence a few frames to clear the corpse
      for (let i = 0; i < 6; i++) await frame();
      if (floor === FLOOR_COUNT) {
        // the previous boss corpse lingers a few frames — skip it
        const fin = G.enemies.find(e => e.isBoss && !e.dead);
        if (!fin || !fin.def.final) return { error: 'final boss did not appear', log };
        log.push({ floor, name: fin.name, id: fin.def.id, hp: fin.maxHpRef, final: true, theme: PAL.floor });
        for (let i = 0; i < 40; i++) { godMode(); await frame(); }
        damageEnemy(G, fin, 1e6, 0, -1);
        for (let i = 0; i < 6; i++) await frame();
        break;
      }
      if (!G.room.trapdoor) return { error: 'floor ' + floor + ' trapdoor missing', log };
      G.player.x = G.room.trapdoor.x; G.player.y = G.room.trapdoor.y;
      for (let i = 0; i < 8 && G.floorNum === floor; i++) { godMode(); await frame(); }
    }
    // 设计血量对照表：断言「不按 DPS 抬下限」在页面上下文里查（Node 侧没有 BOSS_DEFS）
    const defHp = {};
    for (const d of BOSS_DEFS) defHp[d.id] = d.hp;
    return { log, defHp, state: G.state, kills: G.stats.kills, time: G.stats.time };
  });
  ok('12 层跑通没有中断', !run.error, run.error);
  if (!run.error) {
    eq('打完 13 场 Boss 战', run.log.length, 13);
    eq('12 层各一个不同 Boss', new Set(run.log.slice(0, 12).map(b => b.id)).size, 12);
    ok('第 12 层触发第 13 个最终 Boss', !!run.log[12] && run.log[12].final === true,
      JSON.stringify(run.log[12] || null));
    ok('Boss 血量随层数递增', run.log.slice(0, 12).every((b, i, a) => i === 0 || b.hp > a[i - 1].hp),
      run.log.map(b => b.hp).join(','));
    ok('Boss 血量不超过设计值（不按 DPS 抬下限）',
      run.log.every(b => b.hp <= run.defHp[b.id]),
      run.log.map(b => b.hp).join(','));
    ok('不同章节地板配色不同', new Set(run.log.map(b => b.theme)).size >= 8,
      [...new Set(run.log.map(b => b.theme))].join(','));
    eq('击败最终 Boss 后通关', run.state, 'win');
  }

  section('结算与重开');
  ok('通关界面已绘制', await luma(page) > 8);
  await press(page, 'Enter');
  await frames(page, 3);
  const restarted = await state(page);
  eq('结算界面按 Enter 重新开始', restarted.state, 'play');
  eq('重开回到第 1 层', restarted.floorNum, 1);
  const death = await page.evaluate(async () => {
    G.player.hp = 1; G.player.extraLives = 0; G.player.invuln = 0;
    hurtPlayer(G, 4, G.player.x + 10, G.player.y);
    await new Promise(r => requestAnimationFrame(r));
    return { state: G.state, paused: G.paused };
  });
  eq('生命耗尽进入死亡界面', death.state, 'dead');
  await press(page, 'KeyP');
  ok('死亡界面按 P 不会暂停', (await state(page)).paused === false);

  section('性能与控制台');
  await press(page, 'Enter');
  await frames(page, 3);
  const perf = await page.evaluate(async () => {
    // stress: fill the room with enemies and projectiles, then measure frames
    for (let i = 0; i < 24; i++) {
      G.enemies.push(makeEnemy(pick(['gaper', 'fly', 'spitter', 'hopper', 'sentry']),
        rand(FLOOR_X + 60, FLOOR_X + FLOOR_W - 60), rand(FLOOR_Y + 60, FLOOR_Y + FLOOR_H - 60), 12));
    }
    G.player.multishot = 5; G.player.orbitals = 4; G.player.familiars = 3;
    const t0 = performance.now();
    let n = 0;
    while (n < 90) { await new Promise(r => requestAnimationFrame(r)); n++; }
    return { fps: n / ((performance.now() - t0) / 1000), enemies: G.enemies.length };
  });
  ok('满屏敌人 + 弹幕下帧率 >= 45', perf.fps >= 45, perf.fps.toFixed(1) + ' fps');
  ok('全程控制台无报错', consoleErrors.length === 0, consoleErrors.slice(0, 4).join(' | '));
};
