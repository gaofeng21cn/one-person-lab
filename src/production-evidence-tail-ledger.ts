type JsonRecord = Record<string, unknown>;

export const PRODUCTION_EVIDENCE_TAIL_BLOCKING_POLICY =
  'production_evidence_tail_not_a_structural_conformance_stage_launch_or_artifact_authority_pass_condition';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function tailAuthorityBoundary(extra: JsonRecord = {}) {
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

function normalizeTailStatus(status: string | null) {
  if (status === 'closed') {
    return 'closed';
  }
  if (status === 'domain_owned_typed_blocker') {
    return 'domain_owned_typed_blocker';
  }
  return 'open';
}

function normalizedConformanceTailItem(item: JsonRecord, index: number) {
  const domainOwner = stringValue(item.domain_owner) ?? 'domain_repo';
  const status = normalizeTailStatus(stringValue(item.status));
  const tailId = stringValue(item.tail_id)
    ?? stringValue(item.tail_item)
    ?? `${domainOwner}:production_evidence_tail:${index + 1}`;
  return {
    tail_id: tailId,
    tail_item: stringValue(item.tail_item) ?? tailId,
    status,
    owner_group: domainOwner,
    repo_path: stringValue(item.repo_path),
    domain_owner: domainOwner,
    evidence_ref: stringValue(item.evidence_ref),
    doc_ref: stringValue(item.doc_ref),
    next_verification_command: stringValue(item.next_verification_command),
    blocking_policy: PRODUCTION_EVIDENCE_TAIL_BLOCKING_POLICY,
    authority_boundary: tailAuthorityBoundary({
      source_authority_boundary: isRecord(item.authority_boundary) ? item.authority_boundary : null,
    }),
  };
}

function summarizeTailItems(tailItems: JsonRecord[]) {
  const ownerGroups = new Set(tailItems.map((item) => stringValue(item.owner_group) ?? 'unknown'));
  return {
    tail_item_count: tailItems.length,
    open_tail_item_count: tailItems.filter((item) => stringValue(item.status) === 'open').length,
    closed_tail_item_count: tailItems.filter((item) => stringValue(item.status) === 'closed').length,
    typed_blocker_tail_item_count:
      tailItems.filter((item) => stringValue(item.status) === 'domain_owned_typed_blocker').length,
    blocking_tail_item_count: 0,
    owner_group_count: ownerGroups.size,
    blocking_policy: PRODUCTION_EVIDENCE_TAIL_BLOCKING_POLICY,
  };
}

function closureTailItem(input: {
  tailId: string;
  tailItem: string;
  status: 'open' | 'closed' | 'domain_owned_typed_blocker';
  ownerGroup: string;
  claimScope: string;
  receiptRef?: string | null;
  typedBlockerRef?: string | null;
  replayRef?: string | null;
  freshnessRef?: string | null;
  evidenceRefs?: string[];
  nextVerificationCommand?: string | null;
}) {
  return {
    tail_id: input.tailId,
    tail_item: input.tailItem,
    status: input.status,
    owner_group: input.ownerGroup,
    domain_owner: input.ownerGroup,
    claim_scope: input.claimScope,
    receipt_ref: input.receiptRef ?? null,
    typed_blocker_ref: input.typedBlockerRef ?? null,
    replay_ref: input.replayRef ?? null,
    freshness_ref: input.freshnessRef ?? null,
    evidence_refs: input.evidenceRefs ?? [],
    evidence_ref: input.receiptRef ?? input.typedBlockerRef ?? input.evidenceRefs?.[0] ?? null,
    next_verification_command: input.nextVerificationCommand ?? null,
    not_authorized_claims: [
      'domain_ready',
      'quality_verdict',
      'artifact_authority',
      'memory_body_access',
      'production_ready',
    ],
    blocking_policy: PRODUCTION_EVIDENCE_TAIL_BLOCKING_POLICY,
    authority_boundary: tailAuthorityBoundary({
      receipt_or_blocker_is_domain_owned_claim_only: true,
    }),
  };
}

export function buildConformanceProductionEvidenceTailLedger(conformanceReport: JsonRecord) {
  const reports = recordList(record(conformanceReport.standard_domain_agent_conformance).reports);
  const tailItems = reports.flatMap((report) =>
    recordList(record(report.evidence_tail_classification).tail_items)
      .map((item, index) => normalizedConformanceTailItem(item, index))
  );
  return {
    surface_kind: 'opl_production_evidence_tail_ledger',
    owner: 'one-person-lab',
    ledger_policy:
      'production_evidence_tail_is_reported_for_operator_attention_without_granting_domain_or_production_readiness',
    summary: summarizeTailItems(tailItems),
    tail_items: tailItems,
    authority_boundary: tailAuthorityBoundary(),
  };
}

export function buildAppDrilldownProductionEvidenceTailLedger(input: {
  providerContinuousProof: JsonRecord;
  stageAttempts?: JsonRecord[];
  appOperatorDrilldown?: JsonRecord;
}) {
  const providerKind = stringValue(input.providerContinuousProof.provider_kind) ?? 'temporal';
  const cadenceWindow = record(input.providerContinuousProof.cadence_window);
  const longWindowReady = cadenceWindow.long_window_evidence_ready === true;
  const missingReceiptCount = numberValue(cadenceWindow.missing_slo_execution_receipt_count);
  const providerTailItems = longWindowReady
    ? []
    : [{
        tail_id: `framework:provider:${providerKind}_long_soak_evidence`,
        tail_item: 'provider_long_window_slo_evidence',
        status: 'open',
        owner_group: 'one-person-lab',
        domain_owner: 'one-person-lab',
        evidence_ref: null,
        doc_ref: 'docs/active/production-framework-closure-gap-matrix.md#production_temporal_residency',
        next_verification_command: `opl family-runtime residency proof --provider ${providerKind} --production`,
        missing_receipt_count: missingReceiptCount,
        blocking_policy: PRODUCTION_EVIDENCE_TAIL_BLOCKING_POLICY,
        authority_boundary: tailAuthorityBoundary({
          provider_completion_can_claim_domain_ready: false,
          provider_history_can_claim_quality_verdict: false,
        }),
      }];
  const attemptTailItems = (input.stageAttempts ?? []).flatMap((attempt, index) => {
    const routeImpact = record(attempt.route_impact);
    const ownerReceiptRefs = [
      ...stringList(routeImpact.owner_receipt_refs),
      stringValue(routeImpact.owner_receipt_ref),
    ].filter((entry): entry is string => Boolean(entry));
    const typedBlockerRefs = [
      ...stringList(routeImpact.typed_blocker_refs),
      stringValue(routeImpact.typed_blocker_ref),
    ].filter((entry): entry is string => Boolean(entry));
    if (ownerReceiptRefs.length === 0 && typedBlockerRefs.length === 0) {
      return [];
    }
    const stageAttemptId = stringValue(attempt.stage_attempt_id) ?? `attempt:${index + 1}`;
    return [{
      tail_id: `stage_attempt:${stageAttemptId}:domain_owner_chain_evidence`,
      tail_item: 'stage_attempt_domain_owner_chain_evidence',
      status: typedBlockerRefs.length > 0 ? 'domain_owned_typed_blocker' : 'closed',
      owner_group: stringValue(attempt.domain_id) ?? 'domain_repo',
      domain_owner: stringValue(attempt.domain_id) ?? 'domain_repo',
      evidence_ref: ownerReceiptRefs[0] ?? typedBlockerRefs[0] ?? null,
      doc_ref: null,
      next_verification_command: `opl family-runtime attempt query ${stageAttemptId}`,
      owner_receipt_refs: ownerReceiptRefs,
      typed_blocker_refs: typedBlockerRefs,
      blocking_policy: PRODUCTION_EVIDENCE_TAIL_BLOCKING_POLICY,
      authority_boundary: tailAuthorityBoundary({
        owner_receipt_can_claim_domain_ready_for_opl: false,
        typed_blocker_can_claim_domain_ready_for_opl: false,
      }),
    }];
  });
  const drilldown = record(input.appOperatorDrilldown);
  const stageEvidence = record(drilldown.stage_production_evidence);
  const stageTailItems = recordList(stageEvidence.stages).flatMap((stage) => {
    const missing = stringList(stage.missing_production_evidence);
    if (missing.length === 0) {
      return [];
    }
    const domain = stringValue(stage.target_domain_id) ?? stringValue(stage.project_id) ?? 'domain_repo';
    const stageId = stringValue(stage.stage_id) ?? 'unknown_stage';
    const typedBlockerRefs = stringList(stage.typed_blocker_refs);
    const receiptRefs = stringList(stage.observed_expected_receipt_refs);
    return [closureTailItem({
      tailId: `stage:${domain}:${stageId}:production_evidence`,
      tailItem: 'stage_production_evidence',
      status: typedBlockerRefs.length > 0
        ? 'domain_owned_typed_blocker'
        : receiptRefs.length > 0
          ? 'closed'
          : 'open',
      ownerGroup: domain,
      claimScope: 'stage_production_caller_executor_receipt_monitor',
      receiptRef: receiptRefs[0],
      typedBlockerRef: typedBlockerRefs[0],
      replayRef: stringValue(stage.ref),
      freshnessRef: stringList(stage.monitor_freshness_refs)[0],
      evidenceRefs: [
        ...receiptRefs,
        ...typedBlockerRefs,
        ...stringList(stage.observed_evidence_refs),
      ],
      nextVerificationCommand: stringValue(stage.stage_id)
        ? `opl runtime app-operator-drilldown --detail full --json`
        : null,
    })];
  });
  const domainEvidence = record(drilldown.domain_evidence_request_refs);
  const externalTailItems = [
    ...recordList(domainEvidence.open_external_evidence_requests),
    ...recordList(domainEvidence.remaining_evidence_gates),
  ].map((item, index) => {
    const domain = stringValue(item.domain_id) ?? stringValue(item.owner) ?? 'domain_repo';
    const requestId = stringValue(item.request_id) ?? stringValue(item.gate_id) ?? `request:${index + 1}`;
    const typedBlockerRefs = stringList(item.typed_blocker_refs);
    const receiptRefs = [
      ...stringList(item.receipt_refs),
      ...stringList(item.domain_receipt_refs),
    ];
    return closureTailItem({
      tailId: `external:${domain}:${requestId}`,
      tailItem: 'external_evidence_or_gate_request',
      status: typedBlockerRefs.length > 0
        ? 'domain_owned_typed_blocker'
        : receiptRefs.length > 0
          ? 'closed'
          : 'open',
      ownerGroup: domain,
      claimScope: stringValue(item.gate_id) ? 'evidence_gate_receipt' : 'external_evidence_receipt',
      receiptRef: receiptRefs[0],
      typedBlockerRef: typedBlockerRefs[0],
      replayRef: stringValue(item.source_pointer) ?? stringValue(item.ref),
      freshnessRef: stringValue(item.freshness_ref),
      evidenceRefs: [
        ...receiptRefs,
        ...typedBlockerRefs,
        ...stringList(item.required_evidence_refs),
      ],
      nextVerificationCommand: 'opl runtime app-operator-drilldown --detail full --json',
    });
  });
  const legacyCleanup = record(drilldown.domain_legacy_cleanup_plan_refs);
  const legacyTailItems = recordList(legacyCleanup.refs).map((item, index) => {
    const domain = stringValue(item.domain_id) ?? 'domain_repo';
    const receiptRefs = stringList(item.receipt_refs);
    const typedBlockerRefs = stringList(item.typed_blocker_refs);
    return closureTailItem({
      tailId: `legacy:${domain}:${stringValue(item.action_id) ?? index + 1}`,
      tailItem: 'legacy_cleanup_ledger',
      status: typedBlockerRefs.length > 0
        ? 'domain_owned_typed_blocker'
        : receiptRefs.length > 0 || stringValue(item.plan_status) === 'ready'
          ? 'closed'
          : 'open',
      ownerGroup: domain,
      claimScope: 'legacy_cleanup_ledger',
      receiptRef: receiptRefs[0],
      typedBlockerRef: typedBlockerRefs[0],
      replayRef: stringValue(item.ref),
      freshnessRef: stringValue(item.updated_at),
      evidenceRefs: [
        ...receiptRefs,
        ...typedBlockerRefs,
        ...stringList(item.restore_proof_refs),
      ],
      nextVerificationCommand: 'opl agents legacy-cleanup apply --mode verify',
    });
  });
  const tailItems = [
    ...providerTailItems,
    ...attemptTailItems,
    ...stageTailItems,
    ...externalTailItems,
    ...legacyTailItems,
  ];
  return {
    surface_kind: 'opl_app_drilldown_production_evidence_tail_ledger',
    owner: 'one-person-lab',
    projection_policy:
      'attention_tail_only_no_structural_conformance_stage_launch_domain_ready_or_artifact_authority',
    summary: summarizeTailItems(tailItems),
    tail_items: tailItems,
    authority_boundary: tailAuthorityBoundary(),
  };
}
