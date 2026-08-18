'use strict';
// --- enemies ---
// Exponential difficulty curve: hp compounds per floor instead of the old
// linear ramp, and touch damage / shot damage step up with depth.
function enemyHpScale(depth) {
  // a second exponent kicks in after floor 6 so a scaled build keeps meeting
  // resistance instead of one-shotting every room in the late chapters
  return Math.pow(1.22, depth - 1) * Math.pow(1.14, Math.max(0, depth - 6));
}
function enemyTouchDamage(depth) { return 1 + Math.floor((depth - 1) / 4); } // 1 → 2 → 3
function enemyShotDamage(depth) { return depth >= 11 ? 4 : (depth >= 5 ? 3 : 1); }

function makeEnemy(type, x, y, depth = 1) {
  const hard = typeof G !== 'undefined' && G.floor && G.floor.hard;
  const hpScale = enemyHpScale(depth) * (hard ? 1.35 : 1);
  const base = {
    type, x, y, vx: 0, vy: 0, anim: rand(10), flash: 0, hitstop: 0, dead: false,
    z: 0, vz: 0, knockX: 0, knockY: 0,
    touchDamage: enemyTouchDamage(depth),
    shotDmg: enemyShotDamage(depth),
    // materialize window: rises out of the floor, can't act / be hit / touch
    spawnT: 0.55, spawnMax: 0.55,
    poison: 0, poisonT: 0, slowT: 0,
  };
  switch (type) {
    case 'gaper': return { ...base, r: 16, hp: 12 * hpScale, speed: rand(72, 88), awake: false };
    case 'fly': return { ...base, r: 9, hp: 5 * hpScale, speed: rand(55, 70), flying: true };
    case 'spitter': return { ...base, r: 16, hp: 14 * hpScale, speed: 40, charge: 0, shootCd: rand(1.2, 2.4), eyeX: 0, eyeY: 0, flying: true, homingShots: depth >= 8 };
    case 'hopper': return { ...base, r: 13, hp: 10 * hpScale, hopCd: rand(0.6, 1.4), squash: 0 };
    // rooted turret: never moves, fires a rotating four-way cross
    case 'sentry': return { ...base, r: 17, hp: 18 * hpScale, speed: 0, shootCd: rand(1.4, 2.6), charge: 0, spin: rand(TAU) };
    // Boom Fly: ricochets diagonally, detonates on death
    case 'boomfly': {
      const a = pick([0.25, 0.75, 1.25, 1.75]) * Math.PI + rand(-0.2, 0.2);
      return { ...base, r: 12, hp: 8 * hpScale, flying: true, vx: Math.cos(a) * 115, vy: Math.sin(a) * 115 };
    }
    // Globin: first "death" collapses it into a pile that reforms at half hp
    case 'globin': return { ...base, r: 15, hp: 16 * hpScale, maxHp: 16 * hpScale, speed: rand(62, 76), reforms: 1, pile: 0, detourT: 0, detourDir: 1 };
    // Knight: slow stomp, immune from the front (see knightBlocksTear)
    case 'knight': return { ...base, r: 15, hp: 20 * hpScale, speed: rand(46, 56), faceX: 0, faceY: 1 };
    // Vis: stops to charge, then fires a sustained purple laser
    case 'vis': return { ...base, r: 16, hp: 22 * hpScale, speed: 34, shootCd: rand(1.6, 2.8), charging: 0 };
  }
  return { ...base, r: 14, hp: 10 * hpScale, speed: 60 };
}

function damageEnemy(G, e, dmg, kvx, kvy) {
  if (e._hp0 === undefined) e._hp0 = e.hp;   // full hp at first blood, for the execute threshold
  e.hp -= dmg;
  e.flash = 0.08;
  SFX.hit();
  if (!e.isBoss) {
    e.hitstop = HITSTOP_HIT;   // only the struck enemy freezes; bosses shrug it off
    const kn = (e.flying ? 40 : 26) * (G.player.knockMul || 1);
    const kl = Math.hypot(kvx, kvy) || 1;
    e.knockX += (kvx / kl) * kn * 4;
    e.knockY += (kvy / kl) * kn * 4;
  }
  // 生气 dodo: enemies at death's door (15%) are executed outright
  if (!e.dead && e.hp > 0 && !e.isBoss && G.player.charId === 'rage' && e.hp <= e._hp0 * 0.15) {
    e.hp = 0;
    spawnBlood(G, e.x, e.y, 18);
  }
  if (e.hp <= 0 && !e.dead) killEnemy(G, e);
}

function killEnemy(G, e) {
  // death-rewrite hook: Globin's first death melts it into a reforming pile
  if (e.type === 'globin' && e.reforms > 0) {
    e.reforms--;
    e.pile = 2.2;
    e.hp = e.maxHp * 0.55;
    e.knockX = 0; e.knockY = 0;
    spawnBlood(G, e.x, e.y, 8);
    return;
  }
  e.dead = true;
  G.stats.kills++;
  addRage(G.player, e.isBoss ? 0.35 : 0.09);
  tryDropSoulflame(G.player, e);
  // lifetime kill counter feeds the threshold unlocks (生气 dodo / 1UP!)
  if (!G.devTainted) { META.totals.kills++; metaEvent('kill'); }
  // death hook: Boom Fly detonates, hurting everything nearby — you included
  if (e.type === 'boomfly') explodeAt(G, e.x, e.y, 72, 10, true);
  spawnBlood(G, e.x, e.y, e.isBoss ? 40 : 14);
  G.room.stains.push({ x: e.x, y: e.y, r: e.isBoss ? 40 : 16, seed: randi(1, 1e9) });
  // mini-boss: a proper reward, but no trapdoor — the floor boss still awaits
  if (e.isBoss && e.miniboss) {
    G.shake = 14;
    SFX.bossDie();
    spawnItemPedestal(G.room, e.x, e.y);
    G.room.pickups.push(makePickup(chance(0.5) ? 'bomb' : 'battery', e.x - 60, e.y));
    resolvePedestals(G.room, G.player);
    return;
  }
  if (e.isBoss) { G.shake = 18; SFX.bossDie(); onBossKilled(G, e); return; }
  SFX.kill();
  const p = G.player;
  if (p.vampirism > 0 && p.hp < p.maxHp && chance(p.vampirism)) {
    p.hp = Math.min(p.maxHp, p.hp + 1);
    SFX.heart();
  }
  // drops (luck nudges the roll toward the good end)
  const roll = Math.max(0, Math.random() - p.luck * 0.012);
  if (roll < 0.10) G.room.pickups.push(makePickup('halfheart', e.x, e.y));
  else if (roll < 0.22) G.room.pickups.push(makePickup('coin', e.x, e.y));
  else if (roll < 0.26) G.room.pickups.push(makePickup('bomb', e.x, e.y));
  else if (roll < 0.29) G.room.pickups.push(makePickup('battery', e.x, e.y));
  else if (roll < 0.335) spawnItemPedestal(G.room, e.x, e.y);
}

function makePickup(kind, x, y) {
  const spot = findFreeSpot(G.room, x, y);
  return { kind, x: spot.x, y: spot.y, anim: rand(10), taken: false };
}

// nudge a position off rocks so drops are always reachable
function findFreeSpot(room, x, y) {
  x = clamp(x, FLOOR_X + 30, FLOOR_X + FLOOR_W - 30);
  y = clamp(y, FLOOR_Y + 30, FLOOR_Y + FLOOR_H - 30);
  if (!pointHitsRock(room, x, y)) return { x, y };
  for (let rad = 40; rad <= 160; rad += 40) {
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      const nx = clamp(x + Math.cos(a) * rad, FLOOR_X + 30, FLOOR_X + FLOOR_W - 30);
      const ny = clamp(y + Math.sin(a) * rad, FLOOR_Y + 30, FLOOR_Y + FLOOR_H - 30);
      if (!pointHitsRock(room, nx, ny)) return { x: nx, y: ny };
    }
  }
  return { x: W / 2, y: H / 2 };
}

function updateEnemies(G, dt) {
  const p = G.player;
  const room = G.room;
  for (const e of G.enemies) {
    e.anim += dt;
    e.flash = Math.max(0, e.flash - dt);
    // hit-stop: the enemy that just got hit holds still for a couple of frames
    if (e.hitstop > 0) { e.hitstop -= dt; continue; }
    // materialize window: rising out of the floor — no move / attack / contact
    if (e.spawnT > 0) { e.spawnT -= dt; continue; }
    // Globin pile: reforming puddle, inert until it stands back up
    if (e.type === 'globin' && e.pile > 0) { e.pile -= dt; continue; }
    // knockback decay
    e.x += e.knockX * dt; e.y += e.knockY * dt;
    e.knockX *= Math.pow(0.0001, dt); e.knockY *= Math.pow(0.0001, dt);

    // status effects from items
    if (e.poisonT > 0) {
      e.poisonT -= dt;
      e.hp -= e.poison * dt;
      if (chance(dt * 6)) {
        G.particles.push({ x: e.x + rand(-8, 8), y: e.y - 6, vx: rand(-12, 12), vy: -rand(15, 40), life: 0.4, maxLife: 0.4, r: rand(1.5, 3), color: '#7fbf4a', grav: -20 });
      }
      if (e.hp <= 0 && !e.dead) { killEnemy(G, e); continue; }
    }
    if (e.slowT > 0) e.slowT -= dt;
    const slow = e.slowT > 0 ? 0.45 : 1;

    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;

    if (e.type === 'gaper') {
      // wiki: eyes shut until it spots isaac, then permanently faster
      if (!e.awake && d < 300) { e.awake = true; e.speed *= 1.35; }
      const wob = Math.sin(e.anim * 3.1) * 0.5;
      let a = Math.atan2(dy, dx) + wob * 0.35;
      // detour around rocks when stuck
      if (e.detourT > 0) {
        e.detourT -= dt;
        a = Math.atan2(dy, dx) + (Math.PI / 2) * e.detourDir;
      }
      const bx = e.x, by = e.y;
      e.x += Math.cos(a) * e.speed * slow * dt;
      e.y += Math.sin(a) * e.speed * slow * dt;
      collideWithRoom(e, room, false);
      const moved = dist(bx, by, e.x, e.y);
      if (moved < e.speed * slow * dt * 0.35) {
        if (e.detourT > 0) e.detourDir *= -1;          // detour also blocked -> flip
        else e.detourDir = chance(0.5) ? 1 : -1;
        e.detourT = 0.55;
      }
    } else if (e.type === 'fly') {
      e.vx += ((dx / d) * 90 + rand(-60, 60)) * dt;
      e.vy += ((dy / d) * 90 + rand(-60, 60)) * dt;
      const sp = Math.hypot(e.vx, e.vy);
      const cap = e.speed * slow;
      if (sp > cap) { e.vx *= cap / sp; e.vy *= cap / sp; }
      e.x += e.vx * dt; e.y += e.vy * dt;
      collideWithRoom(e, room, true);
    } else if (e.type === 'spitter') {
      // hover, keep distance, spit at player
      e.eyeX = clamp(dx / d * 3, -3, 3); e.eyeY = clamp(dy / d * 3, -3, 3);
      const want = d > 240 ? 1 : (d < 170 ? -1 : 0);
      e.x += (dx / d) * e.speed * slow * want * dt + Math.sin(e.anim * 2) * 20 * dt;
      e.y += (dy / d) * e.speed * slow * want * dt + Math.cos(e.anim * 1.7) * 20 * dt;
      collideWithRoom(e, room, true);
      e.shootCd -= dt * slow;
      if (e.shootCd <= 0) {
        e.charge += dt;
        if (e.charge > 0.9) {
          e.charge = 0;
          e.shootCd = rand(1.6, 2.6);
          const a = Math.atan2(dy, dx);
          // deep-floor spitters fire tracking shots
          addEnemyTear(G, e.x, e.y + 6, a, 230, 7, e.shotDmg,
            e.homingShots ? { homing: 2.0, homeT: 1.3 } : null);
          SFX.spit();
        }
      }
    } else if (e.type === 'sentry') {
      // rooted: never chases, sweeps a four-way cross that slowly rotates
      e.spin += dt * 0.6;
      e.shootCd -= dt * slow;
      if (e.shootCd <= 0) {
        e.charge += dt;
        if (e.charge > 0.7) {
          e.charge = 0;
          e.shootCd = rand(1.8, 2.8);
          for (let i = 0; i < 4; i++) {
            const a = e.spin + i / 4 * TAU;
            addEnemyTear(G, e.x, e.y, a, 200, 6.5, e.shotDmg);
          }
          SFX.spit();
        }
      }
    } else if (e.type === 'boomfly') {
      // straight diagonal ricochet off the room bounds
      e.x += e.vx * dt * slow; e.y += e.vy * dt * slow;
      if (e.x < FLOOR_X + e.r) { e.x = FLOOR_X + e.r; e.vx = Math.abs(e.vx); }
      if (e.x > FLOOR_X + FLOOR_W - e.r) { e.x = FLOOR_X + FLOOR_W - e.r; e.vx = -Math.abs(e.vx); }
      if (e.y < FLOOR_Y + e.r) { e.y = FLOOR_Y + e.r; e.vy = Math.abs(e.vy); }
      if (e.y > FLOOR_Y + FLOOR_H - e.r) { e.y = FLOOR_Y + FLOOR_H - e.r; e.vy = -Math.abs(e.vy); }
    } else if (e.type === 'globin') {
      // same dogged chase as the gaper, with rock detours
      let a = Math.atan2(dy, dx);
      if (e.detourT > 0) { e.detourT -= dt; a += (Math.PI / 2) * e.detourDir; }
      const bx = e.x, by = e.y;
      e.x += Math.cos(a) * e.speed * slow * dt;
      e.y += Math.sin(a) * e.speed * slow * dt;
      collideWithRoom(e, room, false);
      if (dist(bx, by, e.x, e.y) < e.speed * slow * dt * 0.35) {
        if (e.detourT > 0) e.detourDir *= -1;
        else e.detourDir = chance(0.5) ? 1 : -1;
        e.detourT = 0.55;
      }
    } else if (e.type === 'knight') {
      // slow stomping advance, always facing the player (frontal shield)
      e.faceX = dx / d; e.faceY = dy / d;
      e.x += e.faceX * e.speed * slow * dt;
      e.y += e.faceY * e.speed * slow * dt;
      collideWithRoom(e, room, false);
    } else if (e.type === 'vis') {
      if (e.charging > 0) {
        // rooted while the laser charges & fires
        e.charging -= dt;
      } else {
        e.x += (dx / d) * e.speed * slow * dt;
        e.y += (dy / d) * e.speed * slow * dt;
        collideWithRoom(e, room, false);
        e.shootCd -= dt * slow;
        if (e.shootCd <= 0 && d < 460) {
          e.shootCd = rand(2.4, 3.6);
          e.charging = 1.35;
          addEnemyLaser(G, {
            x: e.x, y: e.y, angle: Math.atan2(dy, dx), len: 640, w: 10,
            warm: 0.75, life: 0.5, spin: 0, dmg: e.shotDmg, src: e,
          });
          SFX.laser();
        }
      }
    } else if (e.type === 'hopper') {
      e.hopCd -= dt * slow;
      if (e.z > 0 || e.vz > 0) {
        e.vz -= 900 * dt;
        e.z += e.vz * dt;
        e.x += e.vx * dt; e.y += e.vy * dt;
        collideWithRoom(e, room, true);
        if (e.z <= 0) { e.z = 0; e.vz = 0; e.vx = 0; e.vy = 0; e.squash = 0.6; collideWithRoom(e, room, false); }
      } else {
        e.squash = Math.max(0, (e.squash || 0) - dt * 3);
        if (e.hopCd <= 0) {
          e.hopCd = rand(0.7, 1.3);
          const a = Math.atan2(dy, dx) + rand(-0.5, 0.5);
          const hopSpeed = rand(150, 220) * slow;
          e.vx = Math.cos(a) * hopSpeed; e.vy = Math.sin(a) * hopSpeed;
          e.vz = 260; e.z = 0.01;
        }
      }
    } else if (e.isBoss) {
      updateBossAI(G, e, dt);
    }

    // contact damage
    if (!e.dead && (e.z || 0) < 24 && dist(e.x, e.y, p.x, p.y) < e.r + p.r - 2) {
      const cdm = p.contactDamage + (rageBerserk(p) ? 3 : 0);
      if (cdm > 0) damageEnemy(G, e, cdm * dt * 6, e.x - p.x, e.y - p.y);
      hurtPlayer(G, e.touchDamage, e.x, e.y);
    }
  }
  G.enemies = G.enemies.filter(e => !e.dead);
}

// enemy projectile factory; opts adds behaviors: {homing, homeT} tracking
// shots and {curve} arcing shots
function addEnemyTear(G, x, y, a, sp, r, dmg, opts) {
  G.eshots.push(Object.assign({
    x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
    r, dmg: dmg || 1, bounces: 0, dead: false,
  }, opts || null));
}

function updateEnemyShots(G, dt) {
  const p = G.player;
  for (const s of G.eshots) {
    // tracking shots steer toward the player for a limited time
    if (s.homing && s.homeT > 0) {
      s.homeT -= dt;
      const sp = Math.hypot(s.vx, s.vy) || 1;
      const wantA = Math.atan2(p.y - s.y, p.x - s.x);
      const curA = Math.atan2(s.vy, s.vx);
      let dA = wantA - curA;
      while (dA > Math.PI) dA -= TAU;
      while (dA < -Math.PI) dA += TAU;
      const newA = curA + clamp(dA, -s.homing * dt, s.homing * dt);
      s.vx = Math.cos(newA) * sp; s.vy = Math.sin(newA) * sp;
    }
    // arcing shots accelerate sideways
    if (s.curve) {
      const a = Math.atan2(s.vy, s.vx) + Math.PI / 2;
      s.vx += Math.cos(a) * s.curve * dt;
      s.vy += Math.sin(a) * s.curve * dt;
    }
    s.x += s.vx * dt; s.y += s.vy * dt;
    const hitW = s.x < FLOOR_X + 4 || s.x > FLOOR_X + FLOOR_W - 4;
    const hitH = s.y < FLOOR_Y + 4 || s.y > FLOOR_Y + FLOOR_H - 4;
    if (hitW || hitH) {
      if (s.bounces > 0) {
        s.bounces--;
        if (hitW) { s.vx = -s.vx; s.x = clamp(s.x, FLOOR_X + 5, FLOOR_X + FLOOR_W - 5); }
        if (hitH) { s.vy = -s.vy; s.y = clamp(s.y, FLOOR_Y + 5, FLOOR_Y + FLOOR_H - 5); }
      } else {
        s.dead = true;
        spawnSplash(G, s.x, s.y, '#b3241a');
        continue;
      }
    }
    if (dist(s.x, s.y, p.x, p.y) < s.r + p.r - 2) {
      s.dead = true;
      spawnSplash(G, s.x, s.y, '#b3241a');
      hurtPlayer(G, s.dmg || 1, s.x, s.y);
    }
  }
  G.eshots = G.eshots.filter(s => !s.dead);
}

// ---- sustained enemy lasers (Vis + late-game bosses) ----
// Unlike spawnBeam's one-frame hitscan, these persist: a dashed purple
// warning line during `warm`, then a rotating damage beam for `life` seconds.
function addEnemyLaser(G, o) {
  G.lasers.push(Object.assign({
    x: W / 2, y: H / 2, angle: 0, len: 900, w: 13,
    warm: 0.6, life: 1.8, spin: 0, dmg: 1, src: null, anim: 0, dead: false,
  }, o));
}

function updateLasers(G, dt) {
  const p = G.player;
  for (const l of G.lasers) {
    l.anim += dt;
    // beams stay glued to their source while it lives
    if (l.src && !l.src.dead) { l.x = l.src.x; l.y = l.src.y - (l.src.z || 0); }
    if (l.warm > 0) { l.warm -= dt; continue; }
    l.angle += (l.spin || 0) * dt;
    l.life -= dt;
    if (l.life <= 0) { l.dead = true; continue; }
    if (segCircleHit(l.x, l.y, l.angle, l.len, p.x, p.y, p.r + l.w * 0.4)) {
      hurtPlayer(G, l.dmg, l.x + Math.cos(l.angle) * 20, l.y + Math.sin(l.angle) * 20);
    }
  }
  G.lasers = G.lasers.filter(l => !l.dead);
}

// ---- orbiting tears & familiars granted by items ----
function updateOrbitals(G, dt) {
  const p = G.player;
  if (p.orbitals <= 0) { G.orbits = []; return; }
  while (G.orbits.length < p.orbitals) G.orbits.push({ a: rand(TAU), x: p.x, y: p.y, cd: 0 });
  while (G.orbits.length > p.orbitals) G.orbits.pop();
  G.orbits.forEach((o, i) => {
    o.a += dt * 3.2;
    const rad = 56 + i * 12;
    o.x = p.x + Math.cos(o.a + i * TAU / G.orbits.length) * rad;
    o.y = p.y + Math.sin(o.a + i * TAU / G.orbits.length) * rad * 0.8;
    o.cd = Math.max(0, o.cd - dt);
    if (o.cd > 0) return;
    for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0 || (e.z || 0) > 30) continue;
      if (dist(o.x, o.y, e.x, e.y) < 9 + e.r) {
        damageEnemy(G, e, p.damage * 0.55, e.x - p.x, e.y - p.y);
        o.cd = 0.25;
        break;
      }
    }
  });
}

function updateFamiliars(G, dt) {
  const p = G.player;
  if (p.familiars <= 0) { G.familiars = []; return; }
  while (G.familiars.length < p.familiars) G.familiars.push({ x: p.x, y: p.y, cd: rand(0.4), anim: rand(10) });
  while (G.familiars.length > p.familiars) G.familiars.pop();
  G.familiars.forEach((f, i) => {
    f.anim += dt;
    const tx = p.x - 34 - i * 26, ty = p.y + 26 + Math.sin(f.anim * 3) * 6;
    f.x += (tx - f.x) * Math.min(1, dt * 3.4);
    f.y += (ty - f.y) * Math.min(1, dt * 3.4);
    f.cd -= dt;
    if (f.cd > 0) return;
    let best = null, bd = 420;
    for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const d = dist(f.x, f.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    f.cd = 0.7;
    const a = Math.atan2(best.y - f.y, best.x - f.x);
    G.tears.push({
      x: f.x, y: f.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380,
      r: 5, damage: Math.max(2, p.damage * 0.5), traveled: 0, range: 400,
      homing: p.homing, piercing: false, bounce: 0, explosive: 0, poison: 0, slow: 0,
      hitSet: null, color: '#cfe8ff', dead: false,
    });
    SFX.shoot();
  });
}

function hurtPlayer(G, dmg, fromX, fromY) {
  const p = G.player;
  if (G.dev || p.invuln > 0 || G.state !== 'play' || G.paused) return;
  // Holy Mantle: the per-room shield eats one hit completely
  if (p.shieldUp) {
    p.shieldUp = false;
    p.invuln = 1.0;
    G.shake = Math.max(G.shake, 5);
    SFX.thud();
    for (let i = 0; i < 10; i++) {
      const a = rand(TAU), s = rand(60, 160);
      G.particles.push({ x: p.x, y: p.y - 8, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4, maxLife: 0.4, r: rand(2, 4), color: '#cfe8ff', grav: 100 });
    }
    return;
  }
  // The Wafer: flat damage reduction — a hit reduced to zero is fully blocked
  if (p.dmgReduce > 0) dmg = Math.max(0, dmg - p.dmgReduce);
  // soul hearts are spent before red hearts, Isaac style
  let left = dmg;
  if (p.soulHp > 0) {
    const s = Math.min(p.soulHp, left);
    p.soulHp -= s;
    left -= s;
  }
  p.hp -= left;
  // meta progress: remember that this floor / boss fight drew blood
  if (dmg > 0) {
    G.floorDamage = (G.floorDamage || 0) + dmg;
    if (G.room && G.room.kind === 'boss') G.bossFightHurt = true;
    addRage(p, 0.4);
  }
  p.invuln = 1.1 + (p.invulnBonus || 0);
  p.hurtFlash = 0.35;
  G.shake = 10;
  SFX.hurt();
  spawnBlood(G, p.x, p.y, 8);
  // knock player away
  const a = Math.atan2(p.y - fromY, p.x - fromX);
  p.vx += Math.cos(a) * 220;
  p.vy += Math.sin(a) * 220;
  resolvePlayerDeath(G);
}

// shared "did that kill you?" resolution — extra lives fire first
function resolvePlayerDeath(G) {
  const p = G.player;
  if (p.hp > 0) return;
  if (p.extraLives > 0) {
    // 1-up style revive: back on your feet with half your hearts
    p.extraLives--;
    p.hp = Math.min(p.maxHp, Math.max(2, Math.floor(p.maxHp / 2)));
    p.invuln = 2.4;
    G.toast = { title: '死而复生', desc: '剩余复活次数 ' + p.extraLives, t: 2.4 };
    SFX.item();
    return;
  }
  onPlayerDeath(G);
}

