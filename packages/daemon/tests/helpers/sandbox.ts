import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { isProcessAlive, openSqliteStore } from '@opl/core';
import { waitForCodexStartupProbe } from '@opl/runway';
import { startDaemonServer, type StartedDaemonServer } from '../../src/daemon.ts';

export const WORKTREE_ROOT = path.resolve(import.meta.dirname, '../../../..');
export const V2_OPL_BIN = path.join(WORKTREE_ROOT, 'packages', 'daemon', 'bin', 'opl');
export const ROOT_OPL_BIN = path.join(WORKTREE_ROOT, 'bin', 'opl');
export const E2E_CODEX_STUB = path.join(WORKTREE_ROOT, 'tests', 'e2e', 'stubs', 'bin', 'codex');
export const E2E_AGY_STUB = path.join(WORKTREE_ROOT, 'tests', 'e2e', 'stubs', 'bin', 'agy');
export const BIN_OPLD_ENTRY = path.join(WORKTREE_ROOT, 'packages', 'daemon', 'src', 'cli', 'bin-opld.ts');

export interface SpawnedDaemonProcess {
  readonly pid: number;
  readonly child: ChildProcess;
  readonly session: {
    readonly pid: number;
    readonly version: string;
    readonly api_version: string;
    readonly started_at: string;
    readonly socket_path: string;
    readonly token: string;
  };
  kill(signal?: NodeJS.Signals): void;
  waitForExit(timeoutMs?: number): Promise<number | null>;
}

export interface DaemonSandbox {
  readonly root: string;
  readonly homeDir: string;
  readonly oplHome: string;
  readonly stateDir: string;
  readonly runDir: string;
  readonly configDir: string;
  readonly codexHome: string;
  readonly workspaceDir: string;
  readonly stubLogDir: string;
  readonly sockPath: string;
  readonly lockPath: string;
  readonly sessionPath: string;
  readonly dbPath: string;
  readonly env: NodeJS.ProcessEnv;
  startInProcess(): Promise<StartedDaemonServer>;
  spawnDaemonProcess(extraEnv?: NodeJS.ProcessEnv): Promise<SpawnedDaemonProcess>;
  spawnCli(args: readonly string[], extraEnv?: NodeJS.ProcessEnv): Promise<{ code: number; stdout: string; stderr: string; json: unknown }>;
  spawnRootCli(args: readonly string[], extraEnv?: NodeJS.ProcessEnv): Promise<{ code: number; stdout: string; stderr: string; json: unknown }>;
  trackChild(child: ChildProcess): ChildProcess;
  trackPid(pid: number): number;
  cleanup(): Promise<void>;
}

export function createDaemonSandbox(extraEnv: NodeJS.ProcessEnv = {}): DaemonSandbox {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-d-'));
  const homeDir = path.join(root, 'h');
  const oplHome = path.join(homeDir, '.opl');
  const stateDir = path.join(root, 's');
  const runDir = path.join(stateDir, 'run');
  const configDir = path.join(root, 'c');
  const codexHome = path.join(root, 'cx');
  const workspaceDir = path.join(root, 'ws');
  const stubLogDir = path.join(root, 'logs');
  const stubsBinDir = path.dirname(E2E_CODEX_STUB);

  for (const d of [homeDir, oplHome, stateDir, runDir, configDir, codexHome, workspaceDir, stubLogDir]) {
    fs.mkdirSync(d, { recursive: true });
  }

  const sockPath = path.join(runDir, 'opld.sock');
  const lockPath = path.join(runDir, 'opld.lock');
  const sessionPath = path.join(runDir, 'opld.session.json');
  const dbPath = path.join(stateDir, 'opl.db');

  const cleanEnv: NodeJS.ProcessEnv = { ...process.env };
  delete cleanEnv.NODE_TEST_CONTEXT;
  delete cleanEnv.OPL_REPO_TEMP_ENV_ACTIVE;
  delete cleanEnv.OPL_CODEX_MARKETPLACE_DIR;
  delete cleanEnv.OPL_STUB_CODEX_APP_SERVER_FAULT;

  const env: NodeJS.ProcessEnv = {
    ...cleanEnv,
    HOME: homeDir,
    USERPROFILE: homeDir,
    OPL_HOME: oplHome,
    OPL_STATE_DIR: stateDir,
    OPL_CONFIG_DIR: configDir,
    CODEX_HOME: codexHome,
    OPL_STUB_LOG_DIR: stubLogDir,
    OPL_CODEX_BIN: E2E_CODEX_STUB,
    OPL_AGY_BIN: E2E_AGY_STUB,
    PATH: `${stubsBinDir}${path.delimiter}${cleanEnv.PATH ?? ''}`,
    NODE_NO_WARNINGS: '1',
    ...extraEnv,
  };

  const startedServers: StartedDaemonServer[] = [];
  const children: ChildProcess[] = [];
  const trackedPids = new Set<number>();
  const savedEnv = new Map<string, string | undefined>();
  for (const key of [
    'HOME',
    'OPL_HOME',
    'OPL_STATE_DIR',
    'OPL_CONFIG_DIR',
    'CODEX_HOME',
    'OPL_STUB_LOG_DIR',
    'OPL_CODEX_BIN',
    'OPL_AGY_BIN',
    'OPL_CODEX_MARKETPLACE_DIR',
    'OPL_STUB_CODEX_APP_SERVER_FAULT',
    'OPL_STUB_CODEX_EXTERNAL_PLUGINS_JSON',
  ]) {
    savedEnv.set(key, process.env[key]);
  }

  function applyProcessEnv(): void {
    for (const [k, v] of Object.entries(env)) {
      if (v !== undefined) process.env[k] = v;
    }
  }

  function runBin(binPath: string, args: readonly string[], callEnv: NodeJS.ProcessEnv = {}) {
    return new Promise<{ code: number; stdout: string; stderr: string; json: unknown }>((resolve, reject) => {
      const child = spawn(binPath, [...args], {
        cwd: workspaceDir,
        env: { ...env, ...callEnv },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (c: Buffer) => {
        stdout += c.toString('utf8');
      });
      child.stderr.on('data', (c: Buffer) => {
        stderr += c.toString('utf8');
      });
      child.on('error', reject);
      child.on('close', (code) => {
        let json: unknown = null;
        try {
          json = JSON.parse(stdout.trim());
        } catch {
          json = null;
        }
        resolve({ code: code ?? 1, stdout, stderr, json });
      });
    });
  }

  return {
    root,
    homeDir,
    oplHome,
    stateDir,
    runDir,
    configDir,
    codexHome,
    workspaceDir,
    stubLogDir,
    sockPath,
    lockPath,
    sessionPath,
    dbPath,
    env,
    async startInProcess() {
      applyProcessEnv();
      const srv = await startDaemonServer({ stateDir });
      startedServers.push(srv);
      return srv;
    },
    async spawnDaemonProcess(callEnv = {}) {
      const child = spawn(
        process.execPath,
        ['--conditions=opl-source', '--experimental-strip-types', BIN_OPLD_ENTRY],
        {
          cwd: workspaceDir,
          env: { ...env, ...callEnv, OPL_STATE_DIR: stateDir },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      children.push(child);
      if (child.pid) trackedPids.add(child.pid);

      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      let exited = false;
      let exitCode: number | null = null;
      const exitPromise = new Promise<number | null>((resolve) => {
        child.once('exit', (code) => {
          exited = true;
          exitCode = code;
          resolve(code);
        });
      });

      const probeReady = (): Promise<boolean> =>
        new Promise((resolve) => {
          if (!fs.existsSync(sockPath)) {
            resolve(false);
            return;
          }
          const sock = net.createConnection(sockPath);
          let settled = false;
          const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            sock.destroy();
            resolve(ok);
          };
          sock.setTimeout(200, () => finish(false));
          sock.once('connect', () => finish(true));
          sock.once('error', () => finish(false));
        });

      const deadline = Date.now() + 10_000;
      let parsedSession: SpawnedDaemonProcess['session'] | null = null;
      while (Date.now() < deadline) {
        if (exited) {
          throw new Error(`opld exited prematurely (${String(exitCode)}): ${stderr}`);
        }
        if (fs.existsSync(sessionPath)) {
          try {
            const raw = JSON.parse(fs.readFileSync(sessionPath, 'utf8')) as SpawnedDaemonProcess['session'];
            if (raw.pid === child.pid && raw.token && (await probeReady())) {
              parsedSession = raw;
              break;
            }
          } catch {
            // session file mid-write
          }
        }
        await new Promise((r) => setTimeout(r, 30));
      }

      if (!parsedSession) {
        try {
          if (child.pid && isProcessAlive(child.pid)) process.kill(child.pid, 'SIGKILL');
        } catch {
          // ignore
        }
        throw new Error(`Timed out waiting for spawned opld readiness: ${stderr}`);
      }

      return {
        pid: child.pid!,
        child,
        session: parsedSession,
        kill(signal: NodeJS.Signals = 'SIGKILL') {
          if (child.pid && isProcessAlive(child.pid)) {
            process.kill(child.pid, signal);
          }
        },
        async waitForExit(timeoutMs = 5_000) {
          if (exited) return exitCode;
          return await Promise.race([
            exitPromise,
            new Promise<number | null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
          ]);
        },
      };
    },
    spawnCli(args, callEnv) {
      return runBin(V2_OPL_BIN, args, callEnv);
    },
    spawnRootCli(args, callEnv) {
      return runBin(ROOT_OPL_BIN, args, callEnv);
    },
    trackChild(child) {
      children.push(child);
      if (child.pid) trackedPids.add(child.pid);
      return child;
    },
    trackPid(pid) {
      trackedPids.add(pid);
      return pid;
    },
    async cleanup() {
      const servers = startedServers.splice(0);
      for (const s of servers) {
        await s.shutdown().catch(() => {});
      }
      // The in-process startup probe can still write stub logs after daemon shutdown.
      if (servers.length) await waitForCodexStartupProbe(env);
      if (fs.existsSync(sessionPath)) {
        try {
          const sess = JSON.parse(fs.readFileSync(sessionPath, 'utf8')) as { pid?: number };
          if (sess.pid && sess.pid !== process.pid && isProcessAlive(sess.pid)) {
            process.kill(sess.pid, 'SIGTERM');
            await new Promise((r) => setTimeout(r, 200));
            if (isProcessAlive(sess.pid)) process.kill(sess.pid, 'SIGKILL');
          }
        } catch {
          // ignore
        }
      }
      if (fs.existsSync(dbPath)) {
        try {
          const db = openSqliteStore(dbPath, { readOnly: true });
          const rows = db.prepare('SELECT local_pid FROM attempts WHERE local_pid IS NOT NULL').all() as Array<{
            local_pid?: number;
          }>;
          db.close();
          for (const row of rows) {
            if (row.local_pid && row.local_pid !== process.pid) {
              trackedPids.add(row.local_pid);
            }
          }
        } catch {
          // ignore
        }
      }
      for (const c of children.splice(0)) {
        if (c.pid && isProcessAlive(c.pid)) {
          try {
            process.kill(c.pid, 'SIGKILL');
          } catch {
            // ignore
          }
        }
      }
      for (const pid of trackedPids) {
        if (pid !== process.pid && isProcessAlive(pid)) {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            // ignore
          }
        }
      }
      trackedPids.clear();
      for (const [k, v] of savedEnv.entries()) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

export interface TestRpcEvent {
  readonly method: string;
  readonly params: Record<string, unknown>;
  readonly raw: Record<string, unknown>;
}

export class TestRpcClient {
  readonly #sockPath: string;
  readonly #token: string;
  #sock: net.Socket | null = null;
  #nextId = 1;
  #buffer = '';
  #pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  #events: TestRpcEvent[] = [];
  #eventWaiters: Array<{ pred: (e: TestRpcEvent) => boolean; resolve: (e: TestRpcEvent) => void; timer: NodeJS.Timeout }> = [];
  #closed = false;
  #closeWaiters: Array<() => void> = [];
  handshakeResult: Record<string, unknown> | null = null;

  constructor(sessionPath: string, tokenOverride?: string) {
    const sess = JSON.parse(fs.readFileSync(sessionPath, 'utf8')) as { socket_path: string; token: string };
    this.#sockPath = sess.socket_path;
    this.#token = tokenOverride ?? sess.token;
  }

  get closed(): boolean {
    return this.#closed;
  }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const sock = net.createConnection(this.#sockPath);
      this.#sock = sock;
      sock.setEncoding('utf8');
      sock.once('error', reject);
      sock.once('connect', () => {
        sock.off('error', reject);
        resolve();
      });
      sock.on('data', (chunk: string) => this.onData(chunk));
      sock.on('close', () => {
        this.#closed = true;
        for (const p of this.#pending.values()) {
          p.reject(new Error('Socket closed'));
        }
        this.#pending.clear();
        for (const w of this.#closeWaiters.splice(0)) w();
      });
      sock.on('error', () => {
        // handled via close
      });
    });
  }

  async handshake(clientKind = 'opl_app', apiVersion?: string, codexHome?: string): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = { token: this.#token, client_kind: clientKind };
    if (apiVersion !== undefined) params.api_version = apiVersion;
    if (codexHome !== undefined) params.codex_home = codexHome;
    const res = (await this.call('daemon.handshake', params)) as Record<string, unknown>;
    this.handshakeResult = res;
    return res;
  }

  call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.#sock || this.#closed) return Promise.reject(new Error('Not connected'));
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#sock!.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  sendRaw(raw: string): void {
    this.#sock?.write(raw);
  }

  drainEvents(methodPrefix?: string): TestRpcEvent[] {
    if (!methodPrefix) {
      return this.#events.splice(0);
    }
    const matched: TestRpcEvent[] = [];
    const remaining: TestRpcEvent[] = [];
    for (const ev of this.#events) {
      if (ev.method === methodPrefix || ev.method.startsWith(methodPrefix)) matched.push(ev);
      else remaining.push(ev);
    }
    this.#events = remaining;
    return matched;
  }

  waitForEvent(pred: (e: TestRpcEvent) => boolean, timeoutMs = 3000): Promise<TestRpcEvent> {
    const idx = this.#events.findIndex(pred);
    if (idx >= 0) {
      return Promise.resolve(this.#events.splice(idx, 1)[0]!);
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        pred,
        resolve,
        timer: setTimeout(() => {
          const wIdx = this.#eventWaiters.indexOf(waiter);
          if (wIdx >= 0) this.#eventWaiters.splice(wIdx, 1);
          reject(new Error(`Timed out waiting for event after ${timeoutMs}ms`));
        }, timeoutMs),
      };
      this.#eventWaiters.push(waiter);
    });
  }

  waitForClose(timeoutMs = 2000): Promise<boolean> {
    if (this.#closed) return Promise.resolve(true);
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(this.#closed), timeoutMs);
      this.#closeWaiters.push(() => {
        clearTimeout(t);
        resolve(true);
      });
    });
  }

  async close(): Promise<void> {
    if (!this.#sock || this.#closed) return;
    this.#sock.end();
    this.#sock.destroy();
    await this.waitForClose(500);
  }

  private onData(chunk: string): void {
    this.#buffer += chunk;
    let nl: number;
    while ((nl = this.#buffer.indexOf('\n')) >= 0) {
      const line = this.#buffer.slice(0, nl).trim();
      this.#buffer = this.#buffer.slice(nl + 1);
      if (!line) continue;
      let frame: Record<string, unknown>;
      try {
        frame = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      if ('id' in frame && frame.id !== null && frame.id !== undefined) {
        const pending = this.#pending.get(frame.id as number);
        if (pending) {
          this.#pending.delete(frame.id as number);
          if (frame.error && typeof frame.error === 'object') {
            const e = frame.error as { code?: number; message?: string; data?: unknown };
            const err = new Error(e.message ?? 'RPC error') as Error & { code?: number; data?: unknown };
            err.code = e.code;
            err.data = e.data;
            pending.reject(err);
          } else {
            pending.resolve(frame.result);
          }
        }
      } else if (typeof frame.method === 'string') {
        const ev: TestRpcEvent = {
          method: frame.method,
          params: (frame.params as Record<string, unknown>) ?? {},
          raw: frame,
        };
        const waiterIdx = this.#eventWaiters.findIndex((w) => w.pred(ev));
        if (waiterIdx >= 0) {
          const w = this.#eventWaiters.splice(waiterIdx, 1)[0]!;
          clearTimeout(w.timer);
          w.resolve(ev);
        } else {
          this.#events.push(ev);
        }
      }
    }
  }
}

export async function connectTestRpc(
  sessionPath: string,
  clientKind = 'opl_app',
  apiVersion?: string,
): Promise<TestRpcClient> {
  const client = new TestRpcClient(sessionPath);
  await client.connect();
  await client.handshake(clientKind, apiVersion);
  return client;
}

export function writeMinimalV2Package(
  targetDir: string,
  options: {
    readonly id: string;
    readonly version?: string;
    readonly intent?: 'agent' | 'app' | 'extension' | 'channel';
    readonly pluginName?: string;
    readonly extraManifest?: Record<string, unknown>;
  },
): string {
  fs.mkdirSync(targetDir, { recursive: true });
  const intent = options.intent ?? 'agent';
  const version = options.version ?? '0.1.0';
  fs.writeFileSync(path.join(targetDir, 'README.md'), `# ${options.id}\nVersion ${version}\n`, 'utf8');
  if (intent === 'agent') {
    fs.mkdirSync(path.join(targetDir, 'skills', options.id), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'skills', options.id, 'SKILL.md'), `# ${options.id}\n`, 'utf8');
  }
  const manifest = {
    schema_version: 'opl.package.v2',
    identity: {
      id: options.id,
      version,
      intent,
      name: { 'zh-CN': options.id, 'en-US': options.id },
      summary: { 'zh-CN': `${options.id} 摘要`, 'en-US': `${options.id} summary` },
      publisher: 'One Person Lab',
    },
    ...(intent === 'agent'
      ? {
          provides: {
            skills: [{ id: options.id, path: `./skills/${options.id}`, exposure: 'default' }],
          },
          host_hints: {
            codex: {
              sync_enabled: true,
              plugin_name: options.pluginName ?? options.id,
            },
          },
        }
      : {}),
    ...options.extraManifest,
  };
  fs.writeFileSync(path.join(targetDir, 'opl-package.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return targetDir;
}
