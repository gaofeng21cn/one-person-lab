import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFrameworkContracts,
  loadFamilyManifestFixtures,
  os,
  path,
  repoRoot,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';
import {
  createMinimalFamilyWorkspaceRoot,
  familyRuntimeEnv,
  insertProviderCapabilityReceipts,
  withEvidenceWorklistSurfaces,
} from './family-runtime-evidence-worklist-helpers.ts';
import {
  buildProductionTailNextActionLedger,
} from '../../../../src/modules/ledger/production-evidence-tail-ledger.ts';
import { runFamilyRuntimeEvidenceWorklist } from '../../../../src/modules/runway/family-runtime-evidence-worklist.ts';
import { buildRuntimeTraySnapshot } from '../../../../src/modules/console/runtime-tray-snapshot.ts';
import { openQueueDb } from '../../../../src/modules/runway/family-runtime-store.ts';
import {
  createStageAttempt,
  ingestStageAttemptCloseout,
} from '../../../../src/modules/runway/family-runtime-stage-attempts.ts';

const appOperatorDetailCommand = ['runtime', 'app-operator-drilldown', '--detail', 'full'];

function completedTemporalObservationWithTypedBlocker(input: {
  stageAttemptId: string;
  workflowId: string;
  createdAt: string;
  typedBlockerRef: string;
}) {
  const query = {
    surface_kind: 'temporal_stage_attempt_query' as const,
    provider_kind: 'temporal' as const,
    stage_attempt_id: input.stageAttemptId,
    workflow_id: input.workflowId,
    domain_id: 'medautoscience' as const,
    stage_id: 'domain_owner/default-executor-dispatch',
    status: 'completed' as const,
    started_at: input.createdAt,
    updated_at: input.createdAt,
    activity_events: [] as Record<string, unknown>[],
    stage_progress_log: {
      surface_kind: 'temporal_workflow_stage_progress_log' as const,
      planned_work: {
        stage_attempt_id: input.stageAttemptId,
        workflow_id: input.workflowId,
        domain_id: 'medautoscience',
        stage_id: 'domain_owner/default-executor-dispatch',
        executor_kind: 'codex_cli',
        checkpoint_refs: ['dispatch:terminal-currentness-start'],
      },
      timeline: [{
        event_kind: 'temporal_query_terminal_observation',
        status: 'completed',
        ref: 'dispatch:terminal-currentness-typed-blocker-closeout',
      }],
      visibility: {
        query: 'StageAttemptQuery',
        search_attribute_refs: {
          OplStageAttemptId: input.stageAttemptId,
          OplDomainId: 'medautoscience',
          OplStageId: 'domain_owner/default-executor-dispatch',
          OplExecutorKind: 'codex_cli',
          OplTaskId: null,
        },
      },
    },
    checkpoint_refs: ['dispatch:terminal-currentness-start'],
    closeout_refs: ['dispatch:terminal-currentness-typed-blocker-closeout'],
    consumed_refs: ['dispatch:terminal-currentness-start'],
    consumed_memory_refs: [] as string[],
    writeback_receipt_refs: [] as string[],
    rejected_writes: [] as Record<string, unknown>[],
    next_owner: 'med-autoscience',
    route_impact: {
      typed_blocker_refs: [input.typedBlockerRef],
      next_owner: 'med-autoscience',
    },
    human_gate_refs: [] as string[],
    signals: [],
    closeout_packet: {
      surface_kind: 'temporal_domain_handler_dispatch_receipt',
      closeout_packet_surface_kind: 'domain_stage_closeout_packet',
      closeout_refs: ['dispatch:terminal-currentness-typed-blocker-closeout'],
    },
    completion_boundary: {
      provider_completion: 'completed' as const,
      domain_ready_verdict: 'domain_gate_pending',
      provider_completion_is_domain_ready: false as const,
    },
    authority_boundary: {
      opl: 'temporal_workflow_transport_and_control_metadata_only' as const,
      domain: 'truth_quality_artifact_gate_owner' as const,
    },
  };
  return {
    surface_kind: 'temporal_stage_attempt_query_receipt' as const,
    provider_kind: 'temporal' as const,
    stage_attempt_id: input.stageAttemptId,
    workflow_id: input.workflowId,
    run_id: 'run-terminal-currentness',
    workflow_status: 'COMPLETED' as const,
    query_source: 'workflow_result_after_terminal_completed' as const,
    query,
    authority_boundary: {
      opl: 'temporal_workflow_transport_and_control_metadata_only' as const,
      domain: 'truth_quality_artifact_gate_owner' as const,
    },
  };
}

test('production tail next-action ledger groups repeated typed blocker refs without hiding raw items', () => {
  const ledger = buildProductionTailNextActionLedger({
    surfaceKind: 'test_next_action_ledger',
    sourceTailSummary: {
      tail_item_count: 3,
      open_tail_item_count: 0,
      typed_blocker_tail_item_count: 3,
      blocking_tail_item_count: 0,
      closed_tail_item_count: 3,
    },
    tailItems: [
      {
        tail_id: 'mas:dispatch:review:1',
        tail_item: 'domain_dispatch_evidence_receipt',
        status: 'closed_by_domain_owned_typed_blocker',
        owner: 'med-autoscience',
        domain_id: 'med-autoscience',
        stage_id: 'review',
        request_id: 'attempt-1',
        claim_scope: 'domain_dispatch_evidence_receipt',
        typed_blocker_refs: ['mas://typed-blockers/reviewer-refresh-pending'],
      },
      {
        tail_id: 'mas:dispatch:aftercare:2',
        tail_item: 'domain_dispatch_evidence_receipt',
        status: 'closed_by_domain_owned_typed_blocker',
        owner: 'med-autoscience',
        domain_id: 'med-autoscience',
        stage_id: 'aftercare',
        request_id: 'attempt-2',
        claim_scope: 'domain_dispatch_evidence_receipt',
        typed_blocker_refs: ['mas://typed-blockers/reviewer-refresh-pending'],
      },
      {
        tail_id: 'mas:dispatch:package:3',
        tail_item: 'domain_dispatch_evidence_receipt',
        status: 'closed_by_domain_owned_typed_blocker',
        owner: 'med-autoscience',
        domain_id: 'med-autoscience',
        stage_id: 'package',
        request_id: 'attempt-3',
        claim_scope: 'domain_dispatch_evidence_receipt',
        typed_blocker_refs: ['mas://typed-blockers/package-owner-pending'],
      },
    ],
  });

  assert.equal(ledger.summary.next_action_item_count, 3);
  assert.equal(ledger.summary.typed_blocker_tail_item_count, 3);
  assert.equal(ledger.summary.typed_blocker_ref_count, 3);
  assert.equal(ledger.summary.unique_typed_blocker_ref_count, 2);
  assert.equal(ledger.summary.typed_blocker_group_count, 2);
  assert.equal(
    ledger.summary.typed_blocker_attention_semantics,
    'domain_owned_typed_blocker_refs_grouped_for_attention_only_raw_tail_counts_preserved',
  );
  const repeatedGroup = ledger.typed_blocker_groups.find((group) =>
    group.typed_blocker_ref === 'mas://typed-blockers/reviewer-refresh-pending'
  );
  assert.ok(repeatedGroup);
  assert.equal(repeatedGroup.item_count, 2);
  assert.equal(repeatedGroup.stage_or_request_count, 2);
  assert.equal(ledger.authority_boundary.can_claim_production_ready, false);
  assert.equal(ledger.authority_boundary.can_claim_domain_ready, false);
});

test('family-runtime evidence-worklist syncs terminal Temporal closeout before exposing domain-dispatch workorders', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-terminal-sync-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const previousStateDir = process.env.OPL_STATE_DIR;
  const createdAt = new Date().toISOString();

  try {
    process.env.OPL_STATE_DIR = stateRoot;
    const { db } = openQueueDb();
    let stageAttemptId = '';
    let workflowId = '';
    try {
      const attempt = createStageAttempt(db, {
        domainId: 'medautoscience',
        stageId: 'domain_owner/default-executor-dispatch',
        providerKind: 'temporal',
        workspaceLocator: {
          workspace_root: '/tmp/mas-terminal-currentness',
          study_id: 'DM002',
          action_type: 'run_quality_repair_batch',
          dispatch_ref: 'dispatch:terminal-currentness',
          dispatch_authority: 'mas-owner-route',
        },
        sourceFingerprint: 'sha256:terminal-currentness',
        executorKind: 'codex_cli',
        checkpointRefs: ['dispatch:terminal-currentness-start'],
      }).attempt;
      stageAttemptId = attempt.stage_attempt_id;
      workflowId = attempt.workflow_id;
      ingestStageAttemptCloseout(db, {
        stageAttemptId,
        packet: {
          surface_kind: 'domain_stage_closeout_packet',
          closeout_refs: ['dispatch:stale-closeout-without-owner-evidence'],
          consumed_refs: ['dispatch:terminal-currentness-start'],
          consumed_memory_refs: [],
          writeback_receipt_refs: [],
          rejected_writes: [],
          next_owner: 'med-autoscience',
          domain_ready_verdict: 'domain_gate_pending',
          route_impact: {},
          authority_boundary: {
            opl: 'test_projection_only',
            domain: 'truth_quality_artifact_gate_owner',
          },
        },
      });
    } finally {
      db.close();
    }

    let queryCount = 0;
    const typedBlockerRef = 'mas://typed-blockers/terminal-currentness-observed';
    const result = await runFamilyRuntimeEvidenceWorklist(
      loadFrameworkContracts(fixtureContractsRoot),
      {
        familyDefaults: true,
        providerKind: 'temporal',
        executorKind: 'codex_cli',
        detailLevel: 'full',
        runtimeSnapshotProvider: buildRuntimeTraySnapshot,
        queryTemporalStageAttemptReadModel: async (attempt: { stage_attempt_id: string; workflow_id: string }) => {
          queryCount += 1;
          assert.equal(attempt.stage_attempt_id, stageAttemptId);
          return completedTemporalObservationWithTypedBlocker({
            stageAttemptId,
            workflowId,
            createdAt,
            typedBlockerRef,
          });
        },
      },
    );
    const worklist = result.family_runtime_evidence_worklist;
    assert.equal(worklist.detail_level, 'full');
    if (!('worklist_items' in worklist)) {
      throw new Error('expected full evidence worklist payload');
    }
    const staleRecordItem = worklist.worklist_items.find((item: { action_id: string }) =>
      item.action_id === `domain_dispatch:medautoscience:${stageAttemptId}:record`
    );

    assert.equal(queryCount, 1);
    assert.equal(staleRecordItem, undefined);
    assert.equal(worklist.summary.domain_dispatch_evidence_workorder_count, 0);
    assert.equal(worklist.terminal_observation_sync.synced_attempt_count, 1);
    assert.equal(worklist.terminal_observation_sync.authority_boundary.can_generate_domain_owner_receipt, false);
  } finally {
    if (typeof previousStateDir === 'string') {
      process.env.OPL_STATE_DIR = previousStateDir;
    } else {
      delete process.env.OPL_STATE_DIR;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime evidence-worklist exposes active attempt progress-first supervision as diagnostic attention', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-progress-first-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const previousStateDir = process.env.OPL_STATE_DIR;

  try {
    process.env.OPL_STATE_DIR = stateRoot;
    const { db } = openQueueDb();
    let stageAttemptId = '';
    try {
      const attempt = createStageAttempt(db, {
        domainId: 'medautoscience',
        stageId: 'domain_owner/default-executor-dispatch',
        providerKind: 'temporal',
        workspaceLocator: {
          workspace_root: '/tmp/mas-progress-first',
          study_id: 'DM002',
          dispatch_ref: 'dispatch:progress-first',
        },
        sourceFingerprint: 'sha256:progress-first',
        executorKind: 'codex_cli',
        checkpointRefs: ['dispatch:progress-first-start'],
      }).attempt;
      stageAttemptId = attempt.stage_attempt_id;
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'running',
            provider_run_json = json_set(provider_run_json, '$.provider_status', 'running')
        WHERE stage_attempt_id = ?
      `).run(stageAttemptId);
    } finally {
      db.close();
    }

    const worklist = (await runFamilyRuntimeEvidenceWorklist(
      loadFrameworkContracts(fixtureContractsRoot),
      {
        familyDefaults: true,
        providerKind: 'temporal',
        executorKind: 'codex_cli',
        detailLevel: 'full',
        runtimeSnapshotProvider: buildRuntimeTraySnapshot,
        queryTemporalStageAttemptReadModel: async () => null,
      },
    )).family_runtime_evidence_worklist;
    assert.equal(worklist.detail_level, 'full');
    if (!('worklist_items' in worklist)) {
      throw new Error('expected full evidence worklist payload');
    }
    const progressItem = worklist.worklist_items.find((item: { action_id: string }) =>
      item.action_id === `progress-first-supervision:${stageAttemptId}`
    ) as { stage_attempt_id: string; [key: string]: any } | undefined;

    assert.ok(progressItem);
    assert.equal(progressItem.status, 'diagnostic_only');
    assert.equal(progressItem.worklist_status_detail, 'diagnostic_only_not_operator_actionable');
    assert.equal(progressItem.mode, 'diagnostic_query_only');
    assert.equal(
      progressItem.route_semantics,
      'read_only_operator_diagnostic_not_safe_action_or_closeable_workorder',
    );
    assert.equal(progressItem.claim_scope, 'progress_first_attempt_supervision');
    assert.equal(progressItem.stage_attempt_id, stageAttemptId);
    assert.equal(progressItem.evidence_requirement.status, 'closed');
    assert.equal(progressItem.evidence_requirement.next_safe_action_route, null);
    assert.equal(progressItem.evidence_requirement.can_claim_domain_ready, false);
    assert.equal(progressItem.evidence_requirement.can_claim_production_ready, false);
    assert.deepEqual(progressItem.missing_progress_signals, [
      'worker_liveness',
      'latest_progress_delta',
      'stage_log',
      'owner_closeout',
    ]);
    assert.equal(
      progressItem.supervisor_safe_action_kind,
      'repair_worker_liveness_before_attempt_continuity_judgment',
    );
    assert.equal(
      progressItem.typed_blocker_requirement.status,
      'deferred_until_worker_liveness_ready',
    );
    assert.equal(progressItem.typed_blocker_requirement.opl_can_create_typed_blocker, false);
    const openProgressItems = worklist.worklist_items.filter((item: { claim_scope: string; status: string }) =>
      item.claim_scope === 'progress_first_attempt_supervision'
      && item.status === 'open_safe_action_request_route_available'
    );
    assert.deepEqual(openProgressItems, []);
    assert.equal(worklist.progress_first_operator_summary.deliverable_progress_delta, null);
    assert.equal(
      worklist.progress_first_operator_summary.platform_repair_delta,
      'opl_operator_or_provider_supervision_delta_available',
    );
    assert.equal(
      worklist.progress_first_operator_summary.next_forced_delta,
      'Inspect the active attempt, worker readiness, stage_progress_log, and closeout refs; start or repair the worker first when liveness is missing, otherwise supervise progress or require domain typed closeout.',
    );
    assert.equal(worklist.progress_first_operator_summary.progress_first_supervision_open_count, 0);
    assert.equal(worklist.progress_first_operator_summary.progress_first_supervision_diagnostic_count, 1);
    assert.equal(worklist.progress_first_operator_summary.progress_first_supervision_item_count, 1);
    assert.equal(worklist.summary.progress_first_supervision_open_item_count, 0);
    assert.equal(worklist.summary.progress_first_supervision_diagnostic_item_count, 1);
    assert.equal(
      worklist.summary.progress_first_supervision_diagnostic_semantics,
      'attempt_query_is_read_only_operator_diagnostic_not_closeable_evidence_workorder',
    );
    assert.equal(
      worklist.progress_first_operator_summary.authority_boundary.can_claim_domain_ready,
      false,
    );
    assert.equal(
      worklist.next_safe_actions.some((action) =>
        action.action_id === `progress-first-supervision:${stageAttemptId}`
      ),
      false,
    );
    assert.equal(
      worklist.next_safe_actions.every((action) =>
        action.claim_scope !== 'progress_first_attempt_supervision'
      ),
      true,
    );
    assert.equal(
      worklist.next_action_ledger.next_action_items.every((item: {
        evidence_requirement: { claim_scope: string };
      }) =>
        item.evidence_requirement.claim_scope !== 'progress_first_attempt_supervision'
      ),
      true,
    );
    assert.equal(worklist.zero_open_worklist_guard.zero_open_worklist_is_completion_claim, false);
  } finally {
    if (typeof previousStateDir === 'string') {
      process.env.OPL_STATE_DIR = previousStateDir;
    } else {
      delete process.env.OPL_STATE_DIR;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime evidence-worklist classifies verified external blockers without production authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-external-blocker-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const familyWorkspaceRoot = createMinimalFamilyWorkspaceRoot();
  const baseManifests = loadFamilyManifestFixtures();
  const manifests = {
    medautogrant: withEvidenceWorklistSurfaces(
      baseManifests.medautogrant,
      ['fundability_strategy', 'specific_aims_and_structure', 'proposal_authoring'],
      { externalEvidenceRequestCount: 6 },
    ),
    medautoscience: withEvidenceWorklistSurfaces(
      baseManifests.medautoscience,
      [
        'direction_and_route_selection',
        'baseline_and_evidence_setup',
        'bounded_analysis_campaign',
        'manuscript_authoring',
        'review_and_quality_gate',
        'finalize_and_publication_handoff',
      ],
    ),
    redcube: withEvidenceWorklistSurfaces(
      baseManifests.redcube,
      [
        'source_intake',
        'communication_strategy',
        'visual_direction',
        'artifact_creation',
        'review_and_revision',
        'package_and_handoff',
      ],
      { evidenceGateCount: 3 },
    ),
  };

  try {
    for (const [project, manifest] of Object.entries(manifests)) {
      runCli([
        'workspace',
        'bind',
        '--project',
        project,
        '--path',
        repoRoot,
        '--manifest-command',
        buildManifestCommand(manifest),
      ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));
    }

    insertProviderCapabilityReceipts(stateRoot);

    const before = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot, {
      OPL_PROVIDER_PROOF_WINDOW_SECONDS: '86400',
      OPL_FAMILY_WORKSPACE_ROOT: familyWorkspaceRoot,
    })).family_runtime_evidence_worklist;

    const externalRecord = before.worklist_items.find((item: { claim_scope: string }) =>
      item.claim_scope === 'external_evidence_receipt'
    );
    const gateRecord = before.worklist_items.find((item: { claim_scope: string }) =>
      item.claim_scope === 'evidence_gate_receipt'
    );
    assert.ok(externalRecord);
    assert.ok(gateRecord);
    assert.equal(externalRecord.status, 'open_safe_action_request_route_available');
    assert.equal(gateRecord.status, 'open_safe_action_request_route_available');

    for (const [item, blockerRef] of [
      [externalRecord, 'mag://blockers/external-evidence-1'],
      [gateRecord, 'rca://blockers/evidence-gate-1'],
    ] as const) {
      const recorded = runCli([
        'runtime',
        'action',
        'execute',
        '--action',
        item.action_id,
        '--payload',
        JSON.stringify({ typed_blocker_refs: [blockerRef] }),
      ], familyRuntimeEnv(stateRoot, fixtureContractsRoot)).runtime_operator_action_execution;
      assert.equal(recorded.execution.execution_kind, 'opl_cli_external_evidence_apply');
      assert.equal(recorded.execution.result.external_evidence_apply.status, 'recorded');
    }

    const recordedWorklist = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot, {
      OPL_PROVIDER_PROOF_WINDOW_SECONDS: '86400',
      OPL_FAMILY_WORKSPACE_ROOT: familyWorkspaceRoot,
    })).family_runtime_evidence_worklist;

    const verifyItems = recordedWorklist.worklist_items.filter((item: { action_kind: string }) =>
      item.action_kind === 'external_evidence_receipt_verify'
      || item.action_kind === 'evidence_gate_receipt_verify'
    );
    assert.equal(verifyItems.length, 2);
    for (const item of verifyItems) {
      const verified = runCli([
        'runtime',
        'action',
        'execute',
        '--action',
        item.action_id,
      ], familyRuntimeEnv(stateRoot, fixtureContractsRoot)).runtime_operator_action_execution;
      assert.equal(verified.execution.execution_kind, 'opl_cli_external_evidence_apply');
      assert.equal(verified.execution.result.external_evidence_apply.status, 'verified');
    }

    const after = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot, {
      OPL_PROVIDER_PROOF_WINDOW_SECONDS: '86400',
      OPL_FAMILY_WORKSPACE_ROOT: familyWorkspaceRoot,
    })).family_runtime_evidence_worklist;

    assert.equal(after.summary.open_safe_action_item_count, 15);
    assert.equal(
      after.summary.open_safe_action_payload_required_item_count
        + after.summary.open_safe_action_payload_free_item_count,
      after.summary.open_safe_action_item_count,
    );
    assert.equal(after.summary.open_worklist_item_count, 15);
    assert.equal(after.summary.closed_worklist_item_count, 6);
    assert.equal(after.summary.closed_refs_only_item_count, 6);
    assert.equal(after.next_action_ledger.summary.typed_blocker_tail_item_count, 2);
    assert.equal(after.next_action_ledger.summary.next_action_item_count, 15);
    assert.equal(after.next_action_ledger.summary.typed_blocker_ref_count, 0);
    assert.equal(after.next_action_ledger.summary.unique_typed_blocker_ref_count, 0);
    assert.equal(after.next_action_ledger.summary.typed_blocker_group_count, 0);
    assert.equal(after.summary.next_action_typed_blocker_ref_count, 0);
    assert.equal(after.summary.next_action_unique_typed_blocker_ref_count, 0);
    assert.equal(after.summary.next_action_typed_blocker_group_count, 0);
    const blockerItems = after.worklist_items.filter((item: { status: string }) =>
      item.status === 'closed_by_domain_owned_typed_blocker'
    );
    assert.equal(blockerItems.length, 2);
    for (const item of blockerItems) {
      assert.equal(item.worklist_status_detail, 'closed_by_domain_owned_typed_blocker_ref');
      assert.equal(item.typed_blocker_refs.length, 1);
      assert.equal(item.evidence_requirement_model, 'evidence_requirement.v1');
      assert.equal(item.evidence_requirement.requirement_id, item.tail_id);
      assert.equal(item.evidence_requirement.status, 'domain_owned_typed_blocker');
      assert.equal(item.evidence_requirement.typed_blocker_ref, item.typed_blocker_ref);
      assert.equal(item.evidence_requirement.requirement_is_completion_claim, false);
      assert.equal(item.evidence_requirement.can_claim_domain_ready, false);
      assert.equal(item.evidence_requirement.can_claim_production_ready, false);
      assert.equal(item.evidence_requirement.can_claim_artifact_authority, false);
      assert.equal(item.evidence_requirement.not_authorized_claims.includes('domain_ready'), true);
      assert.equal(item.evidence_requirement.not_authorized_claims.includes('production_ready'), true);
      assert.equal(item.worklist_item_is_completion_claim, false);
      assert.equal(item.not_authorized_claims.includes('production_ready'), true);
    }
    assert.equal(after.authority_boundary.can_claim_production_ready, false);
    assert.equal(after.authority_boundary.can_authorize_domain_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(familyWorkspaceRoot, { recursive: true, force: true });
  }
});

test('family-runtime evidence-worklist treats domain-declared external closures as receipts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-external-closure-'));
  const domainWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-domain-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const manifest = withEvidenceWorklistSurfaces(
    loadFamilyManifestFixtures().medautogrant,
    ['fundability_strategy'],
    { externalEvidenceRequestCount: 1 },
  );
  const closureRef = 'contracts/external_evidence/fixture-ledger.json#/request_closures/0';
  fs.mkdirSync(path.join(domainWorkspaceRoot, 'contracts', 'external_evidence'), { recursive: true });
  fs.writeFileSync(path.join(
    domainWorkspaceRoot,
    'contracts',
    'external_evidence',
    'fixture-ledger.json',
  ), JSON.stringify({
    surface_kind: 'fixture_external_evidence_receipt_ledger.v1',
    summary: {
      closed_request_count: 1,
      domain_owned_typed_blocker_count: 0,
    },
    request_closures: [
      {
        request_id: 'external_evidence_1',
        closure_state: 'closed_by_verified_external_receipt_ref',
        accepted_return_shape: 'domain_owner_receipt',
        receipt_shape: 'domain_owner_receipt',
        receipt_ref: 'fixture://receipts/external-evidence-1',
        typed_blocker_ref: null,
      },
    ],
  }, null, 2));

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautogrant',
      '--path',
      domainWorkspaceRoot,
      '--manifest-command',
      buildManifestCommand(manifest),
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));

    const before = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot)).family_runtime_evidence_worklist;
    const recordItem = before.worklist_items.find((item: { claim_scope: string }) =>
      item.claim_scope === 'external_evidence_receipt'
    );
    assert.ok(recordItem);

    const recorded = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      recordItem.action_id,
      '--payload',
      JSON.stringify({ typed_blocker_refs: [closureRef] }),
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot)).runtime_operator_action_execution;
    assert.equal(recorded.execution.result.external_evidence_apply.status, 'recorded');

    const recordedWorklist = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot)).family_runtime_evidence_worklist;
    const verifyItem = recordedWorklist.worklist_items.find((item: { action_kind: string }) =>
      item.action_kind === 'external_evidence_receipt_verify'
    );
    assert.ok(verifyItem);

    const verified = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      verifyItem.action_id,
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot)).runtime_operator_action_execution;
    assert.equal(verified.execution.result.external_evidence_apply.status, 'verified');

    const after = runCli(
      appOperatorDetailCommand,
      familyRuntimeEnv(stateRoot, fixtureContractsRoot),
    ).app_operator_drilldown;
    const receiptEnvelope = after.evidence_envelope.envelopes.find(
      (envelope: { envelope_id: string }) =>
        envelope.envelope_id === 'external_evidence_receipt:med-autogrant:external_evidence_1',
    );
    assert.equal(receiptEnvelope.status, 'closed');
    assert.equal(receiptEnvelope.payload_kind, 'domain_owned_receipt_refs');
    assert.deepEqual(receiptEnvelope.typed_blocker_refs, []);
    assert.equal(receiptEnvelope.receipt_refs.includes(closureRef), true);

    const afterWorklist = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot)).family_runtime_evidence_worklist;
    const verifiedItem = afterWorklist.worklist_items.find((item: {
      claim_scope: string;
      domain_id: string;
      action_id: string;
    }) =>
      item.claim_scope === 'external_evidence_receipt'
      && item.domain_id === 'med-autogrant'
      && item.action_id.endsWith(':external_evidence_1:verified')
    );
    assert.ok(verifiedItem);
    assert.equal(verifiedItem.status, 'closed_by_receipt_ref');
    assert.equal(verifiedItem.worklist_status_detail, 'closed_by_opl_external_evidence_ledger_receipt');
    assert.deepEqual(verifiedItem.typed_blocker_refs, []);
    assert.equal(verifiedItem.receipt_refs.includes(closureRef), true);
    assert.equal(afterWorklist.next_action_ledger.summary.typed_blocker_tail_item_count, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(domainWorkspaceRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime evidence-worklist classifies blocked cleanup plans as route-back blockers', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-cleanup-blocker-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const baseManifests = loadFamilyManifestFixtures();
  const manifest = withEvidenceWorklistSurfaces(
    baseManifests.medautoscience,
    ['direction_and_route_selection'],
    { cleanupReady: true },
  );
  manifest.physical_skeleton_follow_through = {
    ...(manifest.physical_skeleton_follow_through as Record<string, unknown>),
    direct_skill_parity_refs: [],
    opl_hosted_parity_refs: [],
    replacement_parity_refs: [],
    provenance_refs: [],
  };
  manifest.legacy_retirement_tombstone_proof = {
    status: 'active_default_caller_evidence_missing',
    active_default_callers: ['legacy-mas-runner'],
    tombstone_refs: [],
    source_refs: [],
  };

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(manifest),
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot));

    const appView = runCli(
      appOperatorDetailCommand,
      familyRuntimeEnv(stateRoot, fixtureContractsRoot),
    ).app_operator_drilldown;
    const cleanupPlan = appView.domain_legacy_cleanup_plan_refs.refs.find(
      (plan: { command_domain_id: string }) => plan.command_domain_id === 'medautoscience',
    );
    assert.equal(cleanupPlan.plan_status, 'blocked');
    assert.equal(cleanupPlan.opl_cleanup_ledger_ready, false);
    assert.deepEqual(cleanupPlan.blocked_reasons, ['missing_replacement_parity_evidence']);

    const cleanupEnvelope = appView.evidence_envelope.envelopes.find(
      (envelope: { envelope_id: string }) =>
        envelope.envelope_id === 'legacy_cleanup:med-autoscience:opl://agents/med-autoscience/legacy-cleanup-plan',
    );
    assert.equal(cleanupEnvelope.status, 'blocked');
    assert.equal(cleanupEnvelope.claim_allowed.typed_blocker_observed, false);
    assert.equal(cleanupEnvelope.claim_allowed.owner_receipt_observed, false);
    assert.deepEqual(cleanupEnvelope.typed_blocker_refs, []);
    assert.deepEqual(cleanupEnvelope.blocked_reasons, cleanupPlan.blocked_reasons);
    assert.equal(appView.summary.evidence_envelope_blocked_count >= 1, true);
    const cleanupTailItem = appView.production_evidence_tail_ledger.tail_items.find(
      (item: { tail_id: string }) =>
        item.tail_id === 'legacy:med-autoscience:1',
    );
    assert.equal(cleanupTailItem.status, 'blocked');
    assert.deepEqual(cleanupTailItem.blocked_reasons, cleanupPlan.blocked_reasons);
    assert.equal(appView.summary.app_operator_production_evidence_tail_blocking_item_count >= 1, true);

    const worklist = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], familyRuntimeEnv(stateRoot, fixtureContractsRoot)).family_runtime_evidence_worklist;
    assert.equal(worklist.evidence_envelope.summary.blocked_envelope_count >= 1, true);
    const cleanupBreakdown = worklist.evidence_envelope.summary.owner_payload_breakdown.find(
      (entry: { payload_kind: string }) => entry.payload_kind === 'opl_cleanup_ledger_refs',
    );
    assert.equal(cleanupBreakdown.open_envelope_count, 0);
    assert.equal(cleanupBreakdown.blocked_envelope_count, 1);
    assert.equal(cleanupBreakdown.typed_blocker_ref_count, 0);
    assert.equal(cleanupBreakdown.blocked_reason_count, 1);
    assert.equal(worklist.evidence_requirement_ledger.summary.typed_blocker_requirement_count, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime evidence-worklist rejects retired production-closeout alias', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-retired-alias-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();

  try {
    const failure = runCliFailure([
      'family-runtime',
      'production-closeout',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });

    assert.equal(failure.payload.error.code, 'unknown_command');
    assert.match(failure.payload.error.message, /Unknown family-runtime subcommand: production-closeout/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime evidence-worklist rejects non-production provider fallback', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-provider-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();

  try {
    const failure = runCliFailure([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'local_sqlite',
      '--executor-kind',
      'codex_cli',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });

    assert.equal(failure.payload.error.code, 'cli_usage_error');
    assert.match(failure.payload.error.message, /supports only --provider temporal/);
    assert.equal(failure.payload.error.details.provider_kind, 'local_sqlite');
    assert.deepEqual(failure.payload.error.details.allowed_provider_kinds, ['temporal']);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
