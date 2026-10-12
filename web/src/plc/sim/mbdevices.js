// Modbus slaves on the RS-485 bus besides the drives and the PLCs: a Delta DTB4848 temperature
// controller heating a small oven, an RS-485 temperature / humidity sensor and a 1-phase energy
// meter. Each has a station address, its own serial format and a register map, and answers the
// PLC's MODRW requests (FC 01 02 03 04 05 06 0F 10) like the real device: wrong address → silent,
// unknown register → exception 02, value out of range → exception 03, unsupported function → 01.

export const MB_BAUDS = { 4800: '4800 bps', 9600: '9600 bps', 19200: '19200 bps', 38400: '38400 bps', 57600: '57600 bps', 115200: '115200 bps' };
export const MB_FORMATS = { '8N1': '8N1 · 8 data, no parity, 1 stop', '8E1': '8E1 · 8 data, even parity, 1 stop', '8O1': '8O1 · 8 data, odd parity, 1 stop', '8N2': '8N2 · 8 data, no parity, 2 stop', '7E1': '7E1 · 7 data, even parity, 1 stop', '7O1': '7O1 · 7 data, odd parity, 1 stop', '7N2': '7N2 · 7 data, no parity, 2 stop' };

/** The communication settings every slave has (device settings sheet). */
export const MB_PROPS = [
  { id: 'station', label: 'Station address (Modbus ID 1–247)', type: 'number', min: 1, max: 247 },
  { id: 'baud', label: 'Baud rate', type: 'select', options: MB_BAUDS },
  { id: 'format', label: 'Data format', type: 'select', options: MB_FORMATS },
  { id: 'protocol', label: 'Protocol', type: 'select', options: { RTU: 'Modbus RTU', ASCII: 'Modbus ASCII' } },
];

/** Serial format {baud, bits, parity, stop, mode} from the device settings. */
export function mbFormat(p) {
  const f = MB_FORMATS[p.format] ? p.format : '8N1';
  return { baud: +p.baud || 9600, bits: +f[0], parity: f[1], stop: +f[2], mode: p.protocol === 'ASCII' ? 'ASCII' : 'RTU' };
}
export const mbStation = (p) => Math.max(1, Math.min(247, Math.round(+p.station || 1)));

const hex4 = (a) => (a & 0xFFFF).toString(16).toUpperCase().padStart(4, '0') + 'H';
const s16 = (v) => ((v & 0xFFFF) ^ 0x8000) - 0x8000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Common part of a slave. Subclasses fill `regs` (holding / input registers) and `bits` (coils):
 *   regs[addr] = { name, unit, k (engineering value = raw × k), signed, ro, get() → raw, set(raw) → exception | null }
 */
class Slave {
  constructor(dev, props) {
    this.dev = dev;
    this.props = props; // () → current device settings
    this.powered = false;
    this.time = 0;
    this.regs = {};
    this.bits = {};
    this.fc4 = true; // answers "read input registers" with the same map
    this.stat = { rx: 0, tx: 0, err: 0, lastRx: -9, lastTx: -9, last: '' };
  }

  /** A new device object (undo / redo replaces them): fill in the state defaults again. */
  attach(dev) { this.dev = dev; this.defaults(dev.state); }
  defaults() {}

  get station() { return mbStation(this.props()); }
  format() { return mbFormat(this.props()); }

  /** A request on the bus addressed to this slave (station already checked). Returns {data} | {ok} | {exception}. */
  modbus(req) {
    const { fc, addr } = req;
    const n = fc === 5 || fc === 6 ? 1 : Math.max(1, req.count || 1);
    const values = req.values || [];
    this.stat.rx++; this.stat.lastRx = this.time;
    const done = (res) => { this.stat.tx++; this.stat.lastTx = this.time; if (res.exception) this.stat.err++; return res; };
    if (fc === 3 || (fc === 4 && this.fc4)) {
      const data = [];
      for (let i = 0; i < n; i++) { const r = this.regs[(addr + i) & 0xFFFF]; if (!r) return done({ exception: 2 }); data.push(r.get() & 0xFFFF); }
      return done({ data });
    }
    if (fc === 6 || fc === 16) {
      for (let i = 0; i < n; i++) { const r = this.regs[(addr + i) & 0xFFFF]; if (!r) return done({ exception: 2 }); if (r.ro && !(r.rw && r.rw())) return done({ exception: 2 }); }
      for (let i = 0; i < n; i++) { const e = this.regs[(addr + i) & 0xFFFF].set(values[i] ?? 0); if (e) return done({ exception: e }); }
      this.changed = true;
      return done({ ok: true });
    }
    if (fc === 1 || fc === 2) {
      const data = [];
      for (let i = 0; i < n; i++) { const b = this.bits[(addr + i) & 0xFFFF]; if (!b) return done({ exception: 2 }); data.push(b.get() ? 1 : 0); }
      return done({ data });
    }
    if (fc === 5 || fc === 15) {
      for (let i = 0; i < n; i++) { const b = this.bits[(addr + i) & 0xFFFF]; if (!b || b.ro) return done({ exception: 2 }); }
      for (let i = 0; i < n; i++) this.bits[(addr + i) & 0xFFFF].set(!!values[i]);
      this.changed = true;
      return done({ ok: true });
    }
    return done({ exception: 1 });
  }

  /** Engineering text of a register value: "25.3 °C". */
  regText(addr, raw) {
    const r = this.regs[addr];
    if (!r) return String(raw);
    const v = (r.signed ? s16(raw) : raw & 0xFFFF) * (r.k || 1);
    const dec = r.k && r.k < 1 ? Math.round(-Math.log10(r.k)) : 0;
    return `${v.toFixed(dec)}${r.unit ? ' ' + r.unit : ''}`;
  }

  /** Short description of a request for the comm log: "Read PV, SV (1000H ×2)". */
  describe(req, values = []) {
    const n = req.fc === 5 || req.fc === 6 ? 1 : Math.max(1, req.count || req.n || 1);
    const bitFc = [1, 2, 5, 15].includes(req.fc);
    const names = [];
    for (let i = 0; i < Math.min(n, 4); i++) { const r = (bitFc ? this.bits : this.regs)[(req.addr + i) & 0xFFFF]; names.push(r ? r.name : '?'); }
    const what = names.join(', ') + (n > 4 ? '…' : '');
    if (req.fc === 3 || req.fc === 4 || req.fc === 1 || req.fc === 2) return `Read ${what} (${hex4(req.addr)}${n > 1 ? ' ×' + n : ''})`;
    if (req.fc === 5 || req.fc === 15) return `Write ${what} = ${values.slice(0, n).map((v) => (v ? 'ON' : 'OFF')).join(', ')} (${hex4(req.addr)})`;
    if (req.fc === 6 || req.fc === 16) return `Write ${what} = ${values.slice(0, n).map((v, i) => this.regText((req.addr + i) & 0xFFFF, v)).join(', ')} (${hex4(req.addr)})`;
    return `FC ${req.fc}`;
  }

  /** Text of a reply: "PV 25.3 °C · SV 150.0 °C". */
  describeReply(req, res) {
    if (!res.data) return 'OK';
    const bitFc = req.fc === 1 || req.fc === 2;
    return res.data.slice(0, 4).map((v, i) => {
      const a = (req.addr + i) & 0xFFFF;
      const r = (bitFc ? this.bits : this.regs)[a];
      return r ? `${r.name} ${bitFc ? (v ? 'ON' : 'OFF') : this.regText(a, v)}` : String(v);
    }).join(' · ') + (res.data.length > 4 ? ' …' : '');
  }

  /** Register map with live values for the Network monitor. */
  table() {
    const out = [];
    for (const [a, r] of Object.entries(this.regs)) {
      const raw = r.get() & 0xFFFF;
      out.push({ addr: hex4(+a), kind: this.fc4 ? 'FC03/04' : 'FC03', name: r.name, raw: r.signed ? s16(raw) : raw, text: this.regText(+a, raw), rw: !r.ro || !!(r.rw && r.rw()), note: r.note || '' });
    }
    for (const [a, b] of Object.entries(this.bits)) out.push({ addr: hex4(+a), kind: 'FC01/05', name: b.name, raw: b.get() ? 1 : 0, text: b.get() ? 'ON' : 'OFF', rw: !b.ro, note: b.note || '' });
    return out;
  }

  step(dt) { this.time += dt; }
}

// ====================================================================== DTB4848 temperature controller
/**
 * Delta DTB4848 (48 × 48 mm) PID temperature controller with a thermocouple in a small oven and a
 * heater on OUT1. Register map as in the DTB manual: 1000H PV, 1001H SV, 1002H / 1003H range, 1005H
 * control method, 1009H PB, 100AH Ti, 100BH Td, 1012H output 1 (%), bit 0813H auto-tuning, bit 0814H
 * RUN / STOP. Units of 0.1 °C. The oven: 3.2 °C per % of heater power above ambient, time constant
 * 30 s. PID defaults: band 8 °C, Ti 30 s, Td 3 s — all three can be changed (HMI / PLC / auto-tune).
 */
export class TempController extends Slave {
  constructor(dev, props) {
    super(dev, props);
    this.defaults(dev.state);
    // the device object is replaced on undo / redo: always read its current state
    const S = () => this.dev.state;
    this.amb = 25;
    this.pv = this.amb;
    this.out = 0; this.integ = 0; this.lastPv = this.pv; this.dF = 0; this.cycle = 0; this.onoff = false;
    this.at = null; // auto-tuning in progress: {t, p0, d6}
    this.atResult = '';
    this.fc4 = false;
    const t = (v) => Math.round(v * 10);
    const range = (raw, lo, hi) => { const v = s16(raw) / 10; return v < lo || v > hi ? null : v; };
    this.regs = {
      0x1000: { name: 'PV', unit: '°C', k: 0.1, signed: true, ro: true, get: () => t(this.pv), note: 'Process value (oven temperature)' },
      0x1001: { name: 'SV', unit: '°C', k: 0.1, signed: true, get: () => t(S().sv), set: (raw) => { const s = S(), v = range(raw, s.lo, s.hi); if (v === null) return 3; s.sv = v; return null; }, note: 'Set value (within 1003H … 1002H)' },
      0x1002: { name: 'Upper limit', unit: '°C', k: 0.1, signed: true, get: () => t(S().hi), set: (raw) => { const s = S(), v = range(raw, s.lo + 1, 1300); if (v === null) return 3; s.hi = v; s.sv = Math.min(s.sv, v); return null; }, note: 'Upper limit of the temperature range' },
      0x1003: { name: 'Lower limit', unit: '°C', k: 0.1, signed: true, get: () => t(S().lo), set: (raw) => { const s = S(), v = range(raw, -200, s.hi - 1); if (v === null) return 3; s.lo = v; s.sv = Math.max(s.sv, v); return null; }, note: 'Lower limit of the temperature range' },
      0x1005: { name: 'Control', unit: '', get: () => S().mode, set: (raw) => { if (raw > 2) return 3; S().mode = raw; this.integ = 0; return null; }, note: '0 = PID, 1 = ON/OFF, 2 = manual output' },
      0x1009: { name: 'PB', unit: '°C', k: 0.1, get: () => t(S().pb), set: (raw) => { if (raw < 1 || raw > 9999) return 3; S().pb = raw / 10; return null; }, note: 'Proportional band (0.1 … 999.9 °C): a smaller band = a stronger reaction' },
      0x100A: { name: 'Ti', unit: 's', get: () => Math.round(S().ti), set: (raw) => { if (raw > 9999) return 3; S().ti = raw; this.integ = 0; return null; }, note: 'Integral time in seconds (0 = no integral action)' },
      0x100B: { name: 'Td', unit: 's', get: () => Math.round(S().td), set: (raw) => { if (raw > 9999) return 3; S().td = raw; return null; }, note: 'Derivative time in seconds (0 = no derivative action)' },
      0x1012: { name: 'OUT1', unit: '%', k: 0.1, ro: true, rw: () => S().mode === 2, get: () => t(this.out), set: (raw) => { if (raw > 1000) return 3; S().manual = raw / 10; return null; }, note: 'Output 1 (heater) — writable in manual mode' },
    };
    this.bits = {
      0x0813: { name: 'AT', get: () => !!this.at, set: (v) => { if (v) this.startAT(); else this.at = null; }, note: 'Auto-tuning: 1 = start, back to 0 when PB / Ti / Td are found' },
      0x0814: { name: 'RUN', get: () => !!S().run, set: (v) => { S().run = v; if (!v) { this.integ = 0; this.at = null; } }, note: 'RUN / STOP (1 = RUN)' },
    };
  }

  defaults(s) { s.sv = s.sv ?? 120; s.run = s.run ?? true; s.mode = s.mode ?? 0; s.manual = s.manual ?? 30; s.hi = s.hi ?? 400; s.lo = s.lo ?? 0; s.pb = s.pb ?? 8; s.ti = s.ti ?? 30; s.td = s.td ?? 3; }

  get tuning() { return !!this.at; }

  /** Auto-tuning: the heater is switched fully on for 12 s; the way the temperature rises (the ratio of
   *  the rise after 12 s to the rise after 6 s) gives the oven's time constant and gain, from which
   *  PB, Ti and Td follow (Ti = time constant, Td = 10 % of it, a closed loop 8 × faster than the oven). */
  startAT() {
    const s = this.dev.state;
    if (!this.powered || !s.run || s.mode !== 0) return;
    this.at = { t: 0, p0: this.pv, d6: null };
    this.atResult = '';
  }

  stepAT(dt) {
    const a = this.at;
    this.out = 100;
    a.t += dt;
    if (a.d6 === null && a.t >= 6) a.d6 = this.pv - a.p0;
    if (a.t < 12) return;
    const d12 = this.pv - a.p0, r = a.d6 > 0 ? d12 / a.d6 : 0;
    this.at = null;
    if (a.d6 < 0.3 || r <= 1.02 || r >= 1.98) { this.atResult = 'failed'; return; }
    const tau = -6 / Math.log(r - 1);
    const full = a.d6 / (1 - Math.exp(-6 / tau)); // the rise the heater would give in the end
    const K = (a.p0 + full - this.amb) / 100;     // °C per % of heater power
    const s = this.dev.state;
    s.ti = Math.max(1, Math.round(tau));
    s.td = Math.max(0, Math.round(tau * 0.1));
    s.pb = Math.max(0.5, Math.min(999.9, Math.round(12.5 * K * 10) / 10)); // PB = 100 / Kp with Kp = 8 / K
    this.integ = 0;
    this.atResult = 'done';
  }

  step(dt) {
    super.step(dt);
    const s = this.dev.state;
    // the oven warms with the heater and loses heat to the room (also while the controller is off)
    const heat = this.powered ? this.out : 0;
    this.pv += dt * (heat * 3.2 - (this.pv - this.amb)) / 30;
    if (!this.powered) { this.out = 0; return; }
    if (!s.run) { this.out = 0; this.cycle = 0; this.at = null; return; }
    if (this.at) { this.stepAT(dt); this.cycle = (this.cycle + dt) % 2; return; }
    const e = s.sv - this.pv;
    if (s.mode === 1) {
      // ON/OFF with a 1 °C hysteresis
      if (e > 0.5) this.onoff = true; else if (e < -0.5) this.onoff = false;
      this.out = this.onoff ? 100 : 0;
    } else if (s.mode === 2) {
      this.out = clamp(s.manual, 0, 100);
    } else {
      const PB = Math.max(0.1, s.pb), Ti = s.ti, Td = s.td;
      // derivative on the measurement, filtered over about 1.5 s (no chatter, no kick when SV changes)
      const rate = dt > 0 ? (this.pv - this.lastPv) / dt : 0;
      this.lastPv = this.pv;
      this.dF += (rate - this.dF) * Math.min(1, dt / 1.5);
      // integrate only inside the proportional band (no wind-up while heating from cold)
      if (Ti <= 0) this.integ = 0;
      else if (Math.abs(e) < PB) this.integ = clamp(this.integ + (e * dt) / Ti, -PB, PB);
      this.out = clamp((100 / PB) * (e + this.integ - Td * this.dF), 0, 100);
    }
    this.cycle = (this.cycle + dt) % 2;
  }

  /** OUT1 relay: time-proportioned over a 2 s cycle (the OUT1 LED blinks with it). */
  get out1() { return this.powered && this.out > 0 && this.cycle < (this.out / 100) * 2 + 0.02; }
  get alarm() { return this.powered && this.pv > this.dev.state.sv + 10; }
}

// ====================================================================== RS-485 temperature / humidity sensor
/**
 * Industrial temperature & humidity transmitter with an RS-485 Modbus RTU interface (10–30 V DC):
 * 0000H temperature (0.1 °C, signed), 0001H relative humidity (0.1 %RH), 0002H dew point (0.1 °C),
 * readable with function 03 or 04.
 */
export class ThSensor extends Slave {
  constructor(dev, props) {
    super(dev, props);
    this.defaults(dev.state);
    this.noise = 0; this.nT = 0;
    const t = (v) => Math.round(v * 10);
    this.regs = {
      0x0000: { name: 'Temp', unit: '°C', k: 0.1, signed: true, ro: true, get: () => t(this.temp), note: 'Temperature' },
      0x0001: { name: 'RH', unit: '%RH', k: 0.1, ro: true, get: () => t(this.rh), note: 'Relative humidity' },
      0x0002: { name: 'Dew point', unit: '°C', k: 0.1, signed: true, ro: true, get: () => t(this.dew), note: 'Dew point (calculated)' },
    };
  }

  defaults(s) { s.temp = s.temp ?? 26.5; s.rh = s.rh ?? 55; }

  get temp() { return this.dev.state.temp + this.noise; }
  get rh() { return clamp(this.dev.state.rh + this.noise * 2, 0, 100); }
  /** Magnus formula. */
  get dew() { const a = 17.62, b = 243.12, T = this.temp, g = Math.log(Math.max(1, this.rh) / 100) + (a * T) / (b + T); return (b * g) / (a - g); }

  step(dt) {
    super.step(dt);
    // a little measuring noise, like a real sensor (±0.1)
    this.nT -= dt;
    if (this.nT <= 0) { this.nT = 1.5; this.noise = Math.round((Math.random() - 0.5) * 2) / 10; }
  }
}

// ====================================================================== 1-phase energy meter
/**
 * DIN-rail 1-phase energy meter with RS-485 Modbus RTU, on the main incomer of the panel: it measures
 * the voltage on L / N and the power the panel takes (drives, supplies, PLCs).
 * 0000H voltage (0.1 V), 0001H current (0.01 A), 0002H active power (W), 0003H power factor (0.01),
 * 0004H frequency (0.01 Hz), 0005H / 0006H energy in Wh, 32-bit (low word first, as a DVP D pair).
 */
export class EnergyMeter extends Slave {
  constructor(dev, props) {
    super(dev, props);
    this.defaults(dev.state);
    const S = () => this.dev.state;
    this.V = 0; this.I = 0; this.P = 0; this.pf = 1; this.hz = 0; this.page = 0; this.pageT = 0; this.ripple = 0;
    this.regs = {
      0x0000: { name: 'Voltage', unit: 'V', k: 0.1, ro: true, get: () => Math.round(this.V * 10), note: 'L–N voltage' },
      0x0001: { name: 'Current', unit: 'A', k: 0.01, ro: true, get: () => Math.round(this.I * 100), note: 'Line current' },
      0x0002: { name: 'Power', unit: 'W', ro: true, get: () => Math.round(this.P), note: 'Active power' },
      0x0003: { name: 'PF', unit: '', k: 0.01, ro: true, get: () => Math.round(this.pf * 100), note: 'Power factor' },
      0x0004: { name: 'Frequency', unit: 'Hz', k: 0.01, ro: true, get: () => Math.round(this.hz * 100), note: 'Mains frequency' },
      0x0005: { name: 'Energy L', unit: 'Wh', ro: true, get: () => Math.floor(S().wh) & 0xFFFF, note: 'Energy in Wh, low word' },
      0x0006: { name: 'Energy H', unit: '', ro: true, get: () => (Math.floor(S().wh) >>> 16) & 0xFFFF, note: 'Energy in Wh, high word (× 65536)' },
    };
  }

  defaults(s) { s.wh = s.wh ?? 0; }

  /** load: watts the panel takes now (from the simulator). */
  step(dt, load = 0) {
    super.step(dt);
    if (!this.powered) { this.V = 0; this.I = 0; this.P = 0; this.hz = 0; this.pf = 1; return; }
    this.pageT += dt;
    if (this.pageT > 3) { this.pageT = 0; this.page = (this.page + 1) % 4; }
    this.ripple += dt;
    this.V = 230 + Math.sin(this.ripple * 0.7) * 0.6;
    this.hz = 50 + Math.sin(this.ripple * 0.31) * 0.02;
    // a drive's diode rectifier: power factor about 0.6 at light load, 0.8 at full load
    this.P += (load - this.P) * Math.min(1, dt * 4);
    this.pf = this.P > 1 ? 0.6 + 0.2 * Math.min(1, this.P / 900) : 1;
    this.I = this.P / (this.V * this.pf);
    this.dev.state.wh += (this.P * dt) / 3600;
  }
}

export const SLAVE_CLASSES = { tc: TempController, mbth: ThSensor, meter: EnergyMeter };
