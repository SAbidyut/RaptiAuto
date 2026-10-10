// Compact text form of ladder rungs, used by the example projects and tests.
//
//   rung('Start / stop', ['X0| X1 /M11 => OUT M0', 'M10|', 'M0'])
//
// Cells are separated by spaces: X0 (NO), /X0 (NC), ^X0 (rising), vX0 (falling), D0>K10 (compare,
// also D0&K1 …; #D0>K100000 is the 32-bit DLD>, ~D0>F1.5 the floating-point FLD>), D0.3 (BLD: bit 3
// of D0; /D0.3 = BLDI, #D0.20 = DBLD), ! (INV), MEP / MEF / NP / PN, $S20 (STL S20), - (line), . (empty). A trailing | links the
// cell's right edge to the row below. labelled('P0', rung(…)) gives a network a pointer for CJ / CALL.
// After => comes the output: OUT Y0, SET M0, TMR T0 K50, MOVP K10 D0 … ; "=>|" also links the
// output column to the row below (parallel outputs).
import { COLS, emptyRung, INSTR, CMP_OPS, rungId } from './ladder.js';

const OPND = 'K\\d[XYMS]\\d+(?:[EF][0-7])?|F-?[\\d.]+(?:E[+-]?\\d+)?|[A-Z]\\d+(?:[EF][0-7])?|K-?\\d+(?:[EF][0-7])?|H[0-9A-F]+';
const CMP_RE = new RegExp(`^(${OPND})(${CMP_OPS.slice().sort((a, b) => b.length - a.length).map((o) => o.replace(/[<>=&|^]/g, (m) => '\\' + m)).join('|')})(${OPND})$`);

function cell(tok) {
  if (tok === '.' || tok === '') return null;
  if (tok === '-') return { t: 'H', a: [] };
  if (tok === '!') return { t: 'INV', a: [] };
  if (tok === 'MEP' || tok === 'MEF' || tok === 'NP' || tok === 'PN') return { t: tok, a: [] };
  if (tok[0] === '$') return { t: 'STL', a: [tok.slice(1)] };
  const wide = tok[0] === '#', flt = tok[0] === '~';
  const body = wide || flt ? tok.slice(1) : tok;
  const m = CMP_RE.exec(body);
  if (m) return flt ? { t: 'FCC', a: [m[1], m[3]], op: m[2] } : { t: 'CC', a: [m[1], m[3]], op: m[2], ...(wide ? { d: true } : {}) };
  const bit = /^(\/?)([A-Z][A-Z0-9]*?\d+)\.(\d+)$/.exec(body);
  if (bit) return { t: bit[1] ? 'BLDI' : 'BLD', a: [bit[2], 'K' + bit[3]], ...(wide ? { d: true } : {}) };
  if (tok[0] === '/') return { t: 'NC', a: [tok.slice(1)] };
  if (tok[0] === '^') return { t: 'P', a: [tok.slice(1)] };
  if (tok[0] === 'v') return { t: 'F', a: [tok.slice(1)] };
  return { t: 'NO', a: [tok] };
}

/** Instruction name → {t, p, d}: MOV, MOVP, DMOV, DMOVP, DAND (= 32-bit WAND), DEADDP … */
export function parseMnemonic(text) {
  const name = String(text).toUpperCase();
  const tries = [[name, false]];
  if (name.endsWith('P')) tries.push([name.slice(0, -1), true]);
  for (const [n, p] of tries) {
    if (INSTR[n] && (!p || INSTR[n].pulse)) return { t: n, p, d: !!INSTR[n].defD };
    const dn = Object.keys(INSTR).find((k) => INSTR[k].dbl && (INSTR[k].dname || 'D' + k) === n);
    if (dn && (!p || INSTR[dn].pulse)) return { t: dn, p, d: true };
  }
  return null;
}

function out(text) {
  const parts = text.trim().split(/\s+/);
  const m = parseMnemonic(parts[0]);
  if (!m) throw new Error('Unknown instruction ' + parts[0]);
  const el = { t: m.t, a: parts.slice(1) };
  if (m.p) el.p = true;
  if (m.d) el.d = true;
  return el;
}

export function rung(comment, rows, cols = COLS) {
  const r = emptyRung(cols);
  r.id = rungId();
  r.comment = comment || '';
  r.cells = []; r.outs = []; r.vl = [];
  rows.forEach((line, ri) => {
    const [left, right] = line.split('=>');
    const cells = new Array(cols).fill(null);
    const links = new Array(cols).fill(false);
    const toks = left.trim() ? left.trim().split(/\s+/) : [];
    toks.forEach((tk, c) => {
      let t = tk;
      if (t.endsWith('|')) { links[c] = true; t = t.slice(0, -1); }
      cells[c] = cell(t);
    });
    let o = null;
    if (right !== undefined) {
      let rt = right.trim();
      if (rt.startsWith('|')) { links[cols - 1] = true; rt = rt.slice(1).trim(); }
      o = out(rt);
      if (toks.length) for (let c = toks.length; c < cols; c++) if (!cells[c]) cells[c] = { t: 'H', a: [] };
    }
    r.cells.push(cells);
    r.outs.push(o);
    if (ri < rows.length - 1) r.vl.push(links);
  });
  return r;
}

/** Give a network a pointer label (P0 …) for CJ / CALL. */
export function labelled(label, r) { r.label = label; return r; }

export function program(rungs, comments = {}) {
  return { cols: COLS, rungs, comments };
}
