import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
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
    remoteUrl: pathToFileURL(remoteRoot).href,
    publishedCommit,
    unpublishedCommit,
  };
}

function loadFamilyManifestFixture(fileName: string) {
  const payload = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'tests/fixtures/family-manifests', fileName), 'utf8'),
  );
  return payload.product_entry_manifest ?? payload;
}

test('shared owner release contract freezes a full owner commit and three consumer repos', () => {
  const contract = loadSharedOwnerReleaseContract({ repoRoot });

  assert.equal(contract.contract_kind, 'family_shared_owner_release.v1');
  assert.match(contract.owner_commit, /^[0-9a-f]{40}$/);
  assert.equal(contract.owner_commit, RELEASED_OWNER_COMMIT);
  assert.equal(contract.consumers.length, 3);
  assert.equal(contract.consumers[0].verify_command, 'scripts/verify.sh family');
  assert.equal(contract.consumers[1].verify_command, 'scripts/verify.sh family');
  assert.equal(contract.consumers[2].verify_command, 'scripts/verify.sh family');
  assert.equal(contract.consumers[0].targets[0].kind, 'python_dependency');
  assert.equal(contract.consumers[2].targets[1].kind, 'js_lock');
});

test('default family root resolves from the canonical repo root in both main checkout and worktree checkouts', () => {
  const canonicalRepoRoot = resolveCanonicalRepoRoot({ repoRoot });
  const defaultFamilyRoot = resolveDefaultFamilyRoot({ repoRoot });

  assert.equal(path.basename(canonicalRepoRoot), 'one-person-lab');
  assert.equal(defaultFamilyRoot, path.resolve(canonicalRepoRoot, '..'));

  const repoParent = path.resolve(repoRoot, '..');
  if (
    repoRoot.includes(`${path.sep}.worktrees${path.sep}`)
    || repoRoot.includes(`${path.sep}worktrees${path.sep}`)
  ) {
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
  assert.match(result.stdout, /verify: scripts\/verify\.sh family/);
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
  ], {
    repoRoot: ownerRepoRoot,
    validatePublishedOwnerCommit: () => {},
  });

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
          package_name: 'opl-gateway-shared',
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
            { file: 'packages/redcube-gateway/package.json', kind: 'js_dependency' },
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
    path.join(redcubeRepo, 'packages/redcube-gateway/package.json'),
    `{"dependencies":{"opl-gateway-shared":"git+${publishedRemote.remoteUrl}#${publishedRemote.publishedCommit}"}}\n`,
  );
  write(
    path.join(redcubeRepo, 'package-lock.json'),
    `{"packages":{"packages/redcube-gateway":{"dependencies":{"opl-gateway-shared":"git+${publishedRemote.remoteUrl}#${publishedRemote.publishedCommit}"}}}}\n`,
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

test('family shared release stays on contract and script surfaces while public status stays clean', () => {
  const statusDoc = fs.readFileSync(path.join(repoRoot, 'docs/status.md'), 'utf8');

  assert.equal(fs.existsSync(path.join(repoRoot, SHARED_OWNER_RELEASE_CONTRACT_PATH)), true);
  assert.doesNotMatch(statusDoc, /contracts\/family-release\/shared-owner-release\.json/);
  assert.doesNotMatch(statusDoc, /npm run family:shared-release -- check/);
  assert.doesNotMatch(statusDoc, /npm run family:shared-release -- sync/);
});

test('family shared release maintainer doc stays on family shared module maintenance instead of domain release ownership', () => {
  const maintainerDoc = fs.readFileSync(
    path.join(repoRoot, 'docs/references/family-shared-release-maintenance.md'),
    'utf8',
  );

  assert.match(maintainerDoc, /contracts\/family-release\/shared-owner-release\.json/);
  assert.match(maintainerDoc, /npm run family:shared-release -- release/);
  assert.match(maintainerDoc, /tests\/src\/family-shared-release-discipline\.test\.ts/);
  assert.match(maintainerDoc, /shared module owner commit/i);
  assert.match(maintainerDoc, /push.*owner.*before release|remote 可达/i);
  assert.match(maintainerDoc, /entry_adapter|action_graph\.target_domain_id|session_locator_field/i);
  assert.doesNotMatch(maintainerDoc, /domain release owner/i);
  assert.doesNotMatch(maintainerDoc, /submission owner/i);
});

test('family manifest fixtures keep repo-owned domain entry and orchestration truth outside opl shared ownership', () => {
  const science = loadFamilyManifestFixture('med-autoscience-product-entry-manifest.json');
  const grant = loadFamilyManifestFixture('med-autogrant-product-entry-manifest.json');
  const redcube = loadFamilyManifestFixture('redcube-product-entry-manifest.json');

  assert.equal(science.domain_entry_contract.entry_adapter, 'MedAutoScienceDomainEntry');
  assert.equal(grant.domain_entry_contract.entry_adapter, 'MedAutoGrantDomainEntry');
  assert.equal(redcube.domain_entry_contract.entry_adapter, 'RedCubeDomainEntry');

  assert.equal(
    science.gateway_interaction_contract.shared_downstream_entry,
    science.domain_entry_contract.entry_adapter,
  );
  assert.equal(
    grant.gateway_interaction_contract.shared_downstream_entry,
    grant.domain_entry_contract.entry_adapter,
  );
  assert.equal(
    redcube.gateway_interaction_contract.shared_downstream_entry,
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
