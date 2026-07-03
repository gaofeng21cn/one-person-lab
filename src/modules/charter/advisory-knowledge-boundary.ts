import { stringValue, type JsonRecord } from '../../kernel/json-record.ts';

export type AdvisoryGateIntent = 'context' | 'advisory_check' | 'claim_gate' | 'authority_gate';

export type AdvisoryKnowledgeSignal = {
  signal_id?: string;
  gate_intent?: string;
  role?: string;
  title?: string;
  source_ref?: string;
  blocking_claim?: string;
  owner_ref_or_authority_ref?: string;
  refs?: string[];
  metadata?: JsonRecord;
};

export type AdvisoryKnowledgeProjectionItem = {
  signal_id: string;
  gate_intent: AdvisoryGateIntent;
  role: string;
  title: string;
  source_ref: string | null;
  refs: string[];
  blocking_claim?: string;
  owner_ref_or_authority_ref?: string;
  missing_required_fields?: string[];
  metadata?: JsonRecord;
};

export type AdvisoryKnowledgeOperatorProjection = {
  surface_kind: 'opl_advisory_knowledge_operator_projection';
  version: 'opl-advisory-knowledge-operator-projection.v1';
  projection_role: 'three_column_operator_boundary';
  reference_suggestions: AdvisoryKnowledgeProjectionItem[];
  soft_gaps: AdvisoryKnowledgeProjectionItem[];
  hard_owner_gates: AdvisoryKnowledgeProjectionItem[];
  counts: {
    reference_suggestion_count: number;
    soft_gap_count: number;
    hard_owner_gate_count: number;
    blocking_count: number;
  };
  authority_boundary: {
    projection_only: true;
    can_write_domain_truth: false;
    can_write_memory_body: false;
    can_accept_or_reject_writeback: false;
    can_sign_owner_receipt: false;
    can_create_typed_blocker: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_or_export_verdict: false;
  };
};

const KNOWN_INTENTS = new Set<AdvisoryGateIntent>([
  'context',
  'advisory_check',
  'claim_gate',
  'authority_gate',
]);

const HARD_GATE_REQUIRED_FIELDS = [
  'blocking_claim',
  'source_ref',
  'owner_ref_or_authority_ref',
] as const;

function normalizeIntent(value: unknown): AdvisoryGateIntent {
  const candidate = stringValue(value) as AdvisoryGateIntent | null;
  return candidate && KNOWN_INTENTS.has(candidate) ? candidate : 'context';
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && stringValue(entry) !== null))];
}

function normalizeItem(signal: AdvisoryKnowledgeSignal, index: number): AdvisoryKnowledgeProjectionItem {
  const gateIntent = normalizeIntent(signal.gate_intent);
  const item: AdvisoryKnowledgeProjectionItem = {
    signal_id: stringValue(signal.signal_id) ?? `advisory-signal-${index}`,
    gate_intent: gateIntent,
    role: stringValue(signal.role) ?? gateIntent,
    title: stringValue(signal.title) ?? stringValue(signal.signal_id) ?? `Advisory signal ${index + 1}`,
    source_ref: stringValue(signal.source_ref),
    refs: stringList(signal.refs),
    ...(stringValue(signal.blocking_claim) ? { blocking_claim: stringValue(signal.blocking_claim)! } : {}),
    ...(stringValue(signal.owner_ref_or_authority_ref)
      ? { owner_ref_or_authority_ref: stringValue(signal.owner_ref_or_authority_ref)! }
      : {}),
    ...(signal.metadata && typeof signal.metadata === 'object' && !Array.isArray(signal.metadata)
      ? { metadata: { ...signal.metadata } }
      : {}),
  };
  if (gateIntent === 'claim_gate' || gateIntent === 'authority_gate') {
    const missing = HARD_GATE_REQUIRED_FIELDS.filter((field) => !stringValue(signal[field]));
    if (missing.length > 0) {
      item.missing_required_fields = missing;
    }
  }
  return item;
}

export function buildAdvisoryKnowledgeOperatorProjection(
  signals: AdvisoryKnowledgeSignal[],
): AdvisoryKnowledgeOperatorProjection {
  const referenceSuggestions: AdvisoryKnowledgeProjectionItem[] = [];
  const softGaps: AdvisoryKnowledgeProjectionItem[] = [];
  const hardOwnerGates: AdvisoryKnowledgeProjectionItem[] = [];

  signals.map(normalizeItem).forEach((item) => {
    if (item.gate_intent === 'context') {
      referenceSuggestions.push(item);
      return;
    }
    if (item.gate_intent === 'advisory_check') {
      softGaps.push(item);
      return;
    }
    hardOwnerGates.push(item);
  });

  return {
    surface_kind: 'opl_advisory_knowledge_operator_projection',
    version: 'opl-advisory-knowledge-operator-projection.v1',
    projection_role: 'three_column_operator_boundary',
    reference_suggestions: referenceSuggestions,
    soft_gaps: softGaps,
    hard_owner_gates: hardOwnerGates,
    counts: {
      reference_suggestion_count: referenceSuggestions.length,
      soft_gap_count: softGaps.length,
      hard_owner_gate_count: hardOwnerGates.length,
      blocking_count: hardOwnerGates.length,
    },
    authority_boundary: {
      projection_only: true,
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_accept_or_reject_writeback: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_or_export_verdict: false,
    },
  };
}
