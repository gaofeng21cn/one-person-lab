import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCliExpectCode, runCliJson, runCliOk } from "../lib/cli.mjs";
import { buildV2Package } from "../lib/fixtures.mjs";
import { connectRpcClient } from "../lib/rpc-client.mjs";
import { createSandbox } from "../lib/sandbox.mjs";
import { getGrants, openOplDb, txImmediate } from "../lib/sqlite-inspector.mjs";

const activeSandboxes = [];

function makeSandbox(opts = {}) {
  const sb = createSandbox(opts);
  activeSandboxes.push(sb);
  return sb;
}

afterEach(async () => {
  while (activeSandboxes.length > 0) {
    const sb = activeSandboxes.pop();
    await sb.cleanup();
  }
});

describe("Tier 2 F7: opl CLI Boundary & Negative Cases", () => {
  it("T2-F7-01: retired legacy 448 CLI commands fail with exit 2 and never invoke codex stub", async () => {
    const sb = makeSandbox();

    const retiredCommands = [
      ["app", "state", "--json"],
      ["agents", "modules"],
      ["system", "diagnose"],
      ["vault", "list"],
      ["runtime", "status"],
      ["brand-modules", "list"],
      ["framework", "locate"],
      ["knowledge", "list"],
      ["stages", "list"],
      ["cordis", "status"],
    ];

    for (const cmd of retiredCommands) {
      await runCliExpectCode(cmd, 2, { sandbox: sb });
    }

    const codexLog = path.join(sb.stubLogDir, "codex.jsonl");
    const codexCalls = fs.existsSync(codexLog) ? fs.readFileSync(codexLog, "utf8").trim() : "";
    assert.equal(codexCalls, "", `Legacy CLI fallback must not invoke codex stub, got:\n${codexCalls}`);
  });

  it("T2-F7-02: missing required flags/args fail with exit 2 and emit valid JSON error with --json", async () => {
    const sb = makeSandbox();

    const invalidCases = [
      ["pack", "install", "--json"],
      ["workspace", "inspect", "--json"],
      ["pack", "build", path.join(sb.root, "nonexistent-pkg"), "--json"],
    ];

    for (const args of invalidCases) {
      const res = await runCliExpectCode(args, 2, { sandbox: sb });
      assert.ok(
        res.json !== null,
        `Expected valid JSON error on stdout for 'opl ${args.join(" ")}', parseError=${res.jsonError}\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
      );
      assert.ok(
        res.json.ok === false || Boolean(res.json.error || res.json.code),
        `Expected structured error payload (ok:false or error/code), got: ${JSON.stringify(res.json)}`
      );
    }
  });

  it("T2-F7-03: CLI invocation encountering authorization/permission/grant failure exits 3", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const providerDir = path.join(sb.root, "pkg-relay");
    const consumerDir = path.join(sb.root, "pkg-mas");
    buildV2Package(providerDir, { id: "opl-relay", intent: "app", specStrict: true });
    buildV2Package(consumerDir, {
      id: "mas",
      intent: "agent",
      connections: [{ provider_type: "opl-relay.mailbox", capabilities: ["mailbox.read"], reason: "Read mailbox" }],
      specStrict: true,
    });
    await runCliOk(["pack", "link", providerDir], { sandbox: sb });
    await runCliOk(["pack", "link", consumerDir], { sandbox: sb });

    const rpc = await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" });
    let requestId;
    try {
      await rpc.call("connect.add", {
        connection_id: "conn-mail",
        provider_type: "opl-relay.mailbox",
        display_name: "Relay Mailbox",
        account_label: "e2e@lab",
        secret: "stub-secret-value-never-leaked",
      });
      const req = await rpc.call("connect.requestAccess", {
        consumer_package_id: "mas",
        connection_id: "conn-mail",
        capability_id: "mailbox.read",
      });
      requestId = req.request_id ?? req.grant_id ?? req.requestId ?? req.grantId;
      assert.ok(typeof requestId === "string" && requestId.length > 0, `Expected request_id, got: ${JSON.stringify(req)}`);
    } finally {
      await rpc.close();
    }

    const originalSessionRaw = fs.readFileSync(sb.sessionPath, "utf8");
    const sessionObj = JSON.parse(originalSessionRaw);
    const badToken = sessionObj.token === "0".repeat(64) ? "f".repeat(64) : "0".repeat(64);
    fs.writeFileSync(sb.sessionPath, JSON.stringify({ ...sessionObj, token: badToken }), { mode: 0o600 });

    try {
      const res = await runCliExpectCode(["connect", "grants", "approve", requestId, "--json"], 3, { sandbox: sb });
      const combined = `${res.stdout}\n${res.stderr}`;
      assert.match(
        combined,
        /UNAUTHORIZED|auth|permission|token/i,
        `Expected authorization error message, got:\n${combined}`
      );
      if (res.json !== null) {
        assert.ok(
          res.json.ok === false || Boolean(res.json.error || res.json.code),
          `Expected structured error payload on exit 3, got: ${JSON.stringify(res.json)}`
        );
      }
    } finally {
      fs.writeFileSync(sb.sessionPath, originalSessionRaw, { mode: 0o600 });
    }

    const db = openOplDb(sb.dbPath, { readOnly: true });
    try {
      const grants = getGrants(db, { consumerPackageId: "mas", connectionId: "conn-mail", capabilityId: "mailbox.read" });
      assert.equal(grants[0]?.status, "requested", "Rejected unauthorized CLI approval must not grant access");
    } finally {
      db.close();
    }

    await runCliJson(["connect", "list"], { sandbox: sb });
  });

  it("T2-F7-04: opl runway status/start hitting a human_gate exits 4", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "gate-ws"], { sandbox: sb });
    const workspaceId = wsInit.workspace_id ?? wsInit.workspaceId ?? wsInit.workspace?.workspace_id ?? wsInit.id;

    const taskId = `task-gate-${Date.now()}`;
    const gatePayload = { question: "Approve external export?", options: ["approve", "reject"] };
    const db = openOplDb(sb.dbPath);
    try {
      const ts = new Date().toISOString();
      txImmediate(db, () => {
        db.prepare(
          "INSERT INTO tasks (task_id, workspace_id, agent_id, title, goal_prompt, status, revision, created_at, updated_at) VALUES (?, ?, 'mas', 'Gate Task', 'Await human decision', 'awaiting_human', 1, ?, ?)"
        ).run(taskId, workspaceId, ts, ts);
        db.prepare(
          "INSERT INTO stage_runs (stage_run_id, task_id, stage_id, seq_no, status, executor_id, model_id, human_gate_json, revision, started_at, finished_at, updated_at) VALUES (?, ?, 'review', 1, 'human_gate', 'antigravity', 'gemini-4-neon-xhigh', ?, 1, ?, NULL, ?)"
        ).run(`sr-gate-${Date.now()}`, taskId, JSON.stringify(gatePayload), ts, ts);
      });
    } finally {
      db.close();
    }

    const res = await runCliExpectCode(["runway", "status", taskId, "--json"], 4, { sandbox: sb });
    assert.ok(res.json !== null, `Expected valid JSON stdout on exit 4, got:\n${res.stdout}`);
    const serialized = JSON.stringify(res.json);
    assert.match(serialized, /human_gate|awaiting_human/);
    assert.match(serialized, /Approve external export\?/);
  });

  it("T2-F7-05: opl foundry invoked before opl-foundry is installed fails with exit 2", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const packs = await runCliJson(["pack", "list"], { sandbox: sb });
    const list = Array.isArray(packs) ? packs : packs.packages ?? packs.items ?? [];
    assert.equal(
      list.some((p) => (p.package_id ?? p.id) === "opl-foundry"),
      false,
      "Expected clean sandbox to have no opl-foundry installed"
    );

    await runCliExpectCode(["foundry", "--help"], 2, { sandbox: sb });
    await runCliExpectCode(["foundry", "validate", sb.workspaceDir], 2, { sandbox: sb });
  });
});
