import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { OplRpcClient, RpcError, assertRpcError, connectRpcClient } from "../lib/rpc-client.mjs";
import { createSandbox, isPidAlive } from "../lib/sandbox.mjs";

const activeSandboxes = [];
const activeRpcClients = [];

function trackSandbox(opts = {}) {
  const sb = createSandbox(opts);
  activeSandboxes.push(sb);
  return sb;
}

function trackRpc(client) {
  activeRpcClients.push(client);
  return client;
}

afterEach(async () => {
  while (activeRpcClients.length > 0) {
    const c = activeRpcClients.pop();
    try {
      await c.close?.();
    } catch {
      // ignore close errors during teardown
    }
  }
  while (activeSandboxes.length > 0) {
    const sb = activeSandboxes.pop();
    await sb.cleanup();
  }
});

describe("Tier 2 — F6 Negative & Boundary: opld Daemon IPC & Auth", () => {
  it("T2-F6-01: daemon.handshake with wrong 256-bit token returns -32001 UNAUTHORIZED and destroys socket", async () => {
    const sb = trackSandbox();
    const d1 = await sb.startDaemon();
    const badToken = d1.session.token === "f".repeat(64) ? "0".repeat(64) : "f".repeat(64);

    const client = trackRpc(
      new OplRpcClient({ sessionPath: sb.sessionPath, token: badToken, autoHandshake: false })
    );
    await client.connect();

    await assertRpcError(() => client.handshake(), -32001, /UNAUTHORIZED/i);
    const closeInfo = await client.waitForClose({ timeoutMs: 2000 });
    assert.equal(closeInfo.closed, true, "Expected opld to immediately close socket after bad handshake token");
  });

  it("T2-F6-02: sending app.state.get or daemon.health before daemon.handshake returns -32001 HANDSHAKE_REQUIRED", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const clientA = trackRpc(new OplRpcClient({ sessionPath: sb.sessionPath, autoHandshake: false }));
    await clientA.connect();
    await assertRpcError(() => clientA.call("app.state.get", { profile: "fast" }), -32001, /HANDSHAKE_REQUIRED/i);

    const clientB = trackRpc(new OplRpcClient({ sessionPath: sb.sessionPath, autoHandshake: false }));
    await clientB.connect();
    await assertRpcError(() => clientB.call("daemon.health", {}), -32001, /HANDSHAKE_REQUIRED/i);
  });

  it("T2-F6-03: handshake with incompatible major api_version returns structured base_upgrade_required error", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    for (const incompatibleVersion of ["1.0", "99.0"]) {
      const client = trackRpc(new OplRpcClient({ sessionPath: sb.sessionPath, autoHandshake: false }));
      await client.connect();

      let caught = null;
      try {
        await client.handshake({ clientKind: "opl_app", apiVersion: incompatibleVersion });
      } catch (err) {
        caught = err;
      }
      assert.ok(caught, `Expected handshake failure for api_version=${incompatibleVersion}`);
      assert.ok(caught instanceof RpcError, `Expected RpcError, got ${caught?.constructor?.name}: ${caught?.message}`);
      const haystack = `${caught.message} ${JSON.stringify(caught.data ?? "")}`;
      assert.match(
        haystack,
        /base_upgrade_required/i,
        `Expected structured base_upgrade_required for api_version=${incompatibleVersion}, got: ${haystack}`
      );
    }
  });

  it("T2-F6-04: calling unknown RPC method returns -32601 METHOD_NOT_FOUND and malformed NDJSON returns -32700 without crashing opld", async () => {
    const sb = trackSandbox();
    const d1 = await sb.startDaemon();

    const client = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    await assertRpcError(() => client.call("foo.bar", {}), -32601, /METHOD_NOT_FOUND/i);

    let rawChunk = "";
    const onRawData = (chunk) => {
      rawChunk += chunk.toString("utf8");
    };
    client.sock.on("data", onRawData);
    try {
      client.sendRaw("{bad-json\n");
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline && !rawChunk.includes("-32700")) {
        await new Promise((r) => setTimeout(r, 20));
      }
    } finally {
      client.sock.off("data", onRawData);
    }

    assert.match(rawChunk, /-32700/, `Expected JSON-RPC parse error -32700 on malformed NDJSON, got: ${rawChunk}`);
    assert.equal(isPidAlive(d1.pid), true, "opld must remain alive after malformed NDJSON frame");

    const healthClient = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const health = await healthClient.call("daemon.health", {});
    assert.ok(health && (health.ok === true || health.status === "ok" || health.status === "healthy"));
  });

  it("T2-F6-05: non-trusted client_kind ('external' and 'sdk_python') calling privileged methods returns -32003 TRUSTED_HOST_REQUIRED", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const privilegedCalls = [
      ["connect.approveRequest", { request_id: "req-probe" }],
      ["pack.install", { source: "/tmp/nonexistent-pack.tgz" }],
      ["pack.update", { package_id: "nonexistent-pack" }],
      ["pack.updateAll", {}],
      ["pack.uninstall", { package_id: "nonexistent-pack" }],
      ["runway.humanGate.resolve", { stage_run_id: "sr-probe", decision: "approve" }],
    ];

    for (const clientKind of ["external", "sdk_python"]) {
      const client = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind }));
      for (const [method, params] of privilegedCalls) {
        await assertRpcError(
          () => client.call(method, params),
          -32003,
          /TRUSTED_HOST_REQUIRED/i
        );
      }
    }
  });
});
