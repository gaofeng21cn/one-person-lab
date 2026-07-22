import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import temporalProto from '@temporalio/proto';

import { buildTemporalStageAttemptReplayGateForTest } from '../../../src/modules/runway/family-runtime-temporal-provider.ts';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const legacySourceCommit = '86cc08825a06cd9345a8fe8cc70524693fb54318';

function readLegacyHistory(fileName: string) {
  const bytes = fs.readFileSync(
    path.join(repoRoot, 'tests', 'fixtures', 'temporal-history', fileName),
  );
  return {
    history: JSON.parse(bytes.toString('utf8')) as { events?: Array<Record<string, any>> },
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
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

function patchIds(history: { events?: Array<Record<string, any>> }) {
  return patchMarkers(history).map((marker) => {
    const data = marker.details?.['patch-data']?.payloads?.[0]?.data;
    return typeof data === 'string'
      ? JSON.parse(Buffer.from(data, 'base64').toString('utf8')).id as string
      : null;
  }).filter((value): value is string => typeof value === 'string');
}

function oplUpsertedSearchAttributeNames(history: { events?: Array<Record<string, any>> }) {
  return (history.events ?? [])
    .flatMap((event) => Object.keys(
      event.upsertWorkflowSearchAttributesEventAttributes?.searchAttributes?.indexedFields ?? {},
    ))
    .filter((name) => name.startsWith('Opl'));
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
  {
    fileName: 'stage-attempt-visibility-status-pre-minimal-index-v1.json',
    workflowType: 'StageAttemptWorkflow',
    workflowId: 'legacy-stage-attempt-visibility-status-v1',
    sourceCommit: 'ecf1c9a5c6c19affc0e1b2462923e0aaebc11318',
    expectedPatchIds: [
      'opl-stage-run-attempt-content-binding-v1',
      'opl-stage-attempt-visibility-status-v1',
    ],
    expectedOplUpserts: [
      'OplAttemptStatus',
      'OplBlockedReason',
      'OplStagePhase',
    ],
    expectedSha256: '5ca6a60ac7504cc4dbfc43140ced9154b13c74a82bc236c15fbc3652146a9177',
    protobufObjectJson: true,
  },
] as const) {
  test(`current bundle replays ${fixture.workflowType} history from ${fixture.sourceCommit}`, async () => {
    const { history, sha256 } = readLegacyHistory(fixture.fileName);
    assert.equal(workflowType(history), fixture.workflowType);
    if ('expectedPatchIds' in fixture) {
      assert.deepEqual(patchIds(history), fixture.expectedPatchIds);
      assert.deepEqual([...new Set(oplUpsertedSearchAttributeNames(history))].sort(), fixture.expectedOplUpserts);
      assert.equal(sha256, fixture.expectedSha256);
    } else {
      assert.deepEqual(patchMarkers(history), [], 'legacy fixture must predate the runtime hard-stop patches');
    }
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
