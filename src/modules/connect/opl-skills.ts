import fs from 'node:fs';
import path from 'node:path';

import {
  FrameworkContractError,
  isRecord,
} from '../../kernel/contract-validation.ts';
import {
  parseJsonText,
  readJsonFileResult,
} from '../../kernel/json-file.ts';
import {
  listRepoProfessionalSkillRefs,
  materializeStandardAgentCapabilityMap,
} from '../pack/index.ts';
import { syncOplCompanionSkills, type OplCompanionSkillApplyMode } from './install-companions.ts';
import {
  registerOplFamilyCodexPlugins,
  type CodexPluginRegistryPackId,
} from './system-installation/codex-plugin-registry.ts';
import {
  resolveDefaultFamilyWorkspaceRoot as resolveDefaultFamilyWorkspaceRootImpl,
  resolveFamilyWorkspaceRootFromRepoRoot as resolveFamilyWorkspaceRootFromRepoRootImpl,
} from '../workspace/index.ts';
import {
  inspectGeneratedSkillSurface,
  writeOplMaterializedPluginCarrier,
} from './opl-skills-parts/generated-plugin.ts';
import {
  buildInstallerCommandPreview,
  buildInstallerPath,
  buildPluginManifestPath,
  buildPluginSourcePath,
  buildSkillEntryPath,
  buildStandardPluginCarrierSkillPath,
  normalizeOptionalString,
  resolveCodexHome,
  resolveRepoRoot,
} from './opl-skills-parts/paths.ts';
import {
  FRAMEWORK_CAPABILITY_PACKAGE_AUTHORITY_BOUNDARY,
  listFamilySkillPackSpecs,
  normalizeDomainSelection,
  type InspectFamilySkillPack,
  type InspectFamilySkillPackPluginTransport,
  type SkillPackSyncScope,
  type SkillPackSpec,
  type SyncFamilySkillPack,
} from './opl-skills-parts/registry.ts';
import { runSkillPackInstaller } from './opl-skills-parts/sync.ts';
import {
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_REGISTRY_REF,
  resolveStandardAgentByCanonicalPluginName,
} from '../atlas/public/standard-agent-registry.ts';

const FAMILY_REPO_DIRECTORIES = [
  'one-person-lab',
  ...STANDARD_AGENT_REGISTRY.map((entry) => entry.project),
];

export function resolveDefaultFamilyWorkspaceRoot(
  options: Parameters<typeof resolveDefaultFamilyWorkspaceRootImpl>[0] = {},
) {
  return resolveDefaultFamilyWorkspaceRootImpl({
    ...options,
    familyRepoDirectories: FAMILY_REPO_DIRECTORIES,
  });
}

export function resolveFamilyWorkspaceRootFromRepoRoot(repoRoot: string) {
  return resolveFamilyWorkspaceRootFromRepoRootImpl(repoRoot, FAMILY_REPO_DIRECTORIES);
}

type ReadFamilySkillPacksOptions = {
  domains?: string[];
};

type SyncFamilySkillPacksOptions = ReadFamilySkillPacksOptions & {
  home?: string;
  scope?: SkillPackSyncScope;
  targetWorkspace?: string;
  targetQuest?: string;
  targetRoot?: string;
  companionMode?: OplCompanionSkillApplyMode;
  invocation?: 'explicit_legacy_migration';
};

const FOUNDRY_AGENT_SERIES_CONTRACT_REF = 'contracts/opl-framework/foundry-agent-series-contract.json';
const FOUNDRY_AGENT_SERIES_CONTRACT_URL = new URL(
  '../../../contracts/opl-framework/foundry-agent-series-contract.json',
  import.meta.url,
);
let cachedFoundryAgentSeriesContract: Record<string, unknown> | null = null;

function readFoundryAgentSeriesContract() {
  if (!cachedFoundryAgentSeriesContract) {
    const contract = parseJsonText(fs.readFileSync(FOUNDRY_AGENT_SERIES_CONTRACT_URL, 'utf8'));
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

function cloneJsonRecordField(source: Record<string, unknown>, field: string) {
  const value = readObjectField(source, field);
  return structuredClone(value) as Record<string, unknown>;
}

function readFoundryAgentContractPolicy(field: string) {
  return cloneJsonRecordField(readFoundryAgentSeriesContract(), field);
}

function buildFoundryAgentSeriesProjection(spec: SkillPackSpec) {
  if (spec.distribution_role !== 'domain_agent_plugin_pack') {
    return {
      foundry_agent_series: {},
      command_surface_spine: {},
      mcp_projection: {},
    };
  }

  const contract = readFoundryAgentSeriesContract();
  const commandSurface = readObjectField(contract, 'agent_cli_command_surface_policy');
  const skillMcp = readObjectField(contract, 'skill_mcp_surface_policy');
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
  const brandCli = standardAgent.agent_id;
  const workAlias = 'work';
  const ordinaryOperations = readStringListField(commandSurface, 'ordinary_operations');
  const ordinarySpine = readStringListField(commandSurface, 'ordinary_public_command_surface_spine');
  const defaultFoundryCommandSurface =
    `opl agents run --domain ${foundryAgentId} --action <action_id>`;
  const seriesFoundryOperations = [defaultFoundryCommandSurface];

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
      ordinary_golden_path: 'domain_pack -> stage -> domain_owner_answer -> handoff',
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
      foundry_agent_inspect_command_surface: defaultFoundryCommandSurface,
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
      series_delegate_tool_refs: [defaultFoundryCommandSurface],
      standard_agent_standalone_mcp_default_enabled: readBooleanField(
        skillMcp,
        'standard_agent_standalone_mcp_default_enabled',
      ),
      standard_agent_plugin_manifest_must_not_expose_mcp_servers: readBooleanField(
        skillMcp,
        'standard_agent_plugin_manifest_must_not_expose_mcp_servers',
      ),
      unified_mcp_projection_owner: readStringField(skillMcp, 'opl_unified_mcp_projection_owner'),
      unified_mcp_server_ready: readBooleanField(skillMcp, 'unified_mcp_server_ready'),
      unified_mcp_server_readiness: readStringField(skillMcp, 'unified_mcp_server_readiness'),
      unified_mcp_server_id: readStringField(skillMcp, 'unified_mcp_server_id'),
      unified_mcp_server_command: readStringListField(skillMcp, 'unified_mcp_server_command'),
      unified_mcp_server_registration_surface: readStringField(
        skillMcp,
        'unified_mcp_server_registration_surface',
      ),
      unified_mcp_server_toolsets: readStringListField(skillMcp, 'unified_mcp_server_toolsets'),
      unified_mcp_server_read_only_default: readBooleanField(skillMcp, 'unified_mcp_server_read_only_default'),
      domain_repo_mcp_server_role: readStringField(skillMcp, 'domain_repo_mcp_server_role'),
      cli_mcp_relationship_policy: cloneJsonRecordField(skillMcp, 'cli_mcp_relationship_policy'),
      mcp_context_budget_policy: cloneJsonRecordField(skillMcp, 'mcp_context_budget_policy'),
      legacy_standalone_mcp_servers_retired: readBooleanField(
        skillMcp,
        'legacy_standalone_mcp_servers_retired',
      ),
      plugin_registry_is_canonical_transport: true,
    },
  };
}

function buildCapabilityPluginDistribution(spec: SkillPackSpec) {
  if (spec.domain_id !== 'scholarskills') {
    return null;
  }

  return {
    surface_kind: 'opl_framework_capability_plugin_distribution',
    capability_plugin_id: 'mas-scholar-skills',
    distribution_role: spec.distribution_role,
    ownership_kind: 'framework_capability_plugin',
    source_of_truth: [
      'mas-scholar-skills/.codex-plugin/plugin.json',
      'mas-scholar-skills/skills/mas-scholar-skills/SKILL.md',
      'mas-scholar-skills/contracts/scholar-skills-capability-modules.json',
    ],
    content_owner: 'mas-scholar-skills',
    framework_role: 'compatibility_projection_and_provenance_only',
    github_repo: 'gaofeng21cn/mas-scholar-skills',
    ordinary_install_update_source: 'ghcr_capability_packages_channel',
    package_channel_manifest_ref: 'ghcr.io/<owner>/one-person-lab-manifest:<tag>',
    package_artifact_ref: 'ghcr.io/<owner>/one-person-lab-packages/mas-scholar-skills:<package_semver>@<artifact_digest>',
    developer_checkout_source: 'Developer Mode or explicit OPL_MAS_SCHOLAR_SKILLS_REPO_ROOT / OPL_MODULE_PATH_SCHOLARSKILLS',
    package_lifecycle_owner: 'opl_packages',
    package_lifecycle_commands: [
      'opl packages install mas --json',
      'opl packages status --package-id mas --json',
      'opl packages repair mas --json',
    ],
    scope_activation: 'automatic_on_workspace_or_quest_activation_and_domain_launch',
    compatibility_projection_not_advertised: true,
    default_sync_scope: 'package_activation_transaction_only',
    recommended_paper_execution_scopes: ['workspace', 'quest'],
    codex_scope_requires_explicit_request: true,
    framework_owned_capability: true,
    domain_module: false,
    brand_module: false,
    authority_boundary: FRAMEWORK_CAPABILITY_PACKAGE_AUTHORITY_BOUNDARY,
    note: 'MAS Scholar Skills owns professional capability content; OPL Packages resolves the MAS dependency closure, activates target scopes, and records provenance.',
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

function validatePluginManifest(spec: SkillPackSpec, pluginManifestPath: string, pluginManifestFound: boolean) {
  const errors: string[] = [];

  if (!pluginManifestFound) {
    return { valid: false, errors };
  }

  const manifestRead = readJsonFileResult(pluginManifestPath);
  if (manifestRead.status !== 'resolved') {
    return {
      valid: false,
      errors: [`failed_to_read_plugin_manifest:${manifestRead.error ?? 'missing'}`],
    };
  }
  const manifest = manifestRead.payload;

  if (!isRecord(manifest)) {
    return {
      valid: false,
      errors: ['plugin_manifest_root_not_object'],
    };
  }

  if (spec.distribution_role === 'domain_agent_plugin_pack' && 'mcpServers' in manifest) {
    errors.push('standard_domain_agent_manifest_must_not_expose_standalone_mcp_servers');
  }
  if (manifest.name !== spec.plugin_name) {
    errors.push(`plugin_manifest_name_mismatch:${String(manifest.name ?? '<missing>')}`);
  }
  if (spec.source_kind === 'repo_plugin_installer' && manifest.skills !== './skills/') {
    errors.push(`plugin_manifest_skills_root_mismatch:${String(manifest.skills ?? '<missing>')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
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
  const allowedSourceNames = new Set([spec.canonical_plugin_name, spec.plugin_name]);
  if (!allowedSourceNames.has(name)) {
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

function validateStandardPluginCarrier(
  spec: SkillPackSpec,
  repoRoot: string,
  skillEntryPath: string,
  skillEntryFound: boolean,
) {
  const errors: string[] = [];
  if (spec.source_kind !== 'opl_standard_codex_carrier') {
    return { valid: true, errors };
  }

  const carrierSkillPath = buildStandardPluginCarrierSkillPath(spec, repoRoot);
  if (!fs.existsSync(carrierSkillPath) || !fs.statSync(carrierSkillPath).isFile()) {
    return { valid: false, errors: [`missing_plugin_carrier_skill:${carrierSkillPath}`] };
  }

  if (!skillEntryFound) {
    return { valid: false, errors: ['missing_primary_skill_source_for_carrier_compare'] };
  }

  const sourceSkill = fs.readFileSync(skillEntryPath, 'utf8');
  const carrierSkill = fs.readFileSync(carrierSkillPath, 'utf8');
  if (sourceSkill !== carrierSkill) {
    errors.push('plugin_carrier_skill_not_materialized_full_copy');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function capabilityKind(capability: Record<string, unknown>) {
  return normalizeOptionalString(
    typeof capability.capability_kind === 'string'
      ? capability.capability_kind
      : typeof capability.surface_role === 'string'
        ? capability.surface_role
        : null,
  );
}

function capabilityRefs(capability: Record<string, unknown>) {
  const refs: string[] = [];
  const physicalSourceRef = isRecord(capability.physical_source_ref) && typeof capability.physical_source_ref.ref === 'string'
    ? capability.physical_source_ref.ref
    : null;
  if (physicalSourceRef) {
    refs.push(physicalSourceRef);
  }
  for (const field of ['canonical_target_paths', 'canonical_paths', 'skill_ref']) {
    const value = capability[field];
    if (typeof value === 'string') {
      refs.push(value);
    } else if (Array.isArray(value)) {
      refs.push(...value.filter((entry): entry is string => typeof entry === 'string'));
    }
  }
  return refs;
}

function inspectProfessionalSkillExposure(repoRoot: string): InspectFamilySkillPack['professional_skill_exposure'] {
  const capabilityMapPath = path.join(repoRoot, 'contracts', 'capability_map.json');
  const repoSkillRefs = listRepoProfessionalSkillRefs(repoRoot);
  const capabilityMapFound = fs.existsSync(capabilityMapPath) && fs.statSync(capabilityMapPath).isFile();
  const base = {
    surface_kind: 'opl_professional_skill_exposure_audit' as const,
    capability_map_path: capabilityMapPath,
    capability_map_found: capabilityMapFound,
    professional_skill_count: 0,
    repo_internal_professional_skill_count: repoSkillRefs.length,
    default_codex_exposed_count: 0,
    expected_exposure_layer: 'repo_internal_professional_skill' as const,
    codex_default_exposure_required: false as const,
    on_demand_exposure_policy: readFoundryAgentContractPolicy('skill_on_demand_exposure_policy'),
  };

  if (!capabilityMapFound) {
    return {
      ...base,
      status: repoSkillRefs.length > 0 ? 'blocked' : 'skipped',
      blockers: repoSkillRefs.length > 0 ? ['missing_capability_map_for_repo_professional_skills'] : [],
    };
  }

  const read = readJsonFileResult(capabilityMapPath);
  if (read.status !== 'resolved' || !isRecord(read.payload)) {
    return {
      ...base,
      status: 'blocked',
      blockers: [`failed_to_read_capability_map:${read.error ?? 'invalid_root'}`],
    };
  }

  const materialized = materializeStandardAgentCapabilityMap(repoRoot, read.payload);
  if (materialized.blockers.length > 0 || !isRecord(materialized.capabilityMap)) {
    return {
      ...base,
      status: 'blocked',
      blockers: materialized.blockers.length > 0
        ? materialized.blockers
        : ['failed_to_materialize_capability_map'],
    };
  }
  const capabilities = Array.isArray(materialized.capabilityMap.capabilities)
    ? materialized.capabilityMap.capabilities.filter(isRecord)
    : [];
  const professionalCapabilities = capabilities.filter((capability) => capabilityKind(capability) === 'professional_skill');
  const blockers: string[] = [];
  const representedRefs = new Set(professionalCapabilities.flatMap(capabilityRefs));
  for (const relativePath of repoSkillRefs) {
    if (!representedRefs.has(relativePath)) {
      blockers.push(`missing_professional_skill_capability:${relativePath}`);
    }
  }

  let defaultCodexExposedCount = 0;
  for (const capability of professionalCapabilities) {
    const capabilityId = typeof capability.capability_id === 'string' && capability.capability_id.trim()
      ? capability.capability_id.trim()
      : '<missing_capability_id>';
    const refs = capabilityRefs(capability);
    const isRepoInternal = refs.some((ref) => ref.startsWith('agent/professional_skills/'));
    if (capability.codex_default_exposure === true) {
      defaultCodexExposedCount += 1;
      blockers.push(`${capabilityId}:codex_default_exposure_must_be_false`);
    }
    if (isRepoInternal && capability.exposure_layer !== 'repo_internal_professional_skill') {
      blockers.push(`${capabilityId}:missing_repo_internal_exposure_layer`);
    }
    if (!Array.isArray(capability.allowed_exposure_scopes) || capability.allowed_exposure_scopes.length === 0) {
      blockers.push(`${capabilityId}:missing_allowed_exposure_scopes`);
    }
  }

  return {
    ...base,
    status: blockers.length > 0 ? 'blocked' : 'passed',
    professional_skill_count: professionalCapabilities.length,
    default_codex_exposed_count: defaultCodexExposedCount,
    blockers,
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
  const pluginManifestValidation = validatePluginManifest(spec, pluginManifestPath, pluginManifestFound);
  const skillEntryValidation = validateSkillEntry(spec, skillEntryPath, skillEntryFound);
  const standardCarrierValidation = validateStandardPluginCarrier(
    spec,
    repoRoot,
    skillEntryPath,
    skillEntryFound,
  );
  const installerFound = fs.existsSync(installerPath) && fs.statSync(installerPath).isFile();
  const generatedSkillSurface = inspectGeneratedSkillSurface(spec, repoRoot);
  const trackedRepoPluginReady =
    repoFound && pluginManifestFound && pluginManifestValidation.valid && skillEntryFound && skillEntryValidation.valid;
  const standardCodexCarrierReady =
    spec.source_kind === 'opl_standard_codex_carrier'
    && repoFound
    && pluginManifestFound
    && pluginManifestValidation.valid
    && skillEntryFound
    && skillEntryValidation.valid
    && standardCarrierValidation.valid;
  const readyToSync = spec.source_kind === 'opl_standard_codex_carrier'
    ? standardCodexCarrierReady
    : trackedRepoPluginReady;
  const seriesProjection = buildFoundryAgentSeriesProjection(spec);
  const capabilityPluginDistribution = buildCapabilityPluginDistribution(spec);
  const pluginTransport: InspectFamilySkillPackPluginTransport = {
    surface_kind: 'opl_connect_plugin_transport',
    source_kind: spec.source_kind,
    source_kind_role: spec.source_kind === 'opl_standard_codex_carrier'
      ? 'standard_source_model_not_agent_membership_or_status'
      : 'transport_install_detail_not_agent_membership_or_status',
    standard_codex_carrier: spec.source_kind === 'opl_standard_codex_carrier',
    materializer: spec.source_kind === 'opl_standard_codex_carrier'
      ? 'opl_standard_codex_plugin_materializer'
      : 'repo_plugin_installer',
    primary_skill_projection: spec.source_kind === 'opl_standard_codex_carrier'
      ? {
          canonical_source_path: 'agent/primary_skill/SKILL.md',
          carrier_materialization: 'materialized_full_skill_copy',
          codex_install_requires_real_skill_md: true,
          plugin_skill_may_be_stub_or_pointer: false,
          carrier_is_membership_axis: false,
          carrier_is_status_axis: false,
          carrier_can_claim_domain_ready: false,
          carrier_can_write_domain_truth: false,
        }
      : null,
    generated_skill_surface_ready: generatedSkillSurface.ready,
    generated_skill_surface_status: generatedSkillSurface.status,
    installer_kind: spec.installer_kind,
    command_preview: buildInstallerCommandPreview(spec, repoRoot),
    generation_preview_command: spec.source_kind === 'opl_standard_codex_carrier'
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
    agent_package_exposure_model: spec.distribution_role === 'domain_agent_plugin_pack'
      ? readFoundryAgentContractPolicy('agent_package_exposure_unification_policy')
      : null,
    ...seriesProjection,
    capability_plugin_distribution: capabilityPluginDistribution,
    plugin_transport: pluginTransport,
    management_model: 'opl_managed_codex_plugin_surface',
    management_model_role: 'unified_management_semantics_transport_may_differ',
    professional_skill_exposure: inspectProfessionalSkillExposure(repoRoot),
    plugin_source_path: pluginSourcePath,
    repo_root: repoRoot,
    repo_found: repoFound,
    plugin_manifest_path: pluginManifestPath,
    plugin_manifest_found: pluginManifestFound,
    plugin_manifest_valid: pluginManifestValidation.valid,
    plugin_manifest_errors: pluginManifestValidation.errors,
    skill_entry_path: skillEntryPath,
    skill_entry_found: skillEntryFound,
    skill_entry_valid: skillEntryValidation.valid,
    skill_entry_errors: [...skillEntryValidation.errors, ...standardCarrierValidation.errors],
    installer_path: installerPath,
    installer_found: installerFound,
    source_kind: spec.source_kind,
    source_kind_role: pluginTransport.source_kind_role,
    generated_skill_surface_ready: generatedSkillSurface.ready,
    generated_skill_surface_status: generatedSkillSurface.status,
    ready_to_sync: readyToSync,
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
    targetRoot: string;
  }> = {},
) {
  const familySkillPackSpecs = listFamilySkillPackSpecs();
  const spec = familySkillPackSpecs.find((entry) => entry.domain_id === domainId);
  if (!spec) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `Unknown skill pack domain: ${domainId}.`,
      {
        domain_id: domainId,
        allowed_domains: familySkillPackSpecs.map((entry) => entry.domain_id),
      },
    );
  }
  const scope = options.scope ?? defaultSyncScopeForSpec(spec);
  const targetRoot = resolveSkillSyncTargetRoot(scope, {
    targetRoot: options.targetRoot,
  });

  const result = runSkillPackInstaller(
    inspectFamilySkillPackAtRepoRoot(spec, path.resolve(repoRoot)),
    {
      home: normalizeOptionalString(options.home) ?? undefined,
      scope,
      targetRoot,
      resolveCodexHome,
      writeMaterializedPluginCarrier: writeOplMaterializedPluginCarrier,
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
  const packs = listFamilySkillPackSpecs()
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
  const inspectedPacks = listFamilySkillPackSpecs()
    .filter((spec) => !selectedDomains || selectedDomains.has(spec.domain_id))
    .map((spec) => ({ spec, inspected: inspectFamilySkillPack(spec) }));
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
    if ((scope === 'workspace' || scope === 'quest') && spec.domain_id !== 'scholarskills') {
      throw new FrameworkContractError(
        'cli_usage_error',
        `Workspace/quest-local skill sync is only supported for MAS Scholar Skills, not ${spec.domain_id}.`,
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
          targetRoot: null,
        };
      }
      const scope = options.scope ?? defaultSyncScopeForSpec(spec);
      return {
        scope,
        targetRoot: resolveSkillSyncTargetRoot(scope, {
          targetWorkspace: options.targetWorkspace,
          targetQuest: options.targetQuest,
          targetRoot: explicitTargetRoot ?? undefined,
        }),
      };
    })(),
    resolveCodexHome,
    writeMaterializedPluginCarrier: writeOplMaterializedPluginCarrier,
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
  });

  return {
    version: 'g2',
    skill_sync: {
      surface_id: 'opl_skill_sync',
      compatibility_boundary: options.invocation === 'explicit_legacy_migration'
        ? {
            mode: 'explicit_legacy_migration',
            automatic_invocation_allowed: false,
            steady_state_authority: 'opl_package_lifecycle',
          }
        : null,
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
