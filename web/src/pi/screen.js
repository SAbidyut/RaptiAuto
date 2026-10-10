// The Raspberry Pi Lab screen: Board (live header, parts, run bar) · Desktop · Terminal · Thonny
// for a Raspberry Pi 5 / 4, or Board · Thonny for a Pico / Pico W / Pico 2 / Pico 2 W.
import { h, toast, pushBack, Sheet, popupMenu, confirmDialog } from '../ui/widgets.js';
import { icon } from '../ui/icons.js';
import { Native } from '../native.js';
import { AudioEngine } from '../ui/audio.js';
import { PiSystem } from './system.js';
import { LIBS } from './pylib.js';
import { BOARDS, BOARD_ORDER, boardSVG, headerOf, pinLabel, physOf, wirablePins } from './boards.js';
import { PART_TYPES, PART_ORDER, newPart, partPins, partCard } from './parts.js';
import { PICO_W_LED } from './gpio.js';
import { Console } from './console.js';
import { Terminal } from './terminal.js';
import { Thonny } from './thonny.js';
import { Desktop } from './desktop.js';
import { normPath } from './vfs.js';

const TABS_PI = [['board', 'chip', 'Board'], ['desktop', 'screen', 'Desktop'], ['terminal', 'terminal', 'Terminal'], ['thonny', 'code', 'Thonny']];
const TABS_PICO = [['board', 'chip', 'Board'], ['thonny', 'code', 'Thonny']];
const ANIMATED = new Set(['motor', 'pir', 'ultrasonic', 'servo', 'buzzer']);

export class PiScreen {
  constructor(app) {
    this.app = app;
    let board = 'pi5';
    try { board = localStorage.getItem('rapti.pi.board') || 'pi5'; } catch (e) { /* ignore */ }
    if (!BOARDS[board]) board = 'pi5';
    this.sys = new PiSystem(board, LIBS);
    this.audio = new AudioEngine();
    try { this.audio.enabled = localStorage.getItem('rapti.pi.mute') !== '1'; } catch (e) { /* ignore */ }
    this.tab = 'board';
    this.cards = [];
    this.build();
    this.offSys = this.sys.on((what) => this.onSys(what));
    this.offGpio = this.sys.gpio.on(() => this.refresh());
    this.offOut = this.sys.onOut((t, s) => this.mini.write(t, s === 'err' ? 'err' : ''));
  }

  get isPico() { return this.sys.isPico; }

  // ---------------------------------------------------------------- DOM
  build() {
    this.root = h('div', { class: 'screen pi-screen' });
    const back = h('button', { class: 'icon-btn', 'aria-label': 'Back', html: icon('back'), onclick: () => this.leave() });
    this.boardChip = h('button', { class: 'board-chip', onclick: () => this.boardSheet() });
    this.runDot = h('span', { class: 'pi-run-dot' });
    const menuBtn = h('button', { class: 'icon-btn', 'aria-label': 'Menu', html: icon('dots'), onclick: (e) => this.menu(e.currentTarget) });
    this.top = h('header', { class: 'ed-top pi-top' }, back, h('div', { class: 'ed-titles' }, h('div', { class: 'pi-title' }, 'Raspberry Pi Lab', this.runDot), this.boardChip), menuBtn);
    this.main = h('main', { class: 'pi-main' });
    this.panes = {
      board: h('div', { class: 'pi-pane pane-board' }),
      desktop: h('div', { class: 'pi-pane pane-desktop' }),
      terminal: h('div', { class: 'pi-pane pane-terminal' }),
      thonny: h('div', { class: 'pi-pane pane-thonny' }),
    };
    for (const p of Object.values(this.panes)) this.main.appendChild(p);
    this.nav = h('nav', { class: 'ed-nav pi-nav' });
    this.root.append(this.top, this.main, this.nav);

    // Thonny and the desktop are shared by every tab; the terminal tab has its own shell
    this.thonny = new Thonny({ sys: this.sys, wire: (ex) => { this.sys.wireExample(ex); this.drawParts(); } });
    this.desktop = new Desktop({ sys: this.sys, thonny: this.thonny });
    this.panes.desktop.appendChild(this.desktop.el);
    this.thonny.el.addEventListener('focusin', () => {});
    this.buildBoardPane();
    this.drawNav();
    this.drawBoard();
  }

  drawNav() {
    this.nav.innerHTML = '';
    for (const [id, ic, label] of this.isPico ? TABS_PICO : TABS_PI) {
      this.nav.appendChild(h('button', { class: 'nav-tab' + (id === this.tab ? ' active' : ''), 'data-tab': id, onclick: () => this.setTab(id), html: `${icon(ic, 22)}<span>${label}</span>` }));
    }
  }

  setTab(id) {
    const prev = this.tab;
    if (this.isPico && (id === 'desktop' || id === 'terminal')) id = 'board';
    this.tab = id;
    for (const [k, p] of Object.entries(this.panes)) p.classList.toggle('active', k === id);
    this.nav.querySelectorAll('.nav-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
    this.root.dataset.tab = id;
    if (prev === 'desktop' && id !== 'desktop') this.desktop.hidden();
    if (id === 'thonny') {
      this.panes.thonny.appendChild(this.thonny.el);
      this.thonny.shown();
    } else if (prev === 'thonny' || (prev === 'desktop' && !this.desktop.thonnyWin())) this.thonny.hidden();
    if (id === 'desktop') this.desktop.shown();
    if (id === 'terminal') {
      if (!this.term) {
        this.term = new Terminal({ sys: this.sys, openThonny: (p) => { this.setTab('thonny'); if (p) this.thonny.open(p); }, openFile: (p) => { this.setTab('desktop'); this.desktop.openPath(p); } });
        this.panes.terminal.appendChild(this.term.el);
      }
      setTimeout(() => this.term.con.focus(), 80);
    }
    if (id === 'board') this.refresh(true);
  }

  // ---------------------------------------------------------------- board pane
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
    this.fileSel = h('select', { class: 'select pb-file' });
    this.runBtn = h('button', { class: 'run-btn pb-runbtn', onclick: () => this.toggleRun() });
    this.runBar = h('div', { class: 'pb-runbar' }, this.fileSel, this.runBtn,
      h('button', { class: 'icon-btn pb-edit', title: 'Open in Thonny', html: icon('code', 20), onclick: () => { const v = this.fileSel.value; this.setTab('thonny'); if (v) this.thonny.open(v); } }));
    this.mini = new Console({ cls: 'pb-mini' });
    this.miniBox = h('div', { class: 'pb-minibox' }, h('div', { class: 'pb-minihead' }, h('b', {}, 'Output'), h('button', { class: 'th-clear', onclick: () => this.mini.clear() }, 'Clear')), this.mini.el);
    this.partsHead = h('div', { class: 'pb-parts-head' });
    this.partsGrid = h('div', { class: 'pb-parts' });
    this.specs = h('div', { class: 'pb-specs' });
    p.append(h('div', { class: 'pb-inner' }, this.boardBox, this.legendRow, this.runBar, this.miniBox, this.partsHead, this.partsGrid, this.specs));
    const tapPin = (e) => { const g = e.target.closest('[data-phys]'); if (g) this.pinSheet(Number(g.dataset.phys)); };
    this.svgWrap.addEventListener('click', tapPin);
    this.strip.addEventListener('click', tapPin);
  }

  drawBoard() {
    const b = this.sys.info;
    this.boardChip.innerHTML = `${icon('chip', 14)}<span>${b.name}</span>${icon('forward', 12)}`;
    this.svgWrap.innerHTML = boardSVG(this.sys.board);
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
    this.drawFiles();
    this.drawParts();
    this.refresh(true);
  }

  drawSpecs() {
    const b = this.sys.info;
    const row = (k, v) => (v ? h('div', { class: 'spec' }, h('span', {}, k), h('b', {}, v)) : null);
    this.specs.innerHTML = '';
    this.specs.append(h('div', { class: 'pb-sec' }, h('b', {}, b.name), h('span', { class: 'muted' }, ` · ${b.year}`)),
      row(b.kind === 'pico' ? 'MCU' : 'SoC', b.mcu || b.soc), row('CPU', b.cpu), row('Memory', b.ram), row('Flash', b.flash), row('GPU', b.gpu), row('I/O', b.io),
      row('Runs', b.kind === 'pico' ? 'MicroPython 1.29 (machine, rp2' + (b.wifi ? ', network' : '') + ', neopixel, dht)' : 'Python 3 programs (gpiozero, RPi.GPIO, neopixel, adafruit_dht) on a MicroPython 1.29 engine'));
  }

  drawFiles() {
    const fs = this.sys.fs;
    const keep = this.fileSel.value;
    const files = [];
    const walk = (d, depth) => { for (const n of fs.list(d)) { const p = normPath(n, d); if (n.startsWith('.')) continue; if (fs.isDir(p)) { if (depth < 2) walk(p, depth + 1); } else if (n.endsWith('.py')) files.push(p); } };
    try { walk(this.sys.home, 0); } catch (e) { /* ignore */ }
    this.fileSel.innerHTML = '';
    for (const f of files) this.fileSel.appendChild(h('option', { value: f }, this.isPico ? f.slice(1) : f.replace('/home/pi/', '')));
    const pref = keep && files.includes(keep) ? keep : (this.thonny.cur && files.includes(this.thonny.cur.path) ? this.thonny.cur.path : files.includes(this.isPico ? '/main.py' : '/home/pi/blink.py') ? (this.isPico ? '/main.py' : '/home/pi/blink.py') : files[0]);
    if (pref) this.fileSel.value = pref;
    this.updateRun();
  }

  drawParts() {
    this.partsGrid.innerHTML = '';
    for (const c of this.cards) this.audio.set(c.part.id, 0);
    this.cards = [];
    const gpio = this.sys.gpio;
    this.partsHead.innerHTML = '';
    this.partsHead.append(h('div', {}, h('b', {}, 'Parts on the header'), h('span', { class: 'muted' }, ` · ${gpio.parts.length}`)),
      h('button', { class: 'btn btn-primary pb-add', html: `${icon('plus', 16)}<span>Add part</span>`, onclick: () => this.addPartSheet() }));
    for (const part of gpio.parts) {
      const card = partCard(part, {
        gpio, board: this.sys.board, isPico: this.isPico,
        onPin: (pt, key) => this.pinPicker(pt, key),
        onRemove: (pt) => { gpio.removePart(pt.id); this.audio.set(pt.id, 0); this.sys.saveParts(); this.drawParts(); },
        onChange: () => this.sys.saveParts(),
        onChannel: (pt) => this.channelPicker(pt),
        vibrate: () => Native.vibrate(6),
        tone: (id, f) => this.audio.set(id, f, 0.6),
      });
      this.cards.push(card);
      this.partsGrid.appendChild(card.el);
    }
    if (!gpio.parts.length) this.partsGrid.appendChild(h('p', { class: 'muted pb-empty' }, 'No parts yet. Add LEDs, buttons, sensors … and wire them to GPIO pins.'));
    this.refresh(true);
  }

  /** Update pin colours, LEDs and part cards (called on every GPIO change, throttled to frames). */
  refresh(force) {
    if (this.tab !== 'board' && !force) return;
    const gpio = this.sys.gpio;
    for (const [g, el] of this.pinEls || []) {
      const p = gpio.pins.get(g);
      if (!p) continue;
      const lvl = gpio.read(g);
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
    for (const c of this.cards) c.update();
  }

  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    const now = performance.now();
    if (this.actLed) {
      const busy = this.sys.running;
      const on = busy ? Math.sin(now / 37) + Math.sin(now / 13) > 0.4 : (now % 4000) < 90;
      if (on !== this.actOn) { this.actOn = on; this.actLed.classList.toggle('on', on); }
    }
    const running = this.thonny.running || this.sys.running;
    if (running !== this.lastRunning) { this.lastRunning = running; this.updateRun(); }
    if (this.tab === 'board') for (const c of this.cards) if (ANIMATED.has(c.part.type)) c.update();
  }

  updateRun() {
    const running = this.thonny.running;
    this.runDot.classList.toggle('on', !!(this.thonny.running || this.sys.running));
    this.runBtn.classList.toggle('running', running);
    this.runBtn.innerHTML = running ? `${icon('stop', 18)}<span>Stop</span>` : `${icon('play', 18)}<span>Run</span>`;
  }

  async toggleRun() {
    if (this.thonny.running) { await this.thonny.stop(); return; }
    const f = this.fileSel.value;
    if (!f) { toast('No Python file yet: write one in Thonny', 'warn'); return; }
    this.audio.resume();
    this.mini.clear();
    this.thonny.open(f);
    this.thonny.run();
  }

  // ---------------------------------------------------------------- sheets
  boardSheet() {
    const box = h('div', { class: 'pi-boards' });
    for (const id of BOARD_ORDER) {
      const b = BOARDS[id];
      box.appendChild(h('button', { class: 'pi-bopt' + (id === this.sys.board ? ' active' : ''), onclick: () => { sheet.close(); if (id !== this.sys.board) this.switchBoard(id); } },
        h('div', { class: 'pi-bthumb', html: boardSVG(id) }),
        h('div', {}, h('b', {}, b.name), h('small', {}, `${b.cpu} · ${b.ram}`), h('small', { class: 'muted' }, b.kind === 'pico' ? 'MicroPython · Thonny' : 'Desktop · Terminal · Thonny · Python 3'))));
    }
    const sheet = new Sheet({ title: 'Choose a board', icon: 'chip', content: box, height: '80vh' }).open();
  }

  switchBoard(id) {
    this.sys.setBoard(id);
    toast(`${BOARDS[id].name} ready`, 'ok');
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
      rows.push(['Level', gpio.read(hdr.gpio) ? 'HIGH (3.3 V)' : 'LOW (0 V)']);
      if (p.mode === 'in') rows.push(['Pull', p.pull === 'up' ? 'Pull-up' : p.pull === 'down' ? 'Pull-down' : 'None (floating)']);
      const wired = gpio.parts.filter((pt) => Object.values(pt.pins).includes(hdr.gpio)).map((pt) => PART_TYPES[pt.type].name);
      rows.push(['Wired to', wired.length ? wired.join(', ') : '—']);
      rows.push(['gpiozero', this.isPico ? `Pin(${hdr.gpio})` : `LED(${hdr.gpio}) · Button(${hdr.gpio}) · "BOARD${phys}"`]);
    } else if (hdr.type === 'power3') rows.push(['Note', 'Max ~50 mA from the 3V3 pins.']);
    else if (hdr.type === 'power5') rows.push(['Note', 'Straight from the power supply. Never connect 5 V to a GPIO pin!']);
    const box = h('div', { class: 'pin-info' }, ...rows.map(([k, v]) => h('div', { class: 'spec' }, h('span', {}, k), h('b', {}, v))));
    if (hdr.gpio != null) box.appendChild(h('button', { class: 'btn btn-ghost', html: `${icon('plus', 16)}<span>Wire a part to this pin</span>`, onclick: () => { sheet.close(); this.addPartSheet(hdr.gpio); } }));
    const sheet = new Sheet({ title: hdr.gpio != null ? `${pinLabel(this.sys.board, hdr.gpio)} · pin ${phys}` : `${hdr.name} · pin ${phys}`, icon: 'pin', content: box }).open();
  }

  addPartSheet(atPin = null) {
    const box = h('div', { class: 'pi-addparts' });
    for (const type of PART_ORDER) {
      const t = PART_TYPES[type];
      box.appendChild(h('button', { class: 'pi-addpart', onclick: () => { sheet.close(); this.addPart(type, atPin); } }, h('span', { class: 'pc-ic', html: icon(t.ic, 20) }), h('div', {}, h('b', {}, t.name), h('small', {}, t.desc))));
    }
    const sheet = new Sheet({ title: 'Add a part', icon: 'plus', content: box, height: '80vh' }).open();
  }

  addPart(type, atPin) {
    const gpio = this.sys.gpio;
    const used = new Set(gpio.parts.flatMap((p) => Object.values(p.pins)));
    const part = newPart(type, {});
    const need = partPins(part, this.isPico);
    for (const pd of need) {
      const cands = wirablePins(this.sys.board, pd.adc && this.isPico);
      let g = atPin != null && cands.includes(atPin) && !used.has(atPin) ? atPin : cands.find((x) => !used.has(x) && (this.isPico || x > 3));
      if (g == null) g = cands[0];
      part.pins[pd.key] = g; used.add(g); atPin = null;
    }
    if (!this.isPico && (type === 'pot' || type === 'ldr')) {
      const chans = new Set(gpio.parts.filter((p) => p.type === 'pot' || p.type === 'ldr').map((p) => Number(p.props.ch)));
      part.props.ch = [0, 1, 2, 3, 4, 5, 6, 7].find((c) => !chans.has(c)) ?? 0;
    }
    gpio.addPart(part);
    this.sys.saveParts();
    this.drawParts();
    toast(`${PART_TYPES[type].name} added: tap its pin chip to rewire`, 'ok');
  }

  pinPicker(part, key) {
    const pd = PART_TYPES[part.type].pins.find((p) => p.key === key);
    const gpio = this.sys.gpio;
    const users = new Map();
    for (const p of gpio.parts) for (const [k, g] of Object.entries(p.pins)) if (!(p === part && k === key)) users.set(g, PART_TYPES[p.type].name);
    const box = h('div', { class: 'pin-pick' });
    for (const g of wirablePins(this.sys.board, pd.adc && this.isPico)) {
      const hdr = headerOf(this.sys.board).find((x) => x.gpio === g);
      box.appendChild(h('button', { class: 'pin-opt' + (part.pins[key] === g ? ' active' : '') + (users.has(g) ? ' used' : ''), onclick: () => { sheet.close(); part.pins[key] = g; gpio.partChanged(); this.sys.saveParts(); this.drawParts(); } },
        h('b', {}, pinLabel(this.sys.board, g)), h('span', {}, `pin ${physOf(this.sys.board, g)}${hdr && hdr.alt ? ' · ' + hdr.alt.split(' · ')[0] : ''}`), users.has(g) ? h('small', {}, users.get(g)) : null));
    }
    const sheet = new Sheet({ title: `${PART_TYPES[part.type].name}: ${pd.label} →`, icon: 'pin', content: box, height: '75vh' }).open();
  }

  channelPicker(part) {
    const box = h('div', { class: 'pin-pick' });
    for (let c = 0; c < 8; c++) box.appendChild(h('button', { class: 'pin-opt' + (Number(part.props.ch) === c ? ' active' : ''), onclick: () => { sheet.close(); part.props.ch = c; this.sys.saveParts(); this.drawParts(); } }, h('b', {}, `CH${c}`), h('span', {}, `MCP3008(channel=${c})`)));
    const sheet = new Sheet({ title: 'MCP3008 channel (SPI0, CE0)', icon: 'pin', content: box }).open();
  }

  menu(anchor) {
    popupMenu(anchor, [
      { icon: 'chip', label: 'Change board', action: () => this.boardSheet() },
      { icon: this.audio.enabled ? 'bell' : 'close', label: this.audio.enabled ? 'Mute buzzer sound' : 'Turn buzzer sound on', action: () => { this.audio.enabled = !this.audio.enabled; if (!this.audio.enabled) this.audio.stopAll(); try { localStorage.setItem('rapti.pi.mute', this.audio.enabled ? '0' : '1'); } catch (e) { /* ignore */ } } },
      '-',
      { icon: 'restart', label: 'Reset the wiring', action: async () => { if (await confirmDialog('Reset the wiring', 'Remove all parts and put back the default ones?', 'Reset', true)) { try { localStorage.removeItem(this.sys.partsKey()); } catch (e) { /* ignore */ } this.sys.gpio.parts = this.sys.loadParts(this.sys.board); this.sys.gpio.partChanged(); this.sys.saveParts(); this.drawParts(); } } },
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
      h('p', {}, 'Python runs on a real MicroPython 1.29 interpreter compiled to WebAssembly, inside the app (no internet needed).'),
      h('p', {}, 'Raspberry Pi 5 / 4: Python 3 style programs with gpiozero, RPi.GPIO, neopixel, adafruit_dht and signal. Pico boards: MicroPython machine, rp2, neopixel, dht and network (Pico W).'),
      h('p', { class: 'muted' }, 'Not simulated: a real Linux kernel, apt / pip installs, internet, the camera, PIO programs, CPython-only libraries such as numpy or OpenCV.'));
    new Sheet({ title: 'About the Raspberry Pi Lab', icon: 'info', content: body }).open();
  }

  onSys(what) {
    if (what === 'board') {
      if (this.isPico && (this.tab === 'desktop' || this.tab === 'terminal')) this.setTab('board');
      this.drawNav();
      this.drawBoard();
      this.mini.clear();
      this.panes.board.scrollTop = 0;
    } else if (what === 'files') this.drawFiles();
    else if (what === 'input') { if (this.tab === 'board' || (this.tab === 'desktop' && !this.desktop.thonnyWin())) this.setTab('thonny'); }
    else if (what === 'parts') { /* cards already redrawn */ } else if (what === 'start') { /* new process */ } else if (what === 'run') { this.updateRun(); this.drawFiles(); } else if (what === 'proc') this.updateRun();
  }

  // ---------------------------------------------------------------- lifecycle
  mount(parent) {
    parent.appendChild(this.root);
    this.unback = pushBack(() => this.onBack());
    this.setTab(this.tab);
    this.loop();
    this.audioResume = () => this.audio.resume();
    this.root.addEventListener('pointerdown', this.audioResume);
  }

  onBack() {
    const rearm = () => { this.unback = pushBack(() => this.onBack()); };
    if (this.tab === 'desktop' && this.desktop.top && this.desktop.wins.length) { this.desktop.close(this.desktop.top); rearm(); return; }
    if (this.tab !== 'board') { this.setTab('board'); rearm(); return; }
    this.unback = null;
    this.leave();
  }

  leave() { this.app.showHome(); }

  unmount() {
    cancelAnimationFrame(this.raf);
    if (this.unback) this.unback();
    this.unback = null;
    this.thonny.hidden();
    this.sys.killProcess();
    this.audio.stopAll();
    this.audio.close && this.audio.close();
    this.offSys(); this.offGpio(); this.offOut();
    this.root.remove();
  }

  saveNow() { if (this.thonny.cur) { this.thonny.cur.text = this.thonny.editor.value; this.thonny.saveTabs(); } }
  onPause() { this.saveNow(); this.audio.suspend(); }
}

export { PICO_W_LED };
