// Render the RaptiAuto logo into Android launcher icons and the splash logo.
// usage: node tools/icons.mjs   (writes into android/res)
import { chromium } from '../web/node_modules/playwright-core/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logoMark } from '../web/src/ui/brand.js';

const res = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'res');
import { existsSync } from 'node:fs';
const exe = process.env.CHROME || ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));

// The chip + bolt mark without the rounded tile (64-unit design space): pins and chip outline in one colour.
const mark = (line) => `
  <g stroke="${line}" stroke-width="3" stroke-linecap="round" fill="none">
    <path d="M22 13v6M32 13v6M42 13v6M22 45v6M32 45v6M42 45v6M13 22h6M13 32h6M13 42h6M45 22h6M45 32h6M45 42h6"/>
  </g>
  <rect x="19" y="19" width="26" height="26" rx="6" fill="#0b1026" stroke="${line}" stroke-width="2.6"/>
  <path d="M34.5 22.5 26 33.5h6l-2.5 8 8.5-11h-6z" fill="#ffd92e"/>`;

// Adaptive icon layers are 108×108 dp; only the central 66 dp circle is always visible.
// RAPTI blue with the dotted pattern of the website's hero, a white chip and the yellow bolt.
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <g transform="translate(54 54) scale(1.36) translate(-32 -32)">${mark('#ffffff')}</g></svg>`;
const background = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><defs>
  <radialGradient id="g" cx="0.72" cy="0.2" r="0.95"><stop offset="0" stop-color="#456dff"/><stop offset="0.55" stop-color="#1d4bff"/><stop offset="1" stop-color="#1438e0"/></radialGradient>
  <pattern id="d" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="4.5" cy="4.5" r="0.6" fill="#ffffff" opacity="0.2"/></pattern></defs>
  <rect width="108" height="108" fill="url(#g)"/><rect width="108" height="108" fill="url(#d)"/></svg>`;
const legacy = logoMark(64, 'i').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
// the splash is blue: the mark sits on a white tile
const splash = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="2" y="2" width="60" height="60" rx="17" fill="#fff"/>${mark('#1d4bff')}</svg>`;

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
