import type { JsonRecord } from './runtime-tray-snapshot-types.ts';

type EvidenceEnvelopeStatus = 'open' | 'closed' | 'blocked';

const CANONICAL_OWNER_ALIASES = new Map([
  ['mas', 'med-autoscience'],
  ['medautoscience', 'med-autoscience'],
  ['med-autoscience', 'med-autoscience'],
  ['med-auto-science', 'med-autoscience'],
  ['mag', 'med-autogrant'],
  ['medautogrant', 'med-autogrant'],
  ['med-autogrant', 'med-autogrant'],
  ['med-auto-grant', 'med-autogrant'],
  ['rca', 'redcube-ai'],
  ['redcube', 'redcube-ai'],
  ['redcubeai', 'redcube-ai'],
  ['redcube-ai', 'redcube-ai'],
  ['opl', 'one-person-lab'],
  ['onepersonlab', 'one-person-lab'],
  ['one-person-lab', 'one-person-lab'],
]);

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

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function canonicalOwnerId(value: string) {
  const normalized = value.trim();
  const key = normalized.toLowerCase().replace(/[\s_]+/g, '-');
  const compact = key.replace(/-/g, '');
  return CANONICAL_OWNER_ALIASES.get(key)
    ?? CANONICAL_OWNER_ALIASES.get(compact)
    ?? normalized;
}

function sourceAlias(canonical: string, source: string) {
  return source !== canonical ? source : null;
}

function domainScope(domainId: string, extra: JsonRecord = {}) {
  const canonicalDomainId = canonicalOwnerId(domainId);
  const alias = sourceAlias(canonicalDomainId, domainId);
  return {
    ...extra,
    domain_id: canonicalDomainId,
    ...(alias ? { source_domain_id: domainId } : {}),
  };
}

function refsFromRecord(value: JsonRecord, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => {
    const entry = value[key];
    return typeof entry === 'string' ? [entry] : stringList(entry);
  }));
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function sourceRefs(...refs: Array<string | null | undefined>) {
  return uniqueStrings(refs.filter((ref): ref is string => Boolean(ref)));
}

function statusFrom(input: {
  receiptRefs: string[];
  typedBlockerRefs: string[];
  open: boolean;
}): EvidenceEnvelopeStatus {
  if (input.typedBlockerRefs.length > 0) {
    return 'blocked';
  }
  if (!input.open || input.receiptRefs.length > 0) {
    return 'closed';
  }
  return 'open';
}

function claimAllowed(status: EvidenceEnvelopeStatus) {
  return {
    owner_receipt_observed: status === 'closed',
    typed_blocker_observed: status === 'blocked',
    domain_ready: false,
    production_ready: false,
    artifact_authority: false,
    quality_or_export_verdict: false,
  };
}

function authorityBoundary() {
  return {
    opl: 'evidence_envelope_projection_only',
    domain: 'truth_owner_receipt_artifact_memory_quality_verdict_owner',
    app: 'operator_evidence_consumer_not_truth_owner',
    provider: 'runtime_slo_owner_not_domain_ready_owner',
    can_write_domain_truth: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact: false,
    can_authorize_domain_ready: false,
    can_authorize_quality_or_export: false,
    can_claim_production_ready: false,
    refs_only: true,
  };
}

function envelope(input: {
  envelopeId: string;
  owner: string;
  scope: JsonRecord;
  payloadKind: string;
  status: EvidenceEnvelopeStatus;
  receiptRefs?: string[];
  typedBlockerRefs?: string[];
  evidenceRefs?: string[];
  monitorRefs?: string[];
  sourceRefs?: string[];
  nextRoute?: string | null;
}) {
  const owner = canonicalOwnerId(input.owner);
  const ownerAlias = sourceAlias(owner, input.owner);
  return {
    envelope_id: input.envelopeId,
    owner,
    ...(ownerAlias ? { owner_source_id: input.owner } : {}),
    scope: input.scope,
    payload_kind: input.payloadKind,
    status: input.status,
    claim_allowed: claimAllowed(input.status),
    receipt_refs: uniqueStrings(input.receiptRefs ?? []),
    typed_blocker_refs: uniqueStrings(input.typedBlockerRefs ?? []),
    evidence_refs: uniqueStrings(input.evidenceRefs ?? []),
    monitor_refs: uniqueStrings(input.monitorRefs ?? []),
    source_refs: uniqueStrings(input.sourceRefs ?? []),
    next_route: input.nextRoute ?? null,
    authority_boundary: authorityBoundary(),
  };
}

function actionByStage(routes: JsonRecord[]) {
  const map = new Map<string, JsonRecord>();
  for (const route of routes) {
    const domainId = firstString(route.domain_id, route.target_domain_id, route.project_id);
    const stageId = stringValue(route.stage_id);
    if (!domainId || !stageId) {
      continue;
    }
    const key = `${domainId}:${stageId}`;
    if (!map.has(key)) {
      map.set(key, route);
    }
  }
  return map;
}

function actionByRequest(routes: JsonRecord[]) {
  const map = new Map<string, JsonRecord>();
  for (const route of routes) {
    const domainId = stringValue(route.domain_id);
    const requestId = firstString(route.request_id, route.gate_id);
    if (!domainId || !requestId) {
      continue;
    }
    const key = `${domainId}:${requestId}`;
    if (!map.has(key)) {
      map.set(key, route);
    }
  }
  return map;
}

function routeRef(route: JsonRecord | undefined) {
  if (!route) {
    return null;
  }
  return stringValue(route.ref)
    ?? stringValue(route.action_ref)
    ?? (stringValue(route.action_id)
      ? `opl runtime action execute --action ${stringValue(route.action_id)}`
      : null);
}

function stageEnvelopes(drilldown: JsonRecord, routes: JsonRecord[]) {
  const routeMap = actionByStage(routes.filter((route) =>
    stringValue(route.action_kind)?.startsWith('stage_production_evidence_')
    || stringValue(route.action_kind) === 'stage_production_attempt_request'
  ));
  return recordList(record(drilldown.stage_production_evidence).stages).map((stage) => {
    const sourceDomainId = firstString(stage.target_domain_id, stage.domain_id, stage.project_id) ?? 'domain';
    const domainId = canonicalOwnerId(sourceDomainId);
    const stageId = stringValue(stage.stage_id) ?? 'stage';
    const typedBlockerRefs = stringList(stage.domain_owned_typed_blocker_refs);
    const receiptRefs = uniqueStrings([
      ...stringList(stage.stage_evidence_receipt_refs),
      ...stringList(stage.verified_stage_evidence_receipt_refs),
      ...stringList(stage.observed_expected_receipt_refs),
      ...stringList(stage.reviewer_receipt_refs),
      ...stringList(stage.gate_receipt_refs),
    ]);
    const evidenceRefs = uniqueStrings([
      ...stringList(stage.stage_attempt_refs),
      ...stringList(stage.source_scope_refs),
      ...stringList(stage.runtime_event_refs),
      ...stringList(stage.observed_monitor_freshness_refs),
    ]);
    const route = routeMap.get(`${sourceDomainId}:${stageId}`) ?? routeMap.get(`${domainId}:${stageId}`);
    const open = stringList(stage.missing_production_evidence).length > 0
      || stringList(stage.unobserved_expected_receipt_refs).length > 0
      || stringList(stage.unobserved_monitor_freshness_refs).length > 0;
    return envelope({
      envelopeId: `stage_production_evidence:${domainId}:${stageId}`,
      owner: stringValue(stage.owner) ?? domainId,
      scope: domainScope(sourceDomainId, {
        scope_kind: 'stage_production_evidence',
        stage_id: stageId,
      }),
      payloadKind: 'stage_expected_receipt_or_monitor_freshness_refs',
      status: statusFrom({ receiptRefs, typedBlockerRefs, open }),
      receiptRefs,
      typedBlockerRefs,
      evidenceRefs,
      monitorRefs: stringList(stage.monitor_refs),
      sourceRefs: sourceRefs(stringValue(stage.ref)),
      nextRoute: routeRef(route),
    });
  });
}

function domainDispatchEnvelopes(drilldown: JsonRecord) {
  return recordList(record(drilldown.domain_dispatch_evidence).attempts).map((attempt) => {
    const sourceDomainId = stringValue(attempt.domain_id) ?? 'domain';
    const domainId = canonicalOwnerId(sourceDomainId);
    const attemptId = stringValue(attempt.stage_attempt_id) ?? 'attempt';
    const receiptRefs = uniqueStrings([
      ...stringList(attempt.owner_receipt_refs),
      ...stringList(attempt.writeback_receipt_refs),
    ]);
    const typedBlockerRefs = stringList(attempt.typed_blocker_refs);
    const evidenceRefs = stringList(attempt.no_regression_evidence_refs);
    return envelope({
      envelopeId: `domain_dispatch:${domainId}:${attemptId}`,
      owner: domainId,
      scope: domainScope(sourceDomainId, {
        scope_kind: 'domain_dispatch',
        stage_id: stringValue(attempt.stage_id),
        stage_attempt_id: stringValue(attempt.stage_attempt_id),
      }),
      payloadKind: 'domain_owner_receipt_or_typed_blocker_refs',
      status: statusFrom({
        receiptRefs,
        typedBlockerRefs,
        open: receiptRefs.length === 0 && typedBlockerRefs.length === 0,
      }),
      receiptRefs,
      typedBlockerRefs,
      evidenceRefs,
      sourceRefs: sourceRefs(stringValue(attempt.ref)),
      nextRoute: null,
    });
  });
}

function externalEvidenceEnvelopes(drilldown: JsonRecord, routes: JsonRecord[]) {
  const routeMap = actionByRequest(routes.filter((route) =>
    stringValue(route.action_kind)?.startsWith('external_evidence_')
    || stringValue(route.action_kind)?.startsWith('evidence_gate_')
  ));
  const domainEvidence = record(drilldown.domain_evidence_request_refs);
  const externalRequests = recordList(domainEvidence.external_requests).map((request) => {
    const sourceDomainId = stringValue(request.domain_id) ?? 'domain';
    const domainId = canonicalOwnerId(sourceDomainId);
    const requestId = stringValue(request.request_id) ?? 'request';
    const route = routeMap.get(`${sourceDomainId}:${requestId}`) ?? routeMap.get(`${domainId}:${requestId}`);
    const receiptStatus = stringValue(request.external_receipt_status);
    return envelope({
      envelopeId: `external_evidence:${domainId}:${requestId}`,
      owner: domainId,
      scope: domainScope(sourceDomainId, {
        scope_kind: 'external_evidence_request',
        request_id: requestId,
      }),
      payloadKind: 'external_evidence_receipt_refs',
      status: statusFrom({
        receiptRefs: [],
        typedBlockerRefs: [],
        open: receiptStatus !== 'verified',
      }),
      evidenceRefs: stringList(request.required_evidence_refs),
      sourceRefs: sourceRefs(stringValue(request.ref), stringValue(request.source_pointer)),
      nextRoute: routeRef(route),
    });
  });
  const evidenceGates = recordList(domainEvidence.evidence_gates).map((gate) => {
    const sourceDomainId = stringValue(gate.domain_id) ?? 'domain';
    const domainId = canonicalOwnerId(sourceDomainId);
    const requestId = firstString(gate.request_id, gate.gate_id) ?? 'gate';
    const route = routeMap.get(`${sourceDomainId}:${requestId}`) ?? routeMap.get(`${domainId}:${requestId}`);
    const receiptStatus = stringValue(gate.external_receipt_status);
    return envelope({
      envelopeId: `evidence_gate:${domainId}:${requestId}`,
      owner: domainId,
      scope: domainScope(sourceDomainId, {
        scope_kind: 'evidence_gate',
        request_id: requestId,
        gate_id: stringValue(gate.gate_id),
      }),
      payloadKind: 'evidence_gate_receipt_refs',
      status: statusFrom({
        receiptRefs: [],
        typedBlockerRefs: [],
        open: receiptStatus !== 'verified',
      }),
      sourceRefs: sourceRefs(stringValue(gate.ref)),
      nextRoute: routeRef(route),
    });
  });
  const receiptItems = [
    ...recordList(domainEvidence.external_receipts),
    ...recordList(domainEvidence.evidence_gate_receipts),
  ].map((receipt) => {
    const sourceDomainId = stringValue(receipt.domain_id) ?? 'domain';
    const domainId = canonicalOwnerId(sourceDomainId);
    const requestId = firstString(receipt.request_id, receipt.gate_id) ?? 'receipt';
    const typedBlockerRefs = stringList(receipt.typed_blocker_refs);
    const receiptRefs = uniqueStrings([
      ...refsFromRecord(receipt, ['receipt_ref', 'ref']),
      ...stringList(receipt.domain_receipt_refs),
      ...stringList(receipt.evidence_refs),
      ...stringList(receipt.no_regression_refs),
      ...stringList(receipt.release_dist_refs),
      ...stringList(receipt.direct_hosted_parity_refs),
      ...stringList(receipt.owner_chain_refs),
    ]);
    return envelope({
      envelopeId: `external_evidence_receipt:${domainId}:${requestId}`,
      owner: domainId,
      scope: domainScope(sourceDomainId, {
        scope_kind: stringValue(receipt.role) ?? 'external_evidence_receipt',
        request_id: requestId,
      }),
      payloadKind: typedBlockerRefs.length > 0 && receiptRefs.length <= 1
        ? 'domain_owned_typed_blocker_refs'
        : 'domain_owned_receipt_refs',
      status: statusFrom({
        receiptRefs,
        typedBlockerRefs,
        open: stringValue(receipt.receipt_status) !== 'verified',
      }),
      receiptRefs,
      typedBlockerRefs,
      evidenceRefs: stringList(receipt.evidence_refs),
      sourceRefs: sourceRefs(stringValue(receipt.ref), stringValue(receipt.receipt_ref)),
      nextRoute: null,
    });
  });
  return [...externalRequests, ...evidenceGates, ...receiptItems];
}

function legacyCleanupEnvelopes(drilldown: JsonRecord, routes: JsonRecord[]) {
  const routeMap = new Map(routes
    .filter((route) => stringValue(route.action_kind)?.startsWith('legacy_cleanup_'))
    .map((route) => [stringValue(route.source_ref) ?? stringValue(route.domain_id) ?? '', route]));
  return recordList(record(drilldown.domain_legacy_cleanup_plan_refs).refs).map((plan) => {
    const sourceRef = stringValue(plan.ref);
    const sourceDomainId = stringValue(plan.command_domain_id) ?? stringValue(plan.domain_id) ?? 'domain';
    const domainId = canonicalOwnerId(sourceDomainId);
    const route = routeMap.get(sourceRef ?? '') ?? routeMap.get(sourceDomainId) ?? routeMap.get(domainId);
    const receiptRefs = uniqueStrings([
      ...stringList(plan.receipt_refs),
      ...stringList(plan.restore_proof_refs),
      ...stringList(plan.replacement_parity_refs),
    ]);
    const open = stringValue(plan.plan_status) !== 'ready'
      || plan.opl_cleanup_ledger_ready !== true;
    return envelope({
      envelopeId: `legacy_cleanup:${domainId}:${sourceRef ?? 'plan'}`,
      owner: 'one-person-lab',
      scope: domainScope(sourceDomainId, {
        scope_kind: 'legacy_cleanup',
        source_ref: sourceRef,
      }),
      payloadKind: 'opl_cleanup_ledger_refs',
      status: statusFrom({
        receiptRefs,
        typedBlockerRefs: [],
        open,
      }),
      receiptRefs,
      evidenceRefs: uniqueStrings(recordList(plan.action_refs).flatMap((action) => [
        ...stringList(action.replacement_parity_refs),
        ...stringList(action.no_active_caller_refs),
        ...stringList(action.domain_receipt_parity_refs),
      ])),
      sourceRefs: sourceRefs(sourceRef),
      nextRoute: routeRef(route),
    });
  });
}

function summarize(items: ReturnType<typeof envelope>[]) {
  const ownerIds = uniqueStrings(items.map((item) => item.owner));
  const payloadKinds = uniqueStrings(items.map((item) => item.payload_kind));
  const ownerPayloadBreakdown = ownerIds.flatMap((owner) =>
    payloadKinds
      .map((payloadKind) => {
        const matchingItems = items.filter((item) => (
          item.owner === owner && item.payload_kind === payloadKind
        ));
        return {
          owner,
          payload_kind: payloadKind,
          envelope_count: matchingItems.length,
          open_envelope_count: matchingItems.filter((item) => item.status === 'open').length,
          closed_envelope_count: matchingItems.filter((item) => item.status === 'closed').length,
          blocked_envelope_count: matchingItems.filter((item) => item.status === 'blocked').length,
          receipt_ref_count: uniqueStrings(matchingItems.flatMap((item) => item.receipt_refs)).length,
          typed_blocker_ref_count: uniqueStrings(matchingItems.flatMap((item) => item.typed_blocker_refs)).length,
          evidence_ref_count: uniqueStrings(matchingItems.flatMap((item) => item.evidence_refs)).length,
        };
      })
      .filter((entry) => entry.envelope_count > 0)
  );
  return {
    envelope_count: items.length,
    open_envelope_count: items.filter((item) => item.status === 'open').length,
    closed_envelope_count: items.filter((item) => item.status === 'closed').length,
    blocked_envelope_count: items.filter((item) => item.status === 'blocked').length,
    owner_count: ownerIds.length,
    payload_kind_count: payloadKinds.length,
    owner_ids: ownerIds,
    owner_id_policy: 'canonical_owner_ids_only_raw_aliases_in_full_detail_envelopes',
    payload_kinds: payloadKinds,
    owner_payload_breakdown: ownerPayloadBreakdown,
    owner_payload_breakdown_policy:
      'refs_only_owner_and_payload_kind_action_breakdown_for_domain_or_app_live_operator_scaleout',
    receipt_ref_count: uniqueStrings(items.flatMap((item) => item.receipt_refs)).length,
    typed_blocker_ref_count: uniqueStrings(items.flatMap((item) => item.typed_blocker_refs)).length,
    evidence_ref_count: uniqueStrings(items.flatMap((item) => item.evidence_refs)).length,
    domain_ready_claim_count: items.filter((item) => item.claim_allowed.domain_ready).length,
    production_ready_claim_count: items.filter((item) => item.claim_allowed.production_ready).length,
    artifact_authority_claim_count: items.filter((item) => item.claim_allowed.artifact_authority).length,
  };
}

function ownerAliasDiagnostics(items: ReturnType<typeof envelope>[]) {
  const aliasesByOwner = new Map<string, Set<string>>();
  for (const item of items) {
    const aliases = uniqueStrings([
      stringValue(item.owner_source_id),
      stringValue(record(item.scope).source_domain_id),
    ].filter((alias): alias is string => Boolean(alias)));
    for (const alias of aliases) {
      const canonical = canonicalOwnerId(alias);
      if (canonical !== item.owner || alias === item.owner) {
        continue;
      }
      const existing = aliasesByOwner.get(item.owner) ?? new Set<string>();
      existing.add(alias);
      aliasesByOwner.set(item.owner, existing);
    }
  }
  return {
    surface_kind: 'opl_evidence_envelope_owner_alias_diagnostics',
    policy: 'full_detail_only_aliases_preserve_source_ids_without_expanding_default_owner_semantics',
    canonical_owner_count: uniqueStrings(items.map((item) => item.owner)).length,
    alias_group_count: aliasesByOwner.size,
    aliases: [...aliasesByOwner.entries()].map(([owner, values]) => ({
      canonical_owner_id: owner,
      source_owner_alias_ids: [...values].sort(),
    })),
  };
}

export function buildEvidenceEnvelopeProjection(input: {
  appOperatorDrilldown: JsonRecord;
  operatorRoutes?: JsonRecord[];
}) {
  const drilldown = input.appOperatorDrilldown;
  const routes = input.operatorRoutes ?? [
    ...recordList(record(drilldown.operator_action_routing_refs).refs),
    ...recordList(record(drilldown.app_execution_bridge).safe_action_routes),
  ];
  const envelopes = [
    ...stageEnvelopes(drilldown, routes),
    ...externalEvidenceEnvelopes(drilldown, routes),
    ...domainDispatchEnvelopes(drilldown),
    ...legacyCleanupEnvelopes(drilldown, routes),
  ];
  return {
    surface_kind: 'opl_evidence_envelope_projection',
    model_version: 'evidence_envelope.v1',
    projection_policy:
      'single_refs_only_claim_reading_over_stage_external_domain_dispatch_and_cleanup_evidence',
    source_refs: [
      '/runtime_tray_snapshot/app_operator_drilldown/stage_production_evidence',
      '/runtime_tray_snapshot/app_operator_drilldown/domain_evidence_request_refs',
      '/runtime_tray_snapshot/app_operator_drilldown/domain_dispatch_evidence',
      '/runtime_tray_snapshot/app_operator_drilldown/domain_legacy_cleanup_plan_refs',
    ],
    summary: summarize(envelopes),
    owner_alias_diagnostics: ownerAliasDiagnostics(envelopes),
    envelopes,
    authority_boundary: authorityBoundary(),
  };
}

export function compactEvidenceEnvelopeProjection(projection: JsonRecord) {
  return {
    surface_kind: projection.surface_kind ?? 'opl_evidence_envelope_projection',
    model_version: projection.model_version ?? 'evidence_envelope.v1',
    projection_policy: projection.projection_policy
      ?? 'single_refs_only_claim_reading_over_stage_external_domain_dispatch_and_cleanup_evidence',
    source_refs: Array.isArray(projection.source_refs) ? projection.source_refs : [],
    summary: record(projection.summary),
    authority_boundary: record(projection.authority_boundary),
  };
}

export function evidenceEnvelopeSummary(projection: JsonRecord) {
  return record(projection.summary);
}

export function evidenceEnvelopeOpenCount(projection: JsonRecord) {
  return numberValue(record(projection.summary).open_envelope_count);
}
