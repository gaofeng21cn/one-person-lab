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
import {
  assertReferenceDesignPatternPacket,
  referenceDesignPatternPacketSchemaEntry,
  validateReferenceDesignPatternPacket,
} from '../../src/authority/workspace/reference-design-pattern-packet.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const progressDeltaReceiptSchemaRef = 'contracts/opl-framework/progress-delta-receipt.schema.json';
const referenceDesignPatternPacketSchemaRef =
  'contracts/opl-framework/reference-design-pattern-packet.schema.json';
const sourceMaterialIngestContractRef =
  'contracts/opl-framework/source-material-ingest-contract.json';
const reviewerSnapshotRequestSchemaRef =
  'contracts/opl-framework/reviewer-input-snapshot-materialization-request.schema.json';
const reviewerSnapshotManifestSchemaRef =
  'contracts/opl-framework/reviewer-input-snapshot-manifest.schema.json';

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
      consumer_agent_id: 'oma',
      public_action_id: 'engineer-agent',
      action_catalog_ref: 'contracts/action_catalog.json',
      input_schema_ref: 'opl://foundry-protocol/DesignRequest',
      request_ref_field: 'source_refs',
      provider_manifest_ref: 'contracts/foundry_provider.json',
      provider_id: 'oma',
      provider_execution_at_ingest: 'not_applicable',
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

test('Ajv schema registry enforces declared date-time formats', () => {
  const schema: JsonSchemaRegistryEntry = {
    schemaId: 'opl.date_time_format_regression.v1',
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'opl.date_time_format_regression.v1',
      type: 'object',
      additionalProperties: false,
      required: ['observed_at'],
      properties: {
        observed_at: { type: 'string', format: 'date-time' },
      },
    },
  };

  assert.equal(validateJsonSchemaPayload(schema, { observed_at: '2026-11-06T00:00:00Z' }).ok, true);
  const invalid = validateJsonSchemaPayload(schema, { observed_at: '2026-11-06 00:00:00' });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.errors.some((error) => error.keyword === 'format'), true);
  }
});

test('reviewer snapshot schemas accept controller lanes without breaking fixed-stage payloads', () => {
  const digest = `sha256:${'a'.repeat(64)}`;
  const authorityRef = {
    kind: 'mas_review_input_snapshot_authority',
    ref: 'workspace://study/review-authority.json',
    size_bytes: 1,
    sha256: digest,
  };
  const request = {
    surface_kind: 'opl_reviewer_input_snapshot_materialization_request',
    schema_version: 2,
    owner_authority_ref: authorityRef,
    producer_attempt_ref: 'opl://stage_attempts/producer',
    execution_content_binding_sha256: digest,
    review_lane: 'medical',
    workspace_root: '/workspace',
    members: [{
      member_id: 'review-input',
      source_ref: 'review-input.bin',
      sha256: digest,
      size_bytes: 1,
    }],
  };
  const manifest = {
    surface_kind: 'opl_reviewer_input_snapshot_manifest',
    schema_version: 3,
    owner_authority_ref: authorityRef,
    producer_attempt_ref: 'opl://stage_attempts/producer',
    execution_content_binding_sha256: digest,
    review_lane: 'medical',
    members: [{
      member_id: 'review-input',
      sha256: digest,
      size_bytes: 1,
      immutable_ref: {
        kind: 'opl_reviewer_input_snapshot_member',
        ref: 'snapshot://review-input.bin',
        size_bytes: 1,
        sha256: digest,
      },
    }],
  };
  const requestSchema = {
    schemaId: 'opl.reviewer_input_snapshot_materialization_request.v2',
    schema: readJson(reviewerSnapshotRequestSchemaRef),
    sourceRef: reviewerSnapshotRequestSchemaRef,
  };
  const manifestSchema = {
    schemaId: 'opl.reviewer_input_snapshot_manifest.v3',
    schema: readJson(reviewerSnapshotManifestSchemaRef),
    sourceRef: reviewerSnapshotManifestSchemaRef,
  };

  assert.equal(validateJsonSchemaPayload(requestSchema, request).ok, true);
  assert.equal(validateJsonSchemaPayload(manifestSchema, manifest).ok, true);

  const legacyRequest = structuredClone(request);
  const legacyManifest = structuredClone(manifest);
  delete (legacyRequest as Partial<typeof request>).review_lane;
  delete (legacyManifest as Partial<typeof manifest>).review_lane;
  assert.equal(validateJsonSchemaPayload(requestSchema, legacyRequest).ok, true);
  assert.equal(validateJsonSchemaPayload(manifestSchema, legacyManifest).ok, true);

  assert.equal(validateJsonSchemaPayload(requestSchema, { ...request, review_lane: '' }).ok, false);
  assert.equal(validateJsonSchemaPayload(manifestSchema, { ...manifest, review_lane: '' }).ok, false);
});

test('Ajv schema registry validates refs-only ReferenceDesignPatternPacket authority', () => {
  const packet = validReferenceDesignPatternPacket();
  const result = validateReferenceDesignPatternPacket(packet);

  assert.equal(result.ok, true);
  assert.equal(result.schema_id, 'opl.reference_design_pattern_packet.v1');
  assert.equal(
    referenceDesignPatternPacketSchemaEntry().sourceRef,
    referenceDesignPatternPacketSchemaRef,
  );
  assert.equal(
    packet.consumer_route.provider_manifest_ref,
    'contracts/foundry_provider.json',
  );

  const authorityOverclaim = {
    ...packet,
    authority_boundary: {
      ...packet.authority_boundary,
      opl_can_claim_pattern_quality_ready: true,
    },
  };
  const invalidResult = validateReferenceDesignPatternPacket(authorityOverclaim);
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
  assert.throws(
    () => assertReferenceDesignPatternPacket(authorityOverclaim),
    FrameworkContractError,
  );
});

test('source material contracts expose only descriptor-derived consumer routes', () => {
  const schema = readJson(referenceDesignPatternPacketSchemaRef) as any;
  const ingestContract = readJson(sourceMaterialIngestContractRef) as any;
  const handoff = ingestContract.handoff_policy.reference_design_pattern_handoff;

  assert.equal(Array.isArray(schema.required), true);
  assert.equal(schema.required.length > 0, true);
  assert.deepEqual(handoff.receipt_fields, [
    'applicability',
    'contract_ref',
    'source_material_role',
    'consumer_projection_ref',
    'consumer_route',
    'semantic_extraction_executed',
    'provider_execution_at_ingest',
    'reason',
    'authority_boundary',
  ]);
  assert.deepEqual(handoff.consumer_route_fields, [
    'consumer_agent_id',
    'public_action_id',
    'action_catalog_ref',
    'input_schema_ref',
    'request_ref_field',
    'provider_manifest_ref',
    'provider_id',
  ]);
  assert.deepEqual(schema.properties.consumer_route.required, [
    ...handoff.consumer_route_fields,
    'provider_execution_at_ingest',
  ]);
  assert.equal(
    schema.properties.consumer_route.properties.provider_execution_at_ingest.const,
    'not_applicable',
  );
  assert.equal(handoff.provider_execution_at_ingest, 'not_applicable');
  assert.equal(JSON.stringify(schema).includes('oma-contract:reference-design-packet.v1'), false);
  assert.equal(JSON.stringify(ingestContract).includes('oma-contract:reference-design-packet.v1'), false);
  for (const retiredField of [
    'required_return_shape',
    'required_return_fields_ref',
    'consumer_after_return',
    'consumer_return_contract_ref',
  ]) {
    assert.equal(Object.hasOwn(handoff, retiredField), false);
  }
});
