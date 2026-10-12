// The connection sheet of a communication cable: both connectors drawn with their pins, the wires
// between them (RS-232 crosses TX and RX, RS-485 joins D+ to D+ and D− to D−), the settings both
// ends must agree on, and the rules of the bus.
import { h, Sheet } from '../../ui/widgets.js';
import { icon } from '../../ui/icons.js';
import { findPort, busName } from '../devices/defs.js';
import { pinsOf, cableWires, stationInfo, netName, BUS_FACTS } from './comm-info.js';
import { BUS_COLOR } from './schematic.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent = null, text = null) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  if (text !== null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
};

/** A small picture of the connector face. */
function face(g, kind, x, y, color, n = 3) {
  if (kind === 'rj45') {
    el('rect', { x, y, width: 46, height: 30, rx: 4, fill: '#0f172a', stroke: '#475569' }, g);
    el('rect', { x: x + 16, y: y + 24, width: 14, height: 6, fill: '#1e293b' }, g);
    for (let i = 0; i < 8; i++) el('rect', { x: x + 6 + i * 4.6, y: y + 5, width: 2.4, height: 9, fill: i === 2 || i === 3 || i === 4 || i === 6 ? '#fbbf24' : '#a1863a' }, g);
  } else if (kind === 'db9') {
    el('path', { d: `M${x} ${y} h48 l-5 24 h-38 z`, fill: '#0f172a', stroke: '#94a3b8' }, g);
    for (let i = 0; i < 5; i++) el('circle', { cx: x + 8 + i * 8, cy: y + 8, r: 2.2, fill: [1, 2, 4].includes(i) ? color : '#475569' }, g);
    for (let i = 0; i < 4; i++) el('circle', { cx: x + 12 + i * 8, cy: y + 17, r: 2.2, fill: '#475569' }, g);
  } else if (kind === 'minidin') {
    el('circle', { cx: x + 22, cy: y + 15, r: 15, fill: '#0f172a', stroke: '#94a3b8' }, g);
    const P = [[-7, -2], [7, -2], [-9, 5], [-3, 6], [3, 6], [9, 5], [0, -7], [0, 1]];
    P.forEach(([dx, dy], i) => el('circle', { cx: x + 22 + dx, cy: y + 15 + dy, r: 1.8, fill: [3, 4, 7].includes(i) ? color : '#475569' }, g));
  } else if (kind === 'usb') {
    el('rect', { x, y: y + 6, width: 44, height: 18, rx: 3, fill: '#0f172a', stroke: '#94a3b8' }, g);
    for (let i = 0; i < 4; i++) el('rect', { x: x + 7 + i * 9, y: y + 11, width: 5, height: 8, fill: color }, g);
  } else {
    el('rect', { x, y: y + 2, width: 46, height: 26, rx: 4, fill: '#1f8a4c', stroke: '#14532d' }, g);
    const x0 = x + 23 - ((n - 1) * 14) / 2;
    for (let i = 0; i < n; i++) { el('circle', { cx: x0 + i * 14, cy: y + 15, r: 5, fill: '#cbd5e1' }, g); el('line', { x1: x0 - 3 + i * 14, y1: y + 15, x2: x0 + 3 + i * 14, y2: y + 15, stroke: '#475569', 'stroke-width': 1.4 }, g); }
  }
}

/** Both connectors with their pins and the wires of the cable. */
function wiringSvg(A, B, wires, bus) {
  const color = BUS_COLOR[bus] || '#94a3b8';
  const rows = Math.max(A.pins.length, B.pins.length);
  const W = 340, rowH = 26, top = 70, H = top + rows * rowH + 14;
  const svg = el('svg', { class: 'cs-svg', viewBox: `0 0 ${W} ${H}`, width: '100%' });
  const col = (side) => (side === 'a' ? { x: 8, w: 118 } : { x: W - 126, w: 118 });
  const pinY = (i) => top + i * rowH + rowH / 2;
  for (const [side, C] of [['a', A], ['b', B]]) {
    const { x, w } = col(side);
    el('text', { x: x + w / 2, y: 14, class: 'cs-h' }, svg, C.devName);
    el('text', { x: x + w / 2, y: 27, class: 'cs-s' }, svg, C.title);
    face(svg, C.face, x + w / 2 - 23, 34, color, C.pins.length);
    el('rect', { x, y: top - 4, width: w, height: C.pins.length * rowH + 8, rx: 8, class: 'cs-box' }, svg);
    C.pins.forEach((p, i) => {
      const y = pinY(i);
      const used = wires.some((wr) => wr[side] === p);
      el('text', { x: side === 'a' ? x + 10 : x + w - 10, y: y + 4, class: 'cs-pin' + (used ? '' : ' off'), 'text-anchor': side === 'a' ? 'start' : 'end' }, svg, p.pin);
      el('text', { x: side === 'a' ? x + w - 10 : x + 10, y: y + 4, class: 'cs-sig' + (used ? '' : ' off'), 'text-anchor': side === 'a' ? 'end' : 'start' }, svg, p.sig || p.pin);
    });
  }
  // the wires
  for (const wr of wires) {
    const ia = A.pins.indexOf(wr.a), ib = B.pins.indexOf(wr.b);
    const x0 = col('a').x + col('a').w, x1 = col('b').x, y0 = pinY(ia), y1 = pinY(ib);
    el('path', { d: `M${x0} ${y0} C${x0 + 40} ${y0} ${x1 - 40} ${y1} ${x1} ${y1}`, stroke: '#020617', 'stroke-width': 5.5, fill: 'none' }, svg);
    el('path', { d: `M${x0} ${y0} C${x0 + 40} ${y0} ${x1 - 40} ${y1} ${x1} ${y1}`, stroke: wr.color, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }, svg);
    for (const [x, y] of [[x0, y0], [x1, y1]]) el('circle', { cx: x, cy: y, r: 3.2, fill: wr.color, stroke: '#020617' }, svg);
  }
  return svg;
}

export function openCommSheet(lab, conn) {
  const P = lab.project, sys = lab.sys;
  const da = P.devices.find((d) => d.id === conn.a.dev), db = P.devices.find((d) => d.id === conn.b.dev);
  const pa = findPort(da, conn.a.port);
  if (!da || !db || !pa) return;
  const bus = pa.bus;
  const A = { ...pinsOf(da, conn.a.port), devName: netName(P, da) };
  const B = { ...pinsOf(db, conn.b.port), devName: netName(P, db) };
  const wires = cableWires(A, B);
  const content = h('div', { class: 'cs' });
  content.appendChild(h('div', { class: 'cs-top' }, h('span', { class: `nw-bus ${bus}`, style: { background: BUS_COLOR[bus] } }, busName(bus)),
    h('b', {}, `${netName(P, da)} ${conn.a.port} ↔ ${netName(P, db)} ${conn.b.port}`)));
  content.appendChild(wiringSvg(A, B, wires, bus));
  for (const n of [A.note, B.note].filter(Boolean)) content.appendChild(h('p', { class: 'muted small' }, n));
  content.appendChild(h('p', { class: 'muted small' }, 'Pin numbers as in the Delta manuals — check the manual of your exact model before you make a real cable.'));
  // what both ends are set to
  if (bus === 'rs485') {
    const rows = [[da, conn.a.port], [db, conn.b.port]].map(([d]) => {
      const s = stationInfo(P, d, sys);
      return h('div', { class: 'cs-row' }, h('span', {}, netName(P, d)), h('b', {}, s.master ? 'master' : s.station ? `ID ${s.station}` : '—'), h('code', {}, s.fmt || '—'), h('small', {}, s.where));
    });
    content.appendChild(h('div', { class: 'cs-set' }, h('div', { class: 'cs-set-h' }, 'Station address · serial format · set in'), ...rows));
  }
  if (bus === 'rs232') content.appendChild(h('p', { class: 'cs-note' }, 'TX of one side is wired to RX of the other: the cable is crossed (a "null-modem" cable). The DOP HMI and the DVP PLC both use 9600 bps, 7 data bits, even parity, 1 stop bit, Modbus ASCII.'));
  content.appendChild(h('ul', { class: 'cs-facts' }, ...(BUS_FACTS[bus] || []).map((t) => h('li', {}, t))));
  content.appendChild(h('div', { class: 'props-actions' },
    h('button', { class: 'btn btn-ghost', html: `${icon('network', 16)}<span>Network tab</span>`, onclick: () => { sheet.close(); lab.views.monitor.setSub('network'); } }),
    h('button', { class: 'btn btn-primary', onclick: () => sheet.close() }, 'OK')));
  const sheet = new Sheet({ title: `${busName(bus)} cable`, content, icon: 'plug', cls: 'sheet-tall' });
  sheet.open();
}
