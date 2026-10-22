// Fault finding, the simulation side: the faults a lab can hide (a broken wire, a burnt lamp, an
// open coil, a damaged PLC input …) and the multimeter's readings between two terminals — V AC / DC
// from the running simulation, Ω and continuity from the lab with the power off.
import { DEVICE_DEFS, devicePorts, deviceProps, findPort } from '../devices/defs.js';
import { motorSpec } from './motors.js';

const oct = (k) => k.toString(8);

// ====================================================================== the hidden faults
/** Is this terminal wired? */
const wired = (P, dev, port) => P.conns.some((c) => !c.comm && ((c.a.dev === dev && c.a.port === port) || (c.b.dev === dev && c.b.port === port)));

/**
 * Every fault this lab could have: {kind, dev?, conn?, k?, port?, label, hint}. Only parts that are
 * wired are candidates, so a fault always sits in a circuit that is in use.
 */
export function faultCandidates(P, name = (d) => d.id) {
  const out = [];
  const byId = new Map(P.devices.map((d) => [d.id, d]));
  for (const c of P.conns) {
    if (c.comm || c.color === 'pe') continue;
    const da = byId.get(c.a.dev), db = byId.get(c.b.dev);
    const pa = findPort(da, c.a.port), pb = findPort(db, c.b.port);
    if (!pa || !pb || pa.sig === 'PE' || pb.sig === 'PE') continue;
    out.push({ kind: 'wire', conn: c.id, label: `Broken wire: ${name(da)} ${pa.label} → ${name(db)} ${pb.label}`, hint: 'a wire' });
  }
  for (const d of P.devices) {
    const def = DEVICE_DEFS[d.type], id = d.id, w = (p) => wired(P, id, p), nm = name(d);
    const add = (o) => out.push({ dev: id, ...o, label: `${nm}: ${o.label}` });
    switch (def.sim) {
      case 'lamp': if (w('X1') && w('X2')) add({ kind: 'lamp', label: 'lamp burnt out', hint: 'a pilot lamp' }); break;
      case 'pb': case 'estop': case 'selector': case 'selector3': if (devicePorts(d).some((p) => w(p.id))) add({ kind: 'contact', label: 'contact worn out (never closes)', hint: 'a button or switch' }); break;
      case 'limit': if (w('13') && w('14')) add({ kind: 'contact', label: 'NO contact worn out', hint: 'a limit switch' }); break;
      case 'prox': case 'atx': if (w('BK')) add({ kind: 'sensor', label: 'sensor faulty (no output)', hint: 'a sensor' }); break;
      case 'contactor':
        if (w('A1') && w('A2')) add({ kind: 'coil', label: 'coil open (burnt)', hint: 'a contactor' });
        for (const k of [1, 2, 3]) if (w('L' + k) && w('T' + k)) add({ kind: 'pole', k, label: `main contact ${k} burnt (${['1–2', '3–4', '5–6'][k - 1]} stays open)`, hint: 'a contactor' });
        break;
      case 'relay': if (w('A1') && w('A2')) add({ kind: 'coil', label: 'coil open', hint: 'an interface relay' }); break;
      case 'olr': if (w('95') && w('96')) add({ kind: 'olr', label: 'NC contact 95–96 open', hint: 'the overload relay' }); break;
      case 'cb': if (devicePorts(d).every((p) => w(p.id))) add({ kind: 'cb', label: 'breaker open inside (lever ON, no contact)', hint: 'a circuit breaker' }); break;
      case 'psu': if (w('L') && (w('+V1') || w('+V2'))) add({ kind: 'psu', label: 'no 24 V output (internal fuse blown)', hint: 'the 24 V supply' }); break;
      case 'plc':
        for (let k = 0; k < def.model.inputs; k++) if (w('X' + oct(k))) add({ kind: 'xin', k, label: `input X${oct(k)} damaged (LED stays off)`, hint: 'the PLC' });
        for (let k = 0; k < def.model.outputs; k++) if (w('Y' + oct(k))) add({ kind: 'yout', k, label: `output Y${oct(k)} does not switch (LED on, contact open)`, hint: 'the PLC' });
        break;
      case 'motor': case 'motor6': {
        const spec = motorSpec(def.sim, deviceProps(d));
        spec.windings.forEach(([a, b], k) => { if ((a === '*' || w(a) || def.sim === 'motor6') && (b === '*' || w(b) || def.sim === 'motor6')) add({ kind: 'winding', k, label: `winding ${a}–${b === '*' ? 'star' : b} open`, hint: 'the motor' }); });
        break;
      }
      case 'conveyor':
        for (const s of ['S1', 'S2', 'S3', 'S4']) if (w(s)) add({ kind: 'sensor', port: s, label: `sensor ${s} faulty`, hint: 'a conveyor sensor' });
        if (w('Y1')) add({ kind: 'coil', port: 'Y1', label: 'pusher valve coil open', hint: 'the conveyor' });
        break;
      case 'cyl':
        for (const s of ['B1', 'B2']) if (w(s)) add({ kind: 'sensor', port: s, label: `reed sensor ${s} faulty`, hint: 'a cylinder' });
        for (const y of ['Y1', 'Y2']) if (w(y)) add({ kind: 'coil', port: y, label: `valve coil ${y} open`, hint: 'a cylinder' });
        break;
      case 'tank':
        for (const s of ['LL', 'LH', 'LT']) if (w(s)) add({ kind: 'sensor', port: s, label: s === 'LT' ? 'level transmitter: no signal' : `float switch ${s} stuck open`, hint: 'the tank' });
        if (w('P+') && w('P-')) add({ kind: 'coil', port: 'P', label: 'pump motor open', hint: 'the tank' });
        if (w('V+') && w('V-')) add({ kind: 'coil', port: 'V', label: 'drain valve coil open', hint: 'the tank' });
        break;
      default: break;
    }
  }
  return out;
}

export const sameFault = (a, b) => a.kind === b.kind && (a.conn || null) === (b.conn || null) && (a.dev || null) === (b.dev || null) && (a.k ?? null) === (b.k ?? null) && (a.port || null) === (b.port || null);

/** Pick n random faults (a wire about half of the time), never two in the same part. */
export function pickFaults(cands, n = 1, rnd = Math.random) {
  const out = [];
  for (let tries = 0; out.length < n && tries < 50; tries++) {
    const wires = cands.filter((c) => c.kind === 'wire'), parts = cands.filter((c) => c.kind !== 'wire');
    const pool = (rnd() < 0.45 && wires.length) || !parts.length ? wires : parts;
    if (!pool.length) break;
    const f = pool[Math.floor(rnd() * pool.length)];
    if (out.some((o) => (o.dev && o.dev === f.dev) || (o.conn && o.conn === f.conn))) continue;
    out.push(f);
  }
  return out;
}

// ====================================================================== the multimeter
/** Resistance of the parts between two terminals (Ω) — coils, lamps, windings, PLC inputs. */
function resistors(P, F) {
  const out = [];
  const add = (dev, a, b, ohm) => out.push({ dev, a, b, ohm });
  for (const d of P.devices) {
    const def = DEVICE_DEFS[d.type], id = d.id, f = F.dev.get(id) || {};
    switch (def.sim) {
      case 'contactor': if (!f.coil) add(id, 'A1', 'A2', deviceProps(d).coil === '230AC' ? 650 : 62); break;
      case 'relay': if (!f.coil) add(id, 'A1', 'A2', 1440); break;
      case 'lamp': if (!f.lamp) add(id, 'X1', 'X2', 2200); break;
      case 'buzzer': add(id, '+', '-', 1100); break;
      case 'plc': for (let k = 0; k < def.model.inputs; k++) add(id, 'X' + oct(k), 'S/S', 4700); break;
      case 'vfd': for (let k = 1; k <= 7; k++) add(id, 'MI' + k, 'DCM', 4700); break;
      case 'motor': case 'motor6': case 'conveyor': {
        const spec = motorSpec(def.sim, deviceProps(d));
        const ohm = def.sim === 'motor6' ? 12.4 : def.sim === 'motor' ? 9.6 : 58;
        spec.windings.forEach(([a, b], k) => { if (f.winding !== k) add(id, a, b, ohm); });
        if (def.sim === 'conveyor' && f.coil !== 'Y1' && f.coil !== true) add(id, 'Y1', '0V', 48);
        break;
      }
      case 'cyl': for (const y of ['Y1', 'Y2']) if (f.coil !== y && findPort(d, y)) add(id, y, '0V', 48); break;
      case 'tank': if (f.coil !== 'P') add(id, 'P+', 'P-', 6.5); if (f.coil !== 'V') add(id, 'V+', 'V-', 48); break;
      default: break;
    }
  }
  return out;
}

/** Equivalent resistance between two nets (node analysis), Infinity when nothing joins them. */
function resistanceBetween(sys, a, b) {
  const node = (dev, port) => (port === '*' ? 'star:' + dev : sys.find(sys.node(dev, port)));
  const ra = node(a.dev, a.port), rb = node(b.dev, b.port);
  if (ra === rb) return 0;
  const edges = resistors(sys.project, sys.faultMap()).map((r) => ({ u: node(r.dev, r.a), v: node(r.dev, r.b), g: 1 / r.ohm })).filter((e) => e.u !== e.v);
  // nodes reachable from a
  const adj = new Map();
  for (const e of edges) { for (const [x, y] of [[e.u, e.v], [e.v, e.u]]) { if (!adj.has(x)) adj.set(x, []); adj.get(x).push(y); } }
  const seen = new Set([ra]), q = [ra];
  while (q.length) { const x = q.pop(); for (const y of adj.get(x) || []) if (!seen.has(y)) { seen.add(y); q.push(y); } }
  if (!seen.has(rb)) return Infinity;
  const nodes = [...seen].filter((x) => x !== rb), idx = new Map(nodes.map((x, i) => [x, i])), n = nodes.length;
  const G = Array.from({ length: n }, () => new Float64Array(n + 1));
  for (const e of edges) {
    if (!seen.has(e.u)) continue;
    const i = idx.get(e.u), j = idx.get(e.v);
    if (i !== undefined) G[i][i] += e.g;
    if (j !== undefined) G[j][j] += e.g;
    if (i !== undefined && j !== undefined) { G[i][j] -= e.g; G[j][i] -= e.g; }
  }
  G[idx.get(ra)][n] = 1; // 1 A into a, b is the reference
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(G[r][c]) > Math.abs(G[p][c])) p = r;
    [G[c], G[p]] = [G[p], G[c]];
    const d = G[c][c];
    if (Math.abs(d) < 1e-12) continue;
    for (let r = 0; r < n; r++) { if (r === c) continue; const k = G[r][c] / d; if (k) for (let x = c; x <= n; x++) G[r][x] -= k * G[c][x]; }
  }
  const i = idx.get(ra);
  return G[i][i] ? G[i][n] / G[i][i] : Infinity;
}

const fmtOhm = (r) => (r < 1 ? r.toFixed(2) : r < 1000 ? r.toFixed(1) : r < 1e6 ? (r / 1000).toFixed(2) + ' k' : (r / 1e6).toFixed(2) + ' M');

/** Is any supply of the lab switched on? */
const powered = (sys) => !!sys && [...sys.byKind('mcb'), ...sys.byKind('mains3')].some((m) => m.dev.state.on);

/**
 * Reading between two probes a, b = {dev, port}. mode 'V' (auto AC / DC) or 'R' (Ω / continuity).
 * dead() gives a system without power for Ω while the simulation is stopped.
 */
export function measure(P, sys, mode, a, b, dead) {
  if (!a || !b) return { text: mode === 'V' ? '0.0' : 'OL', unit: mode === 'V' ? 'V' : 'Ω', sub: a ? 'Now tap the second terminal (black probe, COM)' : 'Tap a terminal for the red probe' };
  if (mode === 'V') {
    if (!sys) return { text: '0.0', unit: 'V', sub: 'Simulation stopped — no power. Press Simulate.' };
    const r = sys.diff(a.dev, a.port, b.dev, b.port);
    if (!r || r.same) return { text: '0.0', unit: 'V', sub: r && r.same ? 'Both probes on the same conductor' : 'No voltage between these points' };
    if (r.ac) return { text: Math.abs(r.d).toFixed(0), unit: 'V~', sub: 'AC voltage' };
    return { text: (Math.abs(r.d) < 0.05 ? 0 : r.d).toFixed(1), unit: 'V⎓', sub: 'DC voltage' };
  }
  if (powered(sys)) return { text: 'LIVE', unit: 'Ω', warn: true, sub: 'Switch the supply OFF (MCB / main breaker) before measuring resistance' };
  const net = sys || dead();
  const R = resistanceBetween(net, a, b);
  if (!Number.isFinite(R) || R > 4e7) return { text: 'OL', unit: 'Ω', sub: 'Open circuit — no connection' };
  if (R < 1) return { text: fmtOhm(R), unit: 'Ω', beep: true, sub: 'Continuity ♪' };
  return { text: fmtOhm(R).replace(/ [kM]$/, ''), unit: (/ k$/.test(fmtOhm(R)) ? 'kΩ' : / M$/.test(fmtOhm(R)) ? 'MΩ' : 'Ω'), sub: R < 200 ? 'Low resistance (a coil, a winding)' : 'Resistance' };
}
