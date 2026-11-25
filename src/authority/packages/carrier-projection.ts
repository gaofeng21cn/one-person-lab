import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseToml } from 'smol-toml';

import carrierProjectionSchema from
  '../../../contracts/opl-framework/carrier-projection.schema.json' with { type: 'json' };
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { assertJsonSchemaPayload } from '../../kernel/schema-registry.ts';

type JsonRecord = Record<string, unknown>;

type CarrierProjectionFileAlias = {
  from: string;
  to: string;
  optional?: boolean;
  executable?: boolean;
};

type CarrierProjectionPluginManifestRule = {
  path: string;
  sync_version?: boolean;
  sync_name_from_plugin_id?: boolean;
  set_fields?: JsonRecord;
  sync_interface?: {
    target_pointer: 'interface' | 'extensions.com.openai.interface';
    logo_prefix?: string;
  };
};

type CarrierProjectionPackageManifestRule = {
  source?: string;
  target?: string;
  mode: 'none' | 'copy_root' | 'clone_with_plugin_source_dot' | 'strip_keys' | 'pick_keys';
  strip_keys?: string[];
  pick_keys?: string[];
  codex_surface_pick_keys?: string[];
  codex_surface_plugin_source_dot?: boolean;
  override_fields?: JsonRecord;
  domain_id_from_domain_descriptor?: boolean;
  task_provider_suffix_from_domain_descriptor?: string;
  strip_entrypoint_carrier_prefix?: string;
  sync_root_opl_package?: {
    source?: string;
    target?: string;
    strip_keys?: string[];
  };
};

export type CarrierProjectionConfig = {
  schema_version: 'opl_carrier_projection.v1';
  carrier_root: string;
  resource_target_prefix?: string;
  resource_source_mode?: 'git_tracked' | 'filesystem';
  preserve_exec_mode?: boolean;
  resource_roots?: string[];
  extra_files?: string[];
  exclude_prefixes?: string[];
  exclude_path_segments?: string[];
  exclude_basename_prefixes?: string[];
  exclude_basenames?: string[];
  include_extensions?: string[];
  preserve_carrier_files?: string[];
  prune_roots?: string[];
  file_aliases?: CarrierProjectionFileAlias[];
  copy_presentation_icon?: boolean;
  version_sync_checks?: {
    manifest_path?: string;
    pyproject_toml?: string;
    uv_lock?: string;
    update_bundled_required_skill_pack_version?: boolean;
  };
  package_manifest_projection?: CarrierProjectionPackageManifestRule;
  plugin_manifests?: CarrierProjectionPluginManifestRule[];
  adapter_projection?: {
    source: string;
    target: string;
    argv_rewrites?: Array<{ from: string; to: string }>;
  };
};

export type ProjectCarrierInput = {
  repoRoot?: string;
  check?: boolean;
  projectionRef?: string;
};

type ExpectedTarget = {
  bytes: Buffer;
  mode: number;
};

const CARRIER_PROJECTION_SCHEMA_REF = 'contracts/opl-framework/carrier-projection.schema.json';
const DEFAULT_PROJECTION_CONFIG_REF = 'contracts/carrier_projection.json';

function shapeError(message: string, details: JsonRecord = {}) {
  return new FrameworkContractError('contract_shape_invalid', message, {
    surface: 'opl_pack_project_carrier',
    ...details,
  });
}

function normalizeRelativeRef(rawRef: string, field: string, allowTrailingSlash = false): string {
  const trimmed = rawRef.trim();
  if (!trimmed || trimmed.includes('\0') || path.isAbsolute(trimmed)) {
    throw shapeError(`${field} must be a non-empty relative path.`, { field, ref: rawRef });
  }
  const stripped = allowTrailingSlash ? trimmed.replace(/\/+$/, '') : trimmed;
  if (!stripped || stripped === '.') {
    throw shapeError(`${field} must resolve inside the repository without naming root.`, { field, ref: rawRef });
  }
  const posixParts = stripped.replaceAll('\\', '/').split('/');
  if (posixParts.some((part) => !part || part === '.' || part === '..')) {
    throw shapeError(`${field} must not contain empty, '.', or '..' path segments.`, { field, ref: rawRef });
  }
  return posixParts.join('/');
}

function resolveContainedFilePath(rootDir: string, relativePosixPath: string, field: string): string {
  const normalized = normalizeRelativeRef(relativePosixPath, field);
  const resolved = path.resolve(rootDir, normalized);
  if (resolved === rootDir || !resolved.startsWith(`${rootDir}${path.sep}`)) {
    throw shapeError(`${field} escapes its containment root.`, { field, ref: normalized });
  }
  return resolved;
}

function assertNoSymlinkSegments(rootDir: string, targetPath: string, field: string) {
  if (targetPath === rootDir) return;
  const rel = path.relative(rootDir, targetPath);
  if (!rel || path.isAbsolute(rel) || rel === '..' || rel.startsWith(`..${path.sep}`)) {
    throw shapeError(`${field} escapes containment root.`, { field, path: targetPath });
  }
  let current = rootDir;
  for (const part of rel.split(path.sep)) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) continue;
    if (fs.lstatSync(current).isSymbolicLink()) {
      throw shapeError(`${field} must not traverse or target a symbolic link.`, {
        field,
        path: path.relative(rootDir, current).replaceAll(path.sep, '/'),
      });
    }
  }
}

function readRegularFile(rootDir: string, relativePosix: string, field: string) {
  const absolute = resolveContainedFilePath(rootDir, relativePosix, field);
  assertNoSymlinkSegments(rootDir, absolute, field);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(absolute);
  } catch (error) {
    throw new FrameworkContractError('contract_file_missing', `Required carrier source file is missing: ${relativePosix}.`, {
      surface: 'opl_pack_project_carrier',
      path: relativePosix,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!stat.isFile()) {
    throw shapeError(`${field} must be a regular file: ${relativePosix}.`, { field, path: relativePosix });
  }
  return {
    bytes: fs.readFileSync(absolute),
    mode: stat.mode & 0o777,
  };
}

function jsonBytes(payload: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function joinRel(...parts: Array<string | undefined>): string {
  const cleaned = parts
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter((part) => part.length > 0);
  return cleaned.join('/');
}

function matchesExclusion(relativePosix: string, config: CarrierProjectionConfig): boolean {
  const excludePrefixes = (config.exclude_prefixes ?? []).map((p) => p.replace(/^\/+/, ''));
  if (excludePrefixes.some((prefix) => relativePosix.startsWith(prefix))) {
    return true;
  }
  const segments = relativePosix.split('/');
  const excludeSegments = new Set(config.exclude_path_segments ?? []);
  if (segments.some((segment) => excludeSegments.has(segment))) {
    return true;
  }
  const basename = segments[segments.length - 1] ?? '';
  if ((config.exclude_basenames ?? []).includes(basename)) {
    return true;
  }
  if ((config.exclude_basename_prefixes ?? []).some((prefix) => basename.startsWith(prefix))) {
    return true;
  }
  if (config.include_extensions && config.include_extensions.length > 0) {
    const ext = path.posix.extname(relativePosix);
    if (!config.include_extensions.includes(ext)) {
      return true;
    }
  }
  return false;
}

function inTrackedRoots(relative: string, roots: string[]) {
  return roots.some((root) => relative === root || relative.startsWith(`${root}/`));
}

export function trackedCarrierBlobPaths(input: {
  projection: unknown;
  projectionRef: string;
  carrierRoot: string;
  trackedPaths: ReadonlySet<string>;
  carrierPaths: string[];
  ownerManifest?: unknown;
}) {
  const config = validateConfig(input.projection, input.projectionRef);
  const carrierRoot = normalizeRelativeRef(config.carrier_root, 'carrier_root', true);
  if (carrierRoot !== input.carrierRoot) {
    throw shapeError('A published carrier must project unchanged Git blobs into its configured source root.', {
      projection_ref: input.projectionRef,
      carrier_root: carrierRoot,
    });
  }
  for (const rule of config.plugin_manifests ?? []) {
    const manifestRel = normalizeRelativeRef(rule.path, 'plugin_manifests.path');
    if (manifestRel === carrierRoot || manifestRel.startsWith(`${carrierRoot}/`)) {
      if (!input.trackedPaths.has(manifestRel)) {
        throw shapeError('A published carrier must commit its declared plugin manifest inside carrier_root.', {
          projection_ref: input.projectionRef,
          path: manifestRel,
        });
      }
    }
  }
  if (config.package_manifest_projection && config.package_manifest_projection.mode !== 'none') {
    const pkgTarget = normalizeRelativeRef(
      config.package_manifest_projection.target ?? 'opl-package.json',
      'package_manifest_projection.target',
    );
    const carrierPkgRel = joinRel(carrierRoot, pkgTarget);
    if (!input.trackedPaths.has(carrierPkgRel)) {
      throw shapeError('A published carrier must commit its projected opl-package.json inside carrier_root.', {
        projection_ref: input.projectionRef,
        path: carrierPkgRel,
      });
    }
  }
  if (config.adapter_projection) {
    const adapterRel = joinRel(
      carrierRoot,
      normalizeRelativeRef(config.adapter_projection.target, 'adapter_projection.target'),
    );
    if (!input.trackedPaths.has(adapterRel)) {
      throw shapeError('A published carrier must commit its projected adapter manifest inside carrier_root.', {
        projection_ref: input.projectionRef,
        path: adapterRel,
      });
    }
  }
  const paths = new Map<string, string>();
  for (const carrierPath of input.carrierPaths) {
    const source = joinRel(carrierRoot, carrierPath);
    if (input.trackedPaths.has(source)) paths.set(carrierPath, source);
  }
  const prefix = config.resource_target_prefix
    ? normalizeRelativeRef(config.resource_target_prefix, 'resource_target_prefix', true)
    : '';
  const roots = (config.resource_roots ?? []).map((root) => normalizeRelativeRef(root, 'resource_roots', true));
  for (const source of input.trackedPaths) {
    if (inTrackedRoots(source, roots) && !matchesExclusion(source, config)) {
      const relative = normalizeRelativeRef(source, 'tracked carrier resource');
      paths.set(joinRel(prefix, relative), relative);
    }
  }
  for (const extra of config.extra_files ?? []) {
    const source = normalizeRelativeRef(extra, 'extra_files');
    paths.set(joinRel(prefix, source), source);
  }
  if (config.copy_presentation_icon) {
    if (input.ownerManifest === undefined) {
      throw shapeError('A published carrier with copy_presentation_icon requires ownerManifest to map presentation.icon_ref.', {
        projection_ref: input.projectionRef,
      });
    }
    const manifest = isRecord(input.ownerManifest) ? input.ownerManifest : {};
    const presentation = isRecord(manifest.presentation) ? manifest.presentation : {};
    if (typeof presentation.icon_ref === 'string' && presentation.icon_ref.trim()) {
      const iconRel = normalizeRelativeRef(presentation.icon_ref, 'presentation.icon_ref');
      if (!input.trackedPaths.has(iconRel)) {
        throw shapeError('A published carrier must commit its declared presentation.icon_ref.', {
          projection_ref: input.projectionRef,
          path: iconRel,
        });
      }
      paths.set(iconRel, iconRel);
    }
  }
  for (const alias of config.file_aliases ?? []) {
    const source = normalizeRelativeRef(alias.from, 'file_aliases.from');
    if (alias.optional && !input.trackedPaths.has(source)) continue;
    if (alias.executable) {
      throw shapeError('A published carrier alias must preserve the committed file mode.', { source });
    }
    paths.set(normalizeRelativeRef(alias.to, 'file_aliases.to'), source);
  }
  return paths;
}

function listGitTrackedStageEntries(repoRoot: string): Map<string, number> {
  const result = spawnSync('git', ['-C', repoRoot, 'ls-files', '--stage', '-z'], {
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw shapeError('Carrier projection requires a readable Git index when resource_source_mode is git_tracked.', {
      repo_root: repoRoot,
      cause: result.error?.message ?? result.stderr?.toString('utf8') ?? null,
    });
  }
  const entries = new Map<string, number>();
  const raw = result.stdout ?? Buffer.alloc(0);
  let start = 0;
  while (start < raw.length) {
    const nul = raw.indexOf(0, start);
    const end = nul === -1 ? raw.length : nul;
    if (end > start) {
      const recordBuf = raw.subarray(start, end);
      const tab = recordBuf.indexOf(9);
      if (tab !== -1) {
        const meta = recordBuf.subarray(0, tab).toString('utf8').split(/\s+/);
        const relPath = recordBuf.subarray(tab + 1).toString('utf8');
        const modeOctal = meta[0];
        const stage = meta[2];
        if (stage !== '0') {
          throw shapeError(`Carrier source contains unmerged Git index entry: ${relPath}.`, { path: relPath });
        }
        if (modeOctal === '120000') {
          entries.set(relPath, 0o120000);
        } else if (modeOctal === '100755') {
          entries.set(relPath, 0o755);
        } else if (modeOctal === '100644') {
          entries.set(relPath, 0o644);
        }
      }
    }
    start = end + 1;
  }
  return entries;
}

function walkFilesystemResources(
  repoRoot: string,
  rootRel: string,
  config: CarrierProjectionConfig,
  out: string[],
) {
  const startDir = resolveContainedFilePath(repoRoot, rootRel, 'resource_roots');
  if (!fs.existsSync(startDir) || fs.lstatSync(startDir).isSymbolicLink() || !fs.lstatSync(startDir).isDirectory()) {
    return;
  }
  const visit = (dirAbs: string, relPrefix: string) => {
    const entries = fs.readdirSync(dirAbs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink() || entry.name === '.git') continue;
      const childRel = `${relPrefix}/${entry.name}`;
      if (entry.isDirectory()) {
        const excludeSegments = new Set(config.exclude_path_segments ?? []);
        if (excludeSegments.has(entry.name)) continue;
        visit(path.join(dirAbs, entry.name), childRel);
      } else if (entry.isFile() && !matchesExclusion(childRel, config)) {
        out.push(childRel);
      }
    }
  };
  visit(startDir, rootRel);
}

function matchesPreserveRule(carrierRelPosix: string, preserveRules: string[]): boolean {
  for (const rawRule of preserveRules) {
    const rule = rawRule.replace(/^\/+/, '');
    if (rule.endsWith('/**')) {
      const prefix = rule.slice(0, -2);
      if (carrierRelPosix.startsWith(prefix)) return true;
    } else if (rule.endsWith('/')) {
      if (carrierRelPosix.startsWith(rule)) return true;
    } else if (carrierRelPosix === rule) {
      return true;
    }
  }
  return false;
}

function projectPackageManifest(
  owner: JsonRecord,
  rule: CarrierProjectionPackageManifestRule,
  repoRoot: string,
): Buffer | null {
  if (rule.mode === 'none') return null;
  if (rule.mode === 'copy_root') return jsonBytes(owner);
  if (rule.mode === 'clone_with_plugin_source_dot') {
    const cloned = structuredClone(owner);
    const codexSurface = isRecord(cloned.codex_surface) ? { ...cloned.codex_surface } : {};
    codexSurface.plugin_source_path = '.';
    cloned.codex_surface = codexSurface;
    return jsonBytes(cloned);
  }
  if (rule.mode === 'strip_keys') {
    const stripped = structuredClone(owner);
    for (const key of rule.strip_keys ?? []) delete stripped[key];
    return jsonBytes(stripped);
  }

  // pick_keys mode
  const projected: JsonRecord = {};
  for (const key of rule.pick_keys ?? []) {
    if (Object.hasOwn(owner, key)) {
      projected[key] = structuredClone(owner[key]);
    }
  }
  if (rule.codex_surface_pick_keys || rule.codex_surface_plugin_source_dot) {
    const sourceSurface = isRecord(owner.codex_surface) ? owner.codex_surface : {};
    const targetSurface: JsonRecord = {};
    if (rule.codex_surface_pick_keys) {
      for (const key of rule.codex_surface_pick_keys) {
        if (Object.hasOwn(sourceSurface, key)) {
          targetSurface[key] = structuredClone(sourceSurface[key]);
        }
      }
    } else {
      Object.assign(targetSurface, structuredClone(sourceSurface));
    }
    if (rule.codex_surface_plugin_source_dot) {
      targetSurface.plugin_source_path = '.';
    }
    projected.codex_surface = targetSurface;
  }
  if (rule.override_fields) {
    Object.assign(projected, structuredClone(rule.override_fields));
  }
  if (rule.domain_id_from_domain_descriptor || rule.task_provider_suffix_from_domain_descriptor) {
    const descriptorRef = typeof owner.domain_descriptor_ref === 'string' ? owner.domain_descriptor_ref : '';
    if (!descriptorRef) {
      throw shapeError('Owner manifest must declare domain_descriptor_ref for domain descriptor projection.');
    }
    const domainFile = readRegularFile(repoRoot, descriptorRef, 'domain_descriptor_ref');
    const domain = parseJsonText(domainFile.bytes.toString('utf8'));
    if (isRecord(domain) && rule.domain_id_from_domain_descriptor && typeof domain.domain_id === 'string') {
      projected.domain_id = domain.domain_id;
    }
    if (rule.task_provider_suffix_from_domain_descriptor) {
      projected.task_provider_ref = `${descriptorRef}${rule.task_provider_suffix_from_domain_descriptor}`;
    }
  }
  if (rule.strip_entrypoint_carrier_prefix && Array.isArray(projected.entrypoints)) {
    const stripPrefix = `${rule.strip_entrypoint_carrier_prefix.replace(/\/+$/, '')}/`;
    projected.entrypoints = projected.entrypoints.map((entry) => {
      if (!isRecord(entry) || typeof entry.carrier_ref !== 'string') return entry;
      const normalized = entry.carrier_ref.replace(/^\/+/, '');
      if (normalized.startsWith(stripPrefix)) {
        return { ...entry, carrier_ref: normalized.slice(stripPrefix.length) };
      }
      return entry;
    });
  }
  return jsonBytes(projected);
}

function updatePluginManifest(
  repoRoot: string,
  rule: CarrierProjectionPluginManifestRule,
  owner: JsonRecord,
): Buffer {
  const rel = normalizeRelativeRef(rule.path, 'plugin_manifests.path');
  const existing = parseJsonText(readRegularFile(repoRoot, rel, 'plugin_manifests.path').bytes.toString('utf8'));
  if (!isRecord(existing)) {
    throw shapeError(`Plugin manifest must be a JSON object: ${rel}.`, { path: rel });
  }
  const updated = structuredClone(existing);
  if (rule.sync_version) {
    updated.version = owner.version;
  }
  if (rule.sync_name_from_plugin_id) {
    const codexSurface = isRecord(owner.codex_surface) ? owner.codex_surface : {};
    if (typeof codexSurface.plugin_id === 'string' && codexSurface.plugin_id) {
      updated.name = codexSurface.plugin_id;
    }
  }
  if (rule.set_fields) {
    Object.assign(updated, structuredClone(rule.set_fields));
  }
  if (rule.sync_interface) {
    const presentation = isRecord(owner.presentation) ? owner.presentation : {};
    const iconRef = typeof presentation.icon_ref === 'string' ? presentation.icon_ref : null;
    const prefix = rule.sync_interface.logo_prefix ?? './';
    const iconPath = iconRef ? `${prefix}${iconRef.replace(/^\.\//, '')}` : undefined;
    let uiTarget: JsonRecord;
    if (rule.sync_interface.target_pointer === 'interface') {
      if (!isRecord(updated.interface)) updated.interface = {};
      uiTarget = updated.interface as JsonRecord;
    } else {
      if (!isRecord(updated.extensions)) updated.extensions = {};
      const extensions = updated.extensions as JsonRecord;
      if (!isRecord(extensions['com.openai'])) extensions['com.openai'] = {};
      const openai = extensions['com.openai'] as JsonRecord;
      if (!isRecord(openai.interface)) openai.interface = {};
      uiTarget = openai.interface as JsonRecord;
    }
    if (typeof owner.display_name === 'string') {
      uiTarget.displayName = owner.display_name;
    }
    if (iconPath) {
      uiTarget.logo = iconPath;
      uiTarget.composerIcon = iconPath;
    }
  }
  return jsonBytes(updated);
}

function rewriteAdapter(
  repoRoot: string,
  adapterConfig: NonNullable<CarrierProjectionConfig['adapter_projection']>,
): Buffer {
  const sourceRel = normalizeRelativeRef(adapterConfig.source, 'adapter_projection.source');
  const parsed = parseJsonText(readRegularFile(repoRoot, sourceRel, 'adapter_projection.source').bytes.toString('utf8'));
  if (!isRecord(parsed)) {
    throw shapeError(`Adapter manifest must be a JSON object: ${sourceRel}.`, { path: sourceRel });
  }
  const cloned = structuredClone(parsed);
  const rewriteMap = new Map((adapterConfig.argv_rewrites ?? []).map((item) => [item.from, item.to]));
  if (rewriteMap.size > 0) {
    for (const sectionName of ['reads', 'actions'] as const) {
      const section = cloned[sectionName];
      if (!isRecord(section)) continue;
      for (const entry of Object.values(section)) {
        if (!isRecord(entry) || !Array.isArray(entry.argv)) continue;
        entry.argv = entry.argv.map((arg) => (typeof arg === 'string' && rewriteMap.has(arg) ? rewriteMap.get(arg)! : arg));
      }
    }
  }
  return jsonBytes(cloned);
}

function validateConfig(raw: unknown, configRel: string): CarrierProjectionConfig {
  assertJsonSchemaPayload({
    schemaId: CARRIER_PROJECTION_SCHEMA_REF,
    schema: carrierProjectionSchema,
    sourceRef: configRel,
  }, raw);
  return raw as CarrierProjectionConfig;
}

export function projectCarrier(input: ProjectCarrierInput = {}) {
  const repoRoot = fs.realpathSync.native(path.resolve(input.repoRoot ?? process.cwd()));
  const checkOnly = input.check === true;
  const configRel = normalizeRelativeRef(
    input.projectionRef ?? DEFAULT_PROJECTION_CONFIG_REF,
    'projectionRef',
  );
  const config = validateConfig(
    parseJsonText(readRegularFile(repoRoot, configRel, 'projection_config').bytes.toString('utf8')),
    configRel,
  );
  const carrierRel = normalizeRelativeRef(config.carrier_root, 'carrier_root', true);
  const targetPrefix = config.resource_target_prefix
    ? normalizeRelativeRef(config.resource_target_prefix, 'resource_target_prefix', true)
    : '';
  const sourceMode = config.resource_source_mode ?? 'git_tracked';
  const preserveExecMode = config.preserve_exec_mode === true;
  const manifestRel = normalizeRelativeRef(
    config.version_sync_checks?.manifest_path ?? 'contracts/opl_agent_package_manifest.json',
    'version_sync_checks.manifest_path',
  );
  const ownerFile = readRegularFile(repoRoot, manifestRel, 'manifest_path');
  const parsedOwner = parseJsonText(ownerFile.bytes.toString('utf8'));
  if (!isRecord(parsedOwner)) {
    throw shapeError(`Owner package manifest must be a JSON object: ${manifestRel}.`, { path: manifestRel });
  }
  const owner = structuredClone(parsedOwner);
  const versionMismatches: string[] = [];

  if (config.version_sync_checks?.pyproject_toml) {
    const pyRel = normalizeRelativeRef(config.version_sync_checks.pyproject_toml, 'pyproject_toml');
    const pyproject = parseToml(readRegularFile(repoRoot, pyRel, 'pyproject_toml').bytes.toString('utf8')) as JsonRecord;
    const project = isRecord(pyproject.project) ? pyproject.project : {};
    if (project.version !== owner.version) {
      versionMismatches.push(`pyproject.toml version (${String(project.version)}) != owner version (${String(owner.version)})`);
    }
    if (config.version_sync_checks.uv_lock) {
      const lockRel = normalizeRelativeRef(config.version_sync_checks.uv_lock, 'uv_lock');
      const lock = parseToml(readRegularFile(repoRoot, lockRel, 'uv_lock').bytes.toString('utf8')) as JsonRecord;
      const packages = Array.isArray(lock.package) ? lock.package : [];
      const locked = packages.find((pkg) => isRecord(pkg) && pkg.name === project.name);
      if (!isRecord(locked) || locked.version !== owner.version) {
        versionMismatches.push(`uv.lock version (${isRecord(locked) ? String(locked.version) : 'missing'}) != owner version (${String(owner.version)})`);
      }
    }
  }

  let ownerBytes: Buffer = ownerFile.bytes;
  let ownerManifestUpdated = false;
  if (config.version_sync_checks?.update_bundled_required_skill_pack_version && Array.isArray(owner.skill_packs)) {
    for (const pack of owner.skill_packs) {
      if (!isRecord(pack)) continue;
      if (
        pack.source === 'repo_local_codex_plugin_carrier'
        && pack.install_mode === 'bundled_required'
        && pack.version !== owner.version
      ) {
        versionMismatches.push(`skill_pack ${String(pack.id ?? 'unknown')} version (${String(pack.version)}) != owner version (${String(owner.version)})`);
        pack.version = owner.version;
        ownerManifestUpdated = true;
      }
    }
    if (ownerManifestUpdated) {
      ownerBytes = jsonBytes(owner);
    }
  }

  // Hard version mismatches (pyproject / uv.lock) cannot be fixed by projection; fail closed.
  const hardVersionErrors = versionMismatches.filter((msg) => !msg.startsWith('skill_pack '));
  if (hardVersionErrors.length > 0) {
    throw shapeError('Owner package version must match Python project and lock versions before carrier projection.', {
      repo_root: repoRoot,
      version_mismatches: versionMismatches,
    });
  }

  const expected = new Map<string, ExpectedTarget>();
  if (ownerManifestUpdated) {
    expected.set(manifestRel, { bytes: ownerBytes, mode: 0o644 });
  }

  const normalizedRoots = (config.resource_roots ?? []).map((r) => normalizeRelativeRef(r, 'resource_roots', true));
  const trackedEntries = sourceMode === 'git_tracked' ? listGitTrackedStageEntries(repoRoot) : null;
  const collectedResources: Array<{ rel: string; mode: number }> = [];

  if (sourceMode === 'git_tracked' && trackedEntries) {
    for (const [trackedPath, gitMode] of trackedEntries.entries()) {
      if (!inTrackedRoots(trackedPath, normalizedRoots)) continue;
      if (gitMode === 0o120000) {
        throw shapeError(`Carrier owner resource must not be a symbolic link: ${trackedPath}.`, { path: trackedPath });
      }
      if (!matchesExclusion(trackedPath, config)) {
        collectedResources.push({ rel: trackedPath, mode: preserveExecMode ? gitMode : 0o644 });
      }
    }
    const configInRoots = normalizedRoots.some(
      (root) => configRel === root || configRel.startsWith(`${root}/`),
    );
    if (configInRoots && !trackedEntries.has(configRel) && !matchesExclusion(configRel, config)) {
      collectedResources.push({ rel: configRel, mode: 0o644 });
    }
  } else {
    const fsPaths: string[] = [];
    for (const root of normalizedRoots) {
      walkFilesystemResources(repoRoot, root, config, fsPaths);
    }
    for (const rel of fsPaths) {
      collectedResources.push({ rel, mode: 0o644 });
    }
  }

  for (const { rel, mode } of collectedResources) {
    const destRel = joinRel(carrierRel, targetPrefix, rel);
    if (rel === manifestRel && ownerManifestUpdated) {
      expected.set(destRel, { bytes: ownerBytes, mode: preserveExecMode ? mode : 0o644 });
    } else {
      const file = readRegularFile(repoRoot, rel, 'resource_roots');
      expected.set(destRel, {
        bytes: file.bytes,
        mode: preserveExecMode ? mode : file.mode,
      });
    }
  }

  for (const extraRaw of config.extra_files ?? []) {
    const extraRel = normalizeRelativeRef(extraRaw, 'extra_files');
    const destRel = joinRel(carrierRel, targetPrefix, extraRel);
    if (extraRel === manifestRel && ownerManifestUpdated) {
      expected.set(destRel, { bytes: ownerBytes, mode: 0o644 });
    } else {
      const gitMode = trackedEntries?.get(extraRel);
      if (gitMode === 0o120000) {
        throw shapeError(`Carrier extra_files entry must not be a symbolic link: ${extraRel}.`, { path: extraRel });
      }
      const file = readRegularFile(repoRoot, extraRel, 'extra_files');
      expected.set(destRel, {
        bytes: file.bytes,
        mode: preserveExecMode && gitMode ? gitMode : file.mode,
      });
    }
  }

  for (const alias of config.file_aliases ?? []) {
    const fromRel = normalizeRelativeRef(alias.from, 'file_aliases.from');
    const toRel = normalizeRelativeRef(alias.to, 'file_aliases.to');
    const fromAbs = resolveContainedFilePath(repoRoot, fromRel, 'file_aliases.from');
    if (alias.optional && !fs.existsSync(fromAbs)) continue;
    const file = fromRel === manifestRel && ownerManifestUpdated
      ? { bytes: ownerBytes, mode: 0o644 }
      : readRegularFile(repoRoot, fromRel, 'file_aliases.from');
    expected.set(joinRel(carrierRel, toRel), {
      bytes: file.bytes,
      mode: alias.executable === true ? 0o755 : (preserveExecMode ? 0o644 : file.mode),
    });
  }

  if (config.copy_presentation_icon) {
    const presentation = isRecord(owner.presentation) ? owner.presentation : {};
    if (typeof presentation.icon_ref === 'string' && presentation.icon_ref.trim()) {
      const iconRel = normalizeRelativeRef(presentation.icon_ref, 'presentation.icon_ref');
      const iconFile = readRegularFile(repoRoot, iconRel, 'presentation.icon_ref');
      expected.set(joinRel(carrierRel, iconRel), {
        bytes: iconFile.bytes,
        mode: preserveExecMode ? 0o644 : iconFile.mode,
      });
    }
  }

  if (config.adapter_projection) {
    const targetRel = normalizeRelativeRef(config.adapter_projection.target, 'adapter_projection.target');
    expected.set(joinRel(carrierRel, targetRel), {
      bytes: rewriteAdapter(repoRoot, config.adapter_projection),
      mode: 0o644,
    });
  }

  if (config.package_manifest_projection) {
    const pkgRule = config.package_manifest_projection;
    const pkgBytes = projectPackageManifest(owner, pkgRule, repoRoot);
    if (pkgBytes) {
      const pkgTarget = normalizeRelativeRef(pkgRule.target ?? 'opl-package.json', 'package_manifest_projection.target');
      expected.set(joinRel(carrierRel, pkgTarget), { bytes: pkgBytes, mode: 0o644 });
    }
    if (pkgRule.sync_root_opl_package) {
      const rootTarget = normalizeRelativeRef(
        pkgRule.sync_root_opl_package.target ?? 'opl-package.json',
        'sync_root_opl_package.target',
      );
      const rootSourceOwner = pkgRule.sync_root_opl_package.strip_keys?.length
        ? (() => {
            const copy = structuredClone(owner);
            for (const key of pkgRule.sync_root_opl_package!.strip_keys!) delete copy[key];
            return jsonBytes(copy);
          })()
        : ownerBytes;
      expected.set(rootTarget, { bytes: rootSourceOwner, mode: 0o644 });
    }
  }

  for (const manifestRule of config.plugin_manifests ?? []) {
    const rel = normalizeRelativeRef(manifestRule.path, 'plugin_manifests.path');
    expected.set(rel, {
      bytes: updatePluginManifest(repoRoot, manifestRule, owner),
      mode: 0o644,
    });
  }

  const preserveCarrierFiles = config.preserve_carrier_files ?? [];
  const defaultPruneRoots = normalizedRoots.map((r) => joinRel(targetPrefix, r));
  const pruneRootRels = (config.prune_roots ?? defaultPruneRoots)
    .map((p) => normalizeRelativeRef(p, 'prune_roots', true));

  const unexpectedFiles: string[] = [];
  for (const pruneSubRel of pruneRootRels) {
    const carrierSubRel = joinRel(carrierRel, pruneSubRel);
    const pruneAbs = resolveContainedFilePath(repoRoot, carrierSubRel, 'prune_roots');
    if (!fs.existsSync(pruneAbs)) continue;
    const stat = fs.lstatSync(pruneAbs);
    if (stat.isSymbolicLink()) {
      unexpectedFiles.push(carrierSubRel);
      continue;
    }
    if (stat.isFile()) {
      const insideCarrierRel = carrierSubRel.slice(`${carrierRel}/`.length);
      if (!expected.has(carrierSubRel) && !matchesPreserveRule(insideCarrierRel, preserveCarrierFiles)) {
        unexpectedFiles.push(carrierSubRel);
      }
      continue;
    }
    if (!stat.isDirectory()) continue;
    const scanPrune = (dirAbs: string) => {
      for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
        const entryAbs = path.join(dirAbs, entry.name);
        const relFromRepo = path.relative(repoRoot, entryAbs).replaceAll(path.sep, '/');
        if (entry.isSymbolicLink()) {
          unexpectedFiles.push(relFromRepo);
          continue;
        }
        if (entry.isDirectory()) {
          scanPrune(entryAbs);
          continue;
        }
        if (entry.isFile()) {
          const insideCarrierRel = relFromRepo.slice(`${carrierRel}/`.length);
          if (!expected.has(relFromRepo) && !matchesPreserveRule(insideCarrierRel, preserveCarrierFiles)) {
            unexpectedFiles.push(relFromRepo);
          }
        }
      }
    };
    scanPrune(pruneAbs);
  }
  unexpectedFiles.sort();

  const missingFiles: string[] = [];
  const driftedFiles: string[] = [];
  const writtenFiles: string[] = [];
  let unchangedCount = 0;

  for (const [targetRel, targetSpec] of [...expected.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const targetAbs = resolveContainedFilePath(repoRoot, targetRel, 'target');
    if (fs.existsSync(targetAbs)) {
      const lstat = fs.lstatSync(targetAbs);
      if (lstat.isSymbolicLink()) {
        throw shapeError(`Carrier projection target must not be a symbolic link: ${targetRel}.`, { path: targetRel });
      }
    }
    const exists = fs.existsSync(targetAbs) && fs.lstatSync(targetAbs).isFile();
    if (!exists) {
      missingFiles.push(targetRel);
      if (!checkOnly) {
        assertNoSymlinkSegments(repoRoot, path.dirname(targetAbs), 'target_parent');
        fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
        fs.writeFileSync(targetAbs, targetSpec.bytes);
        if (preserveExecMode) fs.chmodSync(targetAbs, targetSpec.mode);
        writtenFiles.push(targetRel);
      }
      continue;
    }
    const actualBytes = fs.readFileSync(targetAbs);
    const actualMode = fs.lstatSync(targetAbs).mode & 0o777;
    const bytesMatch = actualBytes.equals(targetSpec.bytes);
    const modeMatch = !preserveExecMode || actualMode === targetSpec.mode;
    if (bytesMatch && modeMatch) {
      unchangedCount += 1;
      continue;
    }
    driftedFiles.push(targetRel);
    if (!checkOnly) {
      assertNoSymlinkSegments(repoRoot, path.dirname(targetAbs), 'target_parent');
      fs.writeFileSync(targetAbs, targetSpec.bytes);
      if (preserveExecMode) fs.chmodSync(targetAbs, targetSpec.mode);
      writtenFiles.push(targetRel);
    }
  }

  const removedFiles: string[] = [];
  if (!checkOnly) {
    for (const staleRel of unexpectedFiles) {
      const staleAbs = resolveContainedFilePath(repoRoot, staleRel, 'stale_target');
      const st = fs.lstatSync(staleAbs);
      if (st.isSymbolicLink() || st.isFile()) {
        fs.unlinkSync(staleAbs);
        removedFiles.push(staleRel);
      }
    }
  }

  const hasDrift = missingFiles.length > 0
    || driftedFiles.length > 0
    || unexpectedFiles.length > 0
    || (checkOnly && versionMismatches.length > 0);

  const report = {
    surface_kind: 'opl_carrier_projection' as const,
    schema_version: 'opl_carrier_projection.v1' as const,
    mode: checkOnly ? 'check' as const : 'write' as const,
    status: checkOnly
      ? (hasDrift ? 'drifted' as const : 'passed' as const)
      : 'projected' as const,
    repo_root: repoRoot,
    carrier_root: carrierRel,
    projection_config_ref: configRel,
    projected_file_count: expected.size,
    unchanged_count: unchangedCount,
    written_files: writtenFiles,
    removed_files: removedFiles,
    missing_files: missingFiles,
    drifted_files: driftedFiles,
    unexpected_files: unexpectedFiles,
    version_mismatches: checkOnly ? versionMismatches : [],
    authority_boundary: {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
  };

  if (checkOnly && hasDrift) {
    throw shapeError(
      'Carrier projection is out of sync with owner sources; run opl pack project-carrier.',
      { pack_carrier_projection: report },
    );
  }

  return {
    version: 'g2' as const,
    pack_carrier_projection: report,
  };
}
