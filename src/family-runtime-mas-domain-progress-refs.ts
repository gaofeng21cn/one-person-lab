type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function uniqueStrings(values: Array<string | null>) {
  return [...new Set(values.filter((entry): entry is string => Boolean(entry)))];
}

function refsFrom(recordValue: JsonRecord, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => stringList(recordValue[key])));
}

export function isMasDomainProgressRef(ref: string) {
  const normalized = ref.toLowerCase().trim();
  if (!normalized) {
    return false;
  }
  const normalizedPath = normalized.startsWith('/') ? normalized : `/${normalized}`;
  if (normalizedPath.includes('/artifacts/supervision/consumer/default_executor_execution/')) {
    return false;
  }
  if (normalizedPath.includes('/artifacts/supervision/consumer/default_executor_dispatches/')) {
    return false;
  }
  if (normalizedPath.includes('/artifacts/supervision/consumer/stage_attempt_closeouts/')) {
    return false;
  }
  if (normalizedPath.includes('/artifacts/controller/repair_execution_evidence/')) {
    return true;
  }
  if (normalizedPath.includes('/artifacts/controller/repair_execution_receipts/')) {
    return true;
  }
  if (normalizedPath.includes('/artifacts/controller/quality_repair_batch/')) {
    return true;
  }
  if (normalizedPath.includes('/artifacts/controller/gate_clearing_batch/')) {
    return true;
  }
  if (normalizedPath.includes('/artifacts/controller/gate_replay_requests/')) {
    return true;
  }
  if (normalizedPath.includes('/artifacts/publication_eval/ai_reviewer_responses/')) {
    return true;
  }
  if (normalizedPath.includes('/artifacts/reports/publishability_gate/')) {
    return true;
  }
  if (normalizedPath.includes('/paper/draft.md')) {
    return true;
  }
  if (normalizedPath.includes('/paper/build/review_manuscript.md')) {
    return true;
  }
  if (normalizedPath.includes('/paper/evidence_ledger.json')) {
    return true;
  }
  if (normalizedPath.includes('/paper/claim_evidence_map.json')) {
    return true;
  }
  if (normalizedPath.includes('/paper/review/review_ledger.json')) {
    return true;
  }
  return false;
}

export function masDomainProgressRefsFromRecord(recordValue: JsonRecord) {
  const refs = refsFrom(recordValue, [
    'domain_progress_refs',
    'domain_owner_progress_refs',
    'mas_domain_progress_refs',
    'changed_artifact_refs',
    'changed_paper_refs',
    'closeout_refs',
    'owner_receipt_refs',
    'domain_owner_receipt_refs',
  ]);
  return refs.filter(isMasDomainProgressRef);
}

export function hasMasDomainProgressEvidence(recordValue: unknown) {
  return isRecord(recordValue) && masDomainProgressRefsFromRecord(recordValue).length > 0;
}
