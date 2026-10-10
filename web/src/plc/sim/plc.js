// Delta DVP PLC CPU: device memory, scan cycle, ladder execution, timers, counters,
// special relays/registers and the MODRW Modbus master hooks.
import { timerInfo, isLatched, fmtAddr } from './address.js';

const i16 = (v) => (v << 16) >> 16;
const SCAN_MS = 5;
// IEEE 754 single precision in two 16-bit registers (low word first, like the DVP)
const fbuf = new ArrayBuffer(4);
const f32 = new Float32Array(fbuf);
const i32b = new Int32Array(fbuf);
export const floatToBits = (v) => { f32[0] = v; return i32b[0]; };
export const bitsToFloat = (b) => { i32b[0] = b | 0; return f32[0]; };
const SEG7 = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F, 0x77, 0x7C, 0x39, 0x5E, 0x79, 0x71];

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
    this.CV = new Int32Array(256); // C200 … C255 are 32-bit (DCNT)
    this.D = new Int16Array(10000);
    this.E = new Int16Array(8); // index registers E0–E7 (low word) …
    this.F = new Int16Array(8); // … and F0–F7 (high word in 32-bit instructions)
    this.ist = new Map(); // per-instruction state of timing / pulse / drum instructions
    this.rtcOffset = 0; // TWR: the PLC clock minus the phone clock (ms)
    this.chan = [{ pos: 0 }, { pos: 0 }]; // pulse output channels CH0 (Y0/Y1) and CH1 (Y2/Y3)
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
    // program flow: master control levels switched off (bit n = N n), CALL return stack, step ladder
    this.mcOff = 0;
    this.callStack = [];
    this.flow = null;
    this.curStep = -1;
    this.stlWas = new Uint8Array(1024);
    this.stlMode = new Uint8Array(1024);
    this.setDefaults();
  }

  setDefaults() {
    this.D[1121] = 1;
    this.D[1120] = 0x86;
    this.D[1129] = 300;
  }

  // ------------------------------------------------------------------ memory access
  /** An operand with its index register (D10E0, K4M0F1, K5E2) applied. */
  R(op) {
    if (!op.ix) return op;
    const add = op.ix.dev === 'E' ? this.E[op.ix.idx] : this.F[op.ix.idx];
    if (op.dev === 'K' || op.dev === 'H') return { dev: op.dev, val: op.val + add };
    return { ...op, idx: op.idx + add, ix: null };
  }

  getBit(op) {
    if (op.ix) op = this.R(op);
    switch (op.dev) {
      case 'X': return this.X[op.idx] || 0;
      case 'Y': return this.Y[op.idx] || 0;
      case 'M': return this.M[op.idx] || 0;
      case 'S': return this.S[op.idx] || 0;
      case 'T': return this.T[op.idx] || 0;
      case 'C': return this.C[op.idx] || 0;
      default: return 0;
    }
  }

  setBit(op, v) {
    if (op.ix) op = this.R(op);
    v = v ? 1 : 0;
    const i = op.idx;
    switch (op.dev) {
      case 'Y': if (i < 256) this.Y[i] = v; break;
      case 'M': if (i < 4096) this.M[i] = v; break;
      case 'S': if (i < 1024) this.S[i] = v; break;
      case 'X': if (i < 256) this.X[i] = v; break;
      case 'T': if (i < 256) this.T[i] = v; break;
      case 'C': if (i < 256) this.C[i] = v; break;
      default: break;
    }
  }

  /** KnX / KnY / KnM / KnS: bits (4 × n, at most `bits`) as an unsigned number. */
  knRead(op, bits) {
    const nb = Math.min(op.n * 4, bits);
    let v = 0;
    for (let k = nb - 1; k >= 0; k--) v = v * 2 + this.getBit({ dev: op.bdev, idx: op.idx + k });
    return v;
  }

  knWrite(op, v, bits) {
    const nb = Math.min(op.n * 4, bits);
    for (let k = 0; k < nb; k++) this.setBit({ dev: op.bdev, idx: op.idx + k }, Math.floor(v / 2 ** k) % 2 !== 0 ? 1 : 0);
  }

  getWord(op) {
    if (op.ix) op = this.R(op);
    switch (op.dev) {
      case 'K': case 'H': return op.val;
      case 'FL': return Math.trunc(op.val);
      case 'D': return this.D[op.idx] || 0;
      case 'T': return this.TV[op.idx] || 0;
      case 'C': return this.CV[op.idx] || 0;
      case 'E': return this.E[op.idx];
      case 'F': return this.F[op.idx];
      case 'KX': case 'KY': case 'KM': case 'KS': { const v = this.knRead(op, 16); return op.n >= 4 ? i16(v) : v; }
      default: return 0;
    }
  }

  setWord(op, v) {
    if (op.ix) op = this.R(op);
    const v32 = v;
    v = i16(v);
    switch (op.dev) {
      case 'D': if (op.idx < 10000) this.D[op.idx] = v; break;
      case 'T': if (op.idx < 256) { this.TV[op.idx] = v; this.tacc[op.idx] = v * timerInfo(op.idx).base; } break;
      case 'C': if (op.idx < 256) this.CV[op.idx] = op.idx >= 200 ? v32 | 0 : v; break;
      case 'E': this.E[op.idx] = v; break;
      case 'F': this.F[op.idx] = v; break;
      case 'KY': case 'KM': case 'KS': this.knWrite(op, v & 0xFFFF, 16); break;
      default: break;
    }
  }

  /** 32-bit value: D(n+1):D(n), C200–C255, F(n):E(n), K1–K8 digits, constants. */
  getDWord(op) {
    if (op.ix) op = this.R(op);
    switch (op.dev) {
      case 'K': case 'H': return op.val | 0;
      case 'FL': return Math.trunc(op.val) | 0;
      case 'D': return op.idx < 9999 ? ((this.D[op.idx + 1] << 16) | (this.D[op.idx] & 0xFFFF)) : (this.D[op.idx] || 0);
      case 'C': return this.CV[op.idx] || 0;
      case 'T': return this.TV[op.idx] || 0;
      case 'E': return (this.F[op.idx] << 16) | (this.E[op.idx] & 0xFFFF);
      case 'F': return this.F[op.idx];
      case 'KX': case 'KY': case 'KM': case 'KS': { const v = this.knRead(op, 32); return op.n >= 8 ? v | 0 : v; }
      default: return 0;
    }
  }

  setDWord(op, v) {
    if (op.ix) op = this.R(op);
    v |= 0;
    switch (op.dev) {
      case 'D': if (op.idx < 9999) { this.D[op.idx] = i16(v & 0xFFFF); this.D[op.idx + 1] = i16(v >>> 16); } break;
      case 'C': if (op.idx < 256) this.CV[op.idx] = v; break;
      case 'T': this.setWord(op, v); break;
      case 'E': this.E[op.idx] = i16(v & 0xFFFF); this.F[op.idx] = i16(v >>> 16); break;
      case 'F': this.F[op.idx] = i16(v); break;
      case 'KY': case 'KM': case 'KS': this.knWrite(op, v >>> 0, 32); break;
      default: break;
    }
  }

  /** Floating-point value: F constants, K / H converted, or two registers. */
  getFloat(op) {
    if (op.ix) op = this.R(op);
    switch (op.dev) {
      case 'FL': case 'K': case 'H': return op.val;
      case 'D': case 'E': return bitsToFloat(this.getDWord(op));
      default: return this.getWord(op);
    }
  }

  setFloat(op, v) {
    const M = this.M;
    if (Number.isNaN(v)) { M[1067] = 1; this.errorFlag = true; return false; }
    if (!Number.isFinite(v) || Math.abs(v) > 3.4028234e38) { M[1022] = 1; v = v > 0 ? 3.4028234e38 : -3.4028234e38; }
    else if (v !== 0 && Math.abs(v) < 1.17549435e-38) { M[1021] = 1; v = 0; }
    M[1020] = v === 0 ? 1 : 0;
    this.setDWord(op, floatToBits(v));
    return true;
  }

  reset(dev, idx) {
    switch (dev) {
      case 'Y': this.Y[idx] = 0; break;
      case 'M': this.M[idx] = 0; break;
      case 'S': this.S[idx] = 0; break;
      case 'T': this.T[idx] = 0; this.TV[idx] = 0; this.tacc[idx] = 0; break;
      case 'C': this.C[idx] = 0; this.CV[idx] = 0; break;
      case 'D': this.D[idx] = 0; break;
      case 'E': this.E[idx] = 0; break;
      case 'F': this.F[idx] = 0; break;
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
    this.ist.clear();
    this.E.fill(0); this.F.fill(0);
    this.chan = [{ pos: 0 }, { pos: 0 }];
    this.stlWas.fill(0);
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
    if (this.scans % 20 === 0 || this.first) this.rtcToRegs();
    this.mbCompletePending = false;
    this.mbSeen.clear();
    this.runProgram();
    if (this.annUsed) this.annunciators();
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

  /**
   * One pass over the networks. Normally top to bottom up to FEND / END; CJ jumps, CALL runs a
   * subroutine (after FEND) up to its SRET, MC switches the power of the networks up to MCR off,
   * and STL steps run only while their step relay is ON (once more with no power when they end, so
   * their coils and timers drop out).
   */
  runProgram() {
    const R = this.prog.rungs;
    const labels = this.prog.labels || {};
    this.mcOff = 0;
    this.callStack.length = 0;
    const loops = []; // FOR … NEXT: {start, left}
    let pc = 0, guard = 0;
    while (pc < R.length) {
      if (++guard > 20000) { this.errorFlag = true; this.M[1067] = 1; break; } // endless jump loop: watchdog
      const r = R[pc];
      let rail = this.mcOff ? 0 : 1;
      this.curStep = -1;
      if (r.step >= 0) {
        const n = r.step;
        if (r.stlHead) { const act = this.S[n]; this.stlMode[n] = act ? 1 : this.stlWas[n] ? 2 : 0; this.stlWas[n] = act; }
        const mode = this.stlMode[n];
        if (mode === 0) { if (r.live) { for (const c of r.live.cells) c.fill(0); r.live.rows.fill(0); } pc++; continue; }
        if (mode === 2 || !this.S[n]) rail = 0;
        this.curStep = n;
      }
      this.flow = null;
      this.execRung(r, rail);
      const f = this.flow;
      if (!f) { pc++; continue; }
      if (f.forN !== undefined) {
        loops.push({ start: pc + 1, left: Math.max(1, f.forN) - 1 });
        pc++;
        continue;
      }
      if (f.next) {
        const L = loops[loops.length - 1];
        if (L && L.left > 0) { L.left--; pc = L.start; } else { loops.pop(); pc++; }
        continue;
      }
      if (f.fend || f.sret) {
        if (this.callStack.length) { pc = this.callStack.pop(); continue; }
        if (f.fend) break; // end of the main program
        pc++;
        continue;
      }
      const target = labels[f.call !== undefined ? f.call : f.jump];
      if (target === undefined) { pc++; continue; }
      if (f.call !== undefined) {
        if (this.callStack.length >= 16) { this.errorFlag = true; this.M[1067] = 1; pc++; continue; }
        this.callStack.push(pc + 1);
      }
      pc = target;
    }
  }

  execRung(r, rail = 1) {
    const P = this.pw && this.pw.length >= r.rows ? this.pw : (this.pw = new Uint8Array(Math.max(8, r.rows)));
    for (let i = 0; i < r.rows; i++) P[i] = rail;
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
      case 'CC': return pw && (e.d ? compare(this.getDWord(e.a[0]), this.getDWord(e.a[1]), e.op) : compare(this.getWord(e.a[0]), this.getWord(e.a[1]), e.op)) ? 1 : 0;
      case 'FCC': return pw && compare(this.getFloat(e.a[0]), this.getFloat(e.a[1]), e.op) ? 1 : 0;
      case 'BLD': case 'BLDI': {
        const w = e.d ? this.getDWord(e.a[0]) : this.getWord(e.a[0]);
        const b = (w >>> (this.getWord(e.a[1]) & (e.d ? 31 : 15))) & 1;
        return pw && (e.t === 'BLD' ? b : !b) ? 1 : 0;
      }
      case 'INV': return pw ? 0 : 1;
      case 'MEP': case 'NP': { const r = pw && !st[e.sid]; st[e.sid] = pw; return r ? 1 : 0; }
      case 'MEF': case 'PN': { const r = !pw && st[e.sid]; st[e.sid] = pw; return r ? 1 : 0; }
      case 'STL': return pw && this.S[e.a[0].idx] ? 1 : 0;
      default: return 0;
    }
  }

  /** State object of one instruction (timing, pulse output, drums …). */
  state(e, init) {
    let o = this.ist.get(e.sid);
    if (!o) { o = init ? init() : {}; this.ist.set(e.sid, o); }
    return o;
  }

  output(e, pw) {
    const st = this.st;
    const a = e.a;
    switch (e.t) {
      case 'OUT':
        // OUT S inside a step: move to that step (like SET)
        if (a[0].dev === 'S' && this.curStep >= 0) { if (pw) this.toStep(a[0].idx); return; }
        this.setBit(a[0], pw);
        return;
      case 'SET':
        if (!pw) return;
        if (a[0].dev === 'S' && this.curStep >= 0) this.toStep(a[0].idx); else this.setBit(a[0], 1);
        return;
      case 'MC': if (pw) this.mcOff &= ~(1 << a[0].idx); else this.mcOff |= 1 << a[0].idx; return;
      case 'MCR': this.mcOff &= (1 << a[0].idx) - 1; return; // levels N and deeper are on again
      case 'FEND': case 'END': this.flow = { fend: true }; return;
      case 'SRET': case 'IRET': this.flow = { sret: true }; return;
      case 'RET': case 'EI': case 'DI': case 'NOP': return; // the end of the step ladder is known from the program layout
      case 'RST': if (pw) { const o = this.R(a[0]); this.reset(o.dev, o.idx); } return;
      case 'PLS': this.setBit(a[0], pw && !st[e.sid]); st[e.sid] = pw; return;
      case 'PLF': this.setBit(a[0], !pw && st[e.sid]); st[e.sid] = pw; return;
      case 'TMR': case 'TON': this.timer(a[0].idx, this.getWord(a[1]), pw); return;
      case 'TOF': {
        // off-delay: ON at once, OFF the set time after the input drops
        const n = a[0].idx, K = this.getWord(a[1]), { base } = timerInfo(n);
        if (pw) { this.T[n] = 1; this.TV[n] = 0; this.tacc[n] = 0; }
        else if (this.T[n]) {
          this.tacc[n] += this.dt;
          const v = Math.min(K, Math.floor(this.tacc[n] / base));
          this.TV[n] = i16(v);
          if (v >= K) this.T[n] = 0;
        }
        return;
      }
      case 'DCNT': {
        // C200–C234 count the rung's rising edges, C235–C242 the pulses on X0–X7 while the rung is ON;
        // M1200+n ON counts down
        const n = a[0].idx, K = this.getDWord(a[1]);
        const src = n >= 235 ? this.X[n - 235] : pw;
        const edge = src && !st[e.sid];
        st[e.sid] = src;
        if (pw && edge) this.CV[n] = (this.CV[n] + (this.M[1000 + n] ? -1 : 1)) | 0;
        this.C[n] = this.CV[n] >= K ? 1 : 0;
        return;
      }
      case 'FOR': this.flow = { forN: this.getWord(a[0]) }; return; // FOR / NEXT have no input condition
      case 'NEXT': this.flow = { next: true }; return;
      case 'CNT': {
        const n = a[0].idx, K = this.getWord(a[1]);
        if (pw && !st[e.sid] && this.CV[n] < K) this.CV[n]++;
        st[e.sid] = pw;
        this.C[n] = this.CV[n] >= K ? 1 : 0;
        return;
      }
      case 'MODRW': case 'MODRD': case 'MODWR': case 'FWD': case 'REV': case 'STOP': case 'RDST': case 'RSTEF':
        // COM2 Modbus master: the request is sent (round robin) while the rung is ON
        this.mbSeen.add(e.sid);
        if (pw) this.mbReq.set(e.sid, { sid: e.sid, ...this.commRequest(e) });
        else this.mbReq.delete(e.sid);
        return;
      case 'BOUT': { const n = this.getWord(a[1]); this.bitOfWord(e, a[0], n, pw); return; }
      // instructions that also act while their rung is OFF (timers, pulse outputs, meters)
      case 'ANS': case 'TTMR': case 'STMR': case 'HOUR': case 'SPD': case 'PWD': case 'PLSY': case 'PWM': case 'GPWM': case 'PLSR':
      case 'DRVI': case 'DRVA': case 'PLSV': case 'ZRN': case 'RAMP': case 'TKY': case 'INCD':
        this.timed(e, pw);
        return;
      default: break;
    }
    if (e.p) { const go = pw && !st[e.sid]; st[e.sid] = pw; if (!go) return; } else if (!pw) return;
    this.apply(e);
  }

  /** Bit n of a word (BOUT / BSET / BRST). */
  bitOfWord(e, op, n, v) {
    if (e.d) { const w = this.getDWord(op), m = 1 << (n & 31); this.setDWord(op, v ? w | m : w & ~m); }
    else { const w = this.getWord(op), m = 1 << (n & 15); this.setWord(op, v ? w | m : w & ~m); }
  }

  // ------------------------------------------------------------------ time-based instructions
  timed(e, pw) {
    const a = e.a, M = this.M, dt = this.dt, now = this.clock;
    const W = e.d ? (o) => this.getDWord(o) : (o) => this.getWord(o);
    const s = this.state(e, () => ({ was: 0, t: 0 }));
    const rise = pw && !s.was, fall = !pw && s.was;
    s.was = pw;
    switch (e.t) {
      case 'ANS': {
        // input ON for m × 100 ms → the annunciator S is set (and stays set until ANR / RST)
        const n = a[0].idx, m = this.getWord(a[1]);
        this.annUsed = true;
        if (pw) { this.tacc[n] += dt; this.TV[n] = i16(Math.min(m, Math.floor(this.tacc[n] / 100))); if (this.TV[n] >= m) { this.T[n] = 1; this.S[a[2].idx] = 1; } }
        else { this.tacc[n] = 0; this.TV[n] = 0; this.T[n] = 0; }
        return;
      }
      case 'TTMR': {
        // teach timer: D+1 = seconds the input has been ON, D = D+1 × 10ⁿ
        const d = a[0].idx, n = Math.max(0, Math.min(2, this.getWord(a[1])));
        if (rise) { s.t = 0; this.D[d + 1] = 0; }
        if (pw) { s.t += dt; this.D[d + 1] = i16(Math.floor(s.t / 1000)); this.D[d] = i16(this.D[d + 1] * 10 ** n); }
        return;
      }
      case 'STMR': {
        const n = a[0].idx, m = this.getWord(a[1]) * 100, d = a[2];
        if (rise) { s.on = 0; s.off = -1; }
        if (fall) s.off = 0;
        if (pw) s.on = (s.on || 0) + dt; else if (s.off >= 0) s.off += dt;
        const offRun = !pw && s.off >= 0 && s.off < m;
        this.TV[n] = i16(Math.floor((pw ? s.on : Math.max(0, s.off)) / 100));
        this.setBitAt(d.dev, d.idx, pw || offRun); // off-delay
        this.setBitAt(d.dev, d.idx + 1, offRun); // one-shot after OFF
        this.setBitAt(d.dev, d.idx + 2, pw && s.on < m); // one-shot after ON
        this.setBitAt(d.dev, d.idx + 3, (pw && s.on >= m) || offRun); // on-delay + off-delay
        return;
      }
      case 'HOUR': {
        const lim = W(a[0]), d = a[1];
        if (pw) {
          s.ms = (s.ms || 0) + dt;
          if (s.ms >= 1000) {
            s.ms -= 1000;
            const si = e.d ? 2 : 1;
            let sec = (this.D[d.idx + si] || 0) + 1;
            let hours = e.d ? this.getDWord(d) : this.D[d.idx];
            if (sec >= 3600) { sec = 0; hours++; }
            this.D[d.idx + si] = i16(sec);
            if (e.d) this.setDWord(d, hours); else this.D[d.idx] = i16(hours);
          }
        }
        const hours = e.d ? this.getDWord(d) : this.D[d.idx];
        this.setBit(a[2], hours >= lim && lim > 0);
        return;
      }
      case 'SPD': {
        // pulses on S1 counted for S2 ms: D = result, D+1 = counting, D+2 = ms left
        const x = a[0].idx, win = Math.max(1, this.getWord(a[1])), d = a[2].idx;
        if (!pw) { s.cnt = 0; s.left = win; s.lv = this.X[x]; return; }
        if (rise || s.left === undefined) { s.cnt = 0; s.left = win; s.lv = this.X[x]; }
        const lv = this.X[x];
        if (lv && !s.lv) s.cnt++;
        s.lv = lv;
        s.left -= dt;
        if (s.left <= 0) { this.D[d] = i16(s.cnt); s.cnt = 0; s.left += win; }
        this.D[d + 1] = i16(s.cnt);
        this.D[d + 2] = i16(Math.max(0, Math.round(s.left)));
        return;
      }
      case 'PWD': {
        const x = a[0].idx, lv = this.X[x];
        if (!pw) { s.lv = lv; s.t0 = null; return; }
        if (lv && !s.lv) s.t0 = now;
        if (!lv && s.lv && s.t0 != null) this.setDWord(a[1], Math.round(now - s.t0));
        s.lv = lv;
        return;
      }
      case 'PWM': case 'GPWM': {
        const w = Math.max(0, this.getWord(a[0])), per = Math.max(1, this.getWord(a[1]));
        if (!pw) { if (s.on) { this.setBit(a[2], 0); s.on = 0; } return; }
        if (rise) s.t0 = now;
        s.on = 1;
        this.setBit(a[2], (now - s.t0) % per < Math.min(w, per));
        return;
      }
      case 'PLSY': case 'PLSR': {
        const y = a[e.t === 'PLSY' ? 2 : 3].idx;
        const done = y === 1 ? 1030 : 1029;
        const cntReg = y === 1 ? 1336 : 1030;
        if (!pw) { if (s.run) { this.Y[y] = 0; s.run = 0; } return; }
        const fmax = Math.max(0, W(a[0])), total = Math.max(0, W(a[1]));
        if (rise) { s.count = 0; s.el = 0; s.run = 1; M[done] = 0; }
        if (!s.run) return;
        let f = fmax;
        s.el += dt;
        if (e.t === 'PLSR') {
          const ramp = Math.max(1, this.getWord(a[2]));
          f = fmax * Math.min(1, Math.max(0.05, s.el / ramp));
          if (total) { const left = total - s.count, dec = fmax * ramp / 2000; if (left < dec) f = Math.max(fmax * 0.05, fmax * left / Math.max(1, dec)); }
        }
        s.count += f * dt / 1000;
        if (total && s.count >= total) { s.count = total; s.run = 0; M[done] = 1; this.Y[y] = 0; }
        else this.Y[y] = Math.floor(now * Math.min(f, 25) / 500) % 2 ? 1 : 0;
        const c = Math.floor(s.count);
        this.D[cntReg] = i16(c & 0xFFFF); this.D[cntReg + 1] = i16(c >>> 16);
        return;
      }
      case 'DRVI': case 'DRVA': case 'PLSV': case 'ZRN': {
        const isPlsv = e.t === 'PLSV';
        const yp = a[isPlsv ? 1 : e.t === 'ZRN' ? 3 : 2], ydir = isPlsv ? a[2] : e.t === 'ZRN' ? null : a[3];
        const chn = yp.idx >= 2 ? 1 : 0, ch = this.chan[chn];
        const doneFlag = chn ? 1102 : 1029, posReg = chn ? 1350 : 1348;
        const writePos = () => { const p = Math.round(ch.pos) | 0; this.D[posReg] = i16(p & 0xFFFF); this.D[posReg + 1] = i16(p >>> 16); };
        if (!pw) { if (s.run) { this.setBit(yp, 0); s.run = 0; } return; }
        if (rise) {
          s.run = 1; M[doneFlag] = 0;
          if (e.t === 'DRVI') s.target = ch.pos + W(a[0]);
          if (e.t === 'DRVA') s.target = W(a[0]);
        }
        if (!s.run) return;
        let v; // pulses per second, signed
        if (isPlsv) v = W(a[0]);
        else if (e.t === 'ZRN') v = -Math.abs(W(a[0]));
        else { const dist = s.target - ch.pos; v = Math.sign(dist) * Math.abs(W(a[1])); if (Math.abs(dist) <= Math.abs(v) * dt / 1000 || !v) { ch.pos = s.target; v = 0; } }
        if (e.t === 'ZRN' && this.getBit(a[2])) { ch.pos = 0; v = 0; }
        ch.pos += v * dt / 1000;
        writePos();
        if (ydir) this.setBit(ydir, v < 0);
        if (!v && !isPlsv) { s.run = 0; M[doneFlag] = 1; this.setBit(yp, 0); return; }
        this.setBit(yp, v ? Math.floor(now * Math.min(Math.abs(v), 25) / 500) % 2 : 0);
        return;
      }
      case 'RAMP': {
        // D goes from S1 to S2 in n scans; D+1 = scans done; M1029 when the end is reached
        const d = a[2], n = Math.max(1, this.getWord(a[3]));
        const cnt = e.d ? { dev: 'D', idx: d.idx + 2 } : { dev: 'D', idx: d.idx + 1 };
        if (!pw) return;
        if (rise) { this.D[cnt.idx] = 0; M[1029] = 0; }
        let k = this.D[cnt.idx];
        if (k >= n) { if (!M[1026]) { k = 0; M[1029] = 0; } else return; }
        k++;
        const s1 = W(a[0]), s2 = W(a[1]);
        const v = Math.round(s1 + (s2 - s1) * k / n);
        if (e.d) this.setDWord(d, v); else this.setWord(d, v);
        this.D[cnt.idx] = i16(k);
        if (k >= n) M[1029] = 1;
        return;
      }
      case 'TKY': {
        const src = a[0], d2 = a[2];
        if (!pw) { if (s.on) { for (let k = 0; k <= 10; k++) this.setBitAt(d2.dev, d2.idx + k, 0); s.on = 0; } return; }
        s.on = 1;
        s.prev = s.prev || new Uint8Array(10);
        let any = 0;
        for (let k = 0; k < 10; k++) {
          const b = this.getBitAt(src.dev, src.idx + k);
          this.setBitAt(d2.dev, d2.idx + k, b);
          if (b) any = 1;
          if (b && !s.prev[k]) {
            if (e.d) this.setDWord(a[1], (this.getDWord(a[1]) * 10 + k) % 100000000);
            else this.setWord(a[1], (this.getWord(a[1]) * 10 + k) % 10000);
          }
          s.prev[k] = b;
        }
        this.setBitAt(d2.dev, d2.idx + 10, any);
        return;
      }
      case 'INCD': {
        // C S2 counts (driven elsewhere); when it reaches table value S1+k the step k advances
        const tbl = a[0], c = a[1].idx, d = a[2], n = Math.max(1, this.getWord(a[3]));
        if (!pw) return;
        let k = this.CV[c + 1] || 0;
        if (k >= n) k = 0;
        if (this.CV[c] >= this.getWord(offset(tbl, k))) {
          this.CV[c] = 0; k++;
          if (k >= n) { k = 0; M[1029] = 1; }
        }
        this.CV[c + 1] = k;
        for (let i = 0; i < n; i++) this.setBitAt(d.dev, d.idx + i, i === k);
        return;
      }
      default: return;
    }
  }

  /** M1048 (any annunciator ON) and D1049 (lowest one) for ANS / ANR. */
  annunciators() {
    let low = 0;
    for (let i = 900; i < 1024; i++) if (this.S[i]) { low = i; break; }
    this.M[1048] = low ? 1 : 0;
    this.D[1049] = low;
  }

  /** The PLC real-time clock → D1313 … D1319 (second, minute, hour, day, month, weekday, year). */
  rtcNow() { return new Date(Date.now() + this.rtcOffset); }
  rtcToRegs() {
    const t = this.rtcNow();
    const D = this.D;
    D[1313] = t.getSeconds(); D[1314] = t.getMinutes(); D[1315] = t.getHours(); D[1316] = t.getDate();
    D[1317] = t.getMonth() + 1; D[1318] = t.getDay() || 7; D[1319] = t.getFullYear() % 100;
  }

  /** Modbus frame of a COM2 instruction: {station, fc, addr, n, dreg?, values?}. */
  commRequest(e) {
    const a = e.a, W = (i) => this.getWord(a[i]);
    switch (e.t) {
      case 'MODRW': return { station: W(0), fc: W(1), addr: W(2) & 0xFFFF, dreg: a[3].idx, n: Math.max(1, Math.min(16, W(4))) };
      case 'MODRD': return { station: W(0), fc: 3, addr: W(1) & 0xFFFF, dreg: 1050, n: Math.max(1, Math.min(7, W(2))) };
      case 'MODWR': return { station: W(0), fc: 6, addr: W(1) & 0xFFFF, n: 1, values: [W(2)] };
      // Delta drives: 2000H command word (H12 run FWD, H22 run REV, H01 stop), 2001H frequency
      case 'FWD': case 'REV': return { station: W(1), fc: 16, addr: 0x2000, n: 2, values: [e.t === 'FWD' ? 0x12 : 0x22, W(0)] };
      case 'STOP': return { station: W(0), fc: 6, addr: 0x2000, n: 1, values: [0x01] };
      case 'RDST': return { station: W(0), fc: 3, addr: 0x2100, dreg: 1050, n: 7 };
      case 'RSTEF': return { station: W(0), fc: 6, addr: 0x2002, n: 1, values: [0x02] };
      default: return {};
    }
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
    const a = e.a, M = this.M, d32 = !!e.d;
    const R = d32 ? (o) => this.getDWord(o) : (o) => this.getWord(o);
    const W = d32 ? (o, v) => this.setDWord(o, v) : (o, v) => this.setWord(o, v);
    const BITS = d32 ? 32 : 16, MAXV = d32 ? 2147483647 : 32767, MINV = d32 ? -2147483648 : -32768;
    const MASK = d32 ? 0xFFFFFFFF : 0xFFFF;
    const u = (v) => (d32 ? v >>> 0 : v & 0xFFFF); // unsigned view
    const at = (o, k) => (d32 ? step32(o, k) : offset(o, k)); // k-th element of a block
    const Fl = (o) => this.getFloat(o), WF = (o, v) => this.setFloat(o, v);
    const err = () => { M[1067] = 1; this.errorFlag = true; };
    const flags = (r) => { M[1020] = r === 0 ? 1 : 0; M[1022] = r > MAXV ? 1 : 0; M[1021] = r < MINV ? 1 : 0; };
    const rad = (x) => (M[1018] ? x * Math.PI / 180 : x);
    switch (e.t) {
      case 'MOV': W(a[1], R(a[0])); break;
      case 'ADD': case 'SUB': {
        const r = e.t === 'ADD' ? R(a[0]) + R(a[1]) : R(a[0]) - R(a[1]);
        flags(r);
        W(a[2], r);
        break;
      }
      case 'MUL': {
        const x = R(a[0]), y = R(a[1]);
        if (!d32) { this.setDWord(a[2], x * y); break; }
        // DMUL: 64-bit result in D+3 … D
        const r = BigInt(x) * BigInt(y);
        for (let k = 0; k < 4; k++) this.setWord(offset(a[2], k), Number(BigInt.asIntN(16, r >> BigInt(16 * k))));
        break;
      }
      case 'DIV': {
        const x = R(a[0]), y = R(a[1]);
        if (y === 0) { err(); break; }
        W(a[2], Math.trunc(x / y));
        W(at(a[2], 1), x % y);
        break;
      }
      case 'INC': W(a[0], R(a[0]) + 1); break;
      case 'DEC': W(a[0], R(a[0]) - 1); break;
      case 'CMP': {
        const x = R(a[0]), y = R(a[1]), d = this.R(a[2]);
        this.setBitAt(d.dev, d.idx, x > y);
        this.setBitAt(d.dev, d.idx + 1, x === y);
        this.setBitAt(d.dev, d.idx + 2, x < y);
        break;
      }
      case 'ZRST': for (let i = a[0].idx; i <= a[1].idx; i++) this.reset(a[0].dev, i); break;
      case 'ALT': this.setBit(a[0], !this.getBit(a[0])); break;
      case 'CJ': this.flow = { jump: a[0].idx }; break;
      case 'CALL': this.flow = { call: a[0].idx }; break;
      case 'ZCP': {
        const lo = R(a[0]), hi = R(a[1]), v = R(a[2]), d = this.R(a[3]);
        this.setBitAt(d.dev, d.idx, v < lo);
        this.setBitAt(d.dev, d.idx + 1, v >= lo && v <= hi);
        this.setBitAt(d.dev, d.idx + 2, v > hi);
        break;
      }
      case 'CML': W(a[1], ~R(a[0])); break;
      case 'BMOV': {
        const n = this.getWord(a[2]);
        const vals = [];
        for (let k = 0; k < n; k++) vals.push(this.getWord(offset(a[0], k)));
        for (let k = 0; k < n; k++) this.setWord(offset(a[1], k), vals[k]);
        break;
      }
      case 'FMOV': { const n = this.getWord(a[2]), v = R(a[0]); for (let k = 0; k < n; k++) W(at(a[1], k), v); break; }
      case 'XCH': { const x = R(a[0]); W(a[0], R(a[1])); W(a[1], x); break; }
      case 'BCD': {
        const v = R(a[0]), lim = d32 ? 99999999 : 9999;
        if (v < 0 || v > lim) { err(); break; }
        let r = 0;
        for (let k = 0, x = v; k < (d32 ? 8 : 4); k++, x = Math.floor(x / 10)) r += (x % 10) * 16 ** k;
        W(a[1], r);
        break;
      }
      case 'BIN': {
        const v = u(R(a[0]));
        let r = 0, bad = false;
        for (let k = (d32 ? 7 : 3); k >= 0; k--) { const dg = Math.floor(v / 16 ** k) % 16; if (dg > 9) bad = true; r = r * 10 + dg; }
        if (bad) { err(); break; }
        W(a[1], r);
        break;
      }
      case 'SWAP': {
        if (d32) { const v = this.getDWord(a[0]) >>> 0; const lo = v & 0xFFFF, hi = v >>> 16; const sw = (w) => ((w & 0xFF) << 8) | (w >> 8); this.setDWord(a[0], (sw(hi) << 16) | sw(lo)); }
        else { const v = this.getWord(a[0]) & 0xFFFF; this.setWord(a[0], ((v & 0xFF) << 8) | (v >> 8)); }
        break;
      }
      case 'WAND': W(a[2], R(a[0]) & R(a[1])); break;
      case 'WOR': W(a[2], R(a[0]) | R(a[1])); break;
      case 'WXOR': W(a[2], R(a[0]) ^ R(a[1])); break;
      case 'NEG': W(a[0], -R(a[0])); break;
      case 'ABS': W(a[0], Math.abs(R(a[0]))); break;
      case 'SQR': {
        const v = R(a[0]);
        if (v < 0) { err(); break; }
        const r = Math.floor(Math.sqrt(v));
        M[1020] = r === 0 ? 1 : 0;
        W(a[1], r);
        break;
      }
      case 'MEAN': {
        const n = this.getWord(a[2]);
        let sum = 0;
        for (let k = 0; k < n; k++) sum += R(at(a[0], k));
        W(a[1], Math.trunc(sum / Math.max(1, n)));
        break;
      }
      case 'SCAL': this.setWord(a[3], Math.trunc((this.getWord(a[0]) * this.getWord(a[1])) / 1000) + this.getWord(a[2])); break;
      case 'ROR': case 'ROL': {
        const n = this.getWord(a[1]) % BITS;
        let v = u(R(a[0]));
        if (n) {
          if (d32) v = e.t === 'ROR' ? ((v >>> n) | (v << (32 - n))) >>> 0 : ((v << n) | (v >>> (32 - n))) >>> 0;
          else v = e.t === 'ROR' ? ((v >>> n) | (v << (16 - n))) & 0xFFFF : ((v << n) | (v >>> (16 - n))) & 0xFFFF;
          M[1022] = e.t === 'ROR' ? (v >>> (BITS - 1)) & 1 : v & 1;
        }
        W(a[0], v);
        break;
      }
      case 'RCR': case 'RCL': {
        // (16 or 32)+1-bit rotation: the carry M1022 is the extra bit
        const n = this.getWord(a[1]) % (BITS + 1);
        let v = u(R(a[0])), c = M[1022] ? 1 : 0;
        for (let k = 0; k < n; k++) {
          if (e.t === 'RCR') { const out = v & 1; v = (v >>> 1) | (c ? 2 ** (BITS - 1) : 0); c = out; }
          else { const out = Math.floor(v / 2 ** (BITS - 1)) & 1; v = ((v * 2) % 2 ** BITS) + c; c = out; }
        }
        M[1022] = c;
        W(a[0], v);
        break;
      }
      case 'WSFR': case 'WSFL': {
        const n1 = this.getWord(a[2]), n2 = this.getWord(a[3]);
        const ws = [];
        for (let k = 0; k < n1; k++) ws.push(this.getWord(offset(a[1], k)));
        const src = [];
        for (let k = 0; k < n2; k++) src.push(this.getWord(offset(a[0], k)));
        const out = e.t === 'WSFR' ? [...ws.slice(n2), ...src] : [...src, ...ws.slice(0, n1 - n2)];
        out.forEach((w, k) => this.setWord(offset(a[1], k), w));
        break;
      }
      case 'SFWR': {
        // D = pointer, D+1 … D+n−1 = queue; full → carry M1022
        const d = this.R(a[1]).idx, n = this.getWord(a[2]), p = this.D[d];
        if (p >= n - 1) { M[1022] = 1; break; }
        this.D[d] = p + 1;
        this.D[d + p + 1] = i16(this.getWord(a[0]));
        M[1022] = p + 1 >= n - 1 ? 1 : 0;
        break;
      }
      case 'SFRD': {
        // S = pointer, S+1 … = queue: the oldest word goes to D, the rest move up; empty → zero flag M1020
        const s = this.R(a[0]).idx, n = this.getWord(a[2]), p = this.D[s];
        if (p <= 0) { M[1020] = 1; break; }
        this.setWord(a[1], this.D[s + 1]);
        for (let k = 1; k < n - 1; k++) this.D[s + k] = this.D[s + k + 1];
        this.D[s] = p - 1;
        M[1020] = p - 1 <= 0 ? 1 : 0;
        break;
      }
      case 'WDT': case 'DELAY': case 'REF': break;
      case 'REFF': this.D[1020] = i16(this.getWord(a[0])); break;
      case 'SFTR': case 'SFTL': {
        const s = this.R(a[0]), d = this.R(a[1]), n1 = this.getWord(a[2]), n2 = this.getWord(a[3]);
        const bits = [];
        for (let k = 0; k < n1; k++) bits.push(this.getBitAt(d.dev, d.idx + k));
        const src = [];
        for (let k = 0; k < n2; k++) src.push(this.getBitAt(s.dev, s.idx + k));
        const out = e.t === 'SFTR' ? [...bits.slice(n2), ...src] : [...src, ...bits.slice(0, n1 - n2)];
        out.forEach((b, k) => this.setBitAt(d.dev, d.idx + k, b));
        break;
      }
      case 'DECO': {
        const n = this.getWord(a[2]), v = this.getWord(a[0]) & ((1 << n) - 1), d = this.R(a[1]);
        if (d.dev === 'D') { let w = this.D[d.idx] & ~((1 << (1 << n)) - 1); w |= 1 << v; this.D[d.idx] = i16(w); }
        else for (let k = 0; k < (1 << n); k++) this.setBitAt(d.dev, d.idx + k, k === v);
        break;
      }
      case 'ENCO': {
        const n = this.getWord(a[2]), s = this.R(a[0]);
        const word = ['D', 'T', 'C'].includes(s.dev);
        const w = word ? this.getWord(s) & 0xFFFF : 0;
        let hi = -1;
        for (let k = (1 << n) - 1; k >= 0; k--) if (word ? (w >> k) & 1 : this.getBitAt(s.dev, s.idx + k)) { hi = k; break; }
        if (hi < 0) { err(); break; }
        this.setWord(a[1], hi);
        break;
      }
      case 'SUM': {
        let v = u(R(a[0])), c = 0;
        while (v) { c += v & 1; v >>>= 1; }
        M[1020] = c === 0 ? 1 : 0;
        W(a[1], c);
        break;
      }
      case 'BON': this.setBit(a[1], (u(R(a[0])) >>> (this.getWord(a[2]) % BITS)) & 1); break;
      // ---------------------------------------------------------------- bit of a word
      case 'BSET': this.bitOfWord(e, a[0], this.getWord(a[1]), 1); break;
      case 'BRST': this.bitOfWord(e, a[0], this.getWord(a[1]), 0); break;
      // ---------------------------------------------------------------- move & conversion
      case 'SMOV': {
        // decimal digits (4 = thousands … 1 = units)
        const sv = Math.abs(this.getWord(a[0])) % 10000, m1 = this.getWord(a[1]), m2 = this.getWord(a[2]), n = this.getWord(a[4]);
        const dg = (v, k) => Math.floor(v / 10 ** (k - 1)) % 10;
        let dv = Math.abs(this.getWord(a[3])) % 10000;
        for (let k = 0; k < m2; k++) {
          const from = m1 - k, to = n - k;
          if (from < 1 || to < 1) break;
          dv += (dg(sv, from) - dg(dv, to)) * 10 ** (to - 1);
        }
        this.setWord(a[3], dv);
        break;
      }
      case 'MMOV': this.setDWord(a[1], this.getWord(a[0])); break;
      case 'RMOV': { const v = this.getDWord(a[0]); if (v > 32767 || v < -32768) M[1022] = 1; this.setWord(a[1], Math.max(-32768, Math.min(32767, v))); break; }
      case 'GRY': { const v = u(R(a[0])); W(a[1], v ^ (v >>> 1)); break; }
      case 'GBIN': { let v = u(R(a[0])); for (let sh = v >>> 1; sh; sh >>>= 1) v ^= sh; W(a[1], v); break; }
      case 'SEGD': this.setWord(a[1], SEG7[this.getWord(a[0]) & 15]); break;
      case 'PRUN': {
        // octal-numbered bits ↔ decimal-numbered bits: K4X0 → K4M0 copies X0–X7 → M0–M7, X10–X17 → M8–M15 …
        const s = this.R(a[0]), d = this.R(a[1]);
        if (!s.n || !d.n) { W(a[1], R(a[0])); break; }
        const nb = Math.min(s.n, d.n) * 4;
        for (let k = 0; k < nb; k++) this.setBitAt(d.bdev, d.idx + k, this.getBitAt(s.bdev, s.idx + k));
        break;
      }
      case 'ASCI': {
        // hex digits (most significant first) → ASCII; 16-bit mode packs two characters a word
        const n = this.getWord(a[2]), d = this.R(a[1]).idx;
        const chars = [];
        for (let k = 0; k < n; k++) {
          const w = this.getWord(offset(a[0], Math.floor(k / 4))) & 0xFFFF;
          chars.push('0123456789ABCDEF'.charCodeAt((w >> (12 - (k % 4) * 4)) & 15));
        }
        this.writeBytes(d, chars);
        break;
      }
      case 'HEX': {
        const n = this.getWord(a[2]), bytes = this.readBytes(this.R(a[0]).idx, n), d = this.R(a[1]);
        const words = new Array(Math.ceil(n / 4)).fill(0);
        for (let k = 0; k < n; k++) {
          const v = parseInt(String.fromCharCode(bytes[k]), 16);
          if (Number.isNaN(v)) { err(); return; }
          words[Math.floor(k / 4)] |= v << (12 - (k % 4) * 4);
        }
        words.forEach((w, k) => this.setWord(offset(d, k), w));
        break;
      }
      case 'FLT': WF(a[1], R(a[0])); break;
      case 'INT': { const v = Math.trunc(Fl(a[0])); if (v > MAXV || v < MINV) M[1022] = 1; W(a[1], Math.max(MINV, Math.min(MAXV, v))); break; }
      // ---------------------------------------------------------------- arithmetic
      case 'WSUM': { const n = this.getWord(a[2]); let sum = 0; for (let k = 0; k < n; k++) sum += this.getWord(offset(a[0], k)); this.setDWord(a[1], sum); break; }
      case 'RAND': { const x = R(a[0]), y = R(a[1]); const lo = Math.min(x, y), hi = Math.max(x, y); W(a[2], lo + Math.floor(Math.random() * (hi - lo + 1))); break; }
      case 'SCLP': {
        const v = R(a[0]), p = a[1];
        const smax = R(at(p, 0)), smin = R(at(p, 1)), dmax = R(at(p, 2)), dmin = R(at(p, 3));
        if (smax === smin) { err(); break; }
        W(a[2], Math.round((Math.max(Math.min(smax, smin), Math.min(Math.max(smax, smin), v)) - smin) * (dmax - dmin) / (smax - smin) + dmin));
        break;
      }
      // ---------------------------------------------------------------- floating point
      case 'DECMP': case 'DEZCP': {
        const d = this.R(a[e.t === 'DECMP' ? 2 : 3]);
        if (e.t === 'DECMP') { const x = Fl(a[0]), y = Fl(a[1]); this.setBitAt(d.dev, d.idx, x > y); this.setBitAt(d.dev, d.idx + 1, x === y); this.setBitAt(d.dev, d.idx + 2, x < y); }
        else { const lo = Fl(a[0]), hi = Fl(a[1]), v = Fl(a[2]); this.setBitAt(d.dev, d.idx, v < lo); this.setBitAt(d.dev, d.idx + 1, v >= lo && v <= hi); this.setBitAt(d.dev, d.idx + 2, v > hi); }
        break;
      }
      case 'DMOVR': WF(a[1], Fl(a[0])); break;
      case 'DRAD': WF(a[1], Fl(a[0]) * Math.PI / 180); break;
      case 'DDEG': WF(a[1], Fl(a[0]) * 180 / Math.PI); break;
      case 'DEBCD': {
        const v = Fl(a[0]);
        if (v === 0) { this.setWord(a[1], 0); this.setWord(offset(a[1], 1), 0); break; }
        let ex = Math.floor(Math.log10(Math.abs(v))) - 3;
        let man = Math.round(v / 10 ** ex);
        if (Math.abs(man) >= 10000) { man = Math.round(man / 10); ex++; }
        this.setWord(a[1], man); this.setWord(offset(a[1], 1), ex);
        break;
      }
      case 'DEBIN': WF(a[1], this.getWord(a[0]) * 10 ** this.getWord(offset(a[0], 1))); break;
      case 'DEADD': case 'DADDR': WF(a[2], Fl(a[0]) + Fl(a[1])); break;
      case 'DESUB': case 'DSUBR': WF(a[2], Fl(a[0]) - Fl(a[1])); break;
      case 'DEMUL': case 'DMULR': WF(a[2], Fl(a[0]) * Fl(a[1])); break;
      case 'DEDIV': case 'DDIVR': { const y = Fl(a[1]); if (y === 0) { err(); break; } WF(a[2], Fl(a[0]) / y); break; }
      case 'DEXP': WF(a[1], Math.exp(Fl(a[0]))); break;
      case 'DLN': { const x = Fl(a[0]); if (x <= 0) { err(); break; } WF(a[1], Math.log(x)); break; }
      case 'DLOG': { const b = Fl(a[0]), x = Fl(a[1]); if (b <= 0 || b === 1 || x <= 0) { err(); break; } WF(a[2], Math.log(x) / Math.log(b)); break; }
      case 'DESQR': { const x = Fl(a[0]); if (x < 0) { err(); break; } WF(a[1], Math.sqrt(x)); break; }
      case 'DPOW': WF(a[2], Fl(a[0]) ** Fl(a[1])); break;
      case 'DSIN': WF(a[1], Math.sin(rad(Fl(a[0])))); break;
      case 'DCOS': WF(a[1], Math.cos(rad(Fl(a[0])))); break;
      case 'DTAN': WF(a[1], Math.tan(rad(Fl(a[0])))); break;
      case 'DASIN': { const x = Fl(a[0]); if (Math.abs(x) > 1) { err(); break; } WF(a[1], Math.asin(x)); break; }
      case 'DACOS': { const x = Fl(a[0]); if (Math.abs(x) > 1) { err(); break; } WF(a[1], Math.acos(x)); break; }
      case 'DATAN': WF(a[1], Math.atan(Fl(a[0]))); break;
      case 'DSINH': WF(a[1], Math.sinh(Fl(a[0]))); break;
      case 'DCOSH': WF(a[1], Math.cosh(Fl(a[0]))); break;
      case 'DTANH': WF(a[1], Math.tanh(Fl(a[0]))); break;
      // ---------------------------------------------------------------- handy
      case 'ANR': {
        for (let i = 900; i < 1024; i++) if (this.S[i]) { this.S[i] = 0; break; }
        this.annunciators();
        break;
      }
      case 'SER': {
        // D: number of matches, first, last, index of the minimum, index of the maximum
        const n = this.getWord(a[3]), v = R(a[1]);
        let cnt = 0, first = 0, last = 0, mn = 0, mx = 0, vmin = Infinity, vmax = -Infinity;
        for (let k = 0; k < n; k++) {
          const x = R(at(a[0], k));
          if (x === v) { if (!cnt) first = k; last = k; cnt++; }
          if (x < vmin) { vmin = x; mn = k; }
          if (x >= vmax) { vmax = x; mx = k; }
        }
        [cnt, first, last, mn, mx].forEach((x, k) => W(at(a[2], k), x));
        M[1020] = cnt ? 0 : 1;
        break;
      }
      case 'ABSD': {
        const n = this.getWord(a[3]), c = this.CV[a[1].idx], d = a[2];
        for (let i = 0; i < n; i++) {
          const lo = R(at(a[0], 2 * i)), hi = R(at(a[0], 2 * i + 1));
          this.setBitAt(d.dev, d.idx + i, lo <= hi ? c >= lo && c <= hi : c >= lo || c <= hi);
        }
        break;
      }
      case 'SORT': {
        const m1 = this.getWord(a[1]), m2 = this.getWord(a[2]), col = Math.max(1, Math.min(m2, this.getWord(a[4]))) - 1;
        const rows = [];
        for (let r = 0; r < m1; r++) { const row = []; for (let c = 0; c < m2; c++) row.push(R(at(a[0], c * m1 + r))); rows.push(row); }
        rows.sort((x, y) => (M[1165] ? y[col] - x[col] : x[col] - y[col]));
        rows.forEach((row, r) => row.forEach((v, c) => W(at(a[3], c * m1 + r), v)));
        M[1029] = 1;
        break;
      }
      // ---------------------------------------------------------------- real-time clock
      case 'TRD': {
        const t = this.rtcNow(), d = a[0];
        [t.getFullYear() % 100, t.getDay() || 7, t.getMonth() + 1, t.getDate(), t.getHours(), t.getMinutes(), t.getSeconds()].forEach((v, k) => this.setWord(offset(d, k), v));
        break;
      }
      case 'TWR': {
        const v = []; for (let k = 0; k < 7; k++) v.push(this.getWord(offset(a[0], k)));
        const [yy, , mo, dd, hh, mi, ss] = v;
        if (mo < 1 || mo > 12 || dd < 1 || dd > 31 || hh < 0 || hh > 23 || mi < 0 || mi > 59 || ss < 0 || ss > 59) { err(); break; }
        this.rtcOffset = new Date(2000 + yy, mo - 1, dd, hh, mi, ss).getTime() - Date.now();
        this.rtcToRegs();
        break;
      }
      case 'TCMP': case 'TZCP': {
        const secs = (h, m, sx) => h * 3600 + m * 60 + sx;
        const trip = (op) => secs(this.getWord(op), this.getWord(offset(op, 1)), this.getWord(offset(op, 2)));
        if (e.t === 'TCMP') {
          const ref = secs(this.getWord(a[0]), this.getWord(a[1]), this.getWord(a[2])), t = trip(a[3]), d = a[4];
          this.setBitAt(d.dev, d.idx, ref > t); this.setBitAt(d.dev, d.idx + 1, ref === t); this.setBitAt(d.dev, d.idx + 2, ref < t);
        } else {
          const lo = trip(a[0]), hi = trip(a[1]), t = trip(a[2]), d = a[3];
          this.setBitAt(d.dev, d.idx, t < lo); this.setBitAt(d.dev, d.idx + 1, t >= lo && t <= hi); this.setBitAt(d.dev, d.idx + 2, t > hi);
        }
        break;
      }
      case 'TADD': case 'TSUB': {
        const trip = (op) => this.getWord(op) * 3600 + this.getWord(offset(op, 1)) * 60 + this.getWord(offset(op, 2));
        let t = e.t === 'TADD' ? trip(a[0]) + trip(a[1]) : trip(a[0]) - trip(a[1]);
        M[1022] = t >= 86400 ? 1 : 0; M[1021] = t < 0 ? 1 : 0;
        t = ((t % 86400) + 86400) % 86400;
        M[1020] = t === 0 ? 1 : 0;
        [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].forEach((v, k) => this.setWord(offset(a[2], k), v));
        break;
      }
      // ---------------------------------------------------------------- high-speed counter compare
      case 'DHSCS': case 'DHSCR': {
        const c = this.CV[a[1].idx], hit = c === this.getDWord(a[0]);
        if (!hit) break;
        const d = this.R(a[2]);
        if (e.t === 'DHSCS') this.setBit(d, 1);
        else if (d.dev === 'C') this.reset('C', d.idx); else this.setBit(d, 0);
        break;
      }
      case 'DHSZ': {
        const lo = this.getDWord(a[0]), hi = this.getDWord(a[1]), c = this.CV[a[2].idx], d = a[3];
        this.setBitAt(d.dev, d.idx, c < lo); this.setBitAt(d.dev, d.idx + 1, c >= lo && c <= hi); this.setBitAt(d.dev, d.idx + 2, c > hi);
        break;
      }
      // ---------------------------------------------------------------- matrix
      case 'MAND': case 'MOR': case 'MXOR': case 'MXNR': {
        const n = this.getWord(a[3]);
        for (let k = 0; k < n; k++) {
          const x = this.getWord(offset(a[0], k)), y = this.getWord(offset(a[1], k));
          this.setWord(offset(a[2], k), e.t === 'MAND' ? x & y : e.t === 'MOR' ? x | y : e.t === 'MXOR' ? x ^ y : ~(x ^ y));
        }
        break;
      }
      case 'MINV': { const n = this.getWord(a[2]); for (let k = 0; k < n; k++) this.setWord(offset(a[1], k), ~this.getWord(offset(a[0], k))); break; }
      case 'MCMP': {
        const n = this.getWord(a[2]);
        let found = -1;
        for (let k = 0; k < n * 16 && found < 0; k++) if (this.matBit(a[0], k) !== this.matBit(a[1], k)) found = k;
        this.setWord(a[3], found);
        M[1089] = found < 0 ? 1 : 0;
        break;
      }
      case 'MBRD': case 'MBWR': {
        const n = this.getWord(a[1]), total = n * 16;
        let p = this.getWord(a[2]);
        if (p < 0 || p >= total) { err(); break; }
        if (e.t === 'MBRD') M[1095] = this.matBit(a[0], p);
        else this.matSet(a[0], p, M[1096]);
        M[1089] = p === total - 1 ? 1 : 0;
        if (M[1094]) { p = (p + 1) % total; this.setWord(a[2], p); }
        break;
      }
      case 'MBS': case 'MBR': {
        const n = this.getWord(a[2]), total = n * 16;
        const bits = [];
        for (let k = 0; k < total; k++) bits.push(this.matBit(a[0], k));
        let out;
        if (M[1097]) { out = bits.shift(); bits.push(e.t === 'MBS' ? M[1096] : out); } else { out = bits.pop(); bits.unshift(e.t === 'MBS' ? M[1096] : out); }
        M[1095] = out ? 1 : 0;
        for (let k = 0; k < total; k++) this.matSet(a[1], k, bits[k]);
        break;
      }
      case 'MBC': {
        const n = this.getWord(a[1]);
        let c = 0;
        for (let k = 0; k < n * 16; k++) if (this.matBit(a[0], k) === (M[1088] ? 1 : 0)) c++;
        this.setWord(a[2], c);
        M[1089] = c === 0 ? 1 : 0;
        break;
      }
      // ---------------------------------------------------------------- checksums
      case 'CCD': {
        const n = this.getWord(a[2]), bytes = this.readBytes(this.R(a[0]).idx, n);
        let sum = 0, par = 0;
        for (const b of bytes) { sum += b; par ^= b; }
        this.setWord(a[1], sum); this.setWord(offset(a[1], 1), par);
        break;
      }
      case 'LRC': { const n = this.getWord(a[1]), bytes = this.readBytes(this.R(a[0]).idx, n); let sum = 0; for (const b of bytes) sum += b; this.setWord(a[2], (-sum) & 0xFF); break; }
      case 'CRC': {
        const n = this.getWord(a[1]), bytes = this.readBytes(this.R(a[0]).idx, n);
        let crc = 0xFFFF;
        for (const b of bytes) { crc ^= b; for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xA001 : crc >>> 1; }
        if (M[1161]) { this.setWord(a[2], crc & 0xFF); this.setWord(offset(a[2], 1), crc >> 8); } else this.setWord(a[2], crc);
        break;
      }
      default: break;
    }
  }

  /** Bit k of a matrix of words starting at op (bit 0 = bit 0 of the first word). */
  matBit(op, k) { return (this.getWord(offset(op, k >> 4)) >> (k & 15)) & 1; }
  matSet(op, k, v) { const o = offset(op, k >> 4), w = this.getWord(o), m = 1 << (k & 15); this.setWord(o, v ? w | m : w & ~m); }

  /** n bytes from D[d]…: 8-bit mode (M1161) one byte per register, else two (low byte first). */
  readBytes(d, n) {
    const out = [];
    for (let k = 0; k < n; k++) {
      if (this.M[1161]) out.push(this.D[d + k] & 0xFF);
      else { const w = this.D[d + (k >> 1)] & 0xFFFF; out.push(k & 1 ? w >> 8 : w & 0xFF); }
    }
    return out;
  }

  writeBytes(d, bytes) {
    if (this.M[1161]) { bytes.forEach((b, k) => { this.D[d + k] = b & 0xFF; }); return; }
    for (let k = 0; k < bytes.length; k += 2) this.D[d + (k >> 1)] = i16((bytes[k] & 0xFF) | ((bytes[k + 1] || 0) << 8));
  }

  /** STL transfer: the step that is running hands over to step n. */
  toStep(n) {
    this.S[n] = 1;
    if (this.curStep >= 0 && this.curStep !== n) this.S[this.curStep] = 0;
  }

  getBitAt(dev, idx) { return this.getBit({ dev, idx }); }
  setBitAt(dev, idx, v) { this.setBit({ dev, idx }, v); }

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

/** The k-th word after a word device (BMOV, FMOV, MEAN); KnM steps by 4n bits. */
function offset(op, k) {
  if (!k) return op;
  return { ...op, idx: op.idx + (op.n ? op.n * 4 * k : k) };
}

/** The k-th 32-bit value of a block: two registers each (C200+ are 32-bit already). */
function step32(op, k) {
  if (!k) return op;
  return { ...op, idx: op.idx + (op.n ? op.n * 4 * k : op.dev === 'C' ? k : 2 * k) };
}

export function compare(a, b, op) {
  switch (op) {
    case '&': return (a & b) !== 0;
    case '|': return (a | b) !== 0;
    case '^': return (a ^ b) !== 0;
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
