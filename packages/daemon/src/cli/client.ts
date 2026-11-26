import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { acquireAdvisoryLock, isProcessAlive, isRecord, resolveStatePaths, type AdvisoryLockHandle, type StatePaths } from '@opl/core';
import { DaemonRpcError } from '../errors.ts';
import type { DaemonSessionFilePayload } from '../server/socket-server.ts';

const IN_FLIGHT_BOOTS = new Map<string, Promise<DaemonSessionFilePayload>>();

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

async function acquireBootLockAsync(lockPath: string, timeoutMs = 5_000): Promise<AdvisoryLockHandle> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      return acquireAdvisoryLock(lockPath, {
        ownerId: `boot_${process.pid}`,
        staleAfterMs: 15_000,
        timeoutMs: 0,
      });
    } catch (error) {
      if (Date.now() >= deadline) {
        throw error;
      }
      await sleepMs(20);
    }
  }
}

async function spawnDetachedDaemonSerialized(paths: StatePaths): Promise<DaemonSessionFilePayload> {
  fs.mkdirSync(paths.run_dir, { recursive: true, mode: 0o700 });
  const bootLockPath = path.join(paths.run_dir, 'opld.boot.lock');
  const bootLock = await acquireBootLockAsync(bootLockPath, 5_000);
  try {
    const existingSession = readSessionFile(paths.session_file);
    if (existingSession && existingSession.pid > 0 && /^[0-9a-f]{64}$/i.test(existingSession.token)) {
      const reachable = await probeSocket(existingSession.socket_path, 300);
      if (reachable) return existingSession;
    }

    const logsDir = path.join(paths.state_dir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const logFile = path.join(logsDir, 'opld.log');
    const logFd = fs.openSync(logFile, 'a', 0o600);

    const daemonBin = resolveDaemonEntrypointPath();
    const child = spawn(daemonBin.command, daemonBin.args, {
      cwd: paths.state_dir,
      env: { ...process.env, OPL_STATE_DIR: paths.state_dir },
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });
    child.unref();
    fs.closeSync(logFd);

    const deadline = Date.now() + 5_000;
    let exitedGraceWindowUntil = 0;
    while (Date.now() < deadline) {
      const sess = readSessionFile(paths.session_file);
      if (sess && sess.pid > 0 && /^[0-9a-f]{64}$/i.test(sess.token)) {
        if (await probeSocket(sess.socket_path, 250)) {
          return sess;
        }
      }
      if (child.exitCode !== null && child.exitCode !== 0) {
        if (exitedGraceWindowUntil === 0) {
          exitedGraceWindowUntil = Math.min(deadline, Date.now() + 600);
        }
        if (Date.now() >= exitedGraceWindowUntil) {
          const racedSess = readSessionFile(paths.session_file);
          if (racedSess && racedSess.pid > 0 && /^[0-9a-f]{64}$/i.test(racedSess.token)) {
            if (await probeSocket(racedSess.socket_path, 250)) {
              return racedSess;
            }
          }
          throw new DaemonRpcError(
            -32000,
            'DAEMON_START_FAILED',
            `Detached opld exited early with code ${child.exitCode}.`,
          );
        }
      }
      await sleepMs(25);
    }

    throw new DaemonRpcError(
      -32000,
      'DAEMON_START_TIMEOUT',
      `Timed out waiting 5s for opld readiness at ${paths.session_file}.`,
    );
  } finally {
    bootLock.release();
  }
}

export async function spawnDetachedDaemon(paths: StatePaths): Promise<DaemonSessionFilePayload> {
  const existingSession = readSessionFile(paths.session_file);
  if (existingSession && existingSession.pid > 0 && /^[0-9a-f]{64}$/i.test(existingSession.token)) {
    const reachable = await probeSocket(existingSession.socket_path, 300);
    if (reachable) return existingSession;
  }

  const key = path.resolve(paths.run_dir);
  const inFlight = IN_FLIGHT_BOOTS.get(key);
  if (inFlight) {
    return await inFlight;
  }

  const bootPromise = spawnDetachedDaemonSerialized(paths).finally(() => {
    IN_FLIGHT_BOOTS.delete(key);
  });
  IN_FLIGHT_BOOTS.set(key, bootPromise);
  return await bootPromise;
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

async function shutdownSessionTarget(
  sess: DaemonSessionFilePayload,
  stateDir?: string,
): Promise<void> {
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
}

export async function stopDaemonGracefully(stateDir?: string): Promise<{
  readonly ok: true;
  readonly stopped: boolean;
}> {
  const paths = resolveStatePaths({ stateDir });
  const bootLockPath = path.join(paths.run_dir, 'opld.boot.lock');
  let bootLock: AdvisoryLockHandle | null = null;
  if (fs.existsSync(paths.run_dir)) {
    try {
      bootLock = await acquireBootLockAsync(bootLockPath, 5_000);
    } catch {
      bootLock = null;
    }
  }

  try {
    const trackedPids = new Set<number>();
    const initialSess = readSessionFile(paths.session_file);
    if (initialSess) {
      trackedPids.add(initialSess.pid);
      await shutdownSessionTarget(initialSess, stateDir);
    } else if (fs.existsSync(paths.lock_file)) {
      try {
        const rawLock = JSON.parse(fs.readFileSync(paths.lock_file, 'utf8')) as { pid?: unknown };
        if (typeof rawLock.pid === 'number' && rawLock.pid > 0) {
          trackedPids.add(rawLock.pid);
          if (isProcessAlive(rawLock.pid)) {
            process.kill(rawLock.pid, 'SIGTERM');
          }
        }
      } catch {
        // ignore
      }
    } else {
      return { ok: true, stopped: true };
    }

    const deadline = Date.now() + 3000;
    let sentForceSigterm = false;
    while (Date.now() < deadline) {
      const latestSess = readSessionFile(paths.session_file);
      if (latestSess && latestSess.pid > 0 && !trackedPids.has(latestSess.pid)) {
        trackedPids.add(latestSess.pid);
        await shutdownSessionTarget(latestSess, stateDir);
      }

      const sockPath = latestSess?.socket_path ?? initialSess?.socket_path ?? paths.socket_path;
      const sockGone = process.platform === 'win32' || !fs.existsSync(sockPath);
      const lockGone = !fs.existsSync(paths.lock_file);
      const allProcsGone = [...trackedPids].every((pid) => !isProcessAlive(pid));
      if (sockGone && lockGone && allProcsGone) {
        return { ok: true, stopped: true };
      }

      if (!sentForceSigterm && Date.now() >= deadline - 600) {
        sentForceSigterm = true;
        for (const pid of trackedPids) {
          if (isProcessAlive(pid)) {
            try {
              process.kill(pid, 'SIGTERM');
            } catch {
              // ignore
            }
          }
        }
      }
      await sleepMs(25);
    }

    for (const pid of trackedPids) {
      if (isProcessAlive(pid)) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // ignore
        }
      }
    }
    await sleepMs(50);
    return { ok: true, stopped: [...trackedPids].every((pid) => !isProcessAlive(pid)) };
  } finally {
    bootLock?.release();
  }
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
