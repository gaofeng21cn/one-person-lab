import { QUEUE_PROJECTION_VOCABULARY } from '../../kernel/queue-projection-vocabulary.ts';

const FAMILY_CONFLICT_OR_BLOCKER_KIND = 'opl_conflict_or_blocker.v1' as const;

const FAMILY_CONFLICT_CLASSIFICATIONS = [
  'duplicate_task',
  'authority_conflict',
  'evidence_blocker',
  'quality_blocker',
  'human_gate',
  'execution_retryable',
  'identity_incomplete',
  'receipt_conflict',
] as const;

const FAMILY_CONFLICT_OWNERS = [
  'opl_runtime',
  'domain_agent',
  'human',
  'infrastructure',
] as const;

const FAMILY_CONFLICT_STATUSES = [
  'blocked',
  'waiting_for_human',
  'retry_scheduled',
  'dead_lettered',
  'conflict_fail_closed',
  'deduplicated',
] as const;

const FAMILY_ATTEMPT_CANONICAL_OUTCOMES = [
  'completed_with_receipt',
  'completed_with_quality_debt',
  'blocked',
  'waiting_for_human',
  'retry_scheduled',
  'dead_lettered',
  'conflict_fail_closed',
] as const;

export type FamilyConflictClassification = typeof FAMILY_CONFLICT_CLASSIFICATIONS[number];
export type FamilyConflictOwner = typeof FAMILY_CONFLICT_OWNERS[number];
export type FamilyConflictStatus = typeof FAMILY_CONFLICT_STATUSES[number];
export type FamilyAttemptCanonicalOutcome = typeof FAMILY_ATTEMPT_CANONICAL_OUTCOMES[number];

export type JsonRecord = Record<string, unknown>;

export type FamilyConflictSubject = {
  domain: string;
  stage_id: string;
  task_kind: string;
  source_fingerprint: string;
  idempotency_key: string;
  stage_attempt_id?: string | null;
  task_id?: string | null;
  source_refs?: string[];
};

export type FamilyConflictOrBlockerEnvelope = {
  kind: typeof FAMILY_CONFLICT_OR_BLOCKER_KIND;
  subject: FamilyConflictSubject;
  identity: FamilyConflictSubject;
  classification: FamilyConflictClassification;
  owner: FamilyConflictOwner;
  authority: string;
  status: FamilyConflictStatus;
  reason: string;
  evidence_refs: string[];
  allowed_next_actions: string[];
  forbidden_actions: string[];
  operator_label: string;
  operator_questions: {
    duplicate_task: boolean;
    current_blocker: string;
    authority_owner: string;
    automatic_retry: 'available' | 'exhausted' | 'not_applicable';
    user_action_required: string | null;
  };
  authority_boundary: {
    opl: 'route_project_audit_only';
    domain: 'truth_quality_artifact_gate_owner';
    provider_completion_is_domain_ready: false;
    can_write_domain_truth: false;
    can_fallback_complete: false;
  };
  fail_closed?: true;
};

type BuildEnvelopeInput = {
  subject: FamilyConflictSubject;
  classification: FamilyConflictClassification;
  reason: string;
  evidenceRefs?: string[];
  owner?: FamilyConflictOwner;
  authority?: string;
  status?: FamilyConflictStatus;
  allowedNextActions?: string[];
  forbiddenActions?: string[];
  failClosed?: boolean;
};

type StageAttemptEnvelopeInput = {
  subject: FamilyConflictSubject;
  attemptStatus: string;
  blockedReason?: string | null;
  humanGateRefs?: string[];
  humanGateLedger?: JsonRecord[];
  deadLetter?: JsonRecord | null;
  rejectedWrites?: JsonRecord[];
  domainReadyVerdict?: string | null;
  closeoutRefs?: string[];
  closeoutReceiptStatus?: string | null;
  routeImpact?: JsonRecord;
};

function normalizedString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function missingField(field: string) {
  return `missing:${field}`;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function displayAuthority(authority: string) {
  const normalized = authority.toLowerCase();
  if (normalized.includes('medautoscience') || normalized.includes('med-autoscience') || normalized === 'mas') {
    return 'MAS';
  }
  if (normalized.includes('medautogrant') || normalized.includes('med-autogrant') || normalized === 'mag') {
    return 'MAG';
  }
  if (normalized.includes('redcube') || normalized === 'rca') {
    return 'RCA';
  }
  if (normalized.includes('human')) {
    return '用户';
  }
  if (normalized.includes('infrastructure')) {
    return '基础设施';
  }
  return authority;
}

function defaultOwner(classification: FamilyConflictClassification): FamilyConflictOwner {
  if (classification === 'human_gate') {
    return 'human';
  }
  if (classification === 'execution_retryable') {
    return 'infrastructure';
  }
  if (classification === 'duplicate_task' || classification === 'identity_incomplete' || classification === 'receipt_conflict') {
    return 'opl_runtime';
  }
  return 'domain_agent';
}

function defaultStatus(classification: FamilyConflictClassification): FamilyConflictStatus {
  if (classification === 'duplicate_task') {
    return 'deduplicated';
  }
  if (classification === 'human_gate') {
    return 'waiting_for_human';
  }
  if (classification === 'execution_retryable') {
    return 'retry_scheduled';
  }
  if (classification === 'receipt_conflict') {
    return 'conflict_fail_closed';
  }
  return 'blocked';
}

function defaultAllowedNextActions(classification: FamilyConflictClassification, status: FamilyConflictStatus) {
  if (classification === 'duplicate_task') {
    return ['inspect_existing_attempt'];
  }
  if (classification === 'authority_conflict') {
    return ['repair_owner_descriptor', 'request_owner_receipt', 'request_human_review'];
  }
  if (classification === 'evidence_blocker') {
    return ['retry_after_owner_receipt', 'request_human_review', QUEUE_PROJECTION_VOCABULARY.deadLetter];
  }
  if (classification === 'quality_blocker') {
    return ['route_to_domain_quality_gate', 'request_human_review', QUEUE_PROJECTION_VOCABULARY.deadLetter];
  }
  if (classification === 'human_gate') {
    return ['request_human_review', 'resume_after_approval'];
  }
  if (classification === 'execution_retryable') {
    return status === 'dead_lettered'
      ? ['inspect_dead_letter', 'request_human_review']
      : ['retry_with_budget', QUEUE_PROJECTION_VOCABULARY.deadLetter];
  }
  if (classification === 'receipt_conflict') {
    return ['inspect_conflicting_receipts', 'request_human_review', QUEUE_PROJECTION_VOCABULARY.deadLetter];
  }
  return ['repair_identity', 'request_human_review'];
}

function defaultForbiddenActions(classification: FamilyConflictClassification) {
  const common = ['mark_domain_ready', 'write_domain_truth', 'fallback_complete'];
  if (classification === 'duplicate_task') {
    return [...common, 'create_duplicate_attempt'];
  }
  if (classification === 'human_gate') {
    return [...common, 'auto_continue_without_approval'];
  }
  if (classification === 'execution_retryable') {
    return [...common, 'infinite_retry'];
  }
  if (classification === 'receipt_conflict') {
    return [...common, 'overwrite_existing_truth', 'silent_closeout_overwrite'];
  }
  return common;
}

function operatorLabel(
  classification: FamilyConflictClassification,
  authority: string,
  status: FamilyConflictStatus,
) {
  if (classification === 'duplicate_task') {
    return '已合并重复任务';
  }
  if (classification === 'authority_conflict') {
    return `等待 ${displayAuthority(authority)} 判断`;
  }
  if (classification === 'evidence_blocker' || classification === 'identity_incomplete') {
    return '证据不足，不能继续交付';
  }
  if (classification === 'quality_blocker') {
    return `等待 ${displayAuthority(authority)} 质量门`;
  }
  if (classification === 'human_gate') {
    return '等待用户确认';
  }
  if (classification === 'execution_retryable') {
    return status === 'dead_lettered' ? '已重试用尽，进入待处理' : '可恢复失败，等待重试';
  }
  return '回执冲突，已停止覆盖';
}

function automaticRetry(classification: FamilyConflictClassification, status: FamilyConflictStatus) {
  if (classification !== 'execution_retryable') {
    return 'not_applicable' as const;
  }
  return status === 'dead_lettered' ? 'exhausted' as const : 'available' as const;
}

function userActionRequired(classification: FamilyConflictClassification, status: FamilyConflictStatus) {
  if (classification === 'human_gate') {
    return 'approval_or_resume_signal';
  }
  if (status === 'dead_lettered' || status === 'conflict_fail_closed') {
    return 'operator_review';
  }
  return null;
}

function authorityForSubject(subject: FamilyConflictSubject, fallback?: string) {
  return normalizedString(fallback, subject.domain);
}

function subjectEvidenceRefs(subject: FamilyConflictSubject) {
  return uniqueStrings([
    subject.stage_attempt_id ? `opl://stage_attempts/${subject.stage_attempt_id}` : '',
    subject.task_id ? `opl://family_runtime_tasks/${subject.task_id}` : '',
    ...(subject.source_refs ?? []),
  ]);
}

export function buildFamilyConflictSubject(input: {
  domain: string;
  stageId: string;
  taskKind?: string | null;
  sourceFingerprint?: string | null;
  idempotencyKey?: string | null;
  stageAttemptId?: string | null;
  taskId?: string | null;
  sourceRefs?: string[];
}): FamilyConflictSubject {
  return {
    domain: normalizedString(input.domain, missingField('domain')),
    stage_id: normalizedString(input.stageId, missingField('stage_id')),
    task_kind: normalizedString(input.taskKind, normalizedString(input.stageId, missingField('task_kind'))),
    source_fingerprint: normalizedString(input.sourceFingerprint, missingField('source_fingerprint')),
    idempotency_key: normalizedString(input.idempotencyKey, missingField('idempotency_key')),
    stage_attempt_id: input.stageAttemptId ?? null,
    task_id: input.taskId ?? null,
    source_refs: uniqueStrings(input.sourceRefs ?? []),
  };
}

function identityIncompleteFields(subject: FamilyConflictSubject) {
  return (['domain', 'stage_id', 'task_kind', 'source_fingerprint', 'idempotency_key'] as const).filter((field) => {
    const value = subject[field];
    return !value || value.startsWith('missing:');
  });
}

export function buildFamilyConflictOrBlockerEnvelope(
  input: BuildEnvelopeInput,
): FamilyConflictOrBlockerEnvelope {
  const status = input.status ?? defaultStatus(input.classification);
  const owner = input.owner ?? defaultOwner(input.classification);
  const authority = authorityForSubject(input.subject, input.authority);
  return {
    kind: FAMILY_CONFLICT_OR_BLOCKER_KIND,
    subject: input.subject,
    identity: input.subject,
    classification: input.classification,
    owner,
    authority,
    status,
    reason: normalizedString(input.reason, input.classification),
    evidence_refs: uniqueStrings([
      ...subjectEvidenceRefs(input.subject),
      ...(input.evidenceRefs ?? []),
    ]),
    allowed_next_actions: uniqueStrings(input.allowedNextActions ?? defaultAllowedNextActions(input.classification, status)),
    forbidden_actions: uniqueStrings(input.forbiddenActions ?? defaultForbiddenActions(input.classification)),
    operator_label: operatorLabel(input.classification, authority, status),
    operator_questions: {
      duplicate_task: input.classification === 'duplicate_task',
      current_blocker: normalizedString(input.reason, input.classification),
      authority_owner: authority,
      automatic_retry: automaticRetry(input.classification, status),
      user_action_required: userActionRequired(input.classification, status),
    },
    authority_boundary: {
      opl: 'route_project_audit_only',
      domain: 'truth_quality_artifact_gate_owner',
      provider_completion_is_domain_ready: false,
      can_write_domain_truth: false,
      can_fallback_complete: false,
    },
    ...(input.failClosed ? { fail_closed: true as const } : {}),
  };
}

export function buildDuplicateTaskEnvelope(input: {
  subject: FamilyConflictSubject;
  existingAttemptRef?: string | null;
}) {
  return buildFamilyConflictOrBlockerEnvelope({
    subject: input.subject,
    classification: 'duplicate_task',
    owner: 'opl_runtime',
    authority: 'opl_runtime',
    status: 'deduplicated',
    reason: 'source_fingerprint_and_idempotency_key_matched_existing_attempt',
    evidenceRefs: input.existingAttemptRef ? [input.existingAttemptRef] : [],
    allowedNextActions: ['inspect_existing_attempt'],
    forbiddenActions: ['create_duplicate_attempt', 'fallback_complete'],
  });
}

export function buildReceiptConflictEnvelope(input: {
  subject: FamilyConflictSubject;
  reason: string;
  evidenceRefs?: string[];
}) {
  return buildFamilyConflictOrBlockerEnvelope({
    subject: input.subject,
    classification: 'receipt_conflict',
    owner: 'opl_runtime',
    authority: 'opl_runtime',
    status: 'conflict_fail_closed',
    reason: input.reason,
    evidenceRefs: input.evidenceRefs,
    failClosed: true,
  });
}

function blockerClassification(reason: string): FamilyConflictClassification {
  const normalized = reason.toLowerCase();
  if (
    normalized.includes('codex_cli_unsupported_function_call')
    || normalized.includes('unsupported_tool_protocol')
  ) {
    return 'execution_retryable';
  }
  if (normalized.includes('quality')) {
    return 'quality_blocker';
  }
  if (
    normalized.includes('authority')
    || normalized.includes('forbidden_write')
    || normalized.includes('domain_forbidden_write')
    || normalized.includes('truth_write')
  ) {
    return 'authority_conflict';
  }
  return 'evidence_blocker';
}

function rejectedWriteReason(entry: JsonRecord, index: number) {
  return normalizedString(entry.reason, `rejected_write_${index}`);
}

export function canonicalOutcomeForStageAttempt(input: {
  attemptStatus: string;
  closeoutRefs?: string[];
  closeoutReceiptStatus?: string | null;
}) {
  if (input.closeoutReceiptStatus === 'receipt_conflict') {
    return 'conflict_fail_closed' satisfies FamilyAttemptCanonicalOutcome;
  }
  if (input.attemptStatus === 'completed') {
    return input.closeoutReceiptStatus === 'accepted_typed_closeout'
      ? 'completed_with_receipt' satisfies FamilyAttemptCanonicalOutcome
      : 'completed_with_quality_debt' satisfies FamilyAttemptCanonicalOutcome;
  }
  if (input.attemptStatus === 'human_gate') {
    return 'waiting_for_human' satisfies FamilyAttemptCanonicalOutcome;
  }
  if (input.attemptStatus === 'dead_lettered') {
    return 'dead_lettered' satisfies FamilyAttemptCanonicalOutcome;
  }
  if (input.attemptStatus === 'failed') {
    return 'retry_scheduled' satisfies FamilyAttemptCanonicalOutcome;
  }
  return 'blocked' satisfies FamilyAttemptCanonicalOutcome;
}

export function buildStageAttemptConflictOrBlockerEnvelopes(input: StageAttemptEnvelopeInput) {
  const envelopes: FamilyConflictOrBlockerEnvelope[] = [];
  const missingFields = identityIncompleteFields(input.subject);
  if (missingFields.length > 0) {
    envelopes.push(buildFamilyConflictOrBlockerEnvelope({
      subject: input.subject,
      classification: 'identity_incomplete',
      owner: 'opl_runtime',
      authority: 'opl_runtime',
      status: 'blocked',
      reason: `identity_incomplete:${missingFields.join(',')}`,
      evidenceRefs: missingFields.map((field) => `identity:${field}`),
      allowedNextActions: ['repair_identity', 'request_human_review'],
      forbiddenActions: ['fallback_complete', 'write_domain_truth', 'mark_domain_ready'],
    }));
  }

  if ((input.humanGateRefs?.length ?? 0) > 0 || (input.humanGateLedger?.length ?? 0) > 0 || input.attemptStatus === 'human_gate') {
    envelopes.push(buildFamilyConflictOrBlockerEnvelope({
      subject: input.subject,
      classification: 'human_gate',
      owner: 'human',
      authority: 'human',
      status: 'waiting_for_human',
      reason: 'human_gate_waiting_for_approval',
      evidenceRefs: input.humanGateRefs ?? [],
    }));
  }

  if (input.attemptStatus === 'dead_lettered') {
    envelopes.push(buildFamilyConflictOrBlockerEnvelope({
      subject: input.subject,
      classification: 'execution_retryable',
      owner: 'infrastructure',
      authority: 'opl_runtime',
      status: 'dead_lettered',
      reason: normalizedString(input.blockedReason, 'retry_budget_exhausted'),
      evidenceRefs: [
        ...(input.deadLetter ? [`opl://family_runtime_tasks/${QUEUE_PROJECTION_VOCABULARY.deadLetter}`] : []),
      ],
    }));
  } else if (input.attemptStatus === 'failed') {
    envelopes.push(buildFamilyConflictOrBlockerEnvelope({
      subject: input.subject,
      classification: 'execution_retryable',
      owner: 'infrastructure',
      authority: 'opl_runtime',
      status: 'retry_scheduled',
      reason: normalizedString(input.blockedReason, 'execution_failed_retry_available'),
    }));
  }

  if (input.blockedReason && input.attemptStatus !== 'dead_lettered') {
    const classification = blockerClassification(input.blockedReason);
    envelopes.push(buildFamilyConflictOrBlockerEnvelope({
      subject: input.subject,
      classification,
      owner: classification === 'execution_retryable'
        ? 'infrastructure'
        : classification === 'authority_conflict'
          ? 'domain_agent'
          : 'domain_agent',
      authority: classification === 'execution_retryable' ? 'opl_runtime' : undefined,
      status: classification === 'execution_retryable' ? 'retry_scheduled' : 'blocked',
      reason: input.blockedReason,
    }));
  }

  (input.rejectedWrites ?? []).forEach((entry, index) => {
    envelopes.push(buildFamilyConflictOrBlockerEnvelope({
      subject: input.subject,
      classification: 'authority_conflict',
      owner: 'domain_agent',
      status: 'blocked',
      reason: rejectedWriteReason(entry, index),
      evidenceRefs: [
        ...Object.values(entry).filter((value): value is string => typeof value === 'string' && value.includes(':')),
      ],
    }));
  });

  if (input.domainReadyVerdict === 'domain_gate_pending' && input.attemptStatus === 'completed') {
    envelopes.push(buildFamilyConflictOrBlockerEnvelope({
      subject: input.subject,
      classification: 'evidence_blocker',
      owner: 'domain_agent',
      status: 'blocked',
      reason: 'domain_owner_verdict_pending',
      evidenceRefs: input.closeoutRefs ?? [],
    }));
  }

  if (input.closeoutReceiptStatus === 'receipt_conflict') {
    envelopes.push(buildReceiptConflictEnvelope({
      subject: input.subject,
      reason: 'stage_attempt_closeout_receipt_conflict',
      evidenceRefs: input.closeoutRefs,
    }));
  }

  const seen = new Set<string>();
  return envelopes.filter((envelope) => {
    const key = `${envelope.classification}:${envelope.status}:${envelope.reason}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
