'use strict';
// ============ character powers ============
// Each unlockable dodo bends one rule of the game instead of just shifting
// stats. All hooks live here; the engine calls in at the few relevant spots.

// ---------------- 生气 dodo: the rage meter ----------------
// Landed hits, kills and pain feed the meter; it only sags once the fight
// stops (RAGE_COMBAT_T after the last hit dealt or taken). High rage =
// faster, harder tears and quicker feet; a full meter is 暴走: bloody
// tears, contact damage and a big burst of attack / speed / fire rate.
const RAGE_COMBAT_T = 2.0;      // seconds of grace before the meter drains
const RAGE_HIT = 0.02;          // rage per landed hit (kills 0.09, pain 0.4)
const RAGE_BERSERK_DMG = 2.5;   // 暴走 attack multiplier
const RAGE_BERSERK_FIRE = 0.5;  // 暴走 fireDelay multiplier
const RAGE_BERSERK_SPEED = 160; // 暴走 move speed bonus
function rageOf(p) { return p.charId === 'rage' ? (p.rageMeter || 0) : 0; }
function rageDmgMul(p) { return rageBerserk(p) ? RAGE_BERSERK_DMG : 1 + rageOf(p) * 0.7; }
function rageFireMul(p) { return rageBerserk(p) ? RAGE_BERSERK_FIRE : 1 - rageOf(p) * 0.32; }
function rageSpeedAdd(p) { return rageBerserk(p) ? RAGE_BERSERK_SPEED : rageOf(p) * 50; }
function rageBerserk(p) { return rageOf(p) >= 0.99; }

function addRage(p, n) {
  if (p.charId !== 'rage') return;
  const was = p.rageMeter || 0;
  p.rageMeter = clamp(was + n, 0, 1);
  if (was < 0.99 && p.rageMeter >= 0.99) {
    G.toast = { title: '暴走！', desc: '怒不可遏 眼泪染血 浑身带刺!', t: 2.0 };
    G.shake = Math.max(G.shake, 5);
    SFX.bossDie();
  }
}
// landing a hit or taking one keeps the meter from sagging — call on both
function rageMarkCombat(p) {
  if (p.charId === 'rage') p.rageCombatT = RAGE_COMBAT_T;
}
function updateRage(p, dt) {
  if (p.charId !== 'rage' || !p.rageMeter) return;
  if (p.rageCombatT > 0) { p.rageCombatT -= dt; return; }
  p.rageMeter = Math.max(0, p.rageMeter - dt * 0.055);
}

// 处决: the execute payoff — shockwave ring, blood geyser and a popup label
function spawnExecFX(G, x, y) {
  G.particles.push({ kind: 'ring', x, y: y + 14, r: 8, grow: 2.4, vx: 0, vy: 0, life: 0.4, maxLife: 0.4, color: 'rgba(235,64,40,0.95)', lineW: 4 });
  for (let i = 0; i < 18; i++) {
    const a = rand(TAU), s = rand(40, 210);
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 130, life: rand(0.3, 0.7), maxLife: 0.7, r: rand(2, 5), color: chance(0.65) ? PAL.blood : '#ff5a3c', grav: 650 });
  }
  G.particles.push({ kind: 'text', text: '处决!', x, y: y - 26, vx: 0, vy: -46, life: 0.85, maxLife: 0.85, size: 15, color: '#ff6a4d' });
  G.shake = Math.max(G.shake, 5);
  SFX.execute();
}

// ---------------- 暗黑 dodo: the devil's favorite ----------------
// Devil doors always crack open after a boss, deals cost one heart less
// (soul payment 2 hearts instead of 3) — but heaven wants nothing to do
// with him: holy items never roll out of his pools.
const DARK_HOLY_BAN = {
  dodo_halo: 1, holy_book: 1, angel_wing: 1,
  angel_plume: 1, holy_mantle: 1, cross_pendant: 1,
};
function charBansItem(id) {
  return !!(typeof G !== 'undefined' && G.player &&
    G.player.charId === 'dark' && DARK_HOLY_BAN[id]);
}
function devilPriceFor(p, price) {
  return p.charId === 'dark' ? Math.max(1, price - 1) : price;
}
function devilSoulCost(p) { return p.charId === 'dark' ? 4 : 6; }
// 迷失 dodo has nothing left to lose — the devil deals to him for free
function devilFreeDeal(p) { return p.charId === 'lost'; }

// ---------------- 迷失 dodo: 生命上限 → 攻击力 ----------------
// 他的身份就是把「血量上限」这个属性整个折成攻击：标准 dodo 3 颗心（6 半心）
// 扣到半颗（两颗半星），按比例换成巨额初始攻击（见 js/meta.js）；之后拾到的
// 加血道具也一样——上限增量不进血条，直接折成攻击（牺牲上限的恶魔道具不受
// 影响，它们本来就用伤害换心）。每半颗心 ≈ 3 攻击，约等于恶魔交易的行价。
const LOST_HP_TO_DMG = 3;
function lostHpToDmg(halfHearts) { return halfHearts * LOST_HP_TO_DMG; }
// 迷失 dodo 应用道具的统一入口：返回本次转化出的攻击力（非迷失角色恒为 0）。
// 调用点随后照常 clampPlayerStats——把 maxHp 压回 1、hp 压回半颗心。
function applyItemToPlayer(p, def) {
  if (p.charId !== 'lost') { def.apply(p); return 0; }
  const before = p.maxHp;
  def.apply(p);
  const gained = p.maxHp - before;
  if (gained <= 0) return 0;
  const bonus = lostHpToDmg(gained);
  p.damage += bonus;
  return bonus;
}

// 暗黑 dodo reaps souls: slain enemies sometimes drop a soul flame.
// Each flame charges the spacebar item; every third one congeals into
// half a soul heart.
function tryDropSoulflame(p, e) {
  if (p.charId !== 'dark' || e.isBoss) return;
  if (chance(0.12)) G.room.pickups.push(makePickup('soulflame', e.x, e.y));
}
function absorbSoulflame(p) {
  p.soulSparks = (p.soulSparks || 0) + 1;
  addActiveCharge(p, 1);
  if (p.soulSparks % 3 === 0) {
    p.soulHp = Math.min(12, p.soulHp + 1);
    G.toast = { title: '灵魂收割', desc: '三团魂火凝成了半颗魂心!', t: 1.8 };
    SFX.heart();
  } else {
    SFX.coin();
  }
}

// ---------------- 赌徒 dodo: per-floor fortune ----------------
// Every floor rerolls his luck: two stats step up, one steps down. The
// previous floor's roll is reverted first so fortunes never stack.
const GAMBLE_STATS = {
  damage:    { label: '攻击', up: 1.3, down: -0.9 },
  fire:      { label: '射速', up: 0.82, down: 1.16 },   // fireDelay multipliers
  moveSpeed: { label: '移速', up: 36, down: -26 },
  range:     { label: '射程', up: 100, down: -70 },
  shotSpeed: { label: '弹速', up: 80, down: -55 },
  luck:      { label: '幸运', up: 2, down: -1 },
};
function rollGamble(p) {
  if (p.gambleMod) {
    const m = p.gambleMod;
    p.damage -= m.damage; p.moveSpeed -= m.moveSpeed; p.range -= m.range;
    p.shotSpeed -= m.shotSpeed; p.luck -= m.luck; p.fireDelay /= m.fireMul;
  }
  const keys = Object.keys(GAMBLE_STATS);
  const ups = [];
  while (ups.length < 2) {
    const k = pick(keys);
    if (!ups.includes(k)) ups.push(k);
  }
  let down = pick(keys);
  while (ups.includes(down)) down = pick(keys);
  const mod = { damage: 0, moveSpeed: 0, range: 0, shotSpeed: 0, luck: 0, fireMul: 1 };
  const applyRoll = (k, good) => {
    const v = good ? GAMBLE_STATS[k].up : GAMBLE_STATS[k].down;
    if (k === 'fire') mod.fireMul *= v;
    else mod[k] += v;
  };
  applyRoll(ups[0], true); applyRoll(ups[1], true); applyRoll(down, false);
  p.damage += mod.damage; p.moveSpeed += mod.moveSpeed; p.range += mod.range;
  p.shotSpeed += mod.shotSpeed; p.luck += mod.luck; p.fireDelay *= mod.fireMul;
  clampPlayerStats(p);
  p.gambleMod = mod;
  const tag = k => GAMBLE_STATS[k].label;
  G.toast = { title: '赌徒的运势', desc: tag(ups[0]) + '↑　' + tag(ups[1]) + '↑　' + tag(down) + '↓', t: 3.2 };
}
