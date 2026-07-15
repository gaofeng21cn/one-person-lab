import fs from 'node:fs';
import path from 'node:path';

import {
  readStandardAgentDescriptorInterface,
  type StandardAgentDescriptorInterface,
} from '../../kernel/standard-agent-interface.ts';
import {
  resolveStandardAgent,
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../kernel/standard-agent-registry.ts';
import { runOplAgentPackageStatus } from './agent-package-registry.ts';
import { inspectOplModule } from './system-installation/modules.ts';
import type { ModuleInspection } from './system-installation/shared.ts';

type PackageStatusReader = typeof runOplAgentPackageStatus;
type SelectedModuleSource = Pick<
  ModuleInspection,
  'installed' | 'install_origin' | 'checkout_path' | 'health_status'
>;
type SelectedModuleSourceReader = (moduleId: string) => SelectedModuleSource | null;

export type StandardAgentContractCheckout = {
  agent_id: string;
  domain_id: string;
  target_domain_id: string;
  package_id: string;
  checkout_path: string;
  install_origin: SelectedModuleSource['install_origin'] | 'package_status';
  source_kind: 'opl_selected_developer_checkout' | 'opl_managed_package_checkout';
};

export type StandardAgentProgressDeltaKeySet = {
  deliverable: string[];
  platform: string[];
};

function normalizedIdentity(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function registryIdentities(entry: typeof STANDARD_AGENT_REGISTRY[number]) {
  return [
    entry.agent_id,
    entry.domain_id,
    entry.target_domain_id,
    entry.project,
    entry.plugin_name,
    ...entry.aliases,
  ];
}

function descriptorMatchesAgent(
  descriptor: StandardAgentDescriptorInterface,
  agent: typeof STANDARD_AGENT_REGISTRY[number],
) {
  const expectedDomains = registryIdentities(agent).map(normalizedIdentity);
  return [descriptor.domain_id, descriptor.interface.runtime.runtime_domain_id]
    .map(normalizedIdentity)
    .some((domainId) => expectedDomains.includes(domainId));
}

function descriptorMatchesTarget(
  descriptor: StandardAgentDescriptorInterface,
  target: string,
) {
  return [descriptor.domain_id, descriptor.interface.runtime.runtime_domain_id]
    .map(normalizedIdentity)
    .includes(target);
}

function packageIdsForAliases(packageIds: readonly string[]) {
  const requested = new Set(packageIds.map(normalizedIdentity));
  return STANDARD_AGENT_REGISTRY
    .filter((entry) => entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP)
    .filter((entry) => registryIdentities(entry)
      .some((alias) => requested.has(normalizedIdentity(alias))))
    .map((entry) => entry.agent_id);
}

function currentCheckoutFromStatus(
  packageId: string,
  readStatus: PackageStatusReader,
): string | null {
  let status: ReturnType<PackageStatusReader>['opl_agent_package_status'];
  try {
    status = readStatus({ packageId, recoverRuntimeSource: false }).opl_agent_package_status;
  } catch {
    return null;
  }
  const dependencies = status.package_dependency_readiness;
  const source = status.runtime_source_readiness;
  if (
    status.installed_package_count < 1
    || dependencies?.operational_ready !== true
    || source?.status !== 'current'
    || source.operational_ready !== true
    || typeof source.checkout_path !== 'string'
    || !source.checkout_path.trim()
    || source.expected_tree_sha256 !== source.actual_tree_sha256
  ) return null;
  return source.checkout_path;
}

function currentDescriptorFromStatus(
  packageId: string,
  readStatus: PackageStatusReader,
): StandardAgentDescriptorInterface | null {
  const checkoutPath = currentCheckoutFromStatus(packageId, readStatus);
  return checkoutPath ? readStandardAgentDescriptorInterface(checkoutPath) : null;
}

function pathsReferToSameLocation(left: string, right: string) {
  const canonicalPath = (value: string) => {
    try {
      return fs.realpathSync(value);
    } catch {
      return path.resolve(value);
    }
  };
  return canonicalPath(left) === canonicalPath(right);
}

function canonicalCheckoutPath(value: string) {
  try {
    const resolved = fs.realpathSync.native(value);
    return fs.statSync(resolved).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

function defaultSelectedModuleSource(moduleId: string): SelectedModuleSource {
  return inspectOplModule(moduleId, { profile: 'fast' });
}

function checkoutFromSelectedModule(
  agent: typeof STANDARD_AGENT_REGISTRY[number],
  readStatus: PackageStatusReader,
  readSelectedModule: SelectedModuleSourceReader,
) {
  const selected = readSelectedModule(agent.domain_id);
  if (!selected) {
    return { source_selected: false as const, checkout_path: null, install_origin: null };
  }
  if (!selected.installed && selected.health_status === 'missing') {
    return { source_selected: false as const, checkout_path: null, install_origin: selected.install_origin };
  }
  if (!selected.installed || selected.health_status === 'invalid_checkout') {
    return { source_selected: true as const, checkout_path: null, install_origin: selected.install_origin };
  }

  if (selected.install_origin === 'managed_root') {
    const readyCheckout = currentCheckoutFromStatus(agent.agent_id, readStatus);
    if (!readyCheckout || !pathsReferToSameLocation(readyCheckout, selected.checkout_path)) {
      return { source_selected: true as const, checkout_path: null, install_origin: selected.install_origin };
    }
  }

  return {
    source_selected: true as const,
    checkout_path: canonicalCheckoutPath(selected.checkout_path),
    install_origin: selected.install_origin,
  };
}

function descriptorFromSelectedModule(
  agent: typeof STANDARD_AGENT_REGISTRY[number],
  readStatus: PackageStatusReader,
  readSelectedModule: SelectedModuleSourceReader,
) {
  const selected = checkoutFromSelectedModule(agent, readStatus, readSelectedModule);
  return {
    source_selected: selected.source_selected,
    descriptor: selected.checkout_path
      ? readStandardAgentDescriptorInterface(selected.checkout_path)
      : null,
  };
}

export function resolveStandardAgentContractCheckout(
  domainId: string,
  readStatus: PackageStatusReader = runOplAgentPackageStatus,
  readSelectedModule: SelectedModuleSourceReader = defaultSelectedModuleSource,
): StandardAgentContractCheckout | null {
  const agent = resolveStandardAgent(domainId);
  if (!agent || agent.series_membership !== STANDARD_AGENT_SERIES_MEMBERSHIP) {
    return null;
  }

  const selected = checkoutFromSelectedModule(agent, readStatus, readSelectedModule);
  if (selected.source_selected) {
    return selected.checkout_path
      ? {
          agent_id: agent.agent_id,
          domain_id: agent.domain_id,
          target_domain_id: agent.target_domain_id,
          package_id: agent.agent_id,
          checkout_path: selected.checkout_path,
          install_origin: selected.install_origin,
          source_kind: selected.install_origin === 'managed_root'
            ? 'opl_managed_package_checkout'
            : 'opl_selected_developer_checkout',
        }
      : null;
  }

  const packageCheckout = currentCheckoutFromStatus(agent.agent_id, readStatus);
  const checkoutPath = packageCheckout ? canonicalCheckoutPath(packageCheckout) : null;
  return checkoutPath
    ? {
        agent_id: agent.agent_id,
        domain_id: agent.domain_id,
        target_domain_id: agent.target_domain_id,
        package_id: agent.agent_id,
        checkout_path: checkoutPath,
        install_origin: 'package_status',
        source_kind: 'opl_managed_package_checkout',
      }
    : null;
}

export function readPackageManagedStandardAgentDescriptor(
  packageIds: readonly string[],
  readStatus: PackageStatusReader = runOplAgentPackageStatus,
): StandardAgentDescriptorInterface | null {
  for (const packageId of packageIdsForAliases(packageIds)) {
    const descriptor = currentDescriptorFromStatus(packageId, readStatus);
    if (descriptor) return descriptor;
  }
  return null;
}

function configuredDescriptors() {
  const configuredRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT?.trim();
  if (!configuredRoot || !fs.existsSync(configuredRoot)) return [];
  return fs.readdirSync(configuredRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readStandardAgentDescriptorInterface(path.join(configuredRoot, entry.name)))
    .filter((entry): entry is StandardAgentDescriptorInterface => entry !== null);
}

export function readStandardAgentDescriptorForDomain(
  domainId: string,
  readStatus: PackageStatusReader = runOplAgentPackageStatus,
  readSelectedModule: SelectedModuleSourceReader = defaultSelectedModuleSource,
): StandardAgentDescriptorInterface | null {
  const target = normalizedIdentity(domainId);
  const standardAgents = STANDARD_AGENT_REGISTRY.filter((agent) =>
    agent.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP
  );
  const directMatches = standardAgents.filter((agent) =>
    registryIdentities(agent).some((identity) => normalizedIdentity(identity) === target)
  );
  for (const agent of directMatches) {
    const selected = descriptorFromSelectedModule(agent, readStatus, readSelectedModule);
    if (!selected.source_selected) continue;
    if (selected.descriptor && descriptorMatchesAgent(selected.descriptor, agent)) {
      return selected.descriptor;
    }
    return null;
  }
  for (const agent of directMatches.length > 0 ? directMatches : standardAgents) {
    const descriptor = currentDescriptorFromStatus(agent.agent_id, readStatus);
    if (
      descriptor
      && (directMatches.length > 0
        ? descriptorMatchesAgent(descriptor, agent)
        : descriptorMatchesTarget(descriptor, target))
    ) return descriptor;
  }
  return configuredDescriptors().find((descriptor) => directMatches.length > 0
    ? directMatches.some((agent) => descriptorMatchesAgent(descriptor, agent))
    : descriptorMatchesTarget(descriptor, target)) ?? null;
}

export function standardAgentProgressDeltaKeySet(
  domainId: string,
  readStatus: PackageStatusReader = runOplAgentPackageStatus,
): StandardAgentProgressDeltaKeySet {
  const aliases = readStandardAgentDescriptorForDomain(domainId, readStatus)?.interface.progress;
  return {
    deliverable: ['deliverable_progress_delta', ...(aliases?.deliverable_delta_aliases ?? [])],
    platform: ['platform_repair_delta', ...(aliases?.platform_delta_aliases ?? [])],
  };
}

export function standardAgentProgressDeltaKeys(
  domainId: string,
  kind: 'deliverable' | 'platform',
  readStatus: PackageStatusReader = runOplAgentPackageStatus,
) {
  return standardAgentProgressDeltaKeySet(domainId, readStatus)[kind];
}
