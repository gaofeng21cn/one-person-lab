import {
  inspectStageRunExecutionAuthorizationLedger,
  listStageRunExecutionAuthorizationReceipts,
  recordStageRunExecutionAuthorizationReceipts,
  verifyStageRunExecutionAuthorizationReceipt,
  type StageRunExecutionAuthorizationInput,
} from '../../stage-run-execution-authorization-ledger.ts';
import {
  assertNoArgs,
  assertSinglePayloadSource,
  buildUsageError,
  readPayloadFileText,
} from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  const scalar = optionalString(value);
  if (scalar) {
    return [scalar];
  }
  return Array.isArray(value)
    ? value.map(optionalString).filter((entry): entry is string => Boolean(entry))
    : [];
}

function optionalGeneration(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function optionalOwnerAnswerKind(value: unknown) {
  return value === 'owner_receipt'
    || value === 'quality_gate_receipt'
    || value === 'typed_blocker'
    || value === 'human_gate'
    || value === 'route_back_evidence'
    ? value
    : null;
}

function optionalRecord(value: unknown) {
  return isRecord(value) ? value : null;
}

function parseJsonObject(
  value: string,
  message: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw buildUsageError(message, spec, {
      parse_error: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(parsed)) {
    throw buildUsageError(message, spec);
  }
  return parsed;
}

function payloadInput(payload: Record<string, unknown>): StageRunExecutionAuthorizationInput {
  return {
    stage_run_id: optionalString(payload.stage_run_id),
    domain_id: optionalString(payload.domain_id),
    study_id: optionalString(payload.study_id),
    domain_context: optionalRecord(payload.domain_context),
    stage_id: optionalString(payload.stage_id),
    generation: optionalGeneration(payload.generation),
    phase: payload.phase === 'closeout' ? 'closeout' : 'launch',
    selected_executor: optionalString(payload.selected_executor),
    provider_attempt_ref: optionalString(payload.provider_attempt_ref),
    stage_attempt_id: optionalString(payload.stage_attempt_id),
    attempt_lease_ref: optionalString(payload.attempt_lease_ref),
    attempt_lease_status: optionalString(payload.attempt_lease_status),
    action_type: optionalString(payload.action_type),
    work_unit_id: optionalString(payload.work_unit_id),
    work_unit_fingerprint: optionalString(payload.work_unit_fingerprint),
    decision: optionalString(payload.decision),
    reason: optionalString(payload.reason),
    operator: optionalString(payload.operator),
    execution_authorization_decision_ref: optionalString(
      payload.execution_authorization_decision_ref,
    ),
    workspace_scope_ref: optionalString(payload.workspace_scope_ref),
    artifact_scope_ref: optionalString(payload.artifact_scope_ref),
    source_fingerprint: optionalString(payload.source_fingerprint),
    idempotency_key: optionalString(payload.idempotency_key),
    current_pointer_ref: optionalString(payload.current_pointer_ref),
    stage_manifest_ref: optionalString(payload.stage_manifest_ref),
    owner_answer_ref: optionalString(payload.owner_answer_ref),
    owner_answer_kind: optionalOwnerAnswerKind(payload.owner_answer_kind),
    closeout_receipt_ref: optionalString(payload.closeout_receipt_ref),
    owner_answer_stage_run_id: optionalString(payload.owner_answer_stage_run_id),
    owner_answer_generation: optionalGeneration(payload.owner_answer_generation),
    owner_answer_manifest_ref: optionalString(payload.owner_answer_manifest_ref),
    owner_answer_current_pointer_ref: optionalString(payload.owner_answer_current_pointer_ref),
    owner_answer_source_fingerprint: optionalString(payload.owner_answer_source_fingerprint),
    owner_answer_idempotency_key: optionalString(payload.owner_answer_idempotency_key),
    quality_gate_attempt_ref: optionalString(payload.quality_gate_attempt_ref),
    owner_answer_attempt_ref: optionalString(payload.owner_answer_attempt_ref),
    closeout_refs: stringList(payload.closeout_refs ?? payload.closeout_ref),
    receipt_ref: optionalString(payload.receipt_ref),
  };
}

function parseRecordArgs(args: string[], spec: Pick<CommandSpec, 'usage' | 'examples'>) {
  let payload: Record<string, unknown> | null = null;
  let dryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (token === '--json') {
      continue;
    }
    if (token === '--payload') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('runtime stage-run-authorization record requires --payload.', spec, {
          required_any: ['--payload', '--payload-file'],
        });
      }
      assertSinglePayloadSource(Boolean(payload), spec);
      payload = parseJsonObject(
        value,
        'runtime stage-run-authorization record payload must be a JSON object.',
        spec,
      );
      continue;
    }
    if (token === '--payload-file') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError(
          'runtime stage-run-authorization record requires --payload-file.',
          spec,
          { required_any: ['--payload', '--payload-file'] },
        );
      }
      assertSinglePayloadSource(Boolean(payload), spec);
      payload = parseJsonObject(
        readPayloadFileText(value, spec),
        'runtime stage-run-authorization record payload must be a JSON object.',
        spec,
      );
      continue;
    }
    throw buildUsageError(`Unknown option for runtime stage-run-authorization record: ${token}.`, spec, {
      option: token,
    });
  }
  if (!payload) {
    throw buildUsageError(
      'runtime stage-run-authorization record requires --payload or --payload-file.',
      spec,
      { required_any: ['--payload', '--payload-file'] },
    );
  }
  return {
    input: payloadInput(payload),
    dryRun,
  };
}

function parseVerifyArgs(args: string[], spec: Pick<CommandSpec, 'usage' | 'examples'>) {
  let receiptRef: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token !== '--receipt-ref') {
      throw buildUsageError(`Unknown option for runtime stage-run-authorization verify: ${token}.`, spec, {
        option: token,
      });
    }
    const value = args[++index];
    if (!value) {
      throw buildUsageError('runtime stage-run-authorization verify requires --receipt-ref value.', spec, {
        option: '--receipt-ref',
      });
    }
    receiptRef = value;
  }
  return { receipt_ref: receiptRef };
}

export function buildRuntimeStageRunAuthorizationCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime stage-run-authorization record': {
      usage: 'opl runtime stage-run-authorization record (--payload <json>|--payload-file <path>) [--dry-run]',
      summary:
        'Record OPL-owned refs-only StageRun execution authorization refs without creating domain owner answers.',
      examples: [
        'opl runtime stage-run-authorization record --payload \'{"stage_run_id":"app-stage-run:medautoscience:finalize-and-publication-handoff","domain_id":"medautoscience","study_id":"003-dpcc-primary-care-phenotype-treatment-gap","domain_context":{"domain_id":"medautoscience","study_id":"003-dpcc-primary-care-phenotype-treatment-gap","stage_id":"finalize_and_publication_handoff"},"stage_id":"finalize_and_publication_handoff","provider_attempt_ref":"opl://stage_attempts/sat_demo","stage_attempt_id":"sat_demo","attempt_lease_ref":"opl://stage_attempts/sat_demo/lease","action_type":"run_gate_clearing_batch","work_unit_id":"publication_gate_replay","work_unit_fingerprint":"sha256:demo","decision":"authorize","reason":"operator_authorized_exact_identity","operator":"human_operator:gaofeng","execution_authorization_decision_ref":"opl://stage_attempts/sat_demo/execution-authorization","workspace_scope_ref":"workspace:dm-cvd","artifact_scope_ref":"stage:publication-handoff","source_fingerprint":"sha256:demo","idempotency_key":"idem_demo"}\' --dry-run --json',
      ],
      handler: (args) => ({
        stage_run_execution_authorization_ledger_record:
          (() => {
            const parsed = parseRecordArgs(args, commandSpecs['runtime stage-run-authorization record']);
            return recordStageRunExecutionAuthorizationReceipts([parsed.input], {
              dry_run: parsed.dryRun,
            });
          })(),
      }),
    },
    'runtime stage-run-authorization verify': {
      usage: 'opl runtime stage-run-authorization verify [--receipt-ref <ref>]',
      summary:
        'Verify an OPL-owned StageRun execution authorization receipt without claiming domain readiness.',
      examples: [
        'opl runtime stage-run-authorization verify --receipt-ref opl://stage-run-execution-authorization/app-stage-run%3Amedautoscience%3Afinalize-and-publication-handoff/decision',
      ],
      handler: (args) => ({
        stage_run_execution_authorization_ledger_verify:
          verifyStageRunExecutionAuthorizationReceipt(
            parseVerifyArgs(args, commandSpecs['runtime stage-run-authorization verify']),
          ),
      }),
    },
    'runtime stage-run-authorization list': {
      usage: 'opl runtime stage-run-authorization list',
      summary:
        'List OPL-owned refs-only StageRun execution authorization receipts from local state.',
      examples: ['opl runtime stage-run-authorization list --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime stage-run-authorization list']);
        const inspection = inspectStageRunExecutionAuthorizationLedger();
        const receipts = inspection.receipts;
        return {
          stage_run_execution_authorization_ledger: {
            surface_kind: 'opl_stage_run_execution_authorization_ledger_projection',
            ledger_file: inspection.ledger_file,
            ledger_exists: inspection.ledger_exists,
            raw_receipt_count: inspection.raw_receipt_count,
            strict_schema_rejected_receipt_count:
              inspection.strict_schema_rejected_receipt_count,
            strict_schema_required_identity_fields:
              inspection.strict_schema_required_identity_fields,
            read_error: inspection.read_error,
            receipt_count: receipts.length,
            recorded_receipt_count:
              receipts.filter((receipt) => receipt.receipt_status === 'recorded').length,
            verified_receipt_count:
              receipts.filter((receipt) => receipt.receipt_status === 'verified').length,
            receipts,
            authority_boundary: {
              refs_only: true,
              owner: 'one-person-lab',
              can_execute_domain_action: false,
              can_write_domain_truth: false,
              can_create_owner_receipt: false,
              can_create_typed_blocker: false,
              can_close_domain_ready: false,
              can_claim_domain_ready: false,
              can_claim_production_ready: false,
            },
          },
        };
      },
    },
  };
  return commandSpecs;
}
