import { spawnSync } from 'node:child_process';
import path from 'node:path';

import {
  FrameworkContractError,
  isRecord,
} from '../../../kernel/contract-validation.ts';
import {
  parseJsonText,
} from '../../../kernel/json-file.ts';
import {
  stringList,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';
import {
  buildCommandResult,
  writeJson,
  type CommandResult,
} from './io.ts';

type OwnerCloseoutResult = {
  closeout: JsonRecord;
  responsePath: string | null;
};

function normalizeOwnerCloseoutCommand(hook: JsonRecord): string[] {
  return Array.isArray(hook.command)
    ? hook.command.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function ownerCloseoutTypedBlocker(input: {
  workOrder: JsonRecord;
  targetAgent: JsonRecord;
  workOrderId: string;
  reason: string;
  commandResult?: CommandResult;
  hook?: JsonRecord | null;
}): JsonRecord {
  return {
    status: 'typed_blocker_recorded',
    blocker_ref: isRecord(input.workOrder.machine_closeout_refs)
      ? input.workOrder.machine_closeout_refs.target_owner_receipt_or_typed_blocker_ref
      : null,
    reason: input.reason,
    owner_route_refs: stringList(input.workOrder.owner_route_refs),
    owner: input.hook ? stringValue(input.hook.owner) ?? 'target-domain' : 'target-domain',
    can_write_owner_receipt: false,
    command_result: input.commandResult ?? null,
    hook_action_ref: input.hook ? stringValue(input.hook.action_ref) : null,
    target_domain_id: stringValue(input.targetAgent.domain_id),
  };
}

function assertOwnerCloseoutResponseAllowed(response: JsonRecord): void {
  const writesForbiddenBody = response.writes_visual_truth !== false
    || response.writes_artifact_body !== false
    || response.writes_memory_body !== false
    || response.authorizes_quality_or_export !== false;
  const returnShape = stringValue(response.return_shape);
  if (
    response.refs_only !== true
    || writesForbiddenBody
    || !['domain_receipt', 'typed_blocker', 'no_regression_evidence'].includes(returnShape ?? '')
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Target owner closeout response must be refs-only and match allowed owner receipt return shapes.',
      {
        return_shape: returnShape,
        refs_only: response.refs_only,
        writes_visual_truth: response.writes_visual_truth,
        writes_artifact_body: response.writes_artifact_body,
        writes_memory_body: response.writes_memory_body,
        authorizes_quality_or_export: response.authorizes_quality_or_export,
      },
    );
  }
}

export function runTargetOwnerCloseoutHook(input: {
  workOrder: JsonRecord;
  targetAgent: JsonRecord;
  workOrderId: string;
  targetAgentDir: string;
  outputDir: string;
  receiptDraft: JsonRecord;
}): OwnerCloseoutResult {
  const hook = isRecord(input.workOrder.target_owner_closeout_hook)
    ? input.workOrder.target_owner_closeout_hook
    : null;
  if (!hook) {
    return {
      responsePath: null,
      closeout: ownerCloseoutTypedBlocker({
        workOrder: input.workOrder,
        targetAgent: input.targetAgent,
        workOrderId: input.workOrderId,
        reason: 'Agent Lab executed source patch and verification, but target owner receipt remains target-domain owned.',
      }),
    };
  }
  const command = normalizeOwnerCloseoutCommand(hook);
  if (command.length === 0) {
    return {
      responsePath: null,
      closeout: ownerCloseoutTypedBlocker({
        workOrder: input.workOrder,
        targetAgent: input.targetAgent,
        workOrderId: input.workOrderId,
        reason: 'Target owner closeout hook was declared without an executable command.',
        hook,
      }),
    };
  }
  const result = spawnSync(command[0], command.slice(1), {
    cwd: input.targetAgentDir,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    input: `${JSON.stringify(input.receiptDraft, null, 2)}\n`,
    env: {
      ...process.env,
      OPL_WORK_ORDER_OWNER_CLOSEOUT: '1',
      OPL_WORK_ORDER_ID: input.workOrderId,
    },
  });
  const commandResult = buildCommandResult(command.join(' '), input.targetAgentDir, result);
  if (commandResult.exit_code !== 0) {
    return {
      responsePath: null,
      closeout: ownerCloseoutTypedBlocker({
        workOrder: input.workOrder,
        targetAgent: input.targetAgent,
        workOrderId: input.workOrderId,
        reason: 'Target owner closeout hook failed.',
        commandResult,
        hook,
      }),
    };
  }
  let response: JsonRecord;
  try {
    response = parseJsonText(result.stdout ?? '{}') as JsonRecord;
    assertOwnerCloseoutResponseAllowed(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      responsePath: null,
      closeout: ownerCloseoutTypedBlocker({
        workOrder: input.workOrder,
        targetAgent: input.targetAgent,
        workOrderId: input.workOrderId,
        reason: `Target owner closeout hook returned invalid refs-only JSON: ${errorMessage}`,
        commandResult,
        hook,
      }),
    };
  }
  const responsePath = path.join(input.outputDir, 'target-owner-closeout-response.json');
  writeJson(responsePath, response);
  return {
    responsePath,
    closeout: {
      status: stringValue(response.status) ?? stringValue(response.return_shape) ?? 'owner_closeout_recorded',
      owner: stringValue(hook.owner) ?? stringValue(response.owner) ?? 'target-domain',
      owner_route_refs: stringList(input.workOrder.owner_route_refs),
      hook_action_ref: stringValue(hook.action_ref),
      response_path: responsePath,
      command_result: commandResult,
      hook_result: response,
      can_write_owner_receipt: false,
    },
  };
}
