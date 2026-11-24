import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';
import { inspectStageAttempt, runStageAttemptFixtureActivity, signalStageAttempt } from '../family-runtime-stage-attempts.ts';
import { insertEvent } from '../family-runtime-store.ts';
import { bindTrustedCliFamilyRuntimeIngressIdentity } from '../family-runtime-execution-scope.ts';
import type { FamilyRuntimeAttemptCommandContext } from './attempt-shared.ts';
import {
  rawStageAttemptMutationAuthority,
  temporalProviderModule,
} from './attempt-shared.ts';

export type AttemptSignalCommandContext = FamilyRuntimeAttemptCommandContext & {
  parsed: Extract<FamilyRuntimeCommandInput, { mode: 'attempt_signal' }>;
};

export async function runAttemptSignalCommand(
  context: AttemptSignalCommandContext,
): Promise<Record<string, unknown>> {
  const { db, paths, parsed } = context;
  rawStageAttemptMutationAuthority(db, parsed.stageAttemptId, 'family_runtime_attempt_signal_preflight');
  const currentAttempt = inspectStageAttempt(db, parsed.stageAttemptId);
  if (currentAttempt.provider_kind !== 'temporal') {
    throw new FrameworkContractError('cli_usage_error', 'Temporal signal requires a temporal stage attempt.', {
      stage_attempt_id: currentAttempt.stage_attempt_id,
      provider_kind: currentAttempt.provider_kind,
    });
  }
  const signalPayload = bindTrustedCliFamilyRuntimeIngressIdentity({
    runtimeIdentity: currentAttempt,
    ingressPayload: parsed.payload,
    operation: `trusted_cli_signal_stage_attempt:${parsed.signalKind}`,
  });
  const temporal_signal = await (await temporalProviderModule()).signalTemporalStageAttemptWorkflow({
    attempt: currentAttempt,
    signalKind: parsed.signalKind,
    payload: signalPayload,
    source: parsed.source,
    paths,
  });
  const result = signalStageAttempt(db, { ...parsed, payload: signalPayload });
  insertEvent(db, {
    taskId: result.attempt.task_id,
    domainId: result.attempt.domain_id,
    eventType: 'stage_attempt_signal_received',
    source: parsed.source ?? 'opl-cli',
    payload: {
      stage_attempt_id: parsed.stageAttemptId,
      signal_kind: parsed.signalKind,
      signal_id: result.signal.signal_id,
      temporal_signal,
    },
  });
  return {
    version: 'g2',
    family_runtime_stage_attempt_signal: {
      surface_id: 'opl_family_runtime_stage_attempt_signal',
      ...result,
      temporal_signal,
    },
  };
}
export type AttemptFixtureCommandContext = FamilyRuntimeAttemptCommandContext & {
  parsed: Extract<FamilyRuntimeCommandInput, { mode: 'attempt_fixture_run' }>;
};

export function runAttemptFixtureCommand(
  context: AttemptFixtureCommandContext,
): Record<string, unknown> {
  const { db, parsed } = context;
  rawStageAttemptMutationAuthority(db, parsed.stageAttemptId, 'family_runtime_attempt_fixture_preflight');
  const result = runStageAttemptFixtureActivity(db, parsed);
  insertEvent(db, {
    taskId: result.attempt.task_id,
    domainId: result.attempt.domain_id,
    eventType: 'stage_attempt_fixture_activity_ran',
    source: 'opl-cli',
    payload: {
      stage_attempt_id: parsed.stageAttemptId,
      provider_completion: result.provider_fixture_run.provider_completion,
    },
  });
  return {
    version: 'g2',
    family_runtime_stage_attempt_fixture_run: {
      surface_id: 'opl_family_runtime_stage_attempt_fixture_run',
      ...result,
    },
  };
}
