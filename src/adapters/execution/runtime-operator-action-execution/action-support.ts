import { domainDispatchEvidencePayloadRefs } from '../../../authority/evidence/index.ts';
import { record, stringValue, type JsonRecord } from '../../../kernel/json-record.ts';
import { externalEvidenceApplyArgs } from './external-evidence-action.ts';

export const SUPPORTED_OPL_ACTION_ROUTE_KINDS = [
  'stage_attempt_query',
  'stage_production_attempt_request',
  'stage_production_attempt_start',
  'external_evidence_receipt_record',
  'external_evidence_receipt_verify',
  'evidence_gate_receipt_record',
  'evidence_gate_receipt_verify',
  'functional_privatization_semantic_equivalence_receipt_record',
  'stage_production_evidence_receipt_record',
  'stage_production_evidence_receipt_verify',
  'domain_dispatch_evidence_receipt_record',
  'domain_dispatch_evidence_receipt_verify',
  'app_release_user_path_evidence_receipt_record',
  'app_release_user_path_evidence_receipt_verify',
  'codex_app_runtime_evidence_receipt_record',
  'codex_app_runtime_evidence_receipt_verify',
  'domain_owner_payload_summary_receipt_record',
  'domain_owner_payload_summary_receipt_verify',
  'owner_evidence_sustained_consumption_receipt_record',
  'owner_evidence_sustained_consumption_receipt_verify',
  'provider_worker_start',
  'provider_worker_restart',
  'progress_first_attempt_supervision',
  'provider_slo_cadence_execution',
  'provider_scheduler_status',
  'provider_scheduler_install',
  'provider_scheduler_trigger',
  'legacy_cleanup_apply',
  'legacy_cleanup_verify',
];

function recordOrNull(value: unknown): JsonRecord | null {
  const payload = record(value);
  return payload === value ? payload : null;
}

export function blockedActionRouteExecution(
  route: JsonRecord,
  authorityBoundary: JsonRecord,
) {
  const routeStatus = stringValue(route.route_status);
  const actionabilityStatus = stringValue(route.default_actionability_status);
  if (
    routeStatus?.startsWith('blocked_by_')
    || actionabilityStatus?.startsWith('blocked_by_')
    || route.can_submit_to_safe_action_shell === false
  ) {
    return {
      execution_status: 'blocked',
      execution_kind: 'blocked_safe_action_route',
      route_ref: stringValue(route.ref) ?? stringValue(route.action_ref),
      action_kind: stringValue(route.action_kind),
      executed_runtime_command: null,
      result: {
        route_status: routeStatus,
        default_actionability_status: actionabilityStatus,
        route_status_detail: stringValue(route.route_status_detail),
        can_submit_to_safe_action_shell: route.can_submit_to_safe_action_shell === true,
        provider_worker_mutation_guard: recordOrNull(route.provider_worker_mutation_guard),
        provider_worker_blocked_action_id: stringValue(route.provider_worker_blocked_action_id),
        authority_boundary: authorityBoundary,
      },
    };
  }
  return null;
}

export function domainDispatchExternalEvidenceApplyArgs(
  route: JsonRecord,
  payload: JsonRecord,
  commandOrSurfaceRef: string,
  options: { allowEmptyRecordPayload?: boolean } = {},
) {
  const refs = domainDispatchEvidencePayloadRefs(payload, route);
  return externalEvidenceApplyArgs(route, {
    ...payload,
    domain_receipt_refs: refs.domainReceiptRefs,
    typed_blocker_refs: refs.typedBlockerRefs,
    no_regression_refs: refs.noRegressionRefs,
    owner_chain_refs: refs.ownerChainRefs,
    evidence_refs: [...new Set([...refs.evidenceRefs, ...refs.progressArtifactRefs])],
  }, commandOrSurfaceRef, options);
}
