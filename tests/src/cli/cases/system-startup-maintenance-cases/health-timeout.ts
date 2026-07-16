import { assert, fs, os, path, runCli, test } from '../../helpers.ts';
import { runGitFixtureCommand } from '../../helpers-parts/family-fixtures.ts';
import {
  createStartupDomainModuleRemotes,
  removeStartupDomainModuleRemotes,
  withCliTimeout,
  writeStartupPackageChannelFixture,
} from './shared.ts';
import { scholarSkillsPackageFixture } from '../system-startup-maintenance-fixtures.ts';

test('system startup-maintenance does not block all modules on a timed-out module health check', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-timeout-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const logPath = path.join(homeRoot, 'startup-maintenance-timeout.log');
  const remotes = createStartupDomainModuleRemotes({ logPath });
  const { masRemote, magRemote, rcaRemote, metaRemote, bookForgeRemote } = remotes;
  const scholarSkillsChannel = writeStartupPackageChannelFixture({
    root: path.join(homeRoot, 'scholarskills-channel'),
    version: '26.6.10-nightly',
    modules: [scholarSkillsPackageFixture('v1')],
  });

  try {
    fs.writeFileSync(
      path.join(magRemote.sourceRoot, 'scripts', 'opl-module-healthcheck.sh'),
      [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf 'mag-health-start\\n' >> ${JSON.stringify(logPath)}`,
        'sleep 5',
        `printf 'mag-health-finished\\n' >> ${JSON.stringify(logPath)}`,
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
    runGitFixtureCommand(magRemote.sourceRoot, ['add', 'scripts/opl-module-healthcheck.sh']);
    runGitFixtureCommand(magRemote.sourceRoot, ['commit', '-m', 'slow mag healthcheck']);
    runGitFixtureCommand(magRemote.sourceRoot, ['push', 'origin', 'main']);

    const output = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_MODULES_ROOT: modulesRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: masRemote.remoteRoot,
      OPL_MODULE_REPO_URL_MEDAUTOGRANT: magRemote.remoteRoot,
      OPL_MODULE_REPO_URL_REDCUBE: rcaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLMETAAGENT: metaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLBOOKFORGE: bookForgeRemote.remoteRoot,
      OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/owner/one-person-lab-manifest:26.6.10-nightly',
      OPL_MODULE_ACTION_STEP_TIMEOUT_MS: '100',
      OPL_GIT_RETRY_ATTEMPTS: '1',
      PATH: `${scholarSkillsChannel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      ...{ OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' },
    })) as {
      system_action: {
        status: string;
        details: {
          summary: {
            completed_targets_count: number;
            manual_required_targets_count: number;
          };
          managed_install_update_receipts: {
            status: string;
            recorded_receipt_count: number;
            receipt_refs: string[];
          };
          module_targets: Array<{
            target_id: string;
            status: string;
            reason: string;
            result: {
              turnkey: {
                health_check: {
                  status: string;
                  result: {
                    blocker_kind: string;
                    timeout_ms: number;
                    authority_boundary: {
                      can_claim_module_healthy: boolean;
                      can_claim_production_ready: boolean;
                    };
                  };
                };
              };
            };
          }>;
          plugin_cache_freshness: {
            status: string;
            synced_domain_packs_count: number;
          };
        };
      };
    };

    const targets = new Map(output.system_action.details.module_targets.map((target) => [target.target_id, target]));
    const magTarget = targets.get('medautogrant');
    assert.equal(output.system_action.status, 'manual_required');
    assert.equal(output.system_action.details.summary.manual_required_targets_count, 1);
    assert.equal(output.system_action.details.summary.completed_targets_count, 4);
    assert.equal(magTarget?.status, 'manual_required');
    assert.equal(magTarget?.reason, 'module_health_check_blocked');
    assert.equal(magTarget?.result.turnkey.health_check.status, 'blocked');
    assert.equal(magTarget?.result.turnkey.health_check.result.blocker_kind, 'module_action_step_timeout');
    assert.equal(magTarget?.result.turnkey.health_check.result.timeout_ms, 100);
    assert.equal(
      magTarget?.result.turnkey.health_check.result.authority_boundary.can_claim_module_healthy,
      false,
    );
    assert.equal(
      magTarget?.result.turnkey.health_check.result.authority_boundary.can_claim_production_ready,
      false,
    );
    assert.equal(targets.get('oplmetaagent')?.status, 'completed');
    assert.equal(targets.get('oplbookforge')?.status, 'completed');
    assert.equal(output.system_action.details.managed_install_update_receipts.status, 'recorded');
    assert.equal(output.system_action.details.managed_install_update_receipts.recorded_receipt_count, 4);
    assert.equal(
      output.system_action.details.managed_install_update_receipts.receipt_refs.some(
        (ref) => ref.startsWith('opl://managed-install-update/oplmetaagent/install/'),
      ),
      true,
    );
    assert.equal(
      output.system_action.details.managed_install_update_receipts.receipt_refs.some(
        (ref) => ref.startsWith('opl://managed-install-update/oplbookforge/install/'),
      ),
      true,
    );
    assert.equal(output.system_action.details.plugin_cache_freshness.status, 'freshened');
    assert.equal(output.system_action.details.plugin_cache_freshness.synced_domain_packs_count, 5);
    assert.equal(fs.readFileSync(logPath, 'utf8').includes('opl-meta-agent-health'), true);
    assert.equal(fs.readFileSync(logPath, 'utf8').includes('opl-bookforge-health'), true);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    removeStartupDomainModuleRemotes(remotes);
  }
});
