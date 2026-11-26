import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCliExpectCode, runCliJson, runCliOk } from "../lib/cli.mjs";
import { buildV2Package } from "../lib/fixtures.mjs";
import { connectRpcClient } from "../lib/rpc-client.mjs";
import { DEFAULT_WORKTREE_ROOT, createSandbox } from "../lib/sandbox.mjs";
import {
  assertDqsZeroEnforced,
  assertPragmas,
  assertSchema,
  getLedgerEntries,
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

describe("Tier 1 — F1: packages/core Microkernel, SQLite WAL DQS=0 & Guards", () => {
  it("T1-F1-01: core SQLite wrapper initializes $OPL_STATE_DIR/opl.db with 5 mandatory PRAGMAs and 13 v2 tables", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const cliDoctor = await runCliJson(["daemon", "doctor"], { sandbox: sb });
    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const rpcDoctor = await rpc.call("daemon.doctor", {});

    assert.equal(fs.existsSync(sb.dbPath), true, `Expected SQLite DB at ${sb.dbPath}`);

    for (const [label, doc] of [
      ["CLI daemon doctor", cliDoctor],
      ["RPC daemon.doctor", rpcDoctor],
    ]) {
      const pragmas = doc?.pragmas ?? doc?.sqlite?.pragmas ?? doc?.db?.pragmas ?? doc;
      const jm = String(pragmas?.journal_mode ?? "").toLowerCase();
      assert.equal(jm, "wal", `${label}: expected journal_mode=wal, got ${JSON.stringify(pragmas)}`);

      const fk = Number(pragmas?.foreign_keys ?? -1);
      assert.equal(fk, 1, `${label}: expected foreign_keys=1, got ${JSON.stringify(pragmas)}`);

      const bt = Number(pragmas?.busy_timeout ?? pragmas?.timeout ?? 0);
      assert.ok(bt >= 5000, `${label}: expected busy_timeout>=5000, got ${bt}`);

      if (pragmas?.synchronous !== undefined && pragmas?.synchronous !== null) {
        const syncRaw = String(pragmas.synchronous).toLowerCase();
        assert.ok(
          syncRaw === "1" || syncRaw === "normal" || syncRaw === "2" || syncRaw === "full",
          `${label}: expected synchronous NORMAL(1)/FULL(2), got ${syncRaw}`
        );
      }

      if (pragmas?.temp_store !== undefined && pragmas?.temp_store !== null) {
        const tsRaw = String(pragmas.temp_store).toLowerCase();
        assert.ok(
          tsRaw === "2" || tsRaw === "memory",
          `${label}: expected temp_store MEMORY(2), got ${tsRaw}`
        );
      }
    }

    const db = openOplDb(sb.dbPath, { readOnly: true });
    try {
      assertPragmas(db, { checkConnectionDefaults: false });
      assertSchema(db);
    } finally {
      db.close();
    }
  });

  it("T1-F1-02: DQS=0 valid single-quoted SQL transaction commits cleanly via opld and SQLite inspection", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "valid-ws"], { sandbox: sb });
    const workspaceId = wsInit.workspace_id ?? wsInit.workspaceId ?? wsInit.workspace?.workspace_id ?? wsInit.id;
    assert.ok(typeof workspaceId === "string" && workspaceId.length > 0, `Expected workspace_id, got ${JSON.stringify(wsInit)}`);

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const createdTask = await rpc.call("runway.task.create", {
      workspace_id: workspaceId,
      agent_id: "mas",
      title: "DQS=0 Single Quote Tx Probe",
      goal_prompt: 'Verify single-quoted SQL handles "double-quoted" data',
    });
    const taskId = createdTask.task_id ?? createdTask.taskId ?? createdTask.task?.task_id;
    assert.ok(typeof taskId === "string" && taskId.length > 0, `Expected task_id, got ${JSON.stringify(createdTask)}`);

    const appended = await rpc.call("ledger.append", {
      task_id: taskId,
      entry_kind: "artifact_ref",
      owner_id: "mas",
      payload: {
        path: "notes/dqs-ok.md",
        note: 'quoted "payload" ok',
      },
    });
    assert.ok(appended && typeof appended === "object", "Expected ledger.append result");

    const db = openOplDb(sb.dbPath, { readOnly: true });
    try {
      assertDqsZeroEnforced(db);
      const ws = getWorkspace(db, workspaceId);
      assert.ok(ws, `Expected persisted workspace '${workspaceId}'`);
      const entries = getLedgerEntries(db, taskId, "artifact_ref");
      assert.ok(entries.length >= 1, "Expected persisted artifact_ref ledger entry");
      const payload = JSON.parse(entries[0].payload_json);
      assert.equal(payload.note, 'quoted "payload" ok');
    } finally {
      db.close();
    }

    const guardScript = path.join(DEFAULT_WORKTREE_ROOT, "scripts", "check-v2-import-guard.mjs");
    const guardRun = spawnSync(process.execPath, [guardScript, "--root", DEFAULT_WORKTREE_ROOT, "--json"], {
      encoding: "utf8",
    });
    assert.equal(guardRun.status, 0, `Guard failed:\n${guardRun.stdout}\n${guardRun.stderr}`);
    const report = JSON.parse(guardRun.stdout);
    assert.ok(report.sqlLiteralsChecked > 0, `Expected sqlLiteralsChecked > 0, got ${report.sqlLiteralsChecked}`);
    assert.equal(
      report.violations.some((v) => v.rule.startsWith("dqs0-")),
      false,
      `Unexpected DQS=0 violations: ${JSON.stringify(report.violations)}`
    );
  });

  it("T1-F1-03: dynamic plugin loader discovers and activates a valid external plugin descriptor without static registry entry", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const extPkg = buildV2Package(path.join(sb.workspaceDir, "dyn-probe-ext"), {
      intent: "extension",
      id: "dyn-probe-ext",
      specStrict: true,
      cliExtensions: [
        {
          namespace: "dynprobe",
          entrypoint: { kind: "esm_module", module: "./dist/cli.mjs", export: "registerDynProbeCli" },
        },
      ],
    });
    fs.writeFileSync(
      path.join(extPkg.dir, "dist", "cli.mjs"),
      [
        "export function registerDynProbeCli() {",
        '  return {',
        '    namespace: "dynprobe",',
        '    commands: ["ping"],',
        "    handlers: {",
        '      ping: () => ({ ok: true, dynamic: true, pkg: "dyn-probe-ext" }),',
        "    },",
        "  };",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    await runCliExpectCode(["dynprobe", "--help"], 2, { sandbox: sb });
    const beforeList = await runCliJson(["pack", "list"], { sandbox: sb });
    const beforeItems = Array.isArray(beforeList) ? beforeList : beforeList.packages ?? beforeList.items ?? [];
    assert.equal(
      beforeItems.some((p) => (p.package_id ?? p.id) === "dyn-probe-ext"),
      false,
      "Expected dyn-probe-ext not to exist in static registry before link"
    );

    await runCliJson(["pack", "link", extPkg.dir], { sandbox: sb });

    const afterList = await runCliJson(["pack", "list"], { sandbox: sb });
    const afterItems = Array.isArray(afterList) ? afterList : afterList.packages ?? afterList.items ?? [];
    const linked = afterItems.find((p) => (p.package_id ?? p.id) === "dyn-probe-ext");
    assert.ok(linked, `Expected dyn-probe-ext in pack list after link: ${JSON.stringify(afterList)}`);
    assert.ok(linked.enabled === true || linked.enabled === 1, "Expected linked extension to be enabled");

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const fastState = await rpc.call("app.state.get", { profile: "fast" });
    assert.ok(
      JSON.stringify(fastState).includes("dyn-probe-ext"),
      `Expected app.state.get to surface dynamically linked dyn-probe-ext: ${JSON.stringify(fastState)}`
    );

    const dynHelp = await runCliOk(["dynprobe", "--help"], { sandbox: sb });
    assert.match(dynHelp.stdout, /dynprobe|ping/i);
  });

  it("T1-F1-04: EventBus delivers typed events end-to-end across opld Server-Push", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const providerDir = path.join(sb.root, "pkg-relay");
    const consumerDir = path.join(sb.root, "pkg-mas");
    buildV2Package(providerDir, { id: "opl-relay", intent: "app", specStrict: true });
    buildV2Package(consumerDir, {
      id: "mas",
      intent: "agent",
      connections: [{ provider_type: "opl-relay.mailbox", capabilities: ["mailbox.search"], reason: "Search mailbox" }],
      specStrict: true,
    });
    await runCliOk(["pack", "link", providerDir], { sandbox: sb });
    await runCliOk(["pack", "link", consumerDir], { sandbox: sb });

    const rpcSub = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const rpcMut = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));

    await rpcMut.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Relay Mailbox",
      account_label: "e2e@lab",
      secret: "stub-mailbox-secret",
    });

    rpcSub.drainEvents();
    const req = await rpcMut.call("connect.requestAccess", {
      consumer_package_id: "mas",
      connection_id: "conn-mail",
      capability_ids: ["mailbox.search"],
    });
    const requestId = req.request_id ?? req.grant_id ?? req.requestId ?? req.grantId;
    assert.ok(typeof requestId === "string" && requestId.length > 0, `Expected request_id, got ${JSON.stringify(req)}`);

    const reqEv = await rpcSub.waitForEvent("event.connect.changed", { timeoutMs: 3000, consume: true });
    assert.equal(reqEv.raw.id, undefined, "Server-Push notification must omit JSON-RPC id");
    assert.equal(reqEv.method, "event.connect.changed");
    assert.ok(reqEv.params && typeof reqEv.params === "object", "Expected event.connect.changed params object");

    await rpcMut.call("connect.approveRequest", { request_id: requestId });
    const approveEv = await rpcSub.waitForEvent("event.connect.changed", { timeoutMs: 3000, consume: true });
    assert.equal(approveEv.raw.id, undefined, "Server-Push notification must omit JSON-RPC id");
    assert.equal(approveEv.method, "event.connect.changed");
    assert.match(JSON.stringify(approveEv.params), /granted|grant_approved/i);
  });

  it("T1-F1-05: static architecture check confirms packages/core < 3,000 lines, zero npm deps, and zero forbidden imports", () => {
    const guardScript = path.join(DEFAULT_WORKTREE_ROOT, "scripts", "check-v2-import-guard.mjs");
    const res = spawnSync(process.execPath, [guardScript, "--root", DEFAULT_WORKTREE_ROOT, "--json"], {
      cwd: DEFAULT_WORKTREE_ROOT,
      encoding: "utf8",
    });
    assert.equal(res.status, 0, `v2 import guard failed:\n${res.stdout}\n${res.stderr}`);

    const report = JSON.parse(res.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.coreLineBudget, 3000);
    assert.ok(report.coreLineCount > 0 && report.coreLineCount < 3000, `Expected coreLineCount in (0, 3000), got ${report.coreLineCount}`);
    assert.deepEqual(report.violations, []);
    assert.equal(report.packagesChecked.includes("core"), true);

    const corePkgJson = JSON.parse(
      fs.readFileSync(path.join(DEFAULT_WORKTREE_ROOT, "packages", "core", "package.json"), "utf8")
    );
    for (const depField of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      const deps = corePkgJson[depField];
      assert.ok(
        deps === undefined || Object.keys(deps).length === 0,
        `Expected packages/core package.json '${depField}' to be empty, got ${JSON.stringify(deps)}`
      );
    }
  });
});
