import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

import type {
  TemporalStageAttemptWorkflowInput,
  TemporalStageQualityAttemptMaterializationInput,
  TemporalStageRunWorkflowInput,
} from '../../src/modules/runway/family-runtime-temporal.ts';
import { StageRunWorkflow } from '../../src/modules/runway/family-runtime-temporal-workflows.ts';
import { normalizeStageQualityCyclePolicy } from '../../src/modules/stagecraft/stage-quality-cycle.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');

function stageRunInput(id: string): TemporalStageRunWorkflowInput {
  return {
    stage_run_id: `stage-run:${id}`,
    stage_run_invocation_id: `stage-run-invocation:${id}`,
    stage_run_spec_sha256: `stage-run-spec:${id}`,
    stage_run_spec: {
      surface_kind: 'opl_stage_run_immutable_spec',
      version: 'opl-stage-run-immutable-spec.v1',
      domain_id: 'redcube',
      stage_id: 'artifact_creation',
      action_id: null,
      task_id: null,
      workspace_identity: { workspace_root: '/tmp/rca-stage-run-controller' },
      stage_manifest: { ref: 'agent/stages/manifest.json', sha256: 'sha256:manifest' },
      quality_policy: { ref: 'policy:artifact-creation', body: {} },
      stage_packet_ref: 'packet:artifact-creation',
      checkpoint_refs: [],
      source_fingerprint: 'sha256:source',
      source_refs: ['source:brief'],
      input_artifacts: [],
      content_bindings: [],
      role_prompt_refs: {
        producer: 'prompt:producer', reviewer: 'prompt:reviewer',
        repairer: 'prompt:repairer', re_reviewer: 'prompt:re-reviewer',
      },
      quality_rubric_refs: ['rubric:visual'],
      stage_goal_refs: ['goal:artifact-creation'],
      lineage_refs: ['lineage:fixture'],
      package_closure: null,
      executor_kind: 'codex_cli',
      stage_attempt_executor_policy: null,
      parent_route_decision_ref: null,
    },
    parent_route_decision_ref: null,
    workflow_id: `stage-run-workflow:${id}`,
    domain_id: 'redcube',
    stage_id: 'artifact_creation',
    declared_stage_ids: ['storyline', 'artifact_creation', 'review_and_revision', 'package_and_handoff'],
    workspace_locator: { workspace_root: '/tmp/rca-stage-run-controller' },
    source_fingerprint: 'sha256:source',
    executor_kind: 'codex_cli',
    stage_packet_ref: 'packet:artifact-creation',
    quality_policy_ref: 'contracts/stage_quality_cycle_policy.json#/stages/artifact_creation',
    domain_pack_root: '/tmp/rca-domain-pack',
    stage_manifest_ref: 'agent/stages/manifest.json',
    stage_manifest_sha256: 'sha256:manifest',
    stage_role: null,
    quality_policy: normalizeStageQualityCyclePolicy({
      formal_review: { required: true, risk_tier: 'high', max_repair_rounds: 3 },
    }),
    role_prompt_refs: {
      producer: 'agent/prompts/stage-quality-cycle-roles.md#producer',
      reviewer: 'agent/prompts/stage-quality-cycle-roles.md#reviewer',
      repairer: 'agent/prompts/stage-quality-cycle-roles.md#repairer',
      re_reviewer: 'agent/prompts/stage-quality-cycle-roles.md#re-reviewer',
    },
    quality_rubric_refs: ['rubric:visual'],
    stage_goal_refs: ['goal:artifact-creation'],
    source_refs: ['source:brief'],
  };
}

async function runController(input: {
  id: string;
  closeFindingAfterRound: number | null;
  formalReviewRequired?: boolean;
  failRole?: TemporalStageQualityAttemptMaterializationInput['attempt_role'];
  softBlockRole?: TemporalStageQualityAttemptMaterializationInput['attempt_role'];
  omitIdentityReceiptForRole?: TemporalStageQualityAttemptMaterializationInput['attempt_role'];
  reviewerIdentityDrift?: boolean;
  repairerAttemptsTerminalDecision?: boolean;
  terminalRouteTarget?: string;
  invalidReReviewClosure?: boolean;
  initialReviewerOutcome?: 'pass' | 'repair_required' | 'quality_debt';
}) {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-run-controller-${input.id}-${Date.now()}`;
  const attempts: TemporalStageQualityAttemptMaterializationInput[] = [];
  try {
    const activities = {
      async stageQualityAttemptMaterializeActivity(materialization: TemporalStageQualityAttemptMaterializationInput) {
        attempts.push(materialization);
        const role = materialization.attempt_role;
        const round = materialization.quality_round_index;
        const contextManifest = {
          surface_kind: 'opl_stage_quality_attempt_context_manifest',
          version: 'stage-quality-attempt-context-manifest.v1',
          cross_stage_route_selection: {
            surface_kind: 'opl_stage_run_route_selection_context',
            version: 'stage-run-route-selection-context.v1',
            configured_decisive_attempt_roles: materialization.stage_run.quality_policy.formal_review.required
              ? ['reviewer', 're_reviewer']
              : ['producer'],
            current_attempt_role: role,
            declared_stage_ids: materialization.stage_run.declared_stage_ids,
            max_repair_rounds: materialization.stage_run.quality_policy.formal_review.max_repair_rounds,
          },
        };
        const workflowInput: TemporalStageAttemptWorkflowInput = {
          stage_attempt_id: `sat_${input.id}_${role}_${round}`,
          workflow_id: `wf_${input.id}_${role}_${round}`,
          domain_id: materialization.stage_run.domain_id,
          stage_id: materialization.stage_run.stage_id,
          workspace_locator: materialization.stage_run.workspace_locator,
          source_fingerprint: materialization.stage_run.source_fingerprint,
          executor_kind: 'codex_cli',
          retry_budget: { max_attempts: 1 },
          stage_packet_ref: materialization.stage_run.stage_packet_ref,
          checkpoint_refs: [materialization.stage_run.stage_packet_ref],
          stage_run_id: materialization.stage_run.stage_run_id,
          quality_cycle_id: materialization.quality_cycle_id,
          attempt_role: role,
          quality_round_index: round,
          parent_attempt_ref: materialization.parent_attempt_ref,
          parent_attempt_lineage: materialization.parent_attempt_ref
            ? {
                stage_run_id: materialization.stage_run.stage_run_id,
                quality_cycle_id: materialization.quality_cycle_id,
              }
            : null,
          input_artifact_refs: materialization.artifact_refs,
          reviewed_artifact_hashes: materialization.artifact_hashes,
          quality_source_refs: materialization.stage_run.source_refs,
          quality_rubric_refs: materialization.stage_run.quality_rubric_refs,
          prior_finding_refs: (materialization.findings ?? []).map((finding) => finding.finding_id),
          repair_map_refs: (materialization.repair_map ?? []).map(
            (entry) => `repair-map:${entry.finding_id}`,
          ),
          quality_role_prompt_ref: materialization.stage_run.role_prompt_refs[role],
          context_manifest_ref: `context:${role}:${round}`,
          no_context_inheritance: true,
          quality_context: {
            context_manifest: contextManifest,
            findings: materialization.findings ?? [],
            repair_map: materialization.repair_map ?? [],
          },
        };
        return {
          attempt_ref: `opl://stage_attempts/${workflowInput.stage_attempt_id}`,
          workflow_input: workflowInput,
        };
      },
      async stageQualityCycleProjectActivity() {
        return { projected: true };
      },
      async stageQualityAttemptSyncActivity() {
        return { synced: true };
      },
      async stageQualityReviewReceiptActivity(receiptInput: any) {
        return {
          surface_kind: 'opl_stage_review_receipt',
          version: 'stage-review-receipt.v1',
          stage_run_id: `stage-run:${input.id}`,
          quality_cycle_id: `quality-cycle:stage-run:${input.id}`,
          producer_attempt_ref: receiptInput.producer_attempt_ref,
          reviewer_attempt_ref: receiptInput.reviewer_attempt_ref,
          producer_session_ref: `codex://threads/${receiptInput.producer_attempt_ref}`,
          reviewer_session_ref: `codex://threads/${receiptInput.reviewer_attempt_ref}`,
          no_context_inheritance: true,
          reviewed_artifact_refs: ['artifact:deck-v1'],
          reviewed_artifact_hashes: ['sha256:deck-v1'],
          rubric_refs: receiptInput.rubric_refs,
          verdict: receiptInput.verdict,
        };
      },
      async stageRunRouteLaunchActivity(routeInput: any) {
        const complete = routeInput.decision.decision_kind === 'complete';
        return {
          surface_kind: 'opl_stage_run_route_launch_receipt',
          version: 'opl-stage-run-route-launch-receipt.v1',
          materialization_status: complete ? 'workflow_complete' : 'launched',
          parent_stage_run_id: routeInput.parent_stage_run.stage_run_id,
          decisive_attempt_ref: routeInput.decisive_attempt_ref,
          parent_route_decision_ref: `route:${routeInput.decisive_attempt_ref}`,
          route_decision_sha256: 'sha256:route',
          decision: routeInput.decision,
          target_stage_run_id: complete ? null : `target:${routeInput.decision.target_stage_id}`,
          target_stage_run_invocation_id: complete ? null : `invocation:${routeInput.decision.target_stage_id}`,
          target_stage_run_spec_sha256: complete ? null : 'sha256:target-spec',
          target_workflow_id: complete ? null : `workflow:${routeInput.decision.target_stage_id}`,
          durable_launch: complete ? null : { start_status: 'started' },
          authority_boundary: {
            semantic_route_decision_owner: 'decisive_codex_attempt',
            stage_transition_materialization_owner: 'opl_stage_run_controller',
            opl_can_select_semantic_stage_route: false,
          },
        };
      },
      async codexStageActivity(attempt: TemporalStageAttemptWorkflowInput) {
        return {
          stage_attempt_id: attempt.stage_attempt_id,
          checkpoint_refs: [],
          progress_summary: {
            thread_id: `thread-${input.id}-${attempt.attempt_role}-${attempt.quality_round_index}`,
            execution_session_ref:
              `codex://threads/thread-${input.id}-${attempt.attempt_role}-${attempt.quality_round_index}`,
          },
          closeout_packet: {
            surface_kind: 'stage_attempt_closeout_packet',
            stage_attempt_id: attempt.stage_attempt_id,
            closeout_refs: [`closeout:${attempt.stage_attempt_id}`],
          },
        };
      },
      async domainHandlerDispatchActivity(attempt: TemporalStageAttemptWorkflowInput) {
        const role = attempt.attempt_role;
        const round = attempt.quality_round_index ?? 0;
        if (role === input.failRole) {
          throw new Error(`simulated-${role}-protocol-failure`);
        }
        const finding = {
          finding_id: 'finding:visual-clipping',
          severity: 'critical',
          required: true,
          evidence_refs: [`screenshot:v${round + 1}`],
          repair_expectation: 'Remove clipping while preserving the approved claim.',
        };
        const artifactVersion = role === 'reviewer' && input.reviewerIdentityDrift
          ? 99
          : role === 'producer' || role === 'reviewer' ? 1 : round + 1;
        const stageQualityCycle: Record<string, unknown> = {
          outcome: role === 'reviewer' ? (input.initialReviewerOutcome ?? 'repair_required') : 'pass',
          artifact_refs: [`artifact:deck-v${artifactVersion}`],
          artifact_hashes: [`sha256:deck-v${artifactVersion}`],
        };
        if (role === 'reviewer') {
          stageQualityCycle.findings = [finding];
        }
        if (role === 'repairer') {
          stageQualityCycle.repair_map = [{
            finding_id: finding.finding_id,
            repair_status: 'repaired',
            changed_artifact_refs: [`artifact:deck-v${artifactVersion}`],
            repair_evidence_refs: [`diff:deck-v${artifactVersion}`],
          }];
        }
        if (role === 're_reviewer') {
          const closed = input.closeFindingAfterRound !== null && round >= input.closeFindingAfterRound;
          stageQualityCycle.finding_closures = input.invalidReReviewClosure
            ? []
            : [{
                finding_id: finding.finding_id,
                status: closed ? 'closed' : 'still_open',
                evidence_refs: [`screenshot:deck-v${artifactVersion}`],
              }];
          stageQualityCycle.repair_regressions = [];
          stageQualityCycle.critical_new_findings = [];
          stageQualityCycle.optional_observations = [{
            observation_id: `observation:editorial-${round}`,
            evidence_refs: [`artifact:deck-v${artifactVersion}`],
            summary: 'Optional editorial polish only.',
          }];
        }
        const routeImpact: Record<string, unknown> = { stage_quality_cycle: stageQualityCycle };
        if (role === 'producer' && input.formalReviewRequired === false) {
          routeImpact.stage_route_decision = {
            decision_kind: 'advance',
            target_stage_id: input.terminalRouteTarget ?? 'review_and_revision',
            evidence_refs: [`artifact:deck-v${artifactVersion}`],
          };
        }
        if (
          role === 'reviewer'
          && ['pass', 'quality_debt'].includes(input.initialReviewerOutcome ?? '')
        ) {
          routeImpact.stage_route_decision = {
            decision_kind: 'advance',
            target_stage_id: input.terminalRouteTarget ?? 'review_and_revision',
            evidence_refs: [`artifact:deck-v${artifactVersion}`],
          };
        }
        if (role === 'repairer' && input.repairerAttemptsTerminalDecision) {
          routeImpact.stage_route_decision = {
            decision_kind: 'route_back',
            target_stage_id: 'storyline',
            evidence_refs: [finding.finding_id],
          };
        }
        if (role === 're_reviewer') {
          const closed = input.closeFindingAfterRound !== null && round >= input.closeFindingAfterRound;
          if (closed || round === 3) {
            routeImpact.stage_route_decision = {
              decision_kind: closed ? 'advance' : 'repeat',
              target_stage_id: closed ? (input.terminalRouteTarget ?? 'review_and_revision') : 'artifact_creation',
              evidence_refs: [`screenshot:deck-v${artifactVersion}`],
            };
          }
        }
        return {
          closeout_refs: [`closeout:${attempt.stage_attempt_id}`],
          closeout_ref_metadata: (
            (role === 'producer' || role === 'repairer')
            && role !== input.omitIdentityReceiptForRole
          )
            ? [{
                ref: `artifact:deck-v${artifactVersion}`,
                sha256: `sha256:deck-v${artifactVersion}`,
              }]
            : [],
          route_impact: routeImpact,
          ...(role === input.softBlockRole ? { blocked_reason: `soft-${role}-quality-debt` } : {}),
          domain_ready_verdict: 'domain_gate_pending',
        };
      },
    };
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src/modules/runway/family-runtime-temporal-workflows.ts'),
      activities,
    });
    const state = await worker.runUntil(async () => {
      const workflowInput = stageRunInput(input.id);
      workflowInput.quality_policy = normalizeStageQualityCyclePolicy({
        formal_review: {
          required: input.formalReviewRequired ?? true,
          risk_tier: 'high',
          max_repair_rounds: 3,
        },
      });
      const handle = await testEnv.client.workflow.start(StageRunWorkflow, {
        args: [workflowInput],
        taskQueue,
        workflowId: `stage-run-controller:${input.id}:${Date.now()}`,
      });
      return await handle.result();
    });
    return { state, attempts };
  } finally {
    await testEnv.teardown();
  }
}

test('StageRun controller materializes isolated producer-review-repair-re-review child workflows', async () => {
  const { state, attempts } = await runController({ id: 'closure', closeFindingAfterRound: 1 });
  assert.equal(state.status, 'completed');
  assert.equal(state.repair_rounds_used, 1);
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer', 'repairer', 're_reviewer',
  ]);
  assert.equal(new Set(state.attempts.map((attempt) => attempt.execution_session_ref)).size, 4);
  assert.deepEqual(state.artifact_refs, ['artifact:deck-v2']);
  assert.equal(state.sqlite_projection.status, 'synced');
  assert.equal(state.review_receipts.length, 2);
  assert.equal(state.decisive_attempt_role, 're_reviewer');
  assert.equal(state.selected_stage_route?.target_stage_id, 'review_and_revision');
  assert.equal(state.next_stage_run_launch?.materialization_status, 'launched');
  assert.equal(state.next_stage_run_launch?.target_stage_run_id, 'target:review_and_revision');
  assert.equal(state.route_quality_debt_refs.length, 0);
});

test('StageRun controller caps quality work at three repair rounds and carries consumable debt', async () => {
  const { state, attempts } = await runController({ id: 'budget', closeFindingAfterRound: null });
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.repair_rounds_used, 3);
  assert.equal(attempts.length, 8);
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer',
    'repairer', 're_reviewer',
    'repairer', 're_reviewer',
    'repairer', 're_reviewer',
  ]);
  assert.ok(state.quality_debt_refs.includes('quality-debt:finding:visual-clipping'));
  assert.equal(state.sqlite_projection.status, 'synced');
  assert.equal(state.review_receipts.length, 4);
  assert.equal(state.decisive_attempt_role, 're_reviewer');
  assert.equal(state.selected_stage_route?.decision_kind, 'repeat');
});

test('primary-only StageRun makes the producer the sole decisive route owner', async () => {
  const { state, attempts } = await runController({
    id: 'primary-route-owner',
    closeFindingAfterRound: null,
    formalReviewRequired: false,
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer']);
  assert.equal(state.status, 'completed');
  assert.equal(state.decisive_attempt_role, 'producer');
  assert.equal(state.selected_stage_route?.decision_kind, 'advance');
  assert.equal(state.selected_stage_route?.target_stage_id, 'review_and_revision');
  assert.equal(state.next_stage_run_launch?.target_stage_run_id, 'target:review_and_revision');
});

test('reviewer quality-debt verdict terminalizes the StageRun and retains reviewer route authority', async () => {
  const { state, attempts } = await runController({
    id: 'reviewer-quality-debt',
    closeFindingAfterRound: null,
    initialReviewerOutcome: 'quality_debt',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.decisive_attempt_role, 'reviewer');
  assert.equal(state.selected_stage_route?.target_stage_id, 'review_and_revision');
  assert.equal(state.review_receipts[0]?.verdict, 'quality_debt');
});

test('recoverable producer and repairer quality debt still reaches fresh formal Review', async () => {
  const producerDebt = await runController({
    id: 'producer-debt-continues',
    closeFindingAfterRound: 1,
    softBlockRole: 'producer',
  });
  assert.deepEqual(producerDebt.attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer', 'repairer', 're_reviewer',
  ]);
  assert.equal(producerDebt.state.status, 'completed');

  const repairDebt = await runController({
    id: 'repair-debt-continues',
    closeFindingAfterRound: 1,
    softBlockRole: 'repairer',
  });
  assert.deepEqual(repairDebt.attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer', 'repairer', 're_reviewer',
  ]);
  assert.equal(repairDebt.state.status, 'completed');
});

test('repairer terminal route output is rejected and fresh re-review remains decisive', async () => {
  const { state, attempts } = await runController({
    id: 'repairer-route-rejected',
    closeFindingAfterRound: 1,
    repairerAttemptsTerminalDecision: true,
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer', 'repairer', 're_reviewer',
  ]);
  assert.equal(state.decisive_attempt_role, 're_reviewer');
  assert.equal(state.selected_stage_route?.target_stage_id, 'review_and_revision');
  assert.ok(state.route_quality_debt_refs.some((ref) => ref.includes('attempt_role_is_not_configured_decisive_role')));
});

test('undeclared terminal route target is not materialized and does not discard reviewed progress', async () => {
  const { state } = await runController({
    id: 'undeclared-route-target',
    closeFindingAfterRound: 1,
    terminalRouteTarget: 'missing-stage',
  });
  assert.equal(state.status, 'completed');
  assert.equal(state.selected_stage_route, null);
  assert.ok(state.route_quality_debt_refs.some((ref) => ref.includes('route_target_is_not_a_declared_stage')));
  assert.ok(state.route_quality_debt_refs.some((ref) => ref.includes('decisive_attempt_route_decision_missing')));
});

test('invalid re-review closure cannot leave a route decision behind', async () => {
  const { state } = await runController({
    id: 'invalid-re-review-closure',
    closeFindingAfterRound: 1,
    invalidReReviewClosure: true,
  });
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.selected_stage_route, null);
  assert.equal(state.decisive_attempt_ref, null);
  assert.ok(state.route_quality_debt_refs.some((ref) => ref.includes('re_review_closure_contract_invalid')));
  assert.ok(state.route_quality_debt_refs.some((ref) => ref.includes('decisive_attempt_route_decision_missing')));
});

test('reviewer protocol failure terminalizes a consumable producer artifact as quality debt', async () => {
  const { state, attempts } = await runController({
    id: 'reviewer-failure',
    closeFindingAfterRound: null,
    failRole: 'reviewer',
  });
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.deepEqual(state.attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.attempts[1]?.status, 'failed');
  assert.deepEqual(state.artifact_refs, ['artifact:deck-v1']);
  assert.deepEqual(state.artifact_identity_receipt_refs, ['artifact:deck-v1']);
  assert.equal(state.review_receipts.length, 0);
});

test('reviewer artifact identity drift is rejected without forging a review receipt', async () => {
  const { state, attempts } = await runController({
    id: 'reviewer-drift',
    closeFindingAfterRound: null,
    reviewerIdentityDrift: true,
  });
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.deepEqual(state.artifact_refs, ['artifact:deck-v1']);
  assert.equal(state.review_receipts.length, 0);
});

test('producer failure without a consumable artifact hard-stops the StageRun', async () => {
  const { state, attempts } = await runController({
    id: 'producer-failure',
    closeFindingAfterRound: null,
    failRole: 'producer',
  });
  assert.equal(state.status, 'blocked');
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer']);
  assert.deepEqual(state.attempts.map((attempt) => attempt.attempt_role), ['producer']);
  assert.equal(state.attempts[0]?.status, 'failed');
  assert.equal(state.artifact_refs.length, 0);
  assert.equal(state.review_receipts.length, 0);
});

test('producer artifact without a domain SHA receipt cannot enter formal Review', async () => {
  const { state, attempts } = await runController({
    id: 'producer-missing-identity-receipt',
    closeFindingAfterRound: null,
    omitIdentityReceiptForRole: 'producer',
  });
  assert.equal(state.status, 'blocked');
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer']);
  assert.equal(state.artifact_refs.length, 0);
  assert.equal(state.review_receipts.length, 0);
});
