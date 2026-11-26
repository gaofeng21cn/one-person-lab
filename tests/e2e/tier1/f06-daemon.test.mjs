import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCliJson, runCliOk } from "../lib/cli.mjs";
import { buildV2Package, createLocalPackageArchive } from "../lib/fixtures.mjs";
import { OplRpcClient, connectRpcClient } from "../lib/rpc-client.mjs";
import {
  assertMode600,
  createSandbox,
  isPidAlive,
  measureLatencyMs,
} from "../lib/sandbox.mjs";
import {
  getLedgerEntries,
  getPackageOperations,
  getWorkspace,
  openOplDb,
} from "../lib/sqlite-inspector.mjs";

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

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

describe("Tier 1 — F6: opld Daemon IPC, 0600 Socket, Auth & Server-Push", () => {
  it("T1-F6-01: opl daemon start --detached creates opld.lock, 0600 opld.sock, and 0600 opld.session.json with 256-bit token", async () => {
    const sb = trackSandbox();
    const started = await sb.startDaemon();

    assert.equal(fs.existsSync(sb.lockPath), true, "Expected opld.lock");
    assert.equal(fs.existsSync(sb.sockPath), true, "Expected opld.sock");
    assert.equal(fs.existsSync(sb.sessionPath), true, "Expected opld.session.json");

    assertMode600(sb.sockPath);
    assertMode600(sb.sessionPath);

    assert.equal(started.session.pid, started.pid);
    assert.ok(typeof started.session.version === "string" && started.session.version.length > 0);
    assert.ok(typeof started.session.started_at === "string" && started.session.started_at.length > 0);
    assert.equal(fs.realpathSync(started.session.socket_path), fs.realpathSync(sb.sockPath));
    assert.match(started.session.token, /^[0-9a-f]{64}$/i, "Expected 256-bit (64-hex) session token");
  });

  it("T1-F6-02: daemon.handshake with valid token + api_version succeeds and normalizes snake_case/camelCase params", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const client = trackRpc(new OplRpcClient({ sessionPath: sb.sessionPath, autoHandshake: false }));
    await client.connect();
    const hs = await client.handshake({ clientKind: "opl_app", apiVersion: "2.0" });

    assert.ok(typeof hs.session_id === "string" && hs.session_id.length > 0, `Expected session_id: ${JSON.stringify(hs)}`);
    assert.match(String(hs.api_version), /^2\./);
    assert.ok(typeof (hs.server_version ?? hs.base_version) === "string");
    assert.ok(hs.reload_capabilities !== undefined);

    const health = await client.call("daemon.health", {});
    assert.ok(health && (health.ok === true || health.status === "ok" || health.status === "healthy"));

    const pkgDir = path.join(sb.root, "norm-app");
    buildV2Package(pkgDir, { id: "norm-app", intent: "app", specStrict: true });
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });

    const contribSnake = await client.call("app.contribution.read", {
      package_id: "norm-app",
      data_ref: "status",
      input: {},
    });
    const contribCamel = await client.call("app.contribution.read", {
      packageId: "norm-app",
      dataRef: "status",
      input: {},
    });
    assert.ok(contribSnake && typeof contribSnake === "object");
    assert.ok(contribCamel && typeof contribCamel === "object");
  });

  it("T1-F6-03: 100 consecutive app.state.get({ profile: 'fast' }) RPC calls achieve P99 latency < 20ms", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const agentPkg = buildV2Package(path.join(sb.root, "fast-mas"), {
      id: "fast-mas",
      intent: "agent",
      specStrict: true,
    });
    const appPkg = buildV2Package(path.join(sb.root, "fast-relay"), {
      id: "fast-relay",
      intent: "app",
      specStrict: true,
    });
    await runCliOk(["pack", "link", agentPkg.dir], { sandbox: sb });
    await runCliOk(["pack", "link", appPkg.dir], { sandbox: sb });

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const stats = await measureLatencyMs(() => rpc.call("app.state.get", { profile: "fast" }), {
      iterations: 100,
      warmup: 5,
    });
    const sample = await rpc.call("app.state.get", { profile: "fast" });

    assert.ok(
      stats.p99 < 20,
      `Expected app.state.get('fast') P99 < 20ms, got P99=${stats.p99.toFixed(3)}ms (P50=${stats.p50.toFixed(3)}ms, max=${stats.max.toFixed(3)}ms)`
    );
    const serialized = JSON.stringify(sample);
    assert.ok(serialized.includes("fast-mas") && serialized.includes("fast-relay"));
  });

  it("T1-F6-04: pack.updateAll streams event.pack.progress notifications with reload_mode before final RPC result", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const srcV1 = path.join(sb.root, "upd-v1");
    const srcV2 = path.join(sb.root, "upd-v2");
    const outArch = path.join(sb.root, "archives");
    buildV2Package(srcV1, { id: "upd-stream-pkg", version: "0.1.0", intent: "app", specStrict: true });
    buildV2Package(srcV2, { id: "upd-stream-pkg", version: "0.2.0", intent: "app", specStrict: true });
    await runCliJson(["pack", "build", srcV1], { sandbox: sb });
    await runCliJson(["pack", "build", srcV2], { sandbox: sb });
    const archV1 = createLocalPackageArchive(srcV1, outArch, { includeLockFile: true });
    const archV2 = createLocalPackageArchive(srcV2, outArch, { includeLockFile: true });
    await runCliOk(["pack", "install", archV1.archivePath], { sandbox: sb });

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    rpc.drainEvents();

    const updateRes = await rpc.call("pack.updateAll", {
      updates: [{ package_id: "upd-stream-pkg", source: archV2.archivePath }],
      sources: { "upd-stream-pkg": archV2.archivePath },
    });
    assert.ok(updateRes && typeof updateRes === "object");

    const events = rpc.drainEvents("event.pack.progress");
    assert.ok(events.length >= 1, `Expected >= 1 event.pack.progress notification, got ${events.length}`);
    for (const ev of events) {
      assert.equal(ev.raw.id, undefined, "Server-Push event.pack.progress must omit JSON-RPC id");
      assert.equal(ev.method, "event.pack.progress");
    }

    const withReload = events.find(
      (ev) =>
        (ev.params?.package_id ?? ev.params?.packageId) === "upd-stream-pkg" &&
        ["none", "renderer_reload", "restart_required"].includes(ev.params?.reload_mode)
    );
    assert.ok(
      withReload,
      `Expected event.pack.progress with reload_mode for upd-stream-pkg, got: ${JSON.stringify(events)}`
    );

    const db = openOplDb(sb.dbPath, { readOnly: true });
    try {
      const ops = getPackageOperations(db, "upd-stream-pkg");
      assert.ok(
        ops.some((op) => op.reload_mode === withReload.params.reload_mode),
        `Expected package_operations.reload_mode=${withReload.params.reload_mode} in SQLite: ${JSON.stringify(ops)}`
      );
    } finally {
      db.close();
    }
  });

  it("T1-F6-05: opl daemon stop and daemon.shutdown flush SQLite WAL checkpoint and remove socket/lock without killing detached child processes", async () => {
    const sb = trackSandbox();
    const d1 = await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "wal-flush-ws"], { sandbox: sb });
    const workspaceId = wsInit.workspace_id ?? wsInit.workspaceId ?? wsInit.workspace?.workspace_id ?? wsInit.id;

    const rpc1 = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const createdTask = await rpc1.call("runway.task.create", {
      workspace_id: workspaceId,
      agent_id: "mas",
      title: "WAL Checkpoint Task",
      goal_prompt: "Persist across clean shutdown",
    });
    const taskId = createdTask.task_id ?? createdTask.taskId ?? createdTask.task?.task_id;
    await rpc1.call("ledger.append", {
      task_id: taskId,
      entry_kind: "artifact_ref",
      owner_id: "mas",
      payload: { path: "notes/checkpoint.md", sha256: "abc123" },
    });
    await rpc1.close();

    const detachedCodex = sb.spawnTracked(
      path.join(sb.stubsBinDir, "codex"),
      ["exec", "--json", "--cd", sb.workspaceDir, "long-running"],
      {
        detached: true,
        kind: "detached-executor",
        env: { OPL_STUB_CODEX_MODE: "hang" },
      }
    );
    await sleepMs(150);
    assert.equal(isPidAlive(detachedCodex.pid), true, "Detached codex stub must be alive before daemon stop");

    await runCliOk(["daemon", "stop"], { sandbox: sb });
    const stopDeadline = Date.now() + 2500;
    while (
      Date.now() < stopDeadline &&
      (fs.existsSync(sb.sockPath) || fs.existsSync(sb.lockPath) || isPidAlive(d1.pid))
    ) {
      await sleepMs(25);
    }
    assert.equal(fs.existsSync(sb.sockPath), false, "opl daemon stop must remove opld.sock");
    assert.equal(fs.existsSync(sb.lockPath), false, "opl daemon stop must remove opld.lock");
    assert.equal(isPidAlive(d1.pid), false, "opld PID must exit after opl daemon stop");
    assert.equal(isPidAlive(detachedCodex.pid), true, "opl daemon stop must NOT kill detached executor child");

    const db = openOplDb(sb.dbPath, { readOnly: true });
    try {
      assert.ok(getWorkspace(db, workspaceId), "Committed workspace must survive WAL checkpoint on stop");
      const entries = getLedgerEntries(db, taskId, "artifact_ref");
      assert.equal(entries.length, 1, "Committed ledger entry must survive WAL checkpoint on stop");
    } finally {
      db.close();
    }

    const d2 = await sb.startDaemon();
    const rpc2 = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    await rpc2.call("daemon.shutdown", {});
    await rpc2.waitForClose({ timeoutMs: 2500 }).catch(() => {});

    const shutDeadline = Date.now() + 2500;
    while (
      Date.now() < shutDeadline &&
      (fs.existsSync(sb.sockPath) || fs.existsSync(sb.lockPath) || isPidAlive(d2.pid))
    ) {
      await sleepMs(25);
    }
    assert.equal(fs.existsSync(sb.sockPath), false, "daemon.shutdown must remove opld.sock");
    assert.equal(fs.existsSync(sb.lockPath), false, "daemon.shutdown must remove opld.lock");
    assert.equal(isPidAlive(d2.pid), false, "opld PID must exit after daemon.shutdown");
    assert.equal(isPidAlive(detachedCodex.pid), true, "daemon.shutdown must NOT kill detached executor child");
  });
});
