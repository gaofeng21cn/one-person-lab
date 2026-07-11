#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(repoRoot, 'packages', 'static-contracts');
const buildRoot = path.join(packageRoot, 'build');

if (process.argv.includes('--clean')) {
  fs.rmSync(buildRoot, { recursive: true, force: true });
  process.exit(0);
}

const schemaRef = 'contracts/opl-framework/reference-design-pattern-packet.schema.json';
const source = path.join(repoRoot, schemaRef);
const target = path.join(buildRoot, schemaRef);

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
