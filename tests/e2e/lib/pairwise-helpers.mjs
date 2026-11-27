import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { runCliJson, runCliOk } from "./cli.mjs";
import { createLocalPackageArchive } from "./fixtures.mjs";
import { connectRpcClient } from "./rpc-client.mjs";
import {
  DEFAULT_WORKTREE_ROOT,
  createSandbox,
  resolveAppRoot,
  resolveBridgeDir,
  resolveStudioRoot,
} from "./sandbox.mjs";
import { openOplDb } from "./sqlite-inspector.mjs";

export const REPO_ROOT = path.resolve(process.env.OPL_E2E_REPO_ROOT || DEFAULT_WORKTREE_ROOT);
export const STUDIO_ROOT = resolveStudioRoot(REPO_ROOT);
export const BRIDGE_DIR = resolveBridgeDir(STUDIO_ROOT);
export const APP_ROOT = resolveAppRoot(REPO_ROOT);
export const PYTHON_CLIENT_DIR = path.resolve(
  process.env.OPL_PYTHON_CLIENT_DIR || path.join(REPO_ROOT, "sdks", "python-client")
);
export const FOUNDRY_DIR = path.resolve(
  process.env.OPL_FOUNDRY_DIR || path.join(REPO_ROOT, "extensions", "foundry")
);
export const MCP_APP_SHARED_DIR = path.resolve(
  process.env.OPL_MCP_APP_SHARED_DIR || path.join(REPO_ROOT, "packages", "mcp-app-shared")
);
export const IS_PRE_M4 = process.env.OPL_E2E_REPO_PHASE === "pre_m4";

/**
 * Manages per-test sandboxes, RPC clients, SQLite handles, Bridges, and active tasks
 * with deterministic reverse-order teardown for `afterEach`.
 */
export function createE2eContext() {
  const sandboxes = [];
  const rpcClients = [];
  const dbs = [];
  const bridges = [];
  const tasksToCancel = [];

  return {
    makeSandbox(opts = {}) {
      const sb = createSandbox(opts);
      sandboxes.push(sb);
      return sb;
    },
    trackRpc(client) {
      rpcClients.push(client);
      return client;
    },
    async connectRpc(sb, opts = {}) {
      const client = await connectRpcClient({ sessionPath: sb.sessionPath, ...opts });
      rpcClients.push(client);
      return client;
    },
    openDb(dbPath, opts) {
      const db = openOplDb(dbPath, opts);
      dbs.push(db);
      return db;
    },
    trackBridge(bridge) {
      bridges.push(bridge);
      return bridge;
    },
    trackTask(sb, taskId) {
      if (sb && taskId) {
        tasksToCancel.push({ sb, taskId });
      }
      return taskId;
    },
    async cleanup() {
      while (tasksToCancel.length > 0) {
        const { sb, taskId } = tasksToCancel.pop();
        try {
          if (fs.existsSync(sb.sessionPath)) {
            const c = await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" });
            await c.call("runway.task.cancel", { task_id: taskId, reason: "e2e teardown" }).catch(() => {});
            await c.close().catch(() => {});
          }
        } catch {
          // ignore cleanup errors if daemon already stopped
        }
      }
      while (bridges.length > 0) {
        const b = bridges.pop();
        try {
          await b.close?.();
        } catch {
          // ignore bridge close errors during teardown
        }
      }
      while (rpcClients.length > 0) {
        const c = rpcClients.pop();
        try {
          await c.close?.();
        } catch {
          // ignore rpc close errors during teardown
        }
      }
      while (dbs.length > 0) {
        const db = dbs.pop();
        try {
          db.close();
        } catch {
          // ignore db close errors during teardown
        }
      }
      while (sandboxes.length > 0) {
        const sb = sandboxes.pop();
        await sb.cleanup();
      }
    },
  };
}

export function extractId(obj, keys, label) {
  for (const k of keys) {
    if (typeof obj?.[k] === "string" && obj[k].length > 0) return obj[k];
  }
  assert.fail(`Expected ${label} in: ${JSON.stringify(obj)}`);
}

export function extractWorkspaceId(res) {
  return extractId(res?.workspace ?? res, ["workspace_id", "workspaceId", "id"], "workspace_id");
}

export function extractSourceId(res) {
  return extractId(res?.source ?? res, ["source_id", "sourceId", "id"], "source_id");
}

export function extractSnapshotId(res) {
  return extractId(res?.snapshot ?? res, ["snapshot_id", "snapshotId", "id"], "snapshot_id");
}

export function extractTaskId(res) {
  return extractId(res?.task ?? res, ["task_id", "taskId", "id"], "task_id");
}

export function extractStageRunId(res) {
  return extractId(res?.stage_run ?? res, ["stage_run_id", "stageRunId", "id"], "stage_run_id");
}

export function extractScheduleId(res) {
  return extractId(res?.schedule ?? res, ["schedule_id", "scheduleId", "id"], "schedule_id");
}

export function extractRequestId(res) {
  return extractId(
    res?.grants?.[0] ?? res,
    ["request_id", "requestId", "grant_id", "grantId", "id"],
    "request_id"
  );
}

export function extractBindToken(res) {
  return extractId(res, ["consumer_bind_token", "consumerBindToken", "token"], "consumer_bind_token");
}

export async function loadBridgeModule(bridgeDir = BRIDGE_DIR) {
  const builtEntry = path.join(bridgeDir, "lib/index.mjs");
  const srcEntry = path.join(bridgeDir, "src/index.mjs");
  const entry = fs.existsSync(builtEntry) ? builtEntry : srcEntry;
  assert.ok(fs.existsSync(entry), `OplFrameworkBridge entrypoint not found: ${entry}`);
  return import(pathToFileURL(entry).href);
}

export async function loadMcpAppSharedExports(sharedDir = MCP_APP_SHARED_DIR) {
  const pkgJsonPath = path.join(sharedDir, "package.json");
  assert.equal(fs.existsSync(pkgJsonPath), true, `Expected mcp-app-shared package.json at ${pkgJsonPath}`);
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  const exportsMap = pkgJson.exports || {};

  async function importPublicSubpath(subpath, fallbackRel) {
    let targetRel = fallbackRel;
    const entry = exportsMap[subpath];
    if (typeof entry === "string") targetRel = entry;
    else if (entry && typeof entry === "object") {
      targetRel = entry.default || entry.import || entry.browser || targetRel;
    }
    if (!targetRel) return null;
    const abs = path.resolve(sharedDir, targetRel);
    if (!fs.existsSync(abs)) return null;
    return import(pathToFileURL(abs).href);
  }

  const rootMod = await importPublicSubpath(".", pkgJson.main || "./index.mjs");
  const presMod = (await importPublicSubpath("./presentation", "./presentation.js")) || rootMod;
  const formsMod = (await importPublicSubpath("./forms", "./forms.js")) || rootMod;
  const handoffMod = (await importPublicSubpath("./handoff", "./handoff.js")) || rootMod;
  const trajMod = (await importPublicSubpath("./trajectory-renderer", "./trajectory-renderer.js")) || rootMod;

  return {
    pkgJson,
    renderOwnerView: presMod?.renderOwnerView ?? rootMod?.renderOwnerView,
    renderInputFields: formsMod?.renderInputFields ?? rootMod?.renderInputFields,
    resolveViewHandoff: handoffMod?.resolveViewHandoff ?? rootMod?.resolveViewHandoff,
    parseTrajectorySnapshot: trajMod?.parseTrajectorySnapshot ?? rootMod?.parseTrajectorySnapshot,
  };
}

/**
 * Replaces the generated provider binary with a secret-redacting stub that logs
 * dispatches (without leaking secret) so real `@opl/connect` non-leakage guards pass.
 */
export function patchProviderStubRedaction(pkgDir, pkgId, logPath = "") {
  const providerPath = path.join(pkgDir, "bin", `${pkgId}-provider`);
  fs.mkdirSync(path.dirname(providerPath), { recursive: true });
  fs.writeFileSync(
    providerPath,
    [
      "#!/usr/bin/env node",
      'const fs = require("node:fs");',
      "const chunks = [];",
      'process.stdin.on("data", (c) => chunks.push(c));',
      'process.stdin.on("end", () => {',
      '  const raw = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};',
      '  const { secret: _secret, ...safe } = raw && typeof raw === "object" ? raw : {};',
      `  const targetLog = process.env.OPL_CONNECT_PROVIDER_LOG || ${JSON.stringify(logPath || "")};`,
      "  if (targetLog) {",
      '    fs.appendFileSync(targetLog, JSON.stringify({ ts: Date.now(), provider: ' +
        JSON.stringify(pkgId) +
        ', argv: process.argv.slice(2), capability_id: safe.capability_id ?? null, has_secret: Boolean(_secret) }) + "\\n", "utf8");',
      "  }",
      `  process.stdout.write(JSON.stringify({ ok: true, provider: ${JSON.stringify(pkgId)}, capability_id: safe.capability_id ?? null, input: safe.input ?? {} }) + "\\n");`,
      "});",
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o755 }
  );
  fs.chmodSync(providerPath, 0o755);
  return providerPath;
}

export function readProviderDispatchCount(logPath) {
  if (!logPath || !fs.existsSync(logPath)) return 0;
  return fs
    .readFileSync(logPath, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0).length;
}

export function buildAgentContributionOverride(pkgId) {
  return {
    provides: {
      contribution_handler: {
        kind: "cli",
        argv: [`./bin/${pkgId}-handler`],
        transport: "stdin_json_stdout_json",
      },
    },
  };
}

export function ensureAgentHandlerScript(pkgDir, pkgId) {
  const handlerPath = path.join(pkgDir, "bin", `${pkgId}-handler`);
  fs.mkdirSync(path.dirname(handlerPath), { recursive: true });
  fs.writeFileSync(
    handlerPath,
    `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ ok: true, package_id: ${JSON.stringify(pkgId)} }) + "\\n");\n`,
    { encoding: "utf8", mode: 0o755 }
  );
  fs.chmodSync(handlerPath, 0o755);
  return handlerPath;
}

export function ensureAgentContributionHandler(pkg) {
  const manifest = JSON.parse(fs.readFileSync(pkg.manifestPath, "utf8"));
  if (manifest.ui?.declarative?.views && !manifest.provides?.contribution_handler) {
    const id = manifest.identity.id;
    ensureAgentHandlerScript(pkg.dir, id);
    manifest.provides = manifest.provides || {};
    manifest.provides.contribution_handler = {
      kind: "cli",
      argv: [`./bin/${id}-handler`],
      transport: "stdin_json_stdout_json",
    };
    fs.writeFileSync(pkg.manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    pkg.manifest = manifest;
  }
  return pkg;
}

export function copyDirClean(srcDir, dstDir) {
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

export async function stageAndInstallFoundry(sb, foundryDir = FOUNDRY_DIR) {
  assert.equal(fs.existsSync(foundryDir), true, `Expected extensions/foundry at ${foundryDir}`);
  const manifestPath = path.join(foundryDir, "opl-package.json");
  assert.equal(fs.existsSync(manifestPath), true, `Expected opl-package.json in ${foundryDir}`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.schema_version, "opl.package.v2");
  assert.equal(manifest.identity?.id, "opl-foundry");
  assert.equal(manifest.identity?.intent, "extension");
  assert.equal(manifest.provides?.cli_extensions?.[0]?.namespace, "foundry");

  const stagedDir = path.join(sb.root, "foundry-stage");
  copyDirClean(foundryDir, stagedDir);

  await runCliJson(["pack", "build", stagedDir], { sandbox: sb });
  const archiveInfo = createLocalPackageArchive(stagedDir, path.join(sb.root, "foundry-dist"), {
    includeLockFile: true,
  });
  const installRes = await runCliJson(["pack", "install", archiveInfo.archivePath], { sandbox: sb });
  return { stagedDir, archivePath: archiveInfo.archivePath, installRes };
}

export function buildPythonEnv(sb, pythonClientDir = PYTHON_CLIENT_DIR) {
  const candidates = [pythonClientDir, path.join(pythonClientDir, "src")].filter((p) => fs.existsSync(p));
  assert.ok(candidates.length > 0, `Expected sdks/python-client at ${pythonClientDir}`);
  if (sb.env.PYTHONPATH) candidates.push(sb.env.PYTHONPATH);
  return {
    ...sb.env,
    PYTHONPATH: candidates.join(path.delimiter),
  };
}

export function runPythonScript(sb, script, { pythonClientDir = PYTHON_CLIENT_DIR, timeoutMs = 15_000 } = {}) {
  const res = spawnSync("python3", ["-c", script], {
    cwd: sb.workspaceDir,
    env: buildPythonEnv(sb, pythonClientDir),
    encoding: "utf8",
    timeout: timeoutMs,
  });
  if (res.error?.code === "ETIMEDOUT") {
    assert.fail(
      `Python script timed out after ${timeoutMs}ms (ETIMEDOUT):\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
    );
  }
  if (res.error) {
    assert.fail(`Python script spawn error (${res.error.code ?? res.error.message}): ${res.error.message}`);
  }
  assert.equal(
    res.status,
    0,
    `Python script failed (exit ${res.status}):\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
  );
  return res;
}

export function spawnPythonSession(sb, script, { pythonClientDir = PYTHON_CLIENT_DIR } = {}) {
  const child = spawn("python3", ["-c", script], {
    cwd: sb.workspaceDir,
    env: buildPythonEnv(sb, pythonClientDir),
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (child.pid) {
    sb.trackPid(child.pid, { kind: "python", label: "python3" });
  }

  let stdoutBuf = "";
  let stderrBuf = "";
  let closed = false;
  let exitCode = null;
  const lineWaiters = [];
  const closeWaiters = [];

  child.stderr.on("data", (d) => {
    stderrBuf += d.toString("utf8");
  });

  child.stdout.on("data", (d) => {
    stdoutBuf += d.toString("utf8");
    while (lineWaiters.length > 0) {
      const nl = stdoutBuf.indexOf("\n");
      if (nl === -1) break;
      const line = stdoutBuf.slice(0, nl).trim();
      stdoutBuf = stdoutBuf.slice(nl + 1);
      const w = lineWaiters.shift();
      clearTimeout(w.timer);
      w.resolve(line);
    }
  });

  child.on("close", (code) => {
    closed = true;
    exitCode = code ?? 1;
    if (child.pid) sb.untrackPid(child.pid);
    for (const w of lineWaiters.splice(0)) {
      clearTimeout(w.timer);
      w.reject(new Error(`Python process exited (${exitCode}) before emitting line; stderr=${stderrBuf}`));
    }
    for (const w of closeWaiters.splice(0)) {
      clearTimeout(w.timer);
      w.resolve({ code: exitCode, stdout: stdoutBuf, stderr: stderrBuf });
    }
  });

  return {
    child,
    readLine(timeoutMs = 8000) {
      const nl = stdoutBuf.indexOf("\n");
      if (nl !== -1) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        return Promise.resolve(line);
      }
      if (closed) {
        return Promise.reject(new Error(`Python exited (${exitCode}); stderr=${stderrBuf}`));
      }
      return new Promise((resolve, reject) => {
        const w = {
          resolve,
          reject,
          timer: setTimeout(() => {
            const idx = lineWaiters.indexOf(w);
            if (idx !== -1) lineWaiters.splice(idx, 1);
            reject(new Error(`Timed out waiting for Python stdout line; stderr=${stderrBuf}`));
          }, timeoutMs),
        };
        lineWaiters.push(w);
      });
    },
    sendLine(objOrStr) {
      const line = typeof objOrStr === "string" ? objOrStr : JSON.stringify(objOrStr);
      child.stdin.write(line.endsWith("\n") ? line : `${line}\n`);
    },
    waitExit(timeoutMs = 10_000) {
      if (closed) {
        return Promise.resolve({ code: exitCode, stdout: stdoutBuf, stderr: stderrBuf });
      }
      return new Promise((resolve, reject) => {
        const w = {
          resolve,
          reject,
          timer: setTimeout(() => {
            const idx = closeWaiters.indexOf(w);
            if (idx !== -1) closeWaiters.splice(idx, 1);
            reject(new Error(`Timed out waiting for Python exit; stderr=${stderrBuf}`));
          }, timeoutMs),
        };
        closeWaiters.push(w);
      });
    },
  };
}

export function readStubLogs(sb, tool) {
  const logPath = path.join(sb.stubLogDir, `${tool}.jsonl`);
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function createRulesFile(sb, rules) {
  const rulesPath = path.join(sb.root, "stub-rules.json");
  fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2), "utf8");
  return rulesPath;
}

export function listFilesRecursive(dir, { excludeTests = false, excludeDirs = [] } = {}) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const skippedDirs = new Set(["node_modules", ".git", ...excludeDirs]);
  if (excludeTests) {
    skippedDirs.add("tests");
    skippedDirs.add("test");
    skippedDirs.add("__tests__");
  }
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skippedDirs.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...listFilesRecursive(full, { excludeTests, excludeDirs }));
    } else if (ent.isFile()) {
      if (excludeTests && /(?:^|\.)(?:test|spec)\.[^.]+$/i.test(ent.name)) continue;
      out.push(full);
    }
  }
  return out;
}

export async function linkAndAuthorizeConnect(sb, rpc, {
  providerId = "opl-relay",
  consumerId = "mas",
  connectionId = "conn-mail",
  providerType = `${providerId}.mailbox`,
  secret = "canary-secret-never-leaked",
  capabilities = ["mailbox.read"],
} = {}) {
  await rpc.call("connect.add", {
    connection_id: connectionId,
    provider_type: providerType,
    display_name: "Relay Mailbox",
    account_label: "e2e@lab",
    secret,
  });
  const req = await rpc.call("connect.requestAccess", {
    consumer_package_id: consumerId,
    connection_id: connectionId,
    capability_ids: capabilities,
  });
  const requestId = extractRequestId(req);
  await rpc.call("connect.approveRequest", { request_id: requestId });
  return { requestId };
}

export async function setupCanaryOplCli(sb) {
  const canaryDir = path.join(sb.root, "canary-bin");
  fs.mkdirSync(canaryDir, { recursive: true });
  const canaryBin = path.join(canaryDir, "opl");
  const hitMarkerPath = path.join(sb.root, "canary-opl-hit.log");
  fs.writeFileSync(
    canaryBin,
    `#!/usr/bin/env node\nconst fs = require("node:fs");\nfs.appendFileSync(${JSON.stringify(hitMarkerPath)}, JSON.stringify(process.argv.slice(2)) + "\\n");\nprocess.exit(99);\n`,
    { encoding: "utf8", mode: 0o755 }
  );
  fs.chmodSync(canaryBin, 0o755);
  return {
    canaryBin,
    hitMarkerPath,
    spyEnv: {
      ...sb.env,
      OPL_APP_OPL_BIN: canaryBin,
      OPL_COMMAND: canaryBin,
      PATH: `${canaryDir}${path.delimiter}${sb.env.PATH}`,
    },
  };
}

export function countSpawnLogLines() {
  const logPath = process.env.OPL_E2E_SPAWN_LOG;
  if (!logPath || !fs.existsSync(logPath)) return 0;
  return fs
    .readFileSync(logPath, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0).length;
}
