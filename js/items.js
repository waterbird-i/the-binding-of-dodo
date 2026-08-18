'use strict';
// ============ item definitions ============
// 88 stackable items. Following the wiki taxonomy, each one either moves stats,
// changes what the tears do, or both — and most also change how dodo looks.
// Stats are clamped by clampPlayerStats() after every pickup, so stacking a
// dozen of these can't break the run.
// Items 56..88 plug into the deeper mechanics added later: onTearEnd
// explosions/splits, spectral tears, distance damage, tear auras, shields,
// damage reduction and self-harming blasts.
const ITEM_DEFS = [
  // --- 1..10 the classics ---
  { id: 'sad_onion', name: '伤心洋葱', desc: '泪速上升!', icon: 'onion',
    apply(p) { p.fireDelay *= 0.72; } },
  { id: 'hot_pepper', name: '魔鬼辣椒', desc: '攻击力上升!', icon: 'pepper',
    apply(p) { p.damage += 1.6; p.appearance.eyeColor = '#a32014'; } },
  { id: 'black_coffee', name: '黑咖啡', desc: '移速上升!', icon: 'coffee',
    apply(p) { p.moveSpeed += 42; } },
  { id: 'spy_lens', name: '侦察镜片', desc: '射程上升!', icon: 'lens',
    apply(p) { p.range += 110; p.shotSpeed += 60; } },
  { id: 'dodo_heart', name: 'dodo 之心', desc: '生命上限+1 并回满!', icon: 'heart',
    apply(p) { p.maxHp += 2; p.hp = p.maxHp + 2; } },
  { id: 'triple_feather', name: '三重羽毛', desc: '三发齐射!', icon: 'feather',
    apply(p) { p.multishot += 2; p.fireDelay *= 1.15; } },
  { id: 'magnet_tear', name: '磁力眼泪', desc: '眼泪追踪敌人!', icon: 'magnet',
    apply(p) { p.homing = true; p.appearance.tearColor = '#e8c8f0'; } },
  { id: 'bone_needle', name: '骨针', desc: '眼泪穿透敌人!', icon: 'needle',
    apply(p) { p.piercing = true; p.damage += 0.5; } },
  { id: 'big_tear', name: '巨泪', desc: '眼泪变大 攻击力上升!', icon: 'bigtear',
    apply(p) { p.tearSize += 3.5; p.damage += 1.2; p.appearance.big = true; } },
  { id: 'lost_crown', name: '失落王冠', desc: '全属性小幅上升!', icon: 'crown',
    apply(p) {
      p.damage += 0.8; p.moveSpeed += 20; p.range += 50;
      p.fireDelay *= 0.9; p.appearance.hat = 'crown';
    } },

  // --- 11..20 tear rewrites ---
  { id: 'dodo_halo', name: 'dodo 光环', desc: '生命上限+1 泪速上升!', icon: 'halo',
    apply(p) { p.maxHp += 2; p.hp += 2; p.fireDelay *= 0.85; p.appearance.hat = 'halo'; } },
  { id: 'brimstone', name: '硫火之息', desc: '长按蓄力发射血腥激光!', icon: 'brim',
    apply(p) {
      p.laser = true; p.damage += 2.2; p.range += 60;
      p.appearance.eyeColor = '#c9231a'; p.appearance.aura = 'rgba(160,20,14,0.35)';
    } },
  { id: 'boom_tear', name: '炸裂之泪', desc: '眼泪落点爆炸!', icon: 'bomb',
    apply(p) { p.explosive += 42; p.damage += 0.6; p.fireDelay *= 1.08; } },
  { id: 'rubber_ball', name: '橡胶弹球', desc: '眼泪弹墙两次!', icon: 'ball',
    apply(p) { p.bounce += 2; p.shotSpeed += 40; p.appearance.tearColor = '#8fd3c1'; } },
  { id: 'venom_flask', name: '毒液瓶', desc: '命中后持续中毒!', icon: 'flask', tint: '#7fbf4a',
    apply(p) { p.poison += 3.5; p.appearance.tearColor = '#a8d86a'; } },
  { id: 'frost_shard', name: '霜之碎片', desc: '命中减速敌人!', icon: 'ice',
    apply(p) { p.slowOnHit = 0.55; p.damage += 0.4; p.appearance.tearColor = '#bfe6ff'; } },
  { id: 'lucky_clover', name: '幸运四叶草', desc: '幸运上升 掉落更好!', icon: 'clover',
    apply(p) { p.luck += 3; } },
  { id: 'sharp_tooth', name: '锋利尖牙', desc: '25% 暴击!', icon: 'tooth',
    apply(p) { p.crit += 0.25; p.damage += 0.4; } },
  { id: 'orbit_tear', name: '环绕之泪', desc: '一颗眼泪绕着你转!', icon: 'orbit',
    apply(p) { p.orbitals += 1; } },
  { id: 'baby_friend', name: '小小伙伴', desc: '一个跟随物帮你射击!', icon: 'baby',
    apply(p) { p.familiars += 1; } },

  // --- 21..30 body & trade-offs ---
  { id: 'spike_shell', name: '尖刺外壳', desc: '接触会伤害敌人!', icon: 'spike',
    apply(p) { p.contactDamage += 2.2; p.invulnBonus += 0.15; } },
  { id: 'blood_bag', name: '血袋', desc: '生命上限+1 击杀回血!', icon: 'bloodbag',
    apply(p) { p.maxHp += 2; p.hp += 2; p.vampirism += 0.14; } },
  { id: 'life_mushroom', name: '一命菇', desc: '死亡时原地复活!', icon: 'mushroom',
    apply(p) { p.extraLives += 1; p.maxHp += 2; p.hp += 2; } },
  { id: 'star_magnet', name: '星辰吸引', desc: '自动吸取掉落物!', icon: 'star', tint: '#f4d03f',
    apply(p) { p.pickupMagnet += 130; p.luck += 1; } },
  { id: 'iron_bar', name: '铁块', desc: '生命上限+2 移速下降', icon: 'iron',
    apply(p) { p.maxHp += 4; p.hp += 4; p.moveSpeed -= 26; p.knockMul += 0.4; } },
  { id: 'speed_pill', name: '速效药丸', desc: '移速大幅上升 攻击略降', icon: 'pill', tint: '#7fa8e8',
    apply(p) { p.moveSpeed += 68; p.damage -= 0.5; } },
  { id: 'rage_pill', name: '暴怒药丸', desc: '攻击大幅上升 射速略降', icon: 'pill', tint: '#c9231a',
    apply(p) { p.damage += 3.2; p.fireDelay *= 1.16; p.appearance.headColor = '#f6d8cf'; } },
  { id: 'tiny_pupil', name: '微小瞳孔', desc: '射速上升 攻击下降', icon: 'eye', tint: '#8fb2d6',
    apply(p) { p.fireDelay *= 0.7; p.damage -= 0.7; p.tearSize -= 1; } },
  { id: 'wide_pupil', name: '巨大瞳孔', desc: '攻击上升 射速下降', icon: 'eye', tint: '#c9231a',
    apply(p) { p.damage += 2.4; p.fireDelay *= 1.2; p.tearSize += 1.6; } },
  { id: 'tech_wire', name: '电磁线圈', desc: '弹速与射程大幅上升!', icon: 'bolt',
    apply(p) { p.shotSpeed += 150; p.range += 90; p.appearance.tearColor = '#cfe8ff'; } },

  // --- 31..40 books, wings, horns ---
  { id: 'dark_book', name: '暗黑之书', desc: '攻击上升 眼泪变黑!', icon: 'book', tint: '#2b2430',
    apply(p) { p.damage += 1.8; p.appearance.tearColor = '#2e2a33'; p.appearance.aura = 'rgba(40,30,50,0.4)'; } },
  { id: 'holy_book', name: '圣典', desc: '生命上限+1 无敌时间延长!', icon: 'book', tint: '#efe6d2',
    apply(p) { p.maxHp += 2; p.hp += 2; p.invulnBonus += 0.5; p.appearance.hat = 'halo'; } },
  { id: 'devil_horn', name: '恶魔之角', desc: '攻击暴涨 但献出半颗心', icon: 'horn',
    apply(p) { p.damage += 4.2; p.maxHp -= 1; p.appearance.eyeColor = '#c9231a'; } },
  { id: 'angel_wing', name: '天使之翼', desc: '移速与射速上升!', icon: 'wing',
    apply(p) { p.moveSpeed += 34; p.fireDelay *= 0.88; } },
  { id: 'skull_mask', name: '骷髅面具', desc: '击退与攻击上升!', icon: 'skull',
    apply(p) { p.knockMul += 1.2; p.damage += 1.2; p.appearance.headColor = '#e8e2d0'; } },
  { id: 'candle_flame', name: '长明烛', desc: '环绕之泪 攻击上升!', icon: 'candle',
    apply(p) { p.orbitals += 1; p.damage += 0.9; } },
  { id: 'spider_egg', name: '蛛卵', desc: '跟随物 + 眼泪中毒!', icon: 'spider',
    apply(p) { p.familiars += 1; p.poison += 2; } },
  { id: 'rotten_meat', name: '腐肉', desc: '生命上限+1 攻击上升 移速下降', icon: 'meat',
    apply(p) { p.maxHp += 2; p.hp += 2; p.damage += 1.1; p.moveSpeed -= 14; } },
  { id: 'golden_key', name: '黄金钥匙', desc: '金币+5 幸运上升!', icon: 'key',
    apply(p) { p.coins += 5; p.luck += 2; } },
  { id: 'battery', name: '能量电池', desc: '射速与弹速上升!', icon: 'battery',
    apply(p) { p.fireDelay *= 0.82; p.shotSpeed += 70; } },

  // --- 41..55 the deep-floor loot ---
  { id: 'gear_wheel', name: '生锈齿轮', desc: '射速与移速上升 射程下降', icon: 'gear',
    apply(p) { p.fireDelay *= 0.8; p.moveSpeed += 22; p.range -= 60; } },
  { id: 'shadow_cloak', name: '暗影斗篷', desc: '无敌时间延长 移速上升!', icon: 'cloak',
    apply(p) { p.invulnBonus += 0.6; p.moveSpeed += 24; p.appearance.aura = 'rgba(20,18,26,0.45)'; } },
  { id: 'poop_charm', name: '便便护符', desc: '生命上限+1 幸运上升!', icon: 'poop',
    apply(p) { p.maxHp += 2; p.hp += 2; p.luck += 2; } },
  { id: 'dice_shard', name: '骰子碎片', desc: '随机三项属性上升!', icon: 'dice',
    apply(p) {
      const rolls = ['damage', 'fireDelay', 'moveSpeed', 'range', 'shotSpeed', 'tearSize'];
      for (let i = 0; i < 3; i++) {
        const k = pick(rolls);
        if (k === 'fireDelay') p.fireDelay *= 0.88;
        else if (k === 'damage') p.damage += 1.1;
        else if (k === 'moveSpeed') p.moveSpeed += 22;
        else if (k === 'range') p.range += 70;
        else if (k === 'shotSpeed') p.shotSpeed += 55;
        else p.tearSize += 1.2;
      }
      p.luck += 1;
    } },
  { id: 'moon_shard', name: '月之碎片', desc: '射程与弹速大幅上升!', icon: 'moon',
    apply(p) { p.range += 170; p.shotSpeed += 80; p.appearance.tearColor = '#dfe6ff'; } },
  { id: 'sun_shard', name: '日之碎片', desc: '攻击上升 眼泪镀金!', icon: 'sun',
    apply(p) { p.damage += 2.0; p.appearance.tearColor = '#ffdc7a'; p.appearance.aura = 'rgba(255,200,90,0.32)'; } },
  { id: 'cross_pendant', name: '十字吊坠', desc: '生命上限+2 并回满!', icon: 'cross',
    apply(p) { p.maxHp += 4; p.hp = p.maxHp + 4; } },
  { id: 'bandage', name: '绷带', desc: '生命上限+1 移速上升!', icon: 'bandage',
    apply(p) { p.maxHp += 2; p.hp += 2; p.moveSpeed += 18; } },
  { id: 'quad_feather', name: '四重羽毛', desc: '再加两发 射速略降!', icon: 'feather', tint: '#cfe0ef',
    apply(p) { p.multishot += 2; p.fireDelay *= 1.12; } },
  { id: 'blood_tear', name: '血泪', desc: '穿透 + 攻击上升!', icon: 'blooddrop',
    apply(p) { p.piercing = true; p.damage += 1.6; p.appearance.tearColor = '#c3241a'; } },
  { id: 'mega_lens', name: '巨型镜片', desc: '射程与弹速暴涨!', icon: 'lens', tint: '#c9a437',
    apply(p) { p.range += 220; p.shotSpeed += 130; } },
  { id: 'twin_orbit', name: '双子环绕', desc: '两颗环绕之泪!', icon: 'orbit', tint: '#e8c8f0',
    apply(p) { p.orbitals += 2; } },
  { id: 'sharp_bone', name: '骨刺', desc: '穿透 + 暴击!', icon: 'bone',
    apply(p) { p.piercing = true; p.crit += 0.18; p.damage += 0.8; } },
  { id: 'gold_ring', name: '黄金戒指', desc: '全属性上升 吸取掉落物!', icon: 'ring',
    apply(p) {
      p.damage += 1.0; p.moveSpeed += 18; p.range += 60;
      p.fireDelay *= 0.92; p.pickupMagnet += 90; p.luck += 1;
    } },
  { id: 'kings_mark', name: '王者印记', desc: '攻击 射速 移速 全面强化!', icon: 'crown', tint: '#e8452f',
    apply(p) {
      p.damage += 2.6; p.fireDelay *= 0.84; p.moveSpeed += 30;
      p.tearSize += 1.2; p.appearance.hat = 'crown';
      p.appearance.aura = 'rgba(232,69,47,0.3)';
    } },

  // --- 56..88 mechanics items: each one rides a dedicated engine hook ---
  { id: 'ipecac', name: '吐根糖浆', desc: '巨型毒爆弹 会炸到自己!', icon: 'flask', tint: '#5f8a2e',
    apply(p) {
      p.explosive += 64; p.ipecac = true; p.damage += 3.2;
      p.fireDelay *= 1.4; p.appearance.tearColor = '#86a83c';
    } },
  { id: 'rubber_cement', name: '橡胶胶水', desc: '眼泪弹墙不停!', icon: 'ball', tint: '#e8e2d0',
    apply(p) { p.bounce += 2; p.appearance.tearColor = '#dcdcd2'; } },
  { id: 'common_cold', name: '重感冒', desc: '鼻涕眼泪 命中中毒!', icon: 'flask', tint: '#9fae4a',
    apply(p) { p.poison += 2.5; p.appearance.tearColor = '#b9c96a'; } },
  { id: 'moms_contact', name: '妈妈的隐形眼镜', desc: '命中石化减速!', icon: 'eye', tint: '#efe6d2',
    apply(p) { p.slowOnHit = 0.55; p.fireDelay *= 0.95; } },
  { id: 'ouija_board', name: '通灵板', desc: '幽灵眼泪 穿过石头!', icon: 'book', tint: '#8a8296',
    apply(p) { p.spectral = true; p.appearance.tearColor = 'rgba(220,230,245,0.75)'; } },
  { id: 'lump_of_coal', name: '一块煤炭', desc: '飞得越远 伤害越高!', icon: 'iron', tint: '#2b2724',
    apply(p) { p.distGrow += 0.9; p.appearance.tearColor = '#3a3632'; } },
  { id: 'proptosis', name: '突眼症', desc: '近身伤害暴涨 远处衰减!', icon: 'bigtear', tint: '#e88fa0',
    apply(p) { p.distShrink += 1; p.damage += 1.4; p.tearSize += 1.5; } },
  { id: 'tough_love', name: '严厉之爱', desc: '牙齿眼泪 高额暴击!', icon: 'tooth', tint: '#f4d03f',
    apply(p) { p.crit += 0.22; p.critMul += 0.5; p.appearance.tearColor = '#f2eddc'; } },
  { id: 'parasite', name: '寄生虫', desc: '眼泪落地分裂两瓣!', icon: 'spider', tint: '#c98f5f',
    apply(p) { p.split = Math.max(p.split, 1); p.appearance.tearColor = '#d8b98a'; } },
  { id: 'godhead', name: '神之首', desc: '追踪圣泪 带伤害光环!', icon: 'halo', tint: '#9fc6e8',
    apply(p) {
      p.homing = true; p.tearAura += 1.6; p.damage += 1;
      p.appearance.tearColor = '#cfe0ff'; p.appearance.aura = 'rgba(140,180,255,0.3)';
    } },
  { id: 'brother_bobby', name: '鲍比兄弟', desc: '一个跟班帮你开火!', icon: 'baby', tint: '#8fb2d6',
    apply(p) { p.familiars += 1; } },
  { id: 'sister_maggy', name: '玛姬姐妹', desc: '跟班 + 生命上限+1!', icon: 'baby', tint: '#e8a8b8',
    apply(p) { p.familiars += 1; p.maxHp += 2; p.hp += 2; } },
  { id: 'holy_mantle', name: '神圣披风', desc: '每房间免疫一次伤害!', icon: 'cloak', tint: '#efe6d2',
    apply(p) { p.shieldMax = 1; p.shieldUp = true; p.appearance.aura = 'rgba(190,220,255,0.3)'; } },
  { id: 'one_up', name: '1UP!', desc: '额外一条命!', icon: 'mushroom', tint: '#6fae4a',
    apply(p) { p.extraLives += 1; } },
  { id: 'dead_cat', name: '死猫', desc: '复活+2 但上限-1', icon: 'skull', tint: '#3a342c',
    apply(p) { p.extraLives += 2; p.maxHp -= 2; p.appearance.eyeColor = '#3a5a3c'; } },
  { id: 'the_wafer', name: '圣饼', desc: '受到的伤害-1(至少半心)!', icon: 'bandage', tint: '#e8d8a8',
    apply(p) { p.dmgReduce = 1; } },
  { id: 'magneto', name: '磁力', desc: '大范围吸取掉落物!', icon: 'magnet', tint: '#8fd3c1',
    apply(p) { p.pickupMagnet += 170; } },
  { id: 'toxic_shock', name: '毒素冲击', desc: '中毒 + 减速 双重打击!', icon: 'flask', tint: '#4a7a68',
    apply(p) { p.poison += 2; p.slowOnHit = Math.max(p.slowOnHit, 0.45); p.appearance.tearColor = '#7aa890'; } },
  { id: 'glass_cannon', name: '玻璃大炮', desc: '攻击暴涨 上限-1', icon: 'lens', tint: '#e85f5f',
    apply(p) { p.damage += 4.5; p.maxHp -= 2; } },
  { id: 'night_spirit', name: '夜之灵', desc: '幽灵弹 + 泪速上升!', icon: 'book', tint: '#4a4458',
    apply(p) { p.spectral = true; p.fireDelay *= 0.85; p.appearance.aura = 'rgba(60,50,90,0.35)'; } },
  { id: 'coal_dust', name: '煤尘', desc: '远程增伤 + 弹速上升!', icon: 'iron', tint: '#514c44',
    apply(p) { p.distGrow += 0.5; p.shotSpeed += 80; } },
  { id: 'twin_feather', name: '双子羽毛', desc: '多一发眼泪!', icon: 'feather', tint: '#8fd3c1',
    apply(p) { p.multishot += 1; p.fireDelay *= 1.06; } },
  { id: 'fang_charm', name: '獠牙护符', desc: '暴击率大幅上升!', icon: 'tooth', tint: '#c9231a',
    apply(p) { p.crit += 0.3; } },
  { id: 'mini_mush', name: '迷你蘑菇', desc: '移速射程上升 眼泪变小!', icon: 'mushroom', tint: '#b8865f',
    apply(p) { p.moveSpeed += 34; p.range += 80; p.tearSize -= 1.2; p.damage += 0.5; } },
  { id: 'blood_clot', name: '血凝块', desc: '攻击与射程上升!', icon: 'blooddrop', tint: '#6d150f',
    apply(p) { p.damage += 1.3; p.range += 90; } },
  { id: 'guardian_orbit', name: '守护环', desc: '环绕之泪 + 护盾!', icon: 'orbit', tint: '#f4d03f',
    apply(p) { p.orbitals += 1; p.shieldMax = 1; p.shieldUp = true; } },
  { id: 'thorn_crown', name: '荆棘王冠', desc: '接触反伤大幅上升!', icon: 'crown', tint: '#5f6b3c',
    apply(p) { p.contactDamage += 3; p.appearance.hat = 'crown'; } },
  { id: 'leech_egg', name: '蚂蟥卵', desc: '跟班 + 击杀回血!', icon: 'spider', tint: '#8e1b12',
    apply(p) { p.familiars += 1; p.vampirism += 0.1; } },
  { id: 'angel_plume', name: '天使羽饰', desc: '无敌延长 + 移速上升!', icon: 'wing', tint: '#f4d03f',
    apply(p) { p.invulnBonus += 0.4; p.moveSpeed += 26; } },
  { id: 'demon_pact', name: '恶魔契约', desc: '攻击暴涨 献出半颗心', icon: 'horn', tint: '#4a1109',
    apply(p) { p.damage += 3.6; p.maxHp -= 1; p.appearance.aura = 'rgba(120,20,20,0.35)'; } },
  { id: 'lucky_penny', name: '幸运便士', desc: '金币+8 幸运上升!', icon: 'key', tint: '#c87f33',
    apply(p) { p.coins += 8; p.luck += 2; } },
  { id: 'splinter_shot', name: '碎裂弹头', desc: '落地分裂 + 多一发!', icon: 'feather', tint: '#a8d86a',
    apply(p) { p.split = Math.max(p.split, 1); p.multishot += 1; p.fireDelay *= 1.1; } },
  { id: 'aura_candle', name: '光环烛火', desc: '眼泪携带灼烧光环!', icon: 'candle', tint: '#9fc6e8',
    apply(p) { p.tearAura += 2.2; p.appearance.tearColor = '#ffe9b8'; } },
  { id: 'dodo_wings', name: 'dodo 之翼', desc: '长出翅膀 飞越障碍!', icon: 'wing', tint: '#ffffff',
    apply(p) {
      if (!p.flight) p.wingGrow = 1;   // sprout animation only on first pair
      p.flight = true; p.moveSpeed += 24;
    } },

  // --- 89..91 mapping items, straight out of Isaac ---
  { id: 'the_compass', name: '指南针', desc: '显示所有特殊房间的位置!', icon: 'compass',
    apply(p) { p.compass = true; revealFloorMap(); } },
  { id: 'treasure_map', name: '藏宝图', desc: '显示本层的完整布局!', icon: 'map',
    apply(p) { p.treasureMap = true; revealFloorMap(); } },
  { id: 'blue_map', name: '蓝图', desc: '显示秘密房间的位置!', icon: 'map', tint: '#7fa8e8',
    apply(p) { p.blueMap = true; revealFloorMap(); } },
];

// ============ active items ============
// Spacebar items. Each carries its own charge cost (in bars); charge comes
// from clearing rooms (+1) or picking up batteries (+1). Picked up fully
// charged, Isaac style. `use` runs against the live game state.
// ============ item pools ============
// Isaac-style split pools: treasure rooms roll the default pool, shops roll
// utility, devil deals roll the trade-off/evil items. Anything untagged
// belongs to the treasure pool. Tagging happens here (not inline on 90 defs)
// so a def's pool is easy to audit at a glance.
const ITEM_POOL_TAGS = {
  devil: ['devil_horn', 'demon_pact', 'dark_book', 'glass_cannon', 'ipecac',
    'dead_cat', 'brimstone', 'thorn_crown', 'blood_tear', 'skull_mask',
    'night_spirit', 'shadow_cloak'],
  shop: ['golden_key', 'lucky_penny', 'lucky_clover', 'star_magnet', 'magneto',
    'bandage', 'poop_charm', 'holy_book', 'the_compass', 'treasure_map',
    'blue_map', 'battery'],
};
// ============ transformation sets ============
// Collect 3 items of one set and dodo mutates: looks change, stats jump.
const ITEM_SET_TAGS = {
  feather: ['triple_feather', 'quad_feather', 'twin_feather', 'splinter_shot',
    'angel_wing', 'angel_plume', 'dodo_wings'],
  devil: ['devil_horn', 'demon_pact', 'dark_book', 'glass_cannon', 'ipecac',
    'dead_cat', 'brimstone', 'thorn_crown', 'blood_tear', 'night_spirit'],
  mushroom: ['life_mushroom', 'mini_mush', 'one_up', 'poop_charm', 'rotten_meat'],
};
for (const [pool, ids] of Object.entries(ITEM_POOL_TAGS)) {
  for (const id of ids) { const d = ITEM_DEFS.find(x => x.id === id); if (d) d.pool = pool; }
}
for (const [set, ids] of Object.entries(ITEM_SET_TAGS)) {
  for (const id of ids) { const d = ITEM_DEFS.find(x => x.id === id); if (d) d.set = set; }
}

const TRANSFORM_DEFS = [
  { id: 'tf_angel', set: 'feather', name: '羽翼圣者', desc: '集齐 3 件羽毛系 — 长出圣翼 头顶光环!',
    apply(p) {
      if (!p.flight) p.wingGrow = 1;
      p.flight = true;
      p.fireDelay *= 0.88;
      p.appearance.hat = 'halo';
      p.appearance.aura = 'rgba(244,224,140,0.3)';
    } },
  { id: 'tf_devil', set: 'devil', name: '恶魔化身', desc: '集齐 3 件恶魔系 — 头生尖角 攻击暴涨!',
    apply(p) {
      p.damage += 2.2;
      p.appearance.hat = 'horns';
      p.appearance.eyeColor = '#c9231a';
      p.appearance.aura = 'rgba(140,20,16,0.4)';
    } },
  { id: 'tf_mushroom', set: 'mushroom', name: '蘑菇之王', desc: '集齐 3 件菌菇系 — 戴上菌盖 生命大涨!',
    apply(p) {
      p.maxHp += 4; p.hp = Math.min(p.maxHp, p.hp + 4);
      p.tearSize += 1.5;
      p.appearance.hat = 'mushcap';
    } },
];

// called after every itemsTaken.push — fires each transformation once
function checkTransformations(G, p) {
  if (!p.transforms) p.transforms = {};
  for (const tf of TRANSFORM_DEFS) {
    if (p.transforms[tf.id]) continue;
    const n = p.itemsTaken.filter(id => (ITEM_BY_ID[id] || {}).set === tf.set).length;
    if (n < 3) continue;
    p.transforms[tf.id] = true;
    const hadFlight = p.flight;
    tf.apply(p);
    clampPlayerStats(p);
    G.toast = { title: '转变 · ' + tf.name, desc: tf.desc, t: 3.4 };
    if (!hadFlight && p.flight) spawnFeathers(G, p.x, p.y);
    spawnSplash(G, p.x, p.y - 20, '#f4d03f');
    G.shake = Math.max(G.shake, 6);
    SFX.chest();
  }
}

const ACTIVE_DEFS = [
  { id: 'act_tear_burst', name: '泪雨风暴', desc: '重创房间里的所有敌人!', icon: 'bigtear', tint: '#9fc6e8',
    active: true, cost: 2,
    use(G) {
      const p = G.player;
      for (const e of G.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        damageEnemy(G, e, p.damage * 3 + 8, e.x - p.x, e.y - p.y);
        spawnSplash(G, e.x, e.y, '#9fc6e8');
      }
      G.shake = Math.max(G.shake, 8);
      SFX.laser();
    } },
  { id: 'act_heal', name: '妈妈的拥抱', desc: '回复两颗心!', icon: 'heart', tint: '#f2a8b8',
    active: true, cost: 3,
    use(G) {
      const p = G.player;
      p.hp = Math.min(p.maxHp, p.hp + 4);
      spawnSplash(G, p.x, p.y - 10, '#e86a7a');
      SFX.heart();
    } },
  { id: 'act_teleport', name: '回家的路', desc: '传送回起始房间!', icon: 'moon', tint: '#cfd8ff',
    active: true, cost: 1,
    use(G) {
      // leaving mid-fight resets the room so it can't be cheesed into a clear
      if (!G.room.cleared) G.room.enemiesSpawned = false;
      spawnFeathers(G, G.player.x, G.player.y);
      enterRoom(G.floor.start, null);
      SFX.stairs();
    } },
  { id: 'act_bomb_bag', name: '炸弹锦囊', desc: '立刻获得两颗炸弹!', icon: 'bomb', tint: '#8a9451',
    active: true, cost: 2,
    use(G) { G.player.bombs += 2; SFX.chest(); } },
  { id: 'act_freeze', name: '寒冬之息', desc: '冻结所有敌人 5 秒!', icon: 'ice',
    active: true, cost: 4,
    use(G) {
      for (const e of G.enemies) {
        if (e.dead) continue;
        e.slowT = Math.max(e.slowT, 5);
        spawnSplash(G, e.x, e.y, '#bfe6ff');
      }
      SFX.pause(true);
    } },
  // The D6: rerolls every untaken pedestal in the room within its own pool,
  // so a devil deal rerolls into another devil deal (price kept), a treasure
  // rerolls into another treasure. Shop wares stay put, Isaac-classic.
  { id: 'act_d6', name: '六面骰', desc: '重摇本房间的道具!', icon: 'dice', tint: '#9fc6e8',
    active: true, cost: 2,
    use(G) {
      const p = G.player;
      const exclude = p.itemsTaken.slice();
      let n = 0;
      for (const ped of G.room.pedestals) {
        if (ped.taken || !ped.def) continue;
        if (ped.def.active) {
          const others = ACTIVE_DEFS.filter(d => d.id !== ped.def.id && d.id !== 'act_d6');
          ped.def = pick(others);
        } else {
          exclude.push(ped.def.id);
          ped.def = randomItemDef(exclude, ped.pool);
          exclude.push(ped.def.id);
        }
        ped.anim = rand(10);
        spawnSplash(G, ped.x, ped.y - 22, '#9fc6e8');
        n++;
      }
      if (n) {
        G.toast = { title: '六面骰', desc: '命运重掷了 ' + n + ' 件道具!', t: 1.8 };
        G.shake = Math.max(G.shake, 4);
      } else {
        G.toast = { title: '六面骰', desc: '这个房间没有可以重摇的道具…', t: 1.6 };
      }
      SFX.item();
    } },
];
const ACTIVE_BY_ID = {};
for (const d of ACTIVE_DEFS) ACTIVE_BY_ID[d.id] = d;

// equip an active item; returns the one that was held before (or null)
function equipActive(p, def) {
  const old = p.active ? p.active.def : null;
  p.active = { def, charge: def.cost };   // spawns fully charged
  return old;
}

// +n charge bars, capped at the item's own cost
function addActiveCharge(p, n) {
  if (!p.active) return;
  p.active.charge = Math.min(p.active.def.cost, p.active.charge + n);
}

const ITEM_BY_ID = {};
for (const d of ITEM_DEFS) ITEM_BY_ID[d.id] = d;

// defs belonging to a named pool ('treasure' is the untagged default)
function poolDefs(pool) {
  if (!pool || pool === 'any') return ITEM_DEFS;
  return ITEM_DEFS.filter(d => (d.pool || 'treasure') === pool);
}

// prefer items the player hasn't collected yet, so a run keeps surprising;
// pool narrows the roll to one pool, falling back to everything if drained
function randomItemDef(exclude, pool) {
  // meta-locked items (see js/meta.js) never enter a random pool until earned
  const fresh = d => !exclude.includes(d.id) && !metaItemLocked(d.id);
  let cand = poolDefs(pool).filter(fresh);
  if (!cand.length) cand = ITEM_DEFS.filter(fresh);
  return cand.length ? pick(cand) : pick(ITEM_DEFS);
}

function spawnItemPedestal(room, x, y, pool) {
  // clamp into floor area
  x = clamp(x, FLOOR_X + 40, FLOOR_X + FLOOR_W - 40);
  y = clamp(y, FLOOR_Y + 40, FLOOR_Y + FLOOR_H - 40);
  const exclude = (typeof G !== 'undefined' && G.player) ? G.player.itemsTaken : [];
  const spot = findFreeSpot(room, x, y);
  room.pedestals.push({ x: spot.x, y: spot.y, def: randomItemDef(exclude, pool),
    pool: pool || null, anim: rand(10), taken: false });
}

// ============ shop ============
// Wares are stocked once, on the first visit: a heart plus two random items
// the player doesn't own yet. Prices scale with depth like Isaac's shops.
function itemShopPrice(depth) {
  return 15 + (depth >= 5 ? 5 : 0) + (depth >= 9 ? 5 : 0);
}

function stockShop(room, depth) {
  room.shopStocked = true;
  const base = itemShopPrice(depth);
  const wy = FLOOR_Y + FLOOR_H * 0.32;
  const exclude = (typeof G !== 'undefined' && G.player) ? G.player.itemsTaken.slice() : [];
  const defs = [];
  // first slot rolls the shop's own utility pool, second stays general
  for (const pool of ['shop', 'treasure']) {
    const d = randomItemDef(exclude, pool);
    exclude.push(d.id);
    defs.push(d);
  }
  const ware = (w, i) => Object.assign(w, {
    x: W / 2 + [-225, -75, 75, 225][i], y: wy,
    anim: rand(10), taken: false, near: false, denyT: 0,
  });
  // consumable slot alternates between bombs and a heart; the battery took
  // over the fixed leftmost slot from the heart
  const consumable = chance(0.5)
    ? { kind: 'bomb', name: '两颗炸弹', desc: '炸开石头和裂缝的墙!', price: 5 }
    : { kind: 'heart', name: '红心', desc: '回复一颗心!', price: 5 };
  // second item slot sometimes stocks an active item instead
  const slot2 = chance(0.35)
    ? { kind: 'active', def: pick(ACTIVE_DEFS), price: base + 5 }
    : { kind: 'item', def: defs[1], price: base + 5 };
  room.shopItems = [
    ware({ kind: 'battery', name: '电池', desc: '为主动道具充能一层!', price: 2 }, 0),
    ware(consumable, 1),
    ware({ kind: 'item', def: defs[0], price: base }, 2),
    ware(slot2, 3),
  ];
}

// resolve deferred pedestal contents (random passive / random active) the
// moment the player could actually see them
function resolvePedestals(room, p) {
  for (const ped of room.pedestals) {
    if (ped.def) { ped.pendingRandom = ped.pendingActive = false; continue; }
    if (ped.pendingActive) {
      ped.def = pick(ACTIVE_DEFS);
      ped.pendingActive = false;
    } else if (ped.pendingRandom) {
      ped.def = randomItemDef(p ? p.itemsTaken : [], ped.pool);
      ped.pendingRandom = false;
    }
  }
}

// ============ devil deals ============
// Devil pedestals are paid in hearts, not coins. Red heart containers go
// first; a dodo too poor in containers can pay 3 soul hearts instead.
function devilDealAfford(p, price) {
  return p.maxHp - price * 2 >= 2 || p.soulHp >= 6;
}
function devilDealPay(p, price) {
  if (p.maxHp - price * 2 >= 2) {
    p.maxHp -= price * 2;
    p.hp = Math.min(p.hp, p.maxHp);
  } else {
    p.soulHp -= 6;
  }
}
function devilDealLabel(p, price) {
  return p.maxHp - price * 2 >= 2 ? price + ' 颗红心上限' : '3 颗魂心';
}
