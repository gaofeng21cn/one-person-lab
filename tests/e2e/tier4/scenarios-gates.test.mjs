import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { pathToFileURL } from "node:url";

import { assertCoreCliHelp, runCli, runCliExpectCode, runCliJson, runCliOk } from "../lib/cli.mjs";
import {
  WAVE3_DOMAIN_PRESETS,
  buildAll8Wave3Fixtures,
  buildConnectPair,
  buildObsidianVaultDir,
  buildV2Package,
  createLocalPackageArchive,
  assertCodexPluginPayload,
  readCodexMarketplaceProjection,
  tamperPackageFile,
} from "../lib/fixtures.mjs";
import {
  auditLegacyDemolition,
  auditLineBudgets,
  auditProcessHygiene,
  auditProtectedBoundaries,
  auditPythonStdlibAndBudget,
  auditTemporalElimination,
} from "../lib/redline-audit.mjs";
import { assertRpcError, connectRpcClient } from "../lib/rpc-client.mjs";
import {
  DEFAULT_WORKTREE_ROOT,
  createSandbox,
  isPidAlive,
  measureLatencyMs,
  resolveAppRoot,
  resolveBridgeDir,
  resolveStudioRoot,
  waitForStubLogEvent,
} from "../lib/sandbox.mjs";
import {
  assertLedgerRefsOnly,
  assertNoDuplicateAttempts,
  assertNoPlaintextSecrets,
  assertNoRawKnowledgeContentInDb,
  assertPausedByHumanSovereignty,
  assertStageRunStatus,
  assertTaskStatus,
  countTasks,
  getAttempts,
  getConnectAuditEvents,
  getConnection,
  getGrants,
  getInstalledPackage,
  getKnowledgeSource,
  getLedgerEntries,
  getPackageOperations,
  getSchedule,
  getStageRuns,
  getTask,
  openOplDb,
  seedWakeFromSleepSchedules,
  txImmediate,
  waitForDbState,
} from "../lib/sqlite-inspector.mjs";

const REPO_ROOT = path.resolve(process.env.OPL_E2E_REPO_ROOT || DEFAULT_WORKTREE_ROOT);
const STUDIO_ROOT = resolveStudioRoot(REPO_ROOT);
const BRIDGE_DIR = resolveBridgeDir(STUDIO_ROOT);
const APP_ROOT = resolveAppRoot(REPO_ROOT);
const PYTHON_CLIENT_DIR = path.resolve(
  process.env.OPL_PYTHON_CLIENT_DIR || path.join(REPO_ROOT, "sdks", "python-client")
);
const FOUNDRY_DIR = path.resolve(
  process.env.OPL_FOUNDRY_DIR || path.join(REPO_ROOT, "extensions", "foundry")
);
const MCP_APP_SHARED_DIR = path.resolve(
  process.env.OPL_MCP_APP_SHARED_DIR || path.join(REPO_ROOT, "packages", "mcp-app-shared")
);
const IS_PRE_M4 = process.env.OPL_E2E_REPO_PHASE === "pre_m4";


const activeSandboxes = [];
const activeRpcClients = [];
const activeBridges = [];
const activeDbs = [];
const activeTasksToCancel = [];

function makeSandbox(opts = {}) {
  const sb = createSandbox(opts);
  activeSandboxes.push(sb);
  return sb;
}

function trackRpc(client) {
  activeRpcClients.push(client);
  return client;
}

function trackBridge(bridge) {
  activeBridges.push(bridge);
  return bridge;
}

function openTrackedDb(dbPath, opts) {
  const db = openOplDb(dbPath, opts);
  activeDbs.push(db);
  return db;
}

function trackTaskForCleanup(sb, taskId) {
  if (sb && taskId) {
    activeTasksToCancel.push({ sb, taskId });
  }
  return taskId;
}

function extractId(obj, keys, label) {
  for (const k of keys) {
    if (typeof obj?.[k] === "string" && obj[k].length > 0) return obj[k];
  }
  assert.fail(`Expected ${label} in: ${JSON.stringify(obj)}`);
}

function extractWorkspaceId(res) {
  return extractId(res?.workspace ?? res, ["workspace_id", "workspaceId", "id"], "workspace_id");
}

function extractTaskId(res) {
  return extractId(res?.task ?? res, ["task_id", "taskId", "id"], "task_id");
}

function extractSourceId(res) {
  return extractId(res?.source ?? res, ["source_id", "sourceId", "id"], "source_id");
}

function readStubLogs(sb, tool) {
  const logPath = path.join(sb.stubLogDir, `${tool}.jsonl`);
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function createRulesFile(sb, rules) {
  const rulesPath = path.join(sb.root, "stub-rules.json");
  fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2), "utf8");
  return rulesPath;
}

function readProviderDispatchCount(logPath) {
  if (!logPath || !fs.existsSync(logPath)) return 0;
  return fs
    .readFileSync(logPath, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0).length;
}

function instrumentRedactedProvider(pkg, logPath) {
  const id = pkg.manifest.identity.id;
  const providerPath = path.join(pkg.binDir, `${id}-provider`);
  fs.mkdirSync(path.dirname(providerPath), { recursive: true });
  fs.writeFileSync(
    providerPath,
    [
      "#!/usr/bin/env node",
      'const fs = require("node:fs");',
      "const chunks = [];",
      'process.stdin.on("data", (c) => chunks.push(c));',
      'process.stdin.on("end", () => {',
      '  const raw = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};',
      "  const { secret: _secret, ...safe } = raw && typeof raw === \"object\" ? raw : {};",
      `  const targetLog = process.env.OPL_CONNECT_PROVIDER_LOG || ${JSON.stringify(logPath || "")};`,
      "  if (targetLog) {",
      '    fs.appendFileSync(targetLog, JSON.stringify({ ts: Date.now(), provider: ' +
        JSON.stringify(id) +
        ', argv: process.argv.slice(2), capability_id: safe.capability_id ?? null, has_secret: Boolean(_secret) }) + "\\n", "utf8");',
      "  }",
      `  process.stdout.write(JSON.stringify({ ok: true, provider: ${JSON.stringify(id)}, capability_id: safe.capability_id ?? null, input: safe.input ?? {} }) + "\\n");`,
      "});",
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o755 }
  );
  fs.chmodSync(providerPath, 0o755);
}

function ensureAgentContributionHandler(pkg) {
  const manifest = JSON.parse(fs.readFileSync(pkg.manifestPath, "utf8"));
  if (manifest.ui?.declarative?.views && !manifest.provides?.contribution_handler) {
    const id = manifest.identity.id;
    const handlerPath = path.join(pkg.binDir, `${id}-handler`);
    fs.mkdirSync(path.dirname(handlerPath), { recursive: true });
    fs.writeFileSync(
      handlerPath,
      `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ ok: true, package_id: ${JSON.stringify(id)} }) + "\\n");\n`,
      { encoding: "utf8", mode: 0o755 }
    );
    fs.chmodSync(handlerPath, 0o755);
    manifest.provides = manifest.provides || {};
    manifest.provides.contribution_handler = {
      kind: "cli",
      argv: [`./bin/${id}-handler`],
      transport: "stdin_json_stdout_json",
    };
    fs.writeFileSync(pkg.manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    pkg.manifest = manifest;
  }
  return pkg;
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

function copyDirClean(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (
      ent.name === "node_modules" ||
      ent.name === ".git" ||
      ent.name === "opl-release.lock.json" ||
      ent.name.endsWith(".tsbuildinfo")
    ) {
      continue;
    }
    const src = path.join(srcDir, ent.name);
    const dst = path.join(dstDir, ent.name);
    if (ent.isDirectory()) {
      copyDirClean(src, dst);
    } else if (ent.isFile()) {
      fs.copyFileSync(src, dst);
    }
  }
}

function buildPythonEnv(sb) {
  const candidates = [PYTHON_CLIENT_DIR, path.join(PYTHON_CLIENT_DIR, "src")].filter((p) => fs.existsSync(p));
  assert.ok(candidates.length > 0, `Expected sdks/python-client at ${PYTHON_CLIENT_DIR}`);
  if (sb.env.PYTHONPATH) candidates.push(sb.env.PYTHONPATH);
  return {
    ...sb.env,
    PYTHONPATH: candidates.join(path.delimiter),
  };
}

function runPythonScript(sb, script, { timeoutMs = 15_000 } = {}) {
  const res = spawnSync("python3", ["-c", script], {
    cwd: sb.workspaceDir,
    env: buildPythonEnv(sb),
    encoding: "utf8",
    timeout: timeoutMs,
  });
  if (res.error?.code === "ETIMEDOUT") {
    assert.fail(
      `Python script timed out after ${timeoutMs}ms (ETIMEDOUT):\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
    );
  }
  if (res.error) {
    assert.fail(`Python script spawn error (${res.error.code ?? res.error.message}): ${res.error.message}`);
  }
  assert.equal(
    res.status,
    0,
    `Python script failed (exit ${res.status}):\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
  );
  return res;
}

async function loadMcpAppSharedExports(sharedDir) {
  const pkgJsonPath = path.join(sharedDir, "package.json");
  assert.equal(fs.existsSync(pkgJsonPath), true, `Expected mcp-app-shared package.json at ${pkgJsonPath}`);
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  const exportsMap = pkgJson.exports || {};

  async function importPublicSubpath(subpath, fallbackRel) {
    let targetRel = fallbackRel;
    const entry = exportsMap[subpath];
    if (typeof entry === "string") targetRel = entry;
    else if (entry && typeof entry === "object") {
      targetRel = entry.default || entry.import || entry.browser || targetRel;
    }
    if (!targetRel) return null;
    const abs = path.resolve(sharedDir, targetRel);
    if (!fs.existsSync(abs)) return null;
    return import(pathToFileURL(abs).href);
  }

  const rootMod = await importPublicSubpath(".", pkgJson.main || "./index.mjs");
  const presMod = (await importPublicSubpath("./presentation", "./presentation.js")) || rootMod;
  const trajMod = (await importPublicSubpath("./trajectory-renderer", "./trajectory-renderer.js")) || rootMod;

  return {
    renderOwnerView: presMod?.renderOwnerView ?? rootMod?.renderOwnerView,
    parseTrajectorySnapshot: trajMod?.parseTrajectorySnapshot ?? rootMod?.parseTrajectorySnapshot,
  };
}

afterEach(async () => {
  while (activeTasksToCancel.length > 0) {
    const { sb, taskId } = activeTasksToCancel.pop();
    try {
      await runCli(["runway", "cancel", taskId, "--reason", "afterEach cleanup", "--json"], {
        sandbox: sb,
        timeoutMs: 3000,
      });
    } catch {
      // ignore if daemon already stopped or task finished
    }
  }
  while (activeDbs.length > 0) {
    const db = activeDbs.pop();
    try {
      db.close();
    } catch {
      // ignore close errors during teardown
    }
  }
  while (activeBridges.length > 0) {
    const b = activeBridges.pop();
    try {
      await b.close?.();
    } catch {
      // ignore close errors during teardown
    }
  }
  while (activeRpcClients.length > 0) {
    const c = activeRpcClients.pop();
    try {
      await c.close?.();
    } catch {
      // ignore close errors during teardown
    }
  }
  while (activeSandboxes.length > 0) {
    const sb = activeSandboxes.pop();
    await sb.cleanup();
  }
});

describe("Tier 4 — Real-World Application Scenarios & Wave Gates", { concurrency: 1 }, () => {
  it("T4-01 [F2, F3, F7]: Wave 1 Gate 1 — Codex zero-degradation sync on MAS", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const pkg = buildV2Package(path.join(sb.workspaceDir, "mas"), {
      intent: "agent",
      id: "mas",
      version: "0.4.0",
      pluginName: "med-autoscience",
      skillId: "med-autoscience",
      specStrict: true,
      manifestOverride: {
        host_hints: {
          codex: {
            sync_enabled: true,
            plugin_name: "med-autoscience",
            category: "Research",
            brand_color: "#1F7A8C",
            capabilities: ["Interactive", "Write"],
          },
        },
      },
    });
    ensureAgentContributionHandler(pkg);
    const sourceSkill = path.join(pkg.skillsDir, "med-autoscience", "SKILL.md");
    assert.equal(fs.existsSync(path.join(pkg.dir, "plugins")), false, "MAS repo must have zero plugins/ mirror");

    await runCliJson(["pack", "build", pkg.dir], { sandbox: sb });
    const lock1 = JSON.parse(fs.readFileSync(path.join(pkg.dir, "opl-release.lock.json"), "utf8"));
    await runCliJson(["pack", "build", pkg.dir], { sandbox: sb });
    const lock2 = JSON.parse(fs.readFileSync(path.join(pkg.dir, "opl-release.lock.json"), "utf8"));
    assert.equal(lock1.algorithm, "sha256");
    assert.equal(lock1.canonicalization, "ordered_path_length_file_length_bytes");
    assert.match(lock1.digest, /^sha256:[0-9a-f]{64}$/i);
    assert.equal(lock1.digest, lock2.digest, "Deterministic build must yield identical lock digest");

    await runCliJson(["pack", "link", pkg.dir], { sandbox: sb });
    const syncRes = await runCliJson(["pack", "sync", "codex"], { sandbox: sb });
    assert.notEqual(syncRes.ok, false);

    const proj = readCodexMarketplaceProjection(sb.oplHome, "med-autoscience");
    assert.ok(proj.marketplace, "Expected marketplace.json to exist");
    assert.equal(proj.marketplace.name, "opl-local");
    assert.ok(proj.marketplace.plugins.some((p) => p.name === "med-autoscience"));
    assert.ok(proj.pluginJson, "Expected .codex-plugin/plugin.json");
    assert.equal(proj.pluginJson.name, "med-autoscience");
    assert.equal(proj.pluginJson.version, "0.4.0");
    assert.equal(proj.pluginJson.skills, "./skills/");
    assert.equal(proj.pluginJson.interface.displayName, pkg.manifest.identity.name["en-US"]);
    assert.equal(proj.pluginJson.interface.category, "Research");
    assert.equal(proj.pluginJson.interface.brandColor, "#1F7A8C");
    assert.deepEqual(proj.pluginJson.interface.defaultPrompt, pkg.manifest.identity.default_prompts);
    assert.ok(
      typeof (proj.pluginJson.interface.logo ?? proj.pluginJson.interface.icon) === "string",
      `Expected logo/icon in projected plugin.json interface: ${JSON.stringify(proj.pluginJson.interface)}`
    );
    assertCodexPluginPayload(proj, pkg.dir);

    const codexLogs = readStubLogs(sb, "codex");
    assert.ok(
      codexLogs.some((ev) => ev.event === "invocation" && ev.subcommand === "app_server"),
      "Expected codex app-server --stdio plugin/list readback invocation"
    );

    const listRes = await runCliJson(["pack", "list"], { sandbox: sb });
    const items = Array.isArray(listRes) ? listRes : listRes.packages ?? listRes.items ?? [];
    const masItem = items.find((p) => (p.package_id ?? p.id) === "mas");
    assert.ok(masItem, `Expected mas in opl pack list: ${JSON.stringify(listRes)}`);
    assert.equal(Boolean(masItem.enabled ?? true), true);
    assert.equal(Boolean(masItem.carrier_synced || masItem.codex_synced || masItem.carrier === "codex"), true);

    await runCliJson(["pack", "unlink", "mas"], { sandbox: sb });
    const afterUnlink = readCodexMarketplaceProjection(sb.oplHome, "med-autoscience");
    assert.equal(fs.existsSync(afterUnlink.pluginDir), false, "Marketplace projection must be removed after unlink");
    if (afterUnlink.marketplace) {
      assert.equal(
        (afterUnlink.marketplace.plugins || []).some((p) => p.name === "med-autoscience"),
        false
      );
    }
    assert.equal(fs.existsSync(sourceSkill), true, "Source SKILL.md must remain intact after unlink");
  });

  it("T4-02 [F6, F8, F2]: Wave 1 Gate 2 — Studio Bridge zero-spawn Software Center (<20ms P99 & pack.updateAll progress)", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const srcV1 = path.join(sb.root, "upd-v1");
    const srcV2 = path.join(sb.root, "upd-v2");
    const outArch = path.join(sb.root, "archives");
    buildV2Package(srcV1, { id: "upd-pkg", version: "0.1.0", intent: "app", specStrict: true });
    buildV2Package(srcV2, { id: "upd-pkg", version: "0.2.0", intent: "app", specStrict: true });
    await runCliJson(["pack", "build", srcV1], { sandbox: sb });
    await runCliJson(["pack", "build", srcV2], { sandbox: sb });
    const archV1 = createLocalPackageArchive(srcV1, outArch, { includeLockFile: true });
    const archV2 = createLocalPackageArchive(srcV2, outArch, { includeLockFile: true });
    await runCliOk(["pack", "install", archV1.archivePath], { sandbox: sb });

    const { hitMarkerPath, spyEnv } = createCanaryOplBin(sb);
    const mod = await loadBridgeModule();
    const bridge = trackBridge(new mod.OplFrameworkBridge({ workspaceRoot: sb.workspaceDir, env: spyEnv }));
    const caps = await bridge.start();
    assert.equal(caps.available, true);

    const receivedEvents = [];
    bridge.on("event", (ev) => receivedEvents.push(ev));

    const spawnsBefore = countSpawnLogLines();
    const stats = await measureLatencyMs(() => bridge.opl.readState("fast"), { iterations: 100, warmup: 5 });
    const fastBefore = await bridge.opl.readState("fast");
    const spawnsAfter = countSpawnLogLines();

    assert.ok(
      stats.p99 < 20,
      `Expected readState("fast") P99 < 20ms, got P99=${stats.p99.toFixed(3)}ms (P50=${stats.p50.toFixed(3)}ms)`
    );
    assert.equal(spawnsAfter - spawnsBefore, 0, "Expected zero child spawns during readState('fast')");
    assert.equal(fs.existsSync(hitMarkerPath), false, "Canary opl binary must never be executed");
    assert.equal(fastBefore.profile, "fast");

    // Drive pack.updateAll with explicit updates list (runManagedUpdate("apply") sends updates: [])
    const updRes = await bridge.client.call("pack.updateAll", {
      updates: [{ package_id: "upd-pkg", source: archV2.archivePath }],
    });
    assert.ok(updRes && typeof updRes === "object");

    const deadline = Date.now() + 5000;
    let progressEv = null;
    while (Date.now() < deadline) {
      progressEv = receivedEvents.find(
        (e) =>
          (e?.method ?? e?.type) === "event.pack.progress" &&
          e?.params?.package_id === "upd-pkg" &&
          typeof e?.params?.reload_mode === "string"
      );
      if (progressEv) break;
      await new Promise((r) => setTimeout(r, 25));
    }

    assert.ok(
      progressEv,
      `Expected Bridge subscriber to receive event.pack.progress with reload_mode, got: ${JSON.stringify(receivedEvents)}`
    );
    if (progressEv.raw !== undefined) {
      assert.equal(progressEv.raw.id, undefined, "Server-Push notification must omit JSON-RPC id");
    }
    assert.ok(
      ["none", "renderer_reload", "restart_required"].includes(progressEv.params.reload_mode),
      `Unexpected reload_mode: ${progressEv.params.reload_mode}`
    );
    assert.equal(progressEv.params.reload_mode, "renderer_reload");

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    const ops = getPackageOperations(db, "upd-pkg");
    const succeededOp = [...ops].reverse().find((op) => op.status === "succeeded");
    assert.ok(succeededOp, `Expected succeeded package_operations row for upd-pkg: ${JSON.stringify(ops)}`);
    assert.equal(succeededOp.reload_mode, "renderer_reload");
    db.close();

    const fastAfter = await bridge.opl.readState("fast");
    assert.match(JSON.stringify(fastAfter), /0\.2\.0/, "Expected updated version 0.2.0 in readState('fast')");
    assert.equal(fs.existsSync(hitMarkerPath), false, "Canary opl binary must never be executed during updateAll");
  });

  it("T4-03 [F5, F6, F2]: Wave 1 Gate 3 — Connect package-level digest fail-closed & 1-byte tamper", async () => {
    const sb = makeSandbox();
    const providerLogPath = path.join(sb.stubLogDir, "provider-dispatch.jsonl");
    sb.env.OPL_CONNECT_PROVIDER_LOG = providerLogPath;
    await sb.startDaemon({ env: { OPL_CONNECT_PROVIDER_LOG: providerLogPath } });

    const pair = buildConnectPair(path.join(sb.root, "pkgs"), {
      providerId: "opl-relay",
      consumerId: "mas",
      specStrict: true,
    });
    instrumentRedactedProvider(pair.provider, providerLogPath);
    ensureAgentContributionHandler(pair.consumer);
    await runCliOk(["pack", "link", pair.providerDir], { sandbox: sb });
    await runCliOk(["pack", "link", pair.consumerDir], { sandbox: sb });

    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const sdkRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "sdk_python" }));
    const extRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "external" }));

    const canarySecret = "t403_connect_canary_secret_9f8e7d";
    await appRpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Relay Mailbox",
      account_label: "t403@lab",
      secret: canarySecret,
    });

    const listed = await sdkRpc.call("connect.list", {});
    const listSerialized = JSON.stringify(listed);
    assert.equal(listSerialized.includes(canarySecret), false, "connect.list must never leak secret");
    const listItems = Array.isArray(listed) ? listed : listed.connections ?? listed.items ?? [];
    const listedConn = listItems.find((c) => (c.connection_id ?? c.connectionId) === "conn-mail");
    assert.ok(listedConn, `Expected conn-mail in connect.list: ${listSerialized}`);
    assert.equal(listedConn.credential_handle, undefined, "connect.list must omit credential_handle");

    const dbVault = openTrackedDb(sb.dbPath, { readOnly: true });
    const connRow = getConnection(dbVault, "conn-mail");
    assert.ok(connRow);
    assert.match(connRow.credential_handle, /^vault:/);
    assertNoPlaintextSecrets(dbVault, [canarySecret]);
    dbVault.close();

    const tok1Res = await appRpc.call("connect.issueConsumerBindToken", {
      consumer_package_id: "mas",
      session_id: sdkRpc.handshakeResult.session_id,
    });
    const bindToken1 = tok1Res.consumer_bind_token ?? tok1Res.consumerBindToken ?? tok1Res.token;
    assert.ok(typeof bindToken1 === "string" && bindToken1.startsWith("oplcbt1."));

    const req1 = await sdkRpc.call("connect.requestAccess", {
      consumer_bind_token: bindToken1,
      connection_id: "conn-mail",
      capability_ids: ["mailbox.read"],
    });
    const reqId1 = req1.request_id ?? req1.requestId ?? req1.grants?.[0]?.grant_id;
    assert.ok(reqId1);

    await assertRpcError(
      () => sdkRpc.call("connect.approveRequest", { request_id: reqId1 }),
      -32003,
      /TRUSTED_HOST_REQUIRED/i
    );
    await assertRpcError(
      () => extRpc.call("connect.approveRequest", { request_id: reqId1 }),
      -32003,
      /TRUSTED_HOST_REQUIRED/i
    );

    await appRpc.call("connect.approveRequest", { request_id: reqId1 });

    const ok1 = await sdkRpc.call("connect.invoke", {
      consumer_bind_token: bindToken1,
      consumer_package_id: "mas",
      connection_id: "conn-mail",
      capability_id: "mailbox.read",
      input: { query: "baseline" },
    });
    assert.equal(ok1.disposition, "completed");
    assert.equal(JSON.stringify(ok1).includes(canarySecret), false);
    assert.equal(readProviderDispatchCount(providerLogPath), 1);

    const dbPreTamper = openTrackedDb(sb.dbPath, { readOnly: true });
    const baselineAudits = getConnectAuditEvents(dbPreTamper, { connectionId: "conn-mail", consumerPackageId: "mas" });
    dbPreTamper.close();
    assert.equal(JSON.stringify(baselineAudits).includes(canarySecret), false, "Baseline audit events must never leak secret");
    const baselineAuditCount = baselineAudits.length;
    const baselineCompletedCount = baselineAudits.filter(
      (a) => a.disposition === "completed" || a.disposition === "provider_reported"
    ).length;

    // 1-byte tamper in consumer README.md: fail-closed BEFORE pack.link AND AFTER pack.link
    tamperPackageFile(pair.consumerDir, "README.md", " ");
    const tamperErr1 = await assertRpcError(
      () =>
        sdkRpc.call("connect.invoke", {
          consumer_bind_token: bindToken1,
          consumer_package_id: "mas",
          connection_id: "conn-mail",
          capability_id: "mailbox.read",
          input: { query: "tamper-before-relink" },
        }),
      -32003,
      /CONSUMER_DIGEST_MISMATCH|grant_missing_or_stale|digest/i
    );
    assert.equal(JSON.stringify(tamperErr1).includes(canarySecret), false, "RPC tamper error must never leak secret");
    assert.equal(readProviderDispatchCount(providerLogPath), 1, "Zero provider dispatch after 1-byte tamper");

    await runCliOk(["pack", "link", pair.consumerDir], { sandbox: sb });
    const tamperErr2 = await assertRpcError(
      () =>
        sdkRpc.call("connect.invoke", {
          consumer_bind_token: bindToken1,
          consumer_package_id: "mas",
          connection_id: "conn-mail",
          capability_id: "mailbox.read",
          input: { query: "tamper-after-relink" },
        }),
      -32003,
      /CONSUMER_DIGEST_MISMATCH|grant_missing_or_stale|digest/i
    );
    assert.equal(JSON.stringify(tamperErr2).includes(canarySecret), false, "RPC post-relink error must never leak secret");
    assert.equal(readProviderDispatchCount(providerLogPath), 1, "Zero provider dispatch after re-link without re-approval");

    const dbAudit = openTrackedDb(sb.dbPath, { readOnly: true });
    const audits = getConnectAuditEvents(dbAudit, { connectionId: "conn-mail", consumerPackageId: "mas" });
    dbAudit.close();
    assert.equal(JSON.stringify(audits).includes(canarySecret), false, "connect_audit_events must never leak secret");
    const completedCount = audits.filter(
      (a) => a.disposition === "completed" || a.disposition === "provider_reported"
    ).length;
    assert.equal(
      completedCount,
      baselineCompletedCount,
      `Expected zero post-tamper completed/provider_reported dispatches in connect_audit_events: ${JSON.stringify(audits)}`
    );
    if (audits.length > baselineAuditCount) {
      const newAudits = audits.slice(baselineAuditCount);
      assert.ok(
        newAudits.every(
          (a) =>
            a.disposition &&
            a.disposition !== "completed" &&
            a.disposition !== "provider_reported" &&
            (a.disposition === "not_dispatched" || /block|deni|deny|reject|fail|stale|mismatch/i.test(a.disposition))
        ),
        `Expected any post-tamper connect audit rows to have blocked/not_dispatched/denied disposition, got: ${JSON.stringify(newAudits)}`
      );
    } else {
      assert.equal(
        audits.length,
        baselineAuditCount,
        `Expected pre-dispatch fail-closed to leave connect_audit_events unchanged (${baselineAuditCount}), got ${audits.length}`
      );
    }

    // Re-issue bind token & re-approve for updated digest -> succeeds
    const tok2Res = await appRpc.call("connect.issueConsumerBindToken", {
      consumer_package_id: "mas",
      session_id: sdkRpc.handshakeResult.session_id,
    });
    const bindToken2 = tok2Res.consumer_bind_token ?? tok2Res.consumerBindToken ?? tok2Res.token;
    const req2 = await sdkRpc.call("connect.requestAccess", {
      consumer_bind_token: bindToken2,
      connection_id: "conn-mail",
      capability_ids: ["mailbox.read"],
    });
    const reqId2 = req2.request_id ?? req2.requestId ?? req2.grants?.[0]?.grant_id;
    await appRpc.call("connect.approveRequest", { request_id: reqId2 });

    const ok2 = await sdkRpc.call("connect.invoke", {
      consumer_bind_token: bindToken2,
      consumer_package_id: "mas",
      connection_id: "conn-mail",
      capability_id: "mailbox.read",
      input: { query: "reapproved" },
    });
    assert.equal(ok2.disposition, "completed");
    assert.equal(JSON.stringify(ok2).includes(canarySecret), false);
    assert.equal(readProviderDispatchCount(providerLogPath), 2);
  });

  it("T4-04 [F10, F11, F12, F6]: Wave 2 Gate 4 — No-Temporal kill -9 opld crash recovery", async () => {
    const sb = makeSandbox({
      stubEnv: {
        OPL_STUB_DEFAULT_ARTIFACT: "0",
      },
    });
    const rulesPath = createRulesFile(sb, [
      {
        tool: "codex",
        subcommand: "exec",
        prompt_regex: "DETACH_HARVEST_TASK",
        once: true,
        config: {
          mode: "complete_after_detach",
          delay_ms: 1200,
          artifacts: [{ path: "out/harvested.md", content: "detached harvest ok\n" }],
          response_text: "harvested cleanly",
        },
      },
      {
        tool: "codex",
        subcommand: "exec",
        prompt_regex: "HANG_REATTACH_TASK",
        once: true,
        config: {
          mode: "hang",
        },
      },
    ]);
    const d1 = await sb.startDaemon({ env: { OPL_STUB_RULES_FILE: rulesPath } });

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Gate4 Crash WS", "--domain", "mas"], {
      sandbox: sb,
    });
    const wsId = extractWorkspaceId(wsInit);

    const pkgDir = path.join(sb.root, "pkg-mas");
    const pkg = buildV2Package(pkgDir, {
      intent: "agent",
      id: "mas",
      specStrict: true,
      stages: [{ stage_id: "analysis", executor: "codex", model: "gpt-5-codex", role: "producer" }],
    });
    ensureAgentContributionHandler(pkg);
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });

    const startHarvest = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Harvest Task", "--goal", "DETACH_HARVEST_TASK"],
      { sandbox: sb }
    );
    const harvestTaskId = trackTaskForCleanup(sb, extractTaskId(startHarvest));

    const startHang = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Hang Task", "--goal", "HANG_REATTACH_TASK"],
      { sandbox: sb }
    );
    const hangTaskId = trackTaskForCleanup(sb, extractTaskId(startHang));

    const liveBoth = await waitForDbState(
      sb.dbPath,
      (db) => {
        const srA = getStageRuns(db, harvestTaskId)[0];
        const srB = getStageRuns(db, hangTaskId)[0];
        if (!srA || !srB) return null;
        const attA = getAttempts(db, srA.stage_run_id)[0];
        const attB = getAttempts(db, srB.stage_run_id)[0];
        if (
          attA?.status !== "running" ||
          !(Number(attA.local_pid) > 0) ||
          !attA.executor_session_ref ||
          attB?.status !== "running" ||
          !(Number(attB.local_pid) > 0) ||
          !attB.executor_session_ref ||
          !attB.lease_expires_at
        ) {
          return null;
        }
        return { srA, attA, srB, attB };
      },
      { timeoutMs: 10_000, pollMs: 50 }
    );

    const hangPid = liveBoth.attB.local_pid;
    const hangLease0Ms = Date.parse(liveBoth.attB.lease_expires_at);

    await sb.killDaemon({ signal: "SIGKILL" });
    assert.equal(isPidAlive(hangPid), true, `Detached codex stub pid ${hangPid} must survive kill -9 opld`);

    const completionEv = await waitForStubLogEvent(
      sb.stubLogDir,
      "codex",
      (e) => e.event === "completion" && e.subcommand === "exec" && e.exit_code === 0,
      { timeoutMs: 10_000 }
    );
    assert.equal(completionEv.exit_code, 0);
    assert.equal(fs.readFileSync(path.join(sb.workspaceDir, "out/harvested.md"), "utf8"), "detached harvest ok\n");

    const d2 = await sb.startDaemon({ excludePid: d1.pid, env: { OPL_STUB_RULES_FILE: rulesPath } });

    const reconciled = await waitForDbState(
      sb.dbPath,
      (db) => {
        const tA = getTask(db, harvestTaskId);
        const srA = getStageRuns(db, harvestTaskId)[0];
        const attA = getAttempts(db, liveBoth.srA.stage_run_id)[0];
        const artifactsA = getLedgerEntries(db, harvestTaskId, "artifact_ref");
        const attB = getAttempts(db, liveBoth.srB.stage_run_id)[0];
        if (tA?.status !== "completed" || srA?.status !== "completed" || attA?.status !== "succeeded") return null;
        if (artifactsA.length < 1) return null;
        if (!attB || attB.status !== "running" || Date.parse(attB.lease_expires_at) <= hangLease0Ms) return null;
        return { tA, srA, attA, artifactsA, attB };
      },
      { timeoutMs: 20_000, pollMs: 100 }
    );

    assert.equal(reconciled.artifactsA.length, 1, "Expected exactly 1 artifact_ref harvested for Task A");
    assert.equal(reconciled.attB.attempt_id, liveBoth.attB.attempt_id, "Reattached Task B must retain same attempt_id");

    const dbCheck1 = openTrackedDb(sb.dbPath, { readOnly: true });
    assertNoDuplicateAttempts(dbCheck1, liveBoth.srA.stage_run_id, 1);
    assertNoDuplicateAttempts(dbCheck1, liveBoth.srB.stage_run_id, 1);
    dbCheck1.close();

    // Second restart must remain strictly idempotent
    await sb.stopDaemon();
    await sb.startDaemon({ excludePid: d2.pid, env: { OPL_STUB_RULES_FILE: rulesPath } });
    await new Promise((r) => setTimeout(r, 500));

    const dbCheck2 = openTrackedDb(sb.dbPath, { readOnly: true });
    assertNoDuplicateAttempts(dbCheck2, liveBoth.srA.stage_run_id, 1);
    assertNoDuplicateAttempts(dbCheck2, liveBoth.srB.stage_run_id, 1);
    assert.equal(getLedgerEntries(dbCheck2, harvestTaskId, "artifact_ref").length, 1);
    assert.equal(getStageRuns(dbCheck2, harvestTaskId)[0].revision, reconciled.srA.revision);
    dbCheck2.close();

    const codexExecInvocations = readStubLogs(sb, "codex").filter(
      (e) => e.event === "invocation" && e.subcommand === "exec"
    );
    assert.equal(
      codexExecInvocations.length,
      2,
      `Expected zero duplicate codex exec invocations (2 total), got ${codexExecInvocations.length}`
    );

    await runCliJson(["runway", "cancel", hangTaskId, "--reason", "gate4 cleanup"], { sandbox: sb });
    await waitForDbState(
      sb.dbPath,
      (dbRo) => (!isPidAlive(hangPid) && getAttempts(dbRo, liveBoth.srB.stage_run_id)[0]?.status !== "running" ? true : null),
      { timeoutMs: 8000, pollMs: 50 }
    );
  });

  it("T4-05 [F10, F7, F6]: Wave 2 Gate 5 — paused_by_human sovereignty across double restarts", async () => {
    const sb = makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_MODE: "hang",
      },
    });
    const d1 = await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Gate5 Pause WS", "--domain", "mas"], {
      sandbox: sb,
    });
    const wsId = extractWorkspaceId(wsInit);

    const pkgDir = path.join(sb.root, "pkg-mas");
    const pkg = buildV2Package(pkgDir, {
      intent: "agent",
      id: "mas",
      specStrict: true,
      stages: [{ stage_id: "analysis", executor: "codex", model: "gpt-5-codex", role: "producer" }],
    });
    ensureAgentContributionHandler(pkg);
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "Double Restart Pause", "--goal", "Hold"],
      { sandbox: sb }
    );
    const taskId = trackTaskForCleanup(sb, extractTaskId(startRes));

    const running = await waitForDbState(
      sb.dbPath,
      (db) => {
        const stages = getStageRuns(db, taskId);
        if (stages.length === 0) return null;
        const att = getAttempts(db, stages[0].stage_run_id)[0];
        return att?.status === "running" && Number(att.local_pid) > 0 ? { sr: stages[0], att } : null;
      },
      { timeoutMs: 8000, pollMs: 50 }
    );

    await runCliJson(["runway", "pause", taskId, "--reason", "manual gate review"], { sandbox: sb });

    const dbPaused = openTrackedDb(sb.dbPath, { readOnly: true });
    assertTaskStatus(dbPaused, taskId, "paused_by_human");
    assertStageRunStatus(dbPaused, running.sr.stage_run_id, "paused_by_human");
    const attemptsAtPause = getAttempts(dbPaused, running.sr.stage_run_id).length;
    dbPaused.close();

    const st0 = await runCliExpectCode(["runway", "status", taskId, "--json"], 4, { sandbox: sb });
    assert.equal(st0.json?.status ?? st0.json?.task?.status, "paused_by_human");

    // Crash/Restart Cycle 1
    await sb.killDaemon({ signal: "SIGKILL" });
    const d2 = await sb.startDaemon({ excludePid: d1.pid });
    await new Promise((r) => setTimeout(r, 600));

    const dbAfter1 = openTrackedDb(sb.dbPath, { readOnly: true });
    assertPausedByHumanSovereignty(dbAfter1, taskId, { [running.sr.stage_run_id]: attemptsAtPause });
    dbAfter1.close();
    const st1 = await runCliExpectCode(["runway", "status", taskId, "--json"], 4, { sandbox: sb });
    assert.equal(st1.json?.status ?? st1.json?.task?.status, "paused_by_human");

    // Crash/Restart Cycle 2
    await sb.killDaemon({ signal: "SIGKILL" });
    await sb.startDaemon({ excludePid: d2.pid });
    await new Promise((r) => setTimeout(r, 600));

    const dbAfter2 = openTrackedDb(sb.dbPath, { readOnly: true });
    assertPausedByHumanSovereignty(dbAfter2, taskId, { [running.sr.stage_run_id]: attemptsAtPause });
    dbAfter2.close();
    const st2 = await runCliExpectCode(["runway", "status", taskId, "--json"], 4, { sandbox: sb });
    assert.equal(st2.json?.status ?? st2.json?.task?.status, "paused_by_human");

    // Explicit human resume transitions out of paused_by_human
    await runCliJson(["runway", "resume", taskId], { sandbox: sb });
    const resumed = await waitForDbState(
      sb.dbPath,
      (db) => {
        const t = getTask(db, taskId);
        return t && t.status !== "paused_by_human" ? t : null;
      },
      { timeoutMs: 8000, pollMs: 80 }
    );
    assert.notEqual(resumed.status, "paused_by_human");

    await runCliExpectCode(["runway", "cancel", taskId, "--reason", "gate5 cleanup", "--json"], 0, { sandbox: sb });
  });

  it("T4-06 [F9, F11, F12, F10]: Wave 2 Gate 6 — Multi-engine cross-stage relay (antigravity <-> codex -> reviewer --mode plan --sandbox)", async () => {
    const sb = makeSandbox({
      stubEnv: {
        OPL_STUB_DEFAULT_ARTIFACT: "0",
      },
    });
    const rulesPath = createRulesFile(sb, [
      {
        tool: "agy",
        subcommand: "print",
        once: true,
        config: {
          mode: "success",
          artifacts: [{ path: "analysis/plan.md", content: "# Stage 1 Plan\nCompute figures/fig1.svg\n" }],
          response_text: "Stage 1 complete: wrote analysis/plan.md",
        },
      },
      {
        tool: "codex",
        subcommand: "exec",
        once: true,
        config: {
          mode: "success",
          artifacts: [{ path: "figures/fig1.svg", content: "<svg xmlns='http://www.w3.org/2000/svg'/>\n" }],
          response_text: "Stage 2 complete: wrote figures/fig1.svg",
        },
      },
      {
        tool: "agy",
        subcommand: "print",
        once: true,
        config: {
          mode: "read_only_check",
          artifacts: [],
          response_text: "Stage 3 reviewer verified artifacts read-only",
        },
      },
    ]);
    await sb.startDaemon({ env: { OPL_STUB_RULES_FILE: rulesPath } });

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Gate6 Relay WS", "--domain", "mas"], {
      sandbox: sb,
    });
    const wsId = extractWorkspaceId(wsInit);

    const extVault = buildObsidianVaultDir(path.join(sb.root, "gate6-vault"));
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

    const pkgDir = path.join(sb.root, "pkg-mas-relay");
    const pkg = buildV2Package(pkgDir, {
      intent: "agent",
      id: "mas",
      specStrict: true,
      stages: [
        { stage_id: "plan", executor: "antigravity", model: "gemini-4-neon-high", role: "producer" },
        { stage_id: "render", executor: "codex", model: "gpt-5-codex", role: "producer" },
        { stage_id: "review", executor: "antigravity", model: "gemini-4-neon-xhigh", role: "reviewer" },
      ],
    });
    ensureAgentContributionHandler(pkg);
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });

    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    appRpc.drainEvents();

    const startRes = await runCliJson(
      ["runway", "start", "--workspace", wsId, "--agent", "mas", "--title", "3-Stage Relay", "--goal", "Plan render review"],
      { sandbox: sb }
    );
    const taskId = trackTaskForCleanup(sb, extractTaskId(startRes));

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

    assert.equal(done.stages[0].executor_id, "antigravity");
    assert.equal(done.stages[1].executor_id, "codex");
    assert.equal(done.stages[2].executor_id, "antigravity");

    const agyInvs = readStubLogs(sb, "agy").filter((e) => e.event === "invocation" && e.subcommand === "print");
    const codexInvs = readStubLogs(sb, "codex").filter((e) => e.event === "invocation" && e.subcommand === "exec");
    assert.equal(agyInvs.length, 2, `Expected 2 agy invocations, got ${agyInvs.length}`);
    assert.equal(codexInvs.length, 1, `Expected 1 codex invocation, got ${codexInvs.length}`);

    assert.equal(agyInvs[0].parsed.model, "gemini-4-neon-high");
    assert.equal(agyInvs[0].parsed.mode, "accept-edits");

    const codexPayload = `${JSON.stringify(codexInvs[0].argv)} ${codexInvs[0].stdin_preview || ""}`;
    assert.equal(
      codexPayload.includes(agyInvs[0].convId),
      false,
      `Stage 2 codex must NOT receive Stage 1 antigravity session ref (${agyInvs[0].convId})`
    );
    assert.ok(
      codexPayload.includes("analysis/plan.md"),
      `Stage 2 codex prompt must receive Stage 1 artifact ref analysis/plan.md: ${codexPayload}`
    );

    assert.equal(agyInvs[1].parsed.mode, "plan");
    assert.equal(agyInvs[1].parsed.sandbox, true);
    assert.equal(agyInvs[1].parsed.effort, "xhigh");
    assert.equal(agyInvs[1].mode, "read_only_check");

    assert.equal(fs.existsSync(path.join(sb.workspaceDir, "analysis/plan.md")), true);
    assert.equal(fs.existsSync(path.join(sb.workspaceDir, "figures/fig1.svg")), true);

    const verifyOk = await runCliJson(["ledger", "verify", taskId], { sandbox: sb });
    assert.equal(verifyOk.ok, true);
    assert.equal(verifyOk.open_blocking_debts, 0);
    assert.equal(verifyOk.artifact_hash_mismatches.length, 0);

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    assertLedgerRefsOnly(db, taskId);
    db.close();
    assertNoRawKnowledgeContentInDb(sb.dbPath, extVault.canaryStrings);

    // 1-byte tamper in figures/fig1.svg -> opl ledger verify exits 1
    fs.appendFileSync(path.join(sb.workspaceDir, "figures/fig1.svg"), " ", "utf8");
    const verifyTampered = await runCliExpectCode(["ledger", "verify", taskId, "--json"], 1, { sandbox: sb });
    assert.equal(verifyTampered.json?.ok, false);
    assert.ok(
      verifyTampered.json?.artifact_hash_mismatches?.some((m) => m.reason === "hash_mismatch"),
      `Expected hash_mismatch after 1-byte artifact tamper, got: ${JSON.stringify(verifyTampered.json)}`
    );
  });

  it("T4-07 [F13, F5, F6]: Wave 2 Gate 7 — Tier 3 MCP App sandbox Connect & Workspace loopback", async () => {
    const sb = makeSandbox();
    const providerLogPath = path.join(sb.stubLogDir, "mcp-provider.jsonl");
    sb.env.OPL_CONNECT_PROVIDER_LOG = providerLogPath;
    await sb.startDaemon({ env: { OPL_CONNECT_PROVIDER_LOG: providerLogPath } });

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Gate7 MCP WS"], { sandbox: sb });
    const wsId = extractWorkspaceId(wsInit);
    const notesDir = path.join(sb.workspaceDir, "notes");
    fs.mkdirSync(notesDir, { recursive: true });
    fs.writeFileSync(path.join(notesDir, "inbox-summary.md"), "# Inbox Summary\nUrgent MACE review.\n", "utf8");

    const pkg = buildV2Package(path.join(sb.root, "opl-relay"), {
      intent: "app",
      id: "opl-relay",
      specStrict: true,
    });
    instrumentRedactedProvider(pkg, providerLogPath);
    await runCliOk(["pack", "link", pkg.dir], { sandbox: sb });

    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const iframeRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "external" }));

    const canarySecret = "t407_mcp_app_canary_secret";
    await appRpc.call("connect.add", {
      connection_id: "conn-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Relay Mailbox",
      account_label: "mcp@lab",
      secret: canarySecret,
    });

    const issued = await appRpc.call("connect.issueConsumerBindToken", {
      consumer_package_id: "opl-relay",
      session_id: iframeRpc.handshakeResult.session_id,
    });
    const bindToken = issued.token ?? issued.consumer_bind_token ?? issued.consumerBindToken;
    assert.match(String(bindToken), /^oplcbt1\./);

    // Pre-approval invoke fails closed; iframe cannot self-approve
    await assertRpcError(
      () =>
        iframeRpc.call("connect.invoke", {
          consumer_bind_token: bindToken,
          connection_id: "conn-mail",
          capability_id: "mailbox.search",
          input: { q: "mace" },
        }),
      -32003,
      /GRANT_NOT_ACTIVE|grant_not_active|grant_not_found|grant_missing_or_stale/i
    );

    appRpc.drainEvents();
    const req = await iframeRpc.call("connect.requestAccess", {
      consumer_bind_token: bindToken,
      consumer_package_id: "opl-relay",
      connection_id: "conn-mail",
      capability_ids: ["mailbox.search"],
    });
    const requestId = req.request_id ?? req.grant_id ?? req.requestId ?? req.grantId;
    assert.ok(requestId);

    await assertRpcError(
      () => iframeRpc.call("connect.approveRequest", { request_id: requestId }),
      -32003,
      /TRUSTED_HOST_REQUIRED/i
    );

    await appRpc.waitForEvent("event.connect.changed", { timeoutMs: 3000, consume: true });
    await appRpc.call("connect.approveRequest", { request_id: requestId });
    const grantedEv = await appRpc.waitForEvent("event.connect.changed", { timeoutMs: 3000, consume: true });
    assert.match(JSON.stringify(grantedEv.params), /granted|grant_approved/i);

    const invoked = await iframeRpc.call("connect.invoke", {
      consumer_bind_token: bindToken,
      connection_id: "conn-mail",
      capability_id: "mailbox.search",
      input: { q: "mace" },
    });
    assert.equal(invoked.disposition, "completed");
    assert.equal(JSON.stringify(invoked).includes(canarySecret), false);
    assert.equal(readProviderDispatchCount(providerLogPath), 1);

    const readRes = await iframeRpc.call("app.contribution.read", {
      package_id: "opl-relay",
      ref: "workspace.read",
      consumer_bind_token: bindToken,
      input: {
        workspace_id: wsId,
        path: "notes/inbox-summary.md",
      },
    });
    assert.match(JSON.stringify(readRes), /Urgent MACE review\./);

    const appState = await appRpc.call("app.state.get", { profile: "fast" });
    assert.equal(JSON.stringify(appState).includes(canarySecret), false);

    const db = openTrackedDb(sb.dbPath, { readOnly: true });
    assertNoPlaintextSecrets(db, [canarySecret]);
    db.close();

    if (!IS_PRE_M4 || fs.existsSync(path.join(MCP_APP_SHARED_DIR, "package.json"))) {
      const ui = await loadMcpAppSharedExports(MCP_APP_SHARED_DIR);
      assert.equal(typeof ui.renderOwnerView, "function");
      assert.equal(typeof ui.parseTrajectorySnapshot, "function");
      const html = ui.renderOwnerView(
        { view_type: "timeline" },
        { title: "MCP Gate7", events: [{ kind: "artifact_ref", title: "opl-relay", summary: "ok", occurred_at: "2026-11-25T00:00:00Z" }] }
      );
      assert.match(html, /MCP Gate7/);
    }
  });

  it("T4-08 [F14, F2, F6, F9, F12]: Wave 3 Gate — opl-foundry dynamic CLI + pure-stdlib Python OplClient E2E", async () => {
    assert.equal(fs.existsSync(FOUNDRY_DIR), true, `Expected extensions/foundry at ${FOUNDRY_DIR}`);
    assert.equal(fs.existsSync(PYTHON_CLIENT_DIR), true, `Expected sdks/python-client at ${PYTHON_CLIENT_DIR}`);

    const sb = makeSandbox();
    await sb.startDaemon();

    await runCliExpectCode(["foundry", "--help"], 2, { sandbox: sb });

    const stagedFoundry = path.join(sb.root, "foundry-stage");
    copyDirClean(FOUNDRY_DIR, stagedFoundry);
    await runCliJson(["pack", "build", stagedFoundry], { sandbox: sb });
    const foundryArchive = createLocalPackageArchive(stagedFoundry, path.join(sb.root, "foundry-dist"), {
      includeLockFile: true,
    });
    await runCliJson(["pack", "install", foundryArchive.archivePath], { sandbox: sb });

    const helpAfter = await runCliOk(["--help"], { sandbox: sb });
    assert.match(helpAfter.stdout, /\bfoundry\b/);
    const foundryHelp = await runCliOk(["foundry", "--help"], { sandbox: sb });
    assert.match(foundryHelp.stdout, /\binit\b/);
    assert.match(foundryHelp.stdout, /\bvalidate\b/);

    const dbFoundry = openTrackedDb(sb.dbPath, { readOnly: true });
    const foundryPkg = getInstalledPackage(dbFoundry, "opl-foundry");
    assert.ok(foundryPkg);
    assert.equal(foundryPkg.intent, "extension");
    dbFoundry.close();

    const scaffoldDir = path.join(sb.root, "my-foundry-agent");
    const initRes = await runCliJson(["foundry", "init", scaffoldDir, "--id=my-foundry-agent"], { sandbox: sb });
    assert.equal(initRes.ok, true);
    const valRes = await runCliJson(["foundry", "validate", scaffoldDir], { sandbox: sb });
    assert.equal(valRes.ok, true);

    await runCliJson(["pack", "build", scaffoldDir], { sandbox: sb });
    const lockA = JSON.parse(fs.readFileSync(path.join(scaffoldDir, "opl-release.lock.json"), "utf8"));
    await runCliJson(["pack", "build", scaffoldDir], { sandbox: sb });
    const lockB = JSON.parse(fs.readFileSync(path.join(scaffoldDir, "opl-release.lock.json"), "utf8"));
    assert.equal(lockA.canonicalization, "ordered_path_length_file_length_bytes");
    assert.equal(lockA.digest, lockB.digest);

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Gate8 Python WS"], { sandbox: sb });
    const wsId = extractWorkspaceId(wsInit);
    const extVault = buildObsidianVaultDir(path.join(sb.root, "gate8-vault"));
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

    const pair = buildConnectPair(path.join(sb.root, "py-connect"), { specStrict: true });
    instrumentRedactedProvider(pair.provider);
    ensureAgentContributionHandler(pair.consumer);
    await runCliOk(["pack", "link", pair.providerDir], { sandbox: sb });
    await runCliOk(["pack", "link", pair.consumerDir], { sandbox: sb });

    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const pyCanarySecret = "t408_py_secret_never_leak";
    await appRpc.call("connect.add", {
      connection_id: "conn-py-mail",
      provider_type: "opl-relay.mailbox",
      display_name: "Python Relay Mail",
      account_label: "py@lab",
      secret: pyCanarySecret,
    });
    const req = await appRpc.call("connect.requestAccess", {
      consumer_package_id: "mas",
      connection_id: "conn-py-mail",
      capability_ids: ["mailbox.read"],
    });
    const requestId = req.request_id ?? req.requestId ?? req.grants?.[0]?.grant_id;
    await appRpc.call("connect.approveRequest", { request_id: requestId });

    const createdTask = await appRpc.call("runway.task.create", {
      workspace_id: wsId,
      agent_id: "mas",
      title: "Gate8 Python Task",
      goal_prompt: "Python E2E verification",
    });
    const taskId = extractTaskId(createdTask);

    const pyScript = `
import json
from opl_client import OplClient, OplRpcError

with OplClient(session_file=${JSON.stringify(sb.sessionPath)}, client_kind="sdk_python") as cli:
    snap = cli.knowledge_snapshot(${JSON.stringify(wsId)}, "sr-gate8-py")
    assert ${JSON.stringify(extVault.digests["notes/protocol.md"])} in json.dumps(snap)

    cli.append_ledger(${JSON.stringify(taskId)}, "artifact_ref", "mas", {"path": "out/py-report.md", "sha256": "${"b".repeat(64)}"})
    cli.append_ledger(${JSON.stringify(taskId)}, "quality_debt", "mas", {"debt_id": "py-debt-1", "code": "needs_review", "blocks_submission": False})
    events = cli.drain_events()
    ledger_evs = [e for e in events if e.get("method") == "event.ledger.appended"]
    assert len(ledger_evs) >= 2, f"Expected >=2 event.ledger.appended notifications, got {events}"

    tl = cli.ledger_timeline(${JSON.stringify(taskId)})
    entries = tl if isinstance(tl, list) else tl.get("entries", tl.get("items", []))
    assert len(entries) == 2

    priv_denied = False
    try:
        cli.call("connect.approveRequest", {"request_id": "req-x"})
    except OplRpcError as exc:
        priv_denied = (exc.code == -32003)
    assert priv_denied, "Expected sdk_python connect.approveRequest to reject with -32003"
    print(json.dumps({"ok": True, "session_id": cli.server_info["session_id"], "events": len(ledger_evs)}))
`;
    const pyOut = JSON.parse(runPythonScript(sb, pyScript).stdout.trim());
    assert.equal(pyOut.ok, true);

    const tokRes = await appRpc.call("connect.issueConsumerBindToken", {
      consumer_package_id: "mas",
      session_id: pyOut.session_id,
    });
    assert.ok(tokRes.consumer_bind_token ?? tokRes.token);

    const dbCheck = openTrackedDb(sb.dbPath, { readOnly: true });
    assertLedgerRefsOnly(dbCheck, taskId, [pyCanarySecret]);
    assertNoPlaintextSecrets(dbCheck, [pyCanarySecret]);
    dbCheck.close();
    assertNoRawKnowledgeContentInDb(sb.dbPath, extVault.canaryStrings);

    const pyAudit = auditPythonStdlibAndBudget(PYTHON_CLIENT_DIR, { maxLines: 1500 });
    assert.equal(pyAudit.ok, true, `Python stdlib/budget audit failed: ${JSON.stringify(pyAudit.violations)}`);
    assert.ok(pyAudit.lineCount > 0 && pyAudit.lineCount < 1500);
    assert.equal(pyAudit.nonStdlibImports.length, 0);
  });

  it("T4-09 [F4, F2, F3]: Wave 3 Gate — 8-repo migrate-v1 + build + dual-host Codex/App sync parity", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const all8 = buildAll8Wave3Fixtures(path.join(sb.root, "wave3-8"));
    const repoNames = Object.keys(WAVE3_DOMAIN_PRESETS);
    assert.equal(repoNames.length, 8);

    const expectedIntentById = {
      mas: "agent",
      mag: "agent",
      rca: "agent",
      obf: "agent",
      occ: "agent",
      "opl-relay": "app",
      "opl-persona": "extension",
      "opl-channel-weixin": "channel",
    };

    for (const key of repoNames) {
      const fx = all8[key];
      const preset = WAVE3_DOMAIN_PRESETS[key];
      const expectedId = preset.packageId;
      const expectedIntent = expectedIntentById[expectedId];
      await runCliJson(["pack", "migrate-v1", fx.dir], { sandbox: sb });

      const v2 = JSON.parse(fs.readFileSync(path.join(fx.dir, "opl-package.json"), "utf8"));
      assert.equal(v2.schema_version, "opl.package.v2");
      assert.equal(v2.identity.id, expectedId);
      assert.equal(v2.identity.intent, expectedIntent);
      const expectedPluginNames = new Set([preset.pluginName, preset.carrierSlug].filter(Boolean));
      assert.equal(
        expectedPluginNames.has(v2.host_hints?.codex?.plugin_name),
        true,
        `Expected host_hints.codex.plugin_name in ${JSON.stringify([...expectedPluginNames])}, got ${v2.host_hints?.codex?.plugin_name}`
      );
      assert.equal(fs.existsSync(path.join(fx.dir, "plugins", preset.pluginName)), false);
      for (const extra of preset.extraMirrorDirs || []) {
        assert.equal(fs.existsSync(path.join(fx.dir, extra)), false, `Expected mirror dir ${extra} removed`);
      }
      assert.equal(fs.existsSync(path.join(fx.dir, ".codex-plugin/plugin.json")), false);
      assert.equal(fs.existsSync(path.join(fx.dir, "contracts/carrier_projection.json")), false);

      await runCliJson(["pack", "build", fx.dir], { sandbox: sb });
      const lock = JSON.parse(fs.readFileSync(path.join(fx.dir, "opl-release.lock.json"), "utf8"));
      assert.equal(lock.algorithm, "sha256");
      assert.equal(lock.canonicalization, "ordered_path_length_file_length_bytes");

      await runCliJson(["pack", "link", fx.dir], { sandbox: sb });
    }

    await runCliJson(["pack", "sync", "codex"], { sandbox: sb });
    const listRes = await runCliJson(["pack", "list"], { sandbox: sb });
    const listed = Array.isArray(listRes) ? listRes : listRes.packages ?? listRes.items ?? [];

    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const appState = await appRpc.call("app.state.get", { profile: "fast" });
    const appStateStr = JSON.stringify(appState);

    for (const key of repoNames) {
      const preset = WAVE3_DOMAIN_PRESETS[key];
      const expectedId = preset.packageId;
      const v2 = JSON.parse(fs.readFileSync(path.join(all8[key].dir, "opl-package.json"), "utf8"));
      const effectivePluginName = v2.host_hints?.codex?.plugin_name || preset.pluginName;
      const pkgRow = listed.find((p) => (p.package_id ?? p.id) === expectedId);
      assert.ok(pkgRow, `Expected ${expectedId} in opl pack list`);
      assert.ok(appStateStr.includes(expectedId), `Expected ${expectedId} in app.state.get`);

      const proj = readCodexMarketplaceProjection(sb.oplHome, effectivePluginName);
      if (v2.host_hints?.codex?.sync_enabled === false || expectedId === "opl-channel-weixin") {
        assert.equal(fs.existsSync(proj.pluginDir), false, `${expectedId} (sync_enabled=false) must NOT project to Codex`);
      } else {
        assert.ok(proj.pluginJson, `Expected Codex plugin.json for ${expectedId}`);
        assert.equal(proj.pluginJson.name, effectivePluginName);
        assertCodexPluginPayload(proj, all8[key].dir);
      }
    }

    const codexLogs = readStubLogs(sb, "codex");
    assert.ok(codexLogs.some((ev) => ev.event === "invocation" && ev.subcommand === "app_server"));
  });

  it("T4-10 [F15, F7, F6, F3]: Wave 3 Gate — Clean environment, process, CLI & dual-host hygiene", async () => {
    const sb = makeSandbox();
    const d1 = await sb.startDaemon();

    const liveProcs = sb.findLiveProcesses();
    const procAudit = auditProcessHygiene({
      psRows: IS_PRE_M4 ? liveProcs : undefined,
      sandboxLiveProcs: liveProcs,
      expectedOpldCount: 1,
    });
    assert.equal(procAudit.ok, true, `Process hygiene violations: ${JSON.stringify(procAudit.violations)}`);
    assert.equal(procAudit.opldCount, 1);
    assert.equal(procAudit.temporalProcesses.length, 0);
    assert.ok(liveProcs.some((p) => p.pid === d1.pid));

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

    const help = await runCliOk(["--help"], { sandbox: sb });
    assertCoreCliHelp(help.stdout);

    const legacyCmds = [
      ["app", "state", "--json"],
      ["agents", "modules"],
      ["agents", "list"],
      ["system", "diagnose"],
      ["system", "initialize"],
      ["vault", "list"],
      ["runtime", "status"],
      ["brand-modules", "list"],
      ["framework", "locate"],
      ["knowledge", "list"],
      ["stages", "list"],
      ["cordis", "status"],
      ["okf", "status"],
      ["domain-memory", "list"],
      ["work-order", "list"],
      ["agent-lab", "list"],
      ["foundry-lab", "list"],
      ["scholar-skills", "list"],
      ["profiles", "list"],
      ["sources", "check"],
    ];
    for (const cmd of legacyCmds) {
      await runCliExpectCode(cmd, 2, { sandbox: sb });
    }
    const codexExecs = readStubLogs(sb, "codex").filter((e) => e.subcommand === "exec");
    assert.equal(codexExecs.length, 0, "Legacy commands must never spawn codex exec");

    const masPkg = ensureAgentContributionHandler(
      buildV2Package(path.join(sb.root, "hygiene-mas"), {
        intent: "agent",
        id: "mas",
        pluginName: "med-autoscience",
        specStrict: true,
      })
    );
    const magPkg = ensureAgentContributionHandler(
      buildV2Package(path.join(sb.root, "hygiene-mag"), {
        intent: "agent",
        id: "mag",
        pluginName: "med-autogrant",
        specStrict: true,
      })
    );
    const relayPkg = buildV2Package(path.join(sb.root, "hygiene-relay"), {
      intent: "app",
      id: "opl-relay",
      pluginName: "opl-relay",
      specStrict: true,
    });
    await runCliOk(["pack", "link", masPkg.dir], { sandbox: sb });
    await runCliOk(["pack", "link", magPkg.dir], { sandbox: sb });
    await runCliOk(["pack", "link", relayPkg.dir], { sandbox: sb });
    await runCliJson(["pack", "sync", "codex"], { sandbox: sb });

    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    let fastSample = null;
    let stats = null;
    if (!IS_PRE_M4 || fs.existsSync(path.join(BRIDGE_DIR, "src/index.mjs"))) {
      const mod = await loadBridgeModule();
      const bridge = trackBridge(new mod.OplFrameworkBridge({ workspaceRoot: sb.workspaceDir, env: sb.env }));
      await bridge.start();
      stats = await measureLatencyMs(() => bridge.opl.readState("fast"), { iterations: 100, warmup: 5 });
      fastSample = await bridge.opl.readState("fast");
    } else {
      stats = await measureLatencyMs(() => appRpc.call("app.state.get", { profile: "fast" }), { iterations: 100, warmup: 5 });
      fastSample = await appRpc.call("app.state.get", { profile: "fast" });
    }
    assert.ok(stats.p99 < 20, `Expected app.state.get('fast') P99 < 20ms, got ${stats.p99.toFixed(3)}ms`);

    const fastSerialized = JSON.stringify(fastSample);
    for (const [pkgId, pluginName] of [
      ["mas", "med-autoscience"],
      ["mag", "med-autogrant"],
      ["opl-relay", "opl-relay"],
    ]) {
      assert.ok(fastSerialized.includes(pkgId), `Expected ${pkgId} in app.state.get`);
      const proj = readCodexMarketplaceProjection(sb.oplHome, pluginName);
      assert.ok(proj.pluginJson, `Expected ${pluginName} in Codex marketplace projection`);
    }
  });

  it("T4-11 [F10, F6]: Persistent Cron wake-from-sleep & overlap policy matrix (skip, buffer_one, cancel_other)", async () => {
    const sb = makeSandbox({
      stubEnv: {
        OPL_STUB_CODEX_MODE: "hang",
      },
    });
    await sb.startDaemon();

    const pkgDir = path.join(sb.root, "pkg-mas");
    const pkg = buildV2Package(pkgDir, {
      intent: "agent",
      id: "mas",
      specStrict: true,
      stages: [{ stage_id: "analysis", executor: "codex", model: "gpt-5-codex", role: "producer" }],
    });
    ensureAgentContributionHandler(pkg);
    await runCliOk(["pack", "link", pkgDir], { sandbox: sb });

    const appRpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));

    // Phase A: skip while task-cron-active is active
    const dbSeed = openTrackedDb(sb.dbPath);
    seedWakeFromSleepSchedules(dbSeed, {
      workspaceRoot: sb.workspaceDir,
      pastIso: "2026-01-01T00:00:00Z",
      enabledScheduleIds: ["sch-skip"],
    });
    dbSeed.close();

    await waitForDbState(
      sb.dbPath,
      (dbRo) => {
        const s = getSchedule(dbRo, "sch-skip");
        return s && Date.parse(s.next_run_at) > Date.now() ? s : null;
      },
      { timeoutMs: 8000, pollMs: 100 }
    );
    await new Promise((r) => setTimeout(r, 1500));

    const dbAfterSkip = openTrackedDb(sb.dbPath, { readOnly: true });
    assert.equal(countTasks(dbAfterSkip, "ws-cron"), 1, "skip must spawn 0 tasks while prior task is active");
    dbAfterSkip.close();

    // Phase B: buffer_one caps missed-sleep catch-up without avalanche
    const dbB = openTrackedDb(sb.dbPath);
    txImmediate(dbB, () => {
      dbB.prepare("UPDATE schedules SET enabled = CASE WHEN schedule_id = 'sch-buffer' THEN 1 ELSE 0 END").run();
    });
    dbB.close();

    await waitForDbState(
      sb.dbPath,
      (dbRo) => {
        const s = getSchedule(dbRo, "sch-buffer");
        return s && Date.parse(s.next_run_at) > Date.now() ? s : null;
      },
      { timeoutMs: 8000, pollMs: 100 }
    );
    await new Promise((r) => setTimeout(r, 1500));

    const dbAfterBuffer = openTrackedDb(sb.dbPath, { readOnly: true });
    const countAfterBuffer = countTasks(dbAfterBuffer, "ws-cron");
    assert.ok(countAfterBuffer <= 2, `buffer_one must cap catch-up to <= 1 extra task, got total ${countAfterBuffer}`);
    dbAfterBuffer.close();

    // Phase C: cancel_other cancels active task, launches 1 replacement, emits event.runway.changed
    appRpc.drainEvents("event.runway.*");
    const dbC = openTrackedDb(sb.dbPath);
    txImmediate(dbC, () => {
      dbC.prepare("UPDATE schedules SET enabled = CASE WHEN schedule_id = 'sch-cancel' THEN 1 ELSE 0 END").run();
    });
    dbC.close();

    const cancelFired = await waitForDbState(
      sb.dbPath,
      (dbRo) => {
        const active = getTask(dbRo, "task-cron-active");
        const s = getSchedule(dbRo, "sch-cancel");
        if (active?.status !== "cancelled") return null;
        if (!s || !s.last_task_id || s.last_task_id === "task-cron-active") return null;
        if (!(Date.parse(s.next_run_at) > Date.now())) return null;
        return { active, s };
      },
      { timeoutMs: 8000, pollMs: 100 }
    );
    await new Promise((r) => setTimeout(r, 1500));

    const dbAfterCancel = openTrackedDb(sb.dbPath, { readOnly: true });
    const totalAfterCancel = countTasks(dbAfterCancel, "ws-cron");
    assert.equal(totalAfterCancel, countAfterBuffer + 1, "cancel_other must launch exactly 1 replacement task");
    assert.ok(getTask(dbAfterCancel, cancelFired.s.last_task_id));
    const remainingActive = dbAfterCancel
      .prepare("SELECT task_id FROM tasks WHERE workspace_id = 'ws-cron' AND status = 'active'")
      .all();
    dbAfterCancel.close();

    assert.ok(
      appRpc.peekEvents("event.runway.*").some((ev) => ev.method === "event.runway.changed"),
      "Expected event.runway.changed Server-Push during cancel_other cron execution"
    );

    for (const row of remainingActive) {
      await runCliExpectCode(["runway", "cancel", row.task_id, "--reason", "t411 cleanup", "--json"], 0, { sandbox: sb });
    }
  });

  it("T4-12 [F9, F1, F15]: Workspace conditional writeback (REVISION_CONFLICT vs fresh commit) & red-line budget/boundary audit", async () => {
    const sb = makeSandbox();
    await sb.startDaemon();

    const wsInit = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "Gate12 Writeback WS"], {
      sandbox: sb,
    });
    const wsId = extractWorkspaceId(wsInit);
    const extVault = buildObsidianVaultDir(path.join(sb.root, "gate12-vault"));
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

    assertNoRawKnowledgeContentInDb(sb.dbPath, extVault.canaryStrings);

    const db0 = openTrackedDb(sb.dbPath, { readOnly: true });
    const rev0 = getKnowledgeSource(db0, sourceId)?.accepted_revision ?? addVault.accepted_revision ?? "1";
    db0.close();

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));

    // Stale proposal captured at rev0
    const staleProp = await rpc.call("workspace.writeback.propose", {
      workspace_id: wsId,
      source_id: sourceId,
      target_path: "notes/protocol.md",
      content: "STALE_OVERWRITE_T412",
      accepted_revision: rev0,
    });

    // Competing fresh commit bumps revision to rev1
    const rev1Content = "# Study Protocol rev1\nWinning concurrent commit.\n";
    const winProp = await rpc.call("workspace.writeback.propose", {
      workspace_id: wsId,
      source_id: sourceId,
      target_path: "notes/protocol.md",
      content: rev1Content,
      accepted_revision: rev0,
    });
    await rpc.call("workspace.writeback.commit", {
      ...(winProp.proposal_id ? { proposal_id: winProp.proposal_id } : {}),
      workspace_id: wsId,
      source_id: sourceId,
      target_path: "notes/protocol.md",
      content: rev1Content,
      accepted_revision: rev0,
    });

    const db1 = openTrackedDb(sb.dbPath, { readOnly: true });
    const rev1 = getKnowledgeSource(db1, sourceId)?.accepted_revision;
    db1.close();
    assert.notEqual(rev1, rev0);

    // Stale commit using rev0 must fail -32009 REVISION_CONFLICT without overwriting disk file
    let conflictErr = null;
    try {
      await rpc.call("workspace.writeback.commit", {
        ...(staleProp.proposal_id ? { proposal_id: staleProp.proposal_id } : {}),
        workspace_id: wsId,
        source_id: sourceId,
        target_path: "notes/protocol.md",
        content: "STALE_OVERWRITE_T412",
        accepted_revision: rev0,
      });
    } catch (err) {
      conflictErr = err;
    }
    assert.ok(conflictErr, "Stale writeback commit must reject");
    assert.equal(conflictErr.code, -32009, `Expected -32009 REVISION_CONFLICT, got ${conflictErr.code}: ${conflictErr.message}`);
    assert.equal(fs.readFileSync(path.join(extVault.dir, "notes/protocol.md"), "utf8"), rev1Content);

    // Fresh propose+commit at rev1 succeeds -> rev2
    const rev2Content = "# Study Protocol rev2\nFresh writeback commit.\n";
    const freshProp = await rpc.call("workspace.writeback.propose", {
      workspace_id: wsId,
      source_id: sourceId,
      target_path: "notes/protocol.md",
      content: rev2Content,
      accepted_revision: rev1,
    });
    await rpc.call("workspace.writeback.commit", {
      ...(freshProp.proposal_id ? { proposal_id: freshProp.proposal_id } : {}),
      workspace_id: wsId,
      source_id: sourceId,
      target_path: "notes/protocol.md",
      content: rev2Content,
      accepted_revision: rev1,
    });
    assert.equal(fs.readFileSync(path.join(extVault.dir, "notes/protocol.md"), "utf8"), rev2Content);

    // Path-traversal writeback rejected without mutating outside file
    const outsideFile = path.join(sb.root, "outside-t412.md");
    fs.writeFileSync(outsideFile, "UNTOUCHED", "utf8");
    let travErr = null;
    try {
      const tp = await rpc.call("workspace.writeback.propose", {
        workspace_id: wsId,
        source_id: sourceId,
        target_path: "../outside-t412.md",
        content: "PWNED",
        accepted_revision: rev1,
      });
      await rpc.call("workspace.writeback.commit", {
        ...(tp.proposal_id ? { proposal_id: tp.proposal_id } : {}),
        workspace_id: wsId,
        source_id: sourceId,
        target_path: "../outside-t412.md",
        content: "PWNED",
        accepted_revision: rev1,
      });
    } catch (err) {
      travErr = err;
    }
    assert.ok(travErr, "Expected path-traversal writeback to fail closed");
    assert.equal(fs.readFileSync(outsideFile, "utf8"), "UNTOUCHED");

    // Red-line line budgets & protected boundaries audit
    const budgetAudit = auditLineBudgets({
      repoRoot: REPO_ROOT,
      bridgeDir: BRIDGE_DIR,
      pythonClientDir: PYTHON_CLIENT_DIR,
      requireCore: true,
      requirePythonClient: !IS_PRE_M4,
      requireBridge: !IS_PRE_M4,
    });
    assert.equal(budgetAudit.ok, true, `Line budget / import guard violations: ${JSON.stringify(budgetAudit.violations)}`);
    assert.ok(budgetAudit.coreLineCount > 0 && budgetAudit.coreLineCount < 3000);
    if (!IS_PRE_M4) {
      assert.ok(budgetAudit.pythonReport.lineCount > 0 && budgetAudit.pythonReport.lineCount < 1500);
    }

    const boundaryAudit = auditProtectedBoundaries({
      studioRoot: STUDIO_ROOT,
      appRoot: APP_ROOT,
      repoRoot: REPO_ROOT,
    });
    assert.equal(boundaryAudit.ok, true, `Protected boundary violations: ${JSON.stringify(boundaryAudit.violations)}`);
  });
});
