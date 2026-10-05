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
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

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
  async fsrun(page, id = 'knight-rider', ms = 1500) {
    // full screen, run (circuit + serial together), then stop (one panel again)
    await scenarios.example(page, id);
    await page.evaluate(() => window.__rapti.editor.setFullscreen(true)); await sleep(400);
    await page.click('.fs-btn.fs-run'); await sleep(+ms);
    await page.screenshot({ path: join(outDir, `fsrun-${id}.png`) });
    await page.click('.fs-btn.fs-run'); await sleep(600);
    await page.screenshot({ path: join(outDir, `fsstop-${id}.png`) });
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
  // ---- Delta PLC lab
  async labopen(page, id = 'vfd-modbus-hmi') {
    await page.evaluate((id) => window.__rapti.home.openLabExample(id), id);
    await sleep(2500);
    await page.screenshot({ path: join(outDir, `lab-${id}.png`) });
  },
  async labrun(page, id = 'vfd-modbus-hmi', ms = 4000) {
    await scenarios.labopen(page, id);
    await page.click('.lab .run-btn'); await sleep(1500);
    await page.evaluate(() => { const l = window.__rapti.lab; const s = l.sys; const b = l.project.devices.find((d) => d.type === 'pb' && (!d.props.contact || d.props.contact === 'NO')); if (b) { s.act(b.id, 'press', true); setTimeout(() => s.act(b.id, 'press', false), 200); } });
    await sleep(+ms);
    await page.screenshot({ path: join(outDir, `labrun-${id}.png`) });
    for (const t of ['ladder', 'hmi', 'vfd', 'monitor']) {
      await page.evaluate((t) => window.__rapti.lab.setTab(t), t); await sleep(900);
      await page.screenshot({ path: join(outDir, `labrun-${id}-${t}.png`) });
    }
  },
  async labwire(page) {
    // build a small circuit by tapping in 3D: add a lamp, wire PLC Y0 → lamp X1 using the wiring list fallback
    await page.evaluate(() => window.__rapti.home.openLabExample('blank')); await sleep(2500);
    await page.click('.lab-tools .tool[title="Add device"]'); await sleep(1500);
    await page.screenshot({ path: join(outDir, 'labwire-library.png') });
    await page.click('.dev-card >> text=Pilot lamp'); await sleep(1500);
    await page.screenshot({ path: join(outDir, 'labwire-added.png') });
    // tap the lamp's first socket on screen
    const pos = await page.evaluate(() => { const l = window.__rapti.lab; const lamp = l.project.devices.find((d) => d.type === 'lamp'); const pw = l.scene.portWorld(lamp.id, 'X1'); return l.scene.toScreen(pw.pos); });
    await page.mouse.click(pos.x, pos.y); await sleep(700);
    await page.screenshot({ path: join(outDir, 'labwire-start.png') });
    await page.evaluate(() => window.__rapti.lab.scene.focus('plc', false)); await sleep(1500);
    const p2 = await page.evaluate(() => { const l = window.__rapti.lab; const plc = l.project.devices.find((d) => d.id === 'plc'); const pw = l.scene.portWorld(plc.id, 'Y0'); return l.scene.toScreen(pw.pos); });
    await page.mouse.click(p2.x, p2.y); await sleep(900);
    await page.screenshot({ path: join(outDir, 'labwire-done.png') });
    const n = await page.evaluate(() => window.__rapti.lab.project.conns.filter((c) => c.a.port === 'X1' || c.b.port === 'X1').map((c) => c.a.dev + '.' + c.a.port + '-' + c.b.dev + '.' + c.b.port));
    console.log('lamp conns', JSON.stringify(n));
  },
  async labladder(page) {
    await page.evaluate(() => window.__rapti.home.openLabExample('blank')); await sleep(2000);
    await page.evaluate(() => window.__rapti.lab.setTab('ladder')); await sleep(800);
    await page.click('.lb[title^="Normally open"]'); await sleep(700);
    await page.screenshot({ path: join(outDir, 'labladder-keypad.png') });
    await page.click('.kp-key:text-is("1")'); await sleep(200);
    await page.click('.kp-actions .btn-primary'); await sleep(500);
    await page.click('.lb[title^="Parallel NO"]'); await sleep(600);
    await page.click('.kp-key.dev:text-is("Y")'); await sleep(150);
    await page.click('.kp-key:text-is("0")'); await sleep(150);
    await page.click('.kp-actions .btn-primary'); await sleep(500);
    await page.click('.lb[title^="Output coil"]'); await sleep(600);
    await page.click('.kp-actions .btn-primary'); await sleep(500);
    await page.screenshot({ path: join(outDir, 'labladder-rung.png') });
    await page.click('.lb-dl'); await sleep(3500);
    await page.screenshot({ path: join(outDir, 'labladder-dl.png') });
    const btn = await page.$('.dialog-actions .btn-primary'); if (btn) { await btn.click(); await sleep(1200); }
    await page.screenshot({ path: join(outDir, 'labladder-run.png') });
    const il = await page.evaluate(() => { const v = window.__rapti.lab.views.ladder; return JSON.stringify(v.compiled.il.map((r) => r.lines.map((l) => l.text))); });
    console.log('IL', il);
  },
  async labhero(page, id = 'vfd-modbus-hmi', focus = 'overview') {
    await page.evaluate((id) => window.__rapti.home.openLabExample(id), id); await sleep(1500);
    await page.click('.lab .run-btn'); await sleep(500);
    await page.evaluate(() => {
      const l = window.__rapti.lab; const s = l.sys;
      for (let i = 0; i < 100; i++) s.step(20);
      const b = l.project.devices.find((d) => d.type === 'pb' && (d.props.contact || 'NO') === 'NO');
      if (b) { s.act(b.id, 'press', true); for (let i = 0; i < 10; i++) s.step(20); s.act(b.id, 'press', false); }
      for (let i = 0; i < 400; i++) s.step(20);
    });
    await page.evaluate((f) => { const l = window.__rapti.lab; const t = f === 'overview' || f === 'panel' || f === 'console' ? f : (l.project.devices.find((d) => d.type === f || d.id === f) || {}).id; l.scene.focus(t || 'overview', false); }, focus);
    await sleep(2500);
    await page.screenshot({ path: join(outDir, `labhero-${id}-${focus}.png`) });
  },
  async labqa(page) {
    await page.evaluate(() => window.__rapti.home.openLabExample('vfd-modbus-hmi')); await sleep(1500);
    await page.click('.lab .run-btn'); await sleep(400);
    await page.evaluate(() => { const s = window.__rapti.lab.sys; for (let i = 0; i < 120; i++) s.step(20); });
    // tap START on the HMI screen inside the 3D view
    await page.evaluate(() => { const l = window.__rapti.lab; l.scene.focus(l.project.devices.find((d) => d.type === 'dop-107bv').id, false); }); await sleep(1500);
    const pt = await page.evaluate(() => {
      const l = window.__rapti.lab; const sc = l.scene; const hmi = l.project.devices.find((d) => d.type === 'dop-107bv');
      const m = sc.modelOf(hmi.id); const scr = m.screen; scr.updateMatrixWorld(true);
      // START button centre on the 800×480 screen: (137, 156) → local plane coords
      const THREE = scr.position.constructor;
      const u = 137 / 800, v = 1 - 156 / 480;
      const local = new THREE(-77 + u * 154, -46.2 + v * 92.4, 0);
      const w = scr.localToWorld(local);
      return sc.toScreen([w.x, w.y, w.z]);
    });
    await page.mouse.move(pt.x, pt.y); await page.mouse.down(); await sleep(250);
    await page.evaluate(() => { const s = window.__rapti.lab.sys; for (let i = 0; i < 15; i++) s.step(20); });
    await page.mouse.up();
    await page.evaluate(() => { const s = window.__rapti.lab.sys; for (let i = 0; i < 300; i++) s.step(20); });
    const st = await page.evaluate(() => { const l = window.__rapti.lab; const v = l.sys.byKind('vfd')[0].vfd; return { m0: l.sys.plc.cpu.M[0], f: v.f.toFixed(2) }; });
    console.log('after 3D HMI START', JSON.stringify(st));
    await sleep(800);
    await page.screenshot({ path: join(outDir, 'labqa-hmi3d.png') });
    // tap VFD MODE key in 3D
    await page.evaluate(() => { const l = window.__rapti.lab; l.scene.focus(l.project.devices.find((d) => d.type === 'ms300').id, false); }); await sleep(1500);
    const kp = await page.evaluate(() => { const l = window.__rapti.lab; const sc = l.scene; const vfd = l.project.devices.find((d) => d.type === 'ms300'); const m = sc.modelOf(vfd.id); const key = m.controls.find((c) => c.userData.control.key === 'MODE'); key.updateMatrixWorld(true); const w = key.getWorldPosition(key.position.clone()); return sc.toScreen([w.x, w.y, w.z]); });
    await page.mouse.click(kp.x, kp.y); await sleep(300);
    const mode = await page.evaluate(() => window.__rapti.lab.sys.byKind('vfd')[0].vfd.kp.mode);
    console.log('VFD keypad mode after MODE tap:', mode);
    await page.evaluate(() => { const s = window.__rapti.lab.sys; for (let i = 0; i < 30; i++) s.step(20); }); await sleep(900);
    await page.screenshot({ path: join(outDir, 'labqa-vfdkey.png') });
    // comm log
    await page.evaluate(() => window.__rapti.lab.setTab('monitor')); await sleep(500);
    await page.click('.mv-seg .seg[data-s="log"]'); await sleep(400);
    await page.evaluate(() => { const s = window.__rapti.lab.sys; for (let i = 0; i < 20; i++) s.step(20); }); await sleep(900);
    await page.screenshot({ path: join(outDir, 'labqa-commlog.png') });
    // HMI designer
    await page.evaluate(() => window.__rapti.lab.setTab('hmi')); await sleep(500);
    await page.click('.hv-bar .seg[data-m="design"]'); await sleep(500);
    const c = await page.evaluate(() => { const r = window.__rapti.lab.views.hmi.designCanvas.getBoundingClientRect(); return { x: r.left + r.width * 137 / 800, y: r.top + r.height * 156 / 480, k: r.width / 800 }; });
    await page.mouse.click(c.x, c.y); await sleep(300);
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 60 * c.k, c.y + 30 * c.k, { steps: 6 }); await page.mouse.up(); await sleep(400);
    await page.screenshot({ path: join(outDir, 'labqa-hmidesign.png') });
    // VFD tab param sheet
    await page.evaluate(() => window.__rapti.lab.setTab('vfd')); await sleep(500);
    await page.click('.vp-row >> text=01-12'); await sleep(700);
    await page.screenshot({ path: join(outDir, 'labqa-vfdparam.png') });
  },
  async labtasks(page) {
    await page.evaluate(() => window.__rapti.home.openLabExample('vfd-modbus-hmi')); await sleep(2600);
    await page.screenshot({ path: join(outDir, 'labtasks-pill.png') });
    await page.click('.task-pill'); await sleep(700);
    await page.screenshot({ path: join(outDir, 'labtasks-sheet.png') });
  },
  async labfocus(page, id = 'vfd-modbus-hmi', target = 'plc') {
    await scenarios.labopen(page, id);
    await page.click('.lab .run-btn'); await sleep(1200);
    await page.evaluate((t) => window.__rapti.lab.scene.focus(t, false), target); await sleep(1500);
    await page.screenshot({ path: join(outDir, `labfocus-${id}-${target}.png`) });
  },
};

const list = wanted.length ? wanted : Object.keys(scenarios);
for (const spec of list) {
  const [name, arg, arg2, arg3] = spec.split(':');
  const page = await newPage();
  try {
    if (name === 'zoom') await scenarios.zoom(page, arg, arg2, arg3);
    else if (name === 'labhero') await scenarios.labhero(page, arg, arg2);
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
