// Ladder diagram model (ISPSoft style grid), editing helpers, compiler, IL (instruction list)
// generator and the executable form used by the PLC CPU.
//
// A program is a list of networks ("rungs"). Every rung is a grid of `cols` contact cells per
// row plus one output cell at the right end of each row. Vertical links join two rows at the
// right edge of a cell: vl[r][c] links row r and row r+1 at the boundary right of column c.
// Power flows left → right only; links OR the rows they join (no reverse power flow).
import { parseOperand, BIT_DEVS, fmtAddr, DEVICES } from './address.js';

export const COLS = 8;

// Operand classes
const OPCLASS = {
  bit: ['X', 'Y', 'M', 'S', 'T', 'C'],
  bitw: ['Y', 'M', 'S'],
  rst: ['Y', 'M', 'S', 'T', 'C', 'D'],
  timer: ['T'],
  counter: ['C'],
  word: ['K', 'H', 'D', 'T', 'C'],
  wordw: ['D', 'T', 'C'],
  dreg: ['D'],
  zone: ['Y', 'M', 'S', 'T', 'C', 'D'],
  n: ['K', 'H'],
  bitsrc: ['X', 'Y', 'M', 'S'],
  bword: ['Y', 'M', 'S', 'D'],
  wsrc: ['X', 'Y', 'M', 'S', 'D', 'T', 'C'],
  step: ['S'],
  nest: ['N'],
  ptr: ['P'],
};
export const OPERAND_DEVS = OPCLASS;

// kind: contact (in the grid), wire, out (coil) or box (API instruction, output column).
// rail: may stand on the left bus bar with no contact in front (FEND, SRET, MCR, RET).
// flow: changes the order the CPU runs the networks in (jumps, subroutines, master control, steps).
// cat: group in the instruction picker.
export const INSTR = {
  NO: { kind: 'contact', cat: 'contact', name: 'Normally open contact', il: ['LD', 'AND', 'OR'], ops: ['bit'], labels: ['Device'], steps: 1, def: ['X0'] },
  NC: { kind: 'contact', cat: 'contact', name: 'Normally closed contact', il: ['LDI', 'ANI', 'ORI'], ops: ['bit'], labels: ['Device'], steps: 1, def: ['X1'] },
  P: { kind: 'contact', cat: 'contact', name: 'Rising-edge contact', il: ['LDP', 'ANDP', 'ORP'], ops: ['bit'], labels: ['Device'], steps: 2, def: ['X0'] },
  F: { kind: 'contact', cat: 'contact', name: 'Falling-edge contact', il: ['LDF', 'ANDF', 'ORF'], ops: ['bit'], labels: ['Device'], steps: 2, def: ['X0'] },
  CC: { kind: 'contact', cat: 'compare', name: 'Compare contact (=, <>, >, >=, <, <=, &, |, ^)', il: ['LD', 'AND', 'OR'], ops: ['word', 'word'], labels: ['S1', 'S2'], steps: 5, def: ['D0', 'K10'], cmp: true },
  INV: { kind: 'contact', cat: 'contact', name: 'Inverse (NOT) of the result', il: [null, 'INV', null], ops: [], labels: [], steps: 1, def: [] },
  MEP: { kind: 'contact', cat: 'contact', name: 'Rising edge of the result (pulse)', il: [null, 'MEP', null], ops: [], labels: [], steps: 1, def: [] },
  MEF: { kind: 'contact', cat: 'contact', name: 'Falling edge of the result (pulse)', il: [null, 'MEF', null], ops: [], labels: [], steps: 1, def: [] },
  STL: { kind: 'contact', cat: 'step', name: 'Step ladder: start of step S', il: ['STL', null, null], ops: ['step'], labels: ['Step'], steps: 1, def: ['S0'], stl: true, flow: true },
  H: { kind: 'wire', name: 'Horizontal line', ops: [], labels: [], steps: 0, def: [] },
  OUT: { kind: 'out', cat: 'coil', name: 'Output coil', ops: ['bitw'], labels: ['Device'], steps: 1, def: ['Y0'] },
  SET: { kind: 'out', cat: 'coil', name: 'Set (latch ON)', ops: ['bitw'], labels: ['Device'], steps: 1, def: ['M0'] },
  RST: { kind: 'out', cat: 'coil', name: 'Reset (OFF / clear)', ops: ['rst'], labels: ['Device'], steps: 1, def: ['M0'] },
  PLS: { kind: 'out', cat: 'coil', name: 'Rising-edge pulse output', ops: ['bitw'], labels: ['Device'], steps: 2, def: ['M10'] },
  PLF: { kind: 'out', cat: 'coil', name: 'Falling-edge pulse output', ops: ['bitw'], labels: ['Device'], steps: 2, def: ['M11'] },
  TMR: { kind: 'box', cat: 'timer', name: '16-bit timer', ops: ['timer', 'word'], labels: ['Timer', 'Set value'], steps: 4, def: ['T0', 'K10'] },
  CNT: { kind: 'box', cat: 'timer', name: '16-bit counter', ops: ['counter', 'word'], labels: ['Counter', 'Set value'], steps: 4, def: ['C0', 'K10'] },
  // program flow
  MC: { kind: 'box', cat: 'flow', name: 'Master control start: OFF → the networks up to MCR run with no power', ops: ['nest'], labels: ['Nesting level'], steps: 3, def: ['N0'], flow: true },
  MCR: { kind: 'box', cat: 'flow', name: 'Master control reset (end of the MC block)', ops: ['nest'], labels: ['Nesting level'], steps: 3, def: ['N0'], flow: true, rail: true },
  CJ: { kind: 'box', cat: 'flow', api: 0, name: 'Conditional jump to the network with pointer P', ops: ['ptr'], labels: ['Pointer'], steps: 3, pulse: true, def: ['P0'], flow: true },
  CALL: { kind: 'box', cat: 'flow', api: 1, name: 'Call subroutine P (placed after FEND)', ops: ['ptr'], labels: ['Pointer'], steps: 3, pulse: true, def: ['P1'], flow: true },
  SRET: { kind: 'box', cat: 'flow', api: 2, name: 'End of a subroutine (return)', ops: [], labels: [], steps: 1, def: [], flow: true, rail: true },
  FEND: { kind: 'box', cat: 'flow', api: 6, name: 'End of the main program (subroutines follow)', ops: [], labels: [], steps: 1, def: [], flow: true, rail: true },
  RET: { kind: 'box', cat: 'step', name: 'End of the step ladder (STL block)', ops: [], labels: [], steps: 1, def: [], flow: true, rail: true },
  // compare & move
  CMP: { kind: 'box', cat: 'compare', api: 10, name: 'Compare → 3 bits (>, =, <)', ops: ['word', 'word', 'bitw'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'K10', 'M10'] },
  ZCP: { kind: 'box', cat: 'compare', api: 11, name: 'Zone compare → 3 bits (S < S1, S1 ≤ S ≤ S2, S > S2)', ops: ['word', 'word', 'word', 'bitw'], labels: ['S1 (low)', 'S2 (high)', 'S', 'D'], steps: 9, pulse: true, def: ['K10', 'K20', 'D0', 'M20'] },
  MOV: { kind: 'box', cat: 'move', api: 12, name: 'Move', ops: ['word', 'wordw'], labels: ['S', 'D'], steps: 5, pulse: true, def: ['K0', 'D0'] },
  CML: { kind: 'box', cat: 'move', api: 14, name: 'Complement (invert every bit)  D = NOT S', ops: ['word', 'wordw'], labels: ['S', 'D'], steps: 5, pulse: true, def: ['D0', 'D1'] },
  BMOV: { kind: 'box', cat: 'move', api: 15, name: 'Block move: n words S… → D…', ops: ['wordw', 'wordw', 'n'], labels: ['S', 'D', 'n'], steps: 7, pulse: true, def: ['D0', 'D10', 'K4'] },
  FMOV: { kind: 'box', cat: 'move', api: 16, name: 'Fill move: S → n words D…', ops: ['word', 'wordw', 'n'], labels: ['S', 'D', 'n'], steps: 7, pulse: true, def: ['K0', 'D0', 'K10'] },
  XCH: { kind: 'box', cat: 'move', api: 17, name: 'Exchange two words', ops: ['wordw', 'wordw'], labels: ['D1', 'D2'], steps: 5, pulse: true, def: ['D0', 'D1'], defP: true },
  BCD: { kind: 'box', cat: 'move', api: 18, name: 'Binary → BCD', ops: ['word', 'wordw'], labels: ['S', 'D'], steps: 5, pulse: true, def: ['D0', 'D1'] },
  BIN: { kind: 'box', cat: 'move', api: 19, name: 'BCD → binary', ops: ['word', 'wordw'], labels: ['S', 'D'], steps: 5, pulse: true, def: ['D0', 'D1'] },
  SWAP: { kind: 'box', cat: 'move', api: 147, name: 'Swap the high and low byte', ops: ['wordw'], labels: ['D'], steps: 3, pulse: true, def: ['D0'], defP: true },
  // arithmetic
  ADD: { kind: 'box', cat: 'math', api: 20, name: 'Addition  D = S1 + S2', ops: ['word', 'word', 'wordw'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'K1', 'D0'] },
  SUB: { kind: 'box', cat: 'math', api: 21, name: 'Subtraction  D = S1 − S2', ops: ['word', 'word', 'wordw'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'K1', 'D0'] },
  MUL: { kind: 'box', cat: 'math', api: 22, name: 'Multiplication  D+1,D = S1 × S2', ops: ['word', 'word', 'dreg'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'K10', 'D2'] },
  DIV: { kind: 'box', cat: 'math', api: 23, name: 'Division  D = S1 ÷ S2, D+1 = remainder', ops: ['word', 'word', 'dreg'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'K10', 'D2'] },
  INC: { kind: 'box', cat: 'math', api: 24, name: 'Increment  D = D + 1', ops: ['wordw'], labels: ['D'], steps: 3, pulse: true, def: ['D0'], defP: true },
  DEC: { kind: 'box', cat: 'math', api: 25, name: 'Decrement  D = D − 1', ops: ['wordw'], labels: ['D'], steps: 3, pulse: true, def: ['D0'], defP: true },
  NEG: { kind: 'box', cat: 'math', api: 29, name: 'Negate  D = −D', ops: ['wordw'], labels: ['D'], steps: 3, pulse: true, def: ['D0'], defP: true },
  ABS: { kind: 'box', cat: 'math', api: 87, name: 'Absolute value  D = |D|', ops: ['wordw'], labels: ['D'], steps: 3, pulse: true, def: ['D0'], defP: true },
  SQR: { kind: 'box', cat: 'math', api: 48, name: 'Square root  D = √S', ops: ['word', 'wordw'], labels: ['S', 'D'], steps: 5, pulse: true, def: ['D0', 'D1'] },
  MEAN: { kind: 'box', cat: 'math', api: 45, name: 'Mean of n words S… → D', ops: ['wordw', 'wordw', 'n'], labels: ['S', 'D', 'n'], steps: 7, pulse: true, def: ['D0', 'D10', 'K4'] },
  SCAL: { kind: 'box', cat: 'math', api: 202, name: 'Scale  D = S1 × S2 ÷ 1000 + S3', ops: ['word', 'word', 'word', 'wordw'], labels: ['S1 (value)', 'S2 (slope ×0.001)', 'S3 (offset)', 'D'], steps: 9, pulse: true, def: ['D1110', 'K500', 'K0', 'D0'] },
  // word logic & bits
  WAND: { kind: 'box', cat: 'logic', api: 26, name: 'Word AND  D = S1 AND S2', ops: ['word', 'word', 'wordw'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'H00FF', 'D1'] },
  WOR: { kind: 'box', cat: 'logic', api: 27, name: 'Word OR  D = S1 OR S2', ops: ['word', 'word', 'wordw'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'H00FF', 'D1'] },
  WXOR: { kind: 'box', cat: 'logic', api: 28, name: 'Word XOR  D = S1 XOR S2', ops: ['word', 'word', 'wordw'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'H00FF', 'D1'] },
  ROR: { kind: 'box', cat: 'logic', api: 30, name: 'Rotate right n bits', ops: ['wordw', 'n'], labels: ['D', 'n'], steps: 5, pulse: true, def: ['D0', 'K1'], defP: true },
  ROL: { kind: 'box', cat: 'logic', api: 31, name: 'Rotate left n bits', ops: ['wordw', 'n'], labels: ['D', 'n'], steps: 5, pulse: true, def: ['D0', 'K1'], defP: true },
  SFTR: { kind: 'box', cat: 'logic', api: 34, name: 'Bit shift right: n2 bits of S enter n1 bits of D', ops: ['bitsrc', 'bitw', 'n', 'n'], labels: ['S', 'D', 'n1', 'n2'], steps: 9, pulse: true, def: ['X0', 'M0', 'K8', 'K1'], defP: true },
  SFTL: { kind: 'box', cat: 'logic', api: 35, name: 'Bit shift left: n2 bits of S enter n1 bits of D', ops: ['bitsrc', 'bitw', 'n', 'n'], labels: ['S', 'D', 'n1', 'n2'], steps: 9, pulse: true, def: ['X0', 'M0', 'K8', 'K1'], defP: true },
  ZRST: { kind: 'box', cat: 'logic', api: 40, name: 'Zone reset', ops: ['zone', 'zone'], labels: ['D1', 'D2'], steps: 5, pulse: true, def: ['M0', 'M9'] },
  DECO: { kind: 'box', cat: 'logic', api: 41, name: 'Decoder: bit number S (n bits) → ON bit in D', ops: ['word', 'bword', 'n'], labels: ['S', 'D', 'n'], steps: 7, pulse: true, def: ['D0', 'M0', 'K3'] },
  ENCO: { kind: 'box', cat: 'logic', api: 42, name: 'Encoder: highest ON bit of S (2ⁿ bits) → D', ops: ['wsrc', 'dreg', 'n'], labels: ['S', 'D', 'n'], steps: 7, pulse: true, def: ['M0', 'D0', 'K3'] },
  SUM: { kind: 'box', cat: 'logic', api: 43, name: 'Number of ON bits in S → D', ops: ['word', 'wordw'], labels: ['S', 'D'], steps: 5, pulse: true, def: ['D0', 'D1'] },
  BON: { kind: 'box', cat: 'logic', api: 44, name: 'Check bit n of S → D', ops: ['word', 'bitw', 'n'], labels: ['S', 'D', 'n'], steps: 7, pulse: true, def: ['D0', 'M0', 'K0'] },
  ALT: { kind: 'box', cat: 'logic', api: 66, name: 'Alternate (toggle) bit', ops: ['bitw'], labels: ['D'], steps: 3, pulse: true, def: ['M0'], defP: true },
  // communication
  MODRW: { kind: 'box', cat: 'comm', api: 150, name: 'Modbus read / write (COM2)', ops: ['word', 'word', 'word', 'dreg', 'word'], labels: ['Station', 'Function', 'Address', 'Data reg.', 'Length'], steps: 11, def: ['K1', 'K6', 'H2000', 'D0', 'K1'] },
};

/** Instruction picker groups, in order. */
export const INSTR_GROUPS = [
  ['contact', 'Contacts'],
  ['coil', 'Coils'],
  ['compare', 'Compare'],
  ['timer', 'Timers & counters'],
  ['move', 'Data move & conversion'],
  ['math', 'Arithmetic'],
  ['logic', 'Word logic, shift & bits'],
  ['flow', 'Program flow (MC, CJ, CALL, FEND)'],
  ['step', 'Step ladder (STL / RET)'],
  ['comm', 'Communication'],
];

export const CMP_OPS = ['=', '<>', '>', '>=', '<', '<=', '&', '|', '^'];

export const isContactType = (t) => INSTR[t] && (INSTR[t].kind === 'contact' || INSTR[t].kind === 'wire');
export const isOutputType = (t) => INSTR[t] && (INSTR[t].kind === 'out' || INSTR[t].kind === 'box');

let uid = 0;
export const rungId = () => 'n' + Date.now().toString(36) + (uid++).toString(36);

export const isRailInstr = (t) => !!(INSTR[t] && INSTR[t].rail);

export function newElement(t, args, extra = {}) {
  const d = INSTR[t];
  const el = { t, a: args ? args.slice() : d.def.slice() };
  if (t === 'CC') el.op = extra.op || '>';
  if (d.pulse && (extra.p !== undefined ? extra.p : d.defP)) el.p = true;
  return el;
}

export function emptyRung(cols = COLS) {
  return { id: rungId(), comment: '', cells: [new Array(cols).fill(null)], outs: [null], vl: [] };
}

export function createProgram() {
  return { cols: COLS, rungs: [emptyRung()], comments: {} };
}

export function normalizeProgram(p) {
  const prog = p && Array.isArray(p.rungs) ? p : createProgram();
  prog.cols = prog.cols || COLS;
  prog.comments = prog.comments || {};
  if (!prog.rungs.length) prog.rungs.push(emptyRung(prog.cols));
  for (const r of prog.rungs) {
    r.id = r.id || rungId();
    r.comment = r.comment || '';
    if (r.label !== undefined && !/^P\d{1,3}$/.test(r.label || '')) delete r.label;
    if (!Array.isArray(r.cells) || !r.cells.length) r.cells = [new Array(prog.cols).fill(null)];
    for (let i = 0; i < r.cells.length; i++) {
      const row = r.cells[i] || [];
      r.cells[i] = Array.from({ length: prog.cols }, (_, c) => row[c] || null);
    }
    r.outs = Array.from({ length: r.cells.length }, (_, i) => (r.outs && r.outs[i]) || null);
    r.vl = Array.from({ length: r.cells.length - 1 }, (_, i) => Array.from({ length: prog.cols }, (_, c) => !!(r.vl && r.vl[i] && r.vl[i][c])));
  }
  return prog;
}

// ------------------------------------------------------------------ editing helpers
export function rowCount(rung) { return rung.cells.length; }

export function addRow(rung, at = rung.cells.length) {
  const cols = rung.cells[0].length;
  const n = rung.cells.length;
  rung.cells.splice(at, 0, new Array(cols).fill(null));
  rung.outs.splice(at, 0, null);
  // vl[i] joins row i and i+1. A row inserted between two linked rows keeps them linked
  // (the vertical line simply passes through the new row).
  if (at > 0 && at < n) rung.vl.splice(at, 0, rung.vl[at - 1].slice());
  else if (at === 0) rung.vl.unshift(new Array(cols).fill(false));
  else rung.vl.push(new Array(cols).fill(false));
}

export function deleteRow(rung, r) {
  if (rung.cells.length <= 1) { rung.cells[0].fill(null); rung.outs[0] = null; return; }
  rung.cells.splice(r, 1);
  rung.outs.splice(r, 1);
  const li = Math.min(r, rung.vl.length - 1);
  rung.vl.splice(li, 1);
}

/** Remove empty rows at the bottom (keeps at least one). */
export function trimRows(rung) {
  for (let r = rung.cells.length - 1; r > 0; r--) {
    const empty = !rung.outs[r] && rung.cells[r].every((x) => !x) && !(rung.vl[r - 1] || []).some(Boolean);
    if (!empty) break;
    rung.cells.pop(); rung.outs.pop(); rung.vl.pop();
  }
}

/** Fill empty cells with horizontal lines between the last element of a row and its output. */
export function fillToOutput(rung, r) {
  const row = rung.cells[r];
  let last = -1;
  for (let c = 0; c < row.length; c++) if (row[c]) last = c;
  if (last < 0 && r > 0) return;
  for (let c = last + 1; c < row.length; c++) if (!row[c]) row[c] = { t: 'H', a: [] };
}

export function placeContact(rung, r, c, el) {
  while (r >= rung.cells.length) addRow(rung);
  rung.cells[r][c] = el;
}

/** Contact in parallel (OR) with the cell at (r,c): goes into the row below with links on both sides. */
export function placeParallel(rung, r, c, el) {
  let rr = r + 1;
  if (rr < rung.cells.length && rung.cells[rr][c]) { addRow(rung, rr); }
  while (rr >= rung.cells.length) addRow(rung);
  rung.cells[rr][c] = el;
  rung.vl[r][c] = true;
  if (c > 0) rung.vl[r][c - 1] = true;
  return rr;
}

export function placeOutput(rung, r, el) {
  while (r >= rung.cells.length) addRow(rung);
  rung.outs[r] = el;
  const row = rung.cells[r];
  if (isRailInstr(el.t) && row.every((x) => !x || x.t === 'H')) {
    // FEND, SRET, MCR, RET: a plain line from the left bus bar
    for (let c = 0; c < row.length; c++) row[c] = { t: 'H', a: [] };
    if (r > 0) rung.vl[r - 1][row.length - 1] = false;
  } else if (r > 0 && row.every((x) => !x)) {
    // a parallel output: join to the row above at the output column
    rung.vl[r - 1][row.length - 1] = true;
  } else fillToOutput(rung, r);
}

/** Insert an empty cell at (r, c), shifting the rest of the row right. False if the row is full. */
export function insertCell(rung, r, c) {
  const row = rung.cells[r];
  const last = row[row.length - 1];
  if (last && last.t !== 'H') return false;
  for (let i = row.length - 1; i > c; i--) row[i] = row[i - 1];
  row[c] = null;
  return true;
}

/** Delete the cell at (r, c), shifting the rest of the row left (a line fills the end if the row has an output). */
export function deleteCell(rung, r, c) {
  const row = rung.cells[r];
  for (let i = c; i < row.length - 1; i++) row[i] = row[i + 1];
  row[row.length - 1] = rung.outs[r] && row[row.length - 2] ? { t: 'H', a: [] } : null;
}

export function toggleLink(rung, r, c) {
  if (r >= rung.cells.length - 1) addRow(rung);
  rung.vl[r][c] = !rung.vl[r][c];
}

export function rungIsEmpty(rung) {
  return rung.outs.every((x) => !x) && rung.cells.every((row) => row.every((x) => !x));
}

/** The step relay of a rung that starts with STL (cell 0,0), or null. */
export function stlOf(rung) {
  const el = rung.cells[0] && rung.cells[0][0];
  return el && el.t === 'STL' ? el.a[0] : null;
}

// ------------------------------------------------------------------ operand checks
function checkOperand(text, cls, ctx) {
  const op = parseOperand(text);
  if (!op) return { err: `“${text || '?'}” is not a valid device` + (/^[XY]\d*[89]/i.test(text || '') ? ' (X and Y are octal: 0–7, 10–17 …)' : '') };
  const allowed = OPCLASS[cls] || [];
  if (!allowed.includes(op.dev)) return { err: `${op.text} cannot be used here (allowed: ${allowed.join(', ')})` };
  if (op.dev === 'X' && ctx && ctx.model && op.idx >= ctx.model.inputs && op.idx < 0o400) ctx.warn(`${op.text} is not a physical input of ${ctx.model.name} (X0–${fmtAddr('X', Math.max(0, ctx.model.inputs - 1))})`);
  if (op.dev === 'Y' && ctx && ctx.model && op.idx >= ctx.model.outputs) ctx.warn(`${op.text} is not a physical output of ${ctx.model.name} (Y0–${fmtAddr('Y', Math.max(0, ctx.model.outputs - 1))})`);
  return { op };
}

export function elementText(el) {
  if (!el) return '';
  if (el.t === 'H') return '';
  if (el.t === 'CC') return `${el.a[0]} ${el.op} ${el.a[1]}`;
  if (el.t === 'INV' || el.t === 'MEP' || el.t === 'MEF') return el.t;
  if (el.t === 'STL') return `STL ${el.a[0]}`;
  const d = INSTR[el.t];
  if (d.kind === 'box') return `${el.t}${el.p ? 'P' : ''} ${el.a.join(' ')}`;
  return el.a[0] || '';
}

export function mnemonic(el) {
  if (!el) return '';
  const d = INSTR[el.t];
  if (d.kind === 'box') return el.t + (el.p ? 'P' : '');
  return el.t;
}

// ------------------------------------------------------------------ graph & series-parallel reduction
function buildGraph(rung) {
  const rows = rung.cells.length, cols = rung.cells[0].length;
  // node index (r, b): b = 0..cols
  const parent = new Int32Array(rows * (cols + 1)).map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const id = (r, b) => r * (cols + 1) + b;
  const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  for (let r = 1; r < rows; r++) unite(id(0, 0), id(r, 0)); // left rail
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols; c++) if (rung.vl[r] && rung.vl[r][c]) unite(id(r, c + 1), id(r + 1, c + 1));
  const node = (r, b) => find(id(r, b));
  const edges = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const el = rung.cells[r][c];
    if (el) edges.push({ u: node(r, c), v: node(r, c + 1), x: el.t === 'H' ? { k: 'T' } : { k: 'L', el, r, c } });
  }
  return { rows, cols, node, edges, rail: node(0, 0) };
}

const keyOf = (x) => (x.k === 'L' ? `L${x.r}_${x.c}` : x.k === 'T' ? 'T' : `${x.k}(${x.a.map(keyOf).join(',')})`);

function mkSer(items) {
  const out = [];
  for (const it of items) {
    if (it.k === 'T') continue;
    if (it.k === 'S') out.push(...it.a); else out.push(it);
  }
  if (!out.length) return { k: 'T' };
  return out.length === 1 ? out[0] : { k: 'S', a: out };
}
function mkPar(items) {
  const out = [];
  for (const it of items) {
    if (it.k === 'T') return { k: 'T' };
    if (it.k === 'P') out.push(...it.a); else out.push(it);
  }
  return out.length === 1 ? out[0] : { k: 'P', a: out };
}

/** Logic expression from the left rail to node `t`, or null if not series-parallel. 'none' if unreachable. */
function exprTo(g, t) {
  // keep only edges on a rail → t path
  const fwd = new Set([g.rail]);
  let grew = true;
  while (grew) { grew = false; for (const e of g.edges) if (fwd.has(e.u) && !fwd.has(e.v)) { fwd.add(e.v); grew = true; } }
  if (!fwd.has(t)) return 'none';
  const bwd = new Set([t]);
  grew = true;
  while (grew) { grew = false; for (const e of g.edges) if (bwd.has(e.v) && !bwd.has(e.u)) { bwd.add(e.u); grew = true; } }
  let edges = g.edges.filter((e) => fwd.has(e.u) && bwd.has(e.v)).map((e) => ({ ...e }));
  if (t === g.rail) return { k: 'T' };
  for (let guard = 0; guard < 500; guard++) {
    let changed = false;
    // parallel merge
    const groups = new Map();
    for (const e of edges) { const k = e.u + '>' + e.v; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    if (groups.size < edges.length) {
      edges = [...groups.values()].map((list) => (list.length === 1 ? list[0] : { u: list[0].u, v: list[0].v, x: mkPar(list.map((e) => e.x)) }));
      changed = true;
    }
    // series merge
    const inc = new Map(), out = new Map();
    for (const e of edges) { inc.set(e.v, (inc.get(e.v) || 0) + 1); out.set(e.u, (out.get(e.u) || 0) + 1); }
    for (const [n, cnt] of inc) {
      if (n === t || n === g.rail || cnt !== 1 || out.get(n) !== 1) continue;
      const a = edges.find((e) => e.v === n), b = edges.find((e) => e.u === n);
      edges = edges.filter((e) => e !== a && e !== b);
      edges.push({ u: a.u, v: b.v, x: mkSer([a.x, b.x]) });
      changed = true;
      break;
    }
    if (edges.length === 1 && edges[0].u === g.rail && edges[0].v === t) return edges[0].x;
    if (!changed) return null;
  }
  return null;
}

// ------------------------------------------------------------------ IL emission
class ILWriter {
  constructor() { this.lines = []; this.err = null; }
  push(text, steps = 1, ref = null) { this.lines.push({ text, steps, ref }); }
  leaf(x, mode) {
    const el = x.el, d = INSTR[el.t];
    const i = mode === 'LD' ? 0 : mode === 'AND' ? 1 : 2;
    if (el.t === 'INV' || el.t === 'MEP' || el.t === 'MEF') {
      if (mode !== 'AND') { this.err = `${el.t} must follow a contact in series`; return; }
      this.push(el.t, 1, x); return;
    }
    if (el.t === 'STL') { this.err = 'STL must be the first cell of a network (on the left bus bar)'; return; }
    if (el.t === 'CC') { this.push(`${d.il[i]}${el.op} ${el.a[0]} ${el.a[1]}`, d.steps, x); return; }
    this.push(`${d.il[i]} ${el.a[0]}`, d.steps, x);
  }
  start(x) {
    if (x.k === 'L') this.leaf(x, 'LD');
    else if (x.k === 'S') { this.start(x.a[0]); for (const it of x.a.slice(1)) this.and(it); }
    else if (x.k === 'P') { this.start(x.a[0]); for (const it of x.a.slice(1)) this.or(it); }
  }
  and(x) {
    if (x.k === 'L') this.leaf(x, 'AND');
    else if (x.k === 'S') for (const it of x.a) this.and(it);
    else if (x.k === 'P') { this.start(x); this.push('ANB'); }
  }
  or(x) {
    if (x.k === 'L') this.leaf(x, 'OR');
    else if (x.k === 'P') for (const it of x.a) this.or(it);
    else if (x.k === 'S') { this.start(x); this.push('ORB'); }
  }
  output(el) {
    const d = INSTR[el.t];
    let steps = d.steps;
    if (el.t === 'RST' && /^[TCD]/.test(el.a[0] || '')) steps = 3;
    if (el.t === 'OUT' && /^S/.test(el.a[0] || '')) steps = 2;
    this.push(`${mnemonic(el)}${el.a.length ? ' ' + el.a.join(' ') : ''}`, steps, { out: el });
  }
}

/** Instruction list for one rung. Returns {lines, error}. */
export function rungIL(rung, onStepBus = false) {
  const stl = stlOf(rung);
  if (stl) {
    // STL Sn starts a new bus: what follows it starts again with LD
    const rest = { ...rung, cells: rung.cells.map((row, r) => (r === 0 ? [{ t: 'H', a: [] }, ...row.slice(1)] : row)) };
    const res = rungIL(rest, true);
    return res.error ? res : { lines: [{ text: `STL ${stl}`, steps: 1, ref: null }, ...res.lines], error: null };
  }
  return rungILPlain(rung, onStepBus);
}

function rungILPlain(rung, onStepBus) {
  const g = buildGraph(rung);
  const w = new ILWriter();
  let groups = []; // [{node, outs:[el]}]
  for (let r = 0; r < g.rows; r++) {
    const o = rung.outs[r];
    if (!o) continue;
    const n = g.node(r, g.cols);
    let gr = groups.find((x) => x.node === n);
    if (!gr) { gr = { node: n, outs: [] }; groups.push(gr); }
    gr.outs.push(o);
  }
  if (!groups.length) return { lines: [], error: 'no output instruction' };
  // FEND / SRET / MCR / RET stand on the bus bar on their own
  const railOnly = groups.filter((gr) => gr.outs.every((o) => isRailInstr(o.t)));
  for (const gr of railOnly) {
    const x = exprTo(g, gr.node);
    if (x !== 'none' && x !== null && x.k !== 'T') return { lines: [], error: `${gr.outs.map((o) => o.t).join(', ')} takes no contacts — connect it straight to the left bus bar` };
  }
  const mixed = groups.find((gr) => gr.outs.some((o) => isRailInstr(o.t)) && !gr.outs.every((o) => isRailInstr(o.t)));
  if (mixed) return { lines: [], error: `${mixed.outs.find((o) => isRailInstr(o.t)).t} cannot share a row with other outputs` };
  const tail = railOnly.flatMap((gr) => gr.outs);
  groups = groups.filter((gr) => !railOnly.includes(gr));
  for (const gr of groups) {
    gr.x = exprTo(g, gr.node);
    if (gr.x === 'none') return { lines: [], error: 'an output is not connected to the left bus bar' };
    if (gr.x === null) return { lines: [], error: 'this network cannot be converted (bridge circuit)' };
    if (gr.x.k === 'T' && !onStepBus) return { lines: [], error: 'an output is connected straight to the left bus bar — add a contact (e.g. M1000)' };
  }
  if (!groups.length) {
    for (const o of tail) w.output(o);
    return { lines: w.lines, error: null };
  }
  // on the STL bus an output may follow the step directly
  const direct = groups.filter((gr) => gr.x.k === 'T');
  for (const gr of direct) for (const o of gr.outs) w.output(o);
  groups = groups.filter((gr) => gr.x.k !== 'T');
  if (!groups.length) {
    for (const o of tail) w.output(o);
    return w.err ? { lines: [], error: w.err } : { lines: w.lines, error: null };
  }
  if (groups.length === 1) {
    w.start(groups[0].x);
    for (const o of groups[0].outs) w.output(o);
  } else {
    const lists = groups.map((gr) => (gr.x.k === 'S' ? gr.x.a : [gr.x]));
    let k = 0;
    while (lists.every((l) => l.length > k) && lists.every((l) => keyOf(l[k]) === keyOf(lists[0][k]))) k++;
    // never consume a whole branch as prefix when it would leave a later branch empty-but-different
    if (k > 0) {
      w.start(mkSer(lists[0].slice(0, k)));
      groups.forEach((gr, i) => {
        const last = i === groups.length - 1;
        w.push(i === 0 ? 'MPS' : last ? 'MPP' : 'MRD');
        const rest = lists[i].slice(k);
        if (rest.length) w.and(mkSer(rest));
        for (const o of gr.outs) w.output(o);
      });
    } else {
      for (const gr of groups) { w.start(gr.x); for (const o of gr.outs) w.output(o); }
    }
  }
  for (const o of tail) w.output(o);
  if (w.err) return { lines: [], error: w.err };
  return { lines: w.lines, error: null };
}

// ------------------------------------------------------------------ compiler
/** Extra operand checks of one instruction: returns an error text or null. */
function checkInstr(el, ops) {
  const v = (i) => (ops[i] ? ops[i].val : undefined);
  const max = (op) => (DEVICES[op.dev] ? DEVICES[op.dev].max : 0);
  const fits = (op, n) => !op || op.idx === undefined || op.idx + n - 1 <= max(op);
  switch (el.t) {
    case 'ZRST': if (ops[0] && ops[1] && (ops[0].dev !== ops[1].dev || ops[0].idx > ops[1].idx)) return 'ZRST: D1 and D2 must be the same device type with D1 ≤ D2'; break;
    case 'MODRW': if (ops[1] && ops[1].dev !== 'D' && ![3, 6, 16].includes(ops[1].val)) return 'MODRW: function must be K3 (read), K6 (write one) or K16 (write many)'; break;
    case 'BMOV': case 'FMOV': case 'MEAN': {
      const n = v(2), lim = el.t === 'MEAN' ? 64 : 512;
      if (n !== undefined && (n < 1 || n > lim)) return `${el.t}: n must be K1 … K${lim}`;
      if (n !== undefined && (!fits(ops[1], el.t === 'MEAN' ? 1 : n) || (el.t !== 'FMOV' && !fits(ops[0], n)))) return `${el.t}: the block runs past the last device`;
      break;
    }
    case 'ROR': case 'ROL': if (v(1) !== undefined && (v(1) < 1 || v(1) > 16)) return `${el.t}: n must be K1 … K16`; break;
    case 'BON': if (v(2) !== undefined && (v(2) < 0 || v(2) > 15)) return 'BON: n must be K0 … K15'; break;
    case 'SFTR': case 'SFTL': {
      const n1 = v(2), n2 = v(3);
      if (n1 !== undefined && n2 !== undefined && (n2 < 1 || n1 < n2 || n1 > 1024)) return `${el.t}: needs 1 ≤ n2 ≤ n1 ≤ 1024`;
      if (n1 !== undefined && (!fits(ops[1], n1) || !fits(ops[0], n2 || 1))) return `${el.t}: the bits run past the last device`;
      break;
    }
    case 'DECO': {
      const n = v(2);
      if (n === undefined || !ops[1]) break;
      if (ops[1].dev === 'D' ? n < 1 || n > 4 : n < 1 || n > 8) return `DECO: n must be K1 … K${ops[1].dev === 'D' ? 4 : 8}`;
      if (ops[1].dev !== 'D' && !fits(ops[1], 1 << n)) return 'DECO: the bits run past the last device';
      break;
    }
    case 'ENCO': {
      const n = v(2);
      if (n === undefined || !ops[0]) break;
      const word = ['D', 'T', 'C'].includes(ops[0].dev);
      if (word ? n < 1 || n > 4 : n < 1 || n > 8) return `ENCO: n must be K1 … K${word ? 4 : 8}`;
      if (!word && !fits(ops[0], 1 << n)) return 'ENCO: the bits run past the last device';
      break;
    }
    case 'CMP': case 'ZCP': { const d = ops[el.t === 'CMP' ? 2 : 3]; if (d && !fits(d, 3)) return `${el.t}: D uses 3 bits — they run past the last device`; break; }
    default: break;
  }
  return null;
}

/**
 * Compile a program for the CPU. `model` = { name, inputs, outputs } of the target PLC.
 * Returns { ok, errors:[{rung,row,col,msg}], warnings:[…], rungs (executable), labels (P → index in rungs),
 * stateCount, steps, il:[{rung, lines, error}] }.
 */
export function compileProgram(program, model) {
  const prog = normalizeProgram(program);
  const errors = [], warnings = [];
  const exec = [];
  let sid = 0, steps = 0;
  const coilUse = new Map();
  const il = [];
  const labels = {};
  const flowUse = []; // {t, op, rung}
  let step = -1; // the STL step the networks belong to (-1: none)
  let fendAt = -1; // exec index of the first network with FEND
  prog.rungs.forEach((rung, ri) => {
    const label = rung.label ? parseOperand(rung.label) : null;
    if (label) {
      if (labels[label.idx] !== undefined) errors.push({ rung: ri, row: 0, col: 0, msg: `Pointer ${label.text} is used by two networks` });
      else labels[label.idx] = exec.length;
    }
    const rows = rung.cells.length, cols = rung.cells[0].length;
    if (rungIsEmpty(rung)) {
      // an empty network keeps its pointer so jumps to it still work
      if (label) exec.push({ index: ri, rows, cols, cells: rung.cells.map((row) => row.map(() => null)), outs: rung.outs.map(() => null), merges: Array.from({ length: cols }, () => []), label: label.idx, step, stlHead: false });
      if (label) il.push({ rung: ri, lines: [], error: null, label: label.text });
      return;
    }
    const loc = (row, col) => ({ rung: ri, row, col });
    const ctxFor = (row, col) => ({ model, warn: (msg) => { if (!warnings.some((w) => w.msg === msg)) warnings.push({ ...loc(row, col), msg }); } });
    const prep = (el, row, col) => {
      if (!el) return null;
      const d = INSTR[el.t];
      if (!d) { errors.push({ ...loc(row, col), msg: `Unknown instruction ${el.t}` }); return null; }
      if (d.kind === 'wire') return { t: 'H' };
      const ops = [];
      d.ops.forEach((cls, i) => {
        const r = checkOperand(el.a[i], cls, ctxFor(row, col));
        if (r.err) errors.push({ ...loc(row, col), msg: `${mnemonic(el)}: ${r.err}` });
        ops.push(r.op || null);
      });
      const bad = checkInstr(el, ops);
      if (bad) errors.push({ ...loc(row, col), msg: bad });
      if (el.t === 'STL' && (row !== 0 || col !== 0)) errors.push({ ...loc(row, col), msg: 'STL must be the first cell of a network (row 1, column 1, on the left bus bar)' });
      if ((el.t === 'OUT' || el.t === 'PLS' || el.t === 'PLF') && ops[0]) {
        // inside a step ladder the same coil may be driven by several steps (only one step is active)
        const k = ops[0].text;
        if (coilUse.has(k) && !(step >= 0 && coilUse.get(k).step >= 0)) warnings.push({ ...loc(row, col), msg: `Double coil: ${k} is also driven in network ${coilUse.get(k).rung + 1}` });
        else if (!coilUse.has(k)) coilUse.set(k, { rung: ri, step });
      }
      if (d.flow) flowUse.push({ t: el.t, op: ops[0], rung: ri, exec: exec.length });
      return { t: el.t, a: ops, op: el.op, p: !!el.p, rail: !!d.rail, sid: sid++, r: row, c: col };
    };
    // step ladder regions: STL Sn opens one, the next STL, RET or FEND closes it
    const stlOp = stlOf(rung) ? parseOperand(stlOf(rung)) : null;
    if (stlOp) step = stlOp.idx;
    const ends = rung.outs.some((o) => o && (o.t === 'RET' || o.t === 'FEND'));
    const rungStep = ends && !stlOp ? -1 : step;
    const cells = [], outs = [];
    for (let r = 0; r < rows; r++) {
      cells.push(rung.cells[r].map((el, c) => {
        if (el && INSTR[el.t] && INSTR[el.t].kind !== 'contact' && INSTR[el.t].kind !== 'wire') { errors.push({ ...loc(r, c), msg: `${el.t} must be placed in the output column` }); return null; }
        return prep(el, r, c);
      }));
      const o = rung.outs[r];
      if (o && INSTR[o.t] && !isOutputType(o.t)) { errors.push({ ...loc(r, 'out'), msg: `${o.t} cannot be placed in the output column` }); outs.push(null); }
      else outs.push(prep(o, r, 'out'));
    }
    if (ends) step = -1;
    if (rung.outs.some((o) => o && o.t === 'FEND') && fendAt < 0) fendAt = exec.length;
    // merge groups for every boundary b = 1..cols
    const merges = [];
    for (let b = 1; b <= cols; b++) {
      const groups = [];
      let cur = [0];
      for (let r = 0; r < rows - 1; r++) {
        if (rung.vl[r] && rung.vl[r][b - 1]) cur.push(r + 1);
        else { if (cur.length > 1) groups.push(cur); cur = [r + 1]; }
      }
      if (cur.length > 1) groups.push(cur);
      merges.push(groups);
    }
    // contacts that can never pass power to an output (open branches)
    const g = buildGraph(rung);
    const outNodes = new Set();
    for (let r = 0; r < rows; r++) if (rung.outs[r]) outNodes.add(g.node(r, cols));
    const fwd = new Set([g.rail]);
    let grew = true;
    while (grew) { grew = false; for (const e of g.edges) if (fwd.has(e.u) && !fwd.has(e.v)) { fwd.add(e.v); grew = true; } }
    const bwd = new Set(outNodes);
    grew = true;
    while (grew) { grew = false; for (const e of g.edges) if (bwd.has(e.v) && !bwd.has(e.u)) { bwd.add(e.u); grew = true; } }
    for (const e of g.edges) {
      if (e.x.k !== 'L' || (fwd.has(e.u) && bwd.has(e.v))) continue;
      warnings.push({ ...loc(e.x.r, e.x.c), msg: `Network ${ri + 1}: ${elementText(e.x.el) || e.x.el.t} is not connected (open branch — add a line or a vertical link)` });
    }
    const res = rungIL(rung);
    il.push({ rung: ri, lines: res.lines, error: res.error, label: label ? label.text : null });
    if (res.error) errors.push({ ...loc(0, 0), msg: `Network ${ri + 1}: ${res.error}` });
    for (const ln of res.lines) steps += ln.steps;
    exec.push({ index: ri, rows, cols, cells, outs, merges, label: label ? label.idx : -1, step: rungStep, stlHead: !!stlOp });
  });
  // program flow checks
  for (const f of flowUse) {
    const at = { rung: f.rung, row: 0, col: 0 };
    if ((f.t === 'CJ' || f.t === 'CALL') && f.op) {
      const target = labels[f.op.idx];
      if (target === undefined) errors.push({ ...at, msg: `${f.t} ${f.op.text}: no network has the pointer ${f.op.text} (long-press a network number → Pointer label)` });
      else if (f.t === 'CALL' && (fendAt < 0 || target <= fendAt)) errors.push({ ...at, msg: `CALL ${f.op.text}: subroutines go after FEND — put FEND at the end of the main program and the network with ${f.op.text} after it` });
      else if (f.t === 'CJ' && fendAt >= 0 && (f.exec <= fendAt) !== (target <= fendAt)) errors.push({ ...at, msg: `CJ ${f.op.text}: cannot jump between the main program and a subroutine` });
    }
    if (f.t === 'MC' && f.op && !flowUse.some((x) => x.t === 'MCR' && x.op && x.op.idx === f.op.idx && x.exec >= f.exec)) warnings.push({ ...at, msg: `MC ${f.op.text} has no MCR ${f.op.text} after it — the block runs to the end of the program` });
    if (f.t === 'SRET' && (fendAt < 0 || f.exec <= fendAt)) warnings.push({ ...at, msg: 'SRET belongs at the end of a subroutine, after FEND' });
    if (f.t === 'STL' && !flowUse.some((x) => x.t === 'RET') && !warnings.some((w) => /^Step ladder/.test(w.msg))) warnings.push({ ...at, msg: 'Step ladder: end the last step with RET' });
  }
  steps += 1; // END
  if (!exec.length) warnings.push({ rung: 0, row: 0, col: 0, msg: 'The program is empty' });
  return { ok: errors.length === 0, errors, warnings, rungs: exec, labels, fend: fendAt, stateCount: sid, steps, il, comments: { ...prog.comments } };
}

/** Full instruction list with step numbers, for display. */
export function programIL(compiled) {
  const out = [];
  let step = 0;
  for (const r of compiled.il) {
    if (r.label) out.push({ step: null, text: r.label, rung: r.rung, label: true });
    if (r.error) { out.push({ step: null, text: `; network ${r.rung + 1}: ${r.error}`, rung: r.rung, error: true }); continue; }
    for (const ln of r.lines) { out.push({ step, text: ln.text, rung: r.rung }); step += ln.steps; }
  }
  out.push({ step, text: 'END', rung: null });
  return out;
}

export { BIT_DEVS, DEVICES };
