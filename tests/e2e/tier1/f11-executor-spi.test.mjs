import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCliJson, runCliOk } from "../lib/cli.mjs";
import { buildV2Package } from "../lib/fixtures.mjs";
import { connectRpcClient } from "../lib/rpc-client.mjs";
import { createSandbox } from "../lib/sandbox.mjs";
import {
  assertLedgerRefsOnly,
  getAttempts,
  getStageRuns,
  getTask,
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

function findCodexSessionFiles(codexHome, threadId) {
  const sessionsRoot = path.join(codexHome, "sessions");
  if (!fs.existsSync(sessionsRoot)) return [];
  const matches = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && ent.name.endsWith(`${threadId}.jsonl`)) matches.push(full);
    }
  }
  walk(sessionsRoot);
  return matches;
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

describe("Tier 1 F11: Dual ExecutorSPI (Codex & Antigravity) & Cross-Stage Relay", () => {
  it("T1-F11-01: opl runway executors & RPC list/health report codex (0.171.0) and antigravity (1.5.16) without LLM execution", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const cliList = await runCliJson(["runway", "executors"], { sandbox: sb });
    const cliSerialized = JSON.stringify(cliList);
    assert.match(cliSerialized, /codex/);
    assert.match(cliSerialized, /antigravity/);

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const rpcList = await rpc.call("runway.executors.list", {});
    const rpcHealth = await rpc.call("runway.executors.health", {});

    const listArr = Array.isArray(rpcList) ? rpcList : rpcList.executors ?? rpcList.items ?? [];
    const healthArr = Array.isArray(rpcHealth)
      ? rpcHealth
      : rpcHealth.executors ?? rpcHealth.health ?? Object.values(rpcHealth || {});

    const findExec = (arr, id) => arr.find((e) => (e?.id ?? e?.executor_id ?? e?.executorId) === id);
    const codexInfo = findExec(healthArr, "codex") ?? findExec(listArr, "codex");
    const agyInfo = findExec(healthArr, "antigravity") ?? findExec(listArr, "antigravity");

    assert.ok(codexInfo, `Expected codex executor metadata in: ${JSON.stringify({ rpcList, rpcHealth })}`);
    assert.ok(agyInfo, `Expected antigravity executor metadata in: ${JSON.stringify({ rpcList, rpcHealth })}`);
    assert.equal(codexInfo.available ?? codexInfo.healthy, true);
    assert.equal(agyInfo.available ?? agyInfo.healthy, true);
    assert.match(JSON.stringify(codexInfo), /0\.171\.0/);
    assert.match(JSON.stringify(agyInfo), /1\.5\.16/);
    assert.match(JSON.stringify({ rpcList, rpcHealth, cliList }), /gemini-4-neon-(xhigh|high)/);

    const codexExecs = readStubLogs(sb, "codex").filter((e) => e.subcommand === "exec" || e.subcommand === "exec_resume");
    const agyPrints = readStubLogs(sb, "agy").filter((e) => e.subcommand === "print");
    assert.equal(codexExecs.length, 0, "Executor discovery/healthCheck must never invoke codex exec");
    assert.equal(agyPrints.length, 0, "Executor discovery/healthCheck must never invoke agy --print");
  });

  it("T1-F11-02: codex ExecutorAdapter executes --json --cd --sandbox workspace-write, records session, usage, and session JSONL", async () => {
    const sb = makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_ARTIFACTS_JSON: JSON.stringify([{ path: "figures/out.txt", content: "codex artifact ok\n" }]),
      },
    });
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Codex Exec WS"], { sandbox: sb });
    const wsId = extractWorkspaceId(wsInit);

    const pkgDir = path.join(sb.root, "pkg-codex");
    buildV2Package(pkgDir, {
      intent: "agent",
      id: "mas",
      specStrict: true,
      stages: [{ stage_id: "build", executor: "codex", model: "gpt-5-codex", role: "producer" }],
    });
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Codex Stage", "--goal", "Write figure"],
      { sandbox: sb }
    );
    const taskId = extractTaskId(startRes);

    const done = await waitForDbState(
      sb.dbPath,
      (db) => {
        const t = getTask(db, taskId);
        if (t?.status !== "completed") return null;
        const sr = getStageRuns(db, taskId)[0];
        const att = getAttempts(db, sr.stage_run_id)[0];
        return { t, sr, att };
      },
      { timeoutMs: 10_000, pollMs: 80 }
    );

    assert.equal(done.sr.status, "completed");
    assert.equal(done.att.status, "succeeded");
    assert.ok(typeof done.att.executor_session_ref === "string" && done.att.executor_session_ref.length > 0);
    const usage = JSON.parse(done.att.usage_json);
    assert.equal(usage.input_tokens, 1200);
    assert.equal(usage.output_tokens, 450);
    assert.equal(usage.cached_tokens ?? usage.cached_input_tokens, 200);

    const inv = readStubLogs(sb, "codex").find((e) => e.event === "invocation" && e.subcommand === "exec");
    assert.ok(inv, "Expected codex exec invocation log");
    assert.equal(inv.parsed.json, true);
    assert.equal(fs.realpathSync(inv.parsed.cd ?? inv.cwd), fs.realpathSync(sb.workspaceDir));
    assert.equal(inv.parsed.sandboxMode, "workspace-write");
    assert.equal(inv.parsed.model, "gpt-5-codex");
    assert.equal(inv.threadId, done.att.executor_session_ref);

    assert.equal(fs.readFileSync(path.join(sb.workspaceDir, "figures/out.txt"), "utf8"), "codex artifact ok\n");
    const sessionFiles = findCodexSessionFiles(sb.codexHome, done.att.executor_session_ref);
    assert.ok(sessionFiles.length >= 1, `Expected rollout JSONL for ${done.att.executor_session_ref} in ${sb.codexHome}`);
  });

  it("T1-F11-03: antigravity ExecutorAdapter executes agy --print --output-format stream-json and records session + usage", async () => {
    const sb = makeSandbox({
      stubEnv: {
        OPL_STUB_AGY_ARTIFACTS_JSON: JSON.stringify([{ path: "analysis/notes.md", content: "agy artifact ok\n" }]),
      },
    });
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Agy Exec WS"], { sandbox: sb });
    const wsId = extractWorkspaceId(wsInit);

    const pkgDir = path.join(sb.root, "pkg-agy");
    buildV2Package(pkgDir, {
      intent: "agent",
      id: "mas",
      specStrict: true,
      stages: [{ stage_id: "analyze", executor: "antigravity", model: "gemini-4-neon-high", role: "producer" }],
    });
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Agy Stage", "--goal", "Analyze notes"],
      { sandbox: sb }
    );
    const taskId = extractTaskId(startRes);

    const done = await waitForDbState(
      sb.dbPath,
      (db) => {
        const t = getTask(db, taskId);
        if (t?.status !== "completed") return null;
        const sr = getStageRuns(db, taskId)[0];
        const att = getAttempts(db, sr.stage_run_id)[0];
        return { t, sr, att };
      },
      { timeoutMs: 10_000, pollMs: 80 }
    );

    assert.equal(done.sr.status, "completed");
    assert.equal(done.att.status, "succeeded");
    assert.ok(typeof done.att.executor_session_ref === "string" && done.att.executor_session_ref.startsWith("ag-conv-"));
    const usage = JSON.parse(done.att.usage_json);
    assert.equal(usage.input_tokens, 1800);
    assert.equal(usage.output_tokens, 650);

    const inv = readStubLogs(sb, "agy").find((e) => e.event === "invocation" && e.subcommand === "print");
    assert.ok(inv, "Expected agy --print invocation log");
    assert.equal(inv.parsed.outputFormat, "stream-json");
    assert.equal(inv.parsed.model, "gemini-4-neon-high");
    assert.equal(inv.parsed.effort, "high");
    assert.equal(inv.parsed.mode, "accept-edits");
    assert.equal(inv.parsed.sandbox, true);

    // Account for agy:273 (parsed.addDirs[0] || process.cwd())
    const artifactRoot = inv.parsed.addDirs?.length > 0 ? path.resolve(inv.parsed.addDirs[0]) : sb.workspaceDir;
    assert.equal(fs.readFileSync(path.join(artifactRoot, "analysis/notes.md"), "utf8"), "agy artifact ok\n");
    assert.equal(fs.realpathSync(artifactRoot), fs.realpathSync(sb.workspaceDir));
  });

  it("T1-F11-04: reviewer role enforces agy --mode plan --sandbox and codex --sandbox read-only with zero workspace writes", async () => {
    const sb = makeSandbox({
      stubEnv: {
        OPL_STUB_AGY_MODE: "read_only_check",
        OPL_STUB_CODEX_MODE: "read_only_check",
        OPL_STUB_DEFAULT_ARTIFACT: "0",
      },
    });
    fs.writeFileSync(path.join(sb.workspaceDir, "seed.txt"), "immutable seed\n", "utf8");
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Reviewer RO WS"], { sandbox: sb });
    const wsId = extractWorkspaceId(wsInit);

    const pkgDir = path.join(sb.root, "pkg-reviewer");
    buildV2Package(pkgDir, {
      intent: "agent",
      id: "mas",
      specStrict: true,
      stages: [
        { stage_id: "agy_review", executor: "antigravity", model: "gemini-4-neon-xhigh", role: "reviewer" },
        { stage_id: "codex_review", executor: "codex", model: "gpt-5-codex", role: "reviewer" },
      ],
    });
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Read Only Review", "--goal", "Audit seed"],
      { sandbox: sb }
    );
    const taskId = extractTaskId(startRes);

    const done = await waitForDbState(
      sb.dbPath,
      (db) => {
        const t = getTask(db, taskId);
        if (t?.status !== "completed") return null;
        const stages = getStageRuns(db, taskId);
        if (stages.length < 2) return null;
        return {
          t,
          stages,
          att1: getAttempts(db, stages[0].stage_run_id)[0],
          att2: getAttempts(db, stages[1].stage_run_id)[0],
        };
      },
      { timeoutMs: 12_000, pollMs: 80 }
    );

    assert.equal(done.att1.status, "succeeded");
    assert.equal(done.att2.status, "succeeded");

    const agyInv = readStubLogs(sb, "agy").find((e) => e.event === "invocation" && e.subcommand === "print");
    assert.ok(agyInv);
    assert.equal(agyInv.parsed.mode, "plan");
    assert.equal(agyInv.parsed.sandbox, true);
    assert.equal(agyInv.parsed.effort, "xhigh");

    const codexInv = readStubLogs(sb, "codex").find((e) => e.event === "invocation" && e.subcommand === "exec");
    assert.ok(codexInv);
    assert.equal(codexInv.parsed.sandboxMode, "read-only");

    assert.deepEqual(fs.readdirSync(sb.workspaceDir), ["seed.txt"]);
    assert.equal(fs.readFileSync(path.join(sb.workspaceDir, "seed.txt"), "utf8"), "immutable seed\n");
  });

  it("T1-F11-05: cross-stage relay hands off Stage 1 (antigravity) to Stage 2 (codex) via Workspace + Ledger without private session leak", async () => {
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
          artifacts: [{ path: "analysis/plan.md", content: "# Relay Plan\nProduce figures/fig1.svg\n" }],
          response_text: "Stage 1 complete: wrote analysis/plan.md",
        },
      },
      {
        tool: "codex",
        subcommand: "exec",
        once: true,
        config: {
          mode: "success",
          artifacts: [{ path: "figures/fig1.svg", content: "<svg xmlns='http://www.w3.org/2000/svg'/>\n" }],
          response_text: "Stage 2 complete: wrote figures/fig1.svg",
        },
      },
    ]);
    await sb.startDaemon({ env: { OPL_STUB_RULES_FILE: rulesPath } });

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Relay WS"], { sandbox: sb });
    const wsId = extractWorkspaceId(wsInit);

    const pkgDir = path.join(sb.root, "pkg-relay-stages");
    buildV2Package(pkgDir, {
      intent: "agent",
      id: "mas",
      specStrict: true,
      stages: [
        { stage_id: "plan", executor: "antigravity", model: "gemini-4-neon-high", role: "producer" },
        { stage_id: "render", executor: "codex", model: "gpt-5-codex", role: "producer" },
      ],
    });
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Cross-Stage Relay", "--goal", "Plan then render"],
      { sandbox: sb }
    );
    const taskId = extractTaskId(startRes);

    const done = await waitForDbState(
      sb.dbPath,
      (db) => {
        const t = getTask(db, taskId);
        if (t?.status !== "completed") return null;
        const stages = getStageRuns(db, taskId);
        if (stages.length !== 2) return null;
        if (stages.some((s) => s.status !== "completed")) return null;
        return { t, stages };
      },
      { timeoutMs: 12_000, pollMs: 80 }
    );

    assert.equal(done.stages[0].executor_id, "antigravity");
    assert.equal(done.stages[1].executor_id, "codex");

    const agyInv = readStubLogs(sb, "agy").find((e) => e.event === "invocation" && e.subcommand === "print");
    const codexInv = readStubLogs(sb, "codex").find((e) => e.event === "invocation" && e.subcommand === "exec");
    assert.ok(agyInv && codexInv);

    const codexPromptPayload = `${JSON.stringify(codexInv.argv)} ${codexInv.stdin_preview || ""}`;
    assert.equal(
      codexPromptPayload.includes(agyInv.convId),
      false,
      `Stage 2 codex must NOT receive Stage 1 antigravity private session ref (${agyInv.convId})`
    );
    assert.ok(
      codexPromptPayload.includes("analysis/plan.md"),
      `Stage 2 codex prompt must receive Stage 1 Workspace/Ledger artifact ref (analysis/plan.md), got: ${codexPromptPayload}`
    );

    const agyRoot = agyInv.parsed.addDirs?.length > 0 ? path.resolve(agyInv.parsed.addDirs[0]) : sb.workspaceDir;
    assert.equal(fs.existsSync(path.join(agyRoot, "analysis/plan.md")), true);
    assert.equal(fs.existsSync(path.join(sb.workspaceDir, "figures/fig1.svg")), true);

    const timeline = await runCliJson(["ledger", "timeline", taskId], { sandbox: sb });
    const entries = Array.isArray(timeline) ? timeline : timeline.entries ?? timeline.timeline ?? timeline.items ?? [];
    assert.ok(entries.length >= 2);
    const verifyOut = await runCliJson(["ledger", "verify", taskId], { sandbox: sb });
    assert.equal(verifyOut.ok, true);

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    assertLedgerRefsOnly(db, taskId);
    db.close();
  });
});
