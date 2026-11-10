// 3D models of the machines on the bench: the belt conveyor (moving belt, boxes, photo-eyes,
// inductive sensor, pusher, chute and bin), the water tank (water level, pump, pipes, floats, drain
// and hand valve, level transmitter) and the pneumatic cylinder with its 5/2 valve and reed
// sensors. Same frame as devices/defs.js: mm, y up, origin on the bench under the machine.
import {
  THREE, MAT, mat, ledMat, setLed, canvasTexture, decal, rbox, box, cyl, M4, Builder, addScrew, labelSprite, txt, rrect, FONT_D,
} from './kit.js';
import { devicePorts, deviceProps } from '../devices/defs.js';
import { CONV, TANK } from '../sim/machines.js';

function control(mesh, devId, action, extra = {}) { mesh.userData.control = { devId, action, ...extra }; return mesh; }
const hitBox = (w, h, d) => new THREE.Mesh(box(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));

/** Terminal labels on a strip (for the junction boxes). */
function termLabels(ports, y, z, w = 200) {
  const cx = ports.reduce((s, p) => s + p.pos[0], 0) / ports.length;
  const d = decal(w, 7, (g, W, H) => {
    g.fillStyle = '#f8fafc'; rrect(g, 0, 0, W, H, 1.5); g.fill();
    for (const p of ports) txt(g, p.label, p.pos[0] - cx + W / 2, H / 2 + 0.3, { size: 3.6, weight: 800, color: '#111827' });
  }, { ppm: 10 });
  d.rotation.x = -Math.PI / 2;
  d.position.set(cx, y, z);
  return d;
}

/** Terminal box: a grey housing with a dark terminal rail on top and a screw per port. */
function junctionBox(B, group, ports, { x0, x1, z0, z1, y0 = 0, y1, label }) {
  const grey = mat('jbox', { color: 0xc9cdd2, roughness: 0.5 });
  B.add(rbox(x1 - x0, y1 - y0 - 6, z1 - z0, 3), grey, M4((x0 + x1) / 2, (y0 + y1 - 6) / 2, (z0 + z1) / 2));
  B.add(box(x1 - x0 - 6, 6, z1 - z0 - 6), MAT.termBlock, M4((x0 + x1) / 2, y1 - 3, (z0 + z1) / 2));
  for (const p of ports) addScrew(B, [p.pos[0], y1, p.pos[2]], p.dir, 2.1);
  const rows = new Map();
  for (const p of ports) { const k = p.pos[2]; if (!rows.has(k)) rows.set(k, []); rows.get(k).push(p); }
  const zs = [...rows.keys()].sort((a, b) => a - b);
  zs.forEach((z, i) => group.add(termLabels(rows.get(z), y1 + 0.3, z + (i === 0 ? -7.5 : 7.5) * (zs.length > 1 ? 1 : 0) + (zs.length > 1 ? 0 : -8), x1 - x0 - 8)));
  if (label) {
    const tag = decal(x1 - x0 - 10, 12, (g, W, H) => { g.fillStyle = '#1f2937'; rrect(g, 0, 0, W, H, 2); g.fill(); txt(g, label, W / 2, H / 2 + 0.5, { size: 6, weight: 800, color: '#f8fafc', font: FONT_D }); }, { ppm: 8 });
    tag.position.set((x0 + x1) / 2, (y0 + y1) / 2 - 6, z1 + 0.6);
    group.add(tag);
  }
}

// ====================================================================== conveyor
const BY = 150; // belt top
const bx = (k) => -CONV.L / 2 + k * CONV.L; // belt position (fraction) → x
/**
 * The drums: Ø29 mm with a 3 mm belt, so one turn of the head drum moves 100 mm of belt (the
 * encoder: 100 PPR = 1 pulse / mm). The 1380 rpm gear motor (i ≈ 9.2) turns it at 150 rpm: 250 mm/s.
 */
const DRUM_R = 14.5, BELT_T = 3, BELT_W = 118;
const DRUM_Y = BY - BELT_T - DRUM_R;        // drum axis
const RETURN_Y = DRUM_Y - DRUM_R - BELT_T;  // underside of the return strand
const FRAME_Z = 66, FRAME_Y0 = 98, FRAME_Y1 = BY - 1; // side frames: z of their middle, bottom and top edge
const CHUTE_W = 140; // reject chute

/** PVC belt surface (moves with texture.offset): green cover, fine weave, a faint cross rib every 22 mm. */
function beltTexture() {
  return canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = '#1f5a41'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1;
    for (let x = -h; x < w; x += 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke(); g.beginPath(); g.moveTo(x + h, 0); g.lineTo(x, h); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,.2)';
    for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 5, h);
    g.fillStyle = 'rgba(255,255,255,.1)';
    for (let x = 0; x < w; x += 64) g.fillRect(x + 5, 0, 2, h);
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3); // the sealed edges
  }, { repeat: true });
}

/**
 * The endless belt: carrying strand on top (tail → head), half a turn round the head drum, the return
 * strand underneath and half a turn round the tail drum. u runs along the belt, so moving the texture
 * moves every part of the loop the right way. Returns the cover surface and the plain edges.
 */
function beltLoop(L, tiles) {
  const R = DRUM_R + BELT_T, n = 14, total = 2 * L + 2 * Math.PI * R;
  const pts = [];
  pts.push({ x: -L / 2, y: DRUM_Y + R, nx: 0, ny: 1, s: 0 });
  for (let k = 0; k <= n; k++) { const a = Math.PI / 2 - (k * Math.PI) / n; pts.push({ x: L / 2 + R * Math.cos(a), y: DRUM_Y + R * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a), s: L + (R * k * Math.PI) / n }); }
  for (let k = 0; k <= n; k++) { const a = -Math.PI / 2 - (k * Math.PI) / n; pts.push({ x: -L / 2 + R * Math.cos(a), y: DRUM_Y + R * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a), s: 2 * L + Math.PI * R + (R * k * Math.PI) / n }); }
  const pos = [], nor = [], uv = [], idx = [], ePos = [], eNor = [], eIdx = [];
  pts.forEach((p, i) => {
    for (const side of [1, -1]) { pos.push(p.x, p.y, (side * BELT_W) / 2); nor.push(p.nx, p.ny, 0); uv.push((p.s / total) * tiles, side > 0 ? 0 : 1); }
    for (const side of [1, -1]) { // edge: cover → carcass
      ePos.push(p.x, p.y, (side * BELT_W) / 2, p.x - p.nx * BELT_T, p.y - p.ny * BELT_T, (side * BELT_W) / 2);
      eNor.push(0, 0, side, 0, 0, side);
    }
    if (i === pts.length - 1) return;
    const a = i * 2, b = a + 2;
    idx.push(a, a + 1, b + 1, a, b + 1, b);
    for (const o of [0, 2]) { const e = i * 4 + o, f = e + 4; eIdx.push(e, e + 1, f + 1, e, f + 1, f); }
  });
  const make = (P, N, I, U) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    if (U) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    return g;
  };
  return { cover: make(pos, nor, idx, uv), edges: make(ePos, eNor, eIdx), total };
}

/**
 * Photo-eye on a bracket of the front side plate. Retro-reflective: its reflector is on the back side
 * plate. Diffuse (S3, at the pusher): it sees the box itself, so nothing stands in the mouth of the
 * reject chute.
 */
function photoEye(group, B, x, id, label, diffuse = false) {
  const housing = mat('photoBody', { color: 0x2f3742, roughness: 0.45 });
  B.add(rbox(18, 24, 16, 2), housing, M4(x, BY + 22, 84));
  B.add(box(6, 44, 5), MAT.alu, M4(x, BY - 1, 73.5));
  B.add(cyl(3, 3, 14, 10), MAT.blackPlastic, M4(x, BY + 6, 88)); // cable gland, cable down to the frame
  if (!diffuse) {
    B.add(rbox(16, 22, 5, 1.5), mat('reflector', { color: 0xd92d20, roughness: 0.25, metalness: 0.2 }), M4(x, BY + 22, -79.5));
    B.add(box(6, 44, 5), MAT.alu, M4(x, BY - 1, -73.5));
  }
  const lens = new THREE.Mesh(cyl(4, 4, 2, 16), mat('lens', { color: 0x0f172a, roughness: 0.1, metalness: 0.4 }));
  lens.rotation.x = Math.PI / 2; lens.position.set(x, BY + 22, 75.5);
  group.add(lens);
  const led = new THREE.Mesh(box(4, 3, 1.2), ledMat('#ffb020'));
  led.position.set(x, BY + 31, 92.4);
  group.add(led);
  const reach = diffuse ? 75.5 + BELT_W / 2 : 152; // a diffuse eye reaches across the belt, the other one to its reflector
  const beam = new THREE.Mesh(cyl(0.7, 0.7, reach, 6), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.55 }));
  beam.rotation.x = Math.PI / 2; beam.position.set(x, BY + 22, 75.5 - reach / 2);
  beam.visible = false;
  group.add(beam);
  const tag = decal(18, 7, (g, W, H) => txt(g, label, W / 2, H / 2, { size: 5, weight: 800, color: '#f8fafc' }), { ppm: 10 });
  tag.position.set(x, BY + 22, 92.2);
  group.add(tag);
  return { id, led, beam };
}

/** An open bin: floor and four walls. */
function bin(B, m, x, z, w, d, hgt) {
  B.add(box(w, 4, d), m, M4(x, 2, z));
  for (const [dx, dz, ww, dd] of [[0, -d / 2 + 2, w, 4], [0, d / 2 - 2, w, 4], [-w / 2 + 2, 0, 4, d], [w / 2 - 2, 0, 4, d]]) B.add(box(ww, hgt, dd), m, M4(x + dx, hgt / 2, z + dz));
}

function buildConveyor(dev) {
  const pr = deviceProps(dev);
  const group = new THREE.Group();
  const B = new Builder();
  const alu = MAT.alu, steel = MAT.steel, paint = MAT.paintBlue;
  const frame = mat('convFrame', { color: 0xa4acb6, metalness: 0.7, roughness: 0.35 });
  const dark = MAT.darkPlastic;
  const L = CONV.L, xh = L / 2, xt = -L / 2;
  const fh = FRAME_Y1 - FRAME_Y0, fy = (FRAME_Y0 + FRAME_Y1) / 2;

  // ---- frame: two side plates, the slider bed under the carrying strand, cross ties between the strands
  for (const z of [-FRAME_Z, FRAME_Z]) B.add(box(L + 64, fh, 8), frame, M4(0, fy, z));
  B.add(box(L - 2 * DRUM_R - 6, 2, BELT_W + 6), steel, M4(0, BY - BELT_T - 1, 0));
  for (const x of [-230, 0, 230]) B.add(box(10, 18, 2 * FRAME_Z - 8), frame, M4(x, DRUM_Y + 2, 0));
  // return rollers carry the return strand (they touch its cover side from below)
  for (const x of [-140, 140]) {
    B.add(cyl(7, 7, BELT_W + 4, 16), steel, M4(x, RETURN_Y - 7, 0, Math.PI / 2, 0, 0));
    B.add(cyl(2.5, 2.5, 2 * FRAME_Z + 12, 8), dark, M4(x, RETURN_Y - 7, 0, Math.PI / 2, 0, 0));
  }
  // legs under the side plates, levelling feet, stretchers
  for (const x of [-250, 250]) {
    for (const z of [-56, 56]) {
      B.add(box(28, FRAME_Y0 - 14, 28), alu, M4(x, 14 + (FRAME_Y0 - 14) / 2, z));
      B.add(box(44, 5, 30), frame, M4(x, FRAME_Y0 - 2.5, z)); // joint plate
      B.add(cyl(4, 4, 12, 10), steel, M4(x, 8, z));
      B.add(cyl(15, 17, 5, 20), dark, M4(x, 2.5, z));
    }
    B.add(box(16, 16, 112 - 28), alu, M4(x, 46, 0));
  }
  for (const z of [-56, 56]) B.add(box(500 - 28, 16, 16), alu, M4(0, 46, z));

  // ---- drums. Head (drive) drum: rubber lagging for grip. Tail drum: plain steel, on screw take-ups.
  B.add(cyl(DRUM_R, DRUM_R, BELT_W + 6, 28), mat('lagging', { color: 0x202327, roughness: 0.95 }), M4(xh, DRUM_Y, 0, Math.PI / 2, 0, 0));
  B.add(cyl(DRUM_R, DRUM_R, BELT_W + 6, 28), steel, M4(xt, DRUM_Y, 0, Math.PI / 2, 0, 0));
  const bearing = mat('bearing', { color: 0x2f6f4e, roughness: 0.5, metalness: 0.3 }); // cast flange bearing
  for (const z of [-1, 1]) {
    // head: flange bearings bolted to the outside of the side plates
    B.add(rbox(38, 24, 8, 3), bearing, M4(xh, DRUM_Y, z * (FRAME_Z + 8)));
    B.add(cyl(10, 10, 10, 20), bearing, M4(xh, DRUM_Y, z * (FRAME_Z + 13), Math.PI / 2, 0, 0));
    for (const dx of [-14, 14]) B.add(cyl(2.4, 2.4, 3, 6), steel, M4(xh + dx, DRUM_Y, z * (FRAME_Z + 13), Math.PI / 2, 0, 0));
    // tail: the bearing block slides in a slot; the screw pulls it back to tension and track the belt
    B.add(box(46, 9, 1.2), dark, M4(xt + 8, DRUM_Y, z * (FRAME_Z + 4.4)));
    B.add(rbox(26, 24, 8, 3), bearing, M4(xt, DRUM_Y, z * (FRAME_Z + 8)));
    B.add(cyl(9, 9, 10, 20), bearing, M4(xt, DRUM_Y, z * (FRAME_Z + 13), Math.PI / 2, 0, 0));
    B.add(cyl(2.6, 2.6, 46, 8), steel, M4(xt + 33, DRUM_Y, z * (FRAME_Z + 9), 0, 0, Math.PI / 2));
    B.add(box(6, 18, 10), frame, M4(xt + 50, DRUM_Y, z * (FRAME_Z + 9)));
    B.add(cyl(5, 5, 4.5, 6), steel, M4(xt + 55.5, DRUM_Y, z * (FRAME_Z + 9), 0, 0, Math.PI / 2));
  }

  // ---- drive: a helical gear motor in line with the head drum's shaft, on a console of the back side plate
  const gz = -FRAME_Z - 18; // the end of the bearing hub on the back side plate
  B.add(cyl(5, 5, 14, 12), steel, M4(xh, DRUM_Y, gz - 13, Math.PI / 2, 0, 0));                 // drum shaft
  B.add(cyl(9, 9, 12, 16), mat('coupling', { color: 0xb45309, roughness: 0.5, metalness: 0.4 }), M4(xh, DRUM_Y, gz - 10, Math.PI / 2, 0, 0)); // coupling
  B.add(rbox(64, 64, 44, 5), mat('gearbox', { color: 0x4b5563, metalness: 0.4, roughness: 0.45 }), M4(xh, DRUM_Y, gz - 38));
  B.add(cyl(4, 4, 3, 6), steel, M4(xh + 20, DRUM_Y + 33, gz - 38));                            // oil filler plug
  B.add(box(78, 7, 80), frame, M4(xh, DRUM_Y - 35.5, gz - 26));                                // console, bolted to the side plate
  B.add(cyl(36, 36, 8, 28), paint, M4(xh, DRUM_Y, gz - 64, Math.PI / 2, 0, 0));                // motor flange
  const mz = gz - 110, ml = 84;                                                                // motor body: centre, length
  B.add(cyl(33, 33, ml, 28), paint, M4(xh, DRUM_Y, mz, Math.PI / 2, 0, 0));
  for (let i = 0; i < 18; i++) {                                                                // cooling fins along the body
    const a = (i / 18) * Math.PI * 2;
    if (Math.abs(a - Math.PI / 2) < 0.5) continue;                                             // the terminal box sits here
    B.add(box(2.6, 7, ml - 6), paint, M4(xh + Math.cos(a) * 35.5, DRUM_Y + Math.sin(a) * 35.5, mz, 0, 0, a - Math.PI / 2));
  }
  B.add(cyl(38, 38, 22, 28), mat('fanCowl', { color: 0x23272e, roughness: 0.55, metalness: 0.4 }), M4(xh, DRUM_Y, mz - ml / 2 - 11, Math.PI / 2, 0, 0));
  B.add(cyl(31, 31, 0.8, 24), mat('fanGrille', { color: 0x0b0d10, roughness: 0.8 }), M4(xh, DRUM_Y, mz - ml / 2 - 22.3, Math.PI / 2, 0, 0));
  B.add(rbox(40, 20, 40, 3), paint, M4(xh, DRUM_Y + 42, mz + 4));                              // terminal box
  B.add(cyl(5, 5, 9, 10), dark, M4(xh - 24, DRUM_Y + 42, mz + 4, 0, 0, Math.PI / 2));          // cable gland
  const plate = decal(34, 16, (g, W, H) => {
    g.fillStyle = '#d7dbe0'; rrect(g, 0, 0, W, H, 1.5); g.fill();
    txt(g, '3~ 0.25 kW  1380 rpm', W / 2, 4.4, { size: 3, weight: 800, color: '#111827' });
    txt(g, 'Δ 230 V 1.3 A · Y 400 V 0.75 A', W / 2, 8.4, { size: 2.5, weight: 700, color: '#111827' });
    txt(g, 'i = 9.2 · 150 rpm · Ø32', W / 2, 12.2, { size: 2.5, weight: 700, color: '#111827' });
  }, { ppm: 10 });
  plate.rotation.y = Math.PI / 2; plate.position.set(xh + 32.4, DRUM_Y + 2, gz - 38);
  group.add(plate);
  // flexible conduit: motor terminal box → down → along the back side plate → the junction box
  const conduit = mat('conduit', { color: 0x1f2937, roughness: 0.7 });
  const cx = xh - 52, cyy = FRAME_Y0 + 6, cz = -FRAME_Z - 12;
  const run = (x0, y0, z0, x1, y1, z1) => {
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    const rot = x0 !== x1 ? [0, 0, Math.PI / 2] : z0 !== z1 ? [Math.PI / 2, 0, 0] : [0, 0, 0];
    B.add(cyl(4, 4, len, 10), conduit, M4((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, ...rot));
    B.add(new THREE.SphereGeometry(4.6, 10, 8), conduit, M4(x1, y1, z1));
  };
  run(xh - 28, DRUM_Y + 42, mz + 4, cx, DRUM_Y + 42, mz + 4);
  run(cx, DRUM_Y + 42, mz + 4, cx, cyy, mz + 4);
  run(cx, cyy, mz + 4, cx, cyy, cz);
  run(cx, cyy, cz, -262, cyy, cz);
  run(-262, cyy, cz, -262, cyy, -97);
  for (const x of [200, 40, -120]) B.add(box(10, 3, 12), frame, M4(x, cyy + 5, cz + 2)); // saddle clips

  // ---- optional encoder on the free end of the head drum's shaft (front)
  if (pr.encoder && pr.encoder !== 'none') {
    B.add(cyl(13, 13, 22, 24), mat('encBody', { color: 0x1f2937, roughness: 0.5, metalness: 0.3 }), M4(xh, DRUM_Y, FRAME_Z + 31, Math.PI / 2, 0, 0));
    B.add(cyl(15, 15, 3, 24), steel, M4(xh, DRUM_Y, FRAME_Z + 19.5, Math.PI / 2, 0, 0));
    B.add(cyl(3, 3, 12, 8), dark, M4(xh - 12, DRUM_Y - 16, FRAME_Z + 34));
  }

  // ---- feeder: a short gravity chute that sets the box on the belt above the tail drum
  const chuteM = mat('chute', { color: 0xd1d5db, metalness: 0.5, roughness: 0.35 });
  const slope = -0.5, cl = 58, ccx = xt - 2 - (cl / 2) * Math.cos(slope), ccy = BY + 6 + (cl / 2) * Math.sin(-slope);
  B.add(box(cl, 3, 96), chuteM, M4(ccx, ccy, 0, 0, 0, slope));
  for (const z of [-48, 48]) B.add(box(cl, 20, 3), chuteM, M4(ccx + 4.5, ccy + 8, z, 0, 0, slope));
  for (const z of [-40, 40]) B.add(box(12, ccy + 8, 12), alu, M4(xt - 44, (ccy + 8) / 2, z));

  // ---- S2: an M18 inductive sensor on a bridge, 5 mm above the top of a box
  const gx = bx(CONV.at.S2);
  for (const z of [-78, 78]) B.add(box(14, 104, 14), alu, M4(gx, BY + 42, z));
  B.add(box(14, 14, 170), alu, M4(gx, BY + 101, 0));
  B.add(cyl(9, 9, 40, 20), MAT.chrome, M4(gx, BY + 77, 0));
  B.add(cyl(13, 13, 4, 6), steel, M4(gx, BY + 92, 0));
  B.add(cyl(13, 13, 4, 6), steel, M4(gx, BY + 86, 0));
  B.add(cyl(9.1, 9.1, 3, 20), mat('indFace', { color: 0x2563eb, roughness: 0.5 }), M4(gx, BY + 56.5, 0));

  // ---- pusher: a pneumatic cylinder (125 mm stroke, so the body is longer than the stroke) on its own post
  const px = bx(CONV.at.push), py = BY + 22, pz0 = FRAME_Z + 14;
  B.add(rbox(36, 36, 8, 2), alu, M4(px, py, pz0 + 4));                              // front cap (clear of the S3 photo-eye beside it)
  B.add(cyl(18, 18, 152, 24), alu, M4(px, py, pz0 + 84, Math.PI / 2, 0, 0));        // barrel
  B.add(rbox(36, 36, 8, 2), alu, M4(px, py, pz0 + 164));                            // rear cap
  for (const [dx, dy] of [[-14.5, -14.5], [14.5, -14.5], [-14.5, 14.5], [14.5, 14.5]]) B.add(cyl(2, 2, 168, 6), steel, M4(px + dx, py + dy, pz0 + 84, Math.PI / 2, 0, 0)); // tie rods
  B.add(box(52, 6, 60), frame, M4(px, py - 25, pz0 + 134));                         // foot bracket
  B.add(box(30, py - 28 - 5, 30), alu, M4(px, 5 + (py - 28 - 5) / 2, pz0 + 134));   // post
  B.add(cyl(16, 18, 5, 20), dark, M4(px, 2.5, pz0 + 134));
  // 5/2 valve with one solenoid and a spring return, on top of the cylinder; two tubes to its ports
  const vz = pz0 + 96;
  B.add(rbox(26, 20, 52, 2), mat('valveBlue', { color: 0x2563eb, roughness: 0.45 }), M4(px, py + 29, vz));
  B.add(rbox(22, 22, 24, 2), MAT.blackPlastic, M4(px, py + 30, vz + 38));           // solenoid coil
  const tube = mat('airTube', { color: 0x38bdf8, roughness: 0.4 });
  for (const z of [pz0 + 4, pz0 + 164]) { B.add(cyl(2.2, 2.2, 12, 8), tube, M4(px + 16, py + 24, z)); B.add(cyl(3.4, 3.4, 5, 6), MAT.brass, M4(px + 16, py + 19, z)); }
  B.add(cyl(2.2, 2.2, 160, 8), tube, M4(px + 16, py + 30, pz0 + 84, Math.PI / 2, 0, 0));
  B.add(cyl(2.2, 2.2, py + 24, 8), tube, M4(px - 23, (py + 24) / 2, vz - 10));      // air supply up from the floor

  // ---- reject chute behind the belt and its bin; the bin at the head end
  // (wide enough for a box wherever the pusher takes it; the low side walls lead it to the middle)
  B.add(box(CHUTE_W, 3, 150), chuteM, M4(px, BY - 50, -FRAME_Z - 66, -0.62, 0, 0));
  for (const dx of [-CHUTE_W / 2, CHUTE_W / 2]) B.add(box(3, 22, 150), chuteM, M4(px + dx, BY - 40, -FRAME_Z - 73, -0.62, 0, 0));
  bin(B, mat('bin', { color: 0x334155, roughness: 0.6 }), px, -216, CHUTE_W + 12, 96, 60);
  bin(B, mat('endBin', { color: 0x166534, roughness: 0.6 }), xh + 74, 0, 104, 116, 84);

  // ---- junction box (terminals) on its post
  const ports = devicePorts(dev);
  junctionBox(B, group, ports, { x0: -372, x1: -175, z0: -160, z1: -96, y0: 96, y1: 176, label: pr.label || 'CONVEYOR' });
  B.add(box(24, 96, 24), alu, M4(-275, 48, -128));
  B.add(cyl(16, 18, 5, 20), dark, M4(-275, 2.5, -128));
  // photo-eyes S1, S3, S4
  const eyes = [photoEye(group, B, bx(CONV.at.S1), 'S1', 'S1'), photoEye(group, B, bx(CONV.at.S3), 'S3', 'S3', true), photoEye(group, B, bx(CONV.at.S4), 'S4', 'S4')];
  B.build(group);

  // ---- the belt
  const tiles = 17;
  const loop = beltLoop(L, tiles);
  const tile = loop.total / tiles; // mm of belt per texture repeat
  const tex = beltTexture();
  const belt = new THREE.Mesh(loop.cover, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, side: THREE.DoubleSide }));
  belt.receiveShadow = true;
  group.add(belt, new THREE.Mesh(loop.edges, mat('beltEdge', { color: 0x14181d, roughness: 0.9, side: THREE.DoubleSide })));
  // the free ends of the two shafts turn with the belt (a keyway shows it)
  const shaftEnd = (x, z) => {
    const g = new THREE.Group();
    const stub = new THREE.Mesh(cyl(5, 5, 10, 14), steel); stub.rotation.x = Math.PI / 2;
    const key = new THREE.Mesh(box(2.4, 3.4, 10.4), dark); key.position.set(0, 4, 0);
    g.add(stub, key); g.position.set(x, DRUM_Y, z);
    group.add(g);
    return g;
  };
  const turning = [shaftEnd(xt, FRAME_Z + 24), shaftEnd(xt, -FRAME_Z - 24)];
  if (!(pr.encoder && pr.encoder !== 'none')) turning.push(shaftEnd(xh, FRAME_Z + 22));

  const s2led = new THREE.Mesh(box(4, 3, 4), ledMat('#ffb020'));
  s2led.position.set(gx, BY + 96, 9);
  group.add(s2led);
  const s2tag = decal(20, 8, (g, W, H) => txt(g, 'S2', W / 2, H / 2, { size: 5.5, weight: 800, color: '#111827' }), { ppm: 10 });
  s2tag.position.set(gx, BY + 101, 7.2);
  group.add(s2tag);
  // pusher rod, its two guide rods and the plate. The plate is narrower than a box so that it never
  // cuts the beam of S3. Retracted, its face is level with the edge of the belt; it reaches a box at a quarter stroke.
  const STROKE = 125, FACE0 = 62;
  const rod = new THREE.Group();
  const r1 = new THREE.Mesh(cyl(5, 5, 142, 12), MAT.chrome);
  r1.rotation.x = Math.PI / 2; r1.position.set(0, 0, 4 + 71);
  const pplate = new THREE.Mesh(rbox(44, 34, 8, 2), mat('pushPlate', { color: 0xf59e0b, roughness: 0.4 }));
  pplate.position.set(0, 0, 4);
  rod.add(r1, pplate);
  rod.position.set(px, py, FACE0);
  group.add(rod);
  const coilLed = new THREE.Mesh(box(4, 3, 1.2), ledMat('#ff3434'));
  coilLed.position.set(px, py + 41.6, vz + 38);
  coilLed.rotation.x = -Math.PI / 2;
  group.add(coilLed);
  // boxes (instanced by hand: a pool of meshes)
  const metal = mat('boxMetal', { color: 0x9ca3af, metalness: 0.85, roughness: 0.32 });
  const plastic = mat('boxPlastic', { color: 0x2563eb, roughness: 0.45 });
  const geo = rbox(CONV.box, 50, 60, 4);
  const pool = [];
  for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(geo, plastic); m.castShadow = true; m.visible = false; group.add(m); pool.push(m); }
  // what has been delivered / rejected: a few boxes in the bins
  const binBoxes = [];
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(geo, i < 3 ? plastic : metal); m.visible = false; m.castShadow = true; group.add(m); binBoxes.push(m); }
  binBoxes.slice(0, 3).forEach((m, i) => { m.position.set(xh + 64 + (i % 2) * 18, 30 + i * 22, -24 + i * 22); m.rotation.y = i * 0.5; });
  binBoxes.slice(3).forEach((m, i) => { m.position.set(px - 18 + (i % 2) * 30, 30 + i * 18, -216 + (i - 1) * 16); m.rotation.y = 0.3 + i * 0.6; m.material = metal; });
  // tap: the feeder puts a box on; the valve's manual override fires the pusher
  const feedHit = control(hitBox(110, 100, 120), dev.id, 'feed', { label: 'Feeder: put a box on the belt' });
  feedHit.position.set(xt - 30, BY + 50, 0);
  const pushHit = control(hitBox(50, 50, 100), dev.id, 'press', { label: 'Pusher valve: manual override' });
  pushHit.position.set(px, py + 32, vz + 14);
  group.add(feedHit, pushHit);
  const label = labelSprite('', { scale: 0.5, size: 28 });
  label.position.set(0, 330, 0);
  label.visible = false;
  group.add(label);
  let off = 0, turn = 0, lastTxt = '', lastSig = '';
  const update = (rt, ctx = { dt: 0, running: false }) => {
    const s = rt.dev.state;
    let changed = false;
    if (rt.belt) {
      off += (rt.belt * ctx.dt) / tile; tex.offset.x = -off;
      turn -= (rt.belt * ctx.dt) / (DRUM_R + BELT_T / 2); // the drums turn clockwise seen from the front
      for (const g of turning) g.rotation.z = turn;
      changed = true;
    }
    // boxes
    const list = s.boxes || [];
    pool.forEach((m, i) => {
      const b = list[i];
      if (!b) { if (m.visible) { m.visible = false; changed = true; } return; }
      m.visible = true;
      m.material = b.m ? metal : plastic;
      const p = b.push || 0;
      // on its way down the chute a box that was taken off-centre slides to the middle of it
      const x0 = -L / 2 + b.x, lead = Math.max(px - 24, Math.min(px + 24, x0));
      const x = x0 + (lead - x0) * Math.min(1, p * 1.6);
      const z = -p * 190, drop = Math.max(0, (p - 0.32) / 0.68) * 110;
      m.position.set(x, BY + 25 - drop, z);
      m.rotation.x = -Math.min(0.62, p * 1.2) * (p > 0.3 ? 1 : 0);
      changed = true;
    });
    const nd = Math.min(3, s.done || 0), nr = Math.min(3, s.rejected || 0);
    binBoxes.forEach((m, i) => { const v = i < 3 ? i < nd : i - 3 < nr; if (m.visible !== v) { m.visible = v; changed = true; } });
    // pusher
    const pz = FACE0 - (rt.push || 0) * STROKE;
    if (rod.position.z !== pz) { rod.position.z = pz; changed = true; }
    changed = setLed(coilLed.material, !!rt.coil) || changed;
    const sens = rt.sens || {};
    for (const e of eyes) {
      changed = setLed(e.led.material, !!(rt.powered && sens[e.id])) || changed;
      const show = !!rt.powered;
      if (e.beam.visible !== show) { e.beam.visible = show; changed = true; }
      if (show) { const o = sens[e.id] ? 0.15 : 0.55; if (e.beam.material.opacity !== o) { e.beam.material.opacity = o; changed = true; } }
    }
    changed = setLed(s2led.material, !!(rt.powered && sens.S2)) || changed;
    const showLbl = !!ctx.running;
    label.visible = showLbl;
    if (showLbl) {
      const t = `${Math.round(Math.abs(rt.belt || 0))} mm/s  ·  bin ${s.done || 0}  ·  rejected ${s.rejected || 0}`;
      if (t !== lastTxt) { lastTxt = t; label.userData.set(t); changed = true; }
    }
    const sig = `${list.length}|${nd}|${nr}`;
    if (sig !== lastSig) { lastSig = sig; changed = true; }
    return changed;
  };
  update({ dev, belt: 0, push: 0, sens: {} });
  return { group, controls: [feedHit, pushHit], update };
}

// ====================================================================== water tank
const T0 = 250; // tank bottom
const TX = 100, TW = 200, TD = 150;

function floatSwitch(group, B, y, name) {
  const body = mat('floatBody', { color: 0x1f2937, roughness: 0.6 });
  B.add(rbox(14, 18, 14, 2), body, M4(10, y, -40));
  const arm = new THREE.Group();
  const stem = new THREE.Mesh(cyl(1.5, 1.5, 30, 8), MAT.steel);
  stem.rotation.z = Math.PI / 2; stem.position.set(15, 0, 0);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(8, 20, 14), mat('floatBall', { color: 0xfacc15, roughness: 0.35 }));
  ball.position.set(32, 0, 0);
  arm.add(stem, ball);
  arm.position.set(16, y, -40);
  group.add(arm);
  const tag = decal(22, 8, (g, W, H) => txt(g, name, W / 2, H / 2, { size: 5.5, weight: 800, color: '#facc15' }), { ppm: 10 });
  tag.position.set(-14, y, TD / 2 + 0.8);
  group.add(tag);
  return arm;
}

function buildTank(dev) {
  const pr = deviceProps(dev);
  const group = new THREE.Group();
  const B = new Builder();
  const alu = MAT.alu;
  const pvc = mat('pvc', { color: 0x9ca3af, roughness: 0.5 });
  // sump on the bench
  const sumpM = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.3, transparent: true, opacity: 0.55 });
  B.add(rbox(250, 130, 210, 6), sumpM, M4(100, 65, 0));
  B.add(box(244, 70, 204), new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.15, transparent: true, opacity: 0.45 }), M4(100, 38, 0));
  // stand
  for (const x of [-12, 212]) for (const z of [-92, 92]) B.add(box(16, T0, 16), alu, M4(x, T0 / 2, z));
  for (const z of [-92, 92]) B.add(box(240, 14, 16), alu, M4(100, T0 - 7, z));
  for (const x of [-12, 212]) B.add(box(16, 14, 200), alu, M4(x, T0 - 7, 0));
  // tank frame (edges) and lid
  const edge = mat('tankEdge', { color: 0xe5e7eb, roughness: 0.4 });
  for (const [x, z] of [[0, -TD / 2], [TW, -TD / 2], [0, TD / 2], [TW, TD / 2]]) B.add(box(6, TANK.H + 20, 6), edge, M4(x, T0 + (TANK.H + 20) / 2, z));
  B.add(box(TW + 10, 8, TD + 10), edge, M4(TX, T0 + TANK.H + 24, 0));
  B.add(box(TW + 10, 6, TD + 10), edge, M4(TX, T0 + 3, 0));
  // level transmitter on the lid
  B.add(cyl(14, 14, 40, 24), mat('ltBody', { color: 0x0f172a, roughness: 0.4 }), M4(TX + 40, T0 + TANK.H + 48, 0));
  B.add(cyl(18, 18, 6, 6), MAT.steel, M4(TX + 40, T0 + TANK.H + 30, 0));
  // pump on the bench, suction from the sump, riser to the tank inlet
  B.add(cyl(26, 26, 70, 24), MAT.blackPlastic, M4(-90, 40, 0, 0, 0, Math.PI / 2));
  B.add(cyl(30, 30, 30, 24), mat('pumpHead', { color: 0x2563eb, roughness: 0.4 }), M4(-40, 40, 0, 0, 0, Math.PI / 2));
  B.add(box(90, 10, 70), MAT.darkPlastic, M4(-70, 5, 0));
  B.add(cyl(7, 7, 60, 12), pvc, M4(-10, 40, 0, 0, 0, Math.PI / 2));
  B.add(cyl(7, 7, 60, 12), pvc, M4(20, 20, 0));
  B.add(cyl(7, 7, T0 + TANK.H + 30 - 70, 12), pvc, M4(-40, (70 + T0 + TANK.H + 30) / 2, -40));
  B.add(cyl(7, 7, 80, 12), pvc, M4(0, T0 + TANK.H + 30, -40, 0, 0, Math.PI / 2));
  B.add(cyl(7, 7, 40, 12), pvc, M4(40, T0 + TANK.H + 12, -40));
  // drain valve (solenoid) under the tank, back into the sump
  B.add(cyl(7, 7, 40, 12), pvc, M4(170, T0 - 20, 0));
  B.add(rbox(30, 22, 26, 3), MAT.brass, M4(170, T0 - 50, 0));
  B.add(rbox(22, 28, 22, 3), MAT.blackPlastic, M4(170, T0 - 30, 26));
  B.add(cyl(7, 7, 60, 12), pvc, M4(170, T0 - 90, 0));
  // hand valve (consumer) at the front
  B.add(cyl(7, 7, 60, 12), pvc, M4(60, T0 - 12, TD / 2 + 10, Math.PI / 2, 0, 0));
  B.add(rbox(24, 24, 24, 3), MAT.brass, M4(60, T0 - 12, TD / 2 + 44));
  B.add(cyl(7, 7, 110, 12), pvc, M4(60, T0 - 70, TD / 2 + 44));
  // junction box
  const ports = devicePorts(dev);
  junctionBox(B, group, ports, { x0: -240, x1: -140, z0: -52, z1: 52, y0: 0, y1: 150, label: pr.label || 'TANK' });
  const floats = [floatSwitch(group, B, T0 + TANK.low, 'LL'), floatSwitch(group, B, T0 + TANK.high, 'LH')];
  B.build(group);
  // tank walls (clear acrylic) and the water
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xdbeafe, roughness: 0.05, transmission: 0.0, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  const walls = new THREE.Mesh(box(TW, TANK.H + 20, TD), glass);
  walls.position.set(TX, T0 + (TANK.H + 20) / 2 + 3, 0);
  walls.renderOrder = 2;
  const water = new THREE.Mesh(box(TW - 6, 1, TD - 6), new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.72, depthWrite: false }));
  water.renderOrder = 1;
  group.add(water, walls);
  // scale on the front wall
  const scale = decal(26, TANK.H, (g, W, H) => {
    g.strokeStyle = '#e2e8f0'; g.fillStyle = '#e2e8f0'; g.lineWidth = 0.8;
    for (let i = 0; i <= 10; i++) { const y = H - (i / 10) * H; g.beginPath(); g.moveTo(0, y); g.lineTo(i % 5 ? 6 : 10, y); g.stroke(); if (i % 5 === 0) txt(g, `${i * 10}%`, 18, Math.min(H - 3, Math.max(3, y)), { size: 4.5, weight: 700, color: '#e2e8f0' }); }
  }, { ppm: 6 });
  scale.position.set(TX + TW / 2 - 16, T0 + 6 + TANK.H / 2, TD / 2 + 0.6);
  group.add(scale);
  // inflow / outflow streams
  const streamM = new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6, roughness: 0.1 });
  const inflow = new THREE.Mesh(cyl(4, 5, 1, 10), streamM);
  inflow.visible = false;
  const drainS = new THREE.Mesh(cyl(4, 4, 40, 10), streamM);
  drainS.position.set(170, 150, 0); drainS.visible = false;
  const handS = new THREE.Mesh(cyl(3.5, 3.5, 30, 10), streamM);
  handS.position.set(60, T0 - 140, TD / 2 + 44); handS.visible = false;
  group.add(inflow, drainS, handS);
  // pump shaft / valve LEDs and the hand valve lever
  const pumpLed = new THREE.Mesh(box(5, 4, 2), ledMat('#22e06a'));
  pumpLed.position.set(-90, 70, 18);
  const valveLed = new THREE.Mesh(box(5, 4, 2), ledMat('#ff3434'));
  valveLed.position.set(170, T0 - 22, 38);
  const ltLed = new THREE.Mesh(box(4, 4, 2), ledMat('#22e06a'));
  ltLed.position.set(TX + 40, T0 + TANK.H + 56, 15);
  const lever = new THREE.Mesh(rbox(60, 8, 10, 2), mat('handLever', { color: 0xdc2626, roughness: 0.4 }));
  const leverG = new THREE.Group();
  lever.position.set(26, 0, 0);
  leverG.add(lever);
  leverG.position.set(60, T0 + 6, TD / 2 + 44);
  group.add(pumpLed, valveLed, ltLed, leverG);
  const hit = control(hitBox(TW + 30, TANK.H + 60, TD + 40), dev.id, 'tankValve', { label: `${pr.label || 'Tank'}: hand valve` });
  hit.position.set(TX, T0 + TANK.H / 2, 0);
  group.add(hit);
  const label = labelSprite('', { scale: 0.5, size: 28 });
  label.position.set(TX, T0 + TANK.H + 120, 0);
  label.visible = false;
  group.add(label);
  let lastTxt = '', lastLv = -1;
  const update = (rt, ctx = { dt: 0, running: false }) => {
    const s = rt.dev.state;
    const lv = Math.max(0.5, s.level ?? 0);
    let changed = false;
    if (Math.abs(lv - lastLv) > 0.05) {
      lastLv = lv;
      water.scale.y = lv; water.position.set(TX, T0 + 6 + lv / 2, 0);
      floats.forEach((f, i) => { const up = lv >= (i ? TANK.high : TANK.low) - 4; f.rotation.z = up ? 0.55 : -0.45; });
      changed = true;
    }
    const pumping = (rt.pump || 0) > 0.02;
    const top = T0 + TANK.H + 4, surf = T0 + 6 + lv;
    inflow.visible = pumping;
    if (pumping) { const hgt = Math.max(2, top - surf); inflow.scale.y = hgt; inflow.position.set(40, surf + hgt / 2, -40); changed = true; }
    drainS.visible = !!rt.valve && lv > 2;
    handS.visible = (s.demand || 0) > 0.02 && lv > 2;
    changed = setLed(pumpLed.material, pumping) || changed;
    changed = setLed(valveLed.material, !!rt.valve) || changed;
    changed = setLed(ltLed.material, !!rt.powered) || changed;
    const a = -(s.demand || 0) * Math.PI / 2;
    if (leverG.rotation.y !== a) { leverG.rotation.y = a; changed = true; }
    label.visible = !!ctx.running;
    if (ctx.running) {
      const t = `${Math.round(lv)} mm · ${Math.round((lv / TANK.H) * 100)} %${rt.overflowed ? '  ·  OVERFLOW!' : ''}`;
      if (t !== lastTxt) { lastTxt = t; label.userData.set(t); changed = true; }
    }
    return changed;
  };
  update({ dev, pump: 0, valve: false, powered: false });
  return { group, controls: [hit], update };
}

// ====================================================================== pneumatic cylinder
const CY = 54; // cylinder axis height
function buildCylinder(dev) {
  const pr = deviceProps(dev);
  const group = new THREE.Group();
  const B = new Builder();
  const alu = MAT.alu;
  const plateM = mat('cylPlate', { color: 0x9aa3ae, metalness: 0.6, roughness: 0.42 });
  B.add(box(540, 10, 196), plateM, M4(60, 5, 0));
  for (let i = 0; i < 6; i++) B.add(box(540, 0.6, 3), MAT.darkPlastic, M4(60, 10.3, -80 + i * 32));
  // barrel (profile tube), end caps, feet
  const barrel = mat('cylBarrel', { color: 0xd1d5db, metalness: 0.75, roughness: 0.3 });
  B.add(rbox(220, 40, 40, 5), barrel, M4(-40, CY, 24));
  B.add(rbox(16, 46, 46, 3), MAT.charcoal, M4(-158, CY, 24));
  B.add(rbox(16, 46, 46, 3), MAT.charcoal, M4(78, CY, 24));
  B.add(box(30, 34, 50), alu, M4(-158, 22, 24)); B.add(box(30, 34, 50), alu, M4(78, 22, 24));
  // 5/2 valve with its coil(s), behind the cylinder
  const valveM = mat('valve52', { color: 0x9ca3af, metalness: 0.6, roughness: 0.4 });
  B.add(rbox(80, 30, 30, 3), valveM, M4(-90, 26, -38));
  B.add(rbox(26, 30, 30, 3), MAT.blackPlastic, M4(-142, 26, -38));
  if (pr.valve === 'double') B.add(rbox(26, 30, 30, 3), MAT.blackPlastic, M4(-38, 26, -38));
  else B.add(rbox(14, 22, 22, 3), MAT.charcoal, M4(-44, 26, -38)); // spring cap
  for (const x of [-110, -70]) B.add(cyl(5, 5, 14, 10), MAT.brass, M4(x, 26, -56, Math.PI / 2, 0, 0));
  // air tubes valve → cylinder ports
  const tube = mat('airTube', { color: 0x2563eb, roughness: 0.5 });
  B.add(cyl(3, 3, 60, 8), tube, M4(-108, 46, -14, Math.PI / 2, 0, 0));
  B.add(cyl(3, 3, 60, 8), tube, M4(-74, 46, -14, Math.PI / 2, 0, 0));
  B.add(cyl(3, 3, 46, 8), tube, M4(-131, 46, 16, 0, 0, Math.PI / 2));
  B.add(cyl(3, 3, 140, 8), tube, M4(-4, 46, 16, 0, 0, Math.PI / 2));
  B.add(cyl(3, 3, 120, 8), tube, M4(-90, 26, -100, Math.PI / 2, 0, 0)); // supply
  // reed sensors on the barrel
  const reed = mat('reed', { color: 0x1f2937, roughness: 0.5 });
  B.add(rbox(24, 8, 10, 2), reed, M4(-140, CY + 22, 24));
  B.add(rbox(24, 8, 10, 2), reed, M4(58, CY + 22, 24));
  // terminal strip at the back edge
  const ports = devicePorts(dev);
  const xs = ports.map((p) => p.pos[0]);
  B.add(rbox(Math.max(...xs) - Math.min(...xs) + 24, 34, 22, 2), mat('cylTerm', { color: 0xc9cdd2, roughness: 0.5 }), M4((Math.max(...xs) + Math.min(...xs)) / 2, 27, -78));
  for (const p of ports) addScrew(B, p.pos, p.dir, 2.1);
  B.build(group);
  group.add(termLabels(ports, 44.4, -66, Math.max(...xs) - Math.min(...xs) + 22));
  // rod (moves)
  const rod = new THREE.Group();
  const r1 = new THREE.Mesh(cyl(6, 6, 140, 16), MAT.chrome);
  r1.rotation.z = Math.PI / 2; r1.position.set(-70, 0, 0);
  const tip = new THREE.Mesh(rbox(22, 26, 26, 3), mat('rodTip', { color: 0xdc2626, roughness: 0.4 }));
  tip.position.set(8, 0, 0);
  rod.add(r1, tip);
  rod.position.set(108, CY, 24);
  group.add(rod);
  // the letter on the barrel
  const tag = decal(60, 26, (g, W, H) => { txt(g, pr.label || 'A', 14, H / 2 + 1, { size: 20, weight: 800, color: '#111827', font: FONT_D }); txt(g, 'Ø32 × 100', 42, H / 2 + 1, { size: 5.5, weight: 700, color: '#374151' }); }, { ppm: 8 });
  tag.position.set(-40, CY, 44.6);
  group.add(tag);
  const b1 = new THREE.Mesh(box(5, 3, 2), ledMat('#ffb020')); b1.position.set(-140, CY + 27, 30);
  const b2 = new THREE.Mesh(box(5, 3, 2), ledMat('#ffb020')); b2.position.set(58, CY + 27, 30);
  const y1 = new THREE.Mesh(box(5, 4, 2), ledMat('#ff3434')); y1.position.set(-142, 36, -22);
  const y2 = pr.valve === 'double' ? new THREE.Mesh(box(5, 4, 2), ledMat('#ff3434')) : null;
  if (y2) y2.position.set(-38, 36, -22);
  group.add(b1, b2, y1);
  if (y2) group.add(y2);
  const bl = decal(30, 6, (g, W, H) => { txt(g, 'B1 −', 6, H / 2, { size: 4, weight: 800, color: '#facc15' }); }, { ppm: 10 });
  bl.position.set(-140, CY + 18, 49.5); group.add(bl);
  const br = decal(30, 6, (g, W, H) => { txt(g, 'B2 +', 6, H / 2, { size: 4, weight: 800, color: '#facc15' }); }, { ppm: 10 });
  br.position.set(58, CY + 18, 49.5); group.add(br);
  const hit = control(hitBox(60, 40, 40), dev.id, 'press', { label: `${pr.label || 'Cylinder'} valve: manual override` });
  hit.position.set(-110, 26, -38);
  group.add(hit);
  const update = (rt) => {
    const pos = rt.dev.state.pos ?? 0;
    let changed = false;
    const x = 108 + pos * 100;
    if (rod.position.x !== x) { rod.position.x = x; changed = true; }
    changed = setLed(b1.material, !!(rt.powered && pos <= 0.03)) || changed;
    changed = setLed(b2.material, !!(rt.powered && pos >= 0.97)) || changed;
    changed = setLed(y1.material, !!rt.y1) || changed;
    if (y2) changed = setLed(y2.material, !!rt.y2) || changed;
    return changed;
  };
  update({ dev, powered: false });
  return { group, controls: [hit], update };
}

export const MACHINE_BUILDERS = { conveyor: buildConveyor, tank: buildTank, cyl: buildCylinder };
