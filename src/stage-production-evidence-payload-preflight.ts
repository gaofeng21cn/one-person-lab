import { FrameworkContractError } from './contracts.ts';

type JsonRecord = Record<string, unknown>;

export type StageProductionEvidencePayloadPreflightStatus = 'ready_to_record' | 'blocked';

export type StageProductionEvidencePayloadPreflight = {
  surface_kind: 'opl_stage_production_evidence_payload_preflight';
  status: StageProductionEvidencePayloadPreflightStatus;
  route_requires_domain_or_app_payload: boolean;
  success_path_ready: boolean;
  typed_blocker_path_ready: boolean;
  can_record_refs_only_receipt: boolean;
  missing_payload_fields: string[];
  forbidden_placeholder_refs: string[];
  uncovered_expected_receipt_refs: string[];
  uncovered_monitor_freshness_refs: string[];
  accepted_ref_counts: {
    domain_receipt_refs: number;
    evidence_refs: number;
    typed_blocker_refs: number;
    no_regression_refs: number;
    owner_chain_refs: number;
  };
  policy: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return [value.trim()];
  }
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function refsFromPayload(payload: JsonRecord, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => stringList(payload[key])));
}

function requiredExpectedReceiptRefs(route: JsonRecord) {
  const hints = isRecord(route.payload_ref_hints) ? route.payload_ref_hints : {};
  return uniqueStrings([
    ...stringList(route.unobserved_expected_receipt_refs),
    ...stringList(hints.domain_receipt_refs_should_cover),
  ]);
}

function requiredMonitorFreshnessRefs(route: JsonRecord) {
  const hints = isRecord(route.payload_ref_hints) ? route.payload_ref_hints : {};
  return uniqueStrings([
    ...stringList(route.unobserved_monitor_refs),
    ...stringList(hints.evidence_refs_should_cover_monitor_freshness),
  ]);
}

function looksLikePlaceholderRef(ref: string) {
  return ref === 'owner_receipt'
    || ref === 'monitor_freshness'
    || ref === 'no_regression'
    || ref === 'typed_blocker'
    || ref === 'domain_receipt'
    || ref.startsWith('owner_receipt:')
    || ref.startsWith('monitor_freshness:')
    || ref.startsWith('no_regression:')
    || ref.startsWith('typed_blocker:')
    || ref.startsWith('domain_receipt:');
}

function concreteRefs(refs: string[]) {
  return refs.filter((ref) => !looksLikePlaceholderRef(ref));
}

function uncoveredObligationRefs(input: {
  requiredRefs: string[];
  providedRefs: string[];
}) {
  const requiredConcreteRefs = concreteRefs(input.requiredRefs);
  const declaredObligationRefs = input.requiredRefs.filter(looksLikePlaceholderRef);
  const providedConcreteRefs = concreteRefs(input.providedRefs);
  return uniqueStrings([
    ...requiredConcreteRefs.filter((ref) => !input.providedRefs.includes(ref)),
    ...(declaredObligationRefs.length > 0 && providedConcreteRefs.length === 0
      ? declaredObligationRefs
      : []),
  ]);
}

export function buildStageProductionEvidencePayloadWorkorder(route: JsonRecord) {
  const expectedReceiptRefs = requiredExpectedReceiptRefs(route);
  const monitorFreshnessRefs = requiredMonitorFreshnessRefs(route);
  return {
    surface_kind: 'opl_stage_production_evidence_payload_workorder',
    request_id: stringValue(route.request_id),
    request_pack_id: stringValue(route.request_pack_id),
    action_id: stringValue(route.action_id),
    target_domain_id: stringValue(route.target_domain_id),
    command_domain_id: stringValue(route.domain_id),
    project_id: stringValue(route.project_id),
    stage_id: stringValue(route.stage_id),
    payload_owner: 'domain_repository_or_app_live_operator',
    route_requires_domain_or_app_payload: true,
    accepted_payload_fields: [
      'domain_receipt_refs',
      'evidence_refs',
      'typed_blocker_refs',
      'no_regression_refs',
      'owner_chain_refs',
    ],
    success_path_requires: {
      domain_receipt_refs_cover: concreteRefs(expectedReceiptRefs),
      domain_receipt_instance_required_for_declared_refs:
        expectedReceiptRefs.filter(looksLikePlaceholderRef),
      evidence_refs_cover_monitor_freshness: concreteRefs(monitorFreshnessRefs),
      evidence_instance_required_for_declared_monitor_refs:
        monitorFreshnessRefs.filter(looksLikePlaceholderRef),
      real_refs_required: true,
    },
    typed_blocker_path: {
      accepted: true,
      requires_typed_blocker_refs: true,
      may_close_instead_of_success: true,
    },
    no_regression_refs_recommended: true,
    owner_chain_refs_recommended: true,
    rejected_payload_policy: [
      'empty_payload_template',
      'placeholder_or_declared_contract_refs_without_instance_evidence',
      'domain_truth_body',
      'artifact_body',
      'memory_body',
    ],
    authority_boundary: {
      opl_records_refs_only: true,
      opl_can_write_domain_truth: false,
      opl_can_read_memory_body: false,
      opl_can_read_artifact_body: false,
      opl_can_authorize_quality_or_export: false,
      opl_can_generate_domain_owner_receipt: false,
      opl_can_generate_monitor_freshness: false,
    },
  };
}

export function preflightStageProductionEvidencePayload(
  route: JsonRecord,
  payload: JsonRecord,
): StageProductionEvidencePayloadPreflight {
  const expectedReceiptRefs = requiredExpectedReceiptRefs(route);
  const monitorFreshnessRefs = requiredMonitorFreshnessRefs(route);
  const domainReceiptRefs = refsFromPayload(payload, [
    'domain_receipt_refs',
    'domain_receipt_ref',
    'receipt_refs',
    'receipt_ref',
  ]);
  const evidenceRefs = refsFromPayload(payload, ['evidence_refs', 'evidence_ref']);
  const typedBlockerRefs = refsFromPayload(payload, ['typed_blocker_refs', 'typed_blocker_ref']);
  const noRegressionRefs = refsFromPayload(payload, ['no_regression_refs', 'no_regression_ref']);
  const ownerChainRefs = refsFromPayload(payload, ['owner_chain_refs', 'owner_chain_ref']);
  const allRefs = uniqueStrings([
    ...domainReceiptRefs,
    ...evidenceRefs,
    ...typedBlockerRefs,
    ...noRegressionRefs,
    ...ownerChainRefs,
  ]);
  const forbiddenPlaceholderRefs = allRefs.filter(looksLikePlaceholderRef);
  const uncoveredExpectedReceiptRefs = uncoveredObligationRefs({
    requiredRefs: expectedReceiptRefs,
    providedRefs: domainReceiptRefs,
  });
  const uncoveredMonitorFreshnessRefs = uncoveredObligationRefs({
    requiredRefs: monitorFreshnessRefs,
    providedRefs: evidenceRefs,
  });
  const missingPayloadFields = [
    domainReceiptRefs.length === 0 ? 'domain_receipt_refs' : null,
    evidenceRefs.length === 0 && monitorFreshnessRefs.length > 0 ? 'evidence_refs' : null,
  ].filter((field): field is string => Boolean(field));
  const typedBlockerPathReady = typedBlockerRefs.length > 0 && forbiddenPlaceholderRefs.length === 0;
  const successPathReady = allRefs.length > 0
    && forbiddenPlaceholderRefs.length === 0
    && uncoveredExpectedReceiptRefs.length === 0
    && uncoveredMonitorFreshnessRefs.length === 0;
  const canRecordRefsOnlyReceipt = successPathReady || typedBlockerPathReady;
  return {
    surface_kind: 'opl_stage_production_evidence_payload_preflight',
    status: canRecordRefsOnlyReceipt ? 'ready_to_record' : 'blocked',
    route_requires_domain_or_app_payload: true,
    success_path_ready: successPathReady,
    typed_blocker_path_ready: typedBlockerPathReady,
    can_record_refs_only_receipt: canRecordRefsOnlyReceipt,
    missing_payload_fields: typedBlockerPathReady ? [] : missingPayloadFields,
    forbidden_placeholder_refs: forbiddenPlaceholderRefs,
    uncovered_expected_receipt_refs: typedBlockerPathReady ? [] : uncoveredExpectedReceiptRefs,
    uncovered_monitor_freshness_refs: typedBlockerPathReady ? [] : uncoveredMonitorFreshnessRefs,
    accepted_ref_counts: {
      domain_receipt_refs: domainReceiptRefs.length,
      evidence_refs: evidenceRefs.length,
      typed_blocker_refs: typedBlockerRefs.length,
      no_regression_refs: noRegressionRefs.length,
      owner_chain_refs: ownerChainRefs.length,
    },
    policy:
      'record_requires_real_domain_app_or_live_refs_covering_unobserved_expected_receipt_and_monitor_freshness_or_domain_owned_typed_blocker_refs',
  };
}

export function assertStageProductionEvidencePayloadReady(route: JsonRecord, payload: JsonRecord) {
  const preflight = preflightStageProductionEvidencePayload(route, payload);
  if (preflight.can_record_refs_only_receipt) {
    return preflight;
  }
  throw new FrameworkContractError(
    'cli_usage_error',
    'Stage production evidence record action requires real domain/App/live refs before OPL can record refs-only receipt.',
    {
      action_id: stringValue(route.action_id),
      preflight,
      payload_workorder: buildStageProductionEvidencePayloadWorkorder(route),
    },
  );
}
