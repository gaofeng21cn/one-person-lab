import { assert, fs, os, path, runCli, test } from '../../helpers.ts';
import { runGitFixtureCommand } from '../../helpers-parts/family-fixtures.ts';
import {
  createStartupDomainModuleRemotes,
  removeStartupDomainModuleRemotes,
  withCliTimeout,
  writeStartupPackageChannelFixture,
} from './shared.ts';
import { scholarSkillsPackageFixture } from '../system-startup-maintenance-fixtures.ts';

test('startup maintenance leaves developer sources unmanaged and fails closed on dirty managed roots', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-developer-source-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const remotes = createStartupDomainModuleRemotes({
    logPath: path.join(homeRoot, 'startup-maintenance.log'),
  });
  const developerMas = path.join(homeRoot, 'developer-med-autoscience');
  const channel = writeStartupPackageChannelFixture({
    root: path.join(homeRoot, 'scholarskills-channel'),
    version: '26.6.10-nightly',
    modules: [scholarSkillsPackageFixture('v1')],
  });
  const env = {
    HOME: homeRoot,
    CODEX_HOME: path.join(homeRoot, 'codex-home'),
    OPL_MODULES_ROOT: modulesRoot,
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
    OPL_MODULE_PATH_MEDAUTOSCIENCE: developerMas,
    OPL_MODULE_REPO_URL_MEDAUTOGRANT: remotes.magRemote.remoteRoot,
    OPL_MODULE_REPO_URL_REDCUBE: remotes.rcaRemote.remoteRoot,
    OPL_MODULE_REPO_URL_OPLMETAAGENT: remotes.metaRemote.remoteRoot,
    OPL_MODULE_REPO_URL_OPLBOOKFORGE: remotes.bookForgeRemote.remoteRoot,
    OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/owner/one-person-lab-manifest:26.6.10-nightly',
    OPL_GIT_RETRY_ATTEMPTS: '1',
    PATH: `${channel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };

  try {
    runGitFixtureCommand(homeRoot, ['clone', remotes.masRemote.remoteRoot, developerMas]);
    const first = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance'], env)) as any;
    const firstTargets = new Map<string, any>(
      first.system_action.details.module_targets.map((entry: any) => [entry.target_id, entry]),
    );
    assert.equal(firstTargets.get('medautoscience')?.reason, 'developer_checkout_visible_not_app_managed');
    assert.equal(firstTargets.get('medautoscience')?.install_origin_before, 'env_override');

    fs.writeFileSync(path.join(modulesRoot, 'med-autogrant', 'LOCAL_EDIT.txt'), 'dirty\n', 'utf8');
    const second = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance'], env)) as any;
    const targets = new Map<string, any>(
      second.system_action.details.module_targets.map((entry: any) => [entry.target_id, entry]),
    );

    assert.equal(second.system_action.status, 'manual_required');
    assert.equal(targets.get('medautoscience')?.reason, 'developer_checkout_visible_not_app_managed');
    assert.equal(targets.get('medautogrant')?.reason, 'dirty_checkout');
    assert.equal(targets.get('medautogrant')?.action, null);
    assert.equal(
      second.system_action.details.managed_install_update_receipts.receipt_refs.some(
        (ref: string) => ref.includes('/medautoscience/'),
      ),
      false,
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    removeStartupDomainModuleRemotes(remotes);
  }
});
