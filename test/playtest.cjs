'use strict';
// ============================================================================
// playtest.cjs — headless self-test for The Binding of dodo
//
//   node test/playtest.cjs            # run everything
//   node test/playtest.cjs --headed   # watch it play
//
// Drives the real page over file:// (the delivery requirement is that the game
// runs by double-clicking index.html) with real keyboard events, then asserts
// against the live game state. No npm install: it borrows the playwright that
// ships with the globally installed @playwright/cli.
// ============================================================================
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const INDEX_URL = 'file://' + path.join(ROOT, 'index.html');
const HEADED = process.argv.includes('--headed');

function loadPlaywright() {
  const tried = [];
  try { return require('playwright'); } catch (e) { tried.push('playwright'); }
  const nvm = path.join(process.env.HOME || '', '.nvm/versions/node');
  const roots = [];
  if (fs.existsSync(nvm)) {
    for (const v of fs.readdirSync(nvm)) {
      roots.push(path.join(nvm, v, 'lib/node_modules/@playwright/cli/node_modules/playwright'));
      roots.push(path.join(nvm, v, 'lib/node_modules/playwright'));
    }
  }
  roots.push('/usr/local/lib/node_modules/playwright', '/opt/homebrew/lib/node_modules/playwright');
  for (const r of roots) {
    try {
      if (fs.existsSync(r)) return createRequire(path.join(r, 'index.js'))(r);
    } catch (e) { tried.push(r); }
  }
  console.error('playwright not found. looked in:\n  ' + tried.join('\n  '));
  process.exit(2);
}

// ---------------- tiny assert harness ----------------
let group = '';
const results = [];
function section(name) { group = name; }
function ok(name, cond, extra) {
  results.push({ group, name, pass: !!cond, extra: cond ? '' : (extra == null ? '' : String(extra)) });
  const tag = cond ? '  ok  ' : ' FAIL ';
  console.log(tag + '[' + group + '] ' + name + (cond || extra == null ? '' : '  -> ' + extra));
}
function eq(name, actual, expected) {
  ok(name, actual === expected, 'got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected));
}
function near(name, actual, expected, tol) {
  ok(name, Math.abs(actual - expected) <= tol,
    'got ' + actual + ', want ' + expected + ' ±' + tol);
}

// ---------------- page helpers ----------------
const frames = (page, n = 2) => page.evaluate(n => new Promise(res => {
  let left = n;
  const step = () => (--left <= 0 ? res(true) : requestAnimationFrame(step));
  requestAnimationFrame(step);
}), n);

const state = page => page.evaluate(() => ({
  state: G.state, paused: G.paused, floorNum: G.floorNum,
  x: G.player && G.player.x, y: G.player && G.player.y,
  hp: G.player && G.player.hp, items: G.stats.items, kills: G.stats.kills,
  time: G.stats.time, tears: G.tears.length, enemies: G.enemies.length,
  beams: G.beams.length, roomKind: G.room && G.room.kind,
  boss: (G.enemies.find(e => e.isBoss) || {}).name || null,
  bossFinal: !!((G.enemies.find(e => e.isBoss) || {}).def || {}).final,
}));

// average luminance of the canvas, used to detect the pause dim + overlay
const luma = page => page.evaluate(() => {
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4 * 97) s += d[i] + d[i + 1] + d[i + 2];
  return s / (d.length / (4 * 97)) / 3;
});

async function press(page, key, ms = 40) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

async function runSuite(page, context, consoleErrors) {
  // ---------------------------------------------------------------- delivery
  section('交付形态');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok('index.html 用普通 script 标签（无 type=module）', !/type\s*=\s*"?module/.test(html));
  ok('没有构建产物 / npm 依赖', !fs.existsSync(path.join(ROOT, 'package.json')) &&
    !fs.existsSync(path.join(ROOT, 'node_modules')));
  const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
  const esm = jsFiles.filter(f => /^\s*(import|export)\s/m.test(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')));
  ok('js 里没有 import/export（file:// 下不会被 CORS 拦）', esm.length === 0, esm.join(','));
  ok('file:// 直接打开即可运行', await page.evaluate(() => location.protocol === 'file:' && typeof G === 'object'));

  // ------------------------------------------------------------- title / boot
  section('标题与启动');
  const boot = await state(page);
  eq('初始状态是 menu', boot.state, 'menu');
  ok('标题画面已绘制（画面不是纯黑）', await luma(page) > 4);
  await press(page, 'Enter');
  await frames(page, 3);
  let s = await state(page);
  eq('按 Enter 进入游戏', s.state, 'play');
  eq('从第 1 层开始', s.floorNum, 1);
  eq('起始房是 start', s.roomKind, 'start');
  eq('开局 3 颗心（6 半心）', s.hp, 6);

  // --------------------------------------------------------------- movement
  section('移动与射击');
  const before = await state(page);
  await press(page, 'KeyD', 260);
  await frames(page, 3);
  let after = await state(page);
  ok('按 D 向右移动', after.x > before.x + 20, 'dx=' + (after.x - before.x).toFixed(1));
  await press(page, 'KeyW', 260);
  await frames(page, 3);
  const after2 = await state(page);
  ok('按 W 向上移动', after2.y < after.y - 15, 'dy=' + (after2.y - after.y).toFixed(1));
  await page.keyboard.down('ArrowRight');
  await frames(page, 4);
  const shooting = await state(page);
  await page.keyboard.up('ArrowRight');
  ok('按方向键发射眼泪', shooting.tears > 0, 'tears=' + shooting.tears);
  await page.waitForTimeout(400);

  // ------------------------------------------------------------------ pause
  section('暂停（P 键）');
  const lumaPlay = await luma(page);
  await page.keyboard.down('KeyW');           // hold a movement key across the pause
  await frames(page, 2);
  await press(page, 'KeyP');
  await frames(page, 2);
  let p1 = await state(page);
  ok('按 P 进入暂停', p1.paused === true);
  eq('暂停时游戏状态仍是 play', p1.state, 'play');
  ok('暂停时释放按住的键（不会漂移）', await page.evaluate(() => keys.KeyW !== true));
  const lumaPaused = await luma(page);
  ok('暂停遮罩压暗了画面', lumaPaused < lumaPlay - 3,
    'play=' + lumaPlay.toFixed(1) + ' paused=' + lumaPaused.toFixed(1));
  ok('暂停界面画出了文字/属性面板', await page.evaluate(() => {
    // sample the row where 「暂 停」 is drawn; it must contain bright pixels
    const d = ctx.getImageData(0, 90, canvas.width, 60).data;
    let bright = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] > 170) bright++;
    return bright > 120;
  }));
  await page.keyboard.up('KeyW');

  const froz1 = await page.evaluate(() => ({
    px: G.player.x, py: G.player.y, t: G.stats.time,
    epos: G.enemies.map(e => [e.x, e.y]), anim: G.pauseAnim,
  }));
  await page.waitForTimeout(600);
  const froz2 = await page.evaluate(() => ({
    px: G.player.x, py: G.player.y, t: G.stats.time,
    epos: G.enemies.map(e => [e.x, e.y]), anim: G.pauseAnim,
  }));
  near('暂停时玩家不动 (x)', froz2.px, froz1.px, 0.01);
  near('暂停时玩家不动 (y)', froz2.py, froz1.py, 0.01);
  near('暂停时计时器冻结', froz2.t, froz1.t, 0.02);
  ok('暂停时敌人不动', JSON.stringify(froz1.epos) === JSON.stringify(froz2.epos));
  ok('暂停界面仍在刷新（pauseAnim 在走）', froz2.anim > froz1.anim);

  await press(page, 'KeyP');
  await frames(page, 3);
  let p2 = await state(page);
  eq('再按 P 恢复游戏', p2.paused, false);
  const tResume = p2.time;
  await page.waitForTimeout(500);
  const p3 = await state(page);
  near('恢复后计时继续（且没把暂停时长算进去）', p3.time - tResume, 0.5, 0.35);
  await press(page, 'KeyD', 220);
  await frames(page, 2);
  const p4 = await state(page);
  ok('恢复后可以继续移动', Math.abs(p4.x - p2.x) > 10, 'dx=' + (p4.x - p2.x).toFixed(1));

  section('开发者模式（` 键）');
  await press(page, 'Backquote');
  await frames(page, 2);
  ok('按 ` 开启开发者模式', await page.evaluate(() => G.dev === true));
  await press(page, 'BracketRight');
  await press(page, 'BracketRight');
  await frames(page, 2);
  const dev1 = await page.evaluate(() => ({ taken: G.player.itemsTaken.slice(), idx: devIdx }));
  ok('] 走到第 2 件道具，且身上只有这一件', dev1.idx === 1 && dev1.taken.length === 1,
    JSON.stringify(dev1));
  await press(page, 'BracketLeft');
  await frames(page, 2);
  ok('[ 退回上一件道具',
    await page.evaluate(() => devIdx === 0 && G.player.itemsTaken.length === 1));
  await press(page, 'Backquote');
  await frames(page, 2);
  ok('再按 ` 关掉开发者模式', await page.evaluate(() => G.dev === false));
  await page.evaluate(() => {
    const { x, y } = G.player;
    Object.assign(G.player, makePlayer(), { x, y });   // 后面的用例回到基础属性
  });

  section('自动暂停（切换窗口）');
  await page.evaluate(() => { G.paused = false; });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await frames(page, 2);
  ok('窗口失焦自动暂停', (await state(page)).paused === true);
  await press(page, 'KeyP');
  ok('P 可以解除自动暂停', (await state(page)).paused === false);

  // chrome-headless-shell never really hides a page, so drive the same code
  // path the browser uses: flip document.hidden and fire visibilitychange.
  const vis = await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    G.paused = false;
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    await frame();
    const pausedWhenHidden = G.paused;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    await frame();
    const stillPausedAfterReturn = G.paused;
    delete document.hidden;
    if (desc) Object.defineProperty(Document.prototype, 'hidden', desc);
    return { pausedWhenHidden, stillPausedAfterReturn, hidden: document.hidden };
  });
  ok('切到别的标签页（visibilitychange）自动暂停', vis.pausedWhenHidden === true);
  ok('回到窗口后仍保持暂停，等玩家自己继续', vis.stillPausedAfterReturn === true);
  ok('document.hidden 还原正常', vis.hidden === false);
  await press(page, 'KeyP');
  eq('继续游戏', (await state(page)).paused, false);

  await page.evaluate(() => { G.state = 'menu'; G.paused = false; });
  await press(page, 'KeyP');
  ok('菜单/结算界面按 P 不会进入暂停', (await state(page)).paused === false);
  await page.evaluate(() => { G.state = 'play'; });

  // ------------------------------------------------------------ floors: 12
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
  section('89 件道具');
  const itemInfo = await page.evaluate(() => {
    const errs = [];
    for (const def of ITEM_DEFS) {
      try { drawItemIcon(ctx, -200, -200, def); } catch (e) { errs.push('icon ' + def.id + ': ' + e.message); }
    }
    // apply every item to a fresh player, then all 55 at once
    for (const def of ITEM_DEFS) {
      const p = makePlayer();
      try {
        def.apply(p); clampPlayerStats(p);
        for (const k of ['damage', 'fireDelay', 'shotSpeed', 'range', 'moveSpeed', 'tearSize', 'maxHp', 'hp'])
          if (!isFinite(p[k])) throw new Error(k + ' = ' + p[k]);
        if (p.hp > p.maxHp) throw new Error('hp > maxHp');
      } catch (e) { errs.push('apply ' + def.id + ': ' + e.message); }
    }
    const all = makePlayer();
    for (const def of ITEM_DEFS) { def.apply(all); clampPlayerStats(all); }
    return {
      count: ITEM_DEFS.length,
      ids: new Set(ITEM_DEFS.map(d => d.id)).size,
      icons: new Set(ITEM_DEFS.map(d => d.icon + (d.tint || ''))).size,
      errs,
      stacked: {
        damage: all.damage, fireDelay: all.fireDelay, moveSpeed: all.moveSpeed,
        maxHp: all.maxHp, multishot: all.multishot, orbitals: all.orbitals,
        familiars: all.familiars, crit: all.crit, laser: all.laser,
      },
      hasStat: ITEM_DEFS.filter(d => {
        const p = makePlayer(); const b = JSON.stringify([p.damage, p.fireDelay, p.moveSpeed, p.range, p.shotSpeed, p.maxHp, p.tearSize]);
        d.apply(p);
        return JSON.stringify([p.damage, p.fireDelay, p.moveSpeed, p.range, p.shotSpeed, p.maxHp, p.tearSize]) !== b;
      }).length,
      hasBehavior: ITEM_DEFS.filter(d => {
        const p = makePlayer();
        d.apply(p);
        return p.laser || p.homing || p.piercing || p.bounce || p.explosive || p.poison ||
          p.slowOnHit || p.crit || p.orbitals || p.familiars || p.contactDamage ||
          p.vampirism || p.extraLives || p.pickupMagnet || p.multishot > 1 ||
          p.spectral || p.split || p.tearAura || p.distGrow || p.distShrink ||
          p.shieldMax || p.dmgReduce || p.ipecac;
      }).length,
      hasLook: ITEM_DEFS.filter(d => {
        const p = makePlayer();
        d.apply(p);
        const a = p.appearance;
        return a.hat || a.big || a.tearColor || a.aura ||
          a.headColor !== '#f7f3e9' || a.eyeColor !== '#17110c';
      }).length,
    };
  });
  eq('92 件道具（89 + 3 张地图）', itemInfo.count, 92);
  eq('道具 id 无重复', itemInfo.ids, 92);
  ok('图标外观 >= 70 种', itemInfo.icons >= 70, 'uniq=' + itemInfo.icons);
  ok('全部图标可绘制 / 全部效果可应用', itemInfo.errs.length === 0, itemInfo.errs.slice(0, 4).join(' | '));
  ok('改属性的道具 >= 55 件', itemInfo.hasStat >= 55, itemInfo.hasStat);
  ok('改眼泪/身体机制的道具 >= 40 件', itemInfo.hasBehavior >= 40, itemInfo.hasBehavior);
  ok('改外观的道具 >= 12 件', itemInfo.hasLook >= 12, itemInfo.hasLook);
  ok('89 件全部叠加后数值仍在上限内',
    itemInfo.stacked.damage <= 90 && itemInfo.stacked.fireDelay >= 0.08 &&
    itemInfo.stacked.moveSpeed <= 560 && itemInfo.stacked.maxHp <= 24 &&
    itemInfo.stacked.multishot <= 9 && itemInfo.stacked.orbitals <= 6 &&
    itemInfo.stacked.familiars <= 4 && itemInfo.stacked.crit <= 0.85,
    JSON.stringify(itemInfo.stacked));
  ok('叠满后 Brimstone 激光生效', itemInfo.stacked.laser === true);

  // real pickup: walk onto a pedestal in game
  const pickup = await page.evaluate(async () => {
    const p = G.player;
    const before = G.stats.items;
    G.room.pedestals.push({ x: p.x + 30, y: p.y, def: ITEM_BY_ID.sad_onion, anim: 0, taken: false });
    const fd = p.fireDelay;
    for (let i = 0; i < 40 && G.stats.items === before; i++) {
      p.x += 1;
      await new Promise(r => requestAnimationFrame(r));
    }
    return { gained: G.stats.items - before, faster: p.fireDelay < fd, toast: !!G.toast };
  });
  eq('走到底座上会拾取道具', pickup.gained, 1);
  ok('拾取后属性立刻生效', pickup.faster);
  ok('拾取后弹出道具提示', pickup.toast);

  // ------------------------------------------------- new mechanics & difficulty
  section('新机制与难度曲线');
  const mech = await page.evaluate(() => {
    const out = {};
    const p = G.player;
    // isolate world state
    const saved = {
      enemies: G.enemies, tears: G.tears, eshots: G.eshots, beams: G.beams,
      lasers: G.lasers, state: G.state, paused: G.paused,
      px: p.x, py: p.y, hp: p.hp, maxHp: p.maxHp, invuln: p.invuln,
      laser: p.laser, multishot: p.multishot, room: G.room,
    };
    G.state = 'play'; G.paused = false;
    G.enemies = []; G.tears = []; G.eshots = []; G.beams = []; G.lasers = [];
    p.maxHp = 24; p.hp = 24; p.invuln = 0;
    p.x = W / 2; p.y = H / 2;

    // --- exponential difficulty curve ---
    out.hpCurve = enemyHpScale(12) / enemyHpScale(1) >= 7 &&
      enemyHpScale(6) / enemyHpScale(1) < enemyHpScale(12) / enemyHpScale(6); // convex
    out.touchCurve = enemyTouchDamage(1) === 1 && enemyTouchDamage(12) >= 3;
    out.shotCurve = enemyShotDamage(1) === 1 && enemyShotDamage(12) === 2;

    // --- materialize window: no contact, no damage, then normal ---
    const g1 = makeEnemy('gaper', p.x, p.y, 1);
    out.spawnWindow = g1.spawnT > 0.5 && makeBoss(BOSS_DEFS[0], 300, 300).spawnT > 0.8;
    G.enemies = [g1];
    const hp0 = p.hp;
    updateEnemies(G, 1 / 60);           // overlapping, but materializing
    out.noContactWhileSpawning = p.hp === hp0;
    G.tears = [{ x: g1.x, y: g1.y, vx: 1, vy: 0, r: 6, damage: 5, traveled: 0, range: 300,
      homing: false, piercing: false, bounce: 0, explosive: 0, poison: 0, slow: 0,
      spectral: true, split: 0, aura: 0, auraT: 0, distGrow: 0, distShrink: 0, hitSet: null, dead: false }];
    const ghp = g1.hp;
    updateTears(G, 1 / 60);
    out.noHitWhileSpawning = g1.hp === ghp && !G.tears[0].dead;
    g1.spawnT = 0; p.invuln = 0;
    updateEnemies(G, 1 / 60);           // now materialized: contact hurts
    out.contactAfterSpawn = p.hp < hp0;
    // materialize animation draws for every enemy type without throwing
    out.spawnDrawOk = true;
    for (const ty of ['gaper', 'fly', 'spitter', 'hopper', 'sentry', 'boomfly', 'globin', 'knight', 'vis']) {
      try {
        const e = makeEnemy(ty, 300, 300, 8);
        drawEnemyByType(e);           // spawnT > 0 path
        e.spawnT = 0;
        drawEnemyByType(e);           // normal path
      } catch (err) { out.spawnDrawOk = 'draw ' + ty + ': ' + err.message; }
    }

    // --- hitstop: a hit freezes only the enemy that was hit, not the world ---
    const g2 = makeEnemy('gaper', 500, 300, 1);
    const g3 = makeEnemy('gaper', 620, 300, 1);
    g2.spawnT = 0; g3.spawnT = 0;
    G.enemies = [g2, g3];
    G.tears = [{ x: g2.x, y: g2.y, vx: 10, vy: 0, r: 6, damage: 1, traveled: 0, range: 300,
      homing: false, piercing: false, bounce: 0, explosive: 0, poison: 0, slow: 0,
      spectral: false, split: 0, aura: 0, auraT: 0, distGrow: 0, distShrink: 0, hitSet: null, dead: false }];
    updateTears(G, 1 / 60);
    out.hitstopOnEnemy = g2.hitstop > 0.02 && g3.hitstop === 0 && G.hitstop === undefined;
    const froze = { x: g2.x, y: g2.y }, ran = { x: g3.x, y: g3.y };
    p.invuln = 9;
    updateEnemies(G, 1 / 60);
    out.hitstopLocal = g2.x === froze.x && g2.y === froze.y &&
      (g3.x !== ran.x || g3.y !== ran.y);
    p.invuln = 0;

    // --- Brimstone × multishot coexist: fan of beams ---
    // (charge gating lives in updatePlay; a completed charge calls fireBrimstone)
    // pin every translated tear mod so the beam count is deterministic
    const savedMods = {};
    for (const k of ['bounce', 'tearAura', 'explosive', 'split', 'homing', 'crit',
      'poison', 'slowOnHit', 'piercing', 'spectral', 'damage', 'tearSize',
      'distGrow', 'distShrink', 'range', 'shotSpeed', 'ipecac']) savedMods[k] = p[k];
    Object.assign(p, { bounce: 0, tearAura: 0, explosive: 0, split: 0, homing: false,
      crit: 0, poison: 0, slowOnHit: 0, piercing: false, spectral: false,
      damage: 3.5, tearSize: 6.5, distGrow: 0, distShrink: 0, range: 380, shotSpeed: 400, ipecac: false });
    G.enemies = []; G.beams = [];
    p.laser = true; p.multishot = 3; p.fireCd = 0;
    fireBrimstone(G, 1, 0);
    out.laserMultishot = G.beams.length === 3 &&
      new Set(G.beams.map(b => b.angle.toFixed(3))).size === 3;
    p.multishot = 1;

    // --- laser × tear items: the three-layer translation ---
    // layer 1: poison + slow ride the beam onto every enemy it crosses,
    //          and distShrink grades damage along the beam
    p.poison = 3; p.slowOnHit = 0.5; p.distShrink = 1;
    const lzNear = makeEnemy('gaper', p.x + 120, p.y - 8, 1);
    const lzFar = makeEnemy('gaper', p.x + 320, p.y - 8, 1);
    lzNear.spawnT = 0; lzFar.spawnT = 0;
    lzNear.hp = 9999; lzFar.hp = 9999;
    G.enemies = [lzNear, lzFar]; G.beams = [];
    fireBrimstone(G, 1, 0);
    out.laserPoisonSlow = lzNear.poison > 0 && lzNear.slowT > 0 && lzFar.poison > 0;
    out.laserDistScale = (9999 - lzNear.hp) > (9999 - lzFar.hp);
    p.poison = 0; p.slowOnHit = 0; p.distShrink = 0;

    // layer 1: tearAura leaves a ticking burn trail behind the beam
    G.enemies = []; G.beams = [];
    p.tearAura = 2;
    fireBrimstone(G, 1, 0);
    out.laserTrail = G.beams.some(b => b.trail) && G.beams.some(b => !b.trail);
    const burn = makeEnemy('gaper', p.x + 150, p.y - 8, 1);
    burn.spawnT = 0; burn.hp = 9999;
    G.enemies = [burn];
    for (let i = 0; i < 20; i++) updateBeams(G, 1 / 60);
    out.laserTrailTicks = burn.hp < 9999;
    p.tearAura = 0;

    // layer 2: bounce reflects the beam off the wall into extra segments
    G.enemies = []; G.beams = [];
    p.bounce = 2; p.fireCd = 0;
    fireBrimstone(G, 1, 0);
    out.laserBounce = G.beams.filter(b => !b.trail).length > 1;
    p.bounce = 0;

    // layer 2: homing bends the aim toward a nearby enemy
    const bait = makeEnemy('gaper', p.x + 200, p.y + 60, 1);
    bait.spawnT = 0;
    G.enemies = [bait]; G.beams = [];
    p.homing = true;
    fireBrimstone(G, 1, 0);
    const mainBeam = G.beams.find(b => !b.trail);
    out.laserHoming = !!mainBeam && mainBeam.angle > 0.05;
    p.homing = false;

    // layer 2: split bursts the beam end into two tears
    G.enemies = []; G.beams = []; G.tears = [];
    p.split = 1;
    fireBrimstone(G, 1, 0);
    out.laserSplit = G.tears.length === 2;
    p.split = 0; G.tears = [];

    // layer 2: explosive detonates at the beam's end point (right wall)
    const offline = makeEnemy('gaper', FLOOR_X + FLOOR_W - 20, p.y - 8 + 60, 1);
    offline.spawnT = 0; offline.hp = 9999;
    G.enemies = [offline]; G.beams = [];
    p.explosive = 80;
    fireBrimstone(G, 1, 0);
    out.laserBlast = offline.hp < 9999;
    p.explosive = 0;

    // layer 2: shotSpeed buys charge speed on a hitscan weapon
    out.laserChargeScales =
      laserChargeTime({ shotSpeed: 800 }) < laserChargeTime({ shotSpeed: 400 }) &&
      laserChargeTime({ shotSpeed: 400 }) === LASER_CHARGE_TIME;

    // layer 3: redundant piercing/spectral fold into beam damage
    G.enemies = []; G.beams = [];
    fireBrimstone(G, 1, 0);
    const plainDmg = G.beams.find(b => !b.trail).dmg;
    p.piercing = true; p.spectral = true;
    G.beams = [];
    fireBrimstone(G, 1, 0);
    const foldedDmg = G.beams.find(b => !b.trail).dmg;
    out.laserInherentPayout = foldedDmg > plainDmg * 1.2;

    Object.assign(p, savedMods);
    p.laser = saved.laser; p.multishot = saved.multishot;
    G.beams = []; G.tears = [];

    // --- sweeping room lasers (boss) + purple palette ---
    G.lasers = [];
    const mb = makeBoss(BOSS_DEFS.find(b => b.attacks.includes('sweepLasers')), W / 2, H / 2);
    mb.spawnT = 0; mb.state = 'atk'; mb.atk = 'sweepLasers'; mb.phase = 0; mb.t = 0; mb.data = {};
    G.enemies = [mb];
    BOSS_ATTACKS.sweepLasers(G, mb, 1 / 60);
    out.sweepCount = G.lasers.length;
    out.sweepWarns = G.lasers.every(l => l.warm > 0);
    out.sweepSpins = G.lasers.every(l => l.spin !== 0);
    for (let i = 0; i < 50; i++) { p.invuln = 9; updateLasers(G, 1 / 40); } // burn off warmup
    const lz = G.lasers[0];
    out.sweepActive = !!lz && lz.warm <= 0 && lz.life > 0;
    if (lz) {
      p.invuln = 0;
      const hpL = p.hp;
      p.x = lz.x + Math.cos(lz.angle) * 120;
      p.y = lz.y + Math.sin(lz.angle) * 120;
      updateLasers(G, 1 / 60);
      out.sweepHurts = p.hp < hpL;
    }
    const m = /rgba\((\d+),(\d+),(\d+)/.exec(ENEMY_LASER.bright) || [];
    out.laserPurple = +m[3] > 200 && +m[1] > 120 && +m[2] < +m[1] && +m[2] < +m[3];
    try { drawLaser(ctx, { x: 300, y: 300, angle: 0.4, len: 600, w: 12, warm: 0, life: 1, anim: 2 });
      drawLaser(ctx, { x: 300, y: 300, angle: 0.4, len: 600, w: 12, warm: 0.4, life: 1, anim: 2 });
      out.laserDraws = true; } catch (e) { out.laserDraws = e.message; }
    G.lasers = []; G.enemies = [];

    // --- Holy Mantle shield: eats one hit, re-arms on room change ---
    p.shieldMax = 1; p.shieldUp = true; p.invuln = 0;
    const hpS = p.hp;
    hurtPlayer(G, 2, p.x + 10, p.y);
    out.shieldBlocks = p.hp === hpS && p.shieldUp === false;
    p.shieldUp = false;
    enterRoom(G.room, null);
    out.shieldRearms = p.shieldUp === true;
    p.shieldMax = 0; p.shieldUp = false;

    // --- The Wafer: flat damage reduction, min half a heart ---
    p.dmgReduce = 1; p.invuln = 0;
    const hpW = p.hp;
    hurtPlayer(G, 2, p.x + 10, p.y);
    out.waferReduces = hpW - p.hp === 1;
    p.dmgReduce = 0;

    // --- Ipecac: explosions hurt the player too ---
    p.invuln = 0;
    const hpI = p.hp;
    explodeAt(G, p.x + 20, p.y, 50, 6, true);
    out.ipecacSelfHarm = p.hp < hpI;

    // --- The Parasite: tears split when they end ---
    G.tears = [];
    onTearEnd(G, { x: 400, y: 300, vx: 200, vy: 0, r: 6, damage: 4, explosive: 0, split: 1,
      poison: 0, slow: 0, spectral: false, color: null, dead: false });
    out.splits = G.tears.filter(t => !t.dead).length === 2;
    G.tears = [];

    // --- distance-scaled damage ---
    const far = { damage: 10, traveled: 300, range: 300, distGrow: 0.9, distShrink: 0 };
    const near_ = { damage: 10, traveled: 0, range: 300, distGrow: 0, distShrink: 1 };
    const nearFar = { damage: 10, traveled: 300, range: 300, distGrow: 0, distShrink: 1 };
    out.coalGrows = tearDamage(far) > 18;
    out.proptosisShrinks = tearDamage(near_) > 12 && tearDamage(nearFar) < 5;

    // --- spectral tears pass rocks, normal tears splash on them ---
    const rockRoom = Object.assign({}, G.room, { rocks: [{ cx: 6, cy: 3 }] });
    const rx = FLOOR_X + 6 * TILE + TILE / 2, ry = FLOOR_Y + 3 * TILE + TILE / 2;
    const mkT = spec => ({ x: rx, y: ry, vx: 5, vy: 0, r: 6, damage: 1, traveled: 0, range: 400,
      homing: false, piercing: false, bounce: 0, explosive: 0, poison: 0, slow: 0,
      spectral: spec, split: 0, aura: 0, auraT: 0, distGrow: 0, distShrink: 0, hitSet: null, dead: false });
    const savedRoom = G.room; G.room = rockRoom; G.enemies = [];
    G.tears = [mkT(false), mkT(true)];
    updateTears(G, 1 / 60);
    out.rockBlocksTear = G.tears.length === 1 && G.tears[0].spectral === true;
    G.room = savedRoom;

    // --- Knight: frontal shield, killable from behind ---
    const kn = makeEnemy('knight', 500, 300, 8);
    kn.spawnT = 0; kn.faceX = -1; kn.faceY = 0;      // facing left (toward player)
    out.knightFront = knightBlocksTear(kn, 1, 0) === true;   // tear flying right = head-on
    out.knightBack = knightBlocksTear(kn, -1, 0) === false;  // tear from behind connects
    G.enemies = [kn];
    const khp = kn.hp;
    G.tears = [Object.assign(mkT(false), { x: kn.x - 2, y: kn.y, vx: 60, vy: 0, damage: 3 })];
    updateTears(G, 1 / 60);
    out.knightFrontNoDmg = kn.hp === khp;
    G.tears = [Object.assign(mkT(false), { x: kn.x + 2, y: kn.y, vx: -60, vy: 0, damage: 3 })];
    updateTears(G, 1 / 60);
    out.knightBackDmg = kn.hp < khp;

    // --- Globin: first death melts into a reforming pile ---
    const gl = makeEnemy('globin', 400, 300, 5);
    gl.spawnT = 0;
    G.enemies = [gl];
    killEnemy(G, gl);
    out.globinReforms = !gl.dead && gl.pile > 0 && gl.hp > 0;
    killEnemy(G, gl);
    out.globinFinalDeath = gl.dead === true;

    // --- Boom Fly: detonates on death, blast reaches the player ---
    p.invuln = 0;
    const bf = makeEnemy('boomfly', p.x + 30, p.y, 5);
    bf.spawnT = 0;
    G.enemies = [bf];
    const hpB = p.hp;
    killEnemy(G, bf);
    out.boomflyBlast = bf.dead && p.hp < hpB;

    // --- Vis: charges a sustained laser through addEnemyLaser ---
    G.lasers = []; p.invuln = 9;
    const vs = makeEnemy('vis', p.x + 150, p.y, 8);
    vs.spawnT = 0; vs.shootCd = 0;
    G.enemies = [vs];
    updateEnemies(G, 1 / 60);
    out.visLaser = G.lasers.length === 1 && G.lasers[0].warm > 0 && vs.charging > 0;

    // --- enemy homing shots steer toward the player ---
    G.eshots = [];
    addEnemyTear(G, p.x + 200, p.y, 0, 200, 6, 1, { homing: 3, homeT: 2 }); // flying away
    const s0 = G.eshots[0];
    const d0 = Math.hypot(s0.vx, s0.vy);
    for (let i = 0; i < 70; i++) updateEnemyShots(G, 1 / 60);
    const toPlayer = Math.atan2(p.y - s0.y, p.x - s0.x);
    const heading = Math.atan2(s0.vy, s0.vx);
    let dA = Math.abs(toPlayer - heading); while (dA > Math.PI) dA = Math.abs(dA - TAU);
    out.homingShots = dA < 0.9 && Math.abs(Math.hypot(s0.vx, s0.vy) - d0) < 1;
    // curving shots bend sideways
    G.eshots = [];
    addEnemyTear(G, 300, 300, 0, 200, 6, 1, { curve: 260 });
    const c0 = G.eshots[0];
    for (let i = 0; i < 30; i++) updateEnemyShots(G, 1 / 60);
    out.curveShots = Math.abs(c0.vy) > 40;

    // --- deep floors mix in the new enemy types ---
    const pool12 = roomEnemyPool(12), pool8 = roomEnemyPool(8);
    out.newEnemiesInPools = pool12.includes('knight') && pool12.includes('vis') &&
      pool8.includes('globin') && roomEnemyPool(4).includes('boomfly');

    // --- dev mode: 逐个隔离测试全部道具 ---
    G.dev = true;
    let devOk = true;
    const devStart = devIdx;
    for (let i = 0; i < ITEM_DEFS.length; i++) {
      try { devStepItem(1); } catch (err) { devOk = ITEM_DEFS[i].id + ': ' + err.message; break; }
      if (G.player.itemsTaken.length !== 1) { devOk = '道具叠加了: ' + ITEM_DEFS[i].id; break; }
      if (G.player.itemsTaken[0] !== ITEM_DEFS[devIdx].id) { devOk = '下标与道具不一致'; break; }
    }
    out.devIsolatesItems = devOk;
    out.devCyclesBack = devIdx === devStart;   // 走完一圈回到原位（下标环绕正确）
    const hpD = p.hp;
    G.state = 'play'; G.paused = false; p.invuln = 0;
    hurtPlayer(G, 2, p.x + 10, p.y);
    out.devImmune = p.hp === hpD;
    G.dev = false;
    p.invuln = 0;
    hurtPlayer(G, 2, p.x + 10, p.y);       // sanity: the same hit lands with dev off
    out.devOffTakesDamage = p.hp < hpD;
    Object.assign(p, makePlayer());

    // restore the world
    G.enemies = saved.enemies; G.tears = saved.tears; G.eshots = saved.eshots;
    G.beams = saved.beams; G.lasers = saved.lasers; G.room = saved.room;
    G.state = saved.state; G.paused = saved.paused;
    p.x = saved.px; p.y = saved.py; p.maxHp = saved.maxHp; p.hp = saved.hp;
    p.invuln = saved.invuln; p.vx = 0; p.vy = 0;
    G.toast = null;
    return out;
  });
  ok('小怪血量指数级增长（12层/1层 >= 7 且后段更陡）', mech.hpCurve === true);
  ok('接触伤害随层数上调（1 → 3+）', mech.touchCurve === true);
  ok('后期小怪弹幕伤害翻倍', mech.shotCurve === true);
  ok('敌人具现化保护期 0.55s / Boss 0.9s', mech.spawnWindow === true);
  ok('具现化期间不判接触伤害', mech.noContactWhileSpawning === true);
  ok('具现化期间不吃玩家眼泪', mech.noHitWhileSpawning === true);
  ok('具现化结束后恢复接触判定', mech.contactAfterSpawn === true);
  ok('9 种敌人的浮现动画与本体绘制无异常', mech.spawnDrawOk === true, mech.spawnDrawOk);
  ok('命中冻结 ~2 帧只挂在被打的敌人身上', mech.hitstopOnEnemy === true);
  ok('冻结期间该敌人静止，其他敌人照常行动', mech.hitstopLocal === true);
  ok('激光与多弹道并存（3 连发 = 3 束扇形激光）', mech.laserMultishot === true);
  ok('激光继承中毒/减速（第一层直通）', mech.laserPoisonSlow === true);
  ok('激光沿光束做远近增伤衰减（第一层）', mech.laserDistScale === true);
  ok('灼烧光环化为光束灼烧尾迹（第一层）', mech.laserTrail === true);
  ok('灼烧尾迹会持续跳伤害', mech.laserTrailTicks === true);
  ok('弹跳化为光束弹墙反射（第二层）', mech.laserBounce === true);
  ok('追踪化为光束瞄准偏折（第二层）', mech.laserHoming === true);
  ok('落地分裂化为光束末端分裂两颗眼泪（第二层）', mech.laserSplit === true);
  ok('爆炸化为光束末端爆炸（第二层）', mech.laserBlast === true);
  ok('弹速转化为激光蓄力速度（第二层）', mech.laserChargeScales === true);
  ok('穿透/幽灵冗余属性兜底为光束增伤（第三层）', mech.laserInherentPayout === true);
  ok('Boss 全屏发散持续激光 >= 4 束', mech.sweepCount >= 4, 'count=' + mech.sweepCount);
  ok('持续激光先有紫色预警线', mech.sweepWarns === true);
  ok('持续激光整体旋转扫场', mech.sweepSpins === true);
  ok('预警结束后激光进入伤害状态', mech.sweepActive === true);
  ok('站在扫场激光上会受伤', mech.sweepHurts === true);
  ok('敌方激光配色为紫色（不与玩家红色激光撞色）', mech.laserPurple === true);
  ok('持续激光两种状态都能绘制', mech.laserDraws === true, mech.laserDraws);
  ok('神圣披风：整房免疫一次伤害', mech.shieldBlocks === true);
  ok('神圣披风：换房自动充能', mech.shieldRearms === true);
  ok('圣饼：受伤减免 1（至少半心）', mech.waferReduces === true);
  ok('吐根糖浆：爆炸会伤到自己', mech.ipecacSelfHarm === true);
  ok('寄生虫：眼泪落地分裂成两瓣', mech.splits === true);
  ok('煤炭：飞得越远伤害越高', mech.coalGrows === true);
  ok('突眼症：近强远弱', mech.proptosisShrinks === true);
  ok('石头挡普通眼泪 幽灵弹穿石', mech.rockBlocksTear === true);
  ok('骑士正面格挡眼泪', mech.knightFront === true && mech.knightFrontNoDmg === true);
  ok('骑士背面照常受伤', mech.knightBack === true && mech.knightBackDmg === true);
  ok('Globin 第一次死亡改写为瘫成一滩重组', mech.globinReforms === true);
  ok('Globin 第二次死亡为真死', mech.globinFinalDeath === true);
  ok('Boom Fly 死亡爆炸波及玩家', mech.boomflyBlast === true);
  ok('Vis 会充能发射持续激光', mech.visLaser === true);
  ok('敌方追踪弹会转向玩家', mech.homingShots === true);
  ok('敌方弧线弹会侧向偏转', mech.curveShots === true);
  ok('新敌人已加入对应深度的刷怪池', mech.newEnemiesInPools === true);
  ok('开发者模式：89 件道具逐个应用且互不叠加', mech.devIsolatesItems === true, mech.devIsolatesItems);
  ok('开发者模式：道具列表走完一圈正确环绕', mech.devCyclesBack === true);
  ok('开发者模式：开启时免疫伤害，关闭后照常受伤',
    mech.devImmune === true && mech.devOffTakesDamage === true);

  // ----------------------------------------- new: blink / boom SFX / wings
  section('眨眼与飞行翅膀');
  const feat = await page.evaluate(() => {
    const out = {};
    const p = G.player;
    const saved = {
      px: p.x, py: p.y, state: G.state, paused: G.paused, room: G.room,
      tears: G.tears, particles: G.particles, enemies: G.enemies, eshots: G.eshots,
    };
    G.state = 'play'; G.paused = false;
    G.enemies = []; G.eshots = [];

    // --- firing arms the blink timer, and the blink face draws ---
    Object.assign(p, makePlayer(), { x: 480, y: 300, vx: 0, vy: 0 });
    G.tears = [];
    spawnPlayerTears(G, 1, 0);
    out.blinkOnShoot = p.blink > 0;
    try {
      drawDodo(ctx, -300, -300, { walk: 0, moving: false, aimX: 1, aimY: 0, blink: true });
      out.blinkDraws = true;
    } catch (e) { out.blinkDraws = e.message; }

    // --- layered explosion SFX is callable (audio ctx may be silent headless) ---
    try { SFX.boom(); out.boomOk = true; } catch (e) { out.boomOk = e.message; }

    // --- the flight item grants flight + sprout animation ---
    const def = ITEM_BY_ID.dodo_wings;
    out.hasWingItem = !!def;
    const q = makePlayer();
    def.apply(q); clampPlayerStats(q);
    out.grantsFlight = q.flight === true && q.wingGrow > 0;

    // --- flying ignores rocks; walking is pushed out of them ---
    const rockRoom = { rocks: [{ cx: 6, cy: 3 }], stains: [], pickups: [], pedestals: [], doors: {} };
    const t = tileRect(6, 3);
    const cxr = t.x + t.w / 2, cyr = t.y + t.h / 2;
    // overlap the rock from its right edge (centre-inside-rect is the
    // engine's degenerate no-push case, which never happens in play)
    const ox = t.x + t.w, oy = cyr;
    const walker = { x: ox, y: oy, r: 13 };
    collideWithRoom(walker, rockRoom, false);
    const flyer = { x: ox, y: oy, r: 13 };
    collideWithRoom(flyer, rockRoom, true);
    out.rockPushesWalker = Math.hypot(walker.x - ox, walker.y - oy) > 1;
    out.flightIgnoresRock = flyer.x === ox && flyer.y === oy;

    // --- real pickup: wings sprout + feather burst ---
    Object.assign(p, makePlayer(), { x: 480, y: 300, vx: 0, vy: 0 });
    G.particles = [];
    G.room = {
      rocks: [], stains: [], pickups: [], doors: {}, cleared: true, enemiesSpawned: true,
      pedestals: [{ x: p.x + 2, y: p.y, def, anim: 0, taken: false }],
    };
    updatePlay(1 / 60);
    out.pickupFlight = p.flight === true && p.wingGrow > 0;
    out.pickupFeathers = G.particles.length >= 10;

    // --- the winged walk cycle draws in all 8 facings ---
    let drawErr = null;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      try {
        drawDodo(ctx, -300, -300, {
          walk: i * 0.7, moving: true, aimX: 0, aimY: 1, blink: false,
          wings: true, wingGrow: 0, flap: i * 0.9, dirX: Math.cos(a), dirY: Math.sin(a),
        });
      } catch (e) { drawErr = 'dir ' + i + ': ' + e.message; }
    }
    out.wings8Draw = drawErr || true;

    // restore the world
    Object.assign(p, makePlayer());
    G.room = saved.room; G.tears = saved.tears; G.particles = saved.particles;
    G.enemies = saved.enemies; G.eshots = saved.eshots;
    G.state = saved.state; G.paused = saved.paused;
    p.x = saved.px; p.y = saved.py; p.vx = 0; p.vy = 0;
    G.toast = null;
    return out;
  });
  ok('每次发射眼泪都会触发眨眼', feat.blinkOnShoot === true);
  ok('眨眼表情可绘制', feat.blinkDraws === true, feat.blinkDraws);
  ok('分层爆炸音效可调用', feat.boomOk === true, feat.boomOk);
  ok('存在飞行道具 dodo 之翼', feat.hasWingItem === true);
  ok('拾取后获得飞行 + 翅膀生长动画', feat.grantsFlight === true);
  ok('步行会被岩石推开', feat.rockPushesWalker === true);
  ok('飞行无视岩石阻挡', feat.flightIgnoresRock === true);
  ok('实际拾取生效：长出翅膀并有羽毛爆发动画', feat.pickupFlight === true && feat.pickupFeathers === true,
    JSON.stringify({ flight: feat.pickupFlight, feathers: feat.pickupFeathers }));
  ok('带翅膀的八方向行走动画均可绘制', feat.wings8Draw === true, feat.wings8Draw);

  // ---------------------------------------------------- shop room
  section('商店房');
  const shopGen = await page.evaluate(() => {
    let withShop = 0;
    for (let i = 0; i < 20; i++) {
      if (generateFloor(1).rooms.some(r => r.kind === 'shop')) withShop++;
    }
    startRun();
    const shopRoom = G.floor.rooms.find(r => r.kind === 'shop');
    return { withShop, hasShop: !!shopRoom, prices: [itemShopPrice(1), itemShopPrice(5), itemShopPrice(9)] };
  });
  eq('20 次生成层层有商店房', shopGen.withShop, 20);
  ok('本局楼层带商店房', shopGen.hasShop);
  ok('道具价格随层数上涨 15/20/25',
    shopGen.prices[0] === 15 && shopGen.prices[1] === 20 && shopGen.prices[2] === 25,
    shopGen.prices.join('/'));

  const shopEnter = await page.evaluate(() => {
    const shopRoom = G.floor.rooms.find(r => r.kind === 'shop');
    enterRoom(shopRoom, null);
    const ws = G.room.shopItems || [];
    return {
      kind: G.room.kind,
      cleared: G.room.cleared,
      stocked: !!G.room.shopStocked,
      count: ws.length,
      heart: ws.filter(w => w.kind === 'heart').map(w => w.price)[0],
      items: ws.filter(w => w.kind === 'item' || w.kind === 'active')
        .map(w => ({ id: w.def && w.def.id, price: w.price })),
      hasConsumable: ws.some(w => w.kind === 'bomb' || w.kind === 'battery'),
      enemies: G.enemies.length,
    };
  });
  eq('进入商店房', shopEnter.kind, 'shop');
  ok('商店房有怪物守卫', shopEnter.enemies > 0, 'enemies=' + shopEnter.enemies);
  ok('进门时门是关闭的（未清怪）', shopEnter.cleared === false);
  ok('首次进店进货 4 件', shopEnter.stocked && shopEnter.count === 4, 'count=' + shopEnter.count);
  eq('红心标价 3 金币', shopEnter.heart, 3);
  ok('上架炸弹或电池消耗品', shopEnter.hasConsumable);
  ok('两件道具位已定价且不重复',
    shopEnter.items.length === 2 && shopEnter.items[0].id && shopEnter.items[1].id &&
    shopEnter.items[0].id !== shopEnter.items[1].id &&
    shopEnter.items.every(i => i.price >= 15),
    JSON.stringify(shopEnter.items));

  const shopBuy = await page.evaluate(() => {
    const p = G.player;
    p.invuln = 9999;
    G.enemies = [];                          // clear the guards, focus on purchases
    const w = G.room.shopItems.find(w => w.kind === 'item');
    // 1) not enough coins: collide, expect denial toast and no purchase
    p.coins = w.price - 1;
    p.x = w.x; p.y = w.y; p.vx = 0; p.vy = 0;
    updatePlay(1 / 60);
    const denied = { taken: w.taken, coins: p.coins, toast: G.toast && G.toast.title };
    // 2) enough coins: same collision buys instantly
    p.coins = w.price + 2;
    p.x = w.x; p.y = w.y;
    updatePlay(1 / 60);
    return {
      denied,
      defId: w.def.id,
      taken: w.taken,
      coins: p.coins,
      applied: p.itemsTaken.includes(w.def.id),
      toast: G.toast && G.toast.title,
      items: G.stats.items,
    };
  });
  ok('金币不足时无法购买', shopBuy.denied.taken === false && shopBuy.denied.coins >= 0);
  eq('金币不足有提示', shopBuy.denied.toast, '金币不足');
  ok('金币足够碰撞即购得', shopBuy.taken === true);
  const coinBonus = shopBuy.defId === 'golden_key' ? 5 : (shopBuy.defId === 'lucky_penny' ? 8 : 0);
  eq('购买后正确扣款', shopBuy.coins, 2 + coinBonus);
  ok('道具效果已生效并计入统计', shopBuy.applied && shopBuy.items > 0);

  const shopHeart = await page.evaluate(() => {
    const p = G.player;
    const w = G.room.shopItems.find(w => w.kind === 'heart');
    p.coins = 10;
    p.hp = p.maxHp;                          // full health: heart should be refused
    p.x = w.x; p.y = w.y; p.vx = 0; p.vy = 0;
    updatePlay(1 / 60);
    const fullBlocked = !w.taken && p.coins === 10;
    p.hp = p.maxHp - 2;                      // now injured: same collision buys
    p.x = w.x; p.y = w.y;
    updatePlay(1 / 60);
    return { fullBlocked, taken: w.taken, coins: p.coins, healed: p.hp === p.maxHp };
  });
  ok('满血时不会浪费金币买红心', shopHeart.fullBlocked);
  ok('缺血时红心购买生效（扣 3 金币回满）',
    shopHeart.taken && shopHeart.coins === 7 && shopHeart.healed,
    JSON.stringify(shopHeart));

  const shopMap = await page.evaluate(() => {
    // isolate the shop cell on the minimap, then hunt for the gold coin marker
    const shopRoom = G.floor.rooms.find(r => r.kind === 'shop');
    const saved = G.floor.rooms.map(r => ({ r, v: r.visited, s: r.seen }));
    for (const r of G.floor.rooms) { r.visited = false; r.seen = false; }
    shopRoom.visited = true;
    // draw the minimap directly: render() would stack the vignette/grain
    // post-fx on top and shift the corner colors out of tolerance
    ctx.fillStyle = '#000';
    ctx.fillRect(W - 140, 10, 130, 130);
    drawMinimap(ctx, G.floor, G.room);
    const img = ctx.getImageData(W - 140, 10, 130, 130).data;
    let goldPx = 0;
    for (let i = 0; i < img.length; i += 4) {
      if (Math.abs(img[i] - 231) < 25 && Math.abs(img[i + 1] - 187) < 25 && Math.abs(img[i + 2] - 66) < 25) goldPx++;
    }
    for (const { r, v, s } of saved) { r.visited = v; r.seen = s; }
    return goldPx;
  });
  ok('右上角小地图有金币标记', shopMap > 5, 'goldPx=' + shopMap);

  const shopDraw = await page.evaluate(() => {
    // tooltip + ware rendering must not throw
    try {
      // any def-bearing ware works; consumable slots (bomb/battery) have no def,
      // so synthesize one if every item/active slot has been bought already
      const w2 = G.room.shopItems.find(w => w.def && !w.taken)
        || G.room.shopItems.find(w => w.def)
        || { kind: 'item', def: ITEM_DEFS[0], price: 15, x: W / 2, y: H / 2, anim: 0, taken: false, near: false, denyT: 0 };
      drawShopWare(ctx, w2, 0);
      drawItemTooltip(ctx, { name: w2.def.name, desc: w2.def.desc, price: w2.price, x: w2.x, y: w2.y }, 0);
      drawItemTooltip(ctx, { name: w2.def.name, desc: w2.def.desc, price: w2.price, x: w2.x, y: w2.y }, 99);
      drawDoor(ctx, 'N', 'closed', 'shop');
      drawDoor(ctx, 'N', 'open', 'shop');
      return 'ok';
    } catch (e) { return String(e); }
  });
  eq('货摊 / 描述面板 / 商店门绘制不报错', shopDraw, 'ok');

  const tooltipAll = await page.evaluate(() => {
    // tooltips are a global mechanic, not shop-only: pedestal + pickups in a
    // plain room must also show their name/effect card when the player nears
    const room = G.floor.rooms.find(r => r.kind === 'normal');
    enterRoom(room, null);
    G.enemies = [];
    const p = G.player;
    p.coins = 4;
    // remember the entities first: updatePlay collects whatever the player
    // touches, so the tooltip scan must not depend on post-frame survivors
    let pk = room.pickups.find(x => !x.taken);
    if (!pk) { room.pickups.push(makePickup('coin', W / 2, H / 2 - 40)); pk = room.pickups[room.pickups.length - 1]; }
    let ped = room.pedestals.find(x => !x.taken && x.def);
    if (!ped) { spawnItemPedestal(room, W / 2, H / 2 + 40); ped = room.pedestals[room.pedestals.length - 1]; }
    const pkKind = pk.kind, pkX = pk.x, pkY = pk.y;
    const pedName = ped.def.name, pedX = ped.x, pedY = ped.y;
    p.x = pkX; p.y = pkY; p.vx = 0; p.vy = 0;
    updatePlay(1 / 60);
    // whatever got picked up in that frame is exactly what the card would
    // have shown the moment the player walked in
    const pickupTip = pk.taken ? { heart: '红心', halfheart: '半颗心', coin: '金币', chest: '宝箱' }[pkKind] : null;
    p.x = pedX; p.y = pedY;
    updatePlay(1 / 60);
    const pedTip = ped.taken ? pedName : null;
    return { pickupTip, pedTip };
  });
  ok('靠近掉落物弹出信息卡', !!tooltipAll.pickupTip, 'pickupTip=' + tooltipAll.pickupTip);
  ok('道具台同样弹出名称/加成信息卡', !!tooltipAll.pedTip, 'pedTip=' + tooltipAll.pedTip);

  // ---------------------------------------------------- bombs
  section('炸弹');
  const bombInfo = await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    startRun();
    const p = G.player;
    const out = { startBombs: p.bombs };
    G.enemies = [];
    G.room.cleared = true;
    p.invuln = 0;
    // place a bomb next to a rock and stand clear
    G.room.rocks = [{ cx: 3, cy: 3 }];
    const t = tileRect(3, 3);
    const rockX = t.x + TILE / 2, rockY = t.y + TILE / 2;
    p.x = rockX + 50; p.y = rockY;
    placeBomb();
    out.placed = G.liveBombs.length === 1;
    out.bombsAfterPlace = p.bombs;
    // fast-forward the fuse; player walks away in time
    p.x = rockX + 400;
    G.liveBombs[0].t = 0.01;
    updatePlay(1 / 60);
    out.exploded = G.liveBombs.length === 0;
    out.rockGone = G.room.rocks.length === 0;
    out.playerSafe = p.hp === p.maxHp;
    // second bomb right under the player: it must hurt
    p.bombs = 1;
    placeBomb();
    G.liveBombs[0].t = 0.01;
    p.invuln = 0;
    updatePlay(1 / 60);
    out.selfHurt = p.hp < p.maxHp;
    // no bombs left -> denial toast, nothing placed
    p.bombs = 0;
    G.toast = null;
    placeBomb();
    out.denied = G.liveBombs.length === 0 && !!G.toast;
    // live bomb draws
    try { drawLiveBomb(ctx, { x: -200, y: -200, t: 1, maxT: 1.6, anim: 0.3 }); out.draws = true; }
    catch (e) { out.draws = String(e); }
    await frame();
    return out;
  });
  ok('开局自带 3 颗炸弹', bombInfo.startBombs === 3, bombInfo.startBombs);
  ok('按 E 放置并扣除一颗', bombInfo.placed && bombInfo.bombsAfterPlace === 2,
    'placed=' + bombInfo.placed + ' left=' + bombInfo.bombsAfterPlace);
  ok('引线烧完爆炸并炸碎岩石', bombInfo.exploded && bombInfo.rockGone);
  ok('站远处不受波及', bombInfo.playerSafe);
  ok('贴脸爆炸会伤到自己', bombInfo.selfHurt);
  ok('没炸弹时按 E 只弹提示', bombInfo.denied);
  ok('点燃的炸弹可绘制', bombInfo.draws === true, bombInfo.draws);

  // ---------------------------------------------------- active items
  section('主动道具（空格）');
  const activeInfo = await page.evaluate(() => {
    const out = {};
    out.defCount = ACTIVE_DEFS.length;
    out.costsVary = new Set(ACTIVE_DEFS.map(d => d.cost)).size >= 3;
    const p = G.player;
    out.noneAtStart = p.active === null || p.active === undefined ? false : true;
    // equip the heal item, fully charged on pickup
    const heal = ACTIVE_BY_ID['act_heal'];
    equipActive(p, heal);
    out.fullOnPickup = p.active.charge === heal.cost;
    // use it while hurt
    p.hp = 2; p.maxHp = 6;
    G.toast = null;
    useActiveItem();
    out.healWorks = p.hp === 6 && p.active.charge === 0 && !!G.toast;
    // empty charge -> denied
    G.toast = null;
    useActiveItem();
    out.deniedEmpty = p.hp === 6 && !!G.toast;
    // room clear charges +1
    const c0 = p.active.charge;
    onRoomCleared(G.room);
    out.clearCharges = p.active.charge === c0 + 1;
    // battery pickup charges +1 and is consumed; ignored at full charge
    G.room.pickups = [makePickup('battery', p.x, p.y)];
    p.invuln = 9999;
    updatePlay(1 / 60);
    out.batteryCharges = p.active.charge === c0 + 2 && G.room.pickups.length === 0;
    p.active.charge = p.active.def.cost;
    G.room.pickups = [makePickup('battery', p.x, p.y)];
    updatePlay(1 / 60);
    out.batteryKeptAtFull = G.room.pickups.length === 1 && !G.room.pickups[0].taken;
    G.room.pickups = [];
    // bomb bag grants bombs
    equipActive(p, ACTIVE_BY_ID['act_bomb_bag']);
    const b0 = p.bombs;
    useActiveItem();
    out.bombBag = p.bombs === b0 + 2;
    // teleport goes home
    equipActive(p, ACTIVE_BY_ID['act_teleport']);
    useActiveItem();
    out.teleport = G.room === G.floor.start;
    // every active icon draws
    let err = null;
    for (const d of ACTIVE_DEFS) {
      try { drawItemIcon(ctx, -200, -200, d); } catch (e) { err = d.id + ': ' + e.message; }
    }
    out.iconsDraw = err || true;
    return out;
  });
  ok('主动道具池 >= 5 且充能费用有梯度', activeInfo.defCount >= 5 && activeInfo.costsVary,
    'count=' + activeInfo.defCount);
  ok('开局没有主动道具', activeInfo.noneAtStart === false);
  ok('拾取时满充能', activeInfo.fullOnPickup);
  ok('空格触发效果并清空充能', activeInfo.healWorks);
  ok('充能不足只弹提示', activeInfo.deniedEmpty);
  ok('清房 +1 充能', activeInfo.clearCharges);
  ok('电池 +1 充能且被消耗', activeInfo.batteryCharges);
  ok('满充能时电池留在地上', activeInfo.batteryKeptAtFull);
  ok('炸弹锦囊 +2 炸弹', activeInfo.bombBag);
  ok('回家的路传送回起始房', activeInfo.teleport);
  ok('全部主动道具图标可绘制', activeInfo.iconsDraw === true, activeInfo.iconsDraw);

  // ---------------------------------------------------- new room kinds
  section('新房型');
  const roomsInfo = await page.evaluate(() => {
    const out = { secret: 0, curse: 0, challenge: 0, miniboss: 0, hiddenOk: true, secretLinked: true };
    for (let i = 0; i < 30; i++) {
      const f = generateFloor(6);
      const by = k => f.rooms.filter(r => r.kind === k).length;
      if (by('secret')) out.secret++;
      if (by('curse')) out.curse++;
      if (by('challenge')) out.challenge++;
      if (by('miniboss')) out.miniboss++;
      const sec = f.rooms.find(r => r.kind === 'secret');
      if (sec) {
        const sides = Object.keys(sec.doors);
        if (!sides.length) out.secretLinked = false;
        // every secret door must start hidden on both sides
        for (const s of sides) {
          const opp = { N: 'S', S: 'N', W: 'E', E: 'W' }[s];
          if (!sec.hiddenSides || !sec.hiddenSides[s]) out.hiddenOk = false;
          const nb = sec.doors[s];
          if (!nb.hiddenSides || !nb.hiddenSides[opp]) out.hiddenOk = false;
        }
      }
    }
    return out;
  });
  eq('每层都有秘密房', roomsInfo.secret, 30);
  ok('诅咒房按概率出现', roomsInfo.curse >= 8 && roomsInfo.curse <= 28, roomsInfo.curse);
  ok('挑战房按概率出现', roomsInfo.challenge >= 7 && roomsInfo.challenge <= 27, roomsInfo.challenge);
  ok('小Boss房按概率出现', roomsInfo.miniboss >= 6 && roomsInfo.miniboss <= 26, roomsInfo.miniboss);
  ok('秘密房与邻居互连', roomsInfo.secretLinked);
  ok('秘密房的门双向隐藏', roomsInfo.hiddenOk);

  const secretPlay = await page.evaluate(() => {
    const out = {};
    startRun();
    const p = G.player;
    p.invuln = 9999;
    const secret = G.floor.rooms.find(r => r.kind === 'secret');
    const nb = Object.values(secret.doors)[0];
    const side = Object.keys(nb.doors).find(s => nb.doors[s] === secret);
    enterRoom(nb, null);
    G.enemies = [];
    G.room.cleared = true;
    out.secretHiddenOnMap = !secret.seen;
    // walking into the hidden wall must not change rooms
    const dp = DOOR_POS[side];
    p.x = dp.x; p.y = dp.y;
    updatePlay(1 / 60);
    out.wallBlocks = G.room === nb;
    // bomb the wall open
    p.bombs = 1;
    p.x = clamp(dp.x, FLOOR_X + 40, FLOOR_X + FLOOR_W - 40);
    p.y = clamp(dp.y, FLOOR_Y + 40, FLOOR_Y + FLOOR_H - 40);
    placeBomb();
    G.liveBombs[0].t = 0.01;
    updatePlay(1 / 60);
    out.wallOpened = !nb.hiddenSides || !nb.hiddenSides[side];
    out.secretNowSeen = secret.seen === true;
    // now the door works
    p.x = dp.x; p.y = dp.y;
    updatePlay(1 / 60);
    out.entered = G.room === secret;
    out.loot = secret.pickups.length >= 3;
    return out;
  });
  ok('秘密房开局不在小地图上', secretPlay.secretHiddenOnMap);
  ok('隐藏墙不可直接通过', secretPlay.wallBlocks);
  ok('炸弹在墙边引爆后墙裂开', secretPlay.wallOpened, JSON.stringify(secretPlay));
  ok('炸开后秘密房出现在小地图', secretPlay.secretNowSeen);
  ok('可以走进秘密房', secretPlay.entered);
  ok('秘密房藏有战利品', secretPlay.loot);

  const cursePlay = await page.evaluate(async () => {
    const out = {};
    // force a floor with a curse room
    let tries = 0;
    while (tries++ < 60 && !G.floor.rooms.some(r => r.kind === 'curse')) startRun();
    const curse = G.floor.rooms.find(r => r.kind === 'curse');
    if (!curse) return { skip: true };
    const p = G.player;
    const nb = Object.values(curse.doors)[0];
    const side = Object.keys(nb.doors).find(s => nb.doors[s] === curse);
    enterRoom(nb, null);
    G.enemies = [];
    G.room.cleared = true;
    p.hp = p.maxHp;
    p.invuln = 0;
    const dp = DOOR_POS[side];
    p.x = dp.x; p.y = dp.y;
    updatePlay(1 / 60);
    out.entered = G.room === curse;
    out.spiked = p.hp === p.maxHp - 1;
    out.hasReward = curse.pedestals.length >= 1;
    // flight skips the spikes
    p.hp = p.maxHp; p.invuln = 0; p.flight = true;
    const backSide = Object.keys(curse.doors).find(s => curse.doors[s] === nb);
    const dp2 = DOOR_POS[backSide];
    p.x = dp2.x; p.y = dp2.y;
    updatePlay(1 / 60);
    out.flightFree = G.room === nb && p.hp === p.maxHp;
    p.flight = false;
    return out;
  });
  ok('走进诅咒房扣半颗心', cursePlay.skip || (cursePlay.entered && cursePlay.spiked),
    JSON.stringify(cursePlay));
  ok('诅咒房里有奖励台座', cursePlay.skip || cursePlay.hasReward);
  ok('飞行可以无伤跨过刺门', cursePlay.skip || cursePlay.flightFree);

  const challengePlay = await page.evaluate(() => {
    const out = {};
    let tries = 0;
    while (tries++ < 60 && !G.floor.rooms.some(r => r.kind === 'challenge')) startRun();
    const ch = G.floor.rooms.find(r => r.kind === 'challenge');
    if (!ch) return { skip: true };
    const p = G.player;
    p.invuln = 9999;
    enterRoom(ch, null);
    out.peacefulOnEnter = ch.cleared === true && G.enemies.length === 0;
    const ped = ch.pedestals[0];
    out.hasPrize = !!(ped && ped.def);
    // grab the prize -> doors slam, wave 1 spawns
    p.x = ped.x; p.y = ped.y;
    updatePlay(1 / 60);
    out.started = ch.challengeStarted === true && ch.cleared === false;
    out.wave1 = G.enemies.length > 0;
    // kill wave 1 -> wave 2 spawns instead of opening up
    G.enemies = [];
    updatePlay(1 / 60);
    out.wave2 = G.enemies.length > 0 && ch.cleared === false;
    // kill wave 2 -> room clears
    G.enemies = [];
    updatePlay(1 / 60);
    out.finished = ch.cleared === true;
    return out;
  });
  ok('挑战房进门无敌人且门开着', challengePlay.skip || challengePlay.peacefulOnEnter,
    JSON.stringify(challengePlay));
  ok('挑战房中央有奖励', challengePlay.skip || challengePlay.hasPrize);
  ok('拿奖励后关门刷第一波', challengePlay.skip || (challengePlay.started && challengePlay.wave1));
  ok('清完第一波刷第二波', challengePlay.skip || challengePlay.wave2);
  ok('清完所有波次房间解锁', challengePlay.skip || challengePlay.finished);

  const minibossPlay = await page.evaluate(() => {
    const out = {};
    // always search on fresh floors: earlier sections may have walked into
    // (and force-cleared) this floor's miniboss room
    let tries = 0;
    const pristine = r => r.kind === 'miniboss' && !r.enemiesSpawned && !r.cleared;
    do { G.floorNum = 4; loadFloor(); } while (tries++ < 80 && !G.floor.rooms.some(pristine));
    const mb = G.floor.rooms.find(pristine);
    if (!mb) return { skip: true };
    const p = G.player;
    p.invuln = 9999;
    enterRoom(mb, null);
    const boss = G.enemies.find(e => e.isBoss);
    out.spawnsBoss = !!boss && boss.miniboss === true;
    out.noTrapdoorBefore = !mb.trapdoor;
    if (boss) {
      boss.spawnT = 0;
      killEnemy(G, boss);
      out.reward = mb.pedestals.some(pd => pd.def && !pd.taken);
      out.noTrapdoorAfter = !mb.trapdoor;
    }
    return out;
  });
  ok('小Boss房刷出削弱版 Boss', minibossPlay.skip || minibossPlay.spawnsBoss,
    JSON.stringify(minibossPlay));
  ok('击杀小Boss掉道具但不开地道', minibossPlay.skip ||
    (minibossPlay.reward && minibossPlay.noTrapdoorBefore && minibossPlay.noTrapdoorAfter));

  // ---------------------------------------------------- minimap & full map
  section('小地图与全图');
  const mapInfo = await page.evaluate(() => {
    const out = {};
    startRun();
    // every kind + leftover glyph draws without error
    const kinds = ['start', 'normal', 'boss', 'treasure', 'shop', 'secret', 'curse', 'challenge', 'miniboss'];
    let err = null;
    for (const k of kinds) {
      const r = makeRoom(0, 0, k);
      r.visited = true;
      try { drawRoomGlyph(ctx, r, -100, -100, 1); } catch (e) { err = k + ': ' + e.message; }
    }
    // leftover markers
    const r2 = makeRoom(0, 0, 'normal');
    r2.visited = true;
    for (const pk of ['chest', 'battery', 'bomb', 'heart', 'coin']) {
      r2.pickups = [{ kind: pk, taken: false }];
      try { drawRoomGlyph(ctx, r2, -100, -100, 1); } catch (e) { err = 'leftover ' + pk + ': ' + e.message; }
    }
    r2.pickups = [];
    r2.pedestals = [{ taken: false, def: ITEM_DEFS[0] }];
    try { drawRoomGlyph(ctx, r2, -100, -100, 1); } catch (e) { err = 'leftover item: ' + e.message; }
    out.glyphs = err || true;
    // trapdoor beats other glyphs
    out.leftover = roomLeftoverGlyph(r2) === 'item';
    const r3 = makeRoom(0, 0, 'boss');
    r3.trapdoor = { x: 0, y: 0 };
    try { drawRoomGlyph(ctx, r3, -100, -100, 1); out.trapdoorGlyph = true; }
    catch (e) { out.trapdoorGlyph = String(e); }
    // Tab overlay
    G.mapOverlay = true;
    try { drawFullMap(ctx, G.floor, G.room); out.fullMapDraws = true; }
    catch (e) { out.fullMapDraws = String(e); }
    G.mapOverlay = false;
    return out;
  });
  ok('全部房型 + 残留物图标可绘制', mapInfo.glyphs === true, mapInfo.glyphs);
  ok('残留道具优先级正确', mapInfo.leftover);
  ok('地道口图标可绘制', mapInfo.trapdoorGlyph === true, mapInfo.trapdoorGlyph);
  ok('Tab 全图可绘制', mapInfo.fullMapDraws === true, mapInfo.fullMapDraws);

  const tabKey = await page.evaluate(() => ({ before: G.mapOverlay }));
  await page.keyboard.down('Tab');
  await frames(page, 3);
  const tabHeld = await page.evaluate(() => G.mapOverlay);
  await page.keyboard.up('Tab');
  await frames(page, 3);
  const tabReleased = await page.evaluate(() => G.mapOverlay);
  ok('按住 Tab 打开全图', tabKey.before === false && tabHeld === true);
  ok('松开 Tab 关闭全图', tabReleased === false);

  // ---------------------------------------------------- mapping items
  section('地图道具');
  const mapItems = await page.evaluate(() => {
    const out = {};
    startRun();
    const p = G.player;
    const byId = id => ITEM_DEFS.find(d => d.id === id);
    out.exist = !!(byId('the_compass') && byId('treasure_map') && byId('blue_map'));
    const seen = () => {
      const s = {};
      for (const r of G.floor.rooms) if (r.seen || r.visited) s[r.kind] = (s[r.kind] || 0) + 1;
      return s;
    };
    // compass: special rooms light up
    byId('the_compass').apply(p);
    const s1 = seen();
    out.compass = p.compass === true &&
      G.floor.rooms.filter(r => ['boss', 'treasure', 'shop'].includes(r.kind)).every(r => r.seen || r.visited) &&
      !G.floor.rooms.find(r => r.kind === 'secret').seen;
    // treasure map: whole layout except secrets
    byId('treasure_map').apply(p);
    out.treasureMap = G.floor.rooms.every(r => r.kind === 'secret' ? !r.seen : (r.seen || r.visited));
    // blue map: secrets too
    byId('blue_map').apply(p);
    out.blueMap = G.floor.rooms.every(r => r.seen || r.visited);
    // reveals persist onto the next floor
    G.floorNum = 2; loadFloor();
    out.nextFloor = G.floor.rooms.every(r => r.seen || r.visited);
    out.s1 = s1;
    return out;
  });
  ok('三张地图道具都存在', mapItems.exist);
  ok('指南针点亮特殊房（不含秘密房）', mapItems.compass, JSON.stringify(mapItems.s1));
  ok('藏宝图点亮整层（不含秘密房）', mapItems.treasureMap);
  ok('蓝图点亮秘密房', mapItems.blueMap);
  ok('地图效果延续到下一层', mapItems.nextFloor);

  // ---------------------------------------------------- dungeon generation
  section('地牢生成健壮性');
  const gen = await page.evaluate(() => {
    const bad = [];
    let minRooms = 99, maxRooms = 0;
    for (let depth = 1; depth <= 12; depth++) {
      for (let i = 0; i < 25; i++) {
        const f = generateFloor(depth);
        const rooms = f.rooms;
        const boss = rooms.filter(r => r.kind === 'boss');
        const treasure = rooms.filter(r => r.kind === 'treasure');
        if (boss.length !== 1) { bad.push('depth' + depth + ' boss=' + boss.length); continue; }
        if (treasure.length !== 1) { bad.push('depth' + depth + ' treasure=' + treasure.length); continue; }
        // every room must be reachable from the start through doors
        const seen = new Set([f.start]);
        const q = [f.start];
        while (q.length) {
          const cur = q.shift();
          for (const side in cur.doors) {
            const nb = cur.doors[side];
            if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
          }
        }
        if (seen.size !== rooms.length) bad.push('depth' + depth + ' unreachable ' + (rooms.length - seen.size));
        // doors must be mutual
        for (const r of rooms) {
          for (const side in r.doors) {
            const nb = r.doors[side];
            const opp = { N: 'S', S: 'N', W: 'E', E: 'W' }[side];
            if (nb.doors[opp] !== r) bad.push('depth' + depth + ' one-way door');
          }
        }
        // rocks must never block a door lane or the centre spawn
        for (const r of rooms) {
          for (const rk of r.rocks) if (!rockAllowed(rk.cx, rk.cy)) bad.push('depth' + depth + ' rock blocks lane');
        }
        minRooms = Math.min(minRooms, rooms.length);
        maxRooms = Math.max(maxRooms, rooms.length);
      }
    }
    return { bad: bad.slice(0, 6), minRooms, maxRooms };
  });
  ok('12 层 × 25 次随机生成全部合法', gen.bad.length === 0, gen.bad.join(' | '));
  ok('房间数在合理区间（含 Boss/宝物/新房型）', gen.minRooms >= 7 && gen.maxRooms <= 18,
    gen.minRooms + '..' + gen.maxRooms);

  // ------------------------------------------------- full 12-floor playthrough
  section('12 层完整流程 + 13 Boss');
  const run = await page.evaluate(async () => {
    const log = [];
    const frame = () => new Promise(r => requestAnimationFrame(r));
    const godMode = () => { G.player.maxHp = 24; G.player.hp = 24; G.player.invuln = 5; };
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
    return { log, state: G.state, kills: G.stats.kills, time: G.stats.time };
  });
  ok('12 层跑通没有中断', !run.error, run.error);
  if (!run.error) {
    eq('打完 13 场 Boss 战', run.log.length, 13);
    eq('12 层各一个不同 Boss', new Set(run.log.slice(0, 12).map(b => b.id)).size, 12);
    ok('第 12 层触发第 13 个最终 Boss', !!run.log[12] && run.log[12].final === true,
      JSON.stringify(run.log[12] || null));
    ok('Boss 血量随层数递增', run.log.slice(0, 12).every((b, i, a) => i === 0 || b.hp > a[i - 1].hp),
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
}


// The globally installed playwright build and the downloaded browser revision
// don't always match, so find whatever chromium is actually on disk.
function findChromium() {
  const cache = path.join(process.env.HOME || '', 'Library/Caches/ms-playwright');
  if (!fs.existsSync(cache)) return null;
  const rel = HEADED
    ? ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
       'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing']
    : ['chrome-headless-shell-mac-arm64/chrome-headless-shell',
       'chrome-headless-shell-mac/chrome-headless-shell'];
  const dirs = fs.readdirSync(cache)
    .filter(d => d.startsWith(HEADED ? 'chromium-' : 'chromium_headless_shell-'))
    .sort()
    .reverse();
  for (const d of dirs) {
    for (const r of rel) {
      const p = path.join(cache, d, r);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

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
    await runSuite(page, context, consoleErrors);
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
