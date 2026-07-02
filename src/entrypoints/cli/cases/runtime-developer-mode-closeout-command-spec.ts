import {
  listDeveloperModeCloseoutReceipts,
  recordDeveloperModeCloseoutReceipts,
  verifyDeveloperModeCloseoutReceipt,
  type DeveloperModeCloseoutReceiptInput,
} from '../../../modules/connect/developer-mode-closeout-ledger.ts';
import { assertNoArgs, buildUsageError } from '../modules/support.ts';
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

function parseRuntimeDeveloperModeCloseoutPayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): DeveloperModeCloseoutReceiptInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw buildUsageError('runtime developer-mode-closeout record payload must be valid JSON.', spec, {
      parse_error: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(parsed)) {
    throw buildUsageError('runtime developer-mode-closeout record payload must be a JSON object.', spec);
  }
  return {
    target_repo_id: optionalString(parsed.target_repo_id ?? parsed.target_repo),
    route_decision: optionalString(parsed.route_decision),
    route_eligibility: optionalString(parsed.route_eligibility),
    patrol_observation_ref: optionalString(parsed.patrol_observation_ref),
    diff_ref: optionalString(parsed.diff_ref),
    verification_refs: stringList(parsed.verification_refs ?? parsed.verification_ref),
    no_forbidden_write_ref: optionalString(parsed.no_forbidden_write_ref),
    commit_ref: optionalString(parsed.commit_ref),
    fork_repo_ref: optionalString(parsed.fork_repo_ref),
    pr_review_ref: optionalString(parsed.pr_review_ref),
    owner_acceptance_ref: optionalString(parsed.owner_acceptance_ref),
    route_repetition_refs: stringList(parsed.route_repetition_refs ?? parsed.route_repetition_ref),
    risk_tier_auto_promotion_refs:
      stringList(parsed.risk_tier_auto_promotion_refs ?? parsed.risk_tier_auto_promotion_ref),
    app_patrol_mount_refs: stringList(parsed.app_patrol_mount_refs ?? parsed.app_patrol_mount_ref),
    receipt_ref: optionalString(parsed.receipt_ref),
  };
}

function parseRuntimeDeveloperModeCloseoutRecordArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let payload: DeveloperModeCloseoutReceiptInput | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--payload') {
      const value = args[++index];
      if (!value) {
        throw buildUsageError('runtime developer-mode-closeout record requires --payload.', spec, {
          required: ['--payload'],
        });
      }
      payload = parseRuntimeDeveloperModeCloseoutPayload(value, spec);
      continue;
    }
    throw buildUsageError(`Unknown option for runtime developer-mode-closeout record: ${token}.`, spec, {
      option: token,
    });
  }
  if (!payload) {
    throw buildUsageError('runtime developer-mode-closeout record requires --payload.', spec, {
      required: ['--payload'],
    });
  }
  return payload;
}

function parseRuntimeDeveloperModeCloseoutVerifyArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let receiptRef: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token !== '--receipt-ref') {
      throw buildUsageError(`Unknown option for runtime developer-mode-closeout verify: ${token}.`, spec, {
        option: token,
      });
    }
    const value = args[++index];
    if (!value) {
      throw buildUsageError('runtime developer-mode-closeout verify requires --receipt-ref value.', spec, {
        option: '--receipt-ref',
      });
    }
    receiptRef = value;
  }
  return { receipt_ref: receiptRef };
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
        'Record refs-only Developer Mode live repair closeout refs; risk-tier auto-promotion refs must already be verified Agent Lab risk-tier-promotion receipts.',
      examples: [
        'opl runtime developer-mode-closeout record --payload \'{"target_repo_id":"med-autoscience","route_decision":"direct-fix","route_eligibility":"eligible_direct_fix","patrol_observation_ref":"patrol:ref","diff_ref":"diff:ref","verification_refs":["test:ref"],"no_forbidden_write_ref":"scan:ref","commit_ref":"git:ref","owner_acceptance_ref":"external-owner-ref:accepted"}\'',
        'opl agent-lab risk-tier-promotion record --payload <json> && opl agent-lab risk-tier-promotion verify --receipt-ref <ref> && opl runtime developer-mode-closeout record --payload \'{"risk_tier_auto_promotion_refs":["<verified-agent-lab-risk-tier-auto-promotion-receipt-ref>"]}\'',
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
        'opl runtime developer-mode-closeout verify --receipt-ref opl://developer-mode-closeout/med-autoscience/patrol%3Aref',
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
