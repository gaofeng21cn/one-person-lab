import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { readJsonFileOrNull } from '../../../kernel/json-file.ts';
import { stringValue } from '../../../kernel/json-record.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { resolveCodexVersion } from './engine-helpers.ts';
import { resolveProjectRoot } from './shared.ts';

type SeedComponentState = 'current' | 'pending' | 'not_available';
type SeedComponentKind = 'image_seed' | 'managed_update' | 'migration';
type SeedComponentId =
  | 'image_manifest'
  | 'opl_framework'
  | 'codex_cli'
  | 'companion_skills'
  | 'domain_modules'
  | 'data_dir'
  | 'projects_dir';
type ImageSeedStrategy = 'payload_manifest' | 'payload_preheated' | 'metadata_only' | 'not_configured' | 'invalid';
type SeedMaterializationMode = 'copy_to_data_volume' | 'preheated_in_image';

type SeedComponentReceipt = {
  component_id: SeedComponentId;
  label: string;
  state: SeedComponentState;
  reason: string;
  component_kind: SeedComponentKind;
  source: string | null;
  source_ref: string | null;
  path: string | null;
  version: string | null;
  digest: string | null;
  receipt_kind: string | null;
  receipt_ref: string;
  payload_path: string | null;
  materialized_path: string | null;
  sha256: string | null;
  checksum_sha256: string | null;
  source_fingerprint: string | null;
  size_bytes: number | null;
};

type SeedOperationReceipt = {
  operation: SeedComponentKind;
  component_id: SeedComponentId;
  status: 'completed' | 'skipped' | 'pending';
  reason: string;
  receipt_ref: string;
  source_path: string | null;
  target_path: string | null;
  from_version: string | null;
  to_version: string | null;
  receipt_kind: string | null;
  sha256: string | null;
  checksum_sha256: string | null;
  source_fingerprint: string | null;
  size_bytes: number | null;
};

export type OplSeedInstallManifest = {
  surface_kind: 'opl_seed_install_manifest';
  schema_version: 'opl_seed_install_manifest.v1';
  applied_at: string;
  status: 'applied' | 'pending';
  image: {
    manifest_path: string | null;
    seed_dir: string | null;
    source_manifest_status: 'found' | 'missing' | 'not_configured' | 'invalid';
    manifest: Record<string, unknown> | null;
    version: string | null;
    digest: string | null;
    seed_strategy: ImageSeedStrategy;
    seed_strategy_status: 'accepted' | 'pending' | 'blocked';
    seed_strategy_reason: string;
  };
  seed_metadata: {
    schema: string | null;
    metadata_path: string | null;
    metadata_status: 'found' | 'missing' | 'not_configured' | 'invalid';
    manifest: Record<string, unknown> | null;
  };
  install: {
    state_dir: string;
    manifest_file: string;
    framework_install_dir: string;
    data_dir: string | null;
    projects_dir: string | null;
    created_directories: string[];
    existing_directories: string[];
  };
  components: SeedComponentReceipt[];
  receipts: SeedOperationReceipt[];
  reconcile: {
    status: 'applied' | 'pending';
    image_seed_receipts_count: number;
    managed_update_receipts_count: number;
    migration_receipts_count: number;
    previous_manifest_status: 'found' | 'missing' | 'invalid';
  };
  authority_boundary: {
    can_write_domain_truth: false;
    can_write_runtime_db: false;
    can_write_provider_queue: false;
    can_create_owner_receipt: false;
    can_claim_ready_or_current: false;
  };
  notes: string[];
};

export type OplSeedApplyOptions = {
  seedDir?: string | null;
  dataDir?: string | null;
  projectsDir?: string | null;
  imageManifestPath?: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function optionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function firstManifestString(manifest: Record<string, unknown> | null, keys: string[]) {
  if (!manifest) return null;
  for (const key of keys) {
    const value = stringValue(manifest[key]);
    if (value) return value;
  }
  return null;
}

function normalizeComponentId(value: unknown): SeedComponentId | null {
  const componentId = stringValue(value);
  switch (componentId) {
    case 'opl_framework':
    case 'framework_install_dir':
      return 'opl_framework';
    case 'codex_cli':
    case 'codex_toolchain':
      return 'codex_cli';
    case 'companion_skills':
      return 'companion_skills';
    case 'domain_modules':
    case 'modules_skills':
      return 'domain_modules';
    case 'image_manifest':
    case 'data_dir':
    case 'projects_dir':
      return componentId;
    default:
      return null;
  }
}

function normalizeSeedStrategy(value: unknown, metadataOnlyAllowed: boolean): {
  strategy: ImageSeedStrategy;
  status: 'accepted' | 'pending' | 'blocked';
  reason: string;
} {
  const strategy = stringValue(value);
  if (strategy === 'payload_manifest' || strategy === 'payload_preheated') {
    return { strategy, status: 'accepted', reason: `${strategy}_accepted` };
  }
  if (strategy === 'metadata_only') {
    return metadataOnlyAllowed
      ? { strategy, status: 'accepted', reason: 'metadata_only_allowed_for_slim' }
      : { strategy, status: 'blocked', reason: 'metadata_only_forbidden_for_stable_latest_full_seed' };
  }
  if (!strategy) {
    return { strategy: 'not_configured', status: 'pending', reason: 'seed_strategy_not_configured' };
  }
  return { strategy: 'invalid', status: 'blocked', reason: 'unknown_seed_strategy' };
}

function readJsonRecord(file: string | null) {
  if (!file || !fs.existsSync(file)) return null;
  const parsed = readJsonFileOrNull(file);
  return isRecord(parsed) ? parsed : null;
}

function readImageManifest(manifestPath: string | null) {
  if (!manifestPath) {
    return {
      status: 'not_configured' as const,
      manifest: null,
    };
  }
  if (!fs.existsSync(manifestPath)) {
    return {
      status: 'missing' as const,
      manifest: null,
    };
  }
  const parsed = readJsonFileOrNull(manifestPath);
  return {
    status: isRecord(parsed) ? 'found' as const : 'invalid' as const,
    manifest: isRecord(parsed) ? parsed : null,
  };
}

function ensureDirectory(directory: string | null, created: string[], existing: string[]) {
  if (!directory) return;
  if (fs.existsSync(directory)) {
    existing.push(directory);
    return;
  }
  fs.mkdirSync(directory, { recursive: true });
  created.push(directory);
}

function digestFile(file: string | null) {
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return null;
  }
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function digestDirectory(root: string | null) {
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return null;
  }
  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        stack.push(path.join(current, entry));
      }
      continue;
    }
    if (stat.isFile()) files.push(current);
  }
  const hash = crypto.createHash('sha256');
  for (const file of files.sort()) {
    hash.update(path.relative(root, file));
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function digestPayload(payloadPath: string | null) {
  return digestFile(payloadPath) ?? digestDirectory(payloadPath);
}

function sizeBytes(file: string | null) {
  if (!file || !fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  return stat.isFile() ? stat.size : null;
}

function directorySizeBytes(root: string | null) {
  if (!root || !fs.existsSync(root)) return null;
  let total = 0;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        stack.push(path.join(current, entry));
      }
      continue;
    }
    if (stat.isFile()) total += stat.size;
  }
  return total;
}

function copyDirectoryContents(source: string, target: string) {
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) return false;
  fs.cpSync(source, target, { recursive: true, force: false, errorOnExist: false });
  return true;
}

function isOplFrameworkRoot(root: string) {
  return fs.existsSync(path.join(root, 'package.json'))
    && (
      fs.existsSync(path.join(root, 'src', 'entrypoints', 'cli.ts'))
      || fs.existsSync(path.join(root, 'src', 'cli.ts'))
      || fs.existsSync(path.join(root, 'dist', 'entrypoints', 'cli.js'))
    )
    && fs.existsSync(path.join(root, 'bin', 'opl'));
}

function receiptRef(operation: SeedComponentKind, componentId: SeedComponentId, version: string | null, digest: string | null) {
  return `opl://system-seed/${operation}/${componentId}/${encodeURIComponent(version ?? digest ?? 'local')}`;
}

function buildComponent(input: Omit<SeedComponentReceipt, 'receipt_ref'>): SeedComponentReceipt {
  return {
    ...input,
    receipt_ref: receiptRef(input.component_kind, input.component_id, input.version, input.digest),
  };
}

function pathExists(directory: string | null) {
  return Boolean(directory && fs.existsSync(directory));
}

function resolveDataDir(explicit?: string | null) {
  const explicitDataDir = explicit?.trim() || optionalEnv('OPL_DATA_DIR');
  if (explicitDataDir) return path.resolve(explicitDataDir);
  const aionDataDir = optionalEnv('AIONUI_DATA_DIR');
  if (aionDataDir) return path.resolve(aionDataDir);
  return null;
}

function resolveProjectsDir(dataDir: string | null, explicit?: string | null) {
  const explicitProjectsDir = explicit?.trim() || optionalEnv('OPL_PROJECTS_DIR');
  if (explicitProjectsDir) return path.resolve(explicitProjectsDir);
  return dataDir ? path.join(dataDir, 'projects') : null;
}

function defaultStatus(components: SeedComponentReceipt[]) {
  return components.some((component) => component.state === 'pending') ? 'pending' : 'applied';
}

function readCodexToolchainVersion() {
  try {
    const codex = resolveCodexVersion();
    return {
      installed: codex.installed,
      version: codex.version,
      binary_path: codex.binary_path,
    };
  } catch {
    return {
      installed: false,
      version: null,
      binary_path: null,
    };
  }
}

export function readOplSeedInstallManifest() {
  const file = resolveOplStatePaths().install_manifest_file;
  if (!fs.existsSync(file)) {
    return null;
  }
  const parsed = readJsonFileOrNull(file);
  return isRecord(parsed) ? parsed : null;
}

function readPreviousManifestStatus(dataDir: string | null) {
  const file = resolveOplStatePaths({ dataDir }).install_manifest_file;
  if (!fs.existsSync(file)) return 'missing' as const;
  return readJsonRecord(file) ? 'found' as const : 'invalid' as const;
}

function resolveImageManifestPath(seedDir: string | null, explicit?: string | null) {
  const configured = explicit?.trim() || optionalEnv('OPL_IMAGE_MANIFEST_PATH');
  if (configured) return path.resolve(configured);
  const canonical = '/opt/opl/image-manifest.json';
  if (fs.existsSync(canonical)) return canonical;
  if (!seedDir) return null;
  for (const basename of ['image-manifest.json', 'opl-image-manifest.json', 'manifest.json']) {
    const candidate = path.join(seedDir, basename);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveSeedMetadataPath(seedDir: string | null) {
  const explicit = optionalEnv('OPL_IMAGE_SEED_METADATA_PATH');
  if (explicit) return path.resolve(explicit);
  const canonical = '/opt/opl/seed/metadata.json';
  if (fs.existsSync(canonical)) return canonical;
  if (!seedDir) return null;
  const candidates = [
    path.join(seedDir, 'metadata.json'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? path.join(seedDir, 'metadata.json');
}

function readSeedMetadata(metadataPath: string | null) {
  if (!metadataPath) {
    return { status: 'not_configured' as const, manifest: null };
  }
  if (!fs.existsSync(metadataPath)) {
    return { status: 'missing' as const, manifest: null };
  }
  const manifest = readJsonRecord(metadataPath);
  return {
    status: manifest ? 'found' as const : 'invalid' as const,
    manifest,
  };
}

function readSeedComponentContract(metadataManifest: Record<string, unknown> | null) {
  const manifest = metadataManifest;
  if (!manifest || !Array.isArray(manifest.components)) return new Map<SeedComponentId, Record<string, unknown>>();
  const components = new Map<SeedComponentId, Record<string, unknown>>();
  for (const entry of manifest.components) {
    if (!isRecord(entry)) continue;
    const componentId = normalizeComponentId(entry.id ?? entry.component_id);
    if (componentId && componentId !== 'image_manifest' && componentId !== 'data_dir' && componentId !== 'projects_dir') {
      components.set(componentId, entry);
    }
  }
  return components;
}

function resolvePayloadPath(seedDir: string | null, component: Record<string, unknown> | null) {
  const payload = stringValue(component?.payload_path);
  if (!payload) return null;
  return path.isAbsolute(payload) ? payload : path.resolve(seedDir ?? '.', payload);
}

function resolveSeedMaterializationMode(metadataManifest: Record<string, unknown> | null): SeedMaterializationMode {
  return stringValue(metadataManifest?.strategy) === 'payload_preheated'
    ? 'preheated_in_image'
    : 'copy_to_data_volume';
}

function materializeSeedPayload(
  componentId: SeedComponentId,
  sourcePath: string | null,
  dataDir: string | null,
  projectsDir: string | null,
  mode: SeedMaterializationMode,
) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;
  if (mode === 'preheated_in_image') {
    return sourcePath;
  }
  const targetRoot = componentId === 'opl_framework'
    ? dataDir && path.join(dataDir, 'opl', 'framework')
    : componentId === 'codex_cli'
      ? dataDir && path.join(dataDir, 'opl', 'toolchains', 'codex')
      : componentId === 'companion_skills'
        ? dataDir && path.join(dataDir, 'opl', 'skills')
        : componentId === 'domain_modules'
          ? dataDir && path.join(dataDir, 'opl', 'modules')
        : componentId === 'projects_dir'
          ? projectsDir
          : null;
  if (!targetRoot) return null;
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    if (componentId === 'opl_framework' && fs.existsSync(targetRoot) && isOplFrameworkRoot(targetRoot)) {
      return targetRoot;
    }
    copyDirectoryContents(sourcePath, targetRoot);
    return targetRoot;
  }
  fs.mkdirSync(targetRoot, { recursive: true });
  const targetFile = path.join(targetRoot, path.basename(sourcePath));
  if (!fs.existsSync(targetFile)) {
    fs.copyFileSync(sourcePath, targetFile);
  }
  return targetFile;
}

function buildOperationReceipt(input: {
  operation: SeedComponentKind;
  component: SeedComponentReceipt;
  status: SeedOperationReceipt['status'];
  reason: string;
  previousVersion: string | null;
}) {
  return {
    operation: input.operation,
    component_id: input.component.component_id,
    status: input.status,
    reason: input.reason,
    receipt_ref: input.component.receipt_ref,
    source_path: input.component.payload_path,
    target_path: input.component.materialized_path,
    from_version: input.previousVersion,
    to_version: input.component.version,
    receipt_kind: input.component.receipt_kind,
    sha256: input.component.sha256,
    checksum_sha256: input.component.checksum_sha256,
    source_fingerprint: input.component.source_fingerprint,
    size_bytes: input.component.size_bytes,
  };
}

function previousComponentVersion(previousManifest: Record<string, unknown> | null, componentId: string) {
  const components = Array.isArray(previousManifest?.components) ? previousManifest.components : [];
  const component = components.find((entry) => isRecord(entry) && entry.component_id === componentId);
  return isRecord(component) ? stringValue(component.version) : null;
}

export async function applyOplSeedManifest(): Promise<{
  version: 'g2';
  seed_apply: OplSeedInstallManifest;
}>;
export async function applyOplSeedManifest(options: OplSeedApplyOptions): Promise<{
  version: 'g2';
  seed_apply: OplSeedInstallManifest;
}>;
export async function applyOplSeedManifest(options: OplSeedApplyOptions = {}): Promise<{
  version: 'g2';
  seed_apply: OplSeedInstallManifest;
}> {
  const seedDir = options.seedDir?.trim()
    ? path.resolve(options.seedDir)
    : optionalEnv('OPL_IMAGE_SEED_DIR');
  const manifestPath = resolveImageManifestPath(seedDir, options.imageManifestPath);
  const dataDir = resolveDataDir(options.dataDir);
  const projectsDir = resolveProjectsDir(dataDir, options.projectsDir);
  const statePaths = ensureOplStateDir(resolveOplStatePaths({ dataDir }));
  const createdDirectories: string[] = [];
  const existingDirectories: string[] = [];
  const previousManifestStatus = readPreviousManifestStatus(dataDir);
  const previousManifest = readJsonRecord(statePaths.install_manifest_file);
  const seedMetadataPath = resolveSeedMetadataPath(seedDir);
  const seedMetadata = readSeedMetadata(seedMetadataPath);
  const seedContract = readSeedComponentContract(seedMetadata.manifest);

  ensureDirectory(statePaths.state_dir, createdDirectories, existingDirectories);
  ensureDirectory(dataDir, createdDirectories, existingDirectories);
  ensureDirectory(projectsDir, createdDirectories, existingDirectories);

  const imageManifest = readImageManifest(manifestPath);
  const manifestVersion = firstManifestString(imageManifest.manifest, [
    'image_version',
    'version',
    'tag',
    'created',
  ]);
  const manifestDigest = firstManifestString(imageManifest.manifest, [
    'image_digest',
    'digest',
    'sha256',
    'revision',
  ]);
  const seedStrategy = normalizeSeedStrategy(
    firstManifestString(imageManifest.manifest, ['seed_strategy']),
    stringValue(imageManifest.manifest?.image_profile) === 'slim'
      || stringValue(imageManifest.manifest?.profile) === 'slim',
  );
  const codexToolchain = readCodexToolchainVersion();
  const modulesRoot = optionalEnv('OPL_MODULES_ROOT');
  const skillsRoot = optionalEnv('OPL_PACKAGED_SKILLS_ROOT');
  const frameworkInstallDir = resolveProjectRoot();
  const frameworkSeed = seedContract.get('opl_framework') ?? null;
  const codexSeed = seedContract.get('codex_cli') ?? null;
  const skillsSeed = seedContract.get('companion_skills') ?? null;
  const modulesSeed = seedContract.get('domain_modules') ?? null;
  const frameworkPayload = resolvePayloadPath(seedDir, frameworkSeed);
  const codexPayload = resolvePayloadPath(seedDir, codexSeed);
  const skillsPayload = resolvePayloadPath(seedDir, skillsSeed);
  const modulesPayload = resolvePayloadPath(seedDir, modulesSeed);
  const materializationMode = resolveSeedMaterializationMode(seedMetadata.manifest);
  const materializedReason = materializationMode === 'preheated_in_image'
    ? 'image_seed_payload_preheated'
    : 'image_seed_payload_materialized';
  const frameworkMaterialized = materializeSeedPayload('opl_framework', frameworkPayload, dataDir, projectsDir, materializationMode);
  const codexMaterialized = materializeSeedPayload('codex_cli', codexPayload, dataDir, projectsDir, materializationMode);
  const skillsMaterialized = materializeSeedPayload('companion_skills', skillsPayload, dataDir, projectsDir, materializationMode);
  const modulesMaterialized = materializeSeedPayload('domain_modules', modulesPayload, dataDir, projectsDir, materializationMode);
  const components = [
    buildComponent({
      component_id: 'image_manifest',
      label: 'Image manifest',
      state: imageManifest.status === 'found' ? 'current' : manifestPath ? 'pending' : 'not_available',
      reason: imageManifest.status,
      component_kind: 'image_seed',
      source: 'image_manifest',
      source_ref: manifestPath,
      path: manifestPath,
      version: manifestVersion,
      digest: manifestDigest,
      receipt_kind: 'image_manifest',
      payload_path: manifestPath,
      materialized_path: manifestPath,
      sha256: digestFile(manifestPath),
      checksum_sha256: digestFile(manifestPath),
      source_fingerprint: manifestDigest,
      size_bytes: sizeBytes(manifestPath),
    }),
    buildComponent({
      component_id: 'opl_framework',
      label: 'OPL Framework install dir',
      state: pathExists(frameworkMaterialized ?? frameworkInstallDir) ? 'current' : 'pending',
      reason: frameworkMaterialized
        ? materializedReason
        : pathExists(frameworkInstallDir)
          ? 'framework_dir_found'
          : 'framework_dir_missing',
      component_kind: frameworkMaterialized ? 'image_seed' : 'managed_update',
      source: stringValue(frameworkSeed?.source) ?? 'process_entrypoint',
      source_ref: stringValue(frameworkSeed?.source) ?? 'process_entrypoint',
      path: frameworkMaterialized ?? frameworkInstallDir,
      version: stringValue(frameworkSeed?.version),
      digest: stringValue(frameworkSeed?.sha256)
        ?? stringValue(frameworkSeed?.checksum_sha256)
        ?? stringValue(frameworkSeed?.source_fingerprint)
        ?? digestPayload(frameworkPayload),
      receipt_kind: stringValue(frameworkSeed?.receipt_kind),
      payload_path: frameworkPayload,
      materialized_path: frameworkMaterialized,
      sha256: stringValue(frameworkSeed?.sha256) ?? stringValue(frameworkSeed?.checksum_sha256) ?? digestPayload(frameworkPayload),
      checksum_sha256: stringValue(frameworkSeed?.sha256) ?? stringValue(frameworkSeed?.checksum_sha256) ?? digestPayload(frameworkPayload),
      source_fingerprint: stringValue(frameworkSeed?.source_fingerprint),
      size_bytes: optionalNumber(frameworkSeed?.size_bytes) ?? directorySizeBytes(frameworkPayload) ?? sizeBytes(frameworkPayload),
    }),
    buildComponent({
      component_id: 'codex_cli',
      label: 'Codex/toolchain',
      state: codexMaterialized || codexToolchain.installed ? 'current' : 'not_available',
      reason: codexMaterialized
        ? materializedReason
        : codexToolchain.installed
          ? 'codex_cli_detected'
          : 'codex_cli_not_detected',
      component_kind: codexMaterialized ? 'image_seed' : 'managed_update',
      source: stringValue(codexSeed?.source) ?? codexToolchain.binary_path,
      source_ref: stringValue(codexSeed?.source) ?? codexToolchain.binary_path,
      path: codexMaterialized ?? codexToolchain.binary_path,
      version: stringValue(codexSeed?.version) ?? codexToolchain.version,
      digest: stringValue(codexSeed?.sha256)
        ?? stringValue(codexSeed?.checksum_sha256)
        ?? stringValue(codexSeed?.source_fingerprint)
        ?? digestPayload(codexPayload),
      receipt_kind: stringValue(codexSeed?.receipt_kind),
      payload_path: codexPayload,
      materialized_path: codexMaterialized,
      sha256: stringValue(codexSeed?.sha256) ?? stringValue(codexSeed?.checksum_sha256) ?? digestPayload(codexPayload),
      checksum_sha256: stringValue(codexSeed?.sha256) ?? stringValue(codexSeed?.checksum_sha256) ?? digestPayload(codexPayload),
      source_fingerprint: stringValue(codexSeed?.source_fingerprint),
      size_bytes: optionalNumber(codexSeed?.size_bytes) ?? directorySizeBytes(codexPayload) ?? sizeBytes(codexPayload),
    }),
    buildComponent({
      component_id: 'companion_skills',
      label: 'Companion skills',
      state: pathExists(skillsMaterialized) || pathExists(skillsRoot) ? 'current' : 'not_available',
      reason: skillsMaterialized
        ? materializedReason
        : pathExists(skillsRoot)
          ? 'packaged_skills_root_found'
          : 'no_companion_skills_seed_detected',
      component_kind: skillsMaterialized ? 'image_seed' : 'managed_update',
      source: stringValue(skillsSeed?.source) ?? skillsRoot,
      source_ref: stringValue(skillsSeed?.source) ?? skillsRoot,
      path: skillsMaterialized ?? skillsRoot,
      version: stringValue(skillsSeed?.version),
      digest: stringValue(skillsSeed?.sha256)
        ?? stringValue(skillsSeed?.checksum_sha256)
        ?? stringValue(skillsSeed?.source_fingerprint)
        ?? digestPayload(skillsPayload),
      receipt_kind: stringValue(skillsSeed?.receipt_kind),
      payload_path: skillsPayload,
      materialized_path: skillsMaterialized,
      sha256: stringValue(skillsSeed?.sha256) ?? stringValue(skillsSeed?.checksum_sha256) ?? digestPayload(skillsPayload),
      checksum_sha256: stringValue(skillsSeed?.sha256) ?? stringValue(skillsSeed?.checksum_sha256) ?? digestPayload(skillsPayload),
      source_fingerprint: stringValue(skillsSeed?.source_fingerprint),
      size_bytes: optionalNumber(skillsSeed?.size_bytes) ?? directorySizeBytes(skillsPayload) ?? sizeBytes(skillsPayload),
    }),
    buildComponent({
      component_id: 'domain_modules',
      label: 'Domain modules',
      state: pathExists(modulesMaterialized) || pathExists(modulesRoot) ? 'current' : 'not_available',
      reason: modulesMaterialized
        ? materializedReason
        : pathExists(modulesRoot)
          ? 'modules_root_found'
          : 'no_domain_modules_seed_detected',
      component_kind: modulesMaterialized ? 'image_seed' : 'managed_update',
      source: stringValue(modulesSeed?.source) ?? seedDir ?? modulesRoot ?? skillsRoot,
      source_ref: stringValue(modulesSeed?.source) ?? seedDir ?? modulesRoot ?? skillsRoot,
      path: modulesMaterialized ?? modulesRoot,
      version: stringValue(modulesSeed?.version),
      digest: stringValue(modulesSeed?.sha256)
        ?? stringValue(modulesSeed?.checksum_sha256)
        ?? stringValue(modulesSeed?.source_fingerprint)
        ?? digestPayload(modulesPayload),
      receipt_kind: stringValue(modulesSeed?.receipt_kind),
      payload_path: modulesPayload,
      materialized_path: modulesMaterialized,
      sha256: stringValue(modulesSeed?.sha256) ?? stringValue(modulesSeed?.checksum_sha256) ?? digestPayload(modulesPayload),
      checksum_sha256: stringValue(modulesSeed?.sha256) ?? stringValue(modulesSeed?.checksum_sha256) ?? digestPayload(modulesPayload),
      source_fingerprint: stringValue(modulesSeed?.source_fingerprint),
      size_bytes: optionalNumber(modulesSeed?.size_bytes) ?? directorySizeBytes(modulesPayload) ?? sizeBytes(modulesPayload),
    }),
    buildComponent({
      component_id: 'data_dir',
      label: 'OPL data dir',
      state: pathExists(dataDir) ? 'current' : 'not_available',
      reason: dataDir ? 'data_dir_available' : 'data_dir_not_configured',
      component_kind: previousManifestStatus === 'missing' ? 'image_seed' : 'migration',
      source: dataDir ? 'docker_webui_data_volume' : null,
      source_ref: dataDir ? 'OPL_DATA_DIR|AIONUI_DATA_DIR' : null,
      path: dataDir,
      version: null,
      digest: null,
      receipt_kind: 'data_volume_reconcile',
      payload_path: null,
      materialized_path: dataDir,
      sha256: null,
      checksum_sha256: null,
      source_fingerprint: null,
      size_bytes: null,
    }),
    buildComponent({
      component_id: 'projects_dir',
      label: 'OPL projects dir',
      state: pathExists(projectsDir) ? 'current' : 'not_available',
      reason: projectsDir ? 'projects_dir_available' : 'projects_dir_not_configured',
      component_kind: previousManifestStatus === 'missing' ? 'image_seed' : 'migration',
      source: projectsDir ? 'docker_webui_projects_volume' : null,
      source_ref: projectsDir ? 'OPL_PROJECTS_DIR|OPL_DATA_DIR/projects' : null,
      path: projectsDir,
      version: null,
      digest: null,
      receipt_kind: 'projects_volume_reconcile',
      payload_path: null,
      materialized_path: projectsDir,
      sha256: null,
      checksum_sha256: null,
      source_fingerprint: null,
      size_bytes: null,
    }),
  ];
  const receipts = components.map((component) => {
    const previousVersion = previousManifest && isRecord(previousManifest)
      ? previousComponentVersion(previousManifest, component.component_id)
      : null;
    const operation = component.component_kind;
    return buildOperationReceipt({
      operation,
      component,
      status: component.state === 'current' ? 'completed' : component.state === 'pending' ? 'pending' : 'skipped',
      reason: component.reason,
      previousVersion,
    });
  });
  const reconcileStatus = seedStrategy.status === 'blocked' ? 'pending' : defaultStatus(components);

  const payload: OplSeedInstallManifest = {
    surface_kind: 'opl_seed_install_manifest',
    schema_version: 'opl_seed_install_manifest.v1',
    applied_at: nowIso(),
    status: reconcileStatus,
    image: {
      manifest_path: manifestPath,
      seed_dir: seedDir,
      source_manifest_status: imageManifest.status,
      manifest: imageManifest.manifest,
      version: manifestVersion,
      digest: manifestDigest,
      seed_strategy: seedStrategy.strategy,
      seed_strategy_status: seedStrategy.status,
      seed_strategy_reason: seedStrategy.reason,
    },
    seed_metadata: {
      schema: firstManifestString(seedMetadata.manifest, ['schema', 'schema_version']),
      metadata_path: seedMetadataPath,
      metadata_status: seedMetadata.status,
      manifest: seedMetadata.manifest,
    },
    install: {
      state_dir: statePaths.state_dir,
      manifest_file: statePaths.install_manifest_file,
      framework_install_dir: frameworkInstallDir,
      data_dir: dataDir,
      projects_dir: projectsDir,
      created_directories: createdDirectories,
      existing_directories: existingDirectories,
    },
    components,
    receipts,
    reconcile: {
      status: reconcileStatus,
      image_seed_receipts_count: receipts.filter((receipt) => receipt.operation === 'image_seed').length,
      managed_update_receipts_count: receipts.filter((receipt) => receipt.operation === 'managed_update').length,
      migration_receipts_count: receipts.filter((receipt) => receipt.operation === 'migration').length,
      previous_manifest_status: previousManifestStatus,
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_write_runtime_db: false,
      can_write_provider_queue: false,
      can_create_owner_receipt: false,
      can_claim_ready_or_current: false,
    },
    notes: [
      'Seed apply records the image/install/data boundary for Docker/WebUI first run.',
      'Seed component receipts carry component id, version, source, receipt ref, payload path, checksum, and size when the image seed manifest provides them.',
      'Startup maintenance reuses this manifest to reconcile image seed, managed update, and migration observations for the Docker/WebUI data volume.',
      'Component current means the local path or manifest was observed during this command; it is not a release, domain, provider, or runtime readiness claim.',
      'Domain truth, runtime queues, owner receipts, typed blockers, and human gates remain owned by their existing authority surfaces.',
    ],
  };

  fs.writeFileSync(statePaths.install_manifest_file, `${JSON.stringify(payload, null, 2)}\n`);
  return {
    version: 'g2',
    seed_apply: payload,
  };
}
