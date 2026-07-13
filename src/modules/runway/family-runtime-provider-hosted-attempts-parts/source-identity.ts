import {
  isRecord,
  defaultExecutorCurrentnessBasis,
  optionalString,
  relativeDispatchRefFromPath,
  stringList,
  uniqueStrings,
  workspaceRelativeRef,
} from './values.ts';

export function defaultExecutorDispatchRef(payload: Record<string, unknown>) {
  return optionalString(payload.dispatch_ref)
    ?? optionalString(payload.immutable_dispatch_ref)
    ?? optionalString(payload.dispatch_packet_ref)
    ?? optionalString(payload.dispatch_request_ref)
    ?? relativeDispatchRefFromPath(payload);
}

function defaultExecutorStageRefs(payload: Record<string, unknown>) {
  const workspaceRoot = optionalString(payload.workspace_root);
  return uniqueStrings([
    workspaceRelativeRef(optionalString(payload.stage_packet_ref), workspaceRoot),
    ...stringList(payload.stage_packet_refs).map((ref) => workspaceRelativeRef(ref, workspaceRoot)),
    ...stringList(payload.checkpoint_refs).map((ref) => workspaceRelativeRef(ref, workspaceRoot)),
  ]);
}

function preservesCurrentControlStagePacketIdentity(payload: Record<string, unknown>) {
  const basis = defaultExecutorCurrentnessBasis(payload);
  return optionalString(payload.dispatch_authority) === 'opl_current_control_state_handoff'
    || optionalString(payload.provider_attempt_schema_source) === 'action_queue'
    || optionalString(basis?.surface) === 'opl_current_control_state_handoff';
}

export function defaultExecutorStagePacketRefs(payload: Record<string, unknown>) {
  return uniqueStrings([
    ...defaultExecutorStageRefs(payload),
    preservesCurrentControlStagePacketIdentity(payload) ? null : defaultExecutorDispatchRef(payload),
  ]);
}

export function defaultExecutorStageCheckpointRefs(payload: Record<string, unknown>) {
  const stageRefs = defaultExecutorStageRefs(payload);
  if (preservesCurrentControlStagePacketIdentity(payload)) {
    return stageRefs.length > 0 ? stageRefs : uniqueStrings([defaultExecutorDispatchRef(payload)]);
  }
  return uniqueStrings([
    ...stageRefs,
    defaultExecutorDispatchRef(payload),
  ]);
}

export function defaultExecutorSourceFingerprint(payload: Record<string, unknown>) {
  const ownerRoute = isRecord(payload.owner_route) ? payload.owner_route : null;
  const basis = defaultExecutorCurrentnessBasis(payload);
  return optionalString(payload.source_fingerprint)
    ?? optionalString(payload.action_fingerprint)
    ?? optionalString(payload.repeat_suppression_key)
    ?? optionalString(ownerRoute?.source_fingerprint)
    ?? optionalString(ownerRoute?.action_fingerprint)
    ?? optionalString(basis?.work_unit_fingerprint)
    ?? optionalString(basis?.truth_epoch)
    ?? optionalString(basis?.runtime_health_epoch);
}

export function hasDefaultExecutorDispatchIdentity(payload: Record<string, unknown>) {
  return defaultExecutorDispatchRef(payload) !== null
    || defaultExecutorSourceFingerprint(payload) !== null;
}

export function defaultExecutorDispatchIdentityRef(payload: Record<string, unknown>) {
  return defaultExecutorDispatchRef(payload)
    ?? defaultExecutorSourceFingerprint(payload);
}
