// Bundles the web app into build/www (served from the APK's assets).
import { build } from 'esbuild';
import { mkdirSync, copyFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'build', 'www');
const dev = process.argv.includes('--dev');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'fonts'), { recursive: true });

await build({
  entryPoints: [join(here, 'src', 'main.js')],
  bundle: true,
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  format: 'iife',
  target: ['chrome80'],
  outfile: join(out, 'app.js'),
  legalComments: 'none',
  logLevel: 'warning',
});

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
console.log(`web build ok -> ${out} (${total} entries)`);
