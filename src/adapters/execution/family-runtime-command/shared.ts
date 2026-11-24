import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import {
  FAMILY_RUNTIME_DOMAIN_IDS,
  FAMILY_RUNTIME_SCHEDULER_DOMAIN_IDS,
  FAMILY_RUNTIME_PROVIDER_KINDS,
  TEMPORAL_STAGE_ATTEMPT_SIGNAL_KINDS,
  resolveFamilyRuntimeDomainId,
  resolveFamilyRuntimeSchedulerDomainId,
  type FamilyRuntimeDomainId,
  type FamilyRuntimeProviderKind,
  type TemporalStageAttemptSignalKind,
} from '../family-runtime-types.ts';

export function parsePayload(value: string): Record<string, unknown> {
  const parsed = parseJsonText(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new FrameworkContractError('cli_usage_error', 'Task payload must be a JSON object.', {
      payload: value,
    });
  }
  return parsed as Record<string, unknown>;
}

export function parsePayloadFile(filePath: string): Record<string, unknown> {
  return parsePayload(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

export function parsePayloadArg(value: string | undefined, payloadFile: string | undefined) {
  if (value && payloadFile) {
    throw new FrameworkContractError('cli_usage_error', 'Use either --payload or --payload-file, not both.', {
      options: ['--payload', '--payload-file'],
    });
  }
  if (payloadFile) {
    return parsePayloadFile(payloadFile);
  }
  if (value) {
    return parsePayload(value);
  }
  return {};
}

export function parseCliOptions(
  rest: string[],
  startIndex: number,
  visit: (token: string, value: string | undefined) => boolean,
) {
  for (let index = startIndex; index < rest.length; index += 1) {
    if (visit(rest[index], rest[index + 1])) {
      index += 1;
    }
  }
}

export function assertDomainId(value: string | undefined): FamilyRuntimeDomainId {
  const resolvedDomainId = value ? resolveFamilyRuntimeDomainId(value) : null;
  if (resolvedDomainId) {
    return resolvedDomainId;
  }
  throw new FrameworkContractError('cli_usage_error', 'Unsupported family-runtime domain id.', {
    domain_id: value ?? null,
    allowed_domain_ids: [...FAMILY_RUNTIME_DOMAIN_IDS],
  });
}

export function assertSchedulerDomainId(value: string | undefined): FamilyRuntimeDomainId {
  const resolvedDomainId = value ? resolveFamilyRuntimeSchedulerDomainId(value) : null;
  if (resolvedDomainId) {
    return resolvedDomainId;
  }
  throw new FrameworkContractError('cli_usage_error', 'Unsupported family-runtime scheduler domain id.', {
    domain_id: value ?? null,
    allowed_domain_ids: [...FAMILY_RUNTIME_SCHEDULER_DOMAIN_IDS],
  });
}

export function assertProviderKind(value: string | undefined): FamilyRuntimeProviderKind {
  if (FAMILY_RUNTIME_PROVIDER_KINDS.includes(value as FamilyRuntimeProviderKind)) {
    return value as FamilyRuntimeProviderKind;
  }
  throw new FrameworkContractError('cli_usage_error', 'Unsupported family-runtime provider kind.', {
    provider_kind: value ?? null,
    allowed_provider_kinds: [...FAMILY_RUNTIME_PROVIDER_KINDS],
  });
}

export function assertSignalKind(value: string | undefined): TemporalStageAttemptSignalKind {
  if (TEMPORAL_STAGE_ATTEMPT_SIGNAL_KINDS.includes(value as TemporalStageAttemptSignalKind)) {
    return value as TemporalStageAttemptSignalKind;
  }
  throw new FrameworkContractError('cli_usage_error', 'Unsupported family-runtime attempt signal kind.', {
    signal_kind: value ?? null,
    allowed_signal_kinds: [...TEMPORAL_STAGE_ATTEMPT_SIGNAL_KINDS],
  });
}
