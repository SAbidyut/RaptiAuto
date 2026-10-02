// Visual test harness: serves build/www and drives the app in a phone-sized Chromium.
// usage: node tools/shot.mjs <outdir> [scenario...]
import { chromium } from '../web/node_modules/playwright-core/index.mjs';
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'www');
const outDir = process.argv[2] || '/tmp/shots';
const wanted = process.argv.slice(3);
mkdirSync(outDir, { recursive: true });
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = join(root, p);
  if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

const errors = [];
async function newPage(w = +process.env.VW || 390, h = +process.env.VH || 844) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/index.html`);
  await page.waitForTimeout(900);
  return page;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scenarios = {
  async home(page) {
    await page.screenshot({ path: join(outDir, 'home.png') });
    await page.evaluate(() => document.querySelector('.page').scrollTo(0, 650)); await sleep(300);
    await page.screenshot({ path: join(outDir, 'home2.png') });
  },
  async page(page, id = 'projects', scroll = 0) {
    await page.evaluate((id) => window.__rapti.home.go(id), id); await sleep(500);
    if (+scroll) { await page.evaluate((y) => document.querySelector('.page').scrollTo(0, y), +scroll); await sleep(300); }
    await page.screenshot({ path: join(outDir, `page-${id}${+scroll ? '-' + scroll : ''}.png`) });
  },
  async drawer(page) { await page.click('.app-bar .icon-btn[aria-label="Menu"]'); await sleep(500); await page.screenshot({ path: join(outDir, 'drawer.png') }); },
  async part(page, n = 3) {
    await scenarios.page(page, 'components');
    await page.click(`.lib-card >> nth=${n}`); await sleep(600);
    await page.screenshot({ path: join(outDir, `part-${n}.png`) });
  },
  async fs(page, tab = 'circuit', tag = '') {
    // full screen with one tab active (run the example first so the circuit is alive)
    await scenarios.example(page, 'knight-rider');
    await page.evaluate((t) => { const e = window.__rapti.editor; e.setFullscreen(true); e.setTab(t); }, tab); await sleep(700);
    await page.screenshot({ path: join(outDir, `fs-${tab}${tag}.png`) });
  },
  async fssplit(page) {
    await scenarios.fs(page, 'code');
    await page.click('.fs-btn.split-toggle'); await sleep(700);
    await page.screenshot({ path: join(outDir, 'fs-split.png') });
    await page.click('.fs-btn.split-toggle'); // restore the default for later scenarios
  },
  async back(page) {
    // open an example, toggle full screen, go back to the menu: layout must be unchanged
    await scenarios.example(page, 'blink');
    await page.click('.tool-fs'); await sleep(400);
    await page.click('.fs-btn'); await sleep(300);
    await page.evaluate(() => window.__rapti.editor.leave()); await sleep(600);
    await page.screenshot({ path: join(outDir, 'back-home.png') });
  },
  async example(page, id = 'led-resistor') {
    await page.evaluate((id) => {
      const app = window.__rapti;
      const ex = window.__examples ? window.__examples.find((e) => e.id === id) : null;
      app.home.openExample(ex || app.home.constructor && null);
    }, id);
    await sleep(700);
    await page.screenshot({ path: join(outDir, `ex-${id}.png`) });
  },
  async run(page, id = 'led-resistor', ms = 1500) {
    await scenarios.example(page, id);
    await page.click('.run-btn');
    await sleep(ms);
    await page.screenshot({ path: join(outDir, `run-${id}.png`) });
  },
  async code(page) { await scenarios.example(page, 'button-led'); await page.click('.nav-tab[data-tab="code"]'); await sleep(400); await page.screenshot({ path: join(outDir, 'code.png') }); },
  async serial(page) { await scenarios.run(page, 'serial-commands', 600); await page.click('.nav-tab[data-tab="serial"]'); await page.fill('.serial-input', 'blink 2'); await page.press('.serial-input', 'Enter'); await sleep(1500); await page.screenshot({ path: join(outDir, 'serial.png') }); },
  async library(page) { await scenarios.example(page, 'blink'); await page.click('.fab-main'); await sleep(600); await page.screenshot({ path: join(outDir, 'library.png') }); },
  async zoom(page, id = 'led-resistor', rect = '300,0,560,140', run = '') {
    await scenarios.example(page, id);
    const [x0, y0, x1, y1] = String(rect).split(',').map(Number);
    if (run) { await page.click('.run-btn'); await sleep(+run); }
    await page.evaluate(([x0, y0, x1, y1]) => {
      const c = window.__rapti.editor.canvas;
      const r = c.host.getBoundingClientRect();
      const z = Math.min(r.width / (x1 - x0), r.height / (y1 - y0));
      c.view = { z, x: r.width / 2 - ((x0 + x1) / 2) * z, y: r.height / 2 - ((y0 + y1) / 2) * z };
      c.applyView();
    }, [x0, y0, x1, y1]);
    await sleep(400);
    await page.screenshot({ path: join(outDir, `zoom-${id}${run ? '-run' : ''}.png`) });
  },
  async about(page) { await scenarios.page(page, 'about'); await scenarios.page(page, 'about', 900); },
};

const list = wanted.length ? wanted : Object.keys(scenarios);
for (const spec of list) {
  const [name, arg, arg2, arg3] = spec.split(':');
  const page = await newPage();
  try {
    if (name === 'zoom') await scenarios.zoom(page, arg, arg2, arg3);
    else await scenarios[name](page, arg, arg2 ? +arg2 : undefined);
  } catch (e) {
    errors.push(`[scenario ${spec}] ${e.message}`);
    await page.screenshot({ path: join(outDir, `fail-${name}.png`) }).catch(() => {});
  }
  await page.context().close();
}
await browser.close();
server.close();
console.log(errors.length ? errors.join('\n') : 'no console errors');
