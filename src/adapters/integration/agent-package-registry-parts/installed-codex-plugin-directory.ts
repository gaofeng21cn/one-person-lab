import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import {
  agentPluginOpenAiInterface,
  agentPluginSkillsRelativeRoot,
  resolveAgentPluginManifest,
  type ResolvedAgentPluginManifest,
} from '../../../kernel/agent-plugin-manifest.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import {
  listCurrentPackageProjections,
  PACKAGE_PROJECTION_ROOT,
  resolveStandardAgent,
} from '../../../kernel/standard-agent-registry.ts';
import { canonicalAgentPackageId } from '../agent-package-identity.ts';
import { isFirstPartyPackage } from '../agent-package-first-party.ts';
import { resolveCanonicalOplFamilyMarketplaceId } from '../system-installation/codex-plugin-registry.ts';
import {
  inspectOplModule,
  resolveOplModuleSourcePolicy,
} from '../system-installation/modules.ts';
import type { ModuleCapabilityDependency } from '../system-installation/shared.ts';
import type {
  CodexPluginCommandResult,
  CodexPluginCommandRunner,
} from './configured-codex-plugin-carrier.ts';
import { normalizePackageManifest } from './manifest-normalizers.ts';
import {
  configuredCodexHome,
  internalPackageCodexHome,
} from './configured-codex-plugin-carrier-native.ts';
import { sha256Text } from './shared.ts';
import type {
  AgentPackageConfiguredCodexPluginCarrierDescriptor,
  AgentPackageManifest,
} from './types.ts';
export type InstalledCarrierEntry = {
  pluginId: string;
  version: string | null;
  /** Native list fixtures predating availability readback omit this field; omission means installed. */
  installed?: boolean;
  enabled: boolean;
  sourcePath: string;
  sourceKind: string;
  marketplaceSource: string | null;
};

/**
 * Carrier-neutral installed readback.  This is deliberately a read model:
 * carrier lifecycle state is observed here, never recreated in Framework.
 */
export type InstalledPackageCarrierReadback = {
  kind: string;
  identity: string;
  source_ref: string;
  version: string | null;
  enabled: boolean;
  lifecycle_authority: 'carrier_owned';
};

export type InstalledPackageReadiness = {
  installed: boolean;
  physical_status: 'available' | 'unavailable';
  callability: 'callable' | 'disabled';
  projection_callability?: 'callable' | 'disabled';
};

export type InstalledPackageManifest = Pick<
  AgentPackageManifest,
  | 'package_id'
  | 'agent_id'
  | 'package_role'
  | 'display_name'
  | 'publisher'
  | 'version'
  | 'source'
  | 'source_repo'
  | 'codex_surface'
  | 'codex_default_exposure'
  | 'codex_interaction_mode'
  | 'codex_visible_entry'
  | 'entrypoints'
  | 'required_skill_ids'
  | 'optional_skill_refs'
  | 'presentation'
  | 'profile_surface'
  | 'managed_policy_surface'
  | 'capability_dependencies'
  | 'capability_provider'
  | 'runtime_module_bindings'
  | 'content_lock_canonicalization'
  | 'configured_codex_plugin_carrier'
  | 'app_contributions'
> & Partial<Pick<
  AgentPackageManifest,
  | 'source_commit'
  | 'carrier_source_commit'
  | 'plugin_id'
  | 'plugin_payload_manifest_url'
  | 'content_digest'
  | 'content_lock_paths'
>>;

export type InstalledPackageDescriptor = {
  manifest: InstalledPackageManifest;
  manifestPath: string;
  manifest_sha256: string;
  sourcePath: string;
  pluginId: string;
  marketplaceSource: string | null;
  enabled: boolean;
  carrier: AgentPackageConfiguredCodexPluginCarrierDescriptor;
  /** Generic readback used by future carriers; `carrier` remains compatibility data. */
  carrier_readback: InstalledPackageCarrierReadback;
  readiness: InstalledPackageReadiness;
};

export function isProjectLocalCapabilityPackage(
  manifest: Pick<
    InstalledPackageManifest,
    'package_role' | 'codex_default_exposure' | 'codex_interaction_mode' | 'capability_provider'
  >,
) {
  return manifest.package_role === 'capability_package'
    && manifest.codex_default_exposure === false
    && manifest.codex_interaction_mode === 'headless_internal'
    && (manifest.capability_provider?.consumer_profiles?.length ?? 0) > 0;
}

function existingDirectory(value: string | null | undefined) {
  if (!value) return null;
  try {
    const resolved = fs.realpathSync(path.resolve(value));
    return fs.statSync(resolved).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

function sourceContainsSkill(root: string, skillId: string) {
  if (!skillId || path.basename(skillId) !== skillId || skillId.includes('\0')) return false;
  const skillPath = path.join(root, 'skills', skillId, 'SKILL.md');
  try {
    return fs.statSync(skillPath).isFile();
  } catch {
    return false;
  }
}

export function resolveProjectLocalCapabilitySourceRoot(
  moduleId: string,
  skillIds: readonly string[],
) {
  const candidates = new Set<string>();
  try {
    const sourcePolicy = resolveOplModuleSourcePolicy(moduleId, { profile: 'fast' });
    if (sourcePolicy.developer_checkout_available) {
      const developerCheckout = existingDirectory(sourcePolicy.developer_checkout_path);
      if (developerCheckout) candidates.add(developerCheckout);
    }
  } catch {
    // The owner projection remains readable when an optional module is absent.
  }
  try {
    const inspected = inspectOplModule(moduleId, { profile: 'fast' });
    if (inspected.installed && inspected.health_status !== 'invalid_checkout') {
      const checkout = existingDirectory(inspected.checkout_path);
      if (checkout) candidates.add(checkout);
    }
  } catch {
    // An unavailable module is reported by the caller as dependency readiness.
  }
  return [...candidates].find((candidate) => skillIds.every((skillId) => (
    sourceContainsSkill(candidate, skillId)
  ))) ?? null;
}

export function projectLocalCapabilityDependencyReadiness(
  descriptor: InstalledPackageDescriptor,
  dependency: Pick<ModuleCapabilityDependency, 'module_id' | 'capability_abi' | 'required_export_ids' | 'required_module_ids'>,
) {
  if (!isProjectLocalCapabilityPackage(descriptor.manifest)) return null;
  const provider = descriptor.manifest.capability_provider;
  const exportsById = new Map(provider?.exports.map((entry) => [entry.export_id, entry]) ?? []);
  const missingRequiredExportIds = dependency.required_export_ids.filter((exportId) => (
    !exportsById.has(exportId)
  ));
  const missingRequiredModuleIds = dependency.required_module_ids.filter((moduleId) => (
    !provider?.module_export_ids.includes(moduleId)
  ));
  const requiredSkillIds = dependency.required_export_ids.map((exportId) => (
    exportsById.get(exportId)?.skill_id ?? exportId
  ));
  const sourceRoot = resolveProjectLocalCapabilitySourceRoot(
    dependency.module_id,
    requiredSkillIds,
  );
  const compatibilityReasons = [
    ...(provider?.capability_abi === dependency.capability_abi ? [] : ['capability_abi_mismatch']),
    ...(missingRequiredExportIds.length > 0 ? ['required_exports_missing'] : []),
    ...(missingRequiredModuleIds.length > 0 ? ['required_modules_missing'] : []),
  ];
  const reasons = [
    ...compatibilityReasons,
    ...(!sourceRoot ? ['package_source_unavailable'] : []),
  ];
  return {
    status: compatibilityReasons.length > 0
      ? 'incompatible' as const
      : sourceRoot
        ? 'current' as const
        : 'missing' as const,
    sourceRoot,
    missingRequiredExportIds,
    missingRequiredModuleIds,
    reasons,
  };
}

function frameworkProjectionRemainsCallableWhileDisabled(
  manifest: Pick<InstalledPackageManifest, 'package_role' | 'codex_default_exposure' | 'codex_interaction_mode'>,
) {
  return manifest.codex_interaction_mode === 'headless_internal'
    || (manifest.package_role === 'capability_package' && manifest.codex_default_exposure === false);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function parseInstalledCarrierEntries(
  value: string,
  packageId: string | null,
  includeAvailable = false,
): InstalledCarrierEntry[] {
  const parsed = parseJsonText(value);
  const readback = isRecord(parsed) ? parsed : null;
  if (!readback || !Array.isArray(readback.installed)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Installed Codex Plugin Manager readback has no installed array.',
      {
        package_id: packageId,
        failure_code: 'configured_codex_plugin_carrier_readback_invalid_shape',
      },
    );
  }
  const values = [
    ...readback.installed.map((entry) => ({ entry, installed: true })),
    ...(includeAvailable && Array.isArray(readback.available)
      ? readback.available.map((entry) => ({ entry, installed: false }))
      : []),
  ];
  const entries = values.flatMap(({ entry, installed }) => {
    if (!isRecord(entry)) return [];
    const pluginId = stringValue(entry.pluginId);
    const source = isRecord(entry.source) ? entry.source : null;
    const sourcePath = stringValue(source?.path);
    if (!pluginId || !sourcePath || !path.isAbsolute(sourcePath)) return [];
    const marketplace = isRecord(entry.marketplaceSource) ? entry.marketplaceSource : null;
    return [{
      pluginId,
      version: stringValue(entry.version),
      installed: entry.installed === true || installed,
      enabled: entry.enabled === true,
      sourcePath,
      sourceKind: stringValue(source?.source) ?? 'codex_plugin_manager',
      marketplaceSource: stringValue(marketplace?.source),
    }];
  });
  const byPluginId = new Map<string, InstalledCarrierEntry>();
  for (const entry of entries) {
    const previous = byPluginId.get(entry.pluginId);
    if (!previous || (!previous.installed && entry.installed)) byPluginId.set(entry.pluginId, entry);
  }
  return [...byPluginId.values()];
}

function defaultRunner(input: {
  binary: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}) {
  const result = spawnSync(input.binary, input.args, {
    encoding: 'utf8',
    env: input.env,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ?? null,
  };
}

function pluginPackageId(pluginId: string) {
  const bareName = pluginId.split('@', 1)[0]?.trim().toLowerCase() ?? '';
  const normalized = bareName.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return canonicalAgentPackageId(normalized) ?? normalized;
}

function pluginSkillIds(sourcePath: string, resolved: ResolvedAgentPluginManifest) {
  const declared = resolved.manifest.skills;
  const roots = resolved.kind === 'agent_plugins_1_0'
    ? [agentPluginSkillsRelativeRoot(resolved)]
    : Array.isArray(declared)
      ? declared.filter((value): value is string => typeof value === 'string')
      : [agentPluginSkillsRelativeRoot(resolved)];
  const skillIds = new Set<string>();
  for (const root of roots) {
    if (!root.trim() || root.startsWith('/') || root.includes('\0')) continue;
    const skillRoot = path.resolve(sourcePath, root);
    if (skillRoot !== sourcePath && !skillRoot.startsWith(`${path.resolve(sourcePath)}${path.sep}`)) continue;
    try {
      for (const entry of fs.readdirSync(skillRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const skillFile = path.join(skillRoot, entry.name, 'SKILL.md');
        if (fs.statSync(skillFile).isFile()) skillIds.add(entry.name);
      }
    } catch {
      // An installed plugin may expose tools or commands without a Skill directory.
    }
  }
  return [...skillIds].sort();
}

function normalizeNativeCarrierManifest(
  entry: InstalledCarrierEntry,
  resolved: ResolvedAgentPluginManifest,
): InstalledPackageManifest {
  const pluginPayload = resolved.manifest;
  const packageId = pluginPackageId(entry.pluginId);
  if (!packageId) throw new Error('plugin package id is empty');
  const interfacePayload = agentPluginOpenAiInterface(pluginPayload) ?? {};
  const displayName = stringValue(interfacePayload.displayName)
    ?? stringValue(pluginPayload.name)
    ?? packageId;
  const requiredSkillIds = pluginSkillIds(entry.sourcePath, resolved);
  const sourceRepo = stringValue(pluginPayload.repository) ?? stringValue(pluginPayload.homepage);
  const version = entry.version
    ?? stringValue(pluginPayload.version)
    ?? '0.0.0';
  return {
    package_id: packageId,
    agent_id: null,
    package_role: 'capability_package',
    display_name: displayName,
    publisher: stringValue(isRecord(pluginPayload.author) ? pluginPayload.author.name : null)
      ?? 'installed-plugin',
    version,
    source: 'installed_descriptor',
    source_repo: sourceRepo,
    codex_surface: {
      plugin_id: entry.pluginId,
      plugin_source_path: entry.sourcePath,
      required_skill_ids: requiredSkillIds,
      codex_default_exposure: entry.enabled,
    },
    codex_default_exposure: entry.enabled,
    codex_interaction_mode: 'interactive',
    codex_visible_entry: packageId,
    entrypoints: [],
    required_skill_ids: requiredSkillIds,
    optional_skill_refs: [],
    presentation: null,
    profile_surface: null,
    managed_policy_surface: null,
    capability_dependencies: [],
    capability_provider: null,
    runtime_module_bindings: [],
    content_lock_canonicalization: null,
    configured_codex_plugin_carrier: {
      packageId,
      interactionMode: 'interactive',
      carrier: {
        kind: 'codex_plugin_manager',
        pluginId: entry.pluginId,
        marketplaceSource: entry.marketplaceSource,
      },
      executor: {
        route: 'codex_cli',
        requiredSkillIds: [...requiredSkillIds],
      },
      publicationRef: null,
    },
    app_contributions: null,
  };
}

function readInstalledPackageDescriptor(entry: InstalledCarrierEntry): InstalledPackageDescriptor | null {
  const ownerManifestPath = path.join(entry.sourcePath, 'opl-package.json');
  try {
    const hasOwnerManifest = fs.existsSync(ownerManifestPath)
      && fs.statSync(ownerManifestPath).isFile();
    let manifestPath = ownerManifestPath;
    let manifest: InstalledPackageManifest;
    let manifestText: string;
    if (hasOwnerManifest) {
      manifestText = fs.readFileSync(ownerManifestPath, 'utf8');
      manifest = normalizePackageManifest(
        JSON.parse(manifestText),
        pathToFileURL(ownerManifestPath).toString(),
      );
    } else {
      if (!entry.installed) return null;
      const resolvedPlugin = resolveAgentPluginManifest([entry.sourcePath]);
      if (!resolvedPlugin) return null;
      manifestPath = resolvedPlugin.manifestPath;
      manifestText = fs.readFileSync(manifestPath, 'utf8');
      manifest = normalizeNativeCarrierManifest(entry, resolvedPlugin);
      // First-party Package identity remains owned by its stable catalog. A
      // carrier-native manifest without an explicit Framework owner descriptor
      // must not synthesize a second authority for that identity.
      if (isFirstPartyPackage(manifest.package_id)) return null;
    }
    const carrier = manifest.configured_codex_plugin_carrier ?? {
      packageId: manifest.package_id,
      interactionMode: manifest.codex_interaction_mode,
      carrier: {
        kind: 'codex_plugin_manager' as const,
        pluginId: entry.pluginId,
        marketplaceSource: entry.marketplaceSource,
      },
      executor: {
        route: 'codex_cli' as const,
        requiredSkillIds: [...manifest.required_skill_ids],
      },
      publicationRef: null,
    };
    manifest = {
      ...manifest,
      codex_surface: {
        ...manifest.codex_surface,
        plugin_id: entry.pluginId,
        plugin_source_path: entry.sourcePath,
      },
      configured_codex_plugin_carrier: carrier,
    };
    const projectionCallableWhileDisabled = hasOwnerManifest
      && frameworkProjectionRemainsCallableWhileDisabled(manifest)
      && entry.installed !== false
      && !entry.enabled;
    return {
      manifest,
      manifestPath,
      manifest_sha256: sha256Text(manifestText),
      sourcePath: entry.sourcePath,
      pluginId: entry.pluginId,
      marketplaceSource: entry.marketplaceSource,
      enabled: entry.enabled,
      carrier,
      carrier_readback: {
        kind: entry.sourceKind,
        identity: entry.pluginId,
        source_ref: entry.sourcePath,
        version: entry.version ?? manifest.version,
        enabled: entry.enabled,
        lifecycle_authority: 'carrier_owned',
      },
      readiness: {
        installed: entry.installed !== false,
        physical_status: fs.existsSync(entry.sourcePath) ? 'available' : 'unavailable',
        callability: entry.installed !== false && entry.enabled ? 'callable' : 'disabled',
        ...(projectionCallableWhileDisabled
          ? { projection_callability: 'callable' as const }
          : {}),
      },
    };
  } catch {
    return null;
  }
}

function projectedManifestPath(sourceRef: string) {
  return path.isAbsolute(sourceRef)
    ? sourceRef
    : path.join(PACKAGE_PROJECTION_ROOT, path.basename(sourceRef));
}

function readProjectedPackageDescriptor(
  projection: ReturnType<typeof listCurrentPackageProjections>[number],
): InstalledPackageDescriptor | null {
  try {
    const manifestPath = projectedManifestPath(projection.source_ref);
    const manifestText = fs.readFileSync(manifestPath, 'utf8');
    const manifest = normalizePackageManifest(
      JSON.parse(manifestText),
      pathToFileURL(manifestPath).toString(),
    );
    const carrier = manifest.configured_codex_plugin_carrier;
    if (!carrier || !isFirstPartyPackage(manifest.package_id)) return null;
    return {
      manifest,
      manifestPath,
      manifest_sha256: sha256Text(manifestText),
      sourcePath: manifestPath,
      pluginId: carrier.carrier.pluginId,
      marketplaceSource: carrier.carrier.marketplaceSource,
      enabled: false,
      carrier,
      carrier_readback: {
        kind: 'owner_package_projection',
        identity: carrier.carrier.pluginId,
        source_ref: projection.source_ref,
        version: manifest.version,
        enabled: false,
        lifecycle_authority: 'carrier_owned',
      },
      readiness: {
        installed: false,
        physical_status: 'unavailable',
        callability: 'disabled',
      },
    };
  } catch {
    return null;
  }
}

export function discoverCurrentOwnerPackageDescriptors(input: { packageId?: string | null } = {}) {
  const discovered = new Map<string, InstalledPackageDescriptor>();
  for (const projection of listCurrentPackageProjections()) {
    const descriptor = readProjectedPackageDescriptor(projection);
    if (!descriptor) continue;
    if (input.packageId && descriptor.manifest.package_id !== input.packageId) continue;
    discovered.set(descriptor.manifest.package_id, descriptor);
  }
  return discovered;
}

function projectLocalCapabilityDescriptor(owner: InstalledPackageDescriptor) {
  if (!isProjectLocalCapabilityPackage(owner.manifest)) return null;
  const moduleId = resolveStandardAgent(owner.manifest.package_id)?.module_id;
  if (!moduleId) return null;
  const sourceRoot = resolveProjectLocalCapabilitySourceRoot(
    moduleId,
    owner.manifest.required_skill_ids,
  );
  if (!sourceRoot || !fs.existsSync(path.join(sourceRoot, 'opl-package.json'))) return null;
  return {
    ...owner,
    sourcePath: sourceRoot,
    enabled: false,
    carrier_readback: {
      kind: 'project_local_owner_projection',
      identity: owner.carrier.carrier.pluginId,
      source_ref: sourceRoot,
      version: owner.manifest.version,
      enabled: false,
      lifecycle_authority: 'carrier_owned' as const,
    },
    readiness: {
      installed: true,
      physical_status: 'available' as const,
      callability: 'disabled' as const,
      projection_callability: 'callable' as const,
    },
  } satisfies InstalledPackageDescriptor;
}

export function discoverProjectLocalCapabilityPackageDescriptors(input: { packageId?: string | null } = {}) {
  const discovered = new Map<string, InstalledPackageDescriptor>();
  for (const owner of discoverCurrentOwnerPackageDescriptors(input).values()) {
    const projected = projectLocalCapabilityDescriptor(owner);
    if (projected) discovered.set(projected.manifest.package_id, projected);
  }
  return discovered;
}

function withCurrentOwnerProjection(
  descriptor: InstalledPackageDescriptor,
  ownerProjection: InstalledPackageDescriptor | undefined,
) {
  if (!ownerProjection
    || descriptor.manifest.version !== ownerProjection.manifest.version
    || !installedDescriptorMatchesConfiguredCarrier(descriptor)) return descriptor;
  const readiness = { ...descriptor.readiness };
  delete readiness.projection_callability;
  const projectionCallableWhileDisabled = frameworkProjectionRemainsCallableWhileDisabled(ownerProjection.manifest)
    && readiness.installed
    && !descriptor.enabled;
  if (projectionCallableWhileDisabled) readiness.projection_callability = 'callable';
  return {
    ...descriptor,
    manifest: ownerProjection.manifest,
    manifestPath: ownerProjection.manifestPath,
    manifest_sha256: ownerProjection.manifest_sha256,
    carrier: ownerProjection.carrier,
    readiness,
  };
}

export function installedDescriptorMatchesConfiguredCarrier(
  descriptor: InstalledPackageDescriptor,
) {
  const expected = descriptor.carrier.carrier;
  const pluginName = expected.pluginId.split('@', 1)[0]?.trim() ?? '';
  const canonicalMarketplaceId = pluginName
    ? resolveCanonicalOplFamilyMarketplaceId(descriptor.manifest.package_id, pluginName)
    : null;
  return descriptor.pluginId === expected.pluginId
    || (canonicalMarketplaceId !== null
      && descriptor.pluginId === `${pluginName}@${canonicalMarketplaceId}`);
}

export function installedDescriptorSupportsFrameworkCalls(
  descriptor: InstalledPackageDescriptor,
) {
  return descriptor.readiness.installed
    && descriptor.readiness.physical_status === 'available'
    && (descriptor.readiness.projection_callability ?? descriptor.readiness.callability) === 'callable'
    && installedDescriptorHasExpectedCodexExposure(descriptor);
}

export function installedDescriptorHasExpectedCodexExposure(
  descriptor: InstalledPackageDescriptor,
) {
  if (descriptor.manifest.codex_interaction_mode === 'headless_internal') {
    return !descriptor.enabled;
  }
  return descriptor.enabled;
}

export function discoverPackageDescriptors(input: {
  packageId?: string | null;
  includeAvailable?: boolean;
  includeInternal?: boolean;
  binary?: string;
  env?: NodeJS.ProcessEnv;
  runner?: CodexPluginCommandRunner;
  failClosedOnCarrierError?: boolean;
} = {}) {
  const entries = readInstalledCarrierEntries(input);
  const discovered = new Map<string, InstalledPackageDescriptor>();
  for (const entry of entries) {
    const descriptor = readInstalledPackageDescriptor(entry);
    if (!descriptor) continue;
    if (input.packageId && descriptor.manifest.package_id !== input.packageId) continue;
    const previous = discovered.get(descriptor.manifest.package_id);
    if (previous) {
      const previousExact = installedDescriptorMatchesConfiguredCarrier(previous);
      const descriptorExact = installedDescriptorMatchesConfiguredCarrier(descriptor);
      if (previousExact !== descriptorExact) {
        if (previousExact) continue;
      } else if (
        (previous.readiness.installed && !descriptor.readiness.installed)
        || (previous.readiness.installed === descriptor.readiness.installed
          && (previous.enabled || !descriptor.enabled))
      ) {
        continue;
      }
    }
    discovered.set(descriptor.manifest.package_id, descriptor);
  }
  return discovered;
}

type CarrierDiscoveryInput = {
  packageId?: string | null;
  includeAvailable?: boolean;
  includeInternal?: boolean;
  binary?: string;
  env?: NodeJS.ProcessEnv;
  runner?: CodexPluginCommandRunner;
  failClosedOnCarrierError?: boolean;
};

export function readInstalledCarrierEntries(input: CarrierDiscoveryInput = {}) {
  const env = { ...process.env, ...input.env };
  const entries = readCarrierEntriesFromHome({ ...input, env });
  const internalHome = internalPackageCodexHome(env);
  if (input.includeInternal === false || internalHome === configuredCodexHome(env)
    || !fs.existsSync(path.join(internalHome, 'config.toml'))) return entries;

  const internalEntries = readCarrierEntriesFromHome({
    ...input,
    env: { ...env, CODEX_HOME: internalHome },
  });
  const owners = discoverCurrentOwnerPackageDescriptors(input);
  const byPluginId = new Map(entries.map((entry) => [entry.pluginId, entry]));
  for (const entry of internalEntries) {
    if (entry.installed === false) continue;
    const descriptor = readInstalledPackageDescriptor(entry);
    if (!descriptor) continue;
    const current = withCurrentOwnerProjection(descriptor, owners.get(descriptor.manifest.package_id));
    if (current.manifest.codex_interaction_mode !== 'headless_internal') continue;
    byPluginId.set(entry.pluginId, entry);
  }
  return [...byPluginId.values()];
}

function readCarrierEntriesFromHome(input: CarrierDiscoveryInput) {
  const configuredBinary = input.binary?.trim() || process.env.OPL_CODEX_PLUGIN_BIN?.trim() || null;
  const binary = configuredBinary ?? 'codex';
  const runner = input.runner ?? defaultRunner;
  const result = runner({
    binary,
    args: ['plugin', 'list', ...(input.includeAvailable ? ['--available'] : []), '--json'],
    env: { ...process.env, ...input.env },
  });
  if (result.status !== 0 || result.error) {
    const defaultCarrierAbsent = !configuredBinary
      && (result.error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
    if (defaultCarrierAbsent) {
      return [];
    }
    if (input.failClosedOnCarrierError) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Installed Codex Plugin Manager discovery did not complete.',
        {
          package_id: input.packageId ?? null,
          action: 'list',
          command: ['plugin', 'list', '--json'],
          exit_status: result.status,
          error: result.error?.message ?? null,
          stderr_present: Boolean(result.stderr.trim()),
          failure_code: result.error
            ? 'configured_codex_plugin_carrier_unavailable'
            : 'configured_codex_plugin_carrier_action_failed',
        },
      );
    }
    return [];
  }
  let entries: InstalledCarrierEntry[];
  try {
    entries = parseInstalledCarrierEntries(
      result.stdout,
      input.packageId ?? null,
      input.includeAvailable === true,
    );
  } catch (error) {
    if (input.failClosedOnCarrierError) {
      if (error instanceof FrameworkContractError) throw error;
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Installed Codex Plugin Manager discovery readback is invalid.',
        {
          package_id: input.packageId ?? null,
          failure_code: 'configured_codex_plugin_carrier_readback_invalid_shape',
        },
      );
    }
    return [];
  }
  return entries;
}

export function discoverInstalledPackageDescriptors(input: {
  packageId?: string | null;
  includeInternal?: boolean;
  binary?: string;
  env?: NodeJS.ProcessEnv;
  runner?: CodexPluginCommandRunner;
  failClosedOnCarrierError?: boolean;
} = {}) {
  const installed = discoverPackageDescriptors(input);
  const projected = discoverCurrentOwnerPackageDescriptors(input);
  for (const [packageId, descriptor] of installed) {
    installed.set(packageId, withCurrentOwnerProjection(descriptor, projected.get(packageId)));
  }
  for (const [packageId, descriptor] of discoverProjectLocalCapabilityPackageDescriptors(input)) {
    if (!installed.has(packageId)) installed.set(packageId, descriptor);
  }
  return installed;
}

export function discoverAvailablePackageDescriptors(input: {
  packageId?: string | null;
  binary?: string;
  env?: NodeJS.ProcessEnv;
  runner?: CodexPluginCommandRunner;
} = {}) {
  const discovered = discoverCurrentOwnerPackageDescriptors(input);
  for (const [packageId, descriptor] of discoverPackageDescriptors({ ...input, includeAvailable: true })) {
    discovered.set(packageId, descriptor.readiness.installed
      ? withCurrentOwnerProjection(descriptor, discovered.get(packageId))
      : descriptor);
  }
  return discovered;
}

/**
 * Profile defaults are owned by an installed first-party Package descriptor.
 * A carrier-native Agent Plugin manifest is not sufficient authority to
 * replace user instructions, even when it presents a similar plugin surface.
 */
export function discoverInstalledOwnerProfileDescriptors(input: {
  binary?: string;
  env?: NodeJS.ProcessEnv;
  runner?: CodexPluginCommandRunner;
} = {}) {
  return [...discoverInstalledPackageDescriptors(input).values()]
    .filter((descriptor) => (
      descriptor.manifest.source === 'first_party'
      && descriptor.manifestPath === path.join(descriptor.sourcePath, 'opl-package.json')
      && descriptor.manifest.profile_surface?.runtime_profile.target_id === 'user_agents_profile'
    ))
    .sort((left, right) => left.manifest.package_id.localeCompare(right.manifest.package_id));
}
