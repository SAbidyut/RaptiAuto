// App shell: top bar with the ☰ menu, side drawer, bottom navigation and the menu pages
// (Home, My Projects, Examples, Boards, Components, Guide, Settings, About RAPTI).
import { getDef, allDefs, CATEGORIES, pinsOf, defaultProps } from '../components/registry.js';
import { BOARD_TYPES } from '../components/boards.js';
import { listProjects, loadProject, deleteProject, createProject, cloneProject, saveProject, importJSON, exportJSON } from '../store.js';
import { EXAMPLES, EXAMPLE_CATEGORIES } from '../examples/index.js';
import { h, toast, popupMenu, confirmDialog, promptDialog, timeAgo, pushBack, Sheet } from './widgets.js';
import { icon } from './icons.js';
import { thumbSVG } from './library.js';
import { projectPreview } from './preview.js';
import { logoMark, wordmark } from './brand.js';
import { aboutPage, RAPTI } from './about.js';
import { GUIDE } from './guide.js';
import { Native } from '../native.js';

export const PAGES = {
  home: { title: 'Home', icon: 'home' },
  projects: { title: 'My Projects', icon: 'folder' },
  examples: { title: 'Examples', icon: 'book' },
  boards: { title: 'Boards', icon: 'chip' },
  components: { title: 'Components', icon: 'layers' },
  guide: { title: 'Guide', icon: 'help' },
  settings: { title: 'Settings', icon: 'settings' },
  about: { title: 'About RAPTI', icon: 'graduation' },
};
const TABS = [['home', 'Home'], ['projects', 'Projects'], ['examples', 'Examples'], ['components', 'Parts']];

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
    const fill = { home: this.pageHome, projects: this.pageProjects, examples: this.pageExamples, boards: this.pageBoards, components: this.pageComponents, guide: this.pageGuide, settings: this.pageSettings, about: this.pageAbout }[this.page];
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
        h('div', { class: 'dr-brand', html: `${logoMark(52, 'dr')}<div>${wordmark()}<small>Arduino & electronics simulator</small></div>` }),
        h('button', { class: 'dr-new', html: `${icon('plus', 19)}<span>New Project</span>`, onclick: () => { this.closeDrawer(); this.newProject(); } })),
      h('nav', { class: 'dr-list' },
        group('Workspace'),
        item('home', 'Home', 'home'),
        item('projects', 'My Projects', 'folder', h('span', { class: 'dr-count' })),
        item('examples', 'Examples', 'book', h('span', { class: 'dr-count' }, String(EXAMPLES.length))),
        act('Open / import file', 'upload', () => this.importProject()),
        group('Library'),
        item('boards', 'Boards', 'chip', h('span', { class: 'dr-count' }, String(BOARD_TYPES.length))),
        item('components', 'Components', 'layers', h('span', { class: 'dr-count' }, String(partCount()))),
        group('Help'),
        item('guide', 'Guide — how to use', 'help'),
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

    const tile = (page, label, sub, ic, tone, fn) => h('button', { class: 'qa-tile tone-' + tone, onclick: fn || (() => this.go(page)) },
      h('span', { class: 'qa-ic', html: icon(ic, 22) }), h('b', {}, label), h('small', {}, sub));
    el.appendChild(h('section', { class: 'home-sec' }, secHead('Menu', 'Everything in RaptiAuto', 'grid'),
      h('div', { class: 'qa-grid' },
        tile('projects', 'My Projects', `${listProjects().length} saved`, 'folder', 'cyan'),
        tile('examples', 'Examples', `${EXAMPLES.length} projects`, 'book', 'violet'),
        tile('boards', 'Boards', `${BOARD_TYPES.length} boards`, 'chip', 'blue'),
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
    const draw = (q = '') => {
      list.innerHTML = '';
      const ql = q.trim().toLowerCase();
      const shown = projects.filter((p) => !ql || p.name.toLowerCase().includes(ql));
      for (const p of shown) list.appendChild(this.projectCard(p));
      if (!shown.length) list.appendChild(h('p', { class: 'muted center' }, 'No matching projects'));
    };
    el.append(h('div', { class: 'page-tools' }, search, h('div', { class: 'muted small' }, `${projects.length} project${projects.length === 1 ? '' : 's'} on this phone`)), list);
    this.extras.push(h('button', { class: 'fab fab-page', 'aria-label': 'New project', html: icon('plus', 26), onclick: () => this.newProject() }));
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
        toggle('Side by side in full screen', 'Off: one panel at a time. While running, circuit + Serial Monitor always show together', () => s.splitFs === true, (v) => { s.splitFs = v; }, 'fullscreen')),
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
          board ? h('span', { class: 'tag' }, getDef(board.type).name.replace('Arduino ', '')) : null),
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
      '-',
      { icon: 'trash', label: 'Delete', danger: true, action: async () => { if (await confirmDialog('Delete project?', `"${escapeHtml(p.name)}" will be removed from this phone.`, 'Delete', true)) { deleteProject(p.id); this.render(true); } } },
    ]);
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
    const p = createProject(boardType, `${def.name.replace('Arduino ', '')} project ${n}`);
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
    const f = await Native.openFile('.rapti,.json,.ino,.txt');
    if (!f || !f.text) return;
    try {
      let p;
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
