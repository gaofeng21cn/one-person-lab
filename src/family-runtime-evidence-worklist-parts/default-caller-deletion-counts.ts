import {
  DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS,
  DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES,
} from '../default-caller-retirement-guard.ts';
import type { JsonRecord } from './json-utils.ts';

export function defaultCallerDeletionEvidenceCounts(worklistItems: JsonRecord[]) {
  const defaultCallerItems = worklistItems.filter((item) =>
    item.claim_scope === 'default_caller_deletion_evidence'
  );
  const countActionKind = (actionKind: string) => defaultCallerItems.filter((item) =>
    item.action_kind === actionKind
  ).length;
  return {
    default_caller_deletion_evidence_item_count: defaultCallerItems.length,
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
