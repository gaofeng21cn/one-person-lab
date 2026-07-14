import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, parseJsonText, path, runCli, runCliFailure, test } from '../helpers.ts';
import { writeNativeHelperFixtureScripts } from './native-helper-fixtures.ts';
import { createAdmittedStagePackFixture } from './workspace-domain-test-helper.ts';

function createNativeHelperRepairScript(root: string, helperBinDir: string) {
  const repairScript = path.join(root, 'repair-native.sh');
  fs.writeFileSync(
    repairScript,
    `#!/usr/bin/env bash
set -euo pipefail
mkdir -p "${helperBinDir}"
for binary in opl-doctor-native opl-runtime-watch opl-artifact-indexer opl-state-indexer; do
  cat > "${helperBinDir}/$binary" <<'EOS'
#!/bin/sh
cat >/dev/null
case "$(basename "$0")" in
  opl-doctor-native)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-doctor-native","helper_version":"0.1.0","crate_name":"opl-native-helper","crate_version":"0.1.0","ok":true,"request_id":"runtime-manager-doctor","result":{"surface_kind":"native_doctor_snapshot"},"errors":[]}'
    ;;
  opl-runtime-watch)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-runtime-watch","helper_version":"0.1.0","crate_name":"opl-native-helper","crate_version":"0.1.0","ok":true,"request_id":"runtime-manager-runtime-watch","result":{"surface_kind":"runtime_health_snapshot_index","roots":[]},"errors":[]}'
    ;;
  opl-artifact-indexer)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-artifact-indexer","helper_version":"0.1.0","crate_name":"opl-native-helper","crate_version":"0.1.0","ok":true,"request_id":"runtime-manager-artifact-index","result":{"surface_kind":"native_artifact_manifest","summary":{"total_files_count":1},"files":[]},"errors":[]}'
    ;;
  opl-state-indexer)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-state-indexer","helper_version":"0.1.0","crate_name":"opl-native-helper","crate_version":"0.1.0","ok":true,"request_id":"runtime-manager-state-index","result":{"surface_kind":"native_state_index","roots":[],"json_validation":{"checked_files_count":0,"invalid_files_count":0,"files":[]}},"errors":[]}'
    ;;
esac
EOS
  chmod +x "${helperBinDir}/$binary"
done
printf 'native helper repair completed\\n'
`,
    { mode: 0o755 },
  );
  return repairScript;
}

function removeTempRoots(...roots: string[]) {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
}

type ActionWithId = { action_id: string };

function writeJsonFile(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function actionIds(actions: ActionWithId[]) {
  return actions.map((action) => action.action_id);
}

function actionPairs<T extends string>(actions: Array<ActionWithId & Record<T, string>>, statusKey: T) {
  return actions.map((action) => [action.action_id, action[statusKey]]);
}

function assertPathValues(root: unknown, values: Array<[string, unknown]>) {
  for (const [selector, expected] of values) {
    const actual = selector.split('.').reduce<unknown>((current, key) => {
      assert.ok(current !== null && typeof current === 'object', `${selector} missing ${key}`);
      return (current as Record<string, unknown>)[key];
    }, root);
    assert.deepEqual(actual, expected, selector);
  }
}

function findItem<T extends Record<string, any>>(items: T[], key: string, value: string) {
  const item = items.find((candidate) => candidate[key] === value);
  assert.ok(item, `${key}=${value}`);
  return item;
}

function bindWorkspaceProject(
  project: string,
  projectPath: string,
  manifest: Record<string, unknown>,
  stateRoot: string,
  contractsRoot: string,
) {
  runCli([
    'workspace',
    'bind',
    '--project',
    project,
    '--path',
    projectPath,
    '--manifest-command',
    buildManifestCommand(manifest),
  ], {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: contractsRoot,
  });
}

function runTemporalRuntimeManager(
  stateRoot: string,
  helperBinDir: string,
  envOverrides: Record<string, string> = {},
) {
  return runCli(['runtime', 'manager'], {
    OPL_STATE_DIR: stateRoot,
    OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
    OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    ...envOverrides,
  });
}

test('runtime manager reports stale and expired native index freshness from the last successful snapshot', (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-stale-state-'));
  const helperBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-helper-bin-'));

  writeNativeHelperFixtureScripts(helperBinDir, { includeVersionFields: true });
  t.after(() => removeTempRoots(stateRoot, helperBinDir));

    const success = runTemporalRuntimeManager(stateRoot, helperBinDir);
    const successPersistence = success.runtime_manager.state_index_target.persistence;
    assert.equal(successPersistence.status, 'written');
    assert.equal(successPersistence.freshness.status, 'fresh');
    assert.equal(success.runtime_manager.reconcile.surface_kind, 'opl_runtime_manager_reconcile');
    assert.equal(success.runtime_manager.reconcile.overall_status, 'attention_needed');
    assert.deepEqual(
      actionIds(success.runtime_manager.reconcile.recommended_actions),
      ['configure_temporal_provider'],
    );

    const missingNativeBinDir = path.join(stateRoot, 'missing-native-bin');
    const stale = runTemporalRuntimeManager(stateRoot, missingNativeBinDir);
    const staleFreshness = stale.runtime_manager.state_index_target.persistence.freshness;
    assert.equal(stale.runtime_manager.state_index_target.persistence.status, 'skipped_helper_unavailable');
    assert.equal(staleFreshness.status, 'stale_last_success_available');
    assert.equal(staleFreshness.last_success_expired, false);
    assert.equal(staleFreshness.failure_count, 1);
    const failureLines = fs.readFileSync(successPersistence.failure_file, 'utf8').trim().split('\n');
    const failure = parseJsonText(failureLines[failureLines.length - 1]) as any;
    assert.equal(failure.category, 'helper_unavailable');
    assert.equal(failure.details.helpers.length, 3);
    assert.deepEqual(
      failure.details.helpers.map((helper: { index_key: string; status: string }) => [helper.index_key, helper.status]),
      [
        ['state_index', 'unavailable'],
        ['artifact_manifest', 'unavailable'],
        ['runtime_health', 'unavailable'],
      ],
    );
    assert.equal(typeof staleFreshness.last_success_generated_at, 'string');
    assert.equal(stale.runtime_manager.reconcile.overall_status, 'attention_needed');
    assert.deepEqual(
      actionIds(stale.runtime_manager.reconcile.recommended_actions),
      ['configure_temporal_provider', 'repair_native_helpers', 'refresh_native_indexes'],
    );

    const lastSuccess = parseJsonText(fs.readFileSync(successPersistence.last_success_file, 'utf8')) as any;
    lastSuccess.lifecycle.expires_at = '2000-01-01T00:00:00.000Z';
    fs.writeFileSync(successPersistence.last_success_file, `${JSON.stringify(lastSuccess, null, 2)}\n`);

    const expired = runTemporalRuntimeManager(stateRoot, missingNativeBinDir);
    const expiredFreshness = expired.runtime_manager.state_index_target.persistence.freshness;
    assert.equal(expiredFreshness.status, 'expired_last_success');
    assert.equal(expiredFreshness.last_success_expired, true);
    assert.equal(expiredFreshness.failure_count, 2);
});

test('runtime manager reuses a fresh native index without refreshing it', (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-warm-state-'));
  const helperBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-helper-warm-bin-'));
  writeNativeHelperFixtureScripts(helperBinDir, { includeVersionFields: true });
  t.after(() => removeTempRoots(stateRoot, helperBinDir));

  const first = runTemporalRuntimeManager(stateRoot, helperBinDir);
  assert.equal(first.runtime_manager.state_index_target.persistence.execution.cache_hit, false);
  assert.equal(first.runtime_manager.state_index_target.persistence.execution.helper_execution, 'executed');

  const second = runTemporalRuntimeManager(stateRoot, helperBinDir);
  const execution = second.runtime_manager.state_index_target.persistence.execution;
  assert.equal(execution.mode, 'auto');
  assert.equal(execution.cache_hit, true);
  assert.equal(execution.helper_execution, 'reused');
  assert.deepEqual(execution.reused_index_keys, ['state_index', 'artifact_manifest', 'runtime_health']);
  assert.equal(second.runtime_manager.state_index_target.persistence.freshness.status, 'fresh');
});

test('runtime manager explicitly refreshes every native index helper on request', (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-explicit-refresh-state-'));
  const helperBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-helper-explicit-refresh-bin-'));
  writeNativeHelperFixtureScripts(helperBinDir, { includeVersionFields: true });
  t.after(() => removeTempRoots(stateRoot, helperBinDir));

  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
    OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
  };
  runCli(['runtime', 'manager'], env);
  const warm = runCli(['runtime', 'manager'], env);
  assert.equal(warm.runtime_manager.state_index_target.persistence.execution.cache_hit, true);

  const refreshed = runCli(['runtime', 'manager', '--refresh-native-indexes'], env);
  const execution = refreshed.runtime_manager.state_index_target.persistence.execution;
  assert.equal(execution.mode, 'refresh');
  assert.equal(execution.cache_hit, false);
  assert.equal(execution.helper_execution, 'executed');
  assert.deepEqual(execution.reused_index_keys, []);
  assert.equal(refreshed.runtime_manager.state_index_target.persistence.status, 'written');
});

test('runtime manager rebuilds an incomplete or version-incompatible fresh cache', (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-incomplete-cache-state-'));
  const helperBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-helper-incomplete-cache-bin-'));
  writeNativeHelperFixtureScripts(helperBinDir, { includeVersionFields: true });
  t.after(() => removeTempRoots(stateRoot, helperBinDir));

  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
    OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
  };
  const first = runCli(['runtime', 'manager'], env);
  const indexFile = first.runtime_manager.state_index_target.persistence.index_file;
  const persisted = parseJsonText(fs.readFileSync(indexFile, 'utf8')) as any;
  delete persisted.native_indexes.artifact_manifest;
  persisted.native_indexes.state_index.crate_version = '0.0.0';
  writeJsonFile(indexFile, persisted);

  const rebuilt = runCli(['runtime', 'manager'], env);
  const execution = rebuilt.runtime_manager.state_index_target.persistence.execution;
  assert.equal(execution.mode, 'auto');
  assert.equal(execution.cache_hit, false);
  assert.equal(execution.cache_reason, 'cache_incomplete');
  assert.equal(execution.helper_execution, 'executed');
  assert.deepEqual(execution.reused_index_keys, ['runtime_health']);
  assert.equal(rebuilt.runtime_manager.state_index_target.persistence.status, 'written');
});

test('runtime manager records structured native index diff and history GC reporting', (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-index-gc-state-'));
  const helperBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-helper-index-gc-bin-'));
  const runtimeDir = path.join(stateRoot, 'runtime-manager');
  fs.mkdirSync(runtimeDir, { recursive: true });
  writeNativeHelperFixtureScripts(helperBinDir, { includeVersionFields: true });
  t.after(() => removeTempRoots(stateRoot, helperBinDir));

  const historyFile = path.join(runtimeDir, 'native-state-index-history.jsonl');
  for (let index = 0; index < 55; index += 1) {
    fs.appendFileSync(
      historyFile,
      `${JSON.stringify({
        generated_at: `2026-04-25T00:00:${String(index).padStart(2, '0')}.000Z`,
        summary: { seeded: 'ok' },
      })}\n`,
    );
  }
  writeJsonFile(
    path.join(runtimeDir, 'native-state-index.json'),
    {
      surface_kind: 'opl_runtime_manager_native_state_projection',
      generated_at: '2026-04-25T00:00:00.000Z',
      lifecycle: {
        expires_at: '2026-04-26T00:00:00.000Z',
      },
      native_indexes: {
        artifact_manifest: {
          helper_id: 'opl-artifact-indexer',
          request_id: 'runtime-manager-artifact-index',
          status: 'execution_error',
          result: {
            surface_kind: 'legacy_artifact_manifest',
          },
          errors: [{ code: 'execution_error', message: 'old failure' }],
        },
        legacy_index: {
          helper_id: 'opl-legacy-helper',
          request_id: 'runtime-manager-legacy-index',
          status: 'ok',
          result: {
            surface_kind: 'legacy_surface',
          },
          errors: [],
        },
      },
    },
  );

    const output = runCli(['runtime', 'manager'], {
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
    });
    const persistence = output.runtime_manager.state_index_target.persistence;

    assert.equal(persistence.status, 'written');
    assert.equal(persistence.diff.changed, true);
    assert.deepEqual(persistence.diff.summary, {
      previous_index_count: 2,
      current_index_count: 3,
      added_count: 2,
      removed_count: 1,
      changed_count: 1,
      unchanged_count: 0,
      helper_changed_count: 0,
      result_surface_changed_count: 1,
      status_changed_count: 1,
    });
    type RuntimeManagerDiffDetail = {
      index_key: string;
      change?: string;
      changed_fields?: string[];
    };
    const detailByKey = new Map<string, RuntimeManagerDiffDetail>(
      persistence.diff.details.map((detail: RuntimeManagerDiffDetail) => [detail.index_key, detail]),
    );
    const stateIndexDetail = detailByKey.get('state_index');
    const legacyIndexDetail = detailByKey.get('legacy_index');
    const artifactManifestDetail = detailByKey.get('artifact_manifest');
    assert.ok(stateIndexDetail);
    assert.ok(legacyIndexDetail);
    assert.ok(artifactManifestDetail);
    assert.deepEqual(stateIndexDetail.change, 'added');
    assert.deepEqual(legacyIndexDetail.change, 'removed');
    assert.deepEqual(artifactManifestDetail.changed_fields, ['result_surface_kind', 'status']);
    assert.equal(persistence.gc.retained_history_count, 50);
    assert.equal(persistence.gc.max_history_entries, 50);
    assert.equal(persistence.gc.preserved_count, 50);
    assert.equal(persistence.gc.removed_count, 6);
    assert.equal(persistence.gc.history_count_before_gc, 56);
    assert.equal(persistence.gc.history_count_after_gc, 50);

    const historyLines = fs.readFileSync(historyFile, 'utf8').trim().split('\n');
    assert.equal(historyLines.length, 50);
    const latestHistoryEntry = parseJsonText(historyLines[historyLines.length - 1]) as any;
    assert.deepEqual(latestHistoryEntry.gc, persistence.gc);
});

test('runtime snapshot projects active domain manifests into tray lanes without owning runtime truth', (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-workspace-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  t.after(() => removeTempRoots(stateRoot, workspaceRoot, fixtureRoot));
  fs.mkdirSync(path.join(workspaceRoot, 'mas'), { recursive: true });
  fs.mkdirSync(path.join(workspaceRoot, 'redcube'), { recursive: true });
  fs.mkdirSync(path.join(workspaceRoot, 'mag'), { recursive: true });
  const runningManifest = structuredClone(fixtures.medautoscience);
  runningManifest.task_lifecycle = {
    ...(runningManifest.task_lifecycle as Record<string, unknown>),
    status: 'running',
    session_id: 'mas-study-session-002',
    run_id: 'mas-run-002',
    human_gate_ids: [],
    summary: 'MAS study runtime is actively processing the current study.',
  };
  runningManifest.progress_projection = {
    ...(runningManifest.progress_projection as Record<string, unknown>),
    current_status: 'in_progress',
    runtime_status: 'ready',
    session_id: 'mas-study-session-002',
    headline: 'MAS study runtime is actively processing the current study.',
    attention_items: [],
    human_gate_ids: [],
    domain_projection: {
      ...((runningManifest.progress_projection as Record<string, unknown>)?.domain_projection as Record<string, unknown> ?? {}),
      managed_temporal_state_consistency: {
        surface_kind: 'managed_temporal_state_consistency',
        projection_status: 'ready',
        provider_kind: 'temporal',
        service_status: 'ready',
        worker_status: 'ready',
        address: 'mas-managed-temporal.example.test:7233',
        namespace: 'default',
        task_queue: 'opl-stage-attempts',
        source_refs: ['mas://runtime/managed_temporal_state_consistency/latest.json'],
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          paper_closure_authority: 'mas_only',
        },
      },
    },
  };
  runningManifest.product_entry_start = {
    ...(runningManifest.product_entry_start as Record<string, unknown>),
    human_gate_ids: [],
  };
  const masPack = createAdmittedStagePackFixture(
    runningManifest,
    'med-autoscience',
    'MedAutoScience',
  );
  t.after(() => removeTempRoots(masPack.repoDir));

  const attentionManifest = structuredClone(fixtures.redcube);
  attentionManifest.task_lifecycle = {
    ...(attentionManifest.task_lifecycle as Record<string, unknown>),
    status: 'operator_review_requested',
    session_id: 'redcube-entry-session-001',
    run_id: 'redcube-run-001',
    human_gate_ids: ['redcube_operator_review_gate'],
    summary: 'RCA deliverable loop is waiting for operator review.',
  };
  attentionManifest.progress_projection = {
    ...(attentionManifest.progress_projection as Record<string, unknown>),
    session_id: 'redcube-entry-session-001',
    attention_items: ['Review the generated deck before continuing.'],
    domain_projection: {
      managed_temporal_state_consistency: {
        surface_kind: 'managed_temporal_state_consistency',
        projection_status: 'ready',
        provider_kind: 'temporal',
        service_status: 'ready',
        worker_status: 'ready',
        address: 'redcube-managed-temporal.example.test:7233',
        namespace: 'default',
        task_queue: 'opl-stage-attempts',
        source_refs: ['redcube://runtime/managed_temporal_state_consistency/latest.json'],
      },
    },
  };

  const recentManifest = structuredClone(fixtures.medautogrant);
  recentManifest.product_entry_manifest = {
    ...((recentManifest.product_entry_manifest as Record<string, unknown>) ?? {}),
    task_lifecycle: {
      ...(((recentManifest.product_entry_manifest as Record<string, unknown>)?.task_lifecycle as Record<string, unknown>) ?? {}),
      status: 'completed',
      task_id: 'mag-completed-route',
      task_kind: 'grant_authoring_loop',
      session_id: null,
      run_id: null,
      summary: 'MAG critique route completed and is ready for archive review.',
      human_gate_ids: [],
    },
    progress_projection: {
      ...(((recentManifest.product_entry_manifest as Record<string, unknown>)?.progress_projection as Record<string, unknown>) ?? {}),
      current_status: 'completed',
      runtime_status: 'ready',
      session_id: null,
      headline: 'MAG critique route completed and is ready for archive review.',
      attention_items: [],
      human_gate_ids: [],
    },
  };

    bindWorkspaceProject('medautoscience', masPack.repoDir, masPack.manifest, stateRoot, fixtureContractsRoot);
    bindWorkspaceProject('redcube', path.join(workspaceRoot, 'redcube'), attentionManifest, stateRoot, fixtureContractsRoot);
    bindWorkspaceProject('medautogrant', path.join(workspaceRoot, 'mag'), recentManifest, stateRoot, fixtureContractsRoot);
    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    });
    const snapshot = output.runtime_tray_snapshot;
    const allItems = [...snapshot.running_items, ...snapshot.attention_items, ...snapshot.recent_items];

    assertPathValues(snapshot, [
      ['schema_version', 'runtime_tray_snapshot.v1'],
      ['runtime_health.status', 'offline'],
      ['runtime_health.provider_kind', 'temporal'],
      ['running_items.length', 1],
      ['running_items.0.project_id', 'medautoscience'],
      ['running_items.0.runtime_owner', 'provider_backed_family_runtime'],
      ['running_items.0.action_owner', 'none'],
      ['running_items.0.requires_user_action', false],
      ['running_items.0.action_kind', 'running'],
      ['attention_items.length', 2],
      ['recent_items.length', 0],
      ['action_counts', { user: 1, opl: 0, infrastructure: 1 }],
      ['managed_domain_provider_states.surface_kind', 'opl_runtime_tray_managed_domain_provider_states'],
      ['managed_domain_provider_states.role', 'app_status_read_model_only'],
      ['managed_domain_provider_states.domains.medautoscience.role', 'read_only_status_projection'],
      ['managed_domain_provider_states.domains.medautoscience.managed_temporal_state_consistency.address', 'mas-managed-temporal.example.test:7233'],
      ['managed_domain_provider_states.domains.redcube.managed_temporal_state_consistency.address', 'redcube-managed-temporal.example.test:7233'],
      ['managed_domain_provider_states.managed_domain_projection_summary.status', 'conflicted'],
      ['managed_domain_provider_states.managed_domain_projection_summary.domain_count', 2],
      ['managed_domain_provider_states.managed_domain_projection_summary.managed_temporal_domain_count', 2],
      ['managed_domain_provider_states.managed_domain_projection_summary.conflict_count', 1],
      ['managed_domain_provider_states.managed_domain_projection_summary.managed_temporal_state_consistency_declared', true],
      ['managed_domain_provider_states.domains.medautoscience.authority_boundary.can_write_domain_truth', false],
      ['managed_domain_provider_states.domains.medautoscience.authority_boundary.can_authorize_quality_verdict', false],
      ['managed_domain_provider_states.authority_boundary.can_authorize_domain_ready', false],
      ['daemon_policy.local_daemon_added', false],
      ['daemon_policy.runtime_kernel_owner', 'provider_backed_family_runtime'],
    ]);
    const redcubeAttentionItem = findItem(snapshot.attention_items, 'project_id', 'redcube');
    assertPathValues(redcubeAttentionItem, [
      ['action_owner', 'user'],
      ['requires_user_action', true],
      ['action_kind', 'human_gate'],
    ]);
    assert.equal(redcubeAttentionItem.source_refs.some((ref: { ref: string }) => ref.ref === '/progress_projection/attention_items'), true);
    const providerProofItem = findItem(snapshot.attention_items, 'item_id', 'opl:provider-continuous-proof:temporal');
    assertPathValues(providerProofItem, [
      ['action_owner', 'infrastructure'],
      ['provider_continuous_proof.continuous_proof_status', 'no_proof_observed'],
    ]);
    assert.equal(allItems.some((item: { project_id: string }) => item.project_id === 'medautogrant'), false);
    assert.equal(
      snapshot.source_refs.some((ref: { role: string }) => ref.role === 'managed_domain_provider_projection'),
      true,
    );
});

test('runtime snapshot keeps demo and descriptor-only domain manifests out of current tray lanes', (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-descriptor-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-descriptor-workspace-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  t.after(() => removeTempRoots(stateRoot, workspaceRoot, fixtureRoot));
  fs.mkdirSync(path.join(workspaceRoot, 'mag', 'examples'), { recursive: true });
  fs.mkdirSync(path.join(workspaceRoot, 'redcube'), { recursive: true });
  const demoGrantPath = path.join(workspaceRoot, 'mag', 'examples', 'nsfc_workspace_p2c_critique.json');
  fs.writeFileSync(demoGrantPath, '{}\n');

  const magDemoManifest = structuredClone(fixtures.medautogrant);
  magDemoManifest.product_entry_manifest = {
    ...((magDemoManifest.product_entry_manifest as Record<string, unknown>) ?? {}),
    workspace_locator: {
      workspace_surface_kind: 'nsfc_workspace',
      workspace_root: demoGrantPath,
      workspace_path: demoGrantPath,
    },
    task_lifecycle: {
      ...(((magDemoManifest.product_entry_manifest as Record<string, unknown>)?.task_lifecycle as Record<string, unknown>) ?? {}),
      task_id: 'nsfc-demo-001:draft-v1',
      status: 'forward_progress',
      session_id: 'grant-run-nsfc-demo-001-baseline-001',
      run_id: 'grant-run-nsfc-demo-001-baseline-001',
      human_gate_ids: ['mag_route_gate_revision'],
    },
    progress_projection: {
      ...(((magDemoManifest.product_entry_manifest as Record<string, unknown>)?.progress_projection as Record<string, unknown>) ?? {}),
      current_status: 'critique',
      runtime_status: 'healthy',
      session_id: 'grant-run-nsfc-demo-001-baseline-001',
      attention_items: ['demo critique residue'],
      human_gate_ids: ['mag_route_gate_revision'],
    },
  };

  const redcubeDescriptorManifest = structuredClone(fixtures.redcube);

    bindWorkspaceProject('medautogrant', path.join(workspaceRoot, 'mag'), magDemoManifest, stateRoot, fixtureContractsRoot);
    bindWorkspaceProject('redcube', path.join(workspaceRoot, 'redcube'), redcubeDescriptorManifest, stateRoot, fixtureContractsRoot);
    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    });
    const snapshot = output.runtime_tray_snapshot;
    const allItems = [...snapshot.running_items, ...snapshot.attention_items, ...snapshot.recent_items];

    assert.equal(allItems.some((item: { project_id: string }) => item.project_id === 'medautogrant'), false);
    assert.equal(allItems.some((item: { project_id: string }) => item.project_id === 'redcube'), false);
    assertPathValues(snapshot, [
      ['attention_items.length', 1],
      ['attention_items.0.item_id', 'opl:provider-continuous-proof:temporal'],
    ]);
});

test('runtime snapshot ignores retired Hermes cron residue', (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-cron-state-'));
  const hermesHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-cron-home-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  t.after(() => removeTempRoots(stateRoot, hermesHome, fixtureRoot));
  const jobsPath = path.join(hermesHome, 'cron', 'jobs.json');
  fs.mkdirSync(path.dirname(jobsPath), { recursive: true });
  writeJsonFile(
    jobsPath,
    {
      jobs: [
        {
          id: 'cron-attention',
          name: 'medautoscience-supervision-dm-cvd-mortality-risk-b8331468',
          script: 'med-autoscience/dm-cvd-mortality-risk-b8331468/watch_runtime_tick.py',
          enabled: true,
          state: 'scheduled',
          last_status: 'error',
        },
      ],
    },
  );

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      HERMES_HOME: hermesHome,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const snapshot = output.runtime_tray_snapshot;
    const allItems = [...snapshot.attention_items, ...snapshot.running_items, ...snapshot.recent_items];

    assert.equal(snapshot.runtime_health.provider_kind, 'temporal');
    assert.equal(allItems.some((item: { item_id: string }) => item.item_id.includes('hermes-cron')), false);
    assert.equal(snapshot.source_refs.some((ref: { role: string }) => ref.role === 'hermes_cron_projection'), false);
    assert.equal(snapshot.attention_items.some((item: { item_id: string }) => item.item_id === 'opl:provider-continuous-proof:temporal'), true);
});

test('runtime snapshot keeps MAS manifest projections non-authoritative without scanning study artifacts', (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-study-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-mas-workspace-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  t.after(() => removeTempRoots(stateRoot, workspaceRoot, fixtureRoot));
  const manifest = structuredClone(fixtures.medautoscience);

  manifest.task_lifecycle = {
    ...(manifest.task_lifecycle as Record<string, unknown>),
    status: 'running',
    session_id: 'mas-manifest-only-session',
    run_id: 'mas-manifest-only-run',
    human_gate_ids: [],
    summary: 'Manifest-only runtime projection.',
  };
  manifest.progress_projection = {
    ...(manifest.progress_projection as Record<string, unknown>),
    current_status: 'in_progress',
    runtime_status: 'ready',
    session_id: 'mas-manifest-only-session',
    headline: 'Manifest-only runtime projection.',
    attention_items: [],
    human_gate_ids: [],
    domain_projection: {
      surface_kind: 'mas_progress_projection',
      source_refs: ['mas://runtime/projection/latest.json'],
    },
  };

    bindWorkspaceProject('medautoscience', workspaceRoot, manifest, stateRoot, fixtureContractsRoot);
    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const snapshot = output.runtime_tray_snapshot;
    const allItems = [...snapshot.attention_items, ...snapshot.running_items, ...snapshot.recent_items];
    const projection = snapshot.domain_projection_ingestion;
    const masItem = findItem(snapshot.running_items, 'project_id', 'medautoscience');

    assert.equal(fs.existsSync(path.join(workspaceRoot, 'studies')), false);
    assertPathValues(snapshot, [
      ['runtime_health.status', 'offline'],
      ['running_items.length', 1],
      ['running_items.0.action_owner', 'none'],
      ['running_items.0.action_kind', 'running'],
      ['recent_items.length', 0],
    ]);
    assert.equal(masItem.item_id.startsWith('medautoscience:study:'), false);
    assert.equal(masItem.source_refs.some((ref: { role: string }) => ref.role === 'domain_manifest'), true);
    assert.equal(projection.summary.domain_count, 1);
    assert.equal(
      projection.items.some((item: { pointer: string; source_refs: string[] }) =>
        item.pointer === '/progress_projection/domain_projection'
          && item.source_refs.includes('mas://runtime/projection/latest.json')
      ),
      true,
    );
    assert.equal(projection.authority_boundary.can_read_domain_truth_body, false);
    assert.equal(projection.authority_boundary.can_write_domain_truth, false);
    assert.equal(projection.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(projection.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(projection.authority_boundary.can_authorize_export_verdict, false);
    assert.equal(projection.authority_boundary.can_mutate_domain_artifact, false);
    assert.equal(projection.authority_boundary.provider_completion_is_domain_ready, false);
    assert.equal(snapshot.attention_items.some((item: { item_id: string }) => item.item_id === 'opl:provider-continuous-proof:temporal'), true);
    assert.equal(allItems.some((item: { item_id: string }) => item.item_id.startsWith('medautoscience:study:')), false);
    assert.equal(snapshot.source_refs.some((ref: { role: string }) => ref.role === 'domain_projection_ingestion'), true);
});

test('runtime manager rejects retired Hermes legacy provider selection', () => {
  const failure = runCliFailure(['runtime', 'manager'], {
    OPL_FAMILY_RUNTIME_PROVIDER: 'hermes_legacy',
  });

  assert.equal(failure.status, 2);
  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.equal(failure.payload.error.details.provider_kind, 'hermes_legacy');
  assert.deepEqual(failure.payload.error.details.allowed_provider_kinds, [
    'temporal',
    'external_sandbox',
  ]);
});

test('runtime manager reports temporal provider code landed when live runtime is not configured', (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-temporal-state-'));
  t.after(() => removeTempRoots(stateRoot));

    const output = runTemporalRuntimeManager(stateRoot, path.join(stateRoot, 'missing-native-bin'), {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      OPL_MODULES_ROOT: path.join(stateRoot, 'modules'),
      PATH: '',
    });
    const reconcile = output.runtime_manager.reconcile;

    assert.equal(output.runtime_manager.status, 'provider_code_landed_unconfigured');
    assert.equal(reconcile.checked_surfaces.provider_runtime, 'provider_code_landed_unconfigured');
    const provider = output.runtime_manager.provider_runtime.providers.temporal;
    assert.equal(provider.status, 'provider_code_landed_unconfigured');
    assert.equal(provider.degraded_reason, 'temporal_runtime_not_configured');
    assert.equal(
      provider.details.adapter_mode,
      'provider_code_landed_unconfigured',
    );
});

test('runtime manager action dry-run plans repairs without mutating native index files', (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-action-dry-state-'));
  t.after(() => removeTempRoots(stateRoot));

    const output = runCli(['runtime', 'manager', 'action', '--dry-run'], {
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: path.join(stateRoot, 'missing-native-bin'),
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const action = output.runtime_manager_action;

    assert.equal(action.surface_kind, 'opl_runtime_manager_action');
    assert.equal(action.mode, 'dry_run');
    assert.equal(action.dry_run, true);
    assert.equal(action.after, null);
    assert.deepEqual(
      action.planned_actions.map((entry: { action_id: string; execution_status: string }) => [
        entry.action_id,
        entry.execution_status,
      ]),
      [
        ['configure_temporal_provider', 'not_executed'],
        ['repair_native_helpers', 'not_executed'],
        ['refresh_native_indexes', 'not_executed'],
      ],
    );
    assert.equal(action.before.reconcile.overall_status, 'attention_needed');
    assert.equal(fs.existsSync(path.join(stateRoot, 'runtime-manager', 'native-state-index.json')), false);
    assert.equal(fs.existsSync(path.join(stateRoot, 'runtime-manager', 'native-state-index-failures.jsonl')), false);
});

test('runtime manager action apply repairs available native surfaces without legacy provider actions', (t) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-action-apply-'));
  const stateRoot = path.join(fixtureRoot, 'state');
  const helperBinDir = path.join(fixtureRoot, 'native-bin');
  const repairScript = createNativeHelperRepairScript(fixtureRoot, helperBinDir);
  t.after(() => removeTempRoots(fixtureRoot));

    const output = runCli(['runtime', 'manager', 'action', '--apply'], {
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
      OPL_NATIVE_HELPER_REPAIR_COMMAND: repairScript,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const action = output.runtime_manager_action;

    assert.equal(action.mode, 'apply');
    assert.equal(action.dry_run, false);
    assert.equal(action.before.reconcile.checked_surfaces.provider_runtime, 'provider_code_landed_unconfigured');
    assert.equal(action.before.reconcile.checked_surfaces.hermes_legacy_runtime, undefined);
    assert.equal(action.after.reconcile.overall_status, 'attention_needed');
    assert.deepEqual(
      action.after.reconcile.recommended_actions.map((entry: { action_id: string }) => entry.action_id),
      ['configure_temporal_provider'],
    );
    assert.deepEqual(
      action.executed_actions.map((entry: { action_id: string; status: string }) => [
        entry.action_id,
        entry.status,
      ]),
      [
        ['configure_temporal_provider', 'blocked_manual_configuration_required'],
        ['repair_native_helpers', 'completed'],
        ['refresh_native_indexes', 'completed'],
      ],
    );
    assert.equal(action.after.native_helper_runtime.status, 'available');
    assert.equal(action.after.native_index_persistence.status, 'written');
    assert.equal(fs.existsSync(path.join(stateRoot, 'runtime-manager', 'native-state-index.json')), true);
});
