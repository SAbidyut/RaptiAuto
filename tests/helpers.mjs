// Test helpers: run a sketch headless against a mock hardware layer.
import { SketchRunner } from '../web/src/sim/lang/runtime.js';
import { makeCore } from '../web/src/sim/lang/core.js';

export const UNO = {
  id: 'uno', arch: 'avr', mhz: 16, vcc: 5, adcBits: 10, ledBuiltin: 13,
  analogPins: [14, 15, 16, 17, 18, 19], analogChannelBase: 14, interruptPins: [2, 3],
  serialPorts: ['Serial'], eeprom: 1024, numDigital: 20, ram: 2048,
};
export const ESP32 = {
  id: 'esp32', arch: 'xtensa', family: 'esp32', mhz: 240, vcc: 3.3, adcBits: 12, ledBuiltin: 2,
  analogPins: [36, 39, 34, 35, 32, 33], gpioAnalog: true, serialPorts: ['Serial', 'Serial1', 'Serial2'], eeprom: 512,
};

export function runSketch(code, { board = UNO, ms = 1000, inputs = {}, analog = {}, serialIn = '', extraNatives } = {}) {
  let out = '';
  const writes = [];
  const warnings = [];
  const state = { modes: {}, pins: {} };
  const hw = {
    pinMode(p, m) { state.modes[p] = m; },
    digitalWrite(p, v) { state.pins[p] = v; writes.push([runner.rt.t, p, v]); },
    digitalRead(p) {
      if (typeof inputs[p] === 'function') return inputs[p](runner.rt.t);
      if (inputs[p] !== undefined) return inputs[p];
      if (state.modes[p] === 2) return 1;
      return state.pins[p] ?? 0;
    },
    analogRead(p) { const v = analog[p]; return typeof v === 'function' ? v(runner.rt.t) : (v ?? 0); },
    analogWrite(p, duty, raw) { state.pins[p] = { pwm: raw }; writes.push([runner.rt.t, p, 'pwm', raw]); },
    tone(p, f, d) { writes.push([runner.rt.t, p, 'tone', f, d]); },
    noTone(p) { writes.push([runner.rt.t, p, 'notone']); },
    pulseIn() { return { start: 100, width: 580 }; },
    attachInterrupt(p, fn, mode) { state.isr = { p, fn, mode }; },
    detachInterrupt() {},
    serialOut(port, s) { out += s; },
  };
  const runner = new SketchRunner({
    code, board,
    natives: (rt) => {
      const n = makeCore(rt, hw, board);
      if (extraNatives) extraNatives(n, rt, hw);
      return n;
    },
    onWarning: (m) => warnings.push(m),
  });
  const c = runner.compile();
  if (!c.ok) return { compileError: c.error, out, writes, warnings };
  runner.start();
  if (serialIn) for (const s of runner.natives.serials) if (s.port === 'Serial') s.feed(serialIn);
  let t = 0;
  let status = 'ok';
  while (t < ms * 1000) {
    t += 16000;
    status = runner.step(Math.min(t, ms * 1000), 2000);
    if (status !== 'ok') break;
  }
  return { out, writes, warnings, status, error: runner.error, runner, state, compileWarnings: c.warnings };
}
