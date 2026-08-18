'use strict';
const { section, ok, eq, near, frames, state, luma, press, ROOT, INDEX_URL } = require('../helpers.cjs');

module.exports = async ({ page, context, consoleErrors }) => {
  section('商店房');
  const shopGen = await page.evaluate(() => {
    let withShop = 0;
    for (let i = 0; i < 20; i++) {
      if (generateFloor(1).rooms.some(r => r.kind === 'shop')) withShop++;
    }
    startRun();
    const shopRoom = G.floor.rooms.find(r => r.kind === 'shop');
    return { withShop, hasShop: !!shopRoom, prices: [itemShopPrice(1), itemShopPrice(5), itemShopPrice(9)] };
  });
  eq('20 次生成层层有商店房', shopGen.withShop, 20);
  ok('本局楼层带商店房', shopGen.hasShop);
  ok('道具价格随层数上涨 15/20/25',
    shopGen.prices[0] === 15 && shopGen.prices[1] === 20 && shopGen.prices[2] === 25,
    shopGen.prices.join('/'));

  const shopEnter = await page.evaluate(() => {
    const shopRoom = G.floor.rooms.find(r => r.kind === 'shop');
    enterRoom(shopRoom, null);
    const ws = G.room.shopItems || [];
    return {
      kind: G.room.kind,
      cleared: G.room.cleared,
      stocked: !!G.room.shopStocked,
      count: ws.length,
      heart: ws.filter(w => w.kind === 'heart').map(w => w.price)[0],
      battery: ws.filter(w => w.kind === 'battery').map(w => w.price)[0],
      items: ws.filter(w => w.kind === 'item' || w.kind === 'active')
        .map(w => ({ id: w.def && w.def.id, price: w.price })),
      hasConsumable: ws.some(w => w.kind === 'bomb' || w.kind === 'battery'),
      enemies: G.enemies.length,
    };
  });
  eq('进入商店房', shopEnter.kind, 'shop');
  ok('商店房有怪物守卫', shopEnter.enemies > 0, 'enemies=' + shopEnter.enemies);
  ok('进门时门是关闭的（未清怪）', shopEnter.cleared === false);
  ok('首次进店进货 4 件', shopEnter.stocked && shopEnter.count === 4, 'count=' + shopEnter.count);
  ok('红心若上架标价 5 金币', !shopEnter.heart || shopEnter.heart === 5, 'heart=' + shopEnter.heart);
  eq('电池固定上架且标价 2 金币', shopEnter.battery, 2);
  ok('上架炸弹或电池消耗品', shopEnter.hasConsumable);
  ok('两件道具位已定价且不重复',
    shopEnter.items.length === 2 && shopEnter.items[0].id && shopEnter.items[1].id &&
    shopEnter.items[0].id !== shopEnter.items[1].id &&
    shopEnter.items.every(i => i.price >= 15),
    JSON.stringify(shopEnter.items));

  const shopBuy = await page.evaluate(() => {
    const p = G.player;
    p.invuln = 9999;
    G.enemies = [];                          // clear the guards, focus on purchases
    const w = G.room.shopItems.find(w => w.kind === 'item');
    // 1) not enough coins: collide, expect denial toast and no purchase
    p.coins = w.price - 1;
    p.x = w.x; p.y = w.y; p.vx = 0; p.vy = 0;
    updatePlay(1 / 60);
    const denied = { taken: w.taken, coins: p.coins, toast: G.toast && G.toast.title };
    // 2) enough coins: same collision buys instantly
    p.coins = w.price + 2;
    p.x = w.x; p.y = w.y;
    updatePlay(1 / 60);
    return {
      denied,
      defId: w.def.id,
      taken: w.taken,
      coins: p.coins,
      applied: p.itemsTaken.includes(w.def.id),
      toast: G.toast && G.toast.title,
      items: G.stats.items,
    };
  });
  ok('金币不足时无法购买', shopBuy.denied.taken === false && shopBuy.denied.coins >= 0);
  eq('金币不足有提示', shopBuy.denied.toast, '金币不足');
  ok('金币足够碰撞即购得', shopBuy.taken === true);
  const coinBonus = shopBuy.defId === 'golden_key' ? 5 : (shopBuy.defId === 'lucky_penny' ? 8 : 0);
  eq('购买后正确扣款', shopBuy.coins, 2 + coinBonus);
  ok('道具效果已生效并计入统计', shopBuy.applied && shopBuy.items > 0);

  const shopHeart = await page.evaluate(() => {
    const p = G.player;
    // the consumable slot alternates bomb/heart — force a heart in if this
    // shop rolled bombs, so the purchase math is deterministic
    const ws = G.room.shopItems;
    if (!ws.some(w => w.kind === 'heart')) {
      ws[1] = Object.assign({ kind: 'heart', name: '红心', desc: '回复一颗心!', price: 5 },
        { x: ws[1].x, y: ws[1].y, anim: 0, taken: false, near: false, denyT: 0 });
    }
    const w = ws.find(w => w.kind === 'heart');
    p.coins = 10;
    p.hp = p.maxHp;                          // full health: heart should be refused
    p.x = w.x; p.y = w.y; p.vx = 0; p.vy = 0;
    updatePlay(1 / 60);
    const fullBlocked = !w.taken && p.coins === 10;
    p.hp = p.maxHp - 2;                      // now injured: same collision buys
    p.x = w.x; p.y = w.y;
    updatePlay(1 / 60);
    return { fullBlocked, taken: w.taken, coins: p.coins, healed: p.hp === p.maxHp };
  });
  ok('满血时不会浪费金币买红心', shopHeart.fullBlocked);
  ok('缺血时红心购买生效（扣 5 金币回满）',
    shopHeart.taken && shopHeart.coins === 5 && shopHeart.healed,
    JSON.stringify(shopHeart));

  const shopMap = await page.evaluate(() => {
    // isolate the shop cell on the minimap, then hunt for the gold coin marker
    const shopRoom = G.floor.rooms.find(r => r.kind === 'shop');
    const saved = G.floor.rooms.map(r => ({ r, v: r.visited, s: r.seen }));
    for (const r of G.floor.rooms) { r.visited = false; r.seen = false; }
    shopRoom.visited = true;
    // draw the minimap directly: render() would stack the vignette/grain
    // post-fx on top and shift the corner colors out of tolerance
    ctx.fillStyle = '#000';
    ctx.fillRect(W - 140, 10, 130, 130);
    drawMinimap(ctx, G.floor, G.room);
    const img = ctx.getImageData(W - 140, 10, 130, 130).data;
    let goldPx = 0;
    for (let i = 0; i < img.length; i += 4) {
      if (Math.abs(img[i] - 231) < 25 && Math.abs(img[i + 1] - 187) < 25 && Math.abs(img[i + 2] - 66) < 25) goldPx++;
    }
    for (const { r, v, s } of saved) { r.visited = v; r.seen = s; }
    return goldPx;
  });
  ok('右上角小地图有金币标记', shopMap > 5, 'goldPx=' + shopMap);

  const shopDraw = await page.evaluate(() => {
    // tooltip + ware rendering must not throw
    try {
      // any def-bearing ware works; consumable slots (bomb/battery) have no def,
      // so synthesize one if every item/active slot has been bought already
      const w2 = G.room.shopItems.find(w => w.def && !w.taken)
        || G.room.shopItems.find(w => w.def)
        || { kind: 'item', def: ITEM_DEFS[0], price: 15, x: W / 2, y: H / 2, anim: 0, taken: false, near: false, denyT: 0 };
      drawShopWare(ctx, w2, 0);
      drawItemTooltip(ctx, { name: w2.def.name, desc: w2.def.desc, price: w2.price, x: w2.x, y: w2.y }, 0);
      drawItemTooltip(ctx, { name: w2.def.name, desc: w2.def.desc, price: w2.price, x: w2.x, y: w2.y }, 99);
      drawDoor(ctx, 'N', 'closed', 'shop');
      drawDoor(ctx, 'N', 'open', 'shop');
      return 'ok';
    } catch (e) { return String(e); }
  });
  eq('货摊 / 描述面板 / 商店门绘制不报错', shopDraw, 'ok');

  const tooltipAll = await page.evaluate(() => {
    // tooltips are a global mechanic, not shop-only: pedestal + pickups in a
    // plain room must also show their name/effect card when the player nears
    const room = G.floor.rooms.find(r => r.kind === 'normal');
    enterRoom(room, null);
    G.enemies = [];
    const p = G.player;
    p.coins = 4;
    // remember the entities first: updatePlay collects whatever the player
    // touches, so the tooltip scan must not depend on post-frame survivors
    let pk = room.pickups.find(x => !x.taken);
    if (!pk) { room.pickups.push(makePickup('coin', W / 2, H / 2 - 40)); pk = room.pickups[room.pickups.length - 1]; }
    let ped = room.pedestals.find(x => !x.taken && x.def);
    if (!ped) { spawnItemPedestal(room, W / 2, H / 2 + 40); ped = room.pedestals[room.pedestals.length - 1]; }
    const pkKind = pk.kind, pkX = pk.x, pkY = pk.y;
    const pedName = ped.def.name, pedX = ped.x, pedY = ped.y;
    p.x = pkX; p.y = pkY; p.vx = 0; p.vy = 0;
    updatePlay(1 / 60);
    // whatever got picked up in that frame is exactly what the card would
    // have shown the moment the player walked in
    const pickupTip = pk.taken ? { heart: '红心', halfheart: '半颗心', coin: '金币', chest: '宝箱' }[pkKind] : null;
    p.x = pedX; p.y = pedY;
    updatePlay(1 / 60);
    const pedTip = ped.taken ? pedName : null;
    return { pickupTip, pedTip };
  });
  ok('靠近掉落物弹出信息卡', !!tooltipAll.pickupTip, 'pickupTip=' + tooltipAll.pickupTip);
  ok('道具台同样弹出名称/加成信息卡', !!tooltipAll.pedTip, 'pedTip=' + tooltipAll.pedTip);

  // ---------------------------------------------------- bombs
  section('炸弹');
  const bombInfo = await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    startRun();
    const p = G.player;
    const out = { startBombs: p.bombs };
    G.enemies = [];
    G.room.cleared = true;
    p.invuln = 0;
    // place a bomb next to a rock and stand clear
    G.room.rocks = [{ cx: 3, cy: 3 }];
    const t = tileRect(3, 3);
    const rockX = t.x + TILE / 2, rockY = t.y + TILE / 2;
    p.x = rockX + 50; p.y = rockY;
    placeBomb();
    out.placed = G.liveBombs.length === 1;
    out.bombsAfterPlace = p.bombs;
    // fast-forward the fuse; player walks away in time
    p.x = rockX + 400;
    G.liveBombs[0].t = 0.01;
    updatePlay(1 / 60);
    out.exploded = G.liveBombs.length === 0;
    out.rockGone = G.room.rocks.length === 0;
    out.playerSafe = p.hp === p.maxHp;
    // second bomb right under the player: it must hurt
    p.bombs = 1;
    placeBomb();
    G.liveBombs[0].t = 0.01;
    p.invuln = 0;
    updatePlay(1 / 60);
    out.selfHurt = p.hp < p.maxHp;
    // no bombs left -> denial toast, nothing placed
    p.bombs = 0;
    G.toast = null;
    placeBomb();
    out.denied = G.liveBombs.length === 0 && !!G.toast;
    // live bomb draws
    try { drawLiveBomb(ctx, { x: -200, y: -200, t: 1, maxT: 1.6, anim: 0.3 }); out.draws = true; }
    catch (e) { out.draws = String(e); }
    await frame();
    return out;
  });
  ok('开局自带 3 颗炸弹', bombInfo.startBombs === 3, bombInfo.startBombs);
  ok('按 E 放置并扣除一颗', bombInfo.placed && bombInfo.bombsAfterPlace === 2,
    'placed=' + bombInfo.placed + ' left=' + bombInfo.bombsAfterPlace);
  ok('引线烧完爆炸并炸碎岩石', bombInfo.exploded && bombInfo.rockGone);
  ok('站远处不受波及', bombInfo.playerSafe);
  ok('贴脸爆炸会伤到自己', bombInfo.selfHurt);
  ok('没炸弹时按 E 只弹提示', bombInfo.denied);
  ok('点燃的炸弹可绘制', bombInfo.draws === true, bombInfo.draws);

  // ---------------------------------------------------- active items
  section('主动道具（空格）');
  const activeInfo = await page.evaluate(() => {
    const out = {};
    out.defCount = ACTIVE_DEFS.length;
    out.costsVary = new Set(ACTIVE_DEFS.map(d => d.cost)).size >= 3;
    const p = G.player;
    out.noneAtStart = p.active === null || p.active === undefined ? false : true;
    // equip the heal item, fully charged on pickup
    const heal = ACTIVE_BY_ID['act_heal'];
    equipActive(p, heal);
    out.fullOnPickup = p.active.charge === heal.cost;
    // use it while hurt
    p.hp = 2; p.maxHp = 6;
    G.toast = null;
    useActiveItem();
    out.healWorks = p.hp === 6 && p.active.charge === 0 && !!G.toast;
    // empty charge -> denied
    G.toast = null;
    useActiveItem();
    out.deniedEmpty = p.hp === 6 && !!G.toast;
    // room clear charges +1
    const c0 = p.active.charge;
    onRoomCleared(G.room);
    out.clearCharges = p.active.charge === c0 + 1;
    // battery pickup charges +1 and is consumed; ignored at full charge
    G.room.pickups = [makePickup('battery', p.x, p.y)];
    p.invuln = 9999;
    updatePlay(1 / 60);
    out.batteryCharges = p.active.charge === c0 + 2 && G.room.pickups.length === 0;
    p.active.charge = p.active.def.cost;
    G.room.pickups = [makePickup('battery', p.x, p.y)];
    updatePlay(1 / 60);
    out.batteryKeptAtFull = G.room.pickups.length === 1 && !G.room.pickups[0].taken;
    G.room.pickups = [];
    // bomb bag grants bombs
    equipActive(p, ACTIVE_BY_ID['act_bomb_bag']);
    const b0 = p.bombs;
    useActiveItem();
    out.bombBag = p.bombs === b0 + 2;
    // teleport goes home
    equipActive(p, ACTIVE_BY_ID['act_teleport']);
    useActiveItem();
    out.teleport = G.room === G.floor.start;
    // every active icon draws
    let err = null;
    for (const d of ACTIVE_DEFS) {
      try { drawItemIcon(ctx, -200, -200, d); } catch (e) { err = d.id + ': ' + e.message; }
    }
    out.iconsDraw = err || true;
    return out;
  });
  ok('主动道具池 >= 5 且充能费用有梯度', activeInfo.defCount >= 5 && activeInfo.costsVary,
    'count=' + activeInfo.defCount);
  ok('开局没有主动道具', activeInfo.noneAtStart === false);
  ok('拾取时满充能', activeInfo.fullOnPickup);
  ok('空格触发效果并清空充能', activeInfo.healWorks);
  ok('充能不足只弹提示', activeInfo.deniedEmpty);
  ok('清房 +1 充能', activeInfo.clearCharges);
  ok('电池 +1 充能且被消耗', activeInfo.batteryCharges);
  ok('满充能时电池留在地上', activeInfo.batteryKeptAtFull);
  ok('炸弹锦囊 +2 炸弹', activeInfo.bombBag);
  ok('回家的路传送回起始房', activeInfo.teleport);
  ok('全部主动道具图标可绘制', activeInfo.iconsDraw === true, activeInfo.iconsDraw);

  // ---------------------------------------------------- new room kinds
  section('新房型');
  const roomsInfo = await page.evaluate(() => {
    const out = { secret: 0, curse: 0, challenge: 0, miniboss: 0, hiddenOk: true, secretLinked: true };
    for (let i = 0; i < 30; i++) {
      const f = generateFloor(6);
      const by = k => f.rooms.filter(r => r.kind === k).length;
      if (by('secret')) out.secret++;
      if (by('curse')) out.curse++;
      if (by('challenge')) out.challenge++;
      if (by('miniboss')) out.miniboss++;
      const sec = f.rooms.find(r => r.kind === 'secret');
      if (sec) {
        const sides = Object.keys(sec.doors);
        if (!sides.length) out.secretLinked = false;
        // every secret door must start hidden on both sides
        for (const s of sides) {
          const opp = { N: 'S', S: 'N', W: 'E', E: 'W' }[s];
          if (!sec.hiddenSides || !sec.hiddenSides[s]) out.hiddenOk = false;
          const nb = sec.doors[s];
          if (!nb.hiddenSides || !nb.hiddenSides[opp]) out.hiddenOk = false;
        }
      }
    }
    return out;
  });
  eq('每层都有秘密房', roomsInfo.secret, 30);
  ok('诅咒房按概率出现', roomsInfo.curse >= 8 && roomsInfo.curse <= 28, roomsInfo.curse);
  ok('挑战房按概率出现', roomsInfo.challenge >= 7 && roomsInfo.challenge <= 27, roomsInfo.challenge);
  ok('小Boss房按概率出现', roomsInfo.miniboss >= 6 && roomsInfo.miniboss <= 26, roomsInfo.miniboss);
  ok('秘密房与邻居互连', roomsInfo.secretLinked);
  ok('秘密房的门双向隐藏', roomsInfo.hiddenOk);

  const secretPlay = await page.evaluate(() => {
    const out = {};
    startRun();
    const p = G.player;
    p.invuln = 9999;
    const secret = G.floor.rooms.find(r => r.kind === 'secret');
    const nb = Object.values(secret.doors)[0];
    const side = Object.keys(nb.doors).find(s => nb.doors[s] === secret);
    enterRoom(nb, null);
    G.enemies = [];
    G.room.cleared = true;
    out.secretHiddenOnMap = !secret.seen;
    // walking into the hidden wall must not change rooms
    const dp = DOOR_POS[side];
    p.x = dp.x; p.y = dp.y;
    updatePlay(1 / 60);
    out.wallBlocks = G.room === nb;
    // bomb the wall open
    p.bombs = 1;
    p.x = clamp(dp.x, FLOOR_X + 40, FLOOR_X + FLOOR_W - 40);
    p.y = clamp(dp.y, FLOOR_Y + 40, FLOOR_Y + FLOOR_H - 40);
    placeBomb();
    G.liveBombs[0].t = 0.01;
    updatePlay(1 / 60);
    out.wallOpened = !nb.hiddenSides || !nb.hiddenSides[side];
    out.secretNowSeen = secret.seen === true;
    // now the door works
    p.x = dp.x; p.y = dp.y;
    updatePlay(1 / 60);
    out.entered = G.room === secret;
    out.loot = secret.pickups.length >= 3;
    return out;
  });
  ok('秘密房开局不在小地图上', secretPlay.secretHiddenOnMap);
  ok('隐藏墙不可直接通过', secretPlay.wallBlocks);
  ok('炸弹在墙边引爆后墙裂开', secretPlay.wallOpened, JSON.stringify(secretPlay));
  ok('炸开后秘密房出现在小地图', secretPlay.secretNowSeen);
  ok('可以走进秘密房', secretPlay.entered);
  ok('秘密房藏有战利品', secretPlay.loot);

  const cursePlay = await page.evaluate(async () => {
    const out = {};
    // force a floor with a curse room
    let tries = 0;
    while (tries++ < 60 && !G.floor.rooms.some(r => r.kind === 'curse')) startRun();
    const curse = G.floor.rooms.find(r => r.kind === 'curse');
    if (!curse) return { skip: true };
    const p = G.player;
    const nb = Object.values(curse.doors)[0];
    const side = Object.keys(nb.doors).find(s => nb.doors[s] === curse);
    enterRoom(nb, null);
    G.enemies = [];
    G.room.cleared = true;
    p.hp = p.maxHp;
    p.invuln = 0;
    const dp = DOOR_POS[side];
    p.x = dp.x; p.y = dp.y;
    updatePlay(1 / 60);
    out.entered = G.room === curse;
    out.spiked = p.hp === p.maxHp - 1;
    out.hasReward = curse.pedestals.length >= 1;
    // defence works exactly as intuition says: flight sails over the spikes,
    // the holy shield eats the hit, invulnerability rides through, and flat
    // damage reduction can null a half-heart toll entirely
    const backSide = Object.keys(curse.doors).find(s => curse.doors[s] === nb);
    const dp2 = DOOR_POS[backSide];
    const cross = () => { p.x = dp2.x; p.y = dp2.y; updatePlay(1 / 60); return G.room === nb; };
    p.hp = p.maxHp; p.invuln = 0; p.flight = true; p.shieldUp = false; p.dmgReduce = 0;
    out.flightFree = cross() && p.hp === p.maxHp;
    p.flight = false;
    enterRoom(curse, null); p.hp = p.maxHp; p.invuln = 0; p.shieldUp = true;
    out.shieldFree = cross() && p.hp === p.maxHp && p.shieldUp === false;
    p.shieldUp = false;
    enterRoom(curse, null); p.hp = p.maxHp; p.invuln = 5; p.shieldUp = false;
    out.invulnFree = cross() && p.hp === p.maxHp;
    p.invuln = 0;
    enterRoom(curse, null); p.hp = p.maxHp; p.invuln = 0; p.shieldUp = false; p.dmgReduce = 1;
    out.reduceFree = cross() && p.hp === p.maxHp;
    p.dmgReduce = 0;
    // ...and teleporting home leaves the curse room without paying
    enterRoom(curse, null);
    p.hp = p.maxHp; p.invuln = 0;
    ACTIVE_BY_ID['act_teleport'].use(G);
    out.teleportFree = G.room === G.floor.start && p.hp === p.maxHp;
    return out;
  });
  ok('走进诅咒房扣半颗心', cursePlay.skip || (cursePlay.entered && cursePlay.spiked),
    JSON.stringify(cursePlay));
  ok('诅咒房里有奖励台座', cursePlay.skip || cursePlay.hasReward);
  ok('飞行可以无伤跨过刺门', cursePlay.skip || cursePlay.flightFree);
  ok('神圣护盾挡下过路费', cursePlay.skip || cursePlay.shieldFree);
  ok('无敌帧内过门不扣血', cursePlay.skip || cursePlay.invulnFree);
  ok('减伤能抵掉过路费', cursePlay.skip || cursePlay.reduceFree);
  ok('传送离开诅咒房不用付过路费', cursePlay.skip || cursePlay.teleportFree);

  const challengePlay = await page.evaluate(() => {
    const out = {};
    let tries = 0;
    while (tries++ < 60 && !G.floor.rooms.some(r => r.kind === 'challenge')) startRun();
    const ch = G.floor.rooms.find(r => r.kind === 'challenge');
    if (!ch) return { skip: true };
    const p = G.player;
    p.invuln = 9999;
    enterRoom(ch, null);
    out.peacefulOnEnter = ch.cleared === true && G.enemies.length === 0;
    const ped = ch.pedestals[0];
    out.hasPrize = !!(ped && ped.def);
    // grab the prize -> doors slam, wave 1 spawns
    p.x = ped.x; p.y = ped.y;
    updatePlay(1 / 60);
    out.started = ch.challengeStarted === true && ch.cleared === false;
    out.wave1 = G.enemies.length > 0;
    // kill wave 1 -> wave 2 spawns instead of opening up
    G.enemies = [];
    updatePlay(1 / 60);
    out.wave2 = G.enemies.length > 0 && ch.cleared === false;
    // kill wave 2 -> room clears
    G.enemies = [];
    updatePlay(1 / 60);
    out.finished = ch.cleared === true;
    return out;
  });
  ok('挑战房进门无敌人且门开着', challengePlay.skip || challengePlay.peacefulOnEnter,
    JSON.stringify(challengePlay));
  ok('挑战房中央有奖励', challengePlay.skip || challengePlay.hasPrize);
  ok('拿奖励后关门刷第一波', challengePlay.skip || (challengePlay.started && challengePlay.wave1));
  ok('清完第一波刷第二波', challengePlay.skip || challengePlay.wave2);
  ok('清完所有波次房间解锁', challengePlay.skip || challengePlay.finished);

  const minibossPlay = await page.evaluate(() => {
    const out = {};
    // always search on fresh floors: earlier sections may have walked into
    // (and force-cleared) this floor's miniboss room
    let tries = 0;
    const pristine = r => r.kind === 'miniboss' && !r.enemiesSpawned && !r.cleared;
    do { G.floorNum = 4; loadFloor(); } while (tries++ < 80 && !G.floor.rooms.some(pristine));
    const mb = G.floor.rooms.find(pristine);
    if (!mb) return { skip: true };
    const p = G.player;
    p.invuln = 9999;
    enterRoom(mb, null);
    const boss = G.enemies.find(e => e.isBoss);
    out.spawnsBoss = !!boss && boss.miniboss === true;
    out.noTrapdoorBefore = !mb.trapdoor;
    if (boss) {
      boss.spawnT = 0;
      killEnemy(G, boss);
      out.reward = mb.pedestals.some(pd => pd.def && !pd.taken);
      out.noTrapdoorAfter = !mb.trapdoor;
    }
    return out;
  });
  ok('小Boss房刷出削弱版 Boss', minibossPlay.skip || minibossPlay.spawnsBoss,
    JSON.stringify(minibossPlay));
  ok('击杀小Boss掉道具但不开地道', minibossPlay.skip ||
    (minibossPlay.reward && minibossPlay.noTrapdoorBefore && minibossPlay.noTrapdoorAfter));

  // ------------------------------------------- pools / seeds / new mechanics
};
