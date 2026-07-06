import fs from 'node:fs';
import path from 'node:path';

import { parseJsonText } from '../../kernel/json-file.ts';
import {
  RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT,
  authorityBoundary,
  baseOrRecommendedRPackages,
  baseReadback,
  buildRunContextConsumerPreflight,
  bundleRoot,
  bundleManifestProjection,
  cacheInventoryProjection,
  cleanupPlanProjection,
  contentFingerprint,
  dependencyLibrariesRoot,
  descriptorProjection,
  installRPackagesIntoManagedLibrary,
  installedRPackages,
  locksRoot,
  normalizeTarget,
  objects,
  readJsonObject,
  readPrepareProfile,
  relativePaperBuildRef,
  requirementProfileIdentity,
  resolveBinary,
  runtimeEnvironmentConsumerBoundary,
  RUNTIME_ENVIRONMENT_FALLBACK_POINTER,
  runtimeLockProjection,
  runtimeRootForBundle,
  safeSegment,
  shortDigest,
  statePathFromRef,
  stateRef,
  writeJsonFile,
  writePointer,
  writePreparedEnvironmentIndex,
  runContextTargetMismatchFields,
  CONTRACT_PATH,
} from './runtime-environment-substrate-parts/shared.ts';
import type {
  JsonRecord,
  RuntimeEnvironmentCachePruneInput,
  RuntimeEnvironmentMaterializeInput,
  RuntimeEnvironmentPrepareInput,
  RuntimeEnvironmentTargetInput,
  RuntimeEnvironmentVerifyInput,
} from './runtime-environment-substrate-parts/shared.ts';

export {
  RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT,
  type RuntimeEnvironmentCachePruneInput,
  type RuntimeEnvironmentCommand,
  type RuntimeEnvironmentMaterializeInput,
  type RuntimeEnvironmentPrepareInput,
  type RuntimeEnvironmentTargetInput,
  type RuntimeEnvironmentVerifyInput,
} from './runtime-environment-substrate-parts/shared.ts';

export function buildRuntimeEnvironmentInspectReadback(input: RuntimeEnvironmentTargetInput) {
  const target = normalizeTarget(input);
  const lock = runtimeLockProjection(input);
  const bundleManifest = bundleManifestProjection(input);
  return {
    ...baseReadback('inspect', input),
    descriptor: descriptorProjection(target),
    runtime_lock_ref: lock.lock_ref,
    bundle_manifest_ref: bundleManifest.bundle_ref,
    materialization_status: {
      status: bundleManifest.materialized_runtime_root
        ? 'materialized_runtime_root_observed'
        : 'not_materialized',
      reason: bundleManifest.materialized_runtime_root
        ? 'materialization_receipt_observed'
        : 'dry_run_projection_only',
      writes_runtime_root: bundleManifest.writes_runtime_root,
      runtime_root: bundleManifest.materialized_runtime_root,
      receipt_ref: bundleManifest.materialization_receipt_ref,
      can_claim_runtime_ready: bundleManifest.can_claim_runtime_ready,
      can_claim_domain_ready: false,
      can_claim_app_release_ready: false,
    },
    module_mapping: RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.module_mapping,
  };
}

export function buildRuntimeEnvironmentLockReadback(input: RuntimeEnvironmentTargetInput) {
  const lock = runtimeLockProjection(input);
  return {
    ...baseReadback('lock', input),
    lock,
  };
}

export function buildRuntimeEnvironmentCacheStatusReadback() {
  const inventory = cacheInventoryProjection();
  return {
    ...baseReadback('cache status'),
    cache: {
      surface_kind: 'opl_runtime_environment_cache_status',
      status: inventory.status,
      cache_hit_counts_as_ready: false,
      cache_miss_counts_as_readiness_failure: false,
      materialization_failure_counts_as_runtime_environment_failure: true,
      cache_root: inventory.cache_root,
      layer_count: inventory.layer_count,
      active_runtime_roots: inventory.active_runtime_roots,
      inventory,
    },
  };
}

export function buildRuntimeEnvironmentBuildReadback(input: RuntimeEnvironmentTargetInput) {
  const target = normalizeTarget(input);
  const lock = runtimeLockProjection(input);
  const bundleManifest = bundleManifestProjection(input);
  const producerReadbackRef = `runtime-bundle-producer-readback:${target.domain_id}/${target.profile_id}/${target.platform_id}:sha256:${shortDigest({
    lock_ref: lock.lock_ref,
    bundle_ref: bundleManifest.bundle_ref,
  })}`;
  const producerReceipt = {
    surface_kind: 'opl_runtime_bundle_producer_receipt',
    version: 'opl-runtime-bundle-producer-receipt.v1',
    status: 'dry_run_bundle_manifest_projected',
    producer_kind: 'opl-runtime-bundle',
    producer_command_ref: 'opl-runtime-env-command:build',
    readback_ref: producerReadbackRef,
    bundle_manifest_ref: bundleManifest.bundle_ref,
    bundle_manifest_digest: bundleManifest.bundle_digest,
    bundle_manifest_state_ref: bundleManifest.bundle_manifest_state_ref,
    bundle_lock_ref: lock.lock_ref,
    bundle_lock_digest: lock.lock_digest,
    bundle_lock_state_ref: lock.lock_state_ref,
    dry_run: true,
    writes_runtime_root: false,
    writes_domain_repo: false,
    creates_archive: false,
    creates_materialization_receipt: false,
    can_claim_runtime_ready: false,
    can_claim_domain_ready: false,
    can_claim_app_release_ready: false,
  };
  return {
    ...baseReadback('build', input),
    lock,
    bundle_lock: lock,
    bundle_manifest: bundleManifest,
    runtime_bundle_producer: {
      surface_kind: 'opl_runtime_bundle_producer_readback',
      version: 'opl-runtime-bundle-producer-readback.v1',
      status: 'dry_run_bundle_manifest_projected',
      producer_kind: 'opl-runtime-bundle',
      producer_command_ref: 'opl-runtime-env-command:build',
      producer_command: `opl runtime env build --domain ${target.domain_id} --profile ${target.profile_id} --platform ${target.platform_id}`,
      producer_readback_ref: producerReadbackRef,
      producer_receipt_ref: producerReadbackRef,
      target_profile: target,
      target_domain_id: target.domain_id,
      target_profile_id: target.profile_id,
      target_platform_id: target.platform_id,
      manifest_schema_version: 'opl-runtime-bundle-manifest.v1',
      lock_schema_version: 'opl-runtime-bundle-lock.v1',
      bundle_manifest_ref: bundleManifest.bundle_ref,
      bundle_manifest_digest: bundleManifest.bundle_digest,
      bundle_manifest_state_ref: bundleManifest.bundle_manifest_state_ref,
      bundle_lock_ref: lock.lock_ref,
      bundle_lock_digest: lock.lock_digest,
      bundle_lock_state_ref: lock.lock_state_ref,
      stable_ref_fields: [
        'bundle_manifest.bundle_ref',
        'bundle_manifest.bundle_digest',
        'bundle_manifest.bundle_manifest_state_ref',
        'bundle_lock.lock_ref',
        'bundle_lock.lock_digest',
        'bundle_lock.lock_state_ref',
        'producer_receipt.readback_ref',
      ],
      layer_taxonomy: objects(lock.layer_graph).map((layer) => ({
        layer_type: layer.layer_type,
        layer_id: layer.layer_id,
        cache_key: layer.cache_key,
        digest: layer.digest,
        archive_present: layer.archive_present === true,
        materialized: layer.materialized === true,
      })),
      false_ready_flags: {
        dry_run_projection_counts_as_runtime_ready: false,
        dry_run_projection_counts_as_domain_ready: false,
        dry_run_projection_counts_as_app_release_ready: false,
        bundle_manifest_exists_counts_as_materialized_runtime: false,
        bundle_lock_exists_counts_as_app_full_release_ready: false,
      },
      app_full_consumer_boundary: {
        consumes_bundle_manifest_ref: bundleManifest.bundle_ref,
        consumes_bundle_lock_ref: lock.lock_ref,
        consumes_producer_readback_ref: producerReadbackRef,
        app_owns_release_verdict: true,
        framework_can_claim_app_release_ready: false,
      },
    },
    producer_receipt: producerReceipt,
    build_plan: {
      surface_kind: 'opl_runtime_environment_build_plan',
      status: 'bundle_manifest_projected',
      writes_runtime_root: false,
      writes_domain_repo: false,
      creates_archive: false,
      creates_materialization_receipt: false,
      can_claim_runtime_ready: false,
      lock_state_ref: lock.lock_state_ref,
      bundle_manifest_state_ref: bundleManifest.bundle_manifest_state_ref,
      producer_receipt_ref: producerReadbackRef,
    },
  };
}

export function buildRuntimeEnvironmentPrepareReadback(input: RuntimeEnvironmentPrepareInput) {
  const target = normalizeTarget(input);
  const {
    profile,
    selected,
    selectedRequirementProfileIds,
    runtimeBinaries,
    requiredRPackages,
    requiredRPackageRequirements,
  } = readPrepareProfile(
    input.requirementProfilePath,
    input.requirementProfileId,
  );
  const buildRoot = path.join(path.resolve(input.paperRoot), 'build');
  fs.mkdirSync(buildRoot, { recursive: true });

  const binaryPaths: Record<string, string> = {};
  const missingBinaries: string[] = [];
  runtimeBinaries.forEach((binaryName) => {
    const resolved = resolveBinary(binaryName);
    if (resolved) {
      binaryPaths[binaryName] = resolved;
    } else {
      missingBinaries.push(binaryName);
    }
  });

  const rscriptPath = binaryPaths.Rscript;
  const baseRPackages = rscriptPath ? baseOrRecommendedRPackages(rscriptPath) : new Set<string>();
  const managedRPackageRequirements = requiredRPackageRequirements
    .filter((requirement) => !baseRPackages.has(requirement.name));
  const baseRPackageRequirements = requiredRPackageRequirements
    .filter((requirement) => baseRPackages.has(requirement.name))
    .map((requirement) => requirement.name);
  const managedRequiredRPackages = managedRPackageRequirements.map((requirement) => requirement.name);
  const managedLibraryPath = path.join(
    dependencyLibrariesRoot(target),
    shortDigest({
      requirement_profile: path.resolve(input.requirementProfilePath),
      requested_requirement_profile_id: input.requirementProfileId ?? null,
      selected_requirement_profile_id: selected.profile_id ?? null,
      selected_requirement_profile_ids: selectedRequirementProfileIds,
      required_r_packages: requiredRPackages,
      managed_required_r_packages: managedRequiredRPackages,
    }),
    'R',
  );
  let installedPackages = rscriptPath
    ? installedRPackages(rscriptPath, managedLibraryPath)
    : new Set<string>();
  let missingRPackages = rscriptPath
    ? managedRequiredRPackages.filter((packageName) => !installedPackages.has(packageName))
    : managedRequiredRPackages;
  const installReceipt = input.apply && rscriptPath && missingBinaries.length === 0
    ? installRPackagesIntoManagedLibrary(
      rscriptPath,
      managedLibraryPath,
      managedRPackageRequirements,
      missingRPackages,
    )
    : {
      status: input.apply ? 'not_required' : 'not_requested',
      installed: [],
      failed: [],
      managed_library_path: managedLibraryPath,
      verified_with: 'installed.packages(lib.loc = managed_library_path)',
      stderr: '',
    };
  if (input.apply && rscriptPath && installReceipt.status !== 'not_requested') {
    installedPackages = installedRPackages(rscriptPath, managedLibraryPath);
    missingRPackages = managedRequiredRPackages.filter((packageName) => !installedPackages.has(packageName));
  }
  const status = missingBinaries.length > 0
    ? 'missing_runtime_binary'
    : missingRPackages.length > 0
      ? 'missing_language_package'
      : 'prepared';
  const failureClass = status === 'prepared' ? '' : status;
  const lockRef = relativePaperBuildRef('dependency_environment_lock.json');
  const receiptRef = relativePaperBuildRef('dependency_environment_receipt.json');
  const runContextRef = relativePaperBuildRef('dependency_run_context.json');
  const profileIdentity = requirementProfileIdentity(
    input.requirementProfilePath,
    input.requirementProfileId,
    selectedRequirementProfileIds,
    profile,
  );
  const consumerBoundary = runtimeEnvironmentConsumerBoundary();
  const lockPayload = {
    surface_kind: 'opl_runtime_environment_dependency_lock',
    version: 'opl-runtime-environment-dependency-lock.v1',
    status,
    domain_id: target.domain_id,
    profile_id: target.profile_id,
    platform_id: target.platform_id,
    dependency_profile_ref: path.resolve(input.requirementProfilePath),
    requested_requirement_profile_id: input.requirementProfileId ?? null,
    selected_requirement_profile_id: selected.profile_id ?? null,
    selected_requirement_profile_ids: selectedRequirementProfileIds,
    requirement_profile_identity: profileIdentity,
    source_requirement_refs: [path.resolve(input.requirementProfilePath)],
    runtime_binaries: runtimeBinaries,
    required_r_packages: requiredRPackages,
    managed_required_r_packages: managedRequiredRPackages,
    base_or_recommended_r_packages: baseRPackageRequirements,
    r_package_requirements: requiredRPackageRequirements,
    package_installation_requested: input.apply === true,
    installed_packages: input.apply === true && installReceipt.status === 'installed',
    managed_r_library_path: managedLibraryPath,
    writes_domain_truth: false,
    writes_runtime_root: false,
    can_claim_runtime_ready: false,
    can_claim_domain_ready: false,
  };
  const lockWithDigest = {
    ...lockPayload,
    lock_ref: lockRef,
    lock_sha256: contentFingerprint(lockPayload),
  };
  const authority = {
    can_write_domain_truth: false,
    can_write_domain_memory_body: false,
    can_mutate_domain_artifact_body: false,
    can_sign_owner_receipt: false,
    can_create_typed_blocker: false,
    can_authorize_publication_readiness: false,
    can_claim_runtime_ready: false,
    can_claim_domain_ready: false,
    host_environment_fallback_allowed: false,
  };
  const receipt = {
    surface_kind: 'opl_runtime_environment_dependency_receipt',
    version: 'opl-runtime-environment-dependency-receipt.v1',
    status,
    failure_class: failureClass,
    domain_id: target.domain_id,
    profile_id: target.profile_id,
    platform_id: target.platform_id,
    dependency_profile_ref: path.resolve(input.requirementProfilePath),
    requested_requirement_profile_id: input.requirementProfileId ?? null,
    selected_requirement_profile_id: selected.profile_id ?? null,
    selected_requirement_profile_ids: selectedRequirementProfileIds,
    requirement_profile_identity: profileIdentity,
    package_installation_requested: input.apply === true,
    installed_packages: input.apply === true && installReceipt.status === 'installed',
    managed_r_library_path: managedLibraryPath,
    managed_required_r_packages: managedRequiredRPackages,
    base_or_recommended_r_packages: baseRPackageRequirements,
    r_package_requirements: requiredRPackageRequirements,
    package_installation_receipt: installReceipt,
    lock_ref: lockRef,
    lock_sha256: lockWithDigest.lock_sha256,
    binary_paths: binaryPaths,
    missing_runtime_binaries: missingBinaries,
    missing_r_packages: missingRPackages,
    receipt_ref: receiptRef,
    run_context_ref: status === 'prepared' ? runContextRef : null,
    route_hint: status === 'prepared' ? null : 'opl_runtime_env_doctor',
    authority_boundary: authority,
    consumer_boundary: consumerBoundary,
    consumer_preflight: status === 'prepared'
      ? buildRunContextConsumerPreflight('bound')
      : buildRunContextConsumerPreflight('missing_run_context'),
  };
  fs.writeFileSync(
    path.join(buildRoot, 'dependency_environment_lock.json'),
    `${JSON.stringify(lockWithDigest, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(buildRoot, 'dependency_environment_receipt.json'),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );

  let runContext: JsonRecord | null = null;
  if (status === 'prepared') {
    runContext = {
      surface_kind: 'opl_runtime_environment_dependency_run_context',
      version: 'opl-runtime-environment-dependency-run-context.v1',
      status,
      domain_id: target.domain_id,
      profile_id: target.profile_id,
      platform_id: target.platform_id,
      requested_requirement_profile_id: input.requirementProfileId ?? null,
      selected_requirement_profile_ids: selectedRequirementProfileIds,
      requirement_profile_identity: profileIdentity,
      lock_ref: lockRef,
      lock_sha256: lockWithDigest.lock_sha256,
      binary_paths: binaryPaths,
      env_vars: {
        OPL_RUNTIME_ENVIRONMENT_STATUS: 'prepared',
        R_LIBS_USER: managedLibraryPath,
      },
      managed_r_library_path: managedLibraryPath,
      managed_required_r_packages: managedRequiredRPackages,
      base_or_recommended_r_packages: baseRPackageRequirements,
      package_installation_requested: input.apply === true,
      installed_packages: input.apply === true && installReceipt.status === 'installed',
      writes_domain_truth: false,
      writes_runtime_root: false,
      can_schedule_domain_stage: false,
      can_claim_provider_ready: false,
      can_claim_runtime_ready: false,
      can_claim_domain_ready: false,
      can_claim_app_release_ready: false,
      consumer_boundary: consumerBoundary,
      consumer_preflight: buildRunContextConsumerPreflight('bound'),
    };
    runContext.run_context_fingerprint = contentFingerprint(runContext);
    runContext.execution_fingerprint = runContext.run_context_fingerprint;
    fs.writeFileSync(
      path.join(buildRoot, 'dependency_run_context.json'),
      `${JSON.stringify(runContext, null, 2)}\n`,
    );
    writePreparedEnvironmentIndex({
      domain_id: target.domain_id,
      profile_id: target.profile_id,
      platform_id: target.platform_id,
      paper_root: path.resolve(input.paperRoot),
      lock_ref: lockRef,
      receipt_ref: receiptRef,
      run_context_ref: runContextRef,
      status,
    });
  }

  return {
    ...baseReadback('prepare', input),
    prepare: {
      surface_kind: 'opl_runtime_environment_prepare_readback',
      status,
      failure_class: failureClass,
      package_installation_requested: input.apply === true,
      installed_packages: input.apply === true && installReceipt.status === 'installed',
      managed_r_library_path: managedLibraryPath,
      selected_requirement_profile_ids: selectedRequirementProfileIds,
      requirement_profile_identity: profileIdentity,
      managed_required_r_packages: managedRequiredRPackages,
      base_or_recommended_r_packages: baseRPackageRequirements,
      package_installation_receipt: installReceipt,
      writes_domain_truth: false,
      writes_runtime_root: false,
      lock_ref: lockRef,
      receipt_ref: receiptRef,
      run_context_ref: status === 'prepared' ? runContextRef : null,
      binary_paths: binaryPaths,
      missing_runtime_binaries: missingBinaries,
      missing_r_packages: missingRPackages,
      route_hint: status === 'prepared' ? null : 'opl_runtime_env_doctor',
      authority_boundary: authority,
      consumer_boundary: consumerBoundary,
      consumer_preflight: status === 'prepared'
        ? buildRunContextConsumerPreflight('bound')
        : buildRunContextConsumerPreflight('missing_run_context'),
    },
    run_context: runContext,
  };
}

export function buildRuntimeEnvironmentMaterializeReadback(input: RuntimeEnvironmentMaterializeInput) {
  const target = normalizeTarget(input);
  const lock = runtimeLockProjection(input);
  const bundleManifest = bundleManifestProjection(input);
  const targetPointer = input.targetPointer ?? 'current';
  if (!input.apply) {
    return {
      ...baseReadback('materialize', input),
      bundle_manifest: bundleManifest,
      materialization_plan: {
        surface_kind: 'opl_runtime_environment_materialization_plan',
        status: 'dry_run_materialization_plan_projected',
        target_pointer: targetPointer,
        requested_apply: false,
        dry_run: true,
        applied: false,
        can_apply: true,
        runtime_root: runtimeRootForBundle(target, bundleManifest),
        receipt_ref: null,
        writes_runtime_root: false,
        updates_current_pointer: false,
        updates_rollback_pointer: false,
        protects_current_pointer: true,
        protects_rollback_pointer: true,
        apply_blocker_ref: null,
        steps: [
          'persist_runtime_lock',
          'persist_bundle_manifest',
          'write_layer_manifests',
          'write_materialized_runtime_root_envelope',
          'write_materialization_receipt',
          'update_selected_pointer',
        ],
      },
    };
  }
  const runtimeRoot = runtimeRootForBundle(target, bundleManifest);
  const lockPath = statePathFromRef(lock.lock_state_ref) ?? path.join(locksRoot(target), `${shortDigest(lock)}.json`);
  const manifestPath = statePathFromRef(bundleManifest.bundle_manifest_state_ref)
    ?? path.join(bundleRoot(target), `${shortDigest(bundleManifest)}.json`);
  const layersRoot = path.join(runtimeRoot, 'layers');
  const receiptPath = path.join(runtimeRoot, 'materialization-receipt.json');
  const envPath = path.join(runtimeRoot, 'env.json');
  fs.mkdirSync(layersRoot, { recursive: true });
  writeJsonFile(lockPath, {
    ...lock,
    status: 'persisted_runtime_lock',
    persisted: true,
    writes_runtime_root: false,
  });
  writeJsonFile(manifestPath, {
    ...bundleManifest,
    status: 'persisted_bundle_manifest',
    materialized_runtime_root: runtimeRoot,
    materialization_receipt_ref: stateRef(receiptPath),
    writes_runtime_root: true,
    can_claim_runtime_ready: true,
  });
  objects(bundleManifest.layer_refs).forEach((layerRef) => {
    const layerPath = path.join(
      layersRoot,
      `${safeSegment(String(layerRef.layer_type ?? 'layer'))}.json`,
    );
    writeJsonFile(layerPath, {
      surface_kind: 'opl_runtime_environment_materialized_layer',
      status: 'materialized_metadata_layer',
      layer_ref: layerRef,
      cache_hit_counts_as_ready: false,
      writes_domain_truth: false,
      writes_artifact_body: false,
      writes_memory_body: false,
    });
  });
  const envVars = {
    OPL_RUNTIME_ENVIRONMENT_STATUS: 'materialized',
    OPL_RUNTIME_ENVIRONMENT_ROOT: runtimeRoot,
    OPL_RUNTIME_ENVIRONMENT_BUNDLE_REF: String(bundleManifest.bundle_ref),
    OPL_RUNTIME_ENVIRONMENT_LOCK_REF: String(lock.lock_ref),
    UV_CACHE_DIR: path.join(runtimeRoot, 'uv-cache'),
    UV_PROJECT_ENVIRONMENT: path.join(runtimeRoot, 'uv-project'),
  };
  fs.mkdirSync(envVars.UV_CACHE_DIR, { recursive: true });
  fs.mkdirSync(envVars.UV_PROJECT_ENVIRONMENT, { recursive: true });
  writeJsonFile(envPath, {
    surface_kind: 'opl_runtime_environment_env_bindings',
    version: 'opl-runtime-environment-env-bindings.v1',
    env_vars: envVars,
    binary_paths: {},
    writes_domain_truth: false,
    can_schedule_domain_stage: false,
  });
  const receipt = {
    surface_kind: 'opl_runtime_environment_materialization_receipt',
    version: 'opl-runtime-environment-materialization-receipt.v1',
    status: 'materialized',
    domain_id: target.domain_id,
    profile_id: target.profile_id,
    platform_id: target.platform_id,
    target_pointer: targetPointer,
    runtime_root: runtimeRoot,
    runtime_root_ref: stateRef(runtimeRoot),
    lock_ref: lock.lock_ref,
    lock_digest: lock.lock_digest,
    lock_state_ref: stateRef(lockPath),
    bundle_ref: bundleManifest.bundle_ref,
    bundle_digest: bundleManifest.bundle_digest,
    bundle_manifest_state_ref: stateRef(manifestPath),
    layer_count: bundleManifest.layer_count,
    env_ref: stateRef(envPath),
    materialization_receipt_ref: stateRef(receiptPath),
    writes_runtime_root: true,
    writes_development_checkout: false,
    writes_domain_repo: false,
    can_claim_runtime_ready: true,
    can_claim_domain_ready: false,
    can_claim_app_release_ready: false,
    can_sign_owner_receipt: false,
    can_create_typed_blocker: false,
    authority_boundary: authorityBoundary(),
  };
  writeJsonFile(receiptPath, receipt);
  if (targetPointer === 'current' || targetPointer === RUNTIME_ENVIRONMENT_FALLBACK_POINTER) {
    writePointer(target, targetPointer, {
      surface_kind: 'opl_runtime_environment_pointer',
      version: 'opl-runtime-environment-pointer.v1',
      pointer_kind: targetPointer,
      status: 'bound',
      runtime_root: runtimeRoot,
      receipt_ref: stateRef(receiptPath),
      bundle_ref: bundleManifest.bundle_ref,
      lock_ref: lock.lock_ref,
      updated_at: new Date().toISOString(),
    });
  }
  const refreshedBundleManifest = bundleManifestProjection(input);
  return {
    ...baseReadback('materialize', input, {
      dry_run: false,
      can_claim_runtime_ready: true,
    }),
    bundle_manifest: refreshedBundleManifest,
    materialization_plan: {
      surface_kind: 'opl_runtime_environment_materialization_plan',
      status: 'materialized_receipt_written',
      target_pointer: targetPointer,
      requested_apply: input.apply === true,
      dry_run: false,
      applied: true,
      can_apply: true,
      runtime_root: runtimeRoot,
      runtime_root_ref: stateRef(runtimeRoot),
      receipt_ref: stateRef(receiptPath),
      env_ref: stateRef(envPath),
      writes_runtime_root: true,
      updates_current_pointer: targetPointer === 'current',
      updates_rollback_pointer: targetPointer === RUNTIME_ENVIRONMENT_FALLBACK_POINTER,
      protects_current_pointer: true,
      protects_rollback_pointer: true,
      apply_blocker_ref: null,
      steps: [
        'persist_runtime_lock',
        'persist_bundle_manifest',
        'write_layer_manifests',
        'write_materialized_runtime_root_envelope',
        'write_materialization_receipt',
        'update_selected_pointer',
      ],
      receipt,
    },
  };
}

export function buildRuntimeEnvironmentVerifyReadback(input: RuntimeEnvironmentVerifyInput) {
  const runtimeRoot = path.resolve(input.runtimeRoot);
  const receiptPath = path.join(runtimeRoot, 'materialization-receipt.json');
  const envPath = path.join(runtimeRoot, 'env.json');
  const receipt = readJsonObject(receiptPath);
  const envBindings = readJsonObject(envPath);
  const status = receipt?.status === 'materialized' && envBindings ? 'verified' : 'missing_receipt';
  return {
    ...baseReadback('verify', {}, {
      dry_run: false,
      can_claim_runtime_ready: status === 'verified',
    }),
    verification: {
      surface_kind: 'opl_runtime_environment_verification_receipt',
      version: 'opl-runtime-environment-verification-receipt.v1',
      status,
      runtime_root: runtimeRoot,
      receipt_ref: fs.existsSync(receiptPath) ? stateRef(receiptPath) : null,
      env_ref: fs.existsSync(envPath) ? stateRef(envPath) : null,
      receipt,
      env_bindings: envBindings,
      writes_runtime_root: false,
      writes_domain_truth: false,
      can_claim_runtime_ready: status === 'verified',
      can_claim_domain_ready: false,
      can_claim_app_release_ready: false,
    },
  };
}

export function buildRuntimeEnvironmentCacheInventoryReadback() {
  return {
    ...baseReadback('cache inventory'),
    cache_inventory: cacheInventoryProjection(),
  };
}

export function buildRuntimeEnvironmentCachePruneReadback(input: RuntimeEnvironmentCachePruneInput = {}) {
  return {
    ...baseReadback('cache prune'),
    cleanup_plan: cleanupPlanProjection(input),
  };
}

export function buildRuntimeEnvironmentDoctorReadback() {
  return {
    ...baseReadback('doctor'),
    doctor: {
      surface_kind: 'opl_runtime_environment_doctor',
      status: 'runtime_lock_materializer_verify_cache_prune_run_context_guard_available',
      can_block_domain_progress: false,
      findings: [
        {
          severity: 'info',
          code: 'runtime_environment_lock_manifest_projection_available',
          message:
            'Runtime environment descriptor, lock, bundle manifest, cache inventory, and cleanup plan readbacks are available.',
          can_block_domain_progress: false,
          can_claim_runtime_ready: false,
        },
        {
          severity: 'info',
          code: 'runtime_environment_materializer_verify_prune_available',
          message:
            'Explicit --apply can write an OPL-managed runtime root, materialization receipt, verification readback, and protected cache prune receipt without writing domain truth or App release authority.',
          can_block_domain_progress: false,
          can_claim_runtime_ready: true,
          can_claim_domain_ready: false,
          can_claim_app_release_ready: false,
        },
        {
          severity: 'info',
          code: 'runtime_environment_prepare_apply_managed_library_available',
          message:
            'Dependency prepare --apply may install missing language packages only into the OPL-managed library path and writes run-context refs for consumers.',
          can_block_domain_progress: false,
          can_claim_runtime_ready: false,
        },
        {
          severity: 'info',
          code: 'runtime_environment_run_context_consumer_preflight_available',
          message:
            'Run-context readback fail-closes when paper root, dependency_run_context.json, or target identity is missing or mismatched; consumers must not fall back to host environment packages.',
          can_block_domain_progress: false,
          host_environment_fallback_allowed: false,
          can_claim_provider_ready: false,
          can_claim_domain_ready: false,
          can_claim_app_release_ready: false,
        },
      ],
    },
  };
}

export function buildRuntimeEnvironmentRunContextReadback(input: RuntimeEnvironmentTargetInput) {
  const target = normalizeTarget(input);
  const bundleManifest = bundleManifestProjection(input);
  if (input.paperRoot) {
    const runContextPath = path.join(path.resolve(input.paperRoot), 'build', 'dependency_run_context.json');
    if (fs.existsSync(runContextPath)) {
      const runContext = parseJsonText(fs.readFileSync(runContextPath, 'utf8')) as JsonRecord;
      const targetMismatchFields = runContextTargetMismatchFields(target, runContext);
      const consumerPreflight = targetMismatchFields.length === 0
        ? buildRunContextConsumerPreflight('bound')
        : buildRunContextConsumerPreflight('target_mismatch', targetMismatchFields);
      return {
        ...baseReadback('run-context', input),
        run_context: {
          ...runContext,
          runtime_lock_ref: bundleManifest.lock_ref,
          bundle_manifest_ref: bundleManifest.bundle_ref,
          writes_domain_truth: false,
          writes_runtime_root: false,
          can_schedule_domain_stage: false,
          can_claim_provider_ready: false,
          can_claim_runtime_ready: false,
          can_claim_domain_ready: false,
          can_claim_app_release_ready: false,
          consumer_boundary: runtimeEnvironmentConsumerBoundary(),
          consumer_preflight: consumerPreflight,
        },
      };
    }
    return {
      ...baseReadback('run-context', input),
      run_context: {
        surface_kind: 'opl_runtime_environment_run_context',
        status: 'missing_run_context',
        paper_root: path.resolve(input.paperRoot),
        run_context_ref: relativePaperBuildRef('dependency_run_context.json'),
        environment_bindings: {},
        runtime_lock_ref: bundleManifest.lock_ref,
        bundle_manifest_ref: bundleManifest.bundle_ref,
        runtime_root: null,
        materialization_receipt_ref: null,
        writes_domain_truth: false,
        writes_domain_memory_body: false,
        writes_artifact_body: false,
        writes_runtime_root: false,
        can_schedule_domain_stage: false,
        can_claim_provider_ready: false,
        can_claim_runtime_ready: false,
        can_claim_domain_ready: false,
        can_claim_app_release_ready: false,
        consumer_boundary: runtimeEnvironmentConsumerBoundary(),
        consumer_preflight: buildRunContextConsumerPreflight('missing_run_context'),
      },
    };
  }
  return {
    ...baseReadback('run-context', input),
    run_context: {
      surface_kind: 'opl_runtime_environment_run_context',
      status: 'planned_not_bound',
      environment_bindings: {},
      runtime_lock_ref: bundleManifest.lock_ref,
      bundle_manifest_ref: bundleManifest.bundle_ref,
      runtime_root: null,
      materialization_receipt_ref: null,
      writes_domain_truth: false,
      writes_domain_memory_body: false,
      writes_artifact_body: false,
      writes_runtime_root: false,
      can_schedule_domain_stage: false,
      can_claim_provider_ready: false,
      can_claim_runtime_ready: false,
      can_claim_domain_ready: false,
      can_claim_app_release_ready: false,
      consumer_boundary: runtimeEnvironmentConsumerBoundary(),
      consumer_preflight: buildRunContextConsumerPreflight('paper_root_not_supplied'),
    },
  };
}

export function buildRuntimeEnvironmentContractReadback() {
  return {
    surface_kind: 'opl_runtime_environment_contract_readback' as const,
    version: 'opl-runtime-environment-contract-readback.v1' as const,
    contract_path: path.relative(process.cwd(), CONTRACT_PATH),
    contract: RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT,
    authority_boundary: authorityBoundary(),
  };
}
