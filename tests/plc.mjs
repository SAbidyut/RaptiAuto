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
  hmi.pointerDown(130, 330); hmi.pointerUp(130, 330);
  const L = hmi.keypadLayout();
  const tap = (k) => { const b = L.keys.find((x) => x.k === k); hmi.pointerDown(b.x + 5, b.y + 5); hmi.pointerUp(b.x + 5, b.y + 5); };
  tap('4'); tap('5'); tap('ENT');
  run(4000);
  check('modbus: HMI set point → 45 Hz', Math.abs(v.f - 45) < 0.05, 'f=' + v.f + ' D10=' + s.plc.cpu.D[10]);
  s.act('es', 'toggle'); run(6000);
  check('modbus: E-stop stops the drive', v.f === 0 && !s.plc.cpu.M[0], 'f=' + v.f);
}

{
  const { s, run } = sim('vfd-modbus-hmi', (p) => { p.devices.find((d) => d.id === 'vfd').state.params['09-04'] = 1; });
  run(2000);
  check('modbus: protocol mismatch → time-out M1129', s.plc.cpu.M[1129] === 1 && s.rts.get('lflt').on, s.log.slice(-2).map((l) => l.info).join(' | '));
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
// ---------------------------------------------------------------- 3.0 examples
{
  const { s, run } = sim('star-delta');
  const st = () => ['k1', 'k2', 'k3'].map((i) => (s.rts.get(i).on ? 1 : 0)).join('');
  run(500);
  check('star-delta: idle, no issues', st() === '000' && !s.issues.length, s.issues.map((i) => i.text).join(' | '));
  s.act('start', 'press', true); run(100); s.act('start', 'press', false); run(1000);
  check('star-delta: K1 + K2 (star) at the start', st() === '110', st());
  run(4300);
  check('star-delta: pause between star and delta', st() === '100', st());
  run(500);
  check('star-delta: K1 + K3 (delta) after the star time', st() === '101', st());
  s.act('stop', 'press', true); run(100); s.act('stop', 'press', false); run(200);
  check('star-delta: STOP releases everything', st() === '000', st());
}
{
  const { s, run } = sim('bottle-filling');
  run(500);
  s.act('start', 'press', true); run(100); s.act('start', 'press', false); run(200);
  const valve = [];
  for (let n = 0; n < 5; n++) {
    s.act('bottle', 'toggle'); run(500); const early = s.rts.get('valve').on;
    run(1500); const mid = s.rts.get('valve').on;
    run(3000); const late = s.rts.get('valve').on;
    s.act('bottle', 'toggle'); run(500);
    valve.push(`${+early}${+mid}${+late}`);
  }
  check('bottle filling: valve closed → open → closed for every bottle', valve.every((v) => v === '010'), valve.join(' '));
  check('bottle filling: 5 bottles = batch done, horn', s.plc.cpu.CV[0] === 5 && s.rts.get('done').on, 'C0=' + s.plc.cpu.CV[0]);
  s.act('reset', 'press', true); run(100); s.act('reset', 'press', false); run(200);
  check('bottle filling: NEW BATCH resets the counter', s.plc.cpu.CV[0] === 0 && !s.rts.get('done').on);
}
{
  const { s, run } = sim('tank-level');
  run(300);
  check('tank: HMI link OK', s.hmiLinkState.ok, s.hmiLinkState.reason);
  let min = 999, max = -1, pumped = false, stopped = false, lowSeen = false;
  for (let t = 0; t < 60; t++) { run(1000); const d = s.plc.cpu.D[10]; min = Math.min(min, d); max = Math.max(max, d); if (s.rts.get('pump').on) pumped = true; else if (pumped) stopped = true; if (s.rts.get('low').on) lowSeen = true; }
  check('tank: hysteresis keeps the level between 15 % and 82 %', min >= 15 && max <= 82 && pumped && stopped, `min ${min} max ${max}`);
  check('tank: LOW lamp lights below 20 %', lowSeen);
  s.act('mode', 'toggle'); run(300);
  s.act('man', 'press', true); run(4200); s.act('man', 'press', false);
  check('tank: MANUAL pump button runs the pump', s.plc.cpu.D[10] > 0, 'D10=' + s.plc.cpu.D[10]);
}
{
  const { s, run } = sim('alarm-annunciator');
  const st = (a) => a.map((i) => (s.rts.get(i).on ? 1 : 0)).join('');
  run(400);
  check('alarms: all quiet at first', st(['l1', 'l2', 'l3', 'horn']) === '0000');
  s.act('a1', 'toggle'); let flashes = new Set(); for (let i = 0; i < 20; i++) { run(100); flashes.add(st(['l1'])); }
  check('alarms: new alarm flashes and sounds the horn', flashes.size === 2 && s.rts.get('horn').on);
  s.act('ack', 'press', true); run(100); s.act('ack', 'press', false); run(300);
  check('alarms: ACK makes the lamp steady and silences the horn', st(['l1', 'horn']) === '10');
  s.act('a1', 'toggle'); run(300);
  check('alarms: normal input clears the lamp', st(['l1', 'horn']) === '00');
}
{
  const { s, run } = sim('step-lights');
  const st = () => ['l1', 'l2', 'l3'].map((i) => (s.rts.get(i).on ? 1 : 0)).join('');
  run(400);
  check('step ladder: idle until START', st() === '000' && s.plc.cpu.S[0] === 1);
  s.act('start', 'press', true); run(100); s.act('start', 'press', false);
  const seq = []; for (let i = 0; i < 12; i++) { run(600); seq.push(st()); }
  check('step ladder: lamp chase 1 → 2 → 3 → idle', [...new Set(seq)].join(' ') === '100 010 001 000', [...new Set(seq)].join(' '));
  s.act('start', 'press', true); run(100); s.act('start', 'press', false); run(2200);
  s.act('stop', 'press', true); run(100); s.act('stop', 'press', false); run(300);
  check('step ladder: STOP returns to idle', st() === '000' && s.plc.cpu.S[0] === 1);
}
{
  const { s, run } = sim('vfd-auto-cycle');
  run(2000);
  s.act('start', 'press', true); run(100); s.act('start', 'press', false);
  const f = []; for (let i = 0; i < 20; i++) { run(1000); f.push(Math.round(s.rts.get('vfd').vfd.f)); }
  check('VFD auto cycle: 10 Hz → 30 Hz → 50 Hz → stop', f.includes(10) && f.includes(30) && f.includes(50) && f[f.length - 1] === 0, f.join(' '));
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

console.log(failures ? `\n${failures} FAILED` : '\nall PLC lab tests passed');
process.exit(failures ? 1 : 0);
