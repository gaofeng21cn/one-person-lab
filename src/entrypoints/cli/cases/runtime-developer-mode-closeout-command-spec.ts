import {
  listDeveloperModeCloseoutReceipts,
  recordDeveloperModeCloseoutReceipts,
  verifyDeveloperModeCloseoutReceipt,
  type DeveloperModeCloseoutReceiptInput,
} from '../../../modules/ledger/index.ts';
import {
  readJsonObject,
  readOptionalString,
  readStringList,
} from '../modules/json-boundary.ts';
import { assertNoArgs, buildUsageError, parseCommandOptions } from '../modules/support.ts';
import type { CommandSpec } from '../modules/support.ts';

function parseRuntimeDeveloperModeCloseoutPayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): DeveloperModeCloseoutReceiptInput {
  const parsed = readJsonObject(value, spec, {
    parseErrorMessage: 'runtime developer-mode-closeout record payload must be valid JSON.',
    objectErrorMessage: 'runtime developer-mode-closeout record payload must be a JSON object.',
  });
  return {
    target_repo_id: readOptionalString(parsed.target_repo_id ?? parsed.target_repo),
    route_decision: readOptionalString(parsed.route_decision),
    route_eligibility: readOptionalString(parsed.route_eligibility),
    patrol_observation_ref: readOptionalString(parsed.patrol_observation_ref),
    diff_ref: readOptionalString(parsed.diff_ref),
    verification_refs: readStringList(parsed.verification_refs ?? parsed.verification_ref),
    no_forbidden_write_ref: readOptionalString(parsed.no_forbidden_write_ref),
    commit_ref: readOptionalString(parsed.commit_ref),
    fork_repo_ref: readOptionalString(parsed.fork_repo_ref),
    pr_review_ref: readOptionalString(parsed.pr_review_ref),
    owner_acceptance_ref: readOptionalString(parsed.owner_acceptance_ref),
    route_repetition_refs: readStringList(parsed.route_repetition_refs ?? parsed.route_repetition_ref),
    foundry_activation_transaction_refs: readStringList(
      parsed.foundry_activation_transaction_refs
        ?? parsed.foundry_activation_transaction_ref,
    ),
    app_patrol_mount_refs: readStringList(parsed.app_patrol_mount_refs ?? parsed.app_patrol_mount_ref),
    receipt_ref: readOptionalString(parsed.receipt_ref),
  };
}

function parseRuntimeDeveloperModeCloseoutRecordArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const payload = parseCommandOptions(args, spec, {
    payload: { type: 'string' },
  }).payload as string | undefined;
  if (!payload) {
    throw buildUsageError('runtime developer-mode-closeout record requires --payload.', spec, {
      required: ['--payload'],
    });
  }
  return parseRuntimeDeveloperModeCloseoutPayload(payload, spec);
}

function parseRuntimeDeveloperModeCloseoutVerifyArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const receiptRef = parseCommandOptions(args, spec, {
    'receipt-ref': { type: 'string' },
  })['receipt-ref'] as string | undefined;
  if (receiptRef === '') {
    throw buildUsageError('runtime developer-mode-closeout verify requires --receipt-ref value.', spec, {
      option: '--receipt-ref',
    });
  }
  return { receipt_ref: receiptRef ?? null };
}

function refsOnlyAuthorityBoundary() {
  return {
    refs_only: true,
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact_body: false,
    can_authorize_quality_or_export: false,
    can_create_owner_receipt: false,
    can_write_owner_receipt: false,
    can_modify_managed_runtime: false,
    can_close_domain_ready: false,
    can_claim_release_ready: false,
    can_claim_production_ready: false,
    can_close_developer_mode_live_route: false,
  };
}

export function buildRuntimeDeveloperModeCloseoutCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime developer-mode-closeout record': {
      usage: 'opl runtime developer-mode-closeout record --payload <json>',
      summary:
        'Record refs-only Developer Mode live repair closeout refs and optional immutable Foundry activation transaction refs.',
      examples: [
        'opl runtime developer-mode-closeout record --payload \'{"target_repo_id":"demo-agent","route_decision":"direct-fix","route_eligibility":"eligible_direct_fix","patrol_observation_ref":"patrol:ref","diff_ref":"diff:ref","verification_refs":["test:ref"],"no_forbidden_write_ref":"scan:ref","commit_ref":"git:ref","owner_acceptance_ref":"external-owner-ref:accepted"}\'',
        'opl runtime developer-mode-closeout record --payload \'{"foundry_activation_transaction_refs":["opl://foundry/activation-transaction/demo"]}\'',
      ],
      handler: (args) => ({
        developer_mode_closeout_ledger_record:
          recordDeveloperModeCloseoutReceipts([
            parseRuntimeDeveloperModeCloseoutRecordArgs(
              args,
              commandSpecs['runtime developer-mode-closeout record'],
            ),
          ]),
      }),
    },
    'runtime developer-mode-closeout verify': {
      usage: 'opl runtime developer-mode-closeout verify [--receipt-ref <ref>]',
      summary:
        'Verify an existing refs-only Developer Mode live repair closeout receipt without claiming production ready.',
      examples: [
        'opl runtime developer-mode-closeout verify --receipt-ref opl://developer-mode-closeout/demo-agent/patrol%3Aref',
      ],
      handler: (args) => ({
        developer_mode_closeout_ledger_verify:
          verifyDeveloperModeCloseoutReceipt(
            parseRuntimeDeveloperModeCloseoutVerifyArgs(
              args,
              commandSpecs['runtime developer-mode-closeout verify'],
            ),
          ),
      }),
    },
    'runtime developer-mode-closeout list': {
      usage: 'opl runtime developer-mode-closeout list',
      summary:
        'List refs-only Developer Mode live repair closeout receipts recorded in the local OPL state ledger.',
      examples: ['opl runtime developer-mode-closeout list --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime developer-mode-closeout list']);
        const receipts = listDeveloperModeCloseoutReceipts();
        return {
          developer_mode_closeout_ledger: {
            surface_kind: 'opl_developer_mode_closeout_ledger_projection',
            receipt_count: receipts.length,
            recorded_receipt_ref_count: receipts.filter((receipt) => receipt.receipt_status === 'recorded').length,
            verified_receipt_ref_count: receipts.filter((receipt) => receipt.receipt_status === 'verified').length,
            receipts,
            authority_boundary: refsOnlyAuthorityBoundary(),
          },
        };
      },
    },
  };
  return commandSpecs;
}
