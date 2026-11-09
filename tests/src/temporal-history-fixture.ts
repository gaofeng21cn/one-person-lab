import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import temporalProto from '@temporalio/proto';
import { historyFromJSON } from '@temporalio/common/proto-utils';

const repoRoot = path.resolve(import.meta.dirname, '../..');

// The old proto3-json-serializer wrote empty messages as Duration strings in
// these two immutable exports. Keep their original bytes and repair only the
// known empty-message representation. The protobuf hashes were recorded with
// SDK 1.20.3 before this migration and bind the exact same replay input.
const legacyJsonFixtures: Record<string, { source: string; protobuf: string }> = {
  'stage-attempt-hard-stop-pre-runtime-evidence-v1.json': {
    source: '04b1a0af910c3587d69188742236082dbd36bbaf18fe917a2cf587e78fb05d0b',
    protobuf: '6d2a4e1d01dabb7e923ca4a94451494c6c5ce9a5601b57f3a512c1e2568b1d96',
  },
  'stage-run-hard-stop-pre-runtime-evidence-v1.json': {
    source: 'c1c551c5bd0a0b820b83963ffa996f87f9d5edbbca957419ab7580e033831d4f',
    protobuf: '013cbe451785bc934f80f4082195c0f9ae6958662b58fd76f1dc370ed0d08a52',
  },
};

export function readTemporalHistoryFixture(fileName: string) {
  const bytes = fs.readFileSync(path.join(repoRoot, 'tests/fixtures/temporal-history', fileName));
  const history = JSON.parse(bytes.toString('utf8')) as { events?: Array<Record<string, any>> };
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const legacy = legacyJsonFixtures[fileName];
  if (!legacy) {
    return { history, sha256, replayHistory: temporalProto.temporal.api.history.v1.History.fromObject(history) };
  }

  assert.equal(sha256, legacy.source, 'Legacy fixture normalization requires its original immutable bytes');
  const normalized = structuredClone(history);
  for (const event of normalized.events ?? []) {
    for (const [attribute, fields] of [
      ['workflowExecutionStartedEventAttributes', ['header']],
      ['activityTaskScheduledEventAttributes', ['header']],
      ['startChildWorkflowExecutionInitiatedEventAttributes', ['header', 'memo']],
      ['workflowTaskCompletedEventAttributes', ['sdkMetadata', 'meteringMetadata']],
    ] as const) {
      for (const field of fields) {
        if (event[attribute]?.[field] === '0s') event[attribute][field] = {};
      }
    }
  }
  const replayHistory = historyFromJSON(normalized);
  const encoded = temporalProto.temporal.api.history.v1.History.encode(replayHistory).finish();
  assert.equal(createHash('sha256').update(encoded).digest('hex'), legacy.protobuf,
    'Normalized history must preserve the exact SDK 1.20.3 protobuf replay input');
  return { history, sha256, replayHistory };
}
