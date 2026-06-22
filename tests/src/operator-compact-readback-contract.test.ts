import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const contractPath = 'contracts/opl-framework/operator-compact-readback-contract.json';

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
}

test('operator compact readback contract pins derived readbacks and false-ready boundaries', () => {
  const contract = readJson<Record<string, any>>(contractPath);

  assert.equal(contract.surface_kind, 'opl_operator_compact_readback_contract');
  assert.equal(contract.version, 'operator-compact-readback.v1');
  assert.equal(contract.owner, 'one-person-lab');
  assert.equal(contract.state, 'active_contract');
  assert.equal(contract.default_full_readback_unchanged, true);
  assert.equal(contract.no_second_truth_guard.compact_surfaces_are_projection_only, true);
  assert.equal(contract.no_second_truth_guard.compact_surfaces_can_be_source_of_truth, false);
  assert.equal(contract.no_second_truth_guard.full_readback_remains_source_surface, true);

  const surfaces = Object.fromEntries(
    contract.compact_surfaces.map((surface: any) => [surface.surface_id, surface]),
  );
  assert.deepEqual(Object.keys(surfaces).sort(), [
    'framework_operating_maturity_compact',
    'framework_readiness_compact',
  ]);

  assert.equal(
    surfaces.framework_readiness_compact.compact_command,
    'opl framework readiness --family-defaults --detail compact --json',
  );
  assert.equal(
    surfaces.framework_readiness_compact.full_detail_command,
    'opl framework readiness --family-defaults --json',
  );
  assert.equal(surfaces.framework_readiness_compact.source_surface_ref, '/framework_readiness');
  assert.equal(
    surfaces.framework_readiness_compact.omitted_sections.includes('attention_first_payload'),
    true,
  );

  assert.equal(
    surfaces.framework_operating_maturity_compact.compact_command,
    'opl framework operating-maturity --family-defaults --detail compact --json',
  );
  assert.equal(
    surfaces.framework_operating_maturity_compact.full_detail_command,
    'opl framework operating-maturity --family-defaults --json',
  );
  assert.equal(
    surfaces.framework_operating_maturity_compact.source_surface_ref,
    '/framework_operating_maturity',
  );
  assert.equal(
    surfaces.framework_operating_maturity_compact.omitted_sections.includes('owner_evidence_intake'),
    true,
  );

  for (const surface of Object.values(surfaces) as any[]) {
    assert.equal(surface.derived_from_full_readback, true, surface.surface_id);
    assert.equal(surface.default_full_readback_unchanged, true, surface.surface_id);
    assert.equal(surface.authority_boundary.refs_only, true, surface.surface_id);
    assert.equal(surface.authority_boundary.can_write_domain_truth, false, surface.surface_id);
    assert.equal(surface.authority_boundary.can_sign_owner_receipt, false, surface.surface_id);
    assert.equal(surface.authority_boundary.can_create_typed_blocker, false, surface.surface_id);
    assert.equal(surface.authority_boundary.can_claim_domain_ready, false, surface.surface_id);
    assert.equal(surface.authority_boundary.can_claim_app_release_ready, false, surface.surface_id);
    assert.equal(surface.authority_boundary.can_claim_l5, false, surface.surface_id);
    assert.equal(surface.authority_boundary.can_claim_production_ready, false, surface.surface_id);
  }

  for (const forbiddenClaim of [
    'domain_ready',
    'app_release_ready',
    'brand_module_l5_complete',
    'production_ready',
    'quality_or_export_ready',
    'artifact_ready',
    'physical_delete_authorized',
    'owner_receipt_signed',
    'typed_blocker_created',
    'human_gate_decided',
  ]) {
    assert.ok(contract.not_authorized_claims.includes(forbiddenClaim), forbiddenClaim);
  }
});
