// Logic ICs: 74HC595 shift register.
import { register } from './registry.js';
import { rect, circle, text, path } from './draw.js';
import { Resistor, DependentSource, vAt } from '../sim/circuit/solver.js';

const TOP = ['VCC', 'QA', 'SER', 'OE', 'RCLK', 'SRCLK', 'SRCLR', 'QH\''];
const BOT = ['QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH', 'GND'];
const LABEL = { 'QH\'': 'QH\'', SRCLR: 'MR', SRCLK: 'SH', RCLK: 'ST', SER: 'DS', OE: 'OE' };

register({
  type: '74hc595', name: '74HC595 Shift Register', category: 'ics', tags: ['74hc595', 'shift register', 'shiftout', 'output expander', 'ic'],
  description: '8-bit serial-in / parallel-out shift register. SER = data, SRCLK = shift clock, RCLK = latch. Tie OE to GND and SRCLR to 5V.',
  box: [-6, -4, 76, 34],
  pins: [...TOP.map((id, i) => ({ id, x: i * 10, y: 0, label: LABEL[id] || id })), ...BOT.map((id, i) => ({ id, x: i * 10, y: 30, label: id }))],
  render() {
    let s = rect(-5, 3, 80, 24, { fill: '#1f2023', rx: 2 });
    s += path('M-5 12 a3 3 0 0 1 0 6', { fill: '#121214' });
    for (let i = 0; i < 8; i++) { s += rect(i * 10 - 1.6, 0, 3.2, 3, { fill: '#c8ccd2' }) + rect(i * 10 - 1.6, 27, 3.2, 3, { fill: '#c8ccd2' }); }
    s += text(35, 13, '74HC595', { size: 5, fill: '#cfd2d6', font: 'monospace' });
    s += TOP.map((t, i) => text(i * 10, 7.5, LABEL[t] || t, { size: 2.6, fill: '#9ca3af' })).join('');
    s += BOT.map((t, i) => text(i * 10, 22.5, t, { size: 2.6, fill: '#9ca3af' })).join('');
    s += circle(0, 23, 1.2, { fill: '#3a3a3e' });
    return s;
  },
  sim: {
    create(ctx) {
      const vcc = ctx.node('VCC'), gnd = ctx.node('GND');
      ctx.add(new Resistor(vcc, gnd, 50000));
      const serNode = ctx.node('SER');
      const oe = ctx.node('OE');
      const sup = (V) => vAt(V, vcc) - vAt(V, gnd);
      const rt = {
        visual: { latch: 0, sr: 0 },
        sr: 0, latch: 0, qhPrev: 0, shiftT: -1,
        is595: true,
        powered() { return ctx.v(vcc) - ctx.v(gnd) > 2; },
        serIn(t) {
          if (this.upstream === undefined) {
            const up = ctx.engine.partsOnNode(serNode, (r) => r.is595 && r !== rt, 'QH\'');
            this.upstream = up.length ? up[0].rt : null;
          }
          if (this.upstream) {
            const u = this.upstream;
            return u.shiftT === t ? u.qhPrev : (u.sr >> 7) & 1;
          }
          return ctx.logic('SER');
        },
      };
      ['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH'].forEach((p, i) => ctx.add(new DependentSource(ctx.node(p), gnd, (V) => {
        const s0 = sup(V);
        if (s0 < 2 || (oe >= 0 && vAt(V, oe) - vAt(V, gnd) > s0 / 2)) return null;
        return (rt.latch >> i) & 1 ? s0 : 0;
      }, 60)));
      ctx.add(new DependentSource(ctx.node('QH\''), gnd, (V) => { const s0 = sup(V); return s0 < 2 ? null : (rt.sr >> 7) & 1 ? s0 : 0; }, 60));
      ctx.watch('SRCLK', (level, t) => {
        if (level !== 1) return;
        const clr = ctx.node('SRCLR');
        if (clr >= 0 && !ctx.logic('SRCLR')) { rt.sr = 0; return; }
        const bit = rt.serIn(t) ? 1 : 0;
        rt.qhPrev = (rt.sr >> 7) & 1;
        rt.shiftT = t;
        rt.sr = ((rt.sr << 1) | bit) & 255;
        rt.visual.sr = rt.sr;
      });
      ctx.watch('RCLK', (level) => {
        if (level !== 1) return;
        rt.latch = rt.sr;
        rt.visual.latch = rt.latch;
        ctx.dirty();
      });
      ctx.watch('SRCLR', (level) => { if (level === 0) { rt.sr = 0; rt.visual.sr = 0; } });
      return rt;
    },
  },
});
