import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GatewayContractError,
  loadGatewayContracts,
  validateGatewayContracts,
} from '../../src/contracts.ts';
import {
  explainDomainBoundary,
  resolveRequestSurface,
} from '../../src/resolver.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const cliPath = path.join(repoRoot, 'src', 'cli.ts');
const contractsDir = path.join(repoRoot, 'contracts', 'opl-gateway');

function runCli(args: string[], envOverrides: Record<string, string> = {}) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function runCliFailure(args: string[], envOverrides: Record<string, string> = {}) {
  return runCliFailureInCwd(args, repoRoot, envOverrides);
}

function runCliFailureInCwd(
  args: string[],
  cwd: string,
  envOverrides: Record<string, string> = {},
) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, ...args],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.notEqual(result.status, 0);
  return {
    status: result.status ?? 1,
    payload: JSON.parse(result.stderr),
  };
}

function createContractsFixtureRoot(mutator?: (contractsRoot: string) => void) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-contract-fixture-'));
  const fixtureContractsRoot = path.join(fixtureRoot, 'contracts', 'opl-gateway');
  fs.mkdirSync(fixtureContractsRoot, { recursive: true });
  fs.cpSync(contractsDir, fixtureContractsRoot, {
    recursive: true,
  });
  mutator?.(fixtureContractsRoot);
  return { fixtureRoot, fixtureContractsRoot };
}

function createFakeHermesFixture(handlerBody: string) {
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

function createFakePsFixture(output: string) {
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

function assertContractsContext(
  output: { contracts_context?: { contracts_dir: string; contracts_root_source: string } },
  contractsRootSource: string,
  expectedContractsDir = contractsDir,
) {
  assert.deepEqual(output.contracts_context, {
    contracts_dir: expectedContractsDir,
    contracts_root_source: contractsRootSource,
  });
}

function assertNoContractsProvenance(payload: {
  help?: unknown;
  error?: { details?: Record<string, unknown> };
  contracts_context?: unknown;
}) {
  assert.equal(payload.contracts_context, undefined);
  assert.equal(payload.error?.details?.contracts_dir, undefined);
  assert.equal(payload.error?.details?.contracts_root_source, undefined);
}

test('loadGatewayContracts returns the frozen gateway registries', () => {
  const contracts = loadGatewayContracts(repoRoot);

  assert.equal(contracts.contractsRootSource, 'api');
  assert.equal(contracts.workstreams.version, 'g1');
  assert.equal(contracts.domains.version, 'g1');
  assert.equal(contracts.routingVocabulary.version, 'g1');
  assert.equal(contracts.taskTopology.scope, 'opl_task_topology');
  assert.equal(
    contracts.publicSurfaceIndex.scope,
    'opl_public_gateway_surface_index',
  );
});

test('loadGatewayContracts rejects missing files with a stable error', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-missing-'));
  const expectedContractsDir = path.join(tempRoot, 'contracts', 'opl-gateway');

  await t.test('missing contracts directory', () => {
    assert.throws(
      () => loadGatewayContracts(tempRoot),
      (error: unknown) => {
        assert.ok(error instanceof GatewayContractError);
        assert.equal(error.code, 'contract_file_missing');
        assert.equal(error.details?.contracts_dir, expectedContractsDir);
        assert.equal(error.details?.contracts_root_source, 'api');
        return true;
      },
    );
  });
});

test('loadGatewayContracts honors OPL_CONTRACTS_DIR when provided', () => {
  const tempContracts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-contracts-'));
  fs.cpSync(contractsDir, tempContracts, {
    recursive: true,
  });

  const workstreamsPath = path.join(tempContracts, 'workstreams.json');
  const workstreams = JSON.parse(fs.readFileSync(workstreamsPath, 'utf8'));
  workstreams.workstreams[0].label = 'Research Ops Override';
  fs.writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));

  const output = runCli(['get-workstream', 'research_ops'], {
    OPL_CONTRACTS_DIR: tempContracts,
  });

  assertContractsContext(output, 'env', tempContracts);
  assert.equal(output.workstream.label, 'Research Ops Override');
});

test('global --contracts-dir override uses the explicit contract root', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((contractsRoot) => {
    const workstreamsPath = path.join(contractsRoot, 'workstreams.json');
    const workstreams = JSON.parse(fs.readFileSync(workstreamsPath, 'utf8'));
    workstreams.workstreams[0].label = 'Research Ops From Flag';
    fs.writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });

  try {
    const output = runCli([
      '--contracts-dir',
      fixtureContractsRoot,
      'get-workstream',
      'research_ops',
    ]);

    assertContractsContext(output, 'cli_flag', fixtureContractsRoot);
    assert.equal(output.workstream.label, 'Research Ops From Flag');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('global --contracts-dir override takes precedence over OPL_CONTRACTS_DIR', () => {
  const envFixture = createContractsFixtureRoot((contractsRoot) => {
    const workstreamsPath = path.join(contractsRoot, 'workstreams.json');
    const workstreams = JSON.parse(fs.readFileSync(workstreamsPath, 'utf8'));
    workstreams.workstreams[0].label = 'Research Ops From Env';
    fs.writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });
  const flagFixture = createContractsFixtureRoot((contractsRoot) => {
    const workstreamsPath = path.join(contractsRoot, 'workstreams.json');
    const workstreams = JSON.parse(fs.readFileSync(workstreamsPath, 'utf8'));
    workstreams.workstreams[0].label = 'Research Ops From Flag';
    fs.writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });

  try {
    const output = runCli(
      ['--contracts-dir', flagFixture.fixtureContractsRoot, 'get-workstream', 'research_ops'],
      { OPL_CONTRACTS_DIR: envFixture.fixtureContractsRoot },
    );

    assertContractsContext(output, 'cli_flag', flagFixture.fixtureContractsRoot);
    assert.equal(output.workstream.label, 'Research Ops From Flag');
  } finally {
    fs.rmSync(envFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(flagFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('validateGatewayContracts returns a stable summary for the required contract set', () => {
  const validation = validateGatewayContracts(repoRoot);
  const contracts = loadGatewayContracts(repoRoot);

  assert.deepEqual(validation, {
    status: 'valid',
    contracts_dir: contractsDir,
    contracts_root_source: 'api',
    validated_contracts: [
      {
        contract_id: 'workstreams',
        file: path.join(contractsDir, 'workstreams.json'),
        schema_version: 'g1',
        status: 'valid',
      },
      {
        contract_id: 'domains',
        file: path.join(contractsDir, 'domains.json'),
        schema_version: 'g1',
        status: 'valid',
      },
      {
        contract_id: 'routing_vocabulary',
        file: path.join(contractsDir, 'routing-vocabulary.json'),
        schema_version: 'g1',
        status: 'valid',
      },
      {
        contract_id: 'task_topology',
        file: path.join(contractsDir, 'task-topology.json'),
        schema_version: contracts.taskTopology.version,
        status: 'valid',
      },
      {
        contract_id: 'public_surface_index',
        file: path.join(contractsDir, 'public-surface-index.json'),
        schema_version: contracts.publicSurfaceIndex.version,
        status: 'valid',
      },
    ],
  });
});

test('validate-contracts returns a stable machine-readable contract summary', () => {
  const output = runCli(['validate-contracts']);
  const contracts = loadGatewayContracts(repoRoot);

  assert.deepEqual(output, {
    version: 'g2',
    validation: {
      status: 'valid',
      contracts_dir: contractsDir,
      contracts_root_source: 'cwd',
      validated_contracts: [
        {
          contract_id: 'workstreams',
          file: path.join(contractsDir, 'workstreams.json'),
          schema_version: 'g1',
          status: 'valid',
        },
        {
          contract_id: 'domains',
          file: path.join(contractsDir, 'domains.json'),
          schema_version: 'g1',
          status: 'valid',
        },
        {
          contract_id: 'routing_vocabulary',
          file: path.join(contractsDir, 'routing-vocabulary.json'),
          schema_version: 'g1',
          status: 'valid',
        },
        {
          contract_id: 'task_topology',
          file: path.join(contractsDir, 'task-topology.json'),
          schema_version: contracts.taskTopology.version,
          status: 'valid',
        },
        {
          contract_id: 'public_surface_index',
          file: path.join(contractsDir, 'public-surface-index.json'),
          schema_version: contracts.publicSurfaceIndex.version,
          status: 'valid',
        },
      ],
    },
  });
});

test('doctor reports a ready local product-entry shell when Hermes is available', () => {
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
    const output = runCli(['doctor'], {
      OPL_HERMES_BIN: hermesPath,
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.product_entry.entry_surface, 'opl_local_product_entry_shell');
    assert.equal(output.product_entry.ready, true);
    assert.equal(output.product_entry.local_entry_ready, true);
    assert.equal(output.product_entry.messaging_gateway_ready, true);
    assert.equal(output.product_entry.hermes.binary.path, hermesPath);
    assert.equal(output.product_entry.hermes.version, 'Hermes Agent v9.9.9-test');
    assert.equal(output.product_entry.hermes.gateway_service.loaded, true);
    assert.deepEqual(output.product_entry.issues, []);
    assert.equal(output.validation.status, 'valid');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('projects returns the current OPL family project surfaces', () => {
  const output = runCli(['projects']);

  assert.equal(output.version, 'g2');
  assert.equal(output.projects.length, 3);
  assert.equal(output.projects[0].project_id, 'opl');
  assert.equal(output.projects[0].scope, 'family_gateway');
  assert.equal(output.projects[0].direct_entry_surface, 'opl');
  assert.equal(output.projects[1].project_id, 'medautoscience');
  assert.equal(output.projects[2].project_id, 'redcube');
});

test('workspace-status reports git and worktree visibility for one workspace path', () => {
  const output = runCli(['workspace-status', '--path', repoRoot]);

  assert.equal(output.version, 'g2');
  assert.equal(output.workspace.absolute_path, repoRoot);
  assert.equal(output.workspace.kind, 'directory');
  assert.equal(output.workspace.entries.total > 0, true);
  assert.equal(output.workspace.git.inside_work_tree, true);
  assert.equal(output.workspace.git.root, repoRoot);
  assert.equal(typeof output.workspace.git.linked_worktree, 'boolean');
  assert.equal(typeof output.workspace.git.is_clean, 'boolean');
});

test('bare opl command seeds a front-desk session when not attached to a tty', () => {
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
    const output = runCli([], {
      OPL_HERMES_BIN: hermesPath,
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.product_entry.mode, 'frontdesk');
    assert.equal(output.product_entry.interactive, false);
    assert.equal(output.product_entry.seed.session_id, 'opl-frontdesk-session');
    assert.equal(output.product_entry.seed.response, 'OPL FRONT DESK READY');
    assert.equal(output.product_entry.resume.session_id, 'opl-frontdesk-session');
    assert.equal(output.product_entry.resume.output, 'OPL FRONT DESK RESUMED');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('natural-language fallback routes multi-token input through quick ask', () => {
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
    const output = runCli(
      ['Plan', 'a', 'medical', 'grant', 'proposal', 'revision', 'loop.'],
      {
        OPL_HERMES_BIN: hermesPath,
      },
    );

    assert.equal(output.product_entry.mode, 'ask');
    assert.equal(output.product_entry.input.goal, 'Plan a medical grant proposal revision loop.');
    assert.equal(output.product_entry.routing.status, 'unknown_domain');
    assert.equal(output.product_entry.routing.candidate_workstream_id, 'grant_ops');
    assert.equal(output.product_entry.hermes.session_id, 'opl-quick-ask-session');
    assert.equal(output.product_entry.hermes.response, 'AUTO ASK READY');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ask --dry-run produces a routed Hermes handoff preview from a plain-language request', () => {
  const output = runCli([
    'ask',
    'Prepare a defense-ready slide deck for a thesis committee.',
    '--preferred-family',
    'ppt_deck',
    '--dry-run',
  ]);

  assert.equal(output.version, 'g2');
  assert.equal(output.product_entry.mode, 'ask');
  assert.equal(output.product_entry.dry_run, true);
  assert.equal(output.product_entry.input.goal, 'Prepare a defense-ready slide deck for a thesis committee.');
  assert.equal(output.product_entry.input.intent, 'create');
  assert.equal(output.product_entry.input.target, 'deliverable');
  assert.equal(output.product_entry.routing.status, 'routed');
  assert.equal(output.product_entry.routing.domain_id, 'redcube');
  assert.equal(output.product_entry.routing.workstream_id, 'presentation_ops');
  assert.match(output.product_entry.handoff_prompt_preview, /One Person Lab \(OPL\) Product Entry/);
  assert.match(output.product_entry.handoff_prompt_preview, /presentation_ops/);
  assert.equal(output.product_entry.hermes.command_preview[0], 'hermes');
  assert.ok(output.product_entry.hermes.command_preview.includes('--query'));
});

test('ask runs Hermes through the resolved product-entry handoff and returns the captured response', () => {
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
if [ "$1" = "chat" ]; then
  cat <<'EOF'
╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮
READY FROM OPL

session_id: opl-test-session
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const output = runCli(
      [
        'ask',
        'Create a xiaohongshu campaign pack for a lab update.',
        '--preferred-family',
        'xiaohongshu',
      ],
      {
        OPL_HERMES_BIN: hermesPath,
      },
    );

    assert.equal(output.version, 'g2');
    assert.equal(output.product_entry.mode, 'ask');
    assert.equal(output.product_entry.dry_run, false);
    assert.equal(output.product_entry.routing.status, 'domain_boundary');
    assert.equal(output.product_entry.routing.domain_id, 'redcube');
    assert.equal(output.product_entry.hermes.session_id, 'opl-test-session');
    assert.equal(output.product_entry.hermes.response, 'READY FROM OPL');
    assert.equal(output.product_entry.hermes.exit_code, 0);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('resume returns captured session output in non-interactive mode', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "--resume" ] && [ "$2" = "opl-test-session" ]; then
  cat <<'EOF'
RESUMED SESSION BODY
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const output = runCli(['resume', 'opl-test-session'], {
      OPL_HERMES_BIN: hermesPath,
    });

    assert.equal(output.product_entry.mode, 'resume');
    assert.equal(output.product_entry.interactive, false);
    assert.equal(output.product_entry.resume.session_id, 'opl-test-session');
    assert.equal(output.product_entry.resume.output, 'RESUMED SESSION BODY');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('sessions parses the Hermes recent-session table into a product-entry surface', () => {
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
    const output = runCli(['sessions', '--limit', '2'], {
      OPL_HERMES_BIN: hermesPath,
    });

    assert.equal(output.product_entry.mode, 'sessions');
    assert.equal(output.product_entry.sessions.length, 2);
    assert.equal(output.product_entry.sessions[0].session_id, 'run_7e2a41');
    assert.equal(output.product_entry.sessions[0].source, 'api_server');
    assert.equal(output.product_entry.sessions[1].session_id, 'sess_abcd');
    assert.equal(output.product_entry.sessions[1].preview, 'Medical grant revision session');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime-status reports Hermes runtime health, sessions, and process usage', () => {
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
  Model:        gpt-5.4
◆ Terminal Backend
  Backend:      local
◆ Messaging Platforms
  Telegram      ✓ configured
  Slack         ✗ not configured
◆ Gateway Service
  Status:       ✓ loaded
  Manager:      launchd
◆ Scheduled Jobs
  Jobs:         2
◆ Sessions
  Active:       3
EOF
  exit 0
fi
if [ "$1" = "sessions" ] && [ "$2" = "list" ]; then
  cat <<'EOF'
Preview                                            Last Active   Src    ID
───────────────────────────────────────────────────────────────────────────────────────────────
OPL dashboard session                              1m ago        cli    sess_dash
RedCube active session                             2m ago        api_server sess_redcube
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const psFixture = createFakePsFixture(`27025 1 0.1 0.2 49616 22:46 /Users/test/.hermes/venv/bin/python -m hermes_cli.main gateway run --replace
27026 27025 5.2 1.1 125000 00:31 /Users/test/.hermes/venv/bin/python -m hermes_cli.main chat --resume sess_dash`);

  try {
    const output = runCli(['runtime-status', '--limit', '2'], {
      OPL_HERMES_BIN: hermesPath,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.runtime_status.runtime_substrate, 'external_hermes_kernel');
    assert.equal(output.runtime_status.hermes.binary.path, hermesPath);
    assert.equal(output.runtime_status.status_report.parsed.summary.active_sessions, 3);
    assert.equal(output.runtime_status.status_report.parsed.summary.scheduled_jobs, 2);
    assert.deepEqual(output.runtime_status.status_report.parsed.summary.configured_messaging_platforms, ['Telegram']);
    assert.equal(output.runtime_status.recent_sessions.sessions.length, 2);
    assert.equal(output.runtime_status.process_usage.summary.process_count, 2);
    assert.equal(output.runtime_status.process_usage.processes[0].role, 'gateway');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('dashboard aggregates front-desk management surfaces into one view', () => {
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
  Jobs:         0
◆ Sessions
  Active:       1
EOF
  exit 0
fi
if [ "$1" = "sessions" ] && [ "$2" = "list" ]; then
  cat <<'EOF'
Preview                                            Last Active   Src    ID
───────────────────────────────────────────────────────────────────────────────────────────────
OPL dashboard session                              1m ago        cli    sess_dash
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const psFixture = createFakePsFixture(`27025 1 0.1 0.2 49616 22:46 /Users/test/.hermes/venv/bin/python -m hermes_cli.main gateway run --replace`);

  try {
    const output = runCli(['dashboard', '--path', repoRoot, '--sessions-limit', '1'], {
      OPL_HERMES_BIN: hermesPath,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.dashboard.front_desk.direct_entry_command, 'opl');
    assert.equal(output.dashboard.front_desk.hosted_web_status, 'pilot_frozen_not_landed');
    assert.equal(output.dashboard.projects.length, 3);
    assert.equal(output.dashboard.workspace.absolute_path, repoRoot);
    assert.equal(output.dashboard.runtime_status.recent_sessions.sessions.length, 1);
    assert.deepEqual(output.dashboard.front_desk.rollout_board_refs, [
      'docs/references/opl-hosted-web-frontdesk-benchmark.md',
      'docs/references/family-lightweight-direct-entry-rollout-board.md',
      'docs/references/mas-top-level-cutover-board.md',
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('logs returns a structured wrapper over Hermes log output', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "logs" ] && [ "$2" = "gateway" ]; then
  cat <<'EOF'
[INFO] gateway boot
[INFO] domain handoff ready
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const output = runCli(['logs', 'gateway', '--lines', '20'], {
      OPL_HERMES_BIN: hermesPath,
    });

    assert.equal(output.product_entry.mode, 'logs');
    assert.equal(output.product_entry.log_name, 'gateway');
    assert.equal(output.product_entry.lines, 20);
    assert.match(output.product_entry.raw_output, /gateway boot/);
    assert.ok(output.product_entry.command_preview.includes('gateway'));
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('repair-hermes-gateway reinstalls and rechecks the gateway service', () => {
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
    const output = runCli(['repair-hermes-gateway'], {
      OPL_HERMES_BIN: hermesPath,
    });

    assert.equal(output.product_entry.mode, 'repair_hermes_gateway');
    assert.match(output.product_entry.install_output, /Service definition updated/);
    assert.equal(output.product_entry.gateway_service.loaded, true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('chat --dry-run prepares a seeding query and a resume command for Hermes', () => {
  const output = runCli([
    'chat',
    'Plan a medical grant proposal revision loop.',
    '--dry-run',
  ]);

  assert.equal(output.version, 'g2');
  assert.equal(output.product_entry.mode, 'chat');
  assert.equal(output.product_entry.dry_run, true);
  assert.equal(output.product_entry.routing.status, 'unknown_domain');
  assert.equal(output.product_entry.routing.candidate_workstream_id, 'grant_ops');
  assert.equal(output.product_entry.hermes.seed_command_preview[0], 'hermes');
  assert.ok(output.product_entry.hermes.seed_command_preview.includes('--query'));
  assert.deepEqual(output.product_entry.hermes.resume_command_preview, [
    'hermes',
    '--resume',
    '<session_id>',
  ]);
});

test('validate-contracts exposes env contract-root provenance', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot(() => {});

  try {
    const output = runCli(['validate-contracts'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    assert.equal(output.validation.contracts_dir, fixtureContractsRoot);
    assert.equal(output.validation.contracts_root_source, 'env');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validate-contracts exposes cli-flag contract-root provenance', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot(() => {});

  try {
    const output = runCli([
      '--contracts-dir',
      fixtureContractsRoot,
      'validate-contracts',
    ]);

    assert.equal(output.validation.contracts_dir, fixtureContractsRoot);
    assert.equal(output.validation.contracts_root_source, 'cli_flag');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validate-contracts surfaces stable missing-file errors with cwd provenance', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((contractsRoot) => {
    fs.rmSync(path.join(contractsRoot, 'task-topology.json'));
  });

  try {
    const { status, payload } = runCliFailureInCwd(['validate-contracts'], fixtureRoot);

    assert.equal(payload.version, 'g2');
    assert.equal(payload.error.code, 'contract_file_missing');
    assert.equal(payload.error.exit_code, 3);
    assert.equal(status, 3);
    assert.match(payload.error.message, /task-topology\.json/i);
    assert.equal(payload.error.details.contracts_dir, fs.realpathSync.native(fixtureContractsRoot));
    assert.equal(payload.error.details.contracts_root_source, 'cwd');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validate-contracts surfaces stable invalid-json errors', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((contractsRoot) => {
    fs.writeFileSync(path.join(contractsRoot, 'domains.json'), '{ invalid json\n');
  });

  try {
    const { status, payload } = runCliFailure(['validate-contracts'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    assert.equal(payload.version, 'g2');
    assert.equal(payload.error.code, 'contract_json_invalid');
    assert.equal(payload.error.exit_code, 3);
    assert.equal(status, 3);
    assert.match(payload.error.message, /domains\.json/i);
    assert.equal(payload.error.details.contracts_dir, fixtureContractsRoot);
    assert.equal(payload.error.details.contracts_root_source, 'env');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validate-contracts surfaces stable shape-invalid errors with cli-flag provenance', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((contractsRoot) => {
    const workstreamsPath = path.join(contractsRoot, 'workstreams.json');
    const workstreams = JSON.parse(fs.readFileSync(workstreamsPath, 'utf8'));
    delete workstreams.workstreams[0].label;
    fs.writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });

  try {
    const { status, payload } = runCliFailure([
      '--contracts-dir',
      fixtureContractsRoot,
      'validate-contracts',
    ]);

    assert.equal(payload.version, 'g2');
    assert.equal(payload.error.code, 'contract_shape_invalid');
    assert.equal(payload.error.exit_code, 3);
    assert.equal(status, 3);
    assert.match(payload.error.message, /label/i);
    assert.equal(payload.error.details.contracts_dir, fixtureContractsRoot);
    assert.equal(payload.error.details.contracts_root_source, 'cli_flag');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('missing value for global --contracts-dir returns a usage error with exit code 2', () => {
  const { status, payload } = runCliFailure(['--contracts-dir']);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'cli_usage_error');
  assert.equal(payload.error.exit_code, 2);
  assert.equal(status, 2);
  assert.match(payload.error.message, /contracts-dir/i);
});

test('global --contracts-dir expects an exact contract root', () => {
  const { status, payload } = runCliFailure([
    '--contracts-dir',
    repoRoot,
    'validate-contracts',
  ]);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'contract_file_missing');
  assert.equal(payload.error.exit_code, 3);
  assert.equal(status, 3);
});

test('list-workstreams returns admitted workstream summaries', () => {
  const output = runCli(['list-workstreams']);

  assert.deepEqual(output, {
    version: 'g2',
    contracts_context: {
      contracts_dir: contractsDir,
      contracts_root_source: 'cwd',
    },
    workstreams: [
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
    ],
  });
});

test('get-workstream returns the full registered workstream meaning', () => {
  const output = runCli(['get-workstream', 'presentation_ops']);

  assert.equal(output.version, 'g2');
  assertContractsContext(output, 'cwd');
  assert.equal(output.workstream.workstream_id, 'presentation_ops');
  assert.equal(output.workstream.domain_id, 'redcube');
  assert.deepEqual(output.workstream.primary_families, ['ppt_deck']);
});

test('list-domains returns the registered domain gateway summaries', () => {
  const output = runCli(['list-domains']);

  assert.deepEqual(output, {
    version: 'g2',
    contracts_context: {
      contracts_dir: contractsDir,
      contracts_root_source: 'cwd',
    },
    domains: [
      {
        domain_id: 'medautoscience',
        gateway_surface: 'Research Ops Gateway',
        owned_workstreams: ['research_ops'],
      },
      {
        domain_id: 'redcube',
        gateway_surface: 'Visual Deliverable Gateway',
        owned_workstreams: ['presentation_ops'],
      },
    ],
  });
});

test('list-surfaces returns the public gateway surface summaries', () => {
  const output = runCli(['list-surfaces']);

  assert.equal(output.version, 'g2');
  assertContractsContext(output, 'cwd');
  assert.ok(Array.isArray(output.surfaces));
  assert.ok(output.surfaces.length > 10);
  assert.deepEqual(output.surfaces[0], {
    surface_id: 'opl_public_readme',
    category_id: 'opl_public_entry',
    surface_kind: 'readme',
    owner_scope: 'opl',
  });
  assert.ok(
    output.surfaces.some(
      (surface: {
        surface_id: string;
        category_id: string;
        surface_kind: string;
        owner_scope: string;
      }) =>
        surface.surface_id === 'redcube_public_gateway'
        && surface.category_id === 'domain_public_entry'
        && surface.owner_scope === 'domain',
    ),
  );
});

test('get-domain returns the full registered domain meaning', () => {
  const output = runCli(['get-domain', 'redcube']);

  assert.equal(output.version, 'g2');
  assertContractsContext(output, 'cwd');
  assert.equal(output.domain.domain_id, 'redcube');
  assert.equal(output.domain.project, 'redcube-ai');
  assert.deepEqual(output.domain.non_opl_families, ['xiaohongshu']);
});

test('get-surface returns the full registered public surface meaning', () => {
  const output = runCli(['get-surface', 'opl_read_only_discovery_gateway']);

  assert.equal(output.version, 'g2');
  assertContractsContext(output, 'cwd');
  assert.equal(output.surface.surface_id, 'opl_read_only_discovery_gateway');
  assert.equal(output.surface.category_id, 'opl_contract_surface');
  assert.deepEqual(output.surface.routes_to, [
    'medautoscience_public_gateway',
    'redcube_public_gateway',
  ]);
});

test('resolveRequestSurface routes research delivery to medautoscience', () => {
  const resolution = resolveRequestSurface(
    {
      intent: 'submission_delivery',
      target: 'publication',
      goal: 'Prepare the manuscript package for journal review.',
    },
    loadGatewayContracts(repoRoot),
  );

  assert.equal(resolution.status, 'routed');
  assert.equal(resolution.workstream_id, 'research_ops');
  assert.equal(resolution.domain_id, 'medautoscience');
});

test('resolveRequestSurface routes presentation delivery to redcube', () => {
  const resolution = resolveRequestSurface(
    {
      intent: 'presentation_delivery',
      target: 'deliverable',
      goal: 'Prepare a defense-ready slide deck for a thesis committee.',
    },
    loadGatewayContracts(repoRoot),
  );

  assert.equal(resolution.status, 'routed');
  assert.equal(resolution.request_kind, 'discover');
  assert.equal(resolution.workstream_id, 'presentation_ops');
  assert.equal(resolution.domain_id, 'redcube');
  assert.equal(resolution.entry_surface, 'domain_gateway');
  assert.equal(resolution.recommended_family, 'ppt_deck');
});

test('resolveRequestSurface keeps ppt_deck mapped to presentation_ops', () => {
  const output = runCli([
    'resolve-request-surface',
    '--intent',
    'presentation_delivery',
    '--target',
    'deliverable',
    '--goal',
    'Create the committee deck.',
    '--preferred-family',
    'ppt_deck',
  ]);

  assert.equal(output.version, 'g2');
  assertContractsContext(output, 'cwd');
  assert.equal(output.resolution.status, 'routed');
  assert.equal(output.resolution.workstream_id, 'presentation_ops');
  assert.equal(output.resolution.domain_id, 'redcube');
});

test('resolveRequestSurface keeps xiaohongshu at the redcube family boundary', () => {
  const output = runCli([
    'resolve-request-surface',
    '--intent',
    'create',
    '--target',
    'deliverable',
    '--goal',
    'Prepare a xiaohongshu campaign pack.',
    '--preferred-family',
    'xiaohongshu',
  ]);

  assertContractsContext(output, 'cwd');
  assert.equal(output.resolution.status, 'domain_boundary');
  assert.equal(output.resolution.domain_id, 'redcube');
  assert.equal(output.resolution.workstream_id, null);
});

test('resolveRequestSurface returns unknown_domain for under-definition workstreams', () => {
  const output = runCli([
    'resolve-request-surface',
    '--intent',
    'plan',
    '--target',
    'deliverable',
    '--goal',
    'Build a formal grant proposal operating lane from the supplied topic brief.',
  ]);

  assertContractsContext(output, 'cwd');
  assert.equal(output.resolution.status, 'unknown_domain');
  assert.equal(output.resolution.candidate_workstream_id, 'grant_ops');
});

test('resolveRequestSurface returns ambiguous_task with explicit boundary evidence when the primary deliverable is unclear', () => {
  const output = runCli([
    'resolve-request-surface',
    '--intent',
    'create',
    '--target',
    'deliverable',
    '--goal',
    'Package the study for submission and also turn it into a defense-ready deck.',
  ]);

  assertContractsContext(output, 'cwd');
  assert.equal(output.resolution.status, 'ambiguous_task');
  assert.deepEqual(output.resolution.candidate_workstreams, [
    'research_ops',
    'presentation_ops',
  ]);
  assert.deepEqual(output.resolution.candidate_domains, [
    'medautoscience',
    'redcube',
  ]);
  assert.deepEqual(output.resolution.required_clarification, [
    'Is the primary goal a formal research deliverable or a presentation deliverable?',
    'If visual delivery is primary, should the family be ppt_deck or another RedCube family?',
  ]);
  assert.deepEqual(output.resolution.routing_evidence, [
    'research delivery semantics',
    'presentation delivery semantics',
    'missing primary deliverable',
  ]);
});

test('explainDomainBoundary explains admitted presentation routing', () => {
  const explanation = explainDomainBoundary(
    {
      intent: 'presentation_delivery',
      target: 'deliverable',
      goal: 'Prepare a defense-ready slide deck for a thesis committee.',
    },
    loadGatewayContracts(repoRoot),
  );

  assert.equal(explanation.boundary_status, 'routed');
  assert.equal(explanation.resolved_domain, 'redcube');
  assert.equal(explanation.resolved_workstream_id, 'presentation_ops');
  assert.equal(explanation.rejected_domains[0]?.domain_id, 'medautoscience');
  assert.match(explanation.rejected_domains[0]?.reason ?? '', /research evidence/i);
  assert.match(explanation.reason, /visual deliverable/i);
});

test('explain-domain-boundary explains xiaohongshu non-equivalence', () => {
  const output = runCli([
    'explain-domain-boundary',
    '--intent',
    'create',
    '--target',
    'deliverable',
    '--goal',
    'Prepare a xiaohongshu campaign pack.',
    '--preferred-family',
    'xiaohongshu',
  ]);

  assertContractsContext(output, 'cwd');
  assert.equal(output.boundary_explanation.resolved_domain, 'redcube');
  assert.equal(output.boundary_explanation.resolved_workstream_id, null);
  assert.match(output.boundary_explanation.reason, /not automatically equal presentation ops/i);
});

test('explain-domain-boundary explains under-definition requests', () => {
  const output = runCli([
    'explain-domain-boundary',
    '--intent',
    'plan',
    '--target',
    'deliverable',
    '--goal',
    'Build a thesis defense preparation pack from the current papers.',
  ]);

  assertContractsContext(output, 'cwd');
  assert.equal(output.boundary_explanation.resolved_domain, null);
  assert.equal(output.boundary_explanation.candidate_workstream_id, 'thesis_ops');
  assert.match(output.boundary_explanation.reason, /under definition/i);
});

test('help returns command discovery and runnable examples', () => {
  const output = runCli(['help']);

  assertNoContractsProvenance(output);
  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, null);
  assert.equal(output.help.usage, 'opl [command|request...] [args]');
  assert.ok(
    ['list-workstreams', 'get-workstream', 'list-domains', 'get-domain', 'list-surfaces', 'get-surface', 'resolve-request-surface', 'explain-domain-boundary'].every((command) =>
      output.help.commands.some((entry: { command: string }) => entry.command === command),
    ),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'validate-contracts'),
  );
  assert.ok(
    output.help.commands.some(
      (entry: { command: string; examples: string[] }) =>
        entry.command === 'validate-contracts'
        && entry.examples.includes('opl validate-contracts'),
    ),
  );
  assert.ok(output.help.examples.includes('opl get-workstream presentation_ops'));
  assert.ok(
    output.help.examples.includes(
      'opl explain-domain-boundary --intent create --target deliverable --goal "Prepare a xiaohongshu campaign pack." --preferred-family xiaohongshu',
    ),
  );
});

test('root --help returns the same machine-readable help payload', () => {
  const output = runCli(['--help']);

  assertNoContractsProvenance(output);
  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, null);
  assert.equal(output.help.usage, 'opl [command|request...] [args]');
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'get-domain'),
  );
});

test('command --help returns command-scoped usage and examples', () => {
  const output = runCli(['get-domain', '--help']);

  assertNoContractsProvenance(output);
  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, 'get-domain');
  assert.equal(output.help.usage, 'opl get-domain <domain_id>');
  assert.ok(output.help.examples.includes('opl get-domain redcube'));
});

test('help <command> returns the same payload as command --help', () => {
  const viaHelp = runCli(['help', 'get-domain']);
  const viaFlag = runCli(['get-domain', '--help']);

  assert.deepEqual(viaHelp, viaFlag);
});

test('explain-domain-boundary --help advertises the xiaohongshu family-boundary example', () => {
  const output = runCli(['explain-domain-boundary', '--help']);

  assertNoContractsProvenance(output);
  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, 'explain-domain-boundary');
  assert.ok(
    output.help.examples.includes(
      'opl explain-domain-boundary --intent create --target deliverable --goal "Prepare a xiaohongshu campaign pack." --preferred-family xiaohongshu',
    ),
  );
});

test('command help literal returns a usage error instead of command-scoped help', () => {
  const { status, payload } = runCliFailure(['get-domain', 'help']);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'cli_usage_error');
  assert.equal(payload.error.exit_code, 2);
  assert.equal(status, 2);
  assert.equal(payload.error.details.help_usage, 'opl get-domain --help');
});

test('CLI usage errors expose machine-readable usage guidance', () => {
  const { status, payload } = runCliFailure(['get-domain']);

  assertNoContractsProvenance(payload);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'cli_usage_error');
  assert.equal(payload.error.exit_code, 2);
  assert.equal(status, 2);
  assert.equal(payload.error.details.usage, 'opl get-domain <domain_id>');
  assert.ok(Array.isArray(payload.error.details.examples));
  assert.ok(payload.error.details.examples.includes('opl get-domain redcube'));
});

test('CLI returns stable JSON errors for unknown ids', () => {
  const { status, payload } = runCliFailure(['get-domain', 'unknown']);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'domain_not_found');
  assert.equal(payload.error.exit_code, 4);
  assert.equal(status, 4);
});

test('CLI returns stable JSON errors for unknown surface ids', () => {
  const { status, payload } = runCliFailure(['get-surface', 'unknown_surface']);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'surface_not_found');
  assert.equal(payload.error.exit_code, 4);
  assert.equal(status, 4);
  assert.deepEqual(payload.error.details, { surface_id: 'unknown_surface' });
});

test('CLI returns machine-readable JSON errors for unknown commands with available command discovery', () => {
  const { status, payload } = runCliFailure(['unknown-command']);

  assertNoContractsProvenance(payload);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'unknown_command');
  assert.equal(payload.error.exit_code, 2);
  assert.equal(status, 2);
  assert.ok(Array.isArray(payload.error.details.commands));
  assert.ok(payload.error.details.commands.includes('validate-contracts'));
  assert.equal(payload.error.details.command, 'unknown-command');
  assert.equal(payload.error.details.usage, 'opl help');
});
