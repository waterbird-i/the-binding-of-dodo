'use strict';
const { section, ok, eq, near, frames, state, luma, press, ROOT, INDEX_URL } = require('../helpers.cjs');

module.exports = async ({ page, context, consoleErrors }) => {
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
    out.shotCurve = enemyShotDamage(1) === 1 && enemyShotDamage(4) === 1 &&
      enemyShotDamage(6) === 3 && enemyShotDamage(12) === 4;

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
  ok('敌方子弹伤害 5-10 层 1.5 心、11-12 层 2 心', mech.shotCurve === true);
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
};
