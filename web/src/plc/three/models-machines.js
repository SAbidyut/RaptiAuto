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

/** Stripe texture of the belt (moves with texture.offset). */
function beltTexture() {
  const t = canvasTexture(256, 32, (g, w, h) => {
    g.fillStyle = '#1d2128'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2c323c'; g.lineWidth = 6;
    for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 12, h); g.stroke(); }
  }, { repeat: true });
  t.repeat.set(700 / 90, 1);
  return t;
}

// ====================================================================== conveyor
const BY = 150; // belt top
const bx = (k) => -CONV.L / 2 + k * CONV.L; // belt position (fraction) → x

function photoEye(group, B, x, id, label) {
  // emitter on the front rail, reflector on the back rail, the beam between them
  const housing = mat('photoBody', { color: 0x2f3742, roughness: 0.45 });
  B.add(rbox(18, 24, 16, 2), housing, M4(x, BY + 22, 84));
  B.add(box(6, 34, 6), MAT.alu, M4(x, BY + 4, 76));
  B.add(rbox(16, 22, 6, 1.5), mat('reflector', { color: 0xb91c1c, roughness: 0.3, metalness: 0.2 }), M4(x, BY + 22, -80));
  B.add(box(6, 34, 6), MAT.alu, M4(x, BY + 4, -76));
  const lens = new THREE.Mesh(cyl(4, 4, 2, 16), mat('lens', { color: 0x0f172a, roughness: 0.1, metalness: 0.4 }));
  lens.rotation.x = Math.PI / 2; lens.position.set(x, BY + 22, 75.5);
  group.add(lens);
  const led = new THREE.Mesh(box(4, 3, 1.2), ledMat('#ffb020'));
  led.position.set(x, BY + 31, 92.4);
  group.add(led);
  const beam = new THREE.Mesh(cyl(0.7, 0.7, 156, 6), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.55 }));
  beam.rotation.x = Math.PI / 2; beam.position.set(x, BY + 22, 0);
  beam.visible = false;
  group.add(beam);
  const tag = decal(18, 7, (g, W, H) => txt(g, label, W / 2, H / 2, { size: 5, weight: 800, color: '#f8fafc' }), { ppm: 10 });
  tag.position.set(x, BY + 22, 92.2);
  group.add(tag);
  return { id, led, beam };
}

function buildConveyor(dev) {
  const pr = deviceProps(dev);
  const group = new THREE.Group();
  const B = new Builder();
  const alu = MAT.alu, frame = mat('convFrame', { color: 0x9aa3ae, metalness: 0.7, roughness: 0.35 });
  const paint = MAT.paintBlue;
  const L = CONV.L;
  // frame, legs, rollers
  for (const z of [-66, 66]) B.add(box(L + 30, 26, 8), frame, M4(0, BY - 12, z));
  for (const x of [-L / 2 + 40, L / 2 - 40]) for (const z of [-52, 52]) {
    B.add(box(26, BY - 26, 26), alu, M4(x, (BY - 26) / 2, z));
    B.add(box(46, 6, 46), MAT.darkPlastic, M4(x, 3, z));
  }
  B.add(box(L - 60, 20, 18), alu, M4(0, 70, 52)); B.add(box(L - 60, 20, 18), alu, M4(0, 70, -52));
  for (const x of [-L / 2, L / 2]) B.add(cyl(13, 13, 124, 24), MAT.steel, M4(x, BY - 13, 0, Math.PI / 2, 0, 0));
  // gear motor at the head end, behind the belt
  B.add(rbox(70, 80, 44, 4), mat('gearbox', { color: 0x4b5563, metalness: 0.4, roughness: 0.45 }), M4(L / 2 - 10, BY - 30, -92));
  B.add(cyl(36, 36, 112, 32), paint, M4(L / 2 - 10, BY - 30, -170, Math.PI / 2, 0, 0));
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; B.add(box(4, 96, 7), paint, M4(L / 2 - 10 + Math.cos(a) * 37, BY - 30 + Math.sin(a) * 37, -172, Math.PI / 2, 0, -a)); }
  B.add(cyl(38, 38, 22, 32), mat('fanCowl', { color: 0x23272e, roughness: 0.55, metalness: 0.4 }), M4(L / 2 - 10, BY - 30, -236, Math.PI / 2, 0, 0));
  B.add(rbox(44, 26, 40, 3), paint, M4(L / 2 - 10, BY + 16, -170));
  // conduit from the gear motor to the junction box
  const conduit = mat('conduit', { color: 0x1f2937, roughness: 0.7 });
  B.add(cyl(5, 5, 600, 10), conduit, M4(L / 2 - 340, 40, -200, 0, 0, Math.PI / 2));
  B.add(cyl(5, 5, 96, 10), conduit, M4(L / 2 - 40, 82, -200));
  // feeder chute at the tail
  const chuteM = mat('chute', { color: 0xd1d5db, metalness: 0.5, roughness: 0.35 });
  B.add(box(80, 4, 96), chuteM, M4(-L / 2 - 20, BY + 70, 0, 0, 0, -0.5));
  B.add(box(80, 46, 4), chuteM, M4(-L / 2 - 20, BY + 80, 50, 0, 0, -0.5));
  B.add(box(80, 46, 4), chuteM, M4(-L / 2 - 20, BY + 80, -50, 0, 0, -0.5));
  B.add(box(16, 130, 16), alu, M4(-L / 2 - 50, 60, 40)); B.add(box(16, 130, 16), alu, M4(-L / 2 - 50, 60, -40));
  // gantry with the inductive sensor S2
  const gx = bx(CONV.at.S2);
  B.add(box(14, 100, 14), alu, M4(gx, BY + 40, 82)); B.add(box(14, 100, 14), alu, M4(gx, BY + 40, -82));
  B.add(box(14, 14, 178), alu, M4(gx, BY + 96, 0));
  B.add(cyl(9, 9, 34, 20), MAT.chrome, M4(gx, BY + 76, 0));
  B.add(cyl(10.5, 10.5, 4, 6), MAT.steel, M4(gx, BY + 86, 0));
  B.add(cyl(9.2, 9.2, 3, 20), mat('indFace', { color: 0x2563eb, roughness: 0.5 }), M4(gx, BY + 58, 0));
  // pusher: a cylinder on the front rail
  const px = bx(CONV.at.push);
  B.add(rbox(40, 34, 100, 4), MAT.alu, M4(px, BY + 24, 150));
  B.add(box(30, 6, 60), MAT.darkPlastic, M4(px, BY - 4, 128));
  B.add(rbox(26, 22, 20, 2), mat('valveBlue', { color: 0x2563eb, roughness: 0.45 }), M4(px + 34, BY + 24, 168));
  B.add(rbox(16, 16, 14, 2), MAT.blackPlastic, M4(px + 34, BY + 40, 168));
  // reject chute behind the belt and its bin
  B.add(box(90, 4, 150), chuteM, M4(px, BY - 50, -140, -0.62, 0, 0));
  B.add(box(4, 50, 150), chuteM, M4(px - 46, BY - 36, -140, -0.62, 0, 0));
  B.add(box(4, 50, 150), chuteM, M4(px + 46, BY - 36, -140, -0.62, 0, 0));
  const binM = mat('bin', { color: 0x334155, roughness: 0.6 });
  B.add(box(110, 4, 90), binM, M4(px, 2, -205));
  for (const [dx, dz, w, d] of [[0, -45, 110, 4], [0, 45, 110, 4], [-55, 0, 4, 90], [55, 0, 4, 90]]) B.add(box(w, 60, d), binM, M4(px + dx, 30, -205 + dz));
  // end bin at the head
  const endBin = mat('endBin', { color: 0x166534, roughness: 0.6 });
  B.add(box(110, 4, 120), endBin, M4(L / 2 + 70, 2, 0));
  for (const [dx, dz, w, d] of [[0, -60, 110, 4], [0, 60, 110, 4], [55, 0, 4, 120], [-55, 0, 4, 120]]) B.add(box(w, 80, d), endBin, M4(L / 2 + 70 + dx, 40, dz));
  // junction box (terminals)
  const ports = devicePorts(dev);
  junctionBox(B, group, ports, { x0: -372, x1: -175, z0: -160, z1: -96, y0: 96, y1: 176, label: pr.label || 'CONVEYOR' });
  B.add(box(24, 96, 24), alu, M4(-275, 48, -128));
  // photo-eyes S1, S3, S4 (emitter front, reflector back)
  const eyes = [photoEye(group, B, bx(CONV.at.S1), 'S1', 'S1'), photoEye(group, B, bx(CONV.at.S3), 'S3', 'S3'), photoEye(group, B, bx(CONV.at.S4), 'S4', 'S4')];
  B.build(group);

  // the belt (texture moves)
  const tex = beltTexture();
  const belt = new THREE.Mesh(box(L, 5, 118), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  belt.position.set(0, BY - 2.5, 0);
  belt.receiveShadow = true;
  group.add(belt);
  const s2led = new THREE.Mesh(box(4, 3, 4), ledMat('#ffb020'));
  s2led.position.set(gx, BY + 94, 0);
  group.add(s2led);
  const s2tag = decal(20, 8, (g, W, H) => txt(g, 'S2', W / 2, H / 2, { size: 5.5, weight: 800, color: '#111827' }), { ppm: 10 });
  s2tag.position.set(gx, BY + 96, 7.2);
  group.add(s2tag);
  // pusher rod + plate
  const rod = new THREE.Group();
  const r1 = new THREE.Mesh(cyl(4, 4, 120, 12), MAT.chrome);
  r1.rotation.x = Math.PI / 2; r1.position.set(0, 0, 60);
  const plate = new THREE.Mesh(rbox(70, 34, 8, 2), mat('pushPlate', { color: 0xf59e0b, roughness: 0.4 }));
  plate.position.set(0, 0, 0);
  rod.add(r1, plate);
  rod.position.set(px, BY + 22, 96);
  group.add(rod);
  const coilLed = new THREE.Mesh(box(4, 3, 1.2), ledMat('#ff3434'));
  coilLed.position.set(px + 34, BY + 42, 175.4);
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
  binBoxes.slice(0, 3).forEach((m, i) => { m.position.set(L / 2 + 60 + (i % 2) * 18, 30 + i * 22, -24 + i * 22); m.rotation.y = i * 0.5; });
  binBoxes.slice(3).forEach((m, i) => { m.position.set(px - 18 + (i % 2) * 30, 30 + i * 18, -205 + (i - 1) * 16); m.rotation.y = 0.3 + i * 0.6; m.material = metal; });
  // tap: the feeder puts a box on; the valve's manual override fires the pusher
  const feedHit = control(hitBox(110, 100, 120), dev.id, 'feed', { label: 'Feeder: put a box on the belt' });
  feedHit.position.set(-L / 2 - 30, BY + 60, 0);
  const pushHit = control(hitBox(50, 50, 40), dev.id, 'press', { label: 'Pusher valve: manual override' });
  pushHit.position.set(px + 34, BY + 30, 168);
  group.add(feedHit, pushHit);
  const label = labelSprite('', { scale: 0.5, size: 28 });
  label.position.set(0, 330, 0);
  label.visible = false;
  group.add(label);
  let off = 0, lastTxt = '', lastSig = '';
  const update = (rt, ctx = { dt: 0, running: false }) => {
    const s = rt.dev.state;
    let changed = false;
    if (rt.belt) { off += (rt.belt * ctx.dt) / 90; tex.offset.x = -off; changed = true; }
    // boxes
    const list = s.boxes || [];
    pool.forEach((m, i) => {
      const b = list[i];
      if (!b) { if (m.visible) { m.visible = false; changed = true; } return; }
      m.visible = true;
      m.material = b.m ? metal : plastic;
      const x = -L / 2 + b.x;
      const p = b.push || 0;
      const z = -p * 190, drop = Math.max(0, (p - 0.32) / 0.68) * 110;
      m.position.set(x, BY + 25 - drop, z);
      m.rotation.x = -Math.min(0.62, p * 1.2) * (p > 0.3 ? 1 : 0);
      changed = true;
    });
    const nd = Math.min(3, s.done || 0), nr = Math.min(3, s.rejected || 0);
    binBoxes.forEach((m, i) => { const v = i < 3 ? i < nd : i - 3 < nr; if (m.visible !== v) { m.visible = v; changed = true; } });
    // pusher
    const pz = 96 - (rt.push || 0) * 150;
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
