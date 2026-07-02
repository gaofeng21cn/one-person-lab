import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
import type { AgentLabSuite, AgentLabTaskManifest } from './agent-lab.ts';
import { stableId } from '../runway/family-runtime-ids.ts';

type JsonRecord = Record<string, unknown>;

type AheEvidenceStatus =
  | 'ready_for_review'
  | 'review_pending'
  | 'typed_blocker';

type AheRefField =
  | 'change_evaluation_refs'
  | 'predicted_impact_refs'
  | 'failure_evidence_refs'
  | 'root_cause_refs'
  | 'targeted_fix_refs'
  | 'risk_task_refs'
  | 'next_run_falsification_refs';

const AHE_REF_FIELDS: AheRefField[] = [
  'change_evaluation_refs',
  'predicted_impact_refs',
  'failure_evidence_refs',
  'root_cause_refs',
  'targeted_fix_refs',
  'risk_task_refs',
  'next_run_falsification_refs',
];

const REQUIRED_AHE_REF_FIELDS: AheRefField[] = [
  'change_evaluation_refs',
  'failure_evidence_refs',
  'root_cause_refs',
  'targeted_fix_refs',
  'next_run_falsification_refs',
];

const ADVISORY_ONLY_REF_PREFIXES = [
  'fixture:',
  'generated:',
  'suite-pass:',
  'suite-result:',
  'scorecard:',
  'quality-scorecard:',
  'harness-pass:',
  'schema-complete:',
  'schema-completeness:',
  'provider-completion:',
];

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function refList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return unique(value.filter((entry): entry is string => typeof entry === 'string'));
}

function recordRefs(record: unknown, field: AheRefField) {
  return isRecord(record) ? refList(record[field]) : [];
}

function nestedAheEvidence(record: unknown) {
  if (!isRecord(record)) {
    return null;
  }
  const candidates = [
    record.ahe_evidence,
    record.ahe_evidence_refs,
    record.evidence,
    record.falsification,
    record.falsification_refs,
  ];
  return candidates.find(isRecord) ?? null;
}

function refsForField(task: AgentLabTaskManifest, resultRecord: JsonRecord | null, field: AheRefField) {
  return unique([
    ...recordRefs(task, field),
    ...recordRefs(task.mechanism_evolution_inputs, field),
    ...recordRefs(nestedAheEvidence(task.mechanism_evolution_inputs), field),
    ...recordRefs(resultRecord, field),
    ...recordRefs(nestedAheEvidence(resultRecord), field),
  ]);
}

function advisoryOnlyRefs(refs: string[]) {
  return refs.filter((ref) =>
    ADVISORY_ONLY_REF_PREFIXES.some((prefix) => ref.startsWith(prefix))
    || ref.includes('/fixture/')
    || ref.includes('/generated/')
    || ref.includes('/suite-pass/')
    || ref.includes('suite_pass'));
}

function missingRequiredFields(refsByField: Record<AheRefField, string[]>) {
  return REQUIRED_AHE_REF_FIELDS.filter((field) => refsByField[field].length === 0);
}

function reviewPendingFields(refsByField: Record<AheRefField, string[]>) {
  return AHE_REF_FIELDS.filter((field) =>
    refsByField[field].length > 0
    && refsByField[field].every((ref) => advisoryOnlyRefs([ref]).length > 0));
}

function resultRecordForTask(resultByTaskId: ReadonlyMap<string, unknown>, taskId: string) {
  const result = resultByTaskId.get(taskId);
  return isRecord(result) ? result : null;
}

export function buildAgentLabAheEvidenceReadModel(input: {
  suite: AgentLabSuite;
  results?: unknown[];
}) {
  const resultByTaskId = new Map<string, unknown>();
  for (const result of input.results ?? []) {
    if (isRecord(result) && typeof result.task_id === 'string') {
      resultByTaskId.set(result.task_id, result);
    }
  }

  const tasks = input.suite.tasks.map((task) => {
    const resultRecord = resultRecordForTask(resultByTaskId, task.task_id);
    const refsByField = Object.fromEntries(AHE_REF_FIELDS.map((field) => [
      field,
      refsForField(task, resultRecord, field),
    ])) as Record<AheRefField, string[]>;
    const missing = missingRequiredFields(refsByField);
    const reviewPending = reviewPendingFields(refsByField);
    const allRefs = unique(AHE_REF_FIELDS.flatMap((field) => refsByField[field]));
    const advisoryRefs = advisoryOnlyRefs(allRefs);
    const blocker = missing.length > 0
      ? {
          blocker_kind: 'ahe_evidence_refs_missing',
          blocker_id: stableId('oalaheb', [input.suite.suite_id, task.task_id, missing]),
          missing_ref_fields: missing,
          refs: allRefs,
        }
      : null;
    const status: AheEvidenceStatus = blocker
      ? 'typed_blocker'
      : reviewPending.length > 0
        ? 'review_pending'
        : 'ready_for_review';

    return {
      task_id: task.task_id,
      domain_id: task.domain_id,
      status,
      read_model_ref: stableId('oalahe', [input.suite.suite_id, task.task_id, refsByField]),
      ...refsByField,
      missing_required_ref_fields: missing,
      review_pending_ref_fields: reviewPending,
      advisory_only_refs: advisoryRefs,
      promotion_authorization: {
        authorized: false,
        reason: 'ahe_evidence_read_model_is_falsification_input_only',
        fixture_generated_or_suite_pass_refs_are_advisory_only: advisoryRefs.length > 0,
      },
      typed_blocker: blocker,
      authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
    };
  });

  return {
    surface_kind: 'opl_agent_lab_ahe_evidence_read_model',
    version: 'opl-agent-lab.v1.ahe-evidence',
    read_model_id: stableId('oalahem', [
      input.suite.suite_id,
      tasks.map((task) => task.read_model_ref),
      tasks.map((task) => task.status),
    ]),
    suite_id: input.suite.suite_id,
    status: tasks.some((task) => task.status === 'typed_blocker')
      ? 'typed_blocker'
      : tasks.some((task) => task.status === 'review_pending')
        ? 'review_pending'
        : 'ready_for_review',
    refs_only: true,
    required_ref_fields: REQUIRED_AHE_REF_FIELDS,
    optional_ref_fields: AHE_REF_FIELDS.filter((field) => !REQUIRED_AHE_REF_FIELDS.includes(field)),
    tasks,
    summary: {
      task_count: tasks.length,
      typed_blocker_count: tasks.filter((task) => task.status === 'typed_blocker').length,
      review_pending_count: tasks.filter((task) => task.status === 'review_pending').length,
      ready_for_review_count: tasks.filter((task) => task.status === 'ready_for_review').length,
      promotion_authorized_count: 0,
    },
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}
