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
  installPythonPackagesIntoManagedEnv,
  installRPackagesIntoManagedLibrary,
  installedPythonPackages,
  installedRPackages,
  locksRoot,
  normalizeTarget,
  objects,
  readJsonObject,
  readPrepareProfile,
  relativePaperBuildRef,
  requirementProfileIdentity,
  receiptsRoot,
  resolveBinary,
  runtimeEnvironmentConsumerBoundary,
  RUNTIME_ENVIRONMENT_FALLBACK_POINTER,
  runtimeLockProjection,
  runtimeRootForBundle,
  safeSegment,
  sandboxProviderPlan,
  shortDigest,
  statePathFromRef,
  stateRef,
  normalizePythonPackageName,
  pythonExecutableInManagedEnv,
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
  buildRuntimeEnvironmentBuildReadback,
} from './runtime-environment-substrate-parts/build-readback.ts';

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
    sandbox_provider_plan: sandboxProviderPlan(input),
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

export function buildRuntimeEnvironmentPrepareReadback(input: RuntimeEnvironmentPrepareInput) {
  const target = normalizeTarget(input);
  const {
    profile,
    selected,
    selectedRequirementProfileIds,
    runtimeBinaries,
    requiredRPackages,
    requiredRPackageRequirements,
    requiredPythonPackages,
    requiredPythonPackageRequirements,
  } = readPrepareProfile(
    input.requirementProfilePath,
    input.requirementProfileId,
  );
  const buildRoot = path.join(path.resolve(input.paperRoot), 'build');
  fs.mkdirSync(buildRoot, { recursive: true });

  const binaryPaths: Record<string, string> = {};
  const missingBinaries: string[] = [];
  const requiredRuntimeBinaries = Array.from(new Set([
    ...runtimeBinaries,
    ...(requiredPythonPackages.length > 0 ? ['python3', 'uv'] : []),
  ]));
  requiredRuntimeBinaries.forEach((binaryName) => {
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
  const managedPythonEnvironmentPath = path.join(
    dependencyLibrariesRoot(target),
    shortDigest({
      requirement_profile: path.resolve(input.requirementProfilePath),
      requested_requirement_profile_id: input.requirementProfileId ?? null,
      selected_requirement_profile_id: selected.profile_id ?? null,
      selected_requirement_profile_ids: selectedRequirementProfileIds,
      required_python_packages: requiredPythonPackages,
    }),
    'python',
  );
  const managedPythonPath = pythonExecutableInManagedEnv(managedPythonEnvironmentPath);
  let installedPythonPackageNames = fs.existsSync(managedPythonPath)
    ? installedPythonPackages(managedPythonPath)
    : new Set<string>();
  let missingPythonPackages = requiredPythonPackages.filter(
    (packageName) => !installedPythonPackageNames.has(normalizePythonPackageName(packageName)),
  );
  const pythonInstallReceipt = input.apply
    && requiredPythonPackages.length > 0
    && binaryPaths.python3
    && binaryPaths.uv
    && missingBinaries.length === 0
    ? installPythonPackagesIntoManagedEnv(
      binaryPaths.uv,
      binaryPaths.python3,
      managedPythonEnvironmentPath,
      missingPythonPackages,
    )
    : {
      status: input.apply && requiredPythonPackages.length === 0 ? 'not_required' : 'not_requested',
      installed: [],
      failed: [],
      managed_environment_path: managedPythonEnvironmentPath,
      verified_with: 'importlib.metadata.distributions() in managed Python environment',
      stderr: '',
    };
  if (input.apply && pythonInstallReceipt.status !== 'not_requested' && fs.existsSync(managedPythonPath)) {
    installedPythonPackageNames = installedPythonPackages(managedPythonPath);
    missingPythonPackages = requiredPythonPackages.filter(
      (packageName) => !installedPythonPackageNames.has(normalizePythonPackageName(packageName)),
    );
  }
  const status = missingBinaries.length > 0
    ? 'missing_runtime_binary'
    : missingRPackages.length > 0 || missingPythonPackages.length > 0
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
    environment_tier: 'fast_local_env',
    host_binary_allowed: true,
    host_package_fallback_allowed: false,
    domain_id: target.domain_id,
    profile_id: target.profile_id,
    platform_id: target.platform_id,
    dependency_profile_ref: path.resolve(input.requirementProfilePath),
    requested_requirement_profile_id: input.requirementProfileId ?? null,
    selected_requirement_profile_id: selected.profile_id ?? null,
    selected_requirement_profile_ids: selectedRequirementProfileIds,
    requirement_profile_identity: profileIdentity,
    source_requirement_refs: [path.resolve(input.requirementProfilePath)],
    runtime_binaries: requiredRuntimeBinaries,
    language_environment_model: {
      r: {
        binary: 'Rscript',
        managed_library_env: 'R_LIBS_USER',
        standard_tool_handoff: 'renv',
      },
      python: {
        binary: 'python3',
        standard_tool_handoff: 'uv',
        managed_environment_env: 'UV_PROJECT_ENVIRONMENT',
      },
    },
    required_r_packages: requiredRPackages,
    managed_required_r_packages: managedRequiredRPackages,
    base_or_recommended_r_packages: baseRPackageRequirements,
    r_package_requirements: requiredRPackageRequirements,
    required_python_packages: requiredPythonPackages,
    managed_required_python_packages: requiredPythonPackages,
    python_package_requirements: requiredPythonPackageRequirements,
    package_installation_requested: input.apply === true,
    installed_packages: input.apply === true
      && (installReceipt.status === 'installed' || installReceipt.status === 'not_required')
      && (pythonInstallReceipt.status === 'installed' || pythonInstallReceipt.status === 'not_required'),
    managed_r_library_path: managedLibraryPath,
    managed_python_environment_path: managedPythonEnvironmentPath,
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
    environment_tier: 'fast_local_env',
    host_binary_allowed: true,
    host_package_fallback_allowed: false,
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
    installed_packages: input.apply === true
      && (installReceipt.status === 'installed' || installReceipt.status === 'not_required')
      && (pythonInstallReceipt.status === 'installed' || pythonInstallReceipt.status === 'not_required'),
    managed_r_library_path: managedLibraryPath,
    managed_python_environment_path: managedPythonEnvironmentPath,
    managed_required_r_packages: managedRequiredRPackages,
    managed_required_python_packages: requiredPythonPackages,
    base_or_recommended_r_packages: baseRPackageRequirements,
    r_package_requirements: requiredRPackageRequirements,
    python_package_requirements: requiredPythonPackageRequirements,
    package_installation_receipt: installReceipt,
    python_package_installation_receipt: pythonInstallReceipt,
    lock_ref: lockRef,
    lock_sha256: lockWithDigest.lock_sha256,
    binary_paths: binaryPaths,
    missing_runtime_binaries: missingBinaries,
    missing_r_packages: missingRPackages,
    missing_python_packages: missingPythonPackages,
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
      environment_tier: 'fast_local_env',
      host_binary_allowed: true,
      host_package_fallback_allowed: false,
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
        OPL_RUNTIME_ENVIRONMENT_TIER: 'fast_local_env',
        R_LIBS_USER: managedLibraryPath,
        UV_PROJECT_ENVIRONMENT: managedPythonEnvironmentPath,
        VIRTUAL_ENV: managedPythonEnvironmentPath,
      },
      language_environment_model: {
        r: {
          binary_path: binaryPaths.Rscript ?? null,
          managed_library_env: 'R_LIBS_USER',
          managed_library_path: managedLibraryPath,
          standard_tool_handoff: 'renv',
        },
        python: {
          binary_path: binaryPaths.python3 ?? null,
          uv_binary_path: binaryPaths.uv ?? null,
          standard_tool_handoff: 'uv',
          managed_environment_env: 'UV_PROJECT_ENVIRONMENT',
          managed_environment_path: managedPythonEnvironmentPath,
        },
      },
      managed_r_library_path: managedLibraryPath,
      managed_python_environment_path: managedPythonEnvironmentPath,
      managed_required_r_packages: managedRequiredRPackages,
      managed_required_python_packages: requiredPythonPackages,
      base_or_recommended_r_packages: baseRPackageRequirements,
      package_installation_requested: input.apply === true,
      installed_packages: input.apply === true
        && (installReceipt.status === 'installed' || installReceipt.status === 'not_required')
        && (pythonInstallReceipt.status === 'installed' || pythonInstallReceipt.status === 'not_required'),
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
      environment_tier: 'fast_local_env',
      host_binary_allowed: true,
      host_package_fallback_allowed: false,
      failure_class: failureClass,
      package_installation_requested: input.apply === true,
      installed_packages: input.apply === true
        && (installReceipt.status === 'installed' || installReceipt.status === 'not_required')
        && (pythonInstallReceipt.status === 'installed' || pythonInstallReceipt.status === 'not_required'),
      managed_r_library_path: managedLibraryPath,
      managed_python_environment_path: managedPythonEnvironmentPath,
      selected_requirement_profile_ids: selectedRequirementProfileIds,
      requirement_profile_identity: profileIdentity,
      managed_required_r_packages: managedRequiredRPackages,
      managed_required_python_packages: requiredPythonPackages,
      base_or_recommended_r_packages: baseRPackageRequirements,
      package_installation_receipt: installReceipt,
      python_package_installation_receipt: pythonInstallReceipt,
      writes_domain_truth: false,
      writes_runtime_root: false,
      lock_ref: lockRef,
      receipt_ref: receiptRef,
      run_context_ref: status === 'prepared' ? runContextRef : null,
      binary_paths: binaryPaths,
      missing_runtime_binaries: missingBinaries,
      missing_r_packages: missingRPackages,
      missing_python_packages: missingPythonPackages,
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
  const sandboxPlan = sandboxProviderPlan(input);
  const targetPointer = input.targetPointer ?? 'current';
  if (!input.apply) {
    return {
      ...baseReadback('materialize', input),
      bundle_manifest: bundleManifest,
      sandbox_provider_plan: sandboxPlan,
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
  if (target.sandbox_provider === 'external_sandbox') {
    const adapter = sandboxPlan.adapter as JsonRecord | null;
    if (adapter?.configured === true) {
      const receiptPath = path.join(receiptsRoot(target), `${shortDigest({
        sandbox_binding_ref: adapter.sandbox_binding_ref,
        provider_receipt_ref: adapter.provider_receipt_ref,
      })}.json`);
      const receipt = {
        surface_kind: 'opl_external_sandbox_provider_binding_receipt',
        version: 'opl-external-sandbox-provider-binding-receipt.v1',
        status: 'provider_receipt_bound',
        domain_id: target.domain_id,
        profile_id: target.profile_id,
        platform_id: target.platform_id,
        target_pointer: targetPointer,
        sandbox_provider: target.sandbox_provider,
        adapter_id: adapter.adapter_id,
        adapter_status: adapter.adapter_status,
        provider_role: adapter.provider_role,
        selected_external_substrate: adapter.selected_external_substrate,
        endpoint: adapter.endpoint,
        credential_ref: adapter.credential_ref,
        provider_receipt_ref: adapter.provider_receipt_ref,
        sandbox_binding_ref: adapter.sandbox_binding_ref,
        template_ref: adapter.template_ref,
        receipt_ref: stateRef(receiptPath),
        writes_runtime_root: false,
        writes_development_checkout: false,
        writes_domain_repo: false,
        credential_material_read: false,
        external_api_called: false,
        provider_lifecycle_managed: false,
        creates_cloud_resource: false,
        temporal_durable_workflow_substrate_replacement: false,
        can_claim_provider_ready: false,
        can_claim_runtime_ready: false,
        can_claim_domain_ready: false,
        can_claim_app_release_ready: false,
        authority_boundary: authorityBoundary(),
      };
      writeJsonFile(receiptPath, receipt);
      return {
        ...baseReadback('materialize', input),
        bundle_manifest: bundleManifest,
        sandbox_provider_plan: sandboxPlan,
        materialization_plan: {
          surface_kind: 'opl_runtime_environment_materialization_plan',
          status: 'external_sandbox_provider_binding_receipt_written',
          target_pointer: targetPointer,
          requested_apply: true,
          dry_run: false,
          applied: true,
          can_apply: true,
          runtime_root: null,
          receipt_ref: stateRef(receiptPath),
          writes_runtime_root: false,
          updates_current_pointer: false,
          updates_rollback_pointer: false,
          protects_current_pointer: true,
          protects_rollback_pointer: true,
          apply_blocker_ref: null,
          steps: [
            'select_external_sandbox_provider',
            'read_provider_profile_refs',
            'bind_opl_run_context_to_provider_receipt',
            'write_external_sandbox_provider_binding_receipt',
          ],
          receipt,
          can_claim_provider_ready: false,
          can_claim_runtime_ready: false,
          can_claim_domain_ready: false,
        },
      };
    }
    return {
      ...baseReadback('materialize', input),
      bundle_manifest: bundleManifest,
      sandbox_provider_plan: sandboxPlan,
      materialization_plan: {
        surface_kind: 'opl_runtime_environment_materialization_plan',
        status: 'external_sandbox_provider_apply_blocked',
        target_pointer: targetPointer,
        requested_apply: true,
        dry_run: false,
        applied: false,
        can_apply: false,
        runtime_root: null,
        receipt_ref: null,
        writes_runtime_root: false,
        updates_current_pointer: false,
        updates_rollback_pointer: false,
        protects_current_pointer: true,
        protects_rollback_pointer: true,
        apply_blocker_ref: 'external_sandbox_provider_adapter_unconfigured',
        route_hint: 'configure_external_sandbox_provider_adapter',
        steps: [
          'select_external_sandbox_provider',
          'resolve_template_or_snapshot_ref',
          'create_or_resume_provider_sandbox',
          'collect_provider_receipt',
          'bind_opl_run_context_to_provider_receipt',
        ],
        can_claim_provider_ready: false,
        can_claim_runtime_ready: false,
        can_claim_domain_ready: false,
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
    sandbox_provider_plan: sandboxPlan,
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
          code: 'fast_local_env_prepare_apply_managed_library_available',
          message:
            'Fast Local Env prepare --apply may use host language binaries while installing missing language packages only into the OPL-managed library path and writing run-context refs for consumers.',
          can_block_domain_progress: false,
          environment_tier: 'fast_local_env',
          host_binary_allowed: true,
          host_environment_fallback_allowed: false,
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
        {
          severity: 'info',
          code: 'external_agent_sandbox_provider_adapter_available_as_target',
          message:
            'External sandbox providers can carry isolated filesystem, process, git, template, snapshot, and persistence substrate; OPL requires a live provider receipt before provider-ready or runtime-ready claims.',
          can_block_domain_progress: false,
          temporal_replacement: false,
          can_claim_provider_ready: false,
          can_claim_runtime_ready: false,
          can_claim_domain_ready: false,
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
          environment_tier: 'fast_local_env',
          host_binary_allowed: true,
          host_package_fallback_allowed: false,
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
      environment_tier: 'fast_local_env',
      host_binary_allowed: true,
      host_package_fallback_allowed: false,
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
