// Text overlap check for every component's artwork (and the Raspberry Pi board drawings): renders each
// part in headless Chromium and fails if two labels cover each other.
//   node tests/overlap.mjs [type-filter]      (needs: cd web && npm run build)
import { chromium } from '../web/node_modules/playwright-core/index.mjs';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'www');
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => existsSync(p));
if (!existsSync(join(root, 'app.js')) || !exe) { console.log('skipped: build the web app first (cd web && npm run build) and install Chromium'); process.exit(0); }
const filter = process.argv[2];
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = join(root, p);
  if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
await page.goto(`http://localhost:${server.address().port}/index.html`);
await page.waitForTimeout(900);

const result = await page.evaluate(async (filter) => {
  const reg = window.__raptiMods['src/components/registry.js'];
  const draw = window.__raptiMods['src/components/draw.js'];
  // the Raspberry Pi circuit boards register on first use
  try { await import('data:text/javascript,'); } catch (e) { /* ignore */ }
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:1600px;height:1200px;visibility:hidden';
  document.body.appendChild(host);
  const report = [];
  const hit = (a, b) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0.6 && h > 0.6 ? w * h : 0;
  };
  for (const def of reg.allDefs()) {
    if (filter && !def.type.includes(filter)) continue;
    const props = reg.defaultProps(def);
    const variants = [props];
    for (const pr of def.props || []) if (pr.type === 'select' && pr.options) for (const [v] of pr.options) if (v !== props[pr.key]) variants.push({ ...props, [pr.key]: v });
    for (const vp of variants.slice(0, 8)) {
      let markup = '';
      try { markup = def.render(vp); } catch (e) { continue; }
      const box = typeof def.box === 'function' ? def.box(vp) : def.box;
      const S = 5;
      host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${(box[2] - box[0] + 80) * S}" height="${(box[3] - box[1] + 80) * S}" viewBox="${box[0] - 40} ${box[1] - 40} ${box[2] - box[0] + 80} ${box[3] - box[1] + 80}"><defs>${draw.SHARED_DEFS}</defs>${markup}</svg>`;
      const texts = [...host.querySelectorAll('text')].filter((t) => t.textContent.trim() && !t.closest('[opacity="0"]') && !/display:\s*none/.test(t.getAttribute('style') || ''));
      const rects = texts.map((t) => ({ t, r: t.getBoundingClientRect(), s: t.textContent.trim() }));
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j];
          if (hit(a.r, b.r) > 3) report.push(`${def.type}${vp === props ? '' : ' ' + JSON.stringify(vp)}: "${a.s}" ∩ "${b.s}"`);
        }
      }
    }
  }
  host.remove();
  return report;
}, filter);

await browser.close();
server.close();
const uniq = [...new Set(result)];
if (uniq.length) { console.log(uniq.join('\n')); console.log(`\n${uniq.length} overlapping label pair(s)`); process.exit(1); }
console.log('no overlapping labels');
