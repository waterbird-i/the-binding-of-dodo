'use strict';
const { section, ok, eq, near, frames, state, luma, press, ROOT, INDEX_URL } = require('../helpers.cjs');

module.exports = async ({ page, context, consoleErrors }) => {
  section('解锁系统与角色');
  const meta = await page.evaluate(async () => {
    const out = {};
    // wipe meta progress so the gate state is deterministic
    for (const k of Object.keys(META.unlocked)) delete META.unlocked[k];
    META.totals = { kills: 0, deaths: 0, wins: 0 };
    metaSave();
    const gated = Object.keys(ITEM_UNLOCKS);
    out.gatedCount = gated.length;
    out.allGatedExist = gated.every(id => !!ITEM_BY_ID[id]);
    out.lockedBefore = gated.every(id => metaItemLocked(id));
    // a locked item never rolls out of the random pool
    let leaked = false;
    for (let i = 0; i < 400; i++) if (metaItemLocked(randomItemDef([]).id)) leaked = true;
    out.poolClean = !leaked;
    // characters: dodo free, the four variants locked
    out.chars = CHAR_DEFS.map(c => c.id).join(',');
    out.dodoFree = !charLocked(CHAR_BY_ID.dodo);
    out.variantsLocked = charLocked(CHAR_BY_ID.rage) && charLocked(CHAR_BY_ID.dark) &&
      charLocked(CHAR_BY_ID.lost) && charLocked(CHAR_BY_ID.gambler);
    // rage unlocks at 300 lifetime kills; dark (and 玻璃大炮) on the first win
    META.totals.kills = 300;
    metaCheck('kill');
    out.rageUnlocked = !charLocked(CHAR_BY_ID.rage);
    META.totals.wins = 1;
    metaCheck('win');
    out.darkUnlocked = !charLocked(CHAR_BY_ID.dark);
    out.glassUnlocked = !metaItemLocked('glass_cannon');
    // event unlocks land the moment the event fires
    metaCheck('no_damage_boss');
    out.kingsUnlocked = !metaItemLocked('kings_mark');
    // lost unlocks at 25 lifetime deaths; gambler on the 25-coin event
    META.totals.deaths = 25;
    metaCheck('death');
    out.lostUnlocked = !charLocked(CHAR_BY_ID.lost);
    metaCheck('coins_25');
    out.gamblerUnlocked = !charLocked(CHAR_BY_ID.gambler);
    // once unlocked, the item can actually roll out of the pool
    let saw = false;
    for (let i = 0; i < 3000 && !saw; i++) saw = randomItemDef([]).id === 'kings_mark';
    out.unlockedRolls = saw;
    // starting statlines
    const base = makePlayer('dodo'), rage = makePlayer('rage'), dark = makePlayer('dark');
    out.rageStats = rage.maxHp === 4 && rage.damage > base.damage && rage.rageMeter === 0;
    out.rageBrow = rage.appearance.brow === 'angry';
    out.darkStats = dark.maxHp === 4 && dark.soulHp === 6 && dark.soulOverflow === true;
    const lost = makePlayer('lost'), gam = makePlayer('gambler');
    out.lostStats = lost.maxHp === 1 && lost.hp === 1 && lost.flight && lost.spectral && lost.shieldMax === 1;
    out.gamStats = gam.coins === 15 && gam.luck >= 2;
    return out;
  });
  ok('门控道具都真实存在', meta.allGatedExist, JSON.stringify(meta));
  ok('清档后 6 件强力道具全部上锁', meta.lockedBefore && meta.gatedCount === 6, meta.gatedCount);
  ok('锁住的道具不会进入随机道具池', meta.poolClean);
  ok('五个角色定义齐全', meta.chars === 'dodo,rage,dark,lost,gambler', meta.chars);
  ok('初始只有 dodo 可用', meta.dodoFree && meta.variantsLocked);
  ok('累计击杀 300 解锁生气 dodo', meta.rageUnlocked);
  ok('通关解锁暗黑 dodo 与玻璃大炮', meta.darkUnlocked && meta.glassUnlocked);
  ok('无伤击败 Boss 解锁王者印记', meta.kingsUnlocked);
  ok('累计死亡 25 次解锁迷失 dodo', meta.lostUnlocked);
  ok('持有 25 金币解锁赌徒 dodo', meta.gamblerUnlocked);
  ok('解锁后道具会进入道具池', meta.unlockedRolls);
  ok('生气 dodo：2 颗心 + 怒气槽 + 怒容', meta.rageStats && meta.rageBrow);
  ok('暗黑 dodo：2 颗红心 + 3 颗魂心', meta.darkStats);
  ok('迷失 dodo：半颗心 + 飞行幽泪圣盾', meta.lostStats);
  ok('赌徒 dodo：15 金币开局 + 幸运', meta.gamStats);

  const soul = await page.evaluate(async () => {
    const out = {};
    const frame = () => new Promise(r => requestAnimationFrame(r));
    // start a run as dark dodo through the real menu path
    G.state = 'menu';
    G.charIdx = CHAR_DEFS.findIndex(c => c.id === 'dark');
    confirmScreen();
    const p = G.player;
    out.started = G.state === 'play' && p.charId === 'dark';
    out.startSoul = p.soulHp === 6 && p.hp === 4 && p.maxHp === 4;
    // soul hearts absorb damage before red hearts
    p.invuln = 0;
    hurtPlayer(G, 1, p.x + 10, p.y);
    out.soulFirst = p.soulHp === 5 && p.hp === 4;
    // spillover healing: hearts picked up at full red become soul hearts
    p.hp = p.maxHp;
    G.room.pickups.push({ kind: 'halfheart', x: p.x, y: p.y, anim: 0, taken: false });
    await frame();
    out.overflow = p.soulHp === 6;
    // the plain dodo still rejects hearts at full health
    G.state = 'menu';
    G.charIdx = 0;
    confirmScreen();
    const p2 = G.player;
    p2.hp = p2.maxHp;
    G.room.pickups.push({ kind: 'halfheart', x: p2.x, y: p2.y, anim: 0, taken: false });
    await frame();
    out.baseNoOverflow = p2.soulHp === 0 && G.room.pickups.some(pk => pk.kind === 'halfheart' && !pk.taken);
    return out;
  });
  ok('菜单选人后以暗黑 dodo 开局', soul.started && soul.startSoul, JSON.stringify(soul));
  ok('魂心先于红心扣除', soul.soulFirst);
  ok('暗黑 dodo 满血吃心转为魂心', soul.overflow);
  ok('普通 dodo 满血不吃心', soul.baseNoOverflow);

  // ------------------------------------------------------- character powers
  section('角色专属机制');
  const powers = await page.evaluate(async () => {
    const out = {};
    const idx = id => CHAR_DEFS.findIndex(c => c.id === id);
    // --- 生气 dodo: rage meter scales stats, low-hp enemies get executed ---
    G.state = 'menu'; G.charIdx = idx('rage'); confirmScreen();
    const p = G.player;
    out.rageStart = p.charId === 'rage' && p.rageMeter === 0;
    addRage(p, 0.5);
    out.rageScales = Math.abs(rageDmgMul(p) - 1.35) < 1e-6 && rageFireMul(p) < 1 && rageSpeedAdd(p) > 0;
    const e = makeEnemy('gaper', p.x + 120, p.y, 1);
    e.spawnT = 0;
    G.enemies.push(e);
    damageEnemy(G, e, e.hp * 0.9, 1, 0);   // leaves 10% < 15% threshold
    out.execute = e.dead === true;
    out.rageFeeds = p.rageMeter > 0.5;      // the kill fed the meter back
    updateRage(p, 1);
    out.rageDecays = p.rageMeter < 0.59;
    // --- 暗黑 dodo: soul flames congeal, devil deals run cheaper, no holy rolls ---
    G.state = 'menu'; G.charIdx = idx('dark'); confirmScreen();
    const d = G.player;
    d.soulHp = 4; d.soulSparks = 2;
    absorbSoulflame(d);
    out.soulCongeal = d.soulHp === 5 && d.soulSparks === 3;
    out.darkDevil = devilPriceFor(d, 2) === 1 && devilSoulCost(d) === 4;
    let holyLeak = false;
    for (let i = 0; i < 400; i++) if (DARK_HOLY_BAN[randomItemDef([]).id]) holyLeak = true;
    out.holyBan = !holyLeak;
    // --- 迷失 dodo: hp-ups slide off, devil deals are free, shield then death ---
    G.state = 'menu'; G.charIdx = idx('lost'); confirmScreen();
    const l = G.player;
    out.lostStart = l.maxHp === 1 && l.hp === 1 && l.shieldUp === true;
    out.lostFree = devilDealAfford(l, 2) && devilDealLabel(l, 2).indexOf('免费') >= 0;
    l.maxHp += 4; l.soulHp = 6;
    clampPlayerStats(l);
    out.lostNoGain = l.maxHp === 1 && l.soulHp === 0;
    l.invuln = 0; hurtPlayer(G, 1, l.x + 10, l.y);
    out.lostShield = l.hp === 1 && l.shieldUp === false;
    l.invuln = 0; hurtPlayer(G, 1, l.x + 10, l.y);
    out.lostDies = l.hp <= 0;
    // --- 赌徒 dodo: fortune rerolls per floor, shops go half price ---
    G.state = 'menu'; G.charIdx = idx('gambler'); confirmScreen();
    const g = G.player;
    out.gamStart = g.charId === 'gambler' && g.coins === 15;
    out.gamMod1 = !!g.gambleMod;
    G.floorNum = 2; loadFloor();
    out.gamMod2 = !!g.gambleMod;
    const shop = G.floor.rooms.find(r => r.kind === 'shop');
    if (shop) enterRoom(shop, 'N');   // shelves stock on first visit
    out.gamShop = !shop || shop.shopItems[0].price === 1;   // battery: 2 → 1
    // hand the default dodo back to the suites that follow — boss hp is
    // sized off player dps, and a leftover gambler would skew that corridor
    G.charIdx = 0;
    G.menuRot = G.menuRotT = 0;
    return out;
  });
  ok('生气 dodo：怒气增伤提速', powers.rageStart && powers.rageScales, JSON.stringify(powers));
  ok('生气 dodo：处决残血敌人并回怒', powers.execute && powers.rageFeeds);
  ok('生气 dodo：怒气随时间消退', powers.rageDecays);
  ok('暗黑 dodo：3 团魂火凝成半颗魂心', powers.soulCongeal);
  ok('暗黑 dodo：恶魔交易更便宜', powers.darkDevil);
  ok('暗黑 dodo：圣物不进道具池', powers.holyBan);
  ok('迷失 dodo：生命上限与魂心无效', powers.lostStart && powers.lostNoGain);
  ok('迷失 dodo：恶魔交易免费', powers.lostFree);
  ok('迷失 dodo：圣盾挡一下 再挨一下即死', powers.lostShield && powers.lostDies);
  ok('赌徒 dodo：每层重摇运势 商店半价', powers.gamStart && powers.gamMod1 && powers.gamMod2 && powers.gamShop);

  // ------------------------------------------------------------ branch floors
  section('分岔层（第 4 / 8 层）');
  const branch = await page.evaluate(async () => {
    const out = {};
    const frame = () => new Promise(r => requestAnimationFrame(r));
    const god = () => { G.player.maxHp = 24; G.player.hp = 24; G.player.invuln = 5; };
    startRun();
    const goBoss = async () => {
      const bossRoom = G.floor.rooms.find(r => r.kind === 'boss');
      enterRoom(bossRoom, 'N');
      await frame();
      const boss = G.enemies.find(e => e.isBoss);
      god();
      damageEnemy(G, boss, 1e6, 0, -1);
      for (let i = 0; i < 6; i++) { god(); await frame(); }
      return bossRoom;
    };
    // floor 1: a single hatch
    const r1 = await goBoss();
    out.floor1Single = !!r1.trapdoor && !r1.trapdoorHard;
    // floor 4: the fork appears
    G.hardFloor = false; G.floorNum = 4; loadFloor();
    const r4 = await goBoss();
    out.fork4 = !!r4.trapdoor && !!r4.trapdoorHard && r4.trapdoor.x !== r4.trapdoorHard.x;
    // stepping into the spiked hatch arms the risky floor 5
    G.player.x = r4.trapdoorHard.x; G.player.y = r4.trapdoorHard.y;
    for (let i = 0; i < 8 && G.floorNum === 4; i++) { god(); await frame(); }
    out.floor5 = G.floorNum === 5;
    out.hardFlag = G.floor.hard === true;
    out.doubleTreasure = G.floor.rooms.find(r => r.kind === 'treasure').pedestals.length === 2;
    // risky enemies carry 1.35× hp (gaper hp is deterministic per depth)
    const hard = makeEnemy('gaper', 0, 0, 5).hp;
    G.floor.hard = false;
    const norm = makeEnemy('gaper', 0, 0, 5).hp;
    G.floor.hard = true;
    out.hpMul = Math.abs(hard / norm - 1.35) < 0.001;
    // the risky floor's own boss room: single hatch, double reward
    const r5 = await goBoss();
    out.floor5Single = !!r5.trapdoor && !r5.trapdoorHard;
    out.bossReward2 = r5.pedestals.filter(pd => !pd.taken).length >= 2;
    // the safe hatch resets the modifier
    G.player.x = r5.trapdoor.x; G.player.y = r5.trapdoor.y;
    for (let i = 0; i < 8 && G.floorNum === 5; i++) { god(); await frame(); }
    out.floor6Normal = G.floorNum === 6 && G.floor.hard === false;
    // floor 8 forks too
    G.hardFloor = false; G.floorNum = 8; loadFloor();
    const r8 = await goBoss();
    out.fork8 = !!r8.trapdoor && !!r8.trapdoorHard;
    return out;
  });
  ok('第 1 层只有一个地道口', branch.floor1Single, JSON.stringify(branch));
  ok('第 4 层 Boss 后出现两个门', branch.fork4);
  ok('走危险门进入危险的第 5 层', branch.floor5 && branch.hardFlag);
  ok('危险层宝藏房放两个道具座', branch.doubleTreasure);
  ok('危险层敌人血量 ×1.35', branch.hpMul);
  ok('危险层 Boss 掉双倍奖励', branch.bossReward2);
  ok('第 5 层自身不分岔', branch.floor5Single);
  ok('走安全门回到普通难度', branch.floor6Normal);
  ok('第 8 层同样分岔', branch.fork8);

};
