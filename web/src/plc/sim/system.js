// Whole-lab simulator: wiring nets and power sources, relay contacts, field devices, the PLC CPU,
// the HMI and VFD runtimes, the RS-232/RS-485/USB links (with real Modbus frames) and motors.
import { PlcCpu } from './plc.js';
import { compileProgram } from './ladder.js';
import { VfdMS300, vfdFormat, FAULTS } from './vfd.js';
import { HmiRuntime } from './hmi.js';
import { requestBytes, responseBytes, encodeFrame, frameMs, formatsMatch, fmtName, EXCEPTIONS } from './modbus.js';
import { SLAVE_CLASSES } from './mbdevices.js';
import { modbusAddr, fmtAddr } from './address.js';
import { DEVICE_DEFS, PLC_MODELS, deviceProps, encoderPpr } from '../devices/defs.js';
import { motorSpec, motorLinks, windingVoltages, stepMotor, driveCurrents, polar, cabs, cadd } from './motors.js';
import { TANK, feedBox, conveyorSensors, stepConveyor, stepTank, stepCylinder } from './machines.js';
import { activePlcId, plcStore, plcName } from '../store.js';

export const SUBSTEP_MS = 5;
/** Device kinds that are induction motors (on a drive or on the mains). */
const MOTOR_KINDS = new Set(['motor', 'motor6', 'conveyor']);
/** |a − b| of two AC sources (rms phasors v∠ph °). */
const acDiff = (a, b) => cabs([a.v * Math.cos(a.ph * Math.PI / 180) - b.v * Math.cos(b.ph * Math.PI / 180), a.v * Math.sin(a.ph * Math.PI / 180) - b.v * Math.sin(b.ph * Math.PI / 180)]);
const COM1_FMT = { baud: 9600, bits: 7, parity: 'E', stop: 1, mode: 'ASCII' };

export class LabSystem {
  constructor(project, hooks = {}) {
    this.project = project;
    this.hooks = hooks;
    this.time = 0;
    this.rts = new Map();
    this.log = [];
    this.logSeq = 0;
    this.issues = [];
    this.issueT = 0;
    this.events = [];
    this.hmiLinkState = { ok: false, reason: '' };
    this.txnSeq = 0;
    this.sync();
  }

  // ------------------------------------------------------------------ runtimes
  /** Create/drop device runtimes to match project.devices. */
  sync() {
    this._cn = null;
    const ids = new Set();
    for (const dev of this.project.devices) {
      ids.add(dev.id);
      if (this.rts.has(dev.id)) { const r = this.rts.get(dev.id); r.dev = dev; if (r.mb && r.mb.dev !== dev) r.mb.attach(dev); continue; }
      const def = DEVICE_DEFS[dev.type];
      if (!def) continue;
      dev.state = { ...(def.state || {}), ...(dev.state || {}) };
      const rt = { dev, def, kind: def.sim };
      if (rt.kind === 'plc') {
        rt.model = PLC_MODELS[dev.type];
        rt.cpu = new PlcCpu({ ...rt.model });
        rt.cpu.switchRun = dev.state.run !== false;
        rt.m2 = { busy: null, last: -1 };
        rt.yGroup = [];
        let y = 0;
        (rt.model.relayGroups || []).forEach((n, g) => { for (let i = 0; i < n; i++) rt.yGroup[y++] = g; });
        this.loadProgramInto(rt);
      } else if (rt.kind === 'vfd') {
        rt.vfd = new VfdMS300(dev.state.params || {});
        rt.vfd.knob = dev.state.knob ?? 0;
      } else if (rt.kind === 'hmi') {
        rt.hmi = new HmiRuntime(this.project.hmi, this.hmiLink(rt));
      } else if (MOTOR_KINDS.has(rt.kind)) {
        rt.rpm = 0; rt.angle = 0; rt.w = 0;
      } else if (rt.kind === 'ad') {
        rt.ad = new AdModule();
      } else if (SLAVE_CLASSES[rt.kind]) {
        // Modbus slave on the RS-485 bus (temperature controller, sensor, energy meter)
        rt.mb = new SLAVE_CLASSES[rt.kind](dev, () => deviceProps(rt.dev));
      }
      this.rts.set(dev.id, rt);
    }
    for (const id of [...this.rts.keys()]) if (!ids.has(id)) this.rts.delete(id);
  }

  byKind(kind) { const out = []; for (const rt of this.rts.values()) if (rt.kind === kind) out.push(rt); return out; }
  /** The PLC being programmed (the laptop's PLC). */
  get plc() { return this.rts.get(activePlcId(this.project)) || this.byKind('plc')[0] || null; }
  plcName(rt) { return plcName(this.project, rt.dev); }
  get hmiRt() { return this.byKind('hmi')[0] || null; }

  /** Compile the program that was downloaded to the PLC and load it into the CPU. */
  loadProgramInto(rt = this.plc) {
    if (!rt) return null;
    const st = plcStore(this.project, rt.dev.id);
    const prog = st.plc && st.plc.downloaded;
    if (!prog) { rt.cpu.load(null); return null; }
    const res = compileProgram(prog, rt.model);
    rt.cpu.load(res.ok ? res : null);
    return res;
  }

  /** Download a ladder program (already checked) into the PLC. */
  download(program) {
    this.project.plc = this.project.plc || {};
    this.project.plc.downloaded = JSON.parse(JSON.stringify(program));
    const rt = this.plc;
    if (!rt) return null;
    const wasRun = rt.cpu.running;
    if (wasRun) rt.cpu.enterStop();
    const res = this.loadProgramInto(rt);
    return res;
  }

  // ------------------------------------------------------------------ interaction
  /** Operate a device control. */
  act(devId, action, value) {
    const rt = this.rts.get(devId);
    if (!rt) return null;
    const s = rt.dev.state;
    switch (action) {
      case 'press': rt.pressed = !!value; break;
      case 'toggle':
        if (rt.kind === 'estop') s.pressed = !s.pressed;
        else if (rt.kind === 'selector') s.on = !s.on;
        else if (rt.kind === 'selector3') {
          // a 3-position switch turns through 0: left → 0 → right → 0 → left …
          if (s.pos) { s.last = s.pos; s.pos = 0; } else s.pos = s.last === -1 ? 1 : -1;
        }
        else if (rt.kind === 'cb') s.on = !(s.on !== false);
        else if (rt.kind === 'prox') s.target = !s.target;
        else if (rt.kind === 'limit') s.on = !s.on;
        else if (rt.kind === 'olr') {
          // a bimetal that tripped on an overload has to cool down before it can be reset
          if (s.tripped && (rt.heat || 0) > 1) return `${deviceProps(rt.dev).label || 'The overload relay'} is still hot — wait a few seconds, then reset it`;
          s.tripped = !s.tripped;
          if (!s.tripped) rt.thermal = false;
        }
        else if (rt.kind === 'mcb' || rt.kind === 'mains3') { s.on = !s.on; if (s.on) rt.tripped = false; }
        else if (rt.kind === 'plc') { s.run = !(s.run !== false); rt.cpu.setSwitch(s.run); }
        else if (rt.kind === 'meter') { rt.mb.page = (rt.mb.page + 1) % 4; rt.mb.pageT = 0; }
        break;
      case 'pos': s.pos = Math.max(0, Math.min(1, value)); break;
      // temperature controller keys / card and the T/H sensor card
      case 'tcKey':
        if (rt.kind !== 'tc') break;
        if (value === 'UP' || value === 'DOWN') s.sv = Math.max(s.lo ?? 0, Math.min(s.hi ?? 400, Math.round((s.sv ?? 120) + (value === 'UP' ? 1 : -1))));
        break;
      case 'tcSet': if (rt.kind === 'tc') { const { at, ...rest } = value; Object.assign(s, rest); if (at && rt.mb) rt.mb.startAT(); } break;
      case 'thSet': if (rt.kind === 'mbth') Object.assign(s, value); break;
      // machines: put a box on the belt, open the tank's hand valve
      case 'feed': if (rt.kind === 'conveyor') return feedBox(rt.dev, deviceProps(rt.dev)) ? null : 'No room at the feeder — wait until the belt has moved the last box on'; break;
      case 'demand': if (rt.kind === 'tank') s.demand = Math.max(0, Math.min(1, value)); break;
      case 'vfdKey': if (rt.vfd) { const hint = rt.vfd.key(value); this.persistVfd(rt); return hint; } break;
      case 'vfdKnob': s.knob = Math.max(0, Math.min(1, value)); if (rt.vfd) return rt.vfd.setKnob(s.knob); break;
      default: break;
    }
    return null;
  }

  persistVfd(rt) { rt.dev.state.params = rt.vfd.snapshotParams(); }

  // ------------------------------------------------------------------ stepping
  step(dtMs) {
    let left = Math.min(dtMs, 250);
    this.substepAcc = (this.substepAcc || 0) + left;
    while (this.substepAcc >= SUBSTEP_MS) {
      this.substepAcc -= SUBSTEP_MS;
      this.substep(SUBSTEP_MS);
    }
    this.issueT -= dtMs;
    if (this.issueT <= 0) { this.issueT = 250; this.issues = this.computeIssues(); }
  }

  substep(ms) {
    const dt = ms / 1000;
    this.time += dt;
    this.solve();
    for (const rt of this.rts.values()) if (rt.kind === 'plc') rt.cpu.step(ms);
    this.stepComm(dt);
    for (const rt of this.rts.values()) if (rt.kind === 'vfd') rt.vfd.stepSim(dt);
    for (const rt of this.rts.values()) if (rt.mb) rt.mb.step(dt, rt.kind === 'meter' ? this.panelLoad() : 0);
    this.stepMotors(dt);
    this.stepMachines(dt);
    this.stepOlr(dt);
    this.feedEncoders();
  }

  // ------------------------------------------------------------------ motors, machines, overload relays
  /** Motors that a drive can run: U / V / W terminals (the 0.75 kW motor, the conveyor's gear motor). */
  driveMotors() { const out = []; for (const rt of this.rts.values()) if (rt.kind === 'motor' || rt.kind === 'conveyor') out.push(rt); return out; }

  /** The AC phasor on a net (null when no supply reaches it). */
  phasorAt(root) {
    const l = this.src && this.src.get(root);
    const e = l && l.find((x) => x.ac);
    return e ? polar(e.v, e.ph || 0) : null;
  }

  /** Every motor: from its drive, or from the mains through contactors (direct-on-line, reversing, star-delta). */
  stepMotors(dt) {
    const F = this.faultMap();
    for (const rt of this.rts.values()) {
      if (!MOTOR_KINDS.has(rt.kind)) continue;
      const props = deviceProps(rt.dev);
      const key = JSON.stringify(props);
      if (rt.specKey !== key) { rt.spec = motorSpec(rt.kind, props); rt.specKey = key; }
      const spec = rt.spec;
      const load = Math.max(0, Math.min(2, (props.load ?? 40) / 100));
      const v = rt.driver && this.rts.get(rt.driver);
      if (v && v.vfd && rt.driverConnected) {
        rt.rpm = v.vfd.rpm; rt.w = rt.rpm / 1500; rt.amps = Math.abs(v.vfd.I);
        rt.termI = driveCurrents(['U', 'V', 'W'], rt.amps); rt.fed = 'vfd'; rt.hum = false; rt.p = rt.n = 0;
      } else {
        const id = rt.dev.id, fw = F.dev.get(id)?.winding;
        const vw = windingVoltages(spec, (port) => this.find(this.node(id, port)), (root) => this.phasorAt(root), fw ?? -1);
        stepMotor(rt, spec, vw, load, dt);
        rt.fed = rt.p + rt.n > 0.05 ? 'mains' : null;
        // line current: the terminals joined by links / wires carry the sum of their windings' currents
        const byNet = new Map();
        for (const [port, I] of rt.termI) { const r = this.find(this.node(id, port)); byNet.set(r, cadd(byNet.get(r) || [0, 0], I)); }
        rt.amps = 0;
        for (const I of byNet.values()) rt.amps = Math.max(rt.amps, cabs(I));
      }
      if (Math.abs(rt.rpm) < 0.5 && !rt.fed) rt.rpm = 0;
      rt.angle = (rt.angle + rt.rpm / 60 * 2 * Math.PI * dt) % (Math.PI * 2);
      // encoder on the shaft (the conveyor's sits on the head pulley: see stepMachines)
      const ppr = encoderPpr(props);
      if (!ppr) rt.enc = null;
      else {
        if (!rt.enc || rt.enc.ppr !== ppr) rt.enc = { ppr, x: 0, d: 0, powered: false };
        if (rt.kind !== 'conveyor') { rt.enc.d = rt.rpm / 60 * dt * ppr; rt.enc.x += rt.enc.d; }
      }
    }
  }

  /** Conveyor belt and boxes, tank level, pneumatic cylinders. */
  stepMachines(dt) {
    for (const rt of this.rts.values()) {
      if (rt.kind === 'conveyor') {
        const props = deviceProps(rt.dev);
        rt.belt = (rt.rpm / 1380) * 250; // mm/s at the rated speed of the gear motor
        if (rt.enc) { rt.enc.d = rt.belt * dt * rt.enc.ppr / 100; rt.enc.x += rt.enc.d; } // 100 mm of belt per pulley turn
        stepConveyor(rt, props, dt);
      } else if (rt.kind === 'tank') {
        const over = stepTank(rt, dt);
        if (over && !rt.overflowed) { rt.overflowed = true; this.event('overflow', rt.dev.id, `${deviceProps(rt.dev).label || 'TANK'} overflows — the pump is still filling above the high level`); }
        if ((rt.dev.state.level ?? 0) < TANK.over - 8) rt.overflowed = false;
      } else if (rt.kind === 'cyl') {
        if (rt.pressed) rt.y1 = true; // manual override on the valve
        stepCylinder(rt, deviceProps(rt.dev), dt);
      }
    }
  }

  /** Union of every conductor but the poles of one overload relay (its "load side"). */
  altUnion(tag) {
    const L = this.links || [];
    let n = 0;
    for (let i = 0; i < L.length; i += 3) n = Math.max(n, L[i], L[i + 1]);
    const par = new Int32Array(n + 1);
    for (let i = 0; i <= n; i++) par[i] = i;
    const f = (x) => { if (x > n) return x; while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    for (let i = 0; i < L.length; i += 3) if (L[i + 2] !== tag) { const a = f(L[i]), b = f(L[i + 1]); if (a !== b) par[b] = a; }
    return f;
  }

  /**
   * Thermal overload relays: the current through each pole is the sum of the motor terminal
   * currents behind it; the bimetals heat with (I / setting)² and trip at 1.2 × the setting (class 10).
   */
  stepOlr(dt) {
    const olrs = this.byKind('olr');
    if (!olrs.length) return;
    const motors = [];
    for (const rt of this.rts.values()) if (rt.termI && rt.amps > 0.005) motors.push(rt);
    for (const o of olrs) {
      let amps = 0;
      if (motors.length) {
        const uf = this.altUnion(o.dev.id);
        const roots = [1, 2, 3].map((k) => uf(this.node(o.dev.id, 'T' + k)));
        const sums = [[0, 0], [0, 0], [0, 0]];
        for (const m of motors) for (const [port, I] of m.termI) {
          const k = roots.indexOf(uf(this.node(m.dev.id, port)));
          if (k >= 0) sums[k] = cadd(sums[k], I);
        }
        amps = Math.max(...sums.map(cabs));
      }
      o.amps = amps;
      const props = deviceProps(o.dev);
      const set = Math.max(0.1, +props.setting || 3.6);
      const x2 = (amps / set) ** 2;
      o.heat = o.heat || 0;
      const tau = x2 > o.heat ? 150 : o.dev.state.tripped ? 20 : 150;
      o.heat = Math.max(0, o.heat + (dt * (x2 - o.heat)) / tau);
      if (o.heat >= 1.44 && !o.dev.state.tripped) {
        o.dev.state.tripped = true; o.thermal = true;
        this.event('trip', o.dev.id, `${props.label || 'Overload relay'} tripped: ${amps.toFixed(1)} A for a setting of ${set} A`);
      }
    }
  }

  /** Encoder pulses straight into the PLC high-speed inputs they are wired to (too fast for the scan). */
  feedEncoders() {
    const F = this.faultMap();
    for (const rt of this.rts.values()) {
      const e = rt.enc;
      if (!e || !e.powered || !e.d) continue;
      const ports = rt.kind === 'conveyor' ? ['A', 'B'] : ['A', 'B', 'Z'];
      const zero = rt.kind === 'conveyor' ? '0V' : 'E0';
      const roots = ports.map((p) => this.find(this.node(rt.dev.id, p)));
      for (const p of this.byKind('plc')) {
        if (!p.cpu.powered) continue;
        // PNP signals: the input common S/S must sit at the encoder's 0 V
        const ss = this.diff(p.dev.id, 'S/S', rt.dev.id, zero);
        if (!ss || ss.ac || Math.abs(ss.d) > 2) continue;
        for (let k = 0; k < Math.min(8, p.model.inputs); k++) {
          const i = roots.indexOf(this.find(this.node(p.dev.id, 'X' + k.toString(8))));
          if (i < 0 || F.dev.get(p.dev.id)?.xin === k) continue;
          p.cpu.hsFeed(k, ports[i], ports[i] === 'Z' ? e.d / e.ppr : e.d);
        }
      }
    }
  }

  /** Push-pull encoder outputs as levels (for the input LEDs): A, B 90° apart, Z once a turn. */
  encoderLevels(rt, add, sup, ...ports) {
    const e = rt.enc;
    if (!e) return;
    const fr = (v) => v - Math.floor(v);
    const hi = { A: fr(e.x) < 0.5, B: fr(e.x - 0.25) < 0.5, Z: fr(e.x / e.ppr) < 1 / e.ppr };
    for (const p of ports) if (p) add(rt.dev.id, p, sup.sys, hi[p] ? sup.hi : sup.lo);
  }

  // ------------------------------------------------------------------ fault finding
  /** The hidden faults of the fault-finding challenge: {wire: Set(connId), dev: Map(devId → {…})}. */
  faultMap() {
    const fl = this.project.fault;
    const items = fl && fl.active ? fl.items : null;
    if (this._fm && this._fmItems === items) return this._fm;
    const m = { wire: new Set(), dev: new Map() };
    for (const it of items || []) {
      if (it.kind === 'wire') { m.wire.add(it.conn); continue; }
      const o = m.dev.get(it.dev) || {};
      if (it.kind === 'lamp') o.lamp = true;
      else if (it.kind === 'contact') o.contact = true;
      else if (it.kind === 'sensor') o.sensor = it.port || true;
      else if (it.kind === 'coil') o.coil = it.port || true;
      else if (it.kind === 'pole') o.pole = it.k;
      else if (it.kind === 'xin') o.xin = it.k;
      else if (it.kind === 'yout') o.yout = it.k;
      else if (it.kind === 'psu') o.psu = true;
      else if (it.kind === 'olr') o.olr = true;
      else if (it.kind === 'winding') o.winding = it.k;
      else if (it.kind === 'cb') o.cb = true;
      m.dev.set(it.dev, o);
    }
    this._fm = m; this._fmItems = items;
    return m;
  }

  // ------------------------------------------------------------------ electrical solve
  solve() {
    const idx = new Map(), parent = [];
    const node = (dev, port) => { const k = dev + ':' + port; let i = idx.get(k); if (i === undefined) { i = parent.length; idx.set(k, i); parent.push(i); } return i; };
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
    // every conductor (wire, closed contact, bridge) is kept as a link: the overload relays need the
    // circuit without their own bimetals to find the current through them
    const links = [];
    const link = (a, b, tag = null) => { links.push(a, b, tag); unite(a, b); };
    this.node = node; this.find = find; this.links = links;
    const F = this.faultMap();
    for (const c of this.project.conns) {
      if (c.comm || F.wire.has(c.id)) continue; // a broken conductor inside its insulation
      link(node(c.a.dev, c.a.port), node(c.b.dev, c.b.port));
    }
    // internal contacts and bridges
    for (const rt of this.rts.values()) {
      const id = rt.dev.id, s = rt.dev.state, f = F.dev.get(id);
      const L = (a, b, tag) => link(node(id, a), node(id, b), tag);
      switch (rt.kind) {
        case 'psu': L('+V1', '+V2'); L('-V1', '-V2'); break;
        case 'plc':
          // relay outputs close Yn to their common Cn; NPN transistor outputs (EX2 "T") pull Yn to ZP
          if (rt.cpu.powered) for (let y = 0; y < rt.model.outputs; y++) if (rt.cpu.Y[y] && !(f && f.yout === y)) L(rt.model.out === 'npn' ? 'ZP' : 'C' + rt.yGroup[y], 'Y' + y.toString(8));
          // the analog commons of the EX2 are one circuit inside the PLC
          for (let k = 1; k < rt.model.ai; k++) L('VI0-', `VI${k}-`);
          if (rt.model.ao) L('AG0', 'AG1');
          break;
        case 'vfd':
          if (rt.vfd.relay()) L('RA', 'RC'); else L('RB', 'RC');
          // MO1 / MO2 open-collector outputs conduct to MCM when ON
          if (rt.vfd.mo(1)) L('MO1', 'MCM');
          if (rt.vfd.mo(2)) L('MO2', 'MCM');
          break;
        case 'pb': {
          const nc = deviceProps(rt.dev).contact === 'NC';
          if (f && f.contact) break; // worn contact: never closes
          if (nc && !rt.pressed) L('11', '12');
          if (!nc && rt.pressed) L('13', '14');
          break;
        }
        case 'estop': if (!s.pressed && !(f && f.contact)) L('11', '12'); break;
        case 'selector': if (s.on && !(f && f.contact)) L('13', '14'); break;
        case 'selector3': if (f && f.contact) break; if (s.pos === -1) L('13', '14'); else if (s.pos === 1) L('23', '24'); break;
        case 'relay': if (rt.closed) L('11', '14'); else L('11', '12'); break;
        case 'cb':
          if (s.on !== false && !(f && f.cb)) {
            if (deviceProps(rt.dev).poles === '3P') for (const k of ['1', '2', '3']) L('L' + k, 'T' + k);
            else L('1', '2');
          }
          break;
        case 'tb': for (let k = 1; k <= 6; k++) L(String(k), k + 'b'); break;
        case 'limit': if (s.on) { if (!(f && f.contact)) L('13', '14'); } else L('21', '22'); break;
        case 'contactor':
          // the armature follows the coil of the previous step (a contactor needs a few ms to pull in)
          if (rt.closed) { for (const k of ['1', '2', '3']) if (!(f && f.pole === +k)) L('L' + k, 'T' + k); L('13', '14'); } else L('21', '22');
          break;
        case 'olr':
          for (const k of ['1', '2', '3']) L('L' + k, 'T' + k, id);
          if (s.tripped) L('97', '98'); else if (!(f && f.olr)) L('95', '96');
          break;
        case 'motor6':
          // link bars in the terminal box
          for (const [a, b] of motorLinks(motorSpec('motor6', deviceProps(rt.dev)))) L(a, b);
          break;
        case 'tank': {
          // float switches: FC–LL closes above the low mark, FC–LH above the high mark
          const h = s.level ?? 0;
          if (h >= TANK.low && !(f && f.sensor === 'LL')) L('FC', 'LL');
          if (h >= TANK.high && !(f && f.sensor === 'LH')) L('FC', 'LH');
          break;
        }
        default: break;
      }
    }
    // ---- sources (AC: a phasor, v = rms against N at angle ph °)
    let src = new Map();
    const add = (dev, port, sys, v, ac = false, ph = 0, nm = null, own = null) => { const r = find(node(dev, port)); if (!src.has(r)) src.set(r, []); src.get(r).push({ sys, v, ac, ph, nm, own }); };
    const diff = (da, pa, db, pb) => {
      const ra = find(node(da, pa)), rb = find(node(db, pb));
      if (ra === rb) return { d: 0, same: true };
      const a = src.get(ra), b = src.get(rb);
      if (!a || !b) return null;
      for (const x of a) for (const y of b) if (x.sys === y.sys) return x.ac ? { d: acDiff(x, y), ac: true } : { d: x.v - y.v, ac: x.ac };
      return null;
    };
    this.diff = diff;
    const supplies = [...this.byKind('mcb'), ...this.byKind('mains3')];
    const addMains = () => {
      if (this.hooks.dead) return; // the multimeter's Ω range: the lab with the power off
      for (const m of supplies) {
        if (!m.dev.state.on || F.dev.get(m.dev.id)?.cb) continue;
        const id = m.dev.id;
        if (m.kind === 'mcb') { add(id, 'L', 'mains', 230, true, 0, 'L', id); add(id, 'N', 'mains', 0, true, 0, 'N', id); }
        else { add(id, 'L1', 'mains', 230, true, 0, 'L1', id); add(id, 'L2', 'mains', 230, true, -120, 'L2', id); add(id, 'L3', 'mains', 230, true, 120, 'L3', id); add(id, 'N', 'mains', 0, true, 0, 'N', id); }
      }
    };
    addMains();
    // AC short (phase to phase, phase to N) → the supplies feeding it trip
    for (let pass = 0; pass < 3; pass++) {
      let hit = null;
      for (const list of src.values()) {
        const acs = list.filter((x) => x.ac);
        for (let i = 1; i < acs.length && !hit; i++) if (acDiff(acs[0], acs[i]) > 5) hit = [acs[0], acs[i]];
        if (hit) { hit.push(...acs); break; }
      }
      if (!hit) break;
      const what = hit[0].nm && hit[1].nm ? `${[hit[0].nm, hit[1].nm].sort().join(' and ')}` : 'L and N';
      const owners = new Set(hit.slice(2).map((x) => x.own));
      for (const m of supplies) if (owners.has(m.dev.id) && m.dev.state.on) {
        m.dev.state.on = false; m.tripped = 'short';
        this.event('trip', m.dev.id, `${m.kind === 'mcb' ? 'MCB' : 'Main breaker (MCCB 4P)'} tripped — short circuit between ${what}`);
        m.shortWhat = what;
      }
      src = new Map();
      addMains();
    }
    // a 230 V device between two phases gets 400 V: it stays off (and the lab check says why)
    const acOn = (rt, l = 'L', n = 'N') => {
      const r = diff(rt.dev.id, l, rt.dev.id, n);
      rt.overV = !!(r && r.ac && Math.abs(r.d) > 300);
      return !!(r && r.ac && Math.abs(r.d) > 150 && Math.abs(r.d) < 300);
    };
    // AC powered devices
    for (const rt of this.rts.values()) {
      const id = rt.dev.id;
      if (rt.kind === 'psu') {
        rt.powered = acOn(rt);
        if (rt.powered && !rt.short && !F.dev.get(id)?.psu) { add(id, '+V1', id, 24); add(id, '-V1', id, 0); }
      } else if (rt.kind === 'plc') {
        const on = acOn(rt);
        if (on && !rt.cpu.powered) { const st = plcStore(this.project, rt.dev.id); rt.cpu.powerOn(st.plc && st.plc.latched); rt.cpu.switchRun = rt.dev.state.run !== false; if (rt.cpu.switchRun) rt.cpu.setRun(true); }
        if (!on && rt.cpu.powered) { this.saveLatched(rt); rt.cpu.powerOff(); }
        if (on && !rt.short) { add(id, '+24V', id + '/24', 24); add(id, '0V', id + '/24', 0); }
        // AO: VOn = 0–10 V, IOn = 0–20 mA (a current is carried as the voltage it makes across a 250 Ω input: 20 mA = 5 V)
        if (on && rt.model.ao) for (let k = 0; k < rt.model.ao; k++) {
          const x = Math.max(0, Math.min(2000, rt.cpu.D[1116 + k]));
          add(id, 'VO' + k, id + '/a', x / 200); add(id, 'IO' + k, id + '/a', x / 400);
        }
        if (on && rt.model.ao) add(id, 'AG0', id + '/a', 0);
      } else if (rt.kind === 'vfd') {
        const on = acOn(rt, 'R/L1', 'S/L2');
        if (on && !rt.vfd.powered) rt.vfd.powerOn();
        if (!on && rt.vfd.powered) rt.vfd.powerOff();
        if (on && !rt.short) { add(id, '+24V', id + '/24', 24); add(id, 'DCM', id + '/24', 0); }
        if (on) { add(id, '+10V', id + '/a', 10); add(id, 'ACM', id + '/a', 0); add(id, 'AFM', id + '/a', rt.vfd.afm()); }
      } else if (rt.kind === 'tc' || rt.kind === 'meter') {
        rt.mb.powered = acOn(rt);
      }
    }
    // DC shorts and AC on DC
    for (const list of src.values()) {
      const ac = list.some((x) => x.ac), dc = list.some((x) => !x.ac);
      if (ac && dc) {
        const owners = new Set(list.filter((x) => x.ac).map((x) => x.own));
        for (const m of supplies) if (m.dev.state.on && owners.has(m.dev.id)) { m.dev.state.on = false; m.tripped = 'acdc'; this.event('trip', m.dev.id, `230 V AC touched the 24 V DC circuit — ${m.kind === 'mcb' ? 'MCB' : 'main breaker'} tripped`); }
      }
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.sys === b.sys && !a.ac && a.v !== b.v && (a.v === 24 || b.v === 24)) {
          const owner = this.rts.get(a.sys.split('/')[0]);
          if (owner && !owner.short) { owner.short = true; this.event('short', owner.dev.id, `${owner.def.short}: 24 V output short-circuited (+ and − connected)`); }
        }
      }
    }
    // a supply recovers once the short is removed (checked with its own sources only)
    for (const rt of this.rts.values()) {
      if (!rt.short) continue;
      const [p, n] = rt.kind === 'psu' ? ['+V1', '-V1'] : rt.kind === 'plc' ? ['+24V', '0V'] : ['+24V', 'DCM'];
      if (find(node(rt.dev.id, p)) !== find(node(rt.dev.id, n))) rt.short = false;
    }
    // 24 V DC between two terminals of a device (≥ 18 V)
    const dc24 = (id, a, b) => { const r = this.diff(id, a, id, b); return !!(r && !r.ac && r.d >= 18); };
    // the +24 V of a 3-wire device's supply (to switch onto a PNP output) and its 0 V
    const supplyOf = (id, plus = '+24', minus = '0V') => {
      const a = src.get(find(node(id, plus))), b = src.get(find(node(id, minus)));
      const x = a && a.find((q) => !q.ac && q.v >= 18), y = x && b && b.find((q) => q.sys === x.sys && !q.ac);
      return x && y ? { sys: x.sys, hi: x.v, lo: y.v } : null;
    };
    // active sensors (PNP), potentiometers, encoders and the machines' sensors
    for (const rt of this.rts.values()) {
      const id = rt.dev.id, f = F.dev.get(id);
      if (rt.kind === 'prox') {
        const r = this.diff(id, 'BN', id, 'BU');
        rt.powered = !!(r && !r.ac && r.d >= 18);
        if (rt.powered && rt.dev.state.target && !(f && f.sensor)) {
          // PNP: the output switches +24 V (BN); NPN: it switches 0 V (BU)
          const npn = deviceProps(rt.dev).output === 'NPN';
          const ra = src.get(find(node(id, npn ? 'BU' : 'BN')));
          const sup = ra && ra.find((x) => !x.ac && x.v === (npn ? 0 : 24));
          if (sup) add(id, 'BK', sup.sys, sup.v);
        }
      } else if (rt.kind === 'atx') {
        // transmitter: BK = 0 V (BU) + 10 V × the measured value within its range (or 4–20 mA)
        const r = this.diff(id, 'BN', id, 'BU');
        rt.powered = !!(r && !r.ac && r.d >= 18);
        if (rt.powered && !(f && f.sensor)) {
          const a = src.get(find(node(id, 'BN'))), b = src.get(find(node(id, 'BU')));
          const x = a && a.find((q) => !q.ac && q.v >= 18), y = x && b && b.find((q) => q.sys === x.sys && !q.ac);
          const k = Math.max(0, Math.min(1, rt.dev.state.pos ?? 0.5));
          // a 4–20 mA loop is carried as the voltage it makes across a 250 Ω input (4 mA = 1 V … 20 mA = 5 V)
          if (y) add(id, 'BK', x.sys, y.v + (deviceProps(rt.dev).signal === '4-20mA' ? (4 + 16 * k) * 0.25 : k * 10));
        }
      } else if (rt.kind === 'pot') {
        const a = src.get(find(node(id, '1'))), b = src.get(find(node(id, '3')));
        if (a && b) {
          for (const x of a) { const y = b.find((q) => q.sys === x.sys && !q.ac); if (y && !x.ac) { add(id, '2', x.sys, y.v + (rt.dev.state.pos ?? 0.5) * (x.v - y.v)); break; } }
        }
      } else if (rt.kind === 'conveyor') {
        const sup = supplyOf(id);
        rt.powered = !!sup;
        rt.sens = conveyorSensors(rt.dev);
        if (sup) for (const k of ['S1', 'S2', 'S3', 'S4']) if (rt.sens[k] && !(f && f.sensor === k)) add(id, k, sup.sys, sup.hi);
        if (rt.enc) rt.enc.powered = !!sup;
        if (sup && rt.enc) this.encoderLevels(rt, add, sup, 'A', 'B', null);
      } else if (rt.kind === 'cyl') {
        const sup = supplyOf(id);
        rt.powered = !!sup;
        const pos = rt.dev.state.pos ?? 0;
        if (sup && pos <= 0.03 && !(f && f.sensor === 'B1')) add(id, 'B1', sup.sys, sup.hi);
        if (sup && pos >= 0.97 && !(f && f.sensor === 'B2')) add(id, 'B2', sup.sys, sup.hi);
      } else if (rt.kind === 'tank') {
        const sup = supplyOf(id);
        rt.powered = !!sup;
        if (sup && !(f && f.sensor === 'LT')) add(id, 'LT', sup.sys, sup.lo + 10 * Math.max(0, Math.min(1, (rt.dev.state.level ?? 0) / TANK.H)));
      }
      if (rt.enc && (rt.kind === 'motor' || rt.kind === 'motor6')) {
        const sup = supplyOf(id, 'E+', 'E0');
        rt.enc.powered = !!sup;
        if (sup) this.encoderLevels(rt, add, sup, 'A', 'B', 'Z');
      }
    }
    this.src = src;
    // ---- loads
    for (const rt of this.rts.values()) {
      const id = rt.dev.id, f = F.dev.get(id);
      switch (rt.kind) {
        case 'plc': {
          const cpu = rt.cpu;
          for (let k = 0; k < rt.model.inputs; k++) {
            const r = diff(id, 'X' + k.toString(8), id, 'S/S');
            cpu.Xphys[k] = r && !r.same && !r.ac && Math.abs(r.d) >= 15 && !(f && f.xin === k) ? 1 : 0;
          }
          for (let ch = 0; ch < rt.model.ai; ch++) {
            // current mode when In+ is bridged to Vn+ (as in the EX2 manual): ±20 mA → ±2000, else ±10 V → ±2000
            const vr = diff(id, `V${ch}+`, id, `VI${ch}-`), ir = diff(id, `I${ch}+`, id, `VI${ch}-`);
            const mA = find(node(id, `I${ch}+`)) === find(node(id, `V${ch}+`)) || (!vr && !!ir);
            const r = mA ? ir || vr : vr;
            cpu.ai[ch] = r && !r.ac && !r.same ? Math.max(-2000, Math.min(2000, Math.round(mA ? (r.d / 0.25) * 100 : r.d * 200))) : 0;
          }
          break;
        }
        case 'ad': {
          // DVP04AD-E2: 24 V DC on 24V / 0V, then every channel as on the EX2 (I+ bridged to V+ = current input)
          const r = diff(id, '24V', id, '0V');
          const ad = rt.ad;
          ad.powered = !!(r && !r.ac && r.d >= 18);
          ad.overvolt = !!(r && r.ac);
          for (let ch = 1; ch <= 4; ch++) {
            const vr = diff(id, `V${ch}+`, id, `VI${ch}-`), ir = diff(id, `I${ch}+`, id, `VI${ch}-`);
            const mA = find(node(id, `I${ch}+`)) === find(node(id, `V${ch}+`)) || (!vr && !!ir);
            const rr = mA ? ir || vr : vr;
            ad.measure(ch - 1, rr && !rr.ac && !rr.same ? rr.d : 0);
          }
          break;
        }
        case 'mbth': {
          // 10–30 V DC between V+ and V−
          const r = diff(id, 'V+', id, 'V-');
          rt.mb.powered = !!(r && !r.ac && r.d >= 9);
          rt.overvolt = !!(r && r.ac);
          rt.reversed = !!(r && !r.ac && r.d <= -9);
          break;
        }
        case 'hmi': {
          const r = diff(id, '+', id, '-');
          const on = !!(r && !r.ac && r.d >= 18);
          if (on) rt.hmi.powerOn(); else rt.hmi.powerOff();
          break;
        }
        case 'contactor': {
          const r = diff(id, 'A1', id, 'A2');
          const ac = deviceProps(rt.dev).coil === '230AC';
          const on = !!(r && !r.same && (ac ? r.ac && Math.abs(r.d) > 150 && Math.abs(r.d) < 300 : !r.ac && Math.abs(r.d) >= 18)) && !(f && f.coil);
          rt.wrongCoil = !!(r && !r.same && (ac ? !r.ac && Math.abs(r.d) >= 18 : r.ac));
          rt.overCoil = !!(r && !r.same && ac && r.ac && Math.abs(r.d) >= 300);
          const was = rt.closed;
          rt.coil = on;
          rt.closed = on || !!rt.pressed;
          if (was !== undefined && was !== rt.closed && this.hooks.onContactor) this.hooks.onContactor(rt);
          break;
        }
        case 'relay': {
          const r = diff(id, 'A1', id, 'A2');
          rt.coil = !!(r && !r.same && !r.ac && r.d >= 18) && !(f && f.coil);
          rt.wrongCoil = !!(r && !r.same && r.ac);
          rt.reversed = !!(r && !r.same && !r.ac && r.d <= -18);
          rt.closed = rt.coil || !!rt.pressed;
          break;
        }
        case 'lamp': case 'buzzer': {
          const [a, b] = rt.kind === 'lamp' ? ['X1', 'X2'] : ['+', '-'];
          const r = diff(id, a, id, b);
          rt.on = !!(r && !r.ac && Math.abs(r.d) >= 18 && (rt.kind === 'lamp' || r.d > 0)) && !(f && f.lamp);
          rt.overvolt = !!(r && r.ac);
          break;
        }
        case 'vfd': {
          const v = rt.vfd;
          const mis = ['MI1', 'MI2', 'MI3', 'MI4', 'MI5', 'MI6', 'MI7'];
          mis.forEach((m, i) => {
            const r = diff(id, m, id, 'DCM');
            v.MI[i] = r && (r.same || (!r.ac && r.d >= 15)) ? 1 : 0;
          });
          const r = diff(id, 'AVI', id, 'ACM');
          v.avi = r && !r.ac ? Math.max(0, Math.min(10, r.d)) : 0;
          const rc = diff(id, 'ACI', id, 'ACM');
          v.aci = rc && !rc.ac ? Math.max(0, Math.min(10, rc.d)) : 0;
          break;
        }
        case 'conveyor': rt.coil = dc24(id, 'Y1', '0V') && !(f && f.coil); break;
        case 'cyl': rt.y1 = dc24(id, 'Y1', '0V') && !(f && f.coil === 'Y1'); rt.y2 = dc24(id, 'Y2', '0V') && !(f && f.coil === 'Y2'); break;
        case 'tank': {
          const r = diff(id, 'P+', id, 'P-');
          rt.pumpOn = !!(r && !r.ac && r.d >= 18) && !(f && f.coil === 'P');
          rt.pumpRev = !!(r && !r.ac && r.d <= -18);
          rt.pumpAc = !!(r && r.ac);
          const sp = diff(id, 'SPD', id, 'P-');
          rt.spd = sp && !sp.ac && !sp.same ? Math.max(0, Math.min(1, sp.d / 10)) : sp && sp.same ? 0 : 1;
          rt.pump = rt.pumpOn ? rt.spd : 0;
          rt.valve = dc24(id, 'V+', 'V-') && !(f && f.coil === 'V');
          break;
        }
        default: break;
      }
    }
    // expansion modules clip onto the right side of the last PLC on the rail: module K0, K1 … for FROM / TO
    const plcs = this.byKind('plc'), host = plcs[plcs.length - 1] || null, ads = this.byKind('ad');
    for (const p of plcs) p.cpu.ext = p === host ? ads.map((a) => a.ad) : [];
    for (const a of ads) a.ad.plc = host ? host.dev.id : null;
    // motors ↔ drives (phase order decides the direction)
    const phases = ['U/T1', 'V/T2', 'W/T3'];
    for (const v of this.byKind('vfd')) { v.vfd.motor.connected = false; v.motorId = null; v.motorOff = null; }
    // a motor behind an open contactor is wired correctly, just switched off: follow the wiring
    // through the open main contacts so the issue list does not call it "not connected"
    const open = [...this.byKind('contactor').filter((k) => !k.closed), ...this.byKind('cb').filter((k) => k.dev.state.on === false && deviceProps(k.dev).poles === '3P')];
    const through = (r0) => {
      let r = r0, by = null;
      const seen = new Set([r]);
      for (let hop = 0; hop < 4; hop++) {
        let nx = null;
        for (const k of open) for (const n of [1, 2, 3]) {
          const a = find(node(k.dev.id, 'L' + n)), b = find(node(k.dev.id, 'T' + n));
          const o = r === b ? a : r === a ? b : null;
          if (o !== null && !seen.has(o)) { nx = o; by = by || k; }
        }
        if (nx === null) break;
        r = nx; seen.add(r);
      }
      return { r, by };
    };
    for (const m of this.driveMotors()) {
      m.driver = null; m.driverConnected = false; m.offBy = null;
      if (F.dev.get(m.dev.id)?.winding !== undefined) { m.partial = true; continue; }
      if (open.length) {
        const via = ['U', 'V', 'W'].map((p) => through(find(node(m.dev.id, p))));
        const by = via.find((x) => x.by);
        if (by) for (const v of this.byKind('vfd')) {
          const vr = phases.map((p) => find(node(v.dev.id, p)));
          if (via.every((x) => vr.includes(x.r)) && new Set(via.map((x) => x.r)).size === 3) { m.offBy = by.by.dev.id; v.motorOff = m.dev.id; break; }
        }
      }
      const roots = ['U', 'V', 'W'].map((p) => find(node(m.dev.id, p)));
      for (const v of this.byKind('vfd')) {
        const vr = phases.map((p) => find(node(v.dev.id, p)));
        const perm = roots.map((r) => vr.indexOf(r));
        if (perm.some((x) => x < 0)) { if (perm.some((x) => x >= 0)) { m.driver = v.dev.id; m.partial = true; } continue; }
        if (new Set(perm).size !== 3) continue;
        let inv = 0;
        for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (perm[i] > perm[j]) inv++;
        m.driver = v.dev.id; m.driverConnected = true; m.partial = false;
        if (!v.motorId) {
          v.motorId = m.dev.id;
          v.vfd.motor.connected = true;
          v.vfd.motor.sign = inv % 2 ? -1 : 1;
          v.vfd.motor.load = Math.max(0, Math.min(2, (deviceProps(m.dev).load ?? 40) / 100));
        }
        break;
      }
    }
  }

  /** Watts the panel takes from the mains now (what the energy meter on the incomer measures). */
  panelLoad() {
    let w = 0;
    for (const rt of this.rts.values()) {
      if (rt.kind === 'vfd' && rt.vfd.powered) w += 12 + (rt.vfd.V * rt.vfd.I * 1.732 * 0.8) / 0.95;
      else if (rt.kind === 'psu' && rt.powered) w += 9;
      else if (rt.kind === 'plc' && rt.cpu.powered) w += 6;
      else if (rt.kind === 'tc' && rt.mb.powered) w += 3 + rt.mb.out * 5; // the 500 W oven heater
    }
    return w;
  }

  saveLatched(rt) {
    const st = plcStore(this.project, rt.dev.id);
    st.plc = st.plc || {};
    st.plc.latched = rt.cpu.latchedSnapshot();
  }

  /** Is a conductor carrying a supply voltage? (for the 3D wire glow) */
  connLive(c) {
    // during a fault-finding challenge the wires do not glow: the meter has to find the break
    if (!this.src || c.comm || (this.project.fault && this.project.fault.active)) return false;
    const r = this.find(this.node(c.a.dev, c.a.port));
    const s = this.src.get(r);
    return !!(s && s.some((x) => x.v > 0));
  }

  // ------------------------------------------------------------------ communication
  /** Comm networks: union of comm ports joined by cables. Returns find(dev, port) → root key. */
  commNet() {
    const conns = this.project.conns;
    if (this._cn && this._cnArr === conns && this._cnLen === conns.length) return this._cn;
    this._cn = this.buildCommNet();
    this._cnArr = conns; this._cnLen = conns.length;
    return this._cn;
  }

  buildCommNet() {
    const parent = new Map();
    const f = (k) => { while (parent.get(k) && parent.get(k) !== k) k = parent.get(k); return k; };
    for (const c of this.project.conns) {
      if (!c.comm) continue;
      const a = c.a.dev + ':' + c.a.port, b = c.b.dev + ':' + c.b.port;
      if (!parent.has(a)) parent.set(a, a);
      if (!parent.has(b)) parent.set(b, b);
      const ra = f(a), rb = f(b);
      if (ra !== rb) parent.set(rb, ra);
    }
    return (dev, port) => { const k = dev + ':' + port; return parent.has(k) ? f(k) : null; };
  }

  pcLink() {
    const plc = this.plc, pc = this.byKind('laptop')[0];
    if (!plc) return { ok: false, reason: 'There is no PLC in this lab' };
    if (!pc) return { ok: false, reason: 'There is no programming laptop in the lab' };
    const net = this.commNet();
    const a = net(pc.dev.id, 'USB'), b = net(plc.dev.id, 'USB');
    if (!a || a !== b) return { ok: false, reason: 'The USB cable between the laptop and the PLC is not connected' };
    if (!plc.cpu.powered) return { ok: false, reason: 'The PLC has no power (check L / N wiring and the MCB)' };
    return { ok: true, reason: '' };
  }

  hmiLink(rt) {
    return {
      ok: () => this.hmiLinkState.ok,
      read: (op, word) => {
        const p = this.hmiLinkState.plcRt || this.plc;
        if (!p) return null;
        if (word) return op.dev === 'T' ? p.cpu.TV[op.idx] : op.dev === 'C' ? p.cpu.CV[op.idx] : op.dev === 'D' ? p.cpu.D[op.idx] : 0;
        return p.cpu.read(op.dev, op.idx);
      },
      write: (op, v, word) => {
        const p = this.hmiLinkState.plcRt || this.plc;
        if (!p || !this.hmiLinkState.ok) return false;
        if (word) p.cpu.write(op.dev === 'T' ? 'TV' : op.dev === 'C' ? 'CV' : op.dev, op.idx, v);
        else p.cpu.write(op.dev, op.idx, v);
        const st = Number(rt.dev.props && rt.dev.props.station) || 1;
        const bytes = word ? requestBytes(st, 6, modbusAddr(op.dev, op.idx), { values: [v] }) : requestBytes(st, 5, modbusAddr(op.dev, op.idx), { values: [v] });
        const ids = this.hmiIds(rt);
        this.pushLog(this.hmiLinkState.port, 'TX', 'HMI', 'PLC', encodeFrame(bytes, 'ASCII'), `Write ${fmtAddr(op.dev, op.idx)} = ${v}`, ids.tx);
        this.pushLog(this.hmiLinkState.port, 'RX', 'PLC', 'HMI', encodeFrame(bytes, 'ASCII'), 'Echo (OK)', ids.rx);
        return true;
      },
    };
  }

  /** Device ids of an HMI ↔ PLC exchange (3D data packets). */
  hmiIds(h) {
    const st = this.hmiLinkState, p = st.plcRt || this.plc, txn = ++this.txnSeq;
    const a = { dev: h.dev.id, port: st.port }, b = { dev: p ? p.dev.id : null, port: st.plcPort || st.port };
    return { tx: { from: a.dev, fromPort: a.port, to: b.dev, toPort: b.port, txn }, rx: { from: b.dev, fromPort: b.port, to: a.dev, toPort: a.port, txn } };
  }

  updateHmiLink() {
    const h = this.hmiRt;
    const st = this.hmiLinkState;
    st.ok = false; st.reason = ''; st.port = 'COM1';
    if (!h) return;
    const props = deviceProps(h.dev);
    st.port = props.port || 'COM1';
    // the HMI talks to the PLC its cable is plugged into
    const net0 = this.commNet(), hn0 = net0(h.dev.id, st.port);
    const p = (hn0 && this.byKind('plc').find((x) => net0(x.dev.id, 'COM1') === hn0 || net0(x.dev.id, 'COM2') === hn0)) || this.plc;
    st.plcRt = p;
    if (!h.hmi.powered) { st.reason = 'HMI has no power'; return; }
    if (!p) { st.reason = 'No PLC in the lab'; return; }
    const net = this.commNet();
    const hn = net(h.dev.id, st.port);
    const other = st.port === 'COM1' ? 'COM2' : 'COM1';
    if (!hn) {
      st.reason = net(h.dev.id, other) ? `The HMI is set to ${st.port} but its cable is plugged into ${other}` : `No cable on HMI ${st.port}`;
      return;
    }
    const plcPort = net(p.dev.id, 'COM1') === hn ? 'COM1' : net(p.dev.id, 'COM2') === hn ? 'COM2' : null;
    if (!plcPort) { st.reason = `HMI ${st.port} is not connected to the PLC`; return; }
    if (!p.cpu.powered) { st.reason = 'PLC has no power'; return; }
    if (plcPort === 'COM2' && p.cpu.mbReq.size) { st.reason = 'PLC COM2 is busy as a Modbus master (MODRW) — use COM1 for the HMI'; return; }
    const station = Number(props.station ?? 1);
    if (station !== 0 && station !== (p.cpu.D[1121] || 1)) { st.reason = `HMI expects PLC station ${station}, the PLC is station ${p.cpu.D[1121]}`; return; }
    st.ok = true; st.plcPort = plcPort;
  }

  stepComm(dt) {
    this.updateHmiLink();
    const h = this.hmiRt;
    if (h) {
      const tags = h.hmi.poll(dt);
      if (tags && tags.length && this.hmiLinkState.ok) this.logHmiPoll(tags, h);
    }
    for (const p of this.byKind('plc')) this.stepCom2(p);
  }

  logHmiPoll(tags, h) {
    this.hmiPollN = (this.hmiPollN || 0) + 1;
    if (this.hmiPollN % 2) return; // keep the log readable: one poll in two
    const st = Number(deviceProps(h.dev).station ?? 1) || 1;
    const groups = new Map();
    for (const t of tags) {
      const m = /^([A-Z])(\d+)$/.exec(t.a);
      if (!m) continue;
      const dev = m[1];
      const key = (t.w ? 'w' : 'b') + dev;
      const n = dev === 'X' || dev === 'Y' ? parseInt(m[2], 8) : parseInt(m[2], 10);
      if (!groups.has(key)) groups.set(key, { dev, w: t.w, min: n, max: n });
      const g = groups.get(key); g.min = Math.min(g.min, n); g.max = Math.max(g.max, n);
    }
    const cpu = (this.hmiLinkState.plcRt || this.plc).cpu;
    for (const g of groups.values()) {
      const count = Math.min(64, g.max - g.min + 1);
      const fc = g.w ? 3 : g.dev === 'X' ? 2 : 1;
      const addr = modbusAddr(g.dev, g.min);
      const req = requestBytes(st, fc, addr, { count });
      const data = [];
      for (let i = 0; i < count; i++) data.push(g.w ? (g.dev === 'T' ? cpu.TV[g.min + i] : g.dev === 'C' ? cpu.CV[g.min + i] : cpu.D[g.min + i]) : cpu.read(g.dev, g.min + i));
      const res = responseBytes(st, fc, addr, { data });
      const port = this.hmiLinkState.port;
      const ids = this.hmiIds(h);
      this.pushLog(port, 'TX', 'HMI', 'PLC', encodeFrame(req, 'ASCII'), `${g.w ? 'Read registers' : 'Read bits'} ${fmtAddr(g.dev, g.min)} ×${count}`, ids.tx);
      this.pushLog(port, 'RX', 'PLC', 'HMI', encodeFrame(res, 'ASCII'), g.w ? data.join(', ') : data.join(''), ids.rx);
    }
  }

  /** Devices on the RS-485 bus of a PLC's COM2: drives, other PLCs and the other Modbus slaves. */
  busOf(p) {
    const net = this.commNet();
    const bus = net(p.dev.id, 'COM2');
    if (!bus) return { bus: null, vfds: [], plcs: [], slaves: [] };
    return {
      bus,
      vfds: this.byKind('vfd').filter((v) => net(v.dev.id, 'RS485') === bus),
      plcs: this.byKind('plc').filter((x) => x !== p && net(x.dev.id, 'COM2') === bus),
      slaves: [...this.rts.values()].filter((x) => x.mb && net(x.dev.id, 'RS485') === bus),
    };
  }

  /** Station address a bus device answers to. */
  stationOf(rt) {
    if (rt.kind === 'vfd') return rt.vfd.P('09-00');
    if (rt.kind === 'plc') return rt.cpu.D[1121] || 1;
    return rt.mb ? rt.mb.station : null;
  }

  /** COM2 as a Modbus master (MODRW): the slaves are drives, other PLCs and Modbus devices on the RS-485 bus. */
  stepCom2(p) {
    const m2 = p.m2;
    if (!p.cpu.running) { m2.busy = null; return; }
    const cpu = p.cpu;
    const many = this.byKind('plc').length > 1;
    const me = many ? this.plcName(p) : 'PLC';
    const link = many ? `COM2 · ${me}` : 'COM2';
    const stat = m2.stat || (m2.stat = { tx: 0, rx: 0, timeouts: 0, errors: 0 });
    if (m2.busy) {
      if (this.time < m2.busy.tEnd) return;
      const b = m2.busy;
      m2.busy = null;
      m2.last = b.req.sid;
      const ids = { from: b.rid || null, fromPort: b.rport || null, to: p.dev.id, toPort: 'COM2', txn: b.txn };
      if (b.res) {
        const respBytes = responseBytes(b.req.station, b.req.fc, b.req.addr, b.res, b.payload);
        if (b.res.exception) stat.errors++; else stat.rx++;
        if (b.responder !== 'broadcast') this.pushLog(link, b.res.exception ? 'ERR' : 'RX', b.responder, me, encodeFrame(respBytes, b.fmt.mode), b.res.exception ? `Exception ${b.res.exception}: ${EXCEPTIONS[b.res.exception] || ''}` : b.replyInfo || (b.res.data ? `Data: ${b.res.data.join(', ')}` : 'OK'), ids);
        cpu.modbusDone(b.req, b.res.exception ? { exception: b.res.exception } : { ok: true, data: b.res.data });
      } else {
        stat.timeouts++;
        this.pushLog(link, 'ERR', '—', me, '', `No response — time-out. ${b.reason || ''}`, { ...ids, from: b.rid || null, timeout: true });
        cpu.modbusDone(b.req, { timeout: true });
      }
      return;
    }
    const req = cpu.nextModbusRequest(m2.last);
    if (!req) return;
    const fmt = cpu.com2Format();
    const fc = req.fc;
    const bitsOf = (n) => Array.from({ length: n }, (_, i) => (cpu.D[req.dreg + (i >> 4)] >> (i & 15)) & 1);
    const values = req.values ? req.values : fc === 6 ? [cpu.D[req.dreg]] : fc === 16 ? Array.from({ length: req.n }, (_, i) => cpu.D[req.dreg + i]) : fc === 5 ? [cpu.D[req.dreg] ? 1 : 0] : fc === 15 ? bitsOf(req.n) : [];
    const payload = { count: req.n, values };
    const bytes = requestBytes(req.station, fc, req.addr, payload);
    const { bus, vfds, plcs, slaves } = this.busOf(p);
    // the device the frame is addressed to (for the comm log and the 3D data packets)
    const all = [...vfds, ...plcs, ...slaves];
    const target = req.station ? all.find((x) => this.stationOf(x) === req.station) || null : null;
    const answers = [];
    const why = new Map(); // device → why it did not answer
    let reason = '';
    if (!bus) reason = 'Nothing is connected to PLC COM2.';
    else {
      if (!all.length) reason = 'No drive, PLC or Modbus device on the RS-485 bus.';
      for (const v of vfds) {
        if (!v.vfd.powered) { why.set(v, `${v.def.short} has no power.`); continue; }
        const vf = vfdFormat(v.vfd.params);
        if (!formatsMatch(fmt, vf)) { why.set(v, `Format mismatch: PLC ${fmtName(fmt)} ≠ VFD ${fmtName(vf)} (check D1120/M1143 and Pr.09-01/09-04).`); continue; }
        if (req.station !== 0 && v.vfd.P('09-00') !== req.station) continue;
        const r = v.vfd.modbus({ station: req.station, fc, addr: req.addr, count: req.n, values });
        if (fc !== 3) this.persistVfd(v);
        if (r) answers.push({ res: r, name: v.def.short, rt: v, port: 'RS485', info: r.data ? describeVfdReply(req.addr, r.data) : null });
        else why.set(v, `${v.def.short} does not answer yet (starting up).`);
        const writes = (reg) => (fc === 6 || fc === 16) && reg >= req.addr && reg < req.addr + (fc === 6 ? 1 : req.n);
        if (r && writes(0x2000) && v.vfd.P('00-21') !== 2) v.ignoredCmd = this.time;
        if (r && writes(0x2001) && v.vfd.P('00-20') !== 1) v.ignoredFreq = this.time;
      }
      for (const s of plcs) {
        const name = this.plcName(s);
        if (!s.cpu.powered) { why.set(s, `${name} has no power.`); continue; }
        const sf = s.cpu.com2Format();
        if (!formatsMatch(fmt, sf)) { why.set(s, `Format mismatch: ${me} ${fmtName(fmt)} ≠ ${name} ${fmtName(sf)} (both PLCs need the same D1120 and M1143).`); continue; }
        const st = s.cpu.D[1121] || 1;
        if (req.station !== 0 && st !== req.station) continue;
        if (s.cpu.mbReq.size) { why.set(s, `${name} uses its COM2 as a master too — only one master per RS-485 bus.`); continue; }
        const r = plcSlave(s.cpu, fc, req.addr, req.n, values);
        if (r && req.station !== 0) answers.push({ res: r, name, rt: s, port: 'COM2' });
      }
      for (const s of slaves) {
        const mb = s.mb, name = this.slaveName(s);
        if (!mb.powered) { why.set(s, `${name} has no power.`); continue; }
        const sf = mb.format();
        if (!formatsMatch(fmt, sf)) { mb.stat.garbled = (mb.stat.garbled || 0) + 1; why.set(s, `Format mismatch: ${me} ${fmtName(fmt)} ≠ ${name} ${fmtName(sf)} (set the same baud rate, data format and RTU / ASCII on both).`); continue; }
        if (req.station !== 0 && mb.station !== req.station) continue;
        const r = mb.modbus({ station: req.station, fc, addr: req.addr, count: req.n, values });
        if (mb.changed) { mb.changed = false; this.slaveChanged = this.time; }
        if (r && req.station !== 0) answers.push({ res: r, name, rt: s, port: 'RS485', info: r.exception ? null : mb.describeReply({ fc, addr: req.addr }, r) });
      }
      // why nobody answered: the addressed device's own problem first
      if (!reason && !answers.length && req.station) {
        reason = (target && why.get(target))
          || [...why.values()].find((t) => /Format mismatch|master too/.test(t))
          || `No device with station address ${req.station} on the bus (${all.map((x) => `${this.busName(x)} = ${this.stationOf(x)}`).join(', ')}).`;
      }
    }
    let res = null, responder = null, ans = null;
    if (answers.length > 1) reason = `Station ${req.station} is used by ${answers.map((a) => a.name).join(' and ')} — they all answered and the replies collided (CRC error). Give every slave its own address.`;
    else if (answers.length === 1) { ans = answers[0]; res = ans.res; responder = ans.name; }
    const txn = ++this.txnSeq;
    const tgtPort = target ? (target.kind === 'plc' ? 'COM2' : 'RS485') : null;
    const info = target && target.mb ? target.mb.describe(req, values) : target && target.kind === 'plc' ? describePlcReq(req, values) : describeVfdReq(req, values);
    this.pushLog(link, 'TX', me, req.station ? `Station ${req.station}` : 'Broadcast', encodeFrame(bytes, fmt.mode), info, { from: p.dev.id, fromPort: 'COM2', to: target ? target.dev.id : null, toPort: tgtPort, txn, broadcast: !req.station });
    stat.tx++;
    const tReq = frameMs(bytes, fmt);
    const tmo = cpu.D[1129] > 0 ? cpu.D[1129] : 300;
    if (res) {
      const rb = responseBytes(req.station, fc, req.addr, res, payload);
      m2.busy = { req, res, payload, fmt, responder, rid: ans.rt.dev.id, rport: ans.port, replyInfo: ans.info, txn, tEnd: this.time + (tReq + 3 + frameMs(rb, fmt)) / 1000 };
    } else if (req.station === 0) {
      m2.busy = { req, res: { ok: true }, payload, fmt, responder: 'broadcast', txn, tEnd: this.time + (tReq + 5) / 1000 };
    } else {
      m2.busy = { req, res: null, fmt, reason, txn, rid: target ? target.dev.id : null, tEnd: this.time + (tReq + tmo) / 1000 };
    }
  }

  /** Name of a Modbus slave: "DTB4848 OVEN". */
  slaveName(rt) { const l = deviceProps(rt.dev).label; return l ? `${rt.def.short} ${l}` : rt.def.short; }

  /** One line of the comm log; ids = {from, fromPort, to, toPort, txn} device ids for the 3D data packets. */
  pushLog(link, dir, from, to, frame, info, ids = null) {
    this.log.push({ n: ++this.logSeq, t: this.time, link, dir, from, to, frame, info, ids });
    if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
  }

  event(kind, devId, text) {
    this.events.push({ t: this.time, kind, devId, text });
    if (this.hooks.onEvent) this.hooks.onEvent({ kind, devId, text });
  }

  // ------------------------------------------------------------------ diagnostics
  computeIssues() {
    const out = [];
    const add = (level, text, devId = null, fix = null) => out.push({ level, text, devId, fix });
    const devs = this.project.devices;
    if (!devs.length) return out;
    for (const m of [...this.byKind('mcb'), ...this.byKind('mains3')]) {
      const nm = m.kind === 'mcb' ? 'MCB' : 'Main breaker (3-phase)';
      if (!m.dev.state.on) add('error', m.tripped === 'short' ? `${nm} tripped: ${m.shortWhat || 'L and N'} are short-circuited. Remove the short, then switch it ON.` : m.tripped === 'acdc' ? `${nm} tripped: 230 V AC was connected to the 24 V DC circuit. Fix the wiring, then switch it ON.` : `The ${nm} is OFF — tap it in Operate mode to switch the power on.`, m.dev.id);
    }
    if (!this.byKind('mcb').length && !this.byKind('mains3').length) add('warn', 'There is no mains supply (MCB or 3-phase supply) in the lab.');
    for (const rt of this.rts.values()) {
      const name = rt.def.short;
      if (rt.short) add('error', `${name}: short circuit on the 24 V output.`, rt.dev.id);
      if (rt.overV) add('error', `${this.busName(rt)}: 400 V on its 230 V input — a 230 V device goes between ONE phase and N, not between two phases. It stays off.`, rt.dev.id);
      switch (rt.kind) {
        case 'psu': if (!rt.powered) add('warn', `${name} has no 230 V input — wire L and N from the MCB.`, rt.dev.id); break;
        case 'plc': {
          const cpu = rt.cpu;
          if (!cpu.powered) add('warn', `${name} has no power — wire L and N from the MCB.`, rt.dev.id);
          else if (!cpu.prog) add('info', `${name} has no program — write the ladder and press Download.`, rt.dev.id);
          else if (!cpu.running) add('info', `${name} is in STOP — flip its RUN/STOP switch or use RUN in the Ladder tab.`, rt.dev.id);
          if (cpu.powered && cpu.errorFlag) add('warn', `${name}: operation error (M1067), e.g. division by zero.`, rt.dev.id);
          if (cpu.powered && cpu.running && cpu.M[1129]) add('warn', 'COM2: no response from the slave (time-out). Open Monitor → Comm log for details.', rt.dev.id);
          break;
        }
        case 'hmi':
          if (!rt.hmi.powered) add('warn', 'HMI has no power — wire + and − to the 24 V supply.', rt.dev.id);
          else if (!this.hmiLinkState.ok) add('warn', `HMI: PLC no response — ${this.hmiLinkState.reason}.`, rt.dev.id);
          break;
        case 'vfd': {
          const v = rt.vfd;
          if (!v.powered) add('warn', `${name} has no power — wire R/L1 and S/L2 from the MCB.`, rt.dev.id);
          else {
            if (v.fault) add('error', `${name} fault ${v.fault}: ${FAULTS[v.fault].text}. Press STOP/RESET on the keypad.`, rt.dev.id);
            if (!rt.motorId && !rt.motorOff) add('info', `${name}: no motor on U/T1, V/T2, W/T3.`, rt.dev.id);
            if (rt.ignoredCmd && this.time - rt.ignoredCmd < 2) add('warn', `${name} ignores RS-485 RUN/STOP because Pr.00-21 is not 2.`, rt.dev.id);
            if (rt.ignoredFreq && this.time - rt.ignoredFreq < 2) add('warn', `${name} ignores the RS-485 frequency because Pr.00-20 is not 1.`, rt.dev.id);
          }
          break;
        }
        case 'motor': case 'motor6': case 'conveyor': {
          const nm = rt.kind === 'conveyor' ? `${deviceProps(rt.dev).label || 'Conveyor'} gear motor` : name;
          if (rt.fed === 'mains') {
            if (rt.hum) add('error', `${nm} hums but does not turn: a phase is missing (single phasing). The current is 5–6 × too high — the overload relay will trip.`, rt.dev.id);
            else if (rt.p > 1.2) add('error', `${nm}: its windings get ${Math.round(rt.p * rt.spec.vr)} V but are made for ${rt.spec.vr} V — ${rt.kind === 'motor' ? 'this motor is for the 220 V output of the MS300, not for the 400 V mains' : 'check the star / delta connection'}.`, rt.dev.id);
            else if (rt.p > 0.3 && rt.p < 0.75 && rt.kind === 'motor6') add('info', `${nm} runs in star: ${Math.round(rt.p * rt.spec.vr)} V per winding — about a third of the torque and of the current.`, rt.dev.id);
          } else if (rt.kind !== 'motor6' && !rt.driverConnected && !rt.offBy) add('info', rt.partial ? `${nm}: only some phases are connected.` : `${nm} is not connected to a drive or the mains.`, rt.dev.id);
          else if (rt.kind === 'motor6' && !this.project.conns.some((c) => !c.comm && (c.a.dev === rt.dev.id || c.b.dev === rt.dev.id))) add('info', `${nm} is not connected — wire U1 V1 W1 (and W2 U2 V2 for star-delta) from the contactors.`, rt.dev.id);
          if (rt.kind === 'conveyor' && !rt.powered && (deviceProps(rt.dev).feed !== 'manual' || (rt.dev.state.boxes || []).length)) add('info', `${nm.replace(' gear motor', '')}: the sensors have no 24 V — wire +24 and 0V.`, rt.dev.id);
          break;
        }
        case 'tank':
          if (rt.overflowed) add('error', `${deviceProps(rt.dev).label || 'TANK'} overflows — stop the pump at the high level (LH).`, rt.dev.id);
          if (rt.pumpRev) add('warn', `${deviceProps(rt.dev).label || 'TANK'}: pump polarity reversed — P+ is +24 V, P− is 0 V.`, rt.dev.id);
          if (rt.pumpAc) add('error', `${deviceProps(rt.dev).label || 'TANK'}: 230 V AC on the 24 V DC pump!`, rt.dev.id);
          break;
        case 'lamp': if (rt.overvolt) add('error', `${deviceProps(rt.dev).label} lamp: 230 V AC on a 24 V lamp!`, rt.dev.id); break;
        case 'contactor':
          if (rt.overCoil) add('error', `${name} ${deviceProps(rt.dev).label || ''}: 400 V on a 230 V AC coil — wire A1 to one phase and A2 to N.`, rt.dev.id);
          if (rt.wrongCoil) add('error', deviceProps(rt.dev).coil === '230AC' ? `${name} ${deviceProps(rt.dev).label || ''}: 24 V DC on a 230 V AC coil — it cannot pull in. Change the coil voltage in its settings or wire it to 230 V AC.` : `${name} ${deviceProps(rt.dev).label || ''}: 230 V AC on a 24 V DC coil! Wire A1 / A2 to 24 V DC (A2 to 0 V) or choose a 230 V AC coil.`, rt.dev.id);
          break;
        case 'relay':
          if (rt.wrongCoil) add('error', `${name} ${deviceProps(rt.dev).label || ''}: 230 V AC on a 24 V DC relay coil!`, rt.dev.id);
          else if (rt.reversed) add('warn', `${name} ${deviceProps(rt.dev).label || ''}: coil polarity reversed — A1 is +24 V, A2 is 0 V (the LED and the free-wheel diode need it).`, rt.dev.id);
          break;
        case 'cb': if (rt.dev.state.on === false) add('info', `${name} ${deviceProps(rt.dev).label || ''} is OFF — tap the lever to switch it on.`, rt.dev.id); break;
        case 'olr':
          if (rt.dev.state.tripped) add('warn', rt.thermal ? `${name} ${deviceProps(rt.dev).label || ''} tripped on overload (95–96 open): ${rt.amps > 0.05 ? `${rt.amps.toFixed(1)} A flow` : 'the motor took too much current'}, the setting is ${deviceProps(rt.dev).setting} A. Find the cause, let it cool, then tap RESET.` : `${name} ${deviceProps(rt.dev).label || ''} tripped (95–96 open). Tap its button to reset it.`, rt.dev.id);
          else if ((rt.heat || 0) > 1.05 && rt.amps > 0.05) add('warn', `${name} ${deviceProps(rt.dev).label || ''} is heating up: ${rt.amps.toFixed(1)} A for a setting of ${deviceProps(rt.dev).setting} A — it will trip.`, rt.dev.id);
          break;
        case 'tc': case 'meter':
          if (!rt.mb.powered) add('warn', `${this.slaveName(rt)} has no power — wire L and N from the MCB.`, rt.dev.id);
          else if (!this.commNet()(rt.dev.id, 'RS485')) add('info', `${this.slaveName(rt)}: its RS-485 terminals are not connected to the bus.`, rt.dev.id);
          break;
        case 'ad':
          if (rt.ad.overvolt) add('error', `${name}: 230 V AC on the 24 V DC supply of the module!`, rt.dev.id);
          else if (!rt.ad.powered) add('warn', `${name} has no power — wire its 24V to +24 V and 24G (0V) to 0 V.`, rt.dev.id);
          else if (!rt.ad.plc) add('warn', `${name}: there is no PLC for the module to clip onto.`, rt.dev.id);
          break;
        case 'mbth':
          if (rt.overvolt) add('error', `${this.slaveName(rt)}: 230 V AC on a 10–30 V DC sensor!`, rt.dev.id);
          else if (rt.reversed) add('warn', `${this.slaveName(rt)}: supply reversed — V+ is +24 V, V− is 0 V.`, rt.dev.id);
          else if (!rt.mb.powered) add('warn', `${this.slaveName(rt)} has no power — wire V+ to +24 V and V− to 0 V.`, rt.dev.id);
          else if (!this.commNet()(rt.dev.id, 'RS485')) add('info', `${this.slaveName(rt)}: its RS-485 terminals are not connected to the bus.`, rt.dev.id);
          break;
        case 'prox': case 'atx': {
          const r = this.diff && this.diff(rt.dev.id, 'BN', rt.dev.id, 'BU');
          if (r && r.ac) add('error', `${name} ${deviceProps(rt.dev).label || ''}: 230 V AC on a 24 V DC sensor!`, rt.dev.id);
          break;
        }
        default: break;
      }
    }
    // RS-485 buses: every slave its own address, every slave the master's serial format
    const seen = new Set();
    for (const p of this.byKind('plc')) {
      const { bus, vfds, plcs, slaves } = this.busOf(p);
      if (!bus || seen.has(bus)) continue;
      const master = p.cpu.powered && p.cpu.mbReq.size ? p : plcs.find((x) => x.cpu.powered && x.cpu.mbReq.size) || null;
      seen.add(bus);
      // PLCs count as slaves only when another PLC is the master of this line
      const list = [...vfds, ...slaves, ...(master ? [p, ...plcs].filter((x) => x !== master) : [])];
      const by = new Map();
      for (const x of list) { const st = this.stationOf(x); if (!by.has(st)) by.set(st, []); by.get(st).push(x); }
      for (const [st, l] of by) if (l.length > 1) add('error', `RS-485 bus: station ${st} is used by ${l.map((x) => this.busName(x)).join(' and ')} — every slave needs its own address (their replies collide).`, l[1].dev.id);
      if (master) {
        const fmt = master.cpu.com2Format();
        for (const x of slaves) if (x.mb.powered && !formatsMatch(fmt, x.mb.format())) add('warn', `${this.slaveName(x)} is set to ${fmtName(x.mb.format())}, the master ${this.busName(master)} COM2 to ${fmtName(fmt)} — it cannot read the frames.`, x.dev.id);
      }
    }
    return out;
  }

  /** Name of any device on an RS-485 bus. */
  busName(rt) { return rt.kind === 'plc' ? this.plcName(rt) : rt.mb ? this.slaveName(rt) : rt.def.short; }

  /** Short live status line. */
  summary() {
    const p = this.plc, v = this.byKind('vfd')[0];
    return {
      plc: p ? p.cpu.mode : null,
      scan: p && p.cpu.running ? p.cpu.D[1010] / 10 : null,
      hz: v && v.vfd.powered ? Math.abs(v.vfd.f) : null,
      hmi: this.hmiRt ? (this.hmiLinkState.ok ? 'ok' : this.hmiRt.hmi.powered ? 'err' : 'off') : null,
      com2: p && p.cpu.running && p.cpu.mbReq.size ? (p.cpu.M[1129] ? 'err' : 'ok') : null,
    };
  }
}

/** A DVP PLC answering on COM2 as a Modbus slave: registers D, T, C (and bits read as 0 / 1). */
function plcSlave(cpu, fc, addr, n, values) {
  const bitFc = fc === 1 || fc === 2 || fc === 5 || fc === 15;
  const at = (a) => {
    if (a >= 0x1000 && a < 0x2000) return { dev: 'D', idx: a - 0x1000 };
    if (a >= 0x9000 && a < 0x9000 + 5904) return { dev: 'D', idx: 4096 + a - 0x9000 };
    if (a >= 0x0600 && a < 0x0700) return { dev: 'T', idx: a - 0x0600, word: true };
    if (a >= 0x0E00 && a < 0x0F00) return { dev: 'C', idx: a - 0x0E00, word: true };
    if (a < 0x0400) return { dev: 'S', idx: a, bit: true };
    if (a >= 0x0800 && a < 0x0E00) return { dev: 'M', idx: a - 0x0800, bit: true };
    if (a >= 0xB000 && a < 0xB000 + 2560) return { dev: 'M', idx: 1536 + a - 0xB000, bit: true };
    if (a >= 0x0500 && a < 0x0600) return { dev: 'Y', idx: a - 0x0500, bit: true };
    if (a >= 0x0400 && a < 0x0500) return { dev: 'X', idx: a - 0x0400, bit: true };
    return null;
  };
  const count = fc === 6 || fc === 5 ? 1 : n;
  const regs = [];
  for (let i = 0; i < count; i++) { const r = at((addr + i) & 0xFFFF); if (!r || (r.dev === 'D' && (r.idx > 9999 || bitFc))) return { exception: 2 }; regs.push(r); }
  // bit functions: X / Y / M / S and the T / C contacts
  if (fc === 1 || fc === 2) return { data: regs.map((r) => (cpu.read(r.dev, r.idx) ? 1 : 0)) };
  if (fc === 5 || fc === 15) {
    regs.forEach((r, i) => { if (['Y', 'M', 'S'].includes(r.dev)) cpu.write(r.dev, r.idx, values[i] ? 1 : 0); });
    return { ok: true };
  }
  if (fc === 3) return { data: regs.map((r) => (r.dev === 'D' ? cpu.D[r.idx] : r.dev === 'T' ? cpu.TV[r.idx] : r.dev === 'C' ? cpu.CV[r.idx] : cpu.read(r.dev, r.idx)) & 0xFFFF) };
  if (fc === 6 || fc === 16) {
    regs.forEach((r, i) => {
      const v = values[i] ?? 0;
      if (r.bit) { if (r.dev !== 'X') cpu.write(r.dev, r.idx, v ? 1 : 0); } else cpu.write(r.dev === 'T' ? 'TV' : r.dev === 'C' ? 'CV' : 'D', r.idx, v);
    });
    return { ok: true };
  }
  return { exception: 1 };
}

function describePlcReq(req, values) {
  const a = req.addr;
  const name = a >= 0x1000 && a < 0x2000 ? `D${a - 0x1000}` : a >= 0x9000 && a < 0xB000 ? `D${4096 + a - 0x9000}` : a >= 0x0800 && a < 0x0E00 ? `M${a - 0x0800}` : a >= 0x0600 && a < 0x0700 ? `T${a - 0x0600}` : a >= 0x0E00 && a < 0x0F00 ? `C${a - 0x0E00}` : a.toString(16).toUpperCase() + 'H';
  if (req.fc === 3) return `Read ${name} ×${req.n}`;
  if (req.fc === 6) return `Write ${name} = ${values[0]}`;
  if (req.fc === 16) return `Write ${name}… = ${values.join(', ')}`;
  return `FC ${req.fc}`;
}

/** Reply of an MS300 to a read: "Output 30.00 Hz · 1.20 A". */
function describeVfdReply(addr, data) {
  const f = {
    0x2100: (v) => `fault ${v & 0xFF}`, 0x2101: (v) => `status ${(v & 0xFFFF).toString(16).toUpperCase()}H`, 0x2102: (v) => `F ${(v / 100).toFixed(2)} Hz`,
    0x2103: (v) => `H ${(v / 100).toFixed(2)} Hz`, 0x2104: (v) => `${(v / 100).toFixed(2)} A`, 0x2105: (v) => `DC ${(v / 10).toFixed(1)} V`, 0x2106: (v) => `${(v / 10).toFixed(1)} V`, 0x210C: (v) => `${v} rpm`,
    0x2000: (v) => `cmd ${(v & 0xFFFF).toString(16).toUpperCase()}H`, 0x2001: (v) => `F ${(v / 100).toFixed(2)} Hz`,
  };
  return data.slice(0, 4).map((v, i) => (f[addr + i] ? f[addr + i](v) : String(v))).join(' · ') + (data.length > 4 ? ' …' : '');
}

function describeVfdReq(req, values) {
  const a = req.addr;
  const hex = (n) => n.toString(16).toUpperCase().padStart(4, '0') + 'H';
  if (req.fc === 3) return `Read ${hex(a)} ×${req.n}`;
  if (req.fc === 6 || req.fc === 16) {
    const v = values[0] & 0xFFFF;
    let what = '';
    if (a === 0x2000) {
      const run = v & 3, dir = (v >> 4) & 3;
      what = [run === 1 ? 'STOP' : run === 2 ? 'RUN' : run === 3 ? 'JOG' : '', dir === 1 ? 'FWD' : dir === 2 ? 'REV' : ''].filter(Boolean).join(' ');
      if (req.fc === 16 && values.length > 1) what += ` · ${(values[1] / 100).toFixed(2)} Hz`;
    } else if (a === 0x2001) what = `${(v / 100).toFixed(2)} Hz`;
    else if (a === 0x2002) what = v & 2 ? 'fault reset' : v & 1 ? 'EF' : '';
    else if (a < 0x2000) what = `Pr.${String(a >> 8).padStart(2, '0')}-${String(a & 255).padStart(2, '0')}`;
    return `Write ${hex(a)} = ${hex(v)}${what ? ' → ' + what : ''}${req.fc === 16 ? ` (+${values.length - 1})` : ''}`;
  }
  return `FC ${req.fc}`;
}

/**
 * Delta DVP04AD-E2 analog input module: the control registers (CR) the PLC reads with FROM and
 * writes with TO. CR#0 model code, CR#1 input mode (one hex digit per channel: 0 = ±10 V, 1 = 0–10 V,
 * 2 = ±20 mA, 3 = 0–20 mA, 4 = 4–20 mA), CR#2–5 samples averaged (1–100), CR#6–9 averaged values,
 * CR#12–15 present values (full scale ±32000).
 */
export class AdModule {
  constructor() {
    this.cr = new Array(48).fill(0);
    this.cr[0] = 0x0401;
    for (let k = 0; k < 4; k++) this.cr[2 + k] = 10;
    this.hist = [[], [], [], []];
    this.powered = false;
    this.plc = null;
  }
  mode(ch) { return (this.cr[1] >> (ch * 4)) & 15; }
  /** One reading of a channel: volts between V+ (or I+, the current input) and VI−. */
  measure(ch, volts) {
    if (!this.powered) { this.cr[12 + ch] = 0; this.cr[6 + ch] = 0; this.hist[ch].length = 0; return; }
    const m = this.mode(ch);
    // a current loop is carried as the voltage it makes across the 250 Ω input (20 mA = 5 V)
    const ma = volts / 0.25;
    let v;
    switch (m) {
      case 1: v = volts * 3200; break;
      case 2: v = ma * 1600; break;
      case 3: v = ma * 1600; break;
      case 4: v = (ma - 4) * 2000; break;
      default: v = volts * 3200;
    }
    const lo = m === 1 || m === 3 || m === 4 ? 0 : -32000;
    v = Math.round(Math.max(lo, Math.min(32000, v)));
    this.cr[12 + ch] = v;
    const h = this.hist[ch], n = Math.max(1, Math.min(100, this.cr[2 + ch] || 1));
    h.push(v);
    while (h.length > n) h.shift();
    this.cr[6 + ch] = Math.round(h.reduce((a, b) => a + b, 0) / h.length);
  }
  read(i) { return i >= 0 && i < this.cr.length ? this.cr[i] : 0; }
  write(i, v) {
    if (i === 1 || (i >= 2 && i <= 5)) this.cr[i] = v & 0xFFFF;
  }
}
