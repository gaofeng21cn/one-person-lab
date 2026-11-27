#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { detectLeakedProcesses, reapProcesses, resolveAppRoot, resolveStudioRoot } from "./lib/sandbox.mjs";

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = path.resolve(E2E_DIR, "../..");
const REPORTER_PATH = path.join(E2E_DIR, "lib/ndjson-reporter.mjs");
const PRELOAD_PATH = path.join(E2E_DIR, "lib/spawn-tracker-preload.mjs");

function inspectGitRepo(repoPath) {
  if (!repoPath || !fs.existsSync(path.join(repoPath, ".git"))) {
    return { present: false, path: repoPath || null };
  }
  const git = (args) =>
    execFileSync("git", args, { cwd: repoPath, encoding: "utf8", timeout: 5_000 }).trim();
  try {
    const commit = git(["rev-parse", "HEAD"]);
    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
    const dirty = git(["status", "--porcelain"]).length > 0;
    return {
      present: true,
      path: repoPath,
      commit,
      short_commit: commit.slice(0, 9),
      branch,
      dirty,
    };
  } catch {
    return { present: false, path: repoPath };
  }
}

function printUsage() {
  process.stdout.write(
    [
      "Usage: node tests/e2e/run.mjs [options]",
      "",
      "Options:",
      "  --tier <1|2|3|4|5>    Tier(s) to run (repeatable or comma-separated; default: 1,2,3,4)",
      "  --feature <F1..F15>   Feature filter (repeatable or comma-separated; case-insensitive)",
      "  --json                Emit single JSON summary to stdout; progress routes to stderr",
      "  --bail                Stop after first failing/skipping/crashing/leaking test file",
      "  --timeout <ms>        Per-file timeout in ms (default: 120000; 240000 for Tier 4)",
      "  --dir <path>          Override tests/e2e root directory for test discovery",
      "  -h, --help            Show this help message",
      "",
    ].join("\n")
  );
}

function normalizeFeature(raw) {
  const m = String(raw).trim().match(/^f0*([1-9]\d*)$/i);
  if (!m) return null;
  const num = Number(m[1]);
  if (num < 1 || num > 15) return null;
  return `F${num}`;
}

function parseCliArgs(argv) {
  const tiers = [];
  const features = [];
  let json = false;
  let bail = false;
  const envTimeoutRaw = process.env.OPL_E2E_FILE_TIMEOUT_MS;
  const hasEnvTimeout = Boolean(envTimeoutRaw && Number(envTimeoutRaw) > 0);
  let timeoutMs = Number(envTimeoutRaw) || 120_000;
  let explicitTimeout = false;
  let rootDir = process.env.OPL_E2E_TESTS_DIR ? path.resolve(process.env.OPL_E2E_TESTS_DIR) : E2E_DIR;
  let help = false;

  function failArg(msg) {
    return { error: msg };
  }

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === "-h" || tok === "--help") {
      help = true;
      continue;
    }
    if (tok === "--json") {
      json = true;
      continue;
    }
    if (tok === "--bail") {
      bail = true;
      continue;
    }

    const eqIdx = tok.indexOf("=");
    const flag = eqIdx !== -1 ? tok.slice(0, eqIdx) : tok;
    let val = eqIdx !== -1 ? tok.slice(eqIdx + 1) : null;

    if (flag === "--tier" || flag === "--feature" || flag === "--timeout" || flag === "--dir") {
      if (val === null) {
        if (i + 1 >= argv.length) return failArg(`Missing value for ${flag}`);
        val = argv[++i];
      }
      if (flag === "--tier") {
        for (const part of val.split(",")) {
          const t = Number(part.trim());
          if (!Number.isInteger(t) || t < 1 || t > 5) {
            return failArg(`Invalid --tier value: ${part}`);
          }
          if (!tiers.includes(t)) tiers.push(t);
        }
      } else if (flag === "--feature") {
        for (const part of val.split(",")) {
          const norm = normalizeFeature(part);
          if (!norm) {
            return failArg(`Invalid --feature value: ${part} (expected F1..F15)`);
          }
          if (!features.includes(norm)) features.push(norm);
        }
      } else if (flag === "--timeout") {
        const num = Number(val);
        if (!Number.isInteger(num) || num <= 0) {
          return failArg(`Invalid --timeout value: ${val}`);
        }
        timeoutMs = num;
        explicitTimeout = true;
      } else if (flag === "--dir") {
        rootDir = path.resolve(val);
      }
      continue;
    }

    return failArg(`Unknown option: ${tok}`);
  }

  return {
    help,
    tiers: tiers.length > 0 ? tiers.sort((a, b) => a - b) : [1, 2, 3, 4],
    features,
    json,
    bail,
    timeoutMs,
    explicitTimeout,
    hasEnvTimeout,
    rootDir,
    error: null,
  };
}

function discoverTestFiles(rootDir, tiers, features) {
  const featureNums = new Set(features.map((f) => Number(f.slice(1))));
  const discovered = [];

  for (const tier of tiers) {
    const tierDir = path.join(rootDir, `tier${tier}`);
    if (!fs.existsSync(tierDir)) continue;
    const entries = fs
      .readdirSync(tierDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".test.mjs"))
      .map((e) => e.name)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    for (const name of entries) {
      if (features.length > 0 && (tier === 1 || tier === 2)) {
        const m = name.match(/^f(\d{2})-/i);
        if (!m || !featureNums.has(Number(m[1]))) continue;
      }
      const absFile = path.join(tierDir, name);
      discovered.push({
        tier,
        absFile,
        relFile: path.relative(WORKTREE_ROOT, absFile),
      });
    }
  }
  return discovered;
}

function parseNdjsonReport(reportPath) {
  const counts = {
    tests: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    todo: 0,
    cancelled: 0,
    duration_ms: 0,
  };
  const failures = [];
  let topSummary = null;
  let fileSummary = null;
  let realTestPassCount = 0;

  if (!fs.existsSync(reportPath)) {
    return { counts, failures, hasSummary: false, hasFileSummary: false };
  }

  const raw = fs.readFileSync(reportPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let ev;
    try {
      ev = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (ev.type === "test:pass") {
      if (ev.data?.skip !== undefined && ev.data?.skip !== false) {
        failures.push({
          name: ev.data.name,
          skip: true,
          todo: false,
          error: `Skipped test forbidden: ${String(ev.data.skip)}`,
        });
      } else if (ev.data?.todo !== undefined && ev.data?.todo !== false) {
        failures.push({
          name: ev.data.name,
          skip: false,
          todo: true,
          error: `Todo test forbidden: ${String(ev.data.todo)}`,
        });
      } else if (Boolean(ev.data?.entryFile) && ev.data?.details?.type !== "suite") {
        realTestPassCount++;
      }
    } else if (ev.type === "test:fail") {
      failures.push({
        name: ev.data?.name || "unknown",
        skip: false,
        todo: false,
        error: ev.data?.details?.error?.message || ev.data?.details?.error || "Test failed",
      });
    } else if (ev.type === "test:summary") {
      if (!ev.data?.file) topSummary = ev.data;
      else fileSummary = ev.data;
    }
  }

  const chosen = fileSummary || topSummary;
  if (chosen?.counts) {
    counts.tests = chosen.counts.tests ?? 0;
    counts.passed = chosen.counts.passed ?? 0;
    counts.failed = chosen.counts.failed ?? 0;
    counts.skipped = chosen.counts.skipped ?? 0;
    counts.todo = chosen.counts.todo ?? 0;
    counts.cancelled = chosen.counts.cancelled ?? 0;
    counts.duration_ms = chosen.duration_ms ?? 0;
  }

  if (!fileSummary && realTestPassCount === 0 && counts.failed === 0 && counts.skipped === 0 && counts.todo === 0 && counts.cancelled === 0) {
    counts.tests = 0;
    counts.passed = 0;
  }

  return { counts, failures, hasSummary: Boolean(chosen), hasFileSummary: Boolean(fileSummary) };
}

async function runSingleTestFile({ item, index, runId, features, timeoutMs, jsonMode }) {
  const fileRunId = `${runId}-${index}`;
  const tmpReportDir = fs.mkdtempSync(path.join(os.tmpdir(), "opl-e2e-rep-"));
  const reportPath = path.join(tmpReportDir, "report.ndjson");
  const spawnLogPath = path.join(tmpReportDir, "spawn.log");
  const preloadImportFlag = `--import=${pathToFileURL(PRELOAD_PATH).href}`;

  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.OPL_REPO_TEMP_ENV_ACTIVE;
  env.NODE_NO_WARNINGS = "1";
  env.OPL_E2E_RUN_ID = runId;
  env.OPL_E2E_FILE_RUN_ID = fileRunId;
  env.OPL_E2E_SPAWN_LOG = spawnLogPath;
  env.OPL_E2E_ROOT = WORKTREE_ROOT;
  env.OPL_E2E_STUBS_BIN = path.join(E2E_DIR, "stubs/bin");
  const existingNodeOpts = typeof env.NODE_OPTIONS === "string" ? env.NODE_OPTIONS.trim() : "";
  if (!existingNodeOpts.includes(preloadImportFlag)) {
    env.NODE_OPTIONS = existingNodeOpts ? `${existingNodeOpts} ${preloadImportFlag}` : preloadImportFlag;
  }
  if (features.length > 0) {
    env.OPL_E2E_FEATURES = features.join(",");
  }

  const nodeArgs = [
    "--test",
    `--test-reporter=${pathToFileURL(REPORTER_PATH).href}`,
    `--test-reporter-destination=${reportPath}`,
  ];
  if (features.length > 0 && (item.tier === 3 || item.tier === 4)) {
    nodeArgs.push(`--test-name-pattern=\\b(${features.join("|")})\\b`);
  }
  nodeArgs.push(item.absFile);

  const t0 = performance.now();
  let timedOut = false;
  let exitCode = 1;
  let stdout = "";
  let stderr = "";

  const child = spawn(process.execPath, nodeArgs, {
    cwd: WORKTREE_ROOT,
    detached: true,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const childPgid = child.pid;
  let killTimer = null;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      process.kill(-childPgid, "SIGTERM");
    } catch {
      // ignore
    }
    killTimer = setTimeout(() => {
      try {
        process.kill(-childPgid, "SIGKILL");
      } catch {
        // ignore
      }
    }, 1500);
  }, timeoutMs);

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    stdout += text;
    if (!jsonMode) process.stderr.write(text);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    stderr += text;
    if (!jsonMode) process.stderr.write(text);
  });

  exitCode = await new Promise((resolve) => {
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });

  clearTimeout(timer);
  if (killTimer) clearTimeout(killTimer);

  const parsed = parseNdjsonReport(reportPath);
  const leaked = detectLeakedProcesses({ fileRunId, pgid: childPgid, spawnLogPath });
  fs.rmSync(tmpReportDir, { recursive: true, force: true });

  if (leaked.length > 0) {
    await reapProcesses(leaked, { graceMs: 500 });
  }

  const fileLevelCrash =
    exitCode !== 0 &&
    ((parsed.counts.failed === 0 && parsed.counts.skipped === 0 && parsed.counts.todo === 0 && parsed.counts.cancelled === 0) ||
      (!parsed.hasFileSummary && parsed.counts.passed === 0));
  const crashed = timedOut || fileLevelCrash;
  const durationMs = Math.round(performance.now() - t0);
  if (!parsed.counts.duration_ms) parsed.counts.duration_ms = durationMs;

  return {
    tier: item.tier,
    file: item.relFile,
    exit_code: exitCode,
    timed_out: timedOut,
    crashed,
    counts: parsed.counts,
    failures: crashed && parsed.failures.length === 0 ? [{ name: "file", skip: false, todo: false, error: stderr.trim() || `File exited with code ${exitCode}` }] : parsed.failures,
    leaked_processes: leaked.map((p) => ({ pid: p.pid, pgid: p.pgid, command: p.command.slice(0, 200) })),
  };
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  if (opts.help) {
    printUsage();
    process.exit(0);
  }
  if (opts.error) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ ok: false, error: opts.error }) + "\n");
    } else {
      process.stderr.write(`Error: ${opts.error}\n`);
    }
    process.exit(2);
  }

  const runId = crypto.randomBytes(6).toString("hex");
  const files = discoverTestFiles(opts.rootDir, opts.tiers, opts.features);
  const startedAt = new Date().toISOString();
  const startMs = performance.now();

  const fileResults = [];
  const totals = {
    files: files.length,
    tests: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    todo: 0,
    cancelled: 0,
    crashed_files: 0,
    leaked_processes: 0,
    duration_ms: 0,
  };

  for (let i = 0; i < files.length; i++) {
    const item = files[i];
    if (!opts.json) {
      process.stderr.write(`[e2e] Running tier ${item.tier}: ${item.relFile}\n`);
    }
    const fileTimeoutMs =
      !opts.explicitTimeout && !opts.hasEnvTimeout && item.tier === 4
        ? Math.max(opts.timeoutMs, 240_000)
        : opts.timeoutMs;
    const res = await runSingleTestFile({
      item,
      index: i,
      runId,
      features: opts.features,
      timeoutMs: fileTimeoutMs,
      jsonMode: opts.json,
    });
    fileResults.push(res);

    totals.tests += res.counts.tests;
    totals.passed += res.counts.passed;
    totals.failed += res.counts.failed;
    totals.skipped += res.counts.skipped;
    totals.todo += res.counts.todo;
    totals.cancelled += res.counts.cancelled;
    if (res.crashed) totals.crashed_files++;
    totals.leaked_processes += res.leaked_processes.length;

    const fileBad =
      res.crashed ||
      res.counts.failed > 0 ||
      res.counts.skipped > 0 ||
      res.counts.todo > 0 ||
      res.counts.cancelled > 0 ||
      res.leaked_processes.length > 0;

    if (opts.bail && fileBad) {
      break;
    }
  }

  // Final run-wide leak sweep
  const runLeaks = detectLeakedProcesses({ runId });
  if (runLeaks.length > 0) {
    await reapProcesses(runLeaks, { graceMs: 500 });
    totals.leaked_processes += runLeaks.length;
  }

  totals.duration_ms = Math.round(performance.now() - startMs);
  const finishedAt = new Date().toISOString();

  const ok =
    totals.passed > 0 &&
    totals.failed === 0 &&
    totals.skipped === 0 &&
    totals.todo === 0 &&
    totals.cancelled === 0 &&
    totals.crashed_files === 0 &&
    totals.leaked_processes === 0;

  const summary = {
    run_id: runId,
    started_at: startedAt,
    finished_at: finishedAt,
    repositories: {
      framework: inspectGitRepo(WORKTREE_ROOT),
      studio: inspectGitRepo(resolveStudioRoot(WORKTREE_ROOT)),
      app: inspectGitRepo(resolveAppRoot(WORKTREE_ROOT)),
    },
    tiers: opts.tiers,
    features: opts.features,
    totals,
    ok,
    files: fileResults,
    ...(runLeaks.length > 0 ? { run_leaks: runLeaks.map((p) => ({ pid: p.pid, command: p.command.slice(0, 200) })) } : {}),
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  } else {
    process.stderr.write(
      `[e2e] Done: ok=${ok} files=${fileResults.length}/${totals.files} passed=${totals.passed} failed=${totals.failed} skipped=${totals.skipped} todo=${totals.todo} cancelled=${totals.cancelled} crashed=${totals.crashed_files} leaks=${totals.leaked_processes} (${totals.duration_ms}ms)\n`
    );
  }

  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`Fatal e2e runner error: ${err?.stack || err}\n`);
  process.exit(1);
});
