import fs from 'node:fs';
import path from 'node:path';

import { resolveCodexBinary } from '../codex.ts';
import { inspectHermesRuntime } from '../hermes.ts';

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

function resolveMinimumCodexCliVersion() {
  return normalizeOptionalString(process.env.OPL_MIN_CODEX_CLI_VERSION)
    ?? DEFAULT_MINIMUM_CODEX_CLI_VERSION;
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
  ];

  return {
    installed: true,
    version,
    parsed_version: policy.parsed_version,
    minimum_version: minimumVersion,
    version_status: policy.version_status,
    binary_path: binary.path,
    binary_source: binary.source,
    candidates,
    issues: blockingIssues,
    diagnostics,
  };
}

export function findEngineOrThrow(engineId: string): OplEngineId {
  const normalized = engineId.trim().toLowerCase();
  if (normalized === 'codex' || normalized === 'hermes') {
    return normalized;
  }

  throw new Error(`Unknown engine id: ${engineId}`);
}

function buildEngineActionEnvKey(engineId: OplEngineId, action: OplEngineAction) {
  return `OPL_${engineId.toUpperCase()}_${action.toUpperCase()}_COMMAND`;
}

function resolveHermesInstallCommand() {
  return 'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash';
}

function resolveBuiltinEngineActionCommand(
  engineId: OplEngineId,
  action: OplEngineAction,
) {
  if (engineId === 'codex') {
    switch (action) {
      case 'install':
      case 'update':
      case 'reinstall':
        return [
          'npm install -g @openai/codex@latest',
          '--fetch-retries=3',
          '--fetch-retry-mintimeout=2000',
          '--fetch-retry-maxtimeout=20000',
          '--fetch-timeout=60000',
        ].join(' ');
      case 'remove':
        return 'npm uninstall -g @openai/codex';
    }
  }

  const hermes = inspectHermesRuntime();

  switch (action) {
    case 'install':
    case 'reinstall':
      return resolveHermesInstallCommand();
    case 'update':
      return hermes.binary ? `${hermes.binary.path} update` : null;
    case 'remove':
      return null;
  }
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
  const builtinCommand = resolveBuiltinEngineActionCommand(engineId, action);
  const manualNote =
    engineId === 'hermes' && action === 'remove'
      ? 'Hermes remove does not currently have a safe cross-platform uninstall command. Use the installer-specific removal path manually.'
      : `No built-in ${engineId} ${action} command is configured. Set ${buildEngineActionEnvKey(engineId, action)} to enable it.`;

  return resolveShellActionSpec(envOverride, builtinCommand, manualNote);
}
