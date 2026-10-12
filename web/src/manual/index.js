// The manual: chapters of sections. Each section is an HTML string; pictures come from art.js / ladder.js.
import ch1 from './ch1.js';
import ch2 from './ch2.js';
import ch3 from './ch3.js';
import ch4 from './ch4.js';
import ch5 from './ch5.js';
import ch6 from './ch6.js';
import ch7 from './ch7.js';
import ch8 from './ch8.js';
import ch9 from './ch9.js';

export const MANUAL = [ch1, ch2, ch3, ch4, ch5, ch6, ch7, ch8, ch9];

/** Plain text of a section (for the search). */
export const textOf = (html) => html.replace(/<figure[\s\S]*?<\/figure>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** Search: [{ch, sec, score, snippet}] best first. */
export function searchManual(q) {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  const out = [];
  for (const ch of MANUAL) {
    for (const sec of ch.sections) {
      const text = textOf(sec.html), low = text.toLowerCase(), title = sec.title.toLowerCase();
      if (!words.every((w) => low.includes(w) || title.includes(w) || ch.title.toLowerCase().includes(w))) continue;
      let score = 0;
      for (const w of words) { if (title.includes(w)) score += 10; if (ch.title.toLowerCase().includes(w)) score += 3; score += Math.min(5, low.split(w).length - 1); }
      const i = low.indexOf(words[0]);
      const snippet = i < 0 ? text.slice(0, 120) : (i > 40 ? '… ' : '') + text.slice(Math.max(0, i - 40), i + 110) + ' …';
      out.push({ ch, sec, score, snippet });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 30);
}
