import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { pathToFileURL } from "node:url";

import { runCliJson, runCliOk } from "../lib/cli.mjs";
import { buildV2Package } from "../lib/fixtures.mjs";
import { listFilesRecursive } from "../lib/pairwise-helpers.mjs";
import { assertRpcError, connectRpcClient } from "../lib/rpc-client.mjs";
import { DEFAULT_WORKTREE_ROOT, createSandbox } from "../lib/sandbox.mjs";
import {
  assertNoPlaintextSecrets,
  getInstalledPackage,
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

function decodeBindTokenClaims(token) {
  const parts = String(token).split(".");
  assert.equal(parts.length, 3, `Malformed consumerBindToken: ${token}`);
  assert.equal(parts[0], "oplcbt1");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}

async function loadMcpAppSharedExports(sharedDir) {
  const pkgJsonPath = path.join(sharedDir, "package.json");
  assert.equal(fs.existsSync(pkgJsonPath), true, `Expected mcp-app-shared package.json at ${pkgJsonPath}`);
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  const exportsMap = pkgJson.exports || {};

  async function importPublicSubpath(subpath, fallbackRel) {
    let targetRel = fallbackRel;
    const entry = exportsMap[subpath];
    if (typeof entry === "string") targetRel = entry;
    else if (entry && typeof entry === "object") {
      targetRel = entry.default || entry.import || entry.browser || targetRel;
    }
    if (!targetRel) return null;
    const abs = path.resolve(sharedDir, targetRel);
    if (!fs.existsSync(abs)) return null;
    return import(pathToFileURL(abs).href);
  }

  const rootMod = await importPublicSubpath(".", pkgJson.main || "./index.mjs");
  const presMod = (await importPublicSubpath("./presentation", "./presentation.js")) || rootMod;
  const formsMod = (await importPublicSubpath("./forms", "./forms.js")) || rootMod;
  const handoffMod = (await importPublicSubpath("./handoff", "./handoff.js")) || rootMod;
  const trajMod = (await importPublicSubpath("./trajectory-renderer", "./trajectory-renderer.js")) || rootMod;

  return {
    pkgJson,
    renderOwnerView: presMod?.renderOwnerView ?? rootMod?.renderOwnerView,
    renderInputFields: formsMod?.renderInputFields ?? rootMod?.renderInputFields,
    resolveViewHandoff: handoffMod?.resolveViewHandoff ?? rootMod?.resolveViewHandoff,
    parseTrajectorySnapshot: trajMod?.parseTrajectorySnapshot ?? rootMod?.parseTrajectorySnapshot,
  };
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

describe("Tier 1 — F13: OPL MCP App Auth Loopback & Shared Primitives", () => {
  it("T1-F13-01: opening a Tier 3 MCP App (opl-relay) mints a digest-bound consumerBindToken from opld", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const pkg = buildV2Package(path.join(sb.root, "opl-relay"), {
      intent: "app",
      id: "opl-relay",
      specStrict: true,
    });
    await runCliOk(["pack", "link", pkg.dir], { sandbox: sb });

    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const issued = await appRpc.call("connect.issueConsumerBindToken", {
      consumer_package_id: "opl-relay",
      session_id: appRpc.handshakeResult.session_id,
    });
    const token = issued.token ?? issued.consumer_bind_token ?? issued.consumerBindToken;
    assert.match(String(token), /^oplcbt1\.[A-Za-z0-9_-]+\.[0-9a-f]+$/i);

    const claims = decodeBindTokenClaims(token);
    assert.equal(claims.consumer_package_id, "opl-relay");
    assert.equal(claims.session_id, appRpc.handshakeResult.session_id);
    assert.ok(Date.parse(claims.expires_at) > Date.parse(claims.issued_at), "Token expires_at must exceed issued_at");

    const db = openOplDb(sb.dbPath, { readOnly: true });
    try {
      const installed = getInstalledPackage(db, "opl-relay");
      assert.ok(installed, "Expected opl-relay in installed_packages");
      assert.equal(claims.consumer_content_digest, installed.content_digest);
    } finally {
      db.close();
    }
  });

  it("T1-F13-02: sandboxed MCP App reads authorized workspace files (workspace_read) via opld RPC", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "mcp-ws"], { sandbox: sb });
    const workspaceId = wsInit.workspace_id ?? wsInit.workspaceId ?? wsInit.workspace?.workspace_id ?? wsInit.id;

    const notesDir = path.join(sb.workspaceDir, "notes");
    fs.mkdirSync(notesDir, { recursive: true });
    fs.writeFileSync(path.join(notesDir, "summary.md"), "# Summary\nMCP App authorized read.\n", "utf8");

    const pkg = buildV2Package(path.join(sb.root, "opl-relay"), {
      intent: "app",
      id: "opl-relay",
      specStrict: true,
    });
    await runCliOk(["pack", "link", pkg.dir], { sandbox: sb });

    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const extRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "external" }));

    const issued = await appRpc.call("connect.issueConsumerBindToken", {
      consumer_package_id: "opl-relay",
      session_id: extRpc.handshakeResult.session_id,
    });
    const token = issued.token ?? issued.consumer_bind_token ?? issued.consumerBindToken;

    const readRes = await extRpc.call("app.contribution.read", {
      package_id: "opl-relay",
      ref: "workspace.read",
      consumer_bind_token: token,
      input: {
        workspace_id: workspaceId,
        path: "notes/summary.md",
      },
    });
    const serialized = JSON.stringify(readRes);
    assert.match(serialized, /MCP App authorized read\./);
  });

  it("T1-F13-03: sandboxed MCP App invokes connect.invoke (mailbox.search) with valid consumerBindToken and zero secret leak", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const pkg = buildV2Package(path.join(sb.root, "opl-relay"), {
      intent: "app",
      id: "opl-relay",
      specStrict: true,
    });
    await runCliOk(["pack", "link", pkg.dir], { sandbox: sb });

    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const extRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "external" }));

    const secret = "secret-mcp-token-never-leaked";
    await appRpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Relay Mailbox",
      account_label: "mcp@lab",
      secret,
    });

    const req = await appRpc.call("connect.requestAccess", {
      consumer_package_id: "opl-relay",
      connection_id: "conn-mail",
      capability_ids: ["mailbox.search"],
    });
    const requestId = req.request_id ?? req.grant_id ?? req.requestId ?? req.grantId;
    await appRpc.call("connect.approveRequest", { request_id: requestId });

    const issued = await appRpc.call("connect.issueConsumerBindToken", {
      consumer_package_id: "opl-relay",
      session_id: extRpc.handshakeResult.session_id,
    });
    const token = issued.token ?? issued.consumer_bind_token ?? issued.consumerBindToken;

    const invoked = await extRpc.call("connect.invoke", {
      consumer_bind_token: token,
      connection_id: "conn-mail",
      capability_id: "mailbox.search",
      input: { query: "mace" },
    });
    assert.ok(invoked && typeof invoked === "object");
    const serialized = JSON.stringify(invoked);
    assert.equal(serialized.includes(secret), false, "Provider result must never leak raw secret");
    assert.match(serialized, /"ok":true|opl-relay/);

    const db = openOplDb(sb.dbPath, { readOnly: true });
    try {
      assertNoPlaintextSecrets(db, [secret]);
    } finally {
      db.close();
    }
  });

  it("T1-F13-04: auth loopback (Wave 2 Gate 7): missing grant -> requestAccess -> event.connect.changed -> opl_app approve -> retry succeeds", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const pkg = buildV2Package(path.join(sb.root, "opl-relay"), {
      intent: "app",
      id: "opl-relay",
      specStrict: true,
    });
    await runCliOk(["pack", "link", pkg.dir], { sandbox: sb });

    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const iframeRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "external" }));

    const secret = "secret-loopback-never-leaked";
    await appRpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Relay Mailbox",
      account_label: "loopback@lab",
      secret,
    });

    const issued = await appRpc.call("connect.issueConsumerBindToken", {
      consumer_package_id: "opl-relay",
      session_id: iframeRpc.handshakeResult.session_id,
    });
    const token = issued.token ?? issued.consumer_bind_token ?? issued.consumerBindToken;

    await assertRpcError(
      () =>
        iframeRpc.call("connect.invoke", {
          consumer_bind_token: token,
          connection_id: "conn-mail",
          capability_id: "mailbox.search",
          input: { q: "1" },
        }),
      -32003,
      /GRANT_NOT_ACTIVE|grant_not_active|grant_not_found|grant_missing_or_stale/i
    );

    appRpc.drainEvents();
    const req = await iframeRpc.call("connect.requestAccess", {
      consumer_bind_token: token,
      consumer_package_id: "opl-relay",
      connection_id: "conn-mail",
      capability_ids: ["mailbox.search"],
    });
    const requestId = req.request_id ?? req.grant_id ?? req.requestId ?? req.grantId;
    assert.ok(typeof requestId === "string" && requestId.length > 0);

    const reqEv = await appRpc.waitForEvent("event.connect.changed", { timeoutMs: 3000, consume: true });
    assert.equal(reqEv.raw.id, undefined);
    assert.match(JSON.stringify(reqEv.params), new RegExp(requestId));

    await appRpc.call("connect.approveRequest", { request_id: requestId });
    const grantedEv = await appRpc.waitForEvent("event.connect.changed", { timeoutMs: 3000, consume: true });
    assert.equal(grantedEv.raw.id, undefined);
    assert.match(JSON.stringify(grantedEv.params), /granted|grant_approved/i);

    const retried = await iframeRpc.call("connect.invoke", {
      consumer_bind_token: token,
      connection_id: "conn-mail",
      capability_id: "mailbox.search",
      input: { q: "1" },
    });
    assert.ok(retried && typeof retried === "object");
    assert.equal(JSON.stringify(retried).includes(secret), false);
    assert.match(JSON.stringify(retried), /"ok":true|opl-relay/);
  });

  it("T1-F13-05: shared declarative UI primitives public package exports work on opld state with zero legacy CLI or Temporal refs", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "ui-ws"], { sandbox: sb });
    const workspaceId = wsInit.workspace_id ?? wsInit.workspaceId ?? wsInit.workspace?.workspace_id ?? wsInit.id;

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const createdTask = await rpc.call("runway.task.create", {
      workspace_id: workspaceId,
      agent_id: "mas",
      title: "UI Primitives Task",
      goal_prompt: "Render live opld state cleanly",
    });
    const taskId = createdTask.task_id ?? createdTask.taskId ?? createdTask.task?.task_id;
    await rpc.call("ledger.append", {
      task_id: taskId,
      entry_kind: "artifact_ref",
      owner_id: "mas",
      payload: { path: "notes/ui-report.md", sha256: "deadbeef" },
    });

    const appState = await rpc.call("app.state.get", { profile: "fast" });
    const timeline = await rpc.call("ledger.timeline", { task_id: taskId });
    assert.ok(appState && typeof appState === "object");
    assert.ok(timeline && typeof timeline === "object");

    const sharedDir = path.resolve(
      process.env.OPL_MCP_APP_SHARED_DIR || path.join(DEFAULT_WORKTREE_ROOT, "packages", "mcp-app-shared")
    );
    const ui = await loadMcpAppSharedExports(sharedDir);
    assert.equal(typeof ui.renderOwnerView, "function", "Expected renderOwnerView public export");
    assert.equal(typeof ui.renderInputFields, "function", "Expected renderInputFields public export");
    assert.equal(typeof ui.parseTrajectorySnapshot, "function", "Expected parseTrajectorySnapshot public export");
    assert.equal(typeof ui.resolveViewHandoff, "function", "Expected resolveViewHandoff public export");

    const renderedHtml = ui.renderOwnerView(
      { view_type: "timeline" },
      {
        title: '<script>alert("xss")</script>Live Timeline',
        events: (Array.isArray(timeline) ? timeline : timeline.entries ?? timeline.items ?? []).map((e) => ({
          kind: e.entry_kind ?? "artifact_ref",
          title: e.owner_id ?? "mas",
          summary: JSON.stringify(e.payload ?? e.payload_json ?? appState.profile ?? "fast"),
          occurred_at: e.created_at ?? "2026-11-25T00:00:00Z",
          source_refs: ["notes/ui-report.md"],
        })),
      }
    );
    assert.equal(renderedHtml.includes("<script>alert"), false, "renderOwnerView must HTML-escape untrusted titles");
    assert.match(renderedHtml, /&lt;script&gt;alert/);

    const formHtml = ui.renderInputFields(
      {
        required: ["query"],
        properties: {
          query: { type: "string", title: "Search Query" },
          limit: { type: "integer", default: 10 },
        },
      },
      { query: "mace" }
    );
    assert.match(formHtml, /Search Query/);
    assert.match(formHtml, /required/);

    const parsedSnap = ui.parseTrajectorySnapshot(
      {
        revision: 1,
        work_item_id: taskId,
        summary: { status: "active" },
        nodes: [{ id: "n1", label: "Stage 1", source_refs: ["notes/ui-report.md"] }],
        edges: [],
      },
      taskId
    );
    assert.equal(parsedSnap.revision, 1);

    const handoff = ui.resolveViewHandoff(
      { package_id: "mas", view_id: "mas.detail", input: { task_id: taskId } },
      [{ package_id: "mas", view_id: "mas.detail", data_ref: "mas.detail.state" }]
    );
    assert.equal(handoff?.view?.view_id, "mas.detail");
    assert.equal(handoff?.input?.task_id, taskId);

    const scannedFiles = listFilesRecursive(sharedDir, { excludeTests: true }).filter((f) =>
      /\.(?:js|mjs|ts|html)$/.test(f)
    );
    assert.ok(scannedFiles.length > 0, "Expected non-empty mcp-app-shared source/bundle files");
    for (const file of scannedFiles) {
      const content = fs.readFileSync(file, "utf8");
      assert.doesNotMatch(content, /node:child_process|["']child_process["']/, `Forbidden child_process in ${file}`);
      assert.doesNotMatch(content, /spawn\(["']opl["']|execFile\(["']opl["']/, `Forbidden opl spawn in ${file}`);
      assert.doesNotMatch(content, /cordis-profiles/, `Forbidden cordis-profiles in ${file}`);
      assert.doesNotMatch(content, /@temporalio\//, `Forbidden @temporalio/ in ${file}`);
    }
  });
});
