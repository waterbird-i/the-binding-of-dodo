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
// clamps hp into a fight-length corridor of the player's estimated dps: at
// least ~30s so a stacked build can never melt a boss instantly, at most
// ~(40 + 4×depth)s so an under-geared build isn't ground down by a ninety
// second war of attrition on floor 2. Touch damage steps up by chapter, so
// the late game actually bites. The final boss ignores the cap and doubles
// the floor — that fight is meant to be a marathon.
// Signature rule: every attack in BOSS_ATTACKS belongs to exactly ONE boss --
// no two bosses share a move, so each fight teaches a fresh dodge.
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
    attacks: ['burrow', 'dash', 'aimed3'],
  },
  {
    id: 'larvato', name: 'Larvato', hp: 1350, r: 40, touchDamage: 2,
    form: 'fly', move: 'hover', pal: { skin: '#3c3630', dark: '#1d1a17' },
    features: { wings: true, eyes: 2 },
    attacks: ['summon', 'swoop', 'bounce6'],
  },
  {
    id: 'chubbler', name: 'Chubbler', hp: 1950, r: 52, touchDamage: 2,
    form: 'blob', move: 'still', pal: { skin: '#b8c48a', dark: '#5f6b3c' },
    features: { teeth: true, eyes: 1, mouth: 'wide' },
    attacks: ['ring', 'burstShot', 'cross'],
  },
  {
    id: 'osseo', name: 'Osseo', hp: 2750, r: 44, touchDamage: 3,
    form: 'skull', move: 'strafe', pal: { skin: '#e6ddc6', dark: '#9d9377' },
    features: { eyes: 2, glow: '#7fd8e8' },
    attacks: ['teleport', 'mortar', 'boomerangs'],
  },
  {
    id: 'mortuum', name: 'Mortuum', hp: 3800, r: 46, touchDamage: 3,
    form: 'reaper', move: 'hover', pal: { skin: '#2c2a34', dark: '#15141b' },
    features: { eyes: 2, glow: '#c9231a' },
    attacks: ['laser', 'seekers', 'sweepLasers'],
  },
  {
    id: 'utero', name: 'Utero', hp: 5200, r: 48, touchDamage: 3,
    form: 'heart', move: 'still', pal: { skin: '#c1382f', dark: '#6d150f' },
    features: { eyes: 0, veins: true },
    attacks: ['rain', 'gapRings', 'aortaSpray'],
  },
  {
    id: 'sanguino', name: 'Sanguino', hp: 7000, r: 50, touchDamage: 3,
    form: 'blob', move: 'hop', pal: { skin: '#a3231a', dark: '#5c0f09' },
    features: { teeth: true, eyes: 3, mouth: 'wide' },
    attacks: ['lances', 'splitGlobs', 'bloodFrenzy'],
  },
  {
    id: 'infernus', name: 'Infernus', hp: 9300, r: 50, touchDamage: 4,
    form: 'demon', move: 'chase', pal: { skin: '#8e2b1c', dark: '#4a1109' },
    features: { horns: true, eyes: 2, glow: '#ffb43c', teeth: true },
    attacks: ['flameCone', 'firewall', 'emberSpray'],
  },
  {
    id: 'seraphim', name: 'Seraphim', hp: 12200, r: 46, touchDamage: 4,
    form: 'angel', move: 'strafe', pal: { skin: '#f2ece0', dark: '#b4aa92' },
    features: { wings: true, halo: true, eyes: 2 },
    attacks: ['halo', 'pillars', 'featherBurst'],
  },
  {
    id: 'auricus', name: 'Auricus', hp: 15800, r: 50, touchDamage: 4,
    form: 'idol', move: 'still', pal: { skin: '#d9b53a', dark: '#8a6d1d' },
    features: { crown: true, eyes: 2, glow: '#fff2a8' },
    attacks: ['spiral', 'wallSqueeze', 'volleyHold'],
  },
  {
    id: 'umbra', name: 'Umbra', hp: 20300, r: 48, touchDamage: 4,
    form: 'shadow', move: 'hover', pal: { skin: '#191519', dark: '#000000' },
    features: { eyes: 2, glow: '#e8e2d0' },
    attacks: ['phantomDash', 'shadowSnake', 'watchers'],
  },
  {
    id: 'mega_dodo', name: 'MEGA dodo', hp: 40000, r: 54, touchDamage: 4, final: true,
    form: 'dodo', move: 'hop', pal: { skin: '#ffffff', dark: '#b9b1a3' },
    features: { crown: true, eyes: 2 },
    attacks: ['windmill', 'eggBombs', 'megaBeam', 'skyfall', 'apocalypse'],
  },
];

const FINAL_BOSS_DEF = BOSS_DEFS[BOSS_DEFS.length - 1];
function bossDefForFloor(depth) { return BOSS_DEFS[clamp(depth, 1, 12) - 1]; }

// ---- dumate：隐藏终极 Boss（不进 BOSS_DEFS 序列，不占任何楼层）----
// 登场条件与流程见 js/game-flow.js：全部角色通关后，击杀 MEGA dodo 时可选
// 挑战。血量在登场时按「本局 MEGA dodo 实战血量 × 20」写入，这里的 hp 只是
// 兜底数值；gapMul 把出招间隔压到常规 Boss 的 2/3，配合更大的副技能编制
// （平时主 + 2 副，狂暴主 + 3 副），压迫感全面高于 MEGA dodo。
const DUMATE_DEF = {
  id: 'dumate', name: 'dumate', hp: 800000, r: 60, touchDamage: 5,
  final: true, dumate: true, gapMul: 0.65,
  form: 'dumate', move: 'hover', pal: { skin: '#8f9df5', dark: '#4552c9' },
  features: { eyes: 2 },
  attacks: ['forkStorm', 'byteRain', 'gravityWell', 'firewallGrid', 'mirrorPhantoms', 'overwrite'],
};

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
// upper bound loosens with depth: early bosses stay brisk for under-geared
// builds while deep ones still demand a minute-plus of sustained fire
function bossMaxFightSeconds(depth) { return 40 + 4 * depth; }
// the true final boss skips the cap and doubles the floor: a marathon fight
const FINAL_MIN_FIGHT_SECONDS = 60;

function makeBoss(def, x, y) {
  // floor 1 keeps its tutorial-sized hp; every later boss lives inside a
  // fight-length corridor of the player's estimated dps (see header note)
  let hp = def.hp;
  if (def.final) {
    hp = Math.max(hp, Math.round(estimatePlayerDPS(G.player) * FINAL_MIN_FIGHT_SECONDS));
  } else if (G.floorNum > 1) {
    const dps = estimatePlayerDPS(G.player);
    hp = Math.max(hp, Math.round(dps * BOSS_MIN_FIGHT_SECONDS));
    hp = Math.min(hp, Math.max(1, Math.round(dps * bossMaxFightSeconds(G.floorNum))));
  }
  // the risky route grows a meaner boss
  if (typeof G !== 'undefined' && G.floor && G.floor.hard) hp = Math.round(hp * 1.2);
  return {
    type: 'boss', isBoss: true, def, name: def.name,
    x, y, vx: 0, vy: 0, z: 0, vz: 0,
    r: def.r, hp, maxHpRef: hp,
    touchDamage: def.touchDamage || 2,
    anim: rand(10), flash: 0, dead: false, knockX: 0, knockY: 0,
    spawnT: 0.9, spawnMax: 0.9, squash: 0, mouthOpen: 0, fade: 1,
    state: 'idle', t: 1.2, atk: null, phase: 0, data: {}, casts: null, primaryDone: false,
    mark: null, marks: null, aimLine: null, rage: false, hops: 0, angle: rand(TAU),
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
      if (e.def.final) startSideCasts(e);
    }
  } else {
    if (!e.primaryDone) {
      const fn = BOSS_ATTACKS[e.atk];
      if (!fn || fn(G, e, dt)) {
        e.primaryDone = true;
        e.mark = null;
        e.marks = null;
        e.aimLine = null;
        e.fade = 1;
      }
    } else {
      bossMove(G, e, dt);   // keep moving while leftover side casts play out
    }
    if (e.casts) {
      for (const c of e.casts) {
        if (c.done) continue;
        const fn = BOSS_ATTACKS[c.atk];
        c.done = !fn || fn(G, c.ctx, dt);
      }
    }
    if (e.primaryDone && (!e.casts || e.casts.every(c => c.done))) {
      e.state = 'idle';
      e.atk = null;
      e.casts = null;
      e.primaryDone = false;
      e.t = rand(0.7, 1.4) * (e.rage ? 0.6 : 1) * (e.def.gapMul || 1);
    }
  }
}

// The final boss casts several attacks at once: one primary (may fly the
// body around) plus 1-2 side casts. A side cast runs on a shadow context —
// prototype chained to the boss so it reads live position, while its own
// phase / timer / data / telegraph marks stay private. Only pure bullet
// patterns qualify as side casts; body-movers stay primary-only, and the
// full-screen apocalypse always casts alone so the safe pocket stays honest.
const FINAL_SIDE_POOL = ['windmill', 'eggBombs', 'megaBeam'];
// dumate 的副技能池同样只收纯弹幕；镜像分身要操纵本体、防火墙矩阵要挪动
// 激光阵，都只当主技能；全屏「格式化」和天启一样独占施放。
const DUMATE_SIDE_POOL = ['forkStorm', 'byteRain', 'gravityWell'];
const SOLO_CAST = { apocalypse: true, overwrite: true };
function startSideCasts(e) {
  e.primaryDone = false;
  e.casts = null;
  if (SOLO_CAST[e.atk]) return;
  const base = e.def.dumate ? DUMATE_SIDE_POOL : FINAL_SIDE_POOL;
  const pool = base.filter(a => a !== e.atk);
  const n = Math.min(pool.length, e.def.dumate ? (e.rage ? 3 : 2) : (e.rage ? 2 : 1));
  pool.sort(() => Math.random() - 0.5);
  e.casts = pool.slice(0, n).map(atk => ({
    atk, done: false,
    ctx: Object.assign(Object.create(e), {
      phase: 0, t: 0, data: {}, mark: null, marks: null, aimLine: null,
      angle: rand(TAU), hops: 0,
    }),
  }));
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
  bossShotFrom(G, e.x, e.y + 6, a, sp, r, dmg, bounces);
}
// same bullet, launched from an arbitrary point (marks, walls, popped orbs)
function bossShotFrom(G, x, y, a, sp, r, dmg, bounces) {
  // deep-floor bosses hit harder with every bullet
  const boost = (G.floorNum || 1) >= 9 ? 1 : 0;
  // dumate 战期间的所有弹幕都是它打出的：标记 du，渲染时走本体蓝紫配色
  const du = !!(G.room && G.room.bossDef && G.room.bossDef.dumate);
  G.eshots.push({
    x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
    r, dmg: (dmg || 1) + boost, bounces: bounces || 0, dead: false, du,
  });
}
function aimAt(e, p) { return Math.atan2(p.y - e.y, p.x - e.x); }

// Every attack takes (G, e, dt) and returns true once it has finished.
