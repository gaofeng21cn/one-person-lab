import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isRecord } from '@opl/core';
import { PackError } from '../../errors.ts';
import {
  captureCodexCarrierTmpSnapshot,
  cleanupCodexCarrierTmpAfterRun,
  resolveConfiguredCodexHome,
} from './temp-hygiene.ts';

export interface CodexCommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: Error | null;
}

export type CodexPluginSource =
  | { readonly type: 'local'; readonly path: string }
  | {
      readonly type: 'git';
      readonly url: string;
      readonly path: string | null;
      readonly refName: string | null;
      readonly sha: string | null;
    }
  | {
      readonly type: 'npm';
      readonly package: string;
      readonly version: string | null;
      readonly registry: string | null;
    }
  | { readonly type: 'remote' };

export interface CodexPluginSummary {
  readonly id: string;
  readonly name: string;
  readonly version: string | null;
  readonly localVersion: string | null;
  readonly installed: boolean;
  readonly enabled: boolean;
  readonly source: CodexPluginSource;
  readonly interface: Record<string, unknown> | null;
  readonly marketplaceName: string;
  readonly marketplacePath: string | null;
}

export interface CodexPluginListResponse {
  readonly marketplaces: ReadonlyArray<{
    readonly name: string;
    readonly path: string | null;
    readonly plugins: readonly CodexPluginSummary[];
  }>;
  readonly marketplaceLoadErrors: readonly unknown[];
}

export interface CodexMarketplaceEntry {
  readonly name: string | null;
  readonly sourceType: string | null;
  readonly marketplaceSource: string | null;
}

export interface CodexCarrierRunner {
  runCli(args: readonly string[], env?: NodeJS.ProcessEnv): Promise<CodexCommandResult>;
  listPlugins(
    params?: {
      readonly marketplaceKinds?: readonly string[];
      readonly forceRefetch?: boolean;
    },
    env?: NodeJS.ProcessEnv,
  ): Promise<CodexPluginListResponse>;
}

const TRANSIENT_MARKETPLACE_SPAWN_CODES = new Set([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETDOWN',
  'ENETRESET',
  'ENETUNREACH',
  'ETIMEDOUT',
]);

const TRANSIENT_MARKETPLACE_STDERR_PATTERN =
  /SSL_ERROR_SYSCALL|HTTP2 framing|TLS|EOF|timed out|connection reset|unable to access|could not resolve host|RPC failed|curl:\s*\((?:5|6|7|16|18|28|35|52|55|56|92)\)/i;

export function isTransientMarketplaceUpgradeFailure(
  result: Pick<CodexCommandResult, 'status' | 'stderr' | 'error'>,
): boolean {
  if (result.status === 0 && !result.error) return false;
  const errorCode = (result.error as NodeJS.ErrnoException | null)?.code;
  if (typeof errorCode === 'string' && TRANSIENT_MARKETPLACE_SPAWN_CODES.has(errorCode)) {
    return true;
  }
  return TRANSIENT_MARKETPLACE_STDERR_PATTERN.test(result.stderr || '');
}

export function sameMarketplaceSource(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (path.isAbsolute(a) && path.isAbsolute(b)) {
    if (path.resolve(a) === path.resolve(b)) return true;
    try {
      return fs.realpathSync(a) === fs.realpathSync(b);
    } catch {
      return false;
    }
  }
  return a.trim() === b.trim();
}

export function parseMarketplaceListOutput(stdout: string): CodexMarketplaceEntry[] {
  const parsed: unknown = JSON.parse(stdout);
  if (!isRecord(parsed) || !Array.isArray(parsed.marketplaces)) {
    throw new PackError('PACK_CODEX_SYNC_FAILED', 'Invalid codex plugin marketplace list output.');
  }
  return parsed.marketplaces
    .filter(isRecord)
    .map((entry) => {
      const src = isRecord(entry.marketplaceSource) ? entry.marketplaceSource : null;
      return {
        name: typeof entry.name === 'string' ? entry.name : null,
        sourceType:
          src && typeof src.sourceType === 'string'
            ? src.sourceType
            : typeof entry.sourceType === 'string'
              ? entry.sourceType
              : null,
        marketplaceSource:
          src && typeof src.source === 'string'
            ? src.source
            : typeof entry.source === 'string'
              ? entry.source
              : null,
      };
    });
}

function parsePluginSource(raw: unknown): CodexPluginSource {
  if (!isRecord(raw) || typeof raw.type !== 'string') {
    throw new PackError('PACK_CODEX_SYNC_FAILED', 'Invalid Codex PluginSummary.source shape.');
  }
  switch (raw.type) {
    case 'local':
      if (typeof raw.path !== 'string') {
        throw new PackError('PACK_CODEX_SYNC_FAILED', 'Local plugin source missing path.');
      }
      return { type: 'local', path: raw.path };
    case 'git':
      return {
        type: 'git',
        url: typeof raw.url === 'string' ? raw.url : '',
        path: typeof raw.path === 'string' ? raw.path : null,
        refName: typeof raw.refName === 'string' ? raw.refName : null,
        sha: typeof raw.sha === 'string' ? raw.sha : null,
      };
    case 'npm':
      return {
        type: 'npm',
        package: typeof raw.package === 'string' ? raw.package : '',
        version: typeof raw.version === 'string' ? raw.version : null,
        registry: typeof raw.registry === 'string' ? raw.registry : null,
      };
    case 'remote':
      return { type: 'remote' };
    default:
      throw new PackError('PACK_CODEX_SYNC_FAILED', `Unsupported Codex plugin source type '${raw.type}'.`);
  }
}

export function parsePluginListResponse(raw: unknown): CodexPluginListResponse {
  if (!isRecord(raw) || !Array.isArray(raw.marketplaces)) {
    throw new PackError('PACK_CODEX_SYNC_FAILED', 'Invalid Codex app-server plugin/list response.');
  }
  const loadErrors = Array.isArray(raw.marketplaceLoadErrors) ? raw.marketplaceLoadErrors : [];
  const marketplaces = raw.marketplaces.map((mp) => {
    if (!isRecord(mp) || typeof mp.name !== 'string' || !Array.isArray(mp.plugins)) {
      throw new PackError('PACK_CODEX_SYNC_FAILED', 'Invalid marketplace entry in plugin/list response.');
    }
    const mpPath = typeof mp.path === 'string' ? mp.path : null;
    const plugins: CodexPluginSummary[] = mp.plugins.map((p) => {
      if (
        !isRecord(p)
        || typeof p.id !== 'string'
        || typeof p.installed !== 'boolean'
        || typeof p.enabled !== 'boolean'
      ) {
        throw new PackError('PACK_CODEX_SYNC_FAILED', 'Invalid plugin summary in plugin/list response.');
      }
      const name = typeof p.name === 'string' && p.name ? p.name : p.id.split('@')[0] ?? p.id;
      return {
        id: p.id,
        name,
        version: typeof p.version === 'string' ? p.version : null,
        localVersion: typeof p.localVersion === 'string' ? p.localVersion : null,
        installed: p.installed,
        enabled: p.enabled,
        source: parsePluginSource(p.source),
        interface: isRecord(p.interface) ? p.interface : null,
        marketplaceName: mp.name as string,
        marketplacePath: mpPath,
      };
    });
    return {
      name: mp.name,
      path: mpPath,
      plugins,
    };
  });
  return {
    marketplaces,
    marketplaceLoadErrors: loadErrors,
  };
}

function terminateProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  try {
    if (process.platform !== 'win32' && child.pid) {
      process.kill(-child.pid, signal);
      return;
    }
  } catch {
    // Fall back to direct child kill if the process group no longer exists.
  }
  try {
    child.kill(signal);
  } catch {
    // Process already exited.
  }
}

export function createProcessCodexRunner(
  options: { readonly binary?: string; readonly timeoutMs?: number } = {},
): CodexCarrierRunner {
  const binary = options.binary ?? process.env.OPL_CODEX_BIN?.trim() ?? 'codex';
  const timeoutMs = options.timeoutMs ?? 8_000;

  return {
    async runCli(args, env = process.env) {
      const codexHome = resolveConfiguredCodexHome(env);
      const snapshot = captureCodexCarrierTmpSnapshot(codexHome);
      return new Promise<CodexCommandResult>((resolve) => {
        const child = spawn(binary, [...args], {
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
        });
        let stdout = '';
        let stderr = '';
        let killTimer: ReturnType<typeof setTimeout> | undefined;
        let timedOut = false;
        const terminate = () => {
          timedOut = true;
          terminateProcessGroup(child, 'SIGTERM');
          killTimer ??= setTimeout(() => terminateProcessGroup(child, 'SIGKILL'), 200);
        };
        const timer = setTimeout(terminate, timeoutMs);
        const cleanupTmp = (failed: boolean) => {
          cleanupCodexCarrierTmpAfterRun(codexHome, snapshot, {
            aggressiveStagingCleanup: failed || timedOut,
          });
        };
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          if (stdout.length < 8 * 1024 * 1024) stdout += chunk;
        });
        child.stderr.on('data', (chunk: string) => {
          if (stderr.length < 2 * 1024 * 1024) stderr += chunk;
        });
        child.once('error', (error) => {
          clearTimeout(timer);
          if (killTimer) clearTimeout(killTimer);
          cleanupTmp(true);
          resolve({ status: null, stdout, stderr, error });
        });
        child.once('close', (status) => {
          clearTimeout(timer);
          if (killTimer) clearTimeout(killTimer);
          cleanupTmp(status !== 0);
          resolve({ status, stdout, stderr, error: null });
        });
      });
    },

    async listPlugins(params = { marketplaceKinds: ['local'] }, env = process.env) {
      const codexHome = resolveConfiguredCodexHome(env);
      const snapshot = captureCodexCarrierTmpSnapshot(codexHome);
      return new Promise<CodexPluginListResponse>((resolve, reject) => {
        const child = spawn(binary, ['app-server', '--stdio'], {
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
        });
        let buffer = '';
        let phase = 1;
        let closed = false;
        let shutdownRequested = false;
        let forcedTerminate = false;
        let resolvedValue: CodexPluginListResponse | null = null;
        let pendingError: Error | null = null;
        let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
        let killTimer: ReturnType<typeof setTimeout> | undefined;

        const forceKillChain = () => {
          forcedTerminate = true;
          terminateProcessGroup(child, 'SIGTERM');
          killTimer ??= setTimeout(() => terminateProcessGroup(child, 'SIGKILL'), 200);
        };

        const finishError = (err: Error) => {
          if (pendingError || resolvedValue !== null) return;
          pendingError = err;
          clearTimeout(deadline);
          if (shutdownTimer) clearTimeout(shutdownTimer);
          forceKillChain();
          if (closed) settleNow();
        };

        const settleNow = () => {
          clearTimeout(deadline);
          if (shutdownTimer) clearTimeout(shutdownTimer);
          if (killTimer) clearTimeout(killTimer);
          cleanupCodexCarrierTmpAfterRun(codexHome, snapshot, {
            aggressiveStagingCleanup: forcedTerminate || pendingError !== null,
          });
          if (pendingError) {
            reject(pendingError);
            return;
          }
          if (resolvedValue !== null) {
            resolve(resolvedValue);
          }
        };

        const deadline = setTimeout(
          () => finishError(new PackError('PACK_CODEX_SYNC_FAILED', 'Codex plugin/list timed out.')),
          timeoutMs,
        );
        const send = (frame: unknown) => child.stdin.write(`${JSON.stringify(frame)}\n`);

        child.on('error', (error) => {
          finishError(
            new PackError('PACK_CODEX_SYNC_FAILED', `Failed to spawn '${binary}': ${error.message}`, {}, { cause: error }),
          );
          if (!closed) {
            closed = true;
            settleNow();
          }
        });
        child.stdin.on('error', () => {
          if (!shutdownRequested && !pendingError && resolvedValue === null) {
            finishError(new PackError('PACK_CODEX_SYNC_FAILED', 'Codex app-server stdin failed.'));
          }
        });
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          buffer += chunk;
          let nl: number;
          while (!pendingError && resolvedValue === null && (nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            let frame: unknown;
            try {
              frame = JSON.parse(line);
            } catch {
              finishError(new PackError('PACK_CODEX_SYNC_FAILED', 'Codex app-server emitted invalid JSON.'));
              return;
            }
            if (!isRecord(frame)) continue;
            if (!('id' in frame) && typeof frame.method === 'string') continue;
            if (frame.error) {
              finishError(new PackError('PACK_CODEX_SYNC_FAILED', 'Codex app-server returned an RPC error.'));
              return;
            }
            if (frame.id !== phase) continue;
            if (phase === 1) {
              phase = 2;
              send({ method: 'initialized', params: {} });
              send({ id: 2, method: 'plugin/list', params });
            } else if (phase === 2) {
              clearTimeout(deadline);
              shutdownRequested = true;
              try {
                resolvedValue = parsePluginListResponse(frame.result);
              } catch (err) {
                pendingError = err instanceof Error ? err : new Error(String(err));
              }
              try {
                child.stdin.end();
              } catch {
                // Ignore stdin close race.
              }
              shutdownTimer = setTimeout(forceKillChain, 500);
              return;
            }
          }
        });
        child.once('close', (code) => {
          closed = true;
          if (!pendingError && resolvedValue === null) {
            pendingError = new PackError(
              'PACK_CODEX_SYNC_FAILED',
              `Codex app-server exited before completing plugin/list (code=${String(code)}).`,
            );
          }
          settleNow();
        });

        send({
          id: 1,
          method: 'initialize',
          params: { clientInfo: { name: 'opl_pack_codex_sync', version: '2.0.0' } },
        });
      });
    },
  };
}

export async function ensureMarketplaceAvailable(input: {
  readonly marketplaceName: string;
  readonly marketplaceSource: string;
  readonly action: 'install' | 'update' | 'repair' | 'link' | 'sync';
  readonly runner: CodexCarrierRunner;
  readonly env?: NodeJS.ProcessEnv;
  readonly waitForRetry?: (delayMs: number) => Promise<void>;
}): Promise<void> {
  const wait = input.waitForRetry ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const listResult = await input.runner.runCli(['plugin', 'marketplace', 'list', '--json'], input.env);
  const marketplaces =
    listResult.status === 0 && !listResult.error
      ? parseMarketplaceListOutput(listResult.stdout)
      : [];

  const existing = marketplaces.find(
    (entry) =>
      entry.name === input.marketplaceName
      && sameMarketplaceSource(entry.marketplaceSource, input.marketplaceSource),
  );
  if (existing) {
    if ((input.action !== 'update' && input.action !== 'repair') || existing.sourceType !== 'git') {
      return;
    }
    const upgradeArgs = ['plugin', 'marketplace', 'upgrade', input.marketplaceName, '--json'];
    let attempt = 1;
    let res = await input.runner.runCli(upgradeArgs, input.env);
    while (attempt < 3 && isTransientMarketplaceUpgradeFailure(res)) {
      await wait(250 * 2 ** (attempt - 1));
      attempt += 1;
      res = await input.runner.runCli(upgradeArgs, input.env);
    }
    if (res.status !== 0 || res.error) {
      throw new PackError(
        'PACK_CODEX_SYNC_FAILED',
        `Codex marketplace upgrade failed for '${input.marketplaceName}': ${res.stderr || res.error?.message || 'unknown error'}`,
      );
    }
    return;
  }

  const replaced = path.isAbsolute(input.marketplaceSource)
    ? marketplaces.find(
        (entry) =>
          entry.name === input.marketplaceName
          && entry.sourceType === 'git'
          && entry.marketplaceSource
          && !sameMarketplaceSource(entry.marketplaceSource, input.marketplaceSource),
      ) ?? null
    : null;

  if (replaced) {
    const removeRes = await input.runner.runCli(
      ['plugin', 'marketplace', 'remove', input.marketplaceName, '--json'],
      input.env,
    );
    if (removeRes.status !== 0 || removeRes.error) {
      throw new PackError(
        'PACK_CODEX_SYNC_FAILED',
        `Failed to remove previous git marketplace '${input.marketplaceName}': ${removeRes.stderr}`,
      );
    }
  }

  const addRes = await input.runner.runCli(
    ['plugin', 'marketplace', 'add', input.marketplaceSource, '--json'],
    input.env,
  );
  if (addRes.status !== 0 || addRes.error) {
    if (replaced?.marketplaceSource) {
      await input.runner.runCli(
        ['plugin', 'marketplace', 'add', replaced.marketplaceSource, '--json'],
        input.env,
      );
    }
    throw new PackError(
      'PACK_CODEX_SYNC_FAILED',
      `Failed to add Codex marketplace '${input.marketplaceSource}': ${addRes.stderr || addRes.error?.message || 'unknown error'}`,
    );
  }
}

export async function removeUnusedMarketplaces(input: {
  readonly marketplaceNames: readonly string[];
  readonly installedPluginIds: readonly string[];
  readonly runner: CodexCarrierRunner;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<string[]> {
  const used = new Set(
    input.installedPluginIds
      .map((id) => id.split('@')[1] ?? '')
      .filter(Boolean),
  );
  const candidates = [...new Set(input.marketplaceNames)].filter((n) => n && !used.has(n));
  if (candidates.length === 0) return [];

  const listRes = await input.runner.runCli(['plugin', 'marketplace', 'list', '--json'], input.env);
  if (listRes.status !== 0 || listRes.error) return [];
  const configured = new Set(
    parseMarketplaceListOutput(listRes.stdout)
      .map((e) => e.name)
      .filter((n): n is string => Boolean(n)),
  );
  const removed: string[] = [];
  for (const name of candidates) {
    if (!configured.has(name)) continue;
    const res = await input.runner.runCli(['plugin', 'marketplace', 'remove', name, '--json'], input.env);
    if (res.status === 0 && !res.error) {
      removed.push(name);
    }
  }
  return removed;
}
