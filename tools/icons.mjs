// Render the RaptiAuto logo into Android launcher icons and the splash logo.
// usage: node tools/icons.mjs   (writes into android/res)
import { chromium } from '../web/node_modules/playwright-core/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logoMark } from '../web/src/ui/brand.js';

const res = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'res');
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const GRAD = `
  <linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="0.55" stop-color="#3b82f6"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient>
  <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>`;
// The chip + lightning mark without the rounded tile (64-unit design space).
const MARK = `
  <g stroke="url(#a)" stroke-width="3" stroke-linecap="round" fill="none">
    <path d="M22 13v6M32 13v6M42 13v6M22 45v6M32 45v6M42 45v6M13 22h6M13 32h6M13 42h6M45 22h6M45 32h6M45 42h6"/>
  </g>
  <rect x="19" y="19" width="26" height="26" rx="6" fill="#111c3a" stroke="url(#a)" stroke-width="2.6"/>
  <path d="M34.5 22.5 26 33.5h6l-2.5 8 8.5-11h-6z" fill="url(#b)"/>`;

// Adaptive icon layers are 108×108 dp; only the central 66 dp circle is always visible.
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><defs>${GRAD}</defs>
  <g transform="translate(54 54) scale(1.36) translate(-32 -32)">${MARK}</g></svg>`;
const background = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><defs>
  <radialGradient id="g" cx="0.5" cy="0.38" r="0.75"><stop offset="0" stop-color="#16244d"/><stop offset="0.6" stop-color="#0d1630"/><stop offset="1" stop-color="#070b16"/></radialGradient>
  <pattern id="d" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="4.5" cy="4.5" r="0.55" fill="#3b82f6" opacity="0.28"/></pattern></defs>
  <rect width="108" height="108" fill="url(#g)"/><rect width="108" height="108" fill="url(#d)"/></svg>`;
const legacy = logoMark(64, 'i').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
const splash = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>${GRAD}</defs>${MARK}</svg>`;

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage();
async function render(svg, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, png);
  console.log(`${file.replace(res + '/', '')}  ${size}px  ${png.length} B`);
}

for (const [dir, size] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  await render(legacy, size, join(res, `mipmap-${dir}`, 'ic_launcher.png'));
}
await render(foreground, 432, join(res, 'drawable-nodpi', 'ic_launcher_foreground.png'));
await render(background, 432, join(res, 'drawable-nodpi', 'ic_launcher_background.png'));
await render(splash, 288, join(res, 'drawable-nodpi', 'splash_logo.png'));
await browser.close();
