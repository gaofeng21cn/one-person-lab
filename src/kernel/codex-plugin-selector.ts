import { resolveStandardAgent } from './standard-agent-registry.ts';

/**
 * Return the configured selector and the canonical local wrapper accepted for
 * one package. This pure identity rule belongs to the kernel so execution can
 * validate a carrier without importing the integration implementation.
 */
export function acceptedConfiguredCodexPluginIds(packageId: string, declaredPluginId: string) {
  const pluginName = declaredPluginId.split('@', 1)[0];
  const agent = resolveStandardAgent(packageId);
  const marketplaceId = agent?.plugin_name === pluginName ? `${agent.project}-local` : null;
  return new Set([
    declaredPluginId,
    ...(marketplaceId ? [`${pluginName}@${marketplaceId}`] : []),
  ]);
}
