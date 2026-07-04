import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const stageArtifactRuntimeContractPath = 'contracts/opl-framework/stage-artifact-runtime-contract.json';
const stageArtifactUnitSchemaPath = 'contracts/opl-framework/stage-artifact-unit.schema.json';

function readJson<T>(relativePath: string): T {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
}

test('Stage Artifact contracts bind false-authority outputs away from owner gates', () => {
  const runtimeContract = readJson<Record<string, any>>(stageArtifactRuntimeContractPath);
  const unitSchema = readJson<Record<string, any>>(stageArtifactUnitSchemaPath);

  assert.deepEqual(runtimeContract.read_model_semantics.projection_outputs_only, [
    'artifact_projection',
    'progress_projection',
    'evidence_projection',
  ]);
  assert.equal(runtimeContract.read_model_semantics.stage_artifact_current_may_publish_current_owner_delta, false);
  assert.equal(runtimeContract.read_model_semantics.stage_artifact_current_may_close_owner_answer, false);
  assert.equal(runtimeContract.read_model_semantics.stage_artifact_current_may_close_human_gate, false);
  assert.equal(runtimeContract.read_model_semantics.stage_artifact_current_may_close_typed_blocker, false);
  assert.equal(runtimeContract.read_model_semantics.stage_artifact_current_may_declare_domain_ready, false);

  assert.equal(runtimeContract.authority_boundary.can_publish_current_owner_delta, false);
  assert.equal(runtimeContract.authority_boundary.can_close_owner_answer, false);
  assert.equal(runtimeContract.authority_boundary.can_close_human_gate, false);
  assert.equal(runtimeContract.authority_boundary.can_close_typed_blocker, false);
  assert.equal(runtimeContract.authority_boundary.can_declare_domain_ready, false);
  assert.deepEqual(runtimeContract.authority_boundary.output_authority, [
    'artifact_projection',
    'progress_projection',
    'evidence_projection',
  ]);
  assert.equal(runtimeContract.conformance_gate.domain_readiness_claim, false);
  assert.equal(runtimeContract.conformance_gate.closes_owner_answer, false);
  assert.equal(runtimeContract.conformance_gate.closes_human_gate, false);
  assert.equal(runtimeContract.conformance_gate.closes_typed_blocker, false);

  const boundary = unitSchema.$defs.authority_boundary;
  for (const field of [
    'can_publish_current_owner_delta',
    'can_close_owner_answer',
    'can_close_human_gate',
    'can_close_typed_blocker',
    'can_declare_domain_ready',
  ]) {
    assert.equal(boundary.required.includes(field), true, `${field} must be required`);
    assert.equal(boundary.properties[field].const, false, `${field} must be false`);
  }
  assert.deepEqual(boundary.properties.output_authority.items.enum, [
    'artifact_projection',
    'progress_projection',
    'evidence_projection',
  ]);
});
