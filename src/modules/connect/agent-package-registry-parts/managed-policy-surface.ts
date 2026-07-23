import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { assertJsonSchemaPayload } from '../../../kernel/schema-registry.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import {
  syncOplCompanionSkills,
  type OplCompanionNetworkAccess,
} from '../install-companions.ts';
import { resolveCodexConfigPath, resolveCodexHome, sha256Text } from './shared.ts';
import {
  assertSafePersistedPackagePath,
  removeSafePersistedPackagePath,
} from './persisted-path-safety.ts';
import type {
  AgentPackageLock,
  AgentPackageManagedPolicyCurrentness,
  AgentPackageManagedPolicyDependency,
  AgentPackageManagedPolicyDetectedConflict,
  AgentPackageManagedPolicyMigration,
  AgentPackageManagedPolicyMigrationAction,
  AgentPackageManifest,
} from './types.ts';

type MigrationGroup = {
  id: string;
  discovery_ids: string[];
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
  schema: 'opl_flow_workflow_policy.v1' | 'opl_flow_workflow_policy.v2' | 'opl_flow_workflow_policy.v3';
  package: { id: string; version: string; owner: string; kind: string };
  workflow_generation: string;
  provides: AgentPackageManagedPolicyDependency[];
  requires: AgentPackageManagedPolicyDependency[];
  recommends: AgentPackageManagedPolicyDependency[];
  compatible_optional: AgentPackageManagedPolicyDependency[];
  conflicts: MigrationGroup[];
  retires: MigrationGroup[];
  migration_policy: Record<string, unknown>;
  historical_fingerprints: HistoricalFingerprints;
  codex_model_policy: Record<string, unknown>;
  installation_convergence: Record<string, unknown> | null;
};

type InventoryItem = {
  surfaceKind: AgentPackageManagedPolicyMigrationAction['surface_kind'];
  canonicalId: string;
  aliases: string[];
  physicalRef: string;
};

type ManagedPolicyIdentity = {
  packageId: string;
  packageVersion: string;
  pluginId: string | null;
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
  configPath: string;
  policySha256: string;
  inventoryDigest: string;
  enabledMigrationIds: string[];
  detectedConflicts: AgentPackageManagedPolicyDetectedConflict[];
  classifiedInventory: ClassifiedInventoryItem[];
};

function sha256File(filePath: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sha256Content(content: string | Buffer) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function sha256Path(targetPath: string) {
  const digest = crypto.createHash('sha256');
  const visit = (currentPath: string, relativePath: string) => {
    const stat = fs.lstatSync(currentPath);
    if (stat.isSymbolicLink()) {
      digest.update(`link\0${relativePath}\0${fs.readlinkSync(currentPath)}\0`);
      return;
    }
    if (stat.isDirectory()) {
      digest.update(`dir\0${relativePath}\0`);
      for (const entry of fs.readdirSync(currentPath).sort()) {
        visit(path.join(currentPath, entry), path.join(relativePath, entry));
      }
      return;
    }
    digest.update(`file\0${relativePath}\0`);
    digest.update(fs.readFileSync(currentPath));
  };
  visit(targetPath, '.');
  return digest.digest('hex');
}

function resolveInside(root: string, relativePath: string, field: string) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} escapes the package root.`, {
      field,
      root: resolvedRoot,
      relative_path: relativePath,
      failure_code: 'agent_package_managed_policy_path_invalid',
    });
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} was not found in the package payload.`, {
      field,
      path: resolved,
      failure_code: 'agent_package_managed_policy_source_missing',
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
  const openComposition = schema === 'opl_flow_workflow_policy.v3';
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
  if (schema === 'opl_flow_workflow_policy.v3' && (
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
    ...(schema === 'opl_flow_workflow_policy.v2'
      ? {
          owner: String(v2Fields.owner).trim(),
          version_requirement: String(v2Fields.version_requirement).trim(),
          install_source: v2Fields.install_source as NonNullable<AgentPackageManagedPolicyDependency['install_source']>,
          lifecycle_owner: String(v2Fields.lifecycle_owner).trim(),
          conflict_policy: v2Fields.conflict_policy as NonNullable<AgentPackageManagedPolicyDependency['conflict_policy']>,
          credential_policy: v2Fields.credential_policy as NonNullable<AgentPackageManagedPolicyDependency['credential_policy']>,
        }
      : schema === 'opl_flow_workflow_policy.v3'
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
    return {
      id: entry.id,
      discovery_ids: stringArray(entry.discovery_ids, `${field}[${index}].discovery_ids`),
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
    !['opl_flow_workflow_policy.v1', 'opl_flow_workflow_policy.v2', 'opl_flow_workflow_policy.v3']
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
  const recommends = normalizeDependencies(payload.recommends, 'recommends');
  const compatibleOptional = normalizeDependencies(payload.compatible_optional, 'compatible_optional');
  assertUniqueDependencyIdentities(provides, 'provides');
  assertUniqueDependencyIdentities([...requires, ...recommends, ...compatibleOptional], 'dependencies');
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
    compatible_optional: compatibleOptional,
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
    codex_model_policy: payload.codex_model_policy,
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

function idAliases(value: string) {
  const normalized = value.trim().toLowerCase().replaceAll('_', '-');
  return [...new Set([
    normalized,
    ...normalized.split(/[@./]/).filter(Boolean),
    normalized.replace(/-local$/, ''),
  ])];
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

function nestedPluginInventory(root: string, depth = 0): InventoryItem[] {
  if (depth > 3 || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const physicalRef = path.join(root, entry.name);
    return [{
      surfaceKind: 'plugin' as const,
      canonicalId: entry.name,
      aliases: idAliases(entry.name),
      physicalRef,
    }, ...nestedPluginInventory(physicalRef, depth + 1)];
  });
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
    ...nestedPluginInventory(path.join(codexHome, 'plugins', 'cache')),
    ...nestedPluginInventory(path.join(codexHome, 'plugins', 'data')),
    ...nestedPluginInventory(path.join(codexHome, '.tmp', 'plugins', 'plugins')),
    ...serviceInventory(home),
    ...promptInventory(codexHome),
  ];
}

function configTableInventory(configPath: string) {
  if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) return [];
  return fs.readFileSync(configPath, 'utf8').split('\n').flatMap((line): InventoryItem[] => {
    const match = line.trim().match(/^\[([^\]]+)\]$/);
    if (!match) return [];
    const canonicalId = match[1].replaceAll('"', '');
    const [namespace, ...identityParts] = canonicalId.split('.');
    if (namespace === 'projects') return [];
    const identity = identityParts.length > 0 ? identityParts.join('.') : canonicalId;
    return [{
      surfaceKind: 'config_table',
      canonicalId,
      aliases: idAliases(identity),
      physicalRef: configPath,
    }];
  });
}

export type TomlTableBlock = {
  header: string;
  content: string;
  aliases: string[];
};

export function parseTomlDocument(text: string) {
  const preamble: string[] = [];
  const tables: TomlTableBlock[] = [];
  let current: { header: string; lines: string[]; aliases: string[] } | null = null;
  for (const line of text.split('\n')) {
    const match = line.trim().match(/^\[([^\]]+)\]$/);
    if (match) {
      if (current) {
        tables.push({
          header: current.header,
          content: `${current.lines.join('\n').trimEnd()}\n`,
          aliases: current.aliases,
        });
      }
      const header = match[1].replaceAll('"', '');
      current = { header, lines: [line], aliases: idAliases(header) };
    } else if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) {
    tables.push({
      header: current.header,
      content: `${current.lines.join('\n').trimEnd()}\n`,
      aliases: current.aliases,
    });
  }
  return { preamble: preamble.join('\n').trimEnd(), tables };
}

export function renderTomlDocument(preamble: string, tables: Array<Pick<TomlTableBlock, 'content'>>) {
  const parts = [preamble.trimEnd(), ...tables.map((table) => table.content.trim())].filter(Boolean);
  return parts.length > 0 ? `${parts.join('\n\n')}\n` : '';
}

function removeMatchedTomlTables(text: string, matchedHeaders: Set<string>) {
  const document = parseTomlDocument(text);
  const removed = document.tables.filter((table) => matchedHeaders.has(table.header));
  const kept = document.tables.filter((table) => !removed.includes(table));
  return {
    text: renderTomlDocument(document.preamble, kept),
    removed,
  };
}

function backupPath(backupRoot: string, source: string) {
  const encoded = source.replace(/^\/+/, '').replaceAll('..', '__');
  return path.join(backupRoot, 'surfaces', encoded);
}

function stopService(item: InventoryItem) {
  if (item.physicalRef.endsWith('.plist')) {
    const result = spawnSync('launchctl', ['bootout', `gui/${process.getuid?.() ?? ''}`, item.physicalRef], { encoding: 'utf8' });
    return { service_ref: item.physicalRef, action: 'bootout', exit_code: result.status };
  }
  if (item.physicalRef.includes(`${path.sep}systemd${path.sep}`)) {
    const result = spawnSync('systemctl', ['--user', 'disable', '--now', path.basename(item.physicalRef)], { encoding: 'utf8' });
    return { service_ref: item.physicalRef, action: 'disable_now', exit_code: result.status };
  }
  return { service_ref: item.physicalRef, action: 'not_running_service_definition', exit_code: null };
}

function inspectManagedPolicySurface(input: {
  identity: ManagedPolicyIdentity;
  sourceRoot: string;
  keepMigrationIds?: string[];
  enabledMigrationIds?: string[];
}): ManagedPolicyInspection {
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
  const groups = [...policy.conflicts, ...policy.retires];
  const groupByAlias = new Map(groups.flatMap((group) =>
    group.discovery_ids.flatMap((id) => idAliases(id).map((alias) => [alias, group] as const))));
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
      return !aliases.some((alias) => groupByAlias.has(alias))
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
  const managedMarketplaceId = `opl-agent-${input.identity.packageId}-local`;
  const managedMarketplaceRoots = [
    path.join(codexHome, 'plugins', 'cache', managedMarketplaceId),
    path.join(codexHome, 'plugins', 'data', managedMarketplaceId),
    path.join(codexHome, '.tmp', 'plugins', 'plugins', managedMarketplaceId),
  ];
  const managedConfigTables = new Set([
    `marketplaces.${managedMarketplaceId}`,
    ...(input.identity.pluginId ? [`plugins.${input.identity.pluginId}@${managedMarketplaceId}`] : []),
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
    const group = item.aliases.map((alias) => groupByAlias.get(alias)).find(Boolean);
    if (group && enabledGroups.has(group.id)) return [{ item, migrationId: group.id }];
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
    configPath,
    policySha256: sha256File(policyPath),
    inventoryDigest,
    enabledMigrationIds: groups.filter((group) => enabledGroups.has(group.id)).map((group) => group.id),
    detectedConflicts,
    classifiedInventory,
  };
}

export function noManagedPolicyMigration(note: string): AgentPackageManagedPolicyMigration {
  return {
    surface_kind: 'opl_package_managed_policy_migration',
    status: 'not_requested',
    policy_kind: null,
    policy_path: null,
    schema_path: null,
    policy_sha256: null,
    inventory_digest: null,
    dependency_ids: [],
    dependencies: [],
    optional_dependency_ids: [],
    migration_ids: [],
    detected_conflicts: [],
    actions: [],
    service_actions: [],
    dependency_sync: null,
    model_projection: null,
    backup_root: null,
    backup_active: false,
    writes_performed: false,
    note,
  };
}

function managedPolicyDependencySelection(input: {
  schema: OplFlowPolicy['schema'];
  requires: AgentPackageManagedPolicyDependency[];
  recommends: AgentPackageManagedPolicyDependency[];
}) {
  const selected = [
    ...input.requires.map((dependency) => ({ dependency, required: true })),
    ...input.recommends.map((dependency) => ({ dependency, required: false })),
  ].filter((entry) => entry.dependency.online_install_default);
  const managedSkillDependencies = selected.flatMap(({ dependency, required }) => {
    if (dependency.kind !== 'codex_skill') return [];
    if (
      dependency.source?.startsWith('skills-manager:')
      && dependency.source.slice('skills-manager:'.length) !== dependency.id
    ) {
      throw new FrameworkContractError('contract_shape_invalid', 'Managed policy Skill source identity is invalid.', {
        dependency_key: dependencyKey(dependency),
        source: dependency.source,
        failure_code: 'agent_package_managed_policy_dependency_identity_mismatch',
      });
    }
    return [{
      id: dependency.id,
      source: dependency.source,
      versionRequirement: dependency.version_requirement,
      installSource: dependency.install_source,
      required,
    }];
  });
  if (input.schema !== 'opl_flow_workflow_policy.v3') {
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
  return {
    dependencies: selected.map(({ dependency }) => dependency),
    skillIds: selected
      .filter(({ dependency }) => dependency.kind === 'codex_skill')
      .map(({ dependency }) => dependency.id),
    toolIds: selected
      .filter(({ dependency }) => dependency.kind === 'cli'
        && (dependency.id === 'officecli' || dependency.id === 'mineru-open-api'))
      .map(({ dependency }) => dependency.id as 'officecli' | 'mineru-open-api'),
    managedSkillDependencies,
  };
}

export function materializeManagedPolicySurface(input: {
  manifest: AgentPackageManifest;
  sourceRoot: string;
  dryRun: boolean;
  keepMigrationIds?: string[];
  companionNetworkAccess?: OplCompanionNetworkAccess;
}): AgentPackageManagedPolicyMigration {
  const config = input.manifest.managed_policy_surface;
  if (!config) return noManagedPolicyMigration('Package manifest does not request a managed policy surface.');
  const inspection = inspectManagedPolicySurface({
    identity: {
      packageId: input.manifest.package_id,
      packageVersion: input.manifest.version,
      pluginId: input.manifest.plugin_id,
      requiredSkillIds: input.manifest.required_skill_ids,
      config,
    },
    sourceRoot: input.sourceRoot,
    keepMigrationIds: input.keepMigrationIds,
  });
  const {
    policy,
    policyPath,
    schemaPath,
    home,
    configPath,
    policySha256,
    inventoryDigest,
    enabledMigrationIds,
    detectedConflicts,
    classifiedInventory: unique,
  } = inspection;
  const backupRoot = path.join(
    resolveOplStatePaths().state_dir,
    'agent-package-transactions',
    input.manifest.package_id,
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${policySha256.slice(0, 12)}`,
  );
  const actions: AgentPackageManagedPolicyMigrationAction[] = [];
  const serviceActions: Array<Record<string, unknown>> = [];
  try {
    const configMatches = unique.filter((entry) => entry.item.surfaceKind === 'config_table');
    const physicalMatches = unique.filter((entry) => entry.item.surfaceKind !== 'config_table');
    if (!input.dryRun) {
      for (const { item, migrationId } of physicalMatches) {
        if (!fs.existsSync(item.physicalRef)) continue;
        if (item.surfaceKind === 'service') serviceActions.push(stopService(item));
        const backupRef = backupPath(backupRoot, item.physicalRef);
        const backupSha256 = sha256Path(item.physicalRef);
        fs.mkdirSync(path.dirname(backupRef), { recursive: true });
        fs.renameSync(item.physicalRef, backupRef);
        actions.push({
          surface_kind: item.surfaceKind,
          canonical_id: item.canonicalId,
          migration_id: migrationId,
          source_ref: item.physicalRef,
          backup_ref: backupRef,
          backup_sha256: backupSha256,
          source_preexisting: true,
          written_sha256: null,
          removed_toml_tables: [],
          action: 'backed_up_and_removed_from_discovery',
        });
      }
      if (configMatches.length > 0 && fs.existsSync(configPath)) {
        const current = fs.readFileSync(configPath, 'utf8');
        const matchedHeaders = new Set(configMatches.map((entry) => entry.item.canonicalId));
        const removal = removeMatchedTomlTables(current, matchedHeaders);
        if (removal.text !== current) {
          const backupRef = `${backupPath(backupRoot, configPath)}.toml-delta.json`;
          const removedTomlTables = removal.removed.map((table) => ({
            header: table.header,
            content: table.content,
            content_sha256: sha256Content(table.content),
          }));
          fs.mkdirSync(path.dirname(backupRef), { recursive: true });
          fs.writeFileSync(backupRef, `${JSON.stringify({
            surface_kind: 'opl_managed_policy_toml_delta',
            source_ref: configPath,
            removed_toml_tables: removedTomlTables,
          }, null, 2)}\n`, 'utf8');
          fs.writeFileSync(configPath, removal.text, 'utf8');
          actions.push({
            surface_kind: 'config_table',
            canonical_id: 'codex-config',
            migration_id: [...new Set(configMatches.map((entry) => entry.migrationId))].sort().join(','),
            source_ref: configPath,
            backup_ref: backupRef,
            backup_sha256: sha256File(backupRef),
            source_preexisting: true,
            written_sha256: sha256Content(removal.text),
            removed_toml_tables: removedTomlTables,
            action: 'backed_up_and_removed_from_discovery',
          });
        }
      }
    }
    const {
      dependencies,
      skillIds,
      toolIds,
      managedSkillDependencies,
    } = managedPolicyDependencySelection({
      schema: policy.schema,
      requires: policy.requires,
      recommends: policy.recommends,
    });
    const dependencySync = syncOplCompanionSkills(home, {
      mode: input.dryRun ? 'ask_to_apply' : 'managed',
      skillIds,
      toolIds,
      managedSkillDependencies,
      networkAccess: input.companionNetworkAccess,
    });
    const dependencyWrites = dependencySync.items.some((entry) => ['synced', 'installed'].includes(entry.status))
      || dependencySync.tools.some((entry) => entry.action === 'install' || entry.action === 'update');
    const writesPerformed = !input.dryRun && (actions.length > 0 || dependencyWrites);
    return {
      surface_kind: 'opl_package_managed_policy_migration',
      status: input.dryRun ? 'validated_no_write' : writesPerformed ? 'applied' : 'current',
      policy_kind: config.policy_kind,
      policy_path: policyPath,
      schema_path: schemaPath,
      policy_sha256: policySha256,
      inventory_digest: inventoryDigest,
      dependency_ids: [...new Set(dependencies.map((entry) => entry.id))],
      dependencies,
      optional_dependency_ids: policy.compatible_optional.map((entry) => entry.id),
      migration_ids: enabledMigrationIds,
      detected_conflicts: detectedConflicts,
      actions,
      service_actions: serviceActions,
      dependency_sync: dependencySync as unknown as Record<string, unknown>,
      model_projection: {
        authority: policy.codex_model_policy.authority,
        configured_default: policy.codex_model_policy.configured_default,
        override_precedence: policy.codex_model_policy.override_precedence,
        role: 'package_recommendation_consumed_by_opl_base',
      },
      backup_root: actions.length > 0 ? backupRoot : null,
      backup_active: actions.length > 0,
      writes_performed: writesPerformed,
      note: actions.length > 0
        ? 'Managed policy conflicts were backed up and removed from discovery in the package transaction.'
        : 'Managed policy is current; no conflicting discovery surface required migration.',
    };
  } catch (error) {
    rollbackManagedPolicyMigration({
      ...noManagedPolicyMigration('Managed policy transaction failed.'),
      status: 'applied',
      policy_kind: config.policy_kind,
      policy_path: policyPath,
      schema_path: schemaPath,
      policy_sha256: policySha256,
      inventory_digest: inventoryDigest,
      actions,
      service_actions: serviceActions,
      backup_root: actions.length > 0 ? backupRoot : null,
      backup_active: actions.length > 0,
      writes_performed: actions.length > 0,
    });
    throw error;
  }
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
    repair_command: null,
    reason,
  };
}

function dependencySyncDriftReasons(
  sync: ReturnType<typeof syncOplCompanionSkills>,
  skillIds: string[],
  toolIds: Array<'officecli' | 'mineru-open-api'>,
) {
  const reasons: string[] = [];
  const itemsById = new Map(sync.items.map((entry) => [entry.skill_id, entry]));
  for (const skillId of skillIds) {
    const item = itemsById.get(skillId);
    if (!item) {
      reasons.push(`missing_skill_readback:${skillId}`);
      continue;
    }
    const discoverOnly = item.action === 'discover_only';
    const current = discoverOnly
      ? item.status === 'available'
        && item.source_authority !== 'missing'
        && item.frontmatter_schema_status !== 'invalid'
        && item.resource_closure_status !== 'incomplete'
      : item.status === 'ready'
        && item.source_authority !== 'missing'
        && item.source_payload_sha256 !== null
        && item.payload_currentness === 'current'
        && item.frontmatter_schema_status === 'valid'
        && item.resource_closure_status === 'complete'
        && item.entrypoint_authority_status === 'converged';
    if (!current) reasons.push(`skill_drift:${skillId}`);
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

export function managedPolicyCurrentness(
  lock?: AgentPackageLock | null,
): AgentPackageManagedPolicyCurrentness {
  const surface = lock?.physical_surface;
  const config = surface?.managed_policy_config;
  if (!lock || !surface || !config) {
    return noManagedPolicyCurrentness('Package does not request a managed policy surface.');
  }

  const migration = surface.workflow_policy_migration;
  const sourceRoot = surface.status === 'validated_no_write'
    ? surface.plugin_source_path
    : surface.codex_plugin_cache_path ?? surface.plugin_source_path;
  const policyPath = sourceRoot ? path.resolve(sourceRoot, config.source_path) : migration.policy_path;
  const schemaPath = sourceRoot ? path.resolve(sourceRoot, config.schema_path) : migration.schema_path;
  const expectedPolicySha256 = migration.policy_sha256;
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
    enabled_migration_ids: migration.migration_ids,
    detected_conflicts: [],
    dependency_sync: null,
    repair_command: `opl packages repair --package-id ${lock.package_id}`,
    reason,
  });
  if (!sourceRoot) {
    return invalid('Managed policy source root is unavailable from the installed package lock.');
  }

  try {
    const inspection = inspectManagedPolicySurface({
      identity: {
        packageId: lock.package_id,
        packageVersion: lock.package_version,
        pluginId: surface.plugin_id,
        requiredSkillIds: lock.bundled_required_skill_ids,
        config,
      },
      sourceRoot,
      enabledMigrationIds: migration.migration_ids,
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
    });
    const dependencySync = syncOplCompanionSkills(inspection.home, {
      mode: 'observe',
      skillIds,
      toolIds,
      managedSkillDependencies,
      networkAccess: 'forbidden',
    });
    const dependencyDriftReasons = dependencySyncDriftReasons(dependencySync, skillIds, toolIds);
    const conflictDrifted = inspection.detectedConflicts.length > 0;
    const drifted = conflictDrifted || dependencyDriftReasons.length > 0;
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
      repair_command: null,
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

function managedPolicyRollbackConflict(
  message: string,
  action: AgentPackageManagedPolicyMigrationAction,
  details: Record<string, unknown> = {},
): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    source_ref: action.source_ref,
    backup_ref: action.backup_ref,
    surface_kind: action.surface_kind,
    migration_id: action.migration_id,
    ...details,
    failure_code: 'agent_package_managed_policy_rollback_conflict',
  });
}

function managedPolicyBackupRoot() {
  return path.join(resolveOplStatePaths().state_dir, 'agent-package-transactions');
}

function assertManagedPolicyBackupPaths(migration: AgentPackageManagedPolicyMigration) {
  if (migration.backup_root) {
    assertSafePersistedPackagePath({
      candidatePath: migration.backup_root,
      allowedRoots: [managedPolicyBackupRoot()],
      pathKind: 'managed_policy_migration.backup_root',
    });
  }
  for (const action of migration.actions) {
    assertSafePersistedPackagePath({
      candidatePath: action.backup_ref,
      allowedRoots: [managedPolicyBackupRoot()],
      pathKind: 'managed_policy_migration.actions[].backup_ref',
    });
  }
}

function removeManagedPolicyBackupRoot(backupRoot: string) {
  removeSafePersistedPackagePath({
    candidatePath: backupRoot,
    allowedRoots: [managedPolicyBackupRoot()],
    pathKind: 'managed_policy_migration.backup_root',
    recursive: true,
  });
}

export function assertManagedPolicyRollbackReady(
  migration: AgentPackageManagedPolicyMigration | undefined,
) {
  if (!migration?.backup_active) return;
  assertManagedPolicyBackupPaths(migration);
  const actions = [...migration.actions].reverse();

  for (const action of actions) {
    if (!fs.existsSync(action.backup_ref)) {
      managedPolicyRollbackConflict('Managed policy rollback backup is missing.', action);
    }
    const actualBackupSha256 = action.surface_kind === 'config_table'
      ? sha256File(action.backup_ref)
      : sha256Path(action.backup_ref);
    if (actualBackupSha256 !== action.backup_sha256) {
      managedPolicyRollbackConflict('Managed policy rollback backup digest changed.', action, {
        expected_backup_sha256: action.backup_sha256,
        actual_backup_sha256: actualBackupSha256,
      });
    }
    if (action.surface_kind !== 'config_table') {
      if (fs.existsSync(action.source_ref)) {
        managedPolicyRollbackConflict('Managed policy rollback target was recreated after migration; refusing to overwrite it.', action);
      }
      continue;
    }
    const current = fs.existsSync(action.source_ref) ? fs.readFileSync(action.source_ref, 'utf8') : '';
    const currentTables = parseTomlDocument(current).tables;
    for (const removedTable of action.removed_toml_tables) {
      if (sha256Content(removedTable.content) !== removedTable.content_sha256) {
        managedPolicyRollbackConflict('Managed policy rollback TOML delta digest changed.', action, {
          table_header: removedTable.header,
        });
      }
      const existing = currentTables.filter((table) => table.header === removedTable.header);
      if (existing.length > 1 || (existing.length === 1
        && sha256Content(existing[0].content) !== removedTable.content_sha256)) {
        managedPolicyRollbackConflict('Managed policy rollback found a conflicting TOML table.', action, {
          table_header: removedTable.header,
        });
      }
    }
  }
}

function restoreManagedBackup(action: AgentPackageManagedPolicyMigrationAction, retainBackup: boolean) {
  fs.mkdirSync(path.dirname(action.source_ref), { recursive: true });
  if (!retainBackup) {
    fs.renameSync(action.backup_ref, action.source_ref);
    return;
  }
  const stat = fs.lstatSync(action.backup_ref);
  if (stat.isDirectory()) {
    fs.cpSync(action.backup_ref, action.source_ref, { recursive: true, verbatimSymlinks: true });
  } else if (stat.isSymbolicLink()) {
    fs.symlinkSync(fs.readlinkSync(action.backup_ref), action.source_ref);
  } else {
    fs.copyFileSync(action.backup_ref, action.source_ref);
  }
}

export function rollbackManagedPolicyMigration(
  migration: AgentPackageManagedPolicyMigration | undefined,
  options: { retainBackups?: boolean } = {},
): AgentPackageManagedPolicyMigration {
  if (!migration?.backup_active) return migration ?? noManagedPolicyMigration('No managed policy backup required rollback.');
  assertManagedPolicyBackupPaths(migration);
  assertManagedPolicyRollbackReady(migration);
  const actions = [...migration.actions].reverse();

  for (const action of actions) {
    if (action.surface_kind === 'config_table') {
      const current = fs.existsSync(action.source_ref) ? fs.readFileSync(action.source_ref, 'utf8') : '';
      const document = parseTomlDocument(current);
      const missing = action.removed_toml_tables.filter((removedTable) =>
        !document.tables.some((table) => table.header === removedTable.header));
      if (missing.length > 0) {
        fs.mkdirSync(path.dirname(action.source_ref), { recursive: true });
        fs.writeFileSync(action.source_ref, renderTomlDocument(document.preamble, [
          ...document.tables,
          ...missing.map((table) => ({ content: table.content })),
        ]), 'utf8');
      }
      continue;
    }
    restoreManagedBackup(action, options.retainBackups === true);
  }
  if (!options.retainBackups && migration.backup_root) {
    removeManagedPolicyBackupRoot(migration.backup_root);
  }
  return {
    ...migration,
    status: 'rolled_back',
    backup_active: options.retainBackups === true,
    writes_performed: true,
    note: options.retainBackups
      ? 'Managed policy migration surfaces were restored; rollback backups remain active until state commit.'
      : 'Managed policy migration surfaces were restored from the generic package transaction backup.',
  };
}

export function finalizeManagedPolicyRollback(
  migration: AgentPackageManagedPolicyMigration | undefined,
): AgentPackageManagedPolicyMigration {
  if (!migration) return noManagedPolicyMigration('No managed policy rollback required finalization.');
  if (migration.status !== 'rolled_back') {
    throw new FrameworkContractError('contract_shape_invalid', 'Managed policy rollback must complete before backup finalization.', {
      status: migration.status,
      backup_root: migration.backup_root,
      failure_code: 'agent_package_managed_policy_rollback_not_completed',
    });
  }
  if (migration.backup_root) removeManagedPolicyBackupRoot(migration.backup_root);
  return {
    ...migration,
    backup_active: false,
    note: 'Managed policy rollback committed and retained backups were finalized.',
  };
}
