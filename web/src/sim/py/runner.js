// PyRunner: runs a MicroPython program in virtual time with the same interface as the Arduino SketchRunner
// (compile / start / step, `rt`, `error`) so the simulation engine can drive either.
import { Runtime } from '../lang/runtime.js';
import { parse, parseExprSource } from './parser.js';
import { PySyntaxError } from './lexer.js';
import { Interp, RET, setSpecParser } from './interp.js';
import { makeBuiltins, makePureModules } from './lib.js';
import { makeHwModules, ResetSignal } from './hw.js';
import { PyError, PyModule, EXC, hooks, pyStr, pyErr, PyInstance } from './values.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class PyRunner {
  /** o: { code, board, hw (engine), onWarning, print(text) } */
  constructor(o) {
    this.o = o;
    this.rt = new Runtime();
    this.rt.onWarning = o.onWarning || null;
    this.state = 'idle';
    this.error = null;
    this.gen = null;
    this.serial = { buf: '' };
    this.natives = { serials: [{ port: 'Serial', feed: (text) => { this.serial.buf += text; } }], serialAvailable: () => this.serial.buf.length > 0 };
  }

  compile() {
    setSpecParser((src) => parseExprSource(src, 0));
    try {
      this.ast = parse(this.o.code);
    } catch (e) {
      if (e instanceof PySyntaxError) return { ok: false, error: { message: 'SyntaxError: ' + e.message, line: e.line, col: e.col } };
      return { ok: false, error: { message: 'Internal parser error: ' + e.message, line: 0, col: 0, internal: true, stack: e.stack } };
    }
    try {
      this.build();
      this.prog = this.interp.compileModule(this.ast);
      return { ok: true, warnings: [], includes: [] };
    } catch (e) {
      if (e instanceof PySyntaxError) return { ok: false, error: { message: 'SyntaxError: ' + e.message, line: e.line, col: e.col } };
      return { ok: false, error: { message: 'Internal compiler error: ' + e.message, line: 0, col: 0, internal: true, stack: e.stack } };
    }
  }

  build() {
    const board = this.o.board;
    const hw = this.o.hw;
    const platform = board ? (board.family === 'rp2040' ? 'rp2' : board.family === 'esp8266' ? 'esp8266' : 'esp32') : 'linux';
    const ctx = {
      rt: this.rt, hw, board, serial: this.serial, platform, machineName: board ? board.name : 'RaptiAuto simulator',
      print: (text) => this.o.print(text),
      interp: null, modules: null,
    };
    this.ctx = ctx;
    const builtins = makeBuiltins(ctx);
    const pure = makePureModules(ctx);
    ctx.modules = pure;
    const hwMods = makeHwModules(ctx);
    const all = { ...pure, ...hwMods };
    all.uos = all.os;
    const importModule = (dotted, leaf) => {
      const parts = dotted.split('.');
      const top = all[parts[0]];
      if (!top) throw pyErr('ImportError', `no module named '${dotted}'`);
      if (parts.length === 1) return top;
      let cur = top;
      for (const p of parts.slice(1)) {
        if (!(p in cur.attrs)) {
          if (all[dotted]) cur.attrs[p] = all[dotted];
          else throw pyErr('ImportError', `no module named '${dotted}'`);
        }
        cur = cur.attrs[p];
      }
      return leaf ? cur : top;
    };
    this.interp = new Interp({ rt: this.rt, builtins, importModule });
    ctx.interp = this.interp;
    this.builtins = builtins;
    void PyModule;
  }

  start() {
    const interp = this.interp;
    const self = this;
    const prog = this.prog;
    function* main() {
      const f = interp.G;
      const r = prog.gen ? yield* prog.fn(f) : prog.fn(f);
      void r;
      void RET;
    }
    this.gen = main();
    this.state = 'running';
    void self;
  }

  /** Python callbacks queued by pin interrupts / timers run between statements. */
  runIsrs() {
    const rt = this.rt;
    if (!rt.isrQueue.length || !rt.interruptsEnabled) return;
    const q = rt.isrQueue.splice(0);
    const savedLimit = rt.limit, savedLine = hooks.line;
    rt.limit = Infinity;
    rt.interruptsEnabled = false;
    try {
      for (const fi of q) {
        if (fi && fi.pyfn) this.interp.callSync(fi.pyfn, fi.args || []);
      }
    } finally {
      rt.interruptsEnabled = true;
      rt.limit = savedLimit;
      hooks.line = savedLine;
    }
  }

  restart() {
    this.interp.G.vars = Object.create(null);
    this.ctx.interp.depth = 0;
    this.rt.isrQueue.length = 0;
    this.ctx.print('MPY: soft reboot\n');
    this.build();
    try {
      this.prog = this.interp.compileModule(this.ast);
    } catch (e) { this.state = 'error'; this.error = { message: String(e.message), line: 0 }; return; }
    this.start();
  }

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
      if (e instanceof ResetSignal) { this.restart(); return this.state === 'error' ? 'error' : 'ok'; }
      this.state = 'error';
      if (e instanceof PyError) {
        const exc = e.exc;
        if (exc.cls.isSub(EXC.SystemExit)) { this.state = 'done'; return 'done'; }
        const msg = pyStr(exc);
        this.error = { message: `${exc.cls.name}${msg ? ': ' + msg : ''}`, line: e.line || hooks.line, python: true };
        this.o.print(`Traceback (most recent call last):\n  File "main.py", line ${this.error.line}, in <module>\n${this.error.message}\n`);
      } else if (e instanceof RangeError && /call stack/i.test(e.message)) {
        this.error = { message: 'RuntimeError: maximum recursion depth exceeded', line: hooks.line };
      } else {
        this.error = { message: 'Internal error: ' + (e && e.message ? e.message : String(e)), line: hooks.line, stack: e && e.stack };
      }
      return 'error';
    }
  }

  get time() { return this.rt.t; }
}

void PyInstance;
