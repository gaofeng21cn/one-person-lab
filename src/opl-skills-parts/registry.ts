import path from 'node:path';

import { FrameworkContractError } from '../contracts.ts';
import {
  STANDARD_AGENT_REGISTRY,
  standardAgentDomainAliasEntries,
} from '../standard-agent-registry.ts';

export type SkillPackInstallerKind = 'bash' | 'node';
export type SkillPackSourceKind = 'repo_plugin_installer' | 'opl_generated_plugin_surface';
export type SkillPackDistributionRole = 'domain_agent_plugin_pack' | 'framework_capability_plugin_pack';
export type SkillPackSyncScope = 'project' | 'codex' | 'workspace' | 'quest';
export type SkillPackTargetProject = 'medautoscience';
export type StandardAgentSeriesMembership = 'standard_domain_agent';
export type SkillPackSourceKindRole = 'transport_install_detail_not_agent_membership_or_status';

export type SkillPackSpec = {
  domain_id: 'medautoscience' | 'medautogrant' | 'redcube' | 'oplmetaagent' | 'oplbookforge' | 'scholarskills';
  module_id: 'MEDAUTOSCIENCE' | 'MEDAUTOGRANT' | 'REDCUBE' | 'OPLMETAAGENT' | 'OPLBOOKFORGE' | 'SCHOLARSKILLS';
  project: string;
  label: string;
  plugin_name: string;
  canonical_plugin_name: 'mas' | 'mag' | 'rca' | 'opl-meta-agent' | 'opl-bookforge' | 'mas-scholar-skills';
  source_kind: SkillPackSourceKind;
  distribution_role: SkillPackDistributionRole;
  installer_kind: SkillPackInstallerKind;
  installer_relative_paths: string[];
};

export type InspectFamilySkillPackPluginTransport = {
  surface_kind: 'opl_connect_plugin_transport';
  source_kind: SkillPackSourceKind;
  source_kind_role: SkillPackSourceKindRole;
  repo_plugin_installer: boolean;
  opl_generated_plugin_surface: boolean;
  generated_skill_surface_ready: boolean;
  generated_skill_surface_status: string | null;
  installer_kind: SkillPackInstallerKind;
  command_preview: string[];
  generation_preview_command: string[] | null;
  public_agent_list_must_not_split_by_transport: boolean;
};

export type InspectFamilySkillPack = {
  domain_id: string;
  project: string;
  label: string;
  plugin_name: string;
  canonical_plugin_name: string;
  distribution_role: SkillPackDistributionRole;
  agent_series_membership: StandardAgentSeriesMembership | null;
  agent_projection_policy: {
    standard_membership: StandardAgentSeriesMembership;
    plugin_transport_is_membership_axis: false;
    plugin_transport_is_status_axis: false;
    generated_surface_is_membership_axis: false;
    generated_surface_is_status_axis: false;
  } | null;
  foundry_agent_series: Record<string, unknown>;
  command_surface_spine: Record<string, unknown>;
  mcp_projection: Record<string, unknown>;
  capability_plugin_distribution: Record<string, unknown> | null;
  mas_scholar_skills_profile: Record<string, unknown> | null;
  plugin_transport: InspectFamilySkillPackPluginTransport;
  plugin_source_path: string;
  repo_root: string;
  repo_found: boolean;
  plugin_manifest_path: string;
  plugin_manifest_found: boolean;
  plugin_manifest_valid: boolean;
  plugin_manifest_errors: string[];
  skill_entry_path: string;
  skill_entry_found: boolean;
  skill_entry_valid: boolean;
  skill_entry_errors: string[];
  installer_path: string;
  installer_found: boolean;
  source_kind: SkillPackSourceKind;
  source_kind_role: SkillPackSourceKindRole;
  generated_skill_surface_ready: boolean;
  generated_skill_surface_status: string | null;
  ready_to_sync: boolean;
  installer_kind: SkillPackInstallerKind;
  command_preview: string[];
};

export type SyncFamilySkillPack = InspectFamilySkillPack & {
  sync_status: 'synced' | 'skipped';
  sync_scope: SkillPackSyncScope;
  target_scope: SkillPackSyncScope;
  target_project: SkillPackTargetProject | null;
  target_root: string | null;
  workspace_or_quest_local_skill_root: string | null;
  codex_discovery_kind:
    | 'codex_home_plugin_registry'
    | 'project_local_plugin_mirror'
    | 'workspace_or_quest_local_skill';
  project_mirror_deprecated_for_paper_execution: boolean;
  project_mirror_non_default_paper_execution_path: boolean;
  installer_result: Record<string, unknown> | null;
  registry_repo_root: string | null;
  stdout: string;
  stderr: string;
};

export const FAMILY_SKILL_PACK_SPECS: SkillPackSpec[] = [
  ...STANDARD_AGENT_REGISTRY
    .filter((entry) => entry.agent_id !== 'mas-scholar-skills')
    .map((entry) => ({
      domain_id: entry.domain_id,
      module_id: entry.module_id,
      project: entry.project,
      label: entry.label,
      plugin_name: entry.plugin_name,
      canonical_plugin_name: entry.canonical_plugin_name,
      source_kind: entry.source_kind,
      distribution_role: 'domain_agent_plugin_pack' as const,
      installer_kind: entry.installer_kind,
      installer_relative_paths: entry.installer_relative_paths.map((relativePath) => path.join(...relativePath.split('/'))),
    })),
  {
    domain_id: 'scholarskills',
    module_id: 'SCHOLARSKILLS',
    project: 'mas-scholar-skills',
    label: 'MAS Scholar Skills',
    plugin_name: 'mas-scholar-skills',
    canonical_plugin_name: 'mas-scholar-skills',
    source_kind: 'repo_plugin_installer',
    distribution_role: 'framework_capability_plugin_pack',
    installer_kind: 'node',
    installer_relative_paths: [],
  },
];

const DOMAIN_ALIAS_MAP = new Map<string, SkillPackSpec['domain_id']>([
  ...standardAgentDomainAliasEntries().map((entry) => [
    entry.alias,
    entry.domain_id as SkillPackSpec['domain_id'],
  ] as const),
  ['scholarskills', 'scholarskills'],
  ['scholar-skills', 'scholarskills'],
  ['scholar_skills', 'scholarskills'],
  ['mas-scholar-skills', 'scholarskills'],
  ['mas_scholar_skills', 'scholarskills'],
  ['opl-scholarskills', 'scholarskills'],
  ['opl_scholarskills', 'scholarskills'],
]);

export function normalizeDomainSelection(domains: string[] | undefined) {
  if (!domains || domains.length === 0) {
    return null;
  }

  const normalized = new Set<SkillPackSpec['domain_id']>();
  for (const domain of domains) {
    const key = domain.trim().toLowerCase();
    const resolved = DOMAIN_ALIAS_MAP.get(key);
    if (!resolved) {
      throw new FrameworkContractError(
        'cli_usage_error',
        `Unknown skill pack domain: ${domain}.`,
        {
          domain,
          allowed_domains: [...new Set(DOMAIN_ALIAS_MAP.keys())].sort(),
        },
      );
    }
    normalized.add(resolved);
  }

  return normalized;
}
