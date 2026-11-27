import {
  checkPrivatePackageSource,
  configurePrivatePackageSource,
  disconnectPrivatePackageSource,
  listPrivatePackageSources,
} from '@opl/pack';
import { DaemonRpcError } from '../errors.ts';

const optionsByCommand = {
  list: [],
  check: ['--source-id'],
  configure: ['--source-id', '--provider-id', '--credential-handle', '--enabled'],
  disconnect: ['--source-id'],
} as const;

function invalid(message: string): never {
  throw new DaemonRpcError(-32602, 'INVALID_INPUT', message);
}

export async function runPackageSourcesCommand(
  args: readonly string[],
  flags: ReadonlyMap<string, string | boolean>,
) {
  const [command] = args;
  if (args.length !== 1 || !command || !Object.hasOwn(optionsByCommand, command)) {
    invalid('Use opl sources list, configure, check, or disconnect.');
  }
  const allowed = new Set<string>(['--state-dir', ...optionsByCommand[command as keyof typeof optionsByCommand]]);
  for (const [name, value] of flags) {
    if (!allowed.has(name)) invalid('Unexpected software source command option.');
    if (typeof value !== 'string' || !value.trim() || value.startsWith('--')) invalid(`Flag '${name}' requires a value.`);
  }
  const stateDir = flags.get('--state-dir') as string | undefined;
  if (command === 'list') {
    return { software_sources: { entries: listPrivatePackageSources({ stateDir }) } };
  }
  const sourceId = flags.get('--source-id');
  if (typeof sourceId !== 'string') invalid('This software source command requires --source-id.');
  if (command === 'disconnect') {
    return { software_source: disconnectPrivatePackageSource({ stateDir, sourceId }), local_installations_preserved: true };
  }
  if (command === 'check') {
    return { software_source: await checkPrivatePackageSource({ stateDir, sourceId }) };
  }
  const providerId = flags.get('--provider-id');
  if (providerId !== undefined && providerId !== 'github_packages') invalid('--provider-id must be github_packages.');
  const enabled = flags.get('--enabled');
  if (enabled !== undefined && enabled !== 'true' && enabled !== 'false') invalid('--enabled must be true or false.');
  const credentialHandle = flags.get('--credential-handle') as string | undefined;
  const source = configurePrivatePackageSource({
    stateDir, sourceId, credentialHandle: credentialHandle ?? 'provider:github_packages:gh-cli', enabled: enabled !== 'false',
  });
  const checked = source.enabled ? await checkPrivatePackageSource({ stateDir, sourceId }) : source;
  return { software_source: checked, next_action: 'source_list' };
}
