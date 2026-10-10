// Delta PLC Lab screen: 3D panel + ladder editor + HMI + VFD + monitor, with the simulation loop.
import { h, toast, pushBack, popupMenu, promptDialog, confirmDialog, debounce, dialog } from '../../ui/widgets.js';
import { icon } from '../../ui/icons.js';
import { Native } from '../../native.js';
import { AudioEngine } from '../../ui/audio.js';
import { saveLab, exportLab, saveLabThumb, plcDevices, activePlcId, switchPlc, plcName, makeConn } from '../store.js';
import { normalizeProgram } from '../sim/ladder.js';
import { LabSystem } from '../sim/system.js';
import { DEVICE_DEFS, deviceProps, devicePorts, hasLabel } from '../devices/defs.js';
import { renderHmi } from './hmi-render.js';
import { renderLaptop } from './laptop-screen.js';
import { PanelView } from './panel.js';
import { LadderView } from './ladder-view.js';
import { HmiView } from './hmi-view.js';
import { VfdView } from './vfd-view.js';
import { MonitorView } from './monitor.js';
import { LAB_TASKS } from '../tasks.js';
import { Sheet } from '../../ui/widgets.js';

const TABS = [
  ['panel', 'cube', 'Lab'],
  ['ladder', 'ladder', 'Ladder'],
  ['hmi', 'screen', 'HMI'],
  ['vfd', 'gauge', 'VFD'],
  ['monitor', 'activity', 'Monitor'],
];

export class LabScreen {
  constructor(app, project) {
    this.app = app;
    this.project = project;
    this.settings = app.settings;
    this.sys = null;
    this.tab = 'panel';
    this.history = [];
    this.future = [];
    this.audio = new AudioEngine();
    this.save = debounce(() => this.saveNow(), 800);
    this.hmiCanvas = document.createElement('canvas');
    this.hmiCanvas.width = 800; this.hmiCanvas.height = 480;
    this.hmiCanvas.className = 'hmi-canvas';
    this.laptopCanvas = document.createElement('canvas');
    this.laptopCanvas.width = 1024; this.laptopCanvas.height = 640;
    this.snapshot = this.hwSerialize();
    this.activeId = activePlcId(project);
    this.tasks = LAB_TASKS[project.fromExample] || null;
    if (this.tasks) project.tasksDone = Array.isArray(project.tasksDone) ? project.tasksDone : [];
    this.taskMemo = {};
    this.build();
  }

  // ------------------------------------------------------------------ DOM
  build() {
    this.root = h('div', { class: 'screen lab tab-panel' });
    const back = h('button', { class: 'icon-btn', 'aria-label': 'Back', html: icon('back'), onclick: () => this.leave() });
    this.titleEl = h('button', { class: 'ed-title', onclick: () => this.rename() }, h('span', {}, this.project.name));
    this.subEl = h('button', { class: 'board-chip', onclick: () => this.onSubTap() });
    this.runBtn = h('button', { class: 'run-btn', onclick: () => this.toggleSim(), html: `${icon('play', 20)}<span>Simulate</span>` });
    const menuBtn = h('button', { class: 'icon-btn', 'aria-label': 'Menu', html: icon('dots'), onclick: (e) => this.menu(e.currentTarget) });
    this.top = h('header', { class: 'ed-top lab-top' }, back, h('div', { class: 'ed-titles' }, this.titleEl, this.subEl), this.runBtn, menuBtn);
    this.status = h('div', { class: 'sim-status lab-status hidden' });
    this.main = h('main', { class: 'ed-main lab-main' });
    this.views = {
      panel: new PanelView(this),
      ladder: new LadderView(this),
      hmi: new HmiView(this),
      vfd: new VfdView(this),
      monitor: new MonitorView(this),
    };
    for (const [id, v] of Object.entries(this.views)) { v.el.classList.add('pane', 'lab-pane', 'pane-' + id); this.main.appendChild(v.el); }
    this.nav = h('nav', { class: 'ed-nav lab-nav' });
    for (const [id, ic, label] of TABS) {
      this.nav.appendChild(h('button', { class: 'nav-tab' + (id === this.tab ? ' active' : ''), 'data-tab': id, onclick: () => this.setTab(id), html: `${icon(ic, 22)}<span>${label}</span><i class="badge hidden"></i>` }));
    }
    this.fsBar = h('div', { class: 'fs-bar lab-fs-bar' },
      h('button', { class: 'fs-btn', title: 'Exit full screen', html: icon('fullscreenExit', 20), onclick: () => this.setFullscreen(false) }),
      this.fsRun = h('button', { class: 'fs-btn fs-run', html: icon('play', 20), onclick: () => this.toggleSim() }),
      ...TABS.map(([id, ic]) => h('button', { class: 'fs-btn', 'data-tab': id, html: icon(ic, 20), onclick: () => this.setTab(id) })),
      h('button', { class: 'fs-btn fs-hide', title: 'Hide menus', 'aria-label': 'Hide menus', html: icon('close', 20), onclick: () => this.setChrome(false) }));
    // full screen hides every menu; this small handle (bottom right, clear of every tool bar at the
    // top) brings them back, and the ✕ at the end of the dock hides them again
    this.fsHandle = h('button', { class: 'fs-handle', 'aria-label': 'Show menus', title: 'Show menus', html: icon('menu', 19), onclick: () => this.setChrome(this.root.classList.contains('fs-clean')) });
    this.root.append(this.top, this.status, this.main, this.nav, this.fsBar, this.fsHandle);
    this.updateSub();
    this.ro = new ResizeObserver(() => this.updateLayout());
    this.ro.observe(this.root);
    this.updateLayout();
  }

  mount(parent) {
    parent.appendChild(this.root);
    this.unback = pushBack(() => this.onBack());
    for (const v of Object.values(this.views)) if (v.mounted) v.mounted();
    this.setTab(this.tab);
    this.renderStatic();
    this.loopRaf = requestAnimationFrame((t) => this.loop(t));
  }

  unmount() {
    this.stopSim(true);
    cancelAnimationFrame(this.loopRaf);
    this.ro.disconnect();
    for (const v of Object.values(this.views)) if (v.destroy) v.destroy();
    this.audio.close();
    if (this.unback) this.unback();
    this.root.remove();
  }

  onBack() {
    const rearm = () => { this.unback = pushBack(() => this.onBack()); };
    if (this.fullscreen) { this.setFullscreen(false); rearm(); return; }
    const v = this.views[this.tab];
    if (v && v.onBack && v.onBack()) { rearm(); return; }
    if (this.tab !== 'panel') { this.setTab('panel'); rearm(); return; }
    this.unback = null;
    this.leave();
  }

  get scene() { return this.views.panel.scene; }

  updateLayout() {
    const r = this.root.getBoundingClientRect();
    const wide = r.width >= 760 && r.width > r.height * 1.05;
    if (wide !== this.wide) { this.wide = wide; this.root.classList.toggle('wide', wide); }
    const split = wide && this.settings.labSplit !== false;
    if (split !== this.split) { this.split = split; this.root.classList.toggle('split', split); }
    this.applyTabClasses();
  }

  applyTabClasses() {
    const t = this.tab;
    const second = this.split ? (t === 'panel' ? this.lastSecond || 'ladder' : t) : null;
    for (const [id, v] of Object.entries(this.views)) {
      const vis = id === t || (this.split && (id === 'panel' || id === second));
      if (vis !== v.visible) { v.visible = vis; v.el.classList.toggle('show', vis); if (vis && v.onShow) v.onShow(); if (!vis && v.onHide) v.onHide(); }
      v.el.classList.toggle('second', this.split && id === second && id !== 'panel');
    }
    if (this.scene) this.scene.visible = this.views.panel.visible;
    for (const b of this.nav.children) b.classList.toggle('active', b.dataset.tab === t || (this.split && b.dataset.tab === second));
    for (const b of this.fsBar.querySelectorAll('[data-tab]')) b.classList.toggle('active', b.dataset.tab === t);
  }

  setTab(t) {
    if (!this.views[t]) t = 'panel';
    this.tab = t;
    if (t !== 'panel') this.lastSecond = t;
    this.root.className = this.root.className.replace(/\btab-\w+/g, '').trim() + ' tab-' + t;
    this.applyTabClasses();
    this.setBadge(t, false);
    if (document.activeElement && document.activeElement.blur && t !== 'ladder') document.activeElement.blur();
  }

  setBadge(tab, on) {
    const b = this.nav.querySelector(`[data-tab="${tab}"] .badge`);
    if (b) b.classList.toggle('hidden', !on);
  }

  setFullscreen(on) {
    this.fullscreen = on;
    this.root.classList.toggle('fs', on);
    this.setChrome(!on, false);
    if (on && !this.settings.fsHinted) { this.settings.fsHinted = true; this.app.saveSettings(); toast('Full screen — tap ☰ (bottom right) for the menus'); }
    Native.setImmersive(on);
    Native.vibrate(8);
  }

  /** Full screen: show (on) or hide the menus and tool bars. */
  setChrome(on, buzz = true) {
    this.root.classList.toggle('fs-clean', !on);
    this.fsHandle.innerHTML = icon(on ? 'close' : 'menu', 19);
    this.fsHandle.setAttribute('aria-label', on ? 'Hide menus' : 'Show menus');
    if (buzz) Native.vibrate(6);
  }

  updateSub() {
    const plc = this.plcDevice();
    const plcs = plcDevices(this.project);
    const parts = [plc ? (plcs.length > 1 ? `${plcName(this.project, plc)} ▾ ${DEVICE_DEFS[plc.type].short}` : DEVICE_DEFS[plc.type].short) : 'No PLC'];
    if (this.project.devices.some((d) => d.type === 'ms300')) parts.push('MS300');
    if (this.project.devices.some((d) => d.type === 'dop-107bv')) parts.push('DOP-107');
    this.subEl.textContent = plcs.length > 1 ? parts.join(' · ') : 'Delta ' + parts.join(' · ');
    this.subEl.classList.toggle('multi-plc', plcs.length > 1);
  }

  /** Tap on the top chip: with two PLCs it picks the one to program, otherwise it shows the lab. */
  onSubTap() {
    const plcs = plcDevices(this.project);
    if (plcs.length < 2) { this.setTab('panel'); return; }
    popupMenu(this.subEl, plcs.map((d) => ({
      icon: d.id === this.activeId ? 'check' : 'cpu',
      label: `${plcName(this.project, d)} · ${DEVICE_DEFS[d.type].short}`,
      hint: d.id === this.activeId ? 'open in Ladder' : 'program this PLC',
      action: () => this.selectPlc(d.id),
    })));
  }

  /** Program another PLC: its ladder opens and the laptop's USB cable moves over to it. */
  selectPlc(id) {
    const P = this.project;
    if (this.sys) { const rt = this.sys.plc; if (rt && rt.cpu.powered) this.sys.saveLatched(rt); }
    if (!switchPlc(P, id)) return;
    this.activeId = id;
    const pc = P.devices.find((d) => d.type === 'laptop');
    let moved = false;
    if (pc) {
      const usb = P.conns.find((c) => (c.a.dev === pc.id && c.a.port === 'USB') || (c.b.dev === pc.id && c.b.port === 'USB'));
      const other = usb && (usb.a.dev === pc.id ? usb.b : usb.a);
      if (!usb || other.dev !== id) {
        if (usb) P.conns = P.conns.filter((c) => c !== usb);
        try { P.conns.push(makeConn(P.devices, pc.id, 'USB', id, 'USB')); moved = true; } catch (e) { /* no USB port */ }
      }
    }
    this.onPlcSwitched();
    if (moved) this.commitHardware('Move USB cable', { devices: false });
    else this.save();
    const dev = P.devices.find((d) => d.id === id);
    toast(`Now programming ${plcName(P, dev)}${moved ? ' — the laptop USB cable is plugged into it' : ''}`);
  }

  onPlcSwitched() {
    this.updateSub();
    this.laptopDirty = true;
    for (const v of Object.values(this.views)) if (v.onPlcSwitched) v.onPlcSwitched();
  }

  /** After devices change: if the PLC being programmed was removed, open the other PLC's program. */
  fixActivePlc() {
    const P = this.project;
    const ids = plcDevices(P).map((d) => d.id);
    const was = this.activeId;
    if (was && !ids.includes(was) && ids.length) {
      P.plcs = P.plcs || {};
      P.plcs[was] = { program: P.program, plc: P.plc };
      const next = ids[0], st = P.plcs[next];
      delete P.plcs[next];
      if (st) { P.program = normalizeProgram(st.program); P.plc = st.plc || { downloaded: null, latched: null }; }
      P.activePlc = next;
      this.activeId = next;
      this.onPlcSwitched();
      return;
    }
    this.activeId = activePlcId(P);
    if (ids.length > 1) P.activePlc = this.activeId;
  }

  // ------------------------------------------------------------------ project / undo
  hwSerialize() { return JSON.stringify({ devices: this.project.devices, conns: this.project.conns }); }

  /** Commit a hardware change (devices / wiring). */
  commitHardware(label, { devices = true } = {}) {
    this.pruneConns();
    if (devices) this.fixActivePlc();
    const snap = this.hwSerialize();
    if (snap !== this.snapshot) {
      this.history.push(this.snapshot);
      if (this.history.length > 60) this.history.shift();
      this.future = [];
      this.snapshot = snap;
    }
    if (devices) { this.scene.syncDevices(); this.updateSub(); } else this.scene.syncCables();
    if (this.sys) this.sys.sync();
    this.views.panel.refresh();
    for (const v of Object.values(this.views)) if (v !== this.views.panel && v.onHardwareChanged) v.onHardwareChanged();
    this.save();
    void label;
  }

  /** Keep wires valid after a device's terminals changed (e.g. push button NO ↔ NC). */
  pruneConns() {
    const P = this.project;
    const remap = { NO: { 11: '13', 12: '14' }, NC: { 13: '11', 14: '12' } };
    const before = P.conns.length;
    P.conns = P.conns.filter((c) => {
      for (const end of [c.a, c.b]) {
        const dev = P.devices.find((d) => d.id === end.dev);
        if (!dev) return false;
        const ports = devicePorts(dev);
        if (ports.some((p) => p.id === end.port)) continue;
        const contact = dev.type === 'pb' ? deviceProps(dev).contact || 'NO' : null;
        const to = contact && remap[contact][end.port];
        if (to && ports.some((p) => p.id === to)) { end.port = to; continue; }
        return false;
      }
      return true;
    });
    if (P.conns.length < before) toast(`${before - P.conns.length} wire(s) removed — their terminals no longer exist`, 'warn');
  }

  restoreHw(snap) {
    const s = JSON.parse(snap);
    this.project.devices = s.devices;
    this.project.conns = s.conns;
    this.snapshot = snap;
    this.fixActivePlc();
    this.scene.syncDevices();
    if (this.sys) this.sys.sync();
    this.views.panel.refresh();
    this.updateSub();
    this.save();
  }

  undo() { if (!this.history.length) { toast('Nothing to undo'); return; } this.future.push(this.snapshot); this.restoreHw(this.history.pop()); Native.vibrate(6); }
  redo() { if (!this.future.length) { toast('Nothing to redo'); return; } this.history.push(this.snapshot); this.restoreHw(this.future.pop()); Native.vibrate(6); }

  saveNow() {
    const sys = this.sys;
    if (sys && sys.plc && sys.plc.cpu.powered) sys.saveLatched(sys.plc);
    if (this.scene) { const v = this.scene.views(); if (v.view) this.project.view = v.view; if (v.view2d) this.project.view2d = v.view2d; }
    if (!saveLab(this.project)) toast('Storage is full — could not save', 'error');
  }

  async rename() {
    const n = await promptDialog('Lab name', this.project.name);
    if (n) { this.project.name = n; this.titleEl.firstChild.textContent = n; this.saveNow(); this.laptopDirty = true; }
  }

  leave() {
    try { if (this.scene && this.scene.visible !== false) saveLabThumb(this.project.id, this.scene.snapshot()); } catch (e) { /* ignore */ }
    this.stopSim(true);
    this.saveNow();
    this.app.showHome('plclab');
  }

  menu(anchor) {
    popupMenu(anchor, [
      { icon: 'save', label: 'Save', action: () => { this.saveNow(); toast('Lab saved', 'ok'); } },
      { icon: 'edit', label: 'Rename', action: () => this.rename() },
      { icon: 'download', label: 'Export lab (.raptiplc)', action: () => Native.saveFile(this.project.name.replace(/[^\w\- ]/g, '') + '.raptiplc', 'application/json', exportLab(this.project)).then((ok) => ok && toast('Exported', 'ok')) },
      '-',
      { icon: 'undo', label: 'Undo wiring / devices', action: () => this.undo() },
      { icon: 'redo', label: 'Redo', action: () => this.redo() },
      { icon: 'columns', label: this.settings.labSplit === false ? 'Side by side in landscape' : 'One panel at a time', action: () => { this.settings.labSplit = this.settings.labSplit === false; this.app.saveSettings(); this.split = null; this.updateLayout(); } },
      { icon: 'fullscreen', label: 'Full screen', action: () => this.setFullscreen(true) },
      { icon: 'clock', label: `Simulation speed: ${fmtSpeed(this.speed || 1)}`, action: () => this.chooseSpeed() },
      { icon: 'sliders', label: `3D quality: ${this.settings.labQuality === 'low' ? 'Fast' : 'High'}`, action: () => { this.settings.labQuality = this.settings.labQuality === 'low' ? 'high' : 'low'; this.app.saveSettings(); toast('Re-open the lab to apply the 3D quality'); } },
      '-',
      this.tasks ? { icon: 'target', label: `Lab tasks (${this.project.tasksDone.length}/${this.tasks.length})`, action: () => this.showTasks() } : null,
      { icon: 'help', label: 'How to use the lab', action: () => this.help() },
    ]);
  }

  chooseSpeed() {
    const content = h('div', { class: 'opt-grid speed-grid' });
    const sheet = new Sheet({ title: 'Simulation speed', content, icon: 'clock' });
    for (const k of [0.25, 0.5, 1, 2, 4]) {
      content.appendChild(h('button', { class: 'opt' + ((this.speed || 1) === k ? ' active' : ''), onclick: () => { this.speed = k; sheet.close(); this.lastStatus = null; this.updateStatus(); toast(`Simulation speed ${fmtSpeed(k)}`); } }, fmtSpeed(k)));
    }
    content.appendChild(h('p', { class: 'muted small' }, 'Slow motion helps to follow timers and ramps; fast-forward skips long waits. Timers, ramps and communication all scale together.'));
    sheet.open();
  }

  help() {
    dialog({
      title: 'Delta PLC Lab',
      body: `<div class="lab-help">
        <p><b>1 · Wire it.</b> In <b>Lab</b> choose <b>⚡ Wire</b>, tap a terminal, then tap the other end. Green rings show where it can go. Tap a cable to recolour or delete it. <b>2D / 3D</b> (bottom left) switches between the wiring schematic and the 3D panel.</p>
        <p><b>2 · Program it.</b> In <b>Ladder</b> tap a cell, then a contact / coil / instruction button. Enter the device with the keypad (X/Y are octal). Press <b>Download</b> to write it to the PLC over USB.</p>
        <p><b>3 · Power it.</b> Press <b>Simulate</b>. Switch the MCB ON and the PLC to RUN. In <b>✋ Operate</b> mode press buttons, the HMI touch screen and the VFD keypad right in 3D.</p>
        <p><b>4 · Watch it.</b> Ladder shows live power flow, <b>Monitor</b> shows devices and the real Modbus frames on COM1 / COM2.</p>
        <p class="muted">Pinch to zoom — or double-tap, hold and slide down / up (like Google Maps). In 3D drag to orbit and use two fingers to pan; in 2D drag to move. Use the chips at the bottom to jump to a device.</p>
        <p class="muted"><b>Select</b> (dashed-box tool, or press and hold, then drag): drag to the right for a <b>window</b> (only what is fully inside), to the left for a <b>crossing</b> box (everything it touches) — like AutoCAD.</p></div>`,
      actions: [{ label: 'Got it', value: true, cls: 'btn-primary' }],
    });
  }

  // ------------------------------------------------------------------ simulation
  toggleSim() { if (this.sys) this.stopSim(); else this.startSim(); }

  startSim() {
    if (this.sys) return this.sys;
    this.audio.resume();
    this.sys = new LabSystem(this.project, { onEvent: (e) => this.onSimEvent(e) });
    this.root.classList.add('simulating');
    this.runBtn.classList.add('running');
    this.runBtn.innerHTML = `${icon('stop', 18)}<span>Stop</span>`;
    this.fsRun.innerHTML = icon('stop', 20); this.fsRun.classList.add('running');
    this.status.classList.remove('hidden');
    this.scene.setSystem(this.sys);
    this.scene.setRunning(true);
    this.simT0 = performance.now();
    Native.keepScreenOn(true);
    Native.vibrate(15);
    for (const v of Object.values(this.views)) if (v.onSimStart) v.onSimStart(this.sys);
    return this.sys;
  }

  stopSim(silent = false) {
    if (!this.sys) return;
    const plc = this.sys.plc;
    if (plc && plc.cpu.powered) this.sys.saveLatched(plc);
    for (const v of this.sys.byKind('vfd')) this.sys.persistVfd(v);
    this.sys = null;
    this.audio.stopAll();
    this.root.classList.remove('simulating');
    this.runBtn.classList.remove('running');
    this.runBtn.innerHTML = `${icon('play', 20)}<span>Simulate</span>`;
    this.fsRun.innerHTML = icon('play', 20); this.fsRun.classList.remove('running');
    this.status.classList.add('hidden');
    this.scene.setSystem(this.idleSystem());
    this.scene.setRunning(false);
    Native.keepScreenOn(false);
    for (const v of Object.values(this.views)) if (v.onSimStop) v.onSimStop();
    this.renderStatic();
    if (!silent) this.saveNow();
  }

  /** A never-stepped system so the 3D models show switch positions etc. while stopped. */
  idleSystem() {
    const s = new LabSystem(this.project);
    return s;
  }

  onSimEvent(e) {
    toast(e.text, e.kind === 'trip' || e.kind === 'short' ? 'error' : 'warn', 4200);
    Native.vibrate(40);
  }

  loop(t) {
    this.loopRaf = requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min(0.25, (t - (this.lastT || t)) / 1000);
    this.lastT = t;
    const sys = this.sys;
    if (sys) {
      sys.step(dt * 1000 * (this.speed || 1));
      this.frameAcc = (this.frameAcc || 0) + dt;
      // HMI screen (≈ 20 fps)
      this.hmiAcc = (this.hmiAcc || 0) + dt;
      const h = sys.hmiRt;
      if (h && this.hmiAcc > 0.05) {
        this.hmiAcc = 0;
        const anim = h.hmi.animated();
        if (h.hmi.dirty || anim) {
          h.hmi.dirty = false;
          if (!this.views.hmi.designing) renderHmi(this.hmiCanvas, h.hmi, h.hmi.current);
          this.scene.hmiDirty = true;
        }
      }
      // buzzers
      for (const b of sys.byKind('buzzer')) this.audio.set('bz' + b.dev.id, b.on && this.settings.sound !== false ? 2400 : 0, 0.5);
      // flows + laptop + status (≈ 4 Hz)
      this.slowAcc = (this.slowAcc || 0) + dt;
      if (this.slowAcc > 0.25) {
        this.slowAcc = 0;
        this.updateFlows();
        this.updateStatus();
        this.renderLaptopScreen();
        if (sys.issues.some((i) => i.level === 'error')) this.setBadge('panel', this.tab !== 'panel');
        if (Date.now() - (this.lastAutoSave || 0) > 8000) { this.lastAutoSave = Date.now(); this.save(); }
      }
    }
    this.taskAcc = (this.taskAcc || 0) + dt;
    if (this.tasks && this.taskAcc > 0.4) { this.taskAcc = 0; this.checkTasks(); }
    if (sys) this.sounds(sys);
    for (const v of Object.values(this.views)) if (v.visible && v.frame) v.frame(dt);
  }

  sounds(sys) {
    const on = this.settings.sound !== false;
    for (const m of sys.byKind('motor')) {
      const r = Math.abs(m.rpm);
      this.audio.set('mot' + m.dev.id, on && r > 8 ? 55 + (r / 1420) * 420 : 0, Math.min(1, r / 260) * 0.16, 'sawtooth');
    }
    const plc = sys.plc;
    let mask = 0;
    if (plc && plc.cpu.powered) for (let i = 0; i < 16; i++) if (plc.cpu.Y[i]) mask |= 1 << i;
    for (const m of sys.byKind('mcb')) if (m.dev.state.on) mask |= 1 << 20;
    if (this.lastRelayMask !== undefined && mask !== this.lastRelayMask && on) this.audio.click(0.45);
    this.lastRelayMask = mask;
  }

  // ------------------------------------------------------------------ lab tasks
  taskCtx() {
    const sys = this.sys;
    const P = this.project;
    const v = sys && sys.byKind('vfd')[0];
    return {
      sys, lab: this, P, memo: this.taskMemo,
      rt: (id) => (sys ? sys.rts.get(id) : null),
      dev: (id) => P.devices.find((d) => d.id === id),
      cpu: sys && sys.plc && sys.plc.cpu.powered ? sys.plc.cpu : null,
      vfd: v ? v.vfd : null,
      motor: sys ? sys.byKind('motor')[0] || null : null,
      dl: JSON.stringify((P.plc && P.plc.downloaded) || {}),
    };
  }

  checkTasks() {
    const done = this.project.tasksDone;
    if (done.length >= this.tasks.length) return;
    const ctx = this.taskCtx();
    this.tasks.forEach((t, i) => {
      if (done.includes(i)) return;
      let ok = false;
      try { ok = !!t.check(ctx); } catch (e) { ok = false; }
      if (!ok) return;
      done.push(i);
      this.save();
      Native.vibrate(25);
      if (this.settings.sound !== false) { this.audio.set('task', 880, 0.5, 'sine'); setTimeout(() => this.audio.set('task', 1320, 0.5, 'sine'), 110); setTimeout(() => this.audio.set('task', 0, 0), 260); }
      toast(`Task ${i + 1} done: ${t.text}`, 'ok', 3800);
      if (done.length === this.tasks.length) setTimeout(() => dialog({ title: 'Exercise complete! 🎉', body: `<p>You finished all ${this.tasks.length} tasks of <b>${esc(this.project.name)}</b>.</p><p class="muted">Try another lab exercise, or change this one and make it your own.</p>`, actions: [{ label: 'Great', value: true, cls: 'btn-primary' }] }), 900);
    });
    this.views.panel.updateTaskPill();
  }

  showTasks() {
    const done = this.project.tasksDone || [];
    const content = h('div', { class: 'task-list' });
    content.appendChild(h('div', { class: 'task-progress' }, h('i', { style: { width: (done.length / this.tasks.length * 100).toFixed(0) + '%' } })));
    let next = true;
    this.tasks.forEach((t, i) => {
      const ok = done.includes(i);
      const cur = !ok && next;
      if (cur) next = false;
      content.appendChild(h('div', { class: 'task' + (ok ? ' done' : '') + (cur ? ' current' : '') },
        h('span', { class: 'task-ic', html: ok ? icon('check', 16) : String(i + 1) }),
        h('div', { class: 'task-text' }, h('b', {}, t.text), t.hint ? h('small', {}, t.hint) : null)));
    });
    content.appendChild(h('div', { class: 'props-actions' },
      h('button', { class: 'btn btn-ghost', html: `${icon('restart', 16)}<span>Reset progress</span>`, onclick: () => { this.project.tasksDone = []; this.taskMemo = {}; this.save(); sheet.close(); this.views.panel.updateTaskPill(); } }),
      h('button', { class: 'btn btn-primary', onclick: () => sheet.close() }, 'OK')));
    const sheet = new Sheet({ title: `Lab tasks · ${done.length}/${this.tasks.length}`, content, icon: 'target', cls: 'sheet-tall' });
    sheet.open();
  }

  updateFlows() {
    const sys = this.sys;
    if (!sys || !this.scene) return;
    const now = sys.time;
    const recent = (link) => sys.log.length && sys.log.some((l) => l.link === link && now - l.t < 0.4);
    const net = sys.commNet();
    const plc = sys.plc;
    const busy = (conn) => {
      const k = net(conn.a.dev, conn.a.port);
      if (!k || !plc) return false;
      if (k === net(plc.dev.id, 'COM2')) return recent('COM2') || (sys.hmiLinkState.ok && sys.hmiLinkState.port === 'COM2' && recent('COM2'));
      if (k === net(plc.dev.id, 'COM1')) return recent('COM1');
      if (k === net(plc.dev.id, 'USB')) return sys.pcLink().ok;
      return false;
    };
    this.scene.updateFlows((c) => sys.connLive(c), busy);
  }

  updateStatus() {
    const sys = this.sys;
    if (!sys) return;
    const s = sys.summary();
    const t = sys.time;
    const mm = Math.floor(t / 60), ss = (t - mm * 60).toFixed(1).padStart(4, '0');
    const chip = (cls, txt) => `<span class="ls-chip ${cls}">${txt}</span>`;
    let html = `<span class="dot live"></span><b>${String(mm).padStart(2, '0')}:${ss}</b>`;
    if ((this.speed || 1) !== 1) html += `<span class="ls-chip warn">${fmtSpeed(this.speed)}</span>`;
    if (s.plc) html += chip(s.plc === 'RUN' ? 'ok' : s.plc === 'STOP' ? 'warn' : 'off', `PLC ${s.plc}`);
    if (s.scan !== null && s.scan !== undefined) html += `<span class="ls-dim">${s.scan.toFixed(1)} ms</span>`;
    if (s.hmi) html += chip(s.hmi === 'ok' ? 'ok' : s.hmi === 'err' ? 'err' : 'off', 'HMI');
    if (s.com2) html += chip(s.com2 === 'ok' ? 'ok' : 'err', 'COM2');
    if (s.hz !== null && s.hz !== undefined) html += chip('hz', `${s.hz.toFixed(2)} Hz`);
    const n = sys.issues.filter((i) => i.level !== 'info').length;
    if (n) html += `<button class="warn-pill" data-act="issues">${icon('warning', 14)}<span>${n}</span></button>`;
    if (html !== this.lastStatus) {
      this.lastStatus = html;
      this.status.innerHTML = html;
      const wp = this.status.querySelector('[data-act="issues"]');
      if (wp) wp.onclick = () => this.views.panel.showIssues();
    }
  }

  renderLaptopScreen(force = false) {
    const sys = this.sys;
    const plcDev = this.project.devices.find((d) => DEVICE_DEFS[d.type].category === 'plc');
    const plcRt = sys && sys.plc;
    const online = !!(sys && sys.pcLink().ok);
    const opts = {
      project: this.project,
      plc: plcDev ? { short: DEVICE_DEFS[plcDev.type].short, mode: plcRt ? plcRt.cpu.mode : 'OFF' } : null,
      online,
      simTime: sys ? `${Math.floor(sys.time)} s` : '',
      compiledLive: online && plcRt && plcRt.cpu.running && this.views.ladder.inSync() ? (ri) => plcRt.cpu.rungLive(ri) : null,
    };
    // redraw (and upload to the GPU) only when something on the screen changed: re-uploading the
    // 1024 × 640 screen four times a second made the 3D view stutter
    const live = opts.compiledLive ? this.project.program.rungs.map((r, i) => JSON.stringify(opts.compiledLive(i))).join(';') : '';
    const sig = JSON.stringify([opts.plc, online, opts.simTime, this.project.name, this.project.program]) + live;
    if (!force && sig === this.laptopSig) return;
    this.laptopSig = sig;
    renderLaptop(this.laptopCanvas, opts);
    if (this.scene) this.scene.laptopDirty = true;
  }

  /** Draw screens while the simulation is stopped. */
  renderStatic() {
    renderHmi(this.hmiCanvas, null, null);
    const g = this.hmiCanvas.getContext('2d');
    g.fillStyle = '#020305'; g.fillRect(0, 0, 800, 480);
    if (this.scene) this.scene.hmiDirty = true;
    this.renderLaptopScreen(true);
    if (this.views.hmi) this.views.hmi.refresh();
  }

  // ------------------------------------------------------------------ helpers for the views
  plcDevice() { const id = activePlcId(this.project); return id ? this.project.devices.find((d) => d.id === id) : null; }
  plcModel() { const d = this.plcDevice(); return d ? DEVICE_DEFS[d.type].model : null; }
  deviceName(dev) {
    const def = DEVICE_DEFS[dev.type];
    const p = deviceProps(dev);
    return hasLabel(def) && p.label ? `${def.short} “${p.label}”` : def.short;
  }

  /** Make sure the simulation runs and the PC ↔ PLC link is up. Resolves to the PLC runtime or null. */
  async ensureOnline() {
    if (!this.sys) { this.startSim(); toast('Simulation started'); await new Promise((r) => setTimeout(r, 350)); }
    if (!this.sys) return null;
    const link = this.sys.pcLink();
    if (!link.ok) {
      const go = await dialog({
        title: 'No connection to the PLC',
        body: `<p>${link.reason}.</p><p class="muted">ISPSoft talks to the PLC through the laptop's USB cable.</p>`,
        actions: [{ label: 'Close', value: false, cls: 'btn-ghost' }, { label: 'Show in 3D', value: true, cls: 'btn-primary' }],
      });
      if (go) { this.setTab('panel'); const pc = this.project.devices.find((d) => d.type === 'laptop'); const plc = this.plcDevice(); this.scene.focus(plc ? plc.id : pc ? pc.id : 'overview'); }
      return null;
    }
    return this.sys.plc;
  }

  confirm(title, msg, ok = 'OK', danger = false) { return confirmDialog(title, msg, ok, danger); }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function fmtSpeed(k) { return k === 0.25 ? '¼×' : k === 0.5 ? '½×' : k + '×'; }
