// Simulated GPIO for the virtual Raspberry Pi (BCM 0–27) and Pico (GP0–GP29, Pico W "LED").
// Python reaches it through the _rpi_js module (see python.js); the UI subscribes with on().
import { PART_SIM } from './partsim.js';

export const PICO_W_LED = 64;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class GpioSim {
  constructor(board = 'pi5') {
    this.listeners = new Set();
    this.parts = [];
    this.timers = new Map();
    this.timerSeq = 1;
    this.bg = new Map();
    this.bgTimer = null;
    this.bootsel = 0;
    this.wifiState = { state: 0, ssid: '' };
    this.uartLog = [];
    this.lastYield = now();
    this.quietEnd = 0;
    this.setBoard(board);
  }

  setBoard(board) {
    this.board = board;
    this.isPico = board.startsWith('pico');
    this.reset();
  }

  get pinIds() {
    const ids = [];
    const max = this.isPico ? 29 : 27;
    for (let i = 0; i <= max; i++) ids.push(i);
    if (this.board === 'picow' || this.board === 'pico2w') ids.push(PICO_W_LED);
    return ids;
  }

  defaultPull(n) {
    if (this.isPico) return n === PICO_W_LED ? 'none' : 'down';
    return n <= 8 ? 'up' : 'down';
  }

  fresh(n) {
    return { n, mode: 'in', out: 0, pull: this.defaultPull(n), freq: 0, duty: 0, watch: null, cbs: [], detected: false, last: 0, bounceUntil: 0, used: false, owner: '' };
  }

  /** Power-on state: every pin an input with its default pull, no timers, no events. */
  reset() {
    this.stopProcess();
    this.pins = new Map();
    for (const n of this.pinIds) this.pins.set(n, this.fresh(n));
    this.neo = new Map();
    this.lcd = new Map();
    this.wifiState = { state: 0, ssid: '' };
    for (const p of this.parts) { p.state = Object.assign({}, p.state, { tFall: null, trigHigh: null }); }
    this.changed();
  }

  /** A Python program ended: its timers and blink patterns stop; gpiozero devices close. */
  stopProcess({ releaseZero = true } = {}) {
    for (const t of this.timers.values()) clearTimeout(t.h);
    this.timers.clear();
    this.events = [];
    this.evArg = 0;
    this.bg.clear();
    if (this.pins) {
      for (const p of this.pins.values()) {
        p.watch = null; p.cbs = []; p.detected = false;
        if (releaseZero && p.owner === 'zero') Object.assign(p, this.fresh(p.n));
      }
    }
    this.changed();
  }

  pin(n) {
    const p = this.pins.get(n);
    if (!p) throw new Error(`GPIO${n} does not exist on this board`);
    return p;
  }

  // ---------------------------------------------------------------- outputs
  setup(n, mode, pull) {
    const p = this.pin(n);
    this.bg.delete(n);
    p.used = true;
    if (mode === 'out') { p.mode = 'out'; p.duty = p.out; }
    else if (mode === 'in') { p.mode = 'in'; p.pull = pull || 'none'; p.duty = 0; }
    else { p.mode = mode; }
    this.inputsChanged();
    this.changed(n);
  }

  setPull(n, pull) { this.pin(n).pull = pull; this.inputsChanged(); this.changed(n); }

  write(n, v, fromBg = false) {
    const p = this.pin(n);
    if (!fromBg) this.bg.delete(n);
    v = v ? 1 : 0;
    const was = this.level(n);
    p.out = v;
    p.used = true;
    if (p.mode === 'pwm') p.mode = 'out';
    if (p.mode === 'out') p.duty = v;
    const t = now();
    if (was !== v) for (const part of this.parts) { const s = PART_SIM[part.type]; if (s && s.onWrite) s.onWrite(part, n, v, this, t); }
    this.inputsChanged();
    this.changed(n);
  }

  pwm(n, freq, duty, fromBg = false) {
    const p = this.pin(n);
    if (!fromBg) this.bg.delete(n);
    p.mode = 'pwm';
    p.used = true;
    p.freq = freq;
    p.duty = Math.max(0, Math.min(1, duty));
    this.changed(n);
  }

  pwmOff(n) {
    const p = this.pin(n);
    this.bg.delete(n);
    p.mode = 'out'; p.duty = 0; p.out = 0; p.freq = 0;
    this.changed(n);
  }

  /** Output latch / level of a pin (0 / 1). */
  level(n) {
    const p = this.pin(n);
    if (p.mode === 'pwm') return p.duty >= 0.5 ? 1 : 0;
    return p.out;
  }

  /** How strongly a pin drives its load: 0–1 (PWM duty), or null for an input. */
  drive(n) {
    const p = this.pins.get(n);
    if (!p) return null;
    if (p.mode === 'out') return p.out;
    if (p.mode === 'pwm') return p.duty;
    return null;
  }

  duty(n) { const d = this.drive(n); return d == null ? 0 : d; }

  // ---------------------------------------------------------------- inputs
  external(n, t = now()) {
    for (const part of this.parts) {
      const s = PART_SIM[part.type];
      if (!s || !s.drive) continue;
      const v = s.drive(part, n, t, this);
      if (v != null) return v;
    }
    return null;
  }

  read(n) {
    const p = this.pin(n);
    if (p.mode === 'out') return p.out;
    if (p.mode === 'pwm') return p.duty >= 0.5 ? 1 : 0;
    const ext = this.external(n);
    if (ext != null) return ext;
    if (p.pull === 'up') return 1;
    return 0;
  }

  /** Parts changed (a button press …): fire edge detection on watched pins. */
  inputsChanged() {
    if (!this.pins) return;
    const t = now();
    for (const p of this.pins.values()) {
      if (!p.watch) continue;
      const v = this.read(p.n);
      if (v === p.last) continue;
      p.last = v;
      const e = p.watch.edge;
      if (e === 'both' || (e === 'rising' && v) || (e === 'falling' && !v)) {
        if (t < p.bounceUntil) continue;
        p.bounceUntil = t + (p.watch.bounce || 0);
        p.detected = true;
        for (const cid of p.cbs) this.events.push([cid, v]);
      }
    }
    this.changed();
  }

  watch(n, edge, bounce) {
    const p = this.pin(n);
    p.watch = { edge, bounce: bounce || 0 };
    p.cbs = [];
    p.detected = false;
    p.last = this.read(n);
  }

  watchCb(n, cid) { this.pin(n).cbs.push(cid); }
  unwatch(n) { const p = this.pin(n); p.watch = null; p.cbs = []; }
  detected(n) { const p = this.pin(n); const d = p.detected; p.detected = false; return d ? 1 : 0; }

  release(n) {
    if (!this.pins.has(n)) return;
    this.bg.delete(n);
    this.pins.set(n, this.fresh(n));
    this.inputsChanged();
    this.changed(n);
  }

  // ---------------------------------------------------------------- events & timers
  pending() { return this.events.length; }

  nextEvent() {
    const e = this.events.shift();
    if (!e) return 0;
    this.evArg = e[1];
    return e[0];
  }

  timer(cid, ms, periodic) {
    const id = this.timerSeq++;
    const t = { h: 0 };
    const fire = () => {
      if (!this.timers.has(id)) return;
      if (this.events.length < 64) this.events.push([cid, 0]);
      if (periodic) t.h = setTimeout(fire, ms); else this.timers.delete(id);
    };
    t.h = setTimeout(fire, ms);
    this.timers.set(id, t);
    return id;
  }

  timerStop(id) { const t = this.timers.get(id); if (t) { clearTimeout(t.h); this.timers.delete(id); } }

  // ---------------------------------------------------------------- background blink / fade
  blink(n, onT, offT, count, onV, offV, fadeIn, fadeOut) {
    const cycle = onT + offT + fadeIn + fadeOut;
    if (cycle <= 0) return;
    const p = this.pin(n);
    const pwm = fadeIn > 0 || fadeOut > 0 || (onV > 0 && onV < 1) || (offV > 0 && offV < 1) || p.mode === 'pwm';
    if (pwm && p.mode !== 'pwm') { p.mode = 'pwm'; p.freq = p.freq || 100; }
    this.bg.set(n, { t0: now(), onT, offT, fadeIn, fadeOut, count, onV, offV, pwm, cycle });
    this.tickBg();
    if (!this.bgTimer) this.bgTimer = setInterval(() => this.tickBg(), 16);
  }

  stopBg(n) { this.bg.delete(n); }

  tickBg() {
    if (!this.bg.size) { clearInterval(this.bgTimer); this.bgTimer = null; return; }
    const t = now();
    for (const [n, b] of this.bg) {
      let el = (t - b.t0) / 1000;
      if (b.count && el >= b.cycle * b.count) {
        this.bg.delete(n);
        if (b.pwm) this.pwm(n, this.pin(n).freq || 100, b.offV, true); else this.write(n, b.offV, true);
        continue;
      }
      el %= b.cycle;
      let v;
      if (el < b.fadeIn) v = b.offV + (b.onV - b.offV) * (el / b.fadeIn);
      else if (el < b.fadeIn + b.onT) v = b.onV;
      else if (el < b.fadeIn + b.onT + b.fadeOut) v = b.onV + (b.offV - b.onV) * ((el - b.fadeIn - b.onT) / b.fadeOut);
      else v = b.offV;
      if (b.pwm) { const p = this.pin(n); if (Math.abs(p.duty - v) > 0.004 || p.mode !== 'pwm') this.pwm(n, p.freq || 100, v, true); }
      else if (this.level(n) !== (v >= 0.5 ? 1 : 0)) this.write(n, v >= 0.5 ? 1 : 0, true);
    }
  }

  // ---------------------------------------------------------------- analog & sensors
  partOn(type, key, n) { return this.parts.find((p) => p.type === type && p.pins[key] === n); }

  adc(ch) {
    if (this.isPico) {
      if (ch === 4) { // RP2040 internal temperature sensor: 0.706 V at 27 °C, −1.721 mV/°C
        const tC = 27 + Math.sin(now() / 9000) * 0.8;
        return (0.706 - (tC - 27) * 0.001721) / 3.3 + (Math.random() - 0.5) * 0.0015;
      }
      if (ch === 3) return 1.62 / 3.3 + (Math.random() - 0.5) * 0.002; // VSYS / 3
      const n = 26 + ch;
      const pot = this.partOn('pot', 'a', n);
      if (pot) return clamp01((pot.props.value ?? 0.5) + (Math.random() - 0.5) * 0.002);
      const ldr = this.partOn('ldr', 'a', n);
      if (ldr) return clamp01((ldr.props.light ?? 0.6) + (Math.random() - 0.5) * 0.004);
      return 0.006 + Math.random() * 0.01; // floating input
    }
    return 0;
  }

  mcp3008(ch) {
    const pot = this.parts.find((p) => (p.type === 'pot' || p.type === 'ldr') && Number(p.props.ch ?? 0) === ch && !this.isPico);
    if (!pot) return 0;
    const v = pot.type === 'pot' ? pot.props.value ?? 0.5 : pot.props.light ?? 0.6;
    return clamp01(Math.round(v * 1023) / 1023);
  }

  light(n) { const l = this.partOn('ldr', 'a', n); return l ? clamp01(l.props.light ?? 0.6) : 0; }

  distance(echo) {
    const u = this.partOn('ultrasonic', 'echo', echo);
    return u ? Math.max(0.02, Math.min(4, (u.props.cm ?? 50) / 100)) : -1;
  }

  dht(n, which) {
    const d = this.partOn('dht', 'data', n);
    if (!d) return -999;
    return which ? (d.props.h ?? 60) : (d.props.t ?? 28);
  }

  neoWrite(n, count, hex) {
    const colors = [];
    for (let i = 0; i < count; i++) colors.push([parseInt(hex.substr(i * 6, 2), 16) || 0, parseInt(hex.substr(i * 6 + 2, 2), 16) || 0, parseInt(hex.substr(i * 6 + 4, 2), 16) || 0]);
    this.neo.set(n, colors);
    this.changed(n);
  }

  cpuTemp() {
    const base = this.board === 'pi5' ? 51.5 : 47.2;
    return Math.round((base + Math.sin(now() / 7000) * 1.6 + (this.busy ? 6 : 0)) * 10) / 10;
  }

  // ---------------------------------------------------------------- yielding
  /** Asked by the interpreter about every few hundred bytecodes: give the browser a turn? */
  shouldYield() {
    const t = now();
    if (t < this.quietEnd) return 0;
    if (t - this.lastYield < 25) return 0;
    this.lastYield = t;
    return 1;
  }

  /** Don't interrupt Python with a UI turn until t (it is timing a pulse); capped at 60 ms. */
  quietUntil(t) { this.quietEnd = Math.min(t, now() + 60); }

  // ---------------------------------------------------------------- parts
  addPart(part) { this.parts.push(part); this.inputsChanged(); this.changed(); }
  removePart(id) { this.parts = this.parts.filter((p) => p.id !== id); this.inputsChanged(); this.changed(); }
  partChanged() { this.inputsChanged(); this.changed(); }

  // ---------------------------------------------------------------- UI notifications
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  changed() {
    if (this.raf) return;
    const run = () => { this.raf = 0; for (const fn of this.listeners) { try { fn(this); } catch (e) { console.error(e); } } };
    this.raf = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(run) : setTimeout(run, 16);
  }
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
