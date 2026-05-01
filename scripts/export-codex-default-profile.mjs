#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCodexDefaultProfileFromLocalConfig } from '../src/local-codex-defaults.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const parsed = {
    out: path.join(repoRoot, 'contracts', 'opl-gateway', 'codex-default-profile.json'),
    generatedAt: new Date().toISOString(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${token}`);
    }
    if (token === '--out') {
      parsed.out = path.resolve(value);
      index += 1;
      continue;
    }
    if (token === '--generated-at') {
      parsed.generatedAt = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return parsed;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const profile = buildCodexDefaultProfileFromLocalConfig(options.generatedAt);
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'completed',
    output: options.out,
    profile: {
      model_provider: profile.model_provider,
      model: profile.model,
      model_reasoning_effort: profile.model_reasoning_effort,
      base_url: profile.base_url,
      base_url_role: profile.base_url_role,
      model_profile_role: profile.model_profile_role,
      api_key_present: false,
    },
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
