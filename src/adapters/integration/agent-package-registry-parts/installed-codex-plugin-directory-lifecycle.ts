import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import {
  configuredCodexHome,
  internalPackageCodexHome,
} from './configured-codex-plugin-carrier-native.ts';
import type { CodexPluginCommandRunner } from './configured-codex-plugin-carrier.ts';
import {
  discoverCurrentOwnerPackageDescriptors,
  readInstalledPackageDescriptor,
  withCurrentOwnerProjection,
} from './installed-codex-plugin-directory-descriptor.ts';
import type { InstalledCarrierEntry } from './installed-codex-plugin-directory-types.ts';

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function parseInstalledCarrierEntries(
  value: string,
  packageId: string | null,
  includeAvailable = false,
): InstalledCarrierEntry[] {
  const parsed = parseJsonText(value);
  const readback = isRecord(parsed) ? parsed : null;
  if (!readback || !Array.isArray(readback.installed)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Installed Codex Plugin Manager readback has no installed array.',
      {
        package_id: packageId,
        failure_code: 'configured_codex_plugin_carrier_readback_invalid_shape',
      },
    );
  }
  const values = [
    ...readback.installed.map((entry) => ({ entry, installed: true })),
    ...(includeAvailable && Array.isArray(readback.available)
      ? readback.available.map((entry) => ({ entry, installed: false }))
      : []),
  ];
  const entries = values.flatMap(({ entry, installed }) => {
    if (!isRecord(entry)) return [];
    const pluginId = stringValue(entry.pluginId);
    const source = isRecord(entry.source) ? entry.source : null;
    const sourcePath = stringValue(source?.path);
    if (!pluginId || !sourcePath || !path.isAbsolute(sourcePath)) return [];
    const marketplace = isRecord(entry.marketplaceSource) ? entry.marketplaceSource : null;
    return [{
      pluginId,
      version: stringValue(entry.version),
      installed: entry.installed === true || installed,
      enabled: entry.enabled === true,
      sourcePath,
      sourceKind: stringValue(source?.source) ?? 'codex_plugin_manager',
      marketplaceSource: stringValue(marketplace?.source),
    }];
  });
  const byPluginId = new Map<string, InstalledCarrierEntry>();
  for (const entry of entries) {
    const previous = byPluginId.get(entry.pluginId);
    if (!previous || (!previous.installed && entry.installed)) byPluginId.set(entry.pluginId, entry);
  }
  return [...byPluginId.values()];
}

function defaultRunner(input: {
  binary: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}) {
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

export type CarrierDiscoveryInput = {
  packageId?: string | null;
  includeAvailable?: boolean;
  includeInternal?: boolean;
  binary?: string;
  env?: NodeJS.ProcessEnv;
  runner?: CodexPluginCommandRunner;
  failClosedOnCarrierError?: boolean;
};

export function readInstalledCarrierEntries(input: CarrierDiscoveryInput = {}) {
  const env = { ...process.env, ...input.env };
  const entries = readCarrierEntriesFromHome({ ...input, env });
  const internalHome = internalPackageCodexHome(env);
  if (input.includeInternal === false || internalHome === configuredCodexHome(env)
    || !fs.existsSync(path.join(internalHome, 'config.toml'))) return entries;

  const internalEntries = readCarrierEntriesFromHome({
    ...input,
    env: { ...env, CODEX_HOME: internalHome },
  });
  const owners = discoverCurrentOwnerPackageDescriptors(input);
  const byPluginId = new Map(entries.map((entry) => [entry.pluginId, entry]));
  for (const entry of internalEntries) {
    if (entry.installed === false) continue;
    const descriptor = readInstalledPackageDescriptor(entry);
    if (!descriptor) continue;
    const current = withCurrentOwnerProjection(descriptor, owners.get(descriptor.manifest.package_id));
    if (current.manifest.codex_interaction_mode !== 'headless_internal') continue;
    byPluginId.set(entry.pluginId, entry);
  }
  return [...byPluginId.values()];
}

function readCarrierEntriesFromHome(input: CarrierDiscoveryInput) {
  const configuredBinary = input.binary?.trim() || process.env.OPL_CODEX_PLUGIN_BIN?.trim() || null;
  const binary = configuredBinary ?? 'codex';
  const runner = input.runner ?? defaultRunner;
  const result = runner({
    binary,
    args: ['plugin', 'list', ...(input.includeAvailable ? ['--available'] : []), '--json'],
    env: { ...process.env, ...input.env },
  });
  if (result.status !== 0 || result.error) {
    const defaultCarrierAbsent = !configuredBinary
      && (result.error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
    if (defaultCarrierAbsent) {
      return [];
    }
    if (input.failClosedOnCarrierError) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Installed Codex Plugin Manager discovery did not complete.',
        {
          package_id: input.packageId ?? null,
          action: 'list',
          command: ['plugin', 'list', '--json'],
          exit_status: result.status,
          error: result.error?.message ?? null,
          stderr_present: Boolean(result.stderr.trim()),
          failure_code: result.error
            ? 'configured_codex_plugin_carrier_unavailable'
            : 'configured_codex_plugin_carrier_action_failed',
        },
      );
    }
    return [];
  }
  let entries: InstalledCarrierEntry[];
  try {
    entries = parseInstalledCarrierEntries(
      result.stdout,
      input.packageId ?? null,
      input.includeAvailable === true,
    );
  } catch (error) {
    if (input.failClosedOnCarrierError) {
      if (error instanceof FrameworkContractError) throw error;
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Installed Codex Plugin Manager discovery readback is invalid.',
        {
          package_id: input.packageId ?? null,
          failure_code: 'configured_codex_plugin_carrier_readback_invalid_shape',
        },
      );
    }
    return [];
  }
  return entries;
}
