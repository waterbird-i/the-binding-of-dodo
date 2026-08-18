'use strict';
// ---------------- update ----------------
function updatePlay(dt) {
  const p = G.player;
  G.stats.time = (performance.now() - G.stats.startTime) / 1000;

  // --- movement input ---
  let ix = 0, iy = 0;
  if (keys.KeyW) iy -= 1;
  if (keys.KeyS) iy += 1;
  if (keys.KeyA) ix -= 1;
  if (keys.KeyD) ix += 1;
  ix += touch.moveX; iy += touch.moveY;
  const il = Math.hypot(ix, iy);
  if (il > 1) { ix /= il; iy /= il; }
  const damp = 1 - Math.pow(0.0001, dt); // ~fast approach
  p.vx += (ix * p.moveSpeed - p.vx) * Math.min(1, dt * 11);
  p.vy += (iy * p.moveSpeed - p.vy) * Math.min(1, dt * 11);
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  // dodo wings: flying ignores rocks and other floor obstacles
  collideWithRoom(p, G.room, p.flight);
  p.moving = Math.hypot(p.vx, p.vy) > 30;
  if (p.moving) p.walk += dt * 11;
  if (p.flight) p.flap += dt * (p.moving ? 13 : 8);
  p.fireCd -= dt;
  p.invuln = Math.max(0, p.invuln - dt);
  p.hurtFlash = Math.max(0, p.hurtFlash - dt);
  p.blink = Math.max(0, p.blink - dt);
  p.wingGrow = Math.max(0, p.wingGrow - dt * 1.4);

  // --- fire input ---
  let fd = null;
  if (fireStack.length) fd = FIRE_DIRS[fireStack[fireStack.length - 1]];
  if (touch.fire) fd = touch.fire;
  if (fd) { p.aimX = fd[0]; p.aimY = fd[1]; }
  else if (il > 0.1) { p.aimX = ix / (il || 1); p.aimY = iy / (il || 1); }
  // Brimstone: holding the fire key charges the laser; it releases on its own
  // the moment the charge completes. Letting go early bleeds the charge away.
  if (p.laser) {
    if (fd && p.fireCd <= 0) {
      p.laserCharge += dt;
      if (p.laserCharge >= laserChargeTime(p)) {
        p.laserCharge = 0;
        fireBrimstone(G, fd[0], fd[1]);
      }
    } else if (p.laserCharge > 0) {
      p.laserCharge = Math.max(0, p.laserCharge - dt * 4);
    }
  } else if (fd && p.fireCd <= 0) {
    spawnPlayerTears(G, fd[0], fd[1]);
  }

  updateTears(G, dt);
  updateEnemies(G, dt);
  updateEnemyShots(G, dt);
  updateBeams(G, dt);
  updateLasers(G, dt);
  updateOrbitals(G, dt);
  updateFamiliars(G, dt);
  updateParticles(G, dt);
  updateBombs(dt);

  // --- pickups ---
  for (const pk of G.room.pickups) {
    pk.anim += dt;
    if (pk.taken) continue;
    // magnet items drag nearby coins/hearts in
    if (p.pickupMagnet > 0) {
      const d = dist(pk.x, pk.y, p.x, p.y);
      if (d < p.pickupMagnet && d > 1) {
        pk.x += (p.x - pk.x) / d * 150 * dt;
        pk.y += (p.y - pk.y) / d * 150 * dt;
      }
    }
    if (dist(pk.x, pk.y, p.x, p.y) < 22 + p.r) {
      if (pk.kind === 'heart') {
        if (p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + 2); pk.taken = true; SFX.heart(); }
        else if (p.soulOverflow && p.soulHp < 12) { p.soulHp = Math.min(12, p.soulHp + 2); pk.taken = true; SFX.heart(); }
      } else if (pk.kind === 'halfheart') {
        if (p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + 1); pk.taken = true; SFX.heart(); }
        else if (p.soulOverflow && p.soulHp < 12) { p.soulHp = Math.min(12, p.soulHp + 1); pk.taken = true; SFX.heart(); }
      } else if (pk.kind === 'soulheart') {
        // soul hearts stack past the red row and burn away first
        if (p.soulHp < 12) { p.soulHp = Math.min(12, p.soulHp + 2); pk.taken = true; SFX.heart(); }
      } else if (pk.kind === 'coin') {
        p.coins++; pk.taken = true; SFX.coin();
      } else if (pk.kind === 'bomb') {
        p.bombs++; pk.taken = true; SFX.thud();
      } else if (pk.kind === 'battery') {
        // only consumed when it actually charges something
        if (p.active && p.active.charge < p.active.def.cost) {
          addActiveCharge(p, 1);
          pk.taken = true;
          SFX.coin();
        }
      } else if (pk.kind === 'chest') {
        pk.taken = true;
        SFX.chest();
        if (chance(0.6)) spawnItemPedestal(G.room, pk.x, pk.y - 10);
        else {
          G.room.pickups.push(makePickup('coin', pk.x - 24, pk.y));
          G.room.pickups.push(makePickup(chance(0.5) ? 'heart' : 'coin', pk.x + 24, pk.y));
        }
        resolvePedestals(G.room, p);
      }
    }
  }
  G.room.pickups = G.room.pickups.filter(pk => !pk.taken);

  // --- item pedestals ---
  for (const ped of G.room.pedestals) {
    ped.anim += dt;
    ped.swapT = Math.max(0, (ped.swapT || 0) - dt);
    ped.denyT = Math.max(0, (ped.denyT || 0) - dt);
    if (ped.taken || !ped.def || ped.swapT > 0) continue;
    if (dist(ped.x, ped.y, p.x, p.y) < 26 + p.r) {
      // devil deal: pay in hearts before anything is granted
      if (ped.devilPrice) {
        if (!devilDealAfford(p, ped.devilPrice)) {
          if (ped.denyT <= 0) {
            ped.denyT = 1.2;
            G.toast = { title: '生命不足', desc: '恶魔对你的躯壳不感兴趣', t: 1.4 };
          }
          continue;
        }
        devilDealPay(p, ped.devilPrice);
        clampPlayerStats(p);
        spawnBlood(G, p.x, p.y, 10);
        SFX.hurt();
      }
      if (ped.def.active) {
        // spacebar item: swap with whatever is currently held
        const old = equipActive(p, ped.def);
        noteItemTaken();
        G.toast = { title: ped.def.name, desc: ped.def.desc + '　(空格使用)', t: 2.6 };
        SFX.item();
        if (old && !ped.devilPrice) { ped.def = old; ped.swapT = 1.2; }
        else ped.taken = true;
      } else {
        ped.taken = true;
        const hadFlight = p.flight;
        ped.def.apply(p);
        clampPlayerStats(p);
        p.itemsTaken.push(ped.def.id);
        noteItemTaken();
        G.toast = { title: ped.def.name, desc: ped.def.desc, t: 2.6 };
        SFX.item();
        // flight pickup flourish: feathers burst out as the wings sprout
        if (!hadFlight && p.flight) spawnFeathers(G, p.x, p.y);
        // 3 items of one set trigger a transformation (js/items.js)
        checkTransformations(G, p);
      }
      // choice pair: taking one crumbles its twin to dust
      if (ped.choiceGroup) {
        for (const o of G.room.pedestals) {
          if (o !== ped && !o.taken && o.choiceGroup === ped.choiceGroup) {
            o.taken = true;
            spawnSplash(G, o.x, o.y - 20, '#8b8375');
          }
        }
      }
      // challenge room: grabbing the prize slams the doors and starts the waves
      if (G.room.kind === 'challenge' && !G.room.challengeStarted) {
        G.room.challengeStarted = true;
        G.room.cleared = false;
        G.room.enemiesSpawned = true;
        G.room.challengeWaves = 1;   // one more wave after this first one
        spawnChallengeWave(G.room);
        G.toast = { title: '挑战开始!', desc: '击退所有来袭的敌人!', t: 2.2 };
        G.shake = Math.max(G.shake, 6);
        SFX.door();
      }
    }
  }

  // --- shop wares ---
  // walking into a ware buys it instantly when the coin purse covers the
  // price; otherwise a short "not enough" toast (throttled per ware)
  if (G.room.shopItems) {
    for (const w of G.room.shopItems) {
      w.anim += dt;
      w.denyT = Math.max(0, w.denyT - dt);
      w.near = false;
      if (w.taken) continue;
      const d = dist(w.x, w.y, p.x, p.y);
      w.near = d < 90;
      if (d >= 26 + p.r) continue;
      if (p.coins < w.price) {
        if (w.denyT <= 0) {
          w.denyT = 1.2;
          G.toast = { title: '金币不足', desc: '还差 ' + (w.price - p.coins) + ' 金币', t: 1.2 };
        }
        continue;
      }
      if (w.kind === 'heart') {
        if (p.hp >= p.maxHp) continue;      // don't waste coins at full health
        p.coins -= w.price;
        p.hp = Math.min(p.maxHp, p.hp + 2);
        w.taken = true;
        SFX.coin(); SFX.heart();
      } else if (w.kind === 'bomb') {
        p.coins -= w.price;
        p.bombs += 2;
        w.taken = true;
        SFX.coin(); SFX.thud();
      } else if (w.kind === 'battery') {
        // useless without a chargeable spacebar item — don't take the money
        if (!p.active || p.active.charge >= p.active.def.cost) {
          if (w.denyT <= 0) {
            w.denyT = 1.2;
            G.toast = { title: '暂时用不上', desc: p.active ? '主动道具已充满' : '还没有主动道具', t: 1.2 };
          }
          continue;
        }
        p.coins -= w.price;
        addActiveCharge(p, 1);
        w.taken = true;
        SFX.coin();
      } else if (w.kind === 'active') {
        p.coins -= w.price;
        w.taken = true;
        equipActive(p, w.def);   // shop swaps discard the old item
        noteItemTaken();
        G.toast = { title: w.def.name, desc: w.def.desc + '　(空格使用)', t: 2.6 };
        SFX.coin(); SFX.item();
      } else {
        p.coins -= w.price;
        w.taken = true;
        const hadFlight = p.flight;
        w.def.apply(p);
        clampPlayerStats(p);
        p.itemsTaken.push(w.def.id);
        noteItemTaken();
        G.toast = { title: w.def.name, desc: w.def.desc, t: 2.6 };
        SFX.coin(); SFX.item();
        if (!hadFlight && p.flight) spawnFeathers(G, p.x, p.y);
        checkTransformations(G, p);
      }
    }
  }

  // --- sacrifice room: bleed on the spike bed, the altar pays out ---
  // Flight does NOT clear the spikes here (unlike curse doors): the altar
  // demands real contact. A room-side cooldown paces the offerings (and keeps
  // dev-mode immunity from farming the altar every frame).
  if (G.room.kind === 'sacrifice') {
    G.room.altarCd = Math.max(0, (G.room.altarCd || 0) - dt);
    if (!G.room.altarDone && G.room.altarCd <= 0 && p.invuln <= 0 &&
        dist(p.x, p.y, W / 2, H / 2) < 46) {
      G.room.altarCd = 1.2;
      hurtPlayer(G, 2, W / 2, H / 2 + 40);
      if (G.state === 'play') {   // the altar doesn't pay corpses
        G.room.sacrifices = (G.room.sacrifices || 0) + 1;
        sacrificeReward(G.room, G.room.sacrifices);
      }
    }
  }

  // --- room cleared? ---
  if (!G.room.cleared && G.room.enemiesSpawned && G.enemies.length === 0) {
    if (G.room.challengeWaves > 0) {
      // next challenge wave rolls in instead of opening the doors
      G.room.challengeWaves--;
      spawnChallengeWave(G.room);
      G.toast = { title: '下一波!', desc: '守住!', t: 1.4 };
      SFX.door();
    } else {
      onRoomCleared(G.room);
    }
  }

  // --- trapdoors to the next floor (the spiked one arms the risky route) ---
  if (G.room.trapdoor && dist(G.room.trapdoor.x, G.room.trapdoor.y, p.x, p.y) < 26) {
    nextFloor(false);
    return;
  }
  if (G.room.trapdoorHard && dist(G.room.trapdoorHard.x, G.room.trapdoorHard.y, p.x, p.y) < 26) {
    nextFloor(true);
    return;
  }

  // --- door transitions (multi-room floors) ---
  if (G.room.cleared) {
    for (const side in G.room.doors) {
      if (G.room.hiddenSides && G.room.hiddenSides[side]) continue;  // unbombed secret wall
      const dp = DOOR_POS[side];
      if (dist(p.x, p.y, dp.x, dp.y) < 30) {
        const next = G.room.doors[side];
        const opposite = { N: 'S', S: 'N', W: 'E', E: 'W' }[side];
        // curse room doors are lined with spikes — half a heart to cross,
        // in and out. Defence works exactly as intuition says: flight sails
        // over them, the holy shield eats the hit, damage reduction and
        // invulnerability apply normally. Only teleporting away (回家的路)
        // leaves without paying.
        const spiked = (G.room.kind === 'curse' || next.kind === 'curse') && !p.flight;
        enterRoom(next, opposite);
        if (spiked) hurtPlayer(G, 1, DOOR_POS[opposite].x, DOOR_POS[opposite].y);
        return;
      }
    }
  }

  if (G.toast) { G.toast.t -= dt; if (G.toast.t <= 0) G.toast = null; }
  if (G.floorIntro) { G.floorIntro.t -= dt; if (G.floorIntro.t <= 0) G.floorIntro = null; }
  G.shake = Math.max(0, G.shake - dt * 40);
}

