import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import type { AgentWorkspaceNormContract } from '../../src/kernel/types.ts';
import {
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../src/kernel/standard-agent-registry.ts';
import { assertStandardAgentDescriptorIdentity } from '../../src/kernel/standard-agent-interface.ts';
import { validateAgentWorkspaceNorm } from '../../src/modules/charter/contract-validators/agent-workspace-norm-contract.ts';
import { readStandardAgentDescriptorForDomain } from '../../src/modules/connect/index.ts';
import {
  buildAgentWorkspaceNormChecks,
  buildAgentWorkspaceNormProjection,
} from '../../src/modules/workspace/agent-workspace-norm.ts';
import { listWorkspaceAgentProfiles } from '../../src/modules/workspace/workspace-agent-defaults.ts';
import { profileFromTopologyContract } from '../../src/modules/workspace/workspace-topology.ts';
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
  assert.equal('domain_topology_profiles' in rawContract, false);
  assert.deepEqual(contract.supported_agents, registryAgents.map((entry) => entry.agent_id));
  const workspaceAgentProfiles = listWorkspaceAgentProfiles();
  const expectedProfiles = registryAgents.map((entry) => {
    const descriptor = readStandardAgentDescriptorForDomain(entry.target_domain_id);
    const declared = descriptor
      ? assertStandardAgentDescriptorIdentity(descriptor, {
          project: entry.project,
          domain_id: entry.target_domain_id,
        }).interface.workspace_binding
      : null;
    return {
      agent_id: entry.agent_id,
      project_id: entry.target_domain_id,
      project: entry.project,
      workspace_kind: declared?.workspace_kind ?? 'standard_agent_workspace',
      project_kind: declared?.project_kind ?? 'project',
      default_workspace_id: declared?.default_workspace_id ?? `${entry.agent_id}-workspace`,
      default_project_id: declared?.default_project_id ?? `${entry.agent_id}-001`,
      default_profile_id: declared?.default_profile_id ?? 'one_off',
    };
  });
  assert.deepEqual(
    workspaceAgentProfiles.map((entry) => ({
      agent_id: entry.agent_id,
      project_id: entry.project_id,
      project: entry.project,
      workspace_kind: entry.workspace_kind,
      project_kind: entry.project_kind,
      default_workspace_id: entry.default_workspace_id,
      default_project_id: entry.default_project_id,
      default_profile_id: entry.default_profile_id,
    })),
    expectedProfiles,
  );

  for (const agent of workspaceAgentProfiles) {
    const profile = profileFromTopologyContract(agent.default_profile_id);
    assert.deepEqual(
      buildAgentWorkspaceNormProjection({ contract, agentId: agent.agent_id }).domain_topology_profile,
      {
        profile: agent.default_profile_id,
        workspace_mode: profile.workspace_mode,
        project_kind: agent.project_kind,
        project_collection_path: profile.project_collection_path,
        canonical_project_collection_role: 'project_units',
        user_inspection_roots: [
          `${profile.project_collection_path}/<project-id>/${profile.project_stage_outputs_root}`,
        ],
        shared_resource_roots: profile.shared_resource_roots,
      },
    );
  }
});

test('agent workspace norm validates registry coverage and generic topology constraints', () => {
  const contract = contractFixture();
  assert.deepEqual(buildAgentWorkspaceNormChecks(contract).blockers, []);

  const divergentProfileList = rawContractFixture();
  divergentProfileList.domain_topology_profiles = {
    mas: {
      profile: 'one_off',
      workspace_mode: 'one_off',
      project_kind: 'not_a_study',
      shared_resource_roots: ['wrong/root'],
    },
  };
  assert.throws(
    () => validateAgentWorkspaceNorm(contractPath, divergentProfileList),
    /agent-workspace-norm-contract\.json/,
  );
});
