import { SearchAttributeType } from '@temporalio/common';
import { TestWorkflowEnvironment } from '@temporalio/testing';

import { assert } from '../helpers.ts';

const TEMPORAL_SEARCH_ATTRIBUTE_NAMES = ['OplStageAttemptId', 'OplDomainId', 'OplStageId', 'OplAttemptStatus',
  'OplStagePhase', 'OplBlockedReason', 'OplTaskId', 'OplSourceFingerprint', 'OplExecutorKind'];

export function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

export function createSearchableTemporalTestEnvironment() {
  return TestWorkflowEnvironment.createLocal({
    server: { searchAttributes: TEMPORAL_SEARCH_ATTRIBUTE_NAMES.map((name) => ({ name, type: SearchAttributeType.KEYWORD })) },
  });
}

export function assertTemporalLifecycleReadbackFalseReady(
  readback: Record<string, any>,
  expected: Record<string, any>,
) {
  const identity = expected.identity === 'workflow_history'
    ? readback.workflow_history_identity
    : readback.stage_attempt_identity;

  assert.equal(readback.readback_status, expected.readbackStatus);
  assert.equal(identity.workflow_id, expected.workflowId);
  if ('runId' in expected) {
    assert.equal(identity.run_id, expected.runId);
  }
  assert.equal(readback.schedule_identity.schedule_id, 'opl-family-runtime-provider-scheduler');
  assert.equal(readback.task_queue_identity.default_task_queue, expected.taskQueue);
  if ('requiredHistoryOrQueryEvidence' in expected) {
    assert.equal(
      readback.required_evidence.includes('temporal_workflow_history_or_query_readback'),
      expected.requiredHistoryOrQueryEvidence,
    );
  }
  assert.equal(
    readback.observed_evidence.includes('temporal_workflow_query_readback'),
    expected.observedQueryReadback,
  );
  assert.equal(readback.ready_claim_allowed, false);
}
