import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCliJson } from "../lib/cli.mjs";
import { buildV2Package, computeContentLock } from "../lib/fixtures.mjs";
import { createSandbox } from "../lib/sandbox.mjs";

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

describe("Tier 1 — F2: OPL Pack Manifest v2 & Deterministic Build", () => {
  it("T1-F2-01: opl pack build on valid agent v2 manifest produces opl-release.lock.json", async () => {
    const sb = trackSandbox();
    const pkg = buildV2Package(path.join(sb.workspaceDir, "mas"), {
      intent: "agent",
      id: "mas",
      pluginName: "med-autoscience",
      specStrict: true,
    });

    await runCliJson(["pack", "build", pkg.dir], { sandbox: sb });

    const lockPath = path.join(pkg.dir, "opl-release.lock.json");
    assert.equal(fs.existsSync(lockPath), true, "Expected opl-release.lock.json to be written");
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    assert.equal(lock.algorithm, "sha256");
    assert.equal(lock.canonicalization, "ordered_path_length_file_length_bytes");
    assert.match(lock.digest, /^sha256:[0-9a-f]{64}$/);
    assert.ok(Array.isArray(lock.paths) && lock.paths.length > 0);
    assert.equal(lock.file_count, lock.paths.length);
    const sorted = [...lock.paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    assert.deepEqual(lock.paths, sorted);
    assert.ok(lock.paths.includes("opl-package.json"));
    assert.ok(lock.paths.includes("skills/mas/SKILL.md"));
    assert.equal(lock.digest, computeContentLock(pkg.dir).digest);
  });

  it("T1-F2-02: opl pack build digest is 100% deterministic across runs and creation order", async () => {
    const sb = trackSandbox();
    const pkgA = buildV2Package(path.join(sb.workspaceDir, "det-a"), {
      intent: "agent",
      id: "det-agent",
      specStrict: true,
    });
    fs.writeFileSync(path.join(pkgA.dir, "z-file.txt"), "zeta-payload\n", "utf8");
    fs.writeFileSync(path.join(pkgA.dir, "a-file.txt"), "alpha-payload\n", "utf8");

    const pkgB = buildV2Package(path.join(sb.workspaceDir, "det-b"), {
      intent: "agent",
      id: "det-agent",
      specStrict: true,
    });
    fs.writeFileSync(path.join(pkgB.dir, "a-file.txt"), "alpha-payload\n", "utf8");
    fs.writeFileSync(path.join(pkgB.dir, "z-file.txt"), "zeta-payload\n", "utf8");

    await runCliJson(["pack", "build", pkgA.dir], { sandbox: sb });
    const lockA1 = JSON.parse(fs.readFileSync(path.join(pkgA.dir, "opl-release.lock.json"), "utf8"));

    await runCliJson(["pack", "build", pkgB.dir], { sandbox: sb });
    const lockB = JSON.parse(fs.readFileSync(path.join(pkgB.dir, "opl-release.lock.json"), "utf8"));

    await runCliJson(["pack", "build", pkgA.dir], { sandbox: sb });
    const lockA2 = JSON.parse(fs.readFileSync(path.join(pkgA.dir, "opl-release.lock.json"), "utf8"));

    assert.equal(lockA1.digest, lockA2.digest);
    assert.equal(lockA1.digest, lockB.digest);
    assert.deepEqual(lockA1.paths, lockB.paths);
    assert.equal(lockA1.digest, computeContentLock(pkgA.dir).digest);
  });

  it("T1-F2-03: validating app manifest with Tier 3 ui.mcp_apps bound to provides.mcp_servers succeeds", async () => {
    const sb = trackSandbox();
    const pkg = buildV2Package(path.join(sb.workspaceDir, "relay"), {
      intent: "app",
      id: "opl-relay",
      specStrict: true,
    });

    await runCliJson(["pack", "build", pkg.dir], { sandbox: sb });
    const insp = await runCliJson(["pack", "inspect", pkg.dir], { sandbox: sb });
    const manifest = insp.manifest ?? insp;

    assert.equal(fs.existsSync(path.join(pkg.dir, "opl-release.lock.json")), true);
    assert.equal(manifest.schema_version, "opl.package.v2");
    assert.equal(manifest.identity.intent, "app");
    assert.equal(manifest.ui.mcp_apps[0].mcp_server_id, "opl-relay-mcp");
    assert.equal(manifest.provides.mcp_servers[0].id, "opl-relay-mcp");
  });

  it("T1-F2-04: validating channel manifest with Tier 1 ui.declarative views and settings_forms succeeds", async () => {
    const sb = trackSandbox();
    const pkg = buildV2Package(path.join(sb.workspaceDir, "weixin"), {
      intent: "channel",
      id: "opl-channel-weixin",
      specStrict: true,
      settingsForms: [
        {
          id: "weixin.prefs",
          destination: "preferences",
          title: { "zh-CN": "微信偏好", "en-US": "Weixin Preferences" },
          data_ref: "weixin.prefs.state",
          submit_action_ref: "weixin.prefs.save",
        },
      ],
    });

    await runCliJson(["pack", "build", pkg.dir], { sandbox: sb });
    const insp = await runCliJson(["pack", "inspect", pkg.dir], { sandbox: sb });
    const manifest = insp.manifest ?? insp;

    assert.equal(fs.existsSync(path.join(pkg.dir, "opl-release.lock.json")), true);
    assert.equal(manifest.identity.intent, "channel");
    assert.equal(manifest.ui.declarative.views[0].settings_destination, "resources");
    assert.equal(manifest.ui.declarative.settings_forms[0].destination, "preferences");
  });

  it("T1-F2-05: validating extension manifest with cli_extensions succeeds and opl pack inspect returns full v2 fields", async () => {
    const sb = trackSandbox();
    const pkg = buildV2Package(path.join(sb.workspaceDir, "foundry"), {
      intent: "extension",
      id: "opl-foundry",
      specStrict: true,
    });

    await runCliJson(["pack", "build", pkg.dir], { sandbox: sb });
    const insp = await runCliJson(["pack", "inspect", pkg.dir], { sandbox: sb });
    const manifest = insp.manifest ?? insp;
    const lock = JSON.parse(fs.readFileSync(path.join(pkg.dir, "opl-release.lock.json"), "utf8"));

    assert.equal(manifest.schema_version, "opl.package.v2");
    assert.equal(manifest.identity.id, "opl-foundry");
    assert.equal(manifest.identity.intent, "extension");
    assert.equal(manifest.provides.cli_extensions[0].namespace, "foundry");
    assert.equal(manifest.provides.cli_extensions[0].entrypoint.kind, "esm_module");
    assert.equal(lock.digest, computeContentLock(pkg.dir).digest);
  });
});
