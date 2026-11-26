import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, it } from "node:test";

import { DEFAULT_REPO_ROOT, runCli, runCliJson, runCliOk } from "../lib/cli.mjs";
import { buildV2Package } from "../lib/fixtures.mjs";
import { connectRpcClient } from "../lib/rpc-client.mjs";
import { createSandbox } from "../lib/sandbox.mjs";

const activeSandboxes = [];

function trackSandbox(opts = {}) {
  const sb = createSandbox(opts);
  activeSandboxes.push(sb);
  return sb;
}

afterEach(async () => {
  while (activeSandboxes.length > 0) {
    await activeSandboxes.pop().cleanup();
  }
});

describe("Tier 5 Partition 1: Real opld + Python OplClient Adversarial E2E", () => {
  it("T5-E2E-P1-01: failing executor with >2048-char secret stderr converges cleanly to human_gate with zero secret leak", async () => {
    const sb = trackSandbox();
    const failCodex = path.join(sb.root, "fail-codex");
    fs.writeFileSync(
      failCodex,
      [
        "#!/usr/bin/env node",
        "if (process.argv.includes('--version')) { process.stdout.write('codex-cli 0.171.0\\n'); process.exit(0); }",
        "if (process.argv[2] === 'app-server') { process.stdin.resume(); process.exit(0); }",
        "const leak = 'sk-ant-api03-secretleak1234567890_abcdefghijklmnop ' + 'Z'.repeat(3000);",
        "process.stderr.write(leak + '\\n');",
        "process.exit(1);",
      ].join("\n"),
      { mode: 0o755 }
    );
    sb.env.OPL_CODEX_BIN = failCodex;
    await sb.startDaemon();

    const pkg = buildV2Package(path.join(sb.root, "agent-fail"), {
      id: "agent-fail",
      intent: "agent",
      specStrict: true,
      stages: [{ stage_id: "build", executor: "codex", model: "gpt-5-codex", role: "producer" }],
    });
    await runCliOk(["pack", "link", pkg.dir, "--no-codex-sync"], { sandbox: sb });
    const ws = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Fail WS"], { sandbox: sb });
    const wsId = ws.workspace_id ?? ws.id;

    const started = await runCli(["runway", "start", "--workspace", wsId, "--agent", "agent-fail", "--title", "Fail Big", "--goal", "Handle big secret err", "--json"], {
      sandbox: sb,
    });
    assert.ok(started.code === 0 || started.code === 4);
    const taskId = started.json.task_id;
    assert.ok(taskId);

    const deadline = Date.now() + 8000;
    let taskStatus = "";
    let stageStatus = "";
    while (Date.now() < deadline) {
      const db = new DatabaseSync(sb.dbPath, { readOnly: true });
      const tRow = db.prepare("SELECT status FROM tasks WHERE task_id = ?").get(taskId);
      const sRow = db.prepare("SELECT status FROM stage_runs WHERE task_id = ?").get(taskId);
      db.close();
      taskStatus = tRow?.status ?? "";
      stageStatus = sRow?.status ?? "";
      if (stageStatus === "human_gate" && taskStatus === "awaiting_human") break;
      await new Promise((r) => setTimeout(r, 50));
    }

    assert.equal(stageStatus, "human_gate", "Stage must converge to human_gate, never wedge in running");
    assert.equal(taskStatus, "awaiting_human");

    const db = new DatabaseSync(sb.dbPath, { readOnly: true });
    const entries = db.prepare("SELECT entry_kind, payload_json FROM ledger_entries WHERE task_id = ?").all(taskId);
    const att = db.prepare("SELECT status FROM attempts WHERE stage_run_id IN (SELECT stage_run_id FROM stage_runs WHERE task_id = ?)").get(taskId);
    db.close();

    assert.equal(att?.status, "failed");
    const serialized = JSON.stringify(entries);
    assert.equal(serialized.includes("sk-ant-api03-"), false, "Ledger must redact secret tokens from stderr");
    assert.ok(entries.some((e) => e.entry_kind === "typed_blocker"));
    assert.ok(entries.some((e) => e.entry_kind === "failed_path_note"));
  });

  it("T5-E2E-P1-02: Python OplClient handles >128KB multi-byte UTF-8 ledger_timeline + interleaved Server-Push against live opld", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const ws = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Py Big WS"], { sandbox: sb });
    const wsId = ws.workspace_id ?? ws.id;
    const appRpc = await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" });
    const task = await appRpc.call("runway.task.create", {
      workspace_id: wsId,
      title: "Big UTF8 Timeline",
      goal_prompt: "Python client stress",
    });
    const taskId = task.task_id;
    await appRpc.close();

    const pySdkPath = path.join(DEFAULT_REPO_ROOT, "sdks/python-client/src");
    const pyScript = [
      "import json, os, sys",
      "from opl_client import OplClient",
      "task_id = sys.argv[1]",
      "with OplClient(session_file=os.environ['OPL_SESSION'], timeout=15.0) as cli:",
      "    cli.subscribe_events(['event.ledger.appended'])",
      "    chunk = '中文验证🚀' * 250",
      "    for i in range(100):",
      "        cli.append_ledger(task_id, 'failed_path_note', 'mas', {'stage_id': 's1', 'executor_id': 'codex', 'error_code': 'NOTE', 'summary': f'{i}:{chunk}'})",
      "    tl = cli.ledger_timeline(task_id, limit=200)",
      "    evs = cli.drain_events('event.ledger.')",
      "    raw_bytes = len(json.dumps(tl, ensure_ascii=False).encode('utf-8'))",
      "    assert raw_bytes > 128 * 1024, f'Expected >128KB timeline, got {raw_bytes}'",
      "    entries = tl.get('entries', []) if isinstance(tl, dict) else tl",
      "    assert len(entries) >= 100, f'Expected >=100 entries, got {len(entries)}'",
      "    assert len(evs) >= 1, f'Expected >=1 event, got {len(evs)}'",
      "    print(json.dumps({'ok': True, 'bytes': raw_bytes, 'entries': len(entries), 'events': len(evs)}))",
    ].join("\n");

    const pyRes = spawnSync("python3", ["-B", "-c", pyScript, taskId], {
      env: { ...sb.env, PYTHONPATH: pySdkPath, OPL_SESSION: sb.sessionPath, PYTHONDONTWRITEBYTECODE: "1" },
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(pyRes.status, 0, `Python E2E failed:\nSTDOUT:\n${pyRes.stdout}\nSTDERR:\n${pyRes.stderr}`);
    const out = JSON.parse(pyRes.stdout.trim());
    assert.equal(out.ok, true);
    assert.ok(out.bytes > 128 * 1024);
  });
});
