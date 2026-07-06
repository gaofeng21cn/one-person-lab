import fs from 'node:fs';
import path from 'node:path';

import type { JsonRecord, RuntimeEnvironmentCachePruneInput, RuntimeEnvironmentCommand, RuntimeEnvironmentTargetInput } from './contract.ts';
import {
  authorityBoundary,
  cachePolicy,
  CONTRACT_REF,
  fastLocalEnvCurrentPath,
  materializationPolicy,
  RUNTIME_ENVIRONMENT_FALLBACK_POINTER,
  RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT,
  standardToolHandoff,
} from './contract.ts';
import {
  bundleRoot,
  cleanupReceiptsRoot,
  locksRoot,
  readJsonObject,
  readPreparedEnvironmentIndex,
  runtimeEnvironmentStateRoot,
  runtimeRootForBundle,
  stateRef,
  stringList,
  targetRef,
  writeJsonFile,
} from './target-state.ts';
import { normalizeTarget, objects, sha256, shortDigest } from './target-state.ts';

export function descriptorProjection(target: ReturnType<typeof normalizeTarget>) {
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

export function layerGraphForTarget(target: ReturnType<typeof normalizeTarget>) {
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

export function runtimeLockProjection(input: RuntimeEnvironmentTargetInput) {
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

export function bundleManifestProjection(input: RuntimeEnvironmentTargetInput) {
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

export function cacheInventoryProjection() {
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
      rollback_pointer_ref: pointerRefs.find((entry) => entry.pointer_kind === RUNTIME_ENVIRONMENT_FALLBACK_POINTER)?.pointer_ref ?? null,
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

export function cleanupPlanProjection(input: RuntimeEnvironmentCachePruneInput = {}) {
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

export function baseReadback(
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
    sandbox_provider: target.sandbox_provider,
    default_current_path: fastLocalEnvCurrentPath(),
    standard_tool_handoff: standardToolHandoff(),
    dry_run: true,
    can_claim_runtime_ready: false,
    can_claim_domain_ready: false,
    can_claim_app_release_ready: false,
    authority_boundary: authorityBoundary(),
    forbidden_claims: stringList(RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.forbidden_claims),
    ...overrides,
  };
}
