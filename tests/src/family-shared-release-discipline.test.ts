import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  extractTrackedPins,
  inspectConsumerRepo,
  loadSharedOwnerReleaseContract,
  resolveCanonicalRepoRoot,
  resolveDefaultFamilyRoot,
  rewriteTrackedPins,
  runFamilySharedReleaseCli,
  SHARED_OWNER_RELEASE_CONTRACT_PATH,
  syncConsumerRepo,
} from '../../scripts/family-shared-release.mjs';

const RELEASED_OWNER_COMMIT = 'cc1afc47ea2baca840e742155348f22de94ca50a';
const STALE_OWNER_COMMIT = '6a6823dba7f95de5ae3aafc477167bccb07de74c';
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

function write(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createConsumerFixtureRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-release-'));
}

test('shared owner release contract freezes a full owner commit and three consumer repos', () => {
  const contract = loadSharedOwnerReleaseContract({ repoRoot });

  assert.equal(contract.contract_kind, 'family_shared_owner_release.v1');
  assert.match(contract.owner_commit, /^[0-9a-f]{40}$/);
  assert.equal(contract.owner_commit, RELEASED_OWNER_COMMIT);
  assert.equal(contract.consumers.length, 3);
  assert.equal(contract.consumers[0].targets[0].kind, 'python_dependency');
  assert.equal(contract.consumers[2].targets[1].kind, 'js_lock');
});

test('default family root resolves from the canonical repo root in both main checkout and worktree checkouts', () => {
  const canonicalRepoRoot = resolveCanonicalRepoRoot({ repoRoot });
  const defaultFamilyRoot = resolveDefaultFamilyRoot({ repoRoot });

  assert.equal(path.basename(canonicalRepoRoot), 'one-person-lab');
  assert.equal(defaultFamilyRoot, path.resolve(canonicalRepoRoot, '..'));

  const repoParent = path.resolve(repoRoot, '..');
  if (repoRoot.includes(`${path.sep}.worktrees${path.sep}`)) {
    assert.notEqual(defaultFamilyRoot, repoParent);
  } else {
    assert.equal(defaultFamilyRoot, repoParent);
  }
});

test('rewriteTrackedPins rewrites python and js shared locators to the released owner commit', () => {
  const pythonDependency = `opl-harness-shared @ git+https://github.com/gaofeng21cn/one-person-lab.git@${STALE_OWNER_COMMIT}#subdirectory=python/opl-harness-shared`;
  const pythonLock = `source = { git = "https://github.com/gaofeng21cn/one-person-lab.git?subdirectory=python%2Fopl-harness-shared&rev=${STALE_OWNER_COMMIT}#${STALE_OWNER_COMMIT}" }`;
  const jsLocator = `"opl-gateway-shared": "git+https://github.com/gaofeng21cn/one-person-lab.git#${STALE_OWNER_COMMIT}"`;

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

test('inspectConsumerRepo detects stale pins and syncConsumerRepo rewrites them in place', () => {
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
  assert.equal(before.findings[0].status, 'stale_pin');

  const syncResult = syncConsumerRepo({ consumer, repoPath, contract });
  const after = inspectConsumerRepo({ consumer, repoPath, contract });

  assert.deepEqual(syncResult.changed_files, ['pyproject.toml', 'uv.lock']);
  assert.equal(after.status, 'aligned');
  assert.deepEqual(after.findings[0].pins, [RELEASED_OWNER_COMMIT]);
  assert.deepEqual(after.findings[1].pins, [RELEASED_OWNER_COMMIT]);
});

test('family shared release CLI can sync explicit repo overrides and report aligned status', () => {
  const familyRoot = createConsumerFixtureRoot();
  const contract = loadSharedOwnerReleaseContract({ repoRoot });
  const scienceRepo = path.join(familyRoot, 'science-worktree');
  const grantRepo = path.join(familyRoot, 'grant-worktree');
  const redcubeRepo = path.join(familyRoot, 'redcube-worktree');

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
    path.join(redcubeRepo, 'packages/redcube-gateway/package.json'),
    `{"dependencies":{"opl-gateway-shared":"git+https://github.com/gaofeng21cn/one-person-lab.git#${STALE_OWNER_COMMIT}"}}\n`,
  );
  write(
    path.join(redcubeRepo, 'package-lock.json'),
    `{"packages":{"packages/redcube-gateway":{"dependencies":{"opl-gateway-shared":"git+https://github.com/gaofeng21cn/one-person-lab.git#${STALE_OWNER_COMMIT}"}}}}\n`,
  );

  const result = runFamilySharedReleaseCli([
    'sync',
    '--family-root', familyRoot,
    '--repo', `medautoscience=${scienceRepo}`,
    '--repo', `medautogrant=${grantRepo}`,
    '--repo', `redcube=${redcubeRepo}`,
  ]);

  assert.equal(result.exit_code, 0);
  assert.match(result.stdout, /\[medautoscience\] synced/);
  assert.match(result.stdout, /\[medautogrant\] synced/);
  assert.match(result.stdout, /\[redcube\] synced/);
  assert.match(result.stdout, new RegExp(RELEASED_OWNER_COMMIT));
});

test('family shared release CLI can rewrite the owner contract and propagate a new owner commit in one step', () => {
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
          package_name: 'opl-gateway-shared',
          git_locator: `git+https://github.com/gaofeng21cn/one-person-lab.git#${STALE_OWNER_COMMIT}`,
        },
      },
      consumers: [
        {
          repo_id: 'medautoscience',
          repo_dir: 'med-autoscience',
          targets: [
            { file: 'pyproject.toml', kind: 'python_dependency' },
            { file: 'uv.lock', kind: 'python_lock' },
          ],
        },
        {
          repo_id: 'medautogrant',
          repo_dir: 'med-autogrant',
          targets: [
            { file: 'pyproject.toml', kind: 'python_dependency' },
            { file: 'uv.lock', kind: 'python_lock' },
          ],
        },
        {
          repo_id: 'redcube',
          repo_dir: 'redcube-ai',
          targets: [
            { file: 'packages/redcube-gateway/package.json', kind: 'js_dependency' },
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
    path.join(redcubeRepo, 'packages/redcube-gateway/package.json'),
    `{"dependencies":{"opl-gateway-shared":"git+https://github.com/gaofeng21cn/one-person-lab.git#${STALE_OWNER_COMMIT}"}}\n`,
  );
  write(
    path.join(redcubeRepo, 'package-lock.json'),
    `{"packages":{"packages/redcube-gateway":{"dependencies":{"opl-gateway-shared":"git+https://github.com/gaofeng21cn/one-person-lab.git#${STALE_OWNER_COMMIT}"}}}}\n`,
  );

  const result = runFamilySharedReleaseCli([
    'release',
    '--family-root', familyRoot,
    '--owner-commit', nextOwnerCommit,
    '--repo', `medautoscience=${scienceRepo}`,
    '--repo', `medautogrant=${grantRepo}`,
    '--repo', `redcube=${redcubeRepo}`,
  ], { repoRoot: ownerRepoRoot });

  const releasedContract = loadSharedOwnerReleaseContract({ repoRoot: ownerRepoRoot });

  assert.equal(result.exit_code, 0);
  assert.match(result.stdout, new RegExp(`released owner commit: ${nextOwnerCommit}`));
  assert.equal(releasedContract.owner_commit, nextOwnerCommit);
  assert.equal(
    releasedContract.packages?.python?.git_locator,
    `git+https://github.com/gaofeng21cn/one-person-lab.git@${nextOwnerCommit}#subdirectory=python/opl-harness-shared`,
  );
  assert.equal(
    releasedContract.packages?.js?.git_locator,
    `git+https://github.com/gaofeng21cn/one-person-lab.git#${nextOwnerCommit}`,
  );
  assert.match(result.stdout, /\[medautoscience\] synced/);
  assert.match(result.stdout, /\[medautogrant\] synced/);
  assert.match(result.stdout, /\[redcube\] synced/);
  assert.match(result.stdout, new RegExp(nextOwnerCommit));
});

test('family shared release stays on contract and script surfaces while public status stays clean', () => {
  const statusDoc = fs.readFileSync(path.join(repoRoot, 'docs/status.md'), 'utf8');

  assert.equal(fs.existsSync(path.join(repoRoot, SHARED_OWNER_RELEASE_CONTRACT_PATH)), true);
  assert.doesNotMatch(statusDoc, /contracts\/family-release\/shared-owner-release\.json/);
  assert.doesNotMatch(statusDoc, /npm run family:shared-release -- check/);
  assert.doesNotMatch(statusDoc, /npm run family:shared-release -- sync/);
});
