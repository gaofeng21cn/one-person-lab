#!/usr/bin/env node
import fs from 'node:fs';

import { readDependencyReleasePolicy, resolveDependencyReleases } from './dependency-release-resolution.ts';

const args = process.argv.slice(2);
const dependencies = [];
const options = {};
let output;
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--metadata-only') { options.verifyArchive = false; continue; }
  if (arg === '--json') continue;
  if (arg === '--help') {
    console.log('Resolve current stable dependency releases without installing.\nUsage: resolve-dependency-releases.mjs --dependency ID [--dependency ID...] [--platform darwin|linux|win32] [--arch arm64|x64] [--output FILE] [--metadata-only]\n--metadata-only accepts official SHA-256 metadata without downloading; npm archives still require an integrity-verified digest.');
    process.exit(0);
  }
  const value = args[++index];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
  if (arg === '--dependency') dependencies.push(value);
  else if (arg === '--platform') options.platform = value;
  else if (arg === '--arch') options.architecture = value;
  else if (arg === '--output') output = value;
  else if (arg === '--policy') options.policy = JSON.parse(fs.readFileSync(value, 'utf8'));
  else throw new Error(`Unknown argument: ${arg}`);
}
try {
  const policy = options.policy ?? readDependencyReleasePolicy();
  const ids = dependencies.length ? dependencies : Object.keys(policy.sources);
  const result = {
    schema_version: 'opl.resolved-dependency-releases.v1',
    resolved_at: new Date().toISOString(),
    platform: options.platform ?? process.platform,
    architecture: options.architecture ?? process.arch,
    dependencies: await resolveDependencyReleases(ids, { ...options, policy }),
  };
  const encoded = `${JSON.stringify(result, null, 2)}\n`;
  if (output) fs.writeFileSync(output, encoded, { flag: 'wx' });
  process.stdout.write(encoded);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ schema_version: 'opl.dependency-release-resolution-error.v1', error: error.message })}\n`);
  process.exitCode = 1;
}
