import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ALLOWED_MODES = {
  codex: new Set(["success", "fail", "hang", "complete_after_detach", "read_only_check"]),
  agy: new Set(["success", "fail", "hang", "read_only_check"]),
};

const SECRET_ENV_KEY_RE = /TOKEN|SECRET|PASSWORD|API_KEY/i;

export function installBrokenPipeGuards() {
  process.on("SIGPIPE", () => {});
  process.stdout.on("error", (err) => {
    if (err?.code !== "EPIPE") throw err;
  });
  process.stderr.on("error", (err) => {
    if (err?.code !== "EPIPE") throw err;
  });
}

export function writeNdjson(obj, stream = process.stdout) {
  try {
    stream.write(JSON.stringify(obj) + "\n");
  } catch (err) {
    if (err?.code !== "EPIPE") throw err;
  }
}

export function writeTextSafe(text, stream = process.stdout) {
  try {
    stream.write(text);
  } catch (err) {
    if (err?.code !== "EPIPE") throw err;
  }
}

export function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function readStdinSync() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch (err) {
    if (err?.code === "EAGAIN" || err?.code === "EOF") return "";
    throw err;
  }
}

export function readStdinAsync() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

function extractBalancedJsonObject(text, openBraceIndex) {
  if (text[openBraceIndex] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = openBraceIndex; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return { json: text.slice(openBraceIndex, i + 1), endIndex: i };
      }
    }
  }
  return null;
}

function tryParsePlainObject(rawJson) {
  try {
    const parsed = JSON.parse(rawJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseInlineDirective(promptText) {
  if (typeof promptText !== "string" || !promptText) return null;

  let searchFrom = 0;
  while (searchFrom < promptText.length) {
    const idx = promptText.indexOf("[OPL_STUB:{", searchFrom);
    if (idx === -1) break;
    const braceStart = idx + "[OPL_STUB:".length;
    const extracted = extractBalancedJsonObject(promptText, braceStart);
    if (extracted && promptText[extracted.endIndex + 1] === "]") {
      const parsed = tryParsePlainObject(extracted.json);
      if (parsed) return parsed;
    }
    searchFrom = idx + 1;
  }

  const commentRe = /<!--\s*OPL_STUB:\{/g;
  let match;
  while ((match = commentRe.exec(promptText)) !== null) {
    const braceStart = match.index + match[0].length - 1;
    const extracted = extractBalancedJsonObject(promptText, braceStart);
    if (extracted && /^\s*-->/.test(promptText.slice(extracted.endIndex + 1))) {
      const parsed = tryParsePlainObject(extracted.json);
      if (parsed) return parsed;
    }
  }

  return null;
}

function parseJsonSafe(raw, label) {
  if (!raw || !String(raw).trim()) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`Stub config JSON parse error (${label}): ${err.message}\n`);
    process.exit(2);
  }
}

function matchRulesFile({ rulesFile, tool, subcommand, prompt, model, sandboxMode }) {
  if (!rulesFile || !fs.existsSync(rulesFile)) return null;
  const rules = parseJsonSafe(fs.readFileSync(rulesFile, "utf8"), "OPL_STUB_RULES_FILE");
  if (!Array.isArray(rules)) return null;

  const statePath = `${rulesFile}.state.json`;
  let consumed = [];
  if (fs.existsSync(statePath)) {
    try {
      const parsedState = JSON.parse(fs.readFileSync(statePath, "utf8"));
      if (Array.isArray(parsedState?.consumed)) consumed = parsedState.consumed;
    } catch {
      consumed = [];
    }
  }
  const consumedSet = new Set(consumed);

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule || typeof rule !== "object") continue;
    if (rule.once && consumedSet.has(i)) continue;
    if (rule.tool && rule.tool !== "*" && rule.tool !== tool) continue;
    if (rule.subcommand && rule.subcommand !== "*" && rule.subcommand !== subcommand) continue;
    if (rule.model && rule.model !== model) continue;
    if (rule.sandbox_mode && rule.sandbox_mode !== sandboxMode) continue;
    if (rule.prompt_regex) {
      const re = new RegExp(rule.prompt_regex);
      if (!re.test(prompt || "")) continue;
    }
    if (rule.once) {
      consumedSet.add(i);
      fs.writeFileSync(statePath, JSON.stringify({ consumed: [...consumedSet] }), "utf8");
    }
    return rule.config && typeof rule.config === "object" ? rule.config : null;
  }
  return null;
}

function mergeStubConfig(base, patch) {
  if (!patch || typeof patch !== "object") return base;
  const next = { ...base };
  for (const key of ["mode", "delay_ms", "artifacts", "response_text", "exit_code", "error_message", "fault", "session_id"]) {
    if (patch[key] !== undefined && patch[key] !== null) {
      next[key] = patch[key];
    }
  }
  if (patch.delay_ms !== undefined) {
    next.delay_ms = Number(patch.delay_ms) || 0;
  }
  if (patch.exit_code !== undefined && patch.exit_code !== null) {
    next.exit_code = Number(patch.exit_code);
  }
  return next;
}

export function resolveStubConfig({ tool, subcommand = "*", prompt = "", model = null, sandboxMode = null, env = process.env }) {
  const upperTool = tool.toUpperCase();
  let config = {
    mode: "success",
    delay_ms: 0,
    artifacts: [],
    response_text: null,
    exit_code: null,
    error_message: null,
    fault: null,
    session_id: null,
  };

  // Level 2: Global / Tool Env Vars
  const envMode = env[`OPL_STUB_${upperTool}_MODE`] || env.OPL_STUB_MODE;
  const envDelayRaw = env[`OPL_STUB_${upperTool}_DELAY_MS`] ?? env.OPL_STUB_DELAY_MS;
  const envArtifactsRaw = env[`OPL_STUB_${upperTool}_ARTIFACTS_JSON`] || env.OPL_STUB_ARTIFACTS_JSON;
  let envResponseText = env[`OPL_STUB_${upperTool}_RESPONSE_TEXT`] ?? env.OPL_STUB_RESPONSE_TEXT ?? null;
  const envResponseFile = env[`OPL_STUB_${upperTool}_RESPONSE_FILE`] ?? env.OPL_STUB_RESPONSE_FILE;
  if (!envResponseText && envResponseFile && fs.existsSync(envResponseFile)) {
    envResponseText = fs.readFileSync(envResponseFile, "utf8");
  }
  const envExitCodeRaw = env[`OPL_STUB_${upperTool}_EXIT_CODE`] ?? env.OPL_STUB_EXIT_CODE;
  const envErrorMessage = env[`OPL_STUB_${upperTool}_ERROR_MESSAGE`] ?? env.OPL_STUB_ERROR_MESSAGE ?? null;
  const envFault = env[`OPL_STUB_${upperTool}_FAULT`] || env.OPL_STUB_FAULT || null;
  const envSessionId = env[`OPL_STUB_${upperTool}_THREAD_ID`] || env[`OPL_STUB_${upperTool}_SESSION_ID`] || env.OPL_STUB_SESSION_ID || null;

  config = mergeStubConfig(config, {
    mode: envMode || undefined,
    delay_ms: envDelayRaw !== undefined && envDelayRaw !== "" ? Number(envDelayRaw) : undefined,
    artifacts: envArtifactsRaw ? parseJsonSafe(envArtifactsRaw, "OPL_STUB_ARTIFACTS_JSON") : undefined,
    response_text: envResponseText,
    exit_code: envExitCodeRaw !== undefined && envExitCodeRaw !== "" ? Number(envExitCodeRaw) : undefined,
    error_message: envErrorMessage,
    fault: envFault,
    session_id: envSessionId,
  });

  // Level 3: Rules file
  const rulePatch = matchRulesFile({
    rulesFile: env.OPL_STUB_RULES_FILE,
    tool,
    subcommand,
    prompt,
    model,
    sandboxMode,
  });
  config = mergeStubConfig(config, rulePatch);

  // Level 4: Inline prompt directive
  const inlinePatch = parseInlineDirective(prompt);
  config = mergeStubConfig(config, inlinePatch);

  const allowed = ALLOWED_MODES[tool];
  if (!allowed || !allowed.has(config.mode)) {
    process.stderr.write(`Invalid ${tool} stub mode: ${String(config.mode)}\n`);
    process.exit(2);
  }

  if (config.mode === "complete_after_detach" && (!config.delay_ms || config.delay_ms <= 0)) {
    config.delay_ms = 500;
  }
  if (!Array.isArray(config.artifacts)) {
    config.artifacts = [];
  }

  return config;
}

export function writeArtifactFiles(baseDir, artifacts) {
  const root = path.resolve(baseDir);
  const written = [];
  for (const item of artifacts) {
    if (!item || typeof item.path !== "string") {
      process.stderr.write("Invalid artifact descriptor in stub config\n");
      process.exit(2);
    }
    const target = path.resolve(root, item.path);
    if (target !== root && !target.startsWith(root + path.sep)) {
      process.stderr.write(`Refusing artifact path traversal outside workspace: ${item.path}\n`);
      process.exit(2);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const content = typeof item.content === "string" ? item.content : JSON.stringify(item.content ?? "", null, 2);
    fs.writeFileSync(target, content, "utf8");
    written.push(target);
  }
  return written;
}

function buildLoggedEnv(env) {
  if (env.OPL_STUB_LOG_ALL_ENV === "1") {
    const out = {};
    const rawAllowed = env.OPL_STUB_LOG_RAW_ENV === "1";
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) continue;
      out[k] = !rawAllowed && SECRET_ENV_KEY_RE.test(k) ? "[REDACTED]" : v;
    }
    return out;
  }

  const baseKeys = ["HOME", "OPL_HOME", "OPL_STATE_DIR", "OPL_CONFIG_DIR", "CODEX_HOME", "PATH"];
  const extraKeys = (env.OPL_STUB_LOG_ENV_KEYS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const selected = new Set([...baseKeys, ...extraKeys]);
  for (const key of Object.keys(env)) {
    if (key.startsWith("OPL_STUB_")) selected.add(key);
  }
  const out = {};
  for (const key of selected) {
    if (env[key] !== undefined) out[key] = env[key];
  }
  return out;
}

export function appendStubLog(record, env = process.env) {
  const logFile = env.OPL_STUB_LOG_FILE?.trim();
  const logDir = env.OPL_STUB_LOG_DIR?.trim();
  if (!logFile && !logDir) return;

  const entry = {
    ts: new Date().toISOString(),
    pid: process.pid,
    ppid: process.ppid,
    ...record,
  };
  if (record.event === "invocation" && !record.env) {
    entry.env = buildLoggedEnv(env);
  }
  const line = JSON.stringify(entry) + "\n";

  try {
    if (logFile) {
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      fs.appendFileSync(logFile, line, "utf8");
    }
    if (logDir) {
      fs.mkdirSync(logDir, { recursive: true });
      if (record.tool) {
        fs.appendFileSync(path.join(logDir, `${record.tool}.jsonl`), line, "utf8");
      }
      fs.appendFileSync(path.join(logDir, "all.jsonl"), line, "utf8");
    }
  } catch {
    // Never crash stub due to logging issues
  }
}

export function resolveCodexHome(env = process.env) {
  return env.CODEX_HOME?.trim() || path.join(env.HOME || os.homedir(), ".codex");
}

export function buildShortPreview(text, maxLen = 200) {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

export function sha256Hex(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}
