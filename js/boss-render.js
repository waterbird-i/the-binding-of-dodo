'use strict';
// ================= boss rendering =================
function drawBossByDef(g, e) {
  const f = e.def.features || {};
  const pal = e.def.pal;

  // --- telegraphs, drawn on the floor in world space ---
  const marks = (e.mark ? [e.mark] : []).concat(e.marks || []);
  if (e.casts) for (const c of e.casts) {
    if (c.done) continue;
    if (c.ctx.mark) marks.push(c.ctx.mark);
    if (c.ctx.marks) marks.push(...c.ctx.marks);
  }
  if (marks.length) {
    g.save();
    g.setLineDash([9, 7]);
    // dumate 的预警圈同样用本体蓝，其余 Boss 保持警戒红
    g.strokeStyle = e.def.dumate ? 'rgba(126,140,242,0.9)' : 'rgba(201,35,26,0.85)';
    g.lineWidth = 3.5;
    for (const m of marks) {
      const mr = m.r != null ? m.r : e.r + 30;
      g.beginPath(); g.ellipse(m.x, m.y, mr, mr * 0.6, 0, 0, TAU); g.stroke();
    }
    g.setLineDash([]);
    g.restore();
  }
  if (e.aimLine != null) {
    g.save();
    g.setLineDash([14, 10]);
    g.strokeStyle = 'rgba(168,92,235,0.75)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(e.x, e.y);
    g.lineTo(e.x + Math.cos(e.aimLine) * 900, e.y + Math.sin(e.aimLine) * 900);
    g.stroke();
    g.setLineDash([]);
    g.restore();
  }

  const air = e.z || 0;
  g.save();
  g.globalAlpha = clamp(e.fade == null ? 1 : e.fade, 0, 1);
  g.translate(e.x, e.y);
  // shadow shrinks as it rises
  const shScale = 1 - clamp(air / 260, 0, 0.78);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.ellipse(0, e.r * 0.85, e.r * 1.05 * shScale, 10 + 8 * shScale, 0, 0, TAU); g.fill();
  g.translate(0, -air);
  const squash = e.squash || 0;
  g.scale(1 + squash * 0.25, 1 - squash * 0.22);
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // enrage aura below 50% hp
  if (e.rage) {
    g.save();
    g.globalAlpha = 0.28 + Math.sin(e.anim * 8) * 0.08;
    g.fillStyle = '#c9231a';
    g.beginPath(); g.ellipse(0, 0, e.r * 1.25, e.r * 1.2, 0, 0, TAU); g.fill();
    g.restore();
  }

  const skin = e.flash > 0 ? '#ffffff' : pal.skin;
  if (f.wings) drawBossWings(g, e, pal);
  (BOSS_FORMS[e.def.form] || BOSS_FORMS.blob)(g, e, skin, pal, f);
  if (f.horns) drawBossHorns(g, e, pal);
  if (f.crown) drawBossCrown(g, e);
  if (f.halo) drawBossHalo(g, e);
  g.restore();
}

function drawBossWings(g, e, pal) {
  const flap = Math.sin(e.anim * 9) * 0.35;
  g.save();
  g.fillStyle = 'rgba(240,236,224,0.9)';
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  for (const s of [-1, 1]) {
    g.save();
    g.scale(s, 1);
    g.rotate(-0.5 + flap);
    g.beginPath();
    g.moveTo(e.r * 0.5, -6);
    g.quadraticCurveTo(e.r * 1.5, -e.r * 1.1, e.r * 1.9, -e.r * 0.1);
    g.quadraticCurveTo(e.r * 1.3, e.r * 0.25, e.r * 0.5, 8);
    g.closePath();
    g.fill(); g.stroke();
    g.restore();
  }
  g.restore();
}

function drawBossHorns(g, e, pal) {
  g.fillStyle = '#e8ddc8';
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * e.r * 0.55, -e.r * 0.72);
    g.quadraticCurveTo(s * e.r * 1.05, -e.r * 1.5, s * e.r * 0.42, -e.r * 1.62);
    g.quadraticCurveTo(s * e.r * 0.5, -e.r * 1.05, s * e.r * 0.3, -e.r * 0.8);
    g.closePath(); g.fill(); g.stroke();
  }
}

function drawBossCrown(g, e) {
  const y = -e.r * 1.05;
  g.fillStyle = '#f4d03f';
  g.strokeStyle = PAL.outline;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(-22, y); g.lineTo(-22, y - 20); g.lineTo(-11, y - 8);
  g.lineTo(0, y - 26); g.lineTo(11, y - 8); g.lineTo(22, y - 20); g.lineTo(22, y);
  g.closePath(); g.fill(); g.stroke();
}

function drawBossHalo(g, e) {
  g.strokeStyle = '#f7e463';
  g.lineWidth = 5;
  g.beginPath(); g.ellipse(0, -e.r * 1.35, e.r * 0.6, e.r * 0.2, 0, 0, TAU); g.stroke();
  g.strokeStyle = PAL.outline;
  g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(0, -e.r * 1.35, e.r * 0.6, e.r * 0.2, 0, 0, TAU); g.stroke();
}

// hollow dripping eye sockets shared by the fleshy forms
function drawBossEyes(g, e, n, glow) {
  const r = e.r;
  const xs = n === 1 ? [0] : n === 2 ? [-r * 0.38, r * 0.38] : [-r * 0.5, 0, r * 0.5];
  for (const x of xs) {
    g.fillStyle = glow || '#141010';
    g.beginPath(); g.ellipse(x, -r * 0.34, r * 0.19, r * 0.26, 0, 0, TAU); g.fill();
    if (glow) {
      g.fillStyle = 'rgba(255,255,255,0.65)';
      g.beginPath(); g.ellipse(x, -r * 0.36, r * 0.08, r * 0.11, 0, 0, TAU); g.fill();
    }
  }
}

function drawBossMouth(g, e, wide) {
  const r = e.r, mo = e.mouthOpen || 0;
  g.fillStyle = '#3c0a06';
  g.beginPath();
  g.ellipse(0, r * 0.35, (wide ? r * 0.42 : r * 0.26) + mo * 8, r * 0.22 + mo * 14, 0, 0, TAU);
  g.fill();
  g.strokeStyle = PAL.outline; g.lineWidth = 4; g.stroke();
}

function drawBossTeeth(g, e) {
  const r = e.r, mo = e.mouthOpen || 0;
  g.fillStyle = '#e8ddc8';
  const tw = r * 0.42 + mo * 8;
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.moveTo(i * tw / 3 - 4, r * 0.18 - mo * 4);
    g.lineTo(i * tw / 3 + 4, r * 0.18 - mo * 4);
    g.lineTo(i * tw / 3, r * 0.3 - mo * 2);
    g.closePath(); g.fill();
  }
}

// ---- dumate：参考形象——蓝紫渐变的圆角方块笑脸 ----
// Boss 形态、终极抉择界面和解锁图鉴共用这一个绘制函数。
function drawDumateBody(g, r, t, o) {
  o = o || {};
  const c = r * 0.46;                          // 圆角半径
  g.save();
  g.rotate(-0.08 + Math.sin(t * 1.7) * 0.05);
  let fill;
  if (o.flash) fill = '#ffffff';
  else {
    fill = g.createLinearGradient(-r, -r, r, r);
    fill.addColorStop(0, '#c3cdfb');
    fill.addColorStop(0.45, '#8f9df5');
    fill.addColorStop(1, '#5f6ee9');
  }
  g.fillStyle = fill;
  g.strokeStyle = PAL.outline;
  g.lineWidth = Math.max(3, r * 0.1);
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(-r + c, -r);
  g.lineTo(r - c, -r); g.quadraticCurveTo(r, -r, r, -r + c);
  g.lineTo(r, r - c); g.quadraticCurveTo(r, r, r - c, r);
  g.lineTo(-r + c, r); g.quadraticCurveTo(-r, r, -r, r - c);
  g.lineTo(-r, -r + c); g.quadraticCurveTo(-r, -r, -r + c, -r);
  g.closePath();
  g.fill(); g.stroke();
  // 顶部高光
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath(); g.ellipse(-r * 0.42, -r * 0.5, r * 0.3, r * 0.16, -0.5, 0, TAU); g.fill();
  // 眼睛（狂暴时燃红）
  g.fillStyle = o.rage ? '#c9231a' : '#101018';
  g.beginPath();
  g.ellipse(-r * 0.24, -r * 0.16, r * 0.09, r * 0.13, 0, 0, TAU);
  g.ellipse(r * 0.3, -r * 0.2, r * 0.09, r * 0.13, 0, 0, TAU);
  g.fill();
  // 招牌的上扬大笑，嘴角带小勾；攻击时张成大嘴
  const mo = o.mouthOpen || 0;
  if (mo > 0.05) {
    g.fillStyle = '#101018';
    g.beginPath();
    g.ellipse(r * 0.02, r * 0.3, r * 0.3 + mo * r * 0.12, r * 0.16 + mo * r * 0.2, 0.05, 0, TAU);
    g.fill();
  } else {
    g.strokeStyle = '#101018';
    g.lineWidth = Math.max(3, r * 0.13);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-r * 0.46, r * 0.14);
    g.quadraticCurveTo(-r * 0.1, r * 0.52, r * 0.38, r * 0.3);
    g.stroke();
    g.beginPath();
    g.moveTo(-r * 0.46, r * 0.14);
    g.lineTo(-r * 0.56, r * 0.02);
    g.stroke();
  }
  g.restore();
}

const BOSS_FORMS = {
  // bloated sack of flesh with stubby arms
  blob(g, e, skin, pal, f) {
    const r = e.r;
    g.fillStyle = skin;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 6;
    g.beginPath(); g.ellipse(0, 0, r * 1.12, r, 0, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = pal.dark;
    g.globalAlpha = 0.35;
    g.beginPath(); g.ellipse(0, r * 0.45, r * 0.78, r * 0.42, 0, 0, TAU); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = skin;
    g.lineWidth = 5;
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(s * r * 1.08, r * 0.18, r * 0.26, r * 0.2, s * 0.5, 0, TAU); g.fill(); g.stroke();
    }
    drawBossEyes(g, e, f.eyes == null ? 2 : f.eyes, f.glow);
    drawBossMouth(g, e, f.mouth === 'wide');
    if (f.teeth) drawBossTeeth(g, e);
    g.fillStyle = PAL.blood;
    g.beginPath();
    g.moveTo(-r * 0.3, r * 0.52); g.quadraticCurveTo(-r * 0.26, r * 0.7, -r * 0.32, r * 0.84);
    g.quadraticCurveTo(-r * 0.4, r * 0.68, -r * 0.37, r * 0.54);
    g.closePath(); g.fill();
  },

  // segmented gut worm: tail rings behind a fat head
  worm(g, e, skin, pal, f) {
    const r = e.r;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 5;
    for (let i = 3; i >= 1; i--) {
      const wob = Math.sin(e.anim * 4 - i * 0.7) * r * 0.16;
      g.fillStyle = i % 2 ? pal.dark : skin;
      g.beginPath();
      g.ellipse(wob, r * 0.5 + i * r * 0.36, r * (0.85 - i * 0.13), r * (0.5 - i * 0.07), 0, 0, TAU);
      g.fill(); g.stroke();
    }
    g.fillStyle = skin;
    g.lineWidth = 6;
    g.beginPath(); g.ellipse(0, 0, r, r * 0.92, 0, 0, TAU); g.fill(); g.stroke();
    // ribbed segments across the head
    g.strokeStyle = 'rgba(80,40,30,0.35)';
    g.lineWidth = 3;
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.arc(0, i * r * 0.3, r * 0.8, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
    }
    drawBossEyes(g, e, f.eyes == null ? 2 : f.eyes, f.glow);
    drawBossMouth(g, e, false);
  },

  // engorged fly: compound eyes, buzzing wings drawn by drawBossWings
  fly(g, e, skin, pal, f) {
    const r = e.r;
    g.fillStyle = skin;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 5;
    g.beginPath(); g.ellipse(0, 0, r, r * 0.95, 0, 0, TAU); g.fill(); g.stroke();
    g.strokeStyle = PAL.outline;
    g.lineWidth = 4;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * r * 0.6, r * 0.5);
      g.quadraticCurveTo(s * r * 1.1, r * 0.8, s * r * 0.85, r * 1.05);
      g.stroke();
    }
    g.fillStyle = '#c92f1f';
    g.strokeStyle = PAL.outline;
    g.lineWidth = 3;
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(s * r * 0.36, -r * 0.28, r * 0.28, r * 0.32, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,180,170,0.5)';
      g.beginPath(); g.ellipse(s * r * 0.3, -r * 0.36, r * 0.1, r * 0.12, 0, 0, TAU); g.fill();
      g.fillStyle = '#c92f1f';
    }
    drawBossMouth(g, e, false);
  },

  // bare skull with a hinged jaw and burning sockets
  skull(g, e, skin, pal, f) {
    const r = e.r;
    g.fillStyle = skin;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 6;
    g.beginPath(); g.ellipse(0, -r * 0.1, r, r * 0.9, 0, 0, TAU); g.fill(); g.stroke();
    // cheek bones
    g.beginPath(); g.ellipse(-r * 0.72, r * 0.05, r * 0.22, r * 0.3, 0.4, 0, TAU); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(r * 0.72, r * 0.05, r * 0.22, r * 0.3, -0.4, 0, TAU); g.fill(); g.stroke();
    // jaw drops while attacking
    const jaw = (e.mouthOpen || 0) * r * 0.2;
    g.beginPath();
    g.moveTo(-r * 0.5, r * 0.45 + jaw);
    g.quadraticCurveTo(0, r * 1.05 + jaw, r * 0.5, r * 0.45 + jaw);
    g.quadraticCurveTo(0, r * 0.62 + jaw, -r * 0.5, r * 0.45 + jaw);
    g.closePath(); g.fill(); g.stroke();
    // teeth row
    g.fillStyle = '#fbf6e8';
    for (let i = -2; i <= 2; i++) g.fillRect(i * r * 0.16 - 3, r * 0.44 + jaw, 6, r * 0.14);
    // sockets
    g.fillStyle = '#100c0a';
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(s * r * 0.36, -r * 0.24, r * 0.24, r * 0.27, 0, 0, TAU); g.fill();
    }
    if (f.glow) {
      g.fillStyle = f.glow;
      g.globalAlpha = 0.7 + Math.sin(e.anim * 6) * 0.25;
      for (const s of [-1, 1]) {
        g.beginPath(); g.arc(s * r * 0.36, -r * 0.24, r * 0.1, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    }
    // nose slit
    g.fillStyle = '#100c0a';
    g.beginPath();
    g.moveTo(0, r * 0.02); g.lineTo(-r * 0.1, r * 0.28); g.lineTo(r * 0.1, r * 0.28);
    g.closePath(); g.fill();
  },

  // hooded cloak, glowing eyes, scythe
  reaper(g, e, skin, pal, f) {
    const r = e.r;
    // scythe behind the body
    g.strokeStyle = '#5a4632';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(r * 0.9, r * 0.9); g.lineTo(r * 1.15, -r * 1.15);
    g.stroke();
    g.fillStyle = '#cdd3da';
    g.strokeStyle = PAL.outline;
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(r * 1.15, -r * 1.15);
    g.quadraticCurveTo(r * 0.2, -r * 1.5, r * 0.05, -r * 0.85);
    g.quadraticCurveTo(r * 0.6, -r * 1.05, r * 1.15, -r * 1.15);
    g.closePath(); g.fill(); g.stroke();
    // cloak
    const sway = Math.sin(e.anim * 2.4) * r * 0.1;
    g.fillStyle = skin;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(0, -r);
    g.quadraticCurveTo(-r * 0.95, -r * 0.5, -r * 0.8 + sway, r);
    g.quadraticCurveTo(0, r * 0.72, r * 0.8 + sway, r);
    g.quadraticCurveTo(r * 0.95, -r * 0.5, 0, -r);
    g.closePath(); g.fill(); g.stroke();
    // hood shadow
    g.fillStyle = '#0a0810';
    g.beginPath(); g.ellipse(0, -r * 0.42, r * 0.44, r * 0.42, 0, 0, TAU); g.fill();
    if (f.glow) {
      g.fillStyle = f.glow;
      g.globalAlpha = 0.75 + Math.sin(e.anim * 7) * 0.2;
      for (const s of [-1, 1]) {
        g.beginPath(); g.ellipse(s * r * 0.17, -r * 0.44, r * 0.08, r * 0.12, 0, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    }
  },

  // anatomical heart, veins pulsing with the beat
  heart(g, e, skin, pal, f) {
    const r = e.r;
    const beat = 1 + Math.sin(e.anim * 4) * 0.05;
    g.save();
    g.scale(beat, beat);
    g.fillStyle = skin;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(0, r * 0.95);
    g.bezierCurveTo(-r * 1.25, r * 0.1, -r * 1.05, -r * 0.85, -r * 0.45, -r * 0.6);
    g.bezierCurveTo(-r * 0.16, -r * 0.45, 0, -r * 0.2, 0, -r * 0.1);
    g.bezierCurveTo(0, -r * 0.2, r * 0.16, -r * 0.45, r * 0.45, -r * 0.6);
    g.bezierCurveTo(r * 1.05, -r * 0.85, r * 1.25, r * 0.1, 0, r * 0.95);
    g.closePath(); g.fill(); g.stroke();
    // aorta tubes
    g.fillStyle = pal.dark;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 4;
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(s * r * 0.3, -r * 0.72, r * 0.16, r * 0.24, s * 0.3, 0, TAU); g.fill(); g.stroke();
    }
    if (f.veins) {
      g.strokeStyle = 'rgba(60,10,8,0.5)';
      g.lineWidth = 3;
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(i * r * 0.3, -r * 0.35);
        g.quadraticCurveTo(i * r * 0.55, r * 0.1, i * r * 0.22, r * 0.6);
        g.stroke();
      }
    }
    g.restore();
    drawBossMouth(g, e, false);
  },

  // horned demon torso
  demon(g, e, skin, pal, f) {
    const r = e.r;
    g.fillStyle = skin;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 6;
    g.beginPath(); g.ellipse(0, r * 0.05, r * 1.05, r * 0.98, 0, 0, TAU); g.fill(); g.stroke();
    // pecs / ribs shading
    g.fillStyle = pal.dark;
    g.globalAlpha = 0.4;
    g.beginPath(); g.ellipse(-r * 0.4, r * 0.3, r * 0.32, r * 0.2, 0.2, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(r * 0.4, r * 0.3, r * 0.32, r * 0.2, -0.2, 0, TAU); g.fill();
    g.globalAlpha = 1;
    // clawed arms
    g.fillStyle = skin;
    g.lineWidth = 5;
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(s * r * 1.02, r * 0.1, r * 0.28, r * 0.22, s * 0.6, 0, TAU); g.fill(); g.stroke();
      g.strokeStyle = '#efe6d2';
      g.lineWidth = 3;
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(s * r * 1.18, r * 0.12 + i * 5);
        g.lineTo(s * r * 1.42, r * 0.16 + i * 7);
        g.stroke();
      }
      g.strokeStyle = PAL.outline;
      g.lineWidth = 5;
    }
    drawBossEyes(g, e, f.eyes == null ? 2 : f.eyes, f.glow);
    drawBossMouth(g, e, true);
    if (f.teeth) drawBossTeeth(g, e);
  },

  // robed choir angel
  angel(g, e, skin, pal, f) {
    const r = e.r;
    g.fillStyle = skin;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 5.5;
    // robe
    g.beginPath();
    g.moveTo(0, -r * 0.35);
    g.quadraticCurveTo(-r * 0.85, -r * 0.1, -r * 0.72, r);
    g.quadraticCurveTo(0, r * 0.78, r * 0.72, r);
    g.quadraticCurveTo(r * 0.85, -r * 0.1, 0, -r * 0.35);
    g.closePath(); g.fill(); g.stroke();
    // head
    g.beginPath(); g.ellipse(0, -r * 0.62, r * 0.42, r * 0.4, 0, 0, TAU); g.fill(); g.stroke();
    // robe folds
    g.strokeStyle = 'rgba(120,110,90,0.4)';
    g.lineWidth = 3;
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(i * r * 0.3, -r * 0.1);
      g.quadraticCurveTo(i * r * 0.36, r * 0.45, i * r * 0.26, r * 0.9);
      g.stroke();
    }
    // serene closed eyes + weeping streaks
    g.strokeStyle = PAL.outline;
    g.lineWidth = 3.5;
    for (const s of [-1, 1]) {
      g.beginPath(); g.arc(s * r * 0.16, -r * 0.64, r * 0.1, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      g.strokeStyle = 'rgba(140,190,220,0.85)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(s * r * 0.16, -r * 0.56);
      g.lineTo(s * r * 0.18, -r * 0.32 + Math.sin(e.anim * 3) * 3);
      g.stroke();
      g.strokeStyle = PAL.outline;
      g.lineWidth = 3.5;
    }
  },

  // gilded idol: blocky statue with gem eyes
  idol(g, e, skin, pal, f) {
    const r = e.r;
    g.fillStyle = skin;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(-r * 0.85, r);
    g.lineTo(-r * 0.62, -r * 0.55);
    g.lineTo(0, -r * 0.95);
    g.lineTo(r * 0.62, -r * 0.55);
    g.lineTo(r * 0.85, r);
    g.closePath(); g.fill(); g.stroke();
    // engraved bands
    g.strokeStyle = pal.dark;
    g.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(-r * (0.66 + i * 0.06), r * (0.1 + i * 0.28));
      g.lineTo(r * (0.66 + i * 0.06), r * (0.1 + i * 0.28));
      g.stroke();
    }
    // gem eyes
    for (const s of [-1, 1]) {
      g.fillStyle = f.glow || '#fff2a8';
      g.strokeStyle = PAL.outline;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(s * r * 0.34, -r * 0.52);
      g.lineTo(s * r * 0.48, -r * 0.34);
      g.lineTo(s * r * 0.34, -r * 0.16);
      g.lineTo(s * r * 0.2, -r * 0.34);
      g.closePath(); g.fill(); g.stroke();
    }
    drawBossMouth(g, e, false);
  },

  // living silhouette: edges crawl, only the eyes read clearly
  shadow(g, e, skin, pal, f) {
    const r = e.r;
    g.fillStyle = skin;
    g.strokeStyle = '#000';
    g.lineWidth = 4;
    g.beginPath();
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU;
      const wob = 1 + Math.sin(e.anim * 3 + i * 1.7) * 0.09;
      const px = Math.cos(a) * r * 1.05 * wob;
      const py = Math.sin(a) * r * wob;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath(); g.fill(); g.stroke();
    // smoky wisps rising off the top
    g.globalAlpha = 0.4;
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.ellipse(i * r * 0.4, -r * (1.05 + Math.abs(Math.sin(e.anim * 2 + i)) * 0.3), r * 0.16, r * 0.24, 0, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    // blank glowing eyes
    const glow = f.glow || '#e8e2d0';
    g.fillStyle = glow;
    g.globalAlpha = 0.85 + Math.sin(e.anim * 5) * 0.15;
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(s * r * 0.34, -r * 0.22, r * 0.14, r * 0.2, 0, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    g.strokeStyle = glow;
    g.lineWidth = 4;
    g.beginPath(); g.arc(0, r * 0.34, r * 0.34, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke();
  },

  // 隐藏终极 Boss dumate：蓝色圆角方块笑脸（见上方 drawDumateBody）
  dumate(g, e, skin, pal, f) {
    drawDumateBody(g, e.r * 1.02, e.anim, { flash: e.flash > 0, rage: e.rage, mouthOpen: e.mouthOpen });
  },

  // the final boss: dodo itself, blown up to boss scale
  dodo(g, e, skin, pal, f) {
    const s = e.r / 24;
    g.save();
    g.scale(s, s);
    drawDodo(g, 0, 0, {
      walk: e.anim * 8, moving: e.z > 0 || Math.abs(e.vx) > 10,
      aimX: 0, aimY: 0.4, hurtFlash: e.flash > 0,
      headColor: skin, eyeColor: '#8e1b12', hat: null, big: false,
    });
    g.restore();
    // permanent bleeding grin
    g.fillStyle = PAL.blood;
    g.beginPath();
    g.moveTo(-e.r * 0.2, e.r * 0.1);
    g.quadraticCurveTo(-e.r * 0.16, e.r * 0.4, -e.r * 0.24, e.r * 0.56);
    g.quadraticCurveTo(-e.r * 0.32, e.r * 0.38, -e.r * 0.28, e.r * 0.12);
    g.closePath(); g.fill();
  },
};
