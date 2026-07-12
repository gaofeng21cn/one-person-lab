import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  resolveStandardAgent,
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../kernel/standard-agent-registry.ts';
import { assertStandardAgentDescriptorIdentity } from '../../kernel/standard-agent-interface.ts';
import { readStandardAgentDescriptorForDomain } from '../connect/index.ts';

type WorkspaceAgentRegistryEntry = Extract<
  typeof STANDARD_AGENT_REGISTRY[number],
  { series_membership: typeof STANDARD_AGENT_SERIES_MEMBERSHIP }
>;

export type WorkspaceAgentId = WorkspaceAgentRegistryEntry['agent_id'];

export type WorkspaceAgentProfile = {
  agent_id: WorkspaceAgentId;
  project_id: string;
  project: string;
  label: string;
  workspace_kind: string;
  project_kind: string;
  project_collection_label: string;
  default_workspace_id: string;
  default_project_id: string;
  default_profile_id: 'one_off' | 'series' | 'portfolio';
};

function workspaceProfile(entry: WorkspaceAgentRegistryEntry): WorkspaceAgentProfile {
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
    label: entry.label,
    workspace_kind: declared?.workspace_kind ?? 'standard_agent_workspace',
    project_kind: declared?.project_kind ?? 'project',
    project_collection_label: declared?.project_collection_label ?? 'projects',
    default_workspace_id: declared?.default_workspace_id ?? `${entry.agent_id}-workspace`,
    default_project_id: declared?.default_project_id ?? `${entry.agent_id}-001`,
    default_profile_id: declared?.default_profile_id ?? 'one_off',
  };
}

export const OPL_WORKSPACE_AGENT_PROFILES: WorkspaceAgentProfile[] = STANDARD_AGENT_REGISTRY
  .filter((entry): entry is WorkspaceAgentRegistryEntry =>
    entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP
  )
  .map(workspaceProfile);

export function findWorkspaceAgentProfile(value: string | undefined) {
  const requested = value?.trim();
  if (!requested) {
    throw new FrameworkContractError('cli_usage_error', 'workspace init requires --agent.', {
      required: ['--agent'],
      allowed_agents: OPL_WORKSPACE_AGENT_PROFILES.map((entry) => entry.agent_id),
    });
  }
  const entry = resolveStandardAgent(requested);
  if (!entry || entry.series_membership !== STANDARD_AGENT_SERIES_MEMBERSHIP) {
    throw new FrameworkContractError('cli_usage_error', 'workspace init received an unknown OPL family agent.', {
      agent_id: requested,
      allowed_agents: OPL_WORKSPACE_AGENT_PROFILES.map((entry) => entry.agent_id),
    });
  }
  return workspaceProfile(entry);
}
