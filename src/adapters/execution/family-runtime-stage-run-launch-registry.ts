import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { getStageAttemptRow } from './family-runtime-stage-attempt-ledger.ts';
import { normalizeReviewerInputSnapshotRequest } from './family-runtime-reviewer-input-snapshot.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import type { WorkItemExecutionScopeSnapshot } from '../../authority/workspace/index.ts';
import {
  assertRuntimeRowScopeMatchesWrite,
  createRuntimeExecutionScopeTable,
  executionScopeColumnsFromRow,
  executionScopeFromRow,
  normalizeRuntimeExecutionScopeWrite,
  persistRuntimeExecutionScope,
  requireRuntimeExecutionScopeMutationAllowed,
  type RuntimeExecutionIdentityState,
  type RuntimeExecutionScopeKind,
  type RuntimeExecutionScopeWriteKind,
} from './family-runtime-execution-scope-persistence.ts';
import {
  addSqliteColumnIfMissing,
  readSqliteColumnNames,
  withImmediateSchemaMigration,
} from './family-runtime-schema-migrations.ts';
import {
  requireTemporalStageRunWorkflowInputLaunchable,
  temporalStageRunRecoveryResumeSha256,
  type TemporalStageRunWorkflowInput,
} from './family-runtime-temporal.ts';
import { requireNoActiveUnresolvedRuntimeIdentityConflict } from './family-runtime-legacy-identity-admission.ts';

export type StageRunLaunchStatus = 'registered' | 'starting' | 'start_failed' | 'started' | 'closed';

export const DEFAULT_STAGE_RUN_START_LEASE_MS = 30_000;

type StageRunLaunchRow = {
  stage_run_id: string;
  stage_run_invocation_id: string;
  stage_run_spec_sha256: string;
  domain_id: string;
  stage_id: string;
  workflow_id: string;
  parent_route_decision_ref: string | null;
  scope_kind?: RuntimeExecutionScopeKind;
  project_scope_id?: string | null;
  work_item_scope_id?: string | null;
  workspace_binding_id?: string | null;
  binding_version_id?: string | null;
  scope_digest?: string | null;
  execution_scope_json?: string | null;
  identity_state?: RuntimeExecutionIdentityState;
  stage_run_input_json: string;
  launch_status: StageRunLaunchStatus;
  temporal_start_receipt_json: string | null;
  terminal_status: string | null;
  last_start_error: string | null;
  start_claim_token: string | null;
  start_claimed_at: string | null;
  start_lease_expires_at: string | null;
  start_attempt_count: number;
  created_at: string;
  updated_at: string;
};

function nowIso(now?: Date) {
  return (now ?? new Date()).toISOString();
}

function parseObject(value: string | null) {
  if (!value) return null;
  const parsed = parseJsonText(value);
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
}

type StageRunRecoveryRun = {
  surface_kind: 'opl_stage_run_recovery_run';
  version: 'opl-stage-run-recovery-run.v1';
  recovery_id: string;
  recovery_resume_sha256: string;
  quality_cycle_id: string;
  producer_attempt_ref: string;
  recovery_resume: NonNullable<TemporalStageRunWorkflowInput['recovery_resume']>;
  start_status: 'starting' | 'started' | 'start_failed';
  start_claim_token: string | null;
  start_claimed_at: string | null;
  start_lease_expires_at: string | null;
  start_attempt_count: number;
  temporal_start_receipt: Record<string, unknown> | null;
  temporal_start_receipt_history?: Record<string, unknown>[];
  last_start_error: string | null;
  created_at: string;
  updated_at: string;
};

type StageRunRecoveryTerminalRetry = {
  recoveryRunId: string;
  workflowStatus: string;
  observationReceipt?: Record<string, unknown>;
};

function recoveryRuns(receipt: Record<string, unknown>) {
  const value = receipt.recovery_runs;
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry))) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted StageRun recovery receipts are invalid.',
      { failure_code: 'stage_run_recovery_registry_invalid' },
    );
  }
  return value as StageRunRecoveryRun[];
}

function stageRunInputWithoutRecovery(input: TemporalStageRunWorkflowInput) {
  const { recovery_resume: _recoveryResume, ...baseInput } = input;
  return baseInput;
}

function requireRecoveryRegistryIdentity(
  row: StageRunLaunchRow,
  workflowInput: TemporalStageRunWorkflowInput,
) {
  const launchInput = requireTemporalStageRunWorkflowInputLaunchable(workflowInput, {
    revalidateContent: 'historical_evidence',
  });
  const recovery = launchInput.recovery_resume!;
  const persistedInput = parseObject(row.stage_run_input_json);
  if (
    row.launch_status !== 'closed'
    || !persistedInput
    || canonicalJsonText(stageRunInputWithoutRecovery(launchInput)) !== canonicalJsonText(persistedInput)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun recovery must reuse one closed registered StageRun and its immutable launch input.',
      {
        failure_code: 'stage_run_recovery_launch_identity_mismatch',
        stage_run_id: row.stage_run_id,
        launch_status: row.launch_status,
      },
    );
  }
  return {
    recovery,
    recoveryResumeSha256: temporalStageRunRecoveryResumeSha256(launchInput),
  };
}

function recoveryArtifactProducerAttemptRef(
  recovery: NonNullable<TemporalStageRunWorkflowInput['recovery_resume']>,
) {
  const ref = recovery.artifact_producer_attempt_ref ?? recovery.producer_attempt_ref;
  if (!ref) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun recovery registry requires the artifact-producing Attempt ref.',
      { failure_code: 'stage_run_recovery_producer_identity_mismatch' },
    );
  }
  return ref;
}

function recoveryEntryIdentityMatches(
  entry: StageRunRecoveryRun,
  recovery: NonNullable<TemporalStageRunWorkflowInput['recovery_resume']>,
  recoveryResumeSha256: string,
) {
  return entry.recovery_id === recovery.recovery_id
    && entry.recovery_resume_sha256 === recoveryResumeSha256
    && entry.quality_cycle_id === recovery.quality_cycle_id
    && entry.producer_attempt_ref === recoveryArtifactProducerAttemptRef(recovery)
    && canonicalJsonText(entry.recovery_resume) === canonicalJsonText(recovery);
}

function recoveryEntryCanAdvanceToRepairerResume(
  entry: StageRunRecoveryRun,
  recovery: NonNullable<TemporalStageRunWorkflowInput['recovery_resume']>,
  terminalRetry: StageRunRecoveryTerminalRetry,
) {
  const persistedRunId = typeof entry.temporal_start_receipt?.recovery_run_id === 'string'
    ? entry.temporal_start_receipt.recovery_run_id
    : null;
  const priorAttempts = recovery.prior_attempt_summaries;
  const priorProducerRef = entry.producer_attempt_ref;
  const priorProducerPresent = Array.isArray(priorAttempts)
    && priorAttempts.some((attempt) => `opl://stage_attempts/${attempt.stage_attempt_id}` === priorProducerRef);
  const nextProducerRef = recoveryArtifactProducerAttemptRef(recovery);
  const latestAttempt = Array.isArray(priorAttempts) ? priorAttempts.at(-1) : null;
  return entry.start_status === 'started'
    && persistedRunId === terminalRetry.recoveryRunId
    && terminalTemporalRecoveryStatus(terminalRetry.workflowStatus)
    && entry.quality_cycle_id === recovery.quality_cycle_id
    && priorProducerPresent
    && Array.isArray(recovery.findings)
    && recovery.findings.length > 0
    && Array.isArray(recovery.review_receipts)
    && recovery.review_receipts.length > 0
    && (
      (recovery.resume_after_role === 'repairer'
        && nextProducerRef !== priorProducerRef
        && latestAttempt?.attempt_role === 'repairer'
        && Array.isArray(recovery.repair_map)
        && recovery.repair_map.length > 0
        && recovery.repair_rounds_used === latestAttempt.quality_round_index)
      || (recovery.resume_after_role === 'reviewer'
        && nextProducerRef === priorProducerRef
        && latestAttempt?.attempt_role === 'reviewer'
        && recovery.reviewer_attempt_ref === `opl://stage_attempts/${latestAttempt.stage_attempt_id}`
        && recovery.review_receipts.at(-1)?.reviewer_attempt_ref === recovery.reviewer_attempt_ref
        && recovery.review_receipts.at(-1)?.producer_attempt_ref === priorProducerRef
        && recovery.review_receipts.at(-1)?.verdict === 'repair_required'
        && (recovery.repair_rounds_used ?? -1) >= (entry.recovery_resume.repair_rounds_used ?? 0)
        && canonicalJsonText(recovery.artifact_refs) === canonicalJsonText(entry.recovery_resume.artifact_refs)
        && canonicalJsonText(recovery.artifact_hashes) === canonicalJsonText(entry.recovery_resume.artifact_hashes)
        && canonicalJsonText(recovery.artifact_identity_receipt_refs) === canonicalJsonText(entry.recovery_resume.artifact_identity_receipt_refs))
    );
}

function recoveryResumeSnapshotEnrichmentIdentity(
  recovery: NonNullable<TemporalStageRunWorkflowInput['recovery_resume']>,
) {
  const {
    review_input_snapshot_materialization_request: _reviewerSnapshot,
    quality_debt_refs: _qualityDebtRefs,
    ...identity
  } = recovery;
  return identity;
}

function recoveryQualityDebtRefsCanAdvance(
  previous: NonNullable<TemporalStageRunWorkflowInput['recovery_resume']>,
  next: NonNullable<TemporalStageRunWorkflowInput['recovery_resume']>,
) {
  const previousRefs = previous.quality_debt_refs ?? [];
  const nextRefs = next.quality_debt_refs ?? [];
  return previousRefs.length <= nextRefs.length
    && previousRefs.every((ref, index) => nextRefs[index] === ref);
}

function recoveryResumeChangedFields(
  previous: NonNullable<TemporalStageRunWorkflowInput['recovery_resume']>,
  next: NonNullable<TemporalStageRunWorkflowInput['recovery_resume']>,
) {
  return [...new Set([...Object.keys(previous), ...Object.keys(next)])]
    .sort()
    .filter((field) => canonicalJsonText(previous[field as keyof typeof previous] ?? null)
      !== canonicalJsonText(next[field as keyof typeof next] ?? null));
}

function recoveryEntryCanEnrichReviewerSnapshot(
  row: StageRunLaunchRow,
  entry: StageRunRecoveryRun,
  recovery: NonNullable<TemporalStageRunWorkflowInput['recovery_resume']>,
  terminalRetry: StageRunRecoveryTerminalRetry,
) {
  const previousSnapshot = entry.recovery_resume.review_input_snapshot_materialization_request;
  const nextSnapshot = recovery.review_input_snapshot_materialization_request;
  const persistedRunId = typeof entry.temporal_start_receipt?.recovery_run_id === 'string'
    ? entry.temporal_start_receipt.recovery_run_id
    : null;
  const observation = terminalRetry.observationReceipt;
  const terminalObservationMatchesFailedStart = entry.start_status === 'start_failed'
    && !persistedRunId
    && observation?.workflow_found === true
    && observation.stage_run_id === row.stage_run_id
    && observation.workflow_id === row.workflow_id
    && observation.recovery_id === entry.recovery_id
    && observation.first_execution_run_id === terminalRetry.recoveryRunId
    && observation.workflow_status === terminalRetry.workflowStatus;
  const persistedStartMatchesTerminalObservation = entry.start_status === 'started'
    && persistedRunId === terminalRetry.recoveryRunId;
  return entry.recovery_id === recovery.recovery_id
    && entry.quality_cycle_id === recovery.quality_cycle_id
    && entry.producer_attempt_ref === recoveryArtifactProducerAttemptRef(recovery)
    && (previousSnapshot === null || previousSnapshot === undefined)
    && Boolean(nextSnapshot && typeof nextSnapshot === 'object' && !Array.isArray(nextSnapshot))
    && canonicalJsonText(recoveryResumeSnapshotEnrichmentIdentity(entry.recovery_resume))
      === canonicalJsonText(recoveryResumeSnapshotEnrichmentIdentity(recovery))
    && recoveryQualityDebtRefsCanAdvance(entry.recovery_resume, recovery)
    && terminalTemporalRecoveryStatus(terminalRetry.workflowStatus)
    && (persistedStartMatchesTerminalObservation || terminalObservationMatchesFailedStart);
}

function recoveryEntryCanExtendAcceptedProducerSnapshot(
  db: DatabaseSync,
  row: StageRunLaunchRow,
  entry: StageRunRecoveryRun,
  recovery: NonNullable<TemporalStageRunWorkflowInput['recovery_resume']>,
  terminalRetry: StageRunRecoveryTerminalRetry,
) {
  const previous = entry.recovery_resume;
  if (entry.start_status !== 'started'
    || entry.temporal_start_receipt?.recovery_run_id !== terminalRetry.recoveryRunId
    || !terminalTemporalRecoveryStatus(terminalRetry.workflowStatus)
    || previous.resume_after_role || recovery.resume_after_role
    || !previous.review_input_snapshot_materialization_request
    || !recovery.review_input_snapshot_materialization_request
    || entry.quality_cycle_id !== recovery.quality_cycle_id
    || entry.producer_attempt_ref !== recovery.producer_attempt_ref) return false;
  const before = normalizeReviewerInputSnapshotRequest(previous.review_input_snapshot_materialization_request);
  const after = normalizeReviewerInputSnapshotRequest(recovery.review_input_snapshot_materialization_request);

  const producer = getStageAttemptRow(db, entry.producer_attempt_ref.replace(/^opl:\/\/stage_attempts\//, ''));
  if (!producer || producer.stage_run_id !== row.stage_run_id
    || producer.attempt_role !== 'producer' || producer.status !== 'completed'
    || producer.closeout_receipt_status !== 'accepted_typed_closeout') return false;
  // Supplement only before review starts; never replace evidence already reviewed.
  if (db.prepare('SELECT 1 FROM stage_attempts WHERE stage_run_id = ? AND stage_attempt_id != ? LIMIT 1')
    .get(row.stage_run_id, producer.stage_attempt_id)) return false;
  const impact = parseObject(producer.route_impact_json);
  const quality = isRecord(impact?.stage_quality_cycle) ? impact.stage_quality_cycle : null;
  const hashes = (value: unknown) => Array.isArray(value)
    ? value.map((hash) => String(hash).replace(/^sha256:/, '')) : null;
  if (!quality
    || canonicalJsonText(quality.review_input_snapshot_materialization_request ?? null) !== canonicalJsonText(after)
    || canonicalJsonText(quality.artifact_refs ?? null) !== canonicalJsonText(recovery.artifact_refs)
    || canonicalJsonText(hashes(quality.artifact_hashes)) !== canonicalJsonText(hashes(recovery.artifact_hashes))
    || canonicalJsonText(quality.artifact_identity_receipt_refs ?? null) !== canonicalJsonText(recovery.artifact_identity_receipt_refs)) return false;

  const withoutArtifactLists = (value: Record<string, unknown>) => {
    const { artifact_refs: _refs, artifact_hashes: _hashes, artifact_identity_receipt_refs: _receipts, ...rest } = value;
    return rest;
  };
  const identity = (value: typeof recovery) => {
    const { recovery_id: _id, review_input_snapshot_materialization_request: _snapshot,
      producer_attempt_summary: summary, ...rest } = value;
    return { ...withoutArtifactLists(rest), producer_attempt_summary: summary ? withoutArtifactLists(summary) : null };
  };
  const snapshotIdentity = (value: typeof before) => {
    const { owner_authority_ref: _authority, members: _members, ...rest } = value;
    return rest;
  };
  return canonicalJsonText(identity(previous)) === canonicalJsonText(identity(recovery))
    && canonicalJsonText(snapshotIdentity(before)) === canonicalJsonText(snapshotIdentity(after))
    && previous.artifact_refs.every((ref, index) => {
      const nextIndex = recovery.artifact_refs.indexOf(ref);
      return nextIndex >= 0 && previous.artifact_hashes[index] === recovery.artifact_hashes[nextIndex]
        && previous.artifact_identity_receipt_refs[index] === recovery.artifact_identity_receipt_refs[nextIndex];
    })
    && before.members.every((member) => after.members.some((next) => next.source_ref === member.source_ref
      && next.sha256 === member.sha256 && next.size_bytes === member.size_bytes));
}

function recoveryEntryCanRestoreOwnerRepairMap(
  db: DatabaseSync,
  row: StageRunLaunchRow,
  entry: StageRunRecoveryRun,
  recovery: NonNullable<TemporalStageRunWorkflowInput['recovery_resume']>,
  terminalRetry: StageRunRecoveryTerminalRetry,
) {
  if (entry.start_status !== 'started'
    || entry.temporal_start_receipt?.recovery_run_id !== terminalRetry.recoveryRunId
    || !terminalTemporalRecoveryStatus(terminalRetry.workflowStatus)
    || recovery.resume_after_role !== 'repairer'
    || canonicalJsonText(recoveryResumeChangedFields(entry.recovery_resume, recovery))
      !== canonicalJsonText(['repair_map'])) return false;
  const producerRef = recoveryArtifactProducerAttemptRef(recovery);
  const producer = getStageAttemptRow(db, producerRef.replace(/^opl:\/\/stage_attempts\//, ''));
  if (!producer || producer.stage_run_id !== row.stage_run_id
    || producer.attempt_role !== 'repairer') return false;
  const impact = parseObject(producer.route_impact_json);
  const quality = isRecord(impact?.stage_quality_cycle) ? impact.stage_quality_cycle : null;
  // A terminal recovery can correct only its derived map, never the owner's output.
  return Array.isArray(quality?.repair_map) && quality.repair_map.length > 0
    && canonicalJsonText(quality.repair_map) === canonicalJsonText(recovery.repair_map);
}

function recoveryEntryCanAppendQualityDebtRefs(
  entry: StageRunRecoveryRun,
  recovery: NonNullable<TemporalStageRunWorkflowInput['recovery_resume']>,
  terminalRetry: StageRunRecoveryTerminalRetry,
) {
  return entry.start_status === 'started'
    && entry.temporal_start_receipt?.recovery_run_id === terminalRetry.recoveryRunId
    && terminalTemporalRecoveryStatus(terminalRetry.workflowStatus)
    && entry.recovery_id === recovery.recovery_id
    && entry.quality_cycle_id === recovery.quality_cycle_id
    && entry.producer_attempt_ref === recoveryArtifactProducerAttemptRef(recovery)
    && canonicalJsonText(recoveryResumeChangedFields(entry.recovery_resume, recovery))
      === canonicalJsonText(['quality_debt_refs'])
    && (recovery.quality_debt_refs?.length ?? 0) > (entry.recovery_resume.quality_debt_refs?.length ?? 0)
    && recoveryQualityDebtRefsCanAdvance(entry.recovery_resume, recovery);
}

function activeRecoveryStartingLease(entry: StageRunRecoveryRun, now: Date) {
  if (entry.start_status !== 'starting' || !entry.start_claim_token || !entry.start_lease_expires_at) return false;
  const expiresAt = Date.parse(entry.start_lease_expires_at);
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

function terminalTemporalRecoveryStatus(value: string) {
  return [
    'COMPLETED',
    'FAILED',
    'CANCELED',
    'CANCELLED',
    'TERMINATED',
    'TIMED_OUT',
  ].includes(value.trim().toUpperCase());
}

function writeRecoveryRuns(
  db: DatabaseSync,
  row: StageRunLaunchRow,
  receipt: Record<string, unknown>,
  runs: StageRunRecoveryRun[],
  now: Date,
) {
  db.prepare(`
    UPDATE stage_run_launches
    SET temporal_start_receipt_json = ?, updated_at = ?
    WHERE stage_run_id = ?
  `).run(canonicalJsonText({ ...receipt, recovery_runs: runs }), nowIso(now), row.stage_run_id);
  return rowPayload(launchRow(db, row.stage_run_id)!);
}

function rowPayload(row: StageRunLaunchRow) {
  const scopeColumns = executionScopeColumnsFromRow(row);
  return {
    surface_kind: 'opl_stage_run_launch_registry_entry',
    version: 'opl-stage-run-launch-registry-entry.v2',
    stage_run_id: row.stage_run_id,
    stage_run_invocation_id: row.stage_run_invocation_id,
    stage_run_spec_sha256: row.stage_run_spec_sha256,
    domain_id: row.domain_id,
    stage_id: row.stage_id,
    workflow_id: row.workflow_id,
    parent_route_decision_ref: row.parent_route_decision_ref,
    ...scopeColumns,
    execution_scope: executionScopeFromRow(row),
    stage_run_input: parseObject(row.stage_run_input_json) as TemporalStageRunWorkflowInput,
    launch_status: row.launch_status,
    temporal_start_receipt: parseObject(row.temporal_start_receipt_json),
    terminal_status: row.terminal_status,
    last_start_error: row.last_start_error,
    start_claim: row.start_claim_token
      ? {
          token: row.start_claim_token,
          claimed_at: row.start_claimed_at,
          lease_expires_at: row.start_lease_expires_at,
          attempt_count: row.start_attempt_count,
        }
      : null,
    start_attempt_count: row.start_attempt_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
    authority_boundary: {
      opl: 'durable_stage_run_launch_identity_and_transport_recovery_only',
      domain: 'stage_semantics_truth_quality_artifact_and_route_judgment_owner',
      sqlite_is_domain_truth: false,
    },
  } as const;
}

export function createStageRunLaunchTable(db: DatabaseSync) {
  db.exec('PRAGMA busy_timeout = 5000');
  return withImmediateSchemaMigration(db, () => {
    createRuntimeExecutionScopeTable(db);
    db.exec(`
      CREATE TABLE IF NOT EXISTS stage_run_launches (
        stage_run_id TEXT PRIMARY KEY,
        stage_run_invocation_id TEXT NOT NULL,
        stage_run_spec_sha256 TEXT NOT NULL,
        domain_id TEXT NOT NULL,
        stage_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL UNIQUE,
        parent_route_decision_ref TEXT,
        scope_kind TEXT NOT NULL DEFAULT 'identity_unresolved'
          CHECK(scope_kind IN ('work_item', 'domain', 'system', 'identity_unresolved')),
        project_scope_id TEXT,
        work_item_scope_id TEXT,
        workspace_binding_id TEXT,
        binding_version_id TEXT,
        scope_digest TEXT REFERENCES execution_scopes(scope_digest),
        execution_scope_json TEXT,
        identity_state TEXT NOT NULL DEFAULT 'identity_unresolved'
          CHECK(identity_state IN ('resolved', 'identity_unresolved', 'quarantined')),
        stage_run_input_json TEXT NOT NULL,
        launch_status TEXT NOT NULL,
        temporal_start_receipt_json TEXT,
        terminal_status TEXT,
        last_start_error TEXT,
        start_claim_token TEXT,
        start_claimed_at TEXT,
        start_lease_expires_at TEXT,
        start_attempt_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(domain_id, stage_id, stage_run_invocation_id)
      );
    `);
    const columns = readSqliteColumnNames(db, 'stage_run_launches');
    for (const [column, definition] of [
      ['start_claim_token', 'start_claim_token TEXT'],
      ['start_claimed_at', 'start_claimed_at TEXT'],
      ['start_lease_expires_at', 'start_lease_expires_at TEXT'],
      ['start_attempt_count', 'start_attempt_count INTEGER NOT NULL DEFAULT 0'],
      [
        'scope_kind',
        "scope_kind TEXT NOT NULL DEFAULT 'identity_unresolved' CHECK(scope_kind IN ('work_item', 'domain', 'system', 'identity_unresolved'))",
      ],
      ['project_scope_id', 'project_scope_id TEXT'],
      ['work_item_scope_id', 'work_item_scope_id TEXT'],
      ['workspace_binding_id', 'workspace_binding_id TEXT'],
      ['binding_version_id', 'binding_version_id TEXT'],
      ['scope_digest', 'scope_digest TEXT REFERENCES execution_scopes(scope_digest)'],
      ['execution_scope_json', 'execution_scope_json TEXT'],
      [
        'identity_state',
        "identity_state TEXT NOT NULL DEFAULT 'identity_unresolved' CHECK(identity_state IN ('resolved', 'identity_unresolved', 'quarantined'))",
      ],
    ] as const) {
      addSqliteColumnIfMissing(db, 'stage_run_launches', columns, column, definition);
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_stage_run_launches_invocation
        ON stage_run_launches(domain_id, stage_id, stage_run_invocation_id);
      CREATE INDEX IF NOT EXISTS idx_stage_run_launches_status
        ON stage_run_launches(launch_status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_stage_run_launches_work_item_scope
        ON stage_run_launches(work_item_scope_id, stage_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_stage_run_launches_scope_digest
        ON stage_run_launches(scope_digest);
    `);
  });
}

function launchRow(db: DatabaseSync, stageRunId: string) {
  return db.prepare('SELECT * FROM stage_run_launches WHERE stage_run_id = ?')
    .get(stageRunId) as StageRunLaunchRow | undefined;
}

export function inspectStageRunLaunch(db: DatabaseSync, stageRunId: string) {
  const row = launchRow(db, stageRunId);
  if (!row) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun launch is not registered.',
      { stage_run_id: stageRunId },
    );
  }
  return rowPayload(row);
}

export function findStageRunLaunch(db: DatabaseSync, stageRunId: string) {
  createStageRunLaunchTable(db);
  const row = launchRow(db, stageRunId);
  return row ? rowPayload(row) : null;
}

export function isRegisteredReviewerRecoveryRepair(db: DatabaseSync, input: {
  stageRunId: string;
  qualityCycleId: string;
  reviewerAttemptRef: string;
  repairRound: number;
}) {
  const launch = findStageRunLaunch(db, input.stageRunId);
  const receipt = launch?.temporal_start_receipt;
  if (!launch || !receipt) return false;
  const entry = recoveryRuns(receipt).at(-1);
  const resume = entry?.recovery_resume;
  return Boolean(entry && resume
    && ['starting', 'started'].includes(entry.start_status)
    && resume.resume_after_role === 'reviewer'
    && resume.quality_cycle_id === input.qualityCycleId
    && resume.reviewer_attempt_ref === input.reviewerAttemptRef
    && resume.review_receipts?.at(-1)?.reviewer_attempt_ref === input.reviewerAttemptRef
    && resume.review_receipts?.at(-1)?.verdict === 'repair_required'
    && input.repairRound === (resume.repair_rounds_used ?? -1) + 1);
}

export function registerStageRunLaunch(
  db: DatabaseSync,
  input: TemporalStageRunWorkflowInput,
  scopeInput: {
    scopeKind?: RuntimeExecutionScopeWriteKind;
    executionScope?: WorkItemExecutionScopeSnapshot | null;
  } = {},
) {
  const stageRunInput = requireTemporalStageRunWorkflowInputLaunchable(input, {
    revalidateContent: 'historical_evidence',
  });
  createStageRunLaunchTable(db);
  const canonicalInput = canonicalJsonText(stageRunInput);
  const scope = normalizeRuntimeExecutionScopeWrite({
    domainId: stageRunInput.domain_id,
    scopeKind: stageRunInput.scope_kind,
    executionScope: stageRunInput.execution_scope,
  });
  if (scopeInput.scopeKind !== undefined || scopeInput.executionScope !== undefined) {
    const suppliedScope = normalizeRuntimeExecutionScopeWrite({
      domainId: stageRunInput.domain_id,
      scopeKind: scopeInput.scopeKind,
      executionScope: scopeInput.executionScope,
    });
    if (canonicalJsonText(suppliedScope.columns) !== canonicalJsonText(scope.columns)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun registry scope input conflicts with the StageRun direct execution identity.',
        {
          failure_code: 'runtime_execution_scope_conflict',
          stage_run_id: stageRunInput.stage_run_id,
          direct_scope_kind: scope.columns.scope_kind,
          supplied_scope_kind: suppliedScope.columns.scope_kind,
          direct_scope_digest: scope.columns.scope_digest,
          supplied_scope_digest: suppliedScope.columns.scope_digest,
        },
      );
    }
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare(`
      SELECT * FROM stage_run_launches
      WHERE domain_id = ? AND stage_id = ? AND stage_run_invocation_id = ?
    `).get(
      stageRunInput.domain_id,
      stageRunInput.stage_id,
      stageRunInput.stage_run_invocation_id,
    ) as StageRunLaunchRow | undefined;
    if (existing) {
      assertRuntimeRowScopeMatchesWrite(existing, scope, {
        stage_run_id: existing.stage_run_id,
        stage_run_invocation_id: stageRunInput.stage_run_invocation_id,
      });
      if (
        existing.stage_run_id !== stageRunInput.stage_run_id
        || existing.stage_run_spec_sha256 !== stageRunInput.stage_run_spec_sha256
      ) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'StageRun invocation is already bound to a different immutable spec.',
          {
            failure_code: 'stage_run_invocation_spec_conflict',
            domain_id: stageRunInput.domain_id,
            stage_id: stageRunInput.stage_id,
            stage_run_invocation_id: stageRunInput.stage_run_invocation_id,
            existing_stage_run_id: existing.stage_run_id,
            received_stage_run_id: stageRunInput.stage_run_id,
            existing_stage_run_spec_sha256: existing.stage_run_spec_sha256,
            received_stage_run_spec_sha256: stageRunInput.stage_run_spec_sha256,
          },
        );
      }
      db.exec('COMMIT');
      return {
        registered: false,
        idempotent_replay: true,
        launch: rowPayload(existing),
      } as const;
    }
    requireNoActiveUnresolvedRuntimeIdentityConflict({
      db,
      domainId: stageRunInput.domain_id,
      stageId: stageRunInput.stage_id,
      executionScope: scope.executionScope,
      operation: 'register_stage_run_launch',
      candidateStageRunId: stageRunInput.stage_run_id,
    });
    persistRuntimeExecutionScope(db, scope, stageRunInput.domain_id);
    requireTemporalStageRunWorkflowInputLaunchable(stageRunInput);
    const createdAt = nowIso();
    db.prepare(`
      INSERT INTO stage_run_launches (
        stage_run_id, stage_run_invocation_id, stage_run_spec_sha256,
        domain_id, stage_id, workflow_id, parent_route_decision_ref,
        scope_kind, project_scope_id, work_item_scope_id, workspace_binding_id,
        binding_version_id, scope_digest, execution_scope_json, identity_state,
        stage_run_input_json, launch_status, temporal_start_receipt_json,
        terminal_status, last_start_error, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, 'registered', NULL, NULL, NULL, ?, ?
      )
    `).run(
      stageRunInput.stage_run_id,
      stageRunInput.stage_run_invocation_id,
      stageRunInput.stage_run_spec_sha256,
      stageRunInput.domain_id,
      stageRunInput.stage_id,
      stageRunInput.workflow_id,
      stageRunInput.parent_route_decision_ref ?? null,
      scope.columns.scope_kind,
      scope.columns.project_scope_id,
      scope.columns.work_item_scope_id,
      scope.columns.workspace_binding_id,
      scope.columns.binding_version_id,
      scope.columns.scope_digest,
      scope.columns.execution_scope_json,
      scope.columns.identity_state,
      canonicalInput,
      createdAt,
      createdAt,
    );
    const row = launchRow(db, stageRunInput.stage_run_id)!;
    db.exec('COMMIT');
    return {
      registered: true,
      idempotent_replay: false,
      launch: rowPayload(row),
    } as const;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function validLeaseMs(value: number | undefined) {
  if (value === undefined) return DEFAULT_STAGE_RUN_START_LEASE_MS;
  if (!Number.isSafeInteger(value) || value < 1 || value > 5 * 60_000) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun start claim lease must be an integer between 1 ms and 5 minutes.',
      { lease_ms: value },
    );
  }
  return value;
}

function activeStartingLease(row: StageRunLaunchRow, now: Date) {
  if (row.launch_status !== 'starting' || !row.start_claim_token || !row.start_lease_expires_at) {
    return false;
  }
  const expiresAt = Date.parse(row.start_lease_expires_at);
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

export function claimStageRunStart(
  db: DatabaseSync,
  input: {
    stageRunId: string;
    now?: Date;
    leaseMs?: number;
    claimToken?: string;
  },
) {
  createStageRunLaunchTable(db);
  const now = input.now ?? new Date();
  const leaseMs = validLeaseMs(input.leaseMs);
  const claimToken = input.claimToken?.trim() || crypto.randomUUID();
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = launchRow(db, input.stageRunId);
    if (!existing) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun start cannot be claimed before launch registration.',
        { stage_run_id: input.stageRunId },
      );
    }
    requireRuntimeExecutionScopeMutationAllowed(db, existing, 'claim_stage_run_start');
    if (existing.launch_status === 'started' || existing.launch_status === 'closed') {
      db.exec('COMMIT');
      return {
        claimed: false,
        claim_status: existing.launch_status,
        claim_token: null,
        launch: rowPayload(existing),
      } as const;
    }
    if (activeStartingLease(existing, now)) {
      db.exec('COMMIT');
      return {
        claimed: false,
        claim_status: 'active_starting' as const,
        claim_token: null,
        launch: rowPayload(existing),
      } as const;
    }
    requireNoActiveUnresolvedRuntimeIdentityConflict({
      db,
      domainId: existing.domain_id,
      stageId: existing.stage_id,
      executionScope: executionScopeFromRow(existing),
      operation: 'claim_stage_run_start',
      candidateStageRunId: existing.stage_run_id,
    });
    const claimedAt = nowIso(now);
    const leaseExpiresAt = nowIso(new Date(now.getTime() + leaseMs));
    const result = db.prepare(`
      UPDATE stage_run_launches
      SET launch_status = 'starting',
          start_claim_token = ?,
          start_claimed_at = ?,
          start_lease_expires_at = ?,
          start_attempt_count = start_attempt_count + 1,
          last_start_error = NULL,
          updated_at = ?
      WHERE stage_run_id = ?
        AND launch_status IN ('registered', 'start_failed', 'starting')
    `).run(
      claimToken,
      claimedAt,
      leaseExpiresAt,
      claimedAt,
      input.stageRunId,
    );
    if (result.changes !== 1) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun start claim lost its compare-and-set race.',
        {
          failure_code: 'stage_run_start_claim_conflict',
          stage_run_id: input.stageRunId,
        },
      );
    }
    const claimed = launchRow(db, input.stageRunId)!;
    db.exec('COMMIT');
    return {
      claimed: true,
      claim_status: existing.launch_status === 'starting'
        ? 'stale_lease_takeover' as const
        : 'claimed' as const,
      claim_token: claimToken,
      launch: rowPayload(claimed),
    } as const;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function recordStageRunTemporalStart(
  db: DatabaseSync,
  input: {
    stageRunId: string;
    temporalStartReceipt: Record<string, unknown>;
    claimToken?: string | null;
    now?: Date;
  },
) {
  createStageRunLaunchTable(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = launchRow(db, input.stageRunId);
    if (!row) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Temporal StageRun start cannot be recorded before launch registration.',
        { stage_run_id: input.stageRunId },
      );
    }
    requireRuntimeExecutionScopeMutationAllowed(db, row, 'record_stage_run_temporal_start');
    const receipt = input.temporalStartReceipt;
    const workflowId = typeof receipt.workflow_id === 'string' ? receipt.workflow_id.trim() : '';
    const firstExecutionRunId = typeof receipt.first_execution_run_id === 'string'
      ? receipt.first_execution_run_id.trim()
      : '';
    const optionalIdentityMismatch = (
      (typeof receipt.stage_run_id === 'string' && receipt.stage_run_id !== row.stage_run_id)
      || (
        typeof receipt.stage_run_invocation_id === 'string'
        && receipt.stage_run_invocation_id !== row.stage_run_invocation_id
      )
      || (
        typeof receipt.stage_run_spec_sha256 === 'string'
        && receipt.stage_run_spec_sha256 !== row.stage_run_spec_sha256
      )
    );
    if (workflowId !== row.workflow_id || !firstExecutionRunId || optionalIdentityMismatch) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Temporal StageRun start receipt does not bind the registered Run and first execution.',
        {
          failure_code: 'stage_run_temporal_start_receipt_identity_mismatch',
          stage_run_id: row.stage_run_id,
          expected_workflow_id: row.workflow_id,
          received_workflow_id: workflowId || null,
          first_execution_run_id: firstExecutionRunId || null,
        },
      );
    }
    const existingReceipt = parseObject(row.temporal_start_receipt_json);
    const existingFirstExecutionRunId = existingReceipt
      && typeof existingReceipt.first_execution_run_id === 'string'
      ? existingReceipt.first_execution_run_id
      : null;
    if (
      (row.launch_status === 'started' || row.launch_status === 'closed')
      && existingFirstExecutionRunId
      && existingFirstExecutionRunId !== firstExecutionRunId
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'One StageRun workflow id cannot bind two Temporal first executions.',
        {
          failure_code: 'stage_run_temporal_execution_identity_conflict',
          stage_run_id: row.stage_run_id,
          existing_first_execution_run_id: existingFirstExecutionRunId,
          received_first_execution_run_id: firstExecutionRunId,
        },
      );
    }
    if (row.launch_status === 'closed' || row.launch_status === 'started') {
      db.exec('COMMIT');
      return rowPayload(row);
    }
    db.prepare(`
      UPDATE stage_run_launches
      SET launch_status = 'started',
          temporal_start_receipt_json = ?,
          terminal_status = NULL,
          last_start_error = NULL,
          start_claim_token = NULL,
          start_claimed_at = NULL,
          start_lease_expires_at = NULL,
          updated_at = ?
      WHERE stage_run_id = ? AND launch_status IN ('registered', 'starting', 'start_failed')
    `).run(canonicalJsonText(receipt), nowIso(input.now), input.stageRunId);
    const updated = launchRow(db, input.stageRunId)!;
    db.exec('COMMIT');
    return rowPayload(updated);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function claimStageRunRecoveryStart(
  db: DatabaseSync,
  input: {
    workflowInput: TemporalStageRunWorkflowInput;
    now?: Date;
    leaseMs?: number;
    claimToken?: string;
    terminalRetry?: StageRunRecoveryTerminalRetry;
  },
) {
  createStageRunLaunchTable(db);
  const now = input.now ?? new Date();
  const leaseMs = validLeaseMs(input.leaseMs);
  const claimToken = input.claimToken?.trim() || crypto.randomUUID();
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = launchRow(db, input.workflowInput.stage_run_id);
    if (!row) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun recovery cannot be claimed before launch registration.',
        { stage_run_id: input.workflowInput.stage_run_id },
      );
    }
    requireRuntimeExecutionScopeMutationAllowed(db, row, 'claim_stage_run_recovery_start');
    const { recovery, recoveryResumeSha256 } = requireRecoveryRegistryIdentity(row, input.workflowInput);
    const receipt = parseObject(row.temporal_start_receipt_json);
    if (!receipt) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Closed StageRun recovery requires the original Temporal start receipt.',
        { failure_code: 'stage_run_recovery_original_start_receipt_missing', stage_run_id: row.stage_run_id },
      );
    }
    const runs = recoveryRuns(receipt);
    if (runs.length > 1) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'One StageRun may have only one closeout recovery execution.',
        { failure_code: 'stage_run_recovery_registry_invalid', stage_run_id: row.stage_run_id },
      );
    }
    const existing = runs[0];
    const identityMatches = !existing || recoveryEntryIdentityMatches(existing, recovery, recoveryResumeSha256);
    const repairerResumeRetry = existing && !identityMatches && input.terminalRetry
      ? recoveryEntryCanAdvanceToRepairerResume(existing, recovery, input.terminalRetry)
      : false;
    const reviewerSnapshotEnrichmentRetry = existing && !identityMatches && input.terminalRetry
      ? recoveryEntryCanEnrichReviewerSnapshot(row, existing, recovery, input.terminalRetry)
      : false;
    const ownerRepairMapRetry = existing && !identityMatches && input.terminalRetry
      ? recoveryEntryCanRestoreOwnerRepairMap(db, row, existing, recovery, input.terminalRetry)
      : false;
    const qualityDebtAppendRetry = existing && !identityMatches && input.terminalRetry
      ? recoveryEntryCanAppendQualityDebtRefs(existing, recovery, input.terminalRetry)
      : false;
    const producerSnapshotExtensionRetry = existing && !identityMatches && input.terminalRetry
      ? recoveryEntryCanExtendAcceptedProducerSnapshot(db, row, existing, recovery, input.terminalRetry)
      : false;
    if (existing && !identityMatches && !repairerResumeRetry && !reviewerSnapshotEnrichmentRetry
      && !ownerRepairMapRetry && !qualityDebtAppendRetry && !producerSnapshotExtensionRetry) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun is already bound to a different closeout recovery identity.',
        {
          failure_code: 'stage_run_recovery_identity_conflict',
          stage_run_id: row.stage_run_id,
          existing_recovery_id: existing.recovery_id,
          received_recovery_id: recovery.recovery_id,
          existing_start_status: existing.start_status,
          recovery_resume_changed_fields: recoveryResumeChangedFields(existing.recovery_resume, recovery),
          existing_snapshot_present:
            existing.recovery_resume.review_input_snapshot_materialization_request != null,
          received_snapshot_present: recovery.review_input_snapshot_materialization_request != null,
          terminal_retry_present: Boolean(input.terminalRetry),
          terminal_retry_run_id: input.terminalRetry?.recoveryRunId ?? null,
          terminal_retry_workflow_status: input.terminalRetry?.workflowStatus ?? null,
        },
      );
    }
    if (existing?.start_status === 'started') {
      if (!input.terminalRetry) {
        db.exec('COMMIT');
        return {
          claimed: false,
          claim_status: 'started' as const,
          claim_token: null,
          recovery_run: existing,
          launch: rowPayload(row),
        };
      }
      const existingRunId = typeof existing.temporal_start_receipt?.recovery_run_id === 'string'
        ? existing.temporal_start_receipt.recovery_run_id
        : null;
      if (
        !existingRunId
        || existingRunId !== input.terminalRetry.recoveryRunId
        || !terminalTemporalRecoveryStatus(input.terminalRetry.workflowStatus)
      ) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'StageRun recovery terminal retry does not match a terminal persisted Temporal Run.',
          {
            failure_code: 'stage_run_recovery_terminal_retry_identity_mismatch',
            stage_run_id: row.stage_run_id,
            recovery_id: recovery.recovery_id,
            existing_recovery_run_id: existingRunId,
            observed_recovery_run_id: input.terminalRetry.recoveryRunId,
            observed_workflow_status: input.terminalRetry.workflowStatus,
          },
        );
      }
    }
    if (existing && activeRecoveryStartingLease(existing, now)) {
      db.exec('COMMIT');
      return {
        claimed: false,
        claim_status: 'active_starting' as const,
        claim_token: null,
        recovery_run: existing,
        launch: rowPayload(row),
      };
    }
    const claimedAt = nowIso(now);
    const priorTemporalEvidence = existing?.temporal_start_receipt
      ?? input.terminalRetry?.observationReceipt
      ?? null;
    const next: StageRunRecoveryRun = existing && identityMatches
      ? {
          ...existing,
          start_status: 'starting',
          start_claim_token: claimToken,
          start_claimed_at: claimedAt,
          start_lease_expires_at: nowIso(new Date(now.getTime() + leaseMs)),
          start_attempt_count: existing.start_attempt_count + 1,
          temporal_start_receipt: input.terminalRetry
            ? null
            : existing.temporal_start_receipt,
          temporal_start_receipt_history: input.terminalRetry && priorTemporalEvidence
            ? [...(existing.temporal_start_receipt_history ?? []), priorTemporalEvidence]
            : existing.temporal_start_receipt_history,
          last_start_error: null,
          updated_at: claimedAt,
        }
      : existing
        ? {
            surface_kind: 'opl_stage_run_recovery_run',
            version: 'opl-stage-run-recovery-run.v1',
            recovery_id: recovery.recovery_id,
            recovery_resume_sha256: recoveryResumeSha256,
            quality_cycle_id: recovery.quality_cycle_id,
            producer_attempt_ref: recoveryArtifactProducerAttemptRef(recovery),
            recovery_resume: recovery,
            start_status: 'starting',
            start_claim_token: claimToken,
            start_claimed_at: claimedAt,
            start_lease_expires_at: nowIso(new Date(now.getTime() + leaseMs)),
            start_attempt_count: existing.start_attempt_count + 1,
            temporal_start_receipt: null,
            temporal_start_receipt_history: priorTemporalEvidence
              ? [...(existing.temporal_start_receipt_history ?? []), priorTemporalEvidence]
              : existing.temporal_start_receipt_history,
            last_start_error: null,
            created_at: existing.created_at,
            updated_at: claimedAt,
          }
      : {
          surface_kind: 'opl_stage_run_recovery_run',
          version: 'opl-stage-run-recovery-run.v1',
          recovery_id: recovery.recovery_id,
          recovery_resume_sha256: recoveryResumeSha256,
          quality_cycle_id: recovery.quality_cycle_id,
          producer_attempt_ref: recoveryArtifactProducerAttemptRef(recovery),
          recovery_resume: recovery,
          start_status: 'starting',
          start_claim_token: claimToken,
          start_claimed_at: claimedAt,
          start_lease_expires_at: nowIso(new Date(now.getTime() + leaseMs)),
          start_attempt_count: 1,
          temporal_start_receipt: null,
          last_start_error: null,
          created_at: claimedAt,
          updated_at: claimedAt,
        };
    const launch = writeRecoveryRuns(db, row, receipt, [next], now);
    db.exec('COMMIT');
    return {
      claimed: true,
      claim_status: existing?.start_status === 'starting'
        ? 'stale_lease_takeover' as const
        : existing
          ? 'retry_claimed' as const
          : 'claimed' as const,
      claim_token: claimToken,
      recovery_run: next,
      launch,
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function recordStageRunTemporalRecoveryStart(
  db: DatabaseSync,
  input: {
    stageRunId: string;
    recoveryId: string;
    temporalStartReceipt: Record<string, unknown>;
    claimToken: string;
    now?: Date;
  },
) {
  createStageRunLaunchTable(db);
  const now = input.now ?? new Date();
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = launchRow(db, input.stageRunId);
    if (!row) {
      throw new FrameworkContractError('contract_shape_invalid', 'StageRun recovery start is not registered.', {
        stage_run_id: input.stageRunId,
      });
    }
    requireRuntimeExecutionScopeMutationAllowed(db, row, 'record_stage_run_temporal_recovery_start');
    const receipt = parseObject(row.temporal_start_receipt_json);
    const runs = receipt ? recoveryRuns(receipt) : [];
    const existing = runs[0];
    const temporal = input.temporalStartReceipt;
    const recoveryRunId = typeof temporal.recovery_run_id === 'string'
      ? temporal.recovery_run_id.trim()
      : '';
    if (
      !receipt
      || !existing
      || existing.recovery_id !== input.recoveryId
      || temporal.recovery_id !== input.recoveryId
      || temporal.stage_run_id !== row.stage_run_id
      || temporal.workflow_id !== row.workflow_id
      || temporal.quality_cycle_id !== existing.quality_cycle_id
      || temporal.producer_attempt_ref !== existing.producer_attempt_ref
      || !recoveryRunId
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Temporal StageRun recovery receipt does not match its durable recovery identity.',
        {
          failure_code: 'stage_run_recovery_temporal_start_receipt_identity_mismatch',
          stage_run_id: row.stage_run_id,
          recovery_id: input.recoveryId,
          recovery_run_id: recoveryRunId || null,
        },
      );
    }
    const existingRunId = typeof existing.temporal_start_receipt?.recovery_run_id === 'string'
      ? existing.temporal_start_receipt.recovery_run_id
      : null;
    if (existing.start_status === 'started') {
      if (existingRunId !== recoveryRunId) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'One StageRun recovery cannot bind two Temporal Runs.',
          {
            failure_code: 'stage_run_recovery_temporal_execution_identity_conflict',
            stage_run_id: row.stage_run_id,
            recovery_id: input.recoveryId,
            existing_recovery_run_id: existingRunId,
            received_recovery_run_id: recoveryRunId,
          },
        );
      }
      db.exec('COMMIT');
      return { launch: rowPayload(row), recovery_run: existing };
    }
    if (existing.start_status !== 'starting' || existing.start_claim_token !== input.claimToken) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Temporal StageRun recovery start lost its compare-and-set claim.',
        {
          failure_code: 'stage_run_recovery_start_claim_conflict',
          stage_run_id: row.stage_run_id,
          recovery_id: input.recoveryId,
        },
      );
    }
    const updated: StageRunRecoveryRun = {
      ...existing,
      start_status: 'started',
      start_claim_token: null,
      start_claimed_at: null,
      start_lease_expires_at: null,
      temporal_start_receipt: temporal,
      last_start_error: null,
      updated_at: nowIso(now),
    };
    const launch = writeRecoveryRuns(db, row, receipt, [updated], now);
    db.exec('COMMIT');
    return { launch, recovery_run: updated };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function recordStageRunRecoveryStartFailure(
  db: DatabaseSync,
  input: {
    stageRunId: string;
    recoveryId: string;
    claimToken: string;
    error: unknown;
    now?: Date;
  },
) {
  createStageRunLaunchTable(db);
  const now = input.now ?? new Date();
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = launchRow(db, input.stageRunId);
    if (!row) throw new FrameworkContractError('contract_shape_invalid', 'StageRun recovery start is not registered.');
    requireRuntimeExecutionScopeMutationAllowed(db, row, 'record_stage_run_recovery_start_failure');
    const receipt = parseObject(row.temporal_start_receipt_json);
    const runs = receipt ? recoveryRuns(receipt) : [];
    const existing = runs[0];
    if (
      !receipt
      || !existing
      || existing.recovery_id !== input.recoveryId
      || existing.start_status !== 'starting'
      || existing.start_claim_token !== input.claimToken
    ) {
      db.exec('COMMIT');
      return rowPayload(row);
    }
    const updated: StageRunRecoveryRun = {
      ...existing,
      start_status: 'start_failed',
      start_claim_token: null,
      start_claimed_at: null,
      start_lease_expires_at: null,
      last_start_error: input.error instanceof Error ? input.error.message : String(input.error),
      updated_at: nowIso(now),
    };
    const launch = writeRecoveryRuns(db, row, receipt, [updated], now);
    db.exec('COMMIT');
    return launch;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function recordStageRunStartFailure(
  db: DatabaseSync,
  input: { stageRunId: string; claimToken: string; error: unknown; now?: Date },
) {
  createStageRunLaunchTable(db);
  const row = launchRow(db, input.stageRunId);
  if (!row) return inspectStageRunLaunch(db, input.stageRunId);
  requireRuntimeExecutionScopeMutationAllowed(db, row, 'record_stage_run_start_failure');
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  db.prepare(`
    UPDATE stage_run_launches
    SET launch_status = 'start_failed',
        last_start_error = ?,
        start_claim_token = NULL,
        start_claimed_at = NULL,
        start_lease_expires_at = NULL,
        updated_at = ?
    WHERE stage_run_id = ?
      AND launch_status = 'starting'
      AND start_claim_token = ?
  `).run(message, nowIso(input.now), input.stageRunId, input.claimToken);
  return inspectStageRunLaunch(db, input.stageRunId);
}

export function recordStageRunClosed(
  db: DatabaseSync,
  input: { stageRunId: string; terminalStatus: string; now?: Date },
) {
  const terminalStatus = input.terminalStatus.trim().toLowerCase();
  if (!terminalStatus) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Closed StageRun launch requires a terminal Temporal status.',
      { stage_run_id: input.stageRunId },
    );
  }
  createStageRunLaunchTable(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = launchRow(db, input.stageRunId);
    if (!row) {
      db.exec('COMMIT');
      return null;
    }
    requireRuntimeExecutionScopeMutationAllowed(db, row, 'record_stage_run_closed');
    if (row.launch_status === 'closed') {
      if (row.terminal_status && row.terminal_status !== terminalStatus) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Closed StageRun launch cannot change its terminal status.',
          {
            failure_code: 'stage_run_terminal_status_conflict',
            stage_run_id: input.stageRunId,
            existing_terminal_status: row.terminal_status,
            received_terminal_status: terminalStatus,
          },
        );
      }
      db.exec('COMMIT');
      return rowPayload(row);
    }
    if (row.launch_status !== 'started') {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun can close only after its Temporal execution identity is recorded.',
        {
          failure_code: 'stage_run_close_before_start_receipt',
          stage_run_id: input.stageRunId,
          launch_status: row.launch_status,
        },
      );
    }
    const result = db.prepare(`
      UPDATE stage_run_launches
      SET launch_status = 'closed',
          terminal_status = ?,
          last_start_error = NULL,
          start_claim_token = NULL,
          start_claimed_at = NULL,
          start_lease_expires_at = NULL,
          updated_at = ?
      WHERE stage_run_id = ? AND launch_status = 'started'
    `).run(terminalStatus, nowIso(input.now), input.stageRunId);
    if (result.changes !== 1) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun terminal close lost its compare-and-set transition.',
        {
          failure_code: 'stage_run_terminal_close_conflict',
          stage_run_id: input.stageRunId,
        },
      );
    }
    const closed = launchRow(db, input.stageRunId)!;
    db.exec('COMMIT');
    return rowPayload(closed);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
