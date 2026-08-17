'use strict';
// ============ player / tears / enemies ============

function makePlayer() {
  return {
    x: W / 2, y: H / 2, r: 13,
    vx: 0, vy: 0,
    hp: 6, maxHp: 6,               // in half-hearts
    damage: 3.5,
    fireDelay: 0.42,               // seconds between tears
    shotSpeed: 400,
    range: 380,                    // px
    moveSpeed: 260,
    tearSize: 6.5,
    multishot: 1,
    homing: false,
    piercing: false,
    // --- item-granted extras ---
    laser: false,                  // Brimstone: charged blood laser instead of tears
    bounce: 0,                     // wall ricochets per tear
    explosive: 0,                  // splash radius on impact
    ipecac: false,                 // explosive tears also hurt the player (Ipecac)
    poison: 0,                     // damage per second applied on hit
    slowOnHit: 0,                  // 0..0.8 slow factor
    spectral: false,               // tears pass through rocks (Ouija Board)
    split: 0,                      // tears split into children when they end (The Parasite)
    tearAura: 0,                   // damage aura around flying tears (Godhead)
    distGrow: 0,                   // damage grows with distance (A Lump of Coal)
    distShrink: 0,                 // damage shrinks with distance (Proptosis)
    shieldMax: 0,                  // per-room shield charges (Holy Mantle)
    shieldUp: false,
    dmgReduce: 0,                  // flat incoming damage reduction (The Wafer)
    crit: 0,                       // crit chance
    critMul: 2.5,
    orbitals: 0,                   // circling tears
    familiars: 0,                  // little friends that shoot
    contactDamage: 0,              // damage dealt by touching enemies
    vampirism: 0,                  // heal chance on kill
    extraLives: 0,
    pickupMagnet: 0,               // pull radius for coins/hearts
    luck: 0,                       // nudges drop rolls
    invulnBonus: 0,
    knockMul: 1,
    flight: false,                 // fly over rocks (dodo wings)
    fireCd: 0,
    laserCharge: 0,                // Brimstone hold-to-charge progress (sec)
    invuln: 0,
    walk: 0,
    moving: false,
    aimX: 0, aimY: 1,
    hurtFlash: 0,
    blink: 0,                      // eyes-closed timer, set on every shot
    wingGrow: 0,                   // wings sprout-in timer after pickup
    flap: 0,                       // wing flap phase (advances while flight)
    appearance: { headColor: '#f7f3e9', eyeColor: '#17110c', hat: null, big: false, tearColor: null, aura: null },
    coins: 0,
    bombs: 3,                      // consumable bombs, placed with E
    active: null,                  // spacebar item: { def, charge } (charge in bars)
    compass: false,                // reveals special rooms on the map
    treasureMap: false,            // reveals the whole floor layout
    blueMap: false,                // reveals secret rooms
    itemsTaken: [],
  };
}

// stat guard rails so stacked items can't break the game (Isaac clamps too)
function clampPlayerStats(p) {
  p.damage = clamp(p.damage, 0.5, 90);
  p.fireDelay = clamp(p.fireDelay, 0.08, 1.2);
  p.shotSpeed = clamp(p.shotSpeed, 180, 1000);
  p.range = clamp(p.range, 140, 1400);
  p.moveSpeed = clamp(p.moveSpeed, 120, 560);
  p.tearSize = clamp(p.tearSize, 3, 26);
  p.multishot = clamp(p.multishot, 1, 9);
  p.maxHp = clamp(p.maxHp, 2, 24);
  p.hp = clamp(p.hp, 0, p.maxHp);
  p.crit = clamp(p.crit, 0, 0.85);
  p.orbitals = clamp(p.orbitals, 0, 6);
  p.familiars = clamp(p.familiars, 0, 4);
  p.bounce = clamp(p.bounce, 0, 4);
  p.luck = clamp(p.luck, -2, 12);
  p.split = clamp(p.split, 0, 2);
  p.tearAura = clamp(p.tearAura, 0, 6);
  p.dmgReduce = clamp(p.dmgReduce, 0, 1);
  p.shieldMax = clamp(p.shieldMax, 0, 1);
}

// --- collision helpers against current room ---
function collideWithRoom(ent, room, isFlying) {
  // walls
  ent.x = clamp(ent.x, FLOOR_X + ent.r, FLOOR_X + FLOOR_W - ent.r);
  ent.y = clamp(ent.y, FLOOR_Y + ent.r, FLOOR_Y + FLOOR_H - ent.r);
  if (isFlying) return;
  // rocks
  for (const rk of room.rocks) {
    const t = tileRect(rk.cx, rk.cy);
    const fix = circleRectPush(ent.x, ent.y, ent.r, t.x + 6, t.y + 6, t.w - 12, t.h - 12);
    if (fix) { ent.x = fix.x; ent.y = fix.y; }
  }
}

function pointHitsRock(room, x, y) {
  for (const rk of room.rocks) {
    const t = tileRect(rk.cx, rk.cy);
    if (x > t.x + 8 && x < t.x + t.w - 8 && y > t.y + 8 && y < t.y + t.h - 8) return true;
  }
  return false;
}

// --- tears ---
function spawnPlayerTears(G, dirX, dirY) {
  const p = G.player;
  const baseAngle = Math.atan2(dirY, dirX);
  const n = p.multishot;
  const spread = 0.16;
  for (let i = 0; i < n; i++) {
    const off = n === 1 ? 0 : (i - (n - 1) / 2) * spread;
    const a = baseAngle + off;
    // Isaac feel: tears inherit a fraction of player velocity
    const vx = Math.cos(a) * p.shotSpeed + p.vx * 0.35;
    const vy = Math.sin(a) * p.shotSpeed + p.vy * 0.35;
    const crit = p.crit > 0 && chance(p.crit);
    G.tears.push({
      x: p.x + dirX * 12, y: p.y - 10 + dirY * 12,
      vx, vy,
      r: p.tearSize * (crit ? 1.35 : 1),
      damage: p.damage * (crit ? p.critMul : 1),
      crit,
      traveled: 0,
      range: p.range,
      homing: p.homing,
      piercing: p.piercing,
      bounce: p.bounce,
      explosive: p.explosive,
      selfHarm: p.ipecac,
      poison: p.poison,
      slow: p.slowOnHit,
      spectral: p.spectral,
      split: p.split,
      aura: p.tearAura,
      auraT: 0,
      distGrow: p.distGrow,
      distShrink: p.distShrink,
      hitSet: (p.piercing || p.bounce) ? new Set() : null,
      color: crit ? '#ffe9a8' : p.appearance.tearColor,
      dead: false,
    });
  }
  p.fireCd = p.fireDelay;
  p.blink = 0.12;                  // dodo blinks every time a tear leaves
  SFX.shoot();
}

// effective damage of a tear right now — distance-scaled items hook in here
function tearDamage(t) {
  let d = t.damage;
  const frac = clamp(t.traveled / Math.max(1, t.range), 0, 1);
  if (t.distGrow) d *= 1 + frac * t.distGrow;          // A Lump of Coal
  if (t.distShrink) d *= Math.max(0.35, 1.45 - frac * t.distShrink * 1.6); // Proptosis
  return d;
}

// Brimstone: the laser replaces tears, and scales its width with damage.
// Hold-to-charge: the fire key must be held laserChargeTime() seconds before
// the beam releases — the payoff is a much harder-hitting shot per release.
// Tear items translate onto the beam so no pickup goes dead (Isaac-style):
//   poison/slow/crit     → applied per enemy the beam crosses
//   distGrow/distShrink  → damage gradient along the beam length
//   tearAura             → the beam leaves a burning trail behind
//   homing               → the beam bends toward a nearby enemy
//   bounce               → the beam reflects off room walls
//   explosive/ipecac     → blast at the beam's end point
//   split                → the end point bursts into two tears
//   tearSize             → beam width; shotSpeed → charge time
//   piercing/spectral    → inherent to the laser, folded into damage
const LASER_CHARGE_TIME = 0.5;
// shotSpeed is meaningless for hitscan, so it buys charge speed instead
function laserChargeTime(p) {
  return clamp(LASER_CHARGE_TIME * 400 / p.shotSpeed, 0.24, 0.9);
}

function fireBrimstone(G, dirX, dirY) {
  const p = G.player;
  const base = Math.atan2(dirY, dirX);
  const n = p.multishot;
  const spread = 0.15;
  const dmgMul = n > 1 ? 0.72 : 1;   // fan of beams trades per-beam damage
  // piercing/spectral are inherent to the beam; the pickups pay out as damage
  const inherentMul = (p.piercing ? 1.12 : 1) * (p.spectral ? 1.12 : 1);
  const beamW = 4 + p.tearSize * 1.05 + p.damage * 0.85;
  for (let i = 0; i < n; i++) {
    let a = base + (n === 1 ? 0 : (i - (n - 1) / 2) * spread);
    if (p.homing) a = bendTowardEnemy(G, p.x, p.y, a);
    const crit = p.crit > 0 && chance(p.crit);
    const dmg = p.damage * 3.6 * dmgMul * inherentMul * (crit ? p.critMul : 1);
    const payload = {
      poison: p.poison, slow: p.slowOnHit, crit,
      distGrow: p.distGrow, distShrink: p.distShrink,
      range: p.range + 220, hitSet: new Set(),
    };
    // walk the beam wall to wall, reflecting while bounce charges remain
    let bx = p.x + Math.cos(a) * 10, by = p.y - 8 + Math.sin(a) * 10;
    let remaining = p.range + 220, bounces = p.bounce, distBase = 0;
    let endX = bx, endY = by;
    for (let hop = 0; hop < 6 && remaining > 1; hop++) {
      const hit = beamWallHit(bx, by, a);
      const seg = Math.min(remaining, hit.t);
      spawnBeam(G, bx, by, a, seg, beamW, true, dmg, { ...payload, distBase });
      if (p.tearAura > 0) {
        G.beams.push({
          x: bx, y: by, angle: a, len: seg, w: 26, trail: true,
          life: 0.9, maxLife: 0.9, friendly: true, dps: p.tearAura, tick: 0.12,
        });
      }
      endX = bx + Math.cos(a) * seg; endY = by + Math.sin(a) * seg;
      distBase += seg; remaining -= seg;
      if (seg < hit.t || bounces <= 0 || remaining <= 1) break;
      bounces--;
      bx = endX; by = endY;
      if (hit.flipX) a = Math.PI - a;
      if (hit.flipY) a = -a;
    }
    // onTearEnd equivalents fire where the beam stops
    if (p.explosive > 0) explodeAt(G, endX, endY, p.explosive, p.damage, p.ipecac);
    if (p.split > 0) splitBeamEnd(G, p, endX, endY, a);
  }
  p.fireCd = p.fireDelay * 1.8;
  p.blink = 0.12;
  SFX.laser();
}

// distance along a ray from (x,y) to the nearest room wall, plus which axis to mirror
function beamWallHit(x, y, angle) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let tx = Infinity, ty = Infinity;
  if (dx > 1e-6) tx = (FLOOR_X + FLOOR_W - x) / dx;
  else if (dx < -1e-6) tx = (FLOOR_X - x) / dx;
  if (dy > 1e-6) ty = (FLOOR_Y + FLOOR_H - y) / dy;
  else if (dy < -1e-6) ty = (FLOOR_Y - y) / dy;
  if (tx < ty) return { t: Math.max(0, tx), flipX: true, flipY: false };
  return { t: Math.max(0, ty), flipX: false, flipY: true };
}

// homing for a hitscan weapon = aim assist: nudge the angle toward the
// enemy that costs the smallest correction (up to ~26°)
function bendTowardEnemy(G, x, y, angle) {
  let bestA = angle, bestDev = 0.55;
  for (const e of G.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const wantA = Math.atan2(e.y - y, e.x - x);
    let dA = wantA - angle;
    while (dA > Math.PI) dA -= TAU;
    while (dA < -Math.PI) dA += TAU;
    if (Math.abs(dA) < bestDev) { bestDev = Math.abs(dA); bestA = angle + clamp(dA, -0.45, 0.45); }
  }
  return bestA;
}

// The Parasite on a laser: the end point bursts into two perpendicular tears
function splitBeamEnd(G, p, x, y, angle) {
  const a = angle + Math.PI / 2;
  for (const s of [-1, 1]) {
    G.tears.push({
      x, y, vx: Math.cos(a) * 220 * s, vy: Math.sin(a) * 220 * s,
      r: Math.max(3, p.tearSize * 0.6), damage: p.damage * 0.5, crit: false,
      traveled: 0, range: 150, homing: false, piercing: false, bounce: 0,
      explosive: 0, selfHarm: false, poison: p.poison, slow: p.slowOnHit,
      spectral: true, split: 0, aura: 0, auraT: 0, distGrow: 0, distShrink: 0,
      hitSet: null, color: '#c3241a', dead: false,
    });
  }
}

// hitscan beam: damages on spawn, then lingers purely as a visual.
// opts carries the tear-item payload for friendly (player) beams.
function spawnBeam(G, x, y, angle, len, w, friendly, dmg, opts) {
  const life = friendly ? 0.17 : 0.24;
  G.beams.push({ x, y, angle, len, w, life, maxLife: life, friendly, dmg, crit: !!(opts && opts.crit) });
  if (friendly) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0 || (e.z || 0) > 120) continue;
      if (opts && opts.hitSet && opts.hitSet.has(e)) continue;
      if (segCircleHit(x, y, angle, len, e.x, e.y, e.r + w * 0.5)) {
        let d = dmg;
        if (opts) {
          // distance items grade damage along the beam, same curve as tears
          const along = (opts.distBase || 0) + clamp((e.x - x) * dx + (e.y - y) * dy, 0, len);
          const frac = clamp(along / Math.max(1, opts.range || len), 0, 1);
          if (opts.distGrow) d *= 1 + frac * opts.distGrow;
          if (opts.distShrink) d *= Math.max(0.35, 1.45 - frac * opts.distShrink * 1.6);
        }
        damageEnemy(G, e, d, dx, dy);
        if (opts) {
          if (opts.poison > 0) { e.poison = opts.poison; e.poisonT = 3; }
          if (opts.slow > 0) e.slowT = 1.6;
          if (opts.hitSet) opts.hitSet.add(e);
        }
      }
    }
  } else {
    const p = G.player;
    if (segCircleHit(x, y, angle, len, p.x, p.y, p.r + w * 0.4)) hurtPlayer(G, dmg, x, y);
  }
  G.shake = Math.max(G.shake, friendly ? 5 : 9);
}

function updateBeams(G, dt) {
  for (const b of G.beams) {
    b.life -= dt;
    // Godhead trail: the burning band left by the beam keeps ticking damage
    if (b.trail && b.life > 0) {
      b.tick -= dt;
      if (b.tick <= 0) {
        b.tick = 0.22;
        for (const e of G.enemies) {
          if (e.dead || e.spawnT > 0 || (e.z || 0) > 30) continue;
          if (segCircleHit(b.x, b.y, b.angle, b.len, e.x, e.y, e.r + b.w)) {
            damageEnemy(G, e, b.dps, Math.cos(b.angle), Math.sin(b.angle));
          }
        }
      }
    }
  }
  G.beams = G.beams.filter(b => b.life > 0);
}

function updateTears(G, dt) {
  const room = G.room;
  for (const t of G.tears) {
    if (t.dead) continue;
    if (t.homing && G.enemies.length) {
      let best = null, bd = 1e9;
      for (const e of G.enemies) {
        if (e.spawnT > 0) continue;
        const d = dist(t.x, t.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best && bd < 260) {
        const sp = Math.hypot(t.vx, t.vy);
        const wantA = Math.atan2(best.y - t.y, best.x - t.x);
        const curA = Math.atan2(t.vy, t.vx);
        let dA = wantA - curA;
        while (dA > Math.PI) dA -= TAU;
        while (dA < -Math.PI) dA += TAU;
        const newA = curA + clamp(dA, -4.2 * dt, 4.2 * dt);
        t.vx = Math.cos(newA) * sp; t.vy = Math.sin(newA) * sp;
      }
    }
    const step = Math.hypot(t.vx * dt, t.vy * dt);
    t.x += t.vx * dt; t.y += t.vy * dt;
    t.traveled += step;
    // Godhead: the tear carries a damage aura that ticks while it flies
    if (t.aura > 0) {
      t.auraT -= dt;
      if (t.auraT <= 0) {
        t.auraT = 0.22;
        for (const e of G.enemies) {
          if (e.dead || e.spawnT > 0 || (e.z || 0) > 30) continue;
          if (dist(t.x, t.y, e.x, e.y) < 30 + t.r + e.r) damageEnemy(G, e, t.aura, t.vx, t.vy);
        }
      }
    }
    let splash = false;
    if (t.traveled >= t.range) splash = true;
    // rocks block ordinary tears; spectral tears (Ouija Board) fly right through
    if (!splash && !t.spectral && pointHitsRock(room, t.x, t.y)) splash = true;
    const hitW = t.x < FLOOR_X + 4 || t.x > FLOOR_X + FLOOR_W - 4;
    const hitH = t.y < FLOOR_Y + 4 || t.y > FLOOR_Y + FLOOR_H - 4;
    if (hitW || hitH) {
      if (t.bounce > 0 && !splash) {
        t.bounce--;
        if (hitW) { t.vx = -t.vx; t.x = clamp(t.x, FLOOR_X + 5, FLOOR_X + FLOOR_W - 5); }
        if (hitH) { t.vy = -t.vy; t.y = clamp(t.y, FLOOR_Y + 5, FLOOR_Y + FLOOR_H - 5); }
        if (t.hitSet) t.hitSet.clear();
        t.traveled = Math.max(0, t.traveled - t.range * 0.25);
      } else {
        splash = true;
      }
    }
    // hit enemies
    if (!splash) {
      for (const e of G.enemies) {
        if (e.dead || e.spawnT > 0 || (e.z || 0) > 30) continue;
        if (t.hitSet && t.hitSet.has(e)) continue;
        if (dist(t.x, t.y, e.x, e.y) < t.r + e.r) {
          // Knight: armored front — tears flying against its facing clang off
          if (knightBlocksTear(e, t.vx, t.vy)) {
            splash = true;
            spawnSplash(G, t.x, t.y, '#cfd3da');
            break;
          }
          damageEnemy(G, e, tearDamage(t), t.vx, t.vy);
          if (t.poison > 0) { e.poison = t.poison; e.poisonT = 3; }
          if (t.slow > 0) e.slowT = 1.6;
          if (t.hitSet) t.hitSet.add(e);
          if (!t.piercing) splash = true;
          break;
        }
      }
    }
    if (splash) onTearEnd(G, t);
  }
  G.tears = G.tears.filter(t => !t.dead);
}

// central hook fired when a tear dies: explosions, splitting, splash visuals
function onTearEnd(G, t) {
  t.dead = true;
  if (t.explosive > 0) explodeAt(G, t.x, t.y, t.explosive, t.damage, t.selfHarm);
  if (t.split > 0) {
    // The Parasite: the tear bursts into two weaker shards, perpendicular
    const a = Math.atan2(t.vy, t.vx) + Math.PI / 2;
    const sp = Math.max(220, Math.hypot(t.vx, t.vy) * 0.8);
    for (const s of [-1, 1]) {
      G.tears.push({
        x: t.x, y: t.y, vx: Math.cos(a) * sp * s, vy: Math.sin(a) * sp * s,
        r: Math.max(3, t.r * 0.6), damage: t.damage * 0.5, crit: false,
        traveled: 0, range: 150, homing: false, piercing: false, bounce: 0,
        explosive: 0, selfHarm: false, poison: t.poison, slow: t.slow,
        spectral: t.spectral, split: 0, aura: 0, auraT: 0, distGrow: 0, distShrink: 0,
        hitSet: null, color: t.color, dead: false,
      });
    }
  }
  spawnSplash(G, t.x, t.y, t.color || PAL.tear);
}

// does the knight's frontal shield stop a tear moving with velocity (vx,vy)?
function knightBlocksTear(e, vx, vy) {
  if (e.type !== 'knight') return false;
  const vl = Math.hypot(vx, vy) || 1;
  // facing is kept pointed at the player each frame; a tear coming head-on
  // travels opposite to the facing vector
  return (vx / vl) * (e.faceX || 0) + (vy / vl) * (e.faceY || 1) < -0.3;
}

// brief freeze on the enemy that got hit — 2 frames, the world keeps running
const HITSTOP_HIT = 2 / 60;

// splash damage shared by explosive tears; selfHarm (Ipecac / Boom Fly)
// makes the blast dangerous to the player too
function explodeAt(G, x, y, radius, damage, selfHarm) {
  for (const e of G.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    if (dist(x, y, e.x, e.y) < radius + e.r) {
      damageEnemy(G, e, damage * 0.7, e.x - x, e.y - y);
    }
  }
  if (selfHarm) {
    const p = G.player;
    if (dist(x, y, p.x, p.y) < radius + p.r) hurtPlayer(G, 1, x, y);
  }
  G.shake = Math.max(G.shake, 6);
  SFX.boom();
  for (let i = 0; i < 14; i++) {
    const a = rand(TAU), s = rand(60, 240);
    G.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
      life: rand(0.2, 0.5), maxLife: 0.5, r: rand(2, 5),
      color: chance(0.5) ? '#f0b23c' : '#8e1b12', grav: 420,
    });
  }
}

function spawnSplash(G, x, y, color) {
  SFX.splash();
  for (let i = 0; i < 6; i++) {
    const a = rand(TAU), s = rand(30, 110);
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: rand(0.25, 0.45), maxLife: 0.45, r: rand(1.5, 3.5), color, grav: 500 });
  }
}

// pickup flourish for the flight item: a ring of drifting white feathers
function spawnFeathers(G, x, y) {
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + rand(-0.2, 0.2);
    const s = rand(50, 150);
    G.particles.push({
      x: x + Math.cos(a) * 8, y: y - 10 + Math.sin(a) * 8,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s - 70,
      life: rand(0.5, 0.95), maxLife: 0.95, r: rand(2, 4.5),
      color: chance(0.7) ? '#ffffff' : '#f4d03f', grav: 60,
    });
  }
}

function spawnBlood(G, x, y, n = 10) {
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), s = rand(40, 160);
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: rand(0.3, 0.6), maxLife: 0.6, r: rand(2, 4.5), color: PAL.blood, grav: 600 });
  }
}

function updateParticles(G, dt) {
  for (const p of G.particles) {
    p.life -= dt;
    p.vy += (p.grav || 0) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  G.particles = G.particles.filter(p => p.life > 0);
}

// --- enemies ---
// Exponential difficulty curve: hp compounds per floor instead of the old
// linear ramp, and touch damage / shot damage step up with depth.
function enemyHpScale(depth) { return Math.pow(1.22, depth - 1); }
function enemyTouchDamage(depth) { return 1 + Math.floor((depth - 1) / 4); } // 1 → 2 → 3
function enemyShotDamage(depth) { return depth >= 7 ? 2 : 1; }

function makeEnemy(type, x, y, depth = 1) {
  const hpScale = enemyHpScale(depth);
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
      if (p.contactDamage > 0) damageEnemy(G, e, p.contactDamage * dt * 6, e.x - p.x, e.y - p.y);
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
  // The Wafer: flat damage reduction, but a hit always costs at least half a heart
  if (p.dmgReduce > 0) dmg = Math.max(1, dmg - p.dmgReduce);
  p.hp -= dmg;
  p.invuln = 1.1 + (p.invulnBonus || 0);
  p.hurtFlash = 0.35;
  G.shake = 10;
  SFX.hurt();
  spawnBlood(G, p.x, p.y, 8);
  // knock player away
  const a = Math.atan2(p.y - fromY, p.x - fromX);
  p.vx += Math.cos(a) * 220;
  p.vy += Math.sin(a) * 220;
  if (p.hp <= 0) {
    if (p.extraLives > 0) {
      // 1-up style revive: back on your feet with half your hearts
      p.extraLives--;
      p.hp = Math.max(2, Math.floor(p.maxHp / 2));
      p.invuln = 2.4;
      G.toast = { title: '死而复生', desc: '剩余复活次数 ' + p.extraLives, t: 2.4 };
      SFX.item();
      return;
    }
    onPlayerDeath(G);
  }
}
