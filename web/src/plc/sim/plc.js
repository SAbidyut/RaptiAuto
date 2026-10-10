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
    this.CV = new Int32Array(256); // C200 … C255 are 32-bit (DCNT)
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
    const v32 = v;
    v = i16(v);
    switch (op.dev) {
      case 'D': this.D[op.idx] = v; break;
      case 'T': this.TV[op.idx] = v; this.tacc[op.idx] = v * timerInfo(op.idx).base; break;
      case 'C': this.CV[op.idx] = op.idx >= 200 ? v32 | 0 : v; break;
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
    this.mbCompletePending = false;
    this.mbSeen.clear();
    this.runProgram();
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
      case 'CC': return pw && compare(this.getWord(e.a[0]), this.getWord(e.a[1]), e.op) ? 1 : 0;
      case 'INV': return pw ? 0 : 1;
      case 'MEP': { const r = pw && !st[e.sid]; st[e.sid] = pw; return r ? 1 : 0; }
      case 'MEF': { const r = !pw && st[e.sid]; st[e.sid] = pw; return r ? 1 : 0; }
      case 'STL': return pw && this.S[e.a[0].idx] ? 1 : 0;
      default: return 0;
    }
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
      case 'FEND': this.flow = { fend: true }; return;
      case 'SRET': this.flow = { sret: true }; return;
      case 'RET': return; // the end of the step ladder is known from the program layout
      case 'RST': if (pw) this.reset(a[0].dev, a[0].idx); return;
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
        const n = a[0].idx, K = this.getWord(a[1]);
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
      default: break;
    }
    if (e.p) { const go = pw && !st[e.sid]; st[e.sid] = pw; if (!go) return; } else if (!pw) return;
    this.apply(e);
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
      case 'CJ': this.flow = { jump: a[0].idx }; break;
      case 'CALL': this.flow = { call: a[0].idx }; break;
      case 'ZCP': {
        const lo = this.getWord(a[0]), hi = this.getWord(a[1]), v = this.getWord(a[2]), d = a[3];
        this.setBitAt(d.dev, d.idx, v < lo);
        this.setBitAt(d.dev, d.idx + 1, v >= lo && v <= hi);
        this.setBitAt(d.dev, d.idx + 2, v > hi);
        break;
      }
      case 'CML': this.setWord(a[1], ~this.getWord(a[0])); break;
      case 'BMOV': {
        const n = this.getWord(a[2]);
        const vals = [];
        for (let k = 0; k < n; k++) vals.push(this.getWord(offset(a[0], k)));
        for (let k = 0; k < n; k++) this.setWord(offset(a[1], k), vals[k]);
        break;
      }
      case 'FMOV': { const n = this.getWord(a[2]), v = this.getWord(a[0]); for (let k = 0; k < n; k++) this.setWord(offset(a[1], k), v); break; }
      case 'XCH': { const x = this.getWord(a[0]); this.setWord(a[0], this.getWord(a[1])); this.setWord(a[1], x); break; }
      case 'BCD': {
        const v = this.getWord(a[0]);
        if (v < 0 || v > 9999) { M[1067] = 1; this.errorFlag = true; break; }
        this.setWord(a[1], (Math.floor(v / 1000) << 12) | ((Math.floor(v / 100) % 10) << 8) | ((Math.floor(v / 10) % 10) << 4) | (v % 10));
        break;
      }
      case 'BIN': {
        const v = this.getWord(a[0]) & 0xFFFF;
        const dg = [(v >> 12) & 15, (v >> 8) & 15, (v >> 4) & 15, v & 15];
        if (dg.some((x) => x > 9)) { M[1067] = 1; this.errorFlag = true; break; }
        this.setWord(a[1], dg[0] * 1000 + dg[1] * 100 + dg[2] * 10 + dg[3]);
        break;
      }
      case 'SWAP': { const v = this.getWord(a[0]) & 0xFFFF; this.setWord(a[0], ((v & 0xFF) << 8) | (v >> 8)); break; }
      case 'WAND': this.setWord(a[2], this.getWord(a[0]) & this.getWord(a[1])); break;
      case 'WOR': this.setWord(a[2], this.getWord(a[0]) | this.getWord(a[1])); break;
      case 'WXOR': this.setWord(a[2], this.getWord(a[0]) ^ this.getWord(a[1])); break;
      case 'NEG': this.setWord(a[0], -this.getWord(a[0])); break;
      case 'ABS': this.setWord(a[0], Math.abs(this.getWord(a[0]))); break;
      case 'SQR': {
        const v = this.getWord(a[0]);
        if (v < 0) { M[1067] = 1; this.errorFlag = true; break; }
        const r = Math.floor(Math.sqrt(v));
        M[1020] = r === 0 ? 1 : 0;
        this.setWord(a[1], r);
        break;
      }
      case 'MEAN': {
        const n = this.getWord(a[2]);
        let sum = 0;
        for (let k = 0; k < n; k++) sum += this.getWord(offset(a[0], k));
        this.setWord(a[1], Math.trunc(sum / Math.max(1, n)));
        break;
      }
      case 'SCAL': this.setWord(a[3], Math.trunc((this.getWord(a[0]) * this.getWord(a[1])) / 1000) + this.getWord(a[2])); break;
      case 'ROR': case 'ROL': {
        const n = this.getWord(a[1]) & 15;
        let v = this.getWord(a[0]) & 0xFFFF;
        if (n) v = e.t === 'ROR' ? ((v >>> n) | (v << (16 - n))) & 0xFFFF : ((v << n) | (v >>> (16 - n))) & 0xFFFF;
        M[1022] = n ? (e.t === 'ROR' ? (v >> 15) & 1 : v & 1) : M[1022];
        this.setWord(a[0], v);
        break;
      }
      case 'RCR': case 'RCL': {
        // 17-bit rotation: the carry M1022 is the 17th bit
        const n = this.getWord(a[1]) & 15;
        let v = (this.getWord(a[0]) & 0xFFFF) | (M[1022] ? 0x10000 : 0);
        for (let k = 0; k < n; k++) v = e.t === 'RCR' ? (v >>> 1) | ((v & 1) << 16) : ((v << 1) | (v >>> 16)) & 0x1FFFF;
        M[1022] = (v >> 16) & 1;
        this.setWord(a[0], v & 0xFFFF);
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
        const d = a[1].idx, n = this.getWord(a[2]), p = this.D[d];
        if (p >= n - 1) { M[1022] = 1; break; }
        this.D[d] = p + 1;
        this.D[d + p + 1] = i16(this.getWord(a[0]));
        M[1022] = p + 1 >= n - 1 ? 1 : 0;
        break;
      }
      case 'SFRD': {
        // S = pointer, S+1 … = queue: the oldest word goes to D, the rest move up; empty → zero flag M1020
        const s = a[0].idx, n = this.getWord(a[2]), p = this.D[s];
        if (p <= 0) { M[1020] = 1; break; }
        this.setWord(a[1], this.D[s + 1]);
        for (let k = 1; k < n - 1; k++) this.D[s + k] = this.D[s + k + 1];
        this.D[s] = p - 1;
        M[1020] = p - 1 <= 0 ? 1 : 0;
        break;
      }
      case 'WDT': break;
      case 'SFTR': case 'SFTL': {
        const s = a[0], d = a[1], n1 = this.getWord(a[2]), n2 = this.getWord(a[3]);
        const bits = [];
        for (let k = 0; k < n1; k++) bits.push(this.getBitAt(d.dev, d.idx + k));
        const src = [];
        for (let k = 0; k < n2; k++) src.push(this.getBitAt(s.dev, s.idx + k));
        const out = e.t === 'SFTR' ? [...bits.slice(n2), ...src] : [...src, ...bits.slice(0, n1 - n2)];
        out.forEach((b, k) => this.setBitAt(d.dev, d.idx + k, b));
        break;
      }
      case 'DECO': {
        const n = this.getWord(a[2]), v = this.getWord(a[0]) & ((1 << n) - 1), d = a[1];
        if (d.dev === 'D') { let w = this.D[d.idx] & ~((1 << (1 << n)) - 1); w |= 1 << v; this.D[d.idx] = i16(w); }
        else for (let k = 0; k < (1 << n); k++) this.setBitAt(d.dev, d.idx + k, k === v);
        break;
      }
      case 'ENCO': {
        const n = this.getWord(a[2]), s = a[0];
        const word = ['D', 'T', 'C'].includes(s.dev);
        const w = word ? this.getWord(s) & 0xFFFF : 0;
        let hi = -1;
        for (let k = (1 << n) - 1; k >= 0; k--) if (word ? (w >> k) & 1 : this.getBitAt(s.dev, s.idx + k)) { hi = k; break; }
        if (hi < 0) { M[1067] = 1; this.errorFlag = true; break; }
        this.D[a[1].idx] = hi;
        break;
      }
      case 'SUM': {
        let v = this.getWord(a[0]) & 0xFFFF, c = 0;
        while (v) { c += v & 1; v >>>= 1; }
        M[1020] = c === 0 ? 1 : 0;
        this.setWord(a[1], c);
        break;
      }
      case 'BON': this.setBit(a[1], (this.getWord(a[0]) >> (this.getWord(a[2]) & 15)) & 1); break;
      default: break;
    }
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

/** The k-th word after a word device (BMOV, FMOV, MEAN). */
function offset(op, k) { return { dev: op.dev, idx: op.idx + k }; }

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
