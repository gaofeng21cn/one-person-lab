import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../charter/index.ts';

type StandardDomainAgentEntry = Extract<
  typeof STANDARD_AGENT_REGISTRY[number],
  { series_membership: typeof STANDARD_AGENT_SERIES_MEMBERSHIP }
>;

export type WorkspaceAgentId = StandardDomainAgentEntry['agent_id'];

export type WorkspaceAgentProfile = {
  agent_id: WorkspaceAgentId;
  aliases: string[];
  project_id: string;
  project: string;
  label: string;
  workspace_kind: string;
  project_kind: string;
  default_workspace_id: string;
  default_project_id: string;
  source: 'admitted_domain_contract' | 'opl_generated_agent_contract';
};

type WorkspaceAgentDefaults = Pick<
  WorkspaceAgentProfile,
  'project_id' | 'workspace_kind' | 'project_kind' | 'default_workspace_id' | 'default_project_id' | 'source'
>;

const WORKSPACE_AGENT_DEFAULTS = {
  mas: {
    project_id: 'medautoscience',
    workspace_kind: 'medical_research_workspace',
    project_kind: 'study',
    default_workspace_id: 'research-workspace',
    default_project_id: 'study-001',
    source: 'admitted_domain_contract',
  },
  mag: {
    project_id: 'medautogrant',
    workspace_kind: 'grant_authoring_workspace',
    project_kind: 'grant_project',
    default_workspace_id: 'grant-workspace',
    default_project_id: 'grant-001',
    source: 'admitted_domain_contract',
  },
  rca: {
    project_id: 'redcube',
    workspace_kind: 'visual_theme_workspace',
    project_kind: 'slide_deck',
    default_workspace_id: 'visual-workspace',
    default_project_id: 'deck-001',
    source: 'admitted_domain_contract',
  },
  oma: {
    project_id: 'opl-meta-agent',
    workspace_kind: 'agent_foundry_workspace',
    project_kind: 'agent_capability',
    default_workspace_id: 'agent-foundry-workspace',
    default_project_id: 'agent-001',
    source: 'opl_generated_agent_contract',
  },
  obf: {
    project_id: 'opl-bookforge',
    workspace_kind: 'book_authoring_workspace',
    project_kind: 'book_project',
    default_workspace_id: 'bookforge-workspace',
    default_project_id: 'book-001',
    source: 'opl_generated_agent_contract',
  },
} as const satisfies Record<WorkspaceAgentId, WorkspaceAgentDefaults>;

export const OPL_WORKSPACE_AGENT_PROFILES: WorkspaceAgentProfile[] = STANDARD_AGENT_REGISTRY
  .filter((entry): entry is StandardDomainAgentEntry =>
    entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP
  )
  .map((entry) => ({
    agent_id: entry.agent_id,
    aliases: [...new Set([entry.agent_id, entry.domain_id, entry.domain_alias, entry.work_alias, ...entry.aliases])],
    project: entry.project,
    label: entry.label,
    ...WORKSPACE_AGENT_DEFAULTS[entry.agent_id],
  }));

export function findWorkspaceAgentProfile(value: string | undefined) {
  const requested = value?.trim();
  if (!requested) {
    throw new FrameworkContractError('cli_usage_error', 'workspace init requires --agent.', {
      required: ['--agent'],
      allowed_agents: OPL_WORKSPACE_AGENT_PROFILES.map((entry) => entry.agent_id),
    });
  }
  const normalized = requested.toLowerCase();
  const profile = OPL_WORKSPACE_AGENT_PROFILES.find((entry) => entry.aliases.includes(normalized));
  if (!profile) {
    throw new FrameworkContractError('cli_usage_error', 'workspace init received an unknown OPL family agent.', {
      agent_id: requested,
      allowed_agents: OPL_WORKSPACE_AGENT_PROFILES.map((entry) => entry.agent_id),
    });
  }
  return profile;
}
