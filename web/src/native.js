// Bridge to the Android host (window.RaptiNative) with browser fallbacks.
const N = () => (typeof window !== 'undefined' ? window.RaptiNative : undefined);

let fileReqId = 0;
const pendingFiles = new Map();
let pendingSave = null;

export const Native = {
  get isNative() { return !!N(); },

  setImmersive(on) {
    const n = N();
    if (n) { try { n.setImmersive(!!on); } catch (e) { /* ignore */ } return; }
    try {
      if (on && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    } catch (e) { /* ignore */ }
  },

  keepScreenOn(on) { const n = N(); if (n) try { n.keepScreenOn(!!on); } catch (e) { /* ignore */ } },

  setOrientation(mode) { const n = N(); if (n) try { n.setOrientation(mode); } catch (e) { /* ignore */ } },

  /** Haptic feedback on/off (Settings → Vibration). */
  haptics: true,

  vibrate(ms = 12) {
    if (!Native.haptics) return;
    const n = N();
    if (n) { try { n.vibrate(ms); } catch (e) { /* ignore */ } return; }
    if (navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { /* ignore */ }
  },

  saveFile(name, mime, content) {
    const n = N();
    if (n) {
      return new Promise((resolve) => {
        pendingSave = resolve;
        try { n.saveFile(name, mime, content); } catch (e) { pendingSave = null; resolve(false); }
      });
    }
    const blob = new Blob([content], { type: mime || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    return Promise.resolve(true);
  },

  openFile(accept = '') {
    const n = N();
    if (n) {
      return new Promise((resolve) => {
        const id = 'f' + ++fileReqId;
        pendingFiles.set(id, resolve);
        try { n.openFile(id); } catch (e) { pendingFiles.delete(id); resolve(null); }
      });
    }
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      if (accept) inp.accept = accept;
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) { resolve(null); return; }
        const r = new FileReader();
        r.onload = () => resolve({ name: f.name, text: String(r.result) });
        r.onerror = () => resolve(null);
        r.readAsText(f);
      };
      inp.click();
    });
  },

  shareText(title, text) {
    const n = N();
    if (n) { try { n.shareText(title, text); } catch (e) { /* ignore */ } return; }
    if (navigator.share) navigator.share({ title, text }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
  },

  openUrl(url) {
    const n = N();
    if (n) { try { n.openUrl(url); } catch (e) { /* ignore */ } return; }
    window.open(url, '_blank', 'noopener');
  },

  version() {
    const n = N();
    if (n) try { return n.getAppVersion(); } catch (e) { /* ignore */ }
    return '2.7.0';
  },

  exit() { const n = N(); if (n) try { n.exitApp(); } catch (e) { /* ignore */ } },
};

/** Callbacks invoked by the Android host. */
export function installNativeCallbacks(app) {
  if (N()) document.documentElement.classList.add('native-app');
  window.RaptiApp = {
    onBack: () => app.handleBack(),
    onNativeSaved: (ok, name) => { if (pendingSave) { const r = pendingSave; pendingSave = null; r(!!ok, name); } },
    onNativeFile: (id, name, text) => {
      const r = pendingFiles.get(id);
      if (r) { pendingFiles.delete(id); r(text === null || text === undefined ? null : { name, text }); }
    },
    onNativeInsets: (t, r, b, l, immersive) => {
      const s = document.documentElement.style;
      s.setProperty('--cut-top', t + 'px');
      s.setProperty('--cut-right', r + 'px');
      s.setProperty('--cut-bottom', b + 'px');
      s.setProperty('--cut-left', l + 'px');
      document.documentElement.classList.toggle('immersive', !!immersive);
    },
    onNativeKeyboard: (h) => {
      document.documentElement.style.setProperty('--kb', h + 'px');
      document.documentElement.classList.toggle('kb-open', h > 0);
      app.onKeyboard && app.onKeyboard(h);
    },
    onNativePause: () => app.onPause && app.onPause(),
    onNativeResume: () => app.onResume && app.onResume(),
  };
}
