'use strict';
const { section, ok, eq, frames, press } = require('../helpers.cjs');

// dumate：隐藏终极 Boss。定义健全性 → 招式模拟 → 触发条件 → 抉择两条分支
// → 实战与讨伐结算，最后清掉测试写入的 meta，别污染后续手动游玩。
module.exports = async ({ page, context, consoleErrors }) => {
  section('dumate 定义与招式');
  const def = await page.evaluate(() => {
    const floorAtks = new Set(BOSS_DEFS.flatMap(b => b.attacks));
    return {
      exists: typeof DUMATE_DEF === 'object' && DUMATE_DEF.id === 'dumate',
      hidden: !BOSS_DEFS.includes(DUMATE_DEF),           // 不占楼层序列
      impl: DUMATE_DEF.attacks.every(a => typeof BOSS_ATTACKS[a] === 'function'),
      form: typeof BOSS_FORMS[DUMATE_DEF.form] === 'function',
      exclusive: DUMATE_DEF.attacks.every(a => !floorAtks.has(a)),   // 招式全局唯一
      count: DUMATE_DEF.attacks.length,
      touch: DUMATE_DEF.touchDamage,
    };
  });
  ok('DUMATE_DEF 存在且 id 正确', def.exists);
  ok('不进 BOSS_DEFS（隐藏，不占楼层）', def.hidden);
  ok('六个专属招式全部有实现', def.impl && def.count === 6, JSON.stringify(def));
  ok('形态绘制函数存在', def.form);
  ok('招式与 13 个常规 Boss 零重叠', def.exclusive);
  ok('接触伤害高于 MEGA dodo', def.touch > 4, 'touch=' + def.touch);

  const sim = await page.evaluate(() => {
    if (G.state !== 'play') startRun();
    const errs = [];
    const saved = { enemies: G.enemies, eshots: G.eshots, beams: G.beams, lasers: G.lasers,
      px: G.player.x, py: G.player.y, inv: G.player.invuln };
    let sawShots = 0, sawSideCasts = 0;
    for (const atk of DUMATE_DEF.attacks) {
      G.enemies = []; G.eshots = []; G.beams = []; G.lasers = [];
      const e = makeBoss(DUMATE_DEF, W / 2, H / 2);
      e.spawnT = 0;
      G.enemies.push(e);
      try {
        for (let i = 0; i < 420; i++) {
          e.hp = i > 200 ? e.maxHpRef * 0.3 : e.maxHpRef;   // 后半段强制狂暴
          if (e.state === 'idle') { e.atk = atk; e.state = 'atk'; e.phase = 0; e.t = 0; e.data = {}; startSideCasts(e); }
          e.anim += 1 / 60;
          G.player.invuln = 9999;
          updateBossAI(G, e, 1 / 60);
          updateEnemyShots(G, 1 / 60);
          updateBeams(G, 1 / 60);
          updateLasers(G, 1 / 60);
          drawBossByDef(ctx, e);
          for (const l of G.lasers) drawLaser(ctx, l);
          if (G.eshots.length > 0) sawShots++;
          if (e.casts && e.casts.length > sawSideCasts) sawSideCasts = e.casts.length;
          if (!isFinite(e.x) || !isFinite(e.y) || !isFinite(e.z)) throw new Error('non-finite position');
          if (!isFinite(G.player.x) || !isFinite(G.player.y)) throw new Error('non-finite player');
          if (e.x < FLOOR_X - 40 || e.x > FLOOR_X + FLOOR_W + 40) throw new Error('left the room: x=' + e.x);
        }
      } catch (err) { errs.push(atk + ': ' + err.message); }
    }
    G.enemies = saved.enemies; G.eshots = saved.eshots; G.beams = saved.beams; G.lasers = saved.lasers;
    G.player.x = saved.px; G.player.y = saved.py; G.player.invuln = saved.inv;
    G.player.hp = G.player.maxHp;
    return { errs, sawShots: sawShots > 0, sawSideCasts };
  });
  ok('六招 × 420 帧模拟无异常', sim.errs.length === 0, sim.errs.join(' | '));
  ok('模拟期间打出过弹幕', sim.sawShots);
  ok('dumate 会同时施放主 + 2 副技能以上', sim.sawSideCasts >= 2, 'sides=' + sim.sawSideCasts);

  section('dumate 触发条件');
  const trigger = await page.evaluate(() => {
    const out = {};
    const savedWins = Object.assign({}, META.charWins);
    // 情形一：还有角色没通关 → 击杀 MEGA dodo 直接通关，不弹抉择
    META.charWins = {};
    startRun();
    G.floorNum = FLOOR_COUNT;
    const mega1 = makeBoss(FINAL_BOSS_DEF, W / 2, H / 2);
    onBossKilled(G, mega1);
    out.noOfferState = G.state;
    out.charRecorded = META.charWins[G.player.charId] === true;
    // 情形二：全角色都通关过 → 弹出终极抉择
    for (const c of CHAR_DEFS) META.charWins[c.id] = true;
    startRun();
    G.floorNum = FLOOR_COUNT;
    const mega2 = makeBoss(FINAL_BOSS_DEF, W / 2, H / 2);
    onBossKilled(G, mega2);
    out.offerState = G.state;
    out.offerHp = G.dumateOffer && G.dumateOffer.megaHp === mega2.maxHpRef;
    // 抉择界面能画（弹幕背景 + 两个选项框）
    try { render(); out.offerDraws = true; } catch (e) { out.offerDraws = false; out.err = e.message; }
    // 开场 0.9s 内的确认被吞掉（防 Boss 战连打误触）
    resolveDumateOffer(false);
    out.guardHolds = G.state === 'dumateOffer';
    // 见好就收 → 立即通关
    G.dumateOffer.openedAt -= 2000;
    const snap = G.stats.time;
    resolveDumateOffer(false);
    out.declineWin = G.state === 'win' && G.dumateWin === false && G.stats.time === snap;
    out.savedWins = savedWins;   // 清理放在最后一段做
    return out;
  });
  eq('未集齐角色时不弹抉择、直接通关', trigger.noOfferState, 'win');
  ok('击杀 MEGA dodo 记入该角色通关', trigger.charRecorded);
  eq('全角色通关后弹出终极抉择', trigger.offerState, 'dumateOffer');
  ok('抉择记录了本局 MEGA dodo 实战血量', trigger.offerHp);
  ok('抉择界面可渲染', trigger.offerDraws, trigger.err);
  ok('开场 0.9s 误触保护生效', trigger.guardHolds);
  ok('见好就收 → 按击杀时成绩立即通关', trigger.declineWin);

  section('dumate 图鉴保密');
  const codex = await page.evaluate(() => {
    const texts = [];
    const origFill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t) {
      texts.push(String(t));
      return origFill.apply(this, arguments);
    };
    try {
      const savedWins = META.totals.wins;
      const savedUnlocked = !!META.unlocked.boss_dumate;
      // 从未通关：解锁条件以 ??? 保密，不泄露「每位 dodo / MEGA dodo」的要求
      META.totals.wins = 0;
      delete META.unlocked.boss_dumate;
      texts.length = 0;
      renderUnlockPanel();
      const virgin = { q: texts.some(t => t.includes('???')),
        leak: texts.some(t => t.includes('让每一位 dodo')) };
      // 通关过一次：条件如实展示
      META.totals.wins = 1;
      texts.length = 0;
      renderUnlockPanel();
      const revealed = texts.some(t => t.includes('让每一位 dodo'));
      META.totals.wins = savedWins;
      if (savedUnlocked) META.unlocked.boss_dumate = true; else delete META.unlocked.boss_dumate;
      return { virgin, revealed };
    } finally {
      CanvasRenderingContext2D.prototype.fillText = origFill;
    }
  });
  ok('从未通关时 dumate 解锁条件显示 ??? 且不泄露原文', codex.virgin.q && !codex.virgin.leak, JSON.stringify(codex.virgin));
  ok('至少通关一次后解锁条件如实展示', codex.revealed);

  section('dumate 实战与讨伐');
  const fight = await page.evaluate(() => {
    const out = {};
    startRun();
    G.floorNum = FLOOR_COUNT;
    const mega = makeBoss(FINAL_BOSS_DEF, W / 2, H / 2);
    onBossKilled(G, mega);
    out.reOffer = G.state === 'dumateOffer';   // 条件保持满足，再来一局照样弹
    G.dumateOffer.openedAt -= 2000;   // 绕过 0.9s 误触保护
    resolveDumateOffer(true);
    // accept 会按「now - openedAt」补偿思考时长，上面的 hack 让补偿虚增了
    // 2s、把 startTime 推到未来；这里还原，否则击杀时刻的用时会算成负数
    G.stats.startTime -= 2000;
    const d = G.enemies.find(e => e.isBoss);
    out.spawned = !!d && d.def.dumate === true && d.name === 'dumate';
    out.hp20x = !!d && d.maxHpRef === Math.round(mega.maxHpRef * 20);
    out.playing = G.state === 'play';
    out.supplies = G.room.pickups.filter(pk => pk.kind === 'soulheart').length >= 2;
    return out;
  });
  ok('条件满足时每次击杀 MEGA dodo 都会再弹抉择', fight.reOffer);
  ok('应战后 dumate 登场', fight.spawned);
  ok('血量恰为本局 MEGA dodo 的 20 倍', fight.hp20x);
  ok('应战后回到战斗状态', fight.playing);
  ok('决战前有魂心补给', fight.supplies);

  // 真实跑几十帧：dumate 得动、得打出东西，玩家开无敌顶住
  await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    for (let i = 0; i < 100; i++) {
      G.player.maxHp = 24; G.player.hp = 24; G.player.invuln = 5;
      await frame();
    }
  });
  const mid = await page.evaluate(() => ({
    alive: !!G.enemies.find(e => e.isBoss && e.def.dumate && !e.dead),
    acted: G.eshots.length + G.lasers.length + G.stats.kills,
    state: G.state,
  }));
  ok('实战 100 帧后 dumate 仍在输出', mid.alive && mid.state === 'play', JSON.stringify(mid));

  const slain = await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    const d = G.enemies.find(e => e.isBoss && e.def.dumate);
    const winsBefore = META.totals.wins;
    const deathsBefore = META.totals.deaths;
    // 截获排行榜提交参数（本地无 SDK，原函数是空转，包一层不影响流程）
    const calls = [];
    const origSubmit = lbSubmitWin;
    window.lbSubmitWin = function (t, du) { calls.push([t, du || 0]); return origSubmit.apply(this, arguments); };
    G.player.invuln = 9999;
    damageEnemy(G, d, 1e9, 0, -1);
    // 血条清零：不直接结算，而是进入斩杀演出，本体从战场上消失
    const execStarted = G.state === 'dumateExec';
    const bodyGone = !G.enemies.some(e => e.isBoss);
    let execDraws = true;
    try { render(); } catch (e) { execDraws = false; }
    let i = 0;
    while (G.state === 'dumateExec' && i++ < 600) { G.player.invuln = 9999; await frame(); }
    window.lbSubmitWin = origSubmit;
    return {
      execStarted, bodyGone, execDraws,
      state: G.state, dumateWin: G.dumateWin,
      unlocked: !!META.unlocked.boss_dumate,
      winCounted: META.totals.wins === winsBefore + 1,
      noDeathCounted: META.totals.deaths === deathsBefore,
      lb: calls[0] || null,
      preTime: G.dumatePreTime,
      total: G.stats.time,
    };
  });
  ok('血条清零后进入斩杀演出，dumate 没有死透', slain.execStarted && slain.bodyGone);
  ok('斩杀演出可渲染', slain.execDraws);
  eq('演出结束后按通关结算', slain.state, 'win');
  ok('结算界面带 dumate 荣光标记', slain.dumateWin === true);
  ok('图鉴解锁「dumate」条目', slain.unlocked);
  ok('计胜场不计死亡', slain.winCounted && slain.noDeathCounted);
  ok('排行榜提交拆为 击杀 MEGA 用时 + 讨伐 dumate 用时',
    !!slain.lb && Math.abs(slain.lb[0] - slain.preTime) < 0.05
    && slain.lb[1] > 0 && Math.abs(slain.preTime + slain.lb[1] - slain.total) < 0.05,
    JSON.stringify({ lb: slain.lb, pre: slain.preTime, total: slain.total }));

  // 结算纸走死亡样式（标题「你死了」），账却按通关记
  const paper = await page.evaluate(() => {
    const texts = [];
    const orig = drawCrayonText;
    window.drawCrayonText = function (g, txt) { texts.push(String(txt)); return orig.apply(this, arguments); };
    try { render(); } finally { window.drawCrayonText = orig; }
    return { died: texts.some(tx => tx === '你死了'),
      legend: texts.some(tx => tx.includes('没能走出地牢')) };
  });
  ok('结算纸是死亡样式，附讨伐注脚', paper.died && paper.legend, JSON.stringify(paper));

  // 榜面样式：讨伐过 dumate 的记录显示为 主用时+(讨伐用时)
  const lbRow = await page.evaluate(() => {
    const saved = { sdk: LB.sdkPresent, av: LB.available, rows: LB.rows };
    LB.sdkPresent = true; LB.available = true;
    LB.rows = [{ player: '测试', timeMs: 61000, dumateMs: 30500 }];
    const texts = [];
    const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t) { texts.push(String(t)); return orig.apply(this, arguments); };
    try { renderLeaderboardPanel(500, 190, 416); } finally {
      CanvasRenderingContext2D.prototype.fillText = orig;
      LB.sdkPresent = saved.sdk; LB.available = saved.av; LB.rows = saved.rows;
    }
    return texts.find(t => t.includes('+(')) || '';
  });
  ok('榜上 dumate 记录显示为 主用时+(讨伐用时)', lbRow === '1:01.0+(0:30.5)', lbRow);

  // 结算纸与图鉴都要画得动
  ok('讨伐结算界面可渲染', await page.evaluate(() => { try { render(); return true; } catch (e) { return false; } }));
  ok('11 条图鉴一屏放得下且可渲染', await page.evaluate(() => {
    try { renderUnlockPanel(); return UNLOCK_DEFS.length === 11; } catch (e) { return false; }
  }));

  // 清理：把测试写进 meta 的痕迹擦掉，交还一个干净的 play 状态
  await page.evaluate(() => {
    META.charWins = {};
    delete META.unlocked.boss_dumate;
    metaSave();
    startRun();
  });
  await frames(page, 3);

  section('dumate 控制台检查');
  ok('全程控制台无报错', consoleErrors.length === 0, consoleErrors.slice(0, 4).join(' | '));
};
