import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCli, runCliJson } from "../lib/cli.mjs";
import { buildObsidianVaultDir } from "../lib/fixtures.mjs";
import { connectRpcClient } from "../lib/rpc-client.mjs";
import { createSandbox } from "../lib/sandbox.mjs";
import {
  getKnowledgeSnapshotsBySource,
  getKnowledgeSource,
  openOplDb,
  txImmediate,
} from "../lib/sqlite-inspector.mjs";

const activeSandboxes = [];
const activeRpcClients = [];
const activeDbs = [];

function makeSandbox(opts = {}) {
  const sb = createSandbox(opts);
  activeSandboxes.push(sb);
  return sb;
}

function trackRpc(client) {
  activeRpcClients.push(client);
  return client;
}

function openTrackedDb(dbPath, opts) {
  const db = openOplDb(dbPath, opts);
  activeDbs.push(db);
  return db;
}

function extractWorkspaceId(res) {
  const id = res?.workspace_id ?? res?.workspaceId ?? res?.workspace?.workspace_id ?? res?.id;
  assert.ok(typeof id === "string" && id.length > 0, `Expected workspace_id in: ${JSON.stringify(res)}`);
  return id;
}

function extractSourceId(res) {
  const id = res?.source_id ?? res?.sourceId ?? res?.source?.source_id ?? res?.id;
  assert.ok(typeof id === "string" && id.length > 0, `Expected source_id in: ${JSON.stringify(res)}`);
  return id;
}

afterEach(async () => {
  while (activeDbs.length > 0) {
    const db = activeDbs.pop();
    try {
      db.close();
    } catch {
      // ignore close errors during teardown
    }
  }
  while (activeRpcClients.length > 0) {
    const c = activeRpcClients.pop();
    try {
      await c.close();
    } catch {
      // ignore close errors during teardown
    }
  }
  while (activeSandboxes.length > 0) {
    const sb = activeSandboxes.pop();
    await sb.cleanup();
  }
});

describe("Tier 2 F9: OPL Workspace Boundary & Negative Cases", () => {
  it("T2-F9-01: duplicate workspace root_path (including symlink alias) fails cleanly on UNIQUE(root_path)", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsDir = path.join(sb.root, "dup-ws");
    fs.mkdirSync(wsDir, { recursive: true });
    const wsLink = path.join(sb.root, "dup-ws-symlink");
    fs.symlinkSync(wsDir, wsLink, "dir");

    await runCliJson(["workspace", "init", wsDir, "--name", "first"], { sandbox: sb });

    const dupDirect = await runCli(["workspace", "init", wsDir, "--name", "second", "--json"], { sandbox: sb });
    assert.notEqual(dupDirect.code, 0, "Duplicate workspace root_path must fail non-zero");

    const dupSymlink = await runCli(["workspace", "init", wsLink, "--name", "third", "--json"], { sandbox: sb });
    assert.notEqual(dupSymlink.code, 0, "Symlinked duplicate workspace root_path must fail non-zero");

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    let rpcErr = null;
    try {
      await rpc.call("workspace.create", { root_path: wsDir, name: "fourth" });
    } catch (err) {
      rpcErr = err;
    }
    assert.ok(rpcErr, "Expected workspace.create RPC on duplicate root_path to fail");

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    const rows = db.prepare("SELECT * FROM workspaces").all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "first");
    db.close();
  });

  it("T2-F9-02: snapshot on revoked or unavailable knowledge source fails closed with zero snapshot rows", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Revoked Snap WS"], { sandbox: sb });
    const wsId = extractWorkspaceId(wsInit);

    const vaultA = buildObsidianVaultDir(path.join(sb.root, "vault-revoked"));
    const vaultB = buildObsidianVaultDir(path.join(sb.root, "vault-unavail"));

    const addA = await runCliJson(
      ["workspace", "sources", "add", vaultA.dir, "--workspace", wsId, "--scope", "long_term_topic", "--adapter", "obsidian_vault"],
      { sandbox: sb }
    );
    const sourceA = extractSourceId(addA);

    const addB = await runCliJson(
      ["workspace", "sources", "add", vaultB.dir, "--workspace", wsId, "--scope", "long_term_topic", "--adapter", "obsidian_vault"],
      { sandbox: sb }
    );
    const sourceB = extractSourceId(addB);

    // Mark sourceA revoked and sourceB unavailable
    const dbW = openTrackedDb(sb.dbPath);
    txImmediate(dbW, () => {
      dbW.prepare("UPDATE knowledge_sources SET status = 'revoked' WHERE source_id = ?").run(sourceA);
      dbW.prepare("UPDATE knowledge_sources SET status = 'unavailable' WHERE source_id = ?").run(sourceB);
    });
    dbW.close();

    const snapRevoked = await runCli(
      ["workspace", "snapshot", "--workspace", wsId, "--stage-run", "sr-revoked", "--source", sourceA, "--json"],
      { sandbox: sb }
    );
    assert.notEqual(snapRevoked.code, 0, "Snapshot on revoked source must fail non-zero");

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    let unavailErr = null;
    try {
      await rpc.call("workspace.snapshots.create", {
        workspace_id: wsId,
        stage_run_id: "sr-unavail",
        source_id: sourceB,
      });
    } catch (err) {
      unavailErr = err;
    }
    assert.ok(unavailErr, "Snapshot on unavailable source must fail closed via RPC");

    const dbR = openTrackedDb(sb.dbPath, { readOnly: true });
    assert.equal(getKnowledgeSnapshotsBySource(dbR, sourceA).length, 0);
    assert.equal(getKnowledgeSnapshotsBySource(dbR, sourceB).length, 0);
    dbR.close();
  });

  it("T2-F9-03: conditional writeback with stale accepted_revision rejects with REVISION_CONFLICT without overwriting file", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Stale WB WS"], { sandbox: sb });
    const wsId = extractWorkspaceId(wsInit);
    const extVault = buildObsidianVaultDir(path.join(sb.root, "stale-wb-vault"));

    const addVault = await runCliJson(
      ["workspace", "sources", "add", extVault.dir, "--workspace", wsId, "--scope", "long_term_topic", "--adapter", "obsidian_vault"],
      { sandbox: sb }
    );
    const sourceId = extractSourceId(addVault);

    const db0 = openTrackedDb(sb.dbPath, { readOnly: true });
    const rev0 = getKnowledgeSource(db0, sourceId)?.accepted_revision ?? addVault.accepted_revision ?? "1";
    db0.close();

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const staleProposal = await rpc.call("workspace.writeback.propose", {
      workspace_id: wsId,
      source_id: sourceId,
      target_path: "notes/protocol.md",
      content: "STALE_OVERWRITE_ATTEMPT",
      accepted_revision: rev0,
    });

    // Competing fresh commit bumps revision to R1
    const winningContent = "# Winning Protocol Revision\nMust not be clobbered.\n";
    const winProposal = await rpc.call("workspace.writeback.propose", {
      workspace_id: wsId,
      source_id: sourceId,
      target_path: "notes/protocol.md",
      content: winningContent,
      accepted_revision: rev0,
    });
    await rpc.call("workspace.writeback.commit", {
      ...(winProposal.proposal_id ? { proposal_id: winProposal.proposal_id } : {}),
      workspace_id: wsId,
      source_id: sourceId,
      target_path: "notes/protocol.md",
      content: winningContent,
      accepted_revision: rev0,
    });

    let conflictErr = null;
    try {
      await rpc.call("workspace.writeback.commit", {
        ...(staleProposal.proposal_id ? { proposal_id: staleProposal.proposal_id } : {}),
        workspace_id: wsId,
        source_id: sourceId,
        target_path: "notes/protocol.md",
        content: "STALE_OVERWRITE_ATTEMPT",
        accepted_revision: rev0,
      });
    } catch (err) {
      conflictErr = err;
    }

    assert.ok(conflictErr, "Stale accepted_revision commit must reject");
    assert.ok(
      conflictErr.code === -32009 || /REVISION_CONFLICT|revision/i.test(`${conflictErr.message} ${JSON.stringify(conflictErr.data ?? "")}`),
      `Expected REVISION_CONFLICT (-32009), got code=${conflictErr.code}: ${conflictErr.message}`
    );
    assert.equal(
      fs.readFileSync(path.join(extVault.dir, "notes/protocol.md"), "utf8"),
      winningContent,
      "Stale writeback commit must never overwrite newer file contents"
    );
  });

  it("T2-F9-04: writeback path traversal (../, absolute outside path, escaping symlink) is rejected", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Traversal WS"], { sandbox: sb });
    const wsId = extractWorkspaceId(wsInit);
    const extVault = buildObsidianVaultDir(path.join(sb.root, "traversal-vault"));

    const outsideSecret = path.join(sb.root, "outside-secret.md");
    fs.writeFileSync(outsideSecret, "DO_NOT_OVERWRITE", "utf8");
    fs.symlinkSync(outsideSecret, path.join(extVault.dir, "notes/escape-link.md"));

    const addVault = await runCliJson(
      ["workspace", "sources", "add", extVault.dir, "--workspace", wsId, "--scope", "long_term_topic", "--adapter", "obsidian_vault"],
      { sandbox: sb }
    );
    const sourceId = extractSourceId(addVault);

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    const rev0 = getKnowledgeSource(db, sourceId)?.accepted_revision ?? addVault.accepted_revision ?? "1";
    db.close();

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const traversalTargets = [
      "../outside-secret.md",
      outsideSecret,
      "notes/escape-link.md",
    ];

    for (const targetPath of traversalTargets) {
      let rejected = null;
      try {
        const prop = await rpc.call("workspace.writeback.propose", {
          workspace_id: wsId,
          source_id: sourceId,
          target_path: targetPath,
          content: "PWNED_CONTENT",
          accepted_revision: rev0,
        });
        await rpc.call("workspace.writeback.commit", {
          ...(prop.proposal_id ? { proposal_id: prop.proposal_id } : {}),
          workspace_id: wsId,
          source_id: sourceId,
          target_path: targetPath,
          content: "PWNED_CONTENT",
          accepted_revision: rev0,
        });
      } catch (err) {
        rejected = err;
      }
      assert.ok(rejected, `Expected path-traversal writeback '${targetPath}' to fail closed`);
    }

    assert.equal(fs.readFileSync(outsideSecret, "utf8"), "DO_NOT_OVERWRITE");
  });

  it("T2-F9-05: deleting bound knowledge source directory transitions status to unavailable", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Deleted Source WS"], { sandbox: sb });
    const wsId = extractWorkspaceId(wsInit);
    const extVault = buildObsidianVaultDir(path.join(sb.root, "vanishing-vault"));

    const addVault = await runCliJson(
      ["workspace", "sources", "add", extVault.dir, "--workspace", wsId, "--scope", "long_term_topic", "--adapter", "obsidian_vault"],
      { sandbox: sb }
    );
    const sourceId = extractSourceId(addVault);

    const dbBefore = openTrackedDb(sb.dbPath, { readOnly: true });
    assert.equal(getKnowledgeSource(dbBefore, sourceId)?.status, "active");
    dbBefore.close();

    // Remove the external directory from disk
    fs.rmSync(extVault.dir, { recursive: true, force: true });

    const listed = await runCliJson(["workspace", "sources", "list", "--workspace", wsId], { sandbox: sb });
    const listArr = Array.isArray(listed) ? listed : listed.sources ?? listed.items ?? [];
    const listedRow = listArr.find((s) => (s.source_id ?? s.sourceId) === sourceId);
    assert.equal(listedRow?.status, "unavailable", `Expected sources list to report unavailable, got: ${JSON.stringify(listedRow)}`);

    const snapFail = await runCli(
      ["workspace", "snapshot", "--workspace", wsId, "--stage-run", "sr-vanished", "--source", sourceId, "--json"],
      { sandbox: sb }
    );
    assert.notEqual(snapFail.code, 0, "Snapshot on deleted source directory must fail non-zero");

    const dbAfter = openTrackedDb(sb.dbPath, { readOnly: true });
    assert.equal(getKnowledgeSource(dbAfter, sourceId)?.status, "unavailable");
    dbAfter.close();
  });
});
