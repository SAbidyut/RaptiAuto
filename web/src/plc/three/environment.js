// Lab surroundings: workbench, control-panel enclosure with mounting plate, DIN rails and wire
// ducts, the sloped operator console, HMI stand, motor base, lights and background.
import { THREE, MAT, mat, canvasTexture, rbox, box, M4, Builder, txt, offsetMat, FONT_D } from './kit.js';
import { SCENE, toWorld } from '../devices/layout.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function setupLights(scene, renderer, { shadows = true } = {}) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  scene.background = canvasTexture(16, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#142347');
    gr.addColorStop(0.55, '#0b1430');
    gr.addColorStop(1, '#060a17');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  scene.fog = new THREE.Fog(0x0a1124, 2600, 6200);
  const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x1c2230, 0.75);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(700, 1500, 1300);
  key.target.position.set(0, 200, 150);
  if (shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const c = key.shadow.camera;
    c.left = -1100; c.right = 1500; c.top = 950; c.bottom = -800; c.near = 400; c.far = 3800;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.6;
    key.shadow.radius = 3;
  }
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xa9c6ff, 0.55);
  fill.position.set(-1200, 700, 900);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x8be9ff, 0.35);
  rim.position.set(200, 900, -900);
  scene.add(rim);
  return { key, hemi, fill };
}

function noiseTex(w, h, base, amp, { lines = false, repeat = 1 } = {}) {
  const t = canvasTexture(w, h, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * amp;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    if (lines) {
      g.globalAlpha = 0.05;
      for (let y = 0; y < h; y += 2) { g.fillStyle = Math.random() > 0.5 ? '#fff' : '#000'; g.fillRect(0, y, w, 1); }
      g.globalAlpha = 1;
    }
  }, { repeat: true });
  t.repeat.set(repeat, repeat);
  return t;
}

/** Static environment. Rebuilt when the console size changes. */
export function buildEnvironment(layout, devices) {
  const root = new THREE.Group();
  root.name = 'environment';
  // ---- workbench
  const deskTex = noiseTex(256, 256, '#2a2f38', 10, { repeat: 6 });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(3900, 40, 1900), new THREE.MeshStandardMaterial({ map: deskTex, roughness: 0.78, metalness: 0.05 }));
  desk.position.set(150, -20, 350);
  desk.receiveShadow = true;
  root.add(desk);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(3900, 6, 1900), mat('deskEdge', { color: 0x3b4352, roughness: 0.5 }));
  edge.position.set(150, -43, 350);
  root.add(edge);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), mat('floor', { color: 0x070b16, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -760;
  root.add(floor);

  // ---- enclosure + mounting plate
  const P = SCENE.panel, D = SCENE.duct;
  const W = P.x1 - P.x0, H = P.y1 - P.y0;
  const B = new Builder();
  const encl = mat('enclosure', { color: 0xcfd3cf, roughness: 0.55, metalness: 0.1 });
  B.add(box(W + 80, H + 60, 30), encl, M4(0, H / 2 + 10, -40));
  B.add(box(40, H + 60, 130), encl, M4(P.x0 - 20, H / 2 + 10, 15));
  B.add(box(40, H + 60, 130), encl, M4(P.x1 + 20, H / 2 + 10, 15));
  B.add(box(W + 80, 40, 130), encl, M4(0, P.y1 + 20, 15));
  B.add(box(W + 80, 30, 90), encl, M4(0, 15, -5));
  // DIN rails (rail 2 stops at the middle vertical duct)
  const vm = SCENE.vducts.find((v) => v.from > 0);
  for (const [y, x0] of [[SCENE.rail1Y, D.x0], [SCENE.rail2Y, vm ? vm.x + vm.w / 2 + 6 : D.x0]]) {
    const len = D.x1 - x0, cx = (D.x1 + x0) / 2;
    B.add(box(len, 25, 6.5), MAT.steel, M4(cx, y, 3.5));
    B.add(box(len, 5, 1.2), MAT.steel, M4(cx, y + 15, 0.8));
    B.add(box(len, 5, 1.2), MAT.steel, M4(cx, y - 15, 0.8));
  }
  B.build(root, { shadow: true });
  const plateTex = noiseTex(256, 256, '#c4c9cc', 7, { lines: true, repeat: 3 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(W, H - 20, 4), new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.42, metalness: 0.55 }));
  plate.position.set(0, H / 2 + 10, -2);
  plate.receiveShadow = true;
  root.add(plate);
  // panel name plate
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(220, 26), offsetMat(new THREE.MeshStandardMaterial({
    map: canvasTexture(880, 104, (g, w, h) => {
      g.fillStyle = '#10151f'; g.fillRect(0, 0, w, h);
      txt(g, 'RAPTI · DELTA PLC TRAINER', w / 2, h / 2 + 2, { size: 46, color: '#e2e8f0', weight: 700, font: FONT_D, spacing: 4 });
    }), roughness: 0.4,
  })));
  tag.position.set(0, P.y1 + 20, 80.6);
  root.add(tag);

  // ---- operator console
  const C = layout.console;
  if (C.show) {
    const shape = new THREE.Shape();
    shape.moveTo(C.zBack, 0);
    shape.lineTo(C.zFront, 0);
    shape.lineTo(C.zFront, C.hFront);
    shape.lineTo(C.zBack, C.hBack);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: C.width, bevelEnabled: true, bevelSize: 3, bevelThickness: 3, bevelSegments: 2 });
    geo.rotateY(-Math.PI / 2);
    geo.translate(C.cx + C.width / 2, 0, 0);
    // after rotateY(-90°): shape x (z-axis of world) maps to … fix orientation below
    const cons = new THREE.Mesh(geo, mat('console', { color: 0xc9cdc9, roughness: 0.5, metalness: 0.15 }));
    cons.castShadow = true; cons.receiveShadow = true;
    root.add(cons);
    // dark face plate on the slope
    const L = C.slope;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(C.width - 14, L - 12), mat('consoleFace', { color: 0x1a1f28, roughness: 0.55, metalness: 0.3 }));
    face.position.set(C.cx, (C.hBack + C.hFront) / 2 + 3.4 * Math.cos(C.theta), (C.zBack + C.zFront) / 2 + 3.4 * Math.sin(C.theta));
    face.rotation.x = -(Math.PI / 2 - C.theta);
    face.receiveShadow = true;
    root.add(face);
  }

  // ---- HMI stand & motor base
  for (const d of devices) {
    const pl = layout.places.get(d.id);
    if (!pl) continue;
    if (pl.zone === 'hmi') {
      const SB = new Builder();
      const back = toWorld(pl, [0, 73, -2]);
      const bottomBack = toWorld(pl, [0, 0, 6]);
      SB.add(rbox(150, 10, 150, 4), mat('standBase', { color: 0x2a2e36, metalness: 0.5, roughness: 0.4 }), M4(pl.pos[0], 5, pl.pos[2] + 10));
      const top = new THREE.Vector3(...back), bot = new THREE.Vector3(pl.pos[0], 10, pl.pos[2] - 30);
      const len = top.distanceTo(bot);
      const mid = top.clone().add(bot).multiplyScalar(0.5);
      const arm = new THREE.CylinderGeometry(9, 11, len, 16);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize());
      SB.add(arm, MAT.alu, new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
      const lip = new THREE.Vector3(...bottomBack);
      SB.add(box(170, 8, 26), MAT.alu, new THREE.Matrix4().compose(lip.add(new THREE.Vector3(0, -6, 4)), new THREE.Quaternion().setFromEuler(new THREE.Euler(pl.rot[0], pl.rot[1], 0, 'YXZ')), new THREE.Vector3(1, 1, 1)));
      SB.build(root);
    } else if (pl.zone === 'motor') {
      const MB = new Builder();
      MB.add(box(380, 14, 200), mat('motorBase', { color: 0x3a3f48, metalness: 0.6, roughness: 0.4 }), M4(pl.pos[0] + 10, 7, pl.pos[2]));
      MB.build(root);
      // raise the motor onto its base plate
    }
  }
  return root;
}

/**
 * The slotted wire ducts, open at the front so the wiring shows: a base, walls with fingers and a
 * slot wherever a wire passes (gaps from the router: gaps[duct] = {lo, hi} lists of {x, r}).
 */
export function buildDucts(gaps = []) {
  const D = SCENE.duct, HD = SCENE.ducts, wt = D.wall, pitch = 10, finger = 5;
  const B = new Builder();
  const wallM = mat('ductWall', { color: 0xb7bdc4, roughness: 0.62 });
  const baseM = mat('ductBase', { color: 0x9aa1a9, roughness: 0.7 });
  const fz = (D.depth + D.web) / 2, fd = D.depth - D.web;
  /** One wall along x at height y between x0 and x1, slotted, without fingers where wires pass. */
  const wallX = (y, x0, x1, holes) => {
    B.add(box(x1 - x0, wt, D.web), wallM, M4((x0 + x1) / 2, y, D.web / 2));
    for (let x = x0 + 1; x + finger <= x1; x += pitch) {
      if (holes.some((h) => x < h.x + h.r + 1.4 && x + finger > h.x - h.r - 1.4)) continue;
      B.add(box(finger, wt, fd), wallM, M4(x + finger / 2, y, fz));
    }
  };
  /** One wall along y at x between y0 and y1, slotted, open over the given y ranges. */
  const wallY = (x, y0, y1, open) => {
    for (let y = y0 + 1; y + finger <= y1; y += pitch) {
      if (open.some((o) => y < o[1] && y + finger > o[0])) continue;
      B.add(box(wt, finger, fd), wallM, M4(x, y + finger / 2, fz));
    }
    let a = y0;
    for (const o of [...open].sort((p, q) => p[0] - q[0]).concat([[y1, y1]])) {
      if (o[0] > a) B.add(box(wt, o[0] - a, D.web), wallM, M4(x, (a + o[0]) / 2, D.web / 2));
      a = Math.max(a, o[1]);
    }
  };
  const vds = SCENE.vducts;
  HD.forEach((d, i) => {
    const y0 = d.y - d.h / 2, y1 = d.y + d.h / 2;
    B.add(box(D.x1 - D.x0, d.h, 2), baseM, M4((D.x0 + D.x1) / 2, d.y, 1));
    // vertical ducts that join this one from below / above leave an opening in that wall
    const into = (lo) => vds.filter((v) => v.x > D.x0 && v.x < D.x1 && (lo ? v.to === i && v.from < i : v.from === i && v.to > i)).map((v) => ({ x: v.x, r: v.w / 2 - 1.4 }));
    const g = gaps[i] || { lo: [], hi: [] };
    wallX(y0 + wt / 2, D.x0, D.x1, [...g.lo, ...into(false)]);
    wallX(y1 - wt / 2, D.x0, D.x1, [...g.hi, ...into(true)]);
  });
  for (const v of vds) {
    const y0 = HD[v.to].y + (v.x > D.x0 && v.x < D.x1 ? HD[v.to].h / 2 : -HD[v.to].h / 2);
    const y1 = HD[v.from].y + (v.x > D.x0 && v.x < D.x1 ? -HD[v.from].h / 2 : HD[v.from].h / 2);
    B.add(box(v.w, y1 - y0, 2), baseM, M4(v.x, (y0 + y1) / 2, 1));
    const open = [];
    for (let i = v.from; i <= v.to; i++) open.push([HD[i].y - HD[i].h / 2, HD[i].y + HD[i].h / 2]);
    const side = v.x < D.x0 ? 1 : v.x > D.x1 ? -1 : 0; // which wall faces the horizontal ducts
    wallY(v.x - v.w / 2 + wt / 2, y0, y1, side < 0 ? open : []);
    wallY(v.x + v.w / 2 - wt / 2, y0, y1, side > 0 ? open : []);
    if (side) B.add(box(v.w, wt, D.depth), wallM, M4(v.x, y0 + wt / 2, D.depth / 2));
    if (side < 0) B.add(box(v.w, wt, D.depth), wallM, M4(v.x, y1 - wt / 2, D.depth / 2));
  }
  const g = new THREE.Group();
  g.name = 'ducts';
  B.build(g, { shadow: true });
  return g;
}
