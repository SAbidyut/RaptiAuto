// Project persistence (localStorage) and project factory.
import { getDef, newId } from './components/registry.js';
import { defaultPythonCode } from './sim/py/index.js';

const INDEX = 'raptiauto.index.v1';
const PKEY = (id) => 'raptiauto.p.' + id;
const SETTINGS = 'raptiauto.settings.v1';

const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };

export function listProjects() {
  const list = safe(() => JSON.parse(localStorage.getItem(INDEX) || '[]'), []);
  return Array.isArray(list) ? list.sort((a, b) => (b.updated || 0) - (a.updated || 0)) : [];
}

export function loadProject(id) {
  const p = safe(() => JSON.parse(localStorage.getItem(PKEY(id)) || 'null'), null);
  return p ? normalize(p) : null;
}

export function saveProject(p) {
  p.updated = Date.now();
  const ok = safe(() => { localStorage.setItem(PKEY(p.id), JSON.stringify(p)); return true; }, false);
  const list = listProjects().filter((x) => x.id !== p.id);
  const board = p.parts.find((x) => getDef(x.type) && getDef(x.type).board);
  list.unshift({ id: p.id, name: p.name, board: board ? board.type : null, updated: p.updated, parts: p.parts.length, example: p.fromExample || null, folder: p.folder || '', lang: p.lang === 'python' ? 'python' : 'cpp' });
  safe(() => localStorage.setItem(INDEX, JSON.stringify(list)));
  return ok;
}

export function deleteProject(id) {
  safe(() => localStorage.removeItem(PKEY(id)));
  safe(() => localStorage.setItem(INDEX, JSON.stringify(listProjects().filter((x) => x.id !== id))));
}

// ---------------------------------------------------------------- folders (a project has an optional `folder` name)
const FOLDERS = 'raptiauto.folders.v1';

/** All folder names: those that hold projects plus the empty ones the user created. */
export function listFolders() {
  const saved = safe(() => JSON.parse(localStorage.getItem(FOLDERS) || '[]'), []);
  const names = new Set(Array.isArray(saved) ? saved : []);
  for (const m of listProjects()) if (m.folder) names.add(m.folder);
  return [...names].sort((a, b) => a.localeCompare(b));
}

function saveFolderNames(names) { safe(() => localStorage.setItem(FOLDERS, JSON.stringify(names))); }

export function addFolder(name) {
  const n = String(name || '').trim().slice(0, 40);
  if (!n) return null;
  const saved = safe(() => JSON.parse(localStorage.getItem(FOLDERS) || '[]'), []);
  if (!saved.includes(n)) saveFolderNames([...saved, n]);
  return n;
}

/** Moves every project from folder `from` to `to` ('' = no folder). Used for rename and delete. */
export function renameFolder(from, to) {
  const target = String(to || '').trim().slice(0, 40);
  for (const m of listProjects()) {
    if (m.folder !== from) continue;
    const p = loadProject(m.id);
    if (!p) continue;
    p.folder = target;
    const keep = p.updated;
    saveProject(p);
    void keep;
  }
  const saved = safe(() => JSON.parse(localStorage.getItem(FOLDERS) || '[]'), []).filter((x) => x !== from);
  if (target && !saved.includes(target)) saved.push(target);
  saveFolderNames(saved);
}

export function setProjectFolder(id, folder) {
  const p = loadProject(id);
  if (!p) return;
  p.folder = String(folder || '').trim().slice(0, 40);
  saveProject(p);
  if (p.folder) addFolder(p.folder);
}

export function normalize(p) {
  p.parts = Array.isArray(p.parts) ? p.parts : [];
  p.wires = Array.isArray(p.wires) ? p.wires : [];
  p.code = typeof p.code === 'string' ? p.code : '';
  p.name = p.name || 'Untitled project';
  p.id = p.id || newId('prj');
  p.settings = p.settings || {};
  p.lang = p.lang === 'python' ? 'python' : 'cpp';
  p.folder = typeof p.folder === 'string' ? p.folder.trim().slice(0, 40) : '';
  for (const w of p.wires) { w.points = w.points || []; w.id = w.id || newId('w'); }
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

/** Starter program for a board in the given language ('cpp' or 'python'). */
export function starterCode(boardType, lang = 'cpp') {
  const def = getDef(boardType);
  const arch = def && def.board ? def.board.arch : 'avr';
  if (lang === 'python') return defaultPythonCode(def && def.board);
  if (arch === 'xtensa') return DEFAULT_CODE.esp32;
  return boardType === 'attiny85' ? DEFAULT_CODE.avr.replace(/\s*Serial\.[^\n]*\n/g, '\n') : DEFAULT_CODE.avr;
}

/** New Arduino-side project. `lang` is 'cpp' (Arduino C/C++) or 'python' (MicroPython / Pi Python). */
export function createProject(boardType = 'uno-r3', name = 'My Project', lang = 'cpp') {
  const p = normalize({
    id: newId('prj'),
    name,
    created: Date.now(),
    parts: [{ id: newId('p'), type: boardType, x: 0, y: 0, rot: 0, props: {} }],
    wires: [],
    lang: lang === 'python' ? 'python' : 'cpp',
    code: starterCode(boardType, lang),
  });
  return p;
}

export function cloneProject(p, name) {
  const c = normalize(JSON.parse(JSON.stringify(p)));
  c.id = newId('prj');
  c.name = name || p.name;
  c.created = Date.now();
  delete c.eeprom;
  return c;
}

export function exportJSON(p) {
  return JSON.stringify({ format: 'raptiauto', version: 1, project: { ...p, eeprom: undefined } }, null, 1);
}

export function importJSON(text) {
  const data = JSON.parse(text);
  const proj = data && data.format === 'raptiauto' ? data.project : data;
  if (!proj || !Array.isArray(proj.parts)) throw new Error('Not a RaptiAuto project file');
  const p = cloneProject(normalize(proj), proj.name || 'Imported project');
  return p;
}

export function loadSettings() {
  return {
    wireStyle: 'smooth', showGrid: true, haptics: true, sound: true, fontSize: 14, autosave: true, flow: true, theme: 'dark',
    ...safe(() => JSON.parse(localStorage.getItem(SETTINGS) || '{}'), {}),
  };
}

export function saveSettings(s) { safe(() => localStorage.setItem(SETTINGS, JSON.stringify(s))); }
