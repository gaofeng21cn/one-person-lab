import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import type { AgentWorkspaceNormContract } from '../../src/kernel/types.ts';
import { buildAgentWorkspaceNormChecks } from '../../src/modules/workspace/agent-workspace-norm.ts';
import { repoRoot } from './cli/helpers.ts';

function contractFixture() {
  return JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/agent-workspace-norm-contract.json'),
    'utf8',
  )) as AgentWorkspaceNormContract;
}

test('agent workspace norm validates registry coverage and generic topology constraints', () => {
  const contract = contractFixture();
  assert.deepEqual(buildAgentWorkspaceNormChecks(contract).blockers, []);

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
