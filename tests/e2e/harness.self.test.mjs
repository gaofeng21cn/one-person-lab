import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { runCli, runCliExpectCode, runCliJson, runCliOk, resolveOplBin } from "./lib/cli.mjs";
import {
  WAVE3_DOMAIN_PRESETS,
  addLegacyCarrierFiles,
  buildAll8Wave3Fixtures,
  buildConnectPair,
  buildCorruptV1Fixture,
  buildExternalCodexPlugin,
  buildInvalidV2Fixture,
  buildKnowledgeSourceDir,
  buildObsidianVaultDir,
  buildV1DomainFixture,
  buildV2Package,
  computeContentLock,
  createLocalOciDir,
  createLocalPackageArchive,
  escalateProviderCapability,
  assertCodexPluginPayload,
  readCodexMarketplaceProjection,
  sha256File,
  tamperBindTokenSignature,
  tamperPackageFile,
} from "./lib/fixtures.mjs";
import { OplRpcClient, RpcError, assertRpcError, connectRpcClient } from "./lib/rpc-client.mjs";
import {
  createSandbox,
  detectLeakedProcesses,
  isPidAlive,
  measureLatencyMs,
  reapProcesses,
  waitForStubLogEvent,
} from "./lib/sandbox.mjs";
import {
  assertDqsZeroEnforced,
  assertLedgerRefsOnly,
  assertNoDuplicateAttempts,
  assertNoPlaintextSecrets,
  assertNoRawKnowledgeContentInDb,
  assertPausedByHumanSovereignty,
  assertPragmas,
  assertSchema,
  assertStageRunStatus,
  assertTaskStatus,
  countTasks,
  getAttempt,
  getAttempts,
  getConnectAuditEvents,
  getConnection,
  getGrants,
  getInstalledPackage,
  getKnowledgeSnapshots,
  getKnowledgeSnapshotsBySource,
  getKnowledgeSource,
  getKnowledgeSources,
  getLedgerEntries,
  getPackageOperations,
  getSchedule,
  getStageRun,
  getStageRuns,
  getTask,
  getWorkspace,
  listSchedules,
  listTasks,
  openOplDb,
  seedCrashRecoveryScenario,
  seedStaleStageRun,
  seedWakeFromSleepSchedules,
  txImmediate,
  waitForDbState,
} from "./lib/sqlite-inspector.mjs";

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
const RUN_MJS = path.join(E2E_DIR, "run.mjs");

const FULL_DDL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
PRAGMA temp_store = MEMORY;

CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);
CREATE TABLE workspaces (workspace_id TEXT PRIMARY KEY, name TEXT NOT NULL, root_path TEXT NOT NULL UNIQUE, domain_id TEXT, revision INTEGER NOT NULL DEFAULT 1, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE knowledge_sources (source_id TEXT PRIMARY KEY, scope TEXT NOT NULL CHECK (scope IN ('personal_profile', 'long_term_topic', 'project_local')), adapter_kind TEXT NOT NULL, root_path TEXT NOT NULL, accepted_revision TEXT, status TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'unavailable')), updated_at TEXT NOT NULL);
CREATE TABLE knowledge_snapshots (snapshot_id TEXT PRIMARY KEY, stage_run_id TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES knowledge_sources(source_id), revision TEXT NOT NULL, manifest_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE installed_packages (package_id TEXT PRIMARY KEY, version TEXT NOT NULL, intent TEXT NOT NULL CHECK (intent IN ('agent', 'app', 'extension', 'channel')), origin TEXT NOT NULL CHECK (origin IN ('opl', 'external', 'local_dev')), install_mode TEXT NOT NULL CHECK (install_mode IN ('release', 'dev_link')), install_path TEXT NOT NULL, content_digest TEXT NOT NULL, manifest_json TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, carrier_synced INTEGER NOT NULL DEFAULT 0, installed_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE package_operations (op_id TEXT PRIMARY KEY, batch_id TEXT, package_id TEXT NOT NULL, action TEXT NOT NULL CHECK (action IN ('install', 'update', 'uninstall', 'repair', 'sync')), target_version TEXT, status TEXT NOT NULL CHECK (status IN ('queued', 'preparing', 'downloading', 'verifying', 'installing', 'succeeded', 'failed', 'cancelled', 'interrupted')), reload_mode TEXT CHECK (reload_mode IN ('none', 'renderer_reload', 'restart_required')), progress_json TEXT NOT NULL DEFAULT '{}', error_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE connections (connection_id TEXT PRIMARY KEY, provider_type TEXT NOT NULL, display_name TEXT NOT NULL, account_label TEXT, credential_handle TEXT NOT NULL, security_revision INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL CHECK (status IN ('active', 'disabled', 'expired', 'deleted')), updated_at TEXT NOT NULL);
CREATE TABLE connection_grants (grant_id TEXT PRIMARY KEY, consumer_package_id TEXT NOT NULL, consumer_content_digest TEXT NOT NULL, connection_id TEXT NOT NULL REFERENCES connections(connection_id), connection_security_revision INTEGER NOT NULL, capability_id TEXT NOT NULL, capability_title TEXT NOT NULL, capability_risk TEXT NOT NULL CHECK (capability_risk IN ('read', 'local_write', 'external_write')), status TEXT NOT NULL CHECK (status IN ('requested', 'granted', 'denied', 'revoked', 'superseded')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX idx_grants_lookup ON connection_grants(consumer_package_id, connection_id, capability_id, status);
CREATE TABLE tasks (task_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id), agent_id TEXT, title TEXT NOT NULL, goal_prompt TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('active', 'paused_by_human', 'awaiting_human', 'completed', 'cancelled', 'failed')), revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE stage_runs (stage_run_id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE, stage_id TEXT NOT NULL, seq_no INTEGER NOT NULL, status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'awaiting_review', 'repair_required', 'human_gate', 'paused_by_human', 'completed', 'failed', 'cancelled')), executor_id TEXT NOT NULL, model_id TEXT, human_gate_json TEXT, revision INTEGER NOT NULL DEFAULT 1, started_at TEXT, finished_at TEXT, updated_at TEXT NOT NULL);
CREATE INDEX idx_stage_runs_task ON stage_runs(task_id, seq_no);
CREATE TABLE attempts (attempt_id TEXT PRIMARY KEY, stage_run_id TEXT NOT NULL REFERENCES stage_runs(stage_run_id) ON DELETE CASCADE, attempt_no INTEGER NOT NULL, role TEXT NOT NULL CHECK (role IN ('producer', 'reviewer', 'repairer', 'utility')), executor_id TEXT NOT NULL, executor_session_ref TEXT, local_pid INTEGER, status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'interrupted', 'cancelled', 'timed_out')), lease_expires_at TEXT, usage_json TEXT NOT NULL DEFAULT '{}', error_json TEXT, started_at TEXT NOT NULL, finished_at TEXT);
CREATE INDEX idx_attempts_live ON attempts(status, lease_expires_at);
CREATE TABLE ledger_entries (entry_id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE, stage_run_id TEXT REFERENCES stage_runs(stage_run_id), attempt_id TEXT REFERENCES attempts(attempt_id), entry_kind TEXT NOT NULL CHECK (entry_kind IN ('artifact_ref', 'owner_receipt', 'quality_debt', 'review_verdict', 'typed_blocker', 'human_decision', 'failed_path_note')), owner_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX idx_ledger_task ON ledger_entries(task_id, created_at);
CREATE TABLE schedules (schedule_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id), agent_id TEXT, cron_expr TEXT NOT NULL, timezone TEXT NOT NULL DEFAULT 'local', overlap_policy TEXT NOT NULL CHECK (overlap_policy IN ('skip', 'buffer_one', 'cancel_other')) DEFAULT 'skip', payload_json TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, next_run_at TEXT NOT NULL, last_run_at TEXT, last_task_id TEXT, updated_at TEXT NOT NULL);
`;

const activeSandboxes = [];
const tempDirs = [];

function makeTmpDir(prefix = "opl-harness-self-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (activeSandboxes.length > 0) {
    const sb = activeSandboxes.pop();
    await sb.cleanup();
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("E2E-M1 Harness Self-Tests", () => {
  describe("1. run.mjs strict gating & filtering", () => {
    it("supports --help and rejects invalid CLI flags with exit 2", () => {
      const help = spawnSync(process.execPath, [RUN_MJS, "--help"], { encoding: "utf8" });
      assert.equal(help.status, 0);
      assert.match(help.stdout, /--tier/);

      for (const bad of [["--tier", "9"], ["--feature", "F99"], ["--unknown-flag"], ["--timeout", "abc"]]) {
        const res = spawnSync(process.execPath, [RUN_MJS, ...bad], { encoding: "utf8" });
        assert.equal(res.status, 2, `Expected exit 2 for ${bad.join(" ")}`);
      }
    });

    it("passes strictly when passed > 0 and zero failures/skips/todos/crashes/leaks, and supports --feature filtering", () => {
      const suiteDir = makeTmpDir("opl-run-pass-");
      fs.mkdirSync(path.join(suiteDir, "tier1"), { recursive: true });
      fs.mkdirSync(path.join(suiteDir, "tier2"), { recursive: true });
      fs.mkdirSync(path.join(suiteDir, "tier3"), { recursive: true });

      fs.writeFileSync(
        path.join(suiteDir, "tier1", "f01-core.test.mjs"),
        `import { it } from "node:test"; import assert from "node:assert/strict"; it("T1-F1-01", () => assert.equal(1, 1));`,
        "utf8"
      );
      fs.writeFileSync(
        path.join(suiteDir, "tier2", "f02-pack-neg.test.mjs"),
        `import { it } from "node:test"; import assert from "node:assert/strict"; it("T2-F2-01", () => assert.equal(2, 2));`,
        "utf8"
      );
      fs.writeFileSync(
        path.join(suiteDir, "tier3", "pairwise.test.mjs"),
        `import { it } from "node:test"; import assert from "node:assert/strict";\nit("T3-01 (F1 x F2)", () => assert.equal(3, 3));\nit("T3-02 (F3 x F4)", () => assert.equal(4, 4));`,
        "utf8"
      );

      const full = spawnSync(process.execPath, [RUN_MJS, "--dir", suiteDir, "--json"], { encoding: "utf8" });
      assert.equal(full.status, 0, full.stderr);
      const fullJson = JSON.parse(full.stdout);
      assert.equal(fullJson.ok, true);
      assert.equal(fullJson.totals.passed, 4);
      assert.equal(fullJson.totals.skipped, 0);
      assert.equal(fullJson.totals.leaked_processes, 0);
      assert.equal(typeof fullJson.started_at, "string");
      assert.equal(typeof fullJson.finished_at, "string");
      assert.match(fullJson.repositories?.framework?.commit ?? "", /^[0-9a-f]{40}$/);

      const filtered = spawnSync(process.execPath, [RUN_MJS, "--dir", suiteDir, "--feature", "F1", "--json"], {
        encoding: "utf8",
      });
      assert.equal(filtered.status, 0, filtered.stderr);
      const filtJson = JSON.parse(filtered.stdout);
      assert.equal(filtJson.ok, true);
      assert.equal(filtJson.totals.passed, 2);
      assert.equal(filtJson.totals.skipped, 0);
    });

    it("fails with exit 1 on test.skip, test.todo, zero tests, file crash, --bail, and detached leaked process", () => {
      // A: skipped test
      const skipDir = makeTmpDir("opl-run-skip-");
      fs.mkdirSync(path.join(skipDir, "tier1"), { recursive: true });
      fs.writeFileSync(
        path.join(skipDir, "tier1", "f01-skip.test.mjs"),
        `import { it } from "node:test"; it("T1-F1-01", (t) => { t.skip("nope"); });`,
        "utf8"
      );
      const skipRes = spawnSync(process.execPath, [RUN_MJS, "--dir", skipDir, "--json"], { encoding: "utf8" });
      assert.equal(skipRes.status, 1);
      assert.equal(JSON.parse(skipRes.stdout).ok, false);
      assert.equal(JSON.parse(skipRes.stdout).totals.skipped, 1);

      // B: todo test
      const todoDir = makeTmpDir("opl-run-todo-");
      fs.mkdirSync(path.join(todoDir, "tier1"), { recursive: true });
      fs.writeFileSync(
        path.join(todoDir, "tier1", "f01-todo.test.mjs"),
        `import { it } from "node:test"; it("T1-F1-01", { todo: true }, () => {});`,
        "utf8"
      );
      const todoRes = spawnSync(process.execPath, [RUN_MJS, "--dir", todoDir, "--json"], { encoding: "utf8" });
      assert.equal(todoRes.status, 1);
      assert.equal(JSON.parse(todoRes.stdout).totals.todo, 1);

      // C: empty suite (passed === 0)
      const emptyDir = makeTmpDir("opl-run-empty-");
      const emptyRes = spawnSync(process.execPath, [RUN_MJS, "--dir", emptyDir, "--json"], { encoding: "utf8" });
      assert.equal(emptyRes.status, 1);
      assert.equal(JSON.parse(emptyRes.stdout).ok, false);

      // D: syntax crash + --bail stops before second file
      const crashDir = makeTmpDir("opl-run-crash-");
      fs.mkdirSync(path.join(crashDir, "tier1"), { recursive: true });
      fs.writeFileSync(path.join(crashDir, "tier1", "f01-crash.test.mjs"), `const broken = (`, "utf8");
      fs.writeFileSync(
        path.join(crashDir, "tier1", "f02-good.test.mjs"),
        `import { it } from "node:test"; it("ok", () => {});`,
        "utf8"
      );
      const crashRes = spawnSync(process.execPath, [RUN_MJS, "--dir", crashDir, "--bail", "--json"], { encoding: "utf8" });
      assert.equal(crashRes.status, 1);
      const crashJson = JSON.parse(crashRes.stdout);
      assert.equal(crashJson.totals.crashed_files, 1);
      assert.equal(crashJson.files.length, 1);

      // E: leaked detached child process detected & reaped via ps eww
      const leakDir = makeTmpDir("opl-run-leak-");
      fs.mkdirSync(path.join(leakDir, "tier1"), { recursive: true });
      const pidMarkerFile = path.join(leakDir, "leaked.pid");
      fs.writeFileSync(
        path.join(leakDir, "tier1", "f01-leak.test.mjs"),
        `import { it } from "node:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
it("leaks detached process", () => {
  const c = spawn(process.execPath, ["-e", "setInterval(() => {}, 10000)"], { detached: true, stdio: "ignore" });
  c.unref();
  fs.writeFileSync(${JSON.stringify(pidMarkerFile)}, String(c.pid), "utf8");
});`,
        "utf8"
      );
      const leakRes = spawnSync(process.execPath, [RUN_MJS, "--dir", leakDir, "--json"], { encoding: "utf8" });
      assert.equal(leakRes.status, 1);
      const leakJson = JSON.parse(leakRes.stdout);
      assert.ok(leakJson.totals.leaked_processes >= 1);
      const leakedPid = Number(fs.readFileSync(pidMarkerFile, "utf8").trim());
      assert.equal(isPidAlive(leakedPid), false, "Leaked detached process must be SIGKILL-reaped");
    });

    it("catches and reaps detached system binary (sleep 60) and env-scrubbed leaks via preload tracker", () => {
      const sleepLeakDir = makeTmpDir("opl-run-sleep-leak-");
      fs.mkdirSync(path.join(sleepLeakDir, "tier1"), { recursive: true });
      const pidMarkerFile = path.join(sleepLeakDir, "sleep-leaks.json");
      fs.writeFileSync(
        path.join(sleepLeakDir, "tier1", "f01-sleep-leak.test.mjs"),
        `import { it } from "node:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
it("leaks detached sleep binaries", () => {
  const c1 = spawn("sleep", ["60"], { detached: true, stdio: "ignore" });
  c1.unref();
  const c2 = spawn("sleep", ["60"], { detached: true, stdio: "ignore", env: { PATH: process.env.PATH } });
  c2.unref();
  fs.writeFileSync(${JSON.stringify(pidMarkerFile)}, JSON.stringify([c1.pid, c2.pid]), "utf8");
});`,
        "utf8"
      );

      const res = spawnSync(process.execPath, [RUN_MJS, "--dir", sleepLeakDir, "--json"], { encoding: "utf8" });
      assert.equal(res.status, 1, `Expected exit 1 on detached sleep leak, got ${res.status}: ${res.stdout}`);
      const json = JSON.parse(res.stdout);
      assert.equal(json.ok, false);
      assert.ok(json.totals.leaked_processes >= 2, `Expected >=2 leaked processes, got ${json.totals.leaked_processes}`);
      const pids = JSON.parse(fs.readFileSync(pidMarkerFile, "utf8"));
      for (const pid of pids) {
        assert.equal(isPidAlive(pid), false, `Detached sleep pid ${pid} must be reaped`);
      }
    });

    it("fails with exit 1 and passed === 0 when Tier 3/4 --feature filter matches zero tests", () => {
      const zeroDir = makeTmpDir("opl-run-zero-match-");
      fs.mkdirSync(path.join(zeroDir, "tier3"), { recursive: true });
      fs.writeFileSync(
        path.join(zeroDir, "tier3", "pairwise.test.mjs"),
        `import { describe, it } from "node:test";
import assert from "node:assert/strict";
it("T3-01 (F1 x F2)", () => assert.equal(1, 1));
describe("Pairwise suite", () => {
  it("T3-02 (F3 x F4)", () => assert.equal(2, 2));
});`,
        "utf8"
      );

      const res = spawnSync(process.execPath, [RUN_MJS, "--dir", zeroDir, "--tier", "3", "--feature", "F15", "--json"], {
        encoding: "utf8",
      });
      assert.equal(res.status, 1, `Expected exit 1 on zero-match --feature F15, got ${res.status}: ${res.stdout}`);
      const json = JSON.parse(res.stdout);
      assert.equal(json.ok, false);
      assert.equal(json.totals.tests, 0);
      assert.equal(json.totals.passed, 0);
    });
  });

  describe("2. sandbox.mjs sun_path, isolation, daemon lifecycle, ps eww reap & measureLatencyMs", () => {
    it("isolates directories, keeps sun_path < 96B, detects & reaps detached grandchildren, and measures latency percentiles", async () => {
      const sb = createSandbox();
      activeSandboxes.push(sb);

      assert.ok(Buffer.byteLength(sb.sockPath, "utf8") < 96, `sockPath too long: ${sb.sockPath}`);
      assert.equal(sb.env.HOME, sb.homeDir);
      assert.equal(sb.env.OPL_HOME, path.join(sb.homeDir, ".opl"));
      assert.equal(sb.env.OPL_STATE_DIR, sb.stateDir);
      assert.equal(sb.env.OPL_CONFIG_DIR, sb.configDir);
      assert.equal(sb.env.CODEX_HOME, sb.codexHome);
      assert.ok(sb.env.PATH.startsWith(sb.stubsBinDir + path.delimiter));

      // Spawn a detached orphan inside sandbox without tracking it directly in spawnTracked
      const launcher = spawnSync(
        process.execPath,
        [
          "-e",
          `const { spawn } = require("node:child_process");
           const c = spawn(process.execPath, ["-e", "setInterval(() => {}, 10000)"], { detached: true, stdio: "ignore" });
           c.unref();
           process.stdout.write(String(c.pid));`,
        ],
        { env: sb.env, encoding: "utf8" }
      );
      const orphanPid = Number(launcher.stdout.trim());
      assert.ok(isPidAlive(orphanPid));

      const detected = detectLeakedProcesses({ sandboxId: sb.sandboxId });
      assert.ok(detected.some((p) => p.pid === orphanPid));

      const stats = await measureLatencyMs(async () => {}, { iterations: 25, warmup: 3 });
      assert.equal(stats.iterations, 25);
      assert.ok(stats.min <= stats.p50 && stats.p50 <= stats.p95 && stats.p95 <= stats.p99 && stats.p99 <= stats.max);

      await sb.cleanup();
      assert.equal(isPidAlive(orphanPid), false);
      assert.equal(fs.existsSync(sb.root), false);
      activeSandboxes.pop();
    });

    it("supports startDaemon, waitForDaemonReady, killDaemon (SIGKILL), and stopDaemon", async () => {
      const sb = createSandbox();
      activeSandboxes.push(sb);

      const mockOpld = path.join(sb.root, "mock-opld.mjs");
      fs.writeFileSync(
        mockOpld,
        `#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
const sockPath = process.env.OPL_STATE_DIR + "/run/opld.sock";
const sessPath = process.env.OPL_STATE_DIR + "/run/opld.session.json";
const token = crypto.randomBytes(32).toString("hex");
const srv = net.createServer((s) => s.end());
srv.listen(sockPath, () => {
  fs.chmodSync(sockPath, 0o600);
  fs.writeFileSync(sessPath, JSON.stringify({ pid: process.pid, version: "2.0.0", socket_path: sockPath, token }), { mode: 0o600 });
});
process.on("SIGTERM", () => { srv.close(() => process.exit(0)); });
`,
        { encoding: "utf8", mode: 0o755 }
      );
      fs.chmodSync(mockOpld, 0o755);

      const started = await sb.startDaemon({ binPath: mockOpld, args: [], detachedChild: true });
      assert.ok(isPidAlive(started.pid));
      await sb.killDaemon({ signal: "SIGKILL" });
      assert.equal(isPidAlive(started.pid), false);

      fs.rmSync(sb.sockPath, { force: true });
      fs.rmSync(sb.sessionPath, { force: true });
      const restarted = await sb.startDaemon({ binPath: mockOpld, args: [], detachedChild: true });
      assert.ok(isPidAlive(restarted.pid));
      await sb.stopDaemon();
      assert.equal(isPidAlive(restarted.pid), false);
    });

    it("refuses to self-kill when opld.session.json holds process.pid and matches env tokens on boundaries", async () => {
      const sb = createSandbox();
      activeSandboxes.push(sb);

      fs.writeFileSync(
        sb.sessionPath,
        JSON.stringify({ pid: process.pid, socket_path: sb.sockPath, token: "a".repeat(64) }),
        { mode: 0o600 }
      );

      await assert.rejects(() => sb.killDaemon(), /no live opld|refusing to signal/i);
      assert.equal(await sb.stopDaemon(), null);
      assert.equal(isPidAlive(process.pid), true);

      const launcher = spawnSync(
        process.execPath,
        [
          "-e",
          `const { spawn } = require("node:child_process");
           const c = spawn(process.execPath, ["-e", "setInterval(() => {}, 10000)"], { detached: true, stdio: "ignore" });
           c.unref();
           process.stdout.write(String(c.pid));`,
        ],
        { env: { ...sb.env, OPL_E2E_FILE_RUN_ID: "run-10" }, encoding: "utf8" }
      );
      const childPid = Number(launcher.stdout.trim());
      assert.ok(isPidAlive(childPid));
      try {
        assert.equal(detectLeakedProcesses({ fileRunId: "run-1" }).some((p) => p.pid === childPid), false);
        assert.equal(detectLeakedProcesses({ fileRunId: "run-10" }).some((p) => p.pid === childPid), true);
      } finally {
        await reapProcesses([{ pid: childPid, pgid: childPid }], { graceMs: 200 });
      }
      assert.equal(isPidAlive(childPid), false);
    });
  });

  describe("3. rpc-client.mjs against mock net.createServer opld", () => {
    it("handles handshake, -32001 UNAUTHORIZED destroy, -32003 TRUSTED_HOST_REQUIRED, and interleaved event.* push", async () => {
      const sb = createSandbox();
      activeSandboxes.push(sb);
      const token = crypto.randomBytes(32).toString("hex");

      const server = net.createServer((socket) => {
        let buf = "";
        let authed = false;
        let clientKind = "external";
        const send = (obj) => socket.write(JSON.stringify(obj) + "\n");

        socket.on("data", (chunk) => {
          buf += chunk.toString("utf8");
          let idx;
          while ((idx = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line) continue;
            const req = JSON.parse(line);

            if (req.method === "daemon.handshake") {
              if (req.params?.token !== token) {
                send({ jsonrpc: "2.0", id: req.id, error: { code: -32001, message: "UNAUTHORIZED" } });
                socket.destroy();
                return;
              }
              authed = true;
              clientKind = req.params.client_kind;
              send({ jsonrpc: "2.0", id: req.id, result: { session_id: "s-1", api_version: "2.0", client_kind: clientKind } });
              continue;
            }
            if (!authed) {
              send({ jsonrpc: "2.0", id: req.id, error: { code: -32001, message: "HANDSHAKE_REQUIRED" } });
              continue;
            }
            if (req.method === "connect.approveRequest" && !["opl_app", "opl_cli"].includes(clientKind)) {
              send({ jsonrpc: "2.0", id: req.id, error: { code: -32003, message: "TRUSTED_HOST_REQUIRED" } });
              continue;
            }
            if (req.method === "pack.updateAll") {
              send({ jsonrpc: "2.0", method: "event.pack.progress", params: { package_id: "mas", percent: 50 } });
              send({ jsonrpc: "2.0", method: "event.pack.progress", params: { package_id: "mas", percent: 100, reload_mode: "renderer_reload" } });
              send({ jsonrpc: "2.0", id: req.id, result: { updated: ["mas"], reload_mode: "renderer_reload" } });
              continue;
            }
            send({ jsonrpc: "2.0", id: req.id, result: { ok: true } });
          }
        });
      });

      await new Promise((resolve) => {
        server.listen(sb.sockPath, () => {
          fs.chmodSync(sb.sockPath, 0o600);
          fs.writeFileSync(sb.sessionPath, JSON.stringify({ pid: process.pid, socket_path: sb.sockPath, token }), { mode: 0o600 });
          resolve();
        });
      });

      try {
        // 1. Bad token -> -32001 + socket closed
        const badClient = new OplRpcClient({ sessionPath: sb.sessionPath, token: "0".repeat(64), autoHandshake: false });
        await badClient.connect();
        await assertRpcError(() => badClient.handshake(), -32001, "UNAUTHORIZED");
        const closeInfo = await badClient.waitForClose();
        assert.equal(closeInfo.closed, true);

        // 2. Pre-handshake call -> -32001 HANDSHAKE_REQUIRED
        const unauthed = new OplRpcClient({ sessionPath: sb.sessionPath, autoHandshake: false });
        await unauthed.connect();
        await assertRpcError(() => unauthed.call("app.state.get"), -32001, "HANDSHAKE_REQUIRED");
        await unauthed.close();

        // 3. Untrusted clientKind -> -32003 TRUSTED_HOST_REQUIRED
        const ext = await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "sdk_python" });
        await assertRpcError(() => ext.call("connect.approveRequest", { request_id: "r1" }), -32003, "TRUSTED_HOST_REQUIRED");
        await ext.close();

        // 4. Trusted opl_app + interleaved event.* buffering
        const app = await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" });
        const seen = [];
        const off = app.onEvent((ev) => seen.push(ev.method));
        const res = await app.call("pack.updateAll", {});
        assert.equal(res.reload_mode, "renderer_reload");
        assert.equal(app.peekEvents("event.pack.*").length, 2);
        const ev2 = await app.waitForEvent((ev) => ev.params?.reload_mode === "renderer_reload");
        assert.equal(ev2.params.percent, 100);
        const drained = app.drainEvents("event.pack.*");
        assert.equal(drained.length, 2);
        assert.equal(app.peekEvents().length, 0);
        assert.equal(seen.length, 2);
        off();
        await app.close();
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it("decodes multi-byte UTF-8 RPC responses split across socket chunks without corruption", async () => {
      const sb = createSandbox();
      activeSandboxes.push(sb);
      const token = crypto.randomBytes(32).toString("hex");
      const expectedText = "中文🚀边界";

      const server = net.createServer((socket) => {
        let buf = "";
        socket.on("data", (chunk) => {
          buf += chunk.toString("utf8");
          let idx;
          while ((idx = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line) continue;
            const req = JSON.parse(line);
            if (req.method === "daemon.handshake") {
              socket.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { session_id: "s-utf8", api_version: "2.0" } }) + "\n");
              continue;
            }
            const fullBuf = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { text: expectedText } }) + "\n", "utf8");
            const rocketPos = fullBuf.indexOf(Buffer.from("🚀", "utf8"));
            assert.ok(rocketPos > 0);
            socket.write(fullBuf.subarray(0, rocketPos + 2));
            setTimeout(() => {
              socket.write(fullBuf.subarray(rocketPos + 2));
            }, 10);
          }
        });
      });

      await new Promise((resolve) => {
        server.listen(sb.sockPath, () => {
          fs.writeFileSync(sb.sessionPath, JSON.stringify({ pid: process.pid, socket_path: sb.sockPath, token }), { mode: 0o600 });
          resolve();
        });
      });

      try {
        const client = await connectRpcClient({ sessionPath: sb.sessionPath });
        const res = await client.call("utf8.echo");
        assert.equal(res.text, expectedText);
        await client.close();
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });

  describe("4. cli.mjs invocation, JSON parsing, exit codes & timeout", () => {
    it("resolves OPL_BIN override, parses JSON, verifies exit codes 0/2/4, and kills timed-out process groups", async () => {
      const sb = createSandbox();
      activeSandboxes.push(sb);

      const mockCli = path.join(sb.root, "mock-opl");
      fs.writeFileSync(
        mockCli,
        `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "ok") { process.stdout.write(JSON.stringify({ ok: true, args }) + "\\n"); process.exit(0); }
if (args[0] === "bad") { process.stderr.write("bad usage\\n"); process.exit(2); }
if (args[0] === "gate") { process.stdout.write(JSON.stringify({ status: "paused_by_human" }) + "\\n"); process.exit(4); }
if (args[0] === "sleep") { setInterval(() => {}, 10000); }
`,
        { encoding: "utf8", mode: 0o755 }
      );
      fs.chmodSync(mockCli, 0o755);

      assert.equal(resolveOplBin({ binPath: mockCli }), mockCli);
      const jsonOut = await runCliJson(["ok", "sub"], { sandbox: sb, binPath: mockCli });
      assert.equal(jsonOut.ok, true);
      assert.deepEqual(jsonOut.args, ["ok", "sub", "--json"]);

      await runCliOk(["ok"], { sandbox: sb, binPath: mockCli });
      await runCliExpectCode(["bad"], 2, { sandbox: sb, binPath: mockCli });
      const gateRes = await runCliExpectCode(["gate"], 4, { sandbox: sb, binPath: mockCli });
      assert.equal(gateRes.json.status, "paused_by_human");

      const timed = await runCli(["sleep"], { sandbox: sb, binPath: mockCli, timeoutMs: 150 });
      assert.equal(timed.timedOut, true);
    });
  });

  describe("5. fixtures.mjs v2 intents, deterministic content lock, 8 Wave 3 presets & mutators", () => {
    it("builds all 4 v2 package intents and computes order-independent SHA-256 content locks", () => {
      const dir = makeTmpDir("opl-fix-v2-");
      const agent = buildV2Package(path.join(dir, "agent"), { intent: "agent", id: "mas" });
      const app = buildV2Package(path.join(dir, "app"), { intent: "app", id: "opl-relay" });
      const ext = buildV2Package(path.join(dir, "ext"), { intent: "extension", id: "opl-foundry" });
      const ch = buildV2Package(path.join(dir, "ch"), { intent: "channel", id: "opl-channel-weixin" });

      assert.equal(agent.manifest.schema_version, "opl.package.v2");
      assert.equal(app.manifest.ui.mcp_apps[0].mcp_server_id, "opl-relay-mcp");
      assert.equal(ext.manifest.provides.cli_extensions[0].namespace, "foundry");
      assert.equal(ch.manifest.host_hints.codex.sync_enabled, false);

      const lockA = computeContentLock(agent.dir);
      const lockB = computeContentLock(agent.dir, [...lockA.paths].reverse());
      assert.equal(lockA.canonicalization, "ordered_path_length_file_length_bytes");
      assert.equal(lockA.digest, lockB.digest);

      fs.writeFileSync(path.join(dir, "outside-secret.txt"), "top-secret", "utf8");
      assert.throws(() => computeContentLock(agent.dir, ["../outside-secret.txt"]), /outside rootDir/i);
      assert.throws(() => computeContentLock(agent.dir, ["/etc/hosts"]), /outside rootDir/i);

      const tgz = createLocalPackageArchive(agent.dir, path.join(dir, "dist"));
      assert.ok(fs.existsSync(tgz.archivePath));
      const oci = createLocalOciDir(agent.dir, path.join(dir, "oci"));
      assert.ok(fs.existsSync(path.join(oci.ociDir, "oci-layout")));
    });

    it("builds all 8 Wave 3 domain presets across Shapes A/B/C plus corrupt fixtures & mutators", () => {
      const dir = makeTmpDir("opl-fix-w3-");
      const all8 = buildAll8Wave3Fixtures(dir);
      assert.equal(Object.keys(all8).length, Object.keys(WAVE3_DOMAIN_PRESETS).length);
      assert.equal(fs.existsSync(path.join(all8.obf.dir, ".codex-plugin/plugin.json")), false);
      assert.equal(fs.existsSync(path.join(all8["opl-relay"].dir, "opl-package.json")), false);
      assert.equal(fs.existsSync(path.join(all8["opl-relay"].dir, "plugins/opl-relay/opl-package.json")), true);
      assert.equal(fs.existsSync(path.join(all8["opl-channel-weixin"].dir, "plugins")), false);

      const beforeLock = computeContentLock(all8.mas.dir);
      tamperPackageFile(all8.mas.dir, "README.md", "!");
      const afterLock = computeContentLock(all8.mas.dir);
      assert.notEqual(beforeLock.digest, afterLock.digest);

      const appPkg = buildV2Package(path.join(dir, "app-esc"), { intent: "app", id: "opl-relay" });
      const escalated = escalateProviderCapability(appPkg.dir, { capabilityId: "mailbox.read", newRisk: "external_write" });
      assert.equal(escalated.provides.connection_providers[0].capabilities[1].risk, "external_write");

      const mpRoot = path.join(dir, "mp");
      const extPlugin = buildExternalCodexPlugin(mpRoot, { id: "ext-tool", version: "2.1.0" });
      assert.ok(fs.existsSync(extPlugin.marketplacePath));

      const ks = buildKnowledgeSourceDir(path.join(dir, "vault"));
      assert.equal(ks.files.length, 2);

      for (const mode of ["missing_manifest", "invalid_codex_json", "already_v2", "missing_i18n", "conflicting_deps"]) {
        const c = buildCorruptV1Fixture(path.join(dir, `corrupt-${mode}`), mode);
        assert.ok(fs.existsSync(c.dir));
      }
    });

    it("supports E2E-M2 specStrict v2 fixtures, buildInvalidV2Fixture, addLegacyCarrierFiles, readCodexMarketplaceProjection & 8-repo shapes", () => {
      const dir = makeTmpDir("opl-fix-m2-");

      // 1. specStrict: true across all 4 intents + settingsForms
      const ag = buildV2Package(path.join(dir, "strict-agent"), {
        intent: "agent",
        id: "mas",
        specStrict: true,
        settingsForms: [
          {
            id: "mas.prefs",
            destination: "preferences",
            title: { "zh-CN": "偏好", "en-US": "Preferences" },
            data_ref: "mas.prefs.state",
            submit_action_ref: "mas.prefs.save",
          },
        ],
      });
      assert.equal(ag.manifest.permissions.workspace.reason["en-US"], "Read/write workspace artifacts");
      assert.equal(ag.manifest.ui.declarative.views[0].view_type, "service_status");
      assert.equal(ag.manifest.ui.declarative.views[0].data_ref, "mas.detail.state");
      assert.equal(ag.manifest.ui.declarative.settings_forms[0].destination, "preferences");

      const app = buildV2Package(path.join(dir, "strict-app"), { intent: "app", id: "opl-relay", specStrict: true });
      assert.equal(app.manifest.provides.connection_providers[0].entrypoint.kind, "cli");
      assert.equal(app.manifest.provides.connection_providers[0].capabilities[0].title["zh-CN"], "搜索邮箱");
      assert.equal(app.manifest.provides.contribution_handler.kind, "cli");

      const ext = buildV2Package(path.join(dir, "strict-ext"), { intent: "extension", id: "opl-foundry", specStrict: true });
      assert.equal(ext.manifest.provides.cli_extensions[0].entrypoint.kind, "esm_module");

      const ch = buildV2Package(path.join(dir, "strict-ch"), { intent: "channel", id: "opl-channel-weixin", specStrict: true });
      assert.equal(ch.manifest.provides.channels[0].entrypoint.kind, "esm_module");
      assert.equal(ch.manifest.provides.contribution_handler.kind, "cli");
      assert.equal(ch.manifest.ui.declarative.views[0].data_ref, "opl-channel-weixin.access.state");

      // 2. buildInvalidV2Fixture modes
      const badId = buildInvalidV2Fixture(path.join(dir, "inv-id"), "bad_id_or_semver");
      assert.equal(badId.manifest.identity.id, "Med_AutoScience");
      const badIntent = buildInvalidV2Fixture(path.join(dir, "inv-intent"), "bad_intent_or_i18n");
      assert.equal(badIntent.manifest.identity.intent, "standard_agent");
      assert.equal(badIntent.manifest.identity.name["zh-CN"], undefined);
      const badUi = buildInvalidV2Fixture(path.join(dir, "inv-ui"), "bad_declarative_ui");
      assert.equal(badUi.manifest.ui.declarative.views[0].slot, "top_level");
      assert.equal(badUi.manifest.ui.declarative.settings_forms[0].destination, "top_level_nav");
      const unbound = buildInvalidV2Fixture(path.join(dir, "inv-mcp"), "unbound_mcp_app");
      assert.equal(unbound.manifest.ui.mcp_apps[0].mcp_server_id, "undeclared-mcp-server");
      const tamperOut = path.join(dir, "tamper-arch");
      const mismatch = buildInvalidV2Fixture(path.join(dir, "inv-lock"), "lock_digest_mismatch", { archiveOutDir: tamperOut });
      assert.ok(fs.existsSync(mismatch.lockPath));
      assert.ok(fs.existsSync(mismatch.archivePath));
      assert.notEqual(mismatch.lock.digest, computeContentLock(mismatch.dir).digest);
      const extTamper = path.join(dir, "ext-tamper");
      fs.mkdirSync(extTamper, { recursive: true });
      assert.equal(spawnSync("tar", ["-xzf", mismatch.archivePath, "-C", extTamper]).status, 0);
      assert.equal(fs.existsSync(path.join(extTamper, "opl-release.lock.json")), true);

      // 3. 8-repo real shapes & addLegacyCarrierFiles
      const all8 = buildAll8Wave3Fixtures(path.join(dir, "w3"));
      const masManifest = JSON.parse(fs.readFileSync(all8.mas.manifestPath, "utf8"));
      assert.equal(masManifest.surface_kind, "opl_agent_package_manifest.v1");
      assert.equal(masManifest.requires[0].package_id, "mas-scholar-skills");
      assert.equal(fs.existsSync(path.join(all8.mas.dir, "plugins/opl-foundation-skills/skills/opl-foundation-skills/SKILL.md")), true);
      assert.equal(fs.existsSync(path.join(all8.mas.dir, "contracts/carrier_projection.json")), true);

      const magManifest = JSON.parse(fs.readFileSync(all8.mag.manifestPath, "utf8"));
      assert.deepEqual(magManifest.codex_surface.bundled_capability_package_ids, ["mas-scholar-skills"]);
      assert.equal(magManifest.bundled_capability_package_ids, undefined);
      assert.ok(magManifest.presentation.description_i18n["zh-CN"]);
      assert.equal(magManifest.presentation.session_routing_summary_i18n["zh-CN"], undefined);

      const rcaManifest = JSON.parse(fs.readFileSync(all8.rca.manifestPath, "utf8"));
      assert.equal(rcaManifest.kind, undefined);
      assert.equal(rcaManifest.presentation.icon_ref, undefined);
      assert.ok(Array.isArray(rcaManifest.permissions));

      const obfManifest = JSON.parse(fs.readFileSync(all8.obf.manifestPath, "utf8"));
      assert.equal(obfManifest.kind, undefined);
      assert.equal(fs.existsSync(path.join(all8.obf.dir, "plugins/opl-bookforge/plugin.json")), true);

      const occManifest = JSON.parse(fs.readFileSync(all8.occ.manifestPath, "utf8"));
      assert.equal(occManifest.carrier_slug, "opl-capital-compass");
      assert.equal(fs.existsSync(path.join(all8.occ.dir, "plugins/occ/opl-package.json")), false);

      const relayManifest = JSON.parse(fs.readFileSync(all8["opl-relay"].manifestPath, "utf8"));
      assert.equal(relayManifest.surface_kind, "opl_capability_package_manifest.v2");
      assert.equal(relayManifest.kind, undefined);
      const relayMcp = JSON.parse(fs.readFileSync(path.join(all8["opl-relay"].dir, "plugins/opl-relay/mcp.json"), "utf8"));
      assert.ok(relayMcp.mcpServers["mail-workbench"]);

      const personaManifest = JSON.parse(fs.readFileSync(all8["opl-persona"].manifestPath, "utf8"));
      assert.equal(personaManifest.kind, undefined);
      assert.equal(personaManifest.presentation, undefined);

      const wxManifest = JSON.parse(fs.readFileSync(all8["opl-channel-weixin"].manifestPath, "utf8"));
      assert.equal(wxManifest.title_i18n, undefined);
      assert.equal(wxManifest.app_contributions.views[0].title_i18n.en, "Weixin");

      const carrierAdded = addLegacyCarrierFiles(all8.mas.dir, { carrierProjection: true, rootPluginJson: true });
      assert.ok(fs.existsSync(carrierAdded.carrierProjectionPath));
      assert.ok(fs.existsSync(carrierAdded.rootPluginJsonPath));

      // 4. readCodexMarketplaceProjection
      const fakeOplHome = path.join(dir, "opl-home");
      const mpDir = path.join(fakeOplHome, "carriers", "codex-marketplace");
      const mpPluginDir = path.join(mpDir, "plugins", "med-autoscience");
      fs.mkdirSync(path.join(mpPluginDir, ".codex-plugin"), { recursive: true });
      fs.writeFileSync(path.join(mpDir, "marketplace.json"), JSON.stringify({ name: "opl-local", plugins: [{ name: "med-autoscience" }] }), "utf8");
      fs.writeFileSync(path.join(mpPluginDir, ".codex-plugin/plugin.json"), JSON.stringify({ name: "med-autoscience", version: "0.4.0", interface: { logo: ag.manifest.identity.icon } }), "utf8");
      fs.cpSync(ag.skillsDir, path.join(mpPluginDir, "skills"), { recursive: true });
      fs.cpSync(ag.assetsDir, path.join(mpPluginDir, "assets"), { recursive: true });
      const proj = readCodexMarketplaceProjection(fakeOplHome, "med-autoscience");
      assert.equal(proj.marketplace.name, "opl-local");
      assert.equal(proj.pluginJson.name, "med-autoscience");
      assertCodexPluginPayload(proj, ag.dir);
    });

    it("preserves 0755 modes across tgz/OCI tar extraction, blocks symlink escapes, excludes in-package outDir, and handles USTAR >100B prefix", () => {
      const dir = makeTmpDir("opl-fix-ustar-");
      const pkgDir = path.join(dir, "probe-pkg");
      buildV2Package(pkgDir, { id: "probe-pkg", version: "1.2.3", intent: "app" });

      const archOut = path.join(dir, "arch-out");
      const { archivePath } = createLocalPackageArchive(pkgDir, archOut);
      const extArch = path.join(dir, "ext-arch");
      fs.mkdirSync(extArch, { recursive: true });
      assert.equal(spawnSync("tar", ["-xzf", archivePath, "-C", extArch]).status, 0);
      const extArchBin = path.join(extArch, "bin/probe-pkg-mcp");
      assert.equal(fs.statSync(extArchBin).mode & 0o755, 0o755);
      const archExec = spawnSync(extArchBin, [], { encoding: "utf8" });
      assert.equal(archExec.status, 0, `archive bin failed: ${archExec.error?.code || archExec.stderr}`);
      assert.deepEqual(JSON.parse(archExec.stdout), { ok: true, server: "probe-pkg" });

      const ociOut = path.join(dir, "oci-out");
      const oci = createLocalOciDir(pkgDir, ociOut);
      const layerPath = path.join(oci.ociDir, "blobs", "sha256", oci.layerDigest.replace("sha256:", ""));
      const extOci = path.join(dir, "ext-oci");
      fs.mkdirSync(extOci, { recursive: true });
      assert.equal(spawnSync("tar", ["-xzf", layerPath, "-C", extOci]).status, 0);
      const extOciBin = path.join(extOci, "bin/probe-pkg-mcp");
      assert.equal(fs.statSync(extOciBin).mode & 0o755, 0o755);
      const ociExec = spawnSync(extOciBin, [], { encoding: "utf8" });
      assert.equal(ociExec.status, 0, `oci bin failed: ${ociExec.error?.code || ociExec.stderr}`);
      assert.deepEqual(JSON.parse(ociExec.stdout), { ok: true, server: "probe-pkg" });

      // Symlink containment in computeContentLock
      fs.writeFileSync(path.join(dir, "outside-secret.txt"), "secret-value", "utf8");
      const pkgSym = path.join(dir, "sym-pkg");
      fs.mkdirSync(pkgSym, { recursive: true });
      fs.writeFileSync(path.join(pkgSym, "inside.txt"), "safe-inside", "utf8");
      fs.symlinkSync("../outside-secret.txt", path.join(pkgSym, "link.txt"));
      fs.symlinkSync("./inside.txt", path.join(pkgSym, "ok-link.txt"));
      assert.throws(() => computeContentLock(pkgSym, ["link.txt"]), /symlink outside rootDir/i);
      assert.equal(computeContentLock(pkgSym, ["ok-link.txt"]).file_count, 1);

      // createLocalPackageArchive excludes outDir inside pkgDir across repeated calls
      const distInPkg = path.join(pkgDir, "dist-arch");
      const r1 = createLocalPackageArchive(pkgDir, distInPkg);
      const r2 = createLocalPackageArchive(pkgDir, distInPkg);
      assert.equal(r1.fileCount, r2.fileCount);
      assert.equal(r1.digest, r2.digest);

      // USTAR >100-byte relative path split via prefix(<=155)/name(<=100)
      const deepRel = "a/bbbbbbbbbb/cccccccccc/dddddddddd/eeeeeeeeee/ffffffffff/gggggggggg/hhhhhhhhhh/iiiiiiiiii/jjjjjjjjjj/deep-file.txt";
      assert.ok(Buffer.byteLength(deepRel, "utf8") > 100);
      const deepFull = path.join(pkgDir, deepRel);
      fs.mkdirSync(path.dirname(deepFull), { recursive: true });
      fs.writeFileSync(deepFull, "deep-ustar-ok", "utf8");
      const deepArch = createLocalPackageArchive(pkgDir, path.join(dir, "deep-out"));
      const extDeep = path.join(dir, "ext-deep");
      fs.mkdirSync(extDeep, { recursive: true });
      assert.equal(spawnSync("tar", ["-xzf", deepArch.archivePath, "-C", extDeep]).status, 0);
      assert.equal(fs.readFileSync(path.join(extDeep, deepRel), "utf8"), "deep-ustar-ok");

      // Unsplittable single component >100 bytes throws clear error
      const tooLongLeafDir = path.join(dir, "too-long-leaf");
      buildV2Package(tooLongLeafDir, { id: "leaf-pkg", version: "1.0.0", intent: "agent" });
      fs.writeFileSync(path.join(tooLongLeafDir, `${"x".repeat(105)}.txt`), "too-long", "utf8");
      assert.throws(() => createLocalPackageArchive(tooLongLeafDir, path.join(dir, "leaf-out")), /USTAR/i);
    });
  });

  describe("6. sqlite-inspector.mjs DQS=0, 13-table schema, invariants & seeding", () => {
    it("verifies PRAGMAs, 13 tables, 4 indexes, DQS=0, state assertions, and controlled seeding", () => {
      const dir = makeTmpDir("opl-sql-self-");
      const dbPath = path.join(dir, "opl.db");
      const db = openOplDb(dbPath);
      db.exec(FULL_DDL);

      assertPragmas(db);
      assertSchema(db);
      assertDqsZeroEnforced(db);

      const crash = seedCrashRecoveryScenario(db, { workspaceRoot: dir });
      assertTaskStatus(db, crash.taskId, "active");
      assertTaskStatus(db, crash.pausedTaskId, "paused_by_human");
      assertPausedByHumanSovereignty(db, crash.pausedTaskId, { "sr-paused": 0 });
      assertStageRunStatus(db, "sr-done", "running", 1);
      assertNoDuplicateAttempts(db, "sr-done", 1);
      assert.equal(listTasks(db, "paused_by_human").length, 1);
      assert.equal(getStageRuns(db, crash.taskId).length, 3);
      assert.equal(getAttempts(db, "sr-done").length, 1);
      assert.ok(getWorkspace(db, "ws-crash"));

      const ts = new Date().toISOString();
      txImmediate(db, () => {
        db.prepare(
          "INSERT INTO knowledge_sources VALUES ('ks-1', 'long_term_topic', 'obsidian_vault', ?, 'rev-1', 'active', ?)"
        ).run(path.join(dir, "vault"), ts);
        db.prepare(
          "INSERT INTO knowledge_snapshots VALUES ('snap-1', 'sr-done', 'ks-1', 'rev-1', '{}', ?)"
        ).run(ts);
        db.prepare(
          "INSERT INTO installed_packages VALUES ('mas', '0.4.0', 'agent', 'opl', 'release', ?, 'sha256:abc', '{}', 1, 1, ?, ?)"
        ).run(dir, ts, ts);
        db.prepare(
          "INSERT INTO package_operations VALUES ('op-1', 'b-1', 'mas', 'install', '0.4.0', 'succeeded', 'none', '{}', NULL, ?, ?)"
        ).run(ts, ts);
        db.prepare(
          "INSERT INTO connections VALUES ('conn-1', 'opl-relay.mailbox', 'Mail', 'u@lab', 'keychain:conn-1', 1, 'active', ?)"
        ).run(ts);
        db.prepare(
          "INSERT INTO connection_grants VALUES ('g-1', 'mas', 'sha256:abc', 'conn-1', 1, 'mailbox.read', 'Read mail', 'read', 'granted', ?, ?)"
        ).run(ts, ts);
        db.prepare(
          "INSERT INTO ledger_entries VALUES ('le-1', 'task-crash', 'sr-done', 'att-done', 'artifact_ref', 'mas', ?, ?)"
        ).run(JSON.stringify({ path: "analysis/plan.md", sha256: "deadbeef" }), ts);
      });

      assertLedgerRefsOnly(db, "task-crash", ["top-secret-token-value"]);
      assertNoPlaintextSecrets(db, ["top-secret-token-value"]);
      assert.equal(getLedgerEntries(db, "task-crash", "artifact_ref").length, 1);
      assert.ok(getConnection(db, "conn-1"));
      assert.equal(getGrants(db, { consumerPackageId: "mas", capabilityId: "mailbox.read" }).length, 1);
      assert.ok(getInstalledPackage(db, "mas"));
      assert.equal(getPackageOperations(db, "mas").length, 1);
      assert.equal(getKnowledgeSources(db, "ws-crash").length, 1);
      assert.ok(getKnowledgeSource(db, "ks-1"));
      assert.equal(getKnowledgeSnapshots(db, "sr-done").length, 1);
      assert.equal(getKnowledgeSnapshotsBySource(db, "ks-1").length, 1);

      // External in-situ obsidian_vault outside workspace.root_path must still be returned
      const externalVaultDir = makeTmpDir("opl-ext-vault-");
      const obs = buildObsidianVaultDir(externalVaultDir);
      assert.ok(fs.existsSync(obs.obsidianConfigPath));
      txImmediate(db, () => {
        db.prepare(
          "INSERT INTO knowledge_sources VALUES ('ks-ext', 'long_term_topic', 'obsidian_vault', ?, 'rev-1', 'active', ?)"
        ).run(obs.dir, ts);
        db.prepare(
          "INSERT INTO knowledge_snapshots VALUES ('snap-ext', 'sr-done', 'ks-ext', 'rev-1', ?, ?)"
        ).run(
          JSON.stringify({
            source_id: "ks-ext",
            revision: "rev-1",
            files: obs.files.map((rel) => ({ path: rel, sha256: obs.digests[rel] })),
          }),
          ts
        );
      });
      assert.ok(
        getKnowledgeSources(db, "ws-crash").some((s) => s.source_id === "ks-ext"),
        "getKnowledgeSources must include external in-situ obsidian_vault sources outside workspace.root_path"
      );
      assert.equal(getKnowledgeSnapshotsBySource(db, "ks-ext").length, 1);

      // connect_audit_events query helper
      assert.deepEqual(getConnectAuditEvents(db, { connectionId: "conn-1" }), []);
      db.exec(
        "CREATE TABLE connect_audit_events (event_id TEXT PRIMARY KEY, kind TEXT NOT NULL, connection_id TEXT NOT NULL, grant_id TEXT, consumer_package_id TEXT, capability_id TEXT, capability_risk TEXT, disposition TEXT, actor_kind TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT NOT NULL);"
      );
      txImmediate(db, () => {
        db.prepare(
          "INSERT INTO connect_audit_events VALUES ('ev-1', 'grant_approved', 'conn-1', 'g-1', 'mas', 'mailbox.read', 'read', 'completed', 'opl_app', 'Approved', ?)"
        ).run(ts);
      });
      assert.equal(getConnectAuditEvents(db, { connectionId: "conn-1", consumerPackageId: "mas" }).length, 1);

      const sched = seedWakeFromSleepSchedules(db, { workspaceRoot: path.join(dir, "cron") });
      assert.equal(getSchedule(db, sched.scheduleIds[0]).overlap_policy, "skip");
      assert.notEqual(getSchedule(db, sched.scheduleIds[0]).cron_expr, "* * * * *");
      assert.match(getSchedule(db, sched.scheduleIds[0]).cron_expr, /^\d{1,2} \d{1,2} \* \* \*$/);
      assert.equal(getSchedule(db, sched.scheduleIds[1]).overlap_policy, "buffer_one");
      assert.equal(getSchedule(db, sched.scheduleIds[2]).overlap_policy, "cancel_other");

      const stale = seedStaleStageRun(db, { workspaceRoot: path.join(dir, "stale") });
      assert.equal(getTask(db, stale.taskId).status, "active");

      db.close();

      // Raw knowledge body leakage assertion (negative & positive check)
      assertNoRawKnowledgeContentInDb(dbPath, obs.canaryStrings);
      const leakDb = openOplDb(dbPath);
      txImmediate(leakDb, () => {
        leakDb.prepare(
          "INSERT INTO knowledge_snapshots VALUES ('snap-leak', 'sr-done', 'ks-ext', 'rev-2', ?, ?)"
        ).run(JSON.stringify({ files: [{ path: "notes/protocol.md", content: obs.canaryStrings[0] }] }), ts);
      });
      leakDb.close();
      assert.throws(() => assertNoRawKnowledgeContentInDb(dbPath, obs.canaryStrings), /leaked|inline body/i);

      // New fixtures helpers: buildConnectPair & tamperBindTokenSignature
      const pairDir = makeTmpDir("opl-connect-pair-");
      const pair = buildConnectPair(pairDir, { includeSecondConsumer: true });
      assert.equal(pair.provider.manifest.identity.intent, "app");
      assert.equal(pair.consumer.manifest.identity.id, "mas");
      assert.equal(pair.consumerB.manifest.identity.id, "mag");
      assert.equal(pair.consumer.manifest.permissions.connections[0].provider_type, "opl-relay.mailbox");

      const tok = "oplcbt1.eyJzZXNzaW9uX2lkIjoicy0xIn0.0123456789abcdef";
      const tampered = tamperBindTokenSignature(tok);
      assert.notEqual(tampered, tok);
      assert.equal(tampered.split(".").length, 3);
    });

    it("supports E2E-M4 helpers: getStageRun, getAttempt, listSchedules, countTasks, waitForDbState, excludePid, waitForStubLogEvent, options.stages, sha256File", async () => {
      const sb = createSandbox();
      activeSandboxes.push(sb);

      // 1. buildV2Package options.stages & sha256File
      const pkgDir = path.join(sb.root, "custom-stages-pkg");
      const built = buildV2Package(pkgDir, {
        intent: "agent",
        id: "custom-agent",
        specStrict: true,
        stages: [{ stage_id: "only_codex", executor: "codex", model: "gpt-5-codex", role: "producer" }],
      });
      const stagesJson = JSON.parse(fs.readFileSync(path.join(built.dir, "stages.json"), "utf8"));
      assert.equal(stagesJson.length, 1);
      assert.equal(stagesJson[0].stage_id, "only_codex");

      const sampleFile = path.join(sb.root, "sample.txt");
      fs.writeFileSync(sampleFile, "hello-sha256\n", "utf8");
      const expectedSha = `sha256:${crypto.createHash("sha256").update("hello-sha256\n", "utf8").digest("hex")}`;
      assert.equal(sha256File(sampleFile), expectedSha);

      // 2. sqlite-inspector additions + waitForDbState
      const db = openOplDb(sb.dbPath);
      db.exec(FULL_DDL);
      seedCrashRecoveryScenario(db, { workspaceRoot: sb.workspaceDir });
      assert.ok(getStageRun(db, "sr-done"));
      assert.equal(getStageRun(db, "sr-missing"), null);
      assert.ok(getAttempt(db, "att-done"));
      assert.equal(getAttempt(db, "att-missing"), null);
      assert.equal(countTasks(db, "ws-crash"), 2);

      const sched = seedWakeFromSleepSchedules(db, { workspaceRoot: path.join(sb.root, "cron-ws") });
      const schedRows = listSchedules(db, sched.workspaceId);
      assert.equal(schedRows.length, 3);
      for (const s of schedRows) {
        assert.equal(s.enabled, 1);
        const payload = JSON.parse(s.payload_json);
        assert.equal(payload.agent_id, "mas");
        assert.ok(typeof payload.title === "string" && payload.title.length > 0);
        assert.ok(typeof payload.goal_prompt === "string" && payload.goal_prompt.length > 0);
      }
      seedWakeFromSleepSchedules(db, {
        workspaceRoot: path.join(sb.root, "cron-ws"),
        enabledScheduleIds: ["sch-skip"],
      });
      const partialRows = listSchedules(db, sched.workspaceId);
      const enabledById = Object.fromEntries(partialRows.map((s) => [s.schedule_id, s.enabled]));
      assert.deepEqual(enabledById, { "sch-skip": 1, "sch-buffer": 0, "sch-cancel": 0 });
      db.close();

      setTimeout(() => {
        const dbAsync = openOplDb(sb.dbPath);
        txImmediate(dbAsync, () => {
          dbAsync.prepare("UPDATE attempts SET status = 'succeeded' WHERE attempt_id = 'att-done'").run();
        });
        dbAsync.close();
      }, 120);

      const updatedAtt = await waitForDbState(
        sb.dbPath,
        (roDb) => {
          const att = getAttempt(roDb, "att-done");
          return att?.status === "succeeded" ? att : null;
        },
        { timeoutMs: 3000, pollMs: 30 }
      );
      assert.equal(updatedAtt.status, "succeeded");

      // 3. waitForStubLogEvent
      const codexLog = path.join(sb.stubLogDir, "codex.jsonl");
      setTimeout(() => {
        fs.appendFileSync(codexLog, JSON.stringify({ event: "invocation", tool: "codex", mode: "hang" }) + "\n", "utf8");
      }, 100);
      const ev = await waitForStubLogEvent(sb.stubLogDir, "codex", (e) => e.event === "invocation" && e.mode === "hang", {
        timeoutMs: 3000,
        pollMs: 30,
      });
      assert.equal(ev.tool, "codex");
      await assert.rejects(
        () => waitForStubLogEvent(sb.stubLogDir, "codex", (e) => e.event === "never", { timeoutMs: 180, pollMs: 40 }),
        /Timed out waiting for stub log event/i
      );

      // 4. waitForDaemonReady excludePid
      const token = crypto.randomBytes(32).toString("hex");
      const mockSrv = net.createServer((s) => s.end());
      await new Promise((resolve) => mockSrv.listen(sb.sockPath, resolve));
      try {
        const stalePid = 999999;
        fs.writeFileSync(
          sb.sessionPath,
          JSON.stringify({ pid: stalePid, socket_path: sb.sockPath, token }),
          { mode: 0o600 }
        );
        setTimeout(() => {
          fs.writeFileSync(
            sb.sessionPath,
            JSON.stringify({ pid: process.pid, socket_path: sb.sockPath, token }),
            { mode: 0o600 }
          );
        }, 120);
        const readySess = await sb.waitForDaemonReady({ excludePid: stalePid, timeoutMs: 3000, pollMs: 25 });
        assert.equal(readySess.pid, process.pid);
      } finally {
        await new Promise((resolve) => mockSrv.close(resolve));
      }
    });
  });
});
