import { buildAppStageRunCockpit } from './app-state-stage-run-cockpit.ts';
import {
  currentOwnerDeltaWithClosedStageRunAnswer,
  readModelWithClosedStageRunAnswer,
} from './current-owner-delta-stage-run-closeout.ts';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function optionalRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.map(text).filter((entry): entry is string => Boolean(entry))
    : [];
}

export function buildCurrentOwnerDeltaTopline(input: {
  currentOwnerDeltaReadModel: unknown;
}) {
  const rawReadModel = record(input.currentOwnerDeltaReadModel);
  const rawCurrentOwnerDelta = record(rawReadModel.current_owner_delta);
  const preliminaryStageRunCockpit = buildAppStageRunCockpit(rawCurrentOwnerDelta);
  const currentOwnerDelta = currentOwnerDeltaWithClosedStageRunAnswer(
    rawCurrentOwnerDelta,
    preliminaryStageRunCockpit,
  );
  const readModel = readModelWithClosedStageRunAnswer(
    rawReadModel,
    currentOwnerDelta,
    preliminaryStageRunCockpit,
  );
  const stageRunCockpit = buildAppStageRunCockpit(currentOwnerDelta);
  const operatorAcceptedAnswerShape =
    strings(currentOwnerDelta.accepted_answer_shape).length > 0
      ? strings(currentOwnerDelta.accepted_answer_shape)
      : strings(currentOwnerDelta.required_return_shapes);
  const operatorNextAction = optionalRecord(readModel.next_safe_action_or_none);
  const stageRunNextAction = optionalRecord(stageRunCockpit.next_required_owner_action);
  const stageRunOwnerAnswerBindingMissing =
    text(stageRunNextAction?.derivation_source) === 'stage_run_execution_authorization'
    && stageRunNextAction?.owner_answer_missing_before_opl_closeout_binding === true;
  const ownerAnswerBindingMissingRefs = strings(stageRunNextAction?.missing_input_refs);
  const ownerAnswerBindingRequiredRefShape = record(stageRunNextAction?.required_ref_shape);
  const stageRunExecutionAuthorization = record(stageRunCockpit.execution_authorization);
  const stageRunCloseoutBindingBlockers = strings(stageRunExecutionAuthorization.closeout_binding_blockers);
  const stageRunOwnerAnswerBindingClosed =
    text(stageRunExecutionAuthorization.status) === 'authorized'
    && text(stageRunExecutionAuthorization.phase) === 'closeout'
    && stageRunCloseoutBindingBlockers.length === 0
    && text(record(stageRunExecutionAuthorization.closeout_binding).owner_answer_ref) !== null;
  const effectiveOperatorNextAction =
    stageRunOwnerAnswerBindingClosed
        ? null
      : stageRunOwnerAnswerBindingMissing && operatorNextAction
        ? {
            ...operatorNextAction,
            missing_input_refs: ownerAnswerBindingMissingRefs,
            required_ref_shape: ownerAnswerBindingRequiredRefShape,
            stage_run_closeout_binding_ref: '/stage_run_cockpit/execution_authorization',
            stage_run_closeout_binding_policy:
              'domain_owner_answer_must_bind_stage_run_manifest_current_pointer_source_fingerprint_and_idempotency',
        }
        : operatorNextAction;
  const defaultOperatorNextAction = effectiveOperatorNextAction ?? {};
  const stageRunExecutionBlocker = record(stageRunExecutionAuthorization.opl_runtime_blocker);
  const stageRunLaunchBlockers = strings(stageRunExecutionAuthorization.launch_blockers);
  const stageRunBlockedAuthority = strings(stageRunExecutionBlocker.blocked_authority);
  const operatorNextOwner =
    text(defaultOperatorNextAction.next_required_owner)
    ?? text(defaultOperatorNextAction.current_owner)
    ?? text(defaultOperatorNextAction.owner)
    ?? text(currentOwnerDelta.current_owner);
  const operatorPayloadRequirement =
    text(defaultOperatorNextAction.payload_requirement)
    ?? text(currentOwnerDelta.payload_requirement);
  const effectiveAcceptedAnswerShape =
    strings(defaultOperatorNextAction.accepted_answer_shape).length > 0
      ? strings(defaultOperatorNextAction.accepted_answer_shape)
      : operatorAcceptedAnswerShape;
  return {
    current_owner_delta: currentOwnerDelta,
    current_owner_delta_read_model: readModel,
    operator_current_owner_delta_owner: text(currentOwnerDelta.current_owner),
    operator_next_owner: operatorNextOwner,
    operator_required_delta: text(currentOwnerDelta.desired_delta_description),
    operator_payload_requirement: operatorPayloadRequirement,
    operator_accepted_answer_shape: effectiveAcceptedAnswerShape,
    operator_next_action: effectiveOperatorNextAction,
    operator_next_action_source: stageRunOwnerAnswerBindingClosed
        ? 'stage_run_execution_authorization_closed'
      : text(operatorNextAction?.derivation_source),
    current_owner_delta_next_action: operatorNextAction,
    operator_next_action_kind: text(defaultOperatorNextAction.action_kind),
    operator_next_action_owner: operatorNextOwner,
    operator_next_required_action:
      text(defaultOperatorNextAction.next_required_action)
      ?? text(defaultOperatorNextAction.action_kind),
    operator_next_missing_input_refs:
      strings(defaultOperatorNextAction.missing_input_refs),
    operator_next_required_ref_shape:
      record(defaultOperatorNextAction.required_ref_shape),
    operator_next_stage_run_closeout_binding_ref:
      text(defaultOperatorNextAction.stage_run_closeout_binding_ref),
    operator_next_stage_run_closeout_binding_policy:
      text(defaultOperatorNextAction.stage_run_closeout_binding_policy),
    stage_run_next_required_owner_action: stageRunNextAction,
    stage_run_next_missing_input_refs:
      strings(stageRunNextAction?.missing_input_refs),
    stage_run_next_required_ref_shape:
      record(stageRunNextAction?.required_ref_shape),
    operator_next_action_authority_boundary: {
      derivation_source: text(defaultOperatorNextAction.derivation_source),
      default_planning_root: text(defaultOperatorNextAction.default_planning_root),
      can_submit_to_safe_action_shell:
        defaultOperatorNextAction.can_submit_to_safe_action_shell === true,
      route_requires_domain_or_app_payload:
        defaultOperatorNextAction.route_requires_domain_or_app_payload === true,
      route_requires_opl_runtime_refs:
        defaultOperatorNextAction.route_requires_opl_runtime_refs === true,
      can_execute_domain_action:
        defaultOperatorNextAction.can_execute_domain_action === true,
      can_write_domain_truth:
        defaultOperatorNextAction.can_write_domain_truth === true,
      can_create_owner_receipt:
        defaultOperatorNextAction.can_create_owner_receipt === true,
      can_create_typed_blocker:
        defaultOperatorNextAction.can_create_typed_blocker === true,
      can_close_domain_ready:
        defaultOperatorNextAction.can_close_domain_ready === true,
      can_claim_production_ready:
        defaultOperatorNextAction.can_claim_production_ready === true,
      domain_typed_blocker_created:
        defaultOperatorNextAction.domain_typed_blocker_created === true,
      execution_blocker_is_domain_typed_blocker:
        defaultOperatorNextAction.execution_blocker_is_domain_typed_blocker === true,
      worklist_item_is_completion_claim:
        defaultOperatorNextAction.worklist_item_is_completion_claim === true,
    },
    stage_run_execution_authorization_next_action_authority_boundary: {
      derivation_source: text(stageRunNextAction?.derivation_source),
      default_planning_root: text(stageRunNextAction?.default_planning_root),
      route_requires_opl_runtime_refs:
        stageRunNextAction?.route_requires_opl_runtime_refs === true,
      route_requires_domain_or_app_payload:
        stageRunNextAction?.route_requires_domain_or_app_payload === true,
      can_execute_domain_action:
        stageRunNextAction?.can_execute_domain_action === true,
      can_write_domain_truth:
        stageRunNextAction?.can_write_domain_truth === true,
      can_create_owner_receipt:
        stageRunNextAction?.can_create_owner_receipt === true,
      can_create_typed_blocker:
        stageRunNextAction?.can_create_typed_blocker === true,
      domain_typed_blocker_created:
        stageRunNextAction?.domain_typed_blocker_created === true,
      execution_blocker_is_domain_typed_blocker:
        stageRunNextAction?.execution_blocker_is_domain_typed_blocker === true,
      worklist_item_is_completion_claim:
        stageRunNextAction?.worklist_item_is_completion_claim === true,
    },
    stage_run_cockpit: stageRunCockpit,
    stage_run_cockpit_summary: {
      surface_kind: stageRunCockpit.surface_kind,
      current_owner: text(record(stageRunCockpit.stage_run_current_owner_delta).current_owner),
      current_owner_delta_owner:
        text(record(stageRunCockpit.stage_run_current_owner_delta).current_owner_delta_owner)
        ?? text(currentOwnerDelta.current_owner),
      stage_id: text(record(stageRunCockpit.stage_run_current_owner_delta).stage_id),
      required_delta: text(record(stageRunCockpit.stage_run_current_owner_delta).required_delta),
      execution_authorized:
        stageRunExecutionAuthorization.execution_authorized === true,
      execution_authorization_status:
        text(stageRunExecutionAuthorization.status),
      execution_authorization_phase:
        text(stageRunExecutionAuthorization.phase),
      blocked_authority: stageRunBlockedAuthority,
      launch_blocker_count: stageRunLaunchBlockers.length,
      closeout_binding_blocker_count: stageRunCloseoutBindingBlockers.length,
      route_requires_domain_or_app_payload:
        stageRunNextAction?.route_requires_domain_or_app_payload === true,
      route_requires_opl_runtime_refs:
        stageRunNextAction?.route_requires_opl_runtime_refs === true,
      closeout_binding_blocked:
        stageRunBlockedAuthority.includes('closeout_receipt_binding')
        || stageRunCloseoutBindingBlockers.length > 0,
      execution_authorization_refs_missing:
        stageRunBlockedAuthority.includes('execution_authorization')
        || stageRunLaunchBlockers.length > 0,
      next_required_owner:
        text(stageRunNextAction?.next_required_owner),
      next_required_action:
        text(stageRunNextAction?.next_required_action),
      missing_input_refs:
        strings(stageRunNextAction?.missing_input_refs),
      domain_typed_blocker_created:
        stageRunNextAction?.domain_typed_blocker_created === true,
      refs_only: true,
    },
  };
}
