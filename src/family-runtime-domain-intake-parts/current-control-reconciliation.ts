import type { EnqueueInput } from '../family-runtime-command.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function currentControlAdmissionStudyIds(inputs: EnqueueInput[]) {
  return new Set(inputs
    .map((input) => optionalString(input.payload.study_id))
    .filter((studyId): studyId is string => Boolean(studyId)));
}

function payloadString(input: EnqueueInput, key: string) {
  return optionalString(input.payload[key]);
}

function samePayloadString(left: EnqueueInput, right: EnqueueInput, key: string) {
  const leftValue = payloadString(left, key);
  const rightValue = payloadString(right, key);
  return Boolean(leftValue && rightValue && leftValue === rightValue);
}

function sameDefaultExecutorOwnerAction(left: EnqueueInput, right: EnqueueInput) {
  if (
    left.domainId !== 'medautoscience'
    || right.domainId !== 'medautoscience'
    || left.taskKind !== 'domain_owner/default-executor-dispatch'
    || right.taskKind !== 'domain_owner/default-executor-dispatch'
  ) {
    return false;
  }
  if (
    !samePayloadString(left, right, 'study_id')
    || !samePayloadString(left, right, 'action_type')
    || !samePayloadString(left, right, 'work_unit_id')
  ) {
    return false;
  }
  return samePayloadString(left, right, 'source_fingerprint')
    || samePayloadString(left, right, 'work_unit_fingerprint')
    || samePayloadString(left, right, 'action_fingerprint');
}

function executableOwnerFromPendingTask(input: EnqueueInput) {
  return payloadString(input, 'next_executable_owner')
    ?? payloadString(input, 'domain_owner')
    ?? payloadString(input, 'owner')
    ?? payloadString(input, 'dispatch_owner');
}

export function reconcileCurrentControlExecutableOwners(
  currentInputs: EnqueueInput[],
  pendingInputs: EnqueueInput[],
) {
  return currentInputs.map((input) => {
    const pending = pendingInputs.find((candidate) => sameDefaultExecutorOwnerAction(input, candidate));
    if (!pending) {
      return input;
    }
    const executableOwner = executableOwnerFromPendingTask(pending);
    if (!executableOwner || executableOwner === payloadString(input, 'next_executable_owner')) {
      return input;
    }
    const providerAdmissionIdentity = isRecord(input.payload.provider_admission_identity)
      ? {
          ...input.payload.provider_admission_identity,
          next_executable_owner: executableOwner,
          executable_owner_source: 'domain_handler_current_owner_action',
        }
      : input.payload.provider_admission_identity;
    return {
      ...input,
      payload: {
        ...input.payload,
        next_executable_owner: executableOwner,
        domain_owner: payloadString(pending, 'domain_owner') ?? executableOwner,
        executable_owner_source: 'domain_handler_current_owner_action',
        provider_admission_identity: providerAdmissionIdentity,
      },
    };
  });
}

export function suppressStaleDefaultExecutorInputs(
  inputs: EnqueueInput[],
  currentAdmissionInputs: EnqueueInput[],
) {
  const currentStudyIds = currentControlAdmissionStudyIds(currentAdmissionInputs);
  if (currentStudyIds.size === 0) {
    return { inputs, suppressed_count: 0 };
  }
  const retained = inputs.filter((input) => {
    const studyId = optionalString(input.payload.study_id);
    return !(
      input.domainId === 'medautoscience'
      && input.taskKind === 'domain_owner/default-executor-dispatch'
      && studyId !== null
      && currentStudyIds.has(studyId)
    );
  });
  return {
    inputs: retained,
    suppressed_count: inputs.length - retained.length,
  };
}
