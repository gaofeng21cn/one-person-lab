import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  loadFrameworkContracts,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';
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
  assert.equal(ledger.summary.typed_blocker_ref_count, 3);
  assert.equal(ledger.summary.unique_typed_blocker_ref_count, 2);
  assert.equal(ledger.summary.typed_blocker_group_count, 2);
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
    if (!('worklist_items' in worklist)) {
      throw new Error('expected full evidence worklist payload');
    }

    assert.equal(queryCount, 1);
    assert.equal(worklist.summary.domain_dispatch_evidence_workorder_count, 0);
    assert.equal(worklist.terminal_observation_sync.synced_attempt_count, 1);
    assert.equal(worklist.terminal_observation_sync.authority_boundary.can_generate_domain_owner_receipt, false);
    assert.equal(worklist.worklist_items.some((item: { action_id: string }) =>
      item.action_id === `domain_dispatch:medautoscience:${stageAttemptId}:record`
    ), false);
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

test('family-runtime evidence-worklist rejects retired alias and non-production provider fallback', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-evidence-worklist-provider-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();

  try {
    const aliasFailure = runCliFailure([
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
    const providerFailure = runCliFailure([
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

    assert.equal(aliasFailure.payload.error.code, 'unknown_command');
    assert.match(aliasFailure.payload.error.message, /Unknown family-runtime subcommand: production-closeout/);
    assert.equal(providerFailure.payload.error.code, 'cli_usage_error');
    assert.deepEqual(providerFailure.payload.error.details.allowed_provider_kinds, ['temporal']);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
