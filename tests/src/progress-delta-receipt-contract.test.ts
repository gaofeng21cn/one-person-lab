import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import {
  buildProgressDeltaReceipt,
  PROGRESS_DELTA_RECEIPT_DELTA_CLASSES,
  validateProgressDeltaReceipt,
} from '../../src/modules/ledger/progress-delta-receipt.ts';
import { FrameworkContractError } from '../../src/modules/charter/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson<T>(relativePath: string): T {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
}

test('progress delta receipt schema is an OPL-owned ordinary progress contract with false authority', () => {
  const schema = readJson<Record<string, any>>('contracts/opl-framework/progress-delta-receipt.schema.json');

  assert.equal(schema.owner, 'one-person-lab');
  assert.equal(schema.state, 'active_contract');
  assert.equal(schema.properties.surface_kind.const, 'opl_progress_delta_receipt');
  assert.equal(schema.properties.schema_version.const, 'progress-delta-receipt.v1');
  assert.deepEqual(schema.properties.delta_classification.enum, [
    'deliverable_progress_delta',
    'platform_repair_delta',
    'advisory_delta',
    'typed_blocker',
    'human_gate',
  ]);
  for (const field of [
    'receipt_id',
    'domain_id',
    'task_or_study_ref',
    'stage_ref',
    'producer',
    'delta_classification',
    'changed_surfaces',
    'produced_refs',
    'consumed_refs',
    'next_owner',
    'next_required_delta',
    'authority_boundary',
  ]) {
    assert.equal(schema.required.includes(field), true, `schema must require ${field}`);
  }
  assert.equal(schema.$defs.authority_boundary.properties.can_authorize_stage_complete.const, false);
  assert.equal(schema.$defs.authority_boundary.properties.can_authorize_publication_ready.const, false);
  assert.equal(schema.$defs.authority_boundary.properties.can_mutate_artifact_body.const, false);
  assert.equal(schema.$defs.authority_boundary.properties.can_sign_owner_receipt.const, false);
  assert.equal(schema.$defs.authority_boundary.properties.can_create_typed_blocker.const, false);
  assert.equal(schema.$defs.authority_boundary.properties.platform_repair_counts_as_deliverable_progress.const, false);
});

test('progress delta receipt helper normalizes refs and rejects missing required refs', () => {
  assert.deepEqual([...PROGRESS_DELTA_RECEIPT_DELTA_CLASSES], [
    'deliverable_progress_delta',
    'platform_repair_delta',
    'advisory_delta',
    'typed_blocker',
    'human_gate',
  ]);

  const receipt = buildProgressDeltaReceipt({
    receipt_id: 'pdr:mas:dm003:analysis-delta',
    domain_id: 'med-autoscience',
    task_or_study_ref: 'study:DM003',
    stage_ref: 'analysis_pack',
    producer: 'codex_cli',
    delta_classification: 'platform_repair_delta',
    changed_surfaces: ['runtime/currentness', 'runtime/currentness'],
    produced_refs: ['opl://attempt/sat_123/progress-delta'],
    consumed_refs: ['current_owner_delta:dm003'],
    next_owner: 'med-autoscience',
    next_required_delta: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
  });

  assert.equal(receipt.surface_kind, 'opl_progress_delta_receipt');
  assert.equal(receipt.schema_version, 'progress-delta-receipt.v1');
  assert.deepEqual(receipt.changed_surfaces, ['runtime/currentness']);
  assert.equal(receipt.authority_boundary.can_authorize_stage_complete, false);
  assert.equal(receipt.authority_boundary.can_authorize_publication_ready, false);
  assert.equal(receipt.authority_boundary.can_sign_owner_receipt, false);
  assert.equal(receipt.authority_boundary.platform_repair_counts_as_deliverable_progress, false);
  assert.deepEqual(validateProgressDeltaReceipt(receipt), receipt);

  let invalidRefsError: FrameworkContractError | null = null;
  try {
    validateProgressDeltaReceipt({
      ...receipt,
      produced_refs: [],
    });
    assert.fail('invalid produced_refs unexpectedly passed schema validation');
  } catch (error) {
    assert.ok(error instanceof FrameworkContractError);
    invalidRefsError = error;
  }
  assert.ok(invalidRefsError);
  assert.equal(
    (invalidRefsError.details?.errors as Array<{ instance_path?: string }>).some(
      (error) => error.instance_path === '/produced_refs',
    ),
    true,
  );
});

test('progress delta receipt validator rejects false-authority drift at the JSON boundary', () => {
  const receipt = buildProgressDeltaReceipt({
    receipt_id: 'pdr:mas:dm003:false-authority-drift',
    domain_id: 'med-autoscience',
    task_or_study_ref: 'study:DM003',
    stage_ref: 'analysis_pack',
    producer: 'codex_cli',
    delta_classification: 'platform_repair_delta',
    changed_surfaces: ['runtime/currentness'],
    produced_refs: ['opl://attempt/sat_123/progress-delta'],
    consumed_refs: ['current_owner_delta:dm003'],
    next_owner: 'med-autoscience',
    next_required_delta: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
  });

  assert.throws(
    () => validateProgressDeltaReceipt({
      ...receipt,
      authority_boundary: {
        ...receipt.authority_boundary,
        can_sign_owner_receipt: true,
      },
    }),
    FrameworkContractError,
  );
});
