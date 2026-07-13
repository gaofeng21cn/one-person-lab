import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildTemporalStageAttemptReplayGateForTest } from '../../../src/modules/runway/family-runtime-temporal-provider.ts';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const legacySourceCommit = '86cc08825a06cd9345a8fe8cc70524693fb54318';

function readLegacyHistory(fileName: string) {
  return JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'tests', 'fixtures', 'temporal-history', fileName),
    'utf8',
  )) as { events?: Array<Record<string, any>> };
}

function workflowType(history: { events?: Array<Record<string, any>> }) {
  return history.events?.find((event) => event.workflowExecutionStartedEventAttributes)
    ?.workflowExecutionStartedEventAttributes?.workflowType?.name ?? null;
}

function patchMarkers(history: { events?: Array<Record<string, any>> }) {
  return (history.events ?? [])
    .filter((event) => event.markerRecordedEventAttributes?.markerName === 'core_patch')
    .map((event) => event.markerRecordedEventAttributes);
}

for (const fixture of [
  {
    fileName: 'stage-attempt-hard-stop-pre-runtime-evidence-v1.json',
    workflowType: 'StageAttemptWorkflow',
    workflowId: 'legacy-stage-attempt-hard-stop-v0',
  },
  {
    fileName: 'stage-run-hard-stop-pre-runtime-evidence-v1.json',
    workflowType: 'StageRunWorkflow',
    workflowId: 'legacy-stage-run-hard-stop-v0',
  },
] as const) {
  test(`current bundle replays ${fixture.workflowType} history from ${legacySourceCommit}`, async () => {
    const history = readLegacyHistory(fixture.fileName);
    assert.equal(workflowType(history), fixture.workflowType);
    assert.deepEqual(patchMarkers(history), [], 'legacy fixture must predate the runtime hard-stop patches');

    const gate = await buildTemporalStageAttemptReplayGateForTest(history, fixture.workflowId);
    assert.equal(gate.replay_status, 'passed');
    assert.equal(gate.workflow_id, fixture.workflowId);
  });
}
