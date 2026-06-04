import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
}

test('target architecture schema contracts keep owner delta root and audit tail boundaries machine-readable', () => {
  const schemaPaths = [
    'contracts/opl-framework/current-owner-delta.schema.json',
    'contracts/opl-framework/stage-artifact-unit.schema.json',
    'contracts/opl-framework/owner-answer.schema.json',
    'contracts/opl-framework/evidence-vault-event.schema.json',
    'contracts/opl-framework/golden-path-profile.schema.json',
    'contracts/opl-framework/stop-loss-policy.schema.json',
    'contracts/opl-framework/default-surface-budget.schema.json',
  ];
  const schemas = Object.fromEntries(
    schemaPaths.map((schemaPath) => [schemaPath, readJson<Record<string, any>>(schemaPath)]),
  );

  for (const [schemaPath, schema] of Object.entries(schemas)) {
    assert.equal(schema.owner, 'one-person-lab', `${schemaPath} must stay OPL-owned`);
    assert.equal(schema.state, 'active_contract', `${schemaPath} must be active contract`);
    assert.equal(typeof schema.purpose, 'string', `${schemaPath} must declare purpose`);
    assert.equal(typeof schema.machine_boundary, 'string', `${schemaPath} must declare boundary`);
    assert.equal(schema.type, 'object', `${schemaPath} must describe an object payload`);
  }

  const ownerDelta = schemas['contracts/opl-framework/current-owner-delta.schema.json'];
  assert.equal(ownerDelta.properties.surface_kind.const, 'opl_current_owner_delta');
  assert.equal(ownerDelta.properties.schema_version.const, 'current-owner-delta.v1');
  assert.equal(ownerDelta.properties.current_owner.type, 'string');
  assert.equal(
    ownerDelta.properties.projection_policy.const,
    'default_owner_delta_root_audit_tail_passive',
  );
  assert.equal(ownerDelta.properties.audit_refs.type, 'object');
  assert.equal(ownerDelta.$defs.authority_boundary.properties.audit_tail_can_drive_default_planning.const, false);
  assert.equal(ownerDelta.$defs.authority_boundary.properties.route_not_stage_strategy.const, true);
  assert.equal(
    ownerDelta.$defs.authority_boundary.properties.route_reconciler_role.const,
    'hydrate_reconcile_owner_routes_only',
  );
  assert.equal(
    ownerDelta.$defs.authority_boundary.properties.route_reconciler_can_generate_candidates.const,
    false,
  );
  assert.equal(
    ownerDelta.$defs.authority_boundary.properties.route_reconciler_can_evaluate_or_rank_candidates.const,
    false,
  );
  assert.equal(ownerDelta.$defs.authority_boundary.properties.route_reconciler_can_complete_stage.const, false);
  assert.equal(ownerDelta.$defs.authority_boundary.properties.route_reconciler_can_sign_receipts.const, false);
  assert.equal(ownerDelta.$defs.authority_boundary.properties.raw_evidence_can_drive_default_planning.const, false);
  assert.equal(ownerDelta.$defs.authority_boundary.properties.replay_packet_can_drive_default_planning.const, false);
  assert.equal(
    ownerDelta.$defs.authority_boundary.properties.typed_blocker_group_can_drive_default_planning.const,
    false,
  );

  const evidenceVault = schemas['contracts/opl-framework/evidence-vault-event.schema.json'];
  assert.equal(
    evidenceVault.$defs.authority_boundary.properties.event_can_create_default_action_without_delta.const,
    false,
  );
  assert.equal(evidenceVault.$defs.authority_boundary.properties.raw_evidence_can_drive_default_planning.const, false);
  assert.equal(evidenceVault.$defs.authority_boundary.properties.replay_packet_can_drive_default_planning.const, false);
  assert.equal(
    evidenceVault.$defs.authority_boundary.properties.typed_blocker_group_can_drive_default_planning.const,
    false,
  );
  assert.equal(evidenceVault.$defs.authority_boundary.properties.opl_can_write_domain_truth.const, false);

  const goldenPath = schemas['contracts/opl-framework/golden-path-profile.schema.json'];
  assert.equal(goldenPath.properties.default_surface_policy.properties.ordinary_route_count.const, 1);
  assert.equal(
    goldenPath.$defs.authority_boundary.properties.variant_can_be_default_without_explicit_selection.const,
    false,
  );

  const stageArtifact = schemas['contracts/opl-framework/stage-artifact-unit.schema.json'];
  assert.equal(stageArtifact.properties.progress_truth.required.includes('owner_answer_present'), true);
  assert.equal(stageArtifact.$defs.authority_boundary.properties.provider_completion_counts_as_progress.const, false);

  const ownerAnswer = schemas['contracts/opl-framework/owner-answer.schema.json'];
  assert.equal(ownerAnswer.$defs.authority_boundary.properties.opl_can_sign_domain_owner_answer.const, false);

  const stopLoss = schemas['contracts/opl-framework/stop-loss-policy.schema.json'];
  assert.equal(stopLoss.$defs.authority_boundary.properties.opl_can_synthesize_fallback_verdict.const, false);

  const defaultSurfaceBudget = schemas['contracts/opl-framework/default-surface-budget.schema.json'];
  assert.equal(defaultSurfaceBudget.$defs.false_flags.properties.can_claim_production_ready.const, false);
  assert.equal(
    defaultSurfaceBudget.$defs.authority_boundary.properties.default_surface_can_replace_domain_owner.const,
    false,
  );
});
