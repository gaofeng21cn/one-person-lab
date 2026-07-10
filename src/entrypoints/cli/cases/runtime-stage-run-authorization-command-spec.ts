import {
  inspectStageRunExecutionAuthorizationLedger,
  listStageRunExecutionAuthorizationReceipts,
  recordStageRunExecutionAuthorizationReceipts,
  verifyStageRunExecutionAuthorizationReceipt,
  type StageRunExecutionAuthorizationInput,
} from '../../../modules/stagecraft/stage-run-execution-authorization-ledger.ts';
import {
  assertNoArgs,
  assertSinglePayloadSource,
  buildUsageError,
  parseCommandOptions,
  readPayloadFileText,
} from '../modules/support.ts';
import {
  readJsonObject,
  readOptionalString,
  readStringList,
} from '../modules/json-boundary.ts';
import type { CommandSpec } from '../modules/support.ts';

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
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseJsonObject(
  value: string,
  message: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  return readJsonObject(value, spec, {
    parseErrorMessage: message,
    objectErrorMessage: message,
  });
}

function payloadInput(payload: Record<string, unknown>): StageRunExecutionAuthorizationInput {
  return {
    stage_run_id: readOptionalString(payload.stage_run_id),
    domain_id: readOptionalString(payload.domain_id),
    study_id: readOptionalString(payload.study_id),
    domain_context: optionalRecord(payload.domain_context),
    stage_id: readOptionalString(payload.stage_id),
    generation: optionalGeneration(payload.generation),
    phase: payload.phase === 'closeout' ? 'closeout' : 'launch',
    selected_executor: readOptionalString(payload.selected_executor),
    provider_attempt_ref: readOptionalString(payload.provider_attempt_ref),
    stage_attempt_id: readOptionalString(payload.stage_attempt_id),
    attempt_lease_ref: readOptionalString(payload.attempt_lease_ref),
    attempt_lease_status: readOptionalString(payload.attempt_lease_status),
    action_type: readOptionalString(payload.action_type),
    work_unit_id: readOptionalString(payload.work_unit_id),
    work_unit_fingerprint: readOptionalString(payload.work_unit_fingerprint),
    decision: readOptionalString(payload.decision),
    reason: readOptionalString(payload.reason),
    operator: readOptionalString(payload.operator),
    execution_authorization_decision_ref: readOptionalString(
      payload.execution_authorization_decision_ref,
    ),
    workspace_scope_ref: readOptionalString(payload.workspace_scope_ref),
    artifact_scope_ref: readOptionalString(payload.artifact_scope_ref),
    source_fingerprint: readOptionalString(payload.source_fingerprint),
    idempotency_key: readOptionalString(payload.idempotency_key),
    current_pointer_ref: readOptionalString(payload.current_pointer_ref),
    stage_manifest_ref: readOptionalString(payload.stage_manifest_ref),
    owner_answer_ref: readOptionalString(payload.owner_answer_ref),
    owner_answer_kind: optionalOwnerAnswerKind(payload.owner_answer_kind),
    closeout_receipt_ref: readOptionalString(payload.closeout_receipt_ref),
    owner_answer_stage_run_id: readOptionalString(payload.owner_answer_stage_run_id),
    owner_answer_generation: optionalGeneration(payload.owner_answer_generation),
    owner_answer_manifest_ref: readOptionalString(payload.owner_answer_manifest_ref),
    owner_answer_current_pointer_ref: readOptionalString(
      payload.owner_answer_current_pointer_ref,
    ),
    owner_answer_source_fingerprint: readOptionalString(
      payload.owner_answer_source_fingerprint,
    ),
    owner_answer_idempotency_key: readOptionalString(payload.owner_answer_idempotency_key),
    quality_gate_attempt_ref: readOptionalString(payload.quality_gate_attempt_ref),
    owner_answer_attempt_ref: readOptionalString(payload.owner_answer_attempt_ref),
    closeout_refs: readStringList(payload.closeout_refs ?? payload.closeout_ref),
    receipt_ref: readOptionalString(payload.receipt_ref),
  };
}

function parseRecordArgs(args: string[], spec: Pick<CommandSpec, 'usage' | 'examples'>) {
  const values = parseCommandOptions(args, spec, {
    payload: { type: 'string', multiple: true },
    'payload-file': { type: 'string', multiple: true },
    'dry-run': { type: 'boolean' },
  });
  const payloadValues = values.payload as string[] | undefined;
  const payloadFiles = values['payload-file'] as string[] | undefined;
  assertSinglePayloadSource((payloadValues?.length ?? 0) + (payloadFiles?.length ?? 0) > 1, spec);
  const payloadValue = payloadValues?.[0];
  const payloadFile = payloadFiles?.[0];
  if (!payloadValue && !payloadFile) {
    throw buildUsageError(
      'runtime stage-run-authorization record requires --payload or --payload-file.',
      spec,
      { required_any: ['--payload', '--payload-file'] },
    );
  }
  const payload = parseJsonObject(
    payloadValue ?? readPayloadFileText(payloadFile as string, spec),
    'runtime stage-run-authorization record payload must be a JSON object.',
    spec,
  );
  return {
    input: payloadInput(payload),
    dryRun: values['dry-run'] === true,
  };
}

function parseVerifyArgs(args: string[], spec: Pick<CommandSpec, 'usage' | 'examples'>) {
  const values = parseCommandOptions(args, spec, {
    'receipt-ref': { type: 'string' },
  });
  return { receipt_ref: values['receipt-ref'] as string | undefined ?? null };
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
