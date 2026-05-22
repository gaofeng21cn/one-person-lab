import { assert, createGitModuleRemoteFixture, fs, os, path, runCli, test } from '../helpers.ts';
import { runGitFixtureCommand } from '../helpers-parts/family-fixtures.ts';
import { listManagedInstallUpdateReceipts } from '../../../../src/managed-install-update-ledger.ts';

function createDomainModuleRemote(input: {
  repoName: string;
  pluginName: 'mas' | 'mag' | 'rca' | 'opl-meta-agent';
  installerKind: 'bash' | 'node';
  logPath: string;
}) {
  const installScript: Record<string, string> =
    input.installerKind === 'bash'
      ? {
        'scripts/install-codex-plugin.sh': [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          `printf '${input.pluginName}-skill-sync\\n' >> ${JSON.stringify(input.logPath)}`,
          `printf '%s\\n' '{"plugin":"${input.pluginName}","sync":"ok"}'`,
          '',
        ].join('\n'),
      }
      : {
        'scripts/install-codex-plugin.mjs': [
          `import fs from 'node:fs';`,
          `fs.appendFileSync(${JSON.stringify(input.logPath)}, '${input.pluginName}-skill-sync\\n');`,
          `console.log(JSON.stringify({ plugin: '${input.pluginName}', sync: 'ok' }));`,
          '',
        ].join('\n'),
      };

  return createGitModuleRemoteFixture(input.repoName, {
    extraFiles: {
      [`plugins/${input.pluginName}/.codex-plugin/plugin.json`]: JSON.stringify({
        name: input.pluginName,
        skills: './skills/',
      }, null, 2),
      [`plugins/${input.pluginName}/skills/${input.pluginName}/SKILL.md`]: [
        '---',
        `name: ${input.pluginName}`,
        `description: Use ${input.pluginName.toUpperCase()} through its OPL-managed product entry.`,
        '---',
        '',
        `# ${input.pluginName.toUpperCase()} Skill`,
        '',
      ].join('\n'),
      'scripts/opl-module-bootstrap.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf '${input.pluginName}-bootstrap\\n' >> ${JSON.stringify(input.logPath)}`,
        '',
      ].join('\n'),
      'scripts/opl-module-healthcheck.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf '${input.pluginName}-health\\n' >> ${JSON.stringify(input.logPath)}`,
        '',
      ].join('\n'),
      ...installScript,
    },
  });
}

test('system startup-maintenance installs clean managed modules and returns App reload guidance', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const logPath = path.join(homeRoot, 'startup-maintenance.log');
  const masRemote = createDomainModuleRemote({
    repoName: 'med-autoscience',
    pluginName: 'mas',
    installerKind: 'bash',
    logPath,
  });
  const magRemote = createDomainModuleRemote({
    repoName: 'med-autogrant',
    pluginName: 'mag',
    installerKind: 'bash',
    logPath,
  });
  const rcaRemote = createDomainModuleRemote({
    repoName: 'redcube-ai',
    pluginName: 'rca',
    installerKind: 'node',
    logPath,
  });
  const metaRemote = createDomainModuleRemote({
    repoName: 'opl-meta-agent',
    pluginName: 'opl-meta-agent',
    installerKind: 'node',
    logPath,
  });

  try {
    const output = runCli(['system', 'startup-maintenance'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_MODULES_ROOT: modulesRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: masRemote.remoteRoot,
      OPL_MODULE_REPO_URL_MEDAUTOGRANT: magRemote.remoteRoot,
      OPL_MODULE_REPO_URL_REDCUBE: rcaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLMETAAGENT: metaRemote.remoteRoot,
      OPL_GIT_RETRY_ATTEMPTS: '1',
      ...{ OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' },
    }) as {
      system_action: {
        action: string;
        status: string;
        details: {
          surface_kind: string;
          mode: string;
          authority_boundary: {
            can_write_domain_truth: boolean;
            can_install_domain_daemon: boolean;
          };
          summary: {
            completed_targets_count: number;
            manual_required_targets_count: number;
          };
          module_targets: Array<{
            target_id: string;
            status: string;
            reason: string;
            install_origin_before: string;
            result: {
              turnkey: {
                skill_sync: { status: string };
                health_check: { status: string };
              };
            };
          }>;
          managed_install_update_receipts: {
            surface_kind: string;
            status: string;
            recorded_receipt_count: number;
            receipt_refs: string[];
            ledger_file: string;
          };
          plugin_cache_freshness: {
            status: string;
            source: string;
            synced_domain_packs_count: number;
          };
          restart_reload_prompt: {
            required: boolean;
            action: string;
            affected_domains: string[];
          };
        };
      };
    };

    assert.equal(output.system_action.action, 'startup_maintenance');
    assert.equal(output.system_action.status, 'completed');
    assert.equal(output.system_action.details.surface_kind, 'opl_app_startup_maintenance');
    assert.equal(output.system_action.details.mode, 'clean_managed_environment_startup');
    assert.equal(output.system_action.details.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.system_action.details.authority_boundary.can_install_domain_daemon, false);
    assert.equal(output.system_action.details.summary.completed_targets_count, 4);
    assert.equal(output.system_action.details.summary.manual_required_targets_count, 0);
    assert.equal(
      output.system_action.details.managed_install_update_receipts.surface_kind,
      'opl_managed_module_install_update_ledger_record',
    );
    assert.equal(output.system_action.details.managed_install_update_receipts.status, 'recorded');
    assert.equal(
      output.system_action.details.managed_install_update_receipts.recorded_receipt_count,
      4,
    );
    assert.equal(
      output.system_action.details.managed_install_update_receipts.receipt_refs.some(
        (ref) => ref.startsWith('opl://managed-install-update/oplmetaagent/install/'),
      ),
      true,
    );
    assert.equal(
      output.system_action.details.managed_install_update_receipts.ledger_file,
      path.join(homeRoot, 'opl-state', 'managed-install-update-ledger.json'),
    );
    assert.deepEqual(
      output.system_action.details.module_targets.map((target) => [
        target.target_id,
        target.status,
        target.reason,
        target.install_origin_before,
        target.result.turnkey.skill_sync.status,
        target.result.turnkey.health_check.status,
      ]),
      [
        ['medautoscience', 'completed', 'module_missing', 'missing', 'completed', 'completed'],
        ['medautogrant', 'completed', 'module_missing', 'missing', 'completed', 'completed'],
        ['redcube', 'completed', 'module_missing', 'missing', 'completed', 'completed'],
        ['oplmetaagent', 'completed', 'module_missing', 'missing', 'completed', 'completed'],
      ],
    );
    assert.equal(output.system_action.details.plugin_cache_freshness.status, 'freshened');
    assert.equal(output.system_action.details.plugin_cache_freshness.source, 'module_turnkey_skill_sync');
    assert.equal(output.system_action.details.plugin_cache_freshness.synced_domain_packs_count, 4);
    assert.equal(output.system_action.details.restart_reload_prompt.required, true);
    assert.equal(output.system_action.details.restart_reload_prompt.action, 'reload_app_and_codex_plugin_cache');
    assert.deepEqual(output.system_action.details.restart_reload_prompt.affected_domains, [
      'medautoscience',
      'medautogrant',
      'redcube',
      'oplmetaagent',
    ]);
    assert.deepEqual(fs.readFileSync(logPath, 'utf8').trim().split('\n'), [
      'mas-bootstrap',
      'mas-skill-sync',
      'mas-health',
      'mag-bootstrap',
      'mag-skill-sync',
      'mag-health',
      'rca-bootstrap',
      'rca-skill-sync',
      'rca-health',
      'opl-meta-agent-bootstrap',
      'opl-meta-agent-skill-sync',
      'opl-meta-agent-health',
    ]);
    for (const skillName of ['mas', 'mag', 'rca', 'opl-meta-agent']) {
      assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', skillName, 'SKILL.md')), true);
    }
    const previousStateDir = process.env.OPL_STATE_DIR;
    process.env.OPL_STATE_DIR = path.join(homeRoot, 'opl-state');
    try {
      const receipts = listManagedInstallUpdateReceipts({ module_id: 'oplmetaagent' });
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].surface_kind, 'opl_managed_module_install_update_receipt');
      assert.equal(receipts[0].repo_name, 'opl-meta-agent');
      assert.equal(receipts[0].action, 'install');
      assert.equal(receipts[0].install_origin_after, 'managed_root');
      assert.equal(receipts[0].skill_sync_status, 'completed');
      assert.equal(receipts[0].skill_sync_domain, 'oplmetaagent');
      assert.equal(receipts[0].health_check_status, 'completed');
      assert.equal(receipts[0].authority_boundary.can_write_domain_truth, false);
      assert.equal(receipts[0].authority_boundary.can_claim_production_ready, false);
    } finally {
      if (previousStateDir === undefined) {
        delete process.env.OPL_STATE_DIR;
      } else {
        process.env.OPL_STATE_DIR = previousStateDir;
      }
    }
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(magRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(rcaRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(metaRemote.fixtureRoot, { recursive: true, force: true });
  }
});

test('system startup-maintenance reports developer and dirty checkouts for manual review', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-manual-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const logPath = path.join(homeRoot, 'startup-maintenance.log');
  const masRemote = createDomainModuleRemote({
    repoName: 'med-autoscience',
    pluginName: 'mas',
    installerKind: 'bash',
    logPath,
  });
  const magRemote = createDomainModuleRemote({
    repoName: 'med-autogrant',
    pluginName: 'mag',
    installerKind: 'bash',
    logPath,
  });
  const rcaRemote = createDomainModuleRemote({
    repoName: 'redcube-ai',
    pluginName: 'rca',
    installerKind: 'node',
    logPath,
  });
  const metaRemote = createDomainModuleRemote({
    repoName: 'opl-meta-agent',
    pluginName: 'opl-meta-agent',
    installerKind: 'node',
    logPath,
  });
  const masDeveloperCheckout = path.join(homeRoot, 'developer-med-autoscience');

  try {
    runGitFixtureCommand(homeRoot, ['clone', masRemote.remoteRoot, masDeveloperCheckout]);
    const firstRun = runCli(['system', 'startup-maintenance'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_MODULES_ROOT: modulesRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULE_PATH_MEDAUTOSCIENCE: masDeveloperCheckout,
      OPL_MODULE_REPO_URL_MEDAUTOGRANT: magRemote.remoteRoot,
      OPL_MODULE_REPO_URL_REDCUBE: rcaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLMETAAGENT: metaRemote.remoteRoot,
      OPL_GIT_RETRY_ATTEMPTS: '1',
      ...{ OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' },
    }) as {
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
    assert.equal(firstRun.system_action.status, 'manual_required');
    assert.equal(firstTargets.get('medautoscience')?.status, 'manual_required');
    assert.equal(firstTargets.get('medautoscience')?.reason, 'developer_checkout_visible_not_app_managed');
    assert.equal(firstTargets.get('medautoscience')?.install_origin_before, 'env_override');

    fs.writeFileSync(path.join(modulesRoot, 'med-autogrant', 'LOCAL_EDIT.txt'), 'dirty\n', 'utf8');
    const secondRun = runCli(['system', 'startup-maintenance'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_MODULES_ROOT: modulesRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULE_PATH_MEDAUTOSCIENCE: masDeveloperCheckout,
      OPL_MODULE_REPO_URL_MEDAUTOGRANT: magRemote.remoteRoot,
      OPL_MODULE_REPO_URL_REDCUBE: rcaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLMETAAGENT: metaRemote.remoteRoot,
      OPL_GIT_RETRY_ATTEMPTS: '1',
      ...{ OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' },
    }) as {
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
    assert.equal(secondRun.system_action.details.summary.manual_required_targets_count, 2);
    assert.equal(secondTargets.get('medautoscience')?.reason, 'developer_checkout_visible_not_app_managed');
    assert.equal(secondTargets.get('medautogrant')?.reason, 'dirty_checkout');
    assert.equal(secondTargets.get('medautogrant')?.action, null);
    assert.equal(secondTargets.get('redcube')?.status, 'completed');
    assert.equal(secondTargets.get('oplmetaagent')?.status, 'completed');
    assert.equal(secondRun.system_action.details.managed_install_update_receipts.recorded_receipt_count, 2);
    assert.equal(
      secondRun.system_action.details.managed_install_update_receipts.receipt_refs.some(
        (ref) => ref.startsWith('opl://managed-install-update/oplmetaagent/update/'),
      ),
      true,
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(magRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(rcaRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(metaRemote.fixtureRoot, { recursive: true, force: true });
  }
});
