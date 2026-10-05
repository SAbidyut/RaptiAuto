// Operand entry keypad for ladder instructions: device keys (X Y M S T C D K H), digits
// (8/9 disabled for the octal X/Y devices), compare operator, pulse option, device comment.
import { h, Sheet } from '../../ui/widgets.js';
import { icon } from '../../ui/icons.js';
import { Native } from '../../native.js';
import { INSTR, CMP_OPS, OPERAND_DEVS, mnemonic } from '../sim/ladder.js';
import { parseOperand, DEVICES, SPECIAL } from '../sim/address.js';

const DEV_KEYS = ['X', 'Y', 'M', 'S', 'T', 'C', 'D', 'K', 'H'];

/**
 * Open the keypad. el = existing element ({t, a, op, p}). Resolves via onDone(newEl) or nothing on cancel.
 */
export function openKeypad({ el, program, recent = [], onDone, title }) {
  const d = INSTR[el.t];
  const vals = d.ops.map((_, i) => (el.a && el.a[i]) || '');
  let op = el.op || '>';
  let pulse = !!el.p;
  let field = 0;
  let fresh = true; // first key press replaces the default value
  const content = h('div', { class: 'kp' });
  const head = h('div', { class: 'kp-head' },
    h('span', { class: 'kp-mn' }, mnemonic({ ...el, p: pulse })),
    h('span', { class: 'kp-name' }, d.name));
  const fieldsRow = h('div', { class: 'kp-fields' });
  const err = h('div', { class: 'kp-err' });
  const info = h('div', { class: 'kp-info' });
  const comment = h('input', { class: 'input kp-comment', placeholder: 'Device comment (e.g. START button)', maxlength: 40 });
  const devRow = h('div', { class: 'kp-devs' });
  const digits = h('div', { class: 'kp-digits' });
  const quick = h('div', { class: 'kp-quick' });
  const opRow = d.cmp ? h('div', { class: 'kp-ops' }) : null;
  const pulseRow = d.pulse ? h('button', { class: 'kp-pulse', onclick: () => { pulse = !pulse; draw(); } }) : null;

  const cls = () => d.ops[field];
  const allowed = () => OPERAND_DEVS[cls()] || [];
  const isOct = () => /^[XY]/.test(vals[field] || '');
  const isHex = () => /^H/.test(vals[field] || '');

  function commentKey() {
    const o = parseOperand(vals[field]);
    return o && o.dev !== 'K' && o.dev !== 'H' ? o.text : null;
  }

  function draw() {
    head.firstChild.textContent = mnemonic({ ...el, p: pulse });
    fieldsRow.innerHTML = '';
    d.ops.forEach((c, i) => {
      const o = parseOperand(vals[i]);
      const ok = o && (OPERAND_DEVS[c] || []).includes(o.dev);
      fieldsRow.appendChild(h('button', { class: 'kp-field' + (i === field ? ' active' : '') + (vals[i] && !ok ? ' bad' : ''), onclick: () => { field = i; fresh = true; draw(); } },
        h('small', {}, d.labels[i] || 'Operand'),
        h('b', {}, vals[i] || '—')));
    });
    if (opRow) {
      opRow.innerHTML = '';
      for (const o of CMP_OPS) opRow.appendChild(h('button', { class: 'kp-op' + (o === op ? ' active' : ''), onclick: () => { op = o; draw(); } }, o));
    }
    if (pulseRow) { pulseRow.className = 'kp-pulse' + (pulse ? ' active' : ''); pulseRow.innerHTML = `${icon(pulse ? 'check' : 'bolt', 15)}<span>${pulse ? 'Pulse (P): runs once on the rising edge' : 'Continuous: runs every scan while ON — tap for P (pulse)'}</span>`; }
    devRow.innerHTML = '';
    const al = allowed();
    for (const k of DEV_KEYS) {
      const on = al.includes(k);
      devRow.appendChild(h('button', { class: 'kp-key dev' + ((vals[field] || '')[0] === k ? ' active' : ''), disabled: !on, onclick: () => setDev(k) }, k));
    }
    digits.innerHTML = '';
    const keys = isHex() ? ['7', '8', '9', 'A', '4', '5', '6', 'B', '1', '2', '3', 'C', '0', 'D', 'E', 'F'] : ['7', '8', '9', '4', '5', '6', '1', '2', '3', '±', '0', '⌫'];
    digits.classList.toggle('hex', isHex());
    for (const k of keys) {
      const dis = (isOct() && (k === '8' || k === '9')) || (k === '±' && !/^K/.test(vals[field] || ''));
      digits.appendChild(h('button', { class: 'kp-key' + (k === '⌫' ? ' back' : ''), disabled: dis, onclick: () => press(k) }, k));
    }
    if (isHex()) digits.appendChild(h('button', { class: 'kp-key back wide', onclick: () => press('⌫') }, '⌫'));
    // validation / info
    const o = parseOperand(vals[field]);
    err.textContent = '';
    info.textContent = '';
    if (vals[field] && !o) err.textContent = /^[XY]\d*[89]/.test(vals[field]) ? 'X / Y are numbered in octal: 0–7, 10–17, 20–27 …' : 'Not a valid device yet';
    else if (o && !al.includes(o.dev)) err.textContent = `${o.dev} cannot be used here — allowed: ${al.join(', ')}`;
    else if (o) {
      const sp = SPECIAL[o.text];
      info.textContent = sp ? `${o.text}: ${sp}` : o.dev === 'K' ? `Decimal constant ${o.val}` : o.dev === 'H' ? `Hex constant = ${o.raw ?? o.val}` : `${DEVICES[o.dev].name}${o.dev === 'T' ? timerHint(o.idx) : ''}`;
    }
    const ck = commentKey();
    comment.disabled = !ck;
    comment.value = ck ? (program.comments[ck] || '') : '';
    comment.placeholder = ck ? `Comment for ${ck}` : 'Constants have no comment';
    // quick picks
    quick.innerHTML = '';
    const picks = [...new Set(recent.filter((r) => { const p = parseOperand(r); return p && al.includes(p.dev); }))].slice(0, 14);
    for (const r of picks) quick.appendChild(h('button', { class: 'chip kp-chip', onclick: () => { vals[field] = r; fresh = true; draw(); } }, r, program.comments[r] ? h('small', {}, program.comments[r].slice(0, 12)) : null));
  }

  function setDev(k) {
    Native.vibrate(4);
    vals[field] = k;
    fresh = false;
    draw();
  }

  function press(k) {
    Native.vibrate(4);
    let v = vals[field] || '';
    if (k === '⌫') { v = v.length > 1 ? v.slice(0, -1) : v.slice(0, 1); fresh = false; }
    else if (k === '±') v = v.startsWith('K-') ? 'K' + v.slice(2) : 'K-' + v.slice(1);
    else {
      if (fresh && v.length > 1) v = v[0] || '';
      fresh = false;
      if (!v) v = allowed()[0];
      if (v.replace(/^[A-Z]-?/, '').length < 5) v += k;
      v = v.replace(/^([XYMSTCD])0+(?=\d)/, '$1');
    }
    vals[field] = v;
    draw();
  }

  comment.addEventListener('input', () => { const ck = commentKey(); if (ck) { if (comment.value.trim()) program.comments[ck] = comment.value.trim(); else delete program.comments[ck]; } });

  const okBtn = h('button', { class: 'btn btn-primary', html: `${icon('check', 18)}<span>OK</span>`, onclick: () => finish() });
  const nextBtn = d.ops.length > 1 ? h('button', { class: 'btn btn-ghost', html: `<span>Next</span>${icon('forward', 18)}`, onclick: () => { field = (field + 1) % d.ops.length; fresh = true; draw(); } }) : null;

  function finish() {
    for (let i = 0; i < d.ops.length; i++) {
      const o = parseOperand(vals[i]);
      if (!o || !(OPERAND_DEVS[d.ops[i]] || []).includes(o.dev)) { field = i; draw(); err.textContent = err.textContent || `${d.labels[i]}: enter a valid device`; Native.vibrate(30); return; }
      vals[i] = o.text;
    }
    const out = { t: el.t, a: vals.slice() };
    if (d.cmp) out.op = op;
    if (d.pulse && pulse) out.p = true;
    sheet.close();
    onDone(out);
  }

  content.append(...[head, opRow, pulseRow, fieldsRow, err, info, devRow, digits, quick, comment, h('div', { class: 'kp-actions' }, nextBtn, okBtn)].filter(Boolean));
  // physical keyboard
  const onKey = (e) => {
    const k = e.key.toUpperCase();
    if (document.activeElement === comment) { if (e.key === 'Enter') finish(); return; }
    if (e.key === 'Enter') { e.preventDefault(); finish(); return; }
    if (e.key === 'Tab') { e.preventDefault(); field = (field + 1) % Math.max(1, d.ops.length); fresh = true; draw(); return; }
    if (e.key === 'Backspace') { e.preventDefault(); press('⌫'); return; }
    if (/^[0-9]$/.test(k) || (isHex() && /^[A-F]$/.test(k))) { press(k); return; }
    if (DEV_KEYS.includes(k) && allowed().includes(k)) setDev(k);
  };
  const sheet = new Sheet({ title: title || 'Instruction', content, icon: 'ladder', cls: 'kp-sheet', onClose: () => window.removeEventListener('keydown', onKey) });
  window.addEventListener('keydown', onKey);
  sheet.open();
  draw();
  return sheet;
}

function timerHint(n) {
  if (n >= 250) return ' · 100 ms accumulative';
  if (n >= 246) return ' · 1 ms accumulative';
  if (n >= 240) return ' · 10 ms accumulative';
  if (n >= 200) return ' · 10 ms base (K100 = 1 s)';
  return ' · 100 ms base (K10 = 1 s)';
}

/** Instruction picker (application instructions + compare contact). */
export function openInstrPicker({ onPick }) {
  const groups = [
    ['Compare', ['CC', 'CMP']],
    ['Data move & math', ['MOV', 'ADD', 'SUB', 'MUL', 'DIV', 'INC', 'DEC']],
    ['Bits', ['ALT', 'ZRST', 'PLS', 'PLF']],
    ['Timers & counters', ['TMR', 'CNT']],
    ['Communication', ['MODRW']],
  ];
  const content = h('div', { class: 'instr-picker' });
  for (const [g, list] of groups) {
    content.appendChild(h('div', { class: 'lib-cat' }, g));
    for (const t of list) {
      const d = INSTR[t];
      content.appendChild(h('button', { class: 'ip-row', onclick: () => { sheet.close(); onPick(t); } },
        h('span', { class: 'ip-mn' }, t === 'CC' ? 'LD>' : t),
        h('div', { class: 'ip-text' }, h('b', {}, d.name), h('small', {}, d.api ? `API ${d.api} · ${d.labels.join(', ')}` : d.labels.join(', ') || 'Contact'))));
    }
  }
  const sheet = new Sheet({ title: 'Instructions', content, icon: 'ladder', cls: 'sheet-tall' });
  sheet.open();
}
