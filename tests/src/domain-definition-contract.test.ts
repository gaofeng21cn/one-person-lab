import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const domainsPath = path.join(repoRoot, 'contracts', 'opl-gateway', 'domains.json');

type DomainDefinition = {
  domain_id: string;
  independent_domain_agent?: {
    agent_id?: string;
    opl_top_level_domain_agent?: boolean;
  };
  single_app_skill?: {
    skill_id?: string;
  };
  domain_truth_owner?: string[];
  opl_projection_role?: string[];
  runtime_dependency_boundary?: {
    opl_dependency?: string;
    opl_truth_write_policy?: string;
    backend_companions?: Array<Record<string, unknown>>;
  };
  legacy_boundary_terms?: {
    gateway_surface?: string;
    harness_surface?: string;
  };
};

function readDomainsContract() {
  return JSON.parse(fs.readFileSync(domainsPath, 'utf8')) as {
    version: string;
    domains: DomainDefinition[];
  };
}

test('domains.json g2 keeps legacy gateway and harness terms out of active domain fields', () => {
  const payload = readDomainsContract();

  assert.equal(payload.version, 'g2');
  assert.equal(Array.isArray(payload.domains), true);
  for (const domain of payload.domains) {
    assert.equal(Object.prototype.hasOwnProperty.call(domain, 'gateway_surface'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(domain, 'harness_surface'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(domain, 'canonical_truth_owner'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(domain, 'role'), false);
    assert.equal(typeof domain.independent_domain_agent?.agent_id, 'string');
    assert.equal(domain.independent_domain_agent?.opl_top_level_domain_agent, true);
    assert.equal(typeof domain.single_app_skill?.skill_id, 'string');
    assert.equal(Array.isArray(domain.domain_truth_owner), true);
    assert.equal(Array.isArray(domain.opl_projection_role), true);
    assert.equal(domain.runtime_dependency_boundary?.opl_dependency, 'projection_consumer_only');
    assert.equal(domain.runtime_dependency_boundary?.opl_truth_write_policy, 'no_domain_truth_writes');
    assert.equal(typeof domain.legacy_boundary_terms?.gateway_surface, 'string');
    assert.equal(typeof domain.legacy_boundary_terms?.harness_surface, 'string');
  }
});

test('MedAutoScience g2 definition owns research truth while MDS remains a MAS backend companion', () => {
  const payload = readDomainsContract();
  const mas = payload.domains.find((domain) => domain.domain_id === 'medautoscience');

  assert.ok(mas);
  assert.equal(mas.independent_domain_agent?.agent_id, 'mas');
  assert.equal(mas.single_app_skill?.skill_id, 'mas');
  assert.deepEqual(mas.domain_truth_owner, [
    'study_truth',
    'runtime_health',
    'publication_judgment',
    'ai_reviewer_quality_artifacts',
    'artifact_authority',
    'user_visible_progress',
  ]);
  assert.deepEqual(mas.opl_projection_role, [
    'consume_session_projections',
    'consume_progress_projections',
    'consume_artifact_projections',
    'consume_runtime_projections',
  ]);
  assert.deepEqual(mas.runtime_dependency_boundary?.backend_companions, [
    {
      project: 'med-deepscientist',
      role: 'mas_controlled_backend_oracle_intake_buffer',
      controlled_by: 'med-autoscience',
      opl_top_level_domain_agent: false,
    },
  ]);
});
