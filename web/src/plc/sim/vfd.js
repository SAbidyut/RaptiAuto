// Delta MS300 variable frequency drive model: parameters, keypad, terminal / RS-485 control,
// acceleration ramps, V/f output, an induction motor load, protections and Modbus registers.

const opts = (o) => o;
export const VFD_PARAMS = [
  { id: '00-00', name: 'Identity code of the AC motor drive', def: 6, dec: 0, ro: true },
  { id: '00-01', name: 'Rated current of the drive', def: 7.5, dec: 1, unit: 'A', ro: true },
  { id: '00-02', name: 'Parameter reset', def: 0, dec: 0, min: 0, max: 10, opts: opts({ 0: 'No function', 1: 'Parameter write protect', 9: 'Reset all to factory (50 Hz)', 10: 'Reset all to factory (60 Hz)' }) },
  { id: '00-04', name: 'Content of the user display (U)', def: 6, dec: 0, min: 0, max: 6, opts: opts({ 0: 'Output current (A)', 2: 'Actual output frequency (H)', 3: 'DC bus voltage (u)', 4: 'Output voltage (E)', 5: 'Output power (P, kW)', 6: 'Motor speed (r, rpm)' }) },
  { id: '00-20', name: 'Source of master frequency command', def: 0, dec: 0, min: 0, max: 2, opts: opts({ 0: 'Digital keypad', 1: 'RS-485 communication', 2: 'External analog input (AVI)' }) },
  { id: '00-21', name: 'Source of operation command', def: 0, dec: 0, min: 0, max: 2, opts: opts({ 0: 'Digital keypad', 1: 'External terminals (MI1 / MI2)', 2: 'RS-485 communication' }) },
  { id: '00-22', name: 'Stop method', def: 0, dec: 0, min: 0, max: 1, opts: opts({ 0: 'Ramp to stop', 1: 'Coast to stop' }) },
  { id: '00-23', name: 'Motor direction control', def: 0, dec: 0, min: 0, max: 2, opts: opts({ 0: 'Forward and reverse enabled', 1: 'Reverse disabled', 2: 'Forward disabled' }) },
  { id: '00-32', name: 'Digital keypad STOP function', def: 1, dec: 0, min: 0, max: 1, opts: opts({ 0: 'STOP key disabled (external / RS-485 control)', 1: 'STOP key enabled in every control mode' }) },
  { id: '01-00', name: 'Maximum operation frequency', def: 50, dec: 2, unit: 'Hz', min: 0, max: 599 },
  { id: '01-01', name: 'Motor 1 rated / base frequency', def: 50, dec: 2, unit: 'Hz', min: 0, max: 599 },
  { id: '01-02', name: 'Motor 1 rated voltage', def: 220, dec: 1, unit: 'V', min: 0, max: 255 },
  { id: '01-10', name: 'Output frequency upper limit', def: 599, dec: 2, unit: 'Hz', min: 0, max: 599 },
  { id: '01-11', name: 'Output frequency lower limit', def: 0, dec: 2, unit: 'Hz', min: 0, max: 599 },
  { id: '01-12', name: 'Acceleration time 1', def: 10, dec: 2, unit: 's', min: 0, max: 600 },
  { id: '01-13', name: 'Deceleration time 1', def: 10, dec: 2, unit: 's', min: 0, max: 600 },
  { id: '02-00', name: 'Two-wire / three-wire operation control', def: 0, dec: 0, min: 0, max: 2, opts: opts({ 0: '2-wire: MI1 FWD/STOP, MI2 REV/STOP', 1: '2-wire: MI1 RUN/STOP, MI2 REV/FWD', 2: '3-wire: MI1 RUN, MI2 REV/FWD, MI3 STOP' }) },
  { id: '02-01', name: 'Multi-function input MI3', def: 1, dec: 0, min: 0, max: 10, opts: MI_OPTS() },
  { id: '02-02', name: 'Multi-function input MI4', def: 2, dec: 0, min: 0, max: 10, opts: MI_OPTS() },
  { id: '02-03', name: 'Multi-function input MI5', def: 3, dec: 0, min: 0, max: 10, opts: MI_OPTS() },
  { id: '02-13', name: 'Relay RY1 (RA / RB / RC) function', def: 11, dec: 0, min: 0, max: 11, opts: opts({ 0: 'No function', 1: 'Indication during RUN', 2: 'Operation speed reached', 11: 'Malfunction indication' }) },
  { id: '03-00', name: 'AVI analog input function', def: 1, dec: 0, ro: true, opts: opts({ 1: 'Frequency command (0–10 V = 0–Pr.01-00)' }) },
  { id: '04-00', name: 'Multi-step speed 1', def: 10, dec: 2, unit: 'Hz', min: 0, max: 599 },
  { id: '04-01', name: 'Multi-step speed 2', def: 20, dec: 2, unit: 'Hz', min: 0, max: 599 },
  { id: '04-02', name: 'Multi-step speed 3', def: 30, dec: 2, unit: 'Hz', min: 0, max: 599 },
  { id: '04-03', name: 'Multi-step speed 4', def: 35, dec: 2, unit: 'Hz', min: 0, max: 599 },
  { id: '04-04', name: 'Multi-step speed 5', def: 40, dec: 2, unit: 'Hz', min: 0, max: 599 },
  { id: '04-05', name: 'Multi-step speed 6', def: 45, dec: 2, unit: 'Hz', min: 0, max: 599 },
  { id: '04-06', name: 'Multi-step speed 7', def: 50, dec: 2, unit: 'Hz', min: 0, max: 599 },
  { id: '05-01', name: 'Motor 1 full-load current', def: 3.2, dec: 2, unit: 'A', min: 0, max: 20 },
  { id: '05-02', name: 'Motor 1 no-load current', def: 1.3, dec: 2, unit: 'A', min: 0, max: 20 },
  { id: '05-03', name: 'Motor 1 rated speed', def: 1420, dec: 0, unit: 'rpm', min: 0, max: 65535 },
  { id: '05-04', name: 'Motor 1 number of poles', def: 4, dec: 0, min: 2, max: 20 },
  { id: '09-00', name: 'COM1 communication address', def: 1, dec: 0, min: 1, max: 254 },
  { id: '09-01', name: 'COM1 transmission speed', def: 9.6, dec: 1, unit: 'kbps', min: 4.8, max: 115.2, opts: opts({ 4.8: '4800 bps', 9.6: '9600 bps', 19.2: '19200 bps', 38.4: '38400 bps', 57.6: '57600 bps', 115.2: '115200 bps' }) },
  { id: '09-02', name: 'COM1 transmission fault treatment', def: 3, dec: 0, min: 0, max: 3, opts: opts({ 0: 'Warn and continue operation', 1: 'Fault and ramp to stop', 2: 'Fault and coast to stop', 3: 'No warning, continue operation' }) },
  { id: '09-03', name: 'COM1 time-out detection', def: 0, dec: 1, unit: 's', min: 0, max: 100 },
  { id: '09-04', name: 'COM1 communication protocol', def: 1, dec: 0, min: 1, max: 17, opts: PROTO_OPTS() },
];

function MI_OPTS() { return { 0: 'No function', 1: 'Multi-step speed command 1', 2: 'Multi-step speed command 2', 3: 'Multi-step speed command 3', 5: 'Fault reset', 10: 'External fault (EF) input' }; }
function PROTO_OPTS() {
  const o = {};
  const list = ['7,N,2 ASCII', '7,E,1 ASCII', '7,O,1 ASCII', '7,E,2 ASCII', '7,O,2 ASCII', '8,N,1 ASCII', '8,N,2 ASCII', '8,E,1 ASCII', '8,O,1 ASCII', '8,E,2 ASCII', '8,O,2 ASCII', '8,N,1 RTU', '8,N,2 RTU', '8,E,1 RTU', '8,O,1 RTU', '8,E,2 RTU', '8,O,2 RTU'];
  list.forEach((t, i) => { o[i + 1] = t; });
  return o;
}

export const PARAM_BY_ID = Object.fromEntries(VFD_PARAMS.map((p) => [p.id, p]));
export const PARAM_GROUPS = [...new Set(VFD_PARAMS.map((p) => p.id.slice(0, 2)))];
export const GROUP_NAMES = { '00': 'Drive parameters', '01': 'Basic parameters', '02': 'Digital input / output', '03': 'Analog input', '04': 'Multi-step speed', '05': 'Motor parameters', '09': 'Communication' };

export const paramAddr = (id) => (parseInt(id.slice(0, 2), 10) << 8) | parseInt(id.slice(3), 10);
export const paramByAddr = (addr) => VFD_PARAMS.find((p) => paramAddr(p.id) === addr);

export const FAULTS = {
  ocA: { n: 1, text: 'Over-current during acceleration — acceleration time (01-12) is too short' },
  ocd: { n: 2, text: 'Over-current during deceleration' },
  ocn: { n: 3, text: 'Over-current at constant speed' },
  ovd: { n: 8, text: 'Over-voltage during deceleration — deceleration time (01-13) is too short' },
  EoL1: { n: 22, text: 'Motor overload (electronic thermal relay) — reduce the load' },
  EF: { n: 49, text: 'External fault (EF) input is active' },
  CE10: { n: 58, text: 'Modbus communication time-out (Pr.09-03)' },
};

/** Serial format from Pr.09-01 / 09-04. */
export function vfdFormat(params) {
  const code = params['09-04'] | 0;
  const t = PROTO_OPTS()[code] || '7,N,2 ASCII';
  const [bits, parity, stopMode] = t.split(',');
  const [stop, mode] = stopMode.split(' ');
  return { baud: Math.round(params['09-01'] * 1000), bits: +bits, parity, stop: +stop, mode };
}

export function defaultParams() { return Object.fromEntries(VFD_PARAMS.map((p) => [p.id, p.def])); }

export class VfdMS300 {
  constructor(params = {}) {
    this.params = { ...defaultParams(), ...params };
    this.powered = false;
    this.fault = null;
    this.warning = null;
    this.fKey = 50;
    this.fComm = 0;
    this.cmdWord = 0;
    this.cmd2002 = 0;
    this.commRun = false;
    this.commDir = 1;
    this.keyRun = false;
    this.keyDir = 1;
    this.keyStop = false;
    this.latch3 = false;
    this.f = 0;
    this.dir = 1;
    this.V = 0;
    this.I = 0;
    this.dc = 0;
    this.thermal = 0;
    this.runCmd = false;
    this.fcmd = 0;
    this.step = 0;
    this.time = 0;
    this.lastComm = 0;
    this.bootT = 0;
    this.MI = [0, 0, 0, 0, 0, 0];
    this.prevMI = [0, 0, 0, 0, 0, 0];
    this.avi = 0;
    this.motor = { connected: false, sign: 1, load: 0.4 };
    this.rpm = 0;
    this.kp = { mode: 'F', group: 0, pidx: 0, edit: 0, pos: 2, flash: null, flashT: 0 };
  }

  P(id) { return this.params[id]; }

  setParam(id, v) {
    const d = PARAM_BY_ID[id];
    if (!d) return 'Unknown parameter';
    if (d.ro) return 'Read-only parameter';
    if (this.params['00-02'] === 1 && id !== '00-02') return 'Parameters are write-protected (00-02 = 1)';
    if (d.opts && d.opts[v] === undefined) return 'Value not allowed';
    if (d.min !== undefined && (v < d.min || v > d.max)) return `Range ${d.min}–${d.max}`;
    if (id === '00-02' && (v === 9 || v === 10)) {
      this.params = defaultParams();
      if (v === 10) { this.params['01-00'] = 60; this.params['01-01'] = 60; }
      return null;
    }
    this.params[id] = Math.round(v * 10 ** d.dec) / 10 ** d.dec;
    return null;
  }

  powerOn() { if (!this.powered) { this.powered = true; this.bootT = 1.2; this.keyRun = false; this.keyStop = false; this.commRun = false; this.f = 0; } }
  powerOff() { if (this.powered) { this.powered = false; this.f = 0; this.V = 0; this.I = 0; this.dc = 0; this.runCmd = false; this.warning = null; } }

  get running() { return this.powered && !this.fault && (Math.abs(this.f) > 0.001 || this.runCmd); }

  // ------------------------------------------------------------------ control
  /** Multi-function input active? fn = function code. */
  /** Multi-function inputs (MI3 is the STOP input in 3-wire mode, not a multi-function input). */
  miMap() {
    const map = [['02-01', 2], ['02-02', 3], ['02-03', 4]];
    return this.P('02-00') === 2 ? map.slice(1) : map;
  }
  miFn(fn) {
    for (const [id, i] of this.miMap()) if (this.P(id) === fn && this.MI[i]) return true;
    return false;
  }
  miRise(fn) {
    for (const [id, i] of this.miMap()) if (this.P(id) === fn && this.MI[i] && !this.prevMI[i]) return true;
    return false;
  }

  resetFault() {
    if (!this.fault) return;
    if (this.fault === 'EF' && this.miFn(10)) return;
    this.fault = null;
    this.keyRun = false;
    this.latch3 = false;
    this.thermal = 0;
  }

  trip(code) {
    if (this.fault) return;
    this.fault = code;
    this.keyRun = false;
    this.commRun = false;
    this.latch3 = false;
  }

  /** Operation command and direction from the selected source. */
  command() {
    const src = this.P('00-21');
    let run = false, dir = 1;
    if (src === 0) { run = this.keyRun; dir = this.keyDir; }
    else if (src === 1) {
      const [mi1, mi2] = this.MI;
      const m = this.P('02-00');
      if (m === 0) { run = (mi1 ^ mi2) === 1; dir = mi2 && !mi1 ? -1 : 1; }
      else if (m === 1) { run = !!mi1; dir = mi2 ? -1 : 1; }
      else {
        if (!this.MI[2]) this.latch3 = false; else if (mi1 && !this.prevMI[0]) this.latch3 = true;
        run = this.latch3; dir = mi2 ? -1 : 1;
      }
    } else { run = this.commRun; dir = this.commDir; }
    // STOP pressed on the keypad (Pr.00-32 = 1) holds an external / RS-485 run command off
    // until that command is switched off and on again
    if (src !== 0 && this.keyStop) { if (!run) this.keyStop = false; run = false; }
    const lock = this.P('00-23');
    if ((lock === 1 && dir < 0) || (lock === 2 && dir > 0)) run = false;
    return { run, dir };
  }

  freqCommand() {
    const bits = (this.miFn(1) ? 1 : 0) | (this.miFn(2) ? 2 : 0) | (this.miFn(3) ? 4 : 0);
    this.step = bits;
    let f;
    if (bits) f = this.P('04-0' + (bits - 1));
    else {
      const src = this.P('00-20');
      if (src === 0) f = this.fKey;
      else if (src === 1) f = this.fComm;
      else f = Math.max(0, Math.min(10, this.avi)) / 10 * this.P('01-00');
    }
    const hiLim = Math.min(this.P('01-00'), this.P('01-10'));
    return Math.max(this.P('01-11'), Math.min(hiLim, f));
  }

  // ------------------------------------------------------------------ simulation step (dt in seconds)
  stepSim(dt) {
    this.time += dt;
    if (!this.powered) { this.decayMotor(dt); this.prevMI = this.MI.slice(); return; }
    if (this.bootT > 0) this.bootT -= dt;
    if (this.kp.flashT > 0) { this.kp.flashT -= dt; if (this.kp.flashT <= 0) this.kp.flash = null; }
    if (this.miFn(10)) this.trip('EF');
    if (this.miRise(5)) this.resetFault();
    // communication time-out
    const usesComm = this.P('00-20') === 1 || this.P('00-21') === 2;
    const tmo = this.P('09-03');
    this.warning = null;
    if (usesComm && tmo > 0 && this.time - this.lastComm > tmo) {
      const tr = this.P('09-02');
      if (tr === 0) this.warning = 'CE10';
      else if (tr === 1 || tr === 2) { this.trip('CE10'); if (tr === 2) this.f = 0; }
    }
    const cmd = this.command();
    this.runCmd = cmd.run && !this.fault;
    this.fcmd = this.freqCommand();
    const fmax = Math.max(1, this.P('01-00'));
    let target = this.runCmd ? cmd.dir * this.fcmd : 0;
    const coast = (!this.runCmd && this.P('00-22') === 1) || !!this.fault;
    const prevF = this.f;
    if (coast) this.f = 0;
    else {
      const away = Math.abs(target) > Math.abs(this.f) && Math.sign(target || 1) === Math.sign(this.f || target || 1);
      const tAcc = Math.max(0.01, this.P('01-12')), tDec = Math.max(0.01, this.P('01-13'));
      const rate = (away ? fmax / tAcc : fmax / tDec) * dt;
      if (Math.sign(target) !== Math.sign(this.f) && this.f !== 0) target = 0; // pass through zero first
      if (Math.abs(target - this.f) <= rate) this.f = target; else this.f += Math.sign(target - this.f) * rate;
      if (!this.runCmd && Math.abs(this.f) < 0.005) this.f = 0;
    }
    if (this.f !== 0) this.dir = Math.sign(this.f);
    const dfdt = (Math.abs(this.f) - Math.abs(prevF)) / Math.max(dt, 1e-6);
    // electrical outputs
    const fb = Math.max(1, this.P('01-01'));
    const af = Math.abs(this.f);
    this.V = this.P('01-02') * Math.min(1, af / fb);
    const m = this.motor;
    const Ifl = this.P('05-01'), Inl = this.P('05-02');
    if (m.connected && af > 0) {
      const k = Math.min(1, af / fb + 0.15);
      const accelI = Ifl * 0.6 * Math.abs(dfdt) / 50;
      this.I = Inl * k + (Ifl - Inl) * m.load * k + accelI;
      if (dfdt > 0 && this.I > Ifl * 2.5) this.trip('ocA');
      else if (dfdt < 0 && this.I > Ifl * 2.5) this.trip('ocd');
      // regenerated energy during deceleration raises the DC bus
      this.dc = 311 + Math.max(0, -dfdt) * 0.9 * (0.5 + m.load);
      if (this.dc > 410) this.trip('ovd');
      // electronic thermal relay
      if (this.I > Ifl * 1.5) this.thermal += dt; else this.thermal = Math.max(0, this.thermal - dt * 0.5);
      if (this.thermal > 5) this.trip('EoL1');
    } else { this.I = 0; this.dc = 311; }
    // motor speed
    if (m.connected && af > 0 && !this.fault) {
      const poles = Math.max(2, this.P('05-04'));
      const sync = 120 * af / poles;
      const syncRated = 120 * fb / poles;
      const slip = Math.max(0, (syncRated - this.P('05-03')) / syncRated) * m.load;
      this.rpm = Math.sign(this.f) * m.sign * sync * (1 - slip);
    } else this.decayMotor(dt);
    this.prevMI = this.MI.slice();
  }

  decayMotor(dt) {
    this.rpm *= Math.exp(-dt / 1.6);
    if (Math.abs(this.rpm) < 1) this.rpm = 0;
  }

  /** Relay RA–RC closed (RB–RC is the opposite). */
  relay() {
    const fn = this.P('02-13');
    if (!this.powered) return false;
    if (fn === 11) return !!this.fault;
    if (fn === 1) return this.running;
    if (fn === 2) return this.runCmd && Math.abs(Math.abs(this.f) - this.fcmd) < 0.05;
    return false;
  }

  /** AFM analog output 0–10 V proportional to output frequency. */
  afm() { return this.powered ? 10 * Math.abs(this.f) / Math.max(1, this.P('01-00')) : 0; }

  // ------------------------------------------------------------------ Modbus slave
  status() {
    let s = 0;
    if (this.runCmd) s |= 3; else if (this.f !== 0) s |= 1;
    if (this.dir < 0) s |= 0x18;
    if (this.P('00-20') === 1) s |= 0x100;
    if (this.P('00-20') === 2) s |= 0x200;
    if (this.P('00-21') === 2) s |= 0x400;
    if (this.P('00-02') === 1) s |= 0x800;
    return s;
  }

  readReg(a) {
    switch (a) {
      case 0x2000: return this.cmdWord;
      case 0x2001: return Math.round(this.fComm * 100);
      case 0x2002: return this.cmd2002;
      case 0x2100: return this.fault ? FAULTS[this.fault].n : 0;
      case 0x2101: return this.status();
      case 0x2102: return Math.round(this.fcmd * 100);
      case 0x2103: return Math.round(Math.abs(this.f) * 100);
      case 0x2104: return Math.round(this.I * 100);
      case 0x2105: return Math.round(this.dc * 10);
      case 0x2106: return Math.round(this.V * 10);
      case 0x2107: return this.step;
      case 0x210C: return Math.round(Math.abs(this.rpm));
      default: {
        const p = paramByAddr(a);
        if (p) return Math.round(this.params[p.id] * 10 ** p.dec);
        return null;
      }
    }
  }

  writeReg(a, v) {
    v &= 0xFFFF;
    if (a === 0x2000) {
      this.cmdWord = v;
      const run = v & 3, dir = (v >> 4) & 3;
      if (run === 1) this.commRun = false;
      else if (run === 2 || run === 3) this.commRun = !this.fault;
      if (dir === 1) this.commDir = 1; else if (dir === 2) this.commDir = -1; else if (dir === 3) this.commDir = -this.commDir;
      return null;
    }
    if (a === 0x2001) { this.fComm = v / 100; return null; }
    if (a === 0x2002) {
      this.cmd2002 = v;
      if (v & 1) this.trip('EF');
      if (v & 2) this.resetFault();
      return null;
    }
    const p = paramByAddr(a);
    if (!p) return 2;
    const err = this.setParam(p.id, v / 10 ** p.dec);
    return err ? 3 : null;
  }

  /** Handle a Modbus request addressed to this drive. Returns {data} | {exception} | null (no reply). */
  modbus(req) {
    if (!this.powered || this.bootT > 0.6) return null;
    const station = this.P('09-00');
    if (req.station !== station && req.station !== 0) return null;
    this.lastComm = this.time;
    if (this.warning === 'CE10') this.warning = null;
    let res;
    if (req.fc === 3) {
      const data = [];
      for (let i = 0; i < req.count; i++) { const v = this.readReg(req.addr + i); if (v === null) { res = { exception: 2 }; break; } data.push(v); }
      res = res || { data };
    } else if (req.fc === 6) {
      const e = this.writeReg(req.addr, req.values[0]);
      res = e ? { exception: e } : { ok: true };
    } else if (req.fc === 16) {
      let e = null;
      req.values.forEach((v, i) => { if (!e) e = this.writeReg(req.addr + i, v); });
      res = e ? { exception: e } : { ok: true };
    } else res = { exception: 1 };
    return req.station === 0 ? null : res;
  }

  // ------------------------------------------------------------------ keypad
  /**
   * A key on the digital keypad. Every key does something on every page; when a key cannot act
   * (e.g. RUN while the run command comes from the terminals) the answer is a short hint for the
   * UI, otherwise null.
   */
  key(k) {
    if (!this.powered) return 'The drive has no power — check R/L1 and S/L2';
    if (this.bootT > 0) return null;
    const kp = this.kp;
    const groups = PARAM_GROUPS;
    const inGroup = () => VFD_PARAMS.filter((p) => p.id.startsWith(groups[kp.group] + '-'));
    const runSrc = this.P('00-21'), fSrc = this.P('00-20');
    const srcText = (id) => `${PARAM_BY_ID[id].opts[this.P(id)]} (Pr.${id} = ${this.P(id)})`;
    const flash = (t, s = 0.7) => { kp.flash = t; kp.flashT = s; };
    switch (k) {
      case 'RUN':
        if (this.fault) return `Fault ${this.fault} — press STOP/RESET first`;
        if (runSrc !== 0) return `RUN key is not the run command now: it comes from ${srcText('00-21')}. Set Pr.00-21 = 0 to run from the keypad.`;
        this.keyRun = true;
        return null;
      case 'STOP':
        if (this.fault) {
          const was = this.fault;
          this.resetFault();
          if (this.fault) return `${was} cannot be reset while the EF input is still ON`;
          flash('rSt', 0.5);
          return null;
        }
        if (runSrc === 0) { this.keyRun = false; return null; }
        if (this.P('00-32') !== 1) return 'STOP key is disabled (Pr.00-32 = 0)';
        if (this.runCmd || this.f !== 0) {
          this.keyStop = true;
          return `Stopped from the keypad — switch the ${runSrc === 1 ? 'MI terminal' : 'RS-485'} run command OFF and ON again to restart`;
        }
        return null;
      case 'MODE': {
        const order = ['F', 'H', 'A', 'U', 'dir', 'PrG'];
        if (kp.mode === 'edit') kp.mode = 'param';
        else if (kp.mode === 'param') kp.mode = 'PrG';
        else kp.mode = order[(order.indexOf(kp.mode) + 1) % order.length];
        kp.pos = kp.mode === 'F' ? 2 : 0;
        return null;
      }
      case 'ENTER':
        if (kp.mode === 'PrG') { kp.mode = 'param'; kp.pidx = 0; }
        else if (kp.mode === 'param') { const p = inGroup()[kp.pidx]; kp.mode = 'edit'; kp.edit = this.params[p.id]; kp.pos = 0; }
        else if (kp.mode === 'edit') {
          const p = inGroup()[kp.pidx];
          const err = this.setParam(p.id, kp.edit);
          flash(err ? 'Err' : 'End', 0.8);
          kp.mode = 'param';
          return err;
        } else if (kp.mode === 'F') {
          const why = this.freqKeyBlocked();
          if (why) return why;
          flash('End', 0.6); // frequency command stored
        } else if (kp.mode === 'dir') return this.toggleKeyDir();
        else { kp.mode = 'PrG'; } // H / A / U page: ENTER opens the parameter setup
        return null;
      case 'UP': case 'DOWN': {
        const s = k === 'UP' ? 1 : -1;
        if (kp.mode === 'F' || kp.mode === 'H' || kp.mode === 'A') {
          if (kp.mode !== 'F') { kp.mode = 'F'; kp.pos = 2; }
          const why = this.freqKeyBlocked();
          if (why) return why;
          const was = this.fKey;
          this.fKey = Math.max(0, Math.min(this.P('01-00'), Math.round((this.fKey + s * 10 ** (kp.pos - 2)) * 100) / 100));
          if (this.fKey === was) return s > 0 ? `Already at the maximum frequency (Pr.01-00 = ${this.P('01-00')} Hz)` : 'Already at 0 Hz';
        } else if (kp.mode === 'U') {
          // ▲▼ on the U page pick what it shows (Pr.00-04)
          const keys = Object.keys(PARAM_BY_ID['00-04'].opts).map(Number);
          const i = keys.indexOf(this.P('00-04'));
          this.params['00-04'] = keys[(Math.max(0, i) + s + keys.length) % keys.length];
          flash(['A', '', 'H', 'u', 'E', 'P', 'r'][this.params['00-04']] + '-', 0.45);
        } else if (kp.mode === 'dir') return this.toggleKeyDir();
        else if (kp.mode === 'PrG') kp.group = (kp.group + s + groups.length) % groups.length;
        else if (kp.mode === 'param') { const n = inGroup().length; kp.pidx = (kp.pidx + s + n) % n; }
        else if (kp.mode === 'edit') {
          const p = inGroup()[kp.pidx];
          if (p.ro) return `Pr.${p.id} is read-only`;
          if (p.opts) {
            const keys = Object.keys(p.opts).map(Number).sort((a, b) => a - b);
            const i = keys.indexOf(kp.edit);
            kp.edit = keys[(Math.max(0, i) + s + keys.length) % keys.length];
          } else {
            const step = 10 ** (kp.pos - p.dec);
            kp.edit = Math.round((kp.edit + s * step) * 10 ** p.dec) / 10 ** p.dec;
            if (p.min !== undefined) kp.edit = Math.max(p.min, Math.min(p.max, kp.edit));
          }
        }
        return null;
      }
      case 'LEFT':
        // ◀: next digit while a number is edited; otherwise one level back (escape)
        if (kp.mode === 'F' || (kp.mode === 'edit' && !inGroup()[kp.pidx].opts)) kp.pos = (kp.pos + 1) % 4;
        else if (kp.mode === 'edit') kp.mode = 'param';
        else if (kp.mode === 'param') kp.mode = 'PrG';
        else { kp.mode = 'F'; kp.pos = 2; }
        return null;
      default: return null;
    }
  }

  /** Why ▲▼ cannot change the keypad frequency now (null = they can). */
  freqKeyBlocked() {
    if (this.step) return `Multi-step speed ${this.step} is selected by the MI inputs — it uses Pr.04-0${this.step - 1}`;
    const fSrc = this.P('00-20');
    if (fSrc !== 0) return `The frequency command comes from ${PARAM_BY_ID['00-20'].opts[fSrc]} (Pr.00-20 = ${fSrc}). Set Pr.00-20 = 0 to set it with ▲ ▼.`;
    return null;
  }

  /** Direction page: ▲ ▼ / ENTER switch the keypad run direction (Frd ↔ rEv). */
  toggleKeyDir() {
    if (this.P('00-21') !== 0) return `The direction comes from ${PARAM_BY_ID['00-21'].opts[this.P('00-21')]} (Pr.00-21 = ${this.P('00-21')})`;
    const next = -this.keyDir;
    const lock = this.P('00-23');
    if ((lock === 1 && next < 0) || (lock === 2 && next > 0)) return `${next < 0 ? 'Reverse' : 'Forward'} is disabled (Pr.00-23 = ${lock})`;
    this.keyDir = next;
    return null;
  }

  /** What the 5-digit LED display shows: {text, leds:{RUN,STOP,FWD,REV,F,H,A,U}, blink}. */
  display(t = this.time) {
    const kp = this.kp;
    const leds = { RUN: false, STOP: false, FWD: false, REV: false, F: false, H: false, A: false, U: false };
    if (!this.powered) return { text: '', leds, off: true };
    const blink = Math.floor(t * 2.5) % 2 === 0;
    leds.RUN = this.runCmd || (this.f !== 0 && blink);
    leds.STOP = !this.runCmd;
    leds.FWD = this.dir > 0;
    leds.REV = this.dir < 0;
    if (this.bootT > 0) return { text: 'dELtA', leds };
    if (kp.flash) return { text: kp.flash, leds };
    if (this.fault) return { text: blink ? this.fault : '', leds, fault: true };
    if (this.warning && blink) return { text: this.warning, leds, warn: true };
    const groups = PARAM_GROUPS;
    const fmt = (v, dec) => v.toFixed(dec);
    switch (kp.mode) {
      case 'F': leds.F = true; return { text: fmt(this.fcmd, 2), leds, cursor: kp.pos };
      case 'H': leds.H = true; return { text: fmt(Math.abs(this.f), 2), leds };
      case 'A': leds.A = true; return { text: fmt(this.I, 2), leds };
      case 'U': {
        leds.U = true;
        const sel = this.P('00-04');
        if (sel === 0) return { text: fmt(this.I, 2) + 'A', leds };
        if (sel === 2) return { text: fmt(Math.abs(this.f), 2), leds };
        if (sel === 3) return { text: 'u' + fmt(this.dc, 0), leds };
        if (sel === 4) return { text: 'E' + fmt(this.V, 0), leds };
        if (sel === 5) return { text: 'P' + fmt(this.V * this.I * 1.732 * 0.8 / 1000, 2), leds };
        return { text: 'r' + fmt(Math.abs(this.rpm), 0), leds };
      }
      case 'dir': return { text: this.keyDir < 0 ? 'rEv' : 'Frd', leds };
      case 'PrG': return { text: groups[kp.group] + '-', leds };
      case 'param': { const p = VFD_PARAMS.filter((x) => x.id.startsWith(groups[kp.group] + '-'))[kp.pidx]; return { text: p.id, leds }; }
      case 'edit': {
        const p = VFD_PARAMS.filter((x) => x.id.startsWith(groups[kp.group] + '-'))[kp.pidx];
        return { text: fmt(kp.edit, p.dec), leds, cursor: kp.pos, editing: true };
      }
      default: return { text: '', leds };
    }
  }

  snapshotParams() { return { ...this.params }; }
}
