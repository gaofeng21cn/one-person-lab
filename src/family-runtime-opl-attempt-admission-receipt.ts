export const OPL_ATTEMPT_ADMISSION_REQUESTED_REASON = 'opl_attempt_admission_requested';
export const OPL_ATTEMPT_ADMISSION_PROVIDER_START_PENDING_REASON = 'provider_attempt_start_pending';

export function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function recordValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function isOplAttemptAdmissionRequested(output: Record<string, unknown> | null | undefined) {
  if (!output) {
    return false;
  }
  const dispatch = recordValue(output.dispatch);
  const result = recordValue(dispatch?.result);
  return output.opl_attempt_admission_requested === true
    || optionalString(output.opl_attempt_admission_status) === 'requested'
    || optionalString(result?.status) === OPL_ATTEMPT_ADMISSION_REQUESTED_REASON;
}

export function oplAttemptAdmissionExecutionPolicy(output: Record<string, unknown> | null | undefined) {
  const dispatch = recordValue(output?.dispatch);
  return optionalString(dispatch?.execution_policy);
}

export function isDomainRouteOplAttemptAdmissionRequested(output: Record<string, unknown> | null | undefined) {
  return isOplAttemptAdmissionRequested(output)
    && oplAttemptAdmissionExecutionPolicy(output) === 'opl_route_hydration_stage_attempt_admission';
}

export function isDefaultExecutorOplAttemptAdmissionRequested(output: Record<string, unknown> | null | undefined) {
  return isOplAttemptAdmissionRequested(output)
    && oplAttemptAdmissionExecutionPolicy(output) === 'opl_default_executor_stage_attempt_admission';
}
