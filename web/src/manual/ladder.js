// Ladder diagrams for the manual, drawn from a tiny description — never from a picture:
//   ladder([{ note: 'Self-holding', net: [par(['X0|START'], ['Y0']), '/X1|STOP'], out: 'OUT Y0' }], 'caption', { on: { X0: 1 } })
// A network is a series of cells; par([...], [...]) puts chains in parallel. Cell text:  X0  /X1  ^X0  D0>K10  (|label after a bar).
// Outputs: 'OUT Y0', 'SET M0', 'RST M0', 'TMR T0 K50', 'MOV K10 D0', 'MODRW K1 K3 H1000 D30 K2' …  Several outputs → out: [a, b].
// With `on` (device → 1 / 0) the picture shows the power flow in green, like the Ladder tab in monitor mode.
import { K, T, R, L, P, DOT, fig } from './art.js';

export const par = (...chains) => ({ par: chains });

const CW = 58, RH = 54;
const parse = (c) => {
  if (typeof c !== 'string') return c;
  const [t, label = ''] = c.split('|');
  return { t: t.trim(), label };
};
const isCmp = (t) => /[<>=]/.test(t);

function conducts(c, on) {
  const t = c.t;
  if (t in on) return !!on[t];
  if (t[0] === '/') return !on[t.slice(1)];
  return !!on[t];
}

const wire = (x1, x2, y, lit) => L(x1, y, x2, y, { stroke: lit ? K.ok : K.line, sw: lit ? 2 : 1.6 });

/** One cell (contact or compare) in a box [x, x+w]; returns {svg, w, out}. */
function cell(c, x, y, lit, on) {
  const el = parse(c);
  const t = el.t;
  const cond = lit && conducts(el, on);
  const col = cond ? K.ok : K.ink;
  if (isCmp(t)) {
    const w = 74;
    return { w, out: cond, svg: wire(x, x + 10, y, lit) + R(x + 10, y - 11, w - 20, 22, { fill: cond ? '#0e3a22' : K.box2, stroke: cond ? K.ok : K.acc, rx: 4 }) + T(x + w / 2, y + 3.5, t, { size: 8.8, anchor: 'middle', fill: col, weight: 700, mono: true }) + wire(x + w - 10, x + w, y, cond) + (el.label ? T(x + w / 2, y + 24, el.label, { size: 8, anchor: 'middle', fill: K.dim }) : '') };
  }
  const nc = t[0] === '/', edge = t[0] === '^';
  const name = nc || edge ? t.slice(1) : t;
  const w = CW;
  const cx = x + w / 2;
  const bars = L(cx - 6, y - 10, cx - 6, y + 10, { stroke: col, sw: 2 }) + L(cx + 6, y - 10, cx + 6, y + 10, { stroke: col, sw: 2 });
  const sym = nc ? L(cx - 10, y + 10, cx + 10, y - 10, { stroke: col }) : edge ? P(`M${cx} ${y + 6} V${y - 6} M${cx - 3} ${y - 3} L${cx} ${y - 7} L${cx + 3} ${y - 3}`, { stroke: col, sw: 1.3 }) : '';
  return { w, out: cond, svg: wire(x, cx - 6, y, lit) + wire(cx + 6, x + w, y, cond) + bars + sym + T(cx, y - 15, name, { size: 10, anchor: 'middle', fill: cond ? K.ok : K.acc, weight: 700 }) + (el.label ? T(cx, y + 25, el.label, { size: 8, anchor: 'middle', fill: K.dim }) : '') };
}

/** Width, height (rows) and drawing of a series list. */
function series(items, x, y, lit, on) {
  let cx = x, p = lit, svg = '', h = 1, w = 0;
  for (const it of items) {
    const r = it.par ? parallel(it.par, cx, y, p, on) : cell(it, cx, y, p, on);
    svg += r.svg; cx += r.w; p = r.out; h = Math.max(h, r.h || 1);
  }
  w = cx - x;
  return { svg, w, h, out: p };
}

function parallel(chains, x, y, lit, on) {
  const parts = [];
  let yy = y, total = 0, any = false;
  for (const ch of chains) { const items = Array.isArray(ch) ? ch : [ch]; parts.push({ items, y: yy }); const m = series(items, 0, 0, false, on); yy += m.h * RH; total += m.h; }
  const W = Math.max(...parts.map((pt) => series(pt.items, 0, 0, false, on).w));
  let svg = '', outs = [];
  parts.forEach((pt, i) => {
    const r = series(pt.items, x + 12, pt.y, lit, on);
    // pad the shorter chains to the right edge
    svg += wire(x, x + 12, pt.y, lit) + r.svg + wire(x + 12 + r.w, x + W + 24, pt.y, r.out);
    outs.push(r.out); if (r.out) any = true;
  });
  const lastY = parts[parts.length - 1].y;
  svg += L(x, y, x, lastY, { stroke: lit ? K.ok : K.line }) + L(x + W + 24, y, x + W + 24, lastY, { stroke: any ? K.ok : K.line }) + DOT(x, y, lit ? K.ok : K.line) + DOT(x + W + 24, y, any ? K.ok : K.line);
  return { svg, w: W + 24, h: total, out: any };
}

const COILS = { OUT: '', SET: 'S', RST: 'R', PLS: 'P', PLF: 'F' };
function output(text, x, y, lit) {
  const parts = text.trim().split(/\s+/);
  const ins = parts[0];
  if (ins in COILS) {
    const w = 56;
    const c = lit ? K.ok : K.ink;
    return { w, svg: wire(x, x + 16, y, lit) + P(`M${x + 21} ${y - 10} a10 10 0 0 0 0 20`, { stroke: c, sw: 2 }) + P(`M${x + 35} ${y - 10} a10 10 0 0 1 0 20`, { stroke: c, sw: 2 }) +
      (COILS[ins] ? T(x + 28, y + 3.6, COILS[ins], { size: 10, anchor: 'middle', weight: 800, fill: c }) : '') + wire(x + 40, x + w, y, lit) + T(x + 28, y - 15, parts[1], { size: 10, anchor: 'middle', fill: lit ? K.ok : K.acc, weight: 700 }) };
  }
  // instruction box: name on the first line, operands below (wrapped)
  const ops = parts.slice(1);
  const lines = [];
  let cur = '';
  for (const o of ops) { if ((cur + ' ' + o).trim().length > 14) { lines.push(cur.trim()); cur = o; } else cur += ' ' + o; }
  if (cur.trim()) lines.push(cur.trim());
  const w = 112, hh = 14 + lines.length * 11 + 6;
  return { w, svg: wire(x, x + 8, y, lit) + R(x + 8, y - 12, w - 8, hh, { fill: lit ? '#0e3a22' : K.box2, stroke: lit ? K.ok : K.warn, rx: 4 }) +
    T(x + 14, y - 1, ins, { size: 9.5, fill: lit ? K.ok : K.warn, weight: 800 }) + lines.map((l, i) => T(x + 14, y + 10 + i * 11, l, { size: 8.3, fill: K.ink, mono: true })).join(''), h: Math.ceil(hh / RH) };
}

/** networks: [{ note, net: [cells], out }]; opts.on = { X0: 1 } (power-flow view). */
export function ladder(networks, caption, opts = {}) {
  const on = opts.on || null;
  const lit0 = !!on;
  const x0 = 34;
  // pass 1: widths
  const plan = networks.map((n) => {
    const net = n.net || [];
    const m = series(net, x0, 0, false, on || {});
    const outs = n.out === undefined ? [] : Array.isArray(n.out) ? n.out : [n.out];
    return { n, net, outs, w: x0 + m.w + (outs.length ? 14 + 124 : 0), h: m.h };
  });
  const railX = Math.max(...plan.map((p) => p.w)) + 10;
  let y0 = 6, inner = '';
  const perLine = Math.max(30, Math.floor((railX - 12) / 5.6));
  const wrap = (txt) => { const out = []; let cur = ''; for (const w of String(txt).split(' ')) { if ((cur + ' ' + w).trim().length > perLine) { out.push(cur.trim()); cur = w; } else cur += ' ' + w; } if (cur.trim()) out.push(cur.trim()); return out; };
  plan.forEach(({ n, net, outs, h }, i) => {
    const noteLines = n.note ? wrap(n.note) : [];
    const y = y0 + (noteLines.length ? 4 + noteLines.length * 12 : 0) + 22;
    const rr = series(net, x0, y, lit0, on || {});
    const powered = rr.out;
    let svg = wire(14, x0, y, lit0) + rr.svg;
    const ox = x0 + rr.w;
    let lastY = y;
    if (outs.length) {
      const lit = lit0 && powered;
      outs.forEach((o, k) => {
        const oy = y + k * 48;
        const ob = output(o, ox + 14, oy, lit);
        svg += wire(ox, ox + 14, oy, lit) + ob.svg + wire(ox + 14 + ob.w, railX, oy, lit);
        lastY = oy;
      });
      if (outs.length > 1) svg += L(ox, y, ox, lastY, { stroke: lit ? K.ok : K.line }) + L(railX - 12, y, railX - 12, lastY, { stroke: lit ? K.ok : K.line });
    } else svg += wire(ox, railX, y, powered);
    const bottom = Math.max(y + (h - 1) * RH, lastY) + 26;
    inner += L(14, y - 20, 14, bottom, { sw: 3, stroke: K.line }) + L(railX, y - 20, railX, bottom, { sw: 3, stroke: K.line }) + T(2, y + 3.5, String(i + 1), { size: 9, fill: K.dim }) + noteLines.map((l, k) => T(22, y0 + 10 + k * 12, l, { size: 9.5, fill: K.line })).join('') + svg;
    y0 = bottom + 8;
  });
  return fig(Math.max(380, railX + 10), y0 + 2, inner, caption);
}
