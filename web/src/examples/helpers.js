// Helpers to lay out example circuits precisely on breadboards and headers.
import '../components/index.js';
import { pinsOf, toWorld, rotatePoint } from '../components/registry.js';

let uid = 0;
export function resetIds() { uid = 0; }

export function P(type, x, y, props = {}, rot = 0, id) {
  return { id: id || type.replace(/[^a-z0-9]/gi, '').slice(0, 6) + ++uid, type, x, y, rot, props };
}

export function holePos(host, pinId) {
  const pin = pinsOf(host).find((p) => p.id === pinId);
  if (!pin) throw new Error(`no pin ${pinId} on ${host.type}`);
  return toWorld(host, pin.x, pin.y);
}

/** Create a part so that its pin `pinId` sits exactly on `hostPin` of `host` (breadboard hole / header). */
export function plug(type, pinId, host, hostPin, props = {}, rot = 0, id) {
  const part = P(type, 0, 0, props, rot, id);
  const pin = pinsOf(part).find((p) => p.id === pinId);
  if (!pin) throw new Error(`no pin ${pinId} on ${type}`);
  const [hx, hy] = holePos(host, hostPin);
  const [rx, ry] = rotatePoint(pin.x, pin.y, rot);
  part.x = hx - rx;
  part.y = hy - ry;
  return part;
}

/** Rail hole id ("tp.12") at the column nearest to breadboard column `col`. */
export function rail(bb, which, col) {
  const x = (col - 1) * 10;
  let best = null, bd = Infinity;
  for (const p of pinsOf(bb)) {
    if (!p.id.startsWith(which + '.')) continue;
    const d = Math.abs(p.x - x);
    if (d < bd) { bd = d; best = p.id; }
  }
  return best;
}

export function W(from, fp, to, tp, color = '#22c55e', points = []) {
  return { id: 'w' + ++uid, from: { part: from.id, pin: fp }, to: { part: to.id, pin: tp }, color, points };
}

export const C = { red: '#ef4444', black: '#111827', green: '#22c55e', blue: '#3b82f6', orange: '#f97316', yellow: '#eab308', purple: '#a855f7', white: '#f1f5f9', cyan: '#06b6d4', pink: '#ec4899' };

/** Create a part so that its pin `pinId` sits at world position (x, y). */
export function at(type, pinId, x, y, props = {}, rot = 0, id) {
  const part = P(type, 0, 0, props, rot, id);
  const pin = pinsOf(part).find((p) => p.id === pinId);
  if (!pin) throw new Error(`no pin ${pinId} on ${type}`);
  const [rx, ry] = rotatePoint(pin.x, pin.y, rot);
  part.x = x - rx;
  part.y = y - ry;
  return part;
}

/**
 * Orthogonal wire. `moves` alternate vertical / horizontal targets, starting with a
 * vertical move (y) unless `hFirst`. The final corner towards pin B is added automatically.
 */
export function R(a, ap, b, bp, color, moves = [], hFirst = false) {
  const [ax, ay] = holePos(a, ap), [bx, by] = holePos(b, bp);
  const pts = [];
  let x = ax, y = ay, vert = !hFirst;
  for (const m of moves) {
    if (vert) y = m; else x = m;
    pts.push([x, y]);
    vert = !vert;
  }
  if (vert) { if (x !== bx) pts.push([x, by]); } else if (y !== by) pts.push([bx, y]);
  return W(a, ap, b, bp, color, pts);
}

/** Uno R3 at the origin and a half breadboard to its right (standard example layout). */
export const UNO = () => P('uno-r3', 0, 0, {}, 0, 'uno');
export const HALF = () => P('breadboard-half', 330, 60, {}, 0, 'bb');

/** Uno 5V → top + rail and GND → top − rail (standard layout, one crossing). */
export function railPower(u, bb) {
  return [
    W(u, 'GND.2', bb, 'tn.1', C.black, [[140, 228], [300, 228], [300, 30]]),
    W(u, '5V', bb, 'tp.1', C.red, [[130, 240], [310, 240], [310, 20]]),
  ];
}

/** Bridge the top rails to the bottom rails around the right end of a half breadboard. */
export function railBridge(bb) {
  return [
    W(bb, 'tn.22', bb, 'bn.22', C.black, [[650, 30], [650, 210]]),
    W(bb, 'tp.22', bb, 'bp.22', C.red, [[640, 20], [640, 200]]),
  ];
}
