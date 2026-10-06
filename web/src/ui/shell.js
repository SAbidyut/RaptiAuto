// App shell: top bar with the ☰ menu, side drawer, bottom navigation and the menu pages
// (Home, My Projects, Examples, Boards, Components, Guide, Settings, About RAPTI).
import { getDef, allDefs, CATEGORIES, pinsOf, defaultProps } from '../components/registry.js';
import { BOARD_TYPES } from '../components/boards.js';
import { listProjects, loadProject, deleteProject, createProject, cloneProject, saveProject, importJSON, exportJSON, listFolders, addFolder, renameFolder, setProjectFolder } from '../store.js';
import { EXAMPLES, EXAMPLE_CATEGORIES } from '../examples/index.js';
import { h, toast, popupMenu, confirmDialog, promptDialog, timeAgo, pushBack, Sheet, dialog } from './widgets.js';
import { icon } from './icons.js';
import { thumbSVG } from './library.js';
import { projectPreview } from './preview.js';
import { logoMark, wordmark } from './brand.js';
import { aboutPage, RAPTI } from './about.js';
import { GUIDE } from './guide.js';
import { quizPage } from './quiz.js';
import { Native } from '../native.js';
import { boardLangs } from '../sim/py/index.js';
import { listLabs, loadLab, deleteLab, saveLab, cloneLab, importLab, exportLab, labThumb } from '../plc/store.js';
import { LAB_EXAMPLES, LAB_EXAMPLE_CATEGORIES, buildExample } from '../plc/examples.js';
import { DEVICE_DEFS, PLC_MODELS } from '../plc/devices/defs.js';

export const PAGES = {
  home: { title: 'Home', icon: 'home' },
  projects: { title: 'My Projects', icon: 'folder' },
  plclab: { title: 'Delta PLC Lab', icon: 'cpu' },
  examples: { title: 'Examples', icon: 'book' },
  boards: { title: 'Boards', icon: 'chip' },
  components: { title: 'Components', icon: 'layers' },
  quiz: { title: 'Quiz', icon: 'award' },
  guide: { title: 'Guide', icon: 'help' },
  settings: { title: 'Settings', icon: 'settings' },
  about: { title: 'About RAPTI', icon: 'graduation' },
};
const TABS = [['home', 'Home'], ['projects', 'Projects'], ['plclab', 'PLC Lab'], ['examples', 'Examples']];

export class Shell {
  constructor(app) {
    this.app = app;
    this.page = 'home';
    this.exCat = 'all';
    this.partCat = 'all';
    this.root = h('div', { class: 'screen shell' });
    this.titleEl = h('div', { class: 'app-title' });
    this.actionsEl = h('div', { class: 'app-actions' });
    this.bar = h('header', { class: 'app-bar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Menu', html: icon('menu'), onclick: () => this.openDrawer() }),
      this.titleEl, this.actionsEl);
    this.host = h('main', { class: 'page-host' });
    this.nav = h('nav', { class: 'bottom-nav' });
    for (const [id, label] of TABS) {
      this.nav.appendChild(h('button', { class: 'bn-item', 'data-page': id, onclick: () => this.go(id) },
        h('span', { class: 'bn-ic', html: icon(PAGES[id].icon, 22) }), h('span', { class: 'bn-label' }, label)));
    }
    this.nav.appendChild(h('button', { class: 'bn-item', onclick: () => this.openDrawer() },
      h('span', { class: 'bn-ic', html: icon('menu', 22) }), h('span', { class: 'bn-label' }, 'Menu')));
    this.buildDrawer();
    this.root.append(this.bar, this.host, this.nav, this.scrim, this.drawer);
  }

  mount(parent) {
    parent.appendChild(this.root);
    this.render();
  }

  unmount() {
    this.closeDrawer(true);
    this.root.remove();
  }

  /** Re-render the current page (e.g. after returning from the editor). */
  refreshProjects() { if (this.root.isConnected) this.render(true); }

  // ---------------------------------------------------------------- navigation
  go(page, { anchor } = {}) {
    if (!PAGES[page]) page = 'home';
    this.closeDrawer();
    const changed = page !== this.page;
    this.page = page;
    // Android back from any menu page returns to Home.
    if (page !== 'home' && !this.unbackPage) this.unbackPage = pushBack(() => { this.unbackPage = null; this.go('home'); });
    if (page === 'home' && this.unbackPage) { this.unbackPage(); this.unbackPage = null; }
    this.render(!changed);
    if (anchor) requestAnimationFrame(() => { const el = this.host.querySelector('#' + anchor); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }

  render(keepScroll = false) {
    const prev = this.host.firstElementChild;
    const scroll = keepScroll && prev ? prev.scrollTop : 0;
    const pageEl = h('div', { class: 'page page-' + this.page });
    this.extras = []; // non-scrolling overlays such as a page FAB
    this.actionsEl.innerHTML = '';
    this.titleEl.innerHTML = '';
    if (this.page === 'home') this.titleEl.appendChild(h('div', { class: 'brand', html: `${logoMark(34, 'tb')}${wordmark()}` }));
    else this.titleEl.appendChild(h('h1', {}, PAGES[this.page].title));
    const fill = { home: this.pageHome, projects: this.pageProjects, plclab: this.pageLab, examples: this.pageExamples, boards: this.pageBoards, components: this.pageComponents, quiz: this.pageQuiz, guide: this.pageGuide, settings: this.pageSettings, about: this.pageAbout }[this.page];
    fill.call(this, pageEl);
    this.host.innerHTML = '';
    this.host.append(pageEl, ...this.extras);
    if (scroll) pageEl.scrollTop = scroll;
    else if (!keepScroll) pageEl.classList.add('enter');
    for (const b of this.nav.querySelectorAll('.bn-item[data-page]')) b.classList.toggle('active', b.dataset.page === this.page);
    for (const b of this.drawer.querySelectorAll('.dr-item[data-page]')) b.classList.toggle('active', b.dataset.page === this.page);
  }

  action(ic, label, fn) {
    this.actionsEl.appendChild(h('button', { class: 'icon-btn', 'aria-label': label, title: label, html: icon(ic), onclick: fn }));
  }

  // ---------------------------------------------------------------- drawer
  buildDrawer() {
    this.scrim = h('div', { class: 'drawer-scrim', onclick: () => this.closeDrawer() });
    const item = (page, label, ic, extra) => h('button', { class: 'dr-item', 'data-page': page, onclick: () => this.go(page) },
      h('span', { class: 'dr-ic', html: icon(ic, 20) }), h('span', { class: 'dr-label' }, label), extra || null);
    const act = (label, ic, fn, cls = '') => h('button', { class: 'dr-item ' + cls, onclick: () => { this.closeDrawer(); fn(); } },
      h('span', { class: 'dr-ic', html: icon(ic, 20) }), h('span', { class: 'dr-label' }, label));
    const group = (t) => h('div', { class: 'dr-group' }, t);
    this.drawer = h('aside', { class: 'drawer', 'aria-label': 'Menu' },
      h('div', { class: 'dr-head' },
        h('div', { class: 'dr-brand', html: `${logoMark(52, 'dr')}<div>${wordmark()}<small>Arduino · PLC · electronics simulator</small></div>` }),
        h('button', { class: 'dr-new', html: `${icon('plus', 19)}<span>New Project</span>`, onclick: () => { this.closeDrawer(); this.newProject(); } })),
      h('nav', { class: 'dr-list' },
        group('Workspace'),
        item('home', 'Home', 'home'),
        item('projects', 'My Projects', 'folder', h('span', { class: 'dr-count' })),
        item('examples', 'Examples', 'book', h('span', { class: 'dr-count' }, String(EXAMPLES.length))),
        act('Open / import file', 'upload', () => this.importProject()),
        group('Industrial automation'),
        item('plclab', 'Delta PLC Lab', 'cpu', h('span', { class: 'dr-new-badge' }, '3D')),
        group('Library'),
        item('boards', 'Boards', 'chip', h('span', { class: 'dr-count' }, String(BOARD_TYPES.length))),
        item('components', 'Components', 'layers', h('span', { class: 'dr-count' }, String(partCount()))),
        group('Help'),
        item('guide', 'Guide — how to use', 'help'),
        item('quiz', 'Quiz', 'award'),
        item('settings', 'Settings', 'settings'),
        group('RAPTI'),
        item('about', 'About RAPTI', 'graduation'),
        act('Contact us', 'phone', () => this.go('about', { anchor: 'contact' })),
        act('Visit rapti.net', 'globe', () => Native.openUrl(RAPTI.website)),
        act('Share RaptiAuto', 'share', () => Native.shareText('RaptiAuto', 'RaptiAuto — build Arduino circuits, write code and simulate them on your phone. By RAPTI · https://rapti.net'))),
      h('div', { class: 'dr-foot' }, `RaptiAuto v${Native.version()} · Made by RAPTI, Bangladesh`));
    this.drawer.addEventListener('pointerdown', (e) => this.dragDrawer(e));
  }

  openDrawer() {
    if (this.drawerOpen) return;
    this.drawerOpen = true;
    const n = listProjects().length;
    const c = this.drawer.querySelector('.dr-item[data-page="projects"] .dr-count');
    if (c) c.textContent = n ? String(n) : '';
    this.root.classList.add('drawer-open');
    this.unbackDrawer = pushBack(() => { this.unbackDrawer = null; this.closeDrawer(); });
  }

  closeDrawer(silent) {
    if (!this.drawerOpen) return;
    this.drawerOpen = false;
    this.root.classList.remove('drawer-open');
    this.drawer.style.transform = '';
    if (this.unbackDrawer) { this.unbackDrawer(); this.unbackDrawer = null; }
    void silent;
  }

  /** Swipe the drawer to the left to close it. */
  dragDrawer(e) {
    const x0 = e.clientX, y0 = e.clientY;
    let dx = 0, horiz = null;
    const move = (ev) => {
      dx = Math.min(0, ev.clientX - x0);
      if (horiz === null && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) horiz = Math.abs(ev.clientX - x0) > Math.abs(ev.clientY - y0);
      if (horiz) { this.drawer.style.transition = 'none'; this.drawer.style.transform = `translateX(${dx}px)`; }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      this.drawer.style.transition = '';
      if (horiz && dx < -70) this.closeDrawer(); else this.drawer.style.transform = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  // ---------------------------------------------------------------- pages
  pageHome(el) {
    this.action('upload', 'Open / import file', () => this.importProject());
    this.action('info', 'About RAPTI', () => this.go('about'));
    el.appendChild(h('section', { class: 'hero' },
      h('div', { class: 'hero-bg', html: heroArt() }),
      h('div', { class: 'hero-content' },
        h('div', { class: 'hero-kicker', html: `${icon('sparkles', 15)}<span>Arduino · ESP32 · Electronics</span>` }),
        h('h1', {}, 'Build circuits.', h('br'), h('span', { class: 'grad' }, 'Code. Simulate.')),
        h('p', {}, 'Wire real components on a breadboard, write Arduino code and watch it come alive — right on your phone.'),
        h('div', { class: 'hero-actions' },
          h('button', { class: 'btn btn-primary btn-lg', html: `${icon('plus', 20)}<span>New Project</span>`, onclick: () => this.newProject() }),
          h('button', { class: 'btn btn-glass btn-lg', html: `${icon('book', 19)}<span>Examples</span>`, onclick: () => this.go('examples') })))));

    el.appendChild(this.labBanner());

    const tile = (page, label, sub, ic, tone, fn) => h('button', { class: 'qa-tile tone-' + tone, onclick: fn || (() => this.go(page)) },
      h('span', { class: 'qa-ic', html: icon(ic, 22) }), h('b', {}, label), h('small', {}, sub));
    el.appendChild(h('section', { class: 'home-sec' }, secHead('Menu', 'Everything in RaptiAuto', 'grid'),
      h('div', { class: 'qa-grid' },
        tile('projects', 'My Projects', `${listProjects().length} saved`, 'folder', 'cyan'),
        tile('examples', 'Examples', `${EXAMPLES.length} projects`, 'book', 'violet'),
        tile('plclab', 'PLC Lab', 'Delta · 3D', 'cpu', 'blue'),
        tile('components', 'Components', `${partCount()}+ parts`, 'layers', 'green'),
        tile('guide', 'Guide', 'How to use', 'help', 'amber'),
        tile('about', 'About RAPTI', 'Courses · contact', 'graduation', 'pink'))));

    const recent = listProjects().slice(0, 3).map((m) => loadProject(m.id)).filter(Boolean);
    if (recent.length) {
      const list = h('div', { class: 'proj-list' });
      for (const p of recent) list.appendChild(this.projectCard(p));
      el.appendChild(h('section', { class: 'home-sec' }, secHead('Continue', 'Your recent projects', 'clock', () => this.go('projects')), list));
    } else {
      const row = h('div', { class: 'ex-row' });
      for (const id of ['blink', 'traffic-light', 'servo-sweep', 'lcd-i2c-hello', 'ultrasonic', 'neopixel-ring']) {
        const ex = EXAMPLES.find((e) => e.id === id);
        if (ex) row.appendChild(this.exampleCard(ex));
      }
      el.appendChild(h('section', { class: 'home-sec' }, secHead('Start here', 'Open an example and press Run', 'sparkles', () => this.go('examples')), row));
    }
    el.appendChild(h('footer', { class: 'home-foot' },
      h('button', { class: 'rapti-card', onclick: () => this.go('about') },
        h('div', { class: 'rc-logo', html: icon('graduation', 26) }),
        h('div', { class: 'rc-text' }, h('b', {}, 'RAPTI'), h('span', {}, RAPTI.full)),
        h('span', { class: 'rc-go', html: icon('forward', 20) })),
      h('p', { class: 'muted small center' }, `RaptiAuto v${Native.version()} · Made in Bangladesh 🇧🇩`)));
  }

  pageProjects(el) {
    this.action('upload', 'Open / import file', () => this.importProject());
    const metas = listProjects();
    if (!metas.length) {
      el.appendChild(h('div', { class: 'page-pad' }, h('div', { class: 'empty-state' },
        h('div', { class: 'empty-ic big', html: icon('folder', 38) }),
        h('h2', {}, 'No projects yet'),
        h('p', {}, 'Create a project for any board, or open an example and make it yours. Projects are saved on this phone.'),
        h('div', { class: 'empty-actions' },
          h('button', { class: 'btn btn-primary', html: `${icon('plus', 18)}<span>New Project</span>`, onclick: () => this.newProject() }),
          h('button', { class: 'btn btn-glass', html: `${icon('book', 18)}<span>Examples</span>`, onclick: () => this.go('examples') })))));
      return;
    }
    const list = h('div', { class: 'proj-list' });
    const search = searchBox('Search projects', (q) => draw(q));
    const projects = metas.map((m) => loadProject(m.id)).filter(Boolean);
    const folders = listFolders();
    if (this.projFolder && this.projFolder !== '*' && this.projFolder !== '-' && !folders.includes(this.projFolder)) this.projFolder = '*';
    const chips = h('div', { class: 'chips-row' });
    const folderBar = h('div', { class: 'folder-bar' });
    let query = '';
    const inFolder = (p) => (!this.projFolder || this.projFolder === '*' ? true : this.projFolder === '-' ? !p.folder : p.folder === this.projFolder);
    const draw = (q = query) => {
      query = q;
      list.innerHTML = '';
      const ql = q.trim().toLowerCase();
      const shown = projects.filter((p) => inFolder(p) && (!ql || p.name.toLowerCase().includes(ql)));
      for (const p of shown) list.appendChild(this.projectCard(p));
      if (!shown.length) list.appendChild(h('p', { class: 'muted center' }, 'No matching projects'));
    };
    const drawChips = () => {
      chips.innerHTML = '';
      const chip = (id, label, n) => chips.appendChild(h('button', { class: 'chip' + ((this.projFolder || '*') === id ? ' active' : ''), onclick: () => { this.projFolder = id; drawChips(); draw(); } },
        label, n === undefined ? null : h('span', { class: 'chip-n' }, String(n))));
      chip('*', 'All', projects.length);
      if (folders.length) chip('-', 'No folder', projects.filter((p) => !p.folder).length);
      for (const f of folders) chip(f, f, projects.filter((p) => p.folder === f).length);
      chips.appendChild(h('button', { class: 'chip chip-add', html: `${icon('plus', 15)}<span>Folder</span>`, onclick: async () => {
        const n = await promptDialog('New folder', '');
        if (n && addFolder(n)) { this.projFolder = n.trim().slice(0, 40); this.render(true); }
      } }));
      folderBar.innerHTML = '';
      if (this.projFolder && this.projFolder !== '*' && this.projFolder !== '-') {
        folderBar.append(h('span', { class: 'muted small' }, `Folder “${this.projFolder}”`),
          h('button', { class: 'btn btn-ghost sm', onclick: async () => { const n = await promptDialog('Rename folder', this.projFolder); if (n && n.trim() && n.trim() !== this.projFolder) { renameFolder(this.projFolder, n); this.projFolder = n.trim().slice(0, 40); this.render(true); } } }, 'Rename'),
          h('button', { class: 'btn btn-danger-ghost sm', onclick: async () => { if (await confirmDialog('Delete folder?', `The projects in “${escapeHtml(this.projFolder)}” are kept and move to “No folder”.`, 'Delete folder', true)) { renameFolder(this.projFolder, ''); this.projFolder = '*'; this.render(true); } } }, 'Delete folder'));
      }
    };
    el.append(h('div', { class: 'page-tools' }, search, chips, folderBar, h('div', { class: 'muted small' }, `${projects.length} project${projects.length === 1 ? '' : 's'} on this phone`)), list);
    this.extras.push(h('button', { class: 'fab fab-page', 'aria-label': 'New project', html: icon('plus', 26), onclick: () => this.newProject() }));
    drawChips();
    draw();
  }

  pageExamples(el) {
    const grid = h('div', { class: 'ex-grid' });
    const chips = h('div', { class: 'chips-row' });
    let q = '';
    const draw = () => {
      grid.innerHTML = '';
      const ql = q.trim().toLowerCase();
      const list = EXAMPLES.filter((e) => (ql ? (e.name + ' ' + e.description).toLowerCase().includes(ql) : this.exCat === 'all' || e.category === this.exCat));
      for (const ex of list) grid.appendChild(this.exampleCard(ex));
      if (!list.length) grid.appendChild(h('p', { class: 'muted center span-all' }, 'No examples found'));
    };
    for (const c of [{ id: 'all', name: 'All' }, ...EXAMPLE_CATEGORIES]) {
      const n = c.id === 'all' ? EXAMPLES.length : EXAMPLES.filter((e) => e.category === c.id).length;
      if (!n) continue;
      chips.appendChild(h('button', { class: 'chip' + (c.id === this.exCat ? ' active' : ''), onclick: (e) => { this.exCat = c.id; for (const x of chips.children) x.classList.remove('active'); e.currentTarget.classList.add('active'); draw(); } },
        c.name, h('span', { class: 'chip-n' }, String(n))));
    }
    el.append(h('div', { class: 'page-tools sticky' }, searchBox('Search examples', (v) => { q = v; draw(); }), chips), grid);
    draw();
  }

  pageBoards(el) {
    const list = h('div', { class: 'board-list' });
    for (const t of BOARD_TYPES) {
      const def = getDef(t);
      if (!def) continue;
      const b = def.board || {};
      const specs = [b.mhz && `${b.mhz} MHz`, b.vcc && `${b.vcc} V logic`, b.ram && `${fmtBytes(b.ram)} RAM`, b.flash && `${fmtBytes(b.flash)} flash`].filter(Boolean);
      list.appendChild(h('div', { class: 'board-item' },
        h('div', { class: 'bi-thumb', html: thumbSVG(def) }),
        h('div', { class: 'bi-body' },
          h('b', {}, def.name),
          h('p', {}, def.description || ''),
          h('div', { class: 'bi-specs' }, ...specs.map((s) => h('span', { class: 'tag' }, s))),
          h('button', { class: 'btn btn-primary btn-sm', html: `${icon('plus', 16)}<span>New project</span>`, onclick: () => this.newProject(t) }))));
    }
    el.append(h('p', { class: 'page-intro' }, 'Pick a microcontroller to start a new project. Arduino Uno R3 is the best board for beginners.'), list);
  }

  pageComponents(el) {
    const grid = h('div', { class: 'lib-grid page-grid' });
    const chips = h('div', { class: 'chips-row' });
    let q = '';
    const order = new Map(CATEGORIES.map((c, i) => [c.id, i]));
    const defs = allDefs().filter((d) => !d.hidden && !d.board).sort((a, b) => order.get(a.category) - order.get(b.category));
    const draw = () => {
      grid.innerHTML = '';
      const ql = q.trim().toLowerCase();
      const list = defs.filter((d) => (ql ? (d.name + ' ' + (d.tags || []).join(' ') + ' ' + (d.description || '')).toLowerCase().includes(ql) : this.partCat === 'all' || d.category === this.partCat));
      let last = null;
      for (const d of list) {
        if ((this.partCat === 'all' || ql) && d.category !== last) {
          last = d.category;
          const c = CATEGORIES.find((x) => x.id === d.category);
          grid.appendChild(h('div', { class: 'lib-cat', html: `${icon(c ? c.icon : 'grid', 16)}<span>${c ? c.name : d.category}</span>` }));
        }
        grid.appendChild(h('button', { class: 'lib-card', onclick: () => this.componentInfo(d) },
          h('div', { class: 'lib-thumb', html: thumbSVG(d) }), h('div', { class: 'lib-name' }, d.name)));
      }
      if (!list.length) grid.appendChild(h('div', { class: 'lib-empty', html: `${icon('search', 30)}<p>No components found</p>` }));
    };
    for (const c of [{ id: 'all', name: 'All', icon: 'grid' }, ...CATEGORIES.filter((c) => c.id !== 'boards')]) {
      if (c.id !== 'all' && !defs.some((d) => d.category === c.id)) continue;
      chips.appendChild(h('button', { class: 'chip' + (c.id === this.partCat ? ' active' : ''), html: `${icon(c.icon, 15)}<span>${c.name}</span>`, onclick: (e) => { this.partCat = c.id; for (const x of chips.children) x.classList.remove('active'); e.currentTarget.classList.add('active'); draw(); } }));
    }
    el.append(h('div', { class: 'page-tools sticky' }, searchBox('Search parts (LED, servo, sensor…)', (v) => { q = v; draw(); }), chips), grid);
    draw();
  }

  componentInfo(def) {
    const props = defaultProps(def);
    const pins = pinsOf({ id: 'x', type: def.type, x: 0, y: 0, rot: 0, props });
    const cat = CATEGORIES.find((c) => c.id === def.category);
    const uses = EXAMPLES.filter((e) => e.parts.some((p) => p.type === def.type));
    const content = h('div', { class: 'part-info' },
      h('div', { class: 'pi-thumb', html: thumbSVG(def) }),
      h('div', { class: 'pi-tags' }, cat ? h('span', { class: 'tag', html: `${icon(cat.icon, 13)}<span>${cat.name}</span>` }) : null),
      h('p', { class: 'pi-desc' }, def.description || ''),
      pins.length ? h('div', { class: 'pi-sec' }, h('h4', {}, `Pins (${pins.length})`),
        h('div', { class: 'pi-pins' }, ...[...new Set(pins.map((p) => p.label || p.id))].slice(0, 70).map((n) => h('span', { class: 'pin-chip' }, n)))) : null,
      uses.length ? h('div', { class: 'pi-sec' }, h('h4', {}, 'Examples using this part'),
        ...uses.slice(0, 6).map((ex) => h('button', { class: 'pi-ex', onclick: () => { sheet.close(); this.openExample(ex); } },
          h('span', { html: icon('book', 18) }), h('span', {}, ex.name), h('span', { class: 'c-go', html: icon('forward', 16) })))) : null,
      h('p', { class: 'muted small' }, 'Add it in a project with the ＋ button in the circuit editor.'));
    const sheet = new Sheet({ title: def.name, content, cls: 'sheet-tall', icon: cat ? cat.icon : 'layers' });
    sheet.open();
  }

  pageQuiz(el) { quizPage(el); }

  pageGuide(el) {
    el.appendChild(h('p', { class: 'page-intro' }, 'Learn RaptiAuto in a few minutes. Tap a topic to open it.'));
    const list = h('div', { class: 'guide-list' });
    GUIDE.forEach((g, i) => {
      const d = h('details', { class: 'guide-item' }, h('summary', {},
        h('span', { class: 'gi-ic', html: icon(g.icon, 20) }), h('span', { class: 'gi-title' }, g.title), h('span', { class: 'gi-chev', html: icon('forward', 18) })),
        h('div', { class: 'gi-body', html: g.html }));
      if (i === 0) d.open = true;
      list.appendChild(d);
    });
    el.append(list, h('button', { class: 'rapti-card guide-cta', onclick: () => this.go('examples') },
      h('div', { class: 'rc-logo', html: icon('book', 24) }),
      h('div', { class: 'rc-text' }, h('b', {}, 'Practice with examples'), h('span', {}, `${EXAMPLES.length} ready-made projects to run and modify`)),
      h('span', { class: 'rc-go', html: icon('forward', 20) })));
  }

  pageSettings(el) {
    const s = this.app.settings;
    const save = () => this.app.saveSettings();
    const toggle = (label, sub, get, set, ic) => {
      const tg = h('button', { class: 'toggle' + (get() ? ' on' : ''), 'aria-label': label, onclick: () => { tg.classList.toggle('on'); set(tg.classList.contains('on')); save(); } }, h('span'));
      return h('div', { class: 'set-row' }, h('span', { class: 'set-ic', html: icon(ic, 19) }), h('div', { class: 'set-text' }, h('b', {}, label), h('small', {}, sub)), tg);
    };
    const fsVal = h('b', { class: 'set-val' }, String(s.fontSize));
    const step = (d) => { s.fontSize = Math.max(10, Math.min(24, (s.fontSize || 14) + d)); fsVal.textContent = String(s.fontSize); save(); };
    const group = (title, ...rows) => h('section', { class: 'set-group' }, h('h3', {}, title), h('div', { class: 'card set-card' }, ...rows));
    el.append(
      group('Circuit editor',
        toggle('Show grid', 'Dotted background grid on the canvas', () => s.showGrid, (v) => { s.showGrid = v; }, 'grid'),
        toggle('Current flow animation', 'Moving dots show current in wires while simulating', () => s.flow, (v) => { s.flow = v; }, 'bolt'),
        toggle('Straight wires', 'Draw wires with sharp corners instead of rounded ones', () => s.wireStyle === 'straight', (v) => { s.wireStyle = v ? 'straight' : 'smooth'; }, 'wire')),
      group('Code editor',
        h('div', { class: 'set-row' }, h('span', { class: 'set-ic', html: icon('textSize', 19) }), h('div', { class: 'set-text' }, h('b', {}, 'Font size'), h('small', {}, 'Text size of the Arduino code')),
          h('div', { class: 'stepper' }, h('button', { class: 'icon-btn sm', 'aria-label': 'Smaller', html: icon('minus', 18), onclick: () => step(-1) }), fsVal, h('button', { class: 'icon-btn sm', 'aria-label': 'Bigger', html: icon('plus', 18), onclick: () => step(1) })))),
      group('Landscape & full screen',
        toggle('Side by side in landscape', 'Show circuit and code together when the phone is sideways', () => s.split !== false, (v) => { s.split = v; }, 'columns'),
        toggle('Side by side in full screen', 'Off: one panel at a time. While running, sketches that use Serial show circuit + Serial Monitor together', () => s.splitFs === true, (v) => { s.splitFs = v; }, 'fullscreen')),
      group('Feedback',
        toggle('Sound', 'Play buzzers and speakers during simulation', () => s.sound !== false, (v) => { s.sound = v; }, 'bell'),
        toggle('Vibration', 'Short haptic feedback when wiring and pressing buttons', () => s.haptics !== false, (v) => { s.haptics = v; Native.haptics = v; }, 'hand')),
      group('Data',
        h('button', { class: 'set-row tap', onclick: () => this.go('projects') }, h('span', { class: 'set-ic', html: icon('folder', 19) }), h('div', { class: 'set-text' }, h('b', {}, 'Projects on this phone'), h('small', {}, `${listProjects().length} saved · export them from the project menu`)), h('span', { class: 'c-go', html: icon('forward', 18) })),
        h('button', { class: 'set-row tap danger', onclick: () => this.deleteAll() }, h('span', { class: 'set-ic', html: icon('trash', 19) }), h('div', { class: 'set-text' }, h('b', {}, 'Delete all projects'), h('small', {}, 'Cannot be undone')))),
      h('p', { class: 'muted small center' }, `RaptiAuto v${Native.version()}`));
  }

  pageAbout(el) {
    this.action('globe', 'Visit rapti.net', () => Native.openUrl(RAPTI.website));
    el.appendChild(aboutPage());
  }

  // ---------------------------------------------------------------- Delta PLC lab
  labBanner() {
    return h('section', { class: 'lab-banner', onclick: () => this.go('plclab') },
      h('div', { class: 'lb-art', html: labArt() }),
      h('div', { class: 'lb-content' },
        h('div', { class: 'hero-kicker', html: `${icon('cube', 15)}<span>NEW · Industrial automation</span>` }),
        h('h2', {}, 'Delta PLC Lab ', h('span', { class: 'grad' }, 'in 3D')),
        h('p', {}, 'DVP PLC, DOP-107 HMI and MS300 VFD on a real 3D trainer. Plug in cables, draw ladder, simulate live.'),
        h('div', { class: 'hero-actions' },
          h('button', { class: 'btn btn-primary', html: `${icon('play', 18)}<span>Open the lab</span>`, onclick: (e) => { e.stopPropagation(); this.openLabExample('vfd-modbus-hmi'); } }),
          h('button', { class: 'btn btn-glass', html: `${icon('cpu', 18)}<span>All labs</span>`, onclick: (e) => { e.stopPropagation(); this.go('plclab'); } }))));
  }

  pageLab(el) {
    this.action('upload', 'Open / import file', () => this.importProject());
    this.action('help', 'About the lab', () => this.labInfo());
    el.appendChild(h('section', { class: 'lab-intro' },
      h('div', { class: 'lb-art', html: labArt() }),
      h('div', { class: 'li-text' },
        h('h2', {}, 'Delta automation trainer'),
        h('p', {}, 'Wire a Delta DVP PLC, DOP-107 touch panel and MS300 drive in 3D, program it like ISPSoft and watch the motor turn.'),
        h('div', { class: 'li-feats' }, ...['3D wiring', 'Ladder + IL', 'HMI designer', 'VFD keypad', 'Modbus RTU', 'Live monitor'].map((t) => h('span', { class: 'pill' }, t))),
        h('div', { class: 'hero-actions' },
          h('button', { class: 'btn btn-primary', html: `${icon('plus', 18)}<span>New lab</span>`, onclick: () => this.newLab() }),
          h('button', { class: 'btn btn-glass', html: `${icon('play', 18)}<span>Full demo</span>`, onclick: () => this.openLabExample('vfd-modbus-hmi') })))));
    const labs = listLabs();
    if (labs.length) {
      const list = h('div', { class: 'proj-list' });
      for (const m of labs) list.appendChild(this.labCard(m));
      el.appendChild(h('section', { class: 'home-sec' }, secHead('My labs', `${labs.length} saved on this phone`, 'folder'), list));
    }
    const grid = h('div', { class: 'ex-grid lab-ex-grid' });
    const chips = h('div', { class: 'chips-row' });
    const draw = () => {
      grid.textContent = '';
      for (const ex of LAB_EXAMPLES) {
        if (this.labCat && this.labCat !== 'all' && ex.category !== this.labCat) continue;
        grid.appendChild(h('button', { class: 'ex-card lab-ex', onclick: () => this.openLabExample(ex.id) },
          h('div', { class: 'ex-thumb lab-ex-thumb', html: labExampleArt(ex) }),
          h('div', { class: 'ex-body' },
            h('div', { class: 'ex-tags' }, h('span', { class: 'tag tag-' + ex.level }, ex.level), ...ex.tags.slice(0, 2).map((t) => h('span', { class: 'tag' }, t))),
            h('div', { class: 'ex-name' }, ex.name),
            h('div', { class: 'ex-desc' }, ex.description))));
      }
    };
    for (const c of [{ id: 'all', name: 'All' }, ...LAB_EXAMPLE_CATEGORIES]) {
      const n = c.id === 'all' ? LAB_EXAMPLES.length : LAB_EXAMPLES.filter((e) => e.category === c.id).length;
      if (!n) continue;
      chips.appendChild(h('button', { class: 'chip' + ((this.labCat || 'all') === c.id ? ' active' : ''), onclick: (e) => { this.labCat = c.id; for (const x of chips.children) x.classList.remove('active'); e.currentTarget.classList.add('active'); draw(); } },
        c.name, h('span', { class: 'chip-n' }, String(n))));
    }
    el.appendChild(h('section', { class: 'home-sec' }, secHead('Lab exercises', 'Ready-wired, programmed — press Simulate', 'book'), chips, grid));
    draw();
  }

  /** Card from the saved-lab index (the full lab is only loaded when it is opened). */
  labCard(m) {
    const plcDef = m.plc && DEVICE_DEFS[m.plc];
    const thumb = labThumb(m.id);
    const more = h('button', { class: 'icon-btn sm', 'aria-label': 'More', html: icon('dots', 20), onclick: (e) => { e.stopPropagation(); this.labMenu(e.currentTarget, m); } });
    const img = h('div', { class: 'proj-thumb lab-thumb' });
    if (thumb && /^data:image\/(jpeg|png);base64,/.test(thumb)) img.appendChild(h('img', { src: thumb, alt: '' })); else img.innerHTML = labArt();
    return h('div', { class: 'proj-card', onclick: () => { const p = loadLab(m.id); if (p) this.app.openLab(p); else toast('This lab could not be loaded', 'error'); } },
      img,
      h('div', { class: 'proj-body' },
        h('div', { class: 'proj-name' }, m.name),
        h('div', { class: 'proj-meta' }, `${plcDef ? plcDef.short : 'No PLC'} · ${m.devices || 0} devices · ${m.rungs || 0} networks · ${timeAgo(m.updated || Date.now())}`)),
      more);
  }

  labMenu(anchor, m) {
    const p = loadLab(m.id);
    if (!p) return;
    popupMenu(anchor, [
      { icon: 'edit', label: 'Rename', action: async () => { const n = await promptDialog('Rename lab', p.name); if (n) { p.name = n; saveLab(p); this.render(true); } } },
      { icon: 'copy', label: 'Duplicate', action: () => { const c = cloneLab(p, p.name + ' (copy)'); saveLab(c); this.render(true); toast('Duplicated', 'ok'); } },
      { icon: 'download', label: 'Export (.raptiplc)', action: () => Native.saveFile(p.name.replace(/[^\w\- ]/g, '') + '.raptiplc', 'application/json', exportLab(p)).then((ok) => ok && toast('Exported', 'ok')) },
      '-',
      { icon: 'trash', label: 'Delete', danger: true, action: async () => { if (await confirmDialog('Delete lab?', `"${escapeHtml(p.name)}" will be removed from this phone.`, 'Delete', true)) { deleteLab(p.id); this.render(true); } } },
    ]);
  }

  openLabExample(id) {
    const p = buildExample(id);
    if (!p) return;
    saveLab(p);
    this.app.openLab(p);
  }

  newLab() {
    const content = h('div', { class: 'board-list lab-new' });
    for (const [type, m] of Object.entries(PLC_MODELS)) {
      const def = DEVICE_DEFS[type];
      content.appendChild(h('button', { class: 'board-item', onclick: () => {
        sheet.close();
        const p = buildExample('blank');
        p.name = `${m.short} lab ${listLabs().length + 1}`;
        p.fromExample = null;
        const plc = p.devices.find((d) => d.id === 'plc');
        plc.type = type;
        saveLab(p);
        this.app.openLab(p);
      } },
        h('div', { class: 'bi-thumb', html: plcArt(m) }),
        h('div', { class: 'bi-body' }, h('b', {}, `Delta ${m.short}`), h('p', {}, def.description),
          h('div', { class: 'bi-specs' }, h('span', { class: 'tag' }, `${m.inputs} DI`), h('span', { class: 'tag' }, `${m.outputs} relay DO`), m.ai ? h('span', { class: 'tag' }, `${m.ai} AI / ${m.ao} AO`) : null, h('span', { class: 'tag' }, 'RS-232 · RS-485 · USB')))));
    }
    content.appendChild(h('p', { class: 'muted small' }, 'The new lab starts with the PLC, a Delta 24 V supply, the MCB and the programming laptop already wired. Add the HMI, VFD, motor, buttons and lamps from the ＋ menu.'));
    const sheet = new Sheet({ title: 'Choose a Delta PLC', content, cls: 'sheet-tall', icon: 'cpu' });
    sheet.open();
  }

  labInfo() {
    dialog({
      title: 'Delta PLC Lab',
      body: `<div class="lab-help"><p>A virtual industrial-automation trainer with <b>Delta</b> equipment:</p><ul>
        <li><b>DVP-ES2 / EX2 PLC</b> — X/Y in octal, M, T, C, D, special relays, timers, counters, math, MODRW.</li>
        <li><b>DOP-107BV HMI</b> — buttons, lamps, numeric input, meters, trends; Delta DVP protocol on COM1/COM2.</li>
        <li><b>MS300 VFD</b> — keypad, parameters, MI terminals, AVI, RS-485 Modbus, motor with real ramps.</li></ul>
        <p class="muted">The simulator follows Delta conventions for learning. Always follow the official manuals on real equipment.</p></div>`,
      actions: [{ label: 'OK', value: true, cls: 'btn-primary' }],
    });
  }

  // ---------------------------------------------------------------- cards
  projectCard(p) {
    const def = p.parts && p.parts.map((x) => getDef(x.type)).find((d) => d && d.board);
    const more = h('button', { class: 'icon-btn sm', 'aria-label': 'More', html: icon('dots', 20), onclick: (e) => { e.stopPropagation(); this.projectMenu(e.currentTarget, p); } });
    return h('div', { class: 'proj-card', onclick: () => this.app.openProject(p) },
      h('div', { class: 'proj-thumb', html: projectPreview(p) }),
      h('div', { class: 'proj-body' },
        h('div', { class: 'proj-name' }, p.name),
        h('div', { class: 'proj-meta' }, `${def ? def.name : 'No board'} · ${p.parts.length} parts · ${timeAgo(p.updated || Date.now())}`)),
      more);
  }

  exampleCard(ex) {
    const board = ex.parts.find((p) => getDef(p.type) && getDef(p.type).board);
    return h('button', { class: 'ex-card', onclick: () => this.openExample(ex) },
      h('div', { class: 'ex-thumb', html: projectPreview({ id: 'ex-' + ex.id, ...ex }) }),
      h('div', { class: 'ex-body' },
        h('div', { class: 'ex-tags' },
          h('span', { class: 'tag tag-' + (ex.level || 'beginner') }, ex.level || 'beginner'),
          board ? h('span', { class: 'tag' }, getDef(board.type).name.replace('Arduino ', '')) : null,
          ex.lang === 'python' ? h('span', { class: 'tag tag-py' }, 'MicroPython') : null),
        h('div', { class: 'ex-name' }, ex.name),
        h('div', { class: 'ex-desc' }, ex.description)));
  }

  // ---------------------------------------------------------------- actions
  projectMenu(anchor, p) {
    popupMenu(anchor, [
      { icon: 'edit', label: 'Rename', action: async () => { const n = await promptDialog('Rename project', p.name); if (n) { p.name = n; saveProject(p); this.render(true); } } },
      { icon: 'copy', label: 'Duplicate', action: () => { const c = cloneProject(p, p.name + ' (copy)'); saveProject(c); this.render(true); toast('Duplicated', 'ok'); } },
      { icon: 'download', label: 'Export (.rapti)', action: () => Native.saveFile(p.name.replace(/[^\w\- ]/g, '') + '.rapti', 'application/json', exportJSON(p)).then((ok) => ok && toast('Exported', 'ok')) },
      { icon: 'share', label: 'Share code', action: () => Native.shareText(p.name, p.code) },
      { icon: 'folder', label: p.folder ? `Folder: ${p.folder} — change` : 'Move to folder', action: () => this.moveToFolder(p) },
      '-',
      { icon: 'trash', label: 'Delete', danger: true, action: async () => { if (await confirmDialog('Delete project?', `"${escapeHtml(p.name)}" will be removed from this phone.`, 'Delete', true)) { deleteProject(p.id); this.render(true); } } },
    ]);
  }

  /** Folder picker: existing folders, "No folder" or a new one. */
  async moveToFolder(p) {
    const folders = listFolders();
    const choice = await new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; sheet.close(); resolve(v); };
      const btn = (label, v, active) => h('button', { class: 'chip' + (active ? ' active' : ''), onclick: () => finish(v) }, label);
      const body = h('div', { class: 'folder-pick' }, btn('No folder', '', !p.folder), ...folders.map((f) => btn(f, f, p.folder === f)), btn('＋ New folder…', null, false));
      const sheet = new Sheet({ title: 'Move to folder', content: body, icon: 'folder', onClose: () => { if (!done) { done = true; resolve(undefined); } } });
      sheet.open();
    });
    if (choice === undefined) return;
    let target = choice;
    if (choice === null) {
      const n = await promptDialog('New folder', '');
      if (!n || !n.trim()) return;
      target = addFolder(n);
    }
    setProjectFolder(p.id, target);
    this.render(true);
  }

  async deleteAll() {
    const list = listProjects();
    if (!list.length) { toast('There are no projects'); return; }
    if (!(await confirmDialog('Delete all projects?', `All ${list.length} projects will be removed from this phone. This cannot be undone.`, 'Delete all', true))) return;
    for (const m of list) deleteProject(m.id);
    toast('All projects deleted', 'ok');
    this.render(true);
  }

  async newProject(boardType) {
    if (!boardType) {
      const { openLibrary } = await import('./library.js');
      openLibrary({ boardsOnly: true, title: 'Choose a board', onPick: (def) => this.newProject(def.type) });
      return;
    }
    const def = getDef(boardType);
    const n = listProjects().length + 1;
    let lang = 'cpp';
    if (boardLangs(def.board).length > 1) {
      lang = await dialog({
        title: 'Programming language',
        body: `<p>${escapeHtml(def.name)} can be programmed in Arduino C++ or in MicroPython.</p>`,
        actions: [{ label: 'Arduino C++', value: 'cpp', cls: 'btn-ghost' }, { label: 'MicroPython', value: 'python', cls: 'btn-primary' }],
      });
      if (!lang) return;
    }
    const p = createProject(boardType, `${def.name.replace('Arduino ', '')} project ${n}`, lang);
    if (this.projFolder && this.projFolder !== '*' && this.projFolder !== '-') p.folder = this.projFolder;
    saveProject(p);
    this.app.openProject(p);
  }

  openExample(ex) {
    const p = cloneProject({ ...ex, parts: ex.parts, wires: ex.wires }, ex.name);
    p.fromExample = ex.id;
    saveProject(p);
    this.app.openProject(p);
  }

  async importProject() {
    const f = await Native.openFile('.rapti,.raptiplc,.json,.ino,.txt');
    if (!f || !f.text) return;
    try {
      let p;
      if (/raptiauto-plclab/.test(f.text.slice(0, 200)) || /\.raptiplc$/i.test(f.name || '')) {
        const lab = importLab(f.text);
        saveLab(lab);
        toast('PLC lab imported', 'ok');
        this.app.openLab(lab);
        return;
      }
      if (/\.ino$|\.txt$/i.test(f.name || '') || !f.text.trim().startsWith('{')) {
        p = createProject('uno-r3', (f.name || 'Imported sketch').replace(/\.\w+$/, ''));
        p.code = f.text;
      } else p = importJSON(f.text);
      saveProject(p);
      toast('Project imported', 'ok');
      this.app.openProject(p);
    } catch (e) {
      toast('Could not import: ' + e.message, 'error');
    }
  }
}

function partCount() { return allDefs().filter((d) => !d.board && !d.hidden).length; }
function fmtBytes(n) { return n >= 1048576 ? `${Math.round(n / 1048576)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`; }
function searchBox(placeholder, onInput) {
  const inp = h('input', { class: 'input', type: 'search', placeholder, autocomplete: 'off' });
  inp.addEventListener('input', () => onInput(inp.value));
  return h('div', { class: 'search-box', html: icon('search', 18) }, inp);
}
function secHead(title, sub, ic, more) {
  return h('div', { class: 'sec-head' }, h('span', { class: 'sec-ic', html: icon(ic, 18) }), h('div', { class: 'grow' }, h('h2', {}, title), h('p', {}, sub)),
    more ? h('button', { class: 'see-all', onclick: more, html: `<span>See all</span>${icon('forward', 16)}` }) : null);
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function heroArt() {
  // animated circuit traces
  return `<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice">
  <defs><linearGradient id="hg1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#22d3ee" stop-opacity="0"/><stop offset=".5" stop-color="#22d3ee"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/></linearGradient></defs>
  <g fill="none" stroke="rgba(148,163,184,.13)" stroke-width="2">
    <path d="M-10 60 H120 L150 90 H260 L290 60 H420"/><path d="M-10 200 H90 L120 170 H230 L260 200 H420"/>
    <path d="M200 -10 V40 L230 70 V130"/><path d="M330 270 V210 L300 180 V140"/><path d="M60 270 V230 L90 200"/>
  </g>
  <g fill="none" stroke="url(#hg1)" stroke-width="2.4" stroke-linecap="round" class="hero-flow">
    <path d="M-10 60 H120 L150 90 H260 L290 60 H420" stroke-dasharray="40 360"/>
    <path d="M-10 200 H90 L120 170 H230 L260 200 H420" stroke-dasharray="40 360" style="animation-delay:-1.4s"/>
    <path d="M200 -10 V40 L230 70 V130" stroke-dasharray="30 200" style="animation-delay:-.6s"/>
  </g>
  <g fill="#22d3ee"><circle cx="150" cy="90" r="3.5"/><circle cx="260" cy="90" r="3.5"/><circle cx="120" cy="170" r="3.5"/><circle cx="230" cy="70" r="3.5"/><circle cx="300" cy="180" r="3.5"/></g>
  <g class="hero-leds"><circle cx="330" cy="110" r="9" fill="#ef4444"/><circle cx="355" cy="110" r="9" fill="#eab308"/><circle cx="380" cy="110" r="9" fill="#22c55e"/></g>
</svg>`;
}

/** Stylised Delta PLC + HMI + VFD illustration (SVG). */
function labArt() {
  return `<svg viewBox="0 0 320 190" preserveAspectRatio="xMidYMid meet" class="lab-art">
  <defs>
    <linearGradient id="la-pl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dee3"/><stop offset="1" stop-color="#b9c0c8"/></linearGradient>
    <linearGradient id="la-vf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3f48"/><stop offset="1" stop-color="#23262c"/></linearGradient>
    <linearGradient id="la-hm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16223f"/><stop offset="1" stop-color="#0b1226"/></linearGradient>
    <linearGradient id="la-mo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f78ad"/><stop offset="1" stop-color="#2d4a72"/></linearGradient>
  </defs>
  <rect x="18" y="10" width="200" height="150" rx="8" fill="url(#la-pl)" opacity=".95"/>
  <rect x="26" y="40" width="184" height="6" rx="2" fill="#9aa3ad"/><rect x="26" y="112" width="184" height="6" rx="2" fill="#9aa3ad"/>
  <g transform="translate(34 18)"><rect width="74" height="50" rx="4" fill="#eef0ec"/><rect y="0" width="74" height="11" rx="2" fill="#2b2f36"/><rect y="39" width="74" height="11" rx="2" fill="#2b2f36"/>
    <g fill="#c7ccd3">${Array.from({ length: 9 }, (_, i) => `<circle cx="${5 + i * 8}" cy="5.5" r="2"/><circle cx="${5 + i * 8}" cy="44.5" r="2"/>`).join('')}</g>
    <g>${Array.from({ length: 8 }, (_, i) => `<rect x="${30 + i * 5}" y="17" width="3" height="2" fill="${i % 3 === 0 ? '#22e06a' : '#9fb0a6'}"/><rect x="${30 + i * 5}" y="24" width="3" height="2" fill="${i % 4 === 1 ? '#ffb020' : '#b5a88f'}"/>`).join('')}</g>
    <text x="70" y="35" font-size="6" font-weight="800" fill="#1d4f9c" text-anchor="end" font-family="Space Grotesk, sans-serif">▲ DELTA</text></g>
  <g transform="translate(150 66)"><rect width="52" height="88" rx="4" fill="url(#la-vf)"/><rect x="7" y="9" width="38" height="13" rx="2" fill="#120404"/>
    <text x="26" y="19.5" font-size="10" fill="#ff3b2f" text-anchor="middle" font-family="JetBrains Mono, monospace" font-weight="700">50.00</text>
    <rect x="9" y="30" width="10" height="6" rx="1.5" fill="#4a505b"/><rect x="21" y="30" width="10" height="6" rx="1.5" fill="#4a505b"/><rect x="33" y="30" width="10" height="6" rx="1.5" fill="#4a505b"/>
    <rect x="9" y="41" width="15" height="6" rx="1.5" fill="#15803d"/><rect x="28" y="41" width="15" height="6" rx="1.5" fill="#b91c1c"/>
    <rect x="5" y="58" width="42" height="9" rx="1" fill="#111"/><rect x="5" y="72" width="42" height="9" rx="1" fill="#111"/></g>
  <g transform="translate(206 92) rotate(-4)"><rect width="104" height="72" rx="6" fill="#1a1d22"/><rect x="6" y="6" width="92" height="55" rx="2" fill="url(#la-hm)"/>
    <path d="M24 46a16 16 0 0 1 32 0" fill="none" stroke="#1e293b" stroke-width="5"/><path d="M24 46a16 16 0 0 1 26-12" fill="none" stroke="#22d3ee" stroke-width="5"/>
    <rect x="62" y="16" width="28" height="11" rx="2.5" fill="#22c55e"/><rect x="62" y="31" width="28" height="11" rx="2.5" fill="#ef4444"/>
    <text x="12" y="17" font-size="6" fill="#e2e8f0" font-weight="700" font-family="Inter, sans-serif">SPEED</text>
    <text x="10" y="68" font-size="4.5" fill="#e8eef9" font-weight="800" font-family="Space Grotesk, sans-serif">▲ DELTA</text></g>
  <g transform="translate(36 128)"><rect x="0" y="8" width="88" height="44" rx="20" fill="url(#la-mo)"/><rect x="84" y="24" width="18" height="10" rx="2" fill="#b9c0c7"/>
    <circle cx="104" cy="29" r="12" fill="#dc2626"/><path d="M104 17v24M92 29h24" stroke="#f8fafc" stroke-width="3"/><rect x="28" y="0" width="30" height="12" rx="2" fill="#3a5a88"/></g>
  <path d="M71 68C80 100 130 80 176 120" fill="none" stroke="#f97316" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M100 68C120 120 200 70 228 110" fill="none" stroke="#64748b" stroke-width="3" stroke-linecap="round"/>
  <path d="M176 154c-10 20-60 14-70 4" fill="none" stroke="#111827" stroke-width="3" stroke-linecap="round"/>
</svg>`;
}

function labExampleArt(ex) {
  if (ex.id === 'vfd-modbus-hmi' || ex.id === 'blank' || ex.id === 'tank-level') return labArt();
  const lamps = {
    'start-stop': ['#22c55e', '#ef4444'], 'traffic-light': ['#ef4444', '#f59e0b', '#22c55e'], 'part-counter': ['#f59e0b'], 'vfd-terminals': ['#22c55e', '#f59e0b'], 'analog-speed': [],
    'star-delta': ['#22c55e', '#f59e0b', '#ef4444'], 'bottle-filling': ['#f59e0b', '#22c55e'], 'alarm-annunciator': ['#ef4444', '#f59e0b'], 'step-lights': ['#22c55e', '#f59e0b', '#ef4444'], 'vfd-auto-cycle': ['#22c55e'],
  }[ex.id] || [];
  const btns = {
    'start-stop': ['#1fa34a', '#d62828'], 'traffic-light': [], 'part-counter': ['#1f5fd6'], 'vfd-terminals': ['#1fa34a', '#f2b705', '#d62828'], 'analog-speed': ['#1fa34a', '#d62828'],
    'star-delta': ['#1fa34a', '#d62828'], 'bottle-filling': ['#1fa34a', '#d62828', '#1f5fd6'], 'alarm-annunciator': ['#1f5fd6'], 'step-lights': ['#1fa34a', '#d62828'], 'vfd-auto-cycle': ['#1fa34a', '#d62828'],
  }[ex.id] || [];
  const items = [...btns.map((c) => ({ c, t: 'b' })), ...lamps.map((c) => ({ c, t: 'l' }))];
  const vfd = /vfd|analog/.test(ex.id);
  return `<svg viewBox="0 0 320 190" preserveAspectRatio="xMidYMid meet">
    <rect x="16" y="14" width="${vfd ? 200 : 150}" height="78" rx="8" fill="#cfd4d9"/>
    <g transform="translate(28 24)"><rect width="74" height="50" rx="4" fill="#eef0ec"/><rect width="74" height="11" rx="2" fill="#2b2f36"/><rect y="39" width="74" height="11" rx="2" fill="#2b2f36"/>
    <text x="70" y="33" font-size="6" font-weight="800" fill="#1d4f9c" text-anchor="end" font-family="Space Grotesk, sans-serif">▲ DELTA</text></g>
    ${vfd ? `<g transform="translate(150 20)"><rect width="52" height="66" rx="4" fill="#2a2d33"/><rect x="7" y="8" width="38" height="12" rx="2" fill="#120404"/><text x="26" y="17.6" font-size="9" fill="#ff3b2f" text-anchor="middle" font-family="JetBrains Mono, monospace" font-weight="700">${ex.id === 'analog-speed' ? '30.00' : '45.00'}</text></g>
    <g transform="translate(220 40)"><rect y="6" width="70" height="38" rx="17" fill="#3a5a88"/><circle cx="80" cy="25" r="11" fill="#dc2626"/></g>` : ''}
    ${ex.id === 'part-counter' ? `<g transform="translate(184 18)"><rect width="110" height="74" rx="6" fill="#1a1d22"/><rect x="6" y="6" width="98" height="56" rx="2" fill="#0b1630"/><text x="55" y="40" font-size="20" fill="#f8fafc" text-anchor="middle" font-family="JetBrains Mono, monospace">05</text></g>` : ''}
    <path d="M8 178 L40 112 H280 L312 178Z" fill="#c9cdc9"/>
    ${items.map((it, i) => { const x = 160 + (i - (items.length - 1) / 2) * 50; return `<g transform="translate(${x} 146)"><rect x="-20" y="-26" width="40" height="50" rx="4" fill="#252b35"/>${it.t === 'b' ? `<circle r="12" fill="#e6e9ee"/><circle r="9.5" fill="${it.c}"/>` : `<circle r="16" fill="${it.c}" opacity=".35"/><circle r="10" fill="${it.c}"/>`}</g>`; }).join('')}
  </svg>`;
}

function plcArt(m) {
  const w = m.inputs > 8 ? 150 : 120;
  return `<svg viewBox="0 0 ${w + 10} 100"><g transform="translate(5 5)"><rect width="${w}" height="90" rx="5" fill="#e8eae6"/><rect width="${w}" height="20" rx="3" fill="#2b2f36"/><rect y="70" width="${w}" height="20" rx="3" fill="#2b2f36"/>
    <rect x="6" y="28" width="22" height="34" rx="3" fill="#16181c"/>
    ${Array.from({ length: m.inputs }, (_, i) => `<rect x="${40 + i * ((w - 50) / m.inputs)}" y="32" width="3" height="2.4" fill="#22e06a"/>`).join('')}
    ${Array.from({ length: m.outputs }, (_, i) => `<rect x="${40 + i * ((w - 50) / m.inputs)}" y="42" width="3" height="2.4" fill="#ffb020"/>`).join('')}
    <text x="${w - 6}" y="60" font-size="9" font-weight="800" fill="#1d4f9c" text-anchor="end" font-family="Space Grotesk, sans-serif">▲ DELTA</text>
    <text x="${w - 6}" y="66" font-size="5.5" font-weight="700" fill="#374151" text-anchor="end" font-family="Inter, sans-serif">${m.short}</text></g></svg>`;
}
