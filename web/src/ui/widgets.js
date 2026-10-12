// Small UI widgets: DOM helper, toasts, dialogs, bottom sheets, popup menus.
import { icon } from './icons.js';
import { Native } from '../native.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

// ------------------------------------------------------------------ back stack
const backStack = [];
export function pushBack(fn) { backStack.push(fn); return () => { const i = backStack.lastIndexOf(fn); if (i >= 0) backStack.splice(i, 1); }; }
export function popBack() {
  const fn = backStack.pop();
  if (fn) { fn(); return true; }
  return false;
}
export const backDepth = () => backStack.length;

// ------------------------------------------------------------------ toasts
let toastHost;
export function toast(msg, type = 'info', ms = 2600) {
  if (!toastHost) { toastHost = h('div', { class: 'toast-host' }); document.body.appendChild(toastHost); }
  const ic = { info: 'info', ok: 'check', warn: 'warning', error: 'warning' }[type] || 'info';
  const t = h('div', { class: `toast toast-${type}`, html: `${icon(ic, 18)}<span></span>` });
  t.querySelector('span').textContent = msg;
  toastHost.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  const kill = () => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); };
  t.addEventListener('click', kill);
  setTimeout(kill, ms);
  while (toastHost.children.length > 3) toastHost.firstChild.remove();
  return t;
}

// ------------------------------------------------------------------ dialogs
/** Close on a tap on the dimmed backdrop, but not with the tap that opened it: a menu opened on
 *  finger-up gets that tap's click right after, which landed on the new backdrop and closed the
 *  menu again at once (the ladder's online NO / NC menu "flashed" while the PLC was running). */
function onBackdrop(overlay, fn) {
  const opened = performance.now();
  overlay.addEventListener('click', (e) => { if (e.target === overlay && performance.now() - opened > 450) fn(); });
}

export function dialog({ title, body, actions = [], cls = '' }) {
  return new Promise((resolve) => {
    const overlay = h('div', { class: 'overlay dialog-overlay' });
    const box = h('div', { class: 'dialog ' + cls });
    if (title) box.appendChild(h('div', { class: 'dialog-title' }, title));
    if (body) box.appendChild(typeof body === 'string' ? h('div', { class: 'dialog-body', html: body }) : body);
    const row = h('div', { class: 'dialog-actions' });
    let unback;
    const close = (val) => {
      if (unback) unback();
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 220);
      resolve(val);
    };
    for (const a of actions) {
      row.appendChild(h('button', { class: 'btn ' + (a.cls || ''), onclick: () => close(typeof a.value === 'function' ? a.value() : a.value) }, a.label));
    }
    if (actions.length) box.appendChild(row);
    overlay.appendChild(box);
    onBackdrop(overlay, () => close(undefined));
    document.body.appendChild(overlay);
    unback = pushBack(() => { unback = null; close(undefined); });
    requestAnimationFrame(() => overlay.classList.add('show'));
    const firstInput = box.querySelector('input,textarea');
    if (firstInput) setTimeout(() => { firstInput.focus(); if (firstInput.select) firstInput.select(); }, 250);
  });
}

export function confirmDialog(title, msg, okLabel = 'OK', danger = false) {
  return dialog({ title, body: `<p>${msg}</p>`, actions: [{ label: 'Cancel', value: false, cls: 'btn-ghost' }, { label: okLabel, value: true, cls: danger ? 'btn-danger' : 'btn-primary' }] });
}

export function promptDialog(title, value = '', placeholder = '') {
  const inp = h('input', { class: 'input', value, placeholder });
  const body = h('div', { class: 'dialog-body' }, inp);
  const p = dialog({ title, body, actions: [{ label: 'Cancel', value: null, cls: 'btn-ghost' }, { label: 'OK', value: () => inp.value.trim(), cls: 'btn-primary' }] });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const btn = body.parentElement.querySelector('.btn-primary'); if (btn) btn.click(); } });
  return p;
}

// ------------------------------------------------------------------ bottom sheet
export class Sheet {
  constructor({ title, content, cls = '', onClose, height = 'auto', modal = true, icon: ic }) {
    this.onClose = onClose;
    this.overlay = h('div', { class: 'overlay sheet-overlay' + (modal ? '' : ' nonmodal') });
    this.el = h('div', { class: 'sheet ' + cls });
    if (height !== 'auto') this.el.style.height = height;
    const handle = h('div', { class: 'sheet-handle' }, h('span'));
    const head = h('div', { class: 'sheet-head' },
      ic ? h('span', { class: 'sheet-icon', html: icon(ic, 20) }) : null,
      h('div', { class: 'sheet-title' }, title || ''),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', html: icon('close'), onclick: () => this.close() }));
    this.body = h('div', { class: 'sheet-body' });
    if (content) this.body.appendChild(content);
    this.el.append(handle, head, this.body);
    this.overlay.appendChild(this.el);
    onBackdrop(this.overlay, () => this.close());
    this.enableDrag(handle);
    this.enableDrag(head);
  }

  enableDrag(handle) {
    let startY = null, dy = 0;
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      startY = e.clientY; dy = 0;
      this.el.style.transition = 'none';
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (startY === null) return;
      dy = Math.max(0, e.clientY - startY);
      this.el.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
      if (startY === null) return;
      startY = null;
      this.el.style.transition = '';
      if (dy > 90) this.close();
      else this.el.style.transform = '';
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  open(parent = document.body) {
    parent.appendChild(this.overlay);
    this.unback = pushBack(() => { this.unback = null; this.close(); });
    requestAnimationFrame(() => this.overlay.classList.add('show'));
    return this;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.unback) this.unback();
    this.overlay.classList.remove('show');
    this.el.style.transform = '';
    setTimeout(() => this.overlay.remove(), 260);
    if (this.onClose) this.onClose();
  }
}

// ------------------------------------------------------------------ popup menu
export function popupMenu(anchor, items) {
  const r = anchor.getBoundingClientRect();
  const overlay = h('div', { class: 'overlay menu-overlay' });
  const menu = h('div', { class: 'popup-menu' });
  let unback;
  const close = () => { if (unback) unback(); overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 180); };
  for (const it of items) {
    if (it === '-') { menu.appendChild(h('div', { class: 'menu-sep' })); continue; }
    if (!it) continue;
    menu.appendChild(h('button', {
      class: 'menu-item' + (it.danger ? ' danger' : ''),
      html: `${icon(it.icon || 'forward', 19)}<span>${it.label}</span>${it.hint ? `<small>${it.hint}</small>` : ''}`,
      onclick: () => { close(); setTimeout(() => it.action(), 10); },
    }));
  }
  overlay.appendChild(menu);
  onBackdrop(overlay, close);
  document.body.appendChild(overlay);
  const mw = menu.offsetWidth || 230;
  const left = Math.max(8, Math.min(window.innerWidth - mw - 8, r.right - mw));
  menu.style.left = left + 'px';
  // below the button if it fits, else above it; a menu taller than both (a phone held sideways)
  // fills the screen height and scrolls — it must never run off the top or bottom edge
  const vh = window.innerHeight, pad = 8, need = menu.offsetHeight;
  const spaceBelow = vh - r.bottom - 6 - pad, spaceAbove = r.top - 6 - pad;
  if (need <= spaceBelow) menu.style.top = r.bottom + 6 + 'px';
  else if (need <= spaceAbove) menu.style.bottom = vh - r.top + 6 + 'px';
  else { menu.style.top = pad + 'px'; menu.style.maxHeight = vh - pad * 2 + 'px'; }
  unback = pushBack(() => { unback = null; close(); });
  requestAnimationFrame(() => overlay.classList.add('show'));
  Native.vibrate(6);
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function timeAgo(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  if (s < 86400 * 7) return Math.floor(s / 86400) + ' d ago';
  return new Date(ts).toLocaleDateString();
}
