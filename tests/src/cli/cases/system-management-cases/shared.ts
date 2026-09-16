import { spawnSync } from 'node:child_process';

export {
  assert,
  createCodexConfigFixture,
  createFakeCodexFixture,
  fs,
  os,
  parseJsonText,
  path,
  runCli,
  runCliAsync,
  runCliRaw,
  test,
} from '../../helpers.ts';
export {
  assertBlockedDeveloperModeSurface,
  assertDeveloperModeAction,
} from '../developer-mode-assertions.ts';
import {
  assert,
  fs,
  path,
} from '../../helpers.ts';
import { DOMAIN_MODULE_SPECS } from '../../../../../src/adapters/integration/system-installation/module-specs.ts';

export { DOMAIN_MODULE_SPECS };

export function createManagedDomainModuleFixtures(modulesRoot: string) {
  // Every registered module repo, so a newly registered module is covered by
  // the managed-root fixture instead of silently reporting as missing.
  for (const repoName of DOMAIN_MODULE_SPECS.map((spec) => spec.repo_name)) {
    const repoPath = path.join(modulesRoot, repoName);
    fs.mkdirSync(repoPath, { recursive: true });
    const result = spawnSync('git', ['init', '-q'], {
      cwd: repoPath,
      encoding: 'utf8',
      env: { ...process.env, HOME: modulesRoot },
    });
    assert.equal(result.status, 0, result.stderr);
  }
}
