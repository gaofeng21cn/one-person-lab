import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCliExpectCode, runCliJson, runCliOk } from "../lib/cli.mjs";
import {
  addLegacyCarrierFiles,
  buildConnectPair,
  buildObsidianVaultDir,
  buildV1DomainFixture,
  buildV2Package,
  createLocalPackageArchive,
  readCodexMarketplaceProjection,
  tamperPackageFile,
} from "../lib/fixtures.mjs";
import {
  APP_ROOT,
  BRIDGE_DIR,
  IS_PRE_M4,
  MCP_APP_SHARED_DIR,
  PYTHON_CLIENT_DIR,
  REPO_ROOT,
  STUDIO_ROOT,
  buildAgentContributionOverride,
  countSpawnLogLines,
  createE2eContext,
  createRulesFile,
  ensureAgentContributionHandler,
  ensureAgentHandlerScript,
  extractBindToken,
  extractRequestId,
  extractScheduleId,
  extractSourceId,
  extractStageRunId,
  extractTaskId,
  extractWorkspaceId,
  linkAndAuthorizeConnect,
  listFilesRecursive,
  loadBridgeModule,
  loadMcpAppSharedExports,
  patchProviderStubRedaction,
  readProviderDispatchCount,
  readStubLogs,
  runPythonScript,
  setupCanaryOplCli,
  spawnPythonSession,
  stageAndInstallFoundry,
} from "../lib/pairwise-helpers.mjs";
import {
  auditLegacyDemolition,
  auditLineBudgets,
  auditProcessHygiene,
  auditProtectedBoundaries,
  auditPythonStdlibAndBudget,
  auditTemporalElimination,
} from "../lib/redline-audit.mjs";
import { assertRpcError } from "../lib/rpc-client.mjs";
import { isPidAlive, measureLatencyMs, waitForStubLogEvent } from "../lib/sandbox.mjs";
import {
  assertDqsZeroEnforced,
  assertLedgerRefsOnly,
  assertNoDuplicateAttempts,
  assertNoPlaintextSecrets,
  assertNoRawKnowledgeContentInDb,
  assertPragmas,
  assertSchema,
  getAttempts,
  getConnection,
  getGrants,
  getInstalledPackage,
  getKnowledgeSnapshots,
  getKnowledgeSource,
  getLedgerEntries,
  getSchedule,
  getStageRuns,
  getTask,
  seedStaleStageRun,
  txImmediate,
  waitForDbState,
} from "../lib/sqlite-inspector.mjs";

const ctx = createE2eContext();

afterEach(async () => {
  await ctx.cleanup();
});

describe("Tier 3: Cross-Feature Pairwise Integrations (T3-01..T3-20, 105/105 Feature Pairs)", () => {
  it("T3-01 [F1 x F2 x F3 x F6 x F7]: pack build -> install -> codex-sync & dynamic loader surface in app.state.get", async () => {
    const sb = ctx.makeSandbox();
    await sb.startDaemon();

    const pkgDir = path.join(sb.root, "mas-v2");
    const pkg = ensureAgentContributionHandler(
      buildV2Package(pkgDir, {
        intent: "agent",
        id: "mas",
        pluginName: "med-autoscience",
        specStrict: true,
      })
    );

    await runCliJson(["pack", "build", pkg.dir], { sandbox: sb });
    const lockPath = path.join(pkg.dir, "opl-release.lock.json");
    assert.equal(fs.existsSync(lockPath), true, "Expected opl-release.lock.json after opl pack build");
    const lock1 = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    assert.equal(lock1.algorithm, "sha256");
    assert.equal(lock1.canonicalization, "ordered_path_length_file_length_bytes");
    assert.match(lock1.digest, /^sha256:[0-9a-f]{64}$/);

    await runCliJson(["pack", "build", pkg.dir], { sandbox: sb });
    const lock2 = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    assert.equal(lock2.digest, lock1.digest, "Repeated opl pack build must be deterministic");
    assert.deepEqual(lock2.paths, lock1.paths);

    const arch = createLocalPackageArchive(pkg.dir, path.join(sb.root, "dist"), { includeLockFile: true });
    await runCliJson(["pack", "install", arch.archivePath], { sandbox: sb });

    const proj = readCodexMarketplaceProjection(sb.oplHome, "med-autoscience");
    assert.ok(proj.pluginJson, "Expected .codex-plugin/plugin.json in Codex marketplace");
    assert.equal(proj.pluginJson.name, "med-autoscience");
    assert.equal(proj.skillsIsSymlink, true, "skills must be zero-copy symlink");
    assert.equal(proj.assetsIsSymlink, true, "assets must be zero-copy symlink");

    const syncRes = await runCliJson(["pack", "sync", "codex"], { sandbox: sb });
    assert.equal(syncRes.ok, true);
    const syncedEntry = (syncRes.synced || []).find((s) => s.package_id === "mas");
    assert.ok(syncedEntry, `Expected mas in sync output: ${JSON.stringify(syncRes)}`);
    assert.equal(syncedEntry.verified_by_readback, true);

    const codexLogs = readStubLogs(sb, "codex");
    assert.ok(
      codexLogs.some((e) => e.event === "invocation" && e.subcommand === "app_server"),
      "Expected codex app-server plugin/list readback"
    );

    const appRpc = await ctx.connectRpc(sb, { clientKind: "opl_app" });
    const fastState = await appRpc.call("app.state.get", { profile: "fast" });
    const pkgs = fastState.packages ?? fastState.installed_packages ?? [];
    const dynMas = pkgs.find((p) => (p.package_id ?? p.id) === "mas");
    assert.ok(dynMas, `Expected dynamic loader to surface mas in app.state.get: ${JSON.stringify(pkgs)}`);
    assert.equal(dynMas.enabled, true);
    assert.equal(dynMas.carrier_synced ?? dynMas.codex_synced, true);
  });

  it("T3-02 [F2 x F3 x F4 x F7 x F15]: migrate-v1 MAS -> pack build -> pack link -> zero mirror & legacy demolition", async () => {
    const sb = ctx.makeSandbox();
    await sb.startDaemon();

    const fx = buildV1DomainFixture(path.join(sb.workspaceDir, "mas-v1"), "mas");
    addLegacyCarrierFiles(fx.dir, { carrierProjection: true, rootPluginJson: true });

    const migOut = await runCliJson(["pack", "migrate-v1", fx.dir], { sandbox: sb });
    assert.equal(migOut.applied, true);
    assert.equal(migOut.cleaned, true);

    const v2 = JSON.parse(fs.readFileSync(path.join(fx.dir, "opl-package.json"), "utf8"));
    assert.equal(v2.schema_version, "opl.package.v2");
    assert.equal(v2.identity.id, "mas");
    const deps = (v2.dependencies?.packages || []).filter((p) => p.id === "mas-scholar-skills");
    assert.equal(deps.length, 1, "Expected deduplicated mas-scholar-skills dependency");
    assert.equal(fs.existsSync(path.join(fx.dir, "plugins/med-autoscience")), false);
    assert.equal(fs.existsSync(path.join(fx.dir, "plugins/mas-scholar-skills")), false);
    assert.equal(fs.existsSync(path.join(fx.dir, "plugins/opl-foundation-skills")), false);
    assert.equal(fs.existsSync(path.join(fx.dir, ".codex-plugin/plugin.json")), false);
    assert.equal(fs.existsSync(path.join(fx.dir, "contracts/carrier_projection.json")), false);
    assert.equal(fs.existsSync(path.join(fx.dir, "plugin.json")), false);

    await runCliJson(["pack", "build", fx.dir], { sandbox: sb });
    const lock = JSON.parse(fs.readFileSync(path.join(fx.dir, "opl-release.lock.json"), "utf8"));
    assert.equal(lock.algorithm, "sha256");
    assert.match(lock.digest, /^sha256:[0-9a-f]{64}$/);

    await runCliJson(["pack", "link", fx.dir], { sandbox: sb });
    const syncRes = await runCliJson(["pack", "sync", "codex"], { sandbox: sb });
    assert.equal(syncRes.ok, true);

    const proj = readCodexMarketplaceProjection(sb.oplHome, "med-autoscience");
    assert.ok(proj.pluginJson);
    assert.equal(proj.pluginJson.name, "med-autoscience");
    assert.equal(proj.pluginJson.interface?.category, "Research");
    assert.equal(proj.pluginJson.interface?.brandColor, "#1F7A8C");
    assert.equal(proj.skillsIsSymlink, true);
    assert.equal(fs.existsSync(path.join(fx.dir, "plugins")), false);

    // Legacy CLI removed + Temporal elimination audit
    await runCliExpectCode(["agents", "modules"], 2, { sandbox: sb });
    const launchAgentsDir = process.env.OPL_LAUNCH_AGENTS_DIR
      ? path.resolve(process.env.OPL_LAUNCH_AGENTS_DIR)
      : process.platform === "darwin"
        ? path.join(os.homedir(), "Library", "LaunchAgents")
        : null;
    const temporalAudit = auditTemporalElimination(REPO_ROOT, {
      allowRootPkgTemporal: IS_PRE_M4,
      allowTemporalFiles: IS_PRE_M4,
      launchAgentsDir: IS_PRE_M4 ? null : launchAgentsDir,
    });
    assert.equal(temporalAudit.ok, true, `Temporal violations: ${JSON.stringify(temporalAudit.violations)}`);
  });

  it("T3-03 [F2 x F3 x F6 x F8 x F15]: Bridge readState <20ms -> pack.updateAll streams reload_mode, updates codex-sync & process hygiene", async () => {
    const sb = ctx.makeSandbox();
    await sb.startDaemon();

    const srcV1 = path.join(sb.root, "upd-v1");
    const srcV2 = path.join(sb.root, "upd-v2");
    const outArch = path.join(sb.root, "archives");
    buildV2Package(srcV1, { id: "upd-agent", pluginName: "upd-agent", version: "0.1.0", intent: "app", specStrict: true });
    buildV2Package(srcV2, { id: "upd-agent", pluginName: "upd-agent", version: "0.2.0", intent: "app", specStrict: true });
    patchProviderStubRedaction(srcV1, "upd-agent");
    patchProviderStubRedaction(srcV2, "upd-agent");

    await runCliJson(["pack", "build", srcV1], { sandbox: sb });
    await runCliJson(["pack", "build", srcV2], { sandbox: sb });
    const archV1 = createLocalPackageArchive(srcV1, outArch, { includeLockFile: true });
    const archV2 = createLocalPackageArchive(srcV2, outArch, { includeLockFile: true });
    await runCliOk(["pack", "install", archV1.archivePath], { sandbox: sb });

    const { hitMarkerPath, spyEnv } = await setupCanaryOplCli(sb);
    const mod = await loadBridgeModule();
    const bridge = ctx.trackBridge(new mod.OplFrameworkBridge({ workspaceRoot: sb.workspaceDir, env: spyEnv }));
    await bridge.start();

    const spawnsBefore = countSpawnLogLines();
    const latency = await measureLatencyMs(() => bridge.opl.readState("fast"), { iterations: 100, warmup: 5 });
    const spawnsAfter = countSpawnLogLines();
    assert.ok(latency.p99 < 20, `Expected readState('fast') P99 < 20ms, got ${latency.p99.toFixed(2)}ms`);
    assert.equal(spawnsAfter - spawnsBefore, 0, "Bridge readState must never spawn child opl");
    assert.equal(fs.existsSync(hitMarkerPath), false, "Canary opl binary must never be executed");

    const receivedEvents = [];
    bridge.on("event", (ev) => receivedEvents.push(ev));

    const appRpc = await ctx.connectRpc(sb, { clientKind: "opl_app" });
    await appRpc.call("pack.updateAll", {
      updates: [{ package_id: "upd-agent", source: archV2.archivePath }],
      sources: { "upd-agent": archV2.archivePath },
    });

    const deadline = Date.now() + 3000;
    let progressEv = null;
    while (Date.now() < deadline) {
      progressEv = receivedEvents.find(
        (e) => (e?.method ?? e?.type) === "event.pack.progress" && typeof (e?.params?.reload_mode ?? e?.reload_mode) === "string"
      );
      if (progressEv) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.ok(progressEv, `Expected Bridge to receive event.pack.progress: ${JSON.stringify(receivedEvents)}`);
    const reloadMode = progressEv.params?.reload_mode ?? progressEv.reload_mode;
    assert.equal(reloadMode, "renderer_reload");
    assert.equal(progressEv.raw?.id, undefined, "Server-Push frame must omit id");

    const proj = readCodexMarketplaceProjection(sb.oplHome, "upd-agent");
    assert.equal(proj.pluginJson?.version, "0.2.0");

    const afterState = await bridge.opl.readState("fast");
    const updatedPkg = (afterState.packages ?? afterState.installed_packages ?? []).find((p) => p.package_id === "upd-agent");
    assert.equal(updatedPkg?.version, "0.2.0");

    const liveProcs = sb.findLiveProcesses();
    const procAudit = auditProcessHygiene({
      psRows: IS_PRE_M4 ? liveProcs : undefined,
      sandboxLiveProcs: liveProcs,
      expectedOpldCount: 1,
    });
    assert.equal(procAudit.ok, true, `Process hygiene violations: ${JSON.stringify(procAudit.violations)}`);
    assert.equal(procAudit.temporalProcesses.length, 0);
  });

  it("T3-04 [F4 x F5 x F6 x F8 x F13]: migrated opl-relay MCP App bind token -> requestAccess -> Bridge approve -> invoke", async () => {
    const sb = ctx.makeSandbox();
    await sb.startDaemon();

    const relayFx = buildV1DomainFixture(path.join(sb.root, "opl-relay"), "opl-relay");
    await runCliJson(["pack", "migrate-v1", relayFx.dir], { sandbox: sb });
    const migratedManifest = JSON.parse(fs.readFileSync(path.join(relayFx.dir, "opl-package.json"), "utf8"));
    assert.equal(migratedManifest.schema_version, "opl.package.v2");
    assert.equal(migratedManifest.identity.id, "opl-relay");
    assert.equal(migratedManifest.identity.intent, "app");
    assert.equal(fs.existsSync(path.join(relayFx.dir, "plugins/opl-relay")), false);
    assert.ok(Array.isArray(migratedManifest.ui?.mcp_apps) && migratedManifest.ui.mcp_apps.length > 0);

    // Augment migrated opl-relay with v2 connection_providers & redacted stub
    patchProviderStubRedaction(relayFx.dir, "opl-relay");
    migratedManifest.provides = migratedManifest.provides || {};
    migratedManifest.provides.connection_providers = [
      {
        provider_type: "opl-relay.mailbox",
        entrypoint: { kind: "cli", argv: ["./bin/opl-relay-provider"], transport: "stdin_json_stdout_json" },
        capabilities: [
          { id: "mailbox.read", title: { "zh-CN": "读取邮箱", "en-US": "Read mailbox" }, risk: "read" },
        ],
      },
    ];
    fs.writeFileSync(path.join(relayFx.dir, "opl-package.json"), JSON.stringify(migratedManifest, null, 2), "utf8");
    await runCliOk(["pack", "link", relayFx.dir], { sandbox: sb });

    const mod = await loadBridgeModule();
    const bridge = ctx.trackBridge(new mod.OplFrameworkBridge({ workspaceRoot: sb.workspaceDir, env: sb.env }));
    await bridge.start();

    const bridgeEvents = [];
    bridge.on("event", (ev) => bridgeEvents.push(ev));

    const secret = "secret-t304-never-leaked";
    await bridge.client.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Relay Mailbox",
      account_label: "t304@lab",
      secret,
    });

    const extRpc = await ctx.connectRpc(sb, { clientKind: "external" });
    const tokRes = await bridge.client.call("connect.issueConsumerBindToken", {
      consumer_package_id: "opl-relay",
      session_id: extRpc.handshakeResult.session_id,
    });
    const bindToken = extractBindToken(tokRes);

    const req = await extRpc.call("connect.requestAccess", {
      consumer_bind_token: bindToken,
      connection_id: "conn-mail",
      capability_ids: ["mailbox.read"],
    });
    const requestId = extractRequestId(req);

    const deadline = Date.now() + 3000;
    let connEv = null;
    while (Date.now() < deadline) {
      connEv = bridgeEvents.find(
        (e) => (e?.method ?? e?.type) === "event.connect.changed" && JSON.stringify(e.params ?? e).includes(requestId)
      );
      if (connEv) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.ok(connEv, `Expected Bridge to receive event.connect.changed for ${requestId}`);

    const approved = await bridge.connectionAccessApproval.approve(requestId);
    assert.equal(approved.ok, true);

    const invoked = await extRpc.call("connect.invoke", {
      consumer_bind_token: bindToken,
      connection_id: "conn-mail",
      capability_id: "mailbox.read",
      input: { query: "status" },
    });
    assert.equal(invoked.disposition, "completed");
    assert.equal(JSON.stringify(invoked).includes(secret), false);
  });

  it("T3-05 [F1 x F2 x F3 x F5 x F7 x F15]: pack update digest change invalidates Connect grant while keeping codex-sync & secret isolation", async () => {
    const sb = ctx.makeSandbox();
    const providerLog = path.join(sb.stubLogDir, "t305-prov.jsonl");
    sb.env.OPL_CONNECT_PROVIDER_LOG = providerLog;
    await sb.startDaemon({ env: { OPL_CONNECT_PROVIDER_LOG: providerLog } });

    const pair = buildConnectPair(path.join(sb.root, "pkgs"), { specStrict: true });
    ensureAgentContributionHandler(pair.consumer);
    patchProviderStubRedaction(pair.providerDir, "opl-relay", providerLog);

    await runCliJson(["pack", "build", pair.providerDir], { sandbox: sb });
    await runCliJson(["pack", "build", pair.consumerDir], { sandbox: sb });
    const archDir = path.join(sb.root, "archives");
    const provArch = createLocalPackageArchive(pair.providerDir, archDir, { includeLockFile: true });
    const consArchV1 = createLocalPackageArchive(pair.consumerDir, archDir, { includeLockFile: true });

    await runCliJson(["pack", "install", provArch.archivePath], { sandbox: sb });
    await runCliJson(["pack", "install", consArchV1.archivePath], { sandbox: sb });

    const secret = "secret-t305-digest-bound";
    await runCliJson(
      [
        "connect",
        "add",
        "--connection-id",
        "conn-mail",
        "--provider-type",
        "opl-relay.mailbox",
        "--display-name",
        "Work Mail",
        "--secret",
        secret,
      ],
      { sandbox: sb }
    );

    const appRpc = await ctx.connectRpc(sb, { clientKind: "opl_app" });
    const req = await appRpc.call("connect.requestAccess", {
      consumer_package_id: "mas",
      connection_id: "conn-mail",
      capability_ids: ["mailbox.read"],
    });
    const requestId = extractRequestId(req);
    await runCliJson(["connect", "grants", "approve", requestId], { sandbox: sb });

    const baseline = await appRpc.call("connect.invoke", {
      consumer_package_id: "mas",
      connection_id: "conn-mail",
      capability_id: "mailbox.read",
      input: { query: "baseline" },
    });
    assert.equal(baseline.disposition, "completed");
    const dispatchCountBefore = readProviderDispatchCount(providerLog);
    assert.equal(dispatchCountBefore, 1);

    const dbBefore = ctx.openDb(sb.dbPath, { readOnly: true });
    const digestBefore = getInstalledPackage(dbBefore, "mas")?.content_digest;
    dbBefore.close();

    // Tamper 1 byte + bump version -> build -> update
    tamperPackageFile(pair.consumerDir, "README.md", "\n!");
    const consManifest = JSON.parse(fs.readFileSync(pair.consumer.manifestPath, "utf8"));
    consManifest.identity.version = "0.4.1";
    fs.writeFileSync(pair.consumer.manifestPath, JSON.stringify(consManifest, null, 2), "utf8");
    await runCliJson(["pack", "build", pair.consumerDir], { sandbox: sb });
    const consArchV2 = createLocalPackageArchive(pair.consumerDir, archDir, { includeLockFile: true });

    await runCliJson(["pack", "update", "mas", "--source", consArchV2.archivePath], { sandbox: sb });

    const proj = readCodexMarketplaceProjection(sb.oplHome, "mas");
    assert.equal(proj.pluginJson?.version, "0.4.1", "Codex projection must reflect updated version");

    await assertRpcError(
      () =>
        appRpc.call("connect.invoke", {
          consumer_package_id: "mas",
          connection_id: "conn-mail",
          capability_id: "mailbox.read",
          input: { query: "after-tamper" },
        }),
      -32003,
      /consumer_digest_mismatch|grant_missing_or_stale|GRANT_NOT_ACTIVE|DIGEST/i
    );
    assert.equal(
      readProviderDispatchCount(providerLog),
      dispatchCountBefore,
      "Fail-closed digest rejection must occur BEFORE provider dispatch"
    );

    const grantsCli = await runCliJson(["connect", "grants", "list", "--package", "mas"], { sandbox: sb });
    assert.ok(Array.isArray(grantsCli.grants));

    const dbAfter = ctx.openDb(sb.dbPath, { readOnly: true });
    const digestAfter = getInstalledPackage(dbAfter, "mas")?.content_digest;
    assert.notEqual(digestAfter, digestBefore, "installed_packages.content_digest must mutate on update");
    assertPragmas(dbAfter, { checkConnectionDefaults: false });
    assertDqsZeroEnforced(dbAfter);
    assertNoPlaintextSecrets(dbAfter, [secret]);
    dbAfter.close();

    assert.equal(fs.readFileSync(sb.dbPath).includes(Buffer.from(secret, "utf8")), false);
    if (fs.existsSync(providerLog)) fs.rmSync(providerLog, { force: true });

    // F15 red-line checks: live process hygiene, legacy CLI rejection, Temporal/demolition & line budgets
    const liveProcs = sb.findLiveProcesses();
    const procAudit = auditProcessHygiene({
      psRows: IS_PRE_M4 ? liveProcs : undefined,
      sandboxLiveProcs: liveProcs,
      expectedOpldCount: 1,
    });
    assert.equal(procAudit.ok, true, `Process hygiene violations: ${JSON.stringify(procAudit.violations)}`);
    assert.equal(procAudit.opldCount, 1);
    assert.equal(procAudit.temporalProcesses.length, 0);

    await runCliExpectCode(["agents", "modules"], 2, { sandbox: sb });
    await runCliExpectCode(["vault", "list"], 2, { sandbox: sb });

    const launchAgentsDir = process.env.OPL_LAUNCH_AGENTS_DIR
      ? path.resolve(process.env.OPL_LAUNCH_AGENTS_DIR)
      : process.platform === "darwin"
        ? path.join(os.homedir(), "Library", "LaunchAgents")
        : null;
    const temporalAudit = auditTemporalElimination(REPO_ROOT, {
      allowRootPkgTemporal: IS_PRE_M4,
      allowTemporalFiles: IS_PRE_M4,
      launchAgentsDir: IS_PRE_M4 ? null : launchAgentsDir,
    });
    assert.equal(temporalAudit.ok, true, `Temporal violations: ${JSON.stringify(temporalAudit.violations)}`);

    const demoAudit = auditLegacyDemolition(REPO_ROOT, { allowLegacyCli: IS_PRE_M4 });
    if (!IS_PRE_M4) {
      assert.equal(demoAudit.ok, true, `Legacy demolition violations: ${JSON.stringify(demoAudit.violations)}`);
    } else {
      assert.equal(demoAudit.violations.some((v) => v.rule === "opl-flow-circular-ref"), false);
    }

    const lineAudit = auditLineBudgets({
      repoRoot: REPO_ROOT,
      bridgeDir: BRIDGE_DIR,
      pythonClientDir: PYTHON_CLIENT_DIR,
      requireCore: true,
      requirePythonClient: !IS_PRE_M4,
      requireBridge: !IS_PRE_M4 || fs.existsSync(path.join(BRIDGE_DIR, "src")),
    });
    assert.equal(lineAudit.ok, true, `Line budget / import guard violations: ${JSON.stringify(lineAudit.violations)}`);
    assert.ok(lineAudit.coreLineCount > 0 && lineAudit.coreLineCount < 3000);
    if (lineAudit.bridgeLineCount > 0) {
      assert.ok(lineAudit.bridgeLineCount < 400, `Expected bridge < 400L, got ${lineAudit.bridgeLineCount}`);
    }
  });

  it("T3-06 [F1 x F5 x F6 x F9 x F13 x F15]: MCP App workspace_read + Connect loopback via EventBus with zero Temporal/CLI in mcp-app-shared", async () => {
    const sb = ctx.makeSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "MCP Loopback WS"], { sandbox: sb });
    const wsId = extractWorkspaceId(wsInit);
    fs.mkdirSync(path.join(sb.workspaceDir, "notes"), { recursive: true });
    fs.writeFileSync(path.join(sb.workspaceDir, "notes/relay-ctx.md"), "# Context\nAuthorized workspace read.\n", "utf8");

    const pkg = buildV2Package(path.join(sb.root, "opl-relay"), {
      intent: "app",
      id: "opl-relay",
      specStrict: true,
    });
    patchProviderStubRedaction(pkg.dir, "opl-relay");
    await runCliOk(["pack", "link", pkg.dir], { sandbox: sb });

    const appRpc = await ctx.connectRpc(sb, { clientKind: "opl_app" });
    const extRpc = await ctx.connectRpc(sb, { clientKind: "external" });

    const tokRes = await appRpc.call("connect.issueConsumerBindToken", {
      consumer_package_id: "opl-relay",
      session_id: extRpc.handshakeResult.session_id,
    });
    const bindToken = extractBindToken(tokRes);

    const readOut = await extRpc.call("app.contribution.read", {
      package_id: "opl-relay",
      ref: "workspace.read",
      consumer_bind_token: bindToken,
      input: { workspace_id: wsId, path: "notes/relay-ctx.md" },
    });
    assert.match(JSON.stringify(readOut), /Authorized workspace read\./);

    const secret = "secret-t306-loopback";
    await appRpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Relay Mail",
      secret,
    });

    await assertRpcError(
      () =>
        extRpc.call("connect.invoke", {
          consumer_bind_token: bindToken,
          connection_id: "conn-mail",
          capability_id: "mailbox.search",
          input: { query: "mace" },
        }),
      -32003,
      /grant_not_found|grant_missing_or_stale|GRANT_NOT_ACTIVE/i
    );

    appRpc.drainEvents("event.connect.*");
    const req = await extRpc.call("connect.requestAccess", {
      consumer_bind_token: bindToken,
      connection_id: "conn-mail",
      capability_ids: ["mailbox.search"],
    });
    const requestId = extractRequestId(req);

    const evReq = await appRpc.waitForEvent("event.connect.changed", { timeoutMs: 3000, consume: true });
    assert.equal(evReq.raw.id, undefined);
    assert.match(JSON.stringify(evReq.params), new RegExp(requestId));

    await appRpc.call("connect.approveRequest", { request_id: requestId });
    const evGrant = await appRpc.waitForEvent("event.connect.changed", { timeoutMs: 3000, consume: true });
    assert.equal(evGrant.raw.id, undefined);

    const invoked = await extRpc.call("connect.invoke", {
      consumer_bind_token: bindToken,
      connection_id: "conn-mail",
      capability_id: "mailbox.search",
      input: { query: "mace" },
    });
    assert.equal(invoked.disposition, "completed");
    assert.equal(JSON.stringify(invoked).includes(secret), false);

    const sharedFiles = listFilesRecursive(MCP_APP_SHARED_DIR, { excludeTests: true }).filter((f) =>
      /\.(?:js|mjs|ts|html)$/.test(f)
    );
    assert.ok(sharedFiles.length > 0, `Expected mcp-app-shared files at ${MCP_APP_SHARED_DIR}`);
    for (const f of sharedFiles) {
      const content = fs.readFileSync(f, "utf8");
      assert.doesNotMatch(content, /node:child_process|["']child_process["']/);
      assert.doesNotMatch(content, /spawn\(["']opl["']|execFile\(["']opl["']/);
      assert.doesNotMatch(content, /cordis-profiles|@temporalio\//);
    }
  });

  it("T3-07 [F2 x F4 x F9 x F10 x F11 x F14]: migrated MAS validated by foundry -> built -> obsidian snapshot -> agy Stage 1 --add-dir", async () => {
    const sb = ctx.makeSandbox({
      stubEnv: {
        OPL_STUB_AGY_ARTIFACTS_JSON: JSON.stringify([{ path: "analysis/obs.md", content: "# Obsidian Derived\nok\n" }]),
      },
    });
    await sb.startDaemon();
    await stageAndInstallFoundry(sb);

    const masFx = buildV1DomainFixture(path.join(sb.root, "mas-v1"), "mas");
    await runCliJson(["pack", "migrate-v1", masFx.dir], { sandbox: sb });

    const valRes = await runCliJson(["foundry", "validate", masFx.dir], { sandbox: sb });
    assert.equal(valRes.ok, true, `Expected foundry validate ok=true, got ${JSON.stringify(valRes)}`);

    const manifestPath = path.join(masFx.dir, "opl-package.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    fs.writeFileSync(
      path.join(masFx.dir, "stages.json"),
      JSON.stringify([{ stage_id: "plan", executor: "antigravity", model: "gemini-4-neon-high", role: "producer" }], null, 2),
      "utf8"
    );
    manifest.provides = manifest.provides || {};
    manifest.provides.agent = { stages_ref: "./stages.json" };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    await runCliJson(["pack", "build", masFx.dir], { sandbox: sb });
    assert.equal(fs.existsSync(path.join(masFx.dir, "opl-release.lock.json")), true);
    await runCliOk(["pack", "link", masFx.dir], { sandbox: sb });

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Obsidian Relay WS", "--domain", "mas"], {
      sandbox: sb,
    });
    const wsId = extractWorkspaceId(wsInit);
    const extVault = buildObsidianVaultDir(path.join(sb.root, "obsidian-vault"));
    const addSrc = await runCliJson(
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
    const sourceId = extractSourceId(addSrc);

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Obsidian Stage", "--goal", "Analyze vault"],
      { sandbox: sb }
    );
    const taskId = ctx.trackTask(sb, extractTaskId(startRes));

    const done = await waitForDbState(
      sb.dbPath,
      (db) => {
        const t = getTask(db, taskId);
        if (t?.status !== "completed") return null;
        const sr = getStageRuns(db, taskId)[0];
        return sr ? { t, sr } : null;
      },
      { timeoutMs: 12_000, pollMs: 80 }
    );
    assert.equal(done.sr.executor_id, "antigravity");

    const dbCheck = ctx.openDb(sb.dbPath, { readOnly: true });
    let snaps = getKnowledgeSnapshots(dbCheck, done.sr.stage_run_id);
    dbCheck.close();
    if (snaps.length === 0) {
      await runCliJson(
        ["workspace", "snapshot", "--workspace", wsId, "--stage-run", done.sr.stage_run_id, "--source", sourceId],
        { sandbox: sb }
      );
      const dbSnap = ctx.openDb(sb.dbPath, { readOnly: true });
      snaps = getKnowledgeSnapshots(dbSnap, done.sr.stage_run_id);
      dbSnap.close();
    }
    assert.ok(snaps.length >= 1, "Expected frozen knowledge_snapshots row");
    assertNoRawKnowledgeContentInDb(sb.dbPath, extVault.canaryStrings);

    const agyInv = readStubLogs(sb, "agy").find((e) => e.event === "invocation" && e.subcommand === "print");
    assert.ok(agyInv, "Expected agy --print invocation");
    assert.equal(agyInv.parsed.mode, "accept-edits");
    assert.equal(agyInv.parsed.sandbox, true);
    assert.ok(Array.isArray(agyInv.parsed.addDirs) && agyInv.parsed.addDirs.length >= 1, "Expected --add-dir passed to agy");
  });

  it("T3-08 [F3 x F6 x F7 x F8 x F9 x F12]: linked pkg + workspace writeback propose/commit -> atomic Ledger owner_receipt + Bridge/CLI inspect", async () => {
    const sb = ctx.makeSandbox();
    await sb.startDaemon();

    const pkgDir = path.join(sb.root, "mas-wb");
    buildV2Package(pkgDir, {
      intent: "agent",
      id: "mas",
      pluginName: "med-autoscience",
      specStrict: true,
      manifestOverride: buildAgentContributionOverride("mas"),
    });
    ensureAgentHandlerScript(pkgDir, "mas");
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });
    const proj = readCodexMarketplaceProjection(sb.oplHome, "med-autoscience");
    assert.equal(proj.skillsIsSymlink, true);

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Writeback Bridge WS", "--domain", "mas"], {
      sandbox: sb,
    });
    const wsId = extractWorkspaceId(wsInit);
    const extVault = buildObsidianVaultDir(path.join(sb.root, "wb-vault"));
    const addSrc = await runCliJson(
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
    const sourceId = extractSourceId(addSrc);

    const mod = await loadBridgeModule();
    const bridge = ctx.trackBridge(new mod.OplFrameworkBridge({ workspaceRoot: sb.workspaceDir, env: sb.env }));
    await bridge.start();

    const bridgeEvents = [];
    bridge.on("event", (ev) => bridgeEvents.push(ev));

    const taskRes = await bridge.client.call("runway.task.create", {
      workspace_id: wsId,
      agent_id: "mas",
      title: "Writeback Receipt Task",
      goal_prompt: "Writeback and record receipt",
    });
    const taskId = ctx.trackTask(sb, extractTaskId(taskRes));

    const db0 = ctx.openDb(sb.dbPath, { readOnly: true });
    const rev0 = getKnowledgeSource(db0, sourceId)?.accepted_revision ?? "1";
    db0.close();

    const updatedText = "# Study Protocol v2\nUpdated via writeback commit.\n";
    const prop = await bridge.client.call("workspace.writeback.propose", {
      workspace_id: wsId,
      source_id: sourceId,
      target_path: "notes/protocol.md",
      content: updatedText,
      accepted_revision: rev0,
    });
    const commitRes = await bridge.client.call("workspace.writeback.commit", {
      proposal_id: prop.proposal_id,
      workspace_id: wsId,
      source_id: sourceId,
      target_path: "notes/protocol.md",
      content: updatedText,
      accepted_revision: rev0,
    });
    assert.equal(commitRes.committed, true);
    assert.equal(fs.readFileSync(path.join(extVault.dir, "notes/protocol.md"), "utf8"), updatedText);

    await bridge.client.call("ledger.append", {
      task_id: taskId,
      entry_kind: "owner_receipt",
      owner_id: "mas",
      payload: {
        receipt_id: "rcpt-wb-1",
        status: "succeeded",
        target_path: "notes/protocol.md",
        previous_revision: commitRes.previous_revision,
        new_revision: commitRes.new_revision,
      },
    });

    const deadline = Date.now() + 3000;
    let ledgerEv = null;
    while (Date.now() < deadline) {
      ledgerEv = bridgeEvents.find(
        (e) => (e?.method ?? e?.type) === "event.ledger.appended" && JSON.stringify(e.params ?? e).includes("owner_receipt")
      );
      if (ledgerEv) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.ok(ledgerEv, "Expected Bridge to receive event.ledger.appended for owner_receipt");

    const wsInspect = await runCliJson(["workspace", "inspect", wsId], { sandbox: sb });
    assert.equal((wsInspect.workspace ?? wsInspect).workspace_id, wsId);
    const receiptsOut = await runCliJson(["ledger", "receipts", taskId], { sandbox: sb });
    assert.match(JSON.stringify(receiptsOut), /rcpt-wb-1/);

    const detailRes = await bridge.opl.readDomainDetailView({ itemId: "mas", viewId: "mas.detail" });
    assert.ok(detailRes.stdoutJson);
    const fastState = await bridge.opl.readState("fast");
    assert.equal(fastState.profile, "fast");
  });

  it("T3-09 [F1 x F6 x F10 x F11 x F15]: kill -9 opld with hang codex stub -> reconcile reattaches PID, preserves DQS=0 & 1 opld / 0 Temporal", async () => {
    const sb = ctx.makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_MODE: "hang",
      },
    });
    const d1 = await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Reattach WS", "--domain", "mas"], {
      sandbox: sb,
    });
    const wsId = extractWorkspaceId(wsInit);
    const pkgDir = path.join(sb.root, "mas-hang");
    ensureAgentContributionHandler(
      buildV2Package(pkgDir, {
        intent: "agent",
        id: "mas",
        specStrict: true,
        stages: [{ stage_id: "analysis", executor: "codex", model: "gpt-5-codex", role: "producer" }],
      })
    );
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Hang Reattach", "--goal", "Survive SIGKILL"],
      { sandbox: sb }
    );
    const taskId = ctx.trackTask(sb, extractTaskId(startRes));

    const live = await waitForDbState(
      sb.dbPath,
      (db) => {
        const sr = getStageRuns(db, taskId)[0];
        if (!sr) return null;
        const att = getAttempts(db, sr.stage_run_id)[0];
        if (!att || att.status !== "running" || !(Number(att.local_pid) > 0)) return null;
        return { sr, att };
      },
      { timeoutMs: 8000, pollMs: 50 }
    );
    const lease0Ms = Date.parse(live.att.lease_expires_at);

    await sb.killDaemon({ signal: "SIGKILL" });
    assert.equal(isPidAlive(live.att.local_pid), true, "Detached codex stub must survive kill -9 opld");

    await sb.startDaemon({ excludePid: d1.pid });

    const reattached = await waitForDbState(
      sb.dbPath,
      (db) => {
        const att = getAttempts(db, live.sr.stage_run_id)[0];
        if (!att || att.status !== "running") return null;
        return Date.parse(att.lease_expires_at) > lease0Ms ? att : null;
      },
      { timeoutMs: 12_000, pollMs: 100 }
    );
    assert.equal(reattached.attempt_id, live.att.attempt_id, "reconcile() must reattach existing attempt_id");

    const db = ctx.openDb(sb.dbPath, { readOnly: true });
    assertNoDuplicateAttempts(db, live.sr.stage_run_id, 1);
    assertPragmas(db, { checkConnectionDefaults: false });
    assertDqsZeroEnforced(db);
    db.close();

    const codexExecs = readStubLogs(sb, "codex").filter((e) => e.event === "invocation" && e.subcommand === "exec");
    assert.equal(codexExecs.length, 1, "Must not spawn duplicate codex execution on reconcile");

    const liveProcs = sb.findLiveProcesses();
    const daemonProcs = liveProcs.filter((p) => !/\bstubs\/bin\/(?:codex|agy)\b/.test(p.command));
    const procAudit = auditProcessHygiene({
      psRows: IS_PRE_M4 ? liveProcs : undefined,
      sandboxLiveProcs: daemonProcs,
      expectedOpldCount: 1,
    });
    assert.equal(procAudit.ok, true, `Process hygiene violations: ${JSON.stringify(procAudit.violations)}`);

    await runCliJson(["runway", "cancel", taskId, "--reason", "t309 cleanup"], { sandbox: sb });
    await waitForDbState(
      sb.dbPath,
      (dbRo) => (!isPidAlive(live.att.local_pid) && getAttempts(dbRo, live.sr.stage_run_id)[0]?.status !== "running" ? true : null),
      { timeoutMs: 8000, pollMs: 50 }
    );
  });

  it("T3-10 [F1 x F3 x F4 x F10 x F11 x F12]: migrated & linked MAS complete_after_detach across SIGKILL -> reconcile harvests Ledger once", async () => {
    const sb = ctx.makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_MODE: "complete_after_detach",
        OPL_STUB_CODEX_DELAY_MS: "800",
        OPL_STUB_CODEX_ARTIFACTS_JSON: JSON.stringify([{ path: "out/harvest.md", content: "# Harvested\nonce\n" }]),
      },
    });
    const d1 = await sb.startDaemon();

    const masFx = buildV1DomainFixture(path.join(sb.root, "mas-v1"), "mas");
    await runCliJson(["pack", "migrate-v1", masFx.dir], { sandbox: sb });
    const manifest = JSON.parse(fs.readFileSync(path.join(masFx.dir, "opl-package.json"), "utf8"));
    fs.writeFileSync(
      path.join(masFx.dir, "stages.json"),
      JSON.stringify([{ stage_id: "build", executor: "codex", model: "gpt-5-codex", role: "producer" }], null, 2),
      "utf8"
    );
    manifest.provides = manifest.provides || {};
    manifest.provides.agent = { stages_ref: "./stages.json" };
    fs.writeFileSync(path.join(masFx.dir, "opl-package.json"), JSON.stringify(manifest, null, 2), "utf8");

    await runCliOk(["pack", "link", masFx.dir], { sandbox: sb });
    const proj = readCodexMarketplaceProjection(sb.oplHome, "med-autoscience");
    assert.equal(proj.skillsIsSymlink, true);

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Detach Harvest WS", "--domain", "mas"], {
      sandbox: sb,
    });
    const wsId = extractWorkspaceId(wsInit);

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Detach Harvest", "--goal", "Harvest once"],
      { sandbox: sb }
    );
    const taskId = ctx.trackTask(sb, extractTaskId(startRes));

    const live = await waitForDbState(
      sb.dbPath,
      (db) => {
        const sr = getStageRuns(db, taskId)[0];
        if (!sr) return null;
        const att = getAttempts(db, sr.stage_run_id)[0];
        return att?.status === "running" && Number(att.local_pid) > 0 ? { sr, att } : null;
      },
      { timeoutMs: 8000, pollMs: 40 }
    );

    await sb.killDaemon({ signal: "SIGKILL" });
    const compEv = await waitForStubLogEvent(
      sb.stubLogDir,
      "codex",
      (e) => e.event === "completion" && e.subcommand === "exec" && e.exit_code === 0,
      { timeoutMs: 8000 }
    );
    assert.equal(compEv.exit_code, 0);

    const d2 = await sb.startDaemon({ excludePid: d1.pid });
    const harvested = await waitForDbState(
      sb.dbPath,
      (db) => {
        const t = getTask(db, taskId);
        const sr = getStageRuns(db, taskId)[0];
        const att = getAttempts(db, live.sr.stage_run_id)[0];
        const arts = getLedgerEntries(db, taskId, "artifact_ref");
        if (t?.status !== "completed" || sr?.status !== "completed" || att?.status !== "succeeded") return null;
        return arts.length >= 1 ? { t, sr, att, arts } : null;
      },
      { timeoutMs: 12_000, pollMs: 80 }
    );
    assert.equal(harvested.arts.length, 1);

    // Second clean restart must be idempotent
    await sb.stopDaemon();
    await sb.startDaemon({ excludePid: d2.pid });
    await new Promise((r) => setTimeout(r, 400));

    const db2 = ctx.openDb(sb.dbPath, { readOnly: true });
    assertNoDuplicateAttempts(db2, live.sr.stage_run_id, 1);
    assert.equal(getLedgerEntries(db2, taskId, "artifact_ref").length, 1);
    assert.equal(getStageRuns(db2, taskId)[0].revision, harvested.sr.revision);
    assertSchema(db2);
    assertPragmas(db2, { checkConnectionDefaults: false });
    db2.close();
  });

  it("T3-11 [F7 x F9 x F10 x F11 x F12]: lost agy stub -> reconcile human_gate + typed_blocker -> CLI status exit 4 -> CLI decide", async () => {
    const sb = ctx.makeSandbox();
    const rulesPath = createRulesFile(sb, [
      { tool: "agy", subcommand: "print", once: true, config: { mode: "hang" } },
      { tool: "agy", subcommand: "print", config: { mode: "success", artifacts: [{ path: "analysis/recovered.md", content: "recovered\n" }] } },
    ]);
    const d1 = await sb.startDaemon({ env: { OPL_STUB_RULES_FILE: rulesPath } });

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Lost Agy WS", "--domain", "mas"], {
      sandbox: sb,
    });
    const wsId = extractWorkspaceId(wsInit);

    const pkgDir = path.join(sb.root, "mas-agy");
    ensureAgentContributionHandler(
      buildV2Package(pkgDir, {
        intent: "agent",
        id: "mas",
        specStrict: true,
        stages: [{ stage_id: "analyze", executor: "antigravity", model: "gemini-4-neon-high", role: "producer" }],
      })
    );
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Lost Agy", "--goal", "Recover via gate"],
      { sandbox: sb }
    );
    const taskId = ctx.trackTask(sb, extractTaskId(startRes));

    const live = await waitForDbState(
      sb.dbPath,
      (db) => {
        const sr = getStageRuns(db, taskId)[0];
        if (!sr) return null;
        const att = getAttempts(db, sr.stage_run_id)[0];
        return att?.status === "running" && Number(att.local_pid) > 0 ? { sr, att } : null;
      },
      { timeoutMs: 8000, pollMs: 40 }
    );
    await waitForStubLogEvent(
      sb.stubLogDir,
      "agy",
      (e) => e.event === "invocation" && e.subcommand === "print" && e.mode === "hang",
      { timeoutMs: 8000 }
    );

    await sb.killDaemon({ signal: "SIGKILL" });
    try {
      process.kill(live.att.local_pid, "SIGKILL");
    } catch {
      // already exited
    }
    const deadWait = Date.now() + 2000;
    while (Date.now() < deadWait && isPidAlive(live.att.local_pid)) {
      await new Promise((r) => setTimeout(r, 20));
    }

    await sb.startDaemon({ excludePid: d1.pid, env: { OPL_STUB_RULES_FILE: rulesPath } });

    const gateState = await waitForDbState(
      sb.dbPath,
      (db) => {
        const sr = getStageRuns(db, taskId)[0];
        const att = getAttempts(db, live.sr.stage_run_id)[0];
        const blockers = getLedgerEntries(db, taskId, "typed_blocker");
        if (sr?.status !== "human_gate" || att?.status !== "interrupted" || blockers.length === 0) return null;
        return { sr, att, blockers };
      },
      { timeoutMs: 10_000, pollMs: 80 }
    );

    const statusGate = await runCliExpectCode(["runway", "status", taskId, "--json"], 4, { sandbox: sb });
    assert.match(JSON.stringify(statusGate.json), /human_gate|awaiting_human/);

    const decided = await runCliJson(
      [
        "runway",
        "decide",
        gateState.sr.stage_run_id,
        "--decision",
        "approve",
        "--expected-revision",
        String(gateState.sr.revision),
        "--notes",
        "manual recovery",
      ],
      { sandbox: sb }
    );
    assert.equal(decided.ok, true);

    await waitForDbState(
      sb.dbPath,
      (db) => {
        const t = getTask(db, taskId);
        return t && t.status === "completed" ? t : null;
      },
      { timeoutMs: 10_000, pollMs: 80 }
    );

    const dbFinal = ctx.openDb(sb.dbPath, { readOnly: true });
    const decisions = getLedgerEntries(dbFinal, taskId, "human_decision");
    assert.ok(decisions.length >= 1, "Expected human_decision recorded in ledger_entries");
    dbFinal.close();
  });

  it("T3-12 [F2 x F9 x F10 x F11 x F12 x F15]: built 3-stage agent (agy -> codex -> agy reviewer --mode plan --sandbox) + ledger verify", async () => {
    const sb = ctx.makeSandbox({
      stubEnv: { OPL_STUB_DEFAULT_ARTIFACT: "0" },
    });
    const rulesPath = createRulesFile(sb, [
      {
        tool: "agy",
        subcommand: "print",
        once: true,
        config: {
          mode: "success",
          artifacts: [{ path: "analysis/plan.md", content: "# Stage 1 Plan\nCompute figures/fig1.svg\n" }],
          response_text: "Stage 1 wrote analysis/plan.md",
        },
      },
      {
        tool: "codex",
        subcommand: "exec",
        once: true,
        config: {
          mode: "success",
          artifacts: [{ path: "figures/fig1.svg", content: "<svg xmlns='http://www.w3.org/2000/svg'/>\n" }],
          response_text: "Stage 2 wrote figures/fig1.svg",
        },
      },
      {
        tool: "agy",
        subcommand: "print",
        once: true,
        config: {
          mode: "read_only_check",
          artifacts: [],
          response_text: "Stage 3 read-only review passed",
        },
      },
    ]);
    await sb.startDaemon({ env: { OPL_STUB_RULES_FILE: rulesPath } });

    const pkgDir = path.join(sb.root, "mas-3stage");
    ensureAgentContributionHandler(
      buildV2Package(pkgDir, {
        intent: "agent",
        id: "mas",
        specStrict: true,
        stages: [
          { stage_id: "plan", executor: "antigravity", model: "gemini-4-neon-high", role: "producer" },
          { stage_id: "render", executor: "codex", model: "gpt-5-codex", role: "producer" },
          { stage_id: "review", executor: "antigravity", model: "gemini-4-neon-xhigh", role: "reviewer" },
        ],
      })
    );
    await runCliJson(["pack", "build", pkgDir], { sandbox: sb });
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "3-Stage Relay WS", "--domain", "mas"], {
      sandbox: sb,
    });
    const wsId = extractWorkspaceId(wsInit);

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "3-Stage", "--goal", "Relay and verify"],
      { sandbox: sb }
    );
    const taskId = ctx.trackTask(sb, extractTaskId(startRes));

    const done = await waitForDbState(
      sb.dbPath,
      (db) => {
        const t = getTask(db, taskId);
        if (t?.status !== "completed") return null;
        const stages = getStageRuns(db, taskId);
        if (stages.length !== 3 || stages.some((s) => s.status !== "completed")) return null;
        return { t, stages };
      },
      { timeoutMs: 20_000, pollMs: 80 }
    );
    assert.deepEqual(
      done.stages.map((s) => s.executor_id),
      ["antigravity", "codex", "antigravity"]
    );

    const agyInvs = readStubLogs(sb, "agy").filter((e) => e.event === "invocation" && e.subcommand === "print");
    const codexInvs = readStubLogs(sb, "codex").filter((e) => e.event === "invocation" && e.subcommand === "exec");
    assert.equal(agyInvs.length, 2);
    assert.equal(codexInvs.length, 1);

    const codexPrompt = `${JSON.stringify(codexInvs[0].argv)} ${codexInvs[0].stdin_preview || ""}`;
    assert.ok(codexPrompt.includes("analysis/plan.md"), "Stage 2 codex must receive Stage 1 artifact ref");
    assert.equal(codexPrompt.includes(agyInvs[0].convId), false, "Stage 2 must NOT receive Stage 1 private convId");

    assert.equal(agyInvs[1].parsed.mode, "plan");
    assert.equal(agyInvs[1].parsed.sandbox, true);
    assert.equal(agyInvs[1].mode, "read_only_check");

    const verifyRes = await runCliJson(["ledger", "verify", taskId], { sandbox: sb });
    assert.equal(verifyRes.ok, true);
    assert.equal(verifyRes.open_blocking_debts, 0);
    assert.equal(verifyRes.artifact_hash_mismatches.length, 0);

    const db = ctx.openDb(sb.dbPath, { readOnly: true });
    assertLedgerRefsOnly(db, taskId);
    db.close();

    // F15 red-line checks tied to the 3-stage relay run
    const liveProcs = sb.findLiveProcesses();
    const procAudit = auditProcessHygiene({
      psRows: IS_PRE_M4 ? liveProcs : undefined,
      sandboxLiveProcs: liveProcs,
      expectedOpldCount: 1,
    });
    assert.equal(procAudit.ok, true, `Process hygiene violations: ${JSON.stringify(procAudit.violations)}`);
    assert.equal(procAudit.opldCount, 1);
    assert.equal(procAudit.temporalProcesses.length, 0);
    assert.equal(
      liveProcs.some((p) => /stubs\/bin\/(?:codex|agy)/.test(String(p.command || ""))),
      false,
      `Expected zero lingering executor stub processes after 3-stage relay: ${JSON.stringify(liveProcs)}`
    );

    await runCliExpectCode(["agents", "modules"], 2, { sandbox: sb });
    await runCliExpectCode(["stages", "list"], 2, { sandbox: sb });

    const launchAgentsDir = process.env.OPL_LAUNCH_AGENTS_DIR
      ? path.resolve(process.env.OPL_LAUNCH_AGENTS_DIR)
      : process.platform === "darwin"
        ? path.join(os.homedir(), "Library", "LaunchAgents")
        : null;
    const temporalAudit = auditTemporalElimination(REPO_ROOT, {
      allowRootPkgTemporal: IS_PRE_M4,
      allowTemporalFiles: IS_PRE_M4,
      launchAgentsDir: IS_PRE_M4 ? null : launchAgentsDir,
    });
    assert.equal(temporalAudit.ok, true, `Temporal violations: ${JSON.stringify(temporalAudit.violations)}`);

    const demoAudit = auditLegacyDemolition(REPO_ROOT, { allowLegacyCli: IS_PRE_M4 });
    if (!IS_PRE_M4) {
      assert.equal(demoAudit.ok, true, `Legacy demolition violations: ${JSON.stringify(demoAudit.violations)}`);
    } else {
      assert.equal(demoAudit.violations.some((v) => v.rule === "opl-flow-circular-ref"), false);
    }

    const lineAudit = auditLineBudgets({
      repoRoot: REPO_ROOT,
      bridgeDir: BRIDGE_DIR,
      pythonClientDir: PYTHON_CLIENT_DIR,
      requireCore: true,
      requirePythonClient: !IS_PRE_M4,
      requireBridge: !IS_PRE_M4 || fs.existsSync(path.join(BRIDGE_DIR, "src")),
    });
    assert.equal(lineAudit.ok, true, `Line budget / import guard violations: ${JSON.stringify(lineAudit.violations)}`);
    assert.ok(lineAudit.coreLineCount > 0 && lineAudit.coreLineCount < 3000);
    if (lineAudit.bridgeLineCount > 0) {
      assert.ok(lineAudit.bridgeLineCount < 400, `Expected bridge < 400L, got ${lineAudit.bridgeLineCount}`);
    }
  });

  it("T3-13 [F5 x F6 x F8 x F10 x F11 x F12]: human_gate & OPL Connect approval via Bridge -> event.runway.changed/event.ledger.appended & secret isolation", async () => {
    const sb = ctx.makeSandbox();
    const providerLog = path.join(sb.stubLogDir, "t313-prov.jsonl");
    const rulesPath = createRulesFile(sb, [
      { tool: "agy", subcommand: "print", once: true, config: { mode: "hang" } },
      { tool: "agy", subcommand: "print", config: { mode: "success", artifacts: [{ path: "analysis/stage1.md", content: "stage1 ok\n" }] } },
      { tool: "codex", subcommand: "exec", config: { mode: "success", artifacts: [{ path: "out/stage2.md", content: "stage2 ok\n" }] } },
    ]);
    const d1 = await sb.startDaemon({ env: { OPL_STUB_RULES_FILE: rulesPath, OPL_CONNECT_PROVIDER_LOG: providerLog } });

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Bridge Gate WS", "--domain", "mas"], {
      sandbox: sb,
    });
    const wsId = extractWorkspaceId(wsInit);

    const pair = buildConnectPair(path.join(sb.root, "pkgs"), {
      specStrict: true,
      providerId: "opl-relay",
      consumerId: "mas",
      consumerCapabilities: ["mailbox.read"],
    });
    fs.writeFileSync(
      path.join(pair.consumerDir, "stages.json"),
      JSON.stringify(
        [
          { stage_id: "plan", executor: "antigravity", model: "gemini-4-neon-high", role: "producer" },
          { stage_id: "build", executor: "codex", model: "gpt-5-codex", role: "producer" },
        ],
        null,
        2
      ),
      "utf8"
    );
    ensureAgentContributionHandler(pair.consumer);
    patchProviderStubRedaction(pair.providerDir, "opl-relay", providerLog);
    await runCliOk(["pack", "link", pair.providerDir], { sandbox: sb });
    await runCliOk(["pack", "link", pair.consumerDir], { sandbox: sb });

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Bridge Gate", "--goal", "Resolve gate"],
      { sandbox: sb }
    );
    const taskId = ctx.trackTask(sb, extractTaskId(startRes));

    const live = await waitForDbState(
      sb.dbPath,
      (db) => {
        const sr = getStageRuns(db, taskId)[0];
        if (!sr) return null;
        const att = getAttempts(db, sr.stage_run_id)[0];
        return att?.status === "running" && Number(att.local_pid) > 0 ? { sr, att } : null;
      },
      { timeoutMs: 8000, pollMs: 40 }
    );
    await waitForStubLogEvent(
      sb.stubLogDir,
      "agy",
      (e) => e.event === "invocation" && e.subcommand === "print" && e.mode === "hang",
      { timeoutMs: 8000 }
    );

    await sb.killDaemon({ signal: "SIGKILL" });
    try {
      process.kill(live.att.local_pid, "SIGKILL");
    } catch {
      // ignore
    }
    const deadWait = Date.now() + 2000;
    while (Date.now() < deadWait && isPidAlive(live.att.local_pid)) {
      await new Promise((r) => setTimeout(r, 20));
    }

    await sb.startDaemon({
      excludePid: d1.pid,
      env: { OPL_STUB_RULES_FILE: rulesPath, OPL_CONNECT_PROVIDER_LOG: providerLog },
    });
    const gateState = await waitForDbState(
      sb.dbPath,
      (db) => {
        const sr = getStageRuns(db, taskId)[0];
        return sr?.status === "human_gate" ? sr : null;
      },
      { timeoutMs: 10_000, pollMs: 80 }
    );

    const mod = await loadBridgeModule();
    const bridge = ctx.trackBridge(new mod.OplFrameworkBridge({ workspaceRoot: sb.workspaceDir, env: sb.env }));
    await bridge.start();
    const bridgeEvents = [];
    bridge.on("event", (ev) => bridgeEvents.push(ev));

    const extRpc = await ctx.connectRpc(sb, { clientKind: "external" });
    await assertRpcError(
      () =>
        extRpc.call("runway.humanGate.resolve", {
          stage_run_id: gateState.stage_run_id,
          decision: "approve",
          expected_revision: gateState.revision,
        }),
      -32003,
      /TRUSTED_HOST_REQUIRED/
    );

    // F5 OPL Connect roundtrip with canary secret alongside Runway human_gate + Ledger
    const secret = "secret-t313-gate-never-leaked";
    await bridge.client.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Relay Mailbox",
      account_label: "t313@lab",
      secret,
    });
    const tokRes = await bridge.client.call("connect.issueConsumerBindToken", {
      consumer_package_id: "mas",
      session_id: extRpc.handshakeResult.session_id,
    });
    const bindToken = extractBindToken(tokRes);
    const connReq = await extRpc.call("connect.requestAccess", {
      consumer_bind_token: bindToken,
      connection_id: "conn-mail",
      capability_ids: ["mailbox.read"],
    });
    const requestId = extractRequestId(connReq);
    await assertRpcError(
      () => extRpc.call("connect.approveRequest", { request_id: requestId }),
      -32003,
      /TRUSTED_HOST_REQUIRED/
    );
    const approvedConn = await bridge.connectionAccessApproval.approve(requestId);
    assert.equal(approvedConn.ok, true);

    const connInvoked = await extRpc.call("connect.invoke", {
      consumer_bind_token: bindToken,
      connection_id: "conn-mail",
      capability_id: "mailbox.read",
      input: { query: "gate-context" },
    });
    assert.equal(connInvoked.disposition, "completed");
    assert.equal(JSON.stringify(connInvoked).includes(secret), false);
    assert.ok(readProviderDispatchCount(providerLog) >= 1, "Expected Connect provider dispatch");

    const resolved = await bridge.client.call("runway.humanGate.resolve", {
      stage_run_id: gateState.stage_run_id,
      decision: "approve",
      expected_revision: gateState.revision,
      notes: "bridge approved",
    });
    assert.equal(resolved.ok, true);

    await waitForDbState(
      sb.dbPath,
      (db) => {
        const t = getTask(db, taskId);
        const stages = getStageRuns(db, taskId);
        if (t?.status !== "completed" || stages.length < 2) return null;
        return stages[1].status === "completed" ? { t, stages } : null;
      },
      { timeoutMs: 15_000, pollMs: 80 }
    );

    const deadline = Date.now() + 3000;
    let runwayEv = null;
    let ledgerEv = null;
    let connectEv = null;
    while (Date.now() < deadline) {
      runwayEv = bridgeEvents.find((e) => (e?.method ?? e?.type) === "event.runway.changed");
      ledgerEv = bridgeEvents.find((e) => (e?.method ?? e?.type) === "event.ledger.appended");
      connectEv = bridgeEvents.find((e) => (e?.method ?? e?.type) === "event.connect.changed");
      if (runwayEv && ledgerEv && connectEv) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.ok(runwayEv, "Expected Bridge to receive event.runway.changed");
    assert.ok(ledgerEv, "Expected Bridge to receive event.ledger.appended");
    assert.ok(connectEv, "Expected Bridge to receive event.connect.changed");

    const db = ctx.openDb(sb.dbPath, { readOnly: true });
    const connRow = getConnection(db, "conn-mail");
    assert.ok(connRow && connRow.status === "active" && typeof connRow.credential_handle === "string" && connRow.credential_handle.length > 0);
    const grants = getGrants(db, { consumerPackageId: "mas", connectionId: "conn-mail", capabilityId: "mailbox.read" });
    const activeGrant = grants.find((g) => g.status === "granted");
    assert.ok(activeGrant, `Expected active connection_grant for mas -> conn-mail: ${JSON.stringify(grants)}`);
    const masPkg = getInstalledPackage(db, "mas");
    assert.equal(activeGrant.consumer_content_digest, masPkg?.content_digest);
    const decisions = getLedgerEntries(db, taskId, "human_decision");
    assert.ok(decisions.length >= 1);
    assertLedgerRefsOnly(db, taskId, [secret]);
    assertNoPlaintextSecrets(db, [secret]);
    db.close();
    assert.equal(fs.readFileSync(sb.dbPath).includes(Buffer.from(secret, "utf8")), false);
    if (fs.existsSync(providerLog)) fs.rmSync(providerLog, { force: true });
  });

  it("T3-14 [F1 x F6 x F9 x F12 x F14]: Python OplClient AF_UNIX -> knowledge_snapshot -> append_ledger + drain_events -> SQLite WAL check", async () => {
    const sb = ctx.makeSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Python Snap Ledger WS"], {
      sandbox: sb,
    });
    const wsId = extractWorkspaceId(wsInit);
    const extVault = buildObsidianVaultDir(path.join(sb.root, "py-vault"));
    await runCliJson(
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

    const appRpc = await ctx.connectRpc(sb, { clientKind: "opl_app" });
    const createdTask = await appRpc.call("runway.task.create", {
      workspace_id: wsId,
      agent_id: "mas",
      title: "Python Telemetry Task",
      goal_prompt: "Snapshot and append ledger from Python",
    });
    const taskId = ctx.trackTask(sb, extractTaskId(createdTask));
    const srId = extractStageRunId(createdTask.stage_runs?.[0] ?? { stage_run_id: "sr-py-t314" });
    await appRpc.close();

    const digestHex = "b".repeat(64);
    const pyScript = `
import json
from opl_client import OplClient

with OplClient(session_file=${JSON.stringify(sb.sessionPath)}, client_kind="sdk_python") as cli:
    snap = cli.knowledge_snapshot(${JSON.stringify(wsId)}, ${JSON.stringify(srId)})
    r1 = cli.append_ledger(${JSON.stringify(taskId)}, "artifact_ref", "mas", {"path": "notes/py.md", "sha256": ${JSON.stringify(digestHex)}})
    r2 = cli.append_ledger(${JSON.stringify(taskId)}, "quality_debt", "mas", {"debt_id": "d-py-1", "code": "missing_plot", "blocks_submission": False})
    events = cli.drain_events()
    ledger_evs = [e for e in events if e.get("method") == "event.ledger.appended"]
    assert len(ledger_evs) >= 2, f"Expected >=2 event.ledger.appended events, got {events}"
    tl = cli.ledger_timeline(${JSON.stringify(taskId)})
    entries = tl if isinstance(tl, list) else tl.get("entries", tl.get("items", []))
    assert len(entries) == 2, f"Expected 2 timeline entries, got {entries}"
    print(json.dumps({"snapshot": snap, "events_count": len(ledger_evs), "timeline_count": len(entries)}))
`;
    const pyRes = runPythonScript(sb, pyScript);
    const pyOut = JSON.parse(pyRes.stdout.trim());
    assert.ok(pyOut.events_count >= 2);
    assert.equal(pyOut.timeline_count, 2);
    assert.ok(JSON.stringify(pyOut.snapshot).includes("notes/protocol.md"));

    const db = ctx.openDb(sb.dbPath, { readOnly: true });
    assertPragmas(db, { checkConnectionDefaults: false });
    assertDqsZeroEnforced(db);
    assertLedgerRefsOnly(db, taskId);
    assert.equal(getKnowledgeSnapshots(db, srId).length >= 1, true);
    db.close();
    assertNoRawKnowledgeContentInDb(sb.dbPath, extVault.canaryStrings);
  });

  it("T3-15 [F5 x F10 x F11 x F13 x F14]: Python OplClient (-32003 on approve) + MCP App bind token invoke_connection -> Runway codex task", async () => {
    const sb = ctx.makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_ARTIFACTS_JSON: JSON.stringify([{ path: "out/mail-summary.md", content: "mail processed\n" }]),
      },
    });
    await sb.startDaemon();

    const pair = buildConnectPair(path.join(sb.root, "pkgs"), { specStrict: true });
    ensureAgentContributionHandler(pair.consumer);
    patchProviderStubRedaction(pair.providerDir, "opl-relay");
    await runCliOk(["pack", "link", pair.providerDir], { sandbox: sb });
    await runCliOk(["pack", "link", pair.consumerDir], { sandbox: sb });

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Python Connect Runway WS", "--domain", "mas"], {
      sandbox: sb,
    });
    const wsId = extractWorkspaceId(wsInit);

    const secret = "secret-t315-py-connect";
    const appRpc = await ctx.connectRpc(sb, { clientKind: "opl_app" });
    await appRpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Relay Mailbox",
      secret,
    });

    const pyScript = `
import json, sys
from opl_client import OplClient, OplRpcError

with OplClient(session_file=${JSON.stringify(sb.sessionPath)}, client_kind="sdk_python") as cli:
    try:
        cli.call("connect.approveRequest", {"request_id": "req-untrusted-probe"})
        raise AssertionError("Expected OplRpcError(-32003) for sdk_python approveRequest")
    except OplRpcError as exc:
        assert exc.code == -32003, f"Expected -32003, got {exc.code}"
    print(json.dumps({"session_id": cli.server_info["session_id"]}), flush=True)
    payload = json.loads(sys.stdin.readline())
    res = cli.invoke_connection(payload["bind_token"], "conn-mail", "mailbox.read", {"query": "mace"})
    assert res.get("disposition") == "completed", f"Unexpected result: {res}"
    assert ${JSON.stringify(secret)} not in json.dumps(res)
    print(json.dumps({"invoke": res}), flush=True)
`;
    const pySess = spawnPythonSession(sb, pyScript);
    const firstLine = await pySess.readLine(8000);
    const { session_id: pySessionId } = JSON.parse(firstLine);
    assert.ok(typeof pySessionId === "string" && pySessionId.length > 0);

    const tokRes = await appRpc.call("connect.issueConsumerBindToken", {
      session_id: pySessionId,
      consumer_package_id: "opl-relay",
    });
    const bindToken = extractBindToken(tokRes);

    const req = await appRpc.call("connect.requestAccess", {
      consumer_package_id: "opl-relay",
      connection_id: "conn-mail",
      capability_ids: ["mailbox.read"],
    });
    await appRpc.call("connect.approveRequest", { request_id: extractRequestId(req) });

    pySess.sendLine({ bind_token: bindToken });
    const pyExit = await pySess.waitExit(10_000);
    assert.equal(pyExit.code, 0, `Python failed:\n${pyExit.stdout}\n${pyExit.stderr}`);
    const pyResult = JSON.parse(pyExit.stdout.trim());
    assert.equal(pyResult.invoke.disposition, "completed");

    // Feed bounded Connect output into Runway codex stage
    fs.writeFileSync(path.join(sb.workspaceDir, "mail-context.json"), JSON.stringify(pyResult.invoke.result), "utf8");
    const masCodexDir = path.join(sb.root, "mas-codex-only");
    ensureAgentContributionHandler(
      buildV2Package(masCodexDir, {
        intent: "agent",
        id: "mas",
        specStrict: true,
        stages: [{ stage_id: "summarize", executor: "codex", model: "gpt-5-codex", role: "producer" }],
      })
    );
    await runCliOk(["pack", "link", masCodexDir], { sandbox: sb });

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Process Mail", "--goal", "Summarize mail-context.json"],
      { sandbox: sb }
    );
    const taskId = ctx.trackTask(sb, extractTaskId(startRes));

    await waitForDbState(
      sb.dbPath,
      (db) => {
        const t = getTask(db, taskId);
        return t?.status === "completed" ? t : null;
      },
      { timeoutMs: 10_000, pollMs: 80 }
    );
    assert.ok(readStubLogs(sb, "codex").some((e) => e.event === "invocation" && e.subcommand === "exec"));
  });

  it("T3-16 [F2 x F3 x F7 x F8 x F14 x F15]: install opl-foundry -> dynamic opl foundry init/validate -> build -> link -> Bridge & redlines", async () => {
    const sb = ctx.makeSandbox();
    await sb.startDaemon();

    await runCliExpectCode(["foundry", "--help"], 2, { sandbox: sb });
    await stageAndInstallFoundry(sb);

    const mod = await loadBridgeModule();
    const bridge = ctx.trackBridge(new mod.OplFrameworkBridge({ workspaceRoot: sb.workspaceDir, env: sb.env }));
    await bridge.start();

    const scaffoldDir = path.join(sb.root, "foundry-gen-agent");
    // Use --id= syntax per VALUE_FLAGS compatibility
    const initRes = await runCliJson(["foundry", "init", scaffoldDir, "--id=foundry-gen-agent"], { sandbox: sb });
    assert.equal(initRes.ok, true);

    const valRes = await runCliJson(["foundry", "validate", scaffoldDir], { sandbox: sb });
    assert.equal(valRes.ok, true);

    await runCliJson(["pack", "build", scaffoldDir], { sandbox: sb });
    assert.equal(fs.existsSync(path.join(scaffoldDir, "opl-release.lock.json")), true);
    await runCliJson(["pack", "link", scaffoldDir], { sandbox: sb });

    const proj = readCodexMarketplaceProjection(sb.oplHome, "foundry-gen-agent");
    assert.ok(proj.pluginJson, "Expected scaffolded package in Codex marketplace");

    const fastState = await bridge.opl.readState("fast");
    const pkgs = fastState.packages ?? fastState.installed_packages ?? [];
    assert.ok(
      pkgs.some((p) => (p.package_id ?? p.id) === "foundry-gen-agent"),
      "Expected Bridge readState('fast') to surface foundry-gen-agent"
    );

    const pyAudit = auditPythonStdlibAndBudget(PYTHON_CLIENT_DIR, { maxLines: 1500 });
    assert.equal(pyAudit.ok, true, `Python budget/stdlib violations: ${JSON.stringify(pyAudit.violations)}`);

    const lineAudit = auditLineBudgets({
      repoRoot: REPO_ROOT,
      bridgeDir: BRIDGE_DIR,
      pythonClientDir: PYTHON_CLIENT_DIR,
      requireCore: true,
      requirePythonClient: !IS_PRE_M4 || Boolean(process.env.OPL_PYTHON_CLIENT_DIR),
      requireBridge: !IS_PRE_M4 || fs.existsSync(path.join(BRIDGE_DIR, "src")),
    });
    assert.equal(lineAudit.ok, true, `Line budget violations: ${JSON.stringify(lineAudit.violations)}`);
  });

  it("T3-17 [F1 x F8 x F10 x F12 x F14]: concurrent humanGate.resolve via Bridge vs Python OplClient -> atomic winner & -32009 loser rollback", async () => {
    const sb = ctx.makeSandbox();
    await sb.startDaemon();

    const dbSeed = ctx.openDb(sb.dbPath);
    const seeded = seedStaleStageRun(dbSeed, {
      workspaceId: "ws-race",
      workspaceRoot: sb.workspaceDir,
      taskId: "task-race",
      stageRunId: "sr-race",
      revision: 1,
    });
    txImmediate(dbSeed, () => {
      dbSeed.prepare("UPDATE stage_runs SET status = 'human_gate' WHERE stage_run_id = ?").run(seeded.stageRunId);
      dbSeed.prepare("UPDATE tasks SET status = 'awaiting_human' WHERE task_id = ?").run(seeded.taskId);
    });
    dbSeed.close();

    const mod = await loadBridgeModule();
    const bridge = ctx.trackBridge(new mod.OplFrameworkBridge({ workspaceRoot: sb.workspaceDir, env: sb.env }));
    await bridge.start();

    const pyScript = `
import json, sys
from opl_client import OplClient, OplRpcError

with OplClient(session_file=${JSON.stringify(sb.sessionPath)}, client_kind="opl_cli") as cli:
    print("READY", flush=True)
    sys.stdin.readline()
    try:
        res = cli.call("runway.humanGate.resolve", {
            "stage_run_id": ${JSON.stringify(seeded.stageRunId)},
            "decision": "reject",
            "expected_revision": 1,
        })
        print(json.dumps({"ok": True, "res": res}), flush=True)
    except OplRpcError as exc:
        print(json.dumps({"ok": False, "code": exc.code, "message": str(exc)}), flush=True)
`;
    const pySess = spawnPythonSession(sb, pyScript);
    const readyLine = await pySess.readLine(8000);
    assert.equal(readyLine, "READY");

    const bridgePromise = bridge.client
      .call("runway.humanGate.resolve", {
        stage_run_id: seeded.stageRunId,
        decision: "approve",
        expected_revision: 1,
      })
      .then((res) => ({ ok: true, res }))
      .catch((err) => ({ ok: false, code: err?.rpcCode ?? err?.code, message: err?.message }));

    pySess.sendLine("GO");
    const [bridgeOut, pyExit] = await Promise.all([bridgePromise, pySess.waitExit(10_000)]);
    assert.equal(pyExit.code, 0, `Python race process failed:\n${pyExit.stdout}\n${pyExit.stderr}`);
    const pyOut = JSON.parse(pyExit.stdout.trim());

    const outcomes = [bridgeOut, pyOut];
    const winners = outcomes.filter((o) => o.ok === true);
    const losers = outcomes.filter((o) => o.ok === false);
    assert.equal(winners.length, 1, `Expected exactly 1 atomic winner, got: ${JSON.stringify(outcomes)}`);
    assert.equal(losers.length, 1, `Expected exactly 1 loser, got: ${JSON.stringify(outcomes)}`);
    assert.equal(losers[0].code, -32009, `Expected loser code -32009 REVISION_CONFLICT, got ${JSON.stringify(losers[0])}`);

    const dbAfter = ctx.openDb(sb.dbPath, { readOnly: true });
    const srAfter = getStageRuns(dbAfter, seeded.taskId)[0];
    assert.equal(srAfter.revision, 2);
    const entries = getLedgerEntries(dbAfter, seeded.taskId, "human_decision");
    assert.equal(entries.length, 1, "Loser rollback must leave exactly 1 human_decision entry");
    assertPragmas(dbAfter, { checkConnectionDefaults: false });
    dbAfter.close();
  });

  it("T3-18 [F6 x F7 x F10 x F12 x F13 x F14]: cron cancel_other -> cancels prior task -> event.runway.changed -> Python drain_events + MCP App render", async () => {
    const sb = ctx.makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_MODE: "hang",
      },
    });
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Cron Render WS", "--domain", "mas"], {
      sandbox: sb,
    });
    const wsId = extractWorkspaceId(wsInit);

    const pkgDir = path.join(sb.root, "mas-cron");
    ensureAgentContributionHandler(
      buildV2Package(pkgDir, {
        intent: "agent",
        id: "mas",
        specStrict: true,
        stages: [{ stage_id: "analysis", executor: "codex", model: "gpt-5-codex", role: "producer" }],
      })
    );
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Prior Active", "--goal", "To be cancelled"],
      { sandbox: sb }
    );
    const task1Id = ctx.trackTask(sb, extractTaskId(startRes));
    await waitForDbState(
      sb.dbPath,
      (db) => {
        const sr = getStageRuns(db, task1Id)[0];
        if (!sr) return null;
        const att = getAttempts(db, sr.stage_run_id)[0];
        return att?.status === "running" ? att : null;
      },
      { timeoutMs: 8000, pollMs: 50 }
    );

    const schedRes = await runCliJson(
      [
        "runway",
        "schedules",
        "create",
        "--workspace",
        wsId,
        "--agent",
        "mas",
        "--cron",
        "* * * * *",
        "--overlap",
        "cancel_other",
        "--title",
        "Replacement Cron",
        "--goal",
        "Replace prior task",
      ],
      { sandbox: sb }
    );
    const scheduleId = extractScheduleId(schedRes);

    // Connect Python OplClient BEFORE nudging next_run_at so it receives event.runway.changed
    const pyScript = `
import json, sys, time
from opl_client import OplClient

with OplClient(session_file=${JSON.stringify(sb.sessionPath)}, client_kind="sdk_python") as cli:
    print("CONNECTED", flush=True)
    line = sys.stdin.readline().strip()
    events = cli.drain_events()
    tl = cli.ledger_timeline(line)
    events = events + cli.drain_events()
    print(json.dumps({"events": events, "timeline": tl}), flush=True)
`;
    const pySess = spawnPythonSession(sb, pyScript);
    assert.equal(await pySess.readLine(8000), "CONNECTED");

    const dbW = ctx.openDb(sb.dbPath);
    txImmediate(dbW, () => {
      dbW.prepare("UPDATE schedules SET next_run_at = ? WHERE schedule_id = ?").run("2026-01-01T00:00:00Z", scheduleId);
    });
    dbW.close();

    const fired = await waitForDbState(
      sb.dbPath,
      (db) => {
        const t1 = getTask(db, task1Id);
        const s = getSchedule(db, scheduleId);
        if (t1?.status !== "cancelled") return null;
        if (!s?.last_task_id || s.last_task_id === task1Id) return null;
        return { t1, s };
      },
      { timeoutMs: 8000, pollMs: 100 }
    );
    const task2Id = ctx.trackTask(sb, fired.s.last_task_id);

    pySess.sendLine(task1Id);
    const pyExit = await pySess.waitExit(10_000);
    assert.equal(pyExit.code, 0, `Python drain_events failed:\n${pyExit.stdout}\n${pyExit.stderr}`);
    const pyOut = JSON.parse(pyExit.stdout.trim());
    assert.ok(
      (pyOut.events || []).some((e) => e.method === "event.runway.changed"),
      `Expected Python drain_events to capture event.runway.changed, got ${JSON.stringify(pyOut.events)}`
    );

    const tlEntries = Array.isArray(pyOut.timeline)
      ? pyOut.timeline
      : pyOut.timeline?.entries ?? pyOut.timeline?.timeline ?? pyOut.timeline?.items ?? [];
    assert.ok(tlEntries.length >= 1, "Expected cancellation ledger entry in timeline");

    const ui = await loadMcpAppSharedExports(MCP_APP_SHARED_DIR);
    assert.equal(typeof ui.renderOwnerView, "function");
    assert.equal(typeof ui.parseTrajectorySnapshot, "function");

    const html = ui.renderOwnerView(
      { view_type: "timeline" },
      {
        title: "<script>xss</script>Cron Trajectory",
        events: tlEntries.map((e) => ({
          kind: e.entry_kind ?? "human_decision",
          title: e.owner_id ?? "human",
          summary: JSON.stringify(e.payload ?? e.payload_json ?? {}),
          occurred_at: e.created_at ?? "2026-11-25T00:00:00Z",
          source_refs: [],
        })),
      }
    );
    assert.equal(html.includes("<script>xss"), false);
    const snap = ui.parseTrajectorySnapshot(
      {
        revision: 1,
        work_item_id: task2Id,
        summary: { status: "active" },
        nodes: [{ id: "n1", label: "Replacement", source_refs: [] }],
        edges: [],
      },
      task2Id
    );
    assert.equal(snap.revision, 1);

    await runCliJson(["runway", "cancel", task2Id, "--reason", "t318 cleanup"], { sandbox: sb });
  });

  it("T3-19 [F2 x F3 x F6 x F7 x F13]: opl pack disable updates enabled=0, removes Codex projection, updates app.state.get & blocks MCP App", async () => {
    const sb = ctx.makeSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Disable MCP App WS"], { sandbox: sb });
    const wsId = extractWorkspaceId(wsInit);
    fs.mkdirSync(path.join(sb.workspaceDir, "notes"), { recursive: true });
    fs.writeFileSync(path.join(sb.workspaceDir, "notes/item.md"), "visible while enabled\n", "utf8");

    const pkgDir = path.join(sb.root, "opl-relay");
    buildV2Package(pkgDir, { intent: "app", id: "opl-relay", pluginName: "opl-relay", syncEnabled: true, specStrict: true });
    patchProviderStubRedaction(pkgDir, "opl-relay");
    await runCliJson(["pack", "build", pkgDir], { sandbox: sb });
    const arch = createLocalPackageArchive(pkgDir, path.join(sb.root, "dist"), { includeLockFile: true });
    await runCliJson(["pack", "install", arch.archivePath], { sandbox: sb });

    const projBefore = readCodexMarketplaceProjection(sb.oplHome, "opl-relay");
    assert.ok(projBefore.pluginJson, "Expected Codex marketplace entry while enabled");

    const appRpc = await ctx.connectRpc(sb, { clientKind: "opl_app" });
    const extRpc = await ctx.connectRpc(sb, { clientKind: "external" });
    const tokRes = await appRpc.call("connect.issueConsumerBindToken", {
      consumer_package_id: "opl-relay",
      session_id: extRpc.handshakeResult.session_id,
    });
    const bindToken = extractBindToken(tokRes);
    const readBefore = await extRpc.call("app.contribution.read", {
      package_id: "opl-relay",
      ref: "workspace.read",
      consumer_bind_token: bindToken,
      input: { workspace_id: wsId, path: "notes/item.md" },
    });
    assert.match(JSON.stringify(readBefore), /visible while enabled/);

    await runCliJson(["pack", "disable", "opl-relay"], { sandbox: sb });

    const db = ctx.openDb(sb.dbPath, { readOnly: true });
    const row = getInstalledPackage(db, "opl-relay");
    assert.equal(row?.enabled, 0);
    assert.equal(row?.carrier_synced, 0);
    db.close();

    const projAfter = readCodexMarketplaceProjection(sb.oplHome, "opl-relay");
    assert.equal(fs.existsSync(projAfter.pluginDir), false, "Codex projection must be removed on disable");

    const fastState = await appRpc.call("app.state.get", { profile: "fast" });
    const statePkg = (fastState.packages ?? fastState.installed_packages ?? []).find((p) => p.package_id === "opl-relay");
    assert.equal(statePkg?.enabled, false);

    await assertRpcError(
      () =>
        extRpc.call("app.contribution.read", {
          package_id: "opl-relay",
          ref: "workspace.read",
          consumer_bind_token: bindToken,
          input: { workspace_id: wsId, path: "notes/item.md" },
        }),
      -32003,
      /CONSUMER_UNAVAILABLE|disabled|not installed|grant/i
    );
  });

  it("T3-20 [F1 x F3 x F4 x F5 x F6 x F10]: migrated opl-channel-weixin (sync_enabled=false) hosted in opld -> connect.channels.action -> Runway task", async () => {
    const sb = ctx.makeSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Weixin Channel WS", "--domain", "mas"], {
      sandbox: sb,
    });
    const wsId = extractWorkspaceId(wsInit);

    const wxFx = buildV1DomainFixture(path.join(sb.root, "opl-channel-weixin"), "opl-channel-weixin");
    await runCliJson(["pack", "migrate-v1", wxFx.dir], { sandbox: sb });
    const v2 = JSON.parse(fs.readFileSync(path.join(wxFx.dir, "opl-package.json"), "utf8"));
    assert.equal(v2.schema_version, "opl.package.v2");
    assert.equal(v2.identity.intent, "channel");
    assert.equal(v2.host_hints?.codex?.sync_enabled, false);

    await runCliOk(["pack", "link", wxFx.dir], { sandbox: sb });

    const proj = readCodexMarketplaceProjection(sb.oplHome, "opl-channel-weixin");
    assert.equal(fs.existsSync(proj.pluginDir), false, "sync_enabled=false channel must have zero Codex projection");

    const appRpc = await ctx.connectRpc(sb, { clientKind: "opl_app" });
    const fastState = await appRpc.call("app.state.get", { profile: "fast" });
    const wxPkg = (fastState.packages ?? fastState.installed_packages ?? []).find(
      (p) => (p.package_id ?? p.id) === "opl-channel-weixin"
    );
    assert.ok(wxPkg && wxPkg.enabled === true, "Core dynamic loader must surface opl-channel-weixin in opld");
    assert.equal(wxPkg.carrier_synced ?? wxPkg.codex_synced, false);

    const channelsProj = await appRpc.call("connect.channels.list", {});
    assert.equal(channelsProj.surface_kind, "opl_connect_channel_provider_host_projection.v1");

    const activeProvider = (channelsProj.providers || []).find(
      (p) => p.package_id === "opl-channel-weixin" && p.status === "active"
    );

    if (activeProvider) {
      const actionRes = await appRpc.call("connect.channels.action", {
        package_id: "opl-channel-weixin",
        ref: "weixin.connect",
        confirmed: true,
        input: { workspace_id: wsId, message: "Inbound weixin trigger" },
      });
      assert.equal(actionRes.ok, true);
      const createdTask = await appRpc.call("runway.task.create", {
        workspace_id: wsId,
        agent_id: "mas",
        title: "Channel Dispatch Task",
        goal_prompt: `Handle channel payload: ${JSON.stringify(actionRes.result ?? actionRes)}`,
      });
      const taskId = ctx.trackTask(sb, extractTaskId(createdTask));
      const db = ctx.openDb(sb.dbPath, { readOnly: true });
      assert.ok(getTask(db, taskId), "Expected Runway task persisted from channel flow");
      db.close();
    } else {
      // Wave 1A runtime before M3/M5 channel module attachment: fail-closed CHANNEL_PROVIDER_UNAVAILABLE
      await assertRpcError(
        () =>
          appRpc.call("connect.channels.action", {
            package_id: "opl-channel-weixin",
            ref: "weixin.connect",
            confirmed: true,
            input: { workspace_id: wsId },
          }),
        -32004,
        /CHANNEL_PROVIDER_UNAVAILABLE/
      );
      const contribRead = await appRpc.call("app.contribution.read", {
        package_id: "opl-channel-weixin",
        ref: "weixin.access.state",
        input: { workspace_id: wsId },
      });
      assert.ok(contribRead && typeof contribRead === "object");
      const createdTask = await appRpc.call("runway.task.create", {
        workspace_id: wsId,
        agent_id: "mas",
        title: "Channel Fallback Task",
        goal_prompt: "Create Runway task for channel workspace",
      });
      const taskId = ctx.trackTask(sb, extractTaskId(createdTask));
      const db = ctx.openDb(sb.dbPath, { readOnly: true });
      assert.ok(getTask(db, taskId));
      db.close();
    }
  });
});
