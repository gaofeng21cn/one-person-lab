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
  } finally {
    await testEnv.teardown();
  }
});
