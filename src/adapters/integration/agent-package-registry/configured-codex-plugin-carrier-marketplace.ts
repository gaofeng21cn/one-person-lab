import path from 'node:path';

import {
  commandFailure,
  parseMarketplaceList,
  marketplaceName,
} from './configured-codex-plugin-carrier-native.ts';
import { sameMarketplaceSource } from './shared.ts';
import type {
  ConfiguredCodexPluginCarrierAction,
  CodexPluginCommandResult,
  CodexPluginCommandRunner,
  CodexPluginListEntry,
} from './configured-codex-plugin-carrier-types.ts';

const TRANSIENT_MARKETPLACE_SPAWN_CODES = new Set([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETDOWN',
  'ENETRESET',
  'ENETUNREACH',
  'ETIMEDOUT',
]);
const TRANSIENT_MARKETPLACE_STDERR_PATTERN = /SSL_ERROR_SYSCALL|HTTP2 framing|TLS|EOF|timed out|connection reset|unable to access|could not resolve host|RPC failed|curl:\s*\((?:5|6|7|16|18|28|35|52|55|56|92)\)/i;

function waitForMarketplaceUpgradeRetry(delayMs: number) {
  const sleeper = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  Atomics.wait(sleeper, 0, 0, delayMs);
}

/** Return true only for transient transport/network errors so deterministic failures still fail fast. */
export function isTransientMarketplaceUpgradeFailure(
  result: Pick<CodexPluginCommandResult, 'status' | 'stderr' | 'error'>,
): boolean {
  if (result.status === 0 && !result.error) return false;
  const errorCode = (result.error as NodeJS.ErrnoException | null)?.code;
  if (typeof errorCode === 'string' && TRANSIENT_MARKETPLACE_SPAWN_CODES.has(errorCode)) {
    return true;
  }
  return TRANSIENT_MARKETPLACE_STDERR_PATTERN.test(result.stderr || '');
}

function ensureMarketplaceArgs(source: string) {
  return ['plugin', 'marketplace', 'add', source, '--json'];
}
export function ensureMarketplaceAvailable(input: {
  packageId: string;
  action: ConfiguredCodexPluginCarrierAction;
  pluginId: string;
  marketplaceSource: string;
  binary: string;
  env: NodeJS.ProcessEnv;
  runner: CodexPluginCommandRunner;
  waitForRetry?: (delayMs: number) => void;
}) {
  const marketplaceListArgs = ['plugin', 'marketplace', 'list', '--json'];
  const marketplaceList = input.runner({
    binary: input.binary,
    args: marketplaceListArgs,
    env: input.env,
  });
  const marketplaces = marketplaceList.status === 0 && !marketplaceList.error
    ? parseMarketplaceList(marketplaceList.stdout, input.packageId)
    : [];
  const configuredMarketplace = marketplaces
    .find((entry) => (
      entry.name === marketplaceName(input.pluginId)
      && sameMarketplaceSource(entry.marketplaceSource, input.marketplaceSource)
    )) ?? null;
  if (configuredMarketplace) {
    if ((input.action !== 'update' && input.action !== 'repair')
      || configuredMarketplace.sourceType !== 'git') return;
    const upgradeArgs = [
      'plugin', 'marketplace', 'upgrade',
      configuredMarketplace.name ?? marketplaceName(input.pluginId),
      '--json',
    ];
    const waitForRetry = input.waitForRetry ?? waitForMarketplaceUpgradeRetry;
    let attemptCount = 1;
    let upgradeResult = input.runner({
      binary: input.binary,
      args: upgradeArgs,
      env: input.env,
    });
    while (attemptCount < 3 && isTransientMarketplaceUpgradeFailure(upgradeResult)) {
      waitForRetry(250 * (2 ** (attemptCount - 1)));
      attemptCount += 1;
      upgradeResult = input.runner({
        binary: input.binary,
        args: upgradeArgs,
        env: input.env,
      });
    }
    if (upgradeResult.status !== 0 || upgradeResult.error) {
      commandFailure({
        packageId: input.packageId,
        action: input.action,
        args: upgradeArgs,
        result: upgradeResult,
      });
    }
    return;
  }

  const expectedMarketplaceName = marketplaceName(input.pluginId);
  const replacedMarketplace = path.isAbsolute(input.marketplaceSource)
    ? marketplaces.find((entry) => (
      entry.name === expectedMarketplaceName
      && entry.sourceType === 'git'
      && entry.marketplaceSource
      && !sameMarketplaceSource(entry.marketplaceSource, input.marketplaceSource)
    )) ?? null
    : null;
  if (replacedMarketplace) {
    const removeArgs = ['plugin', 'marketplace', 'remove', expectedMarketplaceName, '--json'];
    const removeResult = input.runner({
      binary: input.binary,
      args: removeArgs,
      env: input.env,
    });
    if (removeResult.status !== 0 || removeResult.error) {
      commandFailure({
        packageId: input.packageId,
        action: input.action,
        args: removeArgs,
        result: removeResult,
      });
    }
  }

  const marketplaceArgs = ensureMarketplaceArgs(input.marketplaceSource);
  const marketplaceResult = input.runner({
    binary: input.binary,
    args: marketplaceArgs,
    env: input.env,
  });
  if (marketplaceResult.status !== 0 || marketplaceResult.error) {
    if (replacedMarketplace?.marketplaceSource) {
      input.runner({
        binary: input.binary,
        args: ensureMarketplaceArgs(replacedMarketplace.marketplaceSource),
        env: input.env,
      });
    }
    commandFailure({
      packageId: input.packageId,
      action: input.action,
      args: marketplaceArgs,
      result: marketplaceResult,
    });
  }
}

export function removeUnusedMarketplaces(input: {
  packageId: string;
  action: ConfiguredCodexPluginCarrierAction;
  marketplaceNames: string[];
  installedEntries: CodexPluginListEntry[];
  binary: string;
  env: NodeJS.ProcessEnv;
  runner: CodexPluginCommandRunner;
}) {
  const usedMarketplaceNames = new Set(
    input.installedEntries
      .filter((entry) => entry.installed)
      .map((entry) => marketplaceName(entry.pluginId)),
  );
  const candidates = [...new Set(input.marketplaceNames)]
    .filter((name) => name && !usedMarketplaceNames.has(name));
  if (candidates.length === 0) return;

  const listArgs = ['plugin', 'marketplace', 'list', '--json'];
  const listResult = input.runner({ binary: input.binary, args: listArgs, env: input.env });
  if (listResult.status !== 0 || listResult.error) {
    commandFailure({
      packageId: input.packageId,
      action: input.action,
      args: listArgs,
      result: listResult,
    });
  }
  const configuredNames = new Set(
    parseMarketplaceList(listResult.stdout, input.packageId)
      .map((entry) => entry.name)
      .filter((name): name is string => name !== null),
  );
  for (const name of candidates) {
    if (!configuredNames.has(name)) continue;
    const removeArgs = ['plugin', 'marketplace', 'remove', name, '--json'];
    const removeResult = input.runner({ binary: input.binary, args: removeArgs, env: input.env });
    if (removeResult.status !== 0 || removeResult.error) {
      commandFailure({
        packageId: input.packageId,
        action: input.action,
        args: removeArgs,
        result: removeResult,
      });
    }
  }
}
