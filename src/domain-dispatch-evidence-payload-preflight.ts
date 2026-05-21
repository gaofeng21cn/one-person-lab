import { FrameworkContractError } from './contracts.ts';
import type { JsonRecord } from './runtime-tray-snapshot-types.ts';

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function refsFromPayload(payload: JsonRecord, keys: string[]) {
  return keys.flatMap((key) => {
    const value = payload[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return [value.trim()];
    }
    return stringList(value);
  });
}

function looksLikePlaceholderRef(ref: string) {
  return ref.startsWith('<') && ref.endsWith('>');
}

export function preflightDomainDispatchEvidencePayload(payload: JsonRecord) {
  const domainReceiptRefs = refsFromPayload(payload, [
    'domain_receipt_refs',
    'domain_receipt_ref',
    'receipt_refs',
    'receipt_ref',
  ]);
  const typedBlockerRefs = refsFromPayload(payload, ['typed_blocker_refs', 'typed_blocker_ref']);
  const noRegressionRefs = refsFromPayload(payload, ['no_regression_refs', 'no_regression_ref']);
  const ownerChainRefs = refsFromPayload(payload, ['owner_chain_refs', 'owner_chain_ref']);
  const evidenceRefs = refsFromPayload(payload, ['evidence_refs', 'evidence_ref']);
  const allRefs = [
    ...domainReceiptRefs,
    ...typedBlockerRefs,
    ...noRegressionRefs,
    ...ownerChainRefs,
    ...evidenceRefs,
  ];
  const forbiddenPlaceholderRefs = allRefs.filter(looksLikePlaceholderRef);
  const successPathReady = (
    domainReceiptRefs.length > 0
    || ownerChainRefs.length > 0
    || noRegressionRefs.length > 0
    || evidenceRefs.length > 0
  ) && typedBlockerRefs.length === 0;
  const typedBlockerPathReady = typedBlockerRefs.length > 0;
  const canRecordRefsOnlyReceipt = allRefs.length > 0
    && forbiddenPlaceholderRefs.length === 0
    && (successPathReady || typedBlockerPathReady);
  return {
    surface_kind: 'opl_domain_dispatch_evidence_payload_preflight',
    status: canRecordRefsOnlyReceipt ? 'ready_to_record' : 'blocked',
    route_requires_domain_or_app_payload: true,
    required_any_operator_payload_refs: [
      'domain_receipt_refs',
      'typed_blocker_refs',
      'owner_chain_refs',
      'no_regression_refs',
      'evidence_refs',
    ],
    success_path_ready: successPathReady && forbiddenPlaceholderRefs.length === 0,
    typed_blocker_path_ready: typedBlockerPathReady && forbiddenPlaceholderRefs.length === 0,
    can_record_refs_only_receipt: canRecordRefsOnlyReceipt,
    forbidden_placeholder_refs: forbiddenPlaceholderRefs,
    missing_payload_fields: allRefs.length === 0
      ? ['domain_receipt_refs_or_typed_blocker_refs_or_owner_chain_refs_or_no_regression_refs_or_evidence_refs']
      : [],
    accepted_ref_counts: {
      domain_receipt_refs: domainReceiptRefs.length,
      typed_blocker_refs: typedBlockerRefs.length,
      no_regression_refs: noRegressionRefs.length,
      owner_chain_refs: ownerChainRefs.length,
      evidence_refs: evidenceRefs.length,
    },
    policy:
      'record_requires_real_domain_app_or_live_owner_receipt_typed_blocker_owner_chain_no_regression_or_evidence_refs',
  };
}

export function assertDomainDispatchEvidencePayloadReady(route: JsonRecord, payload: JsonRecord) {
  const preflight = preflightDomainDispatchEvidencePayload(payload);
  if (preflight.can_record_refs_only_receipt) {
    return preflight;
  }
  throw new FrameworkContractError(
    'cli_usage_error',
    'Domain dispatch evidence record action requires real domain/App/live refs before OPL can record refs-only receipt.',
    {
      action_id: stringValue(route.action_id),
      error_kind: 'domain_dispatch_evidence_payload_preflight_blocked',
      required_any_operator_payload_refs: preflight.required_any_operator_payload_refs,
      empty_payload_template_is_success_evidence: false,
      preflight,
    },
  );
}
