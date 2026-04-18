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
  assert.equal(payload.projects.length, 3);
  assert.equal(payload.projects[0].project_id, 'opl');
  assert.equal(payload.projects[1].project_id, 'medautoscience');
  assert.equal(payload.projects[2].project_id, 'redcube');
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
    assert.equal(dashboardPayload.dashboard.projects.length, 3);
    assert.equal(dashboardPayload.dashboard.front_desk.local_web_frontdesk_status, 'pilot_landed');
    assert.equal(dashboardPayload.dashboard.front_desk.hosted_web_status, 'librechat_pilot_landed');
    assert.equal(dashboardPayload.dashboard.front_desk.librechat_pilot_package_status, 'landed');
    assert.equal(dashboardPayload.dashboard.front_desk.recommended_entry_surfaces_count, 0);
    assert.equal(dashboardPayload.dashboard.runtime_status.recent_sessions.sessions.length, 1);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('help exposes the public front-desk entrypoints while hiding librechat compatibility commands through the built CLI entrypoint', () => {
  const result = runCli(['help']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.ok(payload.help.commands.some((entry) => entry.command === 'web'));
  assert.ok(payload.help.commands.some((entry) => entry.command === 'frontdesk manifest'));
  assert.ok(payload.help.commands.some((entry) => entry.command === 'frontdesk entry-guide'));
  assert.ok(payload.help.commands.some((entry) => entry.command === 'frontdesk domain-wiring'));
  assert.ok(payload.help.commands.some((entry) => entry.command === 'frontdesk readiness'));
  assert.ok(payload.help.commands.some((entry) => entry.command === 'frontdesk hosted-bundle'));
  assert.ok(payload.help.commands.some((entry) => entry.command === 'frontdesk hosted-package'));
  assert.equal(payload.help.commands.some((entry) => entry.command.startsWith('frontdesk-librechat')), false);
  assert.equal(payload.help.commands.some((entry) => entry.command === 'frontdesk-librechat-package'), false);
  assert.ok(payload.help.commands.some((entry) => entry.command === 'frontdesk service install'));
  assert.ok(payload.help.commands.some((entry) => entry.command === 'frontdesk service status'));
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

test('frontdesk manifest stays machine-readable through the built CLI entrypoint', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-built-frontdesk-manifest-state-'));

  try {
    const result = runCli(['frontdesk', 'manifest'], {
      env: {
        OPL_FRONTDESK_STATE_DIR: stateRoot,
      },
    });
    assert.equal(result.status, 0, formatFailure(result));

    const payload = parseJsonOutput(result);
    assert.equal(payload.frontdesk_manifest.surface_id, 'opl_hosted_friendly_frontdesk_manifest');
    assert.equal(payload.frontdesk_manifest.shell_integration_target, 'desktop_first');
    assert.equal(payload.frontdesk_manifest.endpoints.domain_manifests, '/api/domain-manifests');
    assert.equal(payload.frontdesk_manifest.endpoints.health, '/api/health');
    assert.equal(payload.frontdesk_manifest.endpoints.resume, '/api/resume');
    assert.equal(payload.frontdesk_manifest.domain_wiring_surface.surface_id, 'opl_frontdesk_domain_wiring');
    assert.equal(payload.frontdesk_manifest.domain_wiring_surface.endpoint, '/api/frontdesk-domain-wiring');
    assert.equal(payload.frontdesk_manifest.domain_wiring_surface.summary.total_projects_count, 2);
    assert.equal(payload.frontdesk_manifest.domain_wiring_surface.summary.recommended_entry_surfaces_count, 0);
    assert.equal(payload.frontdesk_manifest.frontdesk_entry_guide_surface.surface_id, 'opl_frontdesk_entry_guide');
    assert.equal(payload.frontdesk_manifest.frontdesk_entry_guide_surface.endpoint, '/api/frontdesk-entry-guide');
    assert.equal(payload.frontdesk_manifest.frontdesk_readiness_surface.surface_id, 'opl_frontdesk_readiness');
    assert.equal(payload.frontdesk_manifest.frontdesk_readiness_surface.endpoint, '/api/frontdesk-readiness');
    assert.equal(payload.frontdesk_manifest.shell_bootstrap.primary_surface.surface_id, 'opl_frontdesk_entry_guide');
    assert.equal(payload.frontdesk_manifest.shell_bootstrap.primary_surface.endpoint, '/api/frontdesk-entry-guide');
    assert.deepEqual(
      payload.frontdesk_manifest.shell_bootstrap.follow_on_surfaces.map((entry) => entry.surface_id),
      ['opl_frontdesk_readiness', 'opl_frontdesk_domain_wiring', 'opl_frontdesk_dashboard'],
    );
    assert.equal(payload.frontdesk_manifest.shell_bootstrap.operator_debug_surface.surface_id, 'opl_frontdesk_dashboard');
    assert.equal(payload.frontdesk_manifest.shell_bootstrap.operator_debug_surface.endpoint, '/api/dashboard');
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('frontdesk entry-guide stays machine-readable through the built CLI entrypoint', () => {
  const result = runCli(['frontdesk', 'entry-guide']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.frontdesk_entry_guide.surface_id, 'opl_frontdesk_entry_guide');
  assert.equal(payload.frontdesk_entry_guide.workspace_taxonomy.family_workspace_kind, 'opl_family_workspace');
  assert.equal(payload.frontdesk_entry_guide.summary.total_projects_count, 2);
  assert.equal(payload.frontdesk_entry_guide.endpoints.frontdesk_entry_guide, '/api/frontdesk-entry-guide');
});

test('frontdesk domain-wiring stays machine-readable through the built CLI entrypoint', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-built-frontdesk-domain-wiring-state-'));

  try {
    const result = runCli(['frontdesk', 'domain-wiring'], {
      env: {
        OPL_FRONTDESK_STATE_DIR: stateRoot,
      },
    });
    assert.equal(result.status, 0, formatFailure(result));

    const payload = parseJsonOutput(result);
    assert.equal(payload.frontdesk_domain_wiring.surface_id, 'opl_frontdesk_domain_wiring');
    assert.equal(payload.frontdesk_domain_wiring.entry_surface, 'opl_local_web_frontdesk_pilot');
    assert.equal(payload.frontdesk_domain_wiring.runtime_substrate, 'external_hermes_kernel');
    assert.equal(payload.frontdesk_domain_wiring.summary.total_projects_count, 2);
    assert.equal(payload.frontdesk_domain_wiring.domain_entry_parity.summary.blocked_projects_count, 2);
    assert.equal(payload.frontdesk_domain_wiring.domain_binding_parity.surface_kind, 'opl_domain_binding_parity');
    assert.equal(payload.frontdesk_domain_wiring.domain_binding_parity.summary.total_projects_count, 2);
    assert.equal(payload.frontdesk_domain_wiring.domain_binding_parity.summary.active_projects_count, 0);
    assert.equal(payload.frontdesk_domain_wiring.endpoints.workspace_catalog, '/api/workspace-catalog');
    assert.equal(payload.frontdesk_domain_wiring.endpoints.workspace_bind, '/api/workspace-bind');
    assert.equal(payload.frontdesk_domain_wiring.summary.recommended_entry_surfaces_count, 0);
    assert.deepEqual(payload.frontdesk_domain_wiring.recommended_entry_surfaces, []);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('frontdesk readiness stays machine-readable through the built CLI entrypoint', () => {
  const homeRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-frontdesk-readiness-home-'));
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
Built CLI readiness session                        1m ago        cli    sess_ready_built
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const psFixture = createFakePsFixture(`27025 1 0.1 0.2 49616 22:46 /Users/test/.hermes/venv/bin/python -m hermes_cli.main gateway run --replace`);

  try {
    const result = runCli(['frontdesk', 'readiness', '--path', repoRoot, '--sessions-limit', '1'], {
      env: {
        HOME: homeRoot,
        OPL_HERMES_BIN: hermesPath,
        PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
      },
    });
    assert.equal(result.status, 0, formatFailure(result));

    const payload = parseJsonOutput(result);
    assert.equal(payload.frontdesk_readiness.surface_id, 'opl_frontdesk_readiness');
    assert.equal(payload.frontdesk_readiness.local_service.health.status, 'not_installed');
    assert.equal(payload.frontdesk_readiness.summary.total_projects_count, 2);
    assert.equal(payload.frontdesk_readiness.summary.usable_now_projects_count, 0);
    assert.equal(payload.frontdesk_readiness.endpoints.frontdesk_readiness, '/api/frontdesk-readiness');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
    rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('frontdesk service install --help stays machine-readable through the built CLI entrypoint', () => {
  const result = runCli(['frontdesk', 'service', 'install', '--help']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.help.command, 'frontdesk service install');
  assert.match(payload.help.usage, /opl frontdesk service install/);
  assert.ok(payload.help.examples.includes('opl frontdesk service install --port 8787'));
});

test('frontdesk-service lifecycle stays machine-readable through the built CLI entrypoint', () => {
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
      'frontdesk',
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
    assert.equal(installPayload.frontdesk_service.action, 'install');
    assert.equal(installPayload.frontdesk_service.installed, true);
    assert.equal(installPayload.frontdesk_service.loaded, true);
    assert.equal(installPayload.frontdesk_service.base_url, `http://127.0.0.1:${configuredPort}`);
    assert.equal(existsSync(installPayload.frontdesk_service.paths.launch_agent_plist), true);

    const plistText = readFileSync(installPayload.frontdesk_service.paths.launch_agent_plist, 'utf8');
    assert.match(plistText, /<string>web<\/string>/);
    assert.match(plistText, new RegExp(String(configuredPort)));

    const statusResult = runCli(['frontdesk', 'service', 'status'], {
      env,
    });
    assert.equal(statusResult.status, 0, formatFailure(statusResult));
    const statusPayload = parseJsonOutput(statusResult);
    assert.equal(statusPayload.frontdesk_service.loaded, true);
    assert.equal(statusPayload.frontdesk_service.health.status, 'unreachable');
    assert.equal(
      statusPayload.frontdesk_service.health.url,
      `http://127.0.0.1:${configuredPort}/api/health`,
    );

    const openResult = runCli(['frontdesk', 'service', 'open'], {
      env,
    });
    assert.equal(openResult.status, 0, formatFailure(openResult));
    const openPayload = parseJsonOutput(openResult);
    assert.equal(openPayload.frontdesk_service.action, 'open');
    assert.match(readFileSync(openFixture.capturePath, 'utf8'), new RegExp(String(configuredPort)));

    const stopResult = runCli(['frontdesk', 'service', 'stop'], {
      env,
    });
    assert.equal(stopResult.status, 0, formatFailure(stopResult));
    const stopPayload = parseJsonOutput(stopResult);
    assert.equal(stopPayload.frontdesk_service.action, 'stop');
    assert.equal(stopPayload.frontdesk_service.loaded, false);

    const startResult = runCli(['frontdesk', 'service', 'start'], {
      env,
    });
    assert.equal(startResult.status, 0, formatFailure(startResult));
    const startPayload = parseJsonOutput(startResult);
    assert.equal(startPayload.frontdesk_service.action, 'start');
    assert.equal(startPayload.frontdesk_service.loaded, true);

    const uninstallResult = runCli(['frontdesk', 'service', 'uninstall'], {
      env,
    });
    assert.equal(uninstallResult.status, 0, formatFailure(uninstallResult));
    const uninstallPayload = parseJsonOutput(uninstallResult);
    assert.equal(uninstallPayload.frontdesk_service.action, 'uninstall');
    assert.equal(uninstallPayload.frontdesk_service.installed, false);
    assert.equal(existsSync(installPayload.frontdesk_service.paths.launch_agent_plist), false);
  } finally {
    rmSync(homeRoot, { recursive: true, force: true });
    rmSync(launchctlFixture.fixtureRoot, { recursive: true, force: true });
    rmSync(openFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('frontdesk hosted-bundle stays machine-readable through the built CLI entrypoint', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-built-hosted-bundle-state-'));

  try {
    const result = runCli([
      'frontdesk',
      'hosted-bundle',
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
    assert.equal(payload.hosted_pilot_bundle.surface_id, 'opl_hosted_frontdesk_pilot_bundle');
    assert.equal(payload.hosted_pilot_bundle.base_path, '/pilot/opl');
    assert.equal(payload.hosted_pilot_bundle.entry_url, 'http://127.0.0.1:8787/pilot/opl/');
    assert.equal(payload.hosted_pilot_bundle.api_base_url, 'http://127.0.0.1:8787/pilot/opl/api');
    assert.equal(payload.hosted_pilot_bundle.endpoints.dashboard, '/pilot/opl/api/dashboard');
    assert.equal(payload.hosted_pilot_bundle.defaults.workspace_path, repoRoot);
    assert.equal(payload.hosted_pilot_bundle.defaults.sessions_limit, 9);
    assert.equal(payload.hosted_pilot_bundle.domain_wiring_surface.surface_id, 'opl_frontdesk_domain_wiring');
    assert.equal(payload.hosted_pilot_bundle.domain_wiring_surface.endpoint, '/pilot/opl/api/frontdesk-domain-wiring');
    assert.equal(payload.hosted_pilot_bundle.domain_wiring_surface.summary.total_projects_count, 2);
    assert.equal(payload.hosted_pilot_bundle.domain_wiring_surface.summary.recommended_entry_surfaces_count, 0);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('frontdesk hosted-package stays machine-readable through the built CLI entrypoint', () => {
  const outputDir = mkdtempSync(path.join(os.tmpdir(), 'opl-built-hosted-package-'));

  try {
    const result = runCli([
      'frontdesk',
      'hosted-package',
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
    assert.equal(payload.hosted_pilot_package.surface_id, 'opl_hosted_frontdesk_pilot_package');
    assert.equal(payload.hosted_pilot_package.shell_integration_target, 'librechat_first');
    assert.equal(payload.hosted_pilot_package.package_status, 'landed');
    assert.equal(payload.hosted_pilot_package.actual_hosted_runtime_status, 'not_landed');
    assert.equal(payload.hosted_pilot_package.public_origin, 'https://opl.example.com');
    assert.equal(payload.hosted_pilot_package.entry_url, 'https://opl.example.com/pilot/opl/');
    assert.equal(payload.hosted_pilot_package.api_base_url, 'https://opl.example.com/pilot/opl/api');
    assert.equal(existsSync(payload.hosted_pilot_package.assets.bundle_json), true);
    assert.equal(existsSync(payload.hosted_pilot_package.assets.readme), true);
    assert.equal(existsSync(payload.hosted_pilot_package.assets.run_script), true);
    assert.equal(existsSync(payload.hosted_pilot_package.assets.systemd_service), true);
    assert.equal(existsSync(payload.hosted_pilot_package.assets.caddyfile), true);
    assert.equal(existsSync(payload.hosted_pilot_package.assets.env_example), true);
    assert.equal(existsSync(path.join(payload.hosted_pilot_package.assets.app_dist, 'cli.js')), true);
    assert.equal(
      existsSync(path.join(payload.hosted_pilot_package.assets.app_contracts, 'opl-gateway', 'workstreams.json')),
      true,
    );
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test('frontdesk-librechat-package stays machine-readable through the built CLI entrypoint', () => {
  const outputDir = mkdtempSync(path.join(os.tmpdir(), 'opl-built-librechat-package-'));

  try {
    const result = runCli([
      'frontdesk-librechat-package',
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
    assert.equal(payload.librechat_pilot_package.surface_id, 'opl_librechat_hosted_shell_pilot_package');
    assert.equal(payload.librechat_pilot_package.shell_integration_target, 'librechat_first');
    assert.equal(payload.librechat_pilot_package.package_status, 'landed');
    assert.equal(payload.librechat_pilot_package.hosted_shell_status, 'landed');
    assert.equal(payload.librechat_pilot_package.actual_managed_runtime_status, 'not_landed');
    assert.equal(payload.librechat_pilot_package.frontdesk_entry_url, 'https://opl.example.com/pilot/opl/');
    assert.equal(existsSync(payload.librechat_pilot_package.assets.readme), true);
    assert.equal(existsSync(payload.librechat_pilot_package.assets.stack_env_example), true);
    assert.equal(existsSync(payload.librechat_pilot_package.assets.compose_file), true);
    assert.equal(existsSync(payload.librechat_pilot_package.assets.caddyfile), true);
    assert.equal(existsSync(payload.librechat_pilot_package.assets.frontdesk_bundle_json), true);
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
    assert.equal(catalogPayload.workspace_catalog.projects.length, 3);
    assert.equal(catalogPayload.workspace_catalog.projects[2].active_binding.workspace_path, repoRoot);
    assert.equal(catalogPayload.workspace_catalog.projects[2].bindings_count.total, 1);
    assert.equal(catalogPayload.workspace_catalog.projects[2].bindings_count.direct_entry_ready, 1);
    assert.equal(catalogPayload.workspace_catalog.projects[2].bindings_count.manifest_ready, 1);
    assert.deepEqual(catalogPayload.workspace_catalog.projects[2].available_actions, ['bind', 'activate', 'archive', 'launch']);
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
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-built-launch-domain-state-'));
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
    assert.equal(startup.payload.web_frontdesk.entry_surface, 'opl_local_web_frontdesk_pilot');
    assert.equal(startup.payload.web_frontdesk.hosted_status, 'librechat_pilot_landed');
    assert.equal(startup.payload.web_frontdesk.api.frontdesk_entry_guide, '/api/frontdesk-entry-guide');
    assert.equal(startup.payload.web_frontdesk.api.frontdesk_readiness, '/api/frontdesk-readiness');
    assert.equal(startup.payload.web_frontdesk.api.frontdesk_domain_wiring, '/api/frontdesk-domain-wiring');
    assert.equal(startup.payload.web_frontdesk.api.librechat_package, '/api/librechat-package');
    assert.equal(startup.payload.web_frontdesk.api.launch_domain, '/api/launch-domain');
    assert.equal(startup.payload.web_frontdesk.shell_bootstrap.primary_surface.surface_id, 'opl_frontdesk_entry_guide');
    assert.equal(startup.payload.web_frontdesk.shell_bootstrap.primary_surface.endpoint, '/api/frontdesk-entry-guide');
    assert.deepEqual(
      startup.payload.web_frontdesk.shell_bootstrap.follow_on_surfaces.map((entry) => entry.surface_id),
      ['opl_frontdesk_readiness', 'opl_frontdesk_domain_wiring', 'opl_frontdesk_dashboard'],
    );
    assert.equal(startup.payload.web_frontdesk.shell_bootstrap.operator_debug_surface.endpoint, '/api/dashboard');

    const baseUrl = String(startup.payload.web_frontdesk.listening.base_url);
    const pageResponse = await fetch(baseUrl);
    const pageHtml = await pageResponse.text();
    assert.match(pageHtml, /OPL Workspace Home/);
    assert.match(pageHtml, /Open OPL Agent/);
    assert.match(pageHtml, /Workspace Home/);
    assert.match(pageHtml, /Current Task/);
    assert.match(pageHtml, /Workspace Inbox/);
    assert.match(pageHtml, /Files & Deliverables/);
    assert.match(pageHtml, /Progress Feed/);
    assert.match(pageHtml, /one-person-lab/);
    assert.match(pageHtml, /href="\/login"/);
    assert.doesNotMatch(pageHtml, /Workspace Hub/);
    assert.match(pageHtml, /id="opl-bootstrap"/);
    assert.match(pageHtml, /\/api\/frontdesk-entry-guide/);

    const manifestResponse = await fetch(`${baseUrl}/api/frontdesk-manifest`);
    const manifestPayload = await manifestResponse.json();
    assert.equal(manifestPayload.frontdesk_manifest.endpoints.logs, '/api/logs');
    assert.equal(manifestPayload.frontdesk_manifest.frontdesk_entry_guide_surface.surface_id, 'opl_frontdesk_entry_guide');
    assert.equal(manifestPayload.frontdesk_manifest.shell_bootstrap.primary_surface.surface_id, 'opl_frontdesk_entry_guide');
    assert.equal(manifestPayload.frontdesk_manifest.shell_bootstrap.operator_debug_surface.endpoint, '/api/dashboard');

    const entryGuideResponse = await fetch(`${baseUrl}/api/frontdesk-entry-guide`);
    const entryGuidePayload = await entryGuideResponse.json();
    assert.equal(entryGuidePayload.frontdesk_entry_guide.surface_id, 'opl_frontdesk_entry_guide');
    assert.equal(entryGuidePayload.frontdesk_entry_guide.workspace_taxonomy.family_workspace_kind, 'opl_family_workspace');

    const wiringResponse = await fetch(`${baseUrl}/api/frontdesk-domain-wiring`);
    const wiringPayload = await wiringResponse.json();
    assert.equal(wiringPayload.frontdesk_domain_wiring.surface_id, 'opl_frontdesk_domain_wiring');
    assert.equal(wiringPayload.frontdesk_domain_wiring.summary.total_projects_count, 2);
    assert.equal(wiringPayload.frontdesk_domain_wiring.domain_binding_parity.summary.total_projects_count, 2);
    assert.equal(wiringPayload.frontdesk_domain_wiring.domain_binding_parity.summary.active_projects_count, 1);
    assert.equal(wiringPayload.frontdesk_domain_wiring.domain_binding_parity.summary.direct_entry_ready_projects_count, 1);
    assert.equal(wiringPayload.frontdesk_domain_wiring.domain_binding_parity.summary.manifest_ready_projects_count, 1);
    assert.equal(wiringPayload.frontdesk_domain_wiring.summary.recommended_entry_surfaces_count, 0);

    const readinessResponse = await fetch(`${baseUrl}/api/frontdesk-readiness`);
    const readinessPayload = await readinessResponse.json();
    assert.equal(readinessPayload.frontdesk_readiness.surface_id, 'opl_frontdesk_readiness');
    assert.equal(readinessPayload.frontdesk_readiness.summary.total_projects_count, 2);
    assert.equal(readinessPayload.frontdesk_readiness.summary.usable_now_projects_count, 0);
    assert.match(
      readinessPayload.frontdesk_readiness.local_service.health.status,
      /^(ok|not_installed|unreachable)$/,
    );

    const healthResponse = await fetch(`${baseUrl}/api/health`);
    const healthPayload = await healthResponse.json();
    assert.equal(healthPayload.health.status, 'ok');

    const dashboardResponse = await fetch(`${baseUrl}/api/dashboard`);
    const dashboardPayload = await dashboardResponse.json();
    assert.equal(dashboardPayload.dashboard.projects.length, 3);
    assert.equal(dashboardPayload.dashboard.runtime_status.recent_sessions.sessions.length, 1);

    const launchResponse = await fetch(`${baseUrl}/api/launch-domain`, {
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
      const hostedPackageResponse = await fetch(`${baseUrl}/api/hosted-package`, {
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
      assert.equal(hostedPackagePayload.hosted_pilot_package.surface_id, 'opl_hosted_frontdesk_pilot_package');
      assert.equal(hostedPackagePayload.hosted_pilot_package.public_origin, 'https://opl.example.com');
      assert.equal(hostedPackagePayload.hosted_pilot_package.entry_url, 'https://opl.example.com/pilot/opl/');
      assert.equal(existsSync(hostedPackagePayload.hosted_pilot_package.assets.bundle_json), true);
      assert.equal(existsSync(hostedPackagePayload.hosted_pilot_package.assets.run_script), true);
    } finally {
      rmSync(hostedPackageOutput, { recursive: true, force: true });
    }

    const librechatPackageOutput = mkdtempSync(path.join(os.tmpdir(), 'opl-built-web-librechat-package-'));
    try {
      const librechatPackageResponse = await fetch(`${baseUrl}/api/librechat-package`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          output_dir: librechatPackageOutput,
          public_origin: 'https://opl.example.com',
        }),
      });
      const librechatPackagePayload = await librechatPackageResponse.json();
      assert.equal(
        librechatPackagePayload.librechat_pilot_package.surface_id,
        'opl_librechat_hosted_shell_pilot_package',
      );
      assert.equal(librechatPackagePayload.librechat_pilot_package.hosted_shell_status, 'landed');
      assert.equal(existsSync(librechatPackagePayload.librechat_pilot_package.assets.compose_file), true);
      assert.equal(existsSync(librechatPackagePayload.librechat_pilot_package.assets.caddyfile), true);
    } finally {
      rmSync(librechatPackageOutput, { recursive: true, force: true });
    }

    const resumeResponse = await fetch(`${baseUrl}/api/resume`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        session_id: 'sess_built_web',
      }),
    });
    const resumePayload = await resumeResponse.json();
    assert.match(resumePayload.product_entry.resume.output, /BUILT WEB PILOT RESUME OUTPUT/);

    const logsResponse = await fetch(`${baseUrl}/api/logs?log_name=gateway&lines=20`);
    const logsPayload = await logsResponse.json();
    assert.match(logsPayload.product_entry.raw_output, /built hosted-friendly front desk ready/);

    const askResponse = await fetch(`${baseUrl}/api/ask`, {
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
    assert.equal(askPayload.product_entry.mode, 'ask');
    assert.equal(askPayload.product_entry.dry_run, false);
    assert.equal(askPayload.product_entry.execution_mode, 'async_accept');
    assert.equal(askPayload.product_entry.executor_backend, 'codex');
    assert.match(askPayload.product_entry.task.task_id, /^task_/);
    assert.equal(askPayload.product_entry.task.status, 'accepted');
    assert.equal(askPayload.product_entry.task.executor_backend, 'codex');
    assert.match(askPayload.product_entry.task.summary, /Codex|受理|执行/);

    const taskStatusResponse = await fetch(
      `${baseUrl}/api/task-status?task_id=${encodeURIComponent(String(askPayload.product_entry.task.task_id))}&lines=20`,
    );
    const taskStatusPayload = await taskStatusResponse.json();
    assert.equal(taskStatusPayload.product_entry.mode, 'task_status');
    assert.equal(taskStatusPayload.product_entry.task.task_id, askPayload.product_entry.task.task_id);
    assert.equal(taskStatusPayload.product_entry.task.executor_backend, 'codex');
    assert.match(taskStatusPayload.product_entry.task.status, /accepted|running|succeeded|failed/);
    assert.equal(typeof taskStatusPayload.product_entry.task.recent_output, 'string');
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
    assert.equal(payload.product_entry.routing.status, 'unknown_domain');
    assert.equal(payload.product_entry.routing.candidate_workstream_id, 'grant_ops');
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
