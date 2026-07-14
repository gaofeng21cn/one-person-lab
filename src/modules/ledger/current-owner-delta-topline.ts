import { buildAppStageRunCockpit } from '../stagecraft/index.ts';
import {
  record,
  stringList as strings,
  stringValue as text,
  type JsonRecord,
} from '../../kernel/json-record.ts';

function optionalRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? record(value)
    : null;
}

export function buildCurrentOwnerDeltaTopline(input: {
  currentOwnerDeltaReadModel: unknown;
}) {
  const readModel = record(input.currentOwnerDeltaReadModel);
  const currentOwnerDelta = record(readModel.current_owner_delta);
  const stageRunCockpit = buildAppStageRunCockpit(currentOwnerDelta);
  const stageRunDelta = record(stageRunCockpit.stage_run_current_owner_delta);
  const closeoutProgress = record(stageRunCockpit.closeout_progress);
  const operatorNextAction = optionalRecord(readModel.next_safe_action_or_none);
  const operatorAcceptedAnswerShape =
    strings(currentOwnerDelta.accepted_answer_shape).length > 0
      ? strings(currentOwnerDelta.accepted_answer_shape)
      : strings(currentOwnerDelta.required_return_shapes);
  const operatorNextOwner =
    text(operatorNextAction?.next_required_owner)
    ?? text(operatorNextAction?.current_owner)
    ?? text(operatorNextAction?.owner)
    ?? text(currentOwnerDelta.current_owner);
  const effectiveAcceptedAnswerShape =
    strings(operatorNextAction?.accepted_answer_shape).length > 0
      ? strings(operatorNextAction?.accepted_answer_shape)
      : operatorAcceptedAnswerShape;

  return {
    current_owner_delta: currentOwnerDelta,
    current_owner_delta_read_model: readModel,
    operator_current_owner_delta_owner: text(currentOwnerDelta.current_owner),
    operator_next_owner: operatorNextOwner,
    operator_required_delta: text(currentOwnerDelta.desired_delta_description),
    operator_payload_requirement:
      text(operatorNextAction?.payload_requirement) ?? text(currentOwnerDelta.payload_requirement),
    operator_accepted_answer_shape: effectiveAcceptedAnswerShape,
    operator_next_action: operatorNextAction,
    operator_next_action_source: text(operatorNextAction?.derivation_source),
    current_owner_delta_next_action: operatorNextAction,
    operator_next_action_kind: text(operatorNextAction?.action_kind),
    operator_next_action_owner: operatorNextOwner,
    operator_next_required_action:
      text(operatorNextAction?.next_required_action) ?? text(operatorNextAction?.action_kind),
    operator_next_missing_input_refs: strings(operatorNextAction?.missing_input_refs),
    operator_next_required_ref_shape: record(operatorNextAction?.required_ref_shape),
    operator_next_action_authority_boundary: {
      derivation_source: text(operatorNextAction?.derivation_source),
      can_submit_to_safe_action_shell: operatorNextAction?.can_submit_to_safe_action_shell === true,
      route_requires_domain_or_app_payload: operatorNextAction?.route_requires_domain_or_app_payload === true,
      can_execute_domain_action: operatorNextAction?.can_execute_domain_action === true,
      can_write_domain_truth: operatorNextAction?.can_write_domain_truth === true,
      can_create_owner_receipt: operatorNextAction?.can_create_owner_receipt === true,
      can_create_typed_blocker: operatorNextAction?.can_create_typed_blocker === true,
      can_close_domain_ready: operatorNextAction?.can_close_domain_ready === true,
      can_claim_production_ready: operatorNextAction?.can_claim_production_ready === true,
      worklist_item_is_completion_claim: operatorNextAction?.worklist_item_is_completion_claim === true,
    },
    stage_run_cockpit: stageRunCockpit,
    stage_run_cockpit_summary: {
      surface_kind: stageRunCockpit.surface_kind,
      current_owner: text(stageRunDelta.current_owner),
      stage_id: text(stageRunDelta.stage_id),
      required_delta: text(stageRunDelta.required_delta),
      next_stage_may_start: stageRunDelta.next_stage_may_start === true,
      transition_outcome: text(closeoutProgress.transition_outcome),
      quality_debt_reasons: strings(closeoutProgress.quality_debt_reasons),
      missing_transport_refs_block_next_stage: false,
      semantic_route_owner: 'decisive_codex_attempt',
      refs_only: true,
    },
  };
}
