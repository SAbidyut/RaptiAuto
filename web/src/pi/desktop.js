// The Raspberry Pi OS (Bookworm) desktop: panel with the raspberry menu, launchers, clock and tray,
// and windows for Terminal, Thonny, File Manager, Text Editor, Chromium, Calculator and
// Raspberry Pi Configuration. Windows are maximised on a phone and float on a tablet.
import { h, toast, confirmDialog, promptDialog, dialog } from '../ui/widgets.js';
import { icon } from '../ui/icons.js';
import { Terminal } from './terminal.js';
import { normPath, basename, dirname } from './vfs.js';
import { BOARDS } from './boards.js';

const RASP = '<svg viewBox="0 0 32 32" width="22" height="22"><path d="M10 5c-2-1.5-5-.5-4.5 1.5.8 2 3 2.6 5.2 2.5zM22 5c2-1.5 5-.5 4.5 1.5-.8 2-3 2.6-5.2 2.5z" fill="#3ec43e"/><g fill="#c51a4a"><circle cx="16" cy="12" r="4"/><circle cx="10" cy="15.5" r="3.8"/><circle cx="22" cy="15.5" r="3.8"/><circle cx="12.6" cy="21" r="3.8"/><circle cx="19.4" cy="21" r="3.8"/><circle cx="16" cy="26" r="3.3"/><circle cx="7.5" cy="21.5" r="2.5"/><circle cx="24.5" cy="21.5" r="2.5"/></g></svg>';
const APP_IC = {
  terminal: '<svg viewBox="0 0 24 24" width="100%" height="100%"><rect x="2" y="3.5" width="20" height="17" rx="2.5" fill="#2d2d2d" stroke="#111"/><path d="M6 9l3.5 3L6 15" stroke="#7ee787" stroke-width="1.8" fill="none"/><path d="M11 15.5h6" stroke="#ddd" stroke-width="1.8"/></svg>',
  thonny: '<svg viewBox="0 0 24 24" width="100%" height="100%"><rect x="2" y="2" width="20" height="20" rx="5" fill="#3a7bd5"/><text x="12" y="17" text-anchor="middle" font-size="14" font-weight="700" fill="#fff" font-family="sans-serif">Th</text></svg>',
  files: '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M2 6h7.5l2 2.2H22V20H2z" fill="#4a90d9"/><path d="M2 9.5h20V20H2z" fill="#6aaef0"/></svg>',
  editor: '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M5 2.5h10l4.5 4.5v14.5H5z" fill="#fff" stroke="#888"/><path d="M8 10h8M8 13h8M8 16h5" stroke="#3a7bd5" stroke-width="1.4"/></svg>',
  chromium: '<svg viewBox="0 0 24 24" width="100%" height="100%"><circle cx="12" cy="12" r="10" fill="#4285f4"/><path d="M12 2a10 10 0 0 1 8.7 5H12z" fill="#ea4335"/><path d="M3.3 7A10 10 0 0 0 7.6 21l4.4-7.5L7.7 7z" fill="#34a853" opacity=".9"/><circle cx="12" cy="12" r="4.4" fill="#fff"/><circle cx="12" cy="12" r="3.3" fill="#4285f4"/></svg>',
  calc: '<svg viewBox="0 0 24 24" width="100%" height="100%"><rect x="4" y="2" width="16" height="20" rx="2.5" fill="#555"/><rect x="6.5" y="4.5" width="11" height="4" rx="1" fill="#b9f6ca"/><g fill="#ddd"><rect x="6.5" y="11" width="3" height="2.5" rx=".5"/><rect x="10.5" y="11" width="3" height="2.5" rx=".5"/><rect x="14.5" y="11" width="3" height="2.5" rx=".5"/><rect x="6.5" y="15" width="3" height="2.5" rx=".5"/><rect x="10.5" y="15" width="3" height="2.5" rx=".5"/></g><rect x="14.5" y="15" width="3" height="5.5" rx=".5" fill="#ff9f43"/></svg>',
  config: '<svg viewBox="0 0 24 24" width="100%" height="100%"><circle cx="12" cy="12" r="10" fill="#c51a4a"/><path d="M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 2.3a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z" fill="#fff"/><g stroke="#fff" stroke-width="2"><path d="M12 3.5v2.5M12 18v2.5M3.5 12H6M18 12h2.5M6 6l1.8 1.8M16.2 16.2L18 18M6 18l1.8-1.8M16.2 7.8L18 6"/></g></svg>',
  trash: '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M5 7h14l-1.3 14H6.3z" fill="#e8e8e8" stroke="#999"/><rect x="4" y="4.5" width="16" height="2.5" rx="1" fill="#bbb"/><path d="M9.5 10v8M12 10v8M14.5 10v8" stroke="#aaa"/></svg>',
  py: '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M5 2.5h10l4.5 4.5v14.5H5z" fill="#fff" stroke="#999"/><path d="M12 8c-2.5 0-2.4 1-2.4 1v1.3h2.5v.5H8.6S7 10.6 7 13.2s1.4 2.5 1.4 2.5h.9v-1.2s0-1.4 1.4-1.4h2.4s1.3 0 1.3-1.3V9.4S14.6 8 12 8z" fill="#3776ab"/><path d="M12 19c2.5 0 2.4-1 2.4-1v-1.3h-2.5v-.5h3.5s1.6.2 1.6-2.4-1.4-2.5-1.4-2.5h-.9v1.2s0 1.4-1.4 1.4H11s-1.3 0-1.3 1.3v2.4S9.4 19 12 19z" fill="#ffd43b"/></svg>',
  txt: '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M5 2.5h10l4.5 4.5v14.5H5z" fill="#fff" stroke="#999"/><path d="M8 10h8M8 13h8M8 16h8" stroke="#999" stroke-width="1.2"/></svg>',
  folder: '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M2 5.5h7.5l2 2.2H22V20H2z" fill="#4a90d9"/><path d="M2 9h20v11H2z" fill="#6aaef0"/></svg>',
};

const APPS = {
  terminal: { title: 'Terminal', ic: 'terminal', multi: true, w: 640, h: 400 },
  thonny: { title: 'Thonny', ic: 'thonny', w: 760, h: 560 },
  files: { title: 'File Manager', ic: 'files', w: 620, h: 440 },
  editor: { title: 'Text Editor', ic: 'editor', multi: true, w: 560, h: 420 },
  chromium: { title: 'Chromium', ic: 'chromium', w: 720, h: 480 },
  calc: { title: 'Calculator', ic: 'calc', w: 280, h: 390 },
  config: { title: 'Raspberry Pi Configuration', ic: 'config', w: 520, h: 460 },
};
const MENU = [
  ['Programming', ['thonny']],
  ['Internet', ['chromium']],
  ['Accessories', ['files', 'terminal', 'editor', 'calc']],
  ['Preferences', ['config']],
];

export class Desktop {
  /** ctx: { sys, thonny, openThonnyTab(), onShutdown() } */
  constructor(ctx) {
    this.ctx = ctx;
    this.sys = ctx.sys;
    this.wins = [];
    this.z = 10;
    this.build();
  }

  get fs() { return this.sys.piFs; }

  build() {
    this.menuBtn = h('button', { class: 'dk-pbtn dk-rasp', 'aria-label': 'Menu', html: RASP, onclick: (e) => { e.stopPropagation(); this.toggleMenu(); } });
    const launch = (id) => h('button', { class: 'dk-pbtn', title: APPS[id].title, html: `<i class="dk-ic">${APP_IC[APPS[id].ic]}</i>`, onclick: () => this.open(id) });
    this.taskbar = h('div', { class: 'dk-tasks' });
    this.clock = h('span', { class: 'dk-clock' });
    const tray = h('div', { class: 'dk-tray' },
      h('span', { class: 'dk-tr', title: 'Bluetooth', html: '<svg viewBox="0 0 24 24" width="17" height="17"><path d="M7 7l10 10-5 4V3l5 4L7 17" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>' }),
      h('span', { class: 'dk-tr', title: 'Wi-Fi: connected to RaptiNet', html: '<svg viewBox="0 0 24 24" width="17" height="17"><path d="M2 9a15 15 0 0 1 20 0M5 12.5a10.5 10.5 0 0 1 14 0M8.5 16a5.5 5.5 0 0 1 7 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="19.5" r="1.6" fill="currentColor"/></svg>' }),
      h('span', { class: 'dk-tr', title: 'Volume', html: '<svg viewBox="0 0 24 24" width="17" height="17"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' }),
      this.clock);
    this.panel = h('div', { class: 'dk-panel' }, this.menuBtn, launch('chromium'), launch('files'), launch('terminal'), h('span', { class: 'dk-psep' }), this.taskbar, tray);
    this.menu = h('div', { class: 'dk-menu hidden' });
    this.drawMenu();
    this.icons = h('div', { class: 'dk-icons' });
    this.area = h('div', { class: 'dk-area' }, this.icons);
    this.area.addEventListener('click', () => this.closeMenu());
    this.el = h('div', { class: 'desktop' }, this.panel, this.area, this.menu);
    this.drawIcons();
    this.sys.on((what) => { if (what === 'files') { this.drawIcons(); this.wins.forEach((w) => w.app.refresh && w.app.refresh()); } });
    this.tick();
  }

  tick() {
    const d = new Date();
    this.clock.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    clearTimeout(this.clockT);
    this.clockT = setTimeout(() => this.tick(), (60 - d.getSeconds()) * 1000 + 50);
  }

  drawMenu() {
    this.menu.innerHTML = '';
    for (const [cat, ids] of MENU) {
      const sub = h('div', { class: 'dk-sub' });
      for (const id of ids) sub.appendChild(h('button', { class: 'dk-mi', onclick: () => { this.closeMenu(); this.open(id); } }, h('i', { class: 'dk-ic', html: APP_IC[APPS[id].ic] }), h('span', {}, APPS[id].title)));
      this.menu.appendChild(h('div', { class: 'dk-cat' }, h('div', { class: 'dk-cat-t' }, cat), sub));
    }
    this.menu.appendChild(h('div', { class: 'dk-msep' }));
    this.menu.appendChild(h('button', { class: 'dk-mi', onclick: () => { this.closeMenu(); this.help(); } }, h('i', { class: 'dk-ic', html: icon('help', 20) }), h('span', {}, 'Help')));
    this.menu.appendChild(h('button', { class: 'dk-mi', onclick: () => { this.closeMenu(); this.shutdownDialog(); } }, h('i', { class: 'dk-ic', html: icon('power', 20) }), h('span', {}, 'Shutdown…')));
  }

  toggleMenu() { this.menu.classList.toggle('hidden'); }
  closeMenu() { this.menu.classList.add('hidden'); }

  drawIcons() {
    this.icons.innerHTML = '';
    const ico = (ic, label, fn) => h('button', { class: 'dk-dicon', ondblclick: fn, onclick: (e) => { if (e.detail <= 1) { this.icons.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel')); e.currentTarget.classList.add('sel'); clearTimeout(this.tapT); this.tapT = setTimeout(() => {}, 300); } }, onpointerup: (e) => { if (e.pointerType === 'touch') fn(); } },
      h('i', { html: APP_IC[ic] }), h('span', {}, label));
    this.icons.appendChild(ico('trash', 'Wastebasket', () => toast('The wastebasket is empty')));
    this.icons.appendChild(ico('folder', 'pi', () => this.open('files', '/home/pi')));
    for (const n of this.fs.list('/home/pi/Desktop')) {
      const p = '/home/pi/Desktop/' + n;
      this.icons.appendChild(ico(this.fs.isDir(p) ? 'folder' : n.endsWith('.py') ? 'py' : 'txt', n, () => this.openPath(p)));
    }
  }

  // ---------------------------------------------------------------- windows
  get phone() { return this.el.clientWidth < 700; }

  open(id, arg) {
    const def = APPS[id];
    if (!def.multi) {
      const w = this.wins.find((x) => x.id === id);
      if (w) { this.focus(w); if (w.app.openArg) w.app.openArg(arg); return w; }
    }
    const body = h('div', { class: 'dk-wbody' });
    const titleEl = h('span', { class: 'dk-wtitle' }, def.title);
    const win = { id, def, body, titleEl, el: null, app: null, max: true };
    const btn = (cls, svg, fn, label) => h('button', { class: 'dk-wbtn ' + cls, 'aria-label': label, html: svg, onclick: (e) => { e.stopPropagation(); fn(); } });
    const bar = h('div', { class: 'dk-wbar' }, h('i', { class: 'dk-ic', html: APP_IC[def.ic] }), titleEl,
      btn('min', '<svg viewBox="0 0 12 12" width="12" height="12"><path d="M2 9h8" stroke="currentColor" stroke-width="1.6"/></svg>', () => this.minimize(win), 'Minimise'),
      btn('max', '<svg viewBox="0 0 12 12" width="12" height="12"><rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>', () => this.toggleMax(win), 'Maximise'),
      btn('close', '<svg viewBox="0 0 12 12" width="12" height="12"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.6"/></svg>', () => this.close(win), 'Close'));
    win.el = h('div', { class: 'dk-win' }, bar, body);
    win.el.addEventListener('pointerdown', () => this.focus(win), true);
    this.dragWin(win, bar);
    const n = this.wins.length;
    Object.assign(win.el.style, { width: def.w + 'px', height: def.h + 'px', left: 30 + n * 26 + 'px', top: 14 + n * 22 + 'px' });
    win.max = this.phone || def.w > this.el.clientWidth - 20;
    win.el.classList.toggle('max', win.max);
    this.area.appendChild(win.el);
    this.wins.push(win);
    win.task = h('button', { class: 'dk-task', onclick: () => (win.el.classList.contains('min') || this.top !== win ? this.focus(win) : this.minimize(win)) }, h('i', { class: 'dk-ic', html: APP_IC[def.ic] }), h('span', {}, def.title));
    this.taskbar.appendChild(win.task);
    win.app = this.makeApp(id, win, arg);
    this.focus(win);
    return win;
  }

  makeApp(id, win, arg) {
    const setTitle = (t) => { win.titleEl.textContent = t; win.task.lastChild.textContent = t; };
    switch (id) {
      case 'terminal': {
        const t = new Terminal({ sys: this.sys, onExit: () => this.close(win), openThonny: (p) => this.openThonny(p), openFile: (p) => this.openPath(p) });
        win.body.appendChild(t.el);
        setTitle('pi@raspberrypi: ~');
        setTimeout(() => t.con.focus(), 60);
        return { term: t, destroy: () => { t.alive = false; t.con.hideInput(); if (this.sys.owner === t) this.sys.killProcess(); } };
      }
      case 'thonny': {
        const th = this.ctx.thonny;
        win.body.appendChild(th.el);
        th.shown();
        if (arg) th.open(arg);
        setTitle('Thonny  -  ' + (th.cur && th.cur.path ? th.cur.path : '<untitled>'));
        return { openArg: (p) => { if (p) th.open(p); }, destroy: () => { th.hidden(); }, thonny: true };
      }
      case 'files': return this.fileManager(win, arg || '/home/pi', setTitle);
      case 'editor': return this.textEditor(win, arg, setTitle);
      case 'chromium': return this.chromium(win);
      case 'calc': return this.calculator(win);
      case 'config': return this.configApp(win);
      default: return {};
    }
  }

  dragWin(win, bar) {
    let sx = 0, sy = 0, ox = 0, oy = 0, on = false;
    bar.addEventListener('pointerdown', (e) => {
      if (win.max || e.target.closest('button')) return;
      on = true; sx = e.clientX; sy = e.clientY; ox = win.el.offsetLeft; oy = win.el.offsetTop;
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener('pointermove', (e) => {
      if (!on) return;
      win.el.style.left = Math.max(-200, ox + e.clientX - sx) + 'px';
      win.el.style.top = Math.max(0, oy + e.clientY - sy) + 'px';
    });
    bar.addEventListener('pointerup', () => { on = false; });
    bar.addEventListener('dblclick', () => this.toggleMax(win));
  }

  focus(win) {
    win.el.classList.remove('min');
    win.el.style.zIndex = ++this.z;
    this.top = win;
    this.wins.forEach((w) => w.task.classList.toggle('active', w === win));
    if (win.app && win.app.thonny) this.ctx.thonny.editor.refresh();
  }

  minimize(win) {
    win.el.classList.add('min');
    win.task.classList.remove('active');
    const rest = this.wins.filter((w) => w !== win && !w.el.classList.contains('min'));
    this.top = rest[rest.length - 1] || null;
  }

  toggleMax(win) { win.max = !win.max; win.el.classList.toggle('max', win.max); if (win.app && win.app.thonny) this.ctx.thonny.editor.refresh(); }

  close(win) {
    if (win.app && win.app.destroy) win.app.destroy();
    win.el.remove();
    win.task.remove();
    this.wins = this.wins.filter((w) => w !== win);
  }

  /** Thonny lives in one place at a time: the Thonny tab or a desktop window. */
  thonnyWin() { return this.wins.find((w) => w.id === 'thonny'); }
  reclaimThonny() { const w = this.thonnyWin(); if (w && !w.body.contains(this.ctx.thonny.el)) w.body.appendChild(this.ctx.thonny.el); }

  openThonny(path) { this.open('thonny', path); }

  openPath(p) {
    if (this.fs.isDir(p)) this.open('files', p);
    else if (p.endsWith('.py')) this.openThonny(p);
    else this.open('editor', p);
  }

  // ---------------------------------------------------------------- apps
  fileManager(win, start, setTitle) {
    let dir = start;
    const back = [];
    const fs = this.fs;
    const pathIn = h('input', { class: 'fm-path', value: dir, onkeydown: (e) => { if (e.key === 'Enter') go(normPath(pathIn.value, dir)); } });
    const list = h('div', { class: 'fm-list' });
    const side = h('div', { class: 'fm-side' });
    for (const [label, p] of [['Home', '/home/pi'], ['Desktop', '/home/pi/Desktop'], ['Documents', '/home/pi/Documents'], ['Downloads', '/home/pi/Downloads'], ['projects', '/home/pi/projects'], ['Filesystem root', '/']]) side.appendChild(h('button', { class: 'fm-place', onclick: () => go(p) }, h('i', { class: 'dk-ic', html: APP_IC.folder }), h('span', {}, label)));
    const tbtn = (ic, label, fn) => h('button', { class: 'fm-tb', title: label, html: icon(ic, 18), onclick: fn });
    const status = h('div', { class: 'fm-status' });
    const draw = () => {
      pathIn.value = dir;
      setTitle(dir === '/home/pi' ? 'pi' : basename(dir) || '/');
      list.innerHTML = '';
      let names = [];
      try { names = fs.list(dir).filter((n) => !n.startsWith('.')); } catch (e) { names = []; }
      names.sort((a, b) => (fs.isDir(normPath(b, dir)) - fs.isDir(normPath(a, dir))) || a.localeCompare(b));
      for (const n of names) {
        const p = normPath(n, dir);
        const isDir = fs.isDir(p);
        const it = h('button', { class: 'fm-item', onclick: () => (isDir ? go(p) : this.openPath(p)) },
          h('i', { html: APP_IC[isDir ? 'folder' : n.endsWith('.py') ? 'py' : 'txt'] }), h('span', {}, n));
        it.addEventListener('contextmenu', (e) => { e.preventDefault(); itemMenu(p, n); });
        let lp;
        it.addEventListener('pointerdown', () => { lp = setTimeout(() => { lp = null; itemMenu(p, n); }, 600); });
        it.addEventListener('pointerup', () => clearTimeout(lp));
        it.addEventListener('pointerleave', () => clearTimeout(lp));
        list.appendChild(it);
      }
      status.textContent = `${names.length} items · Free space: 22.4 GB (Total: 29.0 GB)`;
    };
    const itemMenu = async (p, n) => {
      const act = await dialog({ title: n, body: '<p>What do you want to do?</p>', actions: [{ label: 'Rename', value: 'ren', cls: 'btn-ghost' }, { label: 'Delete', value: 'del', cls: 'btn-danger' }, { label: 'Cancel', value: null, cls: 'btn-ghost' }] });
      if (act === 'del') { if (await confirmDialog('Delete', `Delete ${n}?`, 'Delete', true)) { fs.remove(p, true); this.sys.emit('files'); } }
      else if (act === 'ren') { const nn = await promptDialog('Rename', n); if (nn && nn !== n) { fs.move(p, normPath(nn, dirname(p))); this.sys.emit('files'); } }
    };
    const go = (p) => { if (!fs.isDir(p)) { toast('Not a folder', 'error'); return; } if (p !== dir) back.push(dir); dir = p; draw(); };
    const bar = h('div', { class: 'fm-bar' },
      tbtn('arrowLeft', 'Back', () => { if (back.length) { dir = back.pop(); draw(); } }),
      tbtn('back', 'Up', () => go(dirname(dir))), tbtn('home', 'Home', () => go('/home/pi')), pathIn,
      tbtn('folder', 'New folder', async () => { const n = await promptDialog('New folder', 'New Folder'); if (n) { fs.mkdir(normPath(n, dir), true); this.sys.emit('files'); } }),
      tbtn('plus', 'New file', async () => { const n = await promptDialog('New file', 'new.py'); if (n) { const p = normPath(n, dir); if (!fs.exists(p)) fs.write(p, ''); this.sys.emit('files'); this.openPath(p); } }));
    win.body.appendChild(h('div', { class: 'fm' }, bar, h('div', { class: 'fm-main' }, side, list), status));
    draw();
    return { refresh: draw, openArg: (p) => { if (p) go(p); } };
  }

  textEditor(win, path, setTitle) {
    const fs = this.fs;
    const ta = h('textarea', { class: 'te-text', spellcheck: 'false', autocapitalize: 'off' });
    let cur = path || null;
    let dirty = false;
    const title = () => setTitle(`${dirty ? '*' : ''}${cur ? basename(cur) : 'Untitled'} - Text Editor`);
    if (cur && fs.isFile(cur)) ta.value = fs.read(cur);
    ta.addEventListener('input', () => { if (!dirty) { dirty = true; title(); } });
    const save = async () => {
      if (!cur) { const n = await promptDialog('Save as', '/home/pi/Documents/untitled.txt'); if (!n) return; cur = normPath(n, '/home/pi'); }
      fs.write(cur, ta.value); dirty = false; title(); this.sys.emit('files'); toast('Saved ' + basename(cur), 'ok');
    };
    const open = async () => { const n = await promptDialog('Open file', cur || '/home/pi/Documents/notes.txt'); if (!n) return; const p = normPath(n, '/home/pi'); if (!fs.isFile(p)) { toast('No such file', 'error'); return; } cur = p; ta.value = fs.read(p); dirty = false; title(); };
    const mb = (label, fn) => h('button', { class: 'te-mb', onclick: fn }, label);
    win.body.appendChild(h('div', { class: 'te' }, h('div', { class: 'te-menu' }, mb('New', () => { cur = null; ta.value = ''; dirty = false; title(); }), mb('Open', open), mb('Save', save), mb('Save As', async () => { const c = cur; cur = null; await save(); if (!cur) cur = c; })), ta));
    ta.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 's') { e.preventDefault(); save(); } });
    title();
    return {};
  }

  chromium(win) {
    const url = h('input', { class: 'cr-url', value: 'https://www.raspberrypi.com/', onkeydown: (e) => { if (e.key === 'Enter') show(url.value); } });
    const page = h('div', { class: 'cr-page' });
    const show = (u) => {
      page.innerHTML = '';
      page.append(h('div', { class: 'cr-dino', html: '<svg viewBox="0 0 44 47" width="64" height="68"><path fill="#535353" d="M22 0h20v4h2v13H32v3h8v3H29v3h5v6h-3v-3h-2v6h-3v3h-3v3h-3v3h2v3h-5v-6h-3v3h-3v3h2v3H9v-9H6v-3H3v-3H0v-9h3v3h3v3h3v3h3v-3h3v-3h3v-3h3V3h2z"/><rect x="27" y="3" width="3" height="3" fill="#fff"/></svg>' }),
        h('h2', {}, 'No internet'), h('p', {}, 'Try:'), h('ul', {}, h('li', {}, 'Checking the network cables, modem and router'), h('li', {}, 'Reconnecting to Wi-Fi')),
        h('p', { class: 'cr-code' }, 'ERR_INTERNET_DISCONNECTED'),
        h('p', { class: 'cr-note' }, `The virtual Raspberry Pi has no internet: "${u}" can't be opened. Python libraries such as gpiozero and RPi.GPIO are already installed.`));
    };
    show(url.value);
    win.body.appendChild(h('div', { class: 'cr' }, h('div', { class: 'cr-bar' }, h('span', { class: 'cr-nav', html: icon('arrowLeft', 16) }), h('span', { class: 'cr-nav', html: icon('restart', 16) }), url), page));
    return {};
  }

  calculator(win) {
    const disp = h('div', { class: 'calc-disp' }, '0');
    let expr = '';
    const press = (k) => {
      if (k === 'C') expr = '';
      else if (k === '⌫') expr = expr.slice(0, -1);
      else if (k === '=') {
        try {
          if (!/^[\d+\-*/().% ]*$/.test(expr)) throw new Error();
          // eslint-disable-next-line no-new-func
          const v = Function(`"use strict";return (${expr.replace(/%/g, '/100')})`)();
          expr = Number.isFinite(v) ? String(Math.round(v * 1e10) / 1e10) : 'Error';
        } catch (e) { expr = 'Error'; }
      } else { if (expr === 'Error') expr = ''; expr += k; }
      disp.textContent = expr || '0';
    };
    const keys = ['C', '⌫', '%', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '(', ')', '='];
    win.body.appendChild(h('div', { class: 'calc' }, disp, h('div', { class: 'calc-keys' }, ...keys.map((k) => h('button', { class: 'calc-k' + (/[=]/.test(k) ? ' eq' : /[+\-*/%]/.test(k) ? ' op' : ''), onclick: () => press(k) }, k)))));
    return {};
  }

  configApp(win) {
    const cfgPath = '/boot/firmware/config.txt';
    const fs = this.fs;
    const read = () => (fs.isFile(cfgPath) ? fs.read(cfgPath) : '');
    const has = (re) => re.test(read());
    const setLine = (key, on) => {
      let t = read();
      const re = new RegExp(`^#?${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=on\\s*$`, 'm');
      if (re.test(t)) t = t.replace(re, on ? `${key}=on` : `#${key}=on`);
      else if (on) t += `${key}=on\n`;
      fs.write(cfgPath, t);
    };
    const prefs = (() => { try { return JSON.parse(localStorage.getItem('rapti.pi.config') || '{}'); } catch (e) { return {}; } })();
    const savePrefs = () => { try { localStorage.setItem('rapti.pi.config', JSON.stringify(prefs)); } catch (e) { /* ignore */ } };
    const tog = (label, get, set) => {
      const on = h('button', { class: 'cfg-radio' + (get() ? ' on' : '') }, 'On'), off = h('button', { class: 'cfg-radio' + (get() ? '' : ' on') }, 'Off');
      const sync = () => { on.classList.toggle('on', get()); off.classList.toggle('on', !get()); };
      on.onclick = () => { set(true); sync(); }; off.onclick = () => { set(false); sync(); };
      return h('div', { class: 'cfg-row' }, h('span', {}, label), h('div', { class: 'cfg-tog' }, on, off));
    };
    const pref = (k, d) => [() => (prefs[k] ?? d), (v) => { prefs[k] = v; savePrefs(); }];
    const kv = (label, val) => h('div', { class: 'cfg-row' }, h('span', {}, label), h('b', {}, val));
    const b = BOARDS[this.sys.board.startsWith('pico') ? 'pi5' : this.sys.board];
    const tabs = {
      System: () => [kv('Password:', '••••••'), kv('Hostname:', 'raspberrypi'), tog('Boot to desktop:', ...pref('desktop', true)), tog('Auto login:', ...pref('autologin', true)), tog('Splash screen:', ...pref('splash', true)), kv('Board:', b.model)],
      Display: () => [tog('Screen blanking:', ...pref('blank', false)), kv('Resolution:', '1920 × 1080 (HDMI-A-1)')],
      Interfaces: () => [
        tog('SSH:', ...pref('ssh', false)), tog('VNC:', ...pref('vnc', false)),
        tog('SPI:', () => has(/^dtparam=spi=on/m), (v) => setLine('dtparam=spi', v)),
        tog('I2C:', () => has(/^dtparam=i2c_arm=on/m), (v) => setLine('dtparam=i2c_arm', v)),
        tog('Serial Port:', ...pref('serial', false)), tog('Serial Console:', ...pref('serialc', false)), tog('1-Wire:', ...pref('onewire', false)), tog('Remote GPIO:', ...pref('rgpio', false))],
      Performance: () => [kv('Overlay File System:', 'Disabled'), kv('Fan:', this.sys.board === 'pi5' ? 'Automatic (Active Cooler)' : 'Not fitted')],
      Localisation: () => [kv('Locale:', 'en_GB.UTF-8'), kv('Timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'), kv('Keyboard:', 'English (US)'), kv('WLAN Country:', 'BD Bangladesh')],
    };
    const tabBar = h('div', { class: 'cfg-tabs' });
    const body = h('div', { class: 'cfg-body' });
    const show = (name) => { tabBar.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.textContent === name)); body.innerHTML = ''; body.append(...tabs[name]()); };
    for (const name of Object.keys(tabs)) tabBar.appendChild(h('button', { onclick: () => show(name) }, name));
    win.body.appendChild(h('div', { class: 'cfg' }, tabBar, body, h('div', { class: 'cfg-foot' }, h('button', { class: 'cfg-btn', onclick: () => this.close(win) }, 'Cancel'), h('button', { class: 'cfg-btn pri', onclick: () => { toast('Settings saved (some take effect after a reboot)', 'ok'); this.close(win); } }, 'OK'))));
    show('System');
    return {};
  }

  help() {
    const w = this.open('editor');
    const ta = w.body.querySelector('textarea');
    ta.value = 'RaptiAuto virtual Raspberry Pi — help\n\n' +
      '• Terminal: a simulated bash. Try: ls, cd, cat, nano, pinout, pinctrl get 17,\n  vcgencmd measure_temp, python3 blink.py, python3 (interactive).\n' +
      '• Thonny: write Python, press Run. Stop restarts the program.\n' +
      '• Python runs on a real MicroPython 1.29 engine with gpiozero, RPi.GPIO,\n  neopixel and adafruit_dht libraries made for this simulator.\n' +
      '• The Board tab shows the GPIO header live and the parts you wired.\n' +
      '• There is no internet and no apt / pip installs; files are kept on this phone.\n';
    w.titleEl.textContent = 'Help - Text Editor';
  }

  async shutdownDialog() {
    const act = await dialog({ title: 'Shutdown options', body: '<p>What do you want to do?</p>', actions: [{ label: 'Shutdown', value: 'off', cls: 'btn-danger' }, { label: 'Reboot', value: 'reboot', cls: 'btn-ghost' }, { label: 'Logout', value: 'logout', cls: 'btn-ghost' }, { label: 'Cancel', value: null, cls: 'btn-ghost' }] });
    if (!act) return;
    for (const w of [...this.wins]) if (w.id !== 'thonny') this.close(w);
    const tw = this.thonnyWin(); if (tw) this.close(tw);
    this.sys.killProcess();
    if (act !== 'logout') this.sys.gpio.reset();
    const veil = h('div', { class: 'dk-veil' }, h('div', { class: 'dk-veil-logo', html: RASP.replace(/width="22" height="22"/, 'width="90" height="90"') }), h('p', {}, act === 'off' ? 'Power off' : act === 'reboot' ? 'Rebooting…' : 'Logging out…'));
    this.el.appendChild(veil);
    if (act === 'off') {
      veil.appendChild(h('button', { class: 'btn btn-primary dk-power', onclick: () => { veil.querySelector('p').textContent = 'Starting…'; veil.querySelector('.dk-power').remove(); setTimeout(() => veil.remove(), 1500); } }, 'Power on'));
      if (this.ctx.onShutdown) this.ctx.onShutdown();
    } else setTimeout(() => veil.remove(), act === 'reboot' ? 2200 : 900);
  }

  shown() { this.reclaimThonny(); this.tick(); const t = this.thonnyWin(); if (t) this.ctx.thonny.shown(); }
  hidden() { this.closeMenu(); }
}
