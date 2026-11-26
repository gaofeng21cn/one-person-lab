import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCliExpectCode, runCliJson } from "../lib/cli.mjs";
import { sha256File } from "../lib/fixtures.mjs";
import { RpcError, assertRpcError, connectRpcClient } from "../lib/rpc-client.mjs";
import { createSandbox } from "../lib/sandbox.mjs";
import {
  getLedgerEntries,
  getStageRun,
  openOplDb,
  seedStaleStageRun,
  txImmediate,
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

function extractWorkspaceId(res) {
  const id = res?.workspace_id ?? res?.workspaceId ?? res?.workspace?.workspace_id ?? res?.id;
  assert.ok(typeof id === "string" && id.length > 0, `Expected workspace_id in: ${JSON.stringify(res)}`);
  return id;
}

function extractTaskId(res) {
  const id = res?.task_id ?? res?.taskId ?? res?.task?.task_id ?? res?.id;
  assert.ok(typeof id === "string" && id.length > 0, `Expected task_id in: ${JSON.stringify(res)}`);
  return id;
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

describe("Tier 2 F12: OPL Ledger Refs-Only, Verification & Append-Only Negative Cases", () => {
  it("T2-F12-01: stale expected_revision on humanGate.resolve fails with -32009 REVISION_CONFLICT, 0 extra ledger_entries, and 0 loser events", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const dbSeed = openTrackedDb(sb.dbPath);
    const seeded = seedStaleStageRun(dbSeed, {
      workspaceId: "ws-rev-conflict",
      workspaceRoot: sb.workspaceDir,
      taskId: "task-rev-conflict",
      stageRunId: "sr-rev-conflict",
      revision: 1,
    });
    txImmediate(dbSeed, () => {
      dbSeed.prepare("UPDATE tasks SET status = 'awaiting_human' WHERE task_id = ?").run(seeded.taskId);
      dbSeed
        .prepare("UPDATE stage_runs SET status = 'human_gate', human_gate_json = ? WHERE stage_run_id = ?")
        .run(JSON.stringify({ question: "Approve export?", options: ["approve", "reject"] }), seeded.stageRunId);
    });
    dbSeed.close();

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    rpc.drainEvents();

    // Winner succeeds with expected_revision: 1 -> bumps revision to 2 + writes 1 human_decision entry
    await rpc.call("runway.humanGate.resolve", {
      stage_run_id: seeded.stageRunId,
      decision: "approve",
      expected_revision: 1,
    });
    rpc.drainEvents("event.ledger.appended");

    // Loser with stale expected_revision: 1 -> -32009 REVISION_CONFLICT + full rollback
    await assertRpcError(
      () =>
        rpc.call("runway.humanGate.resolve", {
          stage_run_id: seeded.stageRunId,
          decision: "reject",
          expected_revision: 1,
        }),
      -32009,
      /REVISION_CONFLICT|revision/i
    );

    const dbCheck = openTrackedDb(sb.dbPath, { readOnly: true });
    const srAfter = getStageRun(dbCheck, seeded.stageRunId);
    assert.equal(srAfter.revision, 2, "Loser must not advance stage_runs.revision");
    const ledgerRows = getLedgerEntries(dbCheck, seeded.taskId);
    assert.equal(ledgerRows.length, 1, "Loser must insert 0 extra ledger_entries rows");
    assert.equal(ledgerRows[0].entry_kind, "human_decision");
    dbCheck.close();

    assert.equal(
      rpc.peekEvents("event.ledger.appended").length,
      0,
      "Loser REVISION_CONFLICT must emit 0 event.ledger.appended notifications"
    );
  });

  it("T2-F12-02: ledger.append rejects inline bodies, plaintext secrets, path escapes, and >16KB payloads with 0 rows", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsId = extractWorkspaceId(
      await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Refs Neg WS"], { sandbox: sb })
    );
    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const taskId = extractTaskId(
      await rpc.call("runway.task.create", {
        workspace_id: wsId,
        agent_id: "mas",
        title: "Refs Neg",
        goal_prompt: "Reject violations",
      })
    );

    const badPayloads = [
      { kind: "artifact_ref", payload: { path: "a.md", body: "inline body" } },
      { kind: "artifact_ref", payload: { path: "a.md", content: "inline content" } },
      { kind: "artifact_ref", payload: { path: "a.md", body_included: true } },
      { kind: "owner_receipt", payload: { status: "ok", api_key: "secret-key-val" } },
      { kind: "failed_path_note", payload: { summary: "sk-ant-api03-abcd1234_efgh5678_ijkl9012" } },
      { kind: "failed_path_note", payload: { summary: "-----BEGIN RSA PRIVATE KEY-----\nMIIE" } },
      { kind: "failed_path_note", payload: { summary: "data:text/plain;base64,SGVsbG8=" } },
      { kind: "artifact_ref", payload: { path: "../../etc/passwd" } },
      { kind: "artifact_ref", payload: { path: "/etc/passwd" } },
      { kind: "failed_path_note", payload: { summary: "fail", failed_path_ref: "../leak.log" } },
      {
        kind: "owner_receipt",
        payload: {
          status: "ok",
          notes: Array.from({ length: 20 }, (_, i) => `${"z".repeat(1000)}-${i}`),
        },
      },
    ];

    for (const item of badPayloads) {
      let caught = null;
      try {
        await rpc.call("ledger.append", {
          task_id: taskId,
          entry_kind: item.kind,
          owner_id: "mas",
          payload: item.payload,
        });
      } catch (err) {
        caught = err;
      }
      assert.ok(caught instanceof RpcError, `Expected RpcError for ${JSON.stringify(item)}`);
    }

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    assert.equal(getLedgerEntries(db, taskId).length, 0);
    db.close();
  });

  it("T2-F12-03: opl ledger verify exits 1 on hash_mismatch, missing, path_escape, and open_blocking_debts > 0", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsId = extractWorkspaceId(
      await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Verify Neg WS"], { sandbox: sb })
    );
    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));

    const task1 = extractTaskId(
      await rpc.call("runway.task.create", {
        workspace_id: wsId,
        agent_id: "mas",
        title: "Verify Tamper",
        goal_prompt: "Hash & missing",
      })
    );
    const planPath = path.join(sb.workspaceDir, "analysis/plan.md");
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, "# Original Plan\n", "utf8");

    await rpc.call("ledger.append", {
      task_id: task1,
      entry_kind: "artifact_ref",
      owner_id: "mas",
      payload: { path: "analysis/plan.md", sha256: sha256File(planPath) },
    });
    await runCliJson(["ledger", "verify", task1], { sandbox: sb });

    // 1. hash_mismatch
    fs.appendFileSync(planPath, "TAMPERED_BYTE\n", "utf8");
    const mismatchRes = await runCliExpectCode(["ledger", "verify", task1, "--json"], 1, { sandbox: sb });
    assert.equal(mismatchRes.json?.ok, false);
    assert.ok(
      mismatchRes.json?.artifact_hash_mismatches?.some((m) => m.reason === "hash_mismatch"),
      `Expected hash_mismatch, got: ${JSON.stringify(mismatchRes.json)}`
    );

    // 2. missing
    fs.unlinkSync(planPath);
    const missingRes = await runCliExpectCode(["ledger", "verify", task1, "--json"], 1, { sandbox: sb });
    assert.equal(missingRes.json?.ok, false);
    assert.ok(
      missingRes.json?.artifact_hash_mismatches?.some((m) => m.reason === "missing"),
      `Expected missing reason, got: ${JSON.stringify(missingRes.json)}`
    );

    // 3. path_escape via symlink escaping workspace root
    const taskEscape = extractTaskId(
      await rpc.call("runway.task.create", {
        workspace_id: wsId,
        agent_id: "mas",
        title: "Verify Symlink Escape",
        goal_prompt: "Path escape",
      })
    );
    const outsideFile = path.join(sb.root, "outside-secret.txt");
    fs.writeFileSync(outsideFile, "secret\n", "utf8");
    const escapeLink = path.join(sb.workspaceDir, "analysis/escape.md");
    fs.symlinkSync(outsideFile, escapeLink);
    await rpc.call("ledger.append", {
      task_id: taskEscape,
      entry_kind: "artifact_ref",
      owner_id: "mas",
      payload: { path: "analysis/escape.md" },
    });
    const escapeRes = await runCliExpectCode(["ledger", "verify", taskEscape, "--json"], 1, { sandbox: sb });
    assert.equal(escapeRes.json?.ok, false);
    assert.ok(
      escapeRes.json?.artifact_hash_mismatches?.some((m) => m.reason === "path_escape"),
      `Expected path_escape reason, got: ${JSON.stringify(escapeRes.json)}`
    );

    // 4. open_blocking_debts > 0
    const taskDebt = extractTaskId(
      await rpc.call("runway.task.create", {
        workspace_id: wsId,
        agent_id: "mas",
        title: "Verify Blocking Debt",
        goal_prompt: "Blocking debt",
      })
    );
    const validPath = path.join(sb.workspaceDir, "analysis/valid.md");
    fs.writeFileSync(validPath, "# Valid File\n", "utf8");
    await rpc.call("ledger.append", {
      task_id: taskDebt,
      entry_kind: "artifact_ref",
      owner_id: "mas",
      payload: { path: "analysis/valid.md", sha256: sha256File(validPath) },
    });
    await rpc.call("ledger.append", {
      task_id: taskDebt,
      entry_kind: "quality_debt",
      owner_id: "mas",
      payload: { debt_id: "debt-blocking-1", blocks_submission: true },
    });
    const debtRes = await runCliExpectCode(["ledger", "verify", taskDebt, "--json"], 1, { sandbox: sb });
    assert.equal(debtRes.json?.ok, false);
    assert.equal(debtRes.json?.open_blocking_debts, 1);
  });

  it("T2-F12-04: bogus entry_kind is rejected by ledger.append RPC and SQLite CHECK constraint", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsId = extractWorkspaceId(
      await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Check Kind WS"], { sandbox: sb })
    );
    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const taskId = extractTaskId(
      await rpc.call("runway.task.create", {
        workspace_id: wsId,
        agent_id: "mas",
        title: "Check Kind",
        goal_prompt: "Reject bogus kind",
      })
    );

    let caught = null;
    try {
      await rpc.call("ledger.append", {
        task_id: taskId,
        entry_kind: "bogus_kind",
        owner_id: "mas",
        payload: { path: "a.md" },
      });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof RpcError, "Expected RpcError for bogus entry_kind");

    const db = openTrackedDb(sb.dbPath);
    assert.equal(getLedgerEntries(db, taskId).length, 0);
    assert.throws(
      () => {
        db.prepare(
          "INSERT INTO ledger_entries (entry_id, task_id, stage_run_id, attempt_id, entry_kind, owner_id, payload_json, created_at) VALUES ('le-bad', ?, NULL, NULL, 'bogus_kind', 'mas', '{}', ?)"
        ).run(taskId, new Date().toISOString());
      },
      /CHECK constraint failed/i
    );
    db.close();
  });

  it("T2-F12-05: ledger_entries is append-only across RPC (-32601), CLI (exit 2), and SQLite trigger (trg_ledger_no_update)", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsId = extractWorkspaceId(
      await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Append Only WS"], { sandbox: sb })
    );
    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const taskId = extractTaskId(
      await rpc.call("runway.task.create", {
        workspace_id: wsId,
        agent_id: "mas",
        title: "Append Only",
        goal_prompt: "Immutable ledger",
      })
    );

    const appended = await rpc.call("ledger.append", {
      task_id: taskId,
      entry_kind: "artifact_ref",
      owner_id: "mas",
      payload: { path: "notes/immutable.md" },
    });
    const entryId = appended.entry_id ?? appended.entryId ?? appended.entry?.entry_id;
    assert.ok(typeof entryId === "string" && entryId.length > 0);

    const mutatingRpcs = [
      ["ledger.update", { entry_id: entryId, owner_id: "evil" }],
      ["ledger.delete", { entry_id: entryId }],
      ["ledger.remove", { entry_id: entryId }],
      ["ledger.entry.update", { entry_id: entryId, owner_id: "evil" }],
      ["ledger.entry.delete", { entry_id: entryId }],
    ];
    for (const [method, params] of mutatingRpcs) {
      await assertRpcError(() => rpc.call(method, params), -32601, /METHOD_NOT_FOUND|not found/i);
    }

    await runCliExpectCode(["ledger", "update", entryId], 2, { sandbox: sb });
    await runCliExpectCode(["ledger", "delete", entryId], 2, { sandbox: sb });

    const db = openTrackedDb(sb.dbPath);
    assert.throws(
      () => {
        db.prepare("UPDATE ledger_entries SET owner_id = 'evil' WHERE entry_id = ?").run(entryId);
      },
      /ledger_entries is append-only/i
    );
    const rows = getLedgerEntries(db, taskId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].owner_id, "mas");
    db.close();
  });
});
