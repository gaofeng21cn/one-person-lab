import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseJsonText } from '../../../../src/kernel/json-file.ts';
import {
  createFamilyRuntimeQueueTables,
  DEFAULT_MAX_ATTEMPTS,
} from '../../../../src/modules/runway/family-runtime-store.ts';

import { repoRoot } from './constants.ts';
import { createContractsFixtureRoot, readJsonFixture, shellSingleQuote } from './fixtures.ts';
import { runCli } from './runner.ts';

export function installRuntimePackageFixture(stateRoot: string, packageId: string) {
  const env = {
    OPL_STATE_DIR: stateRoot,
    CODEX_HOME: path.join(stateRoot, 'codex-home'),
  };
  const current = runCli(['packages', 'status', '--package-id', packageId], env)
    .opl_agent_package_status;
  if (current.installed_package_count > 0) return;
  const fixtureRoot = path.join(stateRoot, 'test-package-fixtures');
  const manifestPath = path.join(fixtureRoot, `${packageId}.json`);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    surface_kind: 'opl_agent_package_manifest.v1',
    agent_id: packageId,
    package_id: packageId,
    display_name: packageId,
    publisher: 'opl-test',
    version: '0.0.0-test',
    source: 'local_contract_fixture',
    carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
    codex_surface: { required_skill_ids: [packageId] },
    capability_dependencies: [],
  }, null, 2)}\n`);
  runCli([
    'packages', 'install', '--manifest-url', manifestPath, '--trust-tier', 'first_party',
  ], env);
}

export function loadFamilyManifestFixtures() {
  const medautogrant = readJsonFixture<Record<string, unknown>>('med-autogrant-product-entry-manifest.json');
  delete (medautogrant.product_entry_manifest as Record<string, unknown>).family_stage_control_plane;
  const medautoscience = readJsonFixture<Record<string, unknown>>('med-autoscience-product-entry-manifest.json');
  delete medautoscience.family_stage_control_plane;
  return {
    medautogrant,
    medautoscience,
    redcube: readJsonFixture<Record<string, unknown>>('redcube-product-entry-manifest.json'),
  };
}

test('family manifest fixtures expose domain agent entry spec v1', () => {
  const fixtures = loadFamilyManifestFixtures();
  const scienceSpec = (fixtures.medautoscience.domain_entry_contract as Record<string, unknown>).domain_agent_entry_spec as Record<string, unknown>;
  const grantSpec = (fixtures.medautogrant.product_entry_manifest as Record<string, unknown>).domain_entry_contract as Record<string, unknown>;
  const grantEntrySpec = grantSpec.domain_agent_entry_spec as Record<string, unknown>;
  const redcubeSpec = (fixtures.redcube.domain_entry_contract as Record<string, unknown>).domain_agent_entry_spec as Record<string, unknown>;

  assert.equal(scienceSpec.agent_id, 'mas');
  assert.equal(scienceSpec.entry_command, 'product-status');
  assert.equal(scienceSpec.manifest_command, 'product-entry-manifest');

  assert.equal(grantEntrySpec.agent_id, 'mag');
  assert.equal(grantEntrySpec.entry_command, 'product-status');
  assert.equal(grantEntrySpec.manifest_command, 'product-entry-manifest');

  assert.equal(redcubeSpec.agent_id, 'rca');
  assert.equal(redcubeSpec.entry_command, 'redcube product status');
  assert.equal(redcubeSpec.manifest_command, 'redcube product manifest');
});

export function assertMagActionGraph(actionGraph: Record<string, unknown>) {
  assert.equal(actionGraph.graph_id, 'mag_critique_to_revision_graph');
  assert.equal(actionGraph.target_domain_id, 'med-autogrant');
  assert.deepEqual(
    (actionGraph.nodes as Array<{ node_id: string }>).map((node) => node.node_id),
    ['route:critique', 'route:revision'],
  );
  assert.deepEqual(actionGraph.entry_nodes, ['route:critique']);
  assert.deepEqual(actionGraph.exit_nodes, ['route:revision']);
  assert.deepEqual(actionGraph.human_gates, [
    {
      gate_id: 'mag_route_gate_revision',
      trigger_nodes: ['route:revision'],
      blocking: true,
    },
  ]);
  assert.deepEqual(actionGraph.checkpoint_policy, {
    mode: 'explicit_nodes',
    checkpoint_nodes: ['route:critique', 'route:revision'],
  });
}

export function assertMasActionGraph(actionGraph: Record<string, unknown>) {
  assert.equal(actionGraph.graph_id, 'mas_workspace_product_entry_study_runtime_graph');
  assert.equal(actionGraph.target_domain_id, 'med-autoscience');
  assert.deepEqual(
    (actionGraph.nodes as Array<{ node_id: string }>).map((node) => node.node_id),
    [
      'product_entry:open_workspace',
      'study:submit_task',
      'study:launch_or_resume',
      'study:inspect_progress',
    ],
  );
  assert.deepEqual(actionGraph.entry_nodes, ['product_entry:open_workspace']);
  assert.deepEqual(actionGraph.exit_nodes, ['study:inspect_progress']);
  assert.deepEqual(actionGraph.human_gates, [
    {
      gate_id: 'study_physician_decision_gate',
      trigger_nodes: ['study:inspect_progress'],
      blocking: true,
    },
    {
      gate_id: 'publication_release_gate',
      trigger_nodes: ['study:inspect_progress'],
      blocking: true,
    },
  ]);
  assert.deepEqual(actionGraph.checkpoint_policy, {
    mode: 'explicit_nodes',
    checkpoint_nodes: [
      'study:submit_task',
      'study:launch_or_resume',
      'study:inspect_progress',
    ],
  });
}

export function assertRedcubeActionGraph(actionGraph: Record<string, unknown>) {
  assert.equal(actionGraph.graph_id, 'redcube_product_entry_product_entry_graph');
  assert.equal(actionGraph.target_domain_id, 'redcube_ai');
  assert.deepEqual(
    (actionGraph.nodes as Array<{ node_id: string }>).map((node) => node.node_id),
    [
      'step:open_product_entry',
      'step:continue_current_loop',
      'step:opl_bridge_handoff',
      'step:inspect_current_progress',
    ],
  );
  assert.deepEqual(actionGraph.entry_nodes, ['step:open_product_entry']);
  assert.deepEqual(actionGraph.exit_nodes, ['step:inspect_current_progress']);
  assert.deepEqual(actionGraph.human_gates, [
    {
      gate_id: 'redcube_operator_review_gate',
      trigger_nodes: ['step:inspect_current_progress'],
      blocking: true,
    },
  ]);
  assert.deepEqual(actionGraph.checkpoint_policy, {
    mode: 'explicit_nodes',
    checkpoint_nodes: [
      'step:continue_current_loop',
      'step:opl_bridge_handoff',
      'step:inspect_current_progress',
    ],
  });
}

export function createFamilyContractsFixtureRoot() {
  return createContractsFixtureRoot((fixtureContractsRoot) => {
    const domainsPath = path.join(fixtureContractsRoot, 'domains.json');
    const payload = parseJsonText(fs.readFileSync(domainsPath, 'utf8')) as {
      version: string;
      domains: Array<Record<string, unknown>>;
    };

    if (!payload.domains.some((domain) => domain.domain_id === 'medautogrant')) {
      payload.domains.push({
        domain_id: 'medautogrant',
        label: 'MedAutoGrant',
        project: 'med-autogrant',
        independent_domain_agent: {
          agent_id: 'mag',
          status: 'active',
          authority_scope: 'grant_authoring_domain_agent',
          opl_top_level_domain_agent: true,
        },
        single_app_skill: {
          skill_id: 'mag',
          plugin_name: 'Med Auto Grant',
          activation_kind: 'explicit_app_skill',
          entry_command: 'medautogrant product status',
          manifest_command: 'medautogrant product-entry-manifest',
        },
        domain_truth_owner: [
          'grant_run_truth',
          'grant_workspace_state',
          'grant_submission_artifacts',
          'grant_review_judgment',
          'grant_user_visible_progress',
        ],
        opl_projection_role: [
          'consume_session_projections',
          'consume_progress_projections',
          'consume_artifact_projections',
          'consume_runtime_projections',
        ],
        runtime_dependency_boundary: {
          domain_runtime_owner: 'med-autogrant',
          opl_dependency: 'projection_consumer_only',
          opl_truth_write_policy: 'no_domain_truth_writes',
          backend_companions: [],
        },
        standalone_allowed: true,
        owned_workstreams: ['grant_ops'],
        non_opl_families: [],
      });
    }

    fs.writeFileSync(domainsPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  });
}

export function insertFamilyRuntimeTaskProjectionFixture({
  stateRoot,
  taskId = `task_${Date.now()}_${Math.random().toString(16).slice(2)}`,
  domainId,
  taskKind,
  payload = {},
  dedupeKey = null,
  priority = 50,
  status = 'queued',
  source = 'test_projection_fixture',
}: {
  stateRoot: string;
  taskId?: string;
  domainId: string;
  taskKind: string;
  payload?: Record<string, unknown>;
  dedupeKey?: string | null;
  priority?: number;
  status?: string;
  source?: string;
}) {
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  fs.mkdirSync(runtimeRoot, { recursive: true });
  const db = new DatabaseSync(path.join(runtimeRoot, 'queue.sqlite'));
  createFamilyRuntimeQueueTables(db);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO tasks (
      task_id,
      domain_id,
      task_kind,
      payload_json,
      dedupe_key,
      priority,
      status,
      attempts,
      max_attempts,
      source,
      requires_approval,
      approved_at,
      lease_owner,
      lease_expires_at,
      last_error,
      dead_letter_reason,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, NULL, NULL, NULL, NULL, NULL, ?, ?)
  `).run(
    taskId,
    domainId,
    taskKind,
    JSON.stringify(payload),
    dedupeKey,
    priority,
    status,
    DEFAULT_MAX_ATTEMPTS,
    source,
    now,
    now,
  );
  db.close();
  return {
    task_id: taskId,
    domain_id: domainId,
    task_kind: taskKind,
    payload,
    status,
  };
}

export function createFakeLaunchctlFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-launchctl-fixture-'));
  const stateDir = path.join(fixtureRoot, 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  const launchctlPath = path.join(fixtureRoot, 'launchctl');
  fs.writeFileSync(
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
service = ai.opl.product entry
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

export function createFakeOpenFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-open-fixture-'));
  const capturePath = path.join(fixtureRoot, 'open.log');
  const openPath = path.join(fixtureRoot, 'open');
  fs.writeFileSync(
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

export function runGitFixtureCommand(
  cwd: string,
  args: string[],
  envOverrides: Record<string, string> = {},
) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...envOverrides,
    },
  });

  assert.equal(result.status, 0, `git ${args.join(' ')}\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  return result;
}

export function createGitModuleRemoteFixture(
  moduleName = 'med-autoscience',
  options: Partial<{
    extraFiles: Record<string, string>;
    executableFiles: string[];
  }> = {},
) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-module-remote-'));
  const sourceRoot = path.join(fixtureRoot, 'source');
  const remoteRoot = path.join(fixtureRoot, `${moduleName}.git`);

  fs.mkdirSync(sourceRoot, { recursive: true });
  runGitFixtureCommand(sourceRoot, ['init', '--initial-branch', 'main']);

  fs.writeFileSync(path.join(sourceRoot, 'README.md'), `# ${moduleName}\n`, 'utf8');
  const extraFiles = withStandardPrimarySkillCarrierFiles(moduleName, options.extraFiles ?? {});
  for (const [relativePath, contents] of Object.entries(extraFiles)) {
    const targetPath = path.join(sourceRoot, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, contents, {
      encoding: 'utf8',
      mode:
        relativePath.endsWith('.sh') || (options.executableFiles ?? []).includes(relativePath)
          ? 0o755
          : undefined,
    });
  }
  runGitFixtureCommand(sourceRoot, ['add', '-A']);
  runGitFixtureCommand(sourceRoot, [
    '-c',
    'user.name=OPL Test',
    '-c',
    'user.email=opl@example.test',
    'commit',
    '-m',
    'Initial module snapshot',
  ]);

  runGitFixtureCommand(fixtureRoot, ['clone', '--bare', sourceRoot, remoteRoot]);
  runGitFixtureCommand(sourceRoot, ['remote', 'add', 'origin', remoteRoot]);

  return {
    fixtureRoot,
    sourceRoot,
    remoteRoot,
    getHeadSha() {
      return runGitFixtureCommand(sourceRoot, ['rev-parse', 'HEAD']).stdout.trim();
    },
    advance(fileName: string, contents: string, message: string) {
      fs.writeFileSync(path.join(sourceRoot, fileName), contents, 'utf8');
      runGitFixtureCommand(sourceRoot, ['add', fileName]);
      runGitFixtureCommand(sourceRoot, [
        '-c',
        'user.name=OPL Test',
        '-c',
        'user.email=opl@example.test',
        'commit',
        '-m',
        message,
      ]);
      runGitFixtureCommand(sourceRoot, ['push', 'origin', 'main']);
      return runGitFixtureCommand(sourceRoot, ['rev-parse', 'HEAD']).stdout.trim();
    },
  };
}

function withStandardPrimarySkillCarrierFiles(moduleName: string, files: Record<string, string>) {
  const pluginNameByModule: Record<string, string> = {
    'med-autoscience': 'med-autoscience',
    'med-autogrant': 'med-autogrant',
    'redcube-ai': 'redcube-ai',
    'opl-meta-agent': 'opl-meta-agent',
    'opl-bookforge': 'opl-bookforge',
  };
  const pluginName = pluginNameByModule[moduleName];
  if (!pluginName || files['agent/primary_skill/SKILL.md']) {
    return files;
  }
  const carrierSkill = files[`plugins/${pluginName}/skills/${pluginName}/SKILL.md`];
  return carrierSkill
    ? {
        'agent/primary_skill/SKILL.md': carrierSkill,
        ...files,
      }
    : files;
}

export function createFakeShellCommandFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-shell-command-fixture-'));
  const capturePath = path.join(fixtureRoot, 'shell-command.log');
  const commandPath = path.join(fixtureRoot, 'fake-domain-entry');
  fs.writeFileSync(
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

export function writeMasCleanRunnerFixture(
  workspaceRoot: string,
  options: {
    profilePath?: string;
    manifest?: Record<string, unknown>;
  } = {},
) {
  const runnerPath = path.join(workspaceRoot, 'scripts', 'run-python-clean.sh');
  fs.mkdirSync(path.dirname(runnerPath), { recursive: true });
  if (options.profilePath && options.manifest) {
    const runnerModulePath = path.join(path.dirname(runnerPath), 'run-python-clean-fixture.mjs');
    fs.writeFileSync(
      runnerModulePath,
      [
        `const expectedProfile = ${JSON.stringify(path.resolve(options.profilePath))};`,
        `const manifest = ${JSON.stringify(options.manifest)};`,
        'const args = process.argv.slice(2).join(" ");',
        'if (args.includes(expectedProfile) && args.includes("med_autoscience.controllers.product_entry")) {',
        '  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\\n`);',
        '  process.exit(0);',
        '}',
        'process.stderr.write(`unexpected MAS clean runner args: ${args}\\n`);',
        'process.exit(1);',
        '',
      ].join('\n'),
      { encoding: 'utf8', mode: 0o755 },
    );
    fs.writeFileSync(
      runnerPath,
      [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `exec ${shellSingleQuote(process.execPath)} ${shellSingleQuote(runnerModulePath)} "$@"`,
        '',
      ].join('\n'),
      { encoding: 'utf8', mode: 0o755 },
    );
    return runnerPath;
  }

  fs.writeFileSync(
    runnerPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'echo "MAS clean runner fixture should not be executed in this test" >&2',
      'exit 64',
      '',
    ].join('\n'),
    { encoding: 'utf8', mode: 0o755 },
  );
  return runnerPath;
}

export function createFamilyLocatorResolverFixture(options: {
  masProfile: string;
  magInput: string;
  redcubeWorkspaceRoot: string;
  masManifest: Record<string, unknown>;
  magManifest: Record<string, unknown>;
  redcubeManifest: Record<string, unknown>;
}) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-locator-fixture-'));
  const uvPath = path.join(fixtureRoot, 'uv');
  const redcubePath = path.join(fixtureRoot, 'redcube');
  const masManifestPath = path.join(fixtureRoot, 'mas-manifest.json');
  const magManifestPath = path.join(fixtureRoot, 'mag-manifest.json');
  const redcubeManifestPath = path.join(fixtureRoot, 'redcube-manifest.json');

  fs.writeFileSync(masManifestPath, `${JSON.stringify(options.masManifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(magManifestPath, `${JSON.stringify(options.magManifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(redcubeManifestPath, `${JSON.stringify(options.redcubeManifest, null, 2)}\n`, 'utf8');

  fs.writeFileSync(
    uvPath,
    `#!/usr/bin/env bash
set -euo pipefail

if [[ "$*" == *${shellSingleQuote(`run python -m med_autoscience.cli product manifest --profile ${path.resolve(options.masProfile)} --format json`)}* ]]; then
  cat ${shellSingleQuote(masManifestPath)}
  exit 0
fi

if [[ "$*" == run\\ --isolated\\ --frozen\\ --project\\ *\\ python\\ -c* && "$*" == *med_autoscience.controllers.product_entry* && "$*" == *${path.resolve(options.masProfile)}* ]]; then
  cat ${shellSingleQuote(masManifestPath)}
  exit 0
fi

if [[ "$*" == run\\ --directory\\ *\\ python\\ -c* && "$*" == *${path.resolve(options.magInput)}* ]]; then
  cat ${shellSingleQuote(magManifestPath)}
  exit 0
fi

echo "unexpected uv args: $*" >&2
exit 1
`,
    { mode: 0o755 },
  );

  fs.writeFileSync(
    redcubePath,
    `#!/usr/bin/env bash
set -euo pipefail

if [[ "$*" == ${shellSingleQuote(`product manifest --workspace-root ${path.resolve(options.redcubeWorkspaceRoot)}`)} ]]; then
  cat ${shellSingleQuote(redcubeManifestPath)}
  exit 0
fi

echo "unexpected redcube args: $*" >&2
exit 1
`,
    { mode: 0o755 },
  );

  return {
    fixtureRoot,
    uvPath,
    redcubePath,
  };
}
