import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  defaultPayloadConverter,
  fromPayloadsAtIndex,
} from '@temporalio/common/lib/converter/payload-converter.js';
import { Worker } from '@temporalio/worker';

import * as activities from '../../../src/modules/runway/family-runtime-temporal-activities.ts';
import { StageAttemptWorkflow } from '../../../src/modules/runway/family-runtime-temporal-workflows.ts';
import { createTemporalTestWorkflowEnvironment } from '../temporal-test-environment.ts';
import { createPersistedTemporalStageAttemptInput } from './persisted-attempt.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function firstActivityResult(history: { events?: Array<Record<string, any>> | null }) {
  const completion = (history.events ?? []).find((event) => event.activityTaskCompletedEventAttributes);
  return fromPayloadsAtIndex<Record<string, any>>(
    defaultPayloadConverter,
    0,
    completion?.activityTaskCompletedEventAttributes?.result?.payloads,
  );
}

test('Temporal history stores refs-only Codex activity results', async () => {
  const testEnv = await createTemporalTestWorkflowEnvironment();
  const taskQueue = `opl-stage-attempt-history-test-${Date.now()}`;
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'modules', 'runway', 'family-runtime-temporal-workflows.ts'),
      activities,
    });
    const input = createPersistedTemporalStageAttemptInput({
      fixtureId: 'history',
      checkpointRefs: [],
    });

    const history = await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [input],
        taskQueue,
        workflowId: input.workflow_id,
      });
      await handle.result();
      return await handle.fetchHistory();
    });
    const receipt = firstActivityResult(history);

    for (const field of ['stdout', 'stderr', 'log_body', 'agent_execution_receipt']) {
      assert.equal(receipt[field], undefined, `${field} must not enter Temporal history`);
    }
    assert.equal(JSON.stringify(receipt).includes('command_preview'), false);
    assert.equal(receipt.coordination_observation?.status, 'not_started');
    assert.equal(
      receipt.coordination_observation?.stage_attempt_ref,
      `opl://stage_attempts/${encodeURIComponent(input.stage_attempt_id)}`,
    );
    assert.equal(
      receipt.coordination_observation?.workflow_ref,
      `temporal://workflows/${encodeURIComponent(input.workflow_id)}`,
    );
    assert.equal(receipt.coordination_observation?.execution_session_ref, null);
    assert.equal(receipt.coordination_observation?.latest_receipt_ref, null);
    assert.equal(receipt.coordination_observation?.emitted_event_count, 0);
    assert.equal(receipt.coordination_observation?.heartbeat_count, 0);
    assert.deepEqual(
      Object.keys(receipt.coordination_observation ?? {}).sort(),
      [
        'authority_boundary',
        'emitted_event_count',
        'execution_session_ref',
        'failure_codes',
        'heartbeat_count',
        'latest_activity_state',
        'latest_receipt_ref',
        'schema_version',
        'stage_attempt_ref',
        'status',
        'surface_kind',
        'terminal_state',
        'workflow_ref',
      ],
    );
    assert.deepEqual(
      Object.keys(receipt.coordination_observation?.authority_boundary ?? {}).sort(),
      [
        'can_change_stage_attempt',
        'can_change_work_item_lifecycle',
        'can_write_domain_truth',
        'coordination_is_execution_proof',
        'projection_only',
      ],
    );
  } finally {
    await testEnv.teardown();
  }
});
