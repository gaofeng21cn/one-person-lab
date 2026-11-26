import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCliExpectCode, runCliJson, runCliOk } from "../lib/cli.mjs";
import { buildV2Package } from "../lib/fixtures.mjs";
import { createSandbox, isPidAlive, waitForStubLogEvent } from "../lib/sandbox.mjs";
import {
  assertNoDuplicateAttempts,
  assertPausedByHumanSovereignty,
  countTasks,
  getAttempts,
  getLedgerEntries,
  getSchedule,
  getStageRuns,
  getTask,
  openOplDb,
  seedWakeFromSleepSchedules,
  txImmediate,
  waitForDbState,
} from "../lib/sqlite-inspector.mjs";

const activeSandboxes = [];
const activeDbs = [];

function makeSandbox(opts = {}) {
  const sb = createSandbox(opts);
  activeSandboxes.push(sb);
  return sb;
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

function readStubLogs(sb, tool) {
  const logPath = path.join(sb.stubLogDir, `${tool}.jsonl`);
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function setupSingleCodexAgent(sb, { name = "Runway Neg WS" } = {}) {
  const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", name, "--domain", "mas"], {
    sandbox: sb,
  });
  const wsId = extractWorkspaceId(wsInit);

  const pkgDir = path.join(sb.root, "pkg-mas");
  buildV2Package(pkgDir, {
    intent: "agent",
    id: "mas",
    specStrict: true,
    stages: [{ stage_id: "analysis", executor: "codex", model: "gpt-5-codex", role: "producer" }],
  });
  await runCliOk(["pack", "link", pkgDir], { sandbox: sb });
  return { wsId, pkgDir };
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
  while (activeSandboxes.length > 0) {
    const sb = activeSandboxes.pop();
    await sb.cleanup();
  }
});

describe("Tier 2 F10: OPL Runway Crash Recovery, Sovereignty & Wake-from-Sleep Boundaries", () => {
  it("T2-F10-01: paused_by_human sovereignty holds across SIGKILL opld + cold-boot reconcile()", async () => {
    const sb = makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_MODE: "hang",
      },
    });
    const d1 = await sb.startDaemon();
    const { wsId } = await setupSingleCodexAgent(sb, { name: "SIGKILL Pause WS" });

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Paused Crash", "--goal", "Hold"],
      { sandbox: sb }
    );
    const taskId = extractTaskId(startRes);

    const running = await waitForDbState(
      sb.dbPath,
      (db) => {
        const stages = getStageRuns(db, taskId);
        if (stages.length === 0) return null;
        const att = getAttempts(db, stages[0].stage_run_id)[0];
        return att?.status === "running" && Number(att.local_pid) > 0 ? { sr: stages[0], att } : null;
      },
      { timeoutMs: 8000, pollMs: 50 }
    );

    await runCliJson(["runway", "pause", taskId], { sandbox: sb });
    const dbBefore = openTrackedDb(sb.dbPath, { readOnly: true });
    const attemptCountBefore = getAttempts(dbBefore, running.sr.stage_run_id).length;
    dbBefore.close();

    await sb.killDaemon({ signal: "SIGKILL" });
    await sb.startDaemon({ excludePid: d1.pid });
    await new Promise((r) => setTimeout(r, 800));

    const dbAfter = openTrackedDb(sb.dbPath, { readOnly: true });
    assertPausedByHumanSovereignty(dbAfter, taskId, { [running.sr.stage_run_id]: attemptCountBefore });
    dbAfter.close();

    const gateRes = await runCliExpectCode(["runway", "status", taskId, "--json"], 4, { sandbox: sb });
    assert.equal(gateRes.json?.status ?? gateRes.json?.task?.status, "paused_by_human");
  });

  it("T2-F10-02: detached running codex stub survives SIGKILL opld and reconcile() reattaches & extends lease without duplicate attempt", async () => {
    const sb = makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_MODE: "hang",
      },
    });
    const d1 = await sb.startDaemon();
    const { wsId } = await setupSingleCodexAgent(sb, { name: "Reattach WS" });

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Hang Reattach", "--goal", "Survive SIGKILL"],
      { sandbox: sb }
    );
    const taskId = extractTaskId(startRes);

    const live = await waitForDbState(
      sb.dbPath,
      (db) => {
        const stages = getStageRuns(db, taskId);
        if (stages.length === 0) return null;
        const sr = stages[0];
        const att = getAttempts(db, sr.stage_run_id)[0];
        if (
          !att ||
          att.status !== "running" ||
          !(Number(att.local_pid) > 0) ||
          typeof att.executor_session_ref !== "string" ||
          att.executor_session_ref.length === 0 ||
          !att.lease_expires_at
        ) {
          return null;
        }
        return { sr, att };
      },
      { timeoutMs: 8000, pollMs: 50 }
    );

    const lease0Ms = Date.parse(live.att.lease_expires_at);
    const localPid = live.att.local_pid;

    await sb.killDaemon({ signal: "SIGKILL" });
    assert.equal(isPidAlive(localPid), true, `Detached codex stub pid ${localPid} must survive SIGKILL opld`);

    await sb.startDaemon({ excludePid: d1.pid });

    const reattached = await waitForDbState(
      sb.dbPath,
      (db) => {
        const att = getAttempts(db, live.sr.stage_run_id)[0];
        if (!att || att.status !== "running" || !att.lease_expires_at) return null;
        const renewedMs = Date.parse(att.lease_expires_at);
        return renewedMs > lease0Ms ? att : null;
      },
      { timeoutMs: 20_000, pollMs: 100 }
    );

    assert.equal(reattached.attempt_id, live.att.attempt_id);
    assert.equal(reattached.status, "running");

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    assert.equal(getStageRuns(db, taskId).length, 1, "reconcile() reattach must not spawn duplicate stage_runs");
    assertNoDuplicateAttempts(db, live.sr.stage_run_id, 1);
    db.close();

    const codexExecInvocations = readStubLogs(sb, "codex").filter(
      (e) => e.event === "invocation" && e.subcommand === "exec"
    );
    assert.equal(
      codexExecInvocations.length,
      1,
      `Expected exactly 1 codex exec invocation across reattach, got ${codexExecInvocations.length}`
    );

    await runCliJson(["runway", "cancel", taskId, "--reason", "reattach verified"], { sandbox: sb });
    await waitForDbState(
      sb.dbPath,
      (dbRo) => (!isPidAlive(localPid) && getAttempts(dbRo, live.sr.stage_run_id)[0]?.status !== "running" ? true : null),
      { timeoutMs: 8000, pollMs: 50 }
    );
  });

  it("T2-F10-03: complete_after_detach finishes while opld is dead; reconcile() harvests once-only & stays idempotent across second restart", async () => {
    const sb = makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_MODE: "complete_after_detach",
        OPL_STUB_CODEX_DELAY_MS: "1200",
        OPL_STUB_CODEX_ARTIFACTS_JSON: JSON.stringify([{ path: "out/harvested.md", content: "detached ok\n" }]),
      },
    });
    const d1 = await sb.startDaemon();
    const { wsId } = await setupSingleCodexAgent(sb, { name: "Harvest WS" });

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Detach Harvest", "--goal", "Complete while dead"],
      { sandbox: sb }
    );
    const taskId = extractTaskId(startRes);

    const live = await waitForDbState(
      sb.dbPath,
      (db) => {
        const stages = getStageRuns(db, taskId);
        if (stages.length === 0) return null;
        const sr = stages[0];
        const att = getAttempts(db, sr.stage_run_id)[0];
        if (!att || att.status !== "running" || !(Number(att.local_pid) > 0) || !att.executor_session_ref) {
          return null;
        }
        return { sr, att };
      },
      { timeoutMs: 8000, pollMs: 40 }
    );

    // Kill opld while detached stub is sleeping
    await sb.killDaemon({ signal: "SIGKILL" });

    // Confirm stub completes and persists artifact + session JSONL while opld is dead
    const completionEv = await waitForStubLogEvent(
      sb.stubLogDir,
      "codex",
      (e) => e.event === "completion" && e.subcommand === "exec" && e.exit_code === 0,
      { timeoutMs: 8000 }
    );
    assert.equal(completionEv.exit_code, 0);
    assert.equal(fs.readFileSync(path.join(sb.workspaceDir, "out/harvested.md"), "utf8"), "detached ok\n");

    const d2 = await sb.startDaemon({ excludePid: d1.pid });

    const harvested = await waitForDbState(
      sb.dbPath,
      (db) => {
        const sr = getStageRuns(db, taskId)[0];
        const att = getAttempts(db, live.sr.stage_run_id)[0];
        if (sr?.status !== "completed" || att?.status !== "succeeded") return null;
        const artifacts = getLedgerEntries(db, taskId, "artifact_ref");
        if (artifacts.length < 1) return null;
        return { sr, att, artifacts };
      },
      { timeoutMs: 10_000, pollMs: 80 }
    );

    const db1 = openTrackedDb(sb.dbPath, { readOnly: true });
    assertNoDuplicateAttempts(db1, live.sr.stage_run_id, 1);
    db1.close();

    assert.equal(harvested.artifacts.length, 1, "Expected exactly 1 artifact_ref harvested");
    const rev1 = harvested.sr.revision;

    // Second restart must remain idempotent (no duplicate harvest or revision bump)
    await sb.stopDaemon();
    await sb.startDaemon({ excludePid: d2.pid });
    await new Promise((r) => setTimeout(r, 500));

    const db2 = openTrackedDb(sb.dbPath, { readOnly: true });
    assertNoDuplicateAttempts(db2, live.sr.stage_run_id, 1);
    assert.equal(getLedgerEntries(db2, taskId, "artifact_ref").length, 1);
    assert.equal(getStageRuns(db2, taskId)[0].revision, rev1);
    db2.close();
  });

  it("T2-F10-04: killing both opld and stub yields honest interrupted + human_gate + typed_blocker with zero blind retry", async () => {
    const sb = makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_MODE: "hang",
      },
    });
    const d1 = await sb.startDaemon();
    const { wsId } = await setupSingleCodexAgent(sb, { name: "Lost Executor WS" });

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Lost Child", "--goal", "Honest fail"],
      { sandbox: sb }
    );
    const taskId = extractTaskId(startRes);

    const live = await waitForDbState(
      sb.dbPath,
      (db) => {
        const stages = getStageRuns(db, taskId);
        if (stages.length === 0) return null;
        const sr = stages[0];
        const att = getAttempts(db, sr.stage_run_id)[0];
        return att?.status === "running" && Number(att.local_pid) > 0 ? { sr, att } : null;
      },
      { timeoutMs: 8000, pollMs: 40 }
    );

    await sb.killDaemon({ signal: "SIGKILL" });
    process.kill(live.att.local_pid, "SIGKILL");
    const deadDeadline = Date.now() + 2000;
    while (Date.now() < deadDeadline && isPidAlive(live.att.local_pid)) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(isPidAlive(live.att.local_pid), false);

    await sb.startDaemon({ excludePid: d1.pid });

    const reconciled = await waitForDbState(
      sb.dbPath,
      (db) => {
        const sr = getStageRuns(db, taskId)[0];
        const att = getAttempts(db, live.sr.stage_run_id)[0];
        if (att?.status !== "interrupted" || sr?.status !== "human_gate") return null;
        const blockers = getLedgerEntries(db, taskId, "typed_blocker");
        if (blockers.length === 0) return null;
        return { sr, att, blockers };
      },
      { timeoutMs: 10_000, pollMs: 80 }
    );

    assert.ok(reconciled.sr.human_gate_json !== null, "Expected human_gate_json on lost attempt");
    assert.ok(
      reconciled.blockers.some((b) => b.attempt_id === live.att.attempt_id),
      "Expected typed_blocker linked to lost attempt_id"
    );

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    assertNoDuplicateAttempts(db, live.sr.stage_run_id, 1);
    db.close();

    const gateRes = await runCliExpectCode(["runway", "status", taskId, "--json"], 4, { sandbox: sb });
    assert.match(JSON.stringify(gateRes.json), /human_gate|awaiting_human/);
  });

  it("T2-F10-05: wake-from-sleep cron enforces skip, buffer_one, and cancel_other without missed-tick avalanche", async () => {
    const sb = makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_MODE: "hang",
      },
    });
    await sb.startDaemon();

    const pkgDir = path.join(sb.root, "pkg-mas");
    buildV2Package(pkgDir, {
      intent: "agent",
      id: "mas",
      specStrict: true,
      stages: [{ stage_id: "analysis", executor: "codex", model: "gpt-5-codex", role: "producer" }],
    });
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });

    const db = openTrackedDb(sb.dbPath);
    // Phase A: atomically seed all 3 schedules with only sch-skip enabled while task-cron-active is active
    seedWakeFromSleepSchedules(db, {
      workspaceRoot: sb.workspaceDir,
      pastIso: "2026-01-01T00:00:00Z",
      enabledScheduleIds: ["sch-skip"],
    });
    db.close();

    await waitForDbState(
      sb.dbPath,
      (dbRo) => {
        const s = getSchedule(dbRo, "sch-skip");
        return s && Date.parse(s.next_run_at) > Date.now() ? s : null;
      },
      { timeoutMs: 6000, pollMs: 100 }
    );
    await new Promise((r) => setTimeout(r, 1500));

    const dbAfterSkip = openTrackedDb(sb.dbPath, { readOnly: true });
    assert.equal(countTasks(dbAfterSkip, "ws-cron"), 1, "skip policy must not spawn extra task while active task runs");
    dbAfterSkip.close();

    // Phase B: enable only sch-buffer (buffer_one must cap wake-from-sleep to at most 1 queued/launched task)
    const dbB = openTrackedDb(sb.dbPath);
    txImmediate(dbB, () => {
      dbB.prepare("UPDATE schedules SET enabled = CASE WHEN schedule_id = 'sch-buffer' THEN 1 ELSE 0 END").run();
    });
    dbB.close();

    await waitForDbState(
      sb.dbPath,
      (dbRo) => {
        const s = getSchedule(dbRo, "sch-buffer");
        return s && Date.parse(s.next_run_at) > Date.now() ? s : null;
      },
      { timeoutMs: 6000, pollMs: 100 }
    );
    await new Promise((r) => setTimeout(r, 1500));

    const dbAfterBuffer = openTrackedDb(sb.dbPath, { readOnly: true });
    const countAfterBuffer = countTasks(dbAfterBuffer, "ws-cron");
    assert.ok(
      countAfterBuffer <= 2,
      `buffer_one must cap missed-tick catch-up to <=1 extra task (total <= 2), got ${countAfterBuffer}`
    );
    dbAfterBuffer.close();

    // Phase C: enable only sch-cancel (cancels active task and launches at most 1 fresh task)
    const dbC = openTrackedDb(sb.dbPath);
    txImmediate(dbC, () => {
      dbC.prepare("UPDATE schedules SET enabled = CASE WHEN schedule_id = 'sch-cancel' THEN 1 ELSE 0 END").run();
    });
    dbC.close();

    const cancelFired = await waitForDbState(
      sb.dbPath,
      (dbRo) => {
        const active = getTask(dbRo, "task-cron-active");
        const s = getSchedule(dbRo, "sch-cancel");
        if (active?.status !== "cancelled") return null;
        if (!s || s.last_task_id === "task-cron-active" || !s.last_task_id) return null;
        if (!(Date.parse(s.next_run_at) > Date.now())) return null;
        return { active, s };
      },
      { timeoutMs: 6000, pollMs: 100 }
    );
    await new Promise((r) => setTimeout(r, 1500));

    const dbAfterCancel = openTrackedDb(sb.dbPath, { readOnly: true });
    const totalAfterCancel = countTasks(dbAfterCancel, "ws-cron");
    assert.equal(
      totalAfterCancel,
      countAfterBuffer + 1,
      `cancel_other must launch exactly 1 replacement task (no avalanche), expected ${countAfterBuffer + 1}, got ${totalAfterCancel}`
    );
    const launchedRow = getTask(dbAfterCancel, cancelFired.s.last_task_id);
    assert.ok(launchedRow && launchedRow.task_id !== "task-cron-active");
    const activeAfter = dbAfterCancel.prepare("SELECT task_id FROM tasks WHERE workspace_id = 'ws-cron' AND status = 'active'").all();
    dbAfterCancel.close();

    for (const row of activeAfter) {
      await runCliExpectCode(["runway", "cancel", row.task_id, "--reason", "cron cleanup", "--json"], 0, { sandbox: sb });
    }
  });
});
