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
};
export const OPERAND_DEVS = OPCLASS;

export const INSTR = {
  NO: { kind: 'contact', name: 'Normally open contact', il: ['LD', 'AND', 'OR'], ops: ['bit'], labels: ['Device'], steps: 1, def: ['X0'] },
  NC: { kind: 'contact', name: 'Normally closed contact', il: ['LDI', 'ANI', 'ORI'], ops: ['bit'], labels: ['Device'], steps: 1, def: ['X1'] },
  P: { kind: 'contact', name: 'Rising-edge contact', il: ['LDP', 'ANDP', 'ORP'], ops: ['bit'], labels: ['Device'], steps: 2, def: ['X0'] },
  F: { kind: 'contact', name: 'Falling-edge contact', il: ['LDF', 'ANDF', 'ORF'], ops: ['bit'], labels: ['Device'], steps: 2, def: ['X0'] },
  CC: { kind: 'contact', name: 'Compare contact', il: ['LD', 'AND', 'OR'], ops: ['word', 'word'], labels: ['S1', 'S2'], steps: 5, def: ['D0', 'K10'], cmp: true },
  INV: { kind: 'contact', name: 'Inverse (NOT)', il: [null, 'INV', null], ops: [], labels: [], steps: 1, def: [] },
  H: { kind: 'wire', name: 'Horizontal line', ops: [], labels: [], steps: 0, def: [] },
  OUT: { kind: 'out', name: 'Output coil', ops: ['bitw'], labels: ['Device'], steps: 1, def: ['Y0'] },
  SET: { kind: 'out', name: 'Set (latch ON)', ops: ['bitw'], labels: ['Device'], steps: 1, def: ['M0'] },
  RST: { kind: 'out', name: 'Reset (OFF / clear)', ops: ['rst'], labels: ['Device'], steps: 1, def: ['M0'] },
  PLS: { kind: 'out', name: 'Rising-edge pulse output', ops: ['bitw'], labels: ['Device'], steps: 2, def: ['M10'] },
  PLF: { kind: 'out', name: 'Falling-edge pulse output', ops: ['bitw'], labels: ['Device'], steps: 2, def: ['M11'] },
  TMR: { kind: 'box', name: '16-bit timer', ops: ['timer', 'word'], labels: ['Timer', 'Set value'], steps: 4, def: ['T0', 'K10'] },
  CNT: { kind: 'box', name: '16-bit counter', ops: ['counter', 'word'], labels: ['Counter', 'Set value'], steps: 4, def: ['C0', 'K10'] },
  MOV: { kind: 'box', api: 12, name: 'Move', ops: ['word', 'wordw'], labels: ['S', 'D'], steps: 5, pulse: true, def: ['K0', 'D0'] },
  ADD: { kind: 'box', api: 20, name: 'Addition  D = S1 + S2', ops: ['word', 'word', 'wordw'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'K1', 'D0'] },
  SUB: { kind: 'box', api: 21, name: 'Subtraction  D = S1 − S2', ops: ['word', 'word', 'wordw'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'K1', 'D0'] },
  MUL: { kind: 'box', api: 22, name: 'Multiplication  D+1,D = S1 × S2', ops: ['word', 'word', 'dreg'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'K10', 'D2'] },
  DIV: { kind: 'box', api: 23, name: 'Division  D = S1 ÷ S2, D+1 = remainder', ops: ['word', 'word', 'dreg'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'K10', 'D2'] },
  INC: { kind: 'box', api: 24, name: 'Increment  D = D + 1', ops: ['wordw'], labels: ['D'], steps: 3, pulse: true, def: ['D0'], defP: true },
  DEC: { kind: 'box', api: 25, name: 'Decrement  D = D − 1', ops: ['wordw'], labels: ['D'], steps: 3, pulse: true, def: ['D0'], defP: true },
  CMP: { kind: 'box', api: 10, name: 'Compare → 3 bits (>, =, <)', ops: ['word', 'word', 'bitw'], labels: ['S1', 'S2', 'D'], steps: 7, pulse: true, def: ['D0', 'K10', 'M10'] },
  ZRST: { kind: 'box', api: 40, name: 'Zone reset', ops: ['zone', 'zone'], labels: ['D1', 'D2'], steps: 5, pulse: true, def: ['M0', 'M9'] },
  ALT: { kind: 'box', api: 66, name: 'Alternate (toggle) bit', ops: ['bitw'], labels: ['D'], steps: 3, pulse: true, def: ['M0'], defP: true },
  MODRW: { kind: 'box', api: 150, name: 'Modbus read / write (COM2)', ops: ['word', 'word', 'word', 'dreg', 'word'], labels: ['Station', 'Function', 'Address', 'Data reg.', 'Length'], steps: 11, def: ['K1', 'K6', 'H2000', 'D0', 'K1'] },
};

export const CMP_OPS = ['=', '<>', '>', '>=', '<', '<='];

export const isContactType = (t) => INSTR[t] && (INSTR[t].kind === 'contact' || INSTR[t].kind === 'wire');
export const isOutputType = (t) => INSTR[t] && (INSTR[t].kind === 'out' || INSTR[t].kind === 'box');

let uid = 0;
export const rungId = () => 'n' + Date.now().toString(36) + (uid++).toString(36);

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
  if (r > 0 && row.every((x) => !x)) {
    // a parallel output: join to the row above at the output column
    rung.vl[r - 1][row.length - 1] = true;
  } else fillToOutput(rung, r);
}

export function toggleLink(rung, r, c) {
  if (r >= rung.cells.length - 1) addRow(rung);
  rung.vl[r][c] = !rung.vl[r][c];
}

export function rungIsEmpty(rung) {
  return rung.outs.every((x) => !x) && rung.cells.every((row) => row.every((x) => !x));
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
  if (el.t === 'INV') return 'INV';
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
    if (el.t === 'INV') {
      if (mode !== 'AND') { this.err = 'INV must follow a contact in series'; return; }
      this.push('INV', 1, x); return;
    }
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
export function rungIL(rung) {
  const g = buildGraph(rung);
  const w = new ILWriter();
  const groups = []; // [{node, outs:[el]}]
  for (let r = 0; r < g.rows; r++) {
    const o = rung.outs[r];
    if (!o) continue;
    const n = g.node(r, g.cols);
    let gr = groups.find((x) => x.node === n);
    if (!gr) { gr = { node: n, outs: [] }; groups.push(gr); }
    gr.outs.push(o);
  }
  if (!groups.length) return { lines: [], error: 'no output instruction' };
  for (const gr of groups) {
    gr.x = exprTo(g, gr.node);
    if (gr.x === 'none') return { lines: [], error: 'an output is not connected to the left bus bar' };
    if (gr.x === null) return { lines: [], error: 'this network cannot be converted (bridge circuit)' };
    if (gr.x.k === 'T') return { lines: [], error: 'an output is connected straight to the left bus bar — add a contact (e.g. M1000)' };
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
  if (w.err) return { lines: [], error: w.err };
  return { lines: w.lines, error: null };
}

// ------------------------------------------------------------------ compiler
/**
 * Compile a program for the CPU. `model` = { name, inputs, outputs } of the target PLC.
 * Returns { ok, errors:[{rung,row,col,msg}], warnings:[…], rungs (executable), stateCount, steps, il:[{rung, lines, error}] }.
 */
export function compileProgram(program, model) {
  const prog = normalizeProgram(program);
  const errors = [], warnings = [];
  const exec = [];
  let sid = 0, steps = 0;
  const coilUse = new Map();
  const il = [];
  prog.rungs.forEach((rung, ri) => {
    if (rungIsEmpty(rung)) return;
    const loc = (row, col) => ({ rung: ri, row, col });
    const rows = rung.cells.length, cols = rung.cells[0].length;
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
      if (el.t === 'ZRST' && ops[0] && ops[1] && (ops[0].dev !== ops[1].dev || ops[0].idx > ops[1].idx)) errors.push({ ...loc(row, col), msg: 'ZRST: D1 and D2 must be the same device type with D1 ≤ D2' });
      if (el.t === 'MODRW' && ops[1] && ops[1].dev !== 'D' && ![3, 6, 16].includes(ops[1].val)) errors.push({ ...loc(row, col), msg: 'MODRW: function must be K3 (read), K6 (write one) or K16 (write many)' });
      if ((el.t === 'OUT' || el.t === 'PLS' || el.t === 'PLF') && ops[0]) {
        const k = ops[0].text;
        if (coilUse.has(k)) warnings.push({ ...loc(row, col), msg: `Double coil: ${k} is also driven in network ${coilUse.get(k) + 1}` });
        else coilUse.set(k, ri);
      }
      return { t: el.t, a: ops, op: el.op, p: !!el.p, sid: sid++, r: row, c: col };
    };
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
    il.push({ rung: ri, lines: res.lines, error: res.error });
    if (res.error) errors.push({ ...loc(0, 0), msg: `Network ${ri + 1}: ${res.error}` });
    for (const ln of res.lines) steps += ln.steps;
    exec.push({ index: ri, rows, cols, cells, outs, merges });
  });
  steps += 1; // END
  if (!exec.length) warnings.push({ rung: 0, row: 0, col: 0, msg: 'The program is empty' });
  return { ok: errors.length === 0, errors, warnings, rungs: exec, stateCount: sid, steps, il, comments: { ...prog.comments } };
}

/** Full instruction list with step numbers, for display. */
export function programIL(compiled) {
  const out = [];
  let step = 0;
  for (const r of compiled.il) {
    if (r.error) { out.push({ step: null, text: `; network ${r.rung + 1}: ${r.error}`, rung: r.rung, error: true }); continue; }
    for (const ln of r.lines) { out.push({ step, text: ln.text, rung: r.rung }); step += ln.steps; }
  }
  out.push({ step, text: 'END', rung: null });
  return out;
}

export { BIT_DEVS, DEVICES };
