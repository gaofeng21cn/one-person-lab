import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const STUBS_DIR = path.dirname(fileURLToPath(import.meta.url));
const CODEX_BIN = path.join(STUBS_DIR, "bin", "codex");
const AGY_BIN = path.join(STUBS_DIR, "bin", "agy");

const tempRoots = [];

function makeTempSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-stub-self-"));
  tempRoots.push(root);
  const homeDir = path.join(root, "h");
  const oplHome = path.join(homeDir, ".opl");
  const codexHome = path.join(root, "cx");
  const wsDir = path.join(root, "ws");
  const logDir = path.join(root, "logs");
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(oplHome, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });
  fs.mkdirSync(wsDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  return {
    root,
    homeDir,
    oplHome,
    codexHome,
    wsDir,
    logDir,
    env: {
      ...process.env,
      HOME: homeDir,
      OPL_HOME: oplHome,
      CODEX_HOME: codexHome,
      OPL_STUB_LOG_DIR: logDir,
      NODE_NO_WARNINGS: "1",
    },
  };
}

function findSessionJsonl(codexHome, threadId) {
  const sessionsDir = path.join(codexHome, "sessions");
  if (!fs.existsSync(sessionsDir)) return null;
  const stack = [sessionsDir];
  while (stack.length > 0) {
    const cur = stack.pop();
    for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.isFile() && ent.name.endsWith(".jsonl") && ent.name.includes(threadId)) return full;
    }
  }
  return null;
}

function readJsonl(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("E2E-M1 Protocol Stubs Self-Tests (ST-01 .. ST-12)", () => {
  it("ST-01: codex --version outputs codex-cli 0.171.0 and logs invocation", () => {
    const sb = makeTempSandbox();
    const res = spawnSync(CODEX_BIN, ["--version"], { env: sb.env, encoding: "utf8" });
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), "codex-cli 0.171.0");
    const log = readJsonl(path.join(sb.logDir, "codex.jsonl"));
    assert.equal(log[0].subcommand, "version");
  });

  it("ST-02: codex exec --json emits NDJSON events, writes artifact, --output-last-message, and session JSONL", () => {
    const sb = makeTempSandbox();
    const lastMsgFile = path.join(sb.wsDir, "last-msg.txt");
    const res = spawnSync(
      CODEX_BIN,
      [
        "exec",
        "--json",
        "--cd",
        sb.wsDir,
        "--sandbox",
        "workspace-write",
        "-o",
        lastMsgFile,
        "Build figure 1",
      ],
      {
        env: {
          ...sb.env,
          OPL_STUB_CODEX_ARTIFACTS_JSON: JSON.stringify([{ path: "figures/fig1.svg", content: "<svg>fig1</svg>" }]),
          OPL_STUB_CODEX_RESPONSE_TEXT: "Figure 1 built cleanly",
        },
        encoding: "utf8",
      }
    );
    assert.equal(res.status, 0, res.stderr);
    const events = res.stdout
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    assert.equal(events[0].type, "thread.started");
    const threadId = events[0].thread_id;
    assert.equal(events[1].type, "turn.started");
    assert.equal(events[2].item.type, "command_execution");
    assert.equal(events[3].item.type, "agent_message");
    assert.equal(events[3].item.text, "Figure 1 built cleanly");
    assert.equal(events[4].type, "turn.completed");
    for (const k of ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens"]) {
      assert.equal(typeof events[4].usage[k], "number");
    }

    assert.equal(fs.readFileSync(path.join(sb.wsDir, "figures/fig1.svg"), "utf8"), "<svg>fig1</svg>");
    assert.equal(fs.readFileSync(lastMsgFile, "utf8"), "Figure 1 built cleanly");

    const sessionFile = findSessionJsonl(sb.codexHome, threadId);
    assert.ok(sessionFile, "Expected session recovery JSONL file");
    const sessionLines = readJsonl(sessionFile);
    assert.equal(sessionLines[0].type, "session_meta");
    assert.equal(sessionLines[0].payload.id, threadId);
    assert.ok(sessionLines.some((l) => l.payload?.type === "token_count"));
    assert.ok(sessionLines.some((l) => l.payload?.type === "task_complete"));
    assert.ok(sessionLines.some((l) => l.payload?.type === "turn_completed"));
  });

  it("ST-03: codex exec - reads multiline prompt from stdin and logs stdin_preview", () => {
    const sb = makeTempSandbox();
    const prompt = "Line 1: analyze\nLine 2: summarize";
    const res = spawnSync(CODEX_BIN, ["exec", "--json", "--cd", sb.wsDir, "-"], {
      env: sb.env,
      input: prompt,
      encoding: "utf8",
    });
    assert.equal(res.status, 0, res.stderr);
    const inv = readJsonl(path.join(sb.logDir, "codex.jsonl")).find((r) => r.event === "invocation");
    assert.equal(inv.usedStdin, true);
    assert.ok(inv.stdin_preview.includes("Line 1: analyze\nLine 2: summarize"));
  });

  it("ST-04: codex exec resume supports both arg orderings and preserves thread_id", () => {
    const sb = makeTempSandbox();
    const r1 = spawnSync(CODEX_BIN, ["exec", "resume", "thread-alpha-1", "--json", "--cd", sb.wsDir, "Continue step"], {
      env: sb.env,
      encoding: "utf8",
    });
    assert.equal(r1.status, 0, r1.stderr);
    assert.equal(JSON.parse(r1.stdout.split("\n")[0]).thread_id, "thread-alpha-1");

    const r2 = spawnSync(CODEX_BIN, ["exec", "resume", "--json", "--cd", sb.wsDir, "--sandbox", "workspace-write", "thread-beta-2", "Continue step 2"], {
      env: sb.env,
      encoding: "utf8",
    });
    assert.equal(r2.status, 0, r2.stderr);
    assert.equal(JSON.parse(r2.stdout.split("\n")[0]).thread_id, "thread-beta-2");
  });

  it("ST-05: codex read_only_check & --config sandbox_mode=\"read-only\" enforce zero workspace writes", () => {
    const sb = makeTempSandbox();
    const okRes = spawnSync(
      CODEX_BIN,
      ["exec", "--json", "--cd", sb.wsDir, "--config", 'sandbox_mode="read-only"', "Inspect repo"],
      { env: { ...sb.env, OPL_STUB_CODEX_MODE: "read_only_check" }, encoding: "utf8" }
    );
    assert.equal(okRes.status, 0, okRes.stderr);
    assert.deepEqual(fs.readdirSync(sb.wsDir), []);

    const badRes = spawnSync(
      CODEX_BIN,
      ["exec", "--json", "--cd", sb.wsDir, "--sandbox", "workspace-write", "Try mutate"],
      { env: { ...sb.env, OPL_STUB_CODEX_MODE: "read_only_check" }, encoding: "utf8" }
    );
    assert.equal(badRes.status, 2);
  });

  it("ST-06: codex fail emits error frame & exits 1; hang flushes startup and blocks until SIGTERM", async () => {
    const sb = makeTempSandbox();
    const failRes = spawnSync(CODEX_BIN, ["exec", "--json", "--cd", sb.wsDir, "Fail me"], {
      env: { ...sb.env, OPL_STUB_CODEX_MODE: "fail" },
      encoding: "utf8",
    });
    assert.equal(failRes.status, 1);
    const lines = failRes.stdout.trim().split("\n").map((l) => JSON.parse(l));
    assert.ok(lines.some((l) => l.type === "error" && l.message.includes("status 503")));

    const child = spawn(CODEX_BIN, ["exec", "--json", "--cd", sb.wsDir, "Hang forever"], {
      env: { ...sb.env, OPL_STUB_CODEX_MODE: "hang" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for hang startup flush")), 3000);
      child.stdout.on("data", (c) => {
        out += c.toString("utf8");
        if (out.includes("turn.started")) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    child.kill("SIGTERM");
    const exitInfo = await new Promise((resolve) => child.on("close", (code, sig) => resolve({ code, sig })));
    assert.ok(exitInfo.code === 143 || exitInfo.sig === "SIGTERM");
  });

  it("ST-07: codex complete_after_detach survives SIGHUP & closed stdout pipe (EPIPE) and persists artifacts + session JSONL", async () => {
    const sb = makeTempSandbox();
    const child = spawn(
      CODEX_BIN,
      ["exec", "--json", "--cd", sb.wsDir, "--sandbox", "workspace-write", "Detached job"],
      {
        env: {
          ...sb.env,
          OPL_STUB_CODEX_MODE: "complete_after_detach",
          OPL_STUB_CODEX_DELAY_MS: "250",
          OPL_STUB_CODEX_THREAD_ID: "thread-detach-007",
          OPL_STUB_CODEX_ARTIFACTS_JSON: JSON.stringify([{ path: "out/detached.txt", content: "survived" }]),
        },
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    // Wait for initial thread.started flush then simulate opld SIGKILL (close pipes + send SIGHUP)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for initial flush")), 3000);
      let buf = "";
      child.stdout.on("data", (c) => {
        buf += c.toString("utf8");
        if (buf.includes("turn.started")) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    child.stdout.destroy();
    child.stderr.destroy();
    process.kill(child.pid, "SIGHUP");

    const exitCode = await new Promise((resolve) => child.on("close", (code) => resolve(code)));
    assert.equal(exitCode, 0);
    assert.equal(fs.readFileSync(path.join(sb.wsDir, "out/detached.txt"), "utf8"), "survived");

    const sessionFile = findSessionJsonl(sb.codexHome, "thread-detach-007");
    assert.ok(sessionFile);
    const sessionLines = readJsonl(sessionFile);
    assert.ok(sessionLines.some((l) => l.payload?.type === "turn_completed"));

    const logs = readJsonl(path.join(sb.logDir, "codex.jsonl"));
    assert.ok(logs.some((r) => r.event === "completion" && r.exit_code === 0));
  });

  it("ST-08: codex app-server --stdio & plugin marketplace list --json support local + external plugins and fault modes", async () => {
    const sb = makeTempSandbox();
    const mpDir = path.join(sb.oplHome, "carriers", "codex-marketplace");
    const masPluginDir = path.join(mpDir, "plugins", "med-autoscience");
    fs.mkdirSync(path.join(masPluginDir, ".codex-plugin"), { recursive: true });
    fs.writeFileSync(
      path.join(masPluginDir, ".codex-plugin", "plugin.json"),
      JSON.stringify({ name: "med-autoscience", version: "0.4.0" }),
      "utf8"
    );
    fs.writeFileSync(
      path.join(mpDir, "marketplace.json"),
      JSON.stringify({
        name: "opl-local",
        plugins: [{ name: "med-autoscience", source: "./plugins/med-autoscience", version: "0.4.0" }],
      }),
      "utf8"
    );

    const extEnv = {
      ...sb.env,
      OPL_STUB_CODEX_EXTERNAL_PLUGINS_JSON: JSON.stringify([
        { name: "obsidian-helper", version: "1.2.0", path: "/tmp/ext/obsidian" },
      ]),
    };

    const mpList = spawnSync(CODEX_BIN, ["plugin", "marketplace", "list", "--json"], { env: extEnv, encoding: "utf8" });
    assert.equal(mpList.status, 0, mpList.stderr);
    const mpParsed = JSON.parse(mpList.stdout);
    assert.equal(mpParsed.marketplaces.length, 2);
    assert.equal(mpParsed.marketplaces[0].name, "opl-local");

    // Normal app-server --stdio handshake + plugin/list
    const rpcInput = [
      JSON.stringify({ id: 1, method: "initialize", params: { clientInfo: { name: "opl_local_packages", version: "1" } } }),
      JSON.stringify({ method: "initialized", params: {} }),
      JSON.stringify({ id: 2, method: "plugin/list", params: { marketplaceKinds: ["local"] } }),
    ].join("\n") + "\n";

    const appRes = spawnSync(CODEX_BIN, ["app-server", "--stdio"], { env: extEnv, input: rpcInput, encoding: "utf8" });
    assert.equal(appRes.status, 0, appRes.stderr);
    const frames = appRes.stdout.trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(frames.length, 2); // initialized produced no response
    assert.equal(frames[0].id, 1);
    assert.equal(frames[1].id, 2);
    assert.equal(frames[1].result.marketplaceLoadErrors.length, 0);
    assert.equal(frames[1].result.marketplaces[0].plugins[0].id, "med-autoscience@opl-local");
    assert.equal(frames[1].result.marketplaces[1].plugins[0].name, "obsidian-helper");

    // Fault modes: invalid_json, load_error, rpc_error, stall
    const invRes = spawnSync(CODEX_BIN, ["app-server", "--stdio"], {
      env: { ...extEnv, OPL_STUB_CODEX_APP_SERVER_FAULT: "invalid_json" },
      input: rpcInput,
      encoding: "utf8",
    });
    assert.ok(invRes.stdout.includes("{invalid-json"));

    const loadErrRes = spawnSync(CODEX_BIN, ["app-server", "--stdio"], {
      env: { ...extEnv, OPL_STUB_CODEX_APP_SERVER_FAULT: "load_error" },
      input: rpcInput,
      encoding: "utf8",
    });
    const loadFrames = loadErrRes.stdout.trim().split("\n").map((l) => JSON.parse(l));
    assert.ok(loadFrames[1].result.marketplaceLoadErrors.length > 0);

    const rpcErrRes = spawnSync(CODEX_BIN, ["app-server", "--stdio"], {
      env: { ...extEnv, OPL_STUB_CODEX_APP_SERVER_FAULT: "rpc_error" },
      input: rpcInput,
      encoding: "utf8",
    });
    assert.equal(JSON.parse(rpcErrRes.stdout.trim().split("\n")[0]).error.code, -32000);

    const stallChild = spawn(CODEX_BIN, ["app-server", "--stdio"], {
      env: { ...extEnv, OPL_STUB_CODEX_APP_SERVER_FAULT: "stall" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    stallChild.stdin.write(JSON.stringify({ id: 1, method: "initialize", params: {} }) + "\n");
    stallChild.stdin.write(JSON.stringify({ id: 2, method: "plugin/list", params: {} }) + "\n");
    await sleep(100);
    // Still alive while stalled
    assert.equal(stallChild.exitCode, null);
    stallChild.kill("SIGTERM");
    await new Promise((resolve) => stallChild.on("close", resolve));
  });

  it("ST-09: agy --version outputs 1.5.16 and agy models lists all 27 models", () => {
    const sb = makeTempSandbox();
    const verRes = spawnSync(AGY_BIN, ["--version"], { env: sb.env, encoding: "utf8" });
    assert.equal(verRes.status, 0);
    assert.equal(verRes.stdout.trim(), "1.5.16");

    const modRes = spawnSync(AGY_BIN, ["models"], { env: sb.env, encoding: "utf8" });
    assert.equal(modRes.status, 0);
    const lines = modRes.stdout.trim().split("\n");
    assert.equal(lines.length, 27);
    const ids = lines.map((l) => l.trim().split(/\s+/)[0]);
    for (const reqId of [
      "gemini-4-neon-xhigh",
      "gemini-4-neon-high",
      "gemini-4-neon-medium",
      "gemini-4-neon-low",
      "claude-opus-5-5-high",
      "gpt-oss-120b-medium",
    ]) {
      assert.ok(ids.includes(reqId), `Missing expected model: ${reqId}`);
    }
  });

  it("ST-10: agy --print stream-json emits system/assistant/result with total_usd:0.0, structured_output & --add-dir artifact", () => {
    const sb = makeTempSandbox();
    const settingsFile = path.join(sb.root, "mcp-settings.json");
    fs.writeFileSync(settingsFile, JSON.stringify({ mcpServers: {} }), "utf8");
    const schemaStr = JSON.stringify({ type: "object", properties: { ok: { type: "boolean" } } });

    const res = spawnSync(
      AGY_BIN,
      [
        "--print",
        "--output-format",
        "stream-json",
        "--model",
        "gemini-4-neon-high",
        "--effort",
        "high",
        "--mode",
        "accept-edits",
        "--sandbox",
        "--add-dir",
        sb.wsDir,
        "--settings",
        settingsFile,
        "--json-schema",
        schemaStr,
        "--conversation",
        "ag-42",
        "Analyze cohort",
      ],
      {
        env: {
          ...sb.env,
          OPL_STUB_AGY_ARTIFACTS_JSON: JSON.stringify([{ path: "analysis/plan.md", content: "# Plan\n" }]),
        },
        encoding: "utf8",
      }
    );
    assert.equal(res.status, 0, res.stderr);
    const frames = res.stdout.trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(frames[0].type, "system");
    assert.equal(frames[0].session_id, "ag-42");
    assert.equal(frames[1].type, "assistant");
    assert.equal(frames[2].type, "result");
    assert.equal(frames[2].total_usd, 0.0);
    assert.equal(frames[2].is_error, false);
    assert.deepEqual(frames[2].structured_output, { stub: true, schema_applied: true });
    assert.equal(fs.readFileSync(path.join(sb.wsDir, "analysis/plan.md"), "utf8"), "# Plan\n");
  });

  it("ST-11: agy read_only_check enforces BOTH --mode plan AND --sandbox with zero workspace writes", () => {
    const sb = makeTempSandbox();
    const env = { ...sb.env, OPL_STUB_AGY_MODE: "read_only_check" };

    const okRes = spawnSync(
      AGY_BIN,
      ["--print", "--output-format", "stream-json", "--mode", "plan", "--sandbox", "--add-dir", sb.wsDir, "Review"],
      { env, encoding: "utf8" }
    );
    assert.equal(okRes.status, 0, okRes.stderr);
    assert.deepEqual(fs.readdirSync(sb.wsDir), []);

    for (const badArgs of [
      ["--print", "--output-format", "stream-json", "--mode", "accept-edits", "--sandbox", "Review"],
      ["--print", "--output-format", "stream-json", "--mode", "auto", "--sandbox", "Review"],
      ["--print", "--output-format", "stream-json", "--mode", "plan", "Review"],
    ]) {
      const badRes = spawnSync(AGY_BIN, badArgs, { env, encoding: "utf8" });
      assert.equal(badRes.status, 2, `Expected exit 2 for ${badArgs.join(" ")}`);
    }
  });

  it("ST-12: agy fail/hang, 3-level directive precedence (inline > rules file > env), and redacted invocation logging", async () => {
    const sb = makeTempSandbox();

    // 1. fail mode
    const failRes = spawnSync(
      AGY_BIN,
      ["--print", "--output-format", "stream-json", "Fail stage"],
      { env: { ...sb.env, OPL_STUB_AGY_MODE: "fail" }, encoding: "utf8" }
    );
    assert.equal(failRes.status, 1);
    const failFrames = failRes.stdout.trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(failFrames[1].type, "result");
    assert.equal(failFrames[1].is_error, true);

    // 2. hang mode
    const hangChild = spawn(AGY_BIN, ["--print", "--output-format", "stream-json", "Hang"], {
      env: { ...sb.env, OPL_STUB_AGY_MODE: "hang" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for agy hang init")), 3000);
      let out = "";
      hangChild.stdout.on("data", (c) => {
        out += c.toString("utf8");
        if (out.includes('"subtype":"init"')) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    hangChild.kill("SIGTERM");
    await new Promise((resolve) => hangChild.on("close", resolve));

    // 3. 3-level precedence: env says fail, rules file says success, inline directive overrides to fail with exit 42
    const rulesFile = path.join(sb.root, "rules.json");
    fs.writeFileSync(
      rulesFile,
      JSON.stringify([
        { tool: "agy", subcommand: "print", prompt_regex: "rule-hit", config: { mode: "success", response_text: "from-rule" } },
      ]),
      "utf8"
    );

    const ruleRes = spawnSync(
      AGY_BIN,
      ["--print", "--output-format", "json", "--add-dir", sb.wsDir, "Stage rule-hit"],
      {
        env: {
          ...sb.env,
          OPL_STUB_AGY_MODE: "fail",
          OPL_STUB_RULES_FILE: rulesFile,
          OPL_STUB_LOG_ALL_ENV: "1",
          MY_SECRET_API_KEY: "sk-super-secret-123",
        },
        encoding: "utf8",
      }
    );
    assert.equal(ruleRes.status, 0, ruleRes.stderr);
    assert.equal(JSON.parse(ruleRes.stdout).result, "from-rule");

    const inlineRes = spawnSync(
      AGY_BIN,
      [
        "--print",
        "--output-format",
        "json",
        '--add-dir',
        sb.wsDir,
        'Stage rule-hit [OPL_STUB:{"mode":"fail","exit_code":42,"error_message":"inline-override"}]',
      ],
      {
        env: { ...sb.env, OPL_STUB_AGY_MODE: "success", OPL_STUB_RULES_FILE: rulesFile },
        encoding: "utf8",
      }
    );
    assert.equal(inlineRes.status, 42);
    assert.equal(JSON.parse(inlineRes.stdout).result, "inline-override");

    const agyLogs = readJsonl(path.join(sb.logDir, "agy.jsonl"));
    const withSecret = agyLogs.find((r) => r.event === "invocation" && r.env?.MY_SECRET_API_KEY);
    assert.equal(withSecret.env.MY_SECRET_API_KEY, "[REDACTED]");
  });

  it("ST-13: parseInlineDirective balanced JSON scanner handles trailing }] and nested JSON/escaped quotes", () => {
    const sb = makeTempSandbox();
    const res1 = spawnSync(
      AGY_BIN,
      [
        "--print",
        "--output-format",
        "json",
        "--add-dir",
        sb.wsDir,
        'Evaluate [OPL_STUB:{"mode":"success","response_text":"ok \\"}\\" [x]"}] against schema [{"k":1}]',
      ],
      { env: { ...sb.env, OPL_STUB_MODE: "fail" }, encoding: "utf8" }
    );
    assert.equal(res1.status, 0, res1.stderr);
    assert.equal(JSON.parse(res1.stdout).result, 'ok "}" [x]');

    const res2 = spawnSync(
      AGY_BIN,
      [
        "--print",
        "--output-format",
        "json",
        "--add-dir",
        sb.wsDir,
        '<!-- OPL_STUB:{"mode":"success","response_text":"html-ok"} --> <!-- trailing -->',
      ],
      { env: { ...sb.env, OPL_STUB_MODE: "fail" }, encoding: "utf8" }
    );
    assert.equal(res2.status, 0, res2.stderr);
    assert.equal(JSON.parse(res2.stdout).result, "html-ok");
  });

  it("ST-14: codex preserves global flags before exec, enforces last-wins, and scopes --version/-V", () => {
    const sb = makeTempSandbox();
    const okRes = spawnSync(
      CODEX_BIN,
      ["-c", 'sandbox_mode="read-only"', "exec", "--json", "--cd", sb.wsDir, "Check global -c"],
      { env: { ...sb.env, OPL_STUB_CODEX_MODE: "read_only_check" }, encoding: "utf8" }
    );
    assert.equal(okRes.status, 0, okRes.stderr);
    assert.deepEqual(fs.readdirSync(sb.wsDir), []);

    const overrideRes = spawnSync(
      CODEX_BIN,
      ["-c", 'sandbox_mode="read-only"', "exec", "--json", "--cd", sb.wsDir, "--sandbox", "workspace-write", "Override"],
      { env: { ...sb.env, OPL_STUB_CODEX_MODE: "read_only_check" }, encoding: "utf8" }
    );
    assert.equal(overrideRes.status, 2);

    const verOptErr = spawnSync(
      CODEX_BIN,
      ["exec", "--json", "--cd", sb.wsDir, "--version"],
      { env: sb.env, encoding: "utf8" }
    );
    assert.equal(verOptErr.status, 2);

    const verPromptRes = spawnSync(
      CODEX_BIN,
      ["exec", "--json", "--cd", sb.wsDir, "--", "--version"],
      { env: sb.env, encoding: "utf8" }
    );
    assert.equal(verPromptRes.status, 0, verPromptRes.stderr);
    const frames = verPromptRes.stdout.trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(frames[0].type, "thread.started");
  });

  it("ST-15: codex complete_after_detach survives SIGHUP with stdio:ignore and app-server merges into existing marketplace", async () => {
    const sb = makeTempSandbox();
    const child = spawn(
      CODEX_BIN,
      ["exec", "--json", "--cd", sb.wsDir, "--sandbox", "workspace-write", "Immediate SIGHUP"],
      {
        env: {
          ...sb.env,
          OPL_STUB_CODEX_MODE: "complete_after_detach",
          OPL_STUB_CODEX_DELAY_MS: "300",
          OPL_STUB_CODEX_ARTIFACTS_JSON: JSON.stringify([{ path: "out/immediate.txt", content: "ok" }]),
        },
        detached: true,
        stdio: "ignore",
      }
    );
    const codexLogPath = path.join(sb.logDir, "codex.jsonl");
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if (fs.existsSync(codexLogPath) && fs.readFileSync(codexLogPath, "utf8").includes('"invocation"')) {
        break;
      }
      await sleep(10);
    }
    process.kill(child.pid, "SIGHUP");
    const exitCode = await new Promise((resolve) => child.on("close", (code) => resolve(code)));
    assert.equal(exitCode, 0);
    assert.equal(fs.readFileSync(path.join(sb.wsDir, "out/immediate.txt"), "utf8"), "ok");

    const mpDir = path.join(sb.oplHome, "carriers", "codex-marketplace");
    const masDir = path.join(mpDir, "plugins", "med-autoscience");
    fs.mkdirSync(path.join(masDir, ".codex-plugin"), { recursive: true });
    fs.writeFileSync(path.join(masDir, ".codex-plugin", "plugin.json"), JSON.stringify({ name: "med-autoscience", version: "0.4.0" }), "utf8");
    fs.writeFileSync(
      path.join(mpDir, "marketplace.json"),
      JSON.stringify({ name: "opl-local", plugins: [{ name: "med-autoscience", source: "./plugins/med-autoscience", version: "0.4.0" }] }),
      "utf8"
    );

    const rpcInput = [
      JSON.stringify({ id: 1, method: "initialize", params: {} }),
      JSON.stringify({ id: 2, method: "plugin/list", params: {} }),
    ].join("\n") + "\n";

    const appRes = spawnSync(CODEX_BIN, ["app-server", "--stdio"], {
      env: {
        ...sb.env,
        OPL_STUB_CODEX_EXTERNAL_PLUGINS_JSON: JSON.stringify([
          { name: "ext-beta", version: "2.0.0", marketplace: "opl-local", path: "/tmp/ext-beta" },
        ]),
      },
      input: rpcInput,
      encoding: "utf8",
    });
    assert.equal(appRes.status, 0, appRes.stderr);
    const listFrame = appRes.stdout.trim().split("\n").map((l) => JSON.parse(l))[1];
    assert.equal(listFrame.result.marketplaces.length, 1);
    assert.equal(listFrame.result.marketplaces[0].name, "opl-local");
    assert.deepEqual(
      listFrame.result.marketplaces[0].plugins.map((p) => p.name),
      ["med-autoscience", "ext-beta"]
    );
  });

  it("ST-16: agy scopes --version/-v/-V to leading flags before --print, models, or --", () => {
    const sb = makeTempSandbox();
    for (const flag of ["--version", "-v", "-V"]) {
      const vRes = spawnSync(AGY_BIN, [flag], { cwd: sb.wsDir, env: sb.env, encoding: "utf8" });
      assert.equal(vRes.status, 0);
      assert.equal(vRes.stdout.trim(), "1.5.16");
    }

    const promptDashDashRes = spawnSync(
      AGY_BIN,
      ["--print", "--output-format", "stream-json", "--mode", "accept-edits", "--add-dir", sb.wsDir, "--", "--version"],
      { cwd: sb.wsDir, env: sb.env, encoding: "utf8" }
    );
    assert.equal(promptDashDashRes.status, 0, promptDashDashRes.stderr);
    const frames = promptDashDashRes.stdout.trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(frames[0].type, "system");
    assert.equal(frames.at(-1).type, "result");
    assert.equal(frames.at(-1).is_error, false);

    const optErrRes = spawnSync(
      AGY_BIN,
      ["--print", "--output-format", "stream-json", "--mode", "accept-edits", "--add-dir", sb.wsDir, "--version"],
      { cwd: sb.wsDir, env: sb.env, encoding: "utf8" }
    );
    assert.equal(optErrRes.status, 2);
    assert.match(optErrRes.stderr, /Unknown option for agy: --version/);

    const shortPromptRes = spawnSync(
      AGY_BIN,
      ["--print", "--output-format", "json", "--add-dir", sb.wsDir, "--", "-V"],
      { cwd: sb.wsDir, env: sb.env, encoding: "utf8" }
    );
    assert.equal(shortPromptRes.status, 0, shortPromptRes.stderr);
    assert.equal(JSON.parse(shortPromptRes.stdout).type, "result");

    const modelsRes = spawnSync(AGY_BIN, ["models", "--version"], { cwd: sb.wsDir, env: sb.env, encoding: "utf8" });
    assert.equal(modelsRes.status, 0);
    assert.equal(modelsRes.stdout.trim().split("\n").length, 27);
  });

  it("ST-17: codex app-server & plugin marketplace list unwrap object entry.source ({ source: 'local', path })", () => {
    const sb = makeTempSandbox();
    const mpDir = path.join(sb.oplHome, "carriers", "codex-marketplace");
    const masPluginDir = path.join(mpDir, "plugins", "med-autoscience");
    fs.mkdirSync(path.join(masPluginDir, ".codex-plugin"), { recursive: true });
    fs.writeFileSync(
      path.join(masPluginDir, ".codex-plugin", "plugin.json"),
      JSON.stringify({ name: "med-autoscience", version: "0.4.0" }),
      "utf8"
    );
    fs.writeFileSync(
      path.join(mpDir, "marketplace.json"),
      JSON.stringify({
        name: "opl-local",
        plugins: [
          {
            name: "med-autoscience",
            source: { source: "local", path: "./plugins/med-autoscience" },
            policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
            opl_package_id: "mas",
            version: "0.4.0",
          },
        ],
      }),
      "utf8"
    );

    const mpList = spawnSync(CODEX_BIN, ["plugin", "marketplace", "list", "--json"], { env: sb.env, encoding: "utf8" });
    assert.equal(mpList.status, 0, mpList.stderr);
    const mpParsed = JSON.parse(mpList.stdout);
    assert.equal(mpParsed.marketplaces.length, 1);
    assert.equal(mpParsed.marketplaces[0].name, "opl-local");

    const rpcInput = [
      JSON.stringify({ id: 1, method: "initialize", params: { clientInfo: { name: "opl_pack_codex_sync", version: "2.0.0" } } }),
      JSON.stringify({ method: "initialized", params: {} }),
      JSON.stringify({ id: 2, method: "plugin/list", params: { marketplaceKinds: ["local"] } }),
    ].join("\n") + "\n";

    const appRes = spawnSync(CODEX_BIN, ["app-server", "--stdio"], { env: sb.env, input: rpcInput, encoding: "utf8" });
    assert.equal(appRes.status, 0, appRes.stderr);
    const frames = appRes.stdout.trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(frames.length, 2);
    assert.equal(frames[1].id, 2);
    assert.equal(frames[1].result.marketplaceLoadErrors.length, 0);
    const plugin = frames[1].result.marketplaces[0].plugins[0];
    assert.equal(plugin.id, "med-autoscience@opl-local");
    assert.equal(plugin.name, "med-autoscience");
    assert.equal(plugin.version, "0.4.0");
    assert.deepEqual(plugin.source, { type: "local", path: masPluginDir });
  });
});
