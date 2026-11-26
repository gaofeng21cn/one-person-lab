import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCliExpectCode, runCliJson, runCliOk } from "../lib/cli.mjs";
import { createLocalPackageArchive } from "../lib/fixtures.mjs";
import { auditPythonStdlibAndBudget } from "../lib/redline-audit.mjs";
import { connectRpcClient } from "../lib/rpc-client.mjs";
import { DEFAULT_WORKTREE_ROOT, createSandbox, isPidAlive } from "../lib/sandbox.mjs";
import { getInstalledPackage, openOplDb } from "../lib/sqlite-inspector.mjs";

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
  const stagedDir = path.join(sb.root, "foundry-stage");
  copyDirClean(FOUNDRY_DIR, stagedDir);
  await runCliJson(["pack", "build", stagedDir], { sandbox: sb });
  const archiveInfo = createLocalPackageArchive(stagedDir, path.join(sb.root, "foundry-dist"), {
    includeLockFile: true,
  });
  await runCliJson(["pack", "install", archiveInfo.archivePath], { sandbox: sb });
  return { stagedDir, archivePath: archiveInfo.archivePath };
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

describe("Tier 2 — F14 Negative & Boundary: OPL Foundry & Pure-Stdlib Python SDK", () => {
  it("T2-F14-01: opl pack uninstall opl-foundry removes dynamic opl foundry CLI and installed_packages row", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();
    await stageAndInstallFoundry(sb);

    await runCliOk(["foundry", "--help"], { sandbox: sb });

    const uninst = await runCliJson(["pack", "uninstall", "opl-foundry"], { sandbox: sb });
    const reloadMode = uninst.reload_mode ?? uninst.reloadMode ?? uninst.operation?.reload_mode;
    if (reloadMode !== undefined) {
      assert.equal(reloadMode, "restart_required", `Expected restart_required reload_mode, got ${reloadMode}`);
    }

    const db = openOplDb(sb.dbPath, { readOnly: true });
    try {
      assert.equal(getInstalledPackage(db, "opl-foundry"), null, "Expected opl-foundry removed from installed_packages");
    } finally {
      db.close();
    }

    const helpAfter = await runCliOk(["--help"], { sandbox: sb });
    assert.doesNotMatch(
      helpAfter.stdout,
      /^\s*(?:opl\s+)?foundry(?:\s|$)/m,
      "Expected 'foundry' absent from opl --help after uninstall"
    );
    await runCliExpectCode(["foundry", "--help"], 2, { sandbox: sb });
    await runCliExpectCode(["foundry", "validate", sb.workspaceDir], 2, { sandbox: sb });
  });

  it("T2-F14-02: Python OplClient (client_kind=sdk_python) privileged RPC calls reject with OplRpcError(-32003)", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const pyScript = `
from opl_client import OplClient, OplRpcError

privileged = [
    ("connect.approveRequest", {"request_id": "req-probe"}),
    ("pack.uninstall", {"package_id": "mas"}),
    ("pack.install", {"source": "/tmp/nonexistent-pack.tgz"}),
    ("runway.humanGate.resolve", {"stage_run_id": "sr-probe", "decision": "approve"}),
    ("connect.add", {"connection_id": "conn-rogue", "provider_type": "opl-relay.mailbox", "display_name": "Rogue", "secret": "x"}),
]

with OplClient(session_file=${JSON.stringify(sb.sessionPath)}, client_kind="sdk_python") as cli:
    for method, params in privileged:
        raised = False
        try:
            cli.call(method, params)
        except OplRpcError as exc:
            raised = True
            assert exc.code == -32003, f"Expected -32003 for {method}, got {exc.code}: {exc.rpc_message}"
            assert "TRUSTED_HOST_REQUIRED" in f"{exc.rpc_message} {exc}", f"Expected TRUSTED_HOST_REQUIRED for {method}, got {exc}"
        assert raised, f"Expected OplRpcError(-32003) for privileged method {method}"
`;

    runPythonScript(sb, pyScript);
  });

  it("T2-F14-03: Python OplClient invalid handshake token raises OplRpcError(-32001) and cleanly closes", async () => {
    const sb = trackSandbox();
    const d1 = await sb.startDaemon();

    const sessionObj = JSON.parse(fs.readFileSync(sb.sessionPath, "utf8"));
    const badToken = sessionObj.token === "0".repeat(64) ? "f".repeat(64) : "0".repeat(64);
    const badSessionPath = path.join(sb.root, "bad-opld.session.json");
    fs.writeFileSync(badSessionPath, JSON.stringify({ ...sessionObj, token: badToken }), { mode: 0o600 });

    const pyScript = `
from opl_client import OplClient, OplRpcError

cli = OplClient(session_file=${JSON.stringify(badSessionPath)}, client_kind="sdk_python")
raised = False
try:
    cli.connect()
except OplRpcError as exc:
    raised = True
    assert exc.code == -32001, f"Expected -32001, got {exc.code}: {exc.rpc_message}"
    assert "UNAUTHORIZED" in f"{exc.rpc_message} {exc}".upper(), f"Expected UNAUTHORIZED, got {exc}"
finally:
    cli.close()
assert raised, "Expected OplRpcError(-32001) on invalid token handshake"
`;

    runPythonScript(sb, pyScript);

    assert.equal(isPidAlive(d1.pid), true, "opld must remain alive after bad Python handshake");
    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const health = await rpc.call("daemon.health", {});
    assert.ok(health && (health.ok === true || health.status === "ok" || health.status === "healthy"));
  });

  it("T2-F14-04: Python OplClient unconnected/closed call() raises RuntimeError and missing session raises FileNotFoundError", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const missingSessionPath = path.join(sb.root, "does-not-exist.session.json");
    const pyScript = `
from opl_client import OplClient

# 1. Unconnected call() -> RuntimeError
c1 = OplClient(session_file=${JSON.stringify(sb.sessionPath)}, client_kind="sdk_python")
unconnected_err = False
try:
    c1.call("daemon.health", {})
except RuntimeError:
    unconnected_err = True
assert unconnected_err, "Expected RuntimeError when calling before connect()"

# 2. Missing session_file -> FileNotFoundError
c2 = OplClient(session_file=${JSON.stringify(missingSessionPath)}, client_kind="sdk_python")
missing_err = False
try:
    c2.connect()
except FileNotFoundError:
    missing_err = True
assert missing_err, "Expected FileNotFoundError for missing session file"

# 3. Call after close() -> RuntimeError
c3 = OplClient(session_file=${JSON.stringify(sb.sessionPath)}, client_kind="sdk_python")
c3.connect()
c3.close()
closed_err = False
try:
    c3.call("daemon.health", {})
except RuntimeError:
    closed_err = True
assert closed_err, "Expected RuntimeError when calling after close()"
`;

    runPythonScript(sb, pyScript);
  });

  it("T2-F14-05: Pure-stdlib AST & budget guard rejects non-stdlib imports (requests/temporalio) and >=1,500 lines", () => {
    const sb = trackSandbox();
    const baseCopy = path.join(sb.root, "py-clean");
    if (fs.existsSync(PYTHON_CLIENT_DIR)) {
      copyDirClean(PYTHON_CLIENT_DIR, baseCopy);
    } else {
      fs.mkdirSync(baseCopy, { recursive: true });
      fs.writeFileSync(path.join(baseCopy, "opl_client.py"), "import json\nimport socket\n", "utf8");
    }

    const cleanAudit = auditPythonStdlibAndBudget(baseCopy, { maxLines: 1500 });
    assert.equal(cleanAudit.ok, true, `Expected clean Python copy to pass: ${JSON.stringify(cleanAudit.violations)}`);

    // Mutation A: non-stdlib imports
    const nonStdlibCopy = path.join(sb.root, "py-non-stdlib");
    copyDirClean(baseCopy, nonStdlibCopy);
    fs.writeFileSync(
      path.join(nonStdlibCopy, "bad_deps.py"),
      "import requests\nfrom temporalio import client\n",
      "utf8"
    );
    const depAudit = auditPythonStdlibAndBudget(nonStdlibCopy, { maxLines: 1500 });
    assert.equal(depAudit.ok, false, "Expected non-stdlib import copy to fail guard");
    const badMods = new Set(depAudit.nonStdlibImports.map((m) => m.module));
    assert.equal(badMods.has("requests"), true, `Expected 'requests' flagged, got ${JSON.stringify(depAudit)}`);
    assert.equal(badMods.has("temporalio"), true, `Expected 'temporalio' flagged, got ${JSON.stringify(depAudit)}`);

    // Mutation B: >= 1,500 lines
    const bloatCopy = path.join(sb.root, "py-bloat");
    copyDirClean(baseCopy, bloatCopy);
    const bloatLines = [];
    for (let i = 0; i < 1510; i++) {
      bloatLines.push(`CONST_${i} = ${i}`);
    }
    fs.writeFileSync(path.join(bloatCopy, "bloat.py"), bloatLines.join("\n") + "\n", "utf8");
    const bloatAudit = auditPythonStdlibAndBudget(bloatCopy, { maxLines: 1500 });
    assert.equal(bloatAudit.ok, false, "Expected >= 1,500 line Python client copy to fail budget guard");
    assert.ok(bloatAudit.lineCount >= 1500);
    assert.equal(
      bloatAudit.violations.some((v) => v.rule === "python-line-budget"),
      true,
      `Expected python-line-budget violation, got ${JSON.stringify(bloatAudit.violations)}`
    );
  });
});
