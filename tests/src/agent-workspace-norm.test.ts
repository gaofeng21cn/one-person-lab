import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import type { AgentWorkspaceNormContract } from '../../src/kernel/types.ts';
import {
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../src/kernel/standard-agent-registry.ts';
import { validateAgentWorkspaceNorm } from '../../src/modules/charter/contract-validators/agent-workspace-norm-contract.ts';
import { buildAgentWorkspaceNormChecks } from '../../src/modules/workspace/agent-workspace-norm.ts';
import { OPL_WORKSPACE_AGENT_PROFILES } from '../../src/modules/workspace/workspace-agent-defaults.ts';
import { repoRoot } from './cli/helpers.ts';

const contractPath = path.join(repoRoot, 'contracts/opl-framework/agent-workspace-norm-contract.json');

function rawContractFixture() {
  return JSON.parse(fs.readFileSync(contractPath, 'utf8')) as Record<string, any>;
}

function contractFixture() {
  return validateAgentWorkspaceNorm(contractPath, rawContractFixture()) as AgentWorkspaceNormContract;
}

test('workspace agent identity and supported agents derive from the standard-agent registry', () => {
  const rawContract = rawContractFixture();
  const contract = contractFixture();
  const registryAgents = STANDARD_AGENT_REGISTRY.filter((entry) =>
    entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP
  );

  assert.equal('supported_agents' in rawContract, false);
  assert.deepEqual(rawContract.supported_agent_registry, {
    source_ref: 'src/kernel/standard-agent-registry.ts',
    series_membership: 'standard_domain_agent',
  });
  assert.deepEqual(contract.supported_agents, registryAgents.map((entry) => entry.agent_id));
  assert.deepEqual(
    OPL_WORKSPACE_AGENT_PROFILES.map((entry) => ({
      agent_id: entry.agent_id,
      project_id: entry.project_id,
      project: entry.project,
      workspace_kind: entry.workspace_kind,
      project_kind: entry.project_kind,
      default_workspace_id: entry.default_workspace_id,
      default_project_id: entry.default_project_id,
      default_profile_id: entry.default_profile_id,
    })),
    registryAgents.map((entry) => ({
      agent_id: entry.agent_id,
      project_id: entry.domain_id,
      project: entry.project,
      workspace_kind: entry.workspace_profile.workspace_kind,
      project_kind: entry.workspace_profile.project_kind,
      default_workspace_id: entry.workspace_profile.default_workspace_id,
      default_project_id: entry.workspace_profile.default_project_id,
      default_profile_id: entry.workspace_profile.default_profile_id,
    })),
  );

  const extraProfile = rawContractFixture();
  extraProfile.domain_topology_profiles.phantom = structuredClone(extraProfile.domain_topology_profiles.mas);
  assert.throws(
    () => validateAgentWorkspaceNorm(contractPath, extraProfile),
    /domain_topology_profiles/,
  );

  const legacyAlias = rawContractFixture();
  legacyAlias.domain_topology_profiles.mas.project_semantic_aliases = ['study'];
  assert.throws(
    () => validateAgentWorkspaceNorm(contractPath, legacyAlias),
    /domain_topology_profiles\.mas/,
  );
});

test('agent workspace norm validates registry coverage and generic topology constraints', () => {
  const contract = contractFixture();
  assert.deepEqual(buildAgentWorkspaceNormChecks(contract).blockers, []);
  assert.equal(Object.values(contract.domain_topology_profiles).every((profile) =>
    profile.project_collection_path === 'projects'
  ), true);

  const missingProfile = structuredClone(contract);
  delete missingProfile.domain_topology_profiles.mas;
  assert.ok(buildAgentWorkspaceNormChecks(missingProfile).blockers.includes(
    'workspace_domain_topology_profiles_must_match_standard_agent_registry',
  ));

  const invalidTopology = structuredClone(contract);
  invalidTopology.domain_topology_profiles.mas.workspace_mode = 'domain_specific_mode';
  assert.ok(buildAgentWorkspaceNormChecks(invalidTopology).blockers.includes(
    'workspace_domain_topology_profile_generic_contract_drift',
  ));
});
