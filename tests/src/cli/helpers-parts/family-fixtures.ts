import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseJsonText } from '../../../../src/kernel/json-file.ts';
import { canonicalAgentPackageId } from '../../../../src/modules/connect/agent-package-identity.ts';
import {
  createFamilyRuntimeQueueTables,
  DEFAULT_MAX_ATTEMPTS,
} from '../../../../src/modules/runway/family-runtime-store.ts';

import { repoRoot } from './constants.ts';
import { createContractsFixtureRoot, readJsonFixture, shellSingleQuote } from './fixtures.ts';

export function installRuntimePackageFixture(stateRoot: string, packageId: string) {
  const canonicalPackageId = canonicalAgentPackageId(packageId);
  assert.ok(canonicalPackageId);
  fs.mkdirSync(stateRoot, { recursive: true });
  const pluginRoot = path.join(stateRoot, 'fixture-agent-packages', canonicalPackageId);
  const skillRoot = path.join(pluginRoot, 'skills', canonicalPackageId);
  const codexHome = path.join(stateRoot, 'codex-home');
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.writeFileSync(
    path.join(skillRoot, 'SKILL.md'),
    `---\nname: ${canonicalPackageId}\ndescription: Runtime package fixture.\n---\n`,
    'utf8',
  );
  const lockPath = path.join(stateRoot, 'agent-package-locks.json');
  const ledgerPath = path.join(stateRoot, 'agent-package-lifecycle-ledger.json');
  const lockIndex = fs.existsSync(lockPath)
    ? parseJsonText(fs.readFileSync(lockPath, 'utf8')) as any
    : {
        surface_kind: 'opl_agent_package_lock_index',
        version: 'opl-agent-package-lock-index.v1',
        packages: [],
        last_known_good_transactions: [],
      };
  if (lockIndex.packages.some((entry: any) => entry.package_id === canonicalPackageId)) return;

  const installedAt = '2026-01-01T00:00:00.000Z';
  const installReceiptRef = `opl://agent-package/install/${canonicalPackageId}/fixture`;
  const lockRef = `opl://agent-package-lock/${canonicalPackageId}/0.0.0-test/fixture`;
  lockIndex.packages.push({
    surface_kind: 'opl_agent_package_lock',
    package_id: canonicalPackageId,
    agent_id: canonicalPackageId,
    display_name: canonicalPackageId,
    publisher: 'opl-test',
    version_or_source_digest: '0.0.0-test+sha256:fixture',
    package_version: '0.0.0-test',
    owner_language_version: null,
    installed_at: installedAt,
    updated_at: installedAt,
    codex_visible_entry: canonicalPackageId,
    bundled_required_skill_ids: [canonicalPackageId],
    optional_skill_refs: [],
    source_kind: 'manifest_import',
    trust_tier: 'third_party_unverified',
    action_receipt_id: installReceiptRef,
    rollback_ref: `opl://agent-package/rollback/${canonicalPackageId}/fixture`,
    manifest_url: `test://agent-package/${canonicalPackageId}`,
    manifest_sha256: 'sha256:' + '1'.repeat(64),
    owner_source_commit: null,
    permission_scope_sha256: 'sha256:' + '2'.repeat(64),
    lock_ref: lockRef,
    exposure_state: 'visible',
    capability_provider: null,
    capability_dependencies: [],
    resolved_dependencies: [],
    dependency_closure_digest: 'sha256:' + '3'.repeat(64),
    dependency_transaction_id: `fixture-${canonicalPackageId}`,
    content_digest: 'sha256:' + '4'.repeat(64),
    content_lock_paths: [],
    scope_materializations: [],
    runtime_source_carrier: null,
    managed_runtime_source: null,
    managed_update_source: null,
    physical_surface: {
      surface_kind: 'opl_agent_package_physical_codex_surface',
      status: 'materialized',
      package_id: canonicalPackageId,
      plugin_id: canonicalPackageId,
      marketplace_id: null,
      codex_home: codexHome,
      codex_config_path: path.join(codexHome, 'config.toml'),
      codex_config_preexisting: false,
      plugin_source_path: pluginRoot,
      plugin_manifest_path: null,
      codex_plugin_cache_path: null,
      marketplace_root: null,
      marketplace_path: null,
      marketplace_plugin_path: null,
      plugin_payload_manifest_url: null,
      plugin_payload_manifest_sha256: null,
      plugin_payload_cache_path: null,
      materialized_required_skill_ids: [canonicalPackageId],
      materialized_required_skill_paths: [path.join(skillRoot, 'SKILL.md')],
      removed_paths: [],
      writes_performed: false,
      reload_required: false,
      failure_reason: null,
      note: 'Runtime package fixture.',
      profile_config: null,
      profile_migration: {
        surface_kind: 'opl_package_profile_migration',
        status: 'not_requested',
        source_path: null,
        target_path: null,
        source_sha256: null,
        target_sha256: null,
        receipt_path: null,
        merge_packet_path: null,
        apply_command: null,
        authoring_source_paths: [],
        mutation_actions: [],
        rollback_backups_retained: false,
        writes_performed: false,
        note: 'Runtime package fixture.',
      },
      managed_policy_config: null,
      workflow_policy_migration: {
        surface_kind: 'opl_package_managed_policy_migration',
        status: 'not_requested',
        policy_kind: null,
        policy_path: null,
        schema_path: null,
        policy_sha256: null,
        inventory_digest: null,
        dependency_ids: [],
        dependencies: [],
        optional_dependency_ids: [],
        migration_ids: [],
        detected_conflicts: [],
        actions: [],
        service_actions: [],
        dependency_sync: null,
        model_projection: null,
        backup_root: null,
        backup_active: false,
        writes_performed: false,
        note: 'Runtime package fixture.',
      },
      authority_boundary: {
        refs_only: true,
        can_write_domain_truth: false,
        can_write_domain_memory_body: false,
        can_mutate_domain_artifact_body: false,
        can_authorize_quality_or_export: false,
        can_create_owner_receipt: false,
        can_create_typed_blocker: false,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
      },
    },
  });
  fs.writeFileSync(lockPath, `${JSON.stringify(lockIndex, null, 2)}\n`, 'utf8');

  const ledger = fs.existsSync(ledgerPath)
    ? parseJsonText(fs.readFileSync(ledgerPath, 'utf8')) as any
    : {
        surface_kind: 'opl_agent_package_lifecycle_ledger',
        version: 'opl-agent-package-lifecycle-ledger.v1',
        receipts: [],
      };
  ledger.receipts.push({
    surface_kind: 'opl_agent_package_lifecycle_receipt',
    receipt_ref: installReceiptRef,
    receipt_status: 'recorded',
    recorded_at: installedAt,
    action: 'install',
    action_status: 'completed',
    package_id: canonicalPackageId,
    registry_url: null,
    manifest_url: `test://agent-package/${canonicalPackageId}`,
    manifest_sha256: 'sha256:' + '1'.repeat(64),
    package_lock_ref: lockRef,
    rollback_ref: `opl://agent-package/rollback/${canonicalPackageId}/fixture`,
    source_kind: 'manifest_import',
    trust_tier: 'third_party_unverified',
    writes_performed: true,
    source_surface: 'opl_test_runtime_package_fixture',
    authority_boundary: { can_write_domain_truth: false },
  });
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
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
      GIT_AUTHOR_NAME: 'OPL Test',
      GIT_AUTHOR_EMAIL: 'opl@example.test',
      GIT_COMMITTER_NAME: 'OPL Test',
      GIT_COMMITTER_EMAIL: 'opl@example.test',
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
  const carrierFiles = moduleName === 'med-autoscience'
    ? {
        'contracts/action_catalog.json': '{}\n',
        'contracts/domain_handler_registry.json': '{}\n',
        'contracts/pack_compiler_input.json': '{}\n',
        'agent/stages/manifest.json': '{}\n',
        'agent/primary_skill/SKILL.md': '# med-autoscience\n',
        ...files,
      }
    : files;
  const pluginNameByModule: Record<string, string> = {
    'med-autoscience': 'med-autoscience',
    'med-autogrant': 'med-autogrant',
    'redcube-ai': 'redcube-ai',
    'opl-meta-agent': 'opl-meta-agent',
    'opl-bookforge': 'opl-bookforge',
  };
  const pluginName = pluginNameByModule[moduleName];
  if (!pluginName || files['agent/primary_skill/SKILL.md']) {
    return carrierFiles;
  }
  const carrierSkill = carrierFiles[`plugins/${pluginName}/skills/${pluginName}/SKILL.md`];
  return carrierSkill
    ? {
        ...carrierFiles,
        'agent/primary_skill/SKILL.md': carrierSkill,
      }
    : carrierFiles;
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
  const domainEntryPath = path.join(fixtureRoot, 'opl-test-domain-entry');
  const masManifestPath = path.join(fixtureRoot, 'mas-manifest.json');
  const magManifestPath = path.join(fixtureRoot, 'mag-manifest.json');
  const redcubeManifestPath = path.join(fixtureRoot, 'redcube-manifest.json');

  fs.writeFileSync(masManifestPath, `${JSON.stringify(options.masManifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(magManifestPath, `${JSON.stringify(options.magManifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(redcubeManifestPath, `${JSON.stringify(options.redcubeManifest, null, 2)}\n`, 'utf8');

  fs.writeFileSync(
    domainEntryPath,
    `#!/usr/bin/env bash
set -euo pipefail

case "\${1:-}" in
  mas) cat ${shellSingleQuote(masManifestPath)} ;;
  mag) cat ${shellSingleQuote(magManifestPath)} ;;
  rca) cat ${shellSingleQuote(redcubeManifestPath)} ;;
  *) echo "unexpected domain entry fixture agent: \${1:-}" >&2; exit 1 ;;
esac
`,
    { mode: 0o755 },
  );

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
    domainEntryPath,
  };
}
