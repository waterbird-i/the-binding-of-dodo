'use strict';
// ================= DODO (player) =================
// o: {walk, moving, aimX, aimY, hurtFlash, headColor, eyeColor, hat, big,
//     blink, wings, wingGrow, flap, dirX, dirY}
// Strictly follows 全身-走路-白底.png: one giant head walking on two
// outlined legs with chunky white boots — no torso, no arms; a C-ring ear
// on each side; a short tilted antenna with a round knob; two solid dot
// eyes (left bigger); a single thick smile stroke with bare round ends.
function drawDodo(g, x, y, o) {
  const moving = o.moving;
  const swing = moving ? Math.sin(o.walk) : 0;
  const bob = moving ? Math.abs(Math.sin(o.walk)) * 2.5 : 0;
  const scale = o.big ? 1.18 : 1;
  const headColor = o.hurtFlash ? '#ff9d94' : (o.headColor || '#ffffff');
  // with wings dodo hovers: body lifts off, shadow shrinks under it
  const hover = o.wings ? 4 + Math.sin((o.flap || 0) * 0.8) * 2 : 0;
  g.save();
  g.translate(x, y);
  // shadow
  g.fillStyle = o.wings ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(0, 28, 20 * scale * (o.wings ? 0.85 : 1), 8, 0, 0, TAU); g.fill();
  g.scale(scale, scale);
  g.translate(0, -bob - hover);

  g.lineCap = 'round';
  g.lineJoin = 'round';

  // item aura glows behind the whole body
  if (o.aura) {
    g.save();
    g.globalAlpha = 0.75;
    g.fillStyle = o.aura;
    g.beginPath(); g.ellipse(0, -8, 32, 30, 0, 0, TAU); g.fill();
    g.restore();
  }

  // ---- wings (flight item): drawn behind legs & head ----
  if (o.wings) drawDodoWings(g, o, headColor);

  // ---- legs: outlined white tubes ending in big white boots ----
  // Each limb is a black stroke with a lighter core stroke on top,
  // producing the outlined doodle look of the reference. No torso, no arms.
  const strokeLimb = (pts, color, lw) => {
    g.strokeStyle = color; g.lineWidth = lw;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.stroke();
  };
  const drawLeg = (leg, foot) => {
    strokeLimb(leg, PAL.outline, 7.5);
    strokeLimb(foot, PAL.outline, 13.5);
    strokeLimb(leg, headColor, 3.2);
    strokeLimb(foot, headColor, 8);
  };
  // back (right) leg: bent at the knee, boot pointing left
  const kneeR = [13 - swing * 2.5, 13.5];
  const ankleR = [11 - swing * 7, 23.5 - Math.abs(swing)];
  drawLeg([[7, 2], kneeR, ankleR], [ankleR, [ankleR[0] - 8.5, ankleR[1] + 1.5]]);
  // front (left) leg: straight long stride, big boot pointing down-left
  const ankleL = [-13 + swing * 7, 23 - Math.abs(swing) * 1.5];
  drawLeg([[-6, 2], ankleL], [ankleL, [ankleL[0] - 9, ankleL[1] + 4]]);

  // ---- C-ring ears on both sides (drawn behind the head so the head
  // outline slices them into crescents, as in the reference) ----
  g.fillStyle = headColor;
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  g.beginPath(); g.ellipse(-24.5, -12.7, 6.2, 6.8, -0.2, 0, TAU); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(24.5, -8, 6.0, 6.6, 0.2, 0, TAU); g.fill(); g.stroke();

  // ---- head: giant, wider than tall, extra-thick outline ----
  g.save();
  g.rotate(-0.05);
  g.fillStyle = headColor;
  g.strokeStyle = PAL.outline;
  g.lineWidth = 5.5;
  g.beginPath();
  g.ellipse(0, -12, 23, 18.7, 0, 0, TAU);
  g.fill();
  g.stroke();
  g.restore();

  // ---- antenna: short thick stem leaning right + small round knob ----
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4.2;
  g.beginPath();
  g.moveTo(0.5, -28);
  g.lineTo(3.5, -38.5);
  g.stroke();
  g.fillStyle = PAL.outline;
  g.beginPath();
  g.ellipse(4.3, -41, 4.3, 3.3, -0.35, 0, TAU);
  g.fill();

  // ---- face: two solid dot eyes — left bigger and higher; follow aim.
  // While a tear is leaving, both eyes squeeze shut (blink) ----
  const ax = clamp(o.aimX || 0, -1, 1) * 3;
  const ay = clamp(o.aimY || 0, -1, 1) * 2.5;
  if (o.blink) {
    g.strokeStyle = o.eyeColor || '#17110c';
    g.lineWidth = 2.8;
    g.beginPath();
    g.moveTo(-12.2 + ax, -18.5 + ay);
    g.quadraticCurveTo(-9 + ax, -16 + ay, -5.8 + ax, -18.5 + ay);
    g.moveTo(0 + ax, -17 + ay);
    g.quadraticCurveTo(2.5 + ax, -15 + ay, 5 + ax, -17 + ay);
    g.stroke();
  } else {
    g.fillStyle = o.eyeColor || '#17110c';
    g.beginPath();
    g.ellipse(-9 + ax, -18.5 + ay, 3.2, 4.1, -0.15, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(2.5 + ax, -17 + ay, 2.5, 3.2, 0.12, 0, TAU);
    g.fill();
  }
  // angry character variant: two brows slanting down toward the beak
  if (o.brow === 'angry') {
    g.strokeStyle = PAL.outline;
    g.lineWidth = 3.2;
    g.beginPath();
    g.moveTo(-14.5 + ax, -26 + ay); g.lineTo(-4.5 + ax, -22 + ay);
    g.moveTo(8.5 + ax, -23.5 + ay); g.lineTo(-0.5 + ax, -20.5 + ay);
    g.stroke();
  }
  // ---- mouth: one thick smile arc, bare round ends (no end knob) ----
  g.strokeStyle = PAL.outline;
  g.lineWidth = 3.8;
  if (o.hurtFlash) {
    g.beginPath(); g.arc(3 + ax, -9 + ay, 4.5, 0, TAU); g.stroke();
  } else {
    g.beginPath();
    g.arc(3.2 + ax, -16.5 + ay, 10.3, 0.14 * Math.PI, 0.62 * Math.PI);
    g.stroke();
  }

  // hat / crown (item appearance)
  if (o.hat === 'crown') {
    g.fillStyle = '#f4d03f';
    g.strokeStyle = PAL.outline;
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(-13, -32); g.lineTo(-13, -44) ; g.lineTo(-6, -37); g.lineTo(0, -46); g.lineTo(6, -37); g.lineTo(13, -44); g.lineTo(13, -32);
    g.closePath(); g.fill(); g.stroke();
  }
  if (o.hat === 'halo') {
    g.strokeStyle = '#f7e463';
    g.lineWidth = 4;
    g.beginPath(); g.ellipse(0, -47, 14, 4.5, 0, 0, TAU); g.stroke();
  }
  if (o.hat === 'horns') {
    // devil transformation: two dark curved horns
    g.fillStyle = '#2b1210';
    g.strokeStyle = PAL.outline;
    g.lineWidth = 2.5;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 8, -30);
      g.quadraticCurveTo(s * 16, -38, s * 13, -48);
      g.quadraticCurveTo(s * 12, -40, s * 4, -34);
      g.closePath(); g.fill(); g.stroke();
    }
  }
  if (o.hat === 'mushcap') {
    // mushroom transformation: spotted red cap
    g.fillStyle = '#b8432e';
    g.strokeStyle = PAL.outline;
    g.lineWidth = 2.8;
    g.beginPath();
    g.moveTo(-17, -32);
    g.quadraticCurveTo(0, -54, 17, -32);
    g.quadraticCurveTo(0, -38, -17, -32);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#f3ecd8';
    g.beginPath();
    g.arc(-7, -38, 2.6, 0, TAU);
    g.arc(4, -43, 3, 0, TAU);
    g.arc(11, -36, 2.2, 0, TAU);
    g.fill();
  }
  g.restore();
}

// Flight wings. The facing (dirX/dirY) is quantized to 8 directions and each
// octant gets its own pose: facing away spreads both wings wide (you see the
// back), facing the camera tucks them, and side/diagonal facings enlarge the
// trailing wing while shrinking the leading one. wingGrow (1 → 0) plays the
// sprout-in animation right after the item is taken.
function drawDodoWings(g, o, headColor) {
  const grow = clamp(1 - (o.wingGrow || 0), 0, 1);
  const wScale = grow * (1 + 0.3 * Math.sin(grow * Math.PI));   // pop overshoot
  if (wScale < 0.04) return;
  let qx = 0, qy = 1;
  if (Math.hypot(o.dirX || 0, o.dirY || 0) > 0.01) {
    const oct = Math.round(Math.atan2(o.dirY, o.dirX) / (Math.PI / 4)) * (Math.PI / 4);
    qx = Math.sign(Math.round(Math.cos(oct) * 10));
    qy = Math.sign(Math.round(Math.sin(oct) * 10));
  }
  const flap = Math.sin(o.flap != null ? o.flap : o.walk * 1.2) * (o.moving ? 0.55 : 0.32);
  const spread = qy < 0 ? 1.22 : (qy > 0 ? 0.9 : 1.05);
  const lift = qy < 0 ? -5 : 0;
  for (const side of [-1, 1]) {
    const faceMul = qx === 0 ? 1 : (side === -qx ? 1.18 : 0.72);
    g.save();
    g.translate(side * 15, -16 + lift);
    g.scale(side * spread * faceMul * wScale, spread * wScale);
    g.rotate(-0.2 - flap * 0.5);
    g.fillStyle = headColor;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 3.4;
    g.beginPath();
    g.moveTo(2, 3);
    g.quadraticCurveTo(15, -13 - flap * 9, 30, -9 - flap * 14);
    g.quadraticCurveTo(23, -2, 27, 3 - flap * 8);
    g.quadraticCurveTo(19, 6, 21, 11 - flap * 5);
    g.quadraticCurveTo(9, 12, 2, 8);
    g.closePath();
    g.fill(); g.stroke();
    // feather separations
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(6, 4); g.quadraticCurveTo(14, 0, 23, -5 - flap * 10);
    g.moveTo(6, 7); g.quadraticCurveTo(13, 6, 19, 3 - flap * 6);
    g.stroke();
    g.restore();
  }
}

// ================= TEARS =================
function drawTear(g, t) {
  g.save();
  // shadow on floor
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath(); g.ellipse(t.x, t.y + 14, t.r * 0.9, t.r * 0.4, 0, 0, TAU); g.fill();
  // tear body
  g.fillStyle = t.color || PAL.tear;
  g.strokeStyle = t.outline || PAL.tearOutline;
  g.lineWidth = 2.5;
  g.beginPath(); g.arc(t.x, t.y, t.r, 0, TAU); g.fill(); g.stroke();
  // highlight
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.arc(t.x - t.r * 0.35, t.y - t.r * 0.35, t.r * 0.28, 0, TAU); g.fill();
  g.restore();
}

function drawEnemyShot(g, s) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath(); g.ellipse(s.x, s.y + 12, s.r * 0.9, s.r * 0.4, 0, 0, TAU); g.fill();
  g.fillStyle = '#b3241a';
  g.strokeStyle = '#5c0f09';
  g.lineWidth = 2.5;
  g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,160,150,0.8)';
  g.beginPath(); g.arc(s.x - s.r * 0.3, s.y - s.r * 0.3, s.r * 0.25, 0, TAU); g.fill();
  g.restore();
}

// ================= ENEMIES =================
function drawGaper(g, e) {
  const bob = Math.abs(Math.sin(e.anim * 6)) * 2;
  g.save();
  g.translate(e.x, e.y);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(0, 22, 18, 7, 0, 0, TAU); g.fill();
  g.translate(0, -bob);
  g.lineCap = 'round';

  // shuffling legs
  const swing = Math.sin(e.anim * 6) * 5;
  g.strokeStyle = PAL.outline;
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(-6, 8); g.lineTo(-6 + swing, 20);
  g.moveTo(6, 8); g.lineTo(6 - swing, 20);
  g.stroke();

  // body blob
  const skin = e.flash > 0 ? '#ffffff' : PAL.gaper;
  g.fillStyle = skin;
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  g.beginPath(); g.ellipse(0, 2, 13, 11, 0, 0, TAU); g.fill(); g.stroke();

  // head
  g.beginPath(); g.ellipse(0, -14, 18, 17, 0, 0, TAU); g.fill(); g.stroke();

  // hollow black eyes (dripping)
  g.fillStyle = '#141010';
  g.beginPath();
  g.ellipse(-7, -17, 4.5, 6, 0, 0, TAU);
  g.ellipse(7, -17, 4.5, 6, 0, 0, TAU);
  g.fill();
  // gaping mouth with blood
  g.fillStyle = '#4a0d08';
  g.beginPath(); g.ellipse(0, -4, 6.5, 7.5, 0, 0, TAU); g.fill();
  g.strokeStyle = PAL.outline; g.lineWidth = 2.5; g.stroke();
  g.fillStyle = PAL.blood;
  g.beginPath();
  g.moveTo(-5, -1); g.quadraticCurveTo(-4, 6, -6, 9); g.quadraticCurveTo(-8, 5, -8, 0);
  g.closePath(); g.fill();
  g.restore();
}

function drawFly(g, e) {
  const bz = Math.sin(e.anim * 14) * 3;
  g.save();
  g.translate(e.x, e.y + bz);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.ellipse(0, 16 - bz, 8, 3.5, 0, 0, TAU); g.fill();
  // wings
  const wf = Math.sin(e.anim * 40) * 0.6;
  g.fillStyle = 'rgba(220,225,235,0.75)';
  g.strokeStyle = 'rgba(40,40,50,0.8)';
  g.lineWidth = 1.5;
  g.save(); g.rotate(-0.5 + wf);
  g.beginPath(); g.ellipse(-9, -6, 8, 4, -0.5, 0, TAU); g.fill(); g.stroke();
  g.restore();
  g.save(); g.rotate(0.5 - wf);
  g.beginPath(); g.ellipse(9, -6, 8, 4, 0.5, 0, TAU); g.fill(); g.stroke();
  g.restore();
  // body
  g.fillStyle = e.flash > 0 ? '#fff' : '#2b2622';
  g.strokeStyle = PAL.outline;
  g.lineWidth = 3;
  g.beginPath(); g.arc(0, 0, 8.5, 0, TAU); g.fill(); g.stroke();
  // red eyes
  g.fillStyle = '#c92f1f';
  g.beginPath(); g.arc(-3, -1, 2.2, 0, TAU); g.arc(3, -1, 2.2, 0, TAU); g.fill();
  g.restore();
}

function drawSpitter(g, e) {
  const bz = Math.sin(e.anim * 8) * 4;
  g.save();
  g.translate(e.x, e.y + bz);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.ellipse(0, 20 - bz, 14, 6, 0, 0, TAU); g.fill();
  // round fat body
  const skin = e.flash > 0 ? '#fff' : '#c98f8f';
  g.fillStyle = skin;
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  g.beginPath(); g.ellipse(0, 0, 17, 15, 0, 0, TAU); g.fill(); g.stroke();
  // small wings
  const wf = Math.sin(e.anim * 30) * 0.5;
  g.fillStyle = 'rgba(230,220,220,0.8)';
  g.strokeStyle = 'rgba(60,40,40,0.8)';
  g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(-16, -8 + wf * 4, 7, 3.5, -0.6, 0, TAU); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(16, -8 - wf * 4, 7, 3.5, 0.6, 0, TAU); g.fill(); g.stroke();
  // single big eye
  g.fillStyle = '#f5efe4';
  g.beginPath(); g.arc(0, -4, 6.5, 0, TAU); g.fill();
  g.strokeStyle = PAL.outline; g.lineWidth = 2.5; g.stroke();
  g.fillStyle = '#17110c';
  g.beginPath(); g.arc(e.eyeX || 0, -4 + (e.eyeY || 0), 3, 0, TAU); g.fill();
  // puckered mouth (charging -> open)
  const open = e.charge > 0.7 ? 5.5 : 2.5;
  g.fillStyle = '#4a0d08';
  g.beginPath(); g.ellipse(0, 7, open, open * 0.8, 0, 0, TAU); g.fill();
  g.strokeStyle = PAL.outline; g.lineWidth = 2; g.stroke();
  g.restore();
}

function drawHopper(g, e) {
  // small jumping enemy
  const air = e.z || 0;
  g.save();
  g.translate(e.x, e.y);
  g.fillStyle = 'rgba(0,0,0,0.28)';
  const shScale = 1 - clamp(air / 60, 0, 0.6);
  g.beginPath(); g.ellipse(0, 18, 14 * shScale, 6 * shScale, 0, 0, TAU); g.fill();
  g.translate(0, -air);
  const squash = e.squash || 0;
  g.scale(1 + squash * 0.35, 1 - squash * 0.3);
  const skin = e.flash > 0 ? '#fff' : '#9dbb72';
  g.fillStyle = skin;
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  // body
  g.beginPath(); g.ellipse(0, 0, 14, 13, 0, 0, TAU); g.fill(); g.stroke();
  // legs folded
  g.lineWidth = 3.5;
  g.beginPath();
  g.moveTo(-10, 8); g.quadraticCurveTo(-16, 12, -12, 16);
  g.moveTo(10, 8); g.quadraticCurveTo(16, 12, 12, 16);
  g.stroke();
  // eyes
  g.fillStyle = '#17110c';
  g.beginPath(); g.ellipse(-5, -3, 2.5, 3.5, 0, 0, TAU); g.ellipse(5, -3, 2.5, 3.5, 0, 0, TAU); g.fill();
  // frown
  g.strokeStyle = PAL.outline; g.lineWidth = 2.5;
  g.beginPath(); g.arc(0, 9, 5, 1.2 * Math.PI, 1.8 * Math.PI); g.stroke();
  g.restore();
}

// rooted turret: a fleshy stump with a rotating cross of eyes
function drawSentry(g, e) {
  g.save();
  g.translate(e.x, e.y);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(0, 20, 18, 7, 0, 0, TAU); g.fill();
  const skin = e.flash > 0 ? '#fff' : '#b9a2c4';
  // stone base
  g.fillStyle = '#8d8371';
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(-16, 18); g.lineTo(-11, 4); g.lineTo(11, 4); g.lineTo(16, 18);
  g.closePath(); g.fill(); g.stroke();
  // bulb
  g.fillStyle = skin;
  g.beginPath(); g.ellipse(0, -6, 16, 15, 0, 0, TAU); g.fill(); g.stroke();
  // four muzzles spinning with e.spin
  g.save();
  g.translate(0, -6);
  g.rotate(e.spin || 0);
  const charge = clamp((e.charge || 0) / 0.7, 0, 1);
  for (let i = 0; i < 4; i++) {
    g.rotate(TAU / 4);
    g.fillStyle = '#4a0d08';
    g.strokeStyle = PAL.outline;
    g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(13, 0, 4.5 + charge * 2, 3.5 + charge * 1.5, 0, 0, TAU); g.fill(); g.stroke();
  }
  g.restore();
  // single angry eye that reddens while charging
  g.fillStyle = '#f5efe4';
  g.beginPath(); g.arc(0, -8, 6, 0, TAU); g.fill();
  g.strokeStyle = PAL.outline; g.lineWidth = 2.5; g.stroke();
  g.fillStyle = charge > 0.4 ? '#c9231a' : '#17110c';
  g.beginPath(); g.arc(0, -8, 3, 0, TAU); g.fill();
  g.restore();
}

// Boom Fly: fat red fly, glows hotter the lower its hp gets
function drawBoomfly(g, e) {
  const bz = Math.sin(e.anim * 12) * 3;
  g.save();
  g.translate(e.x, e.y + bz);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.ellipse(0, 18 - bz, 10, 4.5, 0, 0, TAU); g.fill();
  const wf = Math.sin(e.anim * 38) * 0.6;
  g.fillStyle = 'rgba(230,215,215,0.75)';
  g.strokeStyle = 'rgba(50,30,30,0.8)';
  g.lineWidth = 1.5;
  g.save(); g.rotate(-0.5 + wf);
  g.beginPath(); g.ellipse(-11, -7, 9, 4.5, -0.5, 0, TAU); g.fill(); g.stroke();
  g.restore();
  g.save(); g.rotate(0.5 - wf);
  g.beginPath(); g.ellipse(11, -7, 9, 4.5, 0.5, 0, TAU); g.fill(); g.stroke();
  g.restore();
  g.fillStyle = e.flash > 0 ? '#fff' : '#a3231a';
  g.strokeStyle = PAL.outline;
  g.lineWidth = 3.5;
  g.beginPath(); g.arc(0, 0, 11.5, 0, TAU); g.fill(); g.stroke();
  // pulsing fuse glow
  g.fillStyle = 'rgba(255,180,60,' + (0.35 + 0.3 * Math.abs(Math.sin(e.anim * 7))) + ')';
  g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill();
  g.fillStyle = '#17110c';
  g.beginPath(); g.arc(-3.5, -2, 2, 0, TAU); g.arc(3.5, -2, 2, 0, TAU); g.fill();
  g.restore();
}

// Globin: dripping red glob; while reforming it's just a puddle
function drawGlobin(g, e) {
  g.save();
  g.translate(e.x, e.y);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(0, 20, 17, 6.5, 0, 0, TAU); g.fill();
  const skin = e.flash > 0 ? '#fff' : '#b3372a';
  if (e.pile > 0) {
    // reforming puddle bubbles up as the timer runs out
    const k = clamp(1 - e.pile / 2.2, 0, 1);
    g.fillStyle = skin;
    g.strokeStyle = PAL.outline;
    g.lineWidth = 3.5;
    g.beginPath(); g.ellipse(0, 14, 17, 6 + k * 5, 0, 0, TAU); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(-4, 10 - k * 6, 6 + k * 5, 4 + k * 5, 0, 0, TAU); g.fill(); g.stroke();
    g.restore();
    return;
  }
  const wob = Math.sin(e.anim * 5) * 2;
  g.fillStyle = skin;
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  g.beginPath(); g.ellipse(0, 4, 12, 9 + wob * 0.4, 0, 0, TAU); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(0, -10, 15, 14, 0, 0, TAU); g.fill(); g.stroke();
  // drips
  g.fillStyle = '#7a1f12';
  g.beginPath();
  g.moveTo(-8, 0); g.quadraticCurveTo(-7, 8, -9, 12); g.quadraticCurveTo(-11, 7, -11, 1);
  g.closePath(); g.fill();
  g.fillStyle = '#2a0b06';
  g.beginPath();
  g.ellipse(-6, -12, 3.5, 5, 0, 0, TAU);
  g.ellipse(6, -12, 3.5, 5, 0, 0, TAU);
  g.fill();
  g.fillStyle = '#4a0d08';
  g.beginPath(); g.ellipse(0, -2, 5, 4, 0, 0, TAU); g.fill();
  g.restore();
}

// Knight: armored helmet facing the player, shield reads as the hard side
function drawKnight(g, e) {
  g.save();
  g.translate(e.x, e.y);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(0, 20, 17, 7, 0, 0, TAU); g.fill();
  const face = Math.atan2(e.faceY || 1, e.faceX || 0);
  // body
  const skin = e.flash > 0 ? '#fff' : '#8f96a3';
  g.fillStyle = skin;
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  g.beginPath(); g.ellipse(0, 2, 13, 12, 0, 0, TAU); g.fill(); g.stroke();
  // helmet head
  g.fillStyle = e.flash > 0 ? '#fff' : '#aeb6c4';
  g.beginPath(); g.ellipse(0, -12, 15, 14, 0, 0, TAU); g.fill(); g.stroke();
  // visor slit rotated toward facing
  g.save();
  g.translate(0, -12);
  g.rotate(face);
  g.fillStyle = '#17110c';
  g.fillRect(4, -6, 7, 12);
  g.fillStyle = '#c9231a';
  g.fillRect(6, -3, 3.5, 6);
  // frontal shield plate
  g.strokeStyle = '#d8dde6';
  g.lineWidth = 5;
  g.beginPath(); g.arc(0, 0, 18, -0.85, 0.85); g.stroke();
  g.strokeStyle = PAL.outline;
  g.lineWidth = 1.5;
  g.beginPath(); g.arc(0, 0, 20.5, -0.85, 0.85); g.stroke();
  g.restore();
  // plume
  g.fillStyle = '#c9231a';
  g.beginPath(); g.ellipse(0, -27, 4, 6 + Math.sin(e.anim * 4) * 1.5, 0, 0, TAU); g.fill();
  g.restore();
}

// Vis: pale slug with one huge eye that burns purple while charging
function drawVis(g, e) {
  g.save();
  g.translate(e.x, e.y);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(0, 18, 18, 7, 0, 0, TAU); g.fill();
  const skin = e.flash > 0 ? '#fff' : '#cbb8d8';
  g.fillStyle = skin;
  g.strokeStyle = PAL.outline;
  g.lineWidth = 4;
  const sq = e.charging > 0 ? Math.sin(e.anim * 18) * 0.04 : 0;
  g.save();
  g.scale(1 + sq, 1 - sq);
  g.beginPath(); g.ellipse(0, 0, 17, 15, 0, 0, TAU); g.fill(); g.stroke();
  g.restore();
  // folds
  g.strokeStyle = 'rgba(80,60,90,0.4)';
  g.lineWidth = 3;
  g.beginPath(); g.arc(0, 6, 11, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  // the eye: purple glow ramps up while a laser charges
  const chg = clamp((e.charging || 0) / 1.35, 0, 1);
  g.fillStyle = '#f5efe4';
  g.beginPath(); g.arc(0, -3, 8, 0, TAU); g.fill();
  g.strokeStyle = PAL.outline; g.lineWidth = 2.5; g.stroke();
  g.fillStyle = chg > 0 ? '#a85ceb' : '#2a2030';
  g.beginPath(); g.arc(0, -3, 3.5 + chg * 2.5, 0, TAU); g.fill();
  if (chg > 0) {
    g.globalAlpha = 0.35 + 0.3 * Math.abs(Math.sin(e.anim * 16));
    g.fillStyle = '#b06cf0';
    g.beginPath(); g.arc(0, -3, 11 + chg * 5, 0, TAU); g.fill();
    g.globalAlpha = 1;
  }
  g.restore();
}

// enemy lasers are purple on purpose: the player's Brimstone beam is red,
// so hostile beams must never read as the player's own shot
const ENEMY_LASER = {
  bright: 'rgba(196,130,255,0.95)',
  fade: 'rgba(90,40,150,0.12)',
  core: 'rgba(240,225,255,0.9)',
  glow: '#5b2a8e',
  warn: 'rgba(168,92,235,',
};

// hitscan beam: hot core with a soft glow, fades over its short life
function drawBeam(g, b) {
  const a = clamp(b.life / b.maxLife, 0, 1);
  g.save();
  g.translate(b.x, b.y);
  g.rotate(b.angle);
  // Godhead trail: a faint smouldering band left where the beam passed
  if (b.trail) {
    const flick = 0.5 + 0.5 * Math.abs(Math.sin(b.life * 26));
    g.globalAlpha = a * 0.35 * flick;
    g.fillStyle = '#f0b23c';
    g.fillRect(0, -b.w * 0.4, b.len, b.w * 0.8);
    g.globalAlpha = a * 0.25;
    g.fillStyle = '#8e1b12';
    g.fillRect(0, -b.w * 0.2, b.len, b.w * 0.4);
    g.restore();
    return;
  }
  g.globalAlpha = a;
  const w = b.w * (0.7 + a * 0.3);
  const grad = g.createLinearGradient(0, 0, b.len, 0);
  if (b.friendly && b.crit) {
    // crit beams flash gold, matching the golden crit tears
    grad.addColorStop(0, 'rgba(255,222,120,0.95)');
    grad.addColorStop(1, 'rgba(180,120,20,0.15)');
  } else if (b.friendly) {
    grad.addColorStop(0, 'rgba(255,120,110,0.95)');
    grad.addColorStop(1, 'rgba(140,20,14,0.15)');
  } else {
    grad.addColorStop(0, ENEMY_LASER.bright);
    grad.addColorStop(1, ENEMY_LASER.fade);
  }
  g.fillStyle = grad;
  g.fillRect(0, -w / 2, b.len, w);
  g.fillStyle = b.friendly ? (b.crit ? 'rgba(255,250,220,0.95)' : 'rgba(255,240,230,0.9)') : ENEMY_LASER.core;
  g.fillRect(0, -w * 0.18, b.len, w * 0.36);
  g.globalAlpha = a * 0.5;
  g.fillStyle = b.friendly ? (b.crit ? '#8a6a10' : '#5c0f09') : ENEMY_LASER.glow;
  g.beginPath(); g.arc(0, 0, w * 0.9, 0, TAU); g.fill();
  g.restore();
}

// sustained enemy laser: dashed warning line while warming, then a fat
// pulsing purple beam that stays on screen and sweeps
function drawLaser(g, l) {
  g.save();
  g.translate(l.x, l.y);
  g.rotate(l.angle);
  if (l.warm > 0) {
    g.setLineDash([12, 9]);
    g.strokeStyle = ENEMY_LASER.warn + (0.35 + 0.4 * Math.abs(Math.sin(l.anim * 14))) + ')';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(l.len, 0); g.stroke();
    g.setLineDash([]);
  } else {
    const w = l.w * (0.85 + 0.15 * Math.sin(l.anim * 22));
    const grad = g.createLinearGradient(0, 0, l.len, 0);
    grad.addColorStop(0, ENEMY_LASER.bright);
    grad.addColorStop(1, 'rgba(110,50,180,0.35)');
    g.fillStyle = grad;
    g.fillRect(0, -w / 2, l.len, w);
    g.fillStyle = ENEMY_LASER.core;
    g.fillRect(0, -w * 0.2, l.len, w * 0.4);
    // muzzle glow
    g.globalAlpha = 0.6;
    g.fillStyle = ENEMY_LASER.glow;
    g.beginPath(); g.arc(0, 0, w * 1.1, 0, TAU); g.fill();
  }
  g.restore();
}

// orbiting tear
function drawOrbital(g, o) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.beginPath(); g.ellipse(o.x, o.y + 12, 7, 3, 0, 0, TAU); g.fill();
  g.fillStyle = '#dcecfb';
  g.strokeStyle = '#8fb2d6';
  g.lineWidth = 2.5;
  g.beginPath(); g.arc(o.x, o.y, 8, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.arc(o.x - 2.5, o.y - 2.5, 2.5, 0, TAU); g.fill();
  g.restore();
}

// little friend: a floating baby head that spits tears
function drawFamiliar(g, f) {
  const bob = Math.sin(f.anim * 3) * 3;
  g.save();
  g.translate(f.x, f.y + bob);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.ellipse(0, 16 - bob, 10, 4, 0, 0, TAU); g.fill();
  g.fillStyle = '#f7f3e9';
  g.strokeStyle = PAL.outline;
  g.lineWidth = 3.5;
  g.beginPath(); g.ellipse(0, 0, 12, 11, 0, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = '#17110c';
  g.beginPath();
  g.ellipse(-4, -2, 2, 2.8, 0, 0, TAU);
  g.ellipse(4, -2, 2, 2.8, 0, 0, TAU);
  g.fill();
  g.strokeStyle = PAL.outline;
  g.lineWidth = 2;
  g.beginPath(); g.arc(0, 4, 4, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  g.restore();
}

