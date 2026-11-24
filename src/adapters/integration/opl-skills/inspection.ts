import fs from 'node:fs';
import path from 'node:path';

import {
  FrameworkContractError,
  isRecord,
} from '../../../kernel/contract-validation.ts';
import {
  resolveAgentPluginManifest,
  type ResolvedAgentPluginManifest,
} from '../../../kernel/agent-plugin-manifest.ts';
import {
  parseJsonText,
  readJsonFileResult,
} from '../../../kernel/json-file.ts';
import {
  listRepoProfessionalSkillRefs,
  materializeStandardAgentCapabilityMap,
} from '../../../authority/packages/index.ts';
import {
  inspectGeneratedSkillSurface,
} from './generated-plugin.ts';
import {
  buildInstallerCommandPreview,
  buildInstallerPath,
  buildSkillEntryPath,
  buildStandardPluginCarrierSkillPath,
  normalizeOptionalString,
  resolveRepoRoot,
} from './paths.ts';
import {
  type InspectFamilySkillPack,
  type InspectFamilySkillPackPluginTransport,
  type SkillPackDistributionRole,
  type SkillPackSpec,
  type SkillPackSyncPolicy,
  type SkillPackSyncScope,
} from './registry.ts';
import {
  buildCapabilityPluginDistribution,
  buildFoundryAgentSeriesProjection,
  readFoundryAgentContractPolicy,
} from './contract.ts';

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

function validatePluginManifest(
  spec: SkillPackSpec,
  resolvedPlugin: ResolvedAgentPluginManifest | null,
) {
  const errors: string[] = [];

  if (!resolvedPlugin) {
    return { valid: false, errors };
  }
  const manifest = resolvedPlugin.manifest;

  if (spec.distribution_role === 'domain_agent_plugin_pack' && 'mcpServers' in manifest) {
    errors.push('standard_domain_agent_manifest_must_not_expose_standalone_mcp_servers');
  }
  if (spec.distribution_role === 'domain_agent_plugin_pack'
    && resolvedPlugin.kind !== 'agent_plugins_1_0') {
    errors.push('standard_domain_agent_manifest_not_agent_plugins_1_0');
  }
  const nonfatalFindings = resolvedPlugin.conformanceErrors.map(
    (error) => `plugin_manifest_nonconformant_nonfatal:${error}`,
  );
  if (manifest.name !== spec.plugin_name) {
    errors.push(`plugin_manifest_name_mismatch:${String(manifest.name ?? '<missing>')}`);
  }
  if (spec.source_kind === 'repo_plugin_installer'
    && resolvedPlugin.kind === 'codex_legacy'
    && manifest.skills !== './skills/') {
    errors.push(`plugin_manifest_skills_root_mismatch:${String(manifest.skills ?? '<missing>')}`);
  }

  return {
    valid: errors.length === 0,
    errors: [...errors, ...nonfatalFindings],
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

function inspectProfessionalSkillExposure(
  repoRoot: string,
  distributionRole: SkillPackDistributionRole,
): InspectFamilySkillPack['professional_skill_exposure'] {
  const capabilityMapPath = path.join(repoRoot, 'contracts', 'capability_map.json');
  const onDemandExposurePolicy = readFoundryAgentContractPolicy('skill_on_demand_exposure_policy');
  if (distributionRole === 'framework_capability_plugin_pack') {
    const packageManifestPath = path.join(repoRoot, 'opl-package.json');
    const packageRead = readJsonFileResult(packageManifestPath);
    const packageManifest = packageRead.status === 'resolved' && isRecord(packageRead.payload)
      ? packageRead.payload
      : null;
    const exports = packageManifest && isRecord(packageManifest.exports)
      ? packageManifest.exports
      : null;
    const coreSkillIds = Array.isArray(exports?.core_skill_ids)
      ? exports.core_skill_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const specialtySkillIds = Array.isArray(exports?.specialty_skill_ids)
      ? exports.specialty_skill_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const allSkillIds = [...new Set([...coreSkillIds, ...specialtySkillIds])];
    const skillRoot = path.join(repoRoot, 'skills');
    const sourceSkillIds = fs.existsSync(skillRoot) && fs.statSync(skillRoot).isDirectory()
      ? fs.readdirSync(skillRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillRoot, entry.name, 'SKILL.md')))
        .map((entry) => entry.name)
        .sort()
      : [];
    const aggregateSkillId = typeof exports?.default_materialized_skill_ids === 'object'
      && Array.isArray(exports.default_materialized_skill_ids)
      && typeof exports.default_materialized_skill_ids[0] === 'string'
      ? exports.default_materialized_skill_ids[0]
      : null;
    const professionalSkillIds = allSkillIds.filter((skillId) => skillId !== aggregateSkillId);
    const blockers: string[] = [];
    if (!packageManifest || !exports) {
      blockers.push('missing_capability_package_manifest_exports');
    }
    for (const skillId of professionalSkillIds) {
      if (!sourceSkillIds.includes(skillId)) {
        blockers.push(`missing_capability_package_skill:${skillId}`);
      }
    }
    const defaultCodexExposed = packageManifest?.codex_surface;
    const defaultCodexExposedCount = isRecord(defaultCodexExposed)
      && defaultCodexExposed.codex_default_exposure === true
      ? professionalSkillIds.length
      : 0;
    if (defaultCodexExposedCount > 0) {
      blockers.push('capability_package_codex_default_exposure_must_be_false');
    }
    return {
      surface_kind: 'opl_professional_skill_exposure_audit',
      status: blockers.length > 0 ? 'blocked' : sourceSkillIds.length > 0 ? 'passed' : 'skipped',
      capability_map_path: capabilityMapPath,
      capability_map_found: fs.existsSync(capabilityMapPath),
      professional_skill_count: professionalSkillIds.length,
      repo_internal_professional_skill_count: professionalSkillIds.filter((skillId) => sourceSkillIds.includes(skillId)).length,
      default_codex_exposed_count: defaultCodexExposedCount,
      expected_exposure_layer: 'repo_internal_professional_skill',
      codex_default_exposure_required: false,
      on_demand_exposure_policy: onDemandExposurePolicy,
      blockers,
    };
  }
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
    on_demand_exposure_policy: onDemandExposurePolicy,
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

function validateSyncPolicy(policy: unknown, manifestPath: string): SkillPackSyncPolicy {
  if (!isRecord(policy)
    || !['codex', 'workspace', 'quest'].includes(String(policy.default_scope))
    || !Array.isArray(policy.allowed_scopes)
    || policy.allowed_scopes.length === 0
    || policy.allowed_scopes.some((scope) => !['codex', 'workspace', 'quest'].includes(String(scope)))
    || !policy.allowed_scopes.includes(policy.default_scope)
    || !['skip', 'require_target'].includes(String(policy.implicit_without_target))) {
    throw new FrameworkContractError('contract_shape_invalid', 'Package declares an invalid Connect skill sync policy.', {
      file: manifestPath,
    });
  }
  return {
    default_scope: policy.default_scope as SkillPackSyncScope,
    allowed_scopes: [...new Set(policy.allowed_scopes as SkillPackSyncScope[])],
    implicit_without_target: policy.implicit_without_target as SkillPackSyncPolicy['implicit_without_target'],
  };
}

export function readSkillSyncPolicy(spec: SkillPackSpec, repoRoot: string): SkillPackSyncPolicy {
  const fallback: SkillPackSyncPolicy = spec.distribution_role === 'framework_capability_plugin_pack'
    ? { default_scope: 'workspace', allowed_scopes: ['workspace', 'quest'], implicit_without_target: 'skip' }
    : { default_scope: 'codex', allowed_scopes: ['codex'], implicit_without_target: 'require_target' };
  const manifestPath = path.join(repoRoot, 'opl-package.json');
  if (!fs.existsSync(manifestPath)) {
    if (spec.distribution_role !== 'framework_capability_plugin_pack' || !fs.existsSync(repoRoot)) return fallback;
    throw new FrameworkContractError('contract_shape_invalid', 'Package is missing its owner manifest.', {
      file: manifestPath,
    });
  }
  const manifest = parseJsonText(fs.readFileSync(manifestPath, 'utf8'));
  if (!isRecord(manifest) || (spec.distribution_role === 'framework_capability_plugin_pack'
    && manifest.connect_skill_sync_policy === undefined)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Package is missing a Connect skill sync policy.', {
      file: manifestPath,
    });
  }
  if (manifest.connect_skill_sync_policy === undefined) return fallback;
  return validateSyncPolicy(manifest.connect_skill_sync_policy, manifestPath);
}

export function inspectFamilySkillPack(spec: SkillPackSpec): InspectFamilySkillPack {
  return inspectFamilySkillPackAtRepoRoot(spec, resolveRepoRoot(spec));
}

export function inspectFamilySkillPackAtRepoRoot(
  spec: SkillPackSpec,
  repoRoot: string,
): InspectFamilySkillPack {
  const repoFound = fs.existsSync(repoRoot) && fs.statSync(repoRoot).isDirectory();
  const pluginSourcePath = spec.source_kind === 'opl_standard_codex_carrier'
    ? path.join(repoRoot, 'plugins', spec.plugin_name)
    : repoRoot;
  const resolvedPlugin = repoFound
    ? resolveAgentPluginManifest([pluginSourcePath], { expectedName: spec.plugin_name })
    : null;
  const pluginManifestPath = resolvedPlugin?.manifestPath ?? path.join(pluginSourcePath, 'plugin.json');
  const skillEntryPath = buildSkillEntryPath(spec, repoRoot);
  const installerPath = buildInstallerPath(spec, repoRoot);
  const pluginManifestFound = resolvedPlugin !== null;
  const skillEntryFound = fs.existsSync(skillEntryPath) && fs.statSync(skillEntryPath).isFile();
  const pluginManifestValidation = validatePluginManifest(spec, resolvedPlugin);
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
  const skillSyncPolicy = readSkillSyncPolicy(spec, repoRoot);
  const capabilityPluginDistribution = buildCapabilityPluginDistribution(spec, skillSyncPolicy);
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
    skill_sync_policy: skillSyncPolicy,
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
    professional_skill_exposure: inspectProfessionalSkillExposure(repoRoot, spec.distribution_role),
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
