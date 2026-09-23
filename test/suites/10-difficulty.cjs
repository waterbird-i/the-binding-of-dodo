'use strict';
// ============================================================================
// 难度与数值曲线专项：三档难度预设、Boss 双边血量窗口、敌人速度/数量缩放、
// 道具三档分层抽选。核心不变量只有一个：难度只缩放数值乘数，绝不消耗额外的
// 随机流 —— 同种子在三档下必须生成完全相同的地牢。
// ============================================================================
const { section, ok, eq, near } = require('../helpers.cjs');

module.exports = async ({ page }) => {
  section('难度三档');
  const presets = await page.evaluate(() => {
    const out = {
      keys: DIFF_ORDER.slice(),
      labels: DIFF_ORDER.map(k => DIFFICULTY_PRESETS[k].label),
      knobs: ['enemyHp', 'enemyCount', 'enemySpeed', 'enemyDmg',
        'bossHp', 'bossCap', 'bossMin', 'bossGap', 'bulletSpeed'],
    };
    out.start = DIFF_KEY;
    setDifficulty('hard');
    out.afterSet = DIFF_KEY;
    out.hard = { hp: diffMul('enemyHp'), count: diffMul('enemyCount'), dmg: diffMul('enemyDmg'), gap: diffMul('bossGap'), cap: diffMul('bossCap'), min: diffMul('bossMin'), bullet: diffMul('bulletSpeed') };
    setDifficulty('easy');
    out.easy = { hp: diffMul('enemyHp'), count: diffMul('enemyCount'), speed: diffMul('enemySpeed'),
      dmg: diffMul('enemyDmg'), cap: diffMul('bossCap'), min: diffMul('bossMin'),
      gap: diffMul('bossGap'), bullet: diffMul('bulletSpeed'), invuln: diffMul('invulnMul'),
      openingBoss: diffMul('openingBoss'), openingEase: diffMul('openingEase'),
      openingHeal: diffMul('openingHeal') };
    out.normalKeys = Object.keys(DIFFICULTY_PRESETS.normal);
    out.hardKeys = Object.keys(DIFFICULTY_PRESETS.hard);
    setDifficulty('normal');
    out.neutral = out.knobs.every(k => diffMul(k) === 1);
    out.badKeyFallsBack = (setDifficulty('nonsense'), DIFF_KEY === 'normal');
    out.unknownKnobNoop = diffMul('no_such_knob') === 1;
    return out;
  });
  eq('三档难度', presets.keys.length, 3);
  ok('三档为 轻松 / 标准 / 硬核', presets.labels.join(',') === '轻松,标准,硬核', presets.labels.join(','));
  ok('setDifficulty 切换生效', presets.afterSet === 'hard');
  ok('硬核：敌人更厚更多更疼、出招更密、弹速更快',
    presets.hard.hp > 1 && presets.hard.count > 1 && presets.hard.dmg > 1 &&
    presets.hard.gap < 1 && presets.hard.bullet > 1);
  ok('硬核：Boss 窗口整体上移（上限 ×1.15 / 下限 ×1.30）',
    presets.hard.cap > 1 && presets.hard.min > presets.hard.cap);
  ok('轻松：敌人更脆更少更慢、伤害减半、出招间隔放大、弹速更慢',
    presets.easy.hp === 0.6 && presets.easy.count === 0.7 && presets.easy.speed === 0.85 &&
    presets.easy.dmg === 0.6 && presets.easy.gap === 1.5 && presets.easy.bullet === 0.82,
    JSON.stringify(presets.easy));
  ok('轻松：Boss 血量与双边窗口一起下调（血量 ×0.85 / 窗口 ×0.8）',
    presets.easy.cap === 0.8 && presets.easy.min === 0.8);
  ok('轻松：受击无敌帧放宽到 1.2 倍、开局三个旋钮到位',
    presets.easy.invuln === 1.2 && presets.easy.openingBoss === 0.65 &&
    presets.easy.openingEase === 0.7 && presets.easy.openingHeal === 3);
  ok('标准档所有旋钮都是 1（原始手感）', presets.neutral);
  ok('非法档位名回退标准（不会把游戏调成 0）', presets.badKeyFallsBack);
  ok('开局旋钮只在轻松档定义（标准档查到 undefined → 1，一个数没动）',
    !presets.normalKeys.includes('invulnMul') && !presets.normalKeys.includes('openingBoss') &&
    !presets.normalKeys.includes('openingEase') && !presets.normalKeys.includes('openingHeal') &&
    !presets.hardKeys.includes('openingEase'),
    JSON.stringify([presets.normalKeys, presets.hardKeys]));
  ok('未知旋钮名按 1 处理（no-op）', presets.unknownKnobNoop);

  // ------------------------------------------------ 难度不污染种子随机流
  const seedSame = await page.evaluate(() => {
    // 小 Boss 房现在按层开关（第 1-2 层没有），但那条门刻意照常抽一次
    // chance(0.5) 再丢弃结果，随机流长度不变——所以同一颗种子在第 6 层
    // 与第 1 层都必须三档一致。第 1 层曾经是小 Boss 关掉后最容易漏掉的层
    // （少了这次抽选，后面的秘密房选点会整体平移），单独查一遍。
    const gen = (k, depth) => {
      setDifficulty(k);
      const f = withRng(floorSeed(4242, depth, 0), () => generateFloor(depth, false));
      const out = {
        depth,
        rooms: f.rooms.length,
        kinds: f.rooms.map(r => r.kind).sort().join(','),
        cells: f.rooms.map(r => r.gx + ':' + r.gy).sort().join(','),
        rocks: f.rooms.reduce((s, r) => s + r.rocks.length, 0),
        start: f.start.gx + ':' + f.start.gy,
      };
      // item rolls must also consume the identical stream: same seed -> same
      // number of draws, so the pedestal positions across a floor never shift
      out.rolls = [0, 1, 2, 3, 4].map(i =>
        withRng(floorSeed(4242, 7, 90 + i), () => randomItemDef([], 'treasure')).id).join(',');
      return out;
    };
    const out = { easy: gen('easy', 7), normal: gen('normal', 7), hard: gen('hard', 7) };
    out.f1 = { easy: gen('easy', 1), normal: gen('normal', 1), hard: gen('hard', 1) };
    out.f2 = { easy: gen('easy', 2), normal: gen('normal', 2), hard: gen('hard', 2) };
    setDifficulty('normal');
    return out;
  });
  const sameLayout = (a, b) =>
    a.rooms === b.rooms && a.kinds === b.kinds && a.cells === b.cells &&
    a.rocks === b.rocks && a.start === b.start;
  ok('同种子在三档下地牢布局完全一致（房间数/房型/坐标/岩石/起点）',
    sameLayout(seedSame.easy, seedSame.normal) && sameLayout(seedSame.normal, seedSame.hard),
    JSON.stringify([seedSame.easy.rooms, seedSame.normal.rooms, seedSame.hard.rooms]));
  ok('同种子在三档下道具抽选次数一致（每个种子都抽出结果，没有多抽/少抽）',
    seedSame.easy.rolls.split(',').length === 5 &&
    seedSame.normal.rolls.split(',').length === 5 &&
    seedSame.hard.rolls.split(',').length === 5);
  ok('同种子在第 1 / 2 层也完全一致（小 Boss 门不改变随机流长度）',
    sameLayout(seedSame.f1.easy, seedSame.f1.normal) && sameLayout(seedSame.f1.normal, seedSame.f1.hard) &&
    sameLayout(seedSame.f2.easy, seedSame.f2.normal) && sameLayout(seedSame.f2.normal, seedSame.f2.hard),
    JSON.stringify([seedSame.f1.normal.rooms, seedSame.f1.normal.kinds]));
  ok('第 1 / 2 层在三档下都没有小 Boss 房',
    !seedSame.f1.easy.kinds.includes('miniboss') && !seedSame.f1.hard.kinds.includes('miniboss') &&
    !seedSame.f2.easy.kinds.includes('miniboss') && !seedSame.f2.normal.kinds.includes('miniboss'));

  // ------------------------------------------------------ 敌人数值随难度缩放
  const enemyScale = await page.evaluate(() => {
    const savedHard = G.floor ? G.floor.hard : false;
    if (G.floor) G.floor.hard = false;
    const sample = (k, depth) => {
      setDifficulty(k);
      const e = makeEnemy('gaper', W / 2, H / 2, depth);
      const out = { hp: e.hp, spMul: e.speedMul, touch: e.touchDamage, shot: e.shotDmg };
      e.dead = true;
      return out;
    };
    const out = {
      easy12: sample('easy', 12), normal12: sample('normal', 12), hard12: sample('hard', 12),
      normal1: sample('normal', 1), normal7: sample('normal', 7),
      // 开局宽容：第 1 / 2 层叠一层额外系数，第 3 层起回到基础比例
      easy1: sample('easy', 1), normal2: sample('normal', 2), easy2: sample('easy', 2),
      easy3: sample('easy', 3), normal3: sample('normal', 3),
    };
    setDifficulty('normal');
    if (G.floor) G.floor.hard = savedHard;
    return out;
  });
  near('硬核小怪血量 ×1.25', enemyScale.hard12.hp / enemyScale.normal12.hp, 1.25, 0.02);
  near('轻松小怪血量 ×0.6', enemyScale.easy12.hp / enemyScale.normal12.hp, 0.6, 0.01);
  near('硬核小怪弹速 ×1.08', enemyScale.hard12.spMul / enemyScale.normal12.spMul, 1.08, 0.005);
  near('轻松小怪速度 ×0.85', enemyScale.easy12.spMul / enemyScale.normal12.spMul, 0.85, 0.005);
  near('楼层速度爬升：第 12 层比第 1 层快 22%', enemyScale.normal12.spMul / enemyScale.normal1.spMul, 1.22, 0.01);
  near('楼层速度爬升：第 7 层 +12%', enemyScale.normal7.spMul / enemyScale.normal1.spMul, 1.12, 0.01);
  ok('硬核把深处接触伤害推到 4（标准为 3）',
    enemyScale.normal12.touch === 3 && enemyScale.hard12.touch === 4,
    enemyScale.normal12.touch + ' -> ' + enemyScale.hard12.touch);
  ok('难度对弹幕伤害同样生效（标准 4 / 硬核 5）',
    enemyScale.normal12.shot === 4 && enemyScale.hard12.shot === 5,
    enemyScale.normal12.shot + ' -> ' + enemyScale.hard12.shot);

  // 开局宽容：只叠在第 1-2 层，第 3 层起只剩基础比例。用血量比值（不含随机量）测，
  // 速度比值同源同系数，所以一条就锁住了两处接线。
  near('轻松第 1 层小怪血量 = 基础 ×0.7（0.6 × 0.7 = 0.42）',
    enemyScale.easy1.hp / enemyScale.normal1.hp, 0.42, 0.01);
  near('轻松第 2 层同样享受开局宽容', enemyScale.easy2.hp / enemyScale.normal2.hp, 0.42, 0.01);
  near('第 3 层起回到基础比例（开局宽容不越界）',
    enemyScale.easy3.hp / enemyScale.normal3.hp, 0.6, 0.01);
  ok('轻松档第 1 层接触伤害仍留半颗心（0.42 被 Math.max(1, …) 兜住，不会归零）',
    enemyScale.easy1.touch === 1 && enemyScale.easy1.shot === 1,
    'touch=' + enemyScale.easy1.touch + ' shot=' + enemyScale.easy1.shot);
  ok('轻松档深处接触伤害降一档（标准 3 → 轻松 2）',
    enemyScale.easy12.touch === 2, String(enemyScale.easy12.touch));

  // 受击无敌帧：轻松档 1.32s，标准 / 硬核仍是 1.1s（走真实的 hurtPlayer 路径）
  const invuln = await page.evaluate(() => {
    const saved = { p: G.player, st: G.state, dev: G.dev };
    const out = {};
    for (const k of DIFF_ORDER) {
      setDifficulty(k);
      const p = makePlayer('dodo');
      G.player = p; G.state = 'play'; G.dev = false; G.floorDamage = 0;
      hurtPlayer(G, 1, p.x + 10, p.y);
      out[k] = p.invuln;
    }
    setDifficulty('normal');
    G.player = saved.p; G.state = saved.st; G.dev = saved.dev;
    startRun();
    return out;
  });
  near('轻松档受击无敌帧 1.32s', invuln.easy, 1.32, 0.01);
  ok('标准 / 硬核受击无敌帧没被改动（仍是 1.1s）',
    Math.abs(invuln.normal - 1.1) < 1e-9 && Math.abs(invuln.hard - 1.1) < 1e-9,
    invuln.normal + ' / ' + invuln.hard);

  // ---------------------------------------------------- 刷怪数量随难度缩放
  const counts = await page.evaluate(() => {
    // depth 参数化：第 1 层也要查一遍——轻松档开局少刷怪是这次改动最直接的一档
    const avg = (k, depth) => {
      setDifficulty(k);
      let total = 0, n = 0;
      for (let s = 1; s <= 24; s++) {
        const f = withRng(floorSeed(s * 977, depth, 0), () => generateFloor(depth, false));
        const room = f.rooms.find(r => r.kind === 'normal') || f.rooms[f.rooms.length - 1];
        const saved = { floor: G.floor, room: G.room, enemies: G.enemies, num: G.floorNum };
        room.kind = 'normal';
        f.hard = false;
        G.floor = f; G.room = room; G.enemies = []; G.floorNum = depth;
        withRng(floorSeed(s * 977, depth, 5), () => spawnRoomEnemies(room));
        total += G.enemies.length; n++;
        G.floor = saved.floor; G.room = saved.room; G.enemies = saved.enemies; G.floorNum = saved.num;
      }
      return total / n;
    };
    const out = { easy: avg('easy', 10), normal: avg('normal', 10), hard: avg('hard', 10),
      easy1: avg('easy', 1), normal1: avg('normal', 1) };
    setDifficulty('normal');
    startRun();          // hand every later suite a clean run
    return out;
  });
  ok('第 10 层每房敌人数回到个位数（不再一律顶到 10 只）',
    counts.normal >= 6 && counts.normal <= 9, counts.normal.toFixed(1));
  ok('三档难度下刷怪数递增', counts.easy < counts.normal && counts.normal < counts.hard,
    [counts.easy, counts.normal, counts.hard].map(v => v.toFixed(1)).join(' < '));
  ok('轻松档第 1 层每房小怪不到 2 只（标准约 2.9 只）',
    counts.easy1 < 2 && counts.easy1 / counts.normal1 <= 0.7,
    counts.easy1.toFixed(2) + ' vs ' + counts.normal1.toFixed(2));


  // 轻松档前两层的容错：清房掉半心概率 ×3。这里用真实调用（onRoomCleared 的完整
  // 分支链）统计频率，而不是重算一遍公式——接错线的话数值对不上。
  const healRate = await page.evaluate(() => {
    const saved = { room: G.room, num: G.floorNum, tainted: G.devTainted, floor: G.floor };
    G.devTainted = true;                       // 别往 localStorage 写 6000 次
    const sample = (k, depth) => {
      setDifficulty(k);
      G.floorNum = depth;
      const room = { pickups: [], rocks: [], stains: [], pedestals: [], cleared: false };
      G.room = room;
      let hit = 0;
      const N = 2000;
      for (let i = 0; i < N; i++) {
        room.pickups = [];
        onRoomCleared(room);
        if (room.pickups.some(p => p.kind === 'halfheart')) hit++;
      }
      return hit / N;
    };
    const out = { easy1: sample('easy', 1), easy2: sample('easy', 2), easy3: sample('easy', 3),
      normal1: sample('normal', 1), hard1: sample('hard', 1) };
    setDifficulty('normal');
    G.room = saved.room; G.floorNum = saved.num; G.devTainted = saved.tainted; G.floor = saved.floor;
    return out;
  });
  near('轻松档第 1 层清房掉半心 18%（标准 6%）', healRate.easy1, 0.18, 0.04);
  near('轻松档第 2 层同样 18%', healRate.easy2, 0.18, 0.04);
  near('第 3 层起回到 6%（容错只在开局）', healRate.easy3, 0.06, 0.03);
  near('标准档全程仍是 6%', healRate.normal1, 0.06, 0.03);
  near('硬核档全程仍是 6%', healRate.hard1, 0.06, 0.03);
  // ------------------------------------------------------- Boss 血量双边窗口
  const bossWin = await page.evaluate(() => {
    const secs = (k) => {
      setDifficulty(k);
      const saved = { player: G.player, num: G.floorNum, hard: G.floor.hard };
      G.floorNum = 6; G.floor.hard = false;
      const p = makePlayer(); p.damage = 60; p.fireDelay = 0.1; G.player = p;
      const dps = estimatePlayerDPS(p);
      const b = makeBoss(bossDefForFloor(6), W / 2, H / 2);
      G.player = saved.player; G.floorNum = saved.num; G.floor.hard = saved.hard;
      return b.maxHpRef / dps;
    };
    const out = { easy: secs('easy'), normal: secs('normal'), hard: secs('hard') };
    // a weak build must still be capped, never inflated up to the table hp
    setDifficulty('normal');
    const saved = { player: G.player, num: G.floorNum, hard: G.floor.hard };
    G.floorNum = 6; G.floor.hard = false;
    const weak = makePlayer(); G.player = weak;
    const weakDps = estimatePlayerDPS(weak);
    const bw = makeBoss(bossDefForFloor(6), W / 2, H / 2);
    out.weakSecs = bw.maxHpRef / weakDps;
    out.weakCapped = bw.maxHpRef <= BOSS_DEFS[5].hp;
    G.player = saved.player; G.floorNum = saved.num; G.floor.hard = saved.hard;
    startRun();
    return out;
  });
  near('输出足够高的 build 被抬到 8s 下限', bossWin.normal, 8, 0.3);
  near('硬核下限 = 8s × 1.30', bossWin.hard, 8 * 1.3, 0.4);
  near('轻松下限 = 8s × 0.80', bossWin.easy, 8 * 0.8, 0.4);
  ok('裸装 build 仍受 55s 上限压制（不按血表硬撑一分钟以上）',
    bossWin.weakCapped && bossWin.weakSecs <= 55.5,
    bossWin.weakSecs.toFixed(1) + 's');

  // 「只有 build 够强才能速杀」：抬升有上限，超过上限之后打得越来越快
  const ladder = await page.evaluate(() => {
    const s = { p: G.player, num: G.floorNum, hard: G.floor ? G.floor.hard : false };
    G.floorNum = 6; if (G.floor) G.floor.hard = false;
    const step = (dmg, delay, extra) => {
      const p = makePlayer(); p.damage = dmg; p.fireDelay = delay;
      if (extra) Object.assign(p, extra);
      G.player = p;
      const dps = estimatePlayerDPS(p);
      const b = makeBoss(bossDefForFloor(6), W / 2, H / 2);
      return { dps, hp: b.maxHpRef, secs: b.maxHpRef / dps,
        lo: b.hpWindow.lo, tableHp: b.def.hp };
    };
    const out = {
      naked: step(3.5, 0.42),                     // 裸装
      mid: step(9, 0.28),                         // 中配
      near: step(15, 0.12),                       // 刚够摸到抬升上限
      over: step(40, 0.12),                       // 血表仍支配
      monster: step(60, 0.1, { multishot: 4 }),   // 数值堆满，抬升上限被顶到
    };
    G.player = s.p; G.floorNum = s.num; if (G.floor) G.floor.hard = s.hard;
    startRun();
    return out;
  });
  const ladderSecs = [ladder.naked.secs, ladder.mid.secs, ladder.near.secs,
    ladder.over.secs, ladder.monster.secs];
  ok('build 越强 Boss 战越短（单调不增；同在上限的弱 build 是一条平台）',
    // hp 取整会带来最多 ~0.5/dps 秒的抖动，所以给 0.25s 容差
    ladderSecs.every((v, i) => i === 0 || v <= ladderSecs[i - 1] + 0.25),
    ladderSecs.map(v => v.toFixed(1)).join(' → '));
  ok('弱 / 中配摸不到 8 秒（速杀要靠 build 强度，不是人人 8 秒）',
    ladder.naked.secs > 8 && ladder.mid.secs > 8 && ladder.near.secs > 8,
    ladderSecs.slice(0, 3).map(v => v.toFixed(1)).join(' / '));
  ok('数值堆满的 build 才能真正速杀（8 秒以内）',
    ladder.monster.secs < 8, ladder.monster.secs.toFixed(1) + 's');
  ok('抬升上限被顶到时就停在血表 ×1.5，不会无限膨胀',
    ladder.monster.hp === Math.round(ladder.monster.tableHp * 1.5) &&
    ladder.over.hp === ladder.over.tableHp,
    ladder.monster.hp + ' / ' + Math.round(ladder.monster.tableHp * 1.5));

  // bossHp 旋钮：只有血表本身落在窗口内时才看得出来（窗口支配时被吃掉）
  const bossHpKnob = await page.evaluate(() => {
    const probe = (k) => {
      setDifficulty(k);
      const s = { p: G.player, num: G.floorNum, hard: G.floor ? G.floor.hard : false };
      G.floorNum = 9; if (G.floor) G.floor.hard = false;
      const pl = makePlayer(); pl.damage = 26; pl.fireDelay = 0.12; pl.multishot = 3;
      G.player = pl;
      const b = makeBoss(BOSS_DEFS[8], W / 2, H / 2);
      G.player = s.p; G.floorNum = s.num; if (G.floor) G.floor.hard = s.hard;
      return { hp: b.maxHpRef, table: b.def.hp, inWindow: b.hpWindow && b.maxHpRef === b.hpWindow.hi };
    };
    const out = { easy: probe('easy'), normal: probe('normal'), hard: probe('hard') };
    setDifficulty('normal');
    startRun();
    return out;
  });
  ok('强 build 第 9 层：血表落在窗口内时 bossHp 旋钮生效（标准 = 血表值）',
    bossHpKnob.normal.hp === bossHpKnob.normal.table, JSON.stringify(bossHpKnob.normal));
  near('硬核第 9 层 Boss 血量 = 血表 × 1.20', bossHpKnob.hard.hp / bossHpKnob.normal.hp, 1.2, 0.01);
  near('轻松第 9 层 Boss 血量 = 血表 × 0.85', bossHpKnob.easy.hp / bossHpKnob.normal.hp, 0.85, 0.01);

  // 第 1 层教学 Boss：标准 / 硬核仍是 300。轻松档另有一条开局血量旋钮——原来的
  // 规矩是「三档同血」，但那意味着零道具的裸装 dodo（8.3 DPS）要在 Gluttono 面前
  // 硬射 36 秒，这一场成了全程手感最差的仗。
  const tutorial = await page.evaluate(() => {
    const s = { num: G.floorNum, p: G.player, hard: G.floor ? G.floor.hard : false };
    G.floorNum = 1; if (G.floor) G.floor.hard = false;
    const out = { hp: {}, win: {} };
    G.player = makePlayer('dodo');
    out.dps = estimatePlayerDPS(G.player);
    for (const k of DIFF_ORDER) {
      setDifficulty(k);
      const b = makeBoss(BOSS_DEFS[0], W / 2, H / 2);
      out.hp[k] = b.maxHpRef;
      out.win[k] = b.hpWindow;                    // 教学战三档都不进窗口
      out[k === 'easy' ? 'easySecs' : k + 'Secs'] = b.maxHpRef / out.dps;
    }
    // 循环结束时 DIFF_KEY 停在 hard，所以直接取轻松档的旋钮值（0.65）与实测血量对账
    out.openingBoss = DIFFICULTY_PRESETS.easy.openingBoss;
    out.want = Math.round(BOSS_DEFS[0].hp * DIFFICULTY_PRESETS.easy.openingBoss);
    setDifficulty('normal');
    G.floorNum = s.num; G.player = s.p; if (G.floor) G.floor.hard = s.hard;
    startRun();
    return out;
  });
  ok('第 1 层教学 Boss：标准 / 硬核仍是 300 血',
    tutorial.hp.normal === 300 && tutorial.hp.hard === 300, JSON.stringify(tutorial.hp));
  ok('第 1 层轻松档血量 = 血表 × 开局旋钮（300 × 0.65 = 195）',
    tutorial.hp.easy === tutorial.want && tutorial.hp.easy === 195,
    tutorial.hp.easy + ' vs ' + tutorial.want);
  ok('第 1 层教学战三档都不进血量窗口（弱 build 不被抬、强 build 不被压）',
    tutorial.win.easy === null && tutorial.win.normal === null && tutorial.win.hard === null);
  ok('轻松档把第一个 Boss 从 36 秒压到 24 秒以内（裸装 dodo 站桩输出）',
    tutorial.normalSecs >= 35 && tutorial.easySecs <= 24,
    tutorial.easySecs.toFixed(1) + 's vs ' + tutorial.normalSecs.toFixed(1) + 's');

  // 怒气角色的血量窗口必须按暴走上限算，不能随进房怒气浮动
  const rageCeil = await page.evaluate(() => {
    const s = { p: G.player, num: G.floorNum, hard: G.floor ? G.floor.hard : false };
    G.floorNum = 6; if (G.floor) G.floor.hard = false;
    const mk = (charId, rage) => {
      const p = makePlayer(charId); p.damage = 9; p.fireDelay = 0.28; p.rageMeter = rage;
      return p;
    };
    const dpsOf = (p) => { G.player = p; return estimatePlayerDPS(p); };
    const out = {
      plain: dpsOf(mk('dodo', 0)),
      rageEmpty: dpsOf(mk('rage', 0)),
      rageHalf: dpsOf(mk('rage', 0.5)),
      rageFull: dpsOf(mk('rage', 1)),
    };
    G.player = s.p; G.floorNum = s.num; if (G.floor) G.floor.hard = s.hard;
    startRun();
    return out;
  });
  near('怒气角色的血量窗口按暴走上限放大 5 倍（2.5 / 0.5）', rageCeil.rageEmpty / rageCeil.plain, 5, 0.01);
  ok('怒气窗口不随进房怒气浮动（0 怒 = 半怒 = 满怒）',
    Math.abs(rageCeil.rageEmpty - rageCeil.rageHalf) < 1e-6 &&
    Math.abs(rageCeil.rageHalf - rageCeil.rageFull) < 1e-6,
    [rageCeil.rageEmpty, rageCeil.rageHalf, rageCeil.rageFull].map(v => v.toFixed(1)).join(' / '));

  // ------------------------------------------------------- 道具三档分层抽选
  const tiers = await page.evaluate(() => {
    const known = {};
    ITEM_DEFS.forEach(d => { known[d.id] = true; });
    const out = {
      total: ITEM_DEFS.length,
      badKeys: Object.keys(ITEM_TIERS).filter(k => !known[k]),
      counts: [0, 0, 0],
      weights: [tierWeights(1), tierWeights(5), tierWeights(12)],
    };
    ITEM_DEFS.forEach(d => { out.counts[itemTier(d.id)]++; });
    // real pool draw at floor 1 vs floor 12 (the tier mix must shift upward)
    const sample = (depth, n) => {
      const savedNum = G.floorNum;
      const c = [0, 0, 0];
      G.floorNum = depth;
      for (let i = 0; i < n; i++) {
        const d = withRng(7000 + i, () => randomItemDef([], 'treasure'));
        c[itemTier(d.id)]++;
      }
      G.floorNum = savedNum;
      return c;
    };
    out.early = sample(1, 1500);
    out.late = sample(12, 1500);
    startRun();
    return out;
  });
  ok('分层表里的 id 全部真实存在', tiers.badKeys.length === 0, tiers.badKeys.join(','));
  ok('92 件被动按 30 / 43 / 19 分层', tiers.counts.join('/') === '30/43/19', tiers.counts.join('/'));
  ok('三档权重为 [6,3,1] / [3,5,2] / [1,4,5]',
    JSON.stringify(tiers.weights) === JSON.stringify([[6, 3, 1], [3, 5, 2], [1, 4, 5]]),
    JSON.stringify(tiers.weights));
  const earlyT2 = tiers.early[2] / 1500, lateT2 = tiers.late[2] / 1500;
  const earlyT0 = tiers.early[0] / 1500, lateT0 = tiers.late[0] / 1500;
  ok('开局少出强力道具（1 层 tier2 占比 < 12%）', earlyT2 < 0.12, (earlyT2 * 100).toFixed(1) + '%');
  ok('深层少出朴素道具（12 层 tier2 占比 > 25% 且高于 tier0）',
    lateT2 > 0.25 && lateT2 > lateT0, (lateT2 * 100).toFixed(1) + '%');
  ok('分层让开局与深层的道具质量明显分开（tier2 占比至少翻倍）',
    lateT2 > earlyT2 * 2, (earlyT2 * 100).toFixed(1) + '% -> ' + (lateT2 * 100).toFixed(1) + '%');

  // ---------------------------------------------------------- 选择入口与持久化
  const entry = await page.evaluate(() => {
    const r = MENU_DIFF_RECT;
    setDifficulty('normal');
    const out = {
      hitInside: menuDiffHit(r.x + r.w / 2, r.y + r.h / 2),
      hitOutside: menuDiffHit(10, 10),
    };
    // the guard: switching mid-run must be refused
    G.state = 'play';
    cycleDifficulty(1);
    out.blockedInPlay = DIFF_KEY === 'normal';
    G.state = 'menu';
    cycleDifficulty(1);
    out.upFromNormal = DIFF_KEY;
    cycleDifficulty(1);
    out.upFromHard = DIFF_KEY;            // wraps back to the easiest
    const raw = JSON.parse(localStorage.getItem(META_KEY) || '{}');
    out.saved = raw.diff;
    setDifficulty('normal'); META.diff = 'normal'; metaSave();
    startRun();
    return out;
  });
  ok('标题界面难度标签可点击', entry.hitInside && !entry.hitOutside);
  ok('对局中拒绝改难度（只在标题界面生效）', entry.blockedInPlay);
  ok('↑ 从标准切到硬核', entry.upFromNormal === 'hard');
  ok('在硬核继续 ↑ 绕回轻松（三档循环）', entry.upFromHard === 'easy');
  ok('难度选择写入存档并在重载后恢复', entry.saved === 'easy', String(entry.saved));

  // ------------------------------------ 暂停面板 / 结算纸条上的难度显示
  const labels = await page.evaluate(() => {
    startRun();
    ctx.save();
    ctx.font = 'bold 15px ' + UI_SANS;
    let widestFloor = 0, worst = '';
    const curses = ['', ...Object.keys(FLOOR_CURSES).map(k => '　·　' + FLOOR_CURSES[k].name)];
    for (const name of FLOOR_NAMES) {
      for (const c of curses) {
        const s = name + '　第 12 / 12 层' + c;   // 最长组合
        const w = ctx.measureText(s).width;
        if (w > widestFloor) { widestFloor = w; worst = s; }
      }
    }
    ctx.font = '13px ' + UI_SANS;
    let widestDiff = 0;
    for (const k of DIFF_ORDER) {
      setDifficulty(k);
      widestDiff = Math.max(widestDiff, ctx.measureText('难度 ' + diffDef().label).width);
    }
    setDifficulty('normal');
    ctx.font = 'bold 16px ' + CRAYON_FONT;
    const paper = ctx.measureText('难度 · ' + DIFFICULTY_PRESETS.normal.label).width;
    ctx.restore();
    return { widestFloor, worst, widestDiff, paper, panelInner: 380, paperW: 440 };
  });
  ok('暂停面板：楼层行（含最长诅咒名）放得进 380px 内宽',
    labels.widestFloor < labels.panelInner,
    labels.widestFloor.toFixed(0) + 'px  ' + labels.worst);
  ok('暂停面板：难度单独一行，远离内宽上限',
    labels.widestDiff < labels.panelInner, labels.widestDiff.toFixed(0) + 'px');
  ok('结算纸条：难度那行放在 440px 宽的纸里',
    labels.paper < labels.paperW, labels.paper.toFixed(0) + 'px');

  // 真·渲染验证：拦住 canvas 的 fillText / drawCrayonText，看这两处到底画了什么字
  // （比「某块区域有亮像素」硬得多——排版挪了位置也不会漏掉）
  const drawn = await page.evaluate(() => {
    const seen = { fill: [], crayon: [] };
    const origFill = ctx.fillText.bind(ctx);
    ctx.fillText = (s, ...rest) => { seen.fill.push(String(s)); return origFill(s, ...rest); };
    const origCrayon = window.drawCrayonText;
    window.drawCrayonText = (g, text, ...rest) => {
      seen.crayon.push(String(text));
      return origCrayon(g, text, ...rest);
    };
    const out = {};
    G.state = 'play'; G.paused = true; G.pauseAnim = 1;   // 拉满，跳过淡入
    renderPause();
    out.pauseLine = seen.fill.find(s => s.indexOf('难度 ') === 0) || null;
    G.state = 'dead'; seen.crayon.length = 0;
    renderDeath();
    out.deadLine = seen.crayon.find(s => s.indexOf('难度 ') === 0) || null;
    G.state = 'win'; G.dumateWin = false; seen.crayon.length = 0;
    renderWin();
    out.winLine = seen.crayon.find(s => s.indexOf('难度 ') === 0) || null;
    delete ctx.fillText;                     // 撤掉影子属性，恢复原型上的真身
    window.drawCrayonText = origCrayon;
    G.state = 'play'; G.paused = false;
    startRun();
    return out;
  });
  ok('暂停面板确实画出本局难度', drawn.pauseLine === '难度 标准', String(drawn.pauseLine));
  ok('死亡纸条确实画出本局难度', drawn.deadLine === '难度 · 标准', String(drawn.deadLine));
  ok('通关纸条确实画出本局难度', drawn.winLine === '难度 · 标准', String(drawn.winLine));

  const restored = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem(META_KEY) || '{}');
    return { key: DIFF_KEY, saved: raw.diff };
  });
  ok('测试收尾：难度复位为标准', restored.key === 'normal' && restored.saved === 'normal');
};
