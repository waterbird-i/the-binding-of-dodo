'use strict';
// ============ leaderboard (popo Runtime dynamic data) ============
// Backed by the platform-injected window.PopSDK, which only exists when the
// game is served from its popo domain. Everything here degrades to a no-op
// when the SDK is absent (double-clicked index.html, local server, tests),
// so the game itself never depends on it.

const LB_OBJECT = 'run';
const LB_DOC_URL = 'https://ku.baidu-int.com/knowledge/HFVrC7hq1Q/pKzJfZczuc/4i9XFeQzYr/AtyPKxr4zXpRmD';

const LB = {
  sdkPresent: !!window.PopSDK,
  available: false,     // SDK present AND user info resolved
  me: null,             // { userName, avatar }
  rows: null,           // [{ player, timeMs, dumateMs }] sorted asc; null until first load
  loading: false,
  error: false,
  submitState: null,    // null | 'saving' | 'best' | 'kept' | 'failed'
  lastFetch: 0,
};

(function lbInit() {
  if (!window.PopSDK || !PopSDK.data || !PopSDK.user) return;
  Promise.resolve(typeof PopSDK.ready === 'function' ? PopSDK.ready() : null)
    .then(() => PopSDK.user.info())
    .then(info => {
      if (info && info.userName) { LB.me = info; LB.available = true; }
    })
    .catch(() => {});
})();

// Fetch the board (30s cache unless forced). Dedupe to one best row per player
// in case a race ever leaves someone with two records.
function lbRefresh(force) {
  if (!LB.available || LB.loading) return;
  if (!force && LB.rows && performance.now() - LB.lastFetch < 30000) return;
  LB.loading = true;
  PopSDK.data.find(LB_OBJECT, {
    filter: { jsonPath: '$.state == "active"' },
    order: [{ expression: "(data->>'timeMs')::numeric ASC" }],
    page: 1,
    pageSize: 100,
  }).then(records => {
    const best = new Map();
    for (const r of records || []) {
      const d = r.data;
      if (!d || typeof d.timeMs !== 'number' || !d.player) continue;
      const prev = best.get(d.player);
      if (!prev || d.timeMs < prev.timeMs) {
        best.set(d.player, { player: d.player, timeMs: d.timeMs,
          dumateMs: typeof d.dumateMs === 'number' ? d.dumateMs : 0 });
      }
    }
    LB.rows = Array.from(best.values()).sort((a, b) => a.timeMs - b.timeMs);
    LB.error = false;
    LB.lastFetch = performance.now();
  }).catch(() => { LB.error = true; })
    .finally(() => { LB.loading = false; });
}

// Called once on a clean win. Keeps exactly one record per player: create on
// first clear, update only when the new run is faster.
// dumateSec：讨伐 dumate 的额外用时（可选）。主排名仍按 timeMs（击杀
// MEGA dodo 的成绩），dumateMs 只是记录上的荣誉后缀。
function lbSubmitWin(timeSec, dumateSec) {
  if (!LB.available || !LB.me) return;
  const timeMs = Math.max(1, Math.round(timeSec * 1000));
  const dumateMs = dumateSec > 0 ? Math.max(1, Math.round(dumateSec * 1000)) : 0;
  LB.submitState = 'saving';
  PopSDK.data.find(LB_OBJECT, {
    filter: { jsonPath: '$.player == "' + LB.me.userName + '" && $.state == "active"' },
    page: 1,
    pageSize: 10,
  }).then(mine => {
    const existing = (mine || [])
      .filter(r => r.data && typeof r.data.timeMs === 'number')
      .sort((a, b) => a.data.timeMs - b.data.timeMs)[0];
    if (!existing) {
      return PopSDK.data.create(LB_OBJECT, { player: LB.me.userName, timeMs, dumateMs, state: 'active' })
        .then(() => { LB.submitState = 'best'; });
    }
    if (timeMs < existing.data.timeMs) {
      // send the full record so schema validation holds regardless of merge semantics
      return PopSDK.data.update(LB_OBJECT, existing.id, { player: LB.me.userName, timeMs, dumateMs, state: 'active' })
        .then(() => { LB.submitState = 'best'; });
    }
    LB.submitState = 'kept';
  }).then(() => lbRefresh(true))
    .catch(() => { LB.submitState = 'failed'; });
}
