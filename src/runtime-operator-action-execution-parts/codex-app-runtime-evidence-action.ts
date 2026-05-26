import { FrameworkContractError } from '../contracts.ts';
import {
  recordCodexAppRuntimeEvidenceReceipts,
  verifyCodexAppRuntimeEvidenceReceipt,
  type CodexAppRuntimeEvidenceReceiptInput,
} from '../codex-app-runtime-evidence-ledger.ts';

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

function codexAppRuntimeEvidencePayload(payload: JsonRecord): CodexAppRuntimeEvidenceReceiptInput {
  return {
    temporal_hosted_long_soak_refs: refsFromPayload(payload, [
      'temporal_hosted_long_soak_refs',
      'temporal_hosted_long_soak_ref',
    ]),
    provider_state_linkage_refs: refsFromPayload(payload, [
      'provider_state_linkage_refs',
      'provider_state_linkage_ref',
    ]),
    operator_evidence_refs: refsFromPayload(payload, [
      'operator_evidence_refs',
      'operator_evidence_ref',
    ]),
    typed_blocker_refs: refsFromPayload(payload, ['typed_blocker_refs', 'typed_blocker_ref']),
    receipt_ref: stringValue(payload.receipt_ref),
  };
}

function codexAppRuntimeEvidenceRefCount(input: CodexAppRuntimeEvidenceReceiptInput) {
  return [
    ...(input.temporal_hosted_long_soak_refs ?? []),
    ...(input.provider_state_linkage_refs ?? []),
    ...(input.operator_evidence_refs ?? []),
    ...(input.typed_blocker_refs ?? []),
  ].length;
}

function codexAppRuntimeEvidenceDryRunPreflight(input: CodexAppRuntimeEvidenceReceiptInput) {
  return {
    surface_kind: 'opl_codex_app_runtime_evidence_payload_preflight',
    status: codexAppRuntimeEvidenceRefCount(input) > 0
      ? 'payload_refs_observed'
      : 'payload_required',
    required_any: [
      'temporal_hosted_long_soak_refs',
      'provider_state_linkage_refs',
      'operator_evidence_refs',
      'typed_blocker_refs',
    ],
    empty_payload_template_is_success_evidence: false,
    payload_owner: 'app_live_operator_or_opl_provider_owner',
    authority_boundary: {
      refs_only: true,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_generate_typed_blocker: false,
      can_close_long_soak: false,
      can_claim_production_ready: false,
      can_drive_long_running_task_loop: false,
    },
  };
}

export function codexAppRuntimeEvidenceExecution(
  route: JsonRecord,
  payload: JsonRecord,
  options: { dryRun: boolean },
) {
  const actionKind = stringValue(route.action_kind);
  if (actionKind === 'codex_app_runtime_evidence_receipt_verify') {
    const receiptRef = stringValue(route.receipt_ref) ?? stringValue(payload.receipt_ref);
    return {
      executionKind: 'opl_cli_codex_app_runtime_evidence_apply',
      runtimeArgs: [
        'runtime',
        'codex-app-runtime-evidence',
        'verify',
        ...(receiptRef ? ['--receipt-ref', receiptRef] : []),
      ],
      result: options.dryRun
        ? null
        : {
            codex_app_runtime_evidence_ledger_verify:
              verifyCodexAppRuntimeEvidenceReceipt({ receipt_ref: receiptRef }),
          },
    };
  }

  const input = codexAppRuntimeEvidencePayload(payload);
  if (!options.dryRun && codexAppRuntimeEvidenceRefCount(input) === 0) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Codex App runtime evidence record action requires refs-only payload evidence.',
      {
        action_id: stringValue(route.action_id),
        required_any: codexAppRuntimeEvidenceDryRunPreflight(input).required_any,
      },
    );
  }
  return {
    executionKind: 'opl_cli_codex_app_runtime_evidence_apply',
    runtimeArgs: ['runtime', 'codex-app-runtime-evidence', 'record'],
    result: options.dryRun
      ? {
          codex_app_runtime_evidence_payload_preflight:
            codexAppRuntimeEvidenceDryRunPreflight(input),
        }
      : {
          codex_app_runtime_evidence_ledger_record:
            recordCodexAppRuntimeEvidenceReceipts([input]),
        },
  };
}
