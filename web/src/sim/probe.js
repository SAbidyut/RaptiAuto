// Signal probes for the oscilloscope, logic analyser and logic probe.
// A probe watches one circuit node and keeps a history of *segments*: a pin that the sketch drives is recorded exactly
// (level changes with their virtual-time stamps, PWM duty + frequency, tone frequency, servo pulses), a signal generator
// is stored as its analytic waveform, and any other node is sampled once per frame (linear interpolation in between).

const MAX_SEGS = 8000;

export class SignalProbe {
  /**
   * @param ctx the part's sim context (node / watch / v / vcc / engine)
   * @param pinId the part pin the probe listens on
   * @param gndPin the part's ground pin (voltages are measured against it)
   */
  constructor(ctx, pinId, gndPin = 'GND') {
    this.ctx = ctx;
    this.pinId = pinId;
    this.node = ctx.node(pinId);
    this.gnd = ctx.node(gndPin);
    this.segs = [];
    this.vcc = ctx.vcc();
    this.lastV = null;
    this.connected = this.node >= 0;
    if (this.connected) ctx.watch(pinId, (level, t, st) => this.onEvent(level, t, st));
  }

  volts() { return this.ctx.v(this.node) - this.ctx.v(this.gnd); }

  push(seg) {
    const s = this.segs;
    const last = s[s.length - 1];
    if (last && last.t === seg.t) s[s.length - 1] = seg; else s.push(seg);
    if (s.length > MAX_SEGS) s.splice(0, 1000);
  }

  snapshot(t, st) {
    const vcc = this.vcc;
    if (st.mode === 1) {
      if (st.tone) return { t, k: 'tone', f: st.tone, v: vcc };
      if (st.servoUs) return { t, k: 'servo', us: st.servoUs, v: vcc };
      if (st.pwm !== null && st.pwm > 0 && st.pwm < 1) return { t, k: 'pwm', duty: st.pwm, f: st.pwmFreq || 1000, v: vcc };
      return { t, k: 'dc', v: (st.pwm !== null ? (st.pwm >= 1 ? 1 : 0) : st.out) * vcc };
    }
    return { t, k: 'v', v: this.volts() };
  }

  onEvent(level, t, st) {
    this.push(this.snapshot(t, st));
    this.lastV = null;
  }

  /** Called once per animation frame with the current virtual time. */
  frame(t) {
    if (!this.connected) return;
    const eng = this.ctx.engine;
    const st = eng.pinSignal(this.node);
    if (st && st.mode === 1) {
      if (!this.segs.length) this.push(this.snapshot(t, st));
      return;
    }
    const gens = eng.partsOnNode(this.node, (r) => typeof r.signalAt === 'function');
    if (gens.length) {
      const rt = gens[0].rt;
      const last = this.segs[this.segs.length - 1];
      if (!last || last.k !== 'fg' || last.rt !== rt) this.push({ t, k: 'fg', rt, v: 0 });
      return;
    }
    const v = this.volts();
    const last = this.segs[this.segs.length - 1];
    if (last && last.k === 'v' && this.lastV !== null && Math.abs(v - this.lastV) < 0.002) return;
    this.lastV = v;
    this.push({ t, k: 'v', v });
  }

  /** Voltage at virtual time t (µs). */
  at(t) {
    const s = this.segs;
    if (!s.length) return 0;
    let lo = 0, hi = s.length - 1;
    if (t < s[0].t) return s[0].k === 'dc' || s[0].k === 'v' ? s[0].v : 0;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (s[mid].t <= t) lo = mid; else hi = mid - 1;
    }
    const g = s[lo], nx = s[lo + 1];
    switch (g.k) {
      case 'dc': return g.v;
      case 'v':
        if (nx && nx.k === 'v' && nx.t > g.t) return g.v + ((nx.v - g.v) * (t - g.t)) / (nx.t - g.t);
        return g.v;
      case 'pwm': { const p = 1e6 / g.f; return (t % p) / p < g.duty ? g.v : 0; }
      case 'tone': { const p = 1e6 / g.f; return (t % p) / p < 0.5 ? g.v : 0; }
      case 'servo': return t % 20000 < g.us ? g.v : 0;
      case 'fg': return g.rt.signalAt(t);
      default: return 0;
    }
  }

  /** n evenly spaced samples over [t0, t1]. */
  window(t0, t1, n) {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = this.at(t0 + ((t1 - t0) * i) / (n - 1));
    return out;
  }

  /** Time of the latest rising crossing of `level` in [tFrom - lookback, tFrom], or null. */
  findRising(level, tFrom, lookback, n = 600) {
    const step = lookback / n;
    let prev = this.at(tFrom);
    for (let i = 1; i <= n; i++) {
      const t = tFrom - i * step;
      const v = this.at(t);
      if (v < level && prev >= level) {
        // refine the crossing inside [t, t + step]
        let a = t, b = t + step;
        for (let k = 0; k < 14; k++) { const m = (a + b) / 2; if (this.at(m) >= level) b = m; else a = m; }
        return b;
      }
      prev = v;
    }
    return null;
  }

  /** Frequency / duty / min / max of the signal over [t0, t1]. */
  measure(t0, t1, thresholdV) {
    const n = 800;
    const w = this.window(t0, t1, n);
    let min = Infinity, max = -Infinity;
    for (const v of w) { if (v < min) min = v; if (v > max) max = v; }
    const thr = thresholdV !== undefined ? thresholdV : (min + max) / 2;
    const rises = [];
    let high = 0;
    for (let i = 1; i < n; i++) {
      if (w[i] >= thr) high++;
      if (w[i - 1] < thr && w[i] >= thr) {
        // linear estimate of the crossing time
        const f = (thr - w[i - 1]) / (w[i] - w[i - 1] || 1);
        rises.push(t0 + ((t1 - t0) * (i - 1 + f)) / (n - 1));
      }
    }
    let freq = 0;
    if (rises.length >= 2) freq = 1e6 / ((rises[rises.length - 1] - rises[0]) / (rises.length - 1));
    return { min, max, vpp: max - min, freq, duty: high / (n - 1), edges: rises.length };
  }
}

export const fmtFreq = (f) => (!f ? '—' : f >= 1e6 ? (f / 1e6).toFixed(2) + ' MHz' : f >= 1e3 ? (f / 1e3).toFixed(f >= 1e4 ? 1 : 2) + ' kHz' : f >= 10 ? f.toFixed(1) + ' Hz' : f.toFixed(2) + ' Hz');
export const fmtTime = (us) => (us >= 1e6 ? +(us / 1e6).toFixed(2) + ' s' : us >= 1e3 ? +(us / 1e3).toFixed(2) + ' ms' : +us.toFixed(2) + ' µs');
