import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { isRecord } from '../../../kernel/contract-validation.ts';
import {
  agentPluginOpenAiInterface,
  agentPluginSkillsRelativeRoot,
  resolveAgentPluginManifest,
  type ResolvedAgentPluginManifest,
} from '../../../kernel/agent-plugin-manifest.ts';
import {
  listCurrentPackageProjections,
  PACKAGE_PROJECTION_ROOT,
} from '../../../kernel/standard-agent-registry.ts';
import { canonicalAgentPackageId } from '../agent-package-identity.ts';
import { isFirstPartyPackage } from '../agent-package-first-party.ts';
import { resolveCanonicalOplFamilyMarketplaceId } from '../system-installation/codex-plugin-registry.ts';
import { normalizePackageManifest } from './manifest-normalizers.ts';
import { sha256Text } from './shared.ts';
import type {
  InstalledCarrierEntry,
  InstalledPackageDescriptor,
  InstalledPackageManifest,
} from './installed-codex-plugin-directory-types.ts';

function frameworkProjectionRemainsCallableWhileDisabled(
  manifest: Pick<InstalledPackageManifest, 'package_role' | 'codex_default_exposure' | 'codex_interaction_mode' | 'codex_surface'>,
) {
  const interactionMode = manifest.codex_interaction_mode
    ?? manifest.codex_surface?.interaction_mode;
  return interactionMode === 'headless_internal'
    || (manifest.package_role === 'capability_package' && manifest.codex_default_exposure === false);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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

export function readInstalledPackageDescriptor(entry: InstalledCarrierEntry): InstalledPackageDescriptor | null {
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

export function withCurrentOwnerProjection(
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
  const physicalLock = physicalContentLock(descriptor, ownerProjection);
  return {
    ...descriptor,
    manifest: physicalLock
      ? { ...ownerProjection.manifest, ...physicalLock }
      : ownerProjection.manifest,
    manifestPath: ownerProjection.manifestPath,
    manifest_sha256: ownerProjection.manifest_sha256,
    carrier: ownerProjection.carrier,
    readiness,
  };
}

/**
 * A content lock only describes the bytes it was computed over. The current
 * owner projection is the SSOT for Package identity, carrier selector and
 * publication, but its lock describes the published payload. A physical
 * carrier that ships every file its own manifest locks — a developer checkout,
 * or any payload that is complete against the owner lock — must keep that lock;
 * otherwise one module path answers to two content identities and the
 * installed-runtime-module restart guard reports drift that never happened.
 *
 * Published payloads that omit owner-only files keep the projection lock, so
 * this stays a no-op for a normal installed carrier.
 */
function physicalContentLock(
  descriptor: InstalledPackageDescriptor,
  ownerProjection: InstalledPackageDescriptor,
) {
  const declaredDigest = descriptor.manifest.content_digest;
  const localPaths = descriptor.manifest.content_lock_paths ?? [];
  if (!declaredDigest || localPaths.length === 0) return null;
  const projectedPaths = ownerProjection.manifest.content_lock_paths ?? [];
  if (localPaths.length === projectedPaths.length
    && localPaths.every((entry) => projectedPaths.includes(entry))) return null;
  const packageRoot = path.resolve(descriptor.sourcePath);
  const complete = localPaths.every((relativePath) => {
    const candidate = path.resolve(packageRoot, relativePath);
    if (candidate === packageRoot || !candidate.startsWith(`${packageRoot}${path.sep}`)) return false;
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  return complete ? { content_digest: declaredDigest, content_lock_paths: localPaths } : null;
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
  const interactionMode = descriptor.manifest.codex_interaction_mode
    ?? descriptor.manifest.codex_surface?.interaction_mode;
  if (interactionMode === 'headless_internal') {
    return !descriptor.enabled;
  }
  return descriptor.enabled;
}
