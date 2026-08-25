'use strict';
const { section, ok, eq, near, frames, state, luma, press, ROOT, INDEX_URL } = require('../helpers.cjs');

module.exports = async ({ page, context, consoleErrors }) => {
  section('分池与种子');
  const poolInfo = await page.evaluate(() => {
    const out = {};
    out.devilTagged = ITEM_POOL_TAGS.devil.every(id => (ITEM_BY_ID[id] || {}).pool === 'devil');
    out.shopTagged = ITEM_POOL_TAGS.shop.every(id => (ITEM_BY_ID[id] || {}).pool === 'shop');
    out.devilRolls = true;
    out.treasureRolls = true;
    for (let i = 0; i < 40; i++) {
      if ((randomItemDef([], 'devil').pool || 'treasure') !== 'devil') out.devilRolls = false;
      if ((randomItemDef([], 'treasure').pool || 'treasure') !== 'treasure') out.treasureRolls = false;
    }
    // drained pool falls back to the full catalogue instead of crashing
    out.fallback = !!randomItemDef(poolDefs('devil').map(d => d.id), 'devil');
    return out;
  });
  ok('恶魔池标签生效', poolInfo.devilTagged);
  ok('商店池标签生效', poolInfo.shopTagged);
  ok('恶魔池只掉恶魔道具', poolInfo.devilRolls);
  ok('宝箱池只掉未标签道具', poolInfo.treasureRolls);
  ok('池抽干后回退全道具表', poolInfo.fallback);

  const seedInfo = await page.evaluate(() => {
    const out = {};
    const snap = f => f.rooms.map(r => r.gx + ',' + r.gy + ':' + r.kind).sort().join('|');
    const a = withRng(floorSeed(12345, 3, 0), () => generateFloor(3));
    const b = withRng(floorSeed(12345, 3, 0), () => generateFloor(3));
    const c = withRng(floorSeed(54321, 3, 0), () => generateFloor(3));
    out.same = snap(a) === snap(b);
    out.diff = snap(a) !== snap(c);
    // a custom-seeded run reproduces the whole first floor and is fenced off
    G.pendingSeedStr = 'DODOTEST';
    startRun();
    const first = snap(G.floor);
    out.tainted = G.devTainted === true;
    out.seedShown = G.seedStr === 'DODOTEST';
    G.pendingSeedStr = 'DODOTEST';
    startRun();
    out.runSame = snap(G.floor) === first;
    // curses ride the seed too
    const cursesA = [], cursesB = [];
    for (const arr of [cursesA, cursesB]) {
      G.pendingSeedStr = 'DODOTEST';
      startRun();
      for (let i = 2; i <= 6; i++) { G.floorNum = i; loadFloor(); arr.push(G.floorCurse); }
    }
    out.curseSame = cursesA.join() === cursesB.join();
    G.pendingSeedStr = null;
    startRun();
    out.freshUntainted = G.devTainted === false && G.seedStr.length === 8;
    return out;
  });
  ok('同种子同层布局完全一致', seedInfo.same);
  ok('不同种子布局不同', seedInfo.diff);
  ok('输入种子后整局第一层可复现', seedInfo.runSame && seedInfo.seedShown);
  ok('诅咒序列也跟随种子', seedInfo.curseSame);
  ok('种子局与开发者模式同规则（不上榜不解锁）', seedInfo.tainted);
  ok('随机局正常生成 8 位种子且不受限', seedInfo.freshUntainted);

  section('魂心与双层血条');
  const soulInfo = await page.evaluate(() => {
    const out = {};
    startRun();
    const p = G.player;
    p.soulHp = 0; p.invuln = 0;
    G.room.pickups.push({ kind: 'soulheart', x: p.x, y: p.y, anim: 0, taken: false });
    updatePlay(1 / 60);
    out.gained = p.soulHp === 2;
    const hp = p.hp;
    hurtPlayer(G, 1, p.x + 50, p.y);
    out.soulFirst = p.soulHp === 1 && p.hp === hp;
    try { render(); out.renders = true; } catch (e) { out.renders = false; }
    return out;
  });
  ok('魂心拾取物 +1 颗魂心', soulInfo.gained, JSON.stringify(soulInfo));
  ok('受击先烧魂心再扣红心（双层血条）', soulInfo.soulFirst);
  ok('血条渲染无报错', soulInfo.renders);

  section('二选一宝箱房');
  const choiceInfo = await page.evaluate(() => {
    const out = {};
    let tr = null, tries = 0;
    while (tries++ < 200 && !tr) {
      startRun();
      tr = G.floor.rooms.find(r => r.kind === 'treasure' && r.pedestals.some(pd => pd.choiceGroup));
    }
    if (!tr) return { skip: true };
    const p = G.player;
    p.invuln = 9999;
    enterRoom(tr, null);
    out.two = tr.pedestals.filter(pd => pd.def && !pd.taken && pd.choiceGroup).length === 2;
    const ped = tr.pedestals[0];
    p.x = ped.x; p.y = ped.y;
    updatePlay(1 / 60);
    out.took = ped.taken === true && p.itemsTaken.includes(ped.def.id);
    out.otherGone = tr.pedestals[1].taken === true;
    out.onlyOne = p.itemsTaken.length === 1;
    return out;
  });
  ok('二选一房出现且摆两件', choiceInfo.skip || choiceInfo.two, JSON.stringify(choiceInfo));
  ok('拿走一件 另一件化为尘土', choiceInfo.skip || (choiceInfo.took && choiceInfo.otherGone && choiceInfo.onlyOne));

  section('恶魔交易');
  const devilInfo = await page.evaluate(() => {
    const out = {};
    let dr = null, tries = 0;
    while (tries++ < 60 && !dr) {
      startRun();
      G.player.invuln = 9999;
      const bossRoom = G.floor.rooms.find(r => r.kind === 'boss');
      enterRoom(bossRoom, null);
      const boss = G.enemies.find(e => e.isBoss);
      boss.spawnT = 0;
      G.bossFightHurt = false;   // clean fight = best devil odds
      killEnemy(G, boss);
      dr = G.floor.rooms.find(r => r.kind === 'devil');
    }
    if (!dr) return { skip: true };
    out.linked = Object.values(G.room.doors).includes(dr);
    out.seen = dr.seen === true;
    enterRoom(dr, null);
    out.peaceful = dr.cleared === true && G.enemies.length === 0;
    const deals = dr.pedestals.filter(pd => pd.devilPrice);
    out.twoDeals = deals.length === 2 && deals.every(pd => pd.def && pd.def.pool === 'devil');
    const p = G.player;
    // broke dodo: one heart container, no souls -> the devil refuses
    p.maxHp = 2; p.hp = 2; p.soulHp = 0; p.invuln = 9999;
    const d1 = deals[0];
    p.x = d1.x; p.y = d1.y;
    updatePlay(1 / 60);
    out.refused = !d1.taken;
    // pay with heart containers
    p.maxHp = 6; p.hp = 6; d1.denyT = 0;
    updatePlay(1 / 60);
    out.paidHearts = d1.taken === true && p.itemsTaken.includes(d1.def.id) && p.maxHp <= 4;
    // containers at the floor -> 3 soul hearts settle the bill
    const d2 = deals[1];
    p.maxHp = 2; p.hp = 2; p.soulHp = 8;
    p.x = d2.x; p.y = d2.y;
    updatePlay(1 / 60);
    out.paidSouls = d2.taken === true && p.soulHp === 2;
    return out;
  });
  ok('Boss 死后可能裂开恶魔房', devilInfo.skip || (devilInfo.linked && devilInfo.seen),
    JSON.stringify(devilInfo));
  ok('恶魔房无敌人 两件恶魔池交易', devilInfo.skip || (devilInfo.peaceful && devilInfo.twoDeals));
  ok('生命不足时恶魔拒绝交易', devilInfo.skip || devilInfo.refused);
  ok('用红心上限支付交易', devilInfo.skip || devilInfo.paidHearts);
  ok('红心不够时用 3 颗魂心支付', devilInfo.skip || devilInfo.paidSouls);

  section('D6 重摇');
  const d6Info = await page.evaluate(() => {
    const out = {};
    let ped = null, tries = 0;
    while (tries++ < 40 && !ped) {
      startRun();
      const tr = G.floor.rooms.find(r => r.kind === 'treasure');
      G.player.invuln = 9999;
      enterRoom(tr, null);
      ped = tr.pedestals.find(pd => pd.def && !pd.taken);
    }
    if (!ped) return { skip: true };
    const p = G.player;
    equipActive(p, ACTIVE_BY_ID['act_d6']);
    out.fullOnPickup = p.active.charge === p.active.def.cost;
    const before = ped.def.id;
    useActiveItem();
    out.rerolled = ped.def.id !== before && !ped.taken;
    out.discharged = p.active.charge === 0;
    // nothing left to reroll -> the die explains itself
    G.room.pedestals.forEach(pd => { pd.taken = true; });
    p.active.charge = 2;
    useActiveItem();
    out.emptyMsg = !!(G.toast && G.toast.desc.includes('没有可以重摇'));
    return out;
  });
  ok('六面骰满充能入手', d6Info.skip || d6Info.fullOnPickup, JSON.stringify(d6Info));
  ok('空格重摇本房道具为新道具', d6Info.skip || (d6Info.rerolled && d6Info.discharged));
  ok('无道具可摇时给出提示', d6Info.skip || d6Info.emptyMsg);

  section('献祭房');
  const sacInfo = await page.evaluate(() => {
    const out = {};
    let sac = null, tries = 0;
    while (tries++ < 80 && !sac) {
      startRun();
      sac = G.floor.rooms.find(r => r.kind === 'sacrifice');
    }
    if (!sac) return { skip: true };
    const p = G.player;
    enterRoom(sac, null);
    out.peaceful = sac.cleared === true && G.enemies.length === 0;
    p.maxHp = 24; p.hp = 24; p.soulHp = 0; p.invuln = 0;
    p.x = W / 2; p.y = H / 2;
    updatePlay(1 / 60);
    out.bled = p.hp === 22 && sac.sacrifices === 1;
    out.coin = sac.pickups.some(pk => pk.kind === 'coin');
    // the third offering must be the final high-grade item
    for (let i = 0; i < 2; i++) {
      p.invuln = 0; sac.altarCd = 0; p.hp = 24;
      p.x = W / 2; p.y = H / 2;
      updatePlay(1 / 60);
    }
    out.noHealthRewards = !sac.pickups.some(pk => ['heart', 'halfheart', 'soulheart'].includes(pk.kind));
    out.items = sac.pedestals.some(pd => pd.def && (pd.def.pool || 'treasure') === 'treasure');
    out.done = sac.altarDone === true && sac.sacrifices === 3;
    // a retired altar stops biting
    p.invuln = 0; sac.altarCd = 0;
    const hpBefore = p.hp;
    p.x = W / 2; p.y = H / 2;
    updatePlay(1 / 60);
    out.retired = p.hp === hpBefore;
    return out;
  });
  ok('献祭房无敌人门常开', sacInfo.skip || sacInfo.peaceful, JSON.stringify(sacInfo));
  ok('踩尖刺扣一颗心并计数', sacInfo.skip || sacInfo.bled);
  ok('献祭可掉金币且不掉生命值相关道具', sacInfo.skip || (sacInfo.coin && sacInfo.noHealthRewards));
  ok('第 3 次献祭必掉高级道具后祭坛沉寂', sacInfo.skip || (sacInfo.items && sacInfo.done && sacInfo.retired));

  section('转变系统');
  const tfInfo = await page.evaluate(() => {
    const out = {};
    startRun();
    const p = G.player;
    const give = id => {
      ITEM_BY_ID[id].apply(p); clampPlayerStats(p);
      p.itemsTaken.push(id); checkTransformations(G, p);
    };
    give('twin_feather'); give('triple_feather');
    out.notYet = !p.transforms.tf_angel;
    give('angel_wing');
    out.angel = p.transforms.tf_angel === true && p.flight === true && p.appearance.hat === 'halo';
    out.toast = !!(G.toast && G.toast.title.includes('羽翼圣者'));
    give('devil_horn'); give('dark_book'); give('blood_tear');
    out.devil = p.transforms.tf_devil === true && p.appearance.hat === 'horns';
    give('demon_pact');   // a 4th devil item must not re-trigger or crash
    out.once = p.transforms.tf_devil === true;
    give('life_mushroom'); give('mini_mush'); give('poop_charm');
    out.mush = p.transforms.tf_mushroom === true && p.appearance.hat === 'mushcap';
    try { render(); out.renders = true; } catch (e) { out.renders = false; }
    return out;
  });
  ok('两件同系不触发转变', tfInfo.notYet, JSON.stringify(tfInfo));
  ok('3 件羽毛系 → 羽翼圣者（飞行+光环）', tfInfo.angel && tfInfo.toast);
  ok('3 件恶魔系 → 恶魔化身（尖角）', tfInfo.devil && tfInfo.once);
  ok('3 件菌菇系 → 蘑菇之王（菌盖）', tfInfo.mush);
  ok('转变外观渲染无报错', tfInfo.renders);

  section('诅咒楼层');
  const curseInfo = await page.evaluate(() => {
    const out = { counts: { darkness: 0, lost: 0, unknown: 0, none: 0 } };
    G.pendingSeedStr = null;
    let f1Cursed = false;
    for (let i = 0; i < 20; i++) { startRun(); if (G.floorCurse) f1Cursed = true; }
    out.floor1Clean = !f1Cursed;
    for (let i = 0; i < 120; i++) {
      G.runSeed = (Math.random() * 4294967295) >>> 0;
      G.floorNum = randi(2, 11);
      loadFloor();
      out.counts[G.floorCurse || 'none']++;
    }
    out.cursedTotal = 120 - out.counts.none;
    out.rateOk = out.cursedTotal >= 14 && out.cursedTotal <= 62;
    out.allKinds = out.counts.darkness > 0 && out.counts.lost > 0 && out.counts.unknown > 0;
    try {
      for (const c of ['lost', 'unknown', 'darkness']) {
        G.floorCurse = c;
        G.mapOverlay = c === 'lost';
        render();
      }
      G.mapOverlay = false;
      G.floorCurse = null;
      out.renders = true;
    } catch (e) { out.renders = false; }
    return out;
  });
  ok('第 1 层永不掉诅咒', curseInfo.floor1Clean);
  ok('深层约 30% 掉诅咒', curseInfo.rateOk, curseInfo.cursedTotal + '/120');
  ok('三种诅咒都会出现', curseInfo.allKinds, JSON.stringify(curseInfo.counts));
  ok('诅咒下渲染无报错', curseInfo.renders);

  // ---------------------------------------------------- minimap & full map
};
