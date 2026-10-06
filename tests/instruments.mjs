// Oscilloscope, logic analyser, logic probe and function generator, run headless against the engine.
import '../web/src/components/index.js';
import { SimEngine } from '../web/src/sim/engine.js';
import { getDef } from '../web/src/components/registry.js';
import { P, at, W, C } from '../web/src/examples/helpers.js';

let failed = 0;
const check = (cond, msg) => { if (!cond) { failed++; console.log('✗', msg); } else console.log('✓', msg); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

function run(parts, wires, code, ms = 400, extra) {
  const eng = new SimEngine({ code, parts, wires }, { onError: (e) => { console.log('ERR', e); failed++; }, onWarning: () => {} });
  const r = eng.start();
  if (!r.ok) { console.log('start failed', r.error); failed++; return eng; }
  let wall = 1000; eng.tick(wall);
  for (let t = 0; t < ms; t += 16) { if (extra) extra(t, eng); wall += 16; eng.tick(wall); }
  return eng;
}

// ---- scope + logic probe watching an Arduino: D8 = 1 kHz square, D9 = analogWrite(64), D10 = tone(440)
{
  const uno = P('uno-r3', 0, 0, {}, 0, 'uno');
  const sc = at('oscilloscope', 'CH1', 300, 250, {}, 0, 'sc');
  const lp = at('logic-probe', 'IN', 450, 250, {}, 0, 'lp');
  const la = at('logic-analyzer', 'D0', 500, 250, {}, 0, 'la');
  const wires = [
    W(uno, 'D8', sc, 'CH1'), W(uno, 'D9', sc, 'CH2'), W(uno, 'D10', sc, 'CH3'), W(uno, 'GND.1', sc, 'GND'),
    W(uno, 'D8', lp, 'IN'), W(uno, 'GND.1', lp, 'GND'),
    W(uno, 'D8', la, 'D0'), W(uno, 'D9', la, 'D1'), W(uno, 'GND.1', la, 'GND'),
  ];
  const code = `void setup(){ pinMode(8,OUTPUT); analogWrite(9,64); tone(10,440); }
void loop(){ digitalWrite(8,HIGH); delayMicroseconds(500); digitalWrite(8,LOW); delayMicroseconds(500); }`;
  const eng = run([uno, sc, lp, la], wires, code, 500);
  const s = eng.parts.get('sc');
  s.input('tdiv', 9);   // 1 ms/div -> 10 ms window
  const m1 = s.measure(0), m2 = s.measure(1), m3 = s.measure(2);
  check(near(m1.freq, 1000, 60) && near(m1.duty, 0.5, 0.05) && near(m1.vpp, 5, 0.1), `scope CH1: ${m1.freq.toFixed(0)} Hz ${(m1.duty * 100).toFixed(0)}% ${m1.vpp.toFixed(2)} Vpp`);
  check(near(m2.freq, 490, 40) && near(m2.duty, 0.25, 0.06), `scope CH2 (PWM): ${m2.freq.toFixed(0)} Hz ${(m2.duty * 100).toFixed(0)}%`);
  check(near(m3.freq, 440, 40) && near(m3.duty, 0.5, 0.05), `scope CH3 (tone): ${m3.freq.toFixed(0)} Hz ${(m3.duty * 100).toFixed(0)}%`);
  const p = eng.parts.get('lp');
  check(p.visual.pulse && near(p.visual.freq, 1000, 60), `logic probe: pulse=${p.visual.pulse} ${p.visual.freq.toFixed(0)} Hz`);
  const l = eng.parts.get('la');
  const lm = l.measure(0), lm1 = l.measure(1);
  check(near(lm.freq, 1000, 60) && near(lm1.freq, 490, 40), `logic analyser D0 ${lm.freq.toFixed(0)} Hz, D1 ${lm1.freq.toFixed(0)} Hz`);

  // rendering with a fake DOM element
  const els = new Map();
  const el = { querySelector: (q) => { if (!els.has(q)) els.set(q, { d: '', textContent: '', setAttribute(k, v) { this[k] = v; } }); return els.get(q); } };
  getDef('oscilloscope').update(el, s.visual);
  const tr0 = els.get('.sc-tr0'), tr1 = els.get('.sc-tr1');
  check(tr0.d && tr0.d.startsWith('M') && tr1.d.length > 100 && /Hz/.test(els.get('.sc-rd0').textContent), `scope draws traces; readout "${els.get('.sc-rd0').textContent}"`);
  check(els.get('.sc-tr3').d === '', 'unconnected channel is blank');
  const el2 = { querySelector: (q) => { if (!els.has('la' + q)) els.set('la' + q, { d: '', textContent: '', setAttribute(k, v) { this[k] = v; } }); return els.get('la' + q); } };
  getDef('logic-analyzer').update(el2, l.visual);
  check(els.get('la.la-tr0').d.includes('V') && /Hz/.test(els.get('la.la-rd0').textContent), `logic analyser draws ${els.get('la.la-rd0').textContent}`);
}

// ---- function generator -> scope + ADC
{
  const uno = P('uno-r3', 0, 0, {}, 0, 'uno');
  const fg = at('function-generator', 'OUT', 300, 250, { wave: 'sine' }, 0, 'fg');
  const sc = at('oscilloscope', 'CH1', 420, 250, {}, 0, 'sc');
  const wires = [W(fg, 'OUT', uno, 'A0'), W(fg, 'GND', uno, 'GND.1'), W(fg, 'OUT', sc, 'CH1'), W(fg, 'GND', sc, 'GND')];
  let max = -1, min = 1e9;
  const code = `int mx = 0, mn = 1023;
void setup(){ Serial.begin(9600); }
void loop(){ int v = analogRead(A0); if (v > mx) mx = v; if (v < mn) mn = v; static unsigned long t = 0; if (millis() - t > 2000) { t = millis(); Serial.print(mx); Serial.print(' '); Serial.println(mn); mx = 0; mn = 1023; } delay(10); }`;
  let serial = '';
  const eng = new SimEngine({ code, parts: [uno, fg, sc], wires }, { onSerial: (p, t) => { serial += t; }, onError: (e) => { console.log('ERR', e); failed++; }, onWarning: () => {} });
  eng.start();
  let wall = 1000; eng.tick(wall);
  eng.input('fg', 'logf', Math.log10(2));      // 2 Hz
  eng.input('fg', 'amp', 2);
  eng.input('fg', 'offset', 2.5);
  for (let t = 0; t < 2600; t += 16) { wall += 16; eng.tick(wall); }
  const lines = serial.trim().split('\n');
  const [mx, mn] = lines[0].split(' ').map(Number);
  check(mx > 840 && mx < 940 && mn > 100 && mn < 190, `ADC follows a 2 Hz sine: max ${mx} min ${mn} (expected ≈ 921 / 102)`);
  const s = eng.parts.get('sc');
  s.input('tdiv', 15);  // 100 ms/div -> 1 s window
  const m = s.measure(0);
  check(near(m.freq, 2, 0.3) && near(m.vpp, 4, 0.2), `scope sees the generator: ${m.freq.toFixed(2)} Hz ${m.vpp.toFixed(2)} Vpp`);
  // 1 kHz square: circuit sees the average, scope the true waveform
  eng.input('fg', 'logf', 3);
  for (let t = 0; t < 400; t += 16) { wall += 16; eng.tick(wall); }
  s.input('tdiv', 9);
  const g = eng.parts.get('fg');
  check(near(g.circuitValue(), 2.5, 0.01) && near(s.measure(0).freq, 1000, 60), `1 kHz sine: circuit sees ${g.circuitValue().toFixed(2)} V, scope ${s.measure(0).freq.toFixed(0)} Hz`);
}

// ---- MicroPython PWM is visible with its real frequency
{
  const esp = P('esp32-devkit', 30, 0, {}, 0, 'esp');
  const sc = at('oscilloscope', 'CH1', 300, 250, {}, 0, 'sc');
  const eng = (() => {
    const e = new SimEngine({ lang: 'python', code: `from machine import Pin, PWM\nimport time\np = PWM(Pin(4), freq=2000, duty=256)\nwhile True:\n    time.sleep(1)\n`, parts: [esp, sc], wires: [W(esp, 'D4', sc, 'CH1'), W(esp, 'GND.2', sc, 'GND')] }, { onError: (x) => { console.log('ERR', x); failed++; }, onWarning: () => {} });
    const r = e.start(); if (!r.ok) { console.log(r.error); failed++; }
    let wall = 1000; e.tick(wall); for (let t = 0; t < 300; t += 16) { wall += 16; e.tick(wall); }
    return e;
  })();
  const s = eng.parts.get('sc');
  s.input('tdiv', 8);   // 500 µs/div
  const m = s.measure(0);
  check(near(m.freq, 2000, 120) && near(m.duty, 0.25, 0.06), `MicroPython PWM(freq=2000, duty=256): ${m.freq.toFixed(0)} Hz ${(m.duty * 100).toFixed(0)}%`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall instrument tests passed');
process.exit(failed ? 1 : 0);
