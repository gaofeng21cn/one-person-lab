import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = path.resolve(LIB_DIR, "../../..");

const DEFAULT_IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "__pycache__", ".venv", "venv"]);

function countPhysicalLines(text) {
  if (!text || text.length === 0) return 0;
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.length;
}

function walkFiles(dirPath, { skipDirs = DEFAULT_IGNORED_DIRS, filter } = {}) {
  const out = [];
  if (!dirPath || !fs.existsSync(dirPath)) return out;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const ent of entries) {
    const full = path.join(dirPath, ent.name);
    if (ent.isDirectory()) {
      if (skipDirs.has(ent.name)) continue;
      out.push(...walkFiles(full, { skipDirs, filter }));
    } else if (ent.isFile()) {
      if (ent.name.endsWith(".tsbuildinfo")) continue;
      if (!filter || filter(full, ent.name)) {
        out.push(full);
      }
    }
  }
  return out;
}

function collectTemporalDepsInPkgJson(pkgJson) {
  const hits = [];
  if (!pkgJson || typeof pkgJson !== "object") return hits;
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
    "overrides",
    "resolutions",
  ]) {
    const map = pkgJson[field];
    if (!map || typeof map !== "object") continue;
    for (const key of Object.keys(map)) {
      if (key.startsWith("@temporalio/") || key === "temporalio") {
        hits.push(`${field}.${key}`);
      }
    }
  }
  return hits;
}

function collectTemporalDepsInLockJson(lockJson) {
  const hits = [];
  if (!lockJson || typeof lockJson !== "object") return hits;
  if (lockJson.packages && typeof lockJson.packages === "object") {
    for (const pkgPath of Object.keys(lockJson.packages)) {
      if (pkgPath.includes("@temporalio/")) {
        hits.push(`packages.${pkgPath}`);
      }
      const entry = lockJson.packages[pkgPath];
      for (const depHit of collectTemporalDepsInPkgJson(entry)) {
        hits.push(`packages[${pkgPath}].${depHit}`);
      }
    }
  }
  if (lockJson.dependencies && typeof lockJson.dependencies === "object") {
    for (const depName of Object.keys(lockJson.dependencies)) {
      if (depName.startsWith("@temporalio/")) {
        hits.push(`dependencies.${depName}`);
      }
    }
  }
  return hits;
}

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function auditTemporalElimination(
  repoRoot,
  {
    allowRootPkgTemporal = false,
    allowTemporalFiles = false,
    launchAgentsDir = null,
    plistPattern = /(?:temporal.*|ai\.opl\.family-runtime\.(?:temporal-service|provider-worker))\.plist$/i,
  } = {}
) {
  const root = path.resolve(repoRoot);
  const violations = [];

  if (!allowRootPkgTemporal) {
    const rootPkgPath = path.join(root, "package.json");
    const rootPkg = readJsonSafe(rootPkgPath);
    for (const hit of collectTemporalDepsInPkgJson(rootPkg)) {
      violations.push({
        rule: "temporal-root-dependency",
        file: "package.json",
        message: `Root package.json contains forbidden Temporal dependency: ${hit}`,
      });
    }

    const rootLockPath = path.join(root, "package-lock.json");
    const rootLock = readJsonSafe(rootLockPath);
    for (const hit of collectTemporalDepsInLockJson(rootLock)) {
      violations.push({
        rule: "temporal-lock-dependency",
        file: "package-lock.json",
        message: `package-lock.json contains forbidden Temporal entry: ${hit}`,
      });
    }
  }

  const pkgsDir = path.join(root, "packages");
  if (fs.existsSync(pkgsDir)) {
    for (const ent of fs.readdirSync(pkgsDir, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const pkgJsonPath = path.join(pkgsDir, ent.name, "package.json");
      const pkgJson = readJsonSafe(pkgJsonPath);
      for (const hit of collectTemporalDepsInPkgJson(pkgJson)) {
        violations.push({
          rule: "temporal-package-dependency",
          file: `packages/${ent.name}/package.json`,
          message: `packages/${ent.name}/package.json contains forbidden Temporal dependency: ${hit}`,
        });
      }
    }
  }

  const vendorTemporal = path.join(root, "vendor", "temporal");
  if (fs.existsSync(vendorTemporal)) {
    violations.push({
      rule: "temporal-vendor-dir",
      file: "vendor/temporal",
      message: "Forbidden vendor/temporal directory exists",
    });
  }

  if (!allowTemporalFiles) {
    const scanSubdirs = ["src", "packages", "contracts", "scripts", "docs", "tests"];
    for (const sub of scanSubdirs) {
      const absSub = path.join(root, sub);
      if (!fs.existsSync(absSub)) continue;
      const files = walkFiles(absSub, {
        filter: (full) => {
          const rel = path.relative(root, full).split(path.sep).join("/");
          // Exclude tests/e2e/ because E2E test specifications/fixtures reference Temporal terms to test removal.
          if (rel.startsWith("tests/e2e/")) return false;
          return true;
        },
      });
      for (const full of files) {
        const rel = path.relative(root, full).split(path.sep).join("/");
        const base = path.basename(full);
        if (/temporal/i.test(base)) {
          violations.push({
            rule: "temporal-file-present",
            file: rel,
            message: `Forbidden Temporal file remains in repo: ${rel}`,
          });
        }
      }
    }
  }

  if (launchAgentsDir && fs.existsSync(launchAgentsDir)) {
    for (const ent of fs.readdirSync(launchAgentsDir, { withFileTypes: true })) {
      if (!ent.isFile()) continue;
      if (plistPattern.test(ent.name)) {
        violations.push({
          rule: "temporal-launchd-plist",
          file: path.join(launchAgentsDir, ent.name),
          message: `Forbidden Temporal launchd plist present: ${ent.name}`,
        });
      }
    }
  }

  return {
    ok: violations.length === 0,
    repoRoot: root,
    violations,
  };
}

function getHostPsRows() {
  try {
    if (process.platform === "darwin" || process.platform === "linux") {
      const args = process.platform === "darwin"
        ? ["-axo", "pid=,ppid=,pgid=,command="]
        : ["-eo", "pid=,ppid=,pgid=,args="];
      const out = execFileSync("ps", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const rows = [];
      for (const line of out.split("\n")) {
        const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+([\s\S]+)$/);
        if (!m) continue;
        rows.push({
          pid: Number(m[1]),
          ppid: Number(m[2]),
          pgid: Number(m[3]),
          command: m[4],
        });
      }
      return rows;
    }
  } catch {
    // ignore ps errors on unsupported platforms
  }
  return [];
}

export function auditProcessHygiene({ psRows, sandboxLiveProcs = [], expectedOpldCount = null, maxOpld = 1 } = {}) {
  const rows = Array.isArray(psRows) ? psRows : getHostPsRows();
  const violations = [];

  const temporalProcesses = rows.filter((r) => {
    const rawCmd = String(r.command || "");
    const cmd = rawCmd.replace(/(?:\s+[A-Z_][A-Z0-9_]*=(?:"[^"]*"|'[^']*'|\S*))+$/, "");
    if (/^\s*(?:ps|grep|rg)\b/.test(cmd)) return false;
    if (/(?:^|[\s/])tests\/e2e\//.test(cmd)) return false;
    return /\btemporal-server\b|\bopl-temporal\b|\btemporal\s+server\s+start-dev\b|\btemporal-worker-bootstrap\b|\bfamily-runtime-temporal-provider\b|--temporal-worker(?:-foreground)?\b/i.test(cmd);
  });

  for (const proc of temporalProcesses) {
    violations.push({
      rule: "temporal-process-running",
      pid: proc.pid,
      message: `Forbidden Temporal process running (pid=${proc.pid}): ${proc.command}`,
    });
  }

  const opldProcs = (sandboxLiveProcs || []).filter(
    (p) => /\bopld\b|daemon/i.test(String(p.command || "")) || p.kind === "daemon"
  );
  const opldCount = opldProcs.length;

  if (expectedOpldCount !== null && opldCount !== expectedOpldCount) {
    violations.push({
      rule: "opld-process-count-mismatch",
      opldCount,
      message: `Expected exactly ${expectedOpldCount} sandbox opld process(es), found ${opldCount}`,
    });
  } else if (opldCount > maxOpld) {
    violations.push({
      rule: "opld-process-count-exceeded",
      opldCount,
      message: `Expected at most ${maxOpld} sandbox opld process(es), found ${opldCount}`,
    });
  }

  return {
    ok: violations.length === 0,
    opldCount,
    temporalProcesses,
    violations,
  };
}

export function auditPythonStdlibAndBudget(
  pythonClientDir,
  { maxLines = 1500, pythonBin = "python3" } = {}
) {
  const dir = path.resolve(pythonClientDir);
  const violations = [];

  if (!fs.existsSync(dir)) {
    violations.push({
      rule: "python-client-missing",
      file: dir,
      message: `sdks/python-client directory does not exist: ${dir}`,
    });
    return {
      ok: false,
      dir,
      lineCount: 0,
      maxLines,
      filesChecked: 0,
      nonStdlibImports: [],
      violations,
    };
  }

  const pyFiles = walkFiles(dir, {
    skipDirs: new Set(["__pycache__", ".venv", "venv", ".git", "node_modules", "tests", ".pytest_cache", "dist", "build"]),
    filter: (full, name) => {
      if (!name.endsWith(".py")) return false;
      const rel = path.relative(dir, full).split(path.sep).join("/");
      if (rel.startsWith("tests/") || /^test_.*\.py$/.test(name) || /_test\.py$/.test(name)) {
        return false;
      }
      return true;
    },
  });

  if (pyFiles.length === 0) {
    violations.push({
      rule: "python-client-empty",
      file: dir,
      message: `No non-test .py files found under ${dir}`,
    });
    return {
      ok: false,
      dir,
      lineCount: 0,
      maxLines,
      filesChecked: 0,
      nonStdlibImports: [],
      violations,
    };
  }

  let lineCount = 0;
  for (const f of pyFiles) {
    lineCount += countPhysicalLines(fs.readFileSync(f, "utf8"));
  }

  if (lineCount <= 0 || lineCount >= maxLines) {
    violations.push({
      rule: "python-line-budget",
      file: dir,
      message: `Expected Python client line count in (0, ${maxLines}), got ${lineCount}`,
    });
  }

  const astChecker = [
    "import ast, json, pathlib, sys",
    "root = pathlib.Path(sys.argv[1]).resolve()",
    "files = [pathlib.Path(p).resolve() for p in sys.argv[2:]]",
    "local_mods = set()",
    "for base in [root, root / 'src']:",
    "    if base.is_dir():",
    "        for ent in base.iterdir():",
    "            if ent.is_file() and ent.suffix == '.py':",
    "                local_mods.add(ent.stem)",
    "            elif ent.is_dir() and (ent / '__init__.py').is_file():",
    "                local_mods.add(ent.name)",
    "allowed = set(sys.stdlib_module_names) | set(sys.builtin_module_names) | local_mods | {'__future__'}",
    "errors = []",
    "non_stdlib = []",
    "for f in files:",
    "    try:",
    "        tree = ast.parse(f.read_text(encoding='utf-8'), filename=str(f))",
    "    except SyntaxError as exc:",
    "        errors.append({'file': str(f), 'line': exc.lineno or 1, 'message': f'SyntaxError: {exc.msg}'})",
    "        continue",
    "    for node in ast.walk(tree):",
    "        if isinstance(node, ast.Import):",
    "            for alias in node.names:",
    "                top = alias.name.split('.')[0]",
    "                if top not in allowed:",
    "                    non_stdlib.append({'file': str(f), 'line': node.lineno, 'module': top, 'raw': alias.name})",
    "        elif isinstance(node, ast.ImportFrom):",
    "            if node.level and node.level > 0:",
    "                continue",
    "            if node.module:",
    "                top = node.module.split('.')[0]",
    "                if top not in allowed:",
    "                    non_stdlib.append({'file': str(f), 'line': node.lineno, 'module': top, 'raw': node.module})",
    "print(json.dumps({'errors': errors, 'non_stdlib': non_stdlib}))",
  ].join("\n");

  const pyRes = spawnSync(pythonBin, ["-c", astChecker, dir, ...pyFiles], { encoding: "utf8" });
  let nonStdlibImports = [];
  if (pyRes.status !== 0) {
    violations.push({
      rule: "python-ast-check-failed",
      file: dir,
      message: `Python AST check failed (exit ${pyRes.status}): ${pyRes.stderr || pyRes.stdout}`,
    });
  } else {
    const parsed = JSON.parse(pyRes.stdout || "{}");
    for (const err of parsed.errors || []) {
      violations.push({
        rule: "python-syntax-error",
        file: path.relative(dir, err.file),
        line: err.line,
        message: err.message,
      });
    }
    nonStdlibImports = parsed.non_stdlib || [];
    for (const item of nonStdlibImports) {
      violations.push({
        rule: "python-non-stdlib-import",
        file: path.relative(dir, item.file),
        line: item.line,
        module: item.module,
        message: `Non-stdlib Python import '${item.raw}' (top-level '${item.module}') at ${path.relative(dir, item.file)}:${item.line}`,
      });
    }
  }

  return {
    ok: violations.length === 0,
    dir,
    lineCount,
    maxLines,
    filesChecked: pyFiles.length,
    nonStdlibImports,
    violations,
  };
}

const FORBIDDEN_BRIDGE_PATTERNS = [
  { label: "loadFrameworkCordisProfiles", regex: /loadFrameworkCordisProfiles/ },
  { label: "startCordisWorkbenchServicesHost", regex: /startCordisWorkbenchServicesHost/ },
  { label: "startCordisChannelProviderHost", regex: /startCordisChannelProviderHost/ },
  { label: "compactFastState", regex: /compactFastState/ },
  { label: "command-runtime.mjs", regex: /command-runtime\.mjs/ },
  { label: "opl-passthrough/", regex: /opl-passthrough\// },
  { label: "cordis-profiles", regex: /cordis-profiles/ },
  { label: "spawn('opl')", regex: /spawn(?:Sync)?\s*\(\s*['"`]opl['"`]/ },
];

export function auditLineBudgets({
  repoRoot,
  bridgeDir = null,
  pythonClientDir = null,
  guardScriptPath = null,
  requirePythonClient = true,
  requireBridge = true,
  requireCore = true,
  maxCoreLines = 3000,
  maxPythonLines = 1500,
  maxBridgeLines = 400,
} = {}) {
  const root = path.resolve(repoRoot);
  const violations = [];

  const localGuard = path.join(root, "scripts", "check-v2-import-guard.mjs");
  const fallbackGuard = path.join(WORKTREE_ROOT, "scripts", "check-v2-import-guard.mjs");
  const resolvedGuard = fs.realpathSync(
    guardScriptPath
      ? path.resolve(guardScriptPath)
      : fs.existsSync(localGuard)
        ? localGuard
        : fallbackGuard
  );
  const realRoot = fs.existsSync(root) ? fs.realpathSync(root) : root;

  let guardReport = null;
  const guardRun = spawnSync(process.execPath, [resolvedGuard, "--root", realRoot, "--json"], {
    encoding: "utf8",
  });
  try {
    guardReport = JSON.parse(guardRun.stdout || "{}");
  } catch {
    guardReport = null;
  }

  if (guardRun.status !== 0 || !guardReport || guardReport.ok !== true) {
    const subViolations = guardReport?.violations;
    if (Array.isArray(subViolations) && subViolations.length > 0) {
      for (const v of subViolations) {
        violations.push({
          rule: v.rule || "v2-import-guard",
          file: v.file || "packages/core",
          line: v.line,
          message: v.message || "v2 import guard violation",
        });
      }
    } else {
      violations.push({
        rule: "v2-import-guard-failed",
        file: resolvedGuard,
        message: `check-v2-import-guard.mjs exited ${guardRun.status}: ${guardRun.stderr || guardRun.stdout}`,
      });
    }
  }

  const coreLineCount = guardReport?.coreLineCount ?? 0;
  if (requireCore) {
    if (!(coreLineCount > 0 && coreLineCount < maxCoreLines)) {
      violations.push({
        rule: "core-line-budget",
        file: "packages/core/src",
        message: `Expected packages/core/src lines in (0, ${maxCoreLines}), got ${coreLineCount}`,
      });
    }
    const corePkgJson = readJsonSafe(path.join(root, "packages", "core", "package.json"));
    if (!corePkgJson) {
      violations.push({
        rule: "core-package-json-missing",
        file: "packages/core/package.json",
        message: "Missing packages/core/package.json",
      });
    } else {
      for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
        const deps = corePkgJson[field];
        if (deps && Object.keys(deps).length > 0) {
          violations.push({
            rule: "core-forbidden-npm-deps",
            file: "packages/core/package.json",
            message: `packages/core/package.json '${field}' must be empty, got ${JSON.stringify(deps)}`,
          });
        }
      }
    }
  }

  let pythonReport = null;
  const resolvedPythonDir = pythonClientDir
    ? path.resolve(pythonClientDir)
    : path.join(root, "sdks", "python-client");
  if (requirePythonClient) {
    pythonReport = auditPythonStdlibAndBudget(resolvedPythonDir, { maxLines: maxPythonLines });
    violations.push(...pythonReport.violations);
  }

  let bridgeLineCount = 0;
  if (requireBridge) {
    const resolvedBridgeDir = bridgeDir ? path.resolve(bridgeDir) : null;
    const bridgeSrcDir = resolvedBridgeDir ? path.join(resolvedBridgeDir, "src") : null;
    if (!bridgeSrcDir || !fs.existsSync(bridgeSrcDir)) {
      violations.push({
        rule: "bridge-src-missing",
        file: bridgeSrcDir || "(null)",
        message: `opl-framework-bridge/src directory not found: ${bridgeSrcDir}`,
      });
    } else {
      const bridgeFiles = walkFiles(bridgeSrcDir, {
        filter: (_full, name) => /\.(?:mjs|js|ts)$/.test(name),
      });
      if (bridgeFiles.length === 0) {
        violations.push({
          rule: "bridge-src-empty",
          file: bridgeSrcDir,
          message: `No JS/TS source files found in ${bridgeSrcDir}`,
        });
      }
      for (const f of bridgeFiles) {
        const content = fs.readFileSync(f, "utf8");
        bridgeLineCount += countPhysicalLines(content);
        for (const pat of FORBIDDEN_BRIDGE_PATTERNS) {
          if (pat.regex.test(content)) {
            violations.push({
              rule: "bridge-legacy-symbol",
              file: path.relative(resolvedBridgeDir, f),
              message: `Forbidden legacy symbol '${pat.label}' found in ${path.relative(resolvedBridgeDir, f)}`,
            });
          }
        }
      }
      if (!(bridgeLineCount > 0 && bridgeLineCount < maxBridgeLines)) {
        violations.push({
          rule: "bridge-line-budget",
          file: bridgeSrcDir,
          message: `Expected bridge src/ lines in (0, ${maxBridgeLines}), got ${bridgeLineCount}`,
        });
      }
      const bundlePath = path.join(resolvedBridgeDir, "lib", "index.mjs");
      if (fs.existsSync(bundlePath)) {
        const bundleContent = fs.readFileSync(bundlePath, "utf8");
        for (const pat of FORBIDDEN_BRIDGE_PATTERNS) {
          if (pat.regex.test(bundleContent)) {
            violations.push({
              rule: "bridge-bundle-legacy-symbol",
              file: "lib/index.mjs",
              message: `Forbidden legacy symbol '${pat.label}' found in built lib/index.mjs`,
            });
          }
        }
      }
    }
  }

  return {
    ok: violations.length === 0,
    repoRoot: root,
    guardReport,
    coreLineCount,
    pythonReport,
    bridgeLineCount,
    violations,
  };
}

export function auditLegacyDemolition(repoRoot, { allowLegacyCli = false } = {}) {
  const root = path.resolve(repoRoot);
  const violations = [];

  const oplContractsDir = path.join(root, "contracts", "opl-framework");
  if (fs.existsSync(oplContractsDir)) {
    for (const ent of fs.readdirSync(oplContractsDir, { withFileTypes: true })) {
      if (ent.isFile() && /^brand-.*\.json$/i.test(ent.name)) {
        violations.push({
          rule: "legacy-brand-json",
          file: `contracts/opl-framework/${ent.name}`,
          message: `Forbidden legacy brand governance JSON remains: contracts/opl-framework/${ent.name}`,
        });
      }
      if (ent.isFile() && /^agent-.*\.json$/i.test(ent.name)) {
        violations.push({
          rule: "static-agent-list",
          file: `contracts/opl-framework/${ent.name}`,
          message: `Forbidden static agent JSON remains: contracts/opl-framework/${ent.name}`,
        });
      }
    }

    const staticPkgsDir = path.join(oplContractsDir, "packages");
    if (fs.existsSync(staticPkgsDir)) {
      const jsonFiles = walkFiles(staticPkgsDir, { filter: (_f, n) => n.endsWith(".json") });
      for (const f of jsonFiles) {
        const rel = path.relative(root, f).split(path.sep).join("/");
        violations.push({
          rule: "static-package-list",
          file: rel,
          message: `Forbidden static package registry JSON remains: ${rel}`,
        });
      }
    }
  }

  if (!allowLegacyCli) {
    const legacyCliDir = path.join(root, "src", "entrypoints", "cli");
    if (fs.existsSync(legacyCliDir)) {
      violations.push({
        rule: "legacy-cli-tree",
        file: "src/entrypoints/cli",
        message: "Forbidden legacy 448-command CLI tree src/entrypoints/cli/ remains",
      });
    }
  }

  const legacyPythonDir = path.join(root, "python", "opl_framework");
  if (fs.existsSync(legacyPythonDir)) {
    violations.push({
      rule: "legacy-python-framework",
      file: "python/opl_framework",
      message: "Forbidden legacy python/opl_framework/ package remains",
    });
  }

  const rootPkg = readJsonSafe(path.join(root, "package.json"));
  if (rootPkg) {
    for (const hit of collectCircularOplFlowRefs(rootPkg)) {
      violations.push({
        rule: "opl-flow-circular-ref",
        file: "package.json",
        message: `Forbidden opl-flow circular reference in package.json: ${hit}`,
      });
    }
  }

  return {
    ok: violations.length === 0,
    repoRoot: root,
    violations,
  };
}

function collectCircularOplFlowRefs(pkgJson) {
  const hits = [];
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const map = pkgJson?.[field];
    if (!map || typeof map !== "object") continue;
    for (const k of Object.keys(map)) {
      if (k === "opl-flow" || k === "@opl/flow" || k.endsWith("/opl-flow")) {
        hits.push(`${field}.${k}`);
      }
    }
  }
  return hits;
}

function runGit(repoDir, args) {
  return spawnSync("git", ["-C", repoDir, ...args], { encoding: "utf8" });
}

function collectGitChangedPaths(repoDir, { baseRef = null } = {}) {
  const changed = new Set();
  const isGit = runGit(repoDir, ["rev-parse", "--is-inside-work-tree"]);
  if (isGit.status !== 0) {
    return { isGitRepo: false, paths: [] };
  }

  const statusRes = runGit(repoDir, ["status", "--porcelain", "-uall"]);
  if (statusRes.status === 0) {
    for (const line of statusRes.stdout.split("\n")) {
      if (line.length < 4) continue;
      let rawPath = line.slice(3).trim();
      if (rawPath.includes(" -> ")) {
        rawPath = rawPath.split(" -> ").pop().trim();
      }
      if (rawPath.startsWith('"') && rawPath.endsWith('"')) {
        rawPath = rawPath.slice(1, -1);
      }
      if (rawPath) changed.add(rawPath);
    }
  }

  let resolvedBase = baseRef;
  if (!resolvedBase) {
    for (const candidate of ["origin/main", "main"]) {
      const check = runGit(repoDir, ["rev-parse", "--verify", candidate]);
      if (check.status === 0) {
        resolvedBase = candidate;
        break;
      }
    }
  }

  if (resolvedBase) {
    const verifyBase = runGit(repoDir, ["rev-parse", "--verify", resolvedBase]);
    if (verifyBase.status === 0) {
      const diffRes = runGit(repoDir, ["diff", "--name-only", `${resolvedBase}...HEAD`]);
      if (diffRes.status === 0) {
        for (const p of diffRes.stdout.split("\n")) {
          const trimmed = p.trim();
          if (trimmed) changed.add(trimmed);
        }
      }
    }
  }

  return { isGitRepo: true, paths: [...changed].sort() };
}

const FORBIDDEN_STUDIO_PATH_RE = /(?:^|\/)(?:desktop\/preload\.cjs|plugins\/opl-host-core(?:\/|$)|plugins\/opl-web-routes(?:\/|$)|.*cua-macos|.*dsh-cua|.*computer_use)/i;
const FORBIDDEN_APP_PATH_RE = /(?:^|\/)(?:managed_companions|computer_use|cua-macos|dsh-cua|contracts\/app-)/i;

function auditAionCoreOverrides(targetRoot, filePrefix, violations) {
  if (!targetRoot || !fs.existsSync(targetRoot)) return;
  const root = path.resolve(targetRoot);
  const pkgLabel = filePrefix ? `${filePrefix}/package.json` : "package.json";
  const lockLabel = filePrefix ? `${filePrefix}/package-lock.json` : "package-lock.json";

  const rootPkg = readJsonSafe(path.join(root, "package.json"));
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "overrides", "resolutions"]) {
    const map = rootPkg?.[field];
    if (!map || typeof map !== "object") continue;
    for (const [name, spec] of Object.entries(map)) {
      if (/aioncore/i.test(name) && /^(?:file:|link:|git\+|https?:\/\/.*\.git)/i.test(String(spec))) {
        violations.push({
          rule: "aioncore-fork-override",
          file: pkgLabel,
          message: `Forbidden AionCore fork/local override in ${pkgLabel} (${field}.${name}=${spec})`,
        });
      }
    }
  }

  const lockJson = readJsonSafe(path.join(root, "package-lock.json"));
  if (lockJson?.packages && typeof lockJson.packages === "object") {
    for (const [pkgPath, meta] of Object.entries(lockJson.packages)) {
      if (/aioncore/i.test(pkgPath) && (meta?.link === true || /^file:/i.test(String(meta?.resolved || "")))) {
        violations.push({
          rule: "aioncore-fork-override",
          file: lockLabel,
          message: `Forbidden AionCore fork/link override in ${lockLabel} (${pkgPath})`,
        });
      }
    }
  }
}

export function auditProtectedBoundaries({ studioRoot = null, appRoot = null, repoRoot = null, baseRef = null } = {}) {
  const violations = [];
  let studioChangedPaths = [];
  let appChangedPaths = [];

  if (studioRoot && fs.existsSync(studioRoot)) {
    const studioGit = collectGitChangedPaths(path.resolve(studioRoot), { baseRef });
    studioChangedPaths = studioGit.paths;
    for (const p of studioChangedPaths) {
      if (FORBIDDEN_STUDIO_PATH_RE.test(p)) {
        violations.push({
          rule: "protected-studio-cua-boundary",
          file: p,
          message: `Forbidden modification to protected Studio/DSH CUA path: ${p}`,
        });
      }
      if (!p.startsWith("plugins/opl-framework-bridge/") && !p.startsWith("plugins/core/opl-framework-bridge/")) {
        violations.push({
          rule: "studio-edit-outside-bridge",
          file: p,
          message: `opl-studio edit outside plugins/opl-framework-bridge/ or plugins/core/opl-framework-bridge/: ${p}`,
        });
      }
    }
  }

  if (appRoot && fs.existsSync(appRoot)) {
    const appGit = collectGitChangedPaths(path.resolve(appRoot), { baseRef });
    appChangedPaths = appGit.paths;
    for (const p of appChangedPaths) {
      if (FORBIDDEN_APP_PATH_RE.test(p)) {
        violations.push({
          rule: "protected-app-cua-boundary",
          file: p,
          message: `Forbidden modification to protected OPL App CUA/companion path: ${p}`,
        });
      }
    }
    auditAionCoreOverrides(appRoot, "appRoot", violations);
  }

  if (repoRoot && fs.existsSync(repoRoot)) {
    auditAionCoreOverrides(repoRoot, "", violations);
  }

  return {
    ok: violations.length === 0,
    studioChangedPaths,
    appChangedPaths,
    violations,
  };
}
