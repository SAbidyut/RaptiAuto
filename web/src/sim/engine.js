// Simulation engine: connects the sketch interpreter (via the `hw` interface) with the circuit solver
// and the parts' behavioural models. Runs in virtual time, driven by animation frames.
import { getDef, partProps, pinsOf } from '../components/registry.js';
import { buildNetlist, pinKey } from './netlist.js';
import { Solver, VSource, Diode } from './circuit/solver.js';
import { SketchRunner } from './lang/runtime.js';
import { makeCore } from './lang/core.js';
import { makeLibraries } from './libs/index.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class SimEngine {
  constructor(project, opts = {}) {
    this.project = project;
    this.opts = opts;
    this.solver = new Solver();
    this.running = false;
    this.paused = false;
    this.speed = 1;
    this.parts = new Map(); // id -> runtime
    this.dirty = true;
    this.events = [];
    this.warnedKeys = new Set();
    this.serialLog = [];
    this.stats = { solves: 0, realtime: 1, simTime: 0 };
    this.watchers = new Map(); // node -> [fn]
  }

  // ------------------------------------------------------------------ build
  build() {
    const project = this.project;
    this.netlist = buildNetlist(project);
    const { nets, netOf } = this.netlist;
    this.netOf = netOf;
    // pick the programmable board
    this.boardPart = project.parts.find((p) => getDef(p.type) && getDef(p.type).board);
    this.board = this.boardPart ? getDef(this.boardPart.type).board : null;

    // node allocation: nets that touch at least one electrical (non connector-only) pin
    this.nodeOfNet = new Int32Array(nets.length).fill(-1);
    let n = 0;
    for (const net of nets) {
      const electrical = net.pins.some((k) => {
        const partId = k.slice(0, k.indexOf(':'));
        const part = this.partById(partId);
        const def = part && getDef(part.type);
        return def && !def.connectorOnly;
      });
      if (electrical) this.nodeOfNet[net.id] = n++;
    }
    this.nodeCount = n;
    this.extraNodes = 0;
    this.solver.clear();
    this.parts.clear();
    this.netPins = nets;

    // board runtime first (it owns ground reference)
    if (this.boardPart) this.buildBoard();
    for (const part of project.parts) {
      const def = getDef(part.type);
      if (!def || !def.sim || part === this.boardPart) continue;
      const ctx = this.makeCtx(part);
      const rt = def.sim.create(ctx);
      if (rt) {
        rt.part = part;
        rt.def = def;
        rt.ctx = ctx;
        this.parts.set(part.id, rt);
      }
    }
    this.solver.setNodeCount(this.nodeCount + this.extraNodes);
    this.accumParts = [...this.parts.values()].filter((p) => p.accumulate);
  }

  partById(id) {
    if (!this._partMap) this._partMap = new Map(this.project.parts.map((p) => [p.id, p]));
    return this._partMap.get(id);
  }

  nodeOf(partId, pinId) {
    const net = this.netOf.get(pinKey(partId, pinId));
    if (net === undefined) return -1;
    return this.nodeOfNet[net];
  }

  netIdOf(partId, pinId) {
    const net = this.netOf.get(pinKey(partId, pinId));
    return net === undefined ? -1 : net;
  }

  newNode() {
    const id = this.nodeCount + this.extraNodes;
    this.extraNodes++;
    return id;
  }

  makeCtx(part) {
    const engine = this;
    const props = partProps(part);
    return {
      engine,
      part,
      props,
      node: (pinId) => engine.nodeOf(part.id, pinId),
      newNode: () => engine.newNode(),
      add: (el) => engine.solver.add(el),
      v: (node) => engine.vAvg(node),
      vDiff: (a, b) => engine.vAvg(a) - engine.vAvg(b),
      now: () => engine.time(),
      warn: (msg, key) => engine.warn(msg, part.id, key),
      dirty: () => { engine.dirty = true; },
      schedule: (t, fn) => engine.schedule(t, fn),
      watch: (pinId, fn) => engine.watch(engine.nodeOf(part.id, pinId), fn),
      logic: (pinId) => engine.logicLevel(engine.nodeOf(part.id, pinId)),
      vcc: () => (engine.board ? engine.board.vcc : 5),
      sound: (id, freq, vol) => engine.opts.onSound && engine.opts.onSound(part.id + ':' + id, freq, vol),
      i2c: () => engine.i2cConnected(part),
    };
  }

  // ------------------------------------------------------------------ board
  buildBoard() {
    const bp = this.boardPart;
    const b = this.board;
    const engine = this;
    const gndPin = b.gndPins[0];
    const gnd = this.nodeOf(bp.id, gndPin);
    this.gnd = gnd;
    if (gnd >= 0) this.solver.groundTies.push([gnd, 1e3]);
    this.pins = new Map();
    for (const [num, pinId] of Object.entries(b.pinMap)) {
      const node = this.nodeOf(bp.id, pinId);
      const vs = new VSource(node, gnd, 0, b.rout || 25);
      vs.on = false;
      const st = { num: +num, id: pinId, node, mode: 0, out: 0, pwm: null, tone: null, vs, lastRead: 0, servoUs: null, pullup: false };
      if (node >= 0) this.solver.add(vs);
      this.pins.set(+num, st);
    }
    // power rails
    this.supplies = [];
    for (const sp of b.supplies) {
      const node = this.nodeOf(bp.id, sp.pin);
      if (node < 0) continue;
      if (sp.diode) {
        const mid = this.newNode();
        const vs = this.solver.add(new VSource(mid, gnd, sp.v, sp.r || 0.1));
        const d = this.solver.add(new Diode(mid, node, 0.6, 0.05));
        this.supplies.push({ ...sp, node, vs, d });
      } else {
        const vs = this.solver.add(new VSource(node, gnd, sp.v, sp.r || 0.05));
        this.supplies.push({ ...sp, node, vs });
      }
    }
    // runtime object for visuals (L, TX, RX, ON LEDs, R4 matrix...)
    const brt = {
      part: bp,
      def: getDef(bp.type),
      visual: { on: true, L: 0, tx: 0, rx: 0, matrix: null },
      txUntil: 0,
      rxUntil: 0,
      after() {
        const led = engine.pins.get(b.ledBuiltin);
        if (led) {
          const v = led.node >= 0 ? engine.vAvg(led.node) - engine.vAvg(engine.gnd) : (led.mode === 1 ? led.out * b.vcc : 0);
          const duty = led.node < 0 && led.pwm !== null ? led.pwm : 1;
          this.visual.L = Math.max(0, Math.min(1, (v / b.vcc - 0.35) / 0.5)) * duty;
        }
      },
      tick() {
        const t = engine.time();
        this.visual.tx = t < this.txUntil ? 1 : 0;
        this.visual.rx = t < this.rxUntil ? 1 : 0;
      },
    };
    this.boardRt = brt;
    this.parts.set(bp.id, brt);
  }

  // ------------------------------------------------------------------ lifecycle
  start() {
    this.build();
    if (!this.board) return { ok: false, error: { message: 'Add a microcontroller board (e.g. Arduino Uno) to run code.' } };
    const engine = this;
    const board = this.board;
    this.runner = new SketchRunner({
      code: this.project.code,
      board,
      macros: board.macros,
      natives: (rt) => {
        const n = makeCore(rt, engine, board);
        makeLibraries(n, rt, engine, board);
        engine.natives = n;
        return n;
      },
      onWarning: (m) => this.warn(m, null),
    });
    const res = this.runner.compile();
    if (!res.ok) return res;
    this.rt = this.runner.rt;
    this.runner.start();
    this.running = true;
    this.paused = false;
    this.simStartWall = now();
    this.lastWall = null;
    this.frameStart = 0;
    this.lastIntegrate = 0;
    this.dirty = true;
    this.ensureSolved();
    for (const p of this.parts.values()) if (p.started) p.started();
    return { ok: true, warnings: res.warnings, includes: res.includes };
  }

  stop() {
    this.running = false;
    if (this.opts.onSound) this.opts.onSound('*', 0, 0);
    for (const p of this.parts.values()) if (p.stopped) p.stopped();
  }

  time() { return this.rt ? this.rt.t : 0; }

  /** Advance the simulation to match wall-clock time. */
  tick(wall = now()) {
    if (!this.running || this.paused) { this.lastWall = wall; return; }
    if (this.lastWall === null) this.lastWall = wall;
    const dWall = Math.min(100, Math.max(0, wall - this.lastWall));
    this.lastWall = wall;
    const rt = this.rt;
    const target = rt.t + dWall * 1000 * this.speed;
    const frameStart = rt.t;
    this.changesThisFrame = 0;
    this.processEvents();
    const t0 = now();
    const status = this.runner.step(target, 14);
    const busy = now() - t0;
    this.processEvents();
    this.integrateTo(rt.t);
    const frameDt = rt.t - frameStart;
    for (const p of this.parts.values()) {
      if (p.endFrame) p.endFrame(frameDt);
      if (p.tick) p.tick(frameDt);
    }
    if (dWall > 0) {
      const ratio = frameDt / (dWall * 1000);
      this.stats.realtime = this.stats.realtime * 0.9 + Math.min(1, ratio / this.speed) * 0.1;
    }
    this.stats.simTime = rt.t;
    this.stats.busy = busy;
    if (status === 'error') {
      this.stop();
      if (this.opts.onError) this.opts.onError(this.runner.error);
    } else if (status === 'done') {
      this.stop();
    }
    return status;
  }

  // ------------------------------------------------------------------ events & watchers
  schedule(t, fn) {
    this.events.push({ t, fn });
    this.events.sort((a, b) => a.t - b.t);
  }

  processEvents() {
    const t = this.time();
    let guard = 0;
    while (this.events.length && this.events[0].t <= t && guard++ < 1000) {
      const e = this.events.shift();
      e.fn(e.t);
      this.dirty = true;
    }
  }

  watch(node, fn) {
    if (node < 0) return;
    if (!this.watchers.has(node)) this.watchers.set(node, []);
    this.watchers.get(node).push(fn);
  }

  // ------------------------------------------------------------------ solving
  vAvg(node) { return node >= 0 && this.Vavg ? this.Vavg[node] : 0; }

  ensureSolved() {
    if (!this.dirty) return;
    for (let pass = 0; pass < 6 && this.dirty; pass++) {
      this.dirty = false;
      this.solveOnce();
      let again = false;
      for (const p of this.parts.values()) if (p.after && p.after() === true) again = true;
      if (again) this.dirty = true;
    }
    this.dirty = false;
    this.checkPinCurrents();
    this.checkInterrupts();
  }

  applyPinState(st, level) {
    const vs = st.vs;
    const vcc = this.board.vcc;
    if (st.mode === 1) { // OUTPUT
      vs.on = true; vs.v = level * vcc; vs.r = this.board.rout || 25;
    } else if (st.mode === 4) { // open drain
      vs.on = level === 0; vs.v = 0; vs.r = this.board.rout || 25;
    } else if (st.mode === 2 || st.pullup) {
      vs.on = true; vs.v = vcc; vs.r = this.board.rpull || 35000;
    } else if (st.mode === 3) {
      vs.on = true; vs.v = 0; vs.r = this.board.rpull || 35000;
    } else {
      vs.on = false;
    }
  }

  solveOnce() {
    const s = this.solver;
    this.stats.solves++;
    for (const p of this.parts.values()) if (p.prepare) p.prepare();
    const pwm = [];
    if (this.pins) {
      for (const st of this.pins.values()) {
        if (st.node < 0) continue;
        let duty = null;
        if (st.mode === 1) {
          if (st.tone) duty = 0.5;
          else if (st.pwm !== null && st.pwm > 0 && st.pwm < 1) duty = st.pwm;
          else if (st.pwm !== null) st.out = st.pwm >= 1 ? 1 : 0;
        }
        if (duty !== null) pwm.push([st, duty]);
        this.applyPinState(st, duty !== null ? 0 : st.out);
      }
    }
    const els = s.elements;
    if (!pwm.length) {
      s.solve();
      this.Vavg = s.V.slice();
      for (const el of els) el.iAvg = el.i;
      return;
    }
    s.solve();
    const base = s.V.slice();
    const avg = base.slice();
    for (const el of els) { el._b = el.i; el.iAvg = el.i; }
    for (const [st, d] of pwm) {
      this.applyPinState(st, 1);
      s.solve();
      const V = s.V;
      for (let i = 0; i < avg.length; i++) avg[i] += d * (V[i] - base[i]);
      for (const el of els) el.iAvg += d * (el.i - el._b);
      this.applyPinState(st, 0);
    }
    // restore element currents to the averaged values
    for (const el of els) el.i = el.iAvg;
    this.Vavg = avg;
  }

  integrateTo(t) {
    if (t <= this.lastIntegrate) return;
    this.ensureSolved();
    const dt = t - this.lastIntegrate;
    for (const p of this.accumParts) p.accumulate(dt);
    this.lastIntegrate = t;
  }

  outputChanged(st) {
    if (this.changesThisFrame++ < 800) this.integrateTo(this.time());
    this.dirty = true;
    const ws = this.watchers.get(st.node);
    if (ws) {
      const level = st.mode === 1 ? st.out : null;
      for (const fn of ws) fn(level, this.time());
    }
  }

  /** Logic level of a node: direct MCU driver if any, otherwise solved voltage. */
  logicLevel(node) {
    if (node < 0) return 0;
    if (this.pins) {
      for (const st of this.pins.values()) {
        if (st.node === node && st.mode === 1 && st.pwm === null && !st.tone) return st.out;
      }
    }
    this.ensureSolved();
    const v = this.vAvg(node) - this.vAvg(this.gnd);
    return v > (this.board ? this.board.vcc : 5) * 0.5 ? 1 : 0;
  }

  isFloating(node) {
    // node only connected through (near) zero conductances
    if (node < 0) return true;
    const d = this.solver.diag;
    return !(d && d[node] > 1e-7);
  }

  // ------------------------------------------------------------------ hw interface (used by core.js)
  pin(p) {
    const st = this.pins && this.pins.get(p);
    if (!st) {
      this.warn(`Pin ${p} does not exist on ${this.board.name}`, null, 'nopin' + p);
      return null;
    }
    return st;
  }

  pinMode(p, m) {
    const st = this.pin(p);
    if (!st) return;
    if (st.mode === m) return;
    if (this.board.inputOnly && this.board.inputOnly.includes(p) && m === 1) {
      this.warn(`GPIO${p} is input-only on ${this.board.name} and cannot be an OUTPUT`, null, 'inonly' + p);
      return;
    }
    st.mode = m;
    st.pullup = false;
    if (m !== 1) { st.pwm = null; st.tone = null; }
    this.outputChanged(st);
  }

  digitalWrite(p, v) {
    const st = this.pin(p);
    if (!st) return;
    if (st.mode === 0 || st.mode === 2) {
      // writing HIGH to an INPUT pin enables the pull-up (AVR behaviour)
      if (this.board.arch === 'avr') {
        const pu = !!v;
        if (pu !== st.pullup || st.mode === 2) { st.pullup = pu; if (st.mode === 2 && !pu) st.mode = 0; this.outputChanged(st); }
      } else if (!this.warnedKeys.has('dwin' + p)) {
        this.warn(`digitalWrite(${p}) on a pin that is not set as OUTPUT — call pinMode(${p}, OUTPUT) first`, null, 'dwin' + p);
      }
      st.out = v;
      return;
    }
    if (st.out === v && st.pwm === null && !st.tone) return;
    st.out = v;
    st.pwm = null;
    st.tone = null;
    this.outputChanged(st);
  }

  digitalRead(p) {
    const st = this.pin(p);
    if (!st) return 0;
    this.processEvents();
    if (st.mode === 1) return st.pwm !== null ? (st.pwm >= 0.5 ? 1 : 0) : st.out;
    if (st.node < 0) return this.floatingNoise(st);
    this.ensureSolved();
    if (this.isFloating(st.node) && !st.pullup && st.mode !== 2 && st.mode !== 3) return this.floatingNoise(st);
    const v = this.vAvg(st.node) - this.vAvg(this.gnd);
    const vcc = this.board.vcc;
    if (v > vcc * 0.6) st.lastRead = 1;
    else if (v < vcc * 0.3) st.lastRead = 0;
    return st.lastRead;
  }

  floatingNoise(st) {
    const t = this.time();
    const slot = Math.floor(t / 37000);
    if (st._noiseSlot !== slot) {
      st._noiseSlot = slot;
      st._noise = Math.random() < 0.5 ? 1 : 0;
      if (st.mode === 0) this.warn(`Pin ${st.id} is floating (not connected to anything) and reads random values. Use INPUT_PULLUP or a pull-down resistor.`, null, 'float' + st.num);
    }
    return st._noise;
  }

  analogRead(p) {
    const st = this.pin(p);
    if (!st) return 0;
    if (this.board.analogPins && !this.board.analogPins.includes(p) && !this.board.anyAnalog) {
      this.warn(`analogRead(${p}): pin ${st.id} is not an analog input`, null, 'notanalog' + p);
    }
    this.processEvents();
    if (st.node < 0) return 1 + Math.random() * 1.5;
    this.ensureSolved();
    if (this.isFloating(st.node) && st.mode !== 2) return 0.8 + Math.random() * 2;
    return Math.max(0, this.vAvg(st.node) - this.vAvg(this.gnd));
  }

  analogWrite(p, duty, raw, max) {
    const st = this.pin(p);
    if (!st) return;
    if (st.mode !== 1) st.mode = 1;
    const pwmCapable = !this.board.pwmPins || this.board.pwmPins.includes(p);
    if (!pwmCapable) {
      this.warn(`Pin ${st.id} has no PWM — analogWrite() works like digitalWrite() here. PWM pins: ${this.board.pwmPins.map((x) => this.pins.get(x).id).join(', ')}`, null, 'nopwm' + p);
      this.digitalWriteForce(st, raw >= (max + 1) / 2 ? 1 : 0);
      return;
    }
    const d = duty <= 0 ? 0 : duty >= 1 ? 1 : duty;
    if (st.pwm === d && !st.tone) return;
    st.pwm = d;
    st.tone = null;
    st.out = d >= 1 ? 1 : 0;
    this.outputChanged(st);
  }

  digitalWriteForce(st, v) {
    st.mode = 1; st.pwm = null; st.tone = null;
    if (st.out !== v) { st.out = v; this.outputChanged(st); }
  }

  analogOut(p, volts) {
    // DAC output -> modelled as PWM equivalent average
    const st = this.pin(p);
    if (!st) return;
    st.mode = 1;
    st.pwm = Math.max(0, Math.min(1, volts / this.board.vcc));
    this.outputChanged(st);
  }

  tone(p, freq, durMs) {
    const st = this.pin(p);
    if (!st) return;
    st.mode = 1;
    st.tone = freq > 0 ? freq : null;
    st.pwm = null;
    const token = (st.toneToken = (st.toneToken || 0) + 1);
    if (durMs > 0) {
      this.schedule(this.time() + durMs * 1000, () => {
        if (st.toneToken === token) { st.tone = null; st.out = 0; this.outputChanged(st); }
      });
    }
    this.outputChanged(st);
  }

  noTone(p) {
    const st = this.pin(p);
    if (!st) return;
    st.tone = null;
    st.out = 0;
    st.toneToken = (st.toneToken || 0) + 1;
    this.outputChanged(st);
  }

  pulseIn(p, level, timeout) {
    const st = this.pin(p);
    if (!st || st.node < 0) return null;
    this.processEvents();
    for (const pr of this.parts.values()) {
      if (pr.pulseOn) {
        const r = pr.pulseOn(st.node, level, timeout);
        if (r) return r;
      }
    }
    return null;
  }

  attachInterrupt(p, fn, mode) {
    const st = this.pin(p);
    if (!st) return;
    this.ensureSolved();
    st.isr = { fn, mode, last: this.readLevelQuiet(st) };
  }

  detachInterrupt(p) {
    const st = this.pins && this.pins.get(p);
    if (st) st.isr = null;
  }

  readLevelQuiet(st) {
    if (st.mode === 1) return st.out;
    if (st.node < 0) return 0;
    const v = this.vAvg(st.node) - this.vAvg(this.gnd);
    const vcc = this.board.vcc;
    if (v > vcc * 0.6) return 1;
    if (v < vcc * 0.3) return 0;
    return st.isr ? st.isr.last : 0;
  }

  checkInterrupts() {
    if (!this.pins || !this.rt) return;
    for (const st of this.pins.values()) {
      if (!st.isr) continue;
      const lv = this.readLevelQuiet(st);
      const last = st.isr.last;
      if (lv === last) { if (st.isr.mode === 0 && lv === 0) this.rt.queueIsr(st.isr.fn); continue; }
      st.isr.last = lv;
      const m = st.isr.mode;
      // CHANGE=1, FALLING=2, RISING=3 (ESP32 uses RISING=1, FALLING=2, CHANGE=3 but constants are shared)
      if (m === 1 || (m === 2 && lv === 0) || (m === 3 && lv === 1) || (m === 4 && lv === 1) || (m === 5 && lv === 0)) this.rt.queueIsr(st.isr.fn);
    }
  }

  checkPinCurrents() {
    if (!this.pins || !this.board) return;
    for (const st of this.pins.values()) {
      if (!st.vs.on || st.mode !== 1) continue;
      const i = Math.abs(st.vs.iAvg ?? st.vs.i);
      st.current = i;
      if (i > 0.04) {
        this.warn(`Pin ${st.id} is supplying ${(i * 1000).toFixed(0)} mA — more than the 40 mA maximum! Use a resistor or a transistor/driver.`, this.boardPart.id, 'ovc' + st.num);
      }
    }
    for (const sp of this.supplies || []) {
      const i = Math.abs(sp.vs.iAvg ?? sp.vs.i);
      sp.current = i;
      if (sp.maxI && i > sp.maxI) {
        if (i > sp.maxI * 4) {
          this.fatal(`Short circuit on the ${sp.pin} pin! ${(i).toFixed(1)} A flowing — the board's protection shut it down. Check that ${sp.pin} is not wired directly to GND.`);
          return;
        }
        this.warn(`${sp.pin} supply overloaded: ${(i * 1000).toFixed(0)} mA (max ${(sp.maxI * 1000).toFixed(0)} mA)`, this.boardPart.id, 'sup' + sp.pin);
      }
    }
  }

  fatal(msg) {
    if (!this.running) return;
    this.stop();
    if (this.opts.onError) this.opts.onError({ message: msg, line: 0, electrical: true });
  }

  serialOut(port, text) {
    if (this.boardRt) this.boardRt.txUntil = this.time() + 40000;
    if (this.opts.onSerial) this.opts.onSerial(port, text);
  }

  serialIn(text, port = 'Serial') {
    if (!this.natives) return;
    const s = this.natives.serials.find((x) => x.port === port) || this.natives.serials[0];
    if (s) s.feed(text);
    if (this.boardRt) this.boardRt.rxUntil = this.time() + 40000;
  }

  warn(msg, partId, key) {
    const k = key || msg;
    if (this.warnedKeys.has(k)) return;
    this.warnedKeys.add(k);
    if (this.opts.onWarning) this.opts.onWarning(msg, partId);
  }

  // EEPROM persistence
  eepromData(size) {
    const saved = this.project.eeprom;
    const a = new Array(size).fill(255);
    if (Array.isArray(saved)) for (let i = 0; i < Math.min(size, saved.length); i++) a[i] = saved[i];
    return a;
  }
  eepromCommit(data) { this.project.eeprom = data.slice(); if (this.opts.onEeprom) this.opts.onEeprom(); }

  // ------------------------------------------------------------------ helpers for libraries
  pinNode(p) { const st = this.pins && this.pins.get(p); return st ? st.node : -1; }

  /** Part runtimes whose pin `pinId` (or any pin if null) sits on the same net as MCU pin p. */
  partsOnPin(p, filter = null, pinId = null) {
    const node = this.pinNode(p);
    if (node < 0) return [];
    const out = [];
    for (const rt of this.parts.values()) {
      if (rt === this.boardRt) continue;
      if (filter && !filter(rt)) continue;
      const pins = pinsOf(rt.part);
      for (const pin of pins) {
        if (pinId && pin.id !== pinId) continue;
        if (this.nodeOf(rt.part.id, pin.id) === node) { out.push({ rt, pin: pin.id }); break; }
      }
    }
    return out;
  }

  /** Is the given pin of a part connected to MCU pin p? */
  connected(rt, pinId, p) {
    const node = this.pinNode(p);
    return node >= 0 && this.nodeOf(rt.part.id, pinId) === node;
  }

  i2cBus() {
    const b = this.board;
    if (!b || !b.i2c) return [];
    const sda = this.pinNode(b.i2c.sda), scl = this.pinNode(b.i2c.scl);
    const out = [];
    for (const rt of this.parts.values()) {
      if (!rt.i2c) continue;
      const pa = rt.def.i2cPins || { sda: 'SDA', scl: 'SCL' };
      if (sda >= 0 && scl >= 0 && this.nodeOf(rt.part.id, pa.sda) === sda && this.nodeOf(rt.part.id, pa.scl) === scl) out.push(rt);
    }
    return out;
  }

  i2cDevice(addr) {
    return this.i2cBus().find((rt) => rt.i2c && rt.i2c.address === addr && (!rt.powered || rt.powered()));
  }

  i2cConnected(part) {
    const rt = this.parts.get(part.id);
    return rt ? this.i2cBus().includes(rt) : false;
  }

  /** Powered check helper for module parts: V(vccPin) - V(gndPin) >= min. */
  supplyVoltage(part, vccPin = 'VCC', gndPin = 'GND') {
    const a = this.nodeOf(part.id, vccPin), b = this.nodeOf(part.id, gndPin);
    if (a < 0 || b < 0) return 0;
    return this.vAvg(a) - this.vAvg(b);
  }

  /** Signal info driven onto a node by an MCU pin (servo pulses, tone, pwm). */
  pinSignal(node) {
    if (!this.pins || node < 0) return null;
    for (const st of this.pins.values()) {
      if (st.node === node && st.mode === 1) return st;
    }
    return null;
  }
}
