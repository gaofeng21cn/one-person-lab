import { EnvironmentOperation, EnvironmentInterruptedError } from './runtime-environment-process.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import fs from 'node:fs';
import path from 'node:path';
import { acquirePreparationLock, preparedDependencyCache, recordDependencyInventory, requirementFileDigests } from './runtime-environment-substrate-parts/prepared-cache.ts';
import { baseOrRecommendedRPackages, buildRunContextConsumerPreflight, installPythonPackagesIntoManagedEnv,
  installRPackagesIntoManagedLibrary, installedPythonPackages, installedRPackages, readPrepareProfile,
  requirementProfileIdentity, resolveBinary, runtimeEnvironmentConsumerBoundary, normalizePythonPackageName,
  pythonExecutableInManagedEnv, unsatisfiedRRequirements } from './runtime-environment-substrate-parts/package-profile.ts';
import { contentFingerprint, normalizeTarget, relativeArtifactBuildRef, requiredRuntimeArtifactRoot,
  writeJsonFile, readJsonObject, writePreparedEnvironmentIndex } from './runtime-environment-substrate-parts/target-state.ts';
import { profileLockHandoff, uniqueRefs } from './runtime-environment-substrate-parts/language-lock-handoff.ts';
import { baseReadback } from './runtime-environment-substrate-parts/projection-cache.ts';
import type { JsonRecord, RuntimeEnvironmentPrepareInput } from './runtime-environment-substrate-parts/contract.ts';

export async function buildRuntimeEnvironmentPrepareReadback(input: RuntimeEnvironmentPrepareInput) {
  const operation = new EnvironmentOperation(input.prepareTimeoutMs ?? 600000);
  let buildRoot = '';
  let manifestPath: string | undefined;
  let releasePreparation: (() => void) | undefined;
  try {
    const target = normalizeTarget(input);
    const artifactRoot = requiredRuntimeArtifactRoot(input);
    buildRoot = path.join(path.resolve(artifactRoot), 'build');
    fs.mkdirSync(buildRoot, { recursive: true });
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
      input.requirementProfileIds,
    );
    const languageLockHandoff = profileLockHandoff(profile, selectedRequirementProfileIds);
    const requirementLockRefs = uniqueRefs([
      ...languageLockHandoff.r.lock_refs,
      ...languageLockHandoff.python.lock_refs,
    ]);
    const sourceRequirementRefs = uniqueRefs([
      path.resolve(input.requirementProfilePath),
      ...requirementLockRefs,
      ...languageLockHandoff.r.source_refs,
      ...languageLockHandoff.r.project_refs,
      ...languageLockHandoff.python.source_refs,
      ...languageLockHandoff.python.project_refs,
    ]);
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

    const fileDigests = requirementFileDigests(sourceRequirementRefs, input.requirementProfilePath);
    const cache = preparedDependencyCache({
      r: requiredRPackageRequirements, python: requiredPythonPackageRequirements,
      locks: requirementLockRefs.map((ref) => fileDigests[path.isAbsolute(ref) ? ref : path.resolve(path.dirname(input.requirementProfilePath), ref)] ?? ref),
    }, binaryPaths, input.refresh);
    releasePreparation = await acquirePreparationLock(cache.root, operation);
    manifestPath = cache.manifestPath;
    cache.manifest = input.refresh ? null : readJsonObject(cache.manifestPath);
    const cacheHit = Boolean(cache.manifest);
    const rscriptPath = binaryPaths.Rscript;
    const baseRPackages = cache.manifest && Array.isArray(cache.manifest.base_r_packages)
      ? new Set(cache.manifest.base_r_packages as string[])
      : rscriptPath && requiredRPackages.length ? await baseOrRecommendedRPackages(rscriptPath, operation) : new Set<string>();
    const managedRPackageRequirements = requiredRPackageRequirements
      .filter((requirement) => !baseRPackages.has(requirement.name));
    const baseRPackageRequirements = requiredRPackageRequirements
      .filter((requirement) => baseRPackages.has(requirement.name))
      .map((requirement) => requirement.name);
    const managedRequiredRPackages = managedRPackageRequirements.map((requirement) => requirement.name);
    const managedLibraryPath = path.join(cache.root, 'R');
    let installedPackages = cache.manifest && fs.existsSync(managedLibraryPath)
      ? new Set(cache.manifest.managed_r_packages as string[])
      : rscriptPath && managedRequiredRPackages.length ? await installedRPackages(rscriptPath, managedLibraryPath, operation) : new Set<string>();
    let missingRPackages = rscriptPath
      ? managedRequiredRPackages.filter((packageName) => !installedPackages.has(packageName))
      : managedRequiredRPackages;
    if (rscriptPath && !cache.manifest) {
      const unsatisfied = await unsatisfiedRRequirements(rscriptPath, managedLibraryPath, managedRPackageRequirements, operation);
      missingRPackages = [...new Set([...missingRPackages, ...unsatisfied])];
    }
    operation.phase = 'dependency_installation';
    const installReceipt = input.apply && rscriptPath && missingBinaries.length === 0
      ? await installRPackagesIntoManagedLibrary(
        rscriptPath,
        managedLibraryPath,
        managedRPackageRequirements,
        missingRPackages,
        operation,
      )
      : {
        status: input.apply ? 'not_required' : 'not_requested',
        installed: [],
        failed: [],
        managed_library_path: managedLibraryPath,
        verified_with: 'installed.packages(lib.loc = managed_library_path)',
        stderr: '',
      };
    operation.phase = 'dependency_validation';
    if (input.apply && rscriptPath && installReceipt.status === 'installed') {
      installedPackages = await installedRPackages(rscriptPath, managedLibraryPath, operation);
      missingRPackages = [...new Set([...managedRequiredRPackages.filter((packageName) => !installedPackages.has(packageName)),
        ...await unsatisfiedRRequirements(rscriptPath, managedLibraryPath, managedRPackageRequirements, operation)])];
    }
    const managedPythonEnvironmentPath = path.join(cache.root, 'python');
    const managedPythonPath = pythonExecutableInManagedEnv(managedPythonEnvironmentPath);
    let installedPythonPackageNames = cache.manifest && fs.existsSync(managedPythonPath)
      ? new Set((cache.manifest.managed_python_packages as string[]).map(normalizePythonPackageName))
      : fs.existsSync(managedPythonPath) ? await installedPythonPackages(managedPythonPath, operation) : new Set<string>();
    let missingPythonPackages = requiredPythonPackages.filter(
      (packageName) => !installedPythonPackageNames.has(normalizePythonPackageName(packageName)),
    );
    operation.phase = 'dependency_installation';
    const pythonInstallReceipt = input.apply
      && requiredPythonPackages.length > 0
      && binaryPaths.python3
      && binaryPaths.uv
      && missingBinaries.length === 0
      ? await installPythonPackagesIntoManagedEnv(
        binaryPaths.uv,
        binaryPaths.python3,
        managedPythonEnvironmentPath,
        cache.manifest ? missingPythonPackages : requiredPythonPackages,
        operation,
      )
      : {
        status: input.apply && requiredPythonPackages.length === 0 ? 'not_required' : 'not_requested',
        installed: [],
        failed: [],
        managed_environment_path: managedPythonEnvironmentPath,
        verified_with: 'importlib.metadata.distributions() in managed Python environment',
        stderr: '',
      };
    operation.phase = 'dependency_validation';
    if (input.apply && pythonInstallReceipt.status === 'installed' && fs.existsSync(managedPythonPath)) {
      installedPythonPackageNames = await installedPythonPackages(managedPythonPath, operation);
      missingPythonPackages = requiredPythonPackages.filter(
        (packageName) => !installedPythonPackageNames.has(normalizePythonPackageName(packageName)),
      );
    }
    const status = missingBinaries.length > 0
      ? 'missing_runtime_binary'
      : missingRPackages.length > 0 || missingPythonPackages.length > 0 || installReceipt.status === 'failed' || pythonInstallReceipt.status === 'failed'
        ? 'missing_language_package'
        : 'prepared';
    const failureClass = status === 'prepared' ? '' : status;
    if (status !== 'prepared') fs.rmSync(cache.manifestPath, { force: true });
    if (status === 'prepared' && !cache.manifest) {
      cache.manifest = await recordDependencyInventory(cache, {
        binaryPaths, rLibrary: managedLibraryPath, python: managedPythonPath,
        rPackages: [...installedPackages], pythonPackages: [...installedPythonPackageNames],
        baseRPackages: [...baseRPackages], operation,
      });
    }
    const environmentManifestRef = cache.manifest?.environment_manifest_ref ?? cache.manifestPath;
    if (requiredPythonPackages.length > 0 && fs.existsSync(managedPythonPath)) binaryPaths.python3 = managedPythonPath;

    const lockRef = relativeArtifactBuildRef('dependency_environment_lock.json');
    const receiptRef = relativeArtifactBuildRef('dependency_environment_receipt.json');
    const runContextRef = relativeArtifactBuildRef('dependency_run_context.json');
    const profileIdentity = requirementProfileIdentity(
      input.requirementProfilePath,
      input.requirementProfileId,
      selectedRequirementProfileIds,
      profile,
    );
    const requirementIdentity = {
      ...profileIdentity,
      language_lock_handoff: languageLockHandoff,
      requirement_lock_refs: requirementLockRefs,
      source_requirement_refs: sourceRequirementRefs,
      profile_fingerprint: contentFingerprint({
        ...profileIdentity,
        language_lock_handoff: languageLockHandoff,
        requirement_lock_refs: requirementLockRefs,
        source_requirement_refs: sourceRequirementRefs,
      }),
    };
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
      requested_requirement_profile_id: selectedRequirementProfileIds.length === 1 ? selectedRequirementProfileIds[0] : null,
      requested_requirement_profile_ids: input.requirementProfileIds ?? (input.requirementProfileId ? [input.requirementProfileId] : []),
      selected_requirement_profile_id: selected.profile_id ?? null,
      selected_requirement_profile_ids: selectedRequirementProfileIds,
      requirement_profile_identity: requirementIdentity,
      requirement_lock_refs: requirementLockRefs,
      source_requirement_refs: sourceRequirementRefs,
      runtime_binaries: requiredRuntimeBinaries,
      language_environment_model: {
        r: {
          binary: 'Rscript',
          managed_library_env: 'R_LIBS_USER',
          standard_tool_handoff: 'renv',
          lock_handoff: languageLockHandoff.r,
        },
        python: {
          binary: 'python3',
          standard_tool_handoff: 'uv',
          managed_environment_env: 'UV_PROJECT_ENVIRONMENT',
          lock_handoff: languageLockHandoff.python,
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
    const timingsMs = { prepare: performance.now() - operation.started, lock_wait: operation.lockWaitMs };
    const cacheOutcome = input.refresh ? 'refreshed' : cacheHit ? 'shared_hit' : 'prepared';
    const receipt = {
      timings_ms: timingsMs, cache_outcome: cacheOutcome,
      surface_kind: 'opl_runtime_environment_dependency_receipt',
      version: 'opl-runtime-environment-dependency-receipt.v1',
      status,
      environment_tier: 'fast_local_env',
      host_binary_allowed: true,
      host_package_fallback_allowed: false,
      failure_class: failureClass,
      failure_phase: status === 'prepared' ? null : installReceipt.status === 'failed' || pythonInstallReceipt.status === 'failed' ? 'dependency_installation' : 'dependency_validation',
      domain_id: target.domain_id,
      profile_id: target.profile_id,
      platform_id: target.platform_id,
      dependency_profile_ref: path.resolve(input.requirementProfilePath),
      requested_requirement_profile_id: selectedRequirementProfileIds.length === 1 ? selectedRequirementProfileIds[0] : null,
      requested_requirement_profile_ids: input.requirementProfileIds ?? (input.requirementProfileId ? [input.requirementProfileId] : []),
      selected_requirement_profile_id: selected.profile_id ?? null,
      selected_requirement_profile_ids: selectedRequirementProfileIds,
      requirement_profile_identity: requirementIdentity,
      requirement_lock_refs: requirementLockRefs,
      source_requirement_refs: sourceRequirementRefs,
      language_lock_handoff: languageLockHandoff,
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
    writeJsonFile(path.join(buildRoot, 'dependency_environment_lock.json'), lockWithDigest);
    writeJsonFile(path.join(buildRoot, 'dependency_environment_receipt.json'), receipt);

    let runContext: JsonRecord | null = null;
    if (status !== 'prepared') fs.rmSync(path.join(buildRoot, 'dependency_run_context.json'), { force: true });
    if (status === 'prepared') {
      runContext = {
        surface_kind: 'opl_runtime_environment_dependency_run_context',
        environment_id: cache.environmentId,
        environment_manifest_ref: environmentManifestRef,
        environment_ready_ref: cache.manifestPath,
        runtime_file_identities: cache.runtimeFiles,
        requirement_file_digests: fileDigests,

        version: 'opl-runtime-environment-dependency-run-context.v1',
        status,
        environment_tier: 'fast_local_env',
        host_binary_allowed: true,
        host_package_fallback_allowed: false,
        domain_id: target.domain_id,
        profile_id: target.profile_id,
        platform_id: target.platform_id,
        requested_requirement_profile_id: selectedRequirementProfileIds.length === 1 ? selectedRequirementProfileIds[0] : null,
        requested_requirement_profile_ids: input.requirementProfileIds ?? (input.requirementProfileId ? [input.requirementProfileId] : []),
        selected_requirement_profile_ids: selectedRequirementProfileIds,
        requirement_profile_identity: requirementIdentity,
        requirement_lock_refs: requirementLockRefs,
        source_requirement_refs: sourceRequirementRefs,
        language_lock_handoff: languageLockHandoff,
        lock_ref: lockRef,
        lock_sha256: lockWithDigest.lock_sha256,
        binary_paths: binaryPaths,
        env_vars: {
          OPL_RUNTIME_ENVIRONMENT_STATUS: 'prepared',
          OPL_RUNTIME_ENVIRONMENT_TIER: 'fast_local_env',
          R_LIBS_USER: managedLibraryPath,
          UV_PROJECT_ENVIRONMENT: managedPythonEnvironmentPath,
          VIRTUAL_ENV: managedPythonEnvironmentPath,
          ...(requiredPythonPackages.length > 0 ? { PATH: `${path.dirname(managedPythonPath)}${path.delimiter}${process.env.PATH ?? ''}` } : {}),
        },
        language_environment_model: {
          r: {
            binary_path: binaryPaths.Rscript ?? null,
            managed_library_env: 'R_LIBS_USER',
            managed_library_path: managedLibraryPath,
            standard_tool_handoff: 'renv',
            lock_handoff: languageLockHandoff.r,
          },
          python: {
            binary_path: binaryPaths.python3 ?? null,
            uv_binary_path: binaryPaths.uv ?? null,
            standard_tool_handoff: 'uv',
            managed_environment_env: 'UV_PROJECT_ENVIRONMENT',
            managed_environment_path: managedPythonEnvironmentPath,
            lock_handoff: languageLockHandoff.python,
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
      writeJsonFile(path.join(buildRoot, 'dependency_run_context.json'), runContext);
      writePreparedEnvironmentIndex({
        domain_id: target.domain_id,
        profile_id: target.profile_id,
        platform_id: target.platform_id,
        artifact_root: path.resolve(artifactRoot),
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
        timings_ms: timingsMs, cache_outcome: cacheOutcome,
        status,
        environment_tier: 'fast_local_env',
        host_binary_allowed: true,
        host_package_fallback_allowed: false,
        failure_class: failureClass,
      failure_phase: status === 'prepared' ? null : installReceipt.status === 'failed' || pythonInstallReceipt.status === 'failed' ? 'dependency_installation' : 'dependency_validation',
        package_installation_requested: input.apply === true,
        installed_packages: input.apply === true
          && (installReceipt.status === 'installed' || installReceipt.status === 'not_required')
          && (pythonInstallReceipt.status === 'installed' || pythonInstallReceipt.status === 'not_required'),
        managed_r_library_path: managedLibraryPath,
        managed_python_environment_path: managedPythonEnvironmentPath,
        environment_id: cache.environmentId,
        environment_manifest_ref: environmentManifestRef,
        environment_ready_ref: cache.manifestPath,
        cache_hit: cacheHit,
        selected_requirement_profile_ids: selectedRequirementProfileIds,
        requirement_profile_identity: requirementIdentity,
        requirement_lock_refs: requirementLockRefs,
        source_requirement_refs: sourceRequirementRefs,
        language_lock_handoff: languageLockHandoff,
        managed_required_r_packages: managedRequiredRPackages,
        managed_required_python_packages: requiredPythonPackages,
        base_or_recommended_r_packages: baseRPackageRequirements,
        r_package_requirements: requiredRPackageRequirements,
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
  } catch (error) {
    if (manifestPath) fs.rmSync(manifestPath, { force: true });
    const failure = error instanceof EnvironmentInterruptedError ? error.phase : operation.phase;
    if (buildRoot) {
      fs.rmSync(path.join(buildRoot, 'dependency_run_context.json'), { force: true });
      writeJsonFile(path.join(buildRoot, 'dependency_environment_receipt.json'), {
        surface_kind: 'opl_runtime_environment_dependency_receipt', status: 'failed', failure_phase: failure,
        error: error instanceof Error ? error.message.slice(-32768) : String(error),
        exit_code: error instanceof EnvironmentInterruptedError ? error.exitCode : 1,
        timings_ms: { prepare: performance.now() - operation.started, lock_wait: operation.lockWaitMs },
      });
    }
    if (error instanceof EnvironmentInterruptedError) {
      process.exitCode = error.exitCode;
      throw new FrameworkContractError('launcher_failed', error.message,
        { failure_phase: error.phase, stop_reason: error.reason }, error.exitCode);
    }
    throw error;
  } finally { releasePreparation?.(); operation.close(); }
}
