// Diagram library of the Raspberry Pi part of the manual: SVG pictures in the app's dark palette.
// This file holds the drawing kit (header strip, breadboard, part glyphs, wires, the wiring "scene" engine)
// (art-pi.js re-exports it together with the diagram files).
// Every public diagram function returns a <figure class="mf"> string; nothing here touches the DOM.
import { K, T, R, L, P, AR, DOT, BADGE, fig } from '../art.js';
import { PI_HEADER, PICO_HEADER } from '../../pi/boards.js';

export { K, T, R, L, P, AR, DOT, BADGE, fig };

let uid = 0;
/** A fresh id for gradients / patterns (ids are global in the page). */
export const nid = (p = 'pm') => `${p}${++uid}`;

/** Wire colours (black is drawn with a light halo so it shows on the dark page). */
export const WC = { red: '#ef4444', blk: '#0b0f1a', grn: '#22c55e', blu: '#3b82f6', org: '#f97316', yel: '#eab308', pur: '#a855f7', cyn: '#06b6d4', pnk: '#ec4899', wht: '#f1f5f9', brn: '#a16207' };
/** Header pin colours (the same as the Pinout tab's pin strip). */
export const PC = { power3: '#fb923c', power5: '#f87171', gnd: '#9ca3af', gpio: '#facc15', i2c: '#93c5fd', spi: '#c4b5fd', uart: '#f9a8d4', id: '#94a3b8', adc: '#67e8f9', sys: '#c4b5fd' };
const PCB = '#14532d', PCB_EDGE = '#22c55e', CREAM = '#f1efe8';

export const pinLabel = (p) => (p.gpio != null ? String(p.gpio) : p.type === 'power3' ? '3V3' : p.type === 'power5' ? '5V' : p.type === 'gnd' ? 'GND' : p.name);
export const piPin = (phys) => PI_HEADER[phys - 1];
const gpioPhys = (g) => PI_HEADER.find((p) => p.gpio === g).phys;

// ---------------------------------------------------------------- wires
/** A cable along the points: coloured core with a dark (or, for black wires, light) halo. */
export function cable(pts, color, { sw = 2.6, dim = false, dash = '' } = {}) {
  const d = 'M' + pts.map((p) => `${(+p[0]).toFixed(1)} ${(+p[1]).toFixed(1)}`).join(' L');
  const black = color === WC.blk;
  const halo = black ? '#94a3b8' : '#020617';
  return `<g opacity="${dim ? 0.38 : 1}"><path d="${d}" fill="none" stroke="${halo}" stroke-opacity="${black ? 0.75 : 0.55}" stroke-width="${sw + 1.9}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/></g>`;
}
/** A curved jumper between two points (a wire that arches over the board). */
export function arch(a, b, color, { bulge = 12, dim = false, sw = 2.6 } = {}) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const sgn = ny > 0 ? -1 : 1; // arch away from the page bottom
  const cx = mx + nx * bulge * sgn, cy = my + ny * bulge * sgn;
  const d = `M${a[0].toFixed(1)} ${a[1].toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  const black = color === WC.blk;
  return `<g opacity="${dim ? 0.38 : 1}"><path d="${d}" fill="none" stroke="${black ? '#94a3b8' : '#020617'}" stroke-opacity="${black ? 0.75 : 0.55}" stroke-width="${sw + 1.9}" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/></g>`;
}
const plug = (x, y, c = '#e2e8f0') => `<circle cx="${(+x).toFixed(1)}" cy="${(+y).toFixed(1)}" r="2.7" fill="${c}" stroke="#0b1226" stroke-width="1"/>`;

// ---------------------------------------------------------------- the 40-pin header (strip)
/**
 * A horizontal strip of the header (as the Pi lies in the app: even pins on the top row, odd pins below).
 * c0..c1 = the columns shown (0..19). use = { phys: true | colour } marks pins in use; the others dim.
 * Returns { svg, pos(phys) → [x, y], box, pitch }.
 */
export function headerStrip(x, y, { w = 340, c0 = 0, c1 = 19, use = null, pico = false, nums = false, pcb = true, dimOthers = true } = {}) {
  const header = pico ? PICO_HEADER : PI_HEADER;
  const colOf = (phys) => (pico ? (phys <= 20 ? phys - 1 : 40 - phys) : (phys - 1) >> 1);
  const bottom = (phys) => (pico ? phys <= 20 : phys % 2 === 1);
  const n = c1 - c0 + 1, pitch = w / n;
  const gw = Math.min(27, pitch * 0.8), gh = Math.min(17, gw * 0.85), gap = gh + 4;
  const X = (col) => x + (col - c0 + 0.5) * pitch;
  const pos = (phys) => [X(colOf(phys)), bottom(phys) ? y + gap : y];
  let s = '';
  const top = y - gh / 2 - 9, bot = y + gap + gh / 2 + 9 + (nums ? 11 : 0) + 12;
  if (pcb) {
    s += `<rect x="${x - 12}" y="${top}" width="${w + 24}" height="${bot - top}" rx="9" fill="${PCB}" stroke="${PCB_EDGE}" stroke-opacity=".55"/>`;
    s += T(x + w / 2, bot - 4, pico ? 'Raspberry Pi Pico · header (USB end at the left)' : `Raspberry Pi · pins ${c0 * 2 + 1} – ${c1 * 2 + 2} of the 40-pin header`, { size: 8, anchor: 'middle', fill: '#86efac' });
    if (c0 === 0 && !pico) s += `<rect x="${x - 9}" y="${y + gap - 2}" width="5" height="5" fill="#fde68a"/>`;
  }
  for (const p of header) {
    const col = colOf(p.phys);
    if (col < c0 || col > c1) continue;
    const [px, py] = pos(p.phys);
    const on = use ? use[p.phys] : true;
    const c = typeof on === 'string' ? on : PC[p.type] || PC.gpio;
    const dim = use && dimOthers && !on;
    s += `<rect x="${(px - gw / 2).toFixed(1)}" y="${(py - gh / 2).toFixed(1)}" width="${gw.toFixed(1)}" height="${gh.toFixed(1)}" rx="3" fill="${c}" fill-opacity="${dim ? 0.3 : 1}" stroke="${on && use ? '#fff' : '#0b1226'}" stroke-width="${on && use ? 1.6 : 0.8}"/>`;
    const lab = pico && p.gpio != null ? 'GP' + p.gpio : p.name === '3V3(OUT)' ? '3V3' : p.name === 'ADC_VREF' ? 'VREF' : p.name === 'AGND' ? 'GND' : pinLabel(p), fs = lab.length > 2 ? (gw >= 20 ? 8 : 5.8) : gw >= 20 ? 10.5 : 7.4;
    s += T(px, py + fs * 0.36, lab, { size: fs, anchor: 'middle', weight: 800, fill: dim ? '#e2e8f0' : '#0b1226' }).replace('<text', dim ? '<text fill-opacity=".55"' : '<text');
    if (nums) s += T(px, bottom(p.phys) ? py + gh / 2 + 9 : py - gh / 2 - 3, String(p.phys), { size: 6.5, anchor: 'middle', fill: '#bbf7d0' });
  }
  return { svg: s, pos, bottom, box: { x0: x - 12, y0: top, x1: x + w + 12, y1: bot }, pitch, gh, gw, gap };
}

// ---------------------------------------------------------------- breadboard
const ROW = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 6, g: 7, h: 8, i: 9, j: 10 };
const railOK = (c) => c >= 3 && (c - 3) % 6 !== 5;
/**
 * A slice of a half breadboard: columns c0..c1, hole a(c0) at (x, y), pitch p. Only the top power rails are drawn
 * (the bottom ones are cropped). Returns { svg, hole(id), box } with ids like "b5", "j12", "tn7" (rail column).
 */
export function breadboard(x, y, { c0 = 1, c1 = 16, p = 15, dim = false } = {}) {
  const X = (c) => x + (c - c0) * p;
  const Y = (r) => y + r * p;
  const pat = nid('bbh');
  const x0 = X(c0) - 1.15 * p, x1 = X(c1) + 1.15 * p, y0 = Y(-5.3), y1 = Y(11.5);
  let s = `<defs><pattern id="${pat}" x="${X(c0) - p / 2}" y="${Y(0) - p / 2}" width="${p}" height="${p}" patternUnits="userSpaceOnUse"><rect x="${p / 2 - 1.7}" y="${p / 2 - 1.7}" width="3.4" height="3.4" rx=".6" fill="#2b2d31"/></pattern></defs>`;
  s += `<g opacity="${dim ? 0.5 : 1}">`;
  s += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="7" fill="${CREAM}" stroke="#cbc8bd"/>`;
  // power rails
  s += `<rect x="${x0 + 5}" y="${Y(-4.9)}" width="${x1 - x0 - 10}" height="${2.8 * p}" rx="3" fill="#e9e6dd"/>`;
  s += L(x0 + 9, Y(-4.7), x1 - 9, Y(-4.7), { stroke: '#e0413a', sw: 1.2 }) + L(x0 + 9, Y(-2.3), x1 - 9, Y(-2.3), { stroke: '#2f6fd9', sw: 1.2 });
  s += T(x0 + 6.5, Y(-4) + 3, '+', { size: 9, fill: '#e0413a', weight: 800 }) + T(x0 + 6.5, Y(-3) + 3, '−', { size: 9, fill: '#2f6fd9', weight: 800 });
  for (let c = c0; c <= c1; c++) if (railOK(c)) for (const r of [-4, -3]) s += `<rect x="${(X(c) - 1.7).toFixed(1)}" y="${(Y(r) - 1.7).toFixed(1)}" width="3.4" height="3.4" rx=".6" fill="#2b2d31"/>`;
  // main area: two groups of five rows, the centre channel between them
  s += `<rect x="${x0 + 3}" y="${Y(4.5)}" width="${x1 - x0 - 6}" height="${p}" fill="#dedbd0"/><rect x="${x0 + 3}" y="${Y(4.5) + p / 2 - 1.5}" width="${x1 - x0 - 6}" height="3" fill="#c9c5b8"/>`;
  s += `<rect x="${X(c0) - p / 2}" y="${Y(0) - p / 2}" width="${(c1 - c0 + 1) * p}" height="${5 * p}" fill="url(#${pat})"/>`;
  s += `<rect x="${X(c0) - p / 2}" y="${Y(6) - p / 2}" width="${(c1 - c0 + 1) * p}" height="${5 * p}" fill="url(#${pat})"/>`;
  for (let c = c0; c <= c1; c++) if (c === c0 || c % 5 === 0) s += T(X(c), Y(-0.85), String(c), { size: Math.min(8, p * 0.55), anchor: 'middle', fill: '#8e8b80', weight: 700 });
  for (const [r, i] of Object.entries(ROW)) s += T(x0 + 7, Y(i) + 2.8, r, { size: Math.min(8, p * 0.55), anchor: 'middle', fill: '#8e8b80', weight: 700 });
  s += '</g>';
  const hole = (id) => {
    const m = /^([a-j])(\d+)$/.exec(id);
    if (m) return [X(+m[2]), Y(ROW[m[1]])];
    const r = /^(tp|tn)(\d+)$/.exec(id);
    if (!r) throw new Error('bad hole ' + id);
    let c = +r[2];
    if (!railOK(c)) c++;
    return [X(c), Y(r[1] === 'tp' ? -4 : -3)];
  };
  return { svg: s, hole, box: { x0, y0, x1, y1 }, X, Y, p };
}

// ---------------------------------------------------------------- part glyphs
const dimG = (d, inner) => (d ? `<g opacity=".42">${inner}</g>` : inner);
const LEDC = { red: '#ef4444', green: '#22c55e', yellow: '#facc15', blue: '#3b82f6', white: '#e5e7eb', orange: '#fb923c' };
const BANDS = { 220: ['#ef4444', '#ef4444', '#8b5a2b'], 330: ['#f97316', '#f97316', '#8b5a2b'], 470: ['#facc15', '#a855f7', '#8b5a2b'], 1000: ['#8b5a2b', '#111827', '#ef4444'], 2000: ['#ef4444', '#111827', '#ef4444'], 4700: ['#facc15', '#a855f7', '#ef4444'], 10000: ['#8b5a2b', '#111827', '#f97316'] };
const OHM = (v) => (v >= 1000 ? `${v / 1000} kΩ` : `${v} Ω`);

/** LED standing on two holes (anode a, cathode c). */
export function ledG(a, c, color = 'red', { dim = false, on = false, lift = 22 } = {}) {
  const col = LEDC[color] || color;
  const cx = (a[0] + c[0]) / 2, w = Math.max(14, Math.abs(c[0] - a[0]) + 4), by = Math.min(a[1], c[1]) - lift;
  let s = '';
  if (on) s += `<circle cx="${cx}" cy="${by - 8}" r="17" fill="${col}" fill-opacity=".28"/><circle cx="${cx}" cy="${by - 8}" r="11" fill="${col}" fill-opacity=".3"/>`;
  s += L(a[0], a[1], a[0], by, { stroke: '#cbd5e1', sw: 1.6 }) + L(c[0], c[1], c[0], by, { stroke: '#cbd5e1', sw: 1.6 });
  s += `<path d="M${cx - w / 2} ${by} v-8 a${w / 2} ${w / 2} 0 0 1 ${w} 0 v8z" fill="${col}" fill-opacity="${on ? 1 : 0.82}" stroke="#0b1226" stroke-width="1"/>`;
  s += `<rect x="${cx - w / 2 - 1.5}" y="${by}" width="${w + 3}" height="3.2" rx="1" fill="${col}" stroke="#0b1226" stroke-width=".8"/>`;
  s += `<path d="M${cx - w / 2 + 3} ${by - 9} a${w / 2 - 3} ${w / 2 - 3} 0 0 1 ${w / 2 - 3} -${w / 2 - 3}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.4" stroke-linecap="round"/>`;
  s += T(a[0] - 1, by + 14, '+', { size: 8, anchor: 'middle', fill: '#e2e8f0', weight: 800 });
  return dimG(dim, s);
}
/** Resistor between two points (any direction). */
export function resG(a, b, value = 330, { dim = false, label = true, side = 1 } = {}) {
  const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), bl = Math.min(26, len - 4);
  const bands = BANDS[value] || BANDS[330];
  let s = L(a[0], a[1], b[0], b[1], { stroke: '#cbd5e1', sw: 1.6 });
  s += `<g transform="translate(${cx} ${cy}) rotate(${ang})"><rect x="${-bl / 2}" y="-4.2" width="${bl}" height="8.4" rx="4" fill="#d9bf92" stroke="#0b1226" stroke-width=".9"/>` +
    [-6, -1.5, 3, 8].map((dx, i) => `<rect x="${dx - 1}" y="-4.1" width="2" height="8.2" fill="${i < 3 ? bands[i] : '#d4af37'}"/>`).join('') + '</g>';
  if (label) {
    const txt = OHM(value), vert = Math.abs(ang) > 45, tw = txt.length * 5 + 8;
    const lx = vert ? cx + 11 * side + (side > 0 ? 0 : -tw) : cx - tw / 2, ly = vert ? cy - 2 : cy - 18;
    s += `<rect x="${lx}" y="${ly}" width="${tw}" height="12" rx="4" fill="#0b1226" fill-opacity=".88" stroke="#a16207" stroke-width=".7"/>` + T(lx + tw / 2, ly + 9, txt, { size: 8.5, anchor: 'middle', fill: '#fde68a', weight: 700 });
  }
  return dimG(dim, s);
}
/** Push button straddling the centre channel: four legs on holes (left column top/bottom, right column top/bottom). */
export function btnG(tl, bl, tr, br, { dim = false, pressed = false } = {}) {
  const x0 = tl[0] - 4, x1 = tr[0] + 4, y0 = tl[1] + 3, y1 = bl[1] - 3;
  let s = [tl, bl, tr, br].map((q) => L(q[0], q[1], q[0], q[1] + (q === tl || q === tr ? 5 : -5), { stroke: '#cbd5e1', sw: 1.6 })).join('');
  s += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="3" fill="#1f2937" stroke="#0b1226"/>`;
  s += `<circle cx="${(x0 + x1) / 2}" cy="${(y0 + y1) / 2}" r="${Math.min((x1 - x0), (y1 - y0)) * 0.3}" fill="${pressed ? '#1d4ed8' : '#3b82f6'}" stroke="#93c5fd" stroke-width=".8"/>`;
  return dimG(dim, s);
}
/** Buzzer (top view) on two holes. */
export function buzzG(plus, minus, { dim = false, lift = 24, active = true } = {}) {
  const cx = (plus[0] + minus[0]) / 2, cy = Math.min(plus[1], minus[1]) - lift, r = 12;
  let s = L(plus[0], plus[1], plus[0], cy + r - 2, { stroke: '#cbd5e1', sw: 1.6 }) + L(minus[0], minus[1], minus[0], cy + r - 2, { stroke: '#cbd5e1', sw: 1.6 });
  s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#111827" stroke="#475569" stroke-width="1.2"/><circle cx="${cx}" cy="${cy}" r="3" fill="#0b1226" stroke="#334155"/>`;
  s += T(cx - 6.5, cy - 5, '+', { size: 9, anchor: 'middle', fill: '#fca5a5', weight: 800 });
  if (!active) s += `<circle cx="${cx}" cy="${cy}" r="${r - 3.5}" fill="none" stroke="#334155" stroke-width=".8"/>`;
  return dimG(dim, s);
}
/** A 16-pin chip straddling the channel (MCP3008): returns svg; pin holes are the caller's job. */
export function chipG(x0, x1, y0, y1, label, { dim = false, sub = '' } = {}) {
  let s = `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="3" fill="#111827" stroke="#475569" stroke-width="1.2"/>`;
  s += `<path d="M${(x0 + x1) / 2 - 6} ${y0} a6 6 0 0 0 12 0" fill="#0b1226" stroke="#475569"/>`;
  s += T((x0 + x1) / 2, (y0 + y1) / 2 + 4, label, { size: 10, anchor: 'middle', weight: 800, fill: '#cbd5e1' });
  if (sub) s += T((x0 + x1) / 2, (y0 + y1) / 2 + 15, sub, { size: 7.5, anchor: 'middle', fill: '#94a3b8' });
  return dimG(dim, s);
}

// ---------------------------------------------------------------- modules (parts with a row of pins)
const MODSTYLE = {
  hcsr04: { fill: '#1e3a8a', edge: '#60a5fa', title: 'HC-SR04' },
  pir: { fill: '#14532d', edge: '#4ade80', title: 'PIR' },
  dht22: { fill: '#1d4ed8', edge: '#93c5fd', title: 'DHT22' },
  lcd: { fill: '#14532d', edge: '#86efac', title: 'LCD 16×2 + I²C' },
  oled: { fill: '#111827', edge: '#64748b', title: 'OLED 0.96"' },
  servo: { fill: '#1d4ed8', edge: '#93c5fd', title: 'Servo SG90' },
  l298n: { fill: '#991b1b', edge: '#fca5a5', title: 'L298N' },
  relay: { fill: '#1e40af', edge: '#93c5fd', title: 'Relay module' },
  motor: { fill: '#475569', edge: '#cbd5e1', title: 'DC motor' },
  ldr: { fill: '#14532d', edge: '#86efac', title: 'Light module' },
  generic: { fill: '#1e293b', edge: '#64748b', title: '' },
};
/**
 * A module with pins along its bottom edge. pins: [{ id, name?, color?, at? }] (at = 0..1 along the edge, default evenly spaced).
 * Returns { svg, pin(id) → [x, y] }.
 */
export function moduleG(x, y, w, h, { kind = 'generic', title = null, pins = [], dim = false } = {}) {
  const st = MODSTYLE[kind] || MODSTYLE.generic;
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${st.fill}" stroke="${st.edge}" stroke-width="1.2"/>`;
  const cx = x + w / 2;
  if (kind === 'hcsr04') s += [x + w * 0.27, x + w * 0.73].map((q) => `<circle cx="${q}" cy="${y + h * 0.4}" r="${Math.min(w * 0.18, 17)}" fill="#cbd5e1" stroke="#0b1226"/><circle cx="${q}" cy="${y + h * 0.4}" r="${Math.min(w * 0.12, 11)}" fill="#475569"/>`).join('');
  if (kind === 'pir') s += `<circle cx="${cx}" cy="${y + h * 0.42}" r="${Math.min(w * 0.3, 22)}" fill="#f1f5f9" stroke="#94a3b8"/><circle cx="${cx}" cy="${y + h * 0.42}" r="${Math.min(w * 0.17, 13)}" fill="#e2e8f0" stroke="#cbd5e1"/>`;
  if (kind === 'dht22') s += `<rect x="${x + 8}" y="${y + 7}" width="${w - 16}" height="${h * 0.5}" rx="3" fill="#2563eb" stroke="#93c5fd" stroke-width=".8"/>` + [0, 1, 2, 3].map((i) => L(x + 14, y + 14 + i * 6, x + w - 14, y + 14 + i * 6, { stroke: '#1e3a8a', sw: 1.2 })).join('');
  if (kind === 'lcd') s += `<rect x="${x + 9}" y="${y + 8}" width="${w - 18}" height="${h * 0.5}" rx="3" fill="#0b2a1a" stroke="#4ade80" stroke-width=".8"/>` + T(x + 14, y + 8 + h * 0.2, 'Hello, Pi!', { size: 9, fill: '#86efac', mono: true }) + T(x + 14, y + 8 + h * 0.38, '12:30', { size: 9, fill: '#86efac', mono: true });
  if (kind === 'oled') s += `<rect x="${x + 9}" y="${y + 8}" width="${w - 18}" height="${h * 0.5}" rx="2" fill="#020617" stroke="#334155"/>` + T(x + 14, y + 8 + h * 0.22, 'Raspberry Pi', { size: 8, fill: '#e2e8f0', mono: true }) + `<rect x="${x + 14}" y="${y + 8 + h * 0.3}" width="14" height="8" fill="#e2e8f0"/>`;
  if (kind === 'servo') s += `<rect x="${x + 8}" y="${y + 6}" width="${w - 16}" height="${h * 0.5}" rx="3" fill="#1e40af" stroke="#93c5fd" stroke-width=".8"/><circle cx="${x + w * 0.7}" cy="${y + 6 + h * 0.25}" r="7" fill="#f1f5f9" stroke="#94a3b8"/><rect x="${x + w * 0.7 - 2}" y="${y - 6}" width="4" height="${h * 0.25 + 4}" rx="2" fill="#f1f5f9" stroke="#94a3b8"/>`;
  if (kind === 'l298n') s += `<rect x="${x + 10}" y="${y + 8}" width="${w * 0.4}" height="${h * 0.38}" rx="2" fill="#0f172a" stroke="#64748b"/>` + [0, 1, 2, 3, 4].map((i) => L(x + 14 + i * 7, y + 12, x + 14 + i * 7, y + 6 + h * 0.38, { stroke: '#475569', sw: 1.4 })).join('') + `<rect x="${x + w * 0.55}" y="${y + 10}" width="${w * 0.35}" height="${h * 0.28}" fill="#1f2937" stroke="#64748b"/>`;
  if (kind === 'relay') s += `<rect x="${x + 8}" y="${y + 7}" width="${w * 0.55}" height="${h * 0.5}" rx="2" fill="#2563eb" stroke="#bfdbfe"/>` + T(x + 8 + w * 0.275, y + 7 + h * 0.3, 'RELAY', { size: 8, anchor: 'middle', fill: '#dbeafe', weight: 800 });
  if (kind === 'motor') s += `<circle cx="${cx}" cy="${y + h * 0.45}" r="${Math.min(w, h) * 0.32}" fill="#94a3b8" stroke="#e2e8f0"/>` + T(cx, y + h * 0.45 + 5, 'M', { size: 15, anchor: 'middle', weight: 800, fill: '#0b1226' });
  if (kind === 'ldr') s += `<circle cx="${cx}" cy="${y + h * 0.4}" r="9" fill="#a16207" stroke="#fde68a"/><path d="M${cx - 5} ${y + h * 0.4 - 4} q3 3 0 6 t5 3" fill="none" stroke="#fde68a" stroke-width="1"/>`;
  const label = title === null ? st.title : title;
  if (label) s += T(cx, y + h - (pins.length ? 18 : 6), label, { size: 8.5, anchor: 'middle', weight: 700, fill: '#e2e8f0' });
  const pos = {};
  pins.forEach((pn, i) => {
    const f = pn.at != null ? pn.at : (i + 0.5) / pins.length, px = x + f * w;
    const py = pn.side === 'top' ? y : y + h;
    pos[pn.id] = [px, py];
    s += `<circle cx="${px}" cy="${py}" r="3.3" fill="${pn.color || '#d4af37'}" stroke="#0b1226" stroke-width="1"/>`;
    s += T(px, pn.side === 'top' ? py + 12 : py - 6, pn.name || pn.id, { size: 7.4, anchor: 'middle', fill: '#e2e8f0', weight: 700 });
  });
  return { svg: dimG(dim, s), pin: (id) => pos[id] };
}

// ---------------------------------------------------------------- the wiring scene
/** Short pin names: g17 = BCM 17, p6 = physical pin 6. */
const physOf = (id, pico = false) => (id[0] === 'g' ? (pico ? PICO_HEADER : PI_HEADER).find((p) => p.gpio === +id.slice(1)).phys : +id.slice(1));

/**
 * Draws one picture of a wiring recipe. spec = {
 *   w, h, hdr: { y, c0, c1, w?, x? }, bb?: { x, y, c0, c1, p }, mods?: [{ id, x, y, w, h, kind, title?, pins }],
 *   items: [{ s: step, k: 'led'|'res'|'btn'|'buzz'|'chip'|'jump'|'wire'|'tag'|..., ... }] }
 * step = which step to show (items with a higher s are left out; those of earlier steps are dimmed, unless all = true).
 */
export function scene(spec, step, caption, { all = false } = {}) {
  const W = spec.w || 360, H = spec.h || 330, pico = !!spec.hdr.pico;
  const bbs = spec.bb ? breadboard(spec.bb.x, spec.bb.y, spec.bb) : null;
  const items = spec.items.filter((it) => it.s <= step);
  const dim = (it) => !all && it.s < step;
  const isPin = (id) => typeof id === 'string' && /^[gp]\d+$/.test(id);
  // which header pins are in use so far
  const use = {};
  for (const it of items) if (it.k === 'wire') for (const e of [it.from, it.to]) if (isPin(e)) use[physOf(e, pico)] = true;
  const hs = headerStrip(spec.hdr.x ?? (W - (spec.hdr.w || 340)) / 2, spec.hdr.y, { w: spec.hdr.w || 340, c0: spec.hdr.c0 ?? 0, c1: spec.hdr.c1 ?? 19, use, pico, nums: false });
  const mods = {};
  let body = '';
  if (bbs) body += bbs.svg;
  for (const m of spec.mods || []) {
    if (m.s != null && m.s > step) continue;
    const g = moduleG(m.x, m.y, m.w, m.h, { kind: m.kind, title: m.title, pins: m.pins, dim: m.s != null && !all && m.s < step });
    mods[m.id] = g; body += g.svg;
  }
  const at = (id) => {
    if (Array.isArray(id)) return id;
    if (isPin(id)) return hs.pos(physOf(id, pico));
    if (id.includes('.')) { const [m, pn] = id.split('.'); return mods[m].pin(pn); }
    return bbs.hole(id);
  };
  // parts first, then wires on top
  for (const it of items) {
    const d = dim(it);
    if (it.k === 'led') body += ledG(at(it.a), at(it.c), it.color, { dim: d, on: it.on, lift: it.lift });
    else if (it.k === 'res') body += resG(at(it.a), at(it.b), it.v, { dim: d, side: it.side });
    else if (it.k === 'btn') body += btnG(at(it.tl), at(it.bl), at(it.tr), at(it.br), { dim: d });
    else if (it.k === 'buzz') body += buzzG(at(it.plus), at(it.minus), { dim: d, active: it.active !== false, lift: it.lift });
    else if (it.k === 'chip') { const a = at(it.tl), b = at(it.br); body += chipG(a[0] - 7, b[0] + 7, a[1] - 5, b[1] + 5, it.label, { dim: d, sub: it.sub }); }
    else if (it.k === 'gnd') { const [gx, gy] = it.at; body += dimG(d, L(gx - 10, gy, gx + 10, gy, { stroke: '#94a3b8', sw: 2 }) + L(gx - 7, gy + 5, gx + 7, gy + 5, { stroke: '#94a3b8', sw: 2 }) + L(gx - 3.5, gy + 10, gx + 3.5, gy + 10, { stroke: '#94a3b8', sw: 2 })); }
    else if (it.k === 'raw') body += dimG(d, it.svg);
  }
  let lane = 0, around = 0;
  for (const it of items) {
    const d = dim(it);
    const col = WC[it.col] || it.col || WC.grn;
    if (it.k === 'jump') { const a = at(it.a), b = at(it.b); body += arch(a, b, col, { dim: d, bulge: it.bulge ?? 11 }) + plug(a[0], a[1]) + plug(b[0], b[1]); }
    else if (it.k === 'cable') { body += cable(it.pts.map(at), col, { dim: d }) + plug(...at(it.pts[0])) + plug(...at(it.pts[it.pts.length - 1])); }
    else if (it.k === 'wire') {
      const fromHdr = isPin(it.from);
      const a = at(it.from), b = at(it.to);
      const ln = it.lane ?? lane++;
      let pts;
      if (fromHdr) {
        const [hx, hy] = a, low = hs.bottom(physOf(it.from, pico));
        const gx = low ? hs.pitch * 0.5 : 0;
        const yr = spec.hdr.y - hs.gh / 2 - 9 - ln * (it.gap ?? 7);
        const railTarget = typeof it.to === 'string' && (/^t[pn]\d+$/.test(it.to) || /^[a-e]\d+$/.test(it.to));
        const start = low ? [[hx + hs.gw / 2 - 1, hy], [hx + gx, hy]] : [[hx, hy - hs.gh / 2 + 2]];
        if (railTarget && bbs) {
          const xl = bbs.box.x0 - 7 - (it.around ?? around++) * 6;
          pts = [...start, [hx + gx, yr], [xl, yr], [xl, b[1]], b];
        } else pts = [...start, [hx + gx, yr], [b[0], yr], b];
        if (it.via) pts.splice(pts.length - 1, 0, ...it.via);
      } else pts = [a, ...(it.via || []), b];
      body += cable(pts, col, { dim: d }) + (fromHdr ? '' : plug(a[0], a[1], '#e2e8f0')) + plug(b[0], b[1], '#e2e8f0');
    }
  }
  for (const it of items) if (it.k === 'tag') body += T(it.x, it.y, it.text, { size: it.size || 9, anchor: it.anchor || 'start', fill: it.fill || K.acc, weight: 700 });
  for (const it of items) if (it.k === 'badge') body += BADGE(it.x, it.y, it.n);
  return fig(W, H, hs.svg + body, caption);
}

/** All step figures of a recipe: [fig1, fig2, …, figN] (the last shows everything at full strength). */
export function steps3(spec, captions) {
  return captions.map((c, i) => scene(spec, i + 1, `Step ${i + 1} of ${captions.length} — ${c}`, { all: i === captions.length - 1 && false }));
}
