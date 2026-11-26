import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCliJson } from "../lib/cli.mjs";
import {
  buildV2Package,
  createLocalPackageArchive,
  readCodexMarketplaceProjection,
} from "../lib/fixtures.mjs";
import { createSandbox } from "../lib/sandbox.mjs";

const activeSandboxes = [];

function trackSandbox() {
  const sb = createSandbox();
  activeSandboxes.push(sb);
  return sb;
}

function readStubJsonl(logPath) {
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

afterEach(async () => {
  while (activeSandboxes.length > 0) {
    const sb = activeSandboxes.pop();
    await sb.cleanup();
  }
});

describe("Tier 1 — F3: carriers/codex-sync & opl pack link/unlink/sync", () => {
  it("T1-F3-01: opl pack link creates .codex-plugin/plugin.json and zero-copy skills & assets symlinks", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const pkg = buildV2Package(path.join(sb.workspaceDir, "mas"), {
      intent: "agent",
      id: "mas",
      pluginName: "med-autoscience",
      specStrict: true,
    });

    await runCliJson(["pack", "link", pkg.dir], { sandbox: sb });

    const proj = readCodexMarketplaceProjection(sb.oplHome, "med-autoscience");
    assert.ok(proj.marketplace, "Expected marketplace.json to exist");
    assert.equal(proj.marketplace.name, "opl-local");
    assert.ok(
      proj.marketplace.plugins.some((p) => p.name === "med-autoscience"),
      "Expected marketplace.json to include med-autoscience"
    );
    assert.ok(proj.pluginJson, "Expected .codex-plugin/plugin.json to exist");
    assert.equal(proj.skillsIsSymlink, true, "skills must be a zero-copy symlink");
    assert.equal(proj.skillsRealPath, fs.realpathSync(pkg.skillsDir));
    assert.equal(proj.assetsIsSymlink, true, "assets must be a zero-copy symlink");
    assert.equal(proj.assetsRealPath, fs.realpathSync(pkg.assetsDir));
    assert.equal(fs.existsSync(path.join(pkg.dir, "plugins")), false, "Source repo must have zero plugins/ mirror");
  });

  it("T1-F3-02: projected .codex-plugin/plugin.json preserves host_hints.codex and identity fields", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const pkg = buildV2Package(path.join(sb.workspaceDir, "mas"), {
      intent: "agent",
      id: "mas",
      version: "0.4.0",
      pluginName: "med-autoscience",
      specStrict: true,
      manifestOverride: {
        host_hints: {
          codex: {
            plugin_name: "med-autoscience",
            category: "Research",
            brand_color: "#1F7A8C",
            capabilities: ["Interactive", "Write"],
          },
        },
      },
    });

    await runCliJson(["pack", "link", pkg.dir], { sandbox: sb });

    const proj = readCodexMarketplaceProjection(sb.oplHome, "med-autoscience");
    assert.ok(proj.pluginJson, "Expected projected .codex-plugin/plugin.json");
    assert.equal(proj.pluginJson.name, "med-autoscience");
    assert.equal(proj.pluginJson.version, "0.4.0");
    assert.equal(proj.pluginJson.skills, "./skills/");
    assert.equal(proj.pluginJson.interface.displayName, pkg.manifest.identity.name["en-US"]);
    assert.equal(proj.pluginJson.interface.shortDescription, pkg.manifest.identity.summary["en-US"]);
    assert.equal(proj.pluginJson.interface.category, "Research");
    assert.equal(proj.pluginJson.interface.brandColor, "#1F7A8C");
    assert.deepEqual(proj.pluginJson.interface.defaultPrompt, pkg.manifest.identity.default_prompts);
    assert.deepEqual(proj.pluginJson.interface.capabilities, ["Interactive", "Write"]);
  });

  it("T1-F3-03: opl pack sync codex performs bidirectional plugin/list readback via codex stub", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const pkg = buildV2Package(path.join(sb.workspaceDir, "mas"), {
      intent: "agent",
      id: "mas",
      pluginName: "med-autoscience",
      specStrict: true,
    });
    await runCliJson(["pack", "link", pkg.dir], { sandbox: sb });

    const syncRes = await runCliJson(["pack", "sync", "codex"], { sandbox: sb });
    assert.notEqual(syncRes.ok, false);

    const serialized = JSON.stringify(syncRes);
    assert.ok(
      serialized.includes("med-autoscience") || serialized.includes("mas"),
      `Expected sync result to reference synced plugin, got: ${serialized}`
    );

    const stubLogs = readStubJsonl(path.join(sb.stubLogDir, "codex.jsonl"));
    assert.ok(
      stubLogs.some((ev) => ev.event === "invocation" && ev.subcommand === "app_server"),
      "Expected codex app-server --stdio invocation in stub logs"
    );
  });

  it("T1-F3-04: external Codex plugin from stub plugin/list appears in opl pack list with origin external and carrier codex", async () => {
    const sb = trackSandbox();
    const extPluginDir = path.join(sb.root, "ext-obsidian");
    fs.mkdirSync(path.join(extPluginDir, ".codex-plugin"), { recursive: true });
    fs.writeFileSync(
      path.join(extPluginDir, ".codex-plugin", "plugin.json"),
      JSON.stringify({ name: "obsidian-helper", version: "1.2.0" }, null, 2),
      "utf8"
    );

    const externalPluginsEnv = JSON.stringify([
      { name: "obsidian-helper", version: "1.2.0", path: extPluginDir },
    ]);
    await sb.startDaemon({ env: { OPL_STUB_CODEX_EXTERNAL_PLUGINS_JSON: externalPluginsEnv } });

    await runCliJson(["pack", "sync", "codex"], {
      sandbox: sb,
      env: { OPL_STUB_CODEX_EXTERNAL_PLUGINS_JSON: externalPluginsEnv },
    });
    const listRes = await runCliJson(["pack", "list"], {
      sandbox: sb,
      env: { OPL_STUB_CODEX_EXTERNAL_PLUGINS_JSON: externalPluginsEnv },
    });

    const items = Array.isArray(listRes) ? listRes : (listRes.packages || listRes.items || []);
    const found = items.find(
      (p) =>
        p.name === "obsidian-helper" ||
        p.package_id === "obsidian-helper" ||
        p.id === "obsidian-helper" ||
        p.host_hints?.codex?.plugin_name === "obsidian-helper"
    );
    assert.ok(found, `Expected external plugin obsidian-helper in pack list: ${JSON.stringify(listRes)}`);
    assert.equal(found.origin, "external");
    assert.equal(found.carrier, "codex");
    assert.ok(
      String(found.package_id || found.id || "").includes("obsidian-helper"),
      `Expected preserved external plugin id/name in package_id, got: ${JSON.stringify(found)}`
    );
  });

  it("T1-F3-05: opl pack unlink and opl pack uninstall remove marketplace projection while leaving source repo intact", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const pkg = buildV2Package(path.join(sb.workspaceDir, "mas"), {
      intent: "agent",
      id: "mas",
      pluginName: "med-autoscience",
      specStrict: true,
    });
    const sourceSkill = path.join(pkg.skillsDir, "mas", "SKILL.md");

    // 1. link -> unlink
    await runCliJson(["pack", "link", pkg.dir], { sandbox: sb });
    const afterLink = readCodexMarketplaceProjection(sb.oplHome, "med-autoscience");
    assert.equal(fs.existsSync(afterLink.pluginDir), true);

    await runCliJson(["pack", "unlink", "mas"], { sandbox: sb });
    const afterUnlink = readCodexMarketplaceProjection(sb.oplHome, "med-autoscience");
    assert.equal(fs.existsSync(afterUnlink.pluginDir), false);
    if (afterUnlink.marketplace) {
      assert.equal(
        (afterUnlink.marketplace.plugins || []).some((p) => p.name === "med-autoscience"),
        false
      );
    }
    assert.equal(fs.existsSync(sourceSkill), true, "Source SKILL.md must remain intact after unlink");

    // 2. build -> archive -> install -> uninstall
    await runCliJson(["pack", "build", pkg.dir], { sandbox: sb });
    const arch = createLocalPackageArchive(pkg.dir, path.join(sb.root, "dist"), { includeLockFile: true });
    await runCliJson(["pack", "install", arch.archivePath], { sandbox: sb });

    const afterInstall = readCodexMarketplaceProjection(sb.oplHome, "med-autoscience");
    assert.equal(fs.existsSync(afterInstall.pluginDir), true);
    assert.equal(fs.existsSync(path.join(sb.stateDir, "packages", "mas")), true);

    await runCliJson(["pack", "uninstall", "mas"], { sandbox: sb });
    const afterUninstall = readCodexMarketplaceProjection(sb.oplHome, "med-autoscience");
    assert.equal(fs.existsSync(afterUninstall.pluginDir), false);
    assert.equal(fs.existsSync(path.join(sb.stateDir, "packages", "mas")), false);
    assert.equal(fs.existsSync(sourceSkill), true, "Source SKILL.md must remain intact after uninstall");
  });
});
