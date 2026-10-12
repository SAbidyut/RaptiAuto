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
/** Button that opens a lab example (PLC Lab). */
export const open = (id, label = 'Open this example') => `<button class="mx-open" data-ex="${id}">▶ ${esc(label)}</button>`;
export const k = (t) => `<kbd>${esc(t)}</kbd>`;
