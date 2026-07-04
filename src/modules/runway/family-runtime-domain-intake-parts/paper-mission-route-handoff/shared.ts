import {
  recordList,
  stringValue as optionalString,
  type JsonRecord,
} from '../../../../kernel/json-record.ts';
import type { EnqueueInput } from '../../family-runtime-command.ts';

export { optionalString };
export type { JsonRecord };

export const HANDOFF_SURFACE_KIND = 'mas_paper_mission_opl_route_handoff_record';
export const MATERIALIZED_READBACK_SURFACE_KIND = 'paper_mission_materialized_readback';
export const COMMAND_PACKET_SURFACE_KIND = 'mas_paper_mission_opl_route_command_packet';
export const RUNTIME_REQUEST_SURFACE_KIND = 'opl_mas_paper_mission_route_runtime_request';
export const RUNTIME_TASK_KIND = 'paper_mission/stage-route';

export const SUPPORTED_COMMAND_KINDS = [
  'start_next_stage',
  'resume_stage',
  'route_back',
  'stop_with_typed_blocker',
  'wait_for_human',
  'complete_mission',
] as const;

export const RUNTIME_INTAKE_COMMAND_KINDS = [
  'start_next_stage',
  'resume_stage',
  'route_back',
] as const;

export const FORBIDDEN_WRITE_FLAGS = [
  'writes_authority_surface',
  'writes_publication_eval',
  'writes_controller_decision',
  'can_write_owner_receipt',
  'can_write_typed_blocker',
  'can_write_human_gate',
  'can_write_current_package',
  'can_write_paper_body',
  'can_write_runtime_queue',
  'can_write_opl_outbox',
  'can_write_opl_event',
  'can_write_opl_stage_run',
  'can_write_provider_attempt',
  'writes_owner_receipt',
  'writes_typed_blocker',
  'writes_human_gate',
  'writes_current_package',
  'writes_paper_body',
  'writes_runtime_queue',
  'writes_opl_outbox',
  'writes_opl_event',
  'writes_opl_stage_run',
  'writes_provider_attempt',
  'writes_yang_authority',
] as const;

export const FORBIDDEN_CLAIM_FLAGS = [
  'can_claim_opl_runtime_enqueued',
  'can_claim_opl_stage_run_created',
  'can_claim_provider_running',
  'can_claim_paper_progress',
  'can_claim_runtime_ready',
] as const;

export type SupportedCommandKind = typeof SUPPORTED_COMMAND_KINDS[number];

export type IntakeOptions = {
  source?: string;
  workspaceRoot?: string | null;
  commandCwd?: string | null;
  commandSource?: string | null;
};

export type MasPaperMissionRouteHandoffIntakeStatus =
  | 'accepted_for_runtime_intake'
  | 'typed_wait'
  | 'terminal_no_runtime'
  | 'rejected';

export type MasPaperMissionRouteHandoffIntakeBlocker = {
  reason:
    | 'invalid_handoff_payload'
    | 'unknown_surface_kind'
    | 'missing_authority_boundary'
    | 'missing_study_id'
    | 'missing_paper_mission_transaction'
    | 'missing_opl_route_command_ref'
    | 'missing_route_target'
    | 'missing_domain_workspace_root'
    | 'missing_route_identity_key'
    | 'missing_attempt_idempotency_key'
    | 'unsupported_route_command'
    | 'forbidden_authority_write'
    | 'forbidden_authority_claim'
    | 'handoff_not_ready_for_runtime_intake';
  detail?: string;
  field?: string;
  value?: unknown;
};

export type MasPaperMissionRouteHandoffIntakeReadback = {
  surface_kind: 'opl_mas_paper_mission_route_handoff_intake_readback';
  schema_version: 1;
  source_surface_kind: string | null;
  domain_truth_owner: 'med-autoscience';
  runtime_owner: 'one-person-lab';
  status: MasPaperMissionRouteHandoffIntakeStatus;
  wait_kind: string | null;
  handoff_status: string | null;
  command_kind: string | null;
  study_id: string | null;
  mission_id: string | null;
  candidate_ref: string | null;
  paper_mission_transaction_ref: string | null;
  opl_route_command_ref: string | null;
  route_target: string | null;
  route_identity_key: string | null;
  attempt_idempotency_key: string | null;
  request_idempotency_key: string | null;
  can_submit_to_opl_runtime: boolean;
  runtime_start_requested: false;
  writes_opl_outbox: false;
  writes_opl_event: false;
  writes_opl_stage_run: false;
  writes_provider_attempt: false;
  can_claim_runtime_enqueued: false;
  can_claim_stage_run_created: false;
  can_claim_provider_running: false;
  can_claim_paper_progress: false;
  can_claim_runtime_ready: false;
  owner_route: JsonRecord | null;
  next_action: JsonRecord | null;
  handoff_projection: JsonRecord | null;
  runtime_request_input: EnqueueInput | null;
  accepted_command_packet: {
    surface_kind: typeof COMMAND_PACKET_SURFACE_KIND;
    command_kind: SupportedCommandKind | null;
    route_command_materialized: boolean;
    writes_opl_outbox: false;
    writes_opl_event: false;
    writes_opl_stage_run: false;
    writes_provider_attempt: false;
  };
  authority_boundary: {
    validates_mas_authority_boundary: boolean;
    writes_owner_receipt: false;
    writes_typed_blocker: false;
    writes_human_gate: false;
    writes_current_package: false;
    writes_paper_body: false;
    writes_runtime_queue: false;
    writes_opl_outbox: false;
    writes_opl_event: false;
    writes_opl_stage_run: false;
    writes_provider_attempt: false;
    can_claim_opl_runtime_enqueued: false;
    can_claim_opl_stage_run_created: false;
    can_claim_provider_running: false;
    can_claim_paper_progress: false;
    can_claim_runtime_ready: false;
  };
  blockers: MasPaperMissionRouteHandoffIntakeBlocker[];
};

export type MasPaperMissionRouteHandoffExportReadback = {
  surface_kind: 'opl_mas_paper_mission_route_handoff_export_intake_readback';
  schema_version: 1;
  source_path: '/paper_mission_default_tasks' | '/pending_family_tasks' | 'direct_handoff' | 'not_found';
  legacy_pending_family_tasks_considered: boolean;
  readbacks: MasPaperMissionRouteHandoffIntakeReadback[];
  authority_boundary: {
    writes_opl_outbox: false;
    writes_opl_event: false;
    writes_opl_stage_run: false;
    writes_provider_attempt: false;
    can_claim_stage_run_created: false;
    can_claim_provider_running: false;
    can_claim_paper_progress: false;
    can_claim_runtime_ready: false;
  };
};

export function booleanTrue(value: unknown) {
  return value === true;
}

export function asRecord(value: unknown) {
  return recordList([value])[0] ?? null;
}

export function nestedRecord(value: JsonRecord, key: string) {
  return asRecord(value[key]);
}

export function routeCommandKind(handoff: JsonRecord) {
  return optionalString(handoff.route_command_kind)
    ?? optionalString(nestedRecord(handoff, 'opl_route_command')?.command_kind);
}

export function routeTarget(handoff: JsonRecord) {
  return optionalString(handoff.route_target)
    ?? optionalString(nestedRecord(handoff, 'opl_route_command')?.target);
}

export function supportedCommandKind(value: string | null): value is SupportedCommandKind {
  return value !== null && SUPPORTED_COMMAND_KINDS.includes(value as SupportedCommandKind);
}

export function isRuntimeIntakeCommand(value: SupportedCommandKind) {
  return RUNTIME_INTAKE_COMMAND_KINDS.includes(
    value as typeof RUNTIME_INTAKE_COMMAND_KINDS[number],
  );
}
