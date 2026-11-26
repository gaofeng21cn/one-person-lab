import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCliExpectCode, runCliJson, runCliOk } from "../lib/cli.mjs";
import {
  buildConnectPair,
  buildObsidianVaultDir,
  buildV2Package,
  computeContentLock,
  createLocalPackageArchive,
} from "../lib/fixtures.mjs";
import { auditPythonStdlibAndBudget } from "../lib/redline-audit.mjs";
import { connectRpcClient } from "../lib/rpc-client.mjs";
import { DEFAULT_WORKTREE_ROOT, createSandbox } from "../lib/sandbox.mjs";
import {
  assertLedgerRefsOnly,
  assertNoRawKnowledgeContentInDb,
  getInstalledPackage,
  getKnowledgeSnapshots,
  getLedgerEntries,
  openOplDb,
} from "../lib/sqlite-inspector.mjs";

const PYTHON_CLIENT_DIR = path.resolve(
  process.env.OPL_PYTHON_CLIENT_DIR || path.join(DEFAULT_WORKTREE_ROOT, "sdks", "python-client")
);
const FOUNDRY_DIR = path.resolve(
  process.env.OPL_FOUNDRY_DIR || path.join(DEFAULT_WORKTREE_ROOT, "extensions", "foundry")
);

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

function copyDirClean(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (
      ent.name === "node_modules" ||
      ent.name === ".git" ||
      ent.name === "opl-release.lock.json" ||
      ent.name.endsWith(".tsbuildinfo")
    ) {
      continue;
    }
    const src = path.join(srcDir, ent.name);
    const dst = path.join(dstDir, ent.name);
    if (ent.isDirectory()) {
      copyDirClean(src, dst);
    } else if (ent.isFile()) {
      fs.copyFileSync(src, dst);
    }
  }
}

async function stageAndInstallFoundry(sb) {
  assert.equal(fs.existsSync(FOUNDRY_DIR), true, `Expected extensions/foundry at ${FOUNDRY_DIR}`);
  const manifestPath = path.join(FOUNDRY_DIR, "opl-package.json");
  assert.equal(fs.existsSync(manifestPath), true, `Expected opl-package.json in ${FOUNDRY_DIR}`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.schema_version, "opl.package.v2");
  assert.equal(manifest.identity?.id, "opl-foundry");
  assert.equal(manifest.identity?.intent, "extension");
  assert.equal(manifest.provides?.cli_extensions?.[0]?.namespace, "foundry");

  const stagedDir = path.join(sb.root, "foundry-stage");
  copyDirClean(FOUNDRY_DIR, stagedDir);

  await runCliJson(["pack", "build", stagedDir], { sandbox: sb });
  const archiveInfo = createLocalPackageArchive(stagedDir, path.join(sb.root, "foundry-dist"), {
    includeLockFile: true,
  });
  const installRes = await runCliJson(["pack", "install", archiveInfo.archivePath], { sandbox: sb });
  return { stagedDir, archivePath: archiveInfo.archivePath, installRes };
}

function buildPythonEnv(sb) {
  const candidates = [PYTHON_CLIENT_DIR, path.join(PYTHON_CLIENT_DIR, "src")].filter((p) => fs.existsSync(p));
  assert.ok(candidates.length > 0, `Expected sdks/python-client at ${PYTHON_CLIENT_DIR}`);
  if (sb.env.PYTHONPATH) candidates.push(sb.env.PYTHONPATH);
  return {
    ...sb.env,
    PYTHONPATH: candidates.join(path.delimiter),
  };
}

function runPythonScript(sb, script) {
  const res = spawnSync("python3", ["-c", script], {
    cwd: sb.workspaceDir,
    env: buildPythonEnv(sb),
    encoding: "utf8",
  });
  assert.equal(
    res.status,
    0,
    `Python script failed (exit ${res.status}):\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
  );
  return res;
}

function extractId(obj, keys, label) {
  for (const k of keys) {
    if (typeof obj?.[k] === "string" && obj[k].length > 0) return obj[k];
  }
  assert.fail(`Expected ${label} in: ${JSON.stringify(obj)}`);
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

describe("Tier 1 — F14: OPL Foundry Dynamic Extension & Pure-Stdlib Python SDK", () => {
  it("T1-F14-01: opl pack install opl-foundry dynamically registers opl foundry CLI and persists extension row", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const helpBefore = await runCliOk(["--help"], { sandbox: sb });
    assert.doesNotMatch(
      helpBefore.stdout,
      /^\s*(?:opl\s+)?foundry(?:\s|$)/m,
      "Expected 'foundry' absent from base opl --help before install"
    );
    await runCliExpectCode(["foundry", "--help"], 2, { sandbox: sb });
    await runCliExpectCode(["foundry", "validate", sb.workspaceDir], 2, { sandbox: sb });

    await stageAndInstallFoundry(sb);

    const db = openOplDb(sb.dbPath, { readOnly: true });
    try {
      const pkg = getInstalledPackage(db, "opl-foundry");
      assert.ok(pkg, "Expected opl-foundry row in installed_packages");
      assert.equal(pkg.intent, "extension");
      assert.equal(pkg.enabled, 1);
    } finally {
      db.close();
    }

    const helpAfter = await runCliOk(["--help"], { sandbox: sb });
    assert.match(helpAfter.stdout, /\bfoundry\b/, "Expected 'foundry' namespace in opl --help after install");

    const foundryHelp = await runCliOk(["foundry", "--help"], { sandbox: sb });
    for (const sub of ["init", "validate", "eval", "compare", "promote", "rollback"]) {
      assert.match(
        foundryHelp.stdout,
        new RegExp(`\\b${sub}\\b`),
        `Expected subcommand '${sub}' in opl foundry --help`
      );
    }

    const probePkg = buildV2Package(path.join(sb.root, "foundry-probe-pkg"), {
      id: "foundry-probe-pkg",
      intent: "agent",
      specStrict: true,
    });
    const valRes = await runCliJson(["foundry", "validate", probePkg.dir], { sandbox: sb });
    assert.equal(valRes.ok, true, `Expected opl foundry validate ok=true, got ${JSON.stringify(valRes)}`);
  });

  it("T1-F14-02: opl foundry init + validate + opl pack build round-trip scaffolds valid opl.package.v2", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();
    await stageAndInstallFoundry(sb);

    const scaffoldDir = path.join(sb.root, "scaffolded-agent");
    const initRes = await runCliJson(["foundry", "init", scaffoldDir, "--id", "my-scaffold-agent"], {
      sandbox: sb,
    });
    assert.equal(initRes.ok, true, `Expected foundry init ok=true, got ${JSON.stringify(initRes)}`);

    const manifestPath = path.join(scaffoldDir, "opl-package.json");
    assert.equal(fs.existsSync(manifestPath), true, `Expected scaffolded opl-package.json at ${manifestPath}`);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.equal(manifest.schema_version, "opl.package.v2");
    assert.equal(manifest.identity?.id, "my-scaffold-agent");
    assert.ok(
      typeof manifest.identity?.name?.["zh-CN"] === "string" && manifest.identity.name["zh-CN"].length > 0,
      "Expected zh-CN I18nText in identity.name"
    );
    assert.ok(
      typeof manifest.identity?.name?.["en-US"] === "string" && manifest.identity.name["en-US"].length > 0,
      "Expected en-US I18nText in identity.name"
    );

    const validateRes = await runCliJson(["foundry", "validate", scaffoldDir], { sandbox: sb });
    assert.equal(validateRes.ok, true, `Expected foundry validate ok=true, got ${JSON.stringify(validateRes)}`);

    await runCliJson(["pack", "build", scaffoldDir], { sandbox: sb });
    const lockPath = path.join(scaffoldDir, "opl-release.lock.json");
    assert.equal(fs.existsSync(lockPath), true, "Expected opl-release.lock.json after opl pack build");
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    assert.equal(lock.canonicalization, "ordered_path_length_file_length_bytes");
    assert.equal(lock.digest, computeContentLock(scaffoldDir).digest);
  });

  it("T1-F14-03: Python OplClient connects over AF_UNIX, completes daemon.handshake, and snapshots knowledge", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Python Snap WS"], {
      sandbox: sb,
    });
    const workspaceId = extractId(
      wsInit.workspace ?? wsInit,
      ["workspace_id", "workspaceId", "id"],
      "workspace_id"
    );

    const extVault = buildObsidianVaultDir(path.join(sb.root, "py-obsidian-vault"));
    const addSrc = await runCliJson(
      [
        "workspace",
        "sources",
        "add",
        extVault.dir,
        "--workspace",
        workspaceId,
        "--scope",
        "long_term_topic",
        "--adapter",
        "obsidian_vault",
      ],
      { sandbox: sb }
    );
    extractId(addSrc.source ?? addSrc, ["source_id", "sourceId", "id"], "source_id");

    const stageRunId = "sr-py-f14-03";
    const pyScript = `
import json
from opl_client import OplClient

with OplClient(session_file=${JSON.stringify(sb.sessionPath)}, client_kind="sdk_python") as cli:
    info = cli.server_info
    assert isinstance(info, dict), f"Expected dict server_info, got {type(info)}"
    assert isinstance(info.get("session_id"), str) and len(info["session_id"]) > 0, f"Missing session_id: {info}"
    assert str(info.get("api_version", "")).startswith("2."), f"Unexpected api_version: {info}"
    snap = cli.knowledge_snapshot(${JSON.stringify(workspaceId)}, ${JSON.stringify(stageRunId)})
    print(json.dumps({"server_info": info, "snapshot": snap}))
`;

    const pyRes = runPythonScript(sb, pyScript);
    const out = JSON.parse(pyRes.stdout.trim());
    const snap = out.snapshot;
    assert.ok(snap && typeof snap === "object", `Expected snapshot object, got ${pyRes.stdout}`);
    const snapStr = JSON.stringify(snap);
    assert.ok(
      typeof (snap.snapshot_id ?? snap.snapshotId ?? snap.snapshots?.[0]?.snapshot_id) === "string",
      `Expected snapshot_id in ${snapStr}`
    );
    assert.ok(snapStr.includes("notes/protocol.md"), `Expected notes/protocol.md in snapshot: ${snapStr}`);
    assert.ok(snapStr.includes(extVault.digests["notes/protocol.md"]), "Expected protocol.md SHA-256 digest in snapshot");

    const db = openOplDb(sb.dbPath, { readOnly: true });
    try {
      const snaps = getKnowledgeSnapshots(db, stageRunId);
      assert.ok(snaps.length >= 1, "Expected persisted knowledge_snapshots row");
    } finally {
      db.close();
    }
    assertNoRawKnowledgeContentInDb(sb.dbPath, extVault.canaryStrings);
  });

  it("T1-F14-04: Python OplClient append_ledger, drain_events interleaved Server-Push, and ledger_timeline", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Python Ledger WS"], {
      sandbox: sb,
    });
    const workspaceId = extractId(
      wsInit.workspace ?? wsInit,
      ["workspace_id", "workspaceId", "id"],
      "workspace_id"
    );

    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const createdTask = await appRpc.call("runway.task.create", {
      workspace_id: workspaceId,
      agent_id: "mas",
      title: "Python Ledger Roundtrip",
      goal_prompt: "Verify Python append_ledger + drain_events + timeline",
    });
    const taskId = extractId(createdTask.task ?? createdTask, ["task_id", "taskId", "id"], "task_id");
    await appRpc.close();

    const digestHex = "a".repeat(64);
    const pyScript = `
import json
from opl_client import OplClient

with OplClient(session_file=${JSON.stringify(sb.sessionPath)}, client_kind="sdk_python") as cli:
    r1 = cli.append_ledger(${JSON.stringify(taskId)}, "artifact_ref", "mas", {"path": "manuscript.md", "sha256": ${JSON.stringify(digestHex)}})
    r2 = cli.append_ledger(${JSON.stringify(taskId)}, "quality_debt", "mas", {"code": "missing_ci", "severity": "high", "blocks_submission": True})
    events = cli.drain_events()
    assert len(events) >= 2, f"Expected >=2 buffered Server-Push events, got {events}"
    ledger_events = [e for e in events if e.get("method") == "event.ledger.appended"]
    assert len(ledger_events) >= 2, f"Expected >=2 event.ledger.appended notifications, got {events}"
    assert cli.drain_events() == [], "Expected second drain_events() to return empty list"

    tl = cli.ledger_timeline(${JSON.stringify(taskId)})
    entries = tl if isinstance(tl, list) else tl.get("entries", tl.get("items", []))
    assert len(entries) == 2, f"Expected 2 timeline entries, got {tl}"
    assert entries[0]["entry_kind"] == "artifact_ref"
    assert entries[1]["entry_kind"] == "quality_debt"
    print(json.dumps({"r1": r1, "r2": r2, "events_count": len(ledger_events), "timeline_count": len(entries)}))
`;

    const pyRes = runPythonScript(sb, pyScript);
    const pyOut = JSON.parse(pyRes.stdout.trim());
    assert.ok(pyOut.events_count >= 2);
    assert.equal(pyOut.timeline_count, 2);

    const db = openOplDb(sb.dbPath, { readOnly: true });
    try {
      const rows = getLedgerEntries(db, taskId);
      assert.equal(rows.length, 2);
      assert.equal(rows[0].entry_kind, "artifact_ref");
      assert.equal(rows[1].entry_kind, "quality_debt");
      assertLedgerRefsOnly(db, taskId);
    } finally {
      db.close();
    }
  });

  it("T1-F14-05: Python OplClient invoke_connection with socket-bound token & <1,500L pure-stdlib AST check", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const pair = buildConnectPair(path.join(sb.root, "pkgs"), { specStrict: true });
    await runCliOk(["pack", "link", pair.providerDir], { sandbox: sb });
    await runCliOk(["pack", "link", pair.consumerDir], { sandbox: sb });

    const canarySecret = "py_canary_secret_never_leak_f1405";
    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    await appRpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Relay Mailbox",
      account_label: "py@lab",
      secret: canarySecret,
    });

    const pyScript = `
import json, sys
from opl_client import OplClient

with OplClient(session_file=${JSON.stringify(sb.sessionPath)}, client_kind="sdk_python") as cli:
    print(json.dumps({"session_id": cli.server_info["session_id"]}), flush=True)
    line = sys.stdin.readline()
    payload = json.loads(line)
    res = cli.invoke_connection(payload["bind_token"], "conn-mail", "mailbox.read", {"query": "status"})
    assert res.get("disposition") == "completed", f"Unexpected invoke_connection result: {res}"
    assert ${JSON.stringify(canarySecret)} not in json.dumps(res), "Canary secret leaked in invoke_connection result"
    print(json.dumps({"invoke": res}), flush=True)
`;

    const pyChild = spawn("python3", ["-c", pyScript], {
      cwd: sb.workspaceDir,
      env: buildPythonEnv(sb),
      stdio: ["pipe", "pipe", "pipe"],
    });
    sb.trackPid(pyChild.pid, { kind: "python", label: "python3" });

    let stdoutBuf = "";
    let stderrBuf = "";
    pyChild.stderr.on("data", (d) => {
      stderrBuf += d.toString("utf8");
    });

    const firstLine = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for Python session_id; stderr=${stderrBuf}`)), 8000);
      pyChild.once("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      pyChild.stdout.on("data", function onData(chunk) {
        stdoutBuf += chunk.toString("utf8");
        const nl = stdoutBuf.indexOf("\n");
        if (nl !== -1) {
          const line = stdoutBuf.slice(0, nl).trim();
          stdoutBuf = stdoutBuf.slice(nl + 1);
          pyChild.stdout.off("data", onData);
          clearTimeout(timer);
          resolve(line);
        }
      });
    });

    const { session_id: pySessionId } = JSON.parse(firstLine);
    assert.ok(typeof pySessionId === "string" && pySessionId.length > 0);

    const tokRes = await appRpc.call("connect.issueConsumerBindToken", {
      session_id: pySessionId,
      consumer_package_id: "mas",
    });
    const bindToken = tokRes.consumer_bind_token ?? tokRes.consumerBindToken ?? tokRes.token;
    assert.ok(typeof bindToken === "string" && bindToken.startsWith("oplcbt1."));

    const req = await appRpc.call("connect.requestAccess", {
      consumer_package_id: "mas",
      connection_id: "conn-mail",
      capability_ids: ["mailbox.read"],
    });
    const requestId = req.request_id ?? req.requestId ?? req.grants?.[0]?.grant_id;
    assert.ok(requestId);
    await appRpc.call("connect.approveRequest", { request_id: requestId });

    pyChild.stdin.write(JSON.stringify({ bind_token: bindToken }) + "\n");
    pyChild.stdin.end();

    const pyExit = await new Promise((resolve, reject) => {
      pyChild.stdout.on("data", (d) => {
        stdoutBuf += d.toString("utf8");
      });
      pyChild.once("error", reject);
      pyChild.once("close", (code) => {
        sb.untrackPid(pyChild.pid);
        resolve({ code, stdout: stdoutBuf, stderr: stderrBuf });
      });
    });
    assert.equal(pyExit.code, 0, `Python invoke_connection failed:\n${pyExit.stdout}\n${pyExit.stderr}`);
    const invokeOut = JSON.parse(pyExit.stdout.trim());
    assert.equal(invokeOut.invoke.disposition, "completed");

    const pyAudit = auditPythonStdlibAndBudget(PYTHON_CLIENT_DIR, { maxLines: 1500 });
    assert.equal(
      pyAudit.ok,
      true,
      `Expected sdks/python-client <1500L pure stdlib, got violations: ${JSON.stringify(pyAudit.violations)}`
    );
    assert.ok(pyAudit.lineCount > 0 && pyAudit.lineCount < 1500);
    assert.equal(pyAudit.nonStdlibImports.length, 0);
  });
});
