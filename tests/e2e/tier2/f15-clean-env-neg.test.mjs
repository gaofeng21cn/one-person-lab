import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCli, runCliJson, runCliOk } from "../lib/cli.mjs";
import {
  auditLegacyDemolition,
  auditLineBudgets,
  auditProcessHygiene,
  auditProtectedBoundaries,
  auditTemporalElimination,
} from "../lib/redline-audit.mjs";
import { connectRpcClient } from "../lib/rpc-client.mjs";
import {
  DEFAULT_WORKTREE_ROOT,
  assertMode600,
  createSandbox,
  isPidAlive,
  spawnRawDaemon,
} from "../lib/sandbox.mjs";

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
      ent.name === "dist" ||
      ent.name === "__pycache__" ||
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

function createCleanSyntheticRepo(baseDir) {
  const repo = path.join(baseDir, "clean-repo");
  fs.mkdirSync(repo, { recursive: true });

  const coreSrc = path.join(DEFAULT_WORKTREE_ROOT, "packages", "core");
  copyDirClean(coreSrc, path.join(repo, "packages", "core"));

  fs.writeFileSync(
    path.join(repo, "package.json"),
    JSON.stringify({ name: "opl-v2-synthetic", version: "2.0.0", dependencies: {} }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(repo, "package-lock.json"),
    JSON.stringify({ name: "opl-v2-synthetic", lockfileVersion: 3, packages: {} }, null, 2),
    "utf8"
  );

  const pyDir = path.join(repo, "sdks", "python-client");
  fs.mkdirSync(pyDir, { recursive: true });
  fs.writeFileSync(
    path.join(pyDir, "opl_client.py"),
    "import json\nimport socket\nfrom pathlib import Path\n\nclass OplClient:\n    pass\n",
    "utf8"
  );

  return repo;
}

function createCleanSyntheticBridge(baseDir) {
  const bridgeDir = path.join(baseDir, "clean-bridge");
  fs.mkdirSync(path.join(bridgeDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(bridgeDir, "src", "index.mjs"),
    'export const name = "opl-framework-bridge";\nexport function apply() {}\n',
    "utf8"
  );
  return bridgeDir;
}

function createCleanSyntheticStudioGitRepo(baseDir) {
  const studioDir = path.join(baseDir, "clean-studio");
  fs.mkdirSync(path.join(studioDir, "plugins", "opl-framework-bridge", "src"), { recursive: true });
  fs.mkdirSync(path.join(studioDir, "desktop"), { recursive: true });
  fs.mkdirSync(path.join(studioDir, "plugins", "opl-host-core"), { recursive: true });

  fs.writeFileSync(path.join(studioDir, "desktop", "preload.cjs"), "module.exports = {};\n", "utf8");
  fs.writeFileSync(path.join(studioDir, "plugins", "opl-host-core", "cua.mjs"), "export const cua = true;\n", "utf8");
  fs.writeFileSync(
    path.join(studioDir, "plugins", "opl-framework-bridge", "src", "index.mjs"),
    'export const name = "opl-framework-bridge";\n',
    "utf8"
  );

  const git = (args) => {
    const res = spawnSync("git", ["-C", studioDir, ...args], { encoding: "utf8" });
    assert.equal(res.status, 0, `git ${args.join(" ")} failed: ${res.stderr}`);
    return res;
  };
  git(["init", "-b", "main"]);
  git(["config", "user.name", "OPL E2E"]);
  git(["config", "user.email", "e2e@onepersonlab.local"]);
  git(["add", "."]);
  git(["commit", "-m", "initial clean studio baseline"]);
  return studioDir;
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

describe("Tier 2 — F15 Negative & Boundary: Clean Env & Red-Line Violations", () => {
  it("T2-F15-01: competing second opld process and concurrent opl daemon start fail on opld.lock exclusion", async () => {
    const sb = trackSandbox();
    const d1 = await sb.startDaemon();

    const raw2 = spawnRawDaemon(sb);
    const exit2 = await raw2.waitExit({ timeoutMs: 5000 });
    assert.equal(exit2.timedOut, false, "Second opld must exit immediately on lock contention");
    assert.notEqual(exit2.code, 0, `Expected non-zero exit for second opld, got 0`);
    assert.match(`${exit2.stdout}\n${exit2.stderr}`, /lock|already running|opld\.lock|LOCK_CONTENTION|EAGAIN|EEXIST/i);

    const cliStart = await runCli(["daemon", "start", "--detached", "--json"], { sandbox: sb });
    const sessionAfter = sb.readSession();
    assert.equal(sessionAfter?.pid, d1.pid, "opld.session.json PID must remain unchanged");
    assert.equal(isPidAlive(d1.pid), true, "Primary opld must remain alive");

    if (cliStart.code === 0 && cliStart.json?.pid !== undefined) {
      assert.equal(cliStart.json.pid, d1.pid, "If CLI daemon start is idempotent, it must report primary PID");
    }

    const liveProcs = sb.findLiveProcesses().filter((p) => /\bopld\b|daemon/i.test(p.command) || p.pid === d1.pid);
    assert.equal(liveProcs.length, 1, `Expected exactly 1 opld process, got ${JSON.stringify(liveProcs)}`);
  });

  it("T2-F15-02: loose 0644 permissions on opld.sock/opld.session.json are detected and remediated to 0600", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    assertMode600(sb.sockPath);
    assertMode600(sb.sessionPath);

    fs.chmodSync(sb.sessionPath, 0o644);
    fs.chmodSync(sb.sockPath, 0o644);
    assert.throws(() => assertMode600(sb.sessionPath), /0600/);
    assert.throws(() => assertMode600(sb.sockPath), /0600/);

    const docRes = await runCli(["daemon", "doctor", "--json"], { sandbox: sb });
    const doctorHealthy = docRes.code === 0 && docRes.json?.ok === true;
    const sockModeAfterDoc = fs.statSync(sb.sockPath).mode & 0o777;
    const sessModeAfterDoc = fs.statSync(sb.sessionPath).mode & 0o777;
    if (doctorHealthy) {
      // If doctor exited healthy, it must have repaired permissions back to 0600.
      assert.equal(sockModeAfterDoc, 0o600);
      assert.equal(sessModeAfterDoc, 0o600);
    }

    await runCliOk(["daemon", "restart"], { sandbox: sb });
    await sb.waitForDaemonReady();

    assertMode600(sb.sockPath);
    assertMode600(sb.sessionPath);

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const health = await rpc.call("daemon.health", {});
    assert.ok(health && (health.ok === true || health.status === "ok" || health.status === "healthy"));
  });

  it("T2-F15-03: synthetic Temporal deps, imports, vendor/temporal, and launchd plist are all caught", () => {
    const sb = trackSandbox();
    const cleanRepo = createCleanSyntheticRepo(sb.root);
    const cleanAgents = path.join(sb.root, "clean-launch-agents");
    fs.mkdirSync(cleanAgents, { recursive: true });

    const baseline = auditTemporalElimination(cleanRepo, { launchAgentsDir: cleanAgents });
    assert.equal(baseline.ok, true, `Clean synthetic baseline failed: ${JSON.stringify(baseline.violations)}`);

    const badRepo = path.join(sb.root, "bad-temporal-repo");
    copyDirClean(cleanRepo, badRepo);
    const badAgents = path.join(sb.root, "bad-launch-agents");
    fs.mkdirSync(badAgents, { recursive: true });

    // (a) @temporalio/* in package.json + packages/runway/src/bad.ts
    fs.writeFileSync(
      path.join(badRepo, "package.json"),
      JSON.stringify({ name: "bad-temporal", version: "2.0.0", dependencies: { "@temporalio/worker": "^1.10.0" } }, null, 2),
      "utf8"
    );
    fs.mkdirSync(path.join(badRepo, "packages", "runway", "src"), { recursive: true });
    fs.writeFileSync(
      path.join(badRepo, "packages", "runway", "package.json"),
      JSON.stringify({ name: "@opl/runway", dependencies: { "@temporalio/client": "^1.10.0" } }, null, 2),
      "utf8"
    );
    fs.writeFileSync(
      path.join(badRepo, "packages", "runway", "src", "bad.ts"),
      "import '@temporalio/client';\nexport const x = 1;\n",
      "utf8"
    );

    // (b) vendor/temporal/temporal-server
    fs.mkdirSync(path.join(badRepo, "vendor", "temporal"), { recursive: true });
    fs.writeFileSync(path.join(badRepo, "vendor", "temporal", "temporal-server"), "#!/bin/sh\n", "utf8");

    // (c) com.onepersonlab.temporal.plist, com.one-person-lab.temporal.plist, ai.opl.family-runtime.provider-worker.plist
    for (const plistName of [
      "com.onepersonlab.temporal.plist",
      "com.one-person-lab.temporal.plist",
      "ai.opl.family-runtime.provider-worker.plist",
    ]) {
      fs.writeFileSync(
        path.join(badAgents, plistName),
        `<plist><dict><key>Label</key><string>${plistName.replace(/\.plist$/, "")}</string></dict></plist>\n`,
        "utf8"
      );
    }

    const temporalAudit = auditTemporalElimination(badRepo, { launchAgentsDir: badAgents });
    assert.equal(temporalAudit.ok, false, "Expected Temporal mutations to fail auditTemporalElimination");
    const rules = new Set(temporalAudit.violations.map((v) => v.rule));
    for (const expectedRule of [
      "temporal-root-dependency",
      "temporal-package-dependency",
      "temporal-vendor-dir",
      "temporal-launchd-plist",
    ]) {
      assert.equal(
        rules.has(expectedRule),
        true,
        `Expected rule '${expectedRule}' in ${JSON.stringify([...rules])}`
      );
    }
    const plistFilesCaught = new Set(
      temporalAudit.violations.filter((v) => v.rule === "temporal-launchd-plist").map((v) => path.basename(v.file))
    );
    assert.equal(plistFilesCaught.has("com.onepersonlab.temporal.plist"), true);
    assert.equal(plistFilesCaught.has("com.one-person-lab.temporal.plist"), true);
    assert.equal(plistFilesCaught.has("ai.opl.family-runtime.provider-worker.plist"), true);

    const guardScript = fs.realpathSync(path.join(DEFAULT_WORKTREE_ROOT, "scripts", "check-v2-import-guard.mjs"));
    const guardRun = spawnSync(process.execPath, [guardScript, "--root", fs.realpathSync(badRepo), "--json"], {
      encoding: "utf8",
    });
    assert.equal(guardRun.status, 1, "Expected check-v2-import-guard.mjs to reject @temporalio/client in packages/runway");

    const procAudit = auditProcessHygiene({
      psRows: [
        { pid: 99999, ppid: 1, pgid: 99999, command: "/opt/homebrew/bin/temporal server start-dev --port 7233" },
        {
          pid: 99998,
          ppid: 1,
          pgid: 99998,
          command: "/opt/homebrew/bin/node --experimental-strip-types /opt/opl/src/entrypoints/temporal-worker-bootstrap.ts /opt/opl/src/adapters/execution/family-runtime-temporal-provider.ts --temporal-worker-foreground",
        },
        { pid: 99997, ppid: 1, pgid: 99997, command: "env FOO=bar temporal server start-dev" },
        { pid: 99996, ppid: 1, pgid: 99996, command: 'node worker.js TEMPORAL_CMD="temporal server start-dev" HOME=/tmp' },
        { pid: 99995, ppid: 1, pgid: 99995, command: "node --test tests/e2e/tier2/f15-clean-env-neg.test.mjs --temporal-worker" },
      ],
      sandboxLiveProcs: [{ pid: 10001, command: "opld" }],
      expectedOpldCount: 1,
    });
    assert.equal(procAudit.ok, false, "Expected synthetic temporal processes to fail auditProcessHygiene");
    assert.equal(
      procAudit.violations.some((v) => v.rule === "temporal-process-running"),
      true
    );
    assert.deepEqual(
      procAudit.temporalProcesses.map((p) => p.pid).sort((a, b) => a - b),
      [99997, 99998, 99999],
      `Expected only real temporal processes (99997, 99998, 99999) to trigger, got: ${JSON.stringify(procAudit.temporalProcesses)}`
    );
  });

  it("T2-F15-04: synthetic brand-*.json, static package lists, legacy CLI tree, and legacy Python tree are caught", () => {
    const sb = trackSandbox();
    const repo = createCleanSyntheticRepo(sb.root);

    const baseline = auditLegacyDemolition(repo);
    assert.equal(baseline.ok, true, `Clean baseline failed auditLegacyDemolition: ${JSON.stringify(baseline.violations)}`);

    fs.mkdirSync(path.join(repo, "contracts", "opl-framework", "packages"), { recursive: true });
    fs.writeFileSync(
      path.join(repo, "contracts", "opl-framework", "brand-cli-governance.json"),
      JSON.stringify({ brands: ["opl-pack"] }),
      "utf8"
    );
    fs.writeFileSync(
      path.join(repo, "contracts", "opl-framework", "packages", "agent-old-photo-workflow.json"),
      JSON.stringify({ id: "old-photo" }),
      "utf8"
    );
    fs.mkdirSync(path.join(repo, "src", "entrypoints", "cli", "cases"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src", "entrypoints", "cli", "cases", "brand.ts"), "export const x = 1;\n", "utf8");
    fs.mkdirSync(path.join(repo, "python", "opl_framework"), { recursive: true });
    fs.writeFileSync(path.join(repo, "python", "opl_framework", "__init__.py"), "# legacy\n", "utf8");

    const audit = auditLegacyDemolition(repo);
    assert.equal(audit.ok, false, "Expected legacy artifacts to fail auditLegacyDemolition");
    const rules = new Set(audit.violations.map((v) => v.rule));
    for (const expectedRule of [
      "legacy-brand-json",
      "static-package-list",
      "legacy-cli-tree",
      "legacy-python-framework",
    ]) {
      assert.equal(
        rules.has(expectedRule),
        true,
        `Expected rule '${expectedRule}' in ${JSON.stringify([...rules])}`
      );
    }
  });

  it("T2-F15-05: synthetic >3,000L core, >1,500L/non-stdlib Python, in-process Framework dependency in Studio bridge, and DSH CUA/preload diffs are caught", () => {
    const sb = trackSandbox();
    const cleanRepo = createCleanSyntheticRepo(sb.root);
    const cleanBridge = createCleanSyntheticBridge(sb.root);
    const studioRepo = createCleanSyntheticStudioGitRepo(sb.root);

    const baseBudgets = auditLineBudgets({
      repoRoot: cleanRepo,
      bridgeDir: cleanBridge,
      pythonClientDir: path.join(cleanRepo, "sdks", "python-client"),
    });
    assert.equal(baseBudgets.ok, true, `Clean synthetic budgets failed: ${JSON.stringify(baseBudgets.violations)}`);

    const baseBoundaries = auditProtectedBoundaries({ studioRoot: studioRepo, repoRoot: cleanRepo });
    assert.equal(baseBoundaries.ok, true, `Clean synthetic boundaries failed: ${JSON.stringify(baseBoundaries.violations)}`);

    // (a) core > 3,000L
    const bloatRepo = path.join(sb.root, "bloat-repo");
    copyDirClean(cleanRepo, bloatRepo);
    const coreBloat = [];
    for (let i = 0; i < 3005; i++) coreBloat.push(`export const c_${i} = ${i};`);
    fs.writeFileSync(path.join(bloatRepo, "packages", "core", "src", "bloat.ts"), coreBloat.join("\n") + "\n", "utf8");

    // (b) python > 1,500L + non-stdlib import
    const pyBloat = ["import requests"];
    for (let i = 0; i < 1510; i++) pyBloat.push(`VAR_${i} = ${i}`);
    fs.writeFileSync(path.join(bloatRepo, "sdks", "python-client", "opl_client.py"), pyBloat.join("\n") + "\n", "utf8");

    // (c) Studio bypasses opld and opens the Framework database.
    const bloatBridge = path.join(sb.root, "bloat-bridge");
    copyDirClean(cleanBridge, bloatBridge);
    fs.writeFileSync(path.join(bloatBridge, "src", "database.mjs"), 'import { DatabaseSync } from "node:sqlite";\n', "utf8");

    const badBudgets = auditLineBudgets({
      repoRoot: bloatRepo,
      bridgeDir: bloatBridge,
      pythonClientDir: path.join(bloatRepo, "sdks", "python-client"),
    });
    assert.equal(badBudgets.ok, false, "Expected budget and bridge ownership violations");
    const budgetRules = new Set(badBudgets.violations.map((v) => v.rule));
    for (const expectedRule of [
      "core-line-budget",
      "python-line-budget",
      "python-non-stdlib-import",
      "bridge-forbidden-dependency",
    ]) {
      assert.equal(
        budgetRules.has(expectedRule),
        true,
        `Expected budget rule '${expectedRule}' in ${JSON.stringify([...budgetRules])}`
      );
    }

    // (d) dirty desktop/preload.cjs & plugins/opl-host-core/cua.mjs in synthetic Studio git repo + aioncore override in appRoot
    fs.appendFileSync(path.join(studioRepo, "desktop", "preload.cjs"), "// tamper\n", "utf8");
    fs.appendFileSync(path.join(studioRepo, "plugins", "opl-host-core", "cua.mjs"), "// tamper\n", "utf8");
    const appDir = path.join(sb.root, "bad-app-root");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "package.json"),
      JSON.stringify({ name: "one-person-lab-app", overrides: { aioncore: "file:../aioncore-fork" } }, null, 2),
      "utf8"
    );
    assert.equal(
      auditProtectedBoundaries({ studioRoot: studioRepo, repoRoot: cleanRepo }).ok, true,
      "Independent Studio changes belong to the Studio checkout"
    );
    fs.writeFileSync(path.join(studioRepo, "package.json"), JSON.stringify({
      overrides: { "@deepseek-ai/dsh-cua-mcp": "file:../local-cua" },
    }));
    const baselineAudit = auditProtectedBoundaries({ studioRoot: studioRepo, appRoot: appDir, repoRoot: cleanRepo });
    assert.deepEqual(baselineAudit.violations.map(item => item.rule).sort(), ["aioncore-fork-override", "dsh-cua-fork-override"]);
    const badBoundaries = auditProtectedBoundaries({ studioRoot: studioRepo, studioBaseRef: "HEAD", appRoot: appDir, repoRoot: cleanRepo });
    assert.equal(badBoundaries.ok, false, "Expected DSH CUA/preload edits and appRoot aioncore override to fail auditProtectedBoundaries");
    const boundaryRules = new Set(badBoundaries.violations.map((v) => v.rule));
    assert.equal(boundaryRules.has("protected-studio-cua-boundary"), true);
    assert.equal(boundaryRules.has("studio-edit-outside-bridge"), true);
    assert.equal(boundaryRules.has("aioncore-fork-override"), true);
  });
});
