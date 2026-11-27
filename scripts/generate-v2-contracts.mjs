#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncPackageManifestV2SchemaFile } from '@opl/pack';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetPath = path.join(repoRoot, 'contracts', 'opl-package.v2.schema.json');
const check = process.argv.includes('--check');

const result = syncPackageManifestV2SchemaFile(targetPath, { check });
if (check && !result.upToDate) {
  process.stderr.write(
    `[generate-v2-contracts] OUTDATED: ${path.relative(repoRoot, result.targetPath)}. Run node --experimental-strip-types ./scripts/generate-v2-contracts.mjs\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `[generate-v2-contracts] ${check ? 'OK' : result.written ? 'WROTE' : 'UNCHANGED'}: ${path.relative(repoRoot, result.targetPath)}\n`,
);
