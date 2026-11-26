import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCli, runCliExpectCode, runCliJson } from "../lib/cli.mjs";
import { buildCorruptV1Fixture } from "../lib/fixtures.mjs";
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

describe("Tier 2 — F4 Negative & Boundary: opl pack migrate-v1", () => {
  it("T2-F4-01: opl pack migrate-v1 on directory missing opl-package.json fails with exit 2", async () => {
    const sb = trackSandbox();
    const fx = buildCorruptV1Fixture(path.join(sb.workspaceDir, "no-manifest"), "missing_manifest");

    const res = await runCliExpectCode(["pack", "migrate-v1", fx.dir, "--json"], 2, { sandbox: sb });
    assert.match(`${res.stdout}\n${res.stderr}`, /opl-package\.json|manifest|missing|not found/i);
    assert.equal(fs.existsSync(path.join(fx.dir, "opl-package.json")), false);
  });

  it("T2-F4-02: opl pack migrate-v1 on already-v2 package is idempotent or rejects cleanly without corrupting manifest", async () => {
    const sb = trackSandbox();
    const fx = buildCorruptV1Fixture(path.join(sb.workspaceDir, "already-v2"), "already_v2");
    const beforeBytes = fs.readFileSync(fx.manifestPath, "utf8");

    const res = await runCli(["pack", "migrate-v1", fx.dir, "--json"], { sandbox: sb });
    assert.ok(
      res.code === 0 || res.code === 2,
      `Expected exit 0 (idempotent) or 2 (already v2), got ${res.code}\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
    );

    const afterBytes = fs.readFileSync(fx.manifestPath, "utf8");
    const parsed = JSON.parse(afterBytes);
    assert.equal(parsed.schema_version, "opl.package.v2");
    assert.equal(parsed.identity.id, "already-v2-pkg");
    if (res.code === 2) {
      assert.equal(afterBytes, beforeBytes, "Rejected migrate-v1 must not mutate existing v2 manifest");
    }
  });

  it("T2-F4-03: opl pack migrate-v1 on corrupt .codex-plugin/plugin.json aborts atomically with exit 2", async () => {
    const sb = trackSandbox();
    const fx = buildCorruptV1Fixture(path.join(sb.workspaceDir, "bad-codex"), "invalid_codex_json");
    const beforeManifest = fs.readFileSync(fx.manifestPath, "utf8");

    const res = await runCliExpectCode(["pack", "migrate-v1", fx.dir, "--json"], 2, { sandbox: sb });
    assert.match(`${res.stdout}\n${res.stderr}`, /codex|plugin\.json|json|parse/i);

    const afterManifest = JSON.parse(fs.readFileSync(fx.manifestPath, "utf8"));
    assert.equal(afterManifest.surface_kind, "opl_agent_package_manifest.v1");
    assert.equal(fs.readFileSync(fx.manifestPath, "utf8"), beforeManifest);
    assert.equal(
      fs.existsSync(path.join(fx.dir, "plugins/med-autoscience/skills/med-autoscience/SKILL.md")),
      true,
      "Atomic abort must preserve plugins/med-autoscience mirror directory"
    );
  });

  it("T2-F4-04: opl pack migrate-v1 with missing i18n fills bilingual fallback strings and passes opl pack build", async () => {
    const sb = trackSandbox();
    const fx = buildCorruptV1Fixture(path.join(sb.workspaceDir, "missing-i18n"), "missing_i18n");

    await runCliJson(["pack", "migrate-v1", fx.dir], { sandbox: sb });

    const v2 = JSON.parse(fs.readFileSync(path.join(fx.dir, "opl-package.json"), "utf8"));
    assert.equal(v2.schema_version, "opl.package.v2");
    assert.ok(typeof v2.identity.name?.["zh-CN"] === "string" && v2.identity.name["zh-CN"].length > 0);
    assert.ok(typeof v2.identity.name?.["en-US"] === "string" && v2.identity.name["en-US"].length > 0);
    assert.ok(typeof v2.identity.summary?.["zh-CN"] === "string" && v2.identity.summary["zh-CN"].length > 0);
    assert.ok(typeof v2.identity.summary?.["en-US"] === "string" && v2.identity.summary["en-US"].length > 0);

    await runCliJson(["pack", "build", fx.dir], { sandbox: sb });
  });

  it("T2-F4-05: opl pack migrate-v1 resolves conflicting dependency declarations deterministically without duplicates", async () => {
    const sb = trackSandbox();
    const fx = buildCorruptV1Fixture(path.join(sb.workspaceDir, "conflict-deps"), "conflicting_deps");

    await runCliJson(["pack", "migrate-v1", fx.dir], { sandbox: sb });

    const v2 = JSON.parse(fs.readFileSync(path.join(fx.dir, "opl-package.json"), "utf8"));
    const deps = (v2.dependencies?.packages || []).filter((p) => p.id === "mas-scholar-skills");
    assert.equal(deps.length, 1, `Expected deterministic single dependency entry, got ${JSON.stringify(deps)}`);

    await runCliJson(["pack", "build", fx.dir], { sandbox: sb });
  });
});
