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
import { createWorkspaceDescriptorFamilyFixture } from './workspace-domain-test-helper.ts';

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

function seedRunningCurrentWorkUnit(workspaceRoot: string) {
  const { db } = openQueueDb();
  try {
    const attempt = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'submission_milestone_candidate',
      providerKind: 'temporal',
      workspaceLocator: {
        workspace_root: workspaceRoot,
        artifact_root: path.join(workspaceRoot, 'artifacts'),
        source_refs: ['source:current-work-unit'],
        work_unit_id: 'current-work-unit-from-study-progress',
      },
      taskId: 'task-current-work-unit-from-study-progress',
      checkpointRefs: ['checkpoint:current-work-unit'],
    }).attempt;
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'running',
        provider_run_json = json_set(provider_run_json, '$.provider_status', 'running')
      WHERE stage_attempt_id = ?
    `)
      .run(attempt.stage_attempt_id);
  } finally {
    db.close();
  }
}

function bindMasWorkspace(input: {
  stateRoot: string;
  fixtureContractsRoot: string;
  workspaceRoot: string;
  profilePath: string;
  familyWorkspaceRoot: string;
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
    OPL_FAMILY_WORKSPACE_ROOT: input.familyWorkspaceRoot,
  });
}

function assertCurrentWorkUnitAuthority(drilldown: Record<string, any>) {
  const boundaries = [
    {
      boundary: drilldown.current_work_unit_first_read_model.authority_boundary,
      fields: [
        'can_write_domain_truth',
        'can_execute_domain_action',
        'can_create_owner_receipt',
        'can_create_typed_blocker',
        'can_close_domain_ready',
        'can_claim_production_ready',
      ],
    },
    {
      boundary: drilldown.domain_current_work_unit_projection.authority_boundary,
      fields: [
        'can_write_domain_truth',
        'can_execute_domain_action',
        'can_create_owner_receipt',
        'can_create_typed_blocker',
        'can_close_owner_chain',
        'can_close_domain_ready',
        'can_claim_domain_ready',
        'can_claim_production_ready',
        'provider_completion_is_domain_ready',
      ],
    },
  ];
  for (const { boundary, fields } of boundaries) {
    for (const field of fields) {
      assert.equal(Object.hasOwn(boundary, field), true, field + ' must be present');
      assert.equal(boundary[field], false, field);
    }
  }
}

function writeMasWorkItemInventoryFixture(familyWorkspaceRoot: string, workspaceRoot: string) {
  const descriptorPath = path.join(
    familyWorkspaceRoot,
    'med-autoscience',
    'contracts',
    'domain_descriptor.json',
  );
  const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8')) as Record<string, any>;
  descriptor.domain_id = 'mas';
  descriptor.standard_agent_interface.runtime.runtime_domain_id = 'mas';
  descriptor.standard_agent_interface.inventory_projection = {
    source_kind: 'workspace_relative_json',
    relative_path: 'workspace_index.json',
    items_pointer: '/studies',
    field_map: {
      display_name: 'display_name',
      next_action: 'next_action',
      stage_index_ref: 'stage_index_ref',
      work_item_id: 'study_id',
      work_item_root: 'canonical_study_root',
      business_status: 'status',
      current_stage_id: 'current_stage_id',
      current_stage_status: 'current_stage_status',
      package_status: 'package_status',
      lifecycle_ref: 'study_status_ref',
    },
  };
  fs.writeFileSync(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
  fs.writeFileSync(path.join(workspaceRoot, 'workspace_index.json'), `${JSON.stringify({
    studies: [{
      study_id: 'current-work-unit-from-study-progress',
      display_name: 'Current work unit from domain inventory',
      canonical_study_root: '.',
      status: 'active',
      current_stage_id: 'submission_milestone_candidate',
      current_stage_status: 'running',
      package_status: 'not_applicable',
      study_status_ref: 'ops/medautoscience/profiles/summary.workspace.toml',
      next_action: null,
      stage_index_ref: null,
    }],
  }, null, 2)}\n`);
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
    assertCurrentWorkUnitAuthority(summaryDrilldown);
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

test('runtime app operator summary prefers current work-item activity over historical safe-action backlog', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-operator-current-work-unit-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-operator-current-work-unit-workspace-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const descriptorFixture = createWorkspaceDescriptorFamilyFixture(['mas']);
  const profileDir = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles');
  const profilePath = path.join(profileDir, 'summary.workspace.toml');
  const previousStateDir = process.env.OPL_STATE_DIR;

  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(profilePath, 'workspace_name = "summary-current-work-unit"\n');
  writeMasWorkItemInventoryFixture(descriptorFixture.familyRoot, workspaceRoot);

  try {
    bindMasWorkspace({
      stateRoot,
      fixtureContractsRoot,
      workspaceRoot,
      profilePath,
      familyWorkspaceRoot: descriptorFixture.familyRoot,
    });
    const boundManifest = runCli(['domain', 'manifests'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_WORKSPACE_ROOT: descriptorFixture.familyRoot,
    }).domain_manifests.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautoscience',
    ).manifest;
    assert.equal(boundManifest.workspace_locator.workspace_root, workspaceRoot);
    process.env.OPL_STATE_DIR = stateRoot;
    seedSummaryStageAttempts(1);
    seedRunningCurrentWorkUnit(workspaceRoot);

    const workItemProjection = runCli(['app', 'state', '--profile', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_WORKSPACE_ROOT: descriptorFixture.familyRoot,
    }).app_state.operator.workbench.work_item_projection_v2;
    const projectionDiagnostics = JSON.stringify(workItemProjection.diagnostics.items);
    assert.equal(workItemProjection.summary.project_count, 1, projectionDiagnostics);
    assert.equal(workItemProjection.summary.work_item_count, 1, projectionDiagnostics);
    assert.equal(workItemProjection.summary.running_count, 1, projectionDiagnostics);

    const summaryDrilldown = runCli(SUMMARY_COMMAND, {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_WORKSPACE_ROOT: descriptorFixture.familyRoot,
    }).app_operator_drilldown;

    assert.equal(
      summaryDrilldown.attention_first_payload.owner_delta_first.summary.domain_current_work_unit_count,
      1,
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.owner_delta_first.primary_item.source,
      'domain_current_work_unit',
    );
    assert.match(
      summaryDrilldown.current_owner_delta.work_unit_id,
      /^mas:[a-f0-9]{16}:current-work-unit-from-study-progress$/,
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
    assertCurrentWorkUnitAuthority(summaryDrilldown);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    descriptorFixture.cleanup();
  }
});
