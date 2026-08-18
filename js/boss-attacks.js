'use strict';
const BOSS_ATTACKS = {
  // Monstro's "coughs up a big mess of tears": aimed spread, mixed bullet sizes
  vomit(G, e, dt) {
    const p = G.player;
    e.mouthOpen = 1;
    if (e.phase === 0) { e.phase = 1; e.t = 0.5; e.data.bursts = e.rage ? 3 : 2; return false; }
    e.t -= dt;
    if (e.t > 0) return false;
    const base = aimAt(e, p);
    const n = e.rage ? 11 : 8;
    for (let i = 0; i < n; i++) {
      const a = base + rand(-0.6, 0.6);
      const big = chance(0.3);
      bossShot(G, e, a, rand(160, 320), big ? rand(9, 11) : rand(5, 7), big ? 2 : 1);
    }
    SFX.spit();
    G.shake = Math.max(G.shake, 4);
    e.data.bursts--;
    e.t = 0.5;
    return e.data.bursts <= 0;
  },

  // three tracking hops, each landing throws bullets sideways
  hop3(G, e, dt) {
    const p = G.player;
    if (e.phase === 0) { e.phase = 1; e.hops = e.rage ? 4 : 3; e.vz = 0; e.z = 0; }
    if (e.z > 0 || e.vz > 0) {
      e.vz -= 1400 * dt; e.z += e.vz * dt;
      e.x += e.vx * dt; e.y += e.vy * dt;
      collideWithRoom(e, G.room, true);
      if (e.z <= 0) {
        e.z = 0; e.vz = 0; e.vx = 0; e.vy = 0; e.squash = 0.5;
        G.shake = Math.max(G.shake, 6);
        SFX.thud();
        const n = e.rage ? 6 : 4;
        for (let i = 0; i < n; i++) bossShot(G, e, i / n * TAU + Math.PI / n, 200, 6, 1);
        e.hops--;
      }
      return false;
    }
    if (e.hops <= 0) return true;
    const a = aimAt(e, p) + rand(-0.3, 0.3);
    const sp = rand(200, 260);
    e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp; e.vz = 340; e.z = 0.01;
    return false;
  },

  // jumps off screen, marks the spot under the player, comes down hard
  slam(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) { e.phase = 1; e.t = 0.4; e.squash = 0.7; return false; }
    if (e.phase === 1) {
      if (e.t > 0) { e.squash = 0.7; return false; }
      e.phase = 2; e.vz = 900; e.t = 0;
      return false;
    }
    if (e.phase === 2) {                       // rise out of the room
      e.vz -= 300 * dt; e.z += e.vz * dt;
      if (e.z >= 400) { e.z = 400; e.vz = 0; e.phase = 3; e.t = 0.6; e.mark = { x: p.x, y: p.y }; }
      return false;
    }
    if (e.phase === 3) {                       // hover and track the landing spot
      if (e.t > 0.25) { e.mark = { x: p.x, y: p.y }; }
      const m = e.mark;
      e.x += (m.x - e.x) * Math.min(1, dt * 5);
      e.y += (m.y - e.y) * Math.min(1, dt * 5);
      if (e.t <= 0) { e.phase = 4; e.vz = -80; }
      return false;
    }
    e.vz -= 2600 * dt; e.z += e.vz * dt;       // slam down
    if (e.z > 0) return false;
    e.z = 0; e.vz = 0; e.squash = 0.9;
    G.shake = Math.max(G.shake, 15);
    SFX.thud();
    const n = e.rage ? 16 : 12;
    for (let i = 0; i < n; i++) bossShot(G, e, i / n * TAU, 230, 7, 1);
    if (dist(p.x, p.y, e.x, e.y) < e.r + 34) hurtPlayer(G, 2, e.x, e.y);
    e.mark = null;
    return true;
  },

  // stationary bullet rings
  ring(G, e, dt) {
    e.t -= dt;
    if (e.phase === 0) { e.phase = 1; e.t = 0.35; e.data.waves = e.rage ? 3 : 2; e.mouthOpen = 1; return false; }
    if (e.t > 0) return false;
    const n = e.rage ? 16 : 12;
    const off = rand(TAU);
    for (let i = 0; i < n; i++) bossShot(G, e, off + i / n * TAU, 215, 6.5, 1);
    SFX.spit();
    e.data.waves--;
    e.t = 0.45;
    return e.data.waves <= 0;
  },

  // rotating stream
  spiral(G, e, dt) {
    if (e.phase === 0) { e.phase = 1; e.data.left = e.rage ? 2.1 : 1.5; e.data.cd = 0; e.data.arms = e.rage ? 2 : 1; }
    e.data.left -= dt;
    e.data.cd -= dt;
    e.mouthOpen = 1;
    if (e.data.cd <= 0) {
      e.data.cd = 0.09;
      e.angle += 0.42;
      for (let k = 0; k < e.data.arms; k++) bossShot(G, e, e.angle + k * Math.PI, 200, 6, 1);
      SFX.spit();
    }
    return e.data.left <= 0;
  },

  // telegraphed charge that ricochets off the walls
  dash(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) {
      e.phase = 1; e.t = 0.5; e.squash = 0.45;
      e.data.aim = aimAt(e, p);
      return false;
    }
    if (e.phase === 1) {
      e.squash = 0.45;
      if (e.t > 0) return false;
      const sp = e.rage ? 700 : 580;
      e.vx = Math.cos(e.data.aim) * sp; e.vy = Math.sin(e.data.aim) * sp;
      e.phase = 2; e.t = e.rage ? 1.5 : 1.1;
      SFX.thud();
      return false;
    }
    e.x += e.vx * dt; e.y += e.vy * dt;
    // bounce off the room bounds
    if (e.x < FLOOR_X + e.r) { e.x = FLOOR_X + e.r; e.vx = Math.abs(e.vx); G.shake = Math.max(G.shake, 7); }
    if (e.x > FLOOR_X + FLOOR_W - e.r) { e.x = FLOOR_X + FLOOR_W - e.r; e.vx = -Math.abs(e.vx); G.shake = Math.max(G.shake, 7); }
    if (e.y < FLOOR_Y + e.r) { e.y = FLOOR_Y + e.r; e.vy = Math.abs(e.vy); G.shake = Math.max(G.shake, 7); }
    if (e.y > FLOOR_Y + FLOOR_H - e.r) { e.y = FLOOR_Y + FLOOR_H - e.r; e.vy = -Math.abs(e.vy); G.shake = Math.max(G.shake, 7); }
    if (e.t <= 0) { e.vx = 0; e.vy = 0; return true; }
    return false;
  },

  // spits out minions from the floor's own enemy pool
  summon(G, e, dt) {
    e.t -= dt;
    if (e.phase === 0) { e.phase = 1; e.t = 0.5; e.mouthOpen = 1; return false; }
    if (e.phase === 1) {
      if (e.t > 0) return false;
      const n = (e.rage ? 4 : 3);
      for (let i = 0; i < n; i++) {
        const a = rand(TAU), rad = rand(70, 150);
        const x = clamp(e.x + Math.cos(a) * rad, FLOOR_X + 40, FLOOR_X + FLOOR_W - 40);
        const y = clamp(e.y + Math.sin(a) * rad, FLOOR_Y + 40, FLOOR_Y + FLOOR_H - 40);
        G.enemies.push(makeEnemy(pick(minionPool(G.floorNum)), x, y, G.floorNum));
      }
      SFX.spit();
      e.phase = 2; e.t = 0.35;
      return false;
    }
    return e.t <= 0;
  },

  // locks an angle, draws the warning line, then fires a hitscan beam
  laser(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) {
      e.phase = 1; e.t = 0.55;
      e.data.shots = e.rage ? 2 : 1;
      e.data.aim = aimAt(e, p);
      e.aimLine = e.data.aim;
      return false;
    }
    if (e.phase === 1) {
      if (e.t > 0.12) e.data.aim = lerpAngle(e.data.aim, aimAt(e, p), Math.min(1, dt * 3));
      e.aimLine = e.data.aim;
      if (e.t > 0) return false;
      spawnBeam(G, e.x, e.y, e.data.aim, 900, e.rage ? 20 : 15, false, 2);
      e.aimLine = null;
      e.data.shots--;
      if (e.data.shots > 0) { e.phase = 0; e.t = 0; return false; }
      e.phase = 2; e.t = 0.4;
      return false;
    }
    return e.t <= 0;
  },

  // room-filling persistent lasers: several beams fan out from the boss,
  // telegraph with dashed purple lines, then sweep the whole arena
  sweepLasers(G, e, dt) {
    if (e.phase === 0) {
      e.phase = 1;
      const n = e.rage ? 6 : 4;
      const off = rand(TAU);
      const spin = (chance(0.5) ? 1 : -1) * (e.rage ? 1.05 : 0.8);
      const life = e.rage ? 2.6 : 2.1;
      for (let i = 0; i < n; i++) {
        addEnemyLaser(G, {
          x: e.x, y: e.y, angle: off + i / n * TAU, len: 900, w: 13,
          warm: 0.7, life, spin, dmg: 1, src: e,
        });
      }
      e.t = 0.7 + life + 0.3;
      e.mouthOpen = 1;
      SFX.laser();
      return false;
    }
    e.mouthOpen = 1;
    e.t -= dt;
    return e.t <= 0;
  },

  // volley of tracking + arcing shots (敌方追踪弹 / 弧线弹)
  seekers(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) { e.phase = 1; e.t = 0.35; e.data.left = e.rage ? 4 : 3; e.mouthOpen = 1; return false; }
    if (e.t > 0) return false;
    const a = aimAt(e, p);
    addEnemyTear(G, e.x, e.y + 6, a, 200, 7.5, 1, { homing: 2.3, homeT: 1.6 });
    addEnemyTear(G, e.x, e.y + 6, a + 0.5, 230, 6, 1, { curve: 260 });
    addEnemyTear(G, e.x, e.y + 6, a - 0.5, 230, 6, 1, { curve: -260 });
    SFX.spit();
    e.data.left--;
    e.t = 0.42;
    return e.data.left <= 0;
  },

  // three quick aimed shots that lead the player slightly
  aimed3(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) { e.phase = 1; e.t = 0.28; e.data.left = e.rage ? 5 : 3; return false; }
    if (e.t > 0) return false;
    const lead = 0.16;
    const a = Math.atan2(p.y + p.vy * lead - e.y, p.x + p.vx * lead - e.x);
    bossShot(G, e, a, 330, 7, 1);
    SFX.spit();
    e.data.left--;
    e.t = 0.22;
    return e.data.left <= 0;
  },

  // axis crosses, rotated 45° every wave
  cross(G, e, dt) {
    e.t -= dt;
    if (e.phase === 0) { e.phase = 1; e.t = 0.3; e.data.waves = e.rage ? 4 : 3; return false; }
    if (e.t > 0) return false;
    const off = (e.data.waves % 2) * Math.PI / 4;
    for (let i = 0; i < 4; i++) bossShot(G, e, off + i / 4 * TAU, 250, 7, 1);
    SFX.spit();
    e.data.waves--;
    e.t = 0.34;
    return e.data.waves <= 0;
  },

  // six shots that ricochet twice off the walls
  bounce6(G, e, dt) {
    e.t -= dt;
    if (e.phase === 0) { e.phase = 1; e.t = 0.4; e.mouthOpen = 1; return false; }
    if (e.phase === 1) {
      if (e.t > 0) return false;
      const n = e.rage ? 8 : 6;
      const off = rand(TAU);
      for (let i = 0; i < n; i++) bossShot(G, e, off + i / n * TAU, 260, 6, 1, 2);
      SFX.spit();
      e.phase = 2; e.t = 0.45;
      return false;
    }
    return e.t <= 0;
  },

  // blinks out, reappears beside the player, opens with a burst
  teleport(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) { e.phase = 1; e.t = 0.28; return false; }
    if (e.phase === 1) {                                  // fade out
      e.fade = clamp(e.t / 0.28, 0, 1);
      if (e.t > 0) return false;
      let x = e.x, y = e.y;
      for (let i = 0; i < 24; i++) {
        const a = rand(TAU), rad = rand(140, 230);
        x = clamp(p.x + Math.cos(a) * rad, FLOOR_X + e.r + 6, FLOOR_X + FLOOR_W - e.r - 6);
        y = clamp(p.y + Math.sin(a) * rad, FLOOR_Y + e.r + 6, FLOOR_Y + FLOOR_H - e.r - 6);
        if (dist(x, y, p.x, p.y) > 110) break;
      }
      e.x = x; e.y = y;
      e.phase = 2; e.t = 0.28;
      return false;
    }
    if (e.phase === 2) {                                  // fade in
      e.fade = clamp(1 - e.t / 0.28, 0, 1);
      if (e.t > 0) return false;
      e.fade = 1;
      const n = e.rage ? 10 : 8;
      const off = aimAt(e, p);
      for (let i = 0; i < n; i++) bossShot(G, e, off + i / n * TAU, 240, 6.5, 1);
      SFX.spit();
      e.phase = 3; e.t = 0.35;
      return false;
    }
    return e.t <= 0;
  },

  // bullets rain down from the top of the room
  rain(G, e, dt) {
    if (e.phase === 0) { e.phase = 1; e.data.left = e.rage ? 2.4 : 1.7; e.data.cd = 0; e.mouthOpen = 1; }
    e.data.left -= dt;
    e.data.cd -= dt;
    if (e.data.cd <= 0) {
      e.data.cd = e.rage ? 0.09 : 0.14;
      const x = rand(FLOOR_X + 20, FLOOR_X + FLOOR_W - 20);
      G.eshots.push({ x, y: FLOOR_Y + 8, vx: rand(-30, 30), vy: rand(230, 300), r: rand(5, 8), dmg: 1, bounces: 0, dead: false });
      if (e.rage) {
        const y = rand(FLOOR_Y + 20, FLOOR_Y + FLOOR_H - 20);
        G.eshots.push({ x: FLOOR_X + 8, y, vx: rand(230, 300), vy: rand(-30, 30), r: rand(5, 8), dmg: 1, bounces: 0, dead: false });
      }
      SFX.spit();
    }
    return e.data.left <= 0;
  },
};
