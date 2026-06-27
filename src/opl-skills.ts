import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from './contracts.ts';
import { syncOplCompanionSkills, type OplCompanionSkillApplyMode, type OplSuperpowersProfile } from './install-companions.ts';
import {
  registerOplFamilyCodexPlugins,
  type CodexPluginRegistryPackId,
} from './system-installation/codex-plugin-registry.ts';
import {
  resolveDefaultFamilyWorkspaceRoot as resolveDefaultFamilyWorkspaceRootImpl,
  resolveFamilyWorkspaceRootFromRepoRoot as resolveFamilyWorkspaceRootFromRepoRootImpl,
} from './family-workspace-root.ts';
import {
  inspectGeneratedSkillSurface,
  writeOplGeneratedPluginSurface,
} from './opl-skills-parts/generated-plugin.ts';
import {
  buildInstallerCommandPreview,
  buildInstallerPath,
  buildPluginManifestPath,
  buildPluginSourcePath,
  buildSkillEntryPath,
  normalizeOptionalString,
  resolveCodexHome,
  resolveRepoRoot,
} from './opl-skills-parts/paths.ts';
import {
  FAMILY_SKILL_PACK_SPECS,
  normalizeDomainSelection,
  type InspectFamilySkillPack,
  type InspectFamilySkillPackPluginTransport,
  type SkillPackSyncScope,
  type SkillPackTargetProject,
  type SkillPackSpec,
  type SyncFamilySkillPack,
} from './opl-skills-parts/registry.ts';
import { runSkillPackInstaller } from './opl-skills-parts/sync.ts';
import {
  STANDARD_AGENT_REGISTRY_REF,
  resolveStandardAgentByCanonicalPluginName,
} from './standard-agent-registry.ts';

export const resolveDefaultFamilyWorkspaceRoot = resolveDefaultFamilyWorkspaceRootImpl;
export const resolveFamilyWorkspaceRootFromRepoRoot = resolveFamilyWorkspaceRootFromRepoRootImpl;

type ReadFamilySkillPacksOptions = {
  domains?: string[];
};

type SyncFamilySkillPacksOptions = ReadFamilySkillPacksOptions & {
  home?: string;
  scope?: SkillPackSyncScope;
  targetProject?: string;
  targetWorkspace?: string;
  targetQuest?: string;
  targetRoot?: string;
  companionMode?: OplCompanionSkillApplyMode;
  superpowersProfile?: OplSuperpowersProfile;
};

const FOUNDRY_AGENT_SERIES_CONTRACT_REF = 'contracts/opl-framework/foundry-agent-series-contract.json';
const FOUNDRY_AGENT_SERIES_CONTRACT_URL = new URL(
  '../contracts/opl-framework/foundry-agent-series-contract.json',
  import.meta.url,
);
let cachedFoundryAgentSeriesContract: Record<string, unknown> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFoundryAgentSeriesContract() {
  if (!cachedFoundryAgentSeriesContract) {
    const contract = JSON.parse(
      fs.readFileSync(FOUNDRY_AGENT_SERIES_CONTRACT_URL, 'utf8'),
    ) as unknown;
    if (!isRecord(contract)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Foundry Agent series contract must contain an object root.',
        { file: FOUNDRY_AGENT_SERIES_CONTRACT_REF },
      );
    }
    cachedFoundryAgentSeriesContract = contract;
  }
  return cachedFoundryAgentSeriesContract;
}

function readObjectField(source: Record<string, unknown>, field: string) {
  const value = source[field];
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Foundry Agent series contract is missing object field: ${field}.`,
      { file: FOUNDRY_AGENT_SERIES_CONTRACT_REF, field },
    );
  }
  return value;
}

function readStringField(source: Record<string, unknown>, field: string) {
  const value = source[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Foundry Agent series contract is missing string field: ${field}.`,
      { file: FOUNDRY_AGENT_SERIES_CONTRACT_REF, field },
    );
  }
  return value.trim();
}

function readStringListField(source: Record<string, unknown>, field: string) {
  const value = source[field];
  if (!Array.isArray(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Foundry Agent series contract is missing string list field: ${field}.`,
      { file: FOUNDRY_AGENT_SERIES_CONTRACT_REF, field },
    );
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'string' || !entry.trim()) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        `Foundry Agent series contract is missing string field: ${field}[${index}].`,
        { file: FOUNDRY_AGENT_SERIES_CONTRACT_REF, field: `${field}[${index}]` },
      );
    }
    return entry.trim();
  });
}

function readBooleanField(source: Record<string, unknown>, field: string) {
  const value = source[field];
  if (typeof value !== 'boolean') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Foundry Agent series contract is missing boolean field: ${field}.`,
      { file: FOUNDRY_AGENT_SERIES_CONTRACT_REF, field },
    );
  }
  return value;
}

function buildFoundryAgentSeriesProjection(spec: SkillPackSpec) {
  if (spec.distribution_role !== 'domain_agent_plugin_pack') {
    return {
      foundry_agent_series: {},
      command_surface_spine: {},
      mcp_projection: {},
      legacy_implementation_bucket_policy: {},
    };
  }

  const contract = readFoundryAgentSeriesContract();
  const commandSurface = readObjectField(contract, 'agent_cli_command_surface_policy');
  const skillMcp = readObjectField(contract, 'skill_mcp_surface_policy');
  const retirement = readObjectField(contract, 'legacy_implementation_bucket_retirement_policy');
  const versionPolicy = readObjectField(contract, 'contract_version_policy');
  const policyRelease = readObjectField(contract, 'shared_policy_release');
  const standardAgent = resolveStandardAgentByCanonicalPluginName(spec.canonical_plugin_name);
  if (!standardAgent) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Domain agent skill pack is missing from the StandardAgentRegistry: ${spec.canonical_plugin_name}.`,
      {
        canonical_plugin_name: spec.canonical_plugin_name,
      },
    );
  }
  const foundryAgentId = standardAgent.agent_id;
  const brandCli = standardAgent.brand_cli;
  const workAlias = standardAgent.work_alias;
  const ordinaryOperations = readStringListField(commandSurface, 'ordinary_operations');
  const ordinarySpine = readStringListField(commandSurface, 'ordinary_public_command_surface_spine');
  const defaultFoundryCommandSurface = `opl foundry agents inspect ${foundryAgentId}`;
  const seriesFoundryOperations = ordinaryOperations.map((operation) => `opl agents foundry ${operation}`);

  return {
    foundry_agent_series: {
      series_id: 'opl_foundry_agent_series.v1',
      series_label: readStringField(commandSurface, 'agent_cli_series_label'),
      foundry_agent_id: foundryAgentId,
      domain_id: spec.domain_id,
      series_membership: 'standard_domain_agent',
      canonical_command_surface: readStringField(commandSurface, 'canonical_opl_command_surface'),
      product_model: readStringField(contract, 'product_model'),
      series_contract_ref: FOUNDRY_AGENT_SERIES_CONTRACT_REF,
      standard_agent_registry_ref: STANDARD_AGENT_REGISTRY_REF,
      domain_contract_ref: readStringField(versionPolicy, 'domain_contract_ref'),
      policy_release_ref: readStringField(policyRelease, 'policy_release_contract_ref'),
      brand_cli: brandCli,
      default_foundry_command_surface: defaultFoundryCommandSurface,
      ordinary_golden_path: standardAgent.ordinary_golden_path,
    },
    command_surface_spine: {
      surface_kind: 'opl_foundry_agent_skill_command_surface_spine_projection',
      ordinary_public_command_surface_spine: ordinarySpine,
      ordinary_operations: ordinaryOperations,
      default_foundry_operations: seriesFoundryOperations,
      work_alias: workAlias,
      work_alias_command_pattern: defaultFoundryCommandSurface,
      required_public_surface_derivatives: readStringListField(commandSurface, 'required_public_surface_derivatives'),
      skill_sync_command_surface: readStringField(skillMcp, 'canonical_skill_sync_command_surface'),
      skill_inspect_command_surface: readStringField(skillMcp, 'canonical_skill_connect_command_surface'),
      foundry_agent_inspect_command_surface: `opl foundry agents inspect ${foundryAgentId}`,
      agent_cli_must_use_series_spine: readBooleanField(commandSurface, 'agent_cli_must_use_series_spine'),
      agent_cli_must_not_replicate_top_level_modules: readBooleanField(
        commandSurface,
        'agent_cli_must_not_replicate_top_level_modules',
      ),
    },
    mcp_projection: {
      surface_kind: 'opl_foundry_agent_mcp_delegate_projection',
      descriptor_ref: readStringField(skillMcp, 'canonical_mcp_projection_ref'),
      mcp_descriptor_must_delegate_to_series_spine: readBooleanField(
        skillMcp,
        'mcp_descriptor_must_delegate_to_series_spine',
      ),
      series_delegate_tool_refs: [
        'opl agents foundry interfaces',
        'opl agents foundry status',
        `opl foundry agents inspect ${foundryAgentId}`,
      ],
      legacy_standalone_mcp_servers_retired: readBooleanField(
        skillMcp,
        'legacy_standalone_mcp_servers_retired',
      ),
      plugin_registry_is_canonical_transport: true,
    },
    legacy_implementation_bucket_policy: {
      surface_kind: 'opl_foundry_agent_legacy_bucket_policy_projection',
      ordinary_public_command_surface_allowed: readBooleanField(retirement, 'ordinary_public_command_surface_allowed'),
      replacement_command_surface: readStringField(retirement, 'replacement_command_surface'),
      retired_bucket_prefixes: readStringListField(retirement, 'retired_bucket_prefixes'),
      allowed_retained_read_surfaces: readStringListField(retirement, 'allowed_retained_read_surfaces'),
    },
  };
}

function buildCapabilityPluginDistribution(spec: SkillPackSpec) {
  if (spec.domain_id !== 'scholarskills') {
    return null;
  }

  return {
    surface_kind: 'opl_framework_capability_plugin_distribution',
    capability_plugin_id: 'opl-scholarskills',
    distribution_role: spec.distribution_role,
    ownership_kind: 'framework_capability_plugin',
    source_of_truth: [
      'opl-scholarskills/.codex-plugin/plugin.json',
      'opl-scholarskills/skills/opl-scholarskills/SKILL.md',
      'opl-scholarskills/contracts/scholar-skills-capability-modules.json',
      'one-person-lab/contracts/opl-framework/scholar-skills-capability-modules.json',
    ],
    github_repo: 'gaofeng21cn/opl-scholarskills',
    ordinary_install_update_source: 'ghcr_agent_package_channel',
    package_channel_manifest_ref: 'ghcr.io/<owner>/one-person-lab-manifest:<tag>',
    package_artifact_ref: 'ghcr.io/<owner>/one-person-lab-modules/opl-scholarskills:<opl_version>',
    developer_checkout_source: 'Developer Mode or explicit OPL_SCHOLARSKILLS_REPO_ROOT / OPL_MODULE_PATH_SCHOLARSKILLS',
    connect_readback_commands: [
      'opl connect skills --domain scholarskills --json',
      'opl connect sync-skills --domain scholarskills --scope workspace --target-workspace <workspace-root> --json',
      'opl connect sync-skills --domain scholarskills --scope quest --target-quest <quest-root> --json',
      'opl connect sync-skills --domain scholarskills --scope project --target-project medautoscience --json',
      'opl connect sync-skills --domain scholarskills --scope codex --json',
    ],
    default_sync_scope: 'none_without_explicit_workspace_or_quest_target',
    default_target_project: null,
    recommended_paper_execution_scopes: ['workspace', 'quest'],
    project_mirror_deprecated_for_paper_execution: true,
    project_mirror_non_default_paper_execution_path: true,
    project_scope_requires_explicit_request: true,
    codex_scope_requires_explicit_request: true,
    framework_owned_capability: true,
    domain_module: false,
    brand_module: false,
    authority_boundary: {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
    },
    note: 'OPL ScholarSkills is an OPL-owned standalone capability plugin pack. It is not a MAS/MAG/RCA/BookForge domain module and is not an additional OPL brand module.',
  };
}

function normalizeFrontmatterScalar(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.replace(/^['"]|['"]$/g, '').trim();
}

function readSkillFrontmatter(content: string) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  const frontmatter = match?.[1] ?? '';
  const body = match ? content.slice(match[0].length) : content;
  const name = normalizeFrontmatterScalar(frontmatter.match(/^name:\s*(.+)$/m)?.[1]);
  const description = normalizeFrontmatterScalar(frontmatter.match(/^description:\s*(.+)$/m)?.[1]);

  return { name, description, body };
}

function validateSkillEntry(spec: SkillPackSpec, skillEntryPath: string, skillEntryFound: boolean) {
  const errors: string[] = [];

  if (!skillEntryFound) {
    return { valid: false, errors };
  }

  let content = '';
  try {
    content = fs.readFileSync(skillEntryPath, 'utf8');
  } catch (error) {
    return {
      valid: false,
      errors: [`failed_to_read_skill_entry:${error instanceof Error ? error.message : String(error)}`],
    };
  }

  const { name, description, body } = readSkillFrontmatter(content);
  if (name !== spec.canonical_plugin_name) {
    errors.push(`skill_name_mismatch:${name || '<missing>'}`);
  }
  if (!description) {
    errors.push('missing_skill_description');
  }
  if (/\btest skill\b/i.test(description)) {
    errors.push('legacy_test_skill_description');
  }
  if (body.trim() === `# ${spec.canonical_plugin_name}`) {
    errors.push('legacy_test_skill_body');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function inspectFamilySkillPack(spec: SkillPackSpec): InspectFamilySkillPack {
  return inspectFamilySkillPackAtRepoRoot(spec, resolveRepoRoot(spec));
}

function inspectFamilySkillPackAtRepoRoot(
  spec: SkillPackSpec,
  repoRoot: string,
): InspectFamilySkillPack {
  const repoFound = fs.existsSync(repoRoot) && fs.statSync(repoRoot).isDirectory();
  const pluginManifestPath = buildPluginManifestPath(spec, repoRoot);
  const pluginSourcePath = buildPluginSourcePath(pluginManifestPath);
  const skillEntryPath = buildSkillEntryPath(spec, repoRoot);
  const installerPath = buildInstallerPath(spec, repoRoot);
  const pluginManifestFound = fs.existsSync(pluginManifestPath) && fs.statSync(pluginManifestPath).isFile();
  const skillEntryFound = fs.existsSync(skillEntryPath) && fs.statSync(skillEntryPath).isFile();
  const skillEntryValidation = validateSkillEntry(spec, skillEntryPath, skillEntryFound);
  const installerFound = fs.existsSync(installerPath) && fs.statSync(installerPath).isFile();
  const generatedSkillSurface = inspectGeneratedSkillSurface(spec, repoRoot);
  const repoPluginReady =
    repoFound && pluginManifestFound && skillEntryFound && skillEntryValidation.valid;
  const seriesProjection = buildFoundryAgentSeriesProjection(spec);
  const capabilityPluginDistribution = buildCapabilityPluginDistribution(spec);
  const pluginTransport: InspectFamilySkillPackPluginTransport = {
    surface_kind: 'opl_connect_plugin_transport',
    source_kind: spec.source_kind,
    source_kind_role: 'transport_install_detail_not_agent_membership_or_status',
    repo_plugin_installer: spec.source_kind === 'repo_plugin_installer',
    opl_generated_plugin_surface: spec.source_kind === 'opl_generated_plugin_surface',
    generated_skill_surface_ready: generatedSkillSurface.ready,
    generated_skill_surface_status: generatedSkillSurface.status,
    installer_kind: spec.installer_kind,
    command_preview: buildInstallerCommandPreview(spec, repoRoot),
    generation_preview_command: spec.source_kind === 'opl_generated_plugin_surface'
      ? ['opl', 'agents', 'interfaces', '--repo-dir', repoRoot, '--format', 'skill']
      : null,
    public_agent_list_must_not_split_by_transport: spec.distribution_role === 'domain_agent_plugin_pack',
  };

  return {
    domain_id: spec.domain_id,
    project: spec.project,
    label: spec.label,
    plugin_name: spec.plugin_name,
    canonical_plugin_name: spec.canonical_plugin_name,
    distribution_role: spec.distribution_role,
    agent_series_membership: spec.distribution_role === 'domain_agent_plugin_pack'
      ? 'standard_domain_agent'
      : null,
    agent_projection_policy: spec.distribution_role === 'domain_agent_plugin_pack'
      ? {
          standard_membership: 'standard_domain_agent',
          plugin_transport_is_membership_axis: false,
          plugin_transport_is_status_axis: false,
          generated_surface_is_membership_axis: false,
          generated_surface_is_status_axis: false,
        }
      : null,
    ...seriesProjection,
    capability_plugin_distribution: capabilityPluginDistribution,
    plugin_transport: pluginTransport,
    plugin_source_path: pluginSourcePath,
    repo_root: repoRoot,
    repo_found: repoFound,
    plugin_manifest_path: pluginManifestPath,
    plugin_manifest_found: pluginManifestFound,
    skill_entry_path: skillEntryPath,
    skill_entry_found: skillEntryFound,
    skill_entry_valid: skillEntryValidation.valid,
    skill_entry_errors: skillEntryValidation.errors,
    installer_path: installerPath,
    installer_found: installerFound,
    source_kind: spec.source_kind,
    source_kind_role: 'transport_install_detail_not_agent_membership_or_status',
    generated_skill_surface_ready: generatedSkillSurface.ready,
    generated_skill_surface_status: generatedSkillSurface.status,
    ready_to_sync: repoPluginReady || (repoFound && generatedSkillSurface.ready),
    installer_kind: spec.installer_kind,
    command_preview: pluginTransport.command_preview,
  };
}

export function syncFamilySkillPackFromRepoRoot(
  domainId: SkillPackSpec['domain_id'],
  repoRoot: string,
  options: Partial<{
    home: string;
    registerPlugin?: boolean;
    scope: SkillPackSyncScope;
    targetProject: string;
    targetRoot: string;
  }> = {},
) {
  const spec = FAMILY_SKILL_PACK_SPECS.find((entry) => entry.domain_id === domainId);
  if (!spec) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `Unknown skill pack domain: ${domainId}.`,
      {
        domain_id: domainId,
        allowed_domains: FAMILY_SKILL_PACK_SPECS.map((entry) => entry.domain_id),
      },
    );
  }
  const scope = options.scope ?? defaultSyncScopeForSpec(spec);
  const targetProject = normalizeTargetProject(options.targetProject);
  if (scope === 'project' && spec.domain_id !== 'scholarskills') {
    throw new FrameworkContractError(
      'cli_usage_error',
      `Project-local skill sync is only supported for OPL ScholarSkills, not ${spec.domain_id}.`,
      {
        domain_id: spec.domain_id,
        requested_scope: scope,
        allowed_project_scope_domains: ['scholarskills'],
      },
    );
  }
  const targetRoot = resolveSkillSyncTargetRoot(scope, {
    targetRoot: options.targetRoot,
  });

  const result = runSkillPackInstaller(
    inspectFamilySkillPackAtRepoRoot(spec, path.resolve(repoRoot)),
    {
      home: normalizeOptionalString(options.home) ?? undefined,
      scope,
      targetProject: scope === 'project' ? targetProject : null,
      targetRoot,
      resolveCodexHome,
      writeGeneratedPluginSurface: writeOplGeneratedPluginSurface,
    },
  );
  if (
    scope === 'codex'
    && options.registerPlugin !== false
    && result.sync_status === 'synced'
    && result.registry_repo_root
  ) {
    const codexPluginRegistry = registerOplFamilyCodexPlugins(
      [domainId as CodexPluginRegistryPackId],
      new Map([[domainId as CodexPluginRegistryPackId, result.registry_repo_root]]),
      normalizeOptionalString(options.home) ?? undefined,
    );
    return {
      ...result,
      installer_result: {
        ...(result.installer_result ?? {}),
        codex_plugin_registry: codexPluginRegistry,
      },
    };
  }

  return result;
}

function defaultSyncScopeForSpec(spec: SkillPackSpec): SkillPackSyncScope {
  return spec.domain_id === 'scholarskills' ? 'workspace' : 'codex';
}

function normalizeTargetProject(value: string | undefined | null): SkillPackTargetProject {
  const key = normalizeOptionalString(value)?.toLowerCase().replace(/[-_]/g, '') ?? 'medautoscience';
  if (key === 'mas' || key === 'medautoscience') {
    return 'medautoscience';
  }

  throw new FrameworkContractError(
    'cli_usage_error',
    `Unknown skill sync target project: ${value}.`,
    {
      target_project: value,
      allowed_target_projects: ['medautoscience', 'med-autoscience', 'mas'],
    },
  );
}

function resolveSkillSyncTargetRoot(
  scope: SkillPackSyncScope,
  options: {
    targetWorkspace?: string;
    targetQuest?: string;
    targetRoot?: string;
  },
) {
  if (scope === 'workspace') {
    return normalizeOptionalString(options.targetWorkspace)
      ?? normalizeOptionalString(options.targetRoot)
      ?? null;
  }
  if (scope === 'quest') {
    return normalizeOptionalString(options.targetQuest)
      ?? normalizeOptionalString(options.targetRoot)
      ?? null;
  }
  return normalizeOptionalString(options.targetRoot);
}

function requireSkillSyncTargetRoot(
  scope: SkillPackSyncScope,
  targetRoot: string | null,
) {
  if ((scope === 'workspace' || scope === 'quest') && !targetRoot) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `ScholarSkills ${scope} skill sync requires a target root.`,
      {
        requested_scope: scope,
        required: scope === 'workspace'
          ? ['--target-workspace <path> or --target-root <path>']
          : ['--target-quest <path> or --target-root <path>'],
      },
    );
  }
}

function shouldSkipImplicitScholarSkillsSync(
  spec: SkillPackSpec,
  options: SyncFamilySkillPacksOptions,
) {
  return spec.domain_id === 'scholarskills'
    && !options.scope
    && !normalizeOptionalString(options.targetWorkspace)
    && !normalizeOptionalString(options.targetQuest)
    && !normalizeOptionalString(options.targetRoot);
}

export function readFamilySkillPacks(options: ReadFamilySkillPacksOptions = {}) {
  const selectedDomains = normalizeDomainSelection(options.domains);
  const packs = FAMILY_SKILL_PACK_SPECS
    .filter((spec) => !selectedDomains || selectedDomains.has(spec.domain_id))
    .map((spec) => inspectFamilySkillPack(spec));

  return {
    version: 'g2',
    skill_catalog: {
      surface_id: 'opl_skill_catalog',
      workspace_root: resolveDefaultFamilyWorkspaceRoot(),
      packs,
      summary: {
        total: packs.length,
        ready_to_sync: packs.filter((entry) => entry.ready_to_sync).length,
        repo_found: packs.filter((entry) => entry.repo_found).length,
      },
    },
  };
}

export function syncFamilySkillPacks(options: SyncFamilySkillPacksOptions = {}) {
  const selectedDomains = normalizeDomainSelection(options.domains);
  const resolvedHome = normalizeOptionalString(options.home) ?? null;
  const inspectedPacks = FAMILY_SKILL_PACK_SPECS
    .filter((spec) => !selectedDomains || selectedDomains.has(spec.domain_id))
    .map((spec) => ({ spec, inspected: inspectFamilySkillPack(spec) }));
  const targetProject = normalizeTargetProject(options.targetProject);
  const explicitTargetRoot = resolveSkillSyncTargetRoot(options.scope ?? 'workspace', {
    targetWorkspace: options.targetWorkspace,
    targetQuest: options.targetQuest,
    targetRoot: options.targetRoot,
  });
  for (const { spec } of inspectedPacks) {
    if (shouldSkipImplicitScholarSkillsSync(spec, options)) {
      continue;
    }
    const scope = options.scope ?? defaultSyncScopeForSpec(spec);
    if (scope === 'project' && spec.domain_id !== 'scholarskills') {
      throw new FrameworkContractError(
        'cli_usage_error',
        `Project-local skill sync is only supported for OPL ScholarSkills, not ${spec.domain_id}.`,
        {
          domain_id: spec.domain_id,
          requested_scope: scope,
          allowed_project_scope_domains: ['scholarskills'],
        },
      );
    }
    if ((scope === 'workspace' || scope === 'quest') && spec.domain_id !== 'scholarskills') {
      throw new FrameworkContractError(
        'cli_usage_error',
        `Workspace/quest-local skill sync is only supported for OPL ScholarSkills, not ${spec.domain_id}.`,
        {
          domain_id: spec.domain_id,
          requested_scope: scope,
          allowed_workspace_or_quest_scope_domains: ['scholarskills'],
        },
      );
    }
    requireSkillSyncTargetRoot(
      scope,
      resolveSkillSyncTargetRoot(scope, {
        targetWorkspace: options.targetWorkspace,
        targetQuest: options.targetQuest,
        targetRoot: options.targetRoot,
      }),
    );
  }
  const packs = inspectedPacks.map(({ spec, inspected }) => runSkillPackInstaller(inspected, {
    home: resolvedHome ?? undefined,
    ...(() => {
      if (shouldSkipImplicitScholarSkillsSync(spec, options)) {
        return {
          scope: 'workspace' as const,
          targetProject: null,
          targetRoot: null,
        };
      }
      const scope = options.scope ?? defaultSyncScopeForSpec(spec);
      return {
        scope,
        targetProject: scope === 'project' ? targetProject : null,
        targetRoot: resolveSkillSyncTargetRoot(scope, {
          targetWorkspace: options.targetWorkspace,
          targetQuest: options.targetQuest,
          targetRoot: explicitTargetRoot ?? undefined,
        }),
      };
    })(),
    resolveCodexHome,
    writeGeneratedPluginSurface: writeOplGeneratedPluginSurface,
  }));
  const syncedFamilyPluginPacks = packs.filter((pack): pack is SyncFamilySkillPack & { domain_id: CodexPluginRegistryPackId } => (
    pack.sync_status === 'synced'
    && pack.sync_scope === 'codex'
    && ['medautoscience', 'medautogrant', 'redcube', 'oplmetaagent', 'oplbookforge', 'scholarskills'].includes(pack.domain_id)
    && Boolean(pack.registry_repo_root)
  ));
  const codex_plugin_registry = syncedFamilyPluginPacks.length > 0
    ? registerOplFamilyCodexPlugins(
        syncedFamilyPluginPacks.map((pack) => pack.domain_id as CodexPluginRegistryPackId),
        new Map(syncedFamilyPluginPacks.map((pack) => [
          pack.domain_id as CodexPluginRegistryPackId,
          pack.registry_repo_root ?? pack.repo_root,
        ])),
        resolvedHome ?? undefined,
      )
    : null;
  const companion_skills = syncOplCompanionSkills(resolvedHome ?? undefined, {
    mode: options.companionMode ?? 'observe',
    superpowersProfile: options.superpowersProfile ?? 'keep',
  });

  return {
    version: 'g2',
    skill_sync: {
      surface_id: 'opl_skill_sync',
      workspace_root: resolveDefaultFamilyWorkspaceRoot(),
      home: resolvedHome ?? process.env.HOME ?? null,
      packs,
      codex_plugin_registry,
      companion_skills,
      summary: {
        total: packs.length,
        synced: packs.filter((entry) => entry.sync_status === 'synced').length,
        skipped: packs.filter((entry) => entry.sync_status === 'skipped').length,
      },
    },
  };
}
