// Thonny, the Python IDE of Raspberry Pi OS: editor tabs, Run / Stop, and the Shell (>>> REPL)
// on the shared Python process. On the Pico it plays Thonny's "MicroPython (Raspberry Pi Pico)"
// back end: Run sends the editor text to the board, Stop / Ctrl+D soft-reboot it.
import { h, toast, Sheet, promptDialog, confirmDialog, popupMenu } from '../ui/widgets.js';
import { icon } from '../ui/icons.js';
import { Console } from './console.js';
import { PyEditor } from './pyedit.js';
import { needsMore } from './terminal.js';
import { normPath, basename, dirname } from './vfs.js';
import { BOARDS } from './boards.js';
import { PI_EXAMPLES, PICO_EXAMPLES } from './examples.js';

const TB = {
  new: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M6 2.5h8l4.5 4.5v14.5H6z" fill="#fff" stroke="#6b7280" stroke-width="1.3"/><path d="M14 2.5V7h4.5" fill="#e5e7eb" stroke="#6b7280" stroke-width="1.3"/><circle cx="17.5" cy="17.5" r="4.5" fill="#22a33a"/><path d="M17.5 15v5M15 17.5h5" stroke="#fff" stroke-width="1.8"/></svg>',
  load: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M2.5 6.5h7l2 2h10v11h-19z" fill="#f2c14e" stroke="#b7862a" stroke-width="1.2"/><path d="M2.5 10h19" stroke="#d9a63a" stroke-width="1.2"/></svg>',
  save: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3.5 3.5h14l3 3v14h-17z" fill="#3b6fd8" stroke="#24479a" stroke-width="1.2"/><rect x="7" y="3.5" width="9" height="6" fill="#e8eefc"/><rect x="6.5" y="13" width="11" height="7.5" rx="1" fill="#fff"/></svg>',
  run: '<svg viewBox="0 0 24 24" width="28" height="28"><circle cx="12" cy="12" r="10" fill="#2fa84f" stroke="#1d7a37" stroke-width="1.2"/><path d="M9.5 7.5v9l7.5-4.5z" fill="#fff"/></svg>',
  stop: '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M8 2.5h8l5.5 5.5v8L16 21.5H8L2.5 16V8z" fill="#d93a3a" stroke="#a52222" stroke-width="1.2"/><rect x="7.5" y="10.5" width="9" height="3" rx=".6" fill="#fff"/></svg>',
  examples: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 4.5h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z" fill="#8b5cf6" stroke="#5b34c2" stroke-width="1.1"/><path d="M20 4.5h-7a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z" fill="#a78bfa" stroke="#5b34c2" stroke-width="1.1"/></svg>',
  files: '<svg viewBox="0 0 24 24" width="26" height="26"><rect x="3" y="4" width="18" height="16" rx="2" fill="#fff" stroke="#6b7280" stroke-width="1.3"/><path d="M6 8h12M6 12h12M6 16h8" stroke="#3b6fd8" stroke-width="1.6"/></svg>',
  zoom: '<svg viewBox="0 0 24 24" width="26" height="26"><circle cx="10.5" cy="10.5" r="6.5" fill="#fff" stroke="#6b7280" stroke-width="1.6"/><path d="M15.5 15.5l5 5" stroke="#6b7280" stroke-width="2.2"/><path d="M8 10.5h5M10.5 8v5" stroke="#2fa84f" stroke-width="1.8"/></svg>',
};

export class Thonny {
  /** ctx: { sys, wire(ex) } */
  constructor(ctx) {
    this.ctx = ctx;
    this.sys = ctx.sys;
    this.proc = null;
    this.buf = [];
    this.pid = 0;
    this.running = false;
    this.font = Number(localStorage.getItem('rapti.pi.thonny.font')) || 14;
    this.build();
    this.loadTabs();
    this.sys.on((what) => this.onSys(what));
  }

  get kind() { return this.sys.isPico ? 'pico' : 'pi'; }
  get fs() { return this.sys.fs; }
  get cur() { return this.tabs[this.ti]; }

  // ---------------------------------------------------------------- DOM
  build() {
    const tb = (key, label, fn, cls = '') => h('button', { class: 'th-tb ' + cls, title: label, onclick: fn }, h('i', { html: TB[key] }), h('span', {}, label));
    this.runB = tb('run', 'Run', () => this.run(), 'th-run');
    this.stopB = tb('stop', 'Stop', () => this.stop(), 'th-stop');
    this.toolbar = h('div', { class: 'th-toolbar' },
      tb('new', 'New', () => this.newTab()), tb('load', 'Load', () => this.loadDialog()), tb('save', 'Save', () => this.save()),
      h('span', { class: 'th-sep' }), this.runB, this.stopB, h('span', { class: 'th-sep' }),
      tb('examples', 'Examples', () => this.examples()), tb('files', 'Files', () => this.loadDialog()),
      h('span', { class: 'th-flex' }),
      h('button', { class: 'th-tb th-more', title: 'More', html: icon('dots', 20), onclick: (e) => this.menu(e.currentTarget) }));
    this.tabBar = h('div', { class: 'th-tabs' });
    this.edHost = h('div', { class: 'th-editor' });
    this.editor = new PyEditor(this.edHost, { fontSize: this.font, onChange: (v) => this.edited(v) });
    this.con = new Console({
      cls: 'th-con',
      onKey: (e) => {
        if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && !window.getSelection().toString()) { this.interrupt(); return true; }
        if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) { this.softReboot(); return true; }
        return false;
      },
      extraKeys: [['Ctrl+C', () => this.interrupt()], ['Ctrl+D', () => this.softReboot()], ['↑', (c) => c.histMove(-1)], ['↓', (c) => c.histMove(1)], ['Tab', (c) => c.insert('    ')], [':', (c) => c.insert(':')], ['(', (c) => c.insert('(')], [')', (c) => c.insert(')')], ['"', (c) => c.insert('"')]],
    });
    const grip = h('div', { class: 'th-grip' }, h('span'));
    this.shellHead = h('div', { class: 'th-shell-head' }, h('b', {}, 'Shell'), h('button', { class: 'th-clear', onclick: () => { this.con.clear(); this.showPrompt(); } }, 'Clear'));
    this.shell = h('div', { class: 'th-shell' }, this.shellHead, this.con.el);
    this.status = h('div', { class: 'th-status' });
    this.el = h('div', { class: 'thonny' }, this.toolbar, this.tabBar, this.edHost, grip, this.shell, this.status);
    this.dragGrip(grip);
    this.updateStatus();
  }

  dragGrip(grip) {
    let y0 = null, hh = 0;
    grip.addEventListener('pointerdown', (e) => { y0 = e.clientY; hh = this.shell.getBoundingClientRect().height; grip.setPointerCapture(e.pointerId); });
    grip.addEventListener('pointermove', (e) => {
      if (y0 == null) return;
      const total = this.el.getBoundingClientRect().height;
      const nh = Math.max(90, Math.min(total - 160, hh - (e.clientY - y0)));
      this.shell.style.flex = `0 0 ${nh}px`;
    });
    const end = () => { y0 = null; this.editor.refresh(); };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  updateStatus() {
    const b = BOARDS[this.sys.board];
    this.status.innerHTML = '';
    if (this.sys.isPico) this.status.append(h('span', {}, `MicroPython (${b.name})`), h('span', { class: 'th-port' }, '• Board CDC @ /dev/ttyACM0'));
    else this.status.append(h('span', {}, 'Local Python 3'), h('span', { class: 'th-port' }, '• /usr/bin/python3'));
    this.runB.classList.toggle('busy', this.running);
  }

  // ---------------------------------------------------------------- tabs
  tabsKey() { return 'rapti.pi.thonny.' + this.kind; }

  loadTabs() {
    this.loadedKind = this.kind;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(this.tabsKey()) || 'null'); } catch (e) { saved = null; }
    this.tabs = [];
    if (saved && Array.isArray(saved.tabs)) {
      for (const t of saved.tabs) {
        if (t.path && this.fs.isFile(t.path)) this.tabs.push({ path: t.path, name: basename(t.path), text: t.dirty ? t.text : this.fs.read(t.path), dirty: !!t.dirty });
        else if (!t.path) this.tabs.push({ path: null, name: t.name || '<untitled>', text: t.text || '', dirty: !!t.dirty });
      }
      this.ti = Math.min(saved.ti || 0, this.tabs.length - 1);
    }
    if (!this.tabs.length) {
      const first = this.sys.isPico ? '/main.py' : '/home/pi/blink.py';
      if (this.fs.isFile(first)) this.tabs.push({ path: first, name: basename(first), text: this.fs.read(first), dirty: false });
      else this.tabs.push({ path: null, name: '<untitled>', text: '', dirty: false });
      this.ti = 0;
    }
    this.showTab(this.ti);
  }

  saveTabs() {
    const data = { ti: this.ti, tabs: this.tabs.map((t) => ({ path: t.path, name: t.name, dirty: t.dirty, text: t.dirty || !t.path ? t.text : undefined })) };
    try { localStorage.setItem(this.tabsKey(), JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  drawTabs() {
    this.tabBar.innerHTML = '';
    this.tabs.forEach((t, i) => {
      const close = h('button', { class: 'th-tab-x', 'aria-label': 'Close', onclick: (e) => { e.stopPropagation(); this.closeTab(i); } }, '×');
      const label = (this.sys.isPico && t.path ? '[ ' + t.name + ' ]' : t.name) + (t.dirty ? ' *' : '');
      this.tabBar.appendChild(h('div', { class: 'th-tab' + (i === this.ti ? ' active' : ''), onclick: () => this.showTab(i) }, h('span', {}, label), close));
    });
  }

  showTab(i) {
    if (this.cur && this.ti !== i) this.cur.text = this.editor.value;
    this.ti = i;
    this.editor.load(this.cur.text);
    this.drawTabs();
    this.saveTabs();
  }

  edited(v) {
    const t = this.cur;
    t.text = v;
    if (!t.dirty) { t.dirty = true; this.drawTabs(); }
    clearTimeout(this.tabSaveT);
    this.tabSaveT = setTimeout(() => this.saveTabs(), 600);
  }

  newTab(name = '<untitled>', text = '', path = null) {
    if (this.cur) this.cur.text = this.editor.value;
    this.tabs.push({ path, name, text, dirty: !path && !!text });
    this.showTab(this.tabs.length - 1);
  }

  async closeTab(i) {
    const t = this.tabs[i];
    if (i === this.ti) t.text = this.editor.value;
    if (t.dirty && t.text.trim() && !(await confirmDialog('Close tab', `Close ${t.name} without saving?`, 'Close', true))) return;
    this.tabs.splice(i, 1);
    if (!this.tabs.length) this.tabs.push({ path: null, name: '<untitled>', text: '', dirty: false });
    this.ti = Math.min(this.ti >= i ? Math.max(0, this.ti - 1) : this.ti, this.tabs.length - 1);
    this.editor.load(this.cur.text);
    this.drawTabs();
    this.saveTabs();
  }

  /** Open a file of the board's file system in a tab (or switch to it). */
  open(path) {
    const i = this.tabs.findIndex((t) => t.path === path);
    if (i >= 0) { this.showTab(i); return; }
    if (!this.fs.isFile(path)) { toast('File not found: ' + path, 'error'); return; }
    const c = this.cur;
    // replace an empty untitled tab
    if (c && !c.path && !c.dirty && !this.editor.value.trim()) { c.path = path; c.name = basename(path); c.text = this.fs.read(path); c.dirty = false; this.showTab(this.ti); this.editor.load(c.text); return; }
    this.newTab(basename(path), this.fs.read(path), path);
    this.cur.dirty = false;
    this.drawTabs();
  }

  async save(as = false) {
    const t = this.cur;
    t.text = this.editor.value;
    let path = t.path;
    if (!path || as) {
      const where = this.sys.isPico ? 'Raspberry Pi Pico' : '/home/pi';
      const name = await promptDialog(`Save to ${where} as`, t.path ? basename(t.path) : (t.name.startsWith('<') ? 'untitled.py' : t.name));
      if (!name) return false;
      path = normPath(name.endsWith('.py') || name.includes('.') ? name : name + '.py', this.sys.home);
      if (this.fs.isFile(path) && path !== t.path && !(await confirmDialog('Replace file', `${basename(path)} already exists. Replace it?`, 'Replace', true))) return false;
    }
    try { this.fs.write(path, t.text); } catch (e) { toast(e.message, 'error'); return false; }
    t.path = path; t.name = basename(path); t.dirty = false;
    this.drawTabs();
    this.saveTabs();
    this.sys.emit('files');
    return true;
  }

  // ---------------------------------------------------------------- dialogs
  loadDialog() {
    const fs = this.fs;
    let dir = this.cur && this.cur.path ? dirname(this.cur.path) : this.sys.home;
    const list = h('div', { class: 'th-files' });
    const head = h('div', { class: 'th-files-path' });
    const draw = () => {
      list.innerHTML = '';
      head.textContent = this.sys.isPico ? 'Raspberry Pi Pico: ' + dir : 'This computer: ' + dir;
      if (dir !== '/') list.appendChild(h('button', { class: 'th-file dir', onclick: () => { dir = dirname(dir); draw(); } }, h('i', { html: icon('back', 18) }), h('span', {}, '..')));
      const names = fs.list(dir).filter((n) => !n.startsWith('.'));
      names.sort((a, b) => (fs.isDir(normPath(b, dir)) - fs.isDir(normPath(a, dir))) || a.localeCompare(b));
      for (const n of names) {
        const p = normPath(n, dir);
        const isDir = fs.isDir(p);
        const row = h('div', { class: 'th-file-row' },
          h('button', { class: 'th-file' + (isDir ? ' dir' : ''), onclick: () => { if (isDir) { dir = p; draw(); } else { sheet.close(); this.open(p); } } },
            h('i', { html: icon(isDir ? 'folder' : n.endsWith('.py') ? 'code' : 'book', 18) }), h('span', {}, n), isDir ? null : h('small', {}, fmtSize(fs.stat(p).size))),
          isDir ? null : h('button', { class: 'icon-btn', 'aria-label': 'Delete', html: icon('trash', 17), onclick: async () => { if (await confirmDialog('Delete', `Delete ${n}?`, 'Delete', true)) { fs.remove(p); this.sys.emit('files'); draw(); } } }));
        list.appendChild(row);
      }
      if (!names.length) list.appendChild(h('p', { class: 'muted th-empty' }, 'Empty folder'));
    };
    draw();
    const sheet = new Sheet({ title: this.sys.isPico ? 'Open from Raspberry Pi Pico' : 'Open file', icon: 'folder', content: h('div', {}, head, list) }).open();
  }

  examples() {
    const isPico = this.sys.isPico;
    const list = (isPico ? PICO_EXAMPLES : PI_EXAMPLES).filter((e) => !e.boards || e.boards.includes(this.sys.board));
    const box = h('div', { class: 'th-ex-list' });
    for (const ex of list) {
      box.appendChild(h('button', { class: 'th-ex', onclick: () => { sheet.close(); this.openExample(ex); } },
        h('b', {}, ex.title), h('span', {}, ex.file + ' · ' + ex.tags.join(', '))));
    }
    const sheet = new Sheet({ title: isPico ? 'MicroPython examples' : 'Python examples', icon: 'book', content: box, height: '78vh' }).open();
  }

  async openExample(ex) {
    if (this.sys.isPico) this.newTab(ex.file, ex.code);
    else {
      const path = '/home/pi/' + ex.file;
      if (!this.fs.isFile(path)) this.fs.write(path, ex.code);
      this.open(path);
    }
    if (ex.parts && ex.parts.length) {
      const names = ex.parts.map((p) => p.type).join(', ');
      if (this.ctx.wire) this.ctx.wire(ex);
      toast(`Wired on the Circuit tab: ${names}`, 'ok');
    }
  }

  menu(anchor) {
    const pico = this.sys.isPico;
    popupMenu(anchor, [
      { icon: 'save', label: 'Save as…', action: () => this.save(true) },
      { icon: 'close', label: 'Close tab', action: () => this.closeTab(this.ti) },
      { icon: 'search', label: 'Find in file', action: () => this.editor.search() },
      '-',
      { icon: 'plus', label: 'Zoom in', action: () => this.zoom(1) },
      { icon: 'minus', label: 'Zoom out', action: () => this.zoom(-1) },
      '-',
      { icon: 'stop', label: 'Interrupt execution', hint: 'Ctrl+C', action: () => this.interrupt() },
      { icon: 'restart', label: pico ? 'Send EOF / Soft reboot' : 'Restart backend', hint: 'Ctrl+D', action: () => this.softReboot() },
      { icon: 'eraser', label: 'Clear shell', action: () => { this.con.clear(); this.showPrompt(); } },
    ]);
  }

  zoom(d) {
    this.font = Math.max(10, Math.min(24, this.font + d));
    this.editor.setFontSize(this.font);
    this.el.style.setProperty('--th-font', this.font + 'px');
    try { localStorage.setItem('rapti.pi.thonny.font', this.font); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- back end
  onSys(what) {
    if (what === 'board') {
      if (this.cur) this.cur.text = this.editor.value;
      this.saveTabs();
      this.proc = null; this.buf = []; this.running = false;
      this.con.hideInput();
      this.con.clear();
      this.loadTabs();
      this.updateStatus();
      if (this.visible) this.ensureBackend();
    } else if (what === 'proc') {
      if (this.proc && this.sys.proc !== this.proc) {
        // another app (the Terminal, the board's Run button) took the Python process
        this.proc = null; this.buf = []; this.running = false; ++this.pid;
        this.con.hideInput();
        this.con.writeln('');
        this.con.writeln(this.sys.isPico ? 'Connection lost (board reset). Press Stop to reconnect.' : 'Backend terminated. Press Stop to restart.', 'fg-K');
        this.updateStatus();
      }
    }
  }

  banner() {
    if (this.sys.isPico) {
      const b = BOARDS[this.sys.board];
      const name = { pico: 'Raspberry Pi Pico', picow: 'Raspberry Pi Pico W', pico2: 'Raspberry Pi Pico2', pico2w: 'Raspberry Pi Pico 2 W' }[b.id];
      return `MicroPython v1.29.0 on 2026-10-10; ${name} with ${b.mcu}\nType "help()" for more information.`;
    }
    return 'Python 3.11.2 (/usr/bin/python3)';
  }

  async ensureBackend(quiet = false) {
    if (this.proc && !this.proc.dead && this.sys.proc === this.proc) return this.proc;
    if (this.starting) return this.starting;
    if (this.proc && (this.proc.dead || this.sys.proc !== this.proc)) this.proc = null;
    this.starting = (async () => {
      ++this.pid;
      this.con.hideInput();
      const proc = await this.sys.spawn({
        owner: this,
        cwd: this.sys.home,
        out: (t, s) => { if (this.proc === proc) { this.con.write(t, s === 'err' ? 'err' : ''); if (s === 'err') this.errText += t; } },
        readLine: (p) => { ++this.pid; this.sys.emit('input'); return this.con.prompt(p, { keepHistory: false }).then((v) => (v == null ? '' : v)); },
      });
      this.proc = proc;
      if (!quiet) this.con.writeln(this.banner());
      return proc;
    })().finally(() => { this.starting = null; });
    const p = await this.starting;
    if (!quiet) this.showPrompt();
    return p;
  }

  showPrompt() {
    const proc = this.proc;
    if (!proc || proc.dead || this.running) return;
    const id = ++this.pid;
    const prev = this.buf.length ? this.buf[this.buf.length - 1] : '';
    const indent = this.buf.length ? (/^(\s*)/.exec(prev)[1] + (/:\s*(#.*)?$/.test(prev) ? '    ' : '')) : '';
    this.con.prompt(this.buf.length ? '... ' : '>>> ', { value: indent, focus: false }).then((line) => this.onLine(id, line));
  }

  async onLine(id, line) {
    if (id !== this.pid) return;
    if (line == null) { this.buf = []; this.showPrompt(); return; }
    if (!this.buf.length && !line.trim()) { this.showPrompt(); return; }
    this.buf.push(line);
    if (needsMore(this.buf, line)) { this.showPrompt(); return; }
    const src = this.buf.join('\n').replace(/\s+$/, '') + '\n';
    this.buf = [];
    const m = /^%Run\s+(\S+)/.exec(src.trim());
    if (m) { const p = normPath(m[1], this.sys.home); if (this.fs.isFile(p)) { this.open(p); return this.run(true); } this.con.writeln(`%Run: file not found: ${m[1]}`, 'err'); this.showPrompt(); return; }
    if (/^%?(cd|ls|clear)\b/.test(src.trim())) { if (/clear/.test(src)) this.con.clear(); else this.con.writeln(this.fs.list(this.sys.home).join('  ')); this.showPrompt(); return; }
    const proc = this.proc;
    this.running = true; this.updateStatus();
    await proc.replExec(src);
    if (proc !== this.proc) return;
    this.running = false; this.updateStatus();
    this.showPrompt();
  }

  /** Run the current editor tab. */
  async run(fromShell = false) {
    // Pico: Ctrl+C the running program first; Pi: the back end is simply restarted below
    if (this.running && this.proc && this.sys.isPico) { await this.stopRun(); }
    const t = this.cur;
    t.text = this.editor.value;
    const pico = this.sys.isPico;
    if (!pico) {
      if (!t.path || t.dirty) { if (!(await this.save())) return; }
    }
    const name = pico ? (t.name.startsWith('<') ? '<stdin>' : t.name) : t.path;
    ++this.pid;
    this.con.hideInput();
    this.buf = [];
    // Thonny restarts the back end before each run (fresh variables, pins released)
    this.dropBackend();
    if (pico) this.con.writeln('MPY: soft reboot', 'fg-K');
    const proc = await this.ensureBackend(true);
    if (!fromShell) { this.con.write('>>> '); }
    this.con.writeln(pico ? (t.path ? `%Run -c $EDITOR_CONTENT` : '%Run -c $EDITOR_CONTENT') : `%Run ${basename(t.path)}`, 'th-magic');
    this.running = true;
    this.errText = '';
    this.updateStatus();
    this.sys.emit('run');
    let st;
    if (pico) st = await proc.runSource(t.text, name === '<stdin>' ? 'main.py' : name);
    else {
      await proc.exec(`import sys, os\nsys.argv = [${JSON.stringify(t.path)}]\nos.chdir(${JSON.stringify(dirname(t.path))})`);
      st = await proc.runFile(t.path);
    }
    if (proc !== this.proc) return;
    this.running = false;
    this.updateStatus();
    this.sys.emit('run');
    if (st === 1) {
      const re = new RegExp(`File "${(pico ? (name === '<stdin>' ? 'main.py' : name) : t.path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}", line (\\d+)`, 'g');
      let m, last = null;
      while ((m = re.exec(this.errText))) last = Number(m[1]);
      if (last) this.editor.gotoLine(last);
    }
    this.sys.syncBack(proc);
    this.showPrompt();
  }

  /** Kill our Python process without the 'backend terminated' notice. */
  dropBackend() {
    const p = this.proc;
    this.proc = null;
    if (p && !p.dead && this.sys.proc === p) this.sys.killProcess();
  }

  interrupt() {
    if (this.proc && this.proc.busy) { this.proc.interrupt(); return; }
    if (this.con.waiting) { this.buf = []; this.con.cancel('^C'); if (this.proc && !this.running) this.con.writeln('KeyboardInterrupt', 'err'); this.showPrompt(); }
  }

  async stopRun() {
    const proc = this.proc;
    if (!proc) return;
    await proc.stop(800);
  }

  /** Stop / Restart: interrupt the program and start a fresh back end (Pico: soft reboot). */
  async stop() {
    ++this.pid;
    this.con.hideInput();
    // Pico: Ctrl+C first (the board prints KeyboardInterrupt); Pi: Thonny just restarts the back end
    if (this.sys.isPico && this.proc && this.proc.busy) { this.proc.interrupt(); await new Promise((r) => setTimeout(r, 150)); }
    this.dropBackend();
    this.running = false;
    this.buf = [];
    this.updateStatus();
    this.sys.emit('run');
    this.con.writeln('');
    if (this.sys.isPico) this.con.writeln('MPY: soft reboot', 'fg-K');
    await this.ensureBackend();
  }

  /** Ctrl+D. Pico: soft reboot, then main.py runs like at power-on. Pi: restart the back end. */
  async softReboot() {
    if (!this.sys.isPico) return this.stop();
    ++this.pid;
    this.con.hideInput();
    this.dropBackend(); this.running = false; this.buf = [];
    this.con.writeln('MPY: soft reboot', 'fg-K');
    const proc = await this.ensureBackend(true);
    if (this.fs.isFile('/main.py')) {
      this.running = true; this.updateStatus(); this.sys.emit('run');
      await proc.runFile('/main.py');
      if (proc !== this.proc) return;
      this.running = false; this.updateStatus(); this.sys.emit('run');
    }
    this.con.writeln(this.banner());
    this.showPrompt();
  }

  // ---------------------------------------------------------------- visibility
  shown() {
    this.visible = true;
    if (this.loadedKind !== this.kind) this.onSys('board');
    this.editor.refresh();
    if (!this.proc || this.proc.dead || this.sys.proc !== this.proc) {
      if (!this.sys.proc || this.sys.owner === this || this.sys.owner == null) this.ensureBackend();
    }
  }

  hidden() { this.visible = false; if (this.cur) this.cur.text = this.editor.value; this.saveTabs(); }
}

function fmtSize(n) { return n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB'; }
