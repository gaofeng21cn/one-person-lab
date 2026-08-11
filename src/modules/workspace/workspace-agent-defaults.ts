import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  resolveStandardAgent,
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../kernel/standard-agent-registry.ts';
import {
  assertStandardAgentDescriptorIdentity,
  readStandardAgentDescriptorInterface,
  type StandardAgentInventoryProjection,
  type StandardAgentDescriptorInterface,
} from '../../kernel/standard-agent-interface.ts';
import {
  readStandardAgentDescriptorForDomain,
  resolveStandardAgentContractCheckout,
} from '../connect/index.ts';

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
  project_collection_path: string;
  inventory_projection: StandardAgentInventoryProjection | null;
  default_workspace_id: string;
  default_project_id: string;
  default_profile_id: 'one_off' | 'series' | 'portfolio';
};

function workspaceProfile(
  entry: WorkspaceAgentRegistryEntry,
  descriptor: StandardAgentDescriptorInterface | null = readStandardAgentDescriptorForDomain(entry.target_domain_id),
): WorkspaceAgentProfile {
  const declared = descriptor
    ? assertStandardAgentDescriptorIdentity(descriptor, {
        project: entry.project,
        domain_id: entry.target_domain_id,
      }).interface.workspace_binding
    : null;
  return {
    agent_id: entry.agent_id,
    project_id: entry.domain_id,
    project: entry.project,
    label: entry.label,
    workspace_kind: declared?.workspace_kind ?? 'standard_agent_workspace',
    project_kind: declared?.project_kind ?? 'project',
    project_collection_label: declared?.project_collection_label ?? 'projects',
    project_collection_path: declared?.project_collection_path ?? 'projects',
    inventory_projection: descriptor?.interface.inventory_projection ?? null,
    default_workspace_id: declared?.default_workspace_id ?? `${entry.agent_id}-workspace`,
    default_project_id: declared?.default_project_id ?? `${entry.agent_id}-001`,
    default_profile_id: declared?.default_profile_id ?? 'one_off',
  };
}

export function workspaceAgentProfileForRepo(value: string, repoDir: string) {
  const entry = resolveStandardAgent(value);
  if (!entry || entry.series_membership !== STANDARD_AGENT_SERIES_MEMBERSHIP) {
    return null;
  }
  try {
    return workspaceProfile(entry, readStandardAgentDescriptorInterface(repoDir));
  } catch {
    return null;
  }
}

export function listWorkspaceAgentProfiles(): WorkspaceAgentProfile[] {
  return STANDARD_AGENT_REGISTRY
    .filter((entry): entry is WorkspaceAgentRegistryEntry =>
      entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP
    )
    .map((entry) => workspaceProfile(entry));
}

export function findWorkspaceAgentProfile(value: string | undefined) {
  const requested = value?.trim();
  if (!requested) {
    throw new FrameworkContractError('cli_usage_error', 'workspace init requires --agent.', {
      required: ['--agent'],
      allowed_agents: listWorkspaceAgentProfiles().map((entry) => entry.agent_id),
    });
  }
  const entry = resolveStandardAgent(requested);
  if (!entry || entry.series_membership !== STANDARD_AGENT_SERIES_MEMBERSHIP) {
    throw new FrameworkContractError('cli_usage_error', 'workspace init received an unknown OPL family agent.', {
      agent_id: requested,
      allowed_agents: listWorkspaceAgentProfiles().map((entry) => entry.agent_id),
    });
  }
  const descriptor = readStandardAgentDescriptorForDomain(entry.target_domain_id);
  if (descriptor) {
    return workspaceProfile(entry, descriptor);
  }
  const resolution = resolveStandardAgentContractCheckout(
    entry.target_domain_id,
    undefined,
    undefined,
    { result: 'typed_resolution' },
  );
  if (resolution.status === 'resolved' && resolution.checkout) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'The selected Standard Agent checkout does not expose a valid contracts/domain_descriptor.json.',
      {
        agent_id: entry.agent_id,
        checkout_path: resolution.checkout.checkout_path,
        source_kind: resolution.checkout.source_kind,
      },
    );
  }
  if (
    resolution.status === 'blocked'
    && !['managed_package_not_installed', 'managed_package_status_unavailable'].includes(resolution.reason ?? '')
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'The selected or installed Standard Agent contract checkout is unavailable.',
      {
        agent_id: entry.agent_id,
        reason: resolution.reason,
        source_status: resolution.source_status,
      },
    );
  }
  return workspaceProfile(entry, null);
}
