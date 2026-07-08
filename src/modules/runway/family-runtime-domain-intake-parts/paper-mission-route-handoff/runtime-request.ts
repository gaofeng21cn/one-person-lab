import path from 'node:path';

import {
  optionalString,
  type IntakeOptions,
  type JsonRecord,
  type MasPaperMissionRouteHandoffIntakeReadback,
} from './shared.ts';

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

export function workspaceRootForProviderProjection(handoff: JsonRecord, options: IntakeOptions) {
  return optionalString(handoff.workspace_root)
    ?? optionalString(handoff.domain_workspace_root)
    ?? optionalString(handoff.repo_root)
    ?? workspaceRootFromAbsoluteRef(optionalString(handoff.candidate_ref))
    ?? workspaceRootFromAbsoluteRef(optionalString(handoff.source_ref))
    ?? optionalString(options.workspaceRoot);
}

export function validateRuntimeIdentity(readback: MasPaperMissionRouteHandoffIntakeReadback) {
  if (!readback.study_id) {
    return {
      reason: 'missing_study_id' as const,
      detail: 'MAS paper mission OPL carrier must provide study_id before OPL provider projection.',
      field: 'study_id',
    };
  }
  if (!readback.opl_route_command_ref) {
    return {
      reason: 'missing_opl_route_command_ref' as const,
      detail: 'MAS paper mission OPL carrier must provide opl_route_command_ref before OPL provider projection.',
      field: 'opl_route_command_ref',
    };
  }
  if (!readback.route_target) {
    return {
      reason: 'missing_route_target' as const,
      detail: 'MAS paper mission OPL carrier must provide route_target before OPL provider projection.',
      field: 'route_target',
    };
  }
  if (!readback.route_identity_key) {
    return {
      reason: 'missing_route_identity_key' as const,
      detail: 'MAS paper mission OPL carrier must provide route_identity_key before OPL provider projection.',
      field: 'route_identity_key',
    };
  }
  if (!readback.attempt_idempotency_key) {
    return {
      reason: 'missing_attempt_idempotency_key' as const,
      detail: 'MAS paper mission OPL carrier must provide attempt_idempotency_key before OPL provider projection.',
      field: 'attempt_idempotency_key',
    };
  }
  return null;
}
