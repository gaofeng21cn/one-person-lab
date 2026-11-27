import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

// Valid 68-byte 1x1 transparent RGBA PNG
export const VALID_1X1_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000b49444154789c6360000200000500017a5eab3f0000000049454e44ae426082",
  "hex"
);

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const len = Buffer.allocUnsafe(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

export function writePng(filePath, minBytes = 128) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let out = VALID_1X1_PNG;
  if (out.length < minBytes) {
    const padLen = Math.max(16, minBytes - out.length);
    const textData = Buffer.from(`Comment\0${"x".repeat(padLen)}`, "ascii");
    const textChunk = makePngChunk("tEXt", textData);
    // Insert tEXt before 12-byte IEND chunk
    const iendOffset = VALID_1X1_PNG.length - 12;
    out = Buffer.concat([VALID_1X1_PNG.subarray(0, iendOffset), textChunk, VALID_1X1_PNG.subarray(iendOffset)]);
  }
  fs.writeFileSync(filePath, out);
  return out;
}

const DEFAULT_LOCK_EXCLUDES = new Set([
  ".git",
  "node_modules",
  ".codegraph",
  ".tsbuildinfo",
  "opl-release.lock.json",
  ".DS_Store",
]);

function lstatSafe(p) {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

function collectFilesRecursively(rootDir, prefix = "", excludeRealDirs = [], { includeLockFile = false } = {}) {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;
  for (const ent of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (DEFAULT_LOCK_EXCLUDES.has(ent.name)) {
      if (!(includeLockFile && !prefix && ent.name === "opl-release.lock.json")) {
        continue;
      }
    }
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
    const full = path.join(rootDir, ent.name);
    if (ent.isDirectory()) {
      if (excludeRealDirs.length > 0) {
        const realFull = fs.realpathSync(full);
        if (excludeRealDirs.some((ex) => realFull === ex || realFull.startsWith(ex + path.sep))) {
          continue;
        }
      }
      out.push(...collectFilesRecursively(full, rel, excludeRealDirs, { includeLockFile }));
    } else if (ent.isFile()) {
      if (ent.name.endsWith(".tsbuildinfo")) continue;
      out.push({ rel, full });
    }
  }
  return out;
}

export function sha256File(filePath) {
  const bytes = fs.readFileSync(filePath);
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

export function computeContentLock(rootDir, includeRelPaths) {
  const absRoot = path.resolve(rootDir);
  const realRoot = fs.existsSync(absRoot) ? fs.realpathSync(absRoot) : absRoot;
  const realRootPrefix = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
  const entries = Array.isArray(includeRelPaths)
    ? includeRelPaths.map((rel) => {
        const normalizedRel = String(rel).replace(/\\/g, "/").replace(/^\.\//, "");
        if (path.isAbsolute(normalizedRel)) {
          throw new Error(`Refusing computeContentLock outside rootDir: ${rel}`);
        }
        const full = path.resolve(absRoot, normalizedRel);
        if (full !== absRoot && !full.startsWith(absRoot + path.sep)) {
          throw new Error(`Refusing computeContentLock outside rootDir: ${rel}`);
        }
        const realTarget = fs.realpathSync(full);
        if (realTarget !== realRoot && !realTarget.startsWith(realRootPrefix)) {
          throw new Error(`Refusing computeContentLock symlink outside rootDir: ${rel}`);
        }
        return { rel: normalizedRel, full: realTarget };
      })
    : collectFilesRecursively(absRoot);

  const sorted = [...entries].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const h = crypto.createHash("sha256");

  const lenBuf = Buffer.allocUnsafe(8);
  for (const item of sorted) {
    const relBuf = Buffer.from(item.rel, "utf8");
    const bytes = fs.readFileSync(item.full);
    lenBuf.writeBigUInt64BE(BigInt(relBuf.length), 0);
    h.update(lenBuf);
    h.update(relBuf);
    lenBuf.writeBigUInt64BE(BigInt(bytes.length), 0);
    h.update(lenBuf);
    h.update(bytes);
  }

  return {
    algorithm: "sha256",
    canonicalization: "ordered_path_length_file_length_bytes",
    file_count: sorted.length,
    paths: sorted.map((e) => e.rel),
    digest: `sha256:${h.digest("hex")}`,
  };
}

function deepMerge(target, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch;
  const out = { ...(target && typeof target === "object" ? target : {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function writeExecutableStub(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, { encoding: "utf8", mode: 0o755 });
  fs.chmodSync(filePath, 0o755);
}

function toI18nText(val, zhFallback) {
  if (val && typeof val === "object" && "zh-CN" in val && "en-US" in val) {
    return val;
  }
  const str = String(val ?? "");
  return { "zh-CN": String(zhFallback ?? str), "en-US": str };
}

export function buildV2Package(targetDir, options = {}) {
  const dir = path.resolve(targetDir);
  const intent = options.intent || "agent";
  const specStrict = Boolean(options.specStrict);
  const defaultIdByIntent = {
    agent: "sample-agent",
    app: "opl-relay",
    extension: "opl-foundry",
    channel: "opl-channel-weixin",
  };
  const id = options.id || defaultIdByIntent[intent] || "sample-package";
  const version = options.version || "0.4.0";
  const pluginName = options.pluginName || id;
  const syncEnabled = options.syncEnabled !== undefined ? Boolean(options.syncEnabled) : intent !== "channel";

  fs.mkdirSync(dir, { recursive: true });
  const skillsDir = path.join(dir, "skills");
  const assetsDir = path.join(dir, "assets");
  const binDir = path.join(dir, "bin");
  const distDir = path.join(dir, "dist");

  fs.writeFileSync(path.join(dir, "README.md"), `# ${id}\n\nSynthetic v2 ${intent} package (${version}).\n`, "utf8");

  const normalizedConnections = Array.isArray(options.connections)
    ? options.connections.map((c) =>
        specStrict ? { ...c, reason: toI18nText(c.reason, c.reason) } : c
      )
    : undefined;

  let manifest = {
    schema_version: "opl.package.v2",
    identity: {
      id,
      version,
      intent,
      name: { "zh-CN": `${id} 中文名称`, "en-US": `${id} Title` },
      summary: { "zh-CN": `${id} 中文简介`, "en-US": `${id} summary` },
      description: { "zh-CN": `${id} 详细描述`, "en-US": `${id} detailed description` },
      publisher: "One Person Lab",
      license: "Apache-2.0",
      repository: `https://github.com/one-person-lab/${id}`,
      homepage: `https://onepersonlab.dev/${id}`,
      maturity: "stable",
      keywords: [intent, id],
      ...(intent === "agent"
        ? {
            icon: `assets/branding/${id}-logo.png`,
            default_prompts: [`Run ${id} primary workflow`, `Verify ${id} output`],
          }
        : {}),
    },
    dependencies: {
      opl_base: ">=2.0.0",
      packages: [],
      runtimes: [],
    },
    permissions: {
      workspace: {
        access: intent === "agent" ? "read_write" : "read",
        reason: specStrict
          ? { "zh-CN": "读写工作区产物", "en-US": "Read/write workspace artifacts" }
          : "Read/write workspace artifacts",
      },
      ...(normalizedConnections ? { connections: normalizedConnections } : {}),
    },
    provides: {},
    ui: {},
    host_hints: {
      codex: {
        sync_enabled: syncEnabled,
        plugin_name: pluginName,
        category: intent === "agent" ? "Research" : "Productivity",
        brand_color: "#2563EB",
        capabilities: ["Interactive", "Write"],
      },
    },
  };

  if (intent === "agent") {
    const skillId = options.skillId || id;
    const skillPath = path.join(skillsDir, skillId);
    fs.mkdirSync(skillPath, { recursive: true });
    fs.writeFileSync(
      path.join(skillPath, "SKILL.md"),
      `---\nname: ${skillId}\ndescription: Skill for ${id}\n---\n\n# ${skillId}\n\nExecute ${id} workflow cleanly.\n`,
      "utf8"
    );
    writePng(path.join(assetsDir, "branding", `${id}-logo.png`), 256);
    const handlerBin = path.join(binDir, `${id}-handler`);
    writeExecutableStub(
      handlerBin,
      `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ ok: true, package_id: ${JSON.stringify(id)} }) + "\\n");\n`
    );

    manifest.provides = {
      agent: {
        stages_ref: "./stages.json",
      },
      skills: [{ id: skillId, path: `./skills/${skillId}`, exposure: "default" }],
      contribution_handler: specStrict
        ? { kind: "cli", argv: [`./bin/${id}-handler`], transport: "stdin_json_stdout_json" }
        : { command: `./bin/${id}-handler` },
    };
    const stagesList =
      Array.isArray(options.stages) && options.stages.length > 0
        ? options.stages
        : [
            { stage_id: "stage_1", executor: "antigravity", model: "gemini-4-neon-high", role: "producer" },
            { stage_id: "stage_2", executor: "codex", model: "gpt-5-codex", role: "producer" },
          ];
    fs.writeFileSync(
      path.join(dir, "stages.json"),
      JSON.stringify(stagesList, null, 2),
      "utf8"
    );
    manifest.ui = {
      declarative: options.declarativeUi || {
        views: [
          {
            id: `${id}.detail`,
            ...(specStrict ? { view_type: "service_status", data_ref: `${id}.detail.state` } : {}),
            title: { "zh-CN": "任务详情", "en-US": "Task Detail" },
            slot: "runtime.detail",
          },
        ],
      },
    };
  } else if (intent === "app") {
    const mcpBin = path.join(binDir, `${id}-mcp`);
    const connBin = path.join(binDir, `${id}-provider`);
    writeExecutableStub(
      mcpBin,
      `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ ok: true, server: ${JSON.stringify(id)} }) + "\\n");\n`
    );
    writeExecutableStub(
      connBin,
      `#!/usr/bin/env node\nconst fs = require("node:fs");\nconst chunks = [];\nprocess.stdin.on("data", (c) => chunks.push(c));\nprocess.stdin.on("end", () => {\n  const raw = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};\n  const { secret: _secret, credential: _credential, ...safe } = raw && typeof raw === "object" ? raw : {};\n  if (process.env.OPL_CONNECT_PROVIDER_LOG) {\n    fs.appendFileSync(process.env.OPL_CONNECT_PROVIDER_LOG, JSON.stringify({ provider: ${JSON.stringify(id)}, argv: process.argv.slice(2), capability_id: safe.capability_id ?? null, has_secret: Boolean(_secret), input: safe.input ?? safe }) + "\\n", "utf8");\n  }\n  process.stdout.write(JSON.stringify({ ok: true, provider: ${JSON.stringify(id)}, capability_id: safe.capability_id ?? null, input: safe.input ?? safe }) + "\\n");\n});\n`
    );
    writePng(path.join(assetsDir, "branding", `${id}-logo.png`), 256);

    manifest.identity.icon = `assets/branding/${id}-logo.png`;
    manifest.provides = {
      mcp_servers: options.mcpServers || [
        {
          id: `${id}-mcp`,
          transport: "stdio",
          command: `./bin/${id}-mcp`,
          args: [],
        },
      ],
      connection_providers: options.connectionProviders || [
        {
          provider_type: `${id}.mailbox`,
          entrypoint: specStrict
            ? { kind: "cli", argv: [`./bin/${id}-provider`], transport: "stdin_json_stdout_json" }
            : `./bin/${id}-provider`,
          capabilities: [
            {
              id: "mailbox.search",
              title: specStrict ? { "zh-CN": "搜索邮箱", "en-US": "Search mailbox" } : "Search mailbox",
              risk: "read",
            },
            {
              id: "mailbox.read",
              title: specStrict ? { "zh-CN": "读取邮箱", "en-US": "Read mailbox" } : "Read mailbox",
              risk: "read",
            },
            {
              id: "draft.create",
              title: specStrict ? { "zh-CN": "创建草稿", "en-US": "Create draft" } : "Create draft",
              risk: "local_write",
            },
          ],
        },
      ],
      contribution_handler: specStrict
        ? { kind: "cli", argv: [`./bin/${id}-provider`], transport: "stdin_json_stdout_json" }
        : { command: `./bin/${id}-provider` },
    };
    manifest.ui = {
      mcp_apps: options.mcpApps || [
        {
          id: `${id}-workbench`,
          title: { "zh-CN": `${id} 工作台`, "en-US": `${id} Workbench` },
          mcp_server_id: `${id}-mcp`,
          resource_uri: `ui://${id}/workbench`,
          host_capabilities: ["theme_sync", "workspace_read", "connect_package_grant"],
        },
      ],
    };
  } else if (intent === "extension") {
    const skillId = options.skillId || `${id}-skill`;
    fs.mkdirSync(path.join(skillsDir, skillId), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, skillId, "SKILL.md"), `# ${skillId}\nExtension skill.\n`, "utf8");
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(
      path.join(distDir, "cli.mjs"),
      `export function registerFoundryCli() {\n  return { namespace: "foundry", commands: ["init", "validate", "eval", "compare", "promote", "rollback"] };\n}\n`,
      "utf8"
    );
    manifest.provides = {
      cli_extensions: options.cliExtensions || [
        {
          namespace: id === "opl-foundry" ? "foundry" : id,
          entrypoint: specStrict
            ? { kind: "esm_module", module: "./dist/cli.mjs", export: "registerFoundryCli" }
            : "./dist/cli.mjs",
        },
      ],
      skills: [{ id: skillId, path: `./skills/${skillId}`, exposure: "opt_in" }],
    };
  } else if (intent === "channel") {
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(
      path.join(distDir, "index.mjs"),
      `export function createWeixinChannelProvider() {\n  return { channelId: "weixin", status: "ready" };\n}\n`,
      "utf8"
    );
    const handlerBin = path.join(binDir, `${id}-handler`);
    writeExecutableStub(
      handlerBin,
      `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ ok: true, channel: "weixin" }) + "\\n");\n`
    );
    manifest.provides = {
      channels: options.channelProvider
        ? [options.channelProvider]
        : [
            {
              channel_id: "weixin",
              entrypoint: specStrict
                ? { kind: "esm_module", module: "./dist/index.mjs", export: "createWeixinChannelProvider" }
                : "./dist/index.mjs",
            },
          ],
      contribution_handler: specStrict
        ? { kind: "cli", argv: [`./bin/${id}-handler`], transport: "stdin_json_stdout_json" }
        : { command: `./bin/${id}-handler` },
    };
    manifest.ui = {
      declarative: options.declarativeUi || {
        views: [
          {
            id: `${id}.access`,
            title: { "zh-CN": "微信渠道接入", "en-US": "Weixin Channel Access" },
            view_type: "channel_access",
            slot: "settings.section",
            settings_destination: "resources",
            ...(specStrict ? { data_ref: `${id}.access.state` } : {}),
          },
        ],
      },
    };
    manifest.host_hints = {
      codex: {
        sync_enabled: syncEnabled,
        plugin_name: pluginName,
      },
    };
  }

  if (options.settingsForms) {
    manifest.ui = manifest.ui || {};
    manifest.ui.declarative = manifest.ui.declarative || {};
    manifest.ui.declarative.settings_forms = options.settingsForms;
  }
  const declViews = manifest.ui?.declarative?.views;
  const declForms = manifest.ui?.declarative?.settings_forms;
  if (
    ((Array.isArray(declViews) && declViews.length > 0) ||
      (Array.isArray(declForms) && declForms.length > 0)) &&
    !manifest.provides?.contribution_handler
  ) {
    const handlerBin = path.join(binDir, `${id}-handler`);
    writeExecutableStub(
      handlerBin,
      `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ ok: true, package_id: ${JSON.stringify(id)} }) + "\\n");\n`
    );
    manifest.provides = manifest.provides || {};
    manifest.provides.contribution_handler = specStrict
      ? { kind: "cli", argv: [`./bin/${id}-handler`], transport: "stdin_json_stdout_json" }
      : { command: `./bin/${id}-handler` };
  }

  if (options.skills) manifest.provides.skills = options.skills;
  if (options.assets && Array.isArray(options.assets)) {
    for (const assetRel of options.assets) {
      writePng(path.join(dir, assetRel), 128);
    }
  }
  if (options.includePluginMirrorDir) {
    const mirrorDir = path.join(dir, "plugins", pluginName, "skills", pluginName);
    fs.mkdirSync(mirrorDir, { recursive: true });
    fs.writeFileSync(path.join(mirrorDir, "SKILL.md"), `# Mirror ${pluginName}\n`, "utf8");
  }

  if (typeof options.manifestOverride === "function") {
    manifest = options.manifestOverride(manifest);
  } else if (options.manifestOverride && typeof options.manifestOverride === "object") {
    manifest = deepMerge(manifest, options.manifestOverride);
  }

  const manifestPath = path.join(dir, "opl-package.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  return { dir, manifestPath, manifest, skillsDir, assetsDir, binDir };
}

export function buildInvalidV2Fixture(targetDir, mode, options = {}) {
  const dir = path.resolve(targetDir);
  if (mode === "bad_id_or_semver") {
    const built = buildV2Package(dir, {
      intent: "agent",
      id: "mas",
      specStrict: true,
      manifestOverride: {
        identity: {
          id: "Med_AutoScience",
          version: "v1.bad",
        },
      },
    });
    return { ...built, mode };
  }
  if (mode === "bad_intent_or_i18n") {
    const built = buildV2Package(dir, {
      intent: "agent",
      id: "bad-intent",
      specStrict: true,
      manifestOverride: (m) => ({
        ...m,
        identity: {
          ...m.identity,
          intent: "standard_agent",
          name: { "en-US": "Missing ZH" },
        },
      }),
    });
    return { ...built, mode };
  }
  if (mode === "bad_declarative_ui") {
    const built = buildV2Package(dir, {
      intent: "agent",
      id: "bad-ui",
      specStrict: true,
      manifestOverride: (m) => ({
        ...m,
        ui: {
          declarative: {
            settings_forms: [
              {
                id: "bad.form",
                destination: "top_level_nav",
                title: { "zh-CN": "坏表单", "en-US": "Bad Form" },
                data_ref: "bad.form.state",
                submit_action_ref: "bad.form.submit",
              },
            ],
            views: [
              {
                id: "bad-ui.detail",
                view_type: "service_status",
                slot: "top_level",
                settings_destination: "top_level_nav",
                title: { "zh-CN": "坏视图", "en-US": "Bad View" },
                data_ref: "bad.view.state",
              },
            ],
          },
        },
      }),
    });
    return { ...built, mode };
  }
  if (mode === "unbound_mcp_app") {
    const built = buildV2Package(dir, {
      intent: "app",
      id: "unbound-app",
      specStrict: true,
      mcpApps: [
        {
          id: "unbound-workbench",
          title: { "zh-CN": "未绑定工作台", "en-US": "Unbound Workbench" },
          mcp_server_id: "undeclared-mcp-server",
          resource_uri: "ui://unbound-app/workbench",
          host_capabilities: ["theme_sync"],
        },
      ],
    });
    return { ...built, mode };
  }
  if (mode === "lock_digest_mismatch") {
    const built = buildV2Package(dir, {
      intent: "agent",
      id: options.id || "tampered-pkg",
      specStrict: true,
    });
    const lock = computeContentLock(built.dir);
    const lockPath = path.join(built.dir, "opl-release.lock.json");
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2), "utf8");
    tamperPackageFile(built.dir, "README.md", "\nTAMPERED");
    const archiveInfo = options.archiveOutDir
      ? createLocalPackageArchive(built.dir, options.archiveOutDir, { includeLockFile: true })
      : null;
    return { ...built, mode, lockPath, lock, ...(archiveInfo ? { archivePath: archiveInfo.archivePath } : {}) };
  }
  throw new Error(`Unknown invalid v2 mode: ${mode}`);
}

export const WAVE3_DOMAIN_PRESETS = {
  mas: {
    packageId: "mas",
    pluginName: "med-autoscience",
    shape: "A",
    version: "0.3.2",
    displayName: "Med Auto Science",
    logoRel: "assets/branding/medautoscience-logo.png",
    hasRootCodexPlugin: true,
    brandColor: "#1F7A8C",
    category: "Research",
    extraMirrorDirs: ["plugins/mas-scholar-skills", "plugins/opl-foundation-skills"],
  },
  mag: {
    packageId: "mag",
    pluginName: "med-autogrant",
    shape: "A",
    version: "0.4.3",
    displayName: "Med AutoGrant",
    logoRel: "assets/branding/medautogrant-logo.png",
    hasRootCodexPlugin: true,
    brandColor: "#2E6E9E",
    category: "Research",
    enOnlyRoutingSummary: true,
  },
  rca: {
    packageId: "rca",
    pluginName: "redcube-ai",
    shape: "A",
    version: "0.3.4",
    displayName: "RedCube AI",
    logoRel: "plugins/redcube-ai/assets/icon.png",
    hasRootCodexPlugin: true,
    omitTopLevelKind: true,
    omitPresentationIconRef: true,
    brandColor: "#C65D2E",
    category: "Creative",
    enOnlyRoutingSummary: true,
  },
  obf: {
    packageId: "obf",
    pluginName: "opl-bookforge",
    shape: "A",
    version: "0.4.2",
    displayName: "OPL BookForge",
    logoRel: "assets/branding/opl-bookforge-logo.png",
    hasRootCodexPlugin: false,
    omitTopLevelKind: true,
    brandColor: "#6B5A3A",
    category: "Writing",
    enOnlyRoutingSummary: true,
  },
  occ: {
    packageId: "occ",
    pluginName: "occ",
    carrierSlug: "opl-capital-compass",
    shape: "A",
    version: "0.2.2",
    displayName: "OPL Capital Compass",
    logoRel: "assets/branding/opl-capital-compass-logo.png",
    hasRootCodexPlugin: true,
    brandColor: "#1F6F5C",
    category: "Finance",
    visibility: "authorized_only",
    extraMirrorDirs: ["plugins/assets"],
  },
  "opl-relay": {
    packageId: "opl-relay",
    pluginName: "opl-relay",
    shape: "B",
    version: "0.7.8",
    displayName: "OPL Relay",
    brandColor: "#1260E8",
    category: "Productivity",
    viewsCount: 5,
    cmdsCount: 10,
  },
  "opl-persona": {
    packageId: "opl-persona",
    pluginName: "opl-persona",
    shape: "B",
    version: "0.5.4",
    displayName: "OPL Persona",
    brandColor: "#BE304A",
    category: "Productivity",
    viewsCount: 7,
    cmdsCount: 18,
  },
  "opl-channel-weixin": {
    packageId: "opl-channel-weixin",
    pluginName: "opl-channel-weixin",
    shape: "C",
    version: "0.2.0",
    displayName: "OPL Channel Weixin",
    category: "Developer Tools",
  },
};

function makeCodexPluginJson({
  name,
  version,
  displayName,
  skills,
  logo,
  category = "Research",
  brandColor = "#1F7A8C",
  defaultPrompt,
  mcpServers,
} = {}) {
  return {
    name,
    version,
    description: `${displayName} plugin`,
    author: { name: "One Person Lab", url: "https://github.com/one-person-lab" },
    homepage: `https://onepersonlab.dev/${name}`,
    repository: `https://github.com/one-person-lab/${name}`,
    license: "Apache-2.0",
    keywords: ["opl", name],
    ...(skills ? { skills } : {}),
    ...(mcpServers ? { mcpServers } : {}),
    interface: {
      displayName,
      shortDescription: `${displayName} short description`,
      longDescription: `${displayName} long description`,
      developerName: "One Person Lab",
      category,
      capabilities: ["Interactive", "Write"],
      websiteURL: `https://onepersonlab.dev/${name}`,
      ...(logo ? { composerIcon: logo, logo } : {}),
      defaultPrompt: defaultPrompt || [`Launch ${displayName}`],
      brandColor,
    },
  };
}

function writeCarrierProjectionFile(dir, pluginName) {
  const filePath = path.join(dir, "contracts", "carrier_projection.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        schema_version: "opl_carrier_projection.v1",
        carrier_root: `plugins/${pluginName}`,
        file_aliases: [{ from: "agent/primary_skill/SKILL.md", to: `skills/${pluginName}/SKILL.md` }],
      },
      null,
      2
    ),
    "utf8"
  );
  return filePath;
}

export function addLegacyCarrierFiles(targetDir, opts = {}) {
  const dir = path.resolve(targetDir);
  const { carrierProjection = true, rootPluginJson = true } = opts;
  let pkg = {};
  const manifestPath = path.join(dir, "opl-package.json");
  if (fs.existsSync(manifestPath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      pkg = {};
    }
  }
  const pluginName = opts.pluginName || pkg.codex_surface?.plugin_id || pkg.host_hints?.codex?.plugin_name || pkg.package_id || "legacy-plugin";
  const version = opts.version || pkg.version || "0.3.2";
  const displayName = opts.displayName || pkg.presentation?.display_name_i18n?.["en-US"] || pluginName;

  let carrierProjectionPath = null;
  if (carrierProjection) {
    carrierProjectionPath = writeCarrierProjectionFile(dir, pluginName);
  }
  let rootPluginJsonPath = null;
  if (rootPluginJson) {
    rootPluginJsonPath = path.join(dir, "plugin.json");
    const codex = makeCodexPluginJson({ name: pluginName, version, displayName });
    fs.writeFileSync(
      rootPluginJsonPath,
      JSON.stringify({ name: pluginName, version, extensions: { "com.openai": { interface: codex.interface } } }, null, 2),
      "utf8"
    );
  }
  return { carrierProjectionPath, rootPluginJsonPath };
}

export function readCodexMarketplaceProjection(oplHome, pluginName) {
  const marketplaceRoot = path.join(path.resolve(oplHome), "carriers", "codex-marketplace");
  const marketplacePath = path.join(marketplaceRoot, "marketplace.json");
  const marketplace = fs.existsSync(marketplacePath) ? JSON.parse(fs.readFileSync(marketplacePath, "utf8")) : null;

  const pluginDir = path.join(marketplaceRoot, "plugins", pluginName);
  const pluginJsonPath = path.join(pluginDir, ".codex-plugin", "plugin.json");
  const pluginJson = fs.existsSync(pluginJsonPath) ? JSON.parse(fs.readFileSync(pluginJsonPath, "utf8")) : null;

  const mcpJsonPath = path.join(pluginDir, "mcp.json");
  const mcpJson = fs.existsSync(mcpJsonPath) ? JSON.parse(fs.readFileSync(mcpJsonPath, "utf8")) : null;

  const skillsLinkPath = path.join(pluginDir, "skills");
  const skillsLstat = lstatSafe(skillsLinkPath);
  const skillsIsSymlink = Boolean(skillsLstat?.isSymbolicLink());
  let skillsTarget = null;
  let skillsRealPath = null;
  if (skillsIsSymlink) {
    skillsTarget = fs.readlinkSync(skillsLinkPath);
    try {
      skillsRealPath = fs.realpathSync(skillsLinkPath);
    } catch {
      skillsRealPath = null;
    }
  }

  const assetsLinkPath = path.join(pluginDir, "assets");
  const assetsLstat = lstatSafe(assetsLinkPath);
  const assetsIsSymlink = Boolean(assetsLstat?.isSymbolicLink());
  let assetsTarget = null;
  let assetsRealPath = null;
  if (assetsIsSymlink) {
    assetsTarget = fs.readlinkSync(assetsLinkPath);
    try {
      assetsRealPath = fs.realpathSync(assetsLinkPath);
    } catch {
      assetsRealPath = null;
    }
  }

  return {
    marketplaceRoot,
    marketplacePath,
    marketplace,
    pluginDir,
    pluginJsonPath,
    pluginJson,
    mcpJsonPath,
    mcpJson,
    skillsLinkPath,
    skillsIsSymlink,
    skillsTarget,
    skillsRealPath,
    assetsLinkPath,
    assetsIsSymlink,
    assetsTarget,
    assetsRealPath,
  };
}

export function buildV1DomainFixture(targetDir, presetName, overrides = {}) {
  const preset = WAVE3_DOMAIN_PRESETS[presetName];
  if (!preset) {
    throw new Error(`Unknown Wave 3 domain preset: ${presetName}`);
  }
  const dir = path.resolve(targetDir);
  fs.mkdirSync(dir, { recursive: true });

  if (preset.shape === "A") {
    const { packageId, pluginName, version, displayName, logoRel, brandColor, category } = preset;
    const mirrorRoot = path.join(dir, "plugins", pluginName);
    const mirrorSkillDir = path.join(mirrorRoot, "skills", pluginName);
    fs.mkdirSync(mirrorSkillDir, { recursive: true });
    fs.writeFileSync(path.join(mirrorSkillDir, "SKILL.md"), `---\nname: ${pluginName}\n---\n# ${displayName}\n`, "utf8");
    writePng(path.join(dir, logoRel), 256);

    if (preset.logoRel.startsWith("plugins/")) {
      writePng(path.join(dir, "assets", "branding", `${pluginName}-logo.png`), 256);
    }

    for (const extraDir of preset.extraMirrorDirs || []) {
      if (extraDir === "plugins/assets") {
        writePng(path.join(dir, extraDir, "branding", `${pluginName}-extra.png`), 128);
      } else {
        const fullExtra = path.join(dir, extraDir, "skills", path.basename(extraDir));
        fs.mkdirSync(fullExtra, { recursive: true });
        fs.writeFileSync(path.join(fullExtra, "SKILL.md"), `# ${extraDir}\n`, "utf8");
      }
    }

    // All Shape A repos carry contracts/carrier_projection.json
    writeCarrierProjectionFile(dir, pluginName);

    // Seed plugins/<pluginName>/{plugin.json, .codex-plugin/plugin.json} across Shape A
    const nestedCodex = makeCodexPluginJson({
      name: pluginName,
      version,
      displayName,
      skills: "./skills/",
      logo: presetName === "obf" ? "./assets/branding/opl-bookforge-logo.png" : "./assets/icon.png",
      category,
      brandColor,
    });
    fs.mkdirSync(path.join(mirrorRoot, ".codex-plugin"), { recursive: true });
    fs.writeFileSync(path.join(mirrorRoot, ".codex-plugin", "plugin.json"), JSON.stringify(nestedCodex, null, 2), "utf8");
    fs.writeFileSync(
      path.join(mirrorRoot, "plugin.json"),
      JSON.stringify({ name: pluginName, version, extensions: { "com.openai": { interface: nestedCodex.interface } } }, null, 2),
      "utf8"
    );

    if (presetName === "mas") {
      fs.mkdirSync(path.join(dir, "agent/primary_skill"), { recursive: true });
      fs.writeFileSync(path.join(dir, "agent/primary_skill/SKILL.md"), `---\nname: ${pluginName}\n---\n# ${displayName}\n`, "utf8");
      writeExecutableStub(
        path.join(mirrorRoot, "bin/mas-app-contribution"),
        `#!/usr/bin/env python3\nfrom opl_framework.app_contribution import read_stdin_json\nprint(read_stdin_json())\n`
      );
      fs.writeFileSync(
        path.join(dir, "app-contribution-adapter.json"),
        JSON.stringify({ schema_version: "opl_app_contribution_adapter.v1", views: { "mas.runtime-detail.v1#current": "./bin/mas-app-contribution" } }, null, 2),
        "utf8"
      );
      fs.writeFileSync(
        path.join(mirrorRoot, "opl-package.json"),
        JSON.stringify({ surface_kind: "opl_agent_package_manifest.v1", package_id: "mas", version }, null, 2),
        "utf8"
      );
    } else if (presetName === "mag") {
      fs.mkdirSync(path.join(dir, "agent/primary_skill"), { recursive: true });
      fs.writeFileSync(path.join(dir, "agent/primary_skill/SKILL.md"), `---\nname: ${pluginName}\n---\n# ${displayName}\n`, "utf8");
      fs.mkdirSync(path.join(dir, "src/med_autogrant"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "src/med_autogrant/cli.py"),
        `from opl_framework.executor_client import run_agent_execution_request\n`,
        "utf8"
      );
      fs.writeFileSync(
        path.join(dir, "app-contribution-adapter.json"),
        JSON.stringify({ schema_version: "opl_app_contribution_adapter.v1", command: "python3 runtime/app_contribution.py" }, null, 2),
        "utf8"
      );
      fs.writeFileSync(
        path.join(mirrorRoot, "opl-package.json"),
        JSON.stringify({ surface_kind: "opl_agent_package_manifest.v1", package_id: "mag", version }, null, 2),
        "utf8"
      );
    } else if (presetName === "rca") {
      fs.mkdirSync(path.join(dir, "agent/primary_skill"), { recursive: true });
      fs.writeFileSync(path.join(dir, "agent/primary_skill/SKILL.md"), `---\nname: ${pluginName}\n---\n# ${displayName}\n`, "utf8");
      fs.mkdirSync(path.join(dir, "python/redcube_ai/native_helpers"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "python/redcube_ai/native_helpers/renderer_dependencies.py"),
        `from opl_framework import dependency_probe\n`,
        "utf8"
      );
      fs.writeFileSync(
        path.join(mirrorRoot, "opl-package.json"),
        JSON.stringify({ surface_kind: "opl_agent_package_manifest.v1", package_id: "rca", kind: "agent", version }, null, 2),
        "utf8"
      );
    } else if (presetName === "obf") {
      fs.mkdirSync(path.join(dir, "runtime/native_helpers"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "runtime/native_helpers/bookforge_pdf_export.py"),
        `from opl_framework.artifact_inspection import render_pdf_pages\n`,
        "utf8"
      );
      fs.writeFileSync(
        path.join(mirrorRoot, "opl-package.json"),
        JSON.stringify({ surface_kind: "opl_agent_package_manifest.v1", package_id: "obf", version }, null, 2),
        "utf8"
      );
    } else if (presetName === "occ") {
      fs.mkdirSync(path.join(dir, "runtime"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "runtime/app_contribution.py"),
        `from opl_framework.app_contribution import read_stdin_json\n`,
        "utf8"
      );
      // Real OCC intentionally omits plugins/occ/opl-package.json
    }

    const appContributionsByPreset = {
      mas: {
        views: [
          {
            view_id: "mas.runtime-detail",
            view_type: "service_status",
            title_i18n: { "zh-CN": "MAS 运行详情", "en-US": "MAS Runtime Detail" },
            data_ref: "mas.runtime.detail",
          },
        ],
        ui: [{ view_id: "mas.runtime-detail", slot: "runtime.detail" }],
        commands: [],
      },
      mag: {
        views: [
          {
            view_id: "mag.workspace.route",
            view_type: "service_status",
            title_i18n: { "zh-CN": "基金路线", "en-US": "Grant Route" },
            data_ref: "mag.workspace.route",
            command_ids: ["mag.review.note"],
          },
          {
            view_id: "mag.workspace.quality",
            view_type: "activity_log",
            title_i18n: { "zh-CN": "质量检查", "en-US": "Quality" },
            data_ref: "mag.workspace.quality",
          },
        ],
        ui: [
          { view_id: "mag.workspace.route", slot: "runtime.detail" },
          { view_id: "mag.workspace.quality", slot: "settings.section" },
        ],
        commands: [
          {
            command_id: "mag.review.note",
            label_i18n: { "zh-CN": "记录审阅批注", "en-US": "Record Review Note" },
            action_ref: "mag.review.note",
            confirmation_required: true,
          },
        ],
      },
      rca: {
        views: [
          {
            view_id: "rca.stage.a",
            view_type: "service_status",
            title_i18n: { "zh-CN": "创意概览", "en-US": "Creative Overview" },
            data_ref: "rca.stage.a",
          },
          {
            view_id: "rca.stage.b",
            view_type: "activity_log",
            title_i18n: { "zh-CN": "渲染日志", "en-US": "Render Log" },
            data_ref: "rca.stage.b",
          },
        ],
        ui: [
          { view_id: "rca.stage.a", slot: "runtime.detail" },
          { view_id: "rca.stage.b", slot: "runtime.detail" },
        ],
        commands: [],
      },
      obf: {
        views: [
          {
            view_id: "obf.outline",
            view_type: "service_status",
            title_i18n: { "zh-CN": "全书大纲", "en-US": "Book Outline" },
            data_ref: "obf.outline",
          },
        ],
        ui: [{ view_id: "obf.outline", slot: "runtime.detail" }],
        commands: [],
      },
      occ: {
        views: [
          {
            view_id: "occ.task",
            view_type: "service_status",
            title_i18n: { "zh-CN": "投研任务", "en-US": "Research Task" },
            data_ref: "occ.task",
          },
          {
            view_id: "occ.decision-review",
            view_type: "approval_diff",
            title_i18n: { "zh-CN": "决策审阅", "en-US": "Decision Review" },
            data_ref: "occ.decision-review",
          },
        ],
        ui: [
          { view_id: "occ.task", slot: "settings.section", scope: "root" },
          { view_id: "occ.decision-review", slot: "settings.section", scope: "root" },
        ],
        commands: [],
      },
    };

    let manifest = {
      ...(overrides.useLegacySchemaVersion
        ? { schema_version: "opl_agent_package_manifest.v1" }
        : { surface_kind: "opl_agent_package_manifest.v1" }),
      package_id: packageId,
      agent_id: packageId,
      ...(!preset.omitTopLevelKind ? { kind: "agent" } : {}),
      ...(presetName === "mag" ? { domain_id: "med-autogrant" } : {}),
      version,
      publisher: "one-person-lab",
      ...(preset.visibility ? { visibility: preset.visibility } : {}),
      ...(preset.carrierSlug ? { carrier_slug: preset.carrierSlug } : {}),
      ...(presetName === "occ"
        ? { access_policy_ref: "contracts/access-policy.json", credential_provider: "github_packages" }
        : {}),
      presentation: {
        display_name_i18n: { "zh-CN": `${displayName} 中文`, "en-US": displayName },
        description_i18n: { "zh-CN": `${displayName} 中文简介`, "en-US": `${displayName} v1 summary` },
        session_routing_summary_i18n: preset.enOnlyRoutingSummary
          ? { "en-US": `Route to ${displayName}` }
          : { "zh-CN": `路由至 ${displayName}`, "en-US": `Route to ${displayName}` },
        ...(!preset.omitPresentationIconRef ? { icon_ref: logoRel } : {}),
        ...(presetName === "mas"
          ? {
              home_shortcuts: [
                { shortcut_id: "research", label_i18n: { "zh-CN": "发起医学研究", "en-US": "Start Research" }, default_visible: true },
              ],
            }
          : {}),
      },
      requires: presetName === "mas" ? [{ package_id: "mas-scholar-skills", presence: "required" }] : [],
      capability_dependencies:
        presetName === "mas"
          ? [
              {
                module_id: "scholarskills",
                package_id: "mas-scholar-skills",
                required: true,
                required_export_ids: ["literature_search", "citation_verify"],
                required_module_ids: ["scholarskills"],
              },
            ]
          : presetName === "mag"
            ? [
                {
                  package_id: "mas-scholar-skills",
                  required: true,
                  version_requirement: ">=0.2.25 <0.3.0",
                  required_export_ids: ["literature_search"],
                  required_module_ids: ["scholarskills"],
                },
              ]
            : [],
      ...(presetName === "rca"
        ? {
            required_skill_ids: [pluginName],
            permissions: [{ permission_id: "workspace.rw", scope: "workspace", access: "read_write" }],
            entrypoints: [
              { entrypoint_id: "codex-primary-skill", kind: "codex_primary_skill" },
              { entrypoint_id: "hosted-stage-actions", kind: "hosted_stage_actions" },
            ],
          }
        : {}),
      codex_surface: {
        plugin_id: pluginName,
        required_skill_ids: [pluginName],
        ...(presetName === "mas"
          ? {
              required_capability_package_ids: ["mas-scholar-skills"],
              app_contribution_abi: { argv: ["opl", "app", "contribution", "adapter", "--stdin"] },
              app_contribution_adapter: { manifest: "app-contribution-adapter.json" },
            }
          : {}),
        ...(presetName === "mag" ? { bundled_capability_package_ids: ["mas-scholar-skills"] } : {}),
      },
      skill_packs: [
        {
          id: pluginName,
          ...(presetName === "rca" ? { source_ref: "agent/primary_skill/SKILL.md" } : {}),
          carrier_mirror_ref: `./plugins/${pluginName}/skills/${pluginName}`,
        },
      ],
      app_contributions: appContributionsByPreset[presetName],
    };

    manifest = deepMerge(manifest, overrides.manifest || {});
    fs.writeFileSync(path.join(dir, "opl-package.json"), JSON.stringify(manifest, null, 2), "utf8");

    if (preset.hasRootCodexPlugin) {
      fs.mkdirSync(path.join(dir, ".codex-plugin"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, ".codex-plugin/plugin.json"),
        JSON.stringify(
          makeCodexPluginJson({
            name: pluginName,
            version,
            displayName,
            skills: `./plugins/${pluginName}/skills/`,
            logo: `./${logoRel}`,
            category,
            brandColor,
          }),
          null,
          2
        ),
        "utf8"
      );
    }

    return { dir, preset: presetName, shape: "A", manifestPath: path.join(dir, "opl-package.json") };
  }

  if (preset.shape === "B") {
    const { packageId, pluginName, version, displayName, viewsCount, cmdsCount, brandColor, category } = preset;
    const nestedDir = path.join(dir, "plugins", pluginName);
    const nestedSkillDir = path.join(nestedDir, "skills", pluginName);
    const pkgPyDir = pluginName.replace(/-/g, "_");
    fs.mkdirSync(nestedSkillDir, { recursive: true });
    fs.writeFileSync(path.join(nestedSkillDir, "SKILL.md"), `# ${displayName}\n`, "utf8");
    writePng(path.join(dir, "assets/branding", `${pluginName}-logo.png`), 256);
    writePng(path.join(nestedDir, "assets/icon.png"), 256);

    fs.mkdirSync(path.join(nestedDir, "runtime", pkgPyDir), { recursive: true });
    fs.writeFileSync(
      path.join(nestedDir, "runtime", pkgPyDir, "app_contributions.py"),
      `from opl_framework.app_contribution import read_stdin_json\n`,
      "utf8"
    );
    writeExecutableStub(path.join(nestedDir, "bin", pluginName), `#!/usr/bin/env python3\nprint("{}")\n`);

    if (presetName === "opl-relay") {
      fs.mkdirSync(path.join(nestedDir, "workbench"), { recursive: true });
      fs.writeFileSync(path.join(nestedDir, "workbench/index.html"), "<!doctype html><html><body>Relay</body></html>\n", "utf8");
      fs.writeFileSync(path.join(nestedDir, "workbench/server.mjs"), "// stub workbench mcp server\n", "utf8");
      fs.writeFileSync(
        path.join(nestedDir, "mcp.json"),
        JSON.stringify(
          {
            mcpServers: {
              "mail-workbench": {
                type: "stdio",
                command: "node",
                args: ["${PLUGIN_ROOT}/workbench/server.mjs"],
                cwd: "${PLUGIN_ROOT}",
              },
            },
          },
          null,
          2
        ),
        "utf8"
      );
    } else if (presetName === "opl-persona") {
      fs.writeFileSync(
        path.join(nestedDir, "app-contribution-adapter.json"),
        JSON.stringify({ schema_version: "opl_app_contribution_adapter.v1", views: {} }, null, 2),
        "utf8"
      );
    }

    fs.mkdirSync(path.join(nestedDir, ".codex-plugin"), { recursive: true });
    const nestedCodex = makeCodexPluginJson({
      name: pluginName,
      version,
      displayName,
      skills: "./skills/",
      logo: "./assets/icon.png",
      category,
      brandColor,
      ...(presetName === "opl-relay" ? { mcpServers: "./mcp.json" } : {}),
    });
    fs.writeFileSync(path.join(nestedDir, ".codex-plugin/plugin.json"), JSON.stringify(nestedCodex, null, 2), "utf8");
    fs.writeFileSync(
      path.join(nestedDir, "plugin.json"),
      JSON.stringify({ name: pluginName, version, extensions: { "com.openai": { interface: nestedCodex.interface } } }, null, 2),
      "utf8"
    );

    const views = Array.from({ length: viewsCount }, (_, i) => ({
      view_id: `${pluginName}.view.${i + 1}`,
      view_type: "list_detail",
      data_ref: `${pluginName}.view.${i + 1}.data`,
      title_i18n: { "zh-CN": `视图 ${i + 1}`, "en-US": `View ${i + 1}` },
    }));
    const ui = views.map((v) => ({
      view_id: v.view_id,
      slot: "settings.section",
      settings_destination: "resources",
    }));
    const commands = Array.from({ length: cmdsCount }, (_, i) => ({
      command_id: `${pluginName}.cmd.${i + 1}`,
      label_i18n: { "zh-CN": `命令 ${i + 1}`, "en-US": `Command ${i + 1}` },
      action_ref: `${pluginName}.cmd.${i + 1}`,
    }));

    const lock = computeContentLock(nestedDir);
    let nestedManifest = {
      ...(overrides.useLegacySchemaVersion
        ? { schema_version: "opl_capability_package_manifest.v2" }
        : { surface_kind: "opl_capability_package_manifest.v2" }),
      package_id: packageId,
      version,
      package_role: "capability_package",
      ...(presetName === "opl-persona" ? { display_name: displayName } : {}),
      exports: { core_skill_ids: [pluginName] },
      ...(presetName === "opl-relay"
        ? {
            presentation: {
              display_name_i18n: { "zh-CN": `${displayName} 中文`, "en-US": displayName },
              description_i18n: { "zh-CN": `${displayName} 能力包`, "en-US": `${displayName} capability package` },
              icon_ref: "assets/icon.png",
              miniapp: {
                presentation_mode: "dedicated_app",
                entry_kind: "product_entry",
                direct_entry: true,
                entry_view_id: "relay.inbox",
                dedicated_resource_uri: "ui://opl-relay/mail-workbench.html",
              },
            },
          }
        : {}),
      codex_surface: {
        plugin_id: pluginName,
        codex_default_exposure: false,
        app_contribution_abi: {
          argv:
            presetName === "opl-relay"
              ? ["./bin/opl-relay", "--json", "app-contribution"]
              : ["opl", "app", "contribution", "adapter", "--stdin"],
        },
        ...(presetName === "opl-persona"
          ? { app_contribution_adapter: { manifest: "app-contribution-adapter.json" } }
          : {}),
      },
      app_contributions: {
        navigation: [{ id: `${pluginName}.nav`, label_i18n: { "zh-CN": displayName, "en-US": displayName } }],
        views,
        ui,
        commands,
      },
      content_lock: {
        algorithm: lock.algorithm,
        canonicalization: lock.canonicalization,
        paths: lock.paths,
        digest: lock.digest,
      },
    };
    nestedManifest = deepMerge(nestedManifest, overrides.manifest || {});
    const manifestPath = path.join(nestedDir, "opl-package.json");
    fs.writeFileSync(manifestPath, JSON.stringify(nestedManifest, null, 2), "utf8");

    return { dir, preset: presetName, shape: "B", manifestPath };
  }

  // Shape C: opl-channel-weixin
  const { packageId, pluginName, version, displayName, category } = preset;
  fs.mkdirSync(path.join(dir, "dist/src"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "dist/src/index.js"),
    `export function createInstalledWeixinChannelProvider() {\n  return { channelId: "weixin" };\n}\n`,
    "utf8"
  );
  fs.mkdirSync(path.join(dir, ".codex-plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".codex-plugin/plugin.json"),
    JSON.stringify({ name: pluginName, version, description: displayName, interface: { displayName, developerName: "One Person Lab", category } }, null, 2),
    "utf8"
  );

  let manifest = {
    ...(overrides.useLegacySchemaVersion
      ? { schema_version: "opl_capability_package_manifest.v2" }
      : { surface_kind: "opl_capability_package_manifest.v2" }),
    package_id: packageId,
    version,
    package_role: "capability_package",
    integration_kind: "capability_provider",
    display_name: displayName,
    exports: { core_skill_ids: [] },
    entrypoints: [
      {
        entrypoint_id: "weixin-channel-provider",
        kind: "channel_provider",
        module_ref: "dist/src/index.js",
        export_name: "createInstalledWeixinChannelProvider",
      },
    ],
    codex_surface: {
      plugin_id: pluginName,
      plugin_source_path: "packages/opl-channel-weixin",
      codex_default_exposure: false,
      interaction_mode: "headless_internal",
      required_skill_ids: [],
    },
    app_contributions: {
      views: [
        {
          view_id: "weixin-channel-access",
          view_type: "channel_access",
          title_i18n: { en: "Weixin", "zh-CN": "微信" },
          empty_state_i18n: { en: "Not connected", "zh-CN": "未连接" },
          data_ref: "weixin.access.state",
          command_ids: ["weixin.connect"],
        },
      ],
      ui: [
        {
          view_id: "weixin-channel-access",
          slot: "settings.section",
          settings_destination: "resources",
        },
      ],
      commands: [
        {
          command_id: "weixin.connect",
          label_i18n: { en: "Connect Weixin", "zh-CN": "连接微信" },
          action_ref: "weixin.connect",
        },
      ],
    },
  };
  manifest = deepMerge(manifest, overrides.manifest || {});
  const manifestPath = path.join(dir, "opl-package.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return { dir, preset: presetName, shape: "C", manifestPath };
}

export function buildAll8Wave3Fixtures(baseDir) {
  const root = path.resolve(baseDir);
  fs.mkdirSync(root, { recursive: true });
  const result = {};
  for (const presetName of Object.keys(WAVE3_DOMAIN_PRESETS)) {
    result[presetName] = buildV1DomainFixture(path.join(root, presetName), presetName);
  }
  return result;
}

export function buildCorruptV1Fixture(targetDir, mode) {
  const dir = path.resolve(targetDir);
  fs.mkdirSync(dir, { recursive: true });

  if (mode === "missing_manifest") {
    fs.writeFileSync(path.join(dir, "README.md"), "# Empty repo without opl-package.json\n", "utf8");
    return { dir, mode };
  }
  if (mode === "already_v2") {
    return buildV2Package(dir, { id: "already-v2-pkg", intent: "agent", specStrict: true });
  }
  if (mode === "invalid_codex_json") {
    const built = buildV1DomainFixture(dir, "mas");
    fs.writeFileSync(path.join(dir, ".codex-plugin/plugin.json"), "{corrupt-json", "utf8");
    return { ...built, mode };
  }
  if (mode === "missing_i18n") {
    const built = buildV1DomainFixture(dir, "mas", {
      manifest: {
        presentation: {
          display_name_i18n: null,
          description_i18n: null,
        },
      },
    });
    return { ...built, mode };
  }
  if (mode === "conflicting_deps") {
    const built = buildV1DomainFixture(dir, "mas", {
      manifest: {
        requires: [{ package_id: "mas-scholar-skills", presence: "required" }],
        capability_dependencies: [{ package_id: "mas-scholar-skills", required: false }],
        codex_surface: { required_capability_package_ids: ["mas-scholar-skills"] },
      },
    });
    return { ...built, mode };
  }
  throw new Error(`Unknown corrupt v1 mode: ${mode}`);
}

export function tamperPackageFile(pkgDir, relPath = "README.md", appendByte = " ") {
  const target = path.resolve(pkgDir, relPath);
  if (!target.startsWith(path.resolve(pkgDir) + path.sep)) {
    throw new Error(`Refusing tamper outside pkgDir: ${relPath}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const prev = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  fs.writeFileSync(target, prev + appendByte, "utf8");
  return target;
}

export function escalateProviderCapability(pkgDir, { capabilityId, newRisk = "external_write", newTitle } = {}) {
  const manifestPath = path.join(pkgDir, "opl-package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  let updated = false;
  for (const prov of manifest.provides?.connection_providers || []) {
    for (const cap of prov.capabilities || []) {
      if (!capabilityId || cap.id === capabilityId) {
        cap.risk = newRisk;
        if (newTitle) cap.title = newTitle;
        updated = true;
      }
    }
  }
  if (!updated) {
    throw new Error(`No matching capability found in ${manifestPath} for capabilityId=${capabilityId}`);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

export function buildExternalCodexPlugin(marketplaceDir, { id = "external-tool", version = "1.0.0", displayName = "External Tool" } = {}) {
  const mpRoot = path.resolve(marketplaceDir);
  const pluginDir = path.join(mpRoot, "plugins", id);
  fs.mkdirSync(path.join(pluginDir, ".codex-plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, ".codex-plugin/plugin.json"),
    JSON.stringify(makeCodexPluginJson({ name: id, version, displayName, skills: "./skills/" }), null, 2),
    "utf8"
  );
  fs.mkdirSync(path.join(pluginDir, "skills", id), { recursive: true });
  fs.writeFileSync(path.join(pluginDir, "skills", id, "SKILL.md"), `# ${displayName}\n`, "utf8");

  const mpJsonPath = path.join(mpRoot, "marketplace.json");
  const mp = fs.existsSync(mpJsonPath)
    ? JSON.parse(fs.readFileSync(mpJsonPath, "utf8"))
    : { name: "opl-local", plugins: [] };
  mp.plugins = (mp.plugins || []).filter((p) => p.name !== id);
  mp.plugins.push({ name: id, source: `./plugins/${id}`, version });
  fs.writeFileSync(mpJsonPath, JSON.stringify(mp, null, 2), "utf8");
  return { marketplacePath: mpJsonPath, pluginDir, id, version };
}

export function buildKnowledgeSourceDir(dir, files) {
  const root = path.resolve(dir);
  fs.mkdirSync(root, { recursive: true });
  const spec = files || {
    "notes/protocol.md": "# Study Protocol\nPrimary endpoint: MACE at 12 months.\n",
    "notes/cohort.md": "# Cohort Summary\nn = 420 patients enrolled across 3 sites.\n",
  };
  const digests = {};
  for (const [rel, content] of Object.entries(spec)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
    digests[rel] = `sha256:${crypto.createHash("sha256").update(content, "utf8").digest("hex")}`;
  }
  return { dir: root, files: Object.keys(spec), digests };
}

function splitUstarPath(rel) {
  const normalized = String(rel).replace(/\\/g, "/");
  const fullBytes = Buffer.from(normalized, "utf8");
  if (fullBytes.length <= 100) {
    return { nameBytes: fullBytes, prefixBytes: null };
  }
  if (fullBytes.length > 256) {
    throw new Error(`Tar entry path > 256 bytes (USTAR limit): ${rel}`);
  }
  for (let i = normalized.indexOf("/"); i !== -1; i = normalized.indexOf("/", i + 1)) {
    const prefix = normalized.slice(0, i);
    const name = normalized.slice(i + 1);
    if (!prefix || !name) continue;
    const prefixBytes = Buffer.from(prefix, "utf8");
    const nameBytes = Buffer.from(name, "utf8");
    if (prefixBytes.length <= 155 && nameBytes.length <= 100) {
      return { nameBytes, prefixBytes };
    }
  }
  throw new Error(`Tar entry path cannot fit USTAR prefix(<=155)/name(<=100): ${rel}`);
}

function createUstarBuffer(entries) {
  const blocks = [];
  for (const { rel, bytes, mode } of entries) {
    const header = Buffer.alloc(512, 0);
    const { nameBytes, prefixBytes } = splitUstarPath(rel);
    nameBytes.copy(header, 0);
    const modeVal = (mode === undefined || mode === null ? 0o644 : Number(mode)) & 0o777;
    Buffer.from(`${modeVal.toString(8).padStart(7, "0")}\0`, "ascii").copy(header, 100);
    Buffer.from("0000000\0", "ascii").copy(header, 108);
    Buffer.from("0000000\0", "ascii").copy(header, 116);
    Buffer.from(bytes.length.toString(8).padStart(11, "0") + "\0", "ascii").copy(header, 124);
    Buffer.from("00000000000\0", "ascii").copy(header, 136);
    Buffer.from("        ", "ascii").copy(header, 148);
    Buffer.from("0", "ascii").copy(header, 156);
    Buffer.from("ustar\0", "ascii").copy(header, 257);
    Buffer.from("00", "ascii").copy(header, 263);
    if (prefixBytes) {
      prefixBytes.copy(header, 345);
    }

    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i];
    Buffer.from(sum.toString(8).padStart(6, "0") + "\0 ", "ascii").copy(header, 148);
    blocks.push(header);

    if (bytes.length > 0) {
      blocks.push(bytes);
      const rem = bytes.length % 512;
      if (rem !== 0) blocks.push(Buffer.alloc(512 - rem, 0));
    }
  }
  blocks.push(Buffer.alloc(1024, 0));
  return Buffer.concat(blocks);
}

function collectPackageFilesForArchive(absPkg, absOut, { includeLockFile = false } = {}) {
  const realPkg = fs.realpathSync(absPkg);
  const realOut = fs.realpathSync(absOut);
  const realPkgPrefix = realPkg.endsWith(path.sep) ? realPkg : realPkg + path.sep;
  const excludeDirs = realOut !== realPkg && realOut.startsWith(realPkgPrefix) ? [realOut] : [];
  return collectFilesRecursively(absPkg, "", excludeDirs, { includeLockFile }).sort((a, b) =>
    a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0
  );
}

export function createLocalPackageArchive(pkgDir, outDir, options = {}) {
  const absPkg = path.resolve(pkgDir);
  const absOut = path.resolve(outDir);
  fs.mkdirSync(absOut, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(absPkg, "opl-package.json"), "utf8"));
  const archiveName = `${manifest.identity.id}-${manifest.identity.version}.tgz`;
  const archivePath = path.join(absOut, archiveName);
  const files = collectPackageFilesForArchive(absPkg, absOut, {
    includeLockFile: Boolean(options.includeLockFile),
  }).filter((f) => path.resolve(f.full) !== archivePath);
  const tarEntries = files.map((f) => ({
    rel: f.rel,
    bytes: fs.readFileSync(f.full),
    mode: fs.statSync(f.full).mode & 0o777,
  }));
  const tgz = zlib.gzipSync(createUstarBuffer(tarEntries));
  fs.writeFileSync(archivePath, tgz);
  const digest = `sha256:${crypto.createHash("sha256").update(tgz).digest("hex")}`;
  return { archivePath, digest, fileCount: files.length };
}

export function createLocalOciDir(pkgDir, outDir) {
  const absPkg = path.resolve(pkgDir);
  const absOut = path.resolve(outDir);
  const blobsDir = path.join(absOut, "blobs", "sha256");
  fs.mkdirSync(blobsDir, { recursive: true });

  const manifest = JSON.parse(fs.readFileSync(path.join(absPkg, "opl-package.json"), "utf8"));
  const files = collectPackageFilesForArchive(absPkg, absOut);
  const layerTarGz = zlib.gzipSync(
    createUstarBuffer(
      files.map((f) => ({
        rel: f.rel,
        bytes: fs.readFileSync(f.full),
        mode: fs.statSync(f.full).mode & 0o777,
      }))
    )
  );
  const layerHex = crypto.createHash("sha256").update(layerTarGz).digest("hex");
  fs.writeFileSync(path.join(blobsDir, layerHex), layerTarGz);

  const configBytes = Buffer.from(
    JSON.stringify({ architecture: "amd64", os: "linux", config: { Labels: { "dev.opl.package.id": manifest.identity.id } } }),
    "utf8"
  );
  const configHex = crypto.createHash("sha256").update(configBytes).digest("hex");
  fs.writeFileSync(path.join(blobsDir, configHex), configBytes);

  const ociManifest = Buffer.from(
    JSON.stringify({
      schemaVersion: 2,
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      config: { mediaType: "application/vnd.oci.image.config.v1+json", digest: `sha256:${configHex}`, size: configBytes.length },
      layers: [{ mediaType: "application/vnd.oci.image.layer.v1.tar+gzip", digest: `sha256:${layerHex}`, size: layerTarGz.length }],
    }),
    "utf8"
  );
  const manifestHex = crypto.createHash("sha256").update(ociManifest).digest("hex");
  fs.writeFileSync(path.join(blobsDir, manifestHex), ociManifest);

  fs.writeFileSync(path.join(absOut, "oci-layout"), JSON.stringify({ imageLayoutVersion: "1.0.0" }), "utf8");
  fs.writeFileSync(
    path.join(absOut, "index.json"),
    JSON.stringify({
      schemaVersion: 2,
      manifests: [
        {
          mediaType: "application/vnd.oci.image.manifest.v1+json",
          digest: `sha256:${manifestHex}`,
          size: ociManifest.length,
          annotations: { "org.opencontainers.image.ref.name": manifest.identity.version },
        },
      ],
    }),
    "utf8"
  );

  return { ociDir: absOut, manifestDigest: `sha256:${manifestHex}`, layerDigest: `sha256:${layerHex}` };
}

export function buildConnectPair(baseDir, opts = {}) {
  const root = path.resolve(baseDir);
  fs.mkdirSync(root, { recursive: true });
  const providerId = opts.providerId || "opl-relay";
  const providerType = opts.providerType || `${providerId}.mailbox`;
  const consumerId = opts.consumerId || "mas";
  const specStrict = opts.specStrict !== undefined ? Boolean(opts.specStrict) : true;
  const consumerCapabilities = opts.consumerCapabilities || ["mailbox.read", "draft.create"];

  const provider = buildV2Package(path.join(root, providerId), {
    intent: "app",
    id: providerId,
    version: opts.providerVersion || "0.4.0",
    specStrict,
    ...(opts.connectionProviders ? { connectionProviders: opts.connectionProviders } : {}),
  });

  const consumer = buildV2Package(path.join(root, consumerId), {
    intent: "agent",
    id: consumerId,
    version: opts.consumerVersion || "0.4.0",
    specStrict,
    connections: opts.consumerConnections || [
      {
        provider_type: providerType,
        capabilities: consumerCapabilities,
        reason: opts.reason || "Access mailbox capabilities",
      },
    ],
  });

  let consumerB = null;
  if (opts.consumerBId || opts.includeSecondConsumer) {
    const secondId = opts.consumerBId || "mag";
    consumerB = buildV2Package(path.join(root, secondId), {
      intent: "agent",
      id: secondId,
      version: opts.consumerBVersion || "0.4.0",
      specStrict,
      connections: opts.consumerBConnections || [
        {
          provider_type: providerType,
          capabilities: opts.consumerBCapabilities || ["mailbox.read"],
          reason: opts.consumerBReason || "Read mailbox for second agent",
        },
      ],
    });
  }

  return {
    baseDir: root,
    providerType,
    provider,
    consumer,
    providerDir: provider.dir,
    consumerDir: consumer.dir,
    ...(consumerB ? { consumerB, consumerBDir: consumerB.dir } : {}),
  };
}

export function buildObsidianVaultDir(dir, files) {
  const root = path.resolve(dir);
  const obsidianDir = path.join(root, ".obsidian");
  fs.mkdirSync(obsidianDir, { recursive: true });
  const obsidianConfigPath = path.join(obsidianDir, "app.json");
  fs.writeFileSync(
    obsidianConfigPath,
    JSON.stringify({ alwaysUpdateLinks: true, newFileLocation: "folder" }, null, 2),
    "utf8"
  );

  const defaultSpec = {
    "notes/protocol.md":
      "# Study Protocol\nCANARY_IN_SITU_VAULT_BODY_DO_NOT_COPY_9911\nPrimary endpoint: MACE at 12 months.\n",
    "notes/cohort.md":
      "# Cohort Summary\nCANARY_COHORT_BODY_DO_NOT_COPY_8822\nn = 420 patients enrolled across 3 sites.\n",
  };
  const spec = files || defaultSpec;
  const built = buildKnowledgeSourceDir(root, spec);
  return {
    ...built,
    obsidianDir,
    obsidianConfigPath,
    canaryStrings: Object.values(spec).map((body) => {
      const line = String(body)
        .split("\n")
        .find((l) => l.includes("CANARY_"));
      return line ? line.trim() : String(body).trim();
    }),
  };
}

export function tamperBindTokenSignature(token) {
  if (typeof token !== "string" || !token.includes(".")) {
    throw new Error("tamperBindTokenSignature requires a dot-delimited bind token");
  }
  const parts = token.split(".");
  const sig = parts[parts.length - 1];
  if (!sig || sig.length === 0) {
    throw new Error("tamperBindTokenSignature: empty signature segment");
  }
  const lastChar = sig[sig.length - 1];
  const replacement = lastChar === "0" ? "1" : "0";
  parts[parts.length - 1] = sig.slice(0, -1) + replacement;
  return parts.join(".");
}
