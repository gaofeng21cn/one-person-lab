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
const progressDeltaReceiptSchemaRef = 'contracts/opl-framework/progress-delta-receipt.schema.json';
const referenceDesignPatternPacketSchemaRef =
  'contracts/opl-framework/reference-design-pattern-packet.schema.json';

function readJson(relativePath: string): Record<string, unknown> {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Record<string, unknown>;
}

function progressDeltaReceiptSchema(): JsonSchemaRegistryEntry {
  return {
    schemaId: 'opl.progress_delta_receipt.v1',
    schema: readJson(progressDeltaReceiptSchemaRef),
    sourceRef: progressDeltaReceiptSchemaRef,
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
    consumed_refs: [progressDeltaReceiptSchemaRef],
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

function referenceDesignPatternPacketSchema(): JsonSchemaRegistryEntry {
  return {
    schemaId: 'opl.reference_design_pattern_packet.v1',
    schema: readJson(referenceDesignPatternPacketSchemaRef),
    sourceRef: referenceDesignPatternPacketSchemaRef,
  };
}

function validReferenceDesignPatternPacket() {
  return {
    surface_kind: 'opl_reference_design_pattern_packet',
    schema_version: 'reference-design-pattern-packet.v1',
    packet_id: 'reference-design-pattern-packet:hemaguide:v1',
    packet_ref: 'packet:reference-design-pattern/hemaguide/v1',
    source_material_ref: 'source-material:sha256:abc123',
    source_material_receipt_ref: 'control/opl/source_materials/abc123.json',
    source_fingerprint_ref: 'sha256:abc123',
    extraction_attempt_refs: ['attempt:reference-design-extraction/hemaguide/1'],
    extraction_receipt_refs: ['receipt:reference-design-extraction/hemaguide/1'],
    source_anchor_refs: ['source-anchor:hemaguide/page-4'],
    pattern_summary_ref: 'pattern-summary:hemaguide/v1',
    transferable_pattern_refs: ['transferable-pattern:hemaguide/decision-flow'],
    non_transferable_constraint_refs: ['constraint:hemaguide/domain-specific-thresholds'],
    authority_boundary_notes_ref: 'authority-notes:hemaguide/v1',
    consumer_route: {
      consumer: 'oma',
      next_owner: 'oma:reference-design-distillation',
      next_owner_action: 'materialize_reference_design_packet',
      required_return_shape: 'ReferenceDesignPacket',
      required_return_contract_ref: 'oma-contract:reference-design-packet.v1',
      required_return_fields_ref: 'oma-contract:reference-design-packet.v1#/required_fields',
    },
    authority_boundary: {
      refs_only: true,
      body_free: true,
      opl_can_write_domain_truth: false,
      opl_can_copy_source_body_into_contract: false,
      opl_can_sign_owner_receipt: false,
      opl_can_create_typed_blocker: false,
      opl_can_claim_pattern_quality_ready: false,
      opl_can_claim_target_ready: false,
      opl_can_claim_domain_ready: false,
      opl_can_claim_production_ready: false,
    },
    non_claims: {
      pattern_quality_ready: false,
      target_ready: false,
      domain_ready: false,
      production_ready: false,
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

test('Ajv schema registry validates refs-only ReferenceDesignPatternPacket authority', () => {
  const packet = validReferenceDesignPatternPacket();
  const result = validateJsonSchemaPayload(referenceDesignPatternPacketSchema(), packet);

  assert.equal(result.ok, true);
  assert.equal(result.schema_id, 'opl.reference_design_pattern_packet.v1');
  assert.equal(
    packet.consumer_route.required_return_contract_ref,
    'oma-contract:reference-design-packet.v1',
  );

  const authorityOverclaim = {
    ...packet,
    authority_boundary: {
      ...packet.authority_boundary,
      opl_can_claim_pattern_quality_ready: true,
    },
  };
  const invalidResult = validateJsonSchemaPayload(
    referenceDesignPatternPacketSchema(),
    authorityOverclaim,
  );
  assert.equal(invalidResult.ok, false);
  if (invalidResult.ok) {
    assert.fail('authority-overclaiming packet unexpectedly passed JSON Schema validation');
  }
  assert.equal(
    invalidResult.errors.some((error) =>
      error.instance_path === '/authority_boundary/opl_can_claim_pattern_quality_ready'
      && error.keyword === 'const'
    ),
    true,
  );
});
