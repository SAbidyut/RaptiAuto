// What the communication of a lab looks like: the RS-485 lines in the order the cable runs (for the
// Monitor → Network tab), the state of every station from the comm log, and the pin-outs of the
// connectors (for the connection sheet of a comm cable).
import { DEVICE_DEFS, deviceProps, findPort } from '../devices/defs.js';
import { mbStation, mbFormat } from '../sim/mbdevices.js';
import { vfdFormat, defaultParams } from '../sim/vfd.js';
import { fmtName } from '../sim/modbus.js';
import { plcName } from '../store.js';

const keyOf = (dev, port) => dev + '|' + port;

/**
 * Comm lines of a project: [{bus, nodes: [{dev, port, key, ends}], links}] with the nodes in cable
 * order (from the PLC end when there is one), and `ends` true for the two ends of the line.
 */
export function commLines(P) {
  const adj = new Map();
  const links = [];
  for (const c of P.conns) {
    if (!c.comm) continue;
    const da = P.devices.find((d) => d.id === c.a.dev);
    const pa = da && findPort(da, c.a.port);
    if (!pa) continue;
    const a = keyOf(c.a.dev, c.a.port), b = keyOf(c.b.dev, c.b.port);
    links.push({ conn: c, bus: pa.bus, a, b });
    for (const [x, y] of [[a, b], [b, a]]) { if (!adj.has(x)) adj.set(x, []); adj.get(x).push({ other: y, conn: c }); }
  }
  const seen = new Set(), out = [];
  const isPlc = (k) => DEVICE_DEFS[P.devices.find((d) => d.id === k.split('|')[0]).type].sim === 'plc';
  for (const l of links) {
    if (seen.has(l.a)) continue;
    // the whole line, then walk it from an end (a PLC end first)
    const comp = [];
    const stack = [l.a];
    seen.add(l.a);
    while (stack.length) { const k = stack.pop(); comp.push(k); for (const e of adj.get(k)) if (!seen.has(e.other)) { seen.add(e.other); stack.push(e.other); } }
    const ends = comp.filter((k) => adj.get(k).length === 1);
    const start = ends.find(isPlc) || comp.find(isPlc) || ends[0] || comp[0];
    const order = [start], dist = new Map([[start, 0]]);
    for (let i = 0; i < order.length; i++) for (const e of adj.get(order[i])) if (!dist.has(e.other)) { dist.set(e.other, dist.get(order[i]) + 1); order.push(e.other); }
    out.push({
      bus: l.bus,
      links: links.filter((x) => comp.includes(x.a)),
      nodes: order.map((k) => { const [dev, port] = k.split('|'); return { key: k, dev: P.devices.find((d) => d.id === dev), port, end: adj.get(k).length === 1 }; }),
    });
  }
  return out;
}

/** Station address and serial format a device is set to (null for a PLC master, HMI, laptop). */
export function stationInfo(P, dev, sys = null) {
  const def = DEVICE_DEFS[dev.type];
  const rt = sys && sys.rts.get(dev.id);
  if (def.sim === 'vfd') {
    const p = { ...defaultParams(), ...((rt && rt.vfd.params) || dev.state.params || {}) };
    return { station: p['09-00'], fmt: fmtName(vfdFormat(p)), where: 'Pr.09-00 / 09-01 / 09-04' };
  }
  if (rt && rt.mb) return { station: rt.mb.station, fmt: fmtName(rt.mb.format()), where: 'device settings' };
  if (['tc', 'mbth', 'meter'].includes(def.sim)) { const pr = deviceProps(dev); return { station: mbStation(pr), fmt: fmtName(mbFormat(pr)), where: 'device settings' }; }
  if (def.sim === 'plc') {
    const cpu = rt && rt.cpu && rt.cpu.powered ? rt.cpu : null;
    return { station: cpu ? cpu.D[1121] || 1 : null, fmt: cpu ? fmtName(cpu.com2Format()) : '—', where: 'D1121 / D1120 + M1143', master: !!(cpu && cpu.mbReq.size) };
  }
  return { station: null, fmt: '', where: '' };
}

/** Name of a device for the network lists. */
export function netName(P, dev) {
  const def = DEVICE_DEFS[dev.type];
  if (def.sim === 'plc') return `${plcName(P, dev)} · ${def.short}`;
  const l = deviceProps(dev).label;
  return def.category === 'modbus' && l ? `${def.short} ${l}` : def.short;
}

/** Last request / reply / error of a device from the comm log (sim seconds). */
export function stationState(sys, devId) {
  const st = { req: -1, rep: -1, err: -1, lastInfo: '', lastErr: '', data: '' };
  if (!sys) return st;
  for (let i = sys.log.length - 1; i >= 0 && (st.req < 0 || st.rep < 0 || st.err < 0 || !st.data); i--) {
    const l = sys.log[i];
    if (!l.ids) continue;
    if (l.dir === 'TX' && l.ids.to === devId && st.req < 0) st.req = l.t;
    if (l.dir === 'RX' && l.ids.from === devId) {
      if (st.rep < 0) { st.rep = l.t; st.lastInfo = l.info; }
      // the last reply that carried values is more telling than a write's "OK"
      if (!st.data && l.info && l.info !== 'OK' && !/^Echo/.test(l.info)) st.data = l.info;
    }
    if (l.dir === 'ERR' && (l.ids.from === devId) && st.err < 0) { st.err = l.t; st.lastErr = l.info; }
  }
  return st;
}

// ------------------------------------------------------------------ connector pin-outs
/**
 * Pins of a comm port: [{pin, sig, role}], role ∈ D+ D− GND TX RX VBUS ... (used to draw the wires).
 * Numbers only where the manuals give them; screw terminals show their printed names.
 */
export function pinsOf(dev, port) {
  const p = findPort(dev, port);
  if (!p) return { title: port, pins: [] };
  if (p.conn === 'term3') return { title: `${port} · screw terminals`, face: 'terms', pins: [{ pin: 'D+', role: 'D+' }, { pin: 'D−', role: 'D−' }, { pin: 'SG', role: 'GND', note: 'signal ground' }] };
  if (p.conn === 'term2') { const [a, b] = p.pins || ['D+', 'D−']; return { title: 'RS-485 terminals', face: 'terms', pins: [{ pin: a, role: 'D+' }, { pin: b, role: 'D−' }] }; }
  if (p.conn === 'rj45') {
    return {
      title: 'RJ45 · RS-485', face: 'rj45', pins: [
        { pin: '1', sig: 'reserved' }, { pin: '2', sig: 'reserved' }, { pin: '3', sig: 'GND', role: 'GND' }, { pin: '4', sig: 'SG−', role: 'D−' },
        { pin: '5', sig: 'SG+', role: 'D+' }, { pin: '6', sig: 'reserved' }, { pin: '7', sig: 'GND' }, { pin: '8', sig: '+10VS (keypad)' },
      ],
    };
  }
  if (p.conn === 'minidin') return { title: 'COM1 · mini-DIN 8', face: 'minidin', pins: [{ pin: '4', sig: 'RX', role: 'RX' }, { pin: '5', sig: 'TX', role: 'TX' }, { pin: '8', sig: 'GND', role: 'GND' }] };
  if (p.conn === 'db9' && p.bus === 'rs232') return { title: `${port} · D-sub 9`, face: 'db9', pins: [{ pin: '2', sig: 'RXD', role: 'RX' }, { pin: '3', sig: 'TXD', role: 'TX' }, { pin: '5', sig: 'GND', role: 'GND' }] };
  if (p.conn === 'db9') return { title: `${port} · D-sub 9`, face: 'db9', pins: [{ pin: '·', sig: 'D+', role: 'D+' }, { pin: '·', sig: 'D−', role: 'D−' }, { pin: '·', sig: 'GND', role: 'GND' }], note: 'pin numbers: see the DOP manual' };
  if (p.conn === 'usbmini' || p.conn === 'usba') return { title: p.conn === 'usba' ? 'USB-A' : 'mini-USB', face: 'usb', pins: [{ pin: '1', sig: 'VBUS 5 V', role: 'VBUS' }, { pin: '2', sig: 'D−', role: 'UD−' }, { pin: '3', sig: 'D+', role: 'UD+' }, { pin: p.conn === 'usba' ? '4' : '5', sig: 'GND', role: 'GND' }] };
  return { title: port, pins: [] };
}

/** Wires of a cable between two ports: [{a: pin of A, b: pin of B, role, color}]. RS-232 crosses TX and RX. */
export function cableWires(pa, pb) {
  const COL = { 'D+': '#f8fafc', 'D−': '#3b82f6', GND: '#64748b', TX: '#f59e0b', RX: '#22c55e', VBUS: '#ef4444', 'UD+': '#22c55e', 'UD−': '#f8fafc' };
  const out = [];
  const find = (list, role) => list.find((x) => x.role === role);
  for (const x of pa.pins) {
    if (!x.role) continue;
    const want = x.role === 'TX' ? 'RX' : x.role === 'RX' ? 'TX' : x.role;
    const y = find(pb.pins, want);
    if (y) out.push({ a: x, b: y, role: x.role, color: COL[x.role] || '#94a3b8' });
  }
  return out;
}

/** Rules of thumb for the bus. */
export const BUS_FACTS = {
  rs485: ['Two-wire differential bus (D+ / D−, also called A / B), twisted pair, half duplex: one master asks, one slave answers at a time.', 'Daisy chain from device to device — no stubs, no star. Up to 32 devices (unit loads) and about 1200 m at 9600 bps.', 'A 120 Ω resistor across D+ / D− at both ends of the line stops reflections on long cables.', 'Every slave needs its own station address (1–247); all devices the same baud rate, data format and RTU / ASCII.', 'Join SG (signal ground) where there is a terminal; connect the cable shield to earth at one end only.'],
  rs232: ['Point to point: one device to one device, up to about 15 m.', 'TX of one side goes to RX of the other (crossed), plus GND.', 'Delta DVP COM1 / DOP COM1: the HMI polls the PLC with the Delta DVP protocol (Modbus ASCII 9600 7E1, station = D1121).'],
  usb: ['The programming link of ISPSoft: download, upload and online monitoring.', 'USB cables up to 5 m; the laptop is the host, the PLC the device.'],
};

