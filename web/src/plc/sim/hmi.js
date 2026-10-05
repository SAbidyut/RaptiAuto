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
};

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
  }

  setProject(p) { this.project = normalizeHmi(p); if (this.screen >= this.project.screens.length) this.screen = 0; this.dirty = true; }

  get current() { return this.project.screens[this.screen] || this.project.screens[0]; }

  powerOn() { if (!this.powered) { this.powered = true; this.bootT = 1.6; this.screen = this.project.start || 0; this.keypad = null; this.dirty = true; } }
  powerOff() { if (this.powered) { this.powered = false; this.cache.clear(); this.pressed.clear(); this.keypad = null; this.dirty = true; } }

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
    const ok = this.link.ok();
    if (ok !== this.commOk) { this.commOk = ok; this.dirty = true; }
    this.pollT -= dt;
    if (this.pollT > 0) return null;
    this.pollT = 0.15;
    if (!ok) return null;
    const tags = new Map();
    for (const el of this.current.elements) for (const t of elementTags(el)) tags.set(tagKey(t.a, t.w), t);
    for (const [k, t] of tags) {
      const v = this.link.read(parseOperand(t.a), t.w);
      if (this.cache.get(k) !== v) { this.cache.set(k, v); this.dirty = true; }
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
      if (e.type === 'rect' || e.type === 'text') continue;
      if (x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h) return e;
    }
    return null;
  }

  // ------------------------------------------------------------------ touch
  pointerDown(x, y, pid = 0) {
    if (!this.powered || this.bootT > 0) return;
    if (this.keypad) { this.keypadTouch(x, y); return; }
    const el = this.hit(x, y);
    if (!el) return;
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
    }
  }

  pointerUp(x, y, pid = 0) {
    for (const [id, p] of [...this.pressed]) {
      if (p !== pid && pid !== '*') continue;
      this.pressed.delete(id);
      const el = this.current.elements.find((e) => e.id === id);
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
