import { spawnSync } from 'node:child_process';
import { isRecord } from '../../../kernel/contract-validation.ts';
import type { CodexPluginCommandResult } from './configured-codex-plugin-carrier-types.ts';

// Framework projects physical descriptors from native local marketplaces. Remote
// catalog entries have no descriptor path and remain owned by the native carrier.
// This short-lived bridge keeps Package readers synchronous without a model turn.
const LOCAL_READBACK_BRIDGE = String.raw`
const { spawn } = require('node:child_process');
const [binary, timeout] = process.argv.slice(1);
const child = spawn(binary, ['app-server', '--stdio'], {
  env: process.env, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32',
});
let buffer = '', phase = 1, result = null, failure = null, failureCode = null, bytes = 0;
let shutdownTimer, killTimer;
const signal = (value) => {
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, value);
    else child.kill(value);
  } catch {}
};
const terminate = () => {
  signal('SIGTERM');
  killTimer ??= setTimeout(() => signal('SIGKILL'), 200);
};
const fail = (reason, code) => { failure ??= reason; failureCode ??= code; terminate(); };
const deadline = setTimeout(() => fail('Codex local plugin readback timed out.', 'ETIMEDOUT'), Number(timeout));
const send = (frame) => child.stdin.write(JSON.stringify(frame) + '\n');
child.stdin.on('error', () => fail('Codex local plugin readback stdin failed.'));
child.on('error', (error) => fail(error.message, error.code));
child.stderr.on('data', (chunk) => {
  bytes += chunk.length;
  if (bytes > 8 * 1024 * 1024) fail('Codex local plugin readback output exceeded the limit.');
});
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  bytes += Buffer.byteLength(chunk);
  if (bytes > 8 * 1024 * 1024) return fail('Codex local plugin readback output exceeded the limit.');
  buffer += chunk;
  let newline;
  while (!failure && (newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let frame;
    try { frame = JSON.parse(line); } catch { return fail('Codex local plugin readback returned invalid JSON.', 'OPL_CODEX_PLUGIN_READBACK_INVALID_SHAPE'); }
    if (!frame || typeof frame !== 'object') return fail('Codex local plugin readback returned an invalid frame.', 'OPL_CODEX_PLUGIN_READBACK_INVALID_SHAPE');
    if (!('id' in frame) && typeof frame.method === 'string') continue;
    if (frame.error) return fail('Codex local plugin readback rejected the request.');
    if (frame.id !== phase || !frame.result || typeof frame.result !== 'object') {
      return fail('Codex local plugin readback returned an invalid response.', 'OPL_CODEX_PLUGIN_READBACK_INVALID_SHAPE');
    }
    if (phase === 1) {
      phase = 2;
      send({ method: 'initialized', params: {} });
      send({ id: 2, method: 'plugin/list', params: { marketplaceKinds: ['local'] } });
    } else {
      result = frame.result;
      phase = 3;
      clearTimeout(deadline);
      child.stdin.end();
      shutdownTimer = setTimeout(terminate, 500);
    }
  }
});
child.on('close', (code) => {
  clearTimeout(deadline); clearTimeout(shutdownTimer); clearTimeout(killTimer);
  signal('SIGKILL');
  if (!failure && code === 0 && (buffer.trim() || result === null || phase !== 3)) {
    failure = 'Codex local plugin readback returned an incomplete response.';
    failureCode = 'OPL_CODEX_PLUGIN_READBACK_INVALID_SHAPE';
  }
  if (failure || result === null || buffer.trim() || (code !== 0 && !killTimer)) {
    process.stderr.write(failure || 'Codex local plugin readback exited before completion.');
    if (failureCode) process.stdout.write(JSON.stringify({ error: { message: failure, code: failureCode } }));
    process.exitCode = !failure && Number.isInteger(code) && code > 0 ? code : 1;
  } else process.stdout.write(JSON.stringify(result));
});
send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'opl_local_packages', version: '1' } } });
`;

export function readCodexLocalPluginList(input: {
  binary: string;
  env: NodeJS.ProcessEnv;
  includeAvailable?: boolean;
  timeoutMs?: number;
}): CodexPluginCommandResult {
  const timeout = input.timeoutMs ?? 8_000;
  const readback = spawnSync(process.execPath, ['-e', LOCAL_READBACK_BRIDGE, input.binary, String(timeout)], {
    env: input.env, encoding: 'utf8', timeout: timeout + 2_000, maxBuffer: 8 * 1024 * 1024,
  });
  if (readback.status !== 0 || readback.error) {
    let error: Error | null = readback.error ?? null;
    if (!error) {
      try {
        const failure = JSON.parse(readback.stdout).error;
        if (typeof failure?.code === 'string') error = Object.assign(new Error(failure.message), { code: failure.code });
      } catch { /* Native protocol failures retain their exit status and diagnostic. */ }
    }
    return { status: readback.status, stdout: '', stderr: readback.stderr ?? '', error };
  }
  const marketplaces = spawnSync(input.binary, ['plugin', 'marketplace', 'list', '--json'], {
    env: input.env, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024,
  });
  if (marketplaces.status !== 0 || marketplaces.error) return {
    status: marketplaces.status, stdout: marketplaces.stdout ?? '', stderr: marketplaces.stderr ?? '', error: marketplaces.error ?? null,
  };
  try {
    const native: unknown = JSON.parse(readback.stdout);
    const sources: unknown = JSON.parse(marketplaces.stdout);
    if (!isRecord(native)
      || !isRecord(sources) || !Array.isArray(sources.marketplaces)) throw new Error('Invalid native local plugin inventory.');
    const marketplaceSources = new Map(sources.marketplaces.flatMap((entry) => (
      isRecord(entry) && typeof entry.name === 'string' && isRecord(entry.marketplaceSource)
        ? [[entry.name, entry.marketplaceSource] as const] : []
    )));
    const entries = (inventory: unknown) => {
      if (!isRecord(inventory) || !Array.isArray(inventory.marketplaces)
        || !Array.isArray(inventory.marketplaceLoadErrors) || inventory.marketplaceLoadErrors.length > 0) {
        throw new Error('Invalid native local plugin inventory.');
      }
      return inventory.marketplaces.flatMap((marketplace) => {
        if (!isRecord(marketplace) || typeof marketplace.name !== 'string' || !Array.isArray(marketplace.plugins)) {
          throw new Error('Invalid native marketplace inventory.');
        }
        const marketplaceSource = marketplaceSources.get(marketplace.name) ?? null;
        return marketplace.plugins.map((plugin) => {
          if (!isRecord(plugin) || typeof plugin.id !== 'string' || !isRecord(plugin.source)
            || typeof plugin.source.type !== 'string'
            || (plugin.source.type === 'local' && typeof plugin.source.path !== 'string')
            || typeof plugin.installed !== 'boolean' || typeof plugin.enabled !== 'boolean') {
            throw new Error('Invalid native local plugin.');
          }
          return {
            pluginId: plugin.id, version: plugin.localVersion ?? plugin.version ?? null,
            installed: plugin.installed, enabled: plugin.enabled,
            source: { source: plugin.source.type, path: plugin.source.type === 'local' ? plugin.source.path : null },
            marketplaceSource,
          };
        });
      });
    };
    const plugins = entries(native);
    const installed = plugins.filter((entry) => entry.installed);
    const available = input.includeAvailable ? plugins.filter((entry) => !entry.installed) : [];
    return { status: 0, stdout: JSON.stringify({ installed, available }), stderr: '', error: null };
  } catch (error) {
    return { status: 1, stdout: '', stderr: 'Codex local plugin inventory is invalid.',
      error: Object.assign(error instanceof Error ? error : new Error(String(error)),
        { code: 'OPL_CODEX_PLUGIN_READBACK_INVALID_SHAPE' }) };
  }
}
