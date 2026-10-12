// Pictures of the Raspberry Pi Lab screens (chapter P1 and the screens used in other chapters).
// The screens are drawn once at phone size (390 px wide, "nominal" units) and then placed scaled into a figure.
import { K, T, R, L, P, AR, DOT, BADGE, fig, nid, WC, PC } from './art-pi-kit.js';
import { BOARDS, boardSVG } from '../../pi/boards.js';

export const UI = { bg: '#070b16', bar: '#0a1020', line: '#1e293b', txt: '#e2e8f0', dim: '#64748b', acc: '#22d3ee', run: '#22c55e', card: '#101a30' };

/** Place a nominal screen (390 × H) into a figure at (x, y) with scale sc. */
export function placeScreen(inner, x, y, sc, { W = 390, H = 700, r = 26, edge = '#475569' } = {}) {
  const id = nid('cp');
  return `<defs><clipPath id="${id}"><rect width="${W}" height="${H}" rx="${r}"/></clipPath></defs><g transform="translate(${x} ${y}) scale(${sc})">` +
    `<g clip-path="url(#${id})"><rect width="${W}" height="${H}" fill="${UI.bg}"/>${inner}</g><rect width="${W}" height="${H}" rx="${r}" fill="none" stroke="${edge}" stroke-width="${(2.4 / sc).toFixed(1)}"/></g>`;
}
/** The board drawing of the app, scaled into a figure (inner SVG content, so the page CSS for .board-svg applies). */
export function boardArt(id, x, y, sc) {
  const raw = boardSVG(id, nid('b'));
  const m = /viewBox="(-?\d+) (-?\d+) (\d+) (\d+)"/.exec(raw);
  const inner = raw.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<g class="board-svg" transform="translate(${x} ${y}) scale(${sc}) translate(${-m[1]} ${-m[2]})">${inner}</g>`;
}
export const boardBox = (id) => (BOARDS[id].kind === 'pico' ? [610, 360] : [930, 610]);

const mono = (x, y, parts, size = 14) => {
  let s = '', cx = x;
  for (const [t, c] of parts) { s += `<text x="${cx}" y="${y}" font-size="${size}" fill="${c}" font-family="JetBrains Mono, ui-monospace, monospace" xml:space="preserve">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`; cx += t.length * size * 0.6; }
  return s;
};
const CK = { kw: '#c792ea', fn: '#82aaff', num: '#f78c6c', str: '#c3e88d', cm: '#66789c', tx: '#e2e8f0', cls: '#ffcb6b' };

// ---------------------------------------------------------------- nominal screens
export function topBarN({ chip = 'Raspberry Pi 5', running = false } = {}) {
  let s = `<rect width="390" height="58" fill="${UI.bar}"/><line x1="0" y1="58" x2="390" y2="58" stroke="${UI.line}"/>`;
  s += P('M30 20 L20 29 L30 38', { stroke: UI.txt, sw: 2.6 });
  s += T(66, 26, 'Raspberry Pi Lab', { size: 19, weight: 700 });
  s += `<circle cx="228" cy="19" r="4" fill="${running ? UI.run : '#475569'}"/>`;
  s += `<rect x="66" y="33" width="11" height="11" rx="2" fill="none" stroke="${UI.acc}" stroke-width="1.6"/>` + T(84, 43, chip + ' ›', { size: 14, fill: UI.acc, weight: 600 });
  s += R(250, 10, 100, 38, { fill: running ? '#dc2626' : UI.run, stroke: 'none', rx: 14 });
  s += running ? `<rect x="268" y="21" width="14" height="14" rx="2" fill="#fff"/>` + T(292, 35, 'Stop', { size: 17, weight: 700, fill: '#fff' }) : P('M268 20 L268 38 L283 29z', { fill: '#fff', stroke: '#fff', sw: 1 }) + T(293, 35, 'Run', { size: 17, weight: 700, fill: '#fff' });
  s += [18, 29, 40].map((y) => `<circle cx="372" cy="${y}" r="2.6" fill="${UI.txt}"/>`).join('');
  return s;
}
const tabIcon = (id, x, y, c) => {
  const o = { stroke: c, sw: 2 };
  if (id === 'circuit') return `<circle cx="${x - 8}" cy="${y + 7}" r="4" fill="none" stroke="${c}" stroke-width="2"/><circle cx="${x + 8}" cy="${y - 7}" r="4" fill="none" stroke="${c}" stroke-width="2"/>` + L(x - 4, y + 4, x + 4, y - 4, o);
  if (id === 'board') return `<rect x="${x - 9}" y="${y - 9}" width="18" height="18" rx="3" fill="none" stroke="${c}" stroke-width="2"/><rect x="${x - 4}" y="${y - 4}" width="8" height="8" fill="${c}"/>` + [-5, 5].map((d) => L(x + d, y - 13, x + d, y - 9, o) + L(x + d, y + 9, x + d, y + 13, o)).join('');
  if (id === 'desktop') return `<rect x="${x - 11}" y="${y - 9}" width="22" height="15" rx="2" fill="none" stroke="${c}" stroke-width="2"/>` + L(x - 5, y + 11, x + 5, y + 11, o);
  if (id === 'thonny') return P(`M${x - 4} ${y - 8} L${x - 12} ${y} L${x - 4} ${y + 8}`, o) + P(`M${x + 4} ${y - 8} L${x + 12} ${y} L${x + 4} ${y + 8}`, o);
  return [-7, 0, 7].map((d) => L(x - 3, y + d, x + 11, y + d, o) + `<circle cx="${x - 10}" cy="${y + d}" r="1.6" fill="${c}"/>`).join('');
};
export const TABS_PI = [['circuit', 'Circuit'], ['board', 'Pinout'], ['desktop', 'Desktop'], ['thonny', 'Thonny'], ['output', 'Output']];
export function tabsN(y, active = ['circuit'], tabs = TABS_PI, W = 390) {
  let s = `<rect x="0" y="${y}" width="${W}" height="66" fill="${UI.bar}"/><line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${UI.line}"/>`;
  const w = W / tabs.length;
  tabs.forEach(([id, label], i) => {
    const on = active.includes(id), c = on ? UI.acc : '#64748b', cx = w * i + w / 2;
    if (on) s += `<rect x="${cx - 22}" y="${y}" width="44" height="3" rx="1.5" fill="${UI.acc}"/>`;
    s += tabIcon(id, cx, y + 24, c) + T(cx, y + 54, label, { size: 13.5, anchor: 'middle', fill: on ? '#fff' : '#64748b', weight: on ? 700 : 500 });
  });
  return s;
}
const fab = (x, y) => `<circle cx="${x}" cy="${y}" r="30" fill="#6d5cf0"/><circle cx="${x}" cy="${y}" r="30" fill="#22d3ee" fill-opacity=".35"/>` + L(x - 11, y, x + 11, y, { stroke: '#fff', sw: 3 }) + L(x, y - 11, x, y + 11, { stroke: '#fff', sw: 3 });
const railIcons = (x, y) => {
  let s = R(x, y, 50, 300, { fill: '#0b1226', stroke: '#334155', rx: 16 });
  [0, 1, 2, 3, 4, 5, 6].forEach((i) => { s += `<rect x="${x + 15}" y="${y + 18 + i * 40}" width="20" height="20" rx="4" fill="none" stroke="#94a3b8" stroke-width="2"/>`; });
  return s;
};
/** Circuit tab (portrait). circuitBits: what is on the canvas. */
export function screenCircuit({ chip, running = false, file = 'button_led.py', Hh = 700 } = {}) {
  let s = topBarN({ chip, running });
  s += `<rect y="58" width="390" height="${Hh - 124}" fill="#080e1d"/>`;
  for (let gx = 20; gx < 390; gx += 30) for (let gy = 90; gy < Hh - 66; gy += 30) s += `<circle cx="${gx}" cy="${gy}" r="1" fill="#16223d"/>`;
  s += R(14, 70, 180, 38, { fill: '#0b1226', stroke: '#1e293b', rx: 14 }) + T(32, 94, '</>', { size: 14, fill: '#34d399', weight: 700, mono: true }) + T(64, 95, file + ' ›', { size: 15, fill: UI.txt, mono: true });
  s += railIcons(326, 70);
  // the circuit: button, resistor, LED above the Pi
  s += R(30, 440, 290, 140, { fill: '#166534', stroke: '#22c55e', rx: 12 });
  for (let i = 0; i < 20; i++) s += `<rect x="${52 + i * 12.5}" y="452" width="8" height="8" rx="1" fill="#d9ad3c"/><rect x="${52 + i * 12.5}" y="464" width="8" height="8" rx="1" fill="#d9ad3c"/>`;
  s += T(175, 540, 'Raspberry Pi', { size: 16, anchor: 'middle', fill: '#dcfce7', weight: 700 });
  s += P('M133 452 V330 H168', { stroke: '#22c55e', sw: 3 }) + P('M160 464 V400 H278 V320', { stroke: '#111827', sw: 3 }).replace('stroke="#111827"', 'stroke="#64748b"');
  s += `<rect x="168" y="318" width="52" height="16" rx="5" fill="#d9bf92" stroke="#0b1226"/><circle cx="278" cy="298" r="15" fill="#ef4444"/>` + L(220, 326, 262, 326, { stroke: '#cbd5e1', sw: 2 });
  s += fab(344, Hh - 120) + tabsN(Hh - 66, ['circuit']);
  return s;
}
export function screenPinout({ chip = 'Raspberry Pi 5' } = {}) {
  let s = topBarN({ chip }) + `<rect y="58" width="390" height="576" fill="#080e1d"/>`;
  s += R(14, 70, 362, 250, { fill: '#0b1226', stroke: '#1e293b', rx: 18 }) + R(26, 84, 338, 150, { fill: '#166534', stroke: '#22c55e', rx: 10 });
  for (let i = 0; i < 20; i++) s += `<rect x="${44 + i * 14}" y="92" width="9" height="9" rx="1.5" fill="#d9ad3c"/><rect x="${44 + i * 14}" y="104" width="9" height="9" rx="1.5" fill="#d9ad3c"/>`;
  s += R(150, 160, 62, 52, { fill: '#cbd5e1', stroke: '#94a3b8', rx: 5 }) + T(181, 190, 'BCM2712', { size: 9, anchor: 'middle', fill: '#334155', weight: 700 });
  const chips = [['5V', '2', '#f87171'], ['5V', '4', '#f87171'], ['⏚', '6', '#9ca3af'], ['14', '8', '#f9a8d4'], ['15', '10', '#f9a8d4'], ['18', '12', '#facc15']];
  chips.forEach(([a, b, c], i) => { s += R(22 + i * 58, 246, 52, 30, { fill: '#101a30', stroke: '#1e293b', rx: 8 }) + T(48 + i * 58, 262, a, { size: 14, anchor: 'middle', fill: c, weight: 800 }) + T(48 + i * 58, 273, b, { size: 9, anchor: 'middle', fill: '#64748b' }); });
  ['3V3', '2', '3', '4', '⏚', '17'].forEach((a, i) => { s += R(22 + i * 58, 282, 52, 30, { fill: '#101a30', stroke: '#1e293b', rx: 8 }) + T(48 + i * 58, 298, a, { size: 14, anchor: 'middle', fill: ['#fb923c', '#93c5fd', '#93c5fd', '#facc15', '#9ca3af', '#facc15'][i], weight: 800 }) + T(48 + i * 58, 309, String(i * 2 + 1), { size: 9, anchor: 'middle', fill: '#64748b' }); });
  s += [['3V3', '#f97316'], ['5V', '#ef4444'], ['GND', '#6b7280'], ['GPIO', '#d9ad3c'], ['HIGH', '#ff4d3d'], ['PWM', '#ff9f1c']].map(([t, c], i) => `<circle cx="${28 + i * 60}" cy="344" r="6" fill="${c}"/>` + T(38 + i * 60, 349, t, { size: 13, fill: '#cbd5e1' })).join('');
  s += R(14, 372, 362, 74, { fill: 'rgba(34,211,238,.08)', stroke: 'rgba(34,211,238,.35)', rx: 16 }) + T(70, 398, 'Wire parts in the Circuit tab', { size: 15, weight: 700 }) + T(70, 418, 'Tap a pin here for its functions.', { size: 12.5, fill: '#94a3b8' });
  s += R(14, 462, 362, 150, { fill: '#0b1226', stroke: '#1e293b', rx: 16 }) + T(30, 490, 'Raspberry Pi 5 · 2023', { size: 15, weight: 700 });
  [['SoC', 'Broadcom BCM2712'], ['CPU', 'Quad-core Arm Cortex-A76'], ['Memory', '8 GB LPDDR4X']].forEach(([a, b], i) => { s += T(30, 520 + i * 28, a, { size: 13.5, fill: '#64748b' }) + T(130, 520 + i * 28, b, { size: 13.5, weight: 700 }); });
  return s + tabsN(634, ['board']);
}
export function screenThonny({ chip = 'Raspberry Pi 5', pico = false } = {}) {
  let s = topBarN({ chip }) + `<rect y="58" width="390" height="570" fill="#070b16"/>`;
  // toolbar
  s += `<rect y="58" width="390" height="70" fill="#0a1020"/><line x1="0" y1="128" x2="390" y2="128" stroke="${UI.line}"/>`;
  const tb = [['New', '#e5e7eb'], ['Load', '#f2c14e'], ['Save', '#3b6fd8'], null, ['Run', '#2fa84f'], ['Stop', '#d93a3a'], null, ['Examples', '#8b5cf6'], ['Files', '#e5e7eb']];
  let x = 14;
  for (const it of tb) {
    if (!it) { s += L(x + 2, 72, x + 2, 118, { stroke: UI.line }); x += 8; continue; }
    const w = it[0] === 'Examples' ? 70 : 46;
    s += `<rect x="${x + w / 2 - 12}" y="68" width="24" height="26" rx="${it[0] === 'Run' ? 13 : 4}" fill="${it[1]}"/>` + T(x + w / 2, 114, it[0], { size: 12.5, anchor: 'middle', fill: '#cbd5e1' });
    x += w;
  }
  // tabs
  s += `<rect y="128" width="390" height="44" fill="#080e1d"/>`;
  s += R(8, 134, 112, 38, { fill: '#0b1226', stroke: '#1e293b', rx: 8 }) + T(24, 158, pico ? '[ main.py ]' : 'blink.py', { size: 14, fill: '#94a3b8' }) + T(104, 158, '×', { size: 16, fill: '#64748b', anchor: 'middle' });
  s += R(124, 134, 150, 38, { fill: '#0f1a33', stroke: '#22d3ee', rx: 8 }) + T(138, 158, pico ? '[ button_led.py ]' : 'button_led.py', { size: 14 }) + T(258, 158, '×', { size: 16, fill: '#94a3b8', anchor: 'middle' });
  s += `<rect y="172" width="390" height="418" fill="#070b16"/><rect y="172" width="40" height="418" fill="#0a1020"/>`;
  const lines = pico
    ? [[['from ', CK.kw], ['machine ', CK.tx], ['import ', CK.kw], ['Pin', CK.cls]], [['import ', CK.kw], ['time', CK.tx]], [['', 0]], [['led = ', CK.tx], ['Pin', CK.cls], ['(15, ', CK.tx], ['Pin', CK.cls], ['.OUT)', CK.tx]], [['', 0]], [['while ', CK.kw], ['True', CK.num], [':', CK.tx]], [['    led', CK.tx], ['.toggle', CK.fn], ['()', CK.tx]], [['    time', CK.tx], ['.sleep', CK.fn], ['(', CK.tx], ['0.5', CK.num], [')', CK.tx]]]
    : [[['# Press the button on GPIO2', CK.cm]], [['from ', CK.kw], ['gpiozero ', CK.tx], ['import ', CK.kw], ['LED, Button', CK.cls]], [['from ', CK.kw], ['signal ', CK.tx], ['import ', CK.kw], ['pause', CK.fn]], [['', 0]], [['led = ', CK.tx], ['LED', CK.cls], ['(', CK.tx], ['17', CK.num], [')', CK.tx]], [['button = ', CK.tx], ['Button', CK.cls], ['(', CK.tx], ['2', CK.num], [')', CK.tx]], [['', 0]], [['button', CK.tx], ['.when_pressed ', CK.fn], ['= led.on', CK.tx]], [['button', CK.tx], ['.when_released ', CK.fn], ['= led.off', CK.tx]], [['', 0]], [['pause', CK.fn], ['()', CK.tx]]];
  lines.forEach((ln, i) => { s += T(30, 202 + i * 26, String(i + 1), { size: 13, anchor: 'end', fill: i === 0 ? UI.acc : '#53627f', mono: true }) + mono(48, 202 + i * 26, ln.filter((p) => p[0]), 14.5); });
  s += `<rect y="590" width="390" height="38" fill="#0a1020"/>` + T(380, 614, pico ? 'MicroPython (Raspberry Pi Pico) • Board CDC @ /dev/ttyACM0' : 'Local Python 3 • /usr/bin/python3', { size: 12.5, anchor: 'end', fill: '#94a3b8' });
  return s + tabsN(634, ['thonny'], pico ? [['circuit', 'Circuit'], ['board', 'Pinout'], ['thonny', 'Thonny'], ['output', 'Output']] : TABS_PI);
}
export function screenOutput({ chip = 'Raspberry Pi 5', lines = null, pico = false, running = false } = {}) {
  let s = topBarN({ chip, running }) + `<rect y="58" width="390" height="576" fill="#060a14"/>`;
  s += `<rect y="58" width="390" height="40" fill="#0a1020"/>` + T(16, 84, 'Output · Shell', { size: 15, weight: 700 }) + T(374, 84, 'Clear', { size: 14, anchor: 'end', fill: UI.acc });
  const L0 = lines || [[['Python 3.11.2 (/usr/bin/python3)', CK.tx]], [['>>> ', '#fbbf24']]];
  L0.forEach((ln, i) => { s += mono(14, 128 + i * 24, ln, 14); });
  s += `<rect y="572" width="390" height="62" fill="#0a1020"/>`;
  ['Ctrl+C', 'Ctrl+D', '↑', '↓', 'Tab', ':', '('].forEach((k, i) => { const w = k.length > 2 ? 70 : 40; const x = [8, 82, 156, 200, 244, 294, 338][i]; s += R(x, 582, w > 40 ? 68 : 38, 40, { fill: '#141d33', stroke: '#2a3858', rx: 9 }) + T(x + (w > 40 ? 34 : 19), 608, k, { size: 14, anchor: 'middle', mono: true }); });
  return s + tabsN(634, ['output'], pico ? [['circuit', 'Circuit'], ['board', 'Pinout'], ['thonny', 'Thonny'], ['output', 'Output']] : TABS_PI);
}
export function screenDesktop({ chip = 'Raspberry Pi 5' } = {}) {
  let s = topBarN({ chip });
  s += `<defs><linearGradient id="dkbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e3a4a"/><stop offset=".55" stop-color="#14202f"/><stop offset="1" stop-color="#4a1a30"/></linearGradient></defs><rect y="58" width="390" height="576" fill="url(#dkbg)"/>`;
  s += `<rect y="58" width="390" height="54" fill="#e8e8ea"/>`;
  s += `<circle cx="38" cy="85" r="15" fill="#c51a4a"/><circle cx="96" cy="85" r="15" fill="#4285f4"/><circle cx="96" cy="85" r="6" fill="#fff"/><path d="M142 74 h14 l3 4 h14 v20 h-31z" fill="#4a90d9"/><rect x="190" y="72" width="30" height="26" rx="4" fill="#2d2d2d"/><path d="M196 80 l6 5 -6 5" stroke="#7ee787" stroke-width="2.4" fill="none"/>`;
  s += L(238, 70, 238, 100, { stroke: '#c8c8cc' });
  s += T(344, 91, '12:13', { size: 16, anchor: 'end', fill: '#1f2937', weight: 600 }) + `<circle cx="270" cy="85" r="6" fill="none" stroke="#374151" stroke-width="2"/><circle cx="296" cy="85" r="6" fill="none" stroke="#374151" stroke-width="2"/>`;
  s += `<path d="M44 150 h40 l-4 52 h-32z" fill="#e5e7eb" stroke="#9ca3af"/>` + T(64, 226, 'Wastebasket', { size: 12.5, anchor: 'middle', fill: '#fff' });
  s += `<path d="M30 270 h26 l5 6 h28 v34 h-59z" fill="#4a90d9"/><rect x="30" y="284" width="59" height="26" fill="#6aaef0"/>` + T(60, 332, 'pi', { size: 12.5, anchor: 'middle', fill: '#fff' });
  return s + tabsN(634, ['desktop']);
}

// ---------------------------------------------------------------- P1 figures
const cap = (w, h, inner, c) => fig(w, h, inner, c);

export function heroStart() {
  let s = `<defs><linearGradient id="hg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0e2a3a"/><stop offset="1" stop-color="#1b1442"/></linearGradient></defs><rect x="4" y="4" width="352" height="372" rx="18" fill="url(#hg1)" stroke="#1e3a5f"/>`;
  s += T(22, 34, 'Virtual Raspberry Pi', { size: 20, weight: 800 }) + T(22, 52, 'Pi 5 · Pi 4 · Pico · Pico W · Pico 2', { size: 11, fill: K.acc, weight: 600 });
  s += boardArt('pi5', 22, 64, 0.34);
  s += boardArt('pico', 22, 286, 0.24);
  [['Circuit', 'wire it'], ['Pinout', 'see the pins'], ['Desktop', 'Pi OS'], ['Thonny', 'write Python']].forEach(([t, d], i) => {
    const x = 186 + (i % 2) * 84, y = 292 + Math.floor(i / 2) * 36;
    s += R(x, y, 78, 30, { fill: 'rgba(34,211,238,.1)', stroke: 'rgba(34,211,238,.4)', rx: 10 }) + T(x + 39, y + 13, t, { size: 10, anchor: 'middle', fill: '#a5f3fc', weight: 800 }) + T(x + 39, y + 24, d, { size: 7.8, anchor: 'middle', fill: '#94a3b8' });
  });
  return cap(360, 384, s, 'The Raspberry Pi Lab: a Pi 5, Pi 4 or Pico on your phone, a circuit to wire, Python to write — and the Pi desktop to use.');
}

export function boardFamily() {
  const order = ['pi5', 'pi4', 'pico', 'picow', 'pico2', 'pico2w'];
  let s = '';
  order.forEach((id, i) => {
    const b = BOARDS[id], pico = b.kind === 'pico', x = 8 + (i % 2) * 176, y = 8 + Math.floor(i / 2) * 106;
    s += R(x, y, 168, 98, { fill: K.box, stroke: pico ? K.vio : K.ok, rx: 12 });
    // board icon
    s += pico ? `<rect x="${x + 10}" y="${y + 12}" width="46" height="18" rx="3" fill="#166534" stroke="#22c55e"/><rect x="${x + 10}" y="${y + 17}" width="8" height="8" fill="#cbd5e1"/>` + (b.wifi ? `<rect x="${x + 36}" y="${y + 16}" width="10" height="10" fill="#0b1226"/>` : '') : `<rect x="${x + 10}" y="${y + 8}" width="46" height="30" rx="4" fill="#166534" stroke="#22c55e"/><rect x="${x + 14}" y="${y + 11}" width="38" height="4" fill="#fde68a"/><rect x="${x + 36}" y="${y + 20}" width="10" height="8" fill="#cbd5e1"/>`;
    s += T(x + 64, y + 22, b.short, { size: 15, weight: 800 }) + T(x + 64, y + 36, String(b.year), { size: 9.5, fill: K.dim });
    s += T(x + 10, y + 54, b.mcu || b.soc.replace('Broadcom ', ''), { size: 10.5, weight: 700, fill: K.acc });
    s += T(x + 10, y + 68, b.cpu.replace('Dual-core ', '2× ').replace('Quad-core ', '4× ').replace('Arm ', '').replace(' @ ', ' · '), { size: 8.6, fill: '#cbd5e1' });
    s += T(x + 10, y + 81, b.ram.replace('LPDDR4X-4267', '').replace('LPDDR4-3200', '').replace('SRAM', 'RAM'), { size: 9, fill: '#cbd5e1' });
    s += T(x + 10, y + 93 - 1, pico ? 'MicroPython' : 'Python 3 + desktop', { size: 8.6, fill: pico ? K.vio : K.ok, weight: 700 });
    if (b.wifi) s += T(x + 158, y + 22, 'Wi-Fi', { size: 8.5, anchor: 'end', fill: K.warn, weight: 700 });
  });
  return cap(360, 332, s, 'The six boards you can choose. Pi 5 and Pi 4 run Python 3 programs with the desktop; the four Pico boards run MicroPython.');
}

export function newProjectFlow() {
  const W = 78, H = 150, ys = 16;
  const card = (i, title, body) => {
    const x = 8 + i * 88;
    return R(x, ys, W, H, { fill: UI.bg, stroke: '#475569', rx: 9 }) + body(x) + T(x + W / 2, ys + H + 16, title, { size: 9.5, anchor: 'middle', weight: 700, fill: K.ink }) + BADGE(x + 8, ys + 2, i + 1);
  };
  let s = '';
  s += card(0, 'Home', (x) => R(x + 6, ys + 12, 66, 24, { fill: '#2a1230', stroke: '#ec4899', rx: 6 }) + T(x + 39, ys + 28, 'Raspberry Pi', { size: 8, anchor: 'middle', fill: '#fbcfe8', weight: 700 }) + R(x + 6, ys + 42, 31, 22, { fill: K.box, stroke: K.line, rx: 5 }) + R(x + 41, ys + 42, 31, 22, { fill: K.box, stroke: K.line, rx: 5 }) + T(x + 39, ys + 110, 'tap the Pi tile', { size: 7.5, anchor: 'middle', fill: K.dim }));
  s += card(1, 'Pi Lab page', (x) => T(x + 39, ys + 24, 'Virtual Pi', { size: 9, anchor: 'middle', weight: 700 }) + R(x + 8, ys + 34, 62, 18, { fill: K.acc, stroke: 'none', rx: 8 }) + T(x + 39, ys + 46, '＋ New project', { size: 7.5, anchor: 'middle', fill: '#04121a', weight: 800 }) + R(x + 8, ys + 58, 62, 16, { fill: K.box2, stroke: K.line, rx: 8 }) + T(x + 39, ys + 69, 'Examples', { size: 7.5, anchor: 'middle' }) + R(x + 8, ys + 84, 62, 26, { fill: K.box, stroke: K.line, rx: 6 }) + T(x + 39, ys + 100, 'My workspace', { size: 6.5, anchor: 'middle', fill: K.dim }));
  s += card(2, 'Choose board', (x) => ['Pi 5', 'Pi 4', 'Pico', 'Pico W', '…'].map((t, i) => R(x + 6, ys + 12 + i * 25, 66, 21, { fill: i === 0 ? K.box2 : K.box, stroke: i === 0 ? K.acc : K.line, rx: 6 }) + T(x + 39, ys + 26 + i * 25, t, { size: 8.5, anchor: 'middle', weight: 700 })).join(''));
  s += card(3, 'Lab opens', (x) => `<rect x="${x + 5}" y="${ys + 22}" width="68" height="14" rx="5" fill="#0b1226" stroke="${K.line}"/>` + T(x + 39, ys + 32.5, 'project1.py ›', { size: 7, anchor: 'middle', fill: K.ink, mono: true }) + R(x + 12, ys + 84, 54, 34, { fill: '#166534', stroke: '#22c55e', rx: 4 }) + T(x + 39, ys + 105, 'board only', { size: 7, anchor: 'middle', fill: '#dcfce7' }) + R(x + 5, ys + 6, 68, 12, { fill: UI.bar, stroke: 'none', rx: 3 }) + `<circle cx="${x + 66}" cy="${ys + 12}" r="3.5" fill="${UI.run}"/>`);
  s += [0, 1, 2].map((i) => AR(8 + i * 88 + W + 1, ys + 75, 8 + (i + 1) * 88 - 1, ys + 75, { m: 'mfb', stroke: K.acc })).join('');
  return cap(360, 200, s, 'A new project: tap the Raspberry Pi tile, choose New project, pick a board — the lab opens with the board alone on the canvas and a fresh project1.py.');
}

export function screenTour() {
  let s = placeScreen(screenCircuit({ file: 'button_led.py' }), 8, 8, 0.44, { H: 700, r: 28 });
  const items = [
    [1, 'Back · title · board chip', 'tap the chip: another board'],
    [2, 'Run / Stop', 'power the circuit, run the file'],
    [3, '⋮ menu', 'board, full screen, sound, reset'],
    [4, 'File chip', 'the .py file that Run starts'],
    [5, 'Tool rail', 'undo, redo, select, zoom, fit'],
    [6, 'Canvas', 'the Pi board, parts and wires'],
    [7, '＋ button', 'add a part from the library'],
    [8, 'Tabs', 'five screens, one tap each'],
  ];
  const f = (x, y) => [8 + 0.44 * x, 8 + 0.44 * y];
  const bd = [f(150, 62), f(300, 4), f(378, 52), f(24, 104), f(356, 190), f(120, 300), f(372, 560), f(195, 646)];
  s += bd.map(([x, y], i) => BADGE(x, y, i + 1)).join('');
  items.forEach(([n, t, d], i) => { const y = 24 + i * 38; s += BADGE(194, y, n) + T(208, y + 4, t, { size: 11, weight: 700 }) + T(208, y + 17, d, { size: 8.8, fill: K.dim }); });
  return cap(360, 332, s, 'The Raspberry Pi Lab, Circuit tab, on a phone held upright.');
}

export function fiveTabs() {
  const sc = 0.25, w = 390 * sc, h = 640 * sc;
  const defs = [
    [screenCircuit({ file: 'blink.py', Hh: 700 }), 'Circuit', 'wire parts, power on', 'circuit'],
    [screenPinout(), 'Pinout', 'live pin colours, tap a pin', 'board'],
    [screenDesktop(), 'Desktop', 'Pi OS: menu, files, terminal', 'desktop'],
    [screenThonny(), 'Thonny', 'write and save Python', 'thonny'],
    [screenOutput({ lines: [[['%Run blink.py', '#a78bfa']], [['LED on', CK.tx]], [['LED off', CK.tx]]] }), 'Output', 'Shell, print(), input()', 'output'],
  ];
  let s = '';
  defs.forEach(([inner, name, sub], i) => {
    const x = 10 + (i % 3) * 118, y = 8 + Math.floor(i / 3) * 214;
    s += placeScreen(inner, x, y, sc, { H: 700, r: 24 });
    s += T(x + w / 2, y + 190, name, { size: 11.5, anchor: 'middle', weight: 800, fill: K.acc }).replace(`y="${y + 176}"`, `y="${y + 176}"`) + T(x + w / 2, y + 203, sub, { size: 7.6, anchor: 'middle', fill: K.dim });
  });
  s += R(238, 222, 108, 168, { fill: 'rgba(148,163,184,.06)', stroke: K.line, rx: 12, dash: '4 3' });
  s += T(292, 246, 'Pico boards', { size: 11, anchor: 'middle', weight: 800, fill: K.vio }) + T(292, 264, 'have no Desktop:', { size: 8.6, anchor: 'middle', fill: K.ink }) + T(292, 276, 'the tabs are', { size: 8.6, anchor: 'middle', fill: K.ink }) + T(292, 288, 'Circuit · Pinout', { size: 8.6, anchor: 'middle', fill: K.acc }) + T(292, 300, 'Thonny · Output', { size: 8.6, anchor: 'middle', fill: K.acc });
  return cap(360, 440, s, 'The five tabs of a Pi 5 / Pi 4 lab. A Pico lab has four (no Desktop).');
}

export function twoPaneLandscape() {
  const phone = (x, y, panes, tabs, label) => R(x, y, 112, 74, { fill: UI.bg, stroke: '#475569', rx: 9 }) +
    panes.map(([px, pw, t, c]) => R(x + 6 + px, y + 8, pw, 44, { fill: '#0d1a36', stroke: c || K.dim, rx: 3 }) + T(x + 6 + px + pw / 2, y + 34, t, { size: 8.5, anchor: 'middle', fill: K.ink, weight: 600 })).join('') +
    ['Circ', 'Pin', 'Desk', 'Thon', 'Out'].map((n, i) => R(x + 6 + i * 20, y + 58, 18, 11, { fill: tabs.includes(i) ? K.box2 : 'none', stroke: tabs.includes(i) ? K.acc : K.dim, rx: 3 }) + T(x + 15 + i * 20, y + 66.3, n, { size: 5.8, anchor: 'middle', fill: tabs.includes(i) ? '#fff' : K.dim })).join('') +
    T(x + 56, y + 92, label, { size: 9.5, anchor: 'middle', weight: 700 });
  let s = phone(8, 10, [[0, 100, 'Circuit']], [0], '① one screen') + phone(124, 10, [[0, 49, 'Circuit', K.acc], [51, 49, 'Thonny', K.acc]], [0, 3], '② tap Thonny') + phone(240, 10, [[0, 49, 'Circuit', K.acc], [51, 49, 'Output', K.acc]], [0, 4], '③ Run → Output');
  s += AR(121, 47, 126, 47, { m: 'mfb', stroke: K.acc }) + AR(237, 47, 242, 47, { m: 'mfb', stroke: K.acc });
  s += phone(8, 120, [[0, 49, 'Circuit', K.acc], [51, 49, 'Thonny', K.acc]], [0, 3], '④ tap Thonny again') + phone(124, 120, [[0, 100, 'Circuit']], [0], '⑤ Thonny closed') + phone(240, 120, [[0, 49, 'Circuit', K.acc], [51, 49, 'Pinout', K.acc]], [0, 1], '⑥ tap Pinout');
  s += AR(121, 157, 126, 157, { m: 'mfb', stroke: K.acc }) + AR(237, 157, 242, 157, { m: 'mfb', stroke: K.acc });
  return cap(360, 232, s, 'Landscape: a tap on a tab that is closed opens it beside the screen you have; a tap on an open tab closes it. Run opens Output next to the circuit.');
}

export function fullScreenFig() {
  const ph = (x, y, w, h, inner) => R(x, y, w, h, { fill: UI.bg, stroke: '#475569', rx: 14 }) + inner;
  let s = ph(8, 10, 160, 96, R(20, 22, 136, 72, { fill: '#0d1a36', stroke: K.dim, rx: 4 }) + T(88, 62, 'Thonny', { size: 11, anchor: 'middle', fill: K.dim }) +
    `<circle cx="28" cy="94" r="12" fill="rgba(10,16,32,.85)" stroke="#475569"/>` + [-4, 0, 4].map((d) => L(23, 94 + d, 33, 94 + d, { stroke: '#e2e8f0', sw: 1.4 })).join(''));
  s += T(88, 124, '① Full screen: only ☰ is left', { size: 9.5, anchor: 'middle', weight: 700 });
  s += ph(192, 10, 160, 96, R(20 + 184, 22, 136, 72, { fill: '#0d1a36', stroke: K.dim, rx: 4 }) + T(272, 62, 'Thonny', { size: 11, anchor: 'middle', fill: K.dim }));
  // opened bar (vertical)
  s += R(198, 24, 24, 80, { fill: 'rgba(10,16,32,.9)', stroke: '#334155', rx: 12 });
  ['⛶', '▶', '◉', '</>', '≡', '⬡'].forEach((t, i) => { s += T(210, 38 + i * 11.2, t, { size: 8, anchor: 'middle', fill: i === 1 ? UI.run : '#e2e8f0', weight: 700 }); });
  s += `<circle cx="210" cy="14" r="0" fill="none"/>` + T(272, 124, '② Tap ☰: the bar opens (✕ closes it)', { size: 9.5, anchor: 'middle', weight: 700 });
  s += P('M70 150 q40 -20 90 0', { stroke: K.acc, sw: 1.8, dash: '4 3' }) + `<path d="M160 150l-7-6v11z" fill="${K.acc}"/>`;
  s += `<circle cx="64" cy="152" r="12" fill="rgba(10,16,32,.85)" stroke="${K.acc}" stroke-width="1.6"/>` + [-4, 0, 4].map((d) => L(59, 152 + d, 69, 152 + d, { stroke: '#e2e8f0', sw: 1.4 })).join('');
  s += T(180, 178, '③ Drag ☰ anywhere — the spot is remembered', { size: 9.5, anchor: 'start', weight: 700 }).replace('x="180"', 'x="102"').replace('y="178"', 'y="176"');
  s += T(180, 200, 'Bar buttons: exit full screen · Run · Circuit · Thonny · Output · Pinout', { size: 8.6, anchor: 'middle', fill: K.dim });
  return cap(360, 212, s, 'Full screen hides every bar. The round ☰ button brings the menu back; it opens a small bar with Run and the tabs.');
}

export function savedWhere() {
  let s = '';
  const box = (x, y, w, h, t, sub, c) => R(x, y, w, h, { fill: K.box, stroke: c, rx: 10 }) + T(x + w / 2, y + 20, t, { size: 11.5, anchor: 'middle', weight: 800, fill: c }) + sub.map((l, i) => T(x + w / 2, y + 36 + i * 12, l, { size: 9, anchor: 'middle', fill: '#cbd5e1' })).join('');
  s += box(8, 10, 110, 74, 'Circuit', ['parts and wires', 'one saved circuit', 'per board'], K.acc);
  s += box(125, 10, 110, 74, 'Files', ['your .py files', '/home/pi (Pi)', '/ (Pico flash)'], K.ok);
  s += box(242, 10, 110, 74, 'Thonny tabs', ['open tabs, text you', 'have not saved yet'], K.vio);
  s += T(63, 102, 'saved after every', { size: 9, anchor: 'middle', fill: K.dim }) + T(63, 114, 'change', { size: 9, anchor: 'middle', fill: K.dim });
  s += T(180, 102, 'Thonny ▸ Save', { size: 9, anchor: 'middle', fill: K.dim }) + T(180, 114, 'or Run', { size: 9, anchor: 'middle', fill: K.dim });
  s += T(297, 102, 'kept when you', { size: 9, anchor: 'middle', fill: K.dim }) + T(297, 114, 'switch tabs', { size: 9, anchor: 'middle', fill: K.dim });
  s += R(8, 128, 344, 36, { fill: 'rgba(245,158,11,.1)', stroke: 'rgba(245,158,11,.4)', rx: 10 }) + T(180, 145, 'Everything stays on this phone.', { size: 10, anchor: 'middle', fill: '#fde68a' });
  s += T(180, 158, 'Menu ⋮ ▸ Reset the SD card puts the example files back.', { size: 8.6, anchor: 'middle', fill: '#fde68a' });
  return cap(360, 176, s, 'What the lab keeps on your phone.');
}
