import fs from 'node:fs';
import net from 'node:net';

import {
  isRecord,
  resolveStatePaths,
  toErrorMessage,
  type ClientKind,
} from '@opl/core';

import { OpldRpcError } from './opld-bridge.ts';
import type { OpldRpcEvent, OpldRpcTransport } from './types.ts';

export interface OpldSessionMetadata {
  readonly pid: number;
  readonly version: string;
  readonly api_version?: string;
  readonly started_at?: string;
  readonly socket_path: string;
  readonly token: string;
}

export interface ConnectOpldSessionOptions {
  readonly stateDir?: string;
  readonly sessionPath?: string;
  readonly socketPath?: string;
  readonly token?: string;
  readonly clientKind?: ClientKind;
  readonly apiVersion?: string;
  readonly consumerPackageId?: string;
  readonly timeoutMs?: number;
}

export interface OpldHandshakeResult {
  readonly ok: boolean;
  readonly session_id: string;
  readonly api_version: string;
  readonly base_version?: string;
  readonly server_version?: string;
  readonly client_kind: ClientKind;
  readonly trusted_host: boolean;
  readonly reload_capabilities?: Record<string, unknown>;
}

export function readOpldSessionFile(sessionPath: string): OpldSessionMetadata | null {
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
    return {
      pid: raw.pid,
      version: raw.version,
      socket_path: raw.socket_path,
      token: raw.token,
      ...(typeof raw.api_version === 'string' ? { api_version: raw.api_version } : {}),
      ...(typeof raw.started_at === 'string' ? { started_at: raw.started_at } : {}),
    };
  } catch {
    return null;
  }
}

export function probeOpldSocket(socketPath: string, timeoutMs = 300): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32' && !fs.existsSync(socketPath)) {
      resolve(false);
      return;
    }
    const sock = net.createConnection(socketPath);
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs, () => finish(false));
    sock.once('connect', () => finish(true));
    sock.once('error', () => finish(false));
  });
}

interface PendingRpcRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface PendingEventWaiter {
  readonly reject: (reason: Error) => void;
  readonly cleanup: () => void;
}

export class NodeSocketRpcTransport implements OpldRpcTransport {
  readonly #socket: net.Socket;
  readonly #defaultTimeoutMs: number;
  readonly #pending = new Map<number, PendingRpcRequest>();
  readonly #pendingWaiters = new Set<PendingEventWaiter>();
  readonly #eventListeners = new Set<(event: OpldRpcEvent) => void>();
  #buffer = '';
  #nextId = 1;
  #closed = false;
  #sessionId: string | null = null;
  #clientKind: ClientKind | null = null;
  #trustedHost = false;

  constructor(socket: net.Socket, defaultTimeoutMs = 15_000) {
    this.#socket = socket;
    this.#defaultTimeoutMs = defaultTimeoutMs;
    this.#socket.setEncoding('utf8');
    this.#socket.on('data', (chunk: string) => {
      this.#handleData(chunk);
    });
    this.#socket.on('error', (err) => {
      this.#rejectAllPending(
        new OpldRpcError({
          rpcCode: -32000,
          errorCode: 'SOCKET_ERROR',
          message: err.message,
          cause: err,
        }),
      );
    });
    this.#socket.on('close', () => {
      this.#closed = true;
      this.#rejectAllPending(
        new OpldRpcError({
          rpcCode: -32000,
          errorCode: 'SOCKET_CLOSED',
          message: 'OPL daemon socket closed.',
        }),
      );
    });
  }

  getSessionId(): string | null {
    return this.#sessionId;
  }

  getClientKind(): ClientKind | null {
    return this.#clientKind;
  }

  get isTrustedHost(): boolean {
    return this.#trustedHost;
  }

  get isClosed(): boolean {
    return this.#closed;
  }

  onEvent(handler: (event: OpldRpcEvent) => void): () => void {
    this.#eventListeners.add(handler);
    return () => {
      this.#eventListeners.delete(handler);
    };
  }

  waitForEvent(
    method: string,
    options: {
      readonly timeoutMs?: number;
      readonly predicate?: (params: Record<string, unknown>) => boolean;
    } = {},
  ): Promise<OpldRpcEvent> {
    if (this.#closed) {
      return Promise.reject(
        new OpldRpcError({
          rpcCode: -32000,
          errorCode: 'SOCKET_CLOSED',
          message: `Cannot wait for event '${method}': socket is closed.`,
        }),
      );
    }
    const timeoutMs = options.timeoutMs ?? this.#defaultTimeoutMs;
    return new Promise((resolve, reject) => {
      let unsubscribe = () => {};
      const timer = setTimeout(() => {
        this.#pendingWaiters.delete(waiter);
        unsubscribe();
        reject(
          new OpldRpcError({
            rpcCode: -32000,
            errorCode: 'EVENT_TIMEOUT',
            message: `Timed out waiting ${timeoutMs}ms for event '${method}'.`,
          }),
        );
      }, timeoutMs);

      const waiter: PendingEventWaiter = {
        reject,
        cleanup: () => {
          clearTimeout(timer);
          unsubscribe();
        },
      };
      this.#pendingWaiters.add(waiter);

      unsubscribe = this.onEvent((event) => {
        if (event.method !== method) return;
        if (options.predicate && !options.predicate(event.params)) return;
        this.#pendingWaiters.delete(waiter);
        clearTimeout(timer);
        unsubscribe();
        resolve(event);
      });
    });
  }

  async handshake(params: {
    readonly token: string;
    readonly clientKind: ClientKind;
    readonly apiVersion?: string;
    readonly consumerPackageId?: string;
  }): Promise<OpldHandshakeResult> {
    const result = await this.call<OpldHandshakeResult>('daemon.handshake', {
      token: params.token,
      client_kind: params.clientKind,
      api_version: params.apiVersion ?? '2.0',
      ...(params.consumerPackageId
        ? { consumer_package_id: params.consumerPackageId }
        : {}),
    });
    this.#sessionId = result.session_id;
    this.#clientKind = result.client_kind;
    this.#trustedHost = result.trusted_host === true;
    return result;
  }

  call<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = this.#defaultTimeoutMs,
  ): Promise<T> {
    if (this.#closed) {
      return Promise.reject(
        new OpldRpcError({
          rpcCode: -32000,
          errorCode: 'SOCKET_CLOSED',
          message: `Cannot call '${method}': socket is closed.`,
        }),
      );
    }

    const id = this.#nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(
          new OpldRpcError({
            rpcCode: -32000,
            errorCode: 'RPC_TIMEOUT',
            message: `RPC '${method}' timed out after ${timeoutMs}ms.`,
          }),
        );
      }, timeoutMs);

      this.#pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      try {
        const frame = `${JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          params,
        })}\n`;
        this.#socket.write(frame);
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(
          new OpldRpcError({
            rpcCode: -32000,
            errorCode: 'SOCKET_WRITE_ERROR',
            message: toErrorMessage(error),
            cause: error,
          }),
        );
      }
    });
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#rejectAllPending(
      new OpldRpcError({
        rpcCode: -32000,
        errorCode: 'SOCKET_CLOSED',
        message: 'Transport closed by client.',
      }),
    );
    this.#socket.end();
    this.#socket.destroy();
  }

  #handleData(chunk: string): void {
    this.#buffer += chunk;
    let nl: number;
    while ((nl = this.#buffer.indexOf('\n')) >= 0) {
      const line = this.#buffer.slice(0, nl).trim();
      this.#buffer = this.#buffer.slice(nl + 1);
      if (!line) continue;

      let frame: unknown;
      try {
        frame = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isRecord(frame)) continue;

      if (!('id' in frame) || frame.id === undefined || frame.id === null) {
        if (typeof frame.method === 'string') {
          const ev: OpldRpcEvent = {
            method: frame.method,
            params: isRecord(frame.params) ? frame.params : {},
          };
          for (const listener of this.#eventListeners) {
            try {
              listener(ev);
            } catch {
              // Isolate event subscriber errors from socket dispatch.
            }
          }
        }
        continue;
      }

      if (typeof frame.id !== 'number') continue;
      const pending = this.#pending.get(frame.id);
      if (!pending) continue;
      this.#pending.delete(frame.id);
      clearTimeout(pending.timer);

      if (isRecord(frame.error)) {
        pending.reject(
          OpldRpcError.fromJsonRpcError({
            code: frame.error.code,
            message: frame.error.message,
            data: frame.error.data,
          }),
        );
      } else {
        pending.resolve(frame.result);
      }
    }
  }

  #rejectAllPending(error: Error): void {
    for (const [id, pending] of this.#pending.entries()) {
      clearTimeout(pending.timer);
      this.#pending.delete(id);
      pending.reject(error);
    }
    for (const waiter of [...this.#pendingWaiters]) {
      this.#pendingWaiters.delete(waiter);
      waiter.cleanup();
      waiter.reject(error);
    }
  }
}

export async function connectOpldRpcSession(
  options: ConnectOpldSessionOptions = {},
): Promise<{
  readonly transport: NodeSocketRpcTransport;
  readonly handshake: OpldHandshakeResult;
}> {
  let socketPath = options.socketPath;
  let token = options.token;

  if (!socketPath || !token) {
    const sessionFilePath =
      options.sessionPath ?? resolveStatePaths({ stateDir: options.stateDir }).session_file;
    const session = readOpldSessionFile(sessionFilePath);
    if (!session) {
      throw new OpldRpcError({
        rpcCode: -32000,
        errorCode: 'DAEMON_NOT_RUNNING',
        message: `OPL daemon session file not found or invalid at '${sessionFilePath}'.`,
      });
    }
    socketPath = socketPath ?? session.socket_path;
    token = token ?? session.token;
  }

  const timeoutMs = options.timeoutMs ?? 15_000;
  const socket = await new Promise<net.Socket>((resolve, reject) => {
    const sock = net.createConnection(socketPath);
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      sock.destroy();
      reject(
        new OpldRpcError({
          rpcCode: -32000,
          errorCode: 'CONNECT_TIMEOUT',
          message: `Timed out connecting to opld socket '${socketPath}'.`,
        }),
      );
    }, timeoutMs);

    sock.once('connect', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(sock);
    });
    sock.once('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.destroy();
      reject(
        new OpldRpcError({
          rpcCode: -32000,
          errorCode: 'SOCKET_ERROR',
          message: err.message,
          cause: err,
        }),
      );
    });
  });

  const transport = new NodeSocketRpcTransport(socket, timeoutMs);
  try {
    const handshake = await transport.handshake({
      token,
      clientKind: options.clientKind ?? 'external',
      apiVersion: options.apiVersion ?? '2.0',
      consumerPackageId: options.consumerPackageId,
    });
    return { transport, handshake };
  } catch (error) {
    transport.close();
    throw error;
  }
}
