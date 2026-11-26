import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_WORKTREE_ROOT = path.resolve(LIB_DIR, "../../..");

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

function getProcessTable() {
  if (process.platform === "darwin") {
    try {
      const out = execFileSync("ps", ["eww", "-axo", "pid=,ppid=,pgid=,command="], {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      });
      const rows = [];
      for (const line of out.split("\n")) {
        const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+([\s\S]+)$/);
        if (!m) continue;
        rows.push({
          pid: Number(m[1]),
          ppid: Number(m[2]),
          pgid: Number(m[3]),
          command: m[4],
        });
      }
      return rows;
    } catch {
      return [];
    }
  }

  if (process.platform === "linux") {
    try {
      const out = execFileSync("ps", ["-eo", "pid=,ppid=,pgid=,args="], {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      });
      const rows = [];
      for (const line of out.split("\n")) {
        const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+([\s\S]+)$/);
        if (!m) continue;
        const pid = Number(m[1]);
        let envStr = "";
        try {
          envStr = fs.readFileSync(`/proc/${pid}/environ`, "utf8").replace(/\0/g, " ");
        } catch {
          envStr = "";
        }
        rows.push({
          pid,
          ppid: Number(m[2]),
          pgid: Number(m[3]),
          command: envStr ? `${m[4]} ${envStr}` : m[4],
        });
      }
      return rows;
    } catch {
      return [];
    }
  }

  return [];
}

function computeAncestorPids(rows, startPid) {
  const parentOf = new Map();
  for (const r of rows) {
    parentOf.set(r.pid, r.ppid);
  }
  const ancestors = new Set([startPid]);
  let cur = startPid;
  for (let i = 0; i < 64; i++) {
    const ppid = parentOf.get(cur);
    if (!ppid || ppid <= 1 || ancestors.has(ppid)) break;
    ancestors.add(ppid);
    cur = ppid;
  }
  return ancestors;
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasEnvToken(command, key, val) {
  const re = new RegExp(`(?:^|\\s)${escapeRegExp(key)}=${escapeRegExp(val)}(?=\\s|$)`);
  return re.test(command);
}

function readSpawnLogEntries(spawnLogPath) {
  if (!spawnLogPath || !fs.existsSync(spawnLogPath)) return [];
  const raw = fs.readFileSync(spawnLogPath, "utf8");
  const byPid = new Map();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry = null;
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Number.isInteger(parsed?.pid) && parsed.pid > 0) {
          entry = parsed;
        }
      } catch {
        continue;
      }
    } else if (/^\d+$/.test(trimmed)) {
      entry = { pid: Number(trimmed), ppid: 0, detached: false, file: "" };
    }
    if (entry && !byPid.has(entry.pid)) {
      byPid.set(entry.pid, entry);
    }
  }
  return [...byPid.values()];
}

export function detectLeakedProcesses({ runId, fileRunId, sandboxId, pgid, spawnLogPath } = {}) {
  if (!runId && !fileRunId && !sandboxId && !pgid && !spawnLogPath) {
    return [];
  }
  const rows = getProcessTable();
  const excludedPids = computeAncestorPids(rows, process.pid);
  const rowByPid = new Map(rows.map((r) => [r.pid, r]));
  const matches = [];
  const seenPids = new Set();

  for (const r of rows) {
    if (excludedPids.has(r.pid)) continue;
    // Ignore the ps command itself
    if (/^\s*ps\s+eww\b/.test(r.command) || /^\s*ps\s+-eo\b/.test(r.command)) continue;

    let hit = false;
    if (sandboxId && hasEnvToken(r.command, "OPL_E2E_SANDBOX_ID", sandboxId)) hit = true;
    if (fileRunId && hasEnvToken(r.command, "OPL_E2E_FILE_RUN_ID", fileRunId)) hit = true;
    if (runId && hasEnvToken(r.command, "OPL_E2E_RUN_ID", runId)) hit = true;
    if (pgid && r.pgid === Number(pgid)) hit = true;

    if (hit && isPidAlive(r.pid)) {
      seenPids.add(r.pid);
      matches.push(r);
    }
  }

  for (const entry of readSpawnLogEntries(spawnLogPath)) {
    const pid = entry.pid;
    if (seenPids.has(pid) || excludedPids.has(pid)) continue;
    if (!isPidAlive(pid)) continue;
    const row = rowByPid.get(pid);
    if (row) {
      if (/^\s*ps\s+eww\b/.test(row.command) || /^\s*ps\s+-eo\b/.test(row.command)) continue;
      seenPids.add(pid);
      matches.push(row);
    } else {
      seenPids.add(pid);
      matches.push({
        pid,
        ppid: Number.isInteger(entry.ppid) ? entry.ppid : 0,
        pgid: entry.detached ? pid : 0,
        command: entry.file || "spawned",
      });
    }
  }

  return matches;
}

export async function reapProcesses(procs, { graceMs = 500 } = {}) {
  const rows = getProcessTable();
  const protectedPids = computeAncestorPids(rows, process.pid);
  const list = (procs || []).filter((p) => p && p.pid !== process.pid && !protectedPids.has(p.pid) && isPidAlive(p.pid));
  if (list.length === 0) return { reaped: [], remaining: [] };

  let selfPgid = null;
  try {
    const selfRow = rows.find((r) => r.pid === process.pid);
    if (selfRow) selfPgid = selfRow.pgid;
  } catch {
    selfPgid = null;
  }

  for (const p of list) {
    try {
      if (p.pgid && p.pgid > 1 && p.pgid !== selfPgid && p.pgid !== process.pid) {
        process.kill(-p.pgid, "SIGTERM");
      }
    } catch {
      // ignore
    }
    try {
      process.kill(p.pid, "SIGTERM");
    } catch {
      // ignore
    }
  }

  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (list.every((p) => !isPidAlive(p.pid))) break;
    await sleepMs(25);
  }

  for (const p of list) {
    if (!isPidAlive(p.pid)) continue;
    try {
      if (p.pgid && p.pgid > 1 && p.pgid !== selfPgid && p.pgid !== process.pid) {
        process.kill(-p.pgid, "SIGKILL");
      }
    } catch {
      // ignore
    }
    try {
      process.kill(p.pid, "SIGKILL");
    } catch {
      // ignore
    }
  }

  const killDeadline = Date.now() + 500;
  while (Date.now() < killDeadline) {
    if (list.every((p) => !isPidAlive(p.pid))) break;
    await sleepMs(20);
  }

  const reaped = [];
  const remaining = [];
  for (const p of list) {
    if (isPidAlive(p.pid)) remaining.push(p);
    else reaped.push(p);
  }
  return { reaped, remaining };
}

export async function measureLatencyMs(fn, { iterations = 100, warmup = 5 } = {}) {
  for (let i = 0; i < warmup; i++) {
    await fn(i);
  }
  const samples = [];
  let sum = 0;
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await fn(i);
    const dt = performance.now() - t0;
    samples.push(dt);
    sum += dt;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const pct = (p) => {
    if (sorted.length === 0) return 0;
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx];
  };
  return {
    iterations: sorted.length,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean: sorted.length > 0 ? sum / sorted.length : 0,
    p50: pct(50),
    p95: pct(95),
    p99: pct(99),
    samples,
  };
}

function probeUnixSocket(sockPath, timeoutMs = 400) {
  return new Promise((resolve) => {
    const socket = net.createConnection(sockPath);
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(false);
      }
    }, timeoutMs);

    socket.once("connect", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(true);
      }
    });
    socket.once("error", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(false);
      }
    });
  });
}

export function createSandbox(options = {}) {
  const {
    prefix = "e2e-",
    extraEnv = {},
    stubEnv = {},
    cwdSubdir = "ws",
    worktreeRoot = DEFAULT_WORKTREE_ROOT,
  } = options;

  let baseTmp = os.tmpdir();
  // macOS AF_UNIX sun_path max is 104 bytes; keep sockPath < 96 bytes
  const worstCaseProbe = path.join(baseTmp, `${prefix}123456789012/s/run/opld.sock`);
  if (process.platform !== "win32" && Buffer.byteLength(worstCaseProbe, "utf8") >= 96) {
    baseTmp = "/tmp";
  }

  const root = fs.mkdtempSync(path.join(baseTmp, prefix));
  const homeDir = path.join(root, "h");
  const oplHome = path.join(homeDir, ".opl");
  const stateDir = path.join(root, "s");
  const runDir = path.join(stateDir, "run");
  const configDir = path.join(root, "cfg");
  const codexHome = path.join(root, "cx");
  const workspaceDir = path.join(root, cwdSubdir);
  const xdgConfig = path.join(root, "xc");
  const xdgData = path.join(root, "xd");
  const xdgState = path.join(root, "xs");
  const stubLogDir = path.join(root, "stub-logs");

  fs.mkdirSync(homeDir, { recursive: true, mode: 0o755 });
  fs.mkdirSync(oplHome, { recursive: true, mode: 0o755 });
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(xdgConfig, { recursive: true });
  fs.mkdirSync(xdgData, { recursive: true });
  fs.mkdirSync(xdgState, { recursive: true });
  fs.mkdirSync(stubLogDir, { recursive: true });

  const gitConfigPath = path.join(homeDir, ".gitconfig");
  fs.writeFileSync(
    gitConfigPath,
    "[user]\n\tname = OPL E2E\n\temail = e2e@onepersonlab.local\n[init]\n\tdefaultBranch = main\n[commit]\n\tgpgsign = false\n",
    "utf8"
  );

  const sockPath = path.join(runDir, "opld.sock");
  if (process.platform !== "win32" && Buffer.byteLength(sockPath, "utf8") >= 96) {
    fs.rmSync(root, { recursive: true, force: true });
    throw new Error(`Sandbox sockPath exceeds 96-byte sun_path safety guard (${Buffer.byteLength(sockPath, "utf8")}B): ${sockPath}`);
  }

  const lockPath = path.join(runDir, "opld.lock");
  const sessionPath = path.join(runDir, "opld.session.json");
  const dbPath = path.join(stateDir, "opl.db");
  const stubsBinDir = path.resolve(worktreeRoot, "tests/e2e/stubs/bin");

  const runId = process.env.OPL_E2E_RUN_ID || crypto.randomBytes(6).toString("hex");
  const fileRunId = process.env.OPL_E2E_FILE_RUN_ID || "";
  const sandboxId = crypto.randomBytes(6).toString("hex");

  const cleanEnv = { ...process.env };
  delete cleanEnv.NODE_TEST_CONTEXT;
  delete cleanEnv.OPL_REPO_TEMP_ENV_ACTIVE;
  delete cleanEnv.OPL_CODEX_BIN;
  delete cleanEnv.OPL_AGY_BIN;
  delete cleanEnv.ANTIGRAVITY_SOURCE_METADATA;
  for (const key of Object.keys(cleanEnv)) {
    if (key.startsWith("OPL_DAEMON_") || key.startsWith("OPL_SESSION_")) {
      delete cleanEnv[key];
    }
  }

  const env = {
    ...cleanEnv,
    HOME: homeDir,
    USERPROFILE: homeDir,
    GIT_CONFIG_GLOBAL: gitConfigPath,
    OPL_HOME: oplHome,
    OPL_STATE_DIR: stateDir,
    OPL_CONFIG_DIR: configDir,
    CODEX_HOME: codexHome,
    XDG_CONFIG_HOME: xdgConfig,
    XDG_DATA_HOME: xdgData,
    XDG_STATE_HOME: xdgState,
    OPL_STUB_LOG_DIR: stubLogDir,
    PATH: `${stubsBinDir}${path.delimiter}${cleanEnv.PATH ?? ""}`,
    NODE_NO_WARNINGS: "1",
    OPL_E2E_RUN_ID: runId,
    ...(fileRunId ? { OPL_E2E_FILE_RUN_ID: fileRunId } : {}),
    OPL_E2E_SANDBOX_ID: sandboxId,
    ...stubEnv,
    ...extraEnv,
  };

  const trackedPids = new Map();
  let daemonPid = null;
  let cleaned = false;

  function readSession() {
    if (!fs.existsSync(sessionPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(sessionPath, "utf8"));
    } catch {
      return null;
    }
  }

  function trackPid(pid, meta = {}) {
    if (!Number.isInteger(pid) || pid <= 0) return;
    trackedPids.set(pid, { pid, pgid: meta.pgid ?? null, kind: meta.kind ?? "child", label: meta.label ?? "" });
  }

  function untrackPid(pid) {
    trackedPids.delete(pid);
  }

  async function waitForDaemonReady({ timeoutMs = 5000, pollMs = 25, excludePid = null } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const session = readSession();
      if (
        session &&
        Number.isInteger(session.pid) &&
        session.pid > 0 &&
        (excludePid === null || excludePid === undefined || Number(session.pid) !== Number(excludePid)) &&
        typeof session.token === "string" &&
        /^[0-9a-f]{64}$/i.test(session.token)
      ) {
        const targetSock = session.socket_path || sockPath;
        if (process.platform === "win32" || fs.existsSync(targetSock)) {
          const ok = await probeUnixSocket(targetSock, 300);
          if (ok) {
            daemonPid = session.pid;
            trackPid(session.pid, { kind: "daemon", label: "opld" });
            return session;
          }
        }
      }
      await sleepMs(pollMs);
    }
    throw new Error(`Timed out waiting for opld readiness at ${sessionPath} / ${sockPath}`);
  }

  async function startDaemon({
    binPath,
    args = ["daemon", "start", "--detached"],
    env: callEnv = {},
    timeoutMs = 5000,
    detachedChild = false,
    excludePid = null,
  } = {}) {
    const resolvedBin = binPath || env.OPL_BIN || path.resolve(worktreeRoot, "bin/opl");
    const mergedEnv = { ...env, ...callEnv };

    if (detachedChild) {
      const child = spawn(resolvedBin, args, {
        cwd: workspaceDir,
        env: mergedEnv,
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      trackPid(child.pid, { pgid: child.pid, kind: "daemon", label: path.basename(resolvedBin) });
      const session = await waitForDaemonReady({ timeoutMs, excludePid });
      return { pid: session.pid, session, sockPath: session.socket_path || sockPath };
    }

    const res = await new Promise((resolve, reject) => {
      const child = spawn(resolvedBin, args, {
        cwd: workspaceDir,
        env: mergedEnv,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (c) => {
        stdout += c.toString("utf8");
      });
      child.stderr.on("data", (c) => {
        stderr += c.toString("utf8");
      });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });

    if (res.code !== 0) {
      throw new Error(`startDaemon failed (exit ${res.code}): ${res.stderr || res.stdout}`);
    }

    const session = await waitForDaemonReady({ timeoutMs, excludePid });
    return { pid: session.pid, session, sockPath: session.socket_path || sockPath };
  }

  function resolveDaemonPid() {
    if (daemonPid && daemonPid !== process.pid && isPidAlive(daemonPid)) return daemonPid;
    const sess = readSession();
    if (sess?.pid && sess.pid !== process.pid && isPidAlive(sess.pid)) return sess.pid;
    const live = findLiveProcesses();
    const hit = live.find((p) => p.pid !== process.pid && /\bopld\b|daemon/.test(p.command));
    return hit?.pid ?? null;
  }

  async function killDaemon({ signal = "SIGKILL", timeoutMs = 3000 } = {}) {
    const pid = resolveDaemonPid();
    if (!pid) {
      throw new Error("killDaemon: no live opld process found in sandbox");
    }
    if (pid === process.pid) {
      throw new Error(`killDaemon: refusing to signal current process (${process.pid})`);
    }
    process.kill(pid, signal);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!isPidAlive(pid)) {
        trackedPids.delete(pid);
        if (daemonPid === pid) daemonPid = null;
        return pid;
      }
      await sleepMs(20);
    }
    throw new Error(`killDaemon: process ${pid} survived ${signal} past ${timeoutMs}ms`);
  }

  async function stopDaemon({ timeoutMs = 3000 } = {}) {
    const pid = resolveDaemonPid();
    if (!pid) return null;
    if (pid === process.pid) {
      throw new Error(`stopDaemon: refusing to signal current process (${process.pid})`);
    }
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      return pid;
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!isPidAlive(pid)) {
        trackedPids.delete(pid);
        if (daemonPid === pid) daemonPid = null;
        return pid;
      }
      await sleepMs(25);
    }
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // ignore
    }
    const killDeadline = Date.now() + 1000;
    while (Date.now() < killDeadline) {
      if (!isPidAlive(pid)) break;
      await sleepMs(20);
    }
    trackedPids.delete(pid);
    if (daemonPid === pid) daemonPid = null;
    return pid;
  }

  function spawnTracked(cmd, args = [], opts = {}) {
    const child = spawn(cmd, args, {
      cwd: opts.cwd ?? workspaceDir,
      env: { ...env, ...(opts.env || {}) },
      detached: opts.detached ?? false,
      stdio: opts.stdio ?? ["ignore", "pipe", "pipe"],
    });
    if (child.pid) {
      trackPid(child.pid, {
        pgid: opts.detached ? child.pid : null,
        kind: opts.kind ?? "spawned",
        label: path.basename(cmd),
      });
      child.once("exit", () => untrackPid(child.pid));
    }
    return child;
  }

  function findLiveProcesses() {
    const byPid = new Map();
    for (const [pid, meta] of trackedPids.entries()) {
      if (pid !== process.pid && isPidAlive(pid)) {
        byPid.set(pid, { pid, ppid: process.pid, pgid: meta.pgid ?? 0, command: meta.label || "tracked" });
      }
    }
    const sess = readSession();
    if (sess?.pid && sess.pid !== process.pid && isPidAlive(sess.pid) && !byPid.has(sess.pid)) {
      byPid.set(sess.pid, { pid: sess.pid, ppid: 1, pgid: sess.pid, command: "opld (session)" });
    }
    for (const p of detectLeakedProcesses({ sandboxId })) {
      byPid.set(p.pid, p);
    }
    return [...byPid.values()];
  }

  async function cleanup({ keepFiles = false, graceMs = 1500 } = {}) {
    if (cleaned) return { reaped: [], remaining: [] };
    cleaned = true;

    const live = findLiveProcesses();
    const res = await reapProcesses(live, { graceMs });
    trackedPids.clear();
    daemonPid = null;

    if (!keepFiles) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    return res;
  }

  return {
    root,
    homeDir,
    oplHome,
    stateDir,
    runDir,
    configDir,
    codexHome,
    workspaceDir,
    xdgConfig,
    xdgData,
    xdgState,
    stubLogDir,
    sockPath,
    lockPath,
    sessionPath,
    dbPath,
    stubsBinDir,
    runId,
    fileRunId,
    sandboxId,
    env,
    readSession,
    trackPid,
    untrackPid,
    waitForDaemonReady,
    startDaemon,
    killDaemon,
    stopDaemon,
    spawnTracked,
    findLiveProcesses,
    cleanup,
  };
}

export function assertMode600(filePath) {
  assert.equal(fs.existsSync(filePath), true, `Expected file/socket to exist for 0600 check: ${filePath}`);
  if (process.platform === "win32") {
    return 0o600;
  }
  const mode = fs.statSync(filePath).mode & 0o777;
  assert.equal(
    mode,
    0o600,
    `Expected POSIX mode 0600 on ${filePath}, got 0${mode.toString(8)}`
  );
  return mode;
}

export function spawnRawDaemon(sb, extraEnv = {}) {
  const mergedEnv = { ...(sb?.env ?? process.env), ...extraEnv };
  const explicitDaemonBin = extraEnv.OPL_DAEMON_BIN || sb?.env?.OPL_DAEMON_BIN || process.env.OPL_DAEMON_BIN;
  const oplBin = extraEnv.OPL_BIN || sb?.env?.OPL_BIN || process.env.OPL_BIN || path.resolve(DEFAULT_WORKTREE_ROOT, "bin/opl");

  const binPath = explicitDaemonBin || oplBin;
  const args = explicitDaemonBin ? [] : ["daemon", "start", "--foreground"];

  const child = sb?.spawnTracked
    ? sb.spawnTracked(binPath, args, {
        cwd: sb.workspaceDir,
        env: mergedEnv,
        detached: false,
        kind: "daemon-raw",
        stdio: ["ignore", "pipe", "pipe"],
      })
    : spawn(binPath, args, {
        cwd: sb?.workspaceDir ?? process.cwd(),
        env: mergedEnv,
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

  const outChunks = [];
  const errChunks = [];
  let exited = false;
  let exitResult = null;
  let spawnErr = null;
  const waiters = [];

  child.stdout?.on("data", (c) => outChunks.push(c));
  child.stderr?.on("data", (c) => errChunks.push(c));

  function settle(result, err = null) {
    if (exited) return;
    exited = true;
    exitResult = result;
    spawnErr = err;
    for (const w of waiters.splice(0)) {
      clearTimeout(w.timer);
      if (err) w.reject(err);
      else w.resolve(result);
    }
  }

  child.once("error", (err) => {
    settle(null, err);
  });

  child.once("close", (code, signal) => {
    settle({
      code: code ?? 1,
      signal: signal ?? null,
      stdout: Buffer.concat(outChunks).toString("utf8"),
      stderr: Buffer.concat(errChunks).toString("utf8"),
      timedOut: false,
    });
  });

  function waitExit({ timeoutMs = 5000 } = {}) {
    if (exited) {
      return spawnErr ? Promise.reject(spawnErr) : Promise.resolve(exitResult);
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const idx = waiters.indexOf(waiter);
          if (idx !== -1) waiters.splice(idx, 1);
          try {
            child.kill("SIGTERM");
          } catch {
            // ignore
          }
          setTimeout(() => {
            try {
              if (child.pid && isPidAlive(child.pid)) child.kill("SIGKILL");
            } catch {
              // ignore
            }
          }, 300);
          resolve({
            code: 124,
            signal: "SIGTERM",
            stdout: Buffer.concat(outChunks).toString("utf8"),
            stderr: Buffer.concat(errChunks).toString("utf8"),
            timedOut: true,
          });
        }, timeoutMs),
      };
      waiters.push(waiter);
    });
  }

  return { child, pid: child.pid, waitExit };
}

export async function waitForStubLogEvent(stubLogDir, tool, predicate, { timeoutMs = 5000, pollMs = 50 } = {}) {
  const fileName = tool === "*" || tool === "all" ? "all.jsonl" : `${tool}.jsonl`;
  const logPath = path.join(stubLogDir, fileName);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(logPath)) {
      const raw = fs.readFileSync(logPath, "utf8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let parsed;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          continue;
        }
        if (predicate(parsed)) {
          return parsed;
        }
      }
    }
    await sleepMs(pollMs);
  }
  throw new Error(`Timed out waiting for stub log event in ${logPath} after ${timeoutMs}ms`);
}
