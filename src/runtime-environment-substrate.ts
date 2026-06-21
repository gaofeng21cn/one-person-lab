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
  | 'verify'
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
  apply?: boolean;
}

export interface RuntimeEnvironmentVerifyInput {
  runtimeRoot: string;
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

function safeSegment(value: string) {
  return encodeURIComponent(value).replace(/%/g, '_');
}

function targetStateRoot(target: ReturnType<typeof normalizeTarget>) {
  return path.join(
    runtimeEnvironmentStateRoot(),
    'targets',
    safeSegment(target.domain_id),
    safeSegment(target.profile_id),
    safeSegment(target.platform_id),
  );
}

function locksRoot(target: ReturnType<typeof normalizeTarget>) {
  return path.join(targetStateRoot(target), 'locks');
}

function bundleRoot(target: ReturnType<typeof normalizeTarget>) {
  return path.join(targetStateRoot(target), 'bundles');
}

function runtimeRootsRoot(target: ReturnType<typeof normalizeTarget>) {
  return path.join(targetStateRoot(target), 'runtime-roots');
}

function pointerRoot(target: ReturnType<typeof normalizeTarget>) {
  return path.join(targetStateRoot(target), 'pointers');
}

function dependencyLibrariesRoot(target: ReturnType<typeof normalizeTarget>) {
  return path.join(targetStateRoot(target), 'dependency-libraries');
}

function receiptsRoot(target: ReturnType<typeof normalizeTarget>) {
  return path.join(targetStateRoot(target), 'receipts');
}

function cleanupReceiptsRoot() {
  return path.join(runtimeEnvironmentStateRoot(), 'cleanup-receipts');
}

function stateRef(absolutePath: string) {
  return `opl-runtime-env-state:${path.relative(runtimeEnvironmentStateRoot(), absolutePath)}`;
}

function statePathFromRef(ref: unknown): string | null {
  if (typeof ref !== 'string' || !ref.startsWith('opl-runtime-env-state:')) {
    return null;
  }
  const relative = ref.slice('opl-runtime-env-state:'.length);
  const resolved = path.resolve(runtimeEnvironmentStateRoot(), relative);
  const root = path.resolve(runtimeEnvironmentStateRoot());
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

function writeJsonFile(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function readJsonObject(filePath: string): JsonRecord | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as JsonRecord
    : null;
}

function materializationId(bundleManifest: JsonRecord) {
  const stableLayerRefs = objects(bundleManifest.layer_refs).map((layer) => ({
    layer_type: layer.layer_type,
    layer_id: layer.layer_id,
    cache_key: layer.cache_key,
    digest: layer.digest,
  }));
  return shortDigest({
    bundle_ref: bundleManifest.bundle_ref,
    bundle_digest: bundleManifest.bundle_digest,
    layer_refs: stableLayerRefs,
  });
}

function runtimeRootForBundle(
  target: ReturnType<typeof normalizeTarget>,
  bundleManifest: JsonRecord,
) {
  return path.join(runtimeRootsRoot(target), materializationId(bundleManifest));
}

function pointerPath(target: ReturnType<typeof normalizeTarget>, pointer: string) {
  return path.join(pointerRoot(target), `${pointer}.json`);
}

function readPointer(target: ReturnType<typeof normalizeTarget>, pointer = 'current') {
  return readJsonObject(pointerPath(target, pointer));
}

function writePointer(target: ReturnType<typeof normalizeTarget>, pointer: string, payload: JsonRecord) {
  writeJsonFile(pointerPath(target, pointer), payload);
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

function installedRPackages(rscriptPath: string, libraryPath?: string): Set<string> {
  const prefix = libraryPath
    ? `.libPaths(c(${JSON.stringify(libraryPath)}, .libPaths())); `
    : '';
  const result = spawnSync(rscriptPath, [
    '-e',
    `${prefix}cat(paste(rownames(installed.packages()), collapse="\\n"))`,
  ], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return new Set();
  }
  return new Set(result.stdout.split('\n').map((entry) => entry.trim()).filter(Boolean));
}

function installRPackagesIntoManagedLibrary(
  rscriptPath: string,
  libraryPath: string,
  packages: string[],
) {
  if (packages.length === 0) {
    return {
      status: 'not_required',
      installed: [],
      failed: [],
      stderr: '',
    };
  }
  fs.mkdirSync(libraryPath, { recursive: true });
  const expression = [
    `dir.create(${JSON.stringify(libraryPath)}, recursive = TRUE, showWarnings = FALSE)`,
    `.libPaths(c(${JSON.stringify(libraryPath)}, .libPaths()))`,
    `install.packages(${JSON.stringify(packages)}, lib = ${JSON.stringify(libraryPath)}, repos = "https://cloud.r-project.org", quiet = TRUE)`,
  ].join('; ');
  const result = spawnSync(rscriptPath, ['-e', expression], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const installed = installedRPackages(rscriptPath, libraryPath);
  const failed = packages.filter((packageName) => !installed.has(packageName));
  return {
    status: result.status === 0 && failed.length === 0 ? 'installed' : 'failed',
    installed: packages.filter((packageName) => installed.has(packageName)),
    failed,
    stderr: result.stderr.trim(),
  };
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
  const lockPath = path.join(locksRoot(target), `${lockDigest}.json`);
  return {
    surface_kind: 'opl_runtime_environment_lock_projection' as const,
    status: 'dry_run_lock_projected' as const,
    lock_ref: `runtime-lock:${targetRef(target)}:sha256:${lockDigest.slice(0, 24)}`,
    lock_digest: `sha256:${lockDigest}`,
    lock_state_ref: stateRef(lockPath),
    descriptor_digest: `sha256:${descriptorDigest}`,
    descriptor,
    layer_graph: layerGraph,
    layer_count: layerGraph.length,
    persisted: fs.existsSync(lockPath),
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
  const bundleRef = `runtime-bundle:${targetRef(target)}:sha256:${manifestDigest.slice(0, 24)}`;
  const bundleDigest = `sha256:${manifestDigest}`;
  const layerRefs = (lock.layer_graph as JsonRecord[]).map((layer) => ({
    layer_type: layer.layer_type,
    layer_id: layer.layer_id,
    cache_key: layer.cache_key,
    digest: layer.digest,
  }));
  const targetRuntimeRoot = runtimeRootForBundle(target, {
    bundle_ref: bundleRef,
    bundle_digest: `sha256:${manifestDigest}`,
    lock_ref: lock.lock_ref,
    layer_refs: layerRefs,
  });
  const receiptPath = path.join(targetRuntimeRoot, 'materialization-receipt.json');
  const manifestPath = path.join(bundleRoot(target), `${manifestDigest}.json`);
  const materialized = fs.existsSync(receiptPath);
  return {
    surface_kind: 'opl_runtime_environment_bundle_manifest_projection' as const,
    status: materialized
      ? 'materialized_bundle_manifest_observed'
      : 'dry_run_bundle_manifest_projected',
    bundle_ref: bundleRef,
    bundle_digest: bundleDigest,
    bundle_manifest_state_ref: stateRef(manifestPath),
    lock_ref: lock.lock_ref,
    lock_digest: lock.lock_digest,
    lock_state_ref: lock.lock_state_ref,
    layer_refs: layerRefs.map((layer) => ({
      ...layer,
      archive_present: materialized,
      materialized,
    })),
    layer_count: lock.layer_count,
    archive_bytes: null,
    all_layer_archives_present: materialized,
    materialized_runtime_root: materialized ? targetRuntimeRoot : null,
    materialization_receipt_ref: materialized ? stateRef(receiptPath) : null,
    writes_runtime_root: materialized,
    writes_domain_repo: false,
    can_claim_runtime_ready: materialized,
  };
}

function cacheInventoryProjection() {
  const preparedEnvironments = readPreparedEnvironmentIndex();
  const root = runtimeEnvironmentStateRoot();
  const targetRoots = path.join(root, 'targets');
  const materializedRoots: JsonRecord[] = [];
  const pointerRefs: JsonRecord[] = [];
  const protectedRuntimeRoots = new Set<string>();
  if (fs.existsSync(targetRoots)) {
    fs.readdirSync(targetRoots).forEach((domainSegment) => {
      const domainRoot = path.join(targetRoots, domainSegment);
      if (!fs.statSync(domainRoot).isDirectory()) {
        return;
      }
      fs.readdirSync(domainRoot).forEach((profileSegment) => {
        const profileRoot = path.join(domainRoot, profileSegment);
        if (!fs.statSync(profileRoot).isDirectory()) {
          return;
        }
        fs.readdirSync(profileRoot).forEach((platformSegment) => {
          const targetRoot = path.join(profileRoot, platformSegment);
          if (!fs.statSync(targetRoot).isDirectory()) {
            return;
          }
          const runtimeRoots = path.join(targetRoot, 'runtime-roots');
          if (fs.existsSync(runtimeRoots)) {
            fs.readdirSync(runtimeRoots).forEach((rootId) => {
              const runtimeRoot = path.join(runtimeRoots, rootId);
              if (!fs.statSync(runtimeRoot).isDirectory()) {
                return;
              }
              const receiptPath = path.join(runtimeRoot, 'materialization-receipt.json');
              const receipt = readJsonObject(receiptPath);
              materializedRoots.push({
                runtime_root: runtimeRoot,
                receipt_ref: stateRef(receiptPath),
                receipt_status: receipt?.status ?? 'missing_receipt',
                domain_id: receipt?.domain_id ?? decodeURIComponent(domainSegment.replace(/_/g, '%')),
                profile_id: receipt?.profile_id ?? decodeURIComponent(profileSegment.replace(/_/g, '%')),
                platform_id: receipt?.platform_id ?? decodeURIComponent(platformSegment.replace(/_/g, '%')),
                bundle_ref: receipt?.bundle_ref ?? null,
                protected: false,
              });
            });
          }
          const pointers = path.join(targetRoot, 'pointers');
          if (fs.existsSync(pointers)) {
            fs.readdirSync(pointers).forEach((pointerFile) => {
              if (!pointerFile.endsWith('.json')) {
                return;
              }
              const pointerPathValue = path.join(pointers, pointerFile);
              const pointer = readJsonObject(pointerPathValue);
              if (!pointer) {
                return;
              }
              const runtimeRoot = typeof pointer.runtime_root === 'string' ? pointer.runtime_root : null;
              if (runtimeRoot) {
                protectedRuntimeRoots.add(runtimeRoot);
              }
              pointerRefs.push({
                pointer_ref: stateRef(pointerPathValue),
                pointer_kind: pointer.pointer_kind ?? path.basename(pointerFile, '.json'),
                runtime_root: runtimeRoot,
                receipt_ref: pointer.receipt_ref ?? null,
                bundle_ref: pointer.bundle_ref ?? null,
              });
            });
          }
        });
      });
    });
  }
  materializedRoots.forEach((entry) => {
    entry.protected = protectedRuntimeRoots.has(String(entry.runtime_root));
  });
  const staleRuntimeRoots = materializedRoots.filter((entry) => entry.protected !== true);
  if (materializedRoots.length > 0 || preparedEnvironments.length > 0) {
    return {
      surface_kind: 'opl_runtime_environment_cache_inventory' as const,
      status: materializedRoots.length > 0 ? 'scanned' : 'observed',
      cache_root: root,
      scanned_filesystem: true,
      layer_count: materializedRoots.length + preparedEnvironments.length,
      materialized_runtime_root_count: materializedRoots.length,
      active_runtime_roots: [
        ...materializedRoots
          .filter((entry) => entry.protected === true)
          .map((entry) => entry.runtime_root),
        ...preparedEnvironments.map((entry) => entry.paper_root),
      ],
      protected_pointer_refs: pointerRefs,
      current_pointer_ref: pointerRefs.find((entry) => entry.pointer_kind === 'current')?.pointer_ref ?? null,
      rollback_pointer_ref: pointerRefs.find((entry) => entry.pointer_kind === 'rollback')?.pointer_ref ?? null,
      stale_layer_count: staleRuntimeRoots.length,
      stale_runtime_root_count: staleRuntimeRoots.length,
      materialized_runtime_roots: materializedRoots,
      stale_runtime_roots: staleRuntimeRoots,
      prepared_environment_refs: preparedEnvironments,
      cache_hit_counts_as_ready: false,
      cache_miss_counts_as_readiness_failure: false,
    };
  }
  return {
    surface_kind: 'opl_runtime_environment_cache_inventory' as const,
    status: 'dry_run_inventory_projection' as const,
    cache_root: root,
    scanned_filesystem: true,
    layer_count: 0,
    materialized_runtime_root_count: 0,
    active_runtime_roots: [],
    protected_pointer_refs: [],
    current_pointer_ref: null,
    rollback_pointer_ref: null,
    stale_layer_count: 0,
    stale_runtime_root_count: 0,
    materialized_runtime_roots: [],
    stale_runtime_roots: [],
    cache_hit_counts_as_ready: false,
    cache_miss_counts_as_readiness_failure: false,
  };
}

function cleanupPlanProjection(input: RuntimeEnvironmentCachePruneInput = {}) {
  const inventory = cacheInventoryProjection();
  const requestedApply = input.apply === true;
  const staleRuntimeRoots = objects(inventory.stale_runtime_roots);
  const candidateDeletions = staleRuntimeRoots.map((entry) => ({
    runtime_root: entry.runtime_root,
    receipt_ref: entry.receipt_ref,
    protected: entry.protected === true,
    delete_allowed: entry.protected !== true,
  }));
  const planInput = {
    inventory,
    requested_apply: requestedApply,
    materialization_policy: materializationPolicy(),
  };
  let applied = false;
  const deletedRuntimeRoots: JsonRecord[] = [];
  if (requestedApply) {
    const stateRoot = path.resolve(runtimeEnvironmentStateRoot());
    candidateDeletions.forEach((entry) => {
      const runtimeRoot = typeof entry.runtime_root === 'string'
        ? path.resolve(entry.runtime_root)
        : '';
      if (!runtimeRoot.startsWith(`${stateRoot}${path.sep}`) || entry.delete_allowed !== true) {
        return;
      }
      if (!runtimeRoot.includes(`${path.sep}runtime-roots${path.sep}`)) {
        return;
      }
      fs.rmSync(runtimeRoot, { recursive: true, force: true });
      deletedRuntimeRoots.push({
        runtime_root: runtimeRoot,
        receipt_ref: entry.receipt_ref ?? null,
      });
    });
    const receiptPath = path.join(
      cleanupReceiptsRoot(),
      `${new Date().toISOString().replace(/[:.]/g, '-')}-${shortDigest(planInput)}.json`,
    );
    writeJsonFile(receiptPath, {
      surface_kind: 'opl_runtime_environment_cleanup_receipt',
      version: 'opl-runtime-environment-cleanup-receipt.v1',
      status: 'applied',
      cleanup_plan_ref: `runtime-env-cleanup-plan:sha256:${shortDigest(planInput)}`,
      deleted_runtime_roots: deletedRuntimeRoots,
      protected_pointer_refs: inventory.protected_pointer_refs,
      deletes_domain_artifacts: false,
      deletes_memory_body: false,
      deletes_development_checkout: false,
    });
    applied = true;
  }
  return {
    surface_kind: 'opl_runtime_environment_cleanup_plan' as const,
    status: requestedApply
      ? 'applied_prune_receipt_written'
      : 'dry_run_prune_plan_projected',
    cleanup_plan_ref: `runtime-env-cleanup-plan:sha256:${shortDigest(planInput)}`,
    requested_apply: requestedApply,
    dry_run: !requestedApply,
    applied,
    can_apply: true,
    apply_blocker_ref: null,
    protects_current_pointer: true,
    protects_rollback_pointer: true,
    deletes_domain_artifacts: false,
    deletes_memory_body: false,
    deletes_development_checkout: false,
    candidate_deletions: candidateDeletions,
    deleted_runtime_roots: deletedRuntimeRoots,
    inventory,
  };
}

function baseReadback(
  command: RuntimeEnvironmentCommand,
  input: RuntimeEnvironmentTargetInput = {},
  overrides: JsonRecord = {},
) {
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
    ...overrides,
  };
}

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
  const lock = runtimeLockProjection(input);
  const bundleManifest = bundleManifestProjection(input);
  return {
    ...baseReadback('build', input),
    lock,
    bundle_manifest: bundleManifest,
    build_plan: {
      surface_kind: 'opl_runtime_environment_build_plan',
      status: 'bundle_manifest_projected',
      writes_runtime_root: false,
      writes_domain_repo: false,
      creates_archive: false,
      creates_materialization_receipt: false,
      can_claim_runtime_ready: bundleManifest.can_claim_runtime_ready === true,
      lock_state_ref: lock.lock_state_ref,
      bundle_manifest_state_ref: bundleManifest.bundle_manifest_state_ref,
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
  const managedLibraryPath = path.join(
    dependencyLibrariesRoot(target),
    shortDigest({
      requirement_profile: path.resolve(input.requirementProfilePath),
      selected_requirement_profile_id: selected.profile_id ?? null,
      required_r_packages: requiredRPackages,
    }),
    'R',
  );
  let installedPackages = rscriptPath
    ? installedRPackages(rscriptPath, managedLibraryPath)
    : new Set<string>();
  let missingRPackages = rscriptPath
    ? requiredRPackages.filter((packageName) => !installedPackages.has(packageName))
    : requiredRPackages;
  const installReceipt = input.apply && rscriptPath && missingBinaries.length === 0
    ? installRPackagesIntoManagedLibrary(rscriptPath, managedLibraryPath, missingRPackages)
    : {
      status: input.apply ? 'not_required' : 'not_requested',
      installed: [],
      failed: [],
      stderr: '',
    };
  if (input.apply && rscriptPath && installReceipt.status !== 'not_requested') {
    installedPackages = installedRPackages(rscriptPath, managedLibraryPath);
    missingRPackages = requiredRPackages.filter((packageName) => !installedPackages.has(packageName));
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
    package_installation_requested: input.apply === true,
    installed_packages: input.apply === true && installReceipt.status === 'installed',
    managed_r_library_path: managedLibraryPath,
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
        R_LIBS_USER: managedLibraryPath,
      },
      managed_r_library_path: managedLibraryPath,
      package_installation_requested: input.apply === true,
      installed_packages: input.apply === true && installReceipt.status === 'installed',
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
      package_installation_requested: input.apply === true,
      installed_packages: input.apply === true && installReceipt.status === 'installed',
      managed_r_library_path: managedLibraryPath,
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
  if (targetPointer === 'current' || targetPointer === 'rollback') {
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
      updates_rollback_pointer: targetPointer === 'rollback',
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
      status: 'runtime_lock_materializer_verify_cache_prune_available',
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
