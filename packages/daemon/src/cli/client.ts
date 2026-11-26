import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { isProcessAlive, isRecord, resolveStatePaths, type StatePaths } from '@opl/core';
import { DaemonRpcError } from '../errors.ts';
import type { DaemonSessionFilePayload } from '../server/socket-server.ts';

export interface RpcCallOptions {
  readonly stateDir?: string;
  readonly autoStart?: boolean;
  readonly timeoutMs?: number;
}

function readSessionFile(sessionPath: string): DaemonSessionFilePayload | null {
  if (!fs.existsSync(sessionPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(sessionPath, 'utf8')) as unknown;
    if (!isRecord(raw)) return null;
    if (
      typeof raw.pid !== 'number'
      || typeof raw.socket_path !== 'string'
      || typeof raw.token !== 'string'
      || typeof raw.version !== 'string'
    ) {
      return null;
    }
    return raw as unknown as DaemonSessionFilePayload;
  } catch {
    return null;
  }
}

export function probeSocket(socketPath: string, timeoutMs = 300): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32' && !fs.existsSync(socketPath)) {
      resolve(false);
      return;
    }
    const sock = net.createConnection(socketPath);
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs, () => finish(false));
    sock.once('connect', () => finish(true));
    sock.once('error', () => finish(false));
  });
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveDaemonEntrypointPath(): {
  readonly command: string;
  readonly args: string[];
} {
  const daemonTs = path.resolve(import.meta.dirname, '../../bin/opld');
  if (fs.existsSync(daemonTs)) {
    return { command: daemonTs, args: [] };
  }
  const srcDaemon = path.resolve(import.meta.dirname, '../daemon.ts');
  return {
    command: process.execPath,
    args: ['--conditions=opl-source', '--experimental-strip-types', srcDaemon],
  };
}

export async function spawnDetachedDaemon(paths: StatePaths): Promise<DaemonSessionFilePayload> {
  const existingSession = readSessionFile(paths.session_file);
  if (existingSession) {
    const reachable = await probeSocket(existingSession.socket_path, 300);
    if (reachable) return existingSession;
  }

  fs.mkdirSync(paths.run_dir, { recursive: true, mode: 0o700 });
  const logsDir = path.join(paths.state_dir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, 'opld.log');
  const logFd = fs.openSync(logFile, 'a', 0o600);

  const daemonBin = resolveDaemonEntrypointPath();
  const child = spawn(daemonBin.command, daemonBin.args, {
    cwd: paths.state_dir,
    env: process.env,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  fs.closeSync(logFd);

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const sess = readSessionFile(paths.session_file);
    if (sess && sess.pid > 0 && /^[0-9a-f]{64}$/i.test(sess.token)) {
      if (await probeSocket(sess.socket_path, 250)) {
        return sess;
      }
    }
    if (child.exitCode !== null && child.exitCode !== 0) {
      throw new DaemonRpcError(
        -32000,
        'DAEMON_START_FAILED',
        `Detached opld exited early with code ${child.exitCode}.`,
      );
    }
    await sleepMs(25);
  }

  throw new DaemonRpcError(
    -32000,
    'DAEMON_START_TIMEOUT',
    `Timed out waiting 5s for opld readiness at ${paths.session_file}.`,
  );
}

export async function getDaemonStatus(stateDir?: string): Promise<{
  readonly running: boolean;
  readonly status: 'running' | 'stopped';
  readonly pid: number | null;
  readonly version: string | null;
  readonly socket_path: string;
  readonly session_file: string;
}> {
  const paths = resolveStatePaths({ stateDir });
  const sess = readSessionFile(paths.session_file);
  if (!sess) {
    return {
      running: false,
      status: 'stopped',
      pid: null,
      version: null,
      socket_path: paths.socket_path,
      session_file: paths.session_file,
    };
  }
  const alive = isProcessAlive(sess.pid) && (await probeSocket(sess.socket_path, 300));
  if (!alive) {
    return {
      running: false,
      status: 'stopped',
      pid: null,
      version: null,
      socket_path: paths.socket_path,
      session_file: paths.session_file,
    };
  }

  try {
    const health = (await callDaemonRpc('daemon.health', {}, { stateDir, autoStart: false })) as Record<
      string,
      unknown
    >;
    return {
      running: true,
      status: 'running',
      pid: typeof health.pid === 'number' ? health.pid : sess.pid,
      version: typeof health.version === 'string' ? health.version : sess.version,
      socket_path: sess.socket_path,
      session_file: paths.session_file,
    };
  } catch {
    return {
      running: true,
      status: 'running',
      pid: sess.pid,
      version: sess.version,
      socket_path: sess.socket_path,
      session_file: paths.session_file,
    };
  }
}

export async function stopDaemonGracefully(stateDir?: string): Promise<{
  readonly ok: true;
  readonly stopped: boolean;
}> {
  const paths = resolveStatePaths({ stateDir });
  const sess = readSessionFile(paths.session_file);
  if (!sess) {
    return { ok: true, stopped: true };
  }

  const reachable = await probeSocket(sess.socket_path, 300);
  if (reachable) {
    try {
      await callDaemonRpc('daemon.shutdown', {}, { stateDir, autoStart: false, timeoutMs: 3000 });
    } catch (error) {
      if (isProcessAlive(sess.pid)) {
        try {
          process.kill(sess.pid, 'SIGTERM');
        } catch {
          // ignore
        }
      }
      if (error instanceof DaemonRpcError && error.rpcCode === -32001) {
        throw error;
      }
    }
  } else if (isProcessAlive(sess.pid)) {
    try {
      process.kill(sess.pid, 'SIGTERM');
    } catch {
      // ignore
    }
  }

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const sockGone = process.platform === 'win32' || !fs.existsSync(sess.socket_path);
    const lockGone = !fs.existsSync(paths.lock_file);
    const procGone = !isProcessAlive(sess.pid);
    if (sockGone && lockGone && procGone) {
      return { ok: true, stopped: true };
    }
    await sleepMs(25);
  }
  return { ok: true, stopped: !isProcessAlive(sess.pid) };
}

export async function callDaemonRpc(
  method: string,
  params: Record<string, unknown> = {},
  options: RpcCallOptions = {},
): Promise<unknown> {
  const paths = resolveStatePaths({ stateDir: options.stateDir });
  let session = readSessionFile(paths.session_file);
  const autoStart = options.autoStart !== false;

  if (!session || !(await probeSocket(session.socket_path, 250))) {
    if (!autoStart) {
      throw new DaemonRpcError(-32000, 'DAEMON_NOT_RUNNING', 'opld daemon is not running.');
    }
    session = await spawnDetachedDaemon(paths);
  }

  return sendSingleRpcOverSocket(session, method, params, options.timeoutMs ?? 15_000);
}

function sendSingleRpcOverSocket(
  session: DaemonSessionFilePayload,
  method: string,
  params: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(session.socket_path);
    let buffer = '';
    let settled = false;
    let handshakeSent = false;
    let callSent = false;

    const finishError = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.destroy();
      reject(err);
    };

    const finishSuccess = (result: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.end();
      sock.destroy();
      resolve(result);
    };

    const timer = setTimeout(() => {
      finishError(new DaemonRpcError(-32000, 'RPC_TIMEOUT', `RPC '${method}' timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    sock.setEncoding('utf8');
    sock.on('error', (err) => {
      finishError(new DaemonRpcError(-32000, 'SOCKET_ERROR', err.message));
    });

    sock.on('connect', () => {
      handshakeSent = true;
      sock.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'daemon.handshake',
          params: {
            token: session.token,
            client_kind: 'opl_cli',
            api_version: '2.0',
          },
        })}\n`,
      );
    });

    sock.on('data', (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while (!settled && (nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;

        let frame: unknown;
        try {
          frame = JSON.parse(line);
        } catch {
          continue;
        }
        if (!isRecord(frame)) continue;
        if (!('id' in frame)) continue;

        if (frame.id === 1 && handshakeSent && !callSent) {
          if (isRecord(frame.error)) {
            const errObj = frame.error;
            const errData = isRecord(errObj.data) ? errObj.data : {};
            const errCode = typeof errData.code === 'string' ? errData.code : 'UNAUTHORIZED';
            finishError(
              new DaemonRpcError(
                typeof errObj.code === 'number' ? errObj.code : -32001,
                errCode,
                typeof errObj.message === 'string' ? errObj.message : 'Handshake failed',
                errData,
              ),
            );
            return;
          }
          callSent = true;
          sock.write(
            `${JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              method,
              params,
            })}\n`,
          );
        } else if (frame.id === 2) {
          if (isRecord(frame.error)) {
            const errObj = frame.error;
            const errData = isRecord(errObj.data) ? errObj.data : {};
            const errCode = typeof errData.code === 'string' ? errData.code : 'RPC_ERROR';
            finishError(
              new DaemonRpcError(
                typeof errObj.code === 'number' ? errObj.code : -32000,
                errCode,
                typeof errObj.message === 'string' ? errObj.message : 'RPC error',
                errData,
              ),
            );
            return;
          }
          finishSuccess(frame.result);
        }
      }
    });

    sock.once('close', () => {
      if (!settled) {
        finishError(new DaemonRpcError(-32000, 'SOCKET_CLOSED', 'Daemon socket closed before completing RPC.'));
      }
    });
  });
}
