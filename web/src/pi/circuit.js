// Circuit tab of the Raspberry Pi Lab: the Arduino editor's circuit canvas (parts library, wiring,
// window / crossing selection, undo, part properties, live part controls) with a Raspberry Pi 5 / 4
// or Pico board as the fixed board part. The program is Python (run from Thonny or the run bar);
// while it runs the circuit is solved live and the GPIOs drive / read it (see circuit-hw.js).
import { Editor } from '../ui/editor.js';
import { CircuitCanvas } from '../ui/canvas.js';
import { openLibrary } from '../ui/library.js';
import { h, toast, dialog } from '../ui/widgets.js';
import { icon } from '../ui/icons.js';
import { getDef, newId, worldBox, defaultProps } from '../components/registry.js';
import { SimEngine } from '../sim/engine.js';
import { Native } from '../native.js';

let pendingHost = null;

export class PiCircuit extends Editor {
  /** pi: the PiScreen (saving, full screen, running Python). */
  constructor(app, project, pi) {
    pendingHost = pi;
    super(app, project);
    pendingHost = null;
  }

  build() {
    this.pi = pendingHost;
    this.root = h('section', { class: 'pane pane-circuit pi-circuit' });
    this.circuitPane = this.root;
    this.canvasHost = h('div', { class: 'canvas-host' });
    this.root.appendChild(this.canvasHost);
    this.canvas = new CircuitCanvas(this.canvasHost, this);
    this.buildCircuitOverlay();
    this.status = h('div', { class: 'sim-status pi-sim-status hidden' });
    this.stale = h('div', { class: 'stale-banner hidden', html: `${icon('restart', 16)}<span>Circuit changed — Stop and Run again to apply</span>`, onclick: () => this.pi.restart() });
    this.root.append(this.status, this.stale);
  }

  boardPart() { return this.project.parts.find((p) => getDef(p.type) && getDef(p.type).board); }

  mount(parent) {
    parent.appendChild(this.root);
    this.canvas.render();
    requestAnimationFrame(() => this.canvas.fit(false));
  }

  shown() {
    requestAnimationFrame(() => { this.canvas.applyView(); this.canvas.render(); });
  }

  unmount() {
    this.stopEngine();
    this.canvas.destroy();
    this.audio.close();
    this.root.remove();
  }

  // the Pi screen owns the layout, the tabs and full screen
  updateLayout() {}
  setTab() {}
  setFullscreen(on) { this.pi.setFullscreen(on); }
  setChrome(on) { this.pi.setChrome(on); }
  leave() { this.pi.leave(); }
  saveNow() { this.pi.saveCircuit(); }
  showBoardInfo() { this.pi.boardSheet(); }

  /** Swap in a whole new circuit (another board, an example); undo brings the old one back. */
  load(project, { undoable = true } = {}) {
    if (undoable) { this.history.push(this.snapshot); this.future = []; } else { this.history = []; this.future = []; }
    this.project.parts = project.parts;
    this.project.wires = project.wires;
    this.snapshot = this.serialize();
    this.canvas.selection = null;
    this.canvas.render();
    this.selectionChanged(null);
    requestAnimationFrame(() => this.canvas.fit(false));
  }

  addComponent() {
    if (this.engine) { toast('Stop the program to change the circuit', 'warn'); return; }
    openLibrary({ onPick: (def) => this.placePartNow(def), noBoards: true, title: 'Add a part to the Pi' });
  }

  /** New parts go into free space above the board (the screen centre is usually the board). */
  placePartNow(def) {
    const b = this.boardPart();
    if (!b || def.layer === -1) { super.placePartNow(def); return; }
    const box = typeof def.box === 'function' ? def.box(defaultProps(def)) : def.box;
    const w = box[2] - box[0], hh = box[3] - box[1];
    const [bx0, by0, bx1] = worldBox(b);
    const taken = this.project.parts.map((p) => worldBox(p));
    const free = (x0, y0) => !taken.some(([a0, b0, a1, b1]) => x0 < a1 + 12 && x0 + w > a0 - 12 && y0 < b1 + 12 && y0 + hh > b0 - 12);
    let at = null;
    for (let row = 0; row < 8 && !at; row++) {
      const y0 = by0 - 50 - hh - row * (hh + 40);
      for (let x0 = bx0; x0 <= Math.max(bx1, bx0 + 200) && !at; x0 += 20) if (free(x0, y0)) at = [x0, y0];
    }
    if (!at) { super.placePartNow(def); return; }
    const part = { id: newId('p'), type: def.type, x: Math.round((at[0] - box[0]) / 10) * 10, y: Math.round((at[1] - box[1]) / 10) * 10, rot: 0, props: {} };
    this.project.parts.push(part);
    this.commit('Add ' + def.name);
    this.canvas.select({ kind: 'part', id: part.id });
    const r = this.canvasHost.getBoundingClientRect();
    const [x0, y0, x1, y1] = worldBox(part);
    const [sx0, sy0] = this.canvas.worldToScreen(x0, y0), [sx1, sy1] = this.canvas.worldToScreen(x1, y1);
    if (sx0 < r.left || sy0 < r.top || sx1 > r.right || sy1 > r.bottom) this.canvas.fit();
    this.showHint('Drag to move. Tap one of its pins, then a pin of the Pi header, to draw a wire.');
    Native.vibrate(10);
  }

  /** The board part can't be deleted or copied — change it with the board chip. */
  deleteSelected() {
    const sel = this.canvas.selection;
    const b = this.boardPart();
    if (sel && b && sel.kind === 'part' && sel.id === b.id) { toast('The board stays — change it with the board chip at the top', 'info'); return; }
    if (sel && b && sel.kind === 'multi' && sel.parts.includes(b.id)) sel.parts = sel.parts.filter((id) => id !== b.id);
    super.deleteSelected();
  }

  // ------------------------------------------------------------------ simulation (power on)
  /** Start solving the circuit (the Pi is powered); Python drives it through the returned engine. */
  startEngine() {
    if (this.engine) return this.engine;
    if (this.canvas.wiring) this.canvas.cancelWiring();
    this.canvas.select(null);
    this.warnings = [];
    this.audio.resume();
    const engine = new SimEngine(this.project, {
      external: true,
      onWarning: (msg) => this.addWarning(msg),
      onError: (err) => this.runtimeError(err),
      onSound: (id, freq, vol) => this.audio.set(id, freq, this.settings.sound === false ? 0 : vol),
      onBurn: () => { Native.vibrate(40); if (this.settings.sound !== false) this.audio.pop(); },
    });
    const res = engine.start();
    if (!res.ok) { toast((res.error && res.error.message) || 'The circuit could not start', 'error'); return null; }
    this.engine = engine;
    this.pi.root.classList.add('simulating');
    this.canvas.setMode('sim');
    this.selectionChanged(null);
    this.status.classList.remove('hidden');
    Native.keepScreenOn(true);
    this.lastFrame = performance.now();
    const loop = (t) => {
      if (!this.engine) return;
      const dt = Math.min(0.1, (t - this.lastFrame) / 1000);
      this.lastFrame = t;
      // the frame time can be older than the clock Python already moved on to: never step back
      this.engine.tick(this.engine.lastWall != null ? Math.max(t, this.engine.lastWall) : t);
      if (!this.engine) return;
      if (this.pi.onCircuitFrame) this.pi.onCircuitFrame(dt);
      if (this.pi.tab === 'circuit') { this.canvas.frame(dt); this.updateStatus(); }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    return engine;
  }

  stopEngine() {
    if (!this.engine) return;
    cancelAnimationFrame(this.raf);
    this.engine.stop();
    this.engine = null;
    this.audio.stopAll();
    if (this.simSheet) { this.simSheet.close(); this.simSheet = null; }
    this.pi.root.classList.remove('simulating');
    this.canvas.setMode('edit');
    this.status.classList.add('hidden');
    this.stale.classList.add('hidden');
    Native.keepScreenOn(false);
  }

  run() { this.pi.runProgram(); }
  stop() { this.pi.stopAll(); }
  toggleRun() { this.pi.toggleRun(); }
  restart() { this.pi.restart(); }

  updateStatus() {
    const e = this.engine;
    if (!e) return;
    const running = this.pi.programRunning();
    const txt = `<span class="dot live"></span><b>${running ? 'Python running' : 'Powered'}</b><span class="speed">${this.pi.sys.info.short}</span>` +
      (this.warnings.length ? `<button class="warn-pill" id="warnpill">${icon('warning', 14)}<span>${this.warnings.length}</span></button>` : '');
    if (txt !== this._st) {
      this._st = txt;
      this.status.innerHTML = txt;
      const wp = this.status.querySelector('#warnpill');
      if (wp) wp.onclick = () => this.showWarnings();
    }
  }

  runtimeError(err) {
    const e = err || { message: 'Unknown error' };
    this.pi.stopAll();
    dialog({ title: e.electrical ? '⚡ Power cut' : 'Circuit error', body: `<p>${String(e.message).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</p>`, actions: [{ label: 'OK', value: true, cls: 'btn-primary' }] });
  }
}
