// Application shell: screen routing, settings, Android lifecycle hooks.
import { loadSettings, saveSettings, saveProject } from '../store.js';
import { installNativeCallbacks, Native } from '../native.js';
import { Shell } from './shell.js';
import { Editor } from './editor.js';
import { popBack, toast } from './widgets.js';
import { SHARED_DEFS } from '../components/draw.js';
import { LiveWeb, setLiveWeb } from '../net/live.js';

export class App {
  constructor(root) {
    this.root = root;
    this.settings = loadSettings();
    Native.haptics = this.settings.haptics !== false;
    // the simulated internet uses the phone's real one when online (Settings → Real internet)
    setLiveWeb(new LiveWeb({ enabled: () => this.settings.realInternet !== false, setEnabled: (on) => { this.settings.realInternet = !!on; this.saveSettings(); } }));
    this.home = null; // the menu shell (Home, Projects, Examples, … pages)
    this.editor = null;
    this.lab = null;
    installNativeCallbacks(this);
    // shared SVG gradients / filters used by every component drawing
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    defs.setAttribute('class', 'shared-defs');
    defs.setAttribute('aria-hidden', 'true');
    defs.innerHTML = `<defs>${SHARED_DEFS}</defs>`;
    document.body.appendChild(defs);
  }

  start() {
    this.showHome();
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.handleBack();
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && (this.editor || this.lab) && !this.pi) { e.preventDefault(); (this.editor || this.lab).saveNow(); toast('Saved', 'ok'); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.onPause(); else this.onResume(); });
  }

  saveSettings() { saveSettings(this.settings); }

  showHome(page) {
    if (this.editor) { this.editor.unmount(); this.editor = null; }
    if (this.lab) { this.lab.unmount(); this.lab = null; }
    if (this.pi) { this.pi.unmount(); this.pi = null; }
    if (!this.home) this.home = new Shell(this);
    if (!this.home.root.isConnected) this.home.mount(this.root);
    else this.home.refreshProjects();
    if (page) this.home.go(page);
  }

  openProject(p) {
    if (this.home) this.home.unmount();
    if (this.editor) this.editor.unmount();
    if (this.lab) { this.lab.unmount(); this.lab = null; }
    if (this.pi) { this.pi.unmount(); this.pi = null; }
    this.editor = new Editor(this, p);
    this.editor.mount(this.root);
  }

  /** Open a Delta PLC lab project (the 3D lab code is loaded on first use). */
  async openLab(p) {
    let mod;
    try { mod = await loadLabModule(); } catch (e) { toast('Could not load the PLC lab', 'error'); return; }
    if (this.home) this.home.unmount();
    if (this.editor) { this.editor.unmount(); this.editor = null; }
    if (this.lab) this.lab.unmount();
    if (this.pi) { this.pi.unmount(); this.pi = null; }
    this.lab = new mod.LabScreen(this, p);
    this.lab.mount(this.root);
  }

  /** Open the Raspberry Pi lab (its bundle with the MicroPython runtime is loaded on first use). */
  /** opts: { board, newProject: true } or { board, example: 'file.py' } from the Pi Lab page. */
  async openPi(opts = {}) {
    let mod;
    try { mod = await loadBundle('pi.js', '__raptiPi', 'Starting the Raspberry Pi…'); } catch (e) { toast('Could not load the Raspberry Pi lab', 'error'); return; }
    if (this.home) this.home.unmount();
    if (this.editor) { this.editor.unmount(); this.editor = null; }
    if (this.lab) { this.lab.unmount(); this.lab = null; }
    if (this.pi) this.pi.unmount();
    this.pi = new mod.PiScreen(this);
    this.pi.mount(this.root);
    if (opts.board || opts.example || opts.newProject) this.pi.start(opts);
  }

  showAbout() {
    this.showHome();
    this.home.go('about');
  }

  /** Android back button. Returns true if handled (false lets the app close). */
  handleBack() {
    if (popBack()) return true;
    const now = Date.now();
    if (this.lastBack && now - this.lastBack < 1800) return false;
    this.lastBack = now;
    toast('Press back again to exit');
    return true;
  }

  onPause() { if (this.editor) this.editor.onPause(); if (this.lab) this.lab.saveNow(); if (this.pi) this.pi.onPause(); }
  onResume() { if (this.editor) this.editor.onResume(); if (this.pi && this.pi.onResume) this.pi.onResume(); }
  onKeyboard(h) { if (this.editor) this.editor.root.classList.toggle('kb', h > 0); if (this.lab) this.lab.root.classList.toggle('kb', h > 0); if (this.pi) this.pi.root.classList.toggle('kb', h > 0); }

  persist(p) { saveProject(p); }
}

const bundles = {};
/** Load a lazily loaded bundle once: lab.js (three.js + the lab screens), pi.js (Raspberry Pi lab). */
function loadBundle(file, global, label) {
  if (window[global]) return Promise.resolve(window[global]);
  if (bundles[file]) return bundles[file];
  const veil = document.createElement('div');
  veil.className = 'lab-loading';
  veil.innerHTML = `<div class="ll-box"><div class="ll-spin"></div><span>${label}</span></div>`;
  const t = setTimeout(() => document.body.appendChild(veil), 120);
  bundles[file] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = file;
    s.onload = () => (window[global] ? resolve(window[global]) : reject(new Error(file)));
    s.onerror = () => { bundles[file] = null; reject(new Error(file)); };
    document.head.appendChild(s);
  }).finally(() => { clearTimeout(t); veil.remove(); });
  return bundles[file];
}
const loadLabModule = () => loadBundle('lab.js', '__raptiLab', 'Loading the lab…');
