// Passive parts, LEDs, buttons, switches, potentiometers, transistors, breadboards, power & meters.
import { register, fmtOhms } from './registry.js';
import { rect, circle, text, line, path, g, lead, pad, esc } from './draw.js';
import { Resistor, Diode, Switch, VSource, BJT, Mosfet } from '../sim/circuit/solver.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ------------------------------------------------------------------ resistor
const BAND = ['#111', '#8a4b1f', '#e01b1b', '#ff8a1f', '#ffd21f', '#1fae4b', '#1f5fe0', '#8a2be2', '#8a8a8a', '#f5f5f5'];
export function resistorBands(ohms) {
  if (!(ohms > 0)) return ['#111', '#111', '#111'];
  let exp = Math.floor(Math.log10(ohms)) - 1;
  let sig = Math.round(ohms / 10 ** exp);
  if (sig >= 100) { sig = Math.round(sig / 10); exp++; }
  const d1 = Math.floor(sig / 10), d2 = sig % 10;
  const mult = exp >= 0 ? BAND[Math.min(9, exp)] : exp === -1 ? '#d4af37' : '#c0c0c0';
  return [BAND[d1], BAND[d2], mult];
}

register({
  type: 'resistor', name: 'Resistor', category: 'basic', tags: ['ohm', 'current limiting'],
  description: 'Fixed resistor (¼ W). Limits current — use 220 Ω with LEDs.',
  box: [-2, -7, 42, 7],
  pins: [{ id: '1', x: 0, y: 0 }, { id: '2', x: 40, y: 0 }],
  props: [{ key: 'value', label: 'Resistance', type: 'resistance', default: 220, presets: [10, 100, 220, 330, 470, 1000, 2200, 4700, 10000, 47000, 100000, 1000000] }],
  render(p) {
    const [b1, b2, b3] = resistorBands(p.value);
    let s = line(0, 0, 40, 0, { stroke: '#b8bcc4', sw: 1.6 });
    s += path('M8 -4.4 Q8 -5.6 10.5 -5.6 H13 Q14.5 -4.2 16 -4.2 H24 Q25.5 -4.2 27 -5.6 H29.5 Q32 -5.6 32 -4.4 V4.4 Q32 5.6 29.5 5.6 H27 Q25.5 4.2 24 4.2 H16 Q14.5 4.2 13 5.6 H10.5 Q8 5.6 8 4.4Z', { fill: '#d8bf8a', stroke: '#a8905e', sw: 0.5 });
    s += rect(11.5, -5.4, 2.2, 10.8, { fill: b1 }) + rect(16, -4.2, 2.2, 8.4, { fill: b2 }) + rect(20, -4.2, 2.2, 8.4, { fill: b3 }) + rect(26.5, -5.4, 2, 10.8, { fill: '#d4af37' });
    s += path('M9 -3.5 H31', { stroke: 'rgba(255,255,255,.35)', sw: 1.2 });
    s += `<g class="smoke"></g>`;
    return s;
  },
  label: (p) => fmtOhms(p.value),
  sim: {
    create(ctx) {
      const r = ctx.add(new Resistor(ctx.node('1'), ctx.node('2'), ctx.props.value));
      const rt = {
        visual: { hot: 0, i: 0 },
        r,
        after() {
          const i = r.iAvg ?? r.i;
          const p = i * i * r.r;
          this.visual.i = i;
          this.visual.p = p;
          if (p > 0.5) ctx.warn(`Resistor ${fmtOhms(r.r)} is dissipating ${(p).toFixed(2)} W — more than its ¼ W rating. It would get very hot!`, 'pw');
          this.visual.hot = p > 0.35 ? clamp01((p - 0.35) / 1) : 0;
        },
      };
      return rt;
    },
  },
  update(el, v) {
    const sm = el.querySelector('.smoke');
    if (sm) setSmoke(sm, v.hot, 20, -8);
  },
});

/** Simple smoke puff animation (CSS animated circles). */
export function setSmoke(el, level, x, y) {
  const on = level > 0.05;
  if (el._on === on) return;
  el._on = on;
  el.innerHTML = on ? [0, 1, 2].map((i) => `<circle class="smoke-puff" cx="${x}" cy="${y}" r="${3 + i}" fill="#9aa0a6" style="animation-delay:${i * 0.45}s" filter="url(#smoke)"/>`).join('') : '';
}

// ------------------------------------------------------------------ LED
export const LED_COLORS = {
  red: { off: '#7d1616', on: '#ff3030', glow: '#ff2a2a', vf: 1.8, rd: 10 },
  green: { off: '#145c27', on: '#34ff6a', glow: '#2bff60', vf: 2.0, rd: 10 },
  blue: { off: '#173a85', on: '#4d9bff', glow: '#3b8bff', vf: 2.9, rd: 15 },
  yellow: { off: '#80720e', on: '#ffe83a', glow: '#ffe02a', vf: 2.0, rd: 10 },
  orange: { off: '#7f420c', on: '#ffa02e', glow: '#ff9020', vf: 1.9, rd: 10 },
  white: { off: '#b9bec6', on: '#ffffff', glow: '#f2f6ff', vf: 2.9, rd: 15 },
  purple: { off: '#43186f', on: '#c070ff', glow: '#b060ff', vf: 3.0, rd: 15 },
  pink: { off: '#7a1f4f', on: '#ff6ec7', glow: '#ff5ab8', vf: 3.0, rd: 15 },
};
const ledColorOptions = Object.keys(LED_COLORS).map((k) => [k, k[0].toUpperCase() + k.slice(1)]);

export function ledBrightness(i) {
  if (i <= 0.0001) return 0;
  return clamp01(Math.sqrt(i / 0.02));
}

function makeLedRuntime(ctx, d, label) {
  return {
    visual: { b: 0, burnt: false, i: 0 },
    acc: 0,
    over: 0,
    accumulate(dt) {
      const i = Math.max(0, d.iAvg ?? d.i);
      this.acc += i * dt;
      if (i > 0.06) this.over += dt; else this.over = Math.max(0, this.over - dt * 0.1);
    },
    endFrame(frameDt) {
      const i = frameDt > 0 ? this.acc / frameDt : Math.max(0, d.iAvg ?? d.i);
      this.acc = 0;
      this.visual.i = i;
      this.visual.b = d.open ? 0 : ledBrightness(i);
      this.visual.over = i > 0.03 ? clamp01((i - 0.03) / 0.05) : 0;
      if (!d.open && this.over > 60000) {
        d.open = true;
        this.visual.burnt = true;
        ctx.dirty();
        ctx.warn(`💥 ${label} burned out: ${(i * 1000).toFixed(0)} mA is far above its 20 mA limit. Always use a current-limiting resistor (e.g. 220 Ω).`, 'burn');
      }
    },
  };
}

register({
  type: 'led', name: 'LED', category: 'output', tags: ['light', 'diode', 'led'],
  description: '5 mm LED. Long leg (A) = +, short leg (C) = −. Needs a resistor!',
  box: [-5, -36, 15, 0],
  pins: [{ id: 'A', x: 0, y: 0, label: 'A (+)' }, { id: 'C', x: 10, y: 0, label: 'C (−)' }],
  props: [{ key: 'color', label: 'Color', type: 'select', options: ledColorOptions, default: 'red' }],
  render(p) {
    const c = LED_COLORS[p.color] || LED_COLORS.red;
    let s = path('M0 0 V-8 L-1.5 -10 V-14', { stroke: '#b8bcc4', sw: 1.6, lj: 'round', cap: 'round' }) + lead(10, 0, -14);
    s += `<circle class="led-glow" cx="5" cy="-24" r="17" fill="${c.glow}" opacity="0" filter="url(#glowBig)"/>`;
    s += path('M-4 -12.5 H13.2 V-16.5 H-4 Z', { fill: c.off, cls: 'led-flange', op: 0.95 });
    s += path('M-3 -16 V-29 A8 8 0 0 1 13 -29 V-16 Z', { fill: c.off, cls: 'led-body', stroke: 'rgba(0,0,0,.35)', sw: 0.5 });
    s += path('M-1 -27 A6 6 0 0 1 4 -34', { stroke: 'rgba(255,255,255,.55)', sw: 1.5, cap: 'round' });
    s += `<circle class="led-core" cx="5" cy="-22" r="4" fill="#fff" opacity="0"/>`;
    s += `<g class="smoke"></g>`;
    return s;
  },
  sim: {
    create(ctx) {
      const c = LED_COLORS[ctx.props.color] || LED_COLORS.red;
      const d = ctx.add(new Diode(ctx.node('A'), ctx.node('C'), c.vf, c.rd));
      return makeLedRuntime(ctx, d, `${ctx.props.color} LED`);
    },
  },
  update(el, v, p) {
    const c = LED_COLORS[p.color] || LED_COLORS.red;
    const b = v.b || 0;
    const body = el.querySelector('.led-body');
    if (el._b === b && el._burnt === v.burnt) return;
    el._b = b; el._burnt = v.burnt;
    if (v.burnt) {
      body.setAttribute('fill', '#2a1d14');
      el.querySelector('.led-flange').setAttribute('fill', '#2a1d14');
      el.querySelector('.led-glow').setAttribute('opacity', 0);
      el.querySelector('.led-core').setAttribute('opacity', 0);
      setSmoke(el.querySelector('.smoke'), 1, 5, -36);
      return;
    }
    body.setAttribute('fill', b > 0.02 ? mix(c.off, c.on, Math.min(1, b * 1.4)) : c.off);
    el.querySelector('.led-flange').setAttribute('fill', b > 0.02 ? mix(c.off, c.on, b) : c.off);
    el.querySelector('.led-glow').setAttribute('opacity', (b * 0.95).toFixed(3));
    el.querySelector('.led-core').setAttribute('opacity', (Math.max(0, b - 0.35) * 1.2).toFixed(3));
  },
});

export function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const gg = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bb = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (gg << 8) | bb).toString(16).slice(1);
}

// ------------------------------------------------------------------ RGB LED
register({
  type: 'rgb-led', name: 'RGB LED', category: 'output', tags: ['led', 'color', 'rgb'],
  description: '4-leg RGB LED (common cathode or common anode). Mix colours with PWM.',
  box: [-6, -38, 36, 0],
  pins: [{ id: 'R', x: 0, y: 0 }, { id: 'COM', x: 10, y: 0 }, { id: 'G', x: 20, y: 0 }, { id: 'B', x: 30, y: 0 }],
  props: [{ key: 'common', label: 'Type', type: 'select', options: [['cathode', 'Common cathode (−)'], ['anode', 'Common anode (+)']], default: 'cathode' }],
  render() {
    let s = lead(0, 0, -14) + lead(10, 0, -16) + lead(20, 0, -14) + lead(30, 0, -14);
    s += `<circle class="led-glow" cx="15" cy="-26" r="20" fill="#fff" opacity="0" filter="url(#glowBig)"/>`;
    s += path('M2 -14 H28 V-18 H2Z', { fill: '#d9dde3', op: 0.9 });
    s += path('M3 -18 V-30 A12 9 0 0 1 27 -30 V-18Z', { fill: '#e8ecf2', cls: 'led-body', stroke: 'rgba(0,0,0,.25)', sw: 0.5, op: 0.95 });
    s += path('M6 -29 A9 7 0 0 1 13 -35', { stroke: 'rgba(255,255,255,.8)', sw: 1.5, cap: 'round' });
    s += text(0, 6, 'R', { size: 4.5, fill: '#ff6b6b' }) + text(20, 6, 'G', { size: 4.5, fill: '#5dff86' }) + text(30, 6, 'B', { size: 4.5, fill: '#6aa8ff' });
    return s;
  },
  sim: {
    create(ctx) {
      const anode = ctx.props.common === 'anode';
      const com = ctx.node('COM');
      const mk = (pin, vf, rd) => ctx.add(anode ? new Diode(com, ctx.node(pin), vf, rd) : new Diode(ctx.node(pin), com, vf, rd));
      const ds = [mk('R', 1.9, 12), mk('G', 2.6, 15), mk('B', 2.8, 15)];
      return {
        visual: { r: 0, g: 0, b: 0 },
        acc: [0, 0, 0],
        accumulate(dt) { ds.forEach((d, i) => { this.acc[i] += Math.max(0, d.iAvg ?? d.i) * dt; }); },
        endFrame(fd) {
          const v = ds.map((d, i) => (fd > 0 ? this.acc[i] / fd : Math.max(0, d.iAvg ?? d.i)));
          this.acc = [0, 0, 0];
          this.visual.r = ledBrightness(v[0]); this.visual.g = ledBrightness(v[1]); this.visual.b = ledBrightness(v[2]);
          if (v.some((x) => x > 0.08)) ctx.warn('RGB LED channel current is too high — add a resistor to every colour leg.', 'rgbover');
        },
      };
    },
  },
  update(el, v) {
    const key = `${v.r.toFixed(2)}${v.g.toFixed(2)}${v.b.toFixed(2)}`;
    if (el._k === key) return;
    el._k = key;
    const m = Math.max(v.r, v.g, v.b);
    const col = `rgb(${Math.round(255 * Math.min(1, v.r * 1.2))},${Math.round(255 * Math.min(1, v.g * 1.2))},${Math.round(255 * Math.min(1, v.b * 1.2))})`;
    el.querySelector('.led-body').setAttribute('fill', m > 0.02 ? col : '#e8ecf2');
    const glow = el.querySelector('.led-glow');
    glow.setAttribute('fill', col);
    glow.setAttribute('opacity', (m * 0.95).toFixed(3));
  },
});

// ------------------------------------------------------------------ pushbutton
const CAPS = { red: '#d93a3a', green: '#2fb14f', blue: '#2f6fd9', yellow: '#f2c230', black: '#2a2a2e', white: '#f2f2f2' };
register({
  type: 'pushbutton', name: 'Push Button', category: 'input', tags: ['button', 'switch', 'tactile', 'momentary'],
  description: '6 mm tactile button. Pins 1.l–1.r and 2.l–2.r are always connected; pressing joins 1 and 2.',
  box: [-4, 1, 24, 29],
  pins: [{ id: '1.l', x: 0, y: 0 }, { id: '1.r', x: 20, y: 0 }, { id: '2.l', x: 0, y: 30 }, { id: '2.r', x: 20, y: 30 }],
  internal: [['1.l', '1.r'], ['2.l', '2.r']],
  props: [{ key: 'color', label: 'Cap colour', type: 'select', options: Object.keys(CAPS).map((k) => [k, k[0].toUpperCase() + k.slice(1)]), default: 'red' }],
  interact: 'press',
  render(p) {
    let s = '';
    for (const [x, y0, y1] of [[0, 0, 4], [20, 0, 4], [0, 26, 30], [20, 26, 30]]) s += line(x, y0, x, y1, { stroke: '#b8bcc4', sw: 1.6 });
    s += rect(-3, 3, 26, 24, { fill: 'url(#blackPlastic)', rx: 2 });
    s += circle(0, 6, 1.3, { fill: '#555' }) + circle(20, 6, 1.3, { fill: '#555' }) + circle(0, 24, 1.3, { fill: '#555' }) + circle(20, 24, 1.3, { fill: '#555' });
    s += `<g class="btn-cap">${circle(10, 15, 8, { fill: CAPS[p.color] || CAPS.red, stroke: 'rgba(0,0,0,.4)', sw: 0.8 })}${circle(8, 13, 3.5, { fill: 'rgba(255,255,255,.28)' })}</g>`;
    return s;
  },
  sim: {
    create(ctx) {
      const sw = ctx.add(new Switch(ctx.node('1.l'), ctx.node('2.l'), false));
      return {
        visual: { pressed: false },
        input(key, val) { if (key === 'press') { sw.closed = !!val; this.visual.pressed = !!val; ctx.dirty(); } },
      };
    },
  },
  update(el, v) {
    const cap = el.querySelector('.btn-cap');
    if (cap._p === v.pressed) return;
    cap._p = v.pressed;
    cap.setAttribute('transform', v.pressed ? 'translate(10 15) scale(0.86) translate(-10 -15)' : '');
    cap.style.filter = v.pressed ? 'brightness(0.8)' : '';
  },
});

// ------------------------------------------------------------------ slide switch (SPDT)
register({
  type: 'slide-switch', name: 'Slide Switch', category: 'input', tags: ['switch', 'spdt', 'toggle'],
  description: 'SPDT slide switch: middle pin connects to pin 1 or pin 3.',
  box: [-5, -16, 25, 0],
  pins: [{ id: '1', x: 0, y: 0 }, { id: '2', x: 10, y: 0 }, { id: '3', x: 20, y: 0 }],
  interact: 'toggle',
  props: [{ key: 'on', label: 'Initial position', type: 'select', options: [['0', 'Left (1–2)'], ['1', 'Right (2–3)']], default: '0' }],
  render() {
    let s = lead(0, 0, -4) + lead(10, 0, -4) + lead(20, 0, -4);
    s += rect(-5, -16, 30, 12, { fill: '#2d6fd6', rx: 1.5 }) + rect(0, -13, 20, 6, { fill: '#173c78', rx: 1 });
    s += `<rect class="sw-knob" x="1" y="-14.5" width="8" height="9" rx="1" fill="#e8e8e8" stroke="#999" stroke-width="0.5"/>`;
    return s;
  },
  sim: {
    create(ctx) {
      const a = ctx.add(new Switch(ctx.node('2'), ctx.node('1'), false));
      const b = ctx.add(new Switch(ctx.node('2'), ctx.node('3'), false));
      const rt = {
        visual: { on: ctx.props.on === '1' },
        set(on) { this.visual.on = on; a.closed = !on; b.closed = on; ctx.dirty(); },
        input(key) { if (key === 'toggle') this.set(!this.visual.on); },
      };
      rt.set(rt.visual.on);
      return rt;
    },
  },
  update(el, v) {
    el.querySelector('.sw-knob').setAttribute('x', v.on ? 11 : 1);
  },
});

// ------------------------------------------------------------------ toggle switch (SPST) / tilt / reed
register({
  type: 'toggle-switch', name: 'Toggle Switch', category: 'input', tags: ['switch', 'spst', 'on off'],
  description: 'Simple ON/OFF switch (2 pins).',
  box: [-6, -26, 16, 0],
  pins: [{ id: '1', x: 0, y: 0 }, { id: '2', x: 10, y: 0 }],
  interact: 'toggle',
  render() {
    let s = lead(0, 0, -6) + lead(10, 0, -6);
    s += rect(-6, -16, 22, 10, { fill: '#2b2c30', rx: 2 }) + rect(-1, -19, 12, 4, { fill: 'url(#silver)', rx: 1 });
    s += `<g class="tg-lever"><path d="M5 -17 L1 -27" stroke="#d9dce1" stroke-width="3" stroke-linecap="round"/></g>`;
    s += text(5, -10.5, 'ON/OFF', { size: 3, fill: '#bbb' });
    return s;
  },
  sim: {
    create(ctx) {
      const sw = ctx.add(new Switch(ctx.node('1'), ctx.node('2'), false));
      return { visual: { on: false }, input(k) { if (k === 'toggle') { this.visual.on = !this.visual.on; sw.closed = this.visual.on; ctx.dirty(); } } };
    },
  },
  update(el, v) { el.querySelector('.tg-lever').setAttribute('transform', v.on ? 'translate(10 0) scale(-1 1) translate(-10 0) translate(0 0)' : ''); },
});

// ------------------------------------------------------------------ potentiometer
register({
  type: 'potentiometer', name: 'Potentiometer', category: 'input', tags: ['pot', 'knob', 'variable resistor', 'analog'],
  description: 'Rotary potentiometer. Connect GND, VCC and read SIG with analogRead().',
  box: [-9, -34, 29, 0],
  pins: [{ id: 'GND', x: 0, y: 0 }, { id: 'SIG', x: 10, y: 0 }, { id: 'VCC', x: 20, y: 0 }],
  props: [{ key: 'value', label: 'Resistance', type: 'resistance', default: 10000, presets: [1000, 5000, 10000, 50000, 100000] }],
  interact: 'knob',
  controls: [{ key: 'pos', label: 'Position', min: 0, max: 100, step: 1, unit: '%', default: 50 }],
  render() {
    let s = lead(0, 0, -6) + lead(10, 0, -6) + lead(20, 0, -6);
    s += rect(-9, -30, 38, 25, { fill: '#2f5fbf', rx: 2.5, stroke: '#1b3a7a', sw: 0.6 });
    s += circle(10, -18, 12.5, { fill: '#c8ccd2', stroke: '#8d939c', sw: 0.6 });
    s += `<g class="pot-knob">${circle(10, -18, 9.5, { fill: 'url(#steel)', stroke: '#6b7079', sw: 0.6 })}${line(10, -18, 10, -26.5, { stroke: '#222', sw: 2 })}</g>`;
    s += text(0, 4.5, 'GND', { size: 3 }) + text(10, 4.5, 'SIG', { size: 3 }) + text(20, 4.5, 'VCC', { size: 3 });
    return s;
  },
  sim: {
    create(ctx) {
      const R = ctx.props.value;
      const sig = ctx.node('SIG');
      const r1 = ctx.add(new Resistor(ctx.node('GND'), sig, R * 0.5));
      const r2 = ctx.add(new Resistor(sig, ctx.node('VCC'), R * 0.5));
      const rt = {
        visual: { pos: 0.5 },
        values: { pos: 50 },
        set(pos) {
          pos = clamp01(pos);
          this.visual.pos = pos;
          this.values.pos = Math.round(pos * 100);
          r1.setR(Math.max(1, R * pos));
          r2.setR(Math.max(1, R * (1 - pos)));
          ctx.dirty();
        },
        input(key, val) { if (key === 'pos') this.set(val / 100); if (key === 'knob') this.set(val); },
      };
      rt.set(0.5);
      return rt;
    },
  },
  update(el, v) {
    el.querySelector('.pot-knob').setAttribute('transform', `rotate(${(-135 + v.pos * 270).toFixed(1)} 10 -18)`);
  },
});

register({
  type: 'slide-pot', name: 'Slide Potentiometer', category: 'input', tags: ['fader', 'slider', 'pot', 'analog'],
  description: 'Linear slide potentiometer (10 kΩ).',
  box: [-10, -30, 70, 0],
  pins: [{ id: 'GND', x: 0, y: 0 }, { id: 'SIG', x: 10, y: 0 }, { id: 'VCC', x: 60, y: 0 }],
  interact: 'slider',
  controls: [{ key: 'pos', label: 'Position', min: 0, max: 100, step: 1, unit: '%', default: 50 }],
  render() {
    let s = lead(0, 0, -6) + lead(10, 0, -6) + lead(60, 0, -6);
    s += rect(-10, -26, 80, 20, { fill: '#232428', rx: 2 }) + rect(-2, -17.5, 64, 3, { fill: '#0c0c0e', rx: 1.5 });
    s += `<g class="sp-knob"><rect x="-6" y="-29" width="12" height="26" rx="2" fill="url(#steel)" stroke="#555" stroke-width="0.6"/><line x1="-4" y1="-16" x2="4" y2="-16" stroke="#222" stroke-width="1.2"/></g>`;
    return s;
  },
  sim: {
    create(ctx) {
      const R = 10000, sig = ctx.node('SIG');
      const r1 = ctx.add(new Resistor(ctx.node('GND'), sig, R / 2));
      const r2 = ctx.add(new Resistor(sig, ctx.node('VCC'), R / 2));
      const rt = {
        visual: { pos: 0.5 }, values: { pos: 50 },
        set(pos) { pos = clamp01(pos); this.visual.pos = pos; this.values.pos = Math.round(pos * 100); r1.setR(Math.max(1, R * pos)); r2.setR(Math.max(1, R * (1 - pos))); ctx.dirty(); },
        input(key, val) { if (key === 'pos') this.set(val / 100); if (key === 'knob') this.set(val); },
      };
      rt.set(0.5);
      return rt;
    },
  },
  update(el, v) { el.querySelector('.sp-knob').setAttribute('transform', `translate(${(v.pos * 60).toFixed(1)} 0)`); },
});

// ------------------------------------------------------------------ capacitor / diode
register({
  type: 'capacitor', name: 'Capacitor (ceramic)', category: 'basic', tags: ['capacitor', 'ceramic', 'filter'],
  description: 'Ceramic disc capacitor (blocks DC).',
  box: [-4, -22, 14, 0],
  pins: [{ id: '1', x: 0, y: 0 }, { id: '2', x: 10, y: 0 }],
  props: [{ key: 'value', label: 'Capacitance', type: 'text', default: '100nF' }],
  render(p) {
    let s = lead(0, 0, -8) + lead(10, 0, -8);
    s += `<ellipse cx="5" cy="-14" rx="8" ry="7.5" fill="#e3a72f" stroke="#a8761c" stroke-width="0.6"/>`;
    s += text(5, -14, String(p.value).replace('nF', '').slice(0, 4), { size: 3.6, fill: '#5a3a07' });
    return s;
  },
});

register({
  type: 'capacitor-elec', name: 'Electrolytic Capacitor', category: 'basic', tags: ['capacitor', 'electrolytic', 'polarized'],
  description: 'Polarised electrolytic capacitor (blocks DC).',
  box: [-6, -36, 16, 0],
  pins: [{ id: '-', x: 0, y: 0, label: '−' }, { id: '+', x: 10, y: 0, label: '+' }],
  props: [{ key: 'value', label: 'Capacitance', type: 'text', default: '100µF' }],
  render() {
    let s = lead(0, 0, -8) + lead(10, 0, -8);
    s += rect(-5, -36, 20, 28, { fill: '#1b2f6b', rx: 3 }) + rect(-5, -36, 6, 28, { fill: '#c4cbe0', rx: 2, op: 0.9 });
    s += text(-2, -22, '−', { size: 6, fill: '#1b2f6b', weight: 800 }) + rect(-5, -36, 20, 3, { fill: '#9aa3b9', rx: 1.5 });
    return s;
  },
});

register({
  type: 'diode', name: 'Diode 1N4007', category: 'basic', tags: ['diode', 'rectifier', 'flyback'],
  description: 'Rectifier diode. Current flows from A (anode) to K (cathode, stripe).',
  box: [-2, -6, 42, 6],
  pins: [{ id: 'A', x: 0, y: 0 }, { id: 'K', x: 40, y: 0 }],
  render() {
    return line(0, 0, 40, 0, { stroke: '#b8bcc4', sw: 1.6 }) + rect(9, -5, 22, 10, { fill: '#1b1b1d', rx: 2 }) + rect(26, -5, 3, 10, { fill: '#c9ccd1' }) + text(17, 0, '4007', { size: 3, fill: '#888' });
  },
  sim: { create(ctx) { ctx.add(new Diode(ctx.node('A'), ctx.node('K'), 0.65, 0.05)); return null; } },
});

register({
  type: 'zener', name: 'Zener Diode 5.1V', category: 'basic', tags: ['zener', 'regulator', 'diode'],
  description: 'Zener diode (5.1 V) for simple voltage regulation.',
  box: [-2, -6, 42, 6],
  pins: [{ id: 'A', x: 0, y: 0 }, { id: 'K', x: 40, y: 0 }],
  render() {
    return line(0, 0, 40, 0, { stroke: '#b8bcc4', sw: 1.6 }) + rect(11, -4, 18, 8, { fill: '#d37b2e', rx: 3, op: 0.9 }) + rect(24, -4, 2.5, 8, { fill: '#222' });
  },
  sim: { create(ctx) { ctx.add(new Diode(ctx.node('A'), ctx.node('K'), 0.65, 0.1, { zener: 5.1 })); return null; } },
});

// ------------------------------------------------------------------ transistors
function to92(label, pins) {
  let s = pins.map((p) => lead(p.x, 0, -8)).join('');
  s += path('M-4 -8 H24 V-20 A14 12 0 0 0 -4 -20 Z', { fill: '#1d1d20' });
  s += text(10, -14, label, { size: 3.4, fill: '#bbb', font: 'monospace' });
  s += pins.map((p) => text(p.x, 5, p.id, { size: 4, fill: '#ddd' })).join('');
  return s;
}

register({
  type: 'npn', name: 'NPN Transistor 2N2222', category: 'basic', tags: ['transistor', 'bjt', 'npn', 'switch', 'amplifier'],
  description: 'NPN BJT (E-B-C). Use as a switch with a 1 kΩ base resistor.',
  box: [-5, -28, 25, 6],
  pins: [{ id: 'E', x: 0, y: 0 }, { id: 'B', x: 10, y: 0 }, { id: 'C', x: 20, y: 0 }],
  render() { return to92('2N2222', this.pins); },
  sim: {
    create(ctx) {
      const q = ctx.add(new BJT(ctx.node('B'), ctx.node('C'), ctx.node('E'), { beta: 150 }));
      return { visual: {}, after() { if (q.ic > 0.8) ctx.warn(`Transistor collector current ${(q.ic).toFixed(2)} A exceeds the 2N2222's 800 mA limit`, 'ic'); } };
    },
  },
});

register({
  type: 'pnp', name: 'PNP Transistor 2N2907', category: 'basic', tags: ['transistor', 'bjt', 'pnp'],
  description: 'PNP BJT (E-B-C) for high-side switching.',
  box: [-5, -28, 25, 6],
  pins: [{ id: 'E', x: 0, y: 0 }, { id: 'B', x: 10, y: 0 }, { id: 'C', x: 20, y: 0 }],
  render() { return to92('2N2907', this.pins); },
  sim: { create(ctx) { ctx.add(new BJT(ctx.node('B'), ctx.node('C'), ctx.node('E'), { beta: 120, pnp: true })); return null; } },
});

register({
  type: 'mosfet', name: 'N-MOSFET IRF520', category: 'basic', tags: ['mosfet', 'transistor', 'power switch'],
  description: 'N-channel power MOSFET (G-D-S). Switch motors / LED strips.',
  box: [-7, -48, 27, 6],
  pins: [{ id: 'G', x: 0, y: 0 }, { id: 'D', x: 10, y: 0 }, { id: 'S', x: 20, y: 0 }],
  props: [{ key: 'model', label: 'Model', type: 'select', options: [['IRF520', 'IRF520 (Vth 3V)'], ['IRLZ44N', 'IRLZ44N (logic level)'], ['2N7000', '2N7000 (small)']], default: 'IRF520' }],
  render(p) {
    let s = [0, 10, 20].map((x) => lead(x, 0, -10)).join('');
    s += rect(-7, -48, 34, 18, { fill: 'url(#silver)', rx: 1 }) + circle(10, -41, 3.5, { fill: 'var(--canvas-bg,#0b1020)' });
    s += rect(-7, -31, 34, 21, { fill: '#1c1c1f', rx: 1 }) + text(10, -21, p.model, { size: 3.6, fill: '#bbb', font: 'monospace' });
    s += ['G', 'D', 'S'].map((t, i) => text(i * 10, 5, t, { size: 4, fill: '#ddd' })).join('');
    return s;
  },
  sim: {
    create(ctx) {
      const m = { IRF520: { vth: 3.2, ron: 0.27, vfull: 10 }, IRLZ44N: { vth: 1.5, ron: 0.025, vfull: 5 }, '2N7000': { vth: 2.1, ron: 2, vfull: 10 } }[ctx.props.model] || {};
      ctx.add(new Mosfet(ctx.node('G'), ctx.node('D'), ctx.node('S'), m));
      return null;
    },
  },
});

// ------------------------------------------------------------------ LDR (bare)
register({
  type: 'ldr', name: 'Photoresistor (LDR)', category: 'sensors', tags: ['light', 'ldr', 'photoresistor', 'gl5528'],
  description: 'Light dependent resistor: ~1 kΩ in bright light, ~1 MΩ in the dark. Use with a 10 kΩ resistor as a voltage divider.',
  box: [-6, -26, 16, 0],
  pins: [{ id: '1', x: 0, y: 0 }, { id: '2', x: 10, y: 0 }],
  controls: [{ key: 'lux', label: 'Light', min: 0, max: 2000, step: 1, unit: 'lux', default: 300 }],
  render() {
    let s = lead(0, 0, -10) + lead(10, 0, -10);
    s += circle(5, -17, 9, { fill: '#e9d3a5', stroke: '#b89a66', sw: 0.6 });
    s += path('M-1 -21 H11 M-1 -21 Q-3 -19 -1 -17 H11 Q13 -15 11 -13 H-1', { stroke: '#c0392b', sw: 1.2 });
    s += `<circle class="ldr-glow" cx="5" cy="-17" r="13" fill="#fff6c2" opacity="0.2" filter="url(#glow)"/>`;
    return s;
  },
  sim: {
    create(ctx) {
      const r = ctx.add(new Resistor(ctx.node('1'), ctx.node('2'), 10000));
      const rt = {
        visual: { lux: 300 }, values: { lux: 300 },
        set(lux) { this.values.lux = lux; this.visual.lux = lux; r.setR(Math.min(2e6, 6000 * Math.pow(Math.max(0.05, lux) / 100, -0.75))); ctx.dirty(); },
        input(key, val) { if (key === 'lux') this.set(val); },
      };
      rt.set(300);
      return rt;
    },
  },
  update(el, v) { el.querySelector('.ldr-glow').setAttribute('opacity', Math.min(0.9, v.lux / 1500).toFixed(2)); },
});

// ------------------------------------------------------------------ breadboards
function breadboard(cols, rails) {
  const pins = [];
  const rows = 'abcdefghij';
  for (let c = 1; c <= cols; c++) {
    for (let r = 0; r < 10; r++) {
      const y = r < 5 ? r * 10 : r * 10 + 20;
      pins.push({ id: rows[r] + c, x: (c - 1) * 10, y, socket: true });
    }
  }
  const railHoles = [];
  if (rails) {
    for (let i = 0; i < cols - 4; i++) if (i % 6 !== 5) railHoles.push(20 + i * 10);
    railHoles.forEach((x, k) => {
      pins.push({ id: 'tp.' + (k + 1), x, y: -40, socket: true });
      pins.push({ id: 'tn.' + (k + 1), x, y: -30, socket: true });
      pins.push({ id: 'bp.' + (k + 1), x, y: 140, socket: true });
      pins.push({ id: 'bn.' + (k + 1), x, y: 150, socket: true });
    });
  }
  const internal = [];
  for (let c = 1; c <= cols; c++) {
    internal.push(['a', 'b', 'c', 'd', 'e'].map((r) => r + c));
    internal.push(['f', 'g', 'h', 'i', 'j'].map((r) => r + c));
  }
  if (rails) for (const r of ['tp', 'tn', 'bp', 'bn']) internal.push(railHoles.map((_, k) => r + '.' + (k + 1)));
  const w = (cols - 1) * 10;
  const y0 = rails ? -55 : -14, y1 = rails ? 165 : 124;
  const render = () => {
    let s = `<g filter="url(#softShadow)">${rect(-15, y0, w + 30, y1 - y0, { fill: '#f3f2ee', rx: 5, stroke: '#d6d4cc', sw: 0.8 })}</g>`;
    s += rect(-15, 50, w + 30, 10, { fill: '#e2e0d8' }) + rect(-15, 53.5, w + 30, 3, { fill: '#cfccc2' });
    s += rect(-5, -5, w + 10, 50, { fill: 'url(#bbHoles)' }) + rect(-5, 65, w + 10, 50, { fill: 'url(#bbHoles)' });
    for (let c = 1; c <= cols; c++) {
      if (c === 1 || c % 5 === 0) {
        s += text((c - 1) * 10, -10.5, String(c), { size: 4, fill: '#8e8b80' });
        s += text((c - 1) * 10, 120.5, String(c), { size: 4, fill: '#8e8b80' });
      }
    }
    for (let r = 0; r < 10; r++) {
      const y = r < 5 ? r * 10 : r * 10 + 20;
      s += text(-10, y, rows[r], { size: 4, fill: '#8e8b80' }) + text(w + 10, y, rows[r], { size: 4, fill: '#8e8b80' });
    }
    if (rails) {
      s += rect(-12, -50, w + 24, 26, { fill: '#efede6', rx: 2 }) + rect(-12, 134, w + 24, 26, { fill: '#efede6', rx: 2 });
      s += line(-8, -47, w + 8, -47, { stroke: '#e0413a', sw: 1 }) + line(-8, -23, w + 8, -23, { stroke: '#2f6fd9', sw: 1 });
      s += line(-8, 133, w + 8, 133, { stroke: '#e0413a', sw: 1 }) + line(-8, 157, w + 8, 157, { stroke: '#2f6fd9', sw: 1 });
      s += text(-8, -40, '+', { size: 6, fill: '#e0413a', weight: 800 }) + text(-8, -30, '−', { size: 6, fill: '#2f6fd9', weight: 800 });
      s += text(-8, 140, '+', { size: 6, fill: '#e0413a', weight: 800 }) + text(-8, 150, '−', { size: 6, fill: '#2f6fd9', weight: 800 });
      for (const x of railHoles) for (const y of [-40, -30, 140, 150]) s += rect(x - 1.8, y - 1.8, 3.6, 3.6, { fill: '#2b2d31', rx: 0.6 });
    }
    return s;
  };
  return { pins, internal, render, box: [-15, y0, w + 15, y1] };
}

for (const [type, name, cols, rails, desc] of [
  ['breadboard', 'Breadboard (full, 830)', 63, true, '830 tie-points: 63 columns, 4 power rails. Each column of 5 holes (a–e / f–j) is connected.'],
  ['breadboard-half', 'Breadboard (half, 400)', 30, true, '400 tie-points with power rails.'],
  ['breadboard-mini', 'Breadboard (mini, 170)', 17, false, '170 tie-points, no rails.'],
]) {
  const bb = breadboard(cols, rails);
  register({
    type, name, category: 'power', tags: ['breadboard', 'prototype', 'protoboard'], description: desc,
    box: bb.box, pins: bb.pins, internal: bb.internal, connectorOnly: true, socket: true, layer: -1,
    render: bb.render,
  });
}

// ------------------------------------------------------------------ power
register({
  type: 'battery-9v', name: '9V Battery', category: 'power', tags: ['battery', 'power', '9v'],
  description: '9 V PP3 battery (internal resistance ~1.5 Ω).',
  box: [-16, -6, 36, 100],
  pins: [{ id: '-', x: 0, y: 0, label: '−' }, { id: '+', x: 20, y: 0, label: '+' }],
  props: [{ key: 'voltage', label: 'Voltage', type: 'number', default: 9, min: 1, max: 24, unit: 'V' }],
  render(p) {
    let s = `<g filter="url(#softShadow)">${rect(-16, 6, 52, 94, { fill: '#202124', rx: 3 })}</g>`;
    s += rect(-16, 30, 52, 50, { fill: '#e8b923' }) + text(10, 48, p.voltage + 'V', { size: 14, fill: '#202124', weight: 800 }) + text(10, 64, 'BATTERY', { size: 5, fill: '#202124', weight: 700 });
    s += circle(0, 2, 5, { fill: 'url(#silver)', stroke: '#777', sw: 0.6 }) + path('M-4 -2 h8 v8 h-8z', { fill: 'url(#silver)', stroke: '#777', sw: 0.5 });
    s += circle(20, 2, 4.5, { fill: 'url(#silver)', stroke: '#777', sw: 0.6 });
    s += text(0, 14, '−', { size: 7, fill: '#ccc', weight: 800 }) + text(20, 14, '+', { size: 7, fill: '#ccc', weight: 800 });
    return s;
  },
  sim: {
    create(ctx) {
      const vs = ctx.add(new VSource(ctx.node('+'), ctx.node('-'), ctx.props.voltage, 1.5));
      return { visual: {}, after() { const i = vs.iAvg ?? vs.i; if (i > 2) ctx.warn(`Battery short circuit! ${i.toFixed(1)} A flowing — check the wiring.`, 'short'); } };
    },
  },
});

register({
  type: 'battery-aa4', name: 'Battery Pack 4×AA (6V)', category: 'power', tags: ['battery', 'aa', 'pack'],
  description: '4 × AA battery holder (6 V).',
  box: [-12, -4, 92, 64],
  pins: [{ id: '-', x: 0, y: 0, label: '−' }, { id: '+', x: 10, y: 0, label: '+' }],
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-12, 6, 104, 58, { fill: '#1e1f22', rx: 3 })}</g>`;
    for (let i = 0; i < 4; i++) {
      const y = 10 + i * 13.5;
      s += rect(-6, y, 92, 11, { fill: i % 2 ? '#3a8b3a' : '#2f7ad1', rx: 4 }) + rect(80, y + 3, 6, 5, { fill: '#c9ccd1' }) + text(38, y + 5.5, 'AA 1.5V', { size: 4.5, fill: '#fff', weight: 700 });
    }
    s += path('M0 0 V8', { stroke: '#222', sw: 2 }) + path('M10 0 V8', { stroke: '#d32f2f', sw: 2 });
    return s;
  },
  sim: { create(ctx) { ctx.add(new VSource(ctx.node('+'), ctx.node('-'), 6, 0.6)); return null; } },
});

register({
  type: 'power-supply', name: 'DC Power Supply', category: 'power', tags: ['power', 'supply', 'adapter', '12v', '5v'],
  description: 'Adjustable bench power supply.',
  box: [-20, -60, 40, 4],
  pins: [{ id: '-', x: 0, y: 0, label: '−' }, { id: '+', x: 20, y: 0, label: '+' }],
  props: [{ key: 'voltage', label: 'Voltage', type: 'number', default: 12, min: 0, max: 30, unit: 'V' }],
  render(p) {
    let s = `<g filter="url(#softShadow)">${rect(-20, -60, 60, 54, { fill: '#2b3a55', rx: 4 })}</g>`;
    s += rect(-14, -54, 48, 18, { fill: '#0c1a0f', rx: 2 }) + text(10, -45, `${Number(p.voltage).toFixed(1)}V`, { size: 9, fill: '#53ff7a', font: 'monospace', weight: 700 });
    s += circle(0, -18, 6, { fill: '#111', stroke: '#555' }) + circle(20, -18, 6, { fill: '#b71c1c', stroke: '#555' });
    s += lead(0, 0, -12, { color: '#222' }) + lead(20, 0, -12, { color: '#d32f2f' });
    return s;
  },
  sim: { create(ctx) { ctx.add(new VSource(ctx.node('+'), ctx.node('-'), +ctx.props.voltage, 0.05)); return null; } },
});

// ------------------------------------------------------------------ meters
register({
  type: 'voltmeter', name: 'Multimeter (Volts)', category: 'meters', tags: ['voltmeter', 'multimeter', 'measure', 'dmm'],
  description: 'Digital voltmeter: shows the voltage between V (red) and COM (black).',
  box: [-22, -96, 42, 2],
  pins: [{ id: 'COM', x: 0, y: 0, label: 'COM' }, { id: 'V', x: 20, y: 0, label: 'V' }],
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-22, -96, 64, 90, { fill: '#f2c230', rx: 7, stroke: '#b38b10', sw: 1 })}</g>`;
    s += rect(-16, -90, 52, 24, { fill: '#2c2f33', rx: 3 }) + rect(-13, -87, 46, 18, { fill: '#a9c2a0', rx: 2 });
    s += `<text class="dmm-val" x="31" y="-77" font-size="11" text-anchor="end" font-family="monospace" font-weight="700" fill="#1d2a1a" dominant-baseline="middle">0.00</text>`;
    s += text(-11, -72, 'V DC', { size: 4, fill: '#1d2a1a', anchor: 'start' });
    s += circle(10, -44, 13, { fill: '#2c2f33' }) + line(10, -44, 10, -55, { stroke: '#f2c230', sw: 2.5 });
    s += circle(0, -14, 4.2, { fill: '#111', stroke: '#444' }) + circle(20, -14, 4.2, { fill: '#c62828', stroke: '#444' });
    s += lead(0, 0, -10, { color: '#222' }) + lead(20, 0, -10, { color: '#d32f2f' });
    return s;
  },
  sim: {
    create(ctx) {
      const a = ctx.node('V'), b = ctx.node('COM');
      ctx.add(new Resistor(a, b, 10e6));
      return { visual: { v: 0 }, after() { this.visual.v = ctx.v(a) - ctx.v(b); } };
    },
  },
  update(el, v) {
    const t = el.querySelector('.dmm-val');
    const val = Math.abs(v.v) < 0.005 ? '0.00' : v.v.toFixed(Math.abs(v.v) >= 10 ? 1 : 2);
    if (t.textContent !== val) t.textContent = val;
  },
});

register({
  type: 'ammeter', name: 'Ammeter (mA)', category: 'meters', tags: ['ammeter', 'current', 'measure'],
  description: 'Measures current flowing in at + and out at − (connect in series).',
  box: [-22, -70, 42, 2],
  pins: [{ id: '+', x: 0, y: 0 }, { id: '-', x: 20, y: 0, label: '−' }],
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-22, -70, 64, 64, { fill: '#2f6fd9', rx: 7 })}</g>`;
    s += rect(-16, -64, 52, 26, { fill: '#2c2f33', rx: 3 }) + rect(-13, -61, 46, 20, { fill: '#a9c2a0', rx: 2 });
    s += `<text class="am-val" x="31" y="-51" font-size="11" text-anchor="end" font-family="monospace" font-weight="700" fill="#1d2a1a" dominant-baseline="middle">0.0</text>`;
    s += text(10, -30, 'mA', { size: 7, weight: 700 });
    s += lead(0, 0, -10, { color: '#d32f2f' }) + lead(20, 0, -10, { color: '#222' });
    return s;
  },
  sim: {
    create(ctx) {
      const r = ctx.add(new Resistor(ctx.node('+'), ctx.node('-'), 0.01));
      return { visual: { i: 0 }, after() { this.visual.i = (r.iAvg ?? r.i) * 1000; } };
    },
  },
  update(el, v) {
    const t = el.querySelector('.am-val');
    const val = Math.abs(v.i) >= 100 ? v.i.toFixed(0) : v.i.toFixed(1);
    if (t.textContent !== val) t.textContent = val;
  },
});

// ------------------------------------------------------------------ lamp
register({
  type: 'lamp', name: 'Light Bulb', category: 'output', tags: ['lamp', 'bulb', 'light', 'incandescent'],
  description: 'Incandescent bulb (rated 12 V / 2 W). Brightness follows the power it receives.',
  box: [-16, -58, 36, 0],
  pins: [{ id: '1', x: 0, y: 0 }, { id: '2', x: 20, y: 0 }],
  props: [{ key: 'rating', label: 'Rating', type: 'select', options: [['5', '5 V / 1 W'], ['12', '12 V / 2 W'], ['230', '230 V AC / 40 W']], default: '12' }],
  render() {
    let s = lead(0, 0, -12) + lead(20, 0, -12);
    s += `<circle class="lamp-glow" cx="10" cy="-36" r="26" fill="#ffd36b" opacity="0" filter="url(#glowBig)"/>`;
    s += rect(1, -20, 18, 9, { fill: 'url(#silver)', rx: 1.5 }) + path('M1 -17 H19 M1 -14 H19', { stroke: '#8d939c', sw: 0.8 });
    s += circle(10, -38, 17, { fill: '#fff8e1', op: 0.35, stroke: '#d9cfae', sw: 0.8, cls: 'lamp-glass' });
    s += path('M5 -21 L6 -36 Q8 -42 10 -36 Q12 -42 14 -36 L15 -21', { stroke: '#7a6a4a', sw: 0.8, cls: 'lamp-fil' });
    return s;
  },
  sim: {
    create(ctx) {
      const rating = { 5: [5, 1], 12: [12, 2], 230: [230, 40] }[ctx.props.rating] || [12, 2];
      const R = rating[0] ** 2 / rating[1];
      const r = ctx.add(new Resistor(ctx.node('1'), ctx.node('2'), R));
      return {
        visual: { b: 0 }, acc: 0,
        accumulate(dt) { const i = r.iAvg ?? r.i; this.acc += i * i * R * dt; },
        endFrame(fd) { const p = fd > 0 ? this.acc / fd : 0; this.acc = 0; this.visual.b = clamp01(Math.sqrt(p / rating[1])); },
      };
    },
  },
  update(el, v) {
    const b = v.b;
    if (el._b === b) return;
    el._b = b;
    el.querySelector('.lamp-glow').setAttribute('opacity', (b * 0.95).toFixed(3));
    el.querySelector('.lamp-glass').setAttribute('fill', b > 0.05 ? mix('#fff8e1', '#ffe082', b) : '#fff8e1');
    el.querySelector('.lamp-glass').setAttribute('opacity', (0.35 + b * 0.6).toFixed(2));
    el.querySelector('.lamp-fil').setAttribute('stroke', b > 0.05 ? mix('#7a6a4a', '#fffbe0', b) : '#7a6a4a');
  },
});

export { esc, g, pad };
