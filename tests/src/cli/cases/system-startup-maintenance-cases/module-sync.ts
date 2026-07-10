import { assert, fs, os, path, runCli, test } from '../../helpers.ts';
import {
  createStartupDomainModuleRemotes,
  readPackageChannelMarker,
  removeStartupDomainModuleRemotes,
  withCliTimeout,
  writeStartupPackageChannelFixture,
} from './shared.ts';
import type { StartupPackageChannelModuleFixture } from './shared.ts';
import { scholarSkillsPackageFixture } from '../system-startup-maintenance-fixtures.ts';

function masPackage(version: 'v1' | 'v2'): StartupPackageChannelModuleFixture {
  return {
    moduleId: 'medautoscience',
    repoName: 'med-autoscience',
    sourceHeadSha: `mas-${version}-sha`,
    files: {
      'plugins/med-autoscience/.codex-plugin/plugin.json': JSON.stringify({
        name: 'med-autoscience',
        skills: './skills/',
      }),
      'plugins/med-autoscience/skills/med-autoscience/SKILL.md': `---\nname: med-autoscience\ndescription: MAS ${version}.\n---\n`,
      'scripts/install-codex-plugin.sh': '#!/usr/bin/env bash\nset -euo pipefail\nprintf \'{"sync":"ok"}\\n\'\n',
    },
  };
}

test('startup maintenance silently updates package-channel modules with receipt currentness', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-package-update-'));
  const modulesRoot = path.join(homeRoot, 'modules');
  const remotes = createStartupDomainModuleRemotes({
    logPath: path.join(homeRoot, 'module-actions.log'),
  });
  const channel = (version: 'v1' | 'v2') => writeStartupPackageChannelFixture({
    root: path.join(homeRoot, `channel-${version}`),
    version: `26.6.${version === 'v1' ? '10' : '11'}-nightly`,
    modules: [masPackage(version), scholarSkillsPackageFixture(version)],
  });
  const firstChannel = channel('v1');
  const secondChannel = channel('v2');
  const baseEnv = {
    HOME: homeRoot,
    CODEX_HOME: path.join(homeRoot, 'codex-home'),
    OPL_MODULES_ROOT: modulesRoot,
    OPL_PACKAGES_OWNER: 'owner',
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };

  try {
    runCli(['connect', 'install', '--module', 'medautoscience'], {
      ...baseEnv,
      OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/owner/one-person-lab-manifest:26.6.10-nightly',
      PATH: `${firstChannel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    });

    const output = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance'], {
      ...baseEnv,
      OPL_MODULE_REPO_URL_MEDAUTOGRANT: remotes.magRemote.remoteRoot,
      OPL_MODULE_REPO_URL_REDCUBE: remotes.rcaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLMETAAGENT: remotes.metaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLBOOKFORGE: remotes.bookForgeRemote.remoteRoot,
      OPL_GIT_RETRY_ATTEMPTS: '1',
      PATH: `${secondChannel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    })) as any;
    const target = output.system_action.details.module_targets.find(
      (entry: any) => entry.target_id === 'medautoscience',
    );

    assert.equal(target.status, 'completed');
    assert.equal(target.reason, 'capability_packages_refresh');
    assert.equal(target.action, 'update');
    assert.equal(target.result.module.git.head_sha, 'mas-v2-sha');
    assert.equal(target.result.module.source_policy.configured_by, 'agent_latest_package_channel');
    assert.equal(target.result.turnkey.skill_sync.status, 'completed');
    assert.equal(target.result.turnkey.health_check.status, 'completed');
    assert.equal(
      output.system_action.details.managed_install_update_receipts.receipt_refs.some(
        (ref: string) => ref.startsWith('opl://managed-install-update/medautoscience/update/'),
      ),
      true,
    );

    const managedCheckout = path.join(modulesRoot, 'med-autoscience');
    const marker = readPackageChannelMarker(managedCheckout).package_channel_lifecycle;
    assert.equal(marker.current.source_git_head_sha, 'mas-v2-sha');
    assert.equal(marker.previous?.source_git_head_sha, 'mas-v1-sha');
    assert.equal(marker.staged.status, 'activated');
    assert.equal(fs.existsSync(`${managedCheckout}.stage`), false);
    assert.match(fs.readFileSync(secondChannel.curlLogPath, 'utf8'), /manifests\/latest/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    removeStartupDomainModuleRemotes(remotes);
  }
});
