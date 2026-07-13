import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';

export type ExternalDependencyCurrentness = 'current' | 'update_available' | 'unknown' | 'missing';
export type ExternalDependencyUpdateMode = 'explicit_owner_delegated' | 'detect_only_guidance';
export type ExternalDependencyOwner = 'homebrew_formula' | 'homebrew_cask' | 'global_npm' | 'global_path' | 'missing';

export type ExternalDependencyUpdateAction = {
  action_id: string;
  label: string;
  surface: 'opl app action execute';
  delegated_surface: string;
  payload_fields: [];
  confirmation_required: true;
  danger_level: 'medium';
  owner_kind: 'homebrew_formula' | 'homebrew_cask' | 'global_npm';
  auto_apply_allowed: false;
};

export type ExternalDependencyInstallation = {
  dependency_id: 'codex-cli' | 'temporal-system-cli';
  installed: boolean;
  binary_path: string | null;
  version: string | null;
  latest_version: string | null;
  currentness: ExternalDependencyCurrentness;
  ownership: ExternalDependencyOwner;
  update_mode: ExternalDependencyUpdateMode;
  update_action: ExternalDependencyUpdateAction | null;
  guidance: string;
};

type ParsedVersion = { version: string; parts: [number, number, number] };
const OWNER_PROBE_TIMEOUT_MS = 3_000;
let delegatedActionCache: { key: string; expiresAt: number; actions: ExternalDependencyUpdateAction[] } | null = null;

function parseVersion(value: string | null | undefined): ParsedVersion | null {
  const match = value?.match(/(?:^|[^0-9])(\d+)\.(\d+)\.(\d+)(?:[^0-9]|$)/);
  if (!match) return null;
  return {
    version: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`,
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
  };
}

function compareVersions(left: ParsedVersion, right: ParsedVersion) {
  for (let index = 0; index < left.parts.length; index += 1) {
    const difference = left.parts[index] - right.parts[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

function currentness(current: string | null, latest: string | null): ExternalDependencyCurrentness {
  const parsedCurrent = parseVersion(current);
  const parsedLatest = parseVersion(latest);
  if (!current) return 'missing';
  if (!parsedCurrent || !parsedLatest) return 'unknown';
  return compareVersions(parsedCurrent, parsedLatest) >= 0 ? 'current' : 'update_available';
}

function findExecutable(command: string) {
  const names = process.platform === 'win32' ? [command, `${command}.exe`] : [command];
  for (const entry of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const name of names) {
      const candidate = path.join(entry, name);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
  }
  return null;
}

function realPath(filePath: string) {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

function run(command: string, args: string[], timeout = 5_000) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    env: { ...process.env, HOMEBREW_NO_AUTO_UPDATE: '1' },
    stdio: 'pipe',
    timeout,
  });
}

function output(command: string, args: string[], timeout?: number) {
  const result = run(command, args, timeout);
  if (result.status !== 0) return null;
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim() || null;
}

function brewBinary() {
  const configured = process.env.OPL_HOMEBREW_BIN?.trim();
  return configured && fs.existsSync(configured) ? configured : findExecutable('brew');
}

function npmBinary() {
  const configured = process.env.OPL_NPM_BIN?.trim();
  return configured && fs.existsSync(configured) ? configured : findExecutable('npm');
}

function isHomebrewFormulaOwner(binaryPath: string, formula: string) {
  const brew = brewBinary();
  if (!brew) return false;
  const resolved = realPath(binaryPath);
  const pathMatches = resolved.includes(`${path.sep}Cellar${path.sep}${formula}${path.sep}`)
    || resolved.includes(`${path.sep}homebrew${path.sep}opt${path.sep}${formula}${path.sep}`);
  if (!pathMatches) return false;
  return Boolean(output(brew, ['list', '--formula', '--versions', formula], OWNER_PROBE_TIMEOUT_MS)?.split(/\s+/).includes(formula));
}

function isHomebrewCaskOwner(binaryPath: string, cask: string) {
  const brew = brewBinary();
  if (!brew) return false;
  const resolved = realPath(binaryPath);
  const pathMatches = resolved.includes(`${path.sep}Caskroom${path.sep}${cask}${path.sep}`)
    || resolved.includes(`${path.sep}${cask[0].toUpperCase()}${cask.slice(1)}.app${path.sep}`);
  if (!pathMatches) return false;
  return Boolean(output(brew, ['list', '--cask', '--versions', cask], OWNER_PROBE_TIMEOUT_MS)?.split(/\s+/).includes(cask));
}

function isGlobalNpmCodexOwner(binaryPath: string) {
  const npm = npmBinary();
  if (!npm) return false;
  const resolved = realPath(binaryPath);
  const marker = `${path.sep}node_modules${path.sep}@openai${path.sep}codex${path.sep}`;
  const markerIndex = resolved.indexOf(marker);
  if (markerIndex >= 0) {
    const packageRoot = resolved.slice(0, markerIndex + marker.length - 1);
    return fs.existsSync(path.join(packageRoot, 'package.json'));
  }
  return false;
}

function updateAction(
  dependencyId: ExternalDependencyInstallation['dependency_id'],
  owner: 'homebrew_formula' | 'homebrew_cask' | 'global_npm',
): ExternalDependencyUpdateAction {
  const codex = dependencyId === 'codex-cli';
  return {
    action_id: owner === 'global_npm'
      ? 'external_codex_update_global_npm'
      : owner === 'homebrew_cask'
        ? 'external_codex_update_homebrew_cask'
        : codex ? 'external_codex_update_homebrew' : 'external_temporal_update_homebrew',
    label: owner === 'global_npm'
      ? 'Update external Codex with npm'
      : `Update external ${codex ? 'Codex' : 'Temporal CLI'} with Homebrew`,
    surface: 'opl app action execute',
    delegated_surface: owner === 'global_npm'
      ? 'npm install --global @openai/codex@latest'
      : owner === 'homebrew_cask'
        ? 'brew upgrade --cask codex'
        : `brew upgrade ${codex ? 'codex' : 'temporal'}`,
    payload_fields: [],
    confirmation_required: true,
    danger_level: 'medium',
    owner_kind: owner,
    auto_apply_allowed: false,
  };
}

export function inspectExternalCodexInstallation(input: {
  binaryPath: string;
  version: string | null;
  latestVersion: string | null;
}): ExternalDependencyInstallation {
  const owner: ExternalDependencyOwner = isHomebrewFormulaOwner(input.binaryPath, 'codex')
    ? 'homebrew_formula'
    : isHomebrewCaskOwner(input.binaryPath, 'codex')
      ? 'homebrew_cask'
    : isGlobalNpmCodexOwner(input.binaryPath)
      ? 'global_npm'
      : 'global_path';
  const action = owner === 'homebrew_formula' || owner === 'homebrew_cask' || owner === 'global_npm'
    ? updateAction('codex-cli', owner)
    : null;
  return {
    dependency_id: 'codex-cli',
    installed: true,
    binary_path: input.binaryPath,
    version: parseVersion(input.version)?.version ?? input.version,
    latest_version: parseVersion(input.latestVersion)?.version ?? input.latestVersion,
    currentness: currentness(input.version, input.latestVersion),
    ownership: owner,
    update_mode: action ? 'explicit_owner_delegated' : 'detect_only_guidance',
    update_action: action,
    guidance: action
      ? `OPL can ask ${owner === 'global_npm' ? 'global npm' : 'Homebrew'} to update this installation after explicit confirmation.`
      : 'Update this Codex CLI with the installer or package manager that originally created the selected PATH binary.',
  };
}

function latestTemporalVersion(brew: string) {
  const configured = process.env.OPL_TEMPORAL_CLI_LATEST_VERSION?.trim();
  if (configured) return parseVersion(configured)?.version ?? configured;
  const raw = output(brew, ['info', '--json=v2', 'temporal']);
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as { formulae?: Array<{ versions?: { stable?: unknown } }> };
    const stable = payload.formulae?.[0]?.versions?.stable;
    return typeof stable === 'string' ? parseVersion(stable)?.version ?? stable : null;
  } catch {
    return null;
  }
}

export function inspectExternalTemporalInstallation(
  options: { refreshLatest?: boolean; inspectVersion?: boolean } = {},
): ExternalDependencyInstallation {
  const binaryPath = process.env.OPL_TEMPORAL_BIN?.trim() || findExecutable('temporal');
  if (!binaryPath) {
    return {
      dependency_id: 'temporal-system-cli', installed: false, binary_path: null, version: null, latest_version: null,
      currentness: 'missing', ownership: 'missing', update_mode: 'detect_only_guidance', update_action: null,
      guidance: 'No system Temporal CLI was detected. OPL-managed Temporal SDK runtime remains part of the OPL Base generation.',
    };
  }
  const version = options.inspectVersion === false ? null : output(binaryPath, ['--version']);
  const brew = brewBinary();
  const owner = brew && isHomebrewFormulaOwner(binaryPath, 'temporal') ? 'homebrew_formula' : 'global_path';
  const latest = owner === 'homebrew_formula' && brew && options.refreshLatest ? latestTemporalVersion(brew) : null;
  const action = owner === 'homebrew_formula' ? updateAction('temporal-system-cli', owner) : null;
  return {
    dependency_id: 'temporal-system-cli', installed: true, binary_path: binaryPath,
    version: parseVersion(version)?.version ?? version,
    latest_version: latest,
    currentness: currentness(version, latest),
    ownership: owner,
    update_mode: action ? 'explicit_owner_delegated' : 'detect_only_guidance',
    update_action: action,
    guidance: action
      ? 'OPL can ask Homebrew to update this Temporal CLI after explicit confirmation.'
      : 'OPL cannot prove the installer owner for this Temporal CLI; update it through its original installer. Remote Temporal Server currentness is not inferred.',
  };
}

export function listExternalOwnerDelegatedUpdateActions() {
  const cacheKey = [process.env.PATH, process.env.OPL_CODEX_BIN, process.env.OPL_TEMPORAL_BIN, process.env.OPL_HOMEBREW_BIN, process.env.OPL_NPM_BIN].join('\0');
  if (delegatedActionCache?.key === cacheKey
    && delegatedActionCache.expiresAt > Date.now()) {
    return delegatedActionCache.actions;
  }
  const actions = new Map<string, ExternalDependencyUpdateAction>();
  const codexPaths = [process.env.OPL_CODEX_BIN?.trim() || null, findExecutable('codex')].filter((value): value is string => Boolean(value));
  for (const binaryPath of codexPaths) {
    const installation = inspectExternalCodexInstallation({ binaryPath, version: null, latestVersion: null });
    if (installation.update_action) actions.set(installation.update_action.action_id, installation.update_action);
  }
  const temporal = inspectExternalTemporalInstallation({ inspectVersion: false });
  if (temporal.update_action) actions.set(temporal.update_action.action_id, temporal.update_action);
  const result = [...actions.values()];
  delegatedActionCache = { key: cacheKey, expiresAt: Date.now() + 30_000, actions: result };
  return result;
}

export function runExternalOwnerDelegatedUpdate(actionId: string, dryRun: boolean) {
  const action = listExternalOwnerDelegatedUpdateActions().find((candidate) => candidate.action_id === actionId);
  if (!action) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `External dependency action ${actionId} is unavailable because its installer owner could not be verified.`,
      { action_id: actionId, policy: 'detect_only_guidance_without_verified_owner' },
    );
  }
  const command = action.owner_kind === 'global_npm' ? npmBinary() : brewBinary();
  if (!command) {
    throw new FrameworkContractError('surface_not_found', `Verified owner command is unavailable for ${actionId}.`, {
      action_id: actionId,
      owner_kind: action.owner_kind,
    });
  }
  const args = action.owner_kind === 'global_npm'
    ? ['install', '--global', '@openai/codex@latest']
    : action.owner_kind === 'homebrew_cask'
      ? ['upgrade', '--cask', 'codex']
      : ['upgrade', actionId.includes('temporal') ? 'temporal' : 'codex'];
  if (dryRun) {
    return {
      external_dependency_update: {
        surface_kind: 'opl_external_dependency_owner_delegated_update.v1',
        action_id: actionId,
        status: 'dry_run',
        owner_kind: action.owner_kind,
        command_preview: [command, ...args],
        confirmation_required: true,
        auto_apply_allowed: false,
      },
    };
  }
  const result = run(command, args, 120_000);
  return {
    external_dependency_update: {
      surface_kind: 'opl_external_dependency_owner_delegated_update.v1',
      action_id: actionId,
      status: result.status === 0 ? 'completed' : 'failed',
      owner_kind: action.owner_kind,
      exit_code: result.status,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      confirmation_required: true,
      auto_apply_allowed: false,
    },
  };
}
