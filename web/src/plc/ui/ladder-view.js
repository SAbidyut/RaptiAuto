// Ladder tab: an ISPSoft-like ladder editor for phones — grid cursor, instruction toolbar, operand
// keypad, live compile, download over USB, PLC RUN/STOP and online power-flow monitoring.
import { h, toast, Sheet, popupMenu, promptDialog, dialog, confirmDialog, debounce } from '../../ui/widgets.js';
import { icon } from '../../ui/icons.js';
import { Native } from '../../native.js';
import {
  INSTR, COLS, emptyRung, newElement, placeContact, placeParallel, placeOutput, toggleLink, addRow, deleteRow, trimRows, insertCell, deleteCell,
  compileProgram, programIL, elementText, mnemonic, isOutputType,
} from '../sim/ladder.js';
import { parseOperand, addrSortKey, SPECIAL, fmtAddr } from '../sim/address.js';
import { openKeypad, openInstrPicker } from './keypad.js';

const CW = 66, RH = 60, LEFT = 46, OUTW = 168, HEAD = 26, GAP = 14, TOP = 14;
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
    this.view = { x: 6, y: 6, z: 1 };
    this.monitor = true;
    this.hist = [];
    this.fut = [];
    this.pointers = new Map();
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
      B('lb-txt', '<b>ƒ API</b>', 'Application instructions', () => openInstrPicker({ onPick: (t) => (INSTR[t].kind === 'contact' ? this.insertContact(t) : this.insertOutput(t)) })),
      B('lb-sym', sym('H'), 'Horizontal line', () => this.insertH()),
      B('lb-sym', sym('V'), 'Vertical line (link to the row below)', () => this.toggleV()),
      B('lb-del', icon('eraser', 18), 'Delete', () => this.deleteAt()), sep(),
      B('lb-ic', icon('undo', 18), 'Undo', () => this.undo()),
      B('lb-ic', icon('redo', 18), 'Redo', () => this.redo()),
      B('lb-ic', icon('dots', 18), 'More', (e) => this.more(e.currentTarget)));
    this.host = h('div', { class: 'lad-host' });
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('class', 'lad-svg');
    this.g = document.createElementNS(SVGNS, 'g');
    this.svg.appendChild(this.g);
    this.host.appendChild(this.svg);
    this.zoomBox = h('div', { class: 'lad-zoom' },
      h('button', { class: 'tool', html: icon('zoomIn', 19), title: 'Zoom in', onclick: () => this.zoomBy(1.2) }),
      h('button', { class: 'tool', html: icon('zoomOut', 19), title: 'Zoom out', onclick: () => this.zoomBy(1 / 1.2) }),
      h('button', { class: 'tool', html: icon('fit', 19), title: 'Fit width', onclick: () => this.fit() }));
    this.host.appendChild(this.zoomBox);
    this.banner = h('div', { class: 'lad-banner hidden' });
    this.out = h('div', { class: 'lad-out hidden' });
    this.foot = h('div', { class: 'lad-foot' });
    this.el.append(this.bar, this.banner, this.host, this.out, this.foot);
    const opts = { passive: false };
    this.svg.addEventListener('pointerdown', (e) => this.onDown(e), opts);
    this.svg.addEventListener('pointermove', (e) => this.onMove(e), opts);
    this.svg.addEventListener('pointerup', (e) => this.onUp(e), opts);
    this.svg.addEventListener('pointercancel', (e) => this.onUp(e, true), opts);
    this.svg.addEventListener('wheel', (e) => this.onWheel(e), opts);
    this.svg.addEventListener('contextmenu', (e) => e.preventDefault());
    this.ro = new ResizeObserver(() => { if (this.visible) { if (!this.fitted) this.fit(); this.render(); } });
    this.ro.observe(this.host);
    this.onKey = (e) => this.keydown(e);
  }

  destroy() { this.ro.disconnect(); window.removeEventListener('keydown', this.onKey); }

  onShow() {
    window.addEventListener('keydown', this.onKey);
    const r = this.host.getBoundingClientRect();
    if (r.width && r.width < 520 && !this.rotHint) {
      this.rotHint = true;
      try { if (!localStorage.getItem('raptiauto.plc.rothint')) { localStorage.setItem('raptiauto.plc.rothint', '1'); setTimeout(() => toast('Tip: turn the phone sideways to see whole networks — or pinch to zoom', 'info', 4200), 700); } } catch (e) { /* ignore */ }
    }
    requestAnimationFrame(() => { if (!this.fitted) this.fit(); this.render(); this.updateBanner(); });
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

  more(anchor) {
    popupMenu(anchor, [
      { icon: 'plus', label: 'Insert network below', action: () => this.addNetwork() },
      { icon: 'plus', label: 'Insert row below', action: () => { addRow(this.rung(), this.cur.row + 1); this.cur.row++; this.commit('Row'); } },
      { icon: 'trash', label: 'Delete row', action: () => { deleteRow(this.rung(), this.cur.row); this.clampCursor(); this.commit('Delete row'); } },
      { icon: 'copy', label: 'Duplicate network', action: () => { const c = JSON.parse(JSON.stringify(this.rung())); c.id = c.id + 'c'; this.prog.rungs.splice(this.cur.rung + 1, 0, c); this.cur.rung++; this.commit('Duplicate'); } },
      { icon: 'arrowUp', label: 'Move network up', action: () => this.moveNetwork(-1) },
      { icon: 'arrowDown', label: 'Move network down', action: () => this.moveNetwork(1) },
      { icon: 'edit', label: 'Network comment', action: () => this.editComment() },
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

  // ------------------------------------------------------------------ view
  contentW() { return LEFT + this.prog.cols * CW + OUTW + 18; }

  fit() {
    const r = this.host.getBoundingClientRect();
    if (!r.width) return;
    const z = Math.max(0.55, Math.min(1.35, (r.width - 12) / this.contentW()));
    this.view.z = r.width < 520 ? Math.max(z, 0.82) : z;
    this.view.x = 6;
    this.fitted = true;
    this.clampView();
    this.render();
  }

  zoomBy(k, cx, cy) {
    const r = this.host.getBoundingClientRect();
    cx = cx ?? r.width / 2; cy = cy ?? r.height / 2;
    const z0 = this.view.z, z1 = Math.max(0.4, Math.min(2.2, z0 * k));
    this.view.x = cx - (cx - this.view.x) * (z1 / z0);
    this.view.y = cy - (cy - this.view.y) * (z1 / z0);
    this.view.z = z1;
    this.clampView();
    this.render();
  }

  clampView() {
    const r = this.host.getBoundingClientRect();
    const v = this.view;
    const W = this.contentW() * v.z, H = (this.layoutH || 400) * v.z;
    v.x = Math.min(40, Math.max(Math.min(6, r.width - W - 10), v.x));
    v.y = Math.min(40, Math.max(Math.min(6, r.height - H - 60), v.y));
  }

  ensureVisible() {
    this.layoutRungs();
    const L = this.layout[this.cur.rung];
    if (!L) return;
    const r = this.host.getBoundingClientRect();
    const v = this.view;
    const y0 = L.y + HEAD + this.cur.row * RH, y1 = y0 + RH;
    const x0 = this.cur.col === 'out' ? LEFT + this.prog.cols * CW : LEFT + this.cur.col * CW;
    const x1 = x0 + (this.cur.col === 'out' ? OUTW : CW);
    if (y0 * v.z + v.y < 10) v.y = 10 - (y0 - HEAD) * v.z;
    if (y1 * v.z + v.y > r.height - 20) v.y = r.height - 20 - y1 * v.z;
    if (x0 * v.z + v.x < 6) v.x = 6 - x0 * v.z + 4;
    if (x1 * v.z + v.x > r.width - 6) v.x = r.width - 6 - x1 * v.z;
    this.clampView();
    this.render();
  }

  layoutRungs() {
    let y = TOP;
    this.layout = this.prog.rungs.map((r) => {
      const L = { y, h: HEAD + r.cells.length * RH + GAP };
      y += L.h;
      return L;
    });
    this.layoutH = y + 70;
  }

  hit(wx, wy) {
    for (let i = 0; i < this.layout.length; i++) {
      const L = this.layout[i];
      if (wy < L.y || wy >= L.y + L.h) continue;
      const r = this.prog.rungs[i];
      if (wy < L.y + HEAD) return { rung: i, header: true };
      const row = Math.min(r.cells.length - 1, Math.floor((wy - L.y - HEAD) / RH));
      const cx = wx - LEFT;
      const col = cx >= this.prog.cols * CW ? 'out' : Math.max(0, Math.floor(cx / CW));
      return { rung: i, row, col };
    }
    if (wy >= (this.layoutH || 0) - 70) return { add: true };
    return null;
  }

  // ------------------------------------------------------------------ rendering
  render() {
    if (!this.visible) return;
    this.layoutRungs();
    const v = this.view;
    const r = this.host.getBoundingClientRect();
    this.g.setAttribute('transform', `translate(${v.x.toFixed(1)},${v.y.toFixed(1)}) scale(${v.z.toFixed(4)})`);
    const wy0 = -v.y / v.z - 40, wy1 = (r.height - v.y) / v.z + 40;
    const sys = this.lab.sys;
    const mon = this.monitorActive();
    const cpu = mon ? sys.plc.cpu : null;
    const comments = this.prog.comments;
    const cols = this.prog.cols;
    const W = this.contentW();
    let s = '';
    this.prog.rungs.forEach((rung, ri) => {
      const L = this.layout[ri];
      if (L.y + L.h < wy0 || L.y > wy1) return;
      const selR = ri === this.cur.rung;
      const live = cpu && cpu.running ? cpu.rungLive(this.compiledIndex(ri)) : null;
      const y0 = L.y + HEAD;
      const rows = rung.cells.length;
      // header
      s += `<rect x="2" y="${L.y + 2}" width="${W - 4}" height="${L.h - GAP + 2}" rx="8" class="lr-bg${selR ? ' sel' : ''}"/>`;
      s += `<text x="10" y="${L.y + 17}" class="lr-num">${ri + 1}</text>`;
      s += rung.comment ? `<text x="${LEFT}" y="${L.y + 17}" class="lr-cmt">// ${esc(rung.comment.slice(0, 90))}</text>` : selR ? `<text x="${LEFT}" y="${L.y + 17}" class="lr-cmt ph">// tap here to add a comment</text>` : '';
      // rails
      s += `<line x1="${LEFT}" y1="${y0 + 4}" x2="${LEFT}" y2="${y0 + rows * RH - 4}" class="lr-rail${live ? ' on' : ''}"/>`;
      s += `<line x1="${LEFT + cols * CW + OUTW - 8}" y1="${y0 + 4}" x2="${LEFT + cols * CW + OUTW - 8}" y2="${y0 + rows * RH - 4}" class="lr-rail r"/>`;
      for (let rr = 0; rr < rows; rr++) {
        const yc = y0 + rr * RH + RH / 2 + 4;
        for (let c = 0; c < cols; c++) {
          const el = rung.cells[rr][c];
          const x0 = LEFT + c * CW;
          const st = live && live.cells[rr] ? live.cells[rr][c] : 0;
          if (el) s += this.drawCell(el, x0, yc, st, cpu, comments, this.errAt.has(`${this.compiledIndex(ri, true)}:${rr}:${c}`));
          else if (selR) s += `<circle cx="${x0 + CW / 2}" cy="${yc}" r="1.6" class="lr-dot"/>`;
        }
        const o = rung.outs[rr];
        const xo = LEFT + cols * CW;
        if (o) s += this.drawOut(o, xo, yc, live ? live.rows[rr] : 0, cpu, comments, this.errAt.has(`${this.compiledIndex(ri, true)}:${rr}:out`));
        else if (selR) s += `<circle cx="${xo + 40}" cy="${yc}" r="1.6" class="lr-dot"/>`;
      }
      // vertical links
      for (let rr = 0; rr < rows - 1; rr++) for (let c = 0; c < cols; c++) {
        if (!rung.vl[rr] || !rung.vl[rr][c]) continue;
        const x = LEFT + (c + 1) * CW;
        const ya = y0 + rr * RH + RH / 2 + 4, yb = ya + RH;
        const on = live && ((live.cells[rr][c] & 2) || (live.cells[rr + 1][c] & 2) || (c === cols - 1 && (live.rows[rr] || live.rows[rr + 1])));
        s += `<line x1="${x}" y1="${ya}" x2="${x}" y2="${yb}" class="lw${on ? ' on' : ''}"/>`;
      }
      // cursor
      if (selR) {
        const c = this.cur;
        const cx = c.col === 'out' ? LEFT + cols * CW : LEFT + c.col * CW;
        const cw = c.col === 'out' ? OUTW - 12 : CW;
        s += `<rect x="${cx + 1}" y="${y0 + c.row * RH + 3}" width="${cw - 2}" height="${RH - 2}" rx="7" class="lr-cursor"/>`;
      }
    });
    const endY = this.layoutH - 66;
    s += `<g class="lr-end"><rect x="2" y="${endY}" width="${W - 4}" height="34" rx="8"/><text x="${LEFT}" y="${endY + 22}">END</text><text x="${W - 16}" y="${endY + 22}" text-anchor="end" class="lr-add">＋ add network</text></g>`;
    this.g.innerHTML = s;
    this.renderFoot();
  }

  /** Index of a rung in the compiled program (empty rungs are skipped by the compiler). */
  compiledIndex(ri, forErrors = false) {
    if (forErrors) return ri;
    return ri;
  }

  drawCell(el, x, y, st, cpu, comments, err) {
    const inOn = st & 1, outOn = st & 2;
    let s = '';
    const w = (x1, x2, on) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="lw${on ? ' on' : ''}"/>`;
    if (el.t === 'H') return w(x, x + CW, inOn);
    const m = x + CW / 2;
    const label = (txt, cls = 'lr-op') => `<text x="${m}" y="${y - 17}" text-anchor="middle" class="${cls}">${esc(txt)}</text>`;
    const cm = (a) => (comments[a] ? `<text x="${m}" y="${y + 26}" text-anchor="middle" class="lr-cm">${esc(comments[a].slice(0, 11))}</text>` : '');
    if (el.t === 'CC') {
      s += w(x, x + 6, inOn) + w(x + CW - 6, x + CW, outOn);
      s += `<rect x="${x + 6}" y="${y - 13}" width="${CW - 12}" height="26" rx="4" class="lr-box${outOn ? ' on' : ''}${err ? ' err' : ''}"/>`;
      s += `<text x="${m}" y="${y + 4}" text-anchor="middle" class="lr-cc">${esc(el.op)}</text>`;
      s += `<text x="${m}" y="${y - 18}" text-anchor="middle" class="lr-op sm">${esc(el.a[0])}</text>`;
      s += `<text x="${m}" y="${y + 26}" text-anchor="middle" class="lr-op sm">${esc(el.a[1])}</text>`;
      if (cpu) {
        const a = parseOperand(el.a[0]), b = parseOperand(el.a[1]);
        if (a && b) s += `<text x="${x + CW - 2}" y="${y - 28}" text-anchor="end" class="lr-val">${cpu.getWord(a)}</text>`;
      }
      return s;
    }
    if (el.t === 'INV') {
      s += w(x, x + CW / 2 - 8, inOn) + w(x + CW / 2 + 8, x + CW, outOn);
      s += `<line x1="${m - 9}" y1="${y + 10}" x2="${m + 9}" y2="${y - 10}" class="lr-sym"/><text x="${m}" y="${y - 17}" text-anchor="middle" class="lr-op">INV</text>`;
      return s;
    }
    const gap = 9;
    s += w(x, m - gap, inOn) + w(m + gap, x + CW, outOn);
    const op = parseOperand(el.a[0]);
    let closed = false;
    if (cpu && op) { const b = cpu.getBit(op); closed = el.t === 'NC' ? !b : el.t === 'NO' ? !!b : !!outOn; }
    if (closed) s += `<rect x="${m - gap}" y="${y - 12}" width="${gap * 2}" height="24" rx="2" class="lr-fill"/>`;
    s += `<line x1="${m - gap}" y1="${y - 12}" x2="${m - gap}" y2="${y + 12}" class="lr-sym${err ? ' err' : ''}"/><line x1="${m + gap}" y1="${y - 12}" x2="${m + gap}" y2="${y + 12}" class="lr-sym${err ? ' err' : ''}"/>`;
    if (el.t === 'NC') s += `<line x1="${m - gap - 3}" y1="${y + 12}" x2="${m + gap + 3}" y2="${y - 12}" class="lr-sym"/>`;
    if (el.t === 'P') s += `<path d="M${m} ${y + 7}V${y - 7}M${m - 4} ${y - 3}l4-4 4 4" class="lr-sym thin"/>`;
    if (el.t === 'F') s += `<path d="M${m} ${y - 7}V${y + 7}M${m - 4} ${y + 3}l4 4 4-4" class="lr-sym thin"/>`;
    s += label(el.a[0] || '?', 'lr-op' + (err ? ' err' : ''));
    s += cm(el.a[0]);
    return s;
  }

  drawOut(el, x, y, on, cpu, comments, err) {
    const d = INSTR[el.t];
    let s = `<line x1="${x}" y1="${y}" x2="${x + 22}" y2="${y}" class="lw${on ? ' on' : ''}"/>`;
    if (d.kind === 'out') {
      const cx = x + 44;
      s += `<line x1="${x + 22}" y1="${y}" x2="${cx - 12}" y2="${y}" class="lw${on ? ' on' : ''}"/>`;
      const op = parseOperand(el.a[0]);
      const bit = cpu && op ? cpu.getBit(op) : 0;
      if (bit) s += `<circle cx="${cx}" cy="${y}" r="12" class="lr-fill"/>`;
      s += `<path d="M${cx - 4} ${y - 13}a13 13 0 0 0 0 26M${cx + 4} ${y - 13}a13 13 0 0 1 0 26" class="lr-sym${err ? ' err' : ''}"/>`;
      if (el.t !== 'OUT') s += `<text x="${cx}" y="${y + 4.5}" text-anchor="middle" class="lr-coilt">${el.t === 'SET' ? 'S' : el.t === 'RST' ? 'R' : el.t === 'PLS' ? 'P' : 'F'}</text>`;
      s += `<text x="${cx}" y="${y - 19}" text-anchor="middle" class="lr-op${err ? ' err' : ''}">${esc(el.a[0] || '?')}</text>`;
      if (el.t === 'PLS' || el.t === 'PLF') s += `<text x="${cx + 20}" y="${y + 4}" class="lr-mn">${el.t}</text>`;
      if (comments[el.a[0]]) s += `<text x="${cx}" y="${y + 27}" text-anchor="middle" class="lr-cm">${esc(comments[el.a[0]].slice(0, 14))}</text>`;
      return s;
    }
    const bx = x + 22, bw = OUTW - 40;
    s += `<rect x="${bx}" y="${y - 18}" width="${bw}" height="36" rx="5" class="lr-box${on ? ' on' : ''}${err ? ' err' : ''}"/>`;
    s += `<text x="${bx + 7}" y="${y - 4}" class="lr-mn">${esc(mnemonic(el))}</text>`;
    s += `<text x="${bx + 7}" y="${y + 11}" class="lr-ops">${esc(el.a.join('  '))}</text>`;
    if (cpu) {
      let v = '';
      const a0 = parseOperand(el.a[0]);
      if (el.t === 'TMR' && a0) v = `${el.a[0]} = ${cpu.TV[a0.idx]}`;
      else if (el.t === 'CNT' && a0) v = `${el.a[0]} = ${cpu.CV[a0.idx]}`;
      else if (el.t === 'MOV' || el.t === 'INC' || el.t === 'DEC') { const dst = parseOperand(el.a[el.a.length - 1]); if (dst) v = `${dst.text} = ${cpu.getWord(dst)}`; }
      else if (['ADD', 'SUB', 'MUL', 'DIV'].includes(el.t)) { const dst = parseOperand(el.a[2]); if (dst) v = `${dst.text} = ${cpu.getWord(dst)}`; }
      else if (el.t === 'MODRW') { const dst = parseOperand(el.a[3]); if (dst) v = `${dst.text} = ${cpu.getWord(dst)}${cpu.M[1129] ? ' · time-out' : ''}`; }
      if (v) s += `<text x="${bx + bw}" y="${y + 31}" text-anchor="end" class="lr-val">${esc(v)}</text>`;
    }
    return s;
  }

  // ------------------------------------------------------------------ pointer & keys
  toWorld(e) {
    const r = this.svg.getBoundingClientRect();
    return [(e.clientX - r.left - this.view.x) / this.view.z, (e.clientY - r.top - this.view.y) / this.view.z];
  }

  onDown(e) {
    e.preventDefault();
    this.svg.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.view.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, vx: this.view.x, vy: this.view.y };
      this.down = null;
      clearTimeout(this.lpT);
      return;
    }
    this.down = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y, t: performance.now(), moved: false, id: e.pointerId };
    clearTimeout(this.lpT);
    this.lpT = setTimeout(() => { if (this.down && !this.down.moved) { const d = this.down; this.down = null; this.longPress(d.x, d.y); } }, 520);
  }

  onMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = this.svg.getBoundingClientRect();
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const p = this.pinch;
      const z = Math.max(0.4, Math.min(2.2, p.z * Math.hypot(a.x - b.x, a.y - b.y) / p.d));
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      const wx = (p.mx - r.left - p.vx) / p.z, wy = (p.my - r.top - p.vy) / p.z;
      this.view.z = z;
      this.view.x = mx - wx * z;
      this.view.y = my - wy * z;
      this.clampView();
      this.render();
      return;
    }
    const d = this.down;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 7) { d.moved = true; clearTimeout(this.lpT); }
    if (d.moved) { this.view.x = d.vx + dx; this.view.y = d.vy + dy; this.clampView(); this.render(); }
  }

  onUp(e, cancel) {
    this.pointers.delete(e.pointerId);
    try { this.svg.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    clearTimeout(this.lpT);
    if (this.pinch) { if (this.pointers.size < 2) this.pinch = null; return; }
    const d = this.down;
    this.down = null;
    if (!d || cancel || d.moved || d.id !== e.pointerId) return;
    this.tap(e);
  }

  onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { const r = this.svg.getBoundingClientRect(); this.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top); return; }
    this.view.x -= e.shiftKey ? e.deltaY : e.deltaX;
    this.view.y -= e.shiftKey ? 0 : e.deltaY;
    this.clampView();
    this.render();
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
    const hit = this.hit((x - r.left - this.view.x) / this.view.z, (y - r.top - this.view.y) / this.view.z);
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
      } else if (['Y', 'M', 'S'].includes(op.dev) || (['T', 'C'].includes(op.dev) && el.t !== 'TMR' && el.t !== 'CNT' && INSTR[el.t].kind === 'contact')) {
        items.push({ icon: 'bolt', label: `Set ${op.text} ON`, action: () => cpu.write(op.dev, op.idx, 1) });
        items.push({ icon: 'power', label: `Set ${op.text} OFF`, action: () => cpu.write(op.dev, op.idx, 0) });
      }
      if (['D', 'T', 'C'].includes(op.dev) && (op.dev === 'D' || el.t === 'TMR' || el.t === 'CNT' || INSTR[el.t].kind === 'box' || el.t === 'CC')) {
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
        <p>Tap a cell to move the <b>cursor</b>, then a toolbar button: <b>⊣⊢</b> NO contact, <b>⊣/⊢</b> NC contact, the stacked ones add a <b>parallel (OR)</b> branch below, <b>( )</b> output coil, <b>(S)/(R)</b> set / reset, <b>TMR</b>, <b>CNT</b> and <b>ƒ API</b> for MOV, ADD, CMP, MODRW…</p>
        <p>Enter the device with the keypad. <b>X / Y are octal</b> on Delta PLCs (X0–X7, X10–X17). Timers T0–T199 count in 100 ms: <code>TMR T0 K50</code> = 5 s.</p>
        <p>Tap an element again to edit it, long-press for more. <b>│</b> links the cell's right edge to the row below.</p>
        <p><b>Download</b> writes the program over USB; while online and in RUN the ladder shows <b style="color:#4ade80">live power flow</b>. Tap an element to force inputs or change values.</p>
        <p class="muted">Useful special relays: M1000 always ON, M1002 first-scan pulse, M1013 1 s clock.</p></div>`,
      actions: [{ label: 'OK', value: true, cls: 'btn-primary' }],
    });
  }
}

export { isOutputType, elementText, fmtAddr };
