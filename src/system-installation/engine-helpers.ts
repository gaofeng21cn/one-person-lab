import fs from 'node:fs';
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

export function resolveCodexVersion() {
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
    };
  }

  const versionResult = runCommand(binary.path, ['--version']);
  const version = normalizeOptionalString(normalizeOutput(versionResult.stdout, versionResult.stderr));
  const policy = resolveVersionStatus(version, minimumVersion);
  const latestVersion = resolveLatestCodexCliVersion();
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
  switch (action) {
    case 'install':
    case 'update':
    case 'reinstall':
      return [
        'npm install -g @openai/codex@latest --force',
        '--fetch-retries=3',
        '--fetch-retry-mintimeout=2000',
        '--fetch-retry-maxtimeout=20000',
        '--fetch-timeout=60000',
      ].join(' ');
    case 'remove':
      return 'npm uninstall -g @openai/codex';
  }
}

function findExistingFile(candidates: string[]) {
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function findInstalledCodexPackageRoot() {
  const result = runCommand('npm', ['root', '-g']);
  if (result.exitCode !== 0) {
    return null;
  }
  const globalRoot = normalizeOptionalString(normalizeOutput(result.stdout, result.stderr));
  return globalRoot ? path.join(globalRoot, '@openai', 'codex') : null;
}

function findInstalledCodexVendorBinaries(packageRoot: string) {
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
      path.join(platformVendorRoot, 'bin', 'codex'),
      path.join(localVendorRoot, 'bin', 'codex'),
      path.join(platformVendorRoot, 'codex', 'codex'),
      path.join(localVendorRoot, 'codex', 'codex'),
    ]),
    rg: findExistingFile([
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

function updateSelectedOplRuntimeCodexBinary() {
  const binary = resolveCodexBinary();
  if (!isOplRuntimeCodexBinary(binary?.path)) {
    return {
      refreshed_runtime_binary: false,
      runtime_binary_path: binary?.path ?? null,
    };
  }

  const packageRoot = findInstalledCodexPackageRoot();
  if (!packageRoot) {
    return {
      refreshed_runtime_binary: false,
      runtime_binary_path: binary.path,
      reason: 'codex_package_root_not_found',
    };
  }

  const vendor = findInstalledCodexVendorBinaries(packageRoot);
  if (!vendor.codex) {
    return {
      refreshed_runtime_binary: false,
      runtime_binary_path: binary.path,
      codex_package_root: packageRoot,
      reason: 'codex_vendor_binary_not_found',
    };
  }

  const runtimeBinDir = path.dirname(binary.path);
  copyExecutable(vendor.codex, binary.path);
  if (vendor.rg) {
    copyExecutable(vendor.rg, path.join(runtimeBinDir, 'rg'));
  }

  return {
    refreshed_runtime_binary: true,
    runtime_binary_path: binary.path,
    codex_package_root: packageRoot,
    copied_codex_source: vendor.codex,
    copied_rg_source: vendor.rg,
  };
}

function runBuiltinCodexInstallOrUpdate(command: string, cwd?: string) {
  const installResult = runShellCommand(command, cwd);
  if (installResult.exitCode !== 0) {
    return installResult;
  }

  const runtimeRefresh = updateSelectedOplRuntimeCodexBinary();
  return {
    ...installResult,
    stdout: normalizeOutput(
      installResult.stdout,
      [
        installResult.stderr,
        JSON.stringify({ opl_runtime_codex_refresh: runtimeRefresh }),
      ].filter(Boolean).join('\n'),
    ),
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
      executable: (cwd?: string) => builtinCommand.includes('@openai/codex@latest')
        ? runBuiltinCodexInstallOrUpdate(builtinCommand, cwd)
        : runShellCommand(builtinCommand, cwd),
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
  const builtinCommand = resolveBuiltinEngineActionCommand(engineId, action);
  const manualNote =
    `No built-in ${engineId} ${action} command is configured. Set ${buildEngineActionEnvKey(engineId, action)} to enable it.`;

  return resolveShellActionSpec(envOverride, builtinCommand, manualNote);
}
