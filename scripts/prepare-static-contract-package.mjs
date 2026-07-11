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

const contractRefs = [
  'contracts/opl-framework/foundry-agent-series-contract.json',
  'contracts/opl-framework/reference-design-pattern-packet.schema.json',
  'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
];

for (const contractRef of contractRefs) {
  const target = path.join(buildRoot, contractRef);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, contractRef), target);
}
