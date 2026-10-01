// Input devices: membrane keypad, joystick, rotary encoder, touch sensor, IR receiver + remote, tilt switch.
import { register } from './registry.js';
import { rect, circle, text, line, path, lead, maleHeader, smdLed } from './draw.js';
import { Resistor, Switch, VSource, DependentSource, vAt } from '../sim/circuit/solver.js';
import { h } from '../ui/widgets.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------ membrane keypad
const KEYS4 = [['1', '2', '3', 'A'], ['4', '5', '6', 'B'], ['7', '8', '9', 'C'], ['*', '0', '#', 'D']];
const KEYS3 = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['*', '0', '#']];
function keypadGeom(cols) {
  const keys = cols === 3 ? KEYS3 : KEYS4;
  const kw = 30, kh = 26, gap = 6;
  const W = cols * kw + (cols + 1) * gap, H = 4 * kh + 5 * gap;
  const npins = 4 + cols;
  const pinX0 = Math.round((W - (npins - 1) * 10) / 2 / 10) * 10;
  const pins = [];
  for (let i = 0; i < 4; i++) pins.push({ id: 'R' + (i + 1), x: pinX0 + i * 10, y: 0 });
  for (let i = 0; i < cols; i++) pins.push({ id: 'C' + (i + 1), x: pinX0 + (4 + i) * 10, y: 0 });
  const top = -H - 40;
  return { keys, kw, kh, gap, W, H, pins, top, box: [0, top, W, 2] };
}
function keypadDef(cols) {
  const G = keypadGeom(cols);
  return {
    type: cols === 3 ? 'keypad-4x3' : 'keypad-4x4', name: cols === 3 ? 'Keypad 4×3' : 'Keypad 4×4', category: 'input',
    tags: ['keypad', 'matrix', 'membrane', 'password', 'keys'],
    description: 'Matrix keypad: pressing a key connects its row pin to its column pin. Use the Keypad library.',
    box: G.box, pins: G.pins, interact: 'keypad',
    keyAt(lx, ly) {
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < cols; c++) {
          const x = G.gap + c * (G.kw + G.gap), y = G.top + G.gap + r * (G.kh + G.gap);
          if (lx >= x - 2 && lx <= x + G.kw + 2 && ly >= y - 2 && ly <= y + G.kh + 2) return G.keys[r][c];
        }
      }
      return null;
    },
    render() {
      let s = `<g filter="url(#softShadow)">${rect(0, G.top, G.W, G.H, { fill: '#e8eaee', rx: 6, stroke: '#c8ccd3', sw: 1 })}</g>`;
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < cols; c++) {
          const x = G.gap + c * (G.kw + G.gap), y = G.top + G.gap + r * (G.kh + G.gap);
          const k = G.keys[r][c];
          const accent = /[A-D]/.test(k) ? '#dc2626' : /[*#]/.test(k) ? '#2563eb' : '#1f2937';
          s += `<g class="key key-${k === '*' ? 'star' : k === '#' ? 'hash' : k}"><rect x="${x}" y="${y}" width="${G.kw}" height="${G.kh}" rx="5" fill="${accent}"/><rect class="key-hl" x="${x}" y="${y}" width="${G.kw}" height="${G.kh}" rx="5" fill="#22d3ee" opacity="0"/>${text(x + G.kw / 2, y + G.kh / 2, k, { size: 12, weight: 700, fill: '#fff' })}</g>`;
        }
      }
      const npins = G.pins.length;
      const x0 = G.pins[0].x, x1 = G.pins[npins - 1].x;
      s += rect(x0 - 6, -40, x1 - x0 + 12, 40, { fill: '#cfd3da', rx: 2, op: 0.95 });
      for (const p of G.pins) s += line(p.x, -40, p.x, -2, { stroke: '#9aa1ab', sw: 1 });
      s += maleHeader(G.pins.map((p) => [p.x, p.y]));
      for (const p of G.pins) s += text(p.x, -8, p.id, { size: 3.2, fill: '#1f2937', weight: 700 });
      return s;
    },
    sim: {
      create(ctx) {
        const sw = {};
        for (let r = 0; r < 4; r++) for (let c = 0; c < cols; c++) sw[G.keys[r][c]] = ctx.add(new Switch(ctx.node('R' + (r + 1)), ctx.node('C' + (c + 1)), false, 0.5));
        return {
          visual: { down: {} },
          keypad: { cols, keys: G.keys },
          pressed: new Set(),
          input(key, k, down) {
            if (key !== 'key' || !sw[k]) return;
            sw[k].closed = !!down;
            if (down) this.pressed.add(k); else this.pressed.delete(k);
            this.visual.down = Object.fromEntries([...this.pressed].map((x) => [x, 1]));
            ctx.dirty();
          },
        };
      },
    },
    update(el, v) {
      for (const g of el.querySelectorAll('.key')) {
        const k = g.getAttribute('class').split(' ')[1].slice(4);
        const key = k === 'star' ? '*' : k === 'hash' ? '#' : k;
        const d = !!v.down[key];
        if (g._d === d) continue;
        g._d = d;
        g.querySelector('.key-hl').setAttribute('opacity', d ? 0.55 : 0);
      }
    },
  };
}
register(keypadDef(4));
register(keypadDef(3));

// ------------------------------------------------------------------ joystick KY-023
register({
  type: 'joystick', name: 'Joystick Module', category: 'input', tags: ['joystick', 'thumbstick', 'ky-023', 'analog', 'game'],
  description: 'Two potentiometers (VRx, VRy) + push switch (SW, use INPUT_PULLUP). Drag the knob during simulation.',
  box: [-16, -84, 56, 4],
  pins: [{ id: 'GND', x: 0, y: 0 }, { id: '5V', x: 10, y: 0, label: '+5V' }, { id: 'VRx', x: 20, y: 0 }, { id: 'VRy', x: 30, y: 0 }, { id: 'SW', x: 40, y: 0 }],
  interact: 'joystick', knobCenter: [20, -44], knobRange: 16,
  controls: [{ key: 'x', label: 'X axis', min: -100, max: 100, step: 1, unit: '%', default: 0 }, { key: 'y', label: 'Y axis', min: -100, max: 100, step: 1, unit: '%', default: 0 }],
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-16, -84, 72, 88, { fill: '#1d4ed8', rx: 3 })}</g>`;
    s += circle(20, -44, 26, { fill: '#111827', stroke: '#000', sw: 0.8 });
    s += circle(20, -44, 20, { fill: '#1f2937' });
    s += `<g class="js-knob">${circle(20, -44, 15, { fill: '#2b2d31', stroke: '#111', sw: 1 })}${circle(20, -44, 11, { fill: '#3b3e45' })}${circle(17, -47, 5, { fill: 'rgba(255,255,255,.12)' })}</g>`;
    s += maleHeader([[0, 0], [10, 0], [20, 0], [30, 0], [40, 0]]);
    s += ['GND', '+5V', 'VRx', 'VRy', 'SW'].map((t, i) => text(i * 10, -8, t, { size: 3 })).join('');
    return s;
  },
  sim: {
    create(ctx) {
      const gnd = ctx.node('GND'), vcc = ctx.node('5V');
      const R = 10000;
      const mk = (pin) => {
        const n = ctx.node(pin);
        return [ctx.add(new Resistor(gnd, n, R / 2)), ctx.add(new Resistor(n, vcc, R / 2))];
      };
      const px = mk('VRx'), py = mk('VRy');
      const sw = ctx.add(new Switch(ctx.node('SW'), gnd, false));
      const rt = {
        visual: { x: 0, y: 0, pressed: false },
        values: { x: 0, y: 0 },
        set(x, y) {
          this.visual.x = clamp(x, -1, 1); this.visual.y = clamp(y, -1, 1);
          this.values.x = Math.round(this.visual.x * 100); this.values.y = Math.round(this.visual.y * 100);
          const fx = (this.visual.x + 1) / 2, fy = (1 - this.visual.y) / 2;
          px[0].setR(Math.max(1, R * fx)); px[1].setR(Math.max(1, R * (1 - fx)));
          py[0].setR(Math.max(1, R * fy)); py[1].setR(Math.max(1, R * (1 - fy)));
          ctx.dirty();
        },
        input(key, val) {
          if (key === 'xy') this.set(val[0], -val[1]);
          else if (key === 'x') this.set(val / 100, this.visual.y);
          else if (key === 'y') this.set(this.visual.x, val / 100);
          else if (key === 'press') { sw.closed = !!val; this.visual.pressed = !!val; ctx.dirty(); }
        },
      };
      rt.set(0, 0);
      return rt;
    },
  },
  update(el, v) {
    const k = `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.pressed}`;
    if (el._k === k) return;
    el._k = k;
    el.querySelector('.js-knob').setAttribute('transform', `translate(${(v.x * 12).toFixed(1)} ${(-v.y * 12).toFixed(1)})${v.pressed ? ' scale(1)' : ''}`);
    el.querySelector('.js-knob').style.filter = v.pressed ? 'brightness(1.6)' : '';
  },
});

// ------------------------------------------------------------------ rotary encoder KY-040
register({
  type: 'rotary-encoder', name: 'Rotary Encoder KY-040', category: 'input', tags: ['encoder', 'rotary', 'ky-040', 'knob', 'quadrature'],
  description: 'Incremental encoder: CLK and DT give quadrature pulses, SW is the push button. Drag to turn, tap to press.',
  box: [-14, -72, 54, 4],
  pins: [{ id: 'GND', x: 0, y: 0 }, { id: '+', x: 10, y: 0 }, { id: 'SW', x: 20, y: 0 }, { id: 'DT', x: 30, y: 0 }, { id: 'CLK', x: 40, y: 0 }],
  interact: 'encoder',
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-14, -72, 68, 76, { fill: '#1e3a8a', rx: 3 })}</g>`;
    s += rect(2, -60, 36, 36, { fill: 'url(#silver)', rx: 2 });
    s += `<g class="enc-knob">${circle(20, -42, 15, { fill: '#2b2d31', stroke: '#111', sw: 1 })}${[...Array(18)].map((_, i) => `<line x1="20" y1="-56" x2="20" y2="-53" stroke="#555" stroke-width="1.2" transform="rotate(${i * 20} 20 -42)"/>`).join('')}${line(20, -42, 20, -52, { stroke: '#e5e7eb', sw: 2 })}</g>`;
    s += maleHeader([[0, 0], [10, 0], [20, 0], [30, 0], [40, 0]]);
    s += ['GND', '+', 'SW', 'DT', 'CLK'].map((t, i) => text(i * 10, -8, t, { size: 3 })).join('');
    return s;
  },
  sim: {
    create(ctx) {
      const gnd = ctx.node('GND'), vcc = ctx.node('+');
      ctx.add(new Resistor(ctx.node('CLK'), vcc, 10000));
      ctx.add(new Resistor(ctx.node('DT'), vcc, 10000));
      const a = ctx.add(new Switch(ctx.node('CLK'), gnd, false, 1));
      const b = ctx.add(new Switch(ctx.node('DT'), gnd, false, 1));
      const sw = ctx.add(new Switch(ctx.node('SW'), gnd, false));
      const rt = {
        visual: { angle: 0, pressed: false },
        busyUntil: 0,
        input(key, val) {
          if (key === 'press') { sw.closed = !!val; this.visual.pressed = !!val; ctx.dirty(); return; }
          if (key !== 'rotate') return;
          const cw = val > 0;
          const t0 = Math.max(ctx.now(), this.busyUntil);
          const seq = cw ? [[1, 0], [1, 1], [0, 1], [0, 0]] : [[0, 1], [1, 1], [1, 0], [0, 0]];
          seq.forEach(([ca, cb], i) => ctx.schedule(t0 + (i + 1) * 1500, () => { a.closed = !!ca; b.closed = !!cb; ctx.dirty(); }));
          this.busyUntil = t0 + 6500;
          this.visual.angle += cw ? 18 : -18;
        },
      };
      return rt;
    },
  },
  update(el, v) {
    el.querySelector('.enc-knob').setAttribute('transform', `rotate(${v.angle} 20 -42)`);
  },
});

// ------------------------------------------------------------------ touch sensor TTP223
register({
  type: 'touch-sensor', name: 'Touch Sensor TTP223', category: 'input', tags: ['touch', 'capacitive', 'ttp223'],
  description: 'Capacitive touch button: SIG goes HIGH while touched. Tap and hold during simulation.',
  box: [-10, -50, 30, 4],
  pins: [{ id: 'SIG', x: 0, y: 0, label: 'I/O' }, { id: 'VCC', x: 10, y: 0 }, { id: 'GND', x: 20, y: 0 }],
  interact: 'press',
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-10, -50, 40, 54, { fill: '#dc2626', rx: 3 })}</g>`;
    s += circle(10, -30, 13, { fill: '#b91c1c', stroke: '#fca5a5', sw: 1 }) + `<circle class="touch-ring" cx="10" cy="-30" r="9" fill="none" stroke="#fff" stroke-width="1.5" opacity=".3"/>`;
    s += smdLed(25, -44, { cls: 'led-T', color: '#ff3030', off: '#7f1d1d', w: 3.5, h: 3 });
    s += maleHeader([[0, 0], [10, 0], [20, 0]]);
    s += ['I/O', 'VCC', 'GND'].map((t, i) => text(i * 10, -8, t, { size: 3 })).join('');
    return s;
  },
  sim: {
    create(ctx) {
      const vcc = ctx.node('VCC'), gnd = ctx.node('GND');
      ctx.add(new Resistor(vcc, gnd, 2000));
      const rt = {
        visual: { on: false },
        touched: false,
        input(key, val) { if (key === 'press') { this.touched = !!val; this.visual.on = !!val; ctx.dirty(); } },
      };
      ctx.add(new DependentSource(ctx.node('SIG'), gnd, (V) => { const sup = vAt(V, vcc) - vAt(V, gnd); return sup > 2 ? (rt.touched ? sup : 0) : null; }, 200));
      return rt;
    },
  },
  update(el, v) {
    if (el._on === v.on) return;
    el._on = v.on;
    el.querySelector('.touch-ring').setAttribute('opacity', v.on ? 1 : 0.3);
    el.querySelector('.led-T-glow').setAttribute('opacity', v.on ? 0.9 : 0);
  },
});

// ------------------------------------------------------------------ tilt switch
register({
  type: 'tilt-switch', name: 'Tilt Switch SW-520D', category: 'input', tags: ['tilt', 'ball switch', 'orientation'],
  description: 'Ball switch: conducts when upright, opens when tilted. Tap to tilt during simulation.',
  box: [-6, -34, 16, 0],
  pins: [{ id: '1', x: 0, y: 0 }, { id: '2', x: 10, y: 0 }],
  interact: 'toggle',
  render() {
    let s = lead(0, 0, -8) + lead(10, 0, -8);
    s += `<g class="tilt-body">${rect(-3, -32, 16, 24, { fill: 'url(#steel)', rx: 7, stroke: '#666', sw: 0.6 })}${circle(5, -14, 3.5, { fill: '#cbd5e1', cls: 'tilt-ball' })}</g>`;
    return s;
  },
  sim: {
    create(ctx) {
      const sw = ctx.add(new Switch(ctx.node('1'), ctx.node('2'), true));
      return { visual: { tilted: false }, input(k) { if (k === 'toggle') { this.visual.tilted = !this.visual.tilted; sw.closed = !this.visual.tilted; ctx.dirty(); } } };
    },
  },
  update(el, v) { el.querySelector('.tilt-body').setAttribute('transform', v.tilted ? 'rotate(35 5 -10)' : ''); },
});

// ------------------------------------------------------------------ IR receiver + remote
export const IR_REMOTE = [
  ['CH-', 0x45], ['CH', 0x46], ['CH+', 0x47], ['⏮', 0x44], ['⏭', 0x40], ['⏯', 0x43], ['−', 0x07], ['+', 0x15], ['EQ', 0x09],
  ['0', 0x16], ['100+', 0x19], ['200+', 0x0d], ['1', 0x0c], ['2', 0x18], ['3', 0x5e], ['4', 0x08], ['5', 0x1c], ['6', 0x5a], ['7', 0x42], ['8', 0x52], ['9', 0x4a],
];
register({
  type: 'ir-receiver', name: 'IR Receiver + Remote', category: 'input', tags: ['ir', 'infrared', 'remote', 'vs1838b', 'irremote', 'tsop'],
  description: 'VS1838B infrared receiver with a 21-key NEC remote. Tap the receiver while running to open the remote. Library: IRremote.',
  box: [-12, -46, 32, 4],
  pins: [{ id: 'OUT', x: 0, y: 0, label: 'S' }, { id: 'GND', x: 10, y: 0, label: '−' }, { id: 'VCC', x: 20, y: 0, label: '+' }],
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-12, -28, 44, 32, { fill: '#1f2937', rx: 3 })}</g>`;
    s += path('M-2 -26 V-40 A12 9 0 0 1 22 -40 V-26 Z', { fill: '#111', stroke: '#000', sw: 0.6 }) + circle(10, -38, 6, { fill: '#2a2a2e' });
    s += smdLed(26, -12, { cls: 'led-IR', color: '#ff3030', off: '#7f1d1d', w: 3.5, h: 3 });
    s += maleHeader([[0, 0], [10, 0], [20, 0]]);
    s += ['S', '−', '+'].map((t, i) => text(i * 10, -8, t, { size: 4 })).join('');
    return s;
  },
  sim: {
    create(ctx) {
      const vcc = ctx.node('VCC'), gnd = ctx.node('GND');
      ctx.add(new DependentSource(ctx.node('OUT'), gnd, (V) => { const sup = vAt(V, vcc) - vAt(V, gnd); return sup > 2.5 ? sup : null; }, 20000));
      ctx.add(new Resistor(vcc, gnd, 5000));
      return {
        visual: { flash: 0 },
        queue: [],
        ir: true,
        powered() { return ctx.v(vcc) - ctx.v(gnd) > 2.5; },
        input(key, cmd) {
          if (key !== 'ir') return;
          if (!this.powered()) { ctx.warn('IR receiver has no power (connect + and −).', 'irpow'); return; }
          this.queue.push({ command: cmd, address: 0, t: ctx.now() });
          if (this.queue.length > 8) this.queue.shift();
          this.visual.flash = performance.now();
        },
      };
    },
  },
  controlsUI(el, { input }) {
    const grid = h('div', { class: 'ir-remote' });
    for (const [label, code] of IR_REMOTE) {
      const b = h('button', { class: 'ir-key' + (/^[0-9]$/.test(label) ? '' : ' fn') }, label);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); input('ir', code); b.classList.add('down'); });
      const up = () => b.classList.remove('down');
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', up);
      grid.appendChild(b);
    }
    el.appendChild(h('p', { class: 'muted small' }, 'Press keys to send NEC codes to the IR receiver.'));
    el.appendChild(grid);
  },
  update(el, v) {
    const on = performance.now() - v.flash < 160;
    if (el._on === on) return;
    el._on = on;
    el.querySelector('.led-IR-glow').setAttribute('opacity', on ? 0.95 : 0);
  },
});
