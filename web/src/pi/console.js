// Terminal-style text console used by the Pi terminal and the Thonny shell: streaming output with
// ANSI colours, \r and \b, and an inline input line with history.
import { h } from '../ui/widgets.js';

const ANSI = { 30: 'k', 31: 'r', 32: 'g', 33: 'y', 34: 'b', 35: 'm', 36: 'c', 37: 'w', 90: 'K', 91: 'R', 92: 'G', 93: 'Y', 94: 'B', 95: 'M', 96: 'C', 97: 'W' };
const MAX_LINES = 2500;

export class Console {
  constructor({ cls = '', onKey, extraKeys = null, placeholder = '' } = {}) {
    this.el = h('div', { class: 'con ' + cls });
    this.scroller = h('div', { class: 'con-scroll' });
    this.lines = h('div', { class: 'con-lines' });
    this.prefix = h('span', { class: 'con-prefix' });
    this.input = h('input', { class: 'con-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'send', placeholder });
    this.inrow = h('div', { class: 'con-inrow hidden' }, this.prefix, this.input);
    this.scroller.append(this.lines, this.inrow);
    this.el.appendChild(this.scroller);
    if (extraKeys) this.el.appendChild(this.keyBar(extraKeys));
    this.cur = null;          // current (unterminated) line element
    this.sgr = '';            // current colour class
    this.history = [];
    this.hIdx = 0;
    this.pending = null;
    this.onKey = onKey;
    this.input.addEventListener('keydown', (e) => this.keydown(e));
    this.scroller.addEventListener('click', (e) => { if (!this.inrow.classList.contains('hidden') && !window.getSelection().toString() && e.target.closest('.con-scroll')) this.focus(); });
  }

  keyBar(keys) {
    const bar = h('div', { class: 'con-keys' });
    for (const [label, fn] of keys) {
      const b = h('button', { class: 'ck' }, label);
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('click', () => fn(this));
      bar.appendChild(b);
    }
    return bar;
  }

  focus() { try { this.input.focus({ preventScroll: true }); } catch (e) { this.input.focus(); } }

  clear() { this.lines.innerHTML = ''; this.cur = null; }

  newLine() {
    const l = h('div', { class: 'cl' });
    this.lines.appendChild(l);
    while (this.lines.childElementCount > MAX_LINES) this.lines.firstChild.remove();
    return l;
  }

  /** Append text (may contain \n, \r, \b and ANSI colour codes). cls: extra class (e.g. 'err'). */
  write(text, cls = '') {
    if (!text) return;
    const stick = this.atBottom();
    let buf = '';
    const flush = () => {
      if (!buf) return;
      if (!this.cur) this.cur = this.newLine();
      const c = [cls, this.sgr].filter(Boolean).join(' ');
      const last = this.cur.lastChild;
      if (last && last.nodeType === 1 && last.className === c) last.textContent += buf;
      else { const s = document.createElement('span'); if (c) s.className = c; s.textContent = buf; this.cur.appendChild(s); }
      buf = '';
    };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\n') { flush(); if (!this.cur) this.cur = this.newLine(); if (!this.cur.firstChild) this.cur.innerHTML = '&#8203;'; this.cur = null; }
      else if (ch === '\r') { if (text[i + 1] === '\n') continue; flush(); if (this.cur) this.cur.innerHTML = ''; }
      else if (ch === '\b') { flush(); this.backspace(); }
      else if (ch === '\x1b' && text[i + 1] === '[') {
        flush();
        const m = /^\x1b\[([\d;?]*)([A-Za-z])/.exec(text.slice(i));
        if (!m) continue;
        i += m[0].length - 1;
        if (m[2] === 'm') {
          const codes = m[1].split(';').filter(Boolean).map(Number);
          if (!codes.length) codes.push(0);
          const cl = new Set(this.sgr.split(' ').filter(Boolean));
          for (const c of codes) {
            if (c === 0) cl.clear();
            else if (c === 1) cl.add('bold');
            else if (ANSI[c]) { for (const k of [...cl]) if (k.startsWith('fg-')) cl.delete(k); cl.add('fg-' + ANSI[c]); }
          }
          this.sgr = [...cl].join(' ');
        } else if (m[2] === 'J') this.clear();
        else if (m[2] === 'K') { /* erase to end of line: nothing after the cursor in this model */ }
      } else if (ch === '\x07' || ch === '\x00') { /* bell */ }
      else buf += ch;
    }
    flush();
    if (stick) this.scrollEnd();
  }

  backspace() {
    if (!this.cur) return;
    const last = this.cur.lastChild;
    if (!last) return;
    last.textContent = last.textContent.slice(0, -1);
    if (!last.textContent) last.remove();
  }

  writeln(text = '', cls = '') { this.write(text + '\n', cls); }

  /** Write coloured segments: [[text, cls], …]. */
  segs(parts) { for (const [t, c] of parts) this.write(t, c || ''); }

  atBottom() { const s = this.scroller; return s.scrollHeight - s.scrollTop - s.clientHeight < 40; }
  scrollEnd() { requestAnimationFrame(() => { this.scroller.scrollTop = this.scroller.scrollHeight; }); }

  /**
   * Show the input line. prompt: string or [[text, cls], …]. Resolves with the typed text.
   * opts: { value, mask, keepHistory }
   */
  prompt(prompt = '', opts = {}) {
    if (this.pending) { const p = this.pending; this.pending = null; p.resolve(null); }
    this.prefix.innerHTML = '';
    // an unterminated output line (e.g. print(..., end="")) continues on the input row
    if (this.cur && this.cur.textContent) { while (this.cur.firstChild) this.prefix.appendChild(this.cur.firstChild); this.cur.remove(); this.cur = null; }
    const parts = typeof prompt === 'string' ? [[prompt, '']] : prompt;
    for (const [t, c] of parts) { const s = document.createElement('span'); if (c) s.className = c; s.textContent = t; this.prefix.appendChild(s); }
    this.input.value = opts.value || '';
    this.input.type = opts.mask ? 'password' : 'text';
    this.inrow.classList.remove('hidden');
    this.hIdx = this.history.length;
    this.keepHistory = opts.keepHistory !== false;
    this.scrollEnd();
    if (opts.focus !== false) this.focus();
    return new Promise((resolve) => { this.pending = { resolve }; });
  }

  get waiting() { return !!this.pending; }

  /** Submit the current input (Enter). */
  submit(text = this.input.value) {
    if (!this.pending) return;
    const p = this.pending;
    this.pending = null;
    const echo = h('div', { class: 'cl' });
    while (this.prefix.firstChild) echo.appendChild(this.prefix.firstChild);
    echo.appendChild(h('span', { class: 'con-typed' }, this.input.type === 'password' ? '' : text));
    this.lines.appendChild(echo);
    this.cur = null;
    this.inrow.classList.add('hidden');
    this.input.value = '';
    if (text.trim() && this.keepHistory && this.history[this.history.length - 1] !== text) this.history.push(text);
    this.scrollEnd();
    p.resolve(text);
  }

  /** Abort the input (Ctrl+C): the line is echoed with ^C and the promise resolves null. */
  cancel(mark = '^C') {
    if (!this.pending) return false;
    const p = this.pending;
    this.pending = null;
    const echo = h('div', { class: 'cl' });
    while (this.prefix.firstChild) echo.appendChild(this.prefix.firstChild);
    echo.appendChild(h('span', {}, this.input.value + mark));
    this.lines.appendChild(echo);
    this.cur = null;
    this.inrow.classList.add('hidden');
    this.input.value = '';
    p.resolve(null);
    return true;
  }

  hideInput() { if (this.pending) { const p = this.pending; this.pending = null; p.resolve(null); } this.inrow.classList.add('hidden'); }

  keydown(e) {
    if (this.onKey && this.onKey(e, this) === true) { e.preventDefault(); return; }
    if (e.key === 'Enter') { e.preventDefault(); this.submit(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); this.histMove(-1); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); this.histMove(1); }
  }

  histMove(d) {
    if (!this.history.length) return;
    this.hIdx = Math.max(0, Math.min(this.history.length, this.hIdx + d));
    this.input.value = this.history[this.hIdx] || '';
    const n = this.input.value.length;
    requestAnimationFrame(() => this.input.setSelectionRange(n, n));
  }

  insert(text) {
    const i = this.input;
    const s = i.selectionStart ?? i.value.length, e = i.selectionEnd ?? i.value.length;
    i.value = i.value.slice(0, s) + text + i.value.slice(e);
    i.setSelectionRange(s + text.length, s + text.length);
    this.focus();
  }
}
