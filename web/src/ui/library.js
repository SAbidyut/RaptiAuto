// Component library bottom sheet with search, categories and live thumbnails.
import { allDefs, CATEGORIES, defaultProps, boxOf } from '../components/registry.js';
import { h, Sheet } from './widgets.js';
import { icon } from './icons.js';

const thumbCache = new Map();
export function thumbSVG(def, props = defaultProps(def)) {
  const key = def.type + JSON.stringify(props);
  if (thumbCache.has(key)) return thumbCache.get(key);
  const b = typeof def.box === 'function' ? def.box(props) : def.box;
  const pad = 6;
  const vb = `${b[0] - pad} ${b[1] - pad} ${b[2] - b[0] + pad * 2} ${b[3] - b[1] + pad * 2}`;
  let inner;
  try { inner = def.render(props); } catch (e) { inner = ''; }
  const s = `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet" class="thumb-svg">${inner}</svg>`;
  thumbCache.set(key, s);
  return s;
}

export function openLibrary({ onPick, boardsOnly = false, noBoards = false, title = 'Add component' }) {
  const content = h('div', { class: 'lib' });
  const search = h('input', { class: 'input lib-search', placeholder: 'Search components (LED, servo, sensor…)', type: 'search', autocomplete: 'off' });
  const searchRow = h('div', { class: 'lib-search-row', html: icon('search', 18) }, search);
  const chips = h('div', { class: 'lib-chips' });
  const grid = h('div', { class: 'lib-grid' });
  let cat = boardsOnly ? 'boards' : 'all';
  const cats = boardsOnly ? CATEGORIES.filter((c) => c.id === 'boards') : [{ id: 'all', name: 'All', icon: 'grid' }, ...CATEGORIES.filter((c) => !noBoards || c.id !== 'boards')];
  for (const c of cats) {
    const chip = h('button', { class: 'chip' + (c.id === cat ? ' active' : ''), html: `${icon(c.icon, 15)}<span>${c.name}</span>`, onclick: () => { cat = c.id; for (const x of chips.children) x.classList.toggle('active', x === chip); draw(); } });
    chips.appendChild(chip);
  }
  if (!boardsOnly) content.append(searchRow, chips);
  content.append(grid);

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    grid.innerHTML = '';
    let defs = allDefs().filter((d) => !d.hidden);
    if (boardsOnly) defs = defs.filter((d) => d.board);
    else if (noBoards) defs = defs.filter((d) => !d.board);
    else if (cat !== 'all' && !q) defs = defs.filter((d) => d.category === cat);
    if (q) defs = defs.filter((d) => (d.name + ' ' + (d.tags || []).join(' ') + ' ' + (d.description || '') + ' ' + d.category).toLowerCase().includes(q));
    const order = new Map(CATEGORIES.map((c, i) => [c.id, i]));
    defs.sort((a, b) => (order.get(a.category) - order.get(b.category)) || 0);
    let lastCat = null;
    for (const d of defs) {
      if ((cat === 'all' || q) && d.category !== lastCat) {
        lastCat = d.category;
        const c = CATEGORIES.find((x) => x.id === d.category);
        grid.appendChild(h('div', { class: 'lib-cat', html: `${icon(c ? c.icon : 'grid', 16)}<span>${c ? c.name : d.category}</span>` }));
      }
      const card = h('button', { class: 'lib-card', onclick: () => { sheet.close(); onPick(d); } },
        h('div', { class: 'lib-thumb', html: thumbSVG(d) }),
        h('div', { class: 'lib-name' }, d.name),
        d.board ? h('div', { class: 'lib-sub' }, d.description.split('·')[0]) : null);
      grid.appendChild(card);
    }
    if (!grid.children.length) grid.appendChild(h('div', { class: 'lib-empty', html: `${icon('search', 30)}<p>No components found</p>` }));
  };
  search.addEventListener('input', draw);
  const sheet = new Sheet({ title, content, cls: 'sheet-tall', icon: boardsOnly ? 'chip' : 'plus' });
  sheet.open();
  draw();
  return sheet;
}
