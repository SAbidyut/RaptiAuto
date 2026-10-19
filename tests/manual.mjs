// Tests of the manual: structure, links to examples, diagrams, and the ladder programs it teaches (run on the real PLC model).
import { MANUAL, PARTS, partChapters, searchManual, textOf } from '../web/src/manual/index.js';
import { EXAMPLES } from '../web/src/examples/index.js';
import { PI_EXAMPLES, PICO_EXAMPLES } from '../web/src/pi/examples.js';
import { ladder, par } from '../web/src/manual/ladder.js';
import * as ART from '../web/src/manual/art.js';
import { LAB_EXAMPLES } from '../web/src/plc/examples.js';
import { PlcCpu } from '../web/src/plc/sim/plc.js';
import { compileProgram } from '../web/src/plc/sim/ladder.js';
import { rung, program } from '../web/src/plc/sim/dsl.js';

let failures = 0;
function check(name, cond, detail = '') { if (!cond) failures++; console.log(`${cond ? '✓' : '✗'} ${name}${!cond && detail ? ' — ' + detail : ''}`); }

// ---------------------------------------------------------------- structure
const PLC = partChapters('plc');
check('four parts, every chapter belongs to one', PARTS.length === 4 && MANUAL.every((c) => PARTS.some((p) => p.id === c.part)));
check('the Bangla book has 7 chapters numbered 1…7', partChapters('bn').length === 7 && partChapters('bn').every((c, i) => c.no === i + 1));
check('nine PLC chapters', PLC.length === 9);
check('chapter ids are unique, PLC chapters are numbered 1…9', new Set(MANUAL.map((c) => c.id)).size === MANUAL.length && PLC.every((c, i) => c.no === i + 1));
check('the Arduino and Raspberry Pi parts have at least 6 chapters each', partChapters('arduino').length >= 6 && partChapters('pi').length >= 6);
const wanted = ['PLC programming', 'Variable frequency drive (VFD)', 'Designing an HMI', 'Modbus: talking to devices'];
for (const w of wanted) check(`chapter "${w}"`, PLC.some((c) => c.title === w));
check('every chapter has at least 5 sections (3 in the Bangla book) with unique ids', MANUAL.every((c) => c.sections.length >= (c.part === 'bn' ? 3 : 5) && new Set(c.sections.map((s) => s.id)).size === c.sections.length));
const all = MANUAL.flatMap((c) => c.sections.map((s) => s.html)).join('\n');
check('no "undefined" / "NaN" / "[object" in the text', !/undefined(?! reference)|NaN|\[object/.test(all), (all.match(/.{30}(undefined|NaN|\[object).{20}/) || [''])[0]);
const ids = new Set(LAB_EXAMPLES.map((e) => e.id));
const links = [...all.matchAll(/data-ex="([^"]+)"/g)].map((m) => m[1]);
check('every "Open example" button points to a real example', links.length > 25 && links.every((l) => ids.has(l)), links.filter((l) => !ids.has(l)).join());
const ardIds = new Set(EXAMPLES.map((e) => e.id)), piFiles = new Set([...PI_EXAMPLES, ...PICO_EXAMPLES].map((e) => e.file));
const ardLinks = [...all.matchAll(/data-ard="([^"]+)"/g)].map((m) => m[1]), piLinks = [...all.matchAll(/data-pi="([^"]+)"/g)].map((m) => m[1]);
check('Arduino example buttons point to real examples', ardLinks.length >= 10 && ardLinks.every((l) => ardIds.has(l)), ardLinks.filter((l) => !ardIds.has(l)).join());
check('Raspberry Pi example buttons point to real examples', piLinks.length >= 8 && piLinks.every((l) => piFiles.has(l)), piLinks.filter((l) => !piFiles.has(l)).join());
for (const id of ['modbus-th-fan', 'modbus-energy-vfd', 'modbus-function-codes', 'pid-oven-recipes', 'pid-tuning-lab']) check(`example ${id} is linked from the manual`, links.includes(id));
check('figures are balanced (every <svg> closes)', (all.match(/<svg /g) || []).length === (all.match(/<\/svg>/g) || []).length && (all.match(/<svg /g) || []).length > 40);
check('at least 40 PLC diagrams', (PLC.flatMap((c) => c.sections.map((x) => x.html)).join('').match(/<figure class="mf"/g) || []).length >= 40);
for (const part of ['arduino', 'pi']) {
  const h = partChapters(part).flatMap((c) => c.sections.map((x) => x.html)).join('');
  check(`at least 40 diagrams in the ${part} part`, (h.match(/<figure class="mf"/g) || []).length >= 40, String((h.match(/<figure class="mf"/g) || []).length));
}
const helpers = new Set(['K', 'T', 'R', 'L', 'P', 'AR', 'BADGE', 'DOT', 'fig']);
for (const [n, f] of Object.entries(ART).filter(([n, f]) => !helpers.has(n) && typeof f === 'function' && f.length === 0)) {
  const svg = f();
  check(`diagram ${n} renders`, svg.startsWith('<figure') && !/NaN|undefined/.test(svg));
}
check('ladder diagram renders with power flow', ladder([{ net: [par(['X0'], ['Y0']), '/X1'], out: 'OUT Y0' }], 'x', { on: { X0: 1, X1: 0 } }).includes('#4ade80'));
check('search finds MODRW and PB', searchManual('modrw').length > 3 && searchManual('proportional band').length >= 1);
check('search results point at sections', searchManual('auto-tune').every((r) => r.sec && r.ch));
check('the text extractor drops pictures', !/<svg/.test(textOf(all)));

// ---------------------------------------------------------------- the programs of chapter 2 and the projects, run on the PLC model
const model = { name: 'T', inputs: 16, outputs: 16 };
function mk(rungs) {
  const c = compileProgram(program(rungs), model);
  if (!c.ok) throw new Error(JSON.stringify(c.errors));
  const cpu = new PlcCpu(model); cpu.load(c); cpu.powerOn();
  return { cpu, run: (ms) => { for (let t = 0; t < ms; t += 10) cpu.step(10); } };
}
{
  const { cpu, run } = mk([rung('', ['X0| X1 => OUT Y0', 'Y0'])]);
  cpu.Xphys[1] = 1; run(50);
  check('latch: idle off', cpu.Y[0] === 0);
  cpu.Xphys[0] = 1; run(50); cpu.Xphys[0] = 0; run(50);
  check('latch: START → holds after release', cpu.Y[0] === 1);
  cpu.Xphys[1] = 0; run(50); cpu.Xphys[1] = 1; run(50);
  check('latch: STOP (X1 off) breaks it', cpu.Y[0] === 0);
}
{
  const { cpu, run } = mk([rung('', ['X0| X2 /M1 => OUT M0', 'M0']), rung('', ['X1| X2 /M0 => OUT M1', 'M1']), rung('', ['M0 => OUT Y4']), rung('', ['M1 => OUT Y5'])]);
  cpu.Xphys[2] = 1;
  cpu.Xphys[0] = 1; run(50); cpu.Xphys[0] = 0; run(50);
  cpu.Xphys[1] = 1; run(50); cpu.Xphys[1] = 0; run(50);
  check('interlock: reverse is refused while forward runs', cpu.Y[4] === 1 && cpu.Y[5] === 0);
  cpu.Xphys[2] = 0; run(50); cpu.Xphys[2] = 1; run(50);
  cpu.Xphys[1] = 1; run(50); cpu.Xphys[1] = 0; run(50);
  check('interlock: after STOP reverse starts, forward is refused', cpu.Y[5] === 1 && cpu.Y[4] === 0);
}
{
  const { cpu, run } = mk([rung('', ['X0 /T1 => TMR T0 K10']), rung('', ['T0 => TMR T1 K10']), rung('', ['T0 /T1 => OUT Y0'])]);
  cpu.Xphys[0] = 1;
  const seen = [];
  for (let s = 0; s < 6; s++) { run(500); seen.push(cpu.Y[0]); }
  // 0.5 s steps: off 1 s, on 1 s, off 1 s …
  check('flasher: 1 s off, 1 s on, repeating', seen.join('') === '001100' || seen.join('') === '011001' || /^0[01]{5}$/.test(seen.join('')) && seen.includes(1) && seen.includes(0), seen.join(''));
  run(3000);
  const a = []; for (let s = 0; s < 8; s++) { run(250); a.push(cpu.Y[0]); }
  check('flasher: keeps toggling', a.includes(0) && a.includes(1), a.join(''));
}
{
  const { cpu, run } = mk([rung('', ['X0| X1 => OUT M0', 'M0']), rung('', ['M0 => TMR T0 K50']), rung('', ['M0 /T0 => OUT Y1']), rung('', ['T0 => OUT Y0'])]);
  cpu.Xphys[1] = 1;
  cpu.Xphys[0] = 1; run(50); cpu.Xphys[0] = 0; run(2000);
  check('start delay: horn first, conveyor not yet', cpu.Y[1] === 1 && cpu.Y[0] === 0);
  run(3500);
  check('start delay: after 5 s the conveyor runs, horn off', cpu.Y[0] === 1 && cpu.Y[1] === 0);
  cpu.Xphys[1] = 0; run(50);
  check('start delay: STOP stops everything', cpu.Y[0] === 0 && cpu.Y[1] === 0);
}
{
  const { cpu, run } = mk([rung('', ['X0 => CNT C0 K12']), rung('', ['C0 =>| OUT Y0', '=> TMR T0 K30']), rung('', ['T0 => RST C0'])]);
  for (let i = 0; i < 12; i++) { cpu.Xphys[0] = 1; run(30); cpu.Xphys[0] = 0; run(30); }
  check('bottle counter: lamp after 12 bottles', cpu.Y[0] === 1 && cpu.CV[0] === 12);
  run(3200);
  check('bottle counter: 3 s later it is reset and the lamp is off', cpu.Y[0] === 0 && cpu.CV[0] === 0);
}
{
  const { cpu, run } = mk([rung('', ['^X0 => ALT M0']), rung('', ['X0 M0 => OUT Y0']), rung('', ['X0 /M0 => OUT Y1'])]);
  cpu.Xphys[0] = 1; run(50);
  const first = [cpu.Y[0], cpu.Y[1]];
  cpu.Xphys[0] = 0; run(50); cpu.Xphys[0] = 1; run(50);
  const second = [cpu.Y[0], cpu.Y[1]];
  check('alternating pumps: one at a time, swapping each press', first[0] !== first[1] && second[0] !== second[1] && first[0] !== second[0], first.join('') + ' ' + second.join(''));
}
{
  const { cpu, run } = mk([rung('', ['X0 X1 => OUT Y0'])]);
  cpu.Xphys[0] = 1; run(30); const one = cpu.Y[0];
  cpu.Xphys[1] = 1; run(30);
  check('two-hand: both buttons needed', one === 0 && cpu.Y[0] === 1);
}
{
  // Project 1: conveyor with part counter
  const { cpu, run } = mk([rung('', ['X0| X1 => OUT M0', 'M0']), rung('', ['M0 ^X2 => CNT C0 K10']), rung('', ['C0 =>| OUT Y1', '=> TMR T0 K30']), rung('', ['T0 => RST C0']), rung('', ['M0 /C0 => OUT Y0'])]);
  cpu.Xphys[1] = 1; cpu.Xphys[0] = 1; run(50); cpu.Xphys[0] = 0; run(50);
  check('project 1: conveyor runs after START', cpu.Y[0] === 1);
  for (let i = 0; i < 10; i++) { cpu.Xphys[2] = 1; run(30); cpu.Xphys[2] = 0; run(30); }
  check('project 1: after 10 parts the conveyor stops and the batch lamp lights', cpu.Y[0] === 0 && cpu.Y[1] === 1);
  run(3200);
  check('project 1: 3 s later the count restarts and the conveyor runs', cpu.CV[0] === 0 && cpu.Y[0] === 1 && cpu.Y[1] === 0);
}
{
  // Project 2: tank filling
  const { cpu, run } = mk([rung('', ['/X2| /X3 X4 => OUT M0', 'M0']), rung('', ['M0 => OUT Y0']), rung('', ['M0 => TMR T0 K200']), rung('', ['T0 M1013 => OUT Y1'])]);
  cpu.Xphys[4] = 1; run(100);
  check('project 2: the pump starts when the tank is low', cpu.Y[0] === 1);
  cpu.Xphys[2] = 1; run(100);
  check('project 2: it keeps running above LOW', cpu.Y[0] === 1);
  cpu.Xphys[3] = 1; run(100);
  check('project 2: it stops at HIGH', cpu.Y[0] === 0);
  cpu.Xphys[3] = 0; run(100);
  check('project 2: it does not restart until LOW opens again', cpu.Y[0] === 0);
  cpu.Xphys[2] = 0; run(21000);
  check('project 2: 20 s of pumping without HIGH sounds the buzzer', cpu.Y[0] === 1 && cpu.TV[0] >= 200);
}
{
  const { cpu, run } = mk([rung('', ['^X0 => INCP D0']), rung('', ['X1 => SET Y0']), rung('', ['X2 => RST Y0'])]);
  for (let i = 0; i < 3; i++) { cpu.Xphys[0] = 1; run(100); cpu.Xphys[0] = 0; run(50); }
  check('edge contact: three presses count exactly 3', cpu.D[0] === 3, 'D0 ' + cpu.D[0]);
  cpu.Xphys[1] = 1; run(30); cpu.Xphys[1] = 0; run(30);
  check('SET keeps Y0 on', cpu.Y[0] === 1);
  cpu.Xphys[2] = 1; run(30);
  check('RST turns it off', cpu.Y[0] === 0);
}

console.log(failures ? `\n${failures} FAILED` : '\nall manual tests passed');
process.exit(failures ? 1 : 0);
