import { assert, fs, os, path, runCli, test } from '../../helpers.ts';
import {
  readPackageChannelMarker,
  withCliTimeout,
  writeStartupPackageChannelFixture,
} from './shared.ts';
import type { StartupPackageChannelModuleFixture } from './shared.ts';
import { scholarSkillsPackageFixture } from '../system-startup-maintenance-fixtures.ts';

test('system startup-maintenance silently updates package-channel modules and syncs skill plugins', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-package-channel-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const moduleFixtures = (versionLabel: string): StartupPackageChannelModuleFixture[] => [
    {
      moduleId: 'medautoscience' as const,
      repoName: 'med-autoscience' as const,
      sourceHeadSha: `mas-${versionLabel}-sha`,
      files: {
        'plugins/med-autoscience/.codex-plugin/plugin.json': JSON.stringify({ name: 'med-autoscience', skills: './skills/' }, null, 2),
        'plugins/med-autoscience/skills/med-autoscience/SKILL.md': `---\nname: med-autoscience\ndescription: MAS ${versionLabel}.\n---\n\n# MAS ${versionLabel}\n`,
        'scripts/install-codex-plugin.sh': '#!/usr/bin/env bash\nset -euo pipefail\nprintf \'{"plugin":"mas","sync":"ok"}\\n\'\n',
      },
    },
    {
      moduleId: 'medautogrant' as const,
      repoName: 'med-autogrant' as const,
      sourceHeadSha: `mag-${versionLabel}-sha`,
      files: {
        'plugins/med-autogrant/.codex-plugin/plugin.json': JSON.stringify({ name: 'med-autogrant', skills: './skills/' }, null, 2),
        'plugins/med-autogrant/skills/med-autogrant/SKILL.md': `---\nname: med-autogrant\ndescription: MAG ${versionLabel}.\n---\n\n# MAG ${versionLabel}\n`,
        'scripts/install-codex-plugin.sh': '#!/usr/bin/env bash\nset -euo pipefail\nprintf \'{"plugin":"mag","sync":"ok"}\\n\'\n',
      },
    },
    {
      moduleId: 'redcube' as const,
      repoName: 'redcube-ai' as const,
      sourceHeadSha: `rca-${versionLabel}-sha`,
      files: {
        'plugins/redcube-ai/.codex-plugin/plugin.json': JSON.stringify({ name: 'redcube-ai', skills: './skills/' }, null, 2),
        'plugins/redcube-ai/skills/redcube-ai/SKILL.md': `---\nname: redcube-ai\ndescription: RCA ${versionLabel}.\n---\n\n# RCA ${versionLabel}\n`,
        'scripts/install-codex-plugin.mjs': 'console.log(JSON.stringify({ plugin: "rca", sync: "ok" }));\n',
      },
    },
    {
      moduleId: 'oplmetaagent' as const,
      repoName: 'opl-meta-agent' as const,
      sourceHeadSha: `oma-${versionLabel}-sha`,
      files: {
        'plugins/opl-meta-agent/.codex-plugin/plugin.json': JSON.stringify({ name: 'opl-meta-agent', skills: './skills/' }, null, 2),
        'plugins/opl-meta-agent/skills/opl-meta-agent/SKILL.md': `---\nname: opl-meta-agent\ndescription: OMA ${versionLabel}.\n---\n\n# OMA ${versionLabel}\n`,
        'scripts/verify.sh': '#!/usr/bin/env bash\nset -euo pipefail\ntest "${1:-}" = "fast"\n',
      },
    },
    {
      moduleId: 'oplbookforge' as const,
      repoName: 'opl-bookforge' as const,
      sourceHeadSha: `bookforge-${versionLabel}-sha`,
      files: {
        'plugins/opl-bookforge/.codex-plugin/plugin.json': JSON.stringify({ name: 'opl-bookforge', skills: './skills/' }, null, 2),
        'plugins/opl-bookforge/skills/opl-bookforge/SKILL.md': `---\nname: opl-bookforge\ndescription: OPL Book Forge ${versionLabel}.\n---\n\n# OPL Book Forge ${versionLabel}\n`,
        'scripts/verify.sh': '#!/usr/bin/env bash\nset -euo pipefail\ntest "${1:-}" = "smoke"\n',
      },
    },
    scholarSkillsPackageFixture(versionLabel),
  ];
  const firstChannel = writeStartupPackageChannelFixture({
    root: path.join(homeRoot, 'channel-v1'),
    version: '26.6.10-nightly',
    modules: moduleFixtures('v1'),
  });
  const secondChannel = writeStartupPackageChannelFixture({
    root: path.join(homeRoot, 'channel-v2'),
    version: '26.6.11-nightly',
    modules: moduleFixtures('v2'),
  });

  try {
    for (const moduleId of ['medautoscience', 'medautogrant', 'redcube', 'oplmetaagent', 'oplbookforge']) {
      runCli(['connect', 'install', '--module', moduleId], {
        HOME: homeRoot,
        CODEX_HOME: path.join(homeRoot, 'codex-home'),
        OPL_MODULES_ROOT: modulesRoot,
        OPL_PACKAGES_OWNER: 'owner',
        OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/owner/one-person-lab-manifest:26.6.10-nightly',
        OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
        PATH: `${firstChannel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      });
    }

    const output = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_MODULES_ROOT: modulesRoot,
      OPL_PACKAGES_OWNER: 'owner',
      OPL_RELEASE_VERSION: '26.6.3',
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      PATH: `${secondChannel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    })) as {
      system_action: {
        status: string;
        details: {
          summary: {
            completed_targets_count: number;
            manual_required_targets_count: number;
          };
          module_targets: Array<{
            target_id: string;
            status: string;
            reason: string;
            action: string | null;
            git_before: { sync_status: string; head_sha: string | null } | null;
            result: {
              module: {
                git: { head_sha: string | null } | null;
                source_policy: { configured_by: string; package_channel_auto_update: boolean };
              };
              turnkey: {
                skill_sync: { status: string };
                health_check: { status: string; result: { package_channel?: boolean } };
              };
            };
          }>;
          managed_install_update_receipts: {
            recorded_receipt_count: number;
            receipt_refs: string[];
          };
          plugin_cache_freshness: {
            status: string;
            synced_domain_packs_count: number;
          };
          restart_reload_prompt: {
            required: boolean;
            affected_domains: string[];
          };
        };
      };
    };

    assert.equal(output.system_action.status, 'completed');
    assert.equal(output.system_action.details.summary.completed_targets_count, 5);
    assert.equal(output.system_action.details.summary.manual_required_targets_count, 0);
    assert.equal(output.system_action.details.managed_install_update_receipts.recorded_receipt_count, 5);
    assert.equal(output.system_action.details.plugin_cache_freshness.status, 'freshened');
    assert.equal(output.system_action.details.plugin_cache_freshness.synced_domain_packs_count, 5);
    assert.equal(output.system_action.details.restart_reload_prompt.required, true);
    assert.deepEqual(output.system_action.details.restart_reload_prompt.affected_domains, [
      'medautoscience',
      'medautogrant',
      'redcube',
      'oplmetaagent',
      'oplbookforge',
    ]);

    const targets = new Map(output.system_action.details.module_targets.map((target) => [target.target_id, target]));
    for (const [moduleId, headSha] of [
      ['medautoscience', 'mas-v2-sha'],
      ['medautogrant', 'mag-v2-sha'],
      ['redcube', 'rca-v2-sha'],
      ['oplmetaagent', 'oma-v2-sha'],
      ['oplbookforge', 'bookforge-v2-sha'],
    ] as const) {
      const target = targets.get(moduleId);
      assert.equal(target?.status, 'completed');
      assert.equal(target?.reason, 'capability_packages_refresh');
      assert.equal(target?.action, 'update');
      assert.equal(target?.git_before?.sync_status, 'no_upstream');
      assert.equal(target?.result.module.git?.head_sha, headSha);
      assert.equal(target?.result.module.source_policy.configured_by, 'agent_latest_package_channel');
      assert.equal(target?.result.module.source_policy.package_channel_auto_update, true);
      assert.equal(target?.result.turnkey.skill_sync.status, 'completed');
      assert.equal(target?.result.turnkey.health_check.status, 'completed');
      assert.equal(target?.result.turnkey.health_check.result.package_channel, true);
      assert.equal(
        output.system_action.details.managed_install_update_receipts.receipt_refs.some(
          (ref) => ref.startsWith(`opl://managed-install-update/${moduleId}/update/`),
        ),
        true,
      );
    }
    for (const [moduleId, repoName, currentHeadSha, previousHeadSha] of [
      ['medautoscience', 'med-autoscience', 'mas-v2-sha', 'mas-v1-sha'],
      ['medautogrant', 'med-autogrant', 'mag-v2-sha', 'mag-v1-sha'],
      ['redcube', 'redcube-ai', 'rca-v2-sha', 'rca-v1-sha'],
      ['oplmetaagent', 'opl-meta-agent', 'oma-v2-sha', 'oma-v1-sha'],
      ['oplbookforge', 'opl-bookforge', 'bookforge-v2-sha', 'bookforge-v1-sha'],
    ] as const) {
      const managedCheckout = path.join(modulesRoot, repoName);
      const marker = readPackageChannelMarker(managedCheckout);
      assert.equal(marker.package_channel_lifecycle.staged.root, `${managedCheckout}.stage`);
      assert.equal(marker.package_channel_lifecycle.staged.status, 'activated');
      assert.equal(marker.package_channel_lifecycle.current.source_git_head_sha, currentHeadSha);
      assert.equal(marker.package_channel_lifecycle.previous?.root, `${managedCheckout}.previous`);
      assert.equal(marker.package_channel_lifecycle.previous?.source_git_head_sha, previousHeadSha);
      assert.match(marker.package_channel_lifecycle.rollback_ref ?? '', new RegExp(`^opl://managed-module-package-channel/${moduleId}/rollback/`)); // reuse-first: allow package-channel contract fixture assertion.
      assert.equal(fs.readFileSync(path.join(managedCheckout, 'README.md'), 'utf8'), `${repoName} 26.6.11-nightly\n`);
      assert.equal(fs.readFileSync(path.join(`${managedCheckout}.previous`, 'README.md'), 'utf8'), `${repoName} 26.6.10-nightly\n`);
      assert.equal(fs.existsSync(`${managedCheckout}.stage`), false);
    }

    const curlLog = fs.readFileSync(secondChannel.curlLogPath, 'utf8');
    assert.match(curlLog, /one-person-lab-manifest\/manifests\/latest/);
    assert.doesNotMatch(curlLog, /one-person-lab-manifest\/manifests\/26\.6\.3/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
