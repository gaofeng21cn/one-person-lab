import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

export async function buildMcpAppView() {
  const packageRoot = new URL('../packages/mcp-app-shared/', import.meta.url);
  const readAsset = (name) => readFile(new URL('assets/' + name, packageRoot), 'utf8');
  const [script, template, license, theme, style] = await Promise.all([
    build({
      entryPoints: [fileURLToPath(new URL('./mcp-app-browser-entry.mjs', import.meta.url))],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      minify: true,
      legalComments: 'inline',
      write: false,
    }),
    readAsset('index.html'),
    readAsset('DSH-LICENSE.txt'),
    readAsset('dsh-theme.css'),
    readAsset('style.css'),
  ]);
  const html = template
    .replace('/* STYLE */', () => ['/*', license, '*/', theme, style].join('\n'))
    .replace('/* SCRIPT */', () => script.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));
  await mkdir(new URL('dist/', packageRoot), { recursive: true });
  await writeFile(new URL('dist/mcp-app-view.html', packageRoot), html);
}
