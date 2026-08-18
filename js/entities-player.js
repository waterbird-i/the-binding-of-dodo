'use strict';
// ============ player / tears / enemies ============

function makePlayer(charId) {
  const p = {
    charId: charId || 'dodo',
    x: W / 2, y: H / 2, r: 13,
    vx: 0, vy: 0,
    hp: 6, maxHp: 6,               // in half-hearts
    soulHp: 0,                     // soul hearts (half-hearts), always spent before red
    soulOverflow: false,           // dark dodo: hearts picked up at full health become soul hearts
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
    appearance: { headColor: '#f7f3e9', eyeColor: '#17110c', hat: null, big: false, tearColor: null, aura: null, brow: null },
    coins: 0,
    bombs: 3,                      // consumable bombs, placed with E
    active: null,                  // spacebar item: { def, charge } (charge in bars)
    compass: false,                // reveals special rooms on the map
    treasureMap: false,            // reveals the whole floor layout
    blueMap: false,                // reveals secret rooms
    itemsTaken: [],
    transforms: {},                // transformation id -> true (3 items of a set)
  };
  // character variants: same rig, new tint + a shifted starting statline (js/meta.js)
  const cd = typeof CHAR_BY_ID !== 'undefined' ? CHAR_BY_ID[p.charId] : null;
  if (cd && cd.apply) cd.apply(p);
  return p;
}

// stat guard rails so stacked items can't break the game (Isaac clamps too)
function clampPlayerStats(p) {
  // 迷失 dodo lives on half a heart forever: hp-ups and soul hearts slide off
  if (p.charId === 'lost') { p.maxHp = 1; p.hp = Math.min(p.hp, 1); p.soulHp = 0; }
  p.damage = clamp(p.damage, 0.5, 90);
  p.fireDelay = clamp(p.fireDelay, 0.08, 1.2);
  p.shotSpeed = clamp(p.shotSpeed, 180, 1000);
  p.range = clamp(p.range, 140, 1400);
  p.moveSpeed = clamp(p.moveSpeed, 120, 560);
  p.tearSize = clamp(p.tearSize, 3, 26);
  p.multishot = clamp(p.multishot, 1, 9);
  p.maxHp = clamp(p.maxHp, p.charId === 'lost' ? 1 : 2, 24);
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
  p.soulHp = clamp(p.soulHp || 0, 0, 12);
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
      damage: p.damage * rageDmgMul(p) * (crit ? p.critMul : 1),
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
      color: crit ? '#ffe9a8' : (rageBerserk(p) ? '#c9231a' : p.appearance.tearColor),
      dead: false,
    });
  }
  p.fireCd = p.fireDelay * rageFireMul(p);
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
    const dmg = p.damage * rageDmgMul(p) * 3.6 * dmgMul * inherentMul * (crit ? p.critMul : 1);
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
  p.fireCd = p.fireDelay * rageFireMul(p) * 1.8;
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

