import {
  runOplSystemAction,
  writeOplWorkspaceRootSurface,
} from '../../../adapters/integration/index.ts';
import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import {
  releaseChannelPayload,
  stringPayloadField,
  workspaceRootPayload,
} from './action-execute-payloads.ts';
import type { AppActionExecuteOptions } from './action-execute-parser.ts';
import {
  restoreCodexUserInstructionsFromOplFlowDefault,
  writeCodexUserInstructions,
} from '../codex-personalization.ts';

export async function executeSystemAppAction(
  contracts: FrameworkContracts,
  options: AppActionExecuteOptions,
) {
  if (options.actionId === 'developer_supervisor') {
    return {
      delegatedSurface: 'opl system developer-supervisor',
      result: options.dryRun
        ? {
            system_action: {
              action: 'developer_supervisor',
              status: 'dry_run',
              requested: options.payload,
            },
          }
        : await runOplSystemAction(contracts, 'developer_supervisor', {
          developerSupervisorEnabled: stringPayloadField(options.payload, 'developerSupervisorEnabled') as 'auto' | 'on' | 'off' | undefined,
          developerSupervisorMode: stringPayloadField(options.payload, 'developerSupervisorMode') as 'external_observe' | 'developer_apply_safe' | undefined,
          developerSupervisorAutoEnableGithubLogin:
            stringPayloadField(options.payload, 'developerSupervisorAutoEnableGithubLogin') ?? undefined,
          developerSupervisorModuleId:
            stringPayloadField(options.payload, 'developerSupervisorModuleId') ?? undefined,
          developerSupervisorModuleSource:
            stringPayloadField(options.payload, 'developerSupervisorModuleSource') as
              | 'auto'
              | 'managed'
              | 'developer'
              | undefined,
        }),
    };
  }

  if (options.actionId === 'developer_supervisor_refresh') {
    return {
      delegatedSurface: 'opl system developer-supervisor',
      result: options.dryRun
        ? {
            system_action: {
              action: 'developer_supervisor',
              status: 'dry_run',
              requested: {},
            },
          }
        : await runOplSystemAction(contracts, 'developer_supervisor'),
    };
  }

  if (options.actionId === 'update_channel') {
    return {
      delegatedSurface: 'opl system update-channel',
      result: options.dryRun
        ? {
            system_action: {
              action: 'update_channel',
              status: 'dry_run',
              details: releaseChannelPayload(options.payload),
            },
          }
        : await runOplSystemAction(contracts, 'update_channel', releaseChannelPayload(options.payload)),
    };
  }

  if (options.actionId === 'workspace_root_set') {
    const workspaceRoot = workspaceRootPayload(options.payload);
    return {
      delegatedSurface: 'opl workspace root set',
      result: options.dryRun
        ? {
            workspace_root: {
              selected_path: workspaceRoot,
              status: 'dry_run',
            },
          }
        : writeOplWorkspaceRootSurface(workspaceRoot),
    };
  }

  if (options.actionId === 'codex_user_instructions_set') {
    const content = options.payload.content;
    const expectedSha256 = options.payload.expected_sha256;
    if (typeof content !== 'string' || (expectedSha256 !== null && typeof expectedSha256 !== 'string')) {
      throw new FrameworkContractError(
        'cli_usage_error',
        'codex_user_instructions_set requires string content and string-or-null expected_sha256.',
        { action_id: options.actionId, required_payload_fields: ['content', 'expected_sha256'] },
      );
    }
    return {
      delegatedSurface: '$CODEX_HOME/AGENTS.md atomic write',
      result: writeCodexUserInstructions({
        content,
        expectedSha256,
        dryRun: options.dryRun,
      }),
    };
  }

  if (options.actionId === 'codex_user_instructions_restore_opl_flow_default') {
    const expectedSha256 = options.payload.expected_sha256;
    if (expectedSha256 !== null && typeof expectedSha256 !== 'string') {
      throw new FrameworkContractError(
        'cli_usage_error',
        'codex_user_instructions_restore_opl_flow_default requires string-or-null expected_sha256.',
        { action_id: options.actionId, required_payload_fields: ['expected_sha256'] },
      );
    }
    return {
      delegatedSurface: 'installed opl-flow package templates/AGENTS.md to $CODEX_HOME/AGENTS.md atomic write',
      result: restoreCodexUserInstructionsFromOplFlowDefault({
        expectedSha256,
        dryRun: options.dryRun,
      }),
    };
  }

  return null;
}
