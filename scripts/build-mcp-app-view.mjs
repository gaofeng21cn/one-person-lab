import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(repoRoot, 'src', 'mcp-app');
const outputRoot = path.join(repoRoot, 'dist', 'entrypoints');
const result = await build({
  entryPoints: [path.join(sourceRoot, 'view.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'inline',
  write: false,
});
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const template = await readFile(path.join(sourceRoot, 'index.html'), 'utf8');
const css = await readFile(path.join(sourceRoot, 'style.css'), 'utf8');
const html = template
  .replace('/* STYLE */', () => css)
  .replace('/* SCRIPT */', () => script);
await mkdir(outputRoot, { recursive: true });
await writeFile(path.join(outputRoot, 'mcp-app-view.html'), html);
