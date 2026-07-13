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
    workflow_id: `stage-run-workflow:${id}`,
    domain_id: 'redcube',
    stage_id: 'artifact_creation',
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
  failRole?: TemporalStageQualityAttemptMaterializationInput['attempt_role'];
  omitIdentityReceiptForRole?: TemporalStageQualityAttemptMaterializationInput['attempt_role'];
  reviewerIdentityDrift?: boolean;
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
          outcome: role === 'reviewer' ? 'repair_required' : 'pass',
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
          stageQualityCycle.finding_closures = [{
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
          route_impact: { stage_quality_cycle: stageQualityCycle },
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
      const handle = await testEnv.client.workflow.start(StageRunWorkflow, {
        args: [stageRunInput(input.id)],
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
