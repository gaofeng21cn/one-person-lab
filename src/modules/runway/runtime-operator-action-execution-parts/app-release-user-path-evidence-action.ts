import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  appReleaseUserPathEvidencePayloadPreflight,
  recordAppReleaseUserPathEvidenceReceipts,
  verifyAppReleaseUserPathEvidenceReceipt,
  type AppReleaseUserPathEvidenceReceiptInput,
} from '../../ledger/index.ts';

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
    install_evidence_refs: refsFromPayload(payload, [
      'install_evidence_refs',
      'install_evidence_ref',
    ]),
    long_operator_evidence_refs: refsFromPayload(payload, [
      'long_operator_evidence_refs',
      'long_operator_evidence_ref',
    ]),
    release_owner_receipt_refs: refsFromPayload(payload, [
      'release_owner_receipt_refs',
      'release_owner_receipt_ref',
    ]),
    typed_blocker_refs: refsFromPayload(payload, ['typed_blocker_refs', 'typed_blocker_ref']),
    receipt_ref: stringValue(payload.receipt_ref),
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
  const preflight = appReleaseUserPathEvidencePayloadPreflight(input);
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
