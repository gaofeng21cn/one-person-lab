import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { pathToFileURL } from "node:url";

import { runCliOk } from "../lib/cli.mjs";
import { buildV2Package } from "../lib/fixtures.mjs";
import { createSandbox } from "../lib/sandbox.mjs";
import { getInstalledPackage, openOplDb } from "../lib/sqlite-inspector.mjs";

const STUDIO_ROOT = path.resolve(
  process.env.OPL_STUDIO_ROOT || "/Users/gaofeng/workspace/.worktrees/opl-studio-v2-bridge"
);
const BRIDGE_DIR = path.resolve(
  process.env.OPL_STUDIO_BRIDGE_DIR ||
    (fs.existsSync(path.join(STUDIO_ROOT, "plugins", "core", "opl-framework-bridge"))
      ? path.join(STUDIO_ROOT, "plugins", "core", "opl-framework-bridge")
      : path.join(STUDIO_ROOT, "plugins", "opl-framework-bridge"))
);

const activeSandboxes = [];
const activeBridges = [];

function makeSandbox(opts = {}) {
  const sb = createSandbox(opts);
  activeSandboxes.push(sb);
  return sb;
}

function trackBridge(bridge) {
  activeBridges.push(bridge);
  return bridge;
}

async function loadBridgeModule() {
  const builtEntry = path.join(BRIDGE_DIR, "lib/index.mjs");
  const srcEntry = path.join(BRIDGE_DIR, "src/index.mjs");
  const entry = fs.existsSync(builtEntry) ? builtEntry : srcEntry;
  assert.ok(fs.existsSync(entry), `OplFrameworkBridge entrypoint not found: ${entry}`);
  return import(pathToFileURL(entry).href);
}

function createCanaryOplBin(sb) {
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

function countSpawnLogLines() {
  const logPath = process.env.OPL_E2E_SPAWN_LOG;
  if (!logPath || !fs.existsSync(logPath)) return 0;
  return fs
    .readFileSync(logPath, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0).length;
}

function listFilesRecursive(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFilesRecursive(full));
    else if (ent.isFile()) out.push(full);
  }
  return out;
}

afterEach(async () => {
  while (activeBridges.length > 0) {
    const b = activeBridges.pop();
    try {
      await b.close?.();
    } catch {
      // ignore close errors during teardown
    }
  }
  while (activeSandboxes.length > 0) {
    const sb = activeSandboxes.pop();
    await sb.cleanup();
  }
});

describe("Tier 2 F8: opl-framework-bridge Boundary & Negative Cases", () => {
  it("T2-F8-01: major api_version mismatch returns base_upgrade_required without fallback to spawn('opl') or cordis-profiles", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const { hitMarkerPath, spyEnv } = createCanaryOplBin(sb);
    const mod = await loadBridgeModule();
    const bridge = trackBridge(
      new mod.OplFrameworkBridge({
        workspaceRoot: sb.workspaceDir,
        env: { ...spyEnv, OPL_BRIDGE_API_VERSION: "99.0" },
        apiVersion: "99.0",
      })
    );

    const spawnsBefore = countSpawnLogLines();
    let caught = null;
    let caps = null;
    try {
      caps = await bridge.start();
    } catch (err) {
      caught = err;
    }
    const spawnsAfter = countSpawnLogLines();

    if (caught) {
      assert.equal(caught.code, "base_upgrade_required", `Expected base_upgrade_required error code, got ${caught.code}: ${caught.message}`);
    } else {
      assert.equal(caps?.available, false, `Expected unavailable capabilities on major skew, got: ${JSON.stringify(caps)}`);
      assert.equal(caps?.reasonCode, "base_upgrade_required", `Expected reasonCode base_upgrade_required, got: ${JSON.stringify(caps)}`);
    }
    assert.equal(spawnsAfter - spawnsBefore, 0, "Expected zero spawn('opl') fallback on api_version mismatch");
    assert.equal(fs.existsSync(hitMarkerPath), false, "Canary opl binary must never be executed");
  });

  it("T2-F8-02: OPL_STUDIO_READ_ONLY=1 blocks mutating executeAction (blocked_read_only) while allowing readState('fast')", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const pkgDir = path.join(sb.root, "pkg-mas");
    buildV2Package(pkgDir, { id: "mas", intent: "agent", specStrict: true });
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });

    const mod = await loadBridgeModule();
    const bridge = trackBridge(
      new mod.OplFrameworkBridge({
        workspaceRoot: sb.workspaceDir,
        env: { ...sb.env, OPL_STUDIO_READ_ONLY: "1" },
      })
    );
    await bridge.start();

    const fast = await bridge.opl.readState("fast");
    assert.equal(fast.profile, "fast");

    let caught = null;
    let res = null;
    try {
      res = await bridge.opl.executeAction({
        actionId: "agent_package_uninstall",
        payload: { package_id: "mas", confirmed: true },
        dryRun: false,
        mode: "execute",
      });
    } catch (err) {
      caught = err;
    }

    if (caught) {
      assert.equal(caught.code, "blocked_read_only", `Expected blocked_read_only error, got ${caught.code}: ${caught.message}`);
    } else {
      const code = res?.code ?? res?.status ?? res?.receiptKind ?? res?.receipt_kind;
      assert.equal(code, "blocked_read_only", `Expected blocked_read_only receipt, got: ${JSON.stringify(res)}`);
    }

    const db = openOplDb(sb.dbPath, { readOnly: true });
    try {
      const pkg = getInstalledPackage(db, "mas");
      assert.ok(pkg && pkg.enabled === 1, "Read-only block must leave installed package untouched in SQLite");
    } finally {
      db.close();
    }
  });

  it("T2-F8-03: socket drop during bridge lifecycle triggers reconnect with backoff without crashing host", async () => {
    const sb = makeSandbox();
    const d1 = await sb.startDaemon();

    const mod = await loadBridgeModule();
    const bridge = trackBridge(
      new mod.OplFrameworkBridge({ workspaceRoot: sb.workspaceDir, env: sb.env, autoStart: false })
    );
    await bridge.start();

    const before = await bridge.opl.readState("fast");
    assert.equal(before.profile, "fast");

    await sb.killDaemon({ signal: "SIGKILL" });
    await assert.rejects(() => bridge.opl.readState("fast"));

    const d2 = await sb.startDaemon();
    assert.notEqual(d2.pid, d1.pid);
    assert.notEqual(d2.session.token, d1.session.token);

    let reconnected = null;
    const deadline = Date.now() + 5000;
    let lastErr = null;
    while (Date.now() < deadline) {
      try {
        reconnected = await bridge.opl.readState("fast");
        break;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    assert.ok(reconnected, `Expected bridge to reconnect to restarted opld within 5s; lastErr=${lastErr?.message}`);
    assert.equal(reconnected.profile, "fast");
  });

  it("T2-F8-04: invalid input requests reject with invalid_request before RPC dispatch", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const mod = await loadBridgeModule();
    const bridge = trackBridge(new mod.OplFrameworkBridge({ workspaceRoot: sb.workspaceDir, env: sb.env }));
    await bridge.start();

    await assert.rejects(
      () => bridge.opl.executeAction({}),
      (err) => err?.code === "invalid_request"
    );
    await assert.rejects(
      () => bridge.opl.readDomainDetailView({ itemId: "mas", viewId: "v1", ifRevision: -1 }),
      (err) => err?.code === "invalid_request"
    );
    await assert.rejects(
      () => bridge.opl.readDomainDetailView({ itemId: "", viewId: "v1" }),
      (err) => err?.code === "invalid_request"
    );
    await assert.rejects(
      () => bridge.opl.readContribution({ packageId: "", ref: "x" }),
      (err) => err?.code === "invalid_request"
    );

    for (const invokeBad of [
      () => bridge.connectionAccessApproval({ requestId: "bad;id" }),
      () => bridge.connectionAccessApproval.approve("bad;id"),
    ]) {
      let approvalErr = null;
      let approvalRes = null;
      try {
        approvalRes = await invokeBad();
      } catch (err) {
        approvalErr = err;
      }
      if (approvalErr) {
        assert.equal(approvalErr.code, "invalid_request");
      } else {
        assert.equal(approvalRes?.ok, false);
        assert.equal(approvalRes?.errorCode, "invalid_request");
      }
    }
  });

  it("T2-F8-05: bridge source & built bundle static audit confirms zero legacy cordis-profiles, compactFastState, or CLI passthrough", async () => {
    const srcDir = path.join(BRIDGE_DIR, "src");
    const srcFiles = listFilesRecursive(srcDir).filter((f) => /\.(mjs|js|ts)$/.test(f));
    assert.ok(srcFiles.length > 0 && srcFiles.length <= 5, `Expected <= 5 files in bridge src/, got ${srcFiles.length}`);

    let totalLines = 0;
    const forbiddenPatterns = [
      /loadFrameworkCordisProfiles/,
      /startCordisWorkbenchServicesHost/,
      /startCordisChannelProviderHost/,
      /compactFastState/,
      /command-runtime\.mjs/,
      /opl-passthrough\//,
      /cordis-profiles/,
      /["']app["']\s*,\s*["']state["']/,
      /["']sources["']\s*,\s*["']check["']/,
      /["']system["']\s*,\s*["']initialize["']/,
      /["']app["']\s*,\s*["']view["']/,
      /["']app["']\s*,\s*["']contribution["']/,
      /["']app["']\s*,\s*["']action["']/,
      /["']connect["']\s*,\s*["']authorization["']/,
    ];

    for (const file of srcFiles) {
      const content = fs.readFileSync(file, "utf8");
      totalLines += content.length > 0 ? content.split("\n").length - (content.endsWith("\n") ? 1 : 0) : 0;
      for (const re of forbiddenPatterns) {
        assert.doesNotMatch(content, re, `Forbidden legacy symbol ${re} found in ${file}`);
      }
    }

    assert.ok(totalLines < 400, `Expected bridge src/ total lines < 400, got ${totalLines}`);

    const libBundle = path.join(BRIDGE_DIR, "lib/index.mjs");
    if (fs.existsSync(libBundle)) {
      const bundleContent = fs.readFileSync(libBundle, "utf8");
      for (const re of forbiddenPatterns) {
        assert.doesNotMatch(bundleContent, re, `Forbidden legacy symbol ${re} found in built ${libBundle}`);
      }
    }
  });
});
