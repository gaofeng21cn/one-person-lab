import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundaryCore,
} from './authority-boundary.ts';
import {
  buildDomainDispatchEvidenceIdentityGuidance,
} from '../domain-dispatch-evidence-identity-guidance.ts';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function uniqueRefs<T extends { ref: string; role?: string | null }>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.role ?? ''}:${value.ref}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function commandRef(args: string[]) {
  return `opl ${args.map((arg) => (
    arg.includes(' ') || arg.includes('"') ? JSON.stringify(arg) : arg
  )).join(' ')}`;
}

function shellSingleQuotedJson(value: unknown) {
  return `'${JSON.stringify(value).replaceAll("'", "'\\''")}'`;
}

function runtimeActionExecuteCommand(input: {
  actionId: string;
  payload?: JsonRecord | null;
  dryRun?: boolean;
}) {
  return [
    'opl runtime action execute',
    `--action ${input.actionId}`,
    ...(input.dryRun ? ['--dry-run'] : []),
    ...(input.payload ? [`--payload ${shellSingleQuotedJson(input.payload)}`] : []),
  ].join(' ');
}

const DOMAIN_DISPATCH_SUCCESS_CLOSEOUT_PAYLOAD_REFS = [
  'domain_receipt_refs',
  'owner_chain_refs',
  'no_regression_refs',
];

const DOMAIN_DISPATCH_TYPED_BLOCKER_PAYLOAD_REFS = [
  'typed_blocker_refs',
];

const DOMAIN_DISPATCH_SUPPLEMENTAL_PAYLOAD_REFS = [
  'evidence_refs',
];

const DOMAIN_DISPATCH_RECORD_REQUIRED_PAYLOAD_REFS = [
  ...DOMAIN_DISPATCH_SUCCESS_CLOSEOUT_PAYLOAD_REFS,
  ...DOMAIN_DISPATCH_TYPED_BLOCKER_PAYLOAD_REFS,
];

const DOMAIN_DISPATCH_REQUIRED_RETURN_SHAPES = [
  'domain_owner_receipt_ref',
  'typed_blocker_ref',
  'domain_typed_blocker_ref',
  'owner_chain_ref',
  'no_regression_ref',
];

function refsOnlyAuthorityBoundary() {
  return {
    opl: 'app_operator_drilldown_refs_only',
    provider: 'runtime_completion_owner_not_domain_ready_owner',
    ...buildAppDrilldownRefsOnlyAuthorityBoundaryCore(),
  };
}

function domainDispatchRoute(attempt: JsonRecord, mode: 'record' | 'verify') {
  const domainId = stringValue(attempt.domain_id);
  const stageId = stringValue(attempt.stage_id);
  const stageAttemptId = stringValue(attempt.stage_attempt_id);
  if (!domainId || !stageAttemptId) {
    return null;
  }
  const requestId = `domain_dispatch:${domainId}:${stageAttemptId}`;
  const requestPackId = `${domainId}.domain_dispatch_evidence`;
  const sourceRef = stringValue(attempt.ref)
    ?? `/stage_attempt_workbench/attempts/${stageAttemptId}/domain_dispatch_evidence`;
  const targetIdentity = record(attempt.target_identity);
  const stageAttemptSourceFingerprint = stringValue(attempt.source_fingerprint);
  const actionId = `${requestId}:${mode}`;
  const recordMode = mode === 'record';
  const identityBindingGuidance = recordMode
    ? buildDomainDispatchEvidenceIdentityGuidance({
        routeDomainId: domainId,
        stageId,
        targetIdentity,
        stageAttemptSourceFingerprint,
      })
    : null;
  const recordedReceiptRef = stringList(attempt.dispatch_evidence_receipt_refs)[0] ?? null;
  const payloadTemplate = recordMode
    ? {
        domain_receipt_refs: [],
        typed_blocker_refs: [],
        no_regression_refs: [],
        owner_chain_refs: [],
        evidence_refs: [],
      }
    : null;
  const successPayloadExample = recordMode
    ? {
        domain_receipt_refs: [`<${domainId}-owner-receipt-ref>`],
        typed_blocker_refs: [],
        no_regression_refs: [`<${domainId}-no-regression-ref>`],
        owner_chain_refs: [`<${domainId}-owner-chain-ref>`],
        evidence_refs: [],
      }
    : null;
  const typedBlockerPayloadExample = recordMode
    ? {
        domain_receipt_refs: [],
        typed_blocker_refs: [`<${domainId}-typed-blocker-ref>`],
        no_regression_refs: [],
        owner_chain_refs: [],
        evidence_refs: [],
      }
    : null;
  const payloadWorkorder = recordMode
    ? {
        surface_kind: 'opl_domain_dispatch_evidence_payload_workorder',
        workorder_policy:
          'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
        payload_owner: 'domain_repository_or_app_live_operator',
        accepted_payload_paths: {
          success_refs_path: {
            required_any_operator_payload_refs: DOMAIN_DISPATCH_SUCCESS_CLOSEOUT_PAYLOAD_REFS,
            supplemental_operator_payload_refs: DOMAIN_DISPATCH_SUPPLEMENTAL_PAYLOAD_REFS,
            typed_blocker_refs_must_be_absent: true,
            closes_domain_ready: false,
            closes_production_ready: false,
          },
          typed_blocker_path: {
            required_operator_payload_refs: DOMAIN_DISPATCH_TYPED_BLOCKER_PAYLOAD_REFS,
            success_claimed: false,
            closes_domain_ready: false,
            closes_production_ready: false,
          },
        },
        required_evidence_refs: [
          `domain_dispatch:${domainId}:${stageAttemptId}:owner_receipt_or_typed_blocker`,
        ],
        required_return_shapes: DOMAIN_DISPATCH_REQUIRED_RETURN_SHAPES,
        success_refs_path_payload: successPayloadExample,
        typed_blocker_path_payload: typedBlockerPayloadExample,
        empty_payload_template_is_success_evidence: false,
        preflight_error_code: 'cli_usage_error',
        preflight_blocked_error_kind: 'domain_dispatch_evidence_payload_preflight_blocked',
        authority_boundary: {
          can_write_domain_truth: false,
          can_generate_domain_owner_receipt: false,
          can_generate_typed_blocker: false,
          can_close_domain_ready: false,
          can_claim_production_ready: false,
        },
      }
    : {};
  const args = [
    'agents',
    'evidence',
    'apply',
    '--domain',
    domainId,
    '--request-id',
    requestId,
    ...(mode === 'verify' ? ['--mode', 'verify'] : []),
    '--request-pack-id',
    requestPackId,
    '--source-ref',
    sourceRef,
    ...(mode === 'verify' && recordedReceiptRef ? ['--receipt-ref', recordedReceiptRef] : []),
  ];
  return {
    ref: commandRef(args),
    opl_cli_args: args,
    role: 'operator_action_route',
    action_id: actionId,
    action_kind: mode === 'verify'
      ? 'domain_dispatch_evidence_receipt_verify'
      : 'domain_dispatch_evidence_receipt_record',
    owner: 'opl',
    route_target_kind: 'opl_cli',
    route_status: mode === 'verify' ? 'verify_route_available' : 'record_route_available',
    route_status_detail: recordMode
      ? 'record_route_available_waiting_for_domain_owner_receipt_or_typed_blocker_payload'
      : 'verify_route_available_for_recorded_refs_only_domain_dispatch_receipt',
    request_scope: 'opl_owned_domain_dispatch_refs_only_receipt',
    execution_policy: 'opl_safe_action_shell',
    execution_surface: 'opl runtime action execute',
    route_closure_policy:
      'records_or_verifies_refs_only_domain_dispatch_owner_receipt_or_typed_blocker_without_domain_action_or_ready_claim',
    open_reason: recordMode
      ? 'domain_dispatch_attempt_missing_owner_receipt_or_typed_blocker_refs'
      : null,
    payload_requirement: recordMode
      ? 'domain_app_or_live_refs_payload_required_to_record_domain_dispatch_owner_receipt_or_typed_blocker'
      : 'previously_recorded_opl_refs_only_receipt_required_to_verify_domain_dispatch_evidence',
    payload_owner: recordMode ? 'domain_repository_or_app_live_operator' : 'opl_external_evidence_ledger',
    route_requires_domain_or_app_payload: recordMode,
    can_close_without_domain_or_app_payload: !recordMode,
    opl_generated_receipt_policy:
      'OPL_must_not_generate_domain_owner_receipts_typed_blockers_owner_chain_or_no_regression_refs',
    payload_template: payloadTemplate,
    payload_ref_hints: recordMode
      ? {
          domain_receipt_refs_should_cover: [
            `domain_dispatch:${domainId}:${stageAttemptId}:owner_receipt`,
          ],
          typed_blocker_refs_may_close_instead_of_success: true,
          owner_chain_refs_recommended: true,
          no_regression_refs_recommended: true,
          required_any_payload_refs: DOMAIN_DISPATCH_RECORD_REQUIRED_PAYLOAD_REFS,
          supplemental_payload_refs: DOMAIN_DISPATCH_SUPPLEMENTAL_PAYLOAD_REFS,
          evidence_refs_are_supplemental_context_only: true,
        }
      : null,
    payload_workorder: payloadWorkorder,
    payload_template_policy: recordMode
      ? 'template_is_empty_by_design_replace_with_real_domain_app_or_live_refs_before_submit'
      : 'verify_route_uses_previously_recorded_opl_refs_only_receipt_no_payload_required',
    payload_preflight_policy: recordMode
      ? 'domain_dispatch_evidence_payload_must_pass_success_refs_or_typed_blocker_path_preflight'
      : null,
    payload_preflight_error_code: recordMode ? 'cli_usage_error' : null,
    payload_preflight_blocked_error_kind: recordMode
      ? 'domain_dispatch_evidence_payload_preflight_blocked'
      : null,
    empty_payload_template_is_success_evidence: false,
    copyable_runtime_action_execute_commands: recordMode
      ? {
          dry_run_with_empty_template_blocks:
            runtimeActionExecuteCommand({ actionId, payload: payloadTemplate, dryRun: true }),
          dry_run_success_path:
            runtimeActionExecuteCommand({ actionId, payload: successPayloadExample, dryRun: true }),
          record_success_path:
            runtimeActionExecuteCommand({ actionId, payload: successPayloadExample }),
          dry_run_typed_blocker_path:
            runtimeActionExecuteCommand({ actionId, payload: typedBlockerPayloadExample, dryRun: true }),
          record_typed_blocker_path:
            runtimeActionExecuteCommand({ actionId, payload: typedBlockerPayloadExample }),
        }
      : {
          verify_recorded_receipt: runtimeActionExecuteCommand({ actionId }),
        },
    creates_domain_action: false,
    creates_owner_receipt: false,
    owner_receipt_refs: [],
    closes_domain_dispatch_owner_chain: mode === 'verify',
    stage_attempt_id: stageAttemptId,
    domain_id: domainId,
    stage_id: stageId,
    stage_attempt_source_fingerprint: stageAttemptSourceFingerprint,
    target_identity: targetIdentity,
    dispatch_identity_key: stringValue(attempt.dispatch_identity_key),
    dispatch_supersession_identity_key: stringValue(attempt.dispatch_supersession_identity_key),
    dispatch_identity_fields: record(attempt.dispatch_identity_fields),
    default_actionability_status: stringValue(attempt.default_actionability_status),
    default_actionable: attempt.default_actionable === true,
    superseded_by_stage_attempt_id: stringValue(attempt.superseded_by_stage_attempt_id),
    superseded_reason: stringValue(attempt.superseded_reason),
    identity_binding_policy:
      'record_payload_identity_must_not_conflict_with_stage_attempt_target_identity',
    identity_binding_guidance: identityBindingGuidance,
    request_id: requestId,
    request_pack_id: requestPackId,
    evidence_route_kind: 'domain_dispatch_evidence',
    evidence_source_ref: sourceRef,
    required_operator_payload_refs: mode === 'verify'
      ? []
      : DOMAIN_DISPATCH_RECORD_REQUIRED_PAYLOAD_REFS,
    supplemental_operator_payload_refs: mode === 'verify'
      ? []
      : DOMAIN_DISPATCH_SUPPLEMENTAL_PAYLOAD_REFS,
    optional_operator_payload_refs: [],
    required_evidence_refs: [
      `domain_dispatch:${domainId}:${stageAttemptId}:owner_receipt_or_typed_blocker`,
    ],
    required_return_shapes: DOMAIN_DISPATCH_REQUIRED_RETURN_SHAPES,
    can_execute: false as const,
    authority_boundary: {
      ...refsOnlyAuthorityBoundary(),
      can_record_domain_dispatch_owner_receipt_refs: true,
      can_record_domain_dispatch_typed_blocker_refs: true,
      creates_domain_action: false,
      creates_owner_receipt: false,
      closes_domain_ready: false,
      closes_production_ready: false,
    },
  };
}

export function buildDomainDispatchEvidenceReceiptRoutes(domainDispatchEvidence: JsonRecord) {
  return uniqueRefs(recordList(domainDispatchEvidence.attempts)
    .filter((attempt) => (
      stringList(attempt.owner_receipt_refs).length === 0
      && stringList(attempt.typed_blocker_refs).length === 0
      && attempt.default_actionable !== false
    ))
    .map((attempt) => {
      const hasRecordedButUnverifiedReceipt =
        stringValue(attempt.dispatch_evidence_receipt_status) === 'recorded';
      return domainDispatchRoute(attempt, hasRecordedButUnverifiedReceipt ? 'verify' : 'record');
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)));
}
