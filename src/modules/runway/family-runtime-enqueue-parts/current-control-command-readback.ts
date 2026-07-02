import { validCompleteTransitionRuntimeLiveReadback } from '../family-runtime-domain-progress-transition-runtime-parts/live-readback-validation.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstRecord(...values: unknown[]) {
  return values.find((value): value is Record<string, unknown> => isRecord(value)) ?? null;
}

function sameOptionalIdentity(left: string | null, right: string | null) {
  return !left || !right || left === right;
}

function commandMatchesRuntimeReadback(input: {
  command: Record<string, unknown>;
  runtimeResult: Record<string, unknown>;
  liveReadback: Record<string, unknown>;
}) {
  const runtimeCommand = isRecord(input.runtimeResult.command)
    ? input.runtimeResult.command
    : null;
  const readbackIdentity = isRecord(input.liveReadback.identity)
    ? input.liveReadback.identity
    : null;
  if (!runtimeCommand || !readbackIdentity) {
    return false;
  }
  const commandId = optionalString(input.command.command_id);
  const runtimeCommandId = optionalString(runtimeCommand.command_id);
  const readbackCommandId = optionalString(readbackIdentity.command_id);
  const idempotencyKey = optionalString(input.command.idempotency_key);
  const runtimeIdempotencyKey = optionalString(runtimeCommand.idempotency_key);
  const readbackIdempotencyKey = optionalString(readbackIdentity.idempotency_key);
  return sameOptionalIdentity(commandId, runtimeCommandId)
    && sameOptionalIdentity(commandId, readbackCommandId)
    && sameOptionalIdentity(idempotencyKey, runtimeIdempotencyKey)
    && sameOptionalIdentity(idempotencyKey, readbackIdempotencyKey);
}

function canonicalCommandReadback(payload: Record<string, unknown>) {
  const providerAdmissionIdentity = isRecord(payload.provider_admission_identity)
    ? payload.provider_admission_identity
    : null;
  const command = firstRecord(
    payload.current_control_command_outbox_record,
    payload.current_control_command,
    providerAdmissionIdentity?.current_control_command_outbox_record,
    providerAdmissionIdentity?.current_control_command,
    isRecord(payload.domain_progress_transition_runtime)
      ? payload.domain_progress_transition_runtime.command
      : null,
    isRecord(providerAdmissionIdentity?.domain_progress_transition_runtime)
      ? providerAdmissionIdentity.domain_progress_transition_runtime.command
      : null,
  );
  const runtimeResult = firstRecord(
    payload.domain_progress_transition_runtime,
    providerAdmissionIdentity?.domain_progress_transition_runtime,
  );
  const liveReadback = firstRecord(
    payload.opl_domain_progress_transition_runtime_live_readback,
    payload.opl_domain_progress_transition_live_readback,
    providerAdmissionIdentity?.opl_domain_progress_transition_runtime_live_readback,
    providerAdmissionIdentity?.opl_domain_progress_transition_live_readback,
  );
  if (!command || !runtimeResult || !liveReadback) {
    return null;
  }
  if (!validCompleteTransitionRuntimeLiveReadback(liveReadback)) {
    return null;
  }
  if (!commandMatchesRuntimeReadback({ command, runtimeResult, liveReadback })) {
    return null;
  }
  return {
    command,
    runtimeResult,
    liveReadback,
    providerAdmissionIdentity,
  };
}

export function normalizeCurrentControlCommandReadbackPayload(
  payload: Record<string, unknown>,
) {
  const canonical = canonicalCommandReadback(payload);
  if (!canonical) {
    return payload;
  }
  const providerAdmissionIdentity = {
    ...(canonical.providerAdmissionIdentity ?? {}),
    current_control_command_outbox_record: canonical.command,
    current_control_command: canonical.command,
    domain_progress_transition_runtime: canonical.runtimeResult,
    opl_domain_progress_transition_runtime_live_readback: canonical.liveReadback,
    opl_domain_progress_transition_live_readback: canonical.liveReadback,
  };
  return {
    ...payload,
    current_control_command_outbox_record: canonical.command,
    current_control_command: canonical.command,
    domain_progress_transition_runtime: canonical.runtimeResult,
    opl_domain_progress_transition_runtime_live_readback: canonical.liveReadback,
    opl_domain_progress_transition_live_readback: canonical.liveReadback,
    provider_admission_identity: providerAdmissionIdentity,
  };
}
