import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import {
  buildMasDisplayPackV2Descriptor,
  loadGenericPackDescriptor,
  loadGenericPackDescriptorFromRecord,
  MAS_DISPLAY_PACK_V2_SOURCE_CONTRACT_REF,
  normalizeRelativeRef,
  readJsonFile,
  REQUIRED_AUTHORITY_FALSE_FLAGS,
  sha256File,
  shape,
} from './pack-os-parts/descriptor.ts';
import type { JsonRecord } from './pack-os-parts/descriptor.ts';

function usage(message: string, details: JsonRecord = {}) {
  return new FrameworkContractError('cli_usage_error', message, details);
}

function parseDescriptorArgs(args: string[], usageText: string) {
  let descriptor: string | null = null;
  let output: string | null = null;
  const remaining = [...args];
  while (remaining.length > 0) {
    const token = remaining.shift()!;
    if (token === '--descriptor') {
      descriptor = remaining.shift() ?? null;
      if (!descriptor) {
        throw usage(`${usageText} requires a value after --descriptor.`, { required: ['--descriptor <path>'] });
      }
      continue;
    }
    if (token === '--output') {
      output = remaining.shift() ?? null;
      if (!output) {
        throw usage(`${usageText} requires a value after --output.`, { required: ['--output <path>'] });
      }
      continue;
    }
    throw usage(`Unknown pack os option: ${token}.`, { token, usage: usageText });
  }

  if (!descriptor) {
    throw usage(`${usageText} requires --descriptor <path>.`, { required: ['--descriptor <path>'] });
  }

  return { descriptor, output };
}

function requireCliValue(option: string, remaining: string[], usageText: string) {
  const value = remaining.shift() ?? null;
  if (!value) {
    throw usage(`${usageText} requires a value after ${option}.`, { required: [`${option} <path>`] });
  }
  return value;
}

function parseInstallArgs(args: string[], usageText: string) {
  let descriptor: string | null = null;
  let registry: string | null = null;
  let cacheRoot: string | null = null;
  const remaining = [...args];
  while (remaining.length > 0) {
    const token = remaining.shift()!;
    if (token === '--descriptor') {
      descriptor = requireCliValue(token, remaining, usageText);
      continue;
    }
    if (token === '--registry') {
      registry = requireCliValue(token, remaining, usageText);
      continue;
    }
    if (token === '--cache-root') {
      cacheRoot = requireCliValue(token, remaining, usageText);
      continue;
    }
    throw usage(`Unknown pack os option: ${token}.`, { token, usage: usageText });
  }
  if (!descriptor || !registry) {
    throw usage(`${usageText} requires --descriptor <path> and --registry <path>.`, {
      required: ['--descriptor <path>', '--registry <path>'],
    });
  }
  return { descriptor, registry, cacheRoot };
}

function parseRegistryArgs(args: string[], usageText: string) {
  let registry: string | null = null;
  const remaining = [...args];
  while (remaining.length > 0) {
    const token = remaining.shift()!;
    if (token === '--registry') {
      registry = requireCliValue(token, remaining, usageText);
      continue;
    }
    throw usage(`Unknown pack os option: ${token}.`, { token, usage: usageText });
  }
  if (!registry) {
    throw usage(`${usageText} requires --registry <path>.`, { required: ['--registry <path>'] });
  }
  return { registry };
}

function parseCacheArgs(args: string[], usageText: string) {
  let descriptor: string | null = null;
  let cacheRoot: string | null = null;
  const remaining = [...args];
  while (remaining.length > 0) {
    const token = remaining.shift()!;
    if (token === '--descriptor') {
      descriptor = requireCliValue(token, remaining, usageText);
      continue;
    }
    if (token === '--cache-root') {
      cacheRoot = requireCliValue(token, remaining, usageText);
      continue;
    }
    throw usage(`Unknown pack os option: ${token}.`, { token, usage: usageText });
  }
  if (!descriptor || !cacheRoot) {
    throw usage(`${usageText} requires --descriptor <path> and --cache-root <dir>.`, {
      required: ['--descriptor <path>', '--cache-root <dir>'],
    });
  }
  return { descriptor, cacheRoot };
}

function parseDistributionArgs(args: string[], usageText: string) {
  let descriptor: string | null = null;
  let output: string | null = null;
  let cacheRoot: string | null = null;
  const remaining = [...args];
  while (remaining.length > 0) {
    const token = remaining.shift()!;
    if (token === '--descriptor') {
      descriptor = requireCliValue(token, remaining, usageText);
      continue;
    }
    if (token === '--output') {
      output = requireCliValue(token, remaining, usageText);
      continue;
    }
    if (token === '--cache-root') {
      cacheRoot = requireCliValue(token, remaining, usageText);
      continue;
    }
    throw usage(`Unknown pack os option: ${token}.`, { token, usage: usageText });
  }
  if (!descriptor || !output) {
    throw usage(`${usageText} requires --descriptor <path> and --output <path>.`, {
      required: ['--descriptor <path>', '--output <path>'],
    });
  }
  return { descriptor, output, cacheRoot };
}

function parseContractArgs(args: string[], usageText: string) {
  let contract: string | null = null;
  let output: string | null = null;
  const remaining = [...args];
  while (remaining.length > 0) {
    const token = remaining.shift()!;
    if (token === '--contract') {
      contract = remaining.shift() ?? null;
      if (!contract) {
        throw usage(`${usageText} requires a value after --contract.`, { required: ['--contract <path>'] });
      }
      continue;
    }
    if (token === '--output') {
      output = remaining.shift() ?? null;
      if (!output) {
        throw usage(`${usageText} requires a value after --output.`, { required: ['--output <path>'] });
      }
      continue;
    }
    throw usage(`Unknown pack os option: ${token}.`, { token, usage: usageText });
  }

  if (!contract) {
    throw usage(`${usageText} requires --contract <path>.`, { required: ['--contract <path>'] });
  }

  return { contract, output };
}

function writeJsonFile(outputPath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  return {
    path: outputPath,
    sha256: sha256File(outputPath),
    status: 'written',
  };
}

export function buildMasDisplayPackV2PackOsSmoke(contractPath: string) {
  const descriptor = buildMasDisplayPackV2Descriptor(contractPath);
  const loaded = loadGenericPackDescriptorFromRecord(contractPath, descriptor, sha256File(contractPath));
  const lock = buildPackOsLockFromLoaded(loaded).pack_lock;
  const checks = [
    {
      check_id: 'mas_display_pack_v2_contract_loaded',
      status: 'pass',
      ref: lock.provenance.source_ref,
    },
    {
      check_id: 'mas_authority_boundary_preserved',
      status: 'pass',
      owner: lock.review_transport.quality_verdict_owner,
    },
    {
      check_id: 'refs_only_lock_projected',
      status: 'pass',
      artifact_locator_ref_count: lock.summary.artifact_locator_ref_count,
      receipt_ref_count: lock.summary.receipt_ref_count,
    },
    {
      check_id: 'no_mas_authority_claimed',
      status: 'pass',
      not_claims: lock.not_claims,
    },
  ];
  return {
    version: 'g2',
    pack_os_display_pack_v2_smoke: {
      surface_kind: 'opl_pack_os_mas_display_pack_v2_smoke',
      contract_ref: 'contracts/opl-framework/pack-os-contract.json',
      source_contract_ref: MAS_DISPLAY_PACK_V2_SOURCE_CONTRACT_REF,
      source_contract_id: 'display-pack-contract.v2',
      domain_authority_owner: lock.owner,
      status: 'pass',
      pack_lock: lock,
      audit: {
        surface_kind: 'opl_pack_os_mas_display_pack_v2_audit',
        status: 'pass',
        checks,
        forbidden_claims: [
          'OPL owns MAS publication quality',
          'OPL mutates MAS display artifacts',
          'OPL pack lock authorizes MAS publication readiness',
        ],
      },
    },
  };
}

export function buildPackOsInspection(descriptorPath: string) {
  const loaded = loadGenericPackDescriptor(descriptorPath);
  const missingResources = loaded.descriptor.resources.filter((entry) => entry.status === 'missing');
  return {
    version: 'g2',
    pack_os: {
      surface_kind: 'opl_pack_os_inspection',
      contract_ref: 'contracts/opl-framework/pack-os-contract.json',
      descriptor_path: loaded.descriptor_path,
      descriptor_sha256: loaded.descriptor_sha256,
      pack_id: loaded.descriptor.pack_id,
      pack_kind: loaded.descriptor.pack_kind,
      pack_version: loaded.descriptor.version,
      owner: loaded.descriptor.owner,
      status: missingResources.length === 0 ? 'resolved' : 'resolved_with_missing_refs',
      missing_resource_count: missingResources.length,
      authority_boundary: loaded.descriptor.authority_boundary,
      forbidden_claims: [
        'pack_lock_is_domain_ready',
        'review_receipt_transport_is_quality_verdict',
        'artifact_locator_ref_is_artifact_authority',
        'provider_completion_is_pack_quality_ready',
      ],
    },
    descriptor: loaded.descriptor,
  };
}

function buildPackOsLockFromLoaded(loaded: ReturnType<typeof loadGenericPackDescriptor>) {
  const presentResourceCount = loaded.descriptor.resources.filter((entry) => entry.status === 'present').length;
  const missingResourceCount = loaded.descriptor.resources.filter((entry) => entry.status === 'missing').length;
  return {
    version: 'g2',
    pack_lock: {
      surface_kind: 'opl_generic_pack_lock',
      lock_id: `opl-pack-lock:${loaded.descriptor.pack_id}@${loaded.descriptor.version}`,
      pack_id: loaded.descriptor.pack_id,
      version: loaded.descriptor.version,
      pack_kind: loaded.descriptor.pack_kind,
      owner: loaded.descriptor.owner,
      descriptor_ref: loaded.descriptor_path,
      descriptor_sha256: loaded.descriptor_sha256,
      resolver: {
        resolver_owner: 'one-person-lab',
        resolver_role: 'generic_pack_descriptor_to_refs_only_lock',
        install_status: 'descriptor_resolved',
        runtime_isolation_status: 'declared_by_pack_os_not_executed_by_lock',
        cache_status: presentResourceCount > 0 ? 'hashes_recorded_for_present_local_files' : 'no_local_files_hashed',
      },
      resolved_resources: loaded.descriptor.resources,
      artifact_lifecycle: loaded.descriptor.artifact_lifecycle,
      review_transport: loaded.descriptor.review_transport,
      authority_boundary: loaded.descriptor.authority_boundary,
      provenance: loaded.descriptor.provenance,
      summary: {
        capability_count: loaded.descriptor.capabilities.length,
        resource_count: loaded.descriptor.resources.length,
        present_resource_count: presentResourceCount,
        missing_resource_count: missingResourceCount,
        receipt_ref_count: loaded.descriptor.review_transport.receipt_refs.length,
        artifact_locator_ref_count: loaded.descriptor.artifact_lifecycle.artifact_locator_refs.length,
      },
      not_claims: [
        'domain_ready',
        'quality_verdict',
        'artifact_authority',
        'publication_ready',
        'grant_ready',
        'visual_export_ready',
        'app_release_ready',
        'production_ready',
      ],
    },
  };
}

function descriptorResourcePath(descriptorPath: string, ref: string) {
  const descriptorDir = path.dirname(path.resolve(descriptorPath));
  const normalizedRef = normalizeRelativeRef(ref);
  const absolutePath = path.resolve(descriptorDir, normalizedRef);
  if (!absolutePath.startsWith(`${descriptorDir}${path.sep}`) && absolutePath !== descriptorDir) {
    throw shape('Pack resource refs must resolve inside the descriptor directory.', { ref });
  }
  return absolutePath;
}

function registryKey(packId: string, version: string) {
  return `${packId}@${version}`;
}

function packOsNotClaims() {
  return [
    'domain_ready',
    'quality_verdict',
    'artifact_authority',
    'publication_ready',
    'grant_ready',
    'visual_export_ready',
    'app_release_ready',
    'production_ready',
  ];
}

function buildRegistryEntry(lock: ReturnType<typeof buildPackOsLockFromLoaded>['pack_lock']) {
  return {
    registry_key: registryKey(lock.pack_id, lock.version),
    pack_id: lock.pack_id,
    version: lock.version,
    pack_kind: lock.pack_kind,
    owner: lock.owner,
    descriptor_ref: lock.descriptor_ref,
    descriptor_sha256: lock.descriptor_sha256,
    lock_id: lock.lock_id,
    install_status: 'installed',
    installed_at: 'recorded_by_opl_pack_os',
    resource_count: lock.summary.resource_count,
    present_resource_count: lock.summary.present_resource_count,
    receipt_ref_count: lock.summary.receipt_ref_count,
    artifact_locator_ref_count: lock.summary.artifact_locator_ref_count,
    authority_boundary: lock.authority_boundary,
    not_claims: lock.not_claims,
  };
}

function emptyPackOsRegistry(registryPath: string) {
  return {
    schema_version: 1,
    surface_kind: 'opl_pack_os_registry',
    registry_owner: 'one-person-lab',
    registry_path: registryPath,
    entries: [] as JsonRecord[],
    authority_boundary: {
      can_write_domain_truth: false,
      can_mutate_artifact_body: false,
      can_sign_domain_owner_receipt: false,
      can_authorize_quality_verdict: false,
      can_authorize_publication_readiness: false,
      can_authorize_grant_readiness: false,
      can_authorize_visual_export_readiness: false,
      can_authorize_app_release_readiness: false,
      provider_completion_is_pack_quality_ready: false,
    },
    not_claims: packOsNotClaims(),
  };
}

function loadPackOsRegistryRecord(registryPath: string) {
  const resolvedPath = path.resolve(registryPath);
  if (!fs.existsSync(resolvedPath)) {
    return emptyPackOsRegistry(resolvedPath);
  }
  const payload = readJsonFile(resolvedPath);
  if (payload.surface_kind !== 'opl_pack_os_registry') {
    throw shape('Pack OS registry surface_kind must be opl_pack_os_registry.', {
      registry: resolvedPath,
      surface_kind: payload.surface_kind,
    });
  }
  if (!Array.isArray(payload.entries)) {
    throw shape('Pack OS registry entries must be an array.', { registry: resolvedPath });
  }
  return {
    ...emptyPackOsRegistry(resolvedPath),
    ...payload,
    registry_path: resolvedPath,
    entries: payload.entries,
  };
}

function writePackOsRegistry(registryPath: string, registry: ReturnType<typeof emptyPackOsRegistry>) {
  const resolvedPath = path.resolve(registryPath);
  writeJsonFile(resolvedPath, registry);
  return resolvedPath;
}

function buildPackOsCacheFromLoaded(
  loaded: ReturnType<typeof loadGenericPackDescriptor>,
  cacheRoot: string,
) {
  const resolvedCacheRoot = path.resolve(cacheRoot);
  fs.mkdirSync(path.join(resolvedCacheRoot, 'sha256'), { recursive: true });
  const cachedResources = [];
  const skippedResources = [];
  for (const resource of loaded.descriptor.resources) {
    if (resource.ref_kind !== 'local_file' || resource.status !== 'present' || typeof resource.sha256 !== 'string') {
      skippedResources.push({
        resource_id: resource.resource_id,
        role: resource.role,
        ref: resource.ref,
        status: resource.status,
        ref_kind: resource.ref_kind,
        reason: resource.ref_kind === 'external_ref' ? 'external_ref_not_cached' : 'missing_local_file_not_cached',
      });
      continue;
    }
    const sourcePath = descriptorResourcePath(loaded.descriptor_path, resource.ref);
    const cacheRef = `sha256/${resource.sha256}`;
    const cachePath = path.join(resolvedCacheRoot, cacheRef);
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    if (!fs.existsSync(cachePath)) {
      fs.copyFileSync(sourcePath, cachePath);
    }
    cachedResources.push({
      resource_id: resource.resource_id,
      role: resource.role,
      ref: resource.ref,
      source_path: sourcePath,
      sha256: resource.sha256,
      cache_ref: cacheRef,
      cache_path: cachePath,
      status: 'cached',
    });
  }

  return {
    surface_kind: 'opl_pack_os_cache_manifest',
    contract_ref: 'contracts/opl-framework/pack-os-contract.json',
    cache_owner: 'one-person-lab',
    pack_id: loaded.descriptor.pack_id,
    version: loaded.descriptor.version,
    pack_kind: loaded.descriptor.pack_kind,
    descriptor_ref: loaded.descriptor_path,
    descriptor_sha256: loaded.descriptor_sha256,
    cache_root: resolvedCacheRoot,
    status: cachedResources.length > 0 ? 'cached' : 'refs_only_no_local_files_cached',
    cached_resources: cachedResources,
    skipped_resources: skippedResources,
    summary: {
      cached_resource_count: cachedResources.length,
      skipped_resource_count: skippedResources.length,
      resource_count: loaded.descriptor.resources.length,
    },
    authority_boundary: loaded.descriptor.authority_boundary,
    not_claims: packOsNotClaims(),
  };
}

export function buildPackOsLock(descriptorPath: string) {
  return buildPackOsLockFromLoaded(loadGenericPackDescriptor(descriptorPath));
}

export function buildPackOsCache(descriptorPath: string, cacheRoot: string) {
  const loaded = loadGenericPackDescriptor(descriptorPath);
  return {
    version: 'g2',
    pack_os_cache: buildPackOsCacheFromLoaded(loaded, cacheRoot),
  };
}

export function buildPackOsRegistry(registryPath: string) {
  const registry = loadPackOsRegistryRecord(registryPath);
  return {
    version: 'g2',
    pack_os_registry: {
      ...registry,
      status: registry.entries.length > 0 ? 'available' : 'empty',
      summary: {
        entry_count: registry.entries.length,
      },
    },
  };
}

export function buildPackOsInstall(descriptorPath: string, registryPath: string, cacheRoot?: string | null) {
  const loaded = loadGenericPackDescriptor(descriptorPath);
  const lock = buildPackOsLockFromLoaded(loaded).pack_lock;
  const resolvedRegistryPath = path.resolve(registryPath);
  const resolvedCacheRoot = path.resolve(cacheRoot ?? path.join(path.dirname(resolvedRegistryPath), 'pack-cache'));
  const cacheManifest = buildPackOsCacheFromLoaded(loaded, resolvedCacheRoot);
  const registry = loadPackOsRegistryRecord(resolvedRegistryPath);
  const entry = {
    ...buildRegistryEntry(lock),
    cache_root: resolvedCacheRoot,
    cache_status: cacheManifest.status,
    cached_resource_count: cacheManifest.summary.cached_resource_count,
  };
  const nextEntries = [
    ...registry.entries.filter((candidate) => {
      if (!isRecord(candidate)) {
        return false;
      }
      return candidate.registry_key !== entry.registry_key;
    }),
    entry,
  ];
  const nextRegistry = {
    ...registry,
    entries: nextEntries,
  };
  const registryOutputPath = writePackOsRegistry(resolvedRegistryPath, nextRegistry);
  return {
    version: 'g2',
    pack_os_install: {
      surface_kind: 'opl_pack_os_install_receipt',
      contract_ref: 'contracts/opl-framework/pack-os-contract.json',
      status: 'installed',
      registry_path: registryOutputPath,
      registry_entry: entry,
      cache_manifest: cacheManifest,
      pack_lock: lock,
      authority_boundary: lock.authority_boundary,
      not_claims: lock.not_claims,
    },
  };
}

export function buildPackOsDistribution(descriptorPath: string, outputPath: string, cacheRoot?: string | null) {
  const loaded = loadGenericPackDescriptor(descriptorPath);
  const lock = buildPackOsLockFromLoaded(loaded).pack_lock;
  const resolvedOutputPath = path.resolve(outputPath);
  const resolvedCacheRoot = path.resolve(cacheRoot ?? path.join(path.dirname(resolvedOutputPath), 'pack-cache'));
  const cacheManifest = buildPackOsCacheFromLoaded(loaded, resolvedCacheRoot);
  const bundle = {
    surface_kind: 'opl_pack_os_distribution_bundle',
    contract_ref: 'contracts/opl-framework/pack-os-contract.json',
    bundle_role: 'refs_only_pack_distribution_manifest',
    pack_lock: lock,
    cache_manifest: cacheManifest,
    registry_entry: buildRegistryEntry(lock),
    authority_boundary: lock.authority_boundary,
    not_claims: lock.not_claims,
  };
  const output = writeJsonFile(resolvedOutputPath, bundle);
  return {
    version: 'g2',
    pack_os_distribution: {
      surface_kind: 'opl_pack_os_distribution_manifest',
      contract_ref: 'contracts/opl-framework/pack-os-contract.json',
      status: 'written',
      output,
      bundle,
      authority_boundary: lock.authority_boundary,
      not_claims: lock.not_claims,
    },
  };
}

export function buildPackOsValidation(descriptorPath: string) {
  const lock = buildPackOsLock(descriptorPath).pack_lock;
  const checks = [
    {
      check_id: 'descriptor_loaded',
      status: 'pass',
      ref: lock.descriptor_ref,
    },
    {
      check_id: 'required_authority_false_flags',
      status: 'pass',
      fields: REQUIRED_AUTHORITY_FALSE_FLAGS,
    },
    {
      check_id: 'resources_hashed_or_refs_only',
      status: 'pass',
      present_resource_count: lock.summary.present_resource_count,
      missing_resource_count: lock.summary.missing_resource_count,
    },
    {
      check_id: 'review_transport_is_refs_only',
      status: lock.review_transport.receipt_transport_only ? 'pass' : 'fail',
      receipt_transport_only: lock.review_transport.receipt_transport_only,
    },
  ];
  const status = checks.every((entry) => entry.status === 'pass') ? 'valid' : 'invalid';
  if (status !== 'valid') {
    throw shape('Pack OS descriptor failed validation.', { checks });
  }
  return {
    version: 'g2',
    pack_os_validation: {
      surface_kind: 'opl_pack_os_validation',
      contract_ref: 'contracts/opl-framework/pack-os-contract.json',
      status,
      pack_id: lock.pack_id,
      pack_kind: lock.pack_kind,
      checks,
      authority_boundary: lock.authority_boundary,
      not_claims: lock.not_claims,
    },
  };
}

export function runPackOsInspectCommand(args: string[]) {
  const parsed = parseDescriptorArgs(args, 'opl pack os inspect --descriptor <path>');
  if (parsed.output) {
    throw usage('opl pack os inspect does not accept --output; use pack os lock for lock materialization.', {
      output: parsed.output,
    });
  }
  return buildPackOsInspection(parsed.descriptor);
}

export function runPackOsInstallCommand(args: string[]) {
  const parsed = parseInstallArgs(
    args,
    'opl pack os install --descriptor <path> --registry <path> [--cache-root <dir>]',
  );
  return buildPackOsInstall(parsed.descriptor, parsed.registry, parsed.cacheRoot);
}

export function runPackOsRegistryCommand(args: string[]) {
  const parsed = parseRegistryArgs(args, 'opl pack os registry --registry <path>');
  return buildPackOsRegistry(parsed.registry);
}

export function runPackOsCacheCommand(args: string[]) {
  const parsed = parseCacheArgs(args, 'opl pack os cache --descriptor <path> --cache-root <dir>');
  return buildPackOsCache(parsed.descriptor, parsed.cacheRoot);
}

export function runPackOsDistributeCommand(args: string[]) {
  const parsed = parseDistributionArgs(
    args,
    'opl pack os distribute --descriptor <path> --output <path> [--cache-root <dir>]',
  );
  return buildPackOsDistribution(parsed.descriptor, parsed.output, parsed.cacheRoot);
}

export function runPackOsValidateCommand(args: string[]) {
  const parsed = parseDescriptorArgs(args, 'opl pack os validate --descriptor <path>');
  if (parsed.output) {
    throw usage('opl pack os validate does not accept --output; use pack os lock for lock materialization.', {
      output: parsed.output,
    });
  }
  return buildPackOsValidation(parsed.descriptor);
}

export function runPackOsMasDisplaySmokeCommand(args: string[]) {
  const parsed = parseContractArgs(args, 'opl pack os mas-display-smoke --contract <path> [--output <path>]');
  const payload = buildMasDisplayPackV2PackOsSmoke(parsed.contract);
  if (!parsed.output) {
    return payload;
  }
  const outputPath = path.resolve(parsed.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload.pack_os_display_pack_v2_smoke.pack_lock, null, 2)}\n`);
  return {
    ...payload,
    pack_lock_output: {
      path: outputPath,
      sha256: sha256File(outputPath),
      status: 'written',
    },
  };
}

export function runPackOsLockCommand(args: string[]) {
  const parsed = parseDescriptorArgs(args, 'opl pack os lock --descriptor <path> [--output <path>]');
  const payload = buildPackOsLock(parsed.descriptor);
  if (!parsed.output) {
    return payload;
  }
  const outputPath = path.resolve(parsed.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload.pack_lock, null, 2)}\n`);
  return {
    ...payload,
    pack_lock_output: {
      path: outputPath,
      sha256: sha256File(outputPath),
      status: 'written',
    },
  };
}
