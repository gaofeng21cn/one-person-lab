import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

import {
  assertJsonSchemaPayload,
  validateJsonSchemaPayload,
  type JsonSchemaRegistryEntry,
} from '../../src/kernel/schema-registry.ts';
import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const schemaRef = 'contracts/opl-framework/progress-delta-receipt.schema.json';

function readJson(relativePath: string): Record<string, unknown> {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Record<string, unknown>;
}

function progressDeltaReceiptSchema(): JsonSchemaRegistryEntry {
  return {
    schemaId: 'opl.progress_delta_receipt.v1',
    schema: readJson(schemaRef),
    sourceRef: schemaRef,
  };
}

function validProgressDeltaReceipt() {
  return {
    surface_kind: 'opl_progress_delta_receipt',
    schema_version: 'progress-delta-receipt.v1',
    receipt_id: 'receipt:reuse-first-schema-seed',
    domain_id: 'one-person-lab',
    task_or_study_ref: 'task:reuse-first-schema-boundary',
    stage_ref: 'phase:1',
    producer: 'codex/reuse-first-schema-cli-seed-20260703b',
    delta_classification: 'platform_repair_delta',
    changed_surfaces: ['src/kernel/schema-registry.ts'],
    produced_refs: ['tests/src/schema-registry.test.ts'],
    consumed_refs: [schemaRef],
    next_owner: 'main-session-review',
    next_required_delta: 'absorb-or-reject-worktree',
    authority_boundary: {
      can_authorize_stage_complete: false,
      can_authorize_publication_ready: false,
      can_authorize_package_ready: false,
      can_mutate_artifact_body: false,
      can_accept_or_reject_memory: false,
      can_claim_production_ready: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      platform_repair_counts_as_deliverable_progress: false,
    },
  };
}

test('Ajv schema registry accepts an existing JSON Schema contract payload', () => {
  const result = validateJsonSchemaPayload(
    progressDeltaReceiptSchema(),
    validProgressDeltaReceipt(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.schema_id, 'opl.progress_delta_receipt.v1');
});

test('Ajv schema registry rejects invalid payloads through the contract schema', () => {
  const invalidReceipt = validProgressDeltaReceipt();
  invalidReceipt.authority_boundary.can_sign_owner_receipt = true;

  const result = validateJsonSchemaPayload(progressDeltaReceiptSchema(), invalidReceipt);
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail('invalid payload unexpectedly passed JSON Schema validation');
  }

  assert.equal(result.errors.some((error) => error.keyword === 'const'), true);
  assert.equal(
    result.errors.some((error) => error.instance_path === '/authority_boundary/can_sign_owner_receipt'),
    true,
  );

  assert.throws(
    () => assertJsonSchemaPayload(progressDeltaReceiptSchema(), invalidReceipt),
    FrameworkContractError,
  );
});
