'use strict';
// Reproduce the held-Tab focus escape with trusted CDP key events (real
// browser default actions, including focus traversal), then report where
// focus ends up.
const path = require('path');
const { createRequire } = require('module');
const fs = require('fs');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) {}
  const nvm = path.join(process.env.HOME || '', '.nvm/versions/node');
  if (fs.existsSync(nvm)) {
    for (const v of fs.readdirSync(nvm)) {
      for (const p of [
        path.join(nvm, v, 'lib/node_modules/@playwright/cli/node_modules/playwright'),
        path.join(nvm, v, 'lib/node_modules/playwright'),
      ]) {
        if (fs.existsSync(p)) return createRequire(path.join(p, 'index.js'))(p);
      }
    }
  }
  throw new Error('playwright not found');
}

(async () => {
  const pw = loadPlaywright();
  let browser;
  try { browser = await pw.chromium.launch(); }
  catch (e) { browser = await pw.chromium.launch({ channel: 'chrome' }); }
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));

  // enter the game
  await page.keyboard.press('Enter');
  await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));

  const snap = () => page.evaluate(() => ({
    overlay: G.mapOverlay,
    hasFocus: document.hasFocus(),
    active: document.activeElement ? (document.activeElement.tagName + (document.activeElement.id ? '#' + document.activeElement.id : '')) : null,
    state: G.state, paused: G.paused,
  }));

  const cdp = await page.context().newCDPSession(page);
  const base = {
    code: 'Tab', key: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9,
  };
  // initial press + a burst of OS auto-repeats, exactly what holding Tab produces
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  for (let i = 0; i < 15; i++) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', autoRepeat: true, ...base });
  }
  const held = await snap();
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  const released = await snap();

  console.log('while held  :', JSON.stringify(held));
  console.log('after release:', JSON.stringify(released));
  const pass = held.overlay === true && held.hasFocus === true && held.paused === false &&
    released.overlay === false && released.hasFocus === true;
  console.log(pass ? 'PASS: focus stayed on the page through 16 repeated Tab keydowns' : 'FAIL');
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
