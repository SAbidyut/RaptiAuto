// Compact text form of ladder rungs, used by the example projects and tests.
//
//   rung('Start / stop', ['X0| X1 /M11 => OUT M0', 'M10|', 'M0'])
//
// Cells are separated by spaces: X0 (NO), /X0 (NC), ^X0 (rising), vX0 (falling), D0>K10 (compare,
// also D0&K1 …), ! (INV), MEP / MEF, $S20 (STL S20), - (line), . (empty). A trailing | links the
// cell's right edge to the row below. labelled('P0', rung(…)) gives a network a pointer for CJ / CALL.
// After => comes the output: OUT Y0, SET M0, TMR T0 K50, MOVP K10 D0 … ; "=>|" also links the
// output column to the row below (parallel outputs).
import { COLS, emptyRung, INSTR, CMP_OPS, rungId } from './ladder.js';

const CMP_RE = new RegExp(`^([A-Z]\\d+|K-?\\d+|H[0-9A-F]+)(${CMP_OPS.slice().sort((a, b) => b.length - a.length).map((o) => o.replace(/[<>=&|^]/g, (m) => '\\' + m)).join('|')})([A-Z]\\d+|K-?\\d+|H[0-9A-F]+)$`);

function cell(tok) {
  if (tok === '.' || tok === '') return null;
  if (tok === '-') return { t: 'H', a: [] };
  if (tok === '!') return { t: 'INV', a: [] };
  if (tok === 'MEP' || tok === 'MEF') return { t: tok, a: [] };
  if (tok[0] === '$') return { t: 'STL', a: [tok.slice(1)] };
  const m = CMP_RE.exec(tok);
  if (m) return { t: 'CC', a: [m[1], m[3]], op: m[2] };
  if (tok[0] === '/') return { t: 'NC', a: [tok.slice(1)] };
  if (tok[0] === '^') return { t: 'P', a: [tok.slice(1)] };
  if (tok[0] === 'v') return { t: 'F', a: [tok.slice(1)] };
  return { t: 'NO', a: [tok] };
}

function out(text) {
  const parts = text.trim().split(/\s+/);
  let name = parts[0].toUpperCase();
  let p = false;
  if (!INSTR[name] && name.endsWith('P') && INSTR[name.slice(0, -1)] && INSTR[name.slice(0, -1)].pulse) { name = name.slice(0, -1); p = true; }
  if (!INSTR[name]) throw new Error('Unknown instruction ' + parts[0]);
  const el = { t: name, a: parts.slice(1) };
  if (p) el.p = true;
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
