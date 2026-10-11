// Editor geometry: rotate / mirror / flip of parts, wires following their pins.
//   node tests/editor.mjs
import '../web/src/components/index.js';
import { getDef, pinsOf, toWorld, toLocal, worldBox, partTransform, textCounterScale } from '../web/src/components/registry.js';
import { flipParts } from '../web/src/ui/editor.js';

let failed = 0, passed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log('  ok  ' + name); } else { failed++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const near = (a, b) => Math.abs(a - b) < 1e-6;
const mk = (type, x = 100, y = 60, extra = {}) => ({ id: type + x, type, x, y, rot: 0, props: {}, ...extra });
const pin = (part, id) => { const p = pinsOf(part).find((q) => q.id === id); return toWorld(part, p.x, p.y); };

console.log('toWorld / toLocal with rotation and mirror');
for (const type of ['led', 'uno-r3', 'hc-sr04', 'lcd-i2c', 'esp32-devkit']) {
  let ok = true, msg = '';
  for (const rot of [0, 90, 180, 270]) for (const fx of [false, true]) for (const fy of [false, true]) {
    const part = mk(type, 130, 70, { rot, ...(fx ? { flipX: true } : {}), ...(fy ? { flipY: true } : {}) });
    for (const p of pinsOf(part)) {
      const [wx, wy] = toWorld(part, p.x, p.y);
      const [lx, ly] = toLocal(part, wx, wy);
      if (!near(lx, p.x) || !near(ly, p.y)) { ok = false; msg = `${type} ${p.id} rot${rot} fx${fx} fy${fy}`; }
    }
  }
  check(`${type}: toLocal inverts toWorld`, ok, msg);
}

console.log('mirror swaps left and right');
{
  const led = mk('led');
  const a0 = pin(led, 'A'), c0 = pin(led, 'C');
  flipParts({ parts: [led], wires: [] }, [led], 'x');
  const a1 = pin(led, 'A'), c1 = pin(led, 'C');
  check('LED: A and C swap places (x)', near(a1[0], c0[0]) && near(c1[0], a0[0]) && near(a1[1], a0[1]), JSON.stringify({ a0, c0, a1, c1 }));
  check('LED: mirrored flag set', led.flipX === true);
  flipParts({ parts: [led], wires: [] }, [led], 'x');
  const a2 = pin(led, 'A');
  check('LED: mirror twice = original', near(a2[0], a0[0]) && near(a2[1], a0[1]) && !('flipX' in led));
}
{
  const uno = mk('uno-r3', 0, 0);
  const b0 = worldBox(uno);
  const d13 = pin(uno, 'D13'), gnd0 = pin(uno, 'GND.1');
  flipParts({ parts: [uno], wires: [] }, [uno], 'x');
  const b1 = worldBox(uno);
  check('Uno: mirror keeps the board in place', Math.abs(b1[0] - b0[0]) <= 5 && Math.abs(b1[2] - b0[2]) <= 5 && near(b1[1], b0[1]) && near(b1[3], b0[3]), JSON.stringify([b0, b1]));
  const d13b = pin(uno, 'D13');
  const gnd = pin(uno, 'GND.1');
  check('Uno: header order reversed (D13 was right of GND, now left of it)', d13[0] > gnd0[0] && d13b[0] < gnd[0]);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  check('Uno: pin spacing unchanged', near(dist(d13b, gnd), dist(d13, gnd0)) && near(dist(pin(uno, 'D12'), d13b), 10));
  flipParts({ parts: [uno], wires: [] }, [uno], 'y');
  check('Uno: flip toggles flipY', uno.flipY === true && uno.flipX === true);
  check('partTransform has scale(-1 -1)', /scale\(-1 -1\)/.test(partTransform(uno)), partTransform(uno));
}

console.log('a group mirrors about its middle and takes its wires along');
{
  const a = mk('led', 100, 100), b = mk('resistor', 150, 100);
  const w = { id: 'w1', from: { part: a.id, pin: 'A' }, to: { part: b.id, pin: '1' }, points: [[120, 80], [140, 80]], color: '#fff' };
  const proj = { parts: [a, b], wires: [w] };
  const xa = pin(a, 'A')[0], xb = pin(b, '1')[0];
  flipParts(proj, [a, b], 'x');
  const xa2 = pin(a, 'A')[0], xb2 = pin(b, '1')[0];
  check('relative order is reversed', (xa < xb) === (xa2 > xb2), JSON.stringify([xa, xb, xa2, xb2]));
  check('wire bend points mirrored', w.points[0][0] > w.points[1][0]);
}

console.log('labels stay readable');
{
  check('rot 0 mirrored x', textCounterScale({ rot: 0, flipX: true }).join() === '-1,1');
  check('rot 90 mirrored x swaps axes', textCounterScale({ rot: 90, flipX: true }).join() === '1,-1');
  check('rot 180 flipped y', textCounterScale({ rot: 180, flipY: true }).join() === '1,-1');
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
