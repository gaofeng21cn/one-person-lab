import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  matchesStandardDomainAgentCatalogEntry,
  normalizeStandardDomainAgentId,
  standardDomainAgentFamilyProjection,
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../src/kernel/standard-agent-registry.ts';
import { OFFICIAL_KNOWLEDGE_DELIVERABLE_QUALITY_PROFILE } from '../../src/modules/pack/standard-agent-stage-manifest.ts';
import {
  CANONICAL_OPL_PACKAGE_IDS,
  canonicalAgentPackageId,
} from '../../src/modules/connect/agent-package-identity.ts';
import { getOplPackageSpecs } from '../../src/modules/connect/package-distribution.ts';
import { resolveOplDomainModuleSpec } from '../../src/modules/connect/system-installation/modules.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');

function nativeHelperContract() {
  return JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/native-helper-contract.json'),
    'utf8',
  )) as {
    owner_split: {
      domain_truth_owners: string[];
      domain_truth_owner_registry: {
        source_ref: string;
        series_membership: string;
        projection_field: string;
      };
    };
  };
}

test('native helper owner split derives all standard domain agents from the registry', () => {
  const contract = nativeHelperContract();
  const standardAgents = STANDARD_AGENT_REGISTRY.filter((entry) =>
    entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP
  );

  assert.deepEqual(contract.owner_split.domain_truth_owners, standardAgents.map((entry) => entry.project));
  assert.deepEqual(contract.owner_split.domain_truth_owner_registry, {
    source_ref: 'src/kernel/standard-agent-registry.ts',
    series_membership: 'standard_domain_agent',
    projection_field: 'project',
  });
});

test('standard Agent family labels never mix compact and full product names', () => {
  assert.deepEqual(standardDomainAgentFamilyProjection('compact').labels, [
    'MAS', 'MAG', 'RCA', 'OMA', 'OBF',
  ]);
  assert.deepEqual(standardDomainAgentFamilyProjection('full').labels, [
    'Med Auto Science',
    'Med Auto Grant',
    'RedCube AI',
    'OPL Meta Agent',
    'OPL Book Forge',
  ]);
  assert.equal(
    new Set<string>(standardDomainAgentFamilyProjection('full').labels).has('BookForge'),
    false,
  );
});

test('package and module aliases derive standard agents without promoting ScholarSkills', () => {
  const standardAgents = STANDARD_AGENT_REGISTRY.filter((entry) =>
    entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP
  );

  for (const agent of standardAgents) {
    for (const alias of [agent.agent_id, agent.domain_id, agent.project, agent.plugin_name, ...agent.aliases]) {
      assert.equal(canonicalAgentPackageId(alias), agent.agent_id, alias);
      assert.equal(normalizeStandardDomainAgentId(alias), agent.target_domain_id, alias);
    }
  }

  assert.equal(canonicalAgentPackageId('mas-scholar-skills'), 'mas-scholar-skills');
  assert.equal(normalizeStandardDomainAgentId('mas-scholar-skills'), 'mas-scholar-skills');
  assert.equal(resolveOplDomainModuleSpec('oma').module_id, 'oplmetaagent');
  assert.equal(resolveOplDomainModuleSpec('bookforge').module_id, 'oplbookforge');
  assert.equal(matchesStandardDomainAgentCatalogEntry('rca', {
    project_id: 'redcube',
    project: 'redcube-ai',
  }), true);
  assert.equal(matchesStandardDomainAgentCatalogEntry('oma', {
    project_id: 'oplmetaagent',
    project: 'opl-meta-agent',
  }), true);
  assert.equal(matchesStandardDomainAgentCatalogEntry('mas-scholar-skills', {
    project_id: 'scholarskills',
    project: 'mas-scholar-skills',
  }), false);
});

test('canonical App-state package identities match the release package specs', () => {
  assert.deepEqual(
    getOplPackageSpecs().map((spec) => spec.package_id),
    [...CANONICAL_OPL_PACKAGE_IDS],
  );
});

test('official quality governance stays outside the identity registry', () => {
  const qualityGoverned = STANDARD_AGENT_REGISTRY
    .filter((entry) => 'quality_governance_profile' in entry)
    .map((entry) => entry.agent_id);
  assert.deepEqual(qualityGoverned, []);
  assert.equal(OFFICIAL_KNOWLEDGE_DELIVERABLE_QUALITY_PROFILE.profile_id,
    'official_high_value_knowledge_deliverable.v1');
  const scholarSkills = STANDARD_AGENT_REGISTRY.find((entry) => entry.agent_id === 'mas-scholar-skills');
  assert.equal(scholarSkills && 'quality_governance_profile' in scholarSkills, false);
});
