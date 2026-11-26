import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCli, runCliExpectCode } from "../lib/cli.mjs";
import { buildInvalidV2Fixture } from "../lib/fixtures.mjs";
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

describe("Tier 2 — F2 Negative & Boundary: OPL Pack Manifest v2 & Build", () => {
  it("T2-F2-01: opl pack build rejects non-kebab-case identity.id and invalid SemVer with exit 2", async () => {
    const sb = trackSandbox();
    const fx = buildInvalidV2Fixture(path.join(sb.workspaceDir, "bad-id"), "bad_id_or_semver");

    const res = await runCliExpectCode(["pack", "build", fx.dir, "--json"], 2, { sandbox: sb });
    const combined = `${res.stdout}\n${res.stderr}`;
    assert.match(combined, /id|semver|version/i);
    assert.equal(fs.existsSync(path.join(fx.dir, "opl-release.lock.json")), false);
  });

  it("T2-F2-02: opl pack build rejects invalid identity.intent and missing zh-CN I18nText with exit 2", async () => {
    const sb = trackSandbox();
    const fx = buildInvalidV2Fixture(path.join(sb.workspaceDir, "bad-intent"), "bad_intent_or_i18n");

    const res = await runCliExpectCode(["pack", "build", fx.dir, "--json"], 2, { sandbox: sb });
    const combined = `${res.stdout}\n${res.stderr}`;
    assert.match(combined, /intent|zh-CN|i18n|name/i);
    assert.equal(fs.existsSync(path.join(fx.dir, "opl-release.lock.json")), false);
  });

  it("T2-F2-03: opl pack build rejects Tier 1 top-level nav slot and invalid settings_destination with exit 2", async () => {
    const sb = trackSandbox();
    const fx = buildInvalidV2Fixture(path.join(sb.workspaceDir, "bad-ui"), "bad_declarative_ui");

    const res = await runCliExpectCode(["pack", "build", fx.dir, "--json"], 2, { sandbox: sb });
    const combined = `${res.stdout}\n${res.stderr}`;
    assert.match(combined, /slot|destination|top_level|settings/i);
    assert.equal(fs.existsSync(path.join(fx.dir, "opl-release.lock.json")), false);
  });

  it("T2-F2-04: opl pack build rejects ui.mcp_apps referencing an undeclared mcp_server_id with exit 2", async () => {
    const sb = trackSandbox();
    const fx = buildInvalidV2Fixture(path.join(sb.workspaceDir, "unbound-mcp"), "unbound_mcp_app");

    const res = await runCliExpectCode(["pack", "build", fx.dir, "--json"], 2, { sandbox: sb });
    const combined = `${res.stdout}\n${res.stderr}`;
    assert.match(combined, /mcp_server_id|undeclared-mcp-server|mcp_servers/i);
    assert.equal(fs.existsSync(path.join(fx.dir, "opl-release.lock.json")), false);
  });

  it("T2-F2-05: opl pack install rejects package with stale opl-release.lock.json after 1-byte tamper without DB install", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const fx = buildInvalidV2Fixture(path.join(sb.workspaceDir, "tampered"), "lock_digest_mismatch", {
      id: "tampered-pkg",
      archiveOutDir: path.join(sb.root, "dist"),
    });

    const res = await runCli(["pack", "install", fx.archivePath, "--json"], { sandbox: sb });
    assert.ok(res.code === 1 || res.code === 2, `Expected exit 1 or 2 on lock digest mismatch, got ${res.code}`);
    const combined = `${res.stdout}\n${res.stderr}`;
    assert.match(combined, /digest|lock|mismatch|tamper|integrity/i);

    assert.equal(fs.existsSync(path.join(sb.oplHome, "packages", "tampered-pkg")), false);
    if (fs.existsSync(sb.dbPath)) {
      const db = openOplDb(sb.dbPath, { readOnly: true });
      try {
        assert.equal(getInstalledPackage(db, "tampered-pkg"), null);
      } finally {
        db.close();
      }
    }
  });
});
