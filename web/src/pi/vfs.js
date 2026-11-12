// A small persistent file system for the virtual Raspberry Pi (home folder) and the Pico's flash.
// Files are text; the tree is stored in localStorage.

export function normPath(p, cwd = '/', home = '/home/pi') {
  if (!p) return cwd;
  if (p === '~' || p.startsWith('~/')) p = home + p.slice(1);
  if (!p.startsWith('/')) p = (cwd === '/' ? '' : cwd) + '/' + p;
  const out = [];
  for (const s of p.split('/')) {
    if (!s || s === '.') continue;
    if (s === '..') out.pop(); else out.push(s);
  }
  return '/' + out.join('/');
}

export const dirname = (p) => (p.lastIndexOf('/') <= 0 ? '/' : p.slice(0, p.lastIndexOf('/')));
export const basename = (p) => p.slice(p.lastIndexOf('/') + 1);

export class VFS {
  constructor(key, seed) {
    this.key = key;
    this.listeners = new Set();
    this.load(seed);
  }

  load(seed) {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(this.key) || 'null'); } catch (e) { data = null; }
    if (!data || !data.files) data = { files: {}, dirs: [] };
    this.files = new Map(Object.entries(data.files));   // path -> { text, mtime, x }
    this.dirs = new Set(data.dirs || []);
    this.dirs.add('/');
    if (!data.seeded && seed) {
      for (const d of seed.dirs || []) this.mkdir(d, true, false);
      for (const [p, text] of Object.entries(seed.files || {})) if (!this.files.has(p)) this.write(p, text, false);
      this.seeded = true;
      this.save();
    } else this.seeded = !!data.seeded;
  }

  /** Store the tree in localStorage. false: the storage is full (or blocked) — the change then
   *  only lives in memory until the app closes, and callers should tell the user. */
  save() {
    const files = {};
    for (const [p, f] of this.files) files[p] = f;
    let ok = true;
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(this.key, JSON.stringify({ files, dirs: [...this.dirs], seeded: this.seeded || false })); } catch (e) { ok = false; }
    }
    this.full = !ok;
    for (const fn of this.listeners) fn();
    return ok;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  exists(p) { return this.dirs.has(p) || this.files.has(p); }
  isDir(p) { return this.dirs.has(p); }
  isFile(p) { return this.files.has(p); }

  read(p) {
    const f = this.files.get(p);
    if (!f) throw new Error(`${p}: No such file or directory`);
    return f.text;
  }

  stat(p) {
    if (this.dirs.has(p)) return { dir: true, size: 4096, mtime: 0 };
    const f = this.files.get(p);
    return f ? { dir: false, size: new TextEncoder().encode(f.text).length, mtime: f.mtime || 0, x: !!f.x } : null;
  }

  write(p, text, save = true) {
    if (this.dirs.has(p)) throw new Error(`${p}: Is a directory`);
    const dir = dirname(p);
    if (!this.dirs.has(dir)) this.mkdir(dir, true, false);
    const old = this.files.get(p);
    this.files.set(p, { text: String(text), mtime: Date.now(), x: old ? old.x : false });
    return save ? this.save() : true;
  }

  chmodX(p, on) { const f = this.files.get(p); if (f) { f.x = on; this.save(); } }

  mkdir(p, parents = false, save = true) {
    if (this.files.has(p)) throw new Error(`cannot create directory '${p}': File exists`);
    const parts = p.split('/').filter(Boolean);
    let cur = '';
    for (let i = 0; i < parts.length; i++) {
      cur += '/' + parts[i];
      if (!this.dirs.has(cur)) {
        if (!parents && i < parts.length - 1) throw new Error(`cannot create directory '${p}': No such file or directory`);
        this.dirs.add(cur);
      }
    }
    if (save) this.save();
  }

  list(p) {
    if (!this.dirs.has(p)) throw new Error(`cannot access '${p}': No such file or directory`);
    const pre = p === '/' ? '/' : p + '/';
    const names = new Set();
    for (const d of this.dirs) if (d !== p && d.startsWith(pre) && !d.slice(pre.length).includes('/')) names.add(d.slice(pre.length));
    for (const f of this.files.keys()) if (f.startsWith(pre) && !f.slice(pre.length).includes('/')) names.add(f.slice(pre.length));
    return [...names].sort((a, b) => a.localeCompare(b));
  }

  remove(p, recursive = false) {
    if (this.files.has(p)) { this.files.delete(p); this.save(); return; }
    if (!this.dirs.has(p)) throw new Error(`cannot remove '${p}': No such file or directory`);
    if (p === '/') throw new Error("it is dangerous to operate recursively on '/'");
    const pre = p + '/';
    const kids = [...this.files.keys()].some((f) => f.startsWith(pre)) || [...this.dirs].some((d) => d.startsWith(pre));
    if (kids && !recursive) throw new Error(`cannot remove '${p}': Is a directory`);
    for (const f of [...this.files.keys()]) if (f.startsWith(pre)) this.files.delete(f);
    for (const d of [...this.dirs]) if (d === p || d.startsWith(pre)) this.dirs.delete(d);
    this.save();
  }

  copy(src, dst) {
    if (this.dirs.has(dst)) dst = (dst === '/' ? '' : dst) + '/' + basename(src);
    if (this.files.has(src)) { this.write(dst, this.files.get(src).text); return dst; }
    if (!this.dirs.has(src)) throw new Error(`cannot stat '${src}': No such file or directory`);
    const pre = src + '/';
    this.mkdir(dst, true, false);
    for (const d of [...this.dirs]) if (d.startsWith(pre)) this.dirs.add(dst + d.slice(src.length));
    for (const [f, v] of [...this.files]) if (f.startsWith(pre)) this.files.set(dst + f.slice(src.length), { ...v });
    this.save();
    return dst;
  }

  move(src, dst) {
    if (this.dirs.has(dst)) dst = (dst === '/' ? '' : dst) + '/' + basename(src);
    if (src === dst) return dst;
    if (dst.startsWith(src + '/')) throw new Error(`cannot move '${src}' to a subdirectory of itself, '${dst}'`);
    this.copy(src, dst);
    this.remove(src, true);
    return dst;
  }

  /** { path: text } for every file under root (to load into the interpreter). */
  snapshot(root = '/') {
    const out = {};
    const pre = root === '/' ? '/' : root + '/';
    for (const [p, f] of this.files) if (p.startsWith(pre) || p === root) out[p] = f.text;
    return out;
  }

  /** Take back what a program wrote (new or changed files under root). */
  merge(files, root = '/') {
    let changed = false;
    const pre = root === '/' ? '/' : root + '/';
    for (const [p, text] of Object.entries(files)) {
      if (!(p.startsWith(pre) || p === root)) continue;
      const f = this.files.get(p);
      if (!f || f.text !== text) { this.write(p, text, false); changed = true; }
    }
    if (changed) this.save();
    return changed;
  }
}
