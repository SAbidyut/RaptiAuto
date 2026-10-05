// Bundles the web app into build/www (served from the APK's assets).
//   app.js  — the app (Arduino simulator, menus, PLC lab catalogue)
//   lab.js  — the 3D Delta PLC lab (three.js), loaded the first time a lab is opened
// Modules used by both are bundled once into app.js and handed to lab.js through
// window.__raptiMods, so shared state (back stack, toasts, native bridge …) stays single.
import { build } from 'esbuild';
import { mkdirSync, copyFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'build', 'www');
const dev = process.argv.includes('--dev');
const common = { bundle: true, minify: !dev, sourcemap: dev ? 'inline' : false, format: 'iife', target: ['chrome80'], legalComments: 'none', logLevel: 'warning' };

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'fonts'), { recursive: true });

// 1. which source modules end up in the main bundle?
const probe = await build({ ...common, entryPoints: [join(here, 'src', 'main.js')], write: false, metafile: true, minify: false });
const shared = Object.keys(probe.metafile.inputs).filter((p) => p.startsWith('src/'));
const key = (abs) => relative(here, abs).split('\\').join('/');

// 2. main bundle + module registry
const registry = shared.map((p, i) => `import * as m${i} from './${p}';`).join('\n') +
  `\nwindow.__raptiMods = {${shared.map((p, i) => `${JSON.stringify(p)}: m${i}`).join(', ')}};\nimport './src/main.js';\n`;
await build({ ...common, stdin: { contents: registry, resolveDir: here, sourcefile: 'app-entry.js', loader: 'js' }, outfile: join(out, 'app.js') });

// 3. lab bundle: shared modules resolve to the registry
const sharedSet = new Set(shared);
const useShared = {
  name: 'raptiauto-shared',
  setup(b) {
    b.onResolve({ filter: /^\.\.?\// }, (args) => {
      if (!args.importer) return null;
      let abs = resolve(dirname(args.importer), args.path);
      if (!/\.m?js$/.test(abs)) abs += '.js';
      const k = key(abs);
      if (sharedSet.has(k) && !k.endsWith('lab-entry.js')) return { path: k, namespace: 'shared' };
      return null;
    });
    b.onLoad({ filter: /.*/, namespace: 'shared' }, (args) => ({ contents: `module.exports = window.__raptiMods[${JSON.stringify(args.path)}];`, loader: 'js' }));
  },
};
await build({ ...common, entryPoints: [join(here, 'src', 'plc', 'lab-entry.js')], outfile: join(out, 'lab.js'), plugins: [useShared] });

await build({
  entryPoints: [join(here, 'styles', 'app.css')],
  bundle: true,
  minify: !dev,
  outfile: join(out, 'app.css'),
  external: ['fonts/*'],
  logLevel: 'warning',
});

copyFileSync(join(here, 'index.html'), join(out, 'index.html'));

const fonts = [
  ['@fontsource/inter/files', ['inter-latin-400-normal.woff2', 'inter-latin-500-normal.woff2', 'inter-latin-600-normal.woff2', 'inter-latin-700-normal.woff2', 'inter-latin-800-normal.woff2']],
  ['@fontsource/space-grotesk/files', ['space-grotesk-latin-600-normal.woff2', 'space-grotesk-latin-700-normal.woff2']],
  ['@fontsource/jetbrains-mono/files', ['jetbrains-mono-latin-400-normal.woff2', 'jetbrains-mono-latin-600-normal.woff2']],
];
for (const [dir, files] of fonts) {
  for (const f of files) {
    const src = join(here, 'node_modules', dir, f);
    if (existsSync(src)) copyFileSync(src, join(out, 'fonts', f));
    else console.warn('missing font', f);
  }
}
const total = readdirSync(out).length;
console.log(`web build ok -> ${out} (${total} entries, ${shared.length} shared modules)`);
