import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const typescriptManifestPath = fileURLToPath(import.meta.resolve('typescript/package.json'));
const typescriptManifest = JSON.parse(fs.readFileSync(typescriptManifestPath, 'utf8'));
const compilerPath = path.resolve(path.dirname(typescriptManifestPath), typescriptManifest.bin.tsc);
const compilerArgs = [compilerPath, '-b', 'tsconfig.packages.json', ...args];
const result = spawnSync(process.execPath, compilerArgs, { cwd: repoRoot, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
