import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCliJson, runCliOk } from "../lib/cli.mjs";
import { buildV2Package, sha256File } from "../lib/fixtures.mjs";
import { connectRpcClient } from "../lib/rpc-client.mjs";
import { createSandbox } from "../lib/sandbox.mjs";
import {
  assertLedgerRefsOnly,
  getAttempts,
  getLedgerEntries,
  getStageRuns,
  openOplDb,
  waitForDbState,
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

describe("Tier 1 F12: OPL Ledger Refs-Only & Atomic Runway+Ledger Commits", () => {
  it("T1-F12-01: stage completion atomically advances stage_runs.revision, writes ledger_entries, and pushes event.runway.changed & event.ledger.appended", async () => {
    const sb = makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_ARTIFACTS_JSON: JSON.stringify([{ path: "analysis/result.md", content: "# Result\nok\n" }]),
      },
    });
    await sb.startDaemon();

    const wsId = extractWorkspaceId(
      await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Atomic Commit WS"], { sandbox: sb })
    );
    const pkgDir = path.join(sb.root, "pkg-mas");
    buildV2Package(pkgDir, {
      intent: "agent",
      id: "mas",
      specStrict: true,
      stages: [{ stage_id: "analysis", executor: "codex", model: "gpt-5-codex", role: "producer" }],
    });
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    rpc.drainEvents();

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Atomic Stage", "--goal", "Produce result"],
      { sandbox: sb }
    );
    const taskId = extractTaskId(startRes);

    const completed = await waitForDbState(
      sb.dbPath,
      (db) => {
        const sr = getStageRuns(db, taskId)[0];
        if (!sr || sr.status !== "completed") return null;
        const att = getAttempts(db, sr.stage_run_id)[0];
        const entries = getLedgerEntries(db, taskId);
        if (!att || entries.length === 0) return null;
        return { sr, att, entries };
      },
      { timeoutMs: 10_000, pollMs: 80 }
    );

    assert.ok(completed.sr.revision >= 2, `Expected stage_runs.revision >= 2, got ${completed.sr.revision}`);
    assert.equal(completed.att.status, "succeeded");
    assert.ok(
      completed.entries.some(
        (e) =>
          (e.entry_kind === "artifact_ref" || e.entry_kind === "owner_receipt") &&
          e.stage_run_id === completed.sr.stage_run_id &&
          e.attempt_id === completed.att.attempt_id
      ),
      `Expected ledger entries linked to stage_run_id & attempt_id, got: ${JSON.stringify(completed.entries)}`
    );

    const runwayEv = await rpc.waitForEvent((ev) => ev.method === "event.runway.changed", { timeoutMs: 3000 });
    const ledgerEv = await rpc.waitForEvent((ev) => ev.method === "event.ledger.appended", { timeoutMs: 3000 });
    assert.equal(runwayEv.raw?.id, undefined);
    assert.equal(ledgerEv.raw?.id, undefined);
  });

  it("T1-F12-02: appends all 7 entry_kinds and queries timeline, artifacts, receipts, and debts (resolving debt-1)", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsId = extractWorkspaceId(
      await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "All 7 Kinds WS"], { sandbox: sb })
    );
    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const taskId = extractTaskId(
      await rpc.call("runway.task.create", {
        workspace_id: wsId,
        agent_id: "mas",
        title: "Ledger 7 Kinds",
        goal_prompt: "Test all entry kinds",
      })
    );

    await rpc.call("ledger.append", {
      task_id: taskId,
      entry_kind: "artifact_ref",
      owner_id: "mas",
      payload: {
        path: "out/report.md",
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
    });
    await rpc.call("ledger.append", {
      task_id: taskId,
      entry_kind: "quality_debt",
      owner_id: "mas",
      payload: { debt_id: "debt-1", code: "missing_fig", blocks_submission: true },
    });
    await rpc.call("ledger.append", {
      task_id: taskId,
      entry_kind: "owner_receipt",
      owner_id: "mas",
      payload: { receipt_id: "rcpt-1", status: "resolved", resolves_debt: "debt-1" },
    });
    await rpc.call("ledger.review.record", {
      task_id: taskId,
      owner_id: "reviewer-1",
      verdict: "approved",
      reviewer_role: "reviewer",
    });
    await rpc.call("ledger.append", {
      task_id: taskId,
      entry_kind: "typed_blocker",
      owner_id: "mas",
      payload: { code: "irb_pending", retryable: false },
    });
    await rpc.call("ledger.append", {
      task_id: taskId,
      entry_kind: "human_decision",
      owner_id: "human-1",
      payload: { decision: "approve", actor_id: "human-1" },
    });
    await rpc.call("ledger.append", {
      task_id: taskId,
      entry_kind: "failed_path_note",
      owner_id: "mas",
      payload: { summary: "OLS diverged on subgroup B" },
    });

    const timeline = await runCliJson(["ledger", "timeline", taskId], { sandbox: sb });
    const tlEntries = Array.isArray(timeline) ? timeline : timeline.entries ?? timeline.timeline ?? timeline.items ?? [];
    assert.equal(tlEntries.length, 7);
    const kinds = new Set(tlEntries.map((e) => e.entry_kind ?? e.entryKind));
    for (const k of [
      "artifact_ref",
      "quality_debt",
      "owner_receipt",
      "review_verdict",
      "typed_blocker",
      "human_decision",
      "failed_path_note",
    ]) {
      assert.equal(kinds.has(k), true, `Missing entry_kind '${k}' in timeline`);
    }

    const artifactsOut = await runCliJson(["ledger", "artifacts", taskId], { sandbox: sb });
    const artifactsArr = Array.isArray(artifactsOut)
      ? artifactsOut
      : artifactsOut.artifacts ?? artifactsOut.entries ?? artifactsOut.items ?? [];
    assert.ok(artifactsArr.some((a) => (a.payload?.path ?? a.path) === "out/report.md"));

    const receiptsOut = await runCliJson(["ledger", "receipts", taskId], { sandbox: sb });
    const receiptsArr = Array.isArray(receiptsOut)
      ? receiptsOut
      : receiptsOut.receipts ?? receiptsOut.entries ?? receiptsOut.items ?? [];
    assert.ok(receiptsArr.some((r) => (r.payload?.receipt_id ?? r.receipt_id) === "rcpt-1"));

    const debtsOut = await runCliJson(["ledger", "debts", taskId], { sandbox: sb });
    const debtsArr = Array.isArray(debtsOut) ? debtsOut : debtsOut.debts ?? debtsOut.entries ?? debtsOut.items ?? [];
    const debt1 = debtsArr.find((d) => (d.debt_key ?? d.entry?.payload?.debt_id ?? d.payload?.debt_id) === "debt-1");
    assert.ok(debt1, `Expected debt-1 in opl ledger debts: ${JSON.stringify(debtsOut)}`);
    assert.equal(debt1.status, "resolved");
  });

  it("T1-F12-03: ledger.review.record appends review_verdict and emits Server-Push event.ledger.appended", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsId = extractWorkspaceId(
      await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Review Event WS"], { sandbox: sb })
    );
    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const taskId = extractTaskId(
      await rpc.call("runway.task.create", {
        workspace_id: wsId,
        agent_id: "mas",
        title: "Review Record",
        goal_prompt: "Record verdict",
      })
    );

    rpc.drainEvents();
    await rpc.call("ledger.review.record", {
      task_id: taskId,
      owner_id: "reviewer-1",
      verdict: "repair_required",
      reviewer_role: "reviewer",
      finding_refs: ["reviews/r1.md"],
    });

    const ev = await rpc.waitForEvent(
      (e) => e.method === "event.ledger.appended" && (e.params?.entry_kind ?? e.params?.entry?.entry_kind) === "review_verdict",
      { timeoutMs: 3000 }
    );
    assert.equal(ev.raw?.id, undefined);

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    const rows = getLedgerEntries(db, taskId, "review_verdict");
    assert.equal(rows.length, 1);
    assert.equal(JSON.parse(rows[0].payload_json).verdict, "repair_required");
    db.close();

    const timeline = await runCliJson(["ledger", "timeline", taskId], { sandbox: sb });
    const tlEntries = Array.isArray(timeline) ? timeline : timeline.entries ?? timeline.timeline ?? timeline.items ?? [];
    assert.ok(tlEntries.some((e) => (e.entry_kind ?? e.entryKind) === "review_verdict"));
  });

  it("T1-F12-04: opl ledger verify exits 0 when workspace file SHA-256 matches and open_blocking_debts === 0", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsId = extractWorkspaceId(
      await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Verify OK WS"], { sandbox: sb })
    );
    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const taskId = extractTaskId(
      await rpc.call("runway.task.create", {
        workspace_id: wsId,
        agent_id: "mas",
        title: "Verify Lineage",
        goal_prompt: "Verify hashes",
      })
    );

    const planPath = path.join(sb.workspaceDir, "analysis/plan.md");
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, "# Verified Plan\nSHA-256 matched.\n", "utf8");
    const planSha = sha256File(planPath);

    await rpc.call("ledger.append", {
      task_id: taskId,
      entry_kind: "artifact_ref",
      owner_id: "mas",
      payload: { path: "analysis/plan.md", sha256: planSha },
    });
    await rpc.call("ledger.review.record", {
      task_id: taskId,
      owner_id: "reviewer-1",
      verdict: "pass",
      reviewer_role: "reviewer",
    });

    const verify = await runCliJson(["ledger", "verify", taskId], { sandbox: sb });
    assert.equal(verify.ok, true);
    assert.equal(verify.artifact_count, 1);
    assert.equal(verify.open_blocking_debts, 0);
    assert.equal(verify.artifact_hash_mismatches.length, 0);
    assert.equal(verify.latest_review_verdict, "pass");
  });

  it("T1-F12-05: ledger stores opaque credential_handle & usage refs within 16KB Refs-only budget with zero raw body/secrets", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsId = extractWorkspaceId(
      await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Refs Only WS"], { sandbox: sb })
    );
    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const taskId = extractTaskId(
      await rpc.call("runway.task.create", {
        workspace_id: wsId,
        agent_id: "mas",
        title: "Refs Only Check",
        goal_prompt: "Store refs only",
      })
    );

    await rpc.call("ledger.append", {
      task_id: taskId,
      entry_kind: "owner_receipt",
      owner_id: "mas",
      payload: {
        receipt_id: "rcpt-ref-1",
        status: "succeeded",
        credential_handle: "vault:encfile:k1",
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    });
    await rpc.call("ledger.append", {
      task_id: taskId,
      entry_kind: "artifact_ref",
      owner_id: "mas",
      payload: { path: "notes/summary.md" },
    });

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    const rows = assertLedgerRefsOnly(db, taskId, ["CANARY_SECRET_F1205", "CANARY_RAW_DOC_BODY_F1205"]);
    assert.equal(rows.length, 2);
    db.close();

    const rawDb = fs.readFileSync(sb.dbPath);
    assert.equal(rawDb.includes(Buffer.from("CANARY_SECRET_F1205", "utf8")), false);
    assert.equal(rawDb.includes(Buffer.from("CANARY_RAW_DOC_BODY_F1205", "utf8")), false);
    const walPath = `${sb.dbPath}-wal`;
    if (fs.existsSync(walPath)) {
      const rawWal = fs.readFileSync(walPath);
      assert.equal(rawWal.includes(Buffer.from("CANARY_SECRET_F1205", "utf8")), false);
      assert.equal(rawWal.includes(Buffer.from("CANARY_RAW_DOC_BODY_F1205", "utf8")), false);
    }
  });
});
