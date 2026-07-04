import { materializedReadbackToHandoff } from './paper-mission-route-handoff/materialized-readback.ts';
import {
  ownerWaitProjection,
  waitKindFor,
} from './paper-mission-route-handoff/owner-wait.ts';
import {
  runtimeRequestInput,
  validateRuntimeIdentity,
  workspaceRootForRuntimeRequest,
} from './paper-mission-route-handoff/runtime-request.ts';
import {
  asRecord,
  booleanTrue,
  COMMAND_PACKET_SURFACE_KIND,
  FORBIDDEN_CLAIM_FLAGS,
  FORBIDDEN_WRITE_FLAGS,
  HANDOFF_SURFACE_KIND,
  isRuntimeIntakeCommand,
  MATERIALIZED_READBACK_SURFACE_KIND,
  nestedRecord,
  optionalString,
  routeCommandKind,
  routeTarget,
  supportedCommandKind,
  type IntakeOptions,
  type JsonRecord,
  type MasPaperMissionRouteHandoffExportReadback,
  type MasPaperMissionRouteHandoffIntakeBlocker,
  type MasPaperMissionRouteHandoffIntakeReadback,
} from './paper-mission-route-handoff/shared.ts';
import {
  handoffFromTask,
  sourceTasks,
} from './paper-mission-route-handoff/source-tasks.ts';

export type {
  MasPaperMissionRouteHandoffExportReadback,
  MasPaperMissionRouteHandoffIntakeBlocker,
  MasPaperMissionRouteHandoffIntakeReadback,
  MasPaperMissionRouteHandoffIntakeStatus,
} from './paper-mission-route-handoff/shared.ts';

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
    route_identity_key: handoff ? optionalString(handoff.route_identity_key) : null,
    attempt_idempotency_key: handoff ? optionalString(handoff.attempt_idempotency_key) : null,
    request_idempotency_key: handoff ? optionalString(handoff.request_idempotency_key) : null,
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
    owner_route: null,
    next_action: null,
    handoff_projection: null,
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

export function intakeMasPaperMissionRouteHandoff(
  payload: unknown,
  options: IntakeOptions = {},
): MasPaperMissionRouteHandoffIntakeReadback {
  const payloadRecord = asRecord(payload);
  if (!payloadRecord) {
    return baseReadback(null, [{
      reason: 'invalid_handoff_payload',
      detail: 'Expected MAS paper mission route handoff JSON object.',
    }]);
  }

  const surfaceKind = optionalString(payloadRecord.surface_kind);
  const handoff = surfaceKind === MATERIALIZED_READBACK_SURFACE_KIND
    ? materializedReadbackToHandoff(payloadRecord)
    : payloadRecord;
  const normalizedSurfaceKind = optionalString(handoff.surface_kind);
  if (normalizedSurfaceKind !== HANDOFF_SURFACE_KIND) {
    return baseReadback(payloadRecord, [{
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
    const identityBlocker = validateRuntimeIdentity(readback);
    if (identityBlocker) {
      return {
        ...readback,
        blockers: [identityBlocker],
      };
    }
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
    const waitProjection = ownerWaitProjection(handoff, readback, waitKind);
    return {
      ...readback,
      status: 'typed_wait',
      wait_kind: waitKind,
      owner_route: waitProjection.ownerRoute,
      next_action: waitProjection.nextAction,
      handoff_projection: waitProjection.handoffProjection,
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
  const outputRecord = asRecord(output);
  if (!outputRecord) {
    return {
      surface_kind: 'opl_mas_paper_mission_route_handoff_export_intake_readback',
      schema_version: 1,
      source_path: 'not_found',
      legacy_pending_family_tasks_considered: false,
      readbacks: [],
      authority_boundary: exportAuthorityBoundary(),
    };
  }
  const selected = sourceTasks(outputRecord);
  const readbacks = selected.tasks
    .map((task) => {
      const taskRecord = asRecord(task);
      if (!taskRecord) {
        return intakeMasPaperMissionRouteHandoff(task, options);
      }
      return intakeMasPaperMissionRouteHandoff(
        taskRecord.surface_kind === HANDOFF_SURFACE_KIND ? taskRecord : handoffFromTask(taskRecord),
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
