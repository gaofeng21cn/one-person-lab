import {
  stringList as sharedStringList,
  stringValue,
  uniqueStringList,
  type JsonRecord,
} from '../../kernel/json-record.ts';
import { OBSERVABILITY_PAPER_EVIDENCE_LEDGER_FILE } from '../../kernel/observability-projection-vocabulary.ts';

function stringList(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return sharedStringList(value);
}

function refsFrom(recordValue: JsonRecord, keys: string[]) {
  return uniqueStringList(keys.flatMap((key) => stringList(recordValue[key])));
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
  if (normalizedPath.includes(OBSERVABILITY_PAPER_EVIDENCE_LEDGER_FILE)) {
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
