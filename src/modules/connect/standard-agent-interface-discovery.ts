import fs from 'node:fs';
import path from 'node:path';

import {
  readStandardAgentDescriptorInterface,
  type StandardAgentDescriptorInterface,
} from '../../kernel/standard-agent-interface.ts';
import {
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../kernel/standard-agent-registry.ts';
import { runOplAgentPackageStatus } from './agent-package-registry.ts';

type PackageStatusReader = typeof runOplAgentPackageStatus;

function normalizedIdentity(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function packageIdsForAliases(packageIds: readonly string[]) {
  const requested = new Set(packageIds.map(normalizedIdentity));
  return STANDARD_AGENT_REGISTRY
    .filter((entry) => entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP)
    .filter((entry) => [
      entry.agent_id,
      entry.domain_id,
      entry.target_domain_id,
      entry.project,
      entry.plugin_name,
      ...entry.aliases,
    ].some((alias) => requested.has(normalizedIdentity(alias))))
    .map((entry) => entry.agent_id);
}

function currentDescriptorFromStatus(
  packageId: string,
  readStatus: PackageStatusReader,
): StandardAgentDescriptorInterface | null {
  let status: ReturnType<PackageStatusReader>['opl_agent_package_status'];
  try {
    status = readStatus({ packageId }).opl_agent_package_status;
  } catch {
    return null;
  }
  const source = status.runtime_source_readiness;
  if (
    status.operational_ready !== true
    || source?.status !== 'current'
    || source.operational_ready !== true
    || typeof source.checkout_path !== 'string'
    || !source.checkout_path.trim()
    || source.expected_tree_sha256 !== source.actual_tree_sha256
  ) return null;
  return readStandardAgentDescriptorInterface(source.checkout_path);
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
): StandardAgentDescriptorInterface | null {
  const target = normalizedIdentity(domainId);
  for (const agent of STANDARD_AGENT_REGISTRY) {
    if (agent.series_membership !== STANDARD_AGENT_SERIES_MEMBERSHIP) continue;
    const descriptor = currentDescriptorFromStatus(agent.agent_id, readStatus);
    if (
      descriptor
      && [descriptor.domain_id, descriptor.interface.runtime.runtime_domain_id]
        .map(normalizedIdentity)
        .includes(target)
    ) return descriptor;
  }
  return configuredDescriptors().find((descriptor) =>
    [descriptor.domain_id, descriptor.interface.runtime.runtime_domain_id]
      .map(normalizedIdentity)
      .includes(target)
  ) ?? null;
}

export function standardAgentProgressDeltaKeys(
  domainId: string,
  kind: 'deliverable' | 'platform',
  readStatus: PackageStatusReader = runOplAgentPackageStatus,
) {
  const aliases = readStandardAgentDescriptorForDomain(domainId, readStatus)?.interface.progress;
  return kind === 'deliverable'
    ? ['deliverable_progress_delta', ...(aliases?.deliverable_delta_aliases ?? [])]
    : ['platform_repair_delta', ...(aliases?.platform_delta_aliases ?? [])];
}
