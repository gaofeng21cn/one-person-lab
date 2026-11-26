import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, it } from "node:test";

import { DEFAULT_REPO_ROOT, runCli, runCliJson, runCliOk } from "../lib/cli.mjs";
import { buildV2Package } from "../lib/fixtures.mjs";
import { RpcError, connectRpcClient } from "../lib/rpc-client.mjs";
import { createSandbox } from "../lib/sandbox.mjs";

const activeSandboxes = [];

function trackSandbox(opts = {}) {
  const sb = createSandbox(opts);
  activeSandboxes.push(sb);
  return sb;
}

afterEach(async () => {
  while (activeSandboxes.length > 0) {
    await activeSandboxes.pop().cleanup();
  }
});

describe("Tier 5 Partition 2: Adversarial CLI, Socket Framing, Auth & Extension Routing", () => {
  it("T5-P2-01 (Bug 1): opl --state-dir <custom> overrides OPL_STATE_DIR across daemon status and workspace/pack", async () => {
    const sb1 = trackSandbox();
    const sb2 = trackSandbox();
    await sb1.startDaemon();

    const status2 = await runCli(["--state-dir", sb2.stateDir, "daemon", "status", "--json"], { sandbox: sb1 });
    assert.equal(status2.code, 0);
    assert.equal(status2.json?.running, false);
    assert.equal(status2.json?.session_file, path.join(sb2.stateDir, "run", "opld.session.json"));

    const ws2 = await runCli(["--state-dir", sb2.stateDir, "workspace", "init", sb2.workspaceDir, "--name", "WS2", "--json"], {
      sandbox: sb1,
    });
    assert.equal(ws2.code, 0);
    assert.equal(fs.existsSync(sb2.sessionPath), true, "Custom --state-dir must auto-start opld in sb2");

    // Cleanly stop sb2's daemon via --state-dir
    const stop2 = await runCli(["--state-dir", sb2.stateDir, "daemon", "stop", "--json"], { sandbox: sb1 });
    assert.equal(stop2.code, 0);
  });

  it("T5-P2-02 (Bug 2): numeric CLI flags reject non-integer/out-of-range values with exit 2 INVALID_INPUT", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();

    const ws = await runCliJson(["workspace", "init", sb.workspaceDir, "--name", "T5-B2"], { sandbox: sb });
    const wsId = ws.workspace_id ?? ws.id;
    const rpc = await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" });
    const task = await rpc.call("runway.task.create", { workspace_id: wsId, title: "T", goal_prompt: "G" });
    const srId = task.stage_runs[0].stage_run_id;
    await rpc.close();

    const db = new DatabaseSync(sb.dbPath);
    db.prepare("UPDATE stage_runs SET status = 'human_gate', revision = 5 WHERE stage_run_id = ?").run(srId);
    db.close();

    const badRev = await runCli(["runway", "decide", srId, "--decision", "approve", "--expected-revision", "notanumber", "--json"], {
      sandbox: sb,
    });
    assert.equal(badRev.code, 2);
    assert.equal(badRev.json?.error?.code, "INVALID_INPUT");

    const dbCheck = new DatabaseSync(sb.dbPath, { readOnly: true });
    const srAfter = dbCheck.prepare("SELECT status, revision FROM stage_runs WHERE stage_run_id = ?").get(srId);
    dbCheck.close();
    assert.equal(srAfter.status, "human_gate");
    assert.equal(srAfter.revision, 5);

    const badLines = await runCli(["daemon", "logs", "--lines", "0", "--json"], { sandbox: sb });
    assert.equal(badLines.code, 2);
    assert.equal(badLines.json?.error?.code, "INVALID_INPUT");

    const badLimit = await runCli(["ledger", "timeline", task.task_id, "--limit", "abc", "--json"], { sandbox: sb });
    assert.equal(badLimit.code, 2);
    assert.equal(badLimit.json?.error?.code, "INVALID_INPUT");
  });

  it("T5-P2-03 (Bug 6): subcommand --help exits 0, malformed JSON exits 2, and unknown extension flags do not shift positionals", async () => {
    const sb = trackSandbox();
    const helpRes = await runCli(["pack", "link", "--help"], { sandbox: sb });
    assert.equal(helpRes.code, 0);
    assert.match(helpRes.stdout, /Usage: opl pack/);

    await sb.startDaemon();
    const badCaps = await runCli(
      ["connect", "add", "--provider-type", "github", "--display-name", "GH", "--capabilities", "{bad", "--json"],
      { sandbox: sb }
    );
    assert.equal(badCaps.code, 2);
    assert.equal(badCaps.json?.error?.code, "INVALID_INPUT");

    const foundrySrc = path.join(DEFAULT_REPO_ROOT, "extensions/foundry");
    await runCliOk(["pack", "link", foundrySrc, "--no-codex-sync"], { sandbox: sb });
    const pkgDir = buildV2Package(path.join(sb.root, "sample-ext-target"), { id: "sample-ext-target", intent: "agent", specStrict: true }).dir;
    const valRes = await runCli(["foundry", "validate", "--bogus-flag", "val1", pkgDir, "--json"], { sandbox: sb });
    assert.equal(valRes.code, 0, `Expected foundry validate with unknown flag to succeed, got:\n${valRes.stdout}\n${valRes.stderr}`);
    assert.equal(valRes.json?.ok, true);

    const p2Dir = path.join(sb.root, "p2-force-agent");
    fs.mkdirSync(p2Dir, { recursive: true });
    fs.writeFileSync(path.join(p2Dir, "opl-package.json"), JSON.stringify({ stale: true }), "utf8");
    const forceInitRes = await runCli(["foundry", "init", "--force", p2Dir, "--id", "p2-agent", "--json"], { sandbox: sb });
    assert.equal(
      forceInitRes.code,
      0,
      `Expected foundry init --force <dir> --id p2-agent to exit 0, got:\n${forceInitRes.stdout}\n${forceInitRes.stderr}`
    );
    assert.equal(forceInitRes.json?.ok, true);
    const createdManifest = JSON.parse(fs.readFileSync(path.join(p2Dir, "opl-package.json"), "utf8"));
    assert.equal(createdManifest.identity?.id, "p2-agent");
  });

  it("T5-P2-04 (Bug 3): external socket without consumerBindToken cannot forge connect.requestAccess", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();
    const app = await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" });
    const ext = await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "external" });

    const pkg = buildV2Package(path.join(sb.root, "victim"), { id: "victim", intent: "agent", specStrict: true });
    await app.call("pack.link", { dir: pkg.dir });
    await app.call("connect.add", {
      connection_id: "c1",
      provider_type: "github",
      display_name: "GH",
      secret: "tok-secret-12345",
      capabilities: [{ capability_id: "repo.read", title: "Read", risk: "read" }],
    });

    await assert.rejects(
      () => ext.call("connect.requestAccess", { consumer_package_id: "victim", connection_id: "c1", capability_ids: ["repo.read"] }),
      (err) => err instanceof RpcError && (err.code === -32001 || err.code === -32003)
    );
    await ext.close();
    await app.close();
  });

  it("T5-P2-05 (Bug 4): external socket cannot execute arbitrary contribution_handler via app.contribution.read", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();
    const app = await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" });
    const ext = await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "external" });

    const pkg = buildV2Package(path.join(sb.root, "contrib-app"), {
      id: "contrib-app",
      intent: "app",
      specStrict: true,
    });
    await app.call("pack.link", { dir: pkg.dir });

    await assert.rejects(
      () => ext.call("app.contribution.read", { package_id: "contrib-app", ref: "custom.read", input: {} }),
      (err) => err instanceof RpcError && (err.code === -32001 || err.code === -32003)
    );
    await ext.close();
    await app.close();
  });

  it("T5-P2-06: opld handles chunked partial NDJSON, pipelined requests, and rejects JSON-RPC batch arrays (-32600)", async () => {
    const sb = trackSandbox();
    await sb.startDaemon();
    const sess = JSON.parse(fs.readFileSync(sb.sessionPath, "utf8"));
    const frames = await new Promise((resolve, reject) => {
      const sock = net.createConnection(sess.socket_path);
      const collected = [];
      let buf = "";
      sock.setEncoding("utf8");
      sock.on("error", reject);
      sock.on("data", (c) => {
        buf += c;
        let idx;
        while ((idx = buf.indexOf("\n")) >= 0) {
          collected.push(JSON.parse(buf.slice(0, idx)));
          buf = buf.slice(idx + 1);
          if (collected.length === 3) {
            sock.destroy();
            resolve(collected);
          }
        }
      });
      sock.on("connect", () => {
        const hs = JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "daemon.handshake",
          params: { token: sess.token, client_kind: "opl_app", api_version: "2.0" },
        });
        const batch = JSON.stringify([{ jsonrpc: "2.0", id: 9, method: "daemon.health" }]);
        const ok = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "daemon.health", params: {} });
        sock.write(hs.slice(0, 20));
        setTimeout(() => sock.write(`${hs.slice(20)}\n${batch}\n${ok}\n`), 20);
      });
    });
    assert.equal(frames[0].id, 1);
    assert.equal(frames[0].result.ok, true);
    assert.equal(frames[1].error.code, -32600);
    assert.equal(frames[2].id, 2);
    assert.equal(frames[2].result.ok, true);
  });
});
