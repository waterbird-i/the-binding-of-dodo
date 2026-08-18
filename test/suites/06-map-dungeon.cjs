'use strict';
const { section, ok, eq, near, frames, state, luma, press, ROOT, INDEX_URL } = require('../helpers.cjs');

module.exports = async ({ page, context, consoleErrors }) => {
  section('小地图与全图');
  const mapInfo = await page.evaluate(() => {
    const out = {};
    startRun();
    // every kind + leftover glyph draws without error
    const kinds = ['start', 'normal', 'boss', 'treasure', 'shop', 'secret', 'curse', 'challenge', 'miniboss'];
    let err = null;
    for (const k of kinds) {
      const r = makeRoom(0, 0, k);
      r.visited = true;
      try { drawRoomGlyph(ctx, r, -100, -100, 1); } catch (e) { err = k + ': ' + e.message; }
    }
    // leftover markers
    const r2 = makeRoom(0, 0, 'normal');
    r2.visited = true;
    for (const pk of ['chest', 'battery', 'bomb', 'heart', 'coin']) {
      r2.pickups = [{ kind: pk, taken: false }];
      try { drawRoomGlyph(ctx, r2, -100, -100, 1); } catch (e) { err = 'leftover ' + pk + ': ' + e.message; }
    }
    r2.pickups = [];
    r2.pedestals = [{ taken: false, def: ITEM_DEFS[0] }];
    try { drawRoomGlyph(ctx, r2, -100, -100, 1); } catch (e) { err = 'leftover item: ' + e.message; }
    out.glyphs = err || true;
    // trapdoor beats other glyphs
    out.leftover = roomLeftoverGlyph(r2) === 'item';
    const r3 = makeRoom(0, 0, 'boss');
    r3.trapdoor = { x: 0, y: 0 };
    try { drawRoomGlyph(ctx, r3, -100, -100, 1); out.trapdoorGlyph = true; }
    catch (e) { out.trapdoorGlyph = String(e); }
    // Tab overlay
    G.mapOverlay = true;
    try { drawFullMap(ctx, G.floor, G.room); out.fullMapDraws = true; }
    catch (e) { out.fullMapDraws = String(e); }
    G.mapOverlay = false;
    return out;
  });
  ok('全部房型 + 残留物图标可绘制', mapInfo.glyphs === true, mapInfo.glyphs);
  ok('残留道具优先级正确', mapInfo.leftover);
  ok('地道口图标可绘制', mapInfo.trapdoorGlyph === true, mapInfo.trapdoorGlyph);
  ok('Tab 全图可绘制', mapInfo.fullMapDraws === true, mapInfo.fullMapDraws);

  const tabKey = await page.evaluate(() => ({ before: G.mapOverlay }));
  await page.keyboard.down('Tab');
  await frames(page, 3);
  const tabHeld = await page.evaluate(() => G.mapOverlay);
  await page.keyboard.up('Tab');
  await frames(page, 3);
  const tabReleased = await page.evaluate(() => G.mapOverlay);
  ok('按住 Tab 打开全图', tabKey.before === false && tabHeld === true);
  ok('松开 Tab 关闭全图', tabReleased === false);

  // tapping the minimap is the touch route to the same overlay: it opens the
  // map *and* freezes the run, and any further tap closes it
  const tapMap = async (onMinimap) => page.evaluate(on => {
    const b = minimapBox();
    const r = canvas.getBoundingClientRect();
    const cx = on ? b.x + b.w / 2 : W / 2, cy = on ? b.y + b.h / 2 : H / 2;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true,
      clientX: r.left + cx * (r.width / W), clientY: r.top + cy * (r.height / H) }));
    return { map: G.mapOverlay, paused: G.paused };
  }, onMinimap);
  const tapOpen = await tapMap(true);
  await frames(page, 3);
  ok('点小地图打开全图', tapOpen.map === true);
  ok('全图打开时冻结对局', tapOpen.paused === true);
  const tapClose = await tapMap(false);
  ok('再点一下关闭全图', tapClose.map === false);
  ok('关闭全图后继续对局', tapClose.paused === false);

  // ---------------------------------------------------- mapping items
  section('地图道具');
  const mapItems = await page.evaluate(() => {
    const out = {};
    startRun();
    const p = G.player;
    const byId = id => ITEM_DEFS.find(d => d.id === id);
    out.exist = !!(byId('the_compass') && byId('treasure_map') && byId('blue_map'));
    const seen = () => {
      const s = {};
      for (const r of G.floor.rooms) if (r.seen || r.visited) s[r.kind] = (s[r.kind] || 0) + 1;
      return s;
    };
    // compass: special rooms light up
    byId('the_compass').apply(p);
    const s1 = seen();
    out.compass = p.compass === true &&
      G.floor.rooms.filter(r => ['boss', 'treasure', 'shop'].includes(r.kind)).every(r => r.seen || r.visited) &&
      !G.floor.rooms.find(r => r.kind === 'secret').seen;
    // treasure map: whole layout except secrets
    byId('treasure_map').apply(p);
    out.treasureMap = G.floor.rooms.every(r => r.kind === 'secret' ? !r.seen : (r.seen || r.visited));
    // blue map: secrets too
    byId('blue_map').apply(p);
    out.blueMap = G.floor.rooms.every(r => r.seen || r.visited);
    // reveals persist onto the next floor
    G.floorNum = 2; loadFloor();
    out.nextFloor = G.floor.rooms.every(r => r.seen || r.visited);
    out.s1 = s1;
    return out;
  });
  ok('三张地图道具都存在', mapItems.exist);
  ok('指南针点亮特殊房（不含秘密房）', mapItems.compass, JSON.stringify(mapItems.s1));
  ok('藏宝图点亮整层（不含秘密房）', mapItems.treasureMap);
  ok('蓝图点亮秘密房', mapItems.blueMap);
  ok('地图效果延续到下一层', mapItems.nextFloor);

  // ---------------------------------------------------- dungeon generation
  section('地牢生成健壮性');
  const gen = await page.evaluate(() => {
    const bad = [];
    let minRooms = 99, maxRooms = 0;
    for (let depth = 1; depth <= 12; depth++) {
      for (let i = 0; i < 25; i++) {
        const f = generateFloor(depth);
        const rooms = f.rooms;
        const boss = rooms.filter(r => r.kind === 'boss');
        const treasure = rooms.filter(r => r.kind === 'treasure');
        if (boss.length !== 1) { bad.push('depth' + depth + ' boss=' + boss.length); continue; }
        if (treasure.length !== 1) { bad.push('depth' + depth + ' treasure=' + treasure.length); continue; }
        // every room must be reachable from the start through doors
        const seen = new Set([f.start]);
        const q = [f.start];
        while (q.length) {
          const cur = q.shift();
          for (const side in cur.doors) {
            const nb = cur.doors[side];
            if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
          }
        }
        if (seen.size !== rooms.length) bad.push('depth' + depth + ' unreachable ' + (rooms.length - seen.size));
        // doors must be mutual
        for (const r of rooms) {
          for (const side in r.doors) {
            const nb = r.doors[side];
            const opp = { N: 'S', S: 'N', W: 'E', E: 'W' }[side];
            if (nb.doors[opp] !== r) bad.push('depth' + depth + ' one-way door');
          }
        }
        // rocks must never block a door lane or the centre spawn
        for (const r of rooms) {
          for (const rk of r.rocks) if (!rockAllowed(rk.cx, rk.cy)) bad.push('depth' + depth + ' rock blocks lane');
        }
        minRooms = Math.min(minRooms, rooms.length);
        maxRooms = Math.max(maxRooms, rooms.length);
      }
    }
    return { bad: bad.slice(0, 6), minRooms, maxRooms };
  });
  ok('12 层 × 25 次随机生成全部合法', gen.bad.length === 0, gen.bad.join(' | '));
  ok('房间数在合理区间（含 Boss/宝物/新房型）', gen.minRooms >= 7 && gen.maxRooms <= 18,
    gen.minRooms + '..' + gen.maxRooms);

  // ------------------------------------------------- full 12-floor playthrough
  // ------------------------------------------------- meta unlocks & characters
};
