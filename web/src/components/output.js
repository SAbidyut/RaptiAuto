// Output components: buzzer, 7-segment, LED bar graph, NeoPixels.
import { register } from './registry.js';
import { rect, circle, text, line, path, lead, pad } from './draw.js';
import { Resistor, Diode } from '../sim/circuit/solver.js';
import { ledBrightness, LED_COLORS, mix } from './basic.js';
import { Stress, ledStress, burnMessage } from '../sim/damage.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Every LED of an array (segments, bar) wears out on its own: a segment without a resistor burns, the rest keep working. */
function wearLeds(ctx, rt, ds, stress, dt, name) {
  ds.forEach((d, i) => {
    const cur = Math.max(0, d.iAvg ?? d.i);
    rt.acc[i] += cur * dt;
    if (d.open) return;
    if (stress[i].add(ledStress(cur), dt) >= 1) {
      d.open = true;
      ctx.burn(burnMessage(name(i), `${(cur * 1000).toFixed(0)} mA is far above its 20 mA limit`, 'Use a 220 Ω resistor on every segment / LED pin'), 'burn' + i, true);
    }
  });
}

// ------------------------------------------------------------------ buzzer
register({
  type: 'buzzer', name: 'Buzzer', category: 'output', tags: ['buzzer', 'piezo', 'sound', 'tone', 'speaker', 'alarm'],
  description: 'Active buzzer beeps on DC; passive buzzer plays the frequency from tone().',
  box: [-12, -38, 32, 0],
  pins: [{ id: '+', x: 0, y: 0, label: '+' }, { id: '-', x: 20, y: 0, label: '−' }],
  props: [{ key: 'kind', label: 'Type', type: 'select', options: [['passive', 'Passive (use tone())'], ['active', 'Active (beeps on HIGH)']], default: 'passive' }],
  render(p) {
    let s = lead(0, 0, -8) + lead(20, 0, -8);
    s += `<g class="bz-waves" opacity="0">${path('M27 -32 A12 12 0 0 1 27 -12', { stroke: '#22d3ee', sw: 1.6, cap: 'round' })}${path('M32 -36 A17 17 0 0 1 32 -8', { stroke: '#22d3ee', sw: 1.6, cap: 'round', op: 0.6 })}${path('M-7 -32 A12 12 0 0 0 -7 -12', { stroke: '#22d3ee', sw: 1.6, cap: 'round' })}${path('M-12 -36 A17 17 0 0 0 -12 -8', { stroke: '#22d3ee', sw: 1.6, cap: 'round', op: 0.6 })}</g>`;
    s += circle(10, -22, 15, { fill: 'url(#blackPlastic)', stroke: '#000', sw: 0.6 });
    s += circle(10, -22, 11, { fill: 'none', stroke: '#2c2d31', sw: 1.2 });
    s += circle(10, -22, 3, { fill: '#050505' });
    s += text(1, -31, '+', { size: 6, fill: '#ddd', weight: 700 });
    if (p.kind === 'active') s += rect(0, -11, 20, 3, { fill: '#222' });
    return s;
  },
  sim: {
    create(ctx) {
      const active = ctx.props.kind === 'active';
      const plus = ctx.node('+'), minus = ctx.node('-');
      const r = ctx.add(new Resistor(plus, minus, active ? 120 : 100));
      return {
        visual: { on: 0 },
        acc: 0,
        accumulate(dt) { this.acc += Math.max(0, r.iAvg ?? r.i) * dt; },
        endFrame(fd) {
          const i = fd > 0 ? this.acc / fd : Math.max(0, r.iAvg ?? r.i);
          this.acc = 0;
          let freq = 0;
          if (i > 0.004) {
            if (active) freq = 2400;
            else {
              const sig = ctx.engine.pinSignal(plus) || ctx.engine.pinSignal(minus);
              if (sig && sig.tone) freq = sig.tone;
              else if (ctx.engine.pins) for (const st of ctx.engine.pins.values()) if (st.tone) { freq = st.tone; break; }
            }
          }
          const vol = freq ? clamp01(i / 0.015) : 0;
          if (freq !== this.f || Math.abs(vol - (this.v || 0)) > 0.05) { this.f = freq; this.v = vol; ctx.sound('bz', freq, vol); }
          this.visual.on = freq ? vol : 0;
          this.visual.freq = freq;
        },
        stopped() { ctx.sound('bz', 0, 0); },
      };
    },
  },
  update(el, v) {
    const w = el.querySelector('.bz-waves');
    const on = v.on > 0.05;
    if (w._on !== on) { w._on = on; w.setAttribute('opacity', on ? 1 : 0); w.classList.toggle('bz-anim', on); }
  },
});

// ------------------------------------------------------------------ 7 segment display
const SEG_POLYS = {
  A: 'M5 -54 L9 -58 H27 L31 -54 L27 -50 H9 Z',
  B: 'M32 -53 L36 -49 V-35 L32 -31 L28 -35 V-49 Z',
  C: 'M32 -29 L36 -25 V-11 L32 -7 L28 -11 V-25 Z',
  D: 'M5 -6 L9 -10 H27 L31 -6 L27 -2 H9 Z',
  E: 'M4 -29 L8 -25 V-11 L4 -7 L0 -11 V-25 Z',
  F: 'M4 -53 L8 -49 V-35 L4 -31 L0 -35 V-49 Z',
  G: 'M5 -30 L9 -34 H27 L31 -30 L27 -26 H9 Z',
};
register({
  type: 'seven-segment', name: '7-Segment Display', category: 'display', tags: ['7 segment', 'digit', 'numeric', 'display'],
  description: 'Single digit 0.56" display. Common cathode → COM to GND; common anode → COM to 5V. Use a resistor per segment.',
  box: [-8, -72, 48, 2],
  pins: [
    { id: 'E', x: 0, y: 0 }, { id: 'D', x: 10, y: 0 }, { id: 'COM.2', x: 20, y: 0, label: 'COM' }, { id: 'C', x: 30, y: 0 }, { id: 'DP', x: 40, y: 0 },
    { id: 'G', x: 0, y: -60 }, { id: 'F', x: 10, y: -60 }, { id: 'COM.1', x: 20, y: -60, label: 'COM' }, { id: 'A', x: 30, y: -60 }, { id: 'B', x: 40, y: -60 },
  ],
  internal: [['COM.1', 'COM.2']],
  props: [
    { key: 'common', label: 'Type', type: 'select', options: [['cathode', 'Common cathode'], ['anode', 'Common anode']], default: 'cathode' },
    { key: 'color', label: 'Colour', type: 'select', options: [['red', 'Red'], ['green', 'Green'], ['blue', 'Blue'], ['yellow', 'Yellow'], ['white', 'White']], default: 'red' },
  ],
  render(p) {
    let s = rect(-8, -68, 56, 66, { fill: '#1b1c20', rx: 2.5, stroke: '#000', sw: 0.6 });
    s += `<g transform="translate(6 -2)">`;
    for (const [k, d] of Object.entries(SEG_POLYS)) s += path(d, { fill: '#2a2b30', cls: 'seg seg-' + k });
    s += circle(38, -5, 2.6, { fill: '#2a2b30', cls: 'seg seg-DP' });
    s += `</g>`;
    for (const pin of this.pins) s += text(pin.x, pin.y + (pin.y === 0 ? -4.5 : 4.5), pin.label || pin.id, { size: 3.2, fill: '#888' });
    void p;
    return s;
  },
  sim: {
    create(ctx) {
      const anode = ctx.props.common === 'anode';
      const col = LED_COLORS[ctx.props.color] || LED_COLORS.red;
      const com = ctx.node('COM.1');
      const segs = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP'];
      const ds = segs.map((sg) => ctx.add(anode ? new Diode(com, ctx.node(sg), col.vf, 12) : new Diode(ctx.node(sg), com, col.vf, 12)));
      const stress = ds.map(() => new Stress(0.03));
      return {
        visual: { b: segs.map(() => 0) },
        acc: segs.map(() => 0),
        accumulate(dt) { wearLeds(ctx, this, ds, stress, dt, (i) => `7-segment display segment ${segs[i]}`); },
        endFrame(fd) {
          this.visual.b = ds.map((d, i) => (d.open ? 0 : ledBrightness(fd > 0 ? this.acc[i] / fd : Math.max(0, d.iAvg ?? d.i))));
          this.acc.fill(0);
        },
      };
    },
  },
  burnAt: [18, -30],
  update(el, v, p) {
    const col = LED_COLORS[p.color] || LED_COLORS.red;
    if (!el._segs) el._segs = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP'].map((k) => el.querySelector('.seg-' + k));
    el._segs.forEach((s, i) => {
      const b = v.b[i] || 0;
      const k = Math.round(b * 20);
      if (s._k === k) return;
      s._k = k;
      s.setAttribute('fill', b > 0.03 ? mix('#3a1f1f', col.on, Math.min(1, 0.35 + b)) : '#2a2b30');
      s.style.filter = b > 0.25 ? `drop-shadow(0 0 ${(2 + b * 3).toFixed(1)}px ${col.glow})` : '';
    });
  },
});

// ------------------------------------------------------------------ LED bar graph
register({
  type: 'led-bar', name: 'LED Bar Graph (10)', category: 'output', tags: ['bar graph', 'level', 'vu meter', 'led'],
  description: '10 LEDs in one package. Anodes on the top row (A1–A10), cathodes on the bottom row (C1–C10).',
  box: [-6, -36, 96, 6],
  pins: [...Array.from({ length: 10 }, (_, i) => ({ id: 'A' + (i + 1), x: i * 10, y: -30 })), ...Array.from({ length: 10 }, (_, i) => ({ id: 'C' + (i + 1), x: i * 10, y: 0 }))],
  props: [{ key: 'color', label: 'Colour', type: 'select', options: [['red', 'Red'], ['green', 'Green'], ['yellow', 'Yellow'], ['blue', 'Blue']], default: 'red' }],
  render() {
    let s = rect(-6, -34, 102, 38, { fill: '#1b1c20', rx: 2 });
    for (let i = 0; i < 10; i++) s += rect(i * 10 - 3, -27, 6, 24, { fill: '#2c2d33', rx: 1, cls: 'bar bar-' + i });
    return s;
  },
  sim: {
    create(ctx) {
      const col = LED_COLORS[ctx.props.color] || LED_COLORS.red;
      const ds = Array.from({ length: 10 }, (_, i) => ctx.add(new Diode(ctx.node('A' + (i + 1)), ctx.node('C' + (i + 1)), col.vf, 12)));
      const stress = ds.map(() => new Stress(0.03));
      return {
        visual: { b: ds.map(() => 0) },
        acc: ds.map(() => 0),
        accumulate(dt) { wearLeds(ctx, this, ds, stress, dt, (i) => `LED bar segment ${i + 1}`); },
        endFrame(fd) { this.visual.b = ds.map((d, i) => (d.open ? 0 : ledBrightness(fd > 0 ? this.acc[i] / fd : Math.max(0, d.iAvg ?? d.i)))); this.acc.fill(0); },
      };
    },
  },
  burnAt: [45, -30],
  update(el, v, p) {
    const col = LED_COLORS[p.color] || LED_COLORS.red;
    if (!el._bars) el._bars = Array.from({ length: 10 }, (_, i) => el.querySelector('.bar-' + i));
    el._bars.forEach((b, i) => {
      const k = Math.round((v.b[i] || 0) * 20);
      if (b._k === k) return;
      b._k = k;
      b.setAttribute('fill', k ? mix('#2c2d33', col.on, Math.min(1, 0.3 + v.b[i])) : '#2c2d33');
      b.style.filter = k > 5 ? `drop-shadow(0 0 3px ${col.glow})` : '';
    });
  },
});

// ------------------------------------------------------------------ NeoPixel (WS2812B)
const NEO_LAYOUTS = {
  single: { n: 1, name: 'NeoPixel (single)' },
  stick8: { n: 8, name: 'NeoPixel Stick 8' },
  ring12: { n: 12, name: 'NeoPixel Ring 12' },
  ring16: { n: 16, name: 'NeoPixel Ring 16' },
  ring24: { n: 24, name: 'NeoPixel Ring 24' },
  matrix8: { n: 64, name: 'NeoPixel Matrix 8×8' },
};

function neoGeometry(layout) {
  const n = NEO_LAYOUTS[layout] ? NEO_LAYOUTS[layout].n : 1;
  const px = [];
  let box, pins;
  if (layout === 'stick8') {
    for (let i = 0; i < n; i++) px.push([10 + i * 12, -14]);
    pins = [{ id: 'GND', x: 0, y: 0 }, { id: 'VCC', x: 10, y: 0, label: '5V' }, { id: 'DIN', x: 20, y: 0, label: 'DIN' }, { id: 'DOUT', x: 100, y: 0, label: 'DOUT' }];
    box = [-6, -26, 106, 4];
  } else if (layout.startsWith('ring')) {
    const R = n === 12 ? 26 : n === 16 ? 34 : 46;
    const cx = 15, cy = -R - 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      px.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
    }
    pins = [{ id: 'GND', x: 0, y: 0 }, { id: 'VCC', x: 10, y: 0, label: '5V' }, { id: 'DIN', x: 20, y: 0, label: 'DI' }, { id: 'DOUT', x: 30, y: 0, label: 'DO' }];
    box = [cx - R - 10, cy - R - 10, cx + R + 10, 4];
  } else if (layout === 'matrix8') {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) px.push([4 + c * 11, -96 + r * 11]);
    pins = [{ id: 'VCC', x: 0, y: 0, label: '5V' }, { id: 'GND', x: 10, y: 0 }, { id: 'DIN', x: 20, y: 0, label: 'DIN' }, { id: 'DOUT', x: 60, y: 0, label: 'DOUT' }];
    box = [-8, -108, 90, 4];
  } else {
    px.push([15, -16]);
    pins = [{ id: 'VCC', x: 0, y: 0, label: 'VDD' }, { id: 'DOUT', x: 10, y: 0, label: 'DO' }, { id: 'GND', x: 20, y: 0, label: 'VSS' }, { id: 'DIN', x: 30, y: 0, label: 'DI' }];
    box = [-4, -30, 34, 4];
  }
  return { n, px, pins, box };
}

register({
  type: 'neopixel', name: 'NeoPixel LEDs (WS2812B)', category: 'output', tags: ['neopixel', 'ws2812', 'rgb', 'addressable', 'ring', 'strip', 'matrix'],
  description: 'Addressable RGB LEDs. Use the Adafruit_NeoPixel library on any digital pin. Chain DOUT → DIN.',
  box: (p) => neoGeometry(p.layout || 'ring16').box,
  pins: (p) => neoGeometry(p.layout || 'ring16').pins,
  props: [{ key: 'layout', label: 'Layout', type: 'select', options: Object.entries(NEO_LAYOUTS).map(([k, v]) => [k, v.name]), default: 'ring16' }],
  render(p) {
    const { px, pins, box } = neoGeometry(p.layout);
    let s = '';
    for (const pin of pins) s += lead(pin.x, 0, -4);
    if (p.layout.startsWith('ring')) {
      const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3] - 4) / 2;
      const R = (box[2] - box[0]) / 2 - 10;
      s += `<circle cx="${cx}" cy="${cy}" r="${R + 8}" fill="#16181d" stroke="#000" stroke-width="0.6"/><circle cx="${cx}" cy="${cy}" r="${R - 8}" fill="var(--canvas-bg,#0b1020)"/>`;
      s += rect(-4, -12, 38, 10, { fill: '#16181d', rx: 2 });
    } else {
      s += rect(box[0], box[1], box[2] - box[0], box[3] - box[1] - 2, { fill: '#16181d', rx: 3 });
    }
    px.forEach(([x, y], i) => {
      s += rect(x - 4.5, y - 4.5, 9, 9, { fill: '#f4f4f0', rx: 1 }) + `<circle class="px px-${i}" cx="${x}" cy="${y}" r="3.2" fill="#d8d8d0"/>`;
    });
    s += `<g class="px-glow"></g>`;
    for (const pin of pins) s += text(pin.x, -7, pin.label || pin.id, { size: 2.8, fill: '#ccc' });
    return s;
  },
  sim: {
    create(ctx) {
      const { n } = neoGeometry(ctx.props.layout);
      const vcc = ctx.node('VCC'), gnd = ctx.node('GND');
      const load = ctx.add(new Resistor(vcc, gnd, 5 / (n * 0.0006)));
      const rt = {
        visual: { px: new Array(n).fill(0), v: 0 },
        data: new Array(n).fill(0),
        n,
        ws2812(colors) {
          // take our pixels, forward the rest to the next device on DOUT
          for (let i = 0; i < n; i++) this.data[i] = colors[i] ?? this.data[i];
          const rest = colors.slice(n);
          if (rest.length) {
            const outNode = ctx.node('DOUT');
            for (const nx of ctx.engine.partsOnNode(outNode, (p) => p.ws2812 && p !== rt, 'DIN')) nx.rt.ws2812(rest);
          }
          ctx.dirty();
        },
        powered() { return ctx.v(vcc) - ctx.v(gnd) > 3.3; },
        prepare() {
          let i = n * 0.0006;
          for (const c of this.data) i += (((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255)) / 255 * 0.02;
          load.setR(Math.max(1, 5 / i));
        },
        after() {
          const on = this.powered();
          this.visual.px = on ? this.data.slice() : new Array(n).fill(0);
          if (on) {
            const amps = (load.iAvg ?? load.i);
            if (amps > 0.45) ctx.warn(`NeoPixels draw ${(amps * 1000).toFixed(0)} mA — too much for the board's 5V pin. Use an external 5V supply.`, 'neoI');
          }
        },
      };
      return rt;
    },
  },
  update(el, v) {
    if (!el._px) el._px = Array.from(el.querySelectorAll('.px'));
    const glow = el.querySelector('.px-glow');
    let gl = '';
    el._px.forEach((c, i) => {
      const col = v.px[i] || 0;
      const r = (col >> 16) & 255, g = (col >> 8) & 255, b = col & 255;
      const m = Math.max(r, g, b);
      if (c._c !== col) {
        c._c = col;
        if (!m) c.setAttribute('fill', '#d8d8d0');
        else {
          const k = 255 / m;
          const boost = (x) => Math.round(Math.min(255, x * k * 0.55 + x * 0.45 + 30 * (x > 0)));
          c.setAttribute('fill', `rgb(${boost(r)},${boost(g)},${boost(b)})`);
        }
      }
      if (m > 8) gl += `<circle cx="${c.getAttribute('cx')}" cy="${c.getAttribute('cy')}" r="${(5 + m / 40).toFixed(1)}" fill="rgb(${r},${g},${b})" opacity="${Math.min(0.9, 0.25 + m / 300).toFixed(2)}"/>`;
    });
    if (glow._g !== gl) { glow._g = gl; glow.innerHTML = gl; glow.setAttribute('filter', 'url(#glow)'); }
  },
});

export { NEO_LAYOUTS };
