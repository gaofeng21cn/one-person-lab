#!/usr/bin/env node
// Copy a dependency-free Framework Python primitive into a standalone carrier.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  module: { type: 'string' }, target: { type: 'string' }, check: { type: 'boolean' },
} });
if (!/^[a-z_]+$/.test(values.module ?? '') || !values.target) {
  throw new Error('Use --module <module_name> --target <file.py> [--check]');
}
const source = path.join(path.dirname(fileURLToPath(import.meta.url)), '../python/opl_framework', `${values.module}.py`);
const target = path.resolve(values.target);
const bytes = fs.readFileSync(source);
if (values.check) {
  if (!bytes.equals(fs.readFileSync(target))) throw new Error(`Framework support projection differs: ${target}`);
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
}
