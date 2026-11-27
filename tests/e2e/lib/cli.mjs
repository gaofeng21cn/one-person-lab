import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = path.resolve(LIB_DIR, "../../..");

export function resolveOplBin({ binPath, sandbox, repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const candidate = binPath || process.env.OPL_BIN || sandbox?.env?.OPL_BIN || path.resolve(repoRoot, "bin/opl");
  const resolved = path.resolve(candidate);
  if (!fs.existsSync(resolved)) {
    throw new Error(`OPL CLI binary not found: ${resolved}`);
  }
  if (process.platform !== "win32") {
    fs.accessSync(resolved, fs.constants.X_OK);
  }
  return resolved;
}

function tryParseJson(stdout) {
  const trimmed = (stdout || "").trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return { json: null, jsonError: null };
  }
  try {
    return { json: JSON.parse(trimmed), jsonError: null };
  } catch (err) {
    return { json: null, jsonError: err.message };
  }
}

export function assertCoreCliHelp(help) {
  const section = help.split("\nCommands:\n")[1]?.split("\n\n")[0] ?? "";
  const entries = [...section.matchAll(/^  ([\w-]+): (.+)$/gm)];
  const groups = new Map(entries.map(([, group, commands]) => [group, commands.split(" · ")]));
  const required = {
    daemon: ["start", "status", "stop", "doctor"],
    workspace: ["init", "list", "inspect"],
    sources: ["list", "configure", "check", "disconnect"],
    pack: ["install", "ensure", "list", "inspect", "update"],
    connect: ["list", "gateway", "mcp-app-stdio"],
    runway: ["start", "list", "status"],
    ledger: ["timeline", "artifacts", "verify"],
  };
  assert.deepEqual([...groups.keys()].sort(), Object.keys(required).sort(), "Expected the v2 core namespaces");
  for (const [group, commands] of Object.entries(required)) {
    const advertised = groups.get(group);
    for (const command of commands) assert.ok(advertised.includes(command), `Missing opl ${group} ${command}`);
    assert.equal(new Set(advertised).size, advertised.length, `Duplicate commands in opl ${group} help`);
  }
}

export async function runCli(args = [], opts = {}) {
  const {
    sandbox,
    binPath,
    repoRoot = DEFAULT_REPO_ROOT,
    cwd,
    env = {},
    input,
    timeoutMs = 30_000,
    maxBuffer = 16 * 1024 * 1024,
  } = opts;

  const resolvedBin = resolveOplBin({ binPath, sandbox, repoRoot });
  const spawnCwd = cwd ?? sandbox?.workspaceDir ?? repoRoot;
  const spawnEnv = { ...(sandbox?.env ?? process.env), ...env };
  const t0 = performance.now();

  return new Promise((resolve, reject) => {
    const usePipeStdin = input !== undefined && input !== null;
    const child = spawn(resolvedBin, args, {
      cwd: spawnCwd,
      env: spawnEnv,
      detached: process.platform !== "win32",
      stdio: [usePipeStdin ? "pipe" : "ignore", "pipe", "pipe"],
    });

    if (child.pid) {
      sandbox?.trackPid(child.pid, {
        pgid: process.platform !== "win32" ? child.pid : null,
        kind: "cli",
        label: path.basename(resolvedBin),
      });
    }

    const outChunks = [];
    const errChunks = [];
    let outLen = 0;
    let errLen = 0;
    let timedOut = false;
    let killTimer = null;

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) {
        try {
          if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
          else child.kill("SIGTERM");
        } catch {
          // ignore
        }
        killTimer = setTimeout(() => {
          try {
            if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
            else child.kill("SIGKILL");
          } catch {
            // ignore
          }
        }, 1000);
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      if (outLen < maxBuffer) {
        outChunks.push(chunk);
        outLen += chunk.length;
      }
    });
    child.stderr.on("data", (chunk) => {
      if (errLen < maxBuffer) {
        errChunks.push(chunk);
        errLen += chunk.length;
      }
    });

    if (usePipeStdin) {
      child.stdin.write(input);
      child.stdin.end();
    }

    child.on("error", (err) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      if (child.pid) sandbox?.untrackPid(child.pid);
      reject(err);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      if (child.pid) sandbox?.untrackPid(child.pid);

      const stdout = Buffer.concat(outChunks).toString("utf8");
      const stderr = Buffer.concat(errChunks).toString("utf8");
      const { json, jsonError } = tryParseJson(stdout);
      resolve({
        code: code ?? (timedOut ? 124 : 1),
        signal: signal ?? null,
        stdout,
        stderr,
        json,
        jsonError,
        durationMs: performance.now() - t0,
        timedOut,
      });
    });
  });
}

export async function runCliOk(args = [], opts = {}) {
  const res = await runCli(args, opts);
  assert.equal(
    res.code,
    0,
    `Expected opl ${args.join(" ")} to exit 0, got ${res.code} (timedOut=${res.timedOut})\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
  );
  return res;
}

export async function runCliJson(args = [], opts = {}) {
  const finalArgs = opts.rawArgs || args.includes("--json") ? args : [...args, "--json"];
  const expectedCode = opts.expectedCode ?? 0;
  const res = await runCli(finalArgs, opts);
  assert.equal(
    res.code,
    expectedCode,
    `Expected opl ${finalArgs.join(" ")} to exit ${expectedCode}, got ${res.code}\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
  );
  assert.ok(
    res.json !== null,
    `Expected valid JSON stdout from opl ${finalArgs.join(" ")}, parseError=${res.jsonError}\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
  );
  return res.json;
}

export async function runCliExpectCode(args = [], expectedCode, opts = {}) {
  const res = await runCli(args, opts);
  assert.equal(
    res.code,
    expectedCode,
    `Expected opl ${args.join(" ")} to exit ${expectedCode}, got ${res.code}\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
  );
  return res;
}
