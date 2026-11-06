import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { gitMarketplaceRuntimeRoot } from '../../kernel/git-marketplace-runtime-root.ts';
import { readStandardAgentDescriptorInterface } from '../../kernel/standard-agent-interface.ts';
import {
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
  type StandardDomainAgentRegistryEntry,
} from '../../kernel/standard-agent-registry.ts';
import {
  discoverPackageDescriptors,
  type InstalledPackageDescriptor,
} from './agent-package-registry-parts/installed-codex-plugin-directory.ts';

let turnDescriptors: Map<string, InstalledPackageDescriptor> | null = null;
function discoverForCurrentTurn() {
  // Synchronous lookups and Promise continuations in one event-loop turn share
  // one native readback. Expiring at every microtask made one action repeatedly
  // spawn the carrier CLI. Release at the next event-loop turn; launch readiness
  // still comes from its own fresh Package readback, not this identity snapshot.
  if (!turnDescriptors) {
    // Identity discovery only needs carrier descriptors. Project-local
    // capability inspection can initialize module state and is not part of a
    // read-only Agent membership lookup.
    turnDescriptors = discoverPackageDescriptors();
    setImmediate(() => { turnDescriptors = null; });
  }
  return turnDescriptors;
}

export function listInstalledStandardAgentEntries(
  discover: () => Map<string, InstalledPackageDescriptor> = discoverForCurrentTurn,
): StandardDomainAgentRegistryEntry[] {
  return [...discover().values()].flatMap((installed) => {
    const manifest = installed.manifest;
    if (!installed.readiness.installed || manifest.package_role !== 'standard_agent') return [];
    // Published entries retain their compatibility aliases. Installed discovery
    // admits new identities without introducing another publication catalog.
    if (STANDARD_AGENT_REGISTRY.some((entry) => entry.agent_id === manifest.package_id)) return [];
    const root = installed.marketplaceSource
      ? gitMarketplaceRuntimeRoot(installed.sourcePath, installed.marketplaceSource, 'contracts/domain_descriptor.json')
        ?? installed.sourcePath
      : installed.sourcePath;
    const descriptor = readStandardAgentDescriptorInterface(root);
    if (!descriptor) return [];
    if (manifest.agent_id !== manifest.package_id
      || (descriptor.agent_id && descriptor.agent_id !== manifest.agent_id)
      || (descriptor.package_id && descriptor.package_id !== manifest.package_id)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Installed Standard Agent identity does not match its Package.', {
        package_id: manifest.package_id,
        descriptor_ref: path.join(root, 'contracts/domain_descriptor.json'),
      });
    }
    const agentId = manifest.package_id;
    const pluginName = installed.pluginId.split('@', 1)[0];
    const project = manifest.source_repo
      ? path.basename(manifest.source_repo.replace(/\/$/, '')).replace(/\.git$/, '')
      : pluginName;
    const domainId = descriptor.domain_id;
    const targetDomainId = descriptor.interface.runtime.runtime_domain_id;
    const aliases = [...new Set([agentId, domainId, targetDomainId, project, pluginName,
      ...descriptor.interface.routing.explicit_aliases])];
    return [{
      agent_id: agentId,
      domain_id: domainId,
      target_domain_id: targetDomainId,
      label: manifest.display_name,
      short_label: agentId.toUpperCase(),
      display_name: manifest.display_name,
      series_membership: STANDARD_AGENT_SERIES_MEMBERSHIP,
      project,
      module_id: targetDomainId.toUpperCase(),
      plugin_name: pluginName,
      canonical_plugin_name: agentId,
      aliases,
      owner_id: project,
      owner_aliases: aliases,
    }];
  });
}
