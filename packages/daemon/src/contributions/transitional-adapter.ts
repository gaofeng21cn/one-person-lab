import fs from 'node:fs';
import { isRecord } from '@opl/core';
import { resolveSafePackagePath } from '@opl/pack';
import { DaemonRpcError } from '../errors.ts';

export const TRANSITIONAL_V1_ADAPTER = ['opl', 'app', 'contribution', 'adapter', '--stdin'] as const;
// Remove the TRANSITIONAL_V1_ADAPTER interpreter in Wave 3C.

function invalid(message: string): never {
  throw new DaemonRpcError(-32602, 'CONTRIBUTION_ADAPTER_INVALID', message);
}

function boundedJson(root: string, relativePath: string, limit: number): unknown {
  const file = resolveSafePackagePath(root, relativePath.replace(/^\.\//, ''), { allowSymlinks: false });
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) invalid('Adapter JSON exceeds its bounds.');
    const bytes = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = fs.readSync(fd, bytes, length, bytes.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length !== stat.size) invalid('Adapter JSON changed while reading.');
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length))) as unknown; }
    catch { return invalid('Invalid adapter JSON.'); }
  } finally {
    fs.closeSync(fd);
  }
}

export async function executeTransitionalAdapter(
  root: string,
  request: { operation: 'read' | 'execute'; ref: string; package_id: string; input: Record<string, unknown> },
  run: (argv: string[], input: unknown) => Promise<unknown>,
) {
  const manifest = boundedJson(root, 'app-contribution-adapter.json', 256 * 1024);
  if (!isRecord(manifest) || (manifest.schema_version !== 'opl-package-app-contribution-adapter.v1'
    && manifest.schema_version !== 'opl_app_contribution_adapter.v1')) invalid('Unsupported adapter manifest.');
  const table = request.operation === 'read' ? manifest.reads ?? manifest.views : manifest.actions;
  const selected = isRecord(table) && Object.hasOwn(table, request.ref) ? table[request.ref] : undefined;
  const entries = Array.isArray(selected) ? selected : selected === undefined ? [] : [selected];
  if (!entries.length || entries.length > 16) invalid('Adapter reference has no bounded declaration.');
  const results: unknown[] = [];
  for (const entry of entries) {
    const command = typeof entry === 'string' ? { kind: 'command', argv: [entry], stdin: 'request_json' } : entry;
    if (!isRecord(command)) invalid('Invalid adapter declaration.');
    if (command.kind === 'json_file' && request.operation === 'read' && typeof command.path === 'string'
      && (command.root === undefined || command.root === 'package')) {
      results.push(boundedJson(root, command.path, 2 * 1024 * 1024));
      continue;
    }
    if (command.kind !== 'command' || (command.cwd !== undefined && command.cwd !== 'package')
      || !Array.isArray(command.argv) || !command.argv.length || command.argv.length > 32
      || command.argv.some(arg => typeof arg !== 'string' || !arg || arg.length > 2048 || arg.includes('\0'))) {
      invalid('Unsupported adapter command.');
    }
    const argv = [...command.argv] as string[];
    const scriptIndex = /^python(?:3(?:\.\d+)?)?$/.test(argv[0]!) ? 1 : 0;
    const script = argv[scriptIndex];
    if (!script || script.startsWith('-')) invalid('Adapter command requires a package script.');
    if (scriptIndex === 1 && !script.endsWith('.py')) invalid('Adapter requires a Python script.');
    resolveSafePackagePath(root, script.replace(/^\.\//, ''), { allowSymlinks: false });
    argv[scriptIndex] = './' + script.replace(/^\.\//, '');
    if (command.stdin !== undefined && command.stdin !== 'input_json' && command.stdin !== 'request_json') {
      invalid('Unsupported adapter stdin format.');
    }
    results.push(await run(argv, command.stdin === 'input_json' ? request.input
      : command.stdin === 'request_json' ? request : undefined));
  }
  const result = results.length === 1 ? results[0] : {
    state: 'ready', data: { items: results.map((value, index) => ({ id: request.ref + ':' + index, value })) },
  };
  if (isRecord(result) && result.schema_version === 'opl-package-app-contribution-response.v1') return result;
  return {
    schema_version: 'opl-package-app-contribution-response.v1', package_id: request.package_id,
    operation: request.operation, ref: request.ref, ok: true, result,
  };
}
