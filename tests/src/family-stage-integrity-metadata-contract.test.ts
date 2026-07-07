import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

type JsonRecord = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const schemaPath = 'contracts/family-orchestration/family-stage-integrity-metadata.schema.json';

function readJson(relativePath: string): JsonRecord {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as JsonRecord;
}

function firstExample(schema: JsonRecord): JsonRecord {
  const examples = schema.examples;
  assert.ok(Array.isArray(examples));
  assert.ok(examples.length > 0);
  return examples[0] as JsonRecord;
}

test('family stage integrity metadata contract freezes generic metadata shape', () => {
  const schema = readJson(schemaPath);
  const required = schema.required as string[];
  const properties = schema.properties as Record<string, JsonRecord>;
  const example = firstExample(schema);

  assert.equal(properties.surface_kind.const, 'family_stage_integrity_metadata');
  assert.equal(properties.version.const, 'family-stage-integrity-metadata.v1');
  assert.ok(required.includes('integrity_policy'));
  assert.ok(required.includes('claim_support'));
  assert.equal(required.includes('citation_support'), false);
  assert.ok(required.includes('evidence_handoff'));
  assert.ok(required.includes('data_access'));
  assert.ok(required.includes('human_checkpoints'));
  assert.equal((properties.citation_support as JsonRecord).deprecated, true);
  assert.equal(example.surface_kind, 'family_stage_integrity_metadata');
  assert.equal((example.integrity_policy as JsonRecord).status, 'active');
  const requiredCheckEnum = (
    ((((properties.integrity_policy as JsonRecord).properties as Record<string, JsonRecord>)
      .required_checks as JsonRecord).items as JsonRecord).enum
  ) as string[];
  assert.ok(requiredCheckEnum.includes('claim_support'));
  assert.equal(requiredCheckEnum.includes('citation_support'), false);
  assert.equal((example.claim_support as JsonRecord).support_mode, 'claim_ref_alignment_required');
  assert.equal((example.evidence_handoff as JsonRecord).handoff_mode, 'refs_only');
  assert.equal((example.data_access as JsonRecord).body_included, false);
  assert.equal((example.data_access as JsonRecord).write_permitted, false);
});

test('family stage integrity metadata keeps OPL outside domain verdict and truth authority', () => {
  const schema = readJson(schemaPath);
  const example = firstExample(schema);
  const authority = example.authority_boundary as JsonRecord;
  const forbidden = authority.forbidden_opl_authority as string[];

  assert.equal(authority.opl_role, 'framework_metadata_projection_owner');
  assert.equal(authority.domain_role, 'truth_quality_artifact_and_direct_skill_owner');
  assert.ok(forbidden.includes('domain_truth_owner'));
  assert.ok(forbidden.includes('quality_verdict_owner'));
  assert.ok(forbidden.includes('publication_authority'));
  assert.ok(forbidden.includes('fundability_authority'));
  assert.ok(forbidden.includes('visual_quality_authority'));
  assert.ok(forbidden.includes('artifact_authority'));
  assert.ok(forbidden.includes('direct_skill_path_owner'));
  assert.equal(authority.can_write_domain_truth, false);
  assert.equal(authority.can_authorize_quality_verdict, false);
  assert.equal(authority.can_authorize_publication_verdict, false);
  assert.equal(authority.can_authorize_fundability_verdict, false);
  assert.equal(authority.can_authorize_visual_quality_verdict, false);
  assert.equal(authority.can_mutate_artifact_body, false);
  assert.equal(authority.can_override_direct_skill_path, false);
});

test('family product-entry manifest can discover stage integrity metadata without making it required', () => {
  const manifestSchema = readJson('contracts/family-orchestration/family-product-entry-manifest-v2.schema.json');
  const required = manifestSchema.required as string[];
  const properties = manifestSchema.properties as Record<string, JsonRecord>;

  assert.equal(
    properties.family_stage_integrity_metadata.$ref,
    'family-stage-integrity-metadata.schema.json',
  );
  assert.equal(required.includes('family_stage_integrity_metadata'), false);
});
