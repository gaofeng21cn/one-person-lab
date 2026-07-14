import { DatabaseSync } from 'node:sqlite';

import { buildAppStateRuntimeActivityItems } from '../../../../../src/modules/console/app-state-runtime-activity.ts';
import { createStageAttemptTable } from '../../../../../src/modules/runway/family-runtime-stage-attempt-ledger.ts';
import { createStageAttempt } from '../../../../../src/modules/runway/family-runtime-stage-attempts.ts';
import { assert, createFakeCodexFixture, fs, os, path, runCli, runCliFailure, test } from '../../helpers.ts';
import { assertCurrentOwnerDeltaProjection } from '../owner-payload-workorder-assertions.ts';
import { writeCurrentOwnerDeltaProjectionCacheFixture } from './fixtures.ts';

function seedLargeRuntimeActivityFixture(stateDir: string) {
  const queueDb = path.join(stateDir, 'family-runtime', 'queue.sqlite');
  fs.mkdirSync(path.dirname(queueDb), { recursive: true });
  const db = new DatabaseSync(queueDb);
  createStageAttemptTable(db);
  const update = db.prepare(`
      UPDATE stage_attempts
      SET status = ?, blocked_reason = ?, provider_run_json = ?, created_at = ?, updated_at = ?
      WHERE stage_attempt_id = ?
    `);
  const seed = (workUnitId: string, status: string, updatedAt: string) => {
    const attempt = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: `stage-${workUnitId}`,
      providerKind: 'temporal',
      workspaceLocator: {
        work_unit_id: workUnitId,
        workspace_root: `/tmp/${workUnitId}`,
      },
      taskId: `task-${workUnitId}`,
    }).attempt;
    update.run(
      status,
      status === 'blocked' ? 'owner_attention_required' : null,
      JSON.stringify(status === 'running' ? {
        provider_status: 'running',
        last_heartbeat_at: updatedAt,
      } : {}),
      updatedAt,
      updatedAt,
      attempt.stage_attempt_id,
    );
  };

  try {
    db.exec('BEGIN');
    for (let index = 0; index < 512; index += 1) {
      seed(
        `history-${index}`,
        'completed',
        new Date(Date.parse('2026-06-01T00:00:00.000Z') + index * 1000).toISOString(),
      );
    }
    seed('important-running', 'running', '2026-05-01T00:00:00.000Z');
    seed('important-attention', 'blocked', '2026-05-02T00:00:00.000Z');
    seed('important-recent', 'completed', '2026-07-10T00:00:00.000Z');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
}

test('app state fast hot path avoids barrel imports and keeps full drilldown lazy', () => {
  const hotPathFiles = [
    'app-state.ts',
    'app-state-action-catalog.ts',
    'app-state-current-owner-delta.ts',
    'app-state-developer-mode-closeout.ts',
    'app-state-release.ts',
    'app-state-runtime-activity.ts',
    'app-state-settings-control-center.ts',
    'app-state-view-model.ts',
    'codex-personalization.ts',
  ];

  for (const fileName of hotPathFiles) {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'modules', 'console', fileName),
      'utf8',
    );
    assert.doesNotMatch(source, /from\s+['"][^'"]*\/index\.ts['"]/, `${fileName} must avoid barrel imports`);
  }

  const appStateSource = fs.readFileSync(
    path.join(process.cwd(), 'src', 'modules', 'console', 'app-state.ts'),
    'utf8',
  );
  assert.doesNotMatch(
    appStateSource,
    /from\s+['"]\.\/runtime-tray-snapshot\.ts['"]/,
    'full runtime tray must not load on the fast profile import path',
  );
  assert.match(appStateSource, /import\(['"]\.\/runtime-tray-snapshot\.ts['"]\)/);
});

test('app state fast ignores non-framework owner-delta cache as default cockpit source', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-stale-cache-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    writeCurrentOwnerDeltaProjectionCacheFixture(stateDir);
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }) as {
      app_state: {
        operator: {
          current_owner_delta: Record<string, any>;
          current_owner_delta_read_model: Record<string, any>;
          workbench: {
            current_owner_delta: Record<string, any>;
            summary_cards: Array<{ card_id: string; value: number | string }>;
          };
        };
      };
    };

    assertCurrentOwnerDeltaProjection(output.app_state.operator.current_owner_delta, {
      currentOwner: 'one-person-lab',
      requiredDelta: 'refresh_current_owner_delta_read_model_required',
      acceptedAnswerShapeIncludes: ['framework_readiness_ref'],
    });
    assert.equal(
      output.app_state.operator.workbench.summary_cards.find((entry) => entry.card_id === 'active_projects')?.value,
      0,
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('app state fast does not perform network latest-version lookup', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-fast-home-'));
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);
  const npmMarker = path.join(codexFixture.fixtureRoot, 'npm-called.marker');
  fs.writeFileSync(
    path.join(codexFixture.fixtureRoot, 'npm'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `touch ${JSON.stringify(npmMarker)}`,
      'echo "unexpected npm network lookup" >&2',
      'exit 42',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  const temporalBin = path.join(codexFixture.fixtureRoot, 'Cellar', 'temporal', '1.4.1', 'bin', 'temporal');
  fs.mkdirSync(path.dirname(temporalBin), { recursive: true });
  fs.writeFileSync(temporalBin, '#!/usr/bin/env bash\necho "temporal version 1.4.1"\n', { mode: 0o755 });
  const brewMarker = path.join(codexFixture.fixtureRoot, 'brew-called.marker');
  const brewBin = path.join(codexFixture.fixtureRoot, 'brew');
  fs.writeFileSync(
    brewBin,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `touch ${JSON.stringify(brewMarker)}`,
      'echo "unexpected Homebrew owner probe" >&2',
      'exit 42',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  const ghMarker = path.join(codexFixture.fixtureRoot, 'gh-called.marker');
  const ghBin = path.join(codexFixture.fixtureRoot, 'gh');
  fs.writeFileSync(
    ghBin,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `touch ${JSON.stringify(ghMarker)}`,
      'echo "unexpected GitHub identity probe" >&2',
      'exit 42',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  try {
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'opl-state', 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: ghBin,
      OPL_TEMPORAL_BIN: temporalBin,
      OPL_HOMEBREW_BIN: brewBin,
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as {
      app_state: {
        core: {
          codex: {
            parsed_version: string | null;
            latest_version: string | null;
            latest_version_status: string;
            diagnostics: string[];
          };
        };
      };
    };

    assert.equal(output.app_state.core.codex.parsed_version, '0.125.0');
    assert.equal(output.app_state.core.codex.latest_version, null);
    assert.equal(output.app_state.core.codex.latest_version_status, 'unknown');
    assert.equal(output.app_state.core.codex.diagnostics.includes('codex_cli_latest_lookup_skipped_fast_profile'), true);
    assert.equal(fs.existsSync(npmMarker), false);
    assert.equal(fs.existsSync(brewMarker), false);
    assert.equal(fs.existsSync(ghMarker), false);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('app state fast stays bounded for GUI rendering', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-size-home-'));
  try {
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'opl-state', 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    });
    const byteLength = Buffer.byteLength(JSON.stringify(output), 'utf8');
    assert.equal(byteLength <= 262144, true, `fast app state was ${byteLength} bytes`);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('app state fast excludes unregistered runtime history from the work-item inventory', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-large-history-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    seedLargeRuntimeActivityFixture(stateDir);
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }) as any;
    const workbench = output.app_state.operator.workbench;
    const runtimeTasks = workbench.task_drilldowns.filter(
      (entry: any) => entry.runtime_readback_source === 'opl_family_runtime_stage_attempt_projection',
    );
    const workItemProjectionV2 = workbench.work_item_projection_v2;

    assert.equal(Buffer.byteLength(JSON.stringify(output), 'utf8') <= 262144, true);
    assert.equal(runtimeTasks.length, 0);
    assert.equal(workbench.task_run_projection_v2.tasks.length, 0);
    assert.equal(workbench.work_item_projection_v1.items.length, 0);
    assert.equal(workItemProjectionV2.items.length, 0);
    assert.equal(workItemProjectionV2.summary.work_item_count, 0);
    assert.equal(workItemProjectionV2.diagnostics.count, 0);
    assert.equal(workItemProjectionV2.diagnostics.detail_policy, 'summary_only');
    assert.deepEqual(workItemProjectionV2.diagnostics.items, []);
    assert.equal(workItemProjectionV2.detail_policy.inventory_detail, 'deferred');
    assert.equal(workItemProjectionV2.detail_policy.all_work_item_summaries_included, false);
    assert.equal(workItemProjectionV2.detail_policy.attempt_ref_limit_per_item, 0);
    assert.equal(
      workItemProjectionV2.detail_policy.full_detail_surface,
      'opl app state --profile full --json',
    );
    assert.equal(Array.isArray(output.app_state.operator.visual_ref_groups.needs_attention_refs), true);
    assert.equal(output.app_state.operator.visual_ref_groups.needs_attention_refs.length, 0);
    assert.deepEqual(output.app_state.operator.visual_ref_groups.active_project_refs, []);
    assert.deepEqual(output.app_state.operator.visual_ref_groups.recent_project_refs, []);
    assert.equal(output.app_state.operator.visual_ref_groups.safe_action_refs.length > 0, true);
    assert.equal(
      typeof output.app_state.operator.visual_ref_groups.safe_action_refs[0].action_id,
      'string',
    );
    assert.equal(
      typeof output.app_state.operator.visual_ref_groups.safe_action_refs[0].ref,
      'string',
    );

    process.env.OPL_STATE_DIR = stateDir;
    assert.equal(buildAppStateRuntimeActivityItems().length, 0);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('app command parsers reject invalid state profiles and non-object action payloads', () => {
  const invalidProfile = runCliFailure(['app', 'state', '--profile', 'slow']);
  assert.equal(invalidProfile.payload.error.code, 'cli_usage_error');
  assert.equal(invalidProfile.payload.error.details.allowed_profiles.includes('fast'), true);
  assert.equal(invalidProfile.payload.error.details.allowed_profiles.includes('full'), true);

  const invalidPayload = runCliFailure([
    'app',
    'action',
    'execute',
    '--action',
    'developer_supervisor',
    '--payload',
    '[]',
    '--dry-run',
  ]);
  assert.equal(invalidPayload.payload.error.code, 'cli_usage_error');
  assert.equal(invalidPayload.payload.error.message, '--payload must be a JSON object.');
});
