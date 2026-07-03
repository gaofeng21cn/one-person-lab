import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS,
  buildObservabilitySemanticConventionReadback,
} from '../../src/modules/ledger/observability-semantic-conventions.ts';

const expectedFields = [
  'stage_run_id',
  'attempt_id',
  'domain_id',
  'owner_id',
  'route_ref',
  'receipt_ref',
  'typed_blocker_ref',
  'workflow_id',
  'task_queue',
  'generation',
  'source_fingerprint',
];

function contract() {
  return JSON.parse( // reuse-first: allow contract fixture parser
    fs.readFileSync(
      new URL('../../contracts/opl-framework/observability-semantic-conventions-contract.json', import.meta.url),
      'utf8',
    ),
  ) as {
    schema_version: string;
    fields: Array<{ id: string; otel_attribute: string }>;
    signal_mappings: Record<string, { canonical_fields: string[]; instruments?: string[] }>;
    authority_boundary: Record<string, boolean>;
  };
}

test('observability semantic conventions freeze the OPL vocabulary and signal mappings', () => {
  const semanticContract = contract();

  assert.equal(semanticContract.schema_version, 'opl_observability_semantic_conventions.v1');
  assert.deepEqual(semanticContract.fields.map((field) => field.id), expectedFields);
  assert.deepEqual(OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.fields.map((field) => field.id), expectedFields);
  assert.deepEqual(
    semanticContract.fields.map((field) => field.otel_attribute),
    expectedFields.map((field) => `opl.${field}`),
  );
  assert.deepEqual(
    OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.signal_mappings.trace_span.canonical_fields,
    [
      'stage_run_id',
      'attempt_id',
      'domain_id',
      'owner_id',
      'route_ref',
      'workflow_id',
      'task_queue',
      'generation',
      'source_fingerprint',
    ],
  );
  assert.deepEqual(
    OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.signal_mappings.metric.instruments,
    ['queue_length', 'retry_count', 'dead_letter_count', 'latency_ms', 'error_count'],
  );
  assert.deepEqual(
    OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.signal_mappings.log_event.canonical_fields,
    [
      'stage_run_id',
      'attempt_id',
      'domain_id',
      'owner_id',
      'route_ref',
      'receipt_ref',
      'typed_blocker_ref',
      'source_fingerprint',
    ],
  );
  assert.equal(semanticContract.authority_boundary.ledger_refs_only, true);
  assert.equal(semanticContract.authority_boundary.can_create_private_ledger_ui, false);
});

test('observability readback projects current owner refs without becoming a ledger UI', () => {
  const readback = buildObservabilitySemanticConventionReadback({
    current_owner_delta: {
      stage_run_id: 'stage-run:mas:review',
      current_owner: 'medautoscience',
      domain_id: 'medautoscience',
      route_ref: 'route:mas:review',
      receipt_ref: 'receipt:mas:review',
      typed_blocker_ref: 'typed-blocker:mas:owner-gate',
      source_fingerprint: 'sha256:source',
    },
    stage_attempt: {
      stage_attempt_id: 'sat_123',
      generation: 3,
    },
    provider_attempt: {
      workflow_id: 'workflow:mas:review',
      task_queue: 'opl-family-runtime',
    },
    artifact_body: 'must-not-leak',
  });

  assert.equal(readback.surface_kind, 'opl_observability_semantic_conventions_readback');
  assert.equal(readback.authority_boundary.ledger_refs_only, true);
  assert.equal(readback.authority_boundary.can_create_private_ledger_ui, false);
  assert.equal(readback.authority_boundary.can_store_payload_body, false);
  assert.deepEqual(readback.forbidden_body_fields_present, ['artifact_body']);
  assert.deepEqual(readback.canonical_attributes, {
    stage_run_id: 'stage-run:mas:review',
    attempt_id: 'sat_123',
    domain_id: 'medautoscience',
    owner_id: 'medautoscience',
    route_ref: 'route:mas:review',
    receipt_ref: 'receipt:mas:review',
    typed_blocker_ref: 'typed-blocker:mas:owner-gate',
    workflow_id: 'workflow:mas:review',
    task_queue: 'opl-family-runtime',
    generation: 3,
    source_fingerprint: 'sha256:source',
  });
  assert.equal(readback.signals.trace_span.attributes['opl.stage_run_id'], 'stage-run:mas:review');
  assert.equal(readback.signals.metric.attributes['opl.task_queue'], 'opl-family-runtime');
  assert.equal(readback.signals.log_event.attributes['opl.receipt_ref'], 'receipt:mas:review');
  assert.deepEqual(readback.signals.log_event.ref_fields, ['route_ref', 'receipt_ref', 'typed_blocker_ref']);
});
