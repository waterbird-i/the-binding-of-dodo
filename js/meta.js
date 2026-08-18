'use strict';
// ============ meta progress: unlocks that survive death ============
// The whole "save file" is one localStorage key — the game still runs from a
// double-clicked index.html with no server. Dev-tainted runs never write here
// (same anti-cheat rule as the leaderboard).
const META_KEY = 'dodo_meta_v1';

const META = {
  totals: { kills: 0, deaths: 0, wins: 0 },
  unlocked: {},          // unlock id -> true
  selChar: 'dodo',       // last character picked on the menu
};

function metaLoad() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d && d.totals) Object.assign(META.totals, d.totals);
    if (d && d.unlocked) Object.assign(META.unlocked, d.unlocked);
    if (d && typeof d.selChar === 'string') META.selChar = d.selChar;
  } catch (e) { /* blocked storage (incognito): play without persistence */ }
}
function metaSave() {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(
      { totals: META.totals, unlocked: META.unlocked, selChar: META.selChar }));
  } catch (e) { /* ignore */ }
}
metaLoad();

// ---------------- characters ----------------
// Every variant reuses the dodo rig — they only re-tint the drawing and move
// the starting statline, so all 89 items and every animation keep working.
const CHAR_DEFS = [
  { id: 'dodo', name: 'dodo', desc: '均衡的开局', unlock: null },
  { id: 'rage', name: '生气 dodo', desc: '攻击暴涨 生命只有 2 颗心', unlock: 'char_rage',
    apply(p) {
      p.maxHp = 4; p.hp = 4;
      p.damage += 2.4;
      p.moveSpeed += 15;
      p.appearance.headColor = '#f2b4a2';
      p.appearance.eyeColor = '#a32014';
      p.appearance.brow = 'angry';
    } },
  { id: 'dark', name: '暗黑 dodo', desc: '3 颗魂心护体 红心只有 2 颗', unlock: 'char_dark',
    apply(p) {
      p.maxHp = 4; p.hp = 4;
      p.soulHp = 6;
      p.soulOverflow = true;   // hearts picked up at full health become soul hearts
      p.appearance.headColor = '#5d5573';
      p.appearance.eyeColor = '#cbb9f2';
      p.appearance.aura = 'rgba(96,64,150,0.28)';
    } },
];
const CHAR_BY_ID = {};
for (const c of CHAR_DEFS) CHAR_BY_ID[c.id] = c;

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
