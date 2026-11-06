// Website builds (build-site.mjs): one page per section — Arduino, PLC Lab or Raspberry Pi.
// The page sets window.RAPTI_SITE = { section, assets, v } before app.js; the app (APK) sets nothing.
const cfg = (typeof window !== 'undefined' && window.RAPTI_SITE) || {};

/** 'arduino' | 'plc' | 'pi' on a section website, null in the app (all three sections). */
export const SECTION = ['arduino', 'plc', 'pi'].includes(cfg.section) ? cfg.section : null;

/** URL of a script file loaded later (lab.js, pi.js, micropython.wasm): the site keeps them in js/. */
export function asset(file) {
  return (cfg.assets || '') + file + (cfg.v ? '?v=' + encodeURIComponent(cfg.v) : '');
}
