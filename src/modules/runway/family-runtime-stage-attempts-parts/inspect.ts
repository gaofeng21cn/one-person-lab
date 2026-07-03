import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  inspectFamilyRuntimeProviderWithLifecycle,
} from '../family-runtime-providers.ts';
import type {
  FamilyRuntimeProviderKind,
} from '../family-runtime-types.ts';
import {
  inspectStageAttemptPayload,
  listStageAttempts,
  stageAttemptToPayload,
} from '../family-runtime-stage-attempt-ledger.ts';
import {
  attachProviderCurrentness,
  buildStageAttemptCurrentProviderReadinessPayload,
} from '../family-runtime-stage-attempt-provider-readiness-currentness.ts';

type ProviderReadinessPaths = {
  root: string;
};

type ProviderReadinessOptions = {
  managedProviderProjection?: {
    managed_temporal_state_consistency?: Record<string, unknown> | null;
  } | null;
};

async function providerReadinessByKind(
  attempts: ReturnType<typeof stageAttemptToPayload>[],
  paths: ProviderReadinessPaths,
  options: ProviderReadinessOptions,
) {
  const providerKinds = [...new Set(attempts.map((attempt) => attempt.provider_kind))];
  const entries = await Promise.all(providerKinds.map(async (providerKind) => {
    const provider = await inspectFamilyRuntimeProviderWithLifecycle(providerKind, paths, options);
    return [providerKind, buildStageAttemptCurrentProviderReadinessPayload(provider, providerKind)] as const;
  }));
  return new Map(entries);
}

function attachCurrentProviderReadiness(
  attempt: ReturnType<typeof stageAttemptToPayload>,
  readinessByKind: Map<FamilyRuntimeProviderKind, ReturnType<typeof buildStageAttemptCurrentProviderReadinessPayload>>,
) {
  return attachProviderCurrentness(attempt, readinessByKind.get(attempt.provider_kind) ?? null);
}

export async function listStageAttemptsWithCurrentProviderReadiness(
  db: DatabaseSync,
  paths: ProviderReadinessPaths,
  options: ProviderReadinessOptions = {},
) {
  const attempts = listStageAttempts(db);
  const readinessByKind = await providerReadinessByKind(attempts, paths, options);
  return attempts.map((attempt) => attachCurrentProviderReadiness(attempt, readinessByKind));
}

export function inspectStageAttempt(db: DatabaseSync, stageAttemptId: string) {
  const attempt = inspectStageAttemptPayload(db, stageAttemptId);
  if (!attempt) {
    throw new FrameworkContractError('cli_usage_error', 'Family runtime stage attempt not found.', {
      stage_attempt_id: stageAttemptId,
    });
  }
  return attempt;
}

export async function inspectStageAttemptWithCurrentProviderReadiness(
  db: DatabaseSync,
  stageAttemptId: string,
  paths: ProviderReadinessPaths,
  options: ProviderReadinessOptions = {},
) {
  const attempt = inspectStageAttempt(db, stageAttemptId);
  const provider = await inspectFamilyRuntimeProviderWithLifecycle(attempt.provider_kind, paths, options);
  return attachProviderCurrentness(
    attempt,
    buildStageAttemptCurrentProviderReadinessPayload(provider, attempt.provider_kind),
  );
}
