import { executeOplSoftwareSourceAction, type SoftwareSourceActionId } from '../../../../adapters/integration/index.ts';
import { parseRegisteredCommandOptions, type CommandSpec } from '../../modules/support.ts';

export function buildSoftwareSourcesCommandSpecs(getCommandSpec: (command: string) => CommandSpec): Record<string, CommandSpec> {
  return Object.fromEntries(['list', 'check', 'configure', 'disconnect'].map(operation => {
    const command = `sources ${operation}`;
    return [command, {
      usage: `opl ${command}${operation === 'list' ? '' : ' --source-id <source_id>'}${operation === 'configure' ? ' [--provider-id github_packages] [--credential-handle <owner-reference>] [--enabled true|false]' : ''}`,
      summary: ({ list: 'Read public and private software source status without credential values.', check: 'Check software source credentials through the native provider.', configure: 'Connect a software source using an existing native credential reference.', disconnect: 'Disconnect a software source while keeping installed Packages.' } as Record<string, string>)[operation],
      examples: [`opl ${command}${operation === 'list' ? '' : ' --source-id github-packages:gaofeng21cn'} --json`],
      group: 'sources', help_surface: 'default' as const,
      handler: (args: string[]) => {
        const parsed = parseRegisteredCommandOptions(command, args, getCommandSpec(command));
        const payload: Record<string, unknown> = {};
        for (const key of ['source-id', 'provider-id', 'credential-handle']) {
          if (parsed[key] !== undefined) payload[key.replaceAll('-', '_')] = parsed[key];
        }
        if (parsed.enabled !== undefined) payload.enabled = parsed.enabled === 'true';
        return executeOplSoftwareSourceAction(`source_${operation}` as SoftwareSourceActionId, payload);
      },
    }];
  }));
}
