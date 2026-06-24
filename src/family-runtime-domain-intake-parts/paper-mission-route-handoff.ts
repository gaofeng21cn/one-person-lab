import path from 'node:path';

import type { EnqueueInput } from '../family-runtime-command.ts';

const HANDOFF_SURFACE_KIND = 'mas_paper_mission_opl_route_handoff_record';
const MATERIALIZED_READBACK_SURFACE_KIND = 'paper_mission_materialized_readback';
const COMMAND_PACKET_SURFACE_KIND = 'mas_paper_mission_opl_route_command_packet';
const RUNTIME_REQUEST_SURFACE_KIND = 'opl_mas_paper_mission_route_runtime_request';
const RUNTIME_TASK_KIND = 'paper_mission/stage-route';

const SUPPORTED_COMMAND_KINDS = [
  'start_next_stage',
  'resume_stage',
  'route_back',
  'stop_with_typed_blocker',
  'wait_for_human',
  'complete_mission',
] as const;

const RUNTIME_INTAKE_COMMAND_KINDS = [
  'start_next_stage',
  'resume_stage',
  'route_back',
] as const;

const FORBIDDEN_WRITE_FLAGS = [
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

const FORBIDDEN_CLAIM_FLAGS = [
  'can_claim_opl_runtime_enqueued',
  'can_claim_opl_stage_run_created',
  'can_claim_provider_running',
  'can_claim_paper_progress',
  'can_claim_runtime_ready',
] as const;

type JsonRecord = Record<string, unknown>;

type SupportedCommandKind = typeof SUPPORTED_COMMAND_KINDS[number];

type IntakeOptions = {
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
    | 'missing_paper_mission_transaction'
    | 'missing_domain_workspace_root'
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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function booleanTrue(value: unknown) {
  return value === true;
}

function nestedRecord(value: JsonRecord, key: string) {
  return isRecord(value[key]) ? value[key] : null;
}

function routeCommandKind(handoff: JsonRecord) {
  return optionalString(handoff.route_command_kind)
    ?? optionalString(nestedRecord(handoff, 'opl_route_command')?.command_kind);
}

function routeTarget(handoff: JsonRecord) {
  return optionalString(handoff.route_target)
    ?? optionalString(nestedRecord(handoff, 'opl_route_command')?.target);
}

function transactionRefFromTerminalDecisionRef(value: string | null) {
  const suffix = '#stage_terminal_decision';
  return value?.endsWith(suffix) ? value.slice(0, -suffix.length) : null;
}

function routeCommandRefFromTransactionRef(value: string | null) {
  return value ? `${value}#opl_route_command` : null;
}

function materializedHandoffStatus(commandKind: string | null) {
  if (
    commandKind === 'start_next_stage'
    || commandKind === 'resume_stage'
    || commandKind === 'route_back'
  ) {
    return 'ready_for_opl_route_command';
  }
  if (commandKind === 'stop_with_typed_blocker') {
    return 'waiting_for_typed_blocker_authority';
  }
  if (commandKind === 'wait_for_human') {
    return 'waiting_for_human_gate_authority';
  }
  if (commandKind === 'complete_mission') {
    return 'mission_complete';
  }
  return null;
}

function anyBooleanTrue(...values: unknown[]) {
  return values.some((value) => booleanTrue(value));
}

function materializedAuthorityBoundary(payload: JsonRecord) {
  const transaction = nestedRecord(payload, 'paper_mission_transaction');
  const transactionAuthority = nestedRecord(transaction ?? {}, 'authority_boundary')
    ?? nestedRecord(payload, 'authority_boundary');
  const carrier = nestedRecord(payload, 'opl_runtime_carrier');
  const carrierAuthority = nestedRecord(carrier ?? {}, 'authority_boundary')
    ?? nestedRecord(payload, 'stage_transition_authority_boundary');
  if (!transactionAuthority && !carrierAuthority) {
    return null;
  }
  return {
    writes_authority_surface: anyBooleanTrue(
      transactionAuthority?.writes_authority_surface,
      payload.writes_authority_surface,
    ),
    writes_publication_eval: anyBooleanTrue(
      transactionAuthority?.writes_publication_eval,
      payload.writes_publication_eval,
    ),
    writes_controller_decision: anyBooleanTrue(
      transactionAuthority?.writes_controller_decision,
      payload.writes_controller_decision,
    ),
    can_write_owner_receipt: anyBooleanTrue(
      transactionAuthority?.writes_owner_receipt,
      payload.can_write_owner_receipt,
    ),
    can_write_typed_blocker: anyBooleanTrue(
      transactionAuthority?.writes_typed_blocker,
      payload.can_write_typed_blocker,
    ),
    can_write_human_gate: anyBooleanTrue(
      transactionAuthority?.writes_human_gate,
      payload.can_write_human_gate,
    ),
    can_write_current_package: anyBooleanTrue(
      transactionAuthority?.writes_current_package,
      payload.can_write_current_package,
    ),
    can_write_paper_body: anyBooleanTrue(payload.can_write_paper_body),
    can_write_runtime_queue: anyBooleanTrue(
      transactionAuthority?.writes_runtime_queue,
      payload.can_write_runtime_queue,
    ),
    can_write_opl_outbox: anyBooleanTrue(
      carrier?.can_write_opl_outbox,
      carrierAuthority?.mas_can_create_opl_outbox_record,
      payload.can_write_opl_outbox,
    ),
    can_write_opl_event: anyBooleanTrue(
      carrier?.can_write_opl_event,
      carrierAuthority?.mas_can_create_opl_event,
      payload.can_write_opl_event,
    ),
    can_write_opl_stage_run: anyBooleanTrue(
      carrier?.can_write_opl_stage_run,
      carrierAuthority?.mas_can_create_opl_stage_run,
      payload.can_write_opl_stage_run,
    ),
    can_write_provider_attempt: anyBooleanTrue(
      carrier?.can_write_provider_attempt,
      carrierAuthority?.mas_can_authorize_provider_admission,
      payload.can_write_provider_attempt,
    ),
    writes_yang_authority: anyBooleanTrue(
      transactionAuthority?.writes_yang_authority,
      payload.writes_yang_authority,
    ),
  };
}

function materializedReadbackToHandoff(payload: JsonRecord) {
  const carrier = nestedRecord(payload, 'opl_runtime_carrier');
  const routeCommand = nestedRecord(payload, 'opl_route_command')
    ?? nestedRecord(carrier ?? {}, 'opl_route_command');
  const terminalDecision = nestedRecord(payload, 'stage_terminal_decision');
  const transaction = nestedRecord(payload, 'paper_mission_transaction');
  const terminalDecisionRef = optionalString(carrier?.stage_terminal_decision_ref)
    ?? optionalString(routeCommand?.source_terminal_decision_ref);
  const transactionRef = optionalString(carrier?.paper_mission_transaction_ref)
    ?? optionalString(transaction?.transaction_id)
    ?? transactionRefFromTerminalDecisionRef(terminalDecisionRef);
  const commandKind = optionalString(routeCommand?.command_kind);
  const handoffStatus = materializedHandoffStatus(commandKind);
  return {
    surface_kind: HANDOFF_SURFACE_KIND,
    source_surface_kind: MATERIALIZED_READBACK_SURFACE_KIND,
    schema_version: 1,
    source: optionalString(payload.source) ?? MATERIALIZED_READBACK_SURFACE_KIND,
    study_id: optionalString(payload.study_id) ?? optionalString(carrier?.study_id),
    mission_id: optionalString(payload.mission_id)
      ?? optionalString(nestedRecord(carrier ?? {}, 'aggregate_identity')?.mission_id),
    candidate_ref: optionalString(payload.candidate_manifest_ref)
      ?? optionalString(payload.materialized_mission_ref),
    status: optionalString(terminalDecision?.status)
      ?? optionalString(payload.transaction_state),
    selected_outcome: optionalString(terminalDecision?.accepted_result)
      ?? optionalString(terminalDecision?.decision_kind)
      ?? optionalString(payload.transaction_state),
    handoff_status: handoffStatus,
    next_owner: optionalString(terminalDecision?.next_owner),
    paper_mission_transaction_ref: transactionRef,
    transaction_state: optionalString(payload.transaction_state),
    opl_route_command_ref: optionalString(carrier?.opl_route_command_ref)
      ?? routeCommandRefFromTransactionRef(transactionRef),
    opl_route_command: routeCommand ?? {},
    route_command_kind: commandKind,
    route_target: optionalString(routeCommand?.target),
    stage_terminal_decision_ref: terminalDecisionRef,
    materialized_mission_ref: optionalString(payload.materialized_mission_ref),
    transaction_materialized: true,
    can_submit_to_opl_runtime:
      handoffStatus === 'ready_for_opl_route_command'
      && supportedCommandKind(commandKind)
      && isRuntimeIntakeCommand(commandKind),
    can_claim_opl_runtime_enqueued: booleanTrue(payload.can_claim_opl_runtime_enqueued),
    can_claim_opl_stage_run_created: booleanTrue(payload.can_claim_opl_stage_run_created),
    can_claim_provider_running: booleanTrue(carrier?.can_claim_provider_running)
      || booleanTrue(payload.can_claim_provider_running),
    can_claim_paper_progress: booleanTrue(carrier?.can_claim_paper_progress)
      || booleanTrue(payload.can_claim_paper_progress),
    can_claim_runtime_ready: booleanTrue(carrier?.can_claim_runtime_ready)
      || booleanTrue(payload.can_claim_runtime_ready),
    authority_boundary: materializedAuthorityBoundary(payload),
    source_stage_terminal_decision: terminalDecision ?? {},
  };
}

function supportedCommandKind(value: string | null): value is SupportedCommandKind {
  return value !== null && SUPPORTED_COMMAND_KINDS.includes(value as SupportedCommandKind);
}

function isRuntimeIntakeCommand(value: SupportedCommandKind) {
  return RUNTIME_INTAKE_COMMAND_KINDS.includes(
    value as typeof RUNTIME_INTAKE_COMMAND_KINDS[number],
  );
}

function baseReadback(
  handoff: JsonRecord | null,
  blockers: MasPaperMissionRouteHandoffIntakeBlocker[] = [],
): MasPaperMissionRouteHandoffIntakeReadback {
  const commandKind = handoff ? routeCommandKind(handoff) : null;
  const supported = supportedCommandKind(commandKind) ? commandKind : null;
  return {
    surface_kind: 'opl_mas_paper_mission_route_handoff_intake_readback',
    schema_version: 1,
    source_surface_kind: handoff
      ? optionalString(handoff.source_surface_kind) ?? optionalString(handoff.surface_kind)
      : null,
    domain_truth_owner: 'med-autoscience',
    runtime_owner: 'one-person-lab',
    status: 'rejected',
    wait_kind: null,
    handoff_status: handoff ? optionalString(handoff.handoff_status) : null,
    command_kind: commandKind,
    study_id: handoff ? optionalString(handoff.study_id) : null,
    mission_id: handoff ? optionalString(handoff.mission_id) : null,
    candidate_ref: handoff ? optionalString(handoff.candidate_ref) : null,
    paper_mission_transaction_ref: handoff ? optionalString(handoff.paper_mission_transaction_ref) : null,
    opl_route_command_ref: handoff ? optionalString(handoff.opl_route_command_ref) : null,
    route_target: handoff ? routeTarget(handoff) : null,
    can_submit_to_opl_runtime: false,
    runtime_start_requested: false,
    writes_opl_outbox: false,
    writes_opl_event: false,
    writes_opl_stage_run: false,
    writes_provider_attempt: false,
    can_claim_runtime_enqueued: false,
    can_claim_stage_run_created: false,
    can_claim_provider_running: false,
    can_claim_paper_progress: false,
    can_claim_runtime_ready: false,
    runtime_request_input: null,
    accepted_command_packet: {
      surface_kind: COMMAND_PACKET_SURFACE_KIND,
      command_kind: supported,
      route_command_materialized: handoff?.transaction_materialized === true,
      writes_opl_outbox: false,
      writes_opl_event: false,
      writes_opl_stage_run: false,
      writes_provider_attempt: false,
    },
    authority_boundary: {
      validates_mas_authority_boundary: false,
      writes_owner_receipt: false,
      writes_typed_blocker: false,
      writes_human_gate: false,
      writes_current_package: false,
      writes_paper_body: false,
      writes_runtime_queue: false,
      writes_opl_outbox: false,
      writes_opl_event: false,
      writes_opl_stage_run: false,
      writes_provider_attempt: false,
      can_claim_opl_runtime_enqueued: false,
      can_claim_opl_stage_run_created: false,
      can_claim_provider_running: false,
      can_claim_paper_progress: false,
      can_claim_runtime_ready: false,
    },
    blockers,
  };
}

function runtimeRequestAuthorityBoundary() {
  return {
    domain_truth_owner: 'med-autoscience',
    runtime_owner: 'one-person-lab',
    runtime_request_scope: 'opl_queue_and_stage_route_request_only',
    writes_owner_receipt: false,
    writes_typed_blocker: false,
    writes_human_gate: false,
    writes_current_package: false,
    writes_paper_body: false,
    writes_runtime_queue: false,
    writes_opl_queue: true,
    writes_opl_outbox: true,
    writes_opl_event: true,
    writes_opl_stage_run: false,
    writes_provider_attempt: false,
    can_claim_opl_runtime_enqueued: false,
    can_claim_opl_stage_run_created: false,
    can_claim_provider_running: false,
    can_claim_paper_progress: false,
    can_claim_runtime_ready: false,
  };
}

function workspaceRootForRuntimeRequest(handoff: JsonRecord, options: IntakeOptions) {
  return optionalString(handoff.workspace_root)
    ?? optionalString(handoff.domain_workspace_root)
    ?? optionalString(handoff.repo_root)
    ?? workspaceRootFromAbsoluteRef(optionalString(handoff.candidate_ref))
    ?? workspaceRootFromAbsoluteRef(optionalString(handoff.source_ref))
    ?? optionalString(options.workspaceRoot);
}

function workspaceRootFromAbsoluteRef(value: string | null) {
  if (!value || !path.isAbsolute(value)) {
    return null;
  }
  const normalized = path.normalize(value);
  const marker = `${path.sep}ops${path.sep}medautoscience${path.sep}`;
  const index = normalized.indexOf(marker);
  if (index <= 0) {
    return null;
  }
  return normalized.slice(0, index);
}

function runtimeRequestInput(
  handoff: JsonRecord,
  readback: MasPaperMissionRouteHandoffIntakeReadback,
  options: IntakeOptions,
): EnqueueInput | null {
  if (
    readback.status !== 'accepted_for_runtime_intake'
    || !readback.study_id
    || !readback.paper_mission_transaction_ref
    || !supportedCommandKind(readback.command_kind)
  ) {
    return null;
  }
  const routeCommand = nestedRecord(handoff, 'opl_route_command');
  const dedupeKey = [
    'paper-mission-route',
    readback.study_id,
    readback.paper_mission_transaction_ref,
    readback.command_kind,
  ].join(':');
  const workspaceRoot = workspaceRootForRuntimeRequest(handoff, options);
  const commandCwd = optionalString(options.commandCwd);
  const commandSource = optionalString(options.commandSource);
  return {
    domainId: 'medautoscience',
    taskKind: RUNTIME_TASK_KIND,
    dedupeKey,
    priority: 100,
    source: options.source ?? 'paper-mission-route-handoff',
    payload: {
      surface_kind: RUNTIME_REQUEST_SURFACE_KIND,
      schema_version: 1,
      runtime_request_status: 'queued_request',
      runtime_request_kind: 'mas_paper_mission_stage_route',
      study_id: readback.study_id,
      mission_id: readback.mission_id,
      candidate_ref: readback.candidate_ref,
      paper_mission_transaction_ref: readback.paper_mission_transaction_ref,
      opl_route_command_ref: readback.opl_route_command_ref,
      command_kind: readback.command_kind,
      route_target: readback.route_target,
      workspace_root: workspaceRoot,
      domain_workspace_root: workspaceRoot,
      ...(commandCwd
        ? {
            command_cwd: commandCwd,
            opl_domain_export_context: {
              command_source: commandSource,
              command_cwd: commandCwd,
            },
          }
        : {}),
      route_command_materialized: readback.accepted_command_packet.route_command_materialized,
      opl_route_command: routeCommand ?? {},
      opl_route_handoff_record: handoff,
      stage_run_request: {
        request_status: 'requested',
        requested_by: 'mas_paper_mission_route_handoff',
        domain_truth_owner: 'med-autoscience',
        runtime_owner: 'one-person-lab',
        command_kind: readback.command_kind,
        route_target: readback.route_target,
        stage_run_created: false,
        provider_attempt_requested: false,
      },
      authority_boundary: runtimeRequestAuthorityBoundary(),
    },
  };
}

function validateAuthorityBoundary(handoff: JsonRecord): MasPaperMissionRouteHandoffIntakeBlocker[] {
  const authority = nestedRecord(handoff, 'authority_boundary');
  if (!authority) {
    return [{
      reason: 'missing_authority_boundary',
      detail: 'MAS paper mission handoff must carry its no-authority boundary before OPL intake.',
      field: 'authority_boundary',
    }];
  }
  for (const flag of FORBIDDEN_WRITE_FLAGS) {
    if (booleanTrue(authority[flag]) || booleanTrue(handoff[flag])) {
      return [{
        reason: 'forbidden_authority_write',
        field: flag,
        value: true,
      }];
    }
  }
  return [];
}

function validateForbiddenClaims(handoff: JsonRecord): MasPaperMissionRouteHandoffIntakeBlocker[] {
  for (const flag of FORBIDDEN_CLAIM_FLAGS) {
    if (booleanTrue(handoff[flag])) {
      return [{
        reason: 'forbidden_authority_claim',
        field: flag,
        value: true,
      }];
    }
  }
  return [];
}

function waitKindFor(handoffStatus: string | null, commandKind: SupportedCommandKind | null) {
  if (handoffStatus === 'waiting_for_typed_blocker_authority'
    || commandKind === 'stop_with_typed_blocker') {
    return 'typed_blocker_authority';
  }
  if (handoffStatus === 'waiting_for_human_gate_authority'
    || commandKind === 'wait_for_human') {
    return 'human_gate_authority';
  }
  if (handoffStatus === 'waiting_for_mission_complete_authority'
    || handoffStatus === 'mission_complete'
    || commandKind === 'complete_mission') {
    return 'mission_complete';
  }
  return handoffStatus;
}

function handoffFromTask(task: JsonRecord) {
  if (
    task.surface_kind === HANDOFF_SURFACE_KIND
    || task.surface_kind === MATERIALIZED_READBACK_SURFACE_KIND
  ) {
    return task;
  }
  if (isRecord(task.opl_route_handoff)) {
    return task.opl_route_handoff;
  }
  if (isRecord(task.opl_route_handoff_record)) {
    return task.opl_route_handoff_record;
  }
  if (isRecord(task.opl_runtime_owner_route_handoff)
    && task.opl_runtime_owner_route_handoff.surface_kind === HANDOFF_SURFACE_KIND) {
    return task.opl_runtime_owner_route_handoff;
  }
  if (isRecord(task.paper_mission)) {
    return handoffFromTask(task.paper_mission);
  }
  if (isRecord(task.payload)) {
    return handoffFromTask(task.payload);
  }
  return null;
}

function sourceTasks(output: JsonRecord): {
  sourcePath: MasPaperMissionRouteHandoffExportReadback['source_path'];
  tasks: unknown[];
  legacyConsidered: boolean;
} {
  if (
    output.surface_kind === HANDOFF_SURFACE_KIND
    || output.surface_kind === MATERIALIZED_READBACK_SURFACE_KIND
  ) {
    return { sourcePath: 'direct_handoff', tasks: [output], legacyConsidered: false };
  }
  if (Array.isArray(output.paper_mission_default_tasks) && output.paper_mission_default_tasks.length > 0) {
    return {
      sourcePath: '/paper_mission_default_tasks',
      tasks: output.paper_mission_default_tasks,
      legacyConsidered: false,
    };
  }
  if (Array.isArray(output.pending_family_tasks)) {
    const explicitHandoffTasks = output.pending_family_tasks.filter((task) =>
      isRecord(task)
      && (
        task.surface_kind === HANDOFF_SURFACE_KIND
        || task.surface_kind === MATERIALIZED_READBACK_SURFACE_KIND
        || handoffFromTask(task) !== null
      )
    );
    if (explicitHandoffTasks.length === 0) {
      return { sourcePath: 'not_found', tasks: [], legacyConsidered: false };
    }
    return {
      sourcePath: '/pending_family_tasks',
      tasks: explicitHandoffTasks,
      legacyConsidered: true,
    };
  }
  return { sourcePath: 'not_found', tasks: [], legacyConsidered: false };
}

export function intakeMasPaperMissionRouteHandoff(
  payload: unknown,
  options: IntakeOptions = {},
): MasPaperMissionRouteHandoffIntakeReadback {
  if (!isRecord(payload)) {
    return baseReadback(null, [{
      reason: 'invalid_handoff_payload',
      detail: 'Expected MAS paper mission route handoff JSON object.',
    }]);
  }

  const surfaceKind = optionalString(payload.surface_kind);
  const handoff = surfaceKind === MATERIALIZED_READBACK_SURFACE_KIND
    ? materializedReadbackToHandoff(payload)
    : payload;
  const normalizedSurfaceKind = optionalString(handoff.surface_kind);
  if (normalizedSurfaceKind !== HANDOFF_SURFACE_KIND) {
    return baseReadback(payload, [{
      reason: 'unknown_surface_kind',
      field: 'surface_kind',
      value: surfaceKind,
    }]);
  }

  const authorityBlockers = validateAuthorityBoundary(handoff);
  if (authorityBlockers.length > 0) {
    return baseReadback(handoff, authorityBlockers);
  }

  const claimBlockers = validateForbiddenClaims(handoff);
  if (claimBlockers.length > 0) {
    return baseReadback(handoff, claimBlockers);
  }

  const transactionRef = optionalString(handoff.paper_mission_transaction_ref);
  if (!transactionRef) {
    return baseReadback(handoff, [{
      reason: 'missing_paper_mission_transaction',
      field: 'paper_mission_transaction_ref',
    }]);
  }

  const commandKind = routeCommandKind(handoff);
  if (!supportedCommandKind(commandKind)) {
    return baseReadback(handoff, [{
      reason: 'unsupported_route_command',
      field: 'route_command_kind',
      value: commandKind,
    }]);
  }

  const readback = baseReadback(handoff);
  readback.authority_boundary.validates_mas_authority_boundary = true;
  readback.accepted_command_packet.route_command_materialized = handoff.transaction_materialized === true;

  const handoffStatus = optionalString(handoff.handoff_status);
  if (
    handoffStatus === 'ready_for_opl_route_command'
    && handoff.can_submit_to_opl_runtime === true
    && handoff.transaction_materialized === true
    && isRuntimeIntakeCommand(commandKind)
  ) {
    if (!workspaceRootForRuntimeRequest(handoff, options)) {
      return {
        ...readback,
        blockers: [{
          reason: 'missing_domain_workspace_root',
          detail: 'MAS paper mission route handoff must carry a domain workspace_root/domain_workspace_root or an absolute candidate/source ref under ops/medautoscience before OPL can start a provider stage.',
          field: 'workspace_root',
        }],
      };
    }
    const accepted: MasPaperMissionRouteHandoffIntakeReadback = {
      ...readback,
      status: 'accepted_for_runtime_intake',
      can_submit_to_opl_runtime: true,
    };
    return {
      ...accepted,
      runtime_request_input: runtimeRequestInput(
        handoff,
        accepted,
        options,
      ),
    };
  }

  const waitKind = waitKindFor(handoffStatus, commandKind);
  if (
    waitKind === 'typed_blocker_authority'
    || waitKind === 'human_gate_authority'
  ) {
    return {
      ...readback,
      status: 'typed_wait',
      wait_kind: waitKind,
    };
  }

  if (waitKind === 'mission_complete') {
    return {
      ...readback,
      status: 'terminal_no_runtime',
      wait_kind: waitKind,
    };
  }

  return {
    ...readback,
    blockers: [{
      reason: 'handoff_not_ready_for_runtime_intake',
      field: 'handoff_status',
      value: handoffStatus,
    }],
  };
}

export function intakeMasPaperMissionRouteHandoffsFromExport(
  output: unknown,
  options: IntakeOptions = {},
): MasPaperMissionRouteHandoffExportReadback {
  if (!isRecord(output)) {
    return {
      surface_kind: 'opl_mas_paper_mission_route_handoff_export_intake_readback',
      schema_version: 1,
      source_path: 'not_found',
      legacy_pending_family_tasks_considered: false,
      readbacks: [],
      authority_boundary: exportAuthorityBoundary(),
    };
  }
  const selected = sourceTasks(output);
  const readbacks = selected.tasks
    .map((task) => {
      if (!isRecord(task)) {
        return intakeMasPaperMissionRouteHandoff(task, options);
      }
      return intakeMasPaperMissionRouteHandoff(
        task.surface_kind === HANDOFF_SURFACE_KIND ? task : handoffFromTask(task),
        options,
      );
    })
    .filter((readback) =>
      readback.source_surface_kind === HANDOFF_SURFACE_KIND
      || readback.source_surface_kind === MATERIALIZED_READBACK_SURFACE_KIND
      || readback.blockers.length > 0
    );
  return {
    surface_kind: 'opl_mas_paper_mission_route_handoff_export_intake_readback',
    schema_version: 1,
    source_path: selected.sourcePath,
    legacy_pending_family_tasks_considered: selected.legacyConsidered,
    readbacks,
    authority_boundary: exportAuthorityBoundary(),
  };
}

function exportAuthorityBoundary(): MasPaperMissionRouteHandoffExportReadback['authority_boundary'] {
  return {
    writes_opl_outbox: false,
    writes_opl_event: false,
    writes_opl_stage_run: false,
    writes_provider_attempt: false,
    can_claim_stage_run_created: false,
    can_claim_provider_running: false,
    can_claim_paper_progress: false,
    can_claim_runtime_ready: false,
  };
}
