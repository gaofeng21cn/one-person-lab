import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../../kernel/json-file.ts';
import { buildUsageError, parseCommandOptions } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

function payloadFromArgs(
  payloadText: string | undefined,
  payloadFile: string | undefined,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  if (payloadText && payloadFile) {
    throw buildUsageError('Use either --payload or --payload-file, not both.', spec, {
      mutually_exclusive: ['--payload', '--payload-file'],
    });
  }
  let payload: unknown = {};
  try {
    payload = payloadFile
      ? parseJsonText(fs.readFileSync(path.resolve(payloadFile), 'utf8'))
      : payloadText
        ? parseJsonText(payloadText)
        : {};
  } catch (error) {
    throw buildUsageError('Standard Agent action payload must be readable JSON.', spec, {
      payload_file: payloadFile ?? null,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(payload)) {
    throw buildUsageError('Standard Agent action payload must be a JSON object.', spec);
  }
  return payload;
}

export function parseAgentsRunArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const values = parseCommandOptions(args, spec, {
    domain: { type: 'string' },
    action: { type: 'string' },
    workspace: { type: 'string' },
    payload: { type: 'string' },
    'payload-file': { type: 'string' },
    'run-id': { type: 'string' },
    'timeout-ms': { type: 'string' },
    'executor-provider': { type: 'string' },
    'executor-model': { type: 'string' },
    'executor-reasoning-effort': { type: 'string' },
  });
  const domainId = values.domain as string | undefined;
  const actionId = values.action as string | undefined;
  const workspaceRoot = values.workspace as string | undefined;
  if (!domainId || !actionId || !workspaceRoot) {
    throw buildUsageError('agents run requires --domain, --action, and --workspace.', spec, {
      required: ['--domain', '--action', '--workspace'],
    });
  }
  const rawTimeout = values['timeout-ms'] as string | undefined;
  const timeoutMs = rawTimeout === undefined ? undefined : Number(rawTimeout);
  if (timeoutMs !== undefined && (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3_600_000)) {
    throw buildUsageError('--timeout-ms must be an integer between 1 and 3600000.', spec, {
      timeout_ms: rawTimeout,
    });
  }
  const executorProvider = values['executor-provider'] as string | undefined;
  const executorModel = values['executor-model'] as string | undefined;
  const executorReasoningEffort = values['executor-reasoning-effort'] as string | undefined;
  const stageAttemptExecutorPolicy = executorProvider || executorModel || executorReasoningEffort
    ? {
        executor_kind: 'codex_cli' as const,
        ...(executorProvider ? { provider: executorProvider } : {}),
        ...(executorModel ? { model: executorModel } : {}),
        ...(executorReasoningEffort ? { reasoning_effort: executorReasoningEffort } : {}),
      }
    : undefined;
  return {
    domainId,
    actionId,
    workspaceRoot,
    payload: payloadFromArgs(
      values.payload as string | undefined,
      values['payload-file'] as string | undefined,
      spec,
    ),
    runId: values['run-id'] as string | undefined,
    timeoutMs,
    stageAttemptExecutorPolicy,
  };
}
