// PLC lab projects: persistence (localStorage), factory helpers and the connection builder.
import { normalizeProgram, createProgram } from './sim/ladder.js';
import { normalizeHmi } from './sim/hmi.js';
import { DEVICE_DEFS, findPort, wireColorFor } from './devices/defs.js';

const INDEX = 'raptiauto.plc.index.v1';
const PKEY = (id) => 'raptiauto.plc.p.' + id;
const TKEY = (id) => 'raptiauto.plc.t.' + id;
const safe = (fn, fb) => { try { return fn(); } catch (e) { return fb; } };

let seq = 0;
export const labId = (p = 'd') => p + Date.now().toString(36).slice(-5) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);

export function listLabs() {
  const list = safe(() => JSON.parse(localStorage.getItem(INDEX) || '[]'), []);
  return Array.isArray(list) ? list.sort((a, b) => (b.updated || 0) - (a.updated || 0)) : [];
}

export function loadLab(id) {
  const p = safe(() => JSON.parse(localStorage.getItem(PKEY(id)) || 'null'), null);
  return p ? normalizeLab(p) : null;
}

export function saveLab(p) {
  p.updated = Date.now();
  const ok = safe(() => { localStorage.setItem(PKEY(p.id), JSON.stringify(p)); return true; }, false);
  const list = listLabs().filter((x) => x.id !== p.id);
  const plc = p.devices.find((d) => DEVICE_DEFS[d.type] && DEVICE_DEFS[d.type].category === 'plc');
  list.unshift({ id: p.id, name: p.name, plc: plc ? plc.type : null, updated: p.updated, devices: p.devices.length, rungs: p.program.rungs.length, example: p.fromExample || null });
  safe(() => localStorage.setItem(INDEX, JSON.stringify(list)));
  return ok;
}

export function labThumb(id) { return safe(() => localStorage.getItem(TKEY(id)), null); }
export function saveLabThumb(id, dataUrl) { safe(() => localStorage.setItem(TKEY(id), dataUrl)); }

export function deleteLab(id) {
  safe(() => localStorage.removeItem(PKEY(id)));
  safe(() => localStorage.removeItem(TKEY(id)));
  safe(() => localStorage.setItem(INDEX, JSON.stringify(listLabs().filter((x) => x.id !== id))));
}

export function normalizeLab(p) {
  p.kind = 'plclab';
  p.id = p.id || labId('lab');
  p.name = p.name || 'PLC lab';
  p.devices = Array.isArray(p.devices) ? p.devices.filter((d) => DEVICE_DEFS[d.type]) : [];
  for (const d of p.devices) { d.id = d.id || labId(); d.props = d.props || {}; d.state = d.state || {}; }
  const ids = new Set(p.devices.map((d) => d.id));
  p.conns = (Array.isArray(p.conns) ? p.conns : []).filter((c) => c && c.a && c.b && ids.has(c.a.dev) && ids.has(c.b.dev));
  for (const c of p.conns) c.id = c.id || labId('c');
  p.program = normalizeProgram(p.program || createProgram());
  p.hmi = normalizeHmi(p.hmi);
  p.plc = p.plc || { downloaded: null, latched: null };
  p.view = p.view || null;
  return p;
}

export function cloneLab(p, name) {
  const c = normalizeLab(JSON.parse(JSON.stringify(p)));
  c.id = labId('lab');
  c.name = name || p.name;
  c.created = Date.now();
  return c;
}

/** Build a connection between two device ports (wire or cable). */
export function makeConn(devices, a, ap, b, bp, color) {
  const da = devices.find((d) => d.id === a), db = devices.find((d) => d.id === b);
  if (!da || !db) throw new Error(`conn: unknown device ${!da ? a : b}`);
  const pa = findPort(da, ap), pb = findPort(db, bp);
  if (!pa || !pb) throw new Error(`conn: unknown port ${!pa ? a + '.' + ap : b + '.' + bp}`);
  const comm = pa.kind === 'comm';
  return { id: labId('c'), a: { dev: a, port: ap }, b: { dev: b, port: bp }, comm, color: color || (comm ? null : wireColorFor(pa.sig === 'PE' || pb.sig === 'PE' ? 'PE' : pa.sig || pb.sig)) };
}

export function exportLab(p) {
  return JSON.stringify({ format: 'raptiauto-plclab', version: 1, project: p }, null, 1);
}

export function importLab(text) {
  const data = JSON.parse(text);
  const proj = data && data.format === 'raptiauto-plclab' ? data.project : data;
  if (!proj || !Array.isArray(proj.devices)) throw new Error('Not a RaptiAuto PLC lab file');
  return cloneLab(normalizeLab(proj), proj.name || 'Imported lab');
}

/** Port counts in use (for the "max wires per terminal" rule). */
export function portUse(p, dev, port) {
  return p.conns.filter((c) => (c.a.dev === dev && c.a.port === port) || (c.b.dev === dev && c.b.port === port)).length;
}

export const MAX_WIRES = 3;
