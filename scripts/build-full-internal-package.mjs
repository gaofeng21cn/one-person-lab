#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  FULL_RELEASE_OUTPUT_DIR,
  FULL_INTERNAL_OUTPUT_DIR,
  FULL_RUNTIME_RESOURCE_DIR,
  FULL_RUNTIME_CACHE_LAYER_IDS,
  PACKAGED_MODULE_MARKER_FILE,
  buildFullPackageManifest,
  buildFullPackageArtifactNames,
  buildFullRuntimeCacheArchiveName,
  buildFullRuntimeCacheKey,
  buildInternalPackageReadme,
  buildPackagedModuleMarker,
  shouldExcludeRuntimePath,
} from '../src/full-internal-package.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.dirname(repoRoot);

function parseArgs(argv) {
  const parsed = {
    version: process.env.OPL_RELEASE_VERSION || '26.5.1',
    outDir: process.env.CI === 'true'
      ? path.join(repoRoot, FULL_RELEASE_OUTPUT_DIR)
      : FULL_INTERNAL_OUTPUT_DIR,
    guiRoot: path.join(workspaceRoot, 'opl-aion-shell'),
    hermesRoot: process.env.OPL_FULL_HERMES_ROOT || path.join(workspaceRoot, '_external', 'hermes-agent'),
    masRoot: process.env.OPL_FULL_MAS_ROOT || path.join(workspaceRoot, 'med-autoscience'),
    mdsRoot: process.env.OPL_FULL_MDS_ROOT || path.join(workspaceRoot, 'med-deepscientist'),
    codexRoot: process.env.OPL_FULL_CODEX_ROOT || '',
    nodeBin: process.env.OPL_FULL_NODE_BIN || '',
    uvBin: process.env.OPL_FULL_UV_BIN || path.join(os.homedir(), '.local', 'bin', 'uv'),
    pythonRoot: process.env.OPL_FULL_PYTHON_ROOT || '',
    skipGuiBuild: false,
    splitRuntime: process.env.OPL_FULL_SPLIT_RUNTIME === '1',
    runtimeCacheDir: process.env.OPL_FULL_RUNTIME_CACHE_DIR || '',
    runtimeCacheMode: process.env.OPL_FULL_RUNTIME_CACHE_MODE || (process.env.CI === 'true' ? 'readwrite' : 'off'),
    printRuntimeCacheKeys: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--skip-gui-build') {
      parsed.skipGuiBuild = true;
      continue;
    }
    if (token === '--split-runtime') {
      parsed.splitRuntime = true;
      continue;
    }
    if (token === '--print-runtime-cache-keys') {
      parsed.printRuntimeCacheKeys = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${token}`);
    }
    index += 1;
    if (token === '--version') parsed.version = value;
    else if (token === '--out-dir') parsed.outDir = path.resolve(value);
    else if (token === '--gui-root') parsed.guiRoot = path.resolve(value);
    else if (token === '--hermes-root') parsed.hermesRoot = path.resolve(value);
    else if (token === '--mas-root') parsed.masRoot = path.resolve(value);
    else if (token === '--mds-root') parsed.mdsRoot = path.resolve(value);
    else if (token === '--codex-root') parsed.codexRoot = path.resolve(value);
    else if (token === '--node-bin') parsed.nodeBin = path.resolve(value);
    else if (token === '--uv-bin') parsed.uvBin = path.resolve(value);
    else if (token === '--python-root') parsed.pythonRoot = path.resolve(value);
    else if (token === '--runtime-cache-dir') parsed.runtimeCacheDir = path.resolve(value);
    else if (token === '--runtime-cache-mode') parsed.runtimeCacheMode = value;
    else throw new Error(`Unknown argument: ${token}`);
  }

  if (!['readwrite', 'readonly', 'off'].includes(parsed.runtimeCacheMode)) {
    throw new Error(`Unsupported runtime cache mode: ${parsed.runtimeCacheMode}`);
  }

  return parsed;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env ?? process.env,
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  if (result.status !== 0) {
    throw new Error([
      `Command failed: ${command} ${args.join(' ')}`,
      result.stdout?.trim() ? `stdout:\n${result.stdout.trim()}` : '',
      result.stderr?.trim() ? `stderr:\n${result.stderr.trim()}` : '',
    ].filter(Boolean).join('\n'));
  }
  return result;
}

function requirePath(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath || '(empty)'}`);
  }
  return filePath;
}

function readGitHead(sourcePath) {
  if (!fs.existsSync(path.join(sourcePath, '.git'))) {
    return null;
  }
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: sourcePath,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) {
    return null;
  }
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim() || null;
}

function findExecutable(name) {
  const result = spawnSync('which', [name], { encoding: 'utf8', stdio: 'pipe' });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

function fileSha256(filePath) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return null;
  }
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function stringSha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashFiles(relativePaths) {
  const entries = {};
  for (const relativePath of relativePaths) {
    const filePath = path.join(repoRoot, relativePath);
    entries[relativePath] = fs.existsSync(filePath) ? fileSha256(filePath) : null;
  }
  return entries;
}

function directoryFingerprint(root, runtimePrefix) {
  if (!fs.existsSync(root)) {
    return null;
  }
  const hash = crypto.createHash('sha256');
  const stack = [['', root]];
  while (stack.length > 0) {
    const [relative, current] = stack.pop();
    const runtimeRelative = relative
      ? path.posix.join(runtimePrefix, relative.split(path.sep).join('/'))
      : runtimePrefix;
    if (relative && shouldExcludeRuntimePath(runtimeRelative)) {
      continue;
    }
    const stat = fs.lstatSync(current);
    hash.update(relative);
    hash.update(stat.isDirectory() ? 'dir' : stat.isSymbolicLink() ? 'symlink' : 'file');
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current).sort().reverse()) {
        stack.push([path.join(relative, entry), path.join(current, entry)]);
      }
    } else if (stat.isSymbolicLink()) {
      hash.update(fs.readlinkSync(current));
    } else if (stat.isFile()) {
      hash.update(fs.readFileSync(current));
    }
  }
  return hash.digest('hex');
}

function directorySizeBytes(root) {
  let total = 0;
  if (!fs.existsSync(root)) {
    return 0;
  }
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const stat = fs.lstatSync(current);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        stack.push(path.join(current, entry));
      }
    } else {
      total += stat.size;
    }
  }
  return total;
}

function copyTreeFiltered(sourceRoot, targetRoot, runtimePrefix) {
  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(targetRoot, { recursive: true });

  const copyEntry = (sourcePath, targetPath, relativeFromSource) => {
    const runtimeRelative = path.posix.join(runtimePrefix, relativeFromSource.split(path.sep).join('/'));
    if (shouldExcludeRuntimePath(runtimeRelative)) {
      return;
    }

    const stat = fs.lstatSync(sourcePath);
    if (stat.isDirectory()) {
      fs.mkdirSync(targetPath, { recursive: true });
      for (const entry of fs.readdirSync(sourcePath)) {
        copyEntry(path.join(sourcePath, entry), path.join(targetPath, entry), path.join(relativeFromSource, entry));
      }
      return;
    }

    if (stat.isSymbolicLink()) {
      const realPath = fs.realpathSync(sourcePath);
      const realStat = fs.statSync(realPath);
      if (realStat.isDirectory()) {
        fs.mkdirSync(targetPath, { recursive: true });
        for (const entry of fs.readdirSync(realPath)) {
          copyEntry(path.join(realPath, entry), path.join(targetPath, entry), path.join(relativeFromSource, entry));
        }
        return;
      }
      if (realStat.isFile()) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(realPath, targetPath);
        fs.chmodSync(targetPath, realStat.mode);
      }
      return;
    }

    if (stat.isFile()) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
      fs.chmodSync(targetPath, stat.mode);
    }
  };

  for (const entry of fs.readdirSync(sourceRoot)) {
    copyEntry(path.join(sourceRoot, entry), path.join(targetRoot, entry), entry);
  }
}

function writeExecutable(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  fs.chmodSync(filePath, 0o755);
}

function findCodexRoot(explicitRoot) {
  const candidates = [
    explicitRoot,
    path.join(os.homedir(), '.nvm', 'versions', 'node', 'v22.16.0', 'lib', 'node_modules', '@openai', 'codex'),
    path.join(os.homedir(), '.bun', 'install', 'global', 'node_modules', '@openai', 'codex'),
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(path.join(candidate, 'package.json')));
  if (!found) {
    throw new Error('Codex package root not found. Pass --codex-root or set OPL_FULL_CODEX_ROOT.');
  }
  return found;
}

function findCodexBinary(codexRoot) {
  const vendorRoot = path.join(
    codexRoot,
    'node_modules',
    '@openai',
    'codex-darwin-arm64',
    'vendor',
    'aarch64-apple-darwin',
  );
  return {
    codex: requirePath(path.join(vendorRoot, 'codex', 'codex'), 'Codex darwin-arm64 binary'),
    rg: requirePath(path.join(vendorRoot, 'path', 'rg'), 'Codex bundled rg'),
  };
}

function findNodeBinary(explicitNodeBin) {
  const candidates = [
    explicitNodeBin,
    path.join(os.homedir(), '.nvm', 'versions', 'node', 'v22.16.0', 'bin', 'node'),
    process.execPath,
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!found) {
    throw new Error('Node binary not found. Pass --node-bin or set OPL_FULL_NODE_BIN.');
  }
  return found;
}

function findPythonRoot(explicitPythonRoot) {
  if (explicitPythonRoot) {
    return requirePath(explicitPythonRoot, 'Python root');
  }

  const uvPythonRoot = path.join(os.homedir(), '.local', 'share', 'uv', 'python');
  const candidates = fs.existsSync(uvPythonRoot)
    ? fs.readdirSync(uvPythonRoot)
        .filter((entry) => /^cpython-3\.12\..*-macos-aarch64-none$/.test(entry))
        .sort()
        .reverse()
        .map((entry) => path.join(uvPythonRoot, entry))
    : [];
  const found = candidates.find((candidate) => fs.existsSync(path.join(candidate, 'bin', 'python3')));
  if (!found) {
    throw new Error('uv-managed Python 3.12 arm64 root not found. Pass --python-root or set OPL_FULL_PYTHON_ROOT.');
  }
  return found;
}

function copySingleFile(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  fs.chmodSync(targetPath, fs.statSync(sourcePath).mode);
}

function copyPathContents(sourceRoot, targetRoot) {
  fs.mkdirSync(targetRoot, { recursive: true });
  if (!fs.existsSync(sourceRoot)) {
    return;
  }
  for (const entry of fs.readdirSync(sourceRoot)) {
    fs.cpSync(path.join(sourceRoot, entry), path.join(targetRoot, entry), {
      recursive: true,
      dereference: true,
      preserveTimestamps: true,
    });
  }
}

function createTarZst(archivePath, cwd, entries = ['.']) {
  requirePath(findExecutable('zstd'), 'zstd');
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.rmSync(archivePath, { force: true });
  const tarPath = `${archivePath}.tar`;
  fs.rmSync(tarPath, { force: true });
  try {
    run('tar', ['-cf', tarPath, '-C', cwd, ...entries]);
    run('zstd', ['-q', '-T0', '-f', tarPath, '-o', archivePath]);
  } finally {
    fs.rmSync(tarPath, { force: true });
  }
}

function archiveLayer(sourceRoot, archivePath) {
  createTarZst(archivePath, sourceRoot, ['.']);
}

function extractLayer(archivePath, targetRoot) {
  fs.mkdirSync(targetRoot, { recursive: true });
  const tarPath = path.join(os.tmpdir(), `opl-full-layer-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tar`);
  try {
    run('zstd', ['-q', '-d', '-f', archivePath, '-o', tarPath]);
    run('tar', ['-xf', tarPath, '-C', targetRoot]);
  } finally {
    fs.rmSync(tarPath, { force: true });
  }
}

function writeRuntimeWrappers(runtimeRoot) {
  writeExecutable(path.join(runtimeRoot, 'bin', 'opl'), `#!/usr/bin/env bash
set -euo pipefail
RUNTIME_HOME="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="$(find "$RUNTIME_HOME/python" -maxdepth 2 -path '*/bin' -type d 2>/dev/null | sort -r | head -n 1 || true)"
export OPL_FULL_RUNTIME_HOME="$RUNTIME_HOME"
export OPL_CODEX_BIN="$RUNTIME_HOME/bin/codex"
export OPL_HERMES_BIN="$RUNTIME_HOME/bin/hermes"
export OPL_MODULES_ROOT="$RUNTIME_HOME/modules"
export OPL_MODULE_PATH_MEDAUTOSCIENCE="$RUNTIME_HOME/modules/mas"
export OPL_MODULE_PATH_MEDDEEPSCIENTIST="$RUNTIME_HOME/modules/mds"
if [[ -n "$PYTHON_BIN" ]]; then
  export PATH="$RUNTIME_HOME/bin:$RUNTIME_HOME/node/bin:$RUNTIME_HOME/uv/bin:$PYTHON_BIN:$PATH"
else
  export PATH="$RUNTIME_HOME/bin:$RUNTIME_HOME/node/bin:$RUNTIME_HOME/uv/bin:$PATH"
fi
exec "$RUNTIME_HOME/opl/bin/opl" "$@"
`);

  writeExecutable(path.join(runtimeRoot, 'bin', 'hermes'), `#!/usr/bin/env bash
set -euo pipefail
RUNTIME_HOME="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="$(find "$RUNTIME_HOME/python" -maxdepth 2 -path '*/bin' -type d 2>/dev/null | sort -r | head -n 1 || true)"
SITE_PACKAGES="$(find "$RUNTIME_HOME/hermes/.venv/lib" -maxdepth 2 -name site-packages -type d 2>/dev/null | sort -r | head -n 1 || true)"
if [[ -z "$PYTHON_BIN" ]]; then
  echo "Packaged Python runtime not found under $RUNTIME_HOME/python" >&2
  exit 127
fi
export PATH="$RUNTIME_HOME/bin:$PYTHON_BIN:$PATH"
if [[ -n "$SITE_PACKAGES" ]]; then
  export PYTHONPATH="$RUNTIME_HOME/hermes:$SITE_PACKAGES:\${PYTHONPATH:-}"
else
  export PYTHONPATH="$RUNTIME_HOME/hermes:\${PYTHONPATH:-}"
fi
exec "$PYTHON_BIN/python3" "$RUNTIME_HOME/hermes/hermes" "$@"
`);
}

function writePackagedModuleMarker(moduleRoot, marker) {
  fs.writeFileSync(path.join(moduleRoot, PACKAGED_MODULE_MARKER_FILE), `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
}

function copyRecommendedSkills(targetRoot) {
  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(targetRoot, { recursive: true });
  const sources = [
    ['mas', path.join(os.homedir(), '.codex', 'skills', 'mas')],
    ['mag', path.join(os.homedir(), '.codex', 'skills', 'mag')],
    ['rca', path.join(os.homedir(), '.codex', 'skills', 'rca')],
  ];
  for (const [name, source] of sources) {
    if (fs.existsSync(source)) {
      copyTreeFiltered(source, path.join(targetRoot, name), `skills/${name}`);
    }
  }
}

function resolveRuntimeSources(options) {
  const codexRoot = findCodexRoot(options.codexRoot);
  const codexBinaries = findCodexBinary(codexRoot);
  const nodeBin = findNodeBinary(options.nodeBin);
  const pythonRoot = findPythonRoot(options.pythonRoot);
  const uvBin = requirePath(options.uvBin, 'uv binary');

  return {
    codexRoot,
    codexBinaries,
    nodeBin,
    pythonRoot,
    uvBin,
  };
}

function packageJsonVersion(packagePath) {
  if (!fs.existsSync(packagePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

function buildRuntimeCacheKeys(options, sources) {
  const packagerInputs = hashFiles([
    'scripts/build-full-internal-package.mjs',
    'src/full-internal-package.ts',
  ]);
  const excludePolicyHash = stringSha256(shouldExcludeRuntimePath.toString());
  const skillsRoot = path.join(os.homedir(), '.codex', 'skills');

  return {
    toolchain: buildFullRuntimeCacheKey({
      layerId: 'toolchain',
      parts: {
        codex_package_version: packageJsonVersion(path.join(sources.codexRoot, 'package.json')),
        codex_binary_sha256: fileSha256(sources.codexBinaries.codex),
        rg_sha256: fileSha256(sources.codexBinaries.rg),
        node_sha256: fileSha256(sources.nodeBin),
        uv_sha256: fileSha256(sources.uvBin),
        python_root_name: path.basename(sources.pythonRoot),
        python_version: commandOutput(path.join(sources.pythonRoot, 'bin', 'python3'), ['--version']),
        packager_inputs: packagerInputs,
        exclude_policy_hash: excludePolicyHash,
      },
    }),
    'domain-runtime': buildFullRuntimeCacheKey({
      layerId: 'domain-runtime',
      parts: {
        hermes_commit: readGitHead(options.hermesRoot),
        mas_commit: readGitHead(options.masRoot),
        mds_commit: readGitHead(options.mdsRoot),
        packager_inputs: packagerInputs,
        exclude_policy_hash: excludePolicyHash,
      },
    }),
    'opl-runtime': buildFullRuntimeCacheKey({
      layerId: 'opl-runtime',
      parts: {
        opl_commit: readGitHead(repoRoot),
        package_json_sha256: fileSha256(path.join(repoRoot, 'package.json')),
        package_lock_sha256: fileSha256(path.join(repoRoot, 'package-lock.json')),
        tsconfig_sha256: fileSha256(path.join(repoRoot, 'tsconfig.json')),
        packager_inputs: packagerInputs,
        exclude_policy_hash: excludePolicyHash,
      },
    }),
    skills: buildFullRuntimeCacheKey({
      layerId: 'skills',
      parts: {
        skills_root_exists: fs.existsSync(skillsRoot),
        mas_skill_fingerprint: directoryFingerprint(path.join(skillsRoot, 'mas'), 'skills/mas'),
        mag_skill_fingerprint: directoryFingerprint(path.join(skillsRoot, 'mag'), 'skills/mag'),
        rca_skill_fingerprint: directoryFingerprint(path.join(skillsRoot, 'rca'), 'skills/rca'),
        mas_skill_git: readGitHead(path.join(skillsRoot, 'mas')),
        mag_skill_git: readGitHead(path.join(skillsRoot, 'mag')),
        rca_skill_git: readGitHead(path.join(skillsRoot, 'rca')),
        packager_inputs: packagerInputs,
        exclude_policy_hash: excludePolicyHash,
      },
    }),
  };
}

function cacheLayerArchivePath(options, layerId, key) {
  return path.join(
    options.runtimeCacheDir || path.join(os.tmpdir(), 'opl-full-runtime-cache'),
    layerId,
    buildFullRuntimeCacheArchiveName({ layerId, key }),
  );
}

function layerCacheEnabled(options) {
  return options.runtimeCacheMode !== 'off' && Boolean(options.runtimeCacheDir);
}

function runCachedLayer(options, layerId, key, targetRoot, builder) {
  const archivePath = cacheLayerArchivePath(options, layerId, key);
  if (layerCacheEnabled(options) && fs.existsSync(archivePath)) {
    extractLayer(archivePath, targetRoot);
    return {
      layer_id: layerId,
      key,
      status: 'hit',
      archive_path: archivePath,
    };
  }

  const tempLayerRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-full-${layerId}-`));
  try {
    builder(tempLayerRoot);
    copyPathContents(tempLayerRoot, targetRoot);
    if (layerCacheEnabled(options) && options.runtimeCacheMode === 'readwrite') {
      archiveLayer(tempLayerRoot, archivePath);
      return {
        layer_id: layerId,
        key,
        status: 'miss_written',
        archive_path: archivePath,
      };
    }
    return {
      layer_id: layerId,
      key,
      status: layerCacheEnabled(options) ? 'miss_readonly' : 'disabled',
      archive_path: layerCacheEnabled(options) ? archivePath : null,
    };
  } finally {
    fs.rmSync(tempLayerRoot, { recursive: true, force: true });
  }
}

function buildToolchainLayer(layerRoot, sources) {
  copySingleFile(sources.codexBinaries.codex, path.join(layerRoot, 'bin', 'codex'));
  copySingleFile(sources.codexBinaries.rg, path.join(layerRoot, 'bin', 'rg'));
  copySingleFile(sources.nodeBin, path.join(layerRoot, 'node', 'bin', 'node'));
  copySingleFile(sources.uvBin, path.join(layerRoot, 'uv', 'bin', 'uv'));
  copyTreeFiltered(
    sources.pythonRoot,
    path.join(layerRoot, 'python', path.basename(sources.pythonRoot)),
    `python/${path.basename(sources.pythonRoot)}`,
  );
  writeRuntimeWrappers(layerRoot);
}

function buildDomainLayer(layerRoot, options) {
  copyTreeFiltered(options.hermesRoot, path.join(layerRoot, 'hermes'), 'hermes');
  copyTreeFiltered(options.masRoot, path.join(layerRoot, 'modules', 'mas'), 'modules/mas');
  copyTreeFiltered(options.mdsRoot, path.join(layerRoot, 'modules', 'mds'), 'modules/mds');
}

function writeDomainMarkers(runtimeRoot, options, packagedAt) {
  writePackagedModuleMarker(path.join(runtimeRoot, 'modules', 'mas'), buildPackagedModuleMarker({
    moduleId: 'medautoscience',
    repoName: 'med-autoscience',
    sourcePath: options.masRoot,
    headSha: readGitHead(options.masRoot),
    packagedAt,
  }));
  writePackagedModuleMarker(path.join(runtimeRoot, 'modules', 'mds'), buildPackagedModuleMarker({
    moduleId: 'meddeepscientist',
    repoName: 'med-deepscientist',
    sourcePath: options.mdsRoot,
    headSha: readGitHead(options.mdsRoot),
    packagedAt,
  }));
}

function buildOplLayer(layerRoot) {
  copyTreeFiltered(repoRoot, path.join(layerRoot, 'opl'), 'opl');
}

function buildSkillsLayer(layerRoot) {
  copyRecommendedSkills(path.join(layerRoot, 'skills'));
}

function prepareRuntime(options, sources) {
  const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-runtime-'));
  const runtimeRoot = path.join(stagingRoot, 'current');
  fs.mkdirSync(path.join(runtimeRoot, 'bin'), { recursive: true });

  const packagedAt = new Date().toISOString();
  const cacheKeys = buildRuntimeCacheKeys(options, sources);
  const cacheEvents = [
    runCachedLayer(options, 'toolchain', cacheKeys.toolchain, runtimeRoot, (layerRoot) => {
      buildToolchainLayer(layerRoot, sources);
    }),
    runCachedLayer(options, 'domain-runtime', cacheKeys['domain-runtime'], runtimeRoot, (layerRoot) => {
      buildDomainLayer(layerRoot, options);
    }),
    runCachedLayer(options, 'opl-runtime', cacheKeys['opl-runtime'], runtimeRoot, (layerRoot) => {
      buildOplLayer(layerRoot);
    }),
    runCachedLayer(options, 'skills', cacheKeys.skills, runtimeRoot, (layerRoot) => {
      buildSkillsLayer(layerRoot);
    }),
  ];
  writeDomainMarkers(runtimeRoot, options, packagedAt);

  const components = {
    opl: { source_path: repoRoot, git_commit: readGitHead(repoRoot), size_bytes: directorySizeBytes(path.join(runtimeRoot, 'opl')) },
    codex: { source_path: sources.codexRoot, version: commandOutput(path.join(runtimeRoot, 'bin', 'codex'), ['--version']), size_bytes: directorySizeBytes(path.join(runtimeRoot, 'bin')) },
    hermes: { source_path: options.hermesRoot, version: commandOutput(path.join(runtimeRoot, 'bin', 'hermes'), ['version']), git_commit: readGitHead(options.hermesRoot), size_bytes: directorySizeBytes(path.join(runtimeRoot, 'hermes')) },
    mas: { source_path: options.masRoot, git_commit: readGitHead(options.masRoot), size_bytes: directorySizeBytes(path.join(runtimeRoot, 'modules', 'mas')) },
    mds: { source_path: options.mdsRoot, git_commit: readGitHead(options.mdsRoot), size_bytes: directorySizeBytes(path.join(runtimeRoot, 'modules', 'mds')) },
    node: { source_path: sources.nodeBin, version: commandOutput(path.join(runtimeRoot, 'node', 'bin', 'node'), ['--version']), size_bytes: directorySizeBytes(path.join(runtimeRoot, 'node')) },
    python: { source_path: sources.pythonRoot, version: commandOutput(path.join(runtimeRoot, 'python', path.basename(sources.pythonRoot), 'bin', 'python3'), ['--version']), size_bytes: directorySizeBytes(path.join(runtimeRoot, 'python')) },
    uv: { source_path: sources.uvBin, version: commandOutput(path.join(runtimeRoot, 'uv', 'bin', 'uv'), ['--version']), size_bytes: directorySizeBytes(path.join(runtimeRoot, 'uv')) },
    skills: { source_path: path.join(os.homedir(), '.codex', 'skills'), size_bytes: directorySizeBytes(path.join(runtimeRoot, 'skills')) },
  };

  const manifest = buildFullPackageManifest({
    version: options.version,
    generatedAt: packagedAt,
    components,
  });
  fs.mkdirSync(path.join(runtimeRoot, 'manifest'), { recursive: true });
  fs.writeFileSync(path.join(runtimeRoot, 'manifest', 'full-package-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  return {
    stagingRoot,
    runtimeRoot,
    manifest,
    runtime_cache: {
      mode: options.runtimeCacheMode,
      dir: options.runtimeCacheDir || null,
      keys: cacheKeys,
      events: cacheEvents,
    },
  };
}

function syncRuntimePayloadToGui(guiRoot, runtimeRoot, manifest) {
  const payloadRoot = path.join(guiRoot, 'packaged-runtimes', FULL_RUNTIME_RESOURCE_DIR);
  fs.rmSync(path.join(payloadRoot, 'runtime'), { recursive: true, force: true });
  fs.rmSync(path.join(payloadRoot, 'manifest'), { recursive: true, force: true });
  fs.mkdirSync(path.join(payloadRoot, 'runtime'), { recursive: true });
  fs.cpSync(runtimeRoot, path.join(payloadRoot, 'runtime', 'current'), {
    recursive: true,
    dereference: true,
    preserveTimestamps: true,
  });
  fs.mkdirSync(path.join(payloadRoot, 'manifest'), { recursive: true });
  fs.writeFileSync(
    path.join(payloadRoot, 'manifest', 'full-package-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

function findBuiltDmg(guiRoot, version) {
  const outDir = path.join(guiRoot, 'out');
  const candidates = [
    `One-Person-Lab-${version}-mac-arm64.dmg`,
    `One Person Lab-${version}-mac-arm64.dmg`,
  ].map((name) => path.join(outDir, name));
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Built arm64 DMG not found under ${outDir} for version ${version}`);
  }
  return found;
}

function removeStandardGuiArtifacts(guiRoot, version) {
  const outDir = path.join(guiRoot, 'out');
  if (!fs.existsSync(outDir)) {
    return;
  }
  for (const entry of fs.readdirSync(outDir)) {
    if (
      entry === `One-Person-Lab-${version}-mac-arm64.dmg`
      || entry === `One Person Lab-${version}-mac-arm64.dmg`
      || entry === `One-Person-Lab-${version}-mac-arm64.zip`
      || entry === `One Person Lab-${version}-mac-arm64.zip`
      || entry === `One-Person-Lab-${version}-mac-arm64.dmg.blockmap`
      || entry === `One Person Lab-${version}-mac-arm64.dmg.blockmap`
      || entry === `One-Person-Lab-${version}-mac-arm64.zip.blockmap`
      || entry === `One Person Lab-${version}-mac-arm64.zip.blockmap`
      || entry === 'latest-mac.yml'
      || entry === 'latest-arm64-mac.yml'
    ) {
      fs.rmSync(path.join(outDir, entry), { force: true });
    }
  }
}

function writeChecksums(outDir, files) {
  const lines = files.map((filePath) => {
    const result = run('shasum', ['-a', '256', filePath], { capture: true });
    const hash = result.stdout.trim().split(/\s+/)[0];
    return `${hash}  ${path.basename(filePath)}`;
  });
  const checksumPath = path.join(outDir, 'SHA256SUMS.txt');
  fs.writeFileSync(checksumPath, `${lines.join('\n')}\n`, 'utf8');
  return checksumPath;
}

function maybeCreateRuntimeTar(options, runtimeRoot, artifactNames) {
  if (!options.splitRuntime) {
    return null;
  }
  const target = path.join(options.outDir, artifactNames.runtimeTar);
  createTarZst(target, path.dirname(runtimeRoot), [path.basename(runtimeRoot)]);
  return target;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const artifactNames = buildFullPackageArtifactNames(options.version);
  fs.mkdirSync(options.outDir, { recursive: true });

  for (const [label, source] of [
    ['GUI root', options.guiRoot],
    ['Hermes root', options.hermesRoot],
    ['MAS root', options.masRoot],
    ['MDS root', options.mdsRoot],
  ]) {
    requirePath(source, label);
  }

  const sources = resolveRuntimeSources(options);
  if (options.printRuntimeCacheKeys) {
    console.log(JSON.stringify({
      status: 'runtime_cache_keys',
      version: options.version,
      runtime_cache_mode: options.runtimeCacheMode,
      runtime_cache_dir: options.runtimeCacheDir || null,
      layers: buildRuntimeCacheKeys(options, sources),
      layer_ids: FULL_RUNTIME_CACHE_LAYER_IDS,
    }, null, 2));
    return;
  }

  const prepared = prepareRuntime(options, sources);
  syncRuntimePayloadToGui(options.guiRoot, prepared.runtimeRoot, prepared.manifest);

  if (!options.skipGuiBuild) {
    run('npm', ['run', 'build-mac:arm64'], {
      cwd: options.guiRoot,
      env: {
        ...process.env,
        OPL_RELEASE_VERSION: options.version,
      },
    });
  }

  const sourceDmg = findBuiltDmg(options.guiRoot, options.version);
  const targetDmg = path.join(options.outDir, artifactNames.dmg);
  fs.copyFileSync(sourceDmg, targetDmg);
  removeStandardGuiArtifacts(options.guiRoot, options.version);
  const runtimeTar = maybeCreateRuntimeTar(options, prepared.runtimeRoot, artifactNames);

  const manifestPath = path.join(options.outDir, artifactNames.manifest);
  fs.writeFileSync(manifestPath, `${JSON.stringify(prepared.manifest, null, 2)}\n`, 'utf8');
  const readmePath = path.join(options.outDir, artifactNames.readme);
  fs.writeFileSync(readmePath, buildInternalPackageReadme({
    version: options.version,
    dmgName: artifactNames.dmg,
    runtimeTarName: runtimeTar ? artifactNames.runtimeTar : null,
    notarized: process.env.OPL_FULL_PACKAGE_NOTARIZED === 'true',
  }), 'utf8');
  const checksumPath = writeChecksums(options.outDir, [targetDmg, manifestPath, readmePath, ...(runtimeTar ? [runtimeTar] : [])]);

  console.log(JSON.stringify({
    status: 'completed',
    version: options.version,
    out_dir: options.outDir,
    dmg: targetDmg,
    runtime_tar: runtimeTar,
    manifest: manifestPath,
    readme: readmePath,
    checksums: checksumPath,
    staging_root: prepared.stagingRoot,
    runtime_cache: prepared.runtime_cache,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
