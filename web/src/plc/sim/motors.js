// Induction motors on the mains. The voltage of every winding comes from the supply phasors on its
// terminals (a star point, an open winding or a lost phase is solved like a network of equal
// impedances), the windings' positive and negative sequence give the torque and the direction, a
// torque–slip curve gives the speed, and the slip gives the current (about 6 × the rated current
// at standstill). Drives (MS300) keep feeding their motor in system.js; this is the direct-on-line,
// reversing and star-delta side of the lab.

const DEG = Math.PI / 180;
const SQ3 = Math.sqrt(3);
// complex numbers as [re, im]
const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cscale = (a, k) => [a[0] * k, a[1] * k];
export const cabs = (a) => Math.hypot(a[0], a[1]);
const A1 = [Math.cos(120 * DEG), Math.sin(120 * DEG)];
const A2 = [Math.cos(240 * DEG), Math.sin(240 * DEG)];
export const polar = (v, deg) => [v * Math.cos(deg * DEG), v * Math.sin(deg * DEG)];

/**
 * Electrical data of the motors. `windings` are the terminal pairs of the three windings in the
 * order of their place in the stator (0°, 120°, 240°); '*' is a star point inside the motor.
 * vr = rated voltage of one winding, iw = its rated current, nr = rated speed (4 poles: 1500 rpm
 * synchronous), H = run-up time constant (s), pn = rated power (W).
 */
export function motorSpec(kind, props = {}) {
  if (kind === 'motor6') {
    const w = [['U1', 'U2'], ['V1', 'V2'], ['W1', 'W2']];
    return { vr: 400, iw: 3.4 / SQ3, inLine: 3.4, nr: 1440, pn: 1500, H: 0.85, windings: w, links: props.links || 'delta' };
  }
  if (kind === 'conveyor') {
    if (props.conn === 'Y400') return { vr: 230, iw: 0.75, inLine: 0.75, nr: 1380, pn: 250, H: 0.35, windings: [['U', '*'], ['V', '*'], ['W', '*']], gear: true };
    return { vr: 230, iw: 1.3 / SQ3, inLine: 1.3, nr: 1380, pn: 250, H: 0.35, windings: [['U', 'V'], ['V', 'W'], ['W', 'U']], gear: true };
  }
  // the 0.75 kW drive motor (220 V Δ inside)
  return { vr: 220, iw: 3.2 / SQ3, inLine: 3.2, nr: 1420, pn: 750, H: 0.6, windings: [['U', 'V'], ['V', 'W'], ['W', 'U']] };
}

/** Terminals joined by the link bars in the terminal box of a 6-terminal motor. */
export function motorLinks(spec) {
  if (spec.links === 'delta') return [['U1', 'W2'], ['V1', 'U2'], ['W1', 'V2']];
  if (spec.links === 'star') return [['W2', 'U2'], ['U2', 'V2']];
  return [];
}

// torque–slip and current–slip curves: rotor resistance r ≈ rated slip, leakage reactance x
function curves(spec) {
  if (spec._c) return spec._c;
  const sn = 1 - spec.nr / 1500, r = sn * 0.99, x = 0.14;
  const T0 = (s) => (r * s) / (r * r + s * s * x * x);
  const I0 = (s) => (s === 0 ? 0 : 1 / Math.hypot(r / s, x));
  const kt = 1 / T0(sn), ki = 1 / I0(sn);
  spec._c = { T: (s) => kt * T0(s), I: (s) => ki * I0(Math.abs(s)) };
  return spec._c;
}

/** Torque (per unit of the rated torque) at speed w (per unit of 1500 rpm) for sequence voltages p, n. */
export function motorTorque(spec, p, n, w) {
  const c = curves(spec);
  return p * p * c.T(1 - w) - n * n * c.T(1 + w);
}

/** Line-side current per unit of the rated current for sequence voltages p, n at speed w. */
export function motorCurrentPu(spec, p, n, w) {
  const c = curves(spec);
  const ip = p * Math.hypot(0.35, c.I(1 - w)), inn = n * Math.hypot(0.35, c.I(1 + w));
  return ip + inn;
}

/**
 * Voltages of the three windings (phasors) for a motor whose terminals sit on the given nets.
 * `at(port)` → net key, `phasor(key)` → [re, im] or null when nothing drives the net; '*' is the
 * motor's own star point. Undriven nets (a star point, a lost phase) take the mean of their
 * neighbours — equal winding impedances.
 */
export function windingVoltages(spec, at, phasor, open = -1) {
  const ws = spec.windings.map(([a, b], j) => ({ a: a === '*' ? '*' : at(a), b: b === '*' ? '*' : at(b), j })).filter((w) => w.j !== open);
  const known = new Map(), unknown = new Map();
  for (const w of ws) for (const k of [w.a, w.b]) {
    if (known.has(k) || unknown.has(k)) continue;
    const v = k === '*' ? null : phasor(k);
    if (v) known.set(k, v); else unknown.set(k, [0, 0]);
  }
  for (let it = 0; it < 30 && unknown.size; it++) {
    for (const [u] of unknown) {
      let s = [0, 0], cnt = 0;
      for (const w of ws) {
        if (w.a === w.b) continue;
        const o = w.a === u ? w.b : w.b === u ? w.a : null;
        if (o === null) continue;
        s = cadd(s, known.get(o) || unknown.get(o)); cnt++;
      }
      if (cnt) unknown.set(u, cscale(s, 1 / cnt));
    }
  }
  const val = (k) => known.get(k) || unknown.get(k) || [0, 0];
  const out = [[0, 0], [0, 0], [0, 0]];
  for (const w of ws) out[w.j] = csub(val(w.a), val(w.b));
  return out;
}

/** Positive and negative sequence of three winding voltages, per unit of the rated winding voltage. */
export function sequences(vw, vr) {
  const v1 = cscale(cadd(cadd(vw[0], cmul(A1, vw[1])), cmul(A2, vw[2])), 1 / 3);
  const v2 = cscale(cadd(cadd(vw[0], cmul(A2, vw[1])), cmul(A1, vw[2])), 1 / 3);
  return { p: cabs(v1) / vr, n: cabs(v2) / vr };
}

/**
 * One time step of a motor on the mains: rt.w (speed, per unit of 1500 rpm) runs up or down,
 * rt.rpm, rt.amps (largest line current, A) and rt.termI (current into each terminal, phasors)
 * follow. `vw` = winding voltages (phasors).
 */
export function stepMotor(rt, spec, vw, load, dt) {
  const { p, n } = sequences(vw, spec.vr);
  let w = rt.w || 0;
  const Te = motorTorque(spec, p, n, w);
  const TL = (load + 0.03) * Math.tanh(w / 0.01) + 0.05 * w;
  if (Math.abs(w) < 2e-3 && Math.abs(Te) <= load + 0.03) w = 0; // the load holds a motor that cannot break away
  else w += ((Te - TL) / spec.H) * dt;
  if (!Number.isFinite(w)) w = 0;
  w = Math.max(-1.05, Math.min(1.05, w));
  rt.w = w;
  rt.rpm = w * 1500;
  rt.p = p; rt.n = n; rt.torque = Te;
  // winding currents: each winding's voltage share of the per-unit current
  const ipu = motorCurrentPu(spec, p, n, w) / Math.max(1e-6, p + n);
  const termI = new Map();
  let amps = 0;
  rt.wv = vw.map((v) => cabs(v));
  spec.windings.forEach(([a, b], j) => {
    const mag = (cabs(vw[j]) / spec.vr) * ipu * spec.iw;
    const ang = Math.atan2(vw[j][1], vw[j][0]);
    const I = polar(mag, ang / DEG);
    if (a !== '*') termI.set(a, cadd(termI.get(a) || [0, 0], I));
    if (b !== '*') termI.set(b, csub(termI.get(b) || [0, 0], I));
  });
  for (const I of termI.values()) amps = Math.max(amps, cabs(I));
  rt.termI = termI;
  rt.amps = amps;
  rt.hum = (p + n) > 0.3 && n > 0.45 * p && Math.abs(w) < 0.05; // single phasing: hums, does not start
  return rt;
}

/** A motor no supply reaches: it coasts down. */
export function coastMotor(rt, spec, load, dt) {
  return stepMotor(rt, spec, [[0, 0], [0, 0], [0, 0]], load, dt);
}

/** Balanced terminal currents of a drive-fed motor (A): U / V / W 120° apart. */
export function driveCurrents(ports, amps) {
  return new Map(ports.map((p, i) => [p, polar(amps, -120 * i)]));
}

export { cadd, csub };
