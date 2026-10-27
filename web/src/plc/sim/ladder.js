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
  rst: ['Y', 'M', 'S', 'T', 'C', 'D', 'E', 'F'],
  timer: ['T'],
  counter: ['C'],
  hcounter: ['C'],
  word: ['K', 'H', 'D', 'T', 'C', 'E', 'F', 'KX', 'KY', 'KM', 'KS'],
  wordw: ['D', 'T', 'C', 'E', 'F', 'KY', 'KM', 'KS'],
  dreg: ['D'],
  zone: ['Y', 'M', 'S', 'T', 'C', 'D'],
  n: ['K', 'H'],
  bitsrc: ['X', 'Y', 'M', 'S'],
  bword: ['Y', 'M', 'S', 'D'],
  wsrc: ['X', 'Y', 'M', 'S', 'D', 'T', 'C'],
  step: ['S'],
  nest: ['N'],
  ptr: ['P'],
  fsrc: ['K', 'H', 'FL', 'D', 'E'],
  fdst: ['D', 'E'],
  xin: ['X'],
  yout: ['Y'],
  hsout: ['Y', 'M', 'S', 'C'],
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
  CC: { kind: 'contact', dbl: true, cat: 'compare', name: 'Compare contact (=, <>, >, >=, <, <=, &, |, ^)', il: ['LD', 'AND', 'OR'], ops: ['word', 'word'], labels: ['S1', 'S2'], steps: 5, def: ['D0', 'K10'], cmp: true },
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
  TON: { kind: 'box', cat: 'timer', name: 'On-delay timer (IEC TON, works like TMR)', ops: ['timer', 'word'], labels: ['Timer', 'Set value'], steps: 4, def: ['T1', 'K30'] },
  TOF: { kind: 'box', cat: 'timer', name: 'Off-delay timer (IEC TOF): T stays ON for the set time after the input goes OFF', ops: ['timer', 'word'], labels: ['Timer', 'Set value'], steps: 4, def: ['T2', 'K30'] },
  DCNT: { kind: 'box', cat: 'timer', name: '32-bit up/down counter C200–C234 (M1200+ ON = down); C235–C242 = high-speed counter on X0–X7; C251–C254 = A/B-phase counter on X0/X1 … X6/X7', ops: ['hcounter', 'word'], labels: ['Counter', 'Set value'], steps: 9, def: ['C235', 'K1000'] },
  // program flow
  MC: { kind: 'box', cat: 'flow', name: 'Master control start: OFF → the networks up to MCR run with no power', ops: ['nest'], labels: ['Nesting level'], steps: 3, def: ['N0'], flow: true },
  MCR: { kind: 'box', cat: 'flow', name: 'Master control reset (end of the MC block)', ops: ['nest'], labels: ['Nesting level'], steps: 3, def: ['N0'], flow: true, rail: true },
  CJ: { kind: 'box', cat: 'flow', api: 0, name: 'Conditional jump to the network with pointer P', ops: ['ptr'], labels: ['Pointer'], steps: 3, pulse: true, def: ['P0'], flow: true },
  CALL: { kind: 'box', cat: 'flow', api: 1, name: 'Call subroutine P (placed after FEND)', ops: ['ptr'], labels: ['Pointer'], steps: 3, pulse: true, def: ['P1'], flow: true },
  SRET: { kind: 'box', cat: 'flow', api: 2, name: 'End of a subroutine (return)', ops: [], labels: [], steps: 1, def: [], flow: true, rail: true },
  FEND: { kind: 'box', cat: 'flow', api: 6, name: 'End of the main program (subroutines follow)', ops: [], labels: [], steps: 1, def: [], flow: true, rail: true },
  WDT: { kind: 'box', cat: 'flow', api: 7, name: 'Watchdog timer refresh', ops: [], labels: [], steps: 1, pulse: true, def: [] },
  FOR: { kind: 'box', cat: 'flow', api: 8, name: 'Start of a FOR … NEXT loop: the networks up to NEXT run n times in one scan', ops: ['word'], labels: ['n (times)'], steps: 3, def: ['K3'], flow: true, rail: true },
  NEXT: { kind: 'box', cat: 'flow', api: 9, name: 'End of the FOR … NEXT loop', ops: [], labels: [], steps: 1, def: [], flow: true, rail: true },
  RET: { kind: 'box', cat: 'step', name: 'End of the step ladder (STL block)', ops: [], labels: [], steps: 1, def: [], flow: true, rail: true },
  // compare & move
  CMP: { kind: 'box', dbl: true, cat: 'compare', api: 10, name: 'Compare → 3 bits (>, =, <)', ops: ['word', 'word', 'bitw'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'K10', 'M10'] },
  ZCP: { kind: 'box', dbl: true, cat: 'compare', api: 11, name: 'Zone compare → 3 bits (S < S1, S1 ≤ S ≤ S2, S > S2)', ops: ['word', 'word', 'word', 'bitw'], labels: ['S1 (low)', 'S2 (high)', 'S', 'D'], steps: 9, pulse: true, def: ['K10', 'K20', 'D0', 'M20'] },
  MOV: { kind: 'box', dbl: true, cat: 'move', api: 12, name: 'Move', ops: ['word', 'wordw'], labels: ['S', 'D'], steps: 5, pulse: true, def: ['K0', 'D0'] },
  CML: { kind: 'box', dbl: true, cat: 'move', api: 14, name: 'Complement (invert every bit)  D = NOT S', ops: ['word', 'wordw'], labels: ['S', 'D'], steps: 5, pulse: true, def: ['D0', 'D1'] },
  BMOV: { kind: 'box', cat: 'move', api: 15, name: 'Block move: n words S… → D…', ops: ['wordw', 'wordw', 'n'], labels: ['S', 'D', 'n'], steps: 7, pulse: true, def: ['D0', 'D10', 'K4'] },
  FMOV: { kind: 'box', dbl: true, cat: 'move', api: 16, name: 'Fill move: S → n words D…', ops: ['word', 'wordw', 'n'], labels: ['S', 'D', 'n'], steps: 7, pulse: true, def: ['K0', 'D0', 'K10'] },
  XCH: { kind: 'box', dbl: true, cat: 'move', api: 17, name: 'Exchange two words', ops: ['wordw', 'wordw'], labels: ['D1', 'D2'], steps: 5, pulse: true, def: ['D0', 'D1'], defP: true },
  BCD: { kind: 'box', dbl: true, cat: 'move', api: 18, name: 'Binary → BCD', ops: ['word', 'wordw'], labels: ['S', 'D'], steps: 5, pulse: true, def: ['D0', 'D1'] },
  BIN: { kind: 'box', dbl: true, cat: 'move', api: 19, name: 'BCD → binary', ops: ['word', 'wordw'], labels: ['S', 'D'], steps: 5, pulse: true, def: ['D0', 'D1'] },
  SWAP: { kind: 'box', dbl: true, cat: 'move', api: 147, name: 'Swap the high and low byte', ops: ['wordw'], labels: ['D'], steps: 3, pulse: true, def: ['D0'], defP: true },
  // arithmetic
  ADD: { kind: 'box', dbl: true, cat: 'math', api: 20, name: 'Addition  D = S1 + S2', ops: ['word', 'word', 'wordw'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'K1', 'D0'] },
  SUB: { kind: 'box', dbl: true, cat: 'math', api: 21, name: 'Subtraction  D = S1 − S2', ops: ['word', 'word', 'wordw'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'K1', 'D0'] },
  MUL: { kind: 'box', dbl: true, cat: 'math', api: 22, name: 'Multiplication  D+1,D = S1 × S2', ops: ['word', 'word', 'dreg'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'K10', 'D2'] },
  DIV: { kind: 'box', dbl: true, cat: 'math', api: 23, name: 'Division  D = S1 ÷ S2, D+1 = remainder', ops: ['word', 'word', 'dreg'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'K10', 'D2'] },
  INC: { kind: 'box', dbl: true, cat: 'math', api: 24, name: 'Increment  D = D + 1', ops: ['wordw'], labels: ['D'], steps: 3, pulse: true, def: ['D0'], defP: true },
  DEC: { kind: 'box', dbl: true, cat: 'math', api: 25, name: 'Decrement  D = D − 1', ops: ['wordw'], labels: ['D'], steps: 3, pulse: true, def: ['D0'], defP: true },
  NEG: { kind: 'box', dbl: true, cat: 'math', api: 29, name: 'Negate  D = −D', ops: ['wordw'], labels: ['D'], steps: 3, pulse: true, def: ['D0'], defP: true },
  ABS: { kind: 'box', dbl: true, cat: 'math', api: 87, name: 'Absolute value  D = |D|', ops: ['wordw'], labels: ['D'], steps: 3, pulse: true, def: ['D0'], defP: true },
  SQR: { kind: 'box', dbl: true, cat: 'math', api: 48, name: 'Square root  D = √S', ops: ['word', 'wordw'], labels: ['S', 'D'], steps: 5, pulse: true, def: ['D0', 'D1'] },
  MEAN: { kind: 'box', dbl: true, cat: 'math', api: 45, name: 'Mean of n words S… → D', ops: ['wordw', 'wordw', 'n'], labels: ['S', 'D', 'n'], steps: 7, pulse: true, def: ['D0', 'D10', 'K4'] },
  SCAL: { kind: 'box', cat: 'math', api: 202, name: 'Scale  D = S1 × S2 ÷ 1000 + S3', ops: ['word', 'word', 'word', 'wordw'], labels: ['S1 (value)', 'S2 (slope ×0.001)', 'S3 (offset)', 'D'], steps: 9, pulse: true, def: ['D1110', 'K500', 'K0', 'D0'] },
  // word logic & bits
  WAND: { kind: 'box', dbl: true, dname: 'DAND', cat: 'logic', api: 26, name: 'Word AND  D = S1 AND S2', ops: ['word', 'word', 'wordw'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'H00FF', 'D1'] },
  WOR: { kind: 'box', dbl: true, dname: 'DOR', cat: 'logic', api: 27, name: 'Word OR  D = S1 OR S2', ops: ['word', 'word', 'wordw'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'H00FF', 'D1'] },
  WXOR: { kind: 'box', dbl: true, dname: 'DXOR', cat: 'logic', api: 28, name: 'Word XOR  D = S1 XOR S2', ops: ['word', 'word', 'wordw'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'H00FF', 'D1'] },
  ROR: { kind: 'box', dbl: true, cat: 'logic', api: 30, name: 'Rotate right n bits', ops: ['wordw', 'n'], labels: ['D', 'n'], steps: 5, pulse: true, def: ['D0', 'K1'], defP: true },
  ROL: { kind: 'box', dbl: true, cat: 'logic', api: 31, name: 'Rotate left n bits', ops: ['wordw', 'n'], labels: ['D', 'n'], steps: 5, pulse: true, def: ['D0', 'K1'], defP: true },
  SFTR: { kind: 'box', cat: 'logic', api: 34, name: 'Bit shift right: n2 bits of S enter n1 bits of D', ops: ['bitsrc', 'bitw', 'n', 'n'], labels: ['S', 'D', 'n1', 'n2'], steps: 9, pulse: true, def: ['X0', 'M0', 'K8', 'K1'], defP: true },
  RCR: { kind: 'box', dbl: true, cat: 'logic', api: 32, name: 'Rotate right n bits through the carry M1022', ops: ['wordw', 'n'], labels: ['D', 'n'], steps: 5, pulse: true, def: ['D0', 'K1'], defP: true },
  RCL: { kind: 'box', dbl: true, cat: 'logic', api: 33, name: 'Rotate left n bits through the carry M1022', ops: ['wordw', 'n'], labels: ['D', 'n'], steps: 5, pulse: true, def: ['D0', 'K1'], defP: true },
  SFTL: { kind: 'box', cat: 'logic', api: 35, name: 'Bit shift left: n2 bits of S enter n1 bits of D', ops: ['bitsrc', 'bitw', 'n', 'n'], labels: ['S', 'D', 'n1', 'n2'], steps: 9, pulse: true, def: ['X0', 'M0', 'K8', 'K1'], defP: true },
  WSFR: { kind: 'box', cat: 'logic', api: 36, name: 'Word shift right: n2 words of S enter n1 words of D', ops: ['wordw', 'wordw', 'n', 'n'], labels: ['S', 'D', 'n1', 'n2'], steps: 9, pulse: true, def: ['D0', 'D10', 'K4', 'K1'], defP: true },
  WSFL: { kind: 'box', cat: 'logic', api: 37, name: 'Word shift left: n2 words of S enter n1 words of D', ops: ['wordw', 'wordw', 'n', 'n'], labels: ['S', 'D', 'n1', 'n2'], steps: 9, pulse: true, def: ['D0', 'D10', 'K4', 'K1'], defP: true },
  SFWR: { kind: 'box', cat: 'logic', api: 38, name: 'FIFO write: S → queue D+1 … D+n−1, D = pointer', ops: ['word', 'dreg', 'n'], labels: ['S', 'D (pointer)', 'n'], steps: 7, pulse: true, def: ['D0', 'D10', 'K10'], defP: true },
  SFRD: { kind: 'box', cat: 'logic', api: 39, name: 'FIFO read: first word of queue S+1 … → D, S = pointer', ops: ['dreg', 'wordw', 'n'], labels: ['S (pointer)', 'D', 'n'], steps: 7, pulse: true, def: ['D10', 'D20', 'K10'], defP: true },
  ZRST: { kind: 'box', cat: 'logic', api: 40, name: 'Zone reset', ops: ['zone', 'zone'], labels: ['D1', 'D2'], steps: 5, pulse: true, def: ['M0', 'M9'] },
  DECO: { kind: 'box', cat: 'logic', api: 41, name: 'Decoder: bit number S (n bits) → ON bit in D', ops: ['word', 'bword', 'n'], labels: ['S', 'D', 'n'], steps: 7, pulse: true, def: ['D0', 'M0', 'K3'] },
  ENCO: { kind: 'box', cat: 'logic', api: 42, name: 'Encoder: highest ON bit of S (2ⁿ bits) → D', ops: ['wsrc', 'dreg', 'n'], labels: ['S', 'D', 'n'], steps: 7, pulse: true, def: ['M0', 'D0', 'K3'] },
  SUM: { kind: 'box', dbl: true, cat: 'logic', api: 43, name: 'Number of ON bits in S → D', ops: ['word', 'wordw'], labels: ['S', 'D'], steps: 5, pulse: true, def: ['D0', 'D1'] },
  BON: { kind: 'box', dbl: true, cat: 'logic', api: 44, name: 'Check bit n of S → D', ops: ['word', 'bitw', 'n'], labels: ['S', 'D', 'n'], steps: 7, pulse: true, def: ['D0', 'M0', 'K0'] },
  ALT: { kind: 'box', cat: 'logic', api: 66, name: 'Alternate (toggle) bit', ops: ['bitw'], labels: ['D'], steps: 3, pulse: true, def: ['M0'], defP: true },
  // communication
  MODRW: { kind: 'box', cat: 'comm', api: 150, name: 'Modbus read / write (COM2)', ops: ['word', 'word', 'word', 'dreg', 'word'], labels: ['Station', 'Function', 'Address', 'Data reg.', 'Length'], steps: 11, def: ['K1', 'K6', 'H2000', 'D0', 'K1'] },
  MODRD: { kind: 'box', cat: 'comm', api: 100, name: 'Modbus read (COM2, function 03) → D1050 …', ops: ['word', 'word', 'word'], labels: ['Station', 'Address', 'Length'], steps: 7, def: ['K1', 'H2100', 'K6'] },
  MODWR: { kind: 'box', cat: 'comm', api: 101, name: 'Modbus write one word (COM2, function 06)', ops: ['word', 'word', 'word'], labels: ['Station', 'Address', 'Data'], steps: 7, def: ['K1', 'H2001', 'K5000'] },
  FWD: { kind: 'box', cat: 'comm', api: 102, name: 'Delta VFD: run forward at frequency S1 (0.01 Hz)', ops: ['word', 'word', 'n'], labels: ['Frequency', 'Station', 'n (1 = VFD)'], steps: 7, def: ['K5000', 'K1', 'K1'] },
  REV: { kind: 'box', cat: 'comm', api: 103, name: 'Delta VFD: run reverse at frequency S1 (0.01 Hz)', ops: ['word', 'word', 'n'], labels: ['Frequency', 'Station', 'n (1 = VFD)'], steps: 7, def: ['K5000', 'K1', 'K1'] },
  STOP: { kind: 'box', cat: 'comm', api: 104, name: 'Delta VFD: stop', ops: ['word', 'n'], labels: ['Station', 'n (1 = VFD)'], steps: 5, def: ['K1', 'K1'] },
  RDST: { kind: 'box', cat: 'comm', api: 105, name: 'Delta VFD: read status 2100H … 2106H → D1050 … D1056', ops: ['word', 'n'], labels: ['Station', 'n (1 = VFD)'], steps: 5, def: ['K1', 'K1'] },
  RSTEF: { kind: 'box', cat: 'comm', api: 106, name: 'Delta VFD: reset the fault', ops: ['word', 'n'], labels: ['Station', 'n (1 = VFD)'], steps: 5, def: ['K1', 'K1'] },
  // ---------------------------------------------------------------- more of the DVP-ES2 / EX2 instruction set
  NP: { kind: 'contact', cat: 'contact', name: 'NP: rising edge of the result (OFF → ON pulse)', il: [null, 'NP', null], ops: [], labels: [], steps: 1, def: [] },
  PN: { kind: 'contact', cat: 'contact', name: 'PN: falling edge of the result (ON → OFF pulse)', il: [null, 'PN', null], ops: [], labels: [], steps: 1, def: [] },
  NOP: { kind: 'box', cat: 'flow', name: 'No operation', ops: [], labels: [], steps: 1, def: [] },
  END: { kind: 'box', cat: 'flow', name: 'End of the program (the scan starts again)', ops: [], labels: [], steps: 1, def: [], flow: true, rail: true },
  IRET: { kind: 'box', cat: 'flow', api: 3, name: 'Return from an interrupt subroutine', ops: [], labels: [], steps: 1, def: [], flow: true, rail: true },
  EI: { kind: 'box', cat: 'flow', api: 4, name: 'Enable interrupts', ops: [], labels: [], steps: 1, def: [], rail: true },
  DI: { kind: 'box', cat: 'flow', api: 5, name: 'Disable interrupts', ops: [], labels: [], steps: 1, def: [], rail: true },
  // compare (floating point and 32-bit forms)
  FCC: { kind: 'contact', cat: 'float', api: 275, name: 'Floating-point compare contact (FLD=, FLD>, FLD< …)', il: ['FLD', 'FAND', 'FOR'], ops: ['fsrc', 'fsrc'], labels: ['S1', 'S2'], steps: 9, def: ['D0', 'F1.5'], cmp: true, cmpOps: ['=', '<>', '>', '>=', '<', '<='] },
  // bit of a word
  BLD: { kind: 'contact', cat: 'bitw', api: 269, dbl: true, name: 'Contact on bit n of a word (BLD / BAND / BOR)', il: ['BLD', 'BAND', 'BOR'], ops: ['word', 'n'], labels: ['Word', 'Bit n'], steps: 5, def: ['D0', 'K0'] },
  BLDI: { kind: 'contact', cat: 'bitw', api: 270, dbl: true, name: 'NC contact on bit n of a word (BLDI / BANI / BORI)', il: ['BLDI', 'BANI', 'BORI'], ops: ['word', 'n'], labels: ['Word', 'Bit n'], steps: 5, def: ['D0', 'K0'] },
  BOUT: { kind: 'box', cat: 'bitw', api: 266, dbl: true, name: 'Output to bit n of a word (follows the rung)', ops: ['wordw', 'n'], labels: ['D', 'Bit n'], steps: 5, def: ['D0', 'K0'] },
  BSET: { kind: 'box', cat: 'bitw', api: 267, dbl: true, name: 'Set bit n of a word', ops: ['wordw', 'n'], labels: ['D', 'Bit n'], steps: 5, pulse: true, def: ['D0', 'K0'] },
  BRST: { kind: 'box', cat: 'bitw', api: 268, dbl: true, name: 'Reset bit n of a word', ops: ['wordw', 'n'], labels: ['D', 'Bit n'], steps: 5, pulse: true, def: ['D0', 'K0'] },
  // data move & conversion
  SMOV: { kind: 'box', cat: 'move', api: 13, name: 'Shift move: m2 decimal digits of S (from digit m1) → D (from digit n)', ops: ['word', 'n', 'n', 'wordw', 'n'], labels: ['S', 'm1 (from digit)', 'm2 (digits)', 'D', 'n (to digit)'], steps: 11, pulse: true, def: ['D0', 'K4', 'K2', 'D1', 'K3'] },
  MMOV: { kind: 'box', cat: 'move', api: 176, name: '16-bit → 32-bit move (sign kept)', ops: ['word', 'dreg'], labels: ['S', 'D (32-bit)'], steps: 5, pulse: true, def: ['D0', 'D10'] },
  RMOV: { kind: 'box', cat: 'move', api: 177, name: '32-bit → 16-bit move (limited to −32768 … 32767)', ops: ['dreg', 'wordw'], labels: ['S (32-bit)', 'D'], steps: 5, pulse: true, def: ['D10', 'D0'] },
  GRY: { kind: 'box', cat: 'move', api: 170, dbl: true, name: 'Binary → Gray code', ops: ['word', 'wordw'], labels: ['S', 'D'], steps: 5, pulse: true, def: ['D0', 'D1'] },
  GBIN: { kind: 'box', cat: 'move', api: 171, dbl: true, name: 'Gray code → binary', ops: ['word', 'wordw'], labels: ['S', 'D'], steps: 5, pulse: true, def: ['D0', 'D1'] },
  SEGD: { kind: 'box', cat: 'move', api: 73, name: '7-segment decode: hex digit of S → segments a–g in D', ops: ['word', 'wordw'], labels: ['S', 'D'], steps: 5, pulse: true, def: ['D0', 'K2Y0'] },
  PRUN: { kind: 'box', cat: 'move', api: 81, dbl: true, name: 'Octal bit transfer (KnX ↔ KnM)', ops: ['word', 'wordw'], labels: ['S', 'D'], steps: 5, pulse: true, def: ['K4X0', 'K4M0'] },
  ASCI: { kind: 'box', cat: 'move', api: 82, name: 'Hex → ASCII: n hex digits of S → characters in D…', ops: ['word', 'dreg', 'n'], labels: ['S', 'D', 'n (digits)'], steps: 7, pulse: true, def: ['D0', 'D10', 'K4'] },
  HEX: { kind: 'box', cat: 'move', api: 83, name: 'ASCII → hex: n characters of S… → hex digits in D', ops: ['dreg', 'dreg', 'n'], labels: ['S', 'D', 'n (characters)'], steps: 7, pulse: true, def: ['D10', 'D0', 'K4'] },
  FLT: { kind: 'box', cat: 'float', api: 49, dbl: true, name: 'Integer → floating point', ops: ['word', 'fdst'], labels: ['S', 'D (float)'], steps: 5, pulse: true, def: ['D0', 'D10'] },
  INT: { kind: 'box', cat: 'float', api: 129, dbl: true, name: 'Floating point → integer (decimals dropped)', ops: ['fsrc', 'wordw'], labels: ['S (float)', 'D'], steps: 5, pulse: true, def: ['D10', 'D0'] },
  // arithmetic
  WSUM: { kind: 'box', cat: 'math', api: 179, name: 'Sum of n words S… → 32-bit D', ops: ['wordw', 'dreg', 'n'], labels: ['S', 'D (32-bit)', 'n'], steps: 7, pulse: true, def: ['D0', 'D20', 'K4'] },
  RAND: { kind: 'box', cat: 'math', api: 154, dbl: true, name: 'Random number between S1 and S2', ops: ['word', 'word', 'wordw'], labels: ['S1 (min)', 'S2 (max)', 'D'], steps: 7, pulse: true, def: ['K0', 'K100', 'D0'] },
  SCLP: { kind: 'box', cat: 'math', api: 203, dbl: true, name: 'Scale with parameters S2 = max in, min in, max out, min out', ops: ['word', 'dreg', 'wordw'], labels: ['S1 (value)', 'S2 (4 parameters)', 'D'], steps: 7, pulse: true, def: ['D1110', 'D100', 'D0'] },
  // floating point (32-bit, IEEE 754 in two registers)
  DECMP: { kind: 'box', cat: 'float', api: 110, name: 'Float compare → 3 bits (>, =, <)', ops: ['fsrc', 'fsrc', 'bitw'], labels: ['S1', 'S2', 'D'], steps: 13, pulse: true, def: ['D0', 'F1.5', 'M10'] },
  DEZCP: { kind: 'box', cat: 'float', api: 111, name: 'Float zone compare → 3 bits', ops: ['fsrc', 'fsrc', 'fsrc', 'bitw'], labels: ['S1 (low)', 'S2 (high)', 'S', 'D'], steps: 17, pulse: true, def: ['F0.0', 'F10.0', 'D0', 'M20'] },
  DMOVR: { kind: 'box', cat: 'float', api: 112, name: 'Move a floating-point value', ops: ['fsrc', 'fdst'], labels: ['S', 'D'], steps: 9, pulse: true, def: ['F1.5', 'D0'] },
  DRAD: { kind: 'box', cat: 'float', api: 116, name: 'Degrees → radians', ops: ['fsrc', 'fdst'], labels: ['S (°)', 'D (rad)'], steps: 9, pulse: true, def: ['D0', 'D2'] },
  DDEG: { kind: 'box', cat: 'float', api: 117, name: 'Radians → degrees', ops: ['fsrc', 'fdst'], labels: ['S (rad)', 'D (°)'], steps: 9, pulse: true, def: ['D0', 'D2'] },
  DEBCD: { kind: 'box', cat: 'float', api: 118, name: 'Float → scientific notation (D = mantissa, D+1 = power of 10)', ops: ['fsrc', 'dreg'], labels: ['S', 'D'], steps: 9, pulse: true, def: ['D0', 'D10'] },
  DEBIN: { kind: 'box', cat: 'float', api: 119, name: 'Scientific notation (S = mantissa, S+1 = power of 10) → float', ops: ['dreg', 'fdst'], labels: ['S', 'D'], steps: 9, pulse: true, def: ['D10', 'D0'] },
  DEADD: { kind: 'box', cat: 'float', api: 120, name: 'Float addition  D = S1 + S2', ops: ['fsrc', 'fsrc', 'fdst'], labels: ['S1', 'S2', 'D'], steps: 13, pulse: true, def: ['D0', 'D2', 'D4'] },
  DESUB: { kind: 'box', cat: 'float', api: 121, name: 'Float subtraction  D = S1 − S2', ops: ['fsrc', 'fsrc', 'fdst'], labels: ['S1', 'S2', 'D'], steps: 13, pulse: true, def: ['D0', 'D2', 'D4'] },
  DEMUL: { kind: 'box', cat: 'float', api: 122, name: 'Float multiplication  D = S1 × S2', ops: ['fsrc', 'fsrc', 'fdst'], labels: ['S1', 'S2', 'D'], steps: 13, pulse: true, def: ['D0', 'D2', 'D4'] },
  DEDIV: { kind: 'box', cat: 'float', api: 123, name: 'Float division  D = S1 ÷ S2', ops: ['fsrc', 'fsrc', 'fdst'], labels: ['S1', 'S2', 'D'], steps: 13, pulse: true, def: ['D0', 'D2', 'D4'] },
  DEXP: { kind: 'box', cat: 'float', api: 124, name: 'Exponent  D = eˢ', ops: ['fsrc', 'fdst'], labels: ['S', 'D'], steps: 9, pulse: true, def: ['D0', 'D2'] },
  DLN: { kind: 'box', cat: 'float', api: 125, name: 'Natural logarithm  D = ln S', ops: ['fsrc', 'fdst'], labels: ['S', 'D'], steps: 9, pulse: true, def: ['D0', 'D2'] },
  DLOG: { kind: 'box', cat: 'float', api: 126, name: 'Logarithm  D = log base S1 of S2', ops: ['fsrc', 'fsrc', 'fdst'], labels: ['S1 (base)', 'S2', 'D'], steps: 13, pulse: true, def: ['F10.0', 'D0', 'D2'] },
  DESQR: { kind: 'box', cat: 'float', api: 127, name: 'Float square root  D = √S', ops: ['fsrc', 'fdst'], labels: ['S', 'D'], steps: 9, pulse: true, def: ['D0', 'D2'] },
  DPOW: { kind: 'box', cat: 'float', api: 128, name: 'Power  D = S1 ^ S2', ops: ['fsrc', 'fsrc', 'fdst'], labels: ['S1', 'S2', 'D'], steps: 13, pulse: true, def: ['D0', 'F2.0', 'D2'] },
  DSIN: { kind: 'box', cat: 'float', api: 130, name: 'Sine (M1018 ON: S in degrees)', ops: ['fsrc', 'fdst'], labels: ['S', 'D'], steps: 9, pulse: true, def: ['D0', 'D2'] },
  DCOS: { kind: 'box', cat: 'float', api: 131, name: 'Cosine (M1018 ON: S in degrees)', ops: ['fsrc', 'fdst'], labels: ['S', 'D'], steps: 9, pulse: true, def: ['D0', 'D2'] },
  DTAN: { kind: 'box', cat: 'float', api: 132, name: 'Tangent (M1018 ON: S in degrees)', ops: ['fsrc', 'fdst'], labels: ['S', 'D'], steps: 9, pulse: true, def: ['D0', 'D2'] },
  DASIN: { kind: 'box', cat: 'float', api: 133, name: 'Arc sine → radians', ops: ['fsrc', 'fdst'], labels: ['S', 'D'], steps: 9, pulse: true, def: ['D0', 'D2'] },
  DACOS: { kind: 'box', cat: 'float', api: 134, name: 'Arc cosine → radians', ops: ['fsrc', 'fdst'], labels: ['S', 'D'], steps: 9, pulse: true, def: ['D0', 'D2'] },
  DATAN: { kind: 'box', cat: 'float', api: 135, name: 'Arc tangent → radians', ops: ['fsrc', 'fdst'], labels: ['S', 'D'], steps: 9, pulse: true, def: ['D0', 'D2'] },
  DSINH: { kind: 'box', cat: 'float', api: 136, name: 'Hyperbolic sine', ops: ['fsrc', 'fdst'], labels: ['S', 'D'], steps: 9, pulse: true, def: ['D0', 'D2'] },
  DCOSH: { kind: 'box', cat: 'float', api: 137, name: 'Hyperbolic cosine', ops: ['fsrc', 'fdst'], labels: ['S', 'D'], steps: 9, pulse: true, def: ['D0', 'D2'] },
  DTANH: { kind: 'box', cat: 'float', api: 138, name: 'Hyperbolic tangent', ops: ['fsrc', 'fdst'], labels: ['S', 'D'], steps: 9, pulse: true, def: ['D0', 'D2'] },
  DADDR: { kind: 'box', cat: 'float', api: 172, name: 'Float addition with float constants (F)', ops: ['fsrc', 'fsrc', 'fdst'], labels: ['S1', 'S2', 'D'], steps: 13, pulse: true, def: ['D0', 'F0.5', 'D4'] },
  DSUBR: { kind: 'box', cat: 'float', api: 173, name: 'Float subtraction with float constants (F)', ops: ['fsrc', 'fsrc', 'fdst'], labels: ['S1', 'S2', 'D'], steps: 13, pulse: true, def: ['D0', 'F0.5', 'D4'] },
  DMULR: { kind: 'box', cat: 'float', api: 174, name: 'Float multiplication with float constants (F)', ops: ['fsrc', 'fsrc', 'fdst'], labels: ['S1', 'S2', 'D'], steps: 13, pulse: true, def: ['D0', 'F1.5', 'D4'] },
  DDIVR: { kind: 'box', cat: 'float', api: 175, name: 'Float division with float constants (F)', ops: ['fsrc', 'fsrc', 'fdst'], labels: ['S1', 'S2', 'D'], steps: 13, pulse: true, def: ['D0', 'F2.0', 'D4'] },
  // handy instructions
  ANS: { kind: 'box', cat: 'handy', api: 46, name: 'Annunciator set: S ON for m × 100 ms → SET D (S900 … S1023)', ops: ['timer', 'word', 'step'], labels: ['Timer S', 'm (×100 ms)', 'D (S900+)'], steps: 7, def: ['T0', 'K20', 'S900'] },
  ANR: { kind: 'box', cat: 'handy', api: 47, name: 'Annunciator reset (the lowest S900 … S1023 that is ON)', ops: [], labels: [], steps: 1, pulse: true, def: [], defP: true },
  SER: { kind: 'box', cat: 'handy', api: 61, dbl: true, name: 'Search n words S1… for S2 → D: count, first, last, min, max', ops: ['wordw', 'word', 'dreg', 'n'], labels: ['S1', 'S2 (value)', 'D (5 words)', 'n'], steps: 9, pulse: true, def: ['D0', 'K10', 'D100', 'K10'] },
  ABSD: { kind: 'box', cat: 'handy', api: 62, dbl: true, name: 'Absolute drum: counter S2 inside window i of table S1 → bit D+i', ops: ['wordw', 'counter', 'bitw', 'n'], labels: ['S1 (table)', 'S2 (counter)', 'D', 'n'], steps: 9, def: ['D100', 'C10', 'M10', 'K4'] },
  INCD: { kind: 'box', cat: 'handy', api: 63, name: 'Incremental drum: S2 counts to S1+k, then step k+1 (C S2+1 = step)', ops: ['wordw', 'counter', 'bitw', 'n'], labels: ['S1 (table)', 'S2 (counter)', 'D', 'n'], steps: 9, def: ['D100', 'C10', 'M10', 'K4'] },
  TTMR: { kind: 'box', cat: 'handy', api: 64, name: 'Teach timer: ON time in s × 10ⁿ → D (D+1 = seconds)', ops: ['dreg', 'n'], labels: ['D', 'n (0–2)'], steps: 5, def: ['D10', 'K0'] },
  STMR: { kind: 'box', cat: 'handy', api: 65, name: 'Special timer: D off-delay, D+1 one-shot after OFF, D+2 one-shot after ON, D+3 on/off delay', ops: ['timer', 'word', 'bitw'], labels: ['Timer S', 'm (×100 ms)', 'D (4 bits)'], steps: 7, def: ['T10', 'K50', 'M10'] },
  RAMP: { kind: 'box', cat: 'handy', api: 67, dbl: true, name: 'Ramp D from S1 to S2 in n scans (D+1 = scans, M1029 = done)', ops: ['word', 'word', 'dreg', 'n'], labels: ['S1 (start)', 'S2 (end)', 'D', 'n (scans)'], steps: 9, def: ['D0', 'D1', 'D10', 'K200'] },
  SORT: { kind: 'box', cat: 'handy', api: 69, dbl: true, name: 'Sort a table of m1 rows × m2 columns by column n (M1165 = descending)', ops: ['dreg', 'n', 'n', 'dreg', 'word'], labels: ['S (table)', 'm1 (rows)', 'm2 (columns)', 'D', 'n (column)'], steps: 11, def: ['D0', 'K5', 'K2', 'D50', 'K2'] },
  TKY: { kind: 'box', cat: 'handy', api: 70, dbl: true, name: 'Ten-key input: keys S…S+9 → number D1, key bits D2…D2+10', ops: ['bitsrc', 'wordw', 'bitw'], labels: ['S (10 keys)', 'D1 (value)', 'D2 (11 bits)'], steps: 7, def: ['X0', 'D0', 'M10'] },
  HOUR: { kind: 'box', cat: 'time', api: 169, dbl: true, name: 'Hour meter: ON time in hours → D1 (D1+1 = s), D2 ON at S hours', ops: ['word', 'dreg', 'bitw'], labels: ['S (hours)', 'D1', 'D2'], steps: 7, def: ['K1000', 'D200', 'Y7'] },
  // real-time clock
  TRD: { kind: 'box', cat: 'time', api: 166, name: 'Read the clock → D…D+6: year, weekday, month, day, hour, minute, second', ops: ['dreg'], labels: ['D (7 words)'], steps: 3, pulse: true, def: ['D0'] },
  TWR: { kind: 'box', cat: 'time', api: 167, name: 'Write the clock from S…S+6 (year, weekday, month, day, h, min, s)', ops: ['dreg'], labels: ['S (7 words)'], steps: 3, pulse: true, def: ['D10'], defP: true },
  TCMP: { kind: 'box', cat: 'time', api: 160, name: 'Compare time S1:S2:S3 with S…S+2 → 3 bits (>, =, <)', ops: ['word', 'word', 'word', 'dreg', 'bitw'], labels: ['S1 (h)', 'S2 (min)', 'S3 (s)', 'S (time)', 'D'], steps: 11, pulse: true, def: ['K12', 'K0', 'K0', 'D4', 'M10'] },
  TZCP: { kind: 'box', cat: 'time', api: 161, name: 'Time zone compare: S1 (h:m:s) ≤ S ≤ S2 → 3 bits', ops: ['dreg', 'dreg', 'dreg', 'bitw'], labels: ['S1 (from)', 'S2 (to)', 'S (time)', 'D'], steps: 9, pulse: true, def: ['D20', 'D23', 'D4', 'M20'] },
  TADD: { kind: 'box', cat: 'time', api: 162, name: 'Time addition (h:m:s)  D = S1 + S2', ops: ['dreg', 'dreg', 'dreg'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D20', 'D23', 'D26'] },
  TSUB: { kind: 'box', cat: 'time', api: 163, name: 'Time subtraction (h:m:s)  D = S1 − S2', ops: ['dreg', 'dreg', 'dreg'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D20', 'D23', 'D26'] },
  // high-speed counters, pulse output, positioning
  DHSCS: { kind: 'box', cat: 'pulse', api: 53, d32: true, name: 'High-speed counter compare SET: counter S2 = S1 → SET D', ops: ['word', 'hcounter', 'hsout'], labels: ['S1', 'S2 (C235+)', 'D'], steps: 13, def: ['K100', 'C235', 'Y0'] },
  DHSCR: { kind: 'box', cat: 'pulse', api: 54, d32: true, name: 'High-speed counter compare RESET: counter S2 = S1 → RST D', ops: ['word', 'hcounter', 'hsout'], labels: ['S1', 'S2 (C235+)', 'D'], steps: 13, def: ['K200', 'C235', 'Y0'] },
  DHSZ: { kind: 'box', cat: 'pulse', api: 55, d32: true, name: 'High-speed counter zone compare → 3 bits', ops: ['word', 'word', 'hcounter', 'bitw'], labels: ['S1 (low)', 'S2 (high)', 'S (counter)', 'D'], steps: 17, def: ['K100', 'K200', 'C235', 'M10'] },
  SPD: { kind: 'box', cat: 'pulse', api: 56, name: 'Speed detection: pulses on S1 in S2 ms → D (D+1 counting, D+2 ms left)', ops: ['xin', 'word', 'dreg'], labels: ['S1 (input)', 'S2 (ms)', 'D'], steps: 7, def: ['X0', 'K1000', 'D10'] },
  PLSY: { kind: 'box', cat: 'pulse', api: 57, dbl: true, name: 'Pulse output: S2 pulses at S1 Hz on Y0 / Y1 (0 = endless)', ops: ['word', 'word', 'yout'], labels: ['S1 (Hz)', 'S2 (pulses)', 'D (Y0 / Y1)'], steps: 7, def: ['K1000', 'K5000', 'Y0'] },
  PWM: { kind: 'box', cat: 'pulse', api: 58, name: 'PWM output: width S1 ms every S2 ms', ops: ['word', 'word', 'yout'], labels: ['S1 (width ms)', 'S2 (period ms)', 'D'], steps: 7, def: ['K500', 'K1000', 'Y2'] },
  PLSR: { kind: 'box', cat: 'pulse', api: 59, dbl: true, name: 'Pulse output with acceleration / deceleration', ops: ['word', 'word', 'word', 'yout'], labels: ['S1 (max Hz)', 'S2 (pulses)', 'S3 (ramp ms)', 'D'], steps: 9, def: ['K2000', 'K10000', 'K500', 'Y0'] },
  PWD: { kind: 'box', cat: 'pulse', api: 151, name: 'Pulse width detection: ON time of S in ms → D (32-bit)', ops: ['xin', 'dreg'], labels: ['S (input)', 'D'], steps: 5, def: ['X0', 'D10'] },
  DELAY: { kind: 'box', cat: 'pulse', api: 143, name: 'Delay (S × 0.1 ms; no effect in the simulator)', ops: ['word'], labels: ['S'], steps: 3, pulse: true, def: ['K10'] },
  GPWM: { kind: 'box', cat: 'pulse', api: 144, name: 'General PWM on any Y: width S1 ms every S2 ms', ops: ['word', 'word', 'yout'], labels: ['S1 (width ms)', 'S2 (period ms)', 'D'], steps: 7, def: ['K200', 'K1000', 'Y4'] },
  ZRN: { kind: 'box', cat: 'pulse', api: 156, dbl: true, defD: true, name: 'Zero return: move back at S1 Hz until the DOG input S3, position = 0', ops: ['word', 'word', 'xin', 'yout'], labels: ['S1 (Hz)', 'S2 (creep Hz)', 'S3 (DOG)', 'D (Y0 / Y2)'], steps: 9, def: ['K5000', 'K500', 'X5', 'Y0'] },
  PLSV: { kind: 'box', cat: 'pulse', api: 157, dbl: true, defD: true, name: 'Variable speed pulse output (S Hz, sign = direction)', ops: ['word', 'yout', 'yout'], labels: ['S (Hz)', 'D1 (pulse)', 'D2 (direction)'], steps: 7, def: ['K2000', 'Y0', 'Y1'] },
  DRVI: { kind: 'box', cat: 'pulse', api: 158, dbl: true, defD: true, name: 'Relative positioning: S1 pulses at S2 Hz', ops: ['word', 'word', 'yout', 'yout'], labels: ['S1 (pulses)', 'S2 (Hz)', 'D1 (pulse)', 'D2 (direction)'], steps: 9, def: ['K10000', 'K5000', 'Y0', 'Y1'] },
  DRVA: { kind: 'box', cat: 'pulse', api: 159, dbl: true, defD: true, name: 'Absolute positioning: go to position S1 at S2 Hz', ops: ['word', 'word', 'yout', 'yout'], labels: ['S1 (position)', 'S2 (Hz)', 'D1 (pulse)', 'D2 (direction)'], steps: 9, def: ['K0', 'K5000', 'Y0', 'Y1'] },
  REF: { kind: 'box', cat: 'pulse', api: 50, name: 'Refresh n inputs / outputs now (immediate I/O)', ops: ['bitsrc', 'n'], labels: ['D (X / Y)', 'n'], steps: 5, pulse: true, def: ['X0', 'K8'] },
  REFF: { kind: 'box', cat: 'pulse', api: 51, name: 'Input filter time n ms (D1020)', ops: ['n'], labels: ['n (ms)'], steps: 3, pulse: true, def: ['K10'] },
  // matrix (n words = 16 × n bits)
  MAND: { kind: 'box', cat: 'matrix', api: 180, name: 'Matrix AND of n words', ops: ['wordw', 'wordw', 'wordw', 'n'], labels: ['S1', 'S2', 'D', 'n'], steps: 9, pulse: true, def: ['D0', 'D10', 'D20', 'K3'] },
  MOR: { kind: 'box', cat: 'matrix', api: 181, name: 'Matrix OR of n words', ops: ['wordw', 'wordw', 'wordw', 'n'], labels: ['S1', 'S2', 'D', 'n'], steps: 9, pulse: true, def: ['D0', 'D10', 'D20', 'K3'] },
  MXOR: { kind: 'box', cat: 'matrix', api: 182, name: 'Matrix XOR of n words', ops: ['wordw', 'wordw', 'wordw', 'n'], labels: ['S1', 'S2', 'D', 'n'], steps: 9, pulse: true, def: ['D0', 'D10', 'D20', 'K3'] },
  MXNR: { kind: 'box', cat: 'matrix', api: 183, name: 'Matrix XNOR of n words', ops: ['wordw', 'wordw', 'wordw', 'n'], labels: ['S1', 'S2', 'D', 'n'], steps: 9, pulse: true, def: ['D0', 'D10', 'D20', 'K3'] },
  MINV: { kind: 'box', cat: 'matrix', api: 184, name: 'Matrix inverse (NOT) of n words', ops: ['wordw', 'wordw', 'n'], labels: ['S', 'D', 'n'], steps: 7, pulse: true, def: ['D0', 'D20', 'K3'] },
  MCMP: { kind: 'box', cat: 'matrix', api: 185, name: 'Matrix compare: first bit where S1 and S2 differ → D (−1 and M1089 when equal)', ops: ['wordw', 'wordw', 'n', 'dreg'], labels: ['S1', 'S2', 'n', 'D'], steps: 9, pulse: true, def: ['D0', 'D10', 'K3', 'D30'] },
  MBRD: { kind: 'box', cat: 'matrix', api: 186, name: 'Matrix bit read: bit D of S → M1095 (M1094: D + 1 after)', ops: ['wordw', 'n', 'dreg'], labels: ['S', 'n', 'D (pointer)'], steps: 7, pulse: true, def: ['D0', 'K3', 'D30'] },
  MBWR: { kind: 'box', cat: 'matrix', api: 187, name: 'Matrix bit write: M1096 → bit D of S (M1094: D + 1 after)', ops: ['wordw', 'n', 'dreg'], labels: ['S', 'n', 'D (pointer)'], steps: 7, pulse: true, def: ['D0', 'K3', 'D30'] },
  MBS: { kind: 'box', cat: 'matrix', api: 188, name: 'Matrix bit shift by one (M1097 = right, M1096 in, M1095 out)', ops: ['wordw', 'wordw', 'n'], labels: ['S', 'D', 'n'], steps: 7, pulse: true, def: ['D0', 'D20', 'K3'], defP: true },
  MBR: { kind: 'box', cat: 'matrix', api: 189, name: 'Matrix bit rotate by one (M1097 = right, M1095 = carry)', ops: ['wordw', 'wordw', 'n'], labels: ['S', 'D', 'n'], steps: 7, pulse: true, def: ['D0', 'D20', 'K3'], defP: true },
  MBC: { kind: 'box', cat: 'matrix', api: 190, name: 'Matrix bit count → D (M1088 ON: ON bits, OFF: OFF bits)', ops: ['wordw', 'n', 'dreg'], labels: ['S', 'n', 'D'], steps: 7, pulse: true, def: ['D0', 'K3', 'D30'] },
  // right-side special modules (DVP04AD-E2 …)
  FROM: { kind: 'box', cat: 'ext', api: 78, name: 'Read n control registers (CR) of special module m1, from CR#m2 → D…', ops: ['n', 'n', 'dreg', 'n'], labels: ['m1 (module K0 …)', 'm2 (CR#)', 'D', 'n'], steps: 9, pulse: true, def: ['K0', 'K12', 'D0', 'K4'] },
  TO: { kind: 'box', cat: 'ext', api: 79, name: 'Write S to n control registers (CR) of special module m1, from CR#m2', ops: ['n', 'n', 'word', 'n'], labels: ['m1 (module K0 …)', 'm2 (CR#)', 'S', 'n'], steps: 9, pulse: true, def: ['K0', 'K1', 'H0', 'K1'] },
  // checksums
  CCD: { kind: 'box', cat: 'comm', api: 84, name: 'Check code: sum of n bytes → D, parity (XOR) → D+1', ops: ['wordw', 'dreg', 'n'], labels: ['S', 'D', 'n (bytes)'], steps: 7, pulse: true, def: ['D0', 'D100', 'K6'] },
  LRC: { kind: 'box', cat: 'comm', api: 107, name: 'LRC check of n bytes (Modbus ASCII) → D', ops: ['wordw', 'n', 'dreg'], labels: ['S', 'n (bytes)', 'D'], steps: 7, pulse: true, def: ['D0', 'K6', 'D100'] },
  CRC: { kind: 'box', cat: 'comm', api: 108, name: 'CRC-16 of n bytes (Modbus RTU) → D', ops: ['wordw', 'n', 'dreg'], labels: ['S', 'n (bytes)', 'D'], steps: 7, pulse: true, def: ['D0', 'K6', 'D100'] },
};

/** Instruction picker groups, in order. */
export const INSTR_GROUPS = [
  ['contact', '01 · Contacts & edges (LD, LDI, LDP, LDF, INV, NP, PN)'],
  ['coil', '01 · Coils (OUT, SET, RST, PLS, PLF)'],
  ['timer', '02 · Timers & counters (TMR, TON, TOF, CNT, DCNT)'],
  ['compare', '03 · Compare (LD=, DLD=, CMP, ZCP)'],
  ['move', '03 · Data move & conversion (MOV, DMOV, BCD, GRY, SEGD …)'],
  ['math', '03 · Arithmetic (ADD, SUB, MUL, DIV, DADD …)'],
  ['logic', '06 · Word logic, shift, rotate, FIFO & bits'],
  ['bitw', '06 · Bit of a word (BLD, BAND, BOR, BOUT, BSET, BRST)'],
  ['float', '07 · Floating point (FLD=, DEADD, DEMUL, DSIN, FLT, INT …)'],
  ['flow', '04 · Program flow (CJ, CALL, FEND, FOR/NEXT, MC, END)'],
  ['step', '04 · Step ladder (STL / RET)'],
  ['handy', '08 · Handy instructions (SER, ABSD, INCD, RAMP, SORT, STMR …)'],
  ['time', '09 · Real-time clock (TRD, TWR, TCMP, TZCP, TADD, HOUR)'],
  ['pulse', '10 · High-speed, pulse & positioning (DHSCS, PLSY, PWM, DRVI …)'],
  ['matrix', '11 · Matrix (MAND, MOR, MXOR, MINV, MBRD, MBS …)'],
  ['comm', '05 · Communication, VFD & checksums (MODRW, FWD, CRC …)'],
  ['ext', '12 · Special modules: analog input (FROM, TO)'],
];

/** Picker filter chips: [label, categories]. */
export const INSTR_FILTERS = [
  ['All', null],
  ['Math', ['math', 'float']],
  ['Logic', ['logic', 'bitw', 'matrix']],
  ['Compare', ['compare', 'float']],
  ['Move', ['move']],
  ['Timers', ['timer', 'time']],
  ['Flow', ['flow', 'step']],
  ['Pulse', ['pulse']],
  ['Handy', ['handy']],
  ['Comm', ['comm']],
  ['Analog', ['ext']],
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
  if (d.cmp) el.op = extra.op || (t === 'FCC' ? '>=' : '>');
  if (d.pulse && (extra.p !== undefined ? extra.p : d.defP)) el.p = true;
  if (d.dbl && (extra.d !== undefined ? extra.d : d.defD)) el.d = true;
  return el;
}

/** 32-bit instruction (D… form, or one that is always 32-bit such as DHSCS). */
export const is32 = (el) => !!(el && INSTR[el.t] && (INSTR[el.t].d32 || (INSTR[el.t].dbl && el.d)));

/** Instructions that work on floating-point values (two registers, IEEE 754). */
export const isFloatInstr = (t) => !!(INSTR[t] && INSTR[t].ops.some((c) => c === 'fsrc' || c === 'fdst'));

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
  if (el.t === 'CC' || el.t === 'FCC') return `${el.a[0]} ${el.op} ${el.a[1]}`;
  if (el.t === 'BLD' || el.t === 'BLDI') return `${el.a[0]}.${String(el.a[1] || '').replace(/^[KH]/, '')}`;
  if (el.t === 'INV' || el.t === 'MEP' || el.t === 'MEF' || el.t === 'NP' || el.t === 'PN') return el.t;
  if (el.t === 'STL') return `STL ${el.a[0]}`;
  const d = INSTR[el.t];
  if (d.kind === 'box') return `${mnemonic(el)} ${el.a.join(' ')}`;
  return el.a[0] || '';
}

/** The instruction name as ISPSoft writes it: DMOVP, DAND, MOV, LD> … */
export function mnemonic(el) {
  if (!el) return '';
  const d = INSTR[el.t];
  if (!d) return el.t;
  const base = el.d && d.dbl ? (d.dname || 'D' + el.t) : el.t;
  if (d.kind === 'box') return base + (el.p ? 'P' : '');
  if (el.t === 'CC') return (el.d ? 'DLD' : 'LD') + (el.op || '');
  if (el.t === 'FCC') return 'FLD' + (el.op || '');
  if (el.t === 'BLD' || el.t === 'BLDI') return (el.d ? 'D' : '') + el.t;
  return el.t;
}

/** Program steps of an element (32-bit forms are longer). */
export function stepsOf(el) {
  const d = INSTR[el.t];
  let st = d.steps;
  if (el.d && d.dbl) st = 1 + (st - 1) * 2;
  return st;
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
    if (el.t === 'INV' || el.t === 'MEP' || el.t === 'MEF' || el.t === 'NP' || el.t === 'PN') {
      if (mode !== 'AND') { this.err = `${el.t} must follow a contact in series`; return; }
      this.push(el.t, 1, x); return;
    }
    if (el.t === 'STL') { this.err = 'STL must be the first cell of a network (on the left bus bar)'; return; }
    const D = el.d && d.dbl ? 'D' : '';
    if (el.t === 'CC' || el.t === 'FCC') { this.push(`${D}${d.il[i]}${el.op} ${el.a[0]} ${el.a[1]}`, stepsOf(el), x); return; }
    if (el.t === 'BLD' || el.t === 'BLDI') { this.push(`${D}${d.il[i]} ${el.a[0]} ${el.a[1]}`, stepsOf(el), x); return; }
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
    let steps = stepsOf(el);
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
/** 16 / 32-bit rules of one operand: returns an error text or null. */
function widthCheck(op, cls, wide) {
  if (op.dev === 'FL' && cls !== 'fsrc') return 'a floating-point constant (F…) only goes into floating-point instructions';
  if (!['word', 'wordw', 'fsrc', 'fdst', 'dreg'].includes(cls)) return null;
  if (op.dev && op.dev[0] === 'K' && op.n) {
    if (!wide && op.n > 4) return `${op.text}: K5 … K8 only in 32-bit (D…) instructions — use K1 … K4`;
    return null;
  }
  if (!wide) return null;
  if (op.dev === 'T') return `${op.text}: timers are 16-bit — 32-bit instructions use D, C200 … C255, E or KnM`;
  if (op.dev === 'C' && op.idx < 200) return `${op.text}: C0 … C199 are 16-bit — use C200 … C255 in 32-bit instructions`;
  if (op.dev === 'F') return `${op.text}: in 32-bit instructions use E (E and F together hold the value)`;
  if (op.dev === 'D' && op.idx >= DEVICES.D.max) return `${op.text}: a 32-bit value needs ${op.text} and the next register`;
  return null;
}

/** Extra operand checks of one instruction: returns an error text or null. */
function checkInstr(el, ops) {
  const v = (i) => (ops[i] ? ops[i].val : undefined);
  const max = (op) => (DEVICES[op.bdev || op.dev] ? DEVICES[op.bdev || op.dev].max : 0);
  const fits = (op, n) => !op || op.idx === undefined || (op.n ? op.idx + op.n * 4 * n - 1 : op.idx + n - 1) <= max(op);
  switch (el.t) {
    case 'ZRST': if (ops[0] && ops[1] && (ops[0].dev !== ops[1].dev || ops[0].idx > ops[1].idx)) return 'ZRST: D1 and D2 must be the same device type with D1 ≤ D2'; break;
    case 'MODRW': if (ops[1] && ops[1].dev !== 'D' && ![1, 2, 3, 4, 5, 6, 15, 16].includes(ops[1].val)) return 'MODRW: function must be K1 / K2 (read bits), K3 / K4 (read words), K5 (write one bit), K6 (write one word), K15 (write bits) or K16 (write words)'; break;
    case 'BMOV': case 'FMOV': case 'MEAN': {
      const n = v(2), lim = el.t === 'MEAN' ? 64 : 512;
      if (n !== undefined && (n < 1 || n > lim)) return `${el.t}: n must be K1 … K${lim}`;
      if (n !== undefined && (!fits(ops[1], el.t === 'MEAN' ? 1 : n) || (el.t !== 'FMOV' && !fits(ops[0], n)))) return `${el.t}: the block runs past the last device`;
      break;
    }
    case 'DCNT': if (ops[0] && (ops[0].idx < 200 || (ops[0].idx > 242 && (ops[0].idx < 251 || ops[0].idx > 254)))) return 'DCNT: use a 32-bit counter C200 … C234, C235 … C242 for the high-speed input X0 … X7, or C251 … C254 for an A/B encoder (X0/X1 … X6/X7)'; break;
    case 'CNT': if (ops[0] && ops[0].idx >= 200) return 'CNT: C200 and up are 32-bit counters — use DCNT'; break;
    case 'WSFR': case 'WSFL': {
      const n1 = v(2), n2 = v(3);
      if (n1 !== undefined && n2 !== undefined && (n2 < 1 || n1 < n2 || n1 > 512)) return `${el.t}: needs 1 ≤ n2 ≤ n1 ≤ 512`;
      if (n1 !== undefined && (!fits(ops[1], n1) || !fits(ops[0], n2 || 1))) return `${el.t}: the words run past the last device`;
      break;
    }
    case 'SFWR': case 'SFRD': {
      const n = v(2);
      if (n !== undefined && (n < 2 || n > 512)) return `${el.t}: n must be K2 … K512`;
      const q = ops[el.t === 'SFWR' ? 1 : 0];
      if (n !== undefined && !fits(q, n)) return `${el.t}: the queue runs past the last device`;
      break;
    }
    case 'MODRD': if (ops[2] && ops[2].val !== undefined && (ops[2].val < 1 || ops[2].val > 7)) return 'MODRD: length must be K1 … K7 (data goes to D1050 …)'; break;
    case 'ROR': case 'ROL': case 'RCR': case 'RCL': if (v(1) !== undefined && (v(1) < 1 || v(1) > 16)) return `${el.t}: n must be K1 … K16`; break;
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
    case 'CMP': case 'ZCP': case 'DECMP': case 'DEZCP': case 'TZCP': { const d = ops[['CMP', 'DECMP'].includes(el.t) ? 2 : 3]; if (d && !fits(d, 3)) return `${el.t}: D uses 3 bits — they run past the last device`; break; }
    case 'TCMP': if (ops[4] && !fits(ops[4], 3)) return 'TCMP: D uses 3 bits — they run past the last device'; break;
    case 'BLD': case 'BLDI': case 'BOUT': case 'BSET': case 'BRST': {
      const n = v(1), lim = el.d ? 31 : 15;
      if (n !== undefined && (n < 0 || n > lim)) return `${mnemonic(el)}: the bit number must be K0 … K${lim}`;
      break;
    }
    case 'SMOV': {
      const m1 = v(1), m2 = v(2), n = v(4);
      if ([m1, m2, n].some((x) => x !== undefined && (x < 1 || x > 4))) return 'SMOV: m1, m2 and n must be K1 … K4';
      if (m1 !== undefined && m2 !== undefined && m2 > m1) return 'SMOV: m2 (digits) cannot be more than m1';
      if (n !== undefined && m2 !== undefined && m2 > n) return 'SMOV: m2 (digits) cannot be more than n';
      break;
    }
    case 'ASCI': case 'HEX': case 'CCD': case 'LRC': case 'CRC': {
      const n = v(el.t === 'LRC' || el.t === 'CRC' ? 1 : 2);
      if (n !== undefined && (n < 1 || n > 256)) return `${el.t}: n must be K1 … K256`;
      break;
    }
    case 'WSUM': case 'MAND': case 'MOR': case 'MXOR': case 'MXNR': case 'MINV': case 'MCMP': case 'MBRD': case 'MBWR': case 'MBS': case 'MBR': case 'MBC': case 'SER': case 'ABSD': case 'INCD': {
      const ni = { WSUM: 2, MAND: 3, MOR: 3, MXOR: 3, MXNR: 3, MINV: 2, MCMP: 2, MBRD: 1, MBWR: 1, MBS: 2, MBR: 2, MBC: 1, SER: 3, ABSD: 3, INCD: 3 }[el.t];
      const n = v(ni);
      if (n !== undefined && (n < 1 || n > 256)) return `${el.t}: n must be K1 … K256`;
      if (n !== undefined && ['ABSD', 'INCD'].includes(el.t) && !fits(ops[2], n)) return `${el.t}: the output bits run past the last device`;
      if (n !== undefined && el.t === 'ABSD' && !fits(ops[0], 2 * n)) return 'ABSD: the table (2 × n words) runs past the last device';
      break;
    }
    case 'RAMP': if (v(3) !== undefined && v(3) < 1) return 'RAMP: n (scans) must be K1 or more'; break;
    case 'SORT': {
      const m1 = v(1), m2 = v(2);
      if (m1 !== undefined && (m1 < 1 || m1 > 32)) return 'SORT: m1 (rows) must be K1 … K32';
      if (m2 !== undefined && (m2 < 1 || m2 > 6)) return 'SORT: m2 (columns) must be K1 … K6';
      if (m1 !== undefined && m2 !== undefined && (!fits(ops[0], m1 * m2) || !fits(ops[3], m1 * m2))) return 'SORT: the table runs past the last register';
      break;
    }
    case 'TKY': if (!fits(ops[0], 10) || !fits(ops[2], 11)) return 'TKY: 10 key inputs and 11 output bits are needed'; break;
    case 'STMR': if (!fits(ops[2], 4)) return 'STMR: D uses 4 bits — they run past the last device'; break;
    case 'TTMR': if (v(1) !== undefined && (v(1) < 0 || v(1) > 2)) return 'TTMR: n must be K0, K1 or K2'; break;
    case 'ANS': if (ops[2] && ops[2].idx < 900) return 'ANS: annunciators are S900 … S1023'; if (ops[0] && ops[0].idx > 183) return 'ANS: use a timer T0 … T183'; break;
    case 'DHSCS': case 'DHSCR': case 'DHSZ': {
      const c = ops[el.t === 'DHSZ' ? 2 : 1];
      if (c && c.idx < 200) return `${el.t}: use a 32-bit / high-speed counter C200 … C255`;
      if (el.t === 'DHSZ' && ops[3] && !fits(ops[3], 3)) return 'DHSZ: D uses 3 bits — they run past the last device';
      break;
    }
    case 'TRD': case 'TWR': if (ops[0] && !fits(ops[0], 7)) return `${el.t}: 7 registers are needed`; break;
    case 'PLSY': case 'PLSR': case 'DRVI': case 'DRVA': case 'PLSV': case 'ZRN': {
      const y = ops[el.t === 'PLSY' ? 2 : el.t === 'PLSR' ? 3 : el.t === 'PLSV' ? 1 : el.t === 'ZRN' ? 3 : 2];
      if (y && y.idx > 3) return `${el.t}: the pulse output is Y0 … Y3 (high-speed outputs)`;
      break;
    }
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
      const wide = is32(el), flt = isFloatInstr(el.t);
      d.ops.forEach((cls, i) => {
        const r = checkOperand(el.a[i], cls, ctxFor(row, col));
        if (r.err) errors.push({ ...loc(row, col), msg: `${mnemonic(el)}: ${r.err}` });
        else if (r.op) {
          const w = widthCheck(r.op, cls, wide || ((cls === 'fsrc' || cls === 'fdst') && flt));
          if (w) errors.push({ ...loc(row, col), msg: `${mnemonic(el)}: ${w}` });
        }
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
      return { t: el.t, a: ops, op: el.op, p: !!el.p, d: is32(el), rail: !!d.rail, sid: sid++, r: row, c: col };
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
    if (f.t === 'FOR') {
      let depth = 0, ok = false;
      for (const x of flowUse) {
        if (x.exec <= f.exec) continue;
        if (x.t === 'FOR') depth++;
        if (x.t === 'NEXT') { if (!depth) { ok = true; break; } depth--; }
      }
      if (!ok) errors.push({ ...at, msg: 'FOR has no NEXT after it — end the loop with NEXT in a later network' });
      const nest = flowUse.filter((x) => x.t === 'FOR' && x.exec < f.exec).length - flowUse.filter((x) => x.t === 'NEXT' && x.exec < f.exec).length;
      if (nest >= 5) errors.push({ ...at, msg: 'FOR … NEXT loops nest at most 5 deep' });
    }
    if (f.t === 'NEXT' && flowUse.filter((x) => x.t === 'NEXT' && x.exec <= f.exec).length > flowUse.filter((x) => x.t === 'FOR' && x.exec < f.exec).length) errors.push({ ...at, msg: 'NEXT has no FOR before it' });
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
