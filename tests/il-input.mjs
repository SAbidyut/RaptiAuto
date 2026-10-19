// Tests of the typed instruction input of the ladder editor: node tests/il-input.mjs
import { parseInstrLine, elementLine } from '../web/src/plc/sim/il-input.js';
import { compileProgram, emptyRung, placeContact, placeParallel, placeOutput, rungIL } from '../web/src/plc/sim/ladder.js';
import { PLC_MODELS } from '../web/src/plc/devices/defs.js';

let failures = 0;
function check(name, cond, detail = '') { if (!cond) failures++; console.log(`${cond ? '✓' : '✗'} ${name}${!cond && detail ? ' — ' + detail : ''}`); }
const ok = (line, place, t, extra = {}) => {
  const r = parseInstrLine(line);
  const good = !r.err && r.place === place && r.el.t === t && Object.entries(extra).every(([k, v]) => JSON.stringify(r.el[k]) === JSON.stringify(v));
  check(`"${line}" → ${place} ${t}`, good, JSON.stringify(r));
};
const bad = (line, re) => { const r = parseInstrLine(line); check(`"${line}" is refused`, !!r.err && re.test(r.err), r.err || JSON.stringify(r)); };

ok('LD X0', 'contact', 'NO', { a: ['X0'] });
ok('ld x0', 'contact', 'NO', { a: ['X0'] });
ok('LDI X1', 'contact', 'NC');
ok('AND X2', 'contact', 'NO');
ok('ANI M0', 'contact', 'NC');
ok('OR Y0', 'parallel', 'NO');
ok('ORI M1', 'parallel', 'NC');
ok('LDP X3', 'contact', 'P');
ok('ANDF X4', 'contact', 'F');
ok('ORP X5', 'parallel', 'P');
ok('LD= D0 K10', 'contact', 'CC', { op: '=', a: ['D0', 'K10'] });
ok('AND>= D0 K5', 'contact', 'CC', { op: '>=' });
ok('OR<> D1 K0', 'parallel', 'CC', { op: '<>' });
ok('DLD> D0 K100000', 'contact', 'CC', { d: true });
ok('FLD< D0 F1.5', 'contact', 'FCC', { op: '<' });
ok('X0', 'contact', 'NO', { a: ['X0'] });
ok('/X1', 'contact', 'NC', { a: ['X1'] });
ok('^X2', 'contact', 'P', { a: ['X2'] });
ok('-', 'contact', 'H');
ok('INV', 'contact', 'INV');
ok('STL S10', 'stl', 'STL');
ok('OUT Y0', 'output', 'OUT');
ok('SET M0', 'output', 'SET');
ok('RST C0', 'output', 'RST');
ok('TMR T0 K50', 'output', 'TMR', { a: ['T0', 'K50'] });
ok('CNT C0 K5', 'output', 'CNT');
ok('MOV K10 D0', 'output', 'MOV');
ok('MOVP K10 D0', 'output', 'MOV', { p: true });
ok('DMOV K100000 D0', 'output', 'MOV', { d: true });
ok('ADDP D11 K500 D11', 'output', 'ADD', { p: true });
ok('MODRW K1 K6 H2000 D10 K1', 'output', 'MODRW');
ok('MODWR K1 H2000 D1', 'output', 'MODWR');
ok('FROM K0 K12 D0 K4', 'output', 'FROM');
ok('TO K0 K1 H40 K1', 'output', 'TO');
ok('FEND', 'output', 'FEND');
ok('ld  x0 ', 'contact', 'NO');
bad('', /Type an instruction/);
bad('FOO X0', /Unknown instruction/);
bad('MOV K10', /needs 2 operands/);
bad('OUT X0', /cannot be used here/);
bad('LD X8', /octal/);
bad('TMR T0', /needs 2 operands/);
bad('FEND X0', /takes no operands/);

// round trip: the line of an element parses back to the same element
for (const line of ['LD X0', 'LDI X1', 'LDP X2', 'LD>= D0 K10', 'OUT Y0', 'MOVP K1 D0', 'DMOV K100000 D0', 'TMR T0 K50', 'MODRW K1 K3 H2103 D20 K2']) {
  const r = parseInstrLine(line);
  check(`round trip "${line}"`, elementLine(r.el) === line, elementLine(r.el));
}
check('a contact after column 1 reads as AND', elementLine({ t: 'NC', a: ['X1'] }, 3) === 'ANI X1');

// typing a whole network (the same placement the editor does) compiles to the typed IL
{
  const r = emptyRung();
  const put = (line, row, col) => { const p = parseInstrLine(line); if (p.place === 'parallel') placeParallel(r, row, col, p.el); else if (p.place === 'output') placeOutput(r, row, p.el); else placeContact(r, row, col, p.el); };
  put('LD X0', 0, 0); put('OR M0', 0, 0); put('ANI X1', 0, 1); put('OUT M0', 0, 0);
  const il = rungIL(r).lines.map((l) => l.text).join('; ');
  check('LD X0 / OR M0 / ANI X1 / OUT M0 → the same IL', il === 'LD X0; OR M0; ANI X1; OUT M0', il);
  const c = compileProgram({ cols: 8, rungs: [r], comments: {} }, PLC_MODELS['dvp-16es2']);
  check('…and compiles', c.ok, JSON.stringify(c.errors));
}

console.log(failures ? `\n${failures} input test(s) FAILED` : '\nall instruction-input tests passed');
process.exit(failures ? 1 : 0);
