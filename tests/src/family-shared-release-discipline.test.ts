import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  assertPublishedOwnerCommitReachable,
  collectSharedOwnerReleaseRemotes,
  extractTrackedPins,
  inspectConsumerRepo,
  loadSharedOwnerReleaseContract,
  releaseFamilySharedPins,
  resolveCanonicalRepoRoot,
  resolveDefaultFamilyRoot,
  rewriteTrackedPins,
  runFamilySharedReleaseCli,
  SHARED_OWNER_RELEASE_CONTRACT_PATH,
  syncConsumerRepo,
} from '../../scripts/family-shared-release.mjs';
import { parseJsonText } from '../../src/kernel/json-file.ts';

const STALE_OWNER_COMMIT = '6a6823dba7f95de5ae3aafc477167bccb07de74c';
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const RELEASED_OWNER_COMMIT = loadSharedOwnerReleaseContract({ repoRoot }).owner_commit;

function write(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createConsumerFixtureRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-release-'));
}

function git(args: string[], cwd: string) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function createPublishedOwnerRemoteFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-release-remote-'));
  const sourceRoot = path.join(fixtureRoot, 'owner-source');
  const remoteRoot = path.join(fixtureRoot, 'owner-remote.git');
  fs.mkdirSync(sourceRoot, { recursive: true });
  execFileSync('git', ['init', '--bare', remoteRoot], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  execFileSync('git', ['init'], {
    cwd: sourceRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  git(['config', 'user.name', 'OPL Test'], sourceRoot);
  git(['config', 'user.email', 'opl-test@example.com'], sourceRoot);
  write(path.join(sourceRoot, 'README.md'), '# owner repo\n');
  git(['add', 'README.md'], sourceRoot);
  git(['commit', '-m', 'published commit'], sourceRoot);
  git(['branch', '-M', 'main'], sourceRoot);
  git(['remote', 'add', 'origin', pathToFileURL(remoteRoot).href], sourceRoot);
  git(['push', '-u', 'origin', 'main'], sourceRoot);
  const publishedCommit = git(['rev-parse', 'HEAD'], sourceRoot);
  write(path.join(sourceRoot, 'CHANGELOG.md'), 'unpublished\n');
  git(['add', 'CHANGELOG.md'], sourceRoot);
  git(['commit', '-m', 'unpublished commit'], sourceRoot);
  const unpublishedCommit = git(['rev-parse', 'HEAD'], sourceRoot);
  return {
    fixtureRoot,
    sourceRoot,
    remoteUrl: pathToFileURL(remoteRoot).href,
    publishedCommit,
    unpublishedCommit,
  };
}

test('latest-stable promotion rejects a remote channel that does not point to its recorded commit', () => {
  const publishedRemote = createPublishedOwnerRemoteFixture();
  git(['push', 'origin', 'HEAD:main'], publishedRemote.sourceRoot);
  git(['push', 'origin', `${publishedRemote.publishedCommit}:refs/heads/latest-stable`], publishedRemote.sourceRoot);
  const contract = {
    contract_kind: 'family_shared_owner_release.v2',
    owner_repo: 'one-person-lab',
    owner_commit: publishedRemote.unpublishedCommit,
    latest_stable: {
      ref: 'latest-stable',
      commit: publishedRemote.unpublishedCommit,
    },
    consumer_policy: {
      manifest_channel: 'latest-stable',
      lockfile_exact_commit_receipt_required: true,
      consumer_exact_commit_equality_gate: false,
    },
    packages: {
      python: {
        git_locator: `git+${publishedRemote.remoteUrl}@latest-stable#subdirectory=python/opl-harness-shared`,
      },
      js: {
        git_locator: `git+${publishedRemote.remoteUrl}#latest-stable`,
      },
    },
    consumers: [],
  };

  assert.throws(
    () => assertPublishedOwnerCommitReachable({ contract }),
    /latest-stable.*does not resolve/i,
  );
});

function loadFamilyManifestFixture(fileName: string) {
  const payload = parseJsonText(
    fs.readFileSync(path.join(repoRoot, 'tests/fixtures/family-manifests', fileName), 'utf8'),
  ) as Record<string, any>;
  return payload.product_entry_manifest ?? payload;
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

test('shared owner release contract owns the latest-stable channel and four consumer repos', () => {
  const contract = loadSharedOwnerReleaseContract({ repoRoot });
  const pythonPackage = recordValue(contract.packages.python);
  const jsPackage = recordValue(contract.packages.js);

  assert.equal(contract.contract_kind, 'family_shared_owner_release.v2');
  assert.match(contract.owner_commit, /^[0-9a-f]{40}$/);
  assert.equal(contract.owner_commit, RELEASED_OWNER_COMMIT);
  assert.deepEqual(contract.latest_stable, {
    ref: 'latest-stable',
    commit: RELEASED_OWNER_COMMIT,
  });
  assert.deepEqual(contract.consumer_policy, {
    manifest_channel: 'latest-stable',
    lockfile_exact_commit_receipt_required: true,
    consumer_exact_commit_equality_gate: false,
  });
  assert.equal(
    pythonPackage.git_locator,
    'git+https://github.com/gaofeng21cn/one-person-lab.git@latest-stable#subdirectory=python/opl-harness-shared',
  );
  assert.equal(
    jsPackage.git_locator,
    'git+https://github.com/gaofeng21cn/one-person-lab.git#latest-stable',
  );
  assert.equal(contract.consumers.length, 4);
  assert.equal(contract.consumers[0].verify_command, 'scripts/verify.sh family');
  assert.equal(contract.consumers[1].verify_command, 'scripts/verify.sh family');
  assert.equal(contract.consumers[2].verify_command, 'scripts/verify.sh family');
  assert.equal(contract.consumers[3].verify_command, 'scripts/verify.sh smoke');
  assert.equal(contract.consumers[0].targets[0].kind, 'python_dependency');
  assert.equal(contract.consumers[2].targets[0].file, 'package.json');
  assert.equal(contract.consumers[2].targets[2].kind, 'js_lock');
  assert.equal(contract.consumers[3].repo_id, 'opl-meta-agent');
  assert.equal(contract.consumers[3].targets[0].file, 'package.json');
  assert.equal(contract.consumers[3].targets[1].kind, 'js_lock');
});

test('default family root resolves from the canonical repo root in both main checkout and worktree checkouts', () => {
  const canonicalRepoRoot = resolveCanonicalRepoRoot({ repoRoot });
  const defaultFamilyRoot = resolveDefaultFamilyRoot({ repoRoot });

  assert.equal(
    fs.existsSync(path.join(canonicalRepoRoot, SHARED_OWNER_RELEASE_CONTRACT_PATH)),
    true,
  );
  assert.equal(defaultFamilyRoot, path.resolve(canonicalRepoRoot, '..'));

  const repoParent = path.resolve(repoRoot, '..');
  if (canonicalRepoRoot === repoRoot) {
    assert.equal(defaultFamilyRoot, repoParent);
  } else {
    assert.notEqual(defaultFamilyRoot, repoParent);
  }
});

test('rewriteTrackedPins rewrites python and js shared locators to the released owner commit', () => {
  const pythonDependency = `opl-harness-shared @ git+https://github.com/gaofeng21cn/one-person-lab.git@${STALE_OWNER_COMMIT}#subdirectory=python/opl-harness-shared`;
  const pythonLock = `source = { git = "https://github.com/gaofeng21cn/one-person-lab.git?subdirectory=python%2Fopl-harness-shared&rev=${STALE_OWNER_COMMIT}#${STALE_OWNER_COMMIT}" }`;
  const jsLocator = `"opl-framework-shared": "git+https://github.com/gaofeng21cn/one-person-lab.git#${STALE_OWNER_COMMIT}"`;

  const rewrittenPythonDependency = rewriteTrackedPins(pythonDependency, 'python_dependency', RELEASED_OWNER_COMMIT);
  const rewrittenPythonLock = rewriteTrackedPins(pythonLock, 'python_lock', RELEASED_OWNER_COMMIT);
  const rewrittenJs = rewriteTrackedPins(jsLocator, 'js_dependency', RELEASED_OWNER_COMMIT);

  assert.equal(rewrittenPythonDependency.replacement_count, 1);
  assert.equal(rewrittenPythonLock.replacement_count, 1);
  assert.equal(rewrittenJs.replacement_count, 1);
  assert.deepEqual(extractTrackedPins(rewrittenPythonDependency.text, 'python_dependency'), [RELEASED_OWNER_COMMIT]);
  assert.deepEqual(extractTrackedPins(rewrittenPythonLock.text, 'python_lock'), [RELEASED_OWNER_COMMIT]);
  assert.deepEqual(extractTrackedPins(rewrittenJs.text, 'js_dependency'), [RELEASED_OWNER_COMMIT]);
});

test('inspectConsumerRepo reports legacy pins and syncConsumerRepo moves only the manifest', () => {
  const contract = loadSharedOwnerReleaseContract({ repoRoot });
  const familyRoot = createConsumerFixtureRoot();
  const consumer = contract.consumers[0];
  const repoPath = path.join(familyRoot, consumer.repo_dir);

  write(
    path.join(repoPath, 'pyproject.toml'),
    `[project]\ndependencies = ["opl-harness-shared @ git+https://github.com/gaofeng21cn/one-person-lab.git@${STALE_OWNER_COMMIT}#subdirectory=python/opl-harness-shared"]\n`,
  );
  write(
    path.join(repoPath, 'uv.lock'),
    [
      `source = { git = "https://github.com/gaofeng21cn/one-person-lab.git?subdirectory=python%2Fopl-harness-shared&rev=${STALE_OWNER_COMMIT}#${STALE_OWNER_COMMIT}" }`,
      `    { name = "opl-harness-shared", git = "https://github.com/gaofeng21cn/one-person-lab.git?subdirectory=python%2Fopl-harness-shared&rev=${STALE_OWNER_COMMIT}" },`,
    ].join('\n'),
  );

  const before = inspectConsumerRepo({ consumer, repoPath, contract });
  assert.equal(before.status, 'stale');
  assert.equal(before.findings[0].status, 'legacy_pin');

  const syncResult = syncConsumerRepo({ consumer, repoPath, contract });
  const after = inspectConsumerRepo({ consumer, repoPath, contract });

  assert.deepEqual(syncResult.changed_files, ['pyproject.toml']);
  assert.deepEqual(syncResult.lock_refresh_commands, ['uv lock']);
  assert.equal(after.status, 'update_available');
  assert.deepEqual(after.findings[0].pins, ['latest-stable']);
  assert.deepEqual(after.findings[1].pins, [STALE_OWNER_COMMIT]);
});

test('v2 sync switches manifests to latest-stable without rewriting lock receipts', () => {
  const familyRoot = createConsumerFixtureRoot();
  const consumer = {
    repo_id: 'medautoscience',
    repo_dir: 'med-autoscience',
    verify_command: 'scripts/verify.sh family',
    targets: [
      { file: 'pyproject.toml', kind: 'python_dependency' as const },
      { file: 'uv.lock', kind: 'python_lock' as const },
    ],
  };
  const contract = {
    contract_kind: 'family_shared_owner_release.v2',
    owner_repo: 'one-person-lab',
    owner_commit: RELEASED_OWNER_COMMIT,
    latest_stable: { ref: 'latest-stable', commit: RELEASED_OWNER_COMMIT },
    consumer_policy: {
      manifest_channel: 'latest-stable',
      lockfile_exact_commit_receipt_required: true,
      consumer_exact_commit_equality_gate: false,
    },
    packages: {},
    consumers: [consumer],
  };
  const repoPath = path.join(familyRoot, consumer.repo_dir);
  write(
    path.join(repoPath, 'pyproject.toml'),
    `[project]\ndependencies = ["opl-harness-shared @ git+https://github.com/gaofeng21cn/one-person-lab.git@${STALE_OWNER_COMMIT}#subdirectory=python/opl-harness-shared"]\n`,
  );
  write(
    path.join(repoPath, 'uv.lock'),
    `source = { git = "https://github.com/gaofeng21cn/one-person-lab.git?subdirectory=python%2Fopl-harness-shared&rev=${STALE_OWNER_COMMIT}#${STALE_OWNER_COMMIT}" }\n`,
  );

  const result = syncConsumerRepo({ consumer, repoPath, contract });

  assert.deepEqual(result.changed_files, ['pyproject.toml']);
  assert.deepEqual(result.lock_refresh_commands, ['uv lock']);
  assert.match(fs.readFileSync(path.join(repoPath, 'pyproject.toml'), 'utf8'), /@latest-stable#/);
  assert.match(fs.readFileSync(path.join(repoPath, 'uv.lock'), 'utf8'), new RegExp(STALE_OWNER_COMMIT));
});

test('family shared release CLI can sync explicit repo overrides and report aligned status', () => {
  const familyRoot = createConsumerFixtureRoot();
  const contract = loadSharedOwnerReleaseContract({ repoRoot });
  const scienceRepo = path.join(familyRoot, 'science-worktree');
  const grantRepo = path.join(familyRoot, 'grant-worktree');
  const redcubeRepo = path.join(familyRoot, 'redcube-worktree');
  const omaRepo = path.join(familyRoot, 'oma-worktree');

  write(
    path.join(scienceRepo, 'pyproject.toml'),
    `[project]\ndependencies = ["opl-harness-shared @ git+https://github.com/gaofeng21cn/one-person-lab.git@${STALE_OWNER_COMMIT}#subdirectory=python/opl-harness-shared"]\n`,
  );
  write(
    path.join(scienceRepo, 'uv.lock'),
    `source = { git = "https://github.com/gaofeng21cn/one-person-lab.git?subdirectory=python%2Fopl-harness-shared&rev=${STALE_OWNER_COMMIT}#${STALE_OWNER_COMMIT}" }\n`,
  );
  write(
    path.join(grantRepo, 'pyproject.toml'),
    `[project]\ndependencies = ["opl-harness-shared @ git+https://github.com/gaofeng21cn/one-person-lab.git@${STALE_OWNER_COMMIT}#subdirectory=python/opl-harness-shared"]\n`,
  );
  write(
    path.join(grantRepo, 'uv.lock'),
    `source = { git = "https://github.com/gaofeng21cn/one-person-lab.git?subdirectory=python%2Fopl-harness-shared&rev=${STALE_OWNER_COMMIT}#${STALE_OWNER_COMMIT}" }\n`,
  );
  write(
    path.join(redcubeRepo, 'package.json'),
    `{"dependencies":{"opl-framework-shared":"git+https://github.com/gaofeng21cn/one-person-lab.git#${STALE_OWNER_COMMIT}"}}\n`,
  );
  write(
    path.join(redcubeRepo, 'packages/redcube-domain-entry/package.json'),
    `{"dependencies":{"opl-framework-shared":"git+https://github.com/gaofeng21cn/one-person-lab.git#${STALE_OWNER_COMMIT}"}}\n`,
  );
  write(
    path.join(redcubeRepo, 'package-lock.json'),
    JSON.stringify({
      packages: {
        'node_modules/opl-framework-shared': {
          resolved: `git+ssh://git@github.com/gaofeng21cn/one-person-lab.git#${STALE_OWNER_COMMIT}`,
        },
      },
    }),
  );
  write(
    path.join(omaRepo, 'package.json'),
    `{"dependencies":{"opl-framework-shared":"git+https://github.com/gaofeng21cn/one-person-lab.git#${STALE_OWNER_COMMIT}"}}\n`,
  );
  write(
    path.join(omaRepo, 'package-lock.json'),
    JSON.stringify({
      packages: {
        'node_modules/opl-framework-shared': {
          resolved: `git+ssh://git@github.com/gaofeng21cn/one-person-lab.git#${STALE_OWNER_COMMIT}`,
        },
      },
    }),
  );

  const cliArgs = [
    'sync',
    '--family-root', familyRoot,
    '--repo', `medautoscience=${scienceRepo}`,
    '--repo', `medautogrant=${grantRepo}`,
    '--repo', `redcube=${redcubeRepo}`,
    '--repo', `opl-meta-agent=${omaRepo}`,
  ];
  const checkBeforeSync = runFamilySharedReleaseCli([
    'check',
    ...cliArgs.slice(1),
  ], { validatePublishedOwnerCommit: () => {} });
  const result = runFamilySharedReleaseCli(cliArgs, { validatePublishedOwnerCommit: () => {} });

  assert.equal(checkBeforeSync.exit_code, 1);
  assert.match(checkBeforeSync.stdout, /legacy_pin/);
  assert.equal(result.exit_code, 0);
  assert.match(result.stdout, /\[medautoscience\] synced/);
  assert.match(result.stdout, /\[medautogrant\] synced/);
  assert.match(result.stdout, /\[redcube\] synced/);
  assert.match(result.stdout, /\[opl-meta-agent\] synced/);
  assert.match(result.stdout, /verify: scripts\/verify\.sh family/);
  assert.match(result.stdout, /verify: scripts\/verify\.sh smoke/);
  assert.match(result.stdout, /refresh lock receipt: .*uv lock/);
  assert.match(result.stdout, /refresh lock receipt: .*npm update opl-framework-shared/);
  assert.match(result.stdout, new RegExp(RELEASED_OWNER_COMMIT));
});

test('family shared release sync validates the remote channel before changing consumers', () => {
  const familyRoot = createConsumerFixtureRoot();
  const ownerRepoRoot = path.join(familyRoot, 'one-person-lab');
  const consumerRepo = path.join(familyRoot, 'redcube-ai');
  write(
    path.join(ownerRepoRoot, SHARED_OWNER_RELEASE_CONTRACT_PATH),
    JSON.stringify({
      contract_kind: 'family_shared_owner_release.v2',
      owner_repo: 'one-person-lab',
      owner_commit: RELEASED_OWNER_COMMIT,
      latest_stable: { ref: 'latest-stable', commit: RELEASED_OWNER_COMMIT },
      consumer_policy: {
        manifest_channel: 'latest-stable',
        lockfile_exact_commit_receipt_required: true,
        consumer_exact_commit_equality_gate: false,
      },
      packages: {},
      consumers: [{
        repo_id: 'redcube',
        repo_dir: 'redcube-ai',
        verify_command: 'scripts/verify.sh family',
        targets: [{ file: 'package.json', kind: 'js_dependency' }],
      }],
    }),
  );
  const manifestPath = path.join(consumerRepo, 'package.json');
  const original = `{"dependencies":{"opl-framework-shared":"git+https://github.com/gaofeng21cn/one-person-lab.git#${STALE_OWNER_COMMIT}"}}\n`;
  write(manifestPath, original);

  assert.throws(
    () => runFamilySharedReleaseCli([
      'sync',
      '--family-root', familyRoot,
      '--repo', `redcube=${consumerRepo}`,
    ], {
      repoRoot: ownerRepoRoot,
      validatePublishedOwnerCommit: () => {
        throw new Error('latest-stable remote ref missing');
      },
    }),
    /latest-stable remote ref missing/,
  );
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), original);
});

test('family shared release CLI check refuses owner commits that are not reachable from package remotes', () => {
  const familyRoot = createConsumerFixtureRoot();
  const ownerRepoRoot = path.join(familyRoot, 'one-person-lab');
  const publishedRemote = createPublishedOwnerRemoteFixture();

  write(
    path.join(ownerRepoRoot, SHARED_OWNER_RELEASE_CONTRACT_PATH),
    JSON.stringify({
      contract_kind: 'family_shared_owner_release.v1',
      owner_repo: 'one-person-lab',
      owner_commit: publishedRemote.unpublishedCommit,
      packages: {
        python: {
          package_name: 'opl-harness-shared',
          git_locator: `git+${publishedRemote.remoteUrl}@${publishedRemote.unpublishedCommit}#subdirectory=python/opl-harness-shared`,
        },
        js: {
          package_name: 'opl-framework-shared',
          git_locator: `git+${publishedRemote.remoteUrl}#${publishedRemote.unpublishedCommit}`,
        },
      },
      consumers: [
        {
          repo_id: 'medautoscience',
          repo_dir: 'med-autoscience',
          verify_command: 'scripts/verify.sh family',
          targets: [
            { file: 'pyproject.toml', kind: 'python_dependency' },
            { file: 'uv.lock', kind: 'python_lock' },
          ],
        },
      ],
    }),
  );

  assert.throws(
    () => runFamilySharedReleaseCli(['check', '--family-root', familyRoot], {
      repoRoot: ownerRepoRoot,
    }),
    /push the owner repo first before release/i,
  );
});

test('family shared release promotion updates the owner contract without rewriting consumers', () => {
  const familyRoot = createConsumerFixtureRoot();
  const ownerRepoRoot = path.join(familyRoot, 'one-person-lab');
  const nextOwnerCommit = '7f84d0ad4cc6da5cfd094e2838425d44b4f3812a';
  const scienceRepo = path.join(familyRoot, 'science-worktree');
  const grantRepo = path.join(familyRoot, 'grant-worktree');
  const redcubeRepo = path.join(familyRoot, 'redcube-worktree');

  write(
    path.join(ownerRepoRoot, SHARED_OWNER_RELEASE_CONTRACT_PATH),
    JSON.stringify({
      contract_kind: 'family_shared_owner_release.v1',
      owner_repo: 'one-person-lab',
      owner_commit: STALE_OWNER_COMMIT,
      packages: {
        python: {
          package_name: 'opl-harness-shared',
          git_locator: `git+https://github.com/gaofeng21cn/one-person-lab.git@${STALE_OWNER_COMMIT}#subdirectory=python/opl-harness-shared`,
        },
        js: {
          package_name: 'opl-framework-shared',
          git_locator: `git+https://github.com/gaofeng21cn/one-person-lab.git#${STALE_OWNER_COMMIT}`,
        },
      },
      consumers: [
        {
          repo_id: 'medautoscience',
          repo_dir: 'med-autoscience',
          verify_command: 'scripts/verify.sh family',
          targets: [
            { file: 'pyproject.toml', kind: 'python_dependency' },
            { file: 'uv.lock', kind: 'python_lock' },
          ],
        },
        {
          repo_id: 'medautogrant',
          repo_dir: 'med-autogrant',
          verify_command: 'scripts/verify.sh family',
          targets: [
            { file: 'pyproject.toml', kind: 'python_dependency' },
            { file: 'uv.lock', kind: 'python_lock' },
          ],
        },
        {
          repo_id: 'redcube',
          repo_dir: 'redcube-ai',
          verify_command: 'scripts/verify.sh family',
          targets: [
            { file: 'packages/redcube-domain-entry/package.json', kind: 'js_dependency' },
            { file: 'package-lock.json', kind: 'js_lock' },
          ],
        },
      ],
    }),
  );
  write(
    path.join(scienceRepo, 'pyproject.toml'),
    `[project]\ndependencies = ["opl-harness-shared @ git+https://github.com/gaofeng21cn/one-person-lab.git@${STALE_OWNER_COMMIT}#subdirectory=python/opl-harness-shared"]\n`,
  );
  write(
    path.join(scienceRepo, 'uv.lock'),
    `source = { git = "https://github.com/gaofeng21cn/one-person-lab.git?subdirectory=python%2Fopl-harness-shared&rev=${STALE_OWNER_COMMIT}#${STALE_OWNER_COMMIT}" }\n`,
  );
  write(
    path.join(grantRepo, 'pyproject.toml'),
    `[project]\ndependencies = ["opl-harness-shared @ git+https://github.com/gaofeng21cn/one-person-lab.git@${STALE_OWNER_COMMIT}#subdirectory=python/opl-harness-shared"]\n`,
  );
  write(
    path.join(grantRepo, 'uv.lock'),
    `source = { git = "https://github.com/gaofeng21cn/one-person-lab.git?subdirectory=python%2Fopl-harness-shared&rev=${STALE_OWNER_COMMIT}#${STALE_OWNER_COMMIT}" }\n`,
  );
  write(
    path.join(redcubeRepo, 'package.json'),
    `{"dependencies":{"opl-framework-shared":"git+https://github.com/gaofeng21cn/one-person-lab.git#${STALE_OWNER_COMMIT}"}}\n`,
  );
  write(
    path.join(redcubeRepo, 'packages/redcube-domain-entry/package.json'),
    `{"dependencies":{"opl-framework-shared":"git+https://github.com/gaofeng21cn/one-person-lab.git#${STALE_OWNER_COMMIT}"}}\n`,
  );
  write(
    path.join(redcubeRepo, 'package-lock.json'),
    JSON.stringify({
      packages: {
        'node_modules/opl-framework-shared': {
          resolved: `git+ssh://git@github.com/gaofeng21cn/one-person-lab.git#${STALE_OWNER_COMMIT}`,
        },
      },
    }),
  );

  const result = runFamilySharedReleaseCli([
    'release',
    '--family-root', familyRoot,
    '--owner-commit', nextOwnerCommit,
    '--repo', `medautoscience=${scienceRepo}`,
    '--repo', `medautogrant=${grantRepo}`,
    '--repo', `redcube=${redcubeRepo}`,
  ], {
    repoRoot: ownerRepoRoot,
    validatePublishedOwnerCommit: () => {},
  });

  const releasedContract = loadSharedOwnerReleaseContract({ repoRoot: ownerRepoRoot });

  assert.equal(result.exit_code, 1);
  assert.match(result.stdout, /legacy_pin/);
  assert.match(result.stdout, new RegExp(`promoted latest-stable commit: ${nextOwnerCommit}`));
  assert.equal(releasedContract.owner_commit, nextOwnerCommit);
  assert.match(
    fs.readFileSync(path.join(scienceRepo, 'pyproject.toml'), 'utf8'),
    new RegExp(STALE_OWNER_COMMIT),
  );
  assert.match(
    fs.readFileSync(path.join(grantRepo, 'pyproject.toml'), 'utf8'),
    new RegExp(STALE_OWNER_COMMIT),
  );
  assert.match(
    fs.readFileSync(path.join(redcubeRepo, 'package-lock.json'), 'utf8'),
    new RegExp(STALE_OWNER_COMMIT),
  );
});

test('family shared release refuses unpublished owner commits before rewriting contract or consumer pins', () => {
  const familyRoot = createConsumerFixtureRoot();
  const ownerRepoRoot = path.join(familyRoot, 'one-person-lab');
  const scienceRepo = path.join(familyRoot, 'science-worktree');
  const grantRepo = path.join(familyRoot, 'grant-worktree');
  const redcubeRepo = path.join(familyRoot, 'redcube-worktree');
  const publishedRemote = createPublishedOwnerRemoteFixture();

  write(
    path.join(ownerRepoRoot, SHARED_OWNER_RELEASE_CONTRACT_PATH),
    JSON.stringify({
      contract_kind: 'family_shared_owner_release.v1',
      owner_repo: 'one-person-lab',
      owner_commit: publishedRemote.publishedCommit,
      packages: {
        python: {
          package_name: 'opl-harness-shared',
          git_locator: `git+${publishedRemote.remoteUrl}@${publishedRemote.publishedCommit}#subdirectory=python/opl-harness-shared`,
        },
        js: {
          package_name: 'opl-framework-shared',
          git_locator: `git+${publishedRemote.remoteUrl}#${publishedRemote.publishedCommit}`,
        },
      },
      consumers: [
        {
          repo_id: 'medautoscience',
          repo_dir: 'med-autoscience',
          verify_command: 'scripts/verify.sh family',
          targets: [
            { file: 'pyproject.toml', kind: 'python_dependency' },
            { file: 'uv.lock', kind: 'python_lock' },
          ],
        },
        {
          repo_id: 'medautogrant',
          repo_dir: 'med-autogrant',
          verify_command: 'scripts/verify.sh family',
          targets: [
            { file: 'pyproject.toml', kind: 'python_dependency' },
            { file: 'uv.lock', kind: 'python_lock' },
          ],
        },
        {
          repo_id: 'redcube',
          repo_dir: 'redcube-ai',
          verify_command: 'scripts/verify.sh family',
          targets: [
            { file: 'packages/redcube-domain-entry/package.json', kind: 'js_dependency' },
            { file: 'package-lock.json', kind: 'js_lock' },
          ],
        },
      ],
    }),
  );
  write(
    path.join(scienceRepo, 'pyproject.toml'),
    `[project]\ndependencies = ["opl-harness-shared @ git+${publishedRemote.remoteUrl}@${publishedRemote.publishedCommit}#subdirectory=python/opl-harness-shared"]\n`,
  );
  write(
    path.join(scienceRepo, 'uv.lock'),
    `source = { git = "${publishedRemote.remoteUrl}?subdirectory=python%2Fopl-harness-shared&rev=${publishedRemote.publishedCommit}#${publishedRemote.publishedCommit}" }\n`,
  );
  write(
    path.join(grantRepo, 'pyproject.toml'),
    `[project]\ndependencies = ["opl-harness-shared @ git+${publishedRemote.remoteUrl}@${publishedRemote.publishedCommit}#subdirectory=python/opl-harness-shared"]\n`,
  );
  write(
    path.join(grantRepo, 'uv.lock'),
    `source = { git = "${publishedRemote.remoteUrl}?subdirectory=python%2Fopl-harness-shared&rev=${publishedRemote.publishedCommit}#${publishedRemote.publishedCommit}" }\n`,
  );
  write(
    path.join(redcubeRepo, 'packages/redcube-domain-entry/package.json'),
    `{"dependencies":{"opl-framework-shared":"git+${publishedRemote.remoteUrl}#${publishedRemote.publishedCommit}"}}\n`,
  );
  write(
    path.join(redcubeRepo, 'package-lock.json'),
    `{"packages":{"packages/redcube-domain-entry":{"dependencies":{"opl-framework-shared":"git+${publishedRemote.remoteUrl}#${publishedRemote.publishedCommit}"}}}}\n`,
  );

  const collectRemotes = collectSharedOwnerReleaseRemotes as (input: {
    contract: ReturnType<typeof loadSharedOwnerReleaseContract>;
    ownerCommit?: string;
  }) => string[];
  const releasePins = releaseFamilySharedPins as unknown as (input: {
    repoRoot: string;
    familyRoot: string;
    repoOverrides: string[];
    ownerCommit: string;
  }) => unknown;

  assert.deepEqual(
    collectRemotes({
      contract: loadSharedOwnerReleaseContract({ repoRoot: ownerRepoRoot }),
      ownerCommit: publishedRemote.publishedCommit,
    }),
    [publishedRemote.remoteUrl],
  );
  assert.throws(
    () => releasePins({
      repoRoot: ownerRepoRoot,
      familyRoot,
      repoOverrides: [
        `medautoscience=${scienceRepo}`,
        `medautogrant=${grantRepo}`,
        `redcube=${redcubeRepo}`,
      ],
      ownerCommit: publishedRemote.unpublishedCommit,
    }),
    /push the owner repo first before release/i,
  );

  const releasedContract = loadSharedOwnerReleaseContract({ repoRoot: ownerRepoRoot });
  assert.equal(releasedContract.owner_commit, publishedRemote.publishedCommit);
  assert.match(
    fs.readFileSync(path.join(scienceRepo, 'pyproject.toml'), 'utf8'),
    new RegExp(publishedRemote.publishedCommit),
  );
  assert.doesNotMatch(
    fs.readFileSync(path.join(scienceRepo, 'pyproject.toml'), 'utf8'),
    new RegExp(publishedRemote.unpublishedCommit),
  );
});

test('family shared release contract surface stays tracked', () => {
  assert.equal(fs.existsSync(path.join(repoRoot, SHARED_OWNER_RELEASE_CONTRACT_PATH)), true);
});

test('family manifest fixtures keep repo-owned domain entry and orchestration truth outside opl shared ownership', () => {
  const science = loadFamilyManifestFixture('med-autoscience-product-entry-manifest.json');
  const grant = loadFamilyManifestFixture('med-autogrant-product-entry-manifest.json');
  const redcube = loadFamilyManifestFixture('redcube-product-entry-manifest.json');

  assert.equal(science.domain_entry_contract.entry_adapter, 'MedAutoScienceDomainEntry');
  assert.equal(grant.domain_entry_contract.entry_adapter, 'MedAutoGrantDomainEntry');
  assert.equal(redcube.domain_entry_contract.entry_adapter, 'RedCubeDomainEntry');

  assert.equal(
    science.user_interaction_contract.shared_downstream_entry,
    science.domain_entry_contract.entry_adapter,
  );
  assert.equal(
    grant.user_interaction_contract.shared_downstream_entry,
    grant.domain_entry_contract.entry_adapter,
  );
  assert.equal(
    redcube.user_interaction_contract.shared_downstream_entry,
    redcube.domain_entry_contract.entry_adapter,
  );

  assert.equal(science.family_orchestration.action_graph.target_domain_id, 'med-autoscience');
  assert.equal(grant.family_orchestration.action_graph.target_domain_id, 'med-autogrant');
  assert.equal(redcube.family_orchestration.action_graph.target_domain_id, 'redcube_ai');

  assert.equal(science.family_orchestration.resume_contract.session_locator_field, 'study_id');
  assert.equal(grant.family_orchestration.resume_contract.session_locator_field, 'grant_run_id');
  assert.equal(
    redcube.family_orchestration.resume_contract.session_locator_field,
    'entry_session_contract.entry_session_id',
  );

  assert.equal(
    new Set([
      science.domain_entry_contract.entry_adapter,
      grant.domain_entry_contract.entry_adapter,
      redcube.domain_entry_contract.entry_adapter,
    ]).size,
    3,
  );
  assert.equal(
    new Set([
      science.family_orchestration.resume_contract.session_locator_field,
      grant.family_orchestration.resume_contract.session_locator_field,
      redcube.family_orchestration.resume_contract.session_locator_field,
    ]).size,
    3,
  );
});
