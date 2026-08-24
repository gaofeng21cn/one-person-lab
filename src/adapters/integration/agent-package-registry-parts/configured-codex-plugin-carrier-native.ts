import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { PACKAGED_MODULE_MARKER_FILE } from '../packaged-module-marker.ts';
import type {
  ConfiguredCodexPluginCarrierAction,
  ConfiguredDownloadAttempt,
  ConfiguredDownloadResult,
  CodexPluginCommandResult,
  CodexPluginCommandRunner,
  CodexPluginListEntry,
  CodexPluginMarketplaceListEntry,
  ConfiguredCodexPluginCarrierObservedSource,
} from './configured-codex-plugin-carrier-types.ts';

const TRANSIENT_CURL_EXIT_STATUSES = new Set([5, 6, 7, 16, 18, 28, 35, 52, 55, 56, 92]);
const TRANSIENT_SPAWN_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETDOWN',
  'ENETRESET',
  'ENETUNREACH',
  'ETIMEDOUT',
]);

export function isTransientConfiguredDownloadFailure(
  result: Pick<ConfiguredDownloadAttempt, 'status' | 'stderr' | 'error'>,
) {
  if (result.status !== null && TRANSIENT_CURL_EXIT_STATUSES.has(result.status)) return true;
  if (result.status === 22
    && /curl:\s*\(22\).*\b(?:408|425|429|500|502|503|504)\b/i.test(result.stderr)) {
    return true;
  }
  const errorCode = (result.error as NodeJS.ErrnoException | null)?.code;
  return typeof errorCode === 'string' && TRANSIENT_SPAWN_ERROR_CODES.has(errorCode);
}

function waitForConfiguredDownloadRetry(delayMs: number) {
  const sleeper = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  Atomics.wait(sleeper, 0, 0, delayMs);
}

export function runConfiguredDownloadWithTransientRetry(
  attempt: () => ConfiguredDownloadAttempt,
  waitForRetry: (delayMs: number) => void = waitForConfiguredDownloadRetry,
): ConfiguredDownloadResult {
  let attemptCount = 1;
  let result = attempt();
  while (attemptCount < 3 && isTransientConfiguredDownloadFailure(result)) {
    waitForRetry(250 * (2 ** (attemptCount - 1)));
    attemptCount += 1;
    result = attempt();
  }
  return { ...result, attemptCount };
}

export function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function defaultRunner(input: {
  binary: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}): CodexPluginCommandResult {
  const result = spawnSync(input.binary, input.args, {
    encoding: 'utf8',
    env: input.env,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ?? null,
  };
}

export function createMemoizedCodexPluginListRunner(
  runner: CodexPluginCommandRunner = defaultRunner,
): CodexPluginCommandRunner {
  let pluginListReadback: CodexPluginCommandResult | undefined;
  return (input) => {
    if (input.args.length === 3
      && input.args[0] === 'plugin'
      && input.args[1] === 'list'
      && input.args[2] === '--json') {
      pluginListReadback ??= runner(input);
      return pluginListReadback;
    }
    return runner(input);
  };
}

export function commandFailure(input: {
  packageId: string;
  action: ConfiguredCodexPluginCarrierAction;
  args: string[];
  result: CodexPluginCommandResult;
}): never {
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Configured Codex Plugin Manager action did not complete.',
    {
      package_id: input.packageId,
      action: input.action,
      command: input.args,
      exit_status: input.result.status,
      error: input.result.error?.message ?? null,
      stderr_present: Boolean(input.result.stderr.trim()),
      failure_code: input.result.error
        ? 'configured_codex_plugin_carrier_unavailable'
        : 'configured_codex_plugin_carrier_action_failed',
    },
  );
}

export function parsePluginList(value: string, packageId: string): CodexPluginListEntry[] {
  const parsed = parseJsonText(value);
  const readback = isRecord(parsed) ? parsed : null;
  if (!readback || !Array.isArray(readback.installed)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Configured Codex Plugin Manager list readback has no installed array.',
      {
        package_id: packageId,
        failure_code: 'configured_codex_plugin_carrier_readback_invalid_shape',
      },
    );
  }
  return readback.installed.flatMap((value) => {
    const entry = isRecord(value) ? value : null;
    const pluginId = stringValue(entry?.pluginId);
    if (!entry || !pluginId) return [];
    const source = isRecord(entry.source) ? entry.source : null;
    const marketplaceSource = isRecord(entry.marketplaceSource) ? entry.marketplaceSource : null;
    return [{
      pluginId,
      version: stringValue(entry.version),
      installed: entry.installed === true,
      enabled: entry.enabled === true,
      sourcePath: stringValue(source?.path),
      marketplaceSource: stringValue(marketplaceSource?.source),
    }];
  });
}

function marketplaceListEntry(value: unknown): CodexPluginMarketplaceListEntry | null {
  if (!isRecord(value)) return null;
  const marketplaceSource = isRecord(value.marketplaceSource) ? value.marketplaceSource : null;
  return {
    name: stringValue(value.name),
    sourceType: stringValue(marketplaceSource?.sourceType),
    marketplaceSource: stringValue(marketplaceSource?.source),
  };
}

export function parseMarketplaceList(value: string, packageId: string): CodexPluginMarketplaceListEntry[] {
  const parsed = parseJsonText(value);
  const readback = isRecord(parsed) ? parsed : null;
  if (!readback || !Array.isArray(readback.marketplaces)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Configured Codex Plugin Manager marketplace readback has no marketplaces array.',
      {
        package_id: packageId,
        failure_code: 'configured_codex_plugin_carrier_marketplace_readback_invalid_shape',
      },
    );
  }
  return readback.marketplaces
    .map(marketplaceListEntry)
    .filter((entry): entry is CodexPluginMarketplaceListEntry => entry !== null);
}

export function pluginBareName(pluginId: string) {
  return pluginId.split('@', 1)[0] ?? pluginId;
}

export function sourceTreeSha256(sourcePath: string | null) {
  if (!sourcePath) return null;
  try {
    if (!fs.statSync(sourcePath).isDirectory()) return null;
    const hash = crypto.createHash('sha256');
    const visit = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
        const absolutePath = path.join(directory, entry.name);
        const relativePath = path.relative(sourcePath, absolutePath).split(path.sep).join('/');
        if (relativePath === PACKAGED_MODULE_MARKER_FILE || (entry.isDirectory() && entry.name === '__pycache__')) continue;
        const stat = fs.lstatSync(absolutePath);
        const mode = (stat.mode & 0o777).toString(8);
        if (entry.isDirectory()) {
          hash.update(`dir\0${relativePath}\0${mode}\0`);
          visit(absolutePath);
        } else if (entry.isSymbolicLink()) {
          hash.update(`symlink\0${relativePath}\0${mode}\0${fs.readlinkSync(absolutePath)}\0`);
        } else if (entry.isFile()) {
          const fileHash = crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
          hash.update(`file\0${relativePath}\0${mode}\0${fileHash}\0`);
        }
      }
    };
    visit(sourcePath);
    return hash.digest('hex');
  } catch {
    return null;
  }
}

export function observedSource(entry: CodexPluginListEntry): ConfiguredCodexPluginCarrierObservedSource {
  return {
    plugin_id: entry.pluginId,
    marketplace_source: entry.marketplaceSource,
    installed_version: entry.version,
    enabled: entry.enabled,
    plugin_source_path: entry.sourcePath,
    source_tree_sha256: sourceTreeSha256(entry.sourcePath),
  };
}

export function nativeArgs(action: ConfiguredCodexPluginCarrierAction, pluginId: string) {
  if (action === 'list') return ['plugin', 'list', '--json'];
  if (action === 'remove') return ['plugin', 'remove', pluginId, '--json'];
  if (action === 'enable' || action === 'disable') return ['plugin', 'list', '--json'];
  return ['plugin', 'add', pluginId, '--json'];
}

export function configuredCodexHome(env: NodeJS.ProcessEnv) {
  const configured = env.CODEX_HOME?.trim();
  if (configured) return path.resolve(configured);
  const home = env.HOME?.trim() || os.homedir();
  return path.join(path.resolve(home), '.codex');
}

export function localReadbackFailure(failureCode: string, message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, { ...details, failure_code: failureCode });
}

export function ensureConfiguredCodexHomeForMutation(env: NodeJS.ProcessEnv) {
  const codexHome = configuredCodexHome(env);
  try {
    fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(codexHome);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('not a real directory');
    fs.accessSync(codexHome, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
  } catch {
    localReadbackFailure(
      'configured_codex_plugin_carrier_codex_home_unavailable',
      'Configured Codex home cannot be initialized for a Package mutation.',
      { codex_home: codexHome },
    );
  }
}

export function marketplaceName(pluginId: string) {
  return pluginId.slice(pluginId.lastIndexOf('@') + 1);
}
