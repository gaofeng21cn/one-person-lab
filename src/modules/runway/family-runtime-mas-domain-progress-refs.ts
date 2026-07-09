import {
  stringList as sharedStringList,
  stringValue,
  uniqueStringList,
  type JsonRecord,
} from '../../kernel/json-record.ts';
import { OBSERVABILITY_COMPAT_PAPER_EVIDENCE_LEDGER_FILE } from '../../kernel/observability-projection-vocabulary.ts';

export const MAS_DOMAIN_PROGRESS_REFS_COMPATIBILITY_PROFILE = {
  profile_id: 'medautoscience.domain_progress_refs.compatibility.v1',
  profile_role: 'domain_owned_compatibility_profile',
  source_domain: 'medautoscience',
  domain_truth_owner: 'med-autoscience',
  compatibility_only: true,
  canonical_projection: 'domain_progress_refs',
  exclude_path_fragments: [
    '/artifacts/supervision/consumer/default_executor_execution/',
    '/artifacts/supervision/consumer/default_executor_dispatches/',
    '/artifacts/supervision/consumer/stage_attempt_closeouts/',
  ],
  include_path_fragments: [
    '/artifacts/controller/repair_execution_evidence/',
    '/artifacts/controller/repair_execution_receipts/',
    '/artifacts/controller/quality_repair_batch/',
    '/artifacts/controller/gate_clearing_batch/',
    '/artifacts/controller/gate_replay_requests/',
    '/artifacts/publication_eval/ai_reviewer_responses/',
    '/artifacts/reports/publishability_gate/',
    '/paper/draft.md',
    '/paper/build/review_manuscript.md',
    OBSERVABILITY_COMPAT_PAPER_EVIDENCE_LEDGER_FILE,
    '/paper/claim_evidence_map.json',
    '/paper/review/review_ledger.json',
  ],
} as const;

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
  if (MAS_DOMAIN_PROGRESS_REFS_COMPATIBILITY_PROFILE.exclude_path_fragments.some((fragment) =>
    normalizedPath.includes(fragment)
  )) {
    return false;
  }
  return MAS_DOMAIN_PROGRESS_REFS_COMPATIBILITY_PROFILE.include_path_fragments.some((fragment) =>
    normalizedPath.includes(fragment)
  );
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
