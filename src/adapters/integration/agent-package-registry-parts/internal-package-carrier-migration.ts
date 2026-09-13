import fs from 'node:fs';
import path from 'node:path';

import { materializeLocalCodexPluginMarketplace } from '../system-installation/codex-plugin-registry.ts';
import {
  discoverCurrentOwnerPackageDescriptors,
  discoverInstalledPackageDescriptors,
  installedDescriptorMatchesConfiguredCarrier,
} from './installed-codex-plugin-directory.ts';
import { runConfiguredCodexPluginCarrier } from './configured-codex-plugin-carrier.ts';
import {
  commandFailure,
  configuredCodexHome,
  defaultRunner,
  internalPackageCodexHome,
  marketplaceName,
  nativeArgs,
  parsePluginList,
  pluginBareName,
  sourceTreeSha256,
} from './configured-codex-plugin-carrier-native.ts';
import type { CodexPluginCommandRunner } from './configured-codex-plugin-carrier-types.ts';

/** Move only owner-declared internal Packages; native Codex remains the lifecycle owner. */
export function reconcileInternalPackageCarriers(input: {
  env?: NodeJS.ProcessEnv;
  binary?: string;
  runner?: CodexPluginCommandRunner;
} = {}) {
  const env = { ...process.env, ...input.env };
  const internalHome = internalPackageCodexHome(env);
  const items: Array<{ package_id: string; status: 'migrated' | 'attention_required'; reason: string | null }> = [];
  if (configuredCodexHome(env) === internalHome) return { status: 'completed', items };
  const binary = input.binary?.trim() || env.OPL_CODEX_PLUGIN_BIN?.trim() || 'codex';
  const runner = input.runner ?? defaultRunner;
  const owners = discoverCurrentOwnerPackageDescriptors();
  const installed = discoverInstalledPackageDescriptors({
    env, binary, runner, includeInternal: false, failClosedOnCarrierError: true,
  });

  for (const [packageId, legacy] of installed) {
    const owner = owners.get(packageId);
    if (owner?.manifest.codex_interaction_mode !== 'headless_internal'
      || !legacy.readiness.installed
      || !installedDescriptorMatchesConfiguredCarrier(legacy)
      || legacy.carrier_readback.kind === 'project_local_owner_projection') continue;
    try {
      if (legacy.manifest.codex_interaction_mode !== 'headless_internal') {
        throw new Error('Update this legacy Package to its declared internal interaction policy before migrating.');
      }
      const originalDigest = sourceTreeSha256(legacy.sourcePath);
      if (!originalDigest) throw new Error('Legacy Package source is unavailable; preserve the original installation.');
      const marketplaceId = marketplaceName(legacy.pluginId);
      const pluginId = pluginBareName(legacy.pluginId);
      const marketplaceRoot = path.join(path.dirname(internalHome), 'codex-plugin-marketplaces', marketplaceId);
      const target = path.join(marketplaceRoot, 'plugins', pluginId);
      if (fs.existsSync(target)) {
        if (sourceTreeSha256(target) !== originalDigest) {
          throw new Error('Internal Package source differs from the legacy installation; preserve both for repair.');
        }
      } else {
        // The old native source remains available throughout copy and installation.
        materializeLocalCodexPluginMarketplace({
          marketplace_id: marketplaceId, plugin_id: pluginId,
          display_name: legacy.manifest.display_name, category: 'Productivity',
        }, legacy.sourcePath, marketplaceRoot);
      }
      if (sourceTreeSha256(target) !== originalDigest) throw new Error('Internal Package copy differs from its source.');
      const descriptor = {
        ...legacy.carrier,
        interactionMode: 'headless_internal' as const,
        carrier: { ...legacy.carrier.carrier, pluginId: legacy.pluginId, marketplaceSource: marketplaceRoot },
      };
      const readback = runConfiguredCodexPluginCarrier({ descriptor, action: 'repair', env, binary, runner });
      if (readback.status !== 'installed' || readback.enabled !== false
        || readback.executor.status !== 'callable' || sourceTreeSha256(target) !== originalDigest) {
        throw new Error('Internal native installation is not callable; preserve the original installation.');
      }
      const discovered = discoverInstalledPackageDescriptors({
        env: { ...env, CODEX_HOME: internalHome }, binary, runner, includeInternal: false,
        failClosedOnCarrierError: true,
      }).get(packageId);
      if (!discovered?.readiness.installed
        || fs.realpathSync(discovered.sourcePath) !== fs.realpathSync(target)) {
        throw new Error('Internal installed Package descriptor is unavailable; preserve the original installation.');
      }
      if (sourceTreeSha256(legacy.sourcePath) !== originalDigest) {
        throw new Error('Legacy Package changed during migration; preserve the original installation.');
      }
      const removeArgs = nativeArgs('remove', legacy.pluginId);
      const removal = runner({ binary, args: removeArgs, env });
      if (removal.status !== 0 || removal.error) {
        commandFailure({ packageId, action: 'remove', args: removeArgs, result: removal });
      }
      const listed = runner({ binary, args: nativeArgs('list', legacy.pluginId), env });
      if (listed.status !== 0 || listed.error) {
        commandFailure({ packageId, action: 'list', args: nativeArgs('list', legacy.pluginId), result: listed });
      }
      if (parsePluginList(listed.stdout, packageId).some((entry) => entry.pluginId === legacy.pluginId && entry.installed)) {
        throw new Error('Legacy native installation remains after removal.');
      }
      items.push({ package_id: packageId, status: 'migrated', reason: null });
    } catch (error) {
      items.push({ package_id: packageId, status: 'attention_required', reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { status: items.some((item) => item.status === 'attention_required') ? 'attention_required' : 'completed', items };
}
