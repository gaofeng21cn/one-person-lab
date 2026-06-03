import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildManagedShellCommandEnv,
  buildManagedShellEnvWithUvCacheRecovery,
  prepareManagedShellCommandCwd,
  recordManagedShellUvCacheRecovery,
  shouldUseManagedShellScratchCwd,
} from '../../src/managed-shell-command-env.ts';

test('managed shell command env routes python, uv, and pytest artifacts outside the checkout', () => {
  const checkoutRoot = path.join(os.tmpdir(), 'opl-managed-shell-checkout');
  const env: Record<string, string | undefined> = buildManagedShellCommandEnv(checkoutRoot, {
    OPL_DOMAIN_COMMAND_TMP_ROOT: path.join(os.tmpdir(), 'opl-managed-shell-domain-root'),
    PYTHONPYCACHEPREFIX: path.join(checkoutRoot, '__pycache__'),
    UV_PROJECT_ENVIRONMENT: path.join(checkoutRoot, '.venv'),
    PYTEST_ADDOPTS: [
      '-q',
      '-o',
      `cache_dir=${path.join(checkoutRoot, '.pytest_cache')}`,
      `--cache-dir=${path.join(checkoutRoot, 'pytest-cache')}`,
    ].join(' '),
  });

  assert.equal(env.PYTHONDONTWRITEBYTECODE, '1');
  assert.equal(
    env.OPL_DOMAIN_COMMAND_TMP_ROOT,
    path.join(os.tmpdir(), 'opl-managed-shell-domain-root', path.basename(checkoutRoot)),
  );
  assert.equal(env.PYTEST_ADDOPTS?.includes('-q'), true);
  assert.equal(env.PYTEST_ADDOPTS?.includes('cache_dir='), true);
  assert.equal(env.PYTEST_ADDOPTS?.includes(checkoutRoot), false);

  for (const name of [
    'PYTHONPYCACHEPREFIX',
    'UV_PROJECT_ENVIRONMENT',
    'UV_CACHE_DIR',
    'XDG_CACHE_HOME',
    'PIP_CACHE_DIR',
    'OPL_DOMAIN_COMMAND_TMP_ROOT',
    'MAS_CLEAN_RUNNER_TMP_ROOT',
    'MAG_CLEAN_RUNNER_TMP_ROOT',
    'RCA_CLEAN_RUNNER_TMP_ROOT',
    'MED_AUTOGRANT_EDITABLE_SHARED_ENV_ROOT',
  ]) {
    const value = env[name];
    assert.equal(typeof value, 'string', `${name} must be set`);
    const relative = path.relative(checkoutRoot, path.resolve(value as string));
    assert.equal(
      relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)),
      false,
      `${name} must not point inside the checkout`,
    );
  }
});

test('managed shell command env isolates project venvs per bound workspace', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-shell-domain-root-'));
  const masWorkspace = path.join(os.tmpdir(), 'med-autoscience');
  const magWorkspace = path.join(os.tmpdir(), 'med-autogrant');

  try {
    const masEnv = buildManagedShellCommandEnv(masWorkspace, {
      OPL_DOMAIN_COMMAND_TMP_ROOT: root,
      UV_PROJECT_ENVIRONMENT: path.join(root, 'shared-uv-project'),
      PYTHONPYCACHEPREFIX: path.join(root, 'shared-pycache'),
    });
    const magEnv = buildManagedShellCommandEnv(magWorkspace, {
      OPL_DOMAIN_COMMAND_TMP_ROOT: root,
      UV_PROJECT_ENVIRONMENT: path.join(root, 'shared-uv-project'),
      PYTHONPYCACHEPREFIX: path.join(root, 'shared-pycache'),
    });

    assert.equal(masEnv.OPL_DOMAIN_COMMAND_TMP_ROOT, path.join(root, 'med-autoscience'));
    assert.equal(magEnv.OPL_DOMAIN_COMMAND_TMP_ROOT, path.join(root, 'med-autogrant'));
    assert.equal(masEnv.UV_PROJECT_ENVIRONMENT, path.join(root, 'med-autoscience', 'uv-project'));
    assert.equal(magEnv.UV_PROJECT_ENVIRONMENT, path.join(root, 'med-autogrant', 'uv-project'));
    assert.notEqual(masEnv.UV_PROJECT_ENVIRONMENT, magEnv.UV_PROJECT_ENVIRONMENT);
    assert.notEqual(masEnv.PYTHONPYCACHEPREFIX, magEnv.PYTHONPYCACHEPREFIX);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('managed shell command env reuses stable recovery root after uv cache recovery', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-shell-domain-root-'));
  const checkoutRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-shell-recovery-checkout-'));
  try {
    const baseEnv = {
      OPL_DOMAIN_COMMAND_TMP_ROOT: root,
    };
    const recoveryTmpRoot = path.join(root, path.basename(checkoutRoot), 'recovery', path.basename(checkoutRoot));
    recordManagedShellUvCacheRecovery(checkoutRoot, baseEnv, {
      recoveryTmpRoot,
      firstExitCode: 2,
      retryExitCode: 0,
      firstErrorExcerpt: 'archive-v0 METADATA missing',
    });

    const recoveredEnv = buildManagedShellCommandEnv(
      checkoutRoot,
      buildManagedShellEnvWithUvCacheRecovery(checkoutRoot, baseEnv),
    );

    assert.equal(recoveredEnv.OPL_DOMAIN_COMMAND_TMP_ROOT, recoveryTmpRoot);
    assert.equal(recoveredEnv.UV_CACHE_DIR, path.join(recoveryTmpRoot, 'uv-cache'));
    assert.equal(recoveredEnv.UV_PROJECT_ENVIRONMENT, path.join(recoveryTmpRoot, 'uv-project'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
  }
});

test('managed shell command cwd uses scratch copies for uv run commands only', () => {
  const checkoutRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-shell-scratch-checkout-'));
  fs.mkdirSync(path.join(checkoutRoot, '.git'), { recursive: true });
  fs.mkdirSync(path.join(checkoutRoot, 'src', 'package.egg-info'), { recursive: true });
  fs.mkdirSync(path.join(checkoutRoot, 'src', 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(checkoutRoot, 'src', 'pkg', '__init__.py'), '', 'utf8');
  fs.writeFileSync(path.join(checkoutRoot, 'pyproject.toml'), '[project]\nname = "pkg"\n', 'utf8');

  try {
    assert.equal(shouldUseManagedShellScratchCwd('uv run python -m pkg'), true);
    assert.equal(
      shouldUseManagedShellScratchCwd(
        'uv run python -m med_autoscience.cli product manifest --profile /tmp/profile.toml --format json',
      ),
      false,
    );
    assert.equal(
      shouldUseManagedShellScratchCwd(
        "uv run --directory '/tmp/mas' python -c 'from med_autoscience.profiles import load_profile; from med_autoscience.controllers.product_entry import build_product_entry_manifest; import json; profile_ref = \"/tmp/profile.toml\"; print(json.dumps(build_product_entry_manifest(profile=load_profile(profile_ref), profile_ref=profile_ref), ensure_ascii=False))'",
      ),
      false,
    );
    assert.equal(
      shouldUseManagedShellScratchCwd(
        "source '/tmp/manifest-shell-guard.sh' && uv run python -m med_autoscience.cli product manifest --profile /tmp/profile.toml --format json",
      ),
      false,
    );
    assert.equal(
      shouldUseManagedShellScratchCwd(
        'uv run python -m med_autoscience.cli study-state-matrix --profile /tmp/profile.toml --format json',
      ),
      false,
    );
    assert.equal(
      shouldUseManagedShellScratchCwd(
        'uv run python -m med_autogrant product status --input /tmp/workspace.json --format json',
      ),
      false,
    );
    assert.equal(
      shouldUseManagedShellScratchCwd(
        "uv run --directory '/tmp/mag' python -c 'from med_autogrant.product_entry import MedAutoGrantProductEntry; import json; print(json.dumps(MedAutoGrantProductEntry().build_product_entry_manifest(input_path=\"/tmp/workspace.json\"), ensure_ascii=False))'",
      ),
      false,
    );
    assert.equal(shouldUseManagedShellScratchCwd(`${process.execPath} -e "process.stdout.write('uv run')"`) , false);
    assert.equal(shouldUseManagedShellScratchCwd('npm run product manifest'), false);

    const first = prepareManagedShellCommandCwd(checkoutRoot, 'uv run python -m pkg');
    const second = prepareManagedShellCommandCwd(checkoutRoot, 'uv run python -m pkg');
    assert.notEqual(first.cwd, checkoutRoot);
    assert.notEqual(first.cwd, second.cwd);
    assert.equal(fs.existsSync(path.join(first.cwd, 'pyproject.toml')), true);
    assert.equal(fs.existsSync(path.join(first.cwd, 'src', 'pkg', '__init__.py')), true);
    assert.equal(fs.existsSync(path.join(first.cwd, '.git')), true);
    assert.equal(fs.existsSync(path.join(first.cwd, 'src', 'package.egg-info')), false);
    first.cleanup();
    second.cleanup();
    assert.equal(fs.existsSync(first.cwd), false);
    assert.equal(fs.existsSync(second.cwd), false);
    const nonUv = prepareManagedShellCommandCwd(checkoutRoot, 'npm run product manifest');
    assert.equal(nonUv.cwd, checkoutRoot);
    nonUv.cleanup();
  } finally {
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
  }
});
