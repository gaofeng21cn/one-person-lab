import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import { renderCodexConfigFixture } from '../../scripts/fresh-install-codex-config-fixture.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const smokeScript = path.join(repoRoot, 'scripts', 'fresh-install-smoke.mjs');
const matrixContractPath = path.join(repoRoot, 'contracts', 'opl-framework', 'fresh-install-test-matrix.json');
const codexDefaultProfilePath = path.join(repoRoot, 'contracts', 'opl-framework', 'codex-default-profile.json');
const codexDefaultProfileExporterPath = path.join(repoRoot, 'scripts', 'export-codex-default-profile.mjs');
const installScript = path.join(repoRoot, 'install.sh');

test('install carrier-only handles no forwarded args under nounset bash', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-bash-compat-'));
  const fakeBin = path.join(homeRoot, 'bin');
  const installDir = path.join(homeRoot, '.opl', 'one-person-lab');
  fs.mkdirSync(fakeBin, { recursive: true });

  fs.writeFileSync(
    path.join(fakeBin, 'git'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'if [ "${1:-}" = "--version" ]; then',
      '  printf "git version 2.50.0\\n"',
      '  exit 0',
      'fi',
      'if [ "${1:-}" = "clone" ]; then',
      '  target=""',
      '  for arg in "$@"; do target="$arg"; done',
      '  mkdir -p "$target/.git"',
      'fi',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(fakeBin, 'node'), '#!/usr/bin/env bash\nexit 0\n');
  fs.writeFileSync(path.join(fakeBin, 'npm'), '#!/usr/bin/env bash\nexit 0\n');
  for (const command of ['git', 'node', 'npm']) {
    fs.chmodSync(path.join(fakeBin, command), 0o755);
  }

  const result = spawnSync('/bin/bash', [installScript, '--carrier-only'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      HOME: homeRoot,
      OPL_INSTALL_DIR: installDir,
      OPL_REPO_URL: 'https://example.invalid/one-person-lab.git',
      PATH: `${fakeBin}:/usr/bin:/bin`,
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /OPL base carrier is ready/);
});

test('install carrier-only removes partial clone directories after clone failure', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-clone-failure-'));
  const fakeBin = path.join(homeRoot, 'bin');
  const installDir = path.join(homeRoot, '.opl', 'one-person-lab');
  fs.mkdirSync(fakeBin, { recursive: true });

  fs.writeFileSync(
    path.join(fakeBin, 'git'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'if [ "${1:-}" = "--version" ]; then',
      '  printf "git version 2.50.0\\n"',
      '  exit 0',
      'fi',
      'if [ "${1:-}" = "clone" ]; then',
      '  target=""',
      '  for arg in "$@"; do target="$arg"; done',
      '  mkdir -p "$target/.git"',
      '  echo "simulated clone failure" >&2',
      '  exit 128',
      'fi',
      'echo "unexpected git args: $*" >&2',
      'exit 1',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(fakeBin, 'node'), '#!/usr/bin/env bash\nexit 0\n');
  fs.writeFileSync(path.join(fakeBin, 'npm'), '#!/usr/bin/env bash\nexit 0\n');
  for (const command of ['git', 'node', 'npm']) {
    fs.chmodSync(path.join(fakeBin, command), 0o755);
  }

  try {
    const result = spawnSync('/bin/bash', [installScript, '--carrier-only'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        HOME: homeRoot,
        OPL_INSTALL_DIR: installDir,
        OPL_REPO_URL: 'https://example.invalid/one-person-lab.git',
        PATH: `${fakeBin}:/usr/bin:/bin`,
      },
    });

    assert.equal(result.status, 128);
    assert.match(result.stderr, /simulated clone failure/);
    assert.equal(fs.existsSync(installDir), false);
    assert.deepEqual(
      fs.readdirSync(path.dirname(installDir)).filter((entry) => entry.startsWith(`${path.basename(installDir)}.tmp.`)),
      [],
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('install carrier-only can use an explicit source archive even when git is usable', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-explicit-archive-'));
  const fakeBin = path.join(homeRoot, 'bin');
  const installDir = path.join(homeRoot, '.opl', 'one-person-lab');
  const gitLog = path.join(homeRoot, 'git.log');
  const npmLog = path.join(homeRoot, 'npm.log');
  const curlLog = path.join(homeRoot, 'curl.log');
  fs.mkdirSync(fakeBin, { recursive: true });

  fs.writeFileSync(
    path.join(fakeBin, 'git'),
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(gitLog)}`,
      'if [ "${1:-}" = "--version" ]; then',
      '  printf "git version 2.50.0\\n"',
      '  exit 0',
      'fi',
      'if [ "${1:-}" = "clone" ]; then',
      '  echo "git clone should not run in explicit archive mode" >&2',
      '  exit 99',
      'fi',
      'exit 0',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(fakeBin, 'node'), '#!/usr/bin/env bash\nexit 0\n');
  fs.writeFileSync(
    path.join(fakeBin, 'npm'),
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(npmLog)}`,
      'exit 0',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(fakeBin, 'curl'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'out=""',
      'url=""',
      'while [ "$#" -gt 0 ]; do',
      '  if [ "$1" = "-o" ]; then out="$2"; shift 2; continue; fi',
      '  url="$1"',
      '  shift',
      'done',
      `printf '%s\\n' "$url" >> ${JSON.stringify(curlLog)}`,
      'mkdir -p "$(dirname "$out")"',
      'printf "fixture archive\\n" > "$out"',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(fakeBin, 'tar'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'dest=""',
      'while [ "$#" -gt 0 ]; do',
      '  case "$1" in',
      '    -C) dest="$2"; shift 2 ;;',
      '    *) shift ;;',
      '  esac',
      'done',
      'mkdir -p "$dest/current-source-framework"',
      'printf "{}\\n" > "$dest/current-source-framework/package.json"',
    ].join('\n'),
  );
  for (const command of ['git', 'node', 'npm', 'curl', 'tar']) {
    fs.chmodSync(path.join(fakeBin, command), 0o755);
  }

  try {
    const result = spawnSync('/bin/bash', [installScript, '--carrier-only'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        HOME: homeRoot,
        OPL_INSTALL_DIR: installDir,
        OPL_INSTALL_SOURCE_MODE: 'archive',
        OPL_SOURCE_ARCHIVE_URL: 'file:///tmp/current-source-framework.tar.gz',
        PATH: `${fakeBin}:/usr/bin:/bin`,
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Downloading One Person Lab source archive/);
    assert.equal(fs.readFileSync(path.join(installDir, '.opl-install-source'), 'utf8').trim(), 'archive');
    assert.deepEqual(fs.readFileSync(curlLog, 'utf8').trim().split('\n'), [
      'file:///tmp/current-source-framework.tar.gz',
    ]);
    assert.equal(fs.existsSync(gitLog) ? fs.readFileSync(gitLog, 'utf8').includes('clone') : false, false);
    assert.deepEqual(fs.readFileSync(npmLog, 'utf8').trim().split('\n'), [
      'install --omit=dev --ignore-scripts',
      'link --ignore-scripts',
    ]);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('install carrier-only on macOS prepares managed Node and uses a source archive when git is unavailable', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-managed-node-'));
  const fakeBin = path.join(homeRoot, 'bin');
  const installDir = path.join(homeRoot, '.opl', 'one-person-lab');
  const toolchainRoot = path.join(homeRoot, '.opl', 'toolchain');
  const gitLog = path.join(homeRoot, 'git.log');
  const npmLog = path.join(homeRoot, 'npm.log');
  fs.mkdirSync(fakeBin, { recursive: true });

  fs.writeFileSync(
    path.join(fakeBin, 'uname'),
    [
      '#!/usr/bin/env bash',
      'if [ "${1:-}" = "-s" ]; then printf "Darwin\\n"; exit 0; fi',
      'if [ "${1:-}" = "-m" ]; then printf "arm64\\n"; exit 0; fi',
      'exec /usr/bin/uname "$@"',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(fakeBin, 'git'),
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(gitLog)}`,
      'exit 1',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(fakeBin, 'curl'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'out=""',
      'while [ "$#" -gt 0 ]; do',
      '  if [ "$1" = "-o" ]; then out="$2"; shift 2; continue; fi',
      '  shift',
      'done',
      'mkdir -p "$(dirname "$out")"',
      'printf "fixture archive\\n" > "$out"',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(fakeBin, 'tar'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'archive=""',
      'dest=""',
      'while [ "$#" -gt 0 ]; do',
      '  case "$1" in',
      '    -xzf) archive="$2"; shift 2 ;;',
      '    -C) dest="$2"; shift 2 ;;',
      '    *) shift ;;',
      '  esac',
      'done',
      'if [[ "$archive" == *"node-v22.21.1-darwin-arm64"* ]]; then',
      '  node_dir="$dest/node-v22.21.1-darwin-arm64/bin"',
      '  mkdir -p "$node_dir"',
      '  cat > "$node_dir/node" <<\\NODE',
      '#!/usr/bin/env bash',
      'exit 0',
      'NODE',
      '  cat > "$node_dir/npm" <<\\NPM',
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(npmLog)}`,
      'exit 0',
      'NPM',
      '  chmod +x "$node_dir/node" "$node_dir/npm"',
      '  exit 0',
      'fi',
      'mkdir -p "$dest/one-person-lab-main"',
      'printf "{}\\n" > "$dest/one-person-lab-main/package.json"',
    ].join('\n'),
  );
  for (const command of ['uname', 'git', 'curl', 'tar']) {
    fs.chmodSync(path.join(fakeBin, command), 0o755);
  }

  try {
    const result = spawnSync('/bin/bash', [installScript, '--carrier-only'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        HOME: homeRoot,
        OPL_INSTALL_DIR: installDir,
        OPL_MANAGED_TOOLCHAIN_ROOT: toolchainRoot,
        PATH: `${fakeBin}:/usr/bin:/bin`,
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Preparing One Person Lab managed Node\.js v22\.21\.1/);
    assert.match(result.stdout, /Downloading One Person Lab source archive/);
    assert.match(result.stdout, /OPL base carrier is ready/);
    assert.equal(result.stderr.includes('Homebrew'), false);
    assert.equal(result.stderr.includes('brew install'), false);
    assert.equal(fs.existsSync(path.join(toolchainRoot, 'node-v22.21.1-darwin-arm64', 'bin', 'node')), true);
    assert.equal(fs.readFileSync(path.join(installDir, '.opl-install-source'), 'utf8').trim(), 'archive');
    assert.equal(fs.existsSync(gitLog), true);
    assert.equal(fs.readFileSync(gitLog, 'utf8').includes('clone'), false);
    assert.deepEqual(fs.readFileSync(npmLog, 'utf8').trim().split('\n'), [
      'install --omit=dev --ignore-scripts',
      'link --ignore-scripts',
    ]);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('install carrier-only on macOS uses an existing git checkout while Command Line Tools install', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-existing-checkout-no-clt-'));
  const fakeBin = path.join(homeRoot, 'bin');
  const fakeUsrBin = path.join(homeRoot, 'usr-bin');
  const installDir = path.join(homeRoot, '.opl', 'one-person-lab');
  const xcodeSelectLog = path.join(homeRoot, 'xcode-select.log');
  const gitLog = path.join(homeRoot, 'git.log');
  const npmLog = path.join(homeRoot, 'npm.log');
  fs.mkdirSync(path.join(installDir, '.git'), { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.mkdirSync(fakeUsrBin, { recursive: true });
  fs.writeFileSync(path.join(installDir, 'package.json'), '{}\n');

  fs.writeFileSync(
    path.join(fakeBin, 'uname'),
    [
      '#!/usr/bin/env bash',
      'if [ "${1:-}" = "-s" ]; then printf "Darwin\\n"; exit 0; fi',
      'if [ "${1:-}" = "-m" ]; then printf "arm64\\n"; exit 0; fi',
      'exec /usr/bin/uname "$@"',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(fakeUsrBin, 'git'),
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(gitLog)}`,
      'if [ "${1:-}" = "--version" ]; then',
      '  printf "xcode-select: note: no developer tools were found\\n" >&2',
      '  exit 1',
      'fi',
      'exit 1',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(fakeUsrBin, 'xcode-select'),
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(xcodeSelectLog)}`,
      'if [ "${1:-}" = "-p" ]; then exit 1; fi',
      'if [ "${1:-}" = "--install" ]; then exit 0; fi',
      'exit 1',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(fakeBin, 'npm'),
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(npmLog)}`,
      'exit 0',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(fakeBin, 'node'), '#!/usr/bin/env bash\nexit 0\n');
  for (const command of ['uname', 'node', 'npm']) {
    fs.chmodSync(path.join(fakeBin, command), 0o755);
  }
  for (const command of ['git', 'xcode-select']) {
    fs.chmodSync(path.join(fakeUsrBin, command), 0o755);
  }

  try {
    const result = spawnSync('/bin/bash', [installScript, '--carrier-only'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        HOME: homeRoot,
        OPL_INSTALL_DIR: installDir,
        OPL_SYSTEM_GIT_PATH: path.join(fakeUsrBin, 'git'),
        OPL_XCODE_SELECT: path.join(fakeUsrBin, 'xcode-select'),
        PATH: `${fakeBin}:${fakeUsrBin}:/usr/bin:/bin`,
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Using existing One Person Lab checkout/);
    assert.match(result.stdout, /OPL base carrier is ready/);
    assert.match(result.stderr, /Command Line Tools installer/);
    assert.match(result.stderr, /continue using this existing One Person Lab checkout/);
    assert.match(result.stderr, /background maintenance will resume/);
    assert.equal(result.stderr.includes('Homebrew'), false);
    assert.equal(result.stderr.includes('brew install'), false);
    assert.equal(result.stderr.includes('install Node'), false);
    assert.equal(result.stderr.includes('install Git'), false);
    assert.deepEqual(fs.readFileSync(xcodeSelectLog, 'utf8').trim().split('\n'), ['-p', '--install']);
    assert.equal(fs.existsSync(gitLog), false);
    assert.deepEqual(fs.readFileSync(npmLog, 'utf8').trim().split('\n'), [
      'install --omit=dev --ignore-scripts',
      'link --ignore-scripts',
    ]);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('one-click installer defaults to the headless base contract before invoking opl install', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-complete-args-'));
  const fakeBin = path.join(homeRoot, 'bin');
  const installDir = path.join(homeRoot, '.opl', 'one-person-lab');
  const gitLog = path.join(homeRoot, 'git.log');
  const npmLog = path.join(homeRoot, 'npm.log');
  const oplLog = path.join(homeRoot, 'opl.log');
  fs.mkdirSync(path.join(installDir, '.git'), { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(installDir, 'package.json'), '{}\n');

  fs.writeFileSync(
    path.join(fakeBin, 'git'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `printf '%s\\n' "$*" >> ${JSON.stringify(gitLog)}`,
      'if [ "${1:-}" = "--version" ]; then',
      '  printf "git version 2.50.0\\n"',
      '  exit 0',
      'fi',
      'exit 0',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(fakeBin, 'node'), '#!/usr/bin/env bash\nexit 0\n');
  fs.writeFileSync(
    path.join(fakeBin, 'npm'),
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(npmLog)}`,
      'exit 0',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(fakeBin, 'opl'),
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(oplLog)}`,
      'exit 0',
    ].join('\n'),
  );
  for (const command of ['git', 'node', 'npm', 'opl']) {
    fs.chmodSync(path.join(fakeBin, command), 0o755);
  }

  try {
    const result = spawnSync('/bin/bash', [installScript], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        HOME: homeRoot,
        OPL_INSTALL_DIR: installDir,
        OPL_REPO_URL: 'https://example.invalid/one-person-lab.git',
        PATH: `${fakeBin}:/usr/bin:/bin`,
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Running complete One Person Lab setup/);
    assert.match(result.stdout, /One Person Lab is ready/);
    assert.deepEqual(fs.readFileSync(npmLog, 'utf8').trim().split('\n'), ['install', 'link']);
    assert.deepEqual(fs.readFileSync(oplLog, 'utf8').trim().split('\n'), [
      'install --headless',
      'system initialize',
    ]);
    assert.doesNotMatch(fs.readFileSync(gitLog, 'utf8'), /opl-flow/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('fresh-install smoke runner validates local clean-room scenarios', () => {
  const result = spawnSync(process.execPath, [smokeScript], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      PATH: '/usr/bin:/bin',
      SHELL: process.env.SHELL || '/bin/bash',
      TMPDIR: process.env.TMPDIR || '/tmp',
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = parseJsonText(result.stdout) as {
    surface_id: string;
    status: string;
    summary: {
      total: number;
      failed: number;
    };
    cases: Array<{ scenario_id: string; status: string }>;
  };
  assert.equal(payload.surface_id, 'opl_fresh_install_smoke');
  assert.equal(payload.status, 'passed');
  assert.equal(payload.summary.total, 5);
  assert.equal(payload.summary.failed, 0);
  assert.deepEqual(
    payload.cases.map((entry) => [entry.scenario_id, entry.status]),
    [
      ['clean_user_missing_codex', 'passed'],
      ['compatible_codex_missing_modules', 'passed'],
      ['outdated_codex', 'passed'],
      ['ready_baseline', 'passed'],
      ['offline_module_install_blocker', 'passed'],
    ],
  );
});

test('fresh-install matrix freezes GUI labels and first-run log contract', () => {
  const matrix = parseJsonText(fs.readFileSync(matrixContractPath, 'utf8')) as {
    surface_id: string;
    local_smoke_command: string;
    first_run_log: {
      default_path: string;
      event_schema_version: string;
      family_runtime_provider_event_types: string[];
      online_management_event_types?: string[];
    };
    gui_accessibility_labels: Record<string, string>;
    gui_vm_implementation: {
      repo: string;
      shell_root: string;
      packaged_guest_smoke_command: string;
      tart_host_smoke_command: string;
      nightly_workflow: string;
      default_self_hosted_runner_labels: string[];
    };
    scenarios: Array<{
      scenario_id: string;
      expected_artifacts?: string[];
    }>;
    ci_policy: {
      github_actions: string;
      self_hosted_macos: string;
      docker: string;
    };
  };

  assert.equal(matrix.surface_id, 'opl_fresh_install_test_matrix');
  assert.equal(matrix.local_smoke_command, 'npm run test:fresh-install');
  assert.equal(matrix.first_run_log.default_path, '~/Library/Logs/One Person Lab/first-run.jsonl');
  assert.equal(matrix.first_run_log.event_schema_version, 'opl_first_run_event.v1');
  assert.deepEqual(matrix.first_run_log.family_runtime_provider_event_types, [
    'family_runtime_provider_repair_started',
    'family_runtime_provider_repair_completed',
    'family_runtime_provider_repair_failed',
  ]);
  assert.equal(Object.hasOwn(matrix.first_run_log, 'online_management_event_types'), false);
  assert.equal(matrix.gui_accessibility_labels.window, 'opl-first-run-window');
  assert.equal(matrix.gui_accessibility_labels.install_button, 'opl-first-run-install-button');
  assert.equal(matrix.gui_accessibility_labels.codex_api_key_input, 'opl-first-run-codex-api-key-input');
  assert.equal(matrix.gui_accessibility_labels.codex_configure_button, 'opl-first-run-configure-codex-button');
  assert.equal(matrix.gui_accessibility_labels.retry_button, 'opl-first-run-retry-button');
  assert.equal(matrix.gui_accessibility_labels.guid_entry, 'opl-guid-entry');
  assert.equal(matrix.gui_vm_implementation.repo, 'gaofeng21cn/one-person-lab-app');
  assert.equal(matrix.gui_vm_implementation.shell_root, 'shells/aionui');
  assert.match(matrix.gui_vm_implementation.packaged_guest_smoke_command, /test:opl-first-run-vm/);
  assert.match(matrix.gui_vm_implementation.tart_host_smoke_command, /test:opl-first-run-vm:tart/);
  assert.equal(matrix.gui_vm_implementation.nightly_workflow, '.github/workflows/opl-first-run-vm.yml');
  assert.deepEqual(matrix.gui_vm_implementation.default_self_hosted_runner_labels, [
    'self-hosted',
    'macOS',
    'opl-gui-vm',
  ]);
  const cleanVmScenario = matrix.scenarios.find(
    (entry) => entry.scenario_id === 'clean_vm_release_first_launch',
  );
  assert.ok(cleanVmScenario);
  assert.equal(cleanVmScenario.expected_artifacts?.includes('connect modules JSON'), true);
  assert.equal(cleanVmScenario.expected_artifacts?.includes('modules JSON'), false);
  const [oplGithubActionsPolicy] = matrix.ci_policy.github_actions.split('. ');
  assert.match(oplGithubActionsPolicy, /local CLI fresh-install smoke/);
  assert.doesNotMatch(oplGithubActionsPolicy, /codesign\/notarization/);
  assert.match(matrix.ci_policy.github_actions, /App release workflows own codesign\/notarization/);
  assert.match(matrix.ci_policy.self_hosted_macos, /opl-first-run-vm\.yml/);
  assert.match(matrix.ci_policy.docker, /Do not use Docker/);
});

test('bundled Codex profile carries the OPL Flow recommendation without runtime source checkout dependency', () => {
  const profile = parseJsonText(fs.readFileSync(codexDefaultProfilePath, 'utf8')) as {
    surface_id: string;
    version: string;
    owner: string;
    purpose: string;
    state: string;
    generated_projection: {
      source_owner: string;
      source_ref: string;
      source_field_refs: Record<string, string>;
      generator: string;
      generation_stage: string;
      runtime_source_checkout_required: boolean;
    };
    model_provider: string;
    model: string;
    model_reasoning_effort: string;
    base_url: string;
    base_url_role: string;
    model_profile_role: string;
    provider_name: string;
  };
  const serialized = JSON.stringify(profile);

  assert.equal(profile.surface_id, 'opl_codex_default_profile');
  assert.equal(profile.version, 'g2');
  assert.equal(profile.owner, 'one-person-lab');
  assert.equal(profile.purpose, 'workflow_owned_codex_install_default_projection');
  assert.equal(profile.state, 'generated_projection');
  assert.equal(profile.generated_projection.source_owner, 'opl-flow');
  assert.equal(
    profile.generated_projection.source_ref,
    'gaofeng21cn/opl-flow:contracts/workflow-policy.json#codex_model_policy',
  );
  assert.equal(
    profile.generated_projection.source_field_refs.model,
    'gaofeng21cn/opl-flow:contracts/workflow-policy.json#codex_model_policy.configured_default.model',
  );
  assert.equal(profile.generated_projection.generator, 'scripts/export-codex-default-profile.mjs');
  assert.equal(profile.generated_projection.generation_stage, 'development_or_release_sync');
  assert.equal(profile.generated_projection.runtime_source_checkout_required, false);
  assert.equal(profile.model_provider, 'gflab');
  assert.equal(profile.model.length > 0, true);
  assert.equal(profile.model_reasoning_effort.length > 0, true);
  assert.equal(profile.base_url, 'https://gflabtoken.cn/v1');
  assert.equal(profile.base_url_role, 'opl_base_default_provider_endpoint');
  assert.equal(profile.model_profile_role, 'opl_flow_recommendation_projection');
  assert.equal(profile.provider_name.length > 0, true);
  assert.equal(serialized.includes('experimental_bearer_token'), false);
  assert.equal(serialized.toLowerCase().includes('api_key'), false);
});

test('Codex default profile exporter deterministically projects the OPL Flow recommendation', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-default-profile-projection-'));
  const sourcePath = path.join(tempRoot, 'workflow-policy.json');
  const firstOutputPath = path.join(tempRoot, 'first.json');
  const secondOutputPath = path.join(tempRoot, 'second.json');
  const bundledProfile = parseJsonText(fs.readFileSync(codexDefaultProfilePath, 'utf8')) as {
    model_provider: string;
    model: string;
    model_reasoning_effort: string;
    provider_name: string;
    base_url: string;
  };
  const workflowPolicy = {
    schema: 'opl_flow_workflow_policy.v1',
    package: { id: 'opl-flow' },
    codex_model_policy: {
      configured_default: {
        model: bundledProfile.model,
        reasoning_effort: bundledProfile.model_reasoning_effort,
      },
    },
  };

  try {
    fs.writeFileSync(sourcePath, `${JSON.stringify(workflowPolicy, null, 2)}\n`, 'utf8');
    for (const out of [firstOutputPath, secondOutputPath]) {
      const result = spawnSync(process.execPath, [
        codexDefaultProfileExporterPath,
        '--workflow-policy', sourcePath,
        '--out', out,
      ], {
        cwd: repoRoot,
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
    }

    const first = fs.readFileSync(firstOutputPath, 'utf8');
    assert.equal(first, fs.readFileSync(secondOutputPath, 'utf8'));
    assert.equal(first, fs.readFileSync(codexDefaultProfilePath, 'utf8'));

    const futureModel = 'future-model';
    const futureReasoningEffort = 'future-effort';
    workflowPolicy.codex_model_policy.configured_default.model = futureModel;
    workflowPolicy.codex_model_policy.configured_default.reasoning_effort = futureReasoningEffort;
    fs.writeFileSync(sourcePath, `${JSON.stringify(workflowPolicy, null, 2)}\n`, 'utf8');
    const changed = spawnSync(process.execPath, [
      codexDefaultProfileExporterPath,
      '--workflow-policy', sourcePath,
      '--out', firstOutputPath,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(changed.status, 0, changed.stderr || changed.stdout);
    const changedProfile = parseJsonText(
      fs.readFileSync(firstOutputPath, 'utf8'),
    ) as typeof bundledProfile;
    const changedFixture = renderCodexConfigFixture(changedProfile);
    assert.match(changedFixture, /model = "future-model"/);
    assert.match(changedFixture, /model_reasoning_effort = "future-effort"/);

    workflowPolicy.schema = 'wrong_schema';
    fs.writeFileSync(sourcePath, `${JSON.stringify(workflowPolicy, null, 2)}\n`, 'utf8');
    const mismatch = spawnSync(process.execPath, [
      codexDefaultProfileExporterPath,
      '--workflow-policy', sourcePath,
      '--out', firstOutputPath,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /schema must match opl_flow_workflow_policy.v1/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
