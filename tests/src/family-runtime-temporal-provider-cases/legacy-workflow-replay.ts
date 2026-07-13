import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import temporalProto from '@temporalio/proto';

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

function acceptedUpdateNames(history: { events?: Array<Record<string, any>> }) {
  return (history.events ?? [])
    .map((event) => event.workflowExecutionUpdateAcceptedEventAttributes?.acceptedRequest?.input?.name)
    .filter(Boolean);
}

function signalNames(history: { events?: Array<Record<string, any>> }) {
  return (history.events ?? [])
    .map((event) => event.workflowExecutionSignaledEventAttributes?.signalName)
    .filter(Boolean);
}

for (const fixture of [
  {
    fileName: 'stage-attempt-hard-stop-pre-runtime-evidence-v1.json',
    workflowType: 'StageAttemptWorkflow',
    workflowId: 'legacy-stage-attempt-hard-stop-v0',
    sourceCommit: legacySourceCommit,
  },
  {
    fileName: 'stage-run-hard-stop-pre-runtime-evidence-v1.json',
    workflowType: 'StageRunWorkflow',
    workflowId: 'legacy-stage-run-hard-stop-v0',
    sourceCommit: legacySourceCommit,
  },
  {
    fileName: 'stage-attempt-quality-resume-pre-content-binding-v1.json',
    workflowType: 'StageAttemptWorkflow',
    workflowId: 'legacy-stage-attempt-quality-resume-v0',
    sourceCommit: '4a5ed90c52efa832cda0c9164d13c08766514e92',
    expectedAcceptedUpdate: 'StageAttemptOperatorUpdate',
    expectedSignal: 'ResumeSignal',
    protobufObjectJson: true,
  },
] as const) {
  test(`current bundle replays ${fixture.workflowType} history from ${fixture.sourceCommit}`, async () => {
    const history = readLegacyHistory(fixture.fileName);
    assert.equal(workflowType(history), fixture.workflowType);
    assert.deepEqual(patchMarkers(history), [], 'legacy fixture must predate the runtime hard-stop patches');
    if ('expectedAcceptedUpdate' in fixture) {
      assert.ok(acceptedUpdateNames(history).includes(fixture.expectedAcceptedUpdate));
      assert.ok(signalNames(history).includes(fixture.expectedSignal));
    }

    const replayHistory = 'protobufObjectJson' in fixture
      ? temporalProto.temporal.api.history.v1.History.fromObject(history)
      : history;
    const gate = await buildTemporalStageAttemptReplayGateForTest(replayHistory, fixture.workflowId);
    assert.equal(gate.replay_status, 'passed');
    assert.equal(gate.workflow_id, fixture.workflowId);
  });
}
