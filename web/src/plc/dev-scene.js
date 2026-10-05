// Development entry: renders the 3D lab for visual checks (not part of the app bundle).
import { LabScene } from './three/scene.js';
import { LabSystem } from './sim/system.js';
import { buildExample } from './examples.js';

window.boot = async (id = 'vfd-modbus-hmi', focus = 'overview') => {
  await document.fonts.ready;
  const host = document.getElementById('host');
  const p = buildExample(id);
  const hmiCanvas = document.createElement('canvas'); hmiCanvas.width = 800; hmiCanvas.height = 480;
  const g = hmiCanvas.getContext('2d'); g.fillStyle = '#0b1630'; g.fillRect(0, 0, 800, 480); g.fillStyle = '#22d3ee'; g.font = '700 60px sans-serif'; g.fillText('HMI', 300, 260);
  const lap = document.createElement('canvas'); lap.width = 1024; lap.height = 640;
  const g2 = lap.getContext('2d'); g2.fillStyle = '#f3f4f6'; g2.fillRect(0, 0, 1024, 640);
  const scene = new LabScene(host, { hmiCanvas, laptopCanvas: lap });
  scene.setProject(p);
  const sys = new LabSystem(p);
  scene.setSystem(sys);
  scene.setRunning(true);
  window.scene = scene; window.sys = sys;
  for (let i = 0; i < 100; i++) sys.step(20);
  scene.focus(focus, false);
  scene.hmiDirty = true;
};
