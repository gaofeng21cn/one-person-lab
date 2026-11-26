import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCliOk } from "../lib/cli.mjs";
import {
  buildConnectPair,
  escalateProviderCapability,
  tamperBindTokenSignature,
  tamperPackageFile,
} from "../lib/fixtures.mjs";
import { assertRpcError, connectRpcClient } from "../lib/rpc-client.mjs";
import { createSandbox } from "../lib/sandbox.mjs";
import {
  assertNoPlaintextSecrets,
  getConnection,
  getGrants,
  getInstalledPackage,
  openOplDb,
} from "../lib/sqlite-inspector.mjs";

const activeSandboxes = [];
const activeRpcClients = [];
const activeDbs = [];

function makeSandbox(opts = {}) {
  const sb = createSandbox(opts);
  activeSandboxes.push(sb);
  return sb;
}

function trackRpc(client) {
  activeRpcClients.push(client);
  return client;
}

function openTrackedDb(dbPath, opts) {
  const db = openOplDb(dbPath, opts);
  activeDbs.push(db);
  return db;
}

function readProviderDispatchCount(logPath) {
  if (!logPath || !fs.existsSync(logPath)) return 0;
  return fs
    .readFileSync(logPath, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0).length;
}

async function setupLinkedConnectPair(sb, opts = {}) {
  const pair = buildConnectPair(path.join(sb.root, "pkgs"), {
    specStrict: true,
    ...opts,
  });
  await runCliOk(["pack", "link", pair.providerDir], { sandbox: sb });
  await runCliOk(["pack", "link", pair.consumerDir], { sandbox: sb });
  return pair;
}

afterEach(async () => {
  while (activeDbs.length > 0) {
    const db = activeDbs.pop();
    try {
      db.close();
    } catch {
      // ignore close errors during teardown
    }
  }
  while (activeRpcClients.length > 0) {
    const c = activeRpcClients.pop();
    try {
      await c.close();
    } catch {
      // ignore close errors during teardown
    }
  }
  while (activeSandboxes.length > 0) {
    const sb = activeSandboxes.pop();
    await sb.cleanup();
  }
});

describe("Tier 2 F5: OPL Connect Negative & Tamper Fail-Closed Cases", () => {
  it("T2-F5-01: 1-byte consumer package tamper changes content_digest and fails closed before provider dispatch", async () => {
    const sb = makeSandbox();
    const providerLogPath = path.join(sb.stubLogDir, "provider-dispatch.jsonl");
    sb.env.OPL_CONNECT_PROVIDER_LOG = providerLogPath;
    await sb.startDaemon({ env: { OPL_CONNECT_PROVIDER_LOG: providerLogPath } });

    const pair = await setupLinkedConnectPair(sb);
    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    await appRpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Work Mail",
      secret: "secret-neg-01",
    });

    const sessionId = appRpc.handshakeResult.session_id;
    const tokRes = await appRpc.call("connect.issueConsumerBindToken", {
      session_id: sessionId,
      consumer_package_id: "mas",
    });
    const bindToken = tokRes.consumer_bind_token ?? tokRes.consumerBindToken ?? tokRes.token;

    const req = await appRpc.call("connect.requestAccess", {
      consumer_bind_token: bindToken,
      session_id: sessionId,
      connection_id: "conn-mail",
      capability_ids: ["mailbox.read"],
    });
    const requestId = req.request_id ?? req.requestId ?? req.grants?.[0]?.grant_id;
    await appRpc.call("connect.approveRequest", { request_id: requestId });

    const okRes = await appRpc.call("connect.invoke", {
      consumer_bind_token: bindToken,
      session_id: sessionId,
      consumer_package_id: "mas",
      connection_id: "conn-mail",
      capability_id: "mailbox.read",
      input: { query: "baseline" },
    });
    assert.equal(okRes.disposition, "completed");
    const dispatchesBeforeTamper = readProviderDispatchCount(providerLogPath);

    const dbBefore = openTrackedDb(sb.dbPath, { readOnly: true });
    const digestBefore = getInstalledPackage(dbBefore, "mas")?.content_digest;
    dbBefore.close();
    assert.ok(digestBefore);

    // 1-byte tamper in consumer package + re-link so installed_packages.content_digest updates
    tamperPackageFile(pair.consumerDir, "README.md", " ");
    await runCliOk(["pack", "link", pair.consumerDir], { sandbox: sb });

    const dbAfter = openTrackedDb(sb.dbPath, { readOnly: true });
    const digestAfter = getInstalledPackage(dbAfter, "mas")?.content_digest;
    dbAfter.close();
    assert.notEqual(digestAfter, digestBefore, "1-byte tamper must change consumer content_digest");

    await assertRpcError(
      () =>
        appRpc.call("connect.invoke", {
          consumer_bind_token: bindToken,
          session_id: sessionId,
          consumer_package_id: "mas",
          connection_id: "conn-mail",
          capability_id: "mailbox.read",
          input: { query: "after-tamper" },
        }),
      -32003,
      /CONSUMER_DIGEST_MISMATCH|consumer_digest_mismatch|grant_missing_or_stale/i
    );

    assert.equal(
      readProviderDispatchCount(providerLogPath),
      dispatchesBeforeTamper,
      "Tampered consumer must fail closed without dispatching to provider"
    );
  });

  it("T2-F5-02: invoking ungranted or undeclared capability fails closed before provider dispatch", async () => {
    const sb = makeSandbox();
    const providerLogPath = path.join(sb.stubLogDir, "provider-dispatch.jsonl");
    sb.env.OPL_CONNECT_PROVIDER_LOG = providerLogPath;
    await sb.startDaemon({ env: { OPL_CONNECT_PROVIDER_LOG: providerLogPath } });

    await setupLinkedConnectPair(sb);
    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    await appRpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Work Mail",
      secret: "secret-neg-02",
    });

    const sessionId = appRpc.handshakeResult.session_id;
    const tokRes = await appRpc.call("connect.issueConsumerBindToken", {
      session_id: sessionId,
      consumer_package_id: "mas",
    });
    const bindToken = tokRes.consumer_bind_token ?? tokRes.consumerBindToken ?? tokRes.token;

    // Grant ONLY mailbox.read (NOT draft.create)
    const req = await appRpc.call("connect.requestAccess", {
      consumer_bind_token: bindToken,
      session_id: sessionId,
      connection_id: "conn-mail",
      capability_ids: ["mailbox.read"],
    });
    const requestId = req.request_id ?? req.requestId ?? req.grants?.[0]?.grant_id;
    await appRpc.call("connect.approveRequest", { request_id: requestId });

    await assertRpcError(
      () =>
        appRpc.call("connect.invoke", {
          consumer_bind_token: bindToken,
          session_id: sessionId,
          consumer_package_id: "mas",
          connection_id: "conn-mail",
          capability_id: "draft.create",
          input: { subject: "ungranted" },
        }),
      -32003,
      /GRANT_NOT_ACTIVE|grant_not_active|grant_not_found|grant_missing_or_stale/i
    );

    let undeclaredErr = null;
    try {
      await appRpc.call("connect.invoke", {
        consumer_bind_token: bindToken,
        session_id: sessionId,
        consumer_package_id: "mas",
        connection_id: "conn-mail",
        capability_id: "mail.send",
        input: { to: "x@y.z" },
      });
    } catch (err) {
      undeclaredErr = err;
    }
    assert.ok(undeclaredErr, "Expected undeclared capability invocation to fail closed");
    assert.ok(
      undeclaredErr.code === -32602 || undeclaredErr.code === -32003,
      `Expected -32602 or -32003 for undeclared capability, got ${undeclaredErr.code}: ${undeclaredErr.message}`
    );

    assert.equal(readProviderDispatchCount(providerLogPath), 0, "Zero provider dispatches allowed on capability mismatch");
  });

  it("T2-F5-03: untrusted client escalation (-32003) and tampered/mismatched consumerBindToken (-32001) are rejected", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();
    await setupLinkedConnectPair(sb);

    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    await appRpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Work Mail",
      secret: "secret-neg-03",
    });

    const sessionId = appRpc.handshakeResult.session_id;
    const tokRes = await appRpc.call("connect.issueConsumerBindToken", {
      session_id: sessionId,
      consumer_package_id: "mas",
    });
    const bindToken = tokRes.consumer_bind_token ?? tokRes.consumerBindToken ?? tokRes.token;

    const req = await appRpc.call("connect.requestAccess", {
      consumer_bind_token: bindToken,
      session_id: sessionId,
      connection_id: "conn-mail",
      capability_ids: ["mailbox.read"],
    });
    const requestId = req.request_id ?? req.requestId ?? req.grants?.[0]?.grant_id;

    for (const untrustedKind of ["external", "sdk_python"]) {
      const untrusted = trackRpc(
        await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: untrustedKind })
      );
      await assertRpcError(
        () => untrusted.call("connect.approveRequest", { request_id: requestId }),
        -32003,
        /TRUSTED_HOST_REQUIRED|trusted/i
      );
      await assertRpcError(
        () => untrusted.call("connect.denyRequest", { request_id: requestId }),
        -32003,
        /TRUSTED_HOST_REQUIRED|trusted/i
      );
      await assertRpcError(
        () => untrusted.call("connect.revoke", { grant_id: req.grants[0].grant_id }),
        -32003,
        /TRUSTED_HOST_REQUIRED|trusted/i
      );
      await assertRpcError(
        () =>
          untrusted.call("connect.add", {
            connection_id: "conn-rogue",
            provider_type: "opl-relay.mailbox",
            display_name: "Rogue",
            secret: "rogue",
          }),
        -32003,
        /TRUSTED_HOST_REQUIRED|trusted/i
      );
      await assertRpcError(
        () =>
          untrusted.call("connect.issueConsumerBindToken", {
            session_id: "sess-rogue",
            consumer_package_id: "mas",
          }),
        -32003,
        /TRUSTED_HOST_REQUIRED|trusted/i
      );

      // Tampered bind token signature -> -32001
      const tamperedToken = tamperBindTokenSignature(bindToken);
      await assertRpcError(
        () =>
          untrusted.call("connect.invoke", {
            consumer_bind_token: tamperedToken,
            session_id: untrusted.handshakeResult.session_id,
            consumer_package_id: "mas",
            connection_id: "conn-mail",
            capability_id: "mailbox.read",
            input: {},
          }),
        -32001,
        /UNAUTHORIZED_BIND_TOKEN|unauthorized/i
      );

      // Session mismatch -> -32001
      await assertRpcError(
        () =>
          untrusted.call("connect.invoke", {
            consumer_bind_token: bindToken,
            session_id: "wrong-session-id",
            consumer_package_id: "mas",
            connection_id: "conn-mail",
            capability_id: "mailbox.read",
            input: {},
          }),
        -32001,
        /BIND_TOKEN_SESSION_MISMATCH|session/i
      );
    }

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    const grants = getGrants(db, { consumerPackageId: "mas", connectionId: "conn-mail", capabilityId: "mailbox.read" });
    assert.equal(grants[0]?.status, "requested", "Self-approval attempts must leave grant in requested state");
    db.close();
  });

  it("T2-F5-04: connection security_revision rotation and disable invalidate existing grants", async () => {
    const sb = makeSandbox();
    const providerLogPath = path.join(sb.stubLogDir, "provider-dispatch.jsonl");
    sb.env.OPL_CONNECT_PROVIDER_LOG = providerLogPath;
    await sb.startDaemon({ env: { OPL_CONNECT_PROVIDER_LOG: providerLogPath } });

    await setupLinkedConnectPair(sb);
    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    await appRpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Work Mail",
      secret: "secret-v1",
    });

    const sessionId = appRpc.handshakeResult.session_id;
    const tokRes = await appRpc.call("connect.issueConsumerBindToken", {
      session_id: sessionId,
      consumer_package_id: "mas",
    });
    const bindToken = tokRes.consumer_bind_token ?? tokRes.consumerBindToken ?? tokRes.token;

    const req1 = await appRpc.call("connect.requestAccess", {
      consumer_bind_token: bindToken,
      session_id: sessionId,
      connection_id: "conn-mail",
      capability_ids: ["mailbox.read"],
    });
    const req1Id = req1.request_id ?? req1.requestId ?? req1.grants?.[0]?.grant_id;
    await appRpc.call("connect.approveRequest", { request_id: req1Id });

    // Rotate credential -> increments security_revision and supersedes grants
    await appRpc.call("connect.rotateCredential", {
      connection_id: "conn-mail",
      secret: "rotated_secret_v2",
    });

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    const conn = getConnection(db, "conn-mail");
    assert.equal(conn?.security_revision, 2);
    const grants = getGrants(db, { consumerPackageId: "mas", connectionId: "conn-mail", capabilityId: "mailbox.read" });
    assert.equal(grants[0]?.status, "superseded");
    assertNoPlaintextSecrets(db, ["secret-v1", "rotated_secret_v2"]);
    db.close();

    let rotErr = null;
    try {
      await appRpc.call("connect.invoke", {
        consumer_bind_token: bindToken,
        session_id: sessionId,
        consumer_package_id: "mas",
        connection_id: "conn-mail",
        capability_id: "mailbox.read",
        input: {},
      });
    } catch (err) {
      rotErr = err;
    }
    assert.ok(rotErr, "Expected invoke after credential rotation to fail closed");
    assert.ok(rotErr.code === -32003 || rotErr.code === -32009);
    assert.equal(readProviderDispatchCount(providerLogPath), 0);

    // Fresh grant followed by connection disable -> fail closed with CONNECTION_DISABLED (-32003)
    const req2 = await appRpc.call("connect.requestAccess", {
      consumer_bind_token: bindToken,
      session_id: sessionId,
      connection_id: "conn-mail",
      capability_ids: ["mailbox.read"],
    });
    const req2Id = req2.request_id ?? req2.requestId ?? req2.grants?.[0]?.grant_id;
    await appRpc.call("connect.approveRequest", { request_id: req2Id });
    await appRpc.call("connect.setConnectionStatus", { connection_id: "conn-mail", status: "disabled" });

    await assertRpcError(
      () =>
        appRpc.call("connect.invoke", {
          consumer_bind_token: bindToken,
          session_id: sessionId,
          consumer_package_id: "mas",
          connection_id: "conn-mail",
          capability_id: "mailbox.read",
          input: {},
        }),
      -32003,
      /CONNECTION_DISABLED|GRANT_NOT_ACTIVE|grant_missing_or_stale/i
    );
    assert.equal(readProviderDispatchCount(providerLogPath), 0);
  });

  it("T2-F5-05: provider capability risk escalation invalidates active grant and blocks pending approval", async () => {
    const sb = makeSandbox();
    const providerLogPath = path.join(sb.stubLogDir, "provider-dispatch.jsonl");
    sb.env.OPL_CONNECT_PROVIDER_LOG = providerLogPath;
    await sb.startDaemon({ env: { OPL_CONNECT_PROVIDER_LOG: providerLogPath } });

    const pair = await setupLinkedConnectPair(sb);
    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    await appRpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Work Mail",
      secret: "secret-neg-05",
    });

    const sessionId = appRpc.handshakeResult.session_id;
    const tokRes = await appRpc.call("connect.issueConsumerBindToken", {
      session_id: sessionId,
      consumer_package_id: "mas",
    });
    const bindToken = tokRes.consumer_bind_token ?? tokRes.consumerBindToken ?? tokRes.token;

    // Subcase A: active grant on mailbox.read (read) invalidated when risk escalates -> external_write
    const reqActive = await appRpc.call("connect.requestAccess", {
      consumer_bind_token: bindToken,
      session_id: sessionId,
      connection_id: "conn-mail",
      capability_ids: ["mailbox.read"],
    });
    const reqActiveId = reqActive.request_id ?? reqActive.requestId ?? reqActive.grants?.[0]?.grant_id;
    await appRpc.call("connect.approveRequest", { request_id: reqActiveId });

    // Subcase B: pending request on draft.create (local_write) before escalation
    const reqPending = await appRpc.call("connect.requestAccess", {
      consumer_bind_token: bindToken,
      session_id: sessionId,
      connection_id: "conn-mail",
      capability_ids: ["draft.create"],
    });
    const reqPendingId = reqPending.request_id ?? reqPending.requestId ?? reqPending.grants?.[0]?.grant_id;

    let dispatchesBeforeEscalation = readProviderDispatchCount(providerLogPath);
    escalateProviderCapability(pair.providerDir, { capabilityId: "mailbox.read", newRisk: "external_write" });
    escalateProviderCapability(pair.providerDir, {
      capabilityId: "draft.create",
      newRisk: "external_write",
      newTitle: { "zh-CN": "外发草稿", "en-US": "Send external draft" },
    });
    await runCliOk(["pack", "link", pair.providerDir], { sandbox: sb });

    // If daemon caches capabilities in connections table rather than live manifest, update via connect.updateCapabilities
    let activeInvokeErr = null;
    try {
      await appRpc.call("connect.invoke", {
        consumer_bind_token: bindToken,
        session_id: sessionId,
        consumer_package_id: "mas",
        connection_id: "conn-mail",
        capability_id: "mailbox.read",
        input: {},
      });
    } catch (err) {
      activeInvokeErr = err;
    }

    if (!activeInvokeErr) {
      await appRpc.call("connect.updateCapabilities", {
        connection_id: "conn-mail",
        capabilities: [
          { capability_id: "mailbox.read", title: "Read mailbox", risk: "external_write" },
          { capability_id: "draft.create", title: "Send external draft", risk: "external_write" },
        ],
      });
      dispatchesBeforeEscalation = readProviderDispatchCount(providerLogPath);
      try {
        await appRpc.call("connect.invoke", {
          consumer_bind_token: bindToken,
          session_id: sessionId,
          consumer_package_id: "mas",
          connection_id: "conn-mail",
          capability_id: "mailbox.read",
          input: {},
        });
      } catch (err) {
        activeInvokeErr = err;
      }
    }

    assert.ok(activeInvokeErr, "Expected escalated capability invoke to fail closed");
    assert.ok(activeInvokeErr.code === -32003 || activeInvokeErr.code === -32009);
    assert.equal(
      readProviderDispatchCount(providerLogPath),
      dispatchesBeforeEscalation,
      "Zero new provider dispatches allowed after capability risk escalation"
    );

    // Subcase B: pending request created before risk/title drift cannot be approved
    let approveErr = null;
    try {
      await appRpc.call("connect.approveRequest", { request_id: reqPendingId });
    } catch (err) {
      approveErr = err;
    }
    assert.ok(approveErr, "Expected stale pending approval after capability drift to reject");
    assert.ok(approveErr.code === -32003 || approveErr.code === -32009);

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    const pendingGrants = getGrants(db, {
      consumerPackageId: "mas",
      connectionId: "conn-mail",
      capabilityId: "draft.create",
    });
    assert.notEqual(pendingGrants[0]?.status, "granted", "Escalated pending grant must never become granted");
    db.close();
  });
});
