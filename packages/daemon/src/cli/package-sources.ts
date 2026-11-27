import { callDaemonRpc } from './client.ts';
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
  const options = { stateDir, timeoutMs: 50_000 };
  if (command === 'list') return callDaemonRpc('pack.sources.list', {}, options);
  const sourceId = flags.get('--source-id');
  if (typeof sourceId !== 'string') invalid('This software source command requires --source-id.');
  if (command === 'disconnect' || command === 'check') {
    return callDaemonRpc('pack.sources.' + command, { source_id: sourceId }, options);
  }
  const providerId = flags.get('--provider-id') ?? 'github_packages';
  if (providerId !== 'github_packages') invalid('--provider-id must be github_packages.');
  const enabled = flags.get('--enabled');
  if (enabled !== undefined && enabled !== 'true' && enabled !== 'false') invalid('--enabled must be true or false.');
  return callDaemonRpc('pack.sources.configure', {
    source_id: sourceId, provider_id: providerId,
    credential_handle: flags.get('--credential-handle') ?? 'provider:github_packages:gh-cli',
    enabled: enabled !== 'false',
  }, options);
}
