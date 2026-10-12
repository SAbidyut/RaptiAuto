// 3D models of the Modbus RS-485 slaves (rail 2): the Delta DTB4848 temperature controller on its
// trainer carrier (with the oven heater window), the RS-485 temperature / humidity sensor and the
// DIN-rail energy meter. Each one shows its RS-485 terminals with the names printed next to them,
// TX / RX LEDs that blink with every frame and its station address. Same frame as models.js.
import { THREE, MAT, mat, ledMat, setLed, canvasTexture, decal, rbox, box, cyl, M4, Builder, addScrew, txt, deltaLogo, offsetMat, FONT_D } from './kit.js';
import { devicePorts, deviceProps } from '../devices/defs.js';
import { mbStation, mbFormat } from '../sim/mbdevices.js';
import { fmtName } from '../sim/modbus.js';
import { drawSegDisplay } from './sevenseg.js';

const hidden = () => new THREE.MeshBasicMaterial({ visible: false });
function control(mesh, devId, action, extra = {}) { mesh.userData.control = { devId, action, ...extra }; return mesh; }

/** TX / RX LEDs at (x, y, z); returns an update(mb) → changed. */
function commLeds(group, x, y, z, gap = 7) {
  const tx = ledMat('#36ff6a'), rx = ledMat('#ffb020');
  for (const [m, dx] of [[tx, 0], [rx, gap]]) {
    const me = new THREE.Mesh(cyl(1.25, 1.25, 1, 12), m);
    me.rotation.x = Math.PI / 2; me.position.set(x + dx, y, z + 0.4);
    group.add(me);
  }
  // a frame lights the LED for 70 ms of simulated time, so even a fast bus blinks visibly
  return (mb) => {
    const t = mb.time, on = mb.powered;
    return setLed(tx, on && t - mb.stat.lastTx < 0.07, 2) | setLed(rx, on && t - mb.stat.lastRx < 0.07, 2);
  };
}

/** Labels for a row of terminals (local x of each). */
function termLabels(w, items, color = '#111827') {
  return decal(w, 4.4, (g, W, H) => { for (const it of items) txt(g, it.label, it.x + W / 2, H / 2, { size: it.size || 2.5, weight: 800, color }); }, { ppm: 14 });
}

/** "ID 2 · 9600 8E1 RTU" print. */
const commText = (pr) => { const f = mbFormat(pr); return `ID ${mbStation(pr)} · ${fmtName(f).replace(/^(\d+) /, '$1 ')}`; };

// ====================================================================== Delta DTB4848
// 48 × 48 mm controller in a grey trainer carrier: L / N on top, the heater window of the oven, the
// bezel (PV red, SV green, OUT1 / OUT2 / AT / ALM LEDs, SET ◀ ▼ ▲) and the RS-485 D+ / D− terminals
// with TX / RX at the bottom.
export function buildTempController(dev) {
  const pr = deviceProps(dev);
  const group = new THREE.Group();
  const B = new Builder();
  const carrier = mat('dtbCarrier', { color: 0xc9cdd2, roughness: 0.55 });
  B.add(rbox(56, 124, 60, 3), carrier, M4(0, 62, 30));
  B.add(rbox(44, 13, 12, 1.5), MAT.termBlock, M4(0, 113, 60));
  B.add(rbox(30, 13, 12, 1.5), MAT.termBlock, M4(0, 9, 60));
  B.add(box(30, 10, 14), MAT.darkPlastic, M4(0, -2, 20));
  // bezel + body of the controller
  B.add(rbox(48, 48, 12, 2), mat('dtbBezel', { color: 0x1c1e22, roughness: 0.45 }), M4(0, 66, 66));
  B.add(rbox(44, 44, 1, 1.5), mat('dtbFace', { color: 0x0b0c0e, roughness: 0.3 }), M4(0, 66, 72));
  // heater window (oven) and its frame
  B.add(rbox(40, 10, 2, 1.5), MAT.blackPlastic, M4(0, 35, 60.6));
  for (const p of devicePorts(dev)) {
    if (p.kind === 'term') addScrew(B, p.pos, p.dir, 2.1);
    else for (const dx of [-3, 3]) addScrew(B, [p.pos[0] + dx, p.pos[1], p.pos[2]], p.dir, 1.9);
  }
  B.build(group);
  // carrier print
  const print = decal(56, 124, (g, W, H) => {
    const Y = (y) => H - y;
    txt(g, 'L', W / 2 - 9, Y(104), { size: 3, weight: 800, color: '#7c4a1e' });
    txt(g, 'N', W / 2 + 9, Y(104), { size: 3, weight: 800, color: '#1d4ed8' });
    txt(g, '100–240 V~', W / 2, Y(98.5), { size: 2.2, weight: 700, color: '#374151' });
    txt(g, `${pr.label || 'OVEN'} · ${commText(pr)}`, W / 2, Y(94), { size: 2.2, weight: 800, color: '#1d4f9c' });
    txt(g, 'OVEN HEATER 500 W', W / 2, Y(28.1), { size: 2, weight: 800, color: '#7f1d1d' });
    txt(g, 'RS-485', W / 2 - 4, Y(21.2), { size: 2.3, weight: 800, color: '#111827', align: 'right' });
    txt(g, 'TX', W / 2 + 2.6, Y(24.6), { size: 1.7, weight: 800, color: '#374151' });
    txt(g, 'RX', W / 2 + 9.6, Y(24.6), { size: 1.7, weight: 800, color: '#374151' });
    txt(g, 'D+', W / 2 - 3, Y(17.6), { size: 2.4, weight: 800, color: '#111827' });
    txt(g, 'D−', W / 2 + 3.4, Y(17.6), { size: 2.4, weight: 800, color: '#1d4ed8' });
  }, { ppm: 12 });
  print.position.set(0, 62, 60.06);
  group.add(print);
  const leds = commLeds(group, 2.6, 21.2, 60);
  // oven heater coil: glows with the heater power
  const coilMat = new THREE.MeshStandardMaterial({ color: 0x3a2a24, emissive: 0xff5a1f, emissiveIntensity: 0, roughness: 0.5 });
  coilMat.toneMapped = false;
  const coil = new THREE.Group();
  for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(box(1.1, 6, 1), coilMat); c.position.set(-16 + i * 4, 0, 0); c.rotation.z = i % 2 ? 0.35 : -0.35; coil.add(c); }
  coil.position.set(0, 35, 61.4);
  group.add(coil);
  const glass = new THREE.Mesh(rbox(38, 8, 1, 1), new THREE.MeshStandardMaterial({ color: 0xd8e3ee, roughness: 0.05, transparent: true, opacity: 0.25 }));
  glass.position.set(0, 35, 62.2);
  group.add(glass);
  // bezel print: logo, model, LED and key names
  const face = decal(44, 44, (g, W, H) => {
    const X = (x) => x + W / 2, Y = (y) => H / 2 - y;
    deltaLogo(g, X(-19), Y(18.2), 2.6, '#e5e7eb');
    txt(g, 'DTB', X(19), Y(18.4), { size: 2.6, weight: 800, color: '#9ca3af', align: 'right', font: FONT_D });
    txt(g, 'PV', X(-17), Y(13.6), { size: 2, weight: 800, color: '#ef4444' });
    txt(g, 'SV', X(-17), Y(-2.8), { size: 2, weight: 800, color: '#22c55e' });
    [['OUT1', 8.2], ['OUT2', 4.6], ['AT', 1], ['ALM', -6.6]].forEach(([t, y]) => txt(g, t, X(-17.4), Y(y), { size: 1.35, weight: 700, color: '#cbd5e1', align: 'left' }));
    txt(g, '°C', X(19.4), Y(13.6), { size: 2, weight: 800, color: '#e5e7eb', align: 'right' });
  }, { ppm: 14 });
  face.position.set(0, 66, 72.56);
  group.add(face);
  // PV / SV display
  const dispTex = canvasTexture(330, 260, () => {}, { mip: false });
  const dm = offsetMat(new THREE.MeshStandardMaterial({ color: 0x070303, emissive: 0xffffff, emissiveMap: dispTex, emissiveIntensity: 1, roughness: 0.2 }), 2);
  dm.toneMapped = false;
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(30, 23.6), dm);
  disp.position.set(5.6, 70, 72.62);
  control(disp, dev.id, 'tcCard', { label: 'Oven controller: SV, RUN / STOP' });
  group.add(disp);
  const L = {};
  [['OUT1', 8.2, '#36ff6a'], ['OUT2', 4.6, '#36ff6a'], ['AT', 1, '#ffb020'], ['ALM', -6.6, '#ff3b30']].forEach(([k, y, c]) => {
    L[k] = ledMat(c);
    const me = new THREE.Mesh(rbox(1.8, 1.3, 0.6, 0.3), L[k]);
    me.position.set(-19.8, 66 + y, 72.7);
    group.add(me);
  });
  // keys: SET ◀ ▼ ▲
  const controls = [disp];
  const keyMeshes = {};
  [['SET', -15, 'SET'], ['SHIFT', -5, '◀'], ['DOWN', 5, '▼'], ['UP', 15, '▲']].forEach(([k, x, t]) => {
    const me = new THREE.Mesh(rbox(8.4, 5, 1.6, 1), mat('dtbKey', { color: 0x3b3f46, roughness: 0.4 }));
    me.position.set(x, 66 - 17.6, 73);
    const lbl = decal(8, 4.6, (g, W, H) => txt(g, t, W / 2, H / 2 + 0.1, { size: t.length > 1 ? 2.4 : 3.2, weight: 800, color: '#e5e7eb' }), { ppm: 16 });
    lbl.position.z = 0.82;
    me.add(lbl);
    control(me, dev.id, 'tcKey', { key: k, label: k === 'UP' ? 'SV + 1 °C' : k === 'DOWN' ? 'SV − 1 °C' : 'Oven controller' });
    keyMeshes[k] = me;
    controls.push(me);
    group.add(me);
  });
  let last = '';
  return {
    group, controls,
    press(k) { const me = keyMeshes[k]; if (me) { me.position.z = 72.3; me.userData.upAt = performance.now() + 140; } },
    update(rt, ctx) {
      const tc = rt.mb;
      if (!tc) return false;
      let ch = leds(tc);
      for (const me of Object.values(keyMeshes)) if (me.userData.upAt && performance.now() > me.userData.upAt) { me.position.z = 73; me.userData.upAt = 0; ch = true; }
      const s = rt.dev.state, on = tc.powered;
      ch = setLed(L.OUT1, tc.out1, 2) || ch;
      ch = setLed(L.AT, tc.tuning && Math.floor(ctx.t * 2) % 2, 2) || ch;
      ch = setLed(L.ALM, tc.alarm && Math.floor(ctx.t * 3) % 2, 2) || ch;
      const k = on ? Math.min(1, tc.pv / 220) * 1.6 + tc.out / 100 * 0.6 : Math.max(0, (tc.pv - 40) / 400);
      if (Math.abs(coilMat.emissiveIntensity - k) > 0.01) { coilMat.emissiveIntensity = k; ch = true; }
      const pvT = tc.pv >= 999.95 || tc.pv <= -99.95 ? String(Math.round(tc.pv)) : tc.pv.toFixed(1);
      const svT = !s.run ? 'StoP' : s.mode === 2 ? `${Math.round(tc.out)}` : s.sv >= 999.95 ? String(Math.round(s.sv)) : s.sv.toFixed(1);
      const key = on ? pvT + '|' + svT : 'off';
      if (key !== last) {
        last = key;
        const c = dispTex.userData.canvas, g = c.getContext('2d');
        g.fillStyle = '#070303'; g.fillRect(0, 0, c.width, c.height);
        if (on) {
          g.save(); drawSegDisplay(g, 330, 128, pvT, { n: 4, on: '#ff3b2f', off: 'rgba(255,60,40,.08)' }); g.restore();
          g.save(); g.translate(0, 152); drawSegDisplay(g, 330, 108, svT, { n: 4, on: '#3dff6e', off: 'rgba(60,255,110,.07)' }); g.restore();
        }
        dispTex.needsUpdate = true;
        ch = true;
      }
      return ch;
    },
  };
}

// ====================================================================== RS-485 temperature / humidity sensor
export function buildThSensor(dev) {
  const pr = deviceProps(dev);
  const group = new THREE.Group();
  const B = new Builder();
  const shell = mat('thShell', { color: 0xeef0ee, roughness: 0.45 });
  B.add(rbox(54, 100, 34, 5), shell, M4(0, 50, 17));
  B.add(rbox(50, 76, 3, 3), mat('thCover', { color: 0xf8f9f8, roughness: 0.35 }), M4(0, 58, 34.6));
  B.add(rbox(42, 24, 1.4, 1.5), mat('thLcdFrame', { color: 0x3a3f47, roughness: 0.5 }), M4(0, 76, 36.2));
  for (let i = 0; i < 6; i++) B.add(rbox(30, 1.4, 1, 0.6), mat('thVent', { color: 0x9aa1aa, roughness: 0.7 }), M4(0, 39 + i * 3.2, 36.3));
  B.add(rbox(44, 11, 8, 1.2), MAT.greenPlug, M4(0, 8, 32));
  for (const p of devicePorts(dev)) {
    if (p.kind === 'term') addScrew(B, p.pos, p.dir, 1.8);
    else for (const dx of [-3, 3]) addScrew(B, [p.pos[0] + dx, p.pos[1], p.pos[2]], p.dir, 1.8);
  }
  B.build(group);
  const print = decal(50, 76, (g, W, H) => {
    const Y = (y) => H / 2 - (y - 58);
    txt(g, 'TEMP · HUMIDITY', W / 2, Y(92), { size: 2.6, weight: 800, color: '#334155', font: FONT_D });
    txt(g, pr.label || 'SENSOR', W / 2, Y(60.5), { size: 3.2, weight: 800, color: '#0f172a', font: FONT_D });
    txt(g, `RS-485 · ${commText(pr)}`, W / 2, Y(24.2), { size: 2, weight: 700, color: '#1d4f9c' });
    txt(g, 'TX', W / 2 + 13, Y(34), { size: 1.7, weight: 800, color: '#475569' });
    txt(g, 'RX', W / 2 + 20, Y(34), { size: 1.7, weight: 800, color: '#475569' });
    txt(g, '10–30 V DC', W / 2 - 12, Y(30.4), { size: 1.8, weight: 700, color: '#475569' });
  }, { ppm: 12 });
  print.position.set(0, 58, 36.15);
  group.add(print);
  const lbl = termLabels(46, devicePorts(dev).flatMap((p) => (p.kind === 'term' ? [{ x: p.pos[0], label: p.id === 'V-' ? 'V−' : p.id }] : [{ x: p.pos[0] - 3, label: 'A+' }, { x: p.pos[0] + 3, label: 'B−' }])));
  lbl.position.set(0, 16.4, 34.6);
  group.add(lbl);
  const leds = commLeds(group, 13, 30.4, 35.6);
  // reflective LCD: dark segments on grey-green, temperature large and humidity small
  const lcdTex = canvasTexture(380, 190, () => {}, { mip: false });
  const lm = offsetMat(new THREE.MeshStandardMaterial({ map: lcdTex, roughness: 0.35, emissive: 0xffffff, emissiveMap: lcdTex, emissiveIntensity: 0.12 }), 2);
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(38, 19), lm);
  lcd.position.set(0, 76, 37);
  group.add(lcd);
  const hit = control(new THREE.Mesh(box(54, 80, 20), hidden()), dev.id, 'thCard', { label: `${pr.label || 'Sensor'}: temperature / humidity` });
  hit.position.set(0, 58, 40);
  group.add(hit);
  let last = '';
  return {
    group, controls: [hit],
    update(rt) {
      const th = rt.mb;
      if (!th) return false;
      let ch = leds(th);
      const on = th.powered;
      const key = on ? th.temp.toFixed(1) + '|' + th.rh.toFixed(1) : 'off';
      if (key !== last) {
        last = key;
        const c = lcdTex.userData.canvas, g = c.getContext('2d');
        g.fillStyle = on ? '#b9c7ae' : '#8d978a'; g.fillRect(0, 0, c.width, c.height);
        if (on) {
          const ink = '#1d2419', ghost = 'rgba(0,0,0,.05)';
          g.save(); drawSegDisplay(g, 270, 112, th.temp.toFixed(1), { n: 4, on: ink, off: ghost }); g.restore();
          txt(g, '°C', 330, 56, { size: 46, weight: 800, color: ink });
          g.save(); g.translate(120, 112); drawSegDisplay(g, 170, 72, th.rh.toFixed(1), { n: 4, on: ink, off: ghost }); g.restore();
          txt(g, '%RH', 330, 150, { size: 32, weight: 800, color: ink });
          txt(g, 'RH', 60, 150, { size: 30, weight: 800, color: ink });
        }
        lcdTex.needsUpdate = true;
        ch = true;
      }
      return ch;
    },
  };
}

// ====================================================================== energy meter
const PAGES = [['V', (m) => m.V.toFixed(1)], ['A', (m) => m.I.toFixed(2)], ['W', (m) => Math.round(m.P).toString()], ['kWh', (m) => (m.dev.state.wh / 1000).toFixed(3)]];

export function buildEnergyMeter(dev) {
  const pr = deviceProps(dev);
  const group = new THREE.Group();
  const B = new Builder();
  B.add(rbox(36, 90, 64, 2.5), MAT.white, M4(0, 45, 32));
  B.add(rbox(32, 48, 4, 2), mat('emFront', { color: 0xe5e8eb, roughness: 0.45 }), M4(0, 45, 64.5));
  B.add(rbox(28, 13, 1.2, 1), mat('emLcdFrame', { color: 0x2f343b, roughness: 0.5 }), M4(0, 57, 66.6));
  B.add(rbox(30, 12, 10, 1.4), MAT.termBlock, M4(0, 82, 60));
  B.add(rbox(18, 12, 10, 1.4), MAT.termBlock, M4(0, 8, 60));
  B.add(box(30, 10, 14), MAT.darkPlastic, M4(0, -2, 20));
  for (const p of devicePorts(dev)) {
    if (p.kind === 'term') addScrew(B, p.pos, p.dir, 2.1);
    else for (const dx of [-3, 3]) addScrew(B, [p.pos[0] + dx, p.pos[1], p.pos[2]], p.dir, 1.9);
  }
  B.build(group);
  const front = decal(32, 48, (g, W, H) => {
    const Y = (y) => H / 2 - (y - 45);
    txt(g, `kWh · ${pr.label || 'METER'}`, W / 2, Y(66.6), { size: 2.4, weight: 800, color: '#111827', font: FONT_D });
    txt(g, 'imp', W / 2 - 10, Y(42.2), { size: 1.7, weight: 800, color: '#475569' });
    txt(g, 'TX', W / 2 + 4, Y(42.2), { size: 1.7, weight: 800, color: '#475569' });
    txt(g, 'RX', W / 2 + 10, Y(42.2), { size: 1.7, weight: 800, color: '#475569' });
    txt(g, '230 V  5(40) A  50 Hz', W / 2, Y(36.6), { size: 1.75, weight: 700, color: '#374151' });
    txt(g, '1000 imp/kWh · cl. 1', W / 2, Y(33.4), { size: 1.6, weight: 700, color: '#6b7280' });
    txt(g, 'Modbus RTU', W / 2, Y(28.4), { size: 2, weight: 800, color: '#1d4f9c' });
    txt(g, commText(pr), W / 2, Y(25), { size: 1.75, weight: 700, color: '#1d4f9c' });
  }, { ppm: 14 });
  front.position.set(0, 45, 66.56);
  group.add(front);
  const top = termLabels(32, [{ x: -8, label: 'L', size: 3 }, { x: 8, label: 'N', size: 3 }]);
  top.position.set(0, 73.4, 64.1); group.add(top);
  const bot = termLabels(32, [{ x: -3, label: 'A+' }, { x: 3, label: 'B−' }]);
  bot.position.set(0, 16.6, 64.1); group.add(bot);
  const leds = commLeds(group, 4, 45, 66.2, 6);
  const imp = ledMat('#ff3b30');
  const im = new THREE.Mesh(cyl(1.25, 1.25, 1, 12), imp); im.rotation.x = Math.PI / 2; im.position.set(-10, 45, 66.6); group.add(im);
  const lcdTex = canvasTexture(300, 120, () => {}, { mip: false });
  const lm = offsetMat(new THREE.MeshStandardMaterial({ map: lcdTex, roughness: 0.35, emissive: 0xffffff, emissiveMap: lcdTex, emissiveIntensity: 0.15 }), 2);
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(26, 10.4), lm);
  lcd.position.set(0, 57, 67.3);
  group.add(lcd);
  const hit = control(new THREE.Mesh(box(34, 50, 14), hidden()), dev.id, 'toggle', { label: 'Energy meter: next display page' });
  hit.position.set(0, 45, 70);
  group.add(hit);
  let last = '', pulse = 0, lastWh = -1;
  return {
    group, controls: [hit],
    update(rt, ctx) {
      const m = rt.mb;
      if (!m) return false;
      let ch = leds(m);
      // the imp LED flashes once per Wh (1000 imp/kWh)
      const wh = Math.floor(m.dev.state.wh);
      if (lastWh >= 0 && wh !== lastWh) pulse = 0.12;
      lastWh = wh;
      pulse = Math.max(0, pulse - ctx.dt);
      ch = setLed(imp, m.powered && pulse > 0, 2) || ch;
      const [unit, fn] = PAGES[m.page % 4];
      const key = m.powered ? unit + fn(m) : 'off';
      if (key !== last) {
        last = key;
        const c = lcdTex.userData.canvas, g = c.getContext('2d');
        g.fillStyle = m.powered ? '#b7c6c9' : '#8b9496'; g.fillRect(0, 0, c.width, c.height);
        if (m.powered) {
          const ink = '#16202a';
          g.save(); drawSegDisplay(g, 220, 120, fn(m), { n: 6, on: ink, off: 'rgba(0,0,0,.05)' }); g.restore();
          txt(g, unit, 260, 64, { size: unit.length > 2 ? 28 : unit.length > 1 ? 34 : 46, weight: 800, color: ink });
        }
        lcdTex.needsUpdate = true;
        ch = true;
      }
      return ch;
    },
  };
}

export const MODBUS_BUILDERS = { tc: buildTempController, mbth: buildThSensor, meter: buildEnergyMeter };
