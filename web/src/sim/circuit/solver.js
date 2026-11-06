// DC circuit solver (nodal analysis) with piece-wise linear diodes, BJTs and MOSFETs.
// Every node has a tiny conductance (GMIN) to absolute ground so floating sub-circuits stay solvable.

export const GMIN = 1e-9;
const G_OFF = 1e-10;

export class Solver {
  constructor() {
    this.n = 0;
    this.elements = [];
    this.nonlinear = [];
    this.G = null;
    this.I = null;
    this.V = new Float64Array(0);
    this.diag = new Float64Array(0);
    this.groundTies = []; // [node, conductance]
    this.iterations = 0;
    this.converged = true;
  }

  setNodeCount(n) {
    this.n = n;
    this.G = new Float64Array(n * n);
    this.I = new Float64Array(n);
    this.V = new Float64Array(n);
    this.diag = new Float64Array(n);
  }

  add(el) {
    this.elements.push(el);
    if (el.nonlinear) this.nonlinear.push(el);
    return el;
  }

  clear() {
    this.elements = [];
    this.nonlinear = [];
    this.groundTies = [];
  }

  // ---- stamping primitives (node -1 = absolute ground)
  g(a, b, g) {
    const G = this.G, n = this.n;
    if (a >= 0) G[a * n + a] += g;
    if (b >= 0) G[b * n + b] += g;
    if (a >= 0 && b >= 0) { G[a * n + b] -= g; G[b * n + a] -= g; }
  }
  /** Inject current i into node a (from node b). */
  inj(a, b, i) {
    if (a >= 0) this.I[a] += i;
    if (b >= 0) this.I[b] -= i;
  }
  /** Thevenin source: V(p)-V(n) = v with internal conductance g. */
  vs(p, n, v, g) {
    this.g(p, n, g);
    this.inj(p, n, v * g);
  }
  /** Voltage-controlled current source: current gm*(V(cp)-V(cn)) flows out of node x into node y. */
  vccs(x, y, cp, cn, gm) {
    const G = this.G, n = this.n;
    if (x >= 0) { if (cp >= 0) G[x * n + cp] += gm; if (cn >= 0) G[x * n + cn] -= gm; }
    if (y >= 0) { if (cp >= 0) G[y * n + cp] -= gm; if (cn >= 0) G[y * n + cn] += gm; }
  }

  assemble() {
    this.G.fill(0);
    this.I.fill(0);
    const n = this.n, G = this.G;
    for (let i = 0; i < n; i++) G[i * n + i] += GMIN;
    for (const [node, g] of this.groundTies) if (node >= 0) G[node * n + node] += g;
    for (const el of this.elements) el.stamp(this);
    for (let i = 0; i < n; i++) this.diag[i] = G[i * n + i];
  }

  /** Gaussian elimination with partial pivoting; returns false if singular. */
  gauss() {
    const n = this.n;
    if (n === 0) return true;
    const A = this.G, b = this.I, x = this.V;
    for (let k = 0; k < n; k++) {
      let piv = k, max = Math.abs(A[k * n + k]);
      for (let i = k + 1; i < n; i++) {
        const v = Math.abs(A[i * n + k]);
        if (v > max) { max = v; piv = i; }
      }
      if (max < 1e-300) return false;
      if (piv !== k) {
        for (let j = k; j < n; j++) { const t = A[k * n + j]; A[k * n + j] = A[piv * n + j]; A[piv * n + j] = t; }
        const t = b[k]; b[k] = b[piv]; b[piv] = t;
      }
      const akk = A[k * n + k];
      for (let i = k + 1; i < n; i++) {
        const f = A[i * n + k] / akk;
        if (f === 0) continue;
        const ri = i * n, rk = k * n;
        for (let j = k + 1; j < n; j++) A[ri + j] -= f * A[rk + j];
        b[i] -= f * b[k];
      }
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      const ri = i * n;
      for (let j = i + 1; j < n; j++) s -= A[ri + j] * x[j];
      x[i] = s / A[ri + i];
    }
    return true;
  }

  solve(maxIter = 60) {
    let it = 0;
    this.converged = false;
    for (; it < maxIter; it++) {
      this.assemble();
      if (!this.gauss()) { this.V.fill(0); break; }
      let changed = false;
      for (const el of this.nonlinear) if (el.update(this.V, it)) changed = true;
      if (!changed) { this.converged = true; break; }
    }
    this.iterations = it;
    const V = this.V;
    for (const el of this.elements) if (el.measure) el.measure(V);
    return this.converged;
  }

  v(node) { return node >= 0 ? this.V[node] : 0; }
}

// ------------------------------------------------------------------ elements
const vAt = (V, n) => (n >= 0 ? V[n] : 0);

export class Resistor {
  constructor(a, b, ohms) { this.a = a; this.b = b; this.setR(ohms); this.i = 0; }
  setR(ohms) { this.r = Math.max(1e-4, ohms); this.gv = 1 / this.r; }
  stamp(s) { s.g(this.a, this.b, this.gv); }
  measure(V) { this.vd = vAt(V, this.a) - vAt(V, this.b); this.i = this.vd * this.gv; }
}

/** Switch: closed -> ron, open -> roff. */
export class Switch {
  constructor(a, b, closed = false, ron = 0.02) { this.a = a; this.b = b; this.closed = closed; this.ron = ron; this.i = 0; }
  stamp(s) { s.g(this.a, this.b, this.closed ? 1 / this.ron : G_OFF); }
  measure(V) { this.i = (vAt(V, this.a) - vAt(V, this.b)) * (this.closed ? 1 / this.ron : G_OFF); }
}

/** Thevenin voltage source (p is +). Disabled sources are open circuits. */
export class VSource {
  constructor(p, n, v, r = 0.05) { this.p = p; this.n = n; this.v = v; this.r = r; this.on = true; this.i = 0; }
  stamp(s) {
    if (!this.on) { s.g(this.p, this.n, G_OFF); return; }
    s.vs(this.p, this.n, this.v, 1 / this.r);
  }
  /** i = current delivered out of the + terminal into the circuit */
  measure(V) {
    if (!this.on) { this.i = 0; return; }
    this.i = (this.v - (vAt(V, this.p) - vAt(V, this.n))) / this.r;
  }
}

/** Piece-wise linear diode / LED (anode a, cathode k). */
export class Diode {
  constructor(a, k, vf = 0.65, rd = 0.05, opts = {}) {
    this.a = a; this.k = k; this.vf = vf; this.rd = rd;
    this.on = false;
    this.nonlinear = true;
    this.i = 0;
    this.open = false; // burnt-out LED
    this.zener = opts.zener || 0;
    this.revOn = false;
  }
  stamp(s) {
    if (this.open) { s.g(this.a, this.k, G_OFF); return; }
    if (this.on) s.vs(this.a, this.k, this.vf, 1 / this.rd);
    else if (this.revOn) s.vs(this.k, this.a, this.zener, 1 / this.rd);
    else s.g(this.a, this.k, G_OFF);
  }
  update(V, it) {
    if (this.open) return false;
    const vd = vAt(V, this.a) - vAt(V, this.k);
    let changed = false;
    if (this.on) {
      const i = (vd - this.vf) / this.rd;
      if (i < -1e-9) { this.on = false; changed = true; }
    } else if (vd > this.vf + 1e-6) { this.on = true; changed = true; }
    if (this.zener) {
      if (this.revOn) {
        if (-vd < this.zener - 1e-6) { this.revOn = false; changed = true; }
      } else if (-vd > this.zener + 1e-6) { this.revOn = true; changed = true; }
    }
    // avoid endless oscillation
    if (changed && it > 40) return false;
    return changed;
  }
  measure(V) {
    const vd = vAt(V, this.a) - vAt(V, this.k);
    this.vd = vd;
    if (this.open) { this.i = 0; return; }
    if (this.on) this.i = Math.max(0, (vd - this.vf) / this.rd);
    else if (this.revOn) this.i = -Math.max(0, (-vd - this.zener) / this.rd);
    else this.i = vd * G_OFF;
  }
}

/** NPN / PNP bipolar transistor: cutoff / active (beta) / saturation. */
export class BJT {
  constructor(b, c, e, { beta = 120, pnp = false } = {}) {
    this.b = b; this.c = c; this.e = e; this.beta = beta; this.pnp = pnp;
    this.vbe = 0.68; this.rbe = 60; this.vcesat = 0.15; this.rsat = 0.4;
    this.state = 0; // 0 cutoff, 1 active, 2 saturated
    this.nonlinear = true;
    this.ib = 0; this.ic = 0;
  }
  stamp(s) {
    const sg = this.pnp ? -1 : 1;
    const { b, c, e } = this;
    s.g(c, e, 1e-7);
    if (this.state === 0) { s.g(b, e, G_OFF); return; }
    // base-emitter junction: V(b)-V(e) = vbe (npn) / V(e)-V(b) = vbe (pnp)
    if (sg > 0) s.vs(b, e, this.vbe, 1 / this.rbe); else s.vs(e, b, this.vbe, 1 / this.rbe);
    if (this.state === 1) {
      const gm = this.beta / this.rbe;
      if (sg > 0) {
        // Ic = gm*(Vb-Ve) - beta*vbe/rbe flowing c -> e
        s.vccs(c, e, b, e, gm);
        s.inj(c, e, this.beta * this.vbe / this.rbe);
      } else {
        // PNP: current flows e -> c, Ic = gm*(Ve-Vb) - beta*vbe/rbe
        s.vccs(e, c, e, b, gm);
        s.inj(e, c, this.beta * this.vbe / this.rbe);
      }
    } else if (sg > 0) s.vs(c, e, this.vcesat, 1 / this.rsat);
    else s.vs(e, c, this.vcesat, 1 / this.rsat);
  }
  update(V, it) {
    const sg = this.pnp ? -1 : 1;
    const vb = vAt(V, this.b), vc = vAt(V, this.c), ve = vAt(V, this.e);
    const vbe = sg * (vb - ve), vce = sg * (vc - ve);
    let ns = this.state;
    if (this.state === 0) {
      if (vbe > this.vbe + 1e-6) ns = 1;
    } else {
      const ib = (vbe - this.vbe) / this.rbe;
      if (ib < -1e-9) ns = 0;
      else if (this.state === 1) {
        if (vce < this.vcesat) ns = 2;
      } else if (this.state === 2) {
        const ic = (vce - this.vcesat) / this.rsat;
        if (ic > this.beta * ib + 1e-6) ns = 1;
      }
    }
    if (ns !== this.state && it < 45) { this.state = ns; return true; }
    return false;
  }
  measure(V) {
    const sg = this.pnp ? -1 : 1;
    const vb = vAt(V, this.b), vc = vAt(V, this.c), ve = vAt(V, this.e);
    const vbe = sg * (vb - ve), vce = sg * (vc - ve);
    this.ib = this.state ? Math.max(0, (vbe - this.vbe) / this.rbe) : 0;
    if (this.state === 1) this.ic = this.beta * this.ib;
    else if (this.state === 2) this.ic = Math.max(0, (vce - this.vcesat) / this.rsat);
    else this.ic = 0;
    this.vce = vce;
  }
}

/** N / P channel MOSFET as a gate-controlled conductance. */
export class Mosfet {
  constructor(g, d, s, { vth = 2.5, ron = 0.1, vfull = 10, pch = false } = {}) {
    this.gN = g; this.d = d; this.s = s; this.vth = vth; this.ron = ron; this.vfull = vfull; this.pch = pch;
    this.cond = G_OFF;
    this.nonlinear = true;
    this.i = 0;
  }
  calc(V) {
    const sg = this.pch ? -1 : 1;
    const vgs = sg * (vAt(V, this.gN) - vAt(V, this.s));
    if (vgs <= this.vth) return G_OFF;
    const k = 1 / (this.ron * (this.vfull - this.vth));
    return Math.min(1 / this.ron * 1.5, k * (vgs - this.vth)) + G_OFF;
  }
  stamp(s) {
    s.g(this.d, this.s, this.cond);
    s.g(this.gN, -1, 1e-12);
  }
  update(V, it) {
    const c = this.calc(V);
    if (Math.abs(c - this.cond) > 1e-6 * Math.max(1, c) && it < 45) { this.cond = c; return true; }
    return false;
  }
  measure(V) { this.i = (vAt(V, this.d) - vAt(V, this.s)) * this.cond; }
}

/**
 * Switch whose state is decided from node voltages inside the solver iteration
 * (relay contacts, analog switches). predicate(V) -> boolean.
 */
export class ControlledSwitch {
  constructor(a, b, predicate, ron = 0.05) {
    this.a = a; this.b = b; this.predicate = predicate; this.ron = ron;
    this.closed = false;
    this.nonlinear = true;
    this.i = 0;
  }
  stamp(s) { s.g(this.a, this.b, this.closed ? 1 / this.ron : G_OFF); }
  update(V, it) {
    const c = !!this.predicate(V);
    if (c !== this.closed && it < 45) { this.closed = c; return true; }
    return false;
  }
  measure(V) { this.i = (vAt(V, this.a) - vAt(V, this.b)) * (this.closed ? 1 / this.ron : G_OFF); }
}

/**
 * Push-pull output stage (motor drivers, logic outputs). decide(V) -> 1 (drive to vpos), 0 (drive to vneg), null (high-Z).
 * The supply rails are nodes, so the driver only works when it is powered.
 */
export class HalfBridge {
  constructor(out, vpos, vneg, decide, { r = 1.5, drop = 1.0 } = {}) {
    this.out = out; this.vpos = vpos; this.vneg = vneg; this.decide = decide; this.r = r; this.drop = drop;
    this.state = null;
    this.nonlinear = true;
    this.i = 0;
    this.a = out; this.b = -2; // for activity bookkeeping
  }
  stamp(s) {
    const g = 1 / this.r;
    if (this.state === 1) {
      // out follows vpos minus a saturation drop: stamp as Thevenin between out and vpos
      s.vs(this.out, this.vpos, -this.drop, g);
    } else if (this.state === 0) {
      s.vs(this.out, this.vneg, this.drop * 0.5, g);
    } else s.g(this.out, this.vneg, G_OFF);
  }
  update(V, it) {
    const st = this.decide(V);
    const ns = st === null || st === undefined ? null : st ? 1 : 0;
    if (ns !== this.state && it < 45) { this.state = ns; return true; }
    return false;
  }
  measure(V) {
    const g = 1 / this.r;
    if (this.state === 1) this.i = ((vAt(V, this.vpos) - this.drop) - vAt(V, this.out)) * g;
    else if (this.state === 0) this.i = ((vAt(V, this.vneg) + this.drop * 0.5) - vAt(V, this.out)) * g;
    else this.i = 0;
  }
}

export { vAt };

/**
 * Voltage source whose value is computed from the node voltages inside the solver iteration
 * (sensor outputs that depend on their supply, logic outputs of powered chips).
 * fn(V) -> volts (relative to `ref`) or null for high impedance.
 */
export class DependentSource {
  constructor(out, ref, fn, r = 100) {
    this.p = out; this.n = ref; this.fn = fn; this.r = r;
    this.v = null;
    this.nonlinear = true;
    this.i = 0;
  }
  stamp(s) {
    if (this.v === null) s.g(this.p, this.n, G_OFF);
    else s.vs(this.p, this.n, this.v, 1 / this.r);
  }
  update(V, it) {
    let nv = this.fn(V);
    if (nv !== null && !Number.isFinite(nv)) nv = 0;
    const changed = nv === null ? this.v !== null : this.v === null || Math.abs(nv - this.v) > 1e-4;
    if (changed && it < 45) { this.v = nv; return true; }
    return false;
  }
  measure(V) {
    this.i = this.v === null ? 0 : (this.v - (vAt(V, this.p) - vAt(V, this.n))) / this.r;
  }
}
