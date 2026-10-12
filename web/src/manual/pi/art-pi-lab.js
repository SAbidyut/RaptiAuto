// Pictures of chapter P3: the circuit canvas, adding parts, drawing wires, the breadboard, power on, the pinout screen, damage.
import { K, T, R, L, P, AR, DOT, BADGE, fig, WC, PC, cable, arch, breadboard, ledG, resG, headerStrip } from './art-pi-kit.js';
import { UI, boardArt, placeScreen, screenPinout, tabsN } from './art-pi-screens.js';
import { piPinXY } from '../../pi/boards.js';

/** Header pin position on a board drawing placed at (bx, by) with scale sc. */
const hp = (bx, by, sc, phys) => { const p = piPinXY(phys); return [bx + (p.x + 30) * sc * 0.1 * 10, by + (p.y + 20) * sc * 0.1 * 10]; };
const finger = (x, y) => `<circle cx="${x}" cy="${y}" r="11" fill="#fff" fill-opacity=".22" stroke="#fff" stroke-opacity=".8" stroke-width="1.4"/><circle cx="${x}" cy="${y}" r="3" fill="#fff"/>`;
const grid = (x, y, w, h) => { let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#080e1d" stroke="#1e293b"/>`; for (let gx = x + 14; gx < x + w - 6; gx += 16) for (let gy = y + 14; gy < y + h - 6; gy += 16) s += `<circle cx="${gx}" cy="${gy}" r=".8" fill="#1d2b4a"/>`; return s; };

export function heroCircuit() {
  const bx = 42, by = 110, sc = 0.28;
  let s = grid(6, 6, 348, 282);
  s += boardArt('pi5', bx, by, sc);
  const p11 = hp(bx, by, sc, 11), p9 = hp(bx, by, sc, 9), p3 = hp(bx, by, sc, 3), p6 = hp(bx, by, sc, 6);
  // LED chain above the header
  const ry = 66;
  s += cable([[p11[0], p11[1]], [p11[0], ry], [118, ry]], WC.org) + resG([118, ry], [152, ry], 330, { label: true }) + cable([[152, ry], [190, ry]], WC.org);
  s += ledG([190, ry + 12], [214, ry + 12], 'red', { on: true, lift: 12 }).replace('</g>', '</g>');
  s += cable([[214, ry + 12], [214, 92], [p9[0], 92], [p9[0], p9[1]]], WC.blk);
  // button on GPIO2 to GND
  s += `<rect x="262" y="48" width="30" height="24" rx="4" fill="#1f2937" stroke="#0b1226"/><circle cx="277" cy="60" r="7" fill="#3b82f6" stroke="#93c5fd"/>`;
  s += cable([[p3[0], p3[1]], [p3[0], 84], [262, 84], [262, 70]], WC.blu) + cable([[292, 60], [320, 60], [320, 100], [p6[0], 100], [p6[0], p6[1]]], WC.blk);
  s += R(14, 14, 82, 22, { fill: '#0b1226', stroke: '#1e293b', rx: 9 }) + T(24, 29, '</> blink.py ›', { size: 9, fill: K.ink, mono: true });
  s += R(262, 14, 84, 24, { fill: '#dc2626', stroke: 'none', rx: 9 }) + `<rect x="272" y="21" width="10" height="10" rx="2" fill="#fff"/>` + T(289, 30, 'Stop', { size: 11, weight: 800, fill: '#fff' });
  s += R(130, 14, 124, 20, { fill: 'rgba(34,197,94,.14)', stroke: 'rgba(34,197,94,.5)', rx: 10 }) + `<circle cx="142" cy="24" r="3.5" fill="${UI.run}"/>` + T(150, 27.5, 'Python running', { size: 9.5, fill: '#86efac', weight: 700 });
  return fig(360, 296, s, 'The circuit canvas: the Pi board, an LED with its resistor and a button, wired to the header pins. While Python runs the LED really lights.');
}

const mini = (x, y, w = 104, h = 150) => R(x, y, w, h, { fill: UI.bg, stroke: '#475569', rx: 9 });
const bar = (x, y, w) => R(x + 4, y + 4, w - 8, 10, { fill: UI.bar, stroke: 'none', rx: 3 }) + `<rect x="${x + w - 30}" y="${y + 5}" width="18" height="8" rx="3" fill="${UI.run}"/>`;

export function addPartFlow() {
  let s = '';
  // 1: canvas with the plus button
  s += mini(8, 8) + bar(8, 8, 104) + R(26, 92, 68, 38, { fill: '#166534', stroke: '#22c55e', rx: 5 });
  for (let i = 0; i < 10; i++) s += `<rect x="${31 + i * 6.2}" y="96" width="3.4" height="3.4" fill="#d9ad3c"/><rect x="${31 + i * 6.2}" y="101" width="3.4" height="3.4" fill="#d9ad3c"/>`;
  s += `<circle cx="92" cy="128" r="11" fill="#6d5cf0"/>` + L(87, 128, 97, 128, { stroke: '#fff', sw: 2 }) + L(92, 123, 92, 133, { stroke: '#fff', sw: 2 }) + finger(92, 128);
  s += T(60, 172, 'tap ＋', { size: 10, anchor: 'middle', weight: 800, fill: K.acc });
  // 2: the library
  s += mini(128, 8) + R(134, 40, 92, 116, { fill: '#0f1a33', stroke: '#334155', rx: 8 }) + T(180, 54, 'Add a part to the Pi', { size: 7.6, anchor: 'middle', weight: 800 });
  s += R(140, 60, 80, 12, { fill: '#0b1226', stroke: '#334155', rx: 6 }) + T(146, 69, 'Search…', { size: 6.5, fill: K.dim });
  ['All', 'LEDs', 'Input', 'Sensors'].forEach((t, i) => { s += R(140 + i * 21, 76, 19, 9, { fill: i === 1 ? 'rgba(34,211,238,.2)' : K.box, stroke: i === 1 ? K.acc : K.line, rx: 4 }) + T(149.5 + i * 21, 82.8, t, { size: 4.8, anchor: 'middle' }); });
  [['LED', '#ef4444'], ['RGB', '#a855f7'], ['Buzzer', '#475569'], ['Lamp', '#facc15']].forEach(([t, c], i) => { const x = 140 + (i % 2) * 41, y = 92 + Math.floor(i / 2) * 31; s += R(x, y, 39, 28, { fill: K.box, stroke: K.line, rx: 5 }) + `<circle cx="${x + 19.5}" cy="${y + 10}" r="5" fill="${c}"/>` + T(x + 19.5, y + 24, t, { size: 6, anchor: 'middle' }); });
  s += finger(160, 106) + T(180, 172, 'pick the LED', { size: 10, anchor: 'middle', weight: 800, fill: K.acc });
  // 3: placed
  s += mini(248, 8) + bar(248, 8, 104) + R(266, 92, 68, 38, { fill: '#166534', stroke: '#22c55e', rx: 5 });
  for (let i = 0; i < 10; i++) s += `<rect x="${271 + i * 6.2}" y="96" width="3.4" height="3.4" fill="#d9ad3c"/><rect x="${271 + i * 6.2}" y="101" width="3.4" height="3.4" fill="#d9ad3c"/>`;
  s += `<circle cx="300" cy="66" r="9" fill="#ef4444"/>` + L(297, 75, 297, 82, { stroke: '#cbd5e1' }) + L(303, 75, 303, 82, { stroke: '#cbd5e1' }) + `<rect x="286" y="52" width="28" height="30" rx="8" fill="none" stroke="${K.acc}" stroke-dasharray="3 2"/>`;
  s += R(254, 136, 92, 14, { fill: '#0b1226', stroke: '#334155', rx: 6 }) + T(300, 146, 'Rotate · Mirror · Edit · Delete', { size: 5.6, anchor: 'middle', fill: K.ink });
  s += T(300, 172, 'it appears above the board', { size: 8.5, anchor: 'middle', weight: 800, fill: K.acc });
  s += AR(113, 82, 127, 82, { m: 'mfb', stroke: K.acc }) + AR(233, 82, 247, 82, { m: 'mfb', stroke: K.acc });
  return fig(360, 184, s, 'Adding a part: tap ＋, choose a part from the library, and it is placed in free space above the board, ready to move and wire.');
}

export function wireFlow() {
  const panel = (x, y, n, title, inner) => R(x, y, 172, 128, { fill: '#080e1d', stroke: '#1e293b', rx: 10 }) + inner + BADGE(x + 12, y + 12, n) + T(x + 86, y + 142, title, { size: 9.4, anchor: 'middle', weight: 800, fill: K.ink });
  const hdr = (x, y, hot) => { let s = R(x + 14, y + 80, 144, 40, { fill: '#166534', stroke: '#22c55e', rx: 6 }); for (let i = 0; i < 6; i++) { const px = x + 28 + i * 22; const lab = [14, 15, 18, 'GND', 23, 24][i], lab2 = [4, 'GND', 17, 27, 22, '3V3'][i]; s += `<rect x="${px - 8}" y="${y + 86}" width="16" height="12" rx="3" fill="${i === 3 ? '#9ca3af' : '#facc15'}"/>` + T(px, y + 95.5, String(lab), { size: 6.5, anchor: 'middle', weight: 800, fill: '#0b1226' }) + `<rect x="${px - 8}" y="${y + 101}" width="16" height="12" rx="3" fill="${i === 1 ? '#9ca3af' : i === 5 ? '#fb923c' : '#facc15'}" stroke="${hot && i === 2 ? '#fff' : 'none'}" stroke-width="1.6"/>` + T(px, y + 110.5, String(lab2), { size: 6.5, anchor: 'middle', weight: 800, fill: '#0b1226' }); } return s; };
  const led = (x, y) => `<circle cx="${x}" cy="${y}" r="8" fill="#ef4444"/>` + L(x - 4, y + 7, x - 4, y + 20, { stroke: '#cbd5e1' }) + L(x + 4, y + 7, x + 4, y + 20, { stroke: '#cbd5e1' }) + T(x - 4, y + 32, 'A', { size: 7, anchor: 'middle', fill: K.dim });
  const X1 = 8, X2 = 188, Y1 = 8, Y2 = 164;
  let s = '';
  s += panel(X1, Y1, 1, 'Tap a pin of the part', grid(X1 + 4, Y1 + 4, 164, 72).replace(/<rect[^>]*rx="10"[^>]*\/>/, '') + led(X1 + 86, Y1 + 30) + hdr(X1, Y1) + finger(X1 + 82, Y1 + 50));
  s += panel(X2, Y1, 2, 'Tap a pin of the Pi', led(X2 + 86, Y1 + 30) + hdr(X2, Y1, true) + `<circle cx="${X2 + 82}" cy="${Y1 + 50}" r="3" fill="#fff"/>` + P(`M${X2 + 82} ${Y1 + 50} L${X2 + 72} ${Y1 + 75}`, { stroke: WC.grn, sw: 2, dash: '3 2' }) + finger(X2 + 72, Y1 + 107));
  s += panel(X1, Y2, 3, 'The wire is drawn', led(X1 + 86, Y2 + 30) + hdr(X1, Y2) + cable([[X1 + 82, Y2 + 50], [X1 + 82, Y2 + 74], [X1 + 72, Y2 + 74], [X1 + 72, Y2 + 107]], WC.grn));
  s += panel(X2, Y2, 4, 'Tap empty space to bend it', led(X2 + 86, Y2 + 30) + hdr(X2, Y2) + cable([[X2 + 82, Y2 + 50], [X2 + 120, Y2 + 50], [X2 + 120, Y2 + 74], [X2 + 72, Y2 + 74], [X2 + 72, Y2 + 107]], WC.grn) + finger(X2 + 120, Y2 + 50));
  return fig(368, 312, s, 'Drawing a wire: tap a pin, optionally tap empty space to add bends, tap the end pin. Wires to a power pin turn red, wires to GND turn black by themselves.');
}

export function selectionBars() {
  const btn = (x, y, t, c = K.ink) => `<rect x="${x}" y="${y}" width="46" height="36" rx="9" fill="#101a30" stroke="#2a3858"/><rect x="${x + 16}" y="${y + 6}" width="14" height="12" rx="3" fill="none" stroke="${c}" stroke-width="1.6"/>` + T(x + 23, y + 30, t, { size: 8, anchor: 'middle', fill: c });
  let s = T(10, 16, 'A part is selected', { size: 10, weight: 800, fill: K.acc });
  s += R(6, 22, 348, 48, { fill: '#0b1226', stroke: '#1e293b', rx: 12 }) + T(14, 40, 'LED', { size: 11, weight: 800 }) + T(14, 53, 'Red', { size: 8.4, fill: K.dim });
  ['Rotate', 'Mirror', 'Flip', 'Edit'].forEach((t, i) => { s += btn(52 + i * 50, 28, t); });
  s += btn(252, 28, 'Copy') + btn(302, 28, 'Delete', K.err);
  s += T(10, 96, 'A wire is selected', { size: 10, weight: 800, fill: K.acc });
  s += R(6, 102, 348, 48, { fill: '#0b1226', stroke: '#1e293b', rx: 12 }) + T(14, 120, 'Wire', { size: 11, weight: 800 }) + T(14, 133, 'GPIO17 → R', { size: 8.4, fill: K.dim });
  s += `<rect x="94" y="108" width="62" height="36" rx="9" fill="#101a30" stroke="#2a3858"/><circle cx="110" cy="126" r="6" fill="${WC.grn}"/>` + T(134, 130, 'Colour', { size: 8.6, anchor: 'middle' }) + btn(162, 108, 'Straight') + btn(216, 108, 'Delete', K.err);
  s += T(10, 176, 'You are drawing a wire', { size: 10, weight: 800, fill: K.acc });
  s += R(6, 182, 348, 70, { fill: '#0b1226', stroke: '#1e293b', rx: 12 }) + T(14, 200, '⌁ Tap a pin to connect · tap empty space to bend', { size: 9.6, fill: K.ink });
  [WC.grn, WC.blu, WC.org, WC.yel, WC.red, '#111827', WC.pur, WC.wht].forEach((c, i) => { s += `<circle cx="${22 + i * 22}" cy="224" r="8" fill="${c}" stroke="${i === 0 ? '#fff' : '#475569'}" stroke-width="${i === 0 ? 2 : 1}"/>`; });
  s += R(206, 214, 66, 28, { fill: '#101a30', stroke: '#2a3858', rx: 9 }) + T(239, 232, '↶ Point', { size: 9.4, anchor: 'middle' }) + R(280, 214, 66, 28, { fill: '#101a30', stroke: '#2a3858', rx: 9 }) + T(313, 232, '✕ Cancel', { size: 9.4, anchor: 'middle' });
  return fig(360, 262, s, 'The bar at the bottom of the canvas changes with what you are doing: a part is selected, a wire is selected, or you are in the middle of drawing a wire.');
}

export function breadboardLogic() {
  const b = breadboard(44, 96, { c0: 1, c1: 15, p: 16 });
  let s = b.svg;
  const hi = (ids, color) => ids.map((id) => { const [x, y] = b.hole(id); return `<circle cx="${x}" cy="${y}" r="5" fill="${color}" fill-opacity=".9"/>`; }).join('');
  s += hi(['a4', 'b4', 'c4', 'd4', 'e4'], '#22d3ee') + L(...b.hole('a4'), ...b.hole('e4'), { stroke: '#22d3ee', sw: 2.4 });
  s += hi(['f4', 'g4', 'h4', 'i4', 'j4'], '#fb923c') + L(...b.hole('f4'), ...b.hole('j4'), { stroke: '#fb923c', sw: 2.4 });
  s += hi(['a10', 'b10', 'c10', 'd10', 'e10'], '#22d3ee') + L(...b.hole('a10'), ...b.hole('e10'), { stroke: '#22d3ee', sw: 2.4 });
  const [x1, y1] = b.hole('tn3'), [x2] = b.hole('tn15');
  s += L(x1, y1, x2, y1, { stroke: '#3b82f6', sw: 3 }) + hi(['tn3', 'tn4', 'tn5', 'tn6', 'tn7', 'tn9', 'tn11', 'tn13', 'tn15'], '#3b82f6');
  const [rx1, ry1] = b.hole('tp3');
  s += L(rx1, ry1, x2, ry1, { stroke: '#ef4444', sw: 3 }) + hi(['tp3', 'tp5', 'tp7', 'tp9', 'tp11', 'tp13', 'tp15'], '#ef4444');
  const key = (y, c, t) => `<circle cx="22" cy="${y}" r="5" fill="${c}"/>` + T(34, y + 3.5, t, { size: 9.6, fill: '#e2e8f0' });
  s += key(298, '#22d3ee', 'a – e of one column: connected to each other') + key(314, '#fb923c', 'f – j of one column: connected to each other') + key(330, '#3b82f6', 'a rail row (+ red, − blue): one long connection');
  return fig(360, 344, s, 'Inside a breadboard: the five holes of a column are joined (a–e and f–j separately), the channel in the middle separates the two halves, and the rows along the top are the power rails.');
}

export function legsSnap() {
  const b1 = breadboard(18, 90, { c0: 1, c1: 8, p: 15 }), b2 = breadboard(198, 90, { c0: 1, c1: 8, p: 15 });
  let s = b1.svg + b2.svg;
  s += ledG([b1.hole('c3')[0] + 4, b1.hole('c3')[1] - 14], [b1.hole('c4')[0] + 4, b1.hole('c4')[1] - 14], 'red', { lift: 6 }) + finger(60, 100);
  s += ledG(b2.hole('c3'), b2.hole('c4'), 'red', { lift: 18 }) + `<circle cx="${b2.hole('c3')[0]}" cy="${b2.hole('c3')[1]}" r="5" fill="none" stroke="${K.ok}" stroke-width="1.6"/><circle cx="${b2.hole('c4')[0]}" cy="${b2.hole('c4')[1]}" r="5" fill="none" stroke="${K.ok}" stroke-width="1.6"/>`;
  s += AR(166, 130, 184, 130, { m: 'mfb', stroke: K.acc });
  s += T(70, 280, 'drag the part near the holes', { size: 10, anchor: 'middle', weight: 800, fill: K.ink }) + T(250, 280, 'the legs snap into them', { size: 10, anchor: 'middle', weight: 800, fill: K.ok });
  return fig(360, 292, s, 'Parts with legs plug into the breadboard: drop them close to the holes and the legs snap in. They are then connected like the real thing.');
}

export function runStates() {
  let s = '';
  const top = (y, label, run) => R(8, y, 344, 40, { fill: UI.bar, stroke: UI.line, rx: 10 }) + T(20, y + 17, 'Raspberry Pi Lab', { size: 11, weight: 800 }) + T(20, y + 31, 'Raspberry Pi 5 ›', { size: 8.6, fill: UI.acc }) + R(250, y + 6, 88, 28, { fill: run ? '#dc2626' : UI.run, stroke: 'none', rx: 10 }) + T(294, y + 25, label, { size: 12, anchor: 'middle', weight: 800, fill: '#fff' }) + `<circle cx="138" cy="${y + 12}" r="3.5" fill="${run ? UI.run : '#475569'}"/>`;
  s += top(8, '▶  Run', false) + T(180, 64, 'stopped — the parts are not powered, you can edit the circuit', { size: 9.6, anchor: 'middle', fill: K.dim });
  s += top(78, '■  Stop', true) + R(120, 126, 120, 18, { fill: 'rgba(34,197,94,.14)', stroke: 'rgba(34,197,94,.5)', rx: 9 }) + `<circle cx="132" cy="135" r="3.5" fill="${UI.run}"/>` + T(140, 138.5, 'Python running · Pi 5', { size: 9, fill: '#86efac', weight: 700 }) + T(180, 160, 'Run pressed — the circuit is powered and your file runs', { size: 9.6, anchor: 'middle', fill: K.dim });
  s += R(70, 176, 220, 24, { fill: 'rgba(245,158,11,.14)', stroke: 'rgba(245,158,11,.5)', rx: 12 }) + T(180, 192, '↻  Circuit changed — Stop and Run again to apply', { size: 9.6, anchor: 'middle', fill: '#fde68a', weight: 700 }) + T(180, 218, 'after a change while it runs, tap the banner to restart', { size: 9.6, anchor: 'middle', fill: K.dim });
  return fig(360, 230, s, 'The Run button: green Run when stopped, red Stop while the circuit is powered. The status pill says what is going on.');
}

export function pinoutLive() {
  let s = '';
  const chip = (x, y, num, phys, st) => {
    const stc = { ohi: ['#ff4d3d', 'rgba(255,77,61,.35)'], olo: ['#60a5fa', 'rgba(30,64,175,.55)'], pwm: ['#ff9f1c', 'rgba(255,159,28,.4)'], ihi: ['#22e55e', 'rgba(34,229,94,.3)'], ilo: ['#94a3b8', 'rgba(148,163,184,.2)'], none: ['#334155', 'none'] }[st];
    return `<rect x="${x}" y="${y}" width="40" height="34" rx="8" fill="${stc[1]}" stroke="${stc[0]}" stroke-width="${st === 'none' ? 1 : 2}"/>` + T(x + 20, y + 17, String(num), { size: 14, anchor: 'middle', weight: 800, fill: '#facc15' }) + T(x + 20, y + 28, String(phys), { size: 8, anchor: 'middle', fill: '#64748b' });
  };
  const defs = [[17, 11, 'ohi', 'output HIGH', 'red glow'], [27, 13, 'olo', 'output LOW', 'blue'], [18, 12, 'pwm', 'PWM', 'orange'], [2, 3, 'ihi', 'input HIGH', 'green ring'], [3, 5, 'ilo', 'input LOW', 'grey ring'], [4, 7, 'none', 'not used', 'plain']];
  defs.forEach(([n, ph, st, a, b], i) => { const x = 8 + (i % 3) * 118, y = 8 + Math.floor(i / 3) * 80; s += chip(x, y, n, ph, st) + T(x + 48, y + 14, a, { size: 9.6, weight: 800 }) + T(x + 48, y + 27, b, { size: 8.6, fill: K.dim }); });
  // pin sheet
  s += R(30, 176, 300, 112, { fill: '#0f1a33', stroke: '#334155', rx: 12 }) + T(180, 196, 'GPIO17 · pin 11', { size: 12, anchor: 'middle', weight: 800 });
  [['BCM number', '17'], ['Mode', 'Output'], ['Level', 'HIGH (3.3 V)'], ['Wires on the canvas', '1'], ['Python', 'LED(17) · Button(17) …']].forEach(([a, b], i) => { s += T(46, 214 + i * 14, a, { size: 9.4, fill: '#94a3b8' }) + T(314, 214 + i * 14, b, { size: 9.4, anchor: 'end', weight: 700 }); });
  s += T(180, 304, 'tap a pin → this information sheet', { size: 9.6, anchor: 'middle', fill: K.acc, weight: 700 });
  return fig(360, 314, s, 'The Pinout tab shows the live state of every pin, and tapping a pin opens a sheet with its mode, level and the Python to use it.');
}

export function damageModel() {
  let s = '';
  const row = (y, title, color, items) => T(10, y, title, { size: 10.5, weight: 800, fill: color }) + items.map(([a, b, c], i) => R(10 + i * 114, y + 7, 108, 40, { fill: K.box, stroke: c, rx: 8 }) + T(64 + i * 114, y + 23, a, { size: 9.6, anchor: 'middle', weight: 800, fill: c }) + T(64 + i * 114, y + 37, b, { size: 8.6, anchor: 'middle', fill: '#cbd5e1' })).join('');
  s += row(16, 'LED (5 mm)', '#fca5a5', [['20 – 30 mA', 'never wears out', K.ok], ['60 mA', 'dies in ~20 s', K.warn], ['90 mA', 'dies in seconds', K.err]]);
  s += row(84, 'One Pi GPIO pin', '#fdba74', [['up to 16 mA', 'fine', K.ok], ['32 mA', 'dies in ~10 s', K.warn], ['80 mA or a short', 'dies at once', K.err]]);
  s += row(152, 'Voltage on a GPIO', '#93c5fd', [['0 – 3.3 V', 'fine', K.ok], ['4 – 4.5 V', 'wears out', K.warn], ['5 V', 'dies in ~15 s', K.err]]);
  s += row(220, 'Wrong supply', '#c4b5fd', [['5 V into a 3.3 V part', 'part burns', K.warn], ['+ and − swapped', 'part burns', K.err], ['3V3 / 5V to GND', 'Power cut', K.err]]);
  s += T(180, 296, 'A burnt part flashes, smokes and stays dead until the next Run.', { size: 9, anchor: 'middle', fill: K.dim });
  return fig(360, 306, s, 'How long a part lasts. Times are approximate: the lab adds up "stress" while too much current or voltage is applied, as real parts wear out.');
}
