import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCliJson, runCliOk } from "../lib/cli.mjs";
import { buildV2Package, tamperPackageFile } from "../lib/fixtures.mjs";
import { assertRpcError, connectRpcClient } from "../lib/rpc-client.mjs";
import { createSandbox } from "../lib/sandbox.mjs";
import { getGrants, openOplDb } from "../lib/sqlite-inspector.mjs";

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

function instrumentRelayProvider(pkg, logPath) {
  const providerPath = path.join(pkg.binDir, `${pkg.manifest.identity.id}-provider`);
  fs.writeFileSync(
    providerPath,
    [
      "#!/usr/bin/env node",
      'const fs = require("node:fs");',
      "const chunks = [];",
      'process.stdin.on("data", (c) => chunks.push(c));',
      'process.stdin.on("end", () => {',
      '  const raw = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};',
      '  const { secret: _secret, credential: _credential, ...safe } = raw && typeof raw === "object" ? raw : {};',
      `  fs.appendFileSync(${JSON.stringify(logPath)}, JSON.stringify({ ts: Date.now(), capability_id: safe.capability_id ?? null, has_secret: Boolean(_secret), input: safe.input ?? safe }) + "\\n");`,
      `  process.stdout.write(JSON.stringify({ ok: true, provider: ${JSON.stringify(pkg.manifest.identity.id)}, capability_id: safe.capability_id ?? null, input: safe.input ?? safe }) + "\\n");`,
      "});",
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o755 }
  );
  fs.chmodSync(providerPath, 0o755);
}

function countLines(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0).length;
}

function flipLastHexChar(token) {
  const last = token.slice(-1);
  const replacement = last.toLowerCase() === "a" ? "b" : "a";
  return token.slice(0, -1) + replacement;
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

describe("Tier 2 — F13 Negative & Boundary: OPL MCP App Sandbox Isolation", () => {
  it("T2-F13-01: MCP App iframe (external client) attempting connect.approveRequest fails with -32003 TRUSTED_HOST_REQUIRED", async () => {
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

    await appRpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Relay Mailbox",
      account_label: "neg1@lab",
      secret: "secret-neg1",
    });

    const req = await appRpc.call("connect.requestAccess", {
      consumer_package_id: "opl-relay",
      connection_id: "conn-mail",
      capability_ids: ["mailbox.search"],
    });
    const requestId = req.request_id ?? req.grant_id ?? req.requestId ?? req.grantId;

    await assertRpcError(
      () => extRpc.call("connect.approveRequest", { request_id: requestId }),
      -32003,
      /TRUSTED_HOST_REQUIRED/i
    );

    const db = openOplDb(sb.dbPath, { readOnly: true });
    try {
      const grants = getGrants(db, {
        consumerPackageId: "opl-relay",
        connectionId: "conn-mail",
        capabilityId: "mailbox.search",
      });
      assert.equal(grants[0]?.status, "requested", "Untrusted approval attempt must leave grant in 'requested' state");
    } finally {
      db.close();
    }
  });

  it("T2-F13-02: MCP App calling connect.invoke with forged, expired, wrong-package, or wrong-session consumerBindToken fails closed", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const providerLog = path.join(sb.root, "provider-calls-neg2.jsonl");
    const pkg = buildV2Package(path.join(sb.root, "opl-relay"), {
      intent: "app",
      id: "opl-relay",
      specStrict: true,
    });
    instrumentRelayProvider(pkg, providerLog);

    const otherPkg = buildV2Package(path.join(sb.root, "other-pkg"), {
      intent: "app",
      id: "other-pkg",
      specStrict: true,
    });

    await runCliOk(["pack", "link", pkg.dir], { sandbox: sb });
    await runCliOk(["pack", "link", otherPkg.dir], { sandbox: sb });

    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const clientA = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "external" }));
    const clientB = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "external" }));

    await appRpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Relay Mailbox",
      account_label: "neg2@lab",
      secret: "secret-neg2",
    });
    const req = await appRpc.call("connect.requestAccess", {
      consumer_package_id: "opl-relay",
      connection_id: "conn-mail",
      capability_ids: ["mailbox.search"],
    });
    const requestId = req.request_id ?? req.grant_id ?? req.requestId ?? req.grantId;
    await appRpc.call("connect.approveRequest", { request_id: requestId });

    const issuedA = await appRpc.call("connect.issueConsumerBindToken", {
      consumer_package_id: "opl-relay",
      session_id: clientA.handshakeResult.session_id,
    });
    const validTokenA = issuedA.token ?? issuedA.consumer_bind_token ?? issuedA.consumerBindToken;

    // (a) Forged 1-char signature tamper
    const forgedToken = flipLastHexChar(validTokenA);
    await assertRpcError(
      () =>
        clientA.call("connect.invoke", {
          consumer_bind_token: forgedToken,
          connection_id: "conn-mail",
          capability_id: "mailbox.search",
          input: { q: "forged" },
        }),
      -32001,
      /UNAUTHORIZED_BIND_TOKEN|signature|invalid|not_dispatched/i
    );

    // (b) Expired token
    const issuedShort = await appRpc.call("connect.issueConsumerBindToken", {
      consumer_package_id: "opl-relay",
      session_id: clientA.handshakeResult.session_id,
      ttl_ms: 50,
    });
    const expiredToken = issuedShort.token ?? issuedShort.consumer_bind_token ?? issuedShort.consumerBindToken;
    await sleepMs(120);
    await assertRpcError(
      () =>
        clientA.call("connect.invoke", {
          consumer_bind_token: expiredToken,
          connection_id: "conn-mail",
          capability_id: "mailbox.search",
          input: { q: "expired" },
        }),
      -32001,
      /BIND_TOKEN_EXPIRED|expired|not_dispatched/i
    );

    // (c) Wrong package
    await assertRpcError(
      () =>
        clientA.call("connect.invoke", {
          consumer_bind_token: validTokenA,
          consumer_package_id: "other-pkg",
          connection_id: "conn-mail",
          capability_id: "mailbox.search",
          input: { q: "wrong-pkg" },
        }),
      -32001,
      /BIND_TOKEN_PACKAGE_MISMATCH|package|mismatch|not_dispatched/i
    );

    // (d) Wrong session
    await assertRpcError(
      () =>
        clientB.call("connect.invoke", {
          consumer_bind_token: validTokenA,
          connection_id: "conn-mail",
          capability_id: "mailbox.search",
          input: { q: "wrong-session" },
        }),
      -32001,
      /BIND_TOKEN_SESSION_MISMATCH|session|mismatch|not_dispatched/i
    );

    assert.equal(countLines(providerLog), 0, "Provider binary must NEVER be invoked on invalid bind tokens");
  });

  it("T2-F13-03: MCP App without workspace_read in ui.mcp_apps[*].host_capabilities cannot read workspace files", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "restricted-ws"], { sandbox: sb });
    const workspaceId = wsInit.workspace_id ?? wsInit.workspaceId ?? wsInit.workspace?.workspace_id ?? wsInit.id;

    const notesDir = path.join(sb.workspaceDir, "notes");
    fs.mkdirSync(notesDir, { recursive: true });
    fs.writeFileSync(path.join(notesDir, "private.md"), "TOP_SECRET_WORKSPACE_FILE\n", "utf8");

    const pkg = buildV2Package(path.join(sb.root, "opl-relay-no-ws"), {
      intent: "app",
      id: "opl-relay-no-ws",
      specStrict: true,
    });
    const manifest = JSON.parse(fs.readFileSync(pkg.manifestPath, "utf8"));
    manifest.ui.mcp_apps[0].host_capabilities = ["theme_sync"];
    fs.writeFileSync(pkg.manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    await runCliOk(["pack", "link", pkg.dir], { sandbox: sb });

    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const extRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "external" }));

    const issued = await appRpc.call("connect.issueConsumerBindToken", {
      consumer_package_id: "opl-relay-no-ws",
      session_id: extRpc.handshakeResult.session_id,
    });
    const token = issued.token ?? issued.consumer_bind_token ?? issued.consumerBindToken;

    let caught = null;
    let readResult = null;
    try {
      readResult = await extRpc.call("app.contribution.read", {
        package_id: "opl-relay-no-ws",
        ref: "workspace.read",
        consumer_bind_token: token,
        input: {
          workspace_id: workspaceId,
          path: "notes/private.md",
        },
      });
    } catch (err) {
      caught = err;
    }

    assert.ok(caught, `Expected workspace_read denial without host_capability, got result: ${JSON.stringify(readResult)}`);
    assert.match(
      `${caught.message} ${JSON.stringify(caught.data ?? "")}`,
      /workspace_read|capability|forbidden|denied|unauthorized|TRUSTED_HOST_REQUIRED/i
    );
    assert.equal(
      `${caught.message} ${JSON.stringify(caught.data ?? "")}`.includes("TOP_SECRET_WORKSPACE_FILE"),
      false,
      "Denied read must not leak private workspace file contents"
    );
  });

  it("T2-F13-04: 1-byte change to MCP App package invalidates active consumerBindToken immediately", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const providerLog = path.join(sb.root, "provider-calls-neg4.jsonl");
    const pkg = buildV2Package(path.join(sb.root, "opl-relay"), {
      intent: "app",
      id: "opl-relay",
      specStrict: true,
    });
    instrumentRelayProvider(pkg, providerLog);

    await runCliOk(["pack", "link", pkg.dir], { sandbox: sb });

    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const extRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "external" }));

    await appRpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Relay Mailbox",
      account_label: "neg4@lab",
      secret: "secret-neg4",
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
    const staleToken = issued.token ?? issued.consumer_bind_token ?? issued.consumerBindToken;

    const beforeTamper = await extRpc.call("connect.invoke", {
      consumer_bind_token: staleToken,
      connection_id: "conn-mail",
      capability_id: "mailbox.search",
      input: { q: "before" },
    });
    assert.equal(beforeTamper.disposition === "completed" || beforeTamper.ok === true, true);
    assert.equal(countLines(providerLog), 1);

    tamperPackageFile(pkg.dir, "README.md", "!");
    await runCliJson(["pack", "link", pkg.dir], { sandbox: sb });

    await assertRpcError(
      () =>
        extRpc.call("connect.invoke", {
          consumer_bind_token: staleToken,
          connection_id: "conn-mail",
          capability_id: "mailbox.search",
          input: { q: "after" },
        }),
      -32003,
      /CONSUMER_DIGEST_MISMATCH|grant_missing_or_stale|digest|stale|not_dispatched/i
    );

    assert.equal(countLines(providerLog), 1, "Provider must NOT be invoked after 1-byte package tamper");
  });

  it("T2-F13-05: revoking grant from opl_app immediately causes subsequent MCP App connect.invoke to fail closed", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const providerLog = path.join(sb.root, "provider-calls-neg5.jsonl");
    const pkg = buildV2Package(path.join(sb.root, "opl-relay"), {
      intent: "app",
      id: "opl-relay",
      specStrict: true,
    });
    instrumentRelayProvider(pkg, providerLog);

    await runCliOk(["pack", "link", pkg.dir], { sandbox: sb });

    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const extRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "external" }));

    await appRpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Relay Mailbox",
      account_label: "neg5@lab",
      secret: "secret-neg5",
    });
    const req = await appRpc.call("connect.requestAccess", {
      consumer_package_id: "opl-relay",
      connection_id: "conn-mail",
      capability_ids: ["mailbox.search"],
    });
    const requestId = req.request_id ?? req.grant_id ?? req.requestId ?? req.grantId;
    const approved = await appRpc.call("connect.approveRequest", { request_id: requestId });
    const grantId =
      approved?.[0]?.grant_id ??
      approved?.grants?.[0]?.grant_id ??
      req?.grants?.[0]?.grant_id ??
      requestId;

    const issued = await appRpc.call("connect.issueConsumerBindToken", {
      consumer_package_id: "opl-relay",
      session_id: extRpc.handshakeResult.session_id,
    });
    const token = issued.token ?? issued.consumer_bind_token ?? issued.consumerBindToken;

    const okBefore = await extRpc.call("connect.invoke", {
      consumer_bind_token: token,
      connection_id: "conn-mail",
      capability_id: "mailbox.search",
      input: { q: "ok" },
    });
    assert.equal(okBefore.disposition === "completed" || okBefore.ok === true, true);
    assert.equal(countLines(providerLog), 1);

    appRpc.drainEvents();
    await appRpc.call("connect.revoke", { grant_id: grantId });
    await appRpc.waitForEvent("event.connect.changed", { timeoutMs: 3000, consume: true });

    await assertRpcError(
      () =>
        extRpc.call("connect.invoke", {
          consumer_bind_token: token,
          connection_id: "conn-mail",
          capability_id: "mailbox.search",
          input: { q: "revoked" },
        }),
      -32003,
      /GRANT_NOT_ACTIVE|grant_not_active|grant_not_found|GRANT_NOT_FOUND|grant_missing_or_stale|revoked|not_dispatched/i
    );

    const db = openOplDb(sb.dbPath, { readOnly: true });
    try {
      const grants = getGrants(db, {
        consumerPackageId: "opl-relay",
        connectionId: "conn-mail",
        capabilityId: "mailbox.search",
      });
      assert.equal(grants[0]?.status, "revoked");
    } finally {
      db.close();
    }

    assert.equal(countLines(providerLog), 1, "Provider must NOT be invoked after grant revocation");
  });
});
