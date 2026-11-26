import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAgentPackageReadinessPort } from './agent-package-readiness-port.ts';
import {
  listActiveSyncedCatalogPackageRoots,
  OFFICIAL_OPL_CATALOG_ID as OFFICIAL_PACKAGE_CATALOG_SOURCE_ID,
} from './software-catalog-cache-paths.ts';

export type StandardAgentSeriesMembership = 'standard_domain_agent' | 'capability_package';

type StandardAgentRegistryEntryBase = {
  agent_id: string;
  domain_id: string;
  target_domain_id: string;
  label: string;
  short_label: string;
  display_name: string;
  project: string;
  module_id: string;
  plugin_name: string;
  canonical_plugin_name: string;
  aliases: string[];
  owner_id: string;
  owner_aliases: string[];
};

export type StandardDomainAgentRegistryEntry = StandardAgentRegistryEntryBase & {
  series_membership: typeof STANDARD_AGENT_SERIES_MEMBERSHIP;
};

export type CapabilityPackageRegistryEntry = StandardAgentRegistryEntryBase & {
  series_membership: typeof FRAMEWORK_CAPABILITY_PACKAGE_MEMBERSHIP;
};

export type StandardAgentRegistryEntry =
  | StandardDomainAgentRegistryEntry
  | CapabilityPackageRegistryEntry;

export type CurrentPackageProjection = {
  source_ref: string;
  source_id: string;
  manifest_path: string;
  payload: Record<string, unknown>;
};

export { OFFICIAL_PACKAGE_CATALOG_SOURCE_ID };
export const STANDARD_AGENT_REGISTRY_REF =
  'catalog://public-registry:opl/packages/agents/*.json#/standard_agent_descriptor_projection';
export const STANDARD_AGENT_SERIES_MEMBERSHIP = 'standard_domain_agent' as const;
export const FRAMEWORK_CAPABILITY_PACKAGE_MEMBERSHIP = 'capability_package' as const;

const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PACKAGE_PROJECTION_ROOT = path.join(
  frameworkRoot,
  'contracts',
  'opl-framework',
  'packages',
);
export const PACKAGE_PROJECTION_ROOT_ENV = 'OPL_PACKAGE_PROJECTION_DIR';
export const PACKAGE_CATALOG_ROOT_ENV = 'OPL_CATALOG_ROOT';
export const PACKAGE_CATALOG_SEED_DIR_ENV = 'OPL_CATALOG_SEED_DIR';

export const PACKAGE_CATEGORY_SUBDIRS = [
  'agents',
  'applications',
  'extensions',
  'channels',
  'dependencies',
] as const;

const PACKAGE_CATEGORY_SUBDIR_SET = new Set<string>(PACKAGE_CATEGORY_SUBDIRS);
const PACKAGE_PROJECTION_PREFIX = 'contracts/opl-framework/packages/';
const APP_PROFILE_COMPATIBILITY_PREFIX = 'contracts/opl-framework/app-profile-compatibility/';
export const APP_PROFILE_COMPATIBILITY_SOURCE_ID = 'app-profile-compatibility';

export function isPackageCategorySubdir(name: string): boolean {
  return PACKAGE_CATEGORY_SUBDIR_SET.has(name);
}

export function resolvePackagesRootForManifest(manifestPath: string): string {
  const manifestDir = path.dirname(manifestPath);
  return PACKAGE_CATEGORY_SUBDIR_SET.has(path.basename(manifestDir))
    ? path.dirname(manifestDir)
    : manifestDir;
}

type PackageProjectionRoot = { sourceId: string; packageDir: string };

/** Frozen App profiles can still request the legacy local component until native cutover. */
export function listAppProfileCompatibilityProjections() {
  const packageDir = path.join(frameworkRoot, APP_PROFILE_COMPATIBILITY_PREFIX);
  return [...listProjectionsInSingleRoot({ sourceId: APP_PROFILE_COMPATIBILITY_SOURCE_ID, packageDir }, true).values()];
}

export function resolveOfficialPackageCatalogSeedDir(env: NodeJS.ProcessEnv = process.env) {
  const seedRoot = env[PACKAGE_CATALOG_SEED_DIR_ENV]?.trim();
  return [
    ...(seedRoot ? [path.resolve(seedRoot)] : []),
    path.join(frameworkRoot, 'catalog-seed'),
    path.join(frameworkRoot, 'dist', 'catalog-seed'),
  ].find((candidate) =>
    fs.statSync(path.join(candidate, 'packages'), { throwIfNoEntry: false })?.isDirectory()) ?? null;
}

function packageProjectionRoots(env: NodeJS.ProcessEnv = process.env): PackageProjectionRoot[] {
  const configured = env[PACKAGE_PROJECTION_ROOT_ENV]?.trim();
  if (configured) {
    return [{ sourceId: OFFICIAL_PACKAGE_CATALOG_SOURCE_ID, packageDir: path.resolve(configured) }];
  }

  const synced = listActiveSyncedCatalogPackageRoots(env);
  const official = synced.find(({ sourceId }) => sourceId === OFFICIAL_PACKAGE_CATALOG_SOURCE_ID);
  const external = synced.filter(({ sourceId }) => sourceId !== OFFICIAL_PACKAGE_CATALOG_SOURCE_ID);
  if (official) return [official, ...external];

  const catalogRoot = env[PACKAGE_CATALOG_ROOT_ENV]?.trim();
  const seedRoot = resolveOfficialPackageCatalogSeedDir(env);
  const candidates = [
    ...(catalogRoot ? [path.resolve(catalogRoot, 'packages')] : []),
    ...(seedRoot ? [path.join(seedRoot, 'packages')] : []),
    PACKAGE_PROJECTION_ROOT,
  ];
  const packageDir = candidates.find((candidate) =>
    fs.statSync(candidate, { throwIfNoEntry: false })?.isDirectory());
  return packageDir ? [{ sourceId: OFFICIAL_PACKAGE_CATALOG_SOURCE_ID, packageDir }, ...external] : external;
}

function findManifestInPackageRoot(
  relative: string,
  packageRoot: string,
): { matched: boolean; path: string } {
  const direct = path.resolve(packageRoot, relative);
  if (fs.existsSync(direct) || relative.includes('/')) {
    return { matched: fs.existsSync(direct), path: direct };
  }
  const basename = path.basename(relative);
  const matches = PACKAGE_CATEGORY_SUBDIRS
    .map((subdir) => path.join(packageRoot, subdir, basename))
    .filter((candidate) => fs.existsSync(candidate));
  if (matches.length > 1) {
    throw new Error(`Package descriptor exists in multiple category subdirectories: ${basename}`);
  }
  if (matches.length === 1) {
    return { matched: true, path: matches[0]! };
  }
  return { matched: false, path: direct };
}

export function resolveProjectedManifestPath(
  sourceRef: string,
  packageRoot?: string,
): string {
  if (path.isAbsolute(sourceRef)) return sourceRef;
  if (sourceRef.startsWith('catalog://')) {
    const match = /^catalog:\/\/(public-registry:opl|catalog:[a-z0-9][a-z0-9._-]*)\/packages\/([a-z]+\/[a-z0-9][a-z0-9.-]*\.json)$/.exec(sourceRef);
    if (!match || !isPackageCategorySubdir(match[2]!.split('/')[0]!)) {
      throw new Error(`Invalid catalog Package manifest reference: ${sourceRef}`);
    }
    const [, sourceId, relative] = match;
    const sourceRoot = packageRoot && sourceId === OFFICIAL_PACKAGE_CATALOG_SOURCE_ID
      ? packageRoot
      : packageProjectionRoots().find((root) => root.sourceId === sourceId)?.packageDir;
    if (!sourceRoot) throw new Error(`Software source is not available for manifest reference: ${sourceRef}`);
    const resolved = findManifestInPackageRoot(relative!, sourceRoot);
    // An installed older catalog layout may still have the same official ID
    // in its original location at the root.
    return resolved.matched ? resolved.path : findManifestInPackageRoot(path.posix.basename(relative!), sourceRoot).path;
  }
  const normalized = sourceRef.replace(/\\/g, '/').replace(/^\/+/, '');
  const relative = normalized.startsWith(PACKAGE_PROJECTION_PREFIX)
    ? normalized.slice(PACKAGE_PROJECTION_PREFIX.length)
    : normalized;
  if (packageRoot !== undefined) {
    return findManifestInPackageRoot(relative, packageRoot).path;
  }
  const roots = packageProjectionRoots().filter(({ sourceId }) => sourceId === OFFICIAL_PACKAGE_CATALOG_SOURCE_ID);
  for (const { packageDir } of roots) {
    const resolved = findManifestInPackageRoot(relative, packageDir);
    if (resolved.matched) return resolved.path;
  }
  return findManifestInPackageRoot(relative, roots[0]?.packageDir ?? PACKAGE_PROJECTION_ROOT).path;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => entry.trim())
    : [];
}

function projectionContractError(
  projection: CurrentPackageProjection,
  field: string,
  reason: string,
): never {
  throw new Error(`Package projection ${projection.source_ref} has invalid ${field}: ${reason}.`);
}

function requiredProjectionRecord(
  projection: CurrentPackageProjection,
  value: unknown,
  field: string,
) {
  return record(value) ?? projectionContractError(projection, field, 'expected an object');
}

function requiredProjectionString(
  projection: CurrentPackageProjection,
  value: unknown,
  field: string,
) {
  return stringValue(value) ?? projectionContractError(projection, field, 'expected a non-empty string');
}

function projectionStringList(
  projection: CurrentPackageProjection,
  value: unknown,
  field: string,
  required: boolean,
) {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value)) {
    return projectionContractError(projection, field, 'expected an array');
  }
  const values = stringList(value);
  if (values.length !== value.length) {
    return projectionContractError(projection, field, 'expected non-empty string entries');
  }
  if (new Set(values).size !== values.length) {
    return projectionContractError(projection, field, 'expected unique entries');
  }
  return values;
}

function uniqueStrings(values: readonly (string | null)[]) {
  return [...new Set(values.filter((value): value is string => value !== null && value.length > 0))];
}

function sourceRepoName(sourceRepo: string | null, fallback: string) {
  if (!sourceRepo) return fallback;
  const normalized = sourceRepo.replace(/[\\/]+$/, '').replace(/\.git$/, '');
  return normalized.split(/[\\/]/).at(-1) || fallback;
}

function projectionOrder(payload: Record<string, unknown>) {
  const value = payload.publication_projection_order;
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function comparePackageProjections(left: CurrentPackageProjection, right: CurrentPackageProjection) {
  const orderDelta = projectionOrder(left.payload) - projectionOrder(right.payload);
  return orderDelta || left.source_ref.localeCompare(right.source_ref, 'en');
}

function listProjectionsInSingleRoot(
  { packageDir: packageDirectory, sourceId }: PackageProjectionRoot,
  explicit: boolean,
): Map<string, CurrentPackageProjection> {
  const byId = new Map<string, CurrentPackageProjection>();
  if (!fs.existsSync(packageDirectory)) return byId;
  const searchDirs: Array<{ subdir: string | null; dir: string }> = [
    ...PACKAGE_CATEGORY_SUBDIRS.map((subdir) => ({ subdir, dir: path.join(packageDirectory, subdir) })),
    { subdir: null, dir: packageDirectory },
  ];
  const seenRefs = new Map<string, string>();
  for (const { subdir, dir } of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const absolutePath = path.join(dir, entry.name);
      const parsed = record(JSON.parse(fs.readFileSync(absolutePath, 'utf8')));
      const packageId = stringValue(parsed?.package_id);
      if (!parsed || !packageId || entry.name !== `${packageId}.json`) continue;
      const sourceRef = explicit
        ? absolutePath
        : packageDirectory === PACKAGE_PROJECTION_ROOT
          ? path.posix.join('contracts/opl-framework/packages', subdir ?? '', entry.name)
          : subdir ? `catalog://${sourceId}/packages/${subdir}/${entry.name}` : absolutePath;
      const previous = seenRefs.get(packageId);
      if (previous) {
        throw new Error(`Duplicate package projection for ${packageId}: ${previous} and ${sourceRef}`);
      }
      seenRefs.set(packageId, sourceRef);
      byId.set(packageId, { source_ref: sourceRef, source_id: sourceId, manifest_path: absolutePath, payload: parsed });
    }
  }
  return byId;
}

export function listCurrentPackageProjections(
  packageDirectory?: string,
  options: { officialOnly?: boolean } = {},
): CurrentPackageProjection[] {
  const roots = packageDirectory !== undefined
    ? [{ packageDir: path.resolve(packageDirectory), sourceId: OFFICIAL_PACKAGE_CATALOG_SOURCE_ID }]
    : packageProjectionRoots().filter(({ sourceId }) => !options.officialOnly || sourceId === OFFICIAL_PACKAGE_CATALOG_SOURCE_ID);
  const merged = new Map<string, CurrentPackageProjection>();
  for (const root of roots) {
    for (const [packageId, projection] of listProjectionsInSingleRoot(root, packageDirectory !== undefined)) {
      if (!merged.has(packageId)) merged.set(packageId, projection);
    }
  }
  return [...merged.values()].sort(comparePackageProjections);
}

export function listProjectedOplPackageIds(packageDirectory?: string) {
  const projections = packageDirectory === undefined
    ? syncOfficialPackageRegistry().projections
    : listCurrentPackageProjections(packageDirectory, { officialOnly: true });
  return projections
    .map(({ payload }) => stringValue(payload.package_id))
    .filter((packageId): packageId is string => packageId !== null);
}

function standardAgentEntry(projection: CurrentPackageProjection): StandardDomainAgentRegistryEntry | null {
  const payload = projection.payload;
  if (payload.surface_kind !== 'opl_agent_package_manifest.v1') return null;
  const agentId = requiredProjectionString(projection, payload.agent_id, 'agent_id');
  const packageId = requiredProjectionString(projection, payload.package_id, 'package_id');
  if (agentId !== packageId) {
    projectionContractError(projection, 'agent_id', 'must match package_id');
  }
  const descriptor = requiredProjectionRecord(
    projection,
    payload.standard_agent_descriptor_projection,
    'standard_agent_descriptor_projection',
  );
  if (descriptor.surface_kind !== 'opl_standard_agent_descriptor_projection.v1') {
    projectionContractError(
      projection,
      'standard_agent_descriptor_projection.surface_kind',
      'expected opl_standard_agent_descriptor_projection.v1',
    );
  }
  requiredProjectionString(projection, descriptor.source_ref, 'standard_agent_descriptor_projection.source_ref');
  requiredProjectionString(
    projection,
    descriptor.interface_source_ref,
    'standard_agent_descriptor_projection.interface_source_ref',
  );
  const compatibility = requiredProjectionRecord(
    projection,
    descriptor.compatibility,
    'standard_agent_descriptor_projection.compatibility',
  );
  const codexSurface = requiredProjectionRecord(projection, payload.codex_surface, 'codex_surface');
  const runtimeCarrier = requiredProjectionRecord(
    projection,
    payload.runtime_source_carrier,
    'runtime_source_carrier',
  );
  const pluginName = requiredProjectionString(projection, codexSurface.plugin_id, 'codex_surface.plugin_id');
  const moduleId = requiredProjectionString(
    projection,
    runtimeCarrier.module_id,
    'runtime_source_carrier.module_id',
  );
  const sourceRepo = requiredProjectionString(projection, payload.source_repo, 'source_repo');

  const project = sourceRepoName(sourceRepo, pluginName);
  const descriptorDomainId = requiredProjectionString(
    projection,
    descriptor.domain_id,
    'standard_agent_descriptor_projection.domain_id',
  );
  const runtimeDomainId = requiredProjectionString(
    projection,
    descriptor.runtime_domain_id,
    'standard_agent_descriptor_projection.runtime_domain_id',
  );
  const domainId = requiredProjectionString(
    projection,
    compatibility.registry_domain_id,
    'standard_agent_descriptor_projection.compatibility.registry_domain_id',
  );
  const displayName = requiredProjectionString(projection, payload.display_name, 'display_name');
  const explicitAliases = projectionStringList(
    projection,
    descriptor.explicit_aliases,
    'standard_agent_descriptor_projection.explicit_aliases',
    true,
  );
  const compatibilityAliases = projectionStringList(
    projection,
    compatibility.aliases,
    'standard_agent_descriptor_projection.compatibility.aliases',
    false,
  );
  const ownerAliases = projectionStringList(
    projection,
    compatibility.owner_aliases,
    'standard_agent_descriptor_projection.compatibility.owner_aliases',
    true,
  );
  const aliases = uniqueStrings([
    agentId,
    descriptorDomainId,
    runtimeDomainId,
    moduleId,
    project,
    pluginName,
    ...explicitAliases,
    ...compatibilityAliases,
  ]);

  return {
    agent_id: agentId,
    domain_id: domainId,
    target_domain_id: runtimeDomainId,
    label: displayName,
    short_label: stringValue(descriptor?.short_label) ?? agentId.toUpperCase(),
    display_name: displayName,
    series_membership: STANDARD_AGENT_SERIES_MEMBERSHIP,
    project,
    module_id: moduleId.toUpperCase(),
    plugin_name: pluginName,
    canonical_plugin_name: agentId,
    aliases,
    owner_id: project,
    owner_aliases: uniqueStrings([
      ...ownerAliases,
      agentId,
      project,
      pluginName,
    ]),
  };
}

function capabilityPackageEntries(
  projections: CurrentPackageProjection[],
  standardAgents: StandardAgentRegistryEntry[],
) {
  const byPackageId = new Map(projections.map((projection) => [
    stringValue(projection.payload.package_id),
    projection.payload,
  ]));
  const dependencyModules = new Map<string, string>();
  for (const projection of projections) {
    if (projection.payload.surface_kind !== 'opl_agent_package_manifest.v1') continue;
    for (const dependency of Array.isArray(projection.payload.capability_dependencies)
      ? projection.payload.capability_dependencies
      : []) {
      const dependencyRecord = record(dependency);
      const packageId = stringValue(dependencyRecord?.package_id);
      const moduleId = stringValue(dependencyRecord?.module_id);
      if (packageId && moduleId) {
        const previousModuleId = dependencyModules.get(packageId);
        if (previousModuleId && previousModuleId !== moduleId) {
          throw new Error(
            `Package dependency ${packageId} has conflicting module ids: ${previousModuleId} and ${moduleId}.`,
          );
        }
        dependencyModules.set(packageId, moduleId);
      }
    }
  }

  return [...dependencyModules.entries()].flatMap(([packageId, moduleId]) => {
    const payload = byPackageId.get(packageId);
    const codexSurface = record(payload?.codex_surface);
    const compatibility = record(payload?.compatibility_projection);
    const pluginName = stringValue(codexSurface?.plugin_id) ?? packageId;
    const project = sourceRepoName(stringValue(payload?.source_repo), pluginName);
    const displayName = stringValue(payload?.display_name) ?? packageId;
    if (!payload || standardAgents.some((entry) => entry.agent_id === packageId)) return [];
    return [{
      agent_id: packageId,
      domain_id: moduleId,
      target_domain_id: moduleId,
      label: displayName,
      short_label: stringValue(compatibility?.registry_short_label) ?? displayName,
      display_name: displayName,
      series_membership: FRAMEWORK_CAPABILITY_PACKAGE_MEMBERSHIP,
      project,
      module_id: moduleId.toUpperCase(),
      plugin_name: pluginName,
      canonical_plugin_name: packageId,
      aliases: uniqueStrings([
        packageId,
        moduleId,
        project,
        pluginName,
        ...stringList(compatibility?.registry_aliases),
      ]),
      owner_id: project,
      owner_aliases: [packageId],
    } satisfies CapabilityPackageRegistryEntry];
  });
}

function normalizeRegistryNamespace(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function registryNamespaceClaims(entry: StandardAgentRegistryEntry) {
  return [
    ['agent_id', entry.agent_id],
    ['domain_id', entry.domain_id],
    ['target_domain_id', entry.target_domain_id],
    ['project', entry.project],
    ['module_id', entry.module_id],
    ['plugin_name', entry.plugin_name],
    ['canonical_plugin_name', entry.canonical_plugin_name],
    ...entry.aliases.map((value) => ['alias', value]),
    ...entry.owner_aliases.map((value) => ['owner_alias', value]),
  ] as const;
}

function assertRegistryNamespaceUnique(
  projections: CurrentPackageProjection[],
  entries: StandardAgentRegistryEntry[],
) {
  const packageClaims = new Map<string, { packageId: string; sourceRef: string }>();
  for (const projection of projections) {
    const packageId = stringValue(projection.payload.package_id);
    if (!packageId) continue;
    const key = normalizeRegistryNamespace(packageId);
    const previous = packageClaims.get(key);
    if (previous && previous.packageId !== packageId) {
      throw new Error(
        `Package projection namespace collision for "${key}": ${previous.packageId} and ${packageId}.`,
      );
    }
    packageClaims.set(key, { packageId, sourceRef: projection.source_ref });
  }

  const registryClaims = new Map<string, { agentId: string; field: string; value: string }>();
  for (const entry of entries) {
    for (const [field, value] of registryNamespaceClaims(entry)) {
      const key = normalizeRegistryNamespace(value);
      const packageClaim = packageClaims.get(key);
      if (packageClaim && packageClaim.packageId !== entry.agent_id) {
        throw new Error(
          `Standard Agent registry namespace collision for "${key}": ${entry.agent_id}.${field} conflicts with Package ${packageClaim.packageId}.`,
        );
      }
      const previous = registryClaims.get(key);
      if (previous && previous.agentId !== entry.agent_id) {
        throw new Error(
          `Standard Agent registry namespace collision for "${key}": ${previous.agentId}.${previous.field} conflicts with ${entry.agent_id}.${field}.`,
        );
      }
      registryClaims.set(key, { agentId: entry.agent_id, field, value });
    }
  }
}

export function loadStandardAgentRegistry(
  packageDirectory?: string,
): StandardAgentRegistryEntry[] {
  return standardAgentRegistryFromProjections(listCurrentPackageProjections(packageDirectory, { officialOnly: true }));
}

function standardAgentRegistryFromProjections(projections: CurrentPackageProjection[]) {
  const standardAgents = projections
    .map(standardAgentEntry)
    .filter((entry): entry is StandardDomainAgentRegistryEntry => entry !== null);
  const registry = [
    ...standardAgents,
    ...capabilityPackageEntries(projections, standardAgents),
  ];
  assertRegistryNamespaceUnique(projections, registry);
  return registry;
}

function projectionRootsFingerprint(roots: readonly string[]): string {
  const parts: string[] = [];
  for (const root of roots) {
    parts.push(`root:${root}`);
    if (!fs.existsSync(root)) continue;
    for (const subdir of ['', ...PACKAGE_CATEGORY_SUBDIRS]) {
      const dir = subdir ? path.join(root, subdir) : root;
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => entry.name)
        .sort();
      for (const fileName of files) {
        const stat = fs.statSync(path.join(dir, fileName));
        parts.push(`${subdir}/${fileName}:${stat.mtimeMs}:${stat.size}`);
      }
    }
  }
  return parts.join('|');
}

const registryBacking: StandardAgentRegistryEntry[] = [];
let officialProjections: CurrentPackageProjection[] = [];
let cachedRegistryFingerprint: string | null = null;

function syncOfficialPackageRegistry() {
  const roots = packageProjectionRoots().filter(({ sourceId }) => sourceId === OFFICIAL_PACKAGE_CATALOG_SOURCE_ID);
  const fingerprint = projectionRootsFingerprint(roots.map(({ packageDir }) => packageDir));
  if (fingerprint !== cachedRegistryFingerprint) {
    const projections = roots.flatMap((root) => [...listProjectionsInSingleRoot(root, false).values()])
      .sort(comparePackageProjections);
    const next = standardAgentRegistryFromProjections(projections);
    registryBacking.length = 0;
    registryBacking.push(...next);
    officialProjections = projections;
    cachedRegistryFingerprint = fingerprint;
  }
  return { registry: registryBacking, projections: officialProjections };
}

export const STANDARD_AGENT_REGISTRY: readonly StandardAgentRegistryEntry[] = new Proxy(registryBacking, {
  get(target, prop, receiver) {
    syncOfficialPackageRegistry();
    return Reflect.get(target, prop, receiver);
  },
  has(target, prop) {
    syncOfficialPackageRegistry();
    return Reflect.has(target, prop);
  },
  ownKeys(target) {
    syncOfficialPackageRegistry();
    return Reflect.ownKeys(target);
  },
  getOwnPropertyDescriptor(target, prop) {
    syncOfficialPackageRegistry();
    return Reflect.getOwnPropertyDescriptor(target, prop);
  },
  getPrototypeOf(target) {
    syncOfficialPackageRegistry();
    return Reflect.getPrototypeOf(target);
  },
});

let discoveringInstalledAgents = false;

/** Published compatibility identities plus fresh, carrier-owned Agent descriptors.
 * Discovery supplies membership only; launch readiness remains with the Package port.
 */
export function listStandardAgentRegistry(): StandardAgentRegistryEntry[] {
  const entries = new Map(STANDARD_AGENT_REGISTRY.map((entry) => [entry.agent_id, entry]));
  // Carrier normalization itself may resolve published compatibility aliases.
  // It must not recursively start another carrier discovery.
  if (discoveringInstalledAgents) return [...entries.values()];
  discoveringInstalledAgents = true;
  try {
    for (const entry of readAgentPackageReadinessPort()?.listInstalledStandardAgentEntries?.() ?? []) {
      if (!entries.has(entry.agent_id)) entries.set(entry.agent_id, entry);
    }
  } finally {
    discoveringInstalledAgents = false;
  }
  const registry = [...entries.values()];
  assertRegistryNamespaceUnique(syncOfficialPackageRegistry().projections, registry);
  return registry;
}

export type StandardAgentId = typeof STANDARD_AGENT_REGISTRY[number]['agent_id'];

function normalizeAgentKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function listStandardAgentIds() {
  return listStandardAgentRegistry().map((entry) => entry.agent_id);
}

export function listStandardDomainAgentIds() {
  return listStandardAgentRegistry()
    .filter((entry) => entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP)
    .map((entry) => entry.agent_id);
}

export function standardDomainAgentFamilyProjection(format: 'compact' | 'full') {
  const agents = listStandardAgentRegistry()
    .filter((entry) => entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP)
    .map((entry) => ({
      package_id: entry.agent_id,
      short_label: entry.short_label,
      display_name: entry.display_name,
      label: format === 'compact' ? entry.short_label : entry.display_name,
    }));
  return {
    surface_kind: 'opl_standard_agent_family_labels.v1' as const,
    format,
    labels: agents.map((entry) => entry.label),
    agents,
  };
}

function registryAliases(entry: StandardAgentRegistryEntry) {
  return [
    entry.agent_id,
    entry.domain_id,
    entry.target_domain_id,
    entry.project,
    entry.plugin_name,
    entry.canonical_plugin_name,
    ...entry.aliases,
  ];
}

export function resolveStandardAgent(value: string) {
  const normalized = normalizeAgentKey(value);
  const matches = (entry: StandardAgentRegistryEntry) =>
    registryAliases(entry).some((alias) => normalizeAgentKey(alias) === normalized);
  return STANDARD_AGENT_REGISTRY.find(matches) ?? listStandardAgentRegistry().find(matches) ?? null;
}

export function resolveStandardAgentByDomainId(domainId: string) {
  const normalized = normalizeAgentKey(domainId);
  return listStandardAgentRegistry().find((entry) =>
    [entry.domain_id, entry.target_domain_id].some((value) => normalizeAgentKey(value) === normalized)
  ) ?? null;
}

export function resolveStandardAgentByCanonicalPluginName(canonicalPluginName: string) {
  return listStandardAgentRegistry().find((entry) => entry.canonical_plugin_name === canonicalPluginName) ?? null;
}

export function resolveStandardAgentByOwnerAlias(value: string) {
  const normalized = normalizeAgentKey(value);
  return listStandardAgentRegistry().find((entry) =>
    entry.owner_aliases.some((alias) => normalizeAgentKey(alias) === normalized)
  ) ?? null;
}

export function normalizeStandardDomainAgentId(value: string) {
  const entry = resolveStandardAgent(value);
  return entry?.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP
    ? entry.target_domain_id
    : value.trim().toLowerCase();
}

export function matchesStandardDomainAgentCatalogEntry(
  value: string,
  candidate: { project_id: string; project: string },
) {
  const entry = resolveStandardAgent(value);
  return entry?.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP
    && (candidate.project_id === entry.domain_id || candidate.project === entry.project);
}

export function standardAgentDomainAliasEntries() {
  return listStandardAgentRegistry().flatMap((entry) =>
    registryAliases(entry).map((alias) => ({
      alias,
      domain_id: entry.domain_id,
      module_locator_id: entry.module_id.toLowerCase(),
    }))
  );
}
