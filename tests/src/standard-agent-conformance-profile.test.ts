import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readStandardAgentConformanceProfile } from '../../src/modules/foundry-lab/standard-agent-conformance-profile.ts';
import { buildPhysicalMorphologyChecks } from '../../src/modules/foundry-lab/standard-domain-agent-conformance-physical-morphology.ts';

function fixtureRepo() {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-conformance-profile-'));
  fs.mkdirSync(path.join(repoDir, 'contracts'), { recursive: true });
  fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'contracts', 'standard_agent_conformance_profile.json'), JSON.stringify({
    surface_kind: 'opl_standard_agent_conformance_profile',
    version: 'opl.standard-agent-conformance-profile.v1',
    profile_id: 'example-domain.conformance.v1',
    target_domain_id: 'example-domain',
    golden_path: {
      required_stage_ids: ['intake'],
      allowed_stage_ids: ['intake', 'review'],
      default_stage_id: 'intake',
      forbidden_owner_tokens: ['generic_runtime_owner'],
    },
    physical_morphology: {
      scan_roots: ['src/'],
      allowed_residue_prefixes: ['docs/history/'],
      required_surface_ids: ['domain_entry'],
      surface_classifications: [{ surface_id: 'domain_entry', classification: 'minimal_authority_function' }],
      forbidden_name_tokens: ['generic_runtime_owner'],
      required_parity_gates: ['generated_surface_consumption'],
    },
  }, null, 2));
  return repoDir;
}

test('standard agent conformance profile is domain-owned and fail-closed when missing', () => {
  const missingRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-conformance-missing-'));
  const missing = readStandardAgentConformanceProfile(missingRepo);
  assert.equal(missing.status, 'blocked');
  assert.ok(missing.blockers.includes('standard_agent_conformance_profile_missing'));

  const repoDir = fixtureRepo();
  const resolved = readStandardAgentConformanceProfile(repoDir);
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.profile?.target_domain_id, 'example-domain');
});

test('physical morphology uses profile-declared tokens without domain id branches', () => {
  const repoDir = fixtureRepo();
  fs.writeFileSync(path.join(repoDir, 'src', 'runtime.ts'), 'export const role = "generic_runtime_owner";\n');
  const result = buildPhysicalMorphologyChecks(repoDir, 'any-domain-id');
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.active_forbidden_name_residue.map((entry) => entry.path), ['src/runtime.ts']);
  assert.equal(result.profile_id, 'example-domain.conformance.v1');
});
