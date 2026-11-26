import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCli, runCliExpectCode, runCliJson } from "../lib/cli.mjs";
import { buildV2Package, readCodexMarketplaceProjection } from "../lib/fixtures.mjs";
import { createSandbox } from "../lib/sandbox.mjs";
import { getInstalledPackage, openOplDb } from "../lib/sqlite-inspector.mjs";

const activeSandboxes = [];

function trackSandbox() {
  const sb = createSandbox();
  activeSandboxes.push(sb);
  return sb;
}

afterEach(async () => {
  while (activeSandboxes.length > 0) {
    const sb = activeSandboxes.pop();
    await sb.cleanup();
  }
});

describe("Tier 2 — F3 Negative & Boundary: carriers/codex-sync", () => {
  it("T2-F3-01: package with host_hints.codex.sync_enabled false skips Codex marketplace projection on link", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const pkg = buildV2Package(path.join(sb.workspaceDir, "weixin"), {
      intent: "channel",
      id: "opl-channel-weixin",
      pluginName: "opl-channel-weixin",
      syncEnabled: false,
      specStrict: true,
    });

    await runCliJson(["pack", "link", pkg.dir], { sandbox: sb });

    const proj = readCodexMarketplaceProjection(sb.oplHome, "opl-channel-weixin");
    assert.equal(proj.pluginJson, null, "sync_enabled: false must not project .codex-plugin/plugin.json");
    if (proj.marketplace) {
      assert.equal(
        (proj.marketplace.plugins || []).some((p) => p.name === "opl-channel-weixin"),
        false
      );
    }
  });

  it("T2-F3-02: opl pack link on directory missing opl-package.json fails with exit 2 without mutating marketplace", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const emptyDir = path.join(sb.workspaceDir, "empty-pkg");
    fs.mkdirSync(emptyDir, { recursive: true });

    const res = await runCliExpectCode(["pack", "link", emptyDir, "--json"], 2, { sandbox: sb });
    const combined = `${res.stdout}\n${res.stderr}`;
    assert.match(combined, /opl-package\.json|manifest|missing|not found/i);

    const mpPath = path.join(sb.oplHome, "carriers", "codex-marketplace", "marketplace.json");
    assert.equal(fs.existsSync(mpPath), false);
  });

  it("T2-F3-03: opl pack sync codex fails closed on codex app-server load_error and bad_shape readback faults", async () => {
    // A: marketplaceLoadErrors -> fail closed
    const sbLoad = trackSandbox();
    const pkgLoad = buildV2Package(path.join(sbLoad.workspaceDir, "mas"), {
      intent: "agent",
      id: "mas",
      pluginName: "med-autoscience",
      specStrict: true,
    });
    await sbLoad.startDaemon({ env: { OPL_STUB_CODEX_APP_SERVER_FAULT: "load_error" } });
    await runCli(["pack", "link", pkgLoad.dir, "--json"], {
      sandbox: sbLoad,
      env: { OPL_STUB_CODEX_APP_SERVER_FAULT: "load_error" },
    });

    const loadRes = await runCli(["pack", "sync", "codex", "--json"], {
      sandbox: sbLoad,
      env: { OPL_STUB_CODEX_APP_SERVER_FAULT: "load_error" },
    });
    assert.notEqual(loadRes.code, 0, "Expected pack sync codex to fail closed on load_error");
    assert.match(`${loadRes.stdout}\n${loadRes.stderr}`, /OPL_CODEX_PLUGIN_READBACK|load_error|marketplaceLoadErrors|broken-marketplace/i);

    // B: bad_shape -> fail closed
    const sbShape = trackSandbox();
    const pkgShape = buildV2Package(path.join(sbShape.workspaceDir, "mas"), {
      intent: "agent",
      id: "mas",
      pluginName: "med-autoscience",
      specStrict: true,
    });
    await sbShape.startDaemon({ env: { OPL_STUB_CODEX_APP_SERVER_FAULT: "bad_shape" } });
    await runCli(["pack", "link", pkgShape.dir, "--json"], {
      sandbox: sbShape,
      env: { OPL_STUB_CODEX_APP_SERVER_FAULT: "bad_shape" },
    });
    const shapeRes = await runCli(["pack", "sync", "codex", "--json"], {
      sandbox: sbShape,
      env: { OPL_STUB_CODEX_APP_SERVER_FAULT: "bad_shape" },
    });
    assert.notEqual(shapeRes.code, 0, "Expected pack sync codex to fail closed on bad_shape");
    assert.match(`${shapeRes.stdout}\n${shapeRes.stderr}`, /OPL_CODEX_PLUGIN_READBACK_INVALID_SHAPE|invalid|shape|marketplaces/i);
  });

  it("T2-F3-04: opl pack sync codex handles app-server stall/timeout without corrupting installed_packages", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const pkg = buildV2Package(path.join(sb.workspaceDir, "mas"), {
      intent: "agent",
      id: "mas",
      pluginName: "med-autoscience",
      specStrict: true,
    });
    await runCliJson(["pack", "link", pkg.dir], { sandbox: sb });

    const dbBefore = openOplDb(sb.dbPath, { readOnly: true });
    try {
      assert.ok(getInstalledPackage(dbBefore, "mas"), "Expected mas to be installed before stalled sync");
    } finally {
      dbBefore.close();
    }

    await sb.stopDaemon();
    await sb.startDaemon({ env: { OPL_STUB_CODEX_APP_SERVER_FAULT: "stall" } });

    const stallRes = await runCli(["pack", "sync", "codex", "--json"], {
      sandbox: sb,
      env: { OPL_STUB_CODEX_APP_SERVER_FAULT: "stall" },
      timeoutMs: 8000,
    });
    assert.ok(stallRes.code !== 0 || stallRes.timedOut, "Expected stalled codex sync to fail cleanly");

    const dbAfter = openOplDb(sb.dbPath, { readOnly: true });
    try {
      const row = getInstalledPackage(dbAfter, "mas");
      assert.ok(row, "Existing installed_packages row must not be deleted or corrupted on sync timeout");
      assert.equal(row.package_id, "mas");
    } finally {
      dbAfter.close();
    }
  });

  it("T2-F3-05: opl pack link rejects v2 package still containing forbidden plugins/<name>/ source mirror", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const pkg = buildV2Package(path.join(sb.workspaceDir, "dirty-agent"), {
      intent: "agent",
      id: "dirty-agent",
      pluginName: "dirty-agent",
      includePluginMirrorDir: true,
      specStrict: true,
    });

    const res = await runCliExpectCode(["pack", "link", pkg.dir, "--json"], 2, { sandbox: sb });
    const combined = `${res.stdout}\n${res.stderr}`;
    assert.match(combined, /plugins\/|mirror|forbidden/i);

    const proj = readCodexMarketplaceProjection(sb.oplHome, "dirty-agent");
    assert.equal(proj.pluginJson, null, "Forbidden mirror package must not project into codex-marketplace");
  });
});
