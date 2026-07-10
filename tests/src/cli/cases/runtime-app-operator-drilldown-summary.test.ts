import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';
import './wrapper-aware-read-model.test.ts';
import {
  buildCurrentOwnerDeltaReadModel,
  writeCurrentOwnerDeltaReadModelProjectionCache,
} from '../../../../src/modules/ledger/index.ts';
import { openQueueDb } from '../../../../src/modules/runway/family-runtime-store.ts';
import { createStageAttempt, runStageAttemptFixtureActivity } from '../../../../src/modules/runway/family-runtime-stage-attempts.ts';

const SUMMARY_COMMAND = ['runtime', 'app-operator-drilldown'];

function seedSummaryStageAttempts(count: number) {
  const { db } = openQueueDb();
  try {
    for (let index = 0; index < count; index += 1) {
      const attempt = createStageAttempt(db, {
        domainId: 'medautoscience',
        stageId: `write_${index}`,
        providerKind: 'temporal',
        workspaceLocator: {
          workspace_root: `/tmp/mas-${index}`,
          artifact_root: `/tmp/mas-${index}/artifacts`,
          source_refs: [`source:dataset-${index}`],
        },
        taskId: `task-app-operator-${index}`,
        checkpointRefs: [`checkpoint:write-start-${index}`],
      }).attempt;
      runStageAttemptFixtureActivity(db, {
        stageAttemptId: attempt.stage_attempt_id,
        closeoutPacket: {
          surface_kind: 'stage_attempt_closeout_packet',
          closeout_refs: [`receipt:write-closeout-${index}`],
          consumed_refs: [`artifact:table-${index}`],
          consumed_memory_refs: [`memory:route-policy-${index}`],
          writeback_receipt_refs: [`memory-writeback:receipt-${index}`],
          next_owner: 'med-autoscience',
          domain_ready_verdict: 'domain_gate_pending',
          route_impact: {
            decision: 'bounded_repair',
            owner_receipt_refs: [`owner-receipt:summary-${index}`],
            quality_refs: [`publication_eval/${index}.json`],
            readiness_refs: [`controller_decisions/${index}.json`],
            repair_command: `medautosci domain-handler dispatch --task task-${index}.json --format json`,
            package_refs: [`package:submission-${index}`],
            export_refs: [`export:current-package-${index}`],
          },
        },
      });
    }
  } finally {
    db.close();
  }
}

function bindMasWorkspace(input: {
  stateRoot: string;
  fixtureContractsRoot: string;
  workspaceRoot: string;
  profilePath: string;
}) {
  const manifest = structuredClone(loadFamilyManifestFixtures().medautoscience) as Record<string, any>;
  manifest.workspace_locator = {
    ...((manifest.workspace_locator as Record<string, unknown>) ?? {}),
    workspace_root: input.workspaceRoot,
    profile_ref: input.profilePath,
    profile_name: 'summary-current-work-unit',
  };
  manifest.task_lifecycle = {
    ...((manifest.task_lifecycle as Record<string, unknown>) ?? {}),
    status: 'active',
    human_gate_ids: [],
  };
  manifest.progress_projection = {
    ...((manifest.progress_projection as Record<string, unknown>) ?? {}),
    current_status: 'active',
    runtime_status: 'running',
    attention_items: [],
    human_gate_ids: [],
  };
  runCli([
    'workspace',
    'bind',
    '--project',
    'medautoscience',
    '--path',
    input.workspaceRoot,
    '--manifest-command',
    buildManifestCommand(manifest),
  ], {
    OPL_STATE_DIR: input.stateRoot,
    OPL_CONTRACTS_DIR: input.fixtureContractsRoot,
  });
}

function portalPayloadWithoutCurrentWorkUnit(workspaceRoot: string) {
  return {
    schema_version: 1,
    surface_kind: 'mas_progress_portal',
    workspace: {
      profile_name: 'summary-current-work-unit',
      workspace_root: workspaceRoot,
      workspace_status: 'running',
      studies: [
        {
          study_id: 'summary-current-work-unit-study',
          state_label: '自动运行中',
          state_summary: 'Portal 投影仍是普通运行状态。',
          current_stage: 'live',
          active_run_id: 'portal-run-current-work-unit',
          runtime_health_status: 'recovering',
          progress_freshness_status: 'fresh',
          next_system_action: '不要让历史 backlog 抢占普通推进判断。',
          worker_running: true,
        },
      ],
    },
    opl_handoff: {
      handoff_kind: 'mas_progress_portal_opl_family_projection',
      owner: 'mas',
      role: 'family_level_projection',
      authority: 'display_artifact_only',
      opl_role: 'family_level_projection_consumer_only',
      payload_refs: {
        progress_portal: 'artifacts/runtime/progress_portal/latest.json',
      },
      freshness: {
        status: 'fresh',
        latest_event_at: '2026-07-09T00:00:00.000Z',
      },
      source_refs: [],
      deep_link: 'ops/mas/progress/index.html',
    },
  };
}

function writeStudyProgressProbe(workspaceRoot: string) {
  const scriptPath = path.join(workspaceRoot, 'ops', 'medautoscience', 'bin', 'study-progress');
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, `#!/usr/bin/env node
const payload = {
  generated_at: '2026-07-09T00:00:01.000Z',
  truth_epoch: 'truth-event-000010-current-work-unit',
  runtime_health_epoch: 'runtime-health-event-000011-current-work-unit',
  current_work_unit: {
    status: 'executable_owner_action',
    current_owner: 'med-autoscience',
    owner: 'med-autoscience',
    stage_id: 'submission_milestone_candidate',
    action_type: 'owner_answer_required',
    work_unit_id: 'current-work-unit-from-study-progress',
    work_unit_fingerprint: 'current-work-unit-from-study-progress',
    currentness_basis: {
      truth_epoch: 'truth-event-000010-current-work-unit',
      runtime_health_epoch: 'runtime-health-event-000011-current-work-unit'
    }
  }
};
process.stdout.write(JSON.stringify(payload));
`);
  fs.chmodSync(scriptPath, 0o755);
  return scriptPath;
}

function writeCurrentOwnerDeltaCache() {
  const readModel = buildCurrentOwnerDeltaReadModel({
    ownerDeltaFirst: {
      next_owner: 'med-autoscience',
      next_required_delta: 'cached_current_owner_work_unit_required',
      required_return_shapes: [
        'domain_owner_receipt_ref',
        'typed_blocker_ref',
      ],
      domain_id: 'medautoscience',
      primary_item: {
        source: 'framework_readiness_current_owner_delta',
        owner: 'med-autoscience',
        domain_id: 'medautoscience',
        study_id: 'cached-current-owner-study',
        stage_id: 'cached-current-owner-stage',
        work_unit_id: 'cached-current-owner-work-unit',
        currentness_basis: {
          truth_epoch: 'truth-event-000020-current-owner-cache',
          runtime_health_epoch: 'runtime-health-event-000021-current-owner-cache',
          work_unit_id: 'cached-current-owner-work-unit',
        },
      },
    },
    nextSafeAction: null,
    countSummary: {
      openSafeActionCount: 0,
      payloadRequiredCount: 0,
      payloadFreeCount: 0,
      blockedRefsOnlyCount: 0,
      evidenceEnvelopeOpenCount: 0,
      evidenceEnvelopeBlockedCount: 0,
      domainDispatchWorkorderCount: 0,
      stageReplayMissingReceiptWorkorderCount: 0,
    },
    fullDetailRefs: {
      framework_readiness_ref: 'opl framework readiness --family-defaults --json',
      app_operator_drilldown_ref: 'opl runtime app-operator-drilldown --detail full --json',
    },
  });
  assert.equal(
    writeCurrentOwnerDeltaReadModelProjectionCache({
      readModel,
      sourceSurface: 'framework_readiness',
      sourceCommand: 'opl framework readiness --family-defaults --json',
    }),
    true,
  );
}

test('runtime app operator summary uses current-owner cache before workstream backlog when direct work-unit is absent', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-operator-current-owner-cache-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    writeCurrentOwnerDeltaCache();
    seedSummaryStageAttempts(1);

    const summaryDrilldown = runCli(SUMMARY_COMMAND, {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;

    assert.equal(
      summaryDrilldown.attention_first_payload.owner_delta_first.summary.domain_current_work_unit_count,
      1,
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.owner_delta_first.primary_item.source,
      'domain_current_work_unit',
    );
    assert.equal(
      summaryDrilldown.current_owner_delta.work_unit_id,
      'cached-current-owner-work-unit',
    );
    assert.equal(
      summaryDrilldown.operator_next_action.payload_requirement,
      'domain_current_work_unit_owner_action_or_typed_blocker_required',
    );
    assert.equal(
      summaryDrilldown.summary.current_work_unit_first_default_primary_source,
      'domain_current_work_unit_projection',
    );
    assert.equal(
      summaryDrilldown.summary.current_work_unit_first_current_work_unit_count,
      1,
    );
    assert.equal(
      summaryDrilldown.summary.current_work_unit_first_default_payload_category,
      'current_work_unit_owner_delta',
    );
    assert.equal(
      summaryDrilldown.current_work_unit_first_read_model.default_primary_source,
      'domain_current_work_unit_projection',
    );
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime app operator summary prefers current work-unit over historical safe-action backlog', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-operator-current-work-unit-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-operator-current-work-unit-workspace-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const profileDir = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles');
  const profilePath = path.join(profileDir, 'summary.workspace.toml');
  const portalPayloadPath = path.join(workspaceRoot, 'artifacts', 'runtime', 'progress_portal', 'latest.json');
  const portalHtmlPath = path.join(workspaceRoot, 'ops', 'mas', 'progress', 'index.html');
  const previousStateDir = process.env.OPL_STATE_DIR;

  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(profilePath, 'workspace_name = "summary-current-work-unit"\n');
  fs.mkdirSync(path.dirname(portalPayloadPath), { recursive: true });
  fs.mkdirSync(path.dirname(portalHtmlPath), { recursive: true });
  fs.writeFileSync(portalHtmlPath, '<!doctype html><title>MAS Progress Portal</title>\n');
  fs.writeFileSync(portalPayloadPath, `${JSON.stringify(portalPayloadWithoutCurrentWorkUnit(workspaceRoot), null, 2)}\n`);
  writeStudyProgressProbe(workspaceRoot);

  try {
    bindMasWorkspace({ stateRoot, fixtureContractsRoot, workspaceRoot, profilePath });
    process.env.OPL_STATE_DIR = stateRoot;
    seedSummaryStageAttempts(1);

    const summaryDrilldown = runCli(SUMMARY_COMMAND, {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;

    assert.equal(
      summaryDrilldown.attention_first_payload.owner_delta_first.summary.domain_current_work_unit_count,
      1,
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.owner_delta_first.primary_item.source,
      'domain_current_work_unit',
    );
    assert.equal(
      summaryDrilldown.current_owner_delta.work_unit_id,
      'current-work-unit-from-study-progress',
    );
    assert.equal(
      summaryDrilldown.operator_next_action.payload_requirement,
      'domain_current_work_unit_owner_action_or_typed_blocker_required',
    );
    assert.equal(
      typeof summaryDrilldown.attention_first_payload.owner_delta_first.selected_safe_action.action_kind,
      'string',
    );
    assert.notEqual(
      summaryDrilldown.attention_first_payload.owner_delta_first.primary_item.source,
      'selected_safe_action',
    );
    assert.equal(
      summaryDrilldown.summary.current_work_unit_first_default_primary_source,
      'domain_current_work_unit_projection',
    );
    assert.equal(
      summaryDrilldown.summary.current_work_unit_first_current_work_unit_count,
      1,
    );
    assert.equal(
      summaryDrilldown.summary.current_work_unit_first_default_payload_category,
      'current_work_unit_owner_delta',
    );
    assert.equal(
      summaryDrilldown.current_work_unit_first_read_model
        .diagnostic_backlog_separation.historical_attempt_backlog_is_default_next_step,
      false,
    );
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
