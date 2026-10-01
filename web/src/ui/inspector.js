// Part properties sheet, wire sheet and simulation control sheet.
import { getDef, partProps, pinsOf, fmtOhms, parseOhms, CATEGORIES } from '../components/registry.js';
import { h, Sheet } from './widgets.js';
import { icon } from './icons.js';
import { thumbSVG } from './library.js';
import { WIRE_COLORS } from './canvas.js';

export function openPartProps(ed, part) {
  const def = getDef(part.type);
  const props = partProps(part);
  const content = h('div', { class: 'props' });
  const cat = CATEGORIES.find((c) => c.id === def.category);
  content.appendChild(h('div', { class: 'props-head' },
    h('div', { class: 'props-thumb', html: thumbSVG(def, props) }),
    h('div', { class: 'props-info' },
      h('div', { class: 'props-cat' }, cat ? cat.name : ''),
      h('div', { class: 'props-desc' }, def.description || ''))));

  const apply = (key, val) => {
    part.props = { ...(part.props || {}), [key]: val };
    ed.commit('Change ' + key);
    head.innerHTML = thumbSVG(def, partProps(part));
  };
  const head = content.querySelector('.props-thumb');

  for (const pr of def.props) {
    const row = h('div', { class: 'field' }, h('label', {}, pr.label));
    const cur = props[pr.key];
    if (pr.type === 'select') {
      const seg = h('div', { class: 'opt-grid' });
      for (const [val, label] of pr.options) {
        const b = h('button', { class: 'opt' + (String(cur) === String(val) ? ' active' : ''), onclick: () => { for (const x of seg.children) x.classList.remove('active'); b.classList.add('active'); apply(pr.key, val); } });
        if (pr.key === 'color' && /^[a-z]+$/.test(val)) b.innerHTML = `<i class="swatch sw-${val}"></i>${label}`;
        else b.textContent = label;
        seg.appendChild(b);
      }
      row.appendChild(seg);
    } else if (pr.type === 'resistance') {
      const inp = h('input', { class: 'input', value: fmtOhms(cur), inputmode: 'text' });
      const commit = () => { const v = parseOhms(inp.value.replace('Ω', '')); if (v > 0) { apply(pr.key, v); inp.value = fmtOhms(v); } else inp.value = fmtOhms(partProps(part)[pr.key]); };
      inp.addEventListener('change', commit);
      const presets = h('div', { class: 'opt-grid compact' });
      for (const v of pr.presets || []) presets.appendChild(h('button', { class: 'opt' + (v === cur ? ' active' : ''), onclick: (e) => { for (const x of presets.children) x.classList.remove('active'); e.currentTarget.classList.add('active'); inp.value = fmtOhms(v); apply(pr.key, v); } }, fmtOhms(v)));
      row.append(inp, presets);
    } else if (pr.type === 'number') {
      const inp = h('input', { class: 'input', type: 'number', value: cur, min: pr.min, max: pr.max, step: pr.step || 'any' });
      inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (Number.isFinite(v)) apply(pr.key, v); });
      row.appendChild(h('div', { class: 'input-unit' }, inp, pr.unit ? h('span', {}, pr.unit) : null));
    } else if (pr.type === 'bool') {
      const tg = h('button', { class: 'toggle' + (cur ? ' on' : ''), onclick: () => { tg.classList.toggle('on'); apply(pr.key, tg.classList.contains('on')); } }, h('span'));
      row.appendChild(tg);
    } else {
      const inp = h(pr.multiline ? 'textarea' : 'input', { class: 'input', value: cur ?? '' });
      if (pr.multiline) inp.value = cur ?? '';
      inp.addEventListener('change', () => apply(pr.key, inp.value));
      row.appendChild(inp);
    }
    if (pr.help) row.appendChild(h('small', { class: 'field-help' }, pr.help));
    content.appendChild(row);
  }

  // pins
  const pins = pinsOf(part);
  if (!def.connectorOnly && pins.length <= 80) {
    const pinBox = h('div', { class: 'pin-list' });
    for (const p of pins) pinBox.appendChild(h('span', { class: 'pin-chip' }, p.label && p.label !== p.id ? `${p.id} · ${p.label}` : p.id));
    content.append(h('div', { class: 'field' }, h('label', {}, `Pins (${pins.length})`), pinBox));
  }
  const actions = h('div', { class: 'props-actions' },
    h('button', { class: 'btn btn-ghost', html: `${icon('rotate', 18)}<span>Rotate</span>`, onclick: () => ed.rotateSelected() }),
    h('button', { class: 'btn btn-ghost', html: `${icon('copy', 18)}<span>Duplicate</span>`, onclick: () => { sheet.close(); ed.duplicateSelected(); } }),
    h('button', { class: 'btn btn-danger-ghost', html: `${icon('trash', 18)}<span>Delete</span>`, onclick: () => { sheet.close(); ed.deleteSelected(); } }));
  content.appendChild(actions);
  const sheet = new Sheet({ title: def.name, content, icon: 'sliders' });
  return sheet.open();
}

export function openWireSheet(ed, wire) {
  const content = h('div', { class: 'props' });
  const pal = h('div', { class: 'color-grid' });
  for (const c of WIRE_COLORS) {
    pal.appendChild(h('button', { class: 'color-dot' + (wire.color === c ? ' active' : ''), style: { background: c }, onclick: (e) => { for (const x of pal.children) x.classList.remove('active'); e.currentTarget.classList.add('active'); wire.color = c; ed.commit('Wire colour'); } }));
  }
  content.append(h('div', { class: 'field' }, h('label', {}, 'Wire colour'), pal));
  content.append(h('p', { class: 'muted small' }, 'Tip: drag the round handles to bend the wire. Tap a small dot in the middle of a segment and drag to add a bend. Double-tap a handle to remove it.'));
  content.append(h('div', { class: 'props-actions' },
    h('button', { class: 'btn btn-ghost', html: `${icon('eraser', 18)}<span>Straighten</span>`, onclick: () => { wire.points = []; ed.commit('Straighten wire'); } }),
    h('button', { class: 'btn btn-danger-ghost', html: `${icon('trash', 18)}<span>Delete wire</span>`, onclick: () => { sheet.close(); ed.deleteSelected(); } })));
  const sheet = new Sheet({ title: 'Wire', content, icon: 'wire' });
  return sheet.open();
}

/** Sliders / buttons to drive a sensor during the simulation. */
export function openSimControls(ed, part) {
  const def = getDef(part.type);
  const eng = ed.engine;
  const rt = eng && eng.parts.get(part.id);
  if (!rt) return null;
  const content = h('div', { class: 'sim-controls' });
  if (def.controls && def.controls.length) {
    for (const c of def.controls) {
      const cur = rt.values && rt.values[c.key] !== undefined ? rt.values[c.key] : c.default;
      if (c.type === 'button') {
        const b = h('button', { class: 'btn btn-primary wide', html: `${icon(c.icon || 'bolt', 18)}<span>${c.label}</span>` });
        b.addEventListener('pointerdown', () => eng.input(part.id, c.key, true));
        const up = () => eng.input(part.id, c.key, false);
        b.addEventListener('pointerup', up);
        b.addEventListener('pointerleave', up);
        content.appendChild(b);
        continue;
      }
      if (c.type === 'toggle') {
        const tg = h('button', { class: 'toggle' + (cur ? ' on' : ''), onclick: () => { tg.classList.toggle('on'); eng.input(part.id, c.key, tg.classList.contains('on')); } }, h('span'));
        content.appendChild(h('div', { class: 'ctl-row' }, h('label', {}, c.label), tg));
        continue;
      }
      const val = h('b', {}, fmtCtl(cur, c));
      const inp = h('input', { type: 'range', class: 'range', min: c.min, max: c.max, step: c.step || 1, value: cur });
      inp.addEventListener('input', () => { const v = parseFloat(inp.value); val.textContent = fmtCtl(v, c); eng.input(part.id, c.key, v); });
      const row = h('div', { class: 'ctl' }, h('div', { class: 'ctl-head' }, h('label', {}, c.label), val), inp,
        h('div', { class: 'ctl-scale' }, h('span', {}, fmtCtl(c.min, c)), h('span', {}, fmtCtl(c.max, c))));
      content.appendChild(row);
    }
  }
  if (def.controlsUI) def.controlsUI(content, { part, rt, engine: eng, input: (k, v, x) => eng.input(part.id, k, v, x) });
  if (!content.children.length) return null;
  const sheet = new Sheet({ title: def.name, content, cls: 'sheet-sim', modal: false, icon: 'sliders' });
  sheet.open(ed.root);
  return sheet;
}

function fmtCtl(v, c) {
  if (c.format) return c.format(v);
  const n = Number(v);
  const s = Math.abs(n) >= 100 || Number.isInteger(n) ? String(Math.round(n * 100) / 100) : n.toFixed(1);
  return s + (c.unit ? ' ' + c.unit : '');
}
