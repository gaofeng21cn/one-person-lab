import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureOplStateDir } from './runtime-state-paths.ts';

type JsonRecord = Record<string, unknown>;

export type RuntimeEnvironmentCommand =
  | 'inspect'
  | 'lock'
  | 'build'
  | 'materialize'
  | 'prepare'
  | 'cache status'
  | 'cache inventory'
  | 'cache prune'
  | 'doctor'
  | 'run-context';

export interface RuntimeEnvironmentTargetInput {
  domainId?: string;
  profileId?: string;
  platformId?: string;
  paperRoot?: string;
}

export interface RuntimeEnvironmentMaterializeInput extends RuntimeEnvironmentTargetInput {
  apply?: boolean;
  targetPointer?: 'current' | 'rollback' | 'staged';
}

export interface RuntimeEnvironmentCachePruneInput {
  apply?: boolean;
}

export interface RuntimeEnvironmentPrepareInput extends RuntimeEnvironmentTargetInput {
  requirementProfilePath: string;
  paperRoot: string;
}

const CONTRACT_REF = 'contracts/opl-framework/runtime-environment-substrate-contract.json';
const CONTRACT_PATH = fileURLToPath(new URL(`../${CONTRACT_REF}`, import.meta.url));

function readContract(): JsonRecord {
  return JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8')) as JsonRecord;
}

export const RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT = readContract();

function authorityBoundary() {
  return RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.authority_boundary as JsonRecord;
}

function cachePolicy() {
  return RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.cache_policy as JsonRecord;
}

function materializationPolicy() {
  return RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.materialization_policy as JsonRecord;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function defaultPlatform() {
  return process.platform === 'darwin' && process.arch === 'arm64'
    ? 'macos-arm64'
    : `${process.platform}-${process.arch}`;
}

function normalizeTarget(input: RuntimeEnvironmentTargetInput) {
  return {
    domain_id: input.domainId ?? 'family-defaults',
    profile_id: input.profileId ?? 'core',
    platform_id: input.platformId ?? defaultPlatform(),
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as JsonRecord;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function shortDigest(value: unknown): string {
  return sha256(value).slice(0, 24);
}

function targetRef(target: ReturnType<typeof normalizeTarget>) {
  return `${target.domain_id}/${target.profile_id}/${target.platform_id}`;
}

function relativePaperBuildRef(filename: string) {
  return `paper/build/${filename}`;
}

function contentFingerprint(value: unknown) {
  return `sha256:${sha256(value)}`;
}

function runtimeEnvironmentStateRoot() {
  return path.join(ensureOplStateDir().state_dir, 'runtime-environment');
}

function preparedEnvironmentIndexPath() {
  return path.join(runtimeEnvironmentStateRoot(), 'prepared-environments.json');
}

function readPreparedEnvironmentIndex(): JsonRecord[] {
  const indexPath = preparedEnvironmentIndexPath();
  if (!fs.existsSync(indexPath)) {
    return [];
  }
  const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  return Array.isArray(parsed) ? parsed.filter((entry): entry is JsonRecord => (
    Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
  )) : [];
}

function writePreparedEnvironmentIndex(entry: JsonRecord) {
  const root = runtimeEnvironmentStateRoot();
  fs.mkdirSync(root, { recursive: true });
  const entries = readPreparedEnvironmentIndex().filter((existing) => (
    existing.paper_root !== entry.paper_root
      || existing.domain_id !== entry.domain_id
      || existing.profile_id !== entry.profile_id
  ));
  entries.push(entry);
  fs.writeFileSync(preparedEnvironmentIndexPath(), `${JSON.stringify(entries, null, 2)}\n`);
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function resolveBinary(binaryName: string): string | null {
  const result = spawnSync('/bin/sh', ['-lc', `command -v ${shellQuote(binaryName)}`], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    return null;
  }
  const resolved = result.stdout.trim().split('\n')[0]?.trim();
  return resolved || null;
}

function installedRPackages(rscriptPath: string): Set<string> {
  const result = spawnSync(rscriptPath, [
    '-e',
    'cat(paste(rownames(installed.packages()), collapse="\\n"))',
  ], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return new Set();
  }
  return new Set(result.stdout.split('\n').map((entry) => entry.trim()).filter(Boolean));
}

function objects(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

function stringsFromPackageEntries(value: unknown): string[] {
  return objects(value)
    .filter((entry) => entry.required !== false)
    .map((entry) => (typeof entry.name === 'string' ? entry.name.trim() : ''))
    .filter(Boolean);
}

function readPrepareProfile(profilePath: string) {
  const profile = JSON.parse(fs.readFileSync(path.resolve(profilePath), 'utf8')) as JsonRecord;
  const selected = objects(profile.profiles)[0] ?? {};
  const runtimeBinaries = objects(selected.runtime_binaries)
    .filter((entry) => entry.required !== false)
    .map((entry) => (typeof entry.name === 'string' ? entry.name.trim() : ''))
    .filter(Boolean);
  const languagePackages = selected.language_packages as JsonRecord | undefined;
  return {
    profile,
    selected,
    runtimeBinaries,
    requiredRPackages: stringsFromPackageEntries(languagePackages?.r),
  };
}

function descriptorProjection(target: ReturnType<typeof normalizeTarget>) {
  const descriptorContract = RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.descriptor_contract as JsonRecord;
  return {
    surface_kind: 'opl_runtime_environment_descriptor_projection' as const,
    status: 'dry_run_descriptor_projected' as const,
    source: 'domain_environment_intent',
    domain_id: target.domain_id,
    profile_id: target.profile_id,
    platform_id: target.platform_id,
    dependency_intent_ref: `domain-environment-intent:${targetRef(target)}`,
    required_fields: descriptorContract.required_fields,
    body_policy: descriptorContract.body_policy,
    writes_domain_truth: false,
    writes_runtime_root: false,
  };
}

function layerGraphForTarget(target: ReturnType<typeof normalizeTarget>) {
  return stringList(RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.layer_types).map((layerType, index) => {
    const keyInput = {
      layer_type: layerType,
      domain_id: target.domain_id,
      profile_id: target.profile_id,
      platform_id: target.platform_id,
      contract_ref: CONTRACT_REF,
      cache_key_inputs: cachePolicy().cache_key_inputs,
    };
    return {
      layer_id: `${layerType}:${targetRef(target)}`,
      layer_type: layerType,
      layer_order: index + 1,
      cache_key: `runtime-layer-key:sha256:${shortDigest(keyInput)}`,
      digest: `sha256:${sha256(keyInput)}`,
      archive_ref: null,
      archive_present: false,
      materialized: false,
      writes_domain_truth: false,
      writes_artifact_body: false,
      writes_memory_body: false,
    };
  });
}

function runtimeLockProjection(input: RuntimeEnvironmentTargetInput) {
  const target = normalizeTarget(input);
  const descriptor = descriptorProjection(target);
  const descriptorDigest = sha256(descriptor);
  const layerGraph = layerGraphForTarget(target);
  const lockInput = {
    descriptor_digest: descriptorDigest,
    target,
    layer_graph: layerGraph.map((layer) => ({
      layer_type: layer.layer_type,
      cache_key: layer.cache_key,
      digest: layer.digest,
    })),
    cache_key_inputs: cachePolicy().cache_key_inputs,
  };
  const lockDigest = sha256(lockInput);
  return {
    surface_kind: 'opl_runtime_environment_lock_projection' as const,
    status: 'dry_run_lock_projected' as const,
    lock_ref: `runtime-lock:${targetRef(target)}:sha256:${lockDigest.slice(0, 24)}`,
    lock_digest: `sha256:${lockDigest}`,
    descriptor_digest: `sha256:${descriptorDigest}`,
    descriptor,
    layer_graph: layerGraph,
    layer_count: layerGraph.length,
    persisted: false,
    writes_runtime_root: false,
    writes_domain_repo: false,
    cache_key_inputs: cachePolicy().cache_key_inputs,
  };
}

function bundleManifestProjection(input: RuntimeEnvironmentTargetInput) {
  const target = normalizeTarget(input);
  const lock = runtimeLockProjection(input);
  const manifestInput = {
    lock_ref: lock.lock_ref,
    target,
    layer_keys: (lock.layer_graph as JsonRecord[]).map((layer) => layer.cache_key),
    materialization_policy: materializationPolicy(),
  };
  const manifestDigest = sha256(manifestInput);
  return {
    surface_kind: 'opl_runtime_environment_bundle_manifest_projection' as const,
    status: 'dry_run_bundle_manifest_projected' as const,
    bundle_ref: `runtime-bundle:${targetRef(target)}:sha256:${manifestDigest.slice(0, 24)}`,
    bundle_digest: `sha256:${manifestDigest}`,
    lock_ref: lock.lock_ref,
    lock_digest: lock.lock_digest,
    layer_refs: (lock.layer_graph as JsonRecord[]).map((layer) => ({
      layer_type: layer.layer_type,
      layer_id: layer.layer_id,
      cache_key: layer.cache_key,
      digest: layer.digest,
      archive_present: false,
    })),
    layer_count: lock.layer_count,
    archive_bytes: null,
    all_layer_archives_present: false,
    materialized_runtime_root: null,
    materialization_receipt_ref: null,
    writes_runtime_root: false,
    writes_domain_repo: false,
    can_claim_runtime_ready: false,
  };
}

function cacheInventoryProjection() {
  const preparedEnvironments = readPreparedEnvironmentIndex();
  if (preparedEnvironments.length > 0) {
    return {
      surface_kind: 'opl_runtime_environment_cache_inventory' as const,
      status: 'observed' as const,
      cache_root: runtimeEnvironmentStateRoot(),
      scanned_filesystem: false,
      layer_count: preparedEnvironments.length,
      active_runtime_roots: preparedEnvironments.map((entry) => entry.paper_root),
      protected_pointer_refs: [],
      current_pointer_ref: null,
      rollback_pointer_ref: null,
      stale_layer_count: 0,
      stale_runtime_root_count: 0,
      prepared_environment_refs: preparedEnvironments,
      cache_hit_counts_as_ready: false,
      cache_miss_counts_as_readiness_failure: false,
    };
  }
  return {
    surface_kind: 'opl_runtime_environment_cache_inventory' as const,
    status: 'dry_run_inventory_projection' as const,
    cache_root: null,
    scanned_filesystem: false,
    layer_count: 0,
    active_runtime_roots: [],
    protected_pointer_refs: [],
    current_pointer_ref: null,
    rollback_pointer_ref: null,
    stale_layer_count: 0,
    stale_runtime_root_count: 0,
    cache_hit_counts_as_ready: false,
    cache_miss_counts_as_readiness_failure: false,
  };
}

function cleanupPlanProjection(input: RuntimeEnvironmentCachePruneInput = {}) {
  const inventory = cacheInventoryProjection();
  const requestedApply = input.apply === true;
  const planInput = {
    inventory,
    requested_apply: requestedApply,
    materialization_policy: materializationPolicy(),
  };
  return {
    surface_kind: 'opl_runtime_environment_cleanup_plan' as const,
    status: requestedApply
      ? 'blocked_apply_requires_materialization_receipt'
      : 'dry_run_prune_plan_projected',
    cleanup_plan_ref: `runtime-env-cleanup-plan:sha256:${shortDigest(planInput)}`,
    requested_apply: requestedApply,
    dry_run: true,
    applied: false,
    can_apply: false,
    apply_blocker_ref: requestedApply
      ? 'runtime-blocker-ref:opl-runtime-env/cache-prune-apply-requires-materialization-receipt'
      : null,
    protects_current_pointer: true,
    protects_rollback_pointer: true,
    deletes_domain_artifacts: false,
    deletes_memory_body: false,
    deletes_development_checkout: false,
    candidate_deletions: [],
    inventory,
  };
}

function baseReadback(command: RuntimeEnvironmentCommand, input: RuntimeEnvironmentTargetInput = {}) {
  const target = normalizeTarget(input);
  return {
    surface_kind: 'opl_runtime_environment_readback' as const,
    version: 'opl-runtime-environment-readback.v1' as const,
    command,
    contract_ref: CONTRACT_REF,
    contract_id: RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.contract_id,
    domain_id: target.domain_id,
    profile_id: target.profile_id,
    platform_id: target.platform_id,
    implementation_status: RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.implementation_status,
    target_planned: RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.target_planned,
    dry_run: true,
    can_claim_runtime_ready: false,
    can_claim_domain_ready: false,
    can_claim_app_release_ready: false,
    authority_boundary: authorityBoundary(),
    forbidden_claims: stringList(RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.forbidden_claims),
  };
}

export function buildRuntimeEnvironmentInspectReadback(input: RuntimeEnvironmentTargetInput) {
  const target = normalizeTarget(input);
  const lock = runtimeLockProjection(input);
  return {
    ...baseReadback('inspect', input),
    descriptor: descriptorProjection(target),
    runtime_lock_ref: lock.lock_ref,
    bundle_manifest_ref: bundleManifestProjection(input).bundle_ref,
    materialization_status: {
      status: 'not_materialized',
      reason: 'dry_run_projection_only',
      writes_runtime_root: false,
      runtime_root: null,
      receipt_ref: null,
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
  return {
    ...baseReadback('build', input),
    lock: runtimeLockProjection(input),
    bundle_manifest: bundleManifestProjection(input),
    build_plan: {
      surface_kind: 'opl_runtime_environment_build_plan',
      status: 'dry_run_build_plan_projected',
      writes_runtime_root: false,
      writes_domain_repo: false,
      creates_archive: false,
      creates_materialization_receipt: false,
      can_claim_runtime_ready: false,
    },
  };
}

export function buildRuntimeEnvironmentPrepareReadback(input: RuntimeEnvironmentPrepareInput) {
  const target = normalizeTarget(input);
  const { selected, runtimeBinaries, requiredRPackages } = readPrepareProfile(
    input.requirementProfilePath,
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
  const installedPackages = rscriptPath ? installedRPackages(rscriptPath) : new Set<string>();
  const missingRPackages = rscriptPath
    ? requiredRPackages.filter((packageName) => !installedPackages.has(packageName))
    : requiredRPackages;
  const status = missingBinaries.length > 0
    ? 'missing_runtime_binary'
    : missingRPackages.length > 0
      ? 'missing_language_package'
      : 'prepared';
  const failureClass = status === 'prepared' ? '' : status;
  const lockRef = relativePaperBuildRef('dependency_environment_lock.json');
  const receiptRef = relativePaperBuildRef('dependency_environment_receipt.json');
  const runContextRef = relativePaperBuildRef('dependency_run_context.json');
  const lockPayload = {
    surface_kind: 'opl_runtime_environment_dependency_lock',
    version: 'opl-runtime-environment-dependency-lock.v1',
    status,
    domain_id: target.domain_id,
    profile_id: target.profile_id,
    platform_id: target.platform_id,
    dependency_profile_ref: path.resolve(input.requirementProfilePath),
    selected_requirement_profile_id: selected.profile_id ?? null,
    source_requirement_refs: [path.resolve(input.requirementProfilePath)],
    runtime_binaries: runtimeBinaries,
    required_r_packages: requiredRPackages,
    installed_packages: false,
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
    selected_requirement_profile_id: selected.profile_id ?? null,
    installed_packages: false,
    lock_ref: lockRef,
    lock_sha256: lockWithDigest.lock_sha256,
    binary_paths: binaryPaths,
    missing_runtime_binaries: missingBinaries,
    missing_r_packages: missingRPackages,
    receipt_ref: receiptRef,
    run_context_ref: status === 'prepared' ? runContextRef : null,
    route_hint: status === 'prepared' ? null : 'opl_runtime_env_doctor',
    authority_boundary: authority,
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
      lock_ref: lockRef,
      lock_sha256: lockWithDigest.lock_sha256,
      binary_paths: binaryPaths,
      env_vars: {
        OPL_RUNTIME_ENVIRONMENT_STATUS: 'prepared',
      },
      installed_packages: false,
      writes_domain_truth: false,
      writes_runtime_root: false,
      can_schedule_domain_stage: false,
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
      installed_packages: false,
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
    },
    run_context: runContext,
  };
}

export function buildRuntimeEnvironmentMaterializeReadback(input: RuntimeEnvironmentMaterializeInput) {
  const bundleManifest = bundleManifestProjection(input);
  return {
    ...baseReadback('materialize', input),
    bundle_manifest: bundleManifest,
    materialization_plan: {
      surface_kind: 'opl_runtime_environment_materialization_plan',
      status: input.apply
        ? 'blocked_apply_requires_materializer_receipt'
        : 'dry_run_materialization_plan_projected',
      target_pointer: input.targetPointer ?? 'current',
      requested_apply: input.apply === true,
      dry_run: true,
      applied: false,
      can_apply: false,
      runtime_root: null,
      receipt_ref: null,
      writes_runtime_root: false,
      updates_current_pointer: false,
      updates_rollback_pointer: false,
      protects_current_pointer: true,
      protects_rollback_pointer: true,
      apply_blocker_ref: input.apply
        ? 'runtime-blocker-ref:opl-runtime-env/materialize-apply-requires-landed-materializer'
        : null,
      steps: [
        'validate_runtime_lock_projection',
        'resolve_bundle_manifest_projection',
        'check_layer_archive_presence',
        'plan_materialized_runtime_root',
        'require_materialization_receipt_before_apply',
      ],
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
      status: 'dry_run_projection_available_materializer_not_landed',
      can_block_domain_progress: false,
      findings: [
        {
          severity: 'info',
          code: 'runtime_environment_lock_manifest_projection_landed',
          message:
            'Runtime environment lock, bundle manifest, cache inventory, and cleanup plan projections are available as deterministic dry-run readbacks.',
          can_block_domain_progress: false,
          can_claim_runtime_ready: false,
        },
        {
          severity: 'info',
          code: 'runtime_environment_materializer_not_landed',
          message:
            'Runtime environment substrate does not apply materialization, write runtime roots, or inspect host packages yet.',
          can_block_domain_progress: false,
          can_claim_runtime_ready: false,
        },
      ],
    },
  };
}

export function buildRuntimeEnvironmentRunContextReadback(input: RuntimeEnvironmentTargetInput) {
  const bundleManifest = bundleManifestProjection(input);
  if (input.paperRoot) {
    const runContextPath = path.join(path.resolve(input.paperRoot), 'build', 'dependency_run_context.json');
    if (fs.existsSync(runContextPath)) {
      const runContext = JSON.parse(fs.readFileSync(runContextPath, 'utf8')) as JsonRecord;
      return {
        ...baseReadback('run-context', input),
        run_context: {
          ...runContext,
          runtime_lock_ref: bundleManifest.lock_ref,
          bundle_manifest_ref: bundleManifest.bundle_ref,
          writes_domain_truth: false,
          writes_runtime_root: false,
          can_schedule_domain_stage: false,
        },
      };
    }
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
