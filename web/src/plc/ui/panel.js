// Lab tab: the 3D scene or the 2D wiring schematic (toggle) with Operate / Wire modes, device
// library, device settings, wiring list, issue list, camera focus chips, an AutoCAD-style selection
// box and Google-Maps-style double-tap zoom.
import { h, toast, Sheet, confirmDialog } from '../../ui/widgets.js';
import { icon } from '../../ui/icons.js';
import { Native } from '../../native.js';
import { SceneSwitch } from './scene-switch.js';
import { TapTracker, SelectBox, slideZoomFactor } from '../../ui/gestures.js';
import { DEVICE_DEFS, CATEGORIES, devicePorts, deviceProps, compatible, findPort, wireColorFor, busName } from '../devices/defs.js';
import { makeConn, labId, portUse, MAX_WIRES } from '../store.js';
import { LabSystem } from '../sim/system.js';

const WIRE_COLORS = [['auto', 'Auto'], ['#dc2626', 'Red'], ['#1e3a8a', 'Dark blue'], ['#2563eb', 'Blue'], ['#7c4a1e', 'Brown'], ['#f97316', 'Orange'], ['#e5e7eb', 'White'], ['#111827', 'Black'], ['#a855f7', 'Violet'], ['#eab308', 'Yellow'], ['pe', 'Earth']];
const thumbs = new Map();

// connect the rest of a group automatically (U→U, V→V, W→W; L/N/PE)
const BUNDLES = [
  [['U/T1', 'V/T2', 'W/T3', 'PE'], ['U', 'V', 'W', 'PE']],
  [['L', 'N', 'PE'], ['L', 'N', 'PE']],
  [['L', 'N', 'PE'], ['R/L1', 'S/L2', 'PE']],
];

export class PanelView {
  constructor(lab) {
    this.lab = lab;
    this.mode = 'wire';
    this.wiring = null;
    this.sel = null;
    this.wireColor = 'auto';
    this.el = h('section', { class: 'panel-view' });
    this.host = h('div', { class: 'lab-3d-host' });
    this.el.appendChild(this.host);
    this.scene = new SceneSwitch(this.host, { quality: lab.settings.labQuality || 'high', hmiCanvas: lab.hmiCanvas, laptopCanvas: lab.laptopCanvas });
    this.taps = new TapTracker();
    this.selectTool = false;
    this.buildOverlay();
    this.box = new SelectBox(this.el);
    // the 3D view lost its GPU context (driver reset, GPU switch, memory pressure): show 2D
    this.scene.onLost = () => {
      if (this.scene.mode !== '3d') return;
      this.applyView('2d');
      this.hint('The 3D graphics were reset by the system, so the lab shows the 2D wiring schematic. Tap 3D (bottom left) to load it again.', 7000);
    };
    const want = this.initialView();
    if (this.scene.setMode(want) !== want) this.no3d = true;
    this.updateViewSeg();
    const opts = { capture: true };
    this.host.addEventListener('pointerdown', (e) => this.onDown(e), opts);
    this.host.addEventListener('pointerup', (e) => this.onUp(e), opts);
    this.host.addEventListener('pointercancel', (e) => this.onUp(e, true), opts);
    this.host.addEventListener('pointermove', (e) => this.onMove(e), opts);
    this.host.addEventListener('contextmenu', (e) => e.preventDefault());
    this.pointers = new Map();
  }

  mounted() {
    const p = this.lab.project;
    this.scene.setProject(p);
    this.scene.setSystem(this.lab.idleSystem());
    this.restoreView(this.scene.mode, true);
    this.refresh();
    this.updateTaskPill();
    if (this.no3d) setTimeout(() => this.hint('3D needs WebGL 2, which this phone does not have — showing the 2D wiring schematic.', 6000), 500);
    else if (!localStorage.getItem('raptiauto.plc.hinted')) {
      try { localStorage.setItem('raptiauto.plc.hinted', '1'); } catch (e) { /* ignore */ }
      setTimeout(() => this.hint(this.scene.mode === '2d'
        ? '2D wiring schematic: drag to move, pinch or double-tap-and-slide to zoom. Tap 3D (bottom left) for the 3D lab. Press Simulate to power the lab.'
        : 'Drag to orbit · pinch to zoom · tap a chip below to jump to a device. Press Simulate to power the lab.', 6500), 600);
    }
    if (this.scene.mode === '3d' && !this.lab.settings.labView) this.watchSpeed();
  }

  destroy() { clearTimeout(this.speedT); this.scene.onLost = null; this.scene.dispose(); }

  // ------------------------------------------------------------------ 2D / 3D
  /** 2D on slow phones (few cores / little memory / "Fast" quality), unless the user chose a view. */
  initialView() {
    const s = this.lab.settings;
    if (s.labView === '2d' || s.labView === '3d') return s.labView;
    const mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency;
    if (s.labQuality === 'low' || (mem && mem <= 3) || (cores && cores <= 4)) return '2d';
    return '3d';
  }

  /** Switch the view; remembered for the next labs. */
  setView(mode, remember = true) {
    // a tap while the 3D view is still being built: do what was tapped last once it is ready
    if (this.loading3d) { this.wantView = { mode, remember }; this.updateViewSeg(mode); return; }
    if (mode === this.scene.mode) { this.updateViewSeg(); return; }
    Native.vibrate(8);
    if (mode === '3d' && (!this.scene.s3 || this.scene.lost3d)) {
      // building the 3D lab takes a moment on a slow phone or laptop: show that, then build it
      // after the browser has drawn the switch (the page never looks frozen / stuck)
      this.loading3d = true;
      this.el.classList.add('loading-3d');
      this.updateViewSeg('3d');
      requestAnimationFrame(() => setTimeout(() => {
        this.loading3d = false;
        this.el.classList.remove('loading-3d');
        const want = this.wantView;
        this.wantView = null;
        this.applyView('3d', remember);
        if (want && want.mode !== this.scene.mode) this.setView(want.mode, want.remember);
      }, 30));
      return;
    }
    this.applyView(mode, remember);
  }

  applyView(mode, remember = false) {
    this.resetGesture();
    const first = mode === '3d' ? !this.scene.s3 || this.scene.lost3d : !this.scene.s2;
    let got = mode;
    try { got = this.scene.setMode(mode); } catch (e) { console.warn('view switch', e); got = this.scene.mode; }
    if (mode === '3d' && got !== '3d') { toast('3D needs WebGL 2, which this device does not have', 'warn'); this.updateViewSeg(); return; }
    if (remember) { this.lab.settings.labView = mode; this.lab.app.saveSettings(); }
    if (first) this.restoreView(got, false);
    this.updateViewSeg();
  }

  /** Forget a press / zoom slide / selection box in progress (the view under it changes). */
  resetGesture() {
    clearTimeout(this.boxTimer);
    this.box.cancel();
    if (this.active) { try { this.releaseControl(true); } catch (e) { this.active = null; } }
    this.down = null;
    this.pointers.clear();
    this.taps.clear();
    for (const s of this.scene.all) { s.controls.enabled = true; if (s.resetPointers) s.resetPointers(); }
  }

  restoreView(mode, intro) {
    const p = this.lab.project;
    if (mode === '2d') {
      if (p.view2d) this.scene.s2.setView(p.view2d);
      else requestAnimationFrame(() => this.scene.s2.fit(false));
      return;
    }
    if (p.view) { this.scene.s3.setView(p.view); return; }
    requestAnimationFrame(() => {
      // intro: sweep in from high above
      if (intro && this.scene.camera) { this.scene.camera.position.set(-900, 2600, 3600); this.scene.controls.target.set(0, 250, 200); }
      this.scene.focus('overview', intro, intro ? 1600 : 650);
    });
  }

  updateViewSeg(shown = this.scene.mode) {
    for (const b of this.viewSeg.children) b.classList.toggle('active', b.dataset.view === shown);
    this.el.classList.toggle('is-2d', this.scene.mode === '2d');
  }

  /** First 3D lab on a phone without a saved choice: fall back to 2D when 3D is clearly too slow. */
  watchSpeed() {
    this.speedT = setTimeout(() => {
      const s3 = this.scene.s3;
      const pf = s3 && s3.perf;
      if (this.lab.settings.labView || this.scene.mode !== '3d' || !pf || pf.n < 12) return;
      if (pf.sum / pf.n > 1 / 14) {
        this.setView('2d', false);
        this.lab.settings.labView = '2d';
        this.lab.app.saveSettings();
        this.hint('3D is slow on this phone, so the lab switched to the 2D wiring schematic. Tap 3D (bottom left) any time to go back.', 7000);
      }
    }, 3200);
  }

  onShow() { this.scene.visible = true; this.scene.dirty = true; requestAnimationFrame(() => this.scene.resize()); }

  onBack() {
    if (this.potCard) { this.closePot(); return true; }
    if (this.wiring) { this.cancelWiring(); return true; }
    if (this.sel) { this.select(null); return true; }
    if (this.selectTool) { this.toggleSelectTool(false); return true; }
    return false;
  }

  onSimStart(sys) { this.setMode('operate'); this.scene.setSystem(sys); }
  onSimStop() { this.closePot(); }

  // ------------------------------------------------------------------ overlay
  buildOverlay() {
    this.modeSeg = h('div', { class: 'segmented lab-mode' },
      h('button', { class: 'seg', 'data-mode': 'operate', html: `${icon('hand', 16)}<span>Operate</span>`, onclick: () => this.setMode('operate') }),
      h('button', { class: 'seg', 'data-mode': 'wire', html: `${icon('wire', 16)}<span>Wire</span>`, onclick: () => this.setMode('wire') }));
    const tool = (ic, title, fn) => h('button', { class: 'tool', title, 'aria-label': title, html: icon(ic, 20), onclick: fn });
    this.tools = h('div', { class: 'side-tools lab-tools' },
      tool('plus', 'Add device', () => this.openLibrary()),
      tool('list', 'Wiring list', () => this.openWiringList()),
      tool('warning', 'Check the lab', () => this.showIssues()),
      h('div', { class: 'tool-sep' }),
      this.selToolBtn = tool('select', 'Select (box)', () => this.toggleSelectTool()),
      tool('undo', 'Undo', () => this.lab.undo()),
      tool('redo', 'Redo', () => this.lab.redo()),
      tool('fit', 'Overview', () => this.scene.focus('overview')),
      tool('zoomIn', 'Zoom in', () => { const r = this.host.getBoundingClientRect(); this.scene.zoomAt(1.5, r.left + r.width / 2, r.top + r.height / 2); }),
      tool('fullscreen', 'Full screen', () => this.lab.setFullscreen(!this.lab.fullscreen)));
    this.viewSeg = h('div', { class: 'segmented lab-view-seg' },
      h('button', { class: 'seg', 'data-view': '2d', title: '2D wiring schematic', html: `${icon('schematic', 15)}<span>2D</span>`, onclick: () => this.setView('2d') }),
      h('button', { class: 'seg', 'data-view': '3d', title: '3D lab', html: `${icon('cube', 15)}<span>3D</span>`, onclick: () => this.setView('3d') }));
    this.chips = h('div', { class: 'lab-chips' });
    this.selBar = h('div', { class: 'sel-bar hidden' });
    this.wireBar = h('div', { class: 'wire-bar lab-wirebar hidden' });
    this.hintEl = h('div', { class: 'canvas-hint lab-hint hidden' });
    this.chooser = h('div', { class: 'port-chooser hidden' });
    this.taskPill = h('button', { class: 'task-pill hidden', onclick: () => this.lab.showTasks() });
    this.el.append(this.modeSeg, this.tools, this.viewSeg, this.chips, this.selBar, this.wireBar, this.hintEl, this.chooser, this.taskPill);
    this.setMode('wire');
  }

  updateTaskPill() {
    const t = this.lab.tasks;
    if (!t) { this.taskPill.classList.add('hidden'); return; }
    const n = (this.lab.project.tasksDone || []).length;
    const html = `${icon(n >= t.length ? 'award' : 'target', 15)}<span>Tasks <b>${n}/${t.length}</b></span>`;
    if (html !== this.lastPill) { this.lastPill = html; this.taskPill.innerHTML = html; this.taskPill.classList.toggle('all', n >= t.length); }
    this.taskPill.classList.remove('hidden');
  }

  setMode(m) {
    this.mode = m;
    for (const b of this.modeSeg.children) b.classList.toggle('active', b.dataset.mode === m);
    this.el.classList.toggle('mode-wire', m === 'wire');
    this.el.classList.toggle('mode-operate', m === 'operate');
    if (m === 'operate') this.cancelWiring();
  }

  toggleSelectTool(on = !this.selectTool) {
    this.selectTool = on;
    this.selToolBtn.classList.toggle('on', on);
    this.el.classList.toggle('select-tool', on);
    if (on) { this.cancelWiring(); this.hint('Select: drag to the RIGHT → window (only what is fully inside). Drag to the LEFT → crossing (everything it touches). Tap devices or wires to add / remove them.', 7000); }
    else this.hintEl.classList.add('hidden');
    Native.vibrate(8);
  }

  hint(text, ms = 4200) {
    this.hintEl.textContent = text;
    this.hintEl.classList.remove('hidden');
    clearTimeout(this.hintT);
    this.hintT = setTimeout(() => this.hintEl.classList.add('hidden'), ms);
  }

  refresh() {
    // focus chips
    this.chips.innerHTML = '';
    const chip = (label, target, ic) => h('button', { class: 'chip lab-chip', html: `${ic ? icon(ic, 14) : ''}<span>${label}</span>`, onclick: () => { this.scene.focus(target); Native.vibrate(5); } });
    this.chips.append(chip('Overview', 'overview', 'fit'), chip('Panel', 'panel', 'grid'));
    const devs = this.lab.project.devices;
    const add = (pred, label, ic) => devs.filter(pred).forEach((d, i, arr) => this.chips.appendChild(chip(arr.length > 1 ? `${label} ${i + 1}` : label, d.id, ic)));
    add((d) => DEVICE_DEFS[d.type].category === 'plc', 'PLC', 'cpu');
    add((d) => d.type === 'dop-107bv', 'HMI', 'screen');
    add((d) => d.type === 'ms300', 'VFD', 'gauge');
    if (devs.some((d) => DEVICE_DEFS[d.type].zone === 'console')) this.chips.appendChild(chip('Console', 'console', 'button'));
    add((d) => d.type === 'motor', 'Motor', 'motor');
    add((d) => d.type === 'drp024', 'Power', 'bolt');
    add((d) => d.type === 'laptop', 'Laptop', 'display');
    if (this.sel && this.sel.kind === 'dev' && !devs.some((d) => d.id === this.sel.id)) this.select(null);
    if (this.sel && this.sel.kind === 'conn' && !this.lab.project.conns.some((c) => c.id === this.sel.id)) this.select(null);
    if (this.sel && this.sel.kind === 'multi') this.select(this.sel);
  }

  // ------------------------------------------------------------------ pointer
  // Capture-phase handlers on the host: they run before the view's own orbit / pan handling,
  // which is switched off (controls.enabled = false) while a control, a zoom slide or a selection
  // box owns the finger.
  onDown(e) {
    // a primary pointer going down means no other finger is down: forget pointers whose 'up' got
    // lost (otherwise every later tap counts as a two-finger gesture and the lab stops reacting)
    if (e.isPrimary) {
      if (this.pointers.size) {
        if (this.active) this.releaseControl(true);
        this.pointers.clear();
        for (const s of this.scene.all) s.controls.enabled = true;
      }
      if (this.scene.active && this.scene.active.resetPointers) this.scene.active.resetPointers();
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size > 1) { this.down = null; this.releaseControl(true); this.endGesture(); return; }
    this.chooser.classList.add('hidden');
    const d = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    this.down = d;
    if (this.mode === 'operate') {
      const ctl = this.scene.pickControl(e.clientX, e.clientY);
      if (ctl) { this.pressControl(ctl, e); return; }
    }
    // second press of a double tap: sliding zooms (Google Maps), releasing zooms in a step
    const first = this.taps.second(e.clientX, e.clientY);
    if (first) { d.zoomCand = first; this.holdControls(d); return; }
    if (this.selectTool) { d.boxCand = true; this.holdControls(d); return; }
    // press and hold on an empty spot, then drag: selection box
    this.boxTimer = setTimeout(() => {
      if (this.down !== d || d.moved) return;
      if (this.scene.pickDevice(d.x, d.y) || (this.mode === 'wire' && this.scene.portsNear(d.x, d.y, 24).length)) return;
      d.boxCand = true;
      this.holdControls(d);
      this.box.start(d.x, d.y);
      Native.vibrate(14);
    }, 380);
  }

  /** Stop orbit / pan for the rest of this press. */
  holdControls(d) { d.held = true; this.scene.controls.enabled = false; }

  endGesture() {
    clearTimeout(this.boxTimer);
    this.box.cancel();
    if (!this.active) this.scene.controls.enabled = true;
  }

  pressControl(ctl, e) {
    this.scene.controls.enabled = false;
    this.active = { ctl, id: e.pointerId };
    try { this.host.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    this.down = null;
    const sys = this.scene.system;
    switch (ctl.action) {
      case 'press': sys.act(ctl.devId, 'press', true); Native.vibrate(10); break;
      case 'toggle': sys.act(ctl.devId, 'toggle'); Native.vibrate(14); this.lab.save(); this.scene.renderer.shadowMap.needsUpdate = true; this.scene.dirty = true; break;
      case 'vfdKey': {
        if (!this.lab.sys) { toast('Press Simulate to power the drive'); break; }
        sys.act(ctl.devId, 'vfdKey', ctl.key);
        const m = this.scene.modelOf(ctl.devId); if (m && m.press) m.press(ctl.key);
        Native.vibrate(8);
        break;
      }
      case 'hmi': {
        const rt = sys.rts.get(ctl.devId);
        if (rt && rt.hmi && ctl.uv) { rt.hmi.pointerDown(ctl.uv.x * 800, (1 - ctl.uv.y) * 480, e.pointerId); Native.vibrate(6); }
        if (!this.lab.sys) toast('The HMI is off — press Simulate');
        break;
      }
      case 'pot': this.openPot(ctl.devId); break;
      case 'laptop': break;
      default: break;
    }
  }

  onMove(e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = this.down;
    if (!d || d.id !== e.pointerId) return;
    const dist = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (dist > 8 && !d.moved) { d.moved = true; if (!d.boxCand) clearTimeout(this.boxTimer); }
    if (d.zoomCand && !d.zooming && dist > 7) {
      d.zooming = true;
      // the first tap of the double tap must not leave a half-started wire behind
      if (d.zoomCand.extra && d.zoomCand.extra.wiringStarted && this.wiring) this.cancelWiring();
      this.scene.zoomStart(d.x, d.y);
    }
    if (d.zooming) { this.scene.zoomTo(slideZoomFactor(e.clientY - d.y)); return; }
    if (d.boxCand && dist > 7) {
      if (!this.box.active) this.box.start(d.x, d.y);
      this.box.update(e.clientX, e.clientY);
    }
  }

  /** Let go of the control under the finger; cancel = the press was interrupted (no tap action). */
  releaseControl(cancel = false) {
    if (!this.active) return;
    const { ctl, id } = this.active;
    const sys = this.scene.system;
    if (ctl.action === 'press') sys.act(ctl.devId, 'press', false);
    if (ctl.action === 'hmi') { const rt = sys.rts.get(ctl.devId); if (rt && rt.hmi) rt.hmi.pointerUp(0, 0, id); }
    if (ctl.action === 'laptop' && !cancel) this.lab.setTab('ladder');
    this.active = null;
    this.scene.controls.enabled = true;
  }

  onUp(e, cancel) {
    this.pointers.delete(e.pointerId);
    if (this.active && this.active.id === e.pointerId) { this.releaseControl(); return; }
    const d = this.down;
    this.down = null;
    clearTimeout(this.boxTimer);
    if (d && d.held && !this.active) this.scene.controls.enabled = true;
    if (!d || d.id !== e.pointerId) return;
    if (cancel) { this.box.cancel(); return; }
    if (d.zooming) return;
    if (this.box.active) { this.boxSelect(this.box.end()); return; }
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (moved > 9 || performance.now() - d.t > 600) return;
    if (d.zoomCand) {
      this.taps.clear();
      if (!this.hitsSomething(e.clientX, e.clientY)) { this.scene.zoomAt(2, e.clientX, e.clientY); return; }
      this.tap(e.clientX, e.clientY);
      return;
    }
    const before = this.wiring;
    this.tap(e.clientX, e.clientY);
    this.taps.tap(e.clientX, e.clientY, { wiringStarted: !before && !!this.wiring });
  }

  /** Is there a device, a cable or (in Wire mode) a terminal under the point? */
  hitsSomething(x, y) {
    if (this.mode === 'wire' && (this.scene.portsNear(x, y, 30).length || this.scene.pickCable(x, y))) return true;
    return !!this.scene.pickDevice(x, y);
  }

  tap(x, y) {
    if (this.selectTool) {
      // Select tool: tapping adds a device / cable to the selection or removes it
      const cable = this.scene.pickCable(x, y);
      const dev = cable ? null : this.scene.pickDevice(x, y);
      if (cable) this.toggleInSelection([], [cable]);
      else if (dev) this.toggleInSelection([dev], []);
      else this.select(null);
      return;
    }
    if (this.mode === 'wire') {
      const filter = this.wiring ? (dev, port) => this.canEnd(dev, port) : null;
      const near = this.scene.portsNear(x, y, this.wiring ? 38 : 30, filter);
      if (near.length) {
        const amb = near.filter((p) => p.d <= near[0].d * 1.4 + 7).slice(0, 6);
        if (amb.length > 1 && near[0].d > 6) this.showChooser(amb, x, y);
        else this.portTapped(near[0].dev, near[0].port);
        return;
      }
      const cable = this.scene.pickCable(x, y);
      if (cable) { this.select({ kind: 'conn', id: cable }); return; }
    }
    const dev = this.scene.pickDevice(x, y);
    if (dev) { this.select({ kind: 'dev', id: dev }); return; }
    if (this.wiring) { this.hint('Tap a highlighted terminal to finish the wire, or Cancel'); return; }
    this.select(null);
  }

  showChooser(list, x, y) {
    const r = this.el.getBoundingClientRect();
    this.chooser.innerHTML = '';
    this.chooser.appendChild(h('div', { class: 'pc-title' }, 'Which terminal?'));
    for (const p of list) {
      this.chooser.appendChild(h('button', { class: 'pc-item', onclick: () => { this.chooser.classList.add('hidden'); this.portTapped(p.dev, p.port); } },
        h('b', {}, p.port.label), h('small', {}, this.lab.deviceName(p.dev))));
    }
    this.chooser.style.left = Math.max(8, Math.min(r.width - 190, x - r.left - 90)) + 'px';
    this.chooser.style.top = Math.max(8, Math.min(r.height - 60 - list.length * 46, y - r.top + 18)) + 'px';
    this.chooser.classList.remove('hidden');
    Native.vibrate(6);
  }

  // ------------------------------------------------------------------ wiring
  maxFor(port) { return port.kind === 'comm' ? port.max || 1 : MAX_WIRES; }

  canEnd(dev, port) {
    const w = this.wiring;
    if (!w) return true;
    if (w.devId === dev.id && w.port.id === port.id) return false;
    if (compatible(w.port, port)) return false;
    if (portUse(this.lab.project, dev.id, port.id) >= this.maxFor(port)) return false;
    return true;
  }

  portTapped(dev, port) {
    if (!this.wiring) {
      if (portUse(this.lab.project, dev.id, port.id) >= this.maxFor(port)) {
        toast(port.kind === 'comm' ? `${port.label} already has a cable — tap the cable to remove it` : `${port.label} already has ${MAX_WIRES} wires`, 'warn');
        return;
      }
      this.wiring = { devId: dev.id, port };
      this.select(null);
      this.showWireBar(dev, port);
      const marks = [{ devId: dev.id, portId: port.id, color: '#fbbf24', pulse: true }];
      for (const d of this.lab.project.devices) for (const p of devicePorts(d)) if (this.canEnd(d, p)) marks.push({ devId: d.id, portId: p.id, color: '#34d399' });
      this.scene.setMarkers(marks);
      Native.vibrate(10);
      return;
    }
    const w = this.wiring;
    if (w.devId === dev.id && w.port.id === port.id) { this.cancelWiring(); return; }
    const why = compatible(w.port, port);
    if (why) { toast(why, 'warn'); return; }
    const P = this.lab.project;
    if (P.conns.some((c) => (c.a.dev === w.devId && c.a.port === w.port.id && c.b.dev === dev.id && c.b.port === port.id) || (c.b.dev === w.devId && c.b.port === w.port.id && c.a.dev === dev.id && c.a.port === port.id))) { toast('These two are already connected', 'warn'); return; }
    const conn = makeConn(P.devices, w.devId, w.port.id, dev.id, port.id, this.wireColor === 'auto' ? null : this.wireColor);
    P.conns.push(conn);
    const extra = this.autoBundle(w.devId, w.port.id, dev.id, port.id);
    const fromDev = P.devices.find((d) => d.id === w.devId);
    this.cancelWiring();
    this.lab.commitHardware('Wire', { devices: false });
    Native.vibrate(14);
    toast(`${this.lab.deviceName(fromDev)} ${w.port.label} → ${this.lab.deviceName(dev)} ${port.label}${extra.length ? ` (+ ${extra.join(', ')})` : ''}`, 'ok');
  }

  autoBundle(da, pa, db, pb) {
    const P = this.lab.project;
    const out = [];
    for (const [g1, g2] of BUNDLES) {
      for (const [A, AP, B, BP, G1, G2] of [[da, pa, db, pb, g1, g2], [db, pb, da, pa, g1, g2]]) {
        const i = G1.indexOf(AP);
        if (i < 0 || G2[i] !== BP) continue;
        const devA = P.devices.find((d) => d.id === A), devB = P.devices.find((d) => d.id === B);
        if (!G1.every((p) => findPort(devA, p)) || !G2.every((p) => findPort(devB, p))) continue;
        G1.forEach((p, k) => {
          if (k === i) return;
          if (portUse(P, A, p) >= MAX_WIRES || portUse(P, B, G2[k]) > 0) return;
          P.conns.push(makeConn(P.devices, A, p, B, G2[k]));
          out.push(G2[k]);
        });
        return out;
      }
    }
    return out;
  }

  showWireBar(dev, port) {
    const bar = this.wireBar;
    bar.innerHTML = '';
    const pal = h('div', { class: 'wire-colors' });
    for (const [c, label] of WIRE_COLORS) {
      const sw = c === 'auto' ? `<span class="auto-dot" style="background:${wireColorFor(port.sig)}"></span>` : '';
      pal.appendChild(h('button', { class: 'color-dot sm' + (this.wireColor === c ? ' active' : '') + (c === 'auto' ? ' auto' : '') + (c === 'pe' ? ' pe' : ''), title: label, style: { background: c === 'auto' || c === 'pe' ? '' : c }, html: sw, onclick: (e) => { this.wireColor = c; for (const x of pal.children) x.classList.remove('active'); e.currentTarget.classList.add('active'); } }));
    }
    const kind = port.kind === 'comm' ? `${busName(port.bus)} cable` : 'wire';
    appendAll(bar,
      h('div', { class: 'wire-info', html: `${icon(port.kind === 'comm' ? 'plug' : 'wire', 18)}<span><b>${esc(this.lab.deviceName(dev))} · ${esc(port.label)}</b> — tap the other end of the ${kind}</span>` }),
      port.kind === 'comm' ? null : pal,
      h('div', { class: 'wire-actions' }, h('button', { class: 'btn btn-ghost sm', html: `${icon('close', 17)}<span>Cancel</span>`, onclick: () => this.cancelWiring() })));
    bar.classList.remove('hidden');
  }

  cancelWiring() {
    if (!this.wiring) return;
    this.wiring = null;
    this.wireBar.classList.add('hidden');
    this.scene.setMarkers([]);
  }

  // ------------------------------------------------------------------ selection
  /** Select what a selection box caught (window: inside, crossing: touching). */
  boxSelect(res) {
    if (!res) return;
    const got = this.scene.itemsInRect(res.rect, res.mode);
    // with the Select tool every new box adds to the selection, as in AutoCAD
    if (this.selectTool) {
      const cur = this.selectedIds();
      got.devs.unshift(...cur.devs.filter((id) => !got.devs.includes(id)));
      got.conns.unshift(...cur.conns.filter((id) => !got.conns.includes(id)));
    }
    this.select(labSelection(got.devs, got.conns));
    Native.vibrate(8);
  }

  selectedIds() {
    const s = this.sel;
    if (!s) return { devs: [], conns: [] };
    if (s.kind === 'multi') return { devs: [...s.devs], conns: [...s.conns] };
    return s.kind === 'dev' ? { devs: [s.id], conns: [] } : { devs: [], conns: [s.id] };
  }

  toggleInSelection(devs, conns) {
    const cur = this.selectedIds();
    const flip = (arr, ids) => { for (const id of ids) { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); else arr.push(id); } };
    flip(cur.devs, devs); flip(cur.conns, conns);
    this.select(labSelection(cur.devs, cur.conns));
    Native.vibrate(6);
  }

  select(sel) {
    this.sel = sel;
    if (sel && sel.kind === 'multi') this.scene.selectMany(sel.devs, sel.conns);
    else {
      this.scene.selectMany([], []);
      this.scene.selectDevice(sel && sel.kind === 'dev' ? sel.id : null);
      this.scene.selectCable(sel && sel.kind === 'conn' ? sel.id : null);
    }
    const bar = this.selBar;
    bar.innerHTML = '';
    if (!sel) { bar.classList.add('hidden'); return; }
    const P = this.lab.project;
    const btn = (ic, label, fn, cls = '') => h('button', { class: 'sel-btn ' + cls, html: `${icon(ic, 20)}<span>${label}</span>`, onclick: fn });
    if (sel.kind === 'multi') {
      const devs = sel.devs.filter((id) => P.devices.some((d) => d.id === id));
      const conns = sel.conns.filter((id) => P.conns.some((c) => c.id === id));
      if (devs.length + conns.length < 2) { this.select(labSelection(devs, conns)); return; }
      const what = [devs.length ? `${devs.length} device${devs.length > 1 ? 's' : ''}` : '', conns.length ? `${conns.length} wire${conns.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
      const wires = P.conns.filter((c) => conns.includes(c.id) && !c.comm);
      appendAll(bar,
        h('div', { class: 'sel-name' }, `${devs.length + conns.length} selected`, h('small', {}, what)),
        wires.length && !devs.length ? btn('palette', 'Colour', () => this.recolorMany(wires)) : null,
        btn('trash', 'Delete', () => this.deleteMany(devs, conns), 'danger'),
        h('button', { class: 'sel-close', html: icon('close', 18), onclick: () => this.select(null) }));
      bar.classList.remove('hidden');
      return;
    }
    if (sel.kind === 'dev') {
      const dev = P.devices.find((d) => d.id === sel.id);
      if (!dev) { bar.classList.add('hidden'); return; }
      const def = DEVICE_DEFS[dev.type];
      appendAll(bar,
        h('div', { class: 'sel-name' }, this.lab.deviceName(dev), h('small', {}, def.part || def.name)),
        btn('target', 'Focus', () => this.scene.focus(dev.id)),
        btn('sliders', 'Settings', () => this.openDevice(dev)),
        def.sim === 'vfd' ? btn('gauge', 'Keypad', () => this.lab.setTab('vfd')) : def.sim === 'hmi' ? btn('screen', 'Screens', () => this.lab.setTab('hmi')) : def.sim === 'plc' ? btn('ladder', 'Ladder', () => this.lab.setTab('ladder')) : null,
        btn('trash', 'Delete', () => this.deleteDevice(dev), 'danger'),
        h('button', { class: 'sel-close', html: icon('close', 18), onclick: () => this.select(null) }));
    } else {
      const c = P.conns.find((x) => x.id === sel.id);
      if (!c) { bar.classList.add('hidden'); return; }
      const da = P.devices.find((d) => d.id === c.a.dev), db = P.devices.find((d) => d.id === c.b.dev);
      const pa = findPort(da, c.a.port), pb = findPort(db, c.b.port);
      appendAll(bar,
        h('div', { class: 'sel-name' }, c.comm ? `${busName(pa.bus)} cable` : 'Wire', h('small', {}, `${this.lab.deviceName(da)} ${pa.label} ↔ ${this.lab.deviceName(db)} ${pb.label}`)),
        c.comm ? null : btn('palette', 'Colour', () => this.recolor(c)),
        btn('trash', 'Delete', () => { P.conns = P.conns.filter((x) => x.id !== c.id); this.select(null); this.lab.commitHardware('Delete wire', { devices: false }); Native.vibrate(12); }, 'danger'),
        h('button', { class: 'sel-close', html: icon('close', 18), onclick: () => this.select(null) }));
    }
    bar.classList.remove('hidden');
  }

  recolor(c) {
    const content = h('div', { class: 'color-grid' });
    const sheet = new Sheet({ title: 'Wire colour', content, icon: 'palette' });
    for (const [col, label] of WIRE_COLORS.slice(1)) {
      content.appendChild(h('button', { class: 'color-dot' + (c.color === col ? ' active' : '') + (col === 'pe' ? ' pe' : ''), title: label, style: { background: col === 'pe' ? '' : col }, onclick: () => { c.color = col; sheet.close(); this.lab.commitHardware('Colour', { devices: false }); this.select({ kind: 'conn', id: c.id }); } }));
    }
    sheet.open();
  }

  recolorMany(wires) {
    const content = h('div', { class: 'color-grid' });
    const sheet = new Sheet({ title: `Colour of ${wires.length} wires`, content, icon: 'palette' });
    for (const [col, label] of WIRE_COLORS.slice(1)) {
      content.appendChild(h('button', { class: 'color-dot' + (col === 'pe' ? ' pe' : ''), title: label, style: { background: col === 'pe' ? '' : col }, onclick: () => { for (const c of wires) c.color = col; sheet.close(); const keep = this.sel; this.lab.commitHardware('Colour', { devices: false }); this.select(keep); } }));
    }
    sheet.open();
  }

  async deleteMany(devs, conns) {
    const P = this.lab.project;
    if (devs.length) {
      const n = P.conns.filter((c) => conns.includes(c.id) || devs.includes(c.a.dev) || devs.includes(c.b.dev)).length;
      if (!(await confirmDialog('Delete selection?', `${devs.length} device(s) and ${n} connection(s) will be removed.`, 'Delete', true))) return;
    }
    P.devices = P.devices.filter((d) => !devs.includes(d.id));
    P.conns = P.conns.filter((c) => !conns.includes(c.id) && !devs.includes(c.a.dev) && !devs.includes(c.b.dev));
    this.select(null);
    this.lab.commitHardware('Delete', { devices: devs.length > 0 });
    Native.vibrate(12);
  }

  async deleteDevice(dev) {
    if (!(await confirmDialog('Delete device?', `${this.lab.deviceName(dev)} and its ${this.lab.project.conns.filter((c) => c.a.dev === dev.id || c.b.dev === dev.id).length} connection(s) will be removed.`, 'Delete', true))) return;
    const P = this.lab.project;
    P.devices = P.devices.filter((d) => d.id !== dev.id);
    P.conns = P.conns.filter((c) => c.a.dev !== dev.id && c.b.dev !== dev.id);
    this.select(null);
    this.lab.commitHardware('Delete device');
  }

  // ------------------------------------------------------------------ device library
  openLibrary() {
    const content = h('div', { class: 'lib dev-lib' });
    const P = this.lab.project;
    for (const cat of CATEGORIES) {
      const defs = Object.values(DEVICE_DEFS).filter((d) => d.category === cat.id);
      if (!defs.length) continue;
      content.appendChild(h('div', { class: 'lib-cat', html: `${icon(cat.icon, 16)}<span>${cat.name}</span>` }));
      const grid = h('div', { class: 'lib-grid dev-grid' });
      for (const def of defs) {
        const count = P.devices.filter((d) => d.type === def.type).length;
        const full = count >= def.max || (def.category === 'plc' && P.devices.some((d) => DEVICE_DEFS[d.type].category === 'plc'));
        const img = h('img', { class: 'dev-thumb', alt: '' });
        const card = h('button', { class: 'lib-card dev-card' + (full ? ' disabled' : ''), onclick: () => { if (full) { toast(def.category === 'plc' ? 'The lab has one PLC — delete it first to change the model' : `Maximum ${def.max} × ${def.short}`, 'warn'); return; } sheet.close(); this.addDevice(def); } },
          h('div', { class: 'lib-thumb' }, img),
          h('div', { class: 'lib-name' }, def.short),
          h('div', { class: 'lib-sub' }, def.brand ? `${def.brand} · ${def.part}` : def.part || def.name));
        grid.appendChild(card);
        const key = def.type;
        if (thumbs.has(key)) img.src = thumbs.get(key);
        else requestAnimationFrame(() => { try { const url = this.scene.thumbnail({ id: 'thumb', type: def.type, props: {}, state: {} }); thumbs.set(key, url); img.src = url; } catch (e) { /* ignore */ } });
      }
      content.appendChild(grid);
    }
    const sheet = new Sheet({ title: 'Add device', content, cls: 'sheet-tall', icon: 'plus' });
    sheet.open();
  }

  addDevice(def) {
    const P = this.lab.project;
    const dev = { id: labId('d'), type: def.type, props: {}, state: { ...(def.state || {}) } };
    if (def.sim === 'pb') {
      const n = P.devices.filter((d) => d.type === 'pb').length;
      dev.props = [{ label: 'START', color: 'green', contact: 'NO' }, { label: 'STOP', color: 'red', contact: 'NC' }, { label: 'JOG', color: 'yellow', contact: 'NO' }, { label: 'RESET', color: 'blue', contact: 'NO' }][n % 4];
    }
    if (def.sim === 'lamp') {
      const n = P.devices.filter((d) => d.type === 'lamp').length;
      dev.props = [{ label: 'RUN', color: 'green' }, { label: 'FAULT', color: 'red' }, { label: 'READY', color: 'yellow' }, { label: 'POWER', color: 'white' }][n % 4];
    }
    P.devices.push(dev);
    let tip = `${def.short} added. In ⚡ Wire mode tap one of its terminals, then the terminal it connects to.`;
    if (def.sim === 'hmi') {
      tip = 'HMI added. Wire + / − to the 24 V supply and COM1 to PLC COM1. A starter screen uses M10 = START, M11 = STOP, Y0 = RUN.';
      if (P.hmi.screens.every((s) => !s.elements.length)) P.hmi.screens[0].elements = starterScreen();
    } else if (def.sim === 'vfd') tip = 'Drive added. Wire MCB L / N → R/L1 · S/L2 and U/T1 V/T2 W/T3 → motor. For Modbus, plug RS-485 (RJ45) into PLC COM2.';
    else if (def.sim === 'motor') tip = 'Motor added. Tap U/T1 on the drive, then U on the motor — V and W are connected for you.';
    else if (def.sim === 'psu') tip = 'Power supply added. Tap L on the MCB, then L on the supply — N and ⏚ follow automatically.';
    this.lab.commitHardware('Add ' + def.short);
    this.select({ kind: 'dev', id: dev.id });
    setTimeout(() => this.scene.focus(dev.id), 60);
    this.setMode('wire');
    this.hint(tip, 6500);
    Native.vibrate(10);
  }

  // ------------------------------------------------------------------ device settings
  openDevice(dev) {
    const def = DEVICE_DEFS[dev.type];
    const content = h('div', { class: 'props dev-props' });
    const props = deviceProps(dev);
    const img = h('img', { class: 'dev-thumb' });
    if (thumbs.has(dev.type)) img.src = thumbs.get(dev.type); else { try { img.src = this.scene.thumbnail(dev); } catch (e) { /* ignore */ } }
    content.appendChild(h('div', { class: 'props-head' }, h('div', { class: 'props-thumb' }, img),
      h('div', { class: 'props-info' }, h('div', { class: 'props-cat' }, def.brand ? `${def.brand} · ${def.part}` : def.part || ''), h('div', { class: 'props-desc' }, def.description))));
    const apply = (k, v) => { dev.props = { ...(dev.props || {}), [k]: v }; this.lab.commitHardware('Change ' + k); };
    for (const pr of def.props) {
      const row = h('div', { class: 'field' }, h('label', {}, pr.label));
      const cur = props[pr.id];
      if (pr.type === 'select') {
        const seg = h('div', { class: 'opt-grid' });
        for (const [v, label] of Object.entries(pr.options)) {
          const b = h('button', { class: 'opt' + (String(cur) === v ? ' active' : ''), onclick: () => { for (const x of seg.children) x.classList.remove('active'); b.classList.add('active'); apply(pr.id, v); } });
          b.innerHTML = pr.id === 'color' ? `<i class="swatch sw-${v === 'yellow' ? 'yellow' : v}"></i>${label}` : label;
          seg.appendChild(b);
        }
        row.appendChild(seg);
      } else if (pr.type === 'number') {
        const inp = h('input', { class: 'input', type: 'number', value: cur, min: pr.min, max: pr.max });
        inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (Number.isFinite(v)) apply(pr.id, Math.max(pr.min ?? -1e9, Math.min(pr.max ?? 1e9, v))); });
        row.appendChild(inp);
      } else {
        const inp = h('input', { class: 'input', value: cur ?? '', maxlength: 12 });
        inp.addEventListener('change', () => apply(pr.id, inp.value.toUpperCase().slice(0, 12)));
        row.appendChild(inp);
      }
      content.appendChild(row);
    }
    // connections of this device
    const P = this.lab.project;
    const list = h('div', { class: 'conn-list' });
    const drawList = () => {
      list.innerHTML = '';
      const ports = devicePorts(dev);
      for (const port of ports) {
        const cs = P.conns.filter((c) => (c.a.dev === dev.id && c.a.port === port.id) || (c.b.dev === dev.id && c.b.port === port.id));
        const row = h('div', { class: 'conn-row' + (cs.length ? '' : ' empty') }, h('span', { class: 'conn-port' }, port.label));
        const right = h('div', { class: 'conn-targets' });
        if (!cs.length) right.appendChild(h('span', { class: 'muted small' }, '—'));
        for (const c of cs) {
          const other = c.a.dev === dev.id && c.a.port === port.id ? c.b : c.a;
          const od = P.devices.find((d) => d.id === other.dev);
          const op = findPort(od, other.port);
          right.appendChild(h('span', { class: 'conn-chip' },
            h('i', { class: 'conn-dot' + (c.color === 'pe' ? ' pe' : ''), style: { background: c.comm ? '#64748b' : c.color === 'pe' ? '' : c.color } }),
            `${this.lab.deviceName(od)} ${op ? op.label : other.port}`,
            h('button', { class: 'conn-x', html: icon('close', 13), onclick: () => { P.conns = P.conns.filter((x) => x.id !== c.id); this.lab.commitHardware('Delete wire', { devices: false }); drawList(); } })));
        }
        row.appendChild(right);
        list.appendChild(row);
      }
    };
    drawList();
    content.append(h('div', { class: 'field' }, h('label', {}, 'Terminals & connections'), list));
    const zoneDevs = () => P.devices.filter((d) => DEVICE_DEFS[d.type].zone === def.zone);
    const move = (dir) => {
      const arr = zoneDevs();
      const i = arr.indexOf(dev), j = i + dir;
      if (j < 0 || j >= arr.length) return;
      const a = P.devices.indexOf(arr[i]), b = P.devices.indexOf(arr[j]);
      [P.devices[a], P.devices[b]] = [P.devices[b], P.devices[a]];
      this.lab.commitHardware('Move');
    };
    content.appendChild(h('div', { class: 'props-actions' },
      zoneDevs().length > 1 ? h('button', { class: 'btn btn-ghost', html: `${icon('arrowLeft', 18)}<span>Move</span>`, onclick: () => move(-1) }) : null,
      zoneDevs().length > 1 ? h('button', { class: 'btn btn-ghost', html: `<span>Move</span>${icon('arrowRight', 18)}`, onclick: () => move(1) }) : null,
      h('button', { class: 'btn btn-danger-ghost', html: `${icon('trash', 18)}<span>Delete</span>`, onclick: () => { sheet.close(); this.deleteDevice(dev); } })));
    const sheet = new Sheet({ title: this.lab.deviceName(dev), content, cls: 'sheet-tall', icon: 'sliders' });
    sheet.open();
  }

  // ------------------------------------------------------------------ wiring list
  openWiringList() {
    const P = this.lab.project;
    const content = h('div', { class: 'wiring-list' });
    const draw = () => {
      content.innerHTML = '';
      const add = h('div', { class: 'add-conn card' });
      const selDev = (cb) => {
        const s = h('select', { class: 'select' }, h('option', { value: '' }, 'Device…'), ...P.devices.map((d) => h('option', { value: d.id }, this.lab.deviceName(d))));
        s.addEventListener('change', cb);
        return s;
      };
      const selPort = () => h('select', { class: 'select' }, h('option', { value: '' }, 'Terminal…'));
      const pa = selPort(), pb = selPort();
      const fill = (devSel, portSel) => {
        portSel.innerHTML = '';
        portSel.appendChild(h('option', { value: '' }, 'Terminal…'));
        const d = P.devices.find((x) => x.id === devSel.value);
        if (d) for (const p of devicePorts(d)) portSel.appendChild(h('option', { value: p.id }, p.label + (p.kind === 'comm' ? '' : '')));
      };
      const da = selDev(() => fill(da, pa)), db = selDev(() => fill(db, pb));
      add.append(h('b', {}, 'Add a connection'),
        h('div', { class: 'add-row' }, da, pa), h('div', { class: 'add-row' }, db, pb),
        h('button', { class: 'btn btn-primary sm', html: `${icon('plus', 16)}<span>Connect</span>`, onclick: () => {
          const A = P.devices.find((x) => x.id === da.value), B = P.devices.find((x) => x.id === db.value);
          if (!A || !B || !pa.value || !pb.value) { toast('Choose both ends'); return; }
          const why = compatible(findPort(A, pa.value), findPort(B, pb.value));
          if (why) { toast(why, 'warn'); return; }
          if (A.id === B.id && pa.value === pb.value) return;
          P.conns.push(makeConn(P.devices, A.id, pa.value, B.id, pb.value));
          this.lab.commitHardware('Wire', { devices: false });
          draw();
        } }));
      content.appendChild(add);
      if (!P.conns.length) content.appendChild(h('p', { class: 'muted center' }, 'No connections yet'));
      for (const c of P.conns) {
        const A = P.devices.find((d) => d.id === c.a.dev), B = P.devices.find((d) => d.id === c.b.dev);
        const pA = findPort(A, c.a.port), pB = findPort(B, c.b.port);
        content.appendChild(h('div', { class: 'wl-row', onclick: () => { sheet.close(); this.lab.setTab('panel'); this.setMode('wire'); this.select({ kind: 'conn', id: c.id }); } },
          h('i', { class: 'conn-dot' + (c.color === 'pe' ? ' pe' : ''), style: { background: c.comm ? '#64748b' : c.color === 'pe' ? '' : c.color } }),
          h('div', { class: 'wl-text' }, h('b', {}, `${this.lab.deviceName(A)} · ${pA ? pA.label : c.a.port}`), h('span', {}, `→ ${this.lab.deviceName(B)} · ${pB ? pB.label : c.b.port}`)),
          h('button', { class: 'icon-btn sm', html: icon('trash', 17), onclick: (e) => { e.stopPropagation(); P.conns = P.conns.filter((x) => x.id !== c.id); this.lab.commitHardware('Delete wire', { devices: false }); draw(); } })));
      }
    };
    draw();
    const sheet = new Sheet({ title: `Wiring list (${P.conns.length})`, content, cls: 'sheet-tall', icon: 'list' });
    sheet.open();
  }

  // ------------------------------------------------------------------ issues
  showIssues() {
    let issues;
    if (this.lab.sys) issues = this.lab.sys.issues;
    else {
      const probe = new LabSystem(JSON.parse(JSON.stringify(this.lab.project)));
      for (let i = 0; i < 40; i++) probe.step(20);
      issues = probe.issues;
    }
    const content = h('div', { class: 'issue-list' });
    if (!issues.length) content.appendChild(h('div', { class: 'empty-state small' }, h('div', { class: 'empty-ic big', html: icon('check', 34) }), h('h2', {}, 'All good'), h('p', {}, 'Power, wiring and communication look fine.')));
    for (const it of issues) {
      const dev = it.devId && this.lab.project.devices.find((d) => d.id === it.devId);
      content.appendChild(h('div', { class: 'issue issue-' + it.level },
        h('span', { class: 'issue-ic', html: icon(it.level === 'info' ? 'info' : 'warning', 18) }),
        h('div', { class: 'issue-text' }, it.text),
        dev ? h('button', { class: 'btn btn-ghost sm', html: `${icon('target', 15)}<span>Show</span>`, onclick: () => { sheet.close(); this.lab.setTab('panel'); this.scene.focus(dev.id); this.select({ kind: 'dev', id: dev.id }); } }) : null));
    }
    if (!this.lab.sys) content.appendChild(h('p', { class: 'muted small center' }, 'Checked with a short test run. Press Simulate to run the lab.'));
    const sheet = new Sheet({ title: 'Lab check', content, icon: 'warning', cls: 'sheet-tall' });
    sheet.open();
  }

  // ------------------------------------------------------------------ potentiometer
  openPot(devId) {
    this.closePot();
    const dev = this.lab.project.devices.find((d) => d.id === devId);
    if (!dev) return;
    const val = h('b', {}, '');
    const range = h('input', { class: 'range', type: 'range', min: 0, max: 100, value: Math.round((dev.state.pos ?? 0.5) * 100) });
    const upd = () => { const v = +range.value / 100; this.scene.system.act(devId, 'pos', v); val.textContent = `${range.value}%  ·  ${(v * 10).toFixed(1)} V`; this.scene.dirty = true; };
    range.addEventListener('input', upd);
    range.addEventListener('change', () => this.lab.save());
    this.potCard = h('div', { class: 'pot-card' },
      h('div', { class: 'ctl-head' }, h('label', {}, `${deviceProps(dev).label || 'Potentiometer'}`), val), range,
      h('button', { class: 'sel-close', html: icon('close', 18), onclick: () => this.closePot() }));
    this.el.appendChild(this.potCard);
    upd();
  }

  closePot() { if (this.potCard) { this.potCard.remove(); this.potCard = null; } }
}

/** Selection for lists of device / cable ids: null, one device or cable, or 'multi'. */
function labSelection(devs, conns) {
  if (devs.length + conns.length === 0) return null;
  if (devs.length + conns.length === 1) return devs.length ? { kind: 'dev', id: devs[0] } : { kind: 'conn', id: conns[0] };
  return { kind: 'multi', devs, conns };
}

/** Default HMI screen created when an HMI is added to a lab without screens. */
function starterScreen() {
  const id = () => 'e' + Math.random().toString(36).slice(2, 9);
  return [
    { id: id(), type: 'rect', x: 12, y: 10, w: 776, h: 58, fill: '#10224a', stroke: '#2b4470', radius: 14, title: '' },
    { id: id(), type: 'text', x: 30, y: 22, w: 560, h: 36, text: 'MACHINE CONTROL', size: 26, color: '#e2e8f0', align: 'left', bold: true },
    { id: id(), type: 'lamp', x: 660, y: 18, w: 110, h: 42, bit: 'Y0', text: 'RUN', onColor: '#22c55e', offColor: '#334155', shape: 'rect' },
    { id: id(), type: 'button', x: 40, y: 110, w: 220, h: 90, text: 'START', bit: 'M10', mode: 'momentary', color: 'green' },
    { id: id(), type: 'button', x: 40, y: 220, w: 220, h: 90, text: 'STOP', bit: 'M11', mode: 'momentary', color: 'red' },
    { id: id(), type: 'motor', x: 300, y: 110, w: 200, h: 200, bit: 'Y0', text: 'MOTOR' },
    { id: id(), type: 'num', x: 540, y: 110, w: 230, h: 80, word: 'D0', dec: 0, unit: '', label: 'VALUE D0' },
    { id: id(), type: 'input', x: 540, y: 220, w: 230, h: 80, word: 'D10', dec: 0, unit: '', label: 'SET POINT D10', min: 0, max: 9999 },
    { id: id(), type: 'alarm', x: 40, y: 350, w: 730, h: 50, bit: 'M100', text: 'ALARM (M100)' },
  ];
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/** Element.append without the null / false placeholders of optional buttons. */
function appendAll(parent, ...items) { parent.append(...items.filter(Boolean)); }
