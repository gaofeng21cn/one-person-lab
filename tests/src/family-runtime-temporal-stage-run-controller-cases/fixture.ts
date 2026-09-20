import path from 'node:path';

import { Worker } from '@temporalio/worker';
import { FrameworkContractError } from '../../../src/kernel/contract-validation.ts';

import type {
  TemporalStageAttemptWorkflowInput,
  TemporalStageQualityAttemptMaterializationInput,
  TemporalStageRunWorkflowInput,
} from '../../../src/adapters/execution/family-runtime-temporal.ts';
import { StageRunWorkflow, stageRunQuery } from '../../../src/adapters/execution/family-runtime-temporal-workflows.ts';
import { STAGE_RUN_ATTEMPT_CONTENT_BINDING_VERSION } from '../../../src/adapters/execution/family-runtime-stage-quality-attempt-boundary.ts';
import {
  stageAttemptExecutionContentBindingSha256,
  stageRunSpecSha256,
} from '../../../src/adapters/execution/family-runtime-stage-run-identity.ts';
import {
  normalizeStageQualityCyclePolicy,
  type StageQualityOutcome,
} from '../../../src/authority/stages/stage-quality-cycle.ts';
import { createTemporalTestWorkflowEnvironment } from '../temporal-test-environment.ts';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

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

export async function runController(input: {
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
  reReviewerIdentityDrift?: boolean;
  reviewerOmitArtifactIdentity?: boolean;
  repairerAttemptsTerminalDecision?: boolean;
  terminalRouteTarget?: string;
  invalidReReviewClosure?: boolean;
  initialReviewerOutcome?: StageQualityOutcome;
  initialReviewerFindings?: 'required' | 'none' | 'optional';
  reReviewerOutcome?: StageQualityOutcome;
  reReviewerOptionalObservation?: boolean;
  reReviewerHardStopClass?: string;
  invalidReReviewerHardStopEvidence?: boolean;
  legacyVerdictRole?: TemporalStageQualityAttemptMaterializationInput['attempt_role'];
  nonReviewOutcomeRole?: 'producer' | 'repairer';
  failReceiptForReviewerRole?: 'reviewer' | 're_reviewer';
  failAttemptSync?: boolean;
  queryDuringHandoff?: boolean;
  transientHandoffFailures?: number;
  permanentHandoffFailure?: boolean;
  rawArtifactProgressRole?: 'producer' | 'reviewer' | 're_reviewer';
  repairRequiredRoute?: {
    role: 'reviewer' | 're_reviewer';
    decisionKind: 'advance' | 'route_back';
    targetStageId: string;
  };
  recoveryResume?: boolean;
  acceptedReviewerResume?: boolean;
  acceptedRepairerResume?: boolean;
}) {
  const testEnv = await createTemporalTestWorkflowEnvironment();
  const taskQueue = `opl-stage-run-controller-${input.id}-${Date.now()}`;
  const attempts: TemporalStageQualityAttemptMaterializationInput[] = [];
  const workflowInputs: TemporalStageAttemptWorkflowInput[] = [];
  const reviewReceiptInputs: any[] = [];
  const routeInputs: any[] = [];
  const handoffObservations: any[] = [];
  const attemptSyncs: any[] = [];
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
        attemptSyncs.push(syncInput);
        if (input.failAttemptSync) throw new Error('simulated-sqlite-projection-unavailable');
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
        if (input.queryDuringHandoff) {
          handoffObservations.push(await testEnv.client.workflow
            .getHandle(routeInput.parent_stage_run.workflow_id).query(stageRunQuery));
        }
        if (input.permanentHandoffFailure) {
          throw new FrameworkContractError('contract_shape_invalid', 'route-target-identity-mismatch');
        }
        if (routeInputs.length <= (input.transientHandoffFailures ?? 0)) {
          throw new Error('temporary-route-transport-unavailable');
        }
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
        const artifactVersion = (role === 'reviewer' && input.reviewerIdentityDrift)
          || (role === 're_reviewer' && input.reReviewerIdentityDrift)
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
          || (role === 'reviewer' && input.reviewerOmitArtifactIdentity)
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
          stageQualityCycle.findings = findingMode === 'none' ? []
            : [{ ...finding, ...(findingMode === 'optional' ? { severity: 'major', required: false } : {}) }];
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
      workflowsPath: path.join(repoRoot, 'src/adapters/execution/family-runtime-temporal-workflows.ts'),
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
      if (input.recoveryResume || input.acceptedReviewerResume || input.acceptedRepairerResume) {
        workflowInput.recovery_resume = {
          surface_kind: 'opl_stage_run_recovery_resume',
          version: 'opl-stage-run-recovery-resume.v1',
          recovery_id: `recovery:${input.id}`,
          quality_cycle_id: `quality-cycle:${workflowInput.stage_run_id}`,
          producer_attempt_ref: `opl://stage_attempts/sat_${input.id}_producer_0`,
          producer_attempt_summary: {
            attempt_role: 'producer',
            quality_round_index: 0,
            stage_attempt_id: `sat_${input.id}_producer_0`,
            workflow_id: `wf_${input.id}_producer_0`,
            execution_session_ref: `codex://threads/thread-${input.id}-producer-0`,
            artifact_producer_attempt_ref: null,
            status: 'completed',
            artifact_refs: ['artifact:deck-v1'],
            artifact_hashes: ['sha256:deck-v1'],
            artifact_identity_receipt_refs: ['artifact-identity:deck-v1'],
            total_tokens_observed: null,
          },
          artifact_refs: ['artifact:deck-v1'],
          artifact_hashes: ['sha256:deck-v1'],
          artifact_identity_receipt_refs: ['artifact-identity:deck-v1'],
          review_input_snapshot_materialization_request: null,
        };
        if (input.acceptedReviewerResume || input.acceptedRepairerResume) {
          const recovery = workflowInput.recovery_resume;
          const reviewer = {
            ...recovery.producer_attempt_summary!,
            attempt_role: 'reviewer' as const,
            stage_attempt_id: `sat_${input.id}_reviewer_0`,
            workflow_id: `wf_${input.id}_reviewer_0`,
            execution_session_ref: `codex://threads/thread-${input.id}-reviewer-0`,
          };
          recovery.resume_after_role = 'reviewer';
          recovery.reviewer_attempt_ref = `opl://stage_attempts/${reviewer.stage_attempt_id}`;
          recovery.prior_attempt_summaries = [recovery.producer_attempt_summary!, reviewer];
          recovery.repair_rounds_used = 1;
          recovery.findings = [{ finding_id: 'finding:visual-clipping', severity: 'critical', required: true,
            evidence_refs: ['screenshot:v1'], repair_expectation: 'Remove clipping while preserving the approved claim.' }];
          recovery.review_receipts = [{
            ...(await activities.stageQualityReviewReceiptActivity({
              producer_attempt_ref: recovery.producer_attempt_ref,
              reviewer_attempt_ref: recovery.reviewer_attempt_ref,
              verdict: 'repair_required', rubric_refs: ['rubric:visual'],
            })),
            revision_transport: {
              surface_kind: 'opl_revision_transport',
              opl_revision_intake_ref: { kind: 'opl_revision_intake', ref: 'intake:accepted-review' },
              opl_stage_review_receipt_ref: { kind: 'opl_stage_review_receipt', ref: 'receipt:accepted-review' },
            },
          } as any];
          if (input.acceptedRepairerResume) {
            const repairer = {
              ...recovery.producer_attempt_summary!, attempt_role: 'repairer' as const,
              stage_attempt_id: `sat_${input.id}_repairer_1`, quality_round_index: 1,
              workflow_id: `wf_${input.id}_repairer_1`, execution_session_ref: `codex://threads/thread-${input.id}-repairer-1`,
            };
            recovery.resume_after_role = 'repairer';
            delete recovery.reviewer_attempt_ref;
            recovery.artifact_producer_attempt_ref = `opl://stage_attempts/${repairer.stage_attempt_id}`;
            recovery.artifact_producer_attempt_summary = repairer;
            recovery.prior_attempt_summaries.push(repairer);
            recovery.repair_map = [{ finding_id: 'finding:visual-clipping', repair_status: 'repaired',
              changed_artifact_refs: ['artifact:deck-v1'], repair_evidence_refs: ['diff:deck-v1'] }];
          }
        }
      }
      const handle = await testEnv.client.workflow.start(StageRunWorkflow, {
        args: [workflowInput],
        taskQueue,
        workflowId: workflowInput.workflow_id,
      });
      return await handle.result();
    });
    return { state, attempts, workflowInputs, reviewReceiptInputs, routeInputs, handoffObservations, attemptSyncs };
  } finally {
    await testEnv.teardown();
  }
}
