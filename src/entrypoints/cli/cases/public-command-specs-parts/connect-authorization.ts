import {
  createDefaultConnectionAuthorizationService,
  listOplConnectionAuthorization as listConnectionAuthorization,
} from '../../../../adapters/integration/public/app-state.ts';
import { FrameworkContractError } from '../../../../authority/contracts/contracts.ts';
import {
  assertNoArgs,
  parseRegisteredCommandOptions,
} from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

type AuthorizationCommand = 'list' | 'approve' | 'deny' | 'revoke';

function requiredOption(
  command: string,
  args: string[],
  spec: CommandSpec,
  option: 'request-id' | 'grant-id',
) {
  const parsed = parseRegisteredCommandOptions(command, args, spec);
  const value = parsed[option];
  if (typeof value !== 'string' || !value.trim()) {
    throw new FrameworkContractError('cli_usage_error', `${command} requires --${option}.`, {
      reason_code: 'connection_authorization_option_required',
      option: `--${option}`,
    });
  }
  return value.trim();
}

export function buildConnectionAuthorizationCommandSpecs(): Record<string, CommandSpec> {
  const commands: AuthorizationCommand[] = ['list', 'approve', 'deny', 'revoke'];
  return Object.fromEntries(commands.map((action) => {
    const command = `connect authorization ${action}`;
    const spec: CommandSpec = {
      usage: action === 'list'
        ? 'opl connect authorization list'
        : action === 'revoke'
          ? 'opl connect authorization revoke --grant-id <id>'
          : `opl connect authorization ${action} --request-id <id>`,
      summary: action === 'approve'
        ? 'Approve one pending connection request from the OPL App user-review surface.'
        : action === 'deny'
          ? 'Deny one pending connection authorization request.'
          : action === 'revoke'
            ? 'Revoke one consumer grant without changing the shared connection.'
            : 'List consumer-safe connection requests, grants and recent invocation metadata.',
      examples: [action === 'list'
        ? 'opl connect authorization list --json'
        : action === 'revoke'
          ? 'opl connect authorization revoke --grant-id <id> --json'
          : `opl connect authorization ${action} --request-id <id> --json`],
      group: 'connect',
      handler: async (args) => {
        if (action === 'list') {
          assertNoArgs(args, spec);
          return { connection_authorization: listConnectionAuthorization() };
        }
        const service = createDefaultConnectionAuthorizationService();
        if (action === 'revoke') {
          return {
            connection_authorization: service.revokeGrant(
              requiredOption(command, args, spec, 'grant-id'),
            ),
          };
        }
        const requestId = requiredOption(command, args, spec, 'request-id');
        return {
          connection_authorization: action === 'approve'
            ? await service.approveRequest(requestId)
            : service.denyRequest(requestId),
        };
      },
    };
    return [command, spec];
  }));
}
