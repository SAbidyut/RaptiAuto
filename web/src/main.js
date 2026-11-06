// RaptiAuto entry point.
import './components/index.js';
import { App } from './ui/app.js';
import { EXAMPLES } from './examples/index.js';
import { installMouseScroll } from './ui/mouse-scroll.js';

function boot() {
  const root = document.getElementById('app');
  installMouseScroll();
  const app = new App(root);
  window.__rapti = app;
  window.__examples = EXAMPLES;
  try {
    app.start();
  } finally {
    // the splash always goes, even if a page fails to draw
    const splash = document.getElementById('splash');
    if (splash) { splash.classList.add('gone'); setTimeout(() => splash.remove(), 600); }
  }
}

window.addEventListener('error', (e) => {
  // surface unexpected errors instead of failing silently
  console.error(e.error || e.message);
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
