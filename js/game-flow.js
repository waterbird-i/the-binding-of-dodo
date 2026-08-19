'use strict';
// ---------------- run / floor / room flow ----------------
function startRun() {
  G.player = makePlayer(CHAR_DEFS[G.charIdx].id);
  G.newUnlocks = [];
  G.unlockPopups = [];
  G.unlockPanel = false;
  G.hardFloor = false;
  G.dumateOffer = null;
  G.dumateWin = false;
  G.dumateExec = null;
  G.dumatePreTime = 0;
  G.floorNum = 1;
  G.paused = false;
  G.stats = { kills: 0, items: 0, startTime: performance.now(), time: 0 };
  G.toast = null;
  // the run seed: typed on the menu or rolled fresh. A hand-picked seed makes
  // the run reproducible, so it's fenced off from leaderboard + unlocks the
  // same way dev mode is.
  const custom = !!G.pendingSeedStr;
  G.seedStr = custom ? G.pendingSeedStr : randomSeedString();
  G.pendingSeedStr = null;
  G.runSeed = seedFromString(G.seedStr);
  G.devTainted = custom;
  LB.submitState = null;
  loadFloor();
  if (custom) G.toast = { title: '种子局 · ' + G.seedStr, desc: '本局不计入排行榜与解锁', t: 3.2 };
  G.state = 'play';
  SFX.start();
}

function loadFloor() {
  applyFloorTheme(G.floorNum);
  // the whole layout roll runs on a per-floor stream derived from the run
  // seed: same seed -> same floors, no matter how the previous floor went
  G.floor = withRng(floorSeed(G.runSeed, G.floorNum, 0),
    () => generateFloor(G.floorNum, G.hardFloor));
  // floor curse roll (its own salt so adding curses never reshuffles layouts)
  G.floorCurse = null;
  if (G.floorNum >= 2) {
    withRng(floorSeed(G.runSeed, G.floorNum, 777), () => {
      if (chance(0.3)) G.floorCurse = pick(Object.keys(FLOOR_CURSES));
    });
  }
  G.floorDamage = 0;   // an untouched floor unlocks 神之首 on the way down
  // 赌徒 dodo: reroll this floor's fortune (seeded so runs stay reproducible)
  if (G.player && G.player.charId === 'gambler') {
    withRng(floorSeed(G.runSeed, G.floorNum, 4242), () => rollGamble(G.player));
  }
  revealFloorMap();   // mapping items keep working on every new floor
  // brief location card: floor name + how deep into the run you are
  G.floorIntro = { name: FLOOR_NAMES[G.floorNum - 1] || 'BASEMENT', num: G.floorNum,
    hard: G.hardFloor, curse: G.floorCurse, t: 3.0, max: 3.0 };
  enterRoom(G.floor.start, null);
}

function enterRoom(room, fromSide) {
  if (fromSide) SFX.door();
  G.room = room;
  G.tears = [];
  G.eshots = [];
  G.beams = [];
  G.lasers = [];
  G.particles = [];
  G.enemies = [];
  G.liveBombs = [];
  // Holy Mantle: shield recharges on every room change
  if (G.player.shieldMax > 0) G.player.shieldUp = true;
  room.visited = true;
  for (const side in room.doors) {
    if (room.hiddenSides && room.hiddenSides[side]) continue;  // secret walls stay secret
    room.doors[side].seen = true;
  }
  if (!room._base) buildRoomBase(room);

  const p = G.player;
  if (fromSide === 'N') { p.x = W / 2; p.y = FLOOR_Y + 40; }
  else if (fromSide === 'S') { p.x = W / 2; p.y = FLOOR_Y + FLOOR_H - 40; }
  else if (fromSide === 'W') { p.x = FLOOR_X + 40; p.y = H / 2; }
  else if (fromSide === 'E') { p.x = FLOOR_X + FLOOR_W - 40; p.y = H / 2; }
  else { p.x = W / 2; p.y = H / 2 + 60; }
  p.vx = 0; p.vy = 0;
  // keep the trinket entourage on top of the player after a room change
  for (const o of G.orbits) { o.x = p.x; o.y = p.y; }
  for (const f of G.familiars) { f.x = p.x; f.y = p.y; }

  // shop: stock the shelves on first visit (excludes items already taken).
  // Item rolls run on a room-seeded stream: with the same run seed and the
  // same items in the bag, the same wares appear.
  if (room.kind === 'shop' && !room.shopStocked) {
    withRng(floorSeed(G.runSeed, G.floorNum, room.seed + G.player.itemsTaken.length * 131),
      () => stockShop(room, G.floorNum));
  }

  if (!room.cleared && !room.enemiesSpawned) {
    spawnRoomEnemies(room);
    room.enemiesSpawned = true;
  }
  // resolve pending random pedestal items (same seeded-stream rule as shops)
  withRng(floorSeed(G.runSeed, G.floorNum, room.seed + G.player.itemsTaken.length * 977),
    () => resolvePedestals(room, G.player));
}

// enemy mix per chapter — deeper floors trade fodder for ranged pressure,
// lasers, armor and death-bombs
function roomEnemyPool(depth) {
  if (depth <= 2) return ['gaper', 'gaper', 'fly', 'hopper'];
  if (depth <= 4) return ['gaper', 'fly', 'fly', 'hopper', 'spitter', 'boomfly'];
  if (depth <= 6) return ['gaper', 'fly', 'hopper', 'spitter', 'sentry', 'globin', 'boomfly'];
  if (depth <= 8) return ['gaper', 'hopper', 'spitter', 'sentry', 'globin', 'knight', 'vis'];
  if (depth <= 10) return ['gaper', 'spitter', 'sentry', 'hopper', 'knight', 'vis', 'boomfly'];
  return ['spitter', 'sentry', 'globin', 'knight', 'vis', 'boomfly', 'sentry'];
}

function spawnRoomEnemies(room) {
  const depth = G.floorNum;
  if (room.kind === 'boss') {
    G.bossFightHurt = false;   // a clean fight from here unlocks 王者印记
    const def = bossDefForFloor(depth);
    G.enemies.push(makeBoss(def, W / 2, H / 2 - 40));
    room.bossDef = def;
    return;
  }
  // mini-boss: an earlier floor's boss at reduced hp, ambushing a normal room
  if (room.kind === 'miniboss') {
    const def = bossDefForFloor(Math.max(1, depth - 2));
    const b = makeBoss(def, W / 2, H / 2 - 40);
    b.miniboss = true;
    b.hp *= 0.5;
    b.maxHpRef = b.hp;
    b.name = '小 ' + def.name;
    G.enemies.push(b);
    room.bossDef = def;
    return;
  }
  // exponential-ish pressure curve: room population compounds with depth;
  // the shopkeeper only hires a small guard detail
  const n = room.kind === 'shop'
    ? Math.min(5, randi(2, 3) + Math.floor(depth / 5))
    : Math.min(10, (depth <= 2 ? randi(2, 4) : randi(3, 5)) + Math.floor(Math.pow(depth, 1.35) / 3)
      + (G.floor.hard ? 1 : 0));
  const types = roomEnemyPool(depth);
  const wares = room.shopItems || [];
  for (let i = 0; i < n; i++) {
    let x, y, tries = 0;
    do {
      x = rand(FLOOR_X + 60, FLOOR_X + FLOOR_W - 60);
      y = rand(FLOOR_Y + 60, FLOOR_Y + FLOOR_H - 60);
      tries++;
    } while (tries < 30 && (dist(x, y, G.player.x, G.player.y) < 190 || pointHitsRock(room, x, y) ||
      wares.some(w => dist(x, y, w.x, w.y) < 80)));
    G.enemies.push(makeEnemy(pick(types), x, y, depth));
  }
}

// one wave of a challenge room: a burst of enemies teleporting in around the walls
function spawnChallengeWave(room) {
  const depth = G.floorNum;
  const n = Math.min(8, randi(3, 4) + Math.floor(depth / 3));
  const types = roomEnemyPool(depth);
  for (let i = 0; i < n; i++) {
    let x, y, tries = 0;
    do {
      x = rand(FLOOR_X + 60, FLOOR_X + FLOOR_W - 60);
      y = rand(FLOOR_Y + 60, FLOOR_Y + FLOOR_H - 60);
      tries++;
    } while (tries < 30 && (dist(x, y, G.player.x, G.player.y) < 170 || pointHitsRock(room, x, y)));
    G.enemies.push(makeEnemy(pick(types), x, y, depth));
  }
}

function onRoomCleared(room) {
  room.cleared = true;
  G.shake = Math.max(G.shake, 4);
  SFX.doorOpen();
  // every cleared fight charges the spacebar item by one bar
  addActiveCharge(G.player, 1);
  if (!G.devTainted) metaSave();   // persist the kill totals earned this room
  // room clear reward, Isaac style
  const roll = Math.random();
  const cx = clamp(G.player.x, FLOOR_X + 60, FLOOR_X + FLOOR_W - 60);
  const cy = clamp(G.player.y, FLOOR_Y + 60, FLOOR_Y + FLOOR_H - 60);
  // healing stays rare on every floor: room-clear half-hearts are 6%, flat
  const heartChance = 0.06;
  if (roll < 0.12) room.pickups.push(makePickup('chest', W / 2, H / 2));
  else if (roll < 0.3) room.pickups.push(makePickup('coin', cx, cy - 50));
  else if (roll < 0.3 + heartChance) room.pickups.push(makePickup('halfheart', cx, cy - 50));
  else if (roll < 0.44 + heartChance) room.pickups.push(makePickup('bomb', cx, cy - 50));
  else if (roll < 0.5 + heartChance) room.pickups.push(makePickup('battery', cx, cy - 50));
  else if (roll < 0.52 + heartChance) room.pickups.push(makePickup('soulheart', cx, cy - 50));
}

// escalating altar payouts: coins first, then soul hearts, then real items —
// the seventh offering rolls the devil pool and retires the altar
function sacrificeReward(room, n) {
  const cx = W / 2, cy = H / 2;
  if (n === 1) {
    room.pickups.push(makePickup('coin', cx - 80, cy + 70));
    G.toast = { title: '献祭 ×1', desc: '祭坛收下了你的血…', t: 1.6 };
  } else if (n === 2) {
    room.pickups.push(makePickup('coin', cx + 80, cy + 70));
    room.pickups.push(makePickup('coin', cx + 100, cy + 50));
    G.toast = { title: '献祭 ×2', desc: '血滴在渗进石缝…', t: 1.6 };
  } else if (n === 3) {
    room.pickups.push(makePickup('soulheart', cx, cy - 90));
    G.toast = { title: '献祭 ×3', desc: '一颗魂心浮出祭坛!', t: 2.0 };
  } else if (n === 4) {
    room.pickups.push(makePickup(chance(0.5) ? 'bomb' : 'battery', cx - 90, cy - 70));
    G.toast = { title: '献祭 ×4', desc: '祭坛吐出了一点存货…', t: 1.6 };
  } else if (n === 5) {
    spawnItemPedestal(room, cx - 110, cy - 90, 'treasure');
    resolvePedestals(room, G.player);
    G.toast = { title: '献祭 ×5', desc: '祭坛显灵了 一件宝物浮现!', t: 2.4 };
    SFX.chest();
  } else if (n === 6) {
    room.pickups.push(makePickup('soulheart', cx + 90, cy - 70));
    G.toast = { title: '献祭 ×6', desc: '又一颗魂心…它还想要更多', t: 2.0 };
  } else {
    spawnItemPedestal(room, cx + 110, cy - 90, 'devil');
    resolvePedestals(room, G.player);
    room.altarDone = true;
    G.toast = { title: '献祭 ×7', desc: '恶魔的馈赠! 祭坛沉寂了', t: 2.8 };
    SFX.chest();
  }
}

function onBossKilled(Gm, boss) {
  const room = Gm.room;
  // a dead boss takes its sweeping lasers with it
  Gm.lasers = Gm.lasers.filter(l => !l.src || (l.src !== boss && Object.getPrototypeOf(l.src) !== boss));
  // meta: an unhurt boss fight unlocks 王者印记 (each fight of the final chain counts)
  if (!Gm.bossFightHurt) metaEvent('no_damage_boss');
  // Dark Room: killing the floor boss summons the true final boss instead of
  // ending the run — that second fight is boss #13.
  if (Gm.floorNum >= FLOOR_COUNT && boss && !boss.def.final) {
    Gm.shake = 20;
    Gm.toast = { title: FINAL_BOSS_DEF.name, desc: '最终之影现身了!', t: 3 };
    Gm.enemies.push(makeBoss(FINAL_BOSS_DEF, W / 2, H / 2 - 40));
    room.bossDef = FINAL_BOSS_DEF;
    Gm.bossFightHurt = false;   // the summoned fight is judged on its own
    SFX.bossDie();
    return;
  }
  room.bossKilled = true;
  // 隐藏终极 Boss 的血条被清零——但它不会就这样死掉（见斩杀演出）
  if (boss && boss.def.dumate) {
    startDumateExecution(Gm);
    return;
  }
  // devil deal: the boss's death sometimes cracks open a black door next to
  // the boss room. Fighting clean pleases the devil — no damage doubles the
  // odds, Isaac style.
  if (Gm.floorNum < FLOOR_COUNT && !room.devilSpawned) {
    room.devilSpawned = true;
    if (Gm.player.charId === 'dark' || chance(Gm.bossFightHurt ? 0.33 : 0.66)) {
      const dr = attachRoomToFloor(Gm.floor, room, 'devil');
      if (dr) {
        dr.seen = true;
        // two deals from the devil pool, paid in hearts (see devilDealPay)
        dr.pedestals.push({ x: W / 2 - 85, y: H / 2 + 55, def: null, anim: rand(10), taken: false,
          pendingRandom: true, pool: 'devil', devilPrice: 1 });
        dr.pedestals.push({ x: W / 2 + 85, y: H / 2 + 55, def: null, anim: rand(10), taken: false,
          pendingRandom: true, pool: 'devil', devilPrice: 2 });
        // the devil occasionally leaves a soul heart lying by the candles
        if (chance(0.3)) dr.pickups.push({ kind: 'soulheart', x: W / 2, y: H / 2 + 130, anim: rand(10), taken: false });
        Gm.toast = { title: '恶魔的低语', desc: '一扇黑门在附近裂开了…', t: 3.0 };
      }
    }
  }
  if (Gm.floorNum >= FLOOR_COUNT) {
    // MEGA dodo 倒下：先记下「这个角色通关过」。全部角色都通关后，每次
    // 击杀 MEGA dodo 都会弹出 dumate 的终极抉择（不止最后那一局——练废了
    // 还能再来，这是对用户初版触发方式的优化）。
    if (!Gm.devTainted && Gm.player) {
      META.charWins[Gm.player.charId] = true;
      metaSave();
    }
    if (allCharsCleared()) {
      openDumateOffer(Gm, boss);
      return;
    }
    finishRunWin(Gm, false, null);
  } else if (BRANCH_FLOORS[Gm.floorNum]) {
    // the fork: a safe hatch on the left, a spiked one on the right
    room.trapdoor = { x: W / 2 - 110, y: H / 2 };
    room.trapdoorHard = { x: W / 2 + 110, y: H / 2 };
    Gm.toast = { title: '两条路', desc: '左门安稳　右门凶险 但宝物翻倍', t: 3.4 };
    spawnItemPedestal(room, W / 2, H / 2 + 95);
    if (Gm.floor.hard) spawnItemPedestal(room, W / 2 - 90, H / 2 + 95);
    resolvePedestals(room, Gm.player);
  } else {
    room.trapdoor = { x: W / 2, y: H / 2 };
    // reward pedestal next to trapdoor — the risky floor pays double here too
    spawnItemPedestal(room, W / 2 + 90, H / 2);
    if (Gm.floor.hard) spawnItemPedestal(room, W / 2 - 90, H / 2);
    resolvePedestals(room, Gm.player);
  }
}

// 通关结算：普通通关与 dumate 讨伐共用。timeOverride 用于「见好就收」——
// 抉择界面上思考的时间不该算进通关成绩。
function finishRunWin(Gm, dumate, timeOverride) {
  Gm.stats.time = timeOverride != null ? timeOverride : (performance.now() - Gm.stats.startTime) / 1000;
  Gm.state = 'win';
  Gm.dumateWin = !!dumate;
  if (!Gm.devTainted) {
    // 讨伐 dumate 的记录拆两段：主用时用击杀 MEGA dodo 的成绩（与
    // 「见好就收」同一口径，两种通关在榜上可比），讨伐 dumate 的用时
    // 作为附加段记在括号里
    if (dumate && Gm.dumatePreTime > 0) {
      lbSubmitWin(Gm.dumatePreTime, Math.max(0, Gm.stats.time - Gm.dumatePreTime));
    } else {
      lbSubmitWin(Gm.stats.time);
    }
    META.totals.wins++;
    if (Gm.floorDamage === 0) metaEvent('no_damage_floor');
    if (dumate) metaEvent('dumate_win');
    metaEvent('win');
    metaSave();
  }
  SFX.win();
}

// ---------------- dumate：隐藏终极 Boss 的抉择与登场 ----------------
// 触发：全部角色都通关过（META.charWins），任意一局击杀 MEGA dodo 之后。
// 挑战 → 就地继续打 dumate；清空它的血条会触发斩杀演出（见下），按击杀
//        那一刻的用时结算，排行榜记「击杀 MEGA dodo 用时+(讨伐用时)」；
// 收手 → 按击杀 MEGA dodo 那一刻的用时立即结算进排行榜。
function openDumateOffer(Gm, megaBoss) {
  Gm.stats.time = (performance.now() - Gm.stats.startTime) / 1000;   // 收手时用的成绩快照
  Gm.dumateOffer = { sel: 0, megaHp: megaBoss.maxHpRef, openedAt: performance.now() };
  Gm.state = 'dumateOffer';
  releaseInput();
  Gm.shake = Math.max(Gm.shake, 12);
  SFX.bossDie();
}

function resolveDumateOffer(accept) {
  const off = G.dumateOffer;
  if (!off || G.state !== 'dumateOffer') return;
  // 开场保护：Boss 战里连打的确认键 / 连点不该替玩家做这个决定
  if (performance.now() - off.openedAt < 900) return;
  G.dumateOffer = null;
  if (!accept) {
    finishRunWin(G, false, G.stats.time);
    return;
  }
  // 抉择界面上思考的时间不计入通关用时
  G.stats.startTime += performance.now() - off.openedAt;
  G.dumatePreTime = G.stats.time;   // 排行榜主用时：击杀 MEGA dodo 的成绩
  G.state = 'play';
  const d = makeBoss(DUMATE_DEF, W / 2, H / 2 - 40);
  d.hp = d.maxHpRef = Math.round(off.megaHp * 20);   // 用户设定：MEGA dodo 的 20 倍
  G.enemies.push(d);
  G.room.bossDef = DUMATE_DEF;
  G.room.bossKilled = false;
  G.bossFightHurt = false;      // dumate 战单独评无伤
  // 决战前最后的补给
  G.room.pickups.push(makePickup('soulheart', W / 2 - 120, H / 2 + 120));
  G.room.pickups.push(makePickup('soulheart', W / 2 + 120, H / 2 + 120));
  G.toast = { title: 'dumate', desc: '终极之影现身了……祝你好运', t: 3.2 };
  G.shake = 22;
  SFX.bossDie();
}

// ---------------- dumate：斩杀演出 ----------------
// 击杀判定成立，账也按通关记，但它没有死：血条清零的瞬间本体消失，
// 随即瞬移到 dodo 面前给出一记斩杀特写，最后交出一张死亡样式的结算纸。
// 用时按击杀那一刻快照，演出时长不计入成绩。
function startDumateExecution(Gm) {
  Gm.enemies = Gm.enemies.filter(e => !e.dead);
  Gm.eshots = []; Gm.lasers = []; Gm.beams = [];
  Gm.toast = null;
  Gm.dumateExec = { t: 0, slashed: false,
    killTime: (performance.now() - Gm.stats.startTime) / 1000 };
  Gm.state = 'dumateExec';
  releaseInput();
  Gm.shake = Math.max(Gm.shake, 18);
  SFX.bossDie();
}

function updateDumateExec(dt) {
  const ex = G.dumateExec;
  if (!ex) return;
  ex.t += dt;
  if (!ex.slashed && ex.t >= 1.6) {   // 斩击落下
    ex.slashed = true;
    G.shake = Math.max(G.shake, 20);
    SFX.laser();
    SFX.death();
  }
  if (ex.t >= 3.4) {                  // 演出收尾，按击杀时刻的用时结算
    G.dumateExec = null;
    finishRunWin(G, true, ex.killTime);
  }
}

function onPlayerDeath(Gm) {
  Gm.stats.time = (performance.now() - Gm.stats.startTime) / 1000;
  Gm.state = 'dead';
  if (!Gm.devTainted) {
    META.totals.deaths++;
    metaEvent('death');
    metaSave();
  }
  Gm.shake = 14;
  SFX.death();
}

function nextFloor(hard) {
  // leaving a floor without ever bleeding on it unlocks 神之首
  if (G.floorDamage === 0) metaEvent('no_damage_floor');
  G.hardFloor = !!hard;
  G.floorNum++;
  loadFloor();
  SFX.stairs();
}

