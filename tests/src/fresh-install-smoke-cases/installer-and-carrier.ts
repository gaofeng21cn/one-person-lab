import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { parseJsonText } from '../../../src/kernel/json-file.ts';
import {
  buildReleaseState,
  readInstalledFrameworkSourceIdentity,
} from '../../../src/read-models/operator/app-state-release.ts';

type InstallerAndCarrierContext = {
  repoRoot: string;
  installScript: string;
  frameworkSourceCommit: string;
};

export function registerInstallerAndCarrierTests({
  repoRoot,
  installScript,
  frameworkSourceCommit,
}: InstallerAndCarrierContext) {
  const safeNodeFixture = '#!/usr/bin/env bash\nif [ "${1:-}" = "-p" ]; then printf "22.23.4\\n"; fi\nexit 0\n';
  function writeInstalledSourceIdentity(identityPath: string, identity: Record<string, unknown>) {
    fs.writeFileSync(identityPath, `${JSON.stringify(identity, null, 2)}\n`, { mode: 0o600 });
  }

  test('release state exposes the exact installed Framework SHA and typed identity source', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-installed-framework-identity-'));
    const identityPath = path.join(tempRoot, 'installed-source-identity.json');
    const previousStateDir = process.env.OPL_STATE_DIR;
    process.env.OPL_STATE_DIR = path.join(tempRoot, 'state');
    writeInstalledSourceIdentity(identityPath, {
      schema: 'opl_framework_installed_source_identity.v1',
      framework_sha: frameworkSourceCommit,
      install_mode: 'archive',
      identity_source: 'explicit_source_commit',
    });

    try {
      const release = buildReleaseState({ installedSourceIdentityPath: identityPath });
      assert.equal(release.opl_framework_revision, frameworkSourceCommit);
      assert.equal(release.framework_revision, frameworkSourceCommit);
      assert.equal(release.framework_revision_source, 'installed_source_identity');
      assert.equal(release.installed_framework_source_sha, frameworkSourceCommit);
      assert.equal(
        release.installed_framework_source_identity_source,
        'explicit_source_commit',
      );
      assert.deepEqual(release.installed_framework_source_identity, {
        schema: 'opl_framework_installed_source_identity.v1',
        framework_sha: frameworkSourceCommit,
        install_mode: 'archive',
        identity_source: 'explicit_source_commit',
      });
    } finally {
      if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
      else process.env.OPL_STATE_DIR = previousStateDir;
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('installed Framework source identity rejects symlinks and malformed records', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-installed-framework-invalid-'));
    const symlinkPath = path.join(tempRoot, 'identity-link.json');
    const malformedPath = path.join(tempRoot, 'identity-malformed.json');
    fs.symlinkSync(path.join(tempRoot, 'missing-target.json'), symlinkPath);
    writeInstalledSourceIdentity(malformedPath, {
      schema: 'opl_framework_installed_source_identity.v1',
      framework_sha: frameworkSourceCommit.slice(0, 12),
      install_mode: 'archive',
      identity_source: 'explicit_source_commit',
    });

    try {
      assert.throws(
        () => readInstalledFrameworkSourceIdentity(symlinkPath),
        /regular non-symlink file/,
      );
      assert.throws(
        () => readInstalledFrameworkSourceIdentity(malformedPath),
        /source identity is invalid/,
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('installed Framework source identity remains local without dirtying a git checkout', () => {
    const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
    assert.match(gitignore, /^\.opl-framework-installed-source-identity\.json$/m);
  });

  test('installer admits patched standalone Node versions and refuses affected or unsupported identities', () => {
    const source = fs.readFileSync(installScript, 'utf8');
    const bootstrap = source.slice(0, source.indexOf('\nensure_node_runtime\n'));
    for (const [version, accepted] of [
      ['22.23.4', true], ['22.24.0', true], ['24.22.1', true], ['26.12.1', true], ['28.0.0', true],
      ['20.20.0', false], ['22.21.1', false], ['22.23.3', false], ['24.22.0', false],
      ['26.12.0', false], ['23.11.0', false], ['25.10.0', false],
      ['22.23.4-next.1', false], ['electron:24.22.1', false], ['', false],
    ] as const) {
      const result = spawnSync('/bin/bash', ['-c', `${bootstrap}\nnode_version_is_usable "$OPL_TEST_NODE_VERSION"`], {
        encoding: 'utf8', env: { ...process.env, OPL_TEST_NODE_VERSION: version },
      });
      assert.equal(result.status === 0, accepted, `Node ${version}: ${result.stderr}`);
    }
  });

  test('installer probes the selected executable and refuses Electron even with a patched Node version', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-node-admission-'));
    const source = fs.readFileSync(installScript, 'utf8');
    const bootstrap = source.slice(0, source.indexOf('\nensure_node_runtime\n'));
    fs.writeFileSync(path.join(root, 'node'), `#!${process.execPath}
if (process.argv[2] !== '-p') process.exit(99);
const versions = JSON.parse(process.env.OPL_TEST_RUNTIME_VERSIONS);
console.log(Function('process', 'return (' + process.argv[3] + ')')({ versions }));
`, { mode: 0o755 });
    fs.writeFileSync(path.join(root, 'npm'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
    try {
      for (const [versions, accepted] of [
        [{ node: '22.23.4' }, true],
        [{ node: '22.23.3' }, false],
        [{ node: '24.22.1', electron: '44.9.1' }, false],
        [{ node: '26.10.0' }, false],
      ] as const) {
        const result = spawnSync('/bin/bash', ['-c', `${bootstrap}\nnode_is_usable`], {
          encoding: 'utf8', env: { ...process.env, PATH: `${root}:/usr/bin:/bin`,
            OPL_TEST_RUNTIME_VERSIONS: JSON.stringify(versions) },
        });
        assert.equal(result.status === 0, accepted, JSON.stringify(versions));
      }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('ensure-node reuses the bootstrap owner without touching an installed Framework or user Node', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ensure-node-'));
    const fakeBin = path.join(root, 'bin');
    const installed = path.join(root, 'framework');
    const called = path.join(root, 'unexpected-call');
    fs.mkdirSync(fakeBin);
    fs.mkdirSync(installed);
    fs.writeFileSync(path.join(installed, 'custom-file'), 'preserve me\n');
    fs.writeFileSync(path.join(installed, '.opl-framework-installed-source-identity.json'), 'original identity\n');
    fs.writeFileSync(path.join(fakeBin, 'node'), safeNodeFixture, { mode: 0o755 });
    const untouchedNode = fs.readFileSync(path.join(fakeBin, 'node'));
    for (const command of ['git', 'npm', 'curl']) {
      fs.writeFileSync(path.join(fakeBin, command), `#!/bin/bash\ntouch '${called}'\nexit 99\n`, { mode: 0o755 });
    }
    try {
      const result = spawnSync('/bin/bash', [installScript, '--ensure-node'], {
        encoding: 'utf8', env: { HOME: root, PATH: `${fakeBin}:/usr/bin:/bin`, OPL_INSTALL_DIR: installed },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(fs.existsSync(called), false);
      assert.equal(fs.readFileSync(path.join(installed, 'custom-file'), 'utf8'), 'preserve me\n');
      assert.equal(fs.readFileSync(path.join(installed, '.opl-framework-installed-source-identity.json'), 'utf8'), 'original identity\n');
      assert.deepEqual(fs.readFileSync(path.join(fakeBin, 'node')), untouchedNode);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('installer uses the lockfile and retires only the exact legacy global carrier', () => {
    const source = fs.readFileSync(installScript, 'utf8');
    assert.match(source, /if \[ -f package-lock\.json \]; then\s+npm ci "\$@"/);
    assert.match(source, /legacy_path="\$cli_prefix\/lib\/node_modules\/\$LEGACY_GLOBAL_PACKAGE"/);
    assert.match(source, /if \[ -e "\$legacy_path" \] \|\| \[ -L "\$legacy_path" \]; then/);
    assert.match(source, /env npm_config_prefix="\$cli_prefix" npm uninstall --global "\$LEGACY_GLOBAL_PACKAGE" --ignore-scripts/);
    assert.match(source, /env npm_config_prefix="\$cli_prefix" npm link "\$@"/);
    assert.doesNotMatch(source, /npm uninstall --global opl-framework\s/);
  });

  test('installer preserves the preexisting CLI prefix when managed Node prepends another opl command', () => {
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-legacy-prefix-'));
    const fakeBin = path.join(homeRoot, 'bin');
    const installDir = path.join(homeRoot, '.opl', 'one-person-lab');
    const cliPrefix = path.join(homeRoot, 'opt', 'homebrew');
    const toolchainRoot = path.join(homeRoot, '.opl', 'toolchain');
    const managedNodeBin = path.join(toolchainRoot, 'node-v22.23.4-darwin-arm64', 'bin');
    const legacyCarrier = path.join(cliPrefix, 'lib', 'node_modules', 'opl-framework-shared');
    const npmLog = path.join(homeRoot, 'npm.log');
    fs.mkdirSync(path.join(installDir, '.git'), { recursive: true });
    fs.mkdirSync(fakeBin, { recursive: true });
    fs.mkdirSync(path.join(cliPrefix, 'bin'), { recursive: true });
    fs.mkdirSync(managedNodeBin, { recursive: true });
    fs.mkdirSync(legacyCarrier, { recursive: true });
    fs.writeFileSync(path.join(installDir, 'package.json'), '{}\n');
    fs.writeFileSync(path.join(cliPrefix, 'bin', 'opl'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
    fs.writeFileSync(path.join(managedNodeBin, 'opl'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
    fs.writeFileSync(
      path.join(fakeBin, 'uname'),
      [
        '#!/usr/bin/env bash',
        'if [ "${1:-}" = "-s" ]; then printf "Darwin\\n"; exit 0; fi',
        'if [ "${1:-}" = "-m" ]; then printf "arm64\\n"; exit 0; fi',
        'exec /usr/bin/uname "$@"',
      ].join('\n'),
      { mode: 0o755 },
    );
    fs.writeFileSync(
      path.join(fakeBin, 'git'),
      [
        '#!/usr/bin/env bash',
        'if [ "${1:-}" = "--version" ]; then printf "git version 2.50.0\\n"; fi',
        'exit 0',
      ].join('\n'),
      { mode: 0o755 },
    );
    fs.writeFileSync(path.join(fakeBin, 'node'), safeNodeFixture, { mode: 0o755 });
    const npmFixture = [
      '#!/usr/bin/env bash',
      `printf '%s|%s\\n' "${'${npm_config_prefix:-}'}" "$*" >> ${JSON.stringify(npmLog)}`,
      'exit 0',
    ].join('\n');
    fs.writeFileSync(path.join(fakeBin, 'npm'), npmFixture, { mode: 0o755 });
    fs.writeFileSync(path.join(managedNodeBin, 'node'), safeNodeFixture, { mode: 0o755 });
    fs.writeFileSync(path.join(managedNodeBin, 'npm'), npmFixture, { mode: 0o755 });

    try {
      const result = spawnSync('/bin/bash', [installScript, '--carrier-only'], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          HOME: homeRoot,
          OPL_INSTALL_DIR: installDir,
          OPL_FRAMEWORK_SOURCE_COMMIT: frameworkSourceCommit,
          OPL_MANAGED_TOOLCHAIN_ROOT: toolchainRoot,
          PATH: `${cliPrefix}/bin:${fakeBin}:/usr/bin:/bin`,
        },
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.deepEqual(fs.readFileSync(npmLog, 'utf8').trim().split('\n'), [
        '|install --omit=dev --ignore-scripts',
        `${cliPrefix}|uninstall --global opl-framework-shared --ignore-scripts`,
        `${cliPrefix}|link --ignore-scripts`,
      ]);
    } finally {
      fs.rmSync(homeRoot, { recursive: true, force: true });
    }
  });

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
    fs.writeFileSync(path.join(fakeBin, 'node'), safeNodeFixture);
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
        OPL_FRAMEWORK_SOURCE_COMMIT: frameworkSourceCommit,
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
    fs.writeFileSync(path.join(fakeBin, 'node'), safeNodeFixture);
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
          OPL_FRAMEWORK_SOURCE_COMMIT: frameworkSourceCommit,
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

  test('install carrier-only removes archive and extraction temporaries after download failure', () => {
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-archive-failure-'));
    const fakeBin = path.join(homeRoot, 'bin');
    const tempRoot = path.join(homeRoot, 'tmp');
    const installDir = path.join(homeRoot, '.opl', 'one-person-lab');
    fs.mkdirSync(fakeBin, { recursive: true });
    fs.mkdirSync(tempRoot, { recursive: true });
    fs.writeFileSync(path.join(fakeBin, 'node'), safeNodeFixture, { mode: 0o755 });
    fs.writeFileSync(path.join(fakeBin, 'npm'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
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
        'printf "partial archive\\n" > "$out"',
        'printf "simulated archive download failure\\n" >&2',
        'exit 22',
      ].join('\n'),
      { mode: 0o755 },
    );

    try {
      const result = spawnSync('/bin/bash', [installScript, '--carrier-only'], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          HOME: homeRoot,
          TMPDIR: tempRoot,
          OPL_INSTALL_DIR: installDir,
          OPL_INSTALL_SOURCE_MODE: 'archive',
          OPL_FRAMEWORK_SOURCE_COMMIT: frameworkSourceCommit,
          OPL_SOURCE_ARCHIVE_URL: 'https://example.invalid/one-person-lab.tar.gz',
          PATH: `${fakeBin}:/usr/bin:/bin`,
        },
      });

      assert.equal(result.status, 22);
      assert.match(result.stderr, /simulated archive download failure/);
      assert.doesNotMatch(result.stderr, /unbound variable/);
      assert.deepEqual(
        fs.readdirSync(tempRoot).filter((entry) =>
          entry.startsWith('one-person-lab.') || entry.startsWith('one-person-lab-src.')),
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
    fs.writeFileSync(path.join(fakeBin, 'node'), safeNodeFixture);
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
          OPL_FRAMEWORK_SOURCE_COMMIT: frameworkSourceCommit,
          OPL_SOURCE_ARCHIVE_URL: 'file:///tmp/current-source-framework.tar.gz',
          PATH: `${fakeBin}:/usr/bin:/bin`,
        },
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /Downloading One Person Lab source archive/);
      assert.equal(fs.readFileSync(path.join(installDir, '.opl-install-source'), 'utf8').trim(), 'archive');
      const sourceIdentityPath = path.join(installDir, '.opl-framework-installed-source-identity.json');
      const sourceIdentityStat = fs.lstatSync(sourceIdentityPath);
      assert.equal(sourceIdentityStat.isFile(), true);
      assert.equal(sourceIdentityStat.isSymbolicLink(), false);
      assert.equal(sourceIdentityStat.mode & 0o777, 0o600);
      assert.deepEqual(parseJsonText(fs.readFileSync(sourceIdentityPath, 'utf8')), {
        schema: 'opl_framework_installed_source_identity.v1',
        framework_sha: frameworkSourceCommit,
        install_mode: 'archive',
        identity_source: 'explicit_source_commit',
      });
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

  test('install carrier-only restores Full prefilled dependencies without an npm network install', () => {
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-prefilled-deps-'));
    const fakeBin = path.join(homeRoot, 'bin');
    const installDir = path.join(homeRoot, '.opl', 'one-person-lab');
    const prefilledNodeModules = path.join(homeRoot, 'prefilled-node-modules');
    const npmLog = path.join(homeRoot, 'npm.log');
    fs.mkdirSync(fakeBin, { recursive: true });
    fs.mkdirSync(path.join(prefilledNodeModules, '@temporalio', 'common'), { recursive: true });
    fs.writeFileSync(path.join(prefilledNodeModules, '@temporalio', 'common', 'package.json'), '{}\n');

    fs.writeFileSync(path.join(fakeBin, 'git'), '#!/usr/bin/env bash\nexit 0\n');
    fs.writeFileSync(path.join(fakeBin, 'node'), safeNodeFixture);
    fs.writeFileSync(
      path.join(fakeBin, 'npm'),
      ['#!/usr/bin/env bash', `printf '%s\\n' "$*" >> ${JSON.stringify(npmLog)}`, 'exit 0'].join('\n'),
    );
    fs.writeFileSync(
      path.join(fakeBin, 'curl'),
      [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = "-o" ]; then printf "fixture archive\\n" > "$2"; exit 0; fi',
        '  shift',
        'done',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(fakeBin, 'tar'),
      [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'dest=""',
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = "-C" ]; then dest="$2"; shift 2; else shift; fi',
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
          OPL_FRAMEWORK_SOURCE_COMMIT: frameworkSourceCommit,
          OPL_SOURCE_ARCHIVE_URL: 'file:///tmp/current-source-framework.tar.gz',
          OPL_PREFILLED_NODE_MODULES_DIR: prefilledNodeModules,
          PATH: `${fakeBin}:/usr/bin:/bin`,
        },
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /Restoring prefilled OPL dependencies/);
      assert.equal(
        fs.existsSync(path.join(installDir, 'node_modules', '@temporalio', 'common', 'package.json')),
        true,
      );
      assert.deepEqual(fs.readFileSync(npmLog, 'utf8').trim().split('\n'), ['link --ignore-scripts']);
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
    const userNode = safeNodeFixture.replaceAll('22.23.4', '22.21.1');
    fs.writeFileSync(path.join(fakeBin, 'node'), userNode, { mode: 0o755 });
    fs.writeFileSync(path.join(fakeBin, 'npm'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
    const retainedNode = path.join(toolchainRoot, 'node-v22.21.1-darwin-arm64');
    fs.mkdirSync(retainedNode, { recursive: true });
    fs.writeFileSync(path.join(retainedNode, 'sentinel'), 'preserved older managed runtime\n');

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
        'url=""',
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = "-o" ]; then out="$2"; shift 2; continue; fi',
        '  if [[ "$1" == https:* ]]; then url="$1"; fi',
        '  shift',
        'done',
        'mkdir -p "$(dirname "$out")"',
        'if [[ "$url" == */SHASUMS256.txt ]]; then',
        `  printf '%s  node-v22.23.4-darwin-arm64.tar.gz\\n' '${createHash('sha256').update('fixture archive\n').digest('hex')}' > "$out"`,
        'else',
        '  printf "fixture archive\\n" > "$out"',
        'fi',
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
        'if [[ "$archive" == *"node-v22.23.4-darwin-arm64"* ]]; then',
        '  node_dir="$dest/node-v22.23.4-darwin-arm64/bin"',
        '  mkdir -p "$node_dir"',
        '  cat > "$node_dir/node" <<\\NODE',
        '#!/usr/bin/env bash',
        'if [ "${1:-}" = "-p" ]; then printf "%s\\n" "${OPL_TEST_DOWNLOADED_NODE_VERSION:-22.23.4}"; fi',
        'exit "${OPL_TEST_DOWNLOADED_NODE_EXIT:-0}"',
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
      const fixtureEnvironment = {
        HOME: homeRoot, OPL_INSTALL_DIR: installDir,
        OPL_FRAMEWORK_SOURCE_COMMIT: frameworkSourceCommit,
        OPL_MANAGED_TOOLCHAIN_ROOT: toolchainRoot, PATH: `${fakeBin}:/usr/bin:/bin`,
      };
      for (const [override, message] of [
        [{ OPL_MANAGED_NODE_SHA256: '0'.repeat(64) }, /archive checksum mismatch/],
        [{ OPL_MANAGED_NODE_VERSION: 'v22.23.3' }, /not admitted by the bootstrap security policy/],
        [{ OPL_MANAGED_NODE_URL: 'https://example.invalid/node.tar.gz' }, /requires OPL_MANAGED_NODE_SHA256/],
        [{ OPL_TEST_DOWNLOADED_NODE_VERSION: '22.23.3' }, /runtime identity does not match/],
        [{ OPL_TEST_DOWNLOADED_NODE_EXIT: '1' }, /runtime cannot be executed/],
      ] as const) {
        const refused = spawnSync('/bin/bash', [installScript, '--carrier-only'], {
          cwd: repoRoot, encoding: 'utf8', env: { ...fixtureEnvironment, ...override },
        });
        assert.notEqual(refused.status, 0);
        assert.match(refused.stderr, message);
        assert.equal(fs.existsSync(path.join(toolchainRoot, 'node-v22.23.4-darwin-arm64')), false);
        assert.equal(fs.existsSync(installDir), false);
      }
      const ensured = spawnSync('/bin/bash', [installScript, '--ensure-node'], {
        cwd: repoRoot, encoding: 'utf8', env: fixtureEnvironment,
      });
      assert.equal(ensured.status, 0, ensured.stderr || ensured.stdout);
      assert.match(ensured.stdout, /Preparing One Person Lab managed Node\.js v22\.23\.4/);
      assert.equal(fs.existsSync(installDir), false);
      assert.equal(fs.readFileSync(path.join(fakeBin, 'node'), 'utf8'), userNode);
      assert.equal(fs.readFileSync(path.join(retainedNode, 'sentinel'), 'utf8'), 'preserved older managed runtime\n');
      const result = spawnSync('/bin/bash', [installScript, '--carrier-only'], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          HOME: homeRoot,
          OPL_INSTALL_DIR: installDir,
          OPL_FRAMEWORK_SOURCE_COMMIT: frameworkSourceCommit,
          OPL_MANAGED_TOOLCHAIN_ROOT: toolchainRoot,
          PATH: `${fakeBin}:/usr/bin:/bin`,
        },
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /Downloading One Person Lab source archive/);
      assert.match(result.stdout, /OPL base carrier is ready/);
      assert.equal(result.stderr.includes('Homebrew'), false);
      assert.equal(result.stderr.includes('brew install'), false);
      assert.equal(fs.existsSync(path.join(toolchainRoot, 'node-v22.23.4-darwin-arm64', 'bin', 'node')), true);
      assert.equal(fs.readFileSync(path.join(installDir, '.opl-install-source'), 'utf8').trim(), 'archive');
      assert.deepEqual(
        parseJsonText(fs.readFileSync(path.join(installDir, '.opl-framework-installed-source-identity.json'), 'utf8')),
        {
          schema: 'opl_framework_installed_source_identity.v1',
          framework_sha: frameworkSourceCommit,
          install_mode: 'archive',
          identity_source: 'explicit_source_commit',
        },
      );
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
    fs.writeFileSync(path.join(fakeBin, 'node'), safeNodeFixture);
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
          OPL_FRAMEWORK_SOURCE_COMMIT: frameworkSourceCommit,
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
    const stateDir = path.join(homeRoot, 'opl-state');
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
    fs.writeFileSync(path.join(fakeBin, 'node'), safeNodeFixture);
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
          OPL_FRAMEWORK_SOURCE_COMMIT: frameworkSourceCommit,
          OPL_REPO_URL: 'https://example.invalid/one-person-lab.git',
          OPL_STATE_DIR: stateDir,
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
      assert.equal(fs.readFileSync(gitLog, 'utf8').includes('opl-flow'), false);
    } finally {
      fs.rmSync(homeRoot, { recursive: true, force: true });
    }
  });
}
