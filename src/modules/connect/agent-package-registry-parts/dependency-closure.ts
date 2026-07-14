import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { sha256Text } from './shared.ts';
import {
  LEGACY_PACKAGE_CONTENT_LOCK,
  packageContentLockDigest,
} from './payload-content-lock.ts';
import type {
  AgentPackageCapabilityDependency,
  AgentPackageDependencyReadiness,
  AgentPackageLock,
  AgentPackageLockIndex,
  AgentPackageManifest,
  AgentPackageResolvedDependency,
} from './types.ts';

type NumericVersion = [number, number, number];

function numericVersion(value: string): NumericVersion | null {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareVersions(left: NumericVersion, right: NumericVersion) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

export function versionSatisfiesRequirement(version: string, requirement: string) {
  const candidate = numericVersion(version);
  if (!candidate) return version === requirement;
  const trimmed = requirement.trim();
  if (trimmed.startsWith('^')) {
    const floor = numericVersion(trimmed.slice(1));
    if (!floor) return false;
    const ceiling: NumericVersion = floor[0] > 0
      ? [floor[0] + 1, 0, 0]
      : floor[1] > 0
        ? [0, floor[1] + 1, 0]
        : [0, 0, floor[2] + 1];
    return compareVersions(candidate, floor) >= 0 && compareVersions(candidate, ceiling) < 0;
  }
  const terms = trimmed.split(/\s+/).filter(Boolean);
  if (terms.some((term) => /^[<>]=?/.test(term))) {
    return terms.every((term) => {
      const match = term.match(/^(>=|<=|>|<|=)?(.+)$/);
      const target = match ? numericVersion(match[2]) : null;
      if (!match || !target) return false;
      const comparison = compareVersions(candidate, target);
      return match[1] === '>=' ? comparison >= 0
        : match[1] === '<=' ? comparison <= 0
          : match[1] === '>' ? comparison > 0
            : match[1] === '<' ? comparison < 0
              : comparison === 0;
    });
  }
  const exact = numericVersion(trimmed);
  return exact ? compareVersions(candidate, exact) === 0 : version === trimmed;
}

export function manifestContentDigest(manifest: AgentPackageManifest, manifestSha256: string) {
  return manifest.content_digest
    ?? manifest.distribution_payload?.payload_digest_ref
    ?? `sha256:${manifestSha256}`;
}

export function verifyManifestContentLock(manifest: AgentPackageManifest) {
  if (!manifest.plugin_source_path || manifest.content_lock_paths.length === 0 || !manifest.content_digest) return;
  const files: Array<{ path: string; content: Buffer }> = [];
  for (const relativePath of manifest.content_lock_paths) {
    const filePath = path.join(manifest.plugin_source_path, relativePath);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new FrameworkContractError('contract_shape_invalid', 'Capability provider content lock path is missing.', {
        package_id: manifest.package_id,
        content_lock_path: relativePath,
        failure_code: 'capability_package_content_lock_path_missing',
      });
    }
    files.push({ path: relativePath, content: fs.readFileSync(filePath) });
  }
  const actualDigest = packageContentLockDigest(
    manifest.content_lock_canonicalization ?? LEGACY_PACKAGE_CONTENT_LOCK,
    files,
  );
  if (actualDigest !== manifest.content_digest) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability provider content lock digest does not match its source files.', {
      package_id: manifest.package_id,
      declared_content_digest: manifest.content_digest,
      actual_content_digest: actualDigest,
      failure_code: 'capability_package_content_digest_mismatch',
    });
  }
}

export function validateCapabilityProvider(
  dependency: AgentPackageCapabilityDependency,
  provider: AgentPackageManifest,
  manifestSha256: string,
): AgentPackageResolvedDependency {
  const reasons: string[] = [];
  if (provider.package_id !== dependency.package_id) reasons.push('package_id_mismatch');
  if (!versionSatisfiesRequirement(provider.version, dependency.version_requirement)) reasons.push('version_requirement_unsatisfied');
  if (provider.capability_provider?.capability_abi !== dependency.capability_abi) reasons.push('capability_abi_mismatch');
  const providerExports = new Set(provider.capability_provider?.exports
    .filter((entry) => entry.install_mode === 'core_required')
    .map((entry) => entry.export_id) ?? []);
  const missingExports = dependency.required_export_ids.filter((exportId) => !providerExports.has(exportId));
  const providerModules = new Set(provider.capability_provider?.module_export_ids ?? []);
  const missingModules = dependency.required_module_ids.filter((moduleId) => !providerModules.has(moduleId));
  if (missingExports.length > 0) reasons.push('required_exports_missing');
  if (missingModules.length > 0) reasons.push('required_modules_missing');
  if (reasons.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability dependency provider is incompatible with the consumer manifest.', {
      package_id: dependency.package_id,
      provider_version: provider.version,
      version_requirement: dependency.version_requirement,
      expected_capability_abi: dependency.capability_abi,
      provider_capability_abi: provider.capability_provider?.capability_abi ?? null,
      missing_required_export_ids: missingExports,
      missing_required_module_ids: missingModules,
      reasons,
      failure_code: 'agent_package_dependency_incompatible',
    });
  }
  const contentDigest = manifestContentDigest(provider, manifestSha256);
  return {
    package_id: dependency.package_id,
    required: dependency.required,
    version_requirement: dependency.version_requirement,
    capability_abi: dependency.capability_abi,
    required_export_ids: dependency.required_export_ids,
    required_module_ids: dependency.required_module_ids,
    installed_version: provider.version,
    manifest_url: '',
    manifest_sha256: manifestSha256,
    content_digest: contentDigest,
    package_lock_ref: '',
  };
}

export function dependencyClosureDigest(locks: AgentPackageLock[]) {
  return sha256Text(JSON.stringify(locks
    .map((lock) => ({
      package_id: lock.package_id,
      package_version: lock.package_version,
      manifest_sha256: lock.manifest_sha256,
      content_digest: lock.content_digest,
      package_lock_ref: lock.lock_ref,
    }))
    .sort((left, right) => left.package_id.localeCompare(right.package_id))));
}

export function requiredDependents(index: AgentPackageLockIndex, packageId: string) {
  return index.packages
    .filter((lock) => lock.capability_dependencies?.some((dependency) =>
      dependency.required && dependency.package_id === packageId))
    .map((lock) => lock.package_id)
    .sort();
}

export function assertNoRequiredInstalledDependents(
  index: AgentPackageLockIndex,
  packageId: string,
  action: 'install' | 'uninstall' | 'disable' | 'update' | 'repair' | 'rollback',
) {
  const dependentPackageIds = requiredDependents(index, packageId);
  if (dependentPackageIds.length === 0) return;
  throw new FrameworkContractError('contract_shape_invalid', `Agent package ${action} is blocked by installed required dependents.`, {
    package_id: packageId,
    action,
    dependent_package_ids: dependentPackageIds,
    failure_code: 'agent_package_required_by_installed_dependents',
    repair_commands: dependentPackageIds.map((dependent) => `opl packages repair --package-id ${dependent}`),
    uninstall_policy: 'remove_dependents_in_the_same_transaction_or_uninstall_dependents_first',
  });
}

export function dependencyReadiness(
  lock: AgentPackageLock,
  index: AgentPackageLockIndex,
): AgentPackageDependencyReadiness {
  const items = (lock.capability_dependencies ?? []).map((dependency) => {
    const provider = index.packages.find((entry) => entry.package_id === dependency.package_id);
    const resolved = lock.resolved_dependencies?.find((entry) => entry.package_id === dependency.package_id);
    const reasons: string[] = [];
    if (!provider) {
      reasons.push('dependency_lock_missing');
    } else {
      if (provider.exposure_state === 'disabled') reasons.push('dependency_disabled');
      if (!versionSatisfiesRequirement(provider.package_version, dependency.version_requirement)) reasons.push('version_requirement_unsatisfied');
      if (provider.capability_provider?.capability_abi !== dependency.capability_abi) reasons.push('capability_abi_mismatch');
      const exports = new Set(provider.capability_provider?.exports
        .filter((entry) => entry.install_mode === 'core_required')
        .map((entry) => entry.export_id) ?? []);
      if (dependency.required_export_ids.some((exportId) => !exports.has(exportId))) reasons.push('required_exports_missing');
      const modules = new Set(provider.capability_provider?.module_export_ids ?? []);
      if (dependency.required_module_ids.some((moduleId) => !modules.has(moduleId))) reasons.push('required_modules_missing');
      if (!resolved) {
        reasons.push('dependency_not_locked_in_closure');
      } else if (
        resolved.installed_version !== provider.package_version
        || resolved.manifest_sha256 !== provider.manifest_sha256
        || resolved.content_digest !== provider.content_digest
        || resolved.package_lock_ref !== provider.lock_ref
      ) {
        reasons.push('dependency_closure_digest_mismatch');
      }
    }
    return {
      package_id: dependency.package_id,
      required: dependency.required,
      version_requirement: dependency.version_requirement,
      capability_abi: dependency.capability_abi,
      required_export_ids: dependency.required_export_ids,
      required_module_ids: dependency.required_module_ids,
      installed_version: provider?.package_version ?? null,
      manifest_sha256: provider?.manifest_sha256 ?? null,
      content_digest: provider?.content_digest ?? null,
      status: (!provider ? 'missing' : reasons.length > 0 ? 'incompatible' : 'current') as 'missing' | 'incompatible' | 'current',
      reasons,
      missing_required_export_ids: provider
        ? dependency.required_export_ids.filter((exportId) => !(provider.capability_provider?.exports
            .some((entry) => entry.install_mode === 'core_required' && entry.export_id === exportId) ?? false))
        : dependency.required_export_ids,
      missing_required_module_ids: provider
        ? dependency.required_module_ids.filter((moduleId) => !(provider.capability_provider?.module_export_ids.includes(moduleId) ?? false))
        : dependency.required_module_ids,
    };
  });
  const status = items.some((entry) => entry.status === 'missing')
    ? 'missing'
    : items.some((entry) => entry.status === 'incompatible')
      ? 'incompatible'
      : 'current';
  return {
    status,
    operational_ready: status === 'current',
    repair_command: `opl packages repair --package-id ${lock.package_id}`,
    dependencies: items,
  };
}
import fs from 'node:fs';
import path from 'node:path';
