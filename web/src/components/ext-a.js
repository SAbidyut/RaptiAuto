// More components (group A): power regulator, pressure sensor, current / voltage sensor modules, DIP switch, optocoupler.
import { register } from './registry.js';
import { rect, circle, text, path, lead, maleHeader } from './draw.js';
import { Resistor, Switch, Diode, ControlledSwitch, DependentSource, vAt } from '../sim/circuit/solver.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pinRow = (ids, y = 0) => ids.map((id, i) => ({ id, x: i * 10, y }));

// ------------------------------------------------------------------ linear voltage regulators
const REGS = {
  '7805': { name: '7805 (5 V)', vout: 5, drop: 2.0, tab: 'L7805CV' },
  '7809': { name: '7809 (9 V)', vout: 9, drop: 2.0, tab: 'L7809CV' },
  '7812': { name: '7812 (12 V)', vout: 12, drop: 2.0, tab: 'L7812CV' },
  'ams1117-3v3': { name: 'AMS1117-3.3 (3.3 V)', vout: 3.3, drop: 1.1, tab: 'AMS1117' },
};
register({
  type: 'regulator', name: 'Voltage Regulator (78xx / 1117)', category: 'power', tags: ['regulator', '7805', '7812', 'lm7805', 'ams1117', '3.3v', 'linear', 'ldo', 'power supply'],
  description: 'Linear regulator: IN → OUT gives a steady 5 V (7805), 9 V, 12 V or 3.3 V (AMS1117) as long as IN is at least ~2 V (1.1 V for the 1117) above the output. Connect GND to the common ground.',
  box: [-10, -52, 34, 2],
  pins: [{ id: 'IN', x: 0, y: 0 }, { id: 'GND', x: 10, y: 0 }, { id: 'OUT', x: 20, y: 0 }],
  props: [{ key: 'model', label: 'Model', type: 'select', options: Object.entries(REGS).map(([k, v]) => [k, v.name]), default: '7805' }],
  render(p) {
    const r = REGS[p.model] || REGS['7805'];
    let s = [0, 10, 20].map((x) => lead(x, 0, -14, { color: '#c8ccd2' })).join('');
    s += `<g filter="url(#softShadow)">${rect(-8, -52, 32, 12, { fill: '#9aa0a8', rx: 1.5 })}${circle(8, -46, 2.4, { fill: '#2b2f36' })}${rect(-8, -40, 32, 26, { fill: '#17181b', rx: 1.5 })}</g>`;
    s += text(8, -32, r.tab, { size: 3.6, fill: '#d1d5db', font: 'monospace', weight: 700 });
    s += text(8, -24, r.vout + ' V', { size: 4.5, fill: '#9ca3af', font: 'monospace' });
    s += text(0, -7, 'IN', { size: 2.8, fill: '#9ca3af' }) + text(10, -7, 'G', { size: 2.8, fill: '#9ca3af' }) + text(20, -7, 'OUT', { size: 2.8, fill: '#9ca3af' });
    return s;
  },
  sim: {
    create(ctx) {
      const r = REGS[ctx.props.model] || REGS['7805'];
      const inN = ctx.node('IN'), gnd = ctx.node('GND'), out = ctx.node('OUT');
      ctx.add(new Resistor(inN, gnd, 4000)); // quiescent current ≈ 5 mA at 20 V
      ctx.add(new DependentSource(out, gnd, (V) => {
        const vin = vAt(V, inN) - vAt(V, gnd);
        if (vin < 1.2) return null;
        return clamp(vin - r.drop, 0, r.vout);
      }, 0.4));
      return { visual: {} };
    },
  },
});

// ------------------------------------------------------------------ BMP280 pressure + temperature (I²C)
register({
  type: 'bmp280', name: 'BMP280 Pressure / Temperature', category: 'sensors', tags: ['bmp280', 'bme280', 'pressure', 'barometer', 'altitude', 'temperature', 'i2c', 'weather'],
  description: 'Barometric pressure and temperature over I²C. Library: Adafruit_BMP280 (bmp.begin(0x76), readTemperature(), readPressure() in Pa, readAltitude()). Set the weather with the sliders while running.',
  box: [-12, -50, 72, 4],
  pins: pinRow(['VCC', 'GND', 'SCL', 'SDA', 'CSB', 'SDO']),
  i2cPins: { sda: 'SDA', scl: 'SCL' },
  props: [{ key: 'address', label: 'I²C address', type: 'select', options: [['118', '0x76'], ['119', '0x77']], default: '118' }],
  controls: [
    { key: 'temp', label: 'Temperature', min: -40, max: 85, step: 0.1, unit: '°C', default: 24 },
    { key: 'press', label: 'Pressure', min: 300, max: 1100, step: 0.5, unit: 'hPa', default: 1013 },
  ],
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-12, -50, 72, 52, { fill: '#7c3aed', rx: 3 })}</g>`;
    s += rect(8, -42, 20, 18, { fill: '#c0c4cc', rx: 1.5 }) + circle(18, -33, 2.6, { fill: '#2b2f36' }) + text(18, -26.5, 'BMP280', { size: 2.8, fill: '#374151', weight: 700 });
    s += rect(32, -40, 22, 14, { fill: '#0f172a', rx: 1.5 });
    s += text(43, -36, '', { size: 3.6, fill: '#a5f3fc', font: 'JetBrains Mono, monospace', cls: 'bmp-t' });
    s += text(43, -30, '', { size: 3.2, fill: '#c4b5fd', font: 'JetBrains Mono, monospace', cls: 'bmp-p' });
    s += maleHeader([0, 10, 20, 30, 40, 50].map((x) => [x, 0]));
    s += ['VCC', 'GND', 'SCL', 'SDA', 'CSB', 'SDO'].map((t, i) => text(i * 10, -8, t, { size: 2.8, fill: '#fff' })).join('');
    return s;
  },
  sim: {
    create(ctx) {
      const vcc = ctx.node('VCC'), gnd = ctx.node('GND');
      ctx.add(new Resistor(vcc, gnd, 4000));
      const addr = Number(ctx.props.address);
      const values = { temp: 24, press: 1013 };
      let ptr = 0;
      return {
        bmp: true,
        i2c: { address: addr },
        values, visual: { temp: 24, press: 1013, on: false },
        powered() { return ctx.v(vcc) - ctx.v(gnd) > 1.7; },
        read() { return { t: values.temp, p: values.press }; },
        input(k, v) { if (k in values) { values[k] = v; this.visual.temp = values.temp; this.visual.press = values.press; } },
        after() { this.visual.on = this.powered(); return false; },
        i2cWrite(b) { if (b.length) ptr = b[0]; },
        i2cRead(n) { return Array.from({ length: n }, (_, i) => (ptr + i === 0xd0 ? 0x58 : 0)); },
      };
    },
  },
  update(el, v) {
    const k = `${v.on}|${v.temp.toFixed(1)}|${v.press.toFixed(0)}`;
    if (el._k === k) return;
    el._k = k;
    el.querySelector('.bmp-t').textContent = v.on ? v.temp.toFixed(1) + '°C' : '';
    el.querySelector('.bmp-p').textContent = v.on ? v.press.toFixed(0) + 'hPa' : '';
  },
});

// ------------------------------------------------------------------ ACS712 current sensor module
const ACS = { '5': { name: '5 A', sens: 0.185 }, '20': { name: '20 A', sens: 0.1 }, '30': { name: '30 A', sens: 0.066 } };
register({
  type: 'acs712', name: 'ACS712 Current Sensor', category: 'sensors', tags: ['acs712', 'current', 'hall', 'ampere', 'analog', 'measure'],
  description: 'Hall-effect current sensor: put the load in series between IP+ and IP−. OUT = VCC/2 + 185 mV per amp (5 A model) — read it with analogRead(). With no current OUT is 2.5 V.',
  box: [-12, -48, 62, 4],
  pins: [{ id: 'VCC', x: 0, y: 0 }, { id: 'OUT', x: 10, y: 0 }, { id: 'GND', x: 20, y: 0 }, { id: 'IP+', x: 40, y: -42 }, { id: 'IP-', x: 40, y: -22, label: 'IP−' }],
  props: [{ key: 'range', label: 'Range', type: 'select', options: Object.entries(ACS).map(([k, v]) => [k, v.name]), default: '5' }],
  render(p) {
    let s = `<g filter="url(#softShadow)">${rect(-12, -48, 62, 52, { fill: '#0f766e', rx: 3 })}</g>`;
    s += rect(-4, -40, 26, 18, { fill: '#18181b', rx: 1.5 }) + text(9, -33, 'ACS712', { size: 3.4, fill: '#cbd5e1', font: 'monospace', weight: 700 }) + text(9, -27, (ACS[p.range] || ACS['5']).name, { size: 3, fill: '#94a3b8' });
    s += rect(34, -46, 14, 28, { fill: '#115e59', rx: 2, stroke: '#14b8a6', sw: 0.6 }) + circle(40, -42, 3, { fill: '#d4d4d8' }) + circle(40, -22, 3, { fill: '#d4d4d8' });
    s += text(30, -38, '+', { size: 4, fill: '#fff', weight: 700 }) + text(30, -22, '−', { size: 4, fill: '#fff', weight: 700 });
    s += text(9, -14, '', { size: 3.4, fill: '#a7f3d0', font: 'JetBrains Mono, monospace', cls: 'acs-i' });
    s += maleHeader([[0, 0], [10, 0], [20, 0]]);
    s += text(0, -7, 'VCC', { size: 2.8 }) + text(10, -7, 'OUT', { size: 2.8 }) + text(20, -7, 'GND', { size: 2.8 });
    return s;
  },
  sim: {
    create(ctx) {
      const vcc = ctx.node('VCC'), gnd = ctx.node('GND'), out = ctx.node('OUT'), ip = ctx.node('IP+'), im = ctx.node('IP-');
      const sens = (ACS[ctx.props.range] || ACS['5']).sens;
      const RSH = 0.0012;
      ctx.add(new Resistor(vcc, gnd, 2000));
      ctx.add(new Resistor(ip, im, RSH));
      let amps = 0;
      ctx.add(new DependentSource(out, gnd, (V) => {
        const sup = vAt(V, vcc) - vAt(V, gnd);
        if (sup < 3) return null;
        amps = (vAt(V, ip) - vAt(V, im)) / RSH;
        return clamp(sup / 2 + sens * (sup / 5) * amps, 0, sup);
      }, 100));
      return { visual: { i: 0 }, after() { this.visual.i = amps; return false; } };
    },
  },
  update(el, v) {
    const t = Math.abs(v.i) < 0.005 ? '0.00 A' : v.i.toFixed(2) + ' A';
    const n = el.querySelector('.acs-i');
    if (n.textContent !== t) n.textContent = t;
  },
});

// ------------------------------------------------------------------ 0–25 V voltage sensor module
register({
  type: 'voltage-sensor', name: 'Voltage Sensor Module (0–25 V)', category: 'sensors', tags: ['voltage sensor', 'divider', '25v', 'analog', 'battery monitor'],
  description: 'A 30 kΩ / 7.5 kΩ divider on a small board: S gives one fifth of the voltage between VIN and GND. Connect GND to the circuit ground and read S with analogRead() (5 V reference: 25 V → 5 V).',
  box: [-12, -34, 52, 4],
  pins: [{ id: 'S', x: 0, y: 0 }, { id: 'VIN', x: 10, y: 0 }, { id: 'GND', x: 20, y: 0 }],
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-12, -34, 52, 38, { fill: '#1e3a8a', rx: 3 })}</g>`;
    s += rect(-6, -28, 14, 9, { fill: '#cfd8e8', rx: 1 }) + rect(10, -28, 14, 9, { fill: '#cfd8e8', rx: 1 });
    s += text(14, -12, '0-25V', { size: 3.6, fill: '#bfdbfe', weight: 700 });
    s += maleHeader([[0, 0], [10, 0], [20, 0]]);
    s += text(0, -7, 'S', { size: 2.8 }) + text(10, -7, 'VIN', { size: 2.8 }) + text(20, -7, 'GND', { size: 2.8 });
    return s;
  },
  sim: {
    create(ctx) {
      const s = ctx.node('S'), vin = ctx.node('VIN'), gnd = ctx.node('GND');
      ctx.add(new Resistor(vin, s, 30000));
      ctx.add(new Resistor(s, gnd, 7500));
      return { visual: {} };
    },
  },
});

// ------------------------------------------------------------------ 8-way DIP switch
register({
  type: 'dip-switch-8', name: 'DIP Switch (8-way)', category: 'input', tags: ['dip switch', 'switch', '8 position', 'config', 'binary'],
  description: 'Eight small slide switches in one package. Switch n connects pin n on one side to pin n on the other. Tap the part while running and flip the switches in the panel.',
  box: [-6, -4, 76, 34],
  pins: [...pinRow(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'], 0), ...pinRow(['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'], 30)],
  controls: Array.from({ length: 8 }, (_, i) => ({ key: 's' + (i + 1), label: `Switch ${i + 1}`, type: 'toggle', default: false })),
  render() {
    let s = rect(-5, 3, 80, 24, { fill: '#c62828', rx: 2 });
    for (let i = 0; i < 8; i++) {
      s += rect(i * 10 - 1.6, 0, 3.2, 3, { fill: '#c8ccd2' }) + rect(i * 10 - 1.6, 27, 3.2, 3, { fill: '#c8ccd2' });
      s += rect(i * 10 - 3.2, 9, 6.4, 12, { fill: '#f5f5f5', rx: 1 });
      s += `<rect class="dip-k dip-k${i}" x="${i * 10 - 2.6}" y="15" width="5.2" height="5.2" rx="0.8" fill="#9ca3af"/>`;
      s += text(i * 10, 6.2, String(i + 1), { size: 2.6, fill: '#fff' });
    }
    s += text(35, 25.6, 'ON', { size: 2.8, fill: '#fff', weight: 700 });
    return s;
  },
  sim: {
    create(ctx) {
      const sw = [];
      for (let i = 1; i <= 8; i++) sw.push(ctx.add(new Switch(ctx.node('a' + i), ctx.node('b' + i), false, 0.05)));
      const visual = { on: new Array(8).fill(false) };
      const values = {};
      for (let i = 1; i <= 8; i++) values['s' + i] = false;
      return {
        visual, values,
        input(k, v) {
          const m = /^s([1-8])$/.exec(k);
          if (!m) return;
          const i = +m[1] - 1;
          sw[i].closed = !!v;
          values[k] = !!v;
          visual.on[i] = !!v;
          ctx.dirty();
        },
      };
    },
  },
  update(el, v) {
    for (let i = 0; i < 8; i++) {
      const k = el.querySelector('.dip-k' + i);
      if (k._on !== v.on[i]) { k._on = v.on[i]; k.setAttribute('y', v.on[i] ? 9.8 : 15.4); k.setAttribute('fill', v.on[i] ? '#22c55e' : '#9ca3af'); }
    }
  },
});

// ------------------------------------------------------------------ optocoupler 4N35 / PC817
register({
  type: 'optocoupler', name: 'Optocoupler (4N35 / PC817)', category: 'ics', tags: ['optocoupler', 'opto', '4n35', 'pc817', 'isolation', 'isolator'],
  description: 'An LED (A → K) lights a phototransistor (C, E) without any electrical connection. About 1 mA through the LED (use a resistor!) turns the output transistor on.',
  box: [-6, -4, 46, 34],
  pins: [{ id: 'A', x: 0, y: 0 }, { id: 'K', x: 10, y: 0 }, { id: 'E', x: 0, y: 30 }, { id: 'C', x: 10, y: 30 }],
  render() {
    let s = rect(-5, 3, 20, 24, { fill: '#1f2023', rx: 2 }) + path('M-5 12 a3 3 0 0 1 0 6', { fill: '#121214' });
    for (const [x, y] of [[0, 0], [10, 0], [0, 27], [10, 27]]) s += rect(x - 1.6, y, 3.2, 3, { fill: '#c8ccd2' });
    s += text(5, 15, 'PC817', { size: 3.3, fill: '#cfd2d6', font: 'monospace' });
    s += text(0, 7.5, 'A', { size: 2.6, fill: '#9ca3af' }) + text(10, 7.5, 'K', { size: 2.6, fill: '#9ca3af' }) + text(0, 22.5, 'E', { size: 2.6, fill: '#9ca3af' }) + text(10, 22.5, 'C', { size: 2.6, fill: '#9ca3af' });
    s += circle(15, 8, 1.8, { fill: '#ef4444', cls: 'opto-led', op: 0.25 });
    return s;
  },
  sim: {
    create(ctx) {
      const a = ctx.node('A'), k = ctx.node('K'), c = ctx.node('C'), e = ctx.node('E');
      const led = ctx.add(new Diode(a, k, 1.15, 12));
      const on = (V) => ((vAt(V, a) - vAt(V, k)) - 1.15) / 12 > 0.0007;
      ctx.add(new ControlledSwitch(c, e, on, 60));
      return { visual: { on: false }, after() { this.visual.on = led.on && (led.i || 0) > 0.0007; return false; } };
    },
  },
  update(el, v) {
    const l = el.querySelector('.opto-led');
    if (l._on !== v.on) { l._on = v.on; l.setAttribute('opacity', v.on ? 1 : 0.25); }
  },
});
