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
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && this.editor) { e.preventDefault(); this.editor.saveNow(); toast('Saved', 'ok'); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.onPause(); else this.onResume(); });
  }

  saveSettings() { saveSettings(this.settings); }

  showHome() {
    if (this.editor) { this.editor.unmount(); this.editor = null; }
    if (!this.home) this.home = new Shell(this);
    if (!this.home.root.isConnected) this.home.mount(this.root);
    else this.home.refreshProjects();
  }

  openProject(p) {
    if (this.home) this.home.unmount();
    if (this.editor) this.editor.unmount();
    this.editor = new Editor(this, p);
    this.editor.mount(this.root);
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

  onPause() { if (this.editor) this.editor.onPause(); }
  onResume() { if (this.editor) this.editor.onResume(); }
  onKeyboard(h) { if (this.editor) this.editor.root.classList.toggle('kb', h > 0); }

  persist(p) { saveProject(p); }
}
