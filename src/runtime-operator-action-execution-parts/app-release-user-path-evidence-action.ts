import { FrameworkContractError } from '../contracts.ts';
import {
  recordAppReleaseUserPathEvidenceReceipts,
  verifyAppReleaseUserPathEvidenceReceipt,
  type AppReleaseUserPathEvidenceReceiptInput,
} from '../app-release-user-path-evidence-ledger.ts';

type JsonRecord = Record<string, unknown>;

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

function appReleaseUserPathEvidencePayload(payload: JsonRecord): AppReleaseUserPathEvidenceReceiptInput {
  return {
    release_package_refs: refsFromPayload(payload, ['release_package_refs', 'release_package_ref']),
    screenshot_refs: refsFromPayload(payload, ['screenshot_refs', 'screenshot_ref']),
    reload_prompt_user_path_refs: refsFromPayload(payload, [
      'reload_prompt_user_path_refs',
      'reload_prompt_user_path_ref',
    ]),
    provider_state_linkage_refs: refsFromPayload(payload, [
      'provider_state_linkage_refs',
      'provider_state_linkage_ref',
    ]),
    long_operator_evidence_refs: refsFromPayload(payload, [
      'long_operator_evidence_refs',
      'long_operator_evidence_ref',
    ]),
    typed_blocker_refs: refsFromPayload(payload, ['typed_blocker_refs', 'typed_blocker_ref']),
    receipt_ref: stringValue(payload.receipt_ref),
  };
}

function appReleaseUserPathEvidenceSuccessRefCount(input: AppReleaseUserPathEvidenceReceiptInput) {
  return [
    ...(input.release_package_refs ?? []),
    ...(input.screenshot_refs ?? []),
    ...(input.reload_prompt_user_path_refs ?? []),
    ...(input.provider_state_linkage_refs ?? []),
    ...(input.long_operator_evidence_refs ?? []),
  ].length;
}

function appReleaseUserPathEvidenceDryRunPreflight(input: AppReleaseUserPathEvidenceReceiptInput) {
  const successRefCount = appReleaseUserPathEvidenceSuccessRefCount(input);
  const typedBlockerRefCount = input.typed_blocker_refs?.length ?? 0;
  const refCount = successRefCount + typedBlockerRefCount;
  const mixedPayloadPath = successRefCount > 0 && typedBlockerRefCount > 0;
  return {
    surface_kind: 'opl_app_release_user_path_evidence_payload_preflight',
    status: mixedPayloadPath
      ? 'blocked'
      : refCount > 0
        ? 'payload_refs_observed'
        : 'payload_required',
    selected_payload_path: mixedPayloadPath
      ? 'blocked'
      : typedBlockerRefCount > 0
        ? 'typed_blocker_path'
        : successRefCount > 0
          ? 'app_release_user_path_refs_path'
          : 'blocked',
    can_record_refs_only_receipt: refCount > 0 && !mixedPayloadPath,
    accepted_ref_counts: {
      release_package_refs: input.release_package_refs?.length ?? 0,
      screenshot_refs: input.screenshot_refs?.length ?? 0,
      reload_prompt_user_path_refs: input.reload_prompt_user_path_refs?.length ?? 0,
      provider_state_linkage_refs: input.provider_state_linkage_refs?.length ?? 0,
      long_operator_evidence_refs: input.long_operator_evidence_refs?.length ?? 0,
      typed_blocker_refs: typedBlockerRefCount,
    },
    conflicting_payload_fields: mixedPayloadPath ? ['typed_blocker_refs'] : [],
    payload_path_policy:
      'operator_must_choose_real_app_release_user_path_refs_path_or_release_owner_typed_blocker_path_empty_template_blocks',
    required_any: [
      'release_package_refs',
      'screenshot_refs',
      'reload_prompt_user_path_refs',
      'provider_state_linkage_refs',
      'long_operator_evidence_refs',
      'typed_blocker_refs',
    ],
    empty_payload_template_is_success_evidence: false,
    payload_owner: 'app_live_operator_or_release_owner',
    authority_boundary: {
      refs_only: true,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_claim_release_ready: false,
      can_claim_production_ready: false,
      can_close_app_release_user_path: false,
    },
  };
}

export function appReleaseUserPathEvidenceExecution(
  route: JsonRecord,
  payload: JsonRecord,
  options: { dryRun: boolean },
) {
  const actionKind = stringValue(route.action_kind);
  if (actionKind === 'app_release_user_path_evidence_receipt_verify') {
    const receiptRef = stringValue(route.receipt_ref) ?? stringValue(payload.receipt_ref);
    return {
      executionKind: 'opl_cli_app_release_user_path_evidence_apply',
      runtimeArgs: [
        'runtime',
        'app-release-evidence',
        'verify',
        ...(receiptRef ? ['--receipt-ref', receiptRef] : []),
      ],
      result: options.dryRun
        ? null
        : {
            app_release_user_path_evidence_ledger_verify:
              verifyAppReleaseUserPathEvidenceReceipt({ receipt_ref: receiptRef }),
          },
    };
  }

  const input = appReleaseUserPathEvidencePayload(payload);
  const preflight = appReleaseUserPathEvidenceDryRunPreflight(input);
  if (!options.dryRun && preflight.can_record_refs_only_receipt !== true) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'App release/user-path evidence record action requires refs-only payload evidence.',
      {
        action_id: stringValue(route.action_id),
        error_kind: 'app_release_user_path_evidence_payload_preflight_blocked',
        receipt_recorded: false,
        required_any: preflight.required_any,
        preflight,
      },
    );
  }
  return {
    executionKind: 'opl_cli_app_release_user_path_evidence_apply',
    runtimeArgs: ['runtime', 'app-release-evidence', 'record'],
    result: options.dryRun
      ? {
          app_release_user_path_evidence_payload_preflight:
            preflight,
        }
      : {
          app_release_user_path_evidence_ledger_record:
            recordAppReleaseUserPathEvidenceReceipts([input]),
        },
  };
}
