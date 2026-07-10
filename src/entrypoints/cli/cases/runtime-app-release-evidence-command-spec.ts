import {
  appReleaseUserPathEvidencePayloadPreflight,
  listAppReleaseUserPathEvidenceReceipts,
  recordAppReleaseUserPathEvidenceReceipts,
  verifyAppReleaseUserPathEvidenceReceipt,
  type AppReleaseUserPathEvidenceReceiptInput,
} from '../../../modules/ledger/app-release-user-path-evidence-ledger.ts';
import {
  finishAppReleaseLongOperatorObservation,
  recordAppReleaseLongOperatorObservationEvent,
  startAppReleaseLongOperatorObservation,
} from '../../../modules/console/app-release-long-operator-observation.ts';
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

function parseRuntimeAppReleaseEvidencePayload(
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): AppReleaseUserPathEvidenceReceiptInput {
  const parsed = readJsonObject(value, spec, {
    parseErrorMessage: 'runtime app-release-evidence record payload must be valid JSON.',
    objectErrorMessage: 'runtime app-release-evidence record payload must be a JSON object.',
  });
  return {
    release_package_refs: readStringList(parsed.release_package_refs ?? parsed.release_package_ref),
    screenshot_refs: readStringList(parsed.screenshot_refs ?? parsed.screenshot_ref),
    reload_prompt_user_path_refs: readStringList(
      parsed.reload_prompt_user_path_refs ?? parsed.reload_prompt_user_path_ref,
    ),
    provider_state_linkage_refs: readStringList(
      parsed.provider_state_linkage_refs ?? parsed.provider_state_linkage_ref,
    ),
    install_evidence_refs: readStringList(
      parsed.install_evidence_refs ?? parsed.install_evidence_ref,
    ),
    long_operator_evidence_refs: readStringList(
      parsed.long_operator_evidence_refs ?? parsed.long_operator_evidence_ref,
    ),
    release_owner_receipt_refs: readStringList(
      parsed.release_owner_receipt_refs ?? parsed.release_owner_receipt_ref,
    ),
    typed_blocker_refs: readStringList(parsed.typed_blocker_refs ?? parsed.typed_blocker_ref),
    owner_acceptance_refs: readStringList(
      parsed.owner_acceptance_refs ?? parsed.owner_acceptance_ref,
    ),
    receipt_ref: readOptionalString(parsed.receipt_ref),
  };
}

function assertRuntimeAppReleaseEvidencePayloadPreflight(
  payload: AppReleaseUserPathEvidenceReceiptInput,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const preflight = appReleaseUserPathEvidencePayloadPreflight(payload);
  if (preflight.can_record_refs_only_receipt === true) {
    return payload;
  }
  throw buildUsageError(
    'runtime app-release-evidence record payload must choose exactly one refs-only evidence path.',
    spec,
    {
      error_kind: 'app_release_user_path_evidence_payload_preflight_blocked',
      receipt_recorded: false,
      required_any: preflight.required_any,
      preflight,
    },
  );
}

function parseRuntimeAppReleaseEvidenceRecordArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const parsed = parseCommandOptions(args, spec, {
    payload: { type: 'string', multiple: true },
    'payload-file': { type: 'string', multiple: true },
  });
  const inlinePayloads = parsed.payload as string[] | undefined;
  const payloadFiles = parsed['payload-file'] as string[] | undefined;
  assertSinglePayloadSource((inlinePayloads?.length ?? 0) + (payloadFiles?.length ?? 0) > 1, spec);
  const inlinePayload = inlinePayloads?.[0];
  const payloadFile = payloadFiles?.[0];
  const payloadValue = inlinePayload ?? (payloadFile ? readPayloadFileText(payloadFile, spec) : null);
  if (!payloadValue) {
    throw buildUsageError('runtime app-release-evidence record requires --payload or --payload-file.', spec, {
      required_any: ['--payload', '--payload-file'],
    });
  }
  return parseRuntimeAppReleaseEvidencePayload(payloadValue, spec);
}

function parseRuntimeAppReleaseEvidenceVerifyArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const receiptRef = parseCommandOptions(args, spec, {
    'receipt-ref': { type: 'string' },
  })['receipt-ref'] as string | undefined;
  if (receiptRef === '') {
    throw buildUsageError('runtime app-release-evidence verify requires --receipt-ref value.', spec, {
      option: '--receipt-ref',
    });
  }
  return { receipt_ref: receiptRef ?? null };
}

function parsePositiveInteger(
  value: string | undefined,
  option: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  if (!value) {
    throw buildUsageError(`runtime app-release-evidence long-operator start requires ${option}.`, spec, {
      option,
    });
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw buildUsageError(`${option} must be a positive integer.`, spec, {
      option,
      value,
    });
  }
  return parsed;
}

function parseRuntimeAppReleaseLongOperatorStartArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let cohort = '';
  let evidenceDir: string | null = null;
  let minimumDurationMinutes: number | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];
    if (token === '--cohort' && value) {
      cohort = value;
      index += 1;
      continue;
    }
    if (token === '--evidence-dir' && value) {
      evidenceDir = value;
      index += 1;
      continue;
    }
    if (token === '--minimum-duration-minutes') {
      minimumDurationMinutes = parsePositiveInteger(value, token, spec);
      index += 1;
      continue;
    }
    throw buildUsageError(`Unknown option for runtime app-release-evidence long-operator start: ${token}.`, spec, {
      option: token,
    });
  }
  if (!cohort) {
    throw buildUsageError('runtime app-release-evidence long-operator start requires --cohort.', spec, {
      required: ['--cohort'],
    });
  }
  if (!minimumDurationMinutes) {
    throw buildUsageError(
      'runtime app-release-evidence long-operator start requires --minimum-duration-minutes.',
      spec,
      { required: ['--minimum-duration-minutes'] },
    );
  }
  if (!evidenceDir) {
    throw buildUsageError(
      'runtime app-release-evidence long-operator start requires --evidence-dir.',
      spec,
      { required: ['--evidence-dir'] },
    );
  }
  return {
    cohort,
    evidenceDir,
    minimumDurationMinutes,
  };
}

function parseRuntimeAppReleaseLongOperatorFinishArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let workorderFile = '';
  let finishedAt: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];
    if (token === '--workorder-file' && value) {
      workorderFile = value;
      index += 1;
      continue;
    }
    if (token === '--finished-at' && value) {
      finishedAt = value;
      index += 1;
      continue;
    }
    throw buildUsageError(`Unknown option for runtime app-release-evidence long-operator finish: ${token}.`, spec, {
      option: token,
    });
  }
  if (!workorderFile) {
    throw buildUsageError(
      'runtime app-release-evidence long-operator finish requires --workorder-file.',
      spec,
      {
        required: ['--workorder-file'],
      },
    );
  }
  return { workorderFile, finishedAt };
}

function parseRuntimeAppReleaseLongOperatorEventArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  let workorderFile = '';
  let eventKind = '';
  let observedAt: string | null = null;
  let evidenceRef: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];
    if (token === '--workorder-file' && value) {
      workorderFile = value;
      index += 1;
      continue;
    }
    if (token === '--event-kind' && value) {
      eventKind = value;
      index += 1;
      continue;
    }
    if (token === '--observed-at' && value) {
      observedAt = value;
      index += 1;
      continue;
    }
    if (token === '--evidence-ref' && value) {
      evidenceRef = value;
      index += 1;
      continue;
    }
    throw buildUsageError(`Unknown option for runtime app-release-evidence long-operator event: ${token}.`, spec, {
      option: token,
    });
  }
  if (!workorderFile) {
    throw buildUsageError(
      'runtime app-release-evidence long-operator event requires --workorder-file.',
      spec,
      { required: ['--workorder-file'] },
    );
  }
  if (!eventKind) {
    throw buildUsageError(
      'runtime app-release-evidence long-operator event requires --event-kind.',
      spec,
      { required: ['--event-kind'] },
    );
  }
  return { workorderFile, eventKind, observedAt, evidenceRef };
}

export function buildRuntimeAppReleaseEvidenceCommandSpecs(): Record<string, CommandSpec> {
  const commandSpecs: Record<string, CommandSpec> = {
    'runtime app-release-evidence record': {
      usage: 'opl runtime app-release-evidence record (--payload <json>|--payload-file <path>)',
      summary:
        'Record refs-only App release/user-path evidence refs without claiming App release or production readiness.',
      examples: [
        'opl runtime app-release-evidence record --payload \'{"release_package_refs":["release:pkg"],"screenshot_refs":["screenshot:first-run"]}\'',
        'opl runtime app-release-evidence record --payload \'{"owner_acceptance_refs":["owner-acceptance:app-release/<cohort>"]}\'',
        'opl runtime app-release-evidence record --payload-file payload.json',
      ],
      handler: (args) => ({
        app_release_user_path_evidence_ledger_record:
          recordAppReleaseUserPathEvidenceReceipts([
            assertRuntimeAppReleaseEvidencePayloadPreflight(
              parseRuntimeAppReleaseEvidenceRecordArgs(
                args,
                commandSpecs['runtime app-release-evidence record'],
              ),
              commandSpecs['runtime app-release-evidence record'],
            ),
          ]),
      }),
    },
    'runtime app-release-evidence verify': {
      usage: 'opl runtime app-release-evidence verify [--receipt-ref <ref>]',
      summary:
        'Verify an existing refs-only App release/user-path evidence receipt without claiming readiness.',
      examples: [
        'opl runtime app-release-evidence verify --receipt-ref opl://app-release-user-path-evidence/release%3Apkg',
      ],
      handler: (args) => ({
        app_release_user_path_evidence_ledger_verify:
          verifyAppReleaseUserPathEvidenceReceipt(
            parseRuntimeAppReleaseEvidenceVerifyArgs(
              args,
              commandSpecs['runtime app-release-evidence verify'],
            ),
          ),
      }),
    },
    'runtime app-release-evidence list': {
      usage: 'opl runtime app-release-evidence list',
      summary:
        'List refs-only App release/user-path evidence receipts recorded in the local OPL state ledger.',
      examples: ['opl runtime app-release-evidence list --json'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['runtime app-release-evidence list']);
        const receipts = listAppReleaseUserPathEvidenceReceipts();
        return {
          app_release_user_path_evidence_ledger: {
            surface_kind: 'opl_app_release_user_path_evidence_ledger_projection',
            receipt_count: receipts.length,
            receipts,
            authority_boundary: {
              refs_only: true,
              can_write_domain_truth: false,
              can_write_memory_body: false,
              can_read_memory_body: false,
              can_read_artifact_body: false,
              can_mutate_artifact_body: false,
              can_create_owner_receipt: false,
              can_close_domain_ready: false,
              can_claim_release_ready: false,
              can_claim_production_ready: false,
              can_close_app_release_user_path: false,
            },
          },
        };
      },
    },
    'runtime app-release-evidence long-operator start': {
      usage:
        'opl runtime app-release-evidence long-operator start --cohort <version> --minimum-duration-minutes <n> --evidence-dir <path>',
      summary:
        'Prepare a body-local App long-operator observation workorder without recording release/user-path evidence.',
      examples: [
        'opl runtime app-release-evidence long-operator start --cohort 26.5.19 --minimum-duration-minutes 240 --evidence-dir /tmp/opl-app-long-operator',
      ],
      handler: (args) => ({
        app_release_long_operator_observation_start:
          startAppReleaseLongOperatorObservation(
            parseRuntimeAppReleaseLongOperatorStartArgs(
              args,
              commandSpecs['runtime app-release-evidence long-operator start'],
            ),
          ),
      }),
    },
    'runtime app-release-evidence long-operator event': {
      usage:
        'opl runtime app-release-evidence long-operator event --workorder-file <path> --event-kind <kind> [--observed-at <iso>] [--evidence-ref <ref>]',
      summary:
        'Append a constrained App long-operator observation event to the body-local workorder log without recording release/user-path evidence.',
      examples: [
        'opl runtime app-release-evidence long-operator event --workorder-file /tmp/opl-app-long-operator/app-release-long-operator-workorder.json --event-kind app_window_reopened_or_kept_live --evidence-ref screenshot:app/live',
      ],
      handler: (args) => ({
        app_release_long_operator_observation_event_record:
          recordAppReleaseLongOperatorObservationEvent(
            parseRuntimeAppReleaseLongOperatorEventArgs(
              args,
              commandSpecs['runtime app-release-evidence long-operator event'],
            ),
          ),
      }),
    },
    'runtime app-release-evidence long-operator finish': {
      usage:
        'opl runtime app-release-evidence long-operator finish --workorder-file <path> [--finished-at <iso>]',
      summary:
        'Materialize a long-operator evidence ref and record payload only after the observation workorder passes preflight.',
      examples: [
        'opl runtime app-release-evidence long-operator finish --workorder-file /tmp/opl-app-long-operator/app-release-long-operator-workorder.json',
      ],
      handler: (args) => ({
        app_release_long_operator_observation_finish:
          finishAppReleaseLongOperatorObservation(
            parseRuntimeAppReleaseLongOperatorFinishArgs(
              args,
              commandSpecs['runtime app-release-evidence long-operator finish'],
            ),
          ),
      }),
    },
  };
  return commandSpecs;
}
