import {
  DOMAIN_PROGRESS_POLICY_ADAPTER_CONTRACT,
  normalizeDomainProgressPolicyAdapterRequest,
} from './family-runtime-domain-progress-transition-runtime-parts/policy-adapter.ts';
import { auditDomainProgressTransitionReplay } from './family-runtime-domain-progress-transition-runtime-parts/replay-audit.ts';
import {
  DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
  DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE,
  SUPPORTED_TRANSITIONS,
  commandId,
  isRecord,
  masTransitionRequestBoundaryViolation,
  normalizeAggregateIdentity,
  optionalScalarString,
  optionalString,
  postconditionKind,
  requiresExplicitCommandId,
  stageRunIdentity,
  transitionKind,
} from './family-runtime-domain-progress-transition-runtime-parts/shared.ts';
import type {
  DomainProgressTransitionBlocked,
  DomainProgressTransitionCommandContext,
} from './family-runtime-domain-progress-transition-runtime-parts/shared.ts';

export {
  readDomainProgressTransitionRuntimeReadbackJsonl,
} from './family-runtime-domain-progress-transition-runtime-parts/live-readback.ts';

export { auditDomainProgressTransitionReplay };
export {
  appendDomainProgressTransitionRuntimeResult,
  appendDomainProgressTransitionRuntimeResultJsonl,
  buildDomainProgressTransitionRuntimeResult,
  createDomainProgressTransitionRuntimeLog,
  currentDomainProgressTransitionAggregateVersion,
  readDomainProgressHumanGateResumeToken,
  consumeDomainProgressHumanGateResumeToken,
  readDomainProgressTransitionIdempotency,
  readDomainProgressTransitionIdempotencyJsonl,
  readDomainProgressTransitionRuntimeLogJsonl,
  rebuildDomainProgressTransitionReadModel,
} from './family-runtime-domain-progress-transition-runtime-parts/runtime-results.ts';
export {
  buildNonAdvancingApplyRuntimeResult,
  reconcileDomainProgressTransitionFixedPoint,
  replayDomainProgressTransitionTrace,
} from './family-runtime-domain-progress-transition-runtime-parts/fixed-point-replay.ts';
export {
  DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
  DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE,
  readDomainProgressStageRunIdentity,
} from './family-runtime-domain-progress-transition-runtime-parts/shared.ts';
export type {
  DomainProgressTransitionBlocked,
  DomainProgressTransitionCommandContext,
  DomainProgressTransitionRuntimeLog,
} from './family-runtime-domain-progress-transition-runtime-parts/shared.ts';
export { DOMAIN_PROGRESS_POLICY_ADAPTER_CONTRACT };

export function normalizeDomainProgressTransitionCommand(
  command: Record<string, unknown>,
  context: DomainProgressTransitionCommandContext,
): { command?: Record<string, unknown>; blocked?: DomainProgressTransitionBlocked } {
  if (isRecord(command.paper_autonomy_supervisor_apply)) {
    return { blocked: { reason: 'domain_progress_transition_legacy_supervisor_apply_alias_forbidden', task: command } };
  }
  const policyAdapterRequest = normalizeDomainProgressPolicyAdapterRequest(command);
  if (policyAdapterRequest.blocked) {
    return { blocked: policyAdapterRequest.blocked };
  }
  const commandInput = policyAdapterRequest.request ?? command;
  const requestBoundaryViolation = masTransitionRequestBoundaryViolation(command);
  if (requestBoundaryViolation) {
    return { blocked: { reason: requestBoundaryViolation, task: command } };
  }
  const kind = transitionKind(commandInput);
  const aggregateIdentity = normalizeAggregateIdentity(commandInput, context);
  const idempotencyKey = optionalString(commandInput.idempotency_key);
  const sourceGeneration = optionalScalarString(commandInput.source_generation);
  const expectedVersion = optionalScalarString(commandInput.expected_version);
  const explicitCommandId = optionalString(commandInput.command_id);
  const postcondition = isRecord(commandInput.postcondition) ? commandInput.postcondition : null;
  const requiredPostcondition = isRecord(commandInput.required_postcondition) ? commandInput.required_postcondition : null;
  const outcome = isRecord(commandInput.outcome) ? commandInput.outcome : null;
  const outcomeKind = postconditionKind(commandInput);
  if (!kind || !SUPPORTED_TRANSITIONS.has(kind)) {
    return { blocked: { reason: 'domain_progress_transition_command_kind_missing_or_unsupported', task: commandInput } };
  }
  if (requiresExplicitCommandId(commandInput) && !explicitCommandId) {
    return { blocked: { reason: 'domain_progress_transition_command_identity_missing', task: commandInput } };
  }
  if (!aggregateIdentity || !idempotencyKey || !sourceGeneration || !expectedVersion) {
    return { blocked: { reason: 'domain_progress_transition_command_identity_missing', task: commandInput } };
  }
  if (
    optionalString(aggregateIdentity.study_id) !== context.studyId
    || optionalString(aggregateIdentity.work_unit_id) !== context.workUnitId
  ) {
    return { blocked: { reason: 'domain_progress_transition_command_identity_mismatch', task: commandInput } };
  }
  if (!outcomeKind) {
    return { blocked: { reason: 'domain_progress_transition_command_postcondition_missing', task: commandInput } };
  }
  return {
    command: {
      ...commandInput,
      surface_kind: 'opl_domain_progress_transition_command',
      runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
      runtime_owner: 'one-person-lab',
      module_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE.primary,
      brand_name: DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE.primary_brand,
      transition_kind: kind,
      command_id: explicitCommandId ?? commandId({
        ...commandInput,
        transition_kind: kind,
        idempotency_key: idempotencyKey,
        source_generation: sourceGeneration,
        expected_version: expectedVersion,
      }, aggregateIdentity),
      aggregate_identity: aggregateIdentity,
      action_type: optionalString(commandInput.action_type) ?? context.actionType ?? null,
      next_owner: optionalString(commandInput.next_owner) ?? context.nextOwner ?? null,
      idempotency_key: idempotencyKey,
      source_generation: sourceGeneration,
      expected_version: expectedVersion,
      postcondition: {
        ...(postcondition ?? {}),
        ...(requiredPostcondition ?? {}),
        kind: outcomeKind,
        exactly_one_transition_required: true,
        non_advancing_apply_on_no_outcome: true,
        outcome_owner:
          optionalString(postcondition?.outcome_owner)
          ?? optionalString(requiredPostcondition?.outcome_owner)
          ?? 'one-person-lab',
        domain_state_owner:
          optionalString(postcondition?.domain_state_owner)
          ?? optionalString(requiredPostcondition?.domain_state_owner)
          ?? 'domain-agent',
      },
      ...(outcome ? { outcome } : {}),
      stage_run_identity: stageRunIdentity(commandInput, aggregateIdentity, idempotencyKey),
      brand_module_allocation: DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE,
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_create_domain_owner_receipt: false,
        opl_can_create_domain_typed_blocker: false,
        provider_completion_is_domain_completion: false,
      },
    },
  };
}
