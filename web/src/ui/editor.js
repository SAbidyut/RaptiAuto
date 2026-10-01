// Project editor screen: circuit canvas + code editor + serial monitor + simulation control.
import { getDef, newId, partProps, worldBox, defaultProps } from '../components/registry.js';
import { saveProject, exportJSON } from '../store.js';
import { SimEngine } from '../sim/engine.js';
import { CircuitCanvas } from './canvas.js';
import { CodeEditor } from './code.js';
import { SerialMonitor } from './serial.js';
import { openLibrary } from './library.js';
import { openPartProps, openWireSheet, openSimControls } from './inspector.js';
import { h, toast, pushBack, popupMenu, promptDialog, confirmDialog, debounce, dialog } from './widgets.js';
import { icon } from './icons.js';
import { Native } from '../native.js';
import { AudioEngine } from './audio.js';

export class Editor {
  constructor(app, project) {
    this.app = app;
    this.project = project;
    this.settings = app.settings;
    this.engine = null;
    this.history = [];
    this.future = [];
    this.tab = 'circuit';
    this.fullscreen = false;
    this.warnings = [];
    this.audio = new AudioEngine();
    this.save = debounce(() => this.saveNow(), 700);
    this.build();
    this.snapshot = this.serialize();
  }

  // ------------------------------------------------------------------ DOM
  build() {
    const board = this.boardPart();
    this.root = h('div', { class: 'screen editor tab-circuit' });
    // top bar
    this.titleEl = h('button', { class: 'ed-title', onclick: () => this.rename() }, h('span', {}, this.project.name));
    this.boardChip = h('button', { class: 'board-chip', onclick: () => this.showBoardInfo() }, board ? getDef(board.type).name : 'No board');
    this.runBtn = h('button', { class: 'run-btn', onclick: () => this.toggleRun(), html: `${icon('play', 20)}<span>Run</span>` });
    const menuBtn = h('button', { class: 'icon-btn', 'aria-label': 'Menu', html: icon('dots'), onclick: (e) => this.menu(e.currentTarget) });
    const back = h('button', { class: 'icon-btn', 'aria-label': 'Back', html: icon('back'), onclick: () => this.leave() });
    this.topbar = h('header', { class: 'ed-top' }, back, h('div', { class: 'ed-titles' }, this.titleEl, this.boardChip), this.runBtn, menuBtn);

    // panes
    this.circuitPane = h('section', { class: 'pane pane-circuit' });
    this.codePane = h('section', { class: 'pane pane-code' });
    this.serialPane = h('section', { class: 'pane pane-serial' });
    this.main = h('main', { class: 'ed-main' }, this.circuitPane, this.codePane, this.serialPane);

    // circuit canvas
    this.canvasHost = h('div', { class: 'canvas-host' });
    this.circuitPane.appendChild(this.canvasHost);
    this.canvas = new CircuitCanvas(this.canvasHost, this);
    this.buildCircuitOverlay();

    // code
    const codeBar = h('div', { class: 'code-bar' },
      h('span', { class: 'code-file', html: `${icon('code', 16)}<span>sketch.ino</span>` }),
      h('div', { class: 'grow' }),
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
      onChange: (v) => { this.project.code = v; this.code.clearError(); this.errorBar.classList.add('hidden'); this.save(); if (this.engine) this.showStaleBanner(); },
    });

    // serial
    this.serial = new SerialMonitor(this.serialPane, { onSend: (t) => this.sendSerial(t) });

    // bottom nav
    const tab = (id, ic, label) => h('button', { class: 'nav-tab' + (id === this.tab ? ' active' : ''), 'data-tab': id, onclick: () => this.setTab(id), html: `${icon(ic, 22)}<span>${label}</span><i class="badge hidden"></i>` });
    this.nav = h('nav', { class: 'ed-nav' }, tab('circuit', 'circuit', 'Circuit'), tab('code', 'code', 'Code'), tab('serial', 'terminal', 'Serial'));

    // status bar (simulation)
    this.status = h('div', { class: 'sim-status hidden' });

    // fullscreen mini toolbar
    this.fsBar = h('div', { class: 'fs-bar' },
      h('button', { class: 'fs-btn', title: 'Exit fullscreen', html: icon('fullscreenExit', 20), onclick: () => this.setFullscreen(false) }),
      this.fsRun = h('button', { class: 'fs-btn fs-run', html: icon('play', 20), onclick: () => this.toggleRun() }),
      h('button', { class: 'fs-btn', 'data-tab': 'circuit', html: icon('circuit', 20), onclick: () => this.setTab('circuit') }),
      h('button', { class: 'fs-btn', 'data-tab': 'code', html: icon('code', 20), onclick: () => this.setTab('code') }),
      h('button', { class: 'fs-btn', 'data-tab': 'serial', html: icon('terminal', 20), onclick: () => this.setTab('serial') }));

    this.root.append(this.topbar, this.status, this.main, this.nav, this.fsBar);
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
    if (this.tab !== 'circuit' && !this.wide) { this.setTab('circuit'); this.unback = pushBack(() => this.onBackInEditor()); return; }
    this.unback = null;
    this.leave();
  }

  updateLayout() {
    const r = this.root.getBoundingClientRect();
    const wide = r.width >= 760 && r.width > r.height * 1.05;
    if (wide !== this.wide) {
      this.wide = wide;
      this.root.classList.toggle('wide', wide);
      if (wide && this.tab === 'circuit') this.root.classList.add('tab-code-also');
    }
  }

  setTab(t) {
    if (this.wide && t === 'code' && this.tab === 'circuit') { /* both visible */ }
    this.tab = t;
    this.root.classList.remove('tab-circuit', 'tab-code', 'tab-serial');
    this.root.classList.add('tab-' + t);
    for (const b of this.nav.children) b.classList.toggle('active', b.dataset.tab === t);
    for (const b of this.fsBar.querySelectorAll('[data-tab]')) b.classList.toggle('active', b.dataset.tab === t);
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
    this.root.classList.toggle('fs', on);
    Native.setImmersive(on);
    Native.vibrate(8);
    setTimeout(() => this.canvas.applyView(), 60);
    setTimeout(() => this.canvas.applyView(), 400);
  }

  showHint(text, ms = 5200) {
    this.hint.textContent = text;
    this.hint.classList.remove('hidden');
    clearTimeout(this.hintT);
    this.hintT = setTimeout(() => this.hint.classList.add('hidden'), ms);
  }

  // ------------------------------------------------------------------ project ops
  boardPart() { return this.project.parts.find((p) => getDef(p.type) && getDef(p.type).board); }

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
      confirmDialog('Replace board?', `This project already has a <b>${getDef(this.boardPart().type).name}</b>. Only one programmable board is simulated. Add <b>${def.name}</b> anyway?`, 'Add').then((ok) => { if (ok) this.placePartNow(def); });
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
    if (def.board) { this.boardChip.textContent = def.name; }
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
    if (sel.kind === 'part') {
      const part = this.project.parts.find((p) => p.id === sel.id);
      if (!part) return;
      const def = getDef(part.type);
      bar.append(
        h('div', { class: 'sel-name' }, def.name, def.label ? h('small', {}, def.label(partProps(part))) : null),
        btn('rotate', 'Rotate', () => this.rotateSelected()),
        def.props.length ? btn('sliders', 'Edit', () => openPartProps(this, part)) : btn('info', 'Info', () => openPartProps(this, part)),
        btn('copy', 'Copy', () => this.duplicateSelected()),
        btn('trash', 'Delete', () => this.deleteSelected(), 'danger'),
        h('button', { class: 'sel-close', html: icon('close', 18), onclick: () => this.canvas.select(null) }));
    } else {
      const w = this.project.wires.find((x) => x.id === sel.id);
      if (!w) return;
      const sw = h('span', { class: 'wire-swatch', style: { background: w.color } });
      bar.append(
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

  duplicateSelected() {
    const sel = this.canvas.selection;
    if (!sel || sel.kind !== 'part' || this.engine) return;
    const part = this.project.parts.find((p) => p.id === sel.id);
    if (getDef(part.type).board) { toast('Only one board can be simulated'); return; }
    const copy = { ...JSON.parse(JSON.stringify(part)), id: newId('p'), x: part.x + 30, y: part.y + 30 };
    this.project.parts.push(copy);
    this.commit('Duplicate');
    this.canvas.select({ kind: 'part', id: copy.id });
  }

  deleteSelected() {
    const sel = this.canvas.selection;
    if (!sel || this.engine) return;
    if (sel.kind === 'part') {
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
    this.audio.resume();
    const engine = new SimEngine(this.project, {
      onSerial: (port, text) => { this.serial.write(text); if (this.tab !== 'serial') this.setBadge('serial', true); },
      onWarning: (msg) => this.addWarning(msg),
      onError: (err) => this.runtimeError(err),
      onSound: (id, freq, vol) => this.audio.set(id, freq, vol),
      onEeprom: () => this.save(),
    });
    const res = engine.start();
    if (!res.ok) {
      this.compileError(res.error);
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
    if (this.tab === 'code' && !this.wide) this.setTab('circuit');
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
    this.serial.write(`\n[Runtime error${e.line ? ' at line ' + e.line : ''}] ${e.message}\n`);
    this.setTab('code');
    this.code.setError({ ...e, severity: 'error' });
    this.errorBar.innerHTML = `${icon('warning', 18)}<div><b>Runtime error${e.line ? ' · line ' + e.line : ''}</b><span></span></div>`;
    this.errorBar.querySelector('span').textContent = e.message;
    this.errorBar.classList.remove('hidden');
  }

  onPause() { if (this.engine) this.engine.paused = true; this.audio.suspend(); this.saveNow(); }
  onResume() { if (this.engine) { this.engine.paused = false; this.engine.lastWall = null; } this.audio.resume(); }
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`;
}
function fmtBytes(b) { if (!b) return '—'; if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB'; if (b >= 1024) return Math.round(b / 1024) + ' KB'; return b + ' B'; }
function safeName(s) { return (s || 'sketch').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'sketch'; }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
