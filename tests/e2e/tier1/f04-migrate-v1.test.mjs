import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCliJson } from "../lib/cli.mjs";
import { addLegacyCarrierFiles, buildV1DomainFixture } from "../lib/fixtures.mjs";
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

describe("Tier 1 — F4: opl pack migrate-v1 (Root & Nested)", () => {
  it("T1-F4-01: opl pack migrate-v1 on root v1 repo outputs valid opl.package.v2 manifest", async () => {
    const sb = trackSandbox();
    const fx = buildV1DomainFixture(path.join(sb.workspaceDir, "mas"), "mas");

    await runCliJson(["pack", "migrate-v1", fx.dir], { sandbox: sb });

    const v2 = JSON.parse(fs.readFileSync(path.join(fx.dir, "opl-package.json"), "utf8"));
    assert.equal(v2.schema_version, "opl.package.v2");
    assert.equal(v2.identity.id, "mas");
    assert.equal(v2.identity.intent, "agent");
    assert.ok(typeof v2.identity.name?.["zh-CN"] === "string" && v2.identity.name["zh-CN"].length > 0);
    assert.ok(typeof v2.identity.name?.["en-US"] === "string" && v2.identity.name["en-US"].length > 0);
    assert.ok(typeof v2.identity.summary?.["zh-CN"] === "string" && v2.identity.summary["zh-CN"].length > 0);
    assert.ok(typeof v2.identity.summary?.["en-US"] === "string" && v2.identity.summary["en-US"].length > 0);

    await runCliJson(["pack", "build", fx.dir], { sandbox: sb });
    assert.equal(fs.existsSync(path.join(fx.dir, "opl-release.lock.json")), true);
  });

  it("T1-F4-02: opl pack migrate-v1 discovers nested plugins/<name>/opl-package.json and writes root v2 manifest", async () => {
    const sb = trackSandbox();
    const relayFx = buildV1DomainFixture(path.join(sb.workspaceDir, "opl-relay"), "opl-relay");
    const personaFx = buildV1DomainFixture(path.join(sb.workspaceDir, "opl-persona"), "opl-persona");

    assert.equal(fs.existsSync(path.join(relayFx.dir, "opl-package.json")), false);
    assert.equal(fs.existsSync(path.join(personaFx.dir, "opl-package.json")), false);

    await runCliJson(["pack", "migrate-v1", relayFx.dir], { sandbox: sb });
    const relayV2 = JSON.parse(fs.readFileSync(path.join(relayFx.dir, "opl-package.json"), "utf8"));
    assert.equal(relayV2.schema_version, "opl.package.v2");
    assert.equal(relayV2.identity.id, "opl-relay");
    assert.equal(relayV2.identity.intent, "app");
    await runCliJson(["pack", "build", relayFx.dir], { sandbox: sb });

    await runCliJson(["pack", "migrate-v1", personaFx.dir], { sandbox: sb });
    const personaV2 = JSON.parse(fs.readFileSync(path.join(personaFx.dir, "opl-package.json"), "utf8"));
    assert.equal(personaV2.schema_version, "opl.package.v2");
    assert.equal(personaV2.identity.id, "opl-persona");
    assert.equal(personaV2.identity.intent, "extension");
    await runCliJson(["pack", "build", personaFx.dir], { sandbox: sb });
  });

  it("T1-F4-03: migrate-v1 deduplicates overlapping dependencies across requires, required_capability_package_ids, and capability_dependencies", async () => {
    const sb = trackSandbox();
    const fx = buildV1DomainFixture(path.join(sb.workspaceDir, "mas-dedup"), "mas");

    await runCliJson(["pack", "migrate-v1", fx.dir], { sandbox: sb });

    const v2 = JSON.parse(fs.readFileSync(path.join(fx.dir, "opl-package.json"), "utf8"));
    const matches = (v2.dependencies?.packages || []).filter((p) => p.id === "mas-scholar-skills");
    assert.equal(matches.length, 1, `Expected exactly 1 mas-scholar-skills dependency, got ${JSON.stringify(matches)}`);
  });

  it("T1-F4-04: migrate-v1 converts .codex-plugin/plugin.json into host_hints.codex + identity and deletes legacy carrier files", async () => {
    const sb = trackSandbox();
    const fx = buildV1DomainFixture(path.join(sb.workspaceDir, "mas-legacy"), "mas");
    addLegacyCarrierFiles(fx.dir, { carrierProjection: true, rootPluginJson: true });

    await runCliJson(["pack", "migrate-v1", fx.dir], { sandbox: sb });

    const v2 = JSON.parse(fs.readFileSync(path.join(fx.dir, "opl-package.json"), "utf8"));
    assert.equal(v2.host_hints?.codex?.plugin_name, "med-autoscience");
    assert.equal(v2.host_hints?.codex?.category, "Research");
    assert.equal(v2.host_hints?.codex?.brand_color, "#1F7A8C");
    assert.ok(Array.isArray(v2.identity?.default_prompts) && v2.identity.default_prompts.length > 0);
    assert.equal(fs.existsSync(path.join(fx.dir, ".codex-plugin/plugin.json")), false);
    assert.equal(fs.existsSync(path.join(fx.dir, "contracts/carrier_projection.json")), false);
    assert.equal(fs.existsSync(path.join(fx.dir, "plugin.json")), false);
  });

  it("T1-F4-05: migrate-v1 deletes plugins/<name>/ source mirrors and passes subsequent opl pack build", async () => {
    const sb = trackSandbox();
    const fx = buildV1DomainFixture(path.join(sb.workspaceDir, "mas-mirror"), "mas");

    await runCliJson(["pack", "migrate-v1", fx.dir], { sandbox: sb });

    assert.equal(fs.existsSync(path.join(fx.dir, "plugins/med-autoscience")), false);
    assert.equal(fs.existsSync(path.join(fx.dir, "plugins/mas-scholar-skills")), false);
    assert.equal(fs.existsSync(path.join(fx.dir, "plugins/opl-foundation-skills")), false);
    assert.equal(fs.existsSync(path.join(fx.dir, "skills/med-autoscience/SKILL.md")), true);

    await runCliJson(["pack", "build", fx.dir], { sandbox: sb });
    assert.equal(fs.existsSync(path.join(fx.dir, "opl-release.lock.json")), true);
  });
});
