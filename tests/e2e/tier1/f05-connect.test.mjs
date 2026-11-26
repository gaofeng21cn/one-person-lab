import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCliJson, runCliOk } from "../lib/cli.mjs";
import { buildConnectPair } from "../lib/fixtures.mjs";
import { assertRpcError, connectRpcClient } from "../lib/rpc-client.mjs";
import { createSandbox } from "../lib/sandbox.mjs";
import {
  assertNoPlaintextSecrets,
  getConnectAuditEvents,
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

function listFilesRecursive(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFilesRecursive(full));
    else if (ent.isFile()) out.push(full);
  }
  return out;
}

async function setupLinkedConnectPair(sb, opts = {}) {
  const pair = buildConnectPair(path.join(sb.root, "pkgs"), {
    specStrict: true,
    ...opts,
  });
  await runCliOk(["pack", "link", pair.providerDir], { sandbox: sb });
  await runCliOk(["pack", "link", pair.consumerDir], { sandbox: sb });
  if (pair.consumerBDir) {
    await runCliOk(["pack", "link", pair.consumerBDir], { sandbox: sb });
  }
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

describe("Tier 1 F5: OPL Connect 3-Layer Isolation & Digest Auth", () => {
  it("T1-F5-01: opl connect add stores opaque credential_handle with zero plaintext secret leakage", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();
    await setupLinkedConnectPair(sb);

    const canarySecret = "opl_canary_secret_9a8b7c6d_f501";
    const addOut = await runCliJson(
      [
        "connect",
        "add",
        "--connection-id",
        "conn-mail",
        "--provider-type",
        "opl-relay.mailbox",
        "--display-name",
        "Work Mail",
        "--account-label",
        "gf@lab",
        "--secret",
        canarySecret,
      ],
      { sandbox: sb }
    );
    assert.equal(addOut.connection_id ?? addOut.connectionId ?? addOut.connection?.connection_id, "conn-mail");
    assert.equal(JSON.stringify(addOut).includes(canarySecret), false, "connect add output must not echo secret");

    const listOut = await runCliJson(["connect", "list"], { sandbox: sb });
    const items = Array.isArray(listOut) ? listOut : listOut.connections ?? listOut.items ?? [];
    const listed = items.find((c) => (c.connection_id ?? c.connectionId) === "conn-mail");
    assert.ok(listed, `Expected conn-mail in connect list: ${JSON.stringify(listOut)}`);
    assert.equal(listed.credential_handle, undefined, "connect.list DTO must omit credential_handle");
    assert.equal(listed.secret, undefined, "connect.list DTO must omit secret");
    assert.equal(listed.endpoint, undefined, "connect.list DTO must omit endpoint");
    assert.equal(JSON.stringify(listOut).includes(canarySecret), false);

    const checkOut = await runCliJson(["connect", "check", "conn-mail"], { sandbox: sb });
    assert.equal(JSON.stringify(checkOut).includes(canarySecret), false);

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    const conn = getConnection(db, "conn-mail");
    assert.ok(conn, "Expected conn-mail row in SQLite connections table");
    assert.equal(conn.status, "active");
    assert.equal(conn.security_revision, 1);
    assert.match(conn.credential_handle, /^vault:(encfile|keychain|memory):/);
    assertNoPlaintextSecrets(db, [canarySecret]);
    db.close();

    assert.equal(
      fs.readFileSync(sb.dbPath).includes(Buffer.from(canarySecret, "utf8")),
      false,
      "opl.db must never contain plaintext connection secret"
    );
    const walPath = `${sb.dbPath}-wal`;
    if (fs.existsSync(walPath)) {
      assert.equal(
        fs.readFileSync(walPath).includes(Buffer.from(canarySecret, "utf8")),
        false,
        "opl.db-wal must never contain plaintext connection secret"
      );
    }

    if (conn.credential_handle.startsWith("vault:encfile:")) {
      const stateFiles = listFilesRecursive(sb.stateDir).filter((f) => /vault|secret/i.test(path.basename(f)));
      assert.ok(stateFiles.length > 0, "Expected encfile vault files under OPL_STATE_DIR");
      for (const f of stateFiles) {
        const mode = fs.statSync(f).mode & 0o777;
        assert.equal(mode, 0o600, `Expected 0600 permissions on vault file ${f}, got ${mode.toString(8)}`);
        assert.equal(
          fs.readFileSync(f).includes(Buffer.from(canarySecret, "utf8")),
          false,
          `Vault file ${f} must encrypt secret rather than store plaintext`
        );
      }
    }
  });

  it("T1-F5-02: connect.requestAccess creates digest-bound requested grant and emits event.connect.changed", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();
    await setupLinkedConnectPair(sb);

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    await rpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Work Mail",
      account_label: "gf@lab",
      secret: "secret-f5-02",
    });

    const tokRes = await rpc.call("connect.issueConsumerBindToken", {
      session_id: rpc.handshakeResult.session_id,
      consumer_package_id: "mas",
    });
    const bindToken = tokRes.consumer_bind_token ?? tokRes.consumerBindToken ?? tokRes.token;
    assert.ok(typeof bindToken === "string" && bindToken.startsWith("oplcbt1."), `Unexpected bind token: ${JSON.stringify(tokRes)}`);

    rpc.drainEvents("event.connect.*");
    const req = await rpc.call("connect.requestAccess", {
      consumer_bind_token: bindToken,
      session_id: rpc.handshakeResult.session_id,
      connection_id: "conn-mail",
      capability_ids: ["mailbox.read"],
    });

    assert.equal(req.status, "requested");
    const requestId = req.request_id ?? req.requestId ?? req.grants?.[0]?.grant_id;
    assert.ok(typeof requestId === "string" && requestId.length > 0);
    assert.equal(req.grants?.length, 1);

    const ev = await rpc.waitForEvent(
      (e) => e.method === "event.connect.changed" && e.params?.connection_id === "conn-mail"
    );
    assert.ok(ev, "Expected event.connect.changed after connect.requestAccess");

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    const masPkg = getInstalledPackage(db, "mas");
    assert.ok(masPkg, "Expected mas in installed_packages");
    const grants = getGrants(db, {
      consumerPackageId: "mas",
      connectionId: "conn-mail",
      capabilityId: "mailbox.read",
    });
    assert.equal(grants.length, 1);
    assert.equal(grants[0].status, "requested");
    assert.equal(grants[0].consumer_content_digest, masPkg.content_digest);
    assert.equal(grants[0].connection_security_revision, 1);
    assert.equal(grants[0].capability_risk, "read");
    db.close();
  });

  it("T1-F5-03: trusted opl connect grants approve transitions grant to granted, logs audit & emits event", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();
    await setupLinkedConnectPair(sb);

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    await rpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Work Mail",
      secret: "secret-f5-03",
    });

    const req = await rpc.call("connect.requestAccess", {
      consumer_package_id: "mas",
      connection_id: "conn-mail",
      capability_ids: ["mailbox.read"],
    });
    const requestId = req.request_id ?? req.requestId ?? req.grants?.[0]?.grant_id;
    assert.ok(requestId);

    rpc.drainEvents("event.connect.*");
    const approved = await runCliJson(["connect", "grants", "approve", requestId], { sandbox: sb });
    const approvedGrants = Array.isArray(approved)
      ? approved
      : approved.grants ?? (approved.grant ? [approved.grant] : [approved]);
    assert.ok(
      approved?.ok === true || approvedGrants.some((g) => g?.status === "granted"),
      `Expected grant approval success, got: ${JSON.stringify(approved)}`
    );

    const ev = await rpc.waitForEvent(
      (e) =>
        e.method === "event.connect.changed" &&
        e.params?.connection_id === "conn-mail" &&
        /grant|approv/i.test(String(e.params?.kind ?? e.params?.status ?? ""))
    );
    assert.ok(ev, "Expected event.connect.changed for grant approval");

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    const grants = getGrants(db, {
      consumerPackageId: "mas",
      connectionId: "conn-mail",
      capabilityId: "mailbox.read",
    });
    assert.equal(grants.length, 1);
    assert.equal(grants[0].status, "granted");
    if ("approved_at" in grants[0]) {
      assert.ok(grants[0].approved_at !== null || grants[0].decided_at !== null);
    }
    if ("decided_by_client_kind" in grants[0] && grants[0].decided_by_client_kind) {
      assert.ok(["opl_app", "opl_cli"].includes(grants[0].decided_by_client_kind));
    }

    const audits = getConnectAuditEvents(db, { connectionId: "conn-mail", consumerPackageId: "mas" });
    assert.ok(
      audits.some((a) => /grant_approved|approved/i.test(a.kind)),
      `Expected grant_approved audit event, got: ${JSON.stringify(audits)}`
    );
    db.close();
  });

  it("T1-F5-04: connect.invoke with valid consumerBindToken and active grant dispatches to provider", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();
    await setupLinkedConnectPair(sb);

    const secret = "secret-never-returned-f504";
    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    await appRpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Work Mail",
      secret,
    });

    const sdkRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "sdk_python" }));
    const tokRes = await appRpc.call("connect.issueConsumerBindToken", {
      session_id: sdkRpc.handshakeResult.session_id,
      consumer_package_id: "mas",
    });
    const bindToken = tokRes.consumer_bind_token ?? tokRes.consumerBindToken ?? tokRes.token;

    const req = await sdkRpc.call("connect.requestAccess", {
      consumer_bind_token: bindToken,
      session_id: sdkRpc.handshakeResult.session_id,
      connection_id: "conn-mail",
      capability_ids: ["mailbox.read"],
    });
    const requestId = req.request_id ?? req.requestId ?? req.grants?.[0]?.grant_id;
    await appRpc.call("connect.approveRequest", { request_id: requestId, approved_by: "user-f5-04" });

    // Invoke via untrusted sdk_python client using consumerBindToken
    const res = await sdkRpc.call("connect.invoke", {
      consumer_bind_token: bindToken,
      session_id: sdkRpc.handshakeResult.session_id,
      consumer_package_id: "mas",
      connection_id: "conn-mail",
      capability_id: "mailbox.read",
      input: { query: "status" },
    });

    assert.equal(res.disposition, "completed");
    assert.equal(res.capability_id ?? "mailbox.read", "mailbox.read");
    assert.ok(res.result && typeof res.result === "object", `Expected bounded JSON result: ${JSON.stringify(res)}`);
    assert.equal(JSON.stringify(res).includes(secret), false, "connect.invoke response must never leak secret");

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    const audits = getConnectAuditEvents(db, {
      connectionId: "conn-mail",
      consumerPackageId: "mas",
      kind: "capability_invoked",
    });
    assert.ok(audits.some((a) => a.disposition === "completed"), `Expected completed audit event: ${JSON.stringify(audits)}`);
    db.close();
  });

  it("T1-F5-05: per-consumer grant revocation blocks revoked consumer while keeping sibling consumer active", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();
    await setupLinkedConnectPair(sb, { includeSecondConsumer: true });

    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    await appRpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Work Mail",
      secret: "secret-f5-05",
    });

    const callerSessionId = appRpc.handshakeResult.session_id;
    const tokMasRes = await appRpc.call("connect.issueConsumerBindToken", {
      session_id: callerSessionId,
      consumer_package_id: "mas",
    });
    const tokMas = tokMasRes.consumer_bind_token ?? tokMasRes.consumerBindToken ?? tokMasRes.token;
    const tokMagRes = await appRpc.call("connect.issueConsumerBindToken", {
      session_id: callerSessionId,
      consumer_package_id: "mag",
    });
    const tokMag = tokMagRes.consumer_bind_token ?? tokMagRes.consumerBindToken ?? tokMagRes.token;
    assert.ok(typeof tokMas === "string" && tokMas.startsWith("oplcbt1."));
    assert.ok(typeof tokMag === "string" && tokMag.startsWith("oplcbt1."));

    const reqMas = await appRpc.call("connect.requestAccess", {
      consumer_bind_token: tokMas,
      session_id: callerSessionId,
      connection_id: "conn-mail",
      capability_ids: ["mailbox.read"],
    });
    const reqMag = await appRpc.call("connect.requestAccess", {
      consumer_bind_token: tokMag,
      session_id: callerSessionId,
      connection_id: "conn-mail",
      capability_ids: ["mailbox.read"],
    });

    const masRequestId = reqMas.request_id ?? reqMas.requestId ?? reqMas.grants?.[0]?.grant_id;
    const magRequestId = reqMag.request_id ?? reqMag.requestId ?? reqMag.grants?.[0]?.grant_id;
    await appRpc.call("connect.approveRequest", { request_id: masRequestId });
    await appRpc.call("connect.approveRequest", { request_id: magRequestId });

    const masGrantId = reqMas.grants?.[0]?.grant_id ?? masRequestId;
    await runCliJson(["connect", "grants", "revoke", masGrantId], { sandbox: sb });

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    const masGrants = getGrants(db, { consumerPackageId: "mas", connectionId: "conn-mail", capabilityId: "mailbox.read" });
    const magGrants = getGrants(db, { consumerPackageId: "mag", connectionId: "conn-mail", capabilityId: "mailbox.read" });
    assert.equal(masGrants[0]?.status, "revoked");
    if ("revoked_at" in masGrants[0]) {
      assert.ok(masGrants[0].revoked_at !== null);
    }
    assert.equal(magGrants[0]?.status, "granted");
    db.close();

    await assertRpcError(
      () =>
        appRpc.call("connect.invoke", {
          consumer_bind_token: tokMas,
          session_id: callerSessionId,
          consumer_package_id: "mas",
          connection_id: "conn-mail",
          capability_id: "mailbox.read",
          input: { query: "status" },
        }),
      -32003,
      /GRANT_NOT_ACTIVE|grant_not_active|grant_not_found|grant_missing_or_stale/i
    );

    const magRes = await appRpc.call("connect.invoke", {
      consumer_bind_token: tokMag,
      session_id: callerSessionId,
      consumer_package_id: "mag",
      connection_id: "conn-mail",
      capability_id: "mailbox.read",
      input: { query: "status" },
    });
    assert.equal(magRes.disposition, "completed");
  });
});
