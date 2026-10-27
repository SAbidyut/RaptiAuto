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
import { defaultParams } from '../sim/vfd.js';
import { fmtName } from '../sim/modbus.js';
import { openCommSheet } from './comm-sheet.js';
import { FaultTools } from './faults.js';
import { STEP_GUIDES } from '../guides.js';

const WIRE_COLORS = [['auto', 'Auto'], ['#dc2626', 'Red'], ['#1e3a8a', 'Dark blue'], ['#2563eb', 'Blue'], ['#7c4a1e', 'Brown'], ['#f97316', 'Orange'], ['#e5e7eb', 'White'], ['#111827', 'Black'], ['#a855f7', 'Violet'], ['#eab308', 'Yellow'], ['pe', 'Earth']];
const thumbs = new Map();

// connect the rest of a group automatically (U→U, V→V, W→W; L/N/PE)
const BUNDLES = [
  [['U/T1', 'V/T2', 'W/T3', 'PE'], ['U', 'V', 'W', 'PE']],
  [['L', 'N', 'PE'], ['L', 'N', 'PE']],
  [['L', 'N', 'PE'], ['R/L1', 'S/L2', 'PE']],
  // drive → contactor / overload relay → motor: the three phases go together
  [['U/T1', 'V/T2', 'W/T3'], ['L1', 'L2', 'L3']],
  [['T1', 'T2', 'T3'], ['L1', 'L2', 'L3']],
  [['T1', 'T2', 'T3'], ['U', 'V', 'W']],
  // 3-phase supply → contactor / breaker, contactor / overload relay → the 6-terminal motor
  [['L1', 'L2', 'L3'], ['L1', 'L2', 'L3']],
  [['T1', 'T2', 'T3'], ['U1', 'V1', 'W1']],
  [['T1', 'T2', 'T3'], ['W2', 'U2', 'V2']],
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
    this.updateEmpty();
    if (this.no3d) setTimeout(() => this.hint('3D needs WebGL 2, which this phone does not have — showing the 2D wiring schematic.', 6000), 500);
    else if (!localStorage.getItem('raptiauto.plc.hinted')) {
      try { localStorage.setItem('raptiauto.plc.hinted', '1'); } catch (e) { /* ignore */ }
      setTimeout(() => this.hint(this.scene.mode === '2d'
        ? '2D wiring schematic: drag to move, pinch or double-tap-and-slide to zoom. Tap 3D (bottom left) for the 3D lab. Press Simulate to power the lab.'
        : 'Drag to orbit · pinch to zoom · tap a chip below to jump to a device. Press Simulate to power the lab.', 6500), 600);
    }
    if (this.scene.mode === '3d' && !this.lab.settings.labView) this.watchSpeed();
    // a Step-by-step lab opens its guide the first time
    if (STEP_GUIDES[this.lab.project.fromExample] && !this.lab.project.guideSeen) setTimeout(() => { if (this.el.isConnected && !this.lab.project.guideSeen) this.lab.showGuide(); }, 1200);
  }

  destroy() { clearTimeout(this.speedT); this.chipsRo.disconnect(); this.scene.onLost = null; this.scene.dispose(); }

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

  onShow() {
    // coming back from another tab: forget any press that was under way when the tab changed and
    // make sure the 2D / 3D switch shows (and can change) the view that is really on screen
    this.resetGesture();
    this.updateViewSeg();
    this.scene.visible = true;
    this.scene.dirty = true;
    requestAnimationFrame(() => { this.scene.resize(); this.layoutTools(); });
  }

  onHide() { this.resetGesture(); }

  onBack() {
    if (this.potCard) { this.closePot(); return true; }
    if (this.wiring) { this.cancelWiring(); return true; }
    if (this.sel) { this.select(null); return true; }
    if (this.selectTool) { this.toggleSelectTool(false); return true; }
    return false;
  }

  onSimStart(sys) { this.setMode('operate'); this.scene.setSystem(sys); requestAnimationFrame(() => this.layoutTools()); }
  onSimStop() { this.closePot(); requestAnimationFrame(() => this.layoutTools()); }

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
      this.meterBtn = tool('meter', 'Multimeter', () => this.faults.toggleMeter()),
      tool('target', 'Fault finding', () => this.faults.openChallenge()),
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
    this.chips = h('div', { class: 'lab-chips', onscroll: () => this.updateChipFade() });
    this.chipsRo = new ResizeObserver(() => this.updateChipFade());
    this.chipsRo.observe(this.chips);
    // a short pane (landscape, split screen): the tool rail wraps into columns instead of running off the bottom
    this.toolsRo = new ResizeObserver(() => this.layoutTools());
    this.toolsRo.observe(this.el);
    this.selBar = h('div', { class: 'sel-bar hidden' });
    this.wireBar = h('div', { class: 'wire-bar lab-wirebar hidden' });
    this.hintEl = h('div', { class: 'canvas-hint lab-hint hidden' });
    // an empty bench: nothing is placed for you — this card says where to start
    this.emptyEl = h('div', { class: 'lab-empty hidden' },
      h('div', { class: 'le-ic', html: icon('plug', 30) }),
      h('b', {}, 'An empty bench'),
      h('p', {}, 'Nothing is placed or wired for you. Add what your project needs — for example the main switch (MCB), a 24 V supply, a PLC, a VFD and a motor — then wire them.'),
      h('button', { class: 'btn btn-primary', html: `${icon('plus', 18)}<span>Add a device</span>`, onclick: () => this.openLibrary() }));
    this.chooser = h('div', { class: 'port-chooser hidden' });
    // Guide | Tasks: the step-by-step guide of the lab and its self-checking tasks
    this.guideBtn = h('button', { class: 'tp-btn tp-guide', html: `${icon('book', 15)}<span>Guide</span>`, onclick: () => this.lab.showGuide() });
    this.tasksBtn = h('button', { class: 'tp-btn tp-tasks', onclick: () => this.lab.showTasks() });
    this.taskPill = h('div', { class: 'task-pill hidden' }, this.guideBtn, this.tasksBtn);
    // Network view legend: what the packets mean and the live state of the bus
    this.netCard = h('div', { class: 'net-legend hidden' });
    this.el.append(this.modeSeg, this.tools, this.viewSeg, this.chips, this.selBar, this.wireBar, this.hintEl, this.emptyEl, this.chooser, this.taskPill, this.netCard);
    this.faults = new FaultTools(this);
    this.setMode('wire');
  }

  // ------------------------------------------------------------------ Network view
  /** Show only the communication: x-ray of the panel, glowing cables, station tags, live packets. */
  toggleNet(on = !this.netView) {
    this.netView = on;
    this.scene.setNetView(on);
    this.el.classList.toggle('net-on', on);
    if (this.netChip) this.netChip.classList.toggle('active', on);
    this.netCard.classList.toggle('hidden', !on);
    this.netSig = null;
    if (on) {
      this.updateNetCard();
      if (!this.lab.settings.netHinted) { this.lab.settings.netHinted = true; this.lab.app.saveSettings(); this.hint('Network view: only the communication. The ring of a port pulses green when its device answers, red when it does not. Zoom in for the port names; tap a cable for its pin-out.', 7500); }
    }
    Native.vibrate(8);
  }

  /** The legend card: bus format, master, stations and frame counters. */
  updateNetCard() {
    if (!this.netView) return;
    const sys = this.lab.sys;
    const P = this.lab.project;
    const plc = P.devices.find((d) => d.id === this.lab.activeId) || P.devices.find((d) => DEVICE_DEFS[d.type].category === 'plc');
    let line = 'Press Simulate to see the stations answer';
    let stats = '';
    if (sys) {
      const masters = sys.byKind('plc').filter((p) => p.cpu.powered && p.cpu.mbReq.size);
      if (masters.length) {
        const m = masters[0], bus = sys.busOf(m), st = m.m2.stat || { tx: 0, rx: 0, timeouts: 0, errors: 0 };
        const n = bus.vfds.length + bus.plcs.length + bus.slaves.length;
        line = `RS-485 ${fmtName(m.cpu.com2Format())} · ${sys.busName(m)} COM2 → ${n} slave${n === 1 ? '' : 's'}`;
        stats = `<span class="nl-st">TX <b>${st.tx}</b></span><span class="nl-st ok">RX <b>${st.rx}</b></span><span class="nl-st err">no reply <b>${st.timeouts}</b></span><span class="nl-st err">exc. <b>${st.errors}</b></span>`;
      } else line = sys.hmiLinkState.ok ? `HMI ↔ PLC on ${sys.hmiLinkState.port} · Delta DVP protocol` : `${plc ? 'No MODRW is running — the PLC is not a Modbus master now' : 'No PLC'}`;
    }
    // bus colours of the cables this lab has
    const buses = new Set();
    for (const c of P.conns) if (c.comm) { const d = P.devices.find((x) => x.id === c.a.dev); const pt = d && findPort(d, c.a.port); if (pt) buses.add(pt.bus); }
    const keys = ['rs485', 'rs232', 'usb'].filter((b) => buses.has(b)).map((b) => `<span class="nl-b ${b}">${busName(b)}</span>`).join('');
    const html = `<div class="nl-keys">${keys}<span class="nl-sep"></span><span class="nl-k res">answered</span><span class="nl-k err">no answer</span></div><div class="nl-line">${esc(line)}</div>${stats ? `<div class="nl-stats">${stats}</div>` : ''}`;
    if (html === this.netSig) return;
    this.netSig = html;
    this.netCard.innerHTML = html;
    this.netCard.appendChild(h('button', { class: 'nl-more', html: `<span>Details</span>${icon('forward', 14)}`, onclick: () => { this.lab.views.monitor.sub = 'network'; this.lab.setTab('monitor'); } }));
  }

  frame(dt) {
    this.cardAcc = (this.cardAcc || 0) + dt;
    if (this.cardAcc < 0.4) return;
    this.cardAcc = 0;
    if (this.potCard && this.potCard.upd) this.potCard.upd();
    if (this.faults) this.faults.frame();
    this.updateNetCard();
    this.updateEmpty();
  }

  updateEmpty() { this.emptyEl.classList.toggle('hidden', this.lab.project.devices.length > 0); if (this.tasksBtn) this.updateTaskPill(); }

  updateTaskPill() {
    const t = this.lab.tasks;
    // the guide is there for every lab with something on the bench
    this.taskPill.classList.toggle('hidden', !t && !this.lab.project.devices.length);
    this.tasksBtn.classList.toggle('hidden', !t);
    if (!t) return;
    const n = (this.lab.project.tasksDone || []).length;
    const html = `${icon(n >= t.length ? 'award' : 'target', 15)}<span>Tasks <b>${n}/${t.length}</b></span>`;
    if (html !== this.lastPill) { this.lastPill = html; this.tasksBtn.innerHTML = html; this.taskPill.classList.toggle('all', n >= t.length); }
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

  /**
   * Fit the tool rail into the pane: when the pane is too short for one column the tools flow into
   * 2, 3 … columns (grid), and the chip row at the bottom stops before the rail when it reaches down.
   */
  layoutTools() {
    const el = this.el, tools = this.tools;
    if (!el.clientHeight || !tools) return;
    tools.classList.remove('multi');
    tools.style.removeProperty('--tool-rows');
    const items = [...tools.children].filter((c) => c.offsetParent !== null);
    const btns = items.filter((c) => !c.classList.contains('tool-sep'));
    if (!btns.length) return;
    const cs = getComputedStyle(tools);
    const top = parseFloat(cs.top) || 8, padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0), gap = parseFloat(cs.rowGap) || 0;
    const bh = btns[0].offsetHeight || 34;
    const chipsH = this.chips.offsetHeight || 34;
    const safeB = 10 + chipsH + 8;
    const avail = el.clientHeight - top - safeB - padY;
    const rows = Math.max(3, Math.floor((avail + gap) / (bh + gap)));
    if (btns.length > rows) {
      tools.classList.add('multi');
      tools.style.setProperty('--tool-rows', rows);
    }
    // does the rail reach down into the chip row?
    const tr = tools.getBoundingClientRect(), pr = el.getBoundingClientRect();
    const reaches = tr.bottom > pr.bottom - safeB + 2;
    el.style.setProperty('--chips-extra', reaches ? Math.ceil(tr.width + 12) + 'px' : '0px');
  }

  /** Fade the edge of the focus-chip row where more chips are scrolled out of view. */
  updateChipFade() {
    const c = this.chips;
    this.chips.classList.toggle('more-l', c.scrollLeft > 2);
    this.chips.classList.toggle('more-r', c.scrollLeft + c.clientWidth < c.scrollWidth - 2);
  }

  refresh() {
    // focus chips
    this.chips.innerHTML = '';
    const chip = (label, target, ic) => h('button', { class: 'chip lab-chip', html: `${ic ? icon(ic, 14) : ''}<span>${label}</span>`, onclick: () => { this.scene.focus(target); Native.vibrate(5); } });
    const devs = this.lab.project.devices;
    const hasNet = this.lab.project.conns.some((c) => c.comm) || devs.some((d) => DEVICE_DEFS[d.type].category === 'modbus');
    this.netChip = hasNet ? h('button', { class: 'chip lab-chip net-chip' + (this.netView ? ' active' : ''), html: `${icon('network', 14)}<span>Network</span>`, onclick: () => this.toggleNet() }) : null;
    if (!hasNet && this.netView) this.toggleNet(false);
    this.chips.append(chip('Overview', 'overview', 'fit'), ...(this.netChip ? [this.netChip] : []), chip('Panel', 'panel', 'grid'));
    const add = (pred, label, ic) => devs.filter(pred).forEach((d, i, arr) => this.chips.appendChild(chip(arr.length > 1 ? `${label} ${i + 1}` : label, d.id, ic)));
    add((d) => DEVICE_DEFS[d.type].category === 'plc', 'PLC', 'cpu');
    add((d) => d.type === 'dop-107bv', 'HMI', 'screen');
    add((d) => d.type === 'ms300', 'VFD', 'gauge');
    if (devs.some((d) => DEVICE_DEFS[d.type].zone === 'console')) this.chips.appendChild(chip('Console', 'console', 'button'));
    add((d) => d.type === 'motor' || d.type === 'motor6', 'Motor', 'motor');
    add((d) => d.type === 'conveyor', 'Conveyor', 'layers');
    add((d) => d.type === 'tank', 'Tank', 'gauge');
    add((d) => d.type === 'cylinder', 'Cylinder', 'move');
    add((d) => d.type === 'drp024', 'Power', 'bolt');
    add((d) => d.type === 'laptop', 'Laptop', 'display');
    this.updateChipFade();
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
      // the laptop is not a push button: a finger on it may start an orbit / pinch. A clean tap
      // selects it (Ladder button in the bar) instead of jumping to another tab under the finger
      if (ctl && ctl.action !== 'laptop' && !(this.faults && this.faults.wantsPort(e.clientX, e.clientY))) { this.pressControl(ctl, e); return; }
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
      case 'toggle': { const msg = sys.act(ctl.devId, 'toggle'); if (msg) toast(msg, 'warn'); Native.vibrate(14); this.lab.save(); this.scene.renderer.shadowMap.needsUpdate = true; this.scene.dirty = true; break; }
      case 'feed': { const msg = sys.act(ctl.devId, 'feed'); if (msg) toast(msg, 'info'); Native.vibrate(8); this.scene.dirty = true; break; }
      case 'tankValve': this.openTankValve(ctl.devId); break;
      case 'vfdKey': {
        if (!this.lab.sys) { toast('Press Simulate to power the drive'); break; }
        const a = this.active;
        if (ctl.key === 'LD') {
          // ◀/▼ is one key: a tap is ▼, holding it is ◀ (move the blinking digit)
          const m = this.scene.modelOf(ctl.devId); if (m && m.press) m.press('LD');
          a.timer = setTimeout(() => { a.held = true; this.vfdKey(ctl.devId, 'LEFT'); }, 550);
          break;
        }
        this.vfdKey(ctl.devId, ctl.key);
        // holding ▲ repeats, like the real keypad
        if (ctl.key === 'UP') a.timer = setTimeout(function rep(self) { if (self.active !== a) return; self.vfdKey(ctl.devId, 'UP', true); a.timer = setTimeout(rep, 90, self); }, 450, this);
        break;
      }
      case 'vfdKnob': this.openVfdKnob(ctl.devId); break;
      case 'hmi': {
        const rt = sys.rts.get(ctl.devId);
        if (rt && rt.hmi && ctl.uv) { rt.hmi.pointerDown(ctl.uv.x * 800, (1 - ctl.uv.y) * 480, e.pointerId); Native.vibrate(6); }
        if (!this.lab.sys) toast('The HMI is off — press Simulate');
        break;
      }
      case 'pot': this.openPot(ctl.devId); break;
      case 'tcKey':
        if (ctl.key === 'UP' || ctl.key === 'DOWN') {
          sys.act(ctl.devId, 'tcKey', ctl.key);
          const m = this.scene.modelOf(ctl.devId); if (m && m.press) m.press(ctl.key);
          Native.vibrate(8); this.lab.save(); this.scene.dirty = true;
          this.masterWrites(ctl.devId, /^Write SV/);
        } else this.openTc(ctl.devId);
        break;
      case 'tcCard': this.openTc(ctl.devId); break;
      case 'thCard': this.openTh(ctl.devId); break;
      default: break;
    }
  }

  /** A value set by hand on a slave that the PLC keeps writing over Modbus comes back: say so once. */
  masterWrites(devId, what) {
    const sys = this.lab.sys;
    if (!sys || this.hintedWrites) return;
    if (sys.log.some((l) => l.ids && l.ids.to === devId && l.dir === 'TX' && what.test(l.info) && sys.time - l.t < 1.5)) {
      this.hintedWrites = true;
      toast('The PLC writes this value over Modbus every cycle (it is the master) — change it on the HMI instead', 'info', 5000);
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
    if (ctl.action === 'vfdKey') {
      clearTimeout(this.active.timer);
      if (ctl.key === 'LD' && !this.active.held && !cancel && this.lab.sys) this.vfdKey(ctl.devId, 'DOWN');
    }
    this.active = null;
    this.scene.controls.enabled = true;
  }

  onUp(e, cancel) {
    this.pointers.delete(e.pointerId);
    if (this.active && this.active.id === e.pointerId) { this.releaseControl(cancel); return; }
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
    if (this.faults && this.faults.onTap(x, y)) return;
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

  showChooser(list, x, y, pick = (dev, port) => this.portTapped(dev, port)) {
    const r = this.el.getBoundingClientRect();
    this.chooser.innerHTML = '';
    this.chooser.appendChild(h('div', { class: 'pc-title' }, 'Which terminal?'));
    for (const p of list) {
      this.chooser.appendChild(h('button', { class: 'pc-item', onclick: () => { this.chooser.classList.add('hidden'); pick(p.dev, p.port); } },
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
      const sw = c === 'auto' ? `<span class="auto-dot" style="background:${wireColorFor(port.sig, port.id)}"></span>` : '';
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
        def.sim === 'vfd' ? btn('gauge', 'Keypad', () => this.lab.setTab('vfd')) : def.sim === 'hmi' ? btn('screen', 'Screens', () => this.lab.setTab('hmi')) : def.sim === 'plc' || def.sim === 'laptop' ? btn('ladder', 'Ladder', () => this.lab.setTab('ladder')) : null,
        btn('trash', 'Delete', () => this.deleteDevice(dev), 'danger'),
        h('button', { class: 'sel-close', html: icon('close', 18), onclick: () => this.select(null) }));
    } else {
      const c = P.conns.find((x) => x.id === sel.id);
      if (!c) { bar.classList.add('hidden'); return; }
      const da = P.devices.find((d) => d.id === c.a.dev), db = P.devices.find((d) => d.id === c.b.dev);
      const pa = findPort(da, c.a.port), pb = findPort(db, c.b.port);
      appendAll(bar,
        h('div', { class: 'sel-name' }, c.comm ? `${busName(pa.bus)} cable` : 'Wire', h('small', {}, `${this.lab.deviceName(da)} ${pa.label} ↔ ${this.lab.deviceName(db)} ${pb.label}`)),
        c.comm ? btn('plug', 'Pin-out', () => openCommSheet(this.lab, c)) : btn('palette', 'Colour', () => this.recolor(c)),
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
        const full = count >= def.max || (def.category === 'plc' && P.devices.filter((d) => DEVICE_DEFS[d.type].category === 'plc').length >= 2);
        const img = h('img', { class: 'dev-thumb', alt: '' });
        const card = h('button', { class: 'lib-card dev-card' + (full ? ' disabled' : ''), onclick: () => { if (full) { toast(def.category === 'plc' ? 'The lab already has two PLCs — delete one first' : `Maximum ${def.max} × ${def.short}`, 'warn'); return; } sheet.close(); this.addDevice(def); } },
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
    // Modbus slaves get the next free station address on the line (real ones ship as station 1)
    if (def.category === 'modbus') {
      const used = new Set(P.devices.map((d) => (d.type === 'ms300' ? +((d.state.params || {})['09-00'] ?? 1) : DEVICE_DEFS[d.type].category === 'modbus' ? +(d.props.station ?? 1) : null)).filter((x) => x));
      let st = 1;
      while (used.has(st)) st++;
      dev.props = { station: st };
    }
    P.devices.push(dev);
    let tip = `${def.short} added. In ⚡ Wire mode tap one of its terminals, then the terminal it connects to.`;
    if (def.sim === 'hmi') {
      tip = 'HMI added. Wire + / − to the 24 V supply and COM1 to PLC COM1. A starter screen uses M10 = START, M11 = STOP, Y0 = RUN.';
      if (P.hmi.screens.every((s) => !s.elements.length)) P.hmi.screens[0].elements = starterScreen();
    } else if (def.sim === 'vfd') tip = 'Drive added. Wire MCB L / N → R/L1 · S/L2 and U/T1 V/T2 W/T3 → motor. For Modbus, plug RS-485 (RJ45) into PLC COM2.';
    else if (def.sim === 'motor') tip = 'Motor added. Tap U/T1 on the drive, then U on the motor — V and W are connected for you.';
    else if (def.sim === 'motor6') tip = 'Motor 400 V added (Δ links fitted). Direct-on-line: 3-phase supply → contactor → overload relay → U1 V1 W1. For star-delta set "No links" in its settings and wire W2 U2 V2 too.';
    else if (def.sim === 'mains3') tip = '3-phase supply added: L1 L2 L3 = 400 V between phases, 230 V to N. Feed contactors from L1 L2 L3; a 230 V device (power supply, PLC) goes between ONE phase and N.';
    else if (def.sim === 'conveyor') tip = 'Conveyor added. Motor: U V W from the MS300 (or through a contactor in Y 400 V). Sensors: +24 / 0V from the supply, S1 … S4 → PLC inputs; Y1 = pusher valve. Tap the feeder to put a box on.';
    else if (def.sim === 'tank') tip = 'Tank added. P+ / P− = 24 V pump, V+ / V− = drain valve; FC is the float common (→ +24 V), LL / LH → PLC inputs; LT = 0–10 V level (+24 / 0V). Tap the tank to open the hand valve.';
    else if (def.sim === 'cyl') tip = 'Cylinder added. +24 / 0V for the reed sensors, B1 (back) and B2 (out) → PLC inputs, Y1 (and Y2) ← PLC outputs, the coils return to 0V.';
    else if (def.sim === 'psu') tip = 'Power supply added. Tap L on the MCB, then L on the supply — N and ⏚ follow automatically.';
    else if (def.sim === 'contactor') tip = 'Contactor added. Coil: PLC Y → A1, A2 → 0 V (C0 to +24 V). Main contacts: drive U/T1 → 1/L1 (V and W follow), 2/T1 → motor U. 13–14 can report back to a PLC input.';
    else if (def.sim === 'olr') tip = 'Overload relay added. Put it between the contactor and the motor (2/T1 → 1/L1 …) and wire the NC 95–96 in series with the stop circuit or to a PLC input.';
    else if (def.sim === 'prox') tip = `${def.short} added. BN → +24 V, BU → 0 V, BK → a PLC input (X). PNP needs S/S at 0 V, NPN needs S/S at +24 V.`;
    else if (def.sim === 'limit') tip = `${def.short} added. Wire it like a push button: +24 V → 13, 14 → a PLC input (or 21–22 for the NC contact).`;
    else if (def.sim === 'selector3') tip = `${def.short} added. +24 V → 13 and 23; 14 → the FWD input (e.g. X0), 24 → the REV input (X1). The middle position opens both.`;
    else if (def.sim === 'relay') tip = 'Relay added. Coil: PLC Y → A1 (+), A2 → 0 V. Contact: 11 is common, 14 closes (NO) and 12 opens (NC) when the coil is ON — switch a 230 V load or a VFD input with it.';
    else if (def.sim === 'cb') tip = `${def.short} added. Feed the top terminal(s), take the protected supply from the bottom. 3-pole: drive / supply → 1 3 5, 2 4 6 → contactor or motor.`;
    else if (def.sim === 'tb') tip = 'Terminal block added. Top terminal n and bottom terminal n are joined — land field wires (sensors, buttons, motor) on one side and the panel wiring on the other.';
    else if (def.category === 'modbus') {
      const pr = deviceProps(dev);
      tip = `${def.short} added as station ${pr.station} (${pr.baud} bps ${pr.format} ${pr.protocol}). ${def.sim === 'mbth' ? 'Power: V+ → +24 V, V− → 0 V.' : 'Power: L / N from the MCB (or another device\'s L / N).'} RS-485: tap its RS-485 terminals, then PLC COM2 or the last device of the line (daisy chain). The PLC COM2 and every slave need the same format — see Settings, then the Network chip.`;
    } else if (def.sim === 'ad') tip = 'DVP04AD-E2 clipped onto the PLC. Power: 24V → +24 V, 24G → 0 V. Signal: sensor OUT → V1+, VI1− → the sensor\'s 0 V (4–20 mA: bridge I1+ to V1+). Read it with FROM K0 K12 D0 K4 (CH1–CH4 → D0–D3, 0–10 V = 0–32000).';
    else if (def.sim === 'atx') tip = `${def.short} added. BN → +24 V, BU → 0 V, OUT → an analog input (DVP20EX2: V0+, with VI0− to 0 V; for 4–20 mA use I0+ bridged to V0+) or the MS300 AVI / ACI. Tap it to set the value.`;
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

  /** One MS300 keypad key (RUN, STOP, MODE, ENTER, UP, DOWN, LEFT); `quiet` = auto-repeat (no hints). */
  vfdKey(devId, key, quiet = false) {
    const sys = this.lab.sys;
    if (!sys) return;
    const hint = sys.act(devId, 'vfdKey', key);
    const m = this.scene.modelOf(devId); if (m && m.press) m.press(key);
    if (hint && !quiet) toast(hint, 'info', 4200);
    if (!quiet) Native.vibrate(8);
    this.scene.dirty = true;
  }

  /** The speed dial on the MS300 keypad (frequency source Pr.00-20 = 7). */
  openVfdKnob(devId) {
    this.closePot();
    const dev = this.lab.project.devices.find((d) => d.id === devId);
    if (!dev) return;
    const val = h('b', {}, '');
    const range = h('input', { class: 'range', type: 'range', min: 0, max: 100, value: Math.round((dev.state.knob ?? 0) * 100) });
    let hinted = false;
    const upd = (first) => {
      const v = +range.value / 100;
      const rt = this.lab.sys && this.lab.sys.rts.get(devId);
      let hint = null;
      if (rt) hint = this.lab.sys.act(devId, 'vfdKnob', v); else dev.state.knob = v;
      const p = rt ? rt.vfd.params : { ...defaultParams(), ...(dev.state.params || {}) };
      const src = p['00-20'] === 7;
      val.textContent = `${(v * p['01-00']).toFixed(2)} Hz${src ? '' : ' · off'}`;
      if (hint && !hinted && !first) { hinted = true; toast(hint, 'info', 4200); }
      this.scene.dirty = true;
    };
    range.addEventListener('input', () => upd(false));
    range.addEventListener('change', () => this.lab.save());
    this.potCard = h('div', { class: 'pot-card' },
      h('div', { class: 'ctl-head' }, h('label', {}, 'Speed dial'), val), range,
      h('button', { class: 'sel-close', html: icon('close', 18), onclick: () => this.closePot() }));
    this.el.appendChild(this.potCard);
    upd(true);
  }

  // ------------------------------------------------------------------ potentiometer
  openPot(devId) {
    this.closePot();
    const dev = this.lab.project.devices.find((d) => d.id === devId);
    if (!dev) return;
    const val = h('b', {}, '');
    const range = h('input', { class: 'range', type: 'range', min: 0, max: 100, value: Math.round((dev.state.pos ?? 0.5) * 100) });
    const pr = deviceProps(dev);
    const atx = DEVICE_DEFS[dev.type].sim === 'atx';
    const upd = () => {
      const v = +range.value / 100;
      this.scene.system.act(devId, 'pos', v);
      // transmitters show the measured value in their unit as well as the signal
      const m = +pr.min + v * (pr.max - pr.min);
      val.textContent = atx ? `${m.toFixed(Math.abs(pr.max - pr.min) <= 20 ? 1 : 0)} ${pr.unit}  ·  ${(v * 10).toFixed(1)} V` : `${range.value}%  ·  ${(v * 10).toFixed(1)} V`;
      this.scene.dirty = true;
    };
    range.addEventListener('input', upd);
    range.addEventListener('change', () => this.lab.save());
    this.potCard = h('div', { class: 'pot-card' },
      h('div', { class: 'ctl-head' }, h('label', {}, `${pr.label || 'Potentiometer'}`), val), range,
      h('button', { class: 'sel-close', html: icon('close', 18), onclick: () => this.closePot() }));
    this.el.appendChild(this.potCard);
    upd();
  }

  closePot() { if (this.potCard) { this.potCard.remove(); this.potCard = null; } }

  // ------------------------------------------------------------------ Modbus slaves
  /** DTB4848 card: set value, RUN / STOP and the control method. */
  openTc(devId) {
    this.closePot();
    const dev = this.lab.project.devices.find((d) => d.id === devId);
    if (!dev) return;
    const s = dev.state;
    const act = (v) => { this.scene.system.act(devId, 'tcSet', v); this.scene.dirty = true; this.lab.save(); upd(); };
    const val = h('b', {}, '');
    const range = h('input', { class: 'range', type: 'range', min: s.lo ?? 0, max: s.hi ?? 400, step: 1, value: Math.round(s.sv ?? 120) });
    const run = h('button', { class: 'chip', onclick: () => act({ run: !s.run }) });
    const modes = [[0, 'PID'], [1, 'ON/OFF'], [2, 'Manual 30 %']].map(([m, t]) => h('button', { class: 'chip', onclick: () => act({ mode: m }) }, t));
    const tune = h('button', { class: 'chip', onclick: () => { if ((s.mode ?? 0) !== 0 || !s.run) { toast('Auto-tune needs PID mode and RUN', 'warn'); return; } act({ at: true }); toast('Auto-tuning: the heater is on for 12 s … PB / Ti / Td are then set', 'info', 4000); } }, 'Auto-tune');
    const upd = () => {
      const rt = this.scene.system && this.scene.system.rts.get(devId);
      const pv = rt && rt.mb && rt.mb.powered ? ` · PV ${rt.mb.pv.toFixed(1)}` : '';
      val.textContent = `SV ${Math.round(s.sv)} °C${pv} · PB ${(s.pb ?? 8).toFixed(1)} Ti ${Math.round(s.ti ?? 30)} Td ${Math.round(s.td ?? 3)}`;
      run.innerHTML = `${icon(s.run ? 'stop' : 'play', 14)}<span>${s.run ? 'RUN → STOP' : 'STOP → RUN'}</span>`;
      run.classList.toggle('active', !!s.run);
      modes.forEach((b, i) => b.classList.toggle('active', (s.mode ?? 0) === i));
    };
    range.addEventListener('input', () => { act({ sv: +range.value }); this.masterWrites(devId, /^Write SV/); });
    this.potCard = h('div', { class: 'pot-card mb-card' },
      h('div', { class: 'ctl-head' }, h('label', {}, `${deviceProps(dev).label || 'DTB4848'} · set value`), val), range,
      h('div', { class: 'chips-row mb-chips' }, run, ...modes, tune),
      h('button', { class: 'sel-close', html: icon('close', 18), onclick: () => this.closePot() }));
    this.potCard.upd = upd;
    this.el.appendChild(this.potCard);
    upd();
  }

  /** Hand valve of the tank (the consumer): 0 … 100 % open. */
  openTankValve(devId) {
    this.closePot();
    const dev = this.lab.project.devices.find((d) => d.id === devId);
    if (!dev) return;
    const val = h('b', {}, '');
    const range = h('input', { class: 'range', type: 'range', min: 0, max: 100, value: Math.round((dev.state.demand || 0) * 100) });
    const upd = () => {
      const rt = this.scene.system && this.scene.system.rts.get(devId);
      const lv = dev.state.level ?? 0;
      val.textContent = `${range.value} % open · level ${Math.round(lv)} mm${rt && rt.qOut ? ` · out ${(rt.qOut * 0.06).toFixed(1)} L/min` : ''}`;
    };
    range.addEventListener('input', () => { if (this.scene.system) this.scene.system.act(devId, 'demand', +range.value / 100); else dev.state.demand = +range.value / 100; upd(); this.scene.dirty = true; });
    range.addEventListener('change', () => this.lab.save());
    this.potCard = h('div', { class: 'pot-card' },
      h('div', { class: 'ctl-head' }, h('label', {}, `${deviceProps(dev).label || 'Tank'} · hand valve`), val), range,
      h('button', { class: 'sel-close', html: icon('close', 18), onclick: () => this.closePot() }));
    this.potCard.upd = upd;
    this.el.appendChild(this.potCard);
    upd();
  }

  /** RS-485 T/H sensor card: temperature and humidity. */
  openTh(devId) {
    this.closePot();
    const dev = this.lab.project.devices.find((d) => d.id === devId);
    if (!dev) return;
    const s = dev.state;
    const vt = h('b', {}, ''), vh = h('b', {}, '');
    const rt = h('input', { class: 'range', type: 'range', min: -20, max: 60, step: 0.5, value: s.temp ?? 26.5 });
    const rh = h('input', { class: 'range', type: 'range', min: 0, max: 100, step: 0.5, value: s.rh ?? 55 });
    const upd = () => { vt.textContent = `${(+rt.value).toFixed(1)} °C`; vh.textContent = `${(+rh.value).toFixed(1)} %RH`; };
    const set = () => { this.scene.system.act(devId, 'thSet', { temp: +rt.value, rh: +rh.value }); upd(); this.scene.dirty = true; };
    rt.addEventListener('input', set); rh.addEventListener('input', set);
    rt.addEventListener('change', () => this.lab.save()); rh.addEventListener('change', () => this.lab.save());
    this.potCard = h('div', { class: 'pot-card mb-card' },
      h('div', { class: 'ctl-head' }, h('label', {}, `${deviceProps(dev).label || 'Sensor'} · temperature`), vt), rt,
      h('div', { class: 'ctl-head' }, h('label', {}, 'Humidity'), vh), rh,
      h('button', { class: 'sel-close', html: icon('close', 18), onclick: () => this.closePot() }));
    this.el.appendChild(this.potCard);
    upd();
  }
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
