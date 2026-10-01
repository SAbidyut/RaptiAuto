// Executes a compiled sketch in virtual time. The engine calls step() every animation
// frame with the virtual time it should reach; the sketch suspends at loops / delays.
import { compileSketch } from './compiler.js';
import { CompileError } from './lexer.js';
import { RuntimeError, formatPrintable } from './values.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class Runtime {
  constructor() {
    this.t = 0; // virtual time in microseconds
    this.limit = 0;
    this.deadline = Infinity;
    this.ops = 0;
    this.line = 0;
    this.depth = 0;
    this.warned = new Set();
    this.onWarning = null;
    this.isrQueue = [];
    this.interruptsEnabled = true;
    this.hw = null;
  }

  overBudget() { return now() > this.deadline; }

  warnOnce(key, msg) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    if (this.onWarning) this.onWarning(msg);
  }

  /** Suspends until virtual time reaches `wake` (used by delay & co). */
  * waitUntil(wake) {
    while (wake > this.limit) {
      if (this.t < this.limit) this.t = this.limit;
      yield 0;
    }
    if (wake > this.t) this.t = wake;
  }

  /** Yields until cond() is true or virtual time reaches deadline. Returns true if cond met. */
  * waitFor(cond, deadline) {
    for (;;) {
      if (cond()) return true;
      if (this.t >= deadline) return false;
      const step = Math.min(deadline, this.limit);
      if (step > this.t) this.t = step;
      if (this.t >= this.limit) yield 0;
    }
  }

  * callDynamic(fn, args) {
    if (!fn) throw new RuntimeError('Call through null function pointer', this.line);
    if (fn.run) {
      const nf = new Array(fn.frameSize);
      fn.params.forEach((p, i) => { nf[p.slot] = args[i]; });
      if (fn.gen) yield* fn.run(nf); else fn.run(nf);
      return nf[0];
    }
    if (fn.fn) {
      let r = fn.fn(...args);
      if (fn.gen && r && typeof r.next === 'function') r = yield* r;
      return r;
    }
    throw new RuntimeError('Invalid function pointer', this.line);
  }

  queueIsr(fi) {
    if (!fi) return;
    if (this.isrQueue.length < 64) this.isrQueue.push(fi);
  }
}

export class SketchRunner {
  /**
   * @param {object} o { code, board, natives(rt) -> {functions,classes,globals,constants}, macros, onWarning }
   */
  constructor(o) {
    this.o = o;
    this.rt = new Runtime();
    this.rt.onWarning = o.onWarning || null;
    this.prog = null;
    this.gen = null;
    this.done = false;
    this.error = null;
    this.state = 'idle';
  }

  compile() {
    const { board } = this.o;
    const natives = this.o.natives(this.rt);
    this.natives = natives;
    try {
      this.prog = compileSketch(this.o.code, {
        rt: this.rt,
        arch: board.arch,
        mhz: board.mhz,
        natives,
        macros: this.o.macros || {},
      });
      return { ok: true, warnings: this.prog.warnings, includes: this.prog.includes };
    } catch (e) {
      if (e instanceof CompileError) return { ok: false, error: { message: e.message, line: e.line, col: e.col } };
      // internal error: report with best-effort line
      return { ok: false, error: { message: 'Internal compiler error: ' + (e && e.message), line: e && e.line || 0, col: 0, internal: true, stack: e && e.stack } };
    }
  }

  start() {
    const rt = this.rt;
    const prog = this.prog;
    const self = this;
    function* callFn(fi) {
      const nf = new Array(fi.frameSize);
      if (fi.gen) yield* fi.run(nf); else fi.run(nf);
      return nf[0];
    }
    const serialEvent = prog.funcs.get('serialEvent');
    const serialEventFn = serialEvent ? serialEvent.find((f) => f.run) : null;
    function* main() {
      const f0 = [];
      for (const init of prog.inits) {
        rt.line = init.line;
        if (init.gen) yield* init.fn(f0); else init.fn(f0);
      }
      rt.t += 2; // init()
      yield* callFn(prog.setup);
      const overhead = self.o.board.arch === 'avr' ? 0.6 : 0.15;
      for (;;) {
        yield* callFn(prog.loop);
        rt.t += overhead;
        if (serialEventFn && self.natives.serialAvailable && self.natives.serialAvailable()) yield* callFn(serialEventFn);
        if (rt.t >= rt.limit || ((++rt.ops & 255) === 0 && rt.overBudget())) yield 0;
      }
    }
    this.gen = main();
    this.callFn = callFn;
    this.state = 'running';
  }

  runIsrs() {
    const rt = this.rt;
    if (!rt.isrQueue.length || !rt.interruptsEnabled) return;
    const q = rt.isrQueue.splice(0);
    const savedLimit = rt.limit, savedLine = rt.line;
    rt.limit = Infinity;
    rt.interruptsEnabled = false;
    try {
      for (const fi of q) {
        const g = this.callFn(fi);
        let r = g.next();
        let guard = 0;
        while (!r.done && guard++ < 100000) r = g.next();
      }
    } finally {
      rt.interruptsEnabled = true;
      rt.limit = savedLimit;
      rt.line = savedLine;
    }
  }

  /**
   * Runs the sketch until virtual time reaches limitUs or the wall-clock budget is used.
   * Returns 'ok' | 'done' | 'error'.
   */
  step(limitUs, budgetMs = 10) {
    if (this.state !== 'running') return this.state;
    const rt = this.rt;
    rt.limit = limitUs;
    rt.deadline = now() + budgetMs;
    try {
      this.runIsrs();
      let guard = 0;
      while (rt.t < rt.limit) {
        const r = this.gen.next();
        if (r.done) { this.state = 'done'; return 'done'; }
        if (rt.isrQueue.length) this.runIsrs();
        if (now() > rt.deadline) break;
        if (++guard > 100000) break;
      }
      return 'ok';
    } catch (e) {
      this.state = 'error';
      if (e instanceof RuntimeError) this.error = { message: e.message, line: e.line || rt.line };
      else if (e instanceof RangeError && /call stack/i.test(e.message)) this.error = { message: 'Stack overflow (recursion too deep)', line: rt.line };
      else this.error = { message: 'Runtime error: ' + (e && e.message ? e.message : String(e)), line: rt.line, stack: e && e.stack };
      return 'error';
    }
  }

  get time() { return this.rt.t; }
}

export { formatPrintable };
