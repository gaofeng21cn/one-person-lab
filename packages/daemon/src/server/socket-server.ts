import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {
  createClientContext,
  isRecord,
  newId,
  newRandomToken,
  parseClientKind,
  timingSafeEqualHex,
  writeExclusiveFileSync,
  type ClientContext,
} from '@opl/core';
import { resolveCodexHome, withClientCodexHome } from '@opl/connect';
import { DaemonRpcError, toJsonRpcError } from '../errors.ts';
import type { DaemonRuntime } from '../state/runtime.ts';
import { normalizeParams, pickString, pickStringArray } from '../utils/normalize.ts';

export interface SocketConnectionState {
  readonly connectionId: string;
  readonly socket: net.Socket;
  authed: boolean;
  codexHome?: string;
  clientContext: ClientContext | null;
  subscribedTopics: Set<string> | null; // null => subscribed to all event.* after auth
}

export type RpcHandler = (
  params: Record<string, unknown>,
  conn: SocketConnectionState,
) => Promise<unknown> | unknown;

export interface DaemonSessionFilePayload {
  readonly pid: number;
  readonly version: string;
  readonly api_version: string;
  readonly started_at: string;
  readonly socket_path: string;
  readonly token: string;
}

const IGNORED_SOCKET_ERROR_CODES = new Set(['EPIPE', 'ECONNRESET', 'ERR_STREAM_DESTROYED', 'ENOTCONN']);

export class OpldSocketServer {
  readonly #runtime: DaemonRuntime;
  readonly #handlers: Map<string, RpcHandler>;
  readonly #token: string;
  readonly #server: net.Server;
  readonly #connections = new Set<SocketConnectionState>();
  readonly #onRequestShutdown: () => Promise<void>;
  #shuttingDown = false;

  constructor(options: {
    readonly runtime: DaemonRuntime;
    readonly handlers: Map<string, RpcHandler>;
    readonly onRequestShutdown: () => Promise<void>;
  }) {
    this.#runtime = options.runtime;
    this.#handlers = options.handlers;
    this.#onRequestShutdown = options.onRequestShutdown;
    this.#token = newRandomToken(32);
    this.#server = net.createServer((socket) => this.handleConnection(socket));
  }

  get token(): string {
    return this.#token;
  }

  async listen(): Promise<DaemonSessionFilePayload> {
    const socketPath = this.#runtime.paths.socket_path;
    if (process.platform !== 'win32') {
      fs.mkdirSync(path.dirname(socketPath), { recursive: true, mode: 0o700 });
      try {
        fs.rmSync(socketPath, { force: true });
      } catch {
        // ignore stale socket unlink failure
      }
    }

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        this.#server.off('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        this.#server.off('error', onError);
        resolve();
      };
      this.#server.once('error', onError);
      this.#server.once('listening', onListening);
      this.#server.listen(socketPath);
    });

    if (process.platform !== 'win32') {
      fs.chmodSync(socketPath, 0o600);
    }

    const sessionPayload: DaemonSessionFilePayload = {
      pid: process.pid,
      version: this.#runtime.version,
      api_version: '2.0',
      started_at: this.#runtime.startedAt,
      socket_path: socketPath,
      token: this.#token,
    };

    const sessionFile = this.#runtime.paths.session_file;
    try {
      fs.rmSync(sessionFile, { force: true });
    } catch {
      // ignore
    }
    writeExclusiveFileSync(sessionFile, `${JSON.stringify(sessionPayload, null, 2)}\n`, 0o600);
    if (process.platform !== 'win32') {
      fs.chmodSync(sessionFile, 0o600);
    }

    return sessionPayload;
  }

  broadcast(method: string, params: Record<string, unknown>): void {
    if (this.#shuttingDown) return;
    const frame = `${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`;
    for (const conn of [...this.#connections]) {
      if (!conn.authed) continue;
      if (conn.subscribedTopics && !conn.subscribedTopics.has(method) && !conn.subscribedTopics.has('*')) {
        continue;
      }
      if (!conn.socket.writable || conn.socket.destroyed) {
        this.#connections.delete(conn);
        continue;
      }
      try {
        conn.socket.write(frame, (err) => {
          if (err) {
            this.#connections.delete(conn);
          }
        });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException | null)?.code;
        if (code && IGNORED_SOCKET_ERROR_CODES.has(code)) {
          this.#connections.delete(conn);
          continue;
        }
        this.#connections.delete(conn);
      }
    }
  }

  async close(): Promise<void> {
    if (this.#shuttingDown) return;
    this.#shuttingDown = true;

    for (const conn of [...this.#connections]) {
      try {
        conn.socket.end();
        conn.socket.destroy();
      } catch {
        // ignore
      }
      this.#connections.delete(conn);
    }

    await new Promise<void>((resolve) => {
      try {
        this.#server.close(() => resolve());
      } catch {
        resolve();
      }
    });
  }

  private writeFrame(socket: net.Socket, payload: unknown): Promise<void> {
    return new Promise((resolve) => {
      if (!socket.writable || socket.destroyed) {
        resolve();
        return;
      }
      try {
        socket.write(`${JSON.stringify(payload)}\n`, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  private handleConnection(socket: net.Socket): void {
    const conn: SocketConnectionState = {
      connectionId: newId('conn'),
      socket,
      authed: false,
      clientContext: null,
      subscribedTopics: null,
    };
    this.#connections.add(conn);

    socket.setEncoding('utf8');
    socket.on('error', (err) => {
      const code = (err as NodeJS.ErrnoException | null)?.code;
      if (!code || !IGNORED_SOCKET_ERROR_CODES.has(code)) {
        // Swallow socket errors safely so daemon never crashes on client disconnect
      }
      this.#connections.delete(conn);
    });
    socket.on('close', () => {
      this.#connections.delete(conn);
    });

    const MAX_NDJSON_LINE_BYTES = 4 * 1024 * 1024;
    let buffer = '';
    let overflowed = false;
    socket.on('data', (chunk: string) => {
      if (overflowed) return;
      buffer += chunk;
      let nlIdx: number;
      while ((nlIdx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nlIdx).trim();
        buffer = buffer.slice(nlIdx + 1);
        if (Buffer.byteLength(line, 'utf8') > MAX_NDJSON_LINE_BYTES) {
          overflowed = true;
          buffer = '';
          void this.writeFrame(conn.socket, {
            jsonrpc: '2.0',
            id: null,
            error: { code: -32600, message: 'Invalid Request: NDJSON frame exceeds 4 MiB limit' },
          }).finally(() => {
            conn.socket.end();
            setTimeout(() => conn.socket.destroy(), 50).unref?.();
          });
          return;
        }
        if (!line) continue;
        void this.processLine(line, conn);
      }
      if (Buffer.byteLength(buffer, 'utf8') > MAX_NDJSON_LINE_BYTES) {
        overflowed = true;
        buffer = '';
        void this.writeFrame(conn.socket, {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'Invalid Request: NDJSON frame exceeds 4 MiB limit' },
        }).finally(() => {
          conn.socket.end();
          setTimeout(() => conn.socket.destroy(), 50).unref?.();
        });
      }
    });
  }

  private async processLine(line: string, conn: SocketConnectionState): Promise<void> {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      await this.writeFrame(conn.socket, {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      });
      return;
    }

    if (!isRecord(raw) || typeof raw.method !== 'string') {
      const id = isRecord(raw) && (typeof raw.id === 'string' || typeof raw.id === 'number') ? raw.id : null;
      await this.writeFrame(conn.socket, {
        jsonrpc: '2.0',
        id,
        error: { code: -32600, message: 'Invalid Request' },
      });
      return;
    }

    const id = typeof raw.id === 'string' || typeof raw.id === 'number' ? raw.id : null;
    const method = raw.method;

    try {
      const params = normalizeParams(raw.params);

      if (method === 'daemon.handshake') {
        const result = this.handleHandshake(params, conn);
        if (id !== null) {
          await this.writeFrame(conn.socket, { jsonrpc: '2.0', id, result });
        }
        return;
      }

      if (!conn.authed || !conn.clientContext) {
        throw new DaemonRpcError(
          -32001,
          'HANDSHAKE_REQUIRED',
          'Connection must complete daemon.handshake before invoking RPC methods.',
        );
      }

      if (method === 'daemon.events.subscribe') {
        const topics = pickStringArray(params, 'topics');
        conn.subscribedTopics = topics && topics.length > 0 ? new Set(topics) : null;
        if (id !== null) {
          await this.writeFrame(conn.socket, {
            jsonrpc: '2.0',
            id,
            result: {
              ok: true,
              subscribed: conn.subscribedTopics ? [...conn.subscribedTopics] : ['event.*'],
            },
          });
        }
        return;
      }

      const handler = this.#handlers.get(method);
      if (!handler) {
        throw new DaemonRpcError(-32601, 'METHOD_NOT_FOUND', `Method not found: ${method}`);
      }

      const result = await (conn.codexHome
        ? withClientCodexHome(conn.codexHome, () => handler(params, conn))
        : handler(params, conn));
      if (id !== null) {
        await this.writeFrame(conn.socket, { jsonrpc: '2.0', id, result });
      }

      if (method === 'daemon.shutdown') {
        setImmediate(() => {
          void this.#onRequestShutdown();
        });
      }
    } catch (error) {
      const rpcErr = toJsonRpcError(error);
      if (id !== null) {
        await this.writeFrame(conn.socket, {
          jsonrpc: '2.0',
          id,
          error: rpcErr,
        });
      }
      if (method === 'daemon.handshake' && rpcErr.code === -32001) {
        try {
          conn.socket.end();
          conn.socket.destroy();
        } catch {
          // ignore
        }
      }
    }
  }

  private handleHandshake(
    params: Record<string, unknown>,
    conn: SocketConnectionState,
  ): Record<string, unknown> {
    const token = pickString(params, 'token');
    if (!token || !timingSafeEqualHex(token, this.#token)) {
      throw new DaemonRpcError(-32001, 'UNAUTHORIZED', 'Invalid daemon handshake token.');
    }

    const apiVersion = pickString(params, 'api_version', 'apiVersion') ?? '2.0';
    const majorPart = apiVersion.split('.')[0] ?? '';
    if (majorPart !== '2') {
      throw new DaemonRpcError(
        -32002,
        'base_upgrade_required',
        `Incompatible api_version '${apiVersion}'; base_upgrade_required (major 2 required).`,
        {
          code: 'base_upgrade_required',
          expected_major: 2,
          received_api_version: apiVersion,
        },
      );
    }

    const clientKind = parseClientKind(pickString(params, 'client_kind', 'clientKind'));
    const sessionId = newId('sess');
    const consumerPackageId = pickString(params, 'consumer_package_id', 'consumerPackageId');
    const ctx = createClientContext({
      session_id: sessionId,
      client_kind: clientKind,
      ...(consumerPackageId ? { consumer_package_id: consumerPackageId } : {}),
    });

    const requestedHome = params.codex_home;
    if (requestedHome !== undefined) {
      if (!ctx.trusted_host) throw new DaemonRpcError(-32003, 'TRUSTED_HOST_REQUIRED', 'Only a trusted host can select its Codex home.');
      if (typeof requestedHome !== 'string' || !path.isAbsolute(requestedHome) || requestedHome.includes('\0')) {
        throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'codex_home must be an absolute path.');
      }
    }
    conn.codexHome = ctx.trusted_host ? (requestedHome ? path.resolve(requestedHome) : resolveCodexHome()) : undefined;
    conn.authed = true;
    conn.clientContext = ctx;

    return {
      ok: true,
      session_id: ctx.session_id,
      api_version: '2.0',
      base_version: this.#runtime.version,
      server_version: this.#runtime.version,
      client_kind: ctx.client_kind,
      trusted_host: ctx.trusted_host,
      ...(conn.codexHome && { codex_home: conn.codexHome }),
      reload_capabilities: {
        renderer_reload: true,
        restart_required: true,
        server_push: true,
      },
    };
  }
}
