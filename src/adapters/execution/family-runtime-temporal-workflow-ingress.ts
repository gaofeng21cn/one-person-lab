import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import type {
  TemporalStageAttemptWorkflowInput,
  TemporalStageAttemptWorkflowState,
  TemporalStageAttemptSignalPayload,
  TemporalStageRunWorkflowInput,
} from './family-runtime-temporal.ts';
import { asRecord, asStringList, stageRunQualityCycleId } from './family-runtime-temporal-workflow-values.ts';

type WorkflowScopeCarrier = {
  scope_kind?: unknown;
  execution_scope?: unknown;
};

const WORKFLOW_EXECUTION_SCOPE_FIELDS = [
  'surface_kind',
  'version',
  'scope_kind',
  'project_scope_id',
  'work_item_scope_id',
  'domain_id',
  'domain_work_item_id',
  'workspace_binding_id',
  'binding_version_id',
  'workspace_root',
  'canonical_work_item_root',
  'inventory_digest',
  'source_alias_fields',
  'scope_digest',
] as const;

export function workflowScopeKind(value: WorkflowScopeCarrier) {
  return value.scope_kind ?? (value.execution_scope ? 'work_item' : 'domain');
}

function comparableWorkflowScopeField(value: unknown) {
  return Array.isArray(value) ? JSON.stringify(value) : value;
}

export function assertWorkflowExecutionScopeIdentity(input: {
  expected: WorkflowScopeCarrier;
  actual: WorkflowScopeCarrier;
  operation: string;
}) {
  const expectedKind = workflowScopeKind(input.expected);
  const actualKind = workflowScopeKind(input.actual);
  const mismatches: Array<{ field: string; expected: unknown; actual: unknown }> = [];
  if (expectedKind !== actualKind) {
    mismatches.push({ field: 'scope_kind', expected: expectedKind, actual: actualKind });
  }
  const expectedScope = asRecord(input.expected.execution_scope);
  const actualScope = asRecord(input.actual.execution_scope);
  if (expectedKind === 'work_item' || actualKind === 'work_item') {
    const expectedKeys = Object.keys(expectedScope).sort();
    const actualKeys = Object.keys(actualScope).sort();
    if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) {
      mismatches.push({ field: 'execution_scope.keys', expected: expectedKeys, actual: actualKeys });
    }
    for (const field of WORKFLOW_EXECUTION_SCOPE_FIELDS) {
      const expected = comparableWorkflowScopeField(expectedScope[field]);
      const actual = comparableWorkflowScopeField(actualScope[field]);
      if (expected !== actual) mismatches.push({ field, expected, actual });
    }
  } else if (Object.keys(expectedScope).length > 0 || Object.keys(actualScope).length > 0) {
    mismatches.push({
      field: 'execution_scope',
      expected: Object.keys(expectedScope).length > 0 ? expectedScope : null,
      actual: Object.keys(actualScope).length > 0 ? actualScope : null,
    });
  }
  if (mismatches.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal workflow execution scope lineage is inconsistent.',
      {
        failure_code: 'temporal_workflow_execution_scope_mismatch',
        operation: input.operation,
        mismatches,
      },
    );
  }
}

export function assertWorkflowAttemptIdentity(input: {
  expected: TemporalStageAttemptWorkflowInput;
  actual: TemporalStageAttemptWorkflowState;
}) {
  const mismatches = [
    ['stage_attempt_id', input.expected.stage_attempt_id, input.actual.stage_attempt_id],
    ['workflow_id', input.expected.workflow_id, input.actual.workflow_id],
    ['domain_id', input.expected.domain_id, input.actual.domain_id],
    ['stage_id', input.expected.stage_id, input.actual.stage_id],
  ].flatMap(([field, expected, actual]) => expected === actual
    ? []
    : [{ field, expected, actual }]);
  if (mismatches.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal child StageAttempt returned a different runtime identity.',
      { failure_code: 'temporal_child_attempt_identity_mismatch', mismatches },
    );
  }
  assertWorkflowExecutionScopeIdentity({
    expected: input.expected,
    actual: input.actual,
    operation: 'stage_run_child_attempt_result',
  });
}

export function closeoutRefsFrom(value: Record<string, unknown>) {
  return [
    ...asStringList(value.closeout_refs),
    ...(typeof value.closeout_ref === 'string' ? [value.closeout_ref] : []),
    ...(typeof value.receipt_ref === 'string' ? [value.receipt_ref] : []),
  ];
}

export function closeoutPacketFromCodexResult(value: Record<string, unknown>) {
  const closeout = asRecord(value.closeout_packet);
  return Object.keys(closeout).length > 0 ? closeout : null;
}

export function validateCloseoutPacketForWorkflow(input: {
  closeoutPacket: Record<string, unknown> | null;
  workflowInput: TemporalStageAttemptWorkflowInput;
}) {
  const closeoutPacket = input.closeoutPacket;
  if (!closeoutPacket) {
    return { closeoutPacket: null, providerBlocker: null };
  }
  const closeoutAttemptId = typeof closeoutPacket.stage_attempt_id === 'string' && closeoutPacket.stage_attempt_id.trim()
    ? closeoutPacket.stage_attempt_id.trim()
    : null;
  const workItemScoped = workflowScopeKind(input.workflowInput) === 'work_item';
  if (
    (closeoutAttemptId && closeoutAttemptId !== input.workflowInput.stage_attempt_id)
    || (workItemScoped && !closeoutAttemptId)
  ) {
    return {
      closeoutPacket: null,
      providerBlocker: {
        blocked_reason: 'typed_closeout_stage_attempt_id_mismatch',
        route_impact: {
          provider_blocker_reason: 'typed_closeout_stage_attempt_id_mismatch',
          provider_blocker_surface: 'codex_stage_activity.closeout_packet.stage_attempt_id',
          expected_stage_attempt_id: input.workflowInput.stage_attempt_id,
          actual_stage_attempt_id: closeoutAttemptId,
        },
      },
    };
  }
  const closeoutStageRunId = typeof closeoutPacket.stage_run_id === 'string' && closeoutPacket.stage_run_id.trim()
    ? closeoutPacket.stage_run_id.trim()
    : null;
  if (
    (closeoutStageRunId && closeoutStageRunId !== (input.workflowInput.stage_run_id ?? null))
    || (workItemScoped && !closeoutStageRunId)
  ) {
    return {
      closeoutPacket: null,
      providerBlocker: {
        blocked_reason: closeoutStageRunId
          ? 'typed_closeout_stage_run_id_mismatch'
          : 'typed_closeout_stage_run_id_missing',
        route_impact: {
          provider_blocker_reason: closeoutStageRunId
            ? 'typed_closeout_stage_run_id_mismatch'
            : 'typed_closeout_stage_run_id_missing',
          provider_blocker_surface: 'codex_stage_activity.closeout_packet.stage_run_id',
          expected_stage_run_id: input.workflowInput.stage_run_id ?? null,
          actual_stage_run_id: closeoutStageRunId,
        },
      },
    };
  }
  if (workItemScoped) {
    const expectedScope = asRecord(input.workflowInput.execution_scope);
    const closeoutScope = asRecord(closeoutPacket.execution_scope);
    const actualScopeDigest = typeof closeoutPacket.scope_digest === 'string'
      ? closeoutPacket.scope_digest
      : typeof closeoutScope.scope_digest === 'string'
        ? closeoutScope.scope_digest
        : null;
    if (actualScopeDigest !== expectedScope.scope_digest) {
      return {
        closeoutPacket: null,
        providerBlocker: {
          blocked_reason: actualScopeDigest
            ? 'typed_closeout_execution_scope_mismatch'
            : 'typed_closeout_execution_scope_missing',
          route_impact: {
            provider_blocker_reason: actualScopeDigest
              ? 'typed_closeout_execution_scope_mismatch'
              : 'typed_closeout_execution_scope_missing',
            provider_blocker_surface: 'codex_stage_activity.closeout_packet.scope_digest',
            expected_scope_digest: expectedScope.scope_digest ?? null,
            actual_scope_digest: actualScopeDigest,
          },
        },
      };
    }
    if (Object.keys(closeoutScope).length > 0) {
      try {
        assertWorkflowExecutionScopeIdentity({
          expected: input.workflowInput,
          actual: { scope_kind: 'work_item', execution_scope: closeoutScope },
          operation: 'typed_closeout',
        });
      } catch {
        return {
          closeoutPacket: null,
          providerBlocker: {
            blocked_reason: 'typed_closeout_execution_scope_mismatch',
            route_impact: {
              provider_blocker_reason: 'typed_closeout_execution_scope_mismatch',
              provider_blocker_surface: 'codex_stage_activity.closeout_packet.execution_scope',
              expected_scope_digest: expectedScope.scope_digest ?? null,
              actual_scope_digest: actualScopeDigest,
            },
          },
        };
      }
    }
  }
  return { closeoutPacket, providerBlocker: null };
}

export function validateOperatorActionPayload(
  signal: TemporalStageAttemptSignalPayload,
  workflowInput?: TemporalStageAttemptWorkflowInput,
) {
  if (workflowInput && workflowScopeKind(workflowInput) === 'work_item') {
    const expectedScope = asRecord(workflowInput.execution_scope);
    const mismatches = [
      ['stage_attempt_id', workflowInput.stage_attempt_id, signal.payload.stage_attempt_id],
      ['stage_run_id', workflowInput.stage_run_id ?? null, signal.payload.stage_run_id],
      ['scope_digest', expectedScope.scope_digest ?? null, signal.payload.scope_digest],
    ].flatMap(([field, expected, actual]) => expected === actual
      ? []
      : [{ field, expected, actual: actual ?? null }]);
    if (mismatches.length > 0) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Temporal operator ingress does not match the work-item StageAttempt identity.',
        { failure_code: 'temporal_operator_ingress_identity_mismatch', mismatches },
      );
    }
  }
  if (signal.signal_kind === 'human_gate') {
    const humanGateRef = typeof signal.payload.human_gate_ref === 'string'
      ? signal.payload.human_gate_ref.trim()
      : '';
    if (!humanGateRef) {
      throw new Error('human_gate update requires payload.human_gate_ref');
    }
  }
  if (signal.signal_kind === 'owner_receipt') {
    const ownerReceiptRef = typeof signal.payload.owner_receipt_ref === 'string'
      ? signal.payload.owner_receipt_ref.trim()
      : '';
    if (!ownerReceiptRef) {
      throw new Error('owner_receipt update requires payload.owner_receipt_ref');
    }
  }
  if (signal.signal_kind === 'user_instruction') {
    const instructionRef = typeof signal.payload.instruction_ref === 'string'
      ? signal.payload.instruction_ref.trim()
      : '';
    if (!instructionRef) {
      throw new Error('user_instruction update requires payload.instruction_ref');
    }
  }
  if (signal.signal_kind === 'resume') {
    const reason = typeof signal.payload.reason === 'string'
      ? signal.payload.reason.trim()
      : '';
    const resumeRef = typeof signal.payload.resume_ref === 'string'
      ? signal.payload.resume_ref.trim()
      : '';
    if (!reason && !resumeRef) {
      throw new Error('resume update requires payload.reason or payload.resume_ref');
    }
  }
}
export function validateWorkflowStageRunInput(input: TemporalStageRunWorkflowInput) {
  for (const [field, value] of Object.entries({
    stage_run_id: input.stage_run_id,
    quality_policy_ref: input.quality_policy_ref,
    domain_pack_root: input.domain_pack_root,
    stage_manifest_ref: input.stage_manifest_ref,
    stage_manifest_sha256: input.stage_manifest_sha256,
  })) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`StageRun pack binding requires ${field}.`);
    }
  }
  const roleKeys = Object.keys(input.role_prompt_refs ?? {}).sort();
  if (JSON.stringify(roleKeys) !== JSON.stringify(['producer', 're_reviewer', 'repairer', 'reviewer'])) {
    throw new Error('StageRun role_prompt_refs must use only producer, reviewer, repairer, and re_reviewer.');
  }
  const maxRepairRounds = input.quality_policy?.formal_review?.max_repair_rounds;
  if (!Number.isInteger(maxRepairRounds) || maxRepairRounds < 0 || maxRepairRounds > 3) {
    throw new Error('StageRun quality repair budget must be between zero and three.');
  }
  if (!Array.isArray(input.quality_rubric_refs) || input.quality_rubric_refs.length === 0) {
    throw new Error('StageRun quality rubric refs are required.');
  }
  if (
    !Array.isArray(input.declared_stage_ids)
    || input.declared_stage_ids.length === 0
    || !input.declared_stage_ids.includes(input.stage_id)
  ) {
    throw new Error('StageRun route transport requires declared Stage ids including the current Stage.');
  }
  if (input.stage_role === 'cross_stage_meta_review' && input.quality_policy.formal_review.required) {
    throw new Error('Cross-stage Meta Review Stage cannot recursively require formal Stage Review.');
  }
  const recovery = input.recovery_resume;
  if (recovery) {
    const resumeAfterRole = recovery.resume_after_role ?? 'producer';
    const artifactProducer = recovery.artifact_producer_attempt_summary
      ?? recovery.producer_attempt_summary;
    const artifactProducerAttemptRef = recovery.artifact_producer_attempt_ref
      ?? recovery.producer_attempt_ref;
    const artifactIdentityMatches = JSON.stringify({
      artifact_refs: recovery.artifact_refs,
      artifact_hashes: recovery.artifact_hashes,
      artifact_identity_receipt_refs: recovery.artifact_identity_receipt_refs,
    }) === JSON.stringify({
      artifact_refs: artifactProducer?.artifact_refs,
      artifact_hashes: artifactProducer?.artifact_hashes,
      artifact_identity_receipt_refs: artifactProducer?.artifact_identity_receipt_refs,
    });
    if (
      recovery.surface_kind !== 'opl_stage_run_recovery_resume'
      || recovery.version !== 'opl-stage-run-recovery-resume.v1'
      || !recovery.recovery_id?.trim()
      || recovery.quality_cycle_id !== stageRunQualityCycleId(input)
      || !input.quality_policy.formal_review.required
      || artifactProducer?.attempt_role !== (resumeAfterRole === 'reviewer' ? 'producer' : resumeAfterRole)
      || !['producer', 'repairer', 'reviewer'].includes(resumeAfterRole)
      || artifactProducer.status !== 'completed'
      || !artifactProducer.stage_attempt_id?.trim()
      || !artifactProducer.workflow_id?.trim()
      || !artifactProducer.execution_session_ref?.trim()
      || artifactProducerAttemptRef !== `opl://stage_attempts/${artifactProducer.stage_attempt_id}`
      || recovery.artifact_refs.length === 0
      || recovery.artifact_refs.length !== recovery.artifact_hashes.length
      || recovery.artifact_refs.length !== recovery.artifact_identity_receipt_refs.length
      || !artifactIdentityMatches
    ) {
      throw new Error('StageRun recovery resume must bind one completed artifact producer and its exact artifact identity.');
    }
  }
}
