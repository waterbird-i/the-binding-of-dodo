'use strict';
// ============ bosses: 12 floor bosses + 1 true final boss ============
// Every fight is composed from three axes so no two read alike:
//   form   – how the body is drawn
//   move   – what it does between attacks
//   attacks– 2..4 entries from BOSS_ATTACKS below
// Isaac reference: bosses telegraph, then commit; below 50% hp they enrage
// (shorter gaps, denser bullets), exactly like Monstro's second phase.
// HP: floor 1 stays a gentle tutorial fight; floors 2+ climb an exponential
// curve (~×1.32 per floor from a much higher base). On top of that, makeBoss
// enforces a lower bound of ~30 seconds of the player's estimated dps, so a
// stacked build can never melt a boss instantly. Touch damage steps up by
// chapter, so the late game actually bites.
const BOSS_DEFS = [
  {
    id: 'gluttono', name: 'Gluttono', hp: 300, r: 46, touchDamage: 2,
    form: 'blob', move: 'hop', pal: { skin: '#cf6f5f', dark: '#7a2b20' },
    features: { teeth: true, eyes: 2, mouth: 'wide' },
    attacks: ['vomit', 'hop3', 'slam'],
  },
  {
    id: 'duodeno', name: 'Duodeno', hp: 900, r: 42, touchDamage: 2,
    form: 'worm', move: 'chase', pal: { skin: '#d8a98c', dark: '#8a5a3c' },
    features: { eyes: 2, mouth: 'round' },
    attacks: ['aimed3', 'dash', 'vomit'],
  },
  {
    id: 'larvato', name: 'Larvato', hp: 1350, r: 40, touchDamage: 2,
    form: 'fly', move: 'hover', pal: { skin: '#3c3630', dark: '#1d1a17' },
    features: { wings: true, eyes: 2 },
    attacks: ['summon', 'spiral', 'bounce6'],
  },
  {
    id: 'chubbler', name: 'Chubbler', hp: 1950, r: 52, touchDamage: 2,
    form: 'blob', move: 'still', pal: { skin: '#b8c48a', dark: '#5f6b3c' },
    features: { teeth: true, eyes: 1, mouth: 'wide' },
    attacks: ['ring', 'dash', 'cross'],
  },
  {
    id: 'osseo', name: 'Osseo', hp: 2750, r: 44, touchDamage: 3,
    form: 'skull', move: 'strafe', pal: { skin: '#e6ddc6', dark: '#9d9377' },
    features: { eyes: 2, glow: '#7fd8e8' },
    attacks: ['cross', 'teleport', 'bounce6'],
  },
  {
    id: 'mortuum', name: 'Mortuum', hp: 3800, r: 46, touchDamage: 3,
    form: 'reaper', move: 'hover', pal: { skin: '#2c2a34', dark: '#15141b' },
    features: { eyes: 2, glow: '#c9231a' },
    attacks: ['laser', 'aimed3', 'teleport', 'sweepLasers'],
  },
  {
    id: 'utero', name: 'Utero', hp: 5200, r: 48, touchDamage: 3,
    form: 'heart', move: 'still', pal: { skin: '#c1382f', dark: '#6d150f' },
    features: { eyes: 0, veins: true },
    attacks: ['rain', 'ring', 'summon', 'seekers'],
  },
  {
    id: 'sanguino', name: 'Sanguino', hp: 7000, r: 50, touchDamage: 3,
    form: 'blob', move: 'hop', pal: { skin: '#a3231a', dark: '#5c0f09' },
    features: { teeth: true, eyes: 3, mouth: 'wide' },
    attacks: ['vomit', 'rain', 'hop3', 'seekers'],
  },
  {
    id: 'infernus', name: 'Infernus', hp: 9300, r: 50, touchDamage: 4,
    form: 'demon', move: 'chase', pal: { skin: '#8e2b1c', dark: '#4a1109' },
    features: { horns: true, eyes: 2, glow: '#ffb43c', teeth: true },
    attacks: ['laser', 'slam', 'dash', 'sweepLasers'],
  },
  {
    id: 'seraphim', name: 'Seraphim', hp: 12200, r: 46, touchDamage: 4,
    form: 'angel', move: 'strafe', pal: { skin: '#f2ece0', dark: '#b4aa92' },
    features: { wings: true, halo: true, eyes: 2 },
    attacks: ['aimed3', 'cross', 'teleport', 'sweepLasers'],
  },
  {
    id: 'auricus', name: 'Auricus', hp: 15800, r: 50, touchDamage: 4,
    form: 'idol', move: 'still', pal: { skin: '#d9b53a', dark: '#8a6d1d' },
    features: { crown: true, eyes: 2, glow: '#fff2a8' },
    attacks: ['ring', 'spiral', 'summon', 'sweepLasers'],
  },
  {
    id: 'umbra', name: 'Umbra', hp: 20300, r: 48, touchDamage: 4,
    form: 'shadow', move: 'hover', pal: { skin: '#191519', dark: '#000000' },
    features: { eyes: 2, glow: '#e8e2d0' },
    attacks: ['teleport', 'laser', 'rain', 'sweepLasers', 'seekers'],
  },
  {
    id: 'mega_dodo', name: 'MEGA dodo', hp: 26000, r: 54, touchDamage: 4, final: true,
    form: 'dodo', move: 'hop', pal: { skin: '#ffffff', dark: '#b9b1a3' },
    features: { crown: true, eyes: 2 },
    attacks: ['slam', 'spiral', 'vomit', 'dash', 'summon', 'sweepLasers', 'seekers'],
  },
];

const FINAL_BOSS_DEF = BOSS_DEFS[BOSS_DEFS.length - 1];
function bossDefForFloor(depth) { return BOSS_DEFS[clamp(depth, 1, 12) - 1]; }

// Rough per-second output of the current build, assuming shots land.
// Used to size boss hp so the fight can't collapse in a few seconds.
function estimatePlayerDPS(p) {
  let perShot, cycle;
  if (p.laser) {
    const mul = p.multishot > 1 ? 0.72 * p.multishot : 1;
    perShot = p.damage * 3.6 * mul;
    cycle = p.fireDelay * 1.8 + LASER_CHARGE_TIME;   // charge time gates every beam
  } else {
    perShot = p.damage * p.multishot;
    cycle = p.fireDelay;
  }
  let dps = perShot / cycle;
  if (p.crit > 0) dps *= 1 + p.crit * (p.critMul - 1);
  if (p.familiars > 0) dps += p.familiars * Math.max(2, p.damage * 0.5) / 0.7;
  if (p.poison > 0) dps += p.poison;
  return dps;
}

const BOSS_MIN_FIGHT_SECONDS = 30;

function makeBoss(def, x, y) {
  // floor 1 keeps its tutorial-sized hp; every later boss must survive at
  // least ~30s of the player's estimated dps, however stacked the build is
  let hp = def.hp;
  if (G.floorNum > 1) {
    hp = Math.max(hp, Math.round(estimatePlayerDPS(G.player) * BOSS_MIN_FIGHT_SECONDS));
  }
  return {
    type: 'boss', isBoss: true, def, name: def.name,
    x, y, vx: 0, vy: 0, z: 0, vz: 0,
    r: def.r, hp, maxHpRef: hp,
    touchDamage: def.touchDamage || 2,
    anim: rand(10), flash: 0, dead: false, knockX: 0, knockY: 0,
    spawnT: 0.9, spawnMax: 0.9, squash: 0, mouthOpen: 0, fade: 1,
    state: 'idle', t: 1.2, atk: null, phase: 0, data: {},
    mark: null, aimLine: null, rage: false, hops: 0, angle: rand(TAU),
  };
}

// ---------------- top level state machine ----------------
function updateBossAI(G, e, dt) {
  e.squash = Math.max(0, e.squash - dt * 2.5);
  e.mouthOpen = Math.max(0, e.mouthOpen - dt * 2);
  e.rage = e.hp <= e.maxHpRef * 0.5;

  if (e.state === 'idle') {
    e.t -= dt;
    bossMove(G, e, dt);
    if (e.t <= 0) {
      e.atk = pick(e.def.attacks);
      e.state = 'atk';
      e.phase = 0;
      e.t = 0;
      e.data = {};
    }
  } else {
    const fn = BOSS_ATTACKS[e.atk];
    if (!fn || fn(G, e, dt)) {
      e.state = 'idle';
      e.atk = null;
      e.mark = null;
      e.aimLine = null;
      e.t = rand(0.7, 1.4) * (e.rage ? 0.6 : 1);
    }
  }
}

// ---------------- movement styles ----------------
function bossMove(G, e, dt) {
  const p = G.player;
  const dx = p.x - e.x, dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const sp = e.rage ? 1.3 : 1;
  switch (e.def.move) {
    case 'hop':
      if (e.z > 0 || e.vz > 0) {
        e.vz -= 1400 * dt; e.z += e.vz * dt;
        e.x += e.vx * dt; e.y += e.vy * dt;
        collideWithRoom(e, G.room, true);
        if (e.z <= 0) { e.z = 0; e.vz = 0; e.vx = 0; e.vy = 0; e.squash = 0.4; SFX.thud(); G.shake = Math.max(G.shake, 4); }
      } else if (chance(dt * 1.4)) {
        const a = Math.atan2(dy, dx) + rand(-0.4, 0.4);
        e.vx = Math.cos(a) * 150 * sp; e.vy = Math.sin(a) * 150 * sp; e.vz = 300; e.z = 0.01;
      }
      break;
    case 'chase':
      e.x += (dx / d) * 62 * sp * dt;
      e.y += (dy / d) * 62 * sp * dt;
      collideWithRoom(e, G.room, false);
      break;
    case 'hover': {
      const want = d > 250 ? 1 : (d < 170 ? -1 : 0);
      e.x += (dx / d) * 90 * sp * want * dt + Math.sin(e.anim * 1.9) * 34 * dt;
      e.y += (dy / d) * 90 * sp * want * dt + Math.cos(e.anim * 1.5) * 34 * dt;
      collideWithRoom(e, G.room, true);
      break;
    }
    case 'strafe': {
      e.angle += dt * 1.1 * sp;
      const rad = 210;
      const tx = p.x + Math.cos(e.angle) * rad, ty = p.y + Math.sin(e.angle) * rad;
      e.x += (tx - e.x) * Math.min(1, dt * 2.2);
      e.y += (ty - e.y) * Math.min(1, dt * 2.2);
      collideWithRoom(e, G.room, true);
      break;
    }
    case 'still':
    default:
      e.y += Math.sin(e.anim * 2.2) * 12 * dt;
      break;
  }
}

// ---------------- shared attack helpers ----------------
function bossShot(G, e, a, sp, r, dmg, bounces) {
  // deep-floor bosses hit harder with every bullet
  const boost = (G.floorNum || 1) >= 9 ? 1 : 0;
  G.eshots.push({
    x: e.x, y: e.y + 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
    r, dmg: (dmg || 1) + boost, bounces: bounces || 0, dead: false,
  });
}
function aimAt(e, p) { return Math.atan2(p.y - e.y, p.x - e.x); }

// Every attack takes (G, e, dt) and returns true once it has finished.
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

// pool of minions a boss can summon, matched to how deep the floor is
function minionPool(depth) {
  if (depth <= 2) return ['fly', 'gaper'];
  if (depth <= 6) return ['fly', 'gaper', 'hopper', 'boomfly'];
  if (depth <= 9) return ['gaper', 'spitter', 'hopper', 'sentry', 'globin'];
  return ['spitter', 'sentry', 'globin', 'hopper', 'knight', 'boomfly'];
}

// ================= boss rendering =================
function drawBossByDef(g, e) {
  const f = e.def.features || {};
  const pal = e.def.pal;

  // --- telegraphs, drawn on the floor in world space ---
  if (e.mark) {
    g.save();
    g.setLineDash([9, 7]);
    g.strokeStyle = 'rgba(201,35,26,0.85)';
    g.lineWidth = 3.5;
    g.beginPath(); g.ellipse(e.mark.x, e.mark.y, e.r + 30, (e.r + 30) * 0.6, 0, 0, TAU); g.stroke();
    g.setLineDash([]);
    g.restore();
  }
  if (e.aimLine != null) {
    g.save();
    g.setLineDash([14, 10]);
    g.strokeStyle = 'rgba(168,92,235,0.75)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(e.x, e.y);
    g.lineTo(e.x + Math.cos(e.aimLine) * 900, e.y + Math.sin(e.aimLine) * 900);
    g.stroke();
    g.setLineDash([]);
    g.restore();
  }

  const air = e.z || 0;
  g.save();
  g.globalAlpha = clamp(e.fade == null ? 1 : e.fade, 0, 1);
  g.translate(e.x, e.y);
  // shadow shrinks as it rises
  const shScale = 1 - clamp(air / 260, 0, 0.78);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.ellipse(0, e.r * 0.85, e.r * 1.05 * shScale, 10 + 8 * shScale, 0, 0, TAU); g.fill();
  g.translate(0, -air);
  const squash = e.squash || 0;
  g.scale(1 + squash * 0.25, 1 - squash * 0.22);
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // enrage aura below 50% hp
  if (e.rage) {
    g.save();
    g.globalAlpha = 0.28 + Math.sin(e.anim * 8) * 0.08;
    g.fillStyle = '#c9231a';
    g.beginPath(); g.ellipse(0, 0, e.r * 1.25, e.r * 1.2, 0, 0, TAU); g.fill();
    g.restore();
  }

  const skin = e.flash > 0 ? '#ffffff' : pal.skin;
  if (f.wings) drawBossWings(g, e, pal);
  (BOSS_FORMS[e.def.form] || BOSS_FORMS.blob)(g, e, skin, pal, f);
  if (f.horns) drawBossHorns(g, e, pal);
  if (f.crown) drawBossCrown(g, e);
  if (f.halo) drawBossHalo(g, e);
  g.restore();
}

function drawBossWings(g, e, pal) {
  const flap = Math.sin(e.anim * 9) * 0.35;
  g.save();
  g.fillStyle = 'rgba(240,236,224,0.9)';
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  for (const s of [-1, 1]) {
    g.save();
    g.scale(s, 1);
    g.rotate(-0.5 + flap);
    g.beginPath();
    g.moveTo(e.r * 0.5, -6);
    g.quadraticCurveTo(e.r * 1.5, -e.r * 1.1, e.r * 1.9, -e.r * 0.1);
    g.quadraticCurveTo(e.r * 1.3, e.r * 0.25, e.r * 0.5, 8);
    g.closePath();
    g.fill(); g.stroke();
    g.restore();
  }
  g.restore();
}

function drawBossHorns(g, e, pal) {
  g.fillStyle = '#e8ddc8';
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * e.r * 0.55, -e.r * 0.72);
    g.quadraticCurveTo(s * e.r * 1.05, -e.r * 1.5, s * e.r * 0.42, -e.r * 1.62);
    g.quadraticCurveTo(s * e.r * 0.5, -e.r * 1.05, s * e.r * 0.3, -e.r * 0.8);
    g.closePath(); g.fill(); g.stroke();
  }
}

function drawBossCrown(g, e) {
  const y = -e.r * 1.05;
  g.fillStyle = '#f4d03f';
  g.strokeStyle = PAL.outline;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(-22, y); g.lineTo(-22, y - 20); g.lineTo(-11, y - 8);
  g.lineTo(0, y - 26); g.lineTo(11, y - 8); g.lineTo(22, y - 20); g.lineTo(22, y);
  g.closePath(); g.fill(); g.stroke();
}

function drawBossHalo(g, e) {
  g.strokeStyle = '#f7e463';
  g.lineWidth = 5;
  g.beginPath(); g.ellipse(0, -e.r * 1.35, e.r * 0.6, e.r * 0.2, 0, 0, TAU); g.stroke();
  g.strokeStyle = PAL.outline;
  g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(0, -e.r * 1.35, e.r * 0.6, e.r * 0.2, 0, 0, TAU); g.stroke();
}

// hollow dripping eye sockets shared by the fleshy forms
function drawBossEyes(g, e, n, glow) {
  const r = e.r;
  const xs = n === 1 ? [0] : n === 2 ? [-r * 0.38, r * 0.38] : [-r * 0.5, 0, r * 0.5];
  for (const x of xs) {
    g.fillStyle = glow || '#141010';
    g.beginPath(); g.ellipse(x, -r * 0.34, r * 0.19, r * 0.26, 0, 0, TAU); g.fill();
    if (glow) {
      g.fillStyle = 'rgba(255,255,255,0.65)';
      g.beginPath(); g.ellipse(x, -r * 0.36, r * 0.08, r * 0.11, 0, 0, TAU); g.fill();
    }
  }
}

function drawBossMouth(g, e, wide) {
  const r = e.r, mo = e.mouthOpen || 0;
  g.fillStyle = '#3c0a06';
  g.beginPath();
  g.ellipse(0, r * 0.35, (wide ? r * 0.42 : r * 0.26) + mo * 8, r * 0.22 + mo * 14, 0, 0, TAU);
  g.fill();
  g.strokeStyle = PAL.outline; g.lineWidth = 4; g.stroke();
}

function drawBossTeeth(g, e) {
  const r = e.r, mo = e.mouthOpen || 0;
  g.fillStyle = '#e8ddc8';
  const tw = r * 0.42 + mo * 8;
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.moveTo(i * tw / 3 - 4, r * 0.18 - mo * 4);
    g.lineTo(i * tw / 3 + 4, r * 0.18 - mo * 4);
    g.lineTo(i * tw / 3, r * 0.3 - mo * 2);
    g.closePath(); g.fill();
  }
}

const BOSS_FORMS = {
  // bloated sack of flesh with stubby arms
  blob(g, e, skin, pal, f) {
    const r = e.r;
    g.fillStyle = skin;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 6;
    g.beginPath(); g.ellipse(0, 0, r * 1.12, r, 0, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = pal.dark;
    g.globalAlpha = 0.35;
    g.beginPath(); g.ellipse(0, r * 0.45, r * 0.78, r * 0.42, 0, 0, TAU); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = skin;
    g.lineWidth = 5;
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(s * r * 1.08, r * 0.18, r * 0.26, r * 0.2, s * 0.5, 0, TAU); g.fill(); g.stroke();
    }
    drawBossEyes(g, e, f.eyes == null ? 2 : f.eyes, f.glow);
    drawBossMouth(g, e, f.mouth === 'wide');
    if (f.teeth) drawBossTeeth(g, e);
    g.fillStyle = PAL.blood;
    g.beginPath();
    g.moveTo(-r * 0.3, r * 0.52); g.quadraticCurveTo(-r * 0.26, r * 0.7, -r * 0.32, r * 0.84);
    g.quadraticCurveTo(-r * 0.4, r * 0.68, -r * 0.37, r * 0.54);
    g.closePath(); g.fill();
  },

  // segmented gut worm: tail rings behind a fat head
  worm(g, e, skin, pal, f) {
    const r = e.r;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 5;
    for (let i = 3; i >= 1; i--) {
      const wob = Math.sin(e.anim * 4 - i * 0.7) * r * 0.16;
      g.fillStyle = i % 2 ? pal.dark : skin;
      g.beginPath();
      g.ellipse(wob, r * 0.5 + i * r * 0.36, r * (0.85 - i * 0.13), r * (0.5 - i * 0.07), 0, 0, TAU);
      g.fill(); g.stroke();
    }
    g.fillStyle = skin;
    g.lineWidth = 6;
    g.beginPath(); g.ellipse(0, 0, r, r * 0.92, 0, 0, TAU); g.fill(); g.stroke();
    // ribbed segments across the head
    g.strokeStyle = 'rgba(80,40,30,0.35)';
    g.lineWidth = 3;
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.arc(0, i * r * 0.3, r * 0.8, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
    }
    drawBossEyes(g, e, f.eyes == null ? 2 : f.eyes, f.glow);
    drawBossMouth(g, e, false);
  },

  // engorged fly: compound eyes, buzzing wings drawn by drawBossWings
  fly(g, e, skin, pal, f) {
    const r = e.r;
    g.fillStyle = skin;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 5;
    g.beginPath(); g.ellipse(0, 0, r, r * 0.95, 0, 0, TAU); g.fill(); g.stroke();
    g.strokeStyle = PAL.outline;
    g.lineWidth = 4;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * r * 0.6, r * 0.5);
      g.quadraticCurveTo(s * r * 1.1, r * 0.8, s * r * 0.85, r * 1.05);
      g.stroke();
    }
    g.fillStyle = '#c92f1f';
    g.strokeStyle = PAL.outline;
    g.lineWidth = 3;
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(s * r * 0.36, -r * 0.28, r * 0.28, r * 0.32, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,180,170,0.5)';
      g.beginPath(); g.ellipse(s * r * 0.3, -r * 0.36, r * 0.1, r * 0.12, 0, 0, TAU); g.fill();
      g.fillStyle = '#c92f1f';
    }
    drawBossMouth(g, e, false);
  },

  // bare skull with a hinged jaw and burning sockets
  skull(g, e, skin, pal, f) {
    const r = e.r;
    g.fillStyle = skin;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 6;
    g.beginPath(); g.ellipse(0, -r * 0.1, r, r * 0.9, 0, 0, TAU); g.fill(); g.stroke();
    // cheek bones
    g.beginPath(); g.ellipse(-r * 0.72, r * 0.05, r * 0.22, r * 0.3, 0.4, 0, TAU); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(r * 0.72, r * 0.05, r * 0.22, r * 0.3, -0.4, 0, TAU); g.fill(); g.stroke();
    // jaw drops while attacking
    const jaw = (e.mouthOpen || 0) * r * 0.2;
    g.beginPath();
    g.moveTo(-r * 0.5, r * 0.45 + jaw);
    g.quadraticCurveTo(0, r * 1.05 + jaw, r * 0.5, r * 0.45 + jaw);
    g.quadraticCurveTo(0, r * 0.62 + jaw, -r * 0.5, r * 0.45 + jaw);
    g.closePath(); g.fill(); g.stroke();
    // teeth row
    g.fillStyle = '#fbf6e8';
    for (let i = -2; i <= 2; i++) g.fillRect(i * r * 0.16 - 3, r * 0.44 + jaw, 6, r * 0.14);
    // sockets
    g.fillStyle = '#100c0a';
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(s * r * 0.36, -r * 0.24, r * 0.24, r * 0.27, 0, 0, TAU); g.fill();
    }
    if (f.glow) {
      g.fillStyle = f.glow;
      g.globalAlpha = 0.7 + Math.sin(e.anim * 6) * 0.25;
      for (const s of [-1, 1]) {
        g.beginPath(); g.arc(s * r * 0.36, -r * 0.24, r * 0.1, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    }
    // nose slit
    g.fillStyle = '#100c0a';
    g.beginPath();
    g.moveTo(0, r * 0.02); g.lineTo(-r * 0.1, r * 0.28); g.lineTo(r * 0.1, r * 0.28);
    g.closePath(); g.fill();
  },

  // hooded cloak, glowing eyes, scythe
  reaper(g, e, skin, pal, f) {
    const r = e.r;
    // scythe behind the body
    g.strokeStyle = '#5a4632';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(r * 0.9, r * 0.9); g.lineTo(r * 1.15, -r * 1.15);
    g.stroke();
    g.fillStyle = '#cdd3da';
    g.strokeStyle = PAL.outline;
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(r * 1.15, -r * 1.15);
    g.quadraticCurveTo(r * 0.2, -r * 1.5, r * 0.05, -r * 0.85);
    g.quadraticCurveTo(r * 0.6, -r * 1.05, r * 1.15, -r * 1.15);
    g.closePath(); g.fill(); g.stroke();
    // cloak
    const sway = Math.sin(e.anim * 2.4) * r * 0.1;
    g.fillStyle = skin;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(0, -r);
    g.quadraticCurveTo(-r * 0.95, -r * 0.5, -r * 0.8 + sway, r);
    g.quadraticCurveTo(0, r * 0.72, r * 0.8 + sway, r);
    g.quadraticCurveTo(r * 0.95, -r * 0.5, 0, -r);
    g.closePath(); g.fill(); g.stroke();
    // hood shadow
    g.fillStyle = '#0a0810';
    g.beginPath(); g.ellipse(0, -r * 0.42, r * 0.44, r * 0.42, 0, 0, TAU); g.fill();
    if (f.glow) {
      g.fillStyle = f.glow;
      g.globalAlpha = 0.75 + Math.sin(e.anim * 7) * 0.2;
      for (const s of [-1, 1]) {
        g.beginPath(); g.ellipse(s * r * 0.17, -r * 0.44, r * 0.08, r * 0.12, 0, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    }
  },

  // anatomical heart, veins pulsing with the beat
  heart(g, e, skin, pal, f) {
    const r = e.r;
    const beat = 1 + Math.sin(e.anim * 4) * 0.05;
    g.save();
    g.scale(beat, beat);
    g.fillStyle = skin;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(0, r * 0.95);
    g.bezierCurveTo(-r * 1.25, r * 0.1, -r * 1.05, -r * 0.85, -r * 0.45, -r * 0.6);
    g.bezierCurveTo(-r * 0.16, -r * 0.45, 0, -r * 0.2, 0, -r * 0.1);
    g.bezierCurveTo(0, -r * 0.2, r * 0.16, -r * 0.45, r * 0.45, -r * 0.6);
    g.bezierCurveTo(r * 1.05, -r * 0.85, r * 1.25, r * 0.1, 0, r * 0.95);
    g.closePath(); g.fill(); g.stroke();
    // aorta tubes
    g.fillStyle = pal.dark;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 4;
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(s * r * 0.3, -r * 0.72, r * 0.16, r * 0.24, s * 0.3, 0, TAU); g.fill(); g.stroke();
    }
    if (f.veins) {
      g.strokeStyle = 'rgba(60,10,8,0.5)';
      g.lineWidth = 3;
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(i * r * 0.3, -r * 0.35);
        g.quadraticCurveTo(i * r * 0.55, r * 0.1, i * r * 0.22, r * 0.6);
        g.stroke();
      }
    }
    g.restore();
    drawBossMouth(g, e, false);
  },

  // horned demon torso
  demon(g, e, skin, pal, f) {
    const r = e.r;
    g.fillStyle = skin;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 6;
    g.beginPath(); g.ellipse(0, r * 0.05, r * 1.05, r * 0.98, 0, 0, TAU); g.fill(); g.stroke();
    // pecs / ribs shading
    g.fillStyle = pal.dark;
    g.globalAlpha = 0.4;
    g.beginPath(); g.ellipse(-r * 0.4, r * 0.3, r * 0.32, r * 0.2, 0.2, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(r * 0.4, r * 0.3, r * 0.32, r * 0.2, -0.2, 0, TAU); g.fill();
    g.globalAlpha = 1;
    // clawed arms
    g.fillStyle = skin;
    g.lineWidth = 5;
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(s * r * 1.02, r * 0.1, r * 0.28, r * 0.22, s * 0.6, 0, TAU); g.fill(); g.stroke();
      g.strokeStyle = '#efe6d2';
      g.lineWidth = 3;
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(s * r * 1.18, r * 0.12 + i * 5);
        g.lineTo(s * r * 1.42, r * 0.16 + i * 7);
        g.stroke();
      }
      g.strokeStyle = PAL.outline;
      g.lineWidth = 5;
    }
    drawBossEyes(g, e, f.eyes == null ? 2 : f.eyes, f.glow);
    drawBossMouth(g, e, true);
    if (f.teeth) drawBossTeeth(g, e);
  },

  // robed choir angel
  angel(g, e, skin, pal, f) {
    const r = e.r;
    g.fillStyle = skin;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 5.5;
    // robe
    g.beginPath();
    g.moveTo(0, -r * 0.35);
    g.quadraticCurveTo(-r * 0.85, -r * 0.1, -r * 0.72, r);
    g.quadraticCurveTo(0, r * 0.78, r * 0.72, r);
    g.quadraticCurveTo(r * 0.85, -r * 0.1, 0, -r * 0.35);
    g.closePath(); g.fill(); g.stroke();
    // head
    g.beginPath(); g.ellipse(0, -r * 0.62, r * 0.42, r * 0.4, 0, 0, TAU); g.fill(); g.stroke();
    // robe folds
    g.strokeStyle = 'rgba(120,110,90,0.4)';
    g.lineWidth = 3;
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(i * r * 0.3, -r * 0.1);
      g.quadraticCurveTo(i * r * 0.36, r * 0.45, i * r * 0.26, r * 0.9);
      g.stroke();
    }
    // serene closed eyes + weeping streaks
    g.strokeStyle = PAL.outline;
    g.lineWidth = 3.5;
    for (const s of [-1, 1]) {
      g.beginPath(); g.arc(s * r * 0.16, -r * 0.64, r * 0.1, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      g.strokeStyle = 'rgba(140,190,220,0.85)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(s * r * 0.16, -r * 0.56);
      g.lineTo(s * r * 0.18, -r * 0.32 + Math.sin(e.anim * 3) * 3);
      g.stroke();
      g.strokeStyle = PAL.outline;
      g.lineWidth = 3.5;
    }
  },

  // gilded idol: blocky statue with gem eyes
  idol(g, e, skin, pal, f) {
    const r = e.r;
    g.fillStyle = skin;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(-r * 0.85, r);
    g.lineTo(-r * 0.62, -r * 0.55);
    g.lineTo(0, -r * 0.95);
    g.lineTo(r * 0.62, -r * 0.55);
    g.lineTo(r * 0.85, r);
    g.closePath(); g.fill(); g.stroke();
    // engraved bands
    g.strokeStyle = pal.dark;
    g.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(-r * (0.66 + i * 0.06), r * (0.1 + i * 0.28));
      g.lineTo(r * (0.66 + i * 0.06), r * (0.1 + i * 0.28));
      g.stroke();
    }
    // gem eyes
    for (const s of [-1, 1]) {
      g.fillStyle = f.glow || '#fff2a8';
      g.strokeStyle = PAL.outline;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(s * r * 0.34, -r * 0.52);
      g.lineTo(s * r * 0.48, -r * 0.34);
      g.lineTo(s * r * 0.34, -r * 0.16);
      g.lineTo(s * r * 0.2, -r * 0.34);
      g.closePath(); g.fill(); g.stroke();
    }
    drawBossMouth(g, e, false);
  },

  // living silhouette: edges crawl, only the eyes read clearly
  shadow(g, e, skin, pal, f) {
    const r = e.r;
    g.fillStyle = skin;
    g.strokeStyle = '#000';
    g.lineWidth = 4;
    g.beginPath();
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU;
      const wob = 1 + Math.sin(e.anim * 3 + i * 1.7) * 0.09;
      const px = Math.cos(a) * r * 1.05 * wob;
      const py = Math.sin(a) * r * wob;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath(); g.fill(); g.stroke();
    // smoky wisps rising off the top
    g.globalAlpha = 0.4;
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.ellipse(i * r * 0.4, -r * (1.05 + Math.abs(Math.sin(e.anim * 2 + i)) * 0.3), r * 0.16, r * 0.24, 0, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    // blank glowing eyes
    const glow = f.glow || '#e8e2d0';
    g.fillStyle = glow;
    g.globalAlpha = 0.85 + Math.sin(e.anim * 5) * 0.15;
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(s * r * 0.34, -r * 0.22, r * 0.14, r * 0.2, 0, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    g.strokeStyle = glow;
    g.lineWidth = 4;
    g.beginPath(); g.arc(0, r * 0.34, r * 0.34, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke();
  },

  // the final boss: dodo itself, blown up to boss scale
  dodo(g, e, skin, pal, f) {
    const s = e.r / 24;
    g.save();
    g.scale(s, s);
    drawDodo(g, 0, 0, {
      walk: e.anim * 8, moving: e.z > 0 || Math.abs(e.vx) > 10,
      aimX: 0, aimY: 0.4, hurtFlash: e.flash > 0,
      headColor: skin, eyeColor: '#8e1b12', hat: null, big: false,
    });
    g.restore();
    // permanent bleeding grin
    g.fillStyle = PAL.blood;
    g.beginPath();
    g.moveTo(-e.r * 0.2, e.r * 0.1);
    g.quadraticCurveTo(-e.r * 0.16, e.r * 0.4, -e.r * 0.24, e.r * 0.56);
    g.quadraticCurveTo(-e.r * 0.32, e.r * 0.38, -e.r * 0.28, e.r * 0.12);
    g.closePath(); g.fill();
  },
};
