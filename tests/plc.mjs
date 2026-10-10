// Headless tests of the Delta PLC lab: node tests/plc.mjs
import { parseOperand } from '../web/src/plc/sim/address.js';
import { compileProgram, rungIL, addRow, programIL, emptyRung, placeOutput } from '../web/src/plc/sim/ladder.js';
import { VfdMS300 } from '../web/src/plc/sim/vfd.js';
import { rung, program, labelled } from '../web/src/plc/sim/dsl.js';
import { PlcCpu } from '../web/src/plc/sim/plc.js';
import { crc16, lrc, requestBytes, encodeFrame } from '../web/src/plc/sim/modbus.js';
import { LabSystem } from '../web/src/plc/sim/system.js';
import { LAB_EXAMPLES, buildExample } from '../web/src/plc/examples.js';
import { makeConn } from '../web/src/plc/store.js';
import { LAB_TASKS } from '../web/src/plc/tasks.js';

let failures = 0;
function check(name, cond, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? '✓' : '✗'} ${name}${!cond && detail ? ' — ' + detail : ''}`);
}
const il = (rows) => { const r = rungIL(rung('', rows)); return r.error ? 'ERR ' + r.error : r.lines.map((l) => l.text).join('; '); };

// ---------------------------------------------------------------- addressing
check('X17 is octal 15', parseOperand('X17').idx === 15);
check('X8 is invalid', parseOperand('X8') === null);
check('K-5', parseOperand('K-5').val === -5);
check('H2000', parseOperand('H2000').val === 0x2000);
check('D4999', parseOperand('d4999').text === 'D4999');

// ---------------------------------------------------------------- IL generation
check('IL self-holding', il(['X0| X1 => OUT Y0', 'Y0']) === 'LD X0; OR Y0; AND X1; OUT Y0', il(['X0| X1 => OUT Y0', 'Y0']));
check('IL parallel block (ANB)', il(['X0| X1| X3 => OUT Y0', '. X2']) === 'LD X0; LD X1; OR X2; ANB; AND X3; OUT Y0', il(['X0| X1| X3 => OUT Y0', '. X2']));
check('IL series block (ORB)', il(['X0 X1| => OUT Y0', 'X2 X3']) === 'LD X0; AND X1; LD X2; AND X3; ORB; OUT Y0', il(['X0 X1| => OUT Y0', 'X2 X3']));
check('IL open branch is an error', il(['X0 X1 -| => OUT Y0', 'X2 X3']) === 'LD X0; AND X1; OUT Y0', il(['X0 X1 -| => OUT Y0', 'X2 X3']));
check('IL parallel outputs', il(['X0 =>| OUT Y0', '=> OUT Y1']) === 'LD X0; OUT Y0; OUT Y1', il(['X0 =>| OUT Y0', '=> OUT Y1']));
check('IL MPS/MPP', il(['X0 -| X1 => OUT Y0', '. . X2 => OUT Y1']) === 'LD X0; MPS; AND X1; OUT Y0; MPP; AND X2; OUT Y1', il(['X0 -| X1 => OUT Y0', '. . X2 => OUT Y1']));
check('IL compare + timer', il(['D0>=K10 /M1 => TMR T0 K50']) === 'LD>= D0 K10; ANI M1; TMR T0 K50', il(['D0>=K10 /M1 => TMR T0 K50']));
check('IL rising edge + pulse MOV', il(['^X0 => MOVP K5 D0']) === 'LDP X0; MOVP K5 D0', il(['^X0 => MOVP K5 D0']));
check('IL rejects coil on bus bar', il(['- => OUT Y0']).startsWith('ERR'), il(['- => OUT Y0']));

// ---------------------------------------------------------------- compiler checks
const bad = compileProgram(program([rung('', ['X9 => OUT X0'])]), { name: 'T', inputs: 8, outputs: 8 });
check('compile errors on X9 / OUT X0', !bad.ok && bad.errors.length >= 2, JSON.stringify(bad.errors));
const dbl = compileProgram(program([rung('', ['X0 => OUT Y0']), rung('', ['X1 => OUT Y0'])]), { name: 'T', inputs: 8, outputs: 8 });
check('double coil warning', dbl.ok && dbl.warnings.some((w) => /Double coil/.test(w.msg)));

// ---------------------------------------------------------------- CPU
{
  const cpu = new PlcCpu({ name: 'T', inputs: 8, outputs: 8 });
  const prog = compileProgram(program([
    rung('', ['X0| X1 => OUT Y0', 'Y0']),
    rung('', ['Y0 => TMR T0 K10']),
    rung('', ['^X2 => CNT C0 K3']),
    rung('', ['X3 => RST C0']),
    rung('', ['M1000 =>| ADD D0 K1 D1', '=>| MUL K300 K300 D2', '=> DIV K7 K2 D4']),
    rung('', ['T0 => OUT Y1']),
  ]), cpu.model);
  check('CPU program compiles', prog.ok, JSON.stringify(prog.errors));
  cpu.load(prog);
  cpu.powerOn();
  const run = (ms) => cpu.step(ms);
  cpu.Xphys[1] = 1; // NC stop closed
  run(20);
  check('CPU in RUN', cpu.running && cpu.M[1000] === 1);
  cpu.Xphys[0] = 1; run(10); cpu.Xphys[0] = 0; run(10);
  check('latch holds Y0', cpu.Y[0] === 1);
  run(990);
  check('T0 (100 ms base) done after 1 s', cpu.T[0] === 1 && cpu.Y[1] === 1, `TV=${cpu.TV[0]}`);
  for (let i = 0; i < 4; i++) { cpu.Xphys[2] = 1; run(10); cpu.Xphys[2] = 0; run(10); }
  check('counter stops at set value', cpu.CV[0] === 3 && cpu.C[0] === 1, `CV=${cpu.CV[0]}`);
  cpu.Xphys[3] = 1; run(10); cpu.Xphys[3] = 0;
  check('RST C0', cpu.CV[0] === 0 && cpu.C[0] === 0);
  check('MUL 32-bit', (cpu.D[2] & 0xFFFF) + cpu.D[3] * 65536 === 90000, `${cpu.D[2]} ${cpu.D[3]}`);
  check('DIV quotient/remainder', cpu.D[4] === 3 && cpu.D[5] === 1);
  cpu.Xphys[1] = 0; run(10);
  check('NC stop breaks latch', cpu.Y[0] === 0);
}

// ---------------------------------------------------------------- more instructions (v2.3)
{
  const model = { name: 'T', inputs: 16, outputs: 16 };
  const mk = (rungs) => { const c = compileProgram(program(rungs), model); const cpu = new PlcCpu(model); cpu.load(c.ok ? c : null); cpu.powerOn(); return { c, cpu }; };
  // data and logic instructions in one program, run for one scan
  const { c, cpu } = mk([
    rung('', ['M1000 =>| MOV K1234 D0', '=>| BCD D0 D1', '=>| BIN D1 D2', '=>| WAND H0F0F H00FF D3', '=>| WOR H0F00 H00F0 D4', '=>| WXOR HFFFF H00FF D5', '=>| CML K0 D6', '=> SWAP D7']),
    rung('', ['M1000 =>| MOV K-25 D10', '=>| ABS D10', '=>| MOV K10 D11', '=>| NEG D11', '=>| SQR K144 D12', '=>| SCAL K4000 K500 K100 D13', '=> SUM H00F3 D14']),
    rung('', ['M1000 =>| FMOV K7 D20 K4', '=>| BMOV D20 D30 K4', '=>| MOV K10 D40', '=>| MOV K20 D41', '=>| MEAN D40 D42 K2', '=> XCHP D40 D41']),
    rung('', ['M1000 =>| ZCP K10 K20 K15 M20', '=>| BON H0004 M30 K2', '=>| DECO K5 M40 K3', '=>| MOV H0050 D50', '=> ENCO D50 D51 K3']),
    rung('', ['M1000 =>| MOV H0001 D60', '=>| RORP D60 K1', '=>| MOV H8000 D61', '=> ROLP D61 K1']),
    rung('', ['D0&K2 => OUT Y0']),
    rung('', ['D0|K0 MEP => OUT Y1']),
  ]);
  check('new instructions compile', c.ok, JSON.stringify(c.errors));
  cpu.D[7] = 0x1234;
  cpu.step(5);
  check('BCD / BIN round trip', (cpu.D[1] & 0xFFFF) === 0x1234 && cpu.D[2] === 1234, `${cpu.D[1].toString(16)} ${cpu.D[2]}`);
  check('WAND / WOR / WXOR', cpu.D[3] === 0x000F && cpu.D[4] === 0x0FF0 && (cpu.D[5] & 0xFFFF) === 0xFF00, `${cpu.D[3]} ${cpu.D[4]} ${cpu.D[5]}`);
  check('CML / SWAP', cpu.D[6] === -1 && cpu.D[7] === 0x3412, `${cpu.D[6]} ${cpu.D[7].toString(16)}`);
  check('ABS / NEG / SQR', cpu.D[10] === 25 && cpu.D[11] === -10 && cpu.D[12] === 12);
  check('SCAL (4000 × 0.5 + 100)', cpu.D[13] === 2100, cpu.D[13]);
  check('SUM counts ON bits', cpu.D[14] === 6, cpu.D[14]);
  check('FMOV / BMOV', [20, 21, 22, 23, 30, 31, 32, 33].every((i) => cpu.D[i] === 7));
  check('MEAN', cpu.D[42] === 15, cpu.D[42]);
  check('XCHP swaps once', cpu.D[40] === 20 && cpu.D[41] === 10, `${cpu.D[40]} ${cpu.D[41]}`);
  check('ZCP inside the zone', cpu.M[20] === 0 && cpu.M[21] === 1 && cpu.M[22] === 0);
  check('BON bit 2', cpu.M[30] === 1);
  check('DECO 5 → M45', cpu.M[45] === 1 && cpu.M[44] === 0 && cpu.M[40] === 0);
  check('ENCO H50 → 6', cpu.D[51] === 6, cpu.D[51]);
  check('ROR / ROL', (cpu.D[60] & 0xFFFF) === 0x8000 && cpu.D[61] === 1, `${cpu.D[60]} ${cpu.D[61]}`);
  check('word AND contact (LD&): 1234 & 2 ≠ 0', cpu.Y[0] === 1);
  check('MEP: pulse on the first scan only', cpu.Y[1] === 1);
  cpu.step(5);
  check('MEP: off on the next scan', cpu.Y[1] === 0);
  check('IL of LD& and MEP', JSON.stringify(c.il[5].lines.map((l) => l.text)) === '["LD& D0 K2","OUT Y0"]' && c.il[6].lines.map((l) => l.text).join(';') === 'LD| D0 K0;MEP;OUT Y1', JSON.stringify([c.il[5].lines, c.il[6].lines]));
}
{
  // master control: MC N0 off → OUT Y0 inside drops out, MCR ends the block
  const model = { name: 'T', inputs: 16, outputs: 16 };
  const prog = compileProgram(program([
    rung('', ['X0 => MC N0']),
    rung('', ['M1000 => OUT Y0']),
    rung('', ['M1000 => TMR T1 K50']),
    rung('', ['=> MCR N0']),
    rung('', ['M1000 => OUT Y1']),
  ]), model);
  check('MC / MCR compile', prog.ok, JSON.stringify(prog.errors));
  check('MCR IL stands on the bus bar', prog.il[3].lines.map((l) => l.text).join(';') === 'MCR N0', JSON.stringify(prog.il[3]));
  const cpu = new PlcCpu(model); cpu.load(prog); cpu.powerOn();
  cpu.step(10);
  check('MC off: block without power', cpu.Y[0] === 0 && cpu.Y[1] === 1 && cpu.TV[1] === 0);
  cpu.Xphys[0] = 1; cpu.step(300);
  check('MC on: block runs', cpu.Y[0] === 1 && cpu.TV[1] > 0);
  cpu.Xphys[0] = 0; cpu.step(10);
  check('MC off again: coil and timer reset', cpu.Y[0] === 0 && cpu.TV[1] === 0);
}
{
  // CJ skips networks; CALL runs a subroutine after FEND
  const model = { name: 'T', inputs: 16, outputs: 16 };
  const prog = compileProgram(program([
    rung('', ['X0 => CJ P0']),
    rung('', ['M1000 => OUT Y0']),
    labelled('P0', rung('', ['M1000 => CALL P5'])),
    rung('', ['=> FEND']),
    labelled('P5', rung('', ['M1000 => INC D0'])),
    rung('', ['=> SRET']),
  ]), model);
  check('CJ / CALL / FEND / SRET compile', prog.ok, JSON.stringify(prog.errors));
  check('IL shows the pointer labels', programIL(prog).map((l) => l.text).join(';') === 'LD X0;CJ P0;LD M1000;OUT Y0;P0;LD M1000;CALL P5;FEND;P5;LD M1000;INC D0;SRET;END', programIL(prog).map((l) => l.text).join(';'));
  const cpu = new PlcCpu(model); cpu.load(prog); cpu.powerOn();
  cpu.step(5);
  check('CALL runs the subroutine once per scan', cpu.D[0] === 1 && cpu.Y[0] === 1, `D0=${cpu.D[0]}`);
  cpu.Y[0] = 0; cpu.Xphys[0] = 1; cpu.step(5);
  check('CJ skips the network (Y0 holds its state)', cpu.Y[0] === 0 && cpu.D[0] === 2);
  const bad = compileProgram(program([rung('', ['X0 => CJ P9']), rung('', ['X1 => CALL P1']), labelled('P1', rung('', ['M1000 => OUT Y0']))]), model);
  check('missing pointer / CALL before FEND are errors', bad.errors.some((e) => /no network has the pointer P9/.test(e.msg)) && bad.errors.some((e) => /after FEND/.test(e.msg)), JSON.stringify(bad.errors));
  const loop = compileProgram(program([labelled('P0', rung('', ['M1000 => CJ P0']))]), model);
  const c2 = new PlcCpu(model); c2.load(loop); c2.powerOn(); c2.step(5);
  check('endless CJ loop trips the watchdog instead of hanging', c2.M[1067] === 1 && c2.errorFlag);
}
{
  // step ladder: S0 → (X0) → S20 (Y0, timer 0.5 s) → S21 (Y1) → (X1) → S0
  const model = { name: 'T', inputs: 16, outputs: 16 };
  const prog = compileProgram(program([
    rung('', ['M1002 => SET S0']),
    rung('', ['$S0 X0 => SET S20']),
    rung('', ['$S20 =>| OUT Y0', '=> TMR T0 K5', 'T0 => SET S21']),
    rung('', ['$S21 => OUT Y1', 'X1 => SET S0']),
    rung('', ['=> RET']),
  ]), model);
  check('STL program compiles', prog.ok, JSON.stringify(prog.errors));
  check('STL IL', prog.il[1].lines.map((l) => l.text).join(';') === 'STL S0;LD X0;SET S20' && prog.il[2].lines.map((l) => l.text).join(';').startsWith('STL S20;OUT Y0;TMR T0 K5'), JSON.stringify(prog.il.map((r) => r.lines.map((l) => l.text))));
  const cpu = new PlcCpu(model); cpu.load(prog); cpu.powerOn();
  cpu.step(10);
  check('initial step S0', cpu.S[0] === 1 && cpu.S[20] === 0);
  cpu.Xphys[0] = 1; cpu.step(10); cpu.Xphys[0] = 0;
  check('S0 → S20, Y0 on', cpu.S[0] === 0 && cpu.S[20] === 1 && cpu.Y[0] === 1);
  cpu.step(520);
  check('timer moves S20 → S21: Y0 off, Y1 on', cpu.S[20] === 0 && cpu.S[21] === 1 && cpu.Y[0] === 0 && cpu.Y[1] === 1 && cpu.TV[0] === 0, `S20=${cpu.S[20]} S21=${cpu.S[21]} Y0=${cpu.Y[0]} Y1=${cpu.Y[1]} TV=${cpu.TV[0]}`);
  cpu.Xphys[1] = 1; cpu.step(10); cpu.Xphys[1] = 0; cpu.step(10);
  check('back to S0, Y1 off', cpu.S[0] === 1 && cpu.S[21] === 0 && cpu.Y[1] === 0);
  const dbl = compileProgram(program([rung('', ['M1002 => SET S0']), rung('', ['$S0 => OUT Y0']), rung('', ['$S1 => OUT Y0']), rung('', ['=> RET'])]), model);
  check('same coil in two steps is not a double coil', dbl.ok && !dbl.warnings.some((w) => /Double coil/.test(w.msg)), JSON.stringify(dbl.warnings));
  const misplaced = compileProgram(program([rung('', ['X0 $S0 => OUT Y0'])]), model);
  check('STL away from the bus bar is an error', !misplaced.ok, JSON.stringify(misplaced.errors));
}
{
  // the editor puts FEND on a line from the bus bar
  const r = emptyRung(8);
  placeOutput(r, 0, { t: 'FEND', a: [] });
  check('FEND placed on a bus-bar line', r.cells[0].every((x) => x && x.t === 'H') && rungIL(r).lines.map((l) => l.text).join(';') === 'FEND', JSON.stringify(rungIL(r)));
  const r2 = rung('', ['X0 => FEND']);
  check('FEND behind a contact is an error', !!rungIL(r2).error);
}

// ---------------------------------------------------------------- v2.5 instructions
{
  const model = { name: 'T', inputs: 16, outputs: 16 };
  const prog = compileProgram(program([
    rung('', ['X0 => TON T1 K10']),
    rung('', ['X1 => TOF T2 K10']),
    rung('', ['X2 => DCNT C235 K3']),
    rung('', ['X3 => DCNT C200 K2']),
    rung('', ['=> FOR K5']),
    rung('', ['M1000 => INC D0']),
    rung('', ['=> NEXT']),
    rung('', ['^X4 =>| MOV K1 D10', '=>| MOV K2 D11', '=>| MOV K3 D12', '=>| MOV K9 D20', '=> WSFLP D20 D10 K3 K1']),
    rung('', ['^X5 =>| MOV K0 D30', '=>| MOV K11 D99', '=>| SFWR D99 D30 K4', '=>| MOV K22 D99', '=>| SFWR D99 D30 K4', '=> SFRD D30 D40 K4']),
    rung('', ['^X6 =>| MOV H8001 D50', '=>| RST M1022', '=> RCRP D50 K1']),
  ]), model);
  check('v2.5 instructions compile', prog.ok, JSON.stringify(prog.errors));
  check('IL shows FOR / NEXT and DCNT', programIL(prog).map((l) => l.text).join(';').includes('FOR K5;LD M1000;INC D0;NEXT'), programIL(prog).map((l) => l.text).join(';'));
  const cpu = new PlcCpu(model); cpu.load(prog); cpu.powerOn();
  cpu.step(5);
  check('FOR K5 … NEXT runs the loop 5 times per scan', cpu.D[0] === 5, 'D0=' + cpu.D[0]);
  cpu.Xphys[0] = 1; cpu.step(1100);
  check('TON = on-delay', cpu.T[1] === 1 && cpu.TV[1] === 10);
  cpu.Xphys[1] = 1; cpu.step(20);
  check('TOF turns ON at once', cpu.T[2] === 1);
  cpu.Xphys[1] = 0; cpu.step(500);
  check('TOF still ON during the delay', cpu.T[2] === 1 && cpu.TV[2] > 0);
  cpu.step(700);
  check('TOF OFF after the delay', cpu.T[2] === 0);
  cpu.Xphys[2] = 1;
  for (let k = 0; k < 4; k++) { cpu.Xphys[0] = 0; cpu.step(10); cpu.Xphys[0] = 1; cpu.step(10); }
  check('DCNT C235 counts X0 pulses', cpu.CV[235] === 4 && cpu.C[235] === 1, 'C235=' + cpu.CV[235]);
  cpu.CV[200] = 70000; cpu.Xphys[3] = 1; cpu.step(10);
  check('DCNT C200 is 32-bit', cpu.CV[200] === 70001, 'C200=' + cpu.CV[200]);
  cpu.M[1200] = 1; cpu.Xphys[3] = 0; cpu.step(10); cpu.Xphys[3] = 1; cpu.step(10);
  check('DCNT M1200 ON counts down', cpu.CV[200] === 70000, 'C200=' + cpu.CV[200]);
  cpu.Xphys[4] = 1; cpu.step(10);
  check('WSFL shifts words left', cpu.D[10] === 9 && cpu.D[11] === 1 && cpu.D[12] === 2, [cpu.D[10], cpu.D[11], cpu.D[12]].join());
  cpu.Xphys[5] = 1; cpu.step(10);
  check('SFWR / SFRD FIFO', cpu.D[40] === 11 && cpu.D[30] === 1 && cpu.D[31] === 22, [cpu.D[40], cpu.D[30], cpu.D[31]].join());
  cpu.Xphys[6] = 1; cpu.step(10);
  check('RCR rotates through the carry', (cpu.D[50] & 0xFFFF) === 0x4000 && cpu.M[1022] === 1, (cpu.D[50] & 0xFFFF).toString(16) + ' c=' + cpu.M[1022]);
  const bad = compileProgram(program([rung('', ['=> FOR K3']), rung('', ['X0 => DCNT C5 K3']), rung('', ['=> NEXT']), rung('', ['=> NEXT'])]), model);
  check('FOR/NEXT pairing and DCNT range are checked', bad.errors.some((e) => /NEXT has no FOR/.test(e.msg)) && bad.errors.some((e) => /DCNT/.test(e.msg)), JSON.stringify(bad.errors));
}

// ---------------------------------------------------------------- Modbus framing
check('CRC16 of 01 06 20 00 00 12', crc16([1, 6, 0x20, 0, 0, 0x12]).toString(16) === '702', crc16([1, 6, 0x20, 0, 0, 0x12]).toString(16));
check('LRC', lrc([1, 3, 0x21, 2, 0, 2]) === 0xD7, lrc([1, 3, 0x21, 2, 0, 2]).toString(16));
check('ASCII frame', encodeFrame(requestBytes(1, 3, 0x2102, { count: 2 }), 'ASCII') === ':010321020002D7␍␊', encodeFrame(requestBytes(1, 3, 0x2102, { count: 2 }), 'ASCII'));

// ---------------------------------------------------------------- whole-lab simulations
function sim(id, mutate) {
  const p = buildExample(id);
  if (mutate) mutate(p);
  const s = new LabSystem(p);
  return { p, s, run: (ms) => { for (let t = 0; t < ms; t += 20) s.step(20); } };
}

for (const ex of LAB_EXAMPLES) {
  const p = ex.build();
  const res = compileProgram(p.program, { name: 'x', inputs: 16, outputs: 16 });
  check(`example "${ex.id}" compiles`, res.ok, JSON.stringify(res.errors));
}

{
  const { s, run } = sim('start-stop');
  run(500);
  const plc = s.plc;
  check('start-stop: PLC powered and running', plc.cpu.running, s.issues.map((i) => i.text).join(' | '));
  check('start-stop: STOP lamp lit', s.rts.get('lstop').on === true);
  check('start-stop: STOP NC input X1 = 1', plc.cpu.X[1] === 1);
  s.act('start', 'press', true); run(100); s.act('start', 'press', false); run(100);
  check('start-stop: RUN lamp latched', s.rts.get('lrun').on && !s.rts.get('lstop').on);
  s.act('stop', 'press', true); run(100); s.act('stop', 'press', false); run(100);
  check('start-stop: STOP breaks latch', !s.rts.get('lrun').on);
  check('start-stop: USB link', s.pcLink().ok);
}

{
  const { s, run } = sim('traffic-light');
  run(1000);
  check('traffic: red first', s.rts.get('red').on && !s.rts.get('green').on);
  run(5000);
  check('traffic: green after 5 s', s.rts.get('green').on && !s.rts.get('red').on);
  run(4200);
  check('traffic: amber after 9 s', s.rts.get('amber').on);
}

{
  const { s, run } = sim('part-counter');
  run(2500);
  check('counter: HMI link OK', s.hmiLinkState.ok, s.hmiLinkState.reason);
  for (let i = 0; i < 5; i++) { s.act('prox', 'toggle'); run(120); s.act('prox', 'toggle'); run(120); }
  check('counter: C0 = 5', s.plc.cpu.CV[0] === 5, 'CV=' + s.plc.cpu.CV[0]);
  check('counter: BOX FULL lamp', s.rts.get('full').on);
  check('counter: HMI cached count', s.hmiRt.hmi.value('C0', true) === 5, String(s.hmiRt.hmi.value('C0', true)));
  s.hmiRt.hmi.pointerDown(100, 390); run(100); s.hmiRt.hmi.pointerUp(100, 390); run(200);
  check('counter: HMI RESET button resets C0', s.plc.cpu.CV[0] === 0, 'CV=' + s.plc.cpu.CV[0]);
}

{
  const { s, run } = sim('vfd-terminals');
  run(2000);
  check('terminals: VFD powered', s.rts.get('vfd').vfd.powered);
  s.act('fwd', 'press', true); run(100); s.act('fwd', 'press', false);
  run(3500);
  const v = s.rts.get('vfd').vfd;
  check('terminals: FWD at 15 Hz', Math.abs(v.f - 15) < 0.05, 'f=' + v.f);
  check('terminals: motor turning forward', s.rts.get('motor').rpm > 300, 'rpm=' + s.rts.get('motor').rpm);
  s.act('spd', 'toggle'); run(3000);
  check('terminals: HIGH speed 45 Hz', Math.abs(v.f - 45) < 0.05, 'f=' + v.f);
  s.act('stop', 'press', true); run(100); s.act('stop', 'press', false); run(4000);
  check('terminals: stopped', v.f === 0, 'f=' + v.f);
  s.act('rev', 'press', true); run(100); s.act('rev', 'press', false); run(4000);
  check('terminals: REV negative', v.f < -40 && s.rts.get('motor').rpm < -1000, 'f=' + v.f + ' rpm=' + s.rts.get('motor').rpm);
}

{
  const { s, run } = sim('vfd-modbus-hmi');
  run(2500);
  check('modbus: HMI link', s.hmiLinkState.ok, s.hmiLinkState.reason);
  check('modbus: no COM2 time-out', !s.plc.cpu.M[1129], s.log.slice(-4).map((l) => l.info).join(' | '));
  s.act('start', 'press', true); run(100); s.act('start', 'press', false);
  run(7000);
  const v = s.rts.get('vfd').vfd;
  check('modbus: drive at 30 Hz', Math.abs(v.f - 30) < 0.05, 'f=' + v.f + ' ' + s.issues.map((i) => i.text).join(' | '));
  check('modbus: D20 read back ≈ 3000', Math.abs(s.plc.cpu.D[20] - 3000) <= 5, 'D20=' + s.plc.cpu.D[20]);
  check('modbus: D28 rpm ≈ 840', Math.abs(s.plc.cpu.D[28] - 840) <= 10, 'D28=' + s.plc.cpu.D[28]);
  check('modbus: RTU frames in the log', s.log.some((l) => l.link === 'COM2' && /^01 06 20 00 00 12/.test(l.frame)), s.log.filter((l) => l.link === 'COM2').slice(-3).map((l) => l.frame).join(' | '));
  // set 45 Hz on the HMI keypad
  const hmi = s.hmiRt.hmi;
  hmi.pointerDown(130, 290); hmi.pointerUp(130, 290);
  const L = hmi.keypadLayout();
  const tap = (k) => { const b = L.keys.find((x) => x.k === k); hmi.pointerDown(b.x + 5, b.y + 5); hmi.pointerUp(b.x + 5, b.y + 5); };
  tap('4'); tap('5'); tap('ENT');
  run(4000);
  check('modbus: HMI set point → 45 Hz', Math.abs(v.f - 45) < 0.05, 'f=' + v.f + ' D10=' + s.plc.cpu.D[10]);
  // the ± 5 Hz buttons next to the set point
  hmi.pointerDown(80, 350); hmi.pointerUp(80, 350); run(400);
  check('HMI − 5 Hz button: D10 = 4000', s.plc.cpu.D[10] === 4000, 'D10=' + s.plc.cpu.D[10]);
  check('HMI status word: RUNNING', s.plc.cpu.D[30] === 1, 'D30=' + s.plc.cpu.D[30]);
  s.act('es', 'toggle'); run(6000);
  check('modbus: E-stop stops the drive', v.f === 0 && !s.plc.cpu.M[0], 'f=' + v.f);
}

{
  // the Delta drive instructions FWD / STOP / RDST instead of MODRW
  const { s, run } = sim('vfd-modbus-hmi', (p) => {
    const R = p.program.rungs;
    const i = R.findIndex((r) => r.outs.some((o) => o && o.t === 'MODRW' && o.a[2] === 'H2000'));
    R.splice(i, 4,
      rung('', ['M0 => FWD D10 K1 K1']),
      rung('', ['/M0 => STOP K1 K1']),
      rung('', ['M1000 => RDST K1 K1']),
      rung('', ['M1000 =>| MOV D1053 D20', '=> MOV D1050 D22']));
    p.plc.downloaded = JSON.parse(JSON.stringify(p.program));
  });
  run(2500);
  s.act('start', 'press', true); run(100); s.act('start', 'press', false);
  run(8000);
  const v = s.rts.get('vfd').vfd;
  check('FWD: drive at 30 Hz forward', Math.abs(v.f - 30) < 0.05 && v.f > 0, 'f=' + v.f + ' ' + s.log.filter((l) => l.link === 'COM2').slice(-3).map((l) => l.info).join(' | '));
  check('RDST: status in D1050 … (D1053 = output Hz)', Math.abs(s.plc.cpu.D[1053] - 3000) <= 5, 'D1053=' + s.plc.cpu.D[1053]);
  check('FWD frame is function 16 at 2000H', s.log.some((l) => l.link === 'COM2' && /^01 10 20 00 00 02/.test(l.frame)), s.log.filter((l) => l.link === 'COM2').slice(-3).map((l) => l.frame).join(' | '));
  s.act('stop', 'press', true); run(100); s.act('stop', 'press', false); run(8000);
  check('STOP: drive stops', v.f === 0, 'f=' + v.f);
}

{
  const { s, run } = sim('vfd-modbus-hmi', (p) => { p.devices.find((d) => d.id === 'vfd').state.params['09-04'] = 1; });
  run(2000);
  check('modbus: protocol mismatch → time-out M1129', s.plc.cpu.M[1129] === 1 && s.rts.get('lflt').on, s.log.slice(-2).map((l) => l.info).join(' | '));
  const hmi = s.hmiRt.hmi;
  check('HMI alarm history logs the time-out on every screen', hmi.alarmLog.some((a) => a.bit === 'M1129' && a.off === null), JSON.stringify(hmi.alarmLog));
  hmi.pointerDown(10, 10); run(1500);
  check('HMI: holding the top-left corner opens the system menu', !!hmi.sysMenu);
  hmi.pointerUp(10, 10);
  const L = hmi.sysMenuLayout(), ex = L.keys.find((k) => k.k === 'exit');
  hmi.pointerDown(ex.x + 5, ex.y + 5); hmi.pointerUp(ex.x + 5, ex.y + 5);
  check('HMI: EXIT closes the system menu', !hmi.sysMenu);
}

{
  const { s, run } = sim('vfd-terminals', (p) => {
    const c = p.conns.find((x) => x.b.dev === 'motor' && x.b.port === 'V'); c.b.port = 'W';
    const d = p.conns.find((x) => x.a.port === 'W/T3' && x.b.dev === 'motor'); d.b.port = 'V';
  });
  run(1500);
  s.act('fwd', 'press', true); run(100); s.act('fwd', 'press', false); run(3000);
  check('phase swap reverses the motor', s.rts.get('motor').rpm < -200, 'rpm=' + s.rts.get('motor').rpm);
}

{
  const { s, run } = sim('analog-speed');
  run(1500);
  s.act('start', 'press', true); run(100); s.act('start', 'press', false); run(8000);
  const v = s.rts.get('vfd').vfd;
  check('analog: D1110 = 1200 (6 V)', s.plc.cpu.D[1110] === 1200, 'D1110=' + s.plc.cpu.D[1110]);
  check('analog: drive at 30 Hz from AVI', Math.abs(v.f - 30) < 0.1, 'f=' + v.f + ' avi=' + v.avi);
}

{
  const { p, s, run } = sim('start-stop');
  run(300);
  p.conns.push(makeConn(p.devices, 'psu', '+V1', 'psu', '-V2'));
  run(100);
  check('short circuit detected on the PSU', s.rts.get('psu').short && !s.rts.get('lstop').on);
  p.conns.pop(); run(100);
  check('PSU recovers after removing the short', !s.rts.get('psu').short && s.rts.get('lstop').on);
  p.conns.push(makeConn(p.devices, 'mcb', 'L', 'mcb', 'N')); run(50);
  check('L–N short trips the MCB', p.devices.find((d) => d.id === 'mcb').state.on === false);
}

// ---------------------------------------------------------------- contactor, overload relay, industrial sensors
{
  const { s, run } = sim('contactor-starter');
  run(1500);
  const km = () => s.rts.get('km1'), rpm = () => s.rts.get('motor').rpm;
  check('starter: KM1 open, motor still, no false "not connected" issue', !km().closed && rpm() === 0 && !s.issues.some((i) => /not connected|no motor/.test(i.text)), s.issues.map((i) => i.text).join(' | '));
  s.act('start', 'press', true); run(100); s.act('start', 'press', false); run(4000);
  check('starter: START pulls in KM1, feedback X3, motor runs', km().closed && s.plc.cpu.X[3] === 1 && rpm() > 1000, 'rpm=' + rpm());
  s.act('photo', 'toggle'); run(3000);
  check('starter: PNP photo sensor → X4 stops the drive', s.plc.cpu.X[4] === 1 && Math.abs(s.rts.get('vfd').vfd.f) < 0.01);
  s.act('photo', 'toggle'); s.act('f1', 'toggle'); run(500);
  check('starter: overload trip opens 95–96, drops KM1, lights OVERLOAD', s.plc.cpu.X[2] === 0 && !km().closed && s.rts.get('lfault').on);
  s.act('f1', 'toggle'); run(200);
  s.act('km1', 'press', true); run(100);
  check('starter: KM1 pushed in by hand closes 13–14', km().closed && s.plc.cpu.X[3] === 1);
  s.act('km1', 'press', false); run(100);
  check('starter: released, KM1 opens again', !km().closed && s.plc.cpu.X[3] === 0);
}
{
  // NPN sensor with S/S at +24 V (sinking inputs), limit switch NC contact, 0–10 V transmitter on the EX2
  const { s, run } = sim('blank', (p) => {
    p.devices = p.devices.filter((d) => d.id !== 'plc');
    p.conns = p.conns.filter((c) => c.a.dev !== 'plc' && c.b.dev !== 'plc');
    p.devices.push({ id: 'plc', type: 'dvp-20ex2', props: {}, state: { run: true } });
    p.conns.push(makeConn(p.devices, 'mcb', 'L', 'plc', 'L'), makeConn(p.devices, 'mcb', 'N', 'plc', 'N'), makeConn(p.devices, 'plc', 'S/S', 'psu', '+V1'));
    p.devices.push({ id: 'cap', type: 'prox-cap', props: { label: 'LEVEL', output: 'NPN' }, state: { target: false } });
    p.devices.push({ id: 'ls', type: 'limit', props: { label: 'LS1' }, state: { on: false } });
    p.devices.push({ id: 'tt', type: 'temp-tx', props: { label: 'TEMP', min: 0, max: 150 }, state: { pos: 0.6 } });
    p.conns.push(makeConn(p.devices, 'psu', '+V2', 'cap', 'BN'), makeConn(p.devices, 'psu', '-V1', 'cap', 'BU'), makeConn(p.devices, 'cap', 'BK', 'plc', 'X0'));
    p.conns.push(makeConn(p.devices, 'psu', '-V2', 'ls', '21'), makeConn(p.devices, 'ls', '22', 'plc', 'X1'));
    p.conns.push(makeConn(p.devices, 'cap', 'BN', 'tt', 'BN'), makeConn(p.devices, 'cap', 'BU', 'tt', 'BU'), makeConn(p.devices, 'tt', 'BK', 'plc', 'V0+'), makeConn(p.devices, 'ls', '21', 'plc', 'AIG'));
  });
  run(500);
  const cpu = s.plc.cpu;
  check('NPN sensor off → X0 = 0, NC limit switch (to 0 V, sinking) → X1 = 1', cpu.X[0] === 0 && cpu.X[1] === 1, `X0=${cpu.X[0]} X1=${cpu.X[1]}`);
  s.act('cap', 'toggle'); s.act('ls', 'toggle'); run(100);
  check('NPN sensor on → X0 = 1, limit switch pushed opens NC → X1 = 0', cpu.X[0] === 1 && cpu.X[1] === 0, `X0=${cpu.X[0]} X1=${cpu.X[1]}`);
  check('temperature transmitter 60 % → 6 V → D1110 = 1200', cpu.ai[0] === 1200, 'ai0=' + cpu.ai[0]);
}
{
  const { p, s, run } = sim('contactor-starter', (p) => { p.devices.find((d) => d.id === 'km1').props.coil = '230AC'; });
  run(300);
  s.act('start', 'press', true); run(100); s.act('start', 'press', false); run(500);
  check('230 V AC coil on 24 V DC: KM1 stays open and an issue explains it', !s.rts.get('km1').closed && s.issues.some((i) => /230 V AC coil/.test(i.text)));
  void p;
}

{
  // 3-position selector, 1-pole control breaker, terminal block and an interface relay driven by Y0
  const { s, run } = sim('blank', (p) => {
    p.devices.push({ id: 'sw', type: 'selector3', props: { label: 'DIR', pos0: 'FWD', pos1: 'REV' }, state: { pos: 0, last: 1 } });
    p.devices.push({ id: 'qf', type: 'breaker', props: { label: 'QF1', poles: '1P', rating: 'C2' }, state: { on: true } });
    p.devices.push({ id: 'x1', type: 'tb', props: { label: 'X1' }, state: {} });
    p.devices.push({ id: 'k1', type: 'relay', props: { label: 'K1' }, state: {} });
    p.devices.push({ id: 'lamp', type: 'lamp', props: { label: 'K1', color: 'green' }, state: {} });
    const c = (a, ap, b, bp) => p.conns.push(makeConn(p.devices, a, ap, b, bp));
    c('psu', '+V1', 'qf', '1'); c('qf', '2', 'x1', '1'); c('x1', '1b', 'sw', '13'); c('sw', '13', 'sw', '23');
    c('sw', '14', 'plc', 'X0'); c('sw', '24', 'plc', 'X1');
    c('plc', 'C0', 'psu', '+V2'); c('plc', 'Y0', 'k1', 'A1'); c('k1', 'A2', 'psu', '-V2');
    c('qf', '2', 'k1', '11'); c('k1', '14', 'lamp', 'X1'); c('lamp', 'X2', 'psu', '-V2');
    p.program = program([rung('', ['X0 => OUT Y0'])]);
    p.plc.downloaded = JSON.parse(JSON.stringify(p.program));
  });
  run(400);
  const cpu = s.plc.cpu;
  check('3-pos selector in 0: X0 = X1 = 0', cpu.X[0] === 0 && cpu.X[1] === 0);
  s.act('sw', 'toggle'); run(200);
  check('3-pos selector → FWD (through QF1 and the terminal block): X0 = 1, relay K1 pulls in, its NO contact lights the lamp', cpu.X[0] === 1 && cpu.X[1] === 0 && s.rts.get('k1').closed && s.rts.get('lamp').on, `X0=${cpu.X[0]} K1=${s.rts.get('k1').closed}`);
  s.act('sw', 'toggle'); run(100); s.act('sw', 'toggle'); run(200);
  check('3-pos selector → 0 → REV: X1 = 1, K1 drops out', cpu.X[0] === 0 && cpu.X[1] === 1 && !s.rts.get('k1').closed, `X0=${cpu.X[0]} X1=${cpu.X[1]}`);
  s.act('sw', 'toggle'); run(100); s.act('sw', 'toggle'); run(200);
  s.act('qf', 'toggle'); run(200);
  check('control breaker OFF: inputs and lamp go dark, an issue says so', cpu.X[0] === 0 && !s.rts.get('lamp').on && s.issues.some((i) => /QF1 is OFF/.test(i.text)), s.issues.map((i) => i.text).join(' | '));
}

// ---------------------------------------------------------------- regressions
{
  const r = rung('', ['X0| X1 => OUT Y0', 'Y0']);
  addRow(r, 1);
  const res = rungIL(r);
  check('addRow keeps an existing OR branch linked', !res.error && res.lines.map((l) => l.text).join('; ') === 'LD X0; OR Y0; AND X1; OUT Y0', res.error || res.lines.map((l) => l.text).join('; '));
  const r2 = rung('', ['X0| X1 => OUT Y0', 'Y0']);
  addRow(r2, 2);
  check('addRow at the end adds an unlinked row', rungIL(r2).lines.map((l) => l.text).join('; ') === 'LD X0; OR Y0; AND X1; OUT Y0');
}
{
  const v = new VfdMS300({ '02-00': 2, '00-21': 1, '00-20': 0 });
  v.powerOn(); v.bootT = 0; v.fKey = 50;
  v.MI = [0, 0, 1, 0, 0, 0];
  v.stepSim(0.01);
  v.MI = [1, 0, 1, 0, 0, 0];
  for (let i = 0; i < 100; i++) v.stepSim(0.01);
  check('MS300 3-wire: MI3 is STOP, not multi-step speed 1', v.fcmd === 50 && v.runCmd, 'fcmd=' + v.fcmd + ' run=' + v.runCmd);
}
{
  const cpu = new PlcCpu({ name: 'T', inputs: 8, outputs: 8 });
  cpu.load(compileProgram(program([rung('', ['M1000 => TMR T250 K100'])]), cpu.model));
  cpu.powerOn();
  cpu.step(1000);
  const tv = cpu.TV[250];
  cpu.M[2600] = 1;
  cpu.enterStop(); cpu.enterRun();
  check('STOP→RUN clears M2600 (non-latched)', cpu.M[2600] === 0);
  const snap = cpu.latchedSnapshot();
  cpu.powerOff();
  const cpu2 = new PlcCpu({ name: 'T', inputs: 8, outputs: 8 });
  cpu2.load(compileProgram(program([rung('', ['M1000 => TMR T250 K100'])]), cpu2.model));
  cpu2.powerOn(snap);
  check('accumulative T250 survives a power cycle', cpu2.TV[250] === tv && tv > 0, `before=${tv} after=${cpu2.TV[250]}`);
}

// ---------------------------------------------------------------- lab tasks (self-checking exercises)
function taskRunner(id, mutate) {
  const env = sim(id, mutate);
  const memo = {};
  const lab = { tab: '3d', views: { monitor: { sub: 'devices' } } };
  const ctx = () => {
    const v = env.s.byKind('vfd')[0];
    return { sys: env.s, lab, P: env.p, memo, rt: (x) => env.s.rts.get(x), dev: (x) => env.p.devices.find((d) => d.id === x),
      cpu: env.s.plc && env.s.plc.cpu.powered ? env.s.plc.cpu : null, vfd: v ? v.vfd : null, motor: env.s.byKind('motor')[0] || null,
      dl: JSON.stringify(env.p.plc.downloaded || {}) };
  };
  const tasks = LAB_TASKS[id];
  const done = (i) => !!tasks[i].check(ctx());
  return { ...env, lab, done };
}
for (const ex of LAB_EXAMPLES) check(`tasks defined for "${ex.id}"`, Array.isArray(LAB_TASKS[ex.id]) && LAB_TASKS[ex.id].length >= 3);
{
  const t = taskRunner('start-stop');
  t.run(400);
  check('task start-stop #1 (RUN)', t.done(0));
  t.s.act('start', 'press', true); t.run(100); t.s.act('start', 'press', false); t.run(100);
  check('task start-stop #2 (latched)', t.done(1));
  t.s.act('stop', 'press', true); t.run(100); t.s.act('stop', 'press', false); t.run(100);
  check('task start-stop #3 (stopped)', t.done(2));
  check('task start-stop #5 not done before editing', !t.done(4));
}
{
  const t = taskRunner('vfd-modbus-hmi');
  t.run(2000);
  t.s.act('start', 'press', true); t.run(100); t.s.act('start', 'press', false); t.run(7000);
  check('task modbus #1 (motor started)', t.done(0));
  t.s.plc.cpu.D[10] = 4500; t.run(5000);
  check('task modbus #2 (45 Hz)', t.done(1));
  t.s.act('es', 'toggle'); t.run(10000);
  check('task modbus #4 (E-stop)', t.done(3));
}
{
  const t = taskRunner('vfd-modbus-hmi', (p) => { const c = p.conns.find((x) => x.b.dev === 'motor' && x.b.port === 'V'); c.b.port = 'W'; const d = p.conns.find((x) => x.a.port === 'W/T3' && x.b.dev === 'motor'); d.b.port = 'V'; });
  t.run(2000);
  t.s.act('start', 'press', true); t.run(100); t.s.act('start', 'press', false); t.run(4000);
  check('task modbus #6 (reverse by phase swap)', t.done(5), 'rpm=' + t.s.rts.get('motor').rpm);
}
{
  const t = taskRunner('vfd-terminals');
  t.run(1500);
  t.s.act('fwd', 'press', true); t.run(100); t.s.act('fwd', 'press', false); t.run(3000);
  check('task terminals #1 (15 Hz)', t.done(0));
  const v = t.s.rts.get('vfd').vfd; v.setParam('01-12', 0.1);
  t.s.act('spd', 'toggle'); t.run(1000);
  check('task terminals #5 (ocA trip)', t.done(4), 'fault=' + v.fault);
}

{
  const t = taskRunner('contactor-starter');
  t.run(1500);
  t.s.act('start', 'press', true); t.run(100); t.s.act('start', 'press', false); t.run(4000);
  check('task starter #1 (KM1 in, motor turns)', t.done(0));
  t.s.act('photo', 'toggle'); t.run(3000);
  check('task starter #2 (box stops the drive)', t.done(1), 'f=' + t.s.rts.get('vfd').vfd.f);
  t.s.act('photo', 'toggle'); t.s.act('f1', 'toggle'); t.run(300);
  check('task starter #3 (overload trip)', t.done(2));
  t.s.act('f1', 'toggle'); t.run(100); t.s.act('start', 'press', true); t.run(100); t.s.act('start', 'press', false); t.run(300);
  check('task starter #4 (reset and restart)', t.done(3));
}

console.log(failures ? `\n${failures} FAILED` : '\nall PLC lab tests passed');
process.exit(failures ? 1 : 0);
