import fs from 'node:fs';
import path from 'node:path';

import {
  QUALIFICATION_PROVISIONING_ACTION_ID,
  runStandardAgentAction,
  runStandardAgentQualificationProvisioning,
} from '../../../../adapters/execution/standard-agent-action-runtime.ts';
import { resolveStandardAgentManagedCheckout } from '../../../../adapters/execution/standard-agent-managed-checkout.ts';
import type { WorkspaceSkillProjectionRefresher } from '../../../../authority/workspace/index.ts';
import type { CordisBaseHeadlessComposition } from '../../../../host/composition-profiles.ts';
import { isRecord } from '../../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../../kernel/json-file.ts';
import { buildUsageError, parseCommandOptions, type CommandSpec } from '../../modules/support.ts';

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
  };
}

type PrivateAgentCommandSpecsOptions = {
  getCommandSpecs: () => Record<string, CommandSpec>;
  refreshWorkspaceSkills: WorkspaceSkillProjectionRefresher;
  familyRuntime: CordisBaseHeadlessComposition['services']['familyRuntime'];
};

export function buildPrivateAgentCommandSpecs({
  getCommandSpecs,
  refreshWorkspaceSkills,
  familyRuntime,
}: PrivateAgentCommandSpecsOptions): Record<string, CommandSpec> {
  return {
    'agents run': {
      usage: 'opl agents run --domain <agent> --action <action_id> --workspace <absolute_path> [--payload <json> | --payload-file <path>] [--run-id <id>] [--timeout-ms <ms>]',
      summary: 'Run one managed Standard Agent action through the OPL-hosted Handler or Temporal StageRun boundary.',
      examples: [
        'opl agents run --domain obf --action shape-storyline --workspace /path/to/book --payload \'{"workspace_root":"/path/to/book"}\'',
        'opl agents run --domain mas --action study-progress --workspace /path/to/workspace --payload-file request.json --json',
      ],
      handler: (args) => {
        const input = parseAgentsRunArgs(args, getCommandSpecs()['agents run']);
        const dependencies = {
          runStageRuntime: familyRuntime,
          resolveManagedCheckout: (
            checkoutInput: Parameters<typeof resolveStandardAgentManagedCheckout>[0],
          ) => resolveStandardAgentManagedCheckout({
            ...checkoutInput,
            refreshWorkspaceSkills,
          }),
        };
        return input.actionId === QUALIFICATION_PROVISIONING_ACTION_ID
          ? runStandardAgentQualificationProvisioning(input, dependencies)
          : runStandardAgentAction(input, dependencies);
      },
    },
  };
}
