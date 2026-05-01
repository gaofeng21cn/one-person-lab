import { assert, buildManifestCommand, createFakeHermesFixture, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, runCli, test } from '../helpers.ts';

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
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  echo "Gateway service is loaded"
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
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
      OPL_HERMES_BIN: hermesPath,
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
    });
    const successPersistence = success.runtime_manager.state_index_target.persistence;
    assert.equal(successPersistence.status, 'written');
    assert.equal(successPersistence.freshness.status, 'fresh');
    assert.equal(success.runtime_manager.reconcile.surface_kind, 'opl_runtime_manager_reconcile');
    assert.equal(success.runtime_manager.reconcile.overall_status, 'ready');
    assert.deepEqual(success.runtime_manager.reconcile.recommended_actions, []);

    const stale = runCli(['runtime', 'manager'], {
      OPL_HERMES_BIN: hermesPath,
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: path.join(stateRoot, 'missing-native-bin'),
    });
    const staleFreshness = stale.runtime_manager.state_index_target.persistence.freshness;
    assert.equal(stale.runtime_manager.state_index_target.persistence.status, 'skipped_helper_unavailable');
    assert.equal(staleFreshness.status, 'stale_last_success_available');
    assert.equal(staleFreshness.last_success_expired, false);
    assert.equal(staleFreshness.failure_count, 1);
    const failureLines = fs.readFileSync(successPersistence.failure_file, 'utf8').trim().split('\n');
    const failure = JSON.parse(failureLines[failureLines.length - 1]);
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

    const lastSuccess = JSON.parse(fs.readFileSync(successPersistence.last_success_file, 'utf8'));
    lastSuccess.lifecycle.expires_at = '2000-01-01T00:00:00.000Z';
    fs.writeFileSync(successPersistence.last_success_file, `${JSON.stringify(lastSuccess, null, 2)}\n`);

    const expired = runCli(['runtime', 'manager'], {
      OPL_HERMES_BIN: hermesPath,
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: path.join(stateRoot, 'missing-native-bin'),
    });
    const expiredFreshness = expired.runtime_manager.state_index_target.persistence.freshness;
    assert.equal(expiredFreshness.status, 'expired_last_success');
    assert.equal(expiredFreshness.last_success_expired, true);
    assert.equal(expiredFreshness.failure_count, 2);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(helperBinDir, { recursive: true, force: true });
  }
});

test('runtime manager records structured native index diff and history GC reporting', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  echo "Gateway service is loaded"
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
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
      OPL_HERMES_BIN: hermesPath,
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
    const latestHistoryEntry = JSON.parse(historyLines[historyLines.length - 1]);
    assert.deepEqual(latestHistoryEntry.gc, persistence.gc);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(helperBinDir, { recursive: true, force: true });
  }
});

test('runtime snapshot projects active domain manifests into tray lanes without owning runtime truth', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-workspace-'));
  const hermesHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-hermes-home-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  fs.mkdirSync(path.join(workspaceRoot, 'mas'), { recursive: true });
  fs.mkdirSync(path.join(workspaceRoot, 'redcube'), { recursive: true });
  fs.mkdirSync(path.join(workspaceRoot, 'mag'), { recursive: true });
  const { fixtureRoot: hermesFixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  echo "Gateway service is loaded"
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  const runningManifest = structuredClone(fixtures.medautoscience);
  runningManifest.task_lifecycle = {
    ...(runningManifest.task_lifecycle as Record<string, unknown>),
    status: 'running',
    human_gate_ids: [],
    summary: 'MAS study runtime is actively processing the current study.',
  };
  runningManifest.progress_projection = {
    ...(runningManifest.progress_projection as Record<string, unknown>),
    current_status: 'in_progress',
    runtime_status: 'ready',
    headline: 'MAS study runtime is actively processing the current study.',
    attention_items: [],
    human_gate_ids: [],
  };
  runningManifest.product_entry_start = {
    ...(runningManifest.product_entry_start as Record<string, unknown>),
    human_gate_ids: [],
  };

  const attentionManifest = structuredClone(fixtures.redcube);
  attentionManifest.task_lifecycle = {
    ...(attentionManifest.task_lifecycle as Record<string, unknown>),
    status: 'operator_review_requested',
    human_gate_ids: ['redcube_operator_review_gate'],
    summary: 'RCA deliverable loop is waiting for operator review.',
  };
  attentionManifest.progress_projection = {
    ...(attentionManifest.progress_projection as Record<string, unknown>),
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
      summary: 'MAG critique route completed and is ready for archive review.',
      human_gate_ids: [],
    },
    progress_projection: {
      ...(((recentManifest.product_entry_manifest as Record<string, unknown>)?.progress_projection as Record<string, unknown>) ?? {}),
      current_status: 'completed',
      runtime_status: 'ready',
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
      OPL_HERMES_BIN: hermesPath,
      HERMES_HOME: hermesHome,
    });
    const snapshot = output.runtime_tray_snapshot;

    assert.equal(snapshot.schema_version, 'runtime_tray_snapshot.v1');
    assert.equal(snapshot.runtime_health.status, 'needs_attention');
    assert.equal(snapshot.runtime_health.label, '需用户处理');
    assert.equal(snapshot.running_items.length, 1);
    assert.equal(snapshot.running_items[0].project_id, 'medautoscience');
    assert.equal(snapshot.running_items[0].runtime_owner, 'upstream_hermes_agent');
    assert.equal(snapshot.running_items[0].action_owner, 'none');
    assert.equal(snapshot.running_items[0].requires_user_action, false);
    assert.equal(snapshot.running_items[0].action_kind, 'running');
    assert.equal(snapshot.attention_items.length, 1);
    assert.equal(snapshot.attention_items[0].project_id, 'redcube');
    assert.equal(snapshot.attention_items[0].action_owner, 'user');
    assert.equal(snapshot.attention_items[0].requires_user_action, true);
    assert.equal(snapshot.attention_items[0].action_kind, 'human_gate');
    assert.equal(snapshot.attention_items[0].source_refs.some((ref: { ref: string }) => ref.ref === '/progress_projection/attention_items'), true);
    assert.equal(snapshot.recent_items.length, 1);
    assert.equal(snapshot.recent_items[0].project_id, 'medautogrant');
    assert.equal(snapshot.recent_items[0].action_owner, 'none');
    assert.deepEqual(snapshot.action_counts, { user: 1, opl: 0, infrastructure: 0 });
    assert.deepEqual(snapshot.daemon_policy, {
      local_daemon_added: false,
      runtime_kernel_owner: 'upstream_hermes_agent',
      sidecar_promotion_gate:
        'Only promote beyond a thin manager if Hermes cannot express required task, wakeup, approval, audit, or product isolation contracts.',
    });
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(hermesHome, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(hermesFixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot projects Hermes-hosted MAS cron failures as infrastructure attention', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-cron-state-'));
  const hermesHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-cron-home-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const { fixtureRoot: hermesFixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  echo "Gateway service is loaded"
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const jobsPath = path.join(hermesHome, 'cron', 'jobs.json');
  fs.mkdirSync(path.dirname(jobsPath), { recursive: true });
  fs.mkdirSync(path.join(hermesHome, 'cron', 'output', 'cron-running'), { recursive: true });
  fs.mkdirSync(path.join(hermesHome, 'cron', 'output', 'cron-attention'), { recursive: true });
  fs.writeFileSync(
    path.join(hermesHome, 'cron', 'output', 'cron-running', '2026-04-29_20-00-00.md'),
    '# Cron Job: medautoscience-supervision-nfpitnet\n\n## Response\n\n[SILENT]\n',
  );
  fs.writeFileSync(
    path.join(hermesHome, 'cron', 'output', 'cron-attention', '2026-04-29_20-05-00.md'),
    '# Cron Job: medautoscience-supervision-dm-cvd\n\n## Script Error\nScript timed out after 120s\n',
  );
  fs.writeFileSync(
    jobsPath,
    `${JSON.stringify({
      jobs: [
        {
          id: 'cron-running',
          name: 'medautoscience-supervision-nfpitnet-be4c006a',
          script: 'med-autoscience/nfpitnet-be4c006a/watch_runtime_tick.py',
          schedule_display: 'every 5m',
          enabled: true,
          state: 'scheduled',
          next_run_at: '2026-04-29T20:05:00+08:00',
          last_run_at: '2026-04-29T20:00:00+08:00',
          last_status: 'ok',
        },
        {
          id: 'cron-attention',
          name: 'medautoscience-supervision-dm-cvd-mortality-risk-b8331468',
          script: 'med-autoscience/dm-cvd-mortality-risk-b8331468/watch_runtime_tick.py',
          schedule_display: 'every 5m',
          enabled: true,
          state: 'scheduled',
          next_run_at: '2026-04-29T20:10:00+08:00',
          last_run_at: '2026-04-29T20:05:00+08:00',
          last_status: 'ok',
        },
        {
          id: 'non-mas',
          name: 'daily-housekeeping',
          script: 'ops/housekeeping.py',
          enabled: true,
          state: 'scheduled',
        },
      ],
    }, null, 2)}\n`,
  );

  try {
    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_HERMES_BIN: hermesPath,
      HERMES_HOME: hermesHome,
    });
    const snapshot = output.runtime_tray_snapshot;

    assert.equal(snapshot.runtime_health.status, 'running');
    assert.equal(snapshot.runtime_health.label, '运行中');
    assert.equal(snapshot.running_items.length, 0);
    assert.equal(snapshot.attention_items.length, 1);
    assert.equal(snapshot.attention_items[0].item_id, 'medautoscience:hermes-cron:cron-attention');
    assert.equal(snapshot.attention_items[0].project_label, 'MAS 基础设施');
    assert.equal(snapshot.attention_items[0].title, '工作区监督任务：dm-cvd-mortality-risk-b8331468');
    assert.equal(snapshot.attention_items[0].status_label, '后台监督超时');
    assert.equal(snapshot.attention_items[0].action_owner, 'infrastructure');
    assert.equal(snapshot.attention_items[0].requires_user_action, false);
    assert.equal(snapshot.attention_items[0].action_kind, 'infrastructure_timeout');
    assert.equal(snapshot.attention_items[0].action_summary, '后台监督脚本执行超时，需要系统侧恢复。');
    assert.equal(snapshot.attention_items[0].next_action_summary, '恢复后台监督定时任务，并确认下一次运行不再超时。');
    assert.equal(snapshot.attention_items[0].source_refs.some((ref: { role: string }) => ref.role === 'hermes_cron_output'), true);
    assert.equal(snapshot.recent_items.length, 0);
    assert.deepEqual(snapshot.action_counts, { user: 0, opl: 0, infrastructure: 1 });
    assert.equal(snapshot.source_refs.some((ref: { role: string }) => ref.role === 'hermes_cron_projection'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(hermesHome, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(hermesFixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot projects MAS live study artifacts discovered from Hermes supervision scripts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-study-state-'));
  const hermesHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-study-home-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-tray-mas-workspace-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const { fixtureRoot: hermesFixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  echo "Gateway service is loaded"
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const profileDir = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles');
  const profilePath = path.join(profileDir, 'dm.workspace.toml');
  const scriptPath = path.join(hermesHome, 'scripts', 'med-autoscience', 'dm', 'watch_runtime_tick.py');
  const jobsPath = path.join(hermesHome, 'cron', 'jobs.json');

  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(profilePath, 'workspace_name = "dm"\n');
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(
    scriptPath,
    `COMMAND = json.loads("[\\"${workspaceRoot}/ops/medautoscience/bin/watch-runtime\\", \\"--max-ticks\\", \\"1\\"]")\n`,
  );
  fs.mkdirSync(path.dirname(jobsPath), { recursive: true });
  fs.writeFileSync(
    jobsPath,
    `${JSON.stringify({
      jobs: [
        {
          id: 'cron-dm',
          name: 'medautoscience-supervision-dm',
          script: 'med-autoscience/dm/watch_runtime_tick.py',
          schedule_display: 'every 5m',
          enabled: true,
          state: 'scheduled',
          last_status: 'ok',
        },
      ],
    }, null, 2)}\n`,
  );

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
    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_HERMES_BIN: hermesPath,
      HERMES_HOME: hermesHome,
    });
    const snapshot = output.runtime_tray_snapshot;
    const allItems = [...snapshot.attention_items, ...snapshot.running_items, ...snapshot.recent_items];

    assert.equal(snapshot.runtime_health.status, 'needs_attention');
    assert.equal(snapshot.runtime_health.label, '需用户处理');
    assert.equal(snapshot.attention_items.length, 1);
    assert.equal(snapshot.attention_items[0].item_id, 'medautoscience:study:002-dm-china-us-mortality-attribution');
    assert.equal(snapshot.attention_items[0].active_run_id, 'run-002');
    assert.equal(snapshot.attention_items[0].status_label, '运行中：分析补充');
    assert.equal(snapshot.attention_items[0].action_owner, 'opl');
    assert.equal(snapshot.attention_items[0].requires_user_action, false);
    assert.equal(snapshot.attention_items[0].action_kind, 'publication_gate');
    assert.equal(snapshot.attention_items[0].action_summary, '论文质量或交付检查未关闭；当前阶段：分析补充。');
    assert.equal(snapshot.attention_items[0].next_action_summary, '建议阶段：分析补充；目标：补齐证据一致性。');
    assert.equal(snapshot.attention_items[0].blockers.includes('投稿包投影需要刷新。'), true);
    assert.equal(snapshot.attention_items[0].recommended_commands[0].surface_kind, 'study_progress');
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
    assert.deepEqual(snapshot.action_counts, { user: 1, opl: 1, infrastructure: 0 });
    assert.equal(snapshot.source_refs.some((ref: { role: string }) => ref.role === 'runtime_projection'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(hermesHome, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(hermesFixtureRoot, { recursive: true, force: true });
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

test('runtime manager reconcile recommends Hermes setup without taking kernel ownership', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-reconcile-state-'));

  try {
    const output = runCli(['runtime', 'manager'], {
      OPL_HERMES_BIN: '',
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: path.join(stateRoot, 'missing-native-bin'),
      PATH: '',
    });
    const reconcile = output.runtime_manager.reconcile;

    assert.equal(output.runtime_manager.status, 'needs_runtime_setup');
    assert.equal(reconcile.surface_kind, 'opl_runtime_manager_reconcile');
    assert.equal(reconcile.overall_status, 'attention_needed');
    assert.equal(reconcile.checked_surfaces.hermes_runtime, 'needs_runtime_setup');
    assert.equal(reconcile.non_goals.includes('does_not_schedule_tasks'), true);
    assert.deepEqual(
      reconcile.recommended_actions.map((action: { action_id: string; blocking: boolean }) => [
        action.action_id,
        action.blocking,
      ]),
      [
        ['install_or_start_hermes', true],
        ['repair_native_helpers', false],
        ['refresh_native_indexes', false],
      ],
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime manager action dry-run plans repairs without mutating native index files', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  echo "Gateway service is loaded"
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-action-dry-state-'));

  try {
    const output = runCli(['runtime', 'manager', 'action', '--dry-run'], {
      OPL_HERMES_BIN: hermesPath,
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: path.join(stateRoot, 'missing-native-bin'),
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
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime manager action apply repairs available surfaces and returns before after reconcile summaries', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-action-apply-'));
  const gatewayState = path.join(fixtureRoot, 'gateway-ready');
  const { fixtureRoot: hermesFixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "install" ]; then
  echo "gateway repair completed"
  touch "${gatewayState}"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  if [ -f "${gatewayState}" ]; then
    echo "Gateway service is loaded"
  else
    echo "Gateway service is not loaded"
  fi
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const stateRoot = path.join(fixtureRoot, 'state');
  const helperBinDir = path.join(fixtureRoot, 'native-bin');
  const repairScript = createNativeHelperRepairScript(fixtureRoot, helperBinDir);

  try {
    const output = runCli(['runtime', 'manager', 'action', '--apply'], {
      OPL_HERMES_BIN: hermesPath,
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
      OPL_NATIVE_HELPER_REPAIR_COMMAND: repairScript,
    });
    const action = output.runtime_manager_action;

    assert.equal(action.mode, 'apply');
    assert.equal(action.dry_run, false);
    assert.equal(action.before.reconcile.checked_surfaces.hermes_runtime, 'needs_runtime_setup');
    assert.equal(action.after.reconcile.overall_status, 'ready');
    assert.deepEqual(action.after.reconcile.recommended_actions, []);
    assert.deepEqual(
      action.executed_actions.map((entry: { action_id: string; status: string }) => [
        entry.action_id,
        entry.status,
      ]),
      [
        ['repair_hermes_gateway', 'completed'],
        ['repair_native_helpers', 'completed'],
        ['refresh_native_indexes', 'completed'],
      ],
    );
    assert.equal(action.after.native_helper_runtime.status, 'available');
    assert.equal(action.after.native_index_persistence.status, 'written');
    assert.equal(fs.existsSync(path.join(stateRoot, 'runtime-manager', 'native-state-index.json')), true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(hermesFixtureRoot, { recursive: true, force: true });
  }
});
