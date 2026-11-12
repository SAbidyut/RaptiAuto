// The Android bridge (window.RaptiNative) answers only calls that carry this key. The app's page asks
// for it once, when this module first runs — before any web page is shown in an iframe — so pages
// opened in the virtual browser cannot use the bridge (open apps, save files, make requests …).
const n = typeof window !== 'undefined' ? window.RaptiNative : undefined;
let key = '';
try { if (n && typeof n.handshake === 'function') key = n.handshake() || ''; } catch (e) { /* ignore */ }

export const BRIDGE_KEY = key;
