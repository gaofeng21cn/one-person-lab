export type JsonRecord = Record<string, unknown>;

export type EvidenceTailStatus = 'open' | 'closed' | 'domain_owned_typed_blocker';

export type EvidenceRequirement = {
  requirement_id: string;
  requirement_kind: string;
  status: EvidenceTailStatus;
  owner: string;
  domain_id: string;
  stage_id: string | null;
  request_id: string | null;
  claim_scope: string;
  required_receipt_type: string;
  current_ref: string | null;
  next_safe_action_route: string | null;
  receipt_ref: string | null;
  receipt_refs: string[];
  typed_blocker_ref: string | null;
  typed_blocker_refs: string[];
  replay_ref: string | null;
  freshness_ref: string | null;
  freshness_refs: string[];
  evidence_refs: string[];
  expected_refs: string[];
  next_verification_command: string | null;
  not_authorized_claims: string[];
  requirement_is_completion_claim: false;
  can_claim_domain_ready: false;
  can_claim_production_ready: false;
  can_claim_artifact_authority: false;
};

export type EvidenceTailItem = EvidenceRequirement & {
  tail_id: string;
  tail_item: string;
  owner_group: string;
  domain_owner: string;
  evidence_ref: string | null;
  doc_ref: string | null;
  not_authorized_claims: string[];
  blocking_policy: string;
  authority_boundary: JsonRecord;
  evidence_requirement_model: string;
  evidence_requirement: EvidenceRequirement;
};

export const EVIDENCE_REQUIREMENT_MODEL_VERSION = 'evidence_requirement.v1';

export const DEFAULT_EVIDENCE_NOT_AUTHORIZED_CLAIMS = [
  'domain_ready',
  'quality_verdict',
  'artifact_authority',
  'memory_body_access',
  'production_ready',
];

export function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

export function firstString(...values: unknown[]) {
  for (const value of values) {
    const direct = stringValue(value);
    if (direct) {
      return direct;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        const nested = stringValue(entry);
        if (nested) {
          return nested;
        }
        if (isRecord(entry)) {
          const ref = stringValue(entry.ref) ?? stringValue(entry.source_ref);
          if (ref) {
            return ref;
          }
        }
      }
    }
  }
  return null;
}

export function normalizeEvidenceTailStatus(status: string | null): EvidenceTailStatus {
  if (status === 'closed' || status === 'closed_by_receipt_ref') {
    return 'closed';
  }
  if (status === 'domain_owned_typed_blocker' || status === 'closed_by_domain_owned_typed_blocker') {
    return 'domain_owned_typed_blocker';
  }
  return 'open';
}

export function evidenceTailAuthorityBoundary(extra: JsonRecord = {}) {
  return {
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    can_claim_artifact_authority: false,
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact: false,
    ...extra,
  };
}

export function evidenceRequirementFromTailItem(item: JsonRecord): EvidenceRequirement {
  const nested = isRecord(item.evidence_requirement) ? item.evidence_requirement : {};
  const owner = firstString(nested.owner, item.owner, item.owner_group, item.domain_owner) ?? 'one-person-lab';
  const domainId = firstString(nested.domain_id, item.domain_id, item.domain, item.domain_owner, item.owner_group)
    ?? owner;
  const tailId = firstString(item.tail_id, item.item_id, nested.requirement_id) ?? `${owner}:evidence_requirement`;
  const tailItem = firstString(item.tail_item, nested.requirement_kind) ?? 'production_evidence_tail';
  const receiptRefs = [
    ...stringList(nested.receipt_refs),
    ...stringList(item.receipt_refs),
    firstString(nested.receipt_ref, item.receipt_ref),
  ].filter((entry): entry is string => Boolean(entry));
  const typedBlockerRefs = [
    ...stringList(nested.typed_blocker_refs),
    ...stringList(item.typed_blocker_refs),
    firstString(nested.typed_blocker_ref, item.typed_blocker_ref),
  ].filter((entry): entry is string => Boolean(entry));
  const evidenceRefs = [
    ...stringList(nested.evidence_refs),
    ...stringList(item.evidence_refs),
    ...stringList(item.required_evidence_refs),
    firstString(item.evidence_ref),
  ].filter((entry): entry is string => Boolean(entry));
  const expectedRefs = [
    ...stringList(nested.expected_refs),
    ...stringList(item.expected_refs),
    ...stringList(item.required_evidence_refs),
  ];
  const freshnessRefs = [
    ...stringList(nested.freshness_refs),
    ...stringList(item.freshness_refs),
    firstString(nested.freshness_ref, item.freshness_ref),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    requirement_id: tailId,
    requirement_kind: tailItem,
    status: normalizeEvidenceTailStatus(firstString(nested.status, item.status)),
    owner,
    domain_id: domainId,
    stage_id: firstString(nested.stage_id, item.stage_id),
    request_id: firstString(nested.request_id, item.request_id, item.gate_id),
    claim_scope: firstString(nested.claim_scope, item.claim_scope, item.tail_item) ?? tailItem,
    required_receipt_type:
      firstString(nested.required_receipt_type, item.required_receipt_type, item.required_receipt_shape)
      ?? 'declared_owner_receipt_or_typed_blocker',
    current_ref: firstString(
      nested.current_ref,
      item.current_ref,
      item.receipt_ref,
      item.typed_blocker_ref,
      item.evidence_ref,
      item.replay_ref,
      item.freshness_ref,
      item.doc_ref,
      item.expected_refs,
      item.evidence_refs,
      item.required_evidence_refs,
    ),
    next_safe_action_route: firstString(nested.next_safe_action_route, item.next_safe_action_route),
    receipt_ref: firstString(nested.receipt_ref, item.receipt_ref, receiptRefs),
    receipt_refs: receiptRefs,
    typed_blocker_ref: firstString(nested.typed_blocker_ref, item.typed_blocker_ref, typedBlockerRefs),
    typed_blocker_refs: typedBlockerRefs,
    replay_ref: firstString(nested.replay_ref, item.replay_ref),
    freshness_ref: firstString(nested.freshness_ref, item.freshness_ref, freshnessRefs),
    freshness_refs: freshnessRefs,
    evidence_refs: evidenceRefs,
    expected_refs: expectedRefs,
    next_verification_command:
      firstString(nested.next_verification_command, item.next_verification_command),
    not_authorized_claims: [
      ...new Set([
        ...stringList(nested.not_authorized_claims),
        ...stringList(item.not_authorized_claims),
        ...DEFAULT_EVIDENCE_NOT_AUTHORIZED_CLAIMS,
      ]),
    ],
    requirement_is_completion_claim: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    can_claim_artifact_authority: false,
  };
}

export function evidenceTailItem(input: {
  tailId: string;
  tailItem: string;
  status: string;
  ownerGroup: string;
  claimScope: string;
  blockingPolicy: string;
  domainId?: string | null;
  stageId?: string | null;
  requestId?: string | null;
  requiredReceiptType?: string | null;
  currentRef?: string | null;
  nextSafeActionRoute?: string | null;
  receiptRef?: string | null;
  receiptRefs?: string[];
  typedBlockerRef?: string | null;
  typedBlockerRefs?: string[];
  replayRef?: string | null;
  freshnessRef?: string | null;
  freshnessRefs?: string[];
  evidenceRefs?: string[];
  expectedRefs?: string[];
  evidenceRef?: string | null;
  docRef?: string | null;
  nextVerificationCommand?: string | null;
  notAuthorizedClaims?: string[];
  authorityBoundary?: JsonRecord;
  extra?: JsonRecord;
}): EvidenceTailItem {
  const domainId = input.domainId ?? input.ownerGroup;
  const requirement: EvidenceRequirement = {
    requirement_id: input.tailId,
    requirement_kind: input.tailItem,
    status: normalizeEvidenceTailStatus(input.status),
    owner: input.ownerGroup,
    domain_id: domainId,
    stage_id: input.stageId ?? null,
    request_id: input.requestId ?? null,
    claim_scope: input.claimScope,
    required_receipt_type: input.requiredReceiptType ?? 'declared_owner_receipt_or_typed_blocker',
    current_ref: input.currentRef ?? null,
    next_safe_action_route: input.nextSafeActionRoute ?? null,
    receipt_ref: input.receiptRef ?? null,
    receipt_refs: input.receiptRefs ?? [],
    typed_blocker_ref: input.typedBlockerRef ?? null,
    typed_blocker_refs: input.typedBlockerRefs ?? [],
    replay_ref: input.replayRef ?? null,
    freshness_ref: input.freshnessRef ?? null,
    freshness_refs: input.freshnessRefs ?? [],
    evidence_refs: input.evidenceRefs ?? [],
    expected_refs: input.expectedRefs ?? [],
    next_verification_command: input.nextVerificationCommand ?? null,
    not_authorized_claims: input.notAuthorizedClaims ?? [...DEFAULT_EVIDENCE_NOT_AUTHORIZED_CLAIMS],
    requirement_is_completion_claim: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    can_claim_artifact_authority: false,
  };
  return {
    ...requirement,
    ...(input.extra ?? {}),
    tail_id: input.tailId,
    tail_item: input.tailItem,
    owner_group: input.ownerGroup,
    owner: input.ownerGroup,
    domain_id: domainId,
    domain_owner: input.ownerGroup,
    stage_id: input.stageId ?? null,
    request_id: input.requestId ?? null,
    status: requirement.status,
    evidence_ref:
      input.evidenceRef ?? input.receiptRef ?? input.typedBlockerRef ?? input.evidenceRefs?.[0] ?? null,
    doc_ref: input.docRef ?? null,
    not_authorized_claims: input.notAuthorizedClaims ?? [...DEFAULT_EVIDENCE_NOT_AUTHORIZED_CLAIMS],
    blocking_policy: input.blockingPolicy,
    authority_boundary: evidenceTailAuthorityBoundary(input.authorityBoundary),
    evidence_requirement_model: EVIDENCE_REQUIREMENT_MODEL_VERSION,
    evidence_requirement: requirement,
  };
}
