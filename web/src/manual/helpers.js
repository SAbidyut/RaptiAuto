// Small HTML builders shared by the chapters of the manual.
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const note = (t) => `<div class="mx-note"><b>Good to know</b>${t}</div>`;
export const tip = (t) => `<div class="mx-tip"><b>Tip</b>${t}</div>`;
export const warn = (t) => `<div class="mx-warn"><b>Careful</b>${t}</div>`;
export const tryIt = (t) => `<div class="mx-try"><b>Try it</b>${t}</div>`;
export const steps = (...items) => `<ol class="mx-steps">${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;
export const ul = (...items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
export const table = (head, rows) => `<div class="mx-table-wrap"><table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
/** A code / ladder listing. Lines starting with // are comments. */
export const pre = (code) => `<pre>${esc(code.replace(/^\n/, '').replace(/\s+$/, '')).replace(/^(\/\/.*)$/gm, '<span class="c">$1</span>')}</pre>`;

const KW = {
  c: /\b(void|int|long|float|double|bool|boolean|byte|char|unsigned|const|static|volatile|String|if|else|for|while|do|switch|case|break|continue|return|true|false|HIGH|LOW|INPUT|OUTPUT|INPUT_PULLUP|LED_BUILTIN|A[0-5]|setup|loop)\b/g,
  py: /\b(import|from|as|def|class|return|if|elif|else|for|while|in|not|and|or|try|except|finally|with|pass|break|continue|lambda|True|False|None|print|input|range|len)\b/g,
};
/**
 * A code listing with syntax colours (lang 'c' for Arduino sketches, 'py' for Python). Add `mark: [3, 5]` to tint
 * those line numbers (1-based) and `numbers: true` to print a line-number gutter — handy for "look at line 5" text.
 */
export const code = (src, lang = 'c', { mark = [], numbers = false } = {}) => {
  const text = src.replace(/^\n/, '').replace(/\s+$/, '');
  const line = (l) => {
    // comments and strings first (they are cut out so keywords inside them stay plain), then the rest
    const parts = [];
    let rest = l;
    const cm = lang === 'py' ? rest.indexOf('#') : rest.indexOf('//');
    let tail = '';
    if (cm >= 0 && !/["'][^"']*$/.test(rest.slice(0, cm))) { tail = rest.slice(cm); rest = rest.slice(0, cm); }
    for (const piece of rest.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/)) {
      if (/^["']/.test(piece)) parts.push(`<span class="s">${esc(piece)}</span>`);
      else parts.push(esc(piece).replace(KW[lang] || KW.c, '<span class="k">$&</span>').replace(/\b(\d+(?:\.\d+)?)\b(?![^<]*>)/g, '<span class="n">$1</span>'));
    }
    if (tail) parts.push(`<span class="c">${esc(tail)}</span>`);
    return parts.join('');
  };
  const rows = text.split('\n').map((l, i) => `<span class="ln${mark.includes(i + 1) ? ' hot' : ''}">${numbers ? `<i>${i + 1}</i>` : ''}${line(l) || ' '}</span>`);
  return `<pre class="mx-code${numbers ? ' num' : ''}" data-lang="${lang}">${rows.join('\n')}</pre>`;
};
/** The "at a glance" strip at the top of a project: level, time, parts, what you learn. */
export const project = ({ level = 'Beginner', time = '10 min', parts = [], learn = '' }) =>
  `<div class="mx-project"><span class="lv lv-${level.toLowerCase()}">${esc(level)}</span><span class="tm">⏱ ${esc(time)}</span>${parts.length ? `<div class="pt"><b>Parts</b>${parts.map((x) => `<i>${esc(x)}</i>`).join('')}</div>` : ''}${learn ? `<div class="lr"><b>You learn</b>${esc(learn)}</div>` : ''}</div>`;
/** Button that opens a lab example (PLC Lab). */
export const open = (id, label = 'Open this example') => `<button class="mx-open" data-ex="${id}">▶ ${esc(label)}</button>`;
/** Button that opens an Arduino example (by its id in examples/index.js). */
export const openArd = (id, label = 'Open this example') => `<button class="mx-open" data-ard="${id}">▶ ${esc(label)}</button>`;
/** Button that opens a Raspberry Pi example (by its file name in pi/examples.js, e.g. blink.py). */
export const openPi = (file, label = 'Open this example') => `<button class="mx-open" data-pi="${file}">▶ ${esc(label)}</button>`;
export const k = (t) => `<kbd>${esc(t)}</kbd>`;
