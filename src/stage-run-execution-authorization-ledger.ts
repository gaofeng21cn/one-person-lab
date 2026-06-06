import fs from 'node:fs';

import { ensureOplStateDir, resolveOplStatePaths } from './runtime-state-paths.ts';
import {
  evaluateStageRunExecutionAuthorization,
  type StageRunExecutionAuthorizationReport,
} from './stage-run-kernel.ts';

type JsonRecord = Record<string, unknown>;

export type StageRunExecutionAuthorizationInput = {
  stage_run_id?: string | null;
  domain_id?: string | null;
  stage_id?: string | null;
  generation?: number | null;
  phase?: 'launch' | 'closeout' | null;
  selected_executor?: string | null;
  provider_attempt_ref?: string | null;
  stage_attempt_id?: string | null;
  attempt_lease_ref?: string | null;
  attempt_lease_status?: string | null;
  execution_authorization_decision_ref?: string | null;
  workspace_scope_ref?: string | null;
  artifact_scope_ref?: string | null;
  source_fingerprint?: string | null;
  idempotency_key?: string | null;
  current_pointer_ref?: string | null;
  stage_manifest_ref?: string | null;
  owner_answer_ref?: string | null;
  owner_answer_kind?: 'owner_receipt' | 'typed_blocker' | null;
  closeout_receipt_ref?: string | null;
  owner_answer_stage_run_id?: string | null;
  owner_answer_generation?: number | null;
  owner_answer_manifest_ref?: string | null;
  owner_answer_current_pointer_ref?: string | null;
  owner_answer_source_fingerprint?: string | null;
  owner_answer_idempotency_key?: string | null;
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
  stage_id: string;
  generation: number;
  phase: 'launch' | 'closeout';
  selected_executor: string;
  provider_attempt_ref: string;
  stage_attempt_id: string | null;
  attempt_lease_ref: string;
  attempt_lease_status: 'active';
  execution_authorization_decision_ref: string;
  workspace_scope_ref: string;
  artifact_scope_ref: string;
  source_fingerprint: string;
  idempotency_key: string;
  current_pointer_ref: string;
  stage_manifest_ref: string | null;
  owner_answer_ref: string | null;
  owner_answer_kind: 'owner_receipt' | 'typed_blocker' | null;
  closeout_receipt_ref: string | null;
  owner_answer_stage_run_id: string | null;
  owner_answer_generation: number | null;
  owner_answer_manifest_ref: string | null;
  owner_answer_current_pointer_ref: string | null;
  owner_answer_source_fingerprint: string | null;
  owner_answer_idempotency_key: string | null;
  closeout_refs: string[];
  execution_authorization_report: StageRunExecutionAuthorizationReport;
  authority_boundary: ReturnType<typeof refsOnlyAuthorityBoundary>;
};

export type StageRunExecutionAuthorizationVerifyInput = {
  receipt_ref?: string | null;
};

type StageRunExecutionAuthorizationLedger = {
  surface_kind: 'opl_stage_run_execution_authorization_ledger';
  version: 'stage-run-execution-authorization-ledger.v1';
  receipts: StageRunExecutionAuthorizationReceipt[];
};

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
  return value === 'typed_blocker' ? 'typed_blocker' : value === 'owner_receipt' ? 'owner_receipt' : null;
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

function emptyLedger(): StageRunExecutionAuthorizationLedger {
  return {
    surface_kind: 'opl_stage_run_execution_authorization_ledger',
    version: 'stage-run-execution-authorization-ledger.v1',
    receipts: [],
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
  };
}

function normalizeReceipt(value: unknown): StageRunExecutionAuthorizationReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const stage_run_id = optionalString(value.stage_run_id);
  const domain_id = optionalString(value.domain_id);
  const stage_id = optionalString(value.stage_id);
  const provider_attempt_ref = optionalString(value.provider_attempt_ref);
  const attempt_lease_ref = optionalString(value.attempt_lease_ref);
  const execution_authorization_decision_ref = optionalString(value.execution_authorization_decision_ref);
  const workspace_scope_ref = optionalString(value.workspace_scope_ref);
  const artifact_scope_ref = optionalString(value.artifact_scope_ref);
  const source_fingerprint = optionalString(value.source_fingerprint);
  const idempotency_key = optionalString(value.idempotency_key);
  const current_pointer_ref = optionalString(value.current_pointer_ref);
  const report = isRecord(value.execution_authorization_report)
    ? value.execution_authorization_report as StageRunExecutionAuthorizationReport
    : null;
  if (
    !stage_run_id
    || !domain_id
    || !stage_id
    || !provider_attempt_ref
    || !attempt_lease_ref
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
    stage_id,
    generation: generationValue(value.generation),
    phase: value.phase === 'closeout' ? 'closeout' : 'launch',
    selected_executor: optionalString(value.selected_executor) ?? 'codex_cli',
    provider_attempt_ref,
    stage_attempt_id: optionalString(value.stage_attempt_id),
    attempt_lease_ref,
    attempt_lease_status: 'active',
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
    closeout_refs: uniqueStrings(stringList(value.closeout_refs)),
    execution_authorization_report: report,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function readLedger(): StageRunExecutionAuthorizationLedger {
  const file = ledgerPath();
  if (!fs.existsSync(file)) {
    return emptyLedger();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.receipts)) {
      return emptyLedger();
    }
    return {
      ...emptyLedger(),
      receipts: parsed.receipts
        .map(normalizeReceipt)
        .filter((receipt): receipt is StageRunExecutionAuthorizationReceipt => Boolean(receipt)),
    };
  } catch {
    return emptyLedger();
  }
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
  if (report.execution_authorized !== true) {
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
    domain_id: optionalString(evaluationInput.domain_id)!,
    stage_id: optionalString(evaluationInput.stage_id)!,
    generation: generationValue(evaluationInput.generation),
    phase: evaluationInput.phase as 'launch' | 'closeout',
    selected_executor: optionalString(evaluationInput.selected_executor) ?? 'codex_cli',
    provider_attempt_ref: optionalString(evaluationInput.provider_attempt_ref)!,
    stage_attempt_id: optionalString(input.stage_attempt_id),
    attempt_lease_ref: optionalString(evaluationInput.attempt_lease_ref)!,
    attempt_lease_status: 'active',
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
    closeout_refs: uniqueStrings(input.closeout_refs ?? []),
    execution_authorization_report: report,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function recordStageRunExecutionAuthorizationReceipts(inputs: StageRunExecutionAuthorizationInput[]) {
  const receipts = inputs
    .map(normalizeInput)
    .filter((receipt): receipt is StageRunExecutionAuthorizationReceipt => Boolean(receipt));

  if (receipts.length === 0) {
    return {
      surface_kind: 'opl_stage_run_execution_authorization_ledger_record',
      status: 'blocked',
      recorded_receipt_count: 0,
      receipt_refs: [],
      ledger_file: ledgerPath(),
      blocker: {
        blocker_kind: 'stage_run_execution_authorization_receipt_gate',
        blocker_id: 'stage_run_execution_authorization_not_authorized',
        required_owner: 'one-person-lab',
      },
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

export function latestStageRunExecutionAuthorizationReceiptForStageRun(stageRunId: string) {
  const normalizedStageRunId = optionalString(stageRunId);
  if (!normalizedStageRunId) {
    return null;
  }
  return readLedger().receipts.find((receipt) => receipt.stage_run_id === normalizedStageRunId) ?? null;
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
