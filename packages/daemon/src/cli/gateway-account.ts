import { isRecord } from '@opl/core';
import { DaemonRpcError } from '../errors.ts';

const commands = {
  status: ['status'],
  login: ['login', '--credentials-stdin'],
  refresh: ['refresh'],
  'complete-setup': ['completeSetup', '--group-id'],
  repair: ['repair', '--group-id'],
  'use-for-model-access': ['useForModelAccess'],
  'authorize-companion': ['authorizeCompanion', '--request-stdin', '--credential-file'],
  disconnect: ['disconnect'],
} as const;

function invalid(message: string): never {
  throw new DaemonRpcError(-32602, 'INVALID_INPUT', message);
}

async function readStdinObject(): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 65_536) invalid('Gateway stdin exceeds 64 KiB.');
    chunks.push(bytes);
  }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { invalid('Gateway stdin requires a JSON object.'); }
  if (!isRecord(value)) invalid('Gateway stdin requires a JSON object.');
  return value;
}

export async function prepareGatewayCommand(args: readonly string[], flags: Map<string, string | boolean>) {
  const [action] = args;
  if (args.length !== 1 || !action || !Object.hasOwn(commands, action)) invalid('Unknown Gateway command.');
  const [method, ...options] = commands[action as keyof typeof commands];
  const allowed = new Set<string>(['--state-dir', ...options]);
  if ([...flags.keys()].some(key => !allowed.has(key))) invalid('Unexpected Gateway command option.');
  let params: Record<string, unknown> = {};
  if (method === 'login') {
    if (flags.get('--credentials-stdin') !== true) invalid('Gateway login requires --credentials-stdin.');
    params = await readStdinObject();
  } else if (method === 'authorizeCompanion') {
    const credentialFile = flags.get('--credential-file');
    if (flags.get('--request-stdin') !== true || typeof credentialFile !== 'string' || !credentialFile) {
      invalid('Companion authorization requires --request-stdin and --credential-file <path>.');
    }
    params = { request: await readStdinObject(), credential_file: credentialFile };
  } else if (flags.has('--group-id') || method === 'completeSetup') {
    const group = flags.get('--group-id');
    if (typeof group !== 'string' || !group.trim()) invalid('--group-id requires a group ID.');
    params = { group_id: group.trim() };
  }
  return { method: 'connect.gateway.' + method, params };
}
