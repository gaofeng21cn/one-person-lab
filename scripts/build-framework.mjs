import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildMcpAppView } from './build-mcp-app-view.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const typescriptManifestPath = fileURLToPath(import.meta.resolve('typescript/package.json'));
const typescriptManifest = JSON.parse(fs.readFileSync(typescriptManifestPath, 'utf8'));
const compilerPath = path.resolve(path.dirname(typescriptManifestPath), typescriptManifest.bin.tsc);
const compilerArgs = [compilerPath, '-p', 'tsconfig.build.json', ...args];
const result = spawnSync(process.execPath, compilerArgs, { cwd: repoRoot, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

// The release archiver chooses an isolated output directory. Ship the view in
// that same generation instead of silently leaving it in the checkout's dist.
// Use the same CLI to resolve inherited config and response-file arguments.
const configResult = spawnSync(process.execPath, [...compilerArgs, '--showConfig'], {
  cwd: repoRoot,
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
});
if (configResult.error) throw configResult.error;
if (configResult.status !== 0) {
  process.stderr.write(configResult.stderr || configResult.stdout);
  process.exit(configResult.status ?? 1);
}
const config = JSON.parse(configResult.stdout);
await buildMcpAppView(path.resolve(repoRoot, config.compilerOptions?.outDir ?? 'dist'));
