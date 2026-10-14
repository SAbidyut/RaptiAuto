// Website packages: one folder (and zip) per section, ready to upload to a PHP web host.
//   node build.mjs && node build-site.mjs        (npm run site)
// Output: build/site/<folder>/ and release/website/RaptiAuto-<Name>-Website.zip
//   index.php, config.php, includes/ (header, footer, helpers) — from web/site/
//   css/style.css (+ css/plc.css or css/pi.css), js/app.js (+ lab.js or pi.js, micropython.wasm), fonts/
import { build } from 'esbuild';
import { mkdirSync, copyFileSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const www = join(here, '..', 'build', 'www');
const out = join(here, '..', 'build', 'site');
const zips = join(here, '..', 'release', 'website');
if (!existsSync(join(www, 'app.js'))) throw new Error('build/www is missing: run "node build.mjs" first');
const version = (readFileSync(join(here, '..', 'android', 'AndroidManifest.xml'), 'utf8').match(/versionName="([^"]+)"/) || [])[1] || '1.0.0';

// The order of the style sheets is the order of the @imports in app.css: the lab's sheet comes first.
const SECTIONS = [
  { id: 'arduino', folder: 'arduino', name: 'Arduino', css: ['css/style.css'], js: [],
    title: 'Arduino Simulator — RaptiAuto', description: 'Build Arduino and ESP32 circuits on a breadboard, write the code and simulate them in your browser. By RAPTI.' },
  { id: 'plc', folder: 'plc', name: 'PLC', css: ['css/plc.css', 'css/style.css'], js: ['lab.js'],
    title: 'Delta PLC Lab — RaptiAuto', description: 'A 3D Delta PLC, HMI and VFD trainer: wire the devices, write ladder, design HMI screens and run Modbus in your browser. By RAPTI.' },
  { id: 'pi', folder: 'raspberry-pi', name: 'Raspberry-Pi', css: ['css/pi.css', 'css/style.css'], js: ['pi.js', 'micropython.wasm'],
    title: 'Raspberry Pi Lab — RaptiAuto', description: 'A virtual Raspberry Pi 5, Pi 4 and Pico: wire a breadboard and run Python in Thonny, right in your browser. By RAPTI.' },
];

// 1. style sheets: the shared one (app.css without the two lab sheets) and one per lab; fonts sit in ../fonts
const css = {};
const fontsUp = (s) => s.replace(/url\((["']?)fonts\//g, 'url($1../fonts/');
const cssOpts = { bundle: true, minify: true, write: false, external: ['fonts/*'], logLevel: 'warning', loader: { '.css': 'css' } };
const appCss = readFileSync(join(here, 'styles', 'app.css'), 'utf8');
const core = appCss.replace(/@import\s+["']\.\/(plc|pi)\.css["'];\s*\n/g, '');
if (core === appCss) throw new Error('app.css: lab @imports not found');
css['css/style.css'] = fontsUp((await build({ ...cssOpts, stdin: { contents: core, resolveDir: join(here, 'styles'), sourcefile: 'style.css', loader: 'css' } })).outputFiles[0].text);
for (const f of ['plc', 'pi']) css[`css/${f}.css`] = fontsUp((await build({ ...cssOpts, entryPoints: [join(here, 'styles', f + '.css')] })).outputFiles[0].text);

// 2. one folder per section
const copyDir = (from, to) => {
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) {
    const a = join(from, f), b = join(to, f);
    if (statSync(a).isDirectory()) copyDir(a, b); else copyFileSync(a, b);
  }
};
const php = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
rmSync(out, { recursive: true, force: true });
mkdirSync(zips, { recursive: true });
for (const s of SECTIONS) {
  const dir = join(out, s.folder);
  copyDir(join(here, 'site'), dir);
  copyDir(join(www, 'fonts'), join(dir, 'fonts'));
  mkdirSync(join(dir, 'css'), { recursive: true });
  mkdirSync(join(dir, 'js'), { recursive: true });
  for (const f of s.css) writeFileSync(join(dir, f), css[f]);
  for (const f of ['app.js', ...s.js]) copyFileSync(join(www, f), join(dir, 'js', f));
  writeFileSync(join(dir, 'config.php'), `<?php
// RaptiAuto — ${s.name} section: settings of this page.
if (!defined('RAPTI')) { http_response_code(403); exit; }

return array(
    // which part of RaptiAuto this page shows: 'arduino', 'plc' or 'pi' (needs the matching js/ files)
    'section' => ${php(s.id)},

    // the browser tab title and the search-engine description
    'title' => ${php(s.title)},
    'description' => ${php(s.description)},

    // URL of this folder. Leave it '' when index.php is opened from this folder (https://your-site/${s.folder}/).
    // When the page is included from somewhere else, write the folder's URL with a / at the end, e.g. '/${s.folder}/'.
    'base' => '',

    // added to every css / js URL (?v=…) so visitors get the new files after an update
    'version' => ${php(version)},

    // style sheets, in this order
    'css' => array(${s.css.map(php).join(', ')}),
);
`);
  writeFileSync(join(dir, 'README.txt'), readme(s));
  const zip = join(zips, `RaptiAuto-${s.name}-Website.zip`);
  rmSync(zip, { force: true });
  execFileSync('zip', ['-q', '-r', '-X', zip, s.folder], { cwd: out });
  console.log(`${s.folder.padEnd(13)} -> ${zip} (${(statSync(zip).size / 1048576).toFixed(1)} MB)`);
}

function readme(s) {
  const files = [...s.css, 'js/app.js', ...s.js.map((f) => 'js/' + f)];
  return `RaptiAuto — ${s.name} section for your website (v${version})
=====================================================

Upload
  1. Unzip. You get the folder "${s.folder}".
  2. Upload the whole folder into your web root (public_html / htdocs / www),
     so the page opens at  https://your-site/${s.folder}/
  3. Needs PHP 5.4 or newer. No database.

Files
  index.php            the page (puts header + #app + footer together)
  config.php           title, description, base URL, version — edit this one
  includes/header.php  <head>, style sheets and the start-up splash
  includes/footer.php  the scripts
  includes/functions.php
  favicon.svg          the tab icon
${files.map((f) => '  ' + f.padEnd(21) + desc(f)).join('\n')}
  fonts/               Inter, Space Grotesk, JetBrains Mono (used by the css)
  .htaccess            Apache: index.php as start page, file types (.wasm), caching

Notes
  - Keep the folders css/, js/ and fonts/ next to index.php.
  - Do not change the files in css/ and js/ (they are built and minified).
  - Projects are saved in the visitor's browser (localStorage).
  - Nginx: serve .wasm as application/wasm and use index.php as the index.

বাংলা
  1. Zip খুলুন — "${s.folder}" ফোল্ডার পাবেন।
  2. পুরো ফোল্ডারটি hosting-এর public_html (বা htdocs) এ আপলোড করুন।
  3. ব্রাউজারে খুলুন: https://your-site/${s.folder}/
  টাইটেল / ডেসক্রিপশন বদলাতে config.php এডিট করুন।
`;
}
function desc(f) {
  return {
    'css/style.css': 'main style sheet', 'css/plc.css': 'PLC Lab styles', 'css/pi.css': 'Raspberry Pi Lab styles',
    'js/app.js': 'the simulator (menus, Arduino, examples, manual)', 'js/lab.js': 'the 3D PLC Lab (loaded on first use)',
    'js/pi.js': 'the Raspberry Pi Lab (loaded on first use)', 'js/micropython.wasm': 'MicroPython for the Pi Lab',
  }[f] || '';
}
