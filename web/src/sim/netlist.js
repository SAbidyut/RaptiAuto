// Builds electrical nets from parts, wires, internal connections and plugged-in pins.
import { getDef, pinsOf, toWorld } from '../components/registry.js';

class DSU {
  constructor() { this.parent = new Map(); }
  find(x) {
    let p = this.parent.get(x);
    if (p === undefined) { this.parent.set(x, x); return x; }
    if (p === x) return x;
    let root = p;
    while (this.parent.get(root) !== root) root = this.parent.get(root);
    let cur = x;
    while (cur !== root) { const nx = this.parent.get(cur); this.parent.set(cur, root); cur = nx; }
    return root;
  }
  union(a, b) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export const pinKey = (partId, pinId) => partId + ':' + pinId;

/**
 * @returns {{nets: Array<{id:number, pins:string[]}>, netOf: Map<string, number>, plugged: Array<[string,string]>}}
 */
export function buildNetlist(project) {
  const dsu = new DSU();
  const pos = new Map(); // "x,y" -> [keys]
  const parts = project.parts;
  const partById = new Map(parts.map((p) => [p.id, p]));
  for (const part of parts) {
    const def = getDef(part.type);
    if (!def) continue;
    const pins = pinsOf(part);
    for (const pin of pins) {
      const key = pinKey(part.id, pin.id);
      dsu.find(key);
      if (pin.noPlug) continue;
      const [wx, wy] = toWorld(part, pin.x, pin.y);
      const pk = Math.round(wx) + ',' + Math.round(wy);
      let list = pos.get(pk);
      if (!list) { list = []; pos.set(pk, list); }
      list.push({ key, part: part.id, socket: !!(pin.socket || def.socket) });
    }
    if (def.internal) {
      const groups = typeof def.internal === 'function' ? def.internal(part.props || {}) : def.internal;
      for (const g of groups) for (let i = 1; i < g.length; i++) dsu.union(pinKey(part.id, g[0]), pinKey(part.id, g[i]));
    }
  }
  // plugged pins: pins of different parts at the same spot (legs into breadboard / header sockets)
  const plugged = [];
  for (const list of pos.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.part === b.part) continue;
        dsu.union(a.key, b.key);
        plugged.push([a.key, b.key]);
      }
    }
  }
  for (const w of project.wires) {
    if (!partById.has(w.from.part) || !partById.has(w.to.part)) continue;
    dsu.union(pinKey(w.from.part, w.from.pin), pinKey(w.to.part, w.to.pin));
  }
  const rootToNet = new Map();
  const nets = [];
  const netOf = new Map();
  for (const key of dsu.parent.keys()) {
    const r = dsu.find(key);
    let id = rootToNet.get(r);
    if (id === undefined) {
      id = nets.length;
      rootToNet.set(r, id);
      nets.push({ id, pins: [] });
    }
    nets[id].pins.push(key);
    netOf.set(key, id);
  }
  return { nets, netOf, plugged };
}

/** Which pins are plugged into something (for drawing connection dots in the editor). */
export function pluggedPins(project) {
  const { plugged } = buildNetlist(project);
  const s = new Set();
  for (const [a, b] of plugged) { s.add(a); s.add(b); }
  return s;
}
