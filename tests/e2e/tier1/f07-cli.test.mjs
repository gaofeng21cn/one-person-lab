import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { assertCoreCliHelp, runCliExpectCode, runCliJson, runCliOk } from "../lib/cli.mjs";
import { buildV2Package } from "../lib/fixtures.mjs";
import { connectRpcClient } from "../lib/rpc-client.mjs";
import { createSandbox } from "../lib/sandbox.mjs";
import { openOplDb, txImmediate } from "../lib/sqlite-inspector.mjs";

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

const RETIRED_NAMESPACES = [
  "agents",
  "system",
  "vault",
  "brand-modules",
  "stagecraft",
  "family-runtime",
  "cordis",
  "okf",
  "domain-memory",
  "work-order",
  "agent-lab",
  "foundry-lab",
  "scholar-skills",
  "profiles",
];

describe("Tier 1 F7: opl CLI Surface & Exit Codes", () => {
  it("T1-F7-01: opl --help displays the v2 core namespaces and their supported commands", async () => {
    const sb = makeSandbox();

    const ver = await runCliOk(["--version"], { sandbox: sb });
    assert.match(ver.stdout, /\d+\.\d+\.\d+/, `Expected SemVer in --version output, got: ${ver.stdout}`);

    const help = await runCliOk(["--help"], { sandbox: sb });
    assertCoreCliHelp(help.stdout);
    assert.doesNotMatch(help.stdout, /^\s*(?:opl\s+)?foundry(?:[:\s]|$)/m, "Foundry requires its package");
    for (const legacy of RETIRED_NAMESPACES) {
      assert.doesNotMatch(
        help.stdout,
        new RegExp(`^\\s*(?:opl\\s+)?${legacy}(?:\\s|$)`, "m"),
        `Retired legacy namespace '${legacy}' must not appear in opl --help`
      );
    }
  });

  it("T1-F7-02: opl daemon status --json outputs valid machine-parseable JSON and exits 0", async () => {
    const sb = makeSandbox();

    await runCliOk(["daemon", "start", "--detached"], { sandbox: sb });
    const session = await sb.waitForDaemonReady();

    const status = await runCliJson(["daemon", "status"], { sandbox: sb });
    const isRunning = status.running === true || status.status === "running" || status.ok === true;
    assert.equal(isRunning, true, `Expected live daemon status, got: ${JSON.stringify(status)}`);
    assert.equal(status.pid, session.pid, "daemon status pid must match opld.session.json pid");

    const reportedSock = status.socket_path ?? status.sockPath;
    assert.ok(typeof reportedSock === "string" && reportedSock.length > 0, "Expected socket_path in daemon status JSON");
    assert.equal(
      fs.realpathSync(reportedSock),
      fs.realpathSync(sb.sockPath),
      "daemon status socket_path must match sandbox sockPath"
    );

    await runCliOk(["daemon", "stop"], { sandbox: sb });
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && fs.existsSync(sb.sockPath)) {
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(fs.existsSync(sb.sockPath), false, "Expected opl daemon stop to remove opld.sock");
  });

  it("T1-F7-03: opl pack list --quiet suppresses decorative output and exits 0", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const pkgDir = path.join(sb.root, "quiet-probe-pkg");
    buildV2Package(pkgDir, { id: "quiet-probe", intent: "agent", specStrict: true });
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });

    const defaultRes = await runCliOk(["pack", "list"], { sandbox: sb });
    const quietRes = await runCliOk(["pack", "list", "--quiet"], { sandbox: sb });
    const jsonOut = await runCliJson(["pack", "list"], { sandbox: sb });

    assert.doesNotMatch(
      quietRes.stdout,
      /\x1b\[|[┌─└│┐┘├┤┬┴┼═║╔╗╚╝]/,
      "Expected --quiet output to omit ANSI escapes and decorative box drawing"
    );
    assert.ok(quietRes.stdout.includes("quiet-probe"), `Expected quiet output to mention quiet-probe, got:\n${quietRes.stdout}`);
    assert.ok(
      quietRes.stdout.length <= defaultRes.stdout.length,
      `Expected --quiet output length (${quietRes.stdout.length}) <= default output length (${defaultRes.stdout.length})`
    );

    const list = Array.isArray(jsonOut) ? jsonOut : jsonOut.packages ?? jsonOut.items ?? [];
    assert.ok(
      list.some((item) => (item.package_id ?? item.id) === "quiet-probe"),
      `Expected --json pack list to contain quiet-probe, got: ${JSON.stringify(jsonOut)}`
    );
  });

  it("T1-F7-04: opl workspace list --json and opl ledger timeline <task> --json return structured JSON and exit 0", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "cli-ws"], { sandbox: sb });
    const workspaceId = wsInit.workspace_id ?? wsInit.workspaceId ?? wsInit.workspace?.workspace_id ?? wsInit.id;
    assert.ok(typeof workspaceId === "string" && workspaceId.length > 0, `Expected workspace_id, got: ${JSON.stringify(wsInit)}`);

    let taskId = `task-cli-${Date.now()}`;
    const rpc = await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_cli" });
    try {
      let taskCreatedViaRpc = false;
      let ledgerAppendedViaRpc = false;
      try {
        const created = await rpc.call("runway.task.create", {
          workspace_id: workspaceId,
          agent_id: "mas",
          title: "CLI Timeline Probe",
          goal_prompt: "Verify ledger timeline",
        });
        taskId = created.task_id ?? created.taskId ?? created.task?.task_id ?? taskId;
        taskCreatedViaRpc = true;
      } catch (err) {
        if (err?.code !== -32601) throw err;
      }

      if (taskCreatedViaRpc) {
        try {
          await rpc.call("ledger.append", {
            task_id: taskId,
            entry_kind: "artifact_ref",
            owner_id: "mas",
            payload: { path: "notes/report.md", sha256: "e3b0c44298fc1c149afbf4c8996fb924" },
          });
          ledgerAppendedViaRpc = true;
        } catch (err) {
          if (err?.code !== -32601) throw err;
        }
      }

      if (!taskCreatedViaRpc || !ledgerAppendedViaRpc) {
        const db = openOplDb(sb.dbPath);
        try {
          const ts = new Date().toISOString();
          txImmediate(db, () => {
            if (!taskCreatedViaRpc) {
              db.prepare(
                "INSERT OR IGNORE INTO tasks (task_id, workspace_id, agent_id, title, goal_prompt, status, revision, created_at, updated_at) VALUES (?, ?, 'mas', 'CLI Timeline Probe', 'Verify ledger timeline', 'active', 1, ?, ?)"
              ).run(taskId, workspaceId, ts, ts);
            }
            if (!ledgerAppendedViaRpc) {
              db.prepare(
                "INSERT INTO ledger_entries (entry_id, task_id, stage_run_id, attempt_id, entry_kind, owner_id, payload_json, created_at) VALUES (?, ?, NULL, NULL, 'artifact_ref', 'mas', ?, ?)"
              ).run(
                `le-${Date.now()}`,
                taskId,
                JSON.stringify({ path: "notes/report.md", sha256: "e3b0c44298fc1c149afbf4c8996fb924" }),
                ts
              );
            }
          });
        } finally {
          db.close();
        }
      }
    } finally {
      await rpc.close();
    }

    const wsList = await runCliJson(["workspace", "list"], { sandbox: sb });
    const workspaces = Array.isArray(wsList) ? wsList : wsList.workspaces ?? wsList.items ?? [];
    assert.ok(
      workspaces.some(
        (w) =>
          (w.workspace_id ?? w.workspaceId ?? w.id) === workspaceId &&
          fs.realpathSync(w.root_path ?? w.rootPath) === fs.realpathSync(sb.workspaceDir)
      ),
      `Expected workspace '${workspaceId}' in workspace list: ${JSON.stringify(wsList)}`
    );

    const timeline = await runCliJson(["ledger", "timeline", taskId], { sandbox: sb });
    const entries = Array.isArray(timeline) ? timeline : timeline.entries ?? timeline.timeline ?? timeline.items ?? [];
    assert.ok(
      entries.some((e) => (e.task_id ?? e.taskId) === taskId && (e.entry_kind ?? e.entryKind) === "artifact_ref"),
      `Expected artifact_ref entry for '${taskId}' in timeline: ${JSON.stringify(timeline)}`
    );
  });

  it("T1-F7-05: opl runway status <paused_task> --json reports paused_by_human and exits 4", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "pause-ws"], { sandbox: sb });
    const workspaceId = wsInit.workspace_id ?? wsInit.workspaceId ?? wsInit.workspace?.workspace_id ?? wsInit.id;

    let taskId = `task-paused-${Date.now()}`;
    const db = openOplDb(sb.dbPath);
    try {
      const ts = new Date().toISOString();
      txImmediate(db, () => {
        db.prepare(
          "INSERT INTO tasks (task_id, workspace_id, agent_id, title, goal_prompt, status, revision, created_at, updated_at) VALUES (?, ?, 'mas', 'Paused Task', 'Hold for human', 'paused_by_human', 1, ?, ?)"
        ).run(taskId, workspaceId, ts, ts);
        db.prepare(
          "INSERT INTO stage_runs (stage_run_id, task_id, stage_id, seq_no, status, executor_id, model_id, human_gate_json, revision, started_at, finished_at, updated_at) VALUES (?, ?, 'analysis', 1, 'paused_by_human', 'codex', 'gpt-5-codex', NULL, 1, ?, NULL, ?)"
        ).run(`sr-${Date.now()}`, taskId, ts, ts);
      });
    } finally {
      db.close();
    }

    const res = await runCliExpectCode(["runway", "status", taskId, "--json"], 4, { sandbox: sb });
    assert.ok(res.json !== null, `Expected valid JSON stdout on exit 4, got:\n${res.stdout}`);
    const status = res.json.status ?? res.json.task?.status;
    assert.equal(status, "paused_by_human", `Expected paused_by_human status, got: ${JSON.stringify(res.json)}`);
  });
});
