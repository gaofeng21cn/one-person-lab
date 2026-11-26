import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCliExpectCode, runCliJson, runCliOk } from "../lib/cli.mjs";
import { buildV2Package } from "../lib/fixtures.mjs";
import { connectRpcClient } from "../lib/rpc-client.mjs";
import { createSandbox, isPidAlive, waitForStubLogEvent } from "../lib/sandbox.mjs";
import {
  assertNoDuplicateAttempts,
  assertPausedByHumanSovereignty,
  assertStageRunStatus,
  assertTaskStatus,
  getAttempts,
  getLedgerEntries,
  getSchedule,
  getStageRuns,
  getTask,
  openOplDb,
  txImmediate,
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

function extractScheduleId(res) {
  const id = res?.schedule_id ?? res?.scheduleId ?? res?.schedule?.schedule_id ?? res?.id;
  assert.ok(typeof id === "string" && id.length > 0, `Expected schedule_id in: ${JSON.stringify(res)}`);
  return id;
}

async function setupSingleCodexAgent(sb, { name = "Runway WS" } = {}) {
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

describe("Tier 1 F10: OPL Runway SQLite WAL State Machine & Guardrails", () => {
  it("T1-F10-01: opl runway start persists active task, stage_run, and leased running attempt before completing", async () => {
    const sb = makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_MODE: "success",
        OPL_STUB_CODEX_DELAY_MS: "1200",
      },
    });
    await sb.startDaemon();
    const { wsId } = await setupSingleCodexAgent(sb, { name: "Start Lifecycle WS" });

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    rpc.drainEvents();

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Runway Start", "--goal", "Analyze"],
      { sandbox: sb }
    );
    const taskId = extractTaskId(startRes);

    const liveState = await waitForDbState(
      sb.dbPath,
      (db) => {
        const task = getTask(db, taskId);
        const stages = getStageRuns(db, taskId);
        if (!task || stages.length === 0) return null;
        const sr = stages[0];
        const attempts = getAttempts(db, sr.stage_run_id);
        const att = attempts[0];
        if (!att || att.status !== "running" || !att.lease_expires_at || !(Number(att.local_pid) > 0)) {
          return null;
        }
        return { task, sr, att };
      },
      { timeoutMs: 8000, pollMs: 50 }
    );

    assert.equal(liveState.task.status, "active");
    assert.equal(liveState.sr.status, "running");
    assert.equal(liveState.att.status, "running");
    assert.ok(
      Date.parse(liveState.att.lease_expires_at) > Date.parse(liveState.att.started_at),
      `Expected lease_expires_at (${liveState.att.lease_expires_at}) > started_at (${liveState.att.started_at})`
    );

    const doneState = await waitForDbState(
      sb.dbPath,
      (db) => {
        const task = getTask(db, taskId);
        if (task?.status !== "completed") return null;
        const stages = getStageRuns(db, taskId);
        const sr = stages[0];
        const attempts = getAttempts(db, sr.stage_run_id);
        return { task, sr, att: attempts[0] };
      },
      { timeoutMs: 10_000, pollMs: 80 }
    );

    assert.equal(doneState.sr.status, "completed");
    assert.equal(doneState.att.status, "succeeded");
    assert.ok(doneState.att.finished_at !== null);

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    assertNoDuplicateAttempts(db, doneState.sr.stage_run_id, 1);
    db.close();

    const runwayEvents = rpc.peekEvents("event.runway.*");
    assert.ok(
      runwayEvents.some((ev) => ev.method === "event.runway.changed" && ev.raw?.id === undefined),
      `Expected event.runway.changed Server-Push notification, got: ${JSON.stringify(runwayEvents)}`
    );
  });

  it("T1-F10-02: 15s lease heartbeat extends attempts.lease_expires_at while stub is running", async () => {
    const sb = makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_MODE: "hang",
      },
    });
    await sb.startDaemon();
    const { wsId } = await setupSingleCodexAgent(sb, { name: "Lease Heartbeat WS" });

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Lease Heartbeat", "--goal", "Hold"],
      { sandbox: sb }
    );
    const taskId = extractTaskId(startRes);

    const initial = await waitForDbState(
      sb.dbPath,
      (db) => {
        const stages = getStageRuns(db, taskId);
        if (stages.length === 0) return null;
        const attempts = getAttempts(db, stages[0].stage_run_id);
        const att = attempts[0];
        if (!att || att.status !== "running" || !att.lease_expires_at || !(Number(att.local_pid) > 0)) {
          return null;
        }
        return { sr: stages[0], att };
      },
      { timeoutMs: 8000, pollMs: 50 }
    );

    const lease0Ms = Date.parse(initial.att.lease_expires_at);
    assert.ok(Number.isFinite(lease0Ms), `Invalid initial lease_expires_at: ${initial.att.lease_expires_at}`);

    const renewed = await waitForDbState(
      sb.dbPath,
      (db) => {
        const attempts = getAttempts(db, initial.sr.stage_run_id);
        const att = attempts[0];
        if (!att || att.status !== "running" || !att.lease_expires_at) return null;
        return Date.parse(att.lease_expires_at) > lease0Ms ? att : null;
      },
      { timeoutMs: 22_000, pollMs: 250 }
    );

    assert.ok(
      Date.parse(renewed.lease_expires_at) > lease0Ms,
      `Expected heartbeat to renew lease_expires_at beyond ${initial.att.lease_expires_at}, got ${renewed.lease_expires_at}`
    );

    await runCliJson(["runway", "cancel", taskId, "--reason", "heartbeat verified"], { sandbox: sb });
    await waitForDbState(
      sb.dbPath,
      (db) => {
        const att = getAttempts(db, initial.sr.stage_run_id)[0];
        return att && att.status !== "running" && !isPidAlive(initial.att.local_pid) ? att : null;
      },
      { timeoutMs: 8000, pollMs: 50 }
    );
  });

  it("T1-F10-03: paused_by_human pauses execution, returns exit 4, survives restart, and resumes explicitly", async () => {
    const sb = makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_MODE: "hang",
      },
    });
    const d1 = await sb.startDaemon();
    const { wsId } = await setupSingleCodexAgent(sb, { name: "Pause Sovereignty WS" });

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Pause Task", "--goal", "Hold"],
      { sandbox: sb }
    );
    const taskId = extractTaskId(startRes);

    const running = await waitForDbState(
      sb.dbPath,
      (db) => {
        const stages = getStageRuns(db, taskId);
        if (stages.length === 0) return null;
        const attempts = getAttempts(db, stages[0].stage_run_id);
        const att = attempts[0];
        return att?.status === "running" && Number(att.local_pid) > 0 ? { sr: stages[0], att } : null;
      },
      { timeoutMs: 8000, pollMs: 50 }
    );

    await runCliJson(["runway", "pause", taskId], { sandbox: sb });

    const dbPaused = openTrackedDb(sb.dbPath, { readOnly: true });
    assertTaskStatus(dbPaused, taskId, "paused_by_human");
    assertStageRunStatus(dbPaused, running.sr.stage_run_id, "paused_by_human");
    const attemptsAtPause = getAttempts(dbPaused, running.sr.stage_run_id).length;
    dbPaused.close();

    const gateStatus1 = await runCliExpectCode(["runway", "status", taskId, "--json"], 4, { sandbox: sb });
    assert.equal(gateStatus1.json?.status ?? gateStatus1.json?.task?.status, "paused_by_human");

    // Clean stop + restart: paused_by_human must remain strictly paused across reconcile()
    await sb.stopDaemon();
    await sb.startDaemon({ excludePid: d1.pid });
    await new Promise((r) => setTimeout(r, 500));

    const dbAfterRestart = openTrackedDb(sb.dbPath, { readOnly: true });
    assertPausedByHumanSovereignty(dbAfterRestart, taskId, { [running.sr.stage_run_id]: attemptsAtPause });
    dbAfterRestart.close();

    const gateStatus2 = await runCliExpectCode(["runway", "status", taskId, "--json"], 4, { sandbox: sb });
    assert.equal(gateStatus2.json?.status ?? gateStatus2.json?.task?.status, "paused_by_human");

    // Explicit human resume clears paused_by_human
    await runCliJson(["runway", "resume", taskId], { sandbox: sb });
    const resumedTask = await waitForDbState(
      sb.dbPath,
      (db) => {
        const t = getTask(db, taskId);
        return t && t.status !== "paused_by_human" ? t : null;
      },
      { timeoutMs: 8000, pollMs: 80 }
    );
    assert.notEqual(resumedTask.status, "paused_by_human");

    // Cancel cleanly so no hung stub lingers
    await runCliExpectCode(["runway", "cancel", taskId, "--reason", "cleanup", "--json"], 0, { sandbox: sb });
  });

  it("T1-F10-04: opl runway cancel sends SIGTERM, terminates stub child, updates states, and appends ledger record", async () => {
    const sb = makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_MODE: "hang",
      },
    });
    await sb.startDaemon();
    const { wsId } = await setupSingleCodexAgent(sb, { name: "Cancel WS" });

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Cancel Task", "--goal", "Cancel me"],
      { sandbox: sb }
    );
    const taskId = extractTaskId(startRes);

    await waitForStubLogEvent(
      sb.stubLogDir,
      "codex",
      (e) => e.event === "invocation" && e.subcommand === "exec",
      { timeoutMs: 8000 }
    );
    const live = await waitForDbState(
      sb.dbPath,
      (db) => {
        const stages = getStageRuns(db, taskId);
        if (stages.length === 0) return null;
        const att = getAttempts(db, stages[0].stage_run_id)[0];
        return att?.status === "running" && Number(att.local_pid) > 0 && isPidAlive(att.local_pid)
          ? { sr: stages[0], att }
          : null;
      },
      { timeoutMs: 8000, pollMs: 50 }
    );

    await runCliJson(["runway", "cancel", taskId, "--reason", "User cancelled"], { sandbox: sb });

    const sigEv = await waitForStubLogEvent(
      sb.stubLogDir,
      "codex",
      (e) => e.event === "signal" && e.signal === "SIGTERM",
      { timeoutMs: 8000 }
    );
    assert.equal(sigEv.signal, "SIGTERM");

    const cancelled = await waitForDbState(
      sb.dbPath,
      (db) => {
        const task = getTask(db, taskId);
        const sr = getStageRuns(db, taskId)[0];
        const att = getAttempts(db, live.sr.stage_run_id)[0];
        if (task?.status !== "cancelled" || sr?.status !== "cancelled" || att?.status !== "cancelled") {
          return null;
        }
        return { task, sr, att, ledger: getLedgerEntries(db, taskId) };
      },
      { timeoutMs: 8000, pollMs: 50 }
    );

    assert.equal(isPidAlive(live.att.local_pid), false, "Cancelled attempt child process must no longer be alive");
    assert.ok(
      cancelled.ledger.some((e) => e.entry_kind === "human_decision" || e.entry_kind === "failed_path_note"),
      `Expected cancellation ledger entry (human_decision or failed_path_note), got: ${JSON.stringify(cancelled.ledger)}`
    );
  });

  it("T1-F10-05: persistent cron schedule creates schedules row and 1s tick launches due task & advances next_run_at", async () => {
    const sb = makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_MODE: "success",
      },
    });
    await sb.startDaemon();
    const { wsId } = await setupSingleCodexAgent(sb, { name: "Cron Tick WS" });

    const created = await runCliJson(
      [
        "runway",
        "schedules",
        "create",
        "--workspace",
        wsId,
        "--agent",
        "mas",
        "--cron",
        "* * * * *",
        "--overlap",
        "skip",
        "--title",
        "Cron Job",
        "--goal",
        "Tick",
      ],
      { sandbox: sb }
    );
    const scheduleId = extractScheduleId(created);

    const dbW = openTrackedDb(sb.dbPath);
    const initialSched = getSchedule(dbW, scheduleId);
    assert.ok(initialSched, `Expected schedule row ${scheduleId}`);
    assert.equal(initialSched.enabled, 1);
    assert.equal(initialSched.overlap_policy, "skip");

    const duePast = new Date(Date.now() - 2000).toISOString();
    txImmediate(dbW, () => {
      dbW.prepare("UPDATE schedules SET next_run_at = ? WHERE schedule_id = ?").run(duePast, scheduleId);
    });
    dbW.close();

    const fired = await waitForDbState(
      sb.dbPath,
      (db) => {
        const s = getSchedule(db, scheduleId);
        if (!s || !s.last_task_id || !s.last_run_at) return null;
        if (!(Date.parse(s.next_run_at) > Date.now())) return null;
        const launchedTask = getTask(db, s.last_task_id);
        return launchedTask ? { sched: s, launchedTask } : null;
      },
      { timeoutMs: 6000, pollMs: 100 }
    );

    assert.equal(fired.launchedTask.workspace_id, wsId);
    assert.ok(Date.parse(fired.sched.next_run_at) > Date.now());

    const listOut = await runCliJson(["runway", "schedules", "list", "--workspace", wsId], { sandbox: sb });
    const rows = Array.isArray(listOut) ? listOut : listOut.schedules ?? listOut.items ?? [];
    const listed = rows.find((r) => (r.schedule_id ?? r.scheduleId) === scheduleId);
    assert.ok(listed, `Expected ${scheduleId} in opl runway schedules list`);
    assert.equal(listed.last_task_id ?? listed.lastTaskId, fired.sched.last_task_id);

    // Wait for launched task to finish cleanly before sandbox cleanup
    await waitForDbState(
      sb.dbPath,
      (db) => {
        const t = getTask(db, fired.sched.last_task_id);
        return t && t.status !== "active" ? t : null;
      },
      { timeoutMs: 8000, pollMs: 80 }
    );
  });
});
