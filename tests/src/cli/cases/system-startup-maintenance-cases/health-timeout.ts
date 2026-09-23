import { assert, fs, os, path, runCli, test } from '../../helpers.ts';
import { runGitFixtureCommand } from '../../helpers-parts/family-fixtures.ts';
import {
  createCurrentCodexFixture,
  createStartupDomainModuleRemotes,
  currentCodexEnvironment,
  DOMAIN_MODULE_TARGET_COUNT,
  removeStartupDomainModuleRemotes,
  withCliTimeout,
} from './shared.ts';

test('system startup-maintenance does not execute legacy module health scripts', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-timeout-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const logPath = path.join(homeRoot, 'startup-maintenance-timeout.log');
  const remotes = createStartupDomainModuleRemotes({ logPath });
  const { masRemote, magRemote, rcaRemote, metaRemote, bookForgeRemote, autocastRemote } = remotes;
  const codexFixture = createCurrentCodexFixture();
  // Keep normal fixture probes below the timeout even when the full lane is under load.
  const moduleActionStepTimeoutMs = 2_000;

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
      OPL_MODULE_REPO_URL_MEDAUTOCAST: autocastRemote.remoteRoot,
      OPL_MODULE_ACTION_STEP_TIMEOUT_MS: String(moduleActionStepTimeoutMs),
      OPL_GIT_RETRY_ATTEMPTS: '1',
      ...currentCodexEnvironment(codexFixture),
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
                  command_preview: string[] | null;
                  result: Record<string, unknown> | null;
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
    assert.equal(output.system_action.status, 'completed');
    assert.equal(output.system_action.details.summary.manual_required_targets_count, 0);
    assert.equal(
      output.system_action.details.summary.completed_targets_count,
      DOMAIN_MODULE_TARGET_COUNT,
    );
    assert.equal(magTarget?.status, 'completed');
    assert.equal(magTarget?.reason, 'module_missing');
    assert.equal(magTarget?.result.turnkey.health_check.status, 'skipped');
    assert.equal(magTarget?.result.turnkey.health_check.command_preview, null);
    assert.equal(magTarget?.result.turnkey.health_check.result, null);
    assert.equal(targets.get('oplmetaagent')?.status, 'completed');
    assert.equal(targets.get('oplbookforge')?.status, 'completed');
    assert.equal(output.system_action.details.managed_install_update_receipts.status, 'no_eligible_managed_receipts');
    assert.equal(output.system_action.details.managed_install_update_receipts.recorded_receipt_count, 0);
    assert.deepEqual(output.system_action.details.managed_install_update_receipts.receipt_refs, []);
    assert.equal(output.system_action.details.plugin_cache_freshness.status, 'freshened');
    assert.equal(
      output.system_action.details.plugin_cache_freshness.synced_domain_packs_count,
      DOMAIN_MODULE_TARGET_COUNT,
    );
    const startupLog = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
    assert.equal(startupLog.includes('mag-health-start'), false);
    assert.equal(startupLog.includes('mag-health-finished'), false);
    assert.equal(startupLog.includes('opl-meta-agent-health'), false);
    assert.equal(startupLog.includes('opl-bookforge-health'), false);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    removeStartupDomainModuleRemotes(remotes);
  }
});
