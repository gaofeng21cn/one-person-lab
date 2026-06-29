import fs from 'node:fs';
import path from 'node:path';

import { ensureOplStateDir, resolveOplStatePaths } from '../runtime-state-paths.ts';
import { resolveCodexVersion } from './engine-helpers.ts';
import { resolveProjectRoot } from './shared.ts';

type SeedComponentState = 'current' | 'pending' | 'not_available';

type SeedComponentReceipt = {
  component_id:
    | 'image_manifest'
    | 'framework_install_dir'
    | 'codex_toolchain'
    | 'modules_skills'
    | 'data_dir'
    | 'projects_dir';
  label: string;
  state: SeedComponentState;
  reason: string;
  source_ref: string | null;
  path: string | null;
  version: string | null;
  digest: string | null;
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
  authority_boundary: {
    can_write_domain_truth: false;
    can_write_runtime_db: false;
    can_write_provider_queue: false;
    can_create_owner_receipt: false;
    can_claim_ready_or_current: false;
  };
  notes: string[];
};

function nowIso() {
  return new Date().toISOString();
}

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function firstManifestString(manifest: Record<string, unknown> | null, keys: string[]) {
  if (!manifest) return null;
  for (const key of keys) {
    const value = optionalString(manifest[key]);
    if (value) return value;
  }
  return null;
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
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
    return {
      status: isRecord(parsed) ? 'found' as const : 'invalid' as const,
      manifest: isRecord(parsed) ? parsed : null,
    };
  } catch {
    return {
      status: 'invalid' as const,
      manifest: null,
    };
  }
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

function buildComponent(input: SeedComponentReceipt): SeedComponentReceipt {
  return input;
}

function pathExists(directory: string | null) {
  return Boolean(directory && fs.existsSync(directory));
}

function resolveDataDir() {
  const explicitDataDir = optionalEnv('OPL_DATA_DIR');
  if (explicitDataDir) return path.resolve(explicitDataDir);
  const aionDataDir = optionalEnv('AIONUI_DATA_DIR');
  if (aionDataDir) return path.resolve(aionDataDir);
  return null;
}

function resolveProjectsDir(dataDir: string | null) {
  const explicitProjectsDir = optionalEnv('OPL_PROJECTS_DIR');
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
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function applyOplSeedManifest(): Promise<{
  version: 'g2';
  seed_apply: OplSeedInstallManifest;
}> {
  const statePaths = ensureOplStateDir();
  const manifestPath = optionalEnv('OPL_IMAGE_MANIFEST_PATH');
  const seedDir = optionalEnv('OPL_IMAGE_SEED_DIR');
  const dataDir = resolveDataDir();
  const projectsDir = resolveProjectsDir(dataDir);
  const createdDirectories: string[] = [];
  const existingDirectories: string[] = [];

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
  const codexToolchain = readCodexToolchainVersion();
  const modulesRoot = optionalEnv('OPL_MODULES_ROOT');
  const skillsRoot = optionalEnv('OPL_PACKAGED_SKILLS_ROOT');
  const frameworkInstallDir = resolveProjectRoot();
  const components = [
    buildComponent({
      component_id: 'image_manifest',
      label: 'Image manifest',
      state: imageManifest.status === 'found' ? 'current' : manifestPath ? 'pending' : 'not_available',
      reason: imageManifest.status,
      source_ref: manifestPath,
      path: manifestPath,
      version: manifestVersion,
      digest: manifestDigest,
    }),
    buildComponent({
      component_id: 'framework_install_dir',
      label: 'OPL Framework install dir',
      state: pathExists(frameworkInstallDir) ? 'current' : 'pending',
      reason: pathExists(frameworkInstallDir) ? 'framework_dir_found' : 'framework_dir_missing',
      source_ref: 'process_entrypoint',
      path: frameworkInstallDir,
      version: null,
      digest: null,
    }),
    buildComponent({
      component_id: 'codex_toolchain',
      label: 'Codex/toolchain',
      state: codexToolchain.installed ? 'current' : 'not_available',
      reason: codexToolchain.installed ? 'codex_cli_detected' : 'codex_cli_not_detected',
      source_ref: codexToolchain.binary_path,
      path: codexToolchain.binary_path,
      version: codexToolchain.version,
      digest: null,
    }),
    buildComponent({
      component_id: 'modules_skills',
      label: 'Modules and skills',
      state: pathExists(seedDir) || pathExists(modulesRoot) || pathExists(skillsRoot) ? 'current' : 'not_available',
      reason: pathExists(seedDir)
        ? 'seed_dir_found'
        : pathExists(modulesRoot)
          ? 'modules_root_found'
          : pathExists(skillsRoot)
            ? 'packaged_skills_root_found'
            : 'no_seed_modules_or_skills_detected',
      source_ref: seedDir ?? modulesRoot ?? skillsRoot,
      path: seedDir ?? modulesRoot ?? skillsRoot,
      version: null,
      digest: null,
    }),
    buildComponent({
      component_id: 'data_dir',
      label: 'OPL data dir',
      state: pathExists(dataDir) ? 'current' : 'not_available',
      reason: dataDir ? 'data_dir_available' : 'data_dir_not_configured',
      source_ref: dataDir ? 'OPL_DATA_DIR|AIONUI_DATA_DIR' : null,
      path: dataDir,
      version: null,
      digest: null,
    }),
    buildComponent({
      component_id: 'projects_dir',
      label: 'OPL projects dir',
      state: pathExists(projectsDir) ? 'current' : 'not_available',
      reason: projectsDir ? 'projects_dir_available' : 'projects_dir_not_configured',
      source_ref: projectsDir ? 'OPL_PROJECTS_DIR|OPL_DATA_DIR/projects' : null,
      path: projectsDir,
      version: null,
      digest: null,
    }),
  ];

  const payload: OplSeedInstallManifest = {
    surface_kind: 'opl_seed_install_manifest',
    schema_version: 'opl_seed_install_manifest.v1',
    applied_at: nowIso(),
    status: defaultStatus(components),
    image: {
      manifest_path: manifestPath,
      seed_dir: seedDir,
      source_manifest_status: imageManifest.status,
      manifest: imageManifest.manifest,
      version: manifestVersion,
      digest: manifestDigest,
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
    authority_boundary: {
      can_write_domain_truth: false,
      can_write_runtime_db: false,
      can_write_provider_queue: false,
      can_create_owner_receipt: false,
      can_claim_ready_or_current: false,
    },
    notes: [
      'Seed apply records the image/install/data boundary for Docker/WebUI first run.',
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
