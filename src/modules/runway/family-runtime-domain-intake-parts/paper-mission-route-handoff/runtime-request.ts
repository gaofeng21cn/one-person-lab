import path from 'node:path';

import type { EnqueueInput } from '../../family-runtime-command.ts';
import {
  nestedRecord,
  optionalString,
  RUNTIME_REQUEST_SURFACE_KIND,
  RUNTIME_TASK_KIND,
  supportedCommandKind,
  type IntakeOptions,
  type JsonRecord,
  type MasPaperMissionRouteHandoffIntakeReadback,
} from './shared.ts';

export function runtimeRequestAuthorityBoundary() {
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

export function workspaceRootForRuntimeRequest(handoff: JsonRecord, options: IntakeOptions) {
  return optionalString(handoff.workspace_root)
    ?? optionalString(handoff.domain_workspace_root)
    ?? optionalString(handoff.repo_root)
    ?? workspaceRootFromAbsoluteRef(optionalString(handoff.candidate_ref))
    ?? workspaceRootFromAbsoluteRef(optionalString(handoff.source_ref))
    ?? optionalString(options.workspaceRoot);
}

export function runtimeRequestInput(
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
  const routeIdentityKey = optionalString(handoff.route_identity_key);
  const attemptIdempotencyKey = optionalString(handoff.attempt_idempotency_key);
  const requestIdempotencyKey = optionalString(handoff.request_idempotency_key);
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
      route_identity_key: routeIdentityKey,
      attempt_idempotency_key: attemptIdempotencyKey,
      request_idempotency_key: requestIdempotencyKey,
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
        route_identity_key: routeIdentityKey,
        attempt_idempotency_key: attemptIdempotencyKey,
        stage_run_created: false,
        provider_attempt_requested: false,
      },
      authority_boundary: runtimeRequestAuthorityBoundary(),
    },
  };
}

export function validateRuntimeIdentity(readback: MasPaperMissionRouteHandoffIntakeReadback) {
  if (!readback.study_id) {
    return {
      reason: 'missing_study_id' as const,
      detail: 'MAS paper mission OPL carrier must provide study_id before OPL runtime intake.',
      field: 'study_id',
    };
  }
  if (!readback.opl_route_command_ref) {
    return {
      reason: 'missing_opl_route_command_ref' as const,
      detail: 'MAS paper mission OPL carrier must provide opl_route_command_ref before OPL runtime intake.',
      field: 'opl_route_command_ref',
    };
  }
  if (!readback.route_target) {
    return {
      reason: 'missing_route_target' as const,
      detail: 'MAS paper mission OPL carrier must provide route_target before OPL runtime intake.',
      field: 'route_target',
    };
  }
  if (!readback.route_identity_key) {
    return {
      reason: 'missing_route_identity_key' as const,
      detail: 'MAS paper mission OPL carrier must provide route_identity_key before OPL runtime intake.',
      field: 'route_identity_key',
    };
  }
  if (!readback.attempt_idempotency_key) {
    return {
      reason: 'missing_attempt_idempotency_key' as const,
      detail: 'MAS paper mission OPL carrier must provide attempt_idempotency_key before OPL runtime intake.',
      field: 'attempt_idempotency_key',
    };
  }
  return null;
}
