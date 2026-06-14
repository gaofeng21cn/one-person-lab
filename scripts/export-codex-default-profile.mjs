#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRequiredValueOptions } from './required-value-options.mjs';
import { buildCodexDefaultProfileFromLocalConfig } from '../src/local-codex-defaults.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const parsed = {
    out: path.join(repoRoot, 'contracts', 'opl-framework', 'codex-default-profile.json'),
    generatedAt: new Date().toISOString(),
  };

  parseRequiredValueOptions(argv, {
    '--out': (value) => {
      parsed.out = path.resolve(value);
    },
    '--generated-at': (value) => {
      parsed.generatedAt = value;
    },
  });

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
