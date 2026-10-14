// Procedural 3D models of the lab devices. Each builder returns
//   { group, update(rt, ctx) → changed?, controls: [mesh], screen?, dispose() }
// in the device-local frame of devices/defs.js (mm, origin bottom-centre-back, +z = front).
import {
  THREE, MAT, FLIP, mat, ledMat, setLed, canvasTexture, decal, rbox, box, cyl, M4, alongDir, Builder, addScrew, addSocket,
  glowSprite, labelSprite, txt, rrect, deltaLogo, offsetMat, FONT, FONT_D, FONT_M,
} from './kit.js';
import { DEVICE_DEFS, PLC_MODELS, PLC_GEO, plcTermX, plcTermLabel, devicePorts, deviceProps } from '../devices/defs.js';
import { drawSegDisplay } from './sevenseg.js';
import { MODBUS_BUILDERS } from './models-modbus.js';

const LAMP_COLORS = { green: '#22e06a', red: '#ff3434', yellow: '#ffb020', blue: '#3b8bff', white: '#f4f7ff' };
const CAP_COLORS = { green: '#1fa34a', red: '#d62828', yellow: '#f2b705', blue: '#1f5fd6', black: '#1b1d22', white: '#e9ecef' };
const SOCK_BY_PORT = { '13': '#d62828', '11': '#d62828', '14': '#1b1d22', '12': '#1b1d22', X1: '#d62828', X2: '#1b1d22', '+': '#d62828', '-': '#1b1d22', BN: '#7a4a24', BU: '#2563eb', BK: '#1b1d22', '21': '#d62828', '22': '#1b1d22', '23': '#d62828', '24': '#1b1d22', '1': '#d62828', '2': '#f2b705', '3': '#1b1d22' };

function control(mesh, devId, action, extra = {}) {
  mesh.userData.control = { devId, action, ...extra };
  return mesh;
}

/** Per-terminal labels drawn on a strip; xs are port x positions (mm, local). */
function labelStrip(w, h, items, { bg = null, color = '#f1f5f9', size = 2.5, font = FONT } = {}) {
  return decal(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    for (const it of items) txt(g, it.label, it.x + w / 2, h / 2, { size: it.size || size, color: it.color || color, weight: 700, font });
  }, { ppm: 14 });
}

// ====================================================================== PLC (DVP-ES2 / EX2)
// Drawn after the real units: black housing, grey removable terminal blocks top and bottom with the
// wire holes and the terminal names on the black shoulders, the STOP/RUN slide switch and the round
// COM1 (mini-DIN) on the left, DELTA + model + I/O spec, the POWER … COM3 LEDs, the IN / OUT LED
// grid and the R (relay) / T (transistor) badge.
function buildPlc(dev) {
  const m = PLC_MODELS[dev.type];
  const G = PLC_GEO;
  const w = m.w;
  const group = new THREE.Group();
  const B = new Builder();
  const body = mat('plcBlack', { color: 0x1e2024, roughness: 0.55 });
  const face = mat('plcFace', { color: 0x16181b, roughness: 0.45 });
  const grey = mat('plcTermGrey', { color: 0xa9adb1, roughness: 0.6 });
  B.add(rbox(w, G.h, 40, 3), body, M4(0, G.h / 2, 20));
  B.add(rbox(w - 1, 15, 32, 2), body, M4(0, 92, G.face - 16));
  B.add(rbox(w - 1, 15, 32, 2), body, M4(0, 18, G.face - 16));
  B.add(rbox(w - 2, 57.5, 30, 3), face, M4(0, 55, G.d - 15));
  // grey terminal blocks with the clamp screws (they stand a little proud of the housing)
  B.add(rbox(w - 5, 12, 26, 1.5), grey, M4(0, 104.6, 49));
  B.add(rbox(w - 5, 12, 26, 1.5), grey, M4(0, 5.4, 49));
  for (const [list, y, dz] of [[m.top, 105.4, 0.6], [m.bottom, 4.6, -0.6]]) {
    list.forEach((id, i) => addScrew(B, [plcTermX(m, list.length, i), y, 62.2], norm3([0, dz, 1]), Math.min(2.2, ((w - 8) / list.length) * 0.36)));
  }
  B.add(box(30, 10, 16), MAT.darkPlastic, M4(0, -1, 18)); // DIN clip
  // COM1 (8-pin mini-DIN) and the mini-USB under it
  const cx = G.colX(m);
  B.add(cyl(6.4, 6.4, 1.2, 32), mat('plcRing', { color: 0x2b2e33, roughness: 0.4 }), M4(cx, G.com1Y, G.d + 0.3, Math.PI / 2));
  B.add(cyl(5, 5, 1.2, 32), MAT.blackPlastic, M4(cx, G.com1Y, G.d + 0.6, Math.PI / 2));
  for (let k = 0; k < 8; k++) { const a = (k / 7) * Math.PI * 1.5 + Math.PI * 0.75; B.add(cyl(0.38, 0.38, 0.6, 6), MAT.steel, M4(cx + Math.cos(a) * 2.6 * (k === 7 ? 0 : 1), G.com1Y + Math.sin(a) * 2.6 * (k === 7 ? 0 : 1), G.d + 1.1, Math.PI / 2)); }
  B.add(box(7.4, 3.2, 1.6), MAT.steel, M4(cx, G.usbY, G.d + 0.4));
  B.add(box(5.6, 1.2, 0.6), MAT.blackPlastic, M4(cx, G.usbY, G.d + 1.3));
  // STOP / RUN slide switch recess
  B.add(rbox(11, 6.4, 1.2, 3), MAT.blackPlastic, M4(cx, G.swY, G.d + 0.2));
  B.build(group);

  // shoulders: wire holes, terminal names and the bracket captions
  const shoulder = (list, groups, top) => decal(w, 15, (g, W) => {
    const n = list.length, X = (i) => plcTermX(m, n, i) + W / 2;
    const yHole = top ? 4 : 11, yLbl = top ? 9.4 : 5.8, yCap = top ? 12.7 : 2.4;
    list.forEach((id, i) => {
      g.fillStyle = '#060708'; g.beginPath(); g.arc(X(i), yHole, Math.min(1.9, (W - 8) / n * 0.34), 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#3a3e45'; g.lineWidth = 0.25; g.stroke();
      const lbl = plcTermLabel(id);
      txt(g, lbl, X(i), yLbl, { size: lbl.length > 3 ? 1.55 : 1.9, weight: 700, color: '#e8eaed' });
    });
    for (const [i0, i1, t] of groups) {
      const x0 = X(i0) - 1.6, x1 = X(i1) + 1.6, yl = top ? yCap - 1.3 : yCap + 1.3;
      g.strokeStyle = '#c9cdd3'; g.lineWidth = 0.22;
      g.beginPath(); g.moveTo(x0, yl + (top ? -0.8 : 0.8)); g.lineTo(x0, yl); g.lineTo(x1, yl); g.lineTo(x1, yl + (top ? -0.8 : 0.8)); g.stroke();
      g.font = `800 1.45px ${FONT}`;
      const tw = g.measureText(t).width + 1.2, xm = (x0 + x1) / 2;
      g.fillStyle = '#d9dce0'; g.fillRect(xm - tw / 2, yl - 0.85, tw, 1.7);
      txt(g, t, xm, yl + 0.05, { size: 1.45, weight: 800, color: '#111317' });
    }
  }, { ppm: 16 });
  const st = shoulder(m.top, m.groups.top, true); st.position.set(0, 92, G.face + 0.05); group.add(st);
  const sb = shoulder(m.bottom, m.groups.bottom, false); sb.position.set(0, 18, G.face + 0.05); group.add(sb);

  // front print
  const wide = w > 120;
  const lp = wide ? 5.2 : 4.4;
  const gx0 = w / 2 - 7.5 - 7 * lp; // first LED column of the IN / OUT grid
  const sx = gx0 - 8.5; // POWER … COM3 LEDs
  const two = (n) => n > 8;
  const inRows = two(m.inputs) ? 2 : 1, outRows = two(m.outputs) ? 2 : 1;
  const yIn = 75, yOut = yIn - 6 - inRows * 7.6;
  const ledXY = (kind, i) => [gx0 + (i & 7) * lp, (kind === 'x' ? yIn : yOut) - 5.6 - (i >> 3) * 7.6];
  const front = decal(w - 3, 57, (g, W, H) => {
    const X = (x) => x + W / 2, Y = (y) => 55 + H / 2 - y;
    const lx = X(cx);
    txt(g, 'STOP', lx - 6.4, Y(G.swY), { size: wide ? 2.1 : 1.7, weight: 700, color: '#e3e5e8', align: 'right' });
    txt(g, 'RUN', lx + 6.4, Y(G.swY), { size: wide ? 2.1 : 1.7, weight: 700, color: '#e3e5e8', align: 'left' });
    txt(g, 'COM1', lx, Y(G.com1Y - 9.2), { size: 2, weight: 700, color: '#e3e5e8' });
    txt(g, 'USB', lx, Y(G.usbY - 4.4), { size: 1.7, weight: 700, color: '#9aa1ab' });
    const tx = cx + (wide ? 15 : 12.5);
    deltaLogo(g, X(tx), Y(wide ? 69 : 70), wide ? 4.8 : 3.5, '#eef0f2');
    txt(g, m.short, X(tx), Y(wide ? 50 : 52), { size: wide ? 3.6 : 3, align: 'left', weight: 800, color: '#eef0f2', font: FONT_D });
    g.font = `700 ${wide ? 2.1 : 1.8}px ${FONT}`;
    const sw = g.measureText(m.spec).width + 1.6, sy = Y(wide ? 45.6 : 47.8);
    g.strokeStyle = '#e6e8eb'; g.lineWidth = 0.25; g.strokeRect(X(tx) - 0.2, sy - 1.5, sw, 3);
    g.beginPath(); g.moveTo(X(tx) - 0.2, sy + 1.5); g.lineTo(X(w / 2 - 6), sy + 1.5); g.stroke();
    txt(g, m.spec, X(tx) + 0.6, sy + 0.1, { size: wide ? 2.1 : 1.8, align: 'left', weight: 700, color: '#eef0f2' });
    ['POWER', 'RUN', 'ERROR', 'COM1', 'COM2', 'COM3'].forEach((t, i) => txt(g, t, X(sx - 2.2), Y(73 - i * 5.2), { size: wide ? 2 : 1.7, align: 'right', weight: 700, color: '#e3e5e8' }));
    const grid = (title, y0, n) => {
      txt(g, title, X(gx0 - 1.2), Y(y0 + 1.6), { size: 2.3, align: 'left', weight: 800, color: '#eef0f2' });
      for (let i = 0; i < n; i++) { const r = i >> 3; txt(g, String(r ? 10 + (i & 7) : i & 7), X(gx0 + (i & 7) * lp), Y(y0 - 2.2 - r * 7.6), { size: 1.85, weight: 700, color: '#e3e5e8' }); }
    };
    grid('IN', yIn, m.inputs);
    grid('OUT', yOut, m.outputs);
    // smoked LED window edge
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 0.4;
    g.beginPath(); g.moveTo(X(w / 2 - 3), Y(80)); g.quadraticCurveTo(X(w / 2 - 8), Y(55), X(w / 2 - 3), Y(30)); g.stroke();
    // R / T badge
    g.fillStyle = '#f4f5f6'; rrect(g, X(w / 2 - 9.5), Y(34.5), 5.4, 5.4, 0.5); g.fill();
    txt(g, m.badge, X(w / 2 - 6.8), Y(31.8), { size: 4, weight: 800, color: '#111' });
  }, { ppm: 14 });
  front.position.set(0, 55, G.d + 0.05);
  group.add(front);

  // LEDs
  const leds = { pow: ledMat('#36ff6a'), run: ledMat('#36ff6a'), err: ledMat('#ff3b30'), c1: ledMat('#ffb020'), c2: ledMat('#ffb020'), c3: ledMat('#ffb020'), x: [], y: [] };
  const ledGeo = rbox(2.2, 1.3, 0.8, 0.3);
  const addLed = (matl, x, y) => { const me = new THREE.Mesh(ledGeo, matl); me.position.set(x, y, G.d + 0.3); group.add(me); return me; };
  [leds.pow, leds.run, leds.err, leds.c1, leds.c2, leds.c3].forEach((lm, i) => addLed(lm, sx, 73 - i * 5.2));
  for (let i = 0; i < m.inputs; i++) { const lm = ledMat('#36ff6a'); leds.x.push(lm); addLed(lm, ...ledXY('x', i)); }
  for (let i = 0; i < m.outputs; i++) { const lm = ledMat('#36ff6a'); leds.y.push(lm); addLed(lm, ...ledXY('y', i)); }

  // STOP / RUN slider (interactive)
  const lever = new THREE.Mesh(rbox(4.2, 3.8, 2.2, 0.8), mat('plcSlider', { color: 0xc8352e, roughness: 0.5 }));
  lever.position.set(cx + 2.2, G.swY, G.d + 1.2);
  group.add(lever);
  const hit = control(new THREE.Mesh(box(16, 11, 8), new THREE.MeshBasicMaterial({ visible: false })), dev.id, 'toggle', { label: 'RUN / STOP switch' });
  hit.position.set(cx, G.swY, G.d + 3);
  group.add(hit);

  return {
    group, controls: [hit],
    update(rt, ctx) {
      const cpu = rt.cpu;
      let ch = false;
      const p = cpu.powered;
      const blink = Math.floor(ctx.t * 3) % 2;
      const fast = Math.floor(ctx.t * 8) % 2;
      ch = setLed(leds.pow, p) || ch;
      ch = setLed(leds.run, p && cpu.running) || ch;
      ch = setLed(leds.err, p && cpu.errorFlag && blink) || ch;
      ch = setLed(leds.c2, p && !!(rt.m2 && rt.m2.busy) && fast) || ch;
      for (let i = 0; i < leds.x.length; i++) ch = setLed(leds.x[i], p && cpu.X[i], 2) || ch;
      for (let i = 0; i < leds.y.length; i++) ch = setLed(leds.y[i], p && cpu.Y[i], 2) || ch;
      const x = cx + (rt.dev.state.run !== false ? 2.2 : -2.2);
      if (lever.position.x !== x) { lever.position.x = x; ch = true; }
      return ch;
    },
  };
}
function norm3(v) { const l = Math.hypot(...v); return v.map((x) => x / l); }

// ====================================================================== HMI (DOP-107BV)
function buildHmi(dev, ctx) {
  const group = new THREE.Group();
  const B = new Builder();
  B.add(rbox(192, 138, 34, 7), MAT.charcoal, M4(0, 73, 17));
  B.add(rbox(200, 146, 10, 5), mat('hmiBezel', { color: 0x1a1d22, roughness: 0.35, metalness: 0.1 }), M4(0, 73, 41));
  // bottom connectors
  B.add(box(30, 2, 12), MAT.steel, M4(-14, -0.6, 22));
  B.add(box(22, 1.2, 7), MAT.blackPlastic, M4(-14, -1.5, 22));
  B.add(box(30, 2, 12), MAT.steel, M4(28, -0.6, 22));
  B.add(box(22, 1.2, 7), MAT.blackPlastic, M4(28, -1.5, 22));
  B.add(box(30, 6, 12), MAT.greenPlug, M4(-64, -2.4, 22));
  B.add(box(14, 2, 7), MAT.steel, M4(70, -0.6, 22));
  for (const p of devicePorts(dev)) if (p.kind === 'term') addScrew(B, [p.pos[0], -5.4, p.pos[2]], p.dir, 1.7);
  B.build(group);
  // screen
  const screenTex = ctx.hmiTexture;
  const scrMat = offsetMat(new THREE.MeshStandardMaterial({ color: 0x030405, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 0, roughness: 0.18, metalness: 0.0 }), 2);
  scrMat.toneMapped = false;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(154, 92.4), scrMat);
  screen.position.set(0, 80, 46.9);
  control(screen, dev.id, 'hmi', { label: 'HMI touch screen' });
  group.add(screen);
  const print = decal(200, 146, (g, W, H) => {
    deltaLogo(g, 12, H - 13, 6, '#e8eef9');
    txt(g, 'DOP-107BV', W - 26, H - 13, { size: 3.2, align: 'right', weight: 700, color: '#9aa6b8', font: FONT_D });
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 0.6;
    rrect(g, 21.5, 146 - 80 - 47.7, 157, 95.4, 1.5); g.stroke();
  }, { ppm: 8 });
  print.position.set(0, 73, 46.4);
  group.add(print);
  const back = decal(120, 40, (g, W, H) => {
    g.fillStyle = '#e5e7eb'; rrect(g, 0, 0, W, H, 3); g.fill();
    deltaLogo(g, 6, 9, 5, '#1d4f9c');
    txt(g, 'HMI  DOP-107BV   24 V DC  ·  7" 800×480 TFT', 6, 21, { size: 3, align: 'left', weight: 700, color: '#1f2937' });
    txt(g, 'COM1 RS-232 · COM2 RS-485/422 · USB', 6, 30, { size: 2.8, align: 'left', weight: 600, color: '#374151' });
  }, { ppm: 6 });
  back.position.set(0, 80, -0.2); back.rotation.y = Math.PI;
  group.add(back);
  const pled = ledMat('#36ff6a');
  const pl = new THREE.Mesh(cyl(1.4, 1.4, 1, 12), pled);
  pl.rotation.x = Math.PI / 2; pl.position.set(88, 12, 46.2);
  group.add(pl);
  const bottomLbl = decal(160, 10, (g) => {
    txt(g, '+  −  ⏚', 16, 5, { size: 3, color: '#cbd5e1' });
    txt(g, 'COM1', 66, 5, { size: 3, color: '#cbd5e1' });
    txt(g, 'COM2', 108, 5, { size: 3, color: '#cbd5e1' });
    txt(g, 'USB', 150, 5, { size: 3, color: '#cbd5e1' });
  }, { ppm: 8 });
  bottomLbl.rotation.x = Math.PI / 2; bottomLbl.position.set(0, -0.1, 36);
  group.add(bottomLbl);
  return {
    group, controls: [screen], screen,
    update(rt) {
      const on = rt.hmi.powered;
      let ch = setLed(pled, on, 1.6);
      const k = on ? 1 : 0;
      if (scrMat.emissiveIntensity !== k) { scrMat.emissiveIntensity = k; ch = true; }
      return ch;
    },
  };
}

// ====================================================================== VFD (MS300)
// Front of a real MS300 (frame A): the KPMS-LE01 style keypad on top — DELTA logo, RUN / FWD / REV
// LEDs left of the 5-digit display, STOP / PLC right of it, the speed dial in the corner, then
// RUN (green), ▲, MODE / STOP-RESET (red), ◀/▼, ENTER (blue) — and below it the cover with the
// DELTA MS300 print, the warning label and the NET1 / NET2 LEDs.
const VFD_KEYS = [
  { k: 'RUN', x: -26, y: 147, label: 'RUN', color: '#1f9d69', text: '#f1fff8' },
  { k: 'UP', x: 0, y: 147, label: '▲', color: '#c9ccd2', text: '#15171b' },
  { k: 'MODE', x: 26, y: 147, label: 'MODE', color: '#c9ccd2', text: '#15171b' },
  { k: 'STOP', x: -26, y: 134.5, label: 'STOP\nRESET', color: '#e0383e', text: '#fff4f4' },
  { k: 'LD', x: 0, y: 134.5, label: '</▼', color: '#c9ccd2', text: '#15171b' },
  { k: 'ENTER', x: 26, y: 134.5, label: 'ENTER', color: '#1597d6', text: '#f2fbff' },
];
const VFD_KNOB = { x: 33, y: 168.5, r: 7.2 };

function buildVfd(dev) {
  const group = new THREE.Group();
  const B = new Builder();
  const body = mat('vfdBody', { color: 0x3b3e44, roughness: 0.62 });
  const cover = mat('vfdCover', { color: 0x4a4d53, roughness: 0.58 });
  const bezel = mat('vfdBezel', { color: 0x2c2f34, roughness: 0.5 });
  B.add(rbox(100, 190, 128, 4), body, M4(0, 95, 64));
  for (let i = 0; i < 9; i++) {
    const z = 14 + i * 7;
    B.add(box(3, 168, 1.6), MAT.alu, M4(-51.2, 95, z));
    B.add(box(3, 168, 1.6), MAT.alu, M4(51.2, 95, z));
  }
  // lower front cover (logo band) and the keypad housing above it
  B.add(rbox(94, 30, 6, 2), cover, M4(0, 110, 129));
  B.add(rbox(94, 66, 18, 3.5), bezel, M4(0, 157, 136));
  B.add(rbox(88, 60, 2, 2.5), MAT.blackPlastic, M4(0, 157.5, 145.2));
  // terminal windows
  B.add(rbox(92, 28, 9, 1.5), MAT.blackPlastic, M4(0, 79.5, 132));
  B.add(rbox(92, 18, 10, 1.5), MAT.blackPlastic, M4(0, 22, 133));
  // RJ45 jack
  B.add(box(15, 13, 9), MAT.blackPlastic, M4(26, 54, 132.5));
  B.add(box(11, 8, 2), mat('rjHole', { color: 0x050506, roughness: 0.9 }), M4(26, 53, 136.2));
  B.add(box(9, 0.8, 1), MAT.gold, M4(26, 56.2, 136.6));
  // display window
  B.add(rbox(44, 17, 1.2, 1.2), mat('vfdWin', { color: 0x0d0505, roughness: 0.15 }), M4(-9, 168.5, 146.4));
  for (const p of devicePorts(dev)) if (p.kind === 'term') addScrew(B, p.pos, p.dir, p.pos[1] < 40 ? 2.6 : 1.8);
  B.build(group);
  // keypad print (black face, z 146.2)
  const kp = decal(88, 60, (g, W, H) => {
    const X = (x) => x + W / 2, Y = (y) => 187.5 - y;
    deltaLogo(g, X(-36), Y(182), 4.4, '#f1f4f8');
    for (const [t, y] of [['RUN', 174.3], ['FWD', 168.6], ['REV', 162.9]]) txt(g, t, X(-37.6), Y(y), { size: 2.5, weight: 800, color: '#d5dae2', align: 'left', font: FONT_D });
    for (const [t, y] of [['STOP', 174.3], ['PLC', 168.6]]) txt(g, t, X(14.4), Y(y), { size: 2.5, weight: 800, color: '#d5dae2', align: 'left', font: FONT_D });
    // dial scale: a white arc that grows clockwise
    g.save(); g.translate(X(VFD_KNOB.x), Y(VFD_KNOB.y));
    g.strokeStyle = '#eef1f5'; g.lineCap = 'butt';
    for (let i = 0; i < 9; i++) {
      const a0 = (-128 + i * 30) * Math.PI / 180 - Math.PI / 2;
      g.lineWidth = 0.5 + i * 0.18;
      g.beginPath(); g.arc(0, 0, VFD_KNOB.r + 1.9 + i * 0.04, a0, a0 + 0.36); g.stroke();
    }
    g.fillStyle = '#eef1f5'; g.beginPath(); g.arc(-VFD_KNOB.r * 0.95, VFD_KNOB.r * 1.05, 0.55, 0, Math.PI * 2); g.fill();
    g.restore();
  }, { ppm: 12 });
  kp.position.set(0, 157.5, 146.25);
  group.add(kp);
  // cover print: logo + MS300, warning label, NET1 / NET2
  const band = decal(94, 30, (g, W) => {
    deltaLogo(g, W / 2 + 1, 9.5, 6.4, '#e7eaee', 'center');
    txt(g, 'MS300', W / 2, 21, { size: 6.6, weight: 800, color: '#e7eaee', font: FONT_D });
  }, { ppm: 10 });
  band.position.set(0, 110, 132.06);
  group.add(band);
  const lower = decal(96, 30, (g) => {
    const warnTri = (x, y, s, mark) => {
      g.fillStyle = '#f5d000'; g.strokeStyle = '#111'; g.lineWidth = 0.35;
      g.beginPath(); g.moveTo(x, y - s * 0.55); g.lineTo(x + s * 0.55, y + s * 0.42); g.lineTo(x - s * 0.55, y + s * 0.42); g.closePath(); g.fill(); g.stroke();
      txt(g, mark, x, y + s * 0.08, { size: s * 0.62, weight: 900, color: '#111' });
    };
    warnTri(10, 6.2, 6, 'ϟ'); warnTri(50, 6.2, 6, '!');
    txt(g, 'WARNING', 30, 6.6, { size: 3.6, weight: 900, color: '#e7eaee', font: FONT_D });
    const lines = ['• Read the user manual before operation.', '• Risk of electrical shock. Wait 10 minutes', '  after removing power before servicing.', '• Do not connect AC power to output', '  terminals U/T1, V/T2 and W/T3.'];
    lines.forEach((l, i) => txt(g, l, 5, 12.5 + i * 3.4, { size: 2.25, weight: 600, color: '#d7dbe1', align: 'left' }));
    txt(g, 'RS-485', 74, 27.5, { size: 2.3, weight: 800, color: '#cbd5e1' });
    txt(g, 'NET1', 89, 13.6, { size: 2.1, weight: 800, color: '#d7dbe1' });
    txt(g, 'NET2', 89, 23.6, { size: 2.1, weight: 800, color: '#d7dbe1' });
  }, { ppm: 10 });
  lower.position.set(0, 50, 128.06);
  group.add(lower);
  const ports = devicePorts(dev);
  const ctrl1 = ports.filter((p) => p.pos[1] === 88), ctrl2 = ports.filter((p) => p.pos[1] === 72), pw = ports.filter((p) => p.pos[1] === 22);
  const l1 = labelStrip(92, 4, ctrl1.map((p) => ({ x: p.pos[0], label: p.label, size: 2.4 }))); l1.position.set(0, 83.6, 136.6); group.add(l1);
  const l2 = labelStrip(92, 4, ctrl2.map((p) => ({ x: p.pos[0], label: p.label, size: 2.1 }))); l2.position.set(0, 67.4, 136.6); group.add(l2);
  const l3 = labelStrip(96, 6, pw.map((p) => ({ x: p.pos[0], label: p.label, size: 2.8 })), { color: '#e2e8f0' }); l3.position.set(0, 8.5, 128.2); group.add(l3);
  // NET1 / NET2 LED windows
  for (const y of [55.4, 45.4]) { const n = new THREE.Mesh(rbox(9, 4.6, 1.2, 0.6), mat('vfdNet', { color: 0x1a1c20, roughness: 0.2 })); n.position.set(41, y, 128.6); group.add(n); }
  // 5-digit display
  const dispTex = canvasTexture(320, 112, () => {}, { mip: false });
  const dm = offsetMat(new THREE.MeshStandardMaterial({ color: 0x120404, emissive: 0xffffff, emissiveMap: dispTex, emissiveIntensity: 1, roughness: 0.2 }), 2);
  dm.toneMapped = false;
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(41, 14.4), dm);
  disp.position.set(-9, 168.5, 147.1);
  group.add(disp);
  // status LEDs
  const sl = {};
  const LEDS = [['RUN', -40.2, 174.3, '#36ff6a'], ['FWD', -40.2, 168.6, '#36ff6a'], ['REV', -40.2, 162.9, '#36ff6a'], ['STOP', 22.6, 174.3, '#ff3b30'], ['PLC', 22.6, 168.6, '#36ff6a']];
  for (const [k, x, y, c] of LEDS) {
    sl[k] = ledMat(c);
    const me = new THREE.Mesh(rbox(2.2, 1.6, 0.8, 0.4), sl[k]);
    me.position.set(x, y, 146.6);
    group.add(me);
  }
  // keys
  const controls = [];
  const keyMeshes = {};
  for (const k of VFD_KEYS) {
    const kmat = mat('vfdKey' + k.k, { color: k.color, roughness: 0.32 });
    const mesh = new THREE.Mesh(rbox(19, 10.4, 3, 1.6), kmat);
    mesh.position.set(k.x, k.y, 147.4);
    const lbl = decal(17, 8.4, (g, W, H) => {
      const two = k.label.split('\n');
      if (two.length > 1) two.forEach((t, i) => txt(g, t, W / 2, H / 2 + (i - 0.5) * 3.3, { size: 3, weight: 800, color: k.text, font: FONT_D }));
      else txt(g, k.label, W / 2, H / 2 + 0.2, { size: k.label.length > 3 ? 3.6 : k.label.length > 1 ? 3.8 : 5.4, weight: 800, color: k.text, font: FONT_D });
    }, { ppm: 14 });
    lbl.position.z = 1.55;
    mesh.add(lbl);
    control(mesh, dev.id, 'vfdKey', { key: k.k, label: k.k === 'LD' ? '◀/▼ (tap ▼ · hold ◀)' : k.label.replace('\n', '/') });
    controls.push(mesh);
    keyMeshes[k.k] = mesh;
    group.add(mesh);
  }
  // speed dial
  const knob = new THREE.Group();
  const kb = new THREE.Mesh(cyl(VFD_KNOB.r, VFD_KNOB.r + 0.4, 6, 36), mat('vfdKnob', { color: 0x2a2c30, roughness: 0.55 }));
  kb.rotation.x = Math.PI / 2; kb.position.z = 3;
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; const r = new THREE.Mesh(box(0.6, 0.8, 5.4), MAT.blackPlastic); r.position.set(Math.cos(a) * VFD_KNOB.r, Math.sin(a) * VFD_KNOB.r, 3); r.rotation.z = a; knob.add(r); }
  const mark = new THREE.Mesh(box(1, VFD_KNOB.r * 0.95, 0.5), mat('vfdKnobMark', { color: 0x9aa0a8, roughness: 0.4 }));
  mark.position.set(0, VFD_KNOB.r * 0.4, 6.1);
  knob.add(kb, mark);
  knob.position.set(VFD_KNOB.x, VFD_KNOB.y, 146.2);
  group.add(knob);
  const hit = control(new THREE.Mesh(cyl(VFD_KNOB.r + 3, VFD_KNOB.r + 3, 10, 16), new THREE.MeshBasicMaterial({ visible: false })), dev.id, 'vfdKnob', { label: 'Speed dial (Pr.00-20 = 7)' });
  hit.rotation.x = Math.PI / 2; hit.position.set(VFD_KNOB.x, VFD_KNOB.y, 150);
  group.add(hit);
  controls.push(hit);
  let last = '';
  return {
    group, controls,
    press(key) { const me = keyMeshes[key === 'DOWN' || key === 'LEFT' ? 'LD' : key]; if (me) { me.position.z = 146.4; me.userData.upAt = performance.now() + 140; } },
    update(rt, ctx) {
      const v = rt.vfd;
      let ch = false;
      for (const me of Object.values(keyMeshes)) if (me.userData.upAt && performance.now() > me.userData.upAt) { me.position.z = 147.4; me.userData.upAt = 0; ch = true; }
      const a = -(-135 + 270 * Math.max(0, Math.min(1, rt.dev.state.knob ?? 0))) * Math.PI / 180;
      if (knob.rotation.z !== a) { knob.rotation.z = a; ch = true; }
      const d = v.display(ctx.t);
      for (const k of Object.keys(sl)) ch = setLed(sl[k], !!d.leds[k], 2) || ch;
      const blink = Math.floor(ctx.t * 3) % 2 === 0;
      const key = (d.off ? 'off' : d.text) + '|' + d.cursor + '|' + (d.cursor >= 0 ? blink : '');
      if (key !== last) {
        last = key;
        const c = dispTex.userData.canvas;
        const g = c.getContext('2d');
        g.fillStyle = '#0b0303';
        g.fillRect(0, 0, c.width, c.height);
        if (!d.off) drawSegDisplay(g, c.width, c.height, d.text, { n: 5, cursor: d.cursor ?? -1, blink });
        dispTex.needsUpdate = true;
        ch = true;
      }
      return ch;
    },
  };
}

// ====================================================================== 24 V power supply
function buildPsu(dev) {
  const group = new THREE.Group();
  const B = new Builder();
  const shell = mat('psuShell', { color: 0xc9ced6, roughness: 0.42, metalness: 0.45 });
  B.add(rbox(50, 125, 96, 3), shell, M4(0, 62.5, 48));
  B.add(rbox(48, 82, 10, 2.5), mat('psuFront', { color: 0xe4e7eb, roughness: 0.5 }), M4(0, 63, 99));
  B.add(rbox(46, 20, 12, 1.5), MAT.termBlock, M4(0, 114, 94.5));
  B.add(rbox(46, 20, 12, 1.5), MAT.termBlock, M4(0, 11, 94.5));
  // the potentiometer (V.adj): a steel knob with a screwdriver slot, in a small recess
  B.add(cyl(4.4, 4.4, 1, 24), mat('psuWell', { color: 0x9ca3ad, roughness: 0.5 }), M4(14, 80, 104.3, Math.PI / 2));
  B.add(cyl(3, 3, 2, 24), MAT.steel, M4(14, 80, 105, Math.PI / 2));
  B.add(box(5.2, 0.9, 0.8), MAT.slot, M4(14, 80, 106.2, 0, 0, 0.5));
  // cooling slots down both sides of the front, like the real unit
  for (const sx of [-1, 1]) for (const dx of [19.3, 21.7]) B.add(box(0.9, 26, 0.7), mat('psuVent', { color: 0x4b5563, roughness: 0.7 }), M4(sx * dx, 58, 104.2));
  B.add(box(30, 10, 14), MAT.darkPlastic, M4(0, -2, 20));
  for (const p of devicePorts(dev)) addScrew(B, p.pos, p.dir, 2.2);
  B.build(group);
  const front = decal(46, 80, (g, W, H) => {
    deltaLogo(g, W / 2, 7, 5.4, '#1d4f9c', 'center');
    txt(g, 'CliQ', W / 2, 14.5, { size: 3.4, weight: 800, color: '#64748b', font: FONT_D });
    // LED (left) and V.adj (right) share one row; their captions sit under them, clear of both
    txt(g, 'DC OK', 11, 32, { size: 2.5, weight: 800, color: '#374151' });
    txt(g, 'V.adj', 37, 32, { size: 2.5, weight: 700, color: '#374151' });
    g.strokeStyle = '#6b7280'; g.lineWidth = 0.28; g.beginPath(); g.arc(37, 23, 5.6, Math.PI * 0.85, Math.PI * 2.15); g.stroke();
    txt(g, '−', 31.2, 27.6, { size: 2.4, weight: 800, color: '#6b7280' }); txt(g, '+', 42.8, 27.6, { size: 2.4, weight: 800, color: '#6b7280' });
    g.strokeStyle = '#c3c9d1'; g.lineWidth = 0.3; rrect(g, 6, 38, W - 12, 24, 1.6); g.stroke();
    txt(g, '24 V', W / 2, 47, { size: 8, weight: 800, color: '#111827', font: FONT_D });
    txt(g, '2.5 A · 60 W', W / 2, 56, { size: 3, weight: 700, color: '#4b5563' });
    txt(g, 'DRP024V060W1AZ', W / 2, 69, { size: 2.6, weight: 700, color: '#6b7280' });
  }, { ppm: 12 });
  front.position.set(0, 63, 104.06);
  group.add(front);
  const top = labelStrip(46, 4, [{ x: -15, label: 'L' }, { x: 0, label: 'N' }, { x: 15, label: '⏚' }], { size: 2.8 });
  top.position.set(0, 120.2, 100.7); group.add(top);
  const bot = labelStrip(46, 4, [{ x: -18, label: '+V' }, { x: -6, label: '+V' }, { x: 6, label: '−V' }, { x: 18, label: '−V' }], { size: 2.6 });
  bot.position.set(0, 4.6, 100.7); group.add(bot);
  const okLed = ledMat('#36ff6a');
  const l = new THREE.Mesh(cyl(1.7, 1.7, 1, 14), okLed);
  l.rotation.x = Math.PI / 2; l.position.set(-12, 80, 104.4);
  group.add(l);
  return {
    group, controls: [],
    update(rt) { return setLed(okLed, rt.powered && !rt.short, 2.2); },
  };
}

// ====================================================================== MCB + mains
/**
 * A DIN-rail miniature circuit breaker: white housing with a stepped front, dark recessed screw wells, the toggle
 * on a dark pivot plate with a red / green ON-OFF window, and the rating printed between the screws and the toggle.
 * opts: { W, cx, rating, volt, tag, poleLabels, pe, extraScrews }
 */
function breakerModel(dev, o) {
  const { W, cx } = o;
  const group = new THREE.Group();
  const B = new Builder();
  const body = mat('mcbBody', { color: 0xeceeec, roughness: 0.5 });
  const step = mat('mcbStep', { color: 0xe0e3e5, roughness: 0.5 });
  const well = mat('mcbWell', { color: 0x30343a, roughness: 0.7 });
  B.add(rbox(W, 90, 64, 2.5), body, M4(cx, 45, 32));
  B.add(rbox(W - 4, 38, 8, 2), step, M4(cx, 41, 67));
  B.add(rbox(W - 9, 30, 2.4, 1.2), well, M4(cx, 40, 71.2)); // pivot plate
  B.add(box(Math.min(30, W - 4), 10, 14), MAT.darkPlastic, M4(cx, -2, 20));
  // the screws sit in dark wells so they look seated in the terminal cages
  if (!o.gland) B.add(box(W - 6, 8, 1.4), well, M4(cx, 82, 64.3));
  B.add(box(W - 6, 8, 1.4), well, M4(cx, 10, 64.3));
  if (o.gland) {
    // the mains cable comes in through a rubber gland on the top (the line side is under the cover): no screws show
    B.add(cyl(6.6, 6.6, 2.4, 24), mat('glandNut', { color: 0x2b2f36, roughness: 0.55 }), M4(o.gland[0], 90.8, o.gland[1]));
    B.add(cyl(5, 5, 4, 24), MAT.rubber, M4(o.gland[0], 92, o.gland[1]));
  }
  if (o.pe) {
    B.add(rbox(10, 42, 50, 1.5), mat('peBlock', { color: 0x2f9e44, roughness: 0.5 }), M4(17, 45, 25));
    B.add(box(10.2, 6, 50.2), mat('peStripe', { color: 0xf5d90a, roughness: 0.5 }), M4(17, 38, 25));
  }
  // the wires go straight into the terminal openings of the breaker — no screw heads show
  for (const p of devicePorts(dev)) {
    if (p.pos[2] < 60) addScrew(B, p.pos, p.dir, 2.2); // the PE terminal on the green block keeps its screw
    else B.add(cyl(2, 2, 2, 16), MAT.blackPlastic, M4(p.pos[0], p.pos[1], 64.9, Math.PI / 2));
  }
  B.build(group);
  const fw = W - 4;
  const front = decal(W, 86, (g, w) => {
    const top = o.gland ? 9 : 14.5; // without screws on the top the printing can start higher
    txt(g, o.rating, w / 2, top, { size: o.rating.length > 3 ? 4.4 : 5.4, weight: 800, color: '#111827', font: FONT_D });
    if (o.tag) txt(g, o.tag, w / 2, top + 6, { size: 2.6, weight: 800, color: '#1d4f9c' });
    txt(g, o.volt, w / 2, top + (o.tag ? 10.5 : 6.5), { size: 2.3, weight: 700, color: '#4b5563' });
    if (o.cap) {
      g.strokeStyle = '#6b7280'; g.lineWidth = 0.3; rrect(g, w / 2 - 6, top + 10, 12, 5.4, 1); g.stroke();
      txt(g, o.cap, w / 2, top + 12.8, { size: 2.6, weight: 800, color: '#374151' });
    }
    for (const [x, label] of o.poleLabels || []) txt(g, label, x + w / 2, 83, { size: 2.8, weight: 800, color: '#374151' });
  }, { ppm: 12 });
  front.position.set(cx, 45, 64.06);
  group.add(front);
  if (o.pe) {
    const pel = labelStrip(12, 5, [{ x: 0, label: 'PE', size: 3 }], { color: '#111' });
    pel.position.set(17, 50, 50.2); group.add(pel);
  }
  // ON / OFF window (red = ON, green = OFF) and the toggle
  const ind = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(8, W - 8), 3.4), offsetMat(new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.4 })));
  ind.position.set(cx, 57, 71.7);
  group.add(ind);
  const lever = new THREE.Group();
  lever.position.set(cx, 41, 72);
  const lw = Math.min(W - 11, 44);
  const lv = new THREE.Mesh(rbox(lw, 17, 7, 1.6), mat('mcbLever', { color: 0x23272e, roughness: 0.35, metalness: 0.1 }));
  lv.position.set(0, 7, 3);
  lever.add(lv);
  for (let i = 0; i < 3; i++) { // finger grip ridges
    const rg = new THREE.Mesh(box(lw - 3, 0.9, 0.6), mat('mcbRidge', { color: 0x3a3f48, roughness: 0.5 }));
    rg.position.set(0, 9 + i * 2.6, 6.6);
    lever.add(rg);
  }
  const mark = new THREE.Mesh(box(Math.min(5, lw - 4), 1.2, 0.5), mat('mcbMark', { color: 0xd8dde5, roughness: 0.5 }));
  mark.position.set(0, 4, 6.7);
  lever.add(mark);
  group.add(lever);
  const hit = control(new THREE.Mesh(box(W, 44, 16), new THREE.MeshBasicMaterial({ visible: false })), dev.id, 'toggle', { label: o.label });
  hit.position.set(cx, 45, 74);
  group.add(hit);
  return {
    group, controls: [hit],
    update(rt) {
      const on = o.isOn(rt), a = on ? -0.55 : 0.75;
      if (lever.rotation.x === a) return false;
      lever.rotation.x = a;
      ind.material.color.set(on ? 0xd62828 : 0x2f9e44);
      return true;
    },
  };
}

function buildMcb(dev) {
  return breakerModel(dev, {
    W: 36, cx: -6, rating: 'C10', volt: '230/400 V~', cap: '6000', pe: true, label: 'MCB', gland: [-9, 60],
    poleLabels: [[-10, 'L'], [6, 'N']],
    isOn: (rt) => rt.dev.state.on,
  });
}

// ====================================================================== console modules
/** Height of a console module plate; the modules are turned about the middle of it (buildModel). */
const CONSOLE_H = 86;
/** A port position in the turned module's own frame. */
const turned = (pos) => [-pos[0], CONSOLE_H - pos[1], pos[2]];

function plate(dev, label, extraPrint) {
  const group = new THREE.Group();
  const B = new Builder();
  B.add(rbox(64, 86, 5, 2), mat('modPlate', { color: 0x252b35, roughness: 0.5, metalness: 0.2 }), M4(0, 43, 2.5));
  for (const p of devicePorts(dev)) addSocket(B, turned(p.pos), p.dir, SOCK_BY_PORT[p.id] || '#1b1d22');
  const print = decal(64, 86, (g, W, H) => {
    txt(g, label, W / 2, 7.5, { size: 5.2, weight: 800, color: '#f1f5f9', font: FONT_D });
    for (const p of devicePorts(dev)) txt(g, p.label, turned(p.pos)[0] + W / 2, H - 7.5, { size: 3.4, weight: 800, color: '#94a3b8' });
    if (extraPrint) extraPrint(g, W, H);
  }, { ppm: 9 });
  print.position.set(0, 43, 5.05);
  group.add(print);
  return { group, B };
}

function buildPushButton(dev) {
  const pr = deviceProps(dev);
  const { group, B } = plate(dev, pr.label || 'PB', (g, W, H) => txt(g, pr.contact === 'NC' ? 'NC' : 'NO', W - 6, H - 20, { size: 2.6, weight: 800, color: '#64748b' }));
  B.add(cyl(14, 14.5, 4, 32), MAT.chrome, M4(0, 50, 7, Math.PI / 2));
  B.add(cyl(12.4, 12.4, 4.4, 28), MAT.blackPlastic, M4(0, 50, 7.4, Math.PI / 2));
  B.build(group);
  const capMat = mat('cap-' + pr.color, { color: CAP_COLORS[pr.color] || '#1fa34a', roughness: 0.35 });
  const cap = new THREE.Group();
  const c1 = new THREE.Mesh(cyl(10.8, 10.8, 6, 28), capMat);
  c1.rotation.x = Math.PI / 2;
  const c2 = new THREE.Mesh(new THREE.SphereGeometry(10.8, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
  c2.rotation.x = Math.PI / 2; c2.scale.set(1, 0.18, 1); c2.position.z = 3;
  cap.add(c1, c2);
  cap.position.set(0, 50, 11);
  group.add(cap);
  const hit = control(new THREE.Mesh(cyl(15, 15, 12, 16), new THREE.MeshBasicMaterial({ visible: false })), dev.id, 'press', { label: pr.label });
  hit.rotation.x = Math.PI / 2; hit.position.set(0, 50, 10);
  group.add(hit);
  return {
    group, controls: [hit],
    update(rt) { const z = rt.pressed ? 7.6 : 11; if (cap.position.z === z) return false; cap.position.z = z; return true; },
  };
}

function buildEstop(dev) {
  const pr = deviceProps(dev);
  const { group, B } = plate(dev, pr.label || 'E-STOP');
  B.add(cyl(25, 25, 1.2, 40), mat('estopRing', { color: 0xf5c518, roughness: 0.5 }), M4(0, 50, 5.6, Math.PI / 2));
  B.add(cyl(14, 14.5, 4, 32), MAT.chrome, M4(0, 50, 7.4, Math.PI / 2));
  B.build(group);
  const ringTxt = decal(50, 50, (g, W, H) => {
    g.save(); g.translate(W / 2, H / 2);
    const s = 'EMERGENCY STOP · ';
    g.font = `800 3.3px ${FONT}`; g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 2; i++) for (let j = 0; j < s.length; j++) {
      const a = (i * s.length + j) / (s.length * 2) * Math.PI * 2;
      g.save(); g.rotate(a); g.fillText(s[j], 0, -21.3); g.restore();
    }
    g.restore();
  }, { ppm: 14 });
  ringTxt.position.set(0, 50, 6.25);
  group.add(ringTxt);
  const mush = new THREE.Group();
  const red = mat('estopRed', { color: 0xd11a1a, roughness: 0.3 });
  const collar = new THREE.Mesh(cyl(9, 9, 8, 24), MAT.blackPlastic);
  collar.rotation.x = Math.PI / 2; collar.position.z = 4;
  const head = new THREE.Mesh(new THREE.SphereGeometry(17, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), red);
  head.rotation.x = Math.PI / 2; head.scale.set(1, 0.55, 1); head.position.z = 8;
  const rim = new THREE.Mesh(cyl(17, 17, 3, 32), red);
  rim.rotation.x = Math.PI / 2; rim.position.z = 7;
  mush.add(collar, head, rim);
  mush.position.set(0, 50, 7);
  group.add(mush);
  const hit = control(new THREE.Mesh(cyl(19, 19, 20, 16), new THREE.MeshBasicMaterial({ visible: false })), dev.id, 'toggle', { label: 'Emergency stop' });
  hit.rotation.x = Math.PI / 2; hit.position.set(0, 50, 14);
  group.add(hit);
  return {
    group, controls: [hit],
    update(rt) { const z = rt.dev.state.pressed ? 3.4 : 7; if (mush.position.z === z) return false; mush.position.z = z; return true; },
  };
}

function buildSelector(dev) {
  const pr = deviceProps(dev);
  const three = dev.type === 'selector3';
  const { group, B } = plate(dev, pr.label || 'MODE', (g, W) => {
    txt(g, pr.pos0 || '0', W / 2 - 15, 20, { size: 3.2, weight: 800, color: '#cbd5e1' });
    txt(g, pr.pos1 || '1', W / 2 + 15, 20, { size: 3.2, weight: 800, color: '#cbd5e1' });
    if (three) txt(g, '0', W / 2, 16, { size: 3.2, weight: 800, color: '#cbd5e1' });
  });
  B.add(cyl(14, 14.5, 4, 32), MAT.chrome, M4(0, 50, 7, Math.PI / 2));
  B.add(cyl(12, 12, 4.4, 28), MAT.blackPlastic, M4(0, 50, 7.6, Math.PI / 2));
  B.build(group);
  const knob = new THREE.Group();
  const k = new THREE.Mesh(rbox(22, 7, 10, 2.5), MAT.blackPlastic);
  k.position.z = 5;
  const line = new THREE.Mesh(box(1.4, 8, 0.4), MAT.white);
  line.position.set(0, 5.5, 10.1);
  knob.add(k, line);
  knob.position.set(0, 50, 9);
  group.add(knob);
  const hit = control(new THREE.Mesh(cyl(15, 15, 16, 16), new THREE.MeshBasicMaterial({ visible: false })), dev.id, 'toggle', { label: pr.label });
  hit.rotation.x = Math.PI / 2; hit.position.set(0, 50, 12);
  group.add(hit);
  return {
    group, controls: [hit],
    update(rt) {
      const s = rt.dev.state;
      const a = three ? -(s.pos || 0) * Math.PI / 4 : s.on ? -Math.PI / 4 : Math.PI / 4;
      if (knob.rotation.z === a) return false;
      knob.rotation.z = a;
      return true;
    },
  };
}

function buildLamp(dev) {
  const pr = deviceProps(dev);
  const color = LAMP_COLORS[pr.color] || LAMP_COLORS.green;
  const { group, B } = plate(dev, pr.label || 'LAMP');
  B.add(cyl(14, 14.5, 4, 32), MAT.chrome, M4(0, 50, 7, Math.PI / 2));
  B.build(group);
  const c = new THREE.Color(color);
  const lens = new THREE.MeshStandardMaterial({ color: c.clone().lerp(new THREE.Color(0x111318), 0.68), emissive: c, emissiveIntensity: 0, roughness: 0.15, transparent: true, opacity: 0.95 });
  const l1 = new THREE.Mesh(cyl(11, 11, 6, 32), lens);
  l1.rotation.x = Math.PI / 2; l1.position.set(0, 50, 11);
  const l2 = new THREE.Mesh(new THREE.SphereGeometry(11, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), lens);
  l2.rotation.x = Math.PI / 2; l2.scale.set(1, 0.3, 1); l2.position.set(0, 50, 14);
  group.add(l1, l2);
  const glow = glowSprite(color, 80);
  glow.position.set(0, 50, 18);
  group.add(glow);
  return {
    group, controls: [],
    update(rt, ctx) {
      const on = rt.on;
      const k = on ? 1.9 : 0;
      if (lens.emissiveIntensity === k) return false;
      lens.emissiveIntensity = k;
      glow.material.opacity = on ? 0.85 : 0;
      void ctx;
      return true;
    },
  };
}

function buildBuzzer(dev) {
  const pr = deviceProps(dev);
  const { group, B } = plate(dev, pr.label || 'BUZZER');
  B.add(cyl(15, 15, 12, 32), MAT.blackPlastic, M4(0, 50, 11, Math.PI / 2));
  B.build(group);
  const top = decal(30, 30, (g) => {
    g.fillStyle = '#111317'; g.beginPath(); g.arc(15, 15, 14.8, 0, 7); g.fill();
    g.fillStyle = '#000';
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; g.beginPath(); g.arc(15 + Math.cos(a) * 7, 15 + Math.sin(a) * 7, 1.1, 0, 7); g.fill(); }
    g.beginPath(); g.arc(15, 15, 1.3, 0, 7); g.fill();
  }, { ppm: 10 });
  top.position.set(0, 50, 17.05);
  group.add(top);
  const ring = new THREE.Mesh(new THREE.RingGeometry(16, 18, 40), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0, depthWrite: false }));
  ring.position.set(0, 50, 17.3);
  group.add(ring);
  return {
    group, controls: [],
    update(rt, ctx) {
      if (!rt.on) { if (ring.material.opacity === 0) return false; ring.material.opacity = 0; return true; }
      const ph = (ctx.t * 2.4) % 1;
      ring.scale.setScalar(1 + ph * 0.9);
      ring.material.opacity = 0.75 * (1 - ph);
      return true;
    },
  };
}

function buildProx(dev) {
  const pr = deviceProps(dev);
  const look = DEVICE_DEFS[dev.type].look || 'ind';
  const out = pr.output === 'NPN' ? 'NPN' : 'PNP';
  const { group, B } = plate(dev, pr.label || 'SENSOR', (g, W) => txt(g, `${out} · NO`, W / 2, 13, { size: 2.6, weight: 700, color: '#64748b' }));
  let target, ghost, beam = null;
  if (look === 'photo') {
    // rectangular photoelectric sensor aimed at +x, a cardboard box comes into its beam
    B.add(rbox(24, 30, 18, 2.5), mat('photoBody', { color: 0xf2b705, roughness: 0.45 }), M4(-12, 50, 12));
    B.add(rbox(4, 20, 14, 1.5), MAT.blackPlastic, M4(1.5, 50, 12));
    B.add(cyl(4.2, 4.2, 1.2, 20), mat('photoLens', { color: 0x3a0d10, roughness: 0.1, metalness: 0.3 }), M4(4, 55, 12, 0, 0, Math.PI / 2));
    B.add(cyl(4.2, 4.2, 1.2, 20), mat('photoLens2', { color: 0x10141c, roughness: 0.1, metalness: 0.3 }), M4(4, 45, 12, 0, 0, Math.PI / 2));
    B.add(box(4, 18, 4), MAT.darkPlastic, M4(-20, 32, 8));
    B.build(group);
    target = new THREE.Mesh(rbox(12, 24, 16, 1), mat('cardboard', { color: 0xb07a43, roughness: 0.85 }));
    ghost = mat('targetGhostBox', { color: 0xb07a43, transparent: true, opacity: 0.25 });
    beam = new THREE.Mesh(box(1, 1.6, 1.6), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0, depthWrite: false }));
    beam.position.set(14, 55, 12);
    group.add(beam);
  } else {
    // M18 sensor lying along x, aimed at +x
    const body = look === 'cap' ? mat('capBody', { color: 0x30343b, roughness: 0.5 }) : mat('proxBody', { color: 0xb7a46a, metalness: 0.85, roughness: 0.32 });
    B.add(cyl(9, 9, 44, 24), body, M4(-6, 50, 12, 0, 0, Math.PI / 2));
    B.add(cyl(9.3, 9.3, 3, 6), MAT.steel, M4(-14, 50, 12, 0, 0, Math.PI / 2));
    B.add(cyl(9.3, 9.3, 3, 6), MAT.steel, M4(4, 50, 12, 0, 0, Math.PI / 2));
    B.add(cyl(8.6, 8.6, 3, 24), look === 'cap' ? mat('capFace', { color: 0xf97316, roughness: 0.5 }) : mat('proxFace', { color: 0x2563eb, roughness: 0.5 }), M4(17.5, 50, 12, 0, 0, Math.PI / 2));
    B.add(box(4, 22, 4), MAT.darkPlastic, M4(-20, 38, 8));
    B.build(group);
    if (look === 'cap') {
      target = new THREE.Mesh(rbox(12, 22, 14, 1.5), mat('liquid', { color: 0x38bdf8, roughness: 0.15, transparent: true, opacity: 0.85 }));
      ghost = mat('liquidGhost', { color: 0x38bdf8, transparent: true, opacity: 0.2 });
    } else {
      target = new THREE.Mesh(rbox(12, 22, 14, 1.5), MAT.steel);
      ghost = mat('targetGhost', { color: 0x8892a0, transparent: true, opacity: 0.3 });
    }
  }
  const solid = target.material;
  const led = ledMat('#ffb020');
  const lm = new THREE.Mesh(cyl(2.2, 2.2, 2, 12), led);
  if (look === 'photo') { lm.rotation.x = Math.PI / 2; lm.position.set(-16, 60, 21.4); } else { lm.rotation.z = Math.PI / 2; lm.position.set(-29, 50, 12); }
  group.add(lm);
  target.position.set(27, 50, 12);
  group.add(target);
  const what = look === 'photo' ? 'Box in the light beam' : look === 'cap' ? 'Material / liquid in front of the sensor' : 'Metal part in front of the sensor';
  const hit = control(new THREE.Mesh(box(64, 40, 26), new THREE.MeshBasicMaterial({ visible: false })), dev.id, 'toggle', { label: what });
  hit.position.set(0, 50, 12);
  group.add(hit);
  return {
    group, controls: [hit],
    update(rt) {
      let ch = setLed(led, rt.powered && rt.dev.state.target, 2.4);
      const here = !!rt.dev.state.target;
      const x = here ? 27 : 40;
      if (target.position.x !== x) { target.position.x = x; target.material = here ? solid : ghost; ch = true; }
      if (beam) {
        const op = rt.powered ? 0.55 : 0, len = here ? 14 : 26;
        if (beam.material.opacity !== op || beam.scale.x !== len) { beam.material.opacity = op; beam.scale.x = len; beam.position.x = 4 + len / 2; ch = true; }
      }
      return ch;
    },
  };
}

/** Limit switch (roller lever) or float level switch: a passive NO 13–14 + NC 21–22 contact. */
function buildLimit(dev) {
  const pr = deviceProps(dev);
  const look = DEVICE_DEFS[dev.type].look;
  const { group, B } = plate(dev, pr.label || 'LS1', (g, W) => txt(g, '1 NO + 1 NC', W / 2, 13, { size: 2.6, weight: 700, color: '#64748b' }));
  let update;
  if (look === 'float') {
    // a little tank with a float: the level rises to the float when actuated
    const glass = new THREE.Mesh(rbox(34, 34, 16, 2), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.22, roughness: 0.1, depthWrite: false }));
    glass.position.set(0, 50, 12);
    group.add(glass);
    B.add(box(36, 2, 18), MAT.alu, M4(0, 32, 12));
    B.add(cyl(0.8, 0.8, 10, 8), MAT.darkPlastic, M4(8, 62, 12));
    B.build(group);
    const water = new THREE.Mesh(box(32, 1, 14), mat('water', { color: 0x2f8de4, transparent: true, opacity: 0.7, roughness: 0.1 }));
    group.add(water);
    const float = new THREE.Mesh(cyl(4, 4, 7, 16), mat('floatBody', { color: 0xf2b705, roughness: 0.4 }));
    group.add(float);
    update = (rt) => {
      const on = !!(rt.dev.state && rt.dev.state.on), lv = on ? 26 : 9;
      if (water.scale.y === lv) return false;
      water.scale.y = lv; water.position.set(0, 33 + lv / 2, 12);
      float.position.set(8, on ? 33 + lv + 1 : 52, 12);
      return true;
    };
    update({ dev });
  } else {
    // die-cast limit switch body with a roller lever; a cam pushes the lever down
    B.add(rbox(24, 30, 18, 2), mat('lsBody', { color: 0xa9b1bb, metalness: 0.6, roughness: 0.4 }), M4(-12, 46, 12));
    B.add(rbox(14, 10, 16, 2), MAT.blackPlastic, M4(-12, 66, 12));
    B.add(cyl(3, 3, 6, 16), MAT.steel, M4(-12, 68, 21, Math.PI / 2));
    B.build(group);
    const lever = new THREE.Group();
    lever.position.set(-12, 68, 22);
    const arm = new THREE.Mesh(box(22, 3, 3), MAT.steel);
    arm.position.set(11, 0, 0);
    const roller = new THREE.Mesh(cyl(4, 4, 5, 18), MAT.blackPlastic);
    roller.rotation.x = Math.PI / 2; roller.position.set(22, 0, 0);
    lever.add(arm, roller);
    group.add(lever);
    const cam = new THREE.Mesh(rbox(14, 8, 12, 2), mat('cam', { color: 0xd62828, roughness: 0.45 }));
    cam.position.set(20, 78, 22);
    group.add(cam);
    update = (rt) => {
      const on = !!rt.dev.state.on, a = on ? -0.42 : 0;
      if (lever.rotation.z === a) return false;
      lever.rotation.z = a; cam.position.x = on ? 10 : 26;
      return true;
    };
  }
  const hit = control(new THREE.Mesh(box(64, 50, 30), new THREE.MeshBasicMaterial({ visible: false })), dev.id, 'toggle', { label: look === 'float' ? 'Raise / lower the level' : 'Push the lever' });
  hit.position.set(0, 52, 14);
  group.add(hit);
  return { group, controls: [hit], update };
}

/** 0–10 V transmitter (temperature or pressure): drag its value on the card that a tap opens. */
function buildAtx(dev) {
  const pr = deviceProps(dev);
  const look = DEVICE_DEFS[dev.type].look;
  const { group, B } = plate(dev, pr.label || 'SENSOR', (g, W) => txt(g, `${pr.min}–${pr.max} ${pr.unit} → 0–10 V`, W / 2, 13, { size: 2.5, weight: 700, color: '#64748b' }));
  let update;
  if (look === 'press') {
    // dial gauge with a needle
    B.add(cyl(16, 16, 8, 32), MAT.chrome, M4(0, 52, 8, Math.PI / 2));
    B.add(cyl(6, 6, 10, 6), MAT.brass, M4(0, 32, 8));
    B.build(group);
    const face = decal(30, 30, (g) => {
      g.fillStyle = '#f8fafc'; g.beginPath(); g.arc(15, 15, 14.6, 0, 7); g.fill();
      g.strokeStyle = '#111827'; g.lineWidth = 0.4;
      for (let i = 0; i <= 10; i++) {
        const a = (-135 + i * 27) * Math.PI / 180 - Math.PI / 2;
        g.beginPath(); g.moveTo(15 + Math.cos(a) * 11, 15 + Math.sin(a) * 11); g.lineTo(15 + Math.cos(a) * (i % 5 ? 12.4 : 13.4), 15 + Math.sin(a) * (i % 5 ? 12.4 : 13.4)); g.stroke();
      }
      txt(g, pr.unit, 15, 21, { size: 3, weight: 700, color: '#334155' });
    }, { ppm: 14 });
    face.position.set(0, 52, 12.1);
    group.add(face);
    const needle = new THREE.Group();
    const nd = new THREE.Mesh(box(0.9, 11, 0.5), mat('needle', { color: 0xd62828 }));
    nd.position.y = 5;
    needle.add(nd);
    needle.position.set(0, 52, 12.6);
    group.add(needle);
    update = (rt) => { const a = -((rt.dev.state.pos ?? 0.5) - 0.5) * 1.5 * Math.PI; if (needle.rotation.z === a) return false; needle.rotation.z = a; return true; };
  } else {
    // transmitter head on a PT100 probe, with a bar "thermometer" next to it
    B.add(cyl(11, 11, 12, 28), mat('txHead', { color: 0x1d4f9c, roughness: 0.4 }), M4(-10, 60, 10, Math.PI / 2));
    B.add(cyl(2, 2, 26, 12), MAT.steel, M4(-10, 40, 8));
    B.add(rbox(8, 44, 4, 2), MAT.blackPlastic, M4(16, 50, 7));
    B.build(group);
    const bar = new THREE.Mesh(box(4, 1, 2), new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.6 }));
    group.add(bar);
    update = (rt) => {
      const k = Math.max(0.02, Math.min(1, rt.dev.state.pos ?? 0.5)), hgt = 40 * k;
      if (bar.scale.y === hgt) return false;
      bar.scale.y = hgt; bar.position.set(16, 30 + hgt / 2, 9.4);
      return true;
    };
    update({ dev });
  }
  const hit = control(new THREE.Mesh(box(64, 50, 26), new THREE.MeshBasicMaterial({ visible: false })), dev.id, 'pot', { label: pr.label });
  hit.position.set(0, 50, 12);
  group.add(hit);
  return { group, controls: [hit], update };
}

function buildPot(dev) {
  const pr = deviceProps(dev);
  const { group, B } = plate(dev, pr.label || 'SPEED', (g, W) => {
    g.save(); g.translate(W / 2, 36);
    g.strokeStyle = '#94a3b8'; g.lineWidth = 0.5;
    for (let i = 0; i <= 10; i++) {
      const a = (-135 + i * 27) * Math.PI / 180 - Math.PI / 2;
      g.beginPath(); g.moveTo(Math.cos(a) * 15.5, Math.sin(a) * 15.5); g.lineTo(Math.cos(a) * (i % 5 ? 17 : 18.5), Math.sin(a) * (i % 5 ? 17 : 18.5)); g.stroke();
      if (i % 5 === 0) txt(g, String(i), Math.cos(a) * 21.5, Math.sin(a) * 21.5, { size: 2.8, weight: 700, color: '#cbd5e1' });
    }
    g.restore();
  });
  B.add(cyl(11.5, 11.5, 2, 32), MAT.steel, M4(0, 50, 6, Math.PI / 2));
  B.build(group);
  const knob = new THREE.Group();
  const k = new THREE.Mesh(cyl(10, 10.6, 10, 30), MAT.blackPlastic);
  k.rotation.x = Math.PI / 2; k.position.z = 5;
  const line = new THREE.Mesh(box(1.4, 8, 0.6), MAT.white);
  line.position.set(0, 5, 10.2);
  knob.add(k, line);
  knob.position.set(0, 50, 7);
  group.add(knob);
  const hit = control(new THREE.Mesh(cyl(14, 14, 16, 16), new THREE.MeshBasicMaterial({ visible: false })), dev.id, 'pot', { label: pr.label });
  hit.rotation.x = Math.PI / 2; hit.position.set(0, 50, 12);
  group.add(hit);
  return {
    group, controls: [hit],
    update(rt) { const a = -((rt.dev.state.pos ?? 0.5) - 0.5) * 1.5 * Math.PI; if (knob.rotation.z === a) return false; knob.rotation.z = a; return true; },
  };
}

// ====================================================================== contactor + overload relay
function buildContactor(dev) {
  const pr = deviceProps(dev);
  const group = new THREE.Group();
  const B = new Builder();
  const grey = mat('kmBody', { color: 0xe5e7e3, roughness: 0.5 });
  B.add(rbox(45, 82, 66, 3), grey, M4(0, 41, 33));
  B.add(rbox(43, 16, 12, 1.5), MAT.termBlock, M4(0, 74, 74.5));
  B.add(rbox(43, 16, 12, 1.5), MAT.termBlock, M4(0, 8, 74.5));
  B.add(rbox(37, 44, 16, 3), mat('kmFront', { color: 0xd3d6d2, roughness: 0.5 }), M4(0, 41, 72));
  B.add(box(30, 10, 14), MAT.darkPlastic, M4(0, -2, 20));
  for (const p of devicePorts(dev)) addScrew(B, p.pos, p.dir, 2);
  B.build(group);
  const coil = pr.coil === '230AC' ? '230 V AC' : '24 V DC';
  const front = decal(36, 42, (g, W) => {
    txt(g, pr.label || 'KM1', W / 2, 5, { size: 5, weight: 800, color: '#111827', font: FONT_D });
    txt(g, '9 A · AC-3 4 kW', W / 2, 24, { size: 2.6, weight: 700, color: '#374151' });
    txt(g, `Coil ${coil}`, W / 2, 29, { size: 2.6, weight: 800, color: pr.coil === '230AC' ? '#b91c1c' : '#1d4f9c' });
    txt(g, '1NO + 1NC', W / 2, 34, { size: 2.4, weight: 700, color: '#4b5563' });
    g.strokeStyle = '#374151'; g.lineWidth = 0.4;
    for (let i = 0; i < 3; i++) { const x = 9 + i * 9; g.beginPath(); g.moveTo(x, 37); g.lineTo(x + 3, 40); g.stroke(); }
  }, { ppm: 12 });
  front.position.set(0, 41, 80.1);
  group.add(front);
  const top = labelStrip(43, 4, devicePorts(dev).filter((p) => p.pos[1] > 40).map((p) => ({ x: p.pos[0], label: p.label.replace(/^\d\//, ''), size: 2 })), { color: '#111827' });
  top.position.set(0, 64.2, 80.2); group.add(top);
  const bot = labelStrip(43, 4, devicePorts(dev).filter((p) => p.pos[1] <= 40).map((p) => ({ x: p.pos[0], label: p.label.replace(/^\d\//, ''), size: 2 })), { color: '#111827' });
  bot.position.set(0, 17.8, 80.2); group.add(bot);
  // armature indicator in a window below the label: green O = open, red I = pulled in
  const win = new THREE.Mesh(rbox(14, 9, 1.2, 0.8), MAT.blackPlastic);
  win.position.set(0, 47, 80.6);
  group.add(win);
  const flag = new THREE.Mesh(box(8, 3.6, 0.8), mat('kmFlagOff', { color: 0x2f9e44, roughness: 0.4 }));
  flag.position.set(0, 45.4, 81.4);
  group.add(flag);
  const hit = control(new THREE.Mesh(box(40, 48, 14), new THREE.MeshBasicMaterial({ visible: false })), dev.id, 'press', { label: `${pr.label || 'Contactor'} (push in by hand)` });
  hit.position.set(0, 41, 82);
  group.add(hit);
  return {
    group, controls: [hit],
    update(rt) {
      const on = !!rt.closed, y = on ? 48.6 : 45.4;
      if (flag.position.y === y) return false;
      flag.position.y = y;
      flag.material = on ? mat('kmFlagOn', { color: 0xd62828, roughness: 0.4 }) : mat('kmFlagOff', { color: 0x2f9e44, roughness: 0.4 });
      return true;
    },
  };
}

function buildOlr(dev) {
  const pr = deviceProps(dev);
  const group = new THREE.Group();
  const B = new Builder();
  B.add(rbox(45, 66, 66, 3), mat('olrBody', { color: 0xe5e7e3, roughness: 0.5 }), M4(0, 33, 33));
  B.add(rbox(43, 16, 12, 1.5), MAT.termBlock, M4(0, 58, 74.5));
  B.add(rbox(43, 16, 12, 1.5), MAT.termBlock, M4(0, 8, 74.5));
  B.add(rbox(37, 28, 14, 3), mat('olrFront', { color: 0xd3d6d2, roughness: 0.5 }), M4(0, 33, 71));
  B.add(cyl(5.5, 5.5, 3, 24), MAT.blackPlastic, M4(-9, 33, 79, Math.PI / 2));
  B.add(box(30, 10, 14), MAT.darkPlastic, M4(0, -2, 20));
  for (const p of devicePorts(dev)) addScrew(B, p.pos, p.dir, 2);
  B.build(group);
  const front = decal(36, 26, (g, W) => {
    txt(g, pr.label || 'F1', W / 2, 4, { size: 4, weight: 800, color: '#111827', font: FONT_D });
    txt(g, '2.5–4 A', 9, 22.5, { size: 2.4, weight: 700, color: '#374151' });
    txt(g, 'RESET', 27, 22.5, { size: 2.4, weight: 800, color: '#1d4f9c' });
  }, { ppm: 12 });
  front.position.set(0, 33, 78.1);
  group.add(front);
  const btn = new THREE.Mesh(cyl(4.5, 4.5, 4, 20), mat('olrReset', { color: 0x1f5fd6, roughness: 0.35 }));
  btn.rotation.x = Math.PI / 2; btn.position.set(9, 33, 80);
  group.add(btn);
  const flag = new THREE.Mesh(box(4, 4, 1), mat('olrFlagOk', { color: 0x2f9e44 }));
  flag.position.set(-9, 33, 80.8);
  group.add(flag);
  const hit = control(new THREE.Mesh(box(40, 32, 14), new THREE.MeshBasicMaterial({ visible: false })), dev.id, 'toggle', { label: `${pr.label || 'Overload relay'}: trip / reset` });
  hit.position.set(0, 33, 80);
  group.add(hit);
  return {
    group, controls: [hit],
    update(rt) {
      const t = !!rt.dev.state.tripped, z = t ? 82 : 80;
      if (btn.position.z === z) return false;
      btn.position.z = z;
      flag.material = t ? mat('olrFlagTrip', { color: 0xf59e0b }) : mat('olrFlagOk', { color: 0x2f9e44 });
      return true;
    },
  };
}

function buildRelay(dev) {
  const pr = deviceProps(dev);
  const group = new THREE.Group();
  const B = new Builder();
  B.add(rbox(28, 80, 40, 2), MAT.termBlock, M4(0, 40, 20));
  B.add(box(30, 10, 14), MAT.darkPlastic, M4(0, -2, 20));
  for (const p of devicePorts(dev)) addScrew(B, p.pos, p.dir, 1.8);
  B.build(group);
  // the plug-in relay: a clear cover over the coil and contacts
  const cover = new THREE.Mesh(rbox(24, 40, 34, 2), new THREE.MeshStandardMaterial({ color: 0xcfd8e3, roughness: 0.1, transparent: true, opacity: 0.55 }));
  cover.position.set(0, 40, 57);
  group.add(cover);
  const core = new THREE.Mesh(cyl(6, 6, 18, 16), mat('relayCoil', { color: 0xb45309, roughness: 0.5, metalness: 0.4 }));
  core.position.set(0, 36, 52);
  group.add(core);
  const front = decal(24, 40, (g, W) => {
    txt(g, pr.label || 'K1', W / 2, 5, { size: 4.2, weight: 800, color: '#111827', font: FONT_D });
    txt(g, '24 V DC', W / 2, 33, { size: 2.4, weight: 800, color: '#1d4f9c' });
    txt(g, '1 CO 10 A', W / 2, 37, { size: 2.2, weight: 700, color: '#374151' });
  }, { ppm: 12 });
  front.position.set(0, 40, 74.2);
  group.add(front);
  const led = new THREE.Mesh(cyl(1.8, 1.8, 1.5, 12), ledMat('#ff3434'));
  led.rotation.x = Math.PI / 2; led.position.set(7, 52, 74.5);
  group.add(led);
  const hit = control(new THREE.Mesh(box(26, 40, 12), new THREE.MeshBasicMaterial({ visible: false })), dev.id, 'press', { label: `${pr.label || 'Relay'} (test button)` });
  hit.position.set(0, 40, 76);
  group.add(hit);
  return { group, controls: [hit], update(rt) { return setLed(led.material, !!rt.coil); } };
}

function buildCb(dev) {
  const pr = deviceProps(dev);
  const n = pr.poles === '3P' ? 3 : 1, W = n === 3 ? 54 : 18;
  return breakerModel(dev, {
    W, cx: 0, rating: pr.rating || 'C6', tag: pr.label || 'QF1', volt: n === 3 ? '400 V~' : '230 V~',
    label: `${pr.label || 'Breaker'} ON / OFF`, isOn: (rt) => rt.dev.state.on !== false,
  });
}

function buildTb(dev) {
  const pr = deviceProps(dev);
  const group = new THREE.Group();
  const B = new Builder();
  const grey = mat('tbGrey', { color: 0x9aa3ad, roughness: 0.55 });
  for (let i = 0; i < 6; i++) B.add(rbox(9.4, 56, 44, 1), i === 5 ? mat('tbBlue', { color: 0x2563eb, roughness: 0.55 }) : grey, M4(-25 + i * 10, 28, 22));
  B.add(box(62, 4, 30), MAT.darkPlastic, M4(0, -2, 15));
  for (const p of devicePorts(dev)) addScrew(B, p.pos, p.dir, 1.8);
  B.build(group);
  const marks = labelStrip(60, 5, [1, 2, 3, 4, 5, 6].map((k) => ({ x: -25 + (k - 1) * 10, label: String(k), size: 2.6 })), { color: '#111827', bg: '#f8fafc' });
  marks.position.set(0, 28, 44.2); group.add(marks);
  const tag = labelStrip(20, 5, [{ x: 0, label: pr.label || 'X1', size: 3 }], { color: '#111827', bg: '#fde047' });
  tag.position.set(-20, 36, 44.3); group.add(tag);
  return { group, controls: [], update() { return false; } };
}

// ====================================================================== motor
function buildMotor(dev) {
  const group = new THREE.Group();
  const B = new Builder();
  const paint = MAT.paintBlue;
  const dark = mat('motorDark', { color: 0x2b4366, roughness: 0.45, metalness: 0.35 });
  const ax = (x, y, z) => M4(x, y, z, 0, 0, Math.PI / 2);
  B.add(cyl(72, 72, 190, 40), paint, ax(-10, 95, 0));
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    if (Math.sin(a) < -0.55) continue;
    const r = 74;
    B.add(box(180, 3, 9), paint, M4(-10, 95 + Math.sin(a) * r, Math.cos(a) * r, -a, 0, 0));
  }
  B.add(cyl(69, 69, 16, 40), dark, ax(92, 95, 0));
  B.add(cyl(30, 34, 12, 30), dark, ax(106, 95, 0));
  B.add(cyl(70, 74, 46, 40), mat('fanCowl', { color: 0x23272e, roughness: 0.55, metalness: 0.4 }), ax(-128, 95, 0));
  B.add(cyl(66, 70, 6, 40), paint, ax(-102, 95, 0));
  // feet + base block
  B.add(box(200, 34, 110), paint, M4(-10, 33, 0));
  B.add(box(52, 12, 168), paint, M4(-75, 6, 0));
  B.add(box(52, 12, 168), paint, M4(55, 6, 0));
  // terminal box
  B.add(rbox(80, 30, 80, 4), paint, M4(0, 170, 0));
  B.add(box(60, 4, 22), MAT.blackPlastic, M4(0, 184, 0));
  B.add(cyl(7, 7, 16, 14), MAT.blackPlastic, M4(0, 168, 42, Math.PI / 2));
  for (const p of devicePorts(dev)) addScrew(B, p.pos, p.dir, 2.6);
  // eye bolt
  const tor = new THREE.TorusGeometry(9, 2.4, 10, 24);
  B.add(tor, MAT.steel, M4(-60, 178, 0, 0, Math.PI / 2, 0));
  B.add(cyl(3, 3, 12, 10), MAT.steel, M4(-60, 167, 0));
  B.build(group);
  const fan = decal(140, 140, (g, W) => {
    g.translate(W / 2, W / 2);
    g.fillStyle = '#1f2329'; g.beginPath(); g.arc(0, 0, 69, 0, 7); g.fill();
    g.strokeStyle = '#0b0d10'; g.lineWidth = 4;
    for (let r = 14; r < 66; r += 9) { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); }
    g.fillStyle = '#2b3038'; g.beginPath(); g.arc(0, 0, 12, 0, 7); g.fill();
  }, { ppm: 3, transparent: true });
  fan.position.set(-151.1, 95, 0); fan.rotation.y = -Math.PI / 2;
  group.add(fan);
  const plateD = decal(64, 40, (g, W, H) => {
    g.fillStyle = '#d7dce3'; rrect(g, 0, 0, W, H, 2); g.fill();
    g.strokeStyle = '#7b8494'; g.lineWidth = 0.4; rrect(g, 1, 1, W - 2, H - 2, 1.5); g.stroke();
    txt(g, '3~ INDUCTION MOTOR', W / 2, 5.5, { size: 3.2, weight: 800, color: '#111827' });
    const rows = [['0.75 kW', '4 P'], ['220 V Δ', '3.2 A'], ['50 Hz', '1420 rpm'], ['IP55', 'Ins. F']];
    rows.forEach(([a, b], i) => { txt(g, a, 6, 13 + i * 7, { size: 3, weight: 700, align: 'left', color: '#1f2937', font: FONT_M }); txt(g, b, W - 6, 13 + i * 7, { size: 3, weight: 700, align: 'right', color: '#1f2937', font: FONT_M }); });
  }, { ppm: 8, transparent: false });
  // the cooling fins stand 9 mm proud of the housing: the plate sits on a flat pad in front of them, so no fin cuts through it
  const pad = new THREE.Mesh(rbox(70, 46, 8, 1.5), mat('platePad', { color: 0x2a4a78, roughness: 0.45, metalness: 0.3 }));
  pad.position.set(-20, 100, 78.4);
  group.add(pad);
  plateD.position.set(-20, 100, 82.5);
  group.add(plateD);
  const tlbl = labelStrip(60, 5, devicePorts(dev).map((p) => ({ x: p.pos[0], label: p.label, size: 3 })), { color: '#f8fafc' });
  tlbl.rotation.x = -Math.PI / 2; tlbl.position.set(0, 186.1, 7.5);
  group.add(tlbl);
  // rotating shaft + coupling disk
  const rot = new THREE.Group();
  rot.position.set(0, 95, 0);
  const shaft = new THREE.Mesh(cyl(10, 10, 52, 20), MAT.steel);
  shaft.rotation.z = Math.PI / 2; shaft.position.x = 136;
  const key = new THREE.Mesh(box(30, 3, 4), mat('key', { color: 0x9aa3ae, metalness: 0.8, roughness: 0.3 }));
  key.position.set(140, 9.5, 0);
  const disk = new THREE.Mesh(cyl(36, 36, 12, 40), mat('coupling', { color: 0x9aa3ae, metalness: 0.8, roughness: 0.32 }));
  disk.rotation.z = Math.PI / 2; disk.position.x = 158;
  const face = decal(72, 72, (g, W) => {
    g.translate(W / 2, W / 2);
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#f8fafc' : '#dc2626'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 35.5, i * Math.PI / 2, (i + 1) * Math.PI / 2); g.closePath(); g.fill(); }
    g.fillStyle = '#4b5563'; g.beginPath(); g.arc(0, 0, 8, 0, 7); g.fill();
  }, { ppm: 4, transparent: true });
  face.rotation.y = Math.PI / 2; face.position.x = 164.2;
  rot.add(shaft, key, disk, face);
  group.add(rot);
  const label = labelSprite('0 rpm', { scale: 0.55, size: 30 });
  label.position.set(40, 250, 0);
  label.visible = false;
  group.add(label);
  let vis = 0, lastTxt = '';
  return {
    group, controls: [],
    update(rt, ctx) {
      vis += (rt.rpm / 1420) * 4 * Math.PI * 2 * ctx.dt;
      const changed = rt.rpm !== 0 || rot.rotation.x !== vis;
      rot.rotation.x = vis % (Math.PI * 2);
      const show = ctx.running && (Math.abs(rt.rpm) > 0.5 || rt.driverConnected);
      label.visible = show;
      const t = `${Math.round(Math.abs(rt.rpm))} rpm${rt.rpm < -0.5 ? ' ⟲' : rt.rpm > 0.5 ? ' ⟳' : ''}`;
      if (show && t !== lastTxt) { lastTxt = t; label.userData.set(t); }
      return changed || show;
    },
  };
}

// ---------------------------------------------------------------- laptop keyboard
// A real laptop layout (15 key units wide): a half-height function row, number row, QWERTY rows,
// wide Tab / Caps / Shift / Enter / Backspace keys, a bottom row with a long space bar and the
// inverted-T arrow keys. Keycaps are raised chiclet keys sitting in a dark well; the legends are
// printed on a transparent decal that lies exactly on the key tops.
const KB_U = 18.6;         // key pitch (mm)
const KB_GAP = 2.8;        // gap between caps
const KB_DECK = 14;        // top of the laptop base
const KB_CAP_H = 1.5;      // how far the caps stand out of the deck
const KB_Z = 82;           // centre of the keyboard well (z)
const KB_W = 296, KB_H = 118;
function kbLayout() {
  const L = (t, w = 1, o = {}) => ({ t, w, ...o });
  const chars = (s) => [...s].map((c) => L(c.toUpperCase()));
  const rows = [
    { h: 0.6, keys: [L('esc'), ...Array.from({ length: 12 }, (_, i) => L('F' + (i + 1), 1, { small: true })), L('prt sc', 1, { small: true }), L('del')] },
    { keys: [L('`', 1, { sub: '~' }), ...'1234567890'.split('').map((c, i) => L(c, 1, { sub: '!@#$%^&*()'[i] })), L('-', 1, { sub: '_' }), L('=', 1, { sub: '+' }), L('backspace', 2, { mod: 'right' })] },
    { keys: [L('tab', 1.5, { mod: 'left' }), ...chars('qwertyuiop'), L('[', 1, { sub: '{' }), L(']', 1, { sub: '}' }), L('\\', 1.5, { sub: '|' })] },
    { keys: [L('caps lock', 1.75, { mod: 'left' }), ...chars('asdfghjkl'), L(';', 1, { sub: ':' }), L("'", 1, { sub: '"' }), L('enter', 2.25, { mod: 'right' })] },
    { keys: [L('shift', 2.25, { mod: 'left' }), ...chars('zxcvbnm'), L(',', 1, { sub: '<' }), L('.', 1, { sub: '>' }), L('/', 1, { sub: '?' }), L('shift', 2.75, { mod: 'right' })] },
    { keys: [L('ctrl', 1, { small: true }), L('fn', 1, { small: true }), L('win', 1, { small: true, win: true }), L('alt', 1, { small: true }), L('', 6), L('alt', 1, { small: true }), L('ctrl', 1, { small: true }), L('←', 1, { arrow: true }), L('↑↓', 1, { arrows: true }), L('→', 1, { arrow: true })] },
  ];
  const caps = [];
  const totalH = rows.reduce((a, r) => a + (r.h || 1) * KB_U, 0);
  let y = (KB_H - totalH) / 2;
  const x0 = (KB_W - 15 * KB_U) / 2;
  for (const r of rows) {
    const rh = (r.h || 1) * KB_U;
    let x = x0;
    for (const k of r.keys) {
      const w = k.w * KB_U;
      if (k.arrows) {
        // up and down share one key slot, each half as tall
        const hh = (rh - KB_GAP) / 2 - KB_GAP / 4;
        caps.push({ ...k, t: '↑', x: x + KB_GAP / 2, y: y + KB_GAP / 2, w: w - KB_GAP, h: hh, arrow: true });
        caps.push({ ...k, t: '↓', x: x + KB_GAP / 2, y: y + KB_GAP / 2 + hh + KB_GAP / 2, w: w - KB_GAP, h: hh, arrow: true });
      } else if (k.arrow) {
        // ← and → are half height, at the bottom of the row (inverted T)
        const hh = (rh - KB_GAP) / 2 - KB_GAP / 4;
        caps.push({ ...k, x: x + KB_GAP / 2, y: y + rh - KB_GAP / 2 - hh, w: w - KB_GAP, h: hh });
      } else {
        caps.push({ ...k, x: x + KB_GAP / 2, y: y + KB_GAP / 2, w: w - KB_GAP, h: rh - KB_GAP, fnRow: !!r.h });
      }
      x += w;
    }
    y += rh;
  }
  return caps;
}

function buildKeyboard(group) {
  const caps = kbLayout();
  // the well the keys sit in
  const well = decal(KB_W, KB_H, (g, W, H) => { g.fillStyle = '#0b0c0f'; rrect(g, 0, 0, W, H, 4); g.fill(); }, { ppm: 2, transparent: false });
  well.rotation.x = -Math.PI / 2; well.position.set(0, KB_DECK + 0.05, KB_Z);
  group.add(well);
  // raised keycaps (merged into one mesh)
  const B = new Builder();
  const capMat = mat('keycap', { color: 0x2a2e37, metalness: 0.05, roughness: 0.58 });
  const top = KB_DECK + KB_CAP_H;
  for (const c of caps) {
    const cx = c.x + c.w / 2 - KB_W / 2, cz = KB_Z - KB_H / 2 + c.y + c.h / 2;
    B.add(rbox(c.w, KB_CAP_H + 1, c.h, Math.min(1.4, c.h / 2 - 0.1), 2), capMat, M4(cx, top - (KB_CAP_H + 1) / 2, cz));
  }
  B.build(group, { shadow: false });
  // printed legends on the key tops
  const ink = '#d3d8e0', dim = '#9aa3b2';
  const legends = decal(KB_W, KB_H, (g) => {
    for (const c of caps) {
      if (!c.t) continue;
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      if (c.win) {
        // the four-pane logo
        const s = 1.5, gp = 0.35;
        g.fillStyle = ink;
        for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) g.fillRect(cx + dx * (s + gp) + gp / 2, cy + dy * (s + gp) + gp / 2, s, s);
      } else if (c.mod) {
        const left = c.mod === 'left';
        txt(g, c.t, left ? c.x + 2.2 : c.x + c.w - 2.2, c.y + c.h - 3, { size: 2.7, color: ink, weight: 500, align: left ? 'left' : 'right' });
      } else if (c.sub) {
        txt(g, c.sub, cx, cy - 2.6, { size: 3, color: dim, weight: 500 });
        txt(g, c.t, cx, cy + 2.4, { size: 3.6, color: ink, weight: 600 });
      } else if (c.arrow) {
        txt(g, c.t, cx, cy + 0.2, { size: 3.4, color: ink, weight: 600 });
      } else if (c.fnRow) {
        txt(g, c.t, cx, cy + 0.2, { size: 2.6, color: c.t === 'esc' || c.t === 'del' ? ink : dim, weight: 600 });
      } else if (c.small) {
        txt(g, c.t, cx, cy + 0.3, { size: 2.8, color: ink, weight: 500 });
      } else {
        txt(g, c.t, cx, cy + 0.3, { size: 4.6, color: ink, weight: 600 });
      }
    }
  }, { ppm: 7, transparent: true, rough: 0.62 });
  legends.rotation.x = -Math.PI / 2; legends.position.set(0, top + 0.04, KB_Z);
  group.add(legends);
}

// ====================================================================== laptop
function buildLaptop(dev, ctx) {
  const group = new THREE.Group();
  const B = new Builder();
  const shell = mat('laptop', { color: 0x3a3f48, metalness: 0.6, roughness: 0.38 });
  B.add(rbox(320, 14, 220, 6), shell, M4(0, 7, 110));
  B.add(box(4, 5, 12), MAT.blackPlastic, M4(-159.5, 8, 150));
  B.build(group);
  buildKeyboard(group);
  const pad = decal(104, 62, (g, W, H) => {
    g.fillStyle = '#2a2e36'; rrect(g, 0, 0, W, H, 5); g.fill();
    g.fillStyle = '#353a44'; rrect(g, 0.8, 0.8, W - 1.6, H - 1.6, 4.4); g.fill();
  }, { ppm: 4, transparent: true, rough: 0.3 });
  pad.rotation.x = -Math.PI / 2; pad.position.set(0, 14.06, 178);
  group.add(pad);
  const lid = new THREE.Group();
  lid.position.set(0, 14, 6);
  lid.rotation.x = -0.24;
  const lidMesh = new THREE.Mesh(rbox(320, 212, 7, 5), shell);
  lidMesh.position.set(0, 106, -3.5);
  lidMesh.castShadow = true;
  lid.add(lidMesh);
  // bezel and screen sit clearly in front of the lid and of each other (layered decals 0.05 mm
  // apart z-fight on many GPUs: the laptop screen flickered while orbiting)
  const bez = new THREE.Mesh(new THREE.PlaneGeometry(312, 204), offsetMat(mat('lapBezel', { color: 0x0b0d10, roughness: 0.3 }), 1));
  bez.position.set(0, 107, 0.6);
  lid.add(bez);
  const scr = offsetMat(new THREE.MeshStandardMaterial({ color: 0x050608, emissive: 0xffffff, emissiveMap: ctx.laptopTexture, emissiveIntensity: 0.95, roughness: 0.2 }), 2);
  scr.toneMapped = false;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(296, 185), scr);
  screen.position.set(0, 109, 1.2);
  control(screen, dev.id, 'laptop', { label: 'Laptop' });
  lid.add(screen);
  group.add(lid);
  return { group, controls: [screen], update() { return false; } };
}

const BUILDERS = { plc: buildPlc, hmi: buildHmi, vfd: buildVfd, psu: buildPsu, mcb: buildMcb, pb: buildPushButton, estop: buildEstop, selector: buildSelector, selector3: buildSelector, relay: buildRelay, cb: buildCb, tb: buildTb, lamp: buildLamp, buzzer: buildBuzzer, prox: buildProx, limit: buildLimit, atx: buildAtx, contactor: buildContactor, olr: buildOlr, pot: buildPot, motor: buildMotor, laptop: buildLaptop, ...MODBUS_BUILDERS };

export function buildModel(dev, ctx) {
  const def = DEVICE_DEFS[dev.type];
  const fn = def && BUILDERS[def.sim];
  if (!fn) return null;
  let model;
  if (def.zone === 'console') {
    // console modules are built "head down": the sockets end up at the top of the module — toward the back of the
    // console — so the cords leave over the back edge and never lie across the buttons (defs.js sockRow)
    FLIP.on = true;
    try { model = fn(dev, ctx); } finally { FLIP.on = false; }
    const inner = model.group, outer = new THREE.Group();
    inner.position.set(0, CONSOLE_H, 0);
    inner.rotation.z = Math.PI;
    outer.add(inner);
    model.group = outer;
  } else model = fn(dev, ctx);
  model.group.userData.devId = dev.id;
  model.group.traverse((o) => {
    if (o.isMesh && !o.userData.control) { o.castShadow = o.castShadow || false; }
    o.userData.devId = dev.id;
  });
  return model;
}

export function disposeModel(model) {
  model.group.traverse((o) => {
    if (o.geometry && !o.geometry.parameters) o.geometry.dispose();
    if (o.material && o.material.map && o.material.map.userData && o.material.map.userData.canvas && o.userData.tex) o.material.map.dispose();
  });
}

export { LAMP_COLORS, CAP_COLORS };
