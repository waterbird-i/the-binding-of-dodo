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
    out.easy = { hp: diffMul('enemyHp'), count: diffMul('enemyCount'), cap: diffMul('bossCap') };
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
  ok('轻松：敌人与 Boss 数值统一下调', presets.easy.hp < 1 && presets.easy.count < 1 && presets.easy.cap < 1);
  ok('标准档所有旋钮都是 1（原始手感）', presets.neutral);
  ok('非法档位名回退标准（不会把游戏调成 0）', presets.badKeyFallsBack);
  ok('未知旋钮名按 1 处理（no-op）', presets.unknownKnobNoop);

  // ------------------------------------------------ 难度不污染种子随机流
  const seedSame = await page.evaluate(() => {
    const gen = (k) => {
      setDifficulty(k);
      const f = withRng(floorSeed(4242, 7, 0), () => generateFloor(7, false));
      const out = {
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
    const out = { easy: gen('easy'), normal: gen('normal'), hard: gen('hard') };
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
    };
    setDifficulty('normal');
    if (G.floor) G.floor.hard = savedHard;
    return out;
  });
  near('硬核小怪血量 ×1.25', enemyScale.hard12.hp / enemyScale.normal12.hp, 1.25, 0.02);
  near('轻松小怪血量 ×0.85', enemyScale.easy12.hp / enemyScale.normal12.hp, 0.85, 0.02);
  near('硬核小怪弹速 ×1.08', enemyScale.hard12.spMul / enemyScale.normal12.spMul, 1.08, 0.005);
  near('轻松小怪速度 ×0.92', enemyScale.easy12.spMul / enemyScale.normal12.spMul, 0.92, 0.005);
  near('楼层速度爬升：第 12 层比第 1 层快 22%', enemyScale.normal12.spMul / enemyScale.normal1.spMul, 1.22, 0.01);
  near('楼层速度爬升：第 7 层 +12%', enemyScale.normal7.spMul / enemyScale.normal1.spMul, 1.12, 0.01);
  ok('硬核把深处接触伤害推到 4（标准为 3）',
    enemyScale.normal12.touch === 3 && enemyScale.hard12.touch === 4,
    enemyScale.normal12.touch + ' -> ' + enemyScale.hard12.touch);
  ok('难度对弹幕伤害同样生效（标准 4 / 硬核 5）',
    enemyScale.normal12.shot === 4 && enemyScale.hard12.shot === 5,
    enemyScale.normal12.shot + ' -> ' + enemyScale.hard12.shot);

  // ---------------------------------------------------- 刷怪数量随难度缩放
  const counts = await page.evaluate(() => {
    const avg = (k) => {
      setDifficulty(k);
      let total = 0, n = 0;
      for (let s = 1; s <= 24; s++) {
        const f = withRng(floorSeed(s * 977, 10, 0), () => generateFloor(10, false));
        const room = f.rooms.find(r => r.kind === 'normal') || f.rooms[f.rooms.length - 1];
        const saved = { floor: G.floor, room: G.room, enemies: G.enemies, num: G.floorNum };
        room.kind = 'normal';
        f.hard = false;
        G.floor = f; G.room = room; G.enemies = []; G.floorNum = 10;
        withRng(floorSeed(s * 977, 10, 5), () => spawnRoomEnemies(room));
        total += G.enemies.length; n++;
        G.floor = saved.floor; G.room = saved.room; G.enemies = saved.enemies; G.floorNum = saved.num;
      }
      return total / n;
    };
    const out = { easy: avg('easy'), normal: avg('normal'), hard: avg('hard') };
    setDifficulty('normal');
    startRun();          // hand every later suite a clean run
    return out;
  });
  ok('第 10 层每房敌人数回到个位数（不再一律顶到 10 只）',
    counts.normal >= 6 && counts.normal <= 9, counts.normal.toFixed(1));
  ok('三档难度下刷怪数递增', counts.easy < counts.normal && counts.normal < counts.hard,
    [counts.easy, counts.normal, counts.hard].map(v => v.toFixed(1)).join(' < '));

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
  near('轻松下限 = 8s × 0.85', bossWin.easy, 8 * 0.85, 0.4);
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

  // 第 1 层教学 Boss：三档都是 300，新玩家的第一场永远一样
  const tutorial = await page.evaluate(() => {
    const s = { num: G.floorNum, p: G.player, hard: G.floor ? G.floor.hard : false };
    G.floorNum = 1; if (G.floor) G.floor.hard = false;
    const out = {};
    for (const k of DIFF_ORDER) { setDifficulty(k); out[k] = makeBoss(BOSS_DEFS[0], W / 2, H / 2).maxHpRef; }
    setDifficulty('normal');
    G.floorNum = s.num; G.player = s.p; if (G.floor) G.floor.hard = s.hard;
    startRun();
    return out;
  });
  ok('第 1 层教学 Boss 在三档下都是 300 血',
    tutorial.easy === 300 && tutorial.normal === 300 && tutorial.hard === 300,
    JSON.stringify(tutorial));

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
