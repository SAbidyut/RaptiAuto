// Delta DVP PLC CPU: device memory, scan cycle, ladder execution, timers, counters,
// special relays/registers and the MODRW Modbus master hooks.
import { timerInfo, isLatched, fmtAddr } from './address.js';

const i16 = (v) => (v << 16) >> 16;
const SCAN_MS = 5;

export class PlcCpu {
  constructor(model = { name: 'DVP16ES200R', inputs: 8, outputs: 8, ai: 0, ao: 0 }) {
    this.model = model;
    this.X = new Uint8Array(256);
    this.Y = new Uint8Array(256);
    this.M = new Uint8Array(4096);
    this.S = new Uint8Array(1024);
    this.T = new Uint8Array(256);
    this.TV = new Int16Array(256);
    this.tacc = new Float64Array(256);
    this.C = new Uint8Array(256);
    this.CV = new Int16Array(256);
    this.D = new Int16Array(10000);
    this.Xphys = new Uint8Array(256);
    this.ai = [0, 0, 0, 0];
    this.forceX = new Map();
    this.forceY = new Map();
    this.prog = null;
    this.st = new Uint8Array(0);
    this.powered = false;
    this.running = false;
    this.switchRun = true;
    this.first = false;
    this.clock = 0;
    this.scans = 0;
    this.scanTime = 0;
    this.errorFlag = false;
    this.mbReq = new Map();
    this.mbSeen = new Set();
    this.mbCompletePending = false;
    this.dt = SCAN_MS;
    this.acc = 0;
    this.setDefaults();
  }

  setDefaults() {
    this.D[1121] = 1;
    this.D[1120] = 0x86;
    this.D[1129] = 300;
  }

  // ------------------------------------------------------------------ memory access
  getBit(op) {
    switch (op.dev) {
      case 'X': return this.X[op.idx];
      case 'Y': return this.Y[op.idx];
      case 'M': return this.M[op.idx];
      case 'S': return this.S[op.idx];
      case 'T': return this.T[op.idx];
      case 'C': return this.C[op.idx];
      default: return 0;
    }
  }

  setBit(op, v) {
    v = v ? 1 : 0;
    switch (op.dev) {
      case 'Y': this.Y[op.idx] = v; break;
      case 'M': this.M[op.idx] = v; break;
      case 'S': this.S[op.idx] = v; break;
      case 'X': this.X[op.idx] = v; break;
      default: break;
    }
  }

  getWord(op) {
    switch (op.dev) {
      case 'K': case 'H': return op.val;
      case 'D': return this.D[op.idx];
      case 'T': return this.TV[op.idx];
      case 'C': return this.CV[op.idx];
      default: return 0;
    }
  }

  setWord(op, v) {
    v = i16(v);
    switch (op.dev) {
      case 'D': this.D[op.idx] = v; break;
      case 'T': this.TV[op.idx] = v; this.tacc[op.idx] = v * timerInfo(op.idx).base; break;
      case 'C': this.CV[op.idx] = v; break;
      default: break;
    }
  }

  reset(dev, idx) {
    switch (dev) {
      case 'Y': this.Y[idx] = 0; break;
      case 'M': this.M[idx] = 0; break;
      case 'S': this.S[idx] = 0; break;
      case 'T': this.T[idx] = 0; this.TV[idx] = 0; this.tacc[idx] = 0; break;
      case 'C': this.C[idx] = 0; this.CV[idx] = 0; break;
      case 'D': this.D[idx] = 0; break;
      default: break;
    }
  }

  /** Read any device by text form (for monitors / HMI): bits → 0/1, words → number. */
  read(dev, idx) {
    switch (dev) {
      case 'X': return this.X[idx];
      case 'Y': return this.Y[idx];
      case 'M': return this.M[idx];
      case 'S': return this.S[idx];
      case 'T': return this.T[idx];
      case 'C': return this.C[idx];
      case 'TV': return this.TV[idx];
      case 'CV': return this.CV[idx];
      case 'D': return this.D[idx];
      default: return 0;
    }
  }

  /** External write (HMI, online monitor). */
  write(dev, idx, v) {
    if (dev === 'X') { this.X[idx] = v ? 1 : 0; return; }
    if (dev === 'TV') { this.setWord({ dev: 'T', idx }, v); return; }
    if (dev === 'CV') { this.setWord({ dev: 'C', idx }, v); return; }
    if (dev === 'D') { this.D[idx] = i16(v); return; }
    if (dev === 'T') { this.T[idx] = v ? 1 : 0; return; }
    if (dev === 'C') { this.C[idx] = v ? 1 : 0; return; }
    this.setBit({ dev, idx }, v);
  }

  setForce(dev, idx, v) {
    const map = dev === 'X' ? this.forceX : dev === 'Y' ? this.forceY : null;
    if (!map) return;
    if (v === null || v === undefined) map.delete(idx); else map.set(idx, v ? 1 : 0);
  }

  // ------------------------------------------------------------------ program / mode
  load(compiled) {
    this.prog = compiled;
    this.st = new Uint8Array(compiled ? compiled.stateCount : 0);
    this.mbReq.clear();
  }

  get mode() { return !this.powered ? 'OFF' : this.running ? 'RUN' : 'STOP'; }

  /** Physical RUN/STOP switch. */
  setSwitch(run) {
    this.switchRun = !!run;
    this.setRun(!!run);
  }

  /** RUN/STOP request (switch or ISPSoft). */
  setRun(run) {
    if (!this.powered) return;
    if (run && !this.prog) run = false;
    if (run && !this.running) this.enterRun();
    else if (!run && this.running) this.enterStop();
  }

  enterRun() {
    this.clearNonLatched();
    this.st.fill(0);
    this.running = true;
    this.first = true;
    this.errorFlag = false;
    this.M[1067] = 0;
    this.scanMax = 0;
    this.scanMin = 0;
  }

  enterStop() {
    this.running = false;
    this.Y.fill(0);
    this.mbReq.clear();
    this.M[1000] = 0;
  }

  clearNonLatched() {
    const clr = (arr, dev, lim) => { for (let i = 0; i < lim; i++) if (!isLatched(dev, i)) arr[i] = 0; };
    clr(this.M, 'M', 1000);
    for (let i = 2000; i < 4096; i++) if (!isLatched('M', i)) this.M[i] = 0;
    clr(this.S, 'S', 1024);
    for (let i = 0; i < 256; i++) if (!isLatched('T', i)) { this.T[i] = 0; this.TV[i] = 0; this.tacc[i] = 0; }
    for (let i = 0; i < 256; i++) if (!isLatched('C', i)) { this.C[i] = 0; this.CV[i] = 0; }
    for (let i = 0; i < 1000; i++) if (!isLatched('D', i)) this.D[i] = 0;
    this.D.fill(0, 2000);
    this.Y.fill(0);
  }

  powerOn(retained) {
    if (this.powered) return;
    this.powered = true;
    this.X.fill(0); this.Y.fill(0); this.M.fill(0); this.S.fill(0); this.T.fill(0); this.TV.fill(0); this.tacc.fill(0);
    this.C.fill(0); this.CV.fill(0); this.D.fill(0);
    this.setDefaults();
    if (retained) this.restoreLatched(retained);
    this.running = false;
    if (this.switchRun && this.prog) this.enterRun();
  }

  powerOff() {
    if (!this.powered) return;
    this.powered = false;
    this.running = false;
    this.Y.fill(0);
    this.mbReq.clear();
  }

  latchedSnapshot() {
    const snap = { M: {}, D: {}, C: {}, S: {}, T: {} };
    for (let i = 240; i <= 255; i++) if (this.TV[i] || this.T[i]) snap.T[i] = [this.TV[i], this.tacc[i], this.T[i]];
    for (let i = 500; i <= 999; i++) if (this.M[i]) snap.M[i] = 1;
    for (let i = 200; i <= 999; i++) if (this.D[i]) snap.D[i] = this.D[i];
    for (let i = 100; i <= 199; i++) if (this.CV[i] || this.C[i]) snap.C[i] = [this.CV[i], this.C[i]];
    for (let i = 500; i <= 899; i++) if (this.S[i]) snap.S[i] = 1;
    return snap;
  }

  restoreLatched(snap) {
    for (const [k, v] of Object.entries(snap.M || {})) this.M[+k] = v ? 1 : 0;
    for (const [k, v] of Object.entries(snap.D || {})) this.D[+k] = v;
    for (const [k, v] of Object.entries(snap.C || {})) { this.CV[+k] = v[0]; this.C[+k] = v[1]; }
    for (const [k, v] of Object.entries(snap.S || {})) this.S[+k] = v ? 1 : 0;
    for (const [k, v] of Object.entries(snap.T || {})) { this.TV[+k] = v[0]; this.tacc[+k] = v[1]; this.T[+k] = v[2]; }
  }

  // ------------------------------------------------------------------ scan
  /** Advance time; runs one scan per SCAN_MS of simulated time. */
  step(dtMs) {
    if (!this.powered) return 0;
    this.acc += dtMs;
    let n = 0;
    while (this.acc >= SCAN_MS) { this.acc -= SCAN_MS; this.scan(SCAN_MS); n++; }
    return n;
  }

  scan(dt) {
    this.dt = dt;
    this.clock += dt;
    // input refresh
    for (let i = 0; i < 256; i++) this.X[i] = this.Xphys[i];
    for (const [i, v] of this.forceX) this.X[i] = v;
    for (let ch = 0; ch < (this.model.ai || 0); ch++) this.D[1110 + ch] = i16(this.ai[ch] | 0);
    if (!this.running || !this.prog) return;
    // special relays
    const M = this.M, c = this.clock;
    M[1000] = 1; M[1001] = 0; M[1002] = this.first ? 1 : 0; M[1003] = this.first ? 0 : 1;
    M[1011] = c % 10 < 5 ? 1 : 0; M[1012] = c % 100 < 50 ? 1 : 0; M[1013] = c % 1000 < 500 ? 1 : 0; M[1014] = c % 60000 < 30000 ? 1 : 0;
    M[1127] = this.mbCompletePending ? 1 : 0;
    this.mbCompletePending = false;
    this.mbSeen.clear();
    for (const r of this.prog.rungs) this.execRung(r);
    for (const sid of [...this.mbReq.keys()]) if (!this.mbSeen.has(sid)) this.mbReq.delete(sid);
    for (const [i, v] of this.forceY) this.Y[i] = v;
    this.first = false;
    this.scans++;
    // reported scan time (0.1 ms units) — derived from program size
    const t = 2 + Math.round(this.prog.steps * 0.006) + (this.scans % 7 === 0 ? 1 : 0);
    this.D[1010] = t;
    this.D[1011] = this.scanMin ? Math.min(this.scanMin, t) : t; this.scanMin = this.D[1011];
    this.D[1012] = Math.max(this.scanMax || 0, t); this.scanMax = this.D[1012];
  }

  execRung(r) {
    const P = this.pw && this.pw.length >= r.rows ? this.pw : (this.pw = new Uint8Array(Math.max(8, r.rows)));
    for (let i = 0; i < r.rows; i++) P[i] = 1;
    const live = r.live || (r.live = { cells: r.cells.map((row) => new Uint8Array(row.length)), rows: new Uint8Array(r.rows) });
    for (let c = 0; c < r.cols; c++) {
      for (let i = 0; i < r.rows; i++) {
        const e = r.cells[i][c];
        const v = e ? this.contact(e, P[i]) : 0;
        live.cells[i][c] = e ? (P[i] ? 1 : 0) | (v ? 2 : 0) : 0;
        P[i] = v;
      }
      const groups = r.merges[c];
      for (let g = 0; g < groups.length; g++) {
        const rows = groups[g];
        let v = 0;
        for (let k = 0; k < rows.length; k++) v |= P[rows[k]];
        for (let k = 0; k < rows.length; k++) P[rows[k]] = v;
      }
    }
    for (let i = 0; i < r.rows; i++) {
      live.rows[i] = P[i];
      const o = r.outs[i];
      if (o) this.output(o, P[i]);
    }
  }

  contact(e, pw) {
    const st = this.st;
    switch (e.t) {
      case 'H': return pw;
      case 'NO': return pw && this.getBit(e.a[0]) ? 1 : 0;
      case 'NC': return pw && !this.getBit(e.a[0]) ? 1 : 0;
      case 'P': { const v = this.getBit(e.a[0]); const r = v && !st[e.sid]; st[e.sid] = v; return pw && r ? 1 : 0; }
      case 'F': { const v = this.getBit(e.a[0]); const r = !v && st[e.sid]; st[e.sid] = v; return pw && r ? 1 : 0; }
      case 'CC': return pw && compare(this.getWord(e.a[0]), this.getWord(e.a[1]), e.op) ? 1 : 0;
      case 'INV': return pw ? 0 : 1;
      default: return 0;
    }
  }

  output(e, pw) {
    const st = this.st;
    const a = e.a;
    switch (e.t) {
      case 'OUT': this.setBit(a[0], pw); return;
      case 'SET': if (pw) this.setBit(a[0], 1); return;
      case 'RST': if (pw) this.reset(a[0].dev, a[0].idx); return;
      case 'PLS': this.setBit(a[0], pw && !st[e.sid]); st[e.sid] = pw; return;
      case 'PLF': this.setBit(a[0], !pw && st[e.sid]); st[e.sid] = pw; return;
      case 'TMR': this.timer(a[0].idx, this.getWord(a[1]), pw); return;
      case 'CNT': {
        const n = a[0].idx, K = this.getWord(a[1]);
        if (pw && !st[e.sid] && this.CV[n] < K) this.CV[n]++;
        st[e.sid] = pw;
        this.C[n] = this.CV[n] >= K ? 1 : 0;
        return;
      }
      case 'MODRW':
        this.mbSeen.add(e.sid);
        if (pw) {
          if (!this.mbReq.has(e.sid)) this.mbReq.set(e.sid, { sid: e.sid });
          const q = this.mbReq.get(e.sid);
          q.station = this.getWord(a[0]); q.fc = this.getWord(a[1]); q.addr = this.getWord(a[2]) & 0xFFFF; q.dreg = a[3].idx; q.n = Math.max(1, Math.min(16, this.getWord(a[4])));
        } else this.mbReq.delete(e.sid);
        return;
      default: break;
    }
    if (e.p) { const go = pw && !st[e.sid]; st[e.sid] = pw; if (!go) return; } else if (!pw) return;
    this.apply(e);
  }

  timer(n, K, pw) {
    const { base, acc } = timerInfo(n);
    if (pw) {
      if (Math.floor(this.tacc[n] / base) !== this.TV[n]) this.tacc[n] = this.TV[n] * base;
      if (this.TV[n] < K) {
        this.tacc[n] += this.dt;
        let v = Math.floor(this.tacc[n] / base);
        if (v >= K) { v = K; this.tacc[n] = K * base; }
        this.TV[n] = i16(v);
      }
      this.T[n] = this.TV[n] >= K ? 1 : 0;
    } else if (!acc) {
      this.tacc[n] = 0; this.TV[n] = 0; this.T[n] = 0;
    }
  }

  apply(e) {
    const a = e.a, M = this.M;
    switch (e.t) {
      case 'MOV': this.setWord(a[1], this.getWord(a[0])); break;
      case 'ADD': case 'SUB': {
        const r = e.t === 'ADD' ? this.getWord(a[0]) + this.getWord(a[1]) : this.getWord(a[0]) - this.getWord(a[1]);
        M[1020] = i16(r) === 0 ? 1 : 0;
        M[1022] = r > 32767 || r < -32768 ? 1 : 0;
        this.setWord(a[2], r);
        break;
      }
      case 'MUL': {
        const r = this.getWord(a[0]) * this.getWord(a[1]);
        const i = a[2].idx;
        this.D[i] = i16(r & 0xFFFF);
        if (i + 1 < this.D.length) this.D[i + 1] = i16(Math.floor(r / 65536) & 0xFFFF);
        break;
      }
      case 'DIV': {
        const x = this.getWord(a[0]), y = this.getWord(a[1]);
        if (y === 0) { M[1067] = 1; this.errorFlag = true; break; }
        const i = a[2].idx;
        this.D[i] = i16(Math.trunc(x / y));
        if (i + 1 < this.D.length) this.D[i + 1] = i16(x % y);
        break;
      }
      case 'INC': this.setWord(a[0], this.getWord(a[0]) + 1); break;
      case 'DEC': this.setWord(a[0], this.getWord(a[0]) - 1); break;
      case 'CMP': {
        const x = this.getWord(a[0]), y = this.getWord(a[1]);
        const d = a[2];
        this.setBit({ dev: d.dev, idx: d.idx }, x > y);
        this.setBit({ dev: d.dev, idx: d.idx + 1 }, x === y);
        this.setBit({ dev: d.dev, idx: d.idx + 2 }, x < y);
        break;
      }
      case 'ZRST': for (let i = a[0].idx; i <= a[1].idx; i++) this.reset(a[0].dev, i); break;
      case 'ALT': this.setBit(a[0], !this.getBit(a[0])); break;
      default: break;
    }
  }

  // ------------------------------------------------------------------ Modbus master hooks (COM2)
  /** Next active MODRW request after `lastSid` (round robin), or null. */
  nextModbusRequest(lastSid = -1) {
    if (!this.running || !this.mbReq.size) return null;
    const list = [...this.mbReq.values()].sort((a, b) => a.sid - b.sid);
    return { ...(list.find((q) => q.sid > lastSid) || list[0]) };
  }

  /** Result of a COM2 transaction: {ok, data?, timeout?, exception?}. */
  modbusDone(req, res) {
    if (!this.powered) return;
    if (res.ok) {
      if (req.fc === 3 && res.data) for (let i = 0; i < res.data.length; i++) this.D[req.dreg + i] = i16(res.data[i]);
      this.M[1129] = 0; this.M[1140] = 0; this.D[1130] = 0;
    } else if (res.timeout) {
      this.M[1129] = 1;
    } else {
      this.M[1140] = 1; this.D[1130] = res.exception || 0;
    }
    this.mbCompletePending = true;
  }

  /** COM2 protocol from D1120 / M1143. */
  com2Format() {
    const v = this.D[1120] & 0xFFFF || 0x86;
    const bauds = { 1: 110, 2: 150, 3: 300, 4: 600, 5: 1200, 6: 2400, 7: 4800, 8: 9600, 9: 19200, 10: 38400, 11: 57600, 12: 115200 };
    return { baud: bauds[(v >> 4) & 15] || 9600, bits: v & 1 ? 8 : 7, parity: ['N', 'O', 'N', 'E'][(v >> 1) & 3], stop: v & 8 ? 2 : 1, mode: this.M[1143] ? 'RTU' : 'ASCII' };
  }

  /** Live power-flow snapshot of a rung (for the ladder monitor). */
  rungLive(i) {
    const r = this.prog && this.prog.rungs.find((x) => x.index === i);
    return r && r.live ? r.live : null;
  }

  describe(dev, idx) { return fmtAddr(dev, idx); }
}

export function compare(a, b, op) {
  switch (op) {
    case '=': return a === b;
    case '<>': return a !== b;
    case '>': return a > b;
    case '>=': return a >= b;
    case '<': return a < b;
    case '<=': return a <= b;
    default: return false;
  }
}

export const PLC_SCAN_MS = SCAN_MS;
