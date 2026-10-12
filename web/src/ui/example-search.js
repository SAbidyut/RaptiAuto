// Search over every example of the app: the Arduino gallery, the Raspberry Pi / Pico programs and
// the PLC Lab projects. All words must match (in any order) somewhere in the name, tags, description,
// board, parts or libraries; hits in the name and tags rank first.
import { getDef } from '../components/registry.js';
import { EXAMPLES, EXAMPLE_CATEGORIES } from '../examples/index.js';
import { PI_EXAMPLES, PICO_EXAMPLES } from '../pi/examples.js';
import { LAB_EXAMPLES } from '../plc/examples.js';

// a few other words people search with
const SYNONYMS = {
  temp: 'temperature', temperature: 'thermometer', weather: 'forecast', namaz: 'prayer', salah: 'prayer', azan: 'prayer',
  wifi: 'wi-fi', 'wi-fi': 'wifi', iot: 'internet', light: 'led', lamp: 'relay', motor: 'servo', display: 'lcd', screen: 'oled',
  rs485: 'rs-485', 'rs-485': 'modbus', plc: 'delta', vfd: 'drive', drive: 'vfd', money: 'currency', taka: 'bdt', dollar: 'usd',
};

const norm = (s) => String(s || '').toLowerCase().replace(/[‐-―]/g, '-').replace(/\s+/g, ' ');
let index = null;

function build() {
  const cat = Object.fromEntries(EXAMPLE_CATEGORIES.map((c) => [c.id, c.name]));
  const out = [];
  for (const ex of EXAMPLES) {
    const types = [...new Set(ex.parts.map((p) => p.type))];
    const parts = types.map((t) => { const d = getDef(t); return d ? `${d.name} ${t}` : t; }).join(' ');
    const libs = [...String(ex.code || '').matchAll(/#include\s*[<"]([^>"]+)[>"]/g)].map((m) => m[1].replace(/\.h$/, '')).join(' ');
    out.push({ kind: 'arduino', item: ex, title: norm(ex.name), tags: norm([...(ex.tags || []), cat[ex.category] || '', ex.level || ''].join(' ')), body: norm(`${ex.description} ${parts} ${libs} arduino`) });
  }
  for (const [list, kind] of [[PI_EXAMPLES, 'pi'], [PICO_EXAMPLES, 'pico']]) {
    for (const e of list) {
      const first = (String(e.code || '').split('\n')[0] || '').replace(/^#\s*/, '');
      const imports = [...String(e.code || '').matchAll(/^(?:from\s+(\S+)\s+import|import\s+(\S+))/gm)].map((m) => m[1] || m[2]).join(' ');
      const parts = (e.parts || []).map((p) => p.type).join(' ');
      out.push({ kind, item: e, title: norm(e.title), tags: norm((e.tags || []).join(' ')), body: norm(`${first} ${e.file} ${parts} ${imports} ${kind === 'pi' ? 'raspberry pi python' : 'pico micropython'}`) });
    }
  }
  for (const ex of LAB_EXAMPLES) out.push({ kind: 'plc', item: ex, title: norm(ex.name), tags: norm([...(ex.tags || []), ex.level || ''].join(' ')), body: norm(`${ex.description} plc delta lab ladder`) });
  return out;
}

/** Examples matching `q`, best first: [{ kind: 'arduino' | 'pi' | 'pico' | 'plc', item, score }]. */
export function searchExamples(q, kinds = null) {
  const words = norm(q).trim().split(' ').filter(Boolean);
  if (!words.length) return [];
  if (!index) index = build();
  const res = [];
  for (const e of index) {
    if (kinds && !kinds.includes(e.kind)) continue;
    let score = 0, ok = true;
    for (const w of words) {
      const alt = SYNONYMS[w];
      const s = (txt) => (txt.includes(w) ? 1 : alt && txt.includes(alt) ? 0.6 : 0);
      const t = s(e.title), g = s(e.tags), b = s(e.body);
      if (!t && !g && !b) { ok = false; break; }
      score += t * 3 + g * 2 + b + (e.title.split(/[^a-z0-9]+/).includes(w) ? 1 : 0);
    }
    if (ok) res.push({ kind: e.kind, item: e.item, score });
  }
  return res.sort((a, b) => b.score - a.score);
}

export const SEARCH_HINTS = ['weather', 'MQTT', 'LCD', 'prayer', 'air quality', 'servo', 'Flask', 'Modbus', 'Telegram', 'OLED'];
