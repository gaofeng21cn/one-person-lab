import { assert, fs, os, path, runCli, test } from '../../helpers.ts';
import { runGitFixtureCommand } from '../../helpers-parts/family-fixtures.ts';
import { runModuleStartupMaintenance } from '../../../../../src/modules/connect/system-installation/startup-maintenance.ts';
import {
  createCurrentCodexFixture,
  createStartupDomainModuleRemotes,
  currentCodexEnvironment,
  removeStartupDomainModuleRemotes,
  withCliTimeout,
  writeStartupPackageChannelFixture,
} from './shared.ts';
import { scholarSkillsPackageFixture } from '../system-startup-maintenance-fixtures.ts';

test('system startup-maintenance leaves healthy Full runtime launch sources to package reconciliation', () => {
  const targets = [
    'medautoscience',
    'medautogrant',
    'redcube',
    'oplmetaagent',
    'oplbookforge',
  ].map((targetId) => runModuleStartupMaintenance({
    module_id: targetId,
    default_install: true,
    installed: true,
    install_origin: 'env_override',
    health_status: 'ready',
    git: {
      sync_status: 'no_upstream',
      dirty: false,
    },
    source_policy: {
      effective_install_update_source: 'full_runtime',
      configured_by: 'full_runtime_override',
    },
  } as any));

  assert.deepEqual(targets.map((target) => ({
    target_id: target.target_id,
    status: target.status,
    reason: target.reason,
    action: target.action,
    result: target.result,
    error: target.error,
  })), [
    'medautoscience',
    'medautogrant',
    'redcube',
    'oplmetaagent',
    'oplbookforge',
  ].map((targetId) => ({
    target_id: targetId,
    status: 'skipped',
    reason: 'full_runtime_launch_source_owned_by_package_reconciliation',
    action: null,
    result: null,
    error: null,
  })));
  assert.equal(targets.some((target) => target.status === 'manual_required'), false);
});

test('system startup-maintenance syncs explicit developer checkouts and reports dirty managed checkouts', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-manual-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const logPath = path.join(homeRoot, 'startup-maintenance.log');
  const remotes = createStartupDomainModuleRemotes({ logPath });
  const { masRemote, magRemote, rcaRemote, metaRemote, bookForgeRemote } = remotes;
  const scholarSkillsChannel = writeStartupPackageChannelFixture({
    root: path.join(homeRoot, 'scholarskills-channel'),
    version: '26.6.10-nightly',
    modules: [scholarSkillsPackageFixture('v1')],
  });
  const codexFixture = createCurrentCodexFixture();
  const masDeveloperCheckout = path.join(homeRoot, 'developer-med-autoscience');

  try {
    runGitFixtureCommand(homeRoot, ['clone', masRemote.remoteRoot, masDeveloperCheckout]);
    const firstRun = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_MODULES_ROOT: modulesRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULE_PATH_MEDAUTOSCIENCE: masDeveloperCheckout,
      OPL_MODULE_REPO_URL_MEDAUTOGRANT: magRemote.remoteRoot,
      OPL_MODULE_REPO_URL_REDCUBE: rcaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLMETAAGENT: metaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLBOOKFORGE: bookForgeRemote.remoteRoot,
      OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/owner/one-person-lab-manifest:26.6.10-nightly',
      OPL_GIT_RETRY_ATTEMPTS: '1',
      ...currentCodexEnvironment(codexFixture, [scholarSkillsChannel.fakeBin]),
      ...{ OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' },
    })) as {
      system_action: {
        status: string;
        details: {
          module_targets: Array<{
            target_id: string;
            status: string;
            reason: string;
            install_origin_before: string;
          }>;
        };
      };
    };
    const firstTargets = new Map(firstRun.system_action.details.module_targets.map((target) => [target.target_id, target]));
    assert.equal(firstRun.system_action.status, 'completed');
    assert.equal(firstTargets.get('medautoscience')?.status, 'completed');
    assert.equal(firstTargets.get('medautoscience')?.reason, 'developer_checkout_visible_not_app_managed');
    assert.equal(firstTargets.get('medautoscience')?.install_origin_before, 'env_override');

    fs.writeFileSync(path.join(modulesRoot, 'med-autogrant', 'LOCAL_EDIT.txt'), 'dirty\n', 'utf8');
    const secondRun = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_MODULES_ROOT: modulesRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULE_PATH_MEDAUTOSCIENCE: masDeveloperCheckout,
      OPL_MODULE_REPO_URL_MEDAUTOGRANT: magRemote.remoteRoot,
      OPL_MODULE_REPO_URL_REDCUBE: rcaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLMETAAGENT: metaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLBOOKFORGE: bookForgeRemote.remoteRoot,
      OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/owner/one-person-lab-manifest:26.6.10-nightly',
      OPL_GIT_RETRY_ATTEMPTS: '1',
      ...currentCodexEnvironment(codexFixture, [scholarSkillsChannel.fakeBin]),
      ...{ OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' },
    })) as {
      system_action: {
        status: string;
        details: {
          summary: { manual_required_targets_count: number };
          managed_install_update_receipts: {
            recorded_receipt_count: number;
            receipt_refs: string[];
          };
          module_targets: Array<{
            target_id: string;
            status: string;
            reason: string;
            action: string | null;
          }>;
        };
      };
    };
    const secondTargets = new Map(secondRun.system_action.details.module_targets.map((target) => [target.target_id, target]));
    assert.equal(secondRun.system_action.status, 'manual_required');
    assert.equal(secondRun.system_action.details.summary.manual_required_targets_count, 1);
    assert.equal(secondTargets.get('medautoscience')?.status, 'completed');
    assert.equal(secondTargets.get('medautoscience')?.reason, 'developer_checkout_visible_not_app_managed');
    assert.equal(secondTargets.get('medautogrant')?.reason, 'dirty_checkout');
    assert.equal(secondTargets.get('medautogrant')?.action, null);
    assert.equal(secondTargets.get('redcube')?.status, 'completed');
    assert.equal(secondTargets.get('oplmetaagent')?.status, 'completed');
    assert.equal(secondTargets.get('oplbookforge')?.status, 'completed');
    assert.equal(secondRun.system_action.details.managed_install_update_receipts.recorded_receipt_count, 3);
    assert.equal(
      secondRun.system_action.details.managed_install_update_receipts.receipt_refs.some(
        (ref) => ref.startsWith('opl://managed-install-update/oplmetaagent/update/'),
      ),
      true,
    );
    assert.equal(
      secondRun.system_action.details.managed_install_update_receipts.receipt_refs.some(
        (ref) => ref.startsWith('opl://managed-install-update/oplbookforge/update/'),
      ),
      true,
    );
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    removeStartupDomainModuleRemotes(remotes);
  }
});
