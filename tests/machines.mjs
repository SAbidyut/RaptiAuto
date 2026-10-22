// Headless tests of the motor starters, the process models, the encoder, fault finding and the SFC
// view of the PLC lab: node tests/machines.mjs
import { LabSystem } from '../web/src/plc/sim/system.js';
import { buildExample } from '../web/src/plc/examples.js';
import { motorSpec, windingVoltages, sequences, polar } from '../web/src/plc/sim/motors.js';
import { faultCandidates, pickFaults, sameFault, measure } from '../web/src/plc/sim/faults.js';
import { sfcModel } from '../web/src/plc/ui/sfc-view.js';
import { LAB_TASKS } from '../web/src/plc/tasks.js';

let failures = 0;
function check(name, cond, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? '✓' : '✗'} ${name}${!cond && detail ? ' — ' + detail : ''}`);
}

function sim(id, mutate) {
  const P = buildExample(id);
  if (mutate) mutate(P);
  const s = new LabSystem(P);
  const run = (sec) => { for (let t = 0; t < sec; t += 0.02) s.step(20); };
  const press = (dev, sec = 0.3) => { s.act(dev, 'press', true); run(sec); s.act(dev, 'press', false); };
  const rt = (x) => s.rts.get(x);
  return { P, s, run, press, rt, cpu: () => s.plc.cpu };
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const errors = (s) => s.computeIssues().filter((i) => i.level === 'error').map((i) => i.text);

// ---------------------------------------------------------------- motor model
{
  const spec = motorSpec('motor6', { links: 'delta' });
  const L = { L1: polar(230, 0), L2: polar(230, -120), L3: polar(230, 120) };
  const conn = (map) => (port) => map[port];
  const ph = (k) => L[k] || null;
  const delta = sequences(windingVoltages(spec, conn({ U1: 'L1', W2: 'L1', V1: 'L2', U2: 'L2', W1: 'L3', V2: 'L3' }), ph), spec.vr);
  check('delta: 400 V on every winding (p = 1, n = 0)', near(delta.p, 1, 0.02) && delta.n < 0.01, JSON.stringify(delta));
  const star = sequences(windingVoltages(spec, conn({ U1: 'L1', V1: 'L2', W1: 'L3', U2: 'S', V2: 'S', W2: 'S' }), ph), spec.vr);
  check('star: 230 V per winding (p = 0.577)', near(star.p, 0.577, 0.02) && star.n < 0.01, JSON.stringify(star));
  const lost = sequences(windingVoltages(spec, conn({ U1: 'L1', V1: 'L2', W1: 'X', U2: 'S', V2: 'S', W2: 'S' }), ph), spec.vr);
  check('lost phase: negative sequence as large as the positive one', lost.n > 0.8 * lost.p && lost.p > 0.2, JSON.stringify(lost));
  const rev = sequences(windingVoltages(spec, conn({ U1: 'L3', W2: 'L3', V1: 'L2', U2: 'L2', W1: 'L1', V2: 'L1' }), ph), spec.vr);
  check('L1 ↔ L3 swapped: negative sequence (reverse)', near(rev.n, 1, 0.02) && rev.p < 0.01, JSON.stringify(rev));
}

// ---------------------------------------------------------------- DOL reversing starter
{
  const e = sim('dol-reversing');
  e.run(1);
  check('dol: no wiring errors', !errors(e.s).length, errors(e.s).join('; '));
  e.press('fwd'); e.run(2);
  check('dol: FWD runs the motor at ~1477 rpm', near(e.rt('m').rpm, 1477, 15), e.rt('m').rpm);
  check('dol: running current ≈ 1.75 A (light load)', near(e.rt('m').amps, 1.75, 0.3) && near(e.rt('f1').amps, e.rt('m').amps, 0.05), `${e.rt('m').amps} / ${e.rt('f1').amps}`);
  e.press('rev'); e.run(0.5);
  check('dol: REV while running forward is interlocked', !e.rt('km2').closed && e.rt('km1').closed);
  e.press('stop'); e.run(2); e.press('rev'); e.run(3);
  check('dol: REV turns the motor the other way', e.rt('m').rpm < -1450, e.rt('m').rpm);
  e.P.devices.find((d) => d.id === 'f1').props.setting = 0.5;
  e.run(30);
  check('dol: F1 at 0.5 A trips (class 10) and stops the motor', e.rt('f1').dev.state.tripped && e.rt('f1').thermal && !e.rt('km2').closed);
  check('dol: OVERLOAD lamp lights', !!e.rt('lt').on);
  e.run(4);
  check('dol: motor coasts to a stop', Math.abs(e.rt('m').rpm) < 50, e.rt('m').rpm);
}
{
  // KM2 in by hand while KM1 is closed: L1 – L3 short
  const e = sim('dol-reversing');
  e.run(1); e.press('fwd'); e.run(1);
  e.s.act('km2', 'press', true); e.run(0.1);
  check('dol: KM1 + KM2 together short L1–L3 → main breaker trips', e.rt('q1').tripped === 'short' && !e.rt('q1').dev.state.on, e.rt('q1').tripped);
}

// ---------------------------------------------------------------- star-delta
{
  const e = sim('star-delta');
  e.run(1);
  check('star-delta: no wiring errors', !errors(e.s).length, errors(e.s).join('; '));
  e.press('start'); e.run(2);
  const m = e.rt('m');
  check('star-delta: starts in star (KM1 + KM3, p ≈ 0.57)', e.rt('km1').closed && e.rt('km3').closed && !e.rt('km2').closed && near(m.p, 0.577, 0.03), m.p);
  const starAmps = m.amps;
  e.run(4);
  check('star-delta: after T0 (5 s) KM3 opens and KM2 closes', !e.rt('km3').closed && e.rt('km2').closed);
  check('star-delta: delta = full voltage, ~1480 rpm', near(m.p, 1, 0.03) && m.rpm > 1450, `${m.p} ${m.rpm}`);
  check('star-delta: star current ≈ 1/3 of the delta current at the same load slip', starAmps < m.amps, `${starAmps} vs ${m.amps}`);
  check('star-delta: F1 in the winding branch carries 0.58 × the line current', near(e.rt('f1').amps / m.amps, 0.577, 0.05), `${e.rt('f1').amps} / ${m.amps}`);
  e.s.act('km3', 'press', true); e.run(0.1);
  check('star-delta: KM3 by hand in delta shorts the phases → main breaker trips', e.rt('q1').tripped === 'short');
}
{
  // a lost phase: the motor hums in star and F1 trips
  const e = sim('star-delta', (P) => { P.conns = P.conns.filter((c) => !((c.a.dev === 'f1' && c.a.port === 'T3') || (c.b.dev === 'f1' && c.b.port === 'T3'))); });
  e.run(1); e.press('start'); e.run(1.5);
  check('star-delta: single phasing — the motor hums and does not start', e.rt('m').hum && Math.abs(e.rt('m').rpm) < 50, `${e.rt('m').hum} ${e.rt('m').rpm}`);
  e.run(25);
  check('star-delta: single phasing trips F1', !!e.rt('f1').thermal);
}

// ---------------------------------------------------------------- conveyor
{
  const e = sim('conveyor-sort');
  e.run(1);
  check('conveyor: no wiring errors', !errors(e.s).length, errors(e.s).join('; '));
  const seen = [0, 0, 0, 0];
  e.press('start');
  for (let i = 0; i < 120; i++) { e.run(0.25); for (let k = 0; k < 4; k++) if (e.cpu().X[k]) seen[k]++; }
  const st = e.rt('conv').dev.state;
  check('conveyor: the drive runs the belt', e.rt('conv').belt > 150, e.rt('conv').belt);
  check('conveyor: all four sensors see boxes', seen.every((n) => n > 0), JSON.stringify(seen));
  check('conveyor: metal boxes are pushed off, plastic ones reach the end', st.rejected >= 1 && st.done >= 3, `rejected ${st.rejected}, done ${st.done}`);
  check('conveyor: counters C0 / C1 follow the boxes', e.cpu().CV[0] >= 3 && e.cpu().CV[1] >= 1, `${e.cpu().CV[0]} ${e.cpu().CV[1]}`);
}

// ---------------------------------------------------------------- tank
{
  const e = sim('tank-level');
  e.run(1);
  check('tank: no wiring errors', !errors(e.s).length, errors(e.s).join('; '));
  let full = false;
  for (let i = 0; i < 90 && !full; i++) { e.run(1); full = !!e.cpu().X[1]; }
  check('tank: the pump fills the tank up to the high float', full);
  e.run(1);
  check('tank: the pump stops at the high float', !e.cpu().Y[0] && e.rt('tank').pump < 0.05);
  check('tank: level transmitter → D100 in %', near(e.cpu().D[100], e.rt('tank').dev.state.level / 3.6, 3), `${e.cpu().D[100]} ${e.rt('tank').dev.state.level}`);
  e.s.act('tank', 'demand', 0.8);
  let again = false, low = false;
  for (let i = 0; i < 15000 && !again; i++) { e.s.step(20); low = low || !e.cpu().X[0]; again = low && !!e.cpu().Y[0]; }
  check('tank: drawing water → the pump starts again below the low float', again);
}

// ---------------------------------------------------------------- pneumatic sequence (STL)
{
  const e = sim('pneumatic-sequence');
  e.run(1);
  check('pneumatic: no wiring errors', !errors(e.s).length, errors(e.s).join('; '));
  const order = [];
  e.press('start', 0.2);
  for (let i = 0; i < 80; i++) {
    e.run(0.05);
    const a = [20, 21, 22, 23].find((n) => e.cpu().S[n]);
    if (a && order[order.length - 1] !== a) order.push(a);
  }
  check('pneumatic: steps S20 → S21 → S22 → S23 (A+ B+ B− A−)', order.join(',') === '20,21,22,23', order.join(','));
  check('pneumatic: one cycle, back in S0', e.cpu().CV[0] === 1 && e.cpu().S[0] && e.rt('a').dev.state.pos === 0);
  e.s.act('cyc', 'toggle'); e.press('start', 0.2); e.run(12);
  check('pneumatic: AUTO repeats the cycle', e.cpu().CV[0] >= 4, e.cpu().CV[0]);

  const model = sfcModel(e.P.plc.downloaded);
  const steps = model ? [...model.keys()].sort((x, y) => x - y) : [];
  check('SFC: steps from the step ladder', steps.join(',') === '0,20,21,22,23', steps.join(','));
  check('SFC: S0 is an initial step, S20 is not', model.get(0).initial && !model.get(20).initial);
  check('SFC: transitions S20 → S21 → S22 → S23 → S0', [[20, 21], [21, 22], [22, 23], [23, 0]].every(([a, b]) => model.get(a).next.some((t) => t.to === b)));
  check('SFC: the transition out of S20 waits for X2 (A out)', model.get(20).next[0].conds.some((c) => c.op === 'X2'), JSON.stringify(model.get(20).next));
  check('SFC: S20 action SET Y0', model.get(20).actions.some((a) => a.text === 'SET Y0'), JSON.stringify(model.get(20).actions));
  check('SFC: a program without STL has no chart', sfcModel(buildExample('star-delta').plc.downloaded) === null);
}

// ---------------------------------------------------------------- encoder + high-speed counter
{
  const e = sim('encoder-speed');
  e.run(1);
  check('encoder: no wiring errors', !errors(e.s).length, errors(e.s).join('; '));
  e.press('start'); e.run(4);
  const rpm = e.rt('motor').rpm;
  check('encoder: SPD speed D12 = motor rpm', rpm > 300 && near(e.cpu().D[12], Math.abs(rpm), 15), `${e.cpu().D[12]} vs ${rpm}`);
  const c1 = e.cpu().CV[251];
  e.run(2);
  check('encoder: C251 (A/B phase) counts up while forward', e.cpu().CV[251] > c1 + 2000, `${c1} → ${e.cpu().CV[251]}`);
  e.s.act('dir', 'toggle'); e.run(4);
  const c2 = e.cpu().CV[251];
  e.run(2);
  check('encoder: reverse → C251 counts down', e.rt('motor').rpm < -100 && e.cpu().CV[251] < c2 - 2000, `${c2} → ${e.cpu().CV[251]}`);
  check('encoder: speed stays positive in reverse (D12)', near(e.cpu().D[12], Math.abs(e.rt('motor').rpm), 15));
  e.press('rst', 0.1);
  check('encoder: RESET clears C251', Math.abs(e.cpu().CV[251]) < 200, e.cpu().CV[251]);
}

// ---------------------------------------------------------------- multimeter + fault finding
{
  const P = buildExample('dol-reversing');
  const s = new LabSystem(P);
  for (let t = 0; t < 1; t += 0.02) s.step(20);
  const dead = () => { const d = new LabSystem(JSON.parse(JSON.stringify(P)), { dead: true }); d.solve(); return d; };
  const m = (mode, a, b, live = s) => measure(P, live, mode, { dev: a[0], port: a[1] }, { dev: b[0], port: b[1] }, dead);
  const v1 = m('V', ['q1', 'L1'], ['q1', 'L2']);
  check('meter: 400 V between L1 and L2', v1.unit === 'V~' && near(+v1.text, 400, 4), v1.text);
  check('meter: 230 V between L1 and N', near(+m('V', ['q1', 'L1'], ['q1', 'N']).text, 230, 3));
  const dc = m('V', ['psu', '+V1'], ['psu', '-V1']);
  check('meter: 24 V DC on the power supply', dc.unit === 'V⎓' && near(+dc.text, 24, 0.2), dc.text);
  check('meter: Ω on a live circuit is refused', m('R', ['km1', 'A1'], ['km1', 'A2']).text === 'LIVE');
  const coil = m('R', ['km1', 'A1'], ['km1', 'A2'], null);
  check('meter: contactor coil ≈ 62 Ω (power off)', coil.unit === 'Ω' && near(+coil.text, 62, 5), coil.text);
  check('meter: NC STOP button → continuity', m('R', ['stop', '11'], ['stop', '12'], null).beep === true);
  const open = m('R', ['km1', 'L1'], ['km1', 'T1'], null);
  check('meter: open main contact → OL', open.text === 'OL', open.text + ' ' + open.unit);

  const cands = faultCandidates(P);
  check('faults: candidates for wires, contacts, coils and lamps', cands.length > 30 && ['wire', 'contact', 'coil', 'lamp'].every((k) => cands.some((c) => c.kind === k)), [...new Set(cands.map((c) => c.kind))].join(','));
  let seed = 7;
  const two = pickFaults(cands, 2, () => ((seed = (seed * 16807) % 2147483647) / 2147483647));
  check('faults: pickFaults gives distinct faults', two.length === 2 && !sameFault(two[0], two[1]));

  // a broken wire in the STOP circuit: 24 V on the button, 0 V on the PLC input, motor does not start
  const w = P.conns.find((c) => (c.a.dev === 'stop' && c.a.port === '12') || (c.b.dev === 'stop' && c.b.port === '12'));
  P.fault = { active: true, items: [{ kind: 'wire', conn: w.id }] };
  const other = w.a.dev === 'stop' ? w.b : w.a;
  for (let t = 0; t < 0.5; t += 0.02) s.step(20);
  check('fault: 24 V before the broken wire', near(+m('V', ['stop', '12'], ['psu', '-V1']).text, 24, 0.3));
  check('fault: 0 V after it', +m('V', [other.dev, other.port], ['psu', '-V1']).text === 0);
  s.act('fwd', 'press', true); for (let t = 0; t < 0.3; t += 0.02) s.step(20); s.act('fwd', 'press', false);
  for (let t = 0; t < 1; t += 0.02) s.step(20);
  check('fault: the motor does not start', Math.abs(s.rts.get('m').rpm) < 1);
}

// ---------------------------------------------------------------- lab tasks of the new examples
function tasks(id, mutate) {
  const e = sim(id, mutate);
  const memo = {};
  const lab = { tab: '3d', views: { monitor: { sub: 'devices' }, ladder: { sfc: false } } };
  const ctx = () => ({ sys: e.s, lab, P: e.P, memo, rt: e.rt, dev: (x) => e.P.devices.find((d) => d.id === x),
    cpu: e.s.plc && e.s.plc.cpu.powered ? e.s.plc.cpu : null, vfd: null, motor: e.s.byKind('motor')[0] || null,
    dl: JSON.stringify(e.P.plc.downloaded || {}) });
  return { ...e, lab, done: (i) => !!LAB_TASKS[id][i].check(ctx()) };
}
{
  const t = tasks('star-delta');
  t.run(1); t.press('start'); t.run(1.5);
  check('task star-delta #1 (star)', t.done(0));
  t.run(5);
  check('task star-delta #2 (delta)', t.done(1));
  const c = tasks('conveyor-sort');
  c.run(1); c.press('start'); c.run(6);
  check('task conveyor #1 (belt + feeder)', c.done(0));
  c.run(30);
  check('task conveyor #2 (metal box pushed off)', c.done(1));
  const p = tasks('pneumatic-sequence');
  p.run(1); p.press('start', 0.2); p.run(4);
  check('task pneumatic #1 (one cycle)', p.done(0));
  p.lab.tab = 'ladder'; p.lab.views.ladder.sfc = true;
  check('task pneumatic #2 (SFC view)', p.done(1));
  const n = tasks('encoder-speed');
  n.run(1); n.press('start'); n.run(4);
  check('task encoder #1 (D12 = rpm)', n.done(0));
}

console.log(failures ? `\n${failures} FAILED` : '\nall machine tests passed');
process.exit(failures ? 1 : 0);
