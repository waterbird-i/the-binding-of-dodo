'use strict';
// ============================================================================
// 11-ui-polish — 界面与反馈打磨的回归断言
//
// 这一章守的是「呈现层」的行为：排版缩放、指针悬停、后期特效的绘制顺序、
// 屏幕级受击提示、世界定格、toast 淡入、暂停面板的属性条与道具悬停。
// 这些改动大多不改数值、只改观感，正好是纯逻辑断言抓不到的那一类，
// 所以每条都尽量断言一个可观测的量（ctx.font / G.hover / G.freeze / 粒子数）。
// ============================================================================
const fs = require('fs');
const path = require('path');
const { section, ok, eq, near, frames, ROOT } = require('../helpers.cjs');

module.exports = async ({ page }) => {
  // ------------------------------------------------------------ typography
  section('排版（字号缩放 + 中文回退）');
  const deskFont = await page.evaluate(() => {
    ctx.font = 'bold 16px X';           // 不回读再赋值：UIK > 1 时回读会二次放大
    const f = ctx.font;
    return { k: UIK, f, cssW: canvas.getBoundingClientRect().width };
  });
  // 断的是不变量（UIK 与画布实际缩放一致），而不是「视口够大时 UIK 恰好是 1」——
  // 后者会在 harness 改视口时误报
  near('UIK = clamp(960 / 画布宽, 1, 1.3)，与画布实际缩放一致',
    deskFont.k, Math.min(1.3, Math.max(1, 960 / deskFont.cssW)), 0.01);
  ok('画布不小于 960 时不放大字号', deskFont.k === 1 && /16px/.test(deskFont.f),
    'UIK=' + deskFont.k + ' font=' + deskFont.f);

  const scaled = await page.evaluate(() => {
    const keepK = UIK;
    UIK = 1.3;
    ctx.font = 'bold 16px X';
    const f = ctx.font;
    UIK = keepK;
    return f;
  });
  ok('UIK > 1 时字号按比例放大（16 → 20.8）', /20\.8px/.test(scaled), scaled);

  const stacks = await page.evaluate(() => ({ serif: UI_SERIF, sans: UI_SANS }));
  ok('衬线栈带中文回退（Songti / Noto Serif）',
    /Songti SC/.test(stacks.serif) && /Noto Serif/.test(stacks.serif), stacks.serif);
  ok('无衬线栈带中文回退（PingFang / YaHei / Noto Sans）',
    /PingFang SC/.test(stacks.sans) && /Microsoft YaHei/.test(stacks.sans), stacks.sans);

  // ------------------------------------------------------------------ hover
  section('指针悬停与光标');
  ok('canvas 上有 pointermove 监听（不是只能点）',
    await page.evaluate(() => typeof hoverRegion === 'function' && typeof refreshHover === 'function'));
  // 前面的章节已经把局面推到 play 了，这一节要测的是标题界面的命中区，
  // 所以先显式回到 menu 并清掉上一次的悬停结果（各章节共用同一个页面实例）
  await page.evaluate(() => {
    G.state = 'menu';
    G.paused = false;
    G.unlockPanel = false;
    G.mapOverlay = false;
    G.hover = { kind: null, idx: -1 };
    G.hoverPos = null;
  });
  const hoverDiff = await page.evaluate(() => {
    G.hoverPos = { x: MENU_DIFF_RECT.x + 8, y: MENU_DIFF_RECT.y + 8 };
    refreshHover();
    return { kind: G.hover.kind, cursor: canvas.style.cursor };
  });
  ok('标题界面：难度胶囊可悬停', hoverDiff.kind === 'diff', hoverDiff.kind);
  eq('悬停时把光标切成手型', hoverDiff.cursor, 'pointer');

  const hoverOff = await page.evaluate(() => {
    G.hoverPos = { x: 5, y: 400 };
    refreshHover();
    return { kind: G.hover.kind, cursor: canvas.style.cursor };
  });
  ok('移开空白处：悬停态清空、光标复原',
    hoverOff.kind === null && hoverOff.cursor === '', JSON.stringify(hoverOff));

  const hoverChar = await page.evaluate(() => {
    const p = menuCharPos((G.charIdx + 1) % CHAR_DEFS.length);
    G.hoverPos = { x: p.x, y: p.y - 30 };
    refreshHover();
    return G.hover.kind;
  });
  eq('标题界面：角色环可悬停', hoverChar, 'char');

  const hoverCodex = await page.evaluate(() => {
    G.hoverPos = { x: W / 2, y: 538 };
    refreshHover();
    return G.hover.kind;
  });
  eq('标题界面：图鉴提示行可悬停', hoverCodex, 'codex');

  // ------------------------------------------------------------- post FX
  section('后期特效的绘制顺序');
  const order = await page.evaluate(() => {
    const src = render.toString();
    return {
      postfxIdx: src.indexOf('applyPostFX(ctx)'),
      hudIdx: src.indexOf('renderHUD()'),
      codexIdx: src.lastIndexOf('renderUnlockPanel()'),   // 暂停分支那一处，不是菜单分支
    };
  });
  ok('暗角与颗粒先画、HUD 后画（HUD 不再被压暗、不被颗粒糊住）',
    order.postfxIdx > 0 && order.hudIdx > order.postfxIdx,
    'postfx@' + order.postfxIdx + ' hud@' + order.hudIdx);
  ok('图鉴面板画在颗粒之上', order.codexIdx > order.postfxIdx);

  // ------------------------------------------------------- screen feedback
  section('屏幕级反馈（受击红闪 / 低血量脉动 / 世界定格）');
  await page.evaluate(() => { if (G.state === 'menu') startRun(); });
  await frames(page, 3);
  const hurt = await page.evaluate(async () => {
    G.player.invuln = 0;
    G.hurtT = 0;
    hurtPlayer(G, 1, G.player.x + 40, G.player.y);
    const t = G.hurtT;
    G.hurtT = 0;
    return t;
  });
  ok('受伤点亮屏幕红闪计时', hurt > 0, 'hurtT=' + hurt);

  // 低血量脉动：断「画面边缘的像素真的变红了」，而不是把 drawScreenDamage 的
  // 公式在测试里重抄一遍（那样删掉整个函数这条断言照样过）
  const lowHp = await page.evaluate(() => {
    const corner = () => {
      const d = ctx.getImageData(3, 3, 10, 10).data;
      let r = 0;
      for (let i = 0; i < d.length; i += 4) r += d[i];
      return r / (d.length / 4);
    };
    const p = G.player;
    const keep = { hp: p.hp, state: G.state, hurtT: G.hurtT, paused: G.paused };
    G.state = 'play'; G.paused = false; G.hurtT = 0;
    p.hp = p.maxHp; render();
    const healthy = corner();
    p.hp = 2; render();
    const lastHeart = corner();
    // 脉动是时间的正弦：隔一段时间多采几帧，红度应该有高有低
    const samples = [];
    for (let i = 0; i < 6; i++) {
      render();
      samples.push(corner());
      const t0 = performance.now();
      while (performance.now() - t0 < 55) { /* 走一段相位 */ }
    }
    p.hp = keep.hp; G.state = keep.state; G.hurtT = keep.hurtT; G.paused = keep.paused;
    return { healthy, lastHeart, spread: Math.max(...samples) - Math.min(...samples) };
  });
  ok('只剩一颗心时画面边缘变红（真的画上去了）',
    lowHp.lastHeart > lowHp.healthy + 1.5,
    'healthy=' + lowHp.healthy.toFixed(1) + ' lastHeart=' + lowHp.lastHeart.toFixed(1));
  ok('低血量提示是脉动的（多帧之间红度有变化）', lowHp.spread > 0.3, 'spread=' + lowHp.spread.toFixed(2));

  // 受击红闪同样按像素断
  const bloom = await page.evaluate(() => {
    const corner = () => {
      const d = ctx.getImageData(3, 3, 10, 10).data;
      let r = 0;
      for (let i = 0; i < d.length; i += 4) r += d[i];
      return r / (d.length / 4);
    };
    const p = G.player;
    const keep = p.hp;
    p.hp = p.maxHp;
    G.hurtT = 0; render();
    const cold = corner();
    G.hurtT = 0.45; render();
    const hot = corner();
    G.hurtT = 0;
    p.hp = keep;
    return { cold, hot };
  });
  ok('受伤红闪真的压到画面边缘（红通道上升）', bloom.hot > bloom.cold + 1.5,
    'cold=' + bloom.cold.toFixed(1) + ' hot=' + bloom.hot.toFixed(1));

  const freeze = await page.evaluate(() => {
    for (const e of G.enemies) e.spawnT = 0;
    G.enemies.push(makeEnemy('gaper', G.player.x + 80, G.player.y, 1));
    killEnemy(G, G.enemies[G.enemies.length - 1]);
    const k = G.freeze;
    G.freeze = 0;
    return k;
  });
  ok('击杀触发世界定格', freeze > 0, 'freeze=' + freeze);

  const bossFreeze = await page.evaluate(() => {
    const b = makeBoss(bossDefForFloor(1), W / 2, H / 2 - 40);
    b.spawnT = 0;
    G.enemies.push(b);
    killEnemy(G, b);
    const k = G.freeze;
    G.freeze = 0;
    G.enemies = G.enemies.filter(e => !e.dead);
    return { k, kill: FREEZE_KILL, boss: FREEZE_BOSS };
  });
  ok('Boss 死亡的定格明显长于杂兵', bossFreeze.k > bossFreeze.kill, JSON.stringify(bossFreeze));

  // 定格的语义：世界不动、玩家照动。断这两个可观测结果，而不是断某个计时字段
  // （G.hurtT 是在 loop() 里衰减的，跟 wdt 无关，用它断等于恒真）
  const freezeSteps = await page.evaluate(() => {
    const p = G.player;
    G.freeze = 0.2;
    // 玩家：按住 D 单帧 updatePlay 应该推进玩家侧逻辑
    p.vx = 0; p.vy = 0;
    const px0 = p.x;
    p.fireCd = 1;                 // 与碰撞无关的玩家侧计时，用来证明玩家逻辑没被跳过
    keys.KeyD = true;
    updatePlay(1 / 60);
    keys.KeyD = false;
    const cdDropped = 1 - p.fireCd;
    const playerMoved = p.x - px0;
    // 世界：同一帧里敌人不该动
    const e = makeEnemy('gaper', p.x + 200, p.y, 1);
    e.spawnT = 0;
    G.enemies.push(e);
    const ex0 = e.x;
    updatePlay(1 / 60);
    const enemyMoved = e.x - ex0;
    e.dead = true;
    G.enemies = G.enemies.filter(x => !x.dead);
    p.vx = 0; p.vy = 0;
    G.freeze = 0;
    return { playerMoved, cdDropped, enemyMoved, remaining: G.freeze };
  });
  ok('定格期间玩家侧逻辑照常推进（不是整个 update 空转）', freezeSteps.cdDropped > 0,
    'fireCd 掉了 ' + freezeSteps.cdDropped.toFixed(4));
  ok('定格期间玩家仍然能动', freezeSteps.playerMoved > 0,
    'dx=' + freezeSteps.playerMoved.toFixed(2));
  ok('定格期间敌人不动（世界真的停了）', freezeSteps.enemyMoved === 0,
    'dx=' + freezeSteps.enemyMoved);
  ok('定格计时会自己走完（不会卡死）', freezeSteps.remaining === 0);

  // ------------------------------------------------------------ hit confirm
  section('命中确认（四种眼泪结局可区分）');
  const splash = await page.evaluate(() => {
    const count = scale => {
      G.particles = [];
      spawnSplash(G, 100, 100, '#fff', scale, true);
      return G.particles.length;
    };
    G.particles = [];
    onTearEnd(G, { x: 100, y: 100, color: '#fff', vx: 0, vy: 0, explosive: 0, split: 0 }, 'enemy');
    const hit = G.particles.length;
    G.particles = [];
    onTearEnd(G, { x: 100, y: 100, color: '#fff', vx: 0, vy: 0, explosive: 0, split: 0 }, 'range');
    const range = G.particles.length;
    G.particles = [];
    const big = count(1.5), small = count(0.6);
    G.particles = [];
    return { hit, range, big, small };
  });
  ok('命中敌人比打空多出粒子（有打击确认）', splash.hit > splash.range,
    'enemy=' + splash.hit + ' range=' + splash.range);
  ok('splash 支持按比例放大', splash.big > splash.small, JSON.stringify(splash));

  const pop = await page.evaluate(() => {
    const e = makeEnemy('gaper', 200, 200, 1);
    e.spawnT = 0;
    G.enemies.push(e);
    damageEnemy(G, e, 1, 10, 0);
    const p = e.hitPop;
    e.dead = true;
    G.enemies = G.enemies.filter(x => !x.dead);
    return p;
  });
  ok('被打中的敌人有一瞬间的膨胀（hitPop）', pop > 0, 'hitPop=' + pop);

  const hpLag = await page.evaluate(() => {
    const b = makeBoss(bossDefForFloor(3), W / 2, H / 2);
    b.spawnT = 0;
    G.enemies.push(b);
    updateEnemies(G, 1 / 60);
    b.hp *= 0.5;
    updateEnemies(G, 1 / 60);
    const lag = b.hpLag, now = b.hp / b.maxHpRef;
    b.dead = true;
    G.enemies = G.enemies.filter(e => !e.dead);
    return { lag, now };
  });
  ok('Boss 血条的白色残影条滞后于实际血量', hpLag.lag > hpLag.now,
    'lag=' + hpLag.lag.toFixed(3) + ' now=' + hpLag.now.toFixed(3));

  // ------------------------------------------------------------ transitions
  section('转场（房间淡入 / toast 淡入 / 结算纸落入）');
  const fade = await page.evaluate(() => {
    const side = Object.keys(G.room.doors)[0];
    if (!side) return -1;
    G.room.cleared = true;
    enterRoom(G.room.doors[side], side);
    const t = G.fadeT;
    G.fadeT = 0;
    return t;
  });
  ok('穿门时点亮房间淡入（G.fadeT 不再是死字段）', fade > 0, 'fadeT=' + fade);

  const toastIn = await page.evaluate(async () => {
    G.toast = { title: '测试', desc: '淡入', t: 2.6 };
    const a0 = toastAlpha();
    for (let i = 0; i < 20; i++) await new Promise(r => requestAnimationFrame(r));
    const a1 = toastAlpha();
    G.toast = null;
    return { a0, a1 };
  });
  ok('toast 从低透明度淡入到全不透明', toastIn.a0 < 0.5 && toastIn.a1 === 1,
    JSON.stringify(toastIn));

  // 入场计时必须在「离开结算状态」时复位，否则一局里的第二次死亡会跳过动画
  // （这正是初版 endAnimK 的 bug：重置分支写在了只有结算时才会被调用的函数里）
  const endK = await page.evaluate(() => {
    const keepState = G.state;
    G.state = 'play'; endAnimK();          // 离开结算状态 → 复位
    G.state = 'dead';
    const k0 = endAnimK();
    const k1 = endAnimK();
    G.state = 'play'; endAnimK();          // 重开一局
    G.state = 'dead';
    const k2 = endAnimK();                 // 第二次死亡也要从 0 重新开始
    G.state = keepState;
    return { k0, k1, k2 };
  });
  ok('死亡结算纸有入场计时（不是瞬现）', endK.k0 < 1 && endK.k1 > endK.k0,
    'k0=' + endK.k0 + ' k1=' + endK.k1);
  ok('离开结算状态会复位，第二次死亡照样播入场', endK.k2 < 1, 'k2=' + endK.k2);

  // ---------------------------------------------------------- pause panel
  section('暂停面板（属性条 / 道具悬停 / 淡入）');
  await page.evaluate(() => { setPaused(true); });
  await frames(page, 10);
  const panel = await page.evaluate(() => ({
    paused: G.paused, anim: G.pauseAnim,
    // 每一行属性都要带基准值，才能画相对条
    rowsHaveBase: typeof makePlayer === 'function' && makePlayer(G.player.charId).damage > 0,
  }));
  ok('暂停遮罩有淡入计时', panel.paused && panel.anim > 0, 'pauseAnim=' + panel.anim);
  ok('属性面板能取到角色基准值（画相对条的前提）', panel.rowsHaveBase);

  // 先塞一件道具：上一章以 startRun() 收尾，itemsTaken 是空的，不塞的话
  // 下面两条会静默走 skipped 分支（等于没测）
  const grid = await page.evaluate(() => {
    G.player.itemsTaken.push(ITEM_DEFS[0].id);
    const g = pauseItemGrid();
    const n = Math.min(g.cols, g.taken.length);
    const startX = W / 2 - ((n - 1) * g.gap) / 2;
    const hit = pauseItemHit(startX, g.gridY);
    // 图标外一点应该打不中（命中框是有限的，不是整块面板）
    const miss = pauseItemHit(startX, g.gridY - 60);
    return {
      count: g.taken.length,
      hit: !!hit, i: hit && hit.i,
      hasXY: hit && typeof hit.x === 'number' && typeof hit.y === 'number',
      miss: !!miss,
    };
  });
  ok('暂停面板道具格可以被命中测试到（且只命中该格）',
    grid.count > 0 && grid.hit && grid.i === 0 && !grid.miss, JSON.stringify(grid));
  ok('命中结果带回图标坐标（给 tooltip 定位）', grid.hasXY);

  const docHit = await page.evaluate(() => {
    G.hoverPos = { x: W / 2, y: H - 20 };
    refreshHover();
    return G.hover.kind;
  });
  eq('暂停面板的文档链接可悬停（且 play 状态不再吞掉面板命中）', docHit, 'doc');
  await page.evaluate(() => { setPaused(false); });

  // ------------------------------------------------------------- misc UI
  section('触控按钮状态与无障碍');
  // style.css 是 file:// 下的外部样式表，浏览器里读 cssRules 会被同源策略拒绝，
  // 所以样式断言直接读源码文本（和其它章节读 index.html 的做法一致）
  const cssSrc = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  ok('炸弹 / 道具按钮有灰化态样式（.off）', /\.action-btn\.off\s*\{/.test(cssSrc));
  ok('角落按钮命中区被伪元素撑大（小屏可点）',
    /\.corner-btn::after/.test(cssSrc) && /inset:-6px/.test(cssSrc) && /gap:12px/.test(cssSrc));
  ok('假横屏下顶部按钮组改用物理顶部的安全区',
    /body\.rot90 #top-pad/.test(cssSrc) && /safe-area-inset-top/.test(cssSrc));
  ok('触控控件有按下过渡（不再是硬切）',
    /transition:background \.12s/.test(cssSrc));
  ok('触控按钮有可见的键盘焦点环', /:focus-visible/.test(cssSrc));
  ok('读屏专用样式存在（.sr-only 不占版面）',
    /\.sr-only/.test(cssSrc) && /clip-path:inset\(50%\)/.test(cssSrc));
  ok('读屏播报节点存在且挂在 live region 上',
    await page.evaluate(() => {
      const el = document.getElementById('sr-live');
      return !!el && el.getAttribute('aria-live') === 'polite';
    }));
  // 键盘激活路径是绑定在触屏分支里的（桌面端触控 UI 是 display:none），
  // 无头环境默认没有触控，所以这里断言源码里的绑定存在，而不是跑一次点击
  const coreSrc = fs.readFileSync(path.join(ROOT, 'js/game-core.js'), 'utf8');
  ok('触控按钮绑定了键盘激活路径（Enter / Space）',
    /bindKey\(el/.test(coreSrc) && /e\.code !== 'Enter'/.test(coreSrc));
  ok('摇杆有死区（不是 1px 抖动就当输入）',
    /STICK_DEAD/.test(coreSrc) && /d > dead/.test(coreSrc) && /max > 0 \? dx \/ max : 0/.test(coreSrc));
  ok('射击键有 touchcancel 兜底（不会一直朝一个方向射）',
    (coreSrc.match(/touchcancel/g) || []).length >= 2);
  ok('触控按钮状态与游戏状态同步（炸弹 / 充能灰化）',
    /function syncTouchButtons/.test(coreSrc) && /classList\.toggle\('off'/.test(coreSrc));
};
