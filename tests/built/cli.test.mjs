import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
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

function createFakeCodexFixture(handlerBody) {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-codex-fixture-'));
  const codexPath = path.join(fixtureRoot, 'codex');
  writeFileSync(
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

function createFakeLaunchctlFixture() {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-launchctl-fixture-'));
  const stateDir = path.join(fixtureRoot, 'state');
  mkdirSync(stateDir, { recursive: true });
  const launchctlPath = path.join(fixtureRoot, 'launchctl');
  writeFileSync(
    launchctlPath,
    `#!/usr/bin/env bash
set -euo pipefail
STATE_DIR="${stateDir}"
CALLS="$STATE_DIR/calls.log"
mkdir -p "$STATE_DIR"
printf '%s\\n' "$*" >> "$CALLS"

case "$1" in
  bootstrap)
    touch "$STATE_DIR/loaded"
    exit 0
    ;;
  bootout)
    rm -f "$STATE_DIR/loaded"
    exit 0
    ;;
  kickstart)
    touch "$STATE_DIR/loaded"
    exit 0
    ;;
  print)
    if [ -f "$STATE_DIR/loaded" ]; then
      cat <<'EOF'
service = ai.opl.frontdesk
state = running
EOF
      exit 0
    fi
    echo "service not loaded" >&2
    exit 113
    ;;
esac

echo "unexpected launchctl args: $*" >&2
exit 1
`,
    { mode: 0o755 },
  );

  return {
    fixtureRoot,
    launchctlPath,
    callsPath: path.join(stateDir, 'calls.log'),
  };
}

function createFakeOpenFixture() {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-open-fixture-'));
  const capturePath = path.join(fixtureRoot, 'open.log');
  const openPath = path.join(fixtureRoot, 'open');
  writeFileSync(
    openPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" > "${capturePath}"
`,
    { mode: 0o755 },
  );

  return {
    fixtureRoot,
    openPath,
    capturePath,
  };
}

function createFakeShellCommandFixture() {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-shell-command-fixture-'));
  const capturePath = path.join(fixtureRoot, 'shell-command.log');
  const commandPath = path.join(fixtureRoot, 'fake-domain-entry');
  writeFileSync(
    commandPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${capturePath}"
`,
    { mode: 0o755 },
  );

  return {
    fixtureRoot,
    commandPath,
    capturePath,
  };
}

async function startCliServer(args, options = {}, timeoutMs = 10000) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliEntrypoint, ...args], {
      cwd: options.cwd ?? repoRoot,
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    const finishReject = (message) => {
      clearTimeout(timeout);
      child.kill('SIGTERM');
      reject(new Error(`${message}\nstdout=${stdout}\nstderr=${stderr}`));
    };

    const onExit = (code, signal) => {
      finishReject(`CLI server exited before startup payload was ready (code=${code}, signal=${signal}).`);
    };

    const timeout = setTimeout(() => {
      finishReject('Timed out while waiting for CLI server startup payload.');
    }, timeoutMs);

    child.once('exit', onExit);
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();

      try {
        const payload = JSON.parse(stdout.trim());
        clearTimeout(timeout);
        child.off('exit', onExit);
        resolve({
          child,
          payload,
          stdout,
          stderr,
        });
      } catch {
        // Wait for the full JSON startup payload.
      }
    });
  });
}

async function stopCliServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    const forceKill = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }, 2000);

    child.once('exit', () => {
      clearTimeout(forceKill);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

test('contract workstreams returns the admitted workstream summaries', () => {
  assert.ok(existsSync(cliEntrypoint), `Expected CLI entrypoint at ${cliEntrypoint}.`);

  const result = runCli(['contract', 'workstreams']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.deepEqual(payload.contracts_context, {
    contracts_dir: contractsRoot,
    contracts_root_source: 'cwd',
  });
  assert.deepEqual(payload.workstreams, [
    {
      workstream_id: 'grant_ops',
      label: 'Grant Ops',
      status: 'emerging',
      domain_id: 'medautogrant',
    },
    {
      workstream_id: 'research_ops',
      label: 'Research Foundry',
      status: 'active',
      domain_id: 'medautoscience',
    },
    {
      workstream_id: 'presentation_ops',
      label: 'Presentation Foundry',
      status: 'emerging',
      domain_id: 'redcube',
    },
  ]);
});

test('contract domain redcube returns gateway and harness truth', () => {
  const result = runCli(['contract', 'domain', 'redcube']);
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

test('domain resolve-request maps a defense-ready slide deck to presentation_ops via redcube', () => {
  const result = runCli([
    'domain',
    'resolve-request',
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

test('domain resolve-request keeps xiaohongshu at the redcube family boundary without auto-admitting presentation_ops', () => {
  const result = runCli([
    'domain',
    'resolve-request',
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

test('domain resolve-request emits ambiguous_task with machine-readable clarification evidence', () => {
  const result = runCli([
    'domain',
    'resolve-request',
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

test('contract validate returns a stable machine-readable success summary', () => {
  const result = runCli(['contract', 'validate']);
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

test('contract validate exposes cli-flag contract-root provenance for built CLI entrypoints', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot(() => {});

  try {
    const result = runCli(['--contracts-dir', fixtureContractsRoot, 'contract', 'validate']);
    assert.equal(result.status, 0, formatFailure(result));

    const payload = parseJsonOutput(result);
    assert.equal(payload.validation.contracts_dir, fixtureContractsRoot);
    assert.equal(payload.validation.contracts_root_source, 'cli_flag');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('contract validate surfaces missing files with a stable machine-readable error envelope', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((_fixtureRoot, contractsDir) => {
    rmSync(path.join(contractsDir, 'task-topology.json'));
  });

  try {
    const result = runCli(['contract', 'validate'], { env: { OPL_CONTRACTS_DIR: fixtureContractsRoot } });
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

test('contract validate surfaces invalid JSON from the contract set rooted at cwd', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((_fixtureRoot, contractsDir) => {
    writeFileSync(path.join(contractsDir, 'domains.json'), '{ invalid json\n');
  });

  try {
    const result = runCli(['contract', 'validate'], { env: { OPL_CONTRACTS_DIR: fixtureContractsRoot } });
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
  const result = runCli(['workspace', 'projects']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.projects.length, 4);
  assert.deepEqual(
    payload.projects.map((project) => project.project_id).sort(),
    ['medautogrant', 'medautoscience', 'opl', 'redcube'],
  );
});

test('status workspace stays machine-readable through the built CLI entrypoint', () => {
  const result = runCli(['status', 'workspace', '--path', repoRoot]);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.workspace.absolute_path, repoRoot);
  assert.equal(payload.workspace.git.inside_work_tree, true);
  assert.equal(typeof payload.workspace.git.linked_worktree, 'boolean');
});

test('status runtime and status dashboard stay machine-readable through the built CLI entrypoint', () => {
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
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-built-dashboard-state-'));

  try {
    const runtimeResult = runCli(['status', 'runtime', '--limit', '1'], {
      env: {
        OPL_HERMES_BIN: hermesPath,
        PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
      },
    });
    assert.equal(runtimeResult.status, 0, formatFailure(runtimeResult));
    const runtimePayload = parseJsonOutput(runtimeResult);
    assert.equal(runtimePayload.runtime_status.status_report.parsed.summary.active_sessions, 2);
    assert.equal(runtimePayload.runtime_status.process_usage.summary.process_count, 1);

    const dashboardResult = runCli(['status', 'dashboard', '--path', repoRoot, '--sessions-limit', '1'], {
      env: {
        OPL_FRONTDESK_STATE_DIR: stateRoot,
        OPL_HERMES_BIN: hermesPath,
        PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
      },
    });
    assert.equal(dashboardResult.status, 0, formatFailure(dashboardResult));
    const dashboardPayload = parseJsonOutput(dashboardResult);
    assert.equal(dashboardPayload.dashboard.projects.length, 4);
    assert.equal(dashboardPayload.dashboard.product_api.local_web_status, 'pilot_landed');
    assert.equal(dashboardPayload.dashboard.product_api.desktop_shell_status, 'not_repo_tracked');
    assert.equal(dashboardPayload.dashboard.product_api.desktop_default_entry_status, 'external_overlay_required');
    assert.equal('hosted_web_status' in dashboardPayload.dashboard.product_api, false);
    assert.equal('librechat_pilot_package_status' in dashboardPayload.dashboard.product_api, false);
    assert.equal('frontdesk_librechat_status_surface' in dashboardPayload.dashboard.product_api, false);
    assert.equal(
      dashboardPayload.dashboard.product_api.hosted_runtime_readiness.status,
      'pilot_ready_not_managed',
    );
    assert.equal(dashboardPayload.dashboard.product_api.recommended_entry_surfaces_count, 0);
    assert.equal(dashboardPayload.dashboard.runtime_status.recent_sessions.sessions.length, 1);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('help exposes the public OPL product API entrypoints through the built CLI entrypoint', () => {
  const result = runCli(['help']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.ok(payload.help.commands.some((entry) => entry.command === 'web'));
  assert.ok(payload.help.commands.some((entry) => entry.command === 'web bundle'));
  assert.ok(payload.help.commands.some((entry) => entry.command === 'web package'));
  assert.ok(payload.help.commands.some((entry) => entry.command === 'system'));
  assert.ok(payload.help.commands.some((entry) => entry.command === 'system initialize'));
  assert.ok(payload.help.commands.some((entry) => entry.command === 'modules'));
  assert.ok(payload.help.commands.some((entry) => entry.command === 'engine install'));
  assert.ok(payload.help.commands.some((entry) => entry.command === 'service install'));
  assert.ok(payload.help.commands.some((entry) => entry.command === 'service status'));
  assert.equal(payload.help.commands.some((entry) => entry.command === 'frontdesk bootstrap'), false);
  assert.equal(payload.help.commands.some((entry) => entry.command === 'frontdesk manifest'), false);
  assert.ok(payload.help.commands.some((entry) => entry.command === 'workspace bind'));
  assert.ok(payload.help.commands.some((entry) => entry.command === 'domain launch'));
  assert.ok(payload.help.commands.some((entry) => entry.command === 'session ledger'));
  assert.ok(payload.help.commands.some((entry) => entry.command === 'contract handoff-envelope'));

  const scoped = runCli(['web', '--help']);
  assert.equal(scoped.status, 0, formatFailure(scoped));
  const scopedPayload = parseJsonOutput(scoped);
  assert.equal(scopedPayload.help.command, 'web');
  assert.match(scopedPayload.help.usage, /opl web/);
});

test('legacy frontdesk command surfaces are retired from the built CLI entrypoint', () => {
  for (const args of [
    ['frontdesk', 'manifest'],
    ['frontdesk', 'entry-guide'],
    ['frontdesk', 'domain-wiring'],
    ['frontdesk', 'readiness'],
  ]) {
    const result = runCli(args);
    assert.equal(result.status, 2);
    const payload = parseJsonOutput(result, 'stderr');
    assert.equal(payload.error.code, 'unknown_command');
    assert.equal(payload.error.details.command, 'frontdesk');
    assert.equal(payload.error.details.commands.includes('frontdesk manifest'), false);
  }
});

test('service install --help stays machine-readable through the built CLI entrypoint', () => {
  const result = runCli(['service', 'install', '--help']);
  assert.equal(result.status, 0, formatFailure(result));
  const payload = parseJsonOutput(result);
  assert.equal(payload.help.command, 'service install');
  assert.match(payload.help.usage, /opl service install/);
  assert.ok(payload.help.examples.includes('opl service install --port 8787'));
});

test('service lifecycle stays machine-readable through the built CLI entrypoint', () => {
  const homeRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-frontdesk-home-'));
  const launchctlFixture = createFakeLaunchctlFixture();
  const openFixture = createFakeOpenFixture();
  const env = {
    HOME: homeRoot,
    OPL_LAUNCHCTL_BIN: launchctlFixture.launchctlPath,
    OPL_OPEN_BIN: openFixture.openPath,
  };
  const configuredPort = 8922;

  try {
    const installResult = runCli([
      'service',
      'install',
      '--host',
      '127.0.0.1',
      '--port',
      String(configuredPort),
      '--path',
      repoRoot,
      '--sessions-limit',
      '6',
    ], {
      env,
    });
    assert.equal(installResult.status, 0, formatFailure(installResult));
    const installPayload = parseJsonOutput(installResult);
    assert.equal(installPayload.service.action, 'install');
    assert.equal(installPayload.service.installed, true);
    assert.equal(installPayload.service.loaded, true);
    assert.equal(installPayload.service.base_url, `http://127.0.0.1:${configuredPort}`);
    assert.equal(existsSync(installPayload.service.paths.launch_agent_plist), true);

    const plistText = readFileSync(installPayload.service.paths.launch_agent_plist, 'utf8');
    assert.match(plistText, /<string>web<\/string>/);
    assert.match(plistText, new RegExp(String(configuredPort)));

    const statusResult = runCli(['service', 'status'], {
      env,
    });
    assert.equal(statusResult.status, 0, formatFailure(statusResult));
    const statusPayload = parseJsonOutput(statusResult);
    assert.equal(statusPayload.service.loaded, true);
    assert.equal(statusPayload.service.health.status, 'unreachable');
    assert.equal(
      statusPayload.service.health.url,
      `http://127.0.0.1:${configuredPort}/api/health`,
    );

    const openResult = runCli(['service', 'open'], {
      env,
    });
    assert.equal(openResult.status, 0, formatFailure(openResult));
    const openPayload = parseJsonOutput(openResult);
    assert.equal(openPayload.service.action, 'open');
    assert.match(readFileSync(openFixture.capturePath, 'utf8'), new RegExp(String(configuredPort)));

    const stopResult = runCli(['service', 'stop'], {
      env,
    });
    assert.equal(stopResult.status, 0, formatFailure(stopResult));
    const stopPayload = parseJsonOutput(stopResult);
    assert.equal(stopPayload.service.action, 'stop');
    assert.equal(stopPayload.service.loaded, false);

    const startResult = runCli(['service', 'start'], {
      env,
    });
    assert.equal(startResult.status, 0, formatFailure(startResult));
    const startPayload = parseJsonOutput(startResult);
    assert.equal(startPayload.service.action, 'start');
    assert.equal(startPayload.service.loaded, true);

    const uninstallResult = runCli(['service', 'uninstall'], {
      env,
    });
    assert.equal(uninstallResult.status, 0, formatFailure(uninstallResult));
    const uninstallPayload = parseJsonOutput(uninstallResult);
    assert.equal(uninstallPayload.service.action, 'uninstall');
    assert.equal(uninstallPayload.service.installed, false);
    assert.equal(existsSync(installPayload.service.paths.launch_agent_plist), false);
  } finally {
    rmSync(homeRoot, { recursive: true, force: true });
    rmSync(launchctlFixture.fixtureRoot, { recursive: true, force: true });
    rmSync(openFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('web bundle stays machine-readable through the built CLI entrypoint', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-built-hosted-bundle-state-'));

  try {
    const result = runCli([
      'web',
      'bundle',
      '--host',
      '0.0.0.0',
      '--port',
      '8787',
      '--base-path',
      '/pilot/opl',
      '--path',
      repoRoot,
      '--sessions-limit',
      '9',
    ], {
      env: {
        OPL_FRONTDESK_STATE_DIR: stateRoot,
      },
    });
    assert.equal(result.status, 0, formatFailure(result));

    const payload = parseJsonOutput(result);
    assert.equal(payload.web_bundle.surface_id, 'opl_web_bundle');
    assert.equal(payload.web_bundle.base_path, '/pilot/opl');
    assert.equal(payload.web_bundle.entry_url, 'http://127.0.0.1:8787/pilot/opl/');
    assert.equal(payload.web_bundle.api_base_url, 'http://127.0.0.1:8787/pilot/opl/api');
    assert.equal(payload.web_bundle.opl_api.resources.system, '/pilot/opl/api/opl/system');
    assert.equal(payload.web_bundle.opl_api.actions.web_bundle, '/pilot/opl/api/opl/web/bundle');
    assert.equal(payload.web_bundle.defaults.workspace_path, repoRoot);
    assert.equal(payload.web_bundle.defaults.sessions_limit, 9);
    assert.equal(payload.web_bundle.hosted_runtime_readiness.status, 'pilot_ready_not_managed');
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('web package stays machine-readable through the built CLI entrypoint', () => {
  const outputDir = mkdtempSync(path.join(os.tmpdir(), 'opl-built-hosted-package-'));

  try {
    const result = runCli([
      'web',
      'package',
      '--output',
      outputDir,
      '--public-origin',
      'https://opl.example.com',
      '--host',
      '0.0.0.0',
      '--port',
      '8787',
      '--base-path',
      '/pilot/opl',
      '--sessions-limit',
      '9',
    ]);
    assert.equal(result.status, 0, formatFailure(result));

    const payload = parseJsonOutput(result);
    assert.equal(payload.web_package.surface_id, 'opl_web_package');
    assert.equal(payload.web_package.shell_integration_target, 'external_gui_overlay');
    assert.equal(payload.web_package.package_status, 'landed');
    assert.equal(payload.web_package.hosted_runtime_status, 'not_landed');
    assert.equal(payload.web_package.public_origin, 'https://opl.example.com');
    assert.equal(payload.web_package.entry_url, 'https://opl.example.com/pilot/opl/');
    assert.equal(payload.web_package.api_base_url, 'https://opl.example.com/pilot/opl/api');
    assert.equal(payload.web_package.opl_api.resources.system, '/pilot/opl/api/opl/system');
    assert.equal(
      payload.web_package.hosted_runtime_readiness.status,
      'pilot_ready_not_managed',
    );
    assert.equal(existsSync(payload.web_package.assets.bundle_json), true);
    assert.equal(existsSync(payload.web_package.assets.readme), true);
    assert.equal(existsSync(payload.web_package.assets.launch_script), true);
    assert.equal(existsSync(payload.web_package.assets.service_unit), true);
    assert.equal(existsSync(payload.web_package.assets.reverse_proxy_template), true);
    assert.equal(existsSync(payload.web_package.assets.environment_template), true);
    assert.equal(existsSync(path.join(payload.web_package.assets.app_dist, 'cli.js')), true);
    assert.equal(
      existsSync(path.join(payload.web_package.assets.app_contracts, 'opl-gateway', 'workstreams.json')),
      true,
    );
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test('workspace registry and contract handoff surfaces stay machine-readable through the built CLI entrypoint', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-built-state-fixture-'));

  try {
    const bindResult = runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--label',
      'RedCube Main Workspace',
      '--entry-command',
      'redcube-ai frontdesk',
      '--manifest-command',
      'redcube product manifest --workspace-root /Users/gaofeng/workspace/redcube-ai',
      '--entry-url',
      'http://127.0.0.1:3310/redcube',
    ], {
      env: {
        OPL_FRONTDESK_STATE_DIR: stateRoot,
      },
    });
    assert.equal(bindResult.status, 0, formatFailure(bindResult));
    const bindPayload = parseJsonOutput(bindResult);
    assert.equal(bindPayload.workspace_catalog.action, 'bind');
    assert.equal(bindPayload.workspace_catalog.binding.direct_entry.command, 'redcube-ai frontdesk');

    const catalogResult = runCli(['workspace', 'list'], {
      env: {
        OPL_FRONTDESK_STATE_DIR: stateRoot,
      },
    });
    assert.equal(catalogResult.status, 0, formatFailure(catalogResult));
    const catalogPayload = parseJsonOutput(catalogResult);
    assert.equal(catalogPayload.workspace_catalog.projects.length, 4);
    assert.equal(catalogPayload.workspace_catalog.projects[3].active_binding.workspace_path, repoRoot);
    assert.equal(catalogPayload.workspace_catalog.projects[3].bindings_count.total, 1);
    assert.equal(catalogPayload.workspace_catalog.projects[3].bindings_count.direct_entry_ready, 1);
    assert.equal(catalogPayload.workspace_catalog.projects[3].bindings_count.manifest_ready, 1);
    assert.deepEqual(catalogPayload.workspace_catalog.projects[3].available_actions, ['bind', 'activate', 'archive', 'launch']);
    assert.equal(catalogPayload.workspace_catalog.summary.active_projects_count, 1);
    assert.equal(catalogPayload.workspace_catalog.summary.direct_entry_ready_projects_count, 1);
    assert.equal(catalogPayload.workspace_catalog.summary.manifest_ready_projects_count, 1);

    const handoffResult = runCli([
      'contract',
      'handoff-envelope',
      'Prepare',
      'a',
      'defense-ready',
      'slide',
      'deck',
      'for',
      'a',
      'thesis',
      'committee.',
      '--preferred-family',
      'ppt_deck',
      '--workspace-path',
      repoRoot,
    ], {
      env: {
        OPL_FRONTDESK_STATE_DIR: stateRoot,
      },
    });
    assert.equal(handoffResult.status, 0, formatFailure(handoffResult));
    const handoffPayload = parseJsonOutput(handoffResult);
    assert.equal(handoffPayload.handoff_bundle.target_domain_id, 'redcube');
    assert.equal(handoffPayload.handoff_bundle.domain_direct_entry.command, 'redcube-ai frontdesk');
    assert.equal(handoffPayload.handoff_bundle.domain_manifest_recommendation.status, 'command_failed');
    assert.equal(handoffPayload.handoff_bundle.domain_manifest_recommendation.recommended_command, null);

    const archiveResult = runCli([
      'workspace',
      'archive',
      '--project',
      'redcube',
      '--path',
      repoRoot,
    ], {
      env: {
        OPL_FRONTDESK_STATE_DIR: stateRoot,
      },
    });
    assert.equal(archiveResult.status, 0, formatFailure(archiveResult));
    const archivePayload = parseJsonOutput(archiveResult);
    assert.equal(archivePayload.workspace_catalog.binding.status, 'archived');
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain launch stays machine-readable through the built CLI entrypoint', async () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-built-domain-launch-state-'));
  const openFixture = createFakeOpenFixture();
  const shellFixture = createFakeShellCommandFixture();

  try {
    const bindResult = runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--entry-command',
      `${shellFixture.commandPath} --workspace ${repoRoot}`,
      '--entry-url',
      'http://127.0.0.1:3310/redcube',
    ], {
      env: {
        OPL_FRONTDESK_STATE_DIR: stateRoot,
      },
    });
    assert.equal(bindResult.status, 0, formatFailure(bindResult));

    const previewResult = runCli([
      'domain',
      'launch',
      '--project',
      'redcube',
      '--dry-run',
    ], {
      env: {
        OPL_FRONTDESK_STATE_DIR: stateRoot,
        OPL_OPEN_BIN: openFixture.openPath,
      },
    });
    assert.equal(previewResult.status, 0, formatFailure(previewResult));
    const previewPayload = parseJsonOutput(previewResult);
    assert.equal(previewPayload.domain_entry_launch.surface_id, 'opl_domain_direct_entry_launch');
    assert.equal(previewPayload.domain_entry_launch.selected_strategy, 'open_url');
    assert.equal(previewPayload.domain_entry_launch.launch_status, 'preview_only');

    const openResult = runCli([
      'domain',
      'launch',
      '--project',
      'redcube',
    ], {
      env: {
        OPL_FRONTDESK_STATE_DIR: stateRoot,
        OPL_OPEN_BIN: openFixture.openPath,
      },
    });
    assert.equal(openResult.status, 0, formatFailure(openResult));
    assert.equal(readFileSync(openFixture.capturePath, 'utf8').trim(), 'http://127.0.0.1:3310/redcube');

    const spawnResult = runCli([
      'domain',
      'launch',
      '--project',
      'redcube',
      '--strategy',
      'spawn_command',
    ], {
      env: {
        OPL_FRONTDESK_STATE_DIR: stateRoot,
        OPL_OPEN_BIN: openFixture.openPath,
      },
    });
    assert.equal(spawnResult.status, 0, formatFailure(spawnResult));
    const spawnPayload = parseJsonOutput(spawnResult);
    assert.equal(spawnPayload.domain_entry_launch.selected_strategy, 'spawn_command');
    assert.equal(spawnPayload.domain_entry_launch.launch_status, 'launched');

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (existsSync(shellFixture.capturePath)) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    assert.equal(existsSync(shellFixture.capturePath), true);
    assert.match(readFileSync(shellFixture.capturePath, 'utf8'), new RegExp(repoRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
    rmSync(openFixture.fixtureRoot, { recursive: true, force: true });
    rmSync(shellFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('session ledger stays machine-readable through the built CLI entrypoint', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "chat" ]; then
  cat <<'EOF'
╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮
BUILT SESSION LEDGER RESPONSE

session_id: built_sess_ledger
EOF
  exit 0
fi
if [ "$1" = "--resume" ] && [ "$2" = "built_sess_ledger" ]; then
  cat <<'EOF'
BUILT SESSION LEDGER RESUME RESPONSE
EOF
  exit 0
fi
if [ "$1" = "sessions" ] && [ "$2" = "list" ]; then
  cat <<'EOF'
Preview                                            Last Active   Src    ID
───────────────────────────────────────────────────────────────────────────────────────────────
Built ledger session                               1m ago        cli    built_sess_ledger
EOF
  exit 0
fi
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
  Active:       1
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const psFixture = createFakePsFixture(`27025 1 0.2 0.4 49616 00:46 /Users/test/.hermes/venv/bin/python -m hermes_cli.main gateway run --replace
27026 27025 4.2 1.1 125000 00:31 /Users/test/.hermes/venv/bin/python -m hermes_cli.main chat --resume built_sess_ledger`);
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-built-ledger-state-'));

  try {
    const askResult = runCli([
      'ask',
      'Prepare',
      'a',
      'defense-ready',
      'slide',
      'deck.',
      '--preferred-family',
      'ppt_deck',
      '--executor',
      'hermes',
      '--workspace-path',
      repoRoot,
    ], {
      env: {
        OPL_HERMES_BIN: hermesPath,
        OPL_FRONTDESK_STATE_DIR: stateRoot,
        PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
      },
    });
    assert.equal(askResult.status, 0, formatFailure(askResult));

    const resumeResult = runCli(['session', 'resume', 'built_sess_ledger'], {
      env: {
        OPL_HERMES_BIN: hermesPath,
        OPL_FRONTDESK_STATE_DIR: stateRoot,
        PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
      },
    });
    assert.equal(resumeResult.status, 0, formatFailure(resumeResult));

    const ledgerResult = runCli(['session', 'ledger', '--limit', '5'], {
      env: {
        OPL_HERMES_BIN: hermesPath,
        OPL_FRONTDESK_STATE_DIR: stateRoot,
        PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
      },
    });
    assert.equal(ledgerResult.status, 0, formatFailure(ledgerResult));
    const ledgerPayload = parseJsonOutput(ledgerResult);
    assert.equal(ledgerPayload.session_ledger.summary.entry_count, 2);
    assert.equal(ledgerPayload.session_ledger.summary.mode_counts.ask, 1);
    assert.equal(ledgerPayload.session_ledger.summary.mode_counts.resume, 1);
    assert.equal(ledgerPayload.session_ledger.summary.domain_counts.redcube, 2);
    assert.equal(ledgerPayload.session_ledger.summary.workspace_binding_count, 1);
    assert.equal(ledgerPayload.session_ledger.entries[0].session_id, 'built_sess_ledger');
    assert.equal(ledgerPayload.session_ledger.entries[0].mode, 'resume');
    assert.equal(ledgerPayload.session_ledger.entries[0].domain_id, 'redcube');
    assert.equal(ledgerPayload.session_ledger.entries[0].workspace_locator.absolute_path, repoRoot);
    assert.equal(ledgerPayload.session_ledger.entries[0].resource_sample.process_count, 2);
    assert.equal(ledgerPayload.session_ledger.entries[1].mode, 'ask');
    assert.equal(ledgerPayload.session_ledger.summary.session_aggregate_count, 1);
    assert.equal(ledgerPayload.session_ledger.sessions[0].session_id, 'built_sess_ledger');
    assert.equal(ledgerPayload.session_ledger.sessions[0].event_count, 2);
    assert.equal(ledgerPayload.session_ledger.sessions[0].resource_totals.latest_process_count, 2);
    assert.deepEqual(ledgerPayload.session_ledger.sessions[0].modes, ['resume', 'ask']);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('web starts a local front-desk pilot through the built CLI entrypoint', async () => {
  const { fixtureRoot: codexRuntimeFixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"built-web-ask-session"}
{"type":"turn.started"}
{"item":{"type":"command_execution","command":"opl handoff","status":"in_progress"}}
{"item":{"type":"agent_message","text":"BUILT WEB PILOT ASK RESPONSE"}}
{"type":"turn.completed"}
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);
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
Built web pilot session                            1m ago        cli    sess_built_web
EOF
  exit 0
fi
if [ "$1" = "--resume" ] && [ "$2" = "sess_built_web" ]; then
  cat <<'EOF'
BUILT WEB PILOT RESUME OUTPUT
EOF
  exit 0
fi
if [ "$1" = "logs" ] && [ "$2" = "gateway" ]; then
  cat <<'EOF'
[INFO] built gateway boot
[INFO] built hosted-friendly front desk ready
EOF
  exit 0
fi
if [ "$1" = "chat" ]; then
  cat <<'EOF'
╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮
BUILT WEB PILOT ASK RESPONSE

session_id: built-web-ask-session
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const psFixture = createFakePsFixture(`27025 1 0.1 0.2 49616 22:46 /Users/test/.hermes/venv/bin/python -m hermes_cli.main gateway run --replace`);
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-built-web-state-'));

  let child = null;

  try {
    const bindResult = runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--entry-url',
      'http://127.0.0.1:3310/redcube',
    ], {
      env: {
        OPL_FRONTDESK_STATE_DIR: stateRoot,
      },
    });
    assert.equal(bindResult.status, 0, formatFailure(bindResult));

    const startup = await startCliServer(
      ['web', '--host', '127.0.0.1', '--port', '0', '--path', repoRoot, '--sessions-limit', '1'],
      {
        env: {
          OPL_CODEX_BIN: codexPath,
          OPL_HERMES_BIN: hermesPath,
          OPL_FRONTDESK_STATE_DIR: stateRoot,
          PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
        },
      },
    );
    child = startup.child;

    assert.equal(startup.payload.version, 'g2');
    assert.equal(startup.payload.opl_api.surface_id, 'opl_product_api_bootstrap');
    assert.equal(startup.payload.opl_api.entry_surface, 'opl_product_api');
    assert.equal(startup.payload.opl_api.resources.system, '/api/opl/system');
    assert.equal(startup.payload.opl_api.resources.agents, '/api/opl/agents');
    assert.equal(startup.payload.opl_api.resources.sessions, '/api/opl/sessions');
    assert.equal(startup.payload.opl_api.resources.progress, '/api/opl/progress');
    assert.equal(startup.payload.opl_api.resources.artifacts, '/api/opl/artifacts');
    assert.equal(startup.payload.opl_api.actions.session_create, '/api/opl/sessions');
    assert.equal(startup.payload.opl_api.actions.session_resume, '/api/opl/sessions/resume');
    assert.equal(startup.payload.opl_api.actions.session_logs, '/api/opl/sessions/logs');
    assert.equal(startup.payload.opl_api.actions.launch_domain, '/api/opl/domain-launch');

    const baseUrl = String(startup.payload.opl_api.listening.base_url);
    const pageResponse = await fetch(baseUrl);
    assert.match(pageResponse.headers.get('content-type') ?? '', /application\/json/i);
    const rootPayload = await pageResponse.json();
    assert.equal(rootPayload.opl_api.surface_id, 'opl_product_api_root');
    assert.equal(rootPayload.opl_api.mode, 'api_only');
    assert.equal(rootPayload.opl_api.shell_integration_target, 'external_gui_overlay');
    assert.equal(rootPayload.opl_api.recommended_gui_overlay, 'aionui_shell');
    assert.equal(rootPayload.opl_api.resources.system, '/api/opl/system');
    assert.equal(rootPayload.opl_api.resources.agents, '/api/opl/agents');
    assert.equal(rootPayload.opl_api.resources.sessions, '/api/opl/sessions');
    assert.equal(rootPayload.opl_api.resources.progress, '/api/opl/progress');
    assert.equal(rootPayload.opl_api.resources.artifacts, '/api/opl/artifacts');
    assert.match(rootPayload.opl_api.summary, /product API resources/i);
    assert.equal(rootPayload.opl_api.notes.includes('OPL main repo now stays headless and contract-first.'), true);

    const healthResponse = await fetch(`${baseUrl}/api/health`);
    const healthPayload = await healthResponse.json();
    assert.equal(healthPayload.health.status, 'ok');

    const dashboardResponse = await fetch(`${baseUrl}/api/status/dashboard`);
    const dashboardPayload = await dashboardResponse.json();
    assert.equal(dashboardPayload.dashboard.projects.length, 4);
    assert.equal(dashboardPayload.dashboard.runtime_status.recent_sessions.sessions.length, 1);

    const launchResponse = await fetch(`${baseUrl}/api/opl/domain-launch`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        project_id: 'redcube',
        dry_run: true,
      }),
    });
    assert.equal(launchResponse.status, 200);
    const launchPayload = await launchResponse.json();
    assert.equal(launchPayload.domain_entry_launch.project_id, 'redcube');
    assert.equal(launchPayload.domain_entry_launch.selected_strategy, 'open_url');
    assert.equal(launchPayload.domain_entry_launch.launch_status, 'preview_only');

    const hostedPackageOutput = mkdtempSync(path.join(os.tmpdir(), 'opl-built-web-hosted-package-'));
    try {
      const hostedPackageResponse = await fetch(`${baseUrl}/api/opl/web/package`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          output_dir: hostedPackageOutput,
          public_origin: 'https://opl.example.com',
        }),
      });
      const hostedPackagePayload = await hostedPackageResponse.json();
      assert.equal(hostedPackagePayload.web_package.surface_id, 'opl_web_package');
      assert.equal(hostedPackagePayload.web_package.public_origin, 'https://opl.example.com');
      assert.equal(hostedPackagePayload.web_package.entry_url, 'https://opl.example.com/pilot/opl/');
      assert.equal(existsSync(hostedPackagePayload.web_package.assets.bundle_json), true);
      assert.equal(existsSync(hostedPackagePayload.web_package.assets.launch_script), true);
    } finally {
      rmSync(hostedPackageOutput, { recursive: true, force: true });
    }

    const resumeResponse = await fetch(`${baseUrl}/api/opl/sessions/resume`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        session_id: 'sess_built_web',
      }),
    });
    const resumePayload = await resumeResponse.json();
    assert.match(resumePayload.session_resume.resume.output, /BUILT WEB PILOT RESUME OUTPUT/);

    const logsResponse = await fetch(`${baseUrl}/api/opl/sessions/logs?log_name=gateway&lines=20`);
    const logsPayload = await logsResponse.json();
    assert.match(logsPayload.session_logs.raw_output, /built hosted-friendly front desk ready/);

    const askResponse = await fetch(`${baseUrl}/api/opl/sessions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        goal: 'Prepare a defense-ready slide deck for a thesis committee.',
        preferred_family: 'ppt_deck',
      }),
    });
    const askPayload = await askResponse.json();
    assert.equal(askPayload.session_create.request_mode, 'submitted');
    assert.equal(askPayload.session_create.payload.product_entry.entry_surface, 'opl_session_api');
    assert.equal(askPayload.session_create.payload.product_entry.mode, 'ask');
    assert.equal(askPayload.session_create.payload.product_entry.dry_run, false);
    assert.equal(askPayload.session_create.payload.product_entry.execution_mode, 'async_accept');
    assert.equal(askPayload.session_create.payload.product_entry.executor_backend, 'codex');
    assert.match(askPayload.session_create.payload.product_entry.task.task_id, /^task_/);
    assert.equal(askPayload.session_create.payload.product_entry.task.status, 'accepted');
    assert.equal(askPayload.session_create.payload.product_entry.task.executor_backend, 'codex');
    assert.match(askPayload.session_create.payload.product_entry.task.summary, /Codex|受理|执行/);

    const taskStatusResponse = await fetch(
      `${baseUrl}/api/opl/progress?task_id=${encodeURIComponent(String(askPayload.session_create.payload.product_entry.task.task_id))}&workspace_path=${encodeURIComponent(repoRoot)}`,
    );
    const taskStatusPayload = await taskStatusResponse.json();
    assert.equal(taskStatusPayload.progress.surface_id, 'opl_progress');
    assert.equal(taskStatusPayload.progress.task.task_id, askPayload.session_create.payload.product_entry.task.task_id);
    assert.equal(taskStatusPayload.progress.task.executor_backend, 'codex');
    assert.match(taskStatusPayload.progress.task.status, /accepted|running|succeeded|failed/);
    assert.equal(typeof taskStatusPayload.progress.task.recent_output, 'string');

    const retiredAskResponse = await fetch(`${baseUrl}/api/ask`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        goal: 'retired route probe',
      }),
    });
    assert.equal(retiredAskResponse.status, 404);
  } finally {
    if (child) {
      await stopCliServer(child);
    }
    rmSync(codexRuntimeFixtureRoot, { recursive: true, force: true });
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('bare opl command seeds a product-entry session through the built CLI entrypoint', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "chat" ]; then
  cat <<'EOF'
╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮
OPL FRONT DESK READY

session_id: opl-session-seed
EOF
  exit 0
fi
if [ "$1" = "--resume" ] && [ "$2" = "opl-session-seed" ]; then
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
    assert.equal(payload.product_entry.mode, 'session_seed');
    assert.doesNotMatch(payload.product_entry.mode, /frontdesk/i);
    assert.equal(payload.product_entry.interactive, false);
    assert.doesNotMatch(payload.product_entry.handoff_prompt_preview, /front[- ]?desk/i);
    assert.equal(payload.product_entry.seed.session_id, 'opl-session-seed');
    assert.equal(payload.product_entry.seed.command_preview.includes('opl-frontdesk'), false);
    assert.equal(payload.product_entry.seed.command_preview.includes('opl-session-seed'), true);
    assert.equal(payload.product_entry.resume.output, 'OPL FRONT DESK RESUMED');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('natural-language fallback stays machine-readable through the built CLI entrypoint', () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"opl-quick-ask-session"}
{"type":"turn.started"}
{"item":{"type":"agent_message","text":"AUTO ASK READY"}}
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);

  try {
    const result = runCli(['Plan', 'a', 'medical', 'grant', 'proposal', 'revision', 'loop.'], {
      env: { OPL_CODEX_BIN: codexPath },
    });
    assert.equal(result.status, 0, formatFailure(result));

    const payload = parseJsonOutput(result);
    assert.equal(payload.product_entry.mode, 'ask');
    assert.equal(payload.product_entry.input.goal, 'Plan a medical grant proposal revision loop.');
    assert.equal(payload.product_entry.routing.status, 'routed');
    assert.equal(payload.product_entry.routing.workstream_id, 'grant_ops');
    assert.equal(payload.product_entry.routing.domain_id, 'medautogrant');
    assert.equal(payload.product_entry.executor_backend, 'codex');
    assert.equal(payload.product_entry.codex.session_id, 'opl-quick-ask-session');
    assert.equal(payload.product_entry.codex.response, 'AUTO ASK READY');
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
  assert.equal(payload.product_entry.input.goal, 'Prepare a defense-ready slide deck for a thesis committee.');
  assert.equal(payload.product_entry.input.intent, 'create');
  assert.equal(payload.product_entry.input.target, 'deliverable');
  assert.equal(payload.product_entry.routing.status, 'routed');
  assert.equal(payload.product_entry.routing.domain_id, 'redcube');
  assert.equal(payload.product_entry.routing.workstream_id, 'presentation_ops');
  assert.equal(payload.product_entry.executor_backend, 'codex');
  assert.match(payload.product_entry.handoff_prompt_preview, /One Person Lab \(OPL\) Product Entry/);
  assert.match(payload.product_entry.handoff_prompt_preview, /presentation_ops/);
  assert.equal(payload.product_entry.codex.command_preview[0], 'codex');
  assert.ok(payload.product_entry.codex.command_preview.includes('--json'));
});

test('session list stays machine-readable through the built CLI entrypoint', () => {
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
    const result = runCli(['session', 'list', '--limit', '2'], {
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

test('runtime repair-gateway stays machine-readable through the built CLI entrypoint', () => {
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
    const result = runCli(['runtime', 'repair-gateway'], {
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

test('contract validate surfaces shape-invalid contracts with a stable error envelope', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((_fixtureRoot, contractsDir) => {
    const workstreamsPath = path.join(contractsDir, 'workstreams.json');
    const workstreams = JSON.parse(readFileSync(workstreamsPath, 'utf8'));
    delete workstreams.workstreams[0].label;
    writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });

  try {
    const result = runCli(['contract', 'validate'], { env: { OPL_CONTRACTS_DIR: fixtureContractsRoot } });
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
  assert.ok(payload.error.details.commands.includes('contract validate'));
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
  assert.equal(payload.help.usage, 'opl [command ...|request...] [args]');
  assert.ok(
    payload.help.commands.some((entry) => entry.command === 'contract validate'),
  );
  assert.ok(
    payload.help.commands.some(
      (entry) => entry.command === 'contract domain'
        && entry.examples.includes('opl contract domain redcube'),
    ),
  );
});

test('command --help stays machine-readable for built CLI entrypoints', () => {
  const result = runCli(['contract', 'domain', '--help']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assertNoContractsProvenance(payload);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.help.command, 'contract domain');
  assert.equal(payload.help.usage, 'opl contract domain <domain_id>');
  assert.ok(payload.help.examples.includes('opl contract domain redcube'));
});

test('command help literal uses the dedicated usage exit code for built CLI entrypoints', () => {
  const result = runCli(['contract', 'domain', 'help']);
  assert.equal(result.status, 2, formatFailure(result));

  const payload = parseJsonOutput(result);
  assertNoContractsProvenance(payload);
  assert.equal(payload.error.code, 'cli_usage_error');
  assert.equal(payload.error.exit_code, 2);
  assert.equal(payload.error.details.help_usage, 'opl contract domain --help');
});

test('global --contracts-dir override stays explicit and wins over OPL_CONTRACTS_DIR for built CLI entrypoints', () => {
  const envFixture = createContractsFixtureRoot((_fixtureRoot, contractsDir) => {
    const workstreamsPath = path.join(contractsDir, 'workstreams.json');
    const workstreams = JSON.parse(readFileSync(workstreamsPath, 'utf8'));
    const researchOps = workstreams.workstreams.find((entry) => entry.workstream_id === 'research_ops');
    researchOps.label = 'Research Foundry From Env';
    writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });
  const flagFixture = createContractsFixtureRoot((_fixtureRoot, contractsDir) => {
    const workstreamsPath = path.join(contractsDir, 'workstreams.json');
    const workstreams = JSON.parse(readFileSync(workstreamsPath, 'utf8'));
    const researchOps = workstreams.workstreams.find((entry) => entry.workstream_id === 'research_ops');
    researchOps.label = 'Research Foundry From Flag';
    writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });

  try {
    const result = runCli(
      ['--contracts-dir', flagFixture.fixtureContractsRoot, 'contract', 'workstream', 'research_ops'],
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
    assert.equal(payload.workstream.label, 'Research Foundry From Flag');
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
      ['--contracts-dir', fixtureContractsRoot, 'contract', 'validate'],
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
  const result = runCli(['contract', 'domain']);
  assert.equal(result.status, 2, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.error.code, 'cli_usage_error');
  assert.equal(payload.error.exit_code, 2);
});
