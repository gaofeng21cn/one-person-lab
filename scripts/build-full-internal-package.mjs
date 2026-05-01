#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  FULL_INTERNAL_OUTPUT_DIR,
  FULL_RUNTIME_RESOURCE_DIR,
  PACKAGED_MODULE_MARKER_FILE,
  buildFullPackageManifest,
  buildInternalArtifactNames,
  buildInternalPackageReadme,
  buildPackagedModuleMarker,
  shouldExcludeRuntimePath,
} from '../src/full-internal-package.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.dirname(repoRoot);

function parseArgs(argv) {
  const parsed = {
    version: process.env.OPL_RELEASE_VERSION || '26.5.1',
    outDir: FULL_INTERNAL_OUTPUT_DIR,
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
    else throw new Error(`Unknown argument: ${token}`);
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

function prepareRuntime(options) {
  const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-runtime-'));
  const runtimeRoot = path.join(stagingRoot, options.version);
  fs.mkdirSync(path.join(runtimeRoot, 'bin'), { recursive: true });

  const codexRoot = findCodexRoot(options.codexRoot);
  const codexBinaries = findCodexBinary(codexRoot);
  const nodeBin = findNodeBinary(options.nodeBin);
  const pythonRoot = findPythonRoot(options.pythonRoot);
  const uvBin = requirePath(options.uvBin, 'uv binary');

  copyTreeFiltered(repoRoot, path.join(runtimeRoot, 'opl'), 'opl');
  copyTreeFiltered(options.hermesRoot, path.join(runtimeRoot, 'hermes'), 'hermes');
  copyTreeFiltered(options.masRoot, path.join(runtimeRoot, 'modules', 'mas'), 'modules/mas');
  copyTreeFiltered(options.mdsRoot, path.join(runtimeRoot, 'modules', 'mds'), 'modules/mds');
  copyRecommendedSkills(path.join(runtimeRoot, 'skills'));

  copySingleFile(codexBinaries.codex, path.join(runtimeRoot, 'bin', 'codex'));
  copySingleFile(codexBinaries.rg, path.join(runtimeRoot, 'bin', 'rg'));
  copySingleFile(nodeBin, path.join(runtimeRoot, 'node', 'bin', 'node'));
  copySingleFile(uvBin, path.join(runtimeRoot, 'uv', 'bin', 'uv'));
  copyTreeFiltered(pythonRoot, path.join(runtimeRoot, 'python', path.basename(pythonRoot)), `python/${path.basename(pythonRoot)}`);
  writeRuntimeWrappers(runtimeRoot);

  const packagedAt = new Date().toISOString();
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

  const components = {
    opl: { source_path: repoRoot, git_commit: readGitHead(repoRoot), size_bytes: directorySizeBytes(path.join(runtimeRoot, 'opl')) },
    codex: { source_path: codexRoot, version: commandOutput(path.join(runtimeRoot, 'bin', 'codex'), ['--version']), size_bytes: directorySizeBytes(path.join(runtimeRoot, 'bin')) },
    hermes: { source_path: options.hermesRoot, version: commandOutput(path.join(runtimeRoot, 'bin', 'hermes'), ['version']), git_commit: readGitHead(options.hermesRoot), size_bytes: directorySizeBytes(path.join(runtimeRoot, 'hermes')) },
    mas: { source_path: options.masRoot, git_commit: readGitHead(options.masRoot), size_bytes: directorySizeBytes(path.join(runtimeRoot, 'modules', 'mas')) },
    mds: { source_path: options.mdsRoot, git_commit: readGitHead(options.mdsRoot), size_bytes: directorySizeBytes(path.join(runtimeRoot, 'modules', 'mds')) },
    node: { source_path: nodeBin, version: commandOutput(path.join(runtimeRoot, 'node', 'bin', 'node'), ['--version']), size_bytes: directorySizeBytes(path.join(runtimeRoot, 'node')) },
    python: { source_path: pythonRoot, version: commandOutput(path.join(runtimeRoot, 'python', path.basename(pythonRoot), 'bin', 'python3'), ['--version']), size_bytes: directorySizeBytes(path.join(runtimeRoot, 'python')) },
    uv: { source_path: uvBin, version: commandOutput(path.join(runtimeRoot, 'uv', 'bin', 'uv'), ['--version']), size_bytes: directorySizeBytes(path.join(runtimeRoot, 'uv')) },
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
  };
}

function syncRuntimePayloadToGui(guiRoot, version, runtimeRoot, manifest) {
  const payloadRoot = path.join(guiRoot, 'packaged-runtimes', FULL_RUNTIME_RESOURCE_DIR);
  fs.rmSync(path.join(payloadRoot, 'runtime'), { recursive: true, force: true });
  fs.rmSync(path.join(payloadRoot, 'manifest'), { recursive: true, force: true });
  fs.mkdirSync(path.join(payloadRoot, 'runtime'), { recursive: true });
  fs.cpSync(runtimeRoot, path.join(payloadRoot, 'runtime', version), {
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
  fs.rmSync(target, { force: true });
  run('tar', ['--zstd', '-cf', target, '-C', path.dirname(runtimeRoot), path.basename(runtimeRoot)]);
  return target;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const artifactNames = buildInternalArtifactNames(options.version);
  fs.mkdirSync(options.outDir, { recursive: true });

  for (const [label, source] of [
    ['GUI root', options.guiRoot],
    ['Hermes root', options.hermesRoot],
    ['MAS root', options.masRoot],
    ['MDS root', options.mdsRoot],
  ]) {
    requirePath(source, label);
  }

  const prepared = prepareRuntime(options);
  syncRuntimePayloadToGui(options.guiRoot, options.version, prepared.runtimeRoot, prepared.manifest);

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
  const runtimeTar = maybeCreateRuntimeTar(options, prepared.runtimeRoot, artifactNames);

  const manifestPath = path.join(options.outDir, artifactNames.manifest);
  fs.writeFileSync(manifestPath, `${JSON.stringify(prepared.manifest, null, 2)}\n`, 'utf8');
  const readmePath = path.join(options.outDir, artifactNames.readme);
  fs.writeFileSync(readmePath, buildInternalPackageReadme({
    version: options.version,
    dmgName: artifactNames.dmg,
    runtimeTarName: runtimeTar ? artifactNames.runtimeTar : null,
    notarized: false,
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
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
