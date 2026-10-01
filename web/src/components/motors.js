// Motors & actuators: servo, DC motor / fan / pump, steppers, relay, L298N driver.
import { register } from './registry.js';
import { rect, circle, text, line, path, lead, pad, smdLed, maleHeader, screw } from './draw.js';
import { Resistor, VSource, ControlledSwitch, HalfBridge, DependentSource, vAt } from '../sim/circuit/solver.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------ servo SG90
register({
  type: 'servo', name: 'Servo Motor (SG90)', category: 'motors', tags: ['servo', 'sg90', 'mg996r', 'angle', 'pwm'],
  description: 'Micro servo: brown = GND, red = 5V, orange = signal. Use the Servo library (0–180°).',
  box: [-14, -96, 66, 2],
  pins: [{ id: 'GND', x: 0, y: 0, label: 'GND' }, { id: 'V+', x: 10, y: 0, label: '5V' }, { id: 'PWM', x: 20, y: 0, label: 'PWM' }],
  props: [{ key: 'model', label: 'Model', type: 'select', options: [['sg90', 'SG90 (micro, blue)'], ['mg996r', 'MG996R (metal gear, black)']], default: 'sg90' }],
  render(p) {
    const body = p.model === 'mg996r' ? '#202125' : '#2563eb';
    let s = path('M0 0 C0 -10 6 -14 6 -22', { stroke: '#6b3e1e', sw: 2.2 }) + path('M10 0 C10 -10 10 -14 10 -22', { stroke: '#d32f2f', sw: 2.2 }) + path('M20 0 C20 -10 14 -14 14 -22', { stroke: '#f28c28', sw: 2.2 });
    s += `<g filter="url(#softShadow)">`;
    s += rect(-14, -34, 72, 10, { fill: body, rx: 2, op: 0.85 }) + circle(-8, -29, 2.4, { fill: 'var(--canvas-bg,#0b1020)' }) + circle(52, -29, 2.4, { fill: 'var(--canvas-bg,#0b1020)' });
    s += rect(-4, -66, 52, 46, { fill: body, rx: 3 });
    s += `</g>`;
    s += rect(-4, -66, 52, 8, { fill: 'rgba(255,255,255,.12)', rx: 3 });
    s += text(22, -32, p.model === 'mg996r' ? 'MG996R' : 'SG90', { size: 6, fill: 'rgba(255,255,255,.75)', weight: 700 });
    s += circle(30, -52, 10, { fill: 'rgba(0,0,0,.25)' }) + circle(14, -52, 5, { fill: 'rgba(0,0,0,.2)' });
    s += `<g class="servo-horn" transform="rotate(0 30 -52)">${path('M26.5 -52 L28 -88 Q30 -92 32 -88 L33.5 -52 Z', { fill: '#f5f5f2', stroke: '#c9c9c2', sw: 0.6 })}${[0, 1, 2, 3, 4].map((i) => circle(30, -60 - i * 6, 0.9, { fill: '#bdbdb5' })).join('')}${circle(30, -52, 6.5, { fill: '#f5f5f2', stroke: '#c9c9c2', sw: 0.6 })}${circle(30, -52, 2, { fill: '#9e9e96' })}</g>`;
    s += `<text class="servo-angle" x="22" y="-72" font-size="6" text-anchor="middle" fill="#a5f3fc" font-family="JetBrains Mono, monospace" opacity="0">90°</text>`;
    return s;
  },
  sim: {
    create(ctx) {
      const vplus = ctx.node('V+'), gnd = ctx.node('GND'), sig = ctx.node('PWM');
      const load = ctx.add(new Resistor(vplus, gnd, 1000));
      return {
        visual: { angle: 90, shown: false },
        target: 90,
        tick(dt) {
          const v = ctx.v(vplus) - ctx.v(gnd);
          const st = ctx.engine.pinSignal(sig);
          if (st && st.servoUs) this.target = clamp(((st.servoUs - 544) / (2400 - 544)) * 180, 0, 180);
          if (v < 3.8) {
            if (!this.warned && st && st.servoUs) { this.warned = true; ctx.warn('Servo has no power — connect red to 5V and brown to GND.', 'svpow'); }
            this.moving = false;
          } else {
            const maxStep = (600 * dt) / 1e6; // 0.1 s / 60°
            const d = this.target - this.visual.angle;
            this.moving = Math.abs(d) > 0.3;
            this.visual.angle += clamp(d, -maxStep, maxStep);
            this.visual.shown = true;
          }
          const want = this.moving ? 20 : 200;
          if (want !== this._r) { this._r = want; load.setR(want); ctx.dirty(); }
        },
      };
    },
  },
  update(el, v) {
    const a = Math.round(v.angle * 10) / 10;
    if (el._a === a) return;
    el._a = a;
    el.querySelector('.servo-horn').setAttribute('transform', `rotate(${(90 - a).toFixed(1)} 30 -52)`);
    const t = el.querySelector('.servo-angle');
    t.textContent = Math.round(a) + '°';
    t.setAttribute('opacity', v.shown ? 1 : 0);
  },
});

// ------------------------------------------------------------------ DC motor / fan / pump
function motorRuntime(ctx, R = 6, k = 0.0075) {
  const a = ctx.node('1'), b = ctx.node('2');
  const mid = ctx.newNode();
  const r = ctx.add(new Resistor(a, mid, R));
  const emf = ctx.add(new VSource(mid, b, 0, 0.001));
  return {
    visual: { angle: 0, rpm: 0 },
    w: 0,
    tick(dt) {
      const s = dt / 1e6;
      if (s <= 0) return;
      const i = r.iAvg ?? r.i;
      const J = 4e-6, bf = 1.2e-6;
      // integrate in small steps for stability
      const n = Math.max(1, Math.ceil(s / 0.004));
      const h = s / n;
      let w = this.w;
      for (let k2 = 0; k2 < n; k2++) w += ((k * i - bf * w) / J) * h;
      if (!Number.isFinite(w)) w = 0;
      this.w = w;
      const newEmf = k * w;
      if (Math.abs(newEmf - emf.v) > 0.02) { emf.v = newEmf; ctx.dirty(); }
      this.visual.rpm = (w * 60) / (2 * Math.PI);
      this.visual.angle = (this.visual.angle + (w * s * 180) / Math.PI) % 360;
      if (Math.abs(i) > 0.045 && ctx.engine.pinSignal(a) && !ctx.engine.pinSignal(a).servoUs) {
        ctx.warn('A motor connected directly to an Arduino pin draws far more than 40 mA. Use a transistor, MOSFET or motor driver (L298N).', 'motorpin');
      }
    },
    started() { this.w = 0; emf.v = 0; },
  };
}

register({
  type: 'dc-motor', name: 'DC Motor', category: 'motors', tags: ['motor', 'dc', 'toy motor', 'fan', 'pump'],
  description: 'Small 3–6 V DC motor. Speed follows voltage; reverse the wires to reverse direction.',
  box: [-26, -76, 46, 2],
  pins: [{ id: '1', x: 0, y: 0 }, { id: '2', x: 20, y: 0 }],
  props: [{ key: 'look', label: 'Attachment', type: 'select', options: [['fan', 'Fan blade'], ['wheel', 'Wheel'], ['shaft', 'Plain shaft']], default: 'fan' }],
  render(p) {
    let s = lead(0, 0, -10, { color: '#d32f2f' }) + lead(20, 0, -10, { color: '#222' });
    s += rect(-6, -40, 32, 30, { fill: 'url(#steel)', rx: 6, stroke: '#666', sw: 0.6 });
    s += rect(-6, -16, 32, 6, { fill: '#c0392b', rx: 2 });
    s += rect(8, -46, 4, 7, { fill: '#bbb' });
    const cx = 10, cy = -56;
    if (p.look === 'fan') {
      s += `<g class="mot-rot" transform="rotate(0 ${cx} ${cy})">${[0, 120, 240].map((a) => `<path d="M${cx} ${cy} q-7 -14 0 -22 q7 8 0 22z" fill="rgba(56,189,248,.75)" stroke="#0ea5e9" stroke-width=".6" transform="rotate(${a} ${cx} ${cy})"/>`).join('')}${circle(cx, cy, 3.5, { fill: '#e2e8f0' })}</g>`;
    } else if (p.look === 'wheel') {
      s += `<g class="mot-rot" transform="rotate(0 ${cx} ${cy})">${circle(cx, cy, 17, { fill: '#1f2937', stroke: '#111', sw: 1 })}${circle(cx, cy, 11, { fill: '#facc15' })}${[0, 60, 120].map((a) => `<rect x="${cx - 1.2}" y="${cy - 11}" width="2.4" height="22" fill="#a16207" transform="rotate(${a} ${cx} ${cy})"/>`).join('')}${circle(cx, cy, 3, { fill: '#e5e7eb' })}</g>`;
    } else {
      s += `<g class="mot-rot" transform="rotate(0 ${cx} ${cy})">${circle(cx, cy, 6, { fill: '#e2e8f0', stroke: '#999', sw: 0.6 })}${rect(cx - 1, cy - 6, 2, 6, { fill: '#ef4444' })}</g>`;
    }
    s += `<text class="mot-rpm" x="${cx}" y="-23" font-size="5.5" text-anchor="middle" fill="#0b1226" font-family="JetBrains Mono, monospace" font-weight="700">0</text>`;
    return s;
  },
  sim: { create(ctx) { return motorRuntime(ctx); } },
  update(el, v) {
    const g = el.querySelector('.mot-rot');
    g.setAttribute('transform', `rotate(${v.angle.toFixed(1)} 10 -56)`);
    const r = Math.round(Math.abs(v.rpm) / 10) * 10;
    if (el._r !== r) { el._r = r; el.querySelector('.mot-rpm').textContent = r ? r + '' : '0'; }
  },
});

// ------------------------------------------------------------------ stepper 28BYJ-48 + ULN2003
register({
  type: 'stepper-28byj', name: 'Stepper 28BYJ-48 + ULN2003', category: 'motors', tags: ['stepper', '28byj-48', 'uln2003', 'unipolar'],
  description: '5 V geared stepper (2048 steps/rev) with ULN2003 driver board. Use Stepper(2048, IN1, IN3, IN2, IN4).',
  box: [-10, -132, 92, 4],
  pins: [
    { id: 'IN1', x: 0, y: 0 }, { id: 'IN2', x: 10, y: 0 }, { id: 'IN3', x: 20, y: 0 }, { id: 'IN4', x: 30, y: 0 },
    { id: '-', x: 60, y: 0, label: 'GND' }, { id: '+', x: 70, y: 0, label: '5V' },
  ],
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-10, -44, 92, 46, { fill: '#2a6b3f', rx: 3 })}</g>`;
    s += rect(14, -36, 22, 26, { fill: '#18181b', rx: 1 }) + text(25, -23, 'ULN2003', { size: 3.2, fill: '#bbb', rot: -90 });
    ['A', 'B', 'C', 'D'].forEach((l, i) => { s += smdLed(46 + i * 8, -34, { cls: 'led-' + l, color: '#ff3030', off: '#6b2222', w: 4, h: 3, glowR: 5 }) + text(46 + i * 8, -27, l, { size: 3.2 }); });
    s += maleHeader([[0, 0], [10, 0], [20, 0], [30, 0], [60, 0], [70, 0]]);
    s += ['IN1', 'IN2', 'IN3', 'IN4'].map((t, i) => text(i * 10, -8, t, { size: 3, fill: '#eee' })).join('') + text(60, -8, '−', { size: 4 }) + text(70, -8, '+', { size: 4 });
    s += rect(60, -40, 18, 14, { fill: '#f5f5f5', rx: 1 });
    // motor
    s += path('M60 -40 C60 -60 40 -60 36 -70', { stroke: '#2563eb', sw: 1.4 }) + path('M64 -40 C64 -62 44 -64 40 -72', { stroke: '#ec4899', sw: 1.4 }) + path('M68 -40 C68 -64 48 -66 44 -74', { stroke: '#eab308', sw: 1.4 }) + path('M72 -40 C72 -66 52 -68 48 -76', { stroke: '#f97316', sw: 1.4 });
    s += circle(36, -96, 30, { fill: 'url(#steel)', stroke: '#777', sw: 0.8 });
    s += circle(36, -96, 22, { fill: '#2563eb', op: 0.9 });
    s += `<g class="step-rot" transform="rotate(0 36 -106)">${circle(36, -106, 6, { fill: '#e5e7eb', stroke: '#999', sw: 0.6 })}${rect(34.8, -112, 2.4, 12, { fill: '#9ca3af' })}${path('M36 -106 L36 -126', { stroke: '#ef4444', sw: 2, cap: 'round' })}</g>`;
    s += `<text class="step-deg" x="36" y="-84" font-size="6" text-anchor="middle" fill="#e0f2fe" font-family="JetBrains Mono, monospace">0°</text>`;
    return s;
  },
  sim: {
    create(ctx) {
      const ins = ['IN1', 'IN2', 'IN3', 'IN4'].map((p) => ctx.node(p));
      const gnd = ctx.node('-'), vcc = ctx.node('+');
      for (const n of ins) ctx.add(new Resistor(n, gnd, 3300));
      const coil = ctx.add(new Resistor(vcc, gnd, 1e6));
      return {
        visual: { angle: 0, leds: [0, 0, 0, 0] },
        elec: null,
        after() {
          const powered = ctx.v(vcc) - ctx.v(gnd) > 4;
          const on = ins.map((n) => (ctx.v(n) - ctx.v(gnd) > 2.2 ? 1 : 0));
          this.visual.leds = powered ? on : [0, 0, 0, 0];
          const cnt = on.reduce((a, b) => a + b, 0);
          const wantR = powered && cnt ? 5 / (0.12 * cnt) : 1e6;
          if (Math.abs(coil.r - wantR) > 1) { coil.setR(wantR); return true; }
          if (!powered || !cnt) return false;
          let x = 0, y = 0;
          on.forEach((b, i) => { if (b) { x += Math.cos((i * Math.PI) / 2); y += Math.sin((i * Math.PI) / 2); } });
          if (Math.hypot(x, y) < 0.1) return false;
          const ang = (Math.atan2(y, x) * 180) / Math.PI;
          if (this.elec === null) { this.elec = ang; return false; }
          let d = ang - this.elec;
          while (d > 180) d -= 360;
          while (d <= -180) d += 360;
          if (Math.abs(d) > 170) return false;
          this.elec = ang;
          // 28BYJ-48: 64 half-steps per motor turn, 64:1 gearbox → 360° electrical = 360/512 °
          this.visual.angle = (this.visual.angle + d / 512) % 360;
          return false;
        },
      };
    },
  },
  update(el, v) {
    el.querySelector('.step-rot').setAttribute('transform', `rotate(${v.angle.toFixed(2)} 36 -106)`);
    const deg = Math.round(((v.angle % 360) + 360) % 360);
    if (el._d !== deg) { el._d = deg; el.querySelector('.step-deg').textContent = deg + '°'; }
    ['A', 'B', 'C', 'D'].forEach((l, i) => {
      const on = v.leds[i];
      const g = el.querySelector('.led-' + l + '-glow');
      if (g && g._on !== on) { g._on = on; g.setAttribute('opacity', on ? 0.9 : 0); el.querySelector('.led-' + l).setAttribute('fill', on ? '#ff5555' : '#6b2222'); }
    });
  },
});

// ------------------------------------------------------------------ NEMA17 + A4988
register({
  type: 'stepper-a4988', name: 'Stepper NEMA17 + A4988', category: 'motors', tags: ['stepper', 'nema17', 'a4988', 'drv8825', 'bipolar', 'cnc', '3d printer'],
  description: 'Bipolar stepper (200 steps/rev) with A4988 driver. Pulse STEP, set direction with DIR. EN low = enabled.',
  box: [-8, -120, 92, 4],
  pins: [{ id: 'EN', x: 0, y: 0 }, { id: 'STEP', x: 10, y: 0 }, { id: 'DIR', x: 20, y: 0 }, { id: 'VDD', x: 40, y: 0, label: '5V' }, { id: 'GND', x: 50, y: 0 }],
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-8, -34, 66, 36, { fill: '#7c3aed', rx: 2 })}</g>`;
    s += rect(14, -28, 18, 18, { fill: '#18181b', rx: 1 }) + circle(44, -22, 4, { fill: 'url(#silver)' }) + text(23, -19, 'A4988', { size: 3.4, fill: '#bbb' });
    s += maleHeader([[0, 0], [10, 0], [20, 0], [40, 0], [50, 0]]);
    s += ['EN', 'STP', 'DIR', '', '5V', 'GND'].map((t, i) => (t ? text(i * 10, -8, t, { size: 3, fill: '#fff' }) : '')).join('');
    s += rect(30, -112, 56, 56, { fill: '#1f2937', rx: 6 }) + rect(34, -108, 48, 48, { fill: '#374151', rx: 4 });
    s += circle(58, -84, 12, { fill: '#9ca3af' });
    s += `<g class="step-rot" transform="rotate(0 58 -84)">${circle(58, -84, 5, { fill: '#e5e7eb' })}${path('M58 -84 L58 -98', { stroke: '#ef4444', sw: 2, cap: 'round' })}</g>`;
    s += path('M40 -56 C40 -48 30 -46 30 -34', { stroke: '#111', sw: 2 });
    s += `<text class="step-deg" x="58" y="-64" font-size="6" text-anchor="middle" fill="#e5e7eb" font-family="JetBrains Mono, monospace">0°</text>`;
    return s;
  },
  sim: {
    create(ctx) {
      const vdd = ctx.node('VDD'), gnd = ctx.node('GND'), en = ctx.node('EN');
      ctx.add(new Resistor(vdd, gnd, 2000));
      const rt = {
        visual: { angle: 0 },
        steps: 0,
      };
      ctx.watch('STEP', (level) => {
        if (level !== 1) return;
        if (ctx.v(vdd) - ctx.v(gnd) < 3) return;
        if (en >= 0 && ctx.logic('EN')) return;
        const dir = ctx.logic('DIR') ? 1 : -1;
        rt.steps += dir;
        rt.visual.angle = (rt.steps * 1.8) % 360;
      });
      return rt;
    },
  },
  update(el, v) {
    el.querySelector('.step-rot').setAttribute('transform', `rotate(${v.angle.toFixed(1)} 58 -84)`);
    const deg = Math.round(((v.angle % 360) + 360) % 360);
    if (el._d !== deg) { el._d = deg; el.querySelector('.step-deg').textContent = deg + '°'; }
  },
});

// ------------------------------------------------------------------ relay module
register({
  type: 'relay', name: 'Relay Module (5V)', category: 'motors', tags: ['relay', 'switch', 'ac', 'load', 'srd-05vdc'],
  description: 'Switches a separate circuit: COM connects to NO when the relay is ON, to NC when OFF.',
  box: [-10, -78, 66, 4],
  pins: [
    { id: 'VCC', x: 0, y: 0 }, { id: 'GND', x: 10, y: 0 }, { id: 'IN', x: 20, y: 0 },
    { id: 'NO', x: 0, y: -70, label: 'NO' }, { id: 'COM', x: 20, y: -70, label: 'COM' }, { id: 'NC', x: 40, y: -70, label: 'NC' },
  ],
  props: [{ key: 'trigger', label: 'Trigger', type: 'select', options: [['high', 'Active HIGH'], ['low', 'Active LOW']], default: 'high' }],
  render(p) {
    let s = `<g filter="url(#softShadow)">${rect(-10, -78, 66, 82, { fill: '#1d4ed8', rx: 3 })}</g>`;
    s += rect(-6, -78, 52, 14, { fill: '#2563eb', rx: 1 }) + [0, 20, 40].map((x) => screw(x, -70, 4)).join('');
    s += rect(-2, -60, 50, 34, { fill: '#1e3a8a', rx: 1.5, stroke: '#172554', sw: 0.6 });
    s += rect(0, -58, 46, 30, { fill: '#2563eb', rx: 1 }) + text(23, -46, 'SRD-05VDC', { size: 4, fill: '#dbeafe', weight: 700 }) + text(23, -39, '10A 250VAC', { size: 3.2, fill: '#bfdbfe' });
    s += `<g class="rl-arm">${line(4, -32, 40, -32, { stroke: '#93c5fd', sw: 1.2 })}</g>`;
    s += smdLed(46, -16, { cls: 'led-R', color: '#ff3030', off: '#7f1d1d', w: 4, h: 3 }) + text(46, -11, 'ON', { size: 3 });
    s += maleHeader([[0, 0], [10, 0], [20, 0]]);
    s += text(0, -7, 'VCC', { size: 3 }) + text(10, -7, 'GND', { size: 3 }) + text(20, -7, 'IN', { size: 3 });
    s += text(30, -18, p.trigger === 'low' ? 'LOW' : 'HIGH', { size: 3, fill: '#93c5fd' });
    return s;
  },
  sim: {
    create(ctx) {
      const vcc = ctx.node('VCC'), gnd = ctx.node('GND'), inp = ctx.node('IN');
      const activeLow = ctx.props.trigger === 'low';
      const energized = (V) => {
        const sup = vAt(V, vcc) - vAt(V, gnd);
        if (sup < 3.5) return false;
        const vin = vAt(V, inp) - vAt(V, gnd);
        return activeLow ? vin < sup * 0.35 : vin > 2.0;
      };
      if (activeLow) ctx.add(new Resistor(vcc, inp, 4700)); else ctx.add(new Resistor(inp, gnd, 4700));
      const coil = ctx.add(new ControlledSwitch(vcc, gnd, energized, 70));
      const no = ctx.add(new ControlledSwitch(ctx.node('COM'), ctx.node('NO'), energized, 0.02));
      const nc = ctx.add(new ControlledSwitch(ctx.node('COM'), ctx.node('NC'), (V) => !energized(V), 0.02));
      void nc;
      return {
        visual: { on: false },
        after() {
          const on = coil.closed;
          if (on !== this.visual.on) { this.visual.on = on; ctx.sound('click', on ? 1800 : 1200, 0.25); setTimeout(() => ctx.sound('click', 0, 0), 25); }
          void no;
          return false;
        },
      };
    },
  },
  update(el, v) {
    if (el._on === v.on) return;
    el._on = v.on;
    el.querySelector('.rl-arm').setAttribute('transform', v.on ? 'rotate(-4 4 -32)' : '');
    el.querySelector('.led-R-glow').setAttribute('opacity', v.on ? 0.95 : 0);
    el.querySelector('.led-R').setAttribute('fill', v.on ? '#ff5555' : '#7f1d1d');
  },
});

// ------------------------------------------------------------------ L298N dual H-bridge
register({
  type: 'l298n', name: 'L298N Motor Driver', category: 'motors', tags: ['l298n', 'h-bridge', 'motor driver', 'robot car'],
  description: 'Dual H-bridge: IN1/IN2 set motor A direction, ENA (PWM) sets its speed. Power motors from +12V.',
  box: [-12, -104, 102, 4],
  pins: [
    { id: 'ENA', x: 0, y: 0 }, { id: 'IN1', x: 10, y: 0 }, { id: 'IN2', x: 20, y: 0 }, { id: 'IN3', x: 30, y: 0 }, { id: 'IN4', x: 40, y: 0 }, { id: 'ENB', x: 50, y: 0 },
    { id: '12V', x: 60, y: -100, label: '+12V' }, { id: 'GND', x: 70, y: -100 }, { id: '5V', x: 80, y: -100, label: '+5V' },
    { id: 'OUT1', x: 0, y: -100 }, { id: 'OUT2', x: 10, y: -100 }, { id: 'OUT3', x: 30, y: -100 }, { id: 'OUT4', x: 40, y: -100 },
  ],
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-12, -104, 104, 108, { fill: '#b91c1c', rx: 3 })}</g>`;
    s += rect(14, -78, 46, 40, { fill: '#111', rx: 2 }) + [0, 1, 2, 3, 4, 5, 6].map((i) => rect(16 + i * 6, -82, 3, 6, { fill: '#888' })).join('');
    s += text(37, -58, 'L298N', { size: 6, fill: '#ddd', weight: 700 });
    s += rect(-8, -104, 26, 12, { fill: '#2563eb', rx: 1 }) + rect(22, -104, 26, 12, { fill: '#2563eb', rx: 1 }) + rect(52, -104, 36, 12, { fill: '#2563eb', rx: 1 });
    for (const x of [0, 10, 30, 40, 60, 70, 80]) s += screw(x, -100, 3.6);
    s += maleHeader([[0, 0], [10, 0], [20, 0], [30, 0], [40, 0], [50, 0]]);
    s += ['ENA', 'IN1', 'IN2', 'IN3', 'IN4', 'ENB'].map((t, i) => text(i * 10, -8, t, { size: 3, fill: '#fff' })).join('');
    s += text(5, -86, 'MOTOR A', { size: 3.2, fill: '#fecaca' }) + text(35, -86, 'MOTOR B', { size: 3.2, fill: '#fecaca' }) + text(70, -86, '12V GND 5V', { size: 3, fill: '#fecaca' });
    s += circle(75, -30, 7, { fill: '#1e1e1e' }) + smdLed(75, -16, { cls: 'led-P', color: '#ff3030', off: '#7f1d1d', w: 4, h: 3 });
    return s;
  },
  sim: {
    create(ctx) {
      const n = (p) => ctx.node(p);
      const vs = n('12V'), gnd = n('GND');
      for (const p of ['ENA', 'IN1', 'IN2', 'IN3', 'IN4', 'ENB']) ctx.add(new Resistor(n(p), gnd, 20000));
      // onboard 5V regulator (78M05) when +12V is present
      ctx.add(new DependentSource(n('5V'), gnd, (V) => (vAt(V, vs) - vAt(V, gnd) > 6 ? 5 : null), 0.3));
      const hi = (V, node) => vAt(V, node) - vAt(V, gnd) > 2.3;
      const powered = (V) => vAt(V, vs) - vAt(V, gnd) > 6;
      const mk = (out, inp, en) => ctx.add(new HalfBridge(n(out), vs, gnd, (V) => (powered(V) && (n(en) < 0 || hi(V, n(en))) ? hi(V, n(inp)) : null), { r: 1.2, drop: 1.4 }));
      mk('OUT1', 'IN1', 'ENA'); mk('OUT2', 'IN2', 'ENA'); mk('OUT3', 'IN3', 'ENB'); mk('OUT4', 'IN4', 'ENB');
      return {
        visual: { p: 0 },
        after() { this.visual.p = ctx.v(vs) - ctx.v(gnd) > 6 ? 1 : 0; return false; },
      };
    },
  },
  update(el, v) {
    if (el._p === v.p) return;
    el._p = v.p;
    el.querySelector('.led-P-glow').setAttribute('opacity', v.p ? 0.9 : 0);
    el.querySelector('.led-P').setAttribute('fill', v.p ? '#ff5555' : '#7f1d1d');
  },
});
