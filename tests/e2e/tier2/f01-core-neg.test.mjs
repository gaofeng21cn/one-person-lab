import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCli } from "../lib/cli.mjs";
import { buildV2Package } from "../lib/fixtures.mjs";
import { assertRpcError, connectRpcClient } from "../lib/rpc-client.mjs";
import {
  DEFAULT_WORKTREE_ROOT,
  createSandbox,
  isPidAlive,
  spawnRawDaemon,
} from "../lib/sandbox.mjs";
import {
  assertDqsZeroEnforced,
  getInstalledPackage,
  openOplDb,
} from "../lib/sqlite-inspector.mjs";

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

function copyDirFilteringBuildArtifacts(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name === ".git" || ent.name.endsWith(".tsbuildinfo")) {
      continue;
    }
    const srcPath = path.join(srcDir, ent.name);
    const dstPath = path.join(dstDir, ent.name);
    if (ent.isDirectory()) {
      copyDirFilteringBuildArtifacts(srcPath, dstPath);
    } else if (ent.isFile()) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function makeGuardTestRepoCopy(targetDir, { worktreeRoot = DEFAULT_WORKTREE_ROOT, mode }) {
  const root = path.resolve(targetDir);
  const srcCore = path.join(worktreeRoot, "packages", "core");
  const dstCore = path.join(root, "packages", "core");
  copyDirFilteringBuildArtifacts(srcCore, dstCore);

  if (mode === "dqs0_ts") {
    fs.writeFileSync(
      path.join(dstCore, "src", "bad-dqs.ts"),
      'export const badSql = \'SELECT * FROM sqlite_master WHERE name = "bad"\';\n',
      "utf8"
    );
  } else if (mode === "dqs0_sql") {
    fs.writeFileSync(
      path.join(dstCore, "migrations", "9999_bad_dqs.sql"),
      'SELECT \'ok\' WHERE 1 = "bad";\n',
      "utf8"
    );
  } else if (mode === "forbidden_tokens") {
    fs.writeFileSync(
      path.join(dstCore, "src", "forbidden-tokens.ts"),
      [
        "export const refs = [",
        '  "codex",',
        '  "antigravity",',
        '  "med-autoscience",',
        '  "opl-pack",',
        '  "MAS",',
        "];",
        "",
      ].join("\n"),
      "utf8"
    );
  } else if (mode === "forbidden_import") {
    fs.writeFileSync(
      path.join(dstCore, "src", "forbidden-import.ts"),
      [
        "import '@opl/connect';",
        "import '@temporalio/client';",
        "export const forbiddenRef = 1;",
        "",
      ].join("\n"),
      "utf8"
    );
  } else if (mode === "line_budget") {
    const lines = [];
    for (let i = 0; i < 3005; i++) {
      lines.push(`export const line_${i} = ${i};`);
    }
    fs.writeFileSync(path.join(dstCore, "src", "bloat.ts"), lines.join("\n") + "\n", "utf8");
  } else {
    throw new Error(`Unknown guard test mode: ${mode}`);
  }

  return root;
}

function makeMalformedPackageDir(targetDir, mode) {
  const dir = path.resolve(targetDir);
  if (mode === "corrupt_json") {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "opl-package.json"), "{ invalid json !!!", "utf8");
    return { dir, id: null };
  }
  if (mode === "throwing_plugin_module") {
    const pkg = buildV2Package(dir, {
      intent: "extension",
      id: "broken-ext",
      specStrict: true,
    });
    fs.writeFileSync(
      path.join(pkg.dir, "dist", "cli.mjs"),
      'throw new Error("boom plugin load failure");\nexport function registerFoundryCli() { return {}; }\n',
      "utf8"
    );
    return { dir: pkg.dir, id: "broken-ext" };
  }
  throw new Error(`Unknown malformed package mode: ${mode}`);
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

describe("Tier 2 — F1 Negative & Boundary: packages/core Microkernel & Guards", () => {
  it("T2-F1-01: double-quoted SQL string literal fails DQS=0 at runtime and in static SQL guard", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const db = openOplDb(sb.dbPath);
    try {
      assertDqsZeroEnforced(db);
    } finally {
      db.close();
    }

    const guardScript = path.join(DEFAULT_WORKTREE_ROOT, "scripts", "check-v2-import-guard.mjs");

    const tsCopy = makeGuardTestRepoCopy(path.join(sb.root, "guard-dqs-ts"), { mode: "dqs0_ts" });
    const tsRun = spawnSync(process.execPath, [guardScript, "--root", tsCopy, "--json"], { encoding: "utf8" });
    assert.equal(tsRun.status, 1, `Expected guard exit 1 for dqs0_ts, got ${tsRun.status}`);
    const tsReport = JSON.parse(tsRun.stdout);
    assert.equal(tsReport.ok, false);
    assert.equal(
      tsReport.violations.some((v) => v.rule === "dqs0-ts-sql-double-quote"),
      true,
      `Expected dqs0-ts-sql-double-quote violation, got: ${JSON.stringify(tsReport.violations)}`
    );

    const sqlCopy = makeGuardTestRepoCopy(path.join(sb.root, "guard-dqs-sql"), { mode: "dqs0_sql" });
    const sqlRun = spawnSync(process.execPath, [guardScript, "--root", sqlCopy, "--json"], { encoding: "utf8" });
    assert.equal(sqlRun.status, 1, `Expected guard exit 1 for dqs0_sql, got ${sqlRun.status}`);
    const sqlReport = JSON.parse(sqlRun.stdout);
    assert.equal(sqlReport.ok, false);
    assert.equal(
      sqlReport.violations.some((v) => v.rule === "dqs0-sql-double-quote"),
      true,
      `Expected dqs0-sql-double-quote violation, got: ${JSON.stringify(sqlReport.violations)}`
    );
  });

  it("T2-F1-02: importing codex/antigravity/@opl/*/@temporalio/* or exceeding 3,000L in packages/core fails CI guard", async () => {
    const sb = trackSandbox();
    const guardScript = path.join(DEFAULT_WORKTREE_ROOT, "scripts", "check-v2-import-guard.mjs");

    const tokCopy = makeGuardTestRepoCopy(path.join(sb.root, "guard-tokens"), { mode: "forbidden_tokens" });
    const tokRun = spawnSync(process.execPath, [guardScript, "--root", tokCopy, "--json"], { encoding: "utf8" });
    assert.equal(tokRun.status, 1);
    const tokReport = JSON.parse(tokRun.stdout);
    assert.equal(tokReport.ok, false);
    const tokRules = new Set(tokReport.violations.map((v) => v.rule));
    for (const expectedRule of [
      "core-forbidden-engine-codex",
      "core-forbidden-engine-antigravity",
      "core-forbidden-domain-pkg",
      "core-forbidden-brand",
      "core-forbidden-domain-abbr",
    ]) {
      assert.equal(
        tokRules.has(expectedRule),
        true,
        `Expected rule '${expectedRule}' in violations: ${JSON.stringify([...tokRules])}`
      );
    }

    const impCopy = makeGuardTestRepoCopy(path.join(sb.root, "guard-imports"), { mode: "forbidden_import" });
    const impRun = spawnSync(process.execPath, [guardScript, "--root", impCopy, "--json"], { encoding: "utf8" });
    assert.equal(impRun.status, 1);
    const impReport = JSON.parse(impRun.stdout);
    assert.equal(impReport.ok, false);
    assert.equal(
      impReport.violations.some((v) => v.rule === "core-forbidden-import"),
      true,
      `Expected core-forbidden-import violation, got: ${JSON.stringify(impReport.violations)}`
    );

    const bloatCopy = makeGuardTestRepoCopy(path.join(sb.root, "guard-budget"), { mode: "line_budget" });
    const bloatRun = spawnSync(process.execPath, [guardScript, "--root", bloatCopy, "--json"], { encoding: "utf8" });
    assert.equal(bloatRun.status, 1);
    const bloatReport = JSON.parse(bloatRun.stdout);
    assert.equal(bloatReport.ok, false);
    assert.ok(bloatReport.coreLineCount > 3000);
    assert.equal(
      bloatReport.violations.some((v) => v.rule === "core-line-budget"),
      true,
      `Expected core-line-budget violation, got: ${JSON.stringify(bloatReport.violations)}`
    );
  });

  it("T2-F1-03: loading a plugin with malformed descriptor or throwing entrypoint fails closed without crashing opld", async () => {
    const sb = trackSandbox();
    const d1 = await sb.startDaemon();

    const badJson = makeMalformedPackageDir(path.join(sb.root, "bad-json-pkg"), "corrupt_json");
    const badMod = makeMalformedPackageDir(path.join(sb.root, "throwing-mod-pkg"), "throwing_plugin_module");

    const resJson = await runCli(["pack", "link", badJson.dir, "--json"], { sandbox: sb });
    assert.ok(resJson.code === 1 || resJson.code === 2, `Expected exit 1 or 2 for corrupt JSON, got ${resJson.code}`);

    const resMod = await runCli(["pack", "link", badMod.dir, "--json"], { sandbox: sb });
    assert.ok(resMod.code === 1 || resMod.code === 2, `Expected exit 1 or 2 for throwing module, got ${resMod.code}`);

    assert.equal(isPidAlive(d1.pid), true, "opld must remain alive after malformed plugin rejection");

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const health = await rpc.call("daemon.health", {});
    assert.ok(health && (health.ok === true || health.status === "ok" || health.status === "healthy"));
    const fast = await rpc.call("app.state.get", { profile: "fast" });
    assert.ok(fast && typeof fast === "object");

    const db = openOplDb(sb.dbPath, { readOnly: true });
    try {
      assert.equal(getInstalledPackage(db, "broken-ext"), null, "Throwing extension must not be persisted as active");
    } finally {
      db.close();
    }
  });

  it("T2-F1-04: acquiring opld.lock from a second opld process fails immediately (single-instance mutual exclusion)", async () => {
    const sb = trackSandbox();
    const d1 = await sb.startDaemon();

    assert.equal(fs.existsSync(sb.lockPath), true, `Expected opld.lock at ${sb.lockPath}`);
    const lockRaw = fs.readFileSync(sb.lockPath, "utf8").trim();
    const lockPid = lockRaw.startsWith("{") ? JSON.parse(lockRaw).pid : Number(lockRaw);
    assert.equal(lockPid, d1.pid, `Expected lock PID ${d1.pid}, got ${lockPid}`);

    const raw2 = spawnRawDaemon(sb);
    const exit2 = await raw2.waitExit({ timeoutMs: 5000 });
    assert.equal(exit2.timedOut, false, "Second raw opld must exit immediately on lock contention, not hang");
    assert.notEqual(exit2.code, 0, `Expected non-zero exit for second opld, got 0\nSTDOUT:\n${exit2.stdout}\nSTDERR:\n${exit2.stderr}`);
    assert.match(
      `${exit2.stdout}\n${exit2.stderr}`,
      /lock|already running|opld\.lock|LOCK_CONTENTION|EAGAIN|EEXIST/i
    );

    assert.equal(isPidAlive(d1.pid), true, "Primary opld must remain alive");
    assert.equal(sb.readSession()?.pid, d1.pid, "opld.session.json PID must remain unchanged");

    const liveProcs = sb.findLiveProcesses().filter((p) => /\bopld\b/.test(p.command) || p.pid === d1.pid);
    assert.equal(liveProcs.length, 1, `Expected exactly 1 live opld process, got ${JSON.stringify(liveProcs)}`);
  });

  it("T2-F1-05: foreign-key violation in opl.db is rejected (PRAGMA foreign_keys = ON)", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const pkgDir = path.join(sb.root, "fk-consumer");
    buildV2Package(pkgDir, { id: "fk-consumer", intent: "agent", specStrict: true });
    await runCli(["pack", "link", pkgDir, "--json"], { sandbox: sb });

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    await assertRpcError(
      () =>
        rpc.call("connect.requestAccess", {
          consumer_package_id: "fk-consumer",
          connection_id: "conn-does-not-exist",
          capability_ids: ["mailbox.read"],
        }),
      -32004,
      /not found|foreign key|CONNECTION_NOT_FOUND|does not exist/i
    );

    const db = openOplDb(sb.dbPath);
    try {
      assert.throws(
        () =>
          db
            .prepare(
              "INSERT INTO stage_runs (stage_run_id, task_id, stage_id, seq_no, status, executor_id, updated_at) VALUES ('sr-fk-bad', 'task-nonexistent', 's1', 1, 'queued', 'codex', '2026-11-25T00:00:00Z')"
            )
            .run(),
        /FOREIGN KEY constraint failed/i
      );

      assert.throws(
        () =>
          db
            .prepare(
              "INSERT INTO connection_grants (grant_id, consumer_package_id, consumer_content_digest, connection_id, connection_security_revision, capability_id, capability_title, capability_risk, status, created_at, updated_at) VALUES ('gr-fk-bad', 'fk-consumer', 'sha256:abc', 'conn-nonexistent', 1, 'cap.read', 'Read', 'read', 'requested', '2026-11-25T00:00:00Z', '2026-11-25T00:00:00Z')"
            )
            .run(),
        /FOREIGN KEY constraint failed/i
      );

      const srCount = db.prepare("SELECT COUNT(*) AS cnt FROM stage_runs").get();
      const grCount = db.prepare("SELECT COUNT(*) AS cnt FROM connection_grants").get();
      assert.equal(srCount.cnt, 0);
      assert.equal(grCount.cnt, 0);
    } finally {
      db.close();
    }
  });
});
