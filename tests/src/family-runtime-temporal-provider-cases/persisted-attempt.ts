import {
  createStageAttempt,
} from '../../../src/modules/runway/family-runtime-stage-attempts.ts';
import { openQueueDb } from '../../../src/modules/runway/family-runtime-store.ts';
import {
  buildTemporalStageAttemptWorkflowInput,
  type TemporalStageAttemptWorkflowInput,
} from '../../../src/modules/runway/family-runtime-temporal.ts';

export function createPersistedTemporalStageAttemptInput(input: {
  fixtureId: string;
  closeoutPacket?: TemporalStageAttemptWorkflowInput['closeout_packet'];
  checkpointRefs?: string[];
}) {
  const { db } = openQueueDb();
  try {
    const checkpointRefs = input.checkpointRefs ?? [`checkpoint:${input.fixtureId}`];
    const attempt = createStageAttempt(db, {
      domainId: 'redcube',
      stageId: 'artifact_creation',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/redcube-runtime' },
      sourceFingerprint: `sha256:${input.fixtureId}`,
      executorKind: 'codex_cli',
      taskId: `task-${input.fixtureId}`,
      retryBudget: { max_attempts: 3 },
      checkpointRefs,
      idempotencyBoundaryId: `temporal-provider-test:${input.fixtureId}`,
    }).attempt;
    return {
      ...buildTemporalStageAttemptWorkflowInput(attempt),
      stage_packet_ref: `packet:${input.fixtureId}`,
      checkpoint_refs: checkpointRefs,
      codex_stage_runner: { runner_mode: 'dry_run' as const },
      closeout_packet: input.closeoutPacket ?? null,
    } satisfies TemporalStageAttemptWorkflowInput;
  } finally {
    db.close();
  }
}
