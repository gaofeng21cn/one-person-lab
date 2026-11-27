import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { pathToFileURL } from "node:url";

import { runCliJson, runCliOk } from "../lib/cli.mjs";
import { buildV2Package, createLocalPackageArchive } from "../lib/fixtures.mjs";
import { connectRpcClient } from "../lib/rpc-client.mjs";
import {
  createSandbox,
  measureLatencyMs,
  resolveBridgeDir,
  resolveStudioRoot,
} from "../lib/sandbox.mjs";
import { getGrants, openOplDb } from "../lib/sqlite-inspector.mjs";

const STUDIO_ROOT = resolveStudioRoot();
const BRIDGE_DIR = resolveBridgeDir(STUDIO_ROOT);

const activeSandboxes = [];
const activeBridges = [];
const activeRpcClients = [];

function makeSandbox(opts = {}) {
  const sb = createSandbox(opts);
  activeSandboxes.push(sb);
  return sb;
}

function trackBridge(bridge) {
  activeBridges.push(bridge);
  return bridge;
}

function trackRpc(client) {
  activeRpcClients.push(client);
  return client;
}

async function loadBridgeModule() {
  const builtEntry = path.join(BRIDGE_DIR, "lib/index.mjs");
  const srcEntry = path.join(BRIDGE_DIR, "src/index.mjs");
  const entry = fs.existsSync(builtEntry) ? builtEntry : srcEntry;
  assert.ok(fs.existsSync(entry), `OplFrameworkBridge entrypoint not found: ${entry}`);
  return import(pathToFileURL(entry).href);
}

function createCanaryOplBin(sb) {
  const canaryDir = path.join(sb.root, "canary-bin");
  fs.mkdirSync(canaryDir, { recursive: true });
  const canaryBin = path.join(canaryDir, "opl");
  const hitMarkerPath = path.join(sb.root, "canary-opl-hit.log");
  fs.writeFileSync(
    canaryBin,
    `#!/usr/bin/env node\nconst fs = require("node:fs");\nfs.appendFileSync(${JSON.stringify(hitMarkerPath)}, JSON.stringify(process.argv.slice(2)) + "\\n");\nprocess.exit(99);\n`,
    { encoding: "utf8", mode: 0o755 }
  );
  fs.chmodSync(canaryBin, 0o755);
  return {
    canaryBin,
    hitMarkerPath,
    spyEnv: {
      ...sb.env,
      OPL_APP_OPL_BIN: canaryBin,
      OPL_COMMAND: canaryBin,
      PATH: `${canaryDir}${path.delimiter}${sb.env.PATH}`,
    },
  };
}

function countSpawnLogLines() {
  const logPath = process.env.OPL_E2E_SPAWN_LOG;
  if (!logPath || !fs.existsSync(logPath)) return 0;
  let count = 0;
  for (const line of fs.readFileSync(logPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        // Only attribute spawns originating from this process (the bridge host), not opld's own contribution_handler subprocesses
        if (Number.isInteger(parsed?.ppid) && parsed.ppid !== process.pid) continue;
      } catch {
        // count unparseable lines conservatively
      }
    }
    count += 1;
  }
  return count;
}

afterEach(async () => {
  while (activeBridges.length > 0) {
    const b = activeBridges.pop();
    try {
      await b.close?.();
    } catch {
      // ignore close errors during teardown
    }
  }
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

describe("Tier 1 F8: opl-framework-bridge Thin opld Client", () => {
  it("T1-F8-01: OplFrameworkBridge.start() connects to real opld via opld.session.json (opl_app) & supports Cordis apply(ctx)", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const mod = await loadBridgeModule();
    assert.equal(mod.name, "opl-framework-bridge");
    assert.ok(Array.isArray(mod.inject));
    assert.equal(typeof mod.apply, "function");
    assert.equal(typeof mod.OplFrameworkBridge, "function");

    const bridge = trackBridge(new mod.OplFrameworkBridge({ workspaceRoot: sb.workspaceDir, env: sb.env }));
    const caps = await bridge.start();
    assert.equal(caps.available, true);
    assert.equal(caps.authorityBoundary, "app_bridge_no_domain_authority");
    assert.equal(bridge.capabilities().available, true);
    await bridge.close();

    const provided = new Map();
    const disposers = [];
    mod.apply({
      oplStudioHostOptions: { workspaceRoot: sb.workspaceDir, env: sb.env },
      oplCodexNative: null,
      provide(key, val) {
        provided.set(key, val);
      },
      effect(fn) {
        disposers.push(fn);
      },
    });
    assert.equal(provided.has("oplFrameworkBridge"), true, "apply(ctx) must provide oplFrameworkBridge");
    const svc = trackBridge(provided.get("oplFrameworkBridge"));
    const svcCaps = await svc.start();
    assert.equal(svcCaps.available, true);

    for (const d of disposers) {
      const cleanup = d();
      if (typeof cleanup === "function") await cleanup();
    }
  });

  it("T1-F8-02: bridge.opl.readState('fast') executes over socket in P99 < 20ms with zero spawn('opl')", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const pkgDir = path.join(sb.root, "fast-probe");
    buildV2Package(pkgDir, { id: "fast-probe", intent: "app", specStrict: true });
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });

    const { hitMarkerPath, spyEnv } = createCanaryOplBin(sb);
    const mod = await loadBridgeModule();
    const bridge = trackBridge(new mod.OplFrameworkBridge({ workspaceRoot: sb.workspaceDir, env: spyEnv }));
    await bridge.start();

    const spawnsBefore = countSpawnLogLines();
    const stats = await measureLatencyMs(() => bridge.opl.readState("fast"), { iterations: 100, warmup: 5 });
    const sample = await bridge.opl.readState("fast");
    const spawnsAfter = countSpawnLogLines();

    assert.ok(stats.p99 < 20, `Expected readState('fast') P99 < 20ms, got P99=${stats.p99.toFixed(3)}ms (P50=${stats.p50.toFixed(3)}ms)`);
    assert.equal(spawnsAfter - spawnsBefore, 0, "Expected zero child spawns during readState('fast')");
    assert.equal(fs.existsSync(hitMarkerPath), false, "Canary opl binary must never be executed by readState('fast')");
    assert.equal(sample.profile, "fast");
    assert.ok(sample.app_state && typeof sample.app_state === "object", "Expected valid app_state payload");
  });

  it("T1-F8-03: readInitialize, readFullDrilldown, readContribution, executeAction & readDomainDetailView route via real opld RPC", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const pkgDir = path.join(sb.root, "opl-relay");
    buildV2Package(pkgDir, { id: "opl-relay", intent: "app", specStrict: true });
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });
    await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "bridge-ws"], { sandbox: sb });

    const { hitMarkerPath, spyEnv } = createCanaryOplBin(sb);
    const mod = await loadBridgeModule();
    const bridge = trackBridge(new mod.OplFrameworkBridge({ workspaceRoot: sb.workspaceDir, env: spyEnv }));
    await bridge.start();

    const spawnsBefore = countSpawnLogLines();
    const initRes = await bridge.opl.readInitialize();
    const drillRes = await bridge.opl.readFullDrilldown();
    const contribRes = await bridge.opl.readContribution({ packageId: "opl-relay", ref: "status", input: {} });
    const readReceipt = contribRes.stdoutJson.opl_app_contribution.response;
    assert.equal(readReceipt.ok, true);
    assert.equal(readReceipt.ref, "status");
    assert.equal(readReceipt.result.package_id, "opl-relay");
    const actionRes = await bridge.opl.executeAction({
      actionId: "agent_package_uninstall",
      payload: { package_id: "opl-relay" },
      dryRun: true,
      mode: "preview",
    });
    const detailRes = await bridge.opl.readDomainDetailView({ itemId: "opl-relay", viewId: "opl-relay-workbench" });
    const spawnsAfter = countSpawnLogLines();

    assert.equal(spawnsAfter - spawnsBefore, 0, "Expected zero child spawns across bridge.opl RPC calls");
    assert.equal(fs.existsSync(hitMarkerPath), false, "Canary opl binary must never be executed");

    for (const [label, res] of [
      ["readInitialize", initRes],
      ["readFullDrilldown", drillRes],
      ["readContribution", contribRes],
      ["executeAction", actionRes],
      ["readDomainDetailView", detailRes],
    ]) {
      assert.ok(res && typeof res === "object", `Expected object result from ${label}`);
    }

    if ("authorityBoundary" in actionRes) {
      assert.equal(actionRes.authorityBoundary, "app_bridge_no_domain_authority");
    }
    assert.equal(actionRes.dryRun === true || actionRes.dry_run === true, true, "Expected dryRun semantics preserved");
  });

  it("T1-F8-04: bridge.connectionAccessApproval approves pending grant over trusted opl_app socket connection", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const providerDir = path.join(sb.root, "pkg-relay");
    const consumerDir = path.join(sb.root, "pkg-mas");
    buildV2Package(providerDir, { id: "opl-relay", intent: "app", specStrict: true });
    buildV2Package(consumerDir, {
      id: "mas",
      intent: "agent",
      connections: [
        {
          provider_type: "opl-relay.mailbox",
          capabilities: ["mailbox.read", "draft.create"],
          reason: "Read mailbox and create drafts",
        },
      ],
      specStrict: true,
    });
    await runCliOk(["pack", "link", providerDir], { sandbox: sb });
    await runCliOk(["pack", "link", consumerDir], { sandbox: sb });

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    await rpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Relay Mailbox",
      account_label: "e2e@lab",
      secret: "stub-mailbox-secret",
    });
    const req1 = await rpc.call("connect.requestAccess", {
      consumer_package_id: "mas",
      connection_id: "conn-mail",
      capability_id: "mailbox.read",
    });
    const requestId1 = req1.request_id ?? req1.grant_id ?? req1.requestId ?? req1.grantId;
    assert.ok(typeof requestId1 === "string" && requestId1.length > 0, `Expected requestId1, got: ${JSON.stringify(req1)}`);

    const req2 = await rpc.call("connect.requestAccess", {
      consumer_package_id: "mas",
      connection_id: "conn-mail",
      capability_id: "draft.create",
    });
    const requestId2 = req2.request_id ?? req2.grant_id ?? req2.requestId ?? req2.grantId;
    assert.ok(typeof requestId2 === "string" && requestId2.length > 0, `Expected requestId2, got: ${JSON.stringify(req2)}`);

    const { hitMarkerPath, spyEnv } = createCanaryOplBin(sb);
    const mod = await loadBridgeModule();
    const bridge = trackBridge(new mod.OplFrameworkBridge({ workspaceRoot: sb.workspaceDir, env: spyEnv }));
    await bridge.start();

    assert.equal(
      typeof bridge.connectionAccessApproval,
      "function",
      "bridge.connectionAccessApproval must be callable for opl-host-core compatibility"
    );
    assert.equal(
      typeof bridge.connectionAccessApproval.approve,
      "function",
      "bridge.connectionAccessApproval.approve(requestId) must exist per spec-04"
    );

    const spawnsBefore = countSpawnLogLines();
    const approved1 = await bridge.connectionAccessApproval.approve(requestId1);
    const approved2 = await bridge.connectionAccessApproval({ requestId: requestId2 });
    const spawnsAfter = countSpawnLogLines();

    assert.equal(spawnsAfter - spawnsBefore, 0, "Expected zero child spawns during connectionAccessApproval");
    assert.equal(fs.existsSync(hitMarkerPath), false, "Canary opl binary must never be executed");
    assert.equal(approved1.ok, true);
    assert.equal(approved1.stateRefreshRequired, true);
    assert.equal(approved2.ok, true);
    assert.equal(approved2.stateRefreshRequired, true);

    const db = openOplDb(sb.dbPath, { readOnly: true });
    try {
      const grantsRead = getGrants(db, { consumerPackageId: "mas", connectionId: "conn-mail", capabilityId: "mailbox.read" });
      assert.equal(grantsRead[0]?.status, "granted", "Expected mailbox.read connection_grants.status === 'granted' in SQLite");
      const grantsDraft = getGrants(db, { consumerPackageId: "mas", connectionId: "conn-mail", capabilityId: "draft.create" });
      assert.equal(grantsDraft[0]?.status, "granted", "Expected draft.create connection_grants.status === 'granted' in SQLite");
    } finally {
      db.close();
    }

    const invoked = await rpc.call("connect.invoke", {
      consumer_package_id: "mas",
      connection_id: "conn-mail",
      capability_id: "mailbox.read",
      input: { query: "status" },
    });
    assert.ok(invoked && typeof invoked === "object", "Expected connect.invoke to succeed after bridge approval");
  });

  it("T1-F8-05: opld Server-Push event.pack.progress (reload_mode) forwards to Bridge subscribers", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const srcV1 = path.join(sb.root, "upd-v1");
    const srcV2 = path.join(sb.root, "upd-v2");
    const outArch = path.join(sb.root, "archives");
    buildV2Package(srcV1, { id: "upd-pkg", version: "0.1.0", intent: "app", specStrict: true });
    buildV2Package(srcV2, { id: "upd-pkg", version: "0.2.0", intent: "app", specStrict: true });
    await runCliJson(["pack", "build", srcV1], { sandbox: sb });
    await runCliJson(["pack", "build", srcV2], { sandbox: sb });
    const archV1 = createLocalPackageArchive(srcV1, outArch, { includeLockFile: true });
    const archV2 = createLocalPackageArchive(srcV2, outArch, { includeLockFile: true });
    await runCliOk(["pack", "install", archV1.archivePath], { sandbox: sb });

    const mod = await loadBridgeModule();
    const bridge = trackBridge(new mod.OplFrameworkBridge({ workspaceRoot: sb.workspaceDir, env: sb.env }));
    await bridge.start();

    const receivedEvents = [];
    const listener = (ev) => receivedEvents.push(ev);
    if (typeof bridge.on === "function") {
      bridge.on("event", listener);
    } else if (typeof bridge.onEvent === "function") {
      bridge.onEvent(listener);
    } else if (typeof bridge.subscribe === "function") {
      bridge.subscribe(listener);
    } else {
      assert.fail("OplFrameworkBridge must expose on('event', fn), onEvent(fn), or subscribe(fn) for Server-Push forwarding");
    }

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    await rpc.call("pack.update", { package_id: "upd-pkg", source: archV2.archivePath });

    const deadline = Date.now() + 3000;
    let progressEv = null;
    while (Date.now() < deadline) {
      progressEv = receivedEvents.find(
        (e) => (e?.method ?? e?.type) === "event.pack.progress" && typeof (e?.params?.reload_mode ?? e?.reload_mode) === "string"
      );
      if (progressEv) break;
      await new Promise((r) => setTimeout(r, 25));
    }

    assert.ok(progressEv, `Expected bridge subscriber to receive event.pack.progress with reload_mode, got: ${JSON.stringify(receivedEvents)}`);
    const reloadMode = progressEv.params?.reload_mode ?? progressEv.reload_mode;
    assert.ok(
      ["none", "renderer_reload", "restart_required"].includes(reloadMode),
      `Unexpected reload_mode: ${String(reloadMode)}`
    );

  });
});
