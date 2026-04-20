import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  inspectCurrentRepoFamilySharedAlignment,
  inspectFamilySharedConsumerAlignment,
  loadSharedOwnerReleaseContract,
} from '../../src/family-shared-release.ts';

const RELEASED_OWNER_COMMIT = 'e92fc99b52a8eae0dffa9859d35164acfb69b858';
const STALE_OWNER_COMMIT = '6a6823dba7f95de5ae3aafc477167bccb07de74c';

function write(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createFamilyFixtureRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-shared-release-'));
}

test('loadSharedOwnerReleaseContract reads the owner release contract from an explicit owner repo root', () => {
  const familyRoot = createFamilyFixtureRoot();
  const ownerRepoRoot = path.join(familyRoot, 'one-person-lab');
  write(
    path.join(ownerRepoRoot, 'contracts/family-release/shared-owner-release.json'),
    JSON.stringify({
      contract_kind: 'family_shared_owner_release.v1',
      owner_repo: 'one-person-lab',
      owner_commit: RELEASED_OWNER_COMMIT,
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

  const contract = loadSharedOwnerReleaseContract({ ownerRepoRoot });

  assert.equal(contract.owner_commit, RELEASED_OWNER_COMMIT);
  assert.equal(contract.consumers[0]?.repo_id, 'medautoscience');
  assert.equal(contract.consumers[0]?.verify_command, 'scripts/verify.sh family');
});

test('inspectFamilySharedConsumerAlignment reports stale and aligned python shared pins', () => {
  const familyRoot = createFamilyFixtureRoot();
  const ownerRepoRoot = path.join(familyRoot, 'one-person-lab');
  const repoRoot = path.join(familyRoot, 'med-autoscience');
  write(
    path.join(ownerRepoRoot, 'contracts/family-release/shared-owner-release.json'),
    JSON.stringify({
      contract_kind: 'family_shared_owner_release.v1',
      owner_repo: 'one-person-lab',
      owner_commit: RELEASED_OWNER_COMMIT,
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
  write(
    path.join(repoRoot, 'pyproject.toml'),
    `[project]\ndependencies = ["opl-harness-shared @ git+https://github.com/gaofeng21cn/one-person-lab.git@${STALE_OWNER_COMMIT}#subdirectory=python/opl-harness-shared"]\n`,
  );
  write(
    path.join(repoRoot, 'uv.lock'),
    `source = { git = "https://github.com/gaofeng21cn/one-person-lab.git?subdirectory=python%2Fopl-harness-shared&rev=${RELEASED_OWNER_COMMIT}#${RELEASED_OWNER_COMMIT}" }\n`,
  );

  const contract = loadSharedOwnerReleaseContract({ ownerRepoRoot });
  const stale = inspectFamilySharedConsumerAlignment({
    contract,
    consumerRepoId: 'medautoscience',
    repoRoot,
  });

  write(
    path.join(repoRoot, 'pyproject.toml'),
    `[project]\ndependencies = ["opl-harness-shared @ git+https://github.com/gaofeng21cn/one-person-lab.git@${RELEASED_OWNER_COMMIT}#subdirectory=python/opl-harness-shared"]\n`,
  );

  const aligned = inspectFamilySharedConsumerAlignment({
    contract,
    consumerRepoId: 'medautoscience',
    repoRoot,
  });

  assert.equal(stale.status, 'stale');
  assert.equal(stale.findings[0]?.status, 'stale_pin');
  assert.equal(aligned.status, 'aligned');
  assert.deepEqual(aligned.findings[0]?.pins, [RELEASED_OWNER_COMMIT]);
});

test('inspectCurrentRepoFamilySharedAlignment resolves the owner repo from the current consumer repo', () => {
  const familyRoot = createFamilyFixtureRoot();
  const ownerRepoRoot = path.join(familyRoot, 'one-person-lab');
  const repoRoot = path.join(familyRoot, 'redcube-ai');
  write(
    path.join(ownerRepoRoot, 'contracts/family-release/shared-owner-release.json'),
    JSON.stringify({
      contract_kind: 'family_shared_owner_release.v1',
      owner_repo: 'one-person-lab',
      owner_commit: RELEASED_OWNER_COMMIT,
      consumers: [
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
    path.join(repoRoot, 'packages/redcube-gateway/package.json'),
    `{"dependencies":{"opl-gateway-shared":"git+https://github.com/gaofeng21cn/one-person-lab.git#${RELEASED_OWNER_COMMIT}"}}\n`,
  );
  write(
    path.join(repoRoot, 'package-lock.json'),
    `{"packages":{"packages/redcube-gateway":{"dependencies":{"opl-gateway-shared":"git+https://github.com/gaofeng21cn/one-person-lab.git#${RELEASED_OWNER_COMMIT}"}}}}\n`,
  );

  const inspection = inspectCurrentRepoFamilySharedAlignment({
    repoRoot,
    consumerRepoId: 'redcube',
    ownerRepoRoot,
  });

  assert.equal(inspection.status, 'aligned');
  assert.equal(inspection.owner_commit, RELEASED_OWNER_COMMIT);
  assert.equal(inspection.findings[0]?.status, 'aligned');
});
