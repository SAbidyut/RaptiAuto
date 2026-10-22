// Diagrams of the manual: small inline SVG pictures drawn in the app's colours. Every function returns
// a <figure> string (picture + caption). Nothing here touches the DOM, so the pictures can be tested headless.
import { crc16 } from '../plc/sim/modbus.js';

export const K = { ink: '#dbe4f5', dim: '#64748b', line: '#94a3b8', box: '#10203f', box2: '#17305c', acc: '#22d3ee', ok: '#4ade80', warn: '#fbbf24', err: '#f87171', blue: '#60a5fa', vio: '#c4b5fd', bg: '#0b1226' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const T = (x, y, s, { size = 11, fill = K.ink, anchor = 'start', weight = 500, mono = false } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}"${mono ? ' font-family="JetBrains Mono, ui-monospace, monospace"' : ''}>${esc(s)}</text>`;
export const R = (x, y, w, h, { fill = K.box, stroke = K.line, rx = 6, sw = 1.2, dash = '' } = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
export const L = (x1, y1, x2, y2, { stroke = K.line, sw = 1.6, dash = '' } = {}) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
export const P = (d, { stroke = K.line, sw = 1.6, fill = 'none', dash = '' } = {}) =>
  `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
export const AR = (x1, y1, x2, y2, { stroke = K.line, m = 'mfa' } = {}) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" marker-end="url(#${m})"/>`;
export const BADGE = (x, y, n) => `<circle cx="${x}" cy="${y}" r="8" fill="${K.acc}"/>${T(x, y + 3.6, n, { size: 10.5, fill: '#04121a', anchor: 'middle', weight: 800 })}`;
export const DOT = (x, y, c = K.line) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${c}"/>`;

export const fig = (w, h, inner, cap) => `<figure class="mf"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(cap)}">` +
  `<defs><marker id="mfa" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1L9 5L0 9z" fill="${K.line}"/></marker>` +
  `<marker id="mfb" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1L9 5L0 9z" fill="${K.acc}"/></marker>` +
  `<marker id="mfc" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1L9 5L0 9z" fill="${K.ok}"/></marker></defs>` +
  `${inner}</svg><figcaption>${esc(cap)}</figcaption></figure>`;

// ---------------------------------------------------------------- ladder symbols
/** Normally open (nc = false) or closed contact centred at (x, y). */
const contact = (x, y, label, { nc = false, sub = '', on = false } = {}) => {
  const c = on ? K.ok : K.ink;
  return L(x - 22, y, x - 7, y, { stroke: on ? K.ok : K.line }) + L(x + 7, y, x + 22, y, { stroke: on ? K.ok : K.line }) +
    L(x - 7, y - 10, x - 7, y + 10, { stroke: c, sw: 2 }) + L(x + 7, y - 10, x + 7, y + 10, { stroke: c, sw: 2 }) +
    (nc ? L(x - 11, y + 11, x + 11, y - 11, { stroke: c, sw: 1.6 }) : '') +
    T(x, y - 16, label, { size: 10.5, anchor: 'middle', fill: K.acc, weight: 700 }) + (sub ? T(x, y + 25, sub, { size: 8.5, anchor: 'middle', fill: K.dim }) : '');
};
const coil = (x, y, label, { mark = '', sub = '', on = false } = {}) =>
  L(x - 22, y, x - 10, y, { stroke: on ? K.ok : K.line }) + L(x + 10, y, x + 22, y, { stroke: on ? K.ok : K.line }) +
  P(`M${x - 6} ${y - 10} a10 10 0 0 0 0 20`, { stroke: on ? K.ok : K.ink, sw: 2 }) + P(`M${x + 6} ${y - 10} a10 10 0 0 1 0 20`, { stroke: on ? K.ok : K.ink, sw: 2 }) +
  (mark ? T(x, y + 4, mark, { size: 10, anchor: 'middle', weight: 800 }) : '') +
  T(x, y - 16, label, { size: 10.5, anchor: 'middle', fill: K.acc, weight: 700 }) + (sub ? T(x, y + 25, sub, { size: 8.5, anchor: 'middle', fill: K.dim }) : '');

// ---------------------------------------------------------------- PLC
export const scan = () => fig(360, 236,
  [['① Read the inputs', 'X0 … X7 are copied into memory'], ['② Run the program', 'rung by rung, top to bottom'], ['③ Update the outputs', 'Y0 … Y7 switch at the end of the scan'], ['④ Communicate', 'HMI (COM1) · Modbus (COM2) · USB']]
    .map(([a, b], i) => R(30, 14 + i * 56, 290, 42, { fill: i === 1 ? K.box2 : K.box, stroke: i === 1 ? K.acc : K.line }) + T(44, 33 + i * 56, a, { size: 13, weight: 700 }) + T(44, 48 + i * 56, b, { size: 10, fill: K.line })).join('') +
  [0, 1, 2].map((i) => AR(175, 56 + i * 56, 175, 70 + i * 56)).join('') +
  P('M320 207 H345 V35 H323', { stroke: K.acc }) + `<path d="M323 35l7-4v8z" fill="${K.acc}"/>` + T(338, 125, 'repeat', { size: 9.5, fill: K.acc, anchor: 'middle' }).replace('<text', `<text transform="rotate(90 338 125)"`),
  'The scan cycle: the PLC repeats these four steps all the time — one round is called a scan (about 1 ms to 10 ms).');

export const symbols = () => {
  const items = [
    (x) => contact(x, 44, 'X0', { sub: 'NO · LD' }), (x) => contact(x, 44, 'X1', { nc: true, sub: 'NC · LDI' }), (x) => coil(x, 44, 'Y0', { sub: 'OUT' }),
    (x) => coil(x, 44, 'M0', { mark: 'S', sub: 'SET' }), (x) => coil(x, 44, 'M0', { mark: 'R', sub: 'RST' }),
    (x) => R(x - 26, 28, 52, 32, { fill: K.box2, stroke: K.acc }) + T(x, 42, 'TMR', { size: 10, anchor: 'middle', weight: 800 }) + T(x, 54, 'T0 K50', { size: 9, anchor: 'middle', fill: K.acc }) + T(x, 74, 'timer', { size: 8.5, anchor: 'middle', fill: K.dim }),
  ];
  return fig(360, 92, items.map((f, i) => f(30 + i * 60)).join(''), 'The symbols you use most: normally open contact, normally closed contact, output coil, SET, RST and a timer box.');
};

export const andOr = () => fig(360, 150,
  T(90, 16, 'AND  (in series)', { size: 12, anchor: 'middle', weight: 700, fill: K.warn }) + T(270, 16, 'OR  (in parallel)', { size: 12, anchor: 'middle', weight: 700, fill: K.warn }) +
  L(16, 34, 16, 90) + L(164, 34, 164, 90) + L(16, 66, 28, 66) + contact(50, 66, 'X0') + contact(94, 66, 'X1') + coil(138, 66, 'Y0') + L(160, 66, 164, 66) +
  T(90, 112, 'Y0 is ON only when', { size: 10, anchor: 'middle', fill: K.line }) + T(90, 126, 'X0 AND X1 are ON', { size: 10, anchor: 'middle', fill: K.ink, weight: 700 }) +
  L(196, 34, 196, 110) + L(344, 34, 344, 110) + L(196, 56, 210, 56) + contact(232, 56, 'X0') + L(254, 56, 288, 56) + coil(310, 56, 'Y0') + L(332, 56, 344, 56) +
  L(205, 56, 205, 96) + L(205, 96, 210, 96) + contact(232, 96, 'X1') + L(254, 96, 266, 96) + L(266, 96, 266, 56) + DOT(205, 56) + DOT(266, 56) +
  T(270, 126, 'Y0 is ON when X0 OR X1 is ON', { size: 10, anchor: 'middle', fill: K.ink, weight: 700 }) + T(270, 140, '(or both)', { size: 9.5, anchor: 'middle', fill: K.line }),
  'Contacts in series work like AND, contacts in parallel like OR. The coil on the right is switched by the result.');

export const latch = () => fig(380, 150,
  L(20, 24, 20, 140, { sw: 3 }) + L(360, 24, 360, 140, { sw: 3 }) + T(20, 16, 'L', { size: 10, anchor: 'middle', fill: K.dim }) + T(360, 16, 'N', { size: 10, anchor: 'middle', fill: K.dim }) +
  L(20, 64, 44, 64) + contact(66, 64, 'X0 START') + L(88, 64, 128, 64) + contact(150, 64, 'X1', { sub: 'STOP (NC button)' }) + L(172, 64, 290, 64) + coil(312, 64, 'Y0', { sub: 'RUN lamp' }) + L(334, 64, 360, 64) +
  L(44, 64, 44, 112) + contact(66, 112, 'Y0', { sub: 'holds itself' }) + L(88, 112, 108, 112) + L(108, 112, 108, 64) + DOT(44, 64) + DOT(108, 64) +
  T(124, 112, 'Y0 stays on after START is released.', { size: 9.5, fill: K.line }) + T(124, 126, 'STOP (X1 goes off) breaks the circuit.', { size: 9.5, fill: K.line }),
  'The start / stop (self-holding) circuit — the most important rung in automation. Press START: Y0 turns on and its own contact keeps it on.');

export const ioWiring = () => {
  const red = K.err, blu = K.blue;
  return fig(380, 244,
    R(14, 24, 84, 196, { fill: K.box2 }) + T(56, 40, '24 V supply', { size: 10.5, anchor: 'middle', weight: 700 }) +
    [['+V1', 58, red], ['−V1', 90, blu], ['+V2', 168, red], ['−V2', 200, blu]].map(([n, y, c]) => T(88, y + 3.5, n, { size: 10, anchor: 'end', fill: c, weight: 700 }) + DOT(98, y, c)).join('') +
    R(262, 24, 104, 196, { fill: K.box2 }) + T(314, 40, 'PLC DVP16ES2', { size: 10.5, anchor: 'middle', weight: 700 }) +
    [['X0', 58], ['S/S', 90], ['C0', 168], ['Y0', 200]].map(([n, y]) => DOT(262, y, K.ok) + T(272, y + 3.5, n, { size: 10, fill: K.ok, weight: 700 })).join('') +
    // button: +V1 → button → X0
    L(98, 58, 134, 58, { stroke: red }) + contact(156, 58, 'START', { sub: 'push button NO' }) + L(178, 58, 262, 58, { stroke: red }) +
    L(98, 90, 262, 90, { stroke: blu }) + T(180, 108, 'S/S to 0 V: input ON at 24 V', { size: 8.5, anchor: 'middle', fill: K.dim }) +
    L(98, 168, 262, 168, { stroke: red }) + T(180, 160, 'C0 = relay common → +24 V', { size: 8.5, anchor: 'middle', fill: K.dim }) +
    L(262, 200, 190, 200) + `<circle cx="178" cy="200" r="12" fill="none" stroke="${K.warn}" stroke-width="2"/>` + L(170, 192, 186, 208, { stroke: K.warn }) + L(186, 192, 170, 208, { stroke: K.warn }) + L(166, 200, 98, 200, { stroke: blu }) + T(178, 226, 'lamp 24 V', { size: 9, anchor: 'middle', fill: K.dim }),
    'A push button on input X0 and a lamp on output Y0 — exactly how the lab examples are wired (+V1 / −V1 feed the inputs, +V2 / −V2 the outputs).');
};

export const memory = () => fig(380, 222,
  T(190, 14, 'PLC memory (devices)', { size: 11.5, anchor: 'middle', weight: 700, fill: K.warn }) +
  R(14, 26, 98, 44, { fill: K.box2, stroke: K.ok }) + T(63, 44, 'X inputs', { size: 12, anchor: 'middle', weight: 700, fill: K.ok }) + T(63, 60, 'X0 … X377 (octal)', { size: 8.5, anchor: 'middle', fill: K.line }) +
  R(268, 26, 98, 44, { fill: K.box2, stroke: K.err }) + T(317, 44, 'Y outputs', { size: 12, anchor: 'middle', weight: 700, fill: K.err }) + T(317, 60, 'Y0 … Y377 (octal)', { size: 8.5, anchor: 'middle', fill: K.line }) +
  T(63, 22, 'buttons, sensors', { size: 8, anchor: 'middle', fill: K.dim }) + T(317, 22, 'lamps, contactors', { size: 8, anchor: 'middle', fill: K.dim }) +
  R(14, 86, 172, 40, { fill: K.box }) + T(26, 104, 'M  auxiliary relays', { size: 11.5, weight: 700 }) + T(26, 118, 'M0 … M4095 · bit', { size: 9, fill: K.line }) +
  R(194, 86, 172, 40, { fill: K.box }) + T(206, 104, 'S  step relays', { size: 11.5, weight: 700 }) + T(206, 118, 'S0 … S1023 · bit', { size: 9, fill: K.line }) +
  R(14, 134, 172, 40, { fill: K.box }) + T(26, 152, 'T  timers', { size: 11.5, weight: 700 }) + T(26, 166, 'T0 … T255 · bit + 16-bit value', { size: 9, fill: K.line }) +
  R(194, 134, 172, 40, { fill: K.box }) + T(206, 152, 'C  counters', { size: 11.5, weight: 700 }) + T(206, 166, 'C0 … C255 · bit + 16-bit value', { size: 9, fill: K.line }) +
  R(14, 182, 352, 32, { fill: K.box2, stroke: K.acc }) + T(26, 196, 'D  data registers', { size: 11.5, weight: 700, fill: K.acc }) + T(26, 208, 'D0 … D9999 · 16-bit words (two registers together = 32 bit)', { size: 9, fill: K.line }),
  'Where data lives in a Delta DVP PLC. X and Y touch the real world; M, S, T, C and D are inside the PLC.');

export const timerChart = () => {
  const x0 = 56, sc = 30; // 1 s = 30 px
  const X = (t) => x0 + t * sc;
  return fig(380, 214,
    T(8, 36, 'X0', { size: 11, fill: K.acc, weight: 700 }) + T(8, 38 + 6, '(input)', { size: 8, fill: K.dim }) +
    P(`M${x0} 52 H${X(1)} V24 H${X(8)} V52 H${X(10)}`, { stroke: K.acc, sw: 2 }) +
    T(8, 108, 'T0 value', { size: 11, fill: K.warn, weight: 700 }) + T(8, 119, '(0.1 s steps)', { size: 8, fill: K.dim }) +
    P(`M${x0} 132 H${X(1)} L${X(6)} 86 H${X(8)} V132 H${X(10)}`, { stroke: K.warn, sw: 2 }) + T(X(6) + 4, 82, 'K50', { size: 9.5, fill: K.warn, weight: 700 }) +
    T(8, 168, 'T0 contact', { size: 11, fill: K.ok, weight: 700 }) +
    P(`M${x0} 184 H${X(6)} V160 H${X(8)} V184 H${X(10)}`, { stroke: K.ok, sw: 2 }) +
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((t) => L(X(t), 196, X(t), 200, { stroke: K.dim }) + T(X(t), 210, String(t), { size: 8.5, anchor: 'middle', fill: K.dim })).join('') + L(x0, 196, X(10), 196, { stroke: K.dim }) + T(X(10) + 12, 210, 's', { size: 9, fill: K.dim }) +
    L(X(1), 20, X(1), 196, { stroke: K.dim, dash: '2 3', sw: 1 }) + L(X(6), 70, X(6), 196, { stroke: K.dim, dash: '2 3', sw: 1 }) + T((X(1) + X(6)) / 2, 66, '5 s', { size: 10, anchor: 'middle', fill: K.warn }),
    'TMR T0 K50 with the default 100 ms timer: the contact T0 comes on 5.0 s after X0 and goes off when X0 goes off (the value is cleared).');
};

export const counterChart = () => {
  const x0 = 56, sc = 30, X = (t) => x0 + t * sc;
  const pl = [1, 2, 3, 4, 5].map((t) => `M${X(t)} 52 V28 H${X(t + 0.5)} V52`).join(' ');
  return fig(380, 214,
    T(8, 40, 'X0 (parts)', { size: 11, fill: K.acc, weight: 700 }) + P(`M${x0} 52 ${pl} H${X(10)}`, { stroke: K.acc, sw: 2 }) +
    T(8, 108, 'C0 value', { size: 11, fill: K.warn, weight: 700 }) +
    P(`M${x0} 132 H${X(1)} V122 H${X(2)} V112 H${X(3)} V102 H${X(4)} V92 H${X(5)} V82 H${X(7)} V132 H${X(10)}`, { stroke: K.warn, sw: 2 }) +
    [1, 2, 3, 4, 5].map((n) => T(X(n) + 5, 129 - n * 10, String(n), { size: 8.5, fill: K.warn })).join('') +
    T(8, 168, 'C0 contact', { size: 11, fill: K.ok, weight: 700 }) + P(`M${x0} 184 H${X(5)} V160 H${X(7)} V184 H${X(10)}`, { stroke: K.ok, sw: 2 }) +
    T(X(7) + 4, 70, 'RST C0', { size: 9.5, fill: K.err, weight: 700 }) + L(X(7), 56, X(7), 196, { stroke: K.err, dash: '3 3', sw: 1 }) +
    [0, 2, 4, 6, 8, 10].map((t) => L(X(t), 196, X(t), 200, { stroke: K.dim }) + T(X(t), 210, String(t), { size: 8.5, anchor: 'middle', fill: K.dim })).join('') + L(x0, 196, X(10), 196, { stroke: K.dim }),
    'CNT C0 K5: every rising edge of X0 adds 1. At the fifth part the contact C0 turns on and stays on until C0 is reset with RST C0.');
};

// ---------------------------------------------------------------- the lab screen
export const tour = () => fig(380, 232,
  R(6, 6, 368, 220, { fill: K.bg, stroke: K.line, rx: 14 }) +
  R(12, 12, 356, 26, { fill: K.box }) + T(24, 29, 'VFD forward / reverse …', { size: 9.5 }) + R(262, 15, 52, 20, { fill: K.err, stroke: 'none', rx: 8 }) + T(288, 29, 'Stop', { size: 9, anchor: 'middle', fill: '#fff', weight: 700 }) + T(344, 31, '⋮', { size: 15, anchor: 'middle' }) +
  R(12, 41, 356, 14, { fill: '#0b2a1a', stroke: 'none', rx: 4 }) + T(20, 51, '● 00:12.4  PLC RUN  HMI  COM2  30.00 Hz', { size: 8, fill: K.ok }) +
  R(12, 58, 224, 128, { fill: '#0d1a36', stroke: K.dim }) + T(124, 124, '3D / 2D lab view', { size: 11, anchor: 'middle', fill: K.dim }) +
  R(16, 62, 74, 16, { fill: K.box2, stroke: 'none', rx: 8 }) + T(53, 73.5, '✋ Operate  ⚡ Wire', { size: 7.5, anchor: 'middle' }) +
  R(206, 62, 26, 100, { fill: K.box2, stroke: 'none', rx: 8 }) + [70, 86, 102, 118, 134, 150].map((y) => `<circle cx="219" cy="${y}" r="4" fill="${K.line}"/>`).join('') +
  R(16, 166, 36, 16, { fill: K.box2, stroke: 'none', rx: 8 }) + T(34, 177.5, '2D  3D', { size: 7.5, anchor: 'middle' }) + [58, 100, 142].map((x) => R(x, 166, 38, 16, { fill: K.box2, stroke: 'none', rx: 8 })).join('') + T(77, 177.5, 'Overview', { size: 7, anchor: 'middle' }) + T(119, 177.5, 'Network', { size: 7, anchor: 'middle' }) + T(161, 177.5, 'Panel…', { size: 7, anchor: 'middle' }) +
  R(240, 58, 128, 128, { fill: '#0d1a36', stroke: K.dim }) + T(304, 124, 'second screen', { size: 10, anchor: 'middle', fill: K.dim }) + T(304, 138, '(Ladder, HMI, VFD …)', { size: 8.5, anchor: 'middle', fill: K.dim }) +
  R(12, 192, 356, 28, { fill: K.box }) + ['Lab', 'Ladder', 'HMI', 'VFD', 'Monitor'].map((t, i) => (i < 2 ? R(20 + i * 70, 196, 58, 20, { fill: K.box2, stroke: K.acc, rx: 8 }) : '') + T(49 + i * 70, 210, t, { size: 9, anchor: 'middle', fill: i < 2 ? K.acc : K.line, weight: 700 })).join('') +
  BADGE(256, 20, 1) + BADGE(358, 24, 2) + BADGE(104, 70, 3) + BADGE(219, 58, 4) + BADGE(30, 160, 5) + BADGE(98, 160, 6) + BADGE(366, 196, 7) + BADGE(350, 48, 8),
  'The Delta PLC Lab on a phone held sideways. 1 Simulate / Stop · 2 menu · 3 Operate / Wire · 4 tool rail · 5 2D / 3D · 6 jump chips · 7 tabs · 8 status line.');

export const twoPane = () => {
  const phone = (x, panes, tabs, label) => R(x, 8, 112, 78, { fill: K.bg, stroke: K.line, rx: 8 }) +
    panes.map(([px, pw, t]) => R(x + px, 14, pw, 52, { fill: '#0d1a36', stroke: K.dim, rx: 3 }) + T(x + px + pw / 2, 44, t, { size: 8.5, anchor: 'middle', fill: K.dim })).join('') +
    ['Lab', 'Lad', 'HMI', 'VFD', 'Mon'].map((n, i) => R(x + 6 + i * 20, 70, 18, 11, { fill: tabs.includes(i) ? K.box2 : 'none', stroke: tabs.includes(i) ? K.acc : K.dim, rx: 3 }) + T(x + 15 + i * 20, 78.6, n, { size: 6, anchor: 'middle', fill: tabs.includes(i) ? K.acc : K.dim })).join('') +
    T(x + 56, 104, label, { size: 9.5, anchor: 'middle', fill: K.ink, weight: 600 });
  return fig(380, 116,
    phone(8, [[6, 100, 'Lab']], [0], '① one screen') + phone(134, [[6, 52, 'Lab'], [60, 46, 'Ladder']], [0, 1], '② tap Ladder: two') + phone(260, [[6, 100, 'Ladder']], [1], '③ tap Lab: closed') +
    AR(122, 48, 132, 48, { m: 'mfb', stroke: K.acc }) + AR(248, 48, 258, 48, { m: 'mfb', stroke: K.acc }),
    'Landscape: tap a tab at the bottom to open that screen beside the one you have; tap it again to close it. The last screen cannot be closed.');
};

// ---------------------------------------------------------------- HMI
export const hmiLayout = () => {
  const s = 0.45, ox = 30, oy = 14; // 800 × 480 → 360 × 216
  const X = (v) => ox + v * s, Y = (v) => oy + v * s;
  const grid = [100, 200, 300, 400, 500, 600, 700].map((v) => L(X(v), Y(0), X(v), Y(480), { stroke: K.dim, sw: 0.5, dash: '2 3' })).join('') + [100, 200, 300, 400].map((v) => L(X(0), Y(v), X(800), Y(v), { stroke: K.dim, sw: 0.5, dash: '2 3' })).join('');
  return fig(400, 272,
    R(X(0), Y(0), 800 * s, 480 * s, { fill: '#0b1630', stroke: K.line, rx: 4 }) + grid +
    R(X(12), Y(10), 776 * s, 58 * s, { fill: '#10224a', stroke: '#2b4470' }) + T(X(28), Y(46), 'MOTOR CONTROL', { size: 11, weight: 800 }) +
    R(X(12), Y(80), 384 * s, 240 * s, { fill: '#0f1d3a', stroke: '#2b4470' }) +
    `<circle cx="${X(120)}" cy="${Y(200)}" r="${48 * s}" fill="none" stroke="${K.acc}" stroke-width="2"/>` + T(X(120), Y(206), '12.5', { size: 11, anchor: 'middle', weight: 700 }) +
    R(X(226), Y(112), 160 * s, 52 * s, { fill: '#0b1630', stroke: K.line }) + T(X(306), Y(145), '30.0 Hz', { size: 10, anchor: 'middle', weight: 700 }) +
    R(X(418), Y(112), 170 * s, 60 * s, { fill: '#15803d', stroke: '#22c55e', rx: 6 }) + T(X(503), Y(148), 'START', { size: 11, anchor: 'middle', weight: 800 }) +
    R(X(418), Y(180), 170 * s, 60 * s, { fill: '#b91c1c', stroke: '#ef4444', rx: 6 }) + T(X(503), Y(216), 'STOP', { size: 11, anchor: 'middle', weight: 800 }) +
    `<circle cx="${X(650)}" cy="${Y(160)}" r="${22 * s * 1.6}" fill="#22c55e"/>` +
    P(`M${X(24)} ${Y(440)} L${X(120)} ${Y(420)} L${X(220)} ${Y(430)} L${X(330)} ${Y(390)} L${X(430)} ${Y(396)} L${X(540)} ${Y(370)} L${X(660)} ${Y(380)} L${X(770)} ${Y(360)}`, { stroke: K.warn, sw: 1.6 }) +
    BADGE(X(8), Y(6), 1) + BADGE(X(60), Y(190), 2) + BADGE(X(226) + 20, Y(104), 3) + BADGE(X(418) + 8, Y(104), 4) + BADGE(X(650) + 16, Y(122), 5) + BADGE(X(30), Y(380), 6) +
    T(X(0), Y(480) + 11, '0', { size: 8.5, fill: K.dim, anchor: 'middle' }) + T(X(800), Y(480) + 11, '800', { size: 8.5, fill: K.dim, anchor: 'middle' }) + T(X(0) - 8, Y(480) - 2, '480', { size: 8.5, fill: K.dim, anchor: 'end' }) +
    T(30, 250, '1 header band · 2 meter · 3 numeric display', { size: 9.5, fill: K.line }) + T(30, 264, '4 buttons · 5 lamp · 6 trend graph', { size: 9.5, fill: K.line }),
    'A DOP-107BV screen is 800 × 480 pixels. You place objects (meter, buttons, numbers, lamps, trend …) anywhere on this canvas; positions snap to a 10 px grid.');
};

export const hmiFlow = () => fig(380, 156,
  R(8, 40, 104, 70, { fill: K.box2, stroke: K.acc }) + T(60, 62, 'HMI', { size: 13, anchor: 'middle', weight: 800 }) + T(60, 78, 'DOP-107BV', { size: 9.5, anchor: 'middle', fill: K.line }) + T(60, 94, 'touch screen', { size: 9.5, anchor: 'middle', fill: K.line }) +
  R(150, 24, 104, 102, { fill: K.box2, stroke: K.ok }) + T(202, 46, 'PLC', { size: 13, anchor: 'middle', weight: 800 }) + T(202, 64, 'M0 M10 …', { size: 9.5, anchor: 'middle', fill: K.line, mono: true }) + T(202, 78, 'D0 D10 …', { size: 9.5, anchor: 'middle', fill: K.line, mono: true }) + T(202, 98, 'COM1 RS-232', { size: 9, anchor: 'middle', fill: K.dim }) + T(202, 112, '9600 7E1 · ID 1', { size: 9, anchor: 'middle', fill: K.dim }) +
  R(292, 40, 80, 70, { fill: K.box }) + T(332, 62, 'Machine', { size: 12, anchor: 'middle', weight: 700 }) + T(332, 78, 'X inputs', { size: 9.5, anchor: 'middle', fill: K.line }) + T(332, 94, 'Y outputs', { size: 9.5, anchor: 'middle', fill: K.line }) +
  AR(114, 62, 148, 62, { m: 'mfb', stroke: K.acc }) + AR(148, 90, 114, 90, { m: 'mfc', stroke: K.ok }) + AR(256, 75, 290, 75) +
  T(131, 55, 'write', { size: 8.5, anchor: 'middle', fill: K.acc }) + T(131, 104, 'read', { size: 8.5, anchor: 'middle', fill: K.ok }) +
  T(190, 146, 'The HMI has no program of its own: every object is linked to a PLC device.', { size: 9, anchor: 'middle', fill: K.line }),
  'HMI ↔ PLC: a button writes a bit (M10 …), a number or a meter reads a word (D30 …). The PLC program does the work.');

// ---------------------------------------------------------------- VFD
export const vfdBlocks = () => fig(380, 176,
  R(116, 8, 150, 30, { fill: K.box, stroke: K.warn, dash: '3 3' }) + T(191, 21, 'Control: keypad · MI1…MI7', { size: 9.5, anchor: 'middle', fill: K.warn, weight: 600 }) + T(191, 33, 'AVI / ACI · RS-485 Modbus', { size: 9, anchor: 'middle', fill: K.warn }) +
  [['Mains', '1~ 230 V', 8], ['Rectifier', 'AC → DC', 78], ['DC bus', 'capacitor', 148], ['Inverter', 'DC → AC', 218]].map(([a, b, x], i) => R(x, 66, 62, 58, { fill: i === 3 ? K.box2 : K.box, stroke: i === 3 ? K.acc : K.line }) + T(x + 31, 90, a, { size: 10.5, anchor: 'middle', weight: 700 }) + T(x + 31, 104, b, { size: 8, anchor: 'middle', fill: K.line })).join('') +
  `<circle cx="344" cy="95" r="26" fill="${K.box2}" stroke="${K.ok}" stroke-width="1.4"/>` + T(344, 99, 'M 3~', { size: 11, anchor: 'middle', weight: 800, fill: K.ok }) +
  [[70, 95, 78], [140, 95, 148], [210, 95, 218], [280, 95, 318]].map(([a, y, b]) => AR(a, y, b, y)).join('') + AR(249, 40, 249, 64, { m: 'mfb', stroke: K.warn }) +
  P('M222 142 q8 -12 16 0 t16 0 t16 0', { stroke: K.acc, sw: 1.4 }) + T(262, 158, 'variable voltage (V) and frequency (f)', { size: 9, anchor: 'middle', fill: K.acc }),
  'Inside a variable frequency drive: the mains is rectified to DC and the inverter builds a new AC with the voltage and frequency you ask for — the motor speed follows the frequency.');

export const vfCurve = () => fig(360, 198,
  L(46, 160, 330, 160, { stroke: K.dim }) + L(46, 160, 46, 20, { stroke: K.dim }) +
  P('M46 148 L246 40 H322', { stroke: K.acc, sw: 2.2 }) + L(246, 40, 246, 160, { stroke: K.dim, dash: '3 3', sw: 1 }) + L(46, 40, 246, 40, { stroke: K.dim, dash: '3 3', sw: 1 }) +
  T(12, 44, '220 V', { size: 9.5, fill: K.warn }) + T(10, 30, 'voltage', { size: 9, fill: K.dim }) + T(246, 176, '50 Hz', { size: 9.5, anchor: 'middle', fill: K.warn }) + T(46, 176, '0', { size: 9.5, anchor: 'middle', fill: K.dim }) + T(330, 176, 'frequency', { size: 9, anchor: 'end', fill: K.dim }) +
  T(150, 128, 'V/F line: voltage grows with frequency', { size: 9.5, fill: K.ink }) + T(150, 141, 'so the motor flux stays constant', { size: 9.5, fill: K.line }) + T(120, 32, 'Pr.01-01 = base frequency · Pr.01-02 = base voltage', { size: 8.5, fill: K.dim }) + T(262, 62, 'above 50 Hz:', { size: 8.5, fill: K.dim }) + T(262, 73, 'constant voltage', { size: 8.5, fill: K.dim }),
  'The V/F curve of the MS300: at 25 Hz the drive gives about half the voltage, at 50 Hz the full 220 V.');

export const rampChart = () => fig(360, 168,
  L(40, 134, 340, 134, { stroke: K.dim }) + L(40, 134, 40, 18, { stroke: K.dim }) +
  P('M40 134 L120 44 H230 L300 134', { stroke: K.acc, sw: 2.4 }) + L(120, 44, 120, 134, { stroke: K.dim, dash: '3 3', sw: 1 }) + L(230, 44, 230, 134, { stroke: K.dim, dash: '3 3', sw: 1 }) + L(40, 44, 120, 44, { stroke: K.dim, dash: '3 3', sw: 1 }) +
  T(80, 150, 'acceleration', { size: 9.5, anchor: 'middle', fill: K.warn }) + T(80, 162, 'Pr.01-12', { size: 9, anchor: 'middle', fill: K.dim }) + T(175, 150, 'constant speed', { size: 9.5, anchor: 'middle', fill: K.ok }) + T(265, 150, 'deceleration', { size: 9.5, anchor: 'middle', fill: K.warn }) + T(265, 162, 'Pr.01-13', { size: 9, anchor: 'middle', fill: K.dim }) +
  T(30, 48, 'f set', { size: 9.5, anchor: 'end', fill: K.acc }) + T(30, 22, 'Hz', { size: 9, anchor: 'end', fill: K.dim }) + T(340, 150, 't', { size: 9, anchor: 'end', fill: K.dim }),
  'Acceleration and deceleration: the drive changes the frequency gradually (times in seconds) so the motor and the machine start and stop softly.');

export const keypad = () => fig(300, 236,
  R(20, 8, 260, 220, { fill: '#1b1f27', stroke: '#3b4150', rx: 14 }) + T(44, 34, '▲ DELTA', { size: 12, weight: 800 }) +
  R(62, 46, 112, 42, { fill: '#050102', stroke: '#2a2f3a', rx: 4 }) + T(118, 76, 'F50.00', { size: 22, anchor: 'middle', fill: '#ff3b2f', weight: 700, mono: true }) +
  [['RUN', 54], ['FWD', 68], ['REV', 82]].map(([n, y]) => `<circle cx="32" cy="${y}" r="2.6" fill="${n === 'FWD' ? K.ok : '#3a4150'}"/>` + T(37, y + 3, n, { size: 6, fill: K.line })).join('') +
  `<circle cx="238" cy="62" r="22" fill="#0e1117" stroke="#d1d5db" stroke-width="2"/>` + L(238, 62, 250, 50, { stroke: '#d1d5db', sw: 3 }) + T(238, 98, 'speed dial', { size: 7.5, anchor: 'middle', fill: K.dim }) +
  T(190, 55, 'STOP', { size: 6.5, fill: K.line }) + `<circle cx="184" cy="52" r="2.6" fill="${K.err}"/>` + T(190, 69, 'PLC', { size: 6.5, fill: K.line }) + `<circle cx="184" cy="66" r="2.6" fill="#3a4150"/>` +
  [['RUN', '#16a34a', 36], ['▲', '#d1d5db', 106], ['MODE', '#d1d5db', 176]].map(([n, c, x]) => R(x, 120, 68, 36, { fill: c, stroke: 'none', rx: 7 }) + T(x + 34, 143, n, { size: 12, anchor: 'middle', weight: 800, fill: n === 'RUN' ? '#fff' : '#111' })).join('') +
  [['◀/▼', '#d1d5db', 106], ['ENTER', '#2563eb', 176]].map(([n, c, x]) => R(x, 168, 68, 36, { fill: c, stroke: 'none', rx: 7 }) + T(x + 34, 191, n, { size: 12, anchor: 'middle', weight: 800, fill: n === 'ENTER' ? '#fff' : '#111' })).join('') +
  R(36, 168, 68, 36, { fill: '#dc2626', stroke: 'none', rx: 7 }) + T(70, 183, 'STOP', { size: 11, anchor: 'middle', weight: 800, fill: '#fff' }) + T(70, 197, 'RESET', { size: 8.5, anchor: 'middle', weight: 700, fill: '#fff' }) +
  BADGE(176, 34, 1) + BADGE(30, 138, 2) + BADGE(266, 30, 3),
  'The MS300 keypad (same in 3D and in the VFD tab). 1 LEDs · 2 keys · 3 speed dial. MODE changes the page: F (command) → H (output) → U → parameters.');

export const vfdTerminals = () => fig(380, 214,
  R(8, 18, 112, 180, { fill: K.box2 }) + T(64, 36, 'PLC DVP16ES2', { size: 10.5, anchor: 'middle', weight: 700 }) + T(64, 50, '(relay outputs)', { size: 8.5, anchor: 'middle', fill: K.dim }) +
  ['Y4', 'Y5', 'Y6', 'Y7', 'C1'].map((n, i) => DOT(120, 70 + i * 28, K.ok) + T(110, 73.5 + i * 28, n, { size: 10, anchor: 'end', fill: K.ok, weight: 700 })).join('') +
  R(262, 18, 110, 180, { fill: K.box2 }) + T(317, 36, 'MS300 terminals', { size: 10.5, anchor: 'middle', weight: 700 }) +
  ['MI1', 'MI2', 'MI3', 'MI4', 'DCM'].map((n, i) => DOT(262, 70 + i * 28, K.acc) + T(272, 73.5 + i * 28, n, { size: 10, fill: K.acc, weight: 700 })).join('') +
  [0, 1, 2, 3, 4].map((i) => L(120, 70 + i * 28, 262, 70 + i * 28, { stroke: i === 4 ? K.blue : K.line })).join('') +
  ['FWD', 'REV', 'step 1', 'step 2', 'common'].map((n, i) => T(191, 66 + i * 28, n, { size: 8.5, anchor: 'middle', fill: K.dim })).join(''),
  'Controlling the drive through its terminals: a closed relay contact between MI and DCM is the command (MI1 = FWD, MI2 = REV, MI3 / MI4 = multi-step speeds).');

// ---------------------------------------------------------------- Modbus
export const modbusBus = () => fig(380, 214,
  R(4, 22, 76, 56, { fill: K.box2, stroke: K.acc }) + T(42, 44, 'PLC', { size: 12.5, anchor: 'middle', weight: 800 }) + T(42, 58, 'COM2 master', { size: 8.5, anchor: 'middle', fill: K.line }) + T(42, 70, 'MODRW', { size: 8.5, anchor: 'middle', fill: K.acc, mono: true }) +
  L(80, 50, 366, 50, { stroke: K.acc, sw: 2.4 }) + L(80, 56, 366, 56, { stroke: K.blue, sw: 2.4 }) + T(230, 40, 'RS-485 twisted pair: D+ and D−', { size: 9, anchor: 'middle', fill: K.acc }) +
  [['ID 1', 'MS300 drive', 128], ['ID 2', 'DTB4848 PID', 200], ['ID 3', 'T/H sensor', 272], ['ID 4', 'Energy meter', 344]].map(([a, b, x]) =>
    L(x, 56, x, 108, { sw: 1.4 }) + DOT(x, 53, K.acc) + R(x - 32, 108, 64, 56, { fill: K.box }) + T(x, 128, a, { size: 11.5, anchor: 'middle', weight: 800, fill: K.warn }) + T(x, 143, b, { size: 8.5, anchor: 'middle', fill: K.line })).join('') +
  `<rect x="366" y="46" width="10" height="14" fill="${K.box}" stroke="${K.warn}" stroke-width="1.2"/>` + T(376, 78, '120 Ω', { size: 8.5, anchor: 'end', fill: K.warn }) + `<rect x="82" y="58" width="10" height="14" fill="${K.box}" stroke="${K.warn}" stroke-width="1.2"/>` + T(100, 80, '120 Ω', { size: 8.5, fill: K.warn }) +
  T(190, 188, 'The master asks one station at a time;', { size: 9.5, anchor: 'middle', fill: K.ink }) + T(190, 202, 'only the station with that address answers.', { size: 9.5, anchor: 'middle', fill: K.ink }),
  'A Modbus RTU network: one master, up to 247 slaves on the same two wires. Each slave has its own station address; the ends of the line carry a 120 Ω resistor.');

export const frame = () => {
  const req = [2, 3, 0x10, 0x00, 0x00, 0x02];
  const c = crc16(req);
  const hex = (b) => b.toString(16).toUpperCase().padStart(2, '0');
  const bytes = [...req, c & 0xFF, c >> 8];
  const rep = [2, 3, 4, 0x01, 0x96, 0x03, 0xE8];
  const c2 = crc16(rep);
  const repB = [...rep, c2 & 0xFF, c2 >> 8];
  const box = (x, w, a, b, col) => R(x, 18, w, 38, { fill: K.box2, stroke: col }) + T(x + w / 2, 35, a, { size: 10.5, anchor: 'middle', weight: 700 }) + T(x + w / 2, 49, b, { size: 8.5, anchor: 'middle', fill: K.line });
  return fig(380, 226,
    box(6, 58, 'Address', '1 byte', K.warn) + box(66, 58, 'Function', '1 byte', K.acc) + box(126, 168, 'Data', 'depends on the function', K.ok) + box(296, 78, 'CRC-16', '2 bytes', K.vio) +
    T(190, 74, 'RTU frame — a pause of 3.5 characters separates frames', { size: 9, anchor: 'middle', fill: K.dim }) +
    T(8, 100, 'Request: read 2 registers from 1000H of station 2', { size: 10, fill: K.ink, weight: 700 }) +
    bytes.map((b, i) => R(8 + i * 44, 108, 40, 26, { fill: K.box, stroke: [K.warn, K.acc, K.ok, K.ok, K.ok, K.ok, K.vio, K.vio][i] }) + T(28 + i * 44, 126, hex(b), { size: 12.5, anchor: 'middle', mono: true, weight: 700 })).join('') +
    ['station 2', 'FC 03', 'start addr', '= 1000H', 'count', '= 2', 'CRC lo', 'CRC hi'].map((n, i) => T(28 + i * 44, 146, n, { size: 7.2, anchor: 'middle', fill: K.dim })).join('') +
    T(8, 172, 'Reply: PV = 0196H = 406 → 40.6 °C, SV = 03E8H = 1000 → 100.0 °C', { size: 10, fill: K.ink, weight: 700 }) +
    repB.map((b, i) => R(8 + i * 38, 180, 34, 24, { fill: K.box, stroke: [K.warn, K.acc, K.dim, K.ok, K.ok, K.ok, K.ok, K.vio, K.vio][i] }) + T(25 + i * 38, 197, hex(b), { size: 11.5, anchor: 'middle', mono: true, weight: 700 })).join('') +
    ['ID', 'FC', 'bytes', 'PV hi', 'PV lo', 'SV hi', 'SV lo', 'CRC', 'CRC'].map((n, i) => T(25 + i * 38, 216, n, { size: 7, anchor: 'middle', fill: K.dim })).join(''),
    'Real frames (the CRC is calculated by the app). The comm log in Monitor shows exactly these bytes for every request and reply.');
};

export const dataAreas = () => fig(380, 214,
  [['Coils', '1 bit · read / write', 'FC 01 read · 05 write one · 15 write many', 'DTB RUN: 0814H · PLC M0: 0800H', K.ok],
   ['Discrete inputs', '1 bit · read only', 'FC 02 read', 'PLC X0: 0400H · Y0: 0500H', K.blue],
   ['Input registers', '16 bit · read only', 'FC 04 read', 'sensor temperature 0000H', K.warn],
   ['Holding registers', '16 bit · read / write', 'FC 03 read · 06 write one · 16 write many', 'VFD 2000H · DTB SV 1001H · PLC D0 1000H', K.acc]]
    .map(([a, b, c, d, col], i) => R(8 + (i % 2) * 186, 10 + Math.floor(i / 2) * 100, 178, 92, { fill: K.box, stroke: col }) +
      T(18 + (i % 2) * 186, 30 + Math.floor(i / 2) * 100, a, { size: 12, weight: 800, fill: col }) + T(18 + (i % 2) * 186, 46 + Math.floor(i / 2) * 100, b, { size: 9.5, fill: K.ink }) +
      T(18 + (i % 2) * 186, 62 + Math.floor(i / 2) * 100, c, { size: 8.2, fill: K.line }) + T(18 + (i % 2) * 186, 84 + Math.floor(i / 2) * 100, d, { size: 8, fill: K.dim })).join(''),
  'The four data areas of Modbus. Which function code you use decides which area is addressed. (Many devices — the lab\'s too — answer FC 03 and FC 04 with the same registers.)');

export const rs485Wiring = () => fig(380, 190,
  [['Master', 14, K.acc], ['Slave A', 140, K.line], ['Slave B', 266, K.line]].map(([n, x, col]) => R(x, 20, 100, 66, { fill: K.box2, stroke: col }) + T(x + 50, 38, n, { size: 10.5, anchor: 'middle', weight: 700 }) +
    ['D+', 'D−', 'SG'].map((t, i) => DOT(x + 12 + i * 38 - 0, 86, i === 0 ? K.acc : i === 1 ? K.blue : K.dim) + T(x + 12 + i * 38, 76, t, { size: 8.5, anchor: 'middle', fill: K.line })).join('')).join('') +
  P('M26 86 V112 H152 V86', { stroke: K.acc, sw: 2 }) + P('M152 86', {}) + P('M152 112 H278 V86', { stroke: K.acc, sw: 2 }) +
  P('M64 86 V124 H190 V86', { stroke: K.blue, sw: 2 }) + P('M190 124 H316 V86', { stroke: K.blue, sw: 2 }) +
  P('M102 86 V136 H228 V86', { stroke: K.dim, sw: 1.4, dash: '3 3' }) + P('M228 136 H354 V86', { stroke: K.dim, sw: 1.4, dash: '3 3' }) +
  T(190, 160, 'daisy chain: each device passes the same pair on to the next', { size: 9.5, anchor: 'middle', fill: K.ink }) + T(190, 175, 'D+ → D+ · D− → D− · SG → SG · no star wiring', { size: 9, anchor: 'middle', fill: K.line }),
  'RS-485 wiring: D+ to D+, D− to D−, signal ground to signal ground. A 120 Ω resistor between D+ and D− belongs at both ends of the line (the lab shows them in the Network view).');

// ---------------------------------------------------------------- PID
export const pidLoop = () => fig(380, 156,
  T(10, 52, 'SV', { size: 12, weight: 800, fill: K.ok }) + T(10, 66, 'set value', { size: 8, fill: K.dim }) + AR(28, 56, 62, 56) +
  `<circle cx="76" cy="56" r="14" fill="${K.box}" stroke="${K.line}" stroke-width="1.4"/>` + T(76, 60, 'Σ', { size: 14, anchor: 'middle' }) + T(66, 46, '+', { size: 11, anchor: 'end', fill: K.ok }) + T(70, 80, '−', { size: 14, anchor: 'middle', fill: K.err }) +
  AR(90, 56, 116, 56) + T(103, 49, 'e', { size: 10, anchor: 'middle', fill: K.dim }) +
  R(116, 28, 86, 56, { fill: K.box2, stroke: K.acc }) + T(159, 46, 'PID', { size: 12.5, anchor: 'middle', weight: 800, fill: K.acc }) + T(159, 60, 'P  I  D', { size: 10, anchor: 'middle', mono: true }) + T(159, 74, 'PB · Ti · Td', { size: 8.5, anchor: 'middle', fill: K.line }) +
  AR(202, 56, 240, 56) + T(221, 48, 'OUT', { size: 8.5, anchor: 'middle', fill: K.dim }) +
  R(242, 28, 76, 56, { fill: K.box }) + T(280, 48, 'Heater', { size: 10.5, anchor: 'middle', weight: 700 }) + T(280, 62, '+ oven', { size: 10.5, anchor: 'middle', weight: 700 }) + T(280, 76, 'process', { size: 8.5, anchor: 'middle', fill: K.line }) +
  AR(318, 56, 366, 56) + T(346, 48, 'PV', { size: 12, anchor: 'middle', weight: 800, fill: K.warn }) +
  P('M340 56 V112 H76 V72', { stroke: K.warn, sw: 1.6 }) + `<path d="M76 74l-4 8h8z" fill="${K.warn}"/>` + T(208, 128, 'thermocouple measures the PV and feeds it back', { size: 9, anchor: 'middle', fill: K.warn }) +
  T(190, 148, 'e = SV − PV: the controller drives the heater until e is zero.', { size: 9.5, anchor: 'middle', fill: K.ink }),
  'A closed control loop: the PID controller compares the measured temperature (PV) with the wanted one (SV) and sets the heater output.');

/** Same control law as the DTB4848 of the lab (oven: 3.2 °C per %, time constant 30 s). */
function simulate(kind, { pb = 80, ti = 30, td = 5, sv = 100, secs = 150, dt = 0.2 } = {}) {
  const amb = 25;
  let pv = amb, integ = 0, last = pv, dF = 0, on = false;
  const pts = [];
  for (let t = 0; t <= secs; t += dt) {
    const e = sv - pv;
    let out;
    if (kind === 'onoff') { if (e > 0.5) on = true; else if (e < -0.5) on = false; out = on ? 100 : 0; }
    else {
      const rate = (pv - last) / dt; last = pv; dF += (rate - dF) * Math.min(1, dt / 1.5);
      if (ti > 0 && Math.abs(e) < pb) integ = Math.max(-pb, Math.min(pb, integ + (e * dt) / ti));
      out = Math.max(0, Math.min(100, (100 / pb) * (e + (kind === 'p' ? 0 : integ) - (kind === 'pid' ? td * dF : 0))));
    }
    pv += dt * (out * 3.2 - (pv - amb)) / 30;
    if (Math.round(t / dt) % 5 === 0) pts.push([t, pv]);
  }
  return pts;
}

export const pidResponse = () => {
  const X = (t) => 44 + t * 2.1, Y = (v) => 168 - (v - 20) * 1.5;
  const path = (pts) => 'M' + pts.map(([t, v]) => `${X(t).toFixed(1)} ${Y(Math.min(v, 118)).toFixed(1)}`).join(' L');
  const curves = [['P only', 'p', K.warn, {}], ['PI', 'pi', K.blue, {}], ['PID', 'pid', K.ok, {}], ['ON/OFF', 'onoff', K.err, {}]];
  return fig(380, 226,
    L(44, 168, 366, 168, { stroke: K.dim }) + L(44, 168, 44, 20, { stroke: K.dim }) + L(44, Y(100), 366, Y(100), { stroke: K.acc, dash: '4 3', sw: 1 }) + T(40, Y(100) + 3, 'SV', { size: 9, anchor: 'end', fill: K.acc, weight: 700 }) +
    curves.map(([n, k, c]) => P(path(simulate(k)), { stroke: c, sw: 1.9, dash: k === 'onoff' ? '3 2' : '' })).join('') +
    [0, 30, 60, 90, 120, 150].map((t) => L(X(t), 168, X(t), 172, { stroke: K.dim }) + T(X(t), 182, String(t), { size: 8.5, anchor: 'middle', fill: K.dim })).join('') + T(366, 196, 'time (s)', { size: 8.5, anchor: 'end', fill: K.dim }) + T(40, 24, '°C', { size: 8.5, anchor: 'end', fill: K.dim }) +
    curves.map(([n, k, c], i) => L(52 + i * 80, 210, 70 + i * 80, 210, { stroke: c, sw: 2.4, dash: k === 'onoff' ? '3 2' : '' }) + T(75 + i * 80, 213.5, n, { size: 9.5, fill: c, weight: 700 })).join(''),
  'Calculated with the same oven model as the lab\'s DTB4848 (SV 100 °C, PB 80 °C, Ti 30 s, Td 5 s): P only stays below the SV (an offset), PI removes the offset, PID gets there sooner, ON/OFF keeps swinging around the SV.');
};

export const ovenSystem = () => fig(380, 170,
  R(8, 30, 96, 100, { fill: K.box }) + T(56, 48, 'Oven', { size: 12, anchor: 'middle', weight: 700 }) + R(24, 60, 64, 20, { fill: '#7c2d12', stroke: K.warn, rx: 4 }) + T(56, 74, 'heater 500 W', { size: 8.5, anchor: 'middle' }) + `<circle cx="56" cy="104" r="6" fill="none" stroke="${K.acc}" stroke-width="1.6"/>` + T(56, 122, 'thermocouple', { size: 8.5, anchor: 'middle', fill: K.acc }) +
  R(144, 30, 96, 100, { fill: K.box2, stroke: K.acc }) + T(192, 48, 'DTB4848', { size: 12, anchor: 'middle', weight: 800 }) + T(192, 62, 'PID controller', { size: 9, anchor: 'middle', fill: K.line }) + R(158, 72, 68, 22, { fill: '#050102', stroke: '#2a2f3a', rx: 3 }) + T(192, 88, '150.0', { size: 13, anchor: 'middle', fill: '#ff3b2f', mono: true, weight: 700 }) + T(192, 120, 'RS-485 · station 2', { size: 8.5, anchor: 'middle', fill: K.dim }) +
  R(278, 30, 94, 100, { fill: K.box2, stroke: K.ok }) + T(325, 48, 'PLC + HMI', { size: 12, anchor: 'middle', weight: 800 }) + T(325, 64, 'MODRW master', { size: 9, anchor: 'middle', fill: K.line }) + T(325, 80, 'recipes, alarms,', { size: 8.5, anchor: 'middle', fill: K.dim }) + T(325, 92, 'trend', { size: 8.5, anchor: 'middle', fill: K.dim }) +
  AR(104, 104, 142, 104, { m: 'mfb', stroke: K.acc }) + T(123, 98, 'PV', { size: 9, anchor: 'middle', fill: K.acc }) + AR(142, 70, 104, 70, { m: 'mfa', stroke: K.warn }) + T(123, 63, 'OUT1', { size: 9, anchor: 'middle', fill: K.warn }) +
  L(240, 80, 278, 80, { stroke: K.acc, sw: 2.4 }) + T(259, 74, 'Modbus', { size: 8.5, anchor: 'middle', fill: K.acc }) + T(190, 156, 'The PLC does not run the PID — it only sets the SV and watches the PV.', { size: 9.5, anchor: 'middle', fill: K.ink }),
  'Temperature control with a Delta DTB controller: the controller regulates the oven by itself; the PLC is the supervisor over Modbus.');

/** The first HMI screen of the manual: a motor panel with the PLC device of every object written next to it. */
export const hmiPanel = () => {
  const s = 0.46, ox = 8, oy = 8;
  const X = (v) => ox + v * s, Y = (v) => oy + v * s;
  const tag = (x, y, t, anchor = 'start') => T(X(x), Y(y), t, { size: 8, fill: K.warn, mono: true, weight: 700, anchor });
  return fig(392, 262,
    R(X(0), Y(0), 800 * s, 480 * s, { fill: '#0b1630', stroke: K.line, rx: 4 }) +
    R(X(12), Y(10), 776 * s, 58 * s, { fill: '#10224a', stroke: '#2b4470' }) + T(X(28), Y(46), 'MOTOR 1', { size: 12, weight: 800 }) +
    R(X(40), Y(96), 230 * s, 80 * s, { fill: '#15803d', stroke: '#22c55e', rx: 6 }) + T(X(155), Y(146), 'START', { size: 12, anchor: 'middle', weight: 800 }) + tag(40, 196, 'M10 · momentary') +
    R(X(40), Y(212), 230 * s, 80 * s, { fill: '#b91c1c', stroke: '#ef4444', rx: 6 }) + T(X(155), Y(262), 'STOP', { size: 12, anchor: 'middle', weight: 800 }) + tag(40, 312, 'M11 · momentary') +
    `<circle cx="${X(400)}" cy="${Y(140)}" r="${44 * s}" fill="#22c55e"/>` + T(X(400), Y(140) + 3, 'RUN', { size: 8.5, anchor: 'middle', weight: 800, fill: '#04121a' }) + tag(400, 206, 'lamp  Y0', 'middle') +
    R(X(480), Y(96), 290 * s, 70 * s, { fill: '#0b1630', stroke: K.line }) + T(X(625), Y(142), '30.00 Hz', { size: 12, anchor: 'middle', weight: 700 }) + tag(480, 186, 'number  D20 · 2 decimals') +
    R(X(480), Y(222), 290 * s, 70 * s, { fill: '#0b1630', stroke: K.acc }) + T(X(625), Y(268), '30.00 Hz', { size: 12, anchor: 'middle', weight: 700, fill: K.acc }) + tag(480, 312, 'input  D10 · 2 decimals') +
    T(X(40), Y(380), 'Every object is linked to a PLC device:', { size: 9.5, fill: K.line }) + T(X(40), Y(410), 'buttons write bits · lamps and numbers read the PLC', { size: 9.5, fill: K.line }),
    'The finished panel of the tutorial. In yellow: the PLC device each object is linked to.');
};

// ---------------------------------------------------------------- motors, machines and fault finding
const term = (x, y, s, c = K.line) => `<circle cx="${x}" cy="${y}" r="10" fill="${K.box2}" stroke="${c}" stroke-width="1.4"/>` + T(x, y + 3.4, s, { size: 8.5, anchor: 'middle', weight: 700 });

/** Terminal box of a 6-terminal motor: link bars for star and for delta. */
export const motorBox = () => {
  const panel = (x, star) => {
    const xs = [x + 35, x + 80, x + 125];
    const links = star ? L(xs[0], 115, xs[2], 115, { stroke: K.ok, sw: 6 }) : xs.map((v) => L(v, 70, v, 115, { stroke: K.ok, sw: 6 })).join('');
    return T(x + 80, 14, star ? 'STAR (Y)' : 'DELTA (Δ)', { size: 12, anchor: 'middle', weight: 800, fill: K.warn }) +
      R(x + 10, 46, 140, 92, { fill: K.box }) +
      ['L1', 'L2', 'L3'].map((l, i) => AR(xs[i], 24, xs[i], 57) + T(xs[i] + 6, 32, l, { size: 9, fill: K.acc, weight: 700 })).join('') + links +
      ['U1', 'V1', 'W1'].map((t, i) => term(xs[i], 70, t)).join('') + ['W2', 'U2', 'V2'].map((t, i) => term(xs[i], 115, t)).join('') +
      T(x + 80, 156, star ? '230 V per winding · ⅓ of the current' : '400 V per winding · full power', { size: 9.5, anchor: 'middle', fill: K.line });
  };
  return fig(380, 166, panel(20, true) + panel(200, false),
    'The terminal box of a 400 V Δ motor. Star: one bar ties W2 U2 V2 together. Delta: three bars join every winding end to the next winding\'s start. A star-delta starter leaves the bars out and does it with two contactors.');
};

/** Power circuit of a reversing starter: KM2 swaps L1 and L3. */
export const reversingPower = () => {
  const xs = [60, 90, 120], ks = [240, 270, 300];
  const tap = [72, 80, 88];
  const out2 = [152, 145, 138];
  return fig(380, 240,
    ['L1', 'L2', 'L3'].map((l, i) => T(xs[i], 12, l, { size: 9.5, anchor: 'middle', fill: K.acc, weight: 700 }) + L(xs[i], 16, xs[i], 100)).join('') +
    R(46, 34, 88, 20, { fill: K.box2 }) + T(90, 48, 'Q1', { size: 10, anchor: 'middle', weight: 700 }) +
    xs.map((x, i) => L(x, tap[i], ks[i], tap[i]) + DOT(x, tap[i]) + L(ks[i], tap[i], ks[i], 100)).join('') +
    R(46, 100, 88, 30, { fill: K.box2, stroke: K.ok }) + T(90, 119, 'KM1 FWD', { size: 10, anchor: 'middle', weight: 800, fill: K.ok }) +
    R(226, 100, 88, 30, { fill: K.box2, stroke: K.warn }) + T(270, 119, 'KM2 REV', { size: 10, anchor: 'middle', weight: 800, fill: K.warn }) +
    xs.map((x) => L(x, 130, x, 162)).join('') +
    ks.map((k, i) => P(`M${k} 130 V${out2[i]} H${xs[2 - i]} V162`, { stroke: i === 1 ? K.line : K.warn })).join('') +
    xs.map((x) => DOT(x, 152 - (x === 60 ? 14 : x === 90 ? 7 : 0))).join('') +
    R(46, 162, 88, 20, { fill: K.box2 }) + T(90, 176, 'F1 overload', { size: 9.5, anchor: 'middle', weight: 700 }) +
    xs.map((x) => L(x, 182, x === 90 ? 90 : x, 198)).join('') + `<circle cx="90" cy="214" r="18" fill="${K.box}" stroke="${K.ink}" stroke-width="1.6"/>` + T(90, 212, 'M', { size: 11, anchor: 'middle', weight: 800 }) + T(90, 224, '3~', { size: 8.5, anchor: 'middle' }) +
    L(60, 198, 78, 202) + L(120, 198, 102, 202) +
    T(166, 186, 'KM1: L1 L2 L3 → U V W  (forward)', { size: 9.5, fill: K.ok }) +
    T(166, 202, 'KM2: L3 L2 L1 → U V W  (reverse)', { size: 9.5, fill: K.warn }) +
    T(166, 218, 'Both closed = L1–L3 short circuit:', { size: 9.5, fill: K.err }) + T(166, 232, 'interlock in the ladder AND with NC 21–22', { size: 9.5, fill: K.err }),
    'Power circuit of the reversing starter: KM2 swaps two phases (L1 ↔ L3), so the rotating field — and the motor — turn the other way.');
};

/** Star-delta timing: contactors and the motor current. */
export const starDeltaTiming = () => {
  const X = (t) => 74 + t * 36;
  const row = (y, label, on, c) => T(8, y + 4, label, { size: 10, weight: 700, fill: c }) + L(X(0), y + 6, X(8), y + 6, { stroke: K.dim, sw: 1 }) +
    on.map(([a, b]) => R(X(a), y - 6, X(b) - X(a), 12, { fill: c, stroke: c, rx: 2 })).join('');
  const I = (t) => (t < 0 ? 0 : t < 5 ? 0.45 + 1.75 * Math.exp(-t / 0.35) : t < 5.2 ? 0 : 0.55 + 1.9 * Math.exp(-(t - 5.2) / 0.25));
  const y0 = 196, k = 9;
  let d = `M${X(0)} ${y0}`;
  for (let t = 0; t <= 8.001; t += 0.05) d += ` L${X(t).toFixed(1)} ${(y0 - I(t) * k).toFixed(1)}`;
  return fig(380, 206,
    row(18, 'START', [[0, 0.25]], K.acc) + row(42, 'KM1', [[0, 8]], K.ok) + row(66, 'KM3 Y', [[0, 5]], K.warn) + row(90, 'KM2 Δ', [[5.2, 8]], K.blue) +
    L(X(5), 8, X(5), y0, { stroke: K.dim, dash: '3 3', sw: 1 }) + T(X(5) - 4, 116, 'T0 = 5 s', { size: 9, anchor: 'end', fill: K.line }) + T(X(5.2) + 4, 116, '0.2 s pause (T1)', { size: 9, fill: K.line }) +
    T(8, 168, 'current', { size: 10, weight: 700 }) + L(X(0), y0 - 6 * k + 0.5, X(8), y0 - 6 * k + 0.5, { stroke: K.err, dash: '4 3', sw: 1 }) + T(X(8), y0 - 6 * k - 4, 'direct on line: 6 × In', { size: 9, anchor: 'end', fill: K.err }) +
    P(d, { stroke: K.acc, sw: 2 }) + L(X(0), y0, X(8), y0, { stroke: K.line, sw: 1 }) +
    T(X(0.6), y0 - 22, 'star: ≈ 2 × In', { size: 9, fill: K.acc }),
    'Star-delta timing: KM1 and KM3 start the motor in star (a third of the current), T0 ends the star time, KM3 opens, and after a short pause KM2 closes the delta.');
};

/** A / B channels of an incremental encoder, forward and reverse. */
export const quadrature = () => {
  const wave = (x, y, shift) => {
    let d = '';
    for (let i = 0; i < 2; i++) { const a = x + shift + i * 64; d += `${i ? '' : `M${x} ${y + 18} H${a}`} V${y} H${a + 32} V${y + 18} H${Math.min(x + 150, a + 64)}`; }
    return P(d, { stroke: K.acc, sw: 1.8 });
  };
  const panel = (x, title, fwd, text) =>
    T(x + 80, 14, title, { size: 11, anchor: 'middle', weight: 800, fill: K.warn }) +
    T(x, 46, 'A', { size: 10, weight: 800 }) + T(x, 92, 'B', { size: 10, weight: 800 }) +
    wave(x + 12, 32, fwd ? 8 : 24) + wave(x + 12, 78, fwd ? 24 : 8) +
    L(x + 20 + (fwd ? 8 : 24), 28, x + 20 + (fwd ? 8 : 24), 100, { stroke: K.dim, dash: '2 3', sw: 1 }) +
    T(x + 80, 122, text, { size: 9.5, anchor: 'middle', fill: fwd ? K.ok : K.err });
  return fig(380, 134, panel(14, 'FORWARD', true, 'A leads B by 90° → C251 counts up') + panel(204, 'REVERSE', false, 'B leads A → C251 counts down'),
    'The two channels of an incremental encoder are a quarter of a pulse apart. Which one comes first tells the direction; the number of pulses tells how far it turned.');
};

/** The SFC of A+ B+ B− A− (step S21 active). */
export const sfcChart = () => {
  const steps = [['S0', 'READY', 'OUT Y2  READY lamp'], ['S20', 'A+', 'SET Y0  valve A'], ['S21', 'B+', 'SET Y1  valve B'], ['S22', 'B−', 'RST Y1'], ['S23', 'A−', 'RST Y0  · count C0']];
  const conds = ['X0 · X1 · X3   START, A and B back', 'X2   A out', 'X4   B out', 'X3   B back', 'X1   A back'];
  let s = '';
  steps.forEach(([n, name, act], i) => {
    const y = 10 + i * 58, on = n === 'S21';
    s += R(60, y, 92, 28, { fill: on ? '#14532d' : K.box, stroke: on ? K.ok : K.line, sw: 1.6 }) + (i === 0 ? R(64, y + 4, 84, 20, { fill: 'none', stroke: K.line, rx: 4 }) : '') +
      T(72, y + 18, n, { size: 11, weight: 800, fill: on ? '#bbf7d0' : K.ink, mono: true }) + T(144, y + 18, name, { size: 10, weight: 700, anchor: 'end', fill: on ? '#bbf7d0' : K.blue }) +
      L(152, y + 14, 172, y + 14) + R(172, y + 4, 168, 20, { fill: on ? '#0f2a1c' : K.box, stroke: on ? K.ok : K.dim, rx: 4 }) + T(180, y + 18, act, { size: 9.5, mono: true, fill: on ? '#bbf7d0' : K.ink });
    const ty = y + 44;
    s += L(106, y + 28, 106, i < 4 ? y + 58 : ty + 8) + L(94, ty, 118, ty, { stroke: on ? K.warn : K.ink, sw: 3.5 }) + T(126, ty + 4, conds[i], { size: 9.5, fill: on ? K.warn : K.line, mono: true });
  });
  s += P('M106 286 V296 H34 V4 H106 V10', { stroke: K.line }) + `<path d="M101 3 L106 10 L111 3 Z" fill="${K.line}"/>`;
  return fig(360, 304, s,
    'The SFC of the pneumatic example: a step (box) does its action while it is active; the transition under it (bar) moves on to the next step when its condition is true. The active step is green — like the live SFC view in the Ladder tab.');
};

/** Fault finding with the voltmeter: measure along the circuit against 0 V. */
export const voltageHunt = () => {
  const red = (x, y, v) => `<circle cx="${x}" cy="${y}" r="4.5" fill="${K.err}"/>` + R(x - 24, y - 34, 48, 18, { fill: '#b7c8a4', stroke: '#3f4a35', rx: 3 }) + T(x, y - 21, v, { size: 10, anchor: 'middle', weight: 800, fill: '#111', mono: true });
  return fig(380, 176,
    R(12, 56, 54, 84, { fill: K.box2 }) + T(39, 76, 'PSU', { size: 10, anchor: 'middle', weight: 800 }) + T(39, 96, '+V1', { size: 9, anchor: 'middle', fill: K.err }) + T(39, 132, '−V1', { size: 9, anchor: 'middle', fill: K.blue }) +
    L(66, 92, 128, 92, { stroke: K.err }) +
    L(128, 92, 140, 92) + L(160, 92, 172, 92) + L(140, 80, 140, 104, { sw: 2 }) + L(160, 80, 160, 104, { sw: 2 }) + L(136, 106, 164, 78) + T(150, 122, 'STOP 11–12', { size: 9, anchor: 'middle', fill: K.line }) +
    L(172, 92, 212, 92, { stroke: K.err }) + L(232, 92, 268, 92, { stroke: K.err }) + T(222, 96, '✕', { size: 13, anchor: 'middle', weight: 800, fill: K.err }) + T(222, 118, 'broken', { size: 8.5, anchor: 'middle', fill: K.err }) +
    R(268, 60, 92, 84, { fill: K.box2 }) + T(314, 80, 'PLC', { size: 10, anchor: 'middle', weight: 800 }) + T(280, 96, 'X2', { size: 9.5, fill: K.acc, weight: 700 }) + T(280, 132, 'S/S', { size: 9.5, fill: K.acc, weight: 700 }) +
    L(66, 128, 268, 128, { stroke: K.blue }) + `<circle cx="120" cy="128" r="4.5" fill="#111" stroke="${K.ink}"/>` + T(120, 146, 'COM (black) on −V1', { size: 9, anchor: 'middle', fill: K.line }) +
    red(100, 92, '24.0') + red(186, 92, '24.0') + red(262, 92, '0.0') +
    T(190, 168, '24 V → 24 V → 0 V: the break is between the last 24 V and the first 0 V.', { size: 9.5, anchor: 'middle', fill: K.warn }),
    'Hunting a broken wire with the voltmeter: leave the black probe on 0 V and walk the red probe along the circuit, from the supply to the input.');
};

/** Two-float level control: the level swings between the floats. */
export const tankHysteresis = () => {
  const X = (t) => 50 + t * 3, LH = 44, LL = 112;
  const d = `M${X(0)} 124 L${X(22)} ${LH} L${X(52)} ${LL} L${X(62)} ${LH} L${X(92)} ${LL} L${X(100)} ${LL - 22}`;
  return fig(380, 170,
    L(X(0), LH, X(100), LH, { stroke: K.warn, dash: '4 3', sw: 1 }) + T(X(100) + 4, LH + 4, 'LH', { size: 9.5, fill: K.warn, weight: 700 }) +
    L(X(0), LL, X(100), LL, { stroke: K.warn, dash: '4 3', sw: 1 }) + T(X(100) + 4, LL + 4, 'LL', { size: 9.5, fill: K.warn, weight: 700 }) +
    T(10, 30, 'level', { size: 10, weight: 700 }) + P(d, { stroke: K.acc, sw: 2.2 }) +
    T(10, 154, 'pump', { size: 10, weight: 700 }) + L(X(0), 156, X(100), 156, { stroke: K.dim, sw: 1 }) +
    [[0, 22], [52, 62], [92, 100]].map(([a, b]) => R(X(a), 144, X(b) - X(a), 12, { fill: K.ok, stroke: K.ok, rx: 2 })).join('') +
    T(X(30), 104, 'water is used', { size: 9, anchor: 'middle', fill: K.line }) + T(X(3), 64, 'fill', { size: 9, fill: K.line }),
    'Two floats give a hysteresis: the pump starts when the level falls below LL and runs until the level reaches LH — it does not switch on and off at one level all the time.');
};

/** The sorting conveyor seen from above: sensors, pusher and chute. */
export const conveyorTop = () => {
  const x = (f) => 30 + f * 320;
  const eye = (f, n, xa, dx = 0) => L(x(f), 58, x(f), 102, { stroke: K.err, dash: '3 2', sw: 1.2 }) + `<path d="M${x(f) - 5} 50 h10 l-5 8z" fill="${K.err}"/>` + T(x(f) + dx, 120, n, { size: 9.5, anchor: 'middle', weight: 800 }) + T(x(f) + dx, 132, xa, { size: 8.5, anchor: 'middle', fill: K.acc, mono: true });
  const box = (f, metal) => R(x(f) - 9, 70, 18, 20, { fill: metal ? '#94a3b8' : '#2563eb', stroke: metal ? '#e2e8f0' : '#93c5fd', rx: 2 });
  return fig(380, 142,
    R(20, 60, 340, 40, { fill: '#1e293b', stroke: K.line, rx: 6 }) + `<circle cx="28" cy="80" r="6" fill="${K.box2}" stroke="${K.line}"/><circle cx="352" cy="80" r="6" fill="${K.box2}" stroke="${K.line}"/>` +
    AR(150, 112, 200, 112) +
    box(0.18, false) + box(0.4, true) + box(0.63, false) +
    eye(0.1, 'S1', 'X0') + eye(0.6, 'S3', 'X2', -8) + eye(0.94, 'S4', 'X3') +
    `<circle cx="${x(0.4)}" cy="80" r="13" fill="none" stroke="${K.vio}" stroke-width="2"/>` + T(x(0.4), 52, 'S2 metal', { size: 9, anchor: 'middle', weight: 800, fill: K.vio }) + T(x(0.4), 132, 'X1', { size: 8.5, anchor: 'middle', fill: K.acc, mono: true }) +
    R(x(0.64) - 4, 102, 20, 22, { fill: K.box2, stroke: K.warn }) + T(x(0.64) + 20, 118, 'pusher Y0', { size: 9, fill: K.warn, weight: 700 }) +
    R(x(0.64) - 20, 22, 40, 36, { fill: '#0b1226', stroke: K.warn, dash: '3 3' }) + T(x(0.64), 18, 'reject chute', { size: 9, anchor: 'middle', fill: K.warn }) +
    T(20, 40, 'feeder', { size: 9, fill: K.line }) + T(360, 40, 'end bin', { size: 9, anchor: 'end', fill: K.line }),
    'The sorting conveyor from above. S2 (inductive) sees only metal; the PLC remembers the metal box until it reaches S3, then the pusher kicks it into the chute. Plastic boxes ride on to S4.');
};
