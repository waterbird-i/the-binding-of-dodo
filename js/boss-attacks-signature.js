'use strict';
// ======== signature moves — each belongs to exactly one boss ========
Object.assign(BOSS_ATTACKS, {
  // -- Duodeno: dives underground, tunnels under the player, erupts --
  burrow(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) { e.phase = 1; e.t = 0.4; e.squash = 0.6; return false; }
    if (e.phase === 1) {                      // sink out of sight
      e.squash = 0.6;
      if (e.t > 0) return false;
      e.phase = 2; e.t = e.rage ? 1.5 : 1.2;
      e.fade = 0; e.z = 40;                   // z > 24 turns contact damage off while buried
      SFX.thud();
      return false;
    }
    if (e.phase === 2) {                      // tunnel toward the player, mound telegraph
      const a = aimAt(e, p);
      const sp = e.rage ? 260 : 205;
      e.x = clamp(e.x + Math.cos(a) * sp * dt, FLOOR_X + e.r, FLOOR_X + FLOOR_W - e.r);
      e.y = clamp(e.y + Math.sin(a) * sp * dt, FLOOR_Y + e.r, FLOOR_Y + FLOOR_H - e.r);
      e.mark = { x: e.x, y: e.y };
      if (e.t > 0) return false;
      e.phase = 3; e.t = 0.4;                 // mound trembles: last chance to move
      return false;
    }
    if (e.phase === 3) {
      if (e.t > 0) return false;
      e.fade = 1; e.z = 0; e.mark = null; e.squash = 0.7;
      G.shake = Math.max(G.shake, 10);
      SFX.thud();
      const n = e.rage ? 14 : 10;
      for (let i = 0; i < n; i++) bossShot(G, e, i / n * TAU, rand(180, 260), 6, 1);
      if (dist(p.x, p.y, e.x, e.y) < e.r + 26) hurtPlayer(G, 2, e.x, e.y);
      e.phase = 4; e.t = 0.4;
      return false;
    }
    return e.t <= 0;
  },

  // -- Larvato: one straight dive across the player, shedding a larva lane --
  swoop(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) {
      e.phase = 1; e.t = 0.45; e.squash = 0.4;
      e.data.aim = aimAt(e, p);
      e.aimLine = e.data.aim;
      return false;
    }
    if (e.phase === 1) {
      e.squash = 0.4;
      if (e.t > 0) return false;
      e.aimLine = null;
      const sp = e.rage ? 560 : 460;
      e.vx = Math.cos(e.data.aim) * sp; e.vy = Math.sin(e.data.aim) * sp;
      e.phase = 2; e.t = e.rage ? 0.85 : 0.7; e.data.cd = 0;
      SFX.spit();
      return false;
    }
    if (e.phase === 2) {
      e.x = clamp(e.x + e.vx * dt, FLOOR_X + e.r, FLOOR_X + FLOOR_W - e.r);
      e.y = clamp(e.y + e.vy * dt, FLOOR_Y + e.r, FLOOR_Y + FLOOR_H - e.r);
      e.data.cd -= dt;
      if (e.data.cd <= 0) {                   // larvae peel off sideways, walling the lane
        e.data.cd = 0.09;
        for (const s of [-1, 1]) bossShotFrom(G, e.x, e.y + 8, e.data.aim + s * Math.PI / 2, 80, 5, 1);
      }
      if (e.t <= 0) { e.vx = 0; e.vy = 0; e.phase = 3; e.t = 0.35; }
      return false;
    }
    return e.t <= 0;
  },

  // -- Chubbler: one huge slow orb that detonates into a radial burst --
  burstShot(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) { e.phase = 1; e.t = 0.5; e.mouthOpen = 1; return false; }
    if (e.phase === 1) {
      if (e.t > 0) return false;
      const a = aimAt(e, p);
      const s = { x: e.x, y: e.y + 6, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, r: 14, dmg: 2, bounces: 0, dead: false };
      G.eshots.push(s);
      e.data.orb = s;
      e.phase = 2; e.t = e.rage ? 0.75 : 1.0;
      SFX.spit();
      return false;
    }
    if (e.phase === 2) {
      const s = e.data.orb;
      if (e.t > 0 && !s.dead) return false;
      if (!s.dead) {                          // pop mid-flight into a radial burst
        s.dead = true;
        const n = e.rage ? 12 : 8;
        const off = rand(TAU);
        for (let i = 0; i < n; i++) bossShotFrom(G, s.x, s.y, off + i / n * TAU, 210, 5.5, 1);
        G.shake = Math.max(G.shake, 5);
        SFX.thud();
      }
      e.data.orb = null;
      e.phase = 3; e.t = 0.4;
      return false;
    }
    return e.t <= 0;
  },

  // -- Osseo: bone mortar — marked spots erupt after a beat --
  mortar(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) {
      e.phase = 1; e.t = 0.75; e.mouthOpen = 1;
      const n = e.rage ? 4 : 3;
      e.marks = [];
      for (let i = 0; i < n; i++) {
        const a = rand(TAU), radius = i === 0 ? 0 : rand(60, 170);
        e.marks.push({
          x: clamp(p.x + Math.cos(a) * radius, FLOOR_X + 30, FLOOR_X + FLOOR_W - 30),
          y: clamp(p.y + Math.sin(a) * radius, FLOOR_Y + 30, FLOOR_Y + FLOOR_H - 30),
          r: 34,
        });
      }
      SFX.spit();
      return false;
    }
    if (e.phase === 1) {
      if (e.t > 0) return false;
      for (const m of e.marks) {
        const n = e.rage ? 8 : 6;
        const off = rand(TAU);
        for (let i = 0; i < n; i++) bossShotFrom(G, m.x, m.y, off + i / n * TAU, 190, 5.5, 1);
        if (dist(p.x, p.y, m.x, m.y) < m.r + p.r) hurtPlayer(G, 1, m.x, m.y);
      }
      G.shake = Math.max(G.shake, 8);
      SFX.thud();
      e.marks = null;
      e.phase = 2; e.t = 0.4;
      return false;
    }
    return e.t <= 0;
  },

  // -- Osseo: bone boomerangs that loop back around --
  boomerangs(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) { e.phase = 1; e.t = 0.3; e.data.left = e.rage ? 3 : 2; e.mouthOpen = 1; return false; }
    if (e.t > 0) return false;
    const a = aimAt(e, p);
    addEnemyTear(G, e.x, e.y + 6, a + 0.35, 300, 8, 1, { curve: -520 });
    addEnemyTear(G, e.x, e.y + 6, a - 0.35, 300, 8, 1, { curve: 520 });
    SFX.spit();
    e.data.left--;
    e.t = 0.5;
    return e.data.left <= 0;
  },

  // -- Utero: contraction rings with one rotating safe lane --
  gapRings(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) {
      e.phase = 1; e.t = 0.4; e.mouthOpen = 1;
      e.data.waves = e.rage ? 4 : 3;
      e.data.gap = aimAt(e, p);          // the safe lane starts pointing at the player...
      return false;
    }
    if (e.t > 0) return false;
    const n = 26;
    for (let i = 0; i < n; i++) {
      const frac = i / n * TAU;
      if (frac < 0.55 || frac > TAU - 0.55) continue;   // ~63° opening
      bossShot(G, e, e.data.gap + frac, 150, 5.5, 1);
    }
    SFX.spit();
    e.data.gap += e.rage ? 1.1 : 0.7;    // ...then rotates every wave
    e.data.waves--;
    e.t = 0.6;
    return e.data.waves <= 0;
  },

  // -- Utero: twin counter-rotating blood jets, pulsing with the heartbeat --
  aortaSpray(G, e, dt) {
    if (e.phase === 0) { e.phase = 1; e.data.left = e.rage ? 2.0 : 1.5; e.data.cd = 0; e.data.a = rand(TAU); }
    e.data.left -= dt; e.data.cd -= dt;
    e.mouthOpen = 1;
    if (e.data.cd <= 0) {
      e.data.cd = 0.1;
      e.data.a += 0.5;
      const sp = 165 + Math.sin(e.anim * 4) * 55;
      for (const s of [-1, 1]) bossShotFrom(G, e.x + s * e.r * 0.3, e.y - e.r * 0.72, s * e.data.a, sp, 5.5, 1);
      SFX.spit();
    }
    return e.data.left <= 0;
  },

  // -- Sanguino: blood lances pin the player's row and column --
  lances(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) { e.phase = 1; e.data.left = e.rage ? 3 : 2; e.t = 0.01; return false; }
    if (e.t > 0) return false;
    addEnemyLaser(G, { x: FLOOR_X + 4, y: p.y, angle: 0, len: FLOOR_W - 8, w: 11, warm: 0.55, life: 0.35, spin: 0, dmg: 1 });
    addEnemyLaser(G, { x: p.x, y: FLOOR_Y + 4, angle: Math.PI / 2, len: FLOOR_H - 8, w: 11, warm: 0.55, life: 0.35, spin: 0, dmg: 1 });
    SFX.laser();
    e.data.left--;
    e.t = 1.05;
    return e.data.left <= 0;
  },

  // -- Sanguino: lobbed globs that pop into sprays --
  splitGlobs(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) {
      e.phase = 1; e.t = 0.75; e.mouthOpen = 1;
      const base = aimAt(e, p);
      const n = e.rage ? 4 : 3;
      e.data.globs = [];
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.45;
        const s = { x: e.x, y: e.y + 6, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, r: 11, dmg: 2, bounces: 0, dead: false };
        G.eshots.push(s);
        e.data.globs.push(s);
      }
      SFX.spit();
      return false;
    }
    if (e.t > 0) return false;
    for (const s of e.data.globs) {
      if (s.dead) continue;
      s.dead = true;
      for (let i = 0; i < 5; i++) bossShotFrom(G, s.x, s.y, rand(TAU), rand(160, 240), 5, 1);
    }
    SFX.splash();
    e.data.globs = null;
    return true;
  },

  // -- Sanguino: shuddering panic spray at the player --
  bloodFrenzy(G, e, dt) {
    const p = G.player;
    if (e.phase === 0) { e.phase = 1; e.data.left = e.rage ? 1.6 : 1.1; e.data.cd = 0; }
    e.data.left -= dt; e.data.cd -= dt;
    e.mouthOpen = 1;
    e.x = clamp(e.x + rand(-95, 95) * dt, FLOOR_X + e.r, FLOOR_X + FLOOR_W - e.r);
    e.y = clamp(e.y + rand(-95, 95) * dt, FLOOR_Y + e.r, FLOOR_Y + FLOOR_H - e.r);
    if (e.data.cd <= 0) {
      e.data.cd = 0.06;
      bossShot(G, e, aimAt(e, p) + rand(-0.9, 0.9), rand(200, 330), rand(4.5, 6.5), 1);
      if (chance(0.5)) SFX.spit();
    }
    return e.data.left <= 0;
  },

  // -- Infernus: flame breath — each wave fans wider and slower --
  flameCone(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) {
      e.phase = 1; e.t = 0.45; e.mouthOpen = 1;
      e.data.total = e.rage ? 4 : 3;
      e.data.waves = e.data.total;
      e.data.aim = aimAt(e, p);
      e.aimLine = e.data.aim;
      return false;
    }
    if (e.t > 0) return false;
    e.aimLine = null;
    const wave = e.data.total - e.data.waves;
    const n = e.rage ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const a = e.data.aim + (i - (n - 1) / 2) * (0.12 + wave * 0.1);
      bossShot(G, e, a, 340 - wave * 55, 6, 1);
    }
    SFX.spit();
    e.data.waves--;
    e.t = 0.2;
    return e.data.waves <= 0;
  },

  // -- Infernus: a rolling wall of fire with one gap --
  firewall(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) { e.phase = 1; e.t = 0.55; e.data.walls = e.rage ? 2 : 1; e.squash = 0.45; return false; }
    if (e.t > 0) return false;
    const fromLeft = p.x > W / 2;              // rolls in from the far side
    const x = fromLeft ? FLOOR_X + 12 : FLOOR_X + FLOOR_W - 12;
    const dir = fromLeft ? 0 : Math.PI;
    const gapY = clamp(p.y + rand(-40, 40), FLOOR_Y + 60, FLOOR_Y + FLOOR_H - 60);
    for (let y = FLOOR_Y + 16; y <= FLOOR_Y + FLOOR_H - 16; y += 30) {
      if (Math.abs(y - gapY) < 44) continue;   // one burning gap to slip through
      bossShotFrom(G, x, y, dir, 165, 7, 1);
    }
    G.shake = Math.max(G.shake, 6);
    SFX.laser();
    e.data.walls--;
    e.t = 0.9;
    return e.data.walls <= 0;
  },

  // -- Infernus: lingering embers that crowd his melee range --
  emberSpray(G, e, dt) {
    if (e.phase === 0) { e.phase = 1; e.data.left = e.rage ? 1.6 : 1.2; e.data.cd = 0; }
    e.data.left -= dt; e.data.cd -= dt;
    e.mouthOpen = 1;
    if (e.data.cd <= 0) {
      e.data.cd = 0.07;
      bossShot(G, e, rand(TAU), rand(45, 115), rand(5, 8), 1);
      if (chance(0.35)) SFX.spit();
    }
    return e.data.left <= 0;
  },

  // -- Seraphim: a halo of light closes in on where the player stood --
  halo(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) {
      e.phase = 1; e.t = 0.85;
      const n = e.rage ? 14 : 10;
      e.data.center = { x: p.x, y: p.y };
      e.data.orbs = [];
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU;
        const x = p.x + Math.cos(a) * 150, y = p.y + Math.sin(a) * 150;
        if (x < FLOOR_X + 8 || x > FLOOR_X + FLOOR_W - 8 || y < FLOOR_Y + 8 || y > FLOOR_Y + FLOOR_H - 8) continue;
        const s = { x, y, vx: 0, vy: 0, r: 6.5, dmg: 1, bounces: 0, dead: false };
        G.eshots.push(s);
        e.data.orbs.push(s);
      }
      SFX.spit();
      return false;
    }
    if (e.t > 0) return false;
    for (const s of e.data.orbs) {             // the ring converges all at once
      if (s.dead) continue;
      const a = Math.atan2(e.data.center.y - s.y, e.data.center.x - s.x);
      const sp = e.rage ? 290 : 230;
      s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp;
    }
    SFX.laser();
    e.data.orbs = null;
    return true;
  },

  // -- Seraphim: columns of judgement light, one pinned to the player's x --
  pillars(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) {
      e.phase = 1;
      const n = e.rage ? 5 : 3;
      const xs = [p.x];
      for (let i = 1; i < n; i++) xs.push(rand(FLOOR_X + 40, FLOOR_X + FLOOR_W - 40));
      for (const x of xs) {
        addEnemyLaser(G, { x, y: FLOOR_Y + 4, angle: Math.PI / 2, len: FLOOR_H - 8, w: 15, warm: 0.7, life: 0.75, spin: 0, dmg: 1 });
      }
      SFX.laser();
      e.t = 1.75;
      return false;
    }
    return e.t <= 0;
  },

  // -- Seraphim: fans of feathers that drift apart mid-flight --
  featherBurst(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) { e.phase = 1; e.t = 0.3; e.data.left = e.rage ? 4 : 3; return false; }
    if (e.t > 0) return false;
    const base = aimAt(e, p);
    for (let i = -2; i <= 2; i++) {
      addEnemyTear(G, e.x, e.y, base + i * 0.18, 250, 5.5, 1, { curve: i * 130 });
    }
    SFX.spit();
    e.data.left--;
    e.t = 0.4;
    return e.data.left <= 0;
  },

  // -- Auricus: coins pour inward from every wall --
  wallSqueeze(G, e, dt) {
    e.t -= dt;
    if (e.phase === 0) { e.phase = 1; e.t = 0.6; e.data.waves = e.rage ? 3 : 2; e.mouthOpen = 1; SFX.coin(); return false; }
    if (e.t > 0) return false;
    const sp = 120, step = 72, off = rand(20, step);
    for (let x = FLOOR_X + off; x < FLOOR_X + FLOOR_W - 12; x += step) {
      bossShotFrom(G, x, FLOOR_Y + 10, Math.PI / 2, sp, 6, 1);
      bossShotFrom(G, Math.min(x + step / 2, FLOOR_X + FLOOR_W - 14), FLOOR_Y + FLOOR_H - 10, -Math.PI / 2, sp, 6, 1);
    }
    for (let y = FLOOR_Y + off; y < FLOOR_Y + FLOOR_H - 12; y += step) {
      bossShotFrom(G, FLOOR_X + 10, y, 0, sp, 6, 1);
      bossShotFrom(G, FLOOR_X + FLOOR_W - 10, Math.min(y + step / 2, FLOOR_Y + FLOOR_H - 14), Math.PI, sp, 6, 1);
    }
    SFX.spit();
    e.data.waves--;
    e.t = 1.1;
    return e.data.waves <= 0;
  },

  // -- Auricus: a gem fan that freezes mid-air, then strikes all at once --
  volleyHold(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) {
      e.phase = 1; e.t = 0.5; e.mouthOpen = 1;
      const n = e.rage ? 10 : 7;
      const base = aimAt(e, p);
      e.data.gems = [];
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.22;
        const s = { x: e.x, y: e.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, r: 7, dmg: 1, bounces: 0, dead: false };
        G.eshots.push(s);
        e.data.gems.push(s);
      }
      SFX.coin();
      return false;
    }
    if (e.phase === 1) {                       // gems freeze mid-air...
      if (e.t > 0) return false;
      for (const s of e.data.gems) { if (!s.dead) { s.vx = 0; s.vy = 0; } }
      e.phase = 2; e.t = 0.55;
      return false;
    }
    if (e.t > 0) return false;                 // ...then all strike the player at once
    for (const s of e.data.gems) {
      if (s.dead) continue;
      const a = Math.atan2(p.y - s.y, p.x - s.x);
      s.vx = Math.cos(a) * 340; s.vy = Math.sin(a) * 340;
    }
    SFX.laser();
    e.data.gems = null;
    return true;
  },

  // -- Umbra: goes half-corporeal, lunges through, snaps a fan back --
  phantomDash(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) {
      e.phase = 1; e.t = 0.4;
      if (e.data.dashes == null) e.data.dashes = e.rage ? 2 : 1;
      e.data.aim = aimAt(e, p);
      e.aimLine = e.data.aim;
      return false;
    }
    if (e.phase === 1) {
      e.data.aim = lerpAngle(e.data.aim, aimAt(e, p), Math.min(1, dt * 4));
      e.aimLine = e.data.aim;
      if (e.t > 0) return false;
      e.aimLine = null;
      e.fade = 0.25;                           // half-corporeal for the lunge
      const sp = e.rage ? 640 : 540;
      e.vx = Math.cos(e.data.aim) * sp; e.vy = Math.sin(e.data.aim) * sp;
      e.phase = 2; e.t = 0.5;
      SFX.thud();
      return false;
    }
    if (e.phase === 2) {
      e.x = clamp(e.x + e.vx * dt, FLOOR_X + e.r, FLOOR_X + FLOOR_W - e.r);
      e.y = clamp(e.y + e.vy * dt, FLOOR_Y + e.r, FLOOR_Y + FLOOR_H - e.r);
      if (e.t > 0) return false;
      e.vx = 0; e.vy = 0; e.fade = 1;
      const base = aimAt(e, p);                // rematerializes, snaps a fan back
      for (let i = -2; i <= 2; i++) bossShot(G, e, base + i * 0.22, 300, 6, 1);
      SFX.spit();
      e.data.dashes--;
      if (e.data.dashes > 0) { e.phase = 0; e.t = 0; return false; }
      e.phase = 3; e.t = 0.35;
      return false;
    }
    return e.t <= 0;
  },

  // -- Umbra: two interweaving serpentine bullet streams --
  shadowSnake(G, e, dt) {
    const p = G.player;
    if (e.phase === 0) {
      e.phase = 1;
      e.data.left = e.rage ? 1.7 : 1.3;
      e.data.cd = 0; e.data.i = 0;
      e.data.aim = aimAt(e, p);
    }
    e.data.left -= dt; e.data.cd -= dt;
    if (e.data.cd <= 0) {
      e.data.cd = 0.06;
      e.data.i++;
      const wob = Math.sin(e.data.i * 0.9) * 0.25;
      addEnemyTear(G, e.x, e.y, e.data.aim + wob, 230, 6, 1, { curve: e.data.i % 2 ? 240 : -240 });
      if (e.data.i % 3 === 0) SFX.spit();
    }
    return e.data.left <= 0;
  },

  // -- Umbra: watching eyes materialize on the player's flanks and snipe --
  watchers(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) {
      e.phase = 1; e.t = 0.7;
      const n = e.rage ? 4 : 3;
      e.data.eyes = [];
      for (let i = 0; i < n; i++) {
        const a = rand(TAU), radius = rand(120, 220);
        const s = {
          x: clamp(p.x + Math.cos(a) * radius, FLOOR_X + 20, FLOOR_X + FLOOR_W - 20),
          y: clamp(p.y + Math.sin(a) * radius, FLOOR_Y + 20, FLOOR_Y + FLOOR_H - 20),
          vx: 0, vy: 0, r: 8, dmg: 1, bounces: 0, dead: false,
        };
        G.eshots.push(s);
        e.data.eyes.push(s);
      }
      e.data.volleys = e.rage ? 3 : 2;
      SFX.spit();
      return false;
    }
    if (e.t > 0) return false;
    for (const s of e.data.eyes) {
      if (s.dead) continue;
      bossShotFrom(G, s.x, s.y, Math.atan2(p.y - s.y, p.x - s.x), 300, 5, 1);
    }
    SFX.spit();
    if (--e.data.volleys > 0) { e.t = 0.5; return false; }
    for (const s of e.data.eyes) s.dead = true;   // the eyes blink shut
    e.data.eyes = null;
    return true;
  },

  // -- MEGA dodo: four-armed windmill that reverses direction halfway --
  windmill(G, e, dt) {
    if (e.phase === 0) {
      e.phase = 1;
      e.data.left = e.rage ? 2.6 : 2.1;
      e.data.flip = e.data.left / 2;
      e.data.dir = chance(0.5) ? 1 : -1;
      e.data.cd = 0;
    }
    e.data.left -= dt; e.data.cd -= dt;
    e.mouthOpen = 1;
    if (!e.data.flipped && e.data.left < e.data.flip) { e.data.flipped = true; e.data.dir *= -1; SFX.thud(); }
    if (e.data.cd <= 0) {
      e.data.cd = 0.1;
      e.angle += 0.34 * e.data.dir;
      for (let k = 0; k < 4; k++) bossShot(G, e, e.angle + k * Math.PI / 2, 190, 6, 1);
      SFX.spit();
    }
    return e.data.left <= 0;
  },

  // -- MEGA dodo: lobbed eggs burst AND hatch flies --
  eggBombs(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) {
      e.phase = 1; e.t = 0.9; e.mouthOpen = 1;
      e.marks = [];
      const n = e.rage ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const a = rand(TAU), radius = i === 0 ? rand(0, 40) : rand(70, 170);
        e.marks.push({
          x: clamp(p.x + Math.cos(a) * radius, FLOOR_X + 36, FLOOR_X + FLOOR_W - 36),
          y: clamp(p.y + Math.sin(a) * radius, FLOOR_Y + 36, FLOOR_Y + FLOOR_H - 36),
          r: 30,
        });
      }
      SFX.spit();
      return false;
    }
    if (e.phase === 1) {
      if (e.t > 0) return false;
      for (const m of e.marks) {
        const off = rand(TAU);
        for (let i = 0; i < 8; i++) bossShotFrom(G, m.x, m.y, off + i / 8 * TAU, 200, 5.5, 1);
        if (dist(p.x, p.y, m.x, m.y) < m.r + p.r) hurtPlayer(G, 1, m.x, m.y);
        G.enemies.push(makeEnemy('fly', m.x, m.y, G.floorNum));
      }
      SFX.boom();
      e.marks = null;
      e.phase = 2; e.t = 0.4;
      return false;
    }
    return e.t <= 0;
  },

  // -- MEGA dodo: one sustained beam that hunts the player --
  megaBeam(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) {
      e.phase = 1;
      const life = e.rage ? 2.6 : 2.0;
      addEnemyLaser(G, { x: e.x, y: e.y, angle: aimAt(e, p), len: 900, w: 16, warm: 0.8, life, spin: 0, dmg: 2, src: e });
      e.data.beam = G.lasers[G.lasers.length - 1];
      e.t = 0.8 + life + 0.2;
      SFX.laser();
      return false;
    }
    const l = e.data.beam;
    if (l && !l.dead) {
      // tracks fast while warming up, slow enough to outrun once firing
      const rate = l.warm > 0 ? 3 : (e.rage ? 1.1 : 0.8);
      let dA = aimAt(e, p) - l.angle;
      while (dA > Math.PI) dA -= TAU;
      while (dA < -Math.PI) dA += TAU;
      l.angle += clamp(dA, -rate * dt, rate * dt);
    }
    if (e.t <= 0) { e.data.beam = null; return true; }
    return false;
  },

  // -- MEGA dodo: rains marked strikes from above, then crashes down --
  skyfall(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) { e.phase = 1; e.t = 0.35; e.squash = 0.6; return false; }
    if (e.phase === 1) {                       // launch off screen
      e.squash = 0.6;
      if (e.t > 0) return false;
      e.phase = 2; e.vz = 950;
      return false;
    }
    if (e.phase === 2) {
      e.vz -= 300 * dt; e.z += e.vz * dt;
      if (e.z >= 420) {
        e.z = 420; e.vz = 0;
        e.phase = 3; e.t = 0.5;
        e.data.strikes = e.rage ? 4 : 3;
        e.mark = { x: p.x, y: p.y };
      }
      return false;
    }
    if (e.phase === 3) {                       // bullet strikes chase the player's shadow
      if (e.t > 0.2) { e.mark.x = p.x; e.mark.y = p.y; }   // mark locks just before impact
      if (e.t > 0) return false;
      const m = e.mark;
      const off = rand(TAU);
      for (let i = 0; i < 10; i++) bossShotFrom(G, m.x, m.y, off + i / 10 * TAU, 210, 6, 1);
      if (dist(p.x, p.y, m.x, m.y) < 40 + p.r) hurtPlayer(G, 1, m.x, m.y);
      G.shake = Math.max(G.shake, 8);
      SFX.thud();
      e.data.strikes--;
      if (e.data.strikes > 0) { e.t = 0.55; e.mark = { x: p.x, y: p.y }; return false; }
      e.phase = 4;                             // the boss itself crashes on the last mark
      e.mark = { x: p.x, y: p.y };
      e.x = clamp(p.x, FLOOR_X + e.r, FLOOR_X + FLOOR_W - e.r);
      e.y = clamp(p.y, FLOOR_Y + e.r, FLOOR_Y + FLOOR_H - e.r);
      e.vz = -150;
      return false;
    }
    e.vz -= 2800 * dt; e.z += e.vz * dt;
    if (e.z > 0) return false;
    e.z = 0; e.vz = 0; e.squash = 0.9; e.mark = null;
    G.shake = Math.max(G.shake, 14);
    SFX.thud();
    const n = e.rage ? 18 : 14;
    for (let i = 0; i < n; i++) bossShot(G, e, i / n * TAU, 240, 6.5, 1);
    if (dist(p.x, p.y, e.x, e.y) < e.r + 30) hurtPlayer(G, 2, e.x, e.y);
    return true;
  },

  // -- MEGA dodo: the apocalypse — strike zones blanket the entire arena and
  // exactly one pocket is spared; the pocket opens NEAR the player, never on
  // them, so standing still is death. In rage it repeats immediately with
  // the pocket moved somewhere else.
  apocalypse(G, e, dt) {
    const p = G.player;
    e.t -= dt;
    if (e.phase === 0) {
      if (e.data.waves == null) e.data.waves = e.rage ? 2 : 1;
      const a = rand(TAU);
      const safe = {
        x: clamp(p.x + Math.cos(a) * rand(120, 190), FLOOR_X + 70, FLOOR_X + FLOOR_W - 70),
        y: clamp(p.y + Math.sin(a) * rand(120, 190), FLOOR_Y + 70, FLOOR_Y + FLOOR_H - 70),
      };
      e.marks = [];
      const step = 124;
      for (let gy = FLOOR_Y + step / 2; gy < FLOOR_Y + FLOOR_H; gy += step) {
        for (let gx = FLOOR_X + step / 2; gx < FLOOR_X + FLOOR_W; gx += step) {
          const mx = gx + rand(-14, 14), my = gy + rand(-14, 14);
          if (dist(mx, my, safe.x, safe.y) < 108) continue;   // the one safe pocket
          e.marks.push({ x: mx, y: my, r: 56 });
        }
      }
      e.phase = 1;
      e.t = 1.25;
      e.mouthOpen = 1;
      G.shake = Math.max(G.shake, 5);
      SFX.laser();
      return false;
    }
    if (e.phase === 1) {
      e.mouthOpen = 1;
      if (e.t > 0) return false;
      let hit = false;
      for (const m of e.marks) {
        const off = rand(TAU);
        for (let i = 0; i < 3; i++) bossShotFrom(G, m.x, m.y, off + i / 3 * TAU, 165, 5.5, 1);
        if (!hit && dist(p.x, p.y, m.x, m.y) < m.r + p.r) { hit = true; hurtPlayer(G, 2, m.x, m.y); }
      }
      e.marks = null;
      G.shake = Math.max(G.shake, 16);
      SFX.boom();
      if (--e.data.waves > 0) { e.phase = 0; e.t = 0; return false; }
      e.phase = 2;
      e.t = 0.7;
      return false;
    }
    return e.t <= 0;
  },
});

// pool of minions a boss can summon, matched to how deep the floor is
function minionPool(depth) {
  if (depth <= 2) return ['fly', 'gaper'];
  if (depth <= 6) return ['fly', 'gaper', 'hopper', 'boomfly'];
  if (depth <= 9) return ['gaper', 'spitter', 'hopper', 'sentry', 'globin'];
  return ['spitter', 'sentry', 'globin', 'hopper', 'knight', 'boomfly'];
}
