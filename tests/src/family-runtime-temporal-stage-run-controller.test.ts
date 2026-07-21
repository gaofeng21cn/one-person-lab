import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { Worker } from '@temporalio/worker';

import type {
  TemporalStageAttemptWorkflowInput,
  TemporalStageQualityAttemptMaterializationInput,
  TemporalStageRunWorkflowInput,
} from '../../src/modules/runway/family-runtime-temporal.ts';
import { StageRunWorkflow } from '../../src/modules/runway/family-runtime-temporal-workflows.ts';
import { STAGE_RUN_ATTEMPT_CONTENT_BINDING_VERSION } from '../../src/modules/runway/family-runtime-stage-quality-attempt-boundary.ts';
import {
  stageAttemptExecutionContentBindingSha256,
  stageRunSpecSha256,
} from '../../src/modules/runway/family-runtime-stage-run-identity.ts';
import {
  normalizeStageQualityCyclePolicy,
  type StageQualityOutcome,
} from '../../src/modules/stagecraft/stage-quality-cycle.ts';
import { createTemporalTestWorkflowEnvironment } from './temporal-test-environment.ts';

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
  maxRepairRounds?: number;
  maxTokens?: number | null;
  tokensPerAttempt?: number;
  executionFormalReviewRequired?: boolean;
  executionMaxRepairRounds?: number;
  executionDeclaredStageIds?: string[];
  executionRubricRefsByRole?: Partial<Record<
    TemporalStageQualityAttemptMaterializationInput['attempt_role'],
    string[]
  >>;
  failRole?: TemporalStageQualityAttemptMaterializationInput['attempt_role'];
  preflightHardBlockRole?: TemporalStageQualityAttemptMaterializationInput['attempt_role'];
  preflightBlockedReason?: string;
  softBlockRole?: TemporalStageQualityAttemptMaterializationInput['attempt_role'];
  omitArtifactForRole?: 'producer' | 'repairer';
  omitIdentityReceiptForRole?: TemporalStageQualityAttemptMaterializationInput['attempt_role'];
  reviewerIdentityDrift?: boolean;
  repairerAttemptsTerminalDecision?: boolean;
  terminalRouteTarget?: string;
  invalidReReviewClosure?: boolean;
  initialReviewerOutcome?: StageQualityOutcome;
  initialReviewerFindings?: 'required' | 'none';
  reReviewerOutcome?: StageQualityOutcome;
  reReviewerOptionalObservation?: boolean;
  reReviewerHardStopClass?: string;
  invalidReReviewerHardStopEvidence?: boolean;
  legacyVerdictRole?: TemporalStageQualityAttemptMaterializationInput['attempt_role'];
  nonReviewOutcomeRole?: 'producer' | 'repairer';
  failReceiptForReviewerRole?: 'reviewer' | 're_reviewer';
  rawArtifactProgressRole?: 'producer';
  repairRequiredRoute?: {
    role: 'reviewer' | 're_reviewer';
    decisionKind: 'advance' | 'route_back';
    targetStageId: string;
  };
}) {
  const testEnv = await createTemporalTestWorkflowEnvironment();
  const taskQueue = `opl-stage-run-controller-${input.id}-${Date.now()}`;
  const attempts: TemporalStageQualityAttemptMaterializationInput[] = [];
  const workflowInputs: TemporalStageAttemptWorkflowInput[] = [];
  const reviewReceiptInputs: any[] = [];
  const routeInputs: any[] = [];
  try {
    const activities = {
      async stageQualityAttemptMaterializeActivity(materialization: TemporalStageQualityAttemptMaterializationInput) {
        attempts.push(materialization);
        const role = materialization.attempt_role;
        const round = materialization.quality_round_index;
        const executionPolicy = normalizeStageQualityCyclePolicy({
          formal_review: {
            required: input.executionFormalReviewRequired ?? input.formalReviewRequired ?? true,
            risk_tier: 'high',
            max_repair_rounds:
              input.executionMaxRepairRounds ?? input.maxRepairRounds ?? 3,
            ...(input.maxTokens === undefined
              ? {}
              : { scope_budget: { max_tokens: input.maxTokens } }),
          },
        });
        const executionDeclaredStageIds = [...new Set(
          input.executionDeclaredStageIds ?? materialization.stage_run.declared_stage_ids,
        )].sort();
        const executionRubricRefs = input.executionRubricRefsByRole?.[role]
          ?? materialization.stage_run.quality_rubric_refs;
        const executionSpec = {
          ...materialization.stage_run.stage_run_spec,
          quality_policy: {
            ref: materialization.stage_run.quality_policy_ref,
            body: executionPolicy,
          },
          role_prompt_refs: materialization.stage_run.role_prompt_refs,
          quality_rubric_refs: executionRubricRefs,
        };
        const executionSpecSha256 = stageRunSpecSha256(executionSpec);
        const executionBindingPayload = {
          surface_kind: 'opl_stage_attempt_execution_content_binding' as const,
          version: 'opl-stage-attempt-execution-content-binding.v1' as const,
          parent_stage_run_spec_sha256: materialization.stage_run.stage_run_spec_sha256,
          use_boundary_id: `package-use:${input.id}:${role}:${round}`,
          spec_sha256: executionSpecSha256,
          spec: executionSpec,
          declared_stage_ids: executionDeclaredStageIds,
        };
        const executionContentBinding = {
          ...executionBindingPayload,
          binding_sha256: stageAttemptExecutionContentBindingSha256(executionBindingPayload),
        };
        const qualityScopeBudget = executionPolicy.formal_review.scope_budget;
        const contextManifest = {
          surface_kind: 'opl_stage_quality_attempt_context_manifest',
          version: 'stage-quality-attempt-context-manifest.v1',
          cross_stage_route_selection: {
            surface_kind: 'opl_stage_run_route_selection_context',
            version: 'stage-run-route-selection-context.v1',
            configured_decisive_attempt_roles: executionPolicy.formal_review.required
              ? ['reviewer', 're_reviewer']
              : ['producer'],
            current_attempt_role: role,
            declared_stage_ids: executionDeclaredStageIds,
            max_repair_rounds: executionPolicy.formal_review.max_repair_rounds,
            quality_scope_budget: qualityScopeBudget,
          },
          quality_scope_budget: qualityScopeBudget,
        };
        const workflowInput: TemporalStageAttemptWorkflowInput = {
          stage_attempt_id: `sat_${input.id}_${role}_${round}`,
          workflow_id: `wf_${input.id}_${role}_${round}`,
          domain_id: materialization.stage_run.domain_id,
          stage_id: materialization.stage_run.stage_id,
          workspace_locator: materialization.stage_run.workspace_locator,
          source_fingerprint: materialization.stage_run.source_fingerprint,
          executor_kind: 'codex_cli',
          retry_budget: { max_attempts: 1, quality_scope_budget: qualityScopeBudget },
          stage_packet_ref: materialization.stage_run.stage_packet_ref,
          checkpoint_refs: [materialization.stage_run.stage_packet_ref],
          stage_run_id: materialization.stage_run.stage_run_id,
          stage_run_content_binding_version: STAGE_RUN_ATTEMPT_CONTENT_BINDING_VERSION,
          stage_run_spec_sha256: materialization.stage_run.stage_run_spec_sha256,
          stage_run_spec: materialization.stage_run.stage_run_spec,
          execution_content_binding: executionContentBinding,
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
          quality_rubric_refs: executionRubricRefs,
          prior_finding_refs: (materialization.findings ?? []).map((finding) => finding.finding_id),
          repair_map_refs: (materialization.repair_map ?? []).map(
            (entry) => `repair-map:${entry.finding_id}`,
          ),
          quality_role_prompt_ref: executionSpec.role_prompt_refs[role],
          context_manifest_ref: `context:${role}:${round}`,
          no_context_inheritance: true,
          quality_context: {
            context_manifest: contextManifest,
            findings: materialization.findings ?? [],
            repair_map: materialization.repair_map ?? [],
          },
        };
        workflowInputs.push(workflowInput);
        return {
          attempt_ref: `opl://stage_attempts/${workflowInput.stage_attempt_id}`,
          workflow_input: workflowInput,
        };
      },
      async stageQualityCycleProjectActivity() {
        return { projected: true };
      },
      async stageQualityAttemptSyncActivity(syncInput: { attempt_ref: string }) {
        return {
          synced: true,
          opl_review_evidence_artifact_receipt_ref: null,
          opl_review_evidence_artifact_receipt: null,
        };
      },
      async stageQualityReviewReceiptActivity(receiptInput: any) {
        reviewReceiptInputs.push(receiptInput);
        const reviewerRole = String(receiptInput.reviewer_attempt_ref).includes('_re_reviewer_')
          ? 're_reviewer'
          : 'reviewer';
        if (reviewerRole === input.failReceiptForReviewerRole) {
          throw new Error(`contract_shape_invalid:simulated-${reviewerRole}-receipt-validation-failure`);
        }
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
          opl_review_evidence_artifact_receipt_ref: null,
          opl_review_evidence_artifact_receipt: null,
        };
      },
      async stageRunRouteLaunchActivity(routeInput: any) {
        routeInputs.push(routeInput);
        const complete = routeInput.decision.decision_kind === 'complete';
        return {
          surface_kind: 'opl_stage_run_route_launch_receipt',
          version: 'opl-stage-run-route-launch-receipt.v1',
          materialization_status: complete ? 'workflow_complete' : 'launched',
          parent_stage_run_id: routeInput.parent_stage_run.stage_run_id,
          decisive_attempt_ref: routeInput.decisive_attempt_ref,
          decisive_execution_content_binding_sha256:
            routeInput.decisive_execution_content_binding.binding_sha256,
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
        if (attempt.attempt_role === input.preflightHardBlockRole) {
          return {
            stage_attempt_id: attempt.stage_attempt_id,
            checkpoint_refs: [],
            progress_summary: {},
            process_output_summary: {
              blocked_reason: input.preflightBlockedReason ?? 'codex_cli_provider_unavailable',
            },
            closeout_packet: null,
          };
        }
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
          ...(input.tokensPerAttempt === undefined
            ? {}
            : { cost_summary: { token_usage: { total_tokens: input.tokensPerAttempt } } }),
        };
      },
      async domainHandlerDispatchActivity(attempt: TemporalStageAttemptWorkflowInput) {
        const role = attempt.attempt_role;
        const round = attempt.quality_round_index ?? 0;
        if (role === input.preflightHardBlockRole && attempt.provider_blocker) {
          const blockedReason = attempt.provider_blocker.blocked_reason ?? 'codex_cli_provider_unavailable';
          const blockerRef = `opl://stage-attempts/${attempt.stage_attempt_id}/runtime-blockers/${blockedReason}`;
          return {
            activity_status: 'blocked',
            closeout_refs: [blockerRef],
            rejected_writes: [{
              surface_kind: 'opl_provider_runtime_typed_blocker_ref',
              blocker_id: blockedReason,
              blocker_ref: blockerRef,
            }],
            route_impact: attempt.provider_blocker.route_impact ?? {},
            blocked_reason: blockedReason,
            authority_boundary: { provider_runtime_blocker_ref_only: true },
          };
        }
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
        const reviewedArtifactVersion = Number(
          attempt.input_artifact_refs?.[0]?.match(/artifact:deck-v(\d+)/)?.[1] ?? 1,
        );
        const artifactVersion = role === 'reviewer' && input.reviewerIdentityDrift
          ? 99
          : role === 'producer'
            ? 1
            : role === 'reviewer' || role === 're_reviewer'
              ? reviewedArtifactVersion
              : round + 1;
        const reReviewClosed = role === 're_reviewer'
          && input.closeFindingAfterRound !== null
          && round >= input.closeFindingAfterRound;
        const attemptOutcome: StageQualityOutcome = role === 'reviewer'
          ? (input.initialReviewerOutcome ?? 'repair_required')
          : role === 're_reviewer'
            ? (input.reReviewerOutcome ?? (reReviewClosed ? 'pass' : 'repair_required'))
            : 'pass';
        const stageQualityCycle: Record<string, unknown> = role === input.omitArtifactForRole
          ? {}
          : {
              artifact_refs: [`artifact:deck-v${artifactVersion}`],
              artifact_hashes: [`sha256:deck-v${artifactVersion}`],
            };
        if (role === input.nonReviewOutcomeRole) {
          stageQualityCycle.outcome = 'pass';
        }
        if (role === 'reviewer' || role === 're_reviewer') {
          stageQualityCycle.outcome = attemptOutcome;
        }
        if (
          (role === 'reviewer' || role === 're_reviewer')
          && (attemptOutcome === 'blocked' || attemptOutcome === 'human_gate')
        ) {
          stageQualityCycle.blocked_reason = role === 're_reviewer'
            ? `re-review-${attemptOutcome}`
            : `reviewer-${attemptOutcome}`;
          if (!input.invalidReReviewerHardStopEvidence) {
            stageQualityCycle.hard_stop_class = attemptOutcome === 'human_gate'
              ? 'human_decision_required'
              : (input.reReviewerHardStopClass ?? 'safety_or_compliance');
            if (attemptOutcome === 'human_gate') {
              stageQualityCycle.human_gate_refs = [`human-gate:${input.id}`];
            } else {
              stageQualityCycle.typed_blocker_refs = [`typed-blocker:${input.id}`];
            }
          }
        }
        if (role === 'reviewer') {
          const findingMode = input.initialReviewerFindings
            ?? (['pass', 'quality_debt'].includes(attemptOutcome) ? 'none' : 'required');
          stageQualityCycle.findings = findingMode === 'none' ? [] : [finding];
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
          if (attemptOutcome !== 'blocked' && attemptOutcome !== 'human_gate') {
            stageQualityCycle.finding_closures = input.invalidReReviewClosure
              ? []
              : [{
                  finding_id: finding.finding_id,
                  status: reReviewClosed ? 'closed' : 'still_open',
                  evidence_refs: [`screenshot:deck-v${artifactVersion}`],
                }];
            stageQualityCycle.repair_regressions = [];
            stageQualityCycle.critical_new_findings = [];
            stageQualityCycle.optional_observations = input.reReviewerOptionalObservation
              ? [{
                  observation_id: `observation:editorial-${round}`,
                  evidence_refs: [`artifact:deck-v${artifactVersion}`],
                  summary: 'Optional editorial polish only.',
                }]
              : [];
          }
        }
        if (role === input.legacyVerdictRole) {
          delete stageQualityCycle.outcome;
          stageQualityCycle.verdict = attemptOutcome;
        }
        const rawArtifactProgress = role === input.rawArtifactProgressRole;
        const routeImpact: Record<string, unknown> = rawArtifactProgress
          ? {}
          : { stage_quality_cycle: stageQualityCycle };
        const routeSelection = (
          attempt.quality_context?.context_manifest as any
        )?.cross_stage_route_selection;
        const attemptFormalReviewRequired = Array.isArray(
          routeSelection?.configured_decisive_attempt_roles,
        ) && routeSelection.configured_decisive_attempt_roles.includes('reviewer');
        const attemptMaxRepairRounds = typeof routeSelection?.max_repair_rounds === 'number'
          ? routeSelection.max_repair_rounds
          : 3;
        if (role === 'producer' && !attemptFormalReviewRequired) {
          routeImpact.stage_route_decision = {
            decision_kind: 'advance',
            target_stage_id: input.terminalRouteTarget ?? 'review_and_revision',
            evidence_refs: [`artifact:deck-v${artifactVersion}`],
          };
        }
        if (
          role === 'reviewer'
          && (
            ['pass', 'quality_debt'].includes(attemptOutcome)
            || (attemptOutcome === 'repair_required' && attemptMaxRepairRounds === 0)
          )
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
          const budgetExhausted = round === attemptMaxRepairRounds;
          if (
            (reReviewClosed && ['pass', 'quality_debt'].includes(attemptOutcome))
            || (!reReviewClosed && attemptOutcome === 'repair_required' && budgetExhausted)
          ) {
            routeImpact.stage_route_decision = {
              decision_kind: 'advance',
              target_stage_id: input.terminalRouteTarget ?? 'review_and_revision',
              evidence_refs: [`screenshot:deck-v${artifactVersion}`],
            };
          }
        }
        const repairRequiredRoute = input.repairRequiredRoute;
        if (
          repairRequiredRoute
          && repairRequiredRoute.role === role
          && attemptOutcome === 'repair_required'
        ) {
          routeImpact.stage_route_decision = {
            decision_kind: repairRequiredRoute.decisionKind,
            target_stage_id: repairRequiredRoute.targetStageId,
            evidence_refs: [finding.finding_id],
          };
        }
        return {
          closeout_refs: [`closeout:${attempt.stage_attempt_id}`],
          closeout_ref_metadata: rawArtifactProgress
            ? [{
                ref: `artifact:deck-v${artifactVersion}`,
                sha256: `sha256:deck-v${artifactVersion}`,
                ref_kind: 'raw_executor_output',
                artifact_identity_receipt_ref: `artifact-identity:deck-v${artifactVersion}`,
              }]
            : (role === 'producer' || role === 'repairer')
            ? [{
                ref: `artifact:deck-v${artifactVersion}`,
                sha256: `sha256:deck-v${artifactVersion}`,
                ...(role !== input.omitIdentityReceiptForRole
                  ? { artifact_identity_receipt_ref: `artifact-identity:deck-v${artifactVersion}` }
                  : {}),
              }]
            : [],
          route_impact: routeImpact,
          ...(role === input.softBlockRole ? { blocked_reason: `soft-${role}-quality-debt` } : {}),
          domain_ready_verdict: 'domain_gate_pending',
          ...(rawArtifactProgress
            ? { authority_boundary: { opl: 'raw_executor_output_progress_envelope_only' } }
            : {}),
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
            max_repair_rounds: input.maxRepairRounds ?? 3,
            ...(input.maxTokens === undefined
              ? {}
              : { scope_budget: { max_tokens: input.maxTokens } }),
        },
      });
      const handle = await testEnv.client.workflow.start(StageRunWorkflow, {
        args: [workflowInput],
        taskQueue,
        workflowId: workflowInput.workflow_id,
      });
      return await handle.result();
    });
    return { state, attempts, workflowInputs, reviewReceiptInputs, routeInputs };
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
  assert.deepEqual(attempts.map((attempt) => attempt.artifact_producer_attempt_ref ?? null), [
    null,
    'opl://stage_attempts/sat_closure_producer_0',
    'opl://stage_attempts/sat_closure_producer_0',
    'opl://stage_attempts/sat_closure_repairer_1',
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

test('StageRun preserves high token telemetry without an implicit token stop', async () => {
  const { state, attempts } = await runController({
    id: 'no-implicit-token-cap',
    closeFindingAfterRound: 1,
    tokensPerAttempt: 4_289_741,
  });
  assert.equal(state.status, 'completed');
  assert.equal(attempts.length, 4);
  assert.equal(state.quality_scope_budget?.max_tokens, null);
  assert.equal(state.quality_scope_budget_usage?.tokens_used, 17_158_964);
  assert.equal(state.quality_scope_budget_usage?.token_observation_status, 'observed');
  assert.equal(state.quality_scope_budget_stop_reason, null);
});

test('StageRun enforces a token cap only when explicitly configured', async () => {
  const { state, attempts } = await runController({
    id: 'explicit-token-cap',
    closeFindingAfterRound: 1,
    maxTokens: 5_000_000,
    tokensPerAttempt: 3_000_000,
  });
  assert.equal(state.status, 'human_gate');
  assert.equal(attempts.length, 2);
  assert.equal(state.quality_scope_budget?.max_tokens, 5_000_000);
  assert.equal(state.quality_scope_budget_usage?.tokens_used, 6_000_000);
  assert.equal(state.quality_scope_budget_stop_reason, 'max_tokens_exhausted');
  assert.equal(state.blocked_reason, 'stage_quality_scope_budget_max_tokens_exhausted');
});

test('initial reviewer routes cross-Stage repair without creating an inapplicable repair Attempt', async () => {
  const { state, attempts } = await runController({
    id: 'initial-review-route-back',
    closeFindingAfterRound: null,
    repairRequiredRoute: {
      role: 'reviewer',
      decisionKind: 'route_back',
      targetStageId: 'storyline',
    },
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.repair_rounds_used, 0);
  assert.equal(state.review_receipts[0]?.verdict, 'repair_required');
  assert.ok(state.quality_debt_refs.includes('quality-debt:finding:visual-clipping'));
  assert.equal(state.decisive_attempt_role, 'reviewer');
  assert.equal(state.selected_stage_route?.decision_kind, 'route_back');
  assert.equal(state.selected_stage_route?.target_stage_id, 'storyline');
  assert.equal(state.next_stage_run_launch?.target_stage_run_id, 'target:storyline');
});

test('re-reviewer routes cross-Stage repair without creating another repair round', async () => {
  const { state, attempts } = await runController({
    id: 're-review-route-back',
    closeFindingAfterRound: null,
    repairRequiredRoute: {
      role: 're_reviewer',
      decisionKind: 'route_back',
      targetStageId: 'storyline',
    },
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer', 'repairer', 're_reviewer',
  ]);
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.repair_rounds_used, 1);
  assert.equal(state.review_receipts[1]?.verdict, 'repair_required');
  assert.ok(state.quality_debt_refs.includes('quality-debt:finding:visual-clipping'));
  assert.equal(state.decisive_attempt_role, 're_reviewer');
  assert.equal(state.selected_stage_route?.decision_kind, 'route_back');
  assert.equal(state.selected_stage_route?.target_stage_id, 'storyline');
  assert.equal(state.next_stage_run_launch?.target_stage_run_id, 'target:storyline');
});

test('repair_required advance remains non-terminal while repair budget remains', async () => {
  const { state, attempts } = await runController({
    id: 'repair-required-advance-rejected',
    closeFindingAfterRound: 1,
    repairRequiredRoute: {
      role: 'reviewer',
      decisionKind: 'advance',
      targetStageId: 'review_and_revision',
    },
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer', 'repairer', 're_reviewer',
  ]);
  assert.equal(state.status, 'completed');
  assert.equal(state.decisive_attempt_role, 're_reviewer');
  assert.ok(state.route_quality_debt_refs.some((ref) => ref.includes(
    'review_requires_internal_repair_continuation',
  )));
});

test('StageRun controller caps quality work at three repair rounds and routes P1 debt to a human gate', async () => {
  const { state, attempts } = await runController({ id: 'budget', closeFindingAfterRound: null });
  assert.equal(state.status, 'human_gate');
  assert.equal(state.blocked_reason, 'stage_quality_scope_budget_max_attempts_exhausted');
  assert.equal(state.hard_stop_class, 'human_decision_required');
  assert.equal(state.repair_rounds_used, 3);
  assert.equal(attempts.length, 8);
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer',
    'repairer', 're_reviewer',
    'repairer', 're_reviewer',
    'repairer', 're_reviewer',
  ]);
  assert.equal(state.quality_debt_refs.includes('quality-debt:finding:visual-clipping'), false);
  assert.ok(state.human_gate_refs.some((ref) => ref.includes('max_attempts_exhausted')));
  assert.equal(state.quality_scope_budget?.max_attempts, 3);
  assert.equal(state.quality_scope_budget_usage?.attempts_used, 3);
  assert.equal(state.quality_scope_budget_usage?.managed_attempts_used, 8);
  assert.equal(state.quality_scope_budget_stop_reason, 'max_attempts_exhausted');
  assert.equal(state.sqlite_projection.status, 'synced');
  assert.equal(state.review_receipts.length, 4);
  assert.equal(state.review_receipts[3]?.verdict, 'repair_required');
  assert.equal(state.source_attempt_ref, `opl://stage_attempts/${state.attempts.at(-1)?.stage_attempt_id}`);
  assert.equal(state.decisive_attempt_role, null);
  assert.equal(state.selected_stage_route, null);
});

test('max=0 initial reviewer repair_required is the decisive human-gate route owner', async () => {
  const { state, attempts } = await runController({
    id: 'zero-repair-budget',
    closeFindingAfterRound: null,
    maxRepairRounds: 0,
    initialReviewerOutcome: 'repair_required',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'human_gate');
  assert.equal(state.blocked_reason, 'stage_quality_scope_budget_max_attempts_exhausted');
  assert.equal(state.hard_stop_class, 'human_decision_required');
  assert.equal(state.repair_rounds_used, 0);
  assert.equal(state.review_receipts[0]?.verdict, 'repair_required');
  assert.equal(state.source_attempt_ref, `opl://stage_attempts/${state.attempts[1]?.stage_attempt_id}`);
  assert.equal(state.decisive_attempt_role, null);
  assert.equal(state.selected_stage_route, null);
  assert.equal(state.quality_debt_refs.includes('quality-debt:finding:visual-clipping'), false);
  assert.ok(state.human_gate_refs.some((ref) => ref.includes('max_attempts_exhausted')));
  assert.equal(state.quality_scope_budget?.max_attempts, 0);
  assert.equal(state.quality_scope_budget_stop_reason, 'max_attempts_exhausted');
});

test('a truly unavailable pre-Codex provider may omit a session and remains a hard stop', async () => {
  const { state, attempts } = await runController({
    id: 'preflight-hard-blocker',
    closeFindingAfterRound: null,
    preflightHardBlockRole: 'reviewer',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'blocked');
  assert.equal(state.blocked_reason, 'codex_cli_provider_unavailable');
  assert.equal(state.hard_stop_class, 'permission_or_credential_boundary');
  assert.deepEqual(state.typed_blocker_refs, [
    `opl://stage-attempts/${state.attempts[1]?.stage_attempt_id}/runtime-blockers/codex_cli_provider_unavailable`,
  ]);
  assert.deepEqual(state.human_gate_refs, []);
  assert.equal(state.source_attempt_ref, `opl://stage_attempts/${state.attempts[1]?.stage_attempt_id}`);
  assert.equal(state.attempts[1]?.execution_session_ref, null);
  assert.equal(state.review_receipts.length, 0);
  assert.equal(state.quality_debt_refs.length, 0);
});

test('provider human-decision blocker terminalizes as human_gate rather than blocked', async () => {
  const { state, attempts } = await runController({
    id: 'provider-human-decision-gate',
    closeFindingAfterRound: null,
    preflightHardBlockRole: 'reviewer',
    preflightBlockedReason: 'operator_cancel_requested',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'human_gate');
  assert.equal(state.blocked_reason, 'operator_cancel_requested');
  assert.equal(state.hard_stop_class, 'human_decision_required');
  assert.equal(state.source_attempt_ref, `opl://stage_attempts/${state.attempts[1]?.stage_attempt_id}`);
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
  assert.equal(state.workflow_id, `stage-run-workflow:primary-route-owner`);
});

test('producer Attempt current policy can enable Review after a primary-only StageRun was created', async () => {
  const { state, attempts, workflowInputs, reviewReceiptInputs } = await runController({
    id: 'attempt-policy-enables-review',
    closeFindingAfterRound: null,
    formalReviewRequired: false,
    executionFormalReviewRequired: true,
    initialReviewerOutcome: 'pass',
    executionRubricRefsByRole: {
      producer: ['rubric:v0-producer'],
      reviewer: ['rubric:v1-reviewer'],
    },
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'completed');
  assert.equal(state.decisive_attempt_role, 'reviewer');
  assert.deepEqual(
    workflowInputs[0]?.execution_content_binding?.spec.quality_rubric_refs,
    ['rubric:v0-producer'],
  );
  assert.deepEqual(
    workflowInputs[1]?.execution_content_binding?.spec.quality_rubric_refs,
    ['rubric:v1-reviewer'],
  );
  assert.deepEqual(reviewReceiptInputs[0]?.rubric_refs, ['rubric:v1-reviewer']);
});

test('decisive Attempt route validation uses its current declared Stage catalog', async () => {
  const currentDeclaredStageIds = [
    'storyline',
    'artifact_creation',
    'review_and_revision',
    'package_and_handoff',
    'publication_followup',
  ];
  const { state, workflowInputs, routeInputs } = await runController({
    id: 'attempt-current-stage-catalog',
    closeFindingAfterRound: null,
    initialReviewerOutcome: 'pass',
    terminalRouteTarget: 'publication_followup',
    executionDeclaredStageIds: currentDeclaredStageIds,
  });
  assert.equal(state.status, 'completed');
  assert.equal(state.selected_stage_route?.target_stage_id, 'publication_followup');
  assert.deepEqual(
    workflowInputs[1]?.execution_content_binding?.declared_stage_ids,
    [...currentDeclaredStageIds].sort(),
  );
  assert.equal(routeInputs[0]?.decision.target_stage_id, 'publication_followup');
});

test('raw producer progress is recorded but cannot become formal Review input', async () => {
  const { state, attempts } = await runController({
    id: 'raw-producer-review',
    closeFindingAfterRound: null,
    rawArtifactProgressRole: 'producer',
    initialReviewerOutcome: 'pass',
    initialReviewerFindings: 'none',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer']);
  assert.deepEqual(state.attempts.map((attempt) => attempt.attempt_role), ['producer']);
  assert.deepEqual(state.attempts[0]?.artifact_refs, []);
  assert.equal(state.status, 'blocked');
  assert.equal(state.hard_stop_class, 'zero_consumable_artifact');
  assert.equal(state.blocked_reason, 'stage_quality_attempt_without_consumable_artifact');
  assert.equal(state.source_attempt_ref, `opl://stage_attempts/${state.attempts[0]?.stage_attempt_id}`);
  assert.equal(state.quality_scope_budget_usage?.attempts_used, 0);
  assert.equal(state.quality_scope_budget_usage?.managed_attempts_used, 1);
  assert.equal(state.review_receipts.length, 0);
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

test('initial reviewer blocked and human_gate outcomes map to hard-stop status and receipts', async () => {
  const blocked = await runController({
    id: 'initial-review-blocked',
    closeFindingAfterRound: null,
    initialReviewerOutcome: 'blocked',
  });
  assert.equal(blocked.state.status, 'blocked');
  assert.equal(blocked.state.blocked_reason, 'reviewer-blocked');
  assert.equal(blocked.state.hard_stop_class, 'safety_or_compliance');
  assert.deepEqual(blocked.state.typed_blocker_refs, [
    'typed-blocker:initial-review-blocked',
  ]);
  assert.deepEqual(blocked.state.human_gate_refs, []);
  assert.equal(
    blocked.state.source_attempt_ref,
    `opl://stage_attempts/${blocked.state.attempts[1]?.stage_attempt_id}`,
  );
  assert.equal(blocked.state.review_receipts[0]?.verdict, 'hard_stop');
  assert.equal(blocked.state.selected_stage_route, null);

  const humanGate = await runController({
    id: 'initial-review-human-gate',
    closeFindingAfterRound: null,
    initialReviewerOutcome: 'human_gate',
  });
  assert.equal(humanGate.state.status, 'human_gate');
  assert.equal(humanGate.state.blocked_reason, 'reviewer-human_gate');
  assert.equal(humanGate.state.hard_stop_class, 'human_decision_required');
  assert.deepEqual(humanGate.state.typed_blocker_refs, []);
  assert.deepEqual(humanGate.state.human_gate_refs, [
    'human-gate:initial-review-human-gate',
  ]);
  assert.equal(humanGate.state.review_receipts[0]?.verdict, 'hard_stop');
  assert.equal(humanGate.state.selected_stage_route, null);
});

test('initial repair_required outcome requires at least one required finding', async () => {
  const { state, attempts } = await runController({
    id: 'initial-repair-empty-findings',
    closeFindingAfterRound: null,
    initialReviewerOutcome: 'repair_required',
    initialReviewerFindings: 'none',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.review_receipts.length, 0);
  assert.equal(state.selected_stage_route, null);
  assert.ok(state.quality_debt_refs.some((ref) => ref.includes('repair_required')));
});

test('initial pass outcome cannot carry an open required finding', async () => {
  const { state, attempts } = await runController({
    id: 'initial-pass-required-finding',
    closeFindingAfterRound: null,
    initialReviewerOutcome: 'pass',
    initialReviewerFindings: 'required',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.review_receipts.length, 0);
  assert.equal(state.selected_stage_route, null);
  assert.ok(state.quality_debt_refs.some((ref) => ref.includes('open%20required%20finding')));
});

test('initial quality_debt outcome cannot carry an open required finding', async () => {
  const { state, attempts } = await runController({
    id: 'initial-quality-debt-required-finding',
    closeFindingAfterRound: null,
    initialReviewerOutcome: 'quality_debt',
    initialReviewerFindings: 'required',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.review_receipts.length, 0);
  assert.equal(state.selected_stage_route, null);
  assert.ok(state.quality_debt_refs.some((ref) => ref.includes('open%20required%20finding')));
});

test('closed re-review quality_debt outcome terminalizes with debt and controller receipt mapping', async () => {
  const { state, attempts } = await runController({
    id: 're-review-quality-debt',
    closeFindingAfterRound: 1,
    reReviewerOutcome: 'quality_debt',
    reReviewerOptionalObservation: true,
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer', 'repairer', 're_reviewer',
  ]);
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.review_receipts[1]?.verdict, 'quality_debt');
  assert.equal(state.decisive_attempt_role, 're_reviewer');
  assert.equal(state.selected_stage_route?.target_stage_id, 'review_and_revision');
  assert.ok(state.quality_debt_refs.some((ref) => ref.includes('re-review-quality-debt')));
});

test('closed re-review pass may retain optional observations without reopening repair', async () => {
  const { state, attempts } = await runController({
    id: 're-review-pass-optional-observation',
    closeFindingAfterRound: 1,
    reReviewerOutcome: 'pass',
    reReviewerOptionalObservation: true,
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer', 'repairer', 're_reviewer',
  ]);
  assert.equal(state.status, 'completed');
  assert.equal(state.review_receipts[1]?.verdict, 'pass');
  assert.equal(state.repair_rounds_used, 1);
  assert.equal(state.decisive_attempt_role, 're_reviewer');
});

test('re-review blocked and human_gate outcomes map to hard-stop receipts and do not route', async () => {
  const blocked = await runController({
    id: 're-review-blocked',
    closeFindingAfterRound: 1,
    reReviewerOutcome: 'blocked',
    reReviewerHardStopClass: 'safety_or_compliance',
  });
  assert.equal(blocked.state.status, 'blocked');
  assert.equal(blocked.state.blocked_reason, 're-review-blocked');
  assert.equal(blocked.state.hard_stop_class, 'safety_or_compliance');
  assert.deepEqual(blocked.state.typed_blocker_refs, [
    'typed-blocker:re-review-blocked',
  ]);
  assert.equal(
    blocked.state.source_attempt_ref,
    `opl://stage_attempts/${blocked.state.attempts[3]?.stage_attempt_id}`,
  );
  assert.equal(blocked.state.review_receipts[1]?.verdict, 'hard_stop');
  assert.equal(blocked.state.selected_stage_route, null);

  const humanGate = await runController({
    id: 're-review-human-gate',
    closeFindingAfterRound: 1,
    reReviewerOutcome: 'human_gate',
  });
  assert.equal(humanGate.state.status, 'human_gate');
  assert.equal(humanGate.state.blocked_reason, 're-review-human_gate');
  assert.equal(humanGate.state.hard_stop_class, 'human_decision_required');
  assert.deepEqual(humanGate.state.human_gate_refs, [
    'human-gate:re-review-human-gate',
  ]);
  assert.equal(humanGate.state.review_receipts[1]?.verdict, 'hard_stop');
  assert.equal(humanGate.state.selected_stage_route, null);
});

test('invalid re-review hard-stop evidence is rejected before receipt and recorded as protocol debt', async () => {
  const { state } = await runController({
    id: 'invalid-re-review-hard-stop',
    closeFindingAfterRound: 1,
    reReviewerOutcome: 'blocked',
    invalidReReviewerHardStopEvidence: true,
  });
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.review_receipts.length, 1);
  assert.equal(state.blocked_reason, null);
  assert.ok(state.quality_debt_refs.some((ref) => ref.includes('hard_stop_class')));
});

test('validated re-review hard stop is not downgraded when receipt persistence fails', async () => {
  const { state } = await runController({
    id: 'hard-stop-receipt-persistence-failure',
    closeFindingAfterRound: 1,
    reReviewerOutcome: 'blocked',
    failReceiptForReviewerRole: 're_reviewer',
  });
  assert.equal(state.status, 'blocked');
  assert.equal(state.blocked_reason, 're-review-blocked');
  assert.equal(state.review_receipts.length, 1);
  assert.equal(state.review_receipts[0]?.verdict, 'repair_required');
  assert.equal(state.selected_stage_route, null);
});

test('re-review outcome and finding closure must agree in both directions', async () => {
  const closedButRepairRequired = await runController({
    id: 'closed-but-repair-required',
    closeFindingAfterRound: 1,
    reReviewerOutcome: 'repair_required',
  });
  assert.equal(closedButRepairRequired.state.status, 'completed_with_quality_debt');
  assert.equal(closedButRepairRequired.state.review_receipts.length, 1);
  assert.equal(closedButRepairRequired.state.selected_stage_route, null);
  assert.ok(closedButRepairRequired.state.quality_debt_refs.some((ref) => ref.includes('repair_required')));

  const openButPass = await runController({
    id: 'open-but-pass',
    closeFindingAfterRound: null,
    reReviewerOutcome: 'pass',
  });
  assert.equal(openButPass.state.status, 'completed_with_quality_debt');
  assert.equal(openButPass.state.repair_rounds_used, 1);
  assert.equal(openButPass.state.review_receipts.length, 1);
  assert.equal(openButPass.state.selected_stage_route, null);
  assert.ok(openButPass.state.quality_debt_refs.some((ref) => ref.includes('must%20return%20outcome%20repair_required')));
});

test('legacy Attempt verdict is rejected before controller receipt materialization', async () => {
  const { state, attempts } = await runController({
    id: 'legacy-review-verdict',
    closeFindingAfterRound: null,
    legacyVerdictRole: 'reviewer',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.review_receipts.length, 0);
  assert.ok(state.quality_debt_refs.some((ref) => ref.includes('verdict%20is%20reserved')));
});

test('reviewer-only outcome is rejected when a producer or repairer returns it', async () => {
  const producer = await runController({
    id: 'producer-forbidden-outcome',
    closeFindingAfterRound: null,
    nonReviewOutcomeRole: 'producer',
  });
  assert.equal(producer.state.status, 'blocked');
  assert.equal(producer.state.review_receipts.length, 0);

  const repairer = await runController({
    id: 'repairer-forbidden-outcome',
    closeFindingAfterRound: null,
    nonReviewOutcomeRole: 'repairer',
  });
  assert.equal(repairer.state.status, 'completed_with_quality_debt');
  assert.equal(repairer.state.review_receipts.length, 1);
  assert.ok(repairer.state.quality_debt_refs.some((ref) => ref.includes(
    'must%20not%20return%20outcome%20or%20verdict',
  )));
});

test('receipt activity validation failure cannot forge a review receipt', async () => {
  const { state } = await runController({
    id: 'receipt-validation-failure',
    closeFindingAfterRound: null,
    failReceiptForReviewerRole: 'reviewer',
  });
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.review_receipts.length, 0);
  assert.equal(state.selected_stage_route, null);
  assert.ok(state.quality_debt_refs.some((ref) => ref.includes('receipt-validation-failure')));
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

test('repair without new artifact bytes terminalizes quality debt before re-review', async () => {
  const { state, attempts } = await runController({
    id: 'repair-debt-without-new-artifact',
    closeFindingAfterRound: 1,
    softBlockRole: 'repairer',
    omitArtifactForRole: 'repairer',
  });
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer', 'repairer',
  ]);
  assert.deepEqual(state.artifact_refs, ['artifact:deck-v1']);
  assert.equal(state.review_receipts.length, 1);
  assert.ok(state.quality_debt_refs.some((ref) => ref.includes(
    'repair-round-1-did-not-produce-new-artifact',
  )));
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
  assert.deepEqual(state.artifact_identity_receipt_refs, ['artifact-identity:deck-v1']);
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

test('literal zero artifact hard-stops, while a failed repair preserves prior consumable progress as debt', async () => {
  const zeroArtifact = await runController({
    id: 'producer-zero-artifact',
    closeFindingAfterRound: null,
    omitArtifactForRole: 'producer',
  });
  assert.equal(zeroArtifact.state.status, 'blocked');
  assert.equal(zeroArtifact.state.blocked_reason, 'stage_quality_attempt_without_consumable_artifact');
  assert.equal(
    zeroArtifact.state.source_attempt_ref,
    'opl://stage_attempts/sat_producer-zero-artifact_producer_0',
  );
  assert.equal(zeroArtifact.state.artifact_refs.length, 0);

  const failedRepair = await runController({
    id: 'repairer-zero-new-artifact',
    closeFindingAfterRound: null,
    omitArtifactForRole: 'repairer',
  });
  assert.equal(failedRepair.state.status, 'completed_with_quality_debt');
  assert.deepEqual(failedRepair.state.artifact_refs, ['artifact:deck-v1']);
  assert.equal(failedRepair.state.review_receipts.length, 1);
  assert.ok(failedRepair.state.quality_debt_refs.some((ref) => ref.includes(
    'stage_quality_attempt_without_consumable_artifact',
  )));
});

test('producer artifact without a verified identity receipt cannot enter formal Review', async () => {
  const { state, attempts } = await runController({
    id: 'producer-missing-identity-receipt',
    closeFindingAfterRound: null,
    omitIdentityReceiptForRole: 'producer',
  });
  assert.equal(state.status, 'blocked');
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer']);
  assert.equal(state.hard_stop_class, 'authority_boundary_violation');
  assert.equal(state.blocked_reason, 'artifact_identity_receipt_missing_authority_violation');
  assert.equal(
    state.source_attempt_ref,
    'opl://stage_attempts/sat_producer-missing-identity-receipt_producer_0',
  );
  assert.equal(state.artifact_refs.length, 0);
  assert.equal(state.review_receipts.length, 0);
});
