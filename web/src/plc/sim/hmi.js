// Delta DOP HMI runtime (screen objects, touch handling, PLC tag cache, on-screen keypad).
// Rendering lives in ui/hmi-render.js; this module has no DOM dependencies.
import { parseOperand } from './address.js';

export const HMI_W = 800, HMI_H = 480;

export const HMI_TYPES = {
  button: { name: 'Button', w: 150, h: 70, props: { text: 'START', bit: 'M0', mode: 'momentary', color: 'green' } },
  lamp: { name: 'Indicator lamp', w: 70, h: 70, props: { bit: 'Y0', text: 'RUN', onColor: '#22c55e', offColor: '#334155', shape: 'circle' } },
  num: { name: 'Numeric display', w: 190, h: 64, props: { word: 'D0', dec: 0, unit: '', label: 'Value' } },
  input: { name: 'Numeric input', w: 190, h: 64, props: { word: 'D0', dec: 0, unit: '', label: 'Set point', min: 0, max: 100 } },
  meter: { name: 'Meter (gauge)', w: 200, h: 150, props: { word: 'D0', dec: 0, unit: '', label: 'Meter', min: 0, max: 100 } },
  bar: { name: 'Bar graph', w: 60, h: 180, props: { word: 'D0', dec: 0, label: 'Level', min: 0, max: 100, color: '#22d3ee' } },
  text: { name: 'Static text', w: 240, h: 40, props: { text: 'Text', size: 24, color: '#e2e8f0', align: 'left', bold: true } },
  motor: { name: 'Motor / fan', w: 110, h: 110, props: { bit: 'Y0', text: 'MOTOR' } },
  trend: { name: 'Trend graph', w: 360, h: 170, props: { word: 'D0', word2: '', min: 0, max: 100, span: 30, label: 'Trend' } },
  goto: { name: 'Screen button', w: 150, h: 56, props: { text: 'NEXT', screen: 1 } },
  alarm: { name: 'Alarm banner', w: 520, h: 44, props: { bit: 'M100', text: 'ALARM: motor overload' } },
  rect: { name: 'Panel / frame', w: 300, h: 180, props: { fill: '#13223f', stroke: '#2b4470', radius: 14, title: '' } },
  state: { name: 'Multi-state indicator', w: 200, h: 56, props: { word: 'D0', bit: '', label: 'Status', states: '0:STOPPED:#475569|1:RUNNING:#22c55e|2:FAULT:#ef4444' } },
  setval: { name: 'Set value / ± button', w: 110, h: 60, props: { word: 'D0', mode: 'inc', value: 1, min: 0, max: 100, text: '+', color: 'blue' } },
  slider: { name: 'Slider', w: 300, h: 70, props: { word: 'D0', min: 0, max: 100, dec: 0, label: 'Set point', unit: '' } },
  selsw: { name: 'Selector switch', w: 120, h: 120, props: { bit: 'M0', off: 'MAN', on: 'AUTO' } },
  tank: { name: 'Tank / level', w: 140, h: 190, props: { word: 'D0', min: 0, max: 100, dec: 0, label: 'TANK', unit: '%', color: '#38bdf8' } },
  pipe: { name: 'Pipe (flow)', w: 260, h: 26, props: { bit: 'Y0', color: '#38bdf8' } },
  valve: { name: 'Valve', w: 80, h: 70, props: { bit: 'Y0', text: 'V1' } },
  clock: { name: 'Date / time', w: 230, h: 40, props: { fmt: 'datetime', size: 20, color: '#e2e8f0' } },
  alarmlist: { name: 'Alarm history', w: 520, h: 220, props: { label: 'ALARM HISTORY' } },
};

/** Objects that only show something: a touch passes through them. */
const PASSIVE = new Set(['rect', 'text', 'clock', 'pipe', 'tank', 'valve', 'state', 'num', 'meter', 'bar', 'trend', 'lamp', 'motor', 'alarm']);

/** "0:STOPPED:#475569|1:RUNNING:#22c55e" → [{v, text, color}] */
export function parseStates(s) {
  return String(s || '').split('|').map((p) => p.split(':')).filter((p) => p[0] !== '' && Number.isFinite(+p[0])).map(([v, text = '', color = '#475569']) => ({ v: +v, text, color }));
}

let eid = 0;
export const hmiId = () => 'e' + Date.now().toString(36) + (eid++).toString(36);

export function newHmiElement(type, x = 40, y = 40) {
  const t = HMI_TYPES[type];
  return { id: hmiId(), type, x, y, w: t.w, h: t.h, ...JSON.parse(JSON.stringify(t.props)) };
}

export function createHmiProject() {
  return { screens: [{ id: 's1', name: 'Main', bg: '#0b1630', elements: [] }], start: 0 };
}

export function normalizeHmi(h) {
  const p = h && Array.isArray(h.screens) && h.screens.length ? h : createHmiProject();
  for (const s of p.screens) { s.elements = s.elements || []; s.bg = s.bg || '#0b1630'; s.name = s.name || 'Screen'; }
  p.start = Math.min(p.start || 0, p.screens.length - 1);
  return p;
}

/** Tags an element reads: [{a: 'M0', w: false}, {a: 'D10', w: true}]. */
export function elementTags(el) {
  const out = [];
  if (el.bit && parseOperand(el.bit)) out.push({ a: el.bit.toUpperCase(), w: false });
  for (const k of ['word', 'word2']) if (el[k] && parseOperand(el[k])) out.push({ a: el[k].toUpperCase(), w: true });
  return out;
}
const tagKey = (a, w) => (w ? 'w:' : 'b:') + String(a).toUpperCase();

export class HmiRuntime {
  /**
   * link: { ok(): bool, read(op) → number|null, write(op, value): bool }
   */
  constructor(project, link) {
    this.project = normalizeHmi(project);
    this.link = link;
    this.screen = this.project.start || 0;
    this.cache = new Map();
    this.pressed = new Map(); // element id → pointer id
    this.keypad = null; // {el, text}
    this.trends = new Map(); // element id → [[t, v1, v2]]
    this.time = 0;
    this.powered = false;
    this.bootT = 0;
    this.commOk = false;
    this.pollT = 0;
    this.dirty = true;
    this.alarmLog = []; // alarm history: {text, bit, t, off, ack}
    this.alarmOn = new Map();
    this.slide = null;
    this.corner = null; // long press in the top-left corner opens the system menu
    this.sysMenu = null;
    this.bright = 1;
  }

  /** Does the screen need a repaint every frame (animations, clock, blinking)? */
  animated() {
    if (!this.powered) return false;
    if (this.bootT > 0 || !this.commOk || this.keypad || this.sysMenu) return true;
    return this.current.elements.some((e) => e.type === 'motor' || e.type === 'trend' || e.type === 'alarm' || e.type === 'clock' || e.type === 'pipe' || e.type === 'alarmlist');
  }

  /** Every alarm object of every screen (the alarm system watches them all the time). */
  alarmEls() { return this.project.screens.flatMap((s) => s.elements.filter((e) => e.type === 'alarm' && e.bit && parseOperand(e.bit))); }

  setProject(p) { this.project = normalizeHmi(p); if (this.screen >= this.project.screens.length) this.screen = 0; this.dirty = true; }

  get current() { return this.project.screens[this.screen] || this.project.screens[0]; }

  powerOn() { if (!this.powered) { this.powered = true; this.bootT = 1.6; this.screen = this.project.start || 0; this.keypad = null; this.sysMenu = null; this.dirty = true; } }
  powerOff() { if (this.powered) { this.powered = false; this.cache.clear(); this.pressed.clear(); this.keypad = null; this.sysMenu = null; this.slide = null; this.alarmOn.clear(); this.dirty = true; } }

  value(addr, word = false) {
    if (!addr) return null;
    const v = this.cache.get(tagKey(addr, word));
    return v === undefined ? null : v;
  }

  /** Poll the PLC (called by the system). Returns the list of addresses read (for the comm log). */
  poll(dt) {
    this.time += dt;
    if (this.bootT > 0) { this.bootT -= dt; this.dirty = true; return null; }
    if (!this.powered) return null;
    if (this.corner && !this.sysMenu && this.time - this.corner.t > 1.2) { this.sysMenu = { page: 'main' }; this.corner = null; this.dirty = true; }
    const ok = this.link.ok();
    if (ok !== this.commOk) { this.commOk = ok; this.dirty = true; }
    this.pollT -= dt;
    if (this.pollT > 0) return null;
    this.pollT = 0.15;
    if (!ok) return null;
    const tags = new Map();
    for (const el of this.current.elements) for (const t of elementTags(el)) tags.set(tagKey(t.a, t.w), t);
    const alarms = this.alarmEls();
    for (const el of alarms) tags.set(tagKey(el.bit, false), { a: el.bit.toUpperCase(), w: false });
    for (const [k, t] of tags) {
      const v = this.link.read(parseOperand(t.a), t.w);
      if (this.cache.get(k) !== v) { this.cache.set(k, v); this.dirty = true; }
    }
    // alarm history: a new entry when an alarm bit turns ON, stamped again when it clears
    for (const el of alarms) {
      const on = !!this.value(el.bit, false), was = !!this.alarmOn.get(el.id);
      if (on && !was) { this.alarmLog.unshift({ text: el.text || el.bit, bit: el.bit, t: Date.now(), off: null, ack: false }); this.alarmLog.length = Math.min(this.alarmLog.length, 50); }
      if (!on && was) { const a = this.alarmLog.find((x) => x.bit === el.bit && x.off === null); if (a) a.off = Date.now(); }
      this.alarmOn.set(el.id, on);
    }
    // trends sample
    for (const el of this.current.elements) {
      if (el.type !== 'trend') continue;
      const arr = this.trends.get(el.id) || [];
      arr.push([this.time, this.value(el.word, true), el.word2 ? this.value(el.word2, true) : null]);
      while (arr.length && arr[0][0] < this.time - (el.span || 30)) arr.shift();
      this.trends.set(el.id, arr);
      this.dirty = true;
    }
    return [...tags.values()];
  }

  write(addr, v, word = false) {
    if (!this.powered || !this.commOk) return false;
    const op = parseOperand(addr);
    if (!op) return false;
    const ok = this.link.write(op, v, word);
    if (ok) { this.cache.set(tagKey(addr, word), v); this.dirty = true; }
    return ok;
  }

  hit(x, y) {
    const els = this.current.elements;
    for (let i = els.length - 1; i >= 0; i--) {
      const e = els[i];
      if (PASSIVE.has(e.type)) continue;
      if (x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h) return e;
    }
    return null;
  }

  // ------------------------------------------------------------------ touch
  pointerDown(x, y, pid = 0) {
    if (!this.powered || this.bootT > 0) return;
    if (this.sysMenu) { this.sysMenuTouch(x, y); return; }
    if (this.keypad) { this.keypadTouch(x, y); return; }
    const el = this.hit(x, y);
    if (!el) { if (x < 60 && y < 60) this.corner = { t: this.time, pid }; return; }
    this.pressed.set(el.id, pid);
    this.dirty = true;
    if (el.type === 'button') {
      const cur = this.value(el.bit, false) ? 1 : 0;
      if (el.mode === 'momentary') this.write(el.bit, 1);
      else if (el.mode === 'toggle') this.write(el.bit, cur ? 0 : 1);
      else if (el.mode === 'set') this.write(el.bit, 1);
      else if (el.mode === 'reset') this.write(el.bit, 0);
    } else if (el.type === 'input') {
      this.keypad = { el, text: '' };
    } else if (el.type === 'goto') {
      const s = Math.max(0, Math.min(this.project.screens.length - 1, (el.screen | 0)));
      this.screen = s;
    } else if (el.type === 'setval') {
      const cur = this.value(el.word, true) || 0, step = Number(el.value) || 0;
      const lo = Number(el.min ?? -32768), hi = Number(el.max ?? 32767);
      const v = el.mode === 'const' ? step : el.mode === 'dec' ? cur - step : cur + step;
      this.write(el.word, Math.round(Math.max(lo, Math.min(hi, v))), true);
    } else if (el.type === 'slider') {
      this.slide = { el, pid };
      this.slideTo(x);
    } else if (el.type === 'selsw') {
      this.write(el.bit, this.value(el.bit, false) ? 0 : 1);
    } else if (el.type === 'alarmlist') {
      for (const a of this.alarmLog) a.ack = true;
    }
  }

  /** Slider track inside the element (screen x). */
  sliderTrack(el) { return { x0: el.x + 18, x1: el.x + el.w - 18 }; }

  slideTo(x) {
    const el = this.slide.el, { x0, x1 } = this.sliderTrack(el);
    const k = Math.max(0, Math.min(1, (x - x0) / (x1 - x0 || 1)));
    const min = Number(el.min ?? 0), max = Number(el.max ?? 100);
    const v = Math.round((min + (max - min) * k) * 10 ** (el.dec || 0));
    if (v !== this.value(el.word, true)) this.write(el.word, v, true);
  }

  pointerMove(x, y, pid = 0) {
    if (this.slide && this.slide.pid === pid) this.slideTo(x);
    if (this.corner && this.corner.pid === pid && (x > 80 || y > 80)) this.corner = null;
  }

  // ------------------------------------------------------------------ system menu (DOP "System Setting")
  sysMenuLayout() {
    const W = 560, H = 360, x = (HMI_W - W) / 2, y = (HMI_H - H) / 2;
    const b = (k, label, bx, by, bw = 120, bh = 50) => ({ k, label, x: x + bx, y: y + by, w: bw, h: bh });
    return { x, y, w: W, h: H, keys: [b('dim', '☀ −', 300, 64), b('bright', '☀ +', 430, 64), b('clear', 'CLEAR ALARMS', 300, 128, 250), b('exit', 'EXIT', W - 150, H - 66, 130)] };
  }

  sysMenuTouch(x, y) {
    const L = this.sysMenuLayout();
    const key = L.keys.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    this.dirty = true;
    if (!key) { if (x < L.x || x > L.x + L.w || y < L.y || y > L.y + L.h) this.sysMenu = null; return; }
    this.sysMenu.flash = key.k; this.sysMenu.flashT = this.time;
    if (key.k === 'dim') this.bright = Math.max(0.3, Math.round((this.bright - 0.1) * 10) / 10);
    if (key.k === 'bright') this.bright = Math.min(1, Math.round((this.bright + 0.1) * 10) / 10);
    if (key.k === 'clear') this.alarmLog.length = 0;
    if (key.k === 'exit') this.sysMenu = null;
  }

  pointerUp(x, y, pid = 0) {
    if (this.slide && (this.slide.pid === pid || pid === '*')) this.slide = null;
    if (this.corner && (this.corner.pid === pid || pid === '*')) this.corner = null;
    for (const [id, p] of [...this.pressed]) {
      if (p !== pid && pid !== '*') continue;
      this.pressed.delete(id);
      // the screen may have changed while the button was held: look in every screen
      const el = this.current.elements.find((e) => e.id === id) || this.project.screens.flatMap((sc) => sc.elements).find((e) => e.id === id);
      if (el && el.type === 'button' && el.mode === 'momentary') this.write(el.bit, 0);
      this.dirty = true;
    }
  }

  /** Keypad layout inside the 800×480 screen. */
  keypadLayout() {
    const W = 330, H = 400, x0 = (HMI_W - W) / 2, y0 = (HMI_H - H) / 2;
    const keys = [['7', '8', '9', 'BS'], ['4', '5', '6', 'CLR'], ['1', '2', '3', '-'], ['0', '.', 'ESC', 'ENT']];
    const kw = 70, kh = 58, gap = 9;
    const out = [];
    keys.forEach((row, r) => row.forEach((k, c) => out.push({ k, x: x0 + 18 + c * (kw + gap), y: y0 + 120 + r * (kh + gap), w: kw, h: kh })));
    return { x: x0, y: y0, w: W, h: H, keys: out };
  }

  keypadTouch(x, y) {
    const L = this.keypadLayout();
    const kp = this.keypad;
    const key = L.keys.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    this.dirty = true;
    if (!key) { if (x < L.x || x > L.x + L.w || y < L.y || y > L.y + L.h) this.keypad = null; return; }
    kp.flash = key.k; kp.flashT = this.time;
    switch (key.k) {
      case 'BS': kp.text = kp.text.slice(0, -1); break;
      case 'CLR': kp.text = ''; break;
      case 'ESC': this.keypad = null; break;
      case '-': kp.text = kp.text.startsWith('-') ? kp.text.slice(1) : '-' + kp.text; break;
      case '.': if (kp.el.dec > 0 && !kp.text.includes('.')) kp.text += kp.text ? '.' : '0.'; break;
      case 'ENT': {
        const el = kp.el;
        const v = parseFloat(kp.text);
        if (Number.isNaN(v)) { this.keypad = null; break; }
        if (v < el.min || v > el.max) { kp.error = `Range ${el.min} ~ ${el.max}`; kp.text = ''; break; }
        this.write(el.word, Math.round(v * 10 ** (el.dec || 0)), true);
        this.keypad = null;
        break;
      }
      default: if (kp.text.replace(/[-.]/g, '').length < 7) kp.text += key.k; kp.error = null;
    }
  }
}
