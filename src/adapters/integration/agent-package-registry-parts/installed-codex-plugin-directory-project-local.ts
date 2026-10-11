import fs from 'node:fs';
import path from 'node:path';

import { resolveStandardAgent } from '../../../kernel/standard-agent-registry.ts';
import {
  inspectOplModule,
  resolveOplModuleSourcePolicy,
} from '../system-installation/modules.ts';
import type { ModuleCapabilityDependency } from '../system-installation/shared.ts';
import type {
  InstalledPackageDescriptor,
  InstalledPackageManifest,
} from './installed-codex-plugin-directory-types.ts';

export function isProjectLocalCapabilityPackage(
  manifest: Pick<
    InstalledPackageManifest,
    'package_role' | 'codex_default_exposure' | 'codex_interaction_mode' | 'capability_provider'
  >,
) {
  return manifest.package_role === 'capability_package'
    && manifest.codex_default_exposure === false
    && manifest.codex_interaction_mode === 'headless_internal'
    && (manifest.capability_provider?.consumer_profiles?.length ?? 0) > 0;
}

function existingDirectory(value: string | null | undefined) {
  if (!value) return null;
  try {
    const resolved = fs.realpathSync(path.resolve(value));
    return fs.statSync(resolved).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

function sourceContainsSkill(root: string, skillId: string) {
  if (!skillId || path.basename(skillId) !== skillId || skillId.includes('\0')) return false;
  const skillPath = path.join(root, 'skills', skillId, 'SKILL.md');
  try {
    return fs.statSync(skillPath).isFile();
  } catch {
    return false;
  }
}

export function resolveProjectLocalCapabilitySourceRoot(
  moduleId: string,
  skillIds: readonly string[],
) {
  const candidates = new Set<string>();
  try {
    const sourcePolicy = resolveOplModuleSourcePolicy(moduleId, { profile: 'fast' });
    if (sourcePolicy.developer_checkout_available) {
      const developerCheckout = existingDirectory(sourcePolicy.developer_checkout_path);
      if (developerCheckout) candidates.add(developerCheckout);
    }
  } catch {
    // The owner projection remains readable when an optional module is absent.
  }
  try {
    const inspected = inspectOplModule(moduleId, { profile: 'fast' });
    if (inspected.installed && inspected.health_status !== 'invalid_checkout') {
      const checkout = existingDirectory(inspected.checkout_path);
      if (checkout) candidates.add(checkout);
    }
  } catch {
    // An unavailable module is reported by the caller as dependency readiness.
  }
  return [...candidates].find((candidate) => skillIds.every((skillId) => (
    sourceContainsSkill(candidate, skillId)
  ))) ?? null;
}

export function projectLocalCapabilityDependencyReadiness(
  descriptor: InstalledPackageDescriptor,
  dependency: Pick<ModuleCapabilityDependency, 'module_id' | 'capability_abi' | 'required_export_ids' | 'required_module_ids'>,
) {
  if (!isProjectLocalCapabilityPackage(descriptor.manifest)) return null;
  const provider = descriptor.manifest.capability_provider;
  const exportsById = new Map(provider?.exports.map((entry) => [entry.export_id, entry]) ?? []);
  const missingRequiredExportIds = dependency.required_export_ids.filter((exportId) => (
    !exportsById.has(exportId)
  ));
  const missingRequiredModuleIds = dependency.required_module_ids.filter((moduleId) => (
    !provider?.module_export_ids.includes(moduleId)
  ));
  const requiredSkillIds = dependency.required_export_ids.map((exportId) => (
    exportsById.get(exportId)?.skill_id ?? exportId
  ));
  const sourceRoot = resolveProjectLocalCapabilitySourceRoot(
    dependency.module_id,
    requiredSkillIds,
  );
  const compatibilityReasons = [
    ...(provider?.capability_abi === dependency.capability_abi ? [] : ['capability_abi_mismatch']),
    ...(missingRequiredExportIds.length > 0 ? ['required_exports_missing'] : []),
    ...(missingRequiredModuleIds.length > 0 ? ['required_modules_missing'] : []),
  ];
  const reasons = [
    ...compatibilityReasons,
    ...(!sourceRoot ? ['package_source_unavailable'] : []),
  ];
  return {
    status: compatibilityReasons.length > 0
      ? 'incompatible' as const
      : sourceRoot
        ? 'current' as const
        : 'missing' as const,
    sourceRoot,
    missingRequiredExportIds,
    missingRequiredModuleIds,
    reasons,
  };
}

function projectLocalCapabilityDescriptor(owner: InstalledPackageDescriptor) {
  if (!isProjectLocalCapabilityPackage(owner.manifest)) return null;
  const moduleId = resolveStandardAgent(owner.manifest.package_id)?.module_id;
  if (!moduleId) return null;
  const sourceRoot = resolveProjectLocalCapabilitySourceRoot(
    moduleId,
    owner.manifest.required_skill_ids,
  );
  if (!sourceRoot || !fs.existsSync(path.join(sourceRoot, 'opl-package.json'))) return null;
  return {
    ...owner,
    sourcePath: sourceRoot,
    enabled: false,
    carrier_readback: {
      kind: 'project_local_owner_projection',
      identity: owner.carrier.carrier.pluginId,
      source_ref: sourceRoot,
      version: owner.manifest.version,
      enabled: false,
      lifecycle_authority: 'carrier_owned' as const,
    },
    readiness: {
      installed: true,
      physical_status: 'available' as const,
      callability: 'disabled' as const,
      projection_callability: 'callable' as const,
    },
  } satisfies InstalledPackageDescriptor;
}

export function discoverProjectLocalCapabilityPackageDescriptors(
  owners: Iterable<InstalledPackageDescriptor>,
) {
  const discovered = new Map<string, InstalledPackageDescriptor>();
  for (const owner of owners) {
    const projected = projectLocalCapabilityDescriptor(owner);
    if (projected) discovered.set(projected.manifest.package_id, projected);
  }
  return discovered;
}
