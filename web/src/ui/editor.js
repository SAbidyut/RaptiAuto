// Project editor screen: circuit canvas + code editor + serial monitor + simulation control.
import { getDef, newId, partProps, worldBox, defaultProps } from '../components/registry.js';
import { saveProject, exportJSON } from '../store.js';
import { SimEngine } from '../sim/engine.js';
import { CircuitCanvas, makeSelection } from './canvas.js';
import { CodeEditor } from './code.js';
import { SerialMonitor } from './serial.js';
import { openLibrary } from './library.js';
import { openPartProps, openWireSheet, openSimControls } from './inspector.js';
import { h, toast, pushBack, popupMenu, promptDialog, confirmDialog, debounce, dialog } from './widgets.js';
import { icon } from './icons.js';
import { FsDock } from './fsdock.js';
import { Native } from '../native.js';
import { AudioEngine } from './audio.js';
import { VirtualNet } from '../net/network.js';
import { IotPane } from './iotpane.js';

/** True when the sketch prints to or reads from a serial port (comments and string literals are ignored). */
export function sketchUsesSerial(code) {
  // one pass, so whichever comes first wins ("http://…" in a string is not a comment)
  const src = String(code || '').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, ' ');
  // Only setting the port up (begin/end, waiting for it) is not "using" the Serial Monitor.
  const used = src
    .replace(/\bSerial(?:USB|\d)?\s*\.\s*(?:begin|end|setTimeout)\s*\([^)]*\)/g, ' ')
    .replace(/!\s*Serial(?:USB|\d)?\b/g, ' ');
  return /\bSerial(?:USB|\d)?\b/.test(used);
}

export class Editor {
  constructor(app, project) {
    this.app = app;
    this.project = project;
    this.settings = app.settings;
    this.engine = null;
    this.history = [];
    this.future = [];
    this.tab = 'circuit';
    this.panes = null; // landscape: the screens the user chose with the tab bar (null = automatic)
    this.fullscreen = false;
    this.warnings = [];
    this.audio = new AudioEngine();
    this.net = new VirtualNet();   // the simulated Wi-Fi / internet the boards' WiFi libraries use (kept between runs)
    this.save = debounce(() => this.saveNow(), 700);
    this.build();
    this.snapshot = this.serialize();
  }

  // ------------------------------------------------------------------ DOM
  build() {
    this.root = h('div', { class: 'screen editor tab-circuit' });
    // top bar
    this.titleEl = h('button', { class: 'ed-title', onclick: () => this.rename() }, h('span', {}, this.project.name));
    this.boardChip = h('button', { class: 'board-chip', onclick: () => this.showBoardInfo() }, this.boardChipText());
    this.runBtn = h('button', { class: 'run-btn', onclick: () => this.toggleRun(), html: `${icon('play', 20)}<span>Run</span>` });
    const menuBtn = h('button', { class: 'icon-btn', 'aria-label': 'Menu', html: icon('dots'), onclick: (e) => this.menu(e.currentTarget) });
    const back = h('button', { class: 'icon-btn', 'aria-label': 'Back', html: icon('back'), onclick: () => this.leave() });
    this.topbar = h('header', { class: 'ed-top' }, back, h('div', { class: 'ed-titles' }, this.titleEl, this.boardChip), this.runBtn, menuBtn);

    // panes
    this.circuitPane = h('section', { class: 'pane pane-circuit' });
    this.codePane = h('section', { class: 'pane pane-code' });
    this.serialPane = h('section', { class: 'pane pane-serial' });
    this.iotHost = h('section', { class: 'pane pane-iot' });
    this.main = h('main', { class: 'ed-main' }, this.circuitPane, this.codePane, this.serialPane, this.iotHost);
    this.iot = new IotPane(this.net, this.iotHost, { onActivity: () => { if (this.tab !== 'iot') this.setBadge('iot', true); } });

    // circuit canvas
    this.canvasHost = h('div', { class: 'canvas-host' });
    this.circuitPane.appendChild(this.canvasHost);
    this.canvas = new CircuitCanvas(this.canvasHost, this);
    this.buildCircuitOverlay();

    // code
    this.codeTabs = h('div', { class: 'code-tabs' });
    const codeBar = h('div', { class: 'code-bar' },
      this.codeTabs,
      h('button', { class: 'icon-btn sm', title: 'Search', html: icon('search', 19), onclick: () => this.code.search() }),
      h('button', { class: 'icon-btn sm', title: 'Smaller text', html: `<b class="tsz">A−</b>`, onclick: () => this.fontSize(-1) }),
      h('button', { class: 'icon-btn sm', title: 'Bigger text', html: `<b class="tsz">A+</b>`, onclick: () => this.fontSize(1) }),
      h('button', { class: 'icon-btn sm', title: 'Fullscreen', html: icon('fullscreen', 19), onclick: () => this.setFullscreen(!this.fullscreen) }));
    this.codeHost = h('div', { class: 'code-host' });
    this.errorBar = h('div', { class: 'error-bar hidden' });
    this.codePane.append(codeBar, this.errorBar, this.codeHost);
    this.code = new CodeEditor(this.codeHost, {
      code: this.project.code,
      fontSize: this.settings.fontSize || 14,
      onChange: (v) => { this.setCodeOf(this.codeTarget, v); this.code.clearError(); this.errorBar.classList.add('hidden'); this.save(); if (this.engine) this.showStaleBanner(); },
    });

    this.drawCodeTabs();

    // serial
    this.serial = new SerialMonitor(this.serialPane, { onSend: (t) => this.sendSerial(t) });

    // bottom nav
    const tab = (id, ic, label) => h('button', { class: 'nav-tab' + (id === this.tab ? ' active' : ''), 'data-tab': id, onclick: () => this.toggleTab(id), html: `${icon(ic, 22)}<span>${label}</span><i class="badge hidden"></i>` });
    this.nav = h('nav', { class: 'ed-nav' }, tab('circuit', 'circuit', 'Circuit'), tab('code', 'code', 'Code'), tab('serial', 'terminal', 'Serial'), tab('iot', 'globe', 'IoT'));

    // status bar (simulation)
    this.status = h('div', { class: 'sim-status hidden' });

    // fullscreen mini toolbar
    this.fsBar = h('div', { class: 'fs-bar' },
      h('button', { class: 'fs-btn', title: 'Exit fullscreen', html: icon('fullscreenExit', 20), onclick: () => this.setFullscreen(false) }),
      this.fsRun = h('button', { class: 'fs-btn fs-run', html: icon('play', 20), onclick: () => this.toggleRun() }),
      h('button', { class: 'fs-btn', 'data-tab': 'circuit', html: icon('circuit', 20), onclick: () => this.toggleTab('circuit') }),
      h('button', { class: 'fs-btn', 'data-tab': 'code', html: icon('code', 20), onclick: () => this.toggleTab('code') }),
      h('button', { class: 'fs-btn', 'data-tab': 'serial', html: icon('terminal', 20), onclick: () => this.toggleTab('serial') }),
      h('button', { class: 'fs-btn fs-iot', 'data-tab': 'iot', html: icon('globe', 20), onclick: () => this.toggleTab('iot') }));

    // full screen hides every menu; this small handle brings them back
    this.fsHandle = h('button', { class: 'fs-handle', 'aria-label': 'Show menus', title: 'Show menus', html: icon('menu', 19) });

    this.root.append(this.topbar, this.status, this.main, this.nav, this.fsBar);
    this.dock = new FsDock({ root: this.root, bar: this.fsBar, handle: this.fsHandle, key: 'editor', orient: 'col', home: { fx: 0, fy: 0 }, settings: this.settings, save: () => this.app.saveSettings(), toggle: () => this.setChrome(this.root.classList.contains('fs-clean')) });
    this.refreshIotTab();
    this.stale = h('div', { class: 'stale-banner hidden', html: `${icon('restart', 16)}<span>Code changed — restart to apply</span>`, onclick: () => this.restart() });
    this.circuitPane.appendChild(this.stale);
    this.updateLayout();
    this.resizeObs = new ResizeObserver(() => this.updateLayout());
    this.resizeObs.observe(this.root);
  }

  buildCircuitOverlay() {
    const p = this.circuitPane;
    this.fabAdd = h('button', { class: 'fab fab-main', 'aria-label': 'Add component', html: icon('plus', 26), onclick: () => this.addComponent() });
    const side = h('div', { class: 'side-tools' },
      h('button', { class: 'tool', title: 'Undo', html: icon('undo', 20), onclick: () => this.undo() }),
      h('button', { class: 'tool', title: 'Redo', html: icon('redo', 20), onclick: () => this.redo() }),
      h('div', { class: 'tool-sep' }),
      this.selTool = h('button', { class: 'tool tool-edit tool-select', title: 'Select (box)', 'aria-label': 'Select', html: icon('select', 20), onclick: () => this.toggleSelectTool() }),
      h('button', { class: 'tool', title: 'Zoom in', html: icon('zoomIn', 20), onclick: () => this.canvas.zoomBy(1.3) }),
      h('button', { class: 'tool', title: 'Zoom out', html: icon('zoomOut', 20), onclick: () => this.canvas.zoomBy(1 / 1.3) }),
      h('button', { class: 'tool', title: 'Fit to screen', html: icon('fit', 20), onclick: () => this.canvas.fit() }),
      h('button', { class: 'tool tool-fs', title: 'Fullscreen', html: icon('fullscreen', 20), onclick: () => this.setFullscreen(!this.fullscreen) }));
    this.selBar = h('div', { class: 'sel-bar hidden' });
    this.wireBar = h('div', { class: 'wire-bar hidden' });
    this.hint = h('div', { class: 'canvas-hint hidden' });
    p.append(side, this.fabAdd, this.selBar, this.wireBar, this.hint);
    this.sideTools = side;
  }

  mount(parent) {
    parent.appendChild(this.root);
    this.canvas.render();
    requestAnimationFrame(() => this.canvas.fit(false));
    this.unback = pushBack(() => this.onBackInEditor());
    if (this.project.parts.length <= 1 && !this.project.wires.length) this.showHint('Tap ＋ to add parts. Tap a pin, then another pin to draw a wire.');
  }

  unmount() {
    this.stop();
    this.iot.destroy();
    this.resizeObs.disconnect();
    this.canvas.destroy();
    this.audio.close();
    if (this.unback) this.unback();
    this.root.remove();
  }

  onBackInEditor() {
    // re-arm (back stack entry was consumed)
    if (this.fullscreen) { this.setFullscreen(false); this.unback = pushBack(() => this.onBackInEditor()); return; }
    if (this.canvas.wiring) { this.canvas.cancelWiring(); this.unback = pushBack(() => this.onBackInEditor()); return; }
    if (this.canvas.selection) { this.canvas.select(null); this.unback = pushBack(() => this.onBackInEditor()); return; }
    if (this.tab !== 'circuit' && !this.split) { this.setTab('circuit'); this.unback = pushBack(() => this.onBackInEditor()); return; }
    this.unback = null;
    this.leave();
  }

  /**
   * Landscape can show two screens side by side. Automatic: circuit + code (normal landscape), or in
   * full screen only circuit + Serial Monitor while a sketch with Serial runs. The tab bar / dock
   * overrides it: a tap opens a screen beside the one on show, a second tap closes it (toggleTab).
   */
  updateLayout() {
    const r = this.root.getBoundingClientRect();
    const wide = r.width >= 760 && r.width > r.height * 1.05;
    if (wide !== this.wide) {
      this.wide = wide;
      this.root.classList.toggle('wide', wide);
    }
    const chosen = wide && !!this.panes && this.panes.includes(this.tab);
    // Full screen + running a sketch that uses Serial: circuit and Serial Monitor together (side by
    // side in landscape, stacked in portrait). Sketches without Serial keep the circuit alone.
    // Stopped: one panel at a time. The code tab always gets the whole screen.
    const runsplit = !chosen && this.fullscreen && !!this.engine && this.tab !== 'code' && (this.usesSerial || this.serialSeen);
    if (runsplit !== this.runsplit) {
      this.runsplit = runsplit;
      this.root.classList.toggle('runsplit', runsplit);
      if (runsplit) {
        this.setBadge('serial', false);
        requestAnimationFrame(() => { this.serial.redraw(); if (this.serial.mode === 'plotter') this.serial.drawPlot(); });
      }
      requestAnimationFrame(() => this.canvas.applyView());
    }
    const vis = this.visibleTabs(wide, runsplit);
    const split = wide && !runsplit && vis.length > 1;
    if (split !== this.split) {
      this.split = split;
      this.root.classList.toggle('split', split);
      requestAnimationFrame(() => this.canvas.applyView());
    }
    const key = vis.join();
    if (key !== this.visKey) {
      const prev = this.visKey;
      this.visKey = key;
      for (const [id, pane] of [['circuit', this.circuitPane], ['code', this.codePane], ['serial', this.serialPane], ['iot', this.iotHost]]) pane.classList.toggle('show', vis.includes(id));
      if (prev !== undefined) requestAnimationFrame(() => {
        this.canvas.applyView();
        if (vis.includes('serial')) { this.serial.redraw(); if (this.serial.mode === 'plotter') this.serial.drawPlot(); }
      });
    }
    for (const b of this.nav.children) if (b.dataset.tab) b.classList.toggle('active', vis.includes(b.dataset.tab) || (runsplit && b.dataset.tab !== 'code'));
    for (const b of this.fsBar.querySelectorAll('[data-tab]')) {
      b.classList.toggle('active', vis.includes(b.dataset.tab) || (runsplit && b.dataset.tab !== 'code'));
    }
  }

  /** The screens on show: the chosen ones, else automatic (see updateLayout). */
  visibleTabs(wide, runsplit) {
    const t = this.tab;
    if (!wide) return [t];
    if (this.panes && this.panes.includes(t)) return this.panes;
    if (runsplit) return ['circuit', 'serial'];
    const auto = this.fullscreen ? this.settings.splitFs === true : this.settings.split !== false;
    if (!auto) return [t];
    return t === 'circuit' ? ['circuit', 'code'] : ['circuit', t];
  }

  /**
   * Tab bar / dock tap. Upright phone: show that screen. Landscape (also in full screen): a tap
   * opens the screen beside the one on show, a second tap closes it again; two screens at most,
   * the last one always stays, a third swaps the second one (the first stays).
   */
  toggleTab(t) {
    if (t === 'iot' && !this.hasWifi()) t = 'circuit';
    if (!this.wide) { this.setTab(t); return; }
    let cur = [...this.visibleTabs(true, this.runsplit && !(this.panes && this.panes.includes(this.tab)))];
    if (cur.includes(t)) {
      if (cur.length < 2) { Native.vibrate(5); return; }
      cur = cur.filter((x) => x !== t);
    } else if (cur.length < 2) cur.push(t);
    else cur[1] = t;
    this.panes = cur;
    this.setTab(cur[cur.length - 1]);
    Native.vibrate(8);
  }

  setTab(t) {
    if (t === 'iot' && !this.hasWifi()) t = 'circuit';
    if (this.panes) {
      if (!this.wide) this.panes = null;
      else if (!this.panes.includes(t)) {
        const i = this.panes.indexOf(this.tab);
        this.panes = i >= 0 && this.panes.length > 1 ? this.panes.map((x, k) => (k === i ? t : x)) : [t];
      }
    }
    this.tab = t;
    this.root.classList.remove('tab-circuit', 'tab-code', 'tab-serial', 'tab-iot');
    this.root.classList.add('tab-' + t);
    for (const b of this.nav.children) b.classList.toggle('active', b.dataset.tab === t);
    this.updateLayout();
    if (t === 'iot') { this.setBadge('iot', false); this.iot.shown(); }
    if (t === 'serial') { this.setBadge('serial', false); this.serial.redraw(); if (this.serial.mode === 'plotter') this.serial.drawPlot(); }
    if (t === 'circuit') requestAnimationFrame(() => this.canvas.applyView());
    if (t !== 'code') document.activeElement && document.activeElement.blur && document.activeElement.blur();
  }

  setBadge(tab, on, text = '') {
    const b = this.nav.querySelector(`[data-tab="${tab}"] .badge`);
    if (!b) return;
    b.classList.toggle('hidden', !on);
    b.textContent = text;
  }

  setFullscreen(on) {
    this.fullscreen = on;
    this.panes = null; // full screen starts automatic again
    this.root.classList.toggle('fs', on);
    this.setChrome(!on, false);
    if (on && !this.settings.fsHinted) { this.settings.fsHinted = true; this.app.saveSettings(); toast('Full screen — tap ☰ for the menus, drag it to move it'); }
    this.updateLayout();
    Native.setImmersive(on);
    Native.vibrate(8);
    setTimeout(() => this.canvas.applyView(), 60);
    setTimeout(() => this.canvas.applyView(), 400);
  }

  /** Full screen: show (on) or hide the menus and tool bars. */
  setChrome(on, buzz = true) {
    this.root.classList.toggle('fs-clean', !on);
    this.fsHandle.innerHTML = icon(on ? 'close' : 'menu', 19);
    this.fsHandle.setAttribute('aria-label', on ? 'Hide menus' : 'Show menus');
    if (this.dock) this.dock.place();
    if (buzz) Native.vibrate(6);
    setTimeout(() => this.canvas.applyView(), 30);
  }

  toggleSelectTool(on = !this.canvas.selectTool) {
    this.canvas.setSelectTool(on);
    this.selTool.classList.toggle('on', on);
    Native.vibrate(8);
    if (on) this.showHint('Select: drag to the RIGHT → window (parts fully inside). Drag to the LEFT → crossing (everything it touches). Tap parts to add or remove them.', 6500);
    else this.hint.classList.add('hidden');
  }

  showHint(text, ms = 5200) {
    this.hint.textContent = text;
    this.hint.classList.remove('hidden');
    clearTimeout(this.hintT);
    this.hintT = setTimeout(() => this.hint.classList.add('hidden'), ms);
  }

  // ------------------------------------------------------------------ project ops
  boardPart() { return this.project.parts.find((p) => getDef(p.type) && getDef(p.type).board); }

  /** Every programmable board: the first runs project.code, the others their own part.code. */
  boardParts() { return this.project.parts.filter((p) => getDef(p.type) && getDef(p.type).board); }

  codeOf(id) {
    const bs = this.boardParts();
    const b = id && bs.indexOf(bs.find((p) => p.id === id)) > 0 ? bs.find((p) => p.id === id) : null;
    return b ? b.code || '' : this.project.code;
  }

  setCodeOf(id, v) {
    const bs = this.boardParts();
    const b = id && bs.indexOf(bs.find((p) => p.id === id)) > 0 ? bs.find((p) => p.id === id) : null;
    if (b) b.code = v; else this.project.code = v;
  }

  /** Does the circuit have a board with Wi-Fi (ESP32, NodeMCU, Uno R4 WiFi)? Then the IoT tab shows. */
  hasWifi() { return this.boardParts().some((p) => { const d = getDef(p.type); return d && d.board && d.board.wifi; }); }

  refreshIotTab() {
    const on = this.hasWifi();
    for (const b of this.root.querySelectorAll('[data-tab="iot"]')) b.classList.toggle('hidden', !on);
    if (!on && this.tab === 'iot') this.setTab('circuit');
  }

  boardChipText() {
    const bs = this.boardParts();
    if (!bs.length) return 'No board';
    if (bs.length === 1) return getDef(bs[0].type).name;
    return bs.map((p) => getDef(p.type).name.replace('Arduino ', '')).join(' + ');
  }

  boardTitle(p, i) { return p.title || (i === 0 ? 'Board 1' : 'Board ' + (i + 1)); }

  /** Code tab header: "sketch.ino", or one tab per board when the circuit has several. */
  drawCodeTabs() {
    if (!this.codeTabs) return;
    const bs = this.boardParts();
    const ids = bs.map((p) => p.id);
    if (this.codeTarget && !ids.includes(this.codeTarget)) this.codeTarget = null;
    const cur = this.codeTarget || ids[0] || null;
    const key = bs.map((p, i) => p.id + this.boardTitle(p, i)).join('|') + '#' + cur;
    if (key === this._codeTabsKey) return;
    this._codeTabsKey = key;
    this.codeTabs.innerHTML = '';
    if (bs.length < 2) {
      this.codeTabs.appendChild(h('span', { class: 'code-file', html: `${icon('code', 16)}<span>sketch.ino</span>` }));
      if (this.code) this.code.setValue(this.project.code);
      return;
    }
    bs.forEach((p, i) => {
      this.codeTabs.appendChild(h('button', { class: 'code-tab' + (p.id === cur ? ' active' : ''), onclick: () => this.showCodeOf(p.id), oncontextmenu: (e) => { e.preventDefault(); this.renameBoard(p); } },
        h('b', {}, this.boardTitle(p, i)), h('small', {}, getDef(p.type).name.replace('Arduino ', ''))));
    });
    this.codeTabs.appendChild(h('button', { class: 'icon-btn sm code-tab-edit', title: 'Rename the board', 'aria-label': 'Rename the board', html: icon('edit', 16), onclick: () => this.renameBoard(bs.find((p) => p.id === cur)) }));
    if (this.code) this.code.setValue(this.codeOf(cur));
  }

  showCodeOf(id) {
    const ids = this.boardParts().map((p) => p.id);
    this.codeTarget = id === ids[0] ? null : id;
    this.code.clearError();
    this.errorBar.classList.add('hidden');
    this.drawCodeTabs();
  }

  async renameBoard(p) {
    if (!p) return;
    const bs = this.boardParts();
    const name = await promptDialog('Board name (e.g. Master, Slave)', this.boardTitle(p, bs.indexOf(p)));
    if (!name) return;
    p.title = name.slice(0, 20);
    this._codeTabsKey = null;
    this.drawCodeTabs();
    this.commit('Rename board');
  }

  serialize() { return JSON.stringify({ parts: this.project.parts, wires: this.project.wires }); }

  commit(label) {
    const snap = this.serialize();
    if (snap !== this.snapshot) {
      this.history.push(this.snapshot);
      if (this.history.length > 80) this.history.shift();
      this.future = [];
      this.snapshot = snap;
    }
    this.canvas.render();
    this.selectionChanged(this.canvas.selection);
    this.drawCodeTabs();
    this.save();
    if (this.engine && this.engine.running) this.showStaleBanner(true);
    void label;
  }

  restore(snap) {
    const s = JSON.parse(snap);
    this.project.parts = s.parts;
    this.project.wires = s.wires;
    this.snapshot = snap;
    this.canvas.selection = null;
    this.canvas.render();
    this.selectionChanged(null);
    this.drawCodeTabs();
    this.save();
  }

  undo() {
    if (this.engine) { toast('Stop the simulation to edit the circuit', 'warn'); return; }
    if (!this.history.length) { toast('Nothing to undo'); return; }
    this.future.push(this.snapshot);
    this.restore(this.history.pop());
    Native.vibrate(6);
  }

  redo() {
    if (this.engine) return;
    if (!this.future.length) { toast('Nothing to redo'); return; }
    this.history.push(this.snapshot);
    this.restore(this.future.pop());
    Native.vibrate(6);
  }

  saveNow() {
    if (!saveProject(this.project)) toast('Storage is full — could not save', 'error');
  }

  async rename() {
    const name = await promptDialog('Project name', this.project.name);
    if (name) {
      this.project.name = name;
      this.titleEl.firstChild.textContent = name;
      this.saveNow();
    }
  }

  addComponent() {
    if (this.engine) { toast('Stop the simulation to add parts', 'warn'); return; }
    openLibrary({ onPick: (def) => this.placePart(def) });
  }

  placePart(def) {
    if (def.board && this.boardPart()) {
      confirmDialog('Add a second board?', `This project already has a <b>${getDef(this.boardPart().type).name}</b>. <b>${def.name}</b> gets its own sketch: pick it at the top of the Code tab. Wire GND to GND, then SDA/SCL (I²C) or TX → RX (Serial) so the boards can talk.`, 'Add').then((ok) => { if (ok) this.placePartNow(def); });
      return;
    }
    this.placePartNow(def);
  }

  placePartNow(def) {
    const r = this.canvasHost.getBoundingClientRect();
    const [cx, cy] = this.canvas.screenToWorld(r.left + r.width / 2, r.top + r.height * 0.45);
    const box = typeof def.box === 'function' ? def.box(defaultProps(def)) : def.box;
    const w = box[2] - box[0], hh = box[3] - box[1];
    const x = Math.round((cx - w / 2 - box[0]) / 10) * 10, y = Math.round((cy - hh / 2 - box[1]) / 10) * 10;
    const part = { id: newId('p'), type: def.type, x, y, rot: 0, props: {} };
    if (def.board && this.boardPart()) {
      part.title = 'Board ' + (this.boardParts().length + 1);
      part.code = 'void setup() {\n  // this board\'s own sketch\n}\n\nvoid loop() {\n}\n';
    }
    // avoid stacking exactly on another part
    let tries = 0;
    while (tries++ < 12 && this.project.parts.some((p) => Math.abs(p.x - part.x) < 6 && Math.abs(p.y - part.y) < 6)) { part.x += 20; part.y += 20; }
    this.project.parts.push(part);
    this.commit('Add ' + def.name);
    this.canvas.select({ kind: 'part', id: part.id });
    // make sure it's visible
    const [x0, y0, x1, y1] = worldBox(part);
    const [sx0, sy0] = this.canvas.worldToScreen(x0, y0), [sx1, sy1] = this.canvas.worldToScreen(x1, y1);
    if (sx0 < r.left || sy0 < r.top || sx1 > r.right || sy1 > r.bottom) this.canvas.fit();
    if (def.board) { this.boardChip.textContent = this.boardChipText(); this.refreshIotTab(); }
    this.showHint(def.layer === -1 ? 'Breadboard added. Drag parts onto it — their legs snap into the holes.' : 'Drag to move. Drop legs on breadboard holes or header pins to plug in. Tap a pin to start a wire.');
    Native.vibrate(10);
  }

  selectionChanged(sel) {
    const bar = this.selBar;
    bar.innerHTML = '';
    if (!sel || this.engine) { bar.classList.add('hidden'); this.fabAdd.classList.remove('hidden'); return; }
    this.fabAdd.classList.add('hidden');
    bar.classList.remove('hidden');
    const btn = (ic, label, fn, cls = '') => h('button', { class: 'sel-btn ' + cls, html: `${icon(ic, 20)}<span>${label}</span>`, onclick: fn });
    if (sel.kind === 'multi') {
      const parts = sel.parts.filter((id) => this.project.parts.some((p) => p.id === id));
      const wires = sel.wires.filter((id) => this.project.wires.some((w) => w.id === id));
      if (parts.length + wires.length < 2) { this.canvas.select(makeSelection(parts, wires)); return; }
      const what = [parts.length ? `${parts.length} part${parts.length > 1 ? 's' : ''}` : '', wires.length ? `${wires.length} wire${wires.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
      appendAll(bar,
        h('div', { class: 'sel-name' }, `${parts.length + wires.length} selected`, h('small', {}, what)),
        parts.length ? btn('mirror', 'Mirror', () => this.flipSelected('x')) : null,
        parts.length ? btn('flipv', 'Flip', () => this.flipSelected('y')) : null,
        parts.length ? btn('copy', 'Copy', () => this.duplicateSelected()) : null,
        wires.length && !parts.length ? btn('eraser', 'Straight', () => { for (const w of this.project.wires) if (wires.includes(w.id)) w.points = []; this.commit('Straighten'); }) : null,
        btn('trash', 'Delete', () => this.deleteSelected(), 'danger'),
        h('button', { class: 'sel-close', html: icon('close', 18), onclick: () => this.canvas.select(null) }));
      return;
    }
    if (sel.kind === 'part') {
      const part = this.project.parts.find((p) => p.id === sel.id);
      if (!part) return;
      const def = getDef(part.type);
      appendAll(bar,
        h('div', { class: 'sel-name' }, def.name, def.label ? h('small', {}, def.label(partProps(part))) : null),
        btn('rotate', 'Rotate', () => this.rotateSelected()),
        btn('mirror', 'Mirror', () => this.flipSelected('x')),
        btn('flipv', 'Flip', () => this.flipSelected('y')),
        def.props.length ? btn('sliders', 'Edit', () => openPartProps(this, part)) : btn('info', 'Info', () => openPartProps(this, part)),
        btn('copy', 'Copy', () => this.duplicateSelected()),
        btn('trash', 'Delete', () => this.deleteSelected(), 'danger'),
        h('button', { class: 'sel-close', html: icon('close', 18), onclick: () => this.canvas.select(null) }));
    } else {
      const w = this.project.wires.find((x) => x.id === sel.id);
      if (!w) return;
      const sw = h('span', { class: 'wire-swatch', style: { background: w.color } });
      appendAll(bar,
        h('div', { class: 'sel-name' }, 'Wire', h('small', {}, `${w.from.pin} → ${w.to.pin}`)),
        h('button', { class: 'sel-btn', onclick: () => openWireSheet(this, w) }, sw, h('span', {}, 'Colour')),
        btn('eraser', 'Straight', () => { w.points = []; this.commit('Straighten'); }),
        btn('trash', 'Delete', () => this.deleteSelected(), 'danger'),
        h('button', { class: 'sel-close', html: icon('close', 18), onclick: () => this.canvas.select(null) }));
    }
  }

  wiringChanged(wr) {
    const bar = this.wireBar;
    if (!wr) { bar.classList.add('hidden'); this.fabAdd.classList.toggle('hidden', !!this.canvas.selection); return; }
    this.fabAdd.classList.add('hidden');
    this.selBar.classList.add('hidden');
    bar.classList.remove('hidden');
    bar.innerHTML = '';
    const pal = h('div', { class: 'wire-colors' });
    for (const c of ['#22c55e', '#3b82f6', '#f97316', '#eab308', '#ef4444', '#111827', '#a855f7', '#f1f5f9']) {
      pal.appendChild(h('button', { class: 'color-dot sm' + (wr.color === c ? ' active' : ''), style: { background: c }, onclick: (e) => { wr.color = c; for (const x of pal.children) x.classList.remove('active'); e.currentTarget.classList.add('active'); this.canvas.renderOverlay(); } }));
    }
    bar.append(
      h('div', { class: 'wire-info', html: `${icon('wire', 18)}<span>Tap a pin to connect · tap empty space to bend</span>` }),
      pal,
      h('div', { class: 'wire-actions' },
        h('button', { class: 'btn btn-ghost sm', html: `${icon('undo', 17)}<span>Point</span>`, onclick: () => this.canvas.undoWirePoint() }),
        h('button', { class: 'btn btn-ghost sm', html: `${icon('close', 17)}<span>Cancel</span>`, onclick: () => this.canvas.cancelWiring() })));
  }

  contextMenu(target, x, y) {
    const anchor = { getBoundingClientRect: () => ({ left: x, right: x + 1, top: y, bottom: y + 1 }) };
    if (target.kind === 'part') {
      const part = this.project.parts.find((p) => p.id === target.id);
      popupMenu(anchor, [
        { icon: 'rotate', label: 'Rotate', action: () => this.rotateSelected() },
        { icon: 'mirror', label: 'Mirror (left ↔ right)', action: () => this.flipSelected('x') },
        { icon: 'flipv', label: 'Flip (up ↕ down)', action: () => this.flipSelected('y') },
        { icon: 'sliders', label: 'Properties', action: () => openPartProps(this, part) },
        { icon: 'copy', label: 'Duplicate', action: () => this.duplicateSelected() },
        { icon: 'wire', label: 'Delete connected wires', action: () => { this.project.wires = this.project.wires.filter((w) => w.from.part !== part.id && w.to.part !== part.id); this.commit('Delete wires'); } },
        '-',
        { icon: 'trash', label: 'Delete', danger: true, action: () => this.deleteSelected() },
      ]);
    } else {
      const w = this.project.wires.find((x) => x.id === target.id);
      popupMenu(anchor, [
        { icon: 'palette', label: 'Wire colour', action: () => openWireSheet(this, w) },
        { icon: 'eraser', label: 'Straighten', action: () => { w.points = []; this.commit('Straighten'); } },
        '-',
        { icon: 'trash', label: 'Delete wire', danger: true, action: () => this.deleteSelected() },
      ]);
    }
  }

  rotateSelected() {
    const sel = this.canvas.selection;
    if (!sel || sel.kind !== 'part' || this.engine) return;
    const part = this.project.parts.find((p) => p.id === sel.id);
    const [x0, y0, x1, y1] = worldBox(part);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    part.rot = ((part.rot || 0) + 90) % 360;
    const [nx0, ny0, nx1, ny1] = worldBox(part);
    part.x += Math.round((cx - (nx0 + nx1) / 2) / 10) * 10;
    part.y += Math.round((cy - (ny0 + ny1) / 2) / 10) * 10;
    this.commit('Rotate');
    Native.vibrate(8);
  }

  /**
   * Mirror (axis 'x': left ↔ right) or flip (axis 'y': up ↕ down) the selected part, or a whole
   * selection about the middle of the group. Pins swap sides, labels stay readable, wires follow.
   */
  flipSelected(axis) {
    const sel = this.canvas.selection;
    if (this.engine) { toast('Stop the simulation to edit the circuit', 'warn'); return; }
    if (!sel || (sel.kind !== 'part' && sel.kind !== 'multi')) return;
    const ids = sel.kind === 'multi' ? sel.parts : [sel.id];
    const parts = ids.map((id) => this.project.parts.find((p) => p.id === id)).filter(Boolean);
    if (!parts.length) return;
    flipParts(this.project, parts, axis, sel.kind === 'multi' ? sel.wires : []);
    this.commit(axis === 'x' ? 'Mirror' : 'Flip');
    Native.vibrate(8);
  }

  duplicateSelected() {
    const sel = this.canvas.selection;
    if (sel && sel.kind === 'multi' && !this.engine) { this.duplicateMany(sel); return; }
    if (!sel || sel.kind !== 'part' || this.engine) return;
    const part = this.project.parts.find((p) => p.id === sel.id);
    const copy = { ...JSON.parse(JSON.stringify(part)), id: newId('p'), x: part.x + 30, y: part.y + 30 };
    if (getDef(part.type).board) {
      // a copy of a board is another board with its own sketch (a copy of this one's)
      copy.title = 'Board ' + (this.boardParts().length + 1);
      copy.code = this.codeOf(part.id);
      copy.x = part.x + 320;
      copy.y = part.y;
      copy.eeprom = undefined;
    }
    this.project.parts.push(copy);
    this.commit('Duplicate');
    this.canvas.select({ kind: 'part', id: copy.id });
  }

  /** Copy several parts together with the wires between them. */
  duplicateMany(sel) {
    const ids = new Set(sel.parts);
    const map = new Map();
    let skippedBoard = false;
    for (const part of this.project.parts) {
      if (!ids.has(part.id)) continue;
      if (getDef(part.type).board && this.boardParts().length >= 4) { skippedBoard = true; continue; }
      const copy = { ...JSON.parse(JSON.stringify(part)), id: newId('p'), x: part.x + 40, y: part.y + 40 };
      map.set(part.id, copy.id);
      this.project.parts.push(copy);
    }
    const wires = [];
    for (const w of this.project.wires.slice()) {
      if (!map.has(w.from.part) || !map.has(w.to.part)) continue;
      const c = { ...JSON.parse(JSON.stringify(w)), id: newId('w'), from: { ...w.from, part: map.get(w.from.part) }, to: { ...w.to, part: map.get(w.to.part) } };
      c.points = c.points.map(([x, y]) => [x + 40, y + 40]);
      this.project.wires.push(c);
      wires.push(c.id);
    }
    if (skippedBoard) toast('Up to 4 boards per project — the board was not copied');
    if (!map.size) return;
    this.commit('Duplicate');
    this.canvas.select(makeSelection([...map.values()], wires));
  }

  deleteSelected() {
    const sel = this.canvas.selection;
    if (!sel || this.engine) return;
    if (sel.kind === 'multi') {
      const parts = new Set(sel.parts), wires = new Set(sel.wires);
      this.project.parts = this.project.parts.filter((p) => !parts.has(p.id));
      this.project.wires = this.project.wires.filter((w) => !wires.has(w.id) && !parts.has(w.from.part) && !parts.has(w.to.part));
    } else if (sel.kind === 'part') {
      this.project.parts = this.project.parts.filter((p) => p.id !== sel.id);
      this.project.wires = this.project.wires.filter((w) => w.from.part !== sel.id && w.to.part !== sel.id);
    } else {
      this.project.wires = this.project.wires.filter((w) => w.id !== sel.id);
    }
    this.canvas.selection = null;
    this.commit('Delete');
    Native.vibrate(12);
  }

  openProps(part) { if (!this.engine) openPartProps(this, part); }

  openSimControls(part) {
    if (this.simSheet) this.simSheet.close();
    this.simSheet = openSimControls(this, part);
  }

  fontSize(d) {
    const s = Math.max(10, Math.min(24, (this.settings.fontSize || 14) + d));
    this.settings.fontSize = s;
    this.app.saveSettings();
    this.code.setFontSize(s);
  }

  showBoardInfo() {
    const b = this.boardPart();
    if (!b) { this.addComponent(); return; }
    const def = getDef(b.type);
    const bd = def.board;
    dialog({
      title: def.name,
      body: `<div class="board-info">
        <p>${def.description}</p>
        <table>
          <tr><td>Architecture</td><td>${bd.arch === 'avr' ? 'AVR 8-bit' : bd.arch === 'xtensa' ? 'Xtensa 32-bit' : 'ARM 32-bit'}</td></tr>
          <tr><td>Clock</td><td>${bd.mhz} MHz</td></tr>
          <tr><td>Logic level</td><td>${bd.vcc} V</td></tr>
          <tr><td>int size</td><td>${bd.arch === 'avr' ? '16-bit (−32768…32767)' : '32-bit'}</td></tr>
          <tr><td>ADC</td><td>${bd.adcBits}-bit (0–${2 ** bd.adcBits - 1})</td></tr>
          <tr><td>RAM / Flash</td><td>${fmtBytes(bd.ram)} / ${fmtBytes(bd.flash)}</td></tr>
          <tr><td>Serial ports</td><td>${(bd.serialPorts || []).join(', ') || 'none'}</td></tr>
          ${bd.pwmPins ? `<tr><td>PWM pins</td><td>${bd.pwmPins.map((p) => bd.pinMap[p]).join(', ')}</td></tr>` : ''}
          ${bd.i2c ? `<tr><td>I²C</td><td>SDA ${bd.pinMap[bd.i2c.sda]} · SCL ${bd.pinMap[bd.i2c.scl]}</td></tr>` : ''}
        </table></div>`,
      actions: [{ label: 'Close', value: true, cls: 'btn-primary' }],
    });
  }

  menu(anchor) {
    popupMenu(anchor, [
      { icon: 'save', label: 'Save', action: () => { this.saveNow(); toast('Project saved', 'ok'); } },
      { icon: 'edit', label: 'Rename', action: () => this.rename() },
      { icon: 'download', label: 'Export project (.rapti)', action: () => this.exportProject() },
      { icon: 'code', label: 'Export sketch (.ino)', action: () => Native.saveFile(safeName(this.project.name) + '.ino', 'text/plain', this.project.code).then((ok) => ok && toast('Sketch exported', 'ok')) },
      { icon: 'share', label: 'Share code', action: () => Native.shareText(this.project.name, this.project.code) },
      '-',
      { icon: 'chip', label: 'Board info', action: () => this.showBoardInfo() },
      { icon: 'wire', label: this.settings.wireStyle === 'straight' ? 'Smooth wires' : 'Straight wires', action: () => { this.settings.wireStyle = this.settings.wireStyle === 'straight' ? 'smooth' : 'straight'; this.app.saveSettings(); this.canvas.render(); } },
      { icon: 'bolt', label: this.settings.flow ? 'Hide current flow' : 'Show current flow', action: () => { this.settings.flow = !this.settings.flow; this.app.saveSettings(); } },
      { icon: 'grid', label: this.settings.showGrid ? 'Hide grid' : 'Show grid', action: () => { this.settings.showGrid = !this.settings.showGrid; this.app.saveSettings(); this.canvas.applyView(); } },
      '-',
      { icon: 'trash', label: 'Clear circuit (keep board)', danger: true, action: async () => { if (await confirmDialog('Clear circuit?', 'All parts and wires except the board will be removed.', 'Clear', true)) { const b = this.boardPart(); this.project.parts = b ? [b] : []; this.project.wires = []; this.commit('Clear'); } } },
    ]);
  }

  async exportProject() {
    const ok = await Native.saveFile(safeName(this.project.name) + '.rapti', 'application/json', exportJSON(this.project));
    if (ok) toast('Project exported', 'ok');
  }

  leave() {
    this.saveNow();
    this.app.showHome();
  }

  // ------------------------------------------------------------------ simulation
  toggleRun() {
    if (this.engine) this.stop();
    else this.run();
  }

  run() {
    if (this.canvas.wiring) this.canvas.cancelWiring();
    this.canvas.select(null);
    this.code.clearError();
    this.errorBar.classList.add('hidden');
    this.warnings = [];
    this.serial.clear();
    this.usesSerial = this.boardParts().some((p, i) => sketchUsesSerial(i ? p.code : this.project.code));
    this.serialSeen = false;
    this.audio.resume();
    const lineStart = new Map();
    const engine = new SimEngine(this.project, {
      net: this.net,
      onSerial: (port, text, from) => {
        // other boards' Serial output is tagged with the board's name at the start of each line
        if (from) {
          let out = '', at = lineStart.get(from) !== false;
          for (const ch of text) { if (at && ch !== '\n') { out += `[${from}] `; at = false; } out += ch; if (ch === '\n') at = true; }
          lineStart.set(from, at);
          text = out;
        }
        this.serial.write(text);
        if (!this.serialSeen) { this.serialSeen = true; this.updateLayout(); } // serial used indirectly (e.g. via a #define)
        if (this.tab !== 'serial' && !this.runsplit) this.setBadge('serial', true);
      },
      onWarning: (msg) => this.addWarning(msg),
      onError: (err) => this.runtimeError(err),
      onSound: (id, freq, vol) => this.audio.set(id, freq, this.settings.sound === false ? 0 : vol),
      onBurn: () => { Native.vibrate(40); if (this.settings.sound !== false) this.audio.pop(); },
      onEeprom: () => this.save(),
    });
    const res = engine.start();
    if (!res.ok) {
      if (res.boardId) this.showCodeOf(res.boardId); else this.showCodeOf(null);
      this.compileError(res.boardLabel ? { ...res.error, message: `${res.boardLabel}: ${res.error.message}` } : res.error);
      return;
    }
    this.engine = engine;
    this.root.classList.add('simulating');
    this.canvas.setMode('sim');
    this.selectionChanged(null);
    this.runBtn.classList.add('running');
    this.runBtn.innerHTML = `${icon('stop', 18)}<span>Stop</span>`;
    this.fsRun.innerHTML = icon('stop', 20);
    this.fsRun.classList.add('running');
    this.status.classList.remove('hidden');
    this.code.setReadOnly(false);
    Native.keepScreenOn(true);
    Native.vibrate(15);
    if (res.warnings && res.warnings.length) for (const w of res.warnings.slice(0, 3)) this.addWarning(`Line ${w.line}: ${w.message}`, true);
    this.lastFrame = performance.now();
    const loop = (t) => {
      if (!this.engine) return;
      const dt = Math.min(0.1, (t - this.lastFrame) / 1000);
      this.lastFrame = t;
      this.engine.tick(t);
      if (!this.engine) return;
      this.canvas.frame(dt);
      this.updateStatus();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    if (this.tab === 'code' && !(this.wide && this.panes && this.panes.length > 1) && (this.fullscreen || !this.split)) this.setTab('circuit');
    this.updateLayout();
  }

  stop() {
    if (!this.engine) return;
    cancelAnimationFrame(this.raf);
    this.engine.stop();
    this.engine = null;
    this.audio.stopAll();
    if (this.simSheet) { this.simSheet.close(); this.simSheet = null; }
    this.root.classList.remove('simulating');
    this.canvas.setMode('edit');
    this.runBtn.classList.remove('running');
    this.runBtn.innerHTML = `${icon('play', 20)}<span>Run</span>`;
    this.fsRun.innerHTML = icon('play', 20);
    this.fsRun.classList.remove('running');
    this.status.classList.add('hidden');
    this.updateLayout();
    this.stale.classList.add('hidden');
    Native.keepScreenOn(false);
  }

  restart() { this.stop(); this.run(); }

  showStaleBanner(circuit = false) {
    this.stale.querySelector('span').textContent = circuit ? 'Circuit changed — restart to apply' : 'Code changed — restart to apply';
    this.stale.classList.remove('hidden');
  }

  sendSerial(text) {
    if (!this.engine) { toast('Run the simulation first'); return; }
    this.engine.serialIn(text);
    this.serial.write('');
  }

  updateStatus() {
    const e = this.engine;
    if (!e) return;
    const t = e.stats.simTime / 1e6;
    const pct = Math.round(e.stats.realtime * 100);
    const txt = `<span class="dot live"></span><b>${fmtTime(t)}</b><span class="speed ${pct < 70 ? 'slow' : ''}">${pct}% speed</span>` +
      (this.warnings.length ? `<button class="warn-pill" id="warnpill">${icon('warning', 14)}<span>${this.warnings.length}</span></button>` : '');
    if (txt !== this._st) {
      this._st = txt;
      this.status.innerHTML = txt;
      const wp = this.status.querySelector('#warnpill');
      if (wp) wp.onclick = () => this.showWarnings();
    }
  }

  addWarning(msg, quiet = false) {
    this.warnings.push(msg);
    if (!quiet) toast(msg, 'warn', 4800);
  }

  showWarnings() {
    dialog({ title: 'Simulation messages', body: `<ul class="warn-list">${this.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`, actions: [{ label: 'OK', value: true, cls: 'btn-primary' }] });
  }

  compileError(err) {
    this.setTab('code');
    this.code.setError(err);
    this.errorBar.innerHTML = `${icon('warning', 18)}<div><b>${err.line ? `Line ${err.line}` : 'Error'}</b><span></span></div>`;
    this.errorBar.querySelector('span').textContent = err.message;
    this.errorBar.classList.remove('hidden');
    this.errorBar.onclick = () => this.code.setError(err);
    Native.vibrate(40);
    toast('Compilation failed', 'error');
  }

  runtimeError(err) {
    const e = err || { message: 'Unknown error' };
    this.stop();
    if (e.electrical) {
      dialog({ title: '⚡ Simulation stopped', body: `<p>${escapeHtml(e.message)}</p>`, actions: [{ label: 'OK', value: true, cls: 'btn-primary' }] });
      return;
    }
    this.serial.write(`\n[Runtime error${e.boardLabel ? ' · ' + e.boardLabel : ''}${e.line ? ' at line ' + e.line : ''}] ${e.message}\n`);
    this.showCodeOf(e.boardId || null);
    this.setTab('code');
    this.code.setError({ ...e, severity: 'error' });
    this.errorBar.innerHTML = `${icon('warning', 18)}<div><b>Runtime error${e.line ? ' · line ' + e.line : ''}</b><span></span></div>`;
    this.errorBar.querySelector('span').textContent = e.message;
    this.errorBar.classList.remove('hidden');
  }

  onPause() { if (this.engine) this.engine.paused = true; this.audio.suspend(); this.saveNow(); }
  onResume() { if (this.engine) { this.engine.paused = false; this.engine.lastWall = null; } this.audio.resume(); }
}

/**
 * Mirror (axis 'x') or flip (axis 'y') parts about the middle of their joint bounding box. Every part
 * toggles part.flipX / part.flipY (its pins swap sides) and moves to the mirrored place (rounded to
 * the 0.1" grid, so pins stay on the grid); wires that run between the parts are mirrored too.
 */
export function flipParts(project, parts, axis, wireIds = []) {
  const k = axis === 'x' ? 0 : 1;
  const boxes = parts.map((p) => worldBox(p));
  const lo = Math.min(...boxes.map((b) => b[k])), hi = Math.max(...boxes.map((b) => b[k + 2]));
  const mid = (lo + hi) / 2;
  const key = axis === 'x' ? 'flipX' : 'flipY';
  parts.forEach((part, i) => {
    const c0 = (boxes[i][k] + boxes[i][k + 2]) / 2;
    if (part[key]) delete part[key]; else part[key] = true;
    const nb = worldBox(part);
    const c1 = (nb[k] + nb[k + 2]) / 2;
    const shift = Math.round((2 * mid - c0 - c1) / 10) * 10;
    if (axis === 'x') part.x += shift; else part.y += shift;
  });
  const ids = new Set(parts.map((p) => p.id));
  const sel = new Set(wireIds);
  for (const w of project.wires) {
    if (!(ids.has(w.from.part) && ids.has(w.to.part)) && !sel.has(w.id)) continue;
    w.points = w.points.map(([x, y]) => (axis === 'x' ? [Math.round((2 * mid - x) / 5) * 5, y] : [x, Math.round((2 * mid - y) / 5) * 5]));
  }
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`;
}
function fmtBytes(b) { if (!b) return '—'; if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB'; if (b >= 1024) return Math.round(b / 1024) + ' KB'; return b + ' B'; }
function safeName(s) { return (s || 'sketch').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'sketch'; }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/** Element.append without the null / false placeholders of optional buttons. */
function appendAll(parent, ...items) { parent.append(...items.filter(Boolean)); }
