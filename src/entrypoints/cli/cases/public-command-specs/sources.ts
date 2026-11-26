import { executeOplSoftwareSourceAction, type SoftwareSourceActionId } from '../../../../adapters/integration/index.ts';
import { parseRegisteredCommandOptions, type CommandSpec } from '../../modules/support.ts';

export function buildSoftwareSourcesCommandSpecs(getCommandSpec: (command: string) => CommandSpec): Record<string, CommandSpec> {
  return Object.fromEntries(['list', 'check', 'configure', 'disconnect', 'setup', 'refresh', 'add', 'remove', 'install', 'update', 'uninstall'].map(operation => {
    const command = `sources ${operation}`;
    const nativeLifecycle = ['install', 'update', 'uninstall'].includes(operation);
    const homebrew = nativeLifecycle || operation === 'setup';
    const itemOptions = nativeLifecycle ? ' --item-id <item_id> --expected-revision <revision>' : '';
    const extraOptions = operation === 'configure'
      ? ' [--provider-id github_packages] [--credential-handle <owner-reference>] [--enabled true|false]'
      : operation === 'add'
        ? ' --url <catalog_index_url> [--display-name <name>]'
        : '';
    const exampleArgs = operation === 'list'
      ? ''
      : operation === 'add'
        ? ' --source-id catalog:team --url https://example.com/catalog-index.json --display-name "Team Catalog"'
        : operation === 'remove'
          ? ' --source-id catalog:team'
          : operation === 'refresh'
            ? ' --source-id public-registry:opl'
            : ` --source-id ${homebrew ? 'homebrew:gaofeng21cn-one-person-lab' : 'github-packages:gaofeng21cn'}`;
    return [command, {
      usage: `opl ${command}${operation === 'list' ? '' : ' --source-id <source_id>'}${extraOptions}${itemOptions}`,
      summary: ({
        list: 'Read public and private software source status without credential values.',
        check: 'Check source access, verify catalog availability, or read the local Homebrew tap inventory.',
        configure: 'Connect a software source using an existing native credential reference.',
        disconnect: 'Disconnect a software source while keeping installed Packages.',
        setup: 'Connect the fixed OPL tap through an existing Homebrew installation.',
        refresh: 'Refresh catalog index metadata or Homebrew recipe metadata without upgrading installed software.',
        add: 'Register an external opl-catalog software source index.',
        remove: 'Remove a registered external catalog software source and its local cache.',
        install: 'Install one OPL tap item after fresh native identity and revision checks.',
        update: 'Upgrade one OPL tap item after fresh native identity and revision checks.',
        uninstall: 'Uninstall one OPL tap item without removing user configuration or business data.',
      } as Record<string, string>)[operation],
      examples: [`opl ${command}${exampleArgs}${nativeLifecycle ? ' --item-id formula:gaofeng21cn/one-person-lab/opl --expected-revision <revision-from-source-readback>' : ''} --json`],
      group: 'sources', help_surface: 'default' as const,
      handler: (args: string[]) => {
        const parsed = parseRegisteredCommandOptions(command, args, getCommandSpec(command));
        const payload: Record<string, unknown> = {};
        for (const key of ['source-id', 'provider-id', 'credential-handle', 'item-id', 'expected-revision', 'url', 'display-name']) {
          if (parsed[key] !== undefined) payload[key.replaceAll('-', '_')] = parsed[key];
        }
        if (parsed.enabled !== undefined) payload.enabled = parsed.enabled === 'true';
        return executeOplSoftwareSourceAction(`source_${operation}` as SoftwareSourceActionId, payload);
      },
    }];
  }));
}
