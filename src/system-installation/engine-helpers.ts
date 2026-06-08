import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveCodexBinary } from '../codex.ts';

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
const CODEX_MACOS_ARM64_TARGET = 'aarch64-apple-darwin';
const DEFAULT_CODEX_LATEST_TIMEOUT_MS = 5000;
const CODEX_RUNTIME_UPDATER_VERSION = 'opl-runtime-toolchain-updater.v1';

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
};

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

function resolveLatestCodexCliVersion() {
  const envVersion = normalizeOptionalString(process.env.OPL_CODEX_CLI_LATEST_VERSION);
  if (envVersion) {
    return parseCliVersion(envVersion)?.version ?? envVersion;
  }

  let result;
  try {
    result = runCommand(
      'npm',
      ['view', '@openai/codex', 'version', '--silent'],
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
    surface_kind: 'opl_runtime_toolchain_updater',
    updater_version: CODEX_RUNTIME_UPDATER_VERSION,
    owner: 'opl_app_runtime',
    target_toolchain: 'codex_cli',
    update_strategy: 'app_owned_stage_verify_atomic_apply',
    apply_trigger: 'opl engine install/update/reinstall --engine codex or opl system startup-maintenance',
    global_toolchain_mutation_allowed: false,
    system_tool_priority: 'prefer_compatible_system_codex_from_env_or_path',
    managed_payloads: ['codex_cli', 'codex_path_rg'],
    runtime_root: paths.runtime_root,
    current_root: paths.current_root,
    current_binary_path: paths.current_codex_path,
    staging_root: paths.staging_root,
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

export function resolveCodexVersion(options: { skipLatestLookup?: boolean } = {}) {
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
      runtime_toolchain_updater: inspectRuntimeCodexToolchain(minimumVersion, null),
    };
  }

  const versionResult = runCommand(binary.path, ['--version']);
  const version = normalizeOptionalString(normalizeOutput(versionResult.stdout, versionResult.stderr));
  const policy = resolveVersionStatus(version, minimumVersion);
  const latestVersion = options.skipLatestLookup ? null : resolveLatestCodexCliVersion();
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
    runtime_toolchain_updater: inspectRuntimeCodexToolchain(minimumVersion, latestVersion),
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

function findInstalledCodexVendorBinaries(packageRoot: string) {
  const scopedPackageRoot = path.dirname(packageRoot);
  const siblingPlatformVendorRoot = path.join(
    scopedPackageRoot,
    'codex-darwin-arm64',
    'vendor',
    CODEX_MACOS_ARM64_TARGET,
  );
  const platformVendorRoot = path.join(
    packageRoot,
    'node_modules',
    '@openai',
    'codex-darwin-arm64',
    'vendor',
    CODEX_MACOS_ARM64_TARGET,
  );
  const localVendorRoot = path.join(packageRoot, 'vendor', CODEX_MACOS_ARM64_TARGET);
  return {
    codex: findExistingFile([
      path.join(siblingPlatformVendorRoot, 'bin', 'codex'),
      path.join(platformVendorRoot, 'bin', 'codex'),
      path.join(localVendorRoot, 'bin', 'codex'),
      path.join(siblingPlatformVendorRoot, 'codex', 'codex'),
      path.join(platformVendorRoot, 'codex', 'codex'),
      path.join(localVendorRoot, 'codex', 'codex'),
    ]),
    rg: findExistingFile([
      path.join(siblingPlatformVendorRoot, 'codex-path', 'rg'),
      path.join(platformVendorRoot, 'codex-path', 'rg'),
      path.join(localVendorRoot, 'codex-path', 'rg'),
    ]),
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
    '@openai/codex@latest',
    '--force',
    '--include=optional',
    '--ignore-scripts=false',
    '--fetch-retries=3',
    '--fetch-retry-mintimeout=2000',
    '--fetch-retry-maxtimeout=20000',
    '--fetch-timeout=60000',
  ];
}

function makeRuntimeStageAttemptRoot(paths: RuntimeToolchainPaths) {
  fs.mkdirSync(paths.staging_root, { recursive: true });
  const attemptRoot = path.join(paths.staging_root, `download-${Date.now()}-${process.pid}`);
  fs.rmSync(attemptRoot, { recursive: true, force: true });
  fs.mkdirSync(attemptRoot, { recursive: true });
  return attemptRoot;
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
  vendor: ReturnType<typeof findInstalledCodexVendorBinaries>,
  paths: RuntimeToolchainPaths,
  packageRoot: string,
) {
  fs.mkdirSync(paths.current_bin_dir, { recursive: true });

  const tmpCodex = path.join(paths.current_bin_dir, `.codex-${process.pid}-${Date.now()}.tmp`);
  copyExecutable(vendor.codex!, tmpCodex);
  const verification = verifyCodexExecutable(tmpCodex);
  if (!verification.verified) {
    fs.rmSync(tmpCodex, { force: true });
    return {
      applied: false,
      runtime_binary_path: paths.current_codex_path,
      codex_package_root: packageRoot,
      reason: 'staged_codex_binary_failed_version_verification',
      verification,
    };
  }

  fs.renameSync(tmpCodex, paths.current_codex_path);
  let rgPath: string | null = null;
  if (vendor.rg) {
    const targetRg = path.join(paths.current_bin_dir, 'rg');
    const tmpRg = path.join(paths.current_bin_dir, `.rg-${process.pid}-${Date.now()}.tmp`);
    copyExecutable(vendor.rg, tmpRg);
    fs.renameSync(tmpRg, targetRg);
    rgPath = targetRg;
  }

  return {
    applied: true,
    runtime_binary_path: paths.current_codex_path,
    runtime_rg_path: rgPath,
    codex_package_root: packageRoot,
    copied_codex_source: vendor.codex,
    copied_rg_source: vendor.rg,
    verification,
  };
}

function applyStagedCodexRuntimePayload(stageAttemptRoot: string, paths: RuntimeToolchainPaths) {
  const packageRoot = findInstalledCodexPackageRoot(stageAttemptRoot);
  if (!packageRoot) {
    return {
      applied: false,
      runtime_binary_path: paths.current_codex_path,
      reason: 'codex_package_root_not_found_in_runtime_stage',
      stage_attempt_root: stageAttemptRoot,
    };
  }
  const vendor = findInstalledCodexVendorBinaries(packageRoot);
  if (!vendor.codex) {
    return {
      applied: false,
      runtime_binary_path: paths.current_codex_path,
      codex_package_root: packageRoot,
      reason: 'codex_vendor_binary_not_found',
    };
  }

  return applyCodexVendorToRuntime(vendor, paths, packageRoot);
}

function runBuiltinCodexRuntimeInstallOrUpdate(cwd?: string) {
  const paths = resolveOplRuntimeToolchainPaths();
  const stageAttemptRoot = makeRuntimeStageAttemptRoot(paths);
  const installArgs = buildCodexRuntimeNpmInstallArgs(stageAttemptRoot);
  const installResult = runCommand('npm', installArgs, cwd);
  if (installResult.exitCode !== 0) {
    return installResult;
  }

  const runtimeApply = applyStagedCodexRuntimePayload(stageAttemptRoot, paths);
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
            surface_kind: 'opl_runtime_toolchain_update_receipt',
            updater_version: CODEX_RUNTIME_UPDATER_VERSION,
            owner: 'opl_app_runtime',
            target_toolchain: 'codex_cli',
            update_strategy: 'app_owned_stage_verify_atomic_apply',
            global_toolchain_mutation_allowed: false,
            system_tool_priority: 'prefer_compatible_system_codex_from_env_or_path',
            stage_attempt_root: stageAttemptRoot,
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
    note: 'Uses the OPL App-owned runtime/toolchain stage and atomically applies current/bin/codex; it does not modify global Homebrew, npm, or system Codex installations.',
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
