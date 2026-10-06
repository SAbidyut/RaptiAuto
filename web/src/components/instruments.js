// Instruments: oscilloscope, logic analyser, logic probe and function generator.
// They never load the circuit (1 MΩ inputs) and read the signals through SignalProbe (see sim/probe.js).
import { register } from './registry.js';
import { rect, circle, text, line, path, lead } from './draw.js';
import { Resistor, VSource } from '../sim/circuit/solver.js';
import { SignalProbe, fmtFreq, fmtTime } from '../sim/probe.js';

/** µs per division, from 1 µs to 2 s. */
export const TDIV = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1e3, 2e3, 5e3, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6];
const CH_COLORS = ['#fde047', '#22d3ee', '#f472b6', '#4ade80'];
/** Select options for the "start with" time/div property. */
const TDIV_OPTIONS = TDIV.map((us, i) => [String(i), us >= 1e6 ? us / 1e6 + ' s' : us >= 1e3 ? us / 1e3 + ' ms' : us + ' µs']);
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const niceMax = (v) => { for (const n of [1.2, 2.5, 3.5, 5.5, 7, 12, 25, 50, 120]) if (v <= n) return n; return Math.ceil(v / 10) * 10; };

/** Number of pins (besides the instrument's own) sharing the net of `pinId`. */
function netSize(ctx, pinId) {
  const e = ctx.engine;
  const net = e.netIdOf(ctx.part.id, pinId);
  return net < 0 ? 0 : e.netPins[net].pins.length - 1;
}

// ================================================================== oscilloscope
const SC = { x0: -12, y0: -114, w: 116, h: 72, cols: 10, rows: 6 };

register({
  type: 'oscilloscope', name: 'Oscilloscope (4 ch)', category: 'meters', tags: ['oscilloscope', 'scope', 'waveform', 'signal', 'pwm', 'measure', 'frequency'],
  description: 'Shows signals over time. Connect CH1…CH4 to pins and GND to ground. It records exactly what a sketch drives (levels, PWM, tone, servo pulses), a function generator, and samples any other node once per frame. Use the time/div slider while running; CH1 rising-edge trigger keeps repeating signals still.',
  box: [-20, -122, 112, 4],
  pins: [{ id: 'CH1', x: 0, y: 0 }, { id: 'CH2', x: 10, y: 0 }, { id: 'CH3', x: 20, y: 0 }, { id: 'CH4', x: 30, y: 0 }, { id: 'GND', x: 40, y: 0 }],
  props: [
    { key: 'mode', label: 'Display', type: 'select', options: [['stacked', 'Stacked (one lane per channel)'], ['overlay', 'Overlay']], default: 'stacked' },
    { key: 'vdiv', label: 'Volts / div (overlay)', type: 'select', options: [['0.5', '0.5 V'], ['1', '1 V'], ['2', '2 V'], ['5', '5 V']], default: '1' },
    { key: 'tdiv0', label: 'Start with time / div', type: 'select', options: TDIV_OPTIONS, default: '9' },
  ],
  controls: [
    { key: 'tdiv', label: 'Time / div', min: 0, max: TDIV.length - 1, step: 1, default: 9, format: (v) => fmtTime(TDIV[Math.round(v)]) },
    { key: 'run', label: 'Running', type: 'toggle', default: true },
    { key: 'trig', label: 'Trigger on CH1 rising edge', type: 'toggle', default: true },
  ],
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-20, -122, 112, 124, { fill: '#2b2f36', rx: 5 })}</g>`;
    s += rect(-17, -119, 106, 118, { fill: '#3a4049', rx: 3 });
    s += rect(SC.x0 - 3, SC.y0 - 3, SC.w + 6, SC.h + 6, { fill: '#0b0f14', rx: 3, stroke: '#14181e', sw: 1 });
    s += rect(SC.x0, SC.y0, SC.w, SC.h, { fill: '#04120b' });
    for (let i = 1; i < SC.cols; i++) s += line(SC.x0 + (SC.w * i) / SC.cols, SC.y0, SC.x0 + (SC.w * i) / SC.cols, SC.y0 + SC.h, { stroke: 'rgba(120,255,180,.16)', sw: 0.3, cap: 'butt' });
    for (let i = 1; i < SC.rows; i++) s += line(SC.x0, SC.y0 + (SC.h * i) / SC.rows, SC.x0 + SC.w, SC.y0 + (SC.h * i) / SC.rows, { stroke: 'rgba(120,255,180,.16)', sw: 0.3, cap: 'butt' });
    s += line(SC.x0 + SC.w / 2, SC.y0, SC.x0 + SC.w / 2, SC.y0 + SC.h, { stroke: 'rgba(120,255,180,.3)', sw: 0.4, cap: 'butt' });
    s += line(SC.x0, SC.y0 + SC.h / 2, SC.x0 + SC.w, SC.y0 + SC.h / 2, { stroke: 'rgba(120,255,180,.3)', sw: 0.4, cap: 'butt' });
    for (let k = 0; k < 4; k++) s += path('', { stroke: CH_COLORS[k], sw: 0.9, lj: 'round', cls: `sc-tr sc-tr${k}`, extra: ' vector-effect="non-scaling-stroke" style="stroke-width:1.4px"' });
    s += text(SC.x0 + 3, SC.y0 + 4, '', { size: 3.6, fill: '#9ae6b4', anchor: 'start', font: 'JetBrains Mono, monospace', cls: 'sc-info' });
    s += text(SC.x0 + SC.w - 3, SC.y0 + 4, 'STOP', { size: 3.6, fill: '#fca5a5', anchor: 'end', font: 'JetBrains Mono, monospace', cls: 'sc-stop', op: 0 });
    for (let k = 0; k < 4; k++) {
      s += text(SC.x0 + 3, -39 + k * 6, '', { size: 3.9, fill: CH_COLORS[k], anchor: 'start', font: 'JetBrains Mono, monospace', cls: `sc-rd sc-rd${k}` });
    }
    for (let k = 0; k < 5; k++) {
      s += lead(k * 10, 0, -8, { color: '#b8bcc4' });
      s += circle(k * 10, -12, 4, { fill: k === 4 ? '#111' : '#1c2128', stroke: k === 4 ? '#555' : CH_COLORS[k], sw: 1.2 });
      s += text(k * 10, -12, k === 4 ? '⏚' : String(k + 1), { size: 4, fill: k === 4 ? '#aaa' : CH_COLORS[k], weight: 700 });
    }
    return s;
  },
  sim: {
    create(ctx) {
      const gnd = ctx.node('GND');
      const chans = ['CH1', 'CH2', 'CH3', 'CH4'];
      const probes = chans.map((c) => {
        const n = ctx.node(c);
        if (n >= 0 && gnd >= 0) ctx.add(new Resistor(n, gnd, 1e6));
        return new SignalProbe(ctx, c, 'GND');
      });
      const rt = {
        probes,
        visual: { t: 0, tdiv: Number(ctx.props.tdiv0 ?? 9), run: true, trig: true, frozenT: 0, probes, active: [false, false, false, false], vcc: ctx.vcc(), mode: ctx.props.mode, vdiv: Number(ctx.props.vdiv) },
        values: { tdiv: Number(ctx.props.tdiv0 ?? 9), run: true, trig: true },
        input(key, val) {
          const v = this.visual;
          if (key === 'tdiv') { v.tdiv = Math.round(val); this.values.tdiv = v.tdiv; }
          if (key === 'run') { v.run = !!val; this.values.run = v.run; if (!v.run) v.frozenT = v.t; }
          if (key === 'trig') { v.trig = !!val; this.values.trig = v.trig; }
        },
        started() {
          const t = ctx.now();
          this.visual.active = chans.map((c) => netSize(ctx, c) > 0);
          probes.forEach((p) => p.frame(t));
        },
        endFrame() {
          const t = ctx.now();
          this.visual.t = t;
          for (const p of probes) p.frame(t);
        },
        /** Measured values of channel k over the current window (also used by tests). */
        measure(k) {
          const v = this.visual;
          const win = TDIV[v.tdiv] * SC.cols;
          return probes[k].measure(v.t - win, v.t);
        },
      };
      return rt;
    },
  },
  update(el, v) {
    const tn = nowMs();
    if (el._last && tn - el._last < 60) return;
    el._last = tn;
    const win = TDIV[v.tdiv] * SC.cols;
    const tEnd = v.run ? v.t : v.frozenT;
    const act = v.active.map((a, i) => a && v.probes[i].connected);
    const nAct = act.filter(Boolean).length;
    let t0 = tEnd - win;
    if (v.trig && act[0]) {
      const p = v.probes[0];
      const m = p.measure(tEnd - win, tEnd);
      const level = m.vpp > 0.05 ? (m.min + m.max) / 2 : v.vcc / 2;
      const tr = p.findRising(level, tEnd - win * 0.9, win * 4);
      if (tr !== null) t0 = tr - win * 0.1;
    }
    const cols = 232;
    let lane = 0;
    const stop = el.querySelector('.sc-stop');
    if (stop) stop.setAttribute('opacity', v.run ? 0 : 1);
    const info = el.querySelector('.sc-info');
    if (info) info.textContent = fmtTime(TDIV[v.tdiv]) + '/div';
    for (let k = 0; k < 4; k++) {
      const tr = el.querySelector('.sc-tr' + k);
      const rd = el.querySelector('.sc-rd' + k);
      if (!act[k]) { if (tr) tr.setAttribute('d', ''); if (rd) rd.textContent = ''; continue; }
      const p = v.probes[k];
      const w = p.window(t0, t0 + win, cols);
      let hi = 0;
      for (const x of w) if (x > hi) hi = x;
      let yOf;
      if (v.mode === 'overlay') {
        const base = SC.y0 + SC.h * 0.75;
        const pxPerV = SC.h / SC.rows / v.vdiv;
        yOf = (x) => Math.max(SC.y0, Math.min(SC.y0 + SC.h, base - x * pxPerV));
      } else {
        const bandH = SC.h / nAct;
        const top = SC.y0 + lane * bandH + 3, bot = SC.y0 + (lane + 1) * bandH - 3;
        const range = niceMax(Math.max(v.vcc, hi));
        yOf = (x) => Math.max(top, Math.min(bot, bot - (x / range) * (bot - top)));
      }
      lane++;
      let d = '';
      for (let i = 0; i < cols; i++) d += (i ? 'L' : 'M') + (SC.x0 + (SC.w * i) / (cols - 1)).toFixed(1) + ' ' + yOf(w[i]).toFixed(1);
      tr.setAttribute('d', d);
      const m = p.measure(t0, t0 + win);
      const avg = w.reduce((a, b) => a + b, 0) / w.length;
      rd.textContent = `CH${k + 1} ` + (m.vpp < 0.05 ? `DC ${avg.toFixed(2)} V` : `${fmtFreq(m.freq)} ${Math.round(m.duty * 100)}% ${m.vpp.toFixed(2)} Vpp`);
    }
  },
});

// ================================================================== logic analyser
const LA = { x0: -12, y0: -114, w: 106, h: 72 };
register({
  type: 'logic-analyzer', name: 'Logic Analyzer (8 ch)', category: 'meters', tags: ['logic analyzer', 'logic analyser', 'digital', 'signal', 'timing', 'saleae'],
  description: 'Eight digital channels D0–D7 in one timing diagram, with frequency and duty cycle per channel. Connect GND to ground. Works like the oscilloscope but compares each signal with half the supply voltage.',
  box: [-20, -122, 112, 4],
  pins: [...Array.from({ length: 8 }, (_, i) => ({ id: 'D' + i, x: i * 10, y: 0 })), { id: 'GND', x: 80, y: 0 }],
  props: [{ key: 'tdiv0', label: 'Start with time / div', type: 'select', options: TDIV_OPTIONS, default: '9' }],
  controls: [
    { key: 'tdiv', label: 'Time / div', min: 0, max: TDIV.length - 1, step: 1, default: 9, format: (v) => fmtTime(TDIV[Math.round(v)]) },
    { key: 'run', label: 'Running', type: 'toggle', default: true },
    { key: 'trig', label: 'Trigger on D0 rising edge', type: 'toggle', default: true },
  ],
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-20, -122, 112, 124, { fill: '#15324a', rx: 5 })}</g>`;
    s += rect(-17, -119, 106, 118, { fill: '#1b4466', rx: 3 });
    s += rect(LA.x0 - 3, LA.y0 - 3, LA.w + 6, LA.h + 6, { fill: '#05080c', rx: 3 });
    s += rect(LA.x0, LA.y0, LA.w, LA.h, { fill: '#05080c' });
    for (let i = 1; i < 10; i++) s += line(LA.x0 + (LA.w * i) / 10, LA.y0, LA.x0 + (LA.w * i) / 10, LA.y0 + LA.h, { stroke: 'rgba(148,163,184,.14)', sw: 0.3, cap: 'butt' });
    for (let k = 0; k < 8; k++) {
      const y = LA.y0 + (LA.h * (k + 0.5)) / 8;
      s += line(LA.x0, y + 4, LA.x0 + LA.w, y + 4, { stroke: 'rgba(148,163,184,.1)', sw: 0.3, cap: 'butt' });
      s += path('', { stroke: '#4ade80', sw: 0.9, cls: `la-tr la-tr${k}`, extra: ' vector-effect="non-scaling-stroke" style="stroke-width:1.3px"' });
      s += text(LA.x0 + 2, y - 1, 'D' + k, { size: 3.4, fill: '#7dd3fc', anchor: 'start', font: 'JetBrains Mono, monospace', weight: 700 });
      s += text(LA.x0 + LA.w - 2, y - 1, '', { size: 3.2, fill: '#a7f3d0', anchor: 'end', font: 'JetBrains Mono, monospace', cls: `la-rd la-rd${k}` });
    }
    s += text(LA.x0 + 2, LA.y0 + LA.h + 6.5, '', { size: 3.6, fill: '#9ae6b4', anchor: 'start', font: 'JetBrains Mono, monospace', cls: 'la-info' });
    s += text(LA.x0 + LA.w - 2, LA.y0 + LA.h + 6.5, 'STOP', { size: 3.6, fill: '#fca5a5', anchor: 'end', font: 'JetBrains Mono, monospace', cls: 'la-stop', op: 0 });
    for (let k = 0; k < 9; k++) {
      s += lead(k * 10, 0, -8, { color: '#b8bcc4' });
      s += circle(k * 10, -12, 3.6, { fill: '#0f2233', stroke: k === 8 ? '#666' : '#4ade80', sw: 1 });
      s += text(k * 10, -12, k === 8 ? '⏚' : String(k), { size: 3.6, fill: '#ddd', weight: 700 });
    }
    return s;
  },
  sim: {
    create(ctx) {
      const gnd = ctx.node('GND');
      const chans = Array.from({ length: 8 }, (_, i) => 'D' + i);
      const probes = chans.map((c) => {
        const n = ctx.node(c);
        if (n >= 0 && gnd >= 0) ctx.add(new Resistor(n, gnd, 1e6));
        return new SignalProbe(ctx, c, 'GND');
      });
      return {
        probes,
        visual: { t: 0, tdiv: Number(ctx.props.tdiv0 ?? 9), run: true, trig: true, frozenT: 0, probes, active: new Array(8).fill(false), vcc: ctx.vcc() },
        values: { tdiv: Number(ctx.props.tdiv0 ?? 9), run: true, trig: true },
        input(key, val) {
          const v = this.visual;
          if (key === 'tdiv') { v.tdiv = Math.round(val); this.values.tdiv = v.tdiv; }
          if (key === 'run') { v.run = !!val; this.values.run = v.run; if (!v.run) v.frozenT = v.t; }
          if (key === 'trig') { v.trig = !!val; this.values.trig = v.trig; }
        },
        started() { const t = ctx.now(); this.visual.active = chans.map((c) => netSize(ctx, c) > 0); probes.forEach((p) => p.frame(t)); },
        endFrame() { const t = ctx.now(); this.visual.t = t; for (const p of probes) p.frame(t); },
        measure(k) { const v = this.visual; const win = TDIV[v.tdiv] * 10; return probes[k].measure(v.t - win, v.t, v.vcc / 2); },
      };
    },
  },
  update(el, v) {
    const tn = nowMs();
    if (el._last && tn - el._last < 60) return;
    el._last = tn;
    const win = TDIV[v.tdiv] * 10;
    const tEnd = v.run ? v.t : v.frozenT;
    const thr = v.vcc / 2;
    let t0 = tEnd - win;
    if (v.trig && v.active[0]) {
      const tr = v.probes[0].findRising(thr, tEnd - win * 0.9, win * 4);
      if (tr !== null) t0 = tr - win * 0.1;
    }
    const stop = el.querySelector('.la-stop');
    if (stop) stop.setAttribute('opacity', v.run ? 0 : 1);
    const info = el.querySelector('.la-info');
    if (info) info.textContent = fmtTime(TDIV[v.tdiv]) + '/div';
    const cols = 212;
    for (let k = 0; k < 8; k++) {
      const tr = el.querySelector('.la-tr' + k), rd = el.querySelector('.la-rd' + k);
      if (!v.active[k]) { tr.setAttribute('d', ''); rd.textContent = ''; continue; }
      const yc = LA.y0 + (LA.h * (k + 0.5)) / 8;
      const yHi = yc - 3.6, yLo = yc + 3.4;
      const w = v.probes[k].window(t0, t0 + win, cols);
      let prev = w[0] >= thr;
      let d = `M${LA.x0} ${prev ? yHi : yLo}`;
      for (let i = 1; i < cols; i++) {
        const cur = w[i] >= thr;
        if (cur !== prev) { const x = (LA.x0 + (LA.w * i) / (cols - 1)).toFixed(1); d += `H${x}V${cur ? yHi : yLo}`; prev = cur; }
      }
      d += `H${LA.x0 + LA.w}`;
      tr.setAttribute('d', d);
      const m = v.probes[k].measure(t0, t0 + win, thr);
      rd.textContent = m.freq ? `${fmtFreq(m.freq)} ${Math.round(m.duty * 100)}%` : (prev ? 'HIGH' : 'LOW');
    }
  },
});

// ================================================================== logic probe + frequency counter
register({
  type: 'logic-probe', name: 'Logic Probe / Frequency Counter', category: 'meters', tags: ['logic probe', 'frequency', 'counter', 'duty cycle', 'digital', 'high low'],
  description: 'Touch the tip (IN) to a signal and the GND clip to ground. HI / LO lamps show the logic level, PULSE lights while the signal toggles, and the display shows frequency and duty cycle.',
  box: [-14, -64, 34, 4],
  pins: [{ id: 'IN', x: 0, y: 0 }, { id: 'GND', x: 20, y: 0 }],
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-14, -64, 48, 66, { fill: '#e5e7eb', rx: 6, stroke: '#9ca3af', sw: 1 })}</g>`;
    s += rect(-9, -59, 38, 20, { fill: '#0f1a12', rx: 2 });
    s += text(10, -52, '', { size: 5.2, fill: '#86efac', font: 'JetBrains Mono, monospace', weight: 700, cls: 'lp-freq' });
    s += text(10, -44, '', { size: 3.6, fill: '#a7f3d0', font: 'JetBrains Mono, monospace', cls: 'lp-duty' });
    const lamp = (x, c, cls, label) => circle(x, -26, 4.4, { fill: '#3b3b3f', cls }) + text(x, -17, label, { size: 3.3, fill: '#374151', weight: 700 }) + `<circle cx="${x}" cy="-26" r="4.4" fill="${c}" opacity="0" class="${cls}-on"/>`;
    s += lamp(-1, '#ef4444', 'lp-hi', 'HI') + lamp(10, '#f59e0b', 'lp-pu', 'PULSE') + lamp(21, '#22c55e', 'lp-lo', 'LO');
    s += lead(0, 0, -9, { color: '#d32f2f' }) + lead(20, 0, -9, { color: '#222' });
    s += text(0, -6, 'IN', { size: 3.4, fill: '#6b7280', weight: 700 }) + text(20, -6, 'GND', { size: 3.4, fill: '#6b7280', weight: 700 });
    return s;
  },
  sim: {
    create(ctx) {
      const gnd = ctx.node('GND'), inN = ctx.node('IN');
      if (inN >= 0 && gnd >= 0) ctx.add(new Resistor(inN, gnd, 1e6));
      const probe = new SignalProbe(ctx, 'IN', 'GND');
      const vcc = ctx.vcc();
      return {
        probe,
        visual: { hi: false, lo: false, pulse: false, freq: 0, duty: 0 },
        started() { probe.frame(ctx.now()); },
        endFrame() {
          const t = ctx.now();
          probe.frame(t);
          const m = probe.measure(Math.max(0, t - 250000), t, vcc / 2);
          const v = probe.at(t);
          const pulsing = m.edges >= 1 && m.vpp > vcc * 0.4;
          this.visual.freq = m.freq;
          this.visual.duty = m.duty;
          this.visual.pulse = pulsing;
          this.visual.hi = !pulsing && v > vcc * 0.7;
          this.visual.lo = !pulsing && v < vcc * 0.3 && v > -0.5;
        },
      };
    },
  },
  update(el, v) {
    const set = (cls, on) => { const e = el.querySelector(cls); if (e && e._on !== on) { e._on = on; e.setAttribute('opacity', on ? 1 : 0); } };
    set('.lp-hi-on', v.hi); set('.lp-pu-on', v.pulse); set('.lp-lo-on', v.lo);
    const f = el.querySelector('.lp-freq'), d = el.querySelector('.lp-duty');
    const ft = v.pulse ? fmtFreq(v.freq) : v.hi ? 'HIGH' : v.lo ? 'LOW' : '—';
    if (f.textContent !== ft) f.textContent = ft;
    const dt = v.pulse ? `duty ${Math.round(v.duty * 100)}%` : '';
    if (d.textContent !== dt) d.textContent = dt;
  },
});

// ================================================================== function generator
const WAVES = {
  sine: (p) => Math.sin(2 * Math.PI * p),
  square: (p, duty) => (p < duty ? 1 : -1),
  triangle: (p) => (p < 0.5 ? -1 + 4 * p : 3 - 4 * p),
  sawtooth: (p) => -1 + 2 * p,
  dc: () => 0,
};
export const waveValue = (wave, t, freq, amp, offset, duty) => {
  const ph = (((t * freq) / 1e6) % 1 + 1) % 1;
  return offset + amp * (WAVES[wave] || WAVES.sine)(ph, duty);
};
const fmtHzCtl = (v) => fmtFreq(10 ** v);

register({
  type: 'function-generator', name: 'Function Generator', category: 'meters', tags: ['function generator', 'signal generator', 'sine', 'square', 'triangle', 'sawtooth', 'ac', 'waveform'],
  description: 'Sine, square, triangle or sawtooth source (0.1 Hz – 20 kHz) between OUT and GND. Below 20 Hz the circuit follows the waveform (an LED pulses, an analog pin sees a moving voltage); above 20 Hz the circuit only sees the average level, while the oscilloscope still shows the true waveform.',
  box: [-14, -64, 34, 4],
  pins: [{ id: 'OUT', x: 0, y: 0 }, { id: 'GND', x: 20, y: 0 }],
  props: [
    { key: 'wave', label: 'Waveform', type: 'select', options: [['sine', 'Sine'], ['square', 'Square'], ['triangle', 'Triangle'], ['sawtooth', 'Sawtooth'], ['dc', 'DC']], default: 'sine' },
    { key: 'duty', label: 'Square duty (%)', type: 'select', options: [['10', '10 %'], ['25', '25 %'], ['50', '50 %'], ['75', '75 %'], ['90', '90 %']], default: '50' },
  ],
  controls: [
    { key: 'logf', label: 'Frequency', min: -1, max: 4.3, step: 0.01, default: 0, format: fmtHzCtl },
    { key: 'amp', label: 'Amplitude (peak)', min: 0, max: 5, step: 0.1, unit: 'V', default: 2.5 },
    { key: 'offset', label: 'DC offset', min: -5, max: 5, step: 0.1, unit: 'V', default: 2.5 },
  ],
  render(p) {
    let s = `<g filter="url(#softShadow)">${rect(-14, -64, 48, 66, { fill: '#374151', rx: 6 })}</g>`;
    s += rect(-9, -59, 38, 24, { fill: '#0c1f2e', rx: 2 });
    const pts = [];
    for (let i = 0; i <= 36; i++) pts.push(`${(i === 0 ? 'M' : 'L')}${-8 + i}  ${-47 - (WAVES[p.wave] || WAVES.sine)(i / 36 * 2 % 1, Number(p.duty) / 100) * 7}`);
    s += path(pts.join(' '), { stroke: '#38bdf8', sw: 1, lj: 'round' });
    s += text(10, -39, '', { size: 3.6, fill: '#7dd3fc', font: 'JetBrains Mono, monospace', cls: 'fg-freq' });
    s += circle(2, -22, 5, { fill: '#111827', stroke: '#6b7280', sw: 1 }) + line(2, -22, 2, -26, { stroke: '#f9fafb', sw: 1.2 });
    s += circle(18, -22, 5, { fill: '#111827', stroke: '#6b7280', sw: 1 }) + line(18, -22, 21, -24, { stroke: '#f9fafb', sw: 1.2 });
    s += text(10, -12, (p.wave || 'sine').toUpperCase(), { size: 3.6, fill: '#d1d5db', weight: 700 });
    s += lead(0, 0, -9, { color: '#d32f2f' }) + lead(20, 0, -9, { color: '#222' });
    s += text(0, -6, 'OUT', { size: 3.2, fill: '#9ca3af', weight: 700 }) + text(20, -6, 'GND', { size: 3.2, fill: '#9ca3af', weight: 700 });
    return s;
  },
  sim: {
    create(ctx) {
      const out = ctx.node('OUT'), gnd = ctx.node('GND');
      const vs = out >= 0 && gnd >= 0 ? ctx.add(new VSource(out, gnd, 0, 50)) : null;
      const p = ctx.props;
      const wave = p.wave || 'sine';
      const duty = Number(p.duty || 50) / 100;
      const rt = {
        visual: { freq: 1, amp: 2.5, offset: 2.5 },
        values: { logf: 0, amp: 2.5, offset: 2.5 },
        freq: 1, amp: 2.5, offset: 2.5,
        input(key, val) {
          if (key === 'logf') { this.freq = 10 ** val; this.values.logf = val; this.visual.freq = this.freq; }
          if (key === 'amp') { this.amp = val; this.values.amp = val; this.visual.amp = val; }
          if (key === 'offset') { this.offset = val; this.values.offset = val; this.visual.offset = val; }
          ctx.dirty();
        },
        /** Instantaneous output voltage at virtual time t (µs). */
        signalAt(t) { return wave === 'dc' ? this.offset : waveValue(wave, t, this.freq, this.amp, this.offset, duty); },
        /** What the DC circuit solver sees: the live value at low frequency, otherwise the average. */
        circuitValue() {
          if (wave === 'dc' || this.freq > 20) return wave === 'square' ? this.offset + this.amp * (2 * duty - 1) : this.offset;
          return this.signalAt(ctx.now());
        },
        prepare() { if (vs) vs.v = this.circuitValue(); },
        endFrame() { if (this.freq <= 20 && wave !== 'dc') ctx.dirty(); },
      };
      return rt;
    },
  },
  update(el, v) {
    const f = el.querySelector('.fg-freq');
    const t = `${fmtFreq(v.freq)} ${(v.amp * 2).toFixed(1)}Vpp`;
    if (f.textContent !== t) f.textContent = t;
  },
});
