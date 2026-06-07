import { FrameworkContractError } from './contracts.ts';

export type WorkspaceAgentId = 'mas' | 'mag' | 'rca' | 'oma';

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

export const OPL_WORKSPACE_AGENT_PROFILES: WorkspaceAgentProfile[] = [
  {
    agent_id: 'mas',
    aliases: ['mas', 'medautoscience', 'med-autoscience', 'med_auto_science'],
    project_id: 'medautoscience',
    project: 'med-autoscience',
    label: 'MedAutoScience',
    workspace_kind: 'medical_research_workspace',
    project_kind: 'study',
    default_workspace_id: 'research-workspace',
    default_project_id: 'study-001',
    source: 'admitted_domain_contract',
  },
  {
    agent_id: 'mag',
    aliases: ['mag', 'medautogrant', 'med-autogrant', 'med_auto_grant'],
    project_id: 'medautogrant',
    project: 'med-autogrant',
    label: 'MedAutoGrant',
    workspace_kind: 'grant_authoring_workspace',
    project_kind: 'grant_project',
    default_workspace_id: 'grant-workspace',
    default_project_id: 'grant-001',
    source: 'admitted_domain_contract',
  },
  {
    agent_id: 'rca',
    aliases: ['rca', 'redcube', 'redcube-ai', 'redcube_ai'],
    project_id: 'redcube',
    project: 'redcube-ai',
    label: 'RedCube AI',
    workspace_kind: 'visual_theme_workspace',
    project_kind: 'slide_deck',
    default_workspace_id: 'visual-workspace',
    default_project_id: 'deck-001',
    source: 'admitted_domain_contract',
  },
  {
    agent_id: 'oma',
    aliases: ['oma', 'opl-meta-agent', 'oplmetaagent', 'opl_meta_agent'],
    project_id: 'opl-meta-agent',
    project: 'opl-meta-agent',
    label: 'OPL Meta Agent',
    workspace_kind: 'agent_foundry_workspace',
    project_kind: 'agent_capability',
    default_workspace_id: 'agent-foundry-workspace',
    default_project_id: 'agent-001',
    source: 'opl_generated_agent_contract',
  },
];

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
