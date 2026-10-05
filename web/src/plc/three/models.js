// Procedural 3D models of the lab devices. Each builder returns
//   { group, update(rt, ctx) → changed?, controls: [mesh], screen?, dispose() }
// in the device-local frame of devices/defs.js (mm, origin bottom-centre-back, +z = front).
import {
  THREE, MAT, mat, ledMat, setLed, canvasTexture, decal, rbox, box, cyl, M4, alongDir, Builder, addScrew, addSocket,
  glowSprite, labelSprite, txt, rrect, deltaLogo, offsetMat, FONT, FONT_D, FONT_M,
} from './kit.js';
import { DEVICE_DEFS, PLC_MODELS, devicePorts, deviceProps } from '../devices/defs.js';
import { drawSegDisplay } from './sevenseg.js';

const LAMP_COLORS = { green: '#22e06a', red: '#ff3434', yellow: '#ffb020', blue: '#3b8bff', white: '#f4f7ff' };
const CAP_COLORS = { green: '#1fa34a', red: '#d62828', yellow: '#f2b705', blue: '#1f5fd6', black: '#1b1d22', white: '#e9ecef' };
const SOCK_BY_PORT = { '13': '#d62828', '11': '#d62828', '14': '#1b1d22', '12': '#1b1d22', X1: '#d62828', X2: '#1b1d22', '+': '#d62828', '-': '#1b1d22', BN: '#7a4a24', BU: '#2563eb', BK: '#1b1d22', '1': '#d62828', '2': '#f2b705', '3': '#1b1d22' };

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
function buildPlc(dev) {
  const def = DEVICE_DEFS[dev.type];
  const m = PLC_MODELS[dev.type];
  const w = m.w;
  const group = new THREE.Group();
  const B = new Builder();
  B.add(rbox(w, 90, 60, 3), MAT.plcBody, M4(0, 45, 30));
  // terminal blocks sit a little below the top / above the bottom of the housing: flush faces on the
  // same plane z-fight (the strip on top of the PLC flickered while orbiting or when LEDs changed)
  B.add(rbox(w - 4, 18.6, 16, 1.6), MAT.termBlock, M4(0, 79.3, 52.5));
  B.add(rbox(w - 4, 18.6, 16, 1.6), MAT.termBlock, M4(0, 10.7, 52.5));
  B.add(rbox(w - 8, 44, 22, 3), MAT.plcFront, M4(0, 45, 71));
  B.add(box(30, 12, 18), MAT.darkPlastic, M4(0, -2, 20)); // DIN clip
  const ports = devicePorts(dev);
  for (const p of ports) {
    if (p.kind === 'term') addScrew(B, p.pos, p.dir, Math.min(2.3, (p.pitch || 7) * 0.33));
  }
  // left recess with USB, RUN/STOP and COM1
  const lx = -w / 2 + 17;
  B.add(rbox(24, 38, 2, 2), MAT.blackPlastic, M4(lx, 45, 81.5));
  B.add(box(8, 3.6, 2.4), MAT.steel, M4(lx, 57, 82.6));
  B.add(box(6, 1.6, 0.6), MAT.blackPlastic, M4(lx, 57, 83.9));
  B.add(cyl(5.6, 5.6, 1.4, 28), MAT.steel, M4(lx, 33, 82.4, Math.PI / 2));
  B.add(cyl(4.6, 4.6, 1.2, 28), MAT.blackPlastic, M4(lx, 33, 83, Math.PI / 2));
  B.add(box(9, 4.2, 1.2), MAT.blackPlastic, M4(lx, 45, 82.6));
  // COM2 header (bottom right)
  const com2 = ports.find((p) => p.id === 'COM2');
  B.add(box(17, 9, 6), MAT.blackPlastic, M4(com2.pos[0], com2.pos[1] + 1, 58));
  B.build(group);

  // front print
  const fw = w - 10;
  const xs0 = -w / 2 + 62, xs1 = w / 2 - 9;
  const n = Math.max(m.inputs, m.outputs);
  const pitch = Math.min(5.2, (xs1 - xs0) / Math.max(1, n - 1));
  const ledX = (i) => xs0 + i * pitch;
  const front = decal(fw, 42, (g, W, H) => {
    const X = (x) => x + W / 2, Y = (y) => 45 + 21 - y; // local → decal coords
    g.fillStyle = '#4a5260';
    for (const [t, y] of [['POWER', 58], ['RUN', 51], ['ERROR', 44]]) txt(g, t, X(-w / 2 + 40), Y(y), { size: 2.3, align: 'left', weight: 700, color: '#3b4250' });
    txt(g, 'RUN', X(lx), Y(49.3), { size: 2, weight: 800, color: '#cbd5e1' });
    txt(g, 'STOP', X(lx), Y(40.8), { size: 2, weight: 800, color: '#cbd5e1' });
    txt(g, 'COM1', X(lx), Y(26.6), { size: 2, weight: 800, color: '#cbd5e1' });
    txt(g, 'USB', X(lx), Y(61.4), { size: 2, weight: 800, color: '#cbd5e1' });
    txt(g, 'IN', X(xs0 - 7), Y(58), { size: 2.4, weight: 800, color: '#3b4250' });
    txt(g, 'OUT', X(xs0 - 7.5), Y(48), { size: 2.4, weight: 800, color: '#3b4250' });
    for (let i = 0; i < n; i++) {
      const lbl = i.toString(8);
      if (i < m.inputs) txt(g, lbl, X(ledX(i)), Y(54.6), { size: 1.9, weight: 700, color: '#596273' });
      if (i < m.outputs) txt(g, lbl, X(ledX(i)), Y(44.6), { size: 1.9, weight: 700, color: '#596273' });
    }
    g.fillStyle = 'rgba(40,50,70,.12)';
    rrect(g, X(xs0 - 3), Y(41), xs1 - xs0 + 6, 0.5, 0.2); g.fill();
    deltaLogo(g, X(w / 2 - 10), Y(33.5), 5.6, '#1d4f9c', 'right');
    txt(g, m.short, X(w / 2 - 10), Y(27), { size: 3.2, align: 'right', weight: 800, color: '#2a3140', font: FONT_D });
    if (m.ai) txt(g, 'AD 4CH · DA 2CH', X(-w / 2 + 40), Y(30), { size: 2.2, align: 'left', weight: 700, color: '#596273' });
    else txt(g, 'Programmable Logic Controller', X(-w / 2 + 40), Y(30), { size: 2, align: 'left', weight: 600, color: '#6b7280' });
  }, { ppm: 12 });
  front.position.set(0, 45, 82.05);
  group.add(front);

  // terminal labels
  const top = ports.filter((p) => p.kind === 'term' && p.pos[1] > 45);
  const bot = ports.filter((p) => p.kind === 'term' && p.pos[1] <= 45);
  const lt = labelStrip(w - 6, 4.6, top.map((p) => ({ x: p.pos[0], label: p.label, size: p.label.length > 3 ? 2 : 2.4 })));
  lt.position.set(0, 85.8, 60.65); group.add(lt);
  const lb = labelStrip(w - 6, 4.6, [...bot.map((p) => ({ x: p.pos[0], label: p.label, size: p.label.length > 3 ? 2 : 2.4 })), { x: com2.pos[0], label: 'D+ D− SG', size: 2 }]);
  lb.position.set(0, 4.2, 60.65); group.add(lb);

  // LEDs
  const leds = { pow: ledMat('#36ff6a'), run: ledMat('#36ff6a'), err: ledMat('#ff3b30'), x: [], y: [] };
  const ledGeo = rbox(2.8, 1.8, 1, 0.4);
  const addLed = (matl, x, y) => { const me = new THREE.Mesh(ledGeo, matl); me.position.set(x, y, 82.4); group.add(me); return me; };
  addLed(leds.pow, -w / 2 + 36.5, 58); addLed(leds.run, -w / 2 + 36.5, 51); addLed(leds.err, -w / 2 + 36.5, 44);
  for (let i = 0; i < m.inputs; i++) { const lm = ledMat('#36ff6a'); leds.x.push(lm); addLed(lm, ledX(i), 58); }
  for (let i = 0; i < m.outputs; i++) { const lm = ledMat('#ffb020'); leds.y.push(lm); addLed(lm, ledX(i), 48); }

  // RUN/STOP lever (interactive)
  const lever = new THREE.Group();
  lever.position.set(lx, 45, 83);
  const lv = new THREE.Mesh(rbox(3, 5, 4, 0.8), MAT.white);
  lv.position.set(0, 2, 2);
  lever.add(lv);
  group.add(lever);
  const hit = control(new THREE.Mesh(box(14, 12, 8), new THREE.MeshBasicMaterial({ visible: false })), dev.id, 'toggle', { label: 'RUN / STOP switch' });
  hit.position.set(lx, 45, 84);
  group.add(hit);

  let blink = 0;
  return {
    group, controls: [hit],
    update(rt, ctx) {
      const cpu = rt.cpu;
      let ch = false;
      const p = cpu.powered;
      blink = Math.floor(ctx.t * 3) % 2;
      ch = setLed(leds.pow.emissive ? leds.pow : leds.pow, p) || ch;
      ch = setLed(leds.run, p && cpu.running) || ch;
      ch = setLed(leds.err, p && cpu.errorFlag && blink) || ch;
      for (let i = 0; i < leds.x.length; i++) ch = setLed(leds.x[i], p && cpu.X[i], 2) || ch;
      for (let i = 0; i < leds.y.length; i++) ch = setLed(leds.y[i], p && cpu.Y[i], 2) || ch;
      const ang = rt.dev.state.run !== false ? -0.5 : 0.5;
      if (lever.rotation.x !== ang) { lever.rotation.x = ang; ch = true; }
      return ch;
    },
  };
}

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
const VFD_KEYS = [
  { k: 'MODE', x: -27, y: 131, w: 19, h: 10, label: 'MODE' },
  { k: 'UP', x: 0, y: 131, w: 19, h: 10, label: '▲' },
  { k: 'ENTER', x: 27, y: 131, w: 19, h: 10, label: 'ENTER' },
  { k: 'LEFT', x: -27, y: 117, w: 19, h: 10, label: '◀' },
  { k: 'DOWN', x: 0, y: 117, w: 19, h: 10, label: '▼' },
  { k: 'RUN', x: -16, y: 103, w: 27, h: 10, label: 'RUN', color: '#15803d' },
  { k: 'STOP', x: 16, y: 103, w: 27, h: 10, label: 'STOP/RESET', color: '#b91c1c' },
];

function buildVfd(dev) {
  const group = new THREE.Group();
  const B = new Builder();
  const body = mat('vfdBody', { color: 0x2a2d33, roughness: 0.5 });
  const cover = mat('vfdCover', { color: 0x363a42, roughness: 0.45 });
  B.add(rbox(100, 190, 128, 4), body, M4(0, 95, 64));
  for (let i = 0; i < 9; i++) {
    const z = 14 + i * 7;
    B.add(box(3, 168, 1.6), MAT.alu, M4(-51.2, 95, z));
    B.add(box(3, 168, 1.6), MAT.alu, M4(51.2, 95, z));
  }
  B.add(rbox(96, 96, 22, 3), cover, M4(0, 141, 139));
  B.add(rbox(92, 28, 9, 1.5), MAT.blackPlastic, M4(0, 79.5, 132));
  B.add(rbox(92, 18, 10, 1.5), MAT.blackPlastic, M4(0, 22, 133));
  // RJ45 jack
  B.add(box(15, 13, 9), MAT.blackPlastic, M4(26, 54, 132.5));
  B.add(box(11, 8, 2), mat('rjHole', { color: 0x050506, roughness: 0.9 }), M4(26, 53, 136.2));
  B.add(box(9, 0.8, 1), MAT.gold, M4(26, 56.2, 136.6));
  // display window frame
  B.add(rbox(66, 22, 2, 2), MAT.blackPlastic, M4(0, 163, 150.4));
  for (const p of devicePorts(dev)) if (p.kind === 'term') addScrew(B, p.pos, p.dir, p.pos[1] < 40 ? 2.6 : 1.8);
  B.build(group);
  // keypad print
  const kp = decal(96, 96, (g, W) => {
    const Y = (y) => 189 - y;
    deltaLogo(g, 5, Y(182), 6.5, '#e8eef9');
    txt(g, 'MS300', W - 5, Y(182), { size: 4.6, align: 'right', weight: 800, color: '#9fb3cf', font: FONT_D });
    for (const [t, x] of [['RUN', -24], ['STOP', -8], ['FWD', 8], ['REV', 24]]) txt(g, t, 48 + x, Y(145.5), { size: 2.6, weight: 800, color: '#aab4c3' });
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 0.4;
    rrect(g, 6, Y(139), 84, 44, 3); g.stroke();
  }, { ppm: 10 });
  kp.position.set(0, 141, 150.06);
  group.add(kp);
  const lower = decal(96, 92, (g) => {
    const Y = (y) => 92 - y;
    txt(g, 'RS-485', 9 + 48, Y(54), { size: 2.6, weight: 800, color: '#cbd5e1' });
    g.fillStyle = '#f5c518'; rrect(g, 6, Y(61.5), 40, 12, 1.2); g.fill();
    g.fillStyle = '#111';
    g.beginPath(); g.moveTo(10, Y(51.5)); g.lineTo(13.5, Y(58.5)); g.lineTo(17, Y(51.5)); g.closePath(); g.fill();
    txt(g, '!', 13.5, Y(53.6), { size: 4, color: '#f5c518', weight: 900 });
    txt(g, 'DANGER', 19, Y(57.2), { size: 3, align: 'left', weight: 900, color: '#111' });
    txt(g, 'Hazardous voltage', 19, Y(52.8), { size: 2.3, align: 'left', weight: 700, color: '#111' });
    txt(g, 'VFD7A5MS21ANSAA · 1.5 kW · 1~230 V', 48, Y(40.5), { size: 2.6, weight: 700, color: '#94a3b8' });
  }, { ppm: 10 });
  lower.position.set(0, 46, 128.06);
  group.add(lower);
  const ports = devicePorts(dev);
  const ctrl1 = ports.filter((p) => p.pos[1] === 88), ctrl2 = ports.filter((p) => p.pos[1] === 72), pw = ports.filter((p) => p.pos[1] === 22);
  const l1 = labelStrip(92, 4, ctrl1.map((p) => ({ x: p.pos[0], label: p.label, size: 2.4 }))); l1.position.set(0, 83.6, 136.6); group.add(l1);
  const l2 = labelStrip(92, 4, ctrl2.map((p) => ({ x: p.pos[0], label: p.label, size: 2.4 }))); l2.position.set(0, 67.4, 136.6); group.add(l2);
  const l3 = labelStrip(96, 6, pw.map((p) => ({ x: p.pos[0], label: p.label, size: 2.8 })), { color: '#e2e8f0' }); l3.position.set(0, 8.5, 128.2); group.add(l3);
  // display
  const dispTex = canvasTexture(320, 96, () => {}, { mip: false });
  const dm = offsetMat(new THREE.MeshStandardMaterial({ color: 0x120404, emissive: 0xffffff, emissiveMap: dispTex, emissiveIntensity: 1, roughness: 0.2 }), 2);
  dm.toneMapped = false;
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(60, 18), dm);
  disp.position.set(0, 163, 151.5);
  group.add(disp);
  // status LEDs
  const sl = {};
  for (const [k, x] of [['RUN', -24], ['STOP', -8], ['FWD', 8], ['REV', 24]]) {
    sl[k] = ledMat(k === 'STOP' ? '#ff3b30' : '#36ff6a');
    const me = new THREE.Mesh(rbox(3.6, 2, 1, 0.5), sl[k]);
    me.position.set(x, 149.6, 150.6);
    group.add(me);
  }
  // keys
  const controls = [];
  const keyMeshes = {};
  for (const k of VFD_KEYS) {
    const kmat = k.color ? mat('vfdKey' + k.k, { color: k.color, roughness: 0.4 }) : mat('vfdKey', { color: 0x4a505b, roughness: 0.45 });
    const mesh = new THREE.Mesh(rbox(k.w, k.h, 3, 1.4), kmat);
    mesh.position.set(k.x, k.y, 151.5);
    const lbl = decal(k.w - 2, k.h - 2, (g, W, H) => txt(g, k.label, W / 2, H / 2 + 0.2, { size: k.label.length > 5 ? 2.5 : k.label.length > 1 ? 3 : 5, weight: 800, color: '#f8fafc' }), { ppm: 12 });
    lbl.position.z = 1.55;
    mesh.add(lbl);
    control(mesh, dev.id, 'vfdKey', { key: k.k, label: k.label });
    controls.push(mesh);
    keyMeshes[k.k] = mesh;
    group.add(mesh);
  }
  let last = '';
  return {
    group, controls,
    press(key) { const me = keyMeshes[key]; if (me) { me.position.z = 150.3; me.userData.upAt = performance.now() + 140; } },
    update(rt, ctx) {
      const v = rt.vfd;
      let ch = false;
      for (const me of Object.values(keyMeshes)) if (me.userData.upAt && performance.now() > me.userData.upAt) { me.position.z = 151.5; me.userData.upAt = 0; ch = true; }
      const d = v.display(ctx.t);
      for (const k of ['RUN', 'STOP', 'FWD', 'REV']) ch = setLed(sl[k], !!d.leds[k], 2) || ch;
      const blink = Math.floor(ctx.t * 3) % 2 === 0;
      const key = (d.off ? 'off' : d.text) + '|' + d.cursor + '|' + (d.cursor >= 0 ? blink : '') + JSON.stringify(d.leds);
      if (key !== last) {
        last = key;
        const c = dispTex.userData.canvas;
        const g = c.getContext('2d');
        g.fillStyle = '#0b0303';
        g.fillRect(0, 0, c.width, c.height);
        if (!d.off) {
          drawSegDisplay(g, 260, 96, d.text, { n: 5, cursor: d.editing || (d.cursor >= 0 && rt.vfd.kp.mode === 'F') ? d.cursor : -1, blink });
          const ind = [['F', d.leds.F], ['H', d.leds.H], ['A', d.leds.A], ['U', d.leds.U]];
          ind.forEach(([t, on], i) => txt(g, t, 290, 14 + i * 22, { size: 17, weight: 800, color: on ? '#ff5a3c' : 'rgba(255,80,60,.16)', font: FONT_D }));
        }
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
  B.add(cyl(2.4, 2.4, 2, 16), MAT.steel, M4(14, 78, 104.4, Math.PI / 2));
  B.add(box(30, 10, 14), MAT.darkPlastic, M4(0, -2, 20));
  for (const p of devicePorts(dev)) addScrew(B, p.pos, p.dir, 2.2);
  B.build(group);
  const front = decal(46, 80, (g, W, H) => {
    deltaLogo(g, W / 2, 8, 5.4, '#1d4f9c', 'center');
    txt(g, 'CliQ', W / 2, 16, { size: 3.4, weight: 800, color: '#64748b', font: FONT_D });
    txt(g, 'DC OK', 9, 32, { size: 2.6, weight: 800, color: '#374151', align: 'left' });
    txt(g, 'V.adj', 30, 30, { size: 2.4, weight: 700, color: '#374151', align: 'left' });
    txt(g, '24 V', W / 2, 48, { size: 8, weight: 800, color: '#111827', font: FONT_D });
    txt(g, '2.5 A · 60 W', W / 2, 56, { size: 3, weight: 700, color: '#4b5563' });
    txt(g, 'DRP024V060W1AZ', W / 2, 72, { size: 2.6, weight: 700, color: '#6b7280' });
  }, { ppm: 12 });
  front.position.set(0, 63, 104.06);
  group.add(front);
  const top = labelStrip(46, 4, [{ x: -15, label: 'L' }, { x: 0, label: 'N' }, { x: 15, label: '⏚' }], { size: 2.8 });
  top.position.set(0, 120.2, 100.7); group.add(top);
  const bot = labelStrip(46, 4, [{ x: -18, label: '+V' }, { x: -6, label: '+V' }, { x: 6, label: '−V' }, { x: 18, label: '−V' }], { size: 2.6 });
  bot.position.set(0, 4.6, 100.7); group.add(bot);
  const okLed = ledMat('#36ff6a');
  const l = new THREE.Mesh(cyl(1.6, 1.6, 1, 14), okLed);
  l.rotation.x = Math.PI / 2; l.position.set(-14, 72, 104.4);
  group.add(l);
  return {
    group, controls: [],
    update(rt) { return setLed(okLed, rt.powered && !rt.short, 2.2); },
  };
}

// ====================================================================== MCB + mains
function buildMcb(dev) {
  const group = new THREE.Group();
  const B = new Builder();
  B.add(rbox(36, 90, 64, 2.5), MAT.white, M4(-6, 45, 32));
  B.add(rbox(32, 44, 8, 2), MAT.white, M4(-6, 45, 67));
  B.add(rbox(10, 42, 50, 1.5), mat('peBlock', { color: 0x2f9e44, roughness: 0.5 }), M4(17, 45, 25));
  B.add(box(10.2, 6, 50.2), mat('peStripe', { color: 0xf5d90a, roughness: 0.5 }), M4(17, 38, 25));
  B.add(box(30, 10, 14), MAT.darkPlastic, M4(-6, -2, 20));
  for (const p of devicePorts(dev)) addScrew(B, p.pos, p.dir, 2.3);
  // line side screws (the mains cable from here is routed with the wiring, see devices/routing.js)
  addScrew(B, [-15, 80, 64], [0, 0.55, 0.83], 2.3);
  addScrew(B, [-3, 80, 64], [0, 0.55, 0.83], 2.3);
  B.build(group);
  const front = decal(32, 86, (g, W, H) => {
    txt(g, 'C10', W / 2, 9, { size: 5, weight: 800, color: '#111827', font: FONT_D });
    txt(g, '230/400 V~', W / 2, 15, { size: 2.6, weight: 700, color: '#4b5563' });
    g.strokeStyle = '#4b5563'; g.lineWidth = 0.35; rrect(g, 9, 70, 14, 7, 1); g.stroke();
    txt(g, '6000', W / 2, 73.6, { size: 2.6, weight: 700, color: '#374151' });
    txt(g, 'L', 9, 82, { size: 3, weight: 800, color: '#374151' });
    txt(g, 'N', 21, 82, { size: 3, weight: 800, color: '#374151' });
  }, { ppm: 12 });
  front.position.set(-6, 45, 64.06);
  group.add(front);
  const pel = labelStrip(12, 5, [{ x: 0, label: 'PE', size: 3 }], { color: '#111' });
  pel.position.set(17, 67, 50.2); group.add(pel);
  // indicator + lever
  const ind = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), offsetMat(new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.4 })));
  ind.position.set(-6, 60.5, 71.1);
  group.add(ind);
  const lever = new THREE.Group();
  lever.position.set(-6, 45, 71);
  const lv = new THREE.Mesh(rbox(10, 18, 7, 1.6), mat('mcbLever', { color: 0x1f3f8f, roughness: 0.45 }));
  lv.position.set(0, 7, 3);
  lever.add(lv);
  group.add(lever);
  const hit = control(new THREE.Mesh(box(30, 44, 16), new THREE.MeshBasicMaterial({ visible: false })), dev.id, 'toggle', { label: 'MCB' });
  hit.position.set(-6, 45, 74);
  group.add(hit);
  return {
    group, controls: [hit],
    update(rt) {
      const on = rt.dev.state.on;
      const a = on ? -0.55 : 0.75;
      if (lever.rotation.x === a) return false;
      lever.rotation.x = a;
      ind.material.color.set(on ? 0xd62828 : 0x2f9e44);
      return true;
    },
  };
}

// ====================================================================== console modules
function plate(dev, label, extraPrint) {
  const group = new THREE.Group();
  const B = new Builder();
  B.add(rbox(64, 86, 5, 2), mat('modPlate', { color: 0x252b35, roughness: 0.5, metalness: 0.2 }), M4(0, 43, 2.5));
  for (const p of devicePorts(dev)) addSocket(B, p.pos, p.dir, SOCK_BY_PORT[p.id] || '#1b1d22');
  const print = decal(64, 86, (g, W, H) => {
    txt(g, label, W / 2, 7.5, { size: 5.2, weight: 800, color: '#f1f5f9', font: FONT_D });
    for (const p of devicePorts(dev)) txt(g, p.label, p.pos[0] + W / 2, H - 7.5, { size: 3.4, weight: 800, color: '#94a3b8' });
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
  const { group, B } = plate(dev, pr.label || 'MODE', (g, W) => {
    txt(g, pr.pos0 || '0', W / 2 - 15, 20, { size: 3.2, weight: 800, color: '#cbd5e1' });
    txt(g, pr.pos1 || '1', W / 2 + 15, 20, { size: 3.2, weight: 800, color: '#cbd5e1' });
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
    update(rt) { const a = rt.dev.state.on ? -Math.PI / 4 : Math.PI / 4; if (knob.rotation.z === a) return false; knob.rotation.z = a; return true; },
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
  const { group, B } = plate(dev, pr.label || 'SENSOR', (g, W) => txt(g, 'PNP · NO', W / 2, 13, { size: 2.6, weight: 700, color: '#64748b' }));
  // M18 sensor lying along x, aimed at +x
  B.add(cyl(9, 9, 44, 24), mat('proxBody', { color: 0xb7a46a, metalness: 0.85, roughness: 0.32 }), M4(-6, 50, 12, 0, 0, Math.PI / 2));
  B.add(cyl(9.3, 9.3, 3, 6), MAT.steel, M4(-14, 50, 12, 0, 0, Math.PI / 2));
  B.add(cyl(9.3, 9.3, 3, 6), MAT.steel, M4(4, 50, 12, 0, 0, Math.PI / 2));
  B.add(cyl(8.6, 8.6, 3, 24), mat('proxFace', { color: 0x2563eb, roughness: 0.5 }), M4(17.5, 50, 12, 0, 0, Math.PI / 2));
  B.add(box(4, 22, 4), MAT.darkPlastic, M4(-20, 38, 8));
  B.build(group);
  const led = ledMat('#ffb020');
  const lm = new THREE.Mesh(cyl(2.2, 2.2, 2, 12), led);
  lm.rotation.z = Math.PI / 2; lm.position.set(-29, 50, 12);
  group.add(lm);
  const target = new THREE.Mesh(rbox(12, 22, 14, 1.5), MAT.steel);
  target.position.set(27, 50, 12);
  group.add(target);
  const hit = control(new THREE.Mesh(box(64, 40, 26), new THREE.MeshBasicMaterial({ visible: false })), dev.id, 'toggle', { label: 'Metal part in front of the sensor' });
  hit.position.set(0, 50, 12);
  group.add(hit);
  return {
    group, controls: [hit],
    update(rt) {
      let ch = setLed(led, rt.powered && rt.dev.state.target, 2.4);
      const here = !!rt.dev.state.target;
      const x = here ? 27 : 40;
      if (target.position.x !== x) { target.position.x = x; target.material = here ? MAT.steel : mat('targetGhost', { color: 0x8892a0, transparent: true, opacity: 0.3 }); ch = true; }
      return ch;
    },
  };
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
  plateD.position.set(-20, 100, 76);
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

// ====================================================================== laptop
function buildLaptop(dev, ctx) {
  const group = new THREE.Group();
  const B = new Builder();
  const shell = mat('laptop', { color: 0x3a3f48, metalness: 0.6, roughness: 0.38 });
  B.add(rbox(320, 14, 220, 6), shell, M4(0, 7, 110));
  B.add(box(4, 5, 12), MAT.blackPlastic, M4(-159.5, 8, 150));
  B.build(group);
  const kb = decal(296, 118, (g, W, H) => {
    g.fillStyle = '#1b1e24'; rrect(g, 0, 0, W, H, 4); g.fill();
    const rows = [14, 14, 13, 12, 11];
    const kw = 18.2, kh = 16, gap = 2.4;
    rows.forEach((n, r) => {
      const y = 6 + r * (kh + gap);
      const total = n * kw + (n - 1) * gap;
      let x = (W - total) / 2;
      for (let i = 0; i < n; i++) {
        g.fillStyle = '#2b2f37'; rrect(g, x, y, kw, kh, 2); g.fill();
        x += kw + gap;
      }
    });
    g.fillStyle = '#2b2f37'; rrect(g, W / 2 - 60, 6 + 5 * (kh + gap), 120, kh - 3, 2); g.fill();
  }, { ppm: 2.5, transparent: false });
  kb.rotation.x = -Math.PI / 2; kb.position.set(0, 14.05, 82);
  group.add(kb);
  const pad = decal(100, 58, (g, W, H) => { g.fillStyle = '#323741'; rrect(g, 0, 0, W, H, 5); g.fill(); }, { ppm: 2, transparent: true });
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

const BUILDERS = { plc: buildPlc, hmi: buildHmi, vfd: buildVfd, psu: buildPsu, mcb: buildMcb, pb: buildPushButton, estop: buildEstop, selector: buildSelector, lamp: buildLamp, buzzer: buildBuzzer, prox: buildProx, pot: buildPot, motor: buildMotor, laptop: buildLaptop };

export function buildModel(dev, ctx) {
  const def = DEVICE_DEFS[dev.type];
  const fn = def && BUILDERS[def.sim];
  if (!fn) return null;
  const model = fn(dev, ctx);
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
