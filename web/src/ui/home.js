// Home screen: hero, quick board picker, my projects, example gallery.
import { getDef, allDefs } from '../components/registry.js';
import { BOARD_TYPES } from '../components/boards.js';
import { listProjects, loadProject, deleteProject, createProject, cloneProject, saveProject, importJSON, exportJSON } from '../store.js';
import { EXAMPLES, EXAMPLE_CATEGORIES } from '../examples/index.js';
import { h, toast, popupMenu, confirmDialog, promptDialog, timeAgo } from './widgets.js';
import { icon } from './icons.js';
import { thumbSVG } from './library.js';
import { projectPreview } from './preview.js';
import { logoMark, wordmark } from './brand.js';
import { Native } from '../native.js';

export class Home {
  constructor(app) {
    this.app = app;
    this.exCat = 'all';
    this.root = h('div', { class: 'screen home' });
    this.render();
  }

  mount(parent) { parent.appendChild(this.root); this.refreshProjects(); }
  unmount() { this.root.remove(); }

  render() {
    const r = this.root;
    r.innerHTML = '';
    const header = h('header', { class: 'home-top' },
      h('div', { class: 'brand', html: `${logoMark(38)}${wordmark()}` }),
      h('div', { class: 'grow' }),
      h('button', { class: 'icon-btn', 'aria-label': 'Import project', html: icon('upload'), onclick: () => this.importProject() }),
      h('button', { class: 'icon-btn', 'aria-label': 'About', html: icon('info'), onclick: () => this.app.showAbout() }));

    const parts = allDefs().filter((d) => !d.board && !d.hidden).length;
    const hero = h('section', { class: 'hero' },
      h('div', { class: 'hero-bg', html: heroArt() }),
      h('div', { class: 'hero-content' },
        h('div', { class: 'hero-kicker', html: `${icon('sparkles', 15)}<span>Arduino · ESP32 · Electronics</span>` }),
        h('h1', {}, 'Build circuits.', h('br'), h('span', { class: 'grad' }, 'Code. Simulate.')),
        h('p', {}, 'Wire real components on a breadboard, write Arduino code and watch it come alive — right on your phone.'),
        h('div', { class: 'hero-actions' },
          h('button', { class: 'btn btn-primary btn-lg', html: `${icon('plus', 20)}<span>New Project</span>`, onclick: () => this.newProject() }),
          h('button', { class: 'btn btn-glass btn-lg', html: `${icon('book', 19)}<span>Examples</span>`, onclick: () => this.root.querySelector('#examples').scrollIntoView({ behavior: 'smooth' }) })),
        h('div', { class: 'hero-stats' },
          stat(BOARD_TYPES.length, 'Boards'), stat(parts + '+', 'Components'), stat(EXAMPLES.length, 'Examples'))));

    // boards
    const boards = h('div', { class: 'board-row' });
    for (const t of BOARD_TYPES) {
      const def = getDef(t);
      if (!def) continue;
      boards.appendChild(h('button', { class: 'board-card', onclick: () => this.newProject(t) },
        h('div', { class: 'board-thumb', html: thumbSVG(def) }),
        h('div', { class: 'board-name' }, def.name),
        h('div', { class: 'board-meta' }, `${def.board.mhz} MHz · ${def.board.vcc}V`)));
    }

    this.projWrap = h('div', { class: 'proj-list' });
    const exWrap = h('div', { class: 'ex-grid' });
    const exChips = h('div', { class: 'chips-row' });
    for (const c of [{ id: 'all', name: 'All' }, ...EXAMPLE_CATEGORIES]) {
      exChips.appendChild(h('button', { class: 'chip' + (c.id === this.exCat ? ' active' : ''), onclick: (e) => { this.exCat = c.id; for (const x of exChips.children) x.classList.remove('active'); e.currentTarget.classList.add('active'); this.renderExamples(exWrap); } }, c.name));
    }

    r.append(header, h('div', { class: 'home-scroll' },
      hero,
      h('section', { class: 'home-sec' }, secHead('Start with a board', 'Pick a microcontroller to create a new project', 'chip'), boards),
      h('section', { class: 'home-sec' }, secHead('My Projects', 'Saved on this phone', 'folder'), this.projWrap),
      h('section', { class: 'home-sec', id: 'examples' }, secHead('Example Projects', 'Open, run and learn — then modify!', 'book'), exChips, exWrap),
      h('footer', { class: 'home-foot' },
        h('button', { class: 'rapti-card', onclick: () => this.app.showAbout() },
          h('div', { class: 'rc-logo', html: icon('graduation', 26) }),
          h('div', { class: 'rc-text' }, h('b', {}, 'RAPTI'), h('span', {}, 'Resonance Automation Professional Training Institute')),
          h('span', { class: 'rc-go', html: icon('forward', 20) })),
        h('p', { class: 'muted small center' }, `RaptiAuto v${Native.version()} · Made in Bangladesh 🇧🇩`))));
    this.renderExamples(exWrap);
  }

  renderExamples(wrap) {
    wrap.innerHTML = '';
    const list = EXAMPLES.filter((e) => this.exCat === 'all' || e.category === this.exCat);
    for (const ex of list) {
      const board = ex.parts.find((p) => getDef(p.type) && getDef(p.type).board);
      const card = h('button', { class: 'ex-card', onclick: () => this.openExample(ex) },
        h('div', { class: 'ex-thumb', html: projectPreview({ id: 'ex-' + ex.id, ...ex }) }),
        h('div', { class: 'ex-body' },
          h('div', { class: 'ex-tags' },
            h('span', { class: 'tag tag-' + (ex.level || 'beginner') }, ex.level || 'beginner'),
            board ? h('span', { class: 'tag' }, getDef(board.type).name.replace('Arduino ', '')) : null),
          h('div', { class: 'ex-name' }, ex.name),
          h('div', { class: 'ex-desc' }, ex.description)));
      wrap.appendChild(card);
    }
  }

  refreshProjects() {
    const wrap = this.projWrap;
    if (!wrap) return;
    wrap.innerHTML = '';
    const list = listProjects();
    if (!list.length) {
      wrap.appendChild(h('div', { class: 'empty-card' },
        h('div', { class: 'empty-ic', html: icon('folder', 30) }),
        h('div', {}, h('b', {}, 'No projects yet'), h('p', {}, 'Create a new project or open an example to get started.')),
        h('button', { class: 'btn btn-primary', html: `${icon('plus', 18)}<span>Create</span>`, onclick: () => this.newProject() })));
      return;
    }
    for (const meta of list.slice(0, 50)) {
      const p = loadProject(meta.id);
      if (!p) continue;
      const def = meta.board && getDef(meta.board);
      const more = h('button', { class: 'icon-btn sm', 'aria-label': 'More', html: icon('dots', 20), onclick: (e) => { e.stopPropagation(); this.projectMenu(e.currentTarget, p); } });
      wrap.appendChild(h('div', { class: 'proj-card', onclick: () => this.app.openProject(p) },
        h('div', { class: 'proj-thumb', html: projectPreview(p) }),
        h('div', { class: 'proj-body' },
          h('div', { class: 'proj-name' }, p.name),
          h('div', { class: 'proj-meta' }, `${def ? def.name : 'No board'} · ${p.parts.length} parts · ${timeAgo(p.updated || Date.now())}`)),
        more));
    }
  }

  projectMenu(anchor, p) {
    popupMenu(anchor, [
      { icon: 'edit', label: 'Rename', action: async () => { const n = await promptDialog('Rename project', p.name); if (n) { p.name = n; saveProject(p); this.refreshProjects(); } } },
      { icon: 'copy', label: 'Duplicate', action: () => { const c = cloneProject(p, p.name + ' (copy)'); saveProject(c); this.refreshProjects(); toast('Duplicated', 'ok'); } },
      { icon: 'download', label: 'Export (.rapti)', action: () => Native.saveFile(p.name.replace(/[^\w\- ]/g, '') + '.rapti', 'application/json', exportJSON(p)).then((ok) => ok && toast('Exported', 'ok')) },
      { icon: 'share', label: 'Share code', action: () => Native.shareText(p.name, p.code) },
      '-',
      { icon: 'trash', label: 'Delete', danger: true, action: async () => { if (await confirmDialog('Delete project?', `"${escapeHtml(p.name)}" will be removed from this phone.`, 'Delete', true)) { deleteProject(p.id); this.refreshProjects(); } } },
    ]);
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

function stat(n, label) { return h('div', { class: 'stat' }, h('b', {}, String(n)), h('span', {}, label)); }
function secHead(title, sub, ic) {
  return h('div', { class: 'sec-head' }, h('span', { class: 'sec-ic', html: icon(ic, 18) }), h('div', {}, h('h2', {}, title), h('p', {}, sub)));
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
