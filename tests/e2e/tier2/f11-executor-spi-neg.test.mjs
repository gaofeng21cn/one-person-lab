import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCli, runCliJson, runCliOk } from "../lib/cli.mjs";
import { buildV2Package } from "../lib/fixtures.mjs";
import { connectRpcClient } from "../lib/rpc-client.mjs";
import { createSandbox, isPidAlive, waitForStubLogEvent } from "../lib/sandbox.mjs";
import {
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

function createRulesFile(sb, rules) {
  const rulesPath = path.join(sb.root, "stub-rules.json");
  fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2), "utf8");
  return rulesPath;
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

describe("Tier 2 F11: Dual ExecutorSPI Boundary & Negative Cases", () => {
  it("T2-F11-01: agy --mode plan refuses artifact writes (exit 2) and codex read-only blocks writes", async () => {
    const sb = makeSandbox({
      stubEnv: {
        OPL_STUB_DEFAULT_ARTIFACT: "0",
      },
    });
    const rulesPath = createRulesFile(sb, [
      {
        tool: "agy",
        subcommand: "print",
        once: true,
        config: {
          mode: "success",
          artifacts: [{ path: "illegal-write.txt", content: "tamper" }],
        },
      },
      {
        tool: "codex",
        subcommand: "exec",
        once: true,
        config: {
          mode: "read_only_check",
          artifacts: [{ path: "illegal-codex.txt", content: "tamper" }],
        },
      },
    ]);
    await sb.startDaemon({ env: { OPL_STUB_RULES_FILE: rulesPath } });

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "RO Neg WS"], { sandbox: sb });
    const wsId = extractWorkspaceId(wsInit);

    // 1. Antigravity reviewer (--mode plan) refusing artifact write -> exit 2
    const pkgAgy = path.join(sb.root, "pkg-agy-ro");
    buildV2Package(pkgAgy, {
      intent: "agent",
      id: "mas-agy",
      specStrict: true,
      stages: [{ stage_id: "rev_plan", executor: "antigravity", model: "gemini-4-neon-xhigh", role: "reviewer" }],
    });
    await runCliOk(["pack", "link", pkgAgy], { sandbox: sb });

    const agyTaskRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas-agy", "--title", "Agy Plan Refusal", "--goal", "Review"],
      { sandbox: sb }
    );
    const agyTaskId = extractTaskId(agyTaskRes);

    const agyFailed = await waitForDbState(
      sb.dbPath,
      (db) => {
        const sr = getStageRuns(db, agyTaskId)[0];
        if (!sr) return null;
        const att = getAttempts(db, sr.stage_run_id)[0];
        return att?.status === "failed" ? { sr, att } : null;
      },
      { timeoutMs: 8000, pollMs: 60 }
    );

    assert.notEqual(agyFailed.sr.status, "completed");
    assert.equal(fs.existsSync(path.join(sb.workspaceDir, "illegal-write.txt")), false);
    const agyInv = readStubLogs(sb, "agy").find((e) => e.event === "invocation" && e.subcommand === "print");
    const agyComp = readStubLogs(sb, "agy").find((e) => e.event === "completion" && e.subcommand === "print");
    assert.equal(agyInv?.parsed?.mode, "plan");
    assert.equal(agyComp?.exit_code, 2);

    // 2. Codex reviewer read_only_check with attempted artifact -> exit 2
    const pkgCodex = path.join(sb.root, "pkg-codex-ro");
    buildV2Package(pkgCodex, {
      intent: "agent",
      id: "mas-codex",
      specStrict: true,
      stages: [{ stage_id: "rev_ro", executor: "codex", model: "gpt-5-codex", role: "reviewer" }],
    });
    await runCliOk(["pack", "link", pkgCodex], { sandbox: sb });

    const codexTaskRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas-codex", "--title", "Codex RO Refusal", "--goal", "Review"],
      { sandbox: sb }
    );
    const codexTaskId = extractTaskId(codexTaskRes);

    const codexFailed = await waitForDbState(
      sb.dbPath,
      (db) => {
        const sr = getStageRuns(db, codexTaskId)[0];
        if (!sr) return null;
        const att = getAttempts(db, sr.stage_run_id)[0];
        return att?.status === "failed" ? { sr, att } : null;
      },
      { timeoutMs: 8000, pollMs: 60 }
    );

    assert.notEqual(codexFailed.sr.status, "completed");
    assert.equal(fs.existsSync(path.join(sb.workspaceDir, "illegal-codex.txt")), false);
  });

  it("T2-F11-02: missing/unavailable antigravity binary fails healthCheck & dispatch with zero silent fallback to codex", async () => {
    const sb = makeSandbox();
    const brokenBinDir = path.join(sb.root, "broken-bin");
    fs.mkdirSync(brokenBinDir, { recursive: true });
    // Keep codex functional, mask any host agy with exit-127 shim
    fs.symlinkSync(path.join(sb.stubsBinDir, "codex"), path.join(brokenBinDir, "codex"));
    const brokenAgy = path.join(brokenBinDir, "agy");
    fs.writeFileSync(brokenAgy, "#!/bin/sh\necho 'agy: not available' >&2\nexit 127\n", { mode: 0o755 });
    fs.chmodSync(brokenAgy, 0o755);

    const restPath = sb.env.PATH.split(path.delimiter).filter((p) => path.resolve(p) !== path.resolve(sb.stubsBinDir));
    const brokenPath = [brokenBinDir, ...restPath].join(path.delimiter);
    await sb.startDaemon({ env: { PATH: brokenPath } });

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const health = await rpc.call("runway.executors.health", {});
    const healthArr = Array.isArray(health) ? health : health.executors ?? health.health ?? Object.values(health || {});
    const codexHealth = healthArr.find((e) => (e?.id ?? e?.executor_id) === "codex");
    const agyHealth = healthArr.find((e) => (e?.id ?? e?.executor_id) === "antigravity");
    assert.equal(codexHealth?.available ?? codexHealth?.healthy, true);
    assert.equal(agyHealth?.available ?? agyHealth?.healthy, false);

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Broken Exec WS"], { sandbox: sb });
    const wsId = extractWorkspaceId(wsInit);

    const pkgDir = path.join(sb.root, "pkg-agy-broken");
    buildV2Package(pkgDir, {
      intent: "agent",
      id: "mas",
      specStrict: true,
      stages: [{ stage_id: "analyze", executor: "antigravity", model: "gemini-4-neon-high", role: "producer" }],
    });
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });

    const startRes = await runCli(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Unavailable Agy", "--goal", "Fail cleanly", "--json"],
      { sandbox: sb }
    );
    if (startRes.code === 0 && startRes.json) {
      const taskId = extractTaskId(startRes.json);
      await waitForDbState(
        sb.dbPath,
        (db) => {
          const sr = getStageRuns(db, taskId)[0];
          const att = sr ? getAttempts(db, sr.stage_run_id)[0] : null;
          return (sr && (sr.status === "failed" || sr.status === "human_gate")) || att?.status === "failed"
            ? true
            : null;
        },
        { timeoutMs: 8000, pollMs: 60 }
      );
    } else {
      assert.notEqual(startRes.code, 0);
    }

    const codexExecs = readStubLogs(sb, "codex").filter((e) => e.subcommand === "exec" || e.subcommand === "exec_resume");
    assert.equal(codexExecs.length, 0, "Unavailable antigravity must NEVER silently fall back to codex");
  });

  it("T2-F11-03: non-zero executor exits (codex 503 / agy error) persist failed status, error_json, and failed_path_note", async () => {
    const sb = makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_MODE: "fail",
        OPL_STUB_AGY_MODE: "fail",
      },
    });
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Fail Mode WS"], { sandbox: sb });
    const wsId = extractWorkspaceId(wsInit);

    const pkgCodex = path.join(sb.root, "pkg-fail-codex");
    buildV2Package(pkgCodex, {
      intent: "agent",
      id: "mas-codex",
      specStrict: true,
      stages: [{ stage_id: "build", executor: "codex", model: "gpt-5-codex", role: "producer" }],
    });
    const pkgAgy = path.join(sb.root, "pkg-fail-agy");
    buildV2Package(pkgAgy, {
      intent: "agent",
      id: "mas-agy",
      specStrict: true,
      stages: [{ stage_id: "analyze", executor: "antigravity", model: "gemini-4-neon-high", role: "producer" }],
    });
    await runCliOk(["pack", "link", pkgCodex], { sandbox: sb });
    await runCliOk(["pack", "link", pkgAgy], { sandbox: sb });

    const cRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas-codex", "--title", "Codex Fail", "--goal", "Fail 503"],
      { sandbox: sb }
    );
    const codexTaskId = extractTaskId(cRes);

    const aRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas-agy", "--title", "Agy Fail", "--goal", "Fail stream"],
      { sandbox: sb }
    );
    const agyTaskId = extractTaskId(aRes);

    for (const taskId of [codexTaskId, agyTaskId]) {
      const failed = await waitForDbState(
        sb.dbPath,
        (db) => {
          const sr = getStageRuns(db, taskId)[0];
          if (!sr) return null;
          const att = getAttempts(db, sr.stage_run_id)[0];
          if (!att || att.status !== "failed") return null;
          const notes = getLedgerEntries(db, taskId, "failed_path_note");
          if (notes.length === 0) return null;
          return { sr, att, notes };
        },
        { timeoutMs: 10_000, pollMs: 80 }
      );
      assert.equal(failed.att.status, "failed");
      assert.ok(failed.att.error_json !== null, `Expected error_json populated for failed task ${taskId}`);
      assert.notEqual(failed.sr.status, "completed");

      const tl = await runCliJson(["ledger", "timeline", taskId], { sandbox: sb });
      const entries = Array.isArray(tl) ? tl : tl.entries ?? tl.timeline ?? tl.items ?? [];
      assert.ok(entries.some((e) => (e.entry_kind ?? e.entryKind) === "failed_path_note"));
    }
  });

  it("T2-F11-04: timeout interrupt sends graceful SIGTERM and escalates to SIGKILL after 10s when SIGTERM is ignored", async () => {
    // Part A: normal SIGTERM response
    const sbGraceful = makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_MODE: "hang",
        OPL_RUNWAY_ATTEMPT_TIMEOUT_MS: "500",
      },
    });
    await sbGraceful.startDaemon();

    const wsA = extractWorkspaceId(
      await runCliJson(["workspace", "init", sbGraceful.workspaceDir, "--name", "Graceful Timeout WS"], { sandbox: sbGraceful })
    );
    const pkgA = path.join(sbGraceful.root, "pkg-timeout-a");
    buildV2Package(pkgA, {
      intent: "agent",
      id: "mas",
      specStrict: true,
      stages: [{ stage_id: "build", executor: "codex", model: "gpt-5-codex", role: "producer" }],
    });
    await runCliOk(["pack", "link", pkgA], { sandbox: sbGraceful });

    const rpcA = trackRpc(await connectRpcClient({ sessionPath: sbGraceful.sessionPath, clientKind: "opl_app" }));
    const createdA = await rpcA.call("runway.task.create", {
      workspace_id: wsA,
      agent_id: "mas",
      title: "Graceful Timeout",
      goal_prompt: "Timeout SIGTERM",
      timeout_ms: 500,
    });
    const taskIdA = extractTaskId(createdA);
    await rpcA.call("runway.stage.start", {
      task_id: taskIdA,
      stage_id: "build",
      executor_id: "codex",
      model_id: "gpt-5-codex",
      role: "producer",
      timeout_ms: 500,
    });

    const sigTermEv = await waitForStubLogEvent(
      sbGraceful.stubLogDir,
      "codex",
      (e) => e.event === "signal" && e.signal === "SIGTERM",
      { timeoutMs: 8000 }
    );
    assert.equal(sigTermEv.signal, "SIGTERM");

    const timedOutA = await waitForDbState(
      sbGraceful.dbPath,
      (db) => {
        const sr = getStageRuns(db, taskIdA)[0];
        const att = sr ? getAttempts(db, sr.stage_run_id)[0] : null;
        return att?.status === "timed_out" ? att : null;
      },
      { timeoutMs: 8000, pollMs: 80 }
    );
    assert.equal(isPidAlive(timedOutA.local_pid), false);
    await rpcA.close();
    await sbGraceful.cleanup();

    // Part B: OPL_STUB_IGNORE_SIGTERM=1 forces 10s SIGKILL escalation -> timed_out
    const sbKill = makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_MODE: "hang",
        OPL_STUB_IGNORE_SIGTERM: "1",
        OPL_RUNWAY_ATTEMPT_TIMEOUT_MS: "500",
      },
    });
    await sbKill.startDaemon();

    const wsB = extractWorkspaceId(
      await runCliJson(["workspace", "init", sbKill.workspaceDir, "--name", "SIGKILL Escalation WS"], { sandbox: sbKill })
    );
    const pkgB = path.join(sbKill.root, "pkg-timeout-b");
    buildV2Package(pkgB, {
      intent: "agent",
      id: "mas",
      specStrict: true,
      stages: [{ stage_id: "build", executor: "codex", model: "gpt-5-codex", role: "producer" }],
    });
    await runCliOk(["pack", "link", pkgB], { sandbox: sbKill });

    const rpcB = trackRpc(await connectRpcClient({ sessionPath: sbKill.sessionPath, clientKind: "opl_app" }));
    const createdB = await rpcB.call("runway.task.create", {
      workspace_id: wsB,
      agent_id: "mas",
      title: "SIGKILL Timeout",
      goal_prompt: "Ignore SIGTERM",
      timeout_ms: 500,
    });
    const taskIdB = extractTaskId(createdB);
    const tStart = Date.now();
    await rpcB.call("runway.stage.start", {
      task_id: taskIdB,
      stage_id: "build",
      executor_id: "codex",
      model_id: "gpt-5-codex",
      role: "producer",
      timeout_ms: 500,
    });

    const timedOutB = await waitForDbState(
      sbKill.dbPath,
      (db) => {
        const sr = getStageRuns(db, taskIdB)[0];
        const att = sr ? getAttempts(db, sr.stage_run_id)[0] : null;
        return att?.status === "timed_out" ? att : null;
      },
      { timeoutMs: 20_000, pollMs: 150 }
    );
    const elapsedMs = Date.now() - tStart;
    assert.equal(isPidAlive(timedOutB.local_pid), false, "Stub ignoring SIGTERM must be killed by SIGKILL escalation");
    assert.ok(elapsedMs >= 9000, `Expected ~10s grace window before SIGKILL, elapsed=${elapsedMs}ms`);

    const dbB = openTrackedDb(sbKill.dbPath, { readOnly: true });
    const entries = getLedgerEntries(dbB, taskIdB);
    assert.ok(
      entries.some((e) => e.entry_kind === "failed_path_note" || e.entry_kind === "typed_blocker"),
      `Expected timeout ledger record for ${taskIdB}, got: ${JSON.stringify(entries)}`
    );
    dbB.close();
  });

  it("T2-F11-05: session resume passes codex exec resume <threadId> and agy --conversation <convId> preserving session refs", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsId = extractWorkspaceId(
      await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Resume WS"], { sandbox: sb })
    );
    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));

    // 1. Codex attempt 1 + resumed attempt 2
    const codexTaskId = extractTaskId(
      await rpc.call("runway.task.create", {
        workspace_id: wsId,
        agent_id: "mas",
        title: "Codex Resume",
        goal_prompt: "Resume thread",
      })
    );
    await rpc.call("runway.stage.start", {
      task_id: codexTaskId,
      stage_id: "build",
      executor_id: "codex",
      model_id: "gpt-5-codex",
      role: "producer",
    });

    const codexAtt1 = await waitForDbState(
      sb.dbPath,
      (db) => {
        const sr = getStageRuns(db, codexTaskId)[0];
        const att = sr ? getAttempts(db, sr.stage_run_id)[0] : null;
        return att?.status === "succeeded" && att.executor_session_ref ? att : null;
      },
      { timeoutMs: 8000, pollMs: 60 }
    );
    const threadId1 = codexAtt1.executor_session_ref;

    await rpc.call("runway.stage.start", {
      task_id: codexTaskId,
      stage_id: "build",
      executor_id: "codex",
      model_id: "gpt-5-codex",
      role: "repairer",
      resume_session_ref: threadId1,
    });

    await waitForDbState(
      sb.dbPath,
      (db) => {
        const logs = readStubLogs(sb, "codex");
        const resumed = logs.find((e) => e.event === "invocation" && e.subcommand === "exec_resume");
        return resumed ? resumed : null;
      },
      { timeoutMs: 8000, pollMs: 60 }
    );

    const codexResumeInv = readStubLogs(sb, "codex").find(
      (e) => e.event === "invocation" && e.subcommand === "exec_resume"
    );
    assert.ok(codexResumeInv, "Expected codex exec_resume invocation");
    assert.ok(codexResumeInv.argv.includes("resume"));
    assert.ok(codexResumeInv.argv.includes(threadId1));
    assert.equal(codexResumeInv.threadId, threadId1);

    // 2. Antigravity attempt 1 + resumed attempt 2
    const agyTaskId = extractTaskId(
      await rpc.call("runway.task.create", {
        workspace_id: wsId,
        agent_id: "mas",
        title: "Agy Resume",
        goal_prompt: "Resume conv",
      })
    );
    await rpc.call("runway.stage.start", {
      task_id: agyTaskId,
      stage_id: "analyze",
      executor_id: "antigravity",
      model_id: "gemini-4-neon-high",
      role: "producer",
    });

    const agyAtt1 = await waitForDbState(
      sb.dbPath,
      (db) => {
        const sr = getStageRuns(db, agyTaskId)[0];
        const att = sr ? getAttempts(db, sr.stage_run_id)[0] : null;
        return att?.status === "succeeded" && att.executor_session_ref ? att : null;
      },
      { timeoutMs: 8000, pollMs: 60 }
    );
    const convId1 = agyAtt1.executor_session_ref;

    await rpc.call("runway.stage.start", {
      task_id: agyTaskId,
      stage_id: "analyze",
      executor_id: "antigravity",
      model_id: "gemini-4-neon-high",
      role: "repairer",
      resume_session_ref: convId1,
    });

    const agyResumeInv = await waitForDbState(
      sb.dbPath,
      () => {
        const logs = readStubLogs(sb, "agy");
        return logs.find((e) => e.event === "invocation" && e.parsed?.conversation === convId1) ?? null;
      },
      { timeoutMs: 8000, pollMs: 60 }
    );
    assert.equal(agyResumeInv.parsed.conversation, convId1);
    assert.equal(agyResumeInv.convId, convId1);
  });
});
