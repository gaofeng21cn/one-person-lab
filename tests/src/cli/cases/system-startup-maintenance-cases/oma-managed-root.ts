import { assert, fs, os, path, runCli, test } from '../../helpers.ts';
import { runGitFixtureCommand } from '../../helpers-parts/family-fixtures.ts';
import {
  createCurrentCodexFixture,
  createStartupDomainModuleRemotes,
  currentCodexEnvironment,
  removeStartupDomainModuleRemotes,
  withCliTimeout,
  writeStartupPackageChannelFixture,
} from './shared.ts';
import { scholarSkillsPackageFixture } from '../system-startup-maintenance-fixtures.ts';

test('system startup-maintenance installs OMA managed root when only a sibling checkout is visible', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-oma-sibling-home-'));
  const workspaceRoot = path.join(homeRoot, 'workspace');
  const onePersonLabRoot = path.join(workspaceRoot, 'one-person-lab');
  const siblingCheckout = path.join(workspaceRoot, 'opl-meta-agent');
  const stateRoot = path.join(homeRoot, 'opl-state');
  const modulesRoot = path.join(stateRoot, 'modules');
  const logPath = path.join(homeRoot, 'startup-maintenance-oma.log');
  const omaHealthcheckLogPath = path.join(homeRoot, 'oma-healthcheck.log');
  const remotes = createStartupDomainModuleRemotes({
    logPath,
    omaHealthcheckLogPath,
  });
  const { masRemote, magRemote, rcaRemote, metaRemote, bookForgeRemote } = remotes;
  const scholarSkillsChannel = writeStartupPackageChannelFixture({
    root: path.join(homeRoot, 'scholarskills-channel'),
    version: '26.6.10-nightly',
    modules: [scholarSkillsPackageFixture('v1')],
  });
  const codexFixture = createCurrentCodexFixture();

  try {
    fs.mkdirSync(onePersonLabRoot, { recursive: true });
    runGitFixtureCommand(workspaceRoot, ['clone', metaRemote.remoteRoot, siblingCheckout]);
    fs.writeFileSync(path.join(siblingCheckout, 'LOCAL_EDIT.txt'), 'dirty sibling\n', 'utf8');

    const output = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: masRemote.remoteRoot,
      OPL_MODULE_REPO_URL_MEDAUTOGRANT: magRemote.remoteRoot,
      OPL_MODULE_REPO_URL_REDCUBE: rcaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLMETAAGENT: metaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLBOOKFORGE: bookForgeRemote.remoteRoot,
      OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/owner/one-person-lab-manifest:26.6.10-nightly',
      OPL_STATE_DIR: stateRoot,
      OPL_DEVELOPER_MODE_GH_FIXTURE: JSON.stringify({ login: 'ordinary-user' }),
      OPL_GIT_RETRY_ATTEMPTS: '1',
      ...currentCodexEnvironment(codexFixture, [scholarSkillsChannel.fakeBin]),
      ...{ OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' },
    })) as {
      system_action: {
        details: {
          managed_install_update_receipts: {
            receipt_refs: string[];
          };
          module_targets: Array<{
            target_id: string;
            status: string;
            reason: string;
            action: string | null;
            install_origin_before: string;
            result: {
              module: {
                install_origin: string;
                checkout_path: string;
                managed_checkout_path: string;
              };
            } | null;
          }>;
        };
      };
    };

    const metaTarget = output.system_action.details.module_targets.find((target) => (
      target.target_id === 'oplmetaagent'
    ));
    const managedCheckout = path.join(modulesRoot, 'opl-meta-agent');
    assert.equal(metaTarget?.status, 'completed');
    assert.equal(metaTarget?.reason, 'module_missing');
    assert.equal(metaTarget?.action, 'install');
    assert.equal(metaTarget?.install_origin_before, 'sibling_workspace');
    assert.equal(metaTarget?.result?.module.install_origin, 'managed_root');
    assert.equal(metaTarget?.result?.module.checkout_path, managedCheckout);
    assert.equal(metaTarget?.result?.module.managed_checkout_path, managedCheckout);
    assert.equal(fs.existsSync(path.join(managedCheckout, 'README.md')), true);
    assert.equal(fs.existsSync(path.join(siblingCheckout, 'LOCAL_EDIT.txt')), true);
    assert.equal(fs.readFileSync(omaHealthcheckLogPath, 'utf8').trim(), 'smoke');
    assert.equal(
      output.system_action.details.managed_install_update_receipts.receipt_refs.some(
        (ref) => ref.startsWith('opl://managed-install-update/oplmetaagent/install/'),
      ),
      true,
    );
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    removeStartupDomainModuleRemotes(remotes);
  }
});
