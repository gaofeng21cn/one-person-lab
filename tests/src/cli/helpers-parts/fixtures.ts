import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { contractsDir, familyManifestFixtureDir, repoRoot } from './constants.ts';

export function createContractsFixtureRoot(mutator?: (contractsRoot: string) => void) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-contract-fixture-'));
  const fixtureContractsRoot = path.join(fixtureRoot, 'contracts', 'opl-gateway');
  fs.mkdirSync(fixtureContractsRoot, { recursive: true });
  fs.cpSync(contractsDir, fixtureContractsRoot, {
    recursive: true,
  });
  mutator?.(fixtureContractsRoot);
  return { fixtureRoot, fixtureContractsRoot };
}

export function createFakeHermesFixture(handlerBody: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-hermes-fixture-'));
  const hermesPath = path.join(fixtureRoot, 'fake-hermes');
  fs.writeFileSync(
    hermesPath,
    `#!/usr/bin/env bash
set -euo pipefail
${handlerBody}
`,
    { mode: 0o755 },
  );
  return {
    fixtureRoot,
    hermesPath,
  };
}

export function createFakeCodexFixture(handlerBody: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-fixture-'));
  const codexPath = path.join(fixtureRoot, 'codex');
  fs.writeFileSync(
    codexPath,
    `#!/usr/bin/env bash
set -euo pipefail
${handlerBody}
`,
    { mode: 0o755 },
  );
  return {
    fixtureRoot,
    codexPath,
  };
}

export function createFakePsFixture(output: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ps-fixture-'));
  const psPath = path.join(fixtureRoot, 'ps');
  fs.writeFileSync(
    psPath,
    `#!/usr/bin/env bash
set -euo pipefail
cat <<'EOF'
${output}
EOF
`,
    { mode: 0o755 },
  );
  return {
    fixtureRoot,
    psPath,
  };
}

export function shellSingleQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function createCodexConfigFixture(options: {
  model?: string;
  reasoningEffort?: string;
  providerId?: string;
  providerName?: string;
  baseUrl?: string;
  apiKey?: string;
} = {}) {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-home-'));
  const configPath = path.join(codexHome, 'config.toml');
  const model = options.model ?? 'gpt-5.4-lab';
  const reasoningEffort = options.reasoningEffort ?? 'xhigh';
  const providerId = options.providerId ?? 'lab';
  const providerName = options.providerName ?? 'lab';
  const baseUrl = options.baseUrl ?? 'https://codex-provider.example.test/v1';
  const apiKey = options.apiKey ?? 'codex-provider-key';

  fs.writeFileSync(
    configPath,
    [
      `model_provider = "${providerId}"`,
      `model = "${model}"`,
      `model_reasoning_effort = "${reasoningEffort}"`,
      '',
      `[model_providers.${providerId}]`,
      `name = "${providerName}"`,
      `base_url = "${baseUrl}"`,
      `experimental_bearer_token = "${apiKey}"`,
      '',
    ].join('\n'),
    'utf8',
  );

  return {
    codexHome,
    configPath,
    model,
    reasoningEffort,
    providerId,
    providerName,
    baseUrl,
    apiKey,
  };
}

export function createMasWorkspaceFixture(profileName = 'nfpitnet.workspace.toml') {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mas-workspace-'));
  const sharedPath = path.join(fixtureRoot, 'ops', 'medautoscience', 'bin', '_shared.sh');
  const profilePath = path.join(fixtureRoot, 'ops', 'medautoscience', 'profiles', profileName);

  fs.mkdirSync(path.dirname(sharedPath), { recursive: true });
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(sharedPath, '#!/usr/bin/env bash\nset -euo pipefail\n', {
    mode: 0o755,
  });
  fs.writeFileSync(
    profilePath,
    [
      '[workspace]',
      'workspace_id = "mas-fixture"',
      '',
    ].join('\n'),
    'utf8',
  );

  return {
    fixtureRoot,
    sharedPath,
    profilePath,
  };
}

export function buildManifestCommand(payload: Record<string, unknown>) {
  return `${process.execPath} -e "process.stdout.write(process.argv[1])" ${shellSingleQuote(JSON.stringify(payload))}`;
}

export function readJsonFixture<T>(name: string) {
  return JSON.parse(
    fs.readFileSync(path.join(familyManifestFixtureDir, name), 'utf8'),
  ) as T;
}

