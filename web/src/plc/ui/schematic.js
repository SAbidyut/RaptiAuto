// 2D wiring schematic of the PLC lab — a lighter alternative to the 3D scene with the same API
// (picking, markers, selection, focus, live states). Devices are drawn as terminal-block symbols in
// rows like the panel (rail 1, rail 2, operator console); every wire is routed orthogonally through
// the "wire ducts" between the rows and the gaps between devices, each on its own track.
import { DEVICE_DEFS, devicePorts, deviceProps, busName, hasLabel } from '../devices/defs.js';
import { boxInSelection, polylineInSelection } from '../../ui/gestures.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const P = 28;           // terminal pitch
const COMM_W = 50;      // width of a communication connector slot
const SIDE = 14;        // block padding left / right
const TRACK = 7;        // distance between parallel wires
const CH_MIN = 44;      // minimum height of a wire duct
const GAP_MIN = 34;     // minimum gap between devices
const MARGIN = 26;      // band margin left / right
const CONSOLE_PER_ROW = 8;

const CAT_COLOR = { plc: '#3b82f6', hmi: '#06b6d4', vfd: '#a855f7', power: '#f59e0b', field: '#22c55e', sensor: '#14b8a6', switchgear: '#f43f5e', motor: '#94a3b8', pc: '#64748b', modbus: '#c084fc' };
// the same colours as the 3D Network view: RS-485 violet, RS-232 amber, USB sky blue
export const BUS_COLOR = { rs232: '#f59e0b', rs485: '#a78bfa', usb: '#38bdf8' };
const LAMP = { green: '#22e06a', red: '#ff3434', yellow: '#ffb020', blue: '#3b8bff', white: '#f4f7ff' };
const CAP = { green: '#1fa34a', red: '#d62828', yellow: '#f2b705', blue: '#1f5fd6', black: '#2a2d33', white: '#e9ecef' };

const el = (tag, attrs = {}, parent = null, text = null) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  if (text !== null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
};
/** Set an attribute only when it changed. */
const set = (e, k, v) => { const c = e._v || (e._v = {}); if (c[k] === v) return false; c[k] = v; e.setAttribute(k, v); return true; };
const shortLabel = (port) => (port.kind === 'comm' ? (port.id === 'RS485' ? 'RS-485' : port.id) : port.label);

// ====================================================================== symbols
/** Which edge of the block a terminal sits on. */
function edgeOf(def, port) {
  if (['console', 'motor', 'hmi', 'desk'].includes(def.zone)) return 'top';
  if (def.sim === 'mcb') return 'bottom';
  if (def.sim === 'plc') return port.kind === 'comm' || port.pos[1] < def.size[1] / 2 ? 'bottom' : 'top';
  if (def.sim === 'vfd') return port.pos[1] > 40 ? 'top' : 'bottom';
  return port.pos[1] > def.size[1] / 2 ? 'top' : 'bottom';
}

const BODY_H = { plc: 196, mcb: 128, psu: 118, vfd: 214, hmi: 196, laptop: 178, motor: 156, contactor: 150, olr: 140, relay: 130, cb: 128, tb: 112, tc: 150, mbth: 132, meter: 132 };

function symbolFor(dev) {
  const def = DEVICE_DEFS[dev.type];
  const ports = devicePorts(dev);
  const top = [], bottom = [];
  for (const p of ports) (edgeOf(def, p) === 'top' ? top : bottom).push(p);
  const order = (a, b) => (a.kind === 'comm') - (b.kind === 'comm') || b.pos[1] - a.pos[1] || a.pos[0] - b.pos[0];
  // PLC: COM1 / USB (front) first, then the bottom terminals left → right as printed (COM2 on D+ D− SG)
  const plcKey = (p) => (p.id === 'COM1' ? -1e4 : p.id === 'USB' ? -9e3 : p.pos[0]);
  top.sort(order); bottom.sort(def.sim === 'plc' ? (a, b) => plcKey(a) - plcKey(b) : order);
  const slotW = (p) => (p.kind === 'comm' ? COMM_W : P);
  const rowW = (row) => row.reduce((s, p) => s + slotW(p), 0);
  const minW = { plc: 300, vfd: 220, hmi: 230, laptop: 180, motor: 150, mcb: 110, psu: 130, tc: 130, mbth: 124, meter: 116 }[def.sim] || 104;
  const w = Math.max(minW, rowW(top) + SIDE * 2, rowW(bottom) + SIDE * 2);
  const h = BODY_H[def.sim] || 118;
  const slots = new Map();
  const place = (row, y, edge) => {
    let x = (w - rowW(row)) / 2;
    for (const p of row) { slots.set(p.id, { x: x + slotW(p) / 2, y, edge, port: p, w: slotW(p) }); x += slotW(p); }
  };
  place(top, 0, 'top');
  place(bottom, h, 'bottom');
  return { dev, def, w, h, top, bottom, slots };
}

// ====================================================================== layout + routing
function bandsFor(devices) {
  const rail1 = [], rail2 = [], desk = [], hmi = [], consoleDevs = [], motors = [];
  const ORDER = { mcb: 0, power: 1, plc: 2 };
  for (const d of devices) {
    const def = DEVICE_DEFS[d.type];
    if (!def) continue;
    ({ rail1, rail2, desk, hmi, console: consoleDevs, motor: motors }[def.zone] || rail1).push(d);
  }
  rail1.sort((a, b) => (ORDER[a.type === 'mcb' ? 'mcb' : DEVICE_DEFS[a.type].category] ?? 3) - (ORDER[b.type === 'mcb' ? 'mcb' : DEVICE_DEFS[b.type].category] ?? 3));
  const bands = [];
  if (rail1.length) bands.push({ zone: 'rail1', devs: rail1 });
  const mid = [...desk, ...hmi, ...rail2];
  if (mid.length) bands.push({ zone: 'rail2', devs: mid });
  for (let i = 0; i < consoleDevs.length || (i === 0 && motors.length); i += CONSOLE_PER_ROW) {
    const row = consoleDevs.slice(i, i + CONSOLE_PER_ROW);
    if (i === 0) row.push(...motors);
    bands.push({ zone: 'console', devs: row });
  }
  return bands;
}

/**
 * Lay the devices out and route every connection. Returns
 * { syms: Map(id → {sym, x, y, band}), wires: Map(connId → points), ducts: [{y0,y1,x0,x1}], box }.
 */
export function layoutSchematic(project) {
  const bands = bandsFor(project.devices).map((b) => ({ ...b, syms: b.devs.map(symbolFor) }));
  const nb = bands.length;
  const where = new Map();
  bands.forEach((b, bi) => b.syms.forEach((s, i) => where.set(s.dev.id, { band: bi, idx: i, sym: s })));
  const conns = project.conns.filter((c) => where.has(c.a.dev) && where.has(c.b.dev) && where.get(c.a.dev).sym.slots.has(c.a.port) && where.get(c.b.dev).sym.slots.has(c.b.port));
  let chH = new Array(nb + 1).fill(CH_MIN);
  let gapW = bands.map((b) => new Array(b.syms.length + 1).fill(0).map((_, g) => (g === 0 || g === b.syms.length ? MARGIN : GAP_MIN)));
  let geo, plan;

  const placeAll = () => {
    const pos = new Map();
    const bandY = [];
    let y = chH[0];
    bands.forEach((b, bi) => {
      const bh = Math.max(...b.syms.map((s) => s.h));
      const total = gapW[bi].reduce((a, v) => a + v, 0) + b.syms.reduce((a, s) => a + s.w, 0);
      let x = -total / 2 + gapW[bi][0];
      const gaps = [];
      gaps.push({ x0: x - gapW[bi][0], x1: x });
      b.syms.forEach((s, i) => {
        pos.set(s.dev.id, { x, y: y + (bh - s.h) / 2, sym: s, band: bi });
        x += s.w;
        gaps.push({ x0: x, x1: x + gapW[bi][i + 1] });
        x += gapW[bi][i + 1];
      });
      bandY.push({ y0: y, y1: y + bh, gaps });
      y += bh + chH[bi + 1];
    });
    const chY = [];
    let cy = 0;
    for (let c = 0; c <= nb; c++) { chY.push({ y0: cy, y1: cy + chH[c] }); if (c < nb) cy += chH[c] + (bandY[c].y1 - bandY[c].y0); }
    return { pos, bandY, chY };
  };

  const term = (end) => {
    const p = geo.pos.get(end.dev);
    const sl = p.sym.slots.get(end.port);
    return { x: p.x + sl.x, y: p.y + sl.y, ch: sl.edge === 'top' ? p.band : p.band + 1 };
  };

  const route = (c) => {
    const A = term(c.a), B = term(c.b);
    const segs = [];
    let ch = A.ch, x = A.x;
    while (ch !== B.ch) {
      const s = B.ch > ch ? 1 : -1;
      const band = s > 0 ? ch : ch - 1;
      const gaps = geo.bandY[band].gaps;
      let best = 0, bc = Infinity;
      gaps.forEach((g, gi) => { const gx = (g.x0 + g.x1) / 2; const cost = Math.abs(x - gx) + Math.abs(gx - B.x) + (gi === 0 || gi === gaps.length - 1 ? 30 : 0); if (cost < bc) { bc = cost; best = gi; } });
      const gx = (gaps[best].x0 + gaps[best].x1) / 2;
      segs.push({ t: 'h', ch, x0: x, x1: gx });
      segs.push({ t: 'v', band, gap: best });
      x = gx; ch += s;
    }
    segs.push({ t: 'h', ch, x0: x, x1: B.x });
    return { A, B, segs };
  };

  for (let iter = 0; iter < 5; iter++) {
    geo = placeAll();
    plan = conns.map((c) => ({ c, ...route(c) }));
    // track assignment: horizontal runs per duct, vertical runs per gap
    const chRuns = new Array(nb + 1).fill(0).map(() => []);
    const gapRuns = new Map();
    for (const r of plan) for (const s of r.segs) {
      if (s.t === 'h') chRuns[s.ch].push(s);
      else { const k = s.band + ':' + s.gap; if (!gapRuns.has(k)) gapRuns.set(k, []); gapRuns.get(k).push(s); }
    }
    // vertical runs first: a horizontal run ends where its vertical run really is (the gap centre
    // shifted to the track), so two runs in a duct that only touched at the gap centres could
    // still share a track for a few pixels
    for (const runs of gapRuns.values()) runs.forEach((s, i) => { s.track = i; s.of = runs.length; });
    const off = (v) => (v ? -((v.of - 1) * TRACK) / 2 + v.track * TRACK : 0);
    for (const r of plan) r.segs.forEach((s, i) => { if (s.t === 'h') { s.pv = i > 0 ? r.segs[i - 1] : null; s.nv = r.segs[i + 1] || null; } });
    const needCh = chRuns.map((runs) => {
      const span = (s) => { const a = s.x0 + off(s.pv), b = s.x1 + off(s.nv); return [Math.min(a, b), Math.max(a, b)]; };
      runs.sort((a, b) => span(a)[0] - span(b)[0]);
      const ends = [];
      for (const s of runs) {
        const [lo, hi] = span(s);
        let t = ends.findIndex((e) => e < lo - TRACK);
        if (t < 0) { t = ends.length; ends.push(hi); } else ends[t] = hi;
        s.track = t;
      }
      return ends.length;
    });
    let changed = false;
    const nh = chH.map((h0, c) => Math.max(h0, CH_MIN, 26 + (needCh[c] - 1) * TRACK + 18));
    const nw = gapW.map((arr, bi) => arr.map((w0, g) => { const n = (gapRuns.get(bi + ':' + g) || []).length; return Math.max(w0, n ? 20 + (n - 1) * TRACK + 14 : 0); }));
    if (nh.some((v, i) => v !== chH[i]) || nw.some((arr, bi) => arr.some((v, g) => v !== gapW[bi][g]))) changed = true;
    chH = nh; gapW = nw;
    if (!changed) break;
  }
  geo = placeAll();
  // final points (the plan's gap choices and tracks stay; positions are final)
  const trackY = (ch, t, n) => { const c = geo.chY[ch]; const used = Math.max(0, n - 1) * TRACK; return (c.y0 + c.y1) / 2 - used / 2 + t * TRACK; };
  const chCount = new Array(nb + 1).fill(0);
  for (const r of plan) for (const s of r.segs) if (s.t === 'h') chCount[s.ch] = Math.max(chCount[s.ch], s.track + 1);
  const wires = new Map();
  for (const r of plan) {
    const A = term(r.c.a), B = term(r.c.b);
    const pts = [[A.x, A.y]];
    let x = A.x;
    for (let i = 0; i < r.segs.length; i++) {
      const s = r.segs[i];
      if (s.t === 'h') {
        const y = trackY(s.ch, s.track, chCount[s.ch]);
        const nx = i === r.segs.length - 1 ? B.x : null;
        pts.push([x, y]);
        if (nx !== null) { pts.push([nx, y]); x = nx; } else {
          const v = r.segs[i + 1];
          const g = geo.bandY[v.band].gaps[v.gap];
          const gx = (g.x0 + g.x1) / 2 - ((v.of - 1) * TRACK) / 2 + v.track * TRACK;
          pts.push([gx, y]);
          x = gx;
        }
      }
    }
    pts.push([B.x, B.y]);
    wires.set(r.c.id, dedupe(pts));
  }
  let x0 = Infinity, y0 = 0, x1 = -Infinity, y1 = geo.chY[nb] ? geo.chY[nb].y1 : 0;
  for (const p of geo.pos.values()) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x + p.sym.w); }
  geo.bandY.forEach((b) => { x0 = Math.min(x0, b.gaps[0].x0); x1 = Math.max(x1, b.gaps[b.gaps.length - 1].x1); });
  if (!Number.isFinite(x0)) { x0 = -200; x1 = 200; y1 = 200; }
  const ducts = geo.chY.map((c) => ({ y0: c.y0 + 8, y1: c.y1 - 8, x0, x1 }));
  return { syms: geo.pos, wires, ducts, box: { x0, y0, x1, y1 }, bands: geo.bandY, zones: bands.map((b) => b.zone) };
}

function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.abs(q[0] - p[0]) < 0.01 && Math.abs(q[1] - p[1]) < 0.01) continue;
    out.push(p);
  }
  // drop collinear middle points
  for (let i = out.length - 2; i > 0; i--) {
    const [a, b, c] = [out[i - 1], out[i], out[i + 1]];
    if ((Math.abs(a[0] - b[0]) < 0.01 && Math.abs(b[0] - c[0]) < 0.01) || (Math.abs(a[1] - b[1]) < 0.01 && Math.abs(b[1] - c[1]) < 0.01)) out.splice(i, 1);
  }
  return out;
}

function pathD(pts, r = 5) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(cx - px, cy - py), l2 = Math.hypot(nx - cx, ny - cy);
    const k = Math.min(r, l1 / 2, l2 / 2);
    const ax = cx - ((cx - px) / (l1 || 1)) * k, ay = cy - ((cy - py) / (l1 || 1)) * k;
    const bx = cx + ((nx - cx) / (l2 || 1)) * k, by = cy + ((ny - cy) / (l2 || 1)) * k;
    d += ` L${ax.toFixed(1)} ${ay.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
}

// ====================================================================== device drawing
/** Draw a device symbol into group g (local coordinates, 0,0 = top-left). Returns {controls, update}. */
function drawDevice(g, sym) {
  const { dev, def, w, h } = sym;
  const props = deviceProps(dev);
  const cat = CAT_COLOR[def.category] || '#64748b';
  el('rect', { class: 'sd-body', x: 0, y: 0, width: w, height: h, rx: 10, style: `--cat:${cat}` }, g);
  el('rect', { class: 'sd-stripe', x: 0.5, y: 14, width: 3, height: h - 28, rx: 1.5, fill: cat }, g);
  // terminals + labels
  for (const sl of sym.slots.values()) {
    const p = sl.port;
    const top = sl.edge === 'top';
    if (p.kind === 'comm') {
      const cw = sl.w - 10;
      el('rect', { class: 'sd-comm', x: sl.x - cw / 2, y: top ? -7 : h - 7, width: cw, height: 14, rx: 3, stroke: BUS_COLOR[p.bus] || '#94a3b8' }, g);
      el('text', { class: 'sd-tlabel comm', x: sl.x, y: top ? 20 : h - 13 }, g, shortLabel(p));
    } else {
      el('rect', { class: 'sd-term' + (p.kind === 'sock' ? ' sock' : ''), x: sl.x - 6, y: top ? -5 : h - 5, width: 12, height: 10, rx: p.kind === 'sock' ? 5 : 2 }, g);
      el('text', { class: 'sd-tlabel', x: sl.x, y: top ? 18 : h - 11 }, g, p.label);
    }
  }
  const title = hasLabel(def) && props.label ? props.label : def.short;
  const controls = [];
  const ctl = (x, y, cw, ch, action, extra = {}) => { controls.push({ x0: x, y0: y, x1: x + cw, y1: y + ch, action, devId: dev.id, ...extra }); };
  const led = (x, y, color, r = 4) => {
    const e = el('circle', { class: 'sd-led', cx: x, cy: y, r, style: `--on:${color}` }, g);
    return e;
  };
  const ledOn = (e, on) => set(e, 'class', on ? 'sd-led on' : 'sd-led');
  const txt = (x, y, s, cls = 'sd-text', parent = g) => el('text', { class: cls, x, y }, parent, s);
  let update = () => {};

  switch (def.sim) {
    case 'plc': {
      // the front of the DVP-ES2 / EX2: STOP/RUN switch and COM1 on the left, DELTA + model + I/O
      // spec, the POWER … COM3 LEDs, the IN / OUT LED grid and the R / T badge
      const m = def.model;
      el('rect', { class: 'sd-plcface', x: 10, y: 30, width: w - 20, height: h - 60, rx: 6 }, g);
      const lx = 58;
      el('rect', { x: lx - 17, y: 50, width: 34, height: 16, rx: 8, class: 'sd-well' }, g);
      const knob = el('rect', { x: lx, y: 52, width: 14, height: 12, rx: 3, class: 'sd-plcslide' }, g);
      txt(lx - 21, 61, 'STOP', 'sd-mini r'); txt(lx + 21, 61, 'RUN', 'sd-mini l');
      ctl(lx - 26, 44, 52, 28, 'toggle', { label: 'RUN / STOP switch' });
      el('circle', { cx: lx, cy: 98, r: 14, class: 'sd-plcdin' }, g);
      for (let k = 0; k < 8; k++) { const an = (k / 7) * Math.PI * 1.5 + Math.PI * 0.75, rr = k === 7 ? 0 : 7; el('circle', { cx: lx + Math.cos(an) * rr, cy: 98 + Math.sin(an) * rr, r: 1.4, class: 'sd-plcpin' }, g); }
      txt(lx, 124, 'COM1', 'sd-mini');
      const tx = 102;
      txt(tx, 62, '▲ DELTA', 'sd-plclogo');
      txt(tx, 96, m.short, 'sd-plcmodel');
      const spec = txt(tx + 4, 114, m.spec, 'sd-plcspec');
      el('rect', { x: tx, y: 104, width: m.spec.length * 6.1 + 8, height: 14, class: 'sd-plcbox' }, g);
      g.appendChild(spec);
      const lp = 16;
      const gx0 = w - 34 - 7 * lp;
      const sx = gx0 - 24;
      const st = {};
      ['POWER', 'RUN', 'ERROR', 'COM1', 'COM2', 'COM3'].forEach((t, i) => {
        const y = 46 + i * 15;
        txt(sx - 8, y + 3, t, 'sd-mini r');
        st[t] = led(sx, y, t === 'ERROR' ? '#ff3b30' : t.startsWith('COM') ? '#ffb020' : '#36ff6a', 3.4);
      });
      const grid = (title, y0, n) => {
        txt(gx0 - 6, y0, title, 'sd-mini l');
        const out = [];
        for (let i = 0; i < n; i++) {
          const r = i >> 3, x = gx0 + (i & 7) * lp, y = y0 + 12 + r * 24;
          txt(x, y, String(r ? 10 + (i & 7) : i & 7), 'sd-mini');
          out.push(led(x, y + 9, '#36ff6a', 3.4));
        }
        return out;
      };
      const xl = grid('IN', 42, m.inputs);
      const yl = grid('OUT', 42 + 18 + (m.inputs > 8 ? 2 : 1) * 24, m.outputs);
      el('rect', { x: w - 34, y: h - 56, width: 16, height: 16, rx: 2, class: 'sd-plcbadge' }, g);
      txt(w - 26, h - 44, m.badge, 'sd-plcbadge-t');
      update = (rt, t) => {
        const cpu = rt.cpu, p = cpu.powered;
        ledOn(st.POWER, p); ledOn(st.RUN, p && cpu.running); ledOn(st.ERROR, p && cpu.errorFlag && Math.floor(t * 3) % 2);
        ledOn(st.COM2, p && !!(rt.m2 && rt.m2.busy) && Math.floor(t * 8) % 2);
        xl.forEach((e, i) => ledOn(e, p && cpu.X[i]));
        yl.forEach((e, i) => ledOn(e, p && cpu.Y[i]));
        set(knob, 'x', rt.dev.state.run !== false ? lx : lx - 14);
      };
      break;
    }
    case 'mcb': {
      txt(w / 2, 32, 'MAINS 230 V', 'sd-title');
      el('rect', { x: w / 2 - 16, y: 44, width: 32, height: 46, rx: 5, class: 'sd-well' }, g);
      const lever = el('rect', { x: w / 2 - 11, y: 48, width: 22, height: 18, rx: 3, class: 'sd-lever' }, g);
      const st = txt(w / 2, 104, 'ON', 'sd-state');
      txt(w / 2, 118 - 4, def.part, 'sd-sub');
      ctl(w / 2 - 24, 38, 48, 58, 'toggle', { label: 'MCB' });
      update = (rt) => {
        const on = !!rt.dev.state.on;
        set(lever, 'y', on ? 48 : 68);
        set(lever, 'class', on ? 'sd-lever on' : 'sd-lever');
        const s = rt.tripped && !on ? 'TRIPPED' : on ? 'ON' : 'OFF';
        if (st.textContent !== s) { st.textContent = s; set(st, 'class', 'sd-state' + (s === 'TRIPPED' ? ' err' : on ? ' ok' : '')); }
      };
      break;
    }
    case 'psu': {
      txt(w / 2, h / 2 - 8, '24 V DC', 'sd-title');
      txt(w / 2, h / 2 + 8, def.part, 'sd-sub');
      const ok = led(w / 2 - 22, h / 2 + 24, '#36ff6a');
      const st = txt(w / 2 - 12, h / 2 + 28, 'DC OK', 'sd-mini l');
      update = (rt) => {
        ledOn(ok, rt.powered && !rt.short);
        const s = rt.short ? 'SHORT' : 'DC OK';
        if (st.textContent !== s) { st.textContent = s; set(st, 'class', 'sd-mini l' + (rt.short ? ' err' : '')); }
      };
      break;
    }
    case 'vfd': {
      // MS300 keypad as on the drive: RUN / FWD / REV LEDs, the 5-digit display, STOP / PLC LEDs,
      // the speed dial, then RUN ▲ MODE / STOP-RESET ◀/▼ ENTER
      const cx = w / 2;
      el('rect', { x: cx - 106, y: 28, width: 212, height: 116, rx: 7, class: 'sd-kpface' }, g);
      el('rect', { x: cx - 74, y: 36, width: 104, height: 32, rx: 4, class: 'sd-lcd' }, g);
      const disp = txt(cx + 26, 59, '', 'sd-seg');
      const fitDisp = (text) => {
        disp.removeAttribute('textLength'); disp.removeAttribute('lengthAdjust');
        if (text.length <= 6) return;
        let tw = 0;
        try { tw = disp.getComputedTextLength(); } catch (e) { /* not rendered yet */ }
        if (tw > 96) { disp.setAttribute('textLength', 96); disp.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
      };
      const leds = {};
      [['RUN', 40], ['FWD', 52], ['REV', 64]].forEach(([k, y]) => { leds[k] = led(cx - 99, y - 3, '#36ff6a', 3); txt(cx - 94, y, k, 'sd-mini l'); });
      [['STOP', 46, '#ff3b30'], ['PLC', 60, '#36ff6a']].forEach(([k, y, c]) => { leds[k] = led(cx + 37, y - 3, c, 3); txt(cx + 42, y, k, 'sd-mini l'); });
      const kx = cx + 84, ky = 52;
      el('path', { d: `M ${kx - 12.7} ${ky + 12.7} A 18 18 0 1 1 ${kx + 12.7} ${ky + 12.7}`, class: 'sd-dial-arc' }, g);
      el('circle', { cx: kx, cy: ky, r: 13, class: 'sd-dial' }, g);
      const mark = el('line', { x1: kx, y1: ky, x2: kx, y2: ky - 11, class: 'sd-dial-mark' }, g);
      ctl(kx - 18, ky - 18, 36, 36, 'vfdKnob', { label: 'Speed dial (Pr.00-20 = 7)' });
      const keys = [
        { k: 'RUN', c: 0, r: 0, label: 'RUN', cls: 'run' }, { k: 'UP', c: 1, r: 0, label: '▲', cls: 'grey' }, { k: 'MODE', c: 2, r: 0, label: 'MODE', cls: 'grey' },
        { k: 'STOP', c: 0, r: 1, label: 'STOP/RESET', cls: 'stop' }, { k: 'LD', c: 1, r: 1, label: '</▼', cls: 'grey' }, { k: 'ENTER', c: 2, r: 1, label: 'ENTER', cls: 'enter' },
      ];
      const kw = 60, kh = 26, kx0 = cx - (3 * kw + 12) / 2;
      const keyEls = {};
      for (const k of keys) {
        const x = kx0 + k.c * (kw + 6), y = 78 + k.r * (kh + 6);
        const r = el('rect', { x, y, width: kw, height: kh, rx: 5, class: 'sd-key ' + k.cls }, g);
        txt(x + kw / 2, y + kh / 2 + 3.5, k.label, 'sd-key-t ' + k.cls);
        keyEls[k.k] = r;
        ctl(x, y, kw, kh, 'vfdKey', { key: k.k, label: k.k === 'LD' ? '◀/▼ (tap ▼ · hold ◀)' : k.label });
      }
      txt(cx, h - 40, 'DELTA MS300  ·  ' + def.part, 'sd-sub');
      update = (rt, t) => {
        const d = rt.vfd.display(t);
        const s = d.off ? '' : String(d.text);
        if (disp.textContent !== s) { disp.textContent = s; fitDisp(s); }
        set(disp, 'class', 'sd-seg' + (d.fault ? ' blink' : ''));
        for (const k of Object.keys(leds)) ledOn(leds[k], !!d.leds[k]);
        set(mark, 'transform', `rotate(${(-135 + 270 * Math.max(0, Math.min(1, rt.dev.state.knob ?? 0))).toFixed(0)} ${kx} ${ky})`);
      };
      sym.press = (key) => { const r = keyEls[key === 'DOWN' || key === 'LEFT' ? 'LD' : key]; if (!r) return; r.classList.add('down'); setTimeout(() => r.classList.remove('down'), 140); };
      break;
    }
    case 'hmi': {
      const sw = w - 30, sh = sw * 0.6;
      el('rect', { x: 11, y: 30, width: sw + 8, height: sh + 8, rx: 6, class: 'sd-bezel' }, g);
      const img = el('image', { x: 15, y: 34, width: sw, height: sh, preserveAspectRatio: 'none', class: 'sd-screen' }, g);
      el('rect', { x: 15, y: 34, width: sw, height: sh, class: 'sd-screen-edge' }, g);
      txt(w / 2, h - 12, 'Delta ' + def.short, 'sd-sub');
      ctl(15, 34, sw, sh, 'hmi', { screen: { x: 15, y: 34, w: sw, h: sh } });
      sym.screen = img;
      break;
    }
    case 'laptop': {
      const sw = w - 40, sh = sw * 0.625;
      el('rect', { x: 16, y: 26, width: sw + 8, height: sh + 8, rx: 6, class: 'sd-bezel' }, g);
      const img = el('image', { x: 20, y: 30, width: sw, height: sh, preserveAspectRatio: 'none', class: 'sd-screen' }, g);
      el('path', { d: `M8 ${h - 34} L${w - 8} ${h - 34} L${w - 18} ${h - 24} L18 ${h - 24} Z`, class: 'sd-well' }, g);
      txt(w / 2, h - 10, 'ISPSoft · tap to program', 'sd-sub');
      ctl(16, 26, sw + 8, sh + 8, 'laptop', { label: 'Laptop' });
      sym.screen = img;
      break;
    }
    case 'motor': {
      const cx = w / 2, cy = h / 2 + 10;
      el('circle', { cx, cy, r: 42, class: 'sd-motor' }, g);
      const fan = el('g', { class: 'sd-fan' }, g);
      for (let i = 0; i < 3; i++) el('line', { x1: cx, y1: cy, x2: cx + Math.cos(i * 2.094) * 34, y2: cy + Math.sin(i * 2.094) * 34 }, fan);
      el('circle', { cx, cy, r: 20, class: 'sd-motor-in' }, g);
      txt(cx, cy + 5, 'M 3~', 'sd-title');
      const rpm = txt(cx, h - 6, '0 rpm', 'sd-sub');
      update = (rt) => {
        set(fan, 'transform', `rotate(${((rt.angle || 0) * 180 / Math.PI).toFixed(1)} ${cx} ${cy})`);
        const s = `${Math.round(rt.rpm || 0)} rpm`;
        if (rpm.textContent !== s) rpm.textContent = s;
        set(fan, 'class', Math.abs(rt.rpm || 0) > 5 ? 'sd-fan on' : 'sd-fan');
      };
      break;
    }
    case 'pb': {
      const cx = w / 2, cy = 58;
      el('circle', { cx, cy, r: 24, class: 'sd-bezelr' }, g);
      const cap = el('circle', { cx, cy, r: 19, fill: CAP[props.color] || CAP.green, class: 'sd-cap' }, g);
      txt(cx, h - 12, title, 'sd-label');
      txt(cx, 25 + 8, props.contact === 'NC' ? 'NC' : 'NO', 'sd-mini');
      ctl(cx - 28, cy - 28, 56, 56, 'press', { label: title });
      update = (rt) => { set(cap, 'r', rt.pressed ? 15 : 19); set(cap, 'class', rt.pressed ? 'sd-cap down' : 'sd-cap'); };
      break;
    }
    case 'estop': {
      const cx = w / 2, cy = 58;
      el('circle', { cx, cy, r: 26, fill: '#f2b705', class: 'sd-ring' }, g);
      const cap = el('circle', { cx, cy, r: 19, fill: '#d62828', class: 'sd-cap' }, g);
      const st = txt(cx, 33, '', 'sd-mini err');
      txt(cx, h - 12, title, 'sd-label');
      ctl(cx - 28, cy - 28, 56, 56, 'toggle', { label: title });
      update = (rt) => { const p = !!rt.dev.state.pressed; set(cap, 'r', p ? 15 : 19); const s = p ? 'LATCHED' : ''; if (st.textContent !== s) st.textContent = s; };
      break;
    }
    case 'selector': {
      const cx = w / 2, cy = 60;
      el('circle', { cx, cy, r: 21, class: 'sd-bezelr' }, g);
      const bar = el('rect', { x: cx - 4, y: cy - 18, width: 8, height: 36, rx: 3, class: 'sd-knob' }, g);
      txt(cx - 28, 34, props.pos0 || '0', 'sd-mini');
      txt(cx + 28, 34, props.pos1 || '1', 'sd-mini');
      txt(cx, h - 12, title, 'sd-label');
      ctl(cx - 28, cy - 28, 56, 56, 'toggle', { label: title });
      update = (rt) => set(bar, 'transform', `rotate(${rt.dev.state.on ? 40 : -40} ${cx} ${cy})`);
      break;
    }
    case 'selector3': {
      const cx = w / 2, cy = 60;
      el('circle', { cx, cy, r: 21, class: 'sd-bezelr' }, g);
      const bar = el('rect', { x: cx - 4, y: cy - 18, width: 8, height: 36, rx: 3, class: 'sd-knob' }, g);
      txt(cx - 30, 36, props.pos0 || 'L', 'sd-mini');
      txt(cx, 32, '0', 'sd-mini');
      txt(cx + 30, 36, props.pos1 || 'R', 'sd-mini');
      txt(cx, h - 12, title, 'sd-label');
      ctl(cx - 28, cy - 28, 56, 56, 'toggle', { label: title });
      update = (rt) => set(bar, 'transform', `rotate(${(rt.dev.state.pos || 0) * 40} ${cx} ${cy})`);
      break;
    }
    case 'relay': {
      const cx = w / 2, cy = h / 2;
      txt(cx, cy - 18, props.label || 'K1', 'sd-title');
      txt(cx, cy - 2, '24 V DC', 'sd-sub');
      const l = led(cx + 22, cy - 22, '#ff3434', 3.6);
      const st = txt(cx, cy + 22, 'OFF', 'sd-state');
      ctl(cx - 34, cy - 30, 68, 64, 'press', { label: `${props.label || 'Relay'} (test button)` });
      update = (rt) => {
        ledOn(l, !!rt.coil);
        const s = rt.closed ? '11–14' : '11–12';
        if (st.textContent !== s) { st.textContent = s; set(st, 'class', 'sd-state' + (rt.closed ? ' ok' : '')); }
      };
      break;
    }
    case 'cb': {
      const cx = w / 2, cy = h / 2;
      txt(cx, cy - 18, props.label || 'QF1', 'sd-title');
      txt(cx, cy - 2, `${props.rating || 'C6'} · ${props.poles === '3P' ? '3P' : '1P'}`, 'sd-sub');
      const st = txt(cx, cy + 22, 'ON', 'sd-state ok');
      ctl(cx - 34, cy - 30, 68, 64, 'toggle', { label: `${props.label || 'Breaker'} ON / OFF` });
      update = (rt) => {
        const on = rt.dev.state.on !== false, s = on ? 'ON' : 'OFF';
        if (st.textContent !== s) { st.textContent = s; set(st, 'class', 'sd-state' + (on ? ' ok' : ' err')); }
      };
      break;
    }
    case 'tb': {
      const cx = w / 2, cy = h / 2;
      for (const sl of sym.slots.values()) if (sl.edge === 'top') el('line', { x1: sl.x, y1: 22, x2: sl.x, y2: h - 22, class: 'sd-bridge' }, g);
      txt(cx, cy + 4, props.label || 'X1', 'sd-title');
      break;
    }
    case 'lamp': {
      const cx = w / 2, cy = 58, col = LAMP[props.color] || LAMP.green;
      const glow = el('circle', { cx, cy, r: 30, fill: col, class: 'sd-glow' }, g);
      el('circle', { cx, cy, r: 22, class: 'sd-bezelr' }, g);
      const lens = el('circle', { cx, cy, r: 17, fill: col, class: 'sd-lens' }, g);
      txt(cx, h - 12, title, 'sd-label');
      update = (rt) => { set(lens, 'class', rt.on ? 'sd-lens on' : 'sd-lens'); set(glow, 'class', rt.on ? 'sd-glow on' : 'sd-glow'); };
      break;
    }
    case 'buzzer': {
      const cx = w / 2, cy = 58;
      const ring = el('circle', { cx, cy, r: 26, class: 'sd-wave' }, g);
      el('circle', { cx, cy, r: 20, class: 'sd-bezelr' }, g);
      el('circle', { cx, cy, r: 4, fill: '#000' }, g);
      txt(cx, h - 12, title, 'sd-label');
      update = (rt) => set(ring, 'class', rt.on ? 'sd-wave on' : 'sd-wave');
      break;
    }
    case 'prox': {
      const cy = 58, look = def.look || 'ind';
      el('rect', { x: 14, y: cy - 11, width: 46, height: 22, rx: 4, class: 'sd-well' }, g);
      el('rect', { x: 58, y: cy - 9, width: 6, height: 18, rx: 2, fill: look === 'photo' ? '#ef4444' : look === 'cap' ? '#f97316' : '#2563eb' }, g);
      const l = led(24, cy, '#ffb020', 3.4);
      const beam = look === 'photo' ? el('line', { x1: 64, y1: cy, x2: 96, y2: cy, class: 'sd-beam' }, g) : null;
      const target = el('rect', { x: 72, y: cy - 14, width: 16, height: 28, rx: 2, class: 'sd-target' + (look === 'cap' ? ' liquid' : look === 'photo' ? ' box' : '') }, g);
      txt(w / 2, 33, `${look === 'photo' ? 'PHOTO' : look === 'cap' ? 'CAP' : 'IND'} · ${props.output === 'NPN' ? 'NPN' : 'PNP'}`, 'sd-mini');
      txt(w / 2, h - 12, title, 'sd-label');
      ctl(8, cy - 26, w - 16, 52, 'toggle', { label: look === 'photo' ? 'Box in the light beam' : look === 'cap' ? 'Material in front of the sensor' : 'Metal part in front of the sensor' });
      update = (rt) => {
        const here = !!rt.dev.state.target;
        ledOn(l, rt.powered && here); set(target, 'x', here ? 72 : 84); set(target, 'class', (here ? 'sd-target on' : 'sd-target') + (look === 'cap' ? ' liquid' : look === 'photo' ? ' box' : ''));
        if (beam) { set(beam, 'x2', here ? 72 : 96); set(beam, 'class', rt.powered ? 'sd-beam on' : 'sd-beam'); }
      };
      break;
    }
    case 'limit': {
      const cy = 60, cx = w / 2;
      txt(cx, 33, '1 NO + 1 NC', 'sd-mini');
      txt(cx, h - 12, title, 'sd-label');
      if (def.look === 'float') {
        el('rect', { x: cx - 22, y: cy - 20, width: 44, height: 40, rx: 4, class: 'sd-well' }, g);
        const water = el('rect', { x: cx - 20, y: cy + 8, width: 40, height: 10, class: 'sd-water' }, g);
        const fl = el('rect', { x: cx + 6, y: cy - 6, width: 8, height: 10, rx: 3, fill: '#f2b705' }, g);
        ctl(cx - 28, cy - 26, 56, 52, 'toggle', { label: 'Raise / lower the level' });
        update = (rt) => { const on = !!rt.dev.state.on; set(water, 'y', on ? cy - 10 : cy + 8); set(water, 'height', on ? 28 : 10); set(fl, 'y', on ? cy - 18 : cy - 6); };
      } else {
        el('rect', { x: cx - 26, y: cy - 6, width: 22, height: 24, rx: 3, class: 'sd-well' }, g);
        const arm = el('g', {}, g);
        el('line', { x1: cx - 15, y1: cy - 6, x2: cx + 10, y2: cy - 6, class: 'sd-ptr' }, arm);
        el('circle', { cx: cx + 12, cy: cy - 6, r: 5, class: 'sd-knobc' }, arm);
        const cam = el('rect', { x: cx + 20, y: cy - 26, width: 14, height: 10, rx: 2, fill: '#d62828' }, g);
        ctl(cx - 30, cy - 28, 64, 52, 'toggle', { label: 'Push the lever' });
        update = (rt) => { const on = !!rt.dev.state.on; set(arm, 'transform', `rotate(${on ? 24 : 0} ${cx - 15} ${cy - 6})`); set(cam, 'x', on ? cx + 6 : cx + 20); };
      }
      break;
    }
    case 'atx': {
      const cx = w / 2, cy = 60;
      el('rect', { x: cx - 30, y: cy - 16, width: 60, height: 32, rx: 5, class: 'sd-lcd' }, g);
      const val = txt(cx, cy + 6, '', 'sd-value');
      txt(cx, 33, '0–10 V', 'sd-mini');
      txt(cx, h - 12, title, 'sd-label');
      ctl(cx - 32, cy - 22, 64, 44, 'pot', { label: title });
      update = (rt) => {
        const k = rt.dev.state.pos ?? 0.5, v = +props.min + k * (props.max - props.min);
        const s = rt.powered ? `${v.toFixed(Math.abs(props.max - props.min) <= 20 ? 1 : 0)} ${props.unit}` : 'OFF';
        if (val.textContent !== s) val.textContent = s;
      };
      break;
    }
    case 'tc': case 'mbth': case 'meter': {
      // Modbus slaves: the display, the station address and TX / RX
      const cx = w / 2, sim = def.sim;
      el('rect', { x: cx - 44, y: 30, width: 88, height: sim === 'tc' ? 52 : 34, rx: 5, class: sim === 'tc' ? 'sd-lcd' : 'sd-lcd lcd-g' }, g);
      const l1 = txt(cx + 38, sim === 'tc' ? 52 : 54, '', sim === 'tc' ? 'sd-seg pv' : 'sd-seg lcd');
      const l2 = sim === 'tc' ? txt(cx + 38, 76, '', 'sd-seg sv') : null;
      if (sim === 'tc') { txt(cx - 40, 46, 'PV', 'sd-mini l'); txt(cx - 40, 72, 'SV', 'sd-mini l'); }
      txt(cx, h - 40, `${title} · ID ${props.station ?? 1}`, 'sd-sub');
      const tx = led(cx - 14, h - 28, '#36ff6a', 3.5), rx = led(cx + 8, h - 28, '#ffb020', 3.5);
      txt(cx - 9, h - 25, 'TX', 'sd-mini l'); txt(cx + 13, h - 25, 'RX', 'sd-mini l');
      if (sim === 'tc') ctl(cx - 46, 28, 92, 56, 'tcCard', { label: 'Oven controller' });
      else if (sim === 'mbth') ctl(cx - 46, 28, 92, 38, 'thCard', { label: 'Temperature / humidity' });
      else ctl(cx - 46, 28, 92, 38, 'toggle', { label: 'Next display page' });
      update = (rt) => {
        const m = rt.mb;
        if (!m) return;
        let a = '', b = '';
        if (m.powered) {
          if (sim === 'tc') { a = m.pv.toFixed(1); b = rt.dev.state.run ? Number(rt.dev.state.sv).toFixed(1) : 'StoP'; }
          else if (sim === 'mbth') a = `${m.temp.toFixed(1)}° ${m.rh.toFixed(0)}%`;
          else a = [`${m.V.toFixed(1)} V`, `${m.I.toFixed(2)} A`, `${Math.round(m.P)} W`, `${(rt.dev.state.wh / 1000).toFixed(3)} kWh`][m.page % 4];
        }
        if (l1.textContent !== a) l1.textContent = a;
        if (l2 && l2.textContent !== b) l2.textContent = b;
        ledOn(tx, m.powered && m.time - m.stat.lastTx < 0.07);
        ledOn(rx, m.powered && m.time - m.stat.lastRx < 0.07);
      };
      break;
    }
    case 'contactor': {
      const cx = w / 2, cy = h / 2;
      txt(cx, cy - 20, props.label || 'KM1', 'sd-title');
      txt(cx, cy - 4, `Coil ${props.coil === '230AC' ? '230 V AC' : '24 V DC'}`, 'sd-sub');
      const poles = el('g', { class: 'sd-poles' }, g);
      for (let i = 0; i < 3; i++) el('line', { x1: cx - 24 + i * 16, y1: cy + 6, x2: cx - 16 + i * 16, y2: cy + 18 }, poles);
      const st = txt(cx, cy + 36, 'OPEN', 'sd-state');
      ctl(cx - 40, cy - 28, 80, 76, 'press', { label: `${props.label || 'Contactor'} (push in by hand)` });
      update = (rt) => {
        const on = !!rt.closed;
        set(poles, 'class', on ? 'sd-poles on' : 'sd-poles');
        const s = on ? 'CLOSED' : 'OPEN';
        if (st.textContent !== s) { st.textContent = s; set(st, 'class', 'sd-state' + (on ? ' ok' : '')); }
      };
      break;
    }
    case 'olr': {
      const cx = w / 2, cy = h / 2;
      txt(cx, cy - 18, props.label || 'F1', 'sd-title');
      txt(cx, cy - 2, def.part.split(' · ')[0], 'sd-sub');
      const btn = el('circle', { cx: cx + 26, cy: cy + 18, r: 9, fill: '#1f5fd6', class: 'sd-cap' }, g);
      const st = txt(cx - 10, cy + 22, 'OK', 'sd-state ok');
      ctl(cx - 40, cy - 28, 80, 70, 'toggle', { label: `${props.label || 'Overload relay'}: trip / reset` });
      update = (rt) => {
        const t = !!rt.dev.state.tripped;
        set(btn, 'r', t ? 11 : 9);
        const s = t ? 'TRIPPED' : 'OK';
        if (st.textContent !== s) { st.textContent = s; set(st, 'class', 'sd-state ' + (t ? 'err' : 'ok')); }
      };
      break;
    }
    case 'pot': {
      const cx = w / 2, cy = 60;
      el('circle', { cx, cy, r: 22, class: 'sd-bezelr' }, g);
      const kn = el('g', {}, g);
      el('circle', { cx, cy, r: 16, class: 'sd-knobc' }, kn);
      el('line', { x1: cx, y1: cy, x2: cx, y2: cy - 14, class: 'sd-ptr' }, kn);
      const val = txt(cx, 33, '', 'sd-mini');
      txt(cx, h - 12, title, 'sd-label');
      ctl(cx - 28, cy - 28, 56, 56, 'pot', { label: title });
      update = (rt) => { const p = rt.dev.state.pos ?? 0.5; set(kn, 'transform', `rotate(${((p - 0.5) * 270).toFixed(0)} ${cx} ${cy})`); const s = Math.round(p * 100) + '%'; if (val.textContent !== s) val.textContent = s; };
      break;
    }
    default:
      txt(w / 2, h / 2, title, 'sd-title');
  }
  return { controls, update };
}

// ====================================================================== the view
export class LabSchematic {
  constructor(host, { hmiCanvas, laptopCanvas } = {}) {
    this.host = host;
    this.hmiCanvas = hmiCanvas;
    this.laptopCanvas = laptopCanvas;
    this.view = { x: 0, y: 0, z: 0.5 };
    this.controls = { enabled: true };
    this.renderer = { shadowMap: {} };
    this.visible = true;
    this.dirty = true;
    this.running = false;
    this.t = 0;
    this.devs = new Map();
    this.wireEls = new Map();
    this.sel = { devs: new Set(), conns: new Set() };
    this.markers = [];
    this.svg = el('svg', { class: 'schem', width: '100%', height: '100%' });
    this.svg.innerHTML = '<defs><pattern id="schGrid" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="1" fill="rgba(148,163,184,.16)"/></pattern></defs>';
    this.vp = el('g', { class: 'schem-vp' }, this.svg);
    this.gridRect = el('rect', { fill: 'url(#schGrid)', class: 'schem-grid' }, this.vp);
    this.layerDucts = el('g', { class: 'schem-ducts' }, this.vp);
    this.layerWires = el('g', { class: 'schem-wires' }, this.vp);
    this.layerDevs = el('g', { class: 'schem-devs' }, this.vp);
    this.layerOver = el('g', { class: 'schem-over' }, this.vp);
    host.appendChild(this.svg);
    this.pointers = new Map();
    this.svg.addEventListener('pointerdown', (e) => this.onDown(e));
    this.svg.addEventListener('pointermove', (e) => this.onMove(e));
    this.svg.addEventListener('pointerup', (e) => this.onUp(e));
    this.svg.addEventListener('pointercancel', (e) => this.onUp(e));
    this.svg.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - (this.lastNow || now)) / 1000);
      this.lastNow = now;
      this.tick(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() { cancelAnimationFrame(this.raf); this.ro.disconnect(); this.svg.remove(); }

  resize() {
    const r = this.host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (this.lastSize && this.fitted) this.fit(false);
    else if (this.lastSize) { this.view.x += (r.width - this.lastSize.w) / 2; this.view.y += (r.height - this.lastSize.h) / 2; }
    this.lastSize = { w: r.width, h: r.height };
    if (this.pendingFit) { this.pendingFit = false; this.fit(false); }
    this.applyView();
  }

  // ------------------------------------------------------------------ project
  setProject(project) { this.project = project; this.syncDevices(true); }

  syncDevices() {
    if (!this.project) return;
    this.layerDevs.innerHTML = '';
    this.devs.clear();
    const layout = layoutSchematic(this.project);
    for (const dev of this.project.devices) {
      const pl = layout.syms.get(dev.id);
      if (!pl) continue;
      const g = el('g', { class: 'sd', 'data-id': dev.id }, this.layerDevs);
      const d = drawDevice(g, pl.sym);
      this.devs.set(dev.id, { dev, g, x: 0, y: 0, sym: pl.sym, controls: d.controls, update: d.update });
    }
    this.hmiStamp = 0; this.lapStamp = 0;
    this.hmiDirty = true; this.laptopDirty = true;
    this.syncCables(layout);
    this.markNet();
  }

  /** Network view: everything but the communication fades (CSS). */
  setNetView(on) { this.netOn = on; this.svg.classList.toggle('net-view', !!on); this.markNet(); }
  markNet() {
    if (!this.project) return;
    const net = new Set();
    for (const c of this.project.conns) if (c.comm) { net.add(c.a.dev); net.add(c.b.dev); }
    for (const [id, d] of this.devs) d.g.classList.toggle('net-dev', net.has(id) || DEVICE_DEFS[d.dev.type].category === 'modbus');
  }

  /** Re-route every wire (a new wire can widen a duct and move the devices a little). */
  syncCables(layout = null) {
    if (!this.project) return;
    this.layout = layout || layoutSchematic(this.project);
    for (const [id, d] of this.devs) {
      const pl = this.layout.syms.get(id);
      if (!pl) continue;
      d.x = pl.x; d.y = pl.y;
      d.g.setAttribute('transform', `translate(${pl.x} ${pl.y})`);
    }
    this.layerDucts.innerHTML = '';
    for (const dct of this.layout.ducts) {
      if (dct.y1 - dct.y0 < 10) continue;
      el('rect', { class: 'schem-duct', x: dct.x0 - 10, y: dct.y0, width: dct.x1 - dct.x0 + 20, height: dct.y1 - dct.y0, rx: 6 }, this.layerDucts);
    }
    this.layerWires.innerHTML = '';
    this.wireEls.clear();
    for (const c of this.project.conns) {
      const pts = this.layout.wires.get(c.id);
      if (!pts) continue;
      const g = el('g', { class: 'sw' + (c.comm ? ' comm' : '') + (c.color === 'pe' ? ' pe' : ''), 'data-id': c.id }, this.layerWires);
      const d = pathD(pts);
      el('path', { class: 'sw-hl', d }, g);
      el('path', { class: 'sw-out', d }, g);
      const core = el('path', { class: 'sw-core', d }, g);
      if (c.comm) {
        const pa = this.portOf(c.a.dev, c.a.port);
        core.setAttribute('stroke', (pa && BUS_COLOR[pa.bus]) || '#94a3b8');
      } else core.setAttribute('stroke', c.color === 'pe' ? '#2f9e44' : c.color || '#f97316');
      if (c.color === 'pe') el('path', { class: 'sw-pe', d }, g);
      el('path', { class: 'sw-flow', d }, g);
      for (const p of [pts[0], pts[pts.length - 1]]) el('circle', { class: 'sw-end', cx: p[0], cy: p[1], r: 2.6 }, g);
      this.wireEls.set(c.id, { g, pts, conn: c });
    }
    this.applySelection();
    this.drawMarkers();
    this.dirty = true;
  }

  portOf(devId, portId) { const d = this.devs.get(devId); const s = d && d.sym.slots.get(portId); return s ? s.port : null; }

  // ------------------------------------------------------------------ frame
  tick(dt) {
    this.t += dt;
    if (this.anim) this.stepAnim();
    if (this.visible === false || !this.system) return;
    // device states (≈ 30 fps is plenty for LEDs and text)
    this.acc = (this.acc || 0) + dt;
    if (this.acc < 0.033 && !this.dirty) return;
    this.acc = 0;
    for (const [id, d] of this.devs) {
      const rt = this.system.rts.get(id);
      if (!rt) continue;
      try { d.update(rt, this.t); } catch (e) { /* keep the others going */ }
    }
    // live HMI / laptop screens
    const now = performance.now();
    if (this.hmiDirty && now - (this.hmiStamp || 0) > 140) { this.hmiDirty = false; this.hmiStamp = now; this.drawScreen('hmi', this.hmiCanvas); }
    if (this.laptopDirty && now - (this.lapStamp || 0) > 600) { this.laptopDirty = false; this.lapStamp = now; this.drawScreen('laptop', this.laptopCanvas); }
    this.dirty = false;
  }

  drawScreen(sim, canvas) {
    if (!canvas) return;
    for (const d of this.devs.values()) {
      if (DEVICE_DEFS[d.dev.type].sim !== sim || !d.sym.screen) continue;
      if (!this.shot) { this.shot = document.createElement('canvas'); }
      const c = this.shot;
      const w = sim === 'hmi' ? 400 : 320, hh = sim === 'hmi' ? 240 : 200;
      if (c.width !== w) c.width = w;
      if (c.height !== hh) c.height = hh;
      c.getContext('2d').drawImage(canvas, 0, 0, w, hh);
      d.sym.screen.setAttribute('href', c.toDataURL('image/jpeg', 0.8));
    }
  }

  setSystem(sys) { this.system = sys; this.dirty = true; }
  setRunning(on) {
    this.running = on;
    if (!on) for (const w of this.wireEls.values()) w.g.classList.remove('flow', 'data');
    this.dirty = true;
  }

  updateFlows(liveConn, busyLinks) {
    for (const w of this.wireEls.values()) {
      const c = w.conn;
      const mode = !this.running ? null : c.comm ? (busyLinks(c) ? 'data' : null) : liveConn(c) ? 'flow' : null;
      w.g.classList.toggle('flow', mode === 'flow');
      w.g.classList.toggle('data', mode === 'data');
    }
  }

  // ------------------------------------------------------------------ view
  applyView() {
    const { x, y, z } = this.view;
    this.vp.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${z.toFixed(4)})`);
    const r = this.host.getBoundingClientRect();
    const w0 = -x / z, h0 = -y / z;
    this.gridRect.setAttribute('x', Math.floor(w0 / 28) * 28 - 28);
    this.gridRect.setAttribute('y', Math.floor(h0 / 28) * 28 - 28);
    this.gridRect.setAttribute('width', r.width / z + 84);
    this.gridRect.setAttribute('height', r.height / z + 84);
    this.svg.classList.toggle('far', z < 0.42);
    this.svg.style.setProperty('--z', z);
  }

  toScreen(wx, wy) { const r = this.svg.getBoundingClientRect(); return [wx * this.view.z + this.view.x + r.left, wy * this.view.z + this.view.y + r.top]; }
  toWorld(cx, cy) { const r = this.svg.getBoundingClientRect(); return [(cx - r.left - this.view.x) / this.view.z, (cy - r.top - this.view.y) / this.view.z]; }

  /** View that shows the world box [x0,y0,x1,y1]. */
  viewFor(b, pad = 24, zmax = 2.2) {
    const r = this.host.getBoundingClientRect();
    const tools = this.host.parentElement && this.host.parentElement.querySelector('.lab-tools');
    const tw = tools && tools.offsetParent ? tools.getBoundingClientRect().width + 10 : 0;
    const top = 50, bottom = 48;
    const w = Math.max(60, r.width - tw - pad * 2), hh = Math.max(60, r.height - top - bottom);
    const z = Math.max(0.08, Math.min(zmax, w / (b[2] - b[0] || 1), hh / (b[3] - b[1] || 1)));
    return { z, x: pad + w / 2 - ((b[0] + b[2]) / 2) * z, y: top + hh / 2 - ((b[1] + b[3]) / 2) * z };
  }

  fit(animate = true) {
    if (!this.layout) return;
    const r = this.host.getBoundingClientRect();
    if (!r.width || !r.height) { this.pendingFit = true; return; }
    const b = this.layout.box;
    this.fitted = true;
    this.go(this.viewFor([b.x0, b.y0, b.x1, b.y1], 14, 1.6), animate);
  }

  go(target, animate = true, dur = 320) {
    if (!animate) { this.anim = null; this.view = target; this.applyView(); return; }
    this.anim = { t0: performance.now(), dur, from: { ...this.view }, to: target };
  }

  stepAnim() {
    const a = this.anim;
    let k = (performance.now() - a.t0) / a.dur;
    if (k >= 1) { k = 1; this.anim = null; }
    const e = 1 - Math.pow(1 - k, 3);
    this.view = { x: a.from.x + (a.to.x - a.from.x) * e, y: a.from.y + (a.to.y - a.from.y) * e, z: a.from.z + (a.to.z - a.from.z) * e };
    this.applyView();
  }

  focus(target = 'overview', animate = true) {
    if (!this.layout) return;
    if (target === 'overview') { this.fit(animate); return; }
    let b = null;
    const grow = (x0, y0, x1, y1) => { b = b ? [Math.min(b[0], x0), Math.min(b[1], y0), Math.max(b[2], x1), Math.max(b[3], y1)] : [x0, y0, x1, y1]; };
    if (target === 'panel' || target === 'console') {
      for (const d of this.devs.values()) {
        const zone = DEVICE_DEFS[d.dev.type].zone;
        if ((target === 'console') === (zone === 'console')) grow(d.x - 20, d.y - 40, d.x + d.sym.w + 20, d.y + d.sym.h + 40);
      }
    } else {
      const d = this.devs.get(target);
      if (d) grow(d.x - 30, d.y - 46, d.x + d.sym.w + 30, d.y + d.sym.h + 46);
    }
    if (!b) return;
    this.fitted = false;
    this.go(this.viewFor(b, 16, target === 'panel' || target === 'console' ? 1.6 : 2.4), animate);
  }

  getView() { return { x: Math.round(this.view.x), y: Math.round(this.view.y), z: +this.view.z.toFixed(4) }; }
  setView(v) { if (!v || !Number.isFinite(v.z)) return; this.fitted = false; this.view = { x: v.x, y: v.y, z: v.z }; this.applyView(); }

  // zoom gestures (double-tap slide and double tap)
  zoomStart(x, y) { this.anim = null; this.zg = { view: { ...this.view }, x, y }; this.fitted = false; }
  zoomTo(f) {
    const g = this.zg;
    if (!g) return;
    const r = this.svg.getBoundingClientRect();
    const z = Math.max(0.08, Math.min(6, g.view.z * f));
    const k = z / g.view.z;
    const px = g.x - r.left, py = g.y - r.top;
    this.view = { z, x: px - (px - g.view.x) * k, y: py - (py - g.view.y) * k };
    this.applyView();
  }
  zoomAt(f, x, y) {
    const r = this.svg.getBoundingClientRect();
    const z = Math.max(0.08, Math.min(6, this.view.z * f));
    const k = z / this.view.z;
    const px = x - r.left, py = y - r.top;
    this.fitted = false;
    this.go({ z, x: px - (px - this.view.x) * k, y: py - (py - this.view.y) * k });
  }

  // ------------------------------------------------------------------ pan / pinch / wheel
  onDown(e) {
    // a primary pointer means no other finger is down: drop pointers whose 'up' never arrived
    // (a stale one would turn every drag into a pinch and the schematic would stop panning)
    if (e.isPrimary) { this.pointers.clear(); this.pinch = null; }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { this.svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    this.anim = null;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view: { ...this.view } };
      this.drag = null;
      return;
    }
    this.drag = this.controls.enabled ? { id: e.pointerId, x: e.clientX, y: e.clientY, view: { ...this.view } } : null;
  }

  onMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const p = this.pinch;
      const z = Math.max(0.08, Math.min(6, p.view.z * (Math.hypot(a.x - b.x, a.y - b.y) / (p.d || 1))));
      const r = this.svg.getBoundingClientRect();
      const k = z / p.view.z;
      const px = p.mx - r.left, py = p.my - r.top;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      this.fitted = false;
      this.view = { z, x: px - (px - p.view.x) * k + (mx - p.mx), y: py - (py - p.view.y) * k + (my - p.my) };
      this.applyView();
      return;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    if (!this.controls.enabled) { this.drag = null; return; }
    if (!d.moving && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    d.moving = true;
    this.fitted = false;
    this.view = { ...this.view, x: d.view.x + (e.clientX - d.x), y: d.view.y + (e.clientY - d.y) };
    this.applyView();
  }

  onUp(e) {
    this.pointers.delete(e.pointerId);
    try { this.svg.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (this.pinch && this.pointers.size < 2) {
      this.pinch = null;
      // continue panning with the finger that stays down
      const rest = [...this.pointers.entries()][0];
      this.drag = rest && this.controls.enabled ? { id: rest[0], x: rest[1].x, y: rest[1].y, view: { ...this.view }, moving: true } : null;
      return;
    }
    if (this.drag && this.drag.id === e.pointerId) this.drag = null;
  }

  onWheel(e) {
    e.preventDefault();
    this.anim = null;
    this.fitted = false;
    if (e.ctrlKey || e.deltaMode === 1 || Math.abs(e.deltaY) >= 50) {
      const r = this.svg.getBoundingClientRect();
      const z = Math.max(0.08, Math.min(6, this.view.z * Math.exp(-e.deltaY * 0.0022)));
      const k = z / this.view.z;
      const px = e.clientX - r.left, py = e.clientY - r.top;
      this.view = { z, x: px - (px - this.view.x) * k, y: py - (py - this.view.y) * k };
    } else { this.view.x -= e.deltaX; this.view.y -= e.deltaY; }
    this.applyView();
  }

  // ------------------------------------------------------------------ picking
  /** Ports near a screen point, nearest first: [{devId, dev, port, d, sx, sy}]. */
  portsNear(x, y, px = 30, filter) {
    const out = [];
    const [wx, wy] = this.toWorld(x, y);
    const z = this.view.z;
    for (const d of this.devs.values()) {
      if (wx < d.x - px / z - 30 || wx > d.x + d.sym.w + px / z + 30 || wy < d.y - px / z - 30 || wy > d.y + d.sym.h + px / z + 30) continue;
      for (const sl of d.sym.slots.values()) {
        if (filter && !filter(d.dev, sl.port)) continue;
        const dist = Math.hypot((d.x + sl.x - wx) * z, (d.y + sl.y - wy) * z);
        if (dist <= px) { const [sx, sy] = this.toScreen(d.x + sl.x, d.y + sl.y); out.push({ devId: d.dev.id, dev: d.dev, port: sl.port, d: dist, sx, sy }); }
      }
    }
    return out.sort((a, b) => a.d - b.d);
  }

  pickControl(x, y) {
    const [wx, wy] = this.toWorld(x, y);
    const pad = 4 / this.view.z;
    for (const d of this.devs.values()) {
      for (const c of d.controls) {
        if (wx < d.x + c.x0 - pad || wx > d.x + c.x1 + pad || wy < d.y + c.y0 - pad || wy > d.y + c.y1 + pad) continue;
        const out = { ...c };
        if (c.screen) out.uv = { x: Math.max(0, Math.min(1, (wx - d.x - c.screen.x) / c.screen.w)), y: 1 - Math.max(0, Math.min(1, (wy - d.y - c.screen.y) / c.screen.h)) };
        return out;
      }
    }
    return null;
  }

  pickDevice(x, y) {
    const [wx, wy] = this.toWorld(x, y);
    for (const d of this.devs.values()) if (wx >= d.x && wx <= d.x + d.sym.w && wy >= d.y && wy <= d.y + d.sym.h) return d.dev.id;
    return null;
  }

  pickCable(x, y, px = 16) {
    let best = null, bd = px;
    for (const [id, w] of this.wireEls) {
      const pts = w.pts.map(([a, b]) => this.toScreen(a, b));
      for (let i = 0; i < pts.length - 1; i++) {
        const d = segDist(x, y, pts[i], pts[i + 1]);
        if (d < bd) { bd = d; best = id; }
      }
    }
    return best;
  }

  /** Devices and cables caught by a selection rectangle (client px). */
  itemsInRect(rect, mode) {
    const devs = [], conns = [];
    for (const d of this.devs.values()) {
      const [x0, y0] = this.toScreen(d.x, d.y), [x1, y1] = this.toScreen(d.x + d.sym.w, d.y + d.sym.h);
      if (boxInSelection(rect, { x0, y0, x1, y1 }, mode)) devs.push(d.dev.id);
    }
    for (const [id, w] of this.wireEls) if (polylineInSelection(rect, w.pts.map(([a, b]) => this.toScreen(a, b)), mode)) conns.push(id);
    return { devs, conns };
  }

  modelOf(id) { const d = this.devs.get(id); return d && d.sym.press ? { press: (k) => d.sym.press(k) } : null; }

  // ------------------------------------------------------------------ markers + selection
  setMarkers(list) { this.markers = list || []; this.drawMarkers(); }

  drawMarkers() {
    this.layerOver.querySelectorAll('.sm').forEach((m) => m.remove());
    for (const it of this.markers) {
      const d = this.devs.get(it.devId);
      const sl = d && d.sym.slots.get(it.portId);
      if (!sl) continue;
      el('circle', { class: 'sm' + (it.pulse ? ' pulse' : ''), cx: d.x + sl.x, cy: d.y + sl.y, r: sl.port.kind === 'comm' ? 16 : 10, stroke: it.color || '#34d399' }, this.layerOver);
    }
  }

  selectDevice(id) { this.sel.devs = new Set(id ? [id] : []); this.applySelection(); }
  selectCable(id) { this.sel.conns = new Set(id ? [id] : []); this.applySelection(); }
  selectMany(devs = [], conns = []) { this.sel = { devs: new Set(devs), conns: new Set(conns) }; this.applySelection(); }

  applySelection() {
    this.layerOver.querySelectorAll('.ssel').forEach((m) => m.remove());
    for (const id of this.sel.devs) {
      const d = this.devs.get(id);
      if (d) el('rect', { class: 'ssel', x: d.x - 7, y: d.y - 7, width: d.sym.w + 14, height: d.sym.h + 14, rx: 14 }, this.layerOver);
    }
    for (const [id, w] of this.wireEls) w.g.classList.toggle('selected', this.sel.conns.has(id));
  }

  // ------------------------------------------------------------------ images
  thumbnail(dev) { return deviceThumbnail(dev); }

  /** Small JPEG of the whole schematic (for the lab list). */
  snapshot(w = 240, h = 150) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#0a1226'; g.fillRect(0, 0, w, h);
    const b = this.layout ? this.layout.box : { x0: 0, y0: 0, x1: 1, y1: 1 };
    const k = Math.min((w - 16) / (b.x1 - b.x0 || 1), (h - 16) / (b.y1 - b.y0 || 1));
    const ox = (w - (b.x1 - b.x0) * k) / 2 - b.x0 * k, oy = (h - (b.y1 - b.y0) * k) / 2 - b.y0 * k;
    g.lineWidth = Math.max(0.8, 2.2 * k);
    for (const wr of this.wireEls.values()) {
      g.strokeStyle = wr.conn.comm ? '#64748b' : wr.conn.color === 'pe' ? '#2f9e44' : wr.conn.color || '#f97316';
      g.beginPath();
      wr.pts.forEach(([x, y], i) => (i ? g.lineTo(ox + x * k, oy + y * k) : g.moveTo(ox + x * k, oy + y * k)));
      g.stroke();
    }
    for (const d of this.devs.values()) {
      g.fillStyle = '#1b2438'; g.strokeStyle = CAT_COLOR[DEVICE_DEFS[d.dev.type].category] || '#64748b';
      g.lineWidth = 1;
      g.beginPath(); g.rect(ox + d.x * k, oy + d.y * k, d.sym.w * k, d.sym.h * k); g.fill(); g.stroke();
    }
    return c.toDataURL('image/jpeg', 0.72);
  }
}

/** SVG data URL of one device symbol (device library, settings sheet). */
export function deviceThumbnail(dev) {
  const sym = symbolFor(dev);
  const pad = 14;
  const svg = el('svg', { xmlns: SVGNS, viewBox: `${-pad} ${-pad} ${sym.w + pad * 2} ${sym.h + pad * 2}`, width: sym.w + pad * 2, height: sym.h + pad * 2 });
  el('style', {}, svg, THUMB_CSS);
  drawDevice(el('g', {}, svg), sym);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
}

function segDist(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

// styles embedded in device thumbnails (the live view uses plc.css)
const THUMB_CSS = `
.sd-body{fill:#18223a;stroke:#3a4a6b;stroke-width:1.5}.sd-term{fill:#cbd5e1;stroke:#64748b}.sd-term.sock{fill:#111827;stroke:#94a3b8}
.sd-comm{fill:#0b1222;stroke-width:2}text{font-family:Inter,system-ui,sans-serif;text-anchor:middle;fill:#cbd5e1}
.sd-tlabel{font-size:9px;font-weight:700;fill:#94a3b8}.sd-title{font-size:15px;font-weight:800;fill:#e2e8f0}.sd-title.big{font-size:22px}
.sd-sub{font-size:9px;fill:#64748b}.sd-mini{font-size:8px;font-weight:700;fill:#94a3b8}.sd-mini.l{text-anchor:start}.sd-label{font-size:11px;font-weight:800;fill:#e2e8f0}
.sd-led{fill:#1f2937;stroke:#0b1222}.sd-well,.sd-bezel{fill:#0b1222;stroke:#334155}.sd-knob,.sd-lever{fill:#cbd5e1}.sd-bezelr{fill:#9ca3af;stroke:#475569}
.sd-lcd{fill:#1a0505;stroke:#3f1d1d}.sd-key{fill:#4a505b}.sd-key-t{font-size:9px;font-weight:800;fill:#fff}.sd-screen-edge{fill:#020305;stroke:#1e293b}
.sd-motor{fill:#475569;stroke:#94a3b8;stroke-width:2}.sd-motor-in{fill:#334155}.sd-fan line{stroke:#94a3b8;stroke-width:4}.sd-glow{opacity:0}.sd-lens{opacity:.45}
.sd-wave{fill:none}.sd-target{fill:#8892a0;opacity:.35}.sd-knobc{fill:#111827;stroke:#64748b}.sd-ptr{stroke:#fff;stroke-width:2.5}.sd-state{font-size:12px;font-weight:800}
.sd-mini.r{text-anchor:end}.sd-plcface{fill:#121418;stroke:#2c3038;stroke-width:2}.sd-plcslide{fill:#d03a33}.sd-plcdin{fill:#08090b;stroke:#3a3e45;stroke-width:3}.sd-plcpin{fill:#9aa1ab}
.sd-plclogo,.sd-plcmodel,.sd-plcspec{text-anchor:start;fill:#eef0f2;font-weight:800}.sd-plclogo{font-size:15px}.sd-plcmodel{font-size:19px}.sd-plcspec{font-size:9px}.sd-plcbox{fill:none;stroke:#cbd5e1}
.sd-plcbadge{fill:#f4f5f6}.sd-plcbadge-t{font-size:13px;font-weight:800;fill:#111}
.sd-kpface{fill:#111316;stroke:#2c2f34;stroke-width:3}.sd-dial{fill:#2a2c30;stroke:#000}.sd-dial-arc{fill:none;stroke:#eef1f5;stroke-width:2.4;stroke-dasharray:5 3}.sd-dial-mark{stroke:#9aa0a8;stroke-width:2.4}`;
