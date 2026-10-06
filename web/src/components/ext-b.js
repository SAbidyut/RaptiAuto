// More components (group B): motor driver TB6612, solenoid, Bluetooth HC-05 (virtual phone), GPS NEO-6M, robot car.
import { register } from './registry.js';
import { rect, circle, text, line, path, lead, maleHeader, screw, smdLed } from './draw.js';
import { Resistor, HalfBridge, DependentSource, vAt } from '../sim/circuit/solver.js';
import { h } from '../ui/widgets.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ================================================================== TB6612FNG dual motor driver
register({
  type: 'tb6612', name: 'TB6612FNG Motor Driver', category: 'drivers', tags: ['tb6612', 'tb6612fng', 'motor driver', 'h-bridge', 'robot', 'dual'],
  description: 'Dual H-bridge that works from 2.5 – 13.5 V motor supply (VM) with 3.3 V or 5 V logic (VCC). STBY must be HIGH. xIN1 / xIN2 choose the direction (H/L forward, L/H reverse, H/H brake, L/L stop), PWMx HIGH or a PWM signal sets the speed.',
  box: [-12, -84, 112, 4],
  pins: [
    { id: 'VM', x: 0, y: 0 }, { id: 'VCC', x: 10, y: 0 }, { id: 'GND', x: 20, y: 0 }, { id: 'AIN1', x: 30, y: 0 }, { id: 'AIN2', x: 40, y: 0 }, { id: 'PWMA', x: 50, y: 0 },
    { id: 'STBY', x: 60, y: 0 }, { id: 'BIN1', x: 70, y: 0 }, { id: 'BIN2', x: 80, y: 0 }, { id: 'PWMB', x: 90, y: 0 },
    { id: 'AO1', x: 10, y: -80 }, { id: 'AO2', x: 20, y: -80 }, { id: 'BO2', x: 70, y: -80 }, { id: 'BO1', x: 80, y: -80 },
  ],
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-12, -84, 114, 88, { fill: '#b91c1c', rx: 3 })}</g>`;
    s += rect(24, -60, 40, 30, { fill: '#18181b', rx: 2 }) + text(44, -45, 'TB6612FNG', { size: 4.6, fill: '#d4d4d8', font: 'monospace', weight: 700 });
    s += rect(-6, -86, 36, 10, { fill: '#1e3a8a', rx: 1 }) + rect(66, -86, 36, 10, { fill: '#1e3a8a', rx: 1 });
    for (const x of [10, 20, 70, 80]) s += screw(x, -80, 3.2);
    s += text(15, -68, 'MOTOR A', { size: 3, fill: '#fecaca' }) + text(75, -68, 'MOTOR B', { size: 3, fill: '#fecaca' });
    s += maleHeader(Array.from({ length: 10 }, (_, i) => [i * 10, 0]));
    s += ['VM', 'VCC', 'GND', 'AIN1', 'AIN2', 'PWMA', 'STBY', 'BIN1', 'BIN2', 'PWMB'].map((t, i) => text(i * 10, -8, t, { size: 2.7, fill: '#fff' })).join('');
    s += smdLed(86, -28, { cls: 'led-P', color: '#22c55e', off: '#14532d', w: 4, h: 3 });
    return s;
  },
  sim: {
    create(ctx) {
      const n = (p) => ctx.node(p);
      const vm = n('VM'), vcc = n('VCC'), gnd = n('GND');
      for (const p of ['AIN1', 'AIN2', 'PWMA', 'BIN1', 'BIN2', 'PWMB', 'STBY']) ctx.add(new Resistor(n(p), gnd, 100000));
      ctx.add(new Resistor(vcc, gnd, 5000));
      const hi = (V, node) => node >= 0 && vAt(V, node) - vAt(V, gnd) > 1.9;
      const alive = (V) => vAt(V, vcc) - vAt(V, gnd) > 2.4 && vAt(V, vm) - vAt(V, gnd) > 2.4 && hi(V, n('STBY'));
      const ch = (i1, i2, pw, o1, o2) => {
        const on = (V) => alive(V) && hi(V, n(pw));
        ctx.add(new HalfBridge(n(o1), vm, gnd, (V) => {
          if (!on(V)) return null;
          const a = hi(V, n(i1)), b = hi(V, n(i2));
          if (a && !b) return 1;
          if (!a && !b) return null;
          return 0;
        }, { r: 0.5, drop: 0.3 }));
        ctx.add(new HalfBridge(n(o2), vm, gnd, (V) => {
          if (!on(V)) return null;
          const a = hi(V, n(i1)), b = hi(V, n(i2));
          if (b && !a) return 1;
          if (!a && !b) return null;
          return 0;
        }, { r: 0.5, drop: 0.3 }));
      };
      ch('AIN1', 'AIN2', 'PWMA', 'AO1', 'AO2');
      ch('BIN1', 'BIN2', 'PWMB', 'BO1', 'BO2');
      return { visual: { p: 0 }, after() { this.visual.p = ctx.v(vcc) - ctx.v(gnd) > 2.4 && ctx.v(n('STBY')) - ctx.v(gnd) > 1.9 ? 1 : 0; return false; } };
    },
  },
  update(el, v) {
    if (el._p === v.p) return;
    el._p = v.p;
    el.querySelector('.led-P-glow').setAttribute('opacity', v.p ? 0.9 : 0);
    el.querySelector('.led-P').setAttribute('fill', v.p ? '#4ade80' : '#14532d');
  },
});

// ================================================================== solenoid
register({
  type: 'solenoid', name: 'Solenoid (push/pull)', category: 'motors', tags: ['solenoid', 'electromagnet', 'actuator', 'plunger', 'lock', 'push pull'],
  description: '12 V push-pull solenoid (about 20 Ω). Switch it with a transistor or relay and add a flyback diode. The plunger is pulled in while about 0.2 A or more flows.',
  box: [-12, -64, 46, 2],
  pins: [{ id: '1', x: 0, y: 0 }, { id: '2', x: 20, y: 0 }],
  render() {
    let s = lead(0, 0, -10, { color: '#d32f2f' }) + lead(20, 0, -10, { color: '#222' });
    s += `<g class="sol-pl"><rect x="3" y="-62" width="14" height="30" rx="2" fill="url(#steel)" stroke="#777" stroke-width=".6"/>${circle(10, -62, 3, { fill: '#555' })}</g>`;
    s += `<g filter="url(#softShadow)">${rect(-8, -42, 36, 32, { fill: '#b45309', rx: 3, stroke: '#78350f', sw: 1 })}</g>`;
    for (let i = 0; i < 6; i++) s += line(-6, -39 + i * 5, 26, -39 + i * 5, { stroke: '#92400e', sw: 1.2 });
    s += text(10, -26, '12V', { size: 5, fill: '#fde68a', weight: 700 });
    return s;
  },
  sim: {
    create(ctx) {
      const a = ctx.node('1'), b = ctx.node('2');
      const r = ctx.add(new Resistor(a, b, 20));
      return { visual: { pull: 0 }, after() { this.visual.pull = Math.abs(r.iAvg ?? r.i) > 0.2 ? 1 : 0; return false; } };
    },
  },
  update(el, v) {
    if (el._p === v.pull) return;
    el._p = v.pull;
    el.querySelector('.sol-pl').setAttribute('transform', v.pull ? 'translate(0 22)' : '');
  },
});

// ================================================================== UART modules (HC-05 + GPS)
function addCss(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const st = document.createElement('style');
  st.id = id; st.textContent = css;
  document.head.appendChild(st);
}

const DEFAULT_BUTTONS = 'ON=1,OFF=0,FWD=F,BACK=B,LEFT=L,RIGHT=R,STOP=S';

register({
  type: 'hc05', name: 'Bluetooth HC-05 + Virtual Phone', category: 'comm', tags: ['bluetooth', 'hc-05', 'hc-06', 'phone', 'serial', 'wireless', 'uart', 'app', 'remote'],
  description: 'Bluetooth serial module. Wire TXD → the board\'s RX pin and RXD → its TX pin (SoftwareSerial, Serial1/Serial2 or machine.UART). While the simulation runs, tap the module: a virtual phone app connects and exchanges text with your program.',
  box: [-12, -64, 72, 4],
  pins: [{ id: 'STATE', x: 0, y: 0 }, { id: 'RXD', x: 10, y: 0 }, { id: 'TXD', x: 20, y: 0 }, { id: 'GND', x: 30, y: 0 }, { id: 'VCC', x: 40, y: 0 }, { id: 'EN', x: 50, y: 0 }],
  props: [{ key: 'buttons', label: 'Phone buttons (label=text)', type: 'text', default: DEFAULT_BUTTONS }],
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-12, -64, 72, 68, { fill: '#1d4ed8', rx: 3 })}</g>`;
    s += rect(-4, -58, 26, 26, { fill: '#18181b', rx: 1.5 }) + text(9, -45, 'HC-05', { size: 4.6, fill: '#cbd5e1', font: 'monospace', weight: 700 });
    s += path('M30 -50 l8 -8 v16 l-8 -8 l8 8 m-8 -8 l8 -8', { stroke: '#93c5fd', sw: 1.4, lj: 'round', cap: 'round' });
    s += text(46, -45, 'BT', { size: 5, fill: '#bfdbfe', weight: 700 });
    s += smdLed(44, -22, { cls: 'led-B', color: '#3b82f6', off: '#1e3a8a', w: 4, h: 3 }) + text(44, -15.5, 'LINK', { size: 2.6, fill: '#bfdbfe' });
    s += maleHeader(Array.from({ length: 6 }, (_, i) => [i * 10, 0]));
    s += ['STATE', 'RXD', 'TXD', 'GND', 'VCC', 'EN'].map((t, i) => text(i * 10, -8, t, { size: 2.5, fill: '#fff' })).join('');
    return s;
  },
  sim: {
    create(ctx) {
      const vcc = ctx.node('VCC'), gnd = ctx.node('GND'), rxd = ctx.node('RXD'), state = ctx.node('STATE');
      ctx.add(new Resistor(vcc, gnd, 150));
      ctx.add(new Resistor(rxd, gnd, 100000));
      const rt = {
        log: [], // { dir: 'phone'|'module', text }
        connected: false, tx: 0, rx: 0,
        visual: { led: 0, connected: false },
        powered() { return ctx.v(vcc) - ctx.v(gnd) > 3; },
        push(dir, text) {
          const last = this.log[this.log.length - 1];
          if (last && dir === 'mcu' && last.dir === 'mcu' && !/\n$/.test(last.text)) last.text += text; // one bubble per line
          else this.log.push({ dir, text, t: ctx.now() });
          if (this.log.length > 200) this.log.shift();
          this.version = (this.version || 0) + 1;
        },
        /** bytes from the MCU */
        onUartRx(text) {
          if (!this.powered()) return;
          this.rx += text.length;
          if (!this.connected) { this.dropped = (this.dropped || 0) + text.length; return; }
          this.push('mcu', text);
        },
        input(key, val) {
          if (key === 'connect') { this.connected = !!val && this.powered(); this.visual.connected = this.connected; ctx.dirty(); if (val && !this.connected) ctx.warn('Power the HC-05 (VCC / GND) before pairing the phone.', 'hc05pow'); }
          if (key === 'send') {
            if (!this.powered() || !this.connected) return;
            this.push('phone', val);
            this.tx += val.length;
            ctx.engine.uartReceive(this, val, 'TXD');
          }
          if (key === 'clear') { this.log.length = 0; this.version = (this.version || 0) + 1; }
        },
        tick() {
          const t = ctx.now() / 1e6;
          const on = this.powered();
          this.visual.led = !on ? 0 : this.connected ? (t % 2 < 0.12 || (t % 2 > 0.3 && t % 2 < 0.42) ? 1 : 0) : (t % 0.5 < 0.25 ? 1 : 0);
          this.visual.connected = this.connected;
        },
        stopped() { this.connected = false; },
      };
      ctx.add(new DependentSource(state, gnd, (V) => (vAt(V, vcc) - vAt(V, gnd) > 3 ? (rt.connected ? vAt(V, vcc) - vAt(V, gnd) : 0) : null), 200));
      return rt;
    },
  },
  controlsUI(el, { part, rt, input }) {
    addCss('phone-css', `
      .phone { display: flex; flex-direction: column; gap: 8px; }
      .phone-log { height: 150px; overflow-y: auto; border-radius: 14px; background: #0b1226; border: 1px solid rgba(148,163,184,.18); padding: 8px; display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
      .phone-log .b { max-width: 82%; padding: 5px 9px; border-radius: 12px; white-space: pre-wrap; word-break: break-word; }
      .phone-log .b.me { align-self: flex-end; background: #2563eb; color: #fff; border-bottom-right-radius: 3px; }
      .phone-log .b.mcu { align-self: flex-start; background: #1f2a44; color: #e2e8f0; border-bottom-left-radius: 3px; }
      .phone-row { display: flex; gap: 6px; }
      .phone-row input { flex: 1; min-width: 0; }
      .phone-btns { display: flex; flex-wrap: wrap; gap: 6px; }
      .phone-btns button { padding: 8px 12px; border-radius: 12px; background: #1e2a4a; color: #e2e8f0; font-weight: 700; border: 1px solid rgba(148,163,184,.22); }
      .phone-btns button:active { background: #2563eb; }
      .phone-state { display: flex; align-items: center; justify-content: space-between; }
      .phone-pill { padding: 3px 10px; border-radius: 99px; font-size: 12px; font-weight: 700; background: #3b0d0d; color: #fecaca; }
      .phone-pill.on { background: #0d3b1d; color: #bbf7d0; }
    `);
    const log = h('div', { class: 'phone-log' });
    const pill = h('span', { class: 'phone-pill' }, 'Not connected');
    const conn = h('button', { class: 'btn btn-primary' }, 'Connect phone');
    const field = h('input', { class: 'input', placeholder: 'Message to send…', enterkeyhint: 'send', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const send = (text) => { if (text) { input('send', text); } };
    const sendBtn = h('button', { class: 'btn btn-primary', onclick: () => { send(field.value + '\n'); field.value = ''; } }, 'Send');
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendBtn.click(); });
    conn.addEventListener('click', () => { input('connect', !rt.connected); sync(); });
    const btns = h('div', { class: 'phone-btns' });
    const defs = String((part.props && part.props.buttons) || DEFAULT_BUTTONS).split(',').map((s) => s.trim()).filter(Boolean);
    for (const d of defs) {
      const i = d.indexOf('=');
      const label = i > 0 ? d.slice(0, i) : d, payload = i > 0 ? d.slice(i + 1) : d;
      btns.appendChild(h('button', { onclick: () => send(payload) }, label));
    }
    const clear = h('button', { class: 'btn btn-ghost', onclick: () => input('clear', true) }, 'Clear');
    let shown = -1;
    function sync() {
      pill.textContent = rt.connected ? 'Connected' : 'Not connected';
      pill.classList.toggle('on', rt.connected);
      conn.textContent = rt.connected ? 'Disconnect' : 'Connect phone';
      if (shown !== rt.version) {
        shown = rt.version;
        log.textContent = '';
        for (const m of rt.log) log.appendChild(h('div', { class: 'b ' + (m.dir === 'phone' ? 'me' : 'mcu') }, m.text.replace(/\r/g, '')));
        log.scrollTop = log.scrollHeight;
      }
    }
    el.appendChild(h('div', { class: 'phone' },
      h('div', { class: 'phone-state' }, h('b', {}, 'Virtual phone'), pill),
      conn, log, h('div', { class: 'phone-row' }, field, sendBtn), btns, clear));
    sync();
    const iv = setInterval(() => { if (!el.isConnected) clearInterval(iv); else sync(); }, 250);
  },
  update(el, v) {
    const on = !!v.led;
    if (el._on === on) return;
    el._on = on;
    el.querySelector('.led-B-glow').setAttribute('opacity', on ? 0.95 : 0);
    el.querySelector('.led-B').setAttribute('fill', on ? '#60a5fa' : '#1e3a8a');
  },
});

// ------------------------------------------------------------------ GPS NEO-6M
const nmeaSum = (s) => { let c = 0; for (const ch of s) c ^= ch.charCodeAt(0); return c.toString(16).toUpperCase().padStart(2, '0'); };
const nmeaLat = (lat) => { const a = Math.abs(lat), d = Math.floor(a), m = (a - d) * 60; return String(d).padStart(2, '0') + m.toFixed(4).padStart(7, '0') + ',' + (lat >= 0 ? 'N' : 'S'); };
const nmeaLon = (lon) => { const a = Math.abs(lon), d = Math.floor(a), m = (a - d) * 60; return String(d).padStart(3, '0') + m.toFixed(4).padStart(7, '0') + ',' + (lon >= 0 ? 'E' : 'W'); };
const pad2 = (n) => String(n).padStart(2, '0');

export function gpsSentences(g, date) {
  const hh = pad2(date.getUTCHours()), mm = pad2(date.getUTCMinutes()), ss = pad2(date.getUTCSeconds());
  const time = `${hh}${mm}${ss}.00`;
  const ddmmyy = `${pad2(date.getUTCDate())}${pad2(date.getUTCMonth() + 1)}${String(date.getUTCFullYear()).slice(2)}`;
  const fix = g.fix;
  const knots = (g.speed / 1.852).toFixed(2);
  const gga = fix ? `GPGGA,${time},${nmeaLat(g.lat)},${nmeaLon(g.lon)},1,${pad2(g.sats)},0.9,${g.alt.toFixed(1)},M,0.0,M,,` : `GPGGA,${time},,,,,0,00,99.99,,,,,,`;
  const rmc = fix ? `GPRMC,${time},A,${nmeaLat(g.lat)},${nmeaLon(g.lon)},${knots},${g.heading.toFixed(1)},${ddmmyy},,,A` : `GPRMC,${time},V,,,,,,,${ddmmyy},,,N`;
  const gsa = `GPGSA,A,${fix ? 3 : 1},,,,,,,,,,,,,${fix ? '1.5,0.9,1.2' : '99.99,99.99,99.99'}`;
  return [gga, rmc, gsa].map((b) => `$${b}*${nmeaSum(b)}\r\n`);
}

register({
  type: 'gps-neo6m', name: 'GPS Module NEO-6M', category: 'comm', tags: ['gps', 'neo-6m', 'neo6m', 'nmea', 'location', 'tracker', 'uart', 'tinygps'],
  description: 'GPS receiver that sends NMEA sentences (GPGGA, GPRMC, GPGSA) once a second at 9600 baud. Wire TXD → the board\'s RX pin. It needs ~6 s to get a fix. Tap the module while running to set the position, speed and heading or to drive it around on the map.',
  box: [-12, -58, 62, 4],
  pins: [{ id: 'VCC', x: 0, y: 0 }, { id: 'RXD', x: 10, y: 0 }, { id: 'TXD', x: 20, y: 0 }, { id: 'GND', x: 30, y: 0 }, { id: 'PPS', x: 40, y: 0 }],
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-12, -58, 62, 62, { fill: '#1e293b', rx: 3 })}</g>`;
    s += rect(-4, -52, 28, 28, { fill: '#d6d3c4', rx: 2, stroke: '#a8a38f', sw: 0.8 }) + rect(0, -48, 20, 20, { fill: '#c9c5b2', rx: 1 }) + circle(10, -38, 3, { fill: '#8a866f' });
    s += text(36, -45, 'NEO', { size: 4, fill: '#e2e8f0', weight: 700 }) + text(36, -39, '6M', { size: 4, fill: '#e2e8f0', weight: 700 });
    s += rect(28, -32, 18, 10, { fill: '#0f172a', rx: 1 }) + smdLed(32, -16, { cls: 'led-G', color: '#22c55e', off: '#14532d', w: 4, h: 3 }) + text(40, -16, 'PPS', { size: 2.6, fill: '#94a3b8' });
    s += maleHeader(Array.from({ length: 5 }, (_, i) => [i * 10, 0]));
    s += ['VCC', 'RXD', 'TXD', 'GND', 'PPS'].map((t, i) => text(i * 10, -8, t, { size: 2.6, fill: '#fff' })).join('');
    return s;
  },
  sim: {
    create(ctx) {
      const vcc = ctx.node('VCC'), gnd = ctx.node('GND'), rxd = ctx.node('RXD');
      ctx.add(new Resistor(vcc, gnd, 90));
      ctx.add(new Resistor(rxd, gnd, 100000));
      const start = Date.now();
      const g = { lat: 23.8103, lon: 90.4125, alt: 12.5, speed: 0, heading: 90, sats: 8, fix: true, moving: false, lost: false, powerT: -1, next: 0 };
      const rt = {
        gps: g, trail: [[g.lat, g.lon]], version: 0,
        visual: { pps: 0, fix: false },
        powered() { return ctx.v(vcc) - ctx.v(gnd) > 2.7; },
        onUartRx() { /* configuration commands (UBX) are ignored */ },
        input(k, v) {
          if (k === 'lat' || k === 'lon' || k === 'alt') g[k] = Number(v);
          if (k === 'speed' || k === 'heading') g[k] = Number(v);
          if (k === 'sats') g.sats = Math.round(v);
          if (k === 'moving') g.moving = !!v;
          if (k === 'lost') g.lost = !!v;
          if (k === 'home') { g.lat = 23.8103; g.lon = 90.4125; rt.trail = [[g.lat, g.lon]]; }
          rt.version++;
        },
        endFrame() {
          const t = ctx.now();
          if (!this.powered()) { g.powerT = -1; this.visual.pps = 0; return; }
          if (g.powerT < 0) { g.powerT = t; g.next = t + 1e6; }
          const fix = !g.lost && t - g.powerT > 6e6;
          g.fix = fix;
          this.visual.fix = fix;
          this.visual.pps = fix && (t % 1e6) < 100000 ? 1 : 0;
          let guard = 0;
          while (t >= g.next && guard++ < 5) {
            g.next += 1e6;
            if (g.moving && fix && g.speed > 0) {
              const d = (g.speed / 3.6);
              const hr = (g.heading * Math.PI) / 180;
              g.lat += (Math.cos(hr) * d) / 111320;
              g.lon += (Math.sin(hr) * d) / (111320 * Math.max(0.2, Math.cos((g.lat * Math.PI) / 180)));
              this.trail.push([g.lat, g.lon]);
              if (this.trail.length > 400) this.trail.shift();
              this.version++;
            }
            ctx.engine.uartReceive(this, gpsSentences(g, new Date(start + Math.floor(t / 1000))).join(''));
          }
        },
      };
      return rt;
    },
  },
  controlsUI(el, { rt, input }) {
    addCss('gps-css', `
      .gps { display: flex; flex-direction: column; gap: 10px; }
      .gps-map { width: 100%; height: 150px; border-radius: 14px; background: #0b1226; border: 1px solid rgba(148,163,184,.18); }
      .gps-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .gps-grid label { font-size: 12px; color: #9fb0cf; display: block; margin-bottom: 3px; }
      .gps-read { font-family: var(--mono, monospace); font-size: 12.5px; color: #a7f3d0; }
    `);
    const g = rt.gps;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'gps-map');
    svg.setAttribute('viewBox', '0 0 220 150');
    const trail = document.createElementNS(svgNS, 'path');
    trail.setAttribute('fill', 'none'); trail.setAttribute('stroke', '#38bdf8'); trail.setAttribute('stroke-width', '1.5');
    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('r', '5'); dot.setAttribute('fill', '#f97316');
    for (let i = 1; i < 6; i++) { const l = document.createElementNS(svgNS, 'line'); l.setAttribute('x1', String(i * 36.6)); l.setAttribute('x2', String(i * 36.6)); l.setAttribute('y1', '0'); l.setAttribute('y2', '150'); l.setAttribute('stroke', 'rgba(148,163,184,.12)'); svg.appendChild(l); }
    svg.append(trail, dot);
    const num = (key, label, step, v) => {
      const i = h('input', { class: 'input', type: 'number', step: String(step), value: String(v) });
      i.addEventListener('change', () => input(key, parseFloat(i.value) || 0));
      return [h('div', {}, h('label', {}, label), i), i];
    };
    const [latF, latI] = num('lat', 'Latitude', 0.0001, g.lat);
    const [lonF, lonI] = num('lon', 'Longitude', 0.0001, g.lon);
    const slider = (key, label, min, max, step, v, unit) => {
      const val = h('b', {}, v + ' ' + unit);
      const inp = h('input', { type: 'range', class: 'range', min, max, step, value: v });
      inp.addEventListener('input', () => { val.textContent = inp.value + ' ' + unit; input(key, parseFloat(inp.value)); });
      return h('div', { class: 'ctl' }, h('div', { class: 'ctl-head' }, h('label', {}, label), val), inp);
    };
    const mv = h('button', { class: 'toggle' + (g.moving ? ' on' : ''), onclick: () => { mv.classList.toggle('on'); input('moving', mv.classList.contains('on')); } }, h('span'));
    const lost = h('button', { class: 'toggle' + (g.lost ? ' on' : ''), onclick: () => { lost.classList.toggle('on'); input('lost', lost.classList.contains('on')); } }, h('span'));
    const read = h('div', { class: 'gps-read' });
    el.appendChild(h('div', { class: 'gps' }, svg, read,
      h('div', { class: 'gps-grid' }, latF, lonF),
      slider('speed', 'Speed', 0, 120, 1, g.speed, 'km/h'), slider('heading', 'Heading', 0, 359, 1, g.heading, '°'), slider('sats', 'Satellites', 0, 14, 1, g.sats, ''),
      h('div', { class: 'ctl-row' }, h('label', {}, 'Drive (move along the heading)'), mv),
      h('div', { class: 'ctl-row' }, h('label', {}, 'Signal lost (indoors)'), lost),
      h('button', { class: 'btn btn-ghost', onclick: () => { input('home', true); latI.value = String(g.lat); lonI.value = String(g.lon); } }, 'Back to start')));
    let shown = -1;
    function draw() {
      if (shown !== rt.version) {
        shown = rt.version;
        const t = rt.trail;
        const cx = t[t.length - 1][0], cy = t[t.length - 1][1];
        const scale = 6e4; // px per degree
        const pts = t.map(([la, lo]) => [110 + (lo - cy) * scale * Math.cos((cx * Math.PI) / 180), 75 - (la - cx) * scale]);
        trail.setAttribute('d', pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '));
        dot.setAttribute('cx', '110'); dot.setAttribute('cy', '75');
        latI.value = g.lat.toFixed(5); lonI.value = g.lon.toFixed(5);
      }
      read.textContent = (g.fix ? 'FIX · ' : rt.powered() ? 'searching… · ' : 'no power · ') + g.lat.toFixed(5) + ', ' + g.lon.toFixed(5) + ' · ' + g.speed + ' km/h';
    }
    draw();
    const iv = setInterval(() => { if (!el.isConnected) clearInterval(iv); else draw(); }, 300);
  },
  update(el, v) {
    const on = !!v.pps;
    if (el._on === on) return;
    el._on = on;
    el.querySelector('.led-G-glow').setAttribute('opacity', on ? 0.95 : 0);
    el.querySelector('.led-G').setAttribute('fill', on ? '#4ade80' : '#14532d');
  },
});

// ================================================================== robot car (top view rover in a small arena)
const ARENA = { w: 150, h: 100 };
register({
  type: 'robot-car', name: 'Robot Car (2 motors)', category: 'robotics', tags: ['robot', 'car', 'rover', 'chassis', 'differential drive', 'two wheel', 'l298n', 'tb6612'],
  description: 'A two-wheel drive robot in a small arena. Connect the left motor to L+ / L− and the right motor to R+ / R− (from an L298N or TB6612 driver). Positive voltage drives a wheel forward; the car turns when the wheels differ. Reset button in the controls.',
  box: [-12, -118, 172, 4],
  pins: [{ id: 'L+', x: 0, y: 0 }, { id: 'L-', x: 10, y: 0, label: 'L−' }, { id: 'R+', x: 140, y: 0 }, { id: 'R-', x: 150, y: 0, label: 'R−' }],
  controls: [{ key: 'reset', label: 'Put the car back', type: 'button', icon: 'rotate' }],
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-12, -118, 172, 122, { fill: '#27303f', rx: 5 })}</g>`;
    s += rect(0, -108, ARENA.w, ARENA.h, { fill: '#0f1722', rx: 2, stroke: '#64748b', sw: 1.4 });
    for (let i = 1; i < 6; i++) s += line(i * 25, -108, i * 25, -8, { stroke: 'rgba(148,163,184,.1)', sw: 0.4, cap: 'butt' });
    for (let i = 1; i < 4; i++) s += line(0, -108 + i * 25, ARENA.w, -108 + i * 25, { stroke: 'rgba(148,163,184,.1)', sw: 0.4, cap: 'butt' });
    s += path('', { stroke: 'rgba(56,189,248,.55)', sw: 1, lj: 'round', cls: 'rv-trail', extra: ' vector-effect="non-scaling-stroke" style="stroke-width:1.2px"' });
    s += `<g class="rv-car" transform="translate(75 -58)"><rect x="-9" y="-6" width="18" height="12" rx="2" fill="#f97316"/><rect x="-7" y="-9" width="6" height="3" rx="1" fill="#111"/><rect x="-7" y="6" width="6" height="3" rx="1" fill="#111"/><rect x="2" y="-9" width="6" height="3" rx="1" fill="#111"/><rect x="2" y="6" width="6" height="3" rx="1" fill="#111"/><path d="M9 0 L4 -3 V3 Z" fill="#fde68a"/></g>`;
    s += lead(0, 0, -6, { color: '#d32f2f' }) + lead(10, 0, -6, { color: '#222' }) + lead(140, 0, -6, { color: '#d32f2f' }) + lead(150, 0, -6, { color: '#222' });
    s += text(5, -2, 'LEFT', { size: 2.6, fill: '#9ca3af' }) + text(145, -2, 'RIGHT', { size: 2.6, fill: '#9ca3af' });
    return s;
  },
  sim: {
    create(ctx) {
      const n = (p) => ctx.node(p);
      const lp = n('L+'), lm = n('L-'), rp = n('R+'), rm = n('R-');
      ctx.add(new Resistor(lp, lm, 9));
      ctx.add(new Resistor(rp, rm, 9));
      const car = { x: ARENA.w / 2, y: ARENA.h / 2, a: 0 };
      const visual = { x: car.x, y: car.y, a: 0, trail: [[car.x, car.y]], version: 0 };
      const MAX = 45; // wheel speed in arena units per second at 6 V
      return {
        car, visual, wheels: { l: 0, r: 0 },
        input(k, v) {
          if (k === 'reset' && v) { car.x = ARENA.w / 2; car.y = ARENA.h / 2; car.a = 0; visual.trail = [[car.x, car.y]]; visual.version++; }
        },
        tick(dt) {
          const s = dt / 1e6;
          const vl = ctx.v(lp) - ctx.v(lm), vr = ctx.v(rp) - ctx.v(rm);
          const l = clamp(vl / 6, -1.4, 1.4) * MAX, r = clamp(vr / 6, -1.4, 1.4) * MAX;
          this.wheels.l = l; this.wheels.r = r;
          if (Math.abs(l) < 1 && Math.abs(r) < 1) return;
          const v = (l + r) / 2, w = (r - l) / 16;
          car.a += w * s;
          car.x = clamp(car.x + Math.cos(car.a) * v * s, 8, ARENA.w - 8);
          car.y = clamp(car.y + Math.sin(car.a) * v * s, 8, ARENA.h - 8);
          visual.x = car.x; visual.y = car.y; visual.a = car.a;
          const last = visual.trail[visual.trail.length - 1];
          if (Math.hypot(car.x - last[0], car.y - last[1]) > 1.5) { visual.trail.push([car.x, car.y]); if (visual.trail.length > 300) visual.trail.shift(); visual.version++; }
        },
        stopped() { /* keep the final position */ },
      };
    },
  },
  update(el, v) {
    const g = el.querySelector('.rv-car');
    g.setAttribute('transform', `translate(${v.x.toFixed(1)} ${(v.y - 108).toFixed(1)}) rotate(${((v.a * 180) / Math.PI).toFixed(1)})`);
    if (el._v !== v.version) {
      el._v = v.version;
      el.querySelector('.rv-trail').setAttribute('d', v.trail.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + (p[1] - 108).toFixed(1)).join(' '));
    }
  },
});

void nowMs;
