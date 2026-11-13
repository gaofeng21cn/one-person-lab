#!/usr/bin/env node
import fs from 'node:fs';
import { parseArgs } from 'node:util';

const built = new URL('../dist/adapters/integration/dependency-release-resolution.js', import.meta.url);
const source = new URL('../src/adapters/integration/dependency-release-resolution.ts', import.meta.url);
const { fetchDependencyArchive } = await import(fs.existsSync(built) ? built.href : source.href);
const { values } = parseArgs({ options: {
  url: { type: 'string' }, sha256: { type: 'string' }, output: { type: 'string' },
} });
if (!values.url || !values.sha256 || !values.output) throw new Error('--url, --sha256 and --output are required.');
const result = await fetchDependencyArchive(values.url, values.sha256, values.output);
process.stdout.write(`${JSON.stringify(result)}\n`);
