import { assert, fs, os, path, runCli, test } from '../../helpers.ts';
import { runGitFixtureCommand } from '../../helpers-parts/family-fixtures.ts';
import {
  createStartupDomainModuleRemotes,
  removeStartupDomainModuleRemotes,
  withCliTimeout,
  writeStartupPackageChannelFixture,
} from './shared.ts';
import { scholarSkillsPackageFixture } from '../system-startup-maintenance-fixtures.ts';

test('startup maintenance preserves an ordinary user dirty OMA sibling and installs managed root', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-oma-managed-'));
  const workspaceRoot = path.join(homeRoot, 'workspace');
  const stateRoot = path.join(homeRoot, 'opl-state');
  const modulesRoot = path.join(stateRoot, 'modules');
  const siblingCheckout = path.join(workspaceRoot, 'opl-meta-agent');
  const remotes = createStartupDomainModuleRemotes({
    logPath: path.join(homeRoot, 'module-actions.log'),
  });
  const channel = writeStartupPackageChannelFixture({
    root: path.join(homeRoot, 'scholarskills-channel'),
    version: '26.6.10-nightly',
    modules: [scholarSkillsPackageFixture('v1')],
  });

  try {
    fs.mkdirSync(workspaceRoot, { recursive: true });
    runGitFixtureCommand(workspaceRoot, ['clone', remotes.metaRemote.remoteRoot, siblingCheckout]);
    fs.writeFileSync(path.join(siblingCheckout, 'LOCAL_EDIT.txt'), 'dirty sibling\n');

    const output = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: remotes.masRemote.remoteRoot,
      OPL_MODULE_REPO_URL_MEDAUTOGRANT: remotes.magRemote.remoteRoot,
      OPL_MODULE_REPO_URL_REDCUBE: remotes.rcaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLMETAAGENT: remotes.metaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLBOOKFORGE: remotes.bookForgeRemote.remoteRoot,
      OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/owner/one-person-lab-manifest:26.6.10-nightly',
      OPL_STATE_DIR: stateRoot,
      OPL_DEVELOPER_MODE_GH_FIXTURE: JSON.stringify({ login: 'ordinary-user' }),
      OPL_GIT_RETRY_ATTEMPTS: '1',
      PATH: `${channel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
    })) as any;
    const target = output.system_action.details.module_targets.find(
      (entry: any) => entry.target_id === 'oplmetaagent',
    );
    const managedCheckout = path.join(modulesRoot, 'opl-meta-agent');

    assert.equal(target.status, 'completed');
    assert.equal(target.reason, 'module_missing');
    assert.equal(target.action, 'install');
    assert.equal(target.install_origin_before, 'sibling_workspace');
    assert.equal(target.result.module.install_origin, 'managed_root');
    assert.equal(target.result.module.checkout_path, managedCheckout);
    assert.equal(fs.readFileSync(path.join(siblingCheckout, 'LOCAL_EDIT.txt'), 'utf8'), 'dirty sibling\n');
    assert.equal(fs.existsSync(path.join(managedCheckout, 'README.md')), true);
    assert.equal(
      output.system_action.details.managed_install_update_receipts.receipt_refs.some(
        (ref: string) => ref.startsWith('opl://managed-install-update/oplmetaagent/install/'),
      ),
      true,
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    removeStartupDomainModuleRemotes(remotes);
  }
});
