import { resolveDependencyReleaseSync } from '../../dependency-release-resolution-sync.ts';
import { allowDependencyVersionOverride } from '../../dependency-resolution-mode.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  normalizeOutput,
  normalizeOptionalString,
  runCommand,
} from '../shared.ts';

const DEFAULT_MINIMUM_CODEX_CLI_VERSION = '0.125.0';

const DEFAULT_CODEX_LATEST_TIMEOUT_MS = 5000;

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

export type RuntimeToolchainPaths = {
  runtime_root: string;
  current_root: string;
  current_bin_dir: string;
  current_codex_path: string;
  staging_root: string;
  generations_root: string;
  pending_metadata_path: string;
  previous_root: string;
};

export type InstalledCodexPayload = {
  codex: string | null;
  rg: string | null;
  package_bin_entry: string | null;
  platform_package_root: string | null;
  missing_platform_package_spec: string | null;
};

type CodexPlatformTarget = (typeof CODEX_PLATFORM_TARGETS)[keyof typeof CODEX_PLATFORM_TARGETS];

export function resolveMinimumCodexCliVersion() {
  return normalizeOptionalString(process.env.OPL_MIN_CODEX_CLI_VERSION)
    ?? DEFAULT_MINIMUM_CODEX_CLI_VERSION;
}

function resolveCodexLatestTimeoutMs() {
  const parsed = Number(process.env.OPL_CODEX_LATEST_TIMEOUT_MS ?? '');
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_CODEX_LATEST_TIMEOUT_MS;
}

export function resolveHomeDir() {
  return normalizeOptionalString(process.env.HOME) ?? os.homedir();
}

export function resolveCodexPlatformTarget(): CodexPlatformTarget {
  const platform = normalizeOptionalString(process.env.OPL_CODEX_PLATFORM_OVERRIDE) ?? process.platform;
  const arch = normalizeOptionalString(process.env.OPL_CODEX_ARCH_OVERRIDE) ?? process.arch;
  const key = `${platform}:${arch}` as keyof typeof CODEX_PLATFORM_TARGETS;
  const target = CODEX_PLATFORM_TARGETS[key];
  if (!target) {
    throw new Error(`Unsupported Codex runtime platform: ${platform}/${arch}`);
  }
  return target;
}

export function parseCliVersion(output: string | null | undefined): ParsedCliVersion | null {
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

export function resolveLatestVersionStatus(
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
  if (!allowDependencyVersionOverride()) return null;
  const envVersion = normalizeOptionalString(process.env.OPL_CODEX_CLI_LATEST_VERSION);
  return envVersion ? parseCliVersion(envVersion)?.version ?? envVersion : null;
}

export function resolveLatestCodexCliVersion(options: { preferOffline?: boolean } = {}) {
  const configuredVersion = resolveConfiguredLatestCodexCliVersion();
  if (configuredVersion) return configuredVersion;

  try {
    return resolveDependencyReleaseSync('codex-cli', { verifyArchive: false }).version;
  } catch {
    return null;
  }
}

export function resolveVersionStatus(rawVersion: string | null, minimumVersion: string) {
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

export function inspectCodexCandidate(candidatePath: string, selectedPath: string | null, minimumVersion: string) {
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

export function enumerateCodexCandidates(selectedPath: string) {
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

export function normalizeCodexCandidates(candidates: CodexCandidateSnapshot[]) {
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

export function verifyCodexExecutable(binaryPath: string) {
  const versionResult = runCommand(binaryPath, ['--version'], undefined, { timeoutMs: 8000, maxBuffer: 64 * 1024 });
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
