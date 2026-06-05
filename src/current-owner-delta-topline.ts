import { buildAppStageRunCockpit } from './app-state-stage-run-cockpit.ts';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
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
  const readModel = record(input.currentOwnerDeltaReadModel);
  const currentOwnerDelta = record(readModel.current_owner_delta);
  const stageRunCockpit = buildAppStageRunCockpit(currentOwnerDelta);
  const operatorAcceptedAnswerShape =
    strings(currentOwnerDelta.accepted_answer_shape).length > 0
      ? strings(currentOwnerDelta.accepted_answer_shape)
      : strings(currentOwnerDelta.required_return_shapes);
  return {
    current_owner_delta: currentOwnerDelta,
    current_owner_delta_read_model: readModel,
    operator_next_owner: text(currentOwnerDelta.current_owner),
    operator_required_delta: text(currentOwnerDelta.desired_delta_description),
    operator_payload_requirement: text(currentOwnerDelta.payload_requirement),
    operator_accepted_answer_shape: operatorAcceptedAnswerShape,
    stage_run_cockpit: stageRunCockpit,
    stage_run_cockpit_summary: {
      surface_kind: stageRunCockpit.surface_kind,
      current_owner: text(record(stageRunCockpit.stage_run_current_owner_delta).current_owner),
      stage_id: text(record(stageRunCockpit.stage_run_current_owner_delta).stage_id),
      required_delta: text(record(stageRunCockpit.stage_run_current_owner_delta).required_delta),
      execution_authorized:
        record(stageRunCockpit.execution_authorization).execution_authorized === true,
      execution_authorization_status:
        text(record(stageRunCockpit.execution_authorization).status),
      refs_only: true,
    },
  };
}
