import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  STANDARD_AGENT_REGISTRY,
  standardAgentDomainAliasEntries,
} from '../../atlas/public/standard-agent-registry.ts';

export type SkillPackInstallerKind = 'bash' | 'node';
export type SkillPackSourceKind = 'opl_standard_codex_carrier' | 'repo_plugin_installer';
export type SkillPackDistributionRole = 'domain_agent_plugin_pack' | 'framework_capability_plugin_pack';
export type SkillPackSyncScope = 'codex' | 'workspace' | 'quest';
export type StandardAgentSeriesMembership = 'standard_domain_agent';
export type SkillPackSourceKindRole =
  | 'standard_source_model_not_agent_membership_or_status'
  | 'transport_install_detail_not_agent_membership_or_status';
export type SkillPackManagementModel = 'opl_managed_codex_plugin_surface';

export const FRAMEWORK_CAPABILITY_PACKAGE_AUTHORITY_BOUNDARY = {
  can_write_domain_truth: false,
  can_sign_owner_receipt: false,
  can_create_typed_blocker: false,
  can_write_runtime_queue: false,
  can_write_owner_receipt: false,
  can_write_paper_body: false,
  can_write_artifact_authority: false,
  can_authorize_publication_readiness: false,
} as const;

export type SkillPackSpec = {
  domain_id: 'medautoscience' | 'medautogrant' | 'redcube' | 'oplmetaagent' | 'oplbookforge' | 'scholarskills';
  module_id: 'MEDAUTOSCIENCE' | 'MEDAUTOGRANT' | 'REDCUBE' | 'OPLMETAAGENT' | 'OPLBOOKFORGE' | 'SCHOLARSKILLS';
  project: string;
  label: string;
  plugin_name: string;
  canonical_plugin_name: 'mas' | 'mag' | 'rca' | 'oma' | 'obf' | 'mas-scholar-skills';
  source_kind: SkillPackSourceKind;
  distribution_role: SkillPackDistributionRole;
  installer_kind: SkillPackInstallerKind;
  installer_relative_paths: string[];
};

export type InspectFamilySkillPackPluginTransport = {
  surface_kind: 'opl_connect_plugin_transport';
  source_kind: SkillPackSourceKind;
  source_kind_role: SkillPackSourceKindRole;
  standard_codex_carrier: boolean;
  materializer: 'opl_standard_codex_plugin_materializer' | 'repo_plugin_installer';
  primary_skill_projection: {
    canonical_source_path: 'agent/primary_skill/SKILL.md';
    carrier_materialization: 'materialized_full_skill_copy';
    codex_install_requires_real_skill_md: true;
    plugin_skill_may_be_stub_or_pointer: false;
    carrier_is_membership_axis: false;
    carrier_is_status_axis: false;
    carrier_can_claim_domain_ready: false;
    carrier_can_write_domain_truth: false;
  } | null;
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
  agent_package_exposure_model: Record<string, unknown> | null;
  foundry_agent_series: Record<string, unknown>;
  command_surface_spine: Record<string, unknown>;
  mcp_projection: Record<string, unknown>;
  capability_plugin_distribution: Record<string, unknown> | null;
  plugin_transport: InspectFamilySkillPackPluginTransport;
  management_model: SkillPackManagementModel;
  management_model_role: 'unified_management_semantics_transport_may_differ';
  professional_skill_exposure: {
    surface_kind: 'opl_professional_skill_exposure_audit';
    status: 'passed' | 'blocked' | 'skipped';
    capability_map_path: string;
    capability_map_found: boolean;
    professional_skill_count: number;
    repo_internal_professional_skill_count: number;
    default_codex_exposed_count: number;
    expected_exposure_layer: 'repo_internal_professional_skill';
    codex_default_exposure_required: false;
    on_demand_exposure_policy: Record<string, unknown>;
    blockers: string[];
  };
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
  target_root: string | null;
  workspace_or_quest_local_skill_root: string | null;
  codex_discovery_kind:
    | 'codex_home_plugin_registry'
    | 'workspace_or_quest_local_skill';
  installer_result: Record<string, unknown> | null;
  registry_repo_root: string | null;
  stdout: string;
  stderr: string;
};

let cachedFamilySkillPackSpecs: SkillPackSpec[] | null = null;
let cachedDomainAliasMap: Map<string, SkillPackSpec['domain_id']> | null = null;

export function listFamilySkillPackSpecs(): SkillPackSpec[] {
  cachedFamilySkillPackSpecs ??= STANDARD_AGENT_REGISTRY.map((entry) => ({
    domain_id: entry.module_id.toLowerCase() as SkillPackSpec['domain_id'],
    module_id: entry.module_id,
    project: entry.project,
    label: entry.label,
    plugin_name: entry.plugin_name,
    canonical_plugin_name: entry.canonical_plugin_name,
    source_kind: entry.series_membership === 'framework_capability_package'
      ? 'repo_plugin_installer' as const
      : 'opl_standard_codex_carrier' as const,
    distribution_role: entry.series_membership === 'framework_capability_package'
      ? 'framework_capability_plugin_pack' as const
      : 'domain_agent_plugin_pack' as const,
    installer_kind: 'node' as const,
    installer_relative_paths: [],
  }));
  return cachedFamilySkillPackSpecs;
}

function domainAliasMap() {
  cachedDomainAliasMap ??= new Map<string, SkillPackSpec['domain_id']>([
    ...standardAgentDomainAliasEntries().map((entry) => [
      entry.alias,
      entry.module_locator_id as SkillPackSpec['domain_id'],
    ] as const),
  ]);
  return cachedDomainAliasMap;
}

export function normalizeDomainSelection(domains: string[] | undefined) {
  if (!domains || domains.length === 0) {
    return null;
  }

  const normalized = new Set<SkillPackSpec['domain_id']>();
  const aliases = domainAliasMap();
  for (const domain of domains) {
    const key = domain.trim().toLowerCase();
    const resolved = aliases.get(key);
    if (!resolved) {
      throw new FrameworkContractError(
        'cli_usage_error',
        `Unknown skill pack domain: ${domain}.`,
        {
          domain,
          allowed_domains: [...new Set(aliases.keys())].sort(),
        },
      );
    }
    normalized.add(resolved);
  }

  return normalized;
}
