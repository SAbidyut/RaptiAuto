// Ladder tab: an ISPSoft-like ladder editor for phones — grid cursor, instruction toolbar, operand
// keypad, live compile, download over USB, PLC RUN/STOP and online power-flow monitoring.
import { h, toast, Sheet, popupMenu, promptDialog, dialog, confirmDialog, debounce } from '../../ui/widgets.js';
import { icon } from '../../ui/icons.js';
import { Native } from '../../native.js';
import {
  INSTR, COLS, emptyRung, newElement, placeContact, placeParallel, placeOutput, toggleLink, addRow, deleteRow, trimRows, insertCell, deleteCell,
  compileProgram, programIL, elementText, mnemonic, isOutputType, is32, isFloatInstr,
} from '../sim/ladder.js';
import { parseOperand, addrSortKey, SPECIAL, fmtAddr } from '../sim/address.js';
import { openKeypad, openInstrPicker } from './keypad.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const SYM = {
  NO: '<path d="M1 10h10M21 10h10M11 3v14M21 3v14"/>',
  NC: '<path d="M1 10h10M21 10h10M11 3v14M21 3v14M8 17L24 3"/>',
  P: '<path d="M1 10h10M21 10h10M11 3v14M21 3v14M16 15V5M13 8l3-3 3 3"/>',
  F: '<path d="M1 10h10M21 10h10M11 3v14M21 3v14M16 5v10M13 12l3 3 3-3"/>',
  ORNO: '<path d="M1 6h10M21 6h10M11 1v10M21 1v10M4 6v12h5M27 6v12h-5M9 14v8M22 14v8"/>',
  ORNC: '<path d="M1 6h10M21 6h10M11 1v10M21 1v10M8 11L24 1M4 6v12h5M27 6v12h-5M9 14v8M22 14v8"/>',
  OUT: '<path d="M1 10h7M24 10h7M12 3a9 9 0 0 0 0 14M20 3a9 9 0 0 1 0 14"/>',
  SET: '<path d="M1 10h5M26 10h5M10 3a9 9 0 0 0 0 14M22 3a9 9 0 0 1 0 14"/><text x="16" y="14" font-size="10" text-anchor="middle" fill="currentColor" stroke="none" font-weight="800">S</text>',
  RST: '<path d="M1 10h5M26 10h5M10 3a9 9 0 0 0 0 14M22 3a9 9 0 0 1 0 14"/><text x="16" y="14" font-size="10" text-anchor="middle" fill="currentColor" stroke="none" font-weight="800">R</text>',
  H: '<path d="M2 10h28"/>',
  V: '<path d="M16 1v18M8 1h16M8 19h16" opacity=".5"/><path d="M16 1v18"/>',
};
const sym = (k, w = 32) => `<svg class="lsym" width="${w}" height="20" viewBox="0 0 32 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${SYM[k]}</svg>`;

export class LadderView {
  constructor(lab) {
    this.lab = lab;
    this.cur = { rung: 0, row: 0, col: 0 };
    this.monitor = true;
    this.hist = [];
    this.fut = [];
    this.el = h('section', { class: 'ladder-view' });
    this.build();
    this.compileSoon = debounce(() => this.compile(), 250);
    this.snap = JSON.stringify(this.prog);
    this.compile();
  }

  get prog() { return this.lab.project.program; }

  // ------------------------------------------------------------------ DOM
  build() {
    const B = (cls, html, title, fn) => h('button', { class: 'lb ' + cls, title, 'aria-label': title, html, onclick: fn });
    this.dlBtn = B('lb-dl', `${icon('download2', 18)}<span>Download</span>`, 'Download to PLC', () => this.download());
    this.runBtn = B('lb-run', `${icon('play', 16)}<span>RUN</span>`, 'PLC RUN', () => this.plcRun(true));
    this.stopBtn = B('lb-stop', `${icon('stop', 15)}<span>STOP</span>`, 'PLC STOP', () => this.plcRun(false));
    this.monBtn = B('lb-mon', `${icon('activity', 17)}<span>Monitor</span>`, 'Ladder monitor', () => { this.monitor = !this.monitor; this.monBtn.classList.toggle('on', this.monitor); this.render(); });
    this.monBtn.classList.add('on');
    const sep = () => h('span', { class: 'lb-sep' });
    this.bar = h('div', { class: 'lad-bar' },
      this.dlBtn, this.runBtn, this.stopBtn, this.monBtn, sep(),
      B('lb-sym', sym('NO'), 'Normally open contact (LD / AND)', () => this.insertContact('NO')),
      B('lb-sym', sym('NC'), 'Normally closed contact (LDI / ANI)', () => this.insertContact('NC')),
      B('lb-sym', sym('ORNO'), 'Parallel NO contact (OR)', () => this.insertParallel('NO')),
      B('lb-sym', sym('ORNC'), 'Parallel NC contact (ORI)', () => this.insertParallel('NC')),
      B('lb-sym', sym('P'), 'Rising edge contact (LDP)', () => this.insertContact('P')),
      B('lb-sym', sym('F'), 'Falling edge contact (LDF)', () => this.insertContact('F')),
      B('lb-sym', sym('OUT'), 'Output coil (OUT)', () => this.insertOutput('OUT')),
      B('lb-sym', sym('SET'), 'Set coil (SET)', () => this.insertOutput('SET')),
      B('lb-sym', sym('RST'), 'Reset coil (RST)', () => this.insertOutput('RST')),
      B('lb-txt', '<b>TMR</b>', 'Timer', () => this.insertOutput('TMR')),
      B('lb-txt', '<b>CNT</b>', 'Counter', () => this.insertOutput('CNT')),
      B('lb-txt', '<b>LD=</b>', 'Compare contact (LD=, LD>, LD< …)', () => this.insertAny('CC')),
      B('lb-txt', '<b>MOV</b>', 'Move (MOV)', () => this.insertOutput('MOV')),
      B('lb-txt', '<b>ADD</b>', 'Addition (ADD)', () => this.insertOutput('ADD')),
      B('lb-txt lb-hot', '<b>MATH</b>', 'Math: ADD SUB MUL DIV INC DEC, 32-bit D…, floating point DEADD DEMUL DSIN …', () => openInstrPicker({ filter: 'Math', onPick: (t) => this.insertAny(t) })),
      B('lb-txt lb-hot', '<b>LOGIC</b>', 'Logic: WAND WOR WXOR, BLD BAND BOR, shift, rotate, matrix …', () => openInstrPicker({ filter: 'Logic', onPick: (t) => this.insertAny(t) })),
      B('lb-txt', '<b>ƒ API</b>', 'All instructions (compare, math, float, shift, clock, pulse, MC, CJ, CALL, STL …)', () => openInstrPicker({ onPick: (t) => this.insertAny(t) })),
      B('lb-sym', sym('H'), 'Horizontal line', () => this.insertH()),
      B('lb-sym', sym('V'), 'Vertical line (link to the row below)', () => this.toggleV()),
      B('lb-del', icon('eraser', 18), 'Delete', () => this.deleteAt()), sep(),
      B('lb-ic', icon('undo', 18), 'Undo', () => this.undo()),
      B('lb-ic', icon('redo', 18), 'Redo', () => this.redo()),
      B('lb-ic', icon('dots', 18), 'More', (e) => this.more(e.currentTarget)));
    // a plain vertical scroller: the diagram is as wide as the screen and only grows downward
    this.host = h('div', { class: 'lad-host' });
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('class', 'lad-svg');
    this.g = document.createElementNS(SVGNS, 'g');
    this.svg.appendChild(this.g);
    this.host.appendChild(this.svg);
    this.banner = h('div', { class: 'lad-banner hidden' });
    this.out = h('div', { class: 'lad-out hidden' });
    this.foot = h('div', { class: 'lad-foot' });
    this.el.append(this.bar, this.banner, this.host, this.out, this.foot);
    this.svg.addEventListener('pointerdown', (e) => this.onDown(e));
    this.svg.addEventListener('pointermove', (e) => this.onMove(e));
    this.svg.addEventListener('pointerup', (e) => this.onUp(e));
    this.svg.addEventListener('pointercancel', (e) => this.onUp(e, true));
    this.svg.addEventListener('contextmenu', (e) => e.preventDefault());
    // scrolling: draw the networks coming into view, and a scroll is never a tap or a long press
    this.host.addEventListener('scroll', () => {
      if (this.down) { this.down.moved = true; clearTimeout(this.lpT); }
      if (!this.scrollRaf) this.scrollRaf = requestAnimationFrame(() => { this.scrollRaf = 0; this.render(); });
    }, { passive: true });
    this.ro = new ResizeObserver(() => { this.G = null; if (this.visible) this.render(); });
    this.ro.observe(this.host);
    // texts are measured for wrapping: measure again once the web fonts are in
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { this.mfont = null; if (this.visible) this.render(); });
    this.onKey = (e) => this.keydown(e);
  }

  destroy() { this.ro.disconnect(); window.removeEventListener('keydown', this.onKey); }

  onShow() {
    window.addEventListener('keydown', this.onKey);
    this.G = null;
    requestAnimationFrame(() => { this.render(); this.updateBanner(); });
  }
  onHide() { window.removeEventListener('keydown', this.onKey); }

  onBack() {
    if (!this.out.classList.contains('hidden')) { this.out.classList.add('hidden'); return true; }
    return false;
  }

  onSimStart() { this.render(); this.updateBanner(); }
  onSimStop() { this.render(); this.updateBanner(); }
  onHardwareChanged() { this.compileSoon(); }

  // ------------------------------------------------------------------ program edits
  commit(label) {
    const s = JSON.stringify(this.prog);
    if (s !== this.snap) {
      this.hist.push(this.snap);
      if (this.hist.length > 100) this.hist.shift();
      this.fut = [];
      this.snap = s;
    }
    this.lab.save();
    this.lab.laptopDirty = true;
    this.compileSoon();
    this.render();
    this.updateBanner();
    void label;
  }

  restore(s) {
    const p = JSON.parse(s);
    this.lab.project.program.rungs = p.rungs;
    this.lab.project.program.comments = p.comments;
    this.snap = s;
    this.clampCursor();
    this.lab.save();
    this.compileSoon();
    this.render();
    this.updateBanner();
  }

  undo() { if (!this.hist.length) { toast('Nothing to undo'); return; } this.fut.push(this.snap); this.restore(this.hist.pop()); }
  redo() { if (!this.fut.length) { toast('Nothing to redo'); return; } this.hist.push(this.snap); this.restore(this.fut.pop()); }

  rung() { return this.prog.rungs[this.cur.rung]; }

  clampCursor() {
    const c = this.cur;
    c.rung = Math.max(0, Math.min(this.prog.rungs.length - 1, c.rung));
    const r = this.rung();
    c.row = Math.max(0, Math.min(r.cells.length - 1, c.row));
    if (c.col !== 'out') c.col = Math.max(0, Math.min(this.prog.cols - 1, c.col));
  }

  recent() {
    const out = [];
    for (const r of this.prog.rungs) for (const row of [...r.cells, r.outs]) for (const el of row) if (el && el.a) for (const a of el.a) if (a && /^[XYMSTCD]/.test(a)) out.push(a);
    out.push(...Object.keys(this.prog.comments));
    return [...new Set(out)].sort((a, b) => addrSortKey(a) - addrSortKey(b));
  }

  edit(el, done, cancel) {
    if (!INSTR[el.t].ops.length) { done(el); return; }
    let ok = false;
    const sheet = openKeypad({ el, program: this.prog, recent: this.recent(), title: INSTR[el.t].name, onDone: (v) => { ok = true; done(v); } });
    const orig = sheet.onClose;
    sheet.onClose = () => { if (orig) orig(); if (!ok && cancel) cancel(); };
  }

  insertContact(t) {
    const c = this.cur;
    const r = this.rung();
    const col = c.col === 'out' ? this.prog.cols - 1 : c.col;
    const prev = r.cells[c.row][col];
    const base = prev && INSTR[prev.t] && INSTR[prev.t].ops[0] === 'bit' && INSTR[t].ops[0] === 'bit' ? newElement(t, prev.a) : newElement(t);
    this.edit(base, (el) => {
      placeContact(r, c.row, col, el);
      c.col = Math.min(this.prog.cols - 1, col + 1);
      this.commit('Contact');
      this.ensureVisible();
    });
  }

  insertParallel(t) {
    const c = this.cur;
    const r = this.rung();
    let col = c.col === 'out' ? this.prog.cols - 1 : c.col;
    // like ISPSoft: right after typing a contact the cursor sits on the next (empty) cell —
    // the parallel branch then wraps the contact just entered.
    if (!r.cells[c.row][col] && col > 0 && r.cells[c.row][col - 1] && r.cells[c.row][col - 1].t !== 'H') col--;
    const row0 = c.row;
    this.edit(newElement(t), (el) => {
      placeParallel(r, row0, col, el);
      c.row = row0; c.col = Math.min(this.prog.cols - 1, col + 1);
      this.commit('Parallel');
      this.ensureVisible();
    });
  }

  insertOutput(t) {
    const c = this.cur;
    const r = this.rung();
    const prev = r.outs[c.row];
    const base = prev && prev.t === t ? { ...prev, a: prev.a.slice() } : newElement(t);
    this.edit(base, (el) => {
      placeOutput(r, c.row, el);
      c.col = 'out';
      this.commit('Output');
      this.ensureVisible();
    });
  }

  /** Any instruction from the picker: contacts go into the grid, the rest into the output column. */
  insertAny(t) {
    const d = INSTR[t];
    if (t === 'STL') {
      // a step starts on the left bus bar: always the first cell of the network
      const r = this.rung();
      this.edit(newElement('STL'), (el) => {
        const first = r.cells[0][0];
        if (first && first.t !== 'H' && first.t !== 'STL' && !insertCell(r, 0, 0)) { toast('The first row is full — delete a cell first', 'warn'); return; }
        r.cells[0][0] = el;
        this.cur = { rung: this.cur.rung, row: 0, col: 1 };
        this.commit('STL');
        this.ensureVisible();
      });
      return;
    }
    if (d.kind === 'contact') this.insertContact(t); else this.insertOutput(t);
  }

  insertH() {
    const c = this.cur;
    if (c.col === 'out') return;
    placeContact(this.rung(), c.row, c.col, { t: 'H', a: [] });
    c.col = Math.min(this.prog.cols - 1, c.col + 1);
    this.commit('Line');
  }

  toggleV() {
    const c = this.cur;
    const col = c.col === 'out' ? this.prog.cols - 1 : c.col;
    toggleLink(this.rung(), c.row, col);
    this.commit('Link');
  }

  deleteAt() {
    const c = this.cur;
    const r = this.rung();
    if (c.col === 'out') { if (r.outs[c.row]) r.outs[c.row] = null; else { toast('Nothing to delete here'); return; } }
    else if (r.cells[c.row][c.col]) r.cells[c.row][c.col] = null;
    else if (r.vl[c.row] && r.vl[c.row][c.col]) r.vl[c.row][c.col] = false;
    else if (c.row > 0 && r.vl[c.row - 1] && r.vl[c.row - 1][c.col]) r.vl[c.row - 1][c.col] = false;
    else { toast('Nothing to delete here'); return; }
    trimRows(r);
    this.clampCursor();
    this.commit('Delete');
    Native.vibrate(8);
  }

  addNetwork(after = this.cur.rung) {
    this.prog.rungs.splice(after + 1, 0, emptyRung(this.prog.cols));
    this.cur = { rung: after + 1, row: 0, col: 0 };
    this.commit('Network');
    this.ensureVisible();
  }

  deleteNetwork() {
    if (this.prog.rungs.length <= 1) { this.prog.rungs[0] = emptyRung(this.prog.cols); }
    else this.prog.rungs.splice(this.cur.rung, 1);
    this.clampCursor();
    this.commit('Delete network');
  }

  moveNetwork(d) {
    const i = this.cur.rung, j = i + d;
    if (j < 0 || j >= this.prog.rungs.length) return;
    const R = this.prog.rungs;
    [R[i], R[j]] = [R[j], R[i]];
    this.cur.rung = j;
    this.commit('Move');
    this.ensureVisible();
  }

  async editComment(ri = this.cur.rung) {
    const r = this.prog.rungs[ri];
    const v = await promptDialog(`Network ${ri + 1} comment`, r.comment || '', 'What does this network do?');
    if (v === null || v === undefined) return;
    r.comment = v;
    this.commit('Comment');
  }

  /** ISPSoft pointer P0…P255 on the left of a network: the target of CJ and CALL. */
  async editLabel(ri = this.cur.rung) {
    const r = this.prog.rungs[ri];
    const v = await promptDialog(`Network ${ri + 1}: pointer label`, r.label || 'P0', 'P0 … P255 — empty removes it');
    if (v === null || v === undefined) return;
    const t = v.trim().toUpperCase();
    if (!t) { delete r.label; this.commit('Label'); return; }
    const op = parseOperand(/^\d+$/.test(t) ? 'P' + t : t);
    if (!op || op.dev !== 'P') { toast('A pointer is P0 … P255', 'warn'); return; }
    const other = this.prog.rungs.findIndex((x, i) => i !== ri && x.label === op.text);
    if (other >= 0) { toast(`${op.text} is already on network ${other + 1}`, 'warn'); return; }
    r.label = op.text;
    this.commit('Label');
  }

  more(anchor) {
    popupMenu(anchor, [
      { icon: 'plus', label: 'Insert network below', action: () => this.addNetwork() },
      { icon: 'plus', label: 'Insert row below', action: () => { addRow(this.rung(), this.cur.row + 1); this.cur.row++; this.commit('Row'); } },
      { icon: 'trash', label: 'Delete row', action: () => { deleteRow(this.rung(), this.cur.row); this.clampCursor(); this.commit('Delete row'); } },
      { icon: 'copy', label: 'Duplicate network', action: () => { const c = JSON.parse(JSON.stringify(this.rung())); c.id = c.id + 'c'; delete c.label; this.prog.rungs.splice(this.cur.rung + 1, 0, c); this.cur.rung++; this.commit('Duplicate'); } },
      { icon: 'arrowUp', label: 'Move network up', action: () => this.moveNetwork(-1) },
      { icon: 'arrowDown', label: 'Move network down', action: () => this.moveNetwork(1) },
      { icon: 'edit', label: 'Network comment', action: () => this.editComment() },
      { icon: 'target', label: this.rung().label ? `Pointer label: ${this.rung().label}` : 'Pointer label (P) for CJ / CALL', action: () => this.editLabel() },
      { icon: 'trash', label: 'Delete network', danger: true, action: async () => { if (await confirmDialog('Delete network?', `Network ${this.cur.rung + 1} will be removed.`, 'Delete', true)) this.deleteNetwork(); } },
      '-',
      { icon: 'upload', label: 'Upload from PLC', action: () => this.upload() },
      { icon: 'eraser', label: 'PLC memory clear', action: () => this.memoryClear() },
      '-',
      { icon: 'list', label: 'Instruction list (IL)', action: () => this.showIL() },
      { icon: 'check', label: 'Compile / check', action: () => { this.compile(); this.showOutput(true); } },
      { icon: 'book', label: 'Device comments', action: () => this.showComments() },
      { icon: 'help', label: 'Ladder help', action: () => this.help() },
    ]);
  }

  // ------------------------------------------------------------------ compile & download
  compile() {
    const model = this.lab.plcModel() || { name: 'PLC', inputs: 256, outputs: 256 };
    this.compiled = compileProgram(this.prog, model);
    this.errAt = new Map();
    for (const e of this.compiled.errors) this.errAt.set(`${e.rung}:${e.row}:${e.col}`, e.msg);
    this.renderFoot();
    if (!this.out.classList.contains('hidden')) this.showOutput(true);
    this.render();
    return this.compiled;
  }

  inSync() {
    const d = this.lab.project.plc && this.lab.project.plc.downloaded;
    return !!d && JSON.stringify({ r: d.rungs }) === JSON.stringify({ r: this.prog.rungs });
  }

  renderFoot() {
    const c = this.compiled;
    const cur = this.cur;
    const pos = `N${cur.rung + 1} · R${cur.row + 1} · ${cur.col === 'out' ? 'OUT' : 'C' + (cur.col + 1)}`;
    const st = c.errors.length ? `<span class="lf-err">${icon('warning', 14)} ${c.errors.length} error${c.errors.length > 1 ? 's' : ''}</span>` : `<span class="lf-ok">${icon('check', 14)} 0 errors</span>`;
    const wn = c.warnings.length ? `<span class="lf-warn">${c.warnings.length} warning${c.warnings.length > 1 ? 's' : ''}</span>` : '';
    this.foot.innerHTML = `<span class="lf-pos">${pos}</span>${st}${wn}<span class="lf-steps">${c.steps} steps</span>`;
    this.foot.onclick = () => this.showOutput(this.out.classList.contains('hidden'));
  }

  showOutput(on) {
    this.out.classList.toggle('hidden', !on);
    if (!on) return;
    const c = this.compiled;
    this.out.innerHTML = '';
    this.out.appendChild(h('div', { class: 'lo-head' }, h('b', {}, 'Output'), h('span', { class: 'muted small' }, `${c.steps} steps · ${c.errors.length} errors · ${c.warnings.length} warnings`), h('button', { class: 'icon-btn sm', html: icon('close', 16), onclick: () => this.out.classList.add('hidden') })));
    const list = h('div', { class: 'lo-list' });
    if (!c.errors.length && !c.warnings.length) list.appendChild(h('div', { class: 'lo-row ok' }, `${icon('check', 14)} Compiled successfully.`));
    for (const e of [...c.errors.map((x) => ({ ...x, lvl: 'err' })), ...c.warnings.map((x) => ({ ...x, lvl: 'warn' }))]) {
      list.appendChild(h('button', { class: 'lo-row ' + e.lvl, onclick: () => { this.cur = { rung: e.rung, row: typeof e.row === 'number' ? e.row : 0, col: e.col === 'out' ? 'out' : typeof e.col === 'number' ? e.col : 0 }; this.clampCursor(); this.render(); this.ensureVisible(); } },
        h('span', { html: icon('warning', 14) }), h('span', {}, `N${e.rung + 1}: ${e.msg}`)));
    }
    this.out.appendChild(list);
  }

  async download() {
    const c = this.compile();
    if (!c.ok) { this.showOutput(true); toast(`Fix ${c.errors.length} error(s) before downloading`, 'error'); Native.vibrate(40); return; }
    if (!this.lab.plcDevice()) { toast('Add a Delta PLC in the Lab tab first', 'warn'); return; }
    const plc = await this.lab.ensureOnline();
    if (!plc) return;
    if (plc.cpu.running) {
      if (!(await confirmDialog('PLC is in RUN', 'Stop the PLC and download the program?', 'Stop & download'))) return;
    }
    await this.progress('Writing program to PLC…', 900);
    if (!this.lab.sys || !this.lab.sys.pcLink().ok) { toast('Download cancelled — the connection to the PLC was lost', 'error'); return; }
    const res = this.lab.sys.download(this.prog);
    this.lab.save();
    if (!res || !res.ok) { toast('Download failed', 'error'); return; }
    toast(`Downloaded ${res.steps} steps to ${this.lab.plcModel().short}`, 'ok');
    const run = await dialog({ title: 'Download complete', body: `<p>${res.steps} steps written to the ${this.lab.plcModel().short}.</p><p>Set the PLC to RUN?</p>`, actions: [{ label: 'Stay in STOP', value: false, cls: 'btn-ghost' }, { label: 'RUN', value: true, cls: 'btn-primary' }] });
    if (run) this.plcRun(true);
    this.render();
    this.updateBanner();
  }

  /** ISPSoft "Upload": read the program stored in the PLC back into the editor. */
  async upload() {
    const plc = await this.lab.ensureOnline();
    if (!plc) return;
    const d = this.lab.project.plc && this.lab.project.plc.downloaded;
    if (!d) { toast('The PLC has no program', 'warn'); return; }
    if (!this.inSync() && !(await confirmDialog('Upload from PLC?', 'Your unsaved edits in the editor will be replaced by the program in the PLC.', 'Upload'))) return;
    await this.progress('Reading program from PLC…', 700);
    this.prog.rungs = JSON.parse(JSON.stringify(d.rungs));
    this.prog.comments = { ...this.prog.comments, ...(d.comments || {}) };
    this.cur = { rung: 0, row: 0, col: 0 };
    this.commit('Upload');
    toast('Program uploaded from the PLC', 'ok');
  }

  /** ISPSoft "PLC memory clear": reset devices (latched areas too). */
  async memoryClear() {
    const plc = await this.lab.ensureOnline();
    if (!plc) return;
    if (!(await confirmDialog('PLC memory clear', 'All M, S, T, C and D devices — including the latched (retentive) areas — are reset to 0. The program stays.', 'Clear', true))) return;
    const cpu = plc.cpu;
    cpu.M.fill(0); cpu.S.fill(0); cpu.T.fill(0); cpu.TV.fill(0); cpu.tacc.fill(0); cpu.C.fill(0); cpu.CV.fill(0); cpu.D.fill(0);
    cpu.setDefaults();
    this.lab.project.plc.latched = null;
    this.lab.save();
    toast('PLC memory cleared', 'ok');
  }

  progress(text, ms) {
    return new Promise((resolve) => {
      const bar = h('i');
      const pct = h('b', {}, '0%');
      const box = h('div', { class: 'dl-progress' }, h('div', { class: 'dl-text' }, h('span', { html: icon('usb', 18) }), h('span', {}, text), pct), h('div', { class: 'dl-bar' }, bar));
      const ov = h('div', { class: 'overlay dialog-overlay show' }, box);
      document.body.appendChild(ov);
      const t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / ms);
        bar.style.width = (k * 100).toFixed(0) + '%';
        pct.textContent = Math.round(k * 100) + '%';
        if (k < 1) requestAnimationFrame(step); else setTimeout(() => { ov.remove(); resolve(); }, 120);
      };
      requestAnimationFrame(step);
    });
  }

  async plcRun(on) {
    const plc = await this.lab.ensureOnline();
    if (!plc || !this.lab.sys) return;
    if (on && !plc.cpu.prog) { toast('The PLC has no program — Download first', 'warn'); return; }
    plc.cpu.setRun(on);
    toast(on ? 'PLC → RUN' : 'PLC → STOP', on ? 'ok' : 'info');
    Native.vibrate(12);
    this.updateBanner();
  }

  updateBanner() {
    const sys = this.lab.sys;
    const b = this.banner;
    let html = '', cls = '';
    if (!this.lab.project.plc || !this.lab.project.plc.downloaded) { html = `${icon('info', 16)}<span>Not downloaded yet — press <b>Download</b> to write this program to the PLC.</span>`; cls = 'info'; }
    else if (!this.inSync()) { html = `${icon('warning', 16)}<span>Edited — the PLC still runs the old program. <b>Download</b> to update it.</span>`; cls = 'warn'; }
    else if (sys && sys.pcLink().ok && sys.plc) { const m = sys.plc.cpu.mode; html = `<span class="dot ${m === 'RUN' ? 'live' : ''}"></span><span>Online · PLC <b>${m}</b>${m === 'RUN' && this.monitor ? ' · live power flow' : ''}</span>`; cls = m === 'RUN' ? 'ok' : 'info'; }
    if (html !== this.lastBanner) { this.lastBanner = html; b.innerHTML = html; b.className = 'lad-banner ' + cls + (html ? '' : ' hidden'); }
    const online = !!(sys && sys.pcLink().ok);
    this.runBtn.classList.toggle('dim', !online);
    this.stopBtn.classList.toggle('dim', !online);
    const run = online && sys.plc && sys.plc.cpu.running;
    this.runBtn.classList.toggle('active', !!run);
    this.stopBtn.classList.toggle('active', online && sys.plc && !sys.plc.cpu.running);
  }

  frame(dt) {
    this.acc = (this.acc || 0) + dt;
    if (this.acc < 0.12) return;
    this.acc = 0;
    this.updateBanner();
    if (this.monitorActive()) this.render();
  }

  monitorActive() {
    const sys = this.lab.sys;
    return !!(this.monitor && sys && sys.plc && sys.plc.cpu.powered && sys.pcLink().ok && this.inSync());
  }

  // ------------------------------------------------------------------ fixed layout
  // The diagram always fills the width of the screen (no sideways panning or zooming): the eight
  // contact columns and the output column share the width, and the program grows downward —
  // long comments wrap, big instruction boxes make their row taller — and scrolls up and down.

  /** Column widths, fonts and row heights for the current width. */
  geom() {
    const W = Math.max(280, Math.round(this.host.clientWidth || 360));
    if (this.G && this.G.W === W) return this.G;
    const cols = this.prog.cols;
    const narrow = W < 600;
    const pad = 6;
    const x0 = pad + (narrow ? 10 : 16);
    const xR = W - pad - (narrow ? 6 : 12);
    const outW = Math.round(Math.max(narrow ? 92 : 150, Math.min(250, W * (narrow ? 0.27 : 0.24))));
    const xo = xR - outW;
    const cw = (xo - x0) / cols;
    const fs = Math.round(Math.max(9, Math.min(13, cw * 0.3)) * 10) / 10;
    const rh = narrow ? 60 : 66;
    const cy = narrow ? 27 : 30;
    const fo = narrow ? 10 : 11.5; // operands in boxes
    this.G = { W, narrow, pad, x0, xR, xo, outW, cw, fs, rh, cy, fo, cols, bw: outW - 26, fc: narrow ? 8 : Math.min(10, Math.max(8.5, fs * 0.78)) };
    return this.G;
  }

  /** Width of a text in px, measured with the font the diagram uses. */
  textW(str, size, mono = false, italic = false) {
    const c = this.mctx || (this.mctx = document.createElement('canvas').getContext('2d'));
    const key = `${italic ? 'italic ' : ''}${mono ? 700 : 600} ${size}px ${mono ? "'JetBrains Mono', monospace" : "Inter, system-ui, sans-serif"}`;
    if (this.mfont !== key) { c.font = key; this.mfont = key; }
    return c.measureText(str).width;
  }

  /** The text, cut with … so it is at most w px wide. */
  fitText(str, size, w, mono = false) {
    if (this.textW(str, size, mono) <= w) return str;
    let n = str.length - 1;
    while (n > 1 && this.textW(str.slice(0, n) + '…', size, mono) > w) n--;
    return str.slice(0, n) + '…';
  }

  /** Word-wrap a text into lines at most w px wide (maxLines: the last line is cut with …). */
  wrapText(str, size, w, { mono = false, italic = false, maxLines = 99, breakWords = true } = {}) {
    const out = [];
    for (const word of String(str).split(/\s+/).filter(Boolean)) {
      const last = out.length ? out[out.length - 1] : null;
      if (last !== null && this.textW(last + ' ' + word, size, mono, italic) <= w) { out[out.length - 1] = last + ' ' + word; continue; }
      if (this.textW(word, size, mono, italic) <= w) { out.push(word); continue; }
      if (!breakWords) { out.push(this.fitText(word, size, w, mono)); continue; }
      let rest = word; // a word longer than the line: split it
      while (rest) {
        let n = rest.length;
        while (n > 1 && this.textW(rest.slice(0, n), size, mono, italic) > w) n--;
        out.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
    }
    if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = this.fitText(out[maxLines - 1] + '…', size, w, mono); }
    return out;
  }

  /** Operand lines of a box instruction, wrapped to the box width. */
  boxLines(el) {
    const G = this.geom();
    return el.a.length ? this.wrapText(el.a.join(' '), G.fo, G.bw - 14, { mono: true }) : [];
  }

  boxHeight(el) {
    const G = this.geom();
    return 8 + (G.fo + 5) + this.boxLines(el).length * (G.fo + 4) + (hasValue(el) ? G.fo + 3 : 0) + 4;
  }

  /** Network header: number, pointer label and the comment wrapped over as many lines as needed. */
  headLines(rung, ri) {
    const G = this.geom();
    const txt = rung.comment ? '// ' + rung.comment : ri === this.cur.rung ? '// tap here to add a comment' : '';
    if (!txt) return [];
    const x = G.pad + 40 + (rung.label ? 34 : 0);
    return this.wrapText(txt, 12, G.W - x - G.pad - 10, { italic: true });
  }

  layoutRungs() {
    const G = this.geom();
    let y = 8;
    this.layout = this.prog.rungs.map((r, ri) => {
      const lines = this.headLines(r, ri);
      const headH = Math.max(28, 10 + lines.length * 16);
      const rowTop = [], rowH = [];
      let yy = y + headH;
      for (let rr = 0; rr < r.cells.length; rr++) {
        const o = r.outs[rr];
        const need = o && INSTR[o.t] && INSTR[o.t].kind === 'box' ? this.boxHeight(o) + 10 : 0;
        const hgt = Math.max(G.rh, need);
        rowTop.push(yy); rowH.push(hgt);
        yy += hgt;
      }
      const L = { y, headH, lines, rowTop, rowH, h: yy - y + 8 };
      y += L.h + 10;
      return L;
    });
    this.endY = y;
    this.layoutH = y + 64;
  }

  /** Scroll so the cursor cell is on screen. */
  ensureVisible() {
    this.layoutRungs();
    const L = this.layout[this.cur.rung];
    if (!L) return;
    const row = Math.min(this.cur.row, L.rowTop.length - 1);
    const top = (this.cur.row === 0 ? L.y : L.rowTop[row]) - 8, bot = L.rowTop[row] + L.rowH[row] + 10;
    const h = this.host.clientHeight;
    if (top < this.host.scrollTop) this.host.scrollTop = top;
    else if (bot > this.host.scrollTop + h) this.host.scrollTop = bot - h;
    this.render();
  }

  hit(x, y) {
    const G = this.geom();
    for (let i = 0; i < this.layout.length; i++) {
      const L = this.layout[i];
      if (y < L.y || y >= L.y + L.h + 10) continue;
      const r = this.prog.rungs[i];
      if (y < L.y + L.headH) return { rung: i, header: true };
      let row = r.cells.length - 1;
      for (let k = 0; k < L.rowTop.length; k++) if (y < L.rowTop[k] + L.rowH[k]) { row = k; break; }
      const col = x >= G.xo ? 'out' : Math.max(0, Math.min(G.cols - 1, Math.floor((x - G.x0) / G.cw)));
      return { rung: i, row, col };
    }
    if (y >= this.endY && y < this.endY + 48) return { add: true };
    return null;
  }

  // ------------------------------------------------------------------ rendering
  render() {
    if (!this.visible) return;
    const G = this.geom();
    this.layoutRungs();
    const H = Math.max(this.layoutH, this.host.clientHeight);
    if (this.svgW !== G.W || this.svgH !== H) {
      this.svgW = G.W; this.svgH = H;
      this.svg.setAttribute('width', G.W); this.svg.setAttribute('height', H);
      this.svg.setAttribute('viewBox', `0 0 ${G.W} ${H}`);
      this.svg.style.height = H + 'px';
    }
    const vy0 = this.host.scrollTop - 300, vy1 = this.host.scrollTop + this.host.clientHeight + 300;
    const sys = this.lab.sys;
    const mon = this.monitorActive();
    const cpu = mon ? sys.plc.cpu : null;
    const comments = this.prog.comments;
    const { cols, x0, xR, xo, cw, pad, W } = G;
    let s = '';
    this.prog.rungs.forEach((rung, ri) => {
      const L = this.layout[ri];
      if (L.y + L.h < vy0 || L.y > vy1) return;
      const selR = ri === this.cur.rung;
      const live = cpu && cpu.running ? cpu.rungLive(ri) : null;
      const rows = rung.cells.length;
      const yc = (rr) => L.rowTop[rr] + G.cy;
      // card + header
      s += `<rect x="${pad}" y="${L.y}" width="${W - pad * 2}" height="${L.h}" rx="10" class="lr-bg${selR ? ' sel' : ''}"/>`;
      s += `<rect x="${pad + 6}" y="${L.y + 6}" width="28" height="18" rx="6" class="lr-numbg${selR ? ' sel' : ''}"/><text x="${pad + 20}" y="${L.y + 19}" text-anchor="middle" class="lr-num">${ri + 1}</text>`;
      let tx = pad + 40;
      if (rung.label) { s += `<rect x="${tx}" y="${L.y + 6}" width="30" height="18" rx="6" class="lr-ptr"/><text x="${tx + 15}" y="${L.y + 19}" text-anchor="middle" class="lr-ptrt">${esc(rung.label)}</text>`; tx += 34; }
      L.lines.forEach((ln, k) => { s += `<text x="${tx}" y="${L.y + 19 + k * 16}" class="lr-cmt${rung.comment ? '' : ' ph'}">${esc(ln)}</text>`; });
      // bus bars
      const top = L.rowTop[0] + 4, bot = L.rowTop[rows - 1] + L.rowH[rows - 1] - 6;
      const stlHead = rung.cells[0][0] && rung.cells[0][0].t === 'STL';
      s += `<line x1="${x0}" y1="${top}" x2="${x0}" y2="${bot}" class="lr-rail${live ? ' on' : ''}${stlHead ? ' stl' : ''}"/>`;
      s += `<line x1="${xR}" y1="${top}" x2="${xR}" y2="${bot}" class="lr-rail r"/>`;
      for (let rr = 0; rr < rows; rr++) {
        const y = yc(rr);
        for (let c = 0; c < cols; c++) {
          const el = rung.cells[rr][c];
          const x = x0 + c * cw;
          const st = live && live.cells[rr] ? live.cells[rr][c] : 0;
          if (el) s += this.drawCell(el, x, y, st, cpu, comments, this.errAt.has(`${ri}:${rr}:${c}`));
          else if (selR) s += `<circle cx="${(x + cw / 2).toFixed(1)}" cy="${y}" r="1.5" class="lr-dot"/>`;
        }
        const o = rung.outs[rr];
        if (o) s += this.drawOut(o, xo, y, L.rowTop[rr], live ? live.rows[rr] : 0, cpu, comments, this.errAt.has(`${ri}:${rr}:out`));
        else if (selR) s += `<circle cx="${xo + 34}" cy="${y}" r="1.5" class="lr-dot"/>`;
      }
      // vertical links
      for (let rr = 0; rr < rows - 1; rr++) for (let c = 0; c < cols; c++) {
        if (!rung.vl[rr] || !rung.vl[rr][c]) continue;
        const x = (x0 + (c + 1) * cw).toFixed(1);
        const on = live && ((live.cells[rr][c] & 2) || (live.cells[rr + 1][c] & 2) || (c === cols - 1 && (live.rows[rr] || live.rows[rr + 1])));
        s += `<line x1="${x}" y1="${yc(rr)}" x2="${x}" y2="${yc(rr + 1)}" class="lw${on ? ' on' : ''}"/>`;
      }
      // cursor
      if (selR) {
        const c = this.cur;
        const row = Math.min(c.row, rows - 1);
        const cx = c.col === 'out' ? xo + 2 : x0 + c.col * cw;
        const cwid = c.col === 'out' ? xR - xo - 6 : cw;
        s += `<rect x="${(cx + 1).toFixed(1)}" y="${L.rowTop[row] + 2}" width="${(cwid - 2).toFixed(1)}" height="${L.rowH[row] - 4}" rx="7" class="lr-cursor"/>`;
      }
    });
    const ey = this.endY;
    s += `<g class="lr-end"><rect x="${pad}" y="${ey}" width="${W - pad * 2}" height="40" rx="10"/><text x="${pad + 14}" y="${ey + 25}" class="lr-endt">END</text>`;
    s += `<rect x="${W - pad - 150}" y="${ey + 6}" width="142" height="28" rx="9" class="lr-addbg"/><text x="${W - pad - 79}" y="${ey + 25}" text-anchor="middle" class="lr-add">＋ Add network</text></g>`;
    this.g.innerHTML = s;
    this.renderFoot();
  }

  drawCell(el, x, y, st, cpu, comments, err) {
    const G = this.geom();
    const cw = G.cw;
    const inOn = st & 1, outOn = st & 2;
    const f = (v) => v.toFixed(1);
    const w = (x1, x2, on) => `<line x1="${f(x1)}" y1="${y}" x2="${f(x2)}" y2="${y}" class="lw${on ? ' on' : ''}"/>`;
    if (el.t === 'H') return w(x, x + cw, inOn);
    const m = x + cw / 2;
    const fit = (txt, size) => this.fitText(txt, size, cw - 2, true);
    const label = (txt, cls = 'lr-op') => `<text x="${f(m)}" y="${y - 15}" text-anchor="middle" class="${cls}" style="font-size:${G.fs}px">${esc(fit(txt, G.fs))}</text>`;
    // the device comment under the contact, on up to two lines
    const cm = (a) => (comments[a] ? this.wrapText(comments[a], G.fc, cw - 3, { maxLines: 2, breakWords: false }).map((ln, k) => `<text x="${f(m)}" y="${y + 21 + k * (G.fc + 1.5)}" text-anchor="middle" class="lr-cm" style="font-size:${G.fc}px">${esc(ln)}</text>`).join('') : '');
    let s = '';
    if (el.t === 'CC' || el.t === 'FCC') {
      const bx = x + 3, bw = cw - 6;
      s += w(x, bx, inOn) + w(bx + bw, x + cw, outOn);
      s += `<rect x="${f(bx)}" y="${y - 11}" width="${f(bw)}" height="22" rx="4" class="lr-box${outOn ? ' on' : ''}${err ? ' err' : ''}"/>`;
      s += `<text x="${f(m)}" y="${y + 4.5}" text-anchor="middle" class="lr-cc" style="font-size:${Math.min(14, G.fs + 1.5)}px">${esc(el.op)}</text>`;
      s += `<text x="${f(m)}" y="${y - 15}" text-anchor="middle" class="lr-op" style="font-size:${G.fs * 0.92}px">${esc(fit(el.a[0], G.fs * 0.92))}</text>`;
      s += `<text x="${f(m)}" y="${y + 24}" text-anchor="middle" class="lr-op" style="font-size:${G.fs * 0.92}px">${esc(fit(el.a[1], G.fs * 0.92))}</text>`;
      if (el.t === 'FCC' || el.d) s += `<text x="${f(x + 5)}" y="${y + 4}" class="lr-tag" style="font-size:${Math.max(7, G.fc - 0.5)}px">${el.t === 'FCC' ? 'F' : 'D'}</text>`;
      if (cpu) { const a = parseOperand(el.a[0]); if (a) s += `<text x="${f(x + cw - 2)}" y="${y - 27}" text-anchor="end" class="lr-val" style="font-size:${G.fc}px">${fmtVal(el.t === 'FCC' ? cpu.getFloat(a) : el.d ? cpu.getDWord(a) : cpu.getWord(a))}</text>`; }
      return s;
    }
    if (el.t === 'INV' || el.t === 'MEP' || el.t === 'MEF' || el.t === 'NP' || el.t === 'PN') {
      s += w(x, m - 6, inOn) + w(m + 6, x + cw, outOn);
      if (el.t === 'INV') s += `<line x1="${f(m - 7)}" y1="${y + 9}" x2="${f(m + 7)}" y2="${y - 9}" class="lr-sym${err ? ' err' : ''}"/>`;
      else { const up = el.t === 'MEP' || el.t === 'NP'; s += `<path d="M${f(m - 6)} ${y}H${f(m + 6)}M${f(m)} ${y + 9}V${y - 9}${up ? `M${f(m - 4)} ${y - 5}l4-4 4 4` : ''}" class="lr-sym thin"/>${!up ? `<path d="M${f(m - 4)} ${y + 5}l4 4 4-4" class="lr-sym thin"/>` : ''}`; }
      s += `<text x="${f(m)}" y="${y - 15}" text-anchor="middle" class="lr-mn" style="font-size:${G.fs * 0.9}px">${el.t}</text>`;
      return s;
    }
    if (el.t === 'STL') {
      const bx = x + 2, bw = cw - 4;
      const op = parseOperand(el.a[0]);
      const act = cpu && op ? cpu.S[op.idx] : 0;
      s += w(bx + bw, x + cw, outOn);
      s += `<rect x="${f(bx)}" y="${y - 12}" width="${f(bw)}" height="24" rx="5" class="lr-stl${act ? ' on' : ''}${err ? ' err' : ''}"/>`;
      s += `<text x="${f(m)}" y="${y + 4}" text-anchor="middle" class="lr-stlt" style="font-size:${Math.max(8, G.fs * 0.85)}px">STL</text>`;
      s += label(el.a[0] || '?', 'lr-op' + (err ? ' err' : '')) + cm(el.a[0]);
      return s;
    }
    const gap = Math.max(5, Math.min(9, cw * 0.17));
    const hh = G.narrow ? 10 : 12;
    s += w(x, m - gap, inOn) + w(m + gap, x + cw, outOn);
    const op = parseOperand(el.a[0]);
    let closed = false;
    const bitw = el.t === 'BLD' || el.t === 'BLDI';
    if (cpu && op && bitw) { const n = parseOperand(el.a[1]); const w = el.d ? cpu.getDWord(op) : cpu.getWord(op); const b = n ? (w >>> (n.val & 31)) & 1 : 0; closed = el.t === 'BLD' ? !!b : !b; }
    else if (cpu && op) { const b = cpu.getBit(op); closed = el.t === 'NC' ? !b : el.t === 'NO' ? !!b : !!outOn; }
    if (closed) s += `<rect x="${f(m - gap)}" y="${y - hh}" width="${f(gap * 2)}" height="${hh * 2}" rx="2" class="lr-fill"/>`;
    s += `<line x1="${f(m - gap)}" y1="${y - hh}" x2="${f(m - gap)}" y2="${y + hh}" class="lr-sym${err ? ' err' : ''}"/><line x1="${f(m + gap)}" y1="${y - hh}" x2="${f(m + gap)}" y2="${y + hh}" class="lr-sym${err ? ' err' : ''}"/>`;
    if (el.t === 'NC' || el.t === 'BLDI') s += `<line x1="${f(m - gap - 3)}" y1="${y + hh}" x2="${f(m + gap + 3)}" y2="${y - hh}" class="lr-sym"/>`;
    if (bitw) {
      s += `<text x="${f(m)}" y="${y + 4}" text-anchor="middle" class="lr-tag" style="font-size:${Math.max(7, G.fc - 0.5)}px">b</text>`;
      s += label(elementText(el), 'lr-op' + (err ? ' err' : ''));
      return s + cm(el.a[0]);
    }
    if (el.t === 'P') s += `<path d="M${f(m)} ${y + 6}V${y - 6}M${f(m - 3.5)} ${y - 2.5}l3.5-3.5 3.5 3.5" class="lr-sym thin"/>`;
    if (el.t === 'F') s += `<path d="M${f(m)} ${y - 6}V${y + 6}M${f(m - 3.5)} ${y + 2.5}l3.5 3.5 3.5-3.5" class="lr-sym thin"/>`;
    s += label(el.a[0] || '?', 'lr-op' + (err ? ' err' : ''));
    s += cm(el.a[0]);
    return s;
  }

  drawOut(el, x, y, rowTop, on, cpu, comments, err) {
    const G = this.geom();
    const d = INSTR[el.t];
    const f = (v) => v.toFixed(1);
    let s = `<line x1="${f(x)}" y1="${y}" x2="${f(x + 14)}" y2="${y}" class="lw${on ? ' on' : ''}"/>`;
    if (d.kind === 'out') {
      const cx = x + 36;
      s += `<line x1="${f(x + 14)}" y1="${y}" x2="${f(cx - 12)}" y2="${y}" class="lw${on ? ' on' : ''}"/>`;
      const op = parseOperand(el.a[0]);
      const bit = cpu && op ? cpu.getBit(op) : 0;
      if (bit) s += `<circle cx="${f(cx)}" cy="${y}" r="11" class="lr-fill"/>`;
      s += `<path d="M${f(cx - 4)} ${y - 12}a12 12 0 0 0 0 24M${f(cx + 4)} ${y - 12}a12 12 0 0 1 0 24" class="lr-sym${err ? ' err' : ''}"/>`;
      if (el.t !== 'OUT') s += `<text x="${f(cx)}" y="${y + 4}" text-anchor="middle" class="lr-coilt">${el.t === 'SET' ? 'S' : el.t === 'RST' ? 'R' : el.t === 'PLS' ? 'P' : 'F'}</text>`;
      s += `<text x="${f(cx)}" y="${y - 17}" text-anchor="middle" class="lr-op${err ? ' err' : ''}" style="font-size:${Math.max(10, G.fs)}px">${esc(el.a[0] || '?')}</text>`;
      if (el.t === 'PLS' || el.t === 'PLF') s += `<text x="${f(cx + 18)}" y="${y + 4}" class="lr-mn">${el.t}</text>`;
      if (comments[el.a[0]]) s += `<text x="${f(cx)}" y="${y + 25}" text-anchor="middle" class="lr-cm" style="font-size:${G.fc + 0.5}px">${esc(this.fitText(comments[el.a[0]], G.fc + 0.5, (Math.min(cx - x, G.xR - cx) - 3) * 2))}</text>`;
      return s;
    }
    const bx = x + 14, bw = G.bw, by = rowTop + 6, bh = this.boxHeight(el);
    const lines = this.boxLines(el);
    s += `<rect x="${f(bx)}" y="${by}" width="${f(bw)}" height="${bh}" rx="6" class="lr-box${d.flow ? ' flow' : ''}${on ? ' on' : ''}${err ? ' err' : ''}"/>`;
    s += `<text x="${f(bx + 7)}" y="${by + 6 + G.fo + 1}" class="lr-mn${d.flow ? ' flow' : ''}" style="font-size:${G.fo + 1}px">${esc(mnemonic(el))}</text>`;
    lines.forEach((ln, k) => { s += `<text x="${f(bx + 7)}" y="${by + 6 + (G.fo + 5) + (k + 1) * (G.fo + 4) - 2}" class="lr-ops" style="font-size:${G.fo}px">${esc(ln)}</text>`; });
    if (cpu && hasValue(el)) {
      const v = valueText(el, cpu);
      if (v) s += `<text x="${f(bx + 7)}" y="${by + bh - 6}" class="lr-val" style="font-size:${G.fo - 0.5}px">${esc(v)}</text>`;
    }
    return s;
  }

  // ------------------------------------------------------------------ pointer & keys
  toWorld(e) {
    const r = this.svg.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  // taps and long presses; dragging scrolls the page natively (touch-action: pan-y)
  onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this.down) { this.down = null; clearTimeout(this.lpT); return; } // a second finger: no tap
    this.down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, id: e.pointerId, top: this.host.scrollTop };
    clearTimeout(this.lpT);
    this.lpT = setTimeout(() => { if (this.down && !this.down.moved) { const d = this.down; this.down = null; this.longPress(d.x, d.y); } }, 520);
  }

  onMove(e) {
    const d = this.down;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || Math.abs(this.host.scrollTop - d.top) > 4)) { d.moved = true; clearTimeout(this.lpT); }
  }

  onUp(e, cancel) {
    clearTimeout(this.lpT);
    const d = this.down;
    this.down = null;
    if (!d || cancel || d.moved || d.id !== e.pointerId || Math.abs(this.host.scrollTop - d.top) > 4) return;
    this.tap(e);
  }

  tap(e) {
    const [wx, wy] = this.toWorld(e);
    const hit = this.hit(wx, wy);
    if (!hit) return;
    if (hit.add) { this.addNetwork(this.prog.rungs.length - 1); return; }
    if (hit.header) { if (this.cur.rung === hit.rung) this.editComment(hit.rung); this.cur = { rung: hit.rung, row: 0, col: this.cur.col }; this.clampCursor(); this.render(); return; }
    const same = this.cur.rung === hit.rung && this.cur.row === hit.row && this.cur.col === hit.col;
    this.cur = { rung: hit.rung, row: hit.row, col: hit.col };
    Native.vibrate(4);
    const el = this.elAtCursor();
    if (this.monitorActive() && el) { this.onlineMenu(el, e.clientX, e.clientY); this.render(); return; }
    if (same && el) this.editAtCursor();
    this.render();
  }

  elAtCursor() {
    const c = this.cur, r = this.rung();
    return c.col === 'out' ? r.outs[c.row] : r.cells[c.row][c.col];
  }

  editAtCursor() {
    const el = this.elAtCursor();
    if (!el || el.t === 'H') return;
    const c = this.cur, r = this.rung();
    this.edit({ ...el, a: (el.a || []).slice() }, (v) => {
      if (c.col === 'out') r.outs[c.row] = v; else r.cells[c.row][c.col] = v;
      this.commit('Edit');
    });
  }

  longPress(x, y) {
    const r = this.svg.getBoundingClientRect();
    const hit = this.hit(x - r.left, y - r.top);
    if (!hit || hit.add) return;
    if (hit.header) { this.cur.rung = hit.rung; this.clampCursor(); this.render(); this.more({ getBoundingClientRect: () => ({ left: x, right: x, top: y, bottom: y }) }); return; }
    this.cur = { rung: hit.rung, row: hit.row, col: hit.col };
    this.render();
    Native.vibrate(14);
    const el = this.elAtCursor();
    const anchor = { getBoundingClientRect: () => ({ left: x, right: x + 1, top: y, bottom: y + 1 }) };
    const r2 = this.rung();
    const c = this.cur;
    const items = [];
    if (el && el.t !== 'H') items.push({ icon: 'edit', label: 'Edit operands', action: () => this.editAtCursor() });
    if (el && (el.t === 'NO' || el.t === 'NC')) items.push({ icon: 'flip', label: el.t === 'NO' ? 'Change to NC' : 'Change to NO', action: () => { el.t = el.t === 'NO' ? 'NC' : 'NO'; this.commit('Toggle'); } });
    if (el && el.a && el.a[0] && parseOperand(el.a[0]) && !/^[KH]/.test(el.a[0])) items.push({ icon: 'book', label: `Comment for ${el.a[0]}`, action: async () => { const v = await promptDialog(`Comment for ${el.a[0]}`, this.prog.comments[el.a[0]] || ''); if (v !== null && v !== undefined) { if (v) this.prog.comments[el.a[0]] = v; else delete this.prog.comments[el.a[0]]; this.commit('Comment'); } } });
    if (c.col !== 'out') items.push({ icon: 'columns', label: r2.vl[c.row] && r2.vl[c.row][c.col] ? 'Remove vertical line' : 'Vertical line down', action: () => this.toggleV() });
    if (c.col !== 'out') items.push({ icon: 'arrowRight', label: 'Insert cell (shift right)', action: () => { if (insertCell(r2, c.row, c.col)) this.commit('Insert cell'); else toast('The row is full', 'warn'); } });
    if (c.col !== 'out' && el) items.push({ icon: 'arrowLeft', label: 'Delete cell (shift left)', action: () => { deleteCell(r2, c.row, c.col); this.commit('Delete cell'); } });
    if (el) items.push({ icon: 'trash', label: 'Delete', danger: true, action: () => this.deleteAt() });
    items.push('-', { icon: 'plus', label: 'Insert row below', action: () => { addRow(r2, c.row + 1); this.commit('Row'); } }, { icon: 'plus', label: 'Insert network below', action: () => this.addNetwork() });
    popupMenu(anchor, items);
  }

  /** Online: change device values from the ladder (ISPSoft "Set ON / OFF"). */
  onlineMenu(el, x, y) {
    const cpu = this.lab.sys.plc.cpu;
    const anchor = { getBoundingClientRect: () => ({ left: x, right: x + 1, top: y, bottom: y + 1 }) };
    const items = [];
    for (const a of el.a || []) {
      const op = parseOperand(a);
      if (!op || op.dev === 'K' || op.dev === 'H') continue;
      if (op.dev === 'X') {
        const f = cpu.forceX.get(op.idx);
        items.push({ icon: 'bolt', label: `Force ${op.text} ON`, hint: f === 1 ? '●' : '', action: () => cpu.setForce('X', op.idx, 1) });
        items.push({ icon: 'power', label: `Force ${op.text} OFF`, hint: f === 0 ? '●' : '', action: () => cpu.setForce('X', op.idx, 0) });
        if (f !== undefined) items.push({ icon: 'close', label: `Release force ${op.text}`, action: () => cpu.setForce('X', op.idx, null) });
      } else if (['Y', 'M', 'S'].includes(op.dev) || (['T', 'C'].includes(op.dev) && INSTR[el.t].kind === 'contact')) {
        items.push({ icon: 'bolt', label: `Set ${op.text} ON`, action: () => cpu.write(op.dev, op.idx, 1) });
        items.push({ icon: 'power', label: `Set ${op.text} OFF`, action: () => cpu.write(op.dev, op.idx, 0) });
      }
      if (['D', 'T', 'C'].includes(op.dev) && (op.dev === 'D' || INSTR[el.t].kind === 'box' || el.t === 'CC')) {
        items.push({ icon: 'edit', label: `Change ${op.text}${op.dev !== 'D' ? ' value' : ''}…`, action: async () => {
          const cur = op.dev === 'D' ? cpu.D[op.idx] : op.dev === 'T' ? cpu.TV[op.idx] : cpu.CV[op.idx];
          const v = await promptDialog(`New value for ${op.text}`, String(cur));
          if (v === null || v === undefined || v === '') return;
          const n = parseInt(v, 10);
          if (!Number.isFinite(n)) return;
          cpu.write(op.dev === 'D' ? 'D' : op.dev === 'T' ? 'TV' : 'CV', op.idx, n);
        } });
      }
    }
    items.push('-', { icon: 'edit', label: 'Edit instruction', action: () => this.editAtCursor() });
    popupMenu(anchor, items);
  }

  keydown(e) {
    if (!this.visible || document.querySelector('.overlay.show')) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const c = this.cur, r = this.rung();
    const k = e.key;
    let handled = true;
    if (k === 'ArrowRight') { if (c.col === 'out') { /* stay */ } else if (c.col >= this.prog.cols - 1) c.col = 'out'; else c.col++; }
    else if (k === 'ArrowLeft') { if (c.col === 'out') c.col = this.prog.cols - 1; else c.col = Math.max(0, c.col - 1); }
    else if (k === 'ArrowDown') { if (c.row < r.cells.length - 1) c.row++; else if (c.rung < this.prog.rungs.length - 1) { c.rung++; c.row = 0; } }
    else if (k === 'ArrowUp') { if (c.row > 0) c.row--; else if (c.rung > 0) { c.rung--; c.row = this.prog.rungs[c.rung].cells.length - 1; } }
    else if (k === 'Delete' || k === 'Backspace') this.deleteAt();
    else if (k === 'Enter') this.editAtCursor();
    else if (k === 'F3') this.insertContact('NO');
    else if (k === 'F4') this.insertContact('NC');
    else if (k === 'F5') this.insertParallel('NO');
    else if (k === 'F6') this.insertParallel('NC');
    else if (k === 'F7') this.insertOutput('OUT');
    else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') this.undo();
    else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'y') this.redo();
    else handled = false;
    if (handled) { e.preventDefault(); this.clampCursor(); this.ensureVisible(); }
  }

  // ------------------------------------------------------------------ sheets
  showIL() {
    const c = this.compile();
    const list = programIL(c);
    const content = h('div', { class: 'il-list' });
    let last = -1;
    for (const ln of list) {
      if (ln.rung !== null && ln.rung !== last) {
        last = ln.rung;
        const r = this.prog.rungs[ln.rung];
        content.appendChild(h('div', { class: 'il-net' }, `Network ${ln.rung + 1}${r && r.comment ? ' · ' + r.comment : ''}`));
      }
      const [mn, ...ops] = ln.text.split(' ');
      content.appendChild(h('div', { class: 'il-row' + (ln.error ? ' err' : '') },
        h('span', { class: 'il-step' }, ln.step === null ? '' : String(ln.step).padStart(4, '0')),
        h('span', { class: 'il-mn' }, ln.error ? '' : mn),
        h('span', { class: 'il-ops' }, ln.error ? ln.text : ops.join('  ')),
        h('span', { class: 'il-cm' }, ops[0] && this.prog.comments[ops[0]] ? this.prog.comments[ops[0]] : '')));
    }
    new Sheet({ title: `Instruction list · ${c.steps} steps`, content, cls: 'sheet-tall', icon: 'list' }).open();
  }

  showComments() {
    const content = h('div', { class: 'cm-list' });
    const draw = () => {
      content.innerHTML = '';
      const used = this.recent();
      const keys = [...new Set([...Object.keys(this.prog.comments), ...used])].sort((a, b) => addrSortKey(a) - addrSortKey(b));
      for (const k of keys) {
        const inp = h('input', { class: 'input', value: this.prog.comments[k] || '', placeholder: SPECIAL[k] || 'Comment…', maxlength: 40 });
        inp.addEventListener('change', () => { if (inp.value.trim()) this.prog.comments[k] = inp.value.trim(); else delete this.prog.comments[k]; this.commit('Comment'); });
        content.appendChild(h('div', { class: 'cm-row' }, h('b', {}, k), inp));
      }
      if (!keys.length) content.appendChild(h('p', { class: 'muted center' }, 'Devices used in the program appear here.'));
    };
    draw();
    new Sheet({ title: 'Device comments', content, cls: 'sheet-tall', icon: 'book' }).open();
  }

  help() {
    dialog({
      title: 'Ladder editor',
      body: `<div class="lab-help">
        <p>Tap a cell to move the <b>cursor</b>, then a toolbar button: <b>⊣⊢</b> NO contact, <b>⊣/⊢</b> NC contact, the stacked ones add a <b>parallel (OR)</b> branch below, <b>( )</b> output coil, <b>(S)/(R)</b> set / reset, <b>TMR</b>, <b>CNT</b>, <b>MATH</b>, <b>LOGIC</b> and <b>ƒ API</b> for the whole Delta DVP instruction set (about 180 instructions, grouped like ISPSoft): contacts &amp; edges (LDP, LDF, INV, NP, PN, MEP, MEF), compare contacts (LD= … LD&lt;=, LD&amp; LD| LD^, 32-bit DLD=, floating-point FLD=), word bits (BLD, BLDI, BAND, BOR, BOUT, BSET, BRST), move &amp; convert (MOV, SMOV, CML, BMOV, FMOV, XCH, BCD, BIN, GRY, GBIN, SEGD, ASCI, HEX, PRUN, MMOV, RMOV), math (ADD, SUB, MUL, DIV, INC, DEC, NEG, ABS, SQR, MEAN, SUM, WSUM, RAND, SCAL, SCLP), floating point (DEADD, DESUB, DEMUL, DEDIV, DESQR, DEXP, DLN, DLOG, DPOW, DSIN … DTANH, DRAD, DDEG, FLT, INT, DECMP, DEZCP, DMOVR), word logic, shifts &amp; FIFO, matrix (MAND, MOR, MXOR, MINV, MBRD, MBS …), program flow (MC/MCR, CJ, CALL/SRET, FEND, END, FOR/NEXT, WDT, EI/DI), step ladder (STL/RET), handy instructions (SER, ABSD, INCD, TTMR, STMR, RAMP, SORT, TKY, ANS/ANR), the clock (TRD, TWR, TCMP, TZCP, TADD, TSUB, HOUR), high-speed &amp; pulse (DHSCS, DHSCR, DHSZ, SPD, PLSY, PWM, PLSR, PWD, DRVI, DRVA, PLSV, ZRN), Modbus, the Delta drive instructions and checksums (CCD, LRC, CRC).</p>
        <p><b>32-bit:</b> tap <b>16-bit</b> in the keypad to get the <b>D…</b> form (DMOV, DADD …): the value uses two registers (D0 and D1). <b>Operands:</b> <code>K4M0</code> = M0–M15 as one number (K1 … K4, up to K8 in 32-bit), <code>F1.5</code> = floating-point constant, <code>E0 … E7 / F0 … F7</code> = index registers, <code>D10E0</code> = D(10 + E0). <code>M1018</code> ON makes DSIN / DCOS / DTAN use degrees.</p>
        <p>The diagram always fits the screen width; networks are stacked and the program grows downward — scroll up and down.</p>
        <p><b>CJ / CALL:</b> give the target network a pointer — long-press its number → <b>Pointer label</b>. Subroutines go after <b>FEND</b> and end with <b>SRET</b>. <b>Step ladder:</b> <code>M1002 → SET S0</code>, each step starts with <b>STL Sn</b> (first cell), <b>SET Sm</b> moves to the next step, <b>RET</b> ends the block.</p>
        <p>Enter the device with the keypad. <b>X / Y are octal</b> on Delta PLCs (X0–X7, X10–X17). Timers T0–T199 count in 100 ms: <code>TMR T0 K50</code> = 5 s.</p>
        <p>Tap an element again to edit it, long-press for more. <b>│</b> links the cell's right edge to the row below.</p>
        <p><b>Download</b> writes the program over USB; while online and in RUN the ladder shows <b style="color:#4ade80">live power flow</b>. Tap an element to force inputs or change values.</p>
        <p class="muted">Useful special relays: M1000 always ON, M1002 first-scan pulse, M1013 1 s clock.</p></div>`,
      actions: [{ label: 'OK', value: true, cls: 'btn-primary' }],
    });
  }
}

const TC = new Set(['TMR', 'TON', 'TOF', 'CNT', 'DCNT']);
/** Does a box show a live value (timer / counter value or the word it writes) while monitoring? */
function valueOperand(el) {
  const d = INSTR[el.t];
  if (!d || d.kind !== 'box' || d.flow) return -1;
  if (TC.has(el.t)) return 0;
  for (let i = d.ops.length - 1; i >= 0; i--) if (d.ops[i] === 'wordw' || d.ops[i] === 'dreg' || d.ops[i] === 'fdst') return i;
  return -1;
}
/** A monitor value: integers as they are, floating point with up to 4 decimals. */
function fmtVal(v) {
  if (Number.isInteger(v)) return String(v);
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  return a !== 0 && (a >= 1e7 || a < 1e-3) ? v.toExponential(3) : String(Math.round(v * 1e4) / 1e4);
}
function hasValue(el) { return valueOperand(el) >= 0; }
function valueText(el, cpu) {
  const i = valueOperand(el);
  const op = i >= 0 ? parseOperand(el.a[i]) : null;
  if (!op) return '';
  if (op.dev === 'T' && !op.ix) return `${op.text} = ${cpu.TV[op.idx]}`;
  if (op.dev === 'C' && !op.ix) return `${op.text} = ${cpu.CV[op.idx]}`;
  const d = INSTR[el.t];
  const v = isFloatInstr(el.t) && d.ops[i] === 'fdst' ? cpu.getFloat(op) : is32(el) || d.ops[i] === 'dreg' && /^(MUL|MMOV|WSUM|PWD)$/.test(el.t) ? cpu.getDWord(op) : cpu.getWord(op);
  return `${op.text} = ${fmtVal(v)}${d.cat === 'comm' && cpu.M[1129] ? ' · time-out' : ''}`;
}

export { isOutputType, elementText, fmtAddr };
