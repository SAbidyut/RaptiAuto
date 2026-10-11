// The Raspberry Pi Lab screen: Circuit (wire parts to the board on the canvas, like the Arduino
// editor) · Pinout · Desktop · Terminal · Thonny for a Raspberry Pi 5 / 4, or Circuit · Pinout ·
// Thonny for a Pico / Pico W / Pico 2 / Pico 2 W. Run powers the circuit and runs the Python file;
// full screen works like the Arduino editor's (menus behind the ☰ handle).
import { h, toast, pushBack, Sheet, popupMenu, confirmDialog } from '../ui/widgets.js';
import { icon } from '../ui/icons.js';
import { Native } from '../native.js';
import { AudioEngine } from '../ui/audio.js';
import { PiSystem } from './system.js';
import { LIBS } from './pylib.js';
import { BOARDS, BOARD_ORDER, boardSVG, headerOf, pinLabel } from './boards.js';
import { PICO_W_LED } from './gpio.js';
import { Console } from './console.js';
import { Terminal } from './terminal.js';
import { Thonny } from './thonny.js';
import { Desktop } from './desktop.js';
import { normPath, basename } from './vfs.js';
import { CIRCUIT_TYPE } from './circuit-parts.js';
import { PiCircuit } from './circuit.js';
import { CircuitHw } from './circuit-hw.js';
import { autowire, defaultCircuit, boardOnly } from './autowire.js';
import { PI_EXAMPLES, PICO_EXAMPLES } from './examples.js';

const TABS_PI = [['circuit', 'circuit', 'Circuit'], ['board', 'chip', 'Pinout'], ['desktop', 'screen', 'Desktop'], ['terminal', 'terminal', 'Terminal'], ['thonny', 'code', 'Thonny']];
const TABS_PICO = [['circuit', 'circuit', 'Circuit'], ['board', 'chip', 'Pinout'], ['thonny', 'code', 'Thonny']];
const CIRCUIT_KEY = (board) => 'rapti.pi.circuit.v1.' + board;

export class PiScreen {
  constructor(app) {
    this.app = app;
    let board = 'pi5';
    try { board = localStorage.getItem('rapti.pi.board') || 'pi5'; } catch (e) { /* ignore */ }
    if (!BOARDS[board]) board = 'pi5';
    this.sys = new PiSystem(board, LIBS);
    this.sys.gpio.parts = []; // the parts live on the circuit canvas now
    this.audio = new AudioEngine();
    try { this.audio.enabled = localStorage.getItem('rapti.pi.mute') !== '1'; } catch (e) { /* ignore */ }
    this.tab = 'circuit';
    this.fullscreen = false;
    this.build();
    this.offSys = this.sys.on((what) => this.onSys(what));
    this.offGpio = this.sys.gpio.on(() => this.refresh());
    this.offOut = this.sys.onOut((t, s) => this.programOutput(t, s));
  }

  get isPico() { return this.sys.isPico; }
  get settings() { return this.app.settings; }

  // ---------------------------------------------------------------- DOM
  build() {
    // "editor": the Arduino editor's full-screen, tool and simulation styles apply here too
    this.root = h('div', { class: 'screen pi-screen editor' });
    const back = h('button', { class: 'icon-btn', 'aria-label': 'Back', html: icon('back'), onclick: () => this.leave() });
    this.boardChip = h('button', { class: 'board-chip', onclick: () => this.boardSheet() });
    this.runDot = h('span', { class: 'pi-run-dot' });
    this.runBtn = h('button', { class: 'run-btn pi-runbtn', onclick: () => this.toggleRun() });
    const menuBtn = h('button', { class: 'icon-btn', 'aria-label': 'Menu', html: icon('dots'), onclick: (e) => this.menu(e.currentTarget) });
    this.top = h('header', { class: 'ed-top pi-top' }, back, h('div', { class: 'ed-titles' }, h('div', { class: 'pi-title' }, 'Raspberry Pi Lab', this.runDot), this.boardChip), this.runBtn, menuBtn);
    this.main = h('main', { class: 'pi-main' });
    this.panes = {
      circuit: h('div', { class: 'pi-pane pane-pcircuit' }),
      board: h('div', { class: 'pi-pane pane-board' }),
      desktop: h('div', { class: 'pi-pane pane-desktop' }),
      terminal: h('div', { class: 'pi-pane pane-terminal' }),
      thonny: h('div', { class: 'pi-pane pane-thonny' }),
    };
    for (const p of Object.values(this.panes)) this.main.appendChild(p);
    this.nav = h('nav', { class: 'ed-nav pi-nav' });
    // full screen: a small dock of buttons and the ☰ handle that brings the menus back
    const fb = (ic, title, fn, extra = {}) => h('button', { class: 'fs-btn', title, 'aria-label': title, html: icon(ic, 20), onclick: fn, ...extra });
    this.fsRun = fb('play', 'Run', () => this.toggleRun(), { class: 'fs-btn fs-run' });
    this.fsOut = fb('terminal', 'Output', () => this.toggleOutput());
    this.fsBar = h('div', { class: 'fs-bar pi-fsbar' },
      fb('fullscreenExit', 'Exit full screen', () => this.setFullscreen(false)), this.fsRun,
      fb('circuit', 'Circuit', () => this.setTab('circuit'), { 'data-tab': 'circuit' }),
      fb('code', 'Thonny', () => this.setTab('thonny'), { 'data-tab': 'thonny' }),
      fb('chip', 'Pinout', () => this.setTab('board'), { 'data-tab': 'board' }),
      this.fsOut);
    this.fsHandle = h('button', { class: 'fs-handle', 'aria-label': 'Show menus', title: 'Show menus', html: icon('menu', 19), onclick: () => this.setChrome(this.root.classList.contains('fs-clean')) });
    this.root.append(this.top, this.main, this.nav, this.fsBar, this.fsHandle);

    // Thonny and the desktop are shared by every tab; the terminal tab has its own shell
    this.thonny = new Thonny({ sys: this.sys, wire: (ex) => this.wireExample(ex) });
    this.desktop = new Desktop({ sys: this.sys, thonny: this.thonny });
    this.panes.desktop.appendChild(this.desktop.el);
    this.buildCircuitPane();
    this.buildBoardPane();
    this.drawNav();
    this.drawBoard();
    this.updateRun();
  }

  drawNav() {
    this.nav.innerHTML = '';
    for (const [id, ic, label] of this.isPico ? TABS_PICO : TABS_PI) {
      this.nav.appendChild(h('button', { class: 'nav-tab' + (id === this.tab ? ' active' : ''), 'data-tab': id, onclick: () => this.setTab(id), html: `${icon(ic, 22)}<span>${label}</span>` }));
    }
    this.fsBar.querySelector('[data-tab="thonny"]').hidden = false;
  }

  setTab(id) {
    const prev = this.tab;
    if (this.isPico && (id === 'desktop' || id === 'terminal')) id = 'circuit';
    this.tab = id;
    for (const [k, p] of Object.entries(this.panes)) p.classList.toggle('active', k === id);
    this.nav.querySelectorAll('.nav-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
    this.fsBar.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
    this.root.dataset.tab = id;
    if (prev === 'desktop' && id !== 'desktop') this.desktop.hidden();
    if (id === 'thonny') {
      this.panes.thonny.appendChild(this.thonny.el);
      this.thonny.shown();
    } else if (prev === 'thonny' || (prev === 'desktop' && !this.desktop.thonnyWin())) this.thonny.hidden();
    if (id === 'desktop') this.desktop.shown();
    if (id === 'terminal') {
      if (!this.term) {
        this.term = new Terminal({ sys: this.sys, openThonny: (p) => { this.setTab('thonny'); if (p) this.thonny.open(p); }, openFile: (p) => { this.setTab('desktop'); this.desktop.openPath(p); }, openUrl: (u) => { this.setTab('desktop'); this.desktop.open('chromium', u || 'http://rapti.net/'); } });
        this.panes.terminal.appendChild(this.term.el);
      }
      setTimeout(() => this.term.con.focus(), 80);
    }
    if (id === 'circuit') this.circuit.shown();
    if (id === 'board') this.refresh(true);
    if (id !== 'circuit' && this.circuit) { if (this.circuit.canvas.wiring) this.circuit.canvas.cancelWiring(); }
  }

  // ---------------------------------------------------------------- circuit pane
  buildCircuitPane() {
    this.circuit = new PiCircuit(this.app, { name: 'Pi circuit', parts: [], wires: [], code: '' }, this);
    this.circuit.load(this.loadCircuit(this.sys.board), { undoable: false });
    this.circuit.mount(this.panes.circuit);
    // the file Run starts, and the program's output
    this.fileChip = h('button', { class: 'pi-filechip', onclick: () => this.fileSheet() });
    this.mini = new Console({ cls: 'pb-mini' });
    this.outTitle = h('b', {}, 'Output');
    this.outBox = h('div', { class: 'pi-out' },
      h('div', { class: 'pi-outhead', onclick: (e) => { if (!e.target.closest('button')) this.toggleOutput(); } },
        h('span', { class: 'pi-outgrip' }), this.outTitle,
        h('button', { class: 'th-clear', onclick: () => this.mini.clear() }, 'Clear'),
        h('button', { class: 'icon-btn sm', 'aria-label': 'Hide output', html: icon('close', 16), onclick: () => this.toggleOutput(false) })),
      this.mini.el);
    this.circuit.root.append(this.fileChip, this.outBox);
    this.drawFileChip();
  }

  loadCircuit(board) {
    try {
      const saved = JSON.parse(localStorage.getItem(CIRCUIT_KEY(board)) || 'null');
      if (saved && Array.isArray(saved.parts) && saved.parts.some((p) => p.type === CIRCUIT_TYPE[board])) return { parts: saved.parts, wires: saved.wires || [] };
    } catch (e) { /* ignore */ }
    return defaultCircuit(board);
  }

  saveCircuit() {
    try { localStorage.setItem(CIRCUIT_KEY(this.sys.board), JSON.stringify({ parts: this.circuit.project.parts, wires: this.circuit.project.wires })); } catch (e) { toast('Storage is full — the circuit could not be saved', 'error'); }
  }

  /** Thonny opened an example: put its parts on the canvas, wired (undo brings the old circuit back). */
  wireExample(ex) {
    if (ex.circuit && this.sys.isPico) return;
    if (!ex.circuit && (!ex.parts || !ex.parts.length)) return;
    this.stopCircuit();
    this.circuit.load(ex.circuit ? ex.circuit(this.sys.board) : autowire(this.sys.board, ex.parts));
    if (!this.isPico) { this.chosenFile = '/home/pi/' + ex.file; this.drawFileChip(); }
    this.saveCircuit();
  }

  /** Every frame while the circuit is powered: inputs → Python, live pins on the board drawing. */
  onCircuitFrame() {
    const g = this.sys.gpio, hw = g.hw;
    if (!hw) return;
    if (g.pins) { for (const p of g.pins.values()) if (p.watch) { g.inputsChanged(); break; } }
    const brt = this.circuit.engine && this.circuit.engine.boardRt;
    if (brt && (this.fr = (this.fr || 0) + 1) % 3 === 0) {
      brt.visual.pinSt = hw.pinStates(g);
      const now = performance.now();
      brt.visual.act = this.sys.running ? Math.sin(now / 37) + Math.sin(now / 13) > 0.4 : (now % 4000) < 90;
      const led = this.sys.info.led;
      brt.visual.L = led != null && g.pins.has(led) ? g.drive(led) || 0 : 0;
    }
  }

  /** Power the circuit (and connect the GPIOs to it). */
  powerOn() {
    if (this.circuit.engine) return true;
    const engine = this.circuit.startEngine();
    if (!engine) { this.noAutoUntil = performance.now() + 5000; return false; }
    this.sys.gpio.attachHw(new CircuitHw(engine));
    this.updateRun();
    return true;
  }

  stopCircuit() {
    if (!this.circuit.engine) return;
    this.sys.gpio.attachHw(null);
    this.circuit.stopEngine();
    this.updateRun();
  }

  programRunning() { return !!(this.thonny.running || this.sys.running); }

  // ---------------------------------------------------------------- run / stop
  async toggleRun() {
    if (this.circuit.engine || this.programRunning()) { await this.stopAll(); return; }
    await this.runProgram();
  }

  async runProgram() {
    const f = this.runFile();
    if (!f) { toast('No Python file yet: write one in Thonny', 'warn'); return; }
    this.audio.resume();
    if (!this.powerOn()) return;
    this.mini.clear();
    this.outTitle.textContent = `Output · ${this.isPico ? f.replace(/^\//, '') : basename(f)}`;
    this.thonny.open(f);
    this.thonny.run();
    this.updateRun();
  }

  async stopAll() {
    this.noAutoUntil = performance.now() + 900;
    if (this.programRunning()) await this.thonny.stop();
    this.stopCircuit();
    this.updateRun();
  }

  async restart() { await this.stopAll(); await this.runProgram(); }

  updateRun() {
    const on = !!(this.circuit && this.circuit.engine) || this.programRunning();
    this.runDot.classList.toggle('on', this.programRunning());
    this.runBtn.classList.toggle('running', on);
    this.runBtn.innerHTML = on ? `${icon('stop', 18)}<span>Stop</span>` : `${icon('play', 20)}<span>Run</span>`;
    this.fsRun.innerHTML = icon(on ? 'stop' : 'play', 20);
    this.fsRun.classList.toggle('running', on);
  }

  /** The .py file Run starts: the one chosen with the file chip, else Thonny's, else blink / main. */
  runFile() {
    const files = this.pyFiles();
    let f = this.chosenFile && files.includes(this.chosenFile) ? this.chosenFile : null;
    if (!f && this.thonny.cur && files.includes(this.thonny.cur.path)) f = this.thonny.cur.path;
    if (!f) f = files.includes(this.isPico ? '/main.py' : '/home/pi/blink.py') ? (this.isPico ? '/main.py' : '/home/pi/blink.py') : files[0];
    return f || null;
  }

  pyFiles() {
    const fs = this.sys.fs, files = [];
    const walk = (d, depth) => { for (const n of fs.list(d)) { const p = normPath(n, d); if (n.startsWith('.')) continue; if (fs.isDir(p)) { if (depth < 2) walk(p, depth + 1); } else if (n.endsWith('.py')) files.push(p); } };
    try { walk(this.sys.home, 0); } catch (e) { /* ignore */ }
    return files;
  }

  drawFileChip() {
    const f = this.runFile();
    this.fileChip.innerHTML = `${icon('code', 15)}<span>${f ? (this.isPico ? f.replace(/^\//, '') : f.replace('/home/pi/', '')) : 'no .py file'}</span>${icon('forward', 12)}`;
  }

  fileSheet() {
    const box = h('div', { class: 'pin-pick' });
    const cur = this.runFile();
    for (const f of this.pyFiles()) {
      box.appendChild(h('button', { class: 'pin-opt' + (f === cur ? ' active' : ''), onclick: () => { sheet.close(); this.chosenFile = f; this.drawFileChip(); } },
        h('b', {}, this.isPico ? f.replace(/^\//, '') : f.replace('/home/pi/', '')), h('span', {}, 'Run this file')));
    }
    box.appendChild(h('button', { class: 'btn btn-ghost', html: `${icon('code', 16)}<span>Open in Thonny</span>`, onclick: () => { sheet.close(); const f = this.runFile(); this.setTab('thonny'); if (f) this.thonny.open(f); } }));
    const sheet = new Sheet({ title: 'Program to run', icon: 'code', content: box, height: '70vh' }).open();
  }

  programOutput(t, s) {
    this.mini.write(t, s === 'err' ? 'err' : '');
    if (!this.outShown && this.outAuto !== false) this.toggleOutput(true, true);
  }

  toggleOutput(on = !this.outShown, auto = false) {
    this.outShown = on;
    if (!auto) this.outAuto = on;
    this.circuit.root.classList.toggle('out-open', on);
    this.fsOut.classList.toggle('active', on);
    if (on && this.tab !== 'circuit' && !auto) this.setTab('circuit');
  }

  // ---------------------------------------------------------------- full screen (like the Arduino editor)
  setFullscreen(on) {
    this.fullscreen = on;
    this.circuit.fullscreen = on;
    this.root.classList.toggle('fs', on);
    this.setChrome(!on, false);
    if (on && !this.settings.piFsHinted) { this.settings.piFsHinted = true; this.app.saveSettings(); toast('Full screen — tap ☰ for the menus'); }
    Native.setImmersive(on);
    Native.vibrate(8);
    setTimeout(() => this.circuit.canvas.applyView(), 60);
    setTimeout(() => { this.circuit.canvas.applyView(); if (this.thonny.editor) this.thonny.editor.refresh(); }, 400);
  }

  setChrome(on, buzz = true) {
    this.root.classList.toggle('fs-clean', !on);
    this.fsHandle.innerHTML = icon(on ? 'close' : 'menu', 19);
    this.fsHandle.setAttribute('aria-label', on ? 'Hide menus' : 'Show menus');
    if (buzz) Native.vibrate(6);
    setTimeout(() => this.circuit.canvas.applyView(), 30);
  }

  // ---------------------------------------------------------------- pinout pane
  buildBoardPane() {
    const p = this.panes.board;
    this.svgWrap = h('div', { class: 'pb-svg' });
    this.zoom = 1;
    const zbtn = (ic, d) => h('button', { class: 'pb-zoom', html: icon(ic, 18), onclick: () => { this.zoom = Math.max(1, Math.min(2.6, this.zoom + d)); this.svgWrap.style.setProperty('--z', this.zoom); } });
    this.zooms = h('div', { class: 'pb-zooms' }, zbtn('minus', -0.4), zbtn('plus', 0.4));
    this.strip = h('div', { class: 'pb-strip' });
    this.boardBox = h('div', { class: 'pb-board' }, this.svgWrap, this.strip);
    this.legend = h('div', { class: 'pb-legend' });
    this.legendRow = h('div', { class: 'pb-legrow' }, this.legend, this.zooms);
    this.pinoutNote = h('div', { class: 'pb-note' },
      h('span', { html: icon('circuit', 18) }),
      h('div', {}, h('b', {}, 'Wire parts in the Circuit tab'), h('small', {}, 'Add LEDs, buttons, sensors, motors … with ＋, tap a pin then another pin to draw a wire, then Run. Tap a pin here for its functions.')),
      h('button', { class: 'btn btn-primary sm', onclick: () => this.setTab('circuit') }, 'Circuit'));
    this.specs = h('div', { class: 'pb-specs' });
    p.append(h('div', { class: 'pb-inner' }, this.boardBox, this.legendRow, this.pinoutNote, this.specs));
    const tapPin = (e) => { const g = e.target.closest('[data-phys]'); if (g) this.pinSheet(Number(g.dataset.phys)); };
    this.svgWrap.addEventListener('click', tapPin);
    this.strip.addEventListener('click', tapPin);
  }

  drawBoard() {
    const b = this.sys.info;
    this.boardChip.innerHTML = `${icon('chip', 14)}<span>${b.name}</span>${icon('forward', 12)}`;
    this.svgWrap.innerHTML = boardSVG(this.sys.board, 'po-');
    this.svg = this.svgWrap.querySelector('svg');
    this.pinEls = new Map();
    this.svg.querySelectorAll('.hp[data-gpio]').forEach((el) => this.pinEls.set(Number(el.dataset.gpio), el));
    // the Pi header has no room for labels on the artwork: a strip below it names every pin
    this.strip.innerHTML = '';
    this.stripEls = new Map();
    this.strip.hidden = this.isPico;
    if (!this.isPico) {
      const hdr = headerOf(this.sys.board);
      const row = (odd) => h('div', { class: 'ps-row' }, ...hdr.filter((p) => (p.phys % 2 === 1) === odd).map((p) => {
        const el = h('button', { class: 'ps-pin t-' + p.type, 'data-phys': p.phys }, h('i'), h('b', {}, p.gpio != null ? String(p.gpio) : p.name.replace('GND', '⏚')), h('small', {}, String(p.phys)));
        if (p.gpio != null) this.stripEls.set(p.gpio, el);
        return el;
      }));
      this.strip.append(row(false), row(true));
    }
    this.actLed = this.svg.querySelector('.led-act');
    this.userLed = this.svg.querySelector('.led-user');
    const bs = this.svg.querySelector('.bootsel');
    if (bs) {
      const down = (e) => { e.preventDefault(); this.sys.gpio.bootsel = 1; bs.classList.add('down'); Native.vibrate(8); };
      const up = () => { this.sys.gpio.bootsel = 0; bs.classList.remove('down'); };
      bs.addEventListener('pointerdown', down); bs.addEventListener('pointerup', up); bs.addEventListener('pointerleave', up); bs.addEventListener('pointercancel', up);
    }
    const pwr = this.svg.querySelector('.pwr-btn');
    if (pwr) pwr.addEventListener('click', () => { this.setTab('desktop'); this.desktop.shutdownDialog(); });
    this.legend.innerHTML = '';
    const lg = (cls, label) => h('span', { class: 'lg ' + cls }, h('i'), label);
    this.legend.append(lg('l-3v3', '3V3'), lg('l-5v', '5V'), lg('l-gnd', 'GND'), lg('l-gpio', 'GPIO'), lg('l-hi', 'HIGH'), lg('l-pwm', 'PWM'), lg('l-in', 'Input'));
    this.drawSpecs();
    this.drawFileChip();
    this.refresh(true);
  }

  drawSpecs() {
    const b = this.sys.info;
    const row = (k, v) => (v ? h('div', { class: 'spec' }, h('span', {}, k), h('b', {}, v)) : null);
    this.specs.innerHTML = '';
    this.specs.append(...[h('div', { class: 'pb-sec' }, h('b', {}, b.name), h('span', { class: 'muted' }, ` · ${b.year}`)),
      row(b.kind === 'pico' ? 'MCU' : 'SoC', b.mcu || b.soc), row('CPU', b.cpu), row('Memory', b.ram), row('Flash', b.flash), row('GPU', b.gpu), row('I/O', b.io),
      row('Runs', b.kind === 'pico' ? 'MicroPython 1.29 (machine, rp2' + (b.wifi ? ', network' : '') + ', neopixel, dht, i2c_lcd)' : 'Python 3 programs (gpiozero, RPi.GPIO, neopixel, adafruit_dht, i2c_lcd) on a MicroPython 1.29 engine')].filter(Boolean));
  }

  /** Pin colours on the Pinout drawing (called on every GPIO change, throttled to frames). */
  refresh(force) {
    if (this.tab !== 'board' && !force) return;
    const gpio = this.sys.gpio, hw = gpio.hw;
    for (const [g, el] of this.pinEls || []) {
      const p = gpio.pins.get(g);
      if (!p) continue;
      const lvl = p.mode !== 'in' ? gpio.level(g) : hw && hw.has(g) ? hw.quietLevel(g) : gpio.read(g);
      const st = p.mode === 'pwm' ? 'pwm' : p.mode === 'out' ? (p.out ? 'ohi' : 'olo') : (p.used || p.watch) ? (lvl ? 'ihi' : 'ilo') : (lvl ? 'fhi' : 'flo');
      if (el.dataset.st !== st) el.dataset.st = st;
      const se = this.stripEls && this.stripEls.get(g);
      if (se && se.dataset.st !== st) se.dataset.st = st;
      if (st === 'pwm') el.querySelector('.pst').style.opacity = String(0.25 + p.duty * 0.75);
      else el.querySelector('.pst').style.opacity = '';
    }
    if (this.userLed) {
      const ledPin = this.sys.info.led;
      const d = gpio.pins.has(ledPin) ? gpio.drive(ledPin) || 0 : 0;
      this.userLed.style.setProperty('--on', String(d));
      this.userLed.classList.toggle('on', d > 0.02);
    }
  }

  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    const now = performance.now();
    if (this.actLed && this.tab === 'board') {
      const busy = this.sys.running;
      const on = busy ? Math.sin(now / 37) + Math.sin(now / 13) > 0.4 : (now % 4000) < 90;
      if (on !== this.actOn) { this.actOn = on; this.actLed.classList.toggle('on', on); }
    }
    // a program started from Thonny, the Terminal or the desktop powers the circuit too
    if (!this.circuit.engine && this.sys.running && !(this.noAutoUntil > now)) this.powerOn();
    const running = this.programRunning();
    if (running !== this.lastRunning) { this.lastRunning = running; this.updateRun(); }
  }

  // ---------------------------------------------------------------- sheets
  boardSheet() {
    const box = h('div', { class: 'pi-boards' });
    for (const id of BOARD_ORDER) {
      const b = BOARDS[id];
      box.appendChild(h('button', { class: 'pi-bopt' + (id === this.sys.board ? ' active' : ''), onclick: () => { sheet.close(); if (id !== this.sys.board) this.switchBoard(id); } },
        h('div', { class: 'pi-bthumb', html: boardSVG(id, `th-${id}-`) }),
        h('div', {}, h('b', {}, b.name), h('small', {}, `${b.cpu} · ${b.ram}`), h('small', { class: 'muted' }, b.kind === 'pico' ? 'MicroPython · Thonny' : 'Desktop · Terminal · Thonny · Python 3'))));
    }
    const sheet = new Sheet({ title: 'Choose a board', icon: 'chip', content: box, height: '80vh' }).open();
  }

  /** Opened from the Pi Lab page: another board, a new project or an example. */
  start(opts = {}) {
    if (opts.board && BOARDS[opts.board] && opts.board !== this.sys.board) this.switchBoard(opts.board, true);
    if (opts.example) {
      const ex = (this.isPico ? PICO_EXAMPLES : PI_EXAMPLES).find((e) => e.file === opts.example);
      if (!ex) return;
      this.thonny.openExample(ex);
      if (this.isPico) this.chosenFile = null;
      this.drawFileChip();
      this.setTab(ex.circuit || (ex.parts && ex.parts.length) ? 'circuit' : 'thonny');
    } else if (opts.newProject) this.newProject();
  }

  /** A new project: the board alone on the canvas and a fresh program file to write. */
  newProject() {
    this.stopCircuit();
    this.saveCircuit();
    this.circuit.load(boardOnly(this.sys.board));
    this.saveCircuit();
    const fs = this.sys.fs, dir = this.isPico ? '' : '/home/pi';
    let n = 1;
    while (fs.isFile(`${dir}/project${n}.py`)) n++;
    const path = `${dir}/project${n}.py`;
    fs.write(path, this.isPico ? NEW_PICO : NEW_PI);
    this.chosenFile = path;
    this.drawFileChip();
    this.thonny.open(path);
    this.setTab('circuit');
    toast(`New project: add parts with ＋, then write project${n}.py in Thonny`, 'ok');
  }

  switchBoard(id, quiet = false) {
    this.stopCircuit();
    this.saveCircuit();
    this.sys.setBoard(id);
    if (!quiet) toast(`${BOARDS[id].name} ready`, 'ok');
  }

  pinSheet(phys) {
    const hdr = headerOf(this.sys.board).find((p) => p.phys === phys);
    if (!hdr) return;
    const gpio = this.sys.gpio;
    const rows = [['Physical pin', String(phys)], ['Type', { power3: '3.3 V power', power5: '5 V power', gnd: 'Ground', gpio: 'GPIO', i2c: 'GPIO (I²C)', spi: 'GPIO (SPI)', uart: 'GPIO (UART)', id: 'GPIO (HAT ID EEPROM)', adc: 'GPIO + ADC', sys: 'System pin' }[hdr.type]]];
    if (hdr.gpio != null) {
      const p = gpio.pins.get(hdr.gpio);
      rows.push([this.isPico ? 'GP number' : 'BCM number', String(hdr.gpio)]);
      if (hdr.alt) rows.push(['Alt functions', hdr.alt]);
      rows.push(['Mode', p.mode === 'pwm' ? `PWM ${p.freq} Hz, ${Math.round(p.duty * 100)}%` : p.mode === 'out' ? 'Output' : 'Input']);
      rows.push(['Level', (p.mode !== 'in' ? gpio.level(hdr.gpio) : gpio.hw && gpio.hw.has(hdr.gpio) ? gpio.hw.quietLevel(hdr.gpio) : gpio.read(hdr.gpio)) ? 'HIGH (3.3 V)' : 'LOW (0 V)']);
      if (p.mode === 'in') rows.push(['Pull', p.pull === 'up' ? 'Pull-up' : p.pull === 'down' ? 'Pull-down' : 'None (floating)']);
      const pid = (this.isPico ? 'GP' : 'GPIO') + hdr.gpio;
      const bp = this.circuit.boardPart();
      const wired = bp ? this.circuit.project.wires.filter((w) => (w.from.part === bp.id && w.from.pin === pid) || (w.to.part === bp.id && w.to.pin === pid)).length : 0;
      rows.push(['Wires on the canvas', String(wired)]);
      rows.push(['Python', this.isPico ? `Pin(${hdr.gpio})` : `LED(${hdr.gpio}) · Button(${hdr.gpio}) · GPIO.setup(${hdr.gpio}, …)`]);
    } else if (hdr.type === 'power3') rows.push(['Note', 'Max ~50 mA from the 3V3 pins.']);
    else if (hdr.type === 'power5') rows.push(['Note', 'Straight from the power supply. Never connect 5 V to a GPIO pin!']);
    const box = h('div', { class: 'pin-info' }, ...rows.map(([k, v]) => h('div', { class: 'spec' }, h('span', {}, k), h('b', {}, v))));
    box.appendChild(h('button', { class: 'btn btn-ghost', html: `${icon('circuit', 16)}<span>Wire it in the Circuit tab</span>`, onclick: () => { sheet.close(); this.setTab('circuit'); } }));
    const sheet = new Sheet({ title: hdr.gpio != null ? `${pinLabel(this.sys.board, hdr.gpio)} · pin ${phys}` : `${hdr.name} · pin ${phys}`, icon: 'pin', content: box }).open();
  }

  menu(anchor) {
    popupMenu(anchor, [
      { icon: 'chip', label: 'Change board', action: () => this.boardSheet() },
      { icon: 'fullscreen', label: this.fullscreen ? 'Exit full screen' : 'Full screen', action: () => this.setFullscreen(!this.fullscreen) },
      { icon: 'terminal', label: this.outShown ? 'Hide program output' : 'Show program output', action: () => this.toggleOutput() },
      { icon: this.audio.enabled ? 'bell' : 'close', label: this.audio.enabled ? 'Mute buzzer sound' : 'Turn buzzer sound on', action: () => { this.audio.enabled = !this.audio.enabled; if (!this.audio.enabled) this.audio.stopAll(); try { localStorage.setItem('rapti.pi.mute', this.audio.enabled ? '0' : '1'); } catch (e) { /* ignore */ } } },
      '-',
      { icon: 'restart', label: 'Default circuit', action: async () => { if (await confirmDialog('Default circuit', 'Replace the circuit with the default parts? (Undo brings it back.)', 'Replace')) { this.stopCircuit(); this.circuit.load(defaultCircuit(this.sys.board)); this.saveCircuit(); this.setTab('circuit'); } } },
      { icon: 'trash', label: 'Clear the circuit (keep the board)', danger: true, action: async () => { if (await confirmDialog('Clear the circuit', 'Remove every part and wire except the board? (Undo brings them back.)', 'Clear', true)) { this.stopCircuit(); this.circuit.load(boardOnly(this.sys.board)); this.saveCircuit(); this.setTab('circuit'); } } },
      { icon: 'trash', label: this.isPico ? 'Erase the Pico flash' : 'Reset the SD card (files)', danger: true, action: () => this.resetFiles() },
      '-',
      { icon: 'info', label: 'About the simulator', action: () => this.about() },
    ]);
  }

  async resetFiles() {
    if (!(await confirmDialog(this.isPico ? 'Erase the flash' : 'Reset the SD card', 'All your files on this board go back to the examples. Continue?', 'Reset', true))) return;
    this.sys.resetFs();
    this.thonny.onSys('board');
    toast(this.isPico ? 'Flash erased' : 'SD card reset', 'ok');
  }

  about() {
    const body = h('div', { class: 'dialog-body pi-about' },
      h('p', {}, 'Python runs on a real MicroPython 1.29 interpreter compiled to WebAssembly, inside the app (it needs no real internet: the simulated Wi-Fi network is built in).'),
      h('p', {}, 'The Circuit tab uses the same parts and circuit solver as the Arduino simulator: wire LEDs with resistors, buttons, sensors, motors, displays … to the header, and the GPIOs drive and read the real circuit (3.3 V logic, ~16 mA per pin, pull-ups, 5 V warnings).'),
      h('p', {}, 'Raspberry Pi 5 / 4: Python 3 style programs with gpiozero, RPi.GPIO, neopixel, adafruit_dht, RPLCD / i2c_lcd, adafruit_ssd1306 (OLED), tm1637, max7219 + spidev, requests, flask, http.server, socket, paho-mqtt and psutil. Pico boards: MicroPython machine (I2C, SPI), rp2, neopixel, dht, ssd1306, tm1637, max7219, i2c_lcd and — on the Pico W — network, urequests, umqtt and ntptime.'),
      h('p', { class: 'muted' }, 'Not simulated: a real Linux kernel, real apt / pip installs, the real internet (a simulated one is built in: Chromium, requests, MQTT, Flask), the camera, PIO programs, CPython-only libraries such as numpy or OpenCV.'));
    new Sheet({ title: 'About the Raspberry Pi Lab', icon: 'info', content: body }).open();
  }

  onSys(what) {
    if (what === 'board') {
      if (this.isPico && (this.tab === 'desktop' || this.tab === 'terminal')) this.setTab('circuit');
      this.sys.gpio.parts = [];
      this.drawNav();
      this.drawBoard();
      this.circuit.load(this.loadCircuit(this.sys.board), { undoable: false });
      this.mini.clear();
      this.chosenFile = null;
      this.drawFileChip();
      this.panes.board.scrollTop = 0;
    } else if (what === 'files') this.drawFileChip();
    else if (what === 'input') { if (this.tab === 'circuit' || this.tab === 'board' || (this.tab === 'desktop' && !this.desktop.thonnyWin())) this.setTab('thonny'); }
    else if (what === 'run' || what === 'proc') { this.updateRun(); this.drawFileChip(); }
  }

  // ---------------------------------------------------------------- lifecycle
  mount(parent) {
    parent.appendChild(this.root);
    this.unback = pushBack(() => this.onBack());
    this.setTab(this.tab);
    this.loop();
    this.audioResume = () => { this.audio.resume(); this.circuit.audio.resume(); };
    this.root.addEventListener('pointerdown', this.audioResume);
    if (this.circuit.project.parts.length <= 1) this.circuit.showHint('Tap ＋ to add parts, tap a pin and then another pin to draw a wire, then Run.');
  }

  onBack() {
    const rearm = () => { this.unback = pushBack(() => this.onBack()); };
    if (this.fullscreen) { this.setFullscreen(false); rearm(); return; }
    if (this.tab === 'circuit' && this.circuit.canvas.wiring) { this.circuit.canvas.cancelWiring(); rearm(); return; }
    if (this.tab === 'circuit' && this.circuit.canvas.selection) { this.circuit.canvas.select(null); rearm(); return; }
    if (this.tab === 'desktop' && this.desktop.top && this.desktop.wins.length) { this.desktop.close(this.desktop.top); rearm(); return; }
    if (this.tab !== 'circuit') { this.setTab('circuit'); rearm(); return; }
    this.unback = null;
    this.leave();
  }

  leave() {
    if (this.fullscreen) this.setFullscreen(false);
    this.saveCircuit();
    this.app.showHome();
  }

  unmount() {
    cancelAnimationFrame(this.raf);
    if (this.unback) this.unback();
    this.unback = null;
    this.thonny.hidden();
    this.sys.gpio.attachHw(null);
    this.circuit.unmount();
    this.sys.killProcess();
    this.audio.stopAll();
    this.audio.close && this.audio.close();
    this.offSys(); this.offGpio(); this.offOut();
    if (this.fullscreen) Native.setImmersive(false);
    this.root.remove();
  }

  saveNow() { if (this.thonny.cur) { this.thonny.cur.text = this.thonny.editor.value; this.thonny.saveTabs(); } this.saveCircuit(); }
  onPause() { this.saveNow(); this.audio.suspend(); this.circuit.audio.suspend(); if (this.circuit.engine) this.circuit.engine.paused = true; }
  onResume() { if (this.circuit.engine) { this.circuit.engine.paused = false; this.circuit.engine.lastWall = null; } }
}

export { PICO_W_LED };

const NEW_PI = `# My Raspberry Pi project
# 1. Circuit tab: add parts with +, then wire them to the header pins
# 2. Write the program here and press Run
from gpiozero import LED
from time import sleep

led = LED(17)          # GPIO17 = pin 11

while True:
    led.toggle()
    sleep(0.5)
`;

const NEW_PICO = `# My Raspberry Pi Pico project (MicroPython)
# 1. Circuit tab: add parts with +, then wire them to the GP pins
# 2. Write the program here and press Run
from machine import Pin
import time

led = Pin(15, Pin.OUT)

while True:
    led.toggle()
    time.sleep(0.5)
`;
