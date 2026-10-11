// Sensors: ultrasonic, DHT, PIR, analog/digital sensor modules, LM35, DS18B20, MPU6050, RTC.
import { register } from './registry.js';
import { rect, circle, text, line, path, lead, maleHeader, smdLed } from './draw.js';
import { Resistor, VSource, DependentSource, vAt } from '../sim/circuit/solver.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pinRow = (ids) => ids.map((id, i) => ({ id, x: i * 10, y: 0 }));
const headerLabels = (ids, y = -8, size = 3) => ids.map((t, i) => text(i * 10, y, t, { size })).join('');

// ------------------------------------------------------------------ HC-SR04
register({
  type: 'hc-sr04', name: 'Ultrasonic Sensor HC-SR04', category: 'sensors', tags: ['ultrasonic', 'distance', 'sonar', 'hc-sr04', 'newping'],
  description: 'Measures distance (2–400 cm). Pulse TRIG for 10 µs, then pulseIn(ECHO, HIGH) → cm = µs / 58. Tap it while running to move the object.',
  box: [-40, -100, 70, 4],
  pins: pinRow(['VCC', 'TRIG', 'ECHO', 'GND']),
  controls: [{ key: 'distance', label: 'Object distance', min: 2, max: 400, step: 1, unit: 'cm', default: 100 }],
  render() {
    let s = `<g class="us-waves" opacity="0">${[0, 1, 2].map((i) => `<path d="M-14 ${-80 - i * 8} Q15 ${-92 - i * 10} 44 ${-80 - i * 8}" fill="none" stroke="#22d3ee" stroke-width="1.4" stroke-linecap="round" style="animation:usWave 1s linear infinite;animation-delay:${i * 0.3}s"/>`).join('')}</g>`;
    s += `<g filter="url(#softShadow)">${rect(-40, -56, 110, 58, { fill: '#1d4ed8', rx: 3 })}</g>`;
    for (const cx of [-14, 44]) {
      s += circle(cx, -32, 19, { fill: 'url(#silver)', stroke: '#6b7280', sw: 0.8 });
      s += circle(cx, -32, 14, { fill: '#2b2d31' });
      for (let k = 0; k < 4; k++) s += circle(cx, -32, 4 + k * 2.5, { fill: 'none', stroke: '#3a3d44', sw: 0.6 });
    }
    s += rect(8, -50, 14, 9, { fill: '#e5e7eb', rx: 1.5 }) + text(15, -45.5, '40 kHz', { size: 2.6, fill: '#333' });
    s += text(15, -19, 'HC-SR04', { size: 4.5, weight: 700 }) + rect(-34, -13, 98, 0.4, { fill: 'rgba(255,255,255,.2)' });
    s += `<text class="us-dist" x="15" y="-62" font-size="7" text-anchor="middle" fill="#a5f3fc" font-family="JetBrains Mono, monospace" font-weight="700">100 cm</text>`;
    s += maleHeader([[0, 0], [10, 0], [20, 0], [30, 0]]);
    s += headerLabels(['VCC', 'Trig', 'Echo', 'GND']);
    return s;
  },
  sim: {
    create(ctx) {
      const vcc = ctx.node('VCC'), gnd = ctx.node('GND'), echoN = ctx.node('ECHO');
      ctx.add(new Resistor(vcc, gnd, 330));
      const rt = {
        visual: { distance: 100, ping: 0 },
        values: { distance: 100 },
        distance: 100,
        trigHigh: null,
        pending: null,
        echoOn: false,
        powered() { return ctx.v(vcc) - ctx.v(gnd) > 4; },
        input(key, val) { if (key === 'distance') { this.distance = val; this.values.distance = val; this.visual.distance = val; } },
        widthUs() { return clamp(this.distance, 2, 400) * 58.3; },
        trigger(t) {
          if (!this.powered()) return;
          const start = t + 450;
          const width = this.distance > 400 ? 38000 : this.widthUs();
          this.pending = { start, width };
          this.visual.ping = performance.now();
          ctx.schedule(start, () => { this.echoOn = true; ctx.dirty(); });
          ctx.schedule(start + width, () => { this.echoOn = false; ctx.dirty(); if (this.pending && this.pending.start === start) this.pending = null; });
        },
        pulseOn(node, level) {
          if (node !== echoN || !level) return null;
          const p = this.pending;
          if (!p) return null;
          const now = ctx.now();
          if (now > p.start + p.width) return null;
          if (now > p.start) return { start: 0, width: p.start + p.width - now };
          return { start: p.start - now, width: p.width };
        },
        // NewPing helper: full measurement without pin-level timing
        measure() { if (!this.powered()) return 0; this.visual.ping = performance.now(); return this.distance > 400 ? 0 : this.widthUs(); },
      };
      ctx.add(new DependentSource(echoN, gnd, (V) => { const sup = vAt(V, vcc) - vAt(V, gnd); return sup > 4 ? (rt.echoOn ? sup : 0) : null; }, 100));
      ctx.watch('TRIG', (level, t) => {
        if (level === 1) rt.trigHigh = t;
        else if (level === 0 && rt.trigHigh !== null) {
          const w = t - rt.trigHigh;
          rt.trigHigh = null;
          if (w >= 2) rt.trigger(t);
        }
      });
      return rt;
    },
  },
  update(el, v) {
    const active = performance.now() - v.ping < 400;
    const w = el.querySelector('.us-waves');
    if (w._a !== active) { w._a = active; w.setAttribute('opacity', active ? 1 : 0); }
    const d = Math.round(v.distance);
    if (el._d !== d) { el._d = d; el.querySelector('.us-dist').textContent = d + ' cm'; }
  },
});

// ------------------------------------------------------------------ DHT11 / DHT22
register({
  type: 'dht22', name: 'DHT22 / DHT11 Temp & Humidity', category: 'sensors', tags: ['dht', 'dht22', 'dht11', 'am2302', 'temperature', 'humidity'],
  description: 'Digital temperature & humidity sensor (single data wire). Library: DHT dht(pin, DHT22).',
  box: [-12, -80, 42, 4],
  pins: [{ id: 'VCC', x: 0, y: 0 }, { id: 'DATA', x: 10, y: 0, label: 'SDA' }, { id: 'NC', x: 20, y: 0 }, { id: 'GND', x: 30, y: 0 }],
  props: [{ key: 'model', label: 'Model', type: 'select', options: [['22', 'DHT22 (white, ±0.5°C)'], ['11', 'DHT11 (blue, ±2°C)']], default: '22' }],
  controls: [
    { key: 'temp', label: 'Temperature', min: -40, max: 80, step: 0.1, unit: '°C', default: 24 },
    { key: 'hum', label: 'Humidity', min: 0, max: 100, step: 0.5, unit: '%', default: 55 },
  ],
  render(p) {
    const body = p.model === '11' ? '#3b82f6' : '#f1f5f9';
    const grill = p.model === '11' ? '#2563eb' : '#cbd5e1';
    let s = [0, 10, 20, 30].map((x) => lead(x, 0, -10)).join('');
    s += `<g filter="url(#softShadow)">${rect(-12, -80, 54, 72, { fill: body, rx: 3 })}</g>`;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) s += rect(-6 + c * 9, -74 + r * 9, 6, 6, { fill: grill, rx: 1 });
    s += rect(-12, -22, 54, 14, { fill: body, rx: 2 }) + text(15, -15, p.model === '11' ? 'DHT11' : 'DHT22', { size: 5, fill: p.model === '11' ? '#fff' : '#334155', weight: 700 });
    s += `<text class="dht-val" x="15" y="-86" font-size="6" text-anchor="middle" fill="#a5f3fc" font-family="JetBrains Mono, monospace" font-weight="700"></text>`;
    return s;
  },
  sim: {
    create(ctx) {
      const vcc = ctx.node('VCC'), gnd = ctx.node('GND');
      ctx.add(new Resistor(vcc, gnd, 3000));
      ctx.add(new VSource(ctx.node('DATA'), gnd, 5, 15000)); // weak internal pull-up / idle high
      return {
        dht: { model: Number(ctx.props.model) },
        visual: { temp: 24, hum: 55, shown: false },
        values: { temp: 24, hum: 55 },
        powered() { return ctx.v(vcc) - ctx.v(gnd) > 3; },
        input(key, val) { if (key === 'temp' || key === 'hum') { this.values[key] = val; this.visual[key] = val; } },
        read() { this.visual.shown = true; return { t: this.values.temp, h: this.values.hum }; },
      };
    },
  },
  update(el, v) {
    const s = v.shown ? `${v.temp.toFixed(1)}°C ${Math.round(v.hum)}%` : '';
    if (el._s !== s) { el._s = s; el.querySelector('.dht-val').textContent = s; }
  },
});

// ------------------------------------------------------------------ PIR motion sensor
register({
  type: 'pir', name: 'PIR Motion Sensor HC-SR501', category: 'sensors', tags: ['pir', 'motion', 'hc-sr501', 'human', 'alarm', 'security'],
  description: 'OUT goes HIGH (3.3 V) when motion is detected and stays HIGH for the hold time. Tap it while running and press "Simulate motion".',
  box: [-24, -76, 54, 4],
  pins: pinRow(['VCC', 'OUT', 'GND']),
  props: [{ key: 'hold', label: 'Hold time', type: 'select', options: [['1', '1 s'], ['3', '3 s'], ['5', '5 s'], ['10', '10 s']], default: '3' }],
  controls: [{ key: 'motion', label: 'Simulate motion', type: 'button', icon: 'users' }],
  render() {
    let s = `<g class="pir-wave" opacity="0">${[0, 1, 2].map((i) => `<circle cx="10" cy="-44" r="${30 + i * 10}" fill="none" stroke="#f472b6" stroke-width="1.2" style="animation:pirWave 1.4s ease-out infinite;animation-delay:${i * 0.4}s;transform-origin:10px -44px"/>`).join('')}</g>`;
    s += `<g filter="url(#softShadow)">${rect(-24, -66, 68, 66, { fill: '#15803d', rx: 3 })}</g>`;
    s += `<circle cx="10" cy="-36" r="26" fill="#f8fafc" stroke="#cbd5e1" stroke-width="0.8"/>`;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s += `<path d="M${-6 + c * 8} ${-52 + r * 8} h8 v8 h-8z" fill="none" stroke="#e2e8f0" stroke-width="0.7"/>`;
    s += `<circle class="pir-glow" cx="10" cy="-36" r="26" fill="#f472b6" opacity="0"/>`;
    s += maleHeader([[0, 0], [10, 0], [20, 0]]);
    s += headerLabels(['VCC', 'OUT', 'GND']);
    return s;
  },
  sim: {
    create(ctx) {
      const vcc = ctx.node('VCC'), gnd = ctx.node('GND');
      ctx.add(new Resistor(vcc, gnd, 6000));
      const hold = Number(ctx.props.hold) * 1e6;
      const rt = {
        visual: { on: false },
        until: 0,
        powered() { return ctx.v(vcc) - ctx.v(gnd) > 4; },
        input(key, val) {
          if (key !== 'motion' || !val) return;
          const now = ctx.now();
          this.until = now + hold;
          if (!this.visual.on) { this.visual.on = true; ctx.dirty(); }
          const u = this.until;
          ctx.schedule(u, () => { if (this.until === u) { this.visual.on = false; ctx.dirty(); } });
        },
      };
      ctx.add(new DependentSource(ctx.node('OUT'), gnd, (V) => (vAt(V, vcc) - vAt(V, gnd) > 4 ? (rt.visual.on ? 3.3 : 0) : null), 300));
      return rt;
    },
  },
  update(el, v) {
    if (el._on === v.on) return;
    el._on = v.on;
    el.querySelector('.pir-wave').setAttribute('opacity', v.on ? 1 : 0);
    el.querySelector('.pir-glow').setAttribute('opacity', v.on ? 0.25 : 0);
  },
});

// ------------------------------------------------------------------ generic analog / digital sensor modules
const MODULES = [
  {
    type: 'ldr-module', name: 'Light Sensor Module (LDR)', tags: ['light', 'ldr', 'photoresistor', 'lux'], key: 'lux', label: 'Light', min: 0, max: 2000, unit: 'lux', def: 300,
    desc: 'AO: analog light level (lower voltage = brighter). DO goes LOW when it is brighter than the threshold.',
    ao: (v) => 1 - clamp(Math.log10(1 + v) / Math.log10(2001), 0, 1), doLow: (v) => v > 150,
    draw: () => circle(10, -36, 7, { fill: '#e9d3a5', stroke: '#b89a66', sw: 0.6 }) + path('M5 -39 H15 M5 -39 Q3 -37 5 -35 H15 Q17 -33 15 -31 H5', { stroke: '#c0392b', sw: 1 }),
  },
  {
    type: 'sound-sensor', name: 'Sound Sensor (KY-038)', tags: ['sound', 'microphone', 'clap', 'noise'], key: 'level', label: 'Sound level', min: 0, max: 100, unit: 'dB', def: 35,
    desc: 'AO: microphone level. DO goes HIGH when it is louder than the threshold (clap detector).',
    ao: (v) => clamp(v / 100, 0, 1) * 0.9 + 0.05, doHigh: (v) => v > 60,
    draw: () => circle(10, -36, 9, { fill: '#1f2937', stroke: '#6b7280', sw: 1.5 }) + circle(10, -36, 5, { fill: '#374151' }),
  },
  {
    type: 'flame-sensor', name: 'Flame Sensor (KY-026)', tags: ['flame', 'fire', 'infrared'], key: 'flame', label: 'Flame intensity', min: 0, max: 100, unit: '%', def: 0,
    desc: 'IR flame detector. AO voltage drops near a flame, DO goes LOW when a flame is detected.',
    ao: (v) => 1 - clamp(v / 100, 0, 1) * 0.95, doLow: (v) => v > 30,
    draw: () => rect(4, -46, 12, 18, { fill: '#111', rx: 6 }) + circle(10, -44, 5, { fill: '#1e293b' }),
  },
  {
    type: 'gas-sensor', name: 'Gas Sensor MQ-2', tags: ['gas', 'smoke', 'mq-2', 'lpg', 'mq2', 'air quality'], key: 'ppm', label: 'Gas concentration', min: 100, max: 10000, unit: 'ppm', def: 300,
    desc: 'Smoke / LPG / methane sensor. AO rises with gas concentration; DO goes LOW above the threshold.',
    ao: (v) => clamp(0.1 + 0.85 * Math.log10(v / 100) / 2, 0, 1), doLow: (v) => v > 1000,
    draw: () => circle(10, -38, 13, { fill: 'url(#silver)', stroke: '#888', sw: 0.6 }) + circle(10, -38, 9, { fill: '#9ca3af' }) + [...Array(5)].map((_, i) => line(2, -42 + i * 2, 18, -42 + i * 2, { stroke: '#6b7280', sw: 0.6 })).join(''),
  },
  {
    type: 'soil-sensor', name: 'Soil Moisture Sensor', tags: ['soil', 'moisture', 'plant', 'water', 'garden'], key: 'moist', label: 'Soil moisture', min: 0, max: 100, unit: '%', def: 40,
    desc: 'AO: high value = dry soil, low = wet. DO goes LOW when soil is wet enough.',
    ao: (v) => 1 - clamp(v / 100, 0, 1) * 0.75, doLow: (v) => v > 50,
    draw: () => rect(0, -54, 20, 30, { fill: '#b45309', rx: 2, op: 0.3 }) + rect(2, -54, 5, 30, { fill: '#d4a83a' }) + rect(13, -54, 5, 30, { fill: '#d4a83a' }),
  },
  {
    type: 'rain-sensor', name: 'Rain Sensor', tags: ['rain', 'water', 'weather', 'drops'], key: 'wet', label: 'Rain', min: 0, max: 100, unit: '%', def: 0,
    desc: 'AO drops as the rain board gets wet; DO goes LOW when rain is detected.',
    ao: (v) => 1 - clamp(v / 100, 0, 1) * 0.8, doLow: (v) => v > 25,
    draw: () => rect(-2, -56, 24, 30, { fill: '#065f46', rx: 1 }) + [...Array(6)].map((_, i) => line(0, -52 + i * 4.5, 20, -52 + i * 4.5, { stroke: '#d4a83a', sw: 1 })).join(''),
  },
  {
    type: 'water-level', name: 'Water Level Sensor', tags: ['water', 'level', 'tank', 'liquid'], key: 'level', label: 'Water level', min: 0, max: 100, unit: '%', def: 30, analogOnly: true,
    desc: 'Analog output (S) rises with the water level.',
    ao: (v) => clamp(v / 100, 0, 1) * 0.7, draw: () => rect(0, -58, 20, 34, { fill: '#b91c1c', rx: 1 }) + [...Array(5)].map((_, i) => rect(2 + i * 3.6, -56, 1.6, 30, { fill: '#d4a83a' })).join(''),
  },
  {
    type: 'ir-obstacle', name: 'IR Obstacle Sensor', tags: ['ir', 'obstacle', 'proximity', 'robot', 'avoidance'], key: 'obstacle', label: 'Obstacle distance', min: 0, max: 30, unit: 'cm', def: 25, digitalOnly: true,
    desc: 'OUT goes LOW when an object is closer than ~10 cm (adjustable on the real module).',
    doLow: (v) => v < 10, draw: () => circle(5, -44, 4.5, { fill: '#e5e7eb' }) + circle(15, -44, 4.5, { fill: '#111' }),
  },
  {
    type: 'line-sensor', name: 'Line Tracking Sensor (TCRT5000)', tags: ['line', 'follower', 'tcrt5000', 'robot', 'black'], key: 'black', label: 'Surface', ctl: 'toggle', unit: '', def: 0, digitalOnly: true, toggleLabel: 'Black line under sensor',
    desc: 'OUT goes HIGH over a black line (no reflection) and LOW over white.',
    doHigh: (v) => !!v, draw: () => rect(2, -50, 16, 9, { fill: '#111', rx: 2 }) + circle(6, -45.5, 2.5, { fill: '#60a5fa' }) + circle(14, -45.5, 2.5, { fill: '#1e293b' }),
  },
  {
    type: 'hall-sensor', name: 'Hall Effect Sensor (KY-003)', tags: ['hall', 'magnet', 'magnetic', 'a3144'], key: 'magnet', label: 'Magnet nearby', ctl: 'toggle', def: 0, digitalOnly: true,
    desc: 'OUT goes LOW when a magnet is near.', doLow: (v) => !!v, draw: () => rect(6, -46, 8, 8, { fill: '#111', rx: 1 }),
  },
  {
    type: 'vibration-sensor', name: 'Vibration Sensor (SW-420)', tags: ['vibration', 'shake', 'knock', 'sw-420'], key: 'shake', label: 'Shake!', ctl: 'button', def: 0, digitalOnly: true,
    desc: 'OUT goes HIGH while the module is vibrating.', doHigh: (v) => !!v, draw: () => rect(3, -50, 14, 10, { fill: 'url(#silver)', rx: 4 }),
  },
  {
    type: 'ntc-module', name: 'Thermistor Module (NTC)', tags: ['temperature', 'ntc', 'thermistor', 'ky-013'], key: 'temp', label: 'Temperature', min: -20, max: 100, unit: '°C', def: 25, analogOnly: true,
    desc: 'Analog temperature: 10 kΩ NTC (B=3950) in a divider with 10 kΩ. Higher temperature → lower voltage.',
    ao: (v) => { const R = 10000 * Math.exp(3950 * (1 / (v + 273.15) - 1 / 298.15)); return R / (R + 10000); },
    draw: () => circle(10, -42, 4, { fill: '#111' }) + lead(10, -38, -32),
  },
];

for (const m of MODULES) {
  const pins = m.digitalOnly ? pinRow(['VCC', 'GND', 'DO']) : m.analogOnly ? pinRow(['VCC', 'GND', 'AO']) : pinRow(['VCC', 'GND', 'DO', 'AO']);
  const ids = pins.map((p) => p.id);
  const W = Math.max(40, (pins.length - 1) * 10 + 20);
  const ctl = m.ctl === 'toggle'
    ? { key: m.key, label: m.toggleLabel || m.label, type: 'toggle', default: 0 }
    : m.ctl === 'button'
      ? { key: m.key, label: m.label, type: 'button', icon: 'bolt' }
      : { key: m.key, label: m.label, min: m.min, max: m.max, step: m.max > 1000 ? 10 : m.max <= 30 ? 0.5 : 1, unit: m.unit, default: m.def };
  register({
    type: m.type, name: m.name, category: 'sensors', tags: m.tags, description: m.desc,
    box: [-10, -64, W - 10, 4],
    pins,
    controls: [ctl],
    render() {
      let s = `<g filter="url(#softShadow)">${rect(-10, -64, W, 66, { fill: '#1d4ed8', rx: 3 })}</g>`;
      s += m.draw();
      if (!m.analogOnly) s += smdLed(W - 16, -20, { cls: 'led-DO', color: '#22ff66', off: '#14532d', w: 4, h: 3 }) + text(W - 16, -15, 'DO', { size: 2.6 });
      s += smdLed(-4, -20, { cls: 'led-PWR', color: '#ff3030', off: '#7f1d1d', w: 4, h: 3 }) + text(-4, -15, 'PWR', { size: 2.6 });
      if (!m.analogOnly && !m.digitalOnly) s += circle(W - 22, -54, 4, { fill: '#2563eb', stroke: '#93c5fd', sw: 0.8 });
      s += maleHeader(pins.map((p) => [p.x, p.y]));
      s += headerLabels(ids);
      return s;
    },
    sim: {
      create(ctx) {
        const vcc = ctx.node('VCC'), gnd = ctx.node('GND');
        ctx.add(new Resistor(vcc, gnd, 1500));
        const sup = (V) => vAt(V, vcc) - vAt(V, gnd);
        const doHigh = (v) => (m.doHigh ? m.doHigh(v) : !m.doLow(v));
        const rt = {
          visual: { pwr: false, d: false },
          values: { [m.key]: m.def },
          v: m.def,
          after() {
            const on = ctx.v(vcc) - ctx.v(gnd) > 2.5;
            this.visual.pwr = on;
            if (ids.includes('DO')) { const hi = doHigh(this.v); this.visual.d = on && (m.doHigh ? hi : !hi); }
            return false;
          },
          input(key, val) {
            if (key !== m.key) return;
            this.v = typeof val === 'boolean' ? (val ? 1 : 0) : val;
            this.values[m.key] = this.v;
            ctx.dirty();
          },
        };
        if (ids.includes('AO')) ctx.add(new DependentSource(ctx.node('AO'), gnd, (V) => { const s0 = sup(V); return s0 > 2.5 ? s0 * m.ao(rt.v) : null; }, 1000));
        if (ids.includes('DO')) ctx.add(new DependentSource(ctx.node('DO'), gnd, (V) => { const s0 = sup(V); return s0 > 2.5 ? (doHigh(rt.v) ? s0 : 0) : null; }, 220));
        return rt;
      },
    },
    update(el, v) {
      const k = `${v.pwr}${v.d}`;
      if (el._k === k) return;
      el._k = k;
      const p = el.querySelector('.led-PWR-glow');
      if (p) p.setAttribute('opacity', v.pwr ? 0.85 : 0);
      const d = el.querySelector('.led-DO-glow');
      if (d) d.setAttribute('opacity', v.d ? 0.9 : 0);
    },
  });
}

// ------------------------------------------------------------------ LM35
register({
  type: 'lm35', name: 'LM35 Temperature Sensor', category: 'sensors', tags: ['lm35', 'temperature', 'analog', 'tmp36'],
  description: 'Analog temperature sensor: Vout = 10 mV/°C. °C = analogRead × 500 / 1024 on a 5 V Arduino.',
  box: [-5, -28, 25, 6],
  pins: [{ id: 'VS', x: 0, y: 0, label: '+Vs' }, { id: 'OUT', x: 10, y: 0, label: 'Vout' }, { id: 'GND', x: 20, y: 0 }],
  controls: [{ key: 'temp', label: 'Temperature', min: -10, max: 150, step: 0.5, unit: '°C', default: 25 }],
  render() {
    let s = [0, 10, 20].map((x) => lead(x, 0, -8)).join('');
    s += path('M-4 -8 H24 V-20 A14 12 0 0 0 -4 -20 Z', { fill: '#1d1d20' }) + text(10, -14, 'LM35', { size: 4, fill: '#bbb', font: 'monospace' });
    s += ['+Vs', 'Out', 'GND'].map((t, i) => text(i * 10, 5, t, { size: 3.2, fill: '#ddd' })).join('');
    return s;
  },
  sim: {
    create(ctx) {
      const vs = ctx.node('VS'), gnd = ctx.node('GND');
      ctx.add(new Resistor(vs, gnd, 80000));
      const rt = {
        visual: {}, values: { temp: 25 }, temp: 25,
        input(k, v) { if (k === 'temp') { this.temp = v; this.values.temp = v; ctx.dirty(); } },
      };
      ctx.add(new DependentSource(ctx.node('OUT'), gnd, (V) => (vAt(V, vs) - vAt(V, gnd) > 3.5 ? clamp(rt.temp, 2, 150) * 0.01 : 0), 50));
      return rt;
    },
  },
});

// ------------------------------------------------------------------ DS18B20
register({
  type: 'ds18b20', name: 'DS18B20 Temperature (1-Wire)', category: 'sensors', tags: ['ds18b20', 'temperature', 'onewire', 'dallas'],
  description: 'Digital 1-Wire thermometer. Needs a 4.7 kΩ pull-up on DQ. Libraries: OneWire + DallasTemperature.',
  box: [-5, -28, 25, 6],
  pins: [{ id: 'GND', x: 0, y: 0 }, { id: 'DQ', x: 10, y: 0 }, { id: 'VDD', x: 20, y: 0 }],
  controls: [{ key: 'temp', label: 'Temperature', min: -55, max: 125, step: 0.0625, unit: '°C', default: 23 }],
  render() {
    let s = [0, 10, 20].map((x) => lead(x, 0, -8)).join('');
    s += path('M-4 -8 H24 V-20 A14 12 0 0 0 -4 -20 Z', { fill: '#1d1d20' }) + text(10, -14, '18B20', { size: 4, fill: '#bbb', font: 'monospace' });
    s += ['GND', 'DQ', 'VDD'].map((t, i) => text(i * 10, 5, t, { size: 3.2, fill: '#ddd' })).join('');
    return s;
  },
  sim: {
    create(ctx) {
      const vdd = ctx.node('VDD'), gnd = ctx.node('GND'), dq = ctx.node('DQ');
      ctx.add(new Resistor(vdd, gnd, 50000));
      return {
        onewire: true, dq,
        visual: {}, values: { temp: 23 }, temp: 23,
        input(k, v) { if (k === 'temp') { this.temp = v; this.values.temp = v; } },
        status() {
          const pw = ctx.v(vdd) - ctx.v(gnd) > 2.8;
          const pulled = ctx.v(dq) - ctx.v(gnd) > 2.5;
          return { ok: pw && pulled, powered: pw, pulled };
        },
      };
    },
  },
});

// ------------------------------------------------------------------ MPU6050
register({
  type: 'mpu6050', name: 'MPU6050 Accelerometer + Gyro', category: 'sensors', tags: ['mpu6050', 'gy-521', 'accelerometer', 'gyroscope', 'imu', 'tilt'],
  description: '6-axis IMU on I²C (0x68). Libraries: Adafruit_MPU6050, MPU6050, or raw Wire registers.',
  box: [-12, -74, 82, 4],
  pins: pinRow(['VCC', 'GND', 'SCL', 'SDA', 'XDA', 'XCL', 'AD0', 'INT']),
  i2cPins: { sda: 'SDA', scl: 'SCL' },
  controls: [
    { key: 'ax', label: 'Accel X', min: -2, max: 2, step: 0.01, unit: 'g', default: 0 },
    { key: 'ay', label: 'Accel Y', min: -2, max: 2, step: 0.01, unit: 'g', default: 0 },
    { key: 'az', label: 'Accel Z', min: -2, max: 2, step: 0.01, unit: 'g', default: 1 },
    { key: 'gx', label: 'Gyro X', min: -250, max: 250, step: 1, unit: '°/s', default: 0 },
    { key: 'gy', label: 'Gyro Y', min: -250, max: 250, step: 1, unit: '°/s', default: 0 },
    { key: 'gz', label: 'Gyro Z', min: -250, max: 250, step: 1, unit: '°/s', default: 0 },
    { key: 'temp', label: 'Temperature', min: -40, max: 85, step: 0.5, unit: '°C', default: 25 },
  ],
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-12, -74, 94, 78, { fill: '#1d4ed8', rx: 3 })}</g>`;
    s += `<g class="mpu-chip">${rect(18, -52, 26, 26, { fill: '#18181b', rx: 2 })}${text(31, -39, 'MPU', { size: 4.6, fill: '#bbb' })}</g>`;
    s += path('M58 -64 l6 -6 m-6 6 h10 m-10 0 v-10', { stroke: '#fff', sw: 1 }) + text(60, -52, 'X', { size: 3.5 }) + text(70, -60, 'Y', { size: 3.5 });
    s += maleHeader(this.pins.map((p) => [p.x, p.y]));
    s += headerLabels(['VCC', 'GND', 'SCL', 'SDA', 'XDA', 'XCL', 'AD0', 'INT'], -8, 2.8);
    return s;
  },
  sim: {
    create(ctx) {
      const vcc = ctx.node('VCC'), gnd = ctx.node('GND'), ad0 = ctx.node('AD0');
      ctx.add(new Resistor(vcc, gnd, 1300));
      const regs = new Uint8Array(128);
      regs[0x6b] = 0x40; // sleep
      regs[0x75] = 0x68;
      const rt = {
        visual: { ax: 0, ay: 0 },
        values: { ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: 0, temp: 25 },
        regs, ptr: 0,
        get i2c() { return { address: ad0 >= 0 && ctx.v(ad0) - ctx.v(gnd) > 2 ? 0x69 : 0x68 }; },
        powered() { return ctx.v(vcc) - ctx.v(gnd) > 2.5; },
        input(k, v) { if (k in this.values) { this.values[k] = v; this.visual.ax = this.values.ax; this.visual.ay = this.values.ay; } },
        sample() {
          const sleep = regs[0x6b] & 0x40;
          const aRange = [16384, 8192, 4096, 2048][(regs[0x1c] >> 3) & 3];
          const gRange = [131, 65.5, 32.8, 16.4][(regs[0x1b] >> 3) & 3];
          const v = this.values;
          const vals = sleep ? [0, 0, 0, 0, 0, 0, 0] : [v.ax * aRange, v.ay * aRange, v.az * aRange, (v.temp - 36.53) * 340, v.gx * gRange, v.gy * gRange, v.gz * gRange];
          vals.forEach((x, i) => { const n = Math.max(-32768, Math.min(32767, Math.round(x))) & 0xffff; regs[0x3b + i * 2] = n >> 8; regs[0x3c + i * 2] = n & 255; });
        },
        i2cWrite(bytes) {
          if (!bytes.length) return;
          this.ptr = bytes[0] & 127;
          for (let i = 1; i < bytes.length; i++) { regs[this.ptr] = bytes[i]; this.ptr = (this.ptr + 1) & 127; }
        },
        i2cRead(n) {
          this.sample();
          const out = [];
          for (let i = 0; i < n; i++) { out.push(regs[this.ptr]); this.ptr = (this.ptr + 1) & 127; }
          return out;
        },
      };
      return rt;
    },
  },
  update(el, v) {
    const k = `${v.ax},${v.ay}`;
    if (el._k === k) return;
    el._k = k;
    el.querySelector('.mpu-chip').setAttribute('transform', `rotate(${(v.ax * 20).toFixed(1)} 31 -39)`);
  },
});

// ------------------------------------------------------------------ RTC module
register({
  type: 'rtc-ds1307', name: 'Real Time Clock (DS1307 / DS3231)', category: 'sensors', tags: ['rtc', 'clock', 'ds1307', 'ds3231', 'time', 'date', 'rtclib'],
  description: 'Battery-backed clock on I²C (0x68). Library: RTClib (RTC_DS1307 or RTC_DS3231). Starts at your phone\'s current time.',
  box: [-12, -60, 52, 4],
  pins: pinRow(['GND', 'VCC', 'SDA', 'SCL']),
  i2cPins: { sda: 'SDA', scl: 'SCL' },
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-12, -60, 64, 64, { fill: '#1d4ed8', rx: 3 })}</g>`;
    s += circle(30, -36, 15, { fill: 'url(#silver)', stroke: '#888', sw: 0.6 }) + text(30, -36, 'CR2032', { size: 3.4, fill: '#555' });
    s += rect(-6, -54, 18, 12, { fill: '#18181b', rx: 1 }) + text(3, -48, 'DS1307', { size: 2.6, fill: '#bbb' });
    s += rect(-6, -36, 10, 6, { fill: 'url(#silver)', rx: 2 });
    s += maleHeader([[0, 0], [10, 0], [20, 0], [30, 0]]);
    s += headerLabels(['GND', 'VCC', 'SDA', 'SCL']);
    return s;
  },
  sim: {
    create(ctx) {
      const vcc = ctx.node('VCC'), gnd = ctx.node('GND');
      ctx.add(new Resistor(vcc, gnd, 3000));
      const rt = {
        i2c: { address: 0x68 },
        visual: {},
        offsetMs: Date.now(),
        running: true,
        powered() { return ctx.v(vcc) - ctx.v(gnd) > 2.5; },
        nowMs() { return this.offsetMs + ctx.now() / 1000; },
        adjust(ms) { this.offsetMs = ms - ctx.now() / 1000; this.running = true; },
        ptr: 0,
        i2cWrite(bytes) {
          if (!bytes.length) return;
          this.ptr = bytes[0];
          if (bytes.length >= 8 && this.ptr === 0) {
            const bcd = (b) => ((b >> 4) * 10) + (b & 15);
            const d = new Date(Date.UTC(2000 + bcd(bytes[7]), bcd(bytes[6]) - 1, bcd(bytes[5]), bcd(bytes[3] & 0x3f), bcd(bytes[2]), bcd(bytes[1] & 0x7f)));
            this.adjust(d.getTime() + new Date().getTimezoneOffset() * 0);
          }
        },
        i2cRead(n) {
          const d = new Date(this.nowMs());
          const bcd = (v) => ((Math.floor(v / 10) << 4) | (v % 10));
          const regs = [bcd(d.getSeconds()), bcd(d.getMinutes()), bcd(d.getHours()), d.getDay() + 1, bcd(d.getDate()), bcd(d.getMonth() + 1), bcd(d.getFullYear() % 100)];
          const out = [];
          for (let i = 0; i < n; i++) out.push(regs[(this.ptr + i) % 7] ?? 0);
          this.ptr += n;
          return out;
        },
      };
      return rt;
    },
  },
});
