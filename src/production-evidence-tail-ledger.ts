import {
  evidenceRequirementFromTailItem,
  evidenceTailAuthorityBoundary,
  evidenceTailItem,
  firstString,
  isRecord,
  normalizeEvidenceTailStatus,
  stringList,
  stringValue,
  type JsonRecord,
} from './evidence-requirement.ts';

export const PRODUCTION_EVIDENCE_TAIL_BLOCKING_POLICY =
  'production_evidence_tail_not_a_structural_conformance_stage_launch_or_artifact_authority_pass_condition';

export const PRODUCTION_TAIL_NEXT_ACTION_LEDGER_POLICY =
  'refs_only_next_action_routes_derived_from_declared_tail_refs_without_reading_memory_or_artifact_bodies';

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function tailAuthorityBoundary(extra: JsonRecord = {}) {
  return evidenceTailAuthorityBoundary(extra);
}

function normalizedConformanceTailItem(item: JsonRecord, index: number) {
  const domainOwner = stringValue(item.domain_owner) ?? 'domain_repo';
  const status = normalizeEvidenceTailStatus(stringValue(item.status));
  const tailId = stringValue(item.tail_id)
    ?? stringValue(item.tail_item)
    ?? `${domainOwner}:production_evidence_tail:${index + 1}`;
  return evidenceTailItem({
    tailId,
    tailItem: stringValue(item.tail_item) ?? tailId,
    status,
    ownerGroup: domainOwner,
    claimScope: 'agent_structural_conformance_production_acceptance_tail',
    currentRef: stringValue(item.evidence_ref) ?? stringValue(item.doc_ref),
    evidenceRef: stringValue(item.evidence_ref),
    docRef: stringValue(item.doc_ref),
    nextVerificationCommand: stringValue(item.next_verification_command),
    blockingPolicy: PRODUCTION_EVIDENCE_TAIL_BLOCKING_POLICY,
    authorityBoundary: {
      source_authority_boundary: isRecord(item.authority_boundary) ? item.authority_boundary : null,
    },
    extra: {
      repo_path: stringValue(item.repo_path),
    },
  });
}

function summarizeTailItems(tailItems: JsonRecord[]) {
  const ownerGroups = new Set(tailItems.map((item) => stringValue(item.owner_group) ?? 'unknown'));
  return {
    tail_item_count: tailItems.length,
    open_tail_item_count: tailItems.filter((item) => stringValue(item.status) === 'open').length,
    closed_tail_item_count: tailItems.filter((item) => stringValue(item.status) === 'closed').length,
    typed_blocker_tail_item_count:
      tailItems.filter((item) => stringValue(item.status) === 'domain_owned_typed_blocker').length,
    blocking_tail_item_count:
      tailItems.filter((item) => stringValue(item.status) === 'blocked').length,
    owner_group_count: ownerGroups.size,
    blocking_policy: PRODUCTION_EVIDENCE_TAIL_BLOCKING_POLICY,
  };
}

function normalizeLedgerStatus(status: string | null) {
  return normalizeEvidenceTailStatus(status);
}

function defaultRequiredReceiptType(item: JsonRecord) {
  const actionKind = stringValue(item.action_kind);
  const claimScope = stringValue(item.claim_scope);
  const tailItem = stringValue(item.tail_item);
  if (actionKind?.startsWith('provider_scheduler') || tailItem === 'provider_long_window_slo_evidence') {
    return 'provider_slo_execution_receipt';
  }
  if (actionKind === 'stage_production_attempt_request' || claimScope === 'stage_production_caller_request') {
    return 'stage_attempt_owner_receipt_or_domain_typed_blocker';
  }
  if (
    actionKind === 'external_evidence_receipt_record'
    || actionKind === 'external_evidence_receipt_verify'
    || claimScope === 'external_evidence_receipt'
  ) {
    return 'external_evidence_domain_owner_receipt';
  }
  if (
    actionKind === 'evidence_gate_receipt_record'
    || actionKind === 'evidence_gate_receipt_verify'
    || claimScope === 'evidence_gate_receipt'
  ) {
    return 'evidence_gate_domain_owner_receipt';
  }
  if (actionKind?.startsWith('legacy_cleanup') || claimScope === 'legacy_cleanup_ledger') {
    return 'legacy_cleanup_receipt_or_domain_owner_handoff';
  }
  return 'declared_owner_receipt_or_typed_blocker';
}

function nextSafeActionRoute(item: JsonRecord, status: string) {
  if (status !== 'open') {
    return null;
  }
  return firstString(item.next_safe_action_route, item.replay_ref, item.next_verification_command);
}

function currentRef(item: JsonRecord) {
  return firstString(
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
  );
}

function normalizeNextActionItem(item: JsonRecord, index: number) {
  const requirement = evidenceRequirementFromTailItem(item);
  const owner = requirement.owner;
  const domain = requirement.domain_id;
  const stage = requirement.stage_id;
  const request = requirement.request_id;
  const status = normalizeLedgerStatus(requirement.status);
  return {
    item_id: `next-action:${firstString(item.tail_id, item.item_id, requirement.requirement_id) ?? index + 1}`,
    source_tail_item_id: firstString(item.tail_id, item.item_id, requirement.requirement_id),
    status,
    owner,
    domain,
    stage_or_request: stage ?? request ?? requirement.claim_scope,
    stage_id: stage,
    request_id: request,
    required_receipt_type:
      firstString(requirement.required_receipt_type, item.required_receipt_shape) ?? defaultRequiredReceiptType(item),
    current_ref: requirement.current_ref ?? currentRef(item),
    next_safe_action_route: nextSafeActionRoute({ ...item, next_safe_action_route: requirement.next_safe_action_route }, status),
    blocking_policy: firstString(item.blocking_policy) ?? PRODUCTION_EVIDENCE_TAIL_BLOCKING_POLICY,
    evidence_requirement_model: 'evidence_requirement.v1',
    evidence_requirement: requirement,
    authority_boundary: tailAuthorityBoundary({
      source_authority_boundary: isRecord(item.authority_boundary) ? item.authority_boundary : null,
      current_ref_is_locator_only: true,
      next_safe_action_route_is_ref_only: true,
      can_close_receipt_without_declared_ref: false,
    }),
  };
}

function groupNextActionItems(items: JsonRecord[]) {
  const groups = new Map<string, JsonRecord & { items: JsonRecord[] }>();
  for (const item of items) {
    const key = [
      stringValue(item.owner) ?? 'unknown',
      stringValue(item.domain) ?? 'unknown',
      stringValue(item.stage_id) ?? '',
      stringValue(item.request_id) ?? '',
      stringValue(item.stage_or_request) ?? '',
    ].join('/');
    const group = groups.get(key) ?? {
      owner: stringValue(item.owner) ?? 'unknown',
      domain: stringValue(item.domain) ?? 'unknown',
      stage_id: stringValue(item.stage_id),
      request_id: stringValue(item.request_id),
      stage_or_request: stringValue(item.stage_or_request),
      items: [],
    };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    item_count: group.items.length,
  }));
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((entry): entry is string => Boolean(entry)))];
}

function typedBlockerRefsForNextActionItem(item: JsonRecord) {
  const requirement = record(item.evidence_requirement);
  const refs = uniqueStrings([
    ...stringList(requirement.typed_blocker_refs),
    stringValue(requirement.typed_blocker_ref),
    ...stringList(item.typed_blocker_refs),
    stringValue(item.typed_blocker_ref),
  ]);
  if (refs.length > 0) {
    return refs;
  }
  const currentRef = stringValue(item.current_ref) ?? stringValue(requirement.current_ref);
  return currentRef ? [currentRef] : [];
}

function groupTypedBlockerNextActionItems(items: JsonRecord[]) {
  const typedBlockerItems = items.filter((item) => stringValue(item.status) === 'domain_owned_typed_blocker');
  const refOccurrences: string[] = [];
  const groups = new Map<string, JsonRecord & { items: JsonRecord[]; stage_or_requests: Set<string> }>();
  for (const item of typedBlockerItems) {
    const owner = stringValue(item.owner) ?? 'unknown';
    const domain = stringValue(item.domain) ?? 'unknown';
    const requirement = record(item.evidence_requirement);
    const claimScope = stringValue(requirement.claim_scope) ?? 'unknown';
    const typedBlockerRefs = typedBlockerRefsForNextActionItem(item);
    const refsForGrouping = typedBlockerRefs.length > 0
      ? typedBlockerRefs
      : [`missing_typed_blocker_ref:${stringValue(item.item_id) ?? stringValue(item.source_tail_item_id) ?? 'unknown'}`];
    for (const typedBlockerRef of refsForGrouping) {
      if (!typedBlockerRef.startsWith('missing_typed_blocker_ref:')) {
        refOccurrences.push(typedBlockerRef);
      }
      const key = [
        owner,
        domain,
        claimScope,
        typedBlockerRef,
      ].join('/');
      const group = groups.get(key) ?? {
        owner,
        domain,
        claim_scope: claimScope,
        typed_blocker_ref:
          typedBlockerRef.startsWith('missing_typed_blocker_ref:') ? null : typedBlockerRef,
        items: [],
        stage_or_requests: new Set<string>(),
      };
      group.items.push(item);
      const stageOrRequest = stringValue(item.stage_or_request)
        ?? stringValue(item.stage_id)
        ?? stringValue(item.request_id);
      if (stageOrRequest) {
        group.stage_or_requests.add(stageOrRequest);
      }
      groups.set(key, group);
    }
  }
  const uniqueTypedBlockerRefs = uniqueStrings(refOccurrences);
  return {
    typedBlockerItems,
    typedBlockerRefCount: refOccurrences.length,
    uniqueTypedBlockerRefCount: uniqueTypedBlockerRefs.length,
    groups: [...groups.values()].map((group) => ({
      owner: group.owner,
      domain: group.domain,
      claim_scope: group.claim_scope,
      typed_blocker_ref: group.typed_blocker_ref,
      item_count: group.items.length,
      stage_or_request_count: group.stage_or_requests.size,
      stage_or_requests: [...group.stage_or_requests],
      source_tail_item_ids: group.items
        .map((item) => stringValue(item.source_tail_item_id) ?? stringValue(item.item_id))
        .filter((entry): entry is string => Boolean(entry)),
    })),
  };
}

export function buildProductionTailNextActionLedger(input: {
  surfaceKind: string;
  owner?: string;
  sourceTailSummary: JsonRecord;
  tailItems: JsonRecord[];
  sourceRef?: string;
}) {
  const nextActionItems = input.tailItems
    .map(normalizeNextActionItem)
    .filter((item) => item.status !== 'closed');
  const groups = groupNextActionItems(nextActionItems);
  const typedBlockerGroups = groupTypedBlockerNextActionItems(nextActionItems);
  return {
    surface_kind: input.surfaceKind,
    owner: input.owner ?? 'one-person-lab',
    ledger_policy: PRODUCTION_TAIL_NEXT_ACTION_LEDGER_POLICY,
    grouping_keys: ['owner', 'domain', 'stage_or_request'],
    typed_blocker_grouping_keys: ['owner', 'domain', 'claim_scope', 'typed_blocker_ref'],
    source_ref: input.sourceRef ?? null,
    source_tail_summary: input.sourceTailSummary,
    summary: {
      tail_item_count: numberValue(input.sourceTailSummary.tail_item_count),
      open_tail_item_count: numberValue(input.sourceTailSummary.open_tail_item_count),
      typed_blocker_tail_item_count: numberValue(input.sourceTailSummary.typed_blocker_tail_item_count),
      blocking_tail_item_count: numberValue(input.sourceTailSummary.blocking_tail_item_count),
      closed_tail_item_count: numberValue(input.sourceTailSummary.closed_tail_item_count),
      next_action_item_count: nextActionItems.length,
      next_action_group_count: groups.length,
      typed_blocker_ref_count: typedBlockerGroups.typedBlockerRefCount,
      unique_typed_blocker_ref_count: typedBlockerGroups.uniqueTypedBlockerRefCount,
      typed_blocker_group_count: typedBlockerGroups.groups.length,
      typed_blocker_attention_semantics:
        'domain_owned_typed_blocker_refs_grouped_for_attention_only_raw_tail_counts_preserved',
      blocking_policy: PRODUCTION_EVIDENCE_TAIL_BLOCKING_POLICY,
    },
    groups,
    typed_blocker_groups: typedBlockerGroups.groups,
    next_action_items: nextActionItems,
    authority_boundary: tailAuthorityBoundary({
      can_claim_receipt_closure: false,
      reads_declared_refs_only: true,
      reads_memory_or_artifact_body: false,
      can_execute_domain_action_directly: false,
    }),
  };
}

export function buildCanonicalEvidenceTailItem(input: {
  tailId: string;
  tailItem: string;
  status: 'open' | 'closed' | 'blocked' | 'domain_owned_typed_blocker';
  ownerGroup: string;
  claimScope: string;
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
  blockedReasons?: string[];
  nextVerificationCommand?: string | null;
}) {
  return evidenceTailItem({
    tailId: input.tailId,
    tailItem: input.tailItem,
    status: input.status,
    ownerGroup: input.ownerGroup,
    domainId: input.domainId,
    stageId: input.stageId,
    requestId: input.requestId,
    claimScope: input.claimScope,
    requiredReceiptType: input.requiredReceiptType,
    currentRef: input.currentRef,
    nextSafeActionRoute: input.nextSafeActionRoute,
    receiptRef: input.receiptRef,
    receiptRefs: input.receiptRefs ?? (input.receiptRef ? [input.receiptRef] : []),
    typedBlockerRef: input.typedBlockerRef,
    typedBlockerRefs: input.typedBlockerRefs ?? (input.typedBlockerRef ? [input.typedBlockerRef] : []),
    replayRef: input.replayRef,
    freshnessRef: input.freshnessRef,
    freshnessRefs: input.freshnessRefs,
    evidenceRefs: input.evidenceRefs,
    expectedRefs: input.expectedRefs,
    nextVerificationCommand: input.nextVerificationCommand,
    blockingPolicy: PRODUCTION_EVIDENCE_TAIL_BLOCKING_POLICY,
    authorityBoundary: {
      receipt_or_blocker_is_domain_owned_claim_only: true,
    },
    extra: {
      blocked_reasons: input.blockedReasons ?? [],
    },
  });
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
    : [evidenceTailItem({
        tailId: `framework:provider:${providerKind}_long_soak_evidence`,
        tailItem: 'provider_long_window_slo_evidence',
        status: 'open',
        ownerGroup: 'one-person-lab',
        domainId: 'one-person-lab',
        requestId: 'provider_long_window_slo_evidence',
        claimScope: 'provider_scheduler_cadence',
        requiredReceiptType: 'provider_slo_execution_receipt',
        currentRef: stringValue(input.providerContinuousProof.ref)
          ?? '/runtime_tray_snapshot/provider_continuous_proof',
        nextSafeActionRoute: `opl family-runtime residency proof --provider ${providerKind} --production`,
        docRef: 'docs/active/production-framework-closure-gap-matrix.md#production_temporal_residency',
        nextVerificationCommand: `opl family-runtime residency proof --provider ${providerKind} --production`,
        blockingPolicy: PRODUCTION_EVIDENCE_TAIL_BLOCKING_POLICY,
        authorityBoundary: {
          provider_completion_can_claim_domain_ready: false,
          provider_history_can_claim_quality_verdict: false,
        },
        extra: {
          missing_receipt_count: missingReceiptCount,
        },
      })];
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
    return [evidenceTailItem({
      tailId: `stage_attempt:${stageAttemptId}:domain_owner_chain_evidence`,
      tailItem: 'stage_attempt_domain_owner_chain_evidence',
      status: typedBlockerRefs.length > 0 ? 'domain_owned_typed_blocker' : 'closed',
      ownerGroup: stringValue(attempt.domain_id) ?? 'domain_repo',
      domainId: stringValue(attempt.domain_id) ?? 'domain_repo',
      stageId: stringValue(attempt.stage_id),
      requestId: stageAttemptId,
      claimScope: 'stage_attempt_owner_receipt',
      requiredReceiptType: 'stage_attempt_owner_receipt_or_domain_typed_blocker',
      currentRef: ownerReceiptRefs[0] ?? typedBlockerRefs[0] ?? null,
      nextSafeActionRoute: `opl family-runtime attempt query ${stageAttemptId}`,
      receiptRef: ownerReceiptRefs[0],
      receiptRefs: ownerReceiptRefs,
      typedBlockerRef: typedBlockerRefs[0],
      typedBlockerRefs,
      evidenceRefs: [...ownerReceiptRefs, ...typedBlockerRefs],
      nextVerificationCommand: `opl family-runtime attempt query ${stageAttemptId}`,
      blockingPolicy: PRODUCTION_EVIDENCE_TAIL_BLOCKING_POLICY,
      authorityBoundary: {
        owner_receipt_can_claim_domain_ready_for_opl: false,
        typed_blocker_can_claim_domain_ready_for_opl: false,
      },
      extra: {
        owner_receipt_refs: ownerReceiptRefs,
      },
    })];
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
    const typedBlockerRefs = [
      ...stringList(stage.typed_blocker_refs),
      ...stringList(stage.domain_owned_typed_blocker_refs),
    ];
    const receiptRefs = stringList(stage.observed_expected_receipt_refs);
    return [buildCanonicalEvidenceTailItem({
      tailId: `stage:${domain}:${stageId}:production_evidence`,
      tailItem: 'stage_production_evidence',
      status: typedBlockerRefs.length > 0
        ? 'domain_owned_typed_blocker'
        : receiptRefs.length > 0
          ? 'closed'
          : 'open',
      ownerGroup: domain,
      domainId: domain,
      stageId,
      claimScope: 'stage_production_caller_executor_receipt_monitor',
      requiredReceiptType: 'stage_production_caller_owner_receipt_or_domain_typed_blocker',
      currentRef: receiptRefs[0]
        ?? typedBlockerRefs[0]
        ?? stringList(stage.observed_evidence_refs)[0]
        ?? stringValue(stage.ref),
      nextSafeActionRoute: stringValue(stage.stage_id)
        ? `opl runtime app-operator-drilldown --detail full --json`
        : null,
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
    return buildCanonicalEvidenceTailItem({
      tailId: `external:${domain}:${requestId}`,
      tailItem: 'external_evidence_or_gate_request',
      status: typedBlockerRefs.length > 0
        ? 'domain_owned_typed_blocker'
        : receiptRefs.length > 0
          ? 'closed'
          : 'open',
      ownerGroup: domain,
      domainId: domain,
      requestId,
      claimScope: stringValue(item.gate_id) ? 'evidence_gate_receipt' : 'external_evidence_receipt',
      requiredReceiptType: stringValue(item.gate_id)
        ? 'evidence_gate_domain_owner_receipt'
        : 'external_evidence_domain_owner_receipt',
      currentRef: receiptRefs[0]
        ?? typedBlockerRefs[0]
        ?? stringList(item.required_evidence_refs)[0]
        ?? stringValue(item.source_pointer)
        ?? stringValue(item.ref),
      nextSafeActionRoute:
        stringValue(item.evidence_verify_command)
        ?? stringValue(item.evidence_apply_command)
        ?? stringValue(item.source_pointer)
        ?? stringValue(item.ref),
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
    const blockedReasons = stringList(item.blocked_reasons);
    return buildCanonicalEvidenceTailItem({
      tailId: `legacy:${domain}:${stringValue(item.action_id) ?? index + 1}`,
      tailItem: 'legacy_cleanup_ledger',
      status: typedBlockerRefs.length > 0
        ? 'domain_owned_typed_blocker'
        : receiptRefs.length > 0 || stringValue(item.plan_status) === 'ready'
          ? 'closed'
          : blockedReasons.length > 0
            ? 'blocked'
            : 'open',
      ownerGroup: domain,
      domainId: domain,
      requestId: stringValue(item.action_id) ?? `${index + 1}`,
      claimScope: 'legacy_cleanup_ledger',
      requiredReceiptType: 'legacy_cleanup_receipt_or_domain_owner_handoff',
      currentRef: receiptRefs[0]
        ?? typedBlockerRefs[0]
        ?? stringList(item.restore_proof_refs)[0]
        ?? stringValue(item.ref),
      nextSafeActionRoute: stringValue(item.verify_command)
        ?? stringValue(item.apply_command)
        ?? stringValue(item.ref),
      receiptRef: receiptRefs[0],
      typedBlockerRef: typedBlockerRefs[0],
      replayRef: stringValue(item.ref),
      freshnessRef: stringValue(item.updated_at),
      evidenceRefs: [
        ...receiptRefs,
        ...typedBlockerRefs,
        ...blockedReasons,
        ...stringList(item.restore_proof_refs),
      ],
      blockedReasons,
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
  const summary = summarizeTailItems(tailItems);
  return {
    surface_kind: 'opl_app_drilldown_production_evidence_tail_ledger',
    owner: 'one-person-lab',
    projection_policy:
      'attention_tail_only_no_structural_conformance_stage_launch_domain_ready_or_artifact_authority',
    summary,
    tail_items: tailItems,
    next_action_ledger: buildProductionTailNextActionLedger({
      surfaceKind: 'opl_app_drilldown_production_tail_next_action_ledger',
      sourceTailSummary: summary,
      tailItems,
      sourceRef: '/runtime_tray_snapshot/app_operator_drilldown/production_evidence_tail_ledger',
    }),
    authority_boundary: tailAuthorityBoundary(),
  };
}
