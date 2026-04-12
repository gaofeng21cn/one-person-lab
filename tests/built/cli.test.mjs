import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const cliEntrypoint =
  process.env.OPL_CLI_ENTRYPOINT
  ?? [
    path.join(repoRoot, 'dist', 'cli.js'),
    path.join(repoRoot, 'dist', 'cli', 'index.js'),
  ].find((candidate) => existsSync(candidate))
  ?? path.join(repoRoot, 'dist', 'cli.js');
const contractsRoot = path.join(repoRoot, 'contracts', 'opl-gateway');

function contractVersion(fileName) {
  return JSON.parse(readFileSync(path.join(contractsRoot, fileName), 'utf8')).version;
}

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [cliEntrypoint, ...args], {
    cwd: options.cwd ?? repoRoot,
    env: {
      ...process.env,
      ...options.env,
    },
    encoding: 'utf8',
  });
}

function formatFailure(result) {
  return [
    `status=${result.status}`,
    `signal=${result.signal}`,
    `stdout=${result.stdout.trim()}`,
    `stderr=${result.stderr.trim()}`,
  ].join('\n');
}

function parseJsonOutput(result) {
  const text = (result.stdout && result.stdout.trim()) || (result.stderr && result.stderr.trim()) || '';
  return JSON.parse(text);
}

function assertNoContractsProvenance(payload) {
  assert.equal(payload.contracts_context, undefined);
  assert.equal(payload.error?.details?.contracts_dir, undefined);
  assert.equal(payload.error?.details?.contracts_root_source, undefined);
}

function createContractsFixtureRoot(mutator) {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-contract-fixture-'));
  const fixtureContractsRoot = path.join(fixtureRoot, 'contracts', 'opl-gateway');
  mkdirSync(fixtureContractsRoot, { recursive: true });

  for (const fileName of [
    'workstreams.json',
    'domains.json',
    'routing-vocabulary.json',
    'task-topology.json',
    'public-surface-index.json',
  ]) {
    writeFileSync(
      path.join(fixtureContractsRoot, fileName),
      readFileSync(path.join(contractsRoot, fileName), 'utf8'),
    );
  }

  mutator(fixtureRoot, fixtureContractsRoot);
  return { fixtureRoot, fixtureContractsRoot };
}

function createFakeHermesFixture(handlerBody) {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-hermes-fixture-'));
  const hermesPath = path.join(fixtureRoot, 'fake-hermes');
  writeFileSync(
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

function createFakePsFixture(output) {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-ps-fixture-'));
  const psPath = path.join(fixtureRoot, 'ps');
  writeFileSync(
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

test('list-workstreams returns the admitted workstream summaries', () => {
  assert.ok(existsSync(cliEntrypoint), `Expected CLI entrypoint at ${cliEntrypoint}.`);

  const result = runCli(['list-workstreams']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.deepEqual(payload.contracts_context, {
    contracts_dir: contractsRoot,
    contracts_root_source: 'cwd',
  });
  assert.deepEqual(payload.workstreams, [
    {
      workstream_id: 'research_ops',
      label: 'Research Ops',
      status: 'active',
      domain_id: 'medautoscience',
    },
    {
      workstream_id: 'presentation_ops',
      label: 'Presentation Ops',
      status: 'emerging',
      domain_id: 'redcube',
    },
  ]);
});

test('get-domain redcube returns gateway and harness truth', () => {
  const result = runCli(['get-domain', 'redcube']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.deepEqual(payload.contracts_context, {
    contracts_dir: contractsRoot,
    contracts_root_source: 'cwd',
  });
  assert.equal(payload.domain.domain_id, 'redcube');
  assert.equal(payload.domain.project, 'redcube-ai');
  assert.equal(payload.domain.gateway_surface, 'Visual Deliverable Gateway');
  assert.equal(payload.domain.harness_surface, 'Visual Deliverable Domain Harness OS');
  assert.deepEqual(payload.domain.owned_workstreams, ['presentation_ops']);
  assert.deepEqual(payload.domain.non_opl_families, ['xiaohongshu']);
});

test('resolve-request-surface maps a defense-ready slide deck to presentation_ops via redcube', () => {
  const result = runCli([
    'resolve-request-surface',
    '--intent', 'presentation_delivery',
    '--target', 'deliverable',
    '--goal', 'Prepare a defense-ready slide deck for a thesis committee.',
    '--preferred-family', 'ppt_deck',
  ]);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.deepEqual(payload.contracts_context, {
    contracts_dir: contractsRoot,
    contracts_root_source: 'cwd',
  });
  assert.equal(payload.resolution.workstream_id, 'presentation_ops');
  assert.equal(payload.resolution.domain_id, 'redcube');
  assert.equal(payload.resolution.entry_surface, 'domain_gateway');
  assert.equal(payload.resolution.recommended_family, 'ppt_deck');
  assert.equal(payload.resolution.confidence, 'high');
});

test('resolve-request-surface keeps xiaohongshu at the redcube family boundary without auto-admitting presentation_ops', () => {
  const result = runCli([
    'resolve-request-surface',
    '--intent', 'create',
    '--target', 'deliverable',
    '--goal', 'Create a xiaohongshu campaign pack for a lab update.',
    '--preferred-family', 'xiaohongshu',
  ]);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.deepEqual(payload.contracts_context, {
    contracts_dir: contractsRoot,
    contracts_root_source: 'cwd',
  });
  assert.equal(payload.resolution.domain_id, 'redcube');
  assert.equal(payload.resolution.workstream_id, null);
  assert.equal(payload.resolution.recommended_family, 'xiaohongshu');
  assert.match(payload.resolution.reason, /must not auto-resolve|not automatically equal|family boundary/i);
});

test('resolve-request-surface emits ambiguous_task with machine-readable clarification evidence', () => {
  const result = runCli([
    'resolve-request-surface',
    '--intent', 'create',
    '--target', 'deliverable',
    '--goal', 'Package the study for submission and also turn it into a defense-ready deck.',
  ]);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.resolution.status, 'ambiguous_task');
  assert.deepEqual(payload.resolution.candidate_workstreams, [
    'research_ops',
    'presentation_ops',
  ]);
  assert.deepEqual(payload.resolution.candidate_domains, [
    'medautoscience',
    'redcube',
  ]);
});

test('validate-contracts returns a stable machine-readable success summary', () => {
  const result = runCli(['validate-contracts']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.validation.status, 'valid');
  assert.equal(payload.validation.contracts_root_source, 'cwd');
  assert.deepEqual(
    payload.validation.validated_contracts.map((entry) => ({
      contract_id: entry.contract_id,
      file: path.basename(entry.file),
      schema_version: entry.schema_version,
      status: entry.status,
    })),
    [
      { contract_id: 'workstreams', file: 'workstreams.json', schema_version: 'g1', status: 'valid' },
      { contract_id: 'domains', file: 'domains.json', schema_version: 'g1', status: 'valid' },
      { contract_id: 'routing_vocabulary', file: 'routing-vocabulary.json', schema_version: 'g1', status: 'valid' },
      { contract_id: 'task_topology', file: 'task-topology.json', schema_version: 'p17.m1', status: 'valid' },
      { contract_id: 'public_surface_index', file: 'public-surface-index.json', schema_version: 'p18.m2', status: 'valid' },
    ],
  );
});

test('validate-contracts exposes cli-flag contract-root provenance for built CLI entrypoints', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot(() => {});

  try {
    const result = runCli(['--contracts-dir', fixtureContractsRoot, 'validate-contracts']);
    assert.equal(result.status, 0, formatFailure(result));

    const payload = parseJsonOutput(result);
    assert.equal(payload.validation.contracts_dir, fixtureContractsRoot);
    assert.equal(payload.validation.contracts_root_source, 'cli_flag');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validate-contracts surfaces missing files with a stable machine-readable error envelope', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((_fixtureRoot, contractsDir) => {
    rmSync(path.join(contractsDir, 'task-topology.json'));
  });

  try {
    const result = runCli(['validate-contracts'], { env: { OPL_CONTRACTS_DIR: fixtureContractsRoot } });
    assert.notEqual(result.status, 0, 'Expected a non-zero exit when task-topology.json is missing.');

    const payload = parseJsonOutput(result);
    assert.equal(payload.version, 'g2');
    assert.equal(payload.error.code, 'contract_file_missing');
    assert.match(payload.error.message, /task-topology\.json/i);
    assert.equal(payload.error.details.contracts_dir, fixtureContractsRoot);
    assert.equal(payload.error.details.contracts_root_source, 'env');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validate-contracts surfaces invalid JSON from the contract set rooted at cwd', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((_fixtureRoot, contractsDir) => {
    writeFileSync(path.join(contractsDir, 'domains.json'), '{ invalid json\n');
  });

  try {
    const result = runCli(['validate-contracts'], { env: { OPL_CONTRACTS_DIR: fixtureContractsRoot } });
    assert.notEqual(result.status, 0, 'Expected a non-zero exit when domains.json is invalid.');

    const payload = parseJsonOutput(result);
    assert.equal(payload.error.code, 'contract_json_invalid');
    assert.match(payload.error.message, /domains\.json|invalid json/i);
    assert.equal(payload.error.details.contracts_dir, fixtureContractsRoot);
    assert.equal(payload.error.details.contracts_root_source, 'env');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('doctor reports the local OPL product-entry shell readiness through the built CLI', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  cat <<'EOF'
Launchd plist: /tmp/ai.hermes.gateway.plist
✓ Service definition matches the current Hermes install
✓ Gateway service is loaded
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const result = runCli(['doctor'], {
      env: { OPL_HERMES_BIN: hermesPath },
    });
    assert.equal(result.status, 0, formatFailure(result));

    const payload = parseJsonOutput(result);
    assert.equal(payload.product_entry.entry_surface, 'opl_local_product_entry_shell');
    assert.equal(payload.product_entry.ready, true);
    assert.equal(payload.product_entry.hermes.binary.path, hermesPath);
    assert.equal(payload.product_entry.hermes.gateway_service.loaded, true);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('projects stays machine-readable through the built CLI entrypoint', () => {
  const result = runCli(['projects']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.projects.length, 3);
  assert.equal(payload.projects[0].project_id, 'opl');
  assert.equal(payload.projects[1].project_id, 'medautoscience');
  assert.equal(payload.projects[2].project_id, 'redcube');
});

test('workspace-status stays machine-readable through the built CLI entrypoint', () => {
  const result = runCli(['workspace-status', '--path', repoRoot]);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.workspace.absolute_path, repoRoot);
  assert.equal(payload.workspace.git.inside_work_tree, true);
  assert.equal(typeof payload.workspace.git.linked_worktree, 'boolean');
});

test('runtime-status and dashboard stay machine-readable through the built CLI entrypoint', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  cat <<'EOF'
Launchd plist: /tmp/ai.hermes.gateway.plist
✓ Service definition matches the current Hermes install
✓ Gateway service is loaded
EOF
  exit 0
fi
if [ "$1" = "status" ]; then
  cat <<'EOF'
◆ Environment
  Project:      /tmp/hermes-agent
◆ Gateway Service
  Status:       ✓ loaded
  Manager:      launchd
◆ Scheduled Jobs
  Jobs:         1
◆ Sessions
  Active:       2
EOF
  exit 0
fi
if [ "$1" = "sessions" ] && [ "$2" = "list" ]; then
  cat <<'EOF'
Preview                                            Last Active   Src    ID
───────────────────────────────────────────────────────────────────────────────────────────────
Built CLI dashboard session                        1m ago        cli    sess_built
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const psFixture = createFakePsFixture(`27025 1 0.1 0.2 49616 22:46 /Users/test/.hermes/venv/bin/python -m hermes_cli.main gateway run --replace`);

  try {
    const runtimeResult = runCli(['runtime-status', '--limit', '1'], {
      env: {
        OPL_HERMES_BIN: hermesPath,
        PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
      },
    });
    assert.equal(runtimeResult.status, 0, formatFailure(runtimeResult));
    const runtimePayload = parseJsonOutput(runtimeResult);
    assert.equal(runtimePayload.runtime_status.status_report.parsed.summary.active_sessions, 2);
    assert.equal(runtimePayload.runtime_status.process_usage.summary.process_count, 1);

    const dashboardResult = runCli(['dashboard', '--path', repoRoot, '--sessions-limit', '1'], {
      env: {
        OPL_HERMES_BIN: hermesPath,
        PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
      },
    });
    assert.equal(dashboardResult.status, 0, formatFailure(dashboardResult));
    const dashboardPayload = parseJsonOutput(dashboardResult);
    assert.equal(dashboardPayload.dashboard.projects.length, 3);
    assert.equal(dashboardPayload.dashboard.runtime_status.recent_sessions.sessions.length, 1);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('bare opl command seeds a front-desk session through the built CLI entrypoint', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "chat" ]; then
  cat <<'EOF'
╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮
OPL FRONT DESK READY

session_id: opl-frontdesk-session
EOF
  exit 0
fi
if [ "$1" = "--resume" ] && [ "$2" = "opl-frontdesk-session" ]; then
  cat <<'EOF'
OPL FRONT DESK RESUMED
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const result = runCli([], {
      env: { OPL_HERMES_BIN: hermesPath },
    });
    assert.equal(result.status, 0, formatFailure(result));

    const payload = parseJsonOutput(result);
    assert.equal(payload.product_entry.mode, 'frontdesk');
    assert.equal(payload.product_entry.interactive, false);
    assert.equal(payload.product_entry.seed.session_id, 'opl-frontdesk-session');
    assert.equal(payload.product_entry.resume.output, 'OPL FRONT DESK RESUMED');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('natural-language fallback stays machine-readable through the built CLI entrypoint', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "chat" ]; then
  cat <<'EOF'
╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮
AUTO ASK READY

session_id: opl-quick-ask-session
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const result = runCli(['Plan', 'a', 'medical', 'grant', 'proposal', 'revision', 'loop.'], {
      env: { OPL_HERMES_BIN: hermesPath },
    });
    assert.equal(result.status, 0, formatFailure(result));

    const payload = parseJsonOutput(result);
    assert.equal(payload.product_entry.mode, 'ask');
    assert.equal(payload.product_entry.input.goal, 'Plan a medical grant proposal revision loop.');
    assert.equal(payload.product_entry.hermes.session_id, 'opl-quick-ask-session');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ask --dry-run stays machine-readable through the built CLI entrypoint', () => {
  const result = runCli([
    'ask',
    'Prepare a defense-ready slide deck for a thesis committee.',
    '--preferred-family',
    'ppt_deck',
    '--dry-run',
  ]);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.product_entry.mode, 'ask');
  assert.equal(payload.product_entry.dry_run, true);
  assert.equal(payload.product_entry.routing.domain_id, 'redcube');
  assert.equal(payload.product_entry.routing.workstream_id, 'presentation_ops');
  assert.ok(payload.product_entry.hermes.command_preview.includes('--query'));
});

test('sessions stays machine-readable through the built CLI entrypoint', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "sessions" ] && [ "$2" = "list" ]; then
  cat <<'EOF'
Preview                                            Last Active   Src    ID
───────────────────────────────────────────────────────────────────────────────────────────────
Execute the following RedCube service entry enve   10m ago       api_server run_7e2a41
Medical grant revision session                     2m ago        cli    sess_abcd
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const result = runCli(['sessions', '--limit', '2'], {
      env: { OPL_HERMES_BIN: hermesPath },
    });
    assert.equal(result.status, 0, formatFailure(result));

    const payload = parseJsonOutput(result);
    assert.equal(payload.product_entry.mode, 'sessions');
    assert.equal(payload.product_entry.sessions.length, 2);
    assert.equal(payload.product_entry.sessions[0].session_id, 'run_7e2a41');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('repair-hermes-gateway stays machine-readable through the built CLI entrypoint', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "gateway" ] && [ "$2" = "install" ]; then
  cat <<'EOF'
↻ Updated gateway launchd service definition to match the current Hermes install
✓ Service definition updated
EOF
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  cat <<'EOF'
Launchd plist: /tmp/ai.hermes.gateway.plist
✓ Service definition matches the current Hermes install
✓ Gateway service is loaded
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const result = runCli(['repair-hermes-gateway'], {
      env: { OPL_HERMES_BIN: hermesPath },
    });
    assert.equal(result.status, 0, formatFailure(result));

    const payload = parseJsonOutput(result);
    assert.equal(payload.product_entry.mode, 'repair_hermes_gateway');
    assert.equal(payload.product_entry.gateway_service.loaded, true);
    assert.match(payload.product_entry.install_output, /Service definition updated/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validate-contracts surfaces shape-invalid contracts with a stable error envelope', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((_fixtureRoot, contractsDir) => {
    const workstreamsPath = path.join(contractsDir, 'workstreams.json');
    const workstreams = JSON.parse(readFileSync(workstreamsPath, 'utf8'));
    delete workstreams.workstreams[0].label;
    writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });

  try {
    const result = runCli(['validate-contracts'], { env: { OPL_CONTRACTS_DIR: fixtureContractsRoot } });
    assert.notEqual(result.status, 0, 'Expected a non-zero exit when workstreams.json shape is invalid.');

    const payload = parseJsonOutput(result);
    assert.equal(payload.error.code, 'contract_shape_invalid');
    assert.match(payload.error.message, /label/i);
    assert.equal(payload.error.details.contracts_dir, fixtureContractsRoot);
    assert.equal(payload.error.details.contracts_root_source, 'env');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('unknown command remains machine-readable and discoverable', () => {
  const result = runCli(['unknown-command']);
  assert.notEqual(result.status, 0, 'Expected a non-zero exit when the command is unknown.');

  const payload = parseJsonOutput(result);
  assertNoContractsProvenance(payload);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'unknown_command');
  assert.ok(payload.error.details.commands.includes('validate-contracts'));
  assert.equal(payload.error.exit_code, result.status);
  assert.equal(result.status, 2);
});

test('help stays machine-readable and discoverable for built CLI entrypoints', () => {
  const result = runCli(['help']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assertNoContractsProvenance(payload);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.help.command, null);
  assert.equal(payload.help.usage, 'opl [command|request...] [args]');
  assert.ok(
    payload.help.commands.some((entry) => entry.command === 'validate-contracts'),
  );
  assert.ok(
    payload.help.commands.some(
      (entry) => entry.command === 'get-domain'
        && entry.examples.includes('opl get-domain redcube'),
    ),
  );
});

test('command --help stays machine-readable for built CLI entrypoints', () => {
  const result = runCli(['get-domain', '--help']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assertNoContractsProvenance(payload);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.help.command, 'get-domain');
  assert.equal(payload.help.usage, 'opl get-domain <domain_id>');
  assert.ok(payload.help.examples.includes('opl get-domain redcube'));
});

test('command help literal uses the dedicated usage exit code for built CLI entrypoints', () => {
  const result = runCli(['get-domain', 'help']);
  assert.equal(result.status, 2, formatFailure(result));

  const payload = parseJsonOutput(result);
  assertNoContractsProvenance(payload);
  assert.equal(payload.error.code, 'cli_usage_error');
  assert.equal(payload.error.exit_code, 2);
  assert.equal(payload.error.details.help_usage, 'opl get-domain --help');
});

test('global --contracts-dir override stays explicit and wins over OPL_CONTRACTS_DIR for built CLI entrypoints', () => {
  const envFixture = createContractsFixtureRoot((_fixtureRoot, contractsDir) => {
    const workstreamsPath = path.join(contractsDir, 'workstreams.json');
    const workstreams = JSON.parse(readFileSync(workstreamsPath, 'utf8'));
    workstreams.workstreams[0].label = 'Research Ops From Env';
    writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });
  const flagFixture = createContractsFixtureRoot((_fixtureRoot, contractsDir) => {
    const workstreamsPath = path.join(contractsDir, 'workstreams.json');
    const workstreams = JSON.parse(readFileSync(workstreamsPath, 'utf8'));
    workstreams.workstreams[0].label = 'Research Ops From Flag';
    writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });

  try {
    const result = runCli(
      ['--contracts-dir', flagFixture.fixtureContractsRoot, 'get-workstream', 'research_ops'],
      {
        env: {
          OPL_CONTRACTS_DIR: envFixture.fixtureContractsRoot,
        },
      },
    );
    assert.equal(result.status, 0, formatFailure(result));

    const payload = parseJsonOutput(result);
    assert.deepEqual(payload.contracts_context, {
      contracts_dir: flagFixture.fixtureContractsRoot,
      contracts_root_source: 'cli_flag',
    });
    assert.equal(payload.workstream.label, 'Research Ops From Flag');
  } finally {
    rmSync(envFixture.fixtureRoot, { recursive: true, force: true });
    rmSync(flagFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('contract validation failures use the dedicated contract exit code for built CLI entrypoints', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((_fixtureRoot, contractsDir) => {
    rmSync(path.join(contractsDir, 'public-surface-index.json'));
  });

  try {
    const result = runCli(
      ['--contracts-dir', fixtureContractsRoot, 'validate-contracts'],
    );
    assert.equal(result.status, 3, formatFailure(result));

    const payload = parseJsonOutput(result);
    assert.equal(payload.error.code, 'contract_file_missing');
    assert.equal(payload.error.exit_code, 3);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('usage errors use the dedicated usage exit code for built CLI entrypoints', () => {
  const result = runCli(['get-domain']);
  assert.equal(result.status, 2, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.error.code, 'cli_usage_error');
  assert.equal(payload.error.exit_code, 2);
});
