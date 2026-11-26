import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCliJson } from "../lib/cli.mjs";
import { buildKnowledgeSourceDir, buildObsidianVaultDir } from "../lib/fixtures.mjs";
import { connectRpcClient } from "../lib/rpc-client.mjs";
import { createSandbox } from "../lib/sandbox.mjs";
import {
  assertNoRawKnowledgeContentInDb,
  getKnowledgeSnapshots,
  getKnowledgeSnapshotsBySource,
  getKnowledgeSource,
  getKnowledgeSources,
  getWorkspace,
  openOplDb,
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

function extractSnapshotId(res) {
  const id = res?.snapshot_id ?? res?.snapshotId ?? res?.snapshot?.snapshot_id ?? res?.id;
  assert.ok(typeof id === "string" && id.length > 0, `Expected snapshot_id in: ${JSON.stringify(res)}`);
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

describe("Tier 1 F9: OPL Workspace Lifecycle & In-Situ Writeback", () => {
  it("T1-F9-01: opl workspace init creates workspaces row with revision=1 and unique root_path", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsDir = path.join(sb.root, "study-ws");
    fs.mkdirSync(wsDir, { recursive: true });

    const initRes = await runCliJson(
      ["workspace", "init", wsDir, "--name", "Cardiology Study", "--domain", "mas"],
      { sandbox: sb }
    );
    const wsId = extractWorkspaceId(initRes);
    const wsObj = initRes.workspace ?? initRes;
    assert.equal(wsObj.revision ?? 1, 1);
    assert.equal(fs.realpathSync(wsObj.root_path ?? wsObj.rootPath ?? wsDir), fs.realpathSync(wsDir));

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    const row = getWorkspace(db, wsId);
    assert.ok(row, "Expected workspace row in SQLite");
    assert.equal(row.name, "Cardiology Study");
    assert.equal(row.domain_id, "mas");
    assert.equal(row.revision, 1);
    assert.equal(fs.realpathSync(row.root_path), fs.realpathSync(wsDir));
    db.close();

    const listRes = await runCliJson(["workspace", "list"], { sandbox: sb });
    const list = Array.isArray(listRes) ? listRes : listRes.workspaces ?? listRes.items ?? [];
    assert.ok(
      list.some((w) => (w.workspace_id ?? w.workspaceId ?? w.id) === wsId),
      `Expected workspace ${wsId} in opl workspace list: ${JSON.stringify(listRes)}`
    );
  });

  it("T1-F9-02: opl workspace sources add binds external obsidian_vault and local_dir in-situ with zero DB copy", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "InSitu WS"], { sandbox: sb });
    const wsId = extractWorkspaceId(wsInit);

    // Strictly outside sb.workspaceDir
    const extVault = buildObsidianVaultDir(path.join(sb.root, "ext-obsidian-vault"));
    const localCanary = "CANARY_LOCAL_DIR_BODY_DO_NOT_COPY_7733";
    const extLocal = buildKnowledgeSourceDir(path.join(sb.root, "ext-local-docs"), {
      "refs/guide.md": `# Reference Guide\n${localCanary}\nDo not copy into SQLite.\n`,
    });

    const addVault = await runCliJson(
      [
        "workspace",
        "sources",
        "add",
        extVault.dir,
        "--workspace",
        wsId,
        "--scope",
        "long_term_topic",
        "--adapter",
        "obsidian_vault",
      ],
      { sandbox: sb }
    );
    const vaultSourceId = extractSourceId(addVault);

    const addLocal = await runCliJson(
      [
        "workspace",
        "sources",
        "add",
        extLocal.dir,
        "--workspace",
        wsId,
        "--scope",
        "project_local",
        "--adapter",
        "local_dir",
      ],
      { sandbox: sb }
    );
    const localSourceId = extractSourceId(addLocal);

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    const sources = getKnowledgeSources(db, wsId);
    const vaultRow = sources.find((s) => s.source_id === vaultSourceId) ?? getKnowledgeSource(db, vaultSourceId);
    const localRow = sources.find((s) => s.source_id === localSourceId) ?? getKnowledgeSource(db, localSourceId);
    assert.ok(vaultRow, "Expected obsidian_vault knowledge_source row");
    assert.equal(vaultRow.scope, "long_term_topic");
    assert.equal(vaultRow.adapter_kind, "obsidian_vault");
    assert.equal(vaultRow.status, "active");
    assert.equal(fs.realpathSync(vaultRow.root_path), fs.realpathSync(extVault.dir));
    assert.ok(localRow, "Expected local_dir knowledge_source row");
    assert.equal(localRow.adapter_kind, "local_dir");
    db.close();

    const listed = await runCliJson(["workspace", "sources", "list", "--workspace", wsId], { sandbox: sb });
    const listArr = Array.isArray(listed) ? listed : listed.sources ?? listed.items ?? [];
    assert.ok(listArr.some((s) => (s.source_id ?? s.sourceId) === vaultSourceId));
    assert.ok(listArr.some((s) => (s.source_id ?? s.sourceId) === localSourceId));

    assertNoRawKnowledgeContentInDb(sb.dbPath, [...extVault.canaryStrings, localCanary]);
  });

  it("T1-F9-03: opl workspace snapshot freezes immutable knowledge_snapshots row with SHA-256 refs only", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Snap WS"], { sandbox: sb });
    const wsId = extractWorkspaceId(wsInit);
    const extVault = buildObsidianVaultDir(path.join(sb.root, "snap-obsidian-vault"));

    const addVault = await runCliJson(
      [
        "workspace",
        "sources",
        "add",
        extVault.dir,
        "--workspace",
        wsId,
        "--scope",
        "long_term_topic",
        "--adapter",
        "obsidian_vault",
      ],
      { sandbox: sb }
    );
    const sourceId = extractSourceId(addVault);

    const snapRes = await runCliJson(
      ["workspace", "snapshot", "--workspace", wsId, "--stage-run", "sr-f9-03", "--source", sourceId],
      { sandbox: sb }
    );
    const snapshotId = extractSnapshotId(snapRes);

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    const byStage = getKnowledgeSnapshots(db, "sr-f9-03");
    const bySource = getKnowledgeSnapshotsBySource(db, sourceId);
    assert.equal(byStage.length, 1);
    assert.equal(bySource.length, 1);
    assert.equal(byStage[0].snapshot_id, snapshotId);

    const manifest = JSON.parse(byStage[0].manifest_json);
    const manifestSerialized = JSON.stringify(manifest);
    assert.ok(manifestSerialized.includes("notes/protocol.md"));
    assert.ok(manifestSerialized.includes("notes/cohort.md"));
    assert.ok(manifestSerialized.includes(extVault.digests["notes/protocol.md"]));
    assert.ok(manifestSerialized.includes(extVault.digests["notes/cohort.md"]));
    db.close();

    assertNoRawKnowledgeContentInDb(sb.dbPath, extVault.canaryStrings);
  });

  it("T1-F9-04: conditional writeback propose+commit with matching accepted_revision updates disk file & increments revision", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Writeback WS"], { sandbox: sb });
    const wsId = extractWorkspaceId(wsInit);
    const extVault = buildObsidianVaultDir(path.join(sb.root, "wb-obsidian-vault"));

    const addVault = await runCliJson(
      [
        "workspace",
        "sources",
        "add",
        extVault.dir,
        "--workspace",
        wsId,
        "--scope",
        "long_term_topic",
        "--adapter",
        "obsidian_vault",
      ],
      { sandbox: sb }
    );
    const sourceId = extractSourceId(addVault);

    const dbBefore = openTrackedDb(sb.dbPath, { readOnly: true });
    const srcBefore = getKnowledgeSource(dbBefore, sourceId);
    const rev0 = srcBefore?.accepted_revision ?? addVault.accepted_revision ?? addVault.revision ?? "1";
    dbBefore.close();

    const snapBefore = await runCliJson(
      ["workspace", "snapshot", "--workspace", wsId, "--stage-run", "sr-f9-04-before", "--source", sourceId],
      { sandbox: sb }
    );
    const beforeSnapId = extractSnapshotId(snapBefore);

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const updatedContent = "# Study Protocol v2\nPrimary endpoint: MACE at 24 months.\n";
    const prop = await rpc.call("workspace.writeback.propose", {
      workspace_id: wsId,
      source_id: sourceId,
      target_path: "notes/protocol.md",
      content: updatedContent,
      accepted_revision: rev0,
    });
    const proposalId = prop.proposal_id ?? prop.proposalId ?? prop.id;

    const commitRes = await rpc.call("workspace.writeback.commit", {
      ...(proposalId ? { proposal_id: proposalId } : {}),
      workspace_id: wsId,
      source_id: sourceId,
      target_path: "notes/protocol.md",
      content: updatedContent,
      accepted_revision: rev0,
    });
    assert.ok(commitRes && typeof commitRes === "object");

    assert.equal(fs.readFileSync(path.join(extVault.dir, "notes/protocol.md"), "utf8"), updatedContent);

    const dbAfter = openTrackedDb(sb.dbPath, { readOnly: true });
    const srcAfter = getKnowledgeSource(dbAfter, sourceId);
    assert.notEqual(srcAfter?.accepted_revision, rev0, "Conditional writeback must increment source accepted_revision");

    const frozenSnap = getKnowledgeSnapshots(dbAfter, "sr-f9-04-before").find((s) => s.snapshot_id === beforeSnapId);
    assert.ok(frozenSnap, "Pre-writeback snapshot must remain present");
    assert.ok(
      frozenSnap.manifest_json.includes(extVault.digests["notes/protocol.md"]),
      "Pre-writeback snapshot digest must remain immutable"
    );
    dbAfter.close();
  });

  it("T1-F9-05: opl workspace inspect --json returns workspace metadata, bound sources, and snapshots", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Inspect WS"], { sandbox: sb });
    const wsId = extractWorkspaceId(wsInit);
    const extVault = buildObsidianVaultDir(path.join(sb.root, "inspect-vault"));

    const addVault = await runCliJson(
      [
        "workspace",
        "sources",
        "add",
        extVault.dir,
        "--workspace",
        wsId,
        "--scope",
        "long_term_topic",
        "--adapter",
        "obsidian_vault",
      ],
      { sandbox: sb }
    );
    const sourceId = extractSourceId(addVault);

    const snapRes = await runCliJson(
      ["workspace", "snapshot", "--workspace", wsId, "--stage-run", "sr-f9-05", "--source", sourceId],
      { sandbox: sb }
    );
    const snapshotId = extractSnapshotId(snapRes);

    const inspected = await runCliJson(["workspace", "inspect", wsId], { sandbox: sb });
    const wsMeta = inspected.workspace ?? inspected;
    assert.equal(wsMeta.workspace_id ?? wsMeta.workspaceId ?? wsMeta.id, wsId);
    assert.equal(wsMeta.name, "Inspect WS");
    assert.equal(fs.realpathSync(wsMeta.root_path ?? wsMeta.rootPath), fs.realpathSync(sb.workspaceDir));
    assert.ok(Number(wsMeta.revision) >= 1);

    const sources = inspected.sources ?? inspected.knowledge_sources ?? [];
    assert.ok(
      Array.isArray(sources) && sources.some((s) => (s.source_id ?? s.sourceId) === sourceId),
      `Expected source ${sourceId} in inspect output: ${JSON.stringify(inspected)}`
    );

    const snapshots = inspected.snapshots ?? inspected.knowledge_snapshots ?? [];
    assert.ok(
      Array.isArray(snapshots) && snapshots.some((s) => (s.snapshot_id ?? s.snapshotId) === snapshotId),
      `Expected snapshot ${snapshotId} in inspect output: ${JSON.stringify(inspected)}`
    );
  });
});
