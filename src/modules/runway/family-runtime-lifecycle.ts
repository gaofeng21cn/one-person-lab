import {
  record,
  recordList,
  stringList,
  stringValue,
  type JsonRecord,
} from '../../kernel/json-record.ts';

export type FamilyRuntimeLifecyclePrimitives = {
  surface_kind: 'family_runtime_lifecycle_primitives';
  artifact_locator_index: {
    locator_kind: string;
    workspace_root: string | null;
    runtime_root: string | null;
    artifact_root: string | null;
    indexed_refs: string[];
    indexed_ref_count: number;
    content_policy: 'locator_only_no_artifact_content';
  };
  retention_policy: {
    policy_kind: 'domain_workspace_retention_ref';
    owner: 'domain_agent';
    opl_role: 'index_policy_and_restore_refs_only';
    opl_can_apply_retention: false;
  };
  restore_proof: {
    proof_kind: 'restore_ref_required_before_cleanup';
    observed_restore_refs: string[];
    required_refs: string[];
    restore_gate_status: 'restore_refs_declared' | 'restore_refs_missing';
    opl_cleanup_allowed: false;
  };
  migration_ledger: {
    ledger_kind: 'framework_migration_ledger';
    owner: 'opl_framework';
    writes_domain_truth: false;
  };
  workspace_lifecycle_metadata: {
    workspace_locator: JsonRecord;
    lifecycle_owner: 'domain_agent';
    provider_attempt_owner: 'opl_framework';
  };
  guarded_apply_proof: {
    surface_kind: 'family_runtime_lifecycle_guarded_apply_proof';
    apply_status: 'no_apply_requests' | 'opl_apply_ready' | 'domain_receipt_observed' | 'blocked_domain_receipt_required';
    actions: Array<JsonRecord>;
    summary: {
      requested_actions_count: number;
      opl_apply_permitted_count: number;
      domain_receipt_observed_count: number;
      typed_blocker_count: number;
      domain_writes_performed: false;
    };
    authority_boundary: {
      opl: 'opl_lifecycle_ledger_apply_only';
      domain: 'domain_artifact_retention_restore_authority';
      forbidden_opl_actions: string[];
    };
  };
  authority_boundary: {
    opl: 'lifecycle_index_and_restore_refs_only';
    domain: 'artifact_content_retention_restore_authority';
  };
};

function lifecycleRequestRef(input: JsonRecord, field: string) {
  const ref = stringValue(input[field]);
  return ref
    ? {
        ref_kind: 'lifecycle_request_ref',
        ref,
      }
    : null;
}

function buildLifecycleActionDecision(input: JsonRecord): JsonRecord {
  const actionId = stringValue(input.action_id) ?? 'unnamed_lifecycle_action';
  const actionKind = stringValue(input.action_kind) ?? 'lifecycle';
  const authorityOwner = stringValue(input.authority_owner) ?? 'domain_agent';
  const ownerScope = stringValue(input.owner_scope) ?? 'domain_owned_artifact';
  const restoreRef = lifecycleRequestRef(input, 'restore_ref');
  const domainReceiptRef = lifecycleRequestRef(input, 'domain_receipt_ref');
  const base = {
    action_id: actionId,
    action_kind: actionKind,
    target_ref: stringValue(input.target_ref) ?? null,
    authority_owner: authorityOwner,
    owner_scope: ownerScope,
    restore_ref: restoreRef,
    domain_receipt_ref: domainReceiptRef,
    opl_writes_domain_truth: false,
  };

  if (ownerScope === 'opl_owned_ledger' || authorityOwner === 'opl_framework') {
    return {
      ...base,
      apply_decision: 'opl_apply_permitted',
      receipt_kind: 'opl_lifecycle_ledger_apply_receipt',
      receipt_status: 'applied_to_opl_lifecycle_ledger',
    };
  }
  if (!restoreRef) {
    return {
      ...base,
      apply_decision: 'typed_blocker',
      blocker: {
        blocker_kind: 'lifecycle_safety_gate',
        blocker_id: 'restore_ref_required_before_lifecycle_apply',
        required_owner: authorityOwner,
      },
    };
  }
  if (!domainReceiptRef) {
    return {
      ...base,
      apply_decision: 'typed_blocker',
      blocker: {
        blocker_kind: 'domain_owner_gate',
        blocker_id: 'domain_owned_lifecycle_receipt_required',
        required_owner: authorityOwner,
      },
    };
  }
  return {
    ...base,
    apply_decision: 'domain_receipt_observed',
    receipt_kind: 'domain_lifecycle_receipt_ref',
    receipt_status: 'observed_ref_only',
  };
}

function buildLifecycleGuardedApplyProof(
  locator: JsonRecord,
): FamilyRuntimeLifecyclePrimitives['guarded_apply_proof'] {
  const actions = recordList(locator.lifecycle_apply_requests).map(buildLifecycleActionDecision);
  const oplApplyPermittedCount = actions.filter((entry) => entry.apply_decision === 'opl_apply_permitted').length;
  const domainReceiptObservedCount = actions.filter((entry) => entry.apply_decision === 'domain_receipt_observed').length;
  const typedBlockerCount = actions.filter((entry) => entry.apply_decision === 'typed_blocker').length;
  const applyStatus: FamilyRuntimeLifecyclePrimitives['guarded_apply_proof']['apply_status'] =
    actions.length === 0
      ? 'no_apply_requests'
      : typedBlockerCount > 0
        ? 'blocked_domain_receipt_required'
        : domainReceiptObservedCount > 0
          ? 'domain_receipt_observed'
          : 'opl_apply_ready';
  return {
    surface_kind: 'family_runtime_lifecycle_guarded_apply_proof',
    apply_status: applyStatus,
    actions,
    summary: {
      requested_actions_count: actions.length,
      opl_apply_permitted_count: oplApplyPermittedCount,
      domain_receipt_observed_count: domainReceiptObservedCount,
      typed_blocker_count: typedBlockerCount,
      domain_writes_performed: false,
    },
    authority_boundary: {
      opl: 'opl_lifecycle_ledger_apply_only',
      domain: 'domain_artifact_retention_restore_authority',
      forbidden_opl_actions: [
        'delete_domain_artifact',
        'restore_domain_workspace_content',
        'apply_domain_retention_policy',
        'write_domain_truth',
      ],
    },
  };
}

export function buildFamilyRuntimeLifecyclePrimitives(input: {
  workspaceLocator: JsonRecord;
  artifactRefs?: string[];
}): FamilyRuntimeLifecyclePrimitives {
  const locator = input.workspaceLocator;
  const runtimeRoot =
    stringValue(locator.runtime_root)
    ?? stringValue(locator.runtimeRoot)
    ?? null;
  const artifactRoot =
    stringValue(locator.artifact_root)
    ?? stringValue(locator.artifactRoot)
    ?? stringValue(locator.workspace_artifact_root)
    ?? null;
  const indexedRefs = input.artifactRefs ?? [];
  const observedRestoreRefs = stringList(locator.restore_refs);
  return {
    surface_kind: 'family_runtime_lifecycle_primitives',
    artifact_locator_index: {
      locator_kind: 'workspace_runtime_artifact_locator',
      workspace_root:
        stringValue(locator.workspace_root)
        ?? stringValue(locator.workspaceRoot)
        ?? stringValue(locator.workspace)
        ?? null,
      runtime_root: runtimeRoot,
      artifact_root: artifactRoot,
      indexed_refs: indexedRefs,
      indexed_ref_count: indexedRefs.length,
      content_policy: 'locator_only_no_artifact_content',
    },
    retention_policy: {
      policy_kind: 'domain_workspace_retention_ref',
      owner: 'domain_agent',
      opl_role: 'index_policy_and_restore_refs_only',
      opl_can_apply_retention: false,
    },
    restore_proof: {
      proof_kind: 'restore_ref_required_before_cleanup',
      required_refs: [
        ...observedRestoreRefs,
        ...indexedRefs,
      ],
      observed_restore_refs: observedRestoreRefs,
      restore_gate_status: observedRestoreRefs.length > 0 ? 'restore_refs_declared' : 'restore_refs_missing',
      opl_cleanup_allowed: false,
    },
    migration_ledger: {
      ledger_kind: 'framework_migration_ledger',
      owner: 'opl_framework',
      writes_domain_truth: false,
    },
    workspace_lifecycle_metadata: {
      workspace_locator: record(locator),
      lifecycle_owner: 'domain_agent',
      provider_attempt_owner: 'opl_framework',
    },
    guarded_apply_proof: buildLifecycleGuardedApplyProof(locator),
    authority_boundary: {
      opl: 'lifecycle_index_and_restore_refs_only',
      domain: 'artifact_content_retention_restore_authority',
    },
  };
}
