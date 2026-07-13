import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { readJsonFileOrNull } from '../../../kernel/json-file.ts';
import { resolveCodexBinary } from '../../runway/index.ts';

import {
  type OplEngineAction,
  type OplEngineId,
  type OplShellActionSpec,
  getShellBinary,
  normalizeOutput,
  normalizeOptionalString,
  runCommand,
  runShellCommand,
} from './shared.ts';

const DEFAULT_MINIMUM_CODEX_CLI_VERSION = '0.125.0';
const DEFAULT_CODEX_LATEST_TIMEOUT_MS = 5000;
const CODEX_RUNTIME_UPDATER_VERSION = 'opl-runtime-substrate-updater.v1';
const HEADLESS_PROCESS_INSTANCE_ID = `headless-cli:${process.pid}:${Date.now()}`;

function currentProcessInstanceId() {
  return normalizeOptionalString(process.env.OPL_APP_PROCESS_INSTANCE_ID) ?? HEADLESS_PROCESS_INSTANCE_ID;
}
const CODEX_PLATFORM_TARGETS = {
  'darwin:arm64': {
    packageName: '@openai/codex-darwin-arm64',
    targetTriple: 'aarch64-apple-darwin',
  },
  'darwin:x64': {
    packageName: '@openai/codex-darwin-x64',
    targetTriple: 'x86_64-apple-darwin',
  },
  'linux:arm64': {
    packageName: '@openai/codex-linux-arm64',
    targetTriple: 'aarch64-unknown-linux-musl',
  },
  'linux:x64': {
    packageName: '@openai/codex-linux-x64',
    targetTriple: 'x86_64-unknown-linux-musl',
  },
  'win32:arm64': {
    packageName: '@openai/codex-win32-arm64',
    targetTriple: 'aarch64-pc-windows-msvc',
  },
  'win32:x64': {
    packageName: '@openai/codex-win32-x64',
    targetTriple: 'x86_64-pc-windows-msvc',
  },
} as const;

type ParsedCliVersion = {
  version: string;
  parts: [number, number, number];
};

type CodexCandidateSnapshot = {
  path: string;
  real_path: string | null;
  selected: boolean;
  version: string | null;
  parsed_version: string | null;
  version_status: 'compatible' | 'outdated' | 'unknown';
  aliases?: string[];
};

type LatestCodexCliVersionSnapshot = {
  latest_version: string | null;
  latest_version_status: 'current' | 'outdated' | 'unknown' | 'missing';
};

type RuntimeToolchainPaths = {
  runtime_root: string;
  current_root: string;
  current_bin_dir: string;
  current_codex_path: string;
  staging_root: string;
  generations_root: string;
  pending_metadata_path: string;
  previous_root: string;
};

type InstalledCodexPayload = {
  codex: string | null;
  rg: string | null;
  package_bin_entry: string | null;
  platform_package_root: string | null;
  missing_platform_package_spec: string | null;
};

type CodexPlatformTarget = (typeof CODEX_PLATFORM_TARGETS)[keyof typeof CODEX_PLATFORM_TARGETS];

function resolveMinimumCodexCliVersion() {
  return normalizeOptionalString(process.env.OPL_MIN_CODEX_CLI_VERSION)
    ?? DEFAULT_MINIMUM_CODEX_CLI_VERSION;
}

function resolveCodexLatestTimeoutMs() {
  const parsed = Number(process.env.OPL_CODEX_LATEST_TIMEOUT_MS ?? '');
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_CODEX_LATEST_TIMEOUT_MS;
}

function resolveHomeDir() {
  return normalizeOptionalString(process.env.HOME) ?? os.homedir();
}

function resolveCodexPlatformTarget(): CodexPlatformTarget {
  const platform = normalizeOptionalString(process.env.OPL_CODEX_PLATFORM_OVERRIDE) ?? process.platform;
  const arch = normalizeOptionalString(process.env.OPL_CODEX_ARCH_OVERRIDE) ?? process.arch;
  const key = `${platform}:${arch}` as keyof typeof CODEX_PLATFORM_TARGETS;
  const target = CODEX_PLATFORM_TARGETS[key];
  if (!target) {
    throw new Error(`Unsupported Codex runtime platform: ${platform}/${arch}`);
  }
  return target;
}

function runtimeRootFromCodexPath(binaryPath: string | null | undefined) {
  if (!binaryPath) {
    return null;
  }
  const normalized = path.resolve(binaryPath);
  const suffix = path.join('current', 'bin', 'codex');
  return normalized.endsWith(`${path.sep}${suffix}`)
    ? normalized.slice(0, -(suffix.length + 1))
    : null;
}

function resolveOplRuntimeToolchainPaths(): RuntimeToolchainPaths {
  const explicitRuntimeRoot = normalizeOptionalString(process.env.OPL_RUNTIME_ROOT);
  const selectedRuntimeRoot = runtimeRootFromCodexPath(resolveCodexBinary()?.path);
  const runtimeRoot = path.resolve(
    explicitRuntimeRoot
      ?? selectedRuntimeRoot
      ?? path.join(resolveHomeDir(), 'Library', 'Application Support', 'OPL', 'runtime'),
  );
  const currentRoot = path.join(runtimeRoot, 'current');
  const currentBinDir = path.join(currentRoot, 'bin');
  const stagingRoot = path.resolve(
    normalizeOptionalString(process.env.OPL_RUNTIME_TOOLCHAIN_STAGE_ROOT)
      ?? path.join(runtimeRoot, 'staged', 'codex-cli'),
  );
  return {
    runtime_root: runtimeRoot,
    current_root: currentRoot,
    current_bin_dir: currentBinDir,
    current_codex_path: path.join(currentBinDir, 'codex'),
    staging_root: stagingRoot,
    generations_root: path.join(runtimeRoot, 'generations'),
    pending_metadata_path: path.join(runtimeRoot, 'pending-codex-generation.json'),
    previous_root: path.join(runtimeRoot, 'previous'),
  };
}

function parseCliVersion(output: string | null | undefined): ParsedCliVersion | null {
  const match = normalizeOptionalString(output)?.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }

  return {
    version: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`,
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
  };
}

function compareCliVersions(left: ParsedCliVersion, right: ParsedCliVersion) {
  for (let index = 0; index < left.parts.length; index += 1) {
    const diff = left.parts[index] - right.parts[index];
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function resolveLatestVersionStatus(
  parsedVersion: string | null,
  latestVersion: string | null,
): LatestCodexCliVersionSnapshot {
  if (!latestVersion) {
    return {
      latest_version: null,
      latest_version_status: parsedVersion ? 'unknown' : 'missing',
    };
  }

  const parsedCurrent = parseCliVersion(parsedVersion);
  const parsedLatest = parseCliVersion(latestVersion);
  if (!parsedCurrent || !parsedLatest) {
    return {
      latest_version: latestVersion,
      latest_version_status: 'unknown',
    };
  }

  return {
    latest_version: parsedLatest.version,
    latest_version_status: compareCliVersions(parsedCurrent, parsedLatest) >= 0
      ? 'current'
      : 'outdated',
  };
}

function resolveConfiguredLatestCodexCliVersion() {
  const envVersion = normalizeOptionalString(process.env.OPL_CODEX_CLI_LATEST_VERSION);
  return envVersion ? parseCliVersion(envVersion)?.version ?? envVersion : null;
}

function resolveLatestCodexCliVersion(options: { preferOffline?: boolean } = {}) {
  const configuredVersion = resolveConfiguredLatestCodexCliVersion();
  if (configuredVersion) return configuredVersion;

  let result;
  try {
    result = runCommand(
      'npm',
      [
        'view',
        '@openai/codex',
        'version',
        '--silent',
        ...(options.preferOffline ? ['--prefer-offline'] : []),
      ],
      undefined,
      { timeoutMs: resolveCodexLatestTimeoutMs() },
    );
  } catch {
    return null;
  }
  if (result.exitCode !== 0 || result.timedOut) {
    return null;
  }

  return parseCliVersion(normalizeOutput(result.stdout, result.stderr))?.version ?? null;
}

function resolveVersionStatus(rawVersion: string | null, minimumVersion: string) {
  const parsedVersion = parseCliVersion(rawVersion);
  const parsedMinimum = parseCliVersion(minimumVersion);

  if (!parsedVersion || !parsedMinimum) {
    return {
      parsed_version: parsedVersion?.version ?? null,
      version_status: 'unknown' as const,
    };
  }

  return {
    parsed_version: parsedVersion.version,
    version_status: compareCliVersions(parsedVersion, parsedMinimum) >= 0
      ? 'compatible' as const
      : 'outdated' as const,
  };
}

function inspectRuntimeCodexToolchain(
  minimumVersion: string,
  latestVersion: string | null,
) {
  const paths = resolveOplRuntimeToolchainPaths();
  const binaryExists = fs.existsSync(paths.current_codex_path)
    && fs.statSync(paths.current_codex_path).isFile();
  const versionResult = binaryExists
    ? runCommand(paths.current_codex_path, ['--version'])
    : null;
  const version = versionResult && versionResult.exitCode === 0
    ? normalizeOptionalString(normalizeOutput(versionResult.stdout, versionResult.stderr))
    : null;
  const currentPolicy = resolveVersionStatus(version, minimumVersion);
  const latestPolicy = resolveLatestVersionStatus(currentPolicy.parsed_version, latestVersion);

  return {
    surface_kind: 'opl_runtime_substrate_updater',
    updater_version: CODEX_RUNTIME_UPDATER_VERSION,
    owner: 'opl_app_runtime',
    target_toolchain: 'codex_cli',
    update_strategy: 'app_owned_stage_verify_restart_activate',
    apply_trigger: 'opl engine install/update/reinstall --engine codex or opl system startup-maintenance',
    global_toolchain_mutation_allowed: false,
    system_tool_priority: 'prefer_compatible_system_codex_from_env_or_path',
    managed_payloads: ['codex_cli', 'codex_path_rg'],
    platform_package_materialization_policy: {
      package_name: resolveCodexPlatformTarget().packageName,
      target_triple: resolveCodexPlatformTarget().targetTriple,
      source_of_truth: 'npm_optional_dependency_or_preseeded_platform_tarball',
      explicit_install_when_optional_payload_missing: true,
      install_scope: 'app_owned_stage_prefix_only',
      global_toolchain_mutation_allowed: false,
      can_claim_domain_ready: false,
      can_claim_app_release_ready: false,
      can_claim_production_ready: false,
    },
    runtime_root: paths.runtime_root,
    current_root: paths.current_root,
    current_binary_path: paths.current_codex_path,
    staging_root: paths.staging_root,
    pending_metadata_path: paths.pending_metadata_path,
    pending_generation: fs.existsSync(paths.pending_metadata_path)
      ? readJsonFileOrNull(paths.pending_metadata_path)
      : null,
    activation_policy: 'next_app_start_generation_switch',
    previous_root: paths.previous_root,
    rollback_available: fs.existsSync(paths.previous_root),
    current_binary_installed: binaryExists,
    current_version: version,
    current_parsed_version: currentPolicy.parsed_version,
    current_version_status: binaryExists ? currentPolicy.version_status : 'missing',
    latest_version: latestPolicy.latest_version,
    latest_version_status: binaryExists ? latestPolicy.latest_version_status : 'missing',
    update_available: binaryExists
      ? latestPolicy.latest_version_status === 'outdated'
      : Boolean(latestVersion),
  };
}

function inspectCodexCandidate(candidatePath: string, selectedPath: string | null, minimumVersion: string) {
  const versionResult = runCommand(candidatePath, ['--version']);
  const version = normalizeOptionalString(normalizeOutput(versionResult.stdout, versionResult.stderr));
  const policy = resolveVersionStatus(version, minimumVersion);
  return {
    path: candidatePath,
    real_path: resolveRealPath(candidatePath),
    selected: selectedPath === candidatePath,
    version,
    parsed_version: policy.parsed_version,
    version_status: policy.version_status,
  } satisfies CodexCandidateSnapshot;
}

function resolveRealPath(candidatePath: string) {
  try {
    return fs.realpathSync(candidatePath);
  } catch {
    return null;
  }
}

function enumeratePathCodexCandidates() {
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const entry of (process.env.PATH ?? '').split(path.delimiter)) {
    const normalized = normalizeOptionalString(entry);
    if (!normalized) {
      continue;
    }

    const candidate = path.join(normalized, 'codex');
    if (isAppBundledCodexResource(candidate)) {
      continue;
    }
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
      continue;
    }

    if (seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);
    candidates.push(candidate);
  }

  return candidates;
}

function isAppBundledCodexResource(candidatePath: string) {
  return candidatePath.includes(`${path.sep}Codex.app${path.sep}Contents${path.sep}Resources${path.sep}codex`);
}

function enumerateCodexCandidates(selectedPath: string) {
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const candidate of [selectedPath, ...enumeratePathCodexCandidates()]) {
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    candidates.push(candidate);
  }

  return candidates;
}

function candidateMatchesSelected(candidate: CodexCandidateSnapshot, selected: CodexCandidateSnapshot) {
  if (candidate.real_path && selected.real_path && candidate.real_path === selected.real_path) {
    return true;
  }

  return Boolean(
    candidate.parsed_version
      && selected.parsed_version
      && candidate.parsed_version === selected.parsed_version
      && candidate.version_status === 'compatible'
      && selected.version_status === 'compatible',
  );
}

function normalizeCodexCandidates(candidates: CodexCandidateSnapshot[]) {
  const selected = candidates.find((candidate) => candidate.selected) ?? candidates[0];
  if (!selected) {
    return [];
  }

  const normalizedSelected: CodexCandidateSnapshot = { ...selected };
  const aliases: string[] = [];
  const visible: CodexCandidateSnapshot[] = [];

  for (const candidate of candidates) {
    if (candidate.path === selected.path) {
      continue;
    }

    if (candidateMatchesSelected(candidate, selected)) {
      aliases.push(candidate.path);
      continue;
    }

    visible.push(candidate);
  }

  if (aliases.length > 0) {
    normalizedSelected.aliases = aliases;
  }

  return [normalizedSelected, ...visible];
}

export function resolveCodexVersion(options: {
  skipLatestLookup?: boolean;
  preferOfflineLatestLookup?: boolean;
} = {}) {
  const minimumVersion = resolveMinimumCodexCliVersion();
  const binary = resolveCodexBinary();
  if (!binary) {
    return {
      installed: false,
      version: null,
      parsed_version: null,
      minimum_version: minimumVersion,
      version_status: 'missing',
      latest_version: null,
      latest_version_status: 'missing',
      update_available: false,
      binary_path: null,
      binary_source: null,
      candidates: [],
      issues: ['codex_cli_missing'],
      diagnostics: [],
      runtime_substrate_updater: inspectRuntimeCodexToolchain(minimumVersion, null),
    };
  }

  const versionResult = runCommand(binary.path, ['--version']);
  const version = normalizeOptionalString(normalizeOutput(versionResult.stdout, versionResult.stderr));
  const policy = resolveVersionStatus(version, minimumVersion);
  const latestVersion = options.skipLatestLookup
    ? null
    : resolveLatestCodexCliVersion({ preferOffline: options.preferOfflineLatestLookup });
  const latestPolicy = resolveLatestVersionStatus(policy.parsed_version, latestVersion);
  const rawCandidates = enumerateCodexCandidates(binary.path)
    .map((candidate) => inspectCodexCandidate(candidate, binary.path, minimumVersion));
  const candidates = normalizeCodexCandidates(rawCandidates);
  const candidateVersions = new Set(
    candidates
      .map((candidate) => candidate.parsed_version)
      .filter(Boolean),
  );
  const blockingIssues = [
    ...(policy.version_status === 'outdated' ? ['codex_cli_version_outdated'] : []),
    ...(policy.version_status === 'unknown' ? ['codex_cli_version_unknown'] : []),
  ];
  const diagnostics = [
    ...(candidateVersions.size > 1 ? ['codex_cli_path_version_conflict_nonblocking'] : []),
    ...(latestPolicy.latest_version_status === 'outdated' ? ['codex_cli_latest_update_available'] : []),
    ...(options.skipLatestLookup ? ['codex_cli_latest_lookup_skipped_fast_profile'] : []),
    ...(options.preferOfflineLatestLookup ? ['codex_cli_latest_lookup_prefers_cache_status_projection'] : []),
  ];

  return {
    installed: true,
    version,
    parsed_version: policy.parsed_version,
    minimum_version: minimumVersion,
    version_status: policy.version_status,
    latest_version: latestPolicy.latest_version,
    latest_version_status: latestPolicy.latest_version_status,
    update_available: latestPolicy.latest_version_status === 'outdated',
    binary_path: binary.path,
    binary_source: binary.source,
    candidates,
    issues: blockingIssues,
    diagnostics,
    runtime_substrate_updater: inspectRuntimeCodexToolchain(minimumVersion, latestVersion),
  };
}

export function findEngineOrThrow(engineId: string): OplEngineId {
  const normalized = engineId.trim().toLowerCase();
  if (normalized === 'codex') {
    return normalized;
  }

  throw new Error(`Unknown engine id: ${engineId}`);
}

function buildEngineActionEnvKey(engineId: OplEngineId, action: OplEngineAction) {
  return `OPL_${engineId.toUpperCase()}_${action.toUpperCase()}_COMMAND`;
}

function resolveBuiltinEngineActionCommand(
  engineId: OplEngineId,
  action: OplEngineAction,
) {
  if (engineId !== 'codex') {
    return null;
  }
  switch (action) {
    case 'install':
    case 'update':
    case 'reinstall':
      return null;
    case 'remove':
      return 'npm uninstall -g @openai/codex';
  }
}

function findExistingFile(candidates: string[]) {
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function findInstalledCodexPackageRoot(prefixRoot: string) {
  const packageRoot = path.join(prefixRoot, 'node_modules', '@openai', 'codex');
  return fs.existsSync(packageRoot) && fs.statSync(packageRoot).isDirectory()
    ? packageRoot
    : null;
}

function readPackageJson(packageRoot: string) {
  const packageJsonPath = path.join(packageRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }
  const packageJson = readJsonFileOrNull(packageJsonPath);
  return isRecord(packageJson) ? packageJson : null;
}

function normalizePackageBinEntry(packageJson: Record<string, unknown> | null, binName: string) {
  const bin = packageJson?.bin;
  if (typeof bin === 'string') {
    return binName === 'codex' ? bin : null;
  }
  if (!isRecord(bin)) {
    return null;
  }
  const entry = bin[binName];
  return typeof entry === 'string' && entry.trim().length > 0
    ? entry
    : null;
}

function resolveInstalledCodexPlatformSpec(packageRoot: string) {
  const target = resolveCodexPlatformTarget();
  const packageJson = readPackageJson(packageRoot);
  const optionalDependencies = packageJson?.optionalDependencies;
  if (!isRecord(optionalDependencies)) {
    return null;
  }
  const spec = optionalDependencies[target.packageName];
  return typeof spec === 'string' && spec.trim().length > 0
    ? `${target.packageName}@${spec}`
    : null;
}

function findInstalledCodexPayload(packageRoot: string): InstalledCodexPayload {
  const target = resolveCodexPlatformTarget();
  const packageBaseName = target.packageName.split('/').pop()!;
  const scopedPackageRoot = path.dirname(packageRoot);
  const siblingPlatformPackageRoot = path.join(scopedPackageRoot, packageBaseName);
  const nestedPlatformPackageRoot = path.join(packageRoot, 'node_modules', '@openai', packageBaseName);
  const siblingPlatformVendorRoot = path.join(
    siblingPlatformPackageRoot,
    'vendor',
    target.targetTriple,
  );
  const platformVendorRoot = path.join(
    nestedPlatformPackageRoot,
    'vendor',
    target.targetTriple,
  );
  const localVendorRoot = path.join(packageRoot, 'vendor', target.targetTriple);
  const vendorCodex = findExistingFile([
    path.join(siblingPlatformVendorRoot, 'bin', 'codex'),
    path.join(platformVendorRoot, 'bin', 'codex'),
    path.join(localVendorRoot, 'bin', 'codex'),
    path.join(siblingPlatformVendorRoot, 'codex', 'codex'),
    path.join(platformVendorRoot, 'codex', 'codex'),
    path.join(localVendorRoot, 'codex', 'codex'),
  ]);
  const vendorRg = findExistingFile([
    path.join(siblingPlatformVendorRoot, 'codex-path', 'rg'),
    path.join(platformVendorRoot, 'codex-path', 'rg'),
    path.join(localVendorRoot, 'codex-path', 'rg'),
  ]);
  if (vendorCodex) {
    return {
      codex: vendorCodex,
      rg: vendorRg,
      package_bin_entry: null,
      platform_package_root: vendorCodex.startsWith(siblingPlatformPackageRoot)
        ? siblingPlatformPackageRoot
        : vendorCodex.startsWith(nestedPlatformPackageRoot)
          ? nestedPlatformPackageRoot
          : null,
      missing_platform_package_spec: null,
    };
  }
  const packageBinEntry = normalizePackageBinEntry(readPackageJson(packageRoot), 'codex');
  return {
    codex: null,
    rg: null,
    package_bin_entry: packageBinEntry,
    platform_package_root: null,
    missing_platform_package_spec: resolveInstalledCodexPlatformSpec(packageRoot),
  };
}

function isOplRuntimeCodexBinary(binaryPath: string | null | undefined) {
  if (!binaryPath) {
    return false;
  }
  const normalized = path.resolve(binaryPath);
  return normalized.endsWith(path.join('Library', 'Application Support', 'OPL', 'runtime', 'current', 'bin', 'codex'))
    || normalized.includes(`${path.sep}runtime${path.sep}current${path.sep}bin${path.sep}codex`);
}

function copyExecutable(source: string, destination: string) {
  fs.copyFileSync(source, destination);
  fs.chmodSync(destination, 0o755);
}

function buildCodexRuntimeNpmInstallArgs(prefixRoot: string) {
  return [
    'install',
    '--prefix',
    prefixRoot,
    resolveCodexPackageInstallSpec(),
    '--force',
    '--include=optional',
    '--ignore-scripts=false',
    '--fetch-retries=3',
    '--fetch-retry-mintimeout=2000',
    '--fetch-retry-maxtimeout=20000',
    '--fetch-timeout=60000',
    ...codexRuntimeNpmCacheArgs(),
  ];
}

function buildCodexRuntimePlatformNpmInstallArgs(prefixRoot: string, platformSpec: string) {
  return [
    'install',
    '--prefix',
    prefixRoot,
    platformSpec,
    '--force',
    '--include=optional',
    '--ignore-scripts=false',
    '--fetch-retries=3',
    '--fetch-retry-mintimeout=2000',
    '--fetch-retry-maxtimeout=20000',
    '--fetch-timeout=60000',
    ...codexRuntimeNpmCacheArgs(),
  ];
}

function makeRuntimeStageAttemptRoot(paths: RuntimeToolchainPaths) {
  fs.mkdirSync(paths.staging_root, { recursive: true });
  const attemptRoot = path.join(paths.staging_root, `download-${Date.now()}-${process.pid}`);
  fs.rmSync(attemptRoot, { recursive: true, force: true });
  fs.mkdirSync(attemptRoot, { recursive: true });
  return attemptRoot;
}

function resolvePreseedTarballPath(envKey: string) {
  const rawPath = normalizeOptionalString(process.env[envKey]);
  if (!rawPath) {
    return null;
  }
  const tarballPath = path.resolve(rawPath);
  return fs.existsSync(tarballPath) && fs.statSync(tarballPath).isFile()
    ? tarballPath
    : null;
}

function resolveCodexPackageInstallSpec() {
  return resolvePreseedTarballPath('OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL') ?? '@openai/codex@latest';
}

function resolveCodexPlatformPackageTarball() {
  return resolvePreseedTarballPath('OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL');
}

function codexRuntimeNpmCacheArgs() {
  const cacheDir = normalizeOptionalString(process.env.OPL_FIRST_RUN_CODEX_NPM_CACHE_DIR)
    ?? normalizeOptionalString(process.env.NPM_CONFIG_CACHE)
    ?? normalizeOptionalString(process.env.npm_config_cache);
  return cacheDir ? ['--cache', path.resolve(cacheDir), '--prefer-offline'] : [];
}

function extractTarballToDirectory(tarballPath: string, outputRoot: string) {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  const result = spawnSync('tar', ['-xzf', tarballPath, '-C', outputRoot], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error([
      `Failed to extract ${tarballPath}`,
      result.stdout ? `stdout:\n${result.stdout}` : '',
      result.stderr ? `stderr:\n${result.stderr}` : '',
      result.error ? `error=${result.error.message}` : '',
    ].filter(Boolean).join('\n'));
  }
  const packageRoot = path.join(outputRoot, 'package');
  if (!fs.existsSync(packageRoot) || !fs.statSync(packageRoot).isDirectory()) {
    throw new Error(`Codex package tarball did not contain package/ root: ${tarballPath}`);
  }
  return packageRoot;
}

function copyDirectoryContents(sourceRoot: string, targetRoot: string) {
  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetRoot), { recursive: true });
  fs.cpSync(sourceRoot, targetRoot, { recursive: true });
}

function materializePreseededCodexPlatformPackage(stageAttemptRoot: string, platformTarballPath: string) {
  const target = resolveCodexPlatformTarget();
  const packageBaseName = target.packageName.split('/').pop()!;
  const extractedRoot = extractTarballToDirectory(
    platformTarballPath,
    path.join(stageAttemptRoot, '.preseed', packageBaseName),
  );
  const platformPackageRoot = path.join(stageAttemptRoot, 'node_modules', '@openai', packageBaseName);
  copyDirectoryContents(extractedRoot, platformPackageRoot);
  return {
    package_root: platformPackageRoot,
    tarball_path: platformTarballPath,
  };
}

function verifyCodexExecutable(binaryPath: string) {
  const versionResult = runCommand(binaryPath, ['--version']);
  const version = versionResult.exitCode === 0
    ? normalizeOptionalString(normalizeOutput(versionResult.stdout, versionResult.stderr))
    : null;
  const parsed = parseCliVersion(version);
  return {
    verified: Boolean(parsed),
    version,
    parsed_version: parsed?.version ?? null,
    exit_code: versionResult.exitCode,
    stderr: versionResult.stderr,
  };
}

function applyCodexVendorToRuntime(
  vendor: InstalledCodexPayload,
  paths: RuntimeToolchainPaths,
  packageRoot: string,
) {
  const generationRoot = path.join(paths.generations_root, `codex-${Date.now()}-${process.pid}`);
  const generationBinDir = path.join(generationRoot, 'bin');
  const generationCodexPath = path.join(generationBinDir, 'codex');
  fs.mkdirSync(generationBinDir, { recursive: true });
  copyExecutable(vendor.codex!, generationCodexPath);
  const verification = verifyCodexExecutable(generationCodexPath);
  if (!verification.verified) {
    fs.rmSync(generationRoot, { recursive: true, force: true });
    return {
      applied: false,
      runtime_binary_path: paths.current_codex_path,
      codex_package_root: packageRoot,
      reason: 'staged_codex_binary_failed_version_verification',
      source_kind: 'platform_vendor_binary',
      platform_package_root: vendor.platform_package_root,
      verification,
    };
  }

  let rgPath: string | null = null;
  if (vendor.rg) {
    const targetRg = path.join(generationBinDir, 'rg');
    copyExecutable(vendor.rg, targetRg);
    rgPath = targetRg;
  }

  fs.mkdirSync(paths.runtime_root, { recursive: true });
  const pending = {
    surface_kind: 'opl_runtime_pending_generation.v1',
    dependency_id: 'codex-cli',
    generation_root: generationRoot,
    version: verification.parsed_version,
    codex_sha256: crypto.createHash('sha256').update(fs.readFileSync(generationCodexPath)).digest('hex'),
    staged_at: new Date().toISOString(),
    activation: 'next_app_start',
    rollback_root: paths.previous_root,
    staging_process_instance_id: currentProcessInstanceId(),
  };
  const pendingTmp = `${paths.pending_metadata_path}.${process.pid}.tmp`;
  fs.writeFileSync(pendingTmp, `${JSON.stringify(pending, null, 2)}\n`, 'utf8');
  fs.renameSync(pendingTmp, paths.pending_metadata_path);
  const activation = fs.existsSync(paths.current_codex_path)
    ? { status: 'pending_restart', current_root: paths.current_root, previous_root: paths.previous_root }
    : activatePendingCodexRuntimeGeneration();

  return {
    applied: true,
    staged: true,
    activated: activation.status === 'activated',
    restart_required: activation.status === 'pending_restart',
    runtime_binary_path: paths.current_codex_path,
    staged_runtime_binary_path: generationCodexPath,
    staged_runtime_rg_path: rgPath,
    pending_metadata_path: paths.pending_metadata_path,
    activation,
    codex_package_root: packageRoot,
    source_kind: 'platform_vendor_binary',
    platform_package_root: vendor.platform_package_root,
    copied_codex_source: vendor.codex,
    copied_rg_source: vendor.rg,
    verification,
  };
}

export function activatePendingCodexRuntimeGeneration() {
  const paths = resolveOplRuntimeToolchainPaths();
  if (!fs.existsSync(paths.pending_metadata_path)) {
    return {
      surface_kind: 'opl_runtime_generation_activation.v1',
      status: 'no_pending_generation',
      current_root: paths.current_root,
      previous_root: paths.previous_root,
    };
  }
  let pending: { generation_root?: unknown; version?: unknown; codex_sha256?: unknown; staging_process_instance_id?: unknown };
  try {
    pending = JSON.parse(fs.readFileSync(paths.pending_metadata_path, 'utf8')) as typeof pending;
  } catch (error) {
    return {
      surface_kind: 'opl_runtime_generation_activation.v1',
      status: 'manual_required',
      reason: 'pending_generation_metadata_invalid',
      error: error instanceof Error ? error.message : String(error),
      current_root: paths.current_root,
      previous_root: paths.previous_root,
    };
  }
  const generationRoot = typeof pending.generation_root === 'string' ? path.resolve(pending.generation_root) : null;
  const allowedRoot = path.resolve(paths.generations_root);
  if (!generationRoot || !generationRoot.startsWith(`${allowedRoot}${path.sep}`)) {
    return {
      surface_kind: 'opl_runtime_generation_activation.v1',
      status: 'manual_required',
      reason: 'pending_generation_path_invalid',
      current_root: paths.current_root,
      previous_root: paths.previous_root,
    };
  }
  if (fs.existsSync(paths.current_codex_path)
    && pending.staging_process_instance_id === currentProcessInstanceId()) {
    return {
      surface_kind: 'opl_runtime_generation_activation.v1',
      status: 'deferred_same_app_instance',
      current_root: paths.current_root,
      previous_root: paths.previous_root,
      staging_process_instance_id: pending.staging_process_instance_id,
    };
  }
  const stagedCodex = path.join(generationRoot, 'bin', 'codex');
  const verification = fs.existsSync(stagedCodex) ? verifyCodexExecutable(stagedCodex) : null;
  const digest = verification?.verified
    ? crypto.createHash('sha256').update(fs.readFileSync(stagedCodex)).digest('hex')
    : null;
  if (!verification?.verified || digest !== pending.codex_sha256) {
    return {
      surface_kind: 'opl_runtime_generation_activation.v1',
      status: 'manual_required',
      reason: 'pending_generation_verification_failed',
      verification,
      current_root: paths.current_root,
      previous_root: paths.previous_root,
    };
  }
  fs.rmSync(paths.previous_root, { recursive: true, force: true });
  try {
    if (fs.existsSync(paths.current_root)) fs.renameSync(paths.current_root, paths.previous_root);
    fs.renameSync(generationRoot, paths.current_root);
  } catch (error) {
    if (!fs.existsSync(paths.current_root) && fs.existsSync(paths.previous_root)) {
      fs.renameSync(paths.previous_root, paths.current_root);
    }
    throw error;
  }
  fs.rmSync(paths.pending_metadata_path, { force: true });
  return {
    surface_kind: 'opl_runtime_generation_activation.v1',
    status: 'activated',
    version: pending.version ?? verification.parsed_version,
    current_root: paths.current_root,
    previous_root: fs.existsSync(paths.previous_root) ? paths.previous_root : null,
    activated_at: new Date().toISOString(),
    rollback_available: fs.existsSync(paths.previous_root),
  };
}

export function rollbackCodexRuntimeGeneration() {
  const paths = resolveOplRuntimeToolchainPaths();
  if (!fs.existsSync(paths.previous_root)) {
    return {
      surface_kind: 'opl_runtime_generation_rollback.v1',
      status: 'manual_required',
      reason: 'previous_generation_missing',
    };
  }
  const swapRoot = path.join(paths.runtime_root, `.rollback-swap-${process.pid}-${Date.now()}`);
  fs.renameSync(paths.current_root, swapRoot);
  try {
    fs.renameSync(paths.previous_root, paths.current_root);
    fs.renameSync(swapRoot, paths.previous_root);
  } catch (error) {
    if (!fs.existsSync(paths.current_root) && fs.existsSync(swapRoot)) fs.renameSync(swapRoot, paths.current_root);
    throw error;
  }
  fs.rmSync(paths.pending_metadata_path, { force: true });
  return {
    surface_kind: 'opl_runtime_generation_rollback.v1',
    status: 'completed',
    current_root: paths.current_root,
    previous_root: paths.previous_root,
    rolled_back_at: new Date().toISOString(),
  };
}

function applyStagedCodexRuntimePayload(stageAttemptRoot: string, paths: RuntimeToolchainPaths, cwd?: string) {
  const packageRoot = findInstalledCodexPackageRoot(stageAttemptRoot);
  if (!packageRoot) {
    return {
      applied: false,
      runtime_binary_path: paths.current_codex_path,
      reason: 'codex_package_root_not_found_in_runtime_stage',
      stage_attempt_root: stageAttemptRoot,
    };
  }
  let explicitPlatformInstall = null;
  let vendor = findInstalledCodexPayload(packageRoot);
  if (!vendor.codex && vendor.missing_platform_package_spec) {
    explicitPlatformInstall = runCommand(
      'npm',
      buildCodexRuntimePlatformNpmInstallArgs(stageAttemptRoot, vendor.missing_platform_package_spec),
      cwd,
    );
    vendor = findInstalledCodexPayload(packageRoot);
  }
  if (!vendor.codex) {
    const failedExplicitPlatformInstall = explicitPlatformInstall && explicitPlatformInstall.exitCode !== 0;
    return {
      applied: false,
      runtime_binary_path: paths.current_codex_path,
      codex_package_root: packageRoot,
      reason: failedExplicitPlatformInstall
        ? 'codex_platform_package_install_failed'
        : 'codex_vendor_binary_not_found',
      package_bin_entry: vendor.package_bin_entry,
      explicit_platform_install: explicitPlatformInstall
        ? {
            exit_code: explicitPlatformInstall.exitCode,
            stdout: explicitPlatformInstall.stdout,
            stderr: explicitPlatformInstall.stderr,
            platform_spec: resolveInstalledCodexPlatformSpec(packageRoot),
          }
        : null,
      missing_platform_package_spec: vendor.missing_platform_package_spec,
    };
  }

  return {
    explicit_platform_install: explicitPlatformInstall
      ? {
          exit_code: explicitPlatformInstall.exitCode,
          stdout: explicitPlatformInstall.stdout,
          stderr: explicitPlatformInstall.stderr,
          platform_spec: resolveInstalledCodexPlatformSpec(packageRoot),
        }
      : null,
    ...applyCodexVendorToRuntime(vendor, paths, packageRoot),
  };
}

function readLatestPendingCodexGeneration(paths: RuntimeToolchainPaths) {
  const latestVersion = resolveLatestCodexCliVersion({ preferOffline: true });
  if (!latestVersion || !fs.existsSync(paths.pending_metadata_path)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(paths.pending_metadata_path, 'utf8')) as {
      surface_kind?: unknown;
      dependency_id?: unknown;
      generation_root?: unknown;
      version?: unknown;
      staging_process_instance_id?: unknown;
    };
    const pendingVersion = typeof payload.version === 'string'
      ? parseCliVersion(payload.version)?.version ?? null
      : null;
    const generationRoot = typeof payload.generation_root === 'string'
      ? path.resolve(payload.generation_root)
      : null;
    const allowedRoot = path.resolve(paths.generations_root);
    if (payload.surface_kind !== 'opl_runtime_pending_generation.v1'
      || payload.dependency_id !== 'codex-cli'
      || pendingVersion !== latestVersion
      || !generationRoot
      || !generationRoot.startsWith(`${allowedRoot}${path.sep}`)
      || !fs.existsSync(path.join(generationRoot, 'bin', 'codex'))) return null;
    return {
      version: pendingVersion,
      generation_root: generationRoot,
      staging_process_instance_id: typeof payload.staging_process_instance_id === 'string'
        ? payload.staging_process_instance_id
        : null,
    };
  } catch {
    return null;
  }
}

function runBuiltinCodexRuntimeInstallOrUpdate(cwd?: string) {
  const paths = resolveOplRuntimeToolchainPaths();
  const pending = readLatestPendingCodexGeneration(paths);
  if (pending) {
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        opl_runtime_codex_update: {
          surface_kind: 'opl_runtime_substrate_update_receipt',
          updater_version: CODEX_RUNTIME_UPDATER_VERSION,
          owner: 'opl_app_runtime',
          target_toolchain: 'codex_cli',
          update_strategy: 'app_owned_stage_verify_restart_activate',
          applied: false,
          staged: true,
          restart_required: true,
          reason: 'codex_runtime_latest_already_pending_restart',
          version: pending.version,
          generation_root: pending.generation_root,
          pending_metadata_path: paths.pending_metadata_path,
          staging_process_instance_id: pending.staging_process_instance_id,
        },
      }),
      stderr: '',
    };
  }
  const stageAttemptRoot = makeRuntimeStageAttemptRoot(paths);
  const installArgs = buildCodexRuntimeNpmInstallArgs(stageAttemptRoot);
  const installResult = runCommand('npm', installArgs, cwd);
  if (installResult.exitCode !== 0) {
    return installResult;
  }
  let preseededPlatformPackage = null;
  const platformTarballPath = resolveCodexPlatformPackageTarball();
  try {
    if (platformTarballPath) {
      preseededPlatformPackage = materializePreseededCodexPlatformPackage(stageAttemptRoot, platformTarballPath);
    }
  } catch (error) {
    return {
      exitCode: 1,
      stdout: installResult.stdout,
      stderr: normalizeOutput(
        installResult.stderr,
        JSON.stringify({
          opl_runtime_codex_update: {
            surface_kind: 'opl_runtime_substrate_update_receipt',
            updater_version: CODEX_RUNTIME_UPDATER_VERSION,
            owner: 'opl_app_runtime',
            target_toolchain: 'codex_cli',
            stage_attempt_root: stageAttemptRoot,
            preseeded_platform_package: {
              status: 'failed',
              tarball_path: platformTarballPath,
              error: error instanceof Error ? error.message : String(error),
            },
          },
        }),
      ),
    };
  }

  const runtimeApply = applyStagedCodexRuntimePayload(stageAttemptRoot, paths, cwd);
  if (!runtimeApply.applied) {
    return {
      exitCode: 1,
      stdout: installResult.stdout,
      stderr: normalizeOutput(
        installResult.stderr,
        JSON.stringify({ opl_runtime_codex_update: runtimeApply }),
      ),
    };
  }

  return {
    ...installResult,
    stdout: normalizeOutput(
      installResult.stdout,
      [
        installResult.stderr,
        JSON.stringify({
          opl_runtime_codex_update: {
            surface_kind: 'opl_runtime_substrate_update_receipt',
            updater_version: CODEX_RUNTIME_UPDATER_VERSION,
            owner: 'opl_app_runtime',
            target_toolchain: 'codex_cli',
            update_strategy: 'app_owned_stage_verify_restart_activate',
            global_toolchain_mutation_allowed: false,
            system_tool_priority: 'prefer_compatible_system_codex_from_env_or_path',
            stage_attempt_root: stageAttemptRoot,
            preseeded_package_tarball: resolvePreseedTarballPath('OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL'),
            preseeded_platform_package: preseededPlatformPackage,
            ...runtimeApply,
          },
        }),
      ].filter(Boolean).join('\n'),
    ),
  };
}

function buildBuiltinCodexRuntimeActionSpec(): OplShellActionSpec {
  const paths = resolveOplRuntimeToolchainPaths();
  return {
    strategy: 'builtin',
    command_preview: ['npm', ...buildCodexRuntimeNpmInstallArgs(path.join(paths.staging_root, '<attempt>'))],
    note: 'Stages and verifies Codex in the OPL App-owned Runtime Substrate, then activates it on the next App start; it does not modify global Homebrew, npm, or system Codex installations.',
    executable: (cwd?: string) => runBuiltinCodexRuntimeInstallOrUpdate(cwd),
  };
}

function resolveShellActionSpec(
  envOverride: string | undefined,
  builtinCommand: string | null,
  manualNote: string,
): OplShellActionSpec {
  const normalizedOverride = normalizeOptionalString(envOverride);
  if (normalizedOverride) {
    const executablePath = path.resolve(normalizedOverride);
    if (!/\s/.test(normalizedOverride) && fs.existsSync(executablePath) && fs.statSync(executablePath).isFile()) {
      return {
        strategy: 'env_override',
        command_preview: [executablePath],
        note: null,
        executable: (cwd?: string) => runCommand(executablePath, [], cwd),
      };
    }

    return {
      strategy: 'env_override',
      command_preview: [getShellBinary(), '-lc', normalizedOverride],
      note: null,
      executable: (cwd?: string) => runShellCommand(normalizedOverride, cwd),
    };
  }

  if (builtinCommand) {
    return {
      strategy: 'builtin',
      command_preview: [getShellBinary(), '-lc', builtinCommand],
      note: null,
      executable: (cwd?: string) => runShellCommand(builtinCommand, cwd),
    };
  }

  return {
    strategy: 'manual_required',
    command_preview: [],
    note: manualNote,
    executable: null,
  };
}

export function resolveEngineActionSpec(
  engineId: OplEngineId,
  action: OplEngineAction,
): OplShellActionSpec {
  const envOverride = process.env[buildEngineActionEnvKey(engineId, action)];
  if (
    engineId === 'codex'
    && !normalizeOptionalString(envOverride)
    && (action === 'install' || action === 'update' || action === 'reinstall')
  ) {
    return buildBuiltinCodexRuntimeActionSpec();
  }
  const builtinCommand = resolveBuiltinEngineActionCommand(engineId, action);
  const manualNote =
    `No built-in ${engineId} ${action} command is configured. Set ${buildEngineActionEnvKey(engineId, action)} to enable it.`;

  return resolveShellActionSpec(envOverride, builtinCommand, manualNote);
}
