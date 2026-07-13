import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

import {
  type FamilyRuntimeDomainId,
  type FamilyRuntimeProviderKind,
  type TemporalStageAttemptSignalKind,
} from './family-runtime-types.ts';
import {
  buildModelRouteCostProjection,
  buildStageAttemptUsageProjection,
} from './family-runtime-stage-attempt-usage.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { record } from '../../kernel/json-record.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  evaluateStageQualityFindingClosure,
  normalizeStageQualityAttemptRole,
  stageQualityAttemptOutcomeFromEnvelope,
  stageQualityOutcomeFromEnvelope,
  stageReviewVerdictForOutcome,
  validateIndependentStageReviewReceipt,
  validateInitialStageQualityReviewOutcome,
  validateStageQualityFindings,
  validateStageQualityRepairMap,
  validateStageQualityReReviewOutcome,
  validateStageQualityReviewHardStopOutcome,
  type StageQualityFinding,
  type StageQualityRepairMapEntry,
  type StageQualityReReviewResult,
  type StageReviewReceipt,
} from '../stagecraft/index.ts';
import { validateStageQualityAttemptContextManifest } from './family-runtime-stage-quality-context-manifest.ts';

export type StageAttemptStatus =
  | 'queued'
  | 'running'
  | 'checkpointed'
  | 'blocked'
  | 'human_gate'
  | 'completed'
  | 'failed'
  | 'dead_lettered';

export type StageAttemptRow = {
  stage_attempt_id: string;
  idempotency_key: string;
  provider_kind: FamilyRuntimeProviderKind;
  workflow_id: string;
  domain_id: FamilyRuntimeDomainId;
  stage_id: string;
  workspace_locator_json: string;
  source_fingerprint: string | null;
  executor_kind: string;
  stage_attempt_executor_policy_json?: string | null;
  stage_run_id?: string | null;
  quality_cycle_id?: string | null;
  attempt_role?: string | null;
  quality_round_index?: number | null;
  parent_attempt_ref?: string | null;
  input_artifact_refs_json?: string | null;
  reviewed_artifact_hashes_json?: string | null;
  quality_source_refs_json?: string | null;
  quality_stage_goal_refs_json?: string | null;
  quality_lineage_refs_json?: string | null;
  quality_rubric_refs_json?: string | null;
  prior_finding_refs_json?: string | null;
  repair_map_refs_json?: string | null;
  quality_context_json?: string | null;
  quality_role_prompt_ref?: string | null;
  execution_session_ref?: string | null;
  usage_observation_json?: string | null;
  context_manifest_ref?: string | null;
  context_manifest_json?: string | null;
  no_context_inheritance?: number | null;
  status: StageAttemptStatus;
  checkpoint_refs_json: string;
  closeout_refs_json: string;
  human_gate_refs_json: string;
  retry_budget_json: string;
  attempt_count: number;
  task_id: string | null;
  blocked_reason: string | null;
  provider_receipt_json: string;
  provider_run_json: string;
  activity_events_json: string;
  route_impact_json: string;
  closeout_receipt_status: string | null;
  archived_at: string | null;
  archived_reason: string | null;
  archived_source: string | null;
  created_at: string;
  updated_at: string;
};

export type StageAttemptSignalRow = {
  signal_id: string;
  stage_attempt_id: string;
  signal_kind: TemporalStageAttemptSignalKind;
  payload_json: string;
  source: string;
  created_at: string;
};

export type StageAttemptCloseoutRow = {
  closeout_id: string;
  stage_attempt_id: string;
  packet_json: string;
  created_at: string;
};

function parseJsonObject(value: string) {
  return record(parseJsonText(value));
}

function parseJsonList(value: string) {
  const parsed = parseJsonText(value);
  return Array.isArray(parsed) ? parsed : [];
}

function readColumnNames(db: DatabaseSync, tableName: string) {
  return new Set(
    (db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>).map((row) => row.name),
  );
}

function addColumnIfMissing(db: DatabaseSync, tableName: string, columns: Set<string>, name: string, ddl: string) {
  if (!columns.has(name)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${ddl}`);
    columns.add(name);
  }
}

export function createStageAttemptTable(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stage_attempts (
      stage_attempt_id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL,
      provider_kind TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      domain_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      workspace_locator_json TEXT NOT NULL,
      source_fingerprint TEXT,
      executor_kind TEXT NOT NULL,
      stage_attempt_executor_policy_json TEXT,
      stage_run_id TEXT,
      quality_cycle_id TEXT,
      attempt_role TEXT,
      quality_round_index INTEGER,
      parent_attempt_ref TEXT,
      input_artifact_refs_json TEXT NOT NULL DEFAULT '[]',
      reviewed_artifact_hashes_json TEXT NOT NULL DEFAULT '[]',
      quality_source_refs_json TEXT NOT NULL DEFAULT '[]',
      quality_stage_goal_refs_json TEXT NOT NULL DEFAULT '[]',
      quality_lineage_refs_json TEXT NOT NULL DEFAULT '[]',
      quality_rubric_refs_json TEXT NOT NULL DEFAULT '[]',
      prior_finding_refs_json TEXT NOT NULL DEFAULT '[]',
      repair_map_refs_json TEXT NOT NULL DEFAULT '[]',
      quality_context_json TEXT NOT NULL DEFAULT '{}',
      quality_role_prompt_ref TEXT,
      execution_session_ref TEXT,
      usage_observation_json TEXT,
      context_manifest_ref TEXT,
      context_manifest_json TEXT,
      no_context_inheritance INTEGER,
      status TEXT NOT NULL,
      checkpoint_refs_json TEXT NOT NULL,
      closeout_refs_json TEXT NOT NULL,
      human_gate_refs_json TEXT NOT NULL,
      retry_budget_json TEXT NOT NULL,
      attempt_count INTEGER NOT NULL,
      task_id TEXT,
      blocked_reason TEXT,
      provider_receipt_json TEXT NOT NULL,
      provider_run_json TEXT NOT NULL,
      activity_events_json TEXT NOT NULL,
      route_impact_json TEXT NOT NULL,
      closeout_receipt_status TEXT,
      archived_at TEXT,
      archived_reason TEXT,
      archived_source TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stage_attempts_idempotency ON stage_attempts(idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_stage_attempts_domain_stage ON stage_attempts(domain_id, stage_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_stage_attempts_task_id ON stage_attempts(task_id);
    CREATE INDEX IF NOT EXISTS idx_stage_attempts_status ON stage_attempts(status, updated_at);
    CREATE TABLE IF NOT EXISTS stage_attempt_signals (
      signal_id TEXT PRIMARY KEY,
      stage_attempt_id TEXT NOT NULL,
      signal_kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stage_attempt_signals_attempt ON stage_attempt_signals(stage_attempt_id, created_at);
    CREATE TABLE IF NOT EXISTS stage_attempt_closeouts (
      closeout_id TEXT PRIMARY KEY,
      stage_attempt_id TEXT NOT NULL,
      packet_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stage_attempt_closeouts_attempt ON stage_attempt_closeouts(stage_attempt_id, created_at);
    CREATE TABLE IF NOT EXISTS stage_quality_cycles (
      quality_cycle_id TEXT PRIMARY KEY,
      stage_run_id TEXT NOT NULL,
      domain_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      policy_json TEXT NOT NULL,
      state_json TEXT NOT NULL,
      current_attempt_ref TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stage_quality_cycles_stage_run
      ON stage_quality_cycles(stage_run_id, stage_id, updated_at);
  `);
  const columns = readColumnNames(db, 'stage_attempts');
  addColumnIfMissing(db, 'stage_attempts', columns, 'idempotency_key', "idempotency_key TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'stage_attempts', columns, 'provider_run_json', "provider_run_json TEXT NOT NULL DEFAULT '{}'");
  addColumnIfMissing(db, 'stage_attempts', columns, 'activity_events_json', "activity_events_json TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'stage_attempts', columns, 'route_impact_json', "route_impact_json TEXT NOT NULL DEFAULT '{}'");
  addColumnIfMissing(db, 'stage_attempts', columns, 'closeout_receipt_status', 'closeout_receipt_status TEXT');
  addColumnIfMissing(db, 'stage_attempts', columns, 'stage_attempt_executor_policy_json', 'stage_attempt_executor_policy_json TEXT');
  addColumnIfMissing(db, 'stage_attempts', columns, 'stage_run_id', 'stage_run_id TEXT');
  addColumnIfMissing(db, 'stage_attempts', columns, 'quality_cycle_id', 'quality_cycle_id TEXT');
  addColumnIfMissing(db, 'stage_attempts', columns, 'attempt_role', 'attempt_role TEXT');
  addColumnIfMissing(db, 'stage_attempts', columns, 'quality_round_index', 'quality_round_index INTEGER');
  addColumnIfMissing(db, 'stage_attempts', columns, 'parent_attempt_ref', 'parent_attempt_ref TEXT');
  addColumnIfMissing(db, 'stage_attempts', columns, 'input_artifact_refs_json', "input_artifact_refs_json TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'stage_attempts', columns, 'reviewed_artifact_hashes_json', "reviewed_artifact_hashes_json TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'stage_attempts', columns, 'quality_source_refs_json', "quality_source_refs_json TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'stage_attempts', columns, 'quality_stage_goal_refs_json', "quality_stage_goal_refs_json TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'stage_attempts', columns, 'quality_lineage_refs_json', "quality_lineage_refs_json TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'stage_attempts', columns, 'quality_rubric_refs_json', "quality_rubric_refs_json TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'stage_attempts', columns, 'prior_finding_refs_json', "prior_finding_refs_json TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'stage_attempts', columns, 'repair_map_refs_json', "repair_map_refs_json TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'stage_attempts', columns, 'quality_context_json', "quality_context_json TEXT NOT NULL DEFAULT '{}'");
  addColumnIfMissing(db, 'stage_attempts', columns, 'quality_role_prompt_ref', 'quality_role_prompt_ref TEXT');
  addColumnIfMissing(db, 'stage_attempts', columns, 'execution_session_ref', 'execution_session_ref TEXT');
  addColumnIfMissing(db, 'stage_attempts', columns, 'usage_observation_json', 'usage_observation_json TEXT');
  addColumnIfMissing(db, 'stage_attempts', columns, 'context_manifest_ref', 'context_manifest_ref TEXT');
  addColumnIfMissing(db, 'stage_attempts', columns, 'context_manifest_json', 'context_manifest_json TEXT');
  addColumnIfMissing(db, 'stage_attempts', columns, 'no_context_inheritance', 'no_context_inheritance INTEGER');
  addColumnIfMissing(db, 'stage_attempts', columns, 'archived_at', 'archived_at TEXT');
  addColumnIfMissing(db, 'stage_attempts', columns, 'archived_reason', 'archived_reason TEXT');
  addColumnIfMissing(db, 'stage_attempts', columns, 'archived_source', 'archived_source TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_stage_attempts_idempotency ON stage_attempts(idempotency_key)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_stage_attempts_archived ON stage_attempts(archived_at, updated_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_stage_attempts_quality_cycle ON stage_attempts(stage_run_id, quality_cycle_id, quality_round_index, attempt_role)');
}

export function stageAttemptToPayload(row: StageAttemptRow) {
  const retryBudget = parseJsonObject(row.retry_budget_json);
  const providerRun = parseJsonObject(row.provider_run_json);
  const activityEvents = parseJsonList(row.activity_events_json);
  const routeImpact = parseJsonObject(row.route_impact_json);
  const stageAttemptExecutorPolicy = row.stage_attempt_executor_policy_json
    ? parseJsonObject(row.stage_attempt_executor_policy_json)
    : {};
  const hasStageAttemptExecutorPolicy = Object.keys(stageAttemptExecutorPolicy).length > 0;
  const usageObservation = row.usage_observation_json
    ? parseJsonObject(row.usage_observation_json)
    : null;
  const usageProjection = buildStageAttemptUsageProjection({
    stageAttemptId: row.stage_attempt_id,
    status: row.status,
    blockedReason: row.blocked_reason,
    executorKind: row.executor_kind,
    retryBudget,
    attemptCount: row.attempt_count,
    providerRun,
    activityEvents,
    routeImpact,
    usageObservation,
  });
  const modelRouteCostProjection = buildModelRouteCostProjection({
    stageAttemptId: row.stage_attempt_id,
    status: row.status,
    blockedReason: row.blocked_reason,
    executorKind: row.executor_kind,
    retryBudget,
    attemptCount: row.attempt_count,
    providerRun,
    activityEvents,
    routeImpact,
    usageProjection,
  });
  return {
    stage_attempt_id: row.stage_attempt_id,
    idempotency_key: row.idempotency_key,
    provider_kind: row.provider_kind,
    workflow_id: row.workflow_id,
    domain_id: row.domain_id,
    stage_id: row.stage_id,
    workspace_locator: parseJsonObject(row.workspace_locator_json),
    source_fingerprint: row.source_fingerprint,
    executor_kind: row.executor_kind,
    stage_attempt_executor_policy: hasStageAttemptExecutorPolicy ? stageAttemptExecutorPolicy : null,
    stage_run_id: row.stage_run_id ?? null,
    quality_cycle_id: row.quality_cycle_id ?? null,
    attempt_role: row.attempt_role ?? null,
    quality_round_index: row.quality_round_index ?? null,
    parent_attempt_ref: row.parent_attempt_ref ?? null,
    input_artifact_refs: row.input_artifact_refs_json ? parseJsonList(row.input_artifact_refs_json) : [],
    reviewed_artifact_hashes: row.reviewed_artifact_hashes_json ? parseJsonList(row.reviewed_artifact_hashes_json) : [],
    quality_source_refs: row.quality_source_refs_json ? parseJsonList(row.quality_source_refs_json) : [],
    quality_stage_goal_refs: row.quality_stage_goal_refs_json ? parseJsonList(row.quality_stage_goal_refs_json) : [],
    quality_lineage_refs: row.quality_lineage_refs_json ? parseJsonList(row.quality_lineage_refs_json) : [],
    quality_rubric_refs: row.quality_rubric_refs_json ? parseJsonList(row.quality_rubric_refs_json) : [],
    prior_finding_refs: row.prior_finding_refs_json ? parseJsonList(row.prior_finding_refs_json) : [],
    repair_map_refs: row.repair_map_refs_json ? parseJsonList(row.repair_map_refs_json) : [],
    quality_context: row.quality_context_json ? parseJsonObject(row.quality_context_json) : {},
    quality_role_prompt_ref: row.quality_role_prompt_ref ?? null,
    execution_session_ref: row.execution_session_ref ?? null,
    usage_observation: usageObservation,
    context_manifest_ref: row.context_manifest_ref ?? null,
    context_manifest: row.context_manifest_json ? parseJsonObject(row.context_manifest_json) : null,
    no_context_inheritance: row.no_context_inheritance === null || row.no_context_inheritance === undefined
      ? null
      : row.no_context_inheritance === 1,
    status: row.status,
    checkpoint_refs: parseJsonList(row.checkpoint_refs_json),
    closeout_refs: parseJsonList(row.closeout_refs_json),
    human_gate_refs: parseJsonList(row.human_gate_refs_json),
    retry_budget: retryBudget,
    attempt_count: row.attempt_count,
    task_id: row.task_id,
    blocked_reason: row.blocked_reason,
    provider_receipt: parseJsonObject(row.provider_receipt_json),
    provider_run: providerRun,
    activity_events: activityEvents,
    route_impact: routeImpact,
    usage_projection: usageProjection,
    model_route_cost_projection: modelRouteCostProjection,
    closeout_receipt_status: row.closeout_receipt_status,
    archived: row.archived_at !== null,
    archived_at: row.archived_at,
    archived_reason: row.archived_reason,
    archived_source: row.archived_source,
    authority_boundary: {
      opl: 'attempt_control_metadata_and_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      executor: 'codex_cli_or_domain_selected_executor',
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function bindStageAttemptExecutionSession(db: DatabaseSync, input: {
  stageAttemptId: string;
  executionSessionRef: string;
}) {
  const row = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
    input.stageAttemptId,
  ) as StageAttemptRow | undefined;
  if (!row) {
    throw new FrameworkContractError('cli_usage_error', 'Stage attempt not found.', {
      stage_attempt_id: input.stageAttemptId,
    });
  }
  const executionSessionRef = input.executionSessionRef.trim();
  if (!executionSessionRef) {
    throw new FrameworkContractError('contract_shape_invalid', 'executionSessionRef must be non-empty.');
  }
  if (row.execution_session_ref && row.execution_session_ref !== executionSessionRef) {
    throw new FrameworkContractError('contract_shape_invalid', 'Stage attempt execution session is immutable.', {
      stage_attempt_id: row.stage_attempt_id,
      existing_execution_session_ref: row.execution_session_ref,
      received_execution_session_ref: executionSessionRef,
    });
  }
  db.prepare(`
    UPDATE stage_attempts SET execution_session_ref = ?, updated_at = ? WHERE stage_attempt_id = ?
  `).run(executionSessionRef, new Date().toISOString(), row.stage_attempt_id);
  const updated = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
    row.stage_attempt_id,
  ) as StageAttemptRow;
  return stageAttemptToPayload(updated);
}

type PersistedStageReviewReceiptInput = {
  producerAttemptId: string;
  reviewerAttemptId: string;
  rubricRefs: string[];
  verdict: 'pass' | 'repair_required' | 'quality_debt' | 'hard_stop';
};

function persistedStringList(value: string | null | undefined, field: string) {
  const parsed = value ? parseJsonList(value) : [];
  if (parsed.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must contain only non-empty strings.`, {
      field,
    });
  }
  return parsed.map((entry) => String(entry).trim());
}

function exactStringList(left: string[], right: string[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function exactCanonicalValue(left: unknown, right: unknown) {
  return canonicalJsonText(left) === canonicalJsonText(right);
}

function canonicalSha256(value: unknown) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJsonText(value)).digest('hex')}`;
}

function persistedQualityEnvelope(row: StageAttemptRow) {
  return record(parseJsonObject(row.route_impact_json).stage_quality_cycle);
}

function persistedEnvelopeRecordList(
  envelope: Record<string, unknown>,
  field: string,
) {
  const value = envelope[field];
  if (
    !Array.isArray(value)
    || value.some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry))
  ) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be an array of objects.`, { field });
  }
  return value as Array<Record<string, unknown>>;
}

function requireSameReviewIdentity(producer: StageAttemptRow, reviewer: StageAttemptRow) {
  const identityFields = ['domain_id', 'stage_id', 'stage_run_id', 'quality_cycle_id'] as const;
  const mismatches = identityFields.filter((field) =>
    !producer[field]
    || !reviewer[field]
    || producer[field] !== reviewer[field]
  );
  if (mismatches.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt Attempts must share exact domain, Stage, StageRun, and quality-cycle identity.',
      { mismatched_fields: mismatches },
    );
  }
}

function requirePersistedQualityContextManifest(row: StageAttemptRow) {
  const attemptRole = normalizeStageQualityAttemptRole(row.attempt_role);
  if (!row.stage_run_id || !row.quality_cycle_id || !row.context_manifest_ref || !row.context_manifest_json) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt requires the exact persisted context manifest for both Attempts.',
      { stage_attempt_id: row.stage_attempt_id },
    );
  }
  return validateStageQualityAttemptContextManifest({
    attemptRole,
    stageRunId: row.stage_run_id,
    qualityCycleId: row.quality_cycle_id,
    artifactRefs: persistedStringList(row.input_artifact_refs_json, 'attempt.input_artifact_refs'),
    artifactHashes: persistedStringList(row.reviewed_artifact_hashes_json, 'attempt.reviewed_artifact_hashes'),
    stageGoalRefs: persistedStringList(row.quality_stage_goal_refs_json, 'attempt.quality_stage_goal_refs'),
    sourceRefs: persistedStringList(row.quality_source_refs_json, 'attempt.quality_source_refs'),
    lineageRefs: persistedStringList(row.quality_lineage_refs_json, 'attempt.quality_lineage_refs'),
    priorFindingRefs: persistedStringList(row.prior_finding_refs_json, 'attempt.prior_finding_refs'),
    repairMapRefs: persistedStringList(row.repair_map_refs_json, 'attempt.repair_map_refs'),
    rubricRefs: persistedStringList(row.quality_rubric_refs_json, 'attempt.quality_rubric_refs'),
    contextManifestRef: row.context_manifest_ref,
    contextManifest: parseJsonObject(row.context_manifest_json),
  });
}

function requireReviewRolePair(producer: StageAttemptRow, reviewer: StageAttemptRow) {
  const producerRole = normalizeStageQualityAttemptRole(producer.attempt_role);
  const reviewerRole = normalizeStageQualityAttemptRole(reviewer.attempt_role);
  const producerRound = producer.quality_round_index;
  const reviewerRound = reviewer.quality_round_index;
  const initialPair = producerRole === 'producer'
    && reviewerRole === 'reviewer'
    && producerRound === 0
    && reviewerRound === 0;
  const reReviewPair = producerRole === 'repairer'
    && reviewerRole === 're_reviewer'
    && typeof producerRound === 'number'
    && producerRound >= 1
    && producerRound === reviewerRound;
  if (!initialPair && !reReviewPair) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt role pair must be producer(round 0) -> reviewer(round 0) or repairer(round n) -> re_reviewer(round n).',
      {
        producer_role: producerRole,
        producer_round: producerRound,
        reviewer_role: reviewerRole,
        reviewer_round: reviewerRound,
      },
    );
  }
  const expectedParentRef = `opl://stage_attempts/${producer.stage_attempt_id}`;
  if (reviewer.parent_attempt_ref !== expectedParentRef) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt reviewer must reference the exact producer or repairer Attempt as parent.',
      {
        expected_parent_attempt_ref: expectedParentRef,
        reviewer_parent_attempt_ref: reviewer.parent_attempt_ref,
      },
    );
  }
  return { reviewerRole: reviewerRole as 'reviewer' | 're_reviewer' };
}

function persistedQualityContext(row: StageAttemptRow) {
  return row.quality_context_json ? parseJsonObject(row.quality_context_json) : {};
}

function persistedReviewerOutcome(
  producer: StageAttemptRow,
  row: StageAttemptRow,
  reviewerRole: 'reviewer' | 're_reviewer',
) {
  const envelope = persistedQualityEnvelope(row);
  const outcome = stageQualityOutcomeFromEnvelope({ attemptRole: reviewerRole, envelope });
  if (outcome === 'blocked' || outcome === 'human_gate') {
    validateStageQualityReviewHardStopOutcome({ outcome, envelope });
    if (reviewerRole === 'reviewer') {
      return {
        outcome,
        findings: [] as StageQualityFinding[],
        repairMap: [],
        reReview: null,
      };
    }
  }
  if (reviewerRole === 'reviewer') {
    const findings = validateInitialStageQualityReviewOutcome({
      outcome,
      findings: persistedEnvelopeRecordList(envelope, 'findings') as StageQualityFinding[],
    });
    return { outcome, findings, repairMap: [], reReview: null };
  }

  const qualityContext = persistedQualityContext(row);
  const findings = validateStageQualityFindings(
    persistedEnvelopeRecordList(qualityContext, 'findings') as StageQualityFinding[],
  );
  const repairMap = validateStageQualityRepairMap({
    findings,
    repairMap: persistedEnvelopeRecordList(qualityContext, 'repair_map') as StageQualityRepairMapEntry[],
  });
  const priorFindingIds = persistedStringList(row.prior_finding_refs_json, 're_reviewer.prior_finding_refs');
  const repairMapFindingIds = persistedStringList(row.repair_map_refs_json, 're_reviewer.repair_map_refs')
    .map((ref) => {
      const prefix = 'repair-map:';
      if (!ref.startsWith(prefix) || !ref.slice(prefix.length)) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Re-review repair_map_refs must identify a stable finding id.',
          { repair_map_ref: ref },
        );
      }
      return ref.slice(prefix.length);
    });
  if (repairMapFindingIds.length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Re-review receipt requires persisted repair_map_refs for prior required findings.',
    );
  }
  const findingIds = findings.map((finding) => finding.finding_id);
  const repairMapIds = repairMap.map((entry) => entry.finding_id);
  if (!exactStringList(priorFindingIds, findingIds)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Re-review prior_finding_refs must exactly identify the persisted finding bodies.',
      { prior_finding_refs: priorFindingIds, persisted_finding_ids: findingIds },
    );
  }
  if (!exactStringList(repairMapFindingIds, repairMapIds)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Re-review repair_map_refs must exactly identify the persisted repair-map bodies.',
      { repair_map_refs: repairMapFindingIds, persisted_repair_map_ids: repairMapIds },
    );
  }
  const producerContext = persistedQualityContext(producer);
  const producerFindings = persistedEnvelopeRecordList(producerContext, 'findings');
  const producerRepairMap = persistedEnvelopeRecordList(persistedQualityEnvelope(producer), 'repair_map');
  if (!exactCanonicalValue(producerFindings, findings)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Repairer and Re-reviewer must share the exact persisted finding bodies.',
    );
  }
  if (!exactCanonicalValue(producerRepairMap, repairMap)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Re-review repair_map must exactly match the persisted repairer output.',
    );
  }
  if (outcome === 'blocked' || outcome === 'human_gate') {
    return { outcome, findings, repairMap, reReview: null };
  }
  const reReview: StageQualityReReviewResult = {
    finding_closures: persistedEnvelopeRecordList(
      envelope,
      'finding_closures',
    ) as StageQualityReReviewResult['finding_closures'],
    repair_regressions: persistedEnvelopeRecordList(
      envelope,
      'repair_regressions',
    ) as StageQualityReReviewResult['repair_regressions'],
    critical_new_findings: persistedEnvelopeRecordList(
      envelope,
      'critical_new_findings',
    ) as StageQualityReReviewResult['critical_new_findings'],
    optional_observations: persistedEnvelopeRecordList(
      envelope,
      'optional_observations',
    ) as StageQualityReReviewResult['optional_observations'],
  };
  const closure = evaluateStageQualityFindingClosure({ findings, repairMap, reReview });
  validateStageQualityReReviewOutcome({ outcome, closure });
  return { outcome, findings, repairMap, reReview };
}

function persistedStageReviewReceiptInputs(db: DatabaseSync, input: PersistedStageReviewReceiptInput) {
  const producer = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
    input.producerAttemptId,
  ) as StageAttemptRow | undefined;
  const reviewer = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
    input.reviewerAttemptId,
  ) as StageAttemptRow | undefined;
  if (!producer || !reviewer) {
    throw new FrameworkContractError('contract_shape_invalid', 'Review receipt requires both persisted Attempts.');
  }
  requireSameReviewIdentity(producer, reviewer);
  const { reviewerRole } = requireReviewRolePair(producer, reviewer);
  requirePersistedQualityContextManifest(producer);
  requirePersistedQualityContextManifest(reviewer);
  if (producer.status !== 'completed' || reviewer.status !== 'completed') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt requires both persisted Attempts to be completed.',
      { producer_status: producer.status, reviewer_status: reviewer.status },
    );
  }
  if (!producer.execution_session_ref || !reviewer.execution_session_ref) {
    throw new FrameworkContractError('contract_shape_invalid', 'Review receipt requires observed execution sessions.');
  }
  if (producer.no_context_inheritance !== 1 || reviewer.no_context_inheritance !== 1) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt requires both persisted Attempts to prove no context inheritance.',
      {
        producer_no_context_inheritance: producer.no_context_inheritance,
        reviewer_no_context_inheritance: reviewer.no_context_inheritance,
      },
    );
  }
  if (producer.execution_session_ref === reviewer.execution_session_ref) {
    throw new FrameworkContractError('contract_shape_invalid', 'Formal Stage Review must use a new provider session.', {
      producer_session_ref: producer.execution_session_ref,
      reviewer_session_ref: reviewer.execution_session_ref,
    });
  }
  const producerEnvelope = persistedQualityEnvelope(producer);
  stageQualityAttemptOutcomeFromEnvelope({
    attemptRole: normalizeStageQualityAttemptRole(producer.attempt_role),
    envelope: producerEnvelope,
  });
  const reviewerEvidence = persistedReviewerOutcome(producer, reviewer, reviewerRole);
  const expectedVerdict = stageReviewVerdictForOutcome(reviewerEvidence.outcome);
  if (input.verdict !== expectedVerdict) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Requested review receipt verdict does not match the persisted reviewer outcome.',
      { reviewer_outcome: reviewerEvidence.outcome, expected_verdict: expectedVerdict, requested_verdict: input.verdict },
    );
  }
  const producerArtifactRefs = persistedStringList(
    JSON.stringify(producerEnvelope.artifact_refs ?? []),
    'producer.route_impact.stage_quality_cycle.artifact_refs',
  );
  const producerArtifactHashes = persistedStringList(
    JSON.stringify(producerEnvelope.artifact_hashes ?? []),
    'producer.route_impact.stage_quality_cycle.artifact_hashes',
  );
  const reviewedArtifactRefs = persistedStringList(
    reviewer.input_artifact_refs_json,
    'reviewer.input_artifact_refs',
  );
  const reviewedArtifactHashes = persistedStringList(
    reviewer.reviewed_artifact_hashes_json,
    'reviewer.reviewed_artifact_hashes',
  );
  if (
    producerArtifactRefs.length === 0
    || producerArtifactRefs.length !== producerArtifactHashes.length
    || !exactStringList(producerArtifactRefs, reviewedArtifactRefs)
    || !exactStringList(producerArtifactHashes, reviewedArtifactHashes)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt artifact refs and hashes must exactly match the persisted producer output and reviewer input.',
      {
        producer_artifact_refs: producerArtifactRefs,
        producer_artifact_hashes: producerArtifactHashes,
        reviewer_artifact_refs: reviewedArtifactRefs,
        reviewer_artifact_hashes: reviewedArtifactHashes,
      },
    );
  }
  const producerRubricRefs = persistedStringList(producer.quality_rubric_refs_json, 'producer.quality_rubric_refs');
  const reviewerRubricRefs = persistedStringList(reviewer.quality_rubric_refs_json, 'reviewer.quality_rubric_refs');
  const requestedRubricRefs = input.rubricRefs.map((ref) => ref.trim());
  if (
    producerRubricRefs.length === 0
    || !exactStringList(producerRubricRefs, reviewerRubricRefs)
    || !exactStringList(producerRubricRefs, requestedRubricRefs)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt rubric refs must exactly match producer, reviewer, and controller request.',
      {
        producer_rubric_refs: producerRubricRefs,
        reviewer_rubric_refs: reviewerRubricRefs,
        requested_rubric_refs: requestedRubricRefs,
      },
    );
  }
  return {
    producer,
    reviewer,
    reviewedArtifactRefs,
    reviewedArtifactHashes,
    requestedRubricRefs,
    reviewerRole,
    reviewerEvidence,
  };
}

export function materializePersistedStageReviewReceipt(
  db: DatabaseSync,
  input: PersistedStageReviewReceiptInput,
): StageReviewReceipt {
  const persisted = persistedStageReviewReceiptInputs(db, input);
  const receipt: StageReviewReceipt = {
    surface_kind: 'opl_stage_review_receipt',
    version: 'stage-review-receipt.v1',
    stage_run_id: persisted.reviewer.stage_run_id!,
    quality_cycle_id: persisted.reviewer.quality_cycle_id!,
    producer_attempt_ref: `opl://stage_attempts/${persisted.producer.stage_attempt_id}`,
    reviewer_attempt_ref: `opl://stage_attempts/${persisted.reviewer.stage_attempt_id}`,
    producer_session_ref: persisted.producer.execution_session_ref!,
    reviewer_session_ref: persisted.reviewer.execution_session_ref!,
    no_context_inheritance: true,
    reviewed_artifact_refs: persisted.reviewedArtifactRefs,
    reviewed_artifact_hashes: persisted.reviewedArtifactHashes,
    rubric_refs: persisted.requestedRubricRefs,
    verdict: input.verdict,
    finding_lineage: {
      review_kind: persisted.reviewerRole === 'reviewer' ? 'initial_review' : 'finding_closure_review',
      finding_ids: persisted.reviewerEvidence.findings.map((finding) => finding.finding_id),
      findings_sha256: canonicalSha256(persisted.reviewerEvidence.findings),
      repair_map_sha256: persisted.reviewerRole === 're_reviewer'
        ? canonicalSha256(persisted.reviewerEvidence.repairMap)
        : null,
      re_review_result_sha256: persisted.reviewerEvidence.reReview
        ? canonicalSha256(persisted.reviewerEvidence.reReview)
        : null,
    },
  };
  validateIndependentStageReviewReceipt(receipt);
  return receipt;
}

export function validatePersistedStageReviewIsolation(db: DatabaseSync, input: PersistedStageReviewReceiptInput) {
  return validateIndependentStageReviewReceipt(materializePersistedStageReviewReceipt(db, input));
}

export function stageAttemptSignalToPayload(row: StageAttemptSignalRow) {
  return {
    signal_id: row.signal_id,
    stage_attempt_id: row.stage_attempt_id,
    signal_kind: row.signal_kind,
    payload: parseJsonObject(row.payload_json),
    source: row.source,
    created_at: row.created_at,
  };
}

function stageAttemptCloseoutToPayload(row: StageAttemptCloseoutRow) {
  return {
    closeout_id: row.closeout_id,
    stage_attempt_id: row.stage_attempt_id,
    packet: parseJsonObject(row.packet_json),
    created_at: row.created_at,
  };
}

export function listStageAttempts(db: DatabaseSync, options: {
  workUnitLimitPerLane?: number;
  attemptLimitPerWorkUnit?: number;
  archived?: 'exclude' | 'only' | 'include';
} = {}) {
  const workUnitLimitPerLane = options.workUnitLimitPerLane;
  const attemptLimitPerWorkUnit = options.attemptLimitPerWorkUnit;
  if (
    typeof workUnitLimitPerLane === 'number'
    && Number.isInteger(workUnitLimitPerLane)
    && workUnitLimitPerLane > 0
    && typeof attemptLimitPerWorkUnit === 'number'
    && Number.isInteger(attemptLimitPerWorkUnit)
    && attemptLimitPerWorkUnit > 0
  ) {
    return (db.prepare(`
      WITH normalized AS (
        SELECT
          stage_attempt_id,
          domain_id,
          status,
          created_at,
          updated_at,
          COALESCE(
            NULLIF(json_extract(workspace_locator_json, '$.work_unit_id'), ''),
            NULLIF(json_extract(workspace_locator_json, '$.task_or_work_unit_ref'), ''),
            NULLIF(json_extract(workspace_locator_json, '$.task_ref'), ''),
            task_id,
            stage_attempt_id
          ) AS work_unit_key
        FROM stage_attempts
        WHERE ${options.archived === 'only' ? 'archived_at IS NOT NULL' : options.archived === 'include' ? '1 = 1' : 'archived_at IS NULL'}
      ), ranked AS (
        SELECT
          normalized.*,
          ROW_NUMBER() OVER (
            PARTITION BY domain_id, work_unit_key
            ORDER BY updated_at DESC, created_at DESC, stage_attempt_id DESC
          ) AS attempt_rank
        FROM normalized
      ), latest AS (
        SELECT
          ranked.*,
          CASE
            WHEN status = 'running' THEN 'running'
            WHEN status IN ('blocked', 'dead_lettered', 'failed', 'human_gate') THEN 'attention'
            ELSE 'recent'
          END AS activity_lane
        FROM ranked
        WHERE attempt_rank = 1
      ), selected AS (
        SELECT
          latest.*,
          ROW_NUMBER() OVER (
            PARTITION BY activity_lane
            ORDER BY updated_at DESC, created_at DESC, stage_attempt_id DESC
          ) AS lane_rank
        FROM latest
      )
      SELECT stage_attempts.*
      FROM ranked
      JOIN selected
        ON selected.domain_id = ranked.domain_id
        AND selected.work_unit_key = ranked.work_unit_key
      JOIN stage_attempts
        ON stage_attempts.stage_attempt_id = ranked.stage_attempt_id
      WHERE selected.lane_rank <= ?
        AND ranked.attempt_rank <= ?
      ORDER BY
        CASE selected.activity_lane WHEN 'running' THEN 0 WHEN 'attention' THEN 1 ELSE 2 END,
        selected.updated_at DESC,
        selected.created_at DESC,
        selected.stage_attempt_id DESC,
        ranked.attempt_rank ASC
    `).all(workUnitLimitPerLane, attemptLimitPerWorkUnit) as StageAttemptRow[])
      .map(stageAttemptToPayload);
  }
  return (db.prepare(`
    SELECT * FROM stage_attempts
    WHERE ${options.archived === 'only' ? 'archived_at IS NOT NULL' : options.archived === 'include' ? '1 = 1' : 'archived_at IS NULL'}
    ORDER BY updated_at DESC, created_at DESC
  `).all() as StageAttemptRow[]).map(stageAttemptToPayload);
}

const ARCHIVABLE_STAGE_ATTEMPT_STATUSES = new Set<StageAttemptStatus>([
  'completed',
  'failed',
  'dead_lettered',
]);

export function setStageAttemptArchived(
  db: DatabaseSync,
  input: { stageAttemptId: string; archived: boolean; reason: string; source: string },
) {
  const row = getStageAttemptRow(db, input.stageAttemptId);
  if (!row) {
    throw new FrameworkContractError('cli_usage_error', 'Stage attempt not found.', {
      stage_attempt_id: input.stageAttemptId,
    });
  }
  if (input.archived && !ARCHIVABLE_STAGE_ATTEMPT_STATUSES.has(row.status)) {
    throw new FrameworkContractError('cli_usage_error', 'Only terminal stage attempts can be archived.', {
      stage_attempt_id: input.stageAttemptId,
      status: row.status,
      archivable_statuses: [...ARCHIVABLE_STAGE_ATTEMPT_STATUSES],
    });
  }
  const archivedAt = input.archived ? new Date().toISOString() : null;
  db.prepare(`
    UPDATE stage_attempts
    SET archived_at = ?, archived_reason = ?, archived_source = ?
    WHERE stage_attempt_id = ?
  `).run(
    archivedAt,
    input.archived ? input.reason : null,
    input.archived ? input.source : null,
    input.stageAttemptId,
  );
  return stageAttemptToPayload(getStageAttemptRow(db, input.stageAttemptId)!);
}

export function listStageAttemptRows(
  db: DatabaseSync,
  limit?: number,
  archived: 'exclude' | 'only' | 'include' = 'exclude',
) {
  const archiveWhere = archived === 'only' ? 'archived_at IS NOT NULL' : archived === 'include' ? '1 = 1' : 'archived_at IS NULL';
  if (typeof limit === 'number' && Number.isInteger(limit) && limit > 0) {
    return db.prepare(`
      SELECT * FROM stage_attempts WHERE ${archiveWhere} ORDER BY updated_at DESC, created_at DESC LIMIT ?
    `).all(limit) as StageAttemptRow[];
  }
  return db.prepare(`
    SELECT * FROM stage_attempts WHERE ${archiveWhere} ORDER BY updated_at DESC, created_at DESC
  `).all() as StageAttemptRow[];
}

export function latestStageAttemptCloseoutPacketsByAttempt(db: DatabaseSync, stageAttemptIds: string[]) {
  const byAttempt = new Map<string, Record<string, unknown>>();
  if (stageAttemptIds.length === 0) {
    return byAttempt;
  }
  const rows = db.prepare(`
    SELECT stage_attempt_id, packet_json
    FROM stage_attempt_closeouts
    WHERE stage_attempt_id IN (${stageAttemptIds.map(() => '?').join(',')})
    ORDER BY stage_attempt_id ASC, created_at ASC
  `).all(...stageAttemptIds) as Pick<StageAttemptCloseoutRow, 'stage_attempt_id' | 'packet_json'>[];
  for (const row of rows) {
    byAttempt.set(row.stage_attempt_id, parseJsonObject(row.packet_json));
  }
  return byAttempt;
}

export function stageAttemptSignalsByAttempt(db: DatabaseSync, stageAttemptIds: string[]) {
  const byAttempt = new Map<string, ReturnType<typeof stageAttemptSignalToPayload>[]>();
  if (stageAttemptIds.length === 0) {
    return byAttempt;
  }
  const rows = db.prepare(`
    SELECT *
    FROM stage_attempt_signals
    WHERE stage_attempt_id IN (${stageAttemptIds.map(() => '?').join(',')})
    ORDER BY stage_attempt_id ASC, created_at ASC
  `).all(...stageAttemptIds) as StageAttemptSignalRow[];
  for (const row of rows) {
    const signals = byAttempt.get(row.stage_attempt_id) ?? [];
    signals.push(stageAttemptSignalToPayload(row));
    byAttempt.set(row.stage_attempt_id, signals);
  }
  return byAttempt;
}

export function listStageAttemptsForTask(db: DatabaseSync, taskId: string) {
  return (db.prepare(`
    SELECT * FROM stage_attempts WHERE task_id = ? ORDER BY updated_at DESC, created_at DESC
  `).all(taskId) as StageAttemptRow[]).map(stageAttemptToPayload);
}

export function getStageAttemptRow(db: DatabaseSync, stageAttemptId: string) {
  return db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(stageAttemptId) as
    | StageAttemptRow
    | undefined;
}

export function inspectStageAttemptPayload(db: DatabaseSync, stageAttemptId: string) {
  const row = getStageAttemptRow(db, stageAttemptId);
  return row ? stageAttemptToPayload(row) : null;
}

export function listStageAttemptSignals(db: DatabaseSync, stageAttemptId: string) {
  return (db.prepare(`
    SELECT * FROM stage_attempt_signals WHERE stage_attempt_id = ? ORDER BY created_at ASC
  `).all(stageAttemptId) as StageAttemptSignalRow[]).map(stageAttemptSignalToPayload);
}

export function listStageAttemptCloseouts(db: DatabaseSync, stageAttemptId: string) {
  return (db.prepare(`
    SELECT * FROM stage_attempt_closeouts WHERE stage_attempt_id = ? ORDER BY created_at ASC
  `).all(stageAttemptId) as StageAttemptCloseoutRow[]).map(stageAttemptCloseoutToPayload);
}

export function parseStageAttemptJsonObject(value: string) {
  return parseJsonObject(value);
}

export function parseStageAttemptJsonList(value: string) {
  return parseJsonList(value);
}
