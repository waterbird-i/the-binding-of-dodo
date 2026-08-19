'use strict';
// ============ meta progress: unlocks that survive death ============
// The whole "save file" is one localStorage key — the game still runs from a
// double-clicked index.html with no server. Dev-tainted runs never write here
// (same anti-cheat rule as the leaderboard).
const META_KEY = 'dodo_meta_v1';

const META = {
  totals: { kills: 0, deaths: 0, wins: 0 },
  unlocked: {},          // unlock id -> true
  charWins: {},          // char id -> true, 该角色击杀过一次 MEGA dodo
  selChar: 'dodo',       // last character picked on the menu
};

function metaLoad() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d && d.totals) Object.assign(META.totals, d.totals);
    if (d && d.unlocked) Object.assign(META.unlocked, d.unlocked);
    if (d && d.charWins) Object.assign(META.charWins, d.charWins);
    if (d && typeof d.selChar === 'string') META.selChar = d.selChar;
  } catch (e) { /* blocked storage (incognito): play without persistence */ }
}
function metaSave() {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(
      { totals: META.totals, unlocked: META.unlocked, charWins: META.charWins, selChar: META.selChar }));
  } catch (e) { /* ignore */ }
}
metaLoad();

// ---------------- characters ----------------
// Every variant reuses the dodo rig — they only re-tint the drawing and move
// the starting statline, so all 89 items and every animation keep working.
const CHAR_DEFS = [
  { id: 'dodo', name: 'dodo', desc: '均衡的开局', unlock: null },
  { id: 'rage', name: '生气 dodo', desc: '怒气驱动 越战越狂 处决残血敌人', unlock: 'char_rage',
    apply(p) {
      p.maxHp = 4; p.hp = 4;
      p.damage += 0.8;
      p.rageMeter = 0;       // 0..1 — kills and pain feed it (js/char-powers.js)
      p.appearance.headColor = '#f2b4a2';
      p.appearance.eyeColor = '#a32014';
      p.appearance.brow = 'angry';
    } },
  { id: 'dark', name: '暗黑 dodo', desc: '恶魔宠儿 交易更廉 击杀收割魂火', unlock: 'char_dark',
    apply(p) {
      p.maxHp = 4; p.hp = 4;
      p.soulHp = 6;
      p.soulOverflow = true;   // hearts picked up at full health become soul hearts
      p.soulSparks = 0;        // reaped soul flames — 3 congeal into half a soul heart
      p.appearance.headColor = '#5d5573';
      p.appearance.eyeColor = '#cbb9f2';
      p.appearance.aura = 'rgba(96,64,150,0.28)';
    } },
  { id: 'lost', name: '迷失 dodo', desc: '一触即死 飞行幽泪 圣盾护身 恶魔白送', unlock: 'char_lost',
    apply(p) {
      p.maxHp = 1; p.hp = 1;   // half a heart: any hit is lethal (clamp exempts him)
      p.flight = true;
      p.spectral = true;
      p.shieldMax = 1; p.shieldUp = true;
      p.damage += 1.0;
      p.moveSpeed += 20;
      p.appearance.headColor = '#eef1f6';
      p.appearance.eyeColor = '#6b7684';
      p.appearance.aura = 'rgba(210,225,255,0.28)';
    } },
  { id: 'gambler', name: '赌徒 dodo', desc: '开局 15 金币 商店半价 每层运势重摇', unlock: 'char_gambler',
    apply(p) {
      p.coins = 15;
      p.luck += 2;
      p.appearance.headColor = '#f4e6c4';
      p.appearance.eyeColor = '#1f6b3a';
      p.appearance.aura = 'rgba(220,180,60,0.2)';
    } },
];
const CHAR_BY_ID = {};
for (const c of CHAR_DEFS) CHAR_BY_ID[c.id] = c;

// 隐藏终极 Boss dumate 的解锁条件：每个角色都击杀过一次 MEGA dodo
// （记入 charWins，种子局 / 开发者模式不计）。条件达成后，之后每次击杀
// MEGA dodo 都会弹出终极抉择——见 js/game-flow.js 的 openDumateOffer。
function allCharsCleared() { return CHAR_DEFS.every(c => META.charWins[c.id]); }

// ---------------- unlock table ----------------
// kind 'item': stays out of every random item pool until earned.
// kind 'char': stays greyed out on the menu until earned.
// A def unlocks either on a named event (`on`) or when a totals threshold
// (`test`) is met — thresholds are re-tested after every kill/death/win.
const UNLOCK_DEFS = [
  { id: 'kings_mark',   kind: 'item', label: '王者印记',  how: '无伤击败任意一个 Boss', on: 'no_damage_boss' },
  { id: 'godhead',      kind: 'item', label: '神之首',    how: '无伤走完一整层',        on: 'no_damage_floor' },
  { id: 'quad_feather', kind: 'item', label: '四重羽毛',  how: '单局拾取 12 件道具',    on: 'run_items_12' },
  { id: 'glass_cannon', kind: 'item', label: '玻璃大炮',  how: '通关一次',              test: t => t.wins >= 1 },
  { id: 'one_up',       kind: 'item', label: '1UP!',      how: '累计击杀 500 只怪物',   test: t => t.kills >= 500 },
  { id: 'dead_cat',     kind: 'item', label: '死猫',      how: '累计死亡 10 次',        test: t => t.deaths >= 10 },
  { id: 'char_rage',    kind: 'char', label: '生气 dodo', how: '累计击杀 300 只怪物',   test: t => t.kills >= 300 },
  { id: 'char_dark',    kind: 'char', label: '暗黑 dodo', how: '通关一次',              test: t => t.wins >= 1 },
  { id: 'char_lost',    kind: 'char', label: '迷失 dodo', how: '累计死亡 25 次',        test: t => t.deaths >= 25 },
  { id: 'char_gambler', kind: 'char', label: '赌徒 dodo', how: '单局同时持有 25 金币',  on: 'coins_25' },
  { id: 'boss_dumate',  kind: 'boss', label: 'dumate',    how: '让每一位 dodo 都击败 MEGA dodo，然后接受终极挑战并获胜', on: 'dumate_win',
    desc: '你的眼泪不过是一次又一次否认现实' },
];
const ITEM_UNLOCKS = {};   // item id -> unlock def (items gated behind meta progress)
for (const u of UNLOCK_DEFS) if (u.kind === 'item') ITEM_UNLOCKS[u.id] = u;

function metaHas(id) { return !!META.unlocked[id]; }
function metaItemLocked(itemId) { return !!ITEM_UNLOCKS[itemId] && !metaHas(itemId); }
function charLocked(c) { return !!c.unlock && !metaHas(c.unlock); }

// fire a named event, re-test thresholds, persist; returns the defs that
// just unlocked so the caller can announce them
function metaCheck(ev) {
  const fresh = [];
  for (const u of UNLOCK_DEFS) {
    if (metaHas(u.id)) continue;
    if (!((u.on && u.on === ev) || (u.test && u.test(META.totals)))) continue;
    META.unlocked[u.id] = true;
    fresh.push(u);
  }
  if (fresh.length) metaSave();
  return fresh;
}
