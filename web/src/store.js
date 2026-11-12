// Project persistence (localStorage) and project factory.
import { getDef, newId } from './components/registry.js';

const INDEX = 'raptiauto.index.v1';
const PKEY = (id) => 'raptiauto.p.' + id;
const SETTINGS = 'raptiauto.settings.v1';

const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };

export function listProjects() {
  const list = safe(() => JSON.parse(localStorage.getItem(INDEX) || '[]'), []);
  return Array.isArray(list) ? list.filter((x) => x && typeof x === 'object' && x.id).sort((a, b) => (b.updated || 0) - (a.updated || 0)) : [];
}

export function loadProject(id) {
  const p = safe(() => JSON.parse(localStorage.getItem(PKEY(id)) || 'null'), null);
  return p && typeof p === 'object' ? safe(() => normalize(p), null) : null;
}

export function saveProject(p) {
  p.updated = Date.now();
  const ok = safe(() => { localStorage.setItem(PKEY(p.id), JSON.stringify(p)); return true; }, false);
  const list = listProjects().filter((x) => x.id !== p.id);
  const board = p.parts.find((x) => getDef(x.type) && getDef(x.type).board);
  list.unshift({ id: p.id, name: p.name, board: board ? board.type : null, updated: p.updated, parts: p.parts.length, example: p.fromExample || null });
  safe(() => localStorage.setItem(INDEX, JSON.stringify(list)));
  return ok;
}

export function deleteProject(id) {
  safe(() => localStorage.removeItem(PKEY(id)));
  safe(() => localStorage.setItem(INDEX, JSON.stringify(listProjects().filter((x) => x.id !== id))));
}

/** Makes a stored or imported project safe to open: a broken entry is dropped, never fatal. */
export function normalize(p) {
  if (!p || typeof p !== 'object') p = {};
  const obj = (x) => !!x && typeof x === 'object';
  p.parts = (Array.isArray(p.parts) ? p.parts : []).filter((x) => obj(x) && typeof x.type === 'string' && x.id);
  const ids = new Set(p.parts.map((x) => x.id));
  p.wires = (Array.isArray(p.wires) ? p.wires : []).filter((w) => obj(w) && obj(w.from) && obj(w.to) && ids.has(w.from.part) && ids.has(w.to.part));
  p.code = typeof p.code === 'string' ? p.code : '';
  p.name = typeof p.name === 'string' && p.name ? p.name : 'Untitled project';
  p.id = p.id || newId('prj');
  p.settings = obj(p.settings) ? p.settings : {};
  for (const w of p.wires) { w.points = Array.isArray(w.points) ? w.points.filter((q) => Array.isArray(q) && q.length === 2) : []; w.id = w.id || newId('w'); }
  return p;
}

export const DEFAULT_CODE = {
  avr: `// RaptiAuto — Blink
// The built-in LED blinks every second.

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("Hello from RaptiAuto!");
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
}
`,
  esp32: `// RaptiAuto — ESP32 Blink

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(115200);
  Serial.println("ESP32 ready!");
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
}
`,
};

export function createProject(boardType = 'uno-r3', name = 'My Project') {
  const def = getDef(boardType);
  const arch = def && def.board ? def.board.arch : 'avr';
  const p = normalize({
    id: newId('prj'),
    name,
    created: Date.now(),
    parts: [{ id: newId('p'), type: boardType, x: 0, y: 0, rot: 0, props: {} }],
    wires: [],
    code: arch === 'xtensa' ? DEFAULT_CODE.esp32 : (boardType === 'attiny85' ? DEFAULT_CODE.avr.replace(/\s*Serial\.[^\n]*\n/g, '\n') : DEFAULT_CODE.avr),
  });
  return p;
}

export function cloneProject(p, name) {
  const c = normalize(JSON.parse(JSON.stringify(p)));
  c.id = newId('prj');
  c.name = name || p.name;
  c.created = Date.now();
  // a copy is a new device: nothing stored on the boards (EEPROM, ESP32 Preferences) comes along
  delete c.eeprom;
  for (const x of c.parts) { delete x.eeprom; delete x.nvs; }
  return c;
}

export function exportJSON(p) {
  // without what the boards stored at run time (EEPROM, ESP32 Preferences)
  const parts = p.parts.map((x) => ({ ...x, eeprom: undefined, nvs: undefined }));
  return JSON.stringify({ format: 'raptiauto', version: 1, project: { ...p, parts, eeprom: undefined } }, null, 1);
}

export function importJSON(text) {
  const data = JSON.parse(text);
  const proj = data && data.format === 'raptiauto' ? data.project : data;
  if (!proj || !Array.isArray(proj.parts)) throw new Error('Not a RaptiAuto project file');
  const p = cloneProject(normalize(proj), proj.name || 'Imported project');
  return p;
}

/** The three looks (Settings → Appearance); the colours themselves are in styles/rapti-theme.css. */
export const THEMES = {
  light: { name: 'RAPTI Day', bg: '#fffaf0' },
  dark: { name: 'RAPTI Night', bg: '#0b1026' },
  amoled: { name: 'Black', bg: '#000000' },
};

export function loadSettings() {
  return {
    wireStyle: 'smooth', showGrid: true, haptics: true, sound: true, fontSize: 14, autosave: true, flow: true, look: 'light',
    ...safe(() => JSON.parse(localStorage.getItem(SETTINGS) || '{}'), {}),
  };
}

export function saveSettings(s) { safe(() => localStorage.setItem(SETTINGS, JSON.stringify(s))); }
