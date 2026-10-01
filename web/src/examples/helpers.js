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
