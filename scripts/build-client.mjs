// Bundles the browser TypeScript (client/) and copies vendored assets into public/assets.
import { build, context } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public/assets');
const watch = process.argv.includes('--watch');

async function copyVendor() {
  await mkdir(path.join(out, 'vendor'), { recursive: true });
  await mkdir(path.join(out, 'fonts'), { recursive: true });
  await cp(path.join(root, 'node_modules/htmx.org/dist/htmx.min.js'), path.join(out, 'vendor/htmx.min.js'));
  const fonts = [
    [
      '@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2',
      'bricolage.woff2',
    ],
    ['@fontsource-variable/geist/files/geist-latin-wght-normal.woff2', 'geist.woff2'],
    ['@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2', 'geist-mono.woff2'],
  ];
  for (const [from, to] of fonts) {
    await cp(path.join(root, 'node_modules', from), path.join(out, 'fonts', to));
  }
}

const options = {
  entryPoints: [path.join(root, 'client/main.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: path.join(out, 'app.js'),
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
};

await copyVendor();
if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
