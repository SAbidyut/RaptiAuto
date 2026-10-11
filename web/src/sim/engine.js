// Simulation engine: connects the sketch interpreter (via the `hw` interface) with the circuit solver
// and the parts' behavioural models. Runs in virtual time, driven by animation frames.
import { getDef, partProps, pinsOf } from '../components/registry.js';
import { buildNetlist, pinKey } from './netlist.js';
import { Solver, VSource, Diode, Resistor } from './circuit/solver.js';
import { SketchRunner } from './lang/runtime.js';
import { makeCore } from './lang/core.js';
import { makeLibraries, libMacros, checkIncludes } from './libs/index.js';
import { Stress, pinCurrentStress, pinVoltageStress, supplyStress, burnMessage } from './damage.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function timeMacros() {
  const d = new Date();
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p = (n) => String(n).padStart(2, '0');
  return {
    __DATE__: JSON.stringify(`${M[d.getMonth()]} ${String(d.getDate()).padStart(2, ' ')} ${d.getFullYear()}`),
    __TIME__: JSON.stringify(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`),
    __FILE__: '"sketch.ino"',
  };
}

export class SimEngine {
  constructor(project, opts = {}) {
    this.project = project;
    this.opts = opts;
    this.net = opts.net || null;      // the virtual network (Wi-Fi, internet, MQTT …) the boards' libraries use
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
    // the programmable boards: the first one runs project.code (or, in the Raspberry Pi Lab,
    // Python); every other board (a second Arduino, a slave …) runs its own sketch, part.code
    const boardParts = project.parts.filter((p) => getDef(p.type) && getDef(p.type).board);
    this.boardPart = boardParts[0] || null;
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
    this.rated = [];                 // parts with a supply rating (def.ratings), watched for over-voltage
    this.partElements = new Map();   // part id → its solver elements (switched off when the part burns)

    // board runtime first (it owns ground reference)
    this.boards = [this];
    if (this.boardPart) this.buildBoard();
    for (const bp of boardParts.slice(1)) {
      const sub = subBoard(this, bp);
      sub.buildBoard();
      this.boards.push(sub);
    }
    for (const part of project.parts) {
      const def = getDef(part.type);
      if (!def || !def.sim || def.board) continue;
      const ctx = this.makeCtx(part);
      const rt = def.sim.create(ctx);
      if (rt) {
        rt.part = part;
        rt.def = def;
        rt.ctx = ctx;
        this.parts.set(part.id, rt);
        if (def.ratings) { rt.supplyStress = new Stress(0.05); this.rated.push(rt); }
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
      add: (el) => {
        const list = engine.partElements.get(part.id);
        if (list) list.push(el); else engine.partElements.set(part.id, [el]);
        return engine.solver.add(el);
      },
      burn: (msg, key, partial) => engine.burn(engine.parts.get(part.id), msg, key, partial),
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
      const st = { num: +num, id: pinId, node, mode: 0, out: 0, pwm: null, tone: null, vs, lastRead: 0, servoUs: null, pullup: false, stress: new Stress(0.05), dead: false };
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
    // another board can be this one's I²C slave (Wire.begin(address) in its sketch)
    if (b.i2c && b.pinMap[b.i2c.sda] && b.pinMap[b.i2c.scl]) brt.i2cPins = { sda: b.pinMap[b.i2c.sda], scl: b.pinMap[b.i2c.scl] };
    brt.boardCtx = this;
    this.boardRt = brt;
    this.parts.set(bp.id, brt);
  }

  /** Name of a board in messages: its title ("Master", "Slave") or its type name. */
  get label() { return (this.boardPart && (this.boardPart.title || (this.boards.length > 1 ? 'Board ' + (this.boards.indexOf(this) + 1) : ''))) || (this.board ? this.board.name : ''); }

  // ------------------------------------------------------------------ lifecycle
  start() {
    this.build();
    // every other board compiles its own sketch first: an error names the board
    for (const sub of this.boards.slice(1)) {
      const res = sub.startSketch(sub.boardPart.code || '');
      if (!res.ok) return { ...res, boardId: sub.boardPart.id, boardLabel: sub.label };
    }
    if (!this.board || this.opts.external) {
      // electronics-only circuit, or a board whose program runs elsewhere (the Raspberry Pi Lab's
      // Python drives the pins through pinMode / digitalWrite …): the circuit in (virtual) real time
      this.rt = { t: 0, queueIsr() {} };
      this.runner = null;
      this.running = true;
      this.paused = false;
      this.lastWall = null;
      this.lastIntegrate = 0;
      this.dirty = true;
      this.ensureSolved();
      for (const p of this.parts.values()) if (p.started) p.started();
      return { ok: true, noBoard: !this.board, external: !!this.opts.external, warnings: [] };
    }
    const res = this.startSketch(this.project.code);
    if (!res.ok) return res;
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

  /** Compile and start this board's sketch (the main board, or one of the others). */
  startSketch(code) {
    const engine = this;
    const board = this.board;
    const many = this.boards.length > 1;
    this.runner = new SketchRunner({
      code,
      board,
      macros: { ...board.macros, ...timeMacros(), ...libMacros },
      natives: (rt) => {
        const n = makeCore(rt, engine, board);
        makeLibraries(n, rt, engine, board);
        engine.natives = n;
        return n;
      },
      onWarning: (m) => this.warn(many ? `${this.label}: ${m}` : m, null),
    });
    const res = this.runner.compile();
    if (!res.ok) return res;
    // a Wi-Fi library on a board that has none: the compiler stops like the Arduino IDE does
    const missing = checkIncludes(board, res.includes);
    if (missing) return { ok: false, error: missing };
    this.rt = this.runner.rt;
    this.runner.start();
    return res;
  }

  /** Library state that must go when this board's sketch stops or restarts (connections, servers). */
  addCleanup(fn) {
    if (!Object.prototype.hasOwnProperty.call(this, '_cleanups')) this._cleanups = [];
    this._cleanups.push(fn);
  }
  runCleanups() { const l = Object.prototype.hasOwnProperty.call(this, '_cleanups') ? this._cleanups : []; for (const fn of l) { try { fn(); } catch (e) { /* ignore */ } } }

  /**
   * External program (no sketch runner): move the circuit's clock to wall time `wall` now, between
   * frames, so a program that polls a pin in a tight loop (an HC-SR04 echo) sees time pass.
   */
  advanceTo(wall = now()) {
    if (!this.running || this.paused || this.runner || this.lastWall === null) return;
    const d = Math.min(100, wall - this.lastWall);
    if (d <= 0) return;
    this.lastWall = wall;
    this.rt.t += d * 1000 * this.speed;
    this.processEvents();
  }

  stop() {
    this.running = false;
    for (const b of this.boards || [this]) b.runCleanups();
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
    // time an external program already moved on (advanceTo) belongs to this frame too
    const frameStart = this.frameT !== undefined && this.frameT <= rt.t ? this.frameT : rt.t;
    this.changesThisFrame = 0;
    this.processEvents();
    const t0 = now();
    let status = 'ok';
    if (this.runner) status = this.runner.step(target, this.boards.length > 1 ? 9 : 14);
    else rt.t = target;
    for (let i = 1; i < this.boards.length && status !== 'error'; i++) {
      const sub = this.boards[i];
      const st = sub.runner.step(target, 6);
      if (st === 'error') { this.stop(); if (this.opts.onError) this.opts.onError({ ...sub.runner.error, boardId: sub.boardPart.id, boardLabel: sub.label }); return 'error'; }
    }
    for (const b of this.boards) {
      if (b.restartRequested) { b.restartRequested = false; b.runCleanups(); if (b.runner && b.runner.state !== 'error') b.runner.start(); }
    }
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
    this.frameT = rt.t;
    this.stats.busy = busy;
    this.computeActivity();
    if (status === 'error') {
      this.stop();
      if (this.opts.onError) this.opts.onError(this.runner && this.runner.error);
    } else if (status === 'done') {
      this.stop();
    }
    return status;
  }

  /** Per-node current magnitude (A), used to animate current flow on wires. */
  computeActivity() {
    const n = this.solver.n;
    if (!this.nodeActivity || this.nodeActivity.length !== n) this.nodeActivity = new Float64Array(n);
    const act = this.nodeActivity;
    act.fill(0);
    const add = (node, i) => { if (node >= 0 && node < n) act[node] += i; };
    for (const el of this.solver.elements) {
      const i = Math.abs(el.iAvg ?? el.i ?? 0);
      if (i < 1e-6 && !el.ic) continue;
      if (el.a !== undefined && el.b !== undefined) { add(el.a, i); add(el.b, i); }
      else if (el.p !== undefined) { add(el.p, i); add(el.n, i); }
      else if (el.k !== undefined) { add(el.a, i); add(el.k, i); }
      else if (el.c !== undefined) { const ic = Math.abs(el.ic || 0), ib = Math.abs(el.ib || 0); add(el.c, ic); add(el.e, ic + ib); add(el.b, ib); }
      else if (el.d !== undefined) { add(el.d, i); add(el.s, i); }
    }
    for (let k = 0; k < n; k++) act[k] *= 0.5;
  }

  /** +1 if current visually flows from wire.from to wire.to, -1 otherwise. */
  flowDirection(w) {
    const node = this.nodeOf(w.from.part, w.from.pin);
    const high = node >= 0 && this.vAvg(node) - this.vAvg(this.gnd) > 0.6;
    const isSrc = (ref) => {
      const part = this.partById(ref.part);
      const def = part && getDef(part.type);
      return !!(def && (def.board || def.type.startsWith('battery') || def.type === 'power-supply'));
    };
    const fromSrc = isSrc(w.from), toSrc = isSrc(w.to);
    if (fromSrc && !toSrc) return high ? 1 : -1;
    if (toSrc && !fromSrc) return high ? -1 : 1;
    return high ? 1 : -1;
  }

  /** Forward a UI interaction to a part runtime. */
  input(partId, key, value, extra) {
    const rt = this.parts.get(partId);
    if (!rt || !rt.input) return;
    if (this.running) this.integrateTo(this.time());
    rt.input(key, value, extra);
    this.dirty = true;
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
    for (const b of this.boards || [this]) { b.checkPinCurrents(); b.checkInterrupts(); }
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
    for (const b of this.boards) {
      if (!b.pins) continue;
      for (const st of b.pins.values()) {
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
    this.wear(dt);
    this.lastIntegrate = t;
  }

  /** What the circuit has done to the parts in the last dt µs: supplies, pins (see damage.js). */
  wear(dt) {
    if (this.rated && this.rated.length) {
      for (const rt of this.rated) {
        if (rt.burnt) continue;
        const r = rt.def.ratings;
        const v = this.supplyVoltage(rt.part, r.vcc || 'VCC', r.gnd || 'GND');
        if (rt.supplyStress.add(supplyStress(v, r.max), dt) >= 1) {
          const why = v < 0 ? `the supply was connected the wrong way round (${v.toFixed(1)} V)` : `${v.toFixed(1)} V is far above its ${r.max} V limit`;
          this.burn(rt, burnMessage(rt.def.name, why, v < 0 ? 'Check which pin is VCC and which is GND' : `Power it from ${r.max <= 5.5 ? '5 V or 3.3 V' : 'a lower voltage'}`), 'burn:' + rt.part.id);
        }
      }
    }
    for (const b of this.boards || [this]) b.wearPins(dt);
  }

  /** Pin currents and voltages: too much current, or a voltage outside the supply, kills the pin. */
  wearPins(dt) {
    if (!this.pins || !this.board) return;
    const vcc = this.board.vcc, lim = this.board.pinBurnI || this.board.pinMaxI || 0.04;
    for (const st of this.pins.values()) {
      if (st.dead || st.node < 0) continue;
      let rate = 0, why = '';
      if (st.vs.on && st.mode === 1) {
        const i = Math.abs(st.vs.iAvg ?? st.vs.i);
        rate = pinCurrentStress(i, lim);
        if (rate) why = `it supplied ${(i * 1000).toFixed(0)} mA (limit ${Math.round(lim * 1000)} mA) — use a resistor or a transistor/driver`;
      }
      const v = this.vAvg(st.node) - this.vAvg(this.gnd);
      const over = v > vcc + 0.4 ? v - vcc - 0.4 : v < -0.6 ? -0.6 - v : 0;
      const rv = pinVoltageStress(over);
      if (rv > rate) { rate = rv; why = `${v.toFixed(1)} V is outside its ${vcc} V supply — ${vcc < 4 ? 'this is a 3.3 V pin: use a voltage divider (e.g. 1 kΩ + 2 kΩ) or a level shifter on 5 V signals' : 'check what is wired to it'}`; }
      if (st.stress.add(rate, dt) >= 1) this.burnPin(st, why);
    }
  }

  burnPin(st, why) {
    if (st.dead) return;
    st.dead = true;
    st.vs.on = false;
    st.mode = 0; st.pwm = null; st.tone = null; st.pullup = false; st.servoUs = null; st.out = 0;
    this.dirty = true;
    const rt = this.boardRt, part = this.boardPart;
    if (rt && part) {
      const pin = pinsOf(part).find((q) => q.id === st.id);
      rt.visual.burnAt = [...(rt.visual.burnAt || []), pin ? [pin.x, pin.y] : [0, 0]];
      rt.visual.burntPins = [...(rt.visual.burntPins || []), st.id];
    }
    this.warn(burnMessage(`${this.board.name} pin ${st.id}`, why), part && part.id, 'burnpin' + st.num);
    if (this.opts.onBurn) this.opts.onBurn(part && part.id, `${st.id} burned out`);
  }

  /**
   * A part burns (once): its circuit elements go dead, its runtime stops answering, the canvas shows a
   * flash, a scorch mark and a few seconds of smoke. rt.onBurn() lets a part do more (an LED opens).
   */
  burn(rt, msg, key, partial = false) {
    if (!rt || rt.burnt) return;
    if (partial) {
      // one segment / channel of a part burnt (the rest still works): the part shows the flash + smoke once
      const first = !(rt.visual && rt.visual.burnt);
      if (rt.visual) rt.visual.burnt = true;
      if (first) rt.burntAt = this.time();
      this.dirty = true;
      this.warn(msg, rt.part.id, 'burn:' + rt.part.id + ':' + (key || ''));
      if (this.opts.onBurn) this.opts.onBurn(rt.part.id, msg);
      return;
    }
    rt.burnt = true;
    rt.burntAt = this.time();
    if (rt.visual) rt.visual.burnt = true;
    for (const el of this.partElements.get(rt.part.id) || []) {
      if (el.dead) continue;
      el.dead = true;
      el.stamp = () => {};
      el.update = () => false;
      el.measure = function () { this.i = 0; this.iAvg = 0; };
    }
    if (typeof rt.powered === 'function') rt.powered = () => false;
    if (rt.onBurn) rt.onBurn();
    this.dirty = true;
    this.warn(msg, rt.part.id, 'burn:' + rt.part.id);
    if (this.opts.onBurn) this.opts.onBurn(rt.part.id, msg);
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
    for (const b of this.boards || [this]) {
      if (!b.pins) continue;
      for (const st of b.pins.values()) {
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
    if (st.dead) return null; // burnt out: the pin no longer answers
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
      if (st.mode === 0) {
        this.warn(this.board.python
          ? `${st.id} is floating (no pull-up / pull-down and nothing drives it), so it reads random values. Use Button(${st.num}) / pull_up=True, GPIO.setup(${st.num}, GPIO.IN, pull_up_down=GPIO.PUD_UP) or Pin(${st.num}, Pin.IN, Pin.PULL_UP).`
          : `Pin ${st.id} is floating (not connected to anything) and reads random values. Use INPUT_PULLUP or a pull-down resistor.`, null, 'float' + st.num);
      }
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
    // the signal may reach the pin through a resistor / voltage divider (a 5 V HC-SR04 ECHO on a 3.3 V board)
    for (const n of [st.node, ...[...this.resistiveNeighbours(st.node)].filter((x) => x !== st.node)]) {
      for (const pr of this.parts.values()) {
        if (pr.pulseOn) {
          const r = pr.pulseOn(n, level, timeout);
          if (r) return r;
        }
      }
    }
    return null;
  }

  /** The node and the nodes at most two resistors away from it (ground excluded): what a divider on a signal pin connects. */
  resistiveNeighbours(node) {
    const out = new Set([node]);
    let frontier = [node];
    for (let depth = 0; depth < 2 && frontier.length; depth++) {
      const next = [];
      for (const el of this.solver.elements) {
        if (!(el instanceof Resistor)) continue;
        for (const f of frontier) {
          const other = el.a === f ? el.b : el.b === f ? el.a : -1;
          if (other >= 0 && !out.has(other)) { out.add(other); next.push(other); }
        }
      }
      frontier = next;
    }
    return out;
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
      const lim = this.board.pinMaxI || 0.04;
      if (i > lim) {
        this.warn(`Pin ${st.id} is supplying ${(i * 1000).toFixed(0)} mA — more than the ${Math.round(lim * 1000)} mA maximum! Use a resistor or a transistor/driver.`, this.boardPart.id, 'ovc' + st.num);
      }
    }
    for (const sp of this.supplies || []) {
      const i = Math.abs(sp.vs.iAvg ?? sp.vs.i);
      sp.current = i;
      // something else drives this pin much higher than the board does (a 9 V battery on 5V, 5 V on 3V3):
      // the regulator or the chip is gone
      const ext = this.vAvg(sp.node) - this.vAvg(this.gnd);
      if (!sp.diode && ext > sp.v * 1.25 + 0.4 && (sp.vs.iAvg ?? sp.vs.i) < -0.05) {
        this.fatal(`${this.board.name} burned out: ${ext.toFixed(1)} V was forced onto its ${sp.pin} pin, which the board supplies itself at ${sp.v} V. Never connect another supply to this pin.`);
        return;
      }
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
    const sub = this.boards.indexOf(this) > 0;
    // TX wired to another board's RX: board-to-board UART (crossed TX → RX, common GND)
    const u = uartPins(this.board)[port];
    const tx = u ? this.pinNode(u.tx) : -1;
    let linked = false;
    if (tx >= 0) {
      for (const b of this.boards) {
        if (b === this) continue;
        for (const [p2, u2] of Object.entries(uartPins(b.board))) {
          if (b.pinNode(u2.rx) !== tx) continue;
          linked = true;
          if (b.natives) b.serialIn(text, p2);
          else if (this.opts.onUart) this.opts.onUart(p2, text);   // an external program's UART (Raspberry Pi)
        }
      }
    }
    // the Serial Monitor shows the USB port (Serial) and ports that are not wired to another board
    if (this.opts.onSerial && (port === 'Serial' || !linked)) this.opts.onSerial(port, text, sub ? this.label : null);
  }

  serialIn(text, port = 'Serial') {
    if (!this.natives) return;
    const s = this.natives.serials.find((x) => x.port === port) || this.natives.serials[0];
    if (s) s.feed(text);
    if (this.boardRt) this.boardRt.rxUntil = this.time() + 40000;
  }

  /** An external program (the Pi's Python) wrote to its UART `port`: boards wired to its TX get it. */
  externalUartOut(port, text) {
    const u = uartPins(this.board)[port];
    const tx = u ? this.pinNode(u.tx) : -1;
    if (tx < 0) return 0;
    let n = 0;
    for (const b of this.boards.slice(1)) {
      for (const [p2, u2] of Object.entries(uartPins(b.board))) if (b.pinNode(u2.rx) === tx) { b.serialIn(text, p2); n++; }
    }
    return n;
  }

  /** I²C slave: this board's sketch called Wire.begin(address); the master's Wire talks to `wire`. */
  i2cSlave(address, wire) {
    const brt = this.boardRt;
    if (!brt) return;
    const runner = () => this.runner;
    brt.i2c = { address: address & 127 };
    brt.i2cWrite = (bytes) => {
      wire.rx = bytes.slice();
      if (wire.onRecv) runner().runNow(wire.onRecv, [bytes.length]);
      brt.rxUntil = this.time() + 40000;
    };
    brt.i2cRead = (n) => {
      wire.slaveTx = [];
      if (wire.onReq) runner().runNow(wire.onReq, []);
      const out = wire.slaveTx.slice(0, n);
      wire.slaveTx = null;
      while (out.length < n) out.push(255);
      brt.txUntil = this.time() + 40000;
      return out;
    };
  }

  warn(msg, partId, key) {
    const k = key || msg;
    if (this.warnedKeys.has(k)) return;
    this.warnedKeys.add(k);
    if (this.opts.onWarning) this.opts.onWarning(msg, partId);
  }

  // EEPROM persistence
  eepromData(size) {
    const saved = this.boards.indexOf(this) > 0 ? this.boardPart.eeprom : this.project.eeprom;
    const a = new Array(size).fill(255);
    if (Array.isArray(saved)) for (let i = 0; i < Math.min(size, saved.length); i++) a[i] = saved[i];
    return a;
  }
  eepromCommit(data) {
    if (this.boards.indexOf(this) > 0) this.boardPart.eeprom = data.slice(); else this.project.eeprom = data.slice();
    if (this.opts.onEeprom) this.opts.onEeprom();
  }

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

  /** Part runtimes with pin `pinId` (or any pin) on node `node`. */
  partsOnNode(node, filter = null, pinId = null) {
    if (node < 0) return [];
    const out = [];
    for (const rt of this.parts.values()) {
      if (rt === this.boardRt) continue;
      if (filter && !filter(rt)) continue;
      for (const pin of pinsOf(rt.part)) {
        if (pinId && pin.id !== pinId) continue;
        if (this.nodeOf(rt.part.id, pin.id) === node) { out.push({ rt, pin: pin.id }); break; }
      }
    }
    return out;
  }

  /** Servo pulse output on a pin (Servo library). us = null detaches. */
  setServo(p, us) {
    const st = this.pin(p);
    if (!st) return;
    if (us === null) { st.servoUs = null; st.pwm = null; st.out = 0; this.outputChanged(st); return; }
    st.mode = 1;
    st.tone = null;
    st.servoUs = us;
    st.pwm = Math.max(0.0001, Math.min(0.9999, us / 20000));
    this.outputChanged(st);
  }

  /** WS2812 data burst on a pin (NeoPixel library). */
  sendWs2812(p, colors) {
    const st = this.pin(p);
    if (!st) return 0;
    if (st.mode !== 1) { st.mode = 1; this.outputChanged(st); }
    const targets = this.partsOnPin(p, (rt) => !!rt.ws2812, 'DIN');
    for (const t of targets) t.rt.ws2812(colors);
    this.dirty = true;
    return targets.length;
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
      if (!rt.i2c || rt === this.boardRt) continue;
      const pa = rt.i2cPins || rt.def.i2cPins || { sda: 'SDA', scl: 'SCL' };
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
    if (node < 0) return null;
    for (const b of this.boards || [this]) {
      if (!b.pins) continue;
      for (const st of b.pins.values()) if (st.node === node && st.mode === 1) return st;
    }
    return null;
  }
}

/** UART pins of a board: { Serial: { rx, tx }, … } (GPIO numbers). */
export function uartPins(board) {
  if (!board) return {};
  if (board.uart) return board.uart;
  const pm = board.pinMap || {};
  return pm[0] && pm[1] && (board.serialPorts || []).includes('Serial') ? { Serial: { rx: 0, tx: 1 } } : {};
}

// state every board of one engine shares (the circuit, the clock, the event queue …)
const SHARED = ['dirty', 'changesThisFrame', 'lastIntegrate', 'Vavg', '_partMap', 'nodeActivity', 'frameT', 'lastWall', 'running', 'paused', 'speed', 'extraNodes', 'frameStart', 'simStartWall', 'stats'];

/**
 * A second (third …) programmable board in the same circuit: an object that inherits the engine's
 * methods and circuit, with its own pins, power rails, sketch runner and libraries.
 */
function subBoard(engine, bp) {
  const sub = Object.create(engine);
  for (const k of SHARED) Object.defineProperty(sub, k, { get: () => engine[k], set: (v) => { engine[k] = v; }, configurable: true });
  sub.boardPart = bp;
  sub.board = getDef(bp.type).board;
  sub.runner = null;
  sub.rt = null;
  sub.natives = null;
  sub.root = engine;
  return sub;
}
