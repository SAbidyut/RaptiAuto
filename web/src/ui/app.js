// Application shell: screen routing, settings, Android lifecycle hooks.
import { loadSettings, saveSettings, saveProject } from '../store.js';
import { installNativeCallbacks, Native } from '../native.js';
import { Shell } from './shell.js';
import { Editor } from './editor.js';
import { popBack, toast } from './widgets.js';
import { SHARED_DEFS } from '../components/draw.js';

export class App {
  constructor(root) {
    this.root = root;
    this.settings = loadSettings();
    Native.haptics = this.settings.haptics !== false;
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
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && (this.editor || this.lab)) { e.preventDefault(); (this.editor || this.lab).saveNow(); toast('Saved', 'ok'); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.onPause(); else this.onResume(); });
  }

  saveSettings() { saveSettings(this.settings); }

  showHome(page) {
    if (this.editor) { this.editor.unmount(); this.editor = null; }
    if (this.lab) { this.lab.unmount(); this.lab = null; }
    if (!this.home) this.home = new Shell(this);
    if (!this.home.root.isConnected) this.home.mount(this.root);
    else this.home.refreshProjects();
    if (page) this.home.go(page);
  }

  openProject(p) {
    if (this.home) this.home.unmount();
    if (this.editor) this.editor.unmount();
    if (this.lab) { this.lab.unmount(); this.lab = null; }
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
    this.lab = new mod.LabScreen(this, p);
    this.lab.mount(this.root);
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

  onPause() { if (this.editor) this.editor.onPause(); if (this.lab) this.lab.saveNow(); }
  onResume() { if (this.editor) this.editor.onResume(); }
  onKeyboard(h) { if (this.editor) this.editor.root.classList.toggle('kb', h > 0); if (this.lab) this.lab.root.classList.toggle('kb', h > 0); }

  persist(p) { saveProject(p); }
}

let labModule = null;
/** Load build/www/lab.js once (three.js + the lab screens). */
function loadLabModule() {
  if (window.__raptiLab) return Promise.resolve(window.__raptiLab);
  if (labModule) return labModule;
  const veil = document.createElement('div');
  veil.className = 'lab-loading';
  veil.innerHTML = '<div class="ll-box"><div class="ll-spin"></div><span>Loading the lab…</span></div>';
  const t = setTimeout(() => document.body.appendChild(veil), 120);
  labModule = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'lab.js';
    s.onload = () => (window.__raptiLab ? resolve(window.__raptiLab) : reject(new Error('lab bundle')));
    s.onerror = () => { labModule = null; reject(new Error('lab bundle')); };
    document.head.appendChild(s);
  }).finally(() => { clearTimeout(t); veil.remove(); });
  return labModule;
}
