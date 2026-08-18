'use strict';
// ============================================================================
// playtest.cjs — headless self-test for The Binding of dodo
//
//   node test/playtest.cjs            # run everything
//   node test/playtest.cjs --headed   # watch it play
//
// Drives the real page over file:// (the delivery requirement is that the game
// runs by double-clicking index.html) with real keyboard events, then asserts
// against the live game state. No npm install: it borrows the playwright that
// ships with the globally installed @playwright/cli.
// ============================================================================
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const INDEX_URL = 'file://' + path.join(ROOT, 'index.html');
const HEADED = process.argv.includes('--headed');

function loadPlaywright() {
  const tried = [];
  try { return require('playwright'); } catch (e) { tried.push('playwright'); }
  const nvm = path.join(process.env.HOME || '', '.nvm/versions/node');
  const roots = [];
  if (fs.existsSync(nvm)) {
    for (const v of fs.readdirSync(nvm)) {
      roots.push(path.join(nvm, v, 'lib/node_modules/@playwright/cli/node_modules/playwright'));
      roots.push(path.join(nvm, v, 'lib/node_modules/playwright'));
    }
  }
  roots.push('/usr/local/lib/node_modules/playwright', '/opt/homebrew/lib/node_modules/playwright');
  for (const r of roots) {
    try {
      if (fs.existsSync(r)) return createRequire(path.join(r, 'index.js'))(r);
    } catch (e) { tried.push(r); }
  }
  console.error('playwright not found. looked in:\n  ' + tried.join('\n  '));
  process.exit(2);
}

// ---------------- tiny assert harness ----------------
let group = '';
const results = [];
function section(name) { group = name; }
function ok(name, cond, extra) {
  results.push({ group, name, pass: !!cond, extra: cond ? '' : (extra == null ? '' : String(extra)) });
  const tag = cond ? '  ok  ' : ' FAIL ';
  console.log(tag + '[' + group + '] ' + name + (cond || extra == null ? '' : '  -> ' + extra));
}
function eq(name, actual, expected) {
  ok(name, actual === expected, 'got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected));
}
function near(name, actual, expected, tol) {
  ok(name, Math.abs(actual - expected) <= tol,
    'got ' + actual + ', want ' + expected + ' ±' + tol);
}

// ---------------- page helpers ----------------
const frames = (page, n = 2) => page.evaluate(n => new Promise(res => {
  let left = n;
  const step = () => (--left <= 0 ? res(true) : requestAnimationFrame(step));
  requestAnimationFrame(step);
}), n);

const state = page => page.evaluate(() => ({
  state: G.state, paused: G.paused, floorNum: G.floorNum,
  x: G.player && G.player.x, y: G.player && G.player.y,
  hp: G.player && G.player.hp, items: G.stats.items, kills: G.stats.kills,
  time: G.stats.time, tears: G.tears.length, enemies: G.enemies.length,
  beams: G.beams.length, roomKind: G.room && G.room.kind,
  boss: (G.enemies.find(e => e.isBoss) || {}).name || null,
  bossFinal: !!((G.enemies.find(e => e.isBoss) || {}).def || {}).final,
}));

// average luminance of the canvas, used to detect the pause dim + overlay
const luma = page => page.evaluate(() => {
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4 * 97) s += d[i] + d[i + 1] + d[i + 2];
  return s / (d.length / (4 * 97)) / 3;
});

async function press(page, key, ms = 40) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

// The globally installed playwright build and the downloaded browser revision
// don't always match, so find whatever chromium is actually on disk.
function findChromium() {
  const cache = path.join(process.env.HOME || '', 'Library/Caches/ms-playwright');
  if (!fs.existsSync(cache)) return null;
  const rel = HEADED
    ? ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
       'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing']
    : ['chrome-headless-shell-mac-arm64/chrome-headless-shell',
       'chrome-headless-shell-mac/chrome-headless-shell'];
  const dirs = fs.readdirSync(cache)
    .filter(d => d.startsWith(HEADED ? 'chromium-' : 'chromium_headless_shell-'))
    .sort()
    .reverse();
  for (const d of dirs) {
    for (const r of rel) {
      const p = path.join(cache, d, r);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}


module.exports = { ROOT, INDEX_URL, HEADED, loadPlaywright, findChromium, results, section, ok, eq, near, frames, state, luma, press };
