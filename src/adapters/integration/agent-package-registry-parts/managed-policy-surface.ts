import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { assertJsonSchemaPayload } from '../../../kernel/schema-registry.ts';
import { readLocalCodexDefaultsIfAvailable } from '../../../kernel/local-codex-defaults.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import {
  OPL_COMPANION_TOOL_IDS,
  syncOplCompanionSkills,
  type OplCompanionNetworkAccess,
  type OplCompanionToolId,
  type OplManagedSkillDependency,
} from '../install-companions.ts';
import { resolveCodexConfigPath, resolveCodexHome, sha256Text } from './shared.ts';
import { idAliases, parseTomlDocument } from './codex-config-document.ts';
export { parseTomlDocument, renderTomlDocument } from './codex-config-document.ts';
export type { TomlTableBlock } from './codex-config-document.ts';
import {
  compileFlowCapabilityStrategy,
  normalizeFlowCapabilityBundles,
} from './flow-capability-compiler.ts';
import type {
  AgentPackageExperienceBaselineReadback,
  AgentPackageCodexModelPolicyProjection,
  AgentPackageFlowCapabilityBundle,
  AgentPackageManagedPolicyCurrentness,
  AgentPackageManagedPolicyCapabilityReadbackItem,
  AgentPackageManagedPolicyDependency,
  AgentPackageManagedPolicyDetectedConflict,
  AgentPackageManifest,
  AgentPackageSpecializedCapabilitiesReadback,
} from './types.ts';

const MIGRATION_SURFACE_KINDS = [
  'plugin',
  'skill',
  'service',
  'config_table',
  'prompt_or_agent',
] as const;
const SUPPORTED_COMPANION_TOOL_IDS = new Set<string>(OPL_COMPANION_TOOL_IDS);

type MigrationSurfaceKind = typeof MIGRATION_SURFACE_KINDS[number];

type MigrationGroup = {
  id: string;
  discovery_ids: string[];
  surface_kinds: MigrationSurfaceKind[];
  auto_retire_on_optimize: boolean;
  reason: string;
};

type HistoricalFingerprints = {
  plugin_ids: string[];
  skill_ids: string[];
  service_ids: string[];
  config_markers: string[];
  legacy_prompt_ids: string[];
};

type OplFlowPolicy = {
  schema:
    | 'opl_flow_workflow_policy.v1'
    | 'opl_flow_workflow_policy.v2'
    | 'opl_flow_workflow_policy.v3'
    | 'opl_flow_workflow_policy.v4';
  package: { id: string; version: string; owner: string; kind: string };
  workflow_generation: string;
  provides: AgentPackageManagedPolicyDependency[];
  requires: AgentPackageManagedPolicyDependency[];
  recommends: AgentPackageManagedPolicyDependency[];
  experience_baseline: AgentPackageManagedPolicyDependency[];
  compatible_optional: AgentPackageManagedPolicyDependency[];
  capability_bundles: AgentPackageFlowCapabilityBundle[];
  conflicts: MigrationGroup[];
  retires: MigrationGroup[];
  migration_policy: Record<string, unknown>;
  historical_fingerprints: HistoricalFingerprints;
  codex_model_policy: Omit<
    AgentPackageCodexModelPolicyProjection,
    'surface_kind' | 'configured_default_role' | 'effective_selection' | 'role'
  >;
  installation_convergence: Record<string, unknown> | null;
};

function normalizeCodexModelPolicy(
  value: Record<string, unknown>,
): OplFlowPolicy['codex_model_policy'] {
  const configuredDefault = isRecord(value.configured_default)
    ? value.configured_default
    : null;
  const model = configuredDefault && typeof configuredDefault.model === 'string'
    ? configuredDefault.model.trim()
    : '';
  const reasoningEffort = configuredDefault && typeof configuredDefault.reasoning_effort === 'string'
    ? configuredDefault.reasoning_effort.trim()
    : '';
  const overridePrecedence = stringArray(
    value.override_precedence,
    'codex_model_policy.override_precedence',
  );
  if (
    value.authority !== 'opl-flow'
    || value.mode_default !== 'auto'
    || !model
    || !reasoningEffort
    || overridePrecedence.length === 0
    || new Set(overridePrecedence).size !== overridePrecedence.length
    || !isRecord(value.catalog_policy)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Managed policy Codex model recommendation is invalid.',
      { failure_code: 'agent_package_managed_policy_model_projection_invalid' },
    );
  }
  return {
    authority: 'opl-flow',
    mode_default: 'auto',
    configured_default: {
      model,
      reasoning_effort: reasoningEffort,
    },
    override_precedence: overridePrecedence,
    catalog_policy: structuredClone(value.catalog_policy),
  };
}

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

type InventoryItem = {
  surfaceKind: AgentPackageManagedPolicyDetectedConflict['surface_kind'];
  canonicalId: string;
  aliases: string[];
  physicalRef: string;
};

type ManagedPolicyIdentity = {
  packageId: string;
  packageVersion: string;
  pluginId: string | null;
  activeCarrierIdentity?: string | null;
  requiredSkillIds: string[];
  config: NonNullable<AgentPackageManifest['managed_policy_surface']>;
};

type ClassifiedInventoryItem = {
  item: InventoryItem;
  migrationId: string;
};

type ManagedPolicyInspection = {
  config: ManagedPolicyIdentity['config'];
  policy: OplFlowPolicy;
  policyPath: string;
  schemaPath: string;
  home: string;
  policySha256: string;
  inventoryDigest: string;
  enabledMigrationIds: string[];
  detectedConflicts: AgentPackageManagedPolicyDetectedConflict[];
};

function sha256File(filePath: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function resolveInside(root: string, relativePath: string, field: string) {
  const resolvedRoot = fs.realpathSync(root);
  const candidate = path.resolve(resolvedRoot, relativePath);
  if (!candidate.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} escapes the package root.`, {
      field,
      root: resolvedRoot,
      relative_path: relativePath,
      failure_code: 'agent_package_managed_policy_path_invalid',
    });
  }
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} was not found in the package payload.`, {
      field,
      path: candidate,
      failure_code: 'agent_package_managed_policy_source_missing',
    });
  }
  const resolved = fs.realpathSync(candidate);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} escapes the package root.`, {
      field,
      root: resolvedRoot,
      relative_path: relativePath,
      resolved_path: resolved,
      failure_code: 'agent_package_managed_policy_path_invalid',
    });
  }
  return resolved;
}

function stringArray(value: unknown, field: string, allowEmpty = false) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be an array of non-empty strings.`, {
      field,
      failure_code: 'agent_package_managed_policy_invalid',
    });
  }
  const normalized = [...new Set(value.map((entry) => String(entry).trim()))];
  if ((!allowEmpty && normalized.length === 0) || normalized.length !== value.length) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must contain unique values.`, {
      field,
      failure_code: 'agent_package_managed_policy_invalid',
    });
  }
  return normalized;
}

function normalizeDependency(
  value: unknown,
  field: string,
  schema: OplFlowPolicy['schema'],
): AgentPackageManagedPolicyDependency {
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be an object.`, {
      field,
      failure_code: 'agent_package_managed_policy_invalid',
    });
  }
  const kind = value.kind;
  const offlineBundle = value.offline_bundle;
  const activation = value.activation;
  const supportedKinds = schema !== 'opl_flow_workflow_policy.v1'
    ? ['base', 'codex_skill', 'codex_plugin', 'mcp_server', 'cli', 'runtime_capability']
    : ['base', 'codex_skill', 'cli', 'runtime_capability'];
  const openComposition = schema === 'opl_flow_workflow_policy.v3'
    || schema === 'opl_flow_workflow_policy.v4';
  if (
    typeof value.id !== 'string'
    || !value.id.trim()
    || !supportedKinds.includes(String(kind))
    || (!openComposition && !['none', 'full'].includes(String(offlineBundle)))
    || (offlineBundle !== undefined && !['none', 'full'].includes(String(offlineBundle)))
    || typeof value.online_install_default !== 'boolean'
    || !['always', 'task_routed', 'explicit'].includes(String(activation))
    || (!openComposition && typeof value.source !== 'string')
    || (value.source !== undefined && typeof value.source !== 'string')
    || (value.source_path !== undefined
      && (typeof value.source_path !== 'string' || !value.source_path.trim()))
  ) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} has an invalid dependency shape.`, {
      field,
      failure_code: 'agent_package_managed_policy_invalid',
    });
  }
  const v2Fields = {
    owner: value.owner,
    version_requirement: value.version_requirement,
    install_source: value.install_source,
    lifecycle_owner: value.lifecycle_owner,
    conflict_policy: value.conflict_policy,
    credential_policy: value.credential_policy,
  };
  if (openComposition && (
    (value.owner !== undefined && (typeof value.owner !== 'string' || !value.owner.trim()))
    || (value.version_requirement !== undefined
      && (typeof value.version_requirement !== 'string' || !value.version_requirement.trim()))
    || (value.install_source !== undefined
      && (typeof value.install_source !== 'string' || !value.install_source.trim()))
    || (value.lifecycle_owner !== undefined
      && (typeof value.lifecycle_owner !== 'string' || !value.lifecycle_owner.trim()))
    || (value.conflict_policy !== undefined
      && !['managed_reconcile', 'preserve_user_surface', 'fail_closed_on_collision']
        .includes(String(value.conflict_policy)))
    || (value.credential_policy !== undefined
      && !['none', 'user_or_provider_owned_not_bundled'].includes(String(value.credential_policy)))
    || (value.bundle_id !== undefined
      && (typeof value.bundle_id !== 'string' || !value.bundle_id.trim()))
    || (value.readiness_adapter !== undefined
      && ![
        'codex_skill_payload',
        'binary_version',
        'agent_reach_doctor',
        'runtime_observation',
      ].includes(String(value.readiness_adapter)))
  )) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} has invalid optional lifecycle hints.`, {
      field,
      failure_code: 'agent_package_managed_policy_invalid',
    });
  }
  if (schema === 'opl_flow_workflow_policy.v2' && (
    typeof v2Fields.owner !== 'string'
    || !v2Fields.owner.trim()
    || typeof v2Fields.version_requirement !== 'string'
    || !v2Fields.version_requirement.trim()
    || !['package_payload', 'framework_managed_release_lock', 'codex_builtin', 'user_managed']
      .includes(String(v2Fields.install_source))
    || typeof v2Fields.lifecycle_owner !== 'string'
    || !v2Fields.lifecycle_owner.trim()
    || !['managed_reconcile', 'preserve_user_surface', 'fail_closed_on_collision']
      .includes(String(v2Fields.conflict_policy))
    || !['none', 'user_or_provider_owned_not_bundled'].includes(String(v2Fields.credential_policy))
  )) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} is missing v2 lifecycle metadata.`, {
      field,
      failure_code: 'agent_package_managed_policy_invalid',
    });
  }
  return {
    id: value.id.trim(),
    kind: kind as AgentPackageManagedPolicyDependency['kind'],
    ...(offlineBundle === undefined
      ? {}
      : { offline_bundle: offlineBundle as AgentPackageManagedPolicyDependency['offline_bundle'] }),
    online_install_default: value.online_install_default,
    activation: activation as AgentPackageManagedPolicyDependency['activation'],
    ...(value.source === undefined ? {} : { source: value.source }),
    ...(value.source_path === undefined ? {} : { source_path: String(value.source_path).trim() }),
    ...(schema === 'opl_flow_workflow_policy.v2'
      ? {
          owner: String(v2Fields.owner).trim(),
          version_requirement: String(v2Fields.version_requirement).trim(),
          install_source: v2Fields.install_source as NonNullable<AgentPackageManagedPolicyDependency['install_source']>,
          lifecycle_owner: String(v2Fields.lifecycle_owner).trim(),
          conflict_policy: v2Fields.conflict_policy as NonNullable<AgentPackageManagedPolicyDependency['conflict_policy']>,
          credential_policy: v2Fields.credential_policy as NonNullable<AgentPackageManagedPolicyDependency['credential_policy']>,
        }
      : openComposition
        ? {
            ...(value.owner === undefined ? {} : { owner: String(value.owner).trim() }),
            ...(value.version_requirement === undefined
              ? {}
              : { version_requirement: String(value.version_requirement).trim() }),
            ...(value.install_source === undefined
              ? {}
              : { install_source: String(value.install_source).trim() }),
            ...(value.lifecycle_owner === undefined
              ? {}
              : { lifecycle_owner: String(value.lifecycle_owner).trim() }),
            ...(value.conflict_policy === undefined
              ? {}
              : {
                  conflict_policy: value.conflict_policy as NonNullable<
                    AgentPackageManagedPolicyDependency['conflict_policy']
                  >,
                }),
            ...(value.credential_policy === undefined
              ? {}
              : {
                  credential_policy: value.credential_policy as NonNullable<
                    AgentPackageManagedPolicyDependency['credential_policy']
                  >,
                }),
            ...(value.bundle_id === undefined
              ? {}
              : { bundle_id: String(value.bundle_id).trim() }),
            ...(value.readiness_adapter === undefined
              ? {}
              : {
                  readiness_adapter: value.readiness_adapter as NonNullable<
                    AgentPackageManagedPolicyDependency['readiness_adapter']
                  >,
                }),
          }
        : {}),
  };
}

function dependencyKey(value: Pick<AgentPackageManagedPolicyDependency, 'kind' | 'id'>) {
  return `${value.kind}:${value.id}`;
}

function assertUniqueDependencyIdentities(
  dependencies: AgentPackageManagedPolicyDependency[],
  field: string,
) {
  const keys = dependencies.map(dependencyKey);
  const duplicates = [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))];
  if (duplicates.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} contains duplicate (kind, id) identities.`, {
      field,
      duplicate_dependency_keys: duplicates,
      failure_code: 'agent_package_managed_policy_dependency_identity_duplicate',
    });
  }
}

function normalizeInstallationConvergence(value: unknown) {
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'installation_convergence must be an object.', {
      failure_code: 'agent_package_managed_policy_convergence_invalid',
    });
  }
  const expected = {
    standard_target_closure: 'workflow_policy_release_lock',
    full_target_closure: 'workflow_policy_release_lock',
    standard_source: 'online_exact_release_lock',
    full_source: 'embedded_exact_release_lock',
    final_projection_equivalence_required: true,
    default_dependencies_require_full_bundle: true,
    secrets_bundled: false,
    user_third_party_surfaces_policy: 'preserve',
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (value[field] !== expectedValue) {
      throw new FrameworkContractError('contract_shape_invalid', 'Managed policy installation convergence is invalid.', {
        field: `installation_convergence.${field}`,
        expected: expectedValue,
        actual: value[field],
        failure_code: 'agent_package_managed_policy_convergence_invalid',
      });
    }
  }
  return value;
}

function normalizeGroups(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be an array.`, {
      field,
      failure_code: 'agent_package_managed_policy_invalid',
    });
  }
  return value.map((entry, index): MigrationGroup => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.reason !== 'string') {
      throw new FrameworkContractError('contract_shape_invalid', `${field}[${index}] has an invalid migration shape.`, {
        field,
        index,
        failure_code: 'agent_package_managed_policy_invalid',
      });
    }
    const surfaceKinds = entry.surface_kinds === undefined
      ? [...MIGRATION_SURFACE_KINDS]
      : stringArray(entry.surface_kinds, `${field}[${index}].surface_kinds`);
    const invalidSurfaceKinds = surfaceKinds.filter((surfaceKind) =>
      !MIGRATION_SURFACE_KINDS.includes(surfaceKind as MigrationSurfaceKind));
    if (invalidSurfaceKinds.length > 0) {
      throw new FrameworkContractError('contract_shape_invalid', `${field}[${index}] has invalid surface kinds.`, {
        field,
        index,
        invalid_surface_kinds: invalidSurfaceKinds,
        failure_code: 'agent_package_managed_policy_invalid',
      });
    }
    return {
      id: entry.id,
      discovery_ids: stringArray(entry.discovery_ids, `${field}[${index}].discovery_ids`),
      surface_kinds: surfaceKinds as MigrationSurfaceKind[],
      auto_retire_on_optimize: entry.auto_retire_on_optimize === true,
      reason: entry.reason,
    };
  });
}

function normalizePolicy(
  payload: unknown,
  identity: Pick<ManagedPolicyIdentity, 'packageId' | 'packageVersion'>,
): OplFlowPolicy {
  if (!isRecord(payload) || !isRecord(payload.package) || !isRecord(payload.migration_policy)
    || !isRecord(payload.historical_fingerprints) || !isRecord(payload.codex_model_policy)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Managed OPL Flow policy has an invalid root shape.', {
      package_id: identity.packageId,
      failure_code: 'agent_package_managed_policy_invalid',
    });
  }
  const schema = payload.schema;
  if (
    ![
      'opl_flow_workflow_policy.v1',
      'opl_flow_workflow_policy.v2',
      'opl_flow_workflow_policy.v3',
      'opl_flow_workflow_policy.v4',
    ]
      .includes(String(schema))
    || payload.package.id !== identity.packageId
    || payload.package.version !== identity.packageVersion
    || payload.package.owner !== 'opl-flow'
    || payload.package.kind !== 'workflow_profile'
    || payload.codex_model_policy.authority !== 'opl-flow'
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'Managed policy identity or version does not match the package manifest.', {
      package_id: identity.packageId,
      package_version: identity.packageVersion,
      policy_package: payload.package,
      failure_code: 'agent_package_managed_policy_identity_mismatch',
    });
  }
  const normalizedSchema = schema as OplFlowPolicy['schema'];
  const expectedMigrationPolicy = {
    trigger: 'explicit_opl_flow_install_update_optimize_or_generic_app_post_update_reconcile',
    default_action: 'backup_disable_and_remove_from_discovery',
    physical_delete: false,
    receipt_owner: 'opl-framework',
    rollback_required: true,
    keep_override_supported: true,
    fresh_discovery_required: true,
  };
  for (const [key, expected] of Object.entries(expectedMigrationPolicy)) {
    if (payload.migration_policy[key] !== expected) {
      throw new FrameworkContractError('contract_shape_invalid', 'Managed policy migration invariants are not compatible with OPL Packages.', {
        package_id: identity.packageId,
        field: `migration_policy.${key}`,
        expected,
        actual: payload.migration_policy[key],
        failure_code: 'agent_package_managed_policy_migration_invariant_invalid',
      });
    }
  }
  const fingerprints = payload.historical_fingerprints;
  const normalizeDependencies = (value: unknown, field: string) => Array.isArray(value)
    ? value.map((entry, index) => normalizeDependency(entry, `${field}[${index}]`, normalizedSchema))
    : [];
  const provides = normalizedSchema !== 'opl_flow_workflow_policy.v1'
    ? normalizeDependencies(payload.provides, 'provides')
    : [];
  const requires = normalizeDependencies(payload.requires, 'requires');
  const recommends = normalizedSchema === 'opl_flow_workflow_policy.v4'
    ? []
    : normalizeDependencies(payload.recommends, 'recommends');
  const experienceBaseline = normalizedSchema === 'opl_flow_workflow_policy.v4'
    ? normalizeDependencies(payload.experience_baseline, 'experience_baseline')
    : [];
  const compatibleOptional = normalizeDependencies(payload.compatible_optional, 'compatible_optional');
  const capabilityBundles = normalizedSchema === 'opl_flow_workflow_policy.v4'
    ? normalizeFlowCapabilityBundles(payload.capability_bundles)
    : [];
  assertUniqueDependencyIdentities(provides, 'provides');
  assertUniqueDependencyIdentities(
    [...requires, ...recommends, ...experienceBaseline, ...compatibleOptional],
    'dependencies',
  );
  if (normalizedSchema === 'opl_flow_workflow_policy.v2') {
    const invalidProvided = provides.filter((entry) => (
      !['codex_plugin', 'codex_skill'].includes(entry.kind)
      || !entry.online_install_default
      || entry.offline_bundle !== 'full'
      || entry.install_source !== 'package_payload'
      || entry.lifecycle_owner !== 'opl-framework'
      || entry.credential_policy !== 'none'
    ));
    if (provides.length === 0 || invalidProvided.length > 0) {
      throw new FrameworkContractError('contract_shape_invalid', 'v2 provided capabilities must be package-carried Codex surfaces.', {
        invalid_provided_capability_keys: invalidProvided.map(dependencyKey),
        failure_code: 'agent_package_managed_policy_provides_invalid',
      });
    }
    const invalidDefaultDependencies = [...requires, ...recommends].filter((entry) => (
      entry.online_install_default && (
        entry.offline_bundle !== 'full'
        || entry.lifecycle_owner !== 'opl-framework'
      )
    ));
    if (invalidDefaultDependencies.length > 0) {
      throw new FrameworkContractError('contract_shape_invalid', 'Default dependencies must converge through Framework in Standard and Full.', {
        invalid_dependency_keys: invalidDefaultDependencies.map(dependencyKey),
        failure_code: 'agent_package_managed_policy_default_closure_invalid',
      });
    }
  }
  return {
    schema: normalizedSchema,
    package: payload.package as OplFlowPolicy['package'],
    workflow_generation: String(payload.workflow_generation ?? ''),
    provides,
    requires,
    recommends,
    experience_baseline: experienceBaseline,
    compatible_optional: compatibleOptional,
    capability_bundles: capabilityBundles,
    conflicts: normalizeGroups(payload.conflicts, 'conflicts'),
    retires: normalizeGroups(payload.retires, 'retires'),
    migration_policy: payload.migration_policy,
    historical_fingerprints: {
      plugin_ids: stringArray(fingerprints.plugin_ids, 'historical_fingerprints.plugin_ids'),
      skill_ids: stringArray(fingerprints.skill_ids, 'historical_fingerprints.skill_ids'),
      service_ids: stringArray(fingerprints.service_ids, 'historical_fingerprints.service_ids'),
      config_markers: stringArray(fingerprints.config_markers, 'historical_fingerprints.config_markers'),
      legacy_prompt_ids: stringArray(fingerprints.legacy_prompt_ids, 'historical_fingerprints.legacy_prompt_ids'),
    },
    codex_model_policy: normalizeCodexModelPolicy(payload.codex_model_policy),
    installation_convergence: normalizedSchema === 'opl_flow_workflow_policy.v2'
      ? normalizeInstallationConvergence(payload.installation_convergence)
      : null,
  };
}

function assertProvidedCapabilities(
  policy: OplFlowPolicy,
  identity: Pick<ManagedPolicyIdentity, 'pluginId' | 'requiredSkillIds'>,
) {
  if (policy.schema === 'opl_flow_workflow_policy.v1') return;
  const pluginIds = policy.provides.filter((entry) => entry.kind === 'codex_plugin').map((entry) => entry.id);
  const skillIds = policy.provides.filter((entry) => entry.kind === 'codex_skill').map((entry) => entry.id).sort();
  const requiredSkillIds = [...identity.requiredSkillIds].sort();
  if (
    pluginIds.length !== 1
    || pluginIds[0] !== identity.pluginId
    || skillIds.length !== requiredSkillIds.length
    || skillIds.some((skillId, index) => skillId !== requiredSkillIds[index])
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'v2 provided capabilities do not match the package carrier.', {
      policy_plugin_ids: pluginIds,
      manifest_plugin_id: identity.pluginId,
      policy_skill_ids: skillIds,
      manifest_required_skill_ids: requiredSkillIds,
      failure_code: 'agent_package_managed_policy_provides_mismatch',
    });
  }
}

function directDirectoryInventory(root: string, surfaceKind: InventoryItem['surfaceKind']) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  return fs.readdirSync(root, { withFileTypes: true }).map((entry): InventoryItem => ({
    surfaceKind,
    canonicalId: entry.name,
    aliases: idAliases(entry.name),
    physicalRef: path.join(root, entry.name),
  }));
}

function serviceInventory(home: string) {
  const roots = [
    path.join(home, 'Library', 'LaunchAgents'),
    path.join(home, '.config', 'systemd', 'user'),
  ];
  const inventory = roots.flatMap((root) => directDirectoryInventory(root, 'service'));
  if (fs.existsSync(home)) {
    for (const entry of fs.readdirSync(home, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name.length > 1) {
        inventory.push({
          surfaceKind: 'service',
          canonicalId: entry.name.slice(1),
          aliases: idAliases(entry.name.slice(1)),
          physicalRef: path.join(home, entry.name),
        });
      }
    }
  }
  return inventory;
}

function promptInventory(codexHome: string) {
  return ['prompts', 'agents'].flatMap((directory) => {
    const root = path.join(codexHome, directory);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
    return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry): InventoryItem[] => {
      if (!entry.isFile()) return [];
      const id = path.parse(entry.name).name;
      return [{
        surfaceKind: 'prompt_or_agent',
        canonicalId: id,
        aliases: idAliases(id),
        physicalRef: path.join(root, entry.name),
      }];
    });
  });
}

function filesystemInventory(home: string, codexHome: string) {
  return [
    ...directDirectoryInventory(path.join(home, '.agents', 'skills'), 'skill'),
    ...directDirectoryInventory(path.join(home, '.skills-manager', 'skills'), 'skill'),
    ...directDirectoryInventory(path.join(codexHome, 'skills'), 'skill'),
    ...serviceInventory(home),
    ...promptInventory(codexHome),
  ];
}

function configTableInventory(configPath: string) {
  if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) return [];
  return parseTomlDocument(fs.readFileSync(configPath, 'utf8')).tables.flatMap((table): InventoryItem[] => {
    const canonicalId = table.header.replaceAll('"', '');
    const [namespace, ...identityParts] = canonicalId.split('.');
    if (namespace === 'projects' || namespace === 'marketplaces') return [];
    if (namespace === 'plugins' && !/^\s*enabled\s*=\s*true\s*(?:#.*)?$/m.test(table.content)) return [];
    const identity = identityParts.length > 0 ? identityParts.join('.') : canonicalId;
    return [{
      surfaceKind: 'config_table',
      canonicalId,
      aliases: idAliases(identity),
      physicalRef: configPath,
    }];
  });
}

function loadManagedPolicySurface(input: {
  identity: ManagedPolicyIdentity;
  sourceRoot: string;
}) {
  const { config } = input.identity;
  const policyPath = resolveInside(input.sourceRoot, config.source_path, 'managed_policy_surface.source_path');
  const schemaPath = resolveInside(input.sourceRoot, config.schema_path, 'managed_policy_surface.schema_path');
  const policyPayload = JSON.parse(fs.readFileSync(policyPath, 'utf8')) as unknown;
  const schemaPayload = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as unknown;
  assertJsonSchemaPayload({
    schemaId: `package-policy:${input.identity.packageId}:${input.identity.packageVersion}`,
    schema: schemaPayload as Record<string, unknown>,
    sourceRef: schemaPath,
  }, policyPayload);
  const policy = normalizePolicy(policyPayload, input.identity);
  assertProvidedCapabilities(policy, input.identity);
  return {
    config,
    policy,
    policyPath,
    schemaPath,
    policySha256: sha256File(policyPath),
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
  const recommended = policy.schema === 'opl_flow_workflow_policy.v4'
    ? policy.experience_baseline
    : policy.recommends;
  return [
    ...policy.requires.map((dependency) => ({ ...dependency, relationship: 'required' as const })),
    ...recommended.map((dependency) => ({ ...dependency, relationship: 'recommended' as const })),
  ];
}

function inspectManagedPolicySurface(input: {
  identity: ManagedPolicyIdentity;
  sourceRoot: string;
  keepMigrationIds?: string[];
  enabledMigrationIds?: string[];
}): ManagedPolicyInspection {
  const {
    config,
    policy,
    policyPath,
    schemaPath,
    policySha256,
  } = loadManagedPolicySurface(input);
  const groups = [...policy.conflicts, ...policy.retires];
  const groupsByAlias = new Map<string, MigrationGroup[]>();
  for (const group of groups) {
    for (const alias of group.discovery_ids.flatMap(idAliases)) {
      groupsByAlias.set(alias, [...(groupsByAlias.get(alias) ?? []), group]);
    }
  }
  const keep = new Set(input.keepMigrationIds ?? []);
  const explicitlyEnabled = input.enabledMigrationIds ? new Set(input.enabledMigrationIds) : null;
  const unknownMigrationIds = [...new Set([
    ...keep,
    ...(explicitlyEnabled ?? []),
  ])].filter((id) => !groups.some((group) => group.id === id));
  if (unknownMigrationIds.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Managed policy selection contains unknown migration ids.', {
      package_id: input.identity.packageId,
      unknown_migration_ids: unknownMigrationIds,
      available_migration_ids: groups.map((group) => group.id),
      failure_code: input.enabledMigrationIds
        ? 'agent_package_managed_policy_stored_migration_unknown'
        : 'agent_package_managed_policy_keep_unknown',
    });
  }
  const enabledGroups = new Map(groups
    .filter((group) => group.auto_retire_on_optimize
      && (explicitlyEnabled ? explicitlyEnabled.has(group.id) : !keep.has(group.id)))
    .map((group) => [group.id, group]));
  const pluginAliases = input.identity.pluginId ? idAliases(input.identity.pluginId) : [];
  const selfCarrierFingerprints = policy.historical_fingerprints.plugin_ids.filter((id) =>
    idAliases(id).some((alias) => pluginAliases.includes(alias)));
  const unclassifiedFingerprints = Object.values(policy.historical_fingerprints)
    .flat()
    .filter((fingerprint) => {
      const aliases = idAliases(fingerprint);
      return !aliases.some((alias) => groupsByAlias.has(alias))
        && !selfCarrierFingerprints.includes(fingerprint);
    });
  if (unclassifiedFingerprints.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Managed policy contains historical fingerprints that cannot be classified safely.', {
      package_id: input.identity.packageId,
      unclassified_historical_fingerprints: unclassifiedFingerprints,
      failure_code: 'agent_package_managed_policy_fingerprint_unclassified',
    });
  }

  const home = resolveOplStatePaths().home_dir;
  const codexHome = resolveCodexHome(home);
  const configPath = resolveCodexConfigPath(codexHome);
  const activeCarrierSeparator = input.identity.activeCarrierIdentity?.lastIndexOf('@') ?? -1;
  const activeCarrierPluginId = activeCarrierSeparator > 0
    ? input.identity.activeCarrierIdentity!.slice(0, activeCarrierSeparator)
    : null;
  const activeMarketplaceId = activeCarrierSeparator > 0
    ? input.identity.activeCarrierIdentity!.slice(activeCarrierSeparator + 1)
    : null;
  const currentCarrierIdentity = activeCarrierPluginId === input.identity.pluginId && activeMarketplaceId
    ? input.identity.activeCarrierIdentity
    : null;
  const managedMarketplaceIds = new Set([
    `opl-agent-${input.identity.packageId}-local`,
    ...(currentCarrierIdentity ? [activeMarketplaceId!] : []),
  ]);
  const managedMarketplaceRoots = [...managedMarketplaceIds].flatMap((marketplaceId) => [
    path.join(codexHome, 'plugins', 'cache', marketplaceId),
    path.join(codexHome, 'plugins', 'data', marketplaceId),
    path.join(codexHome, '.tmp', 'plugins', 'plugins', marketplaceId),
  ]);
  const managedConfigTables = new Set([
    ...[...managedMarketplaceIds].map((marketplaceId) => `marketplaces.${marketplaceId}`),
    ...(input.identity.pluginId
      ? [...managedMarketplaceIds].map((marketplaceId) =>
          `plugins.${input.identity.pluginId}@${marketplaceId}`)
      : []),
  ]);
  const isCurrentManagedCarrier = (physicalRef: string) => managedMarketplaceRoots.some((root) => {
    const relative = path.relative(root, physicalRef);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
  const inventory = [
    ...filesystemInventory(home, codexHome),
    ...configTableInventory(configPath),
  ];
  const inventoryDigest = sha256Text(JSON.stringify(inventory
    .map((entry) => ({ ...entry, aliases: [...entry.aliases].sort() }))
    .sort((left, right) => left.physicalRef.localeCompare(right.physicalRef))));
  const classified = inventory.flatMap((item): ClassifiedInventoryItem[] => {
    if (isCurrentManagedCarrier(item.physicalRef)) return [];
    if (item.surfaceKind === 'config_table' && managedConfigTables.has(item.canonicalId)) return [];
    const group = item.aliases
      .flatMap((alias) => groupsByAlias.get(alias) ?? [])
      .find((candidate) => enabledGroups.has(candidate.id)
        && candidate.surface_kinds.includes(item.surfaceKind as MigrationSurfaceKind));
    if (group) return [{ item, migrationId: group.id }];
    const selfCarrier = item.surfaceKind === 'plugin'
      && selfCarrierFingerprints.some((fingerprint) =>
        idAliases(fingerprint).some((alias) => item.aliases.includes(alias)));
    return selfCarrier
      ? [{ item: { ...item, surfaceKind: 'historical_self_carrier' }, migrationId: 'historical-self-carrier' }]
      : [];
  });
  const classifiedInventory = classified
    .sort((left, right) => left.item.physicalRef.length - right.item.physicalRef.length)
    .filter((entry, index, entries) => !entries.slice(0, index).some((selected) =>
      entry.item.physicalRef.startsWith(`${selected.item.physicalRef}${path.sep}`)));
  const detectedConflicts = classifiedInventory.map(({ item, migrationId }) => ({
    migration_id: migrationId,
    surface_kind: item.surfaceKind,
    canonical_id: item.canonicalId,
    physical_ref: item.physicalRef,
  }));
  return {
    config,
    policy,
    policyPath,
    schemaPath,
    home,
    policySha256,
    inventoryDigest,
    enabledMigrationIds: groups.filter((group) => enabledGroups.has(group.id)).map((group) => group.id),
    detectedConflicts,
  };
}

function managedPolicyDependencySelection(input: {
  schema: OplFlowPolicy['schema'];
  requires: AgentPackageManagedPolicyDependency[];
  recommends: AgentPackageManagedPolicyDependency[];
  experienceBaseline: AgentPackageManagedPolicyDependency[];
}) {
  const baseline = input.schema === 'opl_flow_workflow_policy.v4'
    ? input.experienceBaseline
    : input.recommends;
  const selected = [
    ...input.requires.map((dependency) => ({
      dependency,
      relationship: 'required' as const,
    })),
    ...baseline.map((dependency) => ({
      dependency,
      relationship: 'recommended' as const,
    })),
  ].filter((entry) => entry.dependency.online_install_default);
  const toolIdsByBundle = new Map<string, OplCompanionToolId[]>();
  for (const { dependency } of selected) {
    if (dependency.kind !== 'cli' || !SUPPORTED_COMPANION_TOOL_IDS.has(dependency.id) || !dependency.bundle_id) continue;
    const current = toolIdsByBundle.get(dependency.bundle_id) ?? [];
    current.push(dependency.id as OplCompanionToolId);
    toolIdsByBundle.set(dependency.bundle_id, current);
  }
  const managedSkillDependencies: OplManagedSkillDependency[] = input.schema === 'opl_flow_workflow_policy.v3'
    || input.schema === 'opl_flow_workflow_policy.v4'
    ? selected.flatMap(({ dependency, relationship }): OplManagedSkillDependency[] => {
    if (dependency.kind !== 'codex_skill') return [];
    if (input.schema === 'opl_flow_workflow_policy.v4' && dependency.install_source === 'owner_cli') {
      if (dependency.id !== 'agent-reach' || dependency.lifecycle_owner !== 'agent-reach') {
        throw new FrameworkContractError('contract_shape_invalid', 'Owner CLI Skill adapter is not registered for this Flow capability.', {
          dependency_key: dependencyKey(dependency),
          failure_code: 'agent_package_managed_policy_dependency_adapter_missing',
        });
      }
      return [{
        id: dependency.id,
        sourceMode: 'owner_cli' as const,
        ownerToolId: 'agent-reach' as const,
        owner: dependency.owner,
        requiredTools: dependency.bundle_id ? toolIdsByBundle.get(dependency.bundle_id) ?? [] : [],
        versionRequirement: dependency.version_requirement,
        installSource: dependency.install_source,
        required: relationship === 'required',
      }];
    }
    const repositoryUrl = dependency.source?.trim() ?? '';
    const repositorySourcePath = dependency.source_path?.trim() ?? '';
    const sourcePathSegments = repositorySourcePath.split('/');
    if (
      !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/.test(repositoryUrl)
      || !repositorySourcePath
      || repositorySourcePath.startsWith('/')
      || repositorySourcePath.includes('\\')
      || sourcePathSegments.some((segment) => segment === '..')
    ) {
      throw new FrameworkContractError('contract_shape_invalid', 'Managed policy Skill source must be a public GitHub repository and repository-relative source_path.', {
        dependency_key: dependencyKey(dependency),
        source: dependency.source,
        source_path: dependency.source_path,
        failure_code: 'agent_package_managed_policy_dependency_source_invalid',
      });
    }
    return [{
      id: dependency.id,
      sourceMode: 'observe_existing' as const,
      legacySource: `${repositoryUrl}#${repositorySourcePath}`,
      owner: dependency.owner,
      requiredTools: dependency.bundle_id ? toolIdsByBundle.get(dependency.bundle_id) ?? [] : [],
      versionRequirement: dependency.version_requirement,
      installSource: dependency.install_source,
      required: relationship === 'required',
    }];
  })
    : selected.flatMap(({ dependency, relationship }): OplManagedSkillDependency[] => {
      if (dependency.kind !== 'codex_skill') return [];
      const expectedSource = `skills-manager:${dependency.id}`;
      if (dependency.source?.startsWith('skills-manager:') && dependency.source !== expectedSource) {
        throw new FrameworkContractError('contract_shape_invalid', 'Legacy managed policy Skill source identity is invalid.', {
          dependency_key: dependencyKey(dependency),
          source: dependency.source,
          failure_code: 'agent_package_managed_policy_dependency_identity_mismatch',
        });
      }
      return [{
        id: dependency.id,
        sourceMode: 'observe_existing' as const,
        legacySource: dependency.source ?? dependency.id,
        owner: dependency.owner,
        requiredTools: [],
        versionRequirement: dependency.version_requirement,
        installSource: dependency.install_source,
        required: relationship === 'required',
      }];
    });
  if (
    input.schema !== 'opl_flow_workflow_policy.v3'
    && input.schema !== 'opl_flow_workflow_policy.v4'
  ) {
    const unsupported = selected
      .map(({ dependency }) => dependency)
      .filter((dependency) => {
        if (dependency.kind === 'base') return dependency.id !== 'opl-base';
        if (dependency.kind === 'codex_skill') return false;
        if (dependency.kind === 'cli') return dependency.id !== 'officecli'
          && dependency.id !== 'mineru-open-api';
        return true;
      });
    if (unsupported.length > 0) {
      throw new FrameworkContractError('contract_shape_invalid', 'Managed policy dependency has no lifecycle adapter.', {
        dependency_keys: unsupported.map(dependencyKey),
        failure_code: 'agent_package_managed_policy_dependency_adapter_missing',
      });
    }
  }
  if (input.schema === 'opl_flow_workflow_policy.v3'
    || input.schema === 'opl_flow_workflow_policy.v4') {
    const unsupported = selected
      .map(({ dependency }) => dependency)
      .filter((dependency) => {
        if (dependency.kind === 'base') return dependency.id !== 'opl-base';
        if (dependency.kind === 'codex_skill') return false;
        if (dependency.kind === 'cli') return !SUPPORTED_COMPANION_TOOL_IDS.has(dependency.id);
        return true;
      });
    if (unsupported.length > 0) {
      throw new FrameworkContractError('contract_shape_invalid', 'Managed policy dependency has no lifecycle adapter.', {
        dependency_keys: unsupported.map(dependencyKey),
        failure_code: 'agent_package_managed_policy_dependency_adapter_missing',
      });
    }
  }
  return {
    dependencies: selected.map(({ dependency, relationship }) => ({
      ...dependency,
      relationship,
    })),
    skillIds: selected
      .filter(({ dependency }) => dependency.kind === 'codex_skill')
      .map(({ dependency }) => dependency.id),
    toolIds: selected
      .filter(({ dependency }) => dependency.kind === 'cli'
        && SUPPORTED_COMPANION_TOOL_IDS.has(dependency.id))
      .map(({ dependency }) => dependency.id as OplCompanionToolId),
    managedSkillDependencies,
  };
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
    schema: inspection.policy.schema,
    requires: inspection.policy.requires,
    recommends: inspection.policy.recommends,
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
  if (input.policy.schema !== 'opl_flow_workflow_policy.v4') {
    return {
      status: 'not_declared',
      failure_ids: [],
      repair_command: null,
      capabilities: [],
    };
  }
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
      schema: inspection.policy.schema,
      requires: inspection.policy.requires,
      recommends: inspection.policy.recommends,
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
    const capabilityStrategy = inspection.policy.schema === 'opl_flow_workflow_policy.v4'
      ? compileFlowCapabilityStrategy({
          schema: inspection.policy.schema,
          package: inspection.policy.package,
          requires: inspection.policy.requires,
          experienceBaseline: inspection.policy.experience_baseline,
          compatibleOptional: inspection.policy.compatible_optional,
          capabilityBundles: inspection.policy.capability_bundles,
          policySha256: inspection.policySha256,
        })
      : null;
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
