import type {
  FamilyStageProofBundle,
} from './family-stage-proof-bundle.ts';

export type FamilyStagePackMigrationPolicy =
  | 'continue_old_hash'
  | 'migrate_to_new_hash'
  | 'blocked_human_gate';

export interface FamilyStagePackRegistryAttemptBinding {
  stage_attempt_id: string;
  stage_pack_hash: string;
  stage_id: string;
  created_at_ref?: string | null;
}

export interface FamilyStagePackRegistryOptions {
  previousStagePackHash?: string | null;
  attemptBinding?: FamilyStagePackRegistryAttemptBinding | null;
  migrationPolicy?: FamilyStagePackMigrationPolicy | null;
  migrationPolicyRef?: string | null;
  libraryLifecycleStatus?: FamilyStagePackLibraryLifecycleStatus | null;
  promotionRef?: string | null;
  deprecationRef?: string | null;
  supersessionRef?: string | null;
  supersededByStagePackRef?: string | null;
  reusedByRefs?: string[] | null;
}

export interface FamilyStagePackRegistryBlocker {
  blocker_kind: 'stage_pack_migration_blocker';
  blocker_id:
    | 'stage_pack_hash_changed_without_policy'
    | 'stage_pack_hash_migration_requires_human_gate'
    | 'attempt_stage_pack_hash_conflict';
  stage_attempt_id: string | null;
  minimal_counterexample: {
    current_stage_pack_hash: string;
    previous_stage_pack_hash?: string;
    attempt_stage_pack_hash?: string;
    policy?: FamilyStagePackMigrationPolicy | null;
    reason: string;
  };
  repair_action:
    | 'declare_stage_pack_migration_policy'
    | 'record_human_gate_for_stage_pack_migration'
    | 'bind_attempt_to_declared_stage_pack_hash';
}

export interface FamilyStagePackRegistryEntry {
  stage_pack_id: string;
  target_domain_id: string;
  plane_id: string;
  stage_pack_hash: string;
  stage_ids: string[];
  action_catalog_id: string | null;
  conformance_status: FamilyStageProofBundle['conformance_status'];
  reusable_library_entry: true;
  refs: {
    proof_bundle_ref: string;
    graph_projection_ref: string;
    integrity_ref: string;
    migration_policy_ref: string | null;
  };
  library_lifecycle: FamilyStagePackLibraryLifecycle;
  migration: {
    status:
      | 'stable_hash'
      | 'continue_old_hash'
      | 'migrate_to_new_hash'
      | 'blocked_human_gate'
      | 'blocked';
    policy: FamilyStagePackMigrationPolicy | null;
    previous_stage_pack_hash: string | null;
    current_stage_pack_hash: string;
    active_attempt_stage_pack_hash: string | null;
    active_attempt_policy:
      | 'attempt_continues_bound_hash'
      | 'attempt_migrates_to_current_hash'
      | 'attempt_blocked_for_human_gate'
      | 'no_active_attempt_binding';
    blockers: FamilyStagePackRegistryBlocker[];
  };
  authority_boundary: {
    opl_role: 'stage_pack_registry_projection_only';
    stores_body_payloads: false;
    can_execute_stage: false;
    can_write_domain_truth: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
  };
}

export type FamilyStagePackLibraryLifecycleStatus =
  | 'candidate'
  | 'admitted'
  | 'reused'
  | 'deprecated'
  | 'superseded';

export interface FamilyStagePackLibraryLifecycle {
  status: FamilyStagePackLibraryLifecycleStatus;
  promotion_ref: string | null;
  deprecation_ref: string | null;
  supersession_ref: string | null;
  superseded_by_stage_pack_ref: string | null;
  reused_by_refs: string[];
  migration_blocker_count: number;
  blockers: FamilyStagePackRegistryBlocker[];
  authority_boundary: {
    opl_role: 'stage_pack_library_lifecycle_projection_only';
    lifecycle_is_operator_review_input: true;
    stores_body_payloads: false;
    can_execute_stage: false;
    can_write_domain_truth: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
  };
}

export interface FamilyStagePackRegistryProjection {
  surface_kind: 'opl_family_stage_pack_registry';
  version: 'family-stage-pack-registry.v1';
  summary: {
    entry_count: number;
    changed_hash_count: number;
    blocked_entry_count: number;
    reusable_entry_count: number;
    candidate_count: number;
    admitted_count: number;
    reused_count: number;
    deprecated_count: number;
    superseded_count: number;
  };
  entries: FamilyStagePackRegistryEntry[];
  authority_boundary: {
    opl_role: 'stage_pack_registry_projection_only';
    registry_is_scheduler_input: true;
    stores_body_payloads: false;
    can_execute_stage: false;
    can_write_domain_truth: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
  };
}

function blocker(
  blocker_id: FamilyStagePackRegistryBlocker['blocker_id'],
  repair_action: FamilyStagePackRegistryBlocker['repair_action'],
  currentHash: string,
  reason: string,
  options: {
    stageAttemptId?: string | null;
    previousHash?: string | null;
    attemptHash?: string | null;
    policy?: FamilyStagePackMigrationPolicy | null;
  } = {},
): FamilyStagePackRegistryBlocker {
  return {
    blocker_kind: 'stage_pack_migration_blocker',
    blocker_id,
    stage_attempt_id: options.stageAttemptId ?? null,
    minimal_counterexample: {
      current_stage_pack_hash: currentHash,
      ...(options.previousHash ? { previous_stage_pack_hash: options.previousHash } : {}),
      ...(options.attemptHash ? { attempt_stage_pack_hash: options.attemptHash } : {}),
      ...(options.policy ? { policy: options.policy } : {}),
      reason,
    },
    repair_action,
  };
}

function migrationStatus(
  currentHash: string,
  options: FamilyStagePackRegistryOptions,
  blockers: FamilyStagePackRegistryBlocker[],
): FamilyStagePackRegistryEntry['migration']['status'] {
  const previousHash = options.previousStagePackHash ?? null;
  const policy = options.migrationPolicy ?? null;
  if (!previousHash || previousHash === currentHash) {
    return 'stable_hash';
  }
  if (!policy) {
    blockers.push(blocker(
      'stage_pack_hash_changed_without_policy',
      'declare_stage_pack_migration_policy',
      currentHash,
      'current stage_pack_hash differs from previous stage_pack_hash and no migration policy was declared',
      { previousHash },
    ));
    return 'blocked';
  }
  if (policy === 'blocked_human_gate') {
    blockers.push(blocker(
      'stage_pack_hash_migration_requires_human_gate',
      'record_human_gate_for_stage_pack_migration',
      currentHash,
      'declared policy requires a human gate before this stage pack can be used for new launches',
      { previousHash, policy },
    ));
    return 'blocked_human_gate';
  }
  return policy;
}

function attemptPolicy(
  currentHash: string,
  options: FamilyStagePackRegistryOptions,
  blockers: FamilyStagePackRegistryBlocker[],
): FamilyStagePackRegistryEntry['migration']['active_attempt_policy'] {
  const attempt = options.attemptBinding ?? null;
  if (!attempt) {
    return 'no_active_attempt_binding';
  }
  if (attempt.stage_pack_hash === currentHash) {
    return 'attempt_continues_bound_hash';
  }
  const policy = options.migrationPolicy ?? null;
  if (policy === 'continue_old_hash') {
    return 'attempt_continues_bound_hash';
  }
  if (policy === 'migrate_to_new_hash') {
    return 'attempt_migrates_to_current_hash';
  }
  blockers.push(blocker(
    'attempt_stage_pack_hash_conflict',
    'bind_attempt_to_declared_stage_pack_hash',
    currentHash,
    'active attempt hash differs from current stage pack hash and no migration policy allows continuing or migrating',
    {
      stageAttemptId: attempt.stage_attempt_id,
      previousHash: options.previousStagePackHash,
      attemptHash: attempt.stage_pack_hash,
      policy,
    },
  ));
  return 'attempt_blocked_for_human_gate';
}

function lifecycleStatus(
  proofBundle: FamilyStageProofBundle,
  options: FamilyStagePackRegistryOptions,
): FamilyStagePackLibraryLifecycleStatus {
  if (options.libraryLifecycleStatus) {
    return options.libraryLifecycleStatus;
  }
  if (options.supersessionRef || options.supersededByStagePackRef) {
    return 'superseded';
  }
  if (options.deprecationRef) {
    return 'deprecated';
  }
  if ((options.reusedByRefs ?? []).length > 0) {
    return 'reused';
  }
  return proofBundle.conformance_status === 'conformant' ? 'admitted' : 'candidate';
}

function buildLibraryLifecycle(
  proofBundle: FamilyStageProofBundle,
  options: FamilyStagePackRegistryOptions,
  blockers: FamilyStagePackRegistryBlocker[],
): FamilyStagePackLibraryLifecycle {
  return {
    status: lifecycleStatus(proofBundle, options),
    promotion_ref: options.promotionRef ?? null,
    deprecation_ref: options.deprecationRef ?? null,
    supersession_ref: options.supersessionRef ?? null,
    superseded_by_stage_pack_ref: options.supersededByStagePackRef ?? null,
    reused_by_refs: options.reusedByRefs ?? [],
    migration_blocker_count: blockers.length,
    blockers,
    authority_boundary: {
      opl_role: 'stage_pack_library_lifecycle_projection_only',
      lifecycle_is_operator_review_input: true,
      stores_body_payloads: false,
      can_execute_stage: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
    },
  };
}

export function buildFamilyStagePackRegistryEntry(
  proofBundle: FamilyStageProofBundle,
  options: FamilyStagePackRegistryOptions = {},
): FamilyStagePackRegistryEntry {
  const currentHash = proofBundle.integrity.stage_pack_hash;
  const blockers: FamilyStagePackRegistryBlocker[] = [];
  const status = migrationStatus(currentHash, options, blockers);
  const activeAttemptPolicy = attemptPolicy(currentHash, options, blockers);
  return {
    stage_pack_id: proofBundle.identity.stage_pack_id,
    target_domain_id: proofBundle.identity.target_domain_id,
    plane_id: proofBundle.identity.plane_id,
    stage_pack_hash: currentHash,
    stage_ids: proofBundle.identity.stage_ids,
    action_catalog_id: proofBundle.identity.action_catalog_id,
    conformance_status: proofBundle.conformance_status,
    reusable_library_entry: true,
    refs: {
      proof_bundle_ref: `opl://stage-packs/${proofBundle.identity.stage_pack_id}/proof-bundles/${currentHash}`,
      graph_projection_ref: `opl://stage-packs/${proofBundle.identity.stage_pack_id}/graphs/${currentHash}`,
      integrity_ref: `opl://stage-packs/${proofBundle.identity.stage_pack_id}/integrity/${currentHash}`,
      migration_policy_ref: options.migrationPolicyRef ?? null,
    },
    library_lifecycle: buildLibraryLifecycle(proofBundle, options, blockers),
    migration: {
      status,
      policy: options.migrationPolicy ?? null,
      previous_stage_pack_hash: options.previousStagePackHash ?? null,
      current_stage_pack_hash: currentHash,
      active_attempt_stage_pack_hash: options.attemptBinding?.stage_pack_hash ?? null,
      active_attempt_policy: activeAttemptPolicy,
      blockers,
    },
    authority_boundary: {
      opl_role: 'stage_pack_registry_projection_only',
      stores_body_payloads: false,
      can_execute_stage: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
    },
  };
}

export function buildFamilyStagePackRegistryProjection(
  entries: FamilyStagePackRegistryEntry[],
): FamilyStagePackRegistryProjection {
  return {
    surface_kind: 'opl_family_stage_pack_registry',
    version: 'family-stage-pack-registry.v1',
    summary: {
      entry_count: entries.length,
      changed_hash_count: entries.filter((entry) => (
        entry.migration.previous_stage_pack_hash
        && entry.migration.previous_stage_pack_hash !== entry.stage_pack_hash
      )).length,
      blocked_entry_count: entries.filter((entry) => entry.migration.blockers.length > 0).length,
      reusable_entry_count: entries.filter((entry) => entry.reusable_library_entry).length,
      candidate_count: entries.filter((entry) => entry.library_lifecycle.status === 'candidate').length,
      admitted_count: entries.filter((entry) => entry.library_lifecycle.status === 'admitted').length,
      reused_count: entries.filter((entry) => entry.library_lifecycle.status === 'reused').length,
      deprecated_count: entries.filter((entry) => entry.library_lifecycle.status === 'deprecated').length,
      superseded_count: entries.filter((entry) => entry.library_lifecycle.status === 'superseded').length,
    },
    entries,
    authority_boundary: {
      opl_role: 'stage_pack_registry_projection_only',
      registry_is_scheduler_input: true,
      stores_body_payloads: false,
      can_execute_stage: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
    },
  };
}
