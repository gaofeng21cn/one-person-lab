import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import {
  buildRuntimeEnvironmentPrepareReadback,
  buildRuntimeEnvironmentRunContextReadback,
} from '../../src/adapters/execution/runtime-environment-substrate.ts';
import { installRPackagesIntoManagedLibrary } from '../../src/adapters/execution/runtime-environment-substrate-parts/package-profile.ts';
import { preparedDependencyCache } from '../../src/adapters/execution/runtime-environment-substrate-parts/prepared-cache.ts';
type Json = Record<string, unknown>;

test('matching dependencies share a prepared environment across artifacts and domains; lock edits select a new one', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-environment-sharing-'));
  const previousState = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = path.join(root, 'state');
  t.after(() => {
    if (previousState === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousState;
    fs.rmSync(root, { recursive: true, force: true });
  });
  const profile = path.join(root, 'requirements.json');
  const lock = path.join(root, 'uv.lock');
  fs.writeFileSync(profile, JSON.stringify({ profiles: [{ profile_id: 'empty', runtime_binaries: [],
    language_packages: { python: [], r: [] }, language_locks: { python: { lock_ref: 'uv.lock' } } }] }));
  fs.writeFileSync(lock, 'version = 1');
  const prepare = async (domain: string, refresh = false) => (await buildRuntimeEnvironmentPrepareReadback({
    domainId: domain, profileId: domain, platformId: 'test-local', artifactRoot: path.join(root, domain),
    requirementProfilePath: profile, requirementProfileId: 'empty', apply: true, refresh,
  })).prepare;
  const first = await prepare('mas');
  const second = await prepare('another-domain');
  assert.equal(first.status, 'prepared');
  assert.equal(first.cache_hit, false);
  assert.equal(second.cache_hit, true);
  assert.equal(second.environment_id, first.environment_id);
  assert.equal(second.managed_python_environment_path, first.managed_python_environment_path);
  const firstManifestRef = first.environment_manifest_ref as string;
  const firstManifestBytes = fs.readFileSync(firstManifestRef, 'utf8');
  const refreshed = await prepare('mas', true);
  assert.equal(refreshed.environment_id, first.environment_id);
  assert.equal(fs.readFileSync(firstManifestRef, 'utf8'), firstManifestBytes, 'refresh must preserve historical version evidence');
  assert.equal(path.basename(path.dirname(refreshed.environment_manifest_ref as string)), 'manifests');
  const context = JSON.parse(fs.readFileSync(path.join(root, 'mas/build/dependency_run_context.json'), 'utf8'));
  assert.equal(context.environment_manifest_ref, refreshed.environment_manifest_ref);
  fs.writeFileSync(lock, 'version = 2');
  const changed = await prepare('third-domain');
  assert.notEqual(changed.environment_id, first.environment_id);
  assert.equal(changed.cache_hit, false);
});

test('dependency declaration order does not split the cache but source and version changes do', async () => {
  const requirements = {
    python: [{ name: 'numpy==2.5.3' }, { name: 'matplotlib==3.11.2' }],
    r: [{ name: 'ComplexHeatmap', install_source: 'bioconductor' }, { name: 'jsonlite', install_source: 'cran' }],
    locks: ['lock-a', 'lock-b'],
  };
  const original = preparedDependencyCache(requirements, {});
  const reordered = preparedDependencyCache({ python: [...requirements.python].reverse(), r: [...requirements.r].reverse(), locks: [...requirements.locks].reverse() }, {});
  assert.equal(reordered.environmentId, original.environmentId);
  assert.notEqual(preparedDependencyCache({ ...requirements, python: [{ name: 'numpy==2.0.0' }, requirements.python[1]] }, {}).environmentId, original.environmentId);
  assert.notEqual(preparedDependencyCache({ ...requirements, r: [{ name: 'ComplexHeatmap', install_source: 'github', github_repo: 'jokergoo/ComplexHeatmap' }, requirements.r[1]] }, {}).environmentId, original.environmentId);
});

test('concurrent first preparations serialize and the second process reuses the completed environment', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-environment-lock-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const moduleUrl = new URL('../../src/adapters/execution/runtime-environment-substrate-parts/prepared-cache.ts', import.meta.url).href;
  const worker = `
    import fs from 'node:fs';
    import { acquirePreparationLock } from ${JSON.stringify(moduleUrl)};
    const release = await acquirePreparationLock(${JSON.stringify(root)});
    try {
      if (!fs.existsSync(${JSON.stringify(path.join(root, 'ready'))})) {
        fs.appendFileSync(${JSON.stringify(path.join(root, 'installs'))}, 'install\\n');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
        fs.writeFileSync(${JSON.stringify(path.join(root, 'ready'))}, 'ready');
      }
    } finally { release(); }
  `;
  const run = () => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', worker], { stdio: ['ignore', 'ignore', 'pipe'] });
    let errors = '';
    child.stderr.on('data', (chunk) => { errors += chunk; });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(errors)));
  });
  await Promise.all([run(), run()]);
  assert.equal(fs.readFileSync(path.join(root, 'installs'), 'utf8'), 'install\n');
  assert.equal(fs.existsSync(path.join(root, 'prepare.lock')), false);
});

test('runtime env prepare carries renv and uv lock refs into output, run-context, and identity', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-env-locks-'));
  const paperRoot = path.join(tempRoot, 'paper');
  const profilePath = path.join(tempRoot, 'requirements.json');
  const profile = {
    profiles: [
      {
        profile_id: 'analysis',
        runtime_binaries: [],
        language_packages: { r: [], python: [] },
        language_locks: {
          r: {
            lock_ref: 'renv.lock',
            source_ref: 'analysis/renv.lock',
            project_ref: 'analysis',
          },
          python: {
            lock_ref: 'uv.lock',
            source_ref: 'analysis/uv.lock',
            project_ref: 'analysis/pyproject.toml',
          },
        },
      },
    ],
  };
  fs.writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`);

  const readback = await buildRuntimeEnvironmentPrepareReadback({
    domainId: 'mas',
    profileId: 'analysis',
    platformId: 'macos-arm64',
    requirementProfilePath: profilePath,
    requirementProfileId: 'analysis',
    paperRoot,
  }) as Json;
  const prepare = readback.prepare as Json;
  const handoff = prepare.language_lock_handoff as Json;
  const rHandoff = handoff.r as Json;
  const pythonHandoff = handoff.python as Json;

  assert.equal(prepare.status, 'prepared');
  assert.equal(prepare.host_package_fallback_allowed, false);
  assert.deepEqual(rHandoff.lock_refs, ['renv.lock']);
  assert.deepEqual(pythonHandoff.lock_refs, ['uv.lock']);
  assert.equal(rHandoff.renv_backed_handoff, true);
  assert.equal(pythonHandoff.uv_backed_handoff, true);
  assert.deepEqual(prepare.requirement_lock_refs, ['renv.lock', 'uv.lock']);
  assert.equal((prepare.source_requirement_refs as string[]).includes('analysis/renv.lock'), true);
  assert.equal((prepare.source_requirement_refs as string[]).includes('analysis/uv.lock'), true);

  const runContext = readback.run_context as Json;
  assert.deepEqual(((runContext.language_lock_handoff as Json).r as Json).lock_refs, ['renv.lock']);
  assert.deepEqual(((runContext.language_lock_handoff as Json).python as Json).lock_refs, ['uv.lock']);
  const runContextReadback = buildRuntimeEnvironmentRunContextReadback({
    domainId: 'mas',
    profileId: 'analysis',
    platformId: 'macos-arm64',
    paperRoot,
  }) as Json;
  const boundRunContext = runContextReadback.run_context as Json;
  assert.equal((boundRunContext.consumer_preflight as Json).status, 'bound');
  assert.deepEqual(((boundRunContext.language_lock_handoff as Json).python as Json).project_refs, [
    'analysis/pyproject.toml',
  ]);

  const firstIdentity = prepare.requirement_profile_identity as Json;
  const firstFingerprint = firstIdentity.profile_fingerprint;
  const firstRCacheKey = prepare.managed_r_library_path;
  const firstPythonCacheKey = prepare.managed_python_environment_path;
  fs.writeFileSync(
    profilePath,
    `${JSON.stringify({
      profiles: [
        {
          ...profile.profiles[0],
          language_locks: {
            r: { lock_ref: 'renv-v2.lock' },
            python: { lock_ref: 'uv-v2.lock' },
          },
        },
      ],
    }, null, 2)}\n`,
  );
  const changed = await buildRuntimeEnvironmentPrepareReadback({
    domainId: 'mas',
    profileId: 'analysis',
    platformId: 'macos-arm64',
    requirementProfilePath: profilePath,
    requirementProfileId: 'analysis',
    paperRoot: path.join(tempRoot, 'paper-v2'),
  }) as Json;
  const changedPrepare = changed.prepare as Json;
  assert.notEqual((changedPrepare.requirement_profile_identity as Json).profile_fingerprint, firstFingerprint);
  assert.notEqual(changedPrepare.managed_r_library_path, firstRCacheKey);
  assert.notEqual(changedPrepare.managed_python_environment_path, firstPythonCacheKey);
});

test('runtime env prepare preserves Bioconductor package source intent', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-env-bioconductor-'));
  const profilePath = path.join(tempRoot, 'requirements.json');
  fs.writeFileSync(
    profilePath,
    `${JSON.stringify({
      profiles: [{
        profile_id: 'analysis',
        runtime_binaries: [],
        language_packages: {
          r: [{
            name: 'ComplexHeatmap',
            required: true,
            source: { type: 'bioconductor' },
          }],
        },
      }],
    }, null, 2)}\n`,
  );

  const readback = await buildRuntimeEnvironmentPrepareReadback({
    domainId: 'mas',
    profileId: 'analysis',
    platformId: 'macos-arm64',
    requirementProfilePath: profilePath,
    requirementProfileId: 'analysis',
    artifactRoot: path.join(tempRoot, 'artifacts'),
  }) as Json;

  assert.deepEqual((readback.prepare as Json).r_package_requirements, [{
    name: 'ComplexHeatmap',
    install_source: 'bioconductor',
  }]);
});

test('runtime env forces a host-visible Bioconductor package into the managed R library', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-env-bioc-install-'));
  const rscriptPath = path.join(tempRoot, 'Rscript');
  const commandLog = path.join(tempRoot, 'install-expression.txt');
  const libraryPath = path.join(tempRoot, 'library');
  fs.writeFileSync(
    rscriptPath,
    `#!/bin/sh\ncase "$3" in\n  *installed.packages*) printf 'ComplexHeatmap\\n' ;;\n  *) printf '%s\\n' "$3" > ${JSON.stringify(commandLog)} ;;\nesac\n`,
    { mode: 0o755 },
  );

  const receipt = await installRPackagesIntoManagedLibrary(
    rscriptPath,
    libraryPath,
    [{ name: 'ComplexHeatmap', install_source: 'bioconductor' }],
    ['ComplexHeatmap'],
  );

  assert.equal(receipt.status, 'installed');
  assert.deepEqual(receipt.failed, []);
  const expression = fs.readFileSync(commandLog, 'utf8');
  assert.match(expression, /renv::install\(c\("bioc::ComplexHeatmap"\)/);
  assert.equal(expression.includes('https://cloud.r-project.org'), true);
  assert.equal(expression.includes(`library=${JSON.stringify(libraryPath)}`), true);

});
