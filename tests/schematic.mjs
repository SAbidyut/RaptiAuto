// Headless tests of the 2D wiring schematic layout and wire routing: node tests/schematic.mjs
import { layoutSchematic } from '../web/src/plc/ui/schematic.js';
import { LAB_EXAMPLES, buildExample } from '../web/src/plc/examples.js';
import { boxInSelection, polylineInSelection } from '../web/src/ui/gestures.js';

let failures = 0;
function check(name, cond, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? '✓' : '✗'} ${name}${!cond && detail ? ' — ' + detail : ''}`);
}

for (const ex of LAB_EXAMPLES) {
  const p = buildExample(ex.id);
  const L = layoutSchematic(p);
  const rects = [...L.syms.entries()].map(([id, s]) => ({ id, x0: s.x, y0: s.y, x1: s.x + s.sym.w, y1: s.y + s.sym.h }));
  // every device placed, no two overlapping
  const overlap = rects.some((a, i) => rects.some((b, j) => j > i && a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1));
  check(`${ex.id}: ${rects.length} devices placed without overlap`, rects.length === p.devices.length && !overlap);
  // every wire routed, orthogonal, never through a device body
  let missing = 0, diagonal = 0, through = 0;
  for (const c of p.conns) {
    const pts = L.wires.get(c.id);
    if (!pts || pts.length < 2) { missing++; continue; }
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      if (Math.abs(a[0] - b[0]) > 0.01 && Math.abs(a[1] - b[1]) > 0.01) diagonal++;
      // inner segments (not the stubs into a terminal) must stay out of every device
      if (i === 0 || i === pts.length - 2) continue;
      const seg = { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) };
      if (rects.some((r) => seg.x0 < r.x1 - 1 && seg.x1 > r.x0 + 1 && seg.y0 < r.y1 - 1 && seg.y1 > r.y0 + 1)) through++;
    }
  }
  check(`${ex.id}: ${p.conns.length} wires routed orthogonally around the devices`, !missing && !diagonal && !through, `missing ${missing}, diagonal ${diagonal}, through devices ${through}`);
  // parallel wires in a duct never share a track over the same stretch
  const runs = [];
  for (const pts of L.wires.values()) for (let i = 1; i < pts.length - 2; i++) if (Math.abs(pts[i][1] - pts[i + 1][1]) < 0.01) runs.push({ y: pts[i][1], x0: Math.min(pts[i][0], pts[i + 1][0]), x1: Math.max(pts[i][0], pts[i + 1][0]) });
  const shared = runs.some((a, i) => runs.some((b, j) => j > i && Math.abs(a.y - b.y) < 0.5 && Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 2));
  check(`${ex.id}: duct tracks are not shared`, !shared);
}

// ---------------------------------------------------------------- selection box rules (AutoCAD)
const sel = { x0: 0, y0: 0, x1: 100, y1: 100 };
check('window takes a box completely inside', boxInSelection(sel, { x0: 10, y0: 10, x1: 50, y1: 50 }, 'window'));
check('window skips a box that sticks out', !boxInSelection(sel, { x0: 10, y0: 10, x1: 150, y1: 50 }, 'window'));
check('crossing takes a box it touches', boxInSelection(sel, { x0: 90, y0: 90, x1: 150, y1: 150 }, 'crossing'));
check('crossing skips a box outside', !boxInSelection(sel, { x0: 110, y0: 10, x1: 150, y1: 50 }, 'crossing'));
check('crossing takes a wire that only passes through', polylineInSelection(sel, [[-50, 50], [150, 50]], 'crossing'));
check('window skips a wire that only passes through', !polylineInSelection(sel, [[-50, 50], [150, 50]], 'window'));
check('crossing skips a wire that misses', !polylineInSelection(sel, [[-50, -20], [150, -20]], 'crossing'));

console.log(failures ? `\n${failures} schematic test(s) FAILED` : '\nall schematic tests passed');
process.exit(failures ? 1 : 0);
