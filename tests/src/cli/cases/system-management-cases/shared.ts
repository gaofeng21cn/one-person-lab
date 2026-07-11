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

export function createManagedDomainModuleFixtures(modulesRoot: string) {
  for (const repoName of ['med-autoscience', 'med-deepscientist', 'med-autogrant', 'redcube-ai', 'opl-meta-agent', 'opl-bookforge', 'mas-scholar-skills']) {
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
