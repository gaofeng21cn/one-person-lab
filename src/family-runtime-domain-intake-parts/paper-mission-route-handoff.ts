const HANDOFF_SURFACE_KIND = 'mas_paper_mission_opl_route_handoff_record';
const COMMAND_PACKET_SURFACE_KIND = 'mas_paper_mission_opl_route_command_packet';

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
    source_surface_kind: handoff ? optionalString(handoff.surface_kind) : null,
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
  if (output.surface_kind === HANDOFF_SURFACE_KIND) {
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
      && (task.surface_kind === HANDOFF_SURFACE_KIND || handoffFromTask(task) !== null)
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
): MasPaperMissionRouteHandoffIntakeReadback {
  if (!isRecord(payload)) {
    return baseReadback(null, [{
      reason: 'invalid_handoff_payload',
      detail: 'Expected MAS paper mission route handoff JSON object.',
    }]);
  }

  const surfaceKind = optionalString(payload.surface_kind);
  if (surfaceKind !== HANDOFF_SURFACE_KIND) {
    return baseReadback(payload, [{
      reason: 'unknown_surface_kind',
      field: 'surface_kind',
      value: surfaceKind,
    }]);
  }

  const authorityBlockers = validateAuthorityBoundary(payload);
  if (authorityBlockers.length > 0) {
    return baseReadback(payload, authorityBlockers);
  }

  const claimBlockers = validateForbiddenClaims(payload);
  if (claimBlockers.length > 0) {
    return baseReadback(payload, claimBlockers);
  }

  const transactionRef = optionalString(payload.paper_mission_transaction_ref);
  if (!transactionRef) {
    return baseReadback(payload, [{
      reason: 'missing_paper_mission_transaction',
      field: 'paper_mission_transaction_ref',
    }]);
  }

  const commandKind = routeCommandKind(payload);
  if (!supportedCommandKind(commandKind)) {
    return baseReadback(payload, [{
      reason: 'unsupported_route_command',
      field: 'route_command_kind',
      value: commandKind,
    }]);
  }

  const readback = baseReadback(payload);
  readback.authority_boundary.validates_mas_authority_boundary = true;
  readback.accepted_command_packet.route_command_materialized = payload.transaction_materialized === true;

  const handoffStatus = optionalString(payload.handoff_status);
  if (
    handoffStatus === 'ready_for_opl_route_command'
    && payload.can_submit_to_opl_runtime === true
    && payload.transaction_materialized === true
    && isRuntimeIntakeCommand(commandKind)
  ) {
    return {
      ...readback,
      status: 'accepted_for_runtime_intake',
      can_submit_to_opl_runtime: true,
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
        return intakeMasPaperMissionRouteHandoff(task);
      }
      return intakeMasPaperMissionRouteHandoff(
        task.surface_kind === HANDOFF_SURFACE_KIND ? task : handoffFromTask(task),
      );
    })
    .filter((readback) =>
      readback.source_surface_kind === HANDOFF_SURFACE_KIND
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
