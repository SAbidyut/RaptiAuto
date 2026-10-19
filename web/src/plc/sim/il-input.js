// Typed instruction input for the ladder editor (like ISPSoft's "input instruction" box): one line of
// instruction-list text → the element to place and where it goes.
//
//   LD X0 · LDI X1 · AND X2 · ANI M0 · OR Y0 · ORI M1 · LDP / ANDP / ORP / LDF … (edges)
//   LD= D0 K10 · AND> D0 K5 · OR<> … · DLD>= (32-bit) · FLD> (float)
//   OUT Y0 · SET M0 · RST M0 · TMR T0 K50 · CNT C0 K5 · MOV K10 D0 · DMOVP … · MODRW K1 K6 H2000 D10 K1
//   shorthands: X0 (= LD / AND X0) · /X0 (NC) · ^X0 (rising edge) · - (horizontal line)
import { INSTR, CMP_OPS, checkElement, mnemonic } from './ladder.js';
import { parseMnemonic } from './dsl.js';

// contact mnemonics from the instruction table: LD → NO at the bus / in series, OR → in parallel
const CONTACTS = new Map();
for (const [t, d] of Object.entries(INSTR)) {
  if (d.kind !== 'contact' || !d.il || t === 'CC' || t === 'FCC') continue;
  d.il.forEach((name, pos) => {
    if (!name) return;
    CONTACTS.set(name, { t, pos, d: false });
    if (d.dbl) CONTACTS.set('D' + name, { t, pos, d: true });
  });
}
const OPS_RE = CMP_OPS.slice().sort((a, b) => b.length - a.length).map((o) => o.replace(/[|^]/g, (m) => '\\' + m)).join('|');
const CMP_RE = new RegExp(`^([DF]?)(LD|AND|OR)(${OPS_RE})$`);
const OPERAND_RE = /^(?:[XYMSTCDEF]\d|K\d[XYMS]\d)/;

const plural = (n) => (n === 1 ? '' : 's');

/**
 * Parse one typed line. Returns { el, place } with place 'contact' (series, at the cursor),
 * 'parallel' (OR, below the cursor), 'output' (output column) or 'stl' — or { err }.
 */
export function parseInstrLine(text, model = null) {
  const toks = String(text || '').trim().toUpperCase().split(/[\s,]+/).filter(Boolean);
  if (!toks.length) return { err: 'Type an instruction, e.g. LD X0, OUT Y0 or MOV K10 D0' };
  let [name, ...args] = toks;
  if (name === '-' || name === '—') return { el: { t: 'H', a: [] }, place: 'contact' };
  let el = null, place = 'contact';
  // shorthands: X0, /X0, ^X0
  const sh = /^([/^]?)(.+)$/.exec(name);
  if (!CONTACTS.has(name) && !CMP_RE.test(name) && OPERAND_RE.test(sh[2]) && !args.length) {
    el = { t: sh[1] === '/' ? 'NC' : sh[1] === '^' ? 'P' : 'NO', a: [sh[2]] };
  } else if (CMP_RE.test(name)) {
    const [, pre, base, op] = CMP_RE.exec(name);
    el = { t: pre === 'F' ? 'FCC' : 'CC', op, a: args.slice() };
    if (pre === 'D') el.d = true;
    if (base === 'OR') place = 'parallel';
  } else if (CONTACTS.has(name)) {
    const c = CONTACTS.get(name);
    el = { t: c.t, a: args.slice() };
    if (c.d) el.d = true;
    if (c.pos === 2) place = 'parallel';
    if (c.t === 'STL') place = 'stl';
  } else {
    const m = parseMnemonic(name);
    if (!m || !INSTR[m.t] || INSTR[m.t].kind === 'contact' || INSTR[m.t].kind === 'wire') {
      return { err: `Unknown instruction “${name}”` };
    }
    el = { t: m.t, a: args.slice() };
    if (m.p) el.p = true;
    if (m.d) el.d = true;
    place = 'output';
  }
  return checked(el, place, model, sh[1] && !CONTACTS.has(name) ? 'LD' : name);
}

function checked(el, place, model, typed) {
  const d = INSTR[el.t];
  const need = d.ops.length;
  if (el.a.length !== need) {
    const what = d.labels && d.labels.length ? ': ' + d.labels.join(', ') : '';
    return { err: need ? `${typed} needs ${need} operand${plural(need)}${what}` : `${typed} takes no operands`, el, place };
  }
  const bad = checkElement(el, model);
  if (bad) return { err: bad.replace(new RegExp('^' + mnemonic(el) + ':'), typed + ':'), el, place };
  return { el, place };
}

/** The line that describes an existing element (to edit it in the box): LD X0, AND> D0 K5, OUT Y0, MOVP K1 D0. */
export function elementLine(el, col = 0) {
  if (!el || el.t === 'H') return '';
  const d = INSTR[el.t];
  if (!d) return '';
  if (el.t === 'CC' || el.t === 'FCC') return `${el.t === 'FCC' ? 'F' : el.d ? 'D' : ''}${col ? 'AND' : 'LD'}${el.op} ${el.a.join(' ')}`;
  if (d.kind === 'contact') {
    const name = d.il ? (col ? d.il[1] : d.il[0] || d.il[1]) : el.t;
    return [((el.d ? 'D' : '') + name), ...(el.a || [])].join(' ').trim();
  }
  return [mnemonic(el), ...(el.a || [])].join(' ');
}

/** Words the input box offers as one-tap chips. */
export const IL_CHIPS = ['LD', 'LDI', 'AND', 'ANI', 'OR', 'ORI', 'LDP', 'OUT', 'SET', 'RST', 'TMR', 'CNT', 'MOV', 'ADD', 'MODRW', 'FROM', 'LD>', 'LD=', '-'];
