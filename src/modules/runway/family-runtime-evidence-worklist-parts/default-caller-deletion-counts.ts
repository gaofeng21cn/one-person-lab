import {
  DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS,
  DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES,
} from '../../foundry-lab/index.ts';
import type { JsonRecord } from '../../../kernel/json-record.ts';

export function defaultCallerDeletionEvidenceCounts(worklistItems: JsonRecord[]) {
  const defaultCallerItems = worklistItems.filter((item) =>
    item.claim_scope === 'default_caller_deletion_evidence'
  );
  const defaultCallerAuditLaneItems = defaultCallerItems.filter((item) =>
    item.worklist_attention_class === 'audit_cleanup_lane'
  );
  const defaultCallerOrdinaryOpenSafeActionItems = defaultCallerItems.filter((item) =>
    item.status === 'open_safe_action_request_route_available'
    && item.ordinary_open_safe_action_attention !== false
  );
  const countActionKind = (actionKind: string) => defaultCallerItems.filter((item) =>
    item.action_kind === actionKind
  ).length;
  return {
    default_caller_deletion_evidence_item_count: defaultCallerItems.length,
    default_caller_deletion_audit_lane_item_count: defaultCallerAuditLaneItems.length,
    default_caller_deletion_cleanup_lane_item_count: defaultCallerAuditLaneItems.length,
    default_caller_deletion_open_safe_action_item_count:
      defaultCallerOrdinaryOpenSafeActionItems.length,
    default_caller_deletion_domain_owner_receipt_or_typed_blocker_missing_count:
      countActionKind('default_caller_deletion_domain_owner_receipt_or_typed_blocker_request'),
    default_caller_deletion_no_active_caller_missing_count:
      countActionKind('default_caller_deletion_no_active_caller_proof_request'),
    default_caller_deletion_no_forbidden_write_missing_count:
      countActionKind('default_caller_deletion_no_forbidden_write_proof_request'),
    default_caller_deletion_tombstone_or_provenance_missing_count:
      countActionKind('default_caller_deletion_tombstone_or_provenance_ref_request'),
    default_caller_deletion_mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
    default_caller_deletion_retirement_target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
  };
}
