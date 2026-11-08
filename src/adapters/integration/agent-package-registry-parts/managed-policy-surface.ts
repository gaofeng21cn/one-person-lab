import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { readLocalCodexDefaultsIfAvailable } from '../../../kernel/local-codex-defaults.ts';
import {
  syncOplCompanionSkills,
  type OplCompanionNetworkAccess,
  type OplCompanionToolId,
} from '../install-companions.ts';
export { parseTomlDocument, renderTomlDocument } from './codex-config-document.ts';
export type { TomlTableBlock } from './codex-config-document.ts';
import { compileFlowCapabilityStrategy } from './flow-capability-compiler.ts';
import type {
  AgentPackageExperienceBaselineReadback,
  AgentPackageCodexModelPolicyProjection,
  AgentPackageManagedPolicyCurrentness,
  AgentPackageManagedPolicyCapabilityReadbackItem,
  AgentPackageManagedPolicyDependency,
  AgentPackageManifest,
  AgentPackageSpecializedCapabilitiesReadback,
} from './types.ts';
import {
  managedPolicyDependencySelection,
  SUPPORTED_COMPANION_TOOL_IDS,
} from './managed-policy-surface-parts/dependency-selection.ts';
import { inspectManagedPolicySurface } from './managed-policy-surface-parts/inventory.ts';
import { loadManagedPolicySurface, sha256File } from './managed-policy-surface-parts/normalization.ts';
import type { OplFlowPolicy } from './managed-policy-surface-parts/types.ts';

function codexModelPolicyProjection(
  policy: OplFlowPolicy['codex_model_policy'],
): AgentPackageCodexModelPolicyProjection {
  const localSelection = readLocalCodexDefaultsIfAvailable();
  return {
    surface_kind: 'opl_codex_model_policy_projection.v1',
    ...structuredClone(policy),
    configured_default_role: 'recommendation_only',
    effective_selection: localSelection
      ? {
          mode: 'fixed',
          model: localSelection.model,
          reasoning_effort: localSelection.reasoning_effort,
          source: 'local_codex_config',
          overrides_recommendation: localSelection.model !== policy.configured_default.model
            || localSelection.reasoning_effort !== policy.configured_default.reasoning_effort,
        }
      : {
          mode: 'unavailable',
          model: null,
          reasoning_effort: null,
          source: 'local_codex_config_unavailable',
          overrides_recommendation: null,
        },
    role: 'package_recommendation_consumed_from_framework_projection',
  };
}

export function managedPolicyDependenciesFromDescriptor(input: {
  manifest: Pick<
    AgentPackageManifest,
    'package_id' | 'version' | 'plugin_id' | 'required_skill_ids' | 'managed_policy_surface'
  >;
  sourceRoot: string;
}): AgentPackageManagedPolicyDependency[] {
  const config = input.manifest.managed_policy_surface;
  if (!config) return [];
  const { policy } = loadManagedPolicySurface({
    identity: {
      packageId: input.manifest.package_id,
      packageVersion: input.manifest.version,
      pluginId: input.manifest.plugin_id,
      requiredSkillIds: input.manifest.required_skill_ids,
      config,
    },
    sourceRoot: input.sourceRoot,
  });
  return [
    ...policy.requires.map((dependency) => ({ ...dependency, relationship: 'required' as const })),
    ...policy.experience_baseline.map((dependency) => ({ ...dependency, relationship: 'recommended' as const })),
  ];
}

function noManagedPolicyCurrentness(reason: string): AgentPackageManagedPolicyCurrentness {
  return {
    surface_kind: 'opl_package_managed_policy_currentness',
    status: 'not_requested',
    policy_kind: null,
    policy_path: null,
    schema_path: null,
    expected_policy_sha256: null,
    actual_policy_sha256: null,
    inventory_digest: null,
    enabled_migration_ids: [],
    detected_conflicts: [],
    dependency_sync: null,
    required_dependencies_operational: true,
    required_dependency_failure_ids: [],
    model_projection: null,
    capability_strategy: null,
    repair_command: null,
    reason,
  };
}

function skillSyncItemCurrent(item: ReturnType<typeof syncOplCompanionSkills>['items'][number]) {
  const discoverOnly = item.action === 'discover_only';
  if (discoverOnly) {
    return item.status === 'available'
      && item.source_authority !== 'missing'
      && item.frontmatter_schema_status !== 'invalid'
      && item.resource_closure_status !== 'incomplete';
  }
  if (item.entrypoint_authority_status === 'not_applicable') {
    return item.status === 'ready'
      && item.source_authority !== 'missing'
      && item.source_payload_sha256 !== null
      && item.payload_currentness === 'current'
      && item.frontmatter_schema_status === 'valid'
      && item.resource_closure_status === 'complete';
  }
  return item.status === 'ready'
    && item.source_authority !== 'missing'
    && item.source_payload_sha256 !== null
    && item.payload_currentness === 'current'
    && item.frontmatter_schema_status === 'valid'
    && item.resource_closure_status === 'complete'
    && item.entrypoint_authority_status === 'converged';
}

function dependencySyncDriftReasons(
  sync: ReturnType<typeof syncOplCompanionSkills>,
  skillIds: string[],
  toolIds: OplCompanionToolId[],
) {
  const reasons: string[] = [];
  const itemsById = new Map(sync.items.map((entry) => [entry.skill_id, entry]));
  for (const skillId of skillIds) {
    const item = itemsById.get(skillId);
    if (!item) {
      reasons.push(`missing_skill_readback:${skillId}`);
      continue;
    }
    if (!skillSyncItemCurrent(item)) reasons.push(`skill_drift:${skillId}`);
  }
  const toolsById = new Map(sync.tools.map((entry) => [entry.tool_id, entry]));
  for (const toolId of toolIds) {
    const tool = toolsById.get(toolId);
    if (!tool
      || !['ready', 'installed', 'updated'].includes(tool.status)
      || tool.currentness === 'missing'
      || tool.currentness === 'update_available') {
      reasons.push(`tool_drift:${toolId}`);
    }
  }
  return reasons;
}

export function repairManagedPolicyDependenciesFromDescriptor(input: {
  manifest: Pick<
    AgentPackageManifest,
    'package_id' | 'version' | 'plugin_id' | 'required_skill_ids' | 'managed_policy_surface'
  >;
  sourceRoot: string;
  activeCarrierIdentity?: string | null;
  dryRun?: boolean;
  networkAccess?: OplCompanionNetworkAccess;
}) {
  const { manifest, sourceRoot } = input;
  const config = manifest.managed_policy_surface;
  if (!config) return null;

  const inspection = inspectManagedPolicySurface({
    identity: {
      packageId: manifest.package_id,
      packageVersion: manifest.version,
      pluginId: manifest.plugin_id,
      activeCarrierIdentity: input.activeCarrierIdentity,
      requiredSkillIds: manifest.required_skill_ids,
      config,
    },
    sourceRoot,
  });
  const {
    dependencies,
    skillIds,
    toolIds,
    managedSkillDependencies,
  } = managedPolicyDependencySelection({
    requires: inspection.policy.requires,
    experienceBaseline: inspection.policy.experience_baseline,
  });
  const dryRun = input.dryRun === true;
  const dependencySync = syncOplCompanionSkills(inspection.home, {
    mode: dryRun ? 'ask_to_apply' : 'managed',
    skillIds,
    toolIds,
    managedSkillDependencies,
    networkAccess: input.networkAccess ?? 'allowed',
  });
  const writesPerformed = !dryRun && (
    dependencySync.items.some((entry) => ['synced', 'installed'].includes(entry.status))
    || dependencySync.tools.some((entry) => entry.action === 'install' || entry.action === 'update')
  );

  if (dryRun) {
    return {
      surface_kind: 'opl_package_managed_policy_dependency_repair' as const,
      status: 'validated_no_write' as const,
      dependency_ids: [...new Set(dependencies.map((entry) => entry.id))],
      dependency_sync: dependencySync,
      currentness: managedPolicyCurrentnessFromDescriptor({
        manifest,
        sourceRoot,
        activeCarrierIdentity: input.activeCarrierIdentity,
      }),
      writes_performed: false,
    };
  }

  const readback = syncOplCompanionSkills(inspection.home, {
    mode: 'observe',
    skillIds,
    toolIds,
    managedSkillDependencies,
    networkAccess: 'forbidden',
  });
  const remainingDrift = dependencySyncDriftReasons(readback, skillIds, toolIds);
  if (remainingDrift.length > 0) {
    throw new FrameworkContractError(
      'codex_command_failed',
      'Installed Package managed dependency repair did not converge.',
      {
        package_id: manifest.package_id,
        remaining_drift: remainingDrift,
        dependency_sync: readback,
        failure_code: 'agent_package_managed_dependency_repair_incomplete',
      },
    );
  }

  return {
    surface_kind: 'opl_package_managed_policy_dependency_repair' as const,
    status: writesPerformed ? 'repaired' as const : 'current' as const,
    dependency_ids: [...new Set(dependencies.map((entry) => entry.id))],
    dependency_sync: readback,
    currentness: managedPolicyCurrentnessFromDescriptor({
      manifest,
      sourceRoot,
      activeCarrierIdentity: input.activeCarrierIdentity,
    }),
    writes_performed: writesPerformed,
  };
}

function capabilityReadbackFromSync(input: {
  dependency: AgentPackageManagedPolicyDependency;
  sync: ReturnType<typeof syncOplCompanionSkills>;
}): AgentPackageManagedPolicyCapabilityReadbackItem {
  const { dependency, sync } = input;
  if (dependency.kind === 'codex_skill') {
    const item = sync.items.find((entry) => entry.skill_id === dependency.id);
    if (!item) {
      return {
        id: dependency.id,
        kind: dependency.kind,
        status: 'missing',
        reason: 'missing_skill_readback',
      };
    }
    if (skillSyncItemCurrent(item)) {
      return { id: dependency.id, kind: dependency.kind, status: 'available', reason: null };
    }
    return {
      id: dependency.id,
      kind: dependency.kind,
      status: item.source_authority === 'missing' || item.status === 'missing_source'
        ? 'missing'
        : 'drifted',
      reason: item.note ?? `skill_${item.status}`,
    };
  }
  if (dependency.kind === 'cli' && SUPPORTED_COMPANION_TOOL_IDS.has(dependency.id)) {
    const tool = sync.tools.find((entry) => entry.tool_id === dependency.id);
    if (!tool || tool.status === 'missing' || tool.currentness === 'missing') {
      return { id: dependency.id, kind: dependency.kind, status: 'missing', reason: 'tool_missing' };
    }
    if (['ready', 'installed', 'updated'].includes(tool.status)
      && tool.currentness !== 'update_available') {
      return { id: dependency.id, kind: dependency.kind, status: 'available', reason: null };
    }
    return {
      id: dependency.id,
      kind: dependency.kind,
      status: 'drifted',
      reason: `tool_${tool.status}:${tool.currentness}`,
    };
  }
  return {
    id: dependency.id,
    kind: dependency.kind,
    status: 'unobserved',
    reason: 'no_generic_presence_probe',
  };
}

function experienceBaselineReadback(input: {
  manifest: Pick<AgentPackageManifest, 'package_id'>;
  policy: OplFlowPolicy;
  sync: ReturnType<typeof syncOplCompanionSkills>;
}): AgentPackageExperienceBaselineReadback {
  const capabilities = input.policy.experience_baseline.map((dependency) =>
    capabilityReadbackFromSync({ dependency, sync: input.sync })
  );
  const failureIds = [...new Set(capabilities
    .filter((entry) => entry.status === 'missing' || entry.status === 'drifted')
    .map((entry) => entry.id))];
  return {
    status: failureIds.length > 0 ? 'degraded' : 'current',
    failure_ids: failureIds,
    repair_command: failureIds.length > 0
      ? `opl packages repair --package-id ${input.manifest.package_id}`
      : null,
    capabilities,
  };
}

function specializedCapabilitiesReadback(input: {
  home: string;
  policy: OplFlowPolicy;
}): AgentPackageSpecializedCapabilitiesReadback {
  if (input.policy.compatible_optional.length === 0) {
    return {
      status: 'not_declared',
      repair_command: null,
      capabilities: [],
    };
  }
  const optionalSkills = input.policy.compatible_optional
    .filter((dependency) => dependency.kind === 'codex_skill');
  const optionalSync = syncOplCompanionSkills(input.home, {
    mode: 'observe',
    skillIds: optionalSkills.map((dependency) => dependency.id),
    toolIds: [],
    managedSkillDependencies: optionalSkills.map((dependency) => ({
      id: dependency.id,
      sourceMode: 'observe_existing' as const,
      legacySource: dependency.source ?? dependency.id,
      versionRequirement: dependency.version_requirement,
      installSource: dependency.install_source,
      required: false,
    })),
    networkAccess: 'forbidden',
  });
  const capabilities = input.policy.compatible_optional.map((dependency) => {
    const readback = capabilityReadbackFromSync({ dependency, sync: optionalSync });
    return readback.status === 'missing'
      ? { ...readback, reason: 'optional_capability_not_installed' }
      : readback;
  });
  const observed = capabilities.filter((entry) => entry.status !== 'unobserved');
  const availableCount = observed.filter((entry) => entry.status === 'available').length;
  const status: AgentPackageSpecializedCapabilitiesReadback['status'] = capabilities.every(
    (entry) => entry.status === 'unobserved',
  )
    ? 'unobserved'
    : capabilities.every((entry) => entry.status === 'available')
      ? 'available'
      : capabilities.some((entry) => entry.status === 'unobserved')
        ? 'partial'
      : availableCount === 0 && observed.length > 0
        ? 'absent'
        : 'partial';
  return { status, repair_command: null, capabilities };
}

export function managedPolicyCurrentnessFromDescriptor(input: {
  manifest: Pick<
    AgentPackageManifest,
    'package_id' | 'version' | 'plugin_id' | 'required_skill_ids' | 'managed_policy_surface'
  >;
  sourceRoot: string;
  activeCarrierIdentity?: string | null;
  enabledMigrationIds?: string[];
  expectedPolicySha256?: string | null;
  detail?: 'fast' | 'full';
}): AgentPackageManagedPolicyCurrentness {
  const { manifest, sourceRoot } = input;
  const config = manifest.managed_policy_surface;
  if (!config) {
    return noManagedPolicyCurrentness('Package does not request a managed policy surface.');
  }

  const policyPath = path.resolve(sourceRoot, config.source_path);
  const schemaPath = path.resolve(sourceRoot, config.schema_path);
  const expectedPolicySha256 = input.expectedPolicySha256 ?? null;
  const actualPolicySha256 = policyPath && fs.existsSync(policyPath) && fs.statSync(policyPath).isFile()
    ? sha256File(policyPath)
    : null;
  const invalid = (reason: string): AgentPackageManagedPolicyCurrentness => ({
    surface_kind: 'opl_package_managed_policy_currentness',
    status: 'invalid',
    policy_kind: config.policy_kind,
    policy_path: policyPath,
    schema_path: schemaPath,
    expected_policy_sha256: expectedPolicySha256,
    actual_policy_sha256: actualPolicySha256,
    inventory_digest: null,
    enabled_migration_ids: input.enabledMigrationIds ?? [],
    detected_conflicts: [],
    dependency_sync: null,
    required_dependencies_operational: false,
    required_dependency_failure_ids: [],
    model_projection: null,
    capability_strategy: null,
    repair_command: `opl packages repair --package-id ${manifest.package_id}`,
    reason,
  });
  if (!sourceRoot) {
    return invalid('Managed policy source root is unavailable from the installed Package descriptor.');
  }

  try {
    const inspection = inspectManagedPolicySurface({
      identity: {
        packageId: manifest.package_id,
        packageVersion: manifest.version,
        pluginId: manifest.plugin_id,
        activeCarrierIdentity: input.activeCarrierIdentity,
        requiredSkillIds: manifest.required_skill_ids,
        config,
      },
      sourceRoot,
      enabledMigrationIds: input.enabledMigrationIds,
    });
    if (expectedPolicySha256 && inspection.policySha256 !== expectedPolicySha256) {
      return invalid('Managed policy bytes no longer match the installed package transaction.');
    }
    const {
      skillIds,
      toolIds,
      managedSkillDependencies,
    } = managedPolicyDependencySelection({
      requires: inspection.policy.requires,
      experienceBaseline: inspection.policy.experience_baseline,
    });
    const dependencySync = syncOplCompanionSkills(inspection.home, {
      mode: 'observe',
      skillIds,
      toolIds,
      managedSkillDependencies,
      networkAccess: 'forbidden',
      toolInspection: input.detail === 'fast' ? 'fast' : 'full',
    });
    const dependencyDriftReasons = dependencySyncDriftReasons(dependencySync, skillIds, toolIds);
    const experienceBaseline = experienceBaselineReadback({
      manifest,
      policy: inspection.policy,
      sync: dependencySync,
    });
    const specializedCapabilities = specializedCapabilitiesReadback({
      home: inspection.home,
      policy: inspection.policy,
    });
    const requiredSkillIds = inspection.policy.requires
      .filter((dependency) => dependency.kind === 'codex_skill' && dependency.online_install_default)
      .map((dependency) => dependency.id);
    const dependencyItemsById = new Map(
      dependencySync.items.map((item) => [item.skill_id, item]),
    );
    const requiredDependencyFailureIds = requiredSkillIds.filter((skillId) => {
      const item = dependencyItemsById.get(skillId);
      return !item || !skillSyncItemCurrent(item);
    });
    const requiredDependenciesOperational = requiredDependencyFailureIds.length === 0;
    const conflictDrifted = inspection.detectedConflicts.length > 0;
    const drifted = conflictDrifted || dependencyDriftReasons.length > 0;
    const capabilityStrategy = compileFlowCapabilityStrategy({
      schema: inspection.policy.schema,
      package: inspection.policy.package,
      requires: inspection.policy.requires,
      experienceBaseline: inspection.policy.experience_baseline,
      compatibleOptional: inspection.policy.compatible_optional,
      capabilityBundles: inspection.policy.capability_bundles,
      policySha256: inspection.policySha256,
    });
    return {
      surface_kind: 'opl_package_managed_policy_currentness',
      status: drifted ? 'drifted' : 'current',
      policy_kind: config.policy_kind,
      policy_path: inspection.policyPath,
      schema_path: inspection.schemaPath,
      expected_policy_sha256: expectedPolicySha256,
      actual_policy_sha256: inspection.policySha256,
      inventory_digest: inspection.inventoryDigest,
      enabled_migration_ids: inspection.enabledMigrationIds,
      detected_conflicts: inspection.detectedConflicts,
      dependency_sync: dependencySync as unknown as Record<string, unknown>,
      required_dependencies_operational: requiredDependenciesOperational,
      required_dependency_failure_ids: requiredDependencyFailureIds,
      experience_baseline: experienceBaseline,
      specialized_capabilities: specializedCapabilities,
      model_projection: codexModelPolicyProjection(inspection.policy.codex_model_policy),
      capability_strategy: capabilityStrategy,
      repair_command: requiredDependenciesOperational
        ? null
        : `opl packages repair --package-id ${manifest.package_id}`,
      reason: drifted
        ? [
            conflictDrifted
              ? `Managed policy drift detected on ${inspection.detectedConflicts.length} discovery surface(s).`
              : null,
            dependencyDriftReasons.length > 0
              ? `Managed dependency drift detected: ${dependencyDriftReasons.join(', ')}.`
              : null,
          ].filter(Boolean).join(' ')
        : 'Managed policy is current; no conflicting discovery surface is present.',
    };
  } catch (error) {
    return invalid(error instanceof Error ? error.message : 'Managed policy readback failed.');
  }
}
