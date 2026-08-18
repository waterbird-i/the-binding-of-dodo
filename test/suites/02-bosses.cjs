'use strict';
const { section, ok, eq, near, frames, state, luma, press, ROOT, INDEX_URL } = require('../helpers.cjs');

module.exports = async ({ page, context, consoleErrors }) => {
  section('12 层结构');
  const floors = await page.evaluate(() => ({
    count: FLOOR_COUNT, names: FLOOR_NAMES.slice(), themes: FLOOR_THEMES.length,
  }));
  eq('FLOOR_COUNT = 12', floors.count, 12);
  eq('12 个楼层名', floors.names.length, 12);
  ok('楼层名互不重复', new Set(floors.names).size === 12, floors.names.join(','));
  eq('12 套配色主题', floors.themes, 12);
  const themeSwitch = await page.evaluate(() => {
    const seen = [];
    for (let d = 1; d <= 12; d++) { applyFloorTheme(d); seen.push(PAL.floor + '/' + PAL.wall); }
    applyFloorTheme(G.floorNum);
    return { seen, uniq: new Set(seen).size };
  });
  ok('12 层至少 8 种视觉章节', themeSwitch.uniq >= 8, 'uniq=' + themeSwitch.uniq);

  // ------------------------------------------------------------ bosses: 13
  section('13 个 Boss');
  const bossInfo = await page.evaluate(() => ({
    total: BOSS_DEFS.length,
    ids: BOSS_DEFS.map(b => b.id),
    names: BOSS_DEFS.map(b => b.name),
    forms: [...new Set(BOSS_DEFS.map(b => b.form))],
    moves: [...new Set(BOSS_DEFS.map(b => b.move))],
    attacks: [...new Set(BOSS_DEFS.flatMap(b => b.attacks))],
    attackSlots: BOSS_DEFS.reduce((s, b) => s + b.attacks.length, 0),
    perFloor: Array.from({ length: 12 }, (_, i) => bossDefForFloor(i + 1).id),
    final: FINAL_BOSS_DEF.id,
    known: BOSS_DEFS.every(b => b.attacks.every(a => typeof BOSS_ATTACKS[a] === 'function')),
    forms_ok: BOSS_DEFS.every(b => typeof BOSS_FORMS[b.form] === 'function'),
  }));
  eq('13 个 Boss 定义', bossInfo.total, 13);
  ok('Boss 名字互不重复', new Set(bossInfo.names).size === 13);
  eq('每层各一个 Boss（12 层）', new Set(bossInfo.perFloor).size, 12);
  eq('第 13 个是最终 Boss', bossInfo.final, bossInfo.ids[12]);
  ok('每个 Boss 的攻击都有实现', bossInfo.known);
  ok('每个 Boss 的形态都有绘制函数', bossInfo.forms_ok);
  ok('形态数 >= 9 种', bossInfo.forms.length >= 9, bossInfo.forms.join(','));
  ok('攻击行为 >= 30 种', bossInfo.attacks.length >= 30, bossInfo.attacks.join(','));
  ok('招式全 Boss 专属互不重复', bossInfo.attacks.length === bossInfo.attackSlots,
    'uniq=' + bossInfo.attacks.length + ' slots=' + bossInfo.attackSlots);

  // run every attack of every boss through a few hundred simulated frames
  const bossSim = await page.evaluate(() => {
    const errs = [];
    const savedEnemies = G.enemies, savedShots = G.eshots, savedBeams = G.beams, savedLasers = G.lasers;
    const savedInv = G.player.invuln;
    G.player.invuln = 9999;   // homing shots / sweeping lasers must not kill the tester
    for (const def of BOSS_DEFS) {
      for (const atk of def.attacks) {
        G.enemies = []; G.eshots = []; G.beams = []; G.lasers = [];
        const e = makeBoss(def, W / 2, H / 2);
        e.spawnT = 0;   // skip the materialize window, we're testing attacks
        G.enemies.push(e);
        try {
          for (let i = 0; i < 420; i++) {
            e.hp = i > 200 ? e.maxHpRef * 0.3 : e.maxHpRef;   // force rage half-way
            if (e.state === 'idle') { e.atk = atk; e.state = 'atk'; e.phase = 0; e.t = 0; e.data = {}; }
            e.anim += 1 / 60;
            G.player.invuln = 9999;
            updateBossAI(G, e, 1 / 60);
            updateEnemyShots(G, 1 / 60);
            updateBeams(G, 1 / 60);
            updateLasers(G, 1 / 60);
            drawBossByDef(ctx, e);
            for (const l of G.lasers) drawLaser(ctx, l);
            if (!isFinite(e.x) || !isFinite(e.y) || !isFinite(e.z)) throw new Error('non-finite position');
            if (e.x < FLOOR_X - 40 || e.x > FLOOR_X + FLOOR_W + 40) throw new Error('left the room: x=' + e.x);
          }
        } catch (err) {
          errs.push(def.id + '/' + atk + ': ' + err.message);
        }
      }
    }
    G.enemies = savedEnemies; G.eshots = savedShots; G.beams = savedBeams; G.lasers = savedLasers;
    G.player.invuln = savedInv;
    G.player.hp = G.player.maxHp;
    return errs;
  });
  ok('所有 Boss × 攻击组合模拟 420 帧无异常', bossSim.length === 0, bossSim.join(' | '));
  const bossCurve = await page.evaluate(() => ({
    first: BOSS_DEFS[0].hp, last: BOSS_DEFS[11].hp, final: BOSS_DEFS[12].hp,
    ratios: BOSS_DEFS.slice(1, 12).map((b, i) => b.hp / BOSS_DEFS[i].hp),
    lateTouch: BOSS_DEFS.slice(8, 12).every(b => b.touchDamage >= 4),
    sweepUsers: BOSS_DEFS.filter(b => b.attacks.includes('sweepLasers')).length,
  }));
  ok('Boss 血量指数级增长（每层 ×1.25+，12 层 >= 10 倍）',
    bossCurve.ratios.every(r => r >= 1.25) && bossCurve.last / bossCurve.first >= 10,
    bossCurve.first + ' -> ' + bossCurve.last);
  ok('最终 Boss 血量最高', bossCurve.final > bossCurve.last, bossCurve.final);
  ok('后期 Boss 接触伤害 >= 2 心', bossCurve.lateTouch);
  ok('全屏发散持续激光收归单一 Boss 专属', bossCurve.sweepUsers === 1, 'sweepUsers=' + bossCurve.sweepUsers);

  // --------------------------------- final boss: multi-cast + full-screen nuke
  const finalBuff = await page.evaluate(() => {
    const out = {};
    const saved = { enemies: G.enemies, eshots: G.eshots, lasers: G.lasers, inv: G.player.invuln };
    G.enemies = []; G.eshots = []; G.lasers = [];
    const e = makeBoss(FINAL_BOSS_DEF, W / 2, H / 2);
    e.spawnT = 0;
    G.enemies = [e];
    out.hpBase = FINAL_BOSS_DEF.hp >= 40000;
    out.hpFloor = e.maxHpRef >= Math.round(estimatePlayerDPS(G.player) * FINAL_MIN_FIGHT_SECONDS);

    // let the real idle→attack picker run: outside rage it should stack one
    // side cast on the primary, in rage two — and all names distinct
    const observe = (rage, frames) => {
      let best = 0, distinct = true;
      for (let i = 0; i < frames; i++) {
        e.hp = rage ? e.maxHpRef * 0.3 : e.maxHpRef;
        G.player.invuln = 9999;
        updateBossAI(G, e, 1 / 60);
        updateEnemyShots(G, 1 / 60);
        updateLasers(G, 1 / 60);
        drawBossByDef(ctx, e);
        if (e.state === 'atk' && e.atk !== 'apocalypse' && e.casts && e.casts.length > best) {
          best = e.casts.length;
          const names = [e.atk, ...e.casts.map(c => c.atk)];
          distinct = distinct && new Set(names).size === names.length;
        }
      }
      return { best, distinct };
    };
    const calm = observe(false, 1600);
    out.sideCasts = calm.best;
    out.sideDistinct = calm.distinct;
    out.rageSides = observe(true, 1600).best;

    // the apocalypse: strike marks blanket the arena, spare one pocket, and
    // refuse to share the stage with side casts
    G.eshots = [];
    e.state = 'atk'; e.atk = 'apocalypse'; e.phase = 0; e.t = 0; e.data = {};
    e.marks = null;   // drop leftovers from whatever attack observe() interrupted
    e.primaryDone = false; e.hp = e.maxHpRef;
    startSideCasts(e);
    out.apoSolo = e.casts === null;
    for (let i = 0; i < 30 && !(e.marks && e.marks.length); i++) updateBossAI(G, e, 1 / 60);
    const ms = e.marks || [];
    out.apoMarks = ms.length;
    const xs = ms.map(m => m.x), ys = ms.map(m => m.y);
    out.apoWide = ms.length >= 12 &&
      Math.max(...xs) - Math.min(...xs) > FLOOR_W * 0.6 &&
      Math.max(...ys) - Math.min(...ys) > FLOOR_H * 0.6;
    out.apoHole = false;
    for (let sy = FLOOR_Y + 40; sy < FLOOR_Y + FLOOR_H - 20 && !out.apoHole; sy += 24)
      for (let sx = FLOOR_X + 40; sx < FLOOR_X + FLOOR_W - 20; sx += 24)
        if (ms.every(m => dist(sx, sy, m.x, m.y) > m.r + 14)) { out.apoHole = true; break; }
    drawBossByDef(ctx, e);
    for (let i = 0; i < 120 && e.state === 'atk'; i++) {
      G.player.invuln = 9999;
      updateBossAI(G, e, 1 / 60);
    }
    out.apoShots = G.eshots.length;
    out.apoDetonates = out.apoShots >= ms.length * 3;

    // a side-cast beam is anchored to a shadow context — it must still die
    // with the boss
    G.lasers = []; G.eshots = [];
    const ctxCast = Object.assign(Object.create(e), {
      phase: 0, t: 0, data: {}, mark: null, marks: null, aimLine: null, angle: 0, hops: 0,
    });
    e.casts = [{ atk: 'megaBeam', done: false, ctx: ctxCast }];
    BOSS_ATTACKS.megaBeam(G, ctxCast, 1 / 60);
    out.sideLaserSpawned = G.lasers.length === 1;
    const savedTrapdoor = G.room.trapdoor, savedPedCount = G.room.pedestals.length;
    const savedKilled = G.room.bossKilled;
    onBossKilled(G, e);
    out.sideLaserCleared = G.lasers.length === 0;
    G.room.trapdoor = savedTrapdoor;
    G.room.pedestals = G.room.pedestals.slice(0, savedPedCount);
    G.room.bossKilled = savedKilled;

    G.enemies = saved.enemies; G.eshots = saved.eshots; G.lasers = saved.lasers;
    G.player.invuln = saved.inv;
    G.player.hp = G.player.maxHp;
    return out;
  });
  ok('最终 Boss 基础血量 >= 40000', finalBuff.hpBase);
  ok('最终 Boss 血量至少扛住 60s 玩家 DPS', finalBuff.hpFloor);
  ok('最终 Boss 平时主副技能同时施放', finalBuff.sideCasts >= 1 && finalBuff.sideDistinct,
    JSON.stringify(finalBuff));
  ok('狂暴后同时施放 3 个技能（主 + 2 副）', finalBuff.rageSides >= 2, 'rageSides=' + finalBuff.rageSides);
  ok('天启全屏技能铺满全场', finalBuff.apoWide, 'marks=' + finalBuff.apoMarks);
  ok('天启弹幕网里留有一个安全口', finalBuff.apoHole);
  ok('天启技能独占施放（不与副技能叠加）', finalBuff.apoSolo);
  ok('天启预警结束后全场起爆', finalBuff.apoDetonates, 'shots=' + finalBuff.apoShots);
  ok('副技能光束随 Boss 死亡清除', finalBuff.sideLaserSpawned && finalBuff.sideLaserCleared);

  // ------------------------------------------- new balance & presentation rules
  section('蓄力激光 + Boss 30s 下限 + 楼层横幅');
  const newRules = await page.evaluate(async () => {
    const out = {};
    const frame = () => new Promise(r => requestAnimationFrame(r));

    // fresh run so the room/floor state is a known baseline
    startRun();
    out.introAfterStart = !!(G.floorIntro && G.floorIntro.name === FLOOR_NAMES[0] &&
      G.floorIntro.num === 1 && G.floorIntro.t > 0);
    render();                       // banner frame must not throw
    await frame();

    // hold-to-charge: beams only appear after LASER_CHARGE_TIME of holding fire
    G.enemies = []; G.room.cleared = true; G.room.pickups = [];
    G.tears = []; G.beams = [];
    const p = G.player;
    p.x = W / 2; p.y = H / 2;
    p.laser = true; p.fireCd = 0; p.laserCharge = 0;
    fireStack.length = 0; fireStack.push('ArrowRight');
    let firedAt = -1;
    for (let i = 0; i < 60; i++) {
      updatePlay(1 / 60);
      if (G.beams.length > 0) { firedAt = i; break; }
    }
    fireStack.length = 0;
    const needFrames = Math.ceil(LASER_CHARGE_TIME / (1 / 60));
    out.chargeGate = firedAt >= needFrames - 2 && firedAt <= needFrames + 4;
    out.tearsSuppressed = G.tears.length === 0;
    // releasing early bleeds the charge back to zero
    p.laserCharge = LASER_CHARGE_TIME * 0.6;
    for (let i = 0; i < 30; i++) updatePlay(1 / 60);
    out.chargeBleeds = p.laserCharge === 0;

    // boss hp lower bound: a pumped build still faces >= 30s of fighting
    const savedFloorNum = G.floorNum;
    G.floorNum = 6;
    const pumped = makePlayer();
    pumped.damage = 60; pumped.fireDelay = 0.1;
    const savedPlayer = G.player; G.player = pumped;
    const dps = estimatePlayerDPS(pumped);
    const b6 = makeBoss(bossDefForFloor(6), W / 2, H / 2);
    out.minHpHolds = b6.maxHpRef / dps >= 30;
    // floor 1 keeps its tutorial hp even for the same pumped build
    G.floorNum = 1;
    const b1 = makeBoss(bossDefForFloor(1), W / 2, H / 2);
    out.floor1Untouched = b1.maxHpRef === BOSS_DEFS[0].hp;
    G.player = savedPlayer; G.floorNum = savedFloorNum;

    startRun();                     // hand the next sections a clean run
    return out;
  });
  ok('进层横幅：楼层名 + 第几层信息', newRules.introAfterStart);
  ok('激光蓄力满才发射（约 ' + 0.5 + 's）', newRules.chargeGate);
  ok('蓄力期间不再发普通眼泪', newRules.tearsSuppressed);
  ok('提前松手蓄力清零', newRules.chargeBleeds);
  ok('2 层起 Boss 至少扛住 30s 玩家 DPS', newRules.minHpHolds);
  ok('第 1 层 Boss 血量保持教学难度', newRules.floor1Untouched);

  // ------------------------------------ boss hp lower bound: ~30s of player dps
  const bossHpFloor = await page.evaluate(() => {
    const p = G.player;
    const savedFloor = G.floorNum;
    const saved = { damage: p.damage, fireDelay: p.fireDelay, multishot: p.multishot, laser: p.laser, crit: p.crit, familiars: p.familiars, poison: p.poison };
    // a stacked build on floor 2: static hp alone would melt Duodeno
    Object.assign(p, { damage: 60, fireDelay: 0.1, multishot: 4, laser: false, crit: 0, familiars: 0, poison: 0 });
    G.floorNum = 2;
    const strong = makeBoss(BOSS_DEFS[1], W / 2, H / 2);
    const want = Math.round(estimatePlayerDPS(p) * BOSS_MIN_FIGHT_SECONDS);
    // floor 1 keeps the tutorial fight even for the same stacked build
    G.floorNum = 1;
    const tut = makeBoss(BOSS_DEFS[0], W / 2, H / 2);
    G.floorNum = savedFloor;
    Object.assign(p, saved);
    return {
      raised: strong.hp === want && strong.hp > BOSS_DEFS[1].hp,
      barTracks: strong.maxHpRef === strong.hp,
      tutorialUntouched: tut.hp === BOSS_DEFS[0].hp,
      hp: strong.hp, want,
    };
  });
  ok('叠满输出时 Boss 血量抬到 ~30s×dps', bossHpFloor.raised, bossHpFloor.hp + ' vs ' + bossHpFloor.want);
  ok('血条基准跟随抬高后的血量', bossHpFloor.barTracks);
  ok('第 1 层 Boss 不受 30s 下限影响', bossHpFloor.tutorialUntouched);

  // --------------------------------------------- Brimstone hold-to-charge
  const chargeTest = await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    if (G.state !== 'play') startRun();
    G.paused = false;
    const p = G.player;
    const saved = { laser: p.laser };
    const savedEnemies = G.enemies;
    G.enemies = []; G.beams = []; G.tears = [];
    p.laser = true; p.fireCd = 0; p.laserCharge = 0; p.invuln = 9;
    fireStack.length = 0;
    fireStack.push('ArrowRight');
    const out = { earlyBeams: null, fired: false, noTears: true };
    for (let i = 0; i < 120; i++) {
      await frame();
      if (i === 6) out.earlyBeams = G.beams.length;   // ~0.1s in: still charging
      if (G.tears.length > 0) out.noTears = false;
      if (G.beams.length > 0) { out.fired = true; break; }
    }
    // release early: the stored charge bleeds away instead of firing
    fireStack.length = 0;
    G.beams = [];
    p.laserCharge = LASER_CHARGE_TIME * 0.6;
    for (let i = 0; i < 30 && p.laserCharge > 0; i++) await frame();
    out.bleeds = p.laserCharge === 0 && G.beams.length === 0;
    p.laser = saved.laser; p.laserCharge = 0; p.invuln = 0;
    G.enemies = savedEnemies; G.beams = []; G.tears = [];
    return out;
  });
  ok('激光按住蓄力期间不出光束', chargeTest.earlyBeams === 0, 'early=' + chargeTest.earlyBeams);
  ok('蓄力完成后自动发射', chargeTest.fired);
  ok('激光模式下不再吐普通眼泪', chargeTest.noTears);
  ok('提前松手蓄力衰减且不发射', chargeTest.bleeds);

  // --------------------------------------------------- floor intro banner
  const intro = await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    if (G.state !== 'play') startRun();
    G.paused = false;
    const out = {};
    loadFloor();
    out.shown = !!G.floorIntro &&
      G.floorIntro.name === FLOOR_NAMES[G.floorNum - 1] &&
      G.floorIntro.num === G.floorNum;
    try { renderFloorIntro(); out.draws = true; } catch (e) { out.draws = false; out.err = e.message; }
    G.floorIntro.t = 0.05;
    for (let i = 0; i < 10 && G.floorIntro; i++) await frame();
    out.expires = G.floorIntro === null;
    return out;
  });
  ok('进层显示地名 + 第几层/共几层', intro.shown);
  ok('楼层横幅可渲染', intro.draws, intro.err);
  ok('横幅短暂展示后消失', intro.expires);

  // ------------------------------------------------------------- items: 89
};
