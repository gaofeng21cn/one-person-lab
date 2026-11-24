import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../../kernel/contract-validation.ts';
import { resolveOplStatePaths } from '../../../../kernel/runtime-state-paths.ts';
import { idAliases, parseTomlDocument } from '../codex-config-document.ts';
import { resolveCodexConfigPath, resolveCodexHome, sha256Text } from '../shared.ts';
import { loadManagedPolicySurface } from './normalization.ts';
import type {
  ClassifiedInventoryItem,
  InventoryItem,
  ManagedPolicyIdentity,
  ManagedPolicyInspection,
  MigrationGroup,
  MigrationSurfaceKind,
} from './types.ts';

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

export { inspectManagedPolicySurface };
