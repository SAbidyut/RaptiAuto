// Lab surroundings: workbench, control-panel enclosure with mounting plate, DIN rails and wire
// ducts, the sloped operator console, HMI stand, motor base, lights and background.
import { THREE, MAT, mat, canvasTexture, rbox, box, M4, Builder, txt, FONT_D } from './kit.js';
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
    c.left = -1000; c.right = 1000; c.top = 900; c.bottom = -700; c.near = 500; c.far = 3600;
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
  const desk = new THREE.Mesh(new THREE.BoxGeometry(3400, 40, 1900), new THREE.MeshStandardMaterial({ map: deskTex, roughness: 0.78, metalness: 0.05 }));
  desk.position.set(-100, -20, 350);
  desk.receiveShadow = true;
  root.add(desk);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(3400, 6, 1900), mat('deskEdge', { color: 0x3b4352, roughness: 0.5 }));
  edge.position.set(-100, -43, 350);
  root.add(edge);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), mat('floor', { color: 0x070b16, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -760;
  root.add(floor);

  // ---- enclosure + mounting plate
  const P = SCENE.panel;
  const W = P.x1 - P.x0, H = P.y1 - P.y0;
  const B = new Builder();
  const encl = mat('enclosure', { color: 0xcfd3cf, roughness: 0.55, metalness: 0.1 });
  B.add(box(W + 80, H + 60, 30), encl, M4(0, H / 2 + 10, -40));
  B.add(box(40, H + 60, 90), encl, M4(P.x0 - 20, H / 2 + 10, -5));
  B.add(box(40, H + 60, 90), encl, M4(P.x1 + 20, H / 2 + 10, -5));
  B.add(box(W + 80, 40, 90), encl, M4(0, P.y1 + 20, -5));
  B.add(box(W + 80, 30, 90), encl, M4(0, 15, -5));
  // DIN rails
  for (const y of [SCENE.rail1Y, SCENE.rail2Y]) {
    B.add(box(W - 30, 25, 6.5), MAT.steel, M4(0, y, 3.5));
    B.add(box(W - 30, 5, 1.2), MAT.steel, M4(0, y + 15, 0.8));
    B.add(box(W - 30, 5, 1.2), MAT.steel, M4(0, y - 15, 0.8));
  }
  B.build(root, { shadow: true });
  const plateTex = noiseTex(256, 256, '#c4c9cc', 7, { lines: true, repeat: 3 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(W, H - 20, 4), new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.42, metalness: 0.55 }));
  plate.position.set(0, H / 2 + 10, -2);
  plate.receiveShadow = true;
  root.add(plate);
  // wire ducts with finger slots
  const ductTex = canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = '#9ba1a8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5b6168';
    for (let x = 6; x < w; x += 16) g.fillRect(x, 10, 6, h - 10);
    g.fillStyle = '#b3b9bf'; g.fillRect(0, 0, w, 10);
  }, { repeat: true });
  ductTex.repeat.set((W - 30) / 128, 1);
  const ductMat = new THREE.MeshStandardMaterial({ map: ductTex, roughness: 0.65 });
  for (const d of SCENE.ducts) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(W - 30, d.h, 58), [ductMat.clone(), ductMat.clone(), mat('ductTop', { color: 0xa9afb5, roughness: 0.6 }), mat('ductTop', {}), ductMat, ductMat]);
    mesh.position.set(0, d.y, 29);
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh);
  }
  // panel name plate
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(220, 26), new THREE.MeshStandardMaterial({
    map: canvasTexture(880, 104, (g, w, h) => {
      g.fillStyle = '#10151f'; g.fillRect(0, 0, w, h);
      txt(g, 'RAPTI · DELTA PLC TRAINER', w / 2, h / 2 + 2, { size: 46, color: '#e2e8f0', weight: 700, font: FONT_D, spacing: 4 });
    }), roughness: 0.4,
  }));
  tag.position.set(0, P.y1 + 20, 40.5);
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
