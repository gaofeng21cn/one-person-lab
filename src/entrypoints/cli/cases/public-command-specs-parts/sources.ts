import { executeOplSoftwareSourceAction, type SoftwareSourceActionId } from '../../../../adapters/integration/index.ts';
import { parseRegisteredCommandOptions, type CommandSpec } from '../../modules/support.ts';

export function buildSoftwareSourcesCommandSpecs(getCommandSpec: (command: string) => CommandSpec): Record<string, CommandSpec> {
  return Object.fromEntries(['list', 'check', 'configure', 'disconnect', 'setup', 'refresh', 'install', 'update', 'uninstall'].map(operation => {
    const command = `sources ${operation}`;
    const nativeLifecycle = ['install', 'update', 'uninstall'].includes(operation);
    const homebrew = nativeLifecycle || ['setup', 'refresh'].includes(operation);
    const itemOptions = nativeLifecycle ? ' --item-id <item_id> --expected-revision <revision>' : '';
    return [command, {
      usage: `opl ${command}${operation === 'list' ? '' : ' --source-id <source_id>'}${itemOptions}${operation === 'configure' ? ' [--provider-id github_packages] [--credential-handle <owner-reference>] [--enabled true|false]' : ''}`,
      summary: ({
        list: 'Read public and private software source status without credential values.',
        check: 'Check source access or read the local Homebrew tap inventory.',
        configure: 'Connect a software source using an existing native credential reference.',
        disconnect: 'Disconnect a software source while keeping installed Packages.',
        setup: 'Connect the fixed OPL tap through an existing Homebrew installation.',
        refresh: 'Refresh Homebrew recipe metadata without upgrading installed software.',
        install: 'Install one OPL tap item after fresh native identity and revision checks.',
        update: 'Upgrade one OPL tap item after fresh native identity and revision checks.',
        uninstall: 'Uninstall one OPL tap item without removing user configuration or business data.',
      } as Record<string, string>)[operation],
      examples: [`opl ${command}${operation === 'list' ? '' : ` --source-id ${homebrew ? 'homebrew:gaofeng21cn-one-person-lab' : 'github-packages:gaofeng21cn'}`}${nativeLifecycle ? ' --item-id formula:gaofeng21cn/one-person-lab/opl --expected-revision <revision-from-source-readback>' : ''} --json`],
      group: 'sources', help_surface: 'default' as const,
      handler: (args: string[]) => {
        const parsed = parseRegisteredCommandOptions(command, args, getCommandSpec(command));
        const payload: Record<string, unknown> = {};
        for (const key of ['source-id', 'provider-id', 'credential-handle', 'item-id', 'expected-revision']) {
          if (parsed[key] !== undefined) payload[key.replaceAll('-', '_')] = parsed[key];
        }
        if (parsed.enabled !== undefined) payload.enabled = parsed.enabled === 'true';
        return executeOplSoftwareSourceAction(`source_${operation}` as SoftwareSourceActionId, payload);
      },
    }];
  }));
}
