import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, parseJsonText, path, runCli, runCliFailure, test } from '../helpers.ts';

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

test('runtime manager reports stale and expired native index freshness from the last successful snapshot', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-stale-state-'));
  const helperBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-helper-bin-'));

  for (const binary of ['opl-doctor-native', 'opl-runtime-watch', 'opl-artifact-indexer', 'opl-state-indexer']) {
    fs.writeFileSync(
      path.join(helperBinDir, binary),
      `#!/bin/sh
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
`,
      { mode: 0o755 },
    );
  }

  try {
    const success = runCli(['runtime', 'manager'], {
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const successPersistence = success.runtime_manager.state_index_target.persistence;
    assert.equal(successPersistence.status, 'written');
    assert.equal(successPersistence.freshness.status, 'fresh');
    assert.equal(success.runtime_manager.reconcile.surface_kind, 'opl_runtime_manager_reconcile');
    assert.equal(success.runtime_manager.reconcile.overall_status, 'ready');
    assert.deepEqual(success.runtime_manager.reconcile.recommended_actions, []);

    const stale = runCli(['runtime', 'manager'], {
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: path.join(stateRoot, 'missing-native-bin'),
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
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
      stale.runtime_manager.reconcile.recommended_actions.map((action: { action_id: string }) => action.action_id),
      ['repair_native_helpers', 'refresh_native_indexes'],
    );

    const lastSuccess = parseJsonText(fs.readFileSync(successPersistence.last_success_file, 'utf8')) as any;
    lastSuccess.lifecycle.expires_at = '2000-01-01T00:00:00.000Z';
    fs.writeFileSync(successPersistence.last_success_file, `${JSON.stringify(lastSuccess, null, 2)}\n`);

    const expired = runCli(['runtime', 'manager'], {
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: path.join(stateRoot, 'missing-native-bin'),
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const expiredFreshness = expired.runtime_manager.state_index_target.persistence.freshness;
    assert.equal(expiredFreshness.status, 'expired_last_success');
    assert.equal(expiredFreshness.last_success_expired, true);
    assert.equal(expiredFreshness.failure_count, 2);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(helperBinDir, { recursive: true, force: true });
  }
});

test('runtime manager records structured native index diff and history GC reporting', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-index-gc-state-'));
  const helperBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-helper-index-gc-bin-'));
  const runtimeDir = path.join(stateRoot, 'runtime-manager');
  fs.mkdirSync(runtimeDir, { recursive: true });
  writeRuntimeManagerNativeHelpers(helperBinDir);

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
  fs.writeFileSync(
    path.join(runtimeDir, 'native-state-index.json'),
    `${JSON.stringify({
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
    }, null, 2)}\n`,
  );

  try {
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
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(helperBinDir, { recursive: true, force: true });
  }
});

test('runtime snapshot projects active domain manifests into tray lanes without owning runtime truth', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-workspace-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
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
      legacy_retirement_tombstone_proof: {
        surface_kind: 'legacy_retirement_tombstone_proof',
        status: 'no_active_default_caller_proven',
        active_default_callers: [],
        source_refs: ['mas://runtime/legacy_retirement_tombstone_proof/latest.json'],
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

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      path.join(workspaceRoot, 'mas'),
      '--manifest-command',
      buildManifestCommand(runningManifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      path.join(workspaceRoot, 'redcube'),
      '--manifest-command',
      buildManifestCommand(attentionManifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautogrant',
      '--path',
      path.join(workspaceRoot, 'mag'),
      '--manifest-command',
      buildManifestCommand(recentManifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const snapshot = output.runtime_tray_snapshot;
    const allItems = [...snapshot.running_items, ...snapshot.attention_items, ...snapshot.recent_items];

    assert.equal(snapshot.schema_version, 'runtime_tray_snapshot.v1');
    assert.equal(snapshot.runtime_health.status, 'needs_attention');
    assert.equal(snapshot.runtime_health.label, '需用户处理');
    assert.equal(snapshot.runtime_health.provider_kind, 'temporal');
    assert.equal(snapshot.running_items.length, 1);
    assert.equal(snapshot.running_items[0].project_id, 'medautoscience');
    assert.equal(snapshot.running_items[0].runtime_owner, 'provider_backed_family_runtime');
    assert.equal(snapshot.running_items[0].action_owner, 'none');
    assert.equal(snapshot.running_items[0].requires_user_action, false);
    assert.equal(snapshot.running_items[0].action_kind, 'running');
    assert.equal(snapshot.attention_items.length, 2);
    const redcubeAttentionItem = snapshot.attention_items.find((item: { project_id: string }) => item.project_id === 'redcube');
    assert.equal(redcubeAttentionItem.action_owner, 'user');
    assert.equal(redcubeAttentionItem.requires_user_action, true);
    assert.equal(redcubeAttentionItem.action_kind, 'human_gate');
    assert.equal(redcubeAttentionItem.source_refs.some((ref: { ref: string }) => ref.ref === '/progress_projection/attention_items'), true);
    const providerProofItem = snapshot.attention_items.find((item: { item_id: string }) => item.item_id === 'opl:provider-continuous-proof:temporal');
    assert.equal(providerProofItem.action_owner, 'infrastructure');
    assert.equal(providerProofItem.provider_continuous_proof.continuous_proof_status, 'no_proof_observed');
    assert.equal(snapshot.recent_items.length, 0);
    assert.equal(allItems.some((item: { project_id: string }) => item.project_id === 'medautogrant'), false);
    assert.deepEqual(snapshot.action_counts, { user: 1, opl: 0, infrastructure: 1 });
    assert.equal(
      snapshot.managed_domain_provider_states.surface_kind,
      'opl_runtime_tray_managed_domain_provider_states',
    );
    assert.equal(snapshot.managed_domain_provider_states.role, 'app_status_read_model_only');
    assert.equal(snapshot.managed_domain_provider_states.medautoscience.role, 'read_only_status_projection');
    assert.equal(
      snapshot.managed_domain_provider_states.medautoscience.managed_temporal_state_consistency.address,
      'mas-managed-temporal.example.test:7233',
    );
    assert.equal(
      snapshot.managed_domain_provider_states.medautoscience.legacy_retirement_tombstone_proof.status,
      'no_active_default_caller_proven',
    );
    assert.equal(
      snapshot.managed_domain_provider_states.managed_domain_projection_summary.managed_temporal_state_consistency_declared,
      true,
    );
    assert.equal(
      snapshot.managed_domain_provider_states.managed_domain_projection_summary.family_stage_control_plane_declared,
      true,
    );
    assert.equal(
      snapshot.managed_domain_provider_states.managed_domain_projection_summary.domain_memory_descriptor_declared,
      false,
    );
    assert.equal(
      snapshot.managed_domain_provider_states.managed_domain_projection_summary.owner_receipt_contract_declared,
      false,
    );
    assert.equal(
      snapshot.managed_domain_provider_states.managed_domain_projection_summary.legacy_retirement_tombstone_declared,
      true,
    );
    assert.equal(
      snapshot.managed_domain_provider_states.medautoscience.authority_boundary.can_write_domain_truth,
      false,
    );
    assert.equal(
      snapshot.managed_domain_provider_states.medautoscience.authority_boundary.can_authorize_publication_quality,
      false,
    );
    assert.equal(snapshot.managed_domain_provider_states.authority_boundary.can_authorize_submission_readiness, false);
    assert.equal(
      snapshot.source_refs.some((ref: { role: string }) => ref.role === 'managed_domain_provider_projection'),
      true,
    );
    assert.equal(snapshot.daemon_policy.local_daemon_added, false);
    assert.equal(snapshot.daemon_policy.runtime_kernel_owner, 'provider_backed_family_runtime');
    assert.equal(typeof snapshot.daemon_policy.sidecar_promotion_gate, 'string');
    assert.equal(snapshot.daemon_policy.sidecar_promotion_gate.includes('task'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot keeps demo and descriptor-only domain manifests out of current tray lanes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-descriptor-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-descriptor-workspace-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
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

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautogrant',
      '--path',
      path.join(workspaceRoot, 'mag'),
      '--manifest-command',
      buildManifestCommand(magDemoManifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      path.join(workspaceRoot, 'redcube'),
      '--manifest-command',
      buildManifestCommand(redcubeDescriptorManifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const snapshot = output.runtime_tray_snapshot;
    const allItems = [...snapshot.running_items, ...snapshot.attention_items, ...snapshot.recent_items];

    assert.equal(allItems.some((item: { project_id: string }) => item.project_id === 'medautogrant'), false);
    assert.equal(allItems.some((item: { project_id: string }) => item.project_id === 'redcube'), false);
    assert.equal(snapshot.attention_items.length, 1);
    assert.equal(snapshot.attention_items[0].item_id, 'opl:provider-continuous-proof:temporal');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot ignores retired Hermes cron residue', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-cron-state-'));
  const hermesHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-cron-home-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const jobsPath = path.join(hermesHome, 'cron', 'jobs.json');
  fs.mkdirSync(path.dirname(jobsPath), { recursive: true });
  fs.writeFileSync(
    jobsPath,
    `${JSON.stringify({
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
    }, null, 2)}\n`,
  );

  try {
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
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(hermesHome, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot projects MAS live study artifacts from domain manifest workspace locator', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-study-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-mas-workspace-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const profileDir = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles');
  const profilePath = path.join(profileDir, 'dm.workspace.toml');
  const manifest = structuredClone(fixtures.medautoscience);

  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(profilePath, 'workspace_name = "dm"\n');
  manifest.workspace_locator = {
    ...((manifest.workspace_locator as Record<string, unknown>) ?? {}),
    workspace_root: workspaceRoot,
    profile_ref: profilePath,
    profile_name: 'dm',
  };

  const writeStudy = (
    studyId: string,
    input: {
      activeRunId: string | null;
      healthStatus: string;
      questStatus: string;
      runtimeDecision: string;
      recoveryActionMode: string;
      currentRequiredAction: string;
      publicationVerdict: string;
      needsHumanIntervention?: boolean;
    },
  ) => {
    const studyRoot = path.join(workspaceRoot, 'studies', studyId);
    const runtimeDir = path.join(studyRoot, 'artifacts', 'runtime');
    fs.mkdirSync(path.join(runtimeDir, 'runtime_supervision'), { recursive: true });
    fs.mkdirSync(path.join(studyRoot, 'artifacts', 'controller_decisions'), { recursive: true });
    fs.mkdirSync(path.join(studyRoot, 'artifacts', 'publication_eval'), { recursive: true });
    fs.writeFileSync(
      path.join(runtimeDir, 'runtime_status_summary.json'),
      `${JSON.stringify({
        study_id: studyId,
        generated_at: '2026-04-29T12:00:00+00:00',
        health_status: input.healthStatus,
        runtime_decision: input.runtimeDecision,
        recovery_action_mode: input.recoveryActionMode,
        current_required_action: input.currentRequiredAction,
        status_summary: 'Managed runtime is live.',
        next_action_summary: 'Continue supervision.',
        needs_human_intervention: input.needsHumanIntervention ?? false,
        supervisor_tick_status: 'fresh',
      }, null, 2)}\n`,
    );
    fs.writeFileSync(
      path.join(runtimeDir, 'runtime_supervision', 'latest.json'),
      `${JSON.stringify({
        study_id: studyId,
        recorded_at: '2026-04-29T12:00:00+00:00',
        quest_status: input.questStatus,
        active_run_id: input.activeRunId,
        health_status: input.healthStatus,
        runtime_decision: input.runtimeDecision,
        next_action_summary: 'Continue supervision.',
        needs_human_intervention: input.needsHumanIntervention ?? false,
        worker_running: Boolean(input.activeRunId),
      }, null, 2)}\n`,
    );
    fs.writeFileSync(
      path.join(studyRoot, 'artifacts', 'controller_decisions', 'latest.json'),
      `${JSON.stringify({
        study_id: studyId,
        emitted_at: '2026-04-29T12:00:00+00:00',
        decision_type: 'bounded_analysis',
        route_target: 'analysis-campaign',
        route_key_question: 'close current evidence gaps',
        reason: 'Continue same-line quality repair.',
        requires_human_confirmation: false,
      }, null, 2)}\n`,
    );
    fs.writeFileSync(
      path.join(studyRoot, 'artifacts', 'publication_eval', 'latest.json'),
      `${JSON.stringify({
        study_id: studyId,
        emitted_at: '2026-04-29T12:00:00+00:00',
        verdict: {
          overall_verdict: input.publicationVerdict,
          summary: 'publication quality gate summary',
        },
        gaps: [{ summary: 'stale_submission_minimal_authority' }],
        recommended_actions: [{ reason: 'refresh the current delivery bundle' }],
      }, null, 2)}\n`,
    );
  };

  writeStudy('002-dm-china-us-mortality-attribution', {
    activeRunId: 'run-002',
    healthStatus: 'live',
    questStatus: 'running',
    runtimeDecision: 'noop',
    recoveryActionMode: 'inspect_progress',
    currentRequiredAction: 'supervise_managed_runtime',
    publicationVerdict: 'blocked',
  });
  writeStudy('003-dpcc-primary-care-phenotype-treatment-gap', {
    activeRunId: 'run-003',
    healthStatus: 'live',
    questStatus: 'running',
    runtimeDecision: 'noop',
    recoveryActionMode: 'inspect_progress',
    currentRequiredAction: 'supervise_managed_runtime',
    publicationVerdict: 'pass',
  });
  writeStudy('004-invasive-architecture', {
    activeRunId: null,
    healthStatus: 'inactive',
    questStatus: 'stopped',
    runtimeDecision: 'blocked',
    recoveryActionMode: 'auto_runtime_parked',
    currentRequiredAction: 'stop_runtime',
    publicationVerdict: 'blocked',
  });
  writeStudy('005-package-ready-handoff', {
    activeRunId: null,
    healthStatus: 'escalated',
    questStatus: 'active',
    runtimeDecision: 'blocked',
    recoveryActionMode: 'auto_runtime_parked',
    currentRequiredAction: 'continue_bundle_stage',
    publicationVerdict: 'blocked',
    needsHumanIntervention: true,
  });

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      workspaceRoot,
      '--manifest-command',
      buildManifestCommand(manifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const snapshot = output.runtime_tray_snapshot;
    const allItems = [...snapshot.attention_items, ...snapshot.running_items, ...snapshot.recent_items];

    assert.equal(snapshot.runtime_health.status, 'needs_attention');
    assert.equal(snapshot.runtime_health.label, '需用户处理');
    assert.equal(snapshot.attention_items.length, 2);
    const dm002Item = snapshot.attention_items.find((item: { item_id: string }) => item.item_id === 'medautoscience:study:002-dm-china-us-mortality-attribution');
    assert.equal(dm002Item.active_run_id, 'run-002');
    assert.equal(dm002Item.status_label, '运行中：分析补充');
    assert.equal(dm002Item.action_owner, 'opl');
    assert.equal(dm002Item.requires_user_action, false);
    assert.equal(dm002Item.action_kind, 'publication_gate');
    assert.equal(dm002Item.action_summary, '论文质量或交付检查未关闭；当前阶段：分析补充。');
    assert.equal(dm002Item.next_action_summary, '建议阶段：分析补充；目标：补齐证据一致性。');
    assert.equal(dm002Item.blockers.includes('投稿包投影需要刷新。'), true);
    assert.equal(dm002Item.recommended_commands[0].surface_kind, 'study_progress');
    assert.equal(
      dm002Item.recommended_commands[0].command,
      `uv run python -m med_autoscience.cli study progress --profile ${profilePath} --study-id 002-dm-china-us-mortality-attribution --format json`,
    );
    assert.equal(dm002Item.recommended_commands.length, 1);
    assert.doesNotMatch(JSON.stringify(dm002Item.recommended_commands), /progress-projection/);
    assert.equal(snapshot.attention_items.some((item: { item_id: string }) => item.item_id === 'opl:provider-continuous-proof:temporal'), true);
    assert.equal(snapshot.running_items.length, 1);
    assert.equal(snapshot.running_items[0].item_id, 'medautoscience:study:003-dpcc-primary-care-phenotype-treatment-gap');
    assert.equal(snapshot.running_items[0].action_owner, 'none');
    assert.equal(snapshot.running_items[0].action_kind, 'running');
    assert.equal(allItems.some((item: { item_id: string }) => item.item_id.includes('004-invasive-architecture')), false);
    assert.equal(snapshot.recent_items.length, 1);
    assert.equal(snapshot.recent_items[0].item_id, 'medautoscience:study:005-package-ready-handoff');
    assert.equal(snapshot.recent_items[0].status_label, '已暂停：等待确认');
    assert.equal(snapshot.recent_items[0].action_owner, 'user');
    assert.equal(snapshot.recent_items[0].requires_user_action, true);
    assert.equal(snapshot.recent_items[0].action_kind, 'handoff_review');
    assert.deepEqual(snapshot.recent_items[0].blockers, []);
    assert.deepEqual(snapshot.action_counts, { user: 1, opl: 1, infrastructure: 1 });
    assert.equal(snapshot.source_refs.some((ref: { role: string }) => ref.role === 'runtime_projection'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

function writeRuntimeManagerNativeHelpers(helperBinDir: string) {
  for (const binary of ['opl-doctor-native', 'opl-runtime-watch', 'opl-artifact-indexer', 'opl-state-indexer']) {
    fs.writeFileSync(
      path.join(helperBinDir, binary),
      `#!/bin/sh
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
`,
      { mode: 0o755 },
    );
  }
}

test('runtime manager rejects retired Hermes legacy provider selection', () => {
  const failure = runCliFailure(['runtime', 'manager'], {
    OPL_FAMILY_RUNTIME_PROVIDER: 'hermes_legacy',
  });

  assert.equal(failure.status, 2);
  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.equal(failure.payload.error.details.provider_kind, 'hermes_legacy');
  assert.deepEqual(failure.payload.error.details.allowed_provider_kinds, [
    'temporal',
    'temporal',
    'external_sandbox',
  ]);
});

test('runtime manager reports temporal provider code landed when live runtime is not configured', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-temporal-state-'));

  try {
    const output = runCli(['runtime', 'manager'], {
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: path.join(stateRoot, 'missing-native-bin'),
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
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
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime manager action dry-run plans repairs without mutating native index files', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-action-dry-state-'));

  try {
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
        ['repair_native_helpers', 'not_executed'],
        ['refresh_native_indexes', 'not_executed'],
      ],
    );
    assert.equal(action.before.reconcile.overall_status, 'attention_needed');
    assert.match(action.note, /did not run native helper repair/);
    assert.equal(fs.existsSync(path.join(stateRoot, 'runtime-manager', 'native-state-index.json')), false);
    assert.equal(fs.existsSync(path.join(stateRoot, 'runtime-manager', 'native-state-index-failures.jsonl')), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime manager action apply repairs available native surfaces without legacy provider actions', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-action-apply-'));
  const stateRoot = path.join(fixtureRoot, 'state');
  const helperBinDir = path.join(fixtureRoot, 'native-bin');
  const repairScript = createNativeHelperRepairScript(fixtureRoot, helperBinDir);

  try {
    const output = runCli(['runtime', 'manager', 'action', '--apply'], {
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
      OPL_NATIVE_HELPER_REPAIR_COMMAND: repairScript,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const action = output.runtime_manager_action;

    assert.equal(action.mode, 'apply');
    assert.equal(action.dry_run, false);
    assert.equal(action.before.reconcile.checked_surfaces.provider_runtime, 'ready');
    assert.equal(action.before.reconcile.checked_surfaces.hermes_legacy_runtime, undefined);
    assert.equal(action.after.reconcile.overall_status, 'ready');
    assert.deepEqual(action.after.reconcile.recommended_actions, []);
    assert.deepEqual(
      action.executed_actions.map((entry: { action_id: string; status: string }) => [
        entry.action_id,
        entry.status,
      ]),
      [
        ['repair_native_helpers', 'completed'],
        ['refresh_native_indexes', 'completed'],
      ],
    );
    assert.equal(action.after.native_helper_runtime.status, 'available');
    assert.equal(action.after.native_index_persistence.status, 'written');
    assert.equal(fs.existsSync(path.join(stateRoot, 'runtime-manager', 'native-state-index.json')), true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
