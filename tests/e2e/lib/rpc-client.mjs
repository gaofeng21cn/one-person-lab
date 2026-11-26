import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { StringDecoder } from "node:string_decoder";

export class RpcError extends Error {
  constructor(rpcError) {
    const msg = rpcError?.message || "Unknown JSON-RPC error";
    super(`JSON-RPC Error (${rpcError?.code}): ${msg}`);
    this.name = "RpcError";
    this.code = rpcError?.code;
    this.data = rpcError?.data;
    this.rpcError = rpcError;
  }
}

function matchTopic(method, methodOrPrefix) {
  if (!methodOrPrefix) return true;
  if (typeof methodOrPrefix === "function") return Boolean(methodOrPrefix(method));
  if (methodOrPrefix.endsWith("*")) {
    return method.startsWith(methodOrPrefix.slice(0, -1));
  }
  return method === methodOrPrefix;
}

export class OplRpcClient {
  constructor(options = {}) {
    this.sessionPath =
      options.sessionPath ||
      (process.env.OPL_STATE_DIR ? path.join(process.env.OPL_STATE_DIR, "run", "opld.session.json") : null);

    let session = null;
    if ((!options.sockPath || !options.token) && this.sessionPath && fs.existsSync(this.sessionPath)) {
      session = JSON.parse(fs.readFileSync(this.sessionPath, "utf8"));
    }

    this.sockPath = options.sockPath || session?.socket_path;
    this.token = options.token ?? session?.token ?? "";
    this.clientKind = options.clientKind || "opl_app";
    this.apiVersion = options.apiVersion || "2.0";
    this.autoHandshake = options.autoHandshake !== undefined ? Boolean(options.autoHandshake) : true;
    this.connectTimeoutMs = options.connectTimeoutMs || 5000;
    this.requestTimeoutMs = options.requestTimeoutMs || 10_000;

    this.sock = null;
    this.seq = 1;
    this.buf = "";
    this.decoder = new StringDecoder("utf8");
    this.pending = new Map();
    this.events = [];
    this.eventListeners = new Set();
    this.eventWaiters = [];
    this.closed = false;
    this.closeInfo = null;
    this.closeWaiters = [];
    this.handshakeResult = null;
  }

  async connect() {
    if (!this.sockPath) {
      throw new Error("OplRpcClient requires sockPath or readable opld.session.json");
    }

    this.buf = "";
    this.decoder = new StringDecoder("utf8");
    await new Promise((resolve, reject) => {
      const sock = net.createConnection(this.sockPath);
      this.sock = sock;
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          sock.destroy();
          reject(new Error(`Timed out connecting to opld socket: ${this.sockPath}`));
        }
      }, this.connectTimeoutMs);

      sock.once("connect", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      });

      sock.once("error", (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        } else {
          this.#rejectAllPending(err);
        }
      });

      sock.on("data", (chunk) => this.#onData(chunk));
      sock.on("close", (hadError) => this.#onClose(hadError));
    });

    if (this.autoHandshake) {
      await this.handshake();
    }
    return this;
  }

  async handshake({ token = this.token, clientKind = this.clientKind, apiVersion = this.apiVersion } = {}) {
    const result = await this.call("daemon.handshake", {
      token,
      client_kind: clientKind,
      api_version: apiVersion,
    });
    this.handshakeResult = result;
    return result;
  }

  call(method, params = {}, { timeoutMs = this.requestTimeoutMs } = {}) {
    if (!this.sock || this.closed) {
      const err = new Error(`Cannot call ${method}: socket is closed`);
      err.code = "ERR_SOCKET_CLOSED";
      return Promise.reject(err);
    }

    const id = this.seq++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          const err = new Error(`RPC timeout after ${timeoutMs}ms calling ${method}`);
          err.code = "ETIMEDOUT";
          reject(err);
        }
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      this.sock.write(payload, (writeErr) => {
        if (writeErr && this.pending.has(id)) {
          const entry = this.pending.get(id);
          this.pending.delete(id);
          entry.reject(writeErr);
        }
      });
    });
  }

  sendRaw(payload) {
    if (!this.sock || this.closed) {
      throw new Error("Cannot sendRaw: socket is closed");
    }
    const line = typeof payload === "string" ? payload : JSON.stringify(payload);
    this.sock.write(line.endsWith("\n") ? line : line + "\n");
  }

  drainEvents(methodOrPrefix) {
    if (!methodOrPrefix) {
      const all = [...this.events];
      this.events.length = 0;
      return all;
    }
    const matched = [];
    const remaining = [];
    for (const ev of this.events) {
      if (matchTopic(ev.method, methodOrPrefix)) matched.push(ev);
      else remaining.push(ev);
    }
    this.events = remaining;
    return matched;
  }

  peekEvents(methodOrPrefix) {
    if (!methodOrPrefix) return [...this.events];
    return this.events.filter((ev) => matchTopic(ev.method, methodOrPrefix));
  }

  waitForEvent(matcher, { timeoutMs = 5000, consume = false } = {}) {
    const matches = typeof matcher === "function" ? matcher : (ev) => matchTopic(ev.method, matcher);

    const idx = this.events.findIndex(matches);
    if (idx !== -1) {
      const ev = this.events[idx];
      if (consume) this.events.splice(idx, 1);
      return Promise.resolve(ev);
    }

    return new Promise((resolve, reject) => {
      const waiter = { matches, consume, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const i = this.eventWaiters.indexOf(waiter);
        if (i !== -1) this.eventWaiters.splice(i, 1);
        reject(new Error(`Timed out waiting for event after ${timeoutMs}ms`));
      }, timeoutMs);
      this.eventWaiters.push(waiter);
    });
  }

  onEvent(fn) {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  waitForClose({ timeoutMs = 3000 } = {}) {
    if (this.closed) {
      return Promise.resolve(this.closeInfo || { closed: true, hadError: false });
    }
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const idx = this.closeWaiters.indexOf(waiter);
        if (idx !== -1) this.closeWaiters.splice(idx, 1);
        reject(new Error(`Timed out waiting for socket close after ${timeoutMs}ms`));
      }, timeoutMs);
      this.closeWaiters.push(waiter);
    });
  }

  async close() {
    if (!this.sock) return;
    if (this.closed) return;
    const sock = this.sock;
    const wait = this.waitForClose({ timeoutMs: 500 }).catch(() => {
      sock.destroy();
      return { closed: true, hadError: false };
    });
    sock.end();
    await wait;
  }

  #onData(chunk) {
    this.buf += this.decoder.write(chunk);
    let idx;
    while ((idx = this.buf.indexOf("\n")) !== -1) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }

      if (msg.id !== undefined && msg.id !== null) {
        const handler = this.pending.get(msg.id);
        if (handler) {
          this.pending.delete(msg.id);
          if (msg.error) handler.reject(new RpcError(msg.error));
          else handler.resolve(msg.result);
        }
      } else if (typeof msg.method === "string") {
        const ev = {
          method: msg.method,
          params: msg.params ?? {},
          receivedAtMs: performance.now(),
          raw: msg,
        };
        let consumed = false;
        for (let i = 0; i < this.eventWaiters.length; i++) {
          const w = this.eventWaiters[i];
          if (w.matches(ev)) {
            clearTimeout(w.timer);
            this.eventWaiters.splice(i, 1);
            i--;
            if (w.consume) consumed = true;
            w.resolve(ev);
          }
        }
        if (!consumed) {
          this.events.push(ev);
        }
        for (const listener of this.eventListeners) {
          try {
            listener(ev);
          } catch {
            // ignore listener error
          }
        }
      }
    }
  }

  #rejectAllPending(cause) {
    const err = cause instanceof Error ? cause : new Error("Socket closed");
    if (!err.code) err.code = "ERR_SOCKET_CLOSED";
    for (const [, handler] of this.pending.entries()) {
      handler.reject(err);
    }
    this.pending.clear();
  }

  #onClose(hadError) {
    this.buf += this.decoder.end();
    this.closed = true;
    this.closeInfo = { closed: true, hadError: Boolean(hadError) };
    const closeErr = new Error("Socket closed while RPC request was pending");
    closeErr.code = "ERR_SOCKET_CLOSED";
    this.#rejectAllPending(closeErr);

    for (const w of this.eventWaiters.splice(0)) {
      clearTimeout(w.timer);
      w.reject(closeErr);
    }
    for (const w of this.closeWaiters.splice(0)) {
      clearTimeout(w.timer);
      w.resolve(this.closeInfo);
    }
  }
}

export async function connectRpcClient(options = {}) {
  const client = new OplRpcClient(options);
  await client.connect();
  return client;
}

export async function assertRpcError(promiseOrFn, expectedCode, expectedPattern) {
  let caught = null;
  try {
    const p = typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn;
    await p;
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, `Expected RPC error with code ${expectedCode}, but call succeeded`);
  assert.ok(caught instanceof RpcError, `Expected RpcError, got ${caught?.constructor?.name}: ${caught?.message}`);
  assert.equal(caught.code, expectedCode, `Expected RPC error code ${expectedCode}, got ${caught.code} (${caught.message})`);
  if (expectedPattern) {
    const haystack = `${caught.message} ${JSON.stringify(caught.data ?? "")}`;
    if (expectedPattern instanceof RegExp) {
      assert.match(haystack, expectedPattern);
    } else {
      assert.ok(haystack.includes(String(expectedPattern)), `Expected error matching "${expectedPattern}", got "${haystack}"`);
    }
  }
  return caught;
}
