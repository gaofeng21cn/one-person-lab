import crypto from 'node:crypto';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  requireFamilyRuntimeExecutionScope,
} from './family-runtime-execution-scope.ts';
import type {
  TemporalStageRunRecoveryResume,
  TemporalStageRunWorkflowInput,
} from './family-runtime-temporal-stage-run.ts';
import {
  deriveStageRunId,
  deriveStageRunWorkflowId,
  revalidateStageRunImmutableSpecContent,
  stageRunSpecSha256,
  validateStageRunImmutableSpecEnvelope,
} from './family-runtime-stage-run-identity.ts';

function exactRecoveryStringList(value: unknown, field: string) {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.some((entry) => typeof entry !== 'string' || !entry.trim())
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `StageRun recovery resume requires a non-empty ${field} string array.`,
      { failure_code: 'stage_run_recovery_resume_identity_invalid', field },
    );
  }
  return value as string[];
}

export function requireTemporalStageRunRecoveryResume(
  input: TemporalStageRunWorkflowInput,
): TemporalStageRunRecoveryResume | null {
  const recovery = input.recovery_resume;
  if (!recovery) return null;
  if (
    recovery.surface_kind !== 'opl_stage_run_recovery_resume'
    || recovery.version !== 'opl-stage-run-recovery-resume.v1'
    || typeof recovery.recovery_id !== 'string'
    || !recovery.recovery_id.trim()
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun recovery resume identity is invalid.',
      { failure_code: 'stage_run_recovery_resume_identity_invalid' },
    );
  }
  if (!input.quality_policy?.formal_review?.required) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun recovery resume is only valid for a required formal Review.',
      { failure_code: 'stage_run_recovery_formal_review_not_required' },
    );
  }
  const expectedQualityCycleId = `quality-cycle:${input.stage_run_id}`;
  const resumeAfterRole = recovery.resume_after_role ?? 'producer';
  const artifactProducer = recovery.artifact_producer_attempt_summary
    ?? recovery.producer_attempt_summary;
  const artifactProducerAttemptRef = recovery.artifact_producer_attempt_ref
    ?? recovery.producer_attempt_ref;
  if (
    recovery.quality_cycle_id !== expectedQualityCycleId
    || !['producer', 'repairer', 'reviewer'].includes(resumeAfterRole)
    || !artifactProducer
    || artifactProducer.attempt_role !== (resumeAfterRole === 'reviewer' ? 'producer' : resumeAfterRole)
    || artifactProducer.status !== 'completed'
    || typeof artifactProducer.stage_attempt_id !== 'string'
    || !artifactProducer.stage_attempt_id.trim()
    || typeof artifactProducer.workflow_id !== 'string'
    || !artifactProducer.workflow_id.trim()
    || typeof artifactProducer.execution_session_ref !== 'string'
    || !artifactProducer.execution_session_ref.trim()
    || artifactProducerAttemptRef !== `opl://stage_attempts/${artifactProducer.stage_attempt_id}`
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun recovery resume does not bind one completed artifact-producing Attempt.',
      {
        failure_code: 'stage_run_recovery_producer_identity_mismatch',
        stage_run_id: input.stage_run_id,
        quality_cycle_id: recovery.quality_cycle_id,
        resume_after_role: resumeAfterRole,
        artifact_producer_attempt_ref: artifactProducerAttemptRef,
      },
    );
  }
  const artifactRefs = exactRecoveryStringList(recovery.artifact_refs, 'artifact_refs');
  const artifactHashes = exactRecoveryStringList(recovery.artifact_hashes, 'artifact_hashes');
  const receiptRefs = exactRecoveryStringList(
    recovery.artifact_identity_receipt_refs,
    'artifact_identity_receipt_refs',
  );
  if (
    artifactRefs.length !== artifactHashes.length
    || artifactRefs.length !== receiptRefs.length
    || artifactHashes.some((hash) => !/^sha256:[a-f0-9]{64}$/.test(hash))
    || canonicalJsonText({
      artifact_refs: artifactProducer.artifact_refs,
      artifact_hashes: artifactProducer.artifact_hashes,
      artifact_identity_receipt_refs: artifactProducer.artifact_identity_receipt_refs,
    }) !== canonicalJsonText({
      artifact_refs: artifactRefs,
      artifact_hashes: artifactHashes,
      artifact_identity_receipt_refs: receiptRefs,
    })
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun recovery resume artifact identity does not match the artifact-producing Attempt.',
      { failure_code: 'stage_run_recovery_artifact_identity_mismatch' },
    );
  }
  if (resumeAfterRole === 'reviewer') {
    const reviewer = recovery.prior_attempt_summaries?.at(-1);
    const receipt = recovery.review_receipts?.at(-1);
    if (reviewer?.attempt_role !== 'reviewer' || reviewer.status !== 'completed'
      || recovery.reviewer_attempt_ref !== `opl://stage_attempts/${reviewer.stage_attempt_id}`
      || receipt?.reviewer_attempt_ref !== recovery.reviewer_attempt_ref
      || receipt.producer_attempt_ref !== artifactProducerAttemptRef
      || receipt.stage_run_id !== input.stage_run_id || receipt.quality_cycle_id !== expectedQualityCycleId
      || receipt.verdict !== 'repair_required' || !receipt.revision_transport
      || !Array.isArray(recovery.findings) || recovery.findings.length === 0
      || receipt.finding_lineage.findings_sha256 !== `sha256:${crypto.createHash('sha256').update(canonicalJsonText(recovery.findings)).digest('hex')}`
      || !Number.isSafeInteger(recovery.repair_rounds_used) || recovery.repair_rounds_used! < 0
      || (recovery.repair_map?.length ?? 0) !== 0) {
      throw new FrameworkContractError('contract_shape_invalid', 'Reviewer recovery must preserve its accepted revision intake and findings.', {
        failure_code: 'stage_run_recovery_review_lineage_invalid',
      });
    }
  }
  if (resumeAfterRole === 'repairer') {
    const attempts = recovery.prior_attempt_summaries;
    if (
      !Array.isArray(attempts)
      || attempts.length < 3
      || attempts.at(-1)?.stage_attempt_id !== artifactProducer.stage_attempt_id
      || attempts.at(-1)?.attempt_role !== 'repairer'
      || !Array.isArray(recovery.findings)
      || recovery.findings.length === 0
      || !Array.isArray(recovery.repair_map)
      || recovery.repair_map.length === 0
      || !Array.isArray(recovery.review_receipts)
      || recovery.review_receipts.length === 0
      || recovery.repair_rounds_used !== artifactProducer.quality_round_index
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Repairer StageRun recovery must preserve the prior quality lineage before re-review.',
        { failure_code: 'stage_run_recovery_repair_lineage_invalid' },
      );
    }
  }
  return recovery;
}

export function temporalStageRunRecoveryResumeSha256(input: TemporalStageRunWorkflowInput) {
  const recovery = requireTemporalStageRunRecoveryResume(input);
  if (!recovery) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun recovery digest requires a recovery resume input.',
      { failure_code: 'stage_run_recovery_resume_missing' },
    );
  }
  return `sha256:${crypto.createHash('sha256').update(canonicalJsonText(recovery)).digest('hex')}`;
}

export function requireTemporalStageRunWorkflowInputLaunchable(
  input: TemporalStageRunWorkflowInput,
  options: { revalidateContent?: boolean | 'historical_evidence' } = {},
) {
  requireFamilyRuntimeExecutionScope({
    scopeKind: input.scope_kind,
    executionScope: input.execution_scope,
    workspaceLocator: input.workspace_locator,
    domainId: input.domain_id,
    operation: 'launch_temporal_stage_run',
  });
  for (const [field, value] of Object.entries({
    stage_run_id: input.stage_run_id,
    stage_run_invocation_id: input.stage_run_invocation_id,
    stage_run_spec_sha256: input.stage_run_spec_sha256,
    workflow_id: input.workflow_id,
    stage_id: input.stage_id,
    stage_packet_ref: input.stage_packet_ref,
    quality_policy_ref: input.quality_policy_ref,
    domain_pack_root: input.domain_pack_root,
    stage_manifest_ref: input.stage_manifest_ref,
    stage_manifest_sha256: input.stage_manifest_sha256,
  })) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new FrameworkContractError('contract_shape_invalid', `StageRun quality controller requires ${field}.`, {
        field,
      });
    }
  }
  const expectedStageRunId = deriveStageRunId({
    domainId: input.domain_id,
    stageId: input.stage_id,
    stageRunInvocationId: input.stage_run_invocation_id,
  });
  if (input.stage_run_id !== expectedStageRunId) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun id must derive only from domain, Stage, and durable invocation identity.',
      {
        failure_code: 'stage_run_identity_mismatch',
        stage_run_id: input.stage_run_id,
        expected_stage_run_id: expectedStageRunId,
      },
    );
  }
  const expectedWorkflowId = deriveStageRunWorkflowId(expectedStageRunId);
  if (input.workflow_id !== expectedWorkflowId) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun workflow id must derive only from the canonical StageRun id.',
      {
        failure_code: 'stage_run_workflow_identity_mismatch',
        stage_run_id: input.stage_run_id,
        workflow_id: input.workflow_id,
        expected_workflow_id: expectedWorkflowId,
      },
    );
  }
  const spec = input.stage_run_spec;
  if (
    spec?.surface_kind !== 'opl_stage_run_immutable_spec'
    || spec.version !== 'opl-stage-run-immutable-spec.v1'
    || spec.domain_id !== input.domain_id
    || spec.stage_id !== input.stage_id
    || spec.parent_route_decision_ref !== input.parent_route_decision_ref
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun immutable spec lineage must match its launch envelope.',
      {
        failure_code: 'stage_run_spec_lineage_mismatch',
        stage_run_id: input.stage_run_id,
      },
    );
  }
  if (
    !Array.isArray(input.declared_stage_ids)
    || input.declared_stage_ids.length === 0
    || input.declared_stage_ids.some((stageId) => typeof stageId !== 'string' || !stageId.trim())
    || !input.declared_stage_ids.includes(input.stage_id)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun route transport requires the current Stage and every target to use declared Stage ids.',
      { stage_id: input.stage_id, declared_stage_ids: input.declared_stage_ids },
    );
  }
  const roleKeys = Object.keys(input.role_prompt_refs ?? {}).sort();
  const expectedRoleKeys = ['producer', 're_reviewer', 'repairer', 'reviewer'];
  if (JSON.stringify(roleKeys) !== JSON.stringify(expectedRoleKeys)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun role_prompt_refs must use only the bounded Framework Attempt roles.',
      { expected_roles: expectedRoleKeys, received_roles: roleKeys },
    );
  }
  if (Object.values(input.role_prompt_refs).some((ref) => typeof ref !== 'string' || !ref.trim())) {
    throw new FrameworkContractError('contract_shape_invalid', 'StageRun role prompt refs must be non-empty.');
  }
  if (!Array.isArray(input.quality_rubric_refs) || input.quality_rubric_refs.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'StageRun quality controller requires quality rubric refs.');
  }
  if (input.stage_role === 'cross_stage_meta_review' && input.quality_policy.formal_review.required) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Cross-stage Meta Review Stage cannot recursively require formal Stage Review.',
    );
  }
  const maxRepairRounds = input.quality_policy?.formal_review?.max_repair_rounds;
  if (!Number.isInteger(maxRepairRounds) || maxRepairRounds < 0 || maxRepairRounds > 3) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun quality repair budget must be an integer between zero and three.',
      { max_repair_rounds: maxRepairRounds },
    );
  }
  validateStageRunImmutableSpecEnvelope({
    spec,
    domainId: input.domain_id,
    stageId: input.stage_id,
    actionId: input.action_id,
    taskId: input.task_id,
    workspaceLocator: input.workspace_locator,
    stageManifestRef: input.stage_manifest_ref,
    stageManifestSha256: input.stage_manifest_sha256,
    qualityPolicyRef: input.quality_policy_ref,
    qualityPolicy: input.quality_policy as unknown as Record<string, unknown>,
    stagePacketRef: input.stage_packet_ref,
    checkpointRefs: input.checkpoint_refs,
    sourceFingerprint: input.source_fingerprint,
    sourceRefs: input.source_refs,
    artifactRefs: input.artifact_refs,
    artifactHashes: input.artifact_hashes,
    artifactIdentityReceiptRefs: input.artifact_identity_receipt_refs,
    rolePromptRefs: input.role_prompt_refs,
    qualityRubricRefs: input.quality_rubric_refs,
    knowledgeRefs: input.knowledge_refs,
    skillRefs: input.skill_refs,
    policyRefs: input.policy_refs,
    stageGoalRefs: input.stage_goal_refs,
    lineageRefs: input.lineage_refs,
    executorKind: input.executor_kind,
    stageAttemptExecutorPolicy: input.stage_attempt_executor_policy,
    parentRouteDecisionRef: input.parent_route_decision_ref,
    routeBudget: input.stage_run_spec.route_budget ?? input.route_budget,
  });
  const expectedSpecSha256 = stageRunSpecSha256(spec);
  if (input.stage_run_spec_sha256 !== expectedSpecSha256) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun immutable spec digest does not match the exact canonical spec.',
      {
        failure_code: 'stage_run_spec_digest_mismatch',
        stage_run_id: input.stage_run_id,
        expected_stage_run_spec_sha256: expectedSpecSha256,
        received_stage_run_spec_sha256: input.stage_run_spec_sha256,
      },
    );
  }
  if (!spec.package_closure) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Pack-bound StageRun launch requires an immutable package dependency closure.',
      {
        failure_code: 'stage_run_package_closure_missing',
        stage_run_id: input.stage_run_id,
      },
    );
  }
  if (options.revalidateContent !== false) {
    revalidateStageRunImmutableSpecContent({
      spec,
      domainPackRoot: input.domain_pack_root,
      workspaceLocator: input.workspace_locator,
      scopeKind: input.scope_kind ?? (input.execution_scope ? 'work_item' : 'domain'),
      executionScope: input.execution_scope ?? null,
      skipManagedPackBytes: options.revalidateContent === 'historical_evidence',
    });
  }
  requireTemporalStageRunRecoveryResume(input);
  return input;
}
