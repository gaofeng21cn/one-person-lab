import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { buildMcpAppView } from './build-mcp-app-view.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [
  fileURLToPath(import.meta.resolve('typescript/bin/tsc')),
  '-p', 'tsconfig.build.json', ...args,
], { cwd: repoRoot, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

// The release archiver chooses an isolated output directory. Ship the view in
// that same generation instead of silently leaving it in the checkout's dist.
const { options } = ts.parseCommandLine(args);
await buildMcpAppView(path.resolve(repoRoot, options.outDir ?? 'dist'));
