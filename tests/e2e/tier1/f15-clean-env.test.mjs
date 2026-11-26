import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runCliExpectCode, runCliOk } from "../lib/cli.mjs";
import {
  auditLegacyDemolition,
  auditLineBudgets,
  auditProcessHygiene,
  auditProtectedBoundaries,
  auditTemporalElimination,
} from "../lib/redline-audit.mjs";
import { connectRpcClient } from "../lib/rpc-client.mjs";
import { DEFAULT_WORKTREE_ROOT, createSandbox } from "../lib/sandbox.mjs";

const REPO_ROOT = path.resolve(process.env.OPL_E2E_REPO_ROOT || DEFAULT_WORKTREE_ROOT);
const STUDIO_ROOT = path.resolve(
  process.env.OPL_STUDIO_ROOT || "/Users/gaofeng/workspace/.worktrees/opl-studio-v2-bridge"
);
const BRIDGE_DIR = path.resolve(
  process.env.OPL_STUDIO_BRIDGE_DIR || path.join(STUDIO_ROOT, "plugins", "opl-framework-bridge")
);
const APP_ROOT = path.resolve(process.env.OPL_APP_ROOT || "/Users/gaofeng/workspace/one-person-lab-app");
const PYTHON_CLIENT_DIR = path.resolve(
  process.env.OPL_PYTHON_CLIENT_DIR || path.join(REPO_ROOT, "sdks", "python-client")
);
const IS_PRE_M4 = process.env.OPL_E2E_REPO_PHASE === "pre_m4";

const activeSandboxes = [];
const activeRpcClients = [];

function trackSandbox(opts = {}) {
  const sb = createSandbox(opts);
  activeSandboxes.push(sb);
  return sb;
}

function trackRpc(client) {
  activeRpcClients.push(client);
  return client;
}

const CORE_NAMESPACES = ["daemon", "workspace", "pack", "connect", "runway", "ledger"];

function countCoreCliSubcommands(helpStdout, ns) {
  const found = new Set();
  for (const line of helpStdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const listMatch = trimmed.match(new RegExp(`^(?:opl\\s+)?${ns}\\b\\s*(?::\\s*|\\s+)(.+)$`));
    if (listMatch) {
      const rest = listMatch[1].trim();
      if (/[·,|/]/.test(rest) || new RegExp(`^(?:opl\\s+)?${ns}\\s*:`).test(trimmed)) {
        for (const part of rest.split(/[·,|/]+|\s{2,}/)) {
          const word = part.trim().split(/\s+/)[0];
          if (word && /^[a-z][a-z0-9-]*$/.test(word) && word !== "help") found.add(word);
        }
      }
    }
    const single = trimmed.match(new RegExp(`^(?:opl\\s+)?${ns}\\s+([a-z][a-z0-9-]*)(?:$|\\s{2,}|\\s+[<\\[])`));
    if (single && single[1] !== "help") found.add(single[1]);
  }
  return found;
}

function extractNamespaceHelpCommands(nsStdout, ns) {
  const found = new Set();
  for (const line of nsStdout.split("\n")) {
    const explicit = line.trim().match(new RegExp(`^(?:opl\\s+)?${ns}\\s+([a-z][a-z0-9-]*)\\b`, "i"));
    if (explicit && explicit[1] !== "help") {
      found.add(explicit[1].toLowerCase());
      continue;
    }
    const col = line.match(/^\s{1,8}([a-z][a-z0-9-]*)(?:\s{2,}|\s+<|\s+\[|$)/);
    if (col && !["usage", "opl", "help", "options", "flags", "examples", "commands", "subcommands"].includes(col[1])) {
      found.add(col[1].toLowerCase());
    }
  }
  return found;
}

afterEach(async () => {
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

describe("Tier 1 — F15: Clean Environment & Architecture Red-Line Invariants", () => {
  it("T1-F15-01: clean sandbox runs exactly 1 opld process and 0 Temporal processes", async () => {
    const sb = trackSandbox();
    const d1 = await sb.startDaemon();

    const rpc = trackRpc(await connectRpcClient({ sessionPath: sb.sessionPath, clientKind: "opl_app" }));
    const health = await rpc.call("daemon.health", {});
    assert.ok(health && (health.ok === true || health.status === "ok" || health.status === "healthy"));

    const liveProcs = sb.findLiveProcesses();
    const audit = auditProcessHygiene({
      psRows: IS_PRE_M4 ? liveProcs : undefined,
      sandboxLiveProcs: liveProcs,
      expectedOpldCount: 1,
    });
    assert.equal(
      audit.ok,
      true,
      `Process hygiene violations: ${JSON.stringify(audit.violations)}`
    );
    assert.equal(audit.opldCount, 1);
    assert.equal(audit.temporalProcesses.length, 0);
    assert.ok(liveProcs.some((p) => p.pid === d1.pid), "Expected active sandbox opld PID in live processes");
  });

  it("T1-F15-02: Temporal elimination audit verifies zero @temporalio/*, vendor/temporal, Temporal files, or plists", () => {
    const launchAgentsDir = process.env.OPL_LAUNCH_AGENTS_DIR
      ? path.resolve(process.env.OPL_LAUNCH_AGENTS_DIR)
      : process.platform === "darwin"
        ? path.join(os.homedir(), "Library", "LaunchAgents")
        : null;

    const audit = auditTemporalElimination(REPO_ROOT, {
      allowRootPkgTemporal: IS_PRE_M4,
      allowTemporalFiles: IS_PRE_M4,
      launchAgentsDir: IS_PRE_M4 ? null : launchAgentsDir,
      plistPattern:
        /(?:^|[._-])(?:opl|onepersonlab|one-person-lab).*temporal.*\.plist$|temporal.*(?:opl|onepersonlab|one-person-lab).*\.plist$|^ai\.opl\.family-runtime\.(?:temporal-service|provider-worker)\.plist$/i,
    });
    assert.equal(
      audit.ok,
      true,
      `Temporal elimination violations in ${REPO_ROOT}: ${JSON.stringify(audit.violations, null, 2)}`
    );
  });

  it("T1-F15-03: architecture line budgets & import guard (<3,000L core, <1,500L stdlib Python, <400L bridge)", () => {
    const audit = auditLineBudgets({
      repoRoot: REPO_ROOT,
      bridgeDir: BRIDGE_DIR,
      pythonClientDir: PYTHON_CLIENT_DIR,
      requireCore: true,
      requirePythonClient: !IS_PRE_M4,
      requireBridge: !IS_PRE_M4,
    });
    assert.equal(
      audit.ok,
      true,
      `Line budget / import guard violations: ${JSON.stringify(audit.violations, null, 2)}`
    );
    assert.ok(audit.coreLineCount > 0 && audit.coreLineCount < 3000);
    if (!IS_PRE_M4) {
      assert.ok(audit.pythonReport.lineCount > 0 && audit.pythonReport.lineCount < 1500);
      assert.equal(audit.pythonReport.nonStdlibImports.length, 0);
      assert.ok(audit.bridgeLineCount > 0 && audit.bridgeLineCount < 400);
    }
  });

  it("T1-F15-04: legacy demolition & orthogonal ~36-44 v2 CLI surface (zero 448 legacy CLI, brand JSONs, or static lists)", async () => {
    const demoAudit = auditLegacyDemolition(REPO_ROOT, { allowLegacyCli: IS_PRE_M4 });
    if (!IS_PRE_M4) {
      assert.equal(
        demoAudit.ok,
        true,
        `Legacy demolition violations: ${JSON.stringify(demoAudit.violations, null, 2)}`
      );
    } else {
      assert.equal(
        demoAudit.violations.some((v) => v.rule === "opl-flow-circular-ref"),
        false,
        `Unexpected opl-flow circular ref: ${JSON.stringify(demoAudit.violations)}`
      );
    }

    const sb = trackSandbox();
    const help = await runCliOk(["--help"], { sandbox: sb });
    let totalCommands = 0;
    for (const ns of CORE_NAMESPACES) {
      assert.match(help.stdout, new RegExp(`\\b${ns}\\b`), `Expected core namespace '${ns}' in opl --help`);
      const topSet = countCoreCliSubcommands(help.stdout, ns);
      if (topSet.size >= 3) {
        totalCommands += topSet.size;
      } else {
        const nsHelp = await runCliOk([ns, "--help"], { sandbox: sb });
        const nsSet = extractNamespaceHelpCommands(nsHelp.stdout, ns);
        totalCommands += Math.max(topSet.size, nsSet.size);
      }
    }
    assert.ok(
      totalCommands >= 34 && totalCommands <= 48,
      `Expected ~36-44 orthogonal v2 CLI commands (34..48), got ${totalCommands}`
    );

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

    const codexLog = path.join(sb.stubLogDir, "codex.jsonl");
    const codexCalls = fs.existsSync(codexLog) ? fs.readFileSync(codexLog, "utf8").trim() : "";
    assert.equal(codexCalls, "", `Legacy commands must never fall back to codex stub, got:\n${codexCalls}`);
  });

  it("T1-F15-05: AionCore & DSH Computer Use protected boundaries remain completely untouched", () => {
    const audit = auditProtectedBoundaries({
      studioRoot: STUDIO_ROOT,
      appRoot: APP_ROOT,
      repoRoot: REPO_ROOT,
    });
    assert.equal(
      audit.ok,
      true,
      `Protected boundary violations: ${JSON.stringify(audit.violations, null, 2)}`
    );
  });
});
