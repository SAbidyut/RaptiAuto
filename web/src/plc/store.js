// PLC lab projects: persistence (localStorage), factory helpers and the connection builder.
import { normalizeProgram, createProgram } from './sim/ladder.js';
import { normalizeHmi } from './sim/hmi.js';
import { DEVICE_DEFS, PLC_PORT_RENAMES, findPort, wireColorFor } from './devices/defs.js';

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
  for (const d of p.devices) {
    d.id = d.id || labId(); d.props = d.props || {}; d.state = d.state || {};
    for (const k of ['label', 'pos0', 'pos1']) if (typeof d.props[k] === 'string') d.props[k] = d.props[k].slice(0, 16);
  }
  const ids = new Set(p.devices.map((d) => d.id));
  p.conns = (Array.isArray(p.conns) ? p.conns : []).filter((c) => c && c.a && c.b && ids.has(c.a.dev) && ids.has(c.b.dev));
  // terminals renamed to the names printed on the real PLC (RaptiAuto 2.10); drop wires to terminals that no longer exist
  const byId = new Map(p.devices.map((d) => [d.id, d]));
  for (const c of p.conns) for (const e of [c.a, c.b]) {
    const ren = PLC_PORT_RENAMES[byId.get(e.dev).type];
    if (ren && ren[e.port]) e.port = ren[e.port];
  }
  p.conns = p.conns.filter((c) => findPort(byId.get(c.a.dev), c.a.port) && findPort(byId.get(c.b.dev), c.b.port));
  for (const c of p.conns) c.id = c.id || labId('c');
  p.program = normalizeProgram(p.program || createProgram());
  p.hmi = normalizeHmi(p.hmi);
  p.plc = p.plc || { downloaded: null, latched: null };
  // labs with two PLCs keep the program of the PLC that is not being edited in p.plcs[devId]
  const plcIds = new Set(plcDevices(p).map((d) => d.id));
  if (p.activePlc && !plcIds.has(p.activePlc)) p.activePlc = null;
  const others = {};
  for (const [id, st] of Object.entries(p.plcs || {})) {
    if (!plcIds.has(id) || id === activePlcId(p) || !st) continue;
    others[id] = { program: normalizeProgram(st.program || createProgram()), plc: st.plc || { downloaded: null, latched: null } };
  }
  p.plcs = others;
  p.view = p.view || null;
  return p;
}

// ------------------------------------------------------------------ several PLCs
export const plcDevices = (p) => p.devices.filter((d) => DEVICE_DEFS[d.type] && DEVICE_DEFS[d.type].category === 'plc');

/** The PLC whose program is open in the Ladder tab (and that the laptop talks to). */
export function activePlcId(p) {
  const list = plcDevices(p);
  const d = list.find((x) => x.id === p.activePlc) || list[0];
  return d ? d.id : null;
}

/** {program, plc: {downloaded, latched}} of one PLC; the active PLC's live in the project itself. */
export function plcStore(p, id) {
  if (!id || id === activePlcId(p)) return p;
  p.plcs = p.plcs || {};
  if (!p.plcs[id]) p.plcs[id] = { program: createProgram(), plc: { downloaded: null, latched: null } };
  return p.plcs[id];
}

/** Make another PLC the active one: its program moves into p.program / p.plc. */
export function switchPlc(p, id) {
  const cur = activePlcId(p);
  if (!id || cur === id) return false;
  p.plcs = p.plcs || {};
  const next = p.plcs[id] || { program: createProgram(), plc: { downloaded: null, latched: null } };
  if (cur) p.plcs[cur] = { program: p.program, plc: p.plc };
  delete p.plcs[id];
  p.program = normalizeProgram(next.program);
  p.plc = next.plc || { downloaded: null, latched: null };
  p.activePlc = id;
  return true;
}

/** Display name of a PLC: its own name, or "PLC 1" / "PLC 2" when the lab has two. */
export function plcName(p, dev) {
  if (dev.props && dev.props.name) return dev.props.name;
  const list = plcDevices(p);
  return list.length > 1 ? 'PLC ' + (list.indexOf(dev) + 1) : 'PLC';
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
