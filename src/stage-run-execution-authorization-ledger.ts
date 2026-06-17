import fs from 'node:fs';

import { ensureOplStateDir, resolveOplStatePaths } from './runtime-state-paths.ts';
import {
  evaluateStageRunExecutionAuthorization,
  type StageRunExecutionAuthorizationReport,
} from './stage-run-kernel.ts';

type JsonRecord = Record<string, unknown>;

type StageRunExecutionAuthorizationDecision = 'authorize' | 'human_gate' | 'typed_blocker';

type StageRunExecutionAuthorizationDomainContext = {
  domain_id: string;
  study_id: string;
  stage_id: string;
};

export type StageRunExecutionAuthorizationInput = {
  stage_run_id?: string | null;
  domain_id?: string | null;
  study_id?: string | null;
  domain_context?: Record<string, unknown> | null;
  stage_id?: string | null;
  generation?: number | null;
  phase?: 'launch' | 'closeout' | null;
  selected_executor?: string | null;
  provider_attempt_ref?: string | null;
  stage_attempt_id?: string | null;
  attempt_lease_ref?: string | null;
  attempt_lease_status?: string | null;
  action_type?: string | null;
  work_unit_id?: string | null;
  work_unit_fingerprint?: string | null;
  decision?: string | null;
  reason?: string | null;
  operator?: string | null;
  execution_authorization_decision_ref?: string | null;
  workspace_scope_ref?: string | null;
  artifact_scope_ref?: string | null;
  source_fingerprint?: string | null;
  idempotency_key?: string | null;
  current_pointer_ref?: string | null;
  stage_manifest_ref?: string | null;
  owner_answer_ref?: string | null;
  owner_answer_kind?:
    | 'owner_receipt'
    | 'quality_gate_receipt'
    | 'typed_blocker'
    | 'human_gate'
    | 'route_back_evidence'
    | null;
  closeout_receipt_ref?: string | null;
  owner_answer_stage_run_id?: string | null;
  owner_answer_generation?: number | null;
  owner_answer_manifest_ref?: string | null;
  owner_answer_current_pointer_ref?: string | null;
  owner_answer_source_fingerprint?: string | null;
  owner_answer_idempotency_key?: string | null;
  quality_gate_attempt_ref?: string | null;
  owner_answer_attempt_ref?: string | null;
  closeout_refs?: string[];
  receipt_ref?: string | null;
};

export type StageRunExecutionAuthorizationReceipt = {
  surface_kind: 'opl_stage_run_execution_authorization_receipt';
  version: 'stage-run-execution-authorization-ledger.v1';
  receipt_ref: string;
  receipt_status: 'recorded' | 'verified';
  recorded_at: string;
  stage_run_id: string;
  domain_id: string;
  study_id: string;
  domain_context: StageRunExecutionAuthorizationDomainContext;
  stage_id: string;
  generation: number;
  phase: 'launch' | 'closeout';
  selected_executor: string;
  provider_attempt_ref: string;
  stage_attempt_id: string | null;
  attempt_lease_ref: string;
  attempt_lease_status: 'active';
  action_type: string;
  work_unit_id: string;
  work_unit_fingerprint: string;
  decision: StageRunExecutionAuthorizationDecision;
  reason: string;
  operator: string;
  execution_authorization_decision_ref: string;
  workspace_scope_ref: string;
  artifact_scope_ref: string;
  source_fingerprint: string;
  idempotency_key: string;
  current_pointer_ref: string;
  stage_manifest_ref: string | null;
  owner_answer_ref: string | null;
  owner_answer_kind:
    | 'owner_receipt'
    | 'quality_gate_receipt'
    | 'typed_blocker'
    | 'human_gate'
    | 'route_back_evidence'
    | null;
  closeout_receipt_ref: string | null;
  owner_answer_stage_run_id: string | null;
  owner_answer_generation: number | null;
  owner_answer_manifest_ref: string | null;
  owner_answer_current_pointer_ref: string | null;
  owner_answer_source_fingerprint: string | null;
  owner_answer_idempotency_key: string | null;
  quality_gate_attempt_ref: string | null;
  closeout_refs: string[];
  execution_authorization_report: StageRunExecutionAuthorizationReport;
  authority_boundary: ReturnType<typeof refsOnlyAuthorityBoundary>;
};

export type StageRunExecutionAuthorizationVerifyInput = {
  receipt_ref?: string | null;
};

export type StageRunExecutionAuthorizationRecordOptions = {
  dry_run?: boolean;
};

type StageRunExecutionAuthorizationLedger = {
  surface_kind: 'opl_stage_run_execution_authorization_ledger';
  version: 'stage-run-execution-authorization-ledger.v1';
  receipts: StageRunExecutionAuthorizationReceipt[];
};

type StageRunExecutionAuthorizationLedgerInspection = StageRunExecutionAuthorizationLedger & {
  ledger_file: string;
  ledger_exists: boolean;
  raw_receipt_count: number;
  strict_schema_rejected_receipt_count: number;
  strict_schema_required_identity_fields: string[];
  read_error: string | null;
};

const STRICT_SCHEMA_REQUIRED_IDENTITY_FIELDS = [
  'study_id',
  'domain_context',
  'stage_attempt_id',
  'action_type',
  'work_unit_id',
  'work_unit_fingerprint',
  'decision',
  'reason',
  'operator',
  'execution_authorization_report.execution_authorized',
];

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  const scalar = optionalString(value);
  if (scalar) {
    return [scalar];
  }
  return Array.isArray(value)
    ? value.map(optionalString).filter((entry): entry is string => Boolean(entry))
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function generationValue(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function ownerAnswerGenerationValue(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function ownerAnswerKind(value: unknown) {
  return value === 'owner_receipt'
    || value === 'quality_gate_receipt'
    || value === 'typed_blocker'
    || value === 'human_gate'
    || value === 'route_back_evidence'
    ? value
    : null;
}

function decisionValue(value: unknown): StageRunExecutionAuthorizationDecision | null {
  return value === 'authorize' || value === 'human_gate' || value === 'typed_blocker'
    ? value
    : null;
}

function refsOnlyAuthorityBoundary() {
  return {
    refs_only: true,
    owner: 'one-person-lab',
    can_write_domain_truth: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact_body: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_authorize_quality_or_export: false,
    can_close_owner_chain: false,
    can_close_domain_ready: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    provider_completion_counts_as_domain_ready: false,
    authorization_receipt_is_domain_owner_answer: false,
  };
}

function domainContextValue(
  value: unknown,
): StageRunExecutionAuthorizationDomainContext | null {
  if (!isRecord(value)) {
    return null;
  }
  const domainId = optionalString(value.domain_id);
  const studyId = optionalString(value.study_id);
  const stageId = optionalString(value.stage_id);
  if (!domainId || !studyId || !stageId) {
    return null;
  }
  return {
    domain_id: domainId,
    study_id: studyId,
    stage_id: stageId,
  };
}

function identityBlockers(input: {
  domainId: string | null;
  studyId: string | null;
  stageId: string | null;
  stageAttemptId: string | null;
  actionType: string | null;
  workUnitId: string | null;
  workUnitFingerprint: string | null;
  sourceFingerprint: string | null;
  decision: StageRunExecutionAuthorizationDecision | null;
  reason: string | null;
  operator: string | null;
  domainContext: StageRunExecutionAuthorizationDomainContext | null;
}) {
  return [
    input.stageAttemptId ? null : 'stage_attempt_id_missing',
    input.studyId ? null : 'study_id_missing',
    input.domainContext ? null : 'domain_context_missing',
    input.actionType ? null : 'action_type_missing',
    input.workUnitId ? null : 'work_unit_id_missing',
    input.workUnitFingerprint ? null : 'work_unit_fingerprint_missing',
    input.decision ? null : 'decision_missing_or_invalid',
    input.reason ? null : 'reason_missing',
    input.operator ? null : 'operator_missing',
    input.domainContext && input.domainId && input.domainContext.domain_id !== input.domainId
      ? 'domain_context_domain_id_mismatch'
      : null,
    input.domainContext && input.studyId && input.domainContext.study_id !== input.studyId
      ? 'domain_context_study_id_mismatch'
      : null,
    input.domainContext && input.stageId && input.domainContext.stage_id !== input.stageId
      ? 'domain_context_stage_id_mismatch'
      : null,
  ].filter((entry): entry is string => Boolean(entry));
}

function emptyLedger(): StageRunExecutionAuthorizationLedger {
  return {
    surface_kind: 'opl_stage_run_execution_authorization_ledger',
    version: 'stage-run-execution-authorization-ledger.v1',
    receipts: [],
  };
}

function emptyLedgerInspection(input: {
  file: string;
  exists: boolean;
  readError?: string | null;
}): StageRunExecutionAuthorizationLedgerInspection {
  return {
    ...emptyLedger(),
    ledger_file: input.file,
    ledger_exists: input.exists,
    raw_receipt_count: 0,
    strict_schema_rejected_receipt_count: 0,
    strict_schema_required_identity_fields: STRICT_SCHEMA_REQUIRED_IDENTITY_FIELDS,
    read_error: input.readError ?? null,
  };
}

function ledgerPath() {
  return resolveOplStatePaths().stage_run_execution_authorization_ledger_file;
}

function receiptRef(input: {
  explicitRef: string | null;
  stageRunId: string;
  decisionRef: string;
}) {
  if (input.explicitRef) {
    return input.explicitRef;
  }
  return `opl://stage-run-execution-authorization/${
    encodeURIComponent(input.stageRunId)
  }/${encodeURIComponent(input.decisionRef)}`;
}

function buildEvaluationInput(input: StageRunExecutionAuthorizationInput) {
  const stageRunId = optionalString(input.stage_run_id);
  const domainId = optionalString(input.domain_id);
  const stageId = optionalString(input.stage_id);
  const generation = generationValue(input.generation);
  return {
    phase: input.phase === 'closeout' ? 'closeout' : 'launch',
    stage_run_id: stageRunId,
    domain_id: domainId,
    stage_id: stageId,
    generation,
    current_pointer: {
      stage_run_id: stageRunId,
      generation,
      current: true,
    },
    selected_executor: optionalString(input.selected_executor) ?? 'codex_cli',
    provider_attempt_ref: optionalString(input.provider_attempt_ref),
    attempt_lease_ref: optionalString(input.attempt_lease_ref),
    attempt_lease_status: optionalString(input.attempt_lease_status) ?? 'active',
    execution_authorization_decision_ref: optionalString(input.execution_authorization_decision_ref),
    workspace_scope_ref: optionalString(input.workspace_scope_ref),
    artifact_scope_ref: optionalString(input.artifact_scope_ref),
    source_fingerprint: optionalString(input.source_fingerprint),
    idempotency_key: optionalString(input.idempotency_key),
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
    },
    closeout_receipt_ref: optionalString(input.closeout_receipt_ref),
    owner_answer_ref: optionalString(input.owner_answer_ref),
    owner_answer_kind: ownerAnswerKind(input.owner_answer_kind),
    owner_answer_stage_run_id: optionalString(input.owner_answer_stage_run_id),
    owner_answer_generation: ownerAnswerGenerationValue(input.owner_answer_generation),
    owner_answer_manifest_ref: optionalString(input.owner_answer_manifest_ref),
    stage_manifest_ref: optionalString(input.stage_manifest_ref),
    owner_answer_current_pointer_ref: optionalString(input.owner_answer_current_pointer_ref),
    current_pointer_ref: optionalString(input.current_pointer_ref),
    owner_answer_source_fingerprint: optionalString(input.owner_answer_source_fingerprint),
    owner_answer_idempotency_key: optionalString(input.owner_answer_idempotency_key),
    quality_gate_attempt_ref:
      optionalString(input.quality_gate_attempt_ref) ?? optionalString(input.owner_answer_attempt_ref),
  };
}

function normalizeReceipt(value: unknown): StageRunExecutionAuthorizationReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const stage_run_id = optionalString(value.stage_run_id);
  const domain_id = optionalString(value.domain_id);
  const study_id = optionalString(value.study_id);
  const domain_context = domainContextValue(value.domain_context);
  const stage_id = optionalString(value.stage_id);
  const provider_attempt_ref = optionalString(value.provider_attempt_ref);
  const stage_attempt_id = optionalString(value.stage_attempt_id);
  const attempt_lease_ref = optionalString(value.attempt_lease_ref);
  const action_type = optionalString(value.action_type);
  const work_unit_id = optionalString(value.work_unit_id);
  const work_unit_fingerprint = optionalString(value.work_unit_fingerprint);
  const decision = decisionValue(value.decision);
  const reason = optionalString(value.reason);
  const operator = optionalString(value.operator);
  const execution_authorization_decision_ref = optionalString(value.execution_authorization_decision_ref);
  const workspace_scope_ref = optionalString(value.workspace_scope_ref);
  const artifact_scope_ref = optionalString(value.artifact_scope_ref);
  const source_fingerprint = optionalString(value.source_fingerprint);
  const idempotency_key = optionalString(value.idempotency_key);
  const current_pointer_ref = optionalString(value.current_pointer_ref);
  const quality_gate_attempt_ref = optionalString(value.quality_gate_attempt_ref);
  const report = isRecord(value.execution_authorization_report)
    ? value.execution_authorization_report as StageRunExecutionAuthorizationReport
    : null;
  if (
    !stage_run_id
    || !domain_id
    || !study_id
    || !domain_context
    || !stage_id
    || !provider_attempt_ref
    || !stage_attempt_id
    || !attempt_lease_ref
    || !action_type
    || !work_unit_id
    || !work_unit_fingerprint
    || !decision
    || !reason
    || !operator
    || !execution_authorization_decision_ref
    || !workspace_scope_ref
    || !artifact_scope_ref
    || !source_fingerprint
    || !idempotency_key
    || !current_pointer_ref
    || !report
    || report.execution_authorized !== true
  ) {
    return null;
  }
  return {
    surface_kind: 'opl_stage_run_execution_authorization_receipt',
    version: 'stage-run-execution-authorization-ledger.v1',
    receipt_ref: optionalString(value.receipt_ref) ?? receiptRef({
      explicitRef: null,
      stageRunId: stage_run_id,
      decisionRef: execution_authorization_decision_ref,
    }),
    receipt_status: value.receipt_status === 'verified' ? 'verified' : 'recorded',
    recorded_at: optionalString(value.recorded_at) ?? nowIso(),
    stage_run_id,
    domain_id,
    study_id,
    domain_context,
    stage_id,
    generation: generationValue(value.generation),
    phase: value.phase === 'closeout' ? 'closeout' : 'launch',
    selected_executor: optionalString(value.selected_executor) ?? 'codex_cli',
    provider_attempt_ref,
    stage_attempt_id,
    attempt_lease_ref,
    attempt_lease_status: 'active',
    action_type,
    work_unit_id,
    work_unit_fingerprint,
    decision,
    reason,
    operator,
    execution_authorization_decision_ref,
    workspace_scope_ref,
    artifact_scope_ref,
    source_fingerprint,
    idempotency_key,
    current_pointer_ref,
    stage_manifest_ref: optionalString(value.stage_manifest_ref),
    owner_answer_ref: optionalString(value.owner_answer_ref),
    owner_answer_kind: ownerAnswerKind(value.owner_answer_kind),
    closeout_receipt_ref: optionalString(value.closeout_receipt_ref),
    owner_answer_stage_run_id: optionalString(value.owner_answer_stage_run_id),
    owner_answer_generation: ownerAnswerGenerationValue(value.owner_answer_generation),
    owner_answer_manifest_ref: optionalString(value.owner_answer_manifest_ref),
    owner_answer_current_pointer_ref: optionalString(value.owner_answer_current_pointer_ref),
    owner_answer_source_fingerprint: optionalString(value.owner_answer_source_fingerprint),
    owner_answer_idempotency_key: optionalString(value.owner_answer_idempotency_key),
    quality_gate_attempt_ref,
    closeout_refs: uniqueStrings(stringList(value.closeout_refs)),
    execution_authorization_report: report,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function readLedgerInspection(): StageRunExecutionAuthorizationLedgerInspection {
  const file = ledgerPath();
  if (!fs.existsSync(file)) {
    return emptyLedgerInspection({ file, exists: false });
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.receipts)) {
      return emptyLedgerInspection({
        file,
        exists: true,
        readError: 'stage_run_execution_authorization_ledger_invalid_shape',
      });
    }
    const rawReceipts = parsed.receipts;
    const receipts = rawReceipts
      .map(normalizeReceipt)
      .filter((receipt): receipt is StageRunExecutionAuthorizationReceipt => Boolean(receipt));
    return {
      ...emptyLedger(),
      ledger_file: file,
      ledger_exists: true,
      raw_receipt_count: rawReceipts.length,
      strict_schema_rejected_receipt_count: rawReceipts.length - receipts.length,
      strict_schema_required_identity_fields: STRICT_SCHEMA_REQUIRED_IDENTITY_FIELDS,
      read_error: null,
      receipts,
    };
  } catch {
    return emptyLedgerInspection({
      file,
      exists: true,
      readError: 'stage_run_execution_authorization_ledger_parse_failed',
    });
  }
}

function readLedger(): StageRunExecutionAuthorizationLedger {
  const { receipts } = readLedgerInspection();
  return {
    ...emptyLedger(),
    receipts,
  };
}

function writeLedger(ledger: StageRunExecutionAuthorizationLedger) {
  const paths = ensureOplStateDir();
  fs.writeFileSync(
    paths.stage_run_execution_authorization_ledger_file,
    `${JSON.stringify(ledger, null, 2)}\n`,
  );
}

function normalizeInput(input: StageRunExecutionAuthorizationInput): StageRunExecutionAuthorizationReceipt | null {
  const evaluationInput = buildEvaluationInput(input);
  const report = evaluateStageRunExecutionAuthorization(evaluationInput);
  const domainId = optionalString(evaluationInput.domain_id);
  const studyId = optionalString(input.study_id);
  const stageId = optionalString(evaluationInput.stage_id);
  const stageAttemptId = optionalString(input.stage_attempt_id);
  const actionType = optionalString(input.action_type);
  const workUnitId = optionalString(input.work_unit_id);
  const workUnitFingerprint = optionalString(input.work_unit_fingerprint);
  const sourceFingerprint = optionalString(evaluationInput.source_fingerprint);
  const decision = decisionValue(input.decision);
  const reason = optionalString(input.reason);
  const operator = optionalString(input.operator);
  const domainContext = domainContextValue(input.domain_context);
  const blockers = identityBlockers({
    domainId,
    studyId,
    stageId,
    stageAttemptId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    sourceFingerprint,
    decision,
    reason,
    operator,
    domainContext,
  });
  if (report.execution_authorized !== true || blockers.length > 0) {
    return null;
  }
  const stageRunId = optionalString(evaluationInput.stage_run_id)!;
  const decisionRef = optionalString(evaluationInput.execution_authorization_decision_ref)!;
  return {
    surface_kind: 'opl_stage_run_execution_authorization_receipt',
    version: 'stage-run-execution-authorization-ledger.v1',
    receipt_ref: receiptRef({
      explicitRef: optionalString(input.receipt_ref),
      stageRunId,
      decisionRef,
    }),
    receipt_status: 'recorded',
    recorded_at: nowIso(),
    stage_run_id: stageRunId,
    domain_id: domainId!,
    study_id: studyId!,
    domain_context: domainContext!,
    stage_id: stageId!,
    generation: generationValue(evaluationInput.generation),
    phase: evaluationInput.phase as 'launch' | 'closeout',
    selected_executor: optionalString(evaluationInput.selected_executor) ?? 'codex_cli',
    provider_attempt_ref: optionalString(evaluationInput.provider_attempt_ref)!,
    stage_attempt_id: stageAttemptId,
    attempt_lease_ref: optionalString(evaluationInput.attempt_lease_ref)!,
    attempt_lease_status: 'active',
    action_type: actionType!,
    work_unit_id: workUnitId!,
    work_unit_fingerprint: workUnitFingerprint!,
    decision: decision!,
    reason: reason!,
    operator: operator!,
    execution_authorization_decision_ref: decisionRef,
    workspace_scope_ref: optionalString(evaluationInput.workspace_scope_ref)!,
    artifact_scope_ref: optionalString(evaluationInput.artifact_scope_ref)!,
    source_fingerprint: optionalString(evaluationInput.source_fingerprint)!,
    idempotency_key: optionalString(evaluationInput.idempotency_key)!,
    current_pointer_ref: optionalString(input.current_pointer_ref) ?? `opl://stage-runs/${encodeURIComponent(stageRunId)}/current`,
    stage_manifest_ref: optionalString(input.stage_manifest_ref),
    owner_answer_ref: optionalString(input.owner_answer_ref),
    owner_answer_kind: ownerAnswerKind(input.owner_answer_kind),
    closeout_receipt_ref: optionalString(input.closeout_receipt_ref),
    owner_answer_stage_run_id: optionalString(input.owner_answer_stage_run_id),
    owner_answer_generation: ownerAnswerGenerationValue(input.owner_answer_generation),
    owner_answer_manifest_ref: optionalString(input.owner_answer_manifest_ref),
    owner_answer_current_pointer_ref: optionalString(input.owner_answer_current_pointer_ref),
    owner_answer_source_fingerprint: optionalString(input.owner_answer_source_fingerprint),
    owner_answer_idempotency_key: optionalString(input.owner_answer_idempotency_key),
    quality_gate_attempt_ref:
      optionalString(input.quality_gate_attempt_ref) ?? optionalString(input.owner_answer_attempt_ref),
    closeout_refs: uniqueStrings(input.closeout_refs ?? []),
    execution_authorization_report: report,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function inputBlockers(input: StageRunExecutionAuthorizationInput) {
  const evaluationInput = buildEvaluationInput(input);
  const report = evaluateStageRunExecutionAuthorization(evaluationInput);
  const identityReasons = identityBlockers({
    domainId: optionalString(evaluationInput.domain_id),
    studyId: optionalString(input.study_id),
    stageId: optionalString(evaluationInput.stage_id),
    stageAttemptId: optionalString(input.stage_attempt_id),
    actionType: optionalString(input.action_type),
    workUnitId: optionalString(input.work_unit_id),
    workUnitFingerprint: optionalString(input.work_unit_fingerprint),
    sourceFingerprint: optionalString(evaluationInput.source_fingerprint),
    decision: decisionValue(input.decision),
    reason: optionalString(input.reason),
    operator: optionalString(input.operator),
    domainContext: domainContextValue(input.domain_context),
  });
  return {
    report,
    identityReasons,
    reasons: [...new Set([
      ...report.launch_blockers,
      ...report.closeout_binding_blockers,
      ...identityReasons,
    ])],
  };
}

export function recordStageRunExecutionAuthorizationReceipts(
  inputs: StageRunExecutionAuthorizationInput[],
  options: StageRunExecutionAuthorizationRecordOptions = {},
) {
  const receipts = inputs
    .map(normalizeInput)
    .filter((receipt): receipt is StageRunExecutionAuthorizationReceipt => Boolean(receipt));

  if (receipts.length === 0) {
    const blockers = inputs.flatMap((input) => inputBlockers(input).reasons);
    const identityBlockerCount = inputs
      .filter((input) => inputBlockers(input).identityReasons.length > 0)
      .length;
    return {
      surface_kind: 'opl_stage_run_execution_authorization_ledger_record',
      status: 'blocked',
      dry_run: options.dry_run === true,
      writes_performed: false,
      recorded_receipt_count: 0,
      receipt_refs: [],
      ledger_file: ledgerPath(),
      blocker: {
        blocker_kind: 'stage_run_execution_authorization_receipt_gate',
        blocker_id: identityBlockerCount > 0
          ? 'stage_run_execution_authorization_identity_invalid'
          : 'stage_run_execution_authorization_not_authorized',
        required_owner: 'one-person-lab',
        blocker_reasons: [...new Set(blockers)],
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    };
  }

  if (options.dry_run === true) {
    return {
      surface_kind: 'opl_stage_run_execution_authorization_ledger_record',
      status: 'planned',
      dry_run: true,
      writes_performed: false,
      planned_receipt_count: receipts.length,
      recorded_receipt_count: 0,
      receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
      ledger_file: ledgerPath(),
      receipts,
      authority_boundary: refsOnlyAuthorityBoundary(),
    };
  }

  const ledger = readLedger();
  for (const receipt of receipts) {
    const existingIndex = ledger.receipts.findIndex((entry) => entry.receipt_ref === receipt.receipt_ref);
    if (existingIndex >= 0) {
      ledger.receipts[existingIndex] = receipt;
    } else {
      ledger.receipts.unshift(receipt);
    }
  }
  writeLedger(ledger);
  return {
    surface_kind: 'opl_stage_run_execution_authorization_ledger_record',
    status: 'recorded',
    dry_run: false,
    writes_performed: true,
    recorded_receipt_count: receipts.length,
    receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
    ledger_file: ledgerPath(),
    receipts,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function verifyStageRunExecutionAuthorizationReceipt(
  input: StageRunExecutionAuthorizationVerifyInput = {},
) {
  const ledger = readLedger();
  const requestedReceiptRef = optionalString(input.receipt_ref);
  const receiptIndex = requestedReceiptRef
    ? ledger.receipts.findIndex((receipt) => receipt.receipt_ref === requestedReceiptRef)
    : ledger.receipts.findIndex((receipt) => receipt.receipt_status === 'recorded');
  const fallbackIndex = requestedReceiptRef ? -1 : ledger.receipts.findIndex(Boolean);
  const selectedIndex = receiptIndex >= 0 ? receiptIndex : fallbackIndex;

  if (selectedIndex < 0) {
    return {
      surface_kind: 'opl_stage_run_execution_authorization_ledger_verify',
      status: 'blocked',
      writes_performed: false,
      receipt_ref: requestedReceiptRef,
      verified_receipt_count: 0,
      ledger_file: ledgerPath(),
      blocker: {
        blocker_kind: 'stage_run_execution_authorization_receipt_gate',
        blocker_id: 'stage_run_execution_authorization_receipt_not_found',
        required_owner: 'one-person-lab',
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    };
  }

  const current = ledger.receipts[selectedIndex];
  const verified = {
    ...current,
    receipt_status: 'verified' as const,
  };
  ledger.receipts[selectedIndex] = verified;
  writeLedger(ledger);
  return {
    surface_kind: 'opl_stage_run_execution_authorization_ledger_verify',
    status: 'verified',
    writes_performed: current.receipt_status !== 'verified',
    receipt_ref: verified.receipt_ref,
    verified_receipt_count: 1,
    ledger_file: ledgerPath(),
    receipt: verified,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function listStageRunExecutionAuthorizationReceipts() {
  return readLedger().receipts;
}

export function inspectStageRunExecutionAuthorizationLedger() {
  return readLedgerInspection();
}

export function latestStageRunExecutionAuthorizationReceiptForStageRun(stageRunId: string) {
  const normalizedStageRunId = optionalString(stageRunId);
  if (!normalizedStageRunId) {
    return null;
  }
  return readLedger().receipts.find((receipt) => receipt.stage_run_id === normalizedStageRunId) ?? null;
}

function receiptHasCloseoutOwnerAnswerBinding(receipt: StageRunExecutionAuthorizationReceipt) {
  return receipt.phase === 'closeout'
    && receipt.owner_answer_ref !== null
    && receipt.execution_authorization_report.closeout_binding_blockers.length === 0
    && receipt.execution_authorization_report.closeout_binding.owner_answer_ref !== null
    && receipt.execution_authorization_report.closeout_binding.bound_to_stage_run === true
    && receipt.execution_authorization_report.closeout_binding.bound_to_stage_manifest === true
    && receipt.execution_authorization_report.closeout_binding.bound_to_current_pointer === true
    && receipt.execution_authorization_report.closeout_binding.bound_to_source_fingerprint === true
    && receipt.execution_authorization_report.closeout_binding.bound_to_idempotency_key === true;
}

export function latestStageRunExecutionAuthorizationCloseoutReceiptForStageRun(stageRunId: string) {
  const normalizedStageRunId = optionalString(stageRunId);
  if (!normalizedStageRunId) {
    return null;
  }
  return readLedger().receipts.find((receipt) =>
    receipt.stage_run_id === normalizedStageRunId
    && receiptHasCloseoutOwnerAnswerBinding(receipt)
  ) ?? null;
}

export function latestStageRunExecutionAuthorizationCloseoutReceiptForStageAttempt(stageAttemptId: string) {
  const normalizedStageAttemptId = optionalString(stageAttemptId);
  if (!normalizedStageAttemptId) {
    return null;
  }
  return readLedger().receipts.find((receipt) =>
    receipt.stage_attempt_id === normalizedStageAttemptId
    && receiptHasCloseoutOwnerAnswerBinding(receipt)
  ) ?? null;
}

export function latestStageRunExecutionAuthorizationReceiptForStageAttemptAnyRun(stageAttemptId: string) {
  const normalizedStageAttemptId = optionalString(stageAttemptId);
  if (!normalizedStageAttemptId) {
    return null;
  }
  return readLedger().receipts.find((receipt) =>
    receipt.stage_attempt_id === normalizedStageAttemptId
  ) ?? null;
}

export function latestStageRunExecutionAuthorizationReceiptForStageAttempt(input: {
  stageRunId: string;
  stageAttemptId?: string | null;
}) {
  const normalizedStageRunId = optionalString(input.stageRunId);
  const normalizedStageAttemptId = optionalString(input.stageAttemptId);
  if (!normalizedStageRunId || !normalizedStageAttemptId) {
    return null;
  }
  return readLedger().receipts.find((receipt) =>
    receipt.stage_run_id === normalizedStageRunId
    && receipt.stage_attempt_id === normalizedStageAttemptId
  ) ?? null;
}
