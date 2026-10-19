// Headless tests of the "Step by step" PLC labs and the DVP04AD-E2 analog module: node tests/steps.mjs
import { LabSystem } from '../web/src/plc/sim/system.js';
import { buildExample } from '../web/src/plc/examples.js';
import { STEP_EXAMPLES } from '../web/src/plc/examples-steps.js';
import { compileProgram } from '../web/src/plc/sim/ladder.js';
import { PLC_MODELS } from '../web/src/plc/devices/defs.js';
import { LAB_TASKS } from '../web/src/plc/tasks.js';
import { partChapters } from '../web/src/manual/index.js';
import { LAB_EXAMPLES } from '../web/src/plc/examples.js';
import { buildGuide, STEP_GUIDES } from '../web/src/plc/guides.js';

let failures = 0;
function check(name, cond, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? '✓' : '✗'} ${name}${!cond && detail ? ' — ' + detail : ''}`);
}
function sim(id, mutate) {
  const p = buildExample(id);
  if (mutate) mutate(p);
  const s = new LabSystem(p);
  const run = (ms) => { for (let t = 0; t < ms; t += 20) s.step(20); };
  const press = (dev, ms = 100) => { s.act(dev, 'press', true); run(ms); s.act(dev, 'press', false); run(60); };
  const on = (id) => !!(s.rts.get(id) && s.rts.get(id).on);
  return { p, s, run, press, on, cpu: () => s.plc.cpu, vfd: () => s.rts.get('vfd') && s.rts.get('vfd').vfd };
}

// every step example compiles, has no wiring issue of level "error" and has tasks
for (const ex of STEP_EXAMPLES) {
  const p = buildExample(ex.id);
  const res = compileProgram(p.program, PLC_MODELS['dvp-16es2']);
  check(`${ex.id}: compiles`, res.ok, JSON.stringify(res.errors || []).slice(0, 200));
  const s = new LabSystem(p);
  for (let t = 0; t < 1500; t += 20) s.step(20);
  const errs = s.issues.filter((i) => i.level === 'error' || i.level === 'warn');
  check(`${ex.id}: no wiring warnings`, !errs.length, errs.map((i) => i.text).join(' | '));
  check(`${ex.id}: has tasks`, Array.isArray(LAB_TASKS[ex.id]) && LAB_TASKS[ex.id].length >= 2);
}

{
  const { run, press, on, s } = sim('step-01-button-lamp');
  run(500);
  s.act('pb1', 'press', true); run(100);
  check('01: lamp on while pressed', on('l1'));
  s.act('pb1', 'press', false); run(100);
  check('01: lamp off after release', !on('l1'));
  void press;
}
{
  const { run, on, s } = sim('step-02-no-nc');
  run(500);
  check('02: NC lamp on, NO lamp off at rest', on('lr') && !on('lg'));
  s.act('pb1', 'press', true); run(100);
  check('02: pressed: NO on, NC off', on('lg') && !on('lr'));
}
{
  const { run, press, on } = sim('step-03-latch');
  run(500); press('start');
  check('03: latched after START', on('lrun'));
  press('stop');
  check('03: STOP breaks the latch', !on('lrun'));
}
{
  const { run, press, on } = sim('step-04-set-rst');
  run(500); press('on');
  check('04: SET keeps the lamp on', on('l1'));
  press('off');
  check('04: RST switches it off', !on('l1'));
}
{
  const { run, press, on } = sim('step-05-timer');
  run(500); press('start'); run(2000);
  check('05: WAIT lamp during the delay', on('lwait') && !on('ldone'));
  run(3200);
  check('05: DONE after 5 s', on('ldone') && !on('lwait'));
}
{
  const { run, on, s } = sim('step-06-blink');
  run(500); s.act('sel', 'toggle'); run(100);
  const seen = new Set();
  for (let i = 0; i < 20; i++) { run(100); seen.add(on('l1')); }
  check('06: lamp blinks', seen.has(true) && seen.has(false));
}
{
  const { run, press, on, cpu } = sim('step-07-counter');
  run(500);
  for (let i = 0; i < 4; i++) press('cnt');
  check('07: 4 counts, not full', cpu().CV[0] === 4 && !on('lfull'), 'CV=' + cpu().CV[0]);
  press('cnt');
  check('07: full at 5', on('lfull'));
  press('rst');
  check('07: reset to 0', cpu().CV[0] === 0 && !on('lfull'));
}
{
  const { run, press, vfd } = sim('step-08-vfd-run');
  run(800); press('start'); run(6000);
  check('08: drive runs forward from MI1', vfd().f > 1, 'f=' + vfd().f);
  press('stop'); run(6000);
  check('08: STOP stops it', Math.abs(vfd().f) < 0.5, 'f=' + vfd().f);
}
{
  const { run, press, vfd, on } = sim('step-09-vfd-fwd-rev');
  run(800); press('fwd'); run(6000);
  check('09: FWD', vfd().f > 1 && on('lf'), 'f=' + vfd().f);
  press('rev'); run(500);
  check('09: REV ignored while FWD runs (interlock)', !on('lr'));
  press('stop'); run(6000); press('rev'); run(6000);
  check('09: REV after STOP', vfd().f < -1 && on('lr'), 'f=' + vfd().f);
}
{
  const { run, press, vfd } = sim('step-10-modbus-run');
  run(1500); press('start'); run(12000);
  check('10: Modbus RUN → 30 Hz', Math.abs(vfd().f - 30) < 0.2, 'f=' + vfd().f);
  press('stop'); run(10000);
  check('10: Modbus STOP', Math.abs(vfd().f) < 0.2, 'f=' + vfd().f);
}
{
  const { run, press, vfd, cpu } = sim('step-11-modbus-fwd-rev');
  run(1500); press('fwd'); run(12000);
  check('11: FORWARD over Modbus (H12)', Math.abs(vfd().f - 30) < 0.2 && cpu().D[10] === 0x12, 'f=' + vfd().f);
  press('stop'); run(10000); press('rev'); run(12000);
  check('11: REVERSE over Modbus (H22)', Math.abs(vfd().f + 30) < 0.2 && cpu().D[10] === 0x22, 'f=' + vfd().f);
}
{
  const { run, press, vfd, cpu } = sim('step-12-modbus-speed');
  run(1500); press('start'); run(9000);
  check('12: starts at 20 Hz', Math.abs(vfd().f - 20) < 0.2, 'f=' + vfd().f);
  press('up'); press('up'); run(6000);
  check('12: +5 Hz twice → 30 Hz, D20 reads it back', Math.abs(vfd().f - 30) < 0.2 && Math.abs(cpu().D[20] - 3000) < 30, `f=${vfd().f} D20=${cpu().D[20]}`);
  for (let i = 0; i < 12; i++) press('up');
  check('12: limited to 50 Hz', cpu().D[11] === 5000, 'D11=' + cpu().D[11]);
}
{
  const { run, on, cpu, s } = sim('step-13-analog-read');
  run(1500);
  check('13: 35 % of 0–100 °C → 3.5 V → D0 ≈ 11200', Math.abs(cpu().D[0] - 11200) < 40, 'D0=' + cpu().D[0]);
  check('13: D10 = 350 (35.0 °C), HOT off', Math.abs(cpu().D[10] - 350) <= 1 && !on('lhot'), 'D10=' + cpu().D[10]);
  s.p = null;
  s.project.devices.find((d) => d.id === 'tt').state.pos = 0.8; run(500);
  check('13: 80 °C → HOT on', on('lhot') && Math.abs(cpu().D[10] - 800) <= 1, 'D10=' + cpu().D[10]);
  const ad = s.rts.get('ad');
  check('13: module powered and attached', ad.ad.powered && ad.ad.plc === 'plc');
}
{
  const { run, on, cpu, s } = sim('step-14-analog-4-20ma');
  run(1500);
  check('14: TO wrote CR#1 = H40', s.rts.get('ad').ad.cr[1] === 0x40, 'CR1=' + s.rts.get('ad').ad.cr[1]);
  check('14: 5 bar → D11 = 50', Math.abs(cpu().D[11] - 50) <= 1, 'D11=' + cpu().D[11] + ' D1=' + cpu().D[1]);
  check('14: pump off between 3 and 6 bar at start', !on('lpump'));
  const pt = s.project.devices.find((d) => d.id === 'pt');
  pt.state.pos = 0.2; run(400);
  check('14: 2 bar → pump on', on('lpump'), 'D11=' + cpu().D[11]);
  pt.state.pos = 0.5; run(400);
  check('14: back to 5 bar → pump stays on (hysteresis)', on('lpump'));
  pt.state.pos = 0.7; run(400);
  check('14: 7 bar → pump off', !on('lpump'));
  // the same signal read in mode 0 (±10 V): 4–20 mA = 1–5 V → 3200 … 16000
  s.rts.get('ad').ad.cr[1] = 0; run(200);
  check('14: mode 0 reads the loop as volts (7 bar = 15.2 mA = 3.8 V → 12160)', Math.abs(cpu().D[1] - 12160) < 40, 'D1=' + cpu().D[1]);
}
{
  const { run, cpu, s } = sim('step-15-analog-average');
  run(1500);
  check('15: CR#2 = 20 samples on CH1', s.rts.get('ad').ad.cr[2] === 20);
  check('15: averages in D0, D1', Math.abs(cpu().D[0] - 8000) < 40 && Math.abs(cpu().D[1] - 12800) < 40, `D0=${cpu().D[0]} D1=${cpu().D[1]}`);
  check('15: 25.0 °C and 4.0 bar', Math.abs(cpu().D[10] - 250) <= 1 && Math.abs(cpu().D[12] - 40) <= 1, `D10=${cpu().D[10]} D12=${cpu().D[12]}`);
  s.project.devices.find((d) => d.id === 'tt').state.pos = 0.75;
  s.step(20);
  const nowV = cpu().D[4], avg = cpu().D[0];
  check('15: the average lags behind the present value', nowV > avg + 1000, `now=${nowV} avg=${avg}`);
}
{
  const { run, press, vfd, cpu, s } = sim('step-16-analog-modbus-speed');
  run(1500); press('fwd'); run(14000);
  check('16: pot 60 % → 30 Hz forward', Math.abs(vfd().f - 30) < 0.3, 'f=' + vfd().f + ' D14=' + cpu().D[14]);
  s.project.devices.find((d) => d.id === 'pot').state.pos = 0.9; run(10000);
  check('16: pot 90 % → 45 Hz', Math.abs(vfd().f - 45) < 0.3, 'f=' + vfd().f);
  check('16: D20 reads the output frequency back', Math.abs(cpu().D[20] - 4500) < 40, 'D20=' + cpu().D[20]);
  press('stop'); run(12000); press('rev'); run(14000);
  check('16: REVERSE', vfd().f < -40, 'f=' + vfd().f);
}
{
  // no 24 V → the module reads nothing and FROM flags M1067
  const { run, cpu, s } = sim('step-13-analog-read', (p) => { p.conns = p.conns.filter((c) => !(c.b.dev === 'ad' && c.b.port === '24V') && !(c.a.dev === 'ad' && c.a.port === '24V')); });
  run(1500);
  check('04AD without 24 V: D0 = 0 and M1067', cpu().D[0] === 0 && cpu().M[1067] === 1, 'D0=' + cpu().D[0]);
  check('04AD without 24 V: warning in the issue list', s.issues.some((i) => /DVP04AD-E2 has no power/.test(i.text)));
}

// the Step-by-step course opens every step lab, in order
{
  const html = partChapters('steps').flatMap((c) => c.sections.map((x) => x.html)).join('');
  const links = [...new Set([...html.matchAll(/data-ex="(step-[^"]+)"/g)].map((m) => m[1]))];
  check('the Step-by-step course links every step lab', STEP_EXAMPLES.every((e) => links.includes(e.id)), STEP_EXAMPLES.filter((e) => !links.includes(e.id)).map((e) => e.id).join());
  check('…in the order of the steps', links.join() === STEP_EXAMPLES.map((e) => e.id).join(), links.join());
}

// the in-lab guide: hand-written for every step lab (one explanation per network), generated for all labs
for (const ex of STEP_EXAMPLES) {
  const p = buildExample(ex.id), g = STEP_GUIDES[ex.id];
  check(`${ex.id}: has a hand-written guide`, !!g && g.run.length >= 4 && g.goal.length > 40);
  check(`${ex.id}: the guide explains every network`, g && g.rungs.length === p.program.rungs.length, `${g && g.rungs.length} explanations, ${p.program.rungs.length} networks`);
}
for (const ex of LAB_EXAMPLES) {
  const p = buildExample(ex.id), g = buildGuide(p, ex);
  const html = g.sections.map((x) => x.html).join('');
  check(`${ex.id}: guide has goal, run, parts, wiring, program, trouble, build`, ['goal', 'run', 'parts', 'wiring', 'program', 'trouble', 'build'].every((id) => g.sections.some((x) => x.id === id)), g.sections.map((x) => x.id).join());
  const wiring = g.sections.find((x) => x.id === 'wiring').html;
  const listed = [...wiring.matchAll(/<ol class="lg-wires"[^>]*>([\s\S]*?)<\/ol>/g)].reduce((n, m) => n + (m[1].match(/<li>/g) || []).length, 0);
  check(`${ex.id}: the wiring list has every connection`, listed === p.conns.length, `${listed} listed, ${p.conns.length} conns`);
  check(`${ex.id}: no undefined / NaN in the guide`, !/undefined|NaN|\[object/.test(html));
}
{
  // a lab of your own (no example): the guide is generated from the bench
  const p = buildExample('step-03-latch'); p.fromExample = null;
  const g = buildGuide(p, null);
  check('own lab: guide without run steps but with wiring and program', !g.sections.some((x) => x.id === 'run') && g.sections.some((x) => x.id === 'wiring') && g.sections.some((x) => x.id === 'program'));
}

console.log(failures ? `\n${failures} step test(s) FAILED` : '\nall step tests passed');
process.exit(failures ? 1 : 0);
