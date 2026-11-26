import type { SqliteDb } from '@opl/core';

export type LedgerDb = SqliteDb;

export const LEDGER_ENTRY_KINDS = [
  'artifact_ref',
  'owner_receipt',
  'quality_debt',
  'review_verdict',
  'typed_blocker',
  'human_decision',
  'failed_path_note',
] as const;

export type LedgerEntryKind = (typeof LEDGER_ENTRY_KINDS)[number];

export type LedgerErrorCode =
  | 'INVALID_LEDGER_INPUT'
  | 'REFS_ONLY_VIOLATION'
  | 'TASK_NOT_FOUND'
  | 'STAGE_RUN_NOT_FOUND'
  | 'ATTEMPT_NOT_FOUND'
  | 'TASK_STAGE_MISMATCH'
  | 'STAGE_ATTEMPT_MISMATCH'
  | 'LEDGER_DB_ERROR';

export class LedgerError extends Error {
  readonly code: LedgerErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: LedgerErrorCode,
    message: string,
    details: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'LedgerError';
    this.code = code;
    this.details = details;
  }

  toJSON(): {
    name: string;
    code: LedgerErrorCode;
    message: string;
    details: Record<string, unknown>;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export interface ArtifactRefPayload {
  readonly path: string;
  readonly sha256?: string;
  readonly artifact_id?: string;
  readonly media_type?: string;
  readonly size_bytes?: number;
  readonly role?: string;
  readonly summary?: string;
  readonly source_refs?: readonly string[];
  readonly lineage_refs?: readonly string[];
  readonly checksum_status?: 'verified' | 'missing' | 'mismatch' | 'unchecked';
  readonly [key: string]: unknown;
}

export interface OwnerReceiptPayload {
  readonly receipt_id?: string;
  readonly status?: string;
  readonly delta_classification?:
    | 'deliverable_progress_delta'
    | 'platform_repair_delta'
    | 'advisory_delta'
    | 'typed_blocker'
    | 'human_gate';
  readonly produced_refs?: readonly string[];
  readonly consumed_refs?: readonly string[];
  readonly resolves_debt?: string;
  readonly resolves_debt_ids?: readonly string[];
  readonly next_owner?: string;
  readonly evidence_refs?: readonly string[];
  readonly summary?: string;
  readonly seq?: number;
  readonly [key: string]: unknown;
}

export interface QualityDebtPayload {
  readonly debt_id?: string;
  readonly id?: string;
  readonly code?: string;
  readonly summary?: string;
  readonly severity?: 'low' | 'medium' | 'high' | 'critical';
  readonly blocks_submission?: boolean;
  readonly evidence_refs?: readonly string[];
  readonly finding_ref?: string;
  readonly stage_id?: string;
  readonly [key: string]: unknown;
}

export type ReviewVerdictValue =
  | 'pass'
  | 'approved'
  | 'repair_required'
  | 'quality_debt'
  | 'hard_stop'
  | 'rejected';

export interface ReviewVerdictPayload {
  readonly verdict: ReviewVerdictValue;
  readonly reviewer_id?: string;
  readonly reviewer_role?: 'reviewer' | 're_reviewer' | 'human';
  readonly reviewed_artifact_refs?: readonly string[];
  readonly verified_hashes?: readonly string[];
  readonly finding_refs?: readonly string[];
  readonly quality_debt_ids?: readonly string[];
  readonly hard_stop_class?:
    | 'zero_consumable_artifact'
    | 'safety_or_compliance'
    | 'permission_or_credential_boundary'
    | 'human_decision_required'
    | 'authority_boundary_violation'
    | 'stale_or_mismatched_stage_identity';
  readonly summary?: string;
  readonly [key: string]: unknown;
}

export interface TypedBlockerPayload {
  readonly code: string;
  readonly blocker_class?: string;
  readonly message?: string;
  readonly summary?: string;
  readonly retryable?: boolean;
  readonly next_safe_action?: string;
  readonly evidence_refs?: readonly string[];
  readonly typed_blocker_ref?: string;
  readonly [key: string]: unknown;
}

export interface HumanDecisionPayload {
  readonly decision: string;
  readonly actor_id?: string;
  readonly gate_id?: string;
  readonly selected_option?: string;
  readonly reason?: string;
  readonly note?: string;
  readonly waived_debt_ids?: readonly string[];
  readonly evidence_refs?: readonly string[];
  readonly [key: string]: unknown;
}

export interface FailedPathNotePayload {
  readonly summary: string;
  readonly path_id?: string;
  readonly code?: string;
  readonly attempted_approach?: string;
  readonly failure_mode?: string;
  readonly failed_path_ref?: string;
  readonly artifact_refs?: readonly string[];
  readonly recoverable?: boolean;
  readonly [key: string]: unknown;
}

export interface LedgerPayloadByKind {
  artifact_ref: ArtifactRefPayload;
  owner_receipt: OwnerReceiptPayload;
  quality_debt: QualityDebtPayload;
  review_verdict: ReviewVerdictPayload;
  typed_blocker: TypedBlockerPayload;
  human_decision: HumanDecisionPayload;
  failed_path_note: FailedPathNotePayload;
}

export interface LedgerEntry<K extends LedgerEntryKind = LedgerEntryKind> {
  readonly entry_id: string;
  readonly task_id: string;
  readonly stage_run_id: string | null;
  readonly attempt_id: string | null;
  readonly entry_kind: K;
  readonly owner_id: string;
  readonly payload: LedgerPayloadByKind[K];
  readonly created_at: string;
}

export interface AppendLedgerEntryInput<K extends LedgerEntryKind = LedgerEntryKind> {
  readonly entry_id?: string;
  readonly task_id: string;
  readonly stage_run_id?: string | null;
  readonly attempt_id?: string | null;
  readonly entry_kind: K;
  readonly owner_id: string;
  readonly payload: LedgerPayloadByKind[K];
  readonly created_at?: string;
}

export interface RecordReviewInput {
  readonly entry_id?: string;
  readonly task_id: string;
  readonly stage_run_id?: string | null;
  readonly attempt_id?: string | null;
  readonly owner_id: string;
  readonly verdict: ReviewVerdictValue;
  readonly reviewer_id?: string;
  readonly reviewer_role?: 'reviewer' | 're_reviewer' | 'human';
  readonly reviewed_artifact_refs?: readonly string[];
  readonly verified_hashes?: readonly string[];
  readonly finding_refs?: readonly string[];
  readonly quality_debt_ids?: readonly string[];
  readonly hard_stop_class?: ReviewVerdictPayload['hard_stop_class'];
  readonly summary?: string;
  readonly created_at?: string;
}

export interface TimelineQuery {
  readonly task_id?: string;
  readonly stage_run_id?: string;
  readonly attempt_id?: string;
  readonly entry_kind?: LedgerEntryKind | readonly LedgerEntryKind[];
  readonly owner_id?: string;
  readonly since?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly order?: 'asc' | 'desc';
}

export interface ArtifactsQuery {
  readonly task_id: string;
  readonly stage_run_id?: string;
  readonly attempt_id?: string;
  readonly owner_id?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ReceiptsQuery {
  readonly task_id: string;
  readonly stage_run_id?: string;
  readonly attempt_id?: string;
  readonly owner_id?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface DebtsQuery {
  readonly task_id: string;
  readonly unresolved_only?: boolean;
}

export interface QualityDebtRecord {
  readonly debt_key: string;
  readonly entry: LedgerEntry<'quality_debt'>;
  readonly status: 'open' | 'resolved' | 'waived';
  readonly blocks_submission: boolean;
  readonly resolved_by_entry_id?: string;
}

export interface ArtifactHashMismatch {
  readonly entry_id: string;
  readonly path: string;
  readonly reason: 'missing' | 'hash_mismatch' | 'path_escape' | 'not_a_file';
  readonly expected_sha256?: string;
  readonly actual_sha256?: string;
}

export interface LineageVerificationResult {
  readonly ok: boolean;
  readonly task_id: string;
  readonly total_entries: number;
  readonly artifact_count: number;
  readonly open_debt_count: number;
  readonly open_blocking_debts: number;
  readonly latest_review_verdict: ReviewVerdictValue | null;
  readonly artifact_hash_mismatches: readonly ArtifactHashMismatch[];
}
