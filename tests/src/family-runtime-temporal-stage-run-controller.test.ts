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
        const finding = {
          finding_id: 'finding:visual-clipping',
          severity: 'critical',
          required: true,
          evidence_refs: [`screenshot:v${round + 1}`],
          repair_expectation: 'Remove clipping while preserving the approved claim.',
        };
        const artifactVersion = role === 'producer' || role === 'reviewer' ? 1 : round + 1;
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
});
