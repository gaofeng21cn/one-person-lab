import { FrameworkContractError } from '../charter/index.ts';

type JsonRecord = Record<string, unknown>;

export type StageProductionEvidencePayloadPreflightStatus = 'ready_to_record' | 'blocked';

export type StageProductionEvidencePayloadPreflight = {
  surface_kind: 'opl_stage_production_evidence_payload_preflight';
  status: StageProductionEvidencePayloadPreflightStatus;
  route_requires_domain_or_app_payload: boolean;
  required_any_operator_payload_refs: string[];
  optional_operator_payload_refs: string[];
  success_path_ready: boolean;
  typed_blocker_path_ready: boolean;
  can_record_refs_only_receipt: boolean;
  missing_payload_fields: string[];
  forbidden_payload_fields: string[];
  forbidden_placeholder_refs: string[];
  uncovered_expected_receipt_refs: string[];
  uncovered_monitor_freshness_refs: string[];
  uncovered_source_scope_refs: string[];
  uncovered_runtime_event_refs: string[];
  accepted_ref_counts: {
    domain_receipt_refs: number;
    evidence_refs: number;
    typed_blocker_refs: number;
    no_regression_refs: number;
    owner_chain_refs: number;
    source_scope_refs: number;
    runtime_event_refs: number;
  };
  policy: string;
};

export const STAGE_PRODUCTION_EVIDENCE_REQUIRED_PAYLOAD_REFS = [
  'domain_receipt_refs',
  'evidence_refs',
  'typed_blocker_refs',
] as const;

export const STAGE_PRODUCTION_EVIDENCE_OPTIONAL_PAYLOAD_REFS = [
  'no_regression_refs',
  'owner_chain_refs',
] as const;

export const STAGE_PRODUCTION_EVIDENCE_COVERAGE_PAYLOAD_REFS = [
  ...STAGE_PRODUCTION_EVIDENCE_REQUIRED_PAYLOAD_REFS,
  'source_scope_refs',
  'runtime_event_refs',
] as const;

const FORBIDDEN_PAYLOAD_FIELDS = [
  'domain_truth',
  'domain_truth_body',
  'artifact',
  'artifact_body',
  'memory',
  'memory_body',
  'quality_verdict',
  'export_verdict',
  'domain_ready',
  'production_ready',
] as const;

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

function requiredSourceScopeRefs(route: JsonRecord) {
  const hints = isRecord(route.payload_ref_hints) ? route.payload_ref_hints : {};
  return uniqueStrings([
    ...stringList(route.unobserved_source_scope_refs),
    ...stringList(hints.source_scope_refs_should_cover),
  ]);
}

function requiredRuntimeEventRefs(route: JsonRecord) {
  const hints = isRecord(route.payload_ref_hints) ? route.payload_ref_hints : {};
  return uniqueStrings([
    ...stringList(route.unobserved_runtime_event_refs),
    ...stringList(hints.runtime_event_refs_should_cover),
  ]);
}

function looksLikePlaceholderRef(ref: string) {
  return ref.includes('<')
    || ref.includes('>')
    || ref === 'owner_receipt'
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
  const hints = isRecord(route.payload_ref_hints) ? route.payload_ref_hints : {};
  const expectedReceiptRefs = requiredExpectedReceiptRefs(route);
  const monitorFreshnessRefs = requiredMonitorFreshnessRefs(route);
  const sourceScopeRefs = requiredSourceScopeRefs(route);
  const runtimeEventRefs = requiredRuntimeEventRefs(route);
  const actionId = stringValue(route.action_id);
  const successPayloadTemplate = {
    domain_receipt_refs: concreteRefs(expectedReceiptRefs).length > 0
      ? concreteRefs(expectedReceiptRefs)
      : ['<domain-owned-receipt-ref>'],
    evidence_refs: concreteRefs(monitorFreshnessRefs).length > 0
      ? concreteRefs(monitorFreshnessRefs)
      : ['<monitor-freshness-evidence-ref>'],
    typed_blocker_refs: [],
    source_scope_refs: concreteRefs(sourceScopeRefs),
    runtime_event_refs: concreteRefs(runtimeEventRefs),
  };
  const typedBlockerPayloadTemplate = {
    domain_receipt_refs: [],
    evidence_refs: [],
    typed_blocker_refs: ['<domain-owned-typed-blocker-ref>'],
  };
  const runtimeActionCommand = (payload: JsonRecord, dryRun = false) => actionId
    ? [
        'opl runtime action execute',
        `--action ${actionId}`,
        ...(dryRun ? ['--dry-run'] : []),
        `--payload '${JSON.stringify(payload)}'`,
      ].join(' ')
    : null;
  return {
    surface_kind: 'opl_stage_production_evidence_payload_workorder',
    request_id: stringValue(route.request_id),
    request_pack_id: stringValue(route.request_pack_id),
    action_id: actionId,
    target_domain_id: stringValue(route.target_domain_id),
    command_domain_id: stringValue(route.domain_id),
    project_id: stringValue(route.project_id),
    stage_id: stringValue(route.stage_id),
    payload_owner: 'domain_repository_or_app_live_operator',
    route_requires_domain_or_app_payload: true,
    required_any_payload_refs: [...STAGE_PRODUCTION_EVIDENCE_COVERAGE_PAYLOAD_REFS],
    accepted_payload_fields: [
      ...STAGE_PRODUCTION_EVIDENCE_COVERAGE_PAYLOAD_REFS,
      ...STAGE_PRODUCTION_EVIDENCE_OPTIONAL_PAYLOAD_REFS,
      'receipt_ref',
    ],
    optional_payload_fields: [...STAGE_PRODUCTION_EVIDENCE_OPTIONAL_PAYLOAD_REFS],
    success_path_requires: {
      domain_receipt_refs_cover: concreteRefs(expectedReceiptRefs),
      domain_receipt_instance_required_for_declared_refs:
        expectedReceiptRefs.filter(looksLikePlaceholderRef),
      evidence_refs_cover_monitor_freshness: concreteRefs(monitorFreshnessRefs),
      evidence_instance_required_for_declared_monitor_refs:
        monitorFreshnessRefs.filter(looksLikePlaceholderRef),
      source_scope_refs_cover: concreteRefs(sourceScopeRefs),
      runtime_event_refs_cover: concreteRefs(runtimeEventRefs),
      real_refs_required: true,
    },
    typed_blocker_path: {
      accepted: true,
      requires_typed_blocker_refs: true,
      may_close_instead_of_success: true,
    },
    domain_owner_payload_candidate_refs: Array.isArray(hints.domain_owner_payload_candidate_refs)
      ? hints.domain_owner_payload_candidate_refs.filter(isRecord)
      : [],
    copyable_runtime_action_execute_commands: {
      dry_run_success_path: runtimeActionCommand(successPayloadTemplate, true),
      record_success_path: runtimeActionCommand(successPayloadTemplate),
      dry_run_typed_blocker_path: runtimeActionCommand(typedBlockerPayloadTemplate, true),
      record_typed_blocker_path: runtimeActionCommand(typedBlockerPayloadTemplate),
    },
    no_regression_refs_recommended: true,
    owner_chain_refs_recommended: true,
    empty_payload_template_is_success_evidence: false,
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
  const sourceScopeRefs = requiredSourceScopeRefs(route);
  const runtimeEventRefs = requiredRuntimeEventRefs(route);
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
  const sourceScopePayloadRefs = refsFromPayload(payload, ['source_scope_refs', 'source_scope_ref']);
  const runtimeEventPayloadRefs = refsFromPayload(payload, ['runtime_event_refs', 'runtime_event_ref']);
  const forbiddenPayloadFields = FORBIDDEN_PAYLOAD_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(payload, field)
  );
  const allRefs = uniqueStrings([
    ...domainReceiptRefs,
    ...evidenceRefs,
    ...typedBlockerRefs,
    ...noRegressionRefs,
    ...ownerChainRefs,
    ...sourceScopePayloadRefs,
    ...runtimeEventPayloadRefs,
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
  const uncoveredSourceScopeRefs = uncoveredObligationRefs({
    requiredRefs: sourceScopeRefs,
    providedRefs: sourceScopePayloadRefs,
  });
  const uncoveredRuntimeEventRefs = uncoveredObligationRefs({
    requiredRefs: runtimeEventRefs,
    providedRefs: runtimeEventPayloadRefs,
  });
  const missingPayloadFields = [
    domainReceiptRefs.length === 0 && expectedReceiptRefs.length > 0 ? 'domain_receipt_refs' : null,
    evidenceRefs.length === 0 && monitorFreshnessRefs.length > 0 ? 'evidence_refs' : null,
    sourceScopePayloadRefs.length === 0 && sourceScopeRefs.length > 0 ? 'source_scope_refs' : null,
    runtimeEventPayloadRefs.length === 0 && runtimeEventRefs.length > 0 ? 'runtime_event_refs' : null,
  ].filter((field): field is string => Boolean(field));
  const typedBlockerPathReady = typedBlockerRefs.length > 0 && forbiddenPlaceholderRefs.length === 0;
  const successPathReady = allRefs.length > 0
    && forbiddenPlaceholderRefs.length === 0
    && forbiddenPayloadFields.length === 0
    && uncoveredExpectedReceiptRefs.length === 0
    && uncoveredMonitorFreshnessRefs.length === 0
    && uncoveredSourceScopeRefs.length === 0
    && uncoveredRuntimeEventRefs.length === 0;
  const typedBlockerPathReadyWithPolicy = typedBlockerPathReady
    && forbiddenPayloadFields.length === 0;
  const canRecordRefsOnlyReceipt = successPathReady || typedBlockerPathReadyWithPolicy;
  return {
    surface_kind: 'opl_stage_production_evidence_payload_preflight',
    status: canRecordRefsOnlyReceipt ? 'ready_to_record' : 'blocked',
    route_requires_domain_or_app_payload: true,
    required_any_operator_payload_refs: [...STAGE_PRODUCTION_EVIDENCE_COVERAGE_PAYLOAD_REFS],
    optional_operator_payload_refs: [...STAGE_PRODUCTION_EVIDENCE_OPTIONAL_PAYLOAD_REFS],
    success_path_ready: successPathReady,
    typed_blocker_path_ready: typedBlockerPathReadyWithPolicy,
    can_record_refs_only_receipt: canRecordRefsOnlyReceipt,
    missing_payload_fields: typedBlockerPathReadyWithPolicy ? [] : missingPayloadFields,
    forbidden_payload_fields: forbiddenPayloadFields,
    forbidden_placeholder_refs: forbiddenPlaceholderRefs,
    uncovered_expected_receipt_refs: typedBlockerPathReadyWithPolicy ? [] : uncoveredExpectedReceiptRefs,
    uncovered_monitor_freshness_refs: typedBlockerPathReadyWithPolicy ? [] : uncoveredMonitorFreshnessRefs,
    uncovered_source_scope_refs: typedBlockerPathReadyWithPolicy ? [] : uncoveredSourceScopeRefs,
    uncovered_runtime_event_refs: typedBlockerPathReadyWithPolicy ? [] : uncoveredRuntimeEventRefs,
    accepted_ref_counts: {
      domain_receipt_refs: domainReceiptRefs.length,
      evidence_refs: evidenceRefs.length,
      typed_blocker_refs: typedBlockerRefs.length,
      no_regression_refs: noRegressionRefs.length,
      owner_chain_refs: ownerChainRefs.length,
      source_scope_refs: sourceScopePayloadRefs.length,
      runtime_event_refs: runtimeEventPayloadRefs.length,
    },
    policy:
      'record_requires_real_domain_app_or_live_refs_covering_unobserved_expected_receipt_source_scope_runtime_event_and_monitor_freshness_or_domain_owned_typed_blocker_refs',
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
      error_kind: 'stage_production_evidence_payload_preflight_blocked',
      required_any_operator_payload_refs: [...STAGE_PRODUCTION_EVIDENCE_COVERAGE_PAYLOAD_REFS],
      empty_payload_template_is_success_evidence: false,
      preflight,
      payload_workorder: buildStageProductionEvidencePayloadWorkorder(route),
    },
  );
}
