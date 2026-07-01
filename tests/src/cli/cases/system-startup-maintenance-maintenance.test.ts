import { execFileSync } from 'node:child_process';

import { assert, createFakeCodexFixture, fs, os, path, runCli, test } from '../helpers.ts';
import { runGitFixtureCommand } from '../helpers-parts/family-fixtures.ts';
import {
  createBookForgeGeneratedSurfaceRemote,
  createDomainModuleRemote,
  createOmaGeneratedSurfaceRemote,
  readPackageChannelMarker,
  withCliTimeout,
  writeStartupPackageChannelFixture,
} from './system-startup-maintenance-cases/shared.ts';
import type { StartupPackageChannelModuleFixture } from './system-startup-maintenance-cases/shared.ts';
import { scholarSkillsPackageFixture } from './system-startup-maintenance-fixtures.ts';

function writeMinimalFrameworkRoot(root: string, marker: string) {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'opl-framework-fixture', version: '0.0.0-fixture' }, null, 2),
    'utf8',
  );
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }, null, 2), 'utf8');
  fs.writeFileSync(path.join(root, 'src', 'cli.ts'), `export const marker = ${JSON.stringify(marker)};\n`, 'utf8');
  fs.writeFileSync(path.join(root, 'bin', 'opl'), '#!/usr/bin/env node\nconsole.log("opl fixture");\n', { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'MARKER.txt'), `${marker}\n`, 'utf8');
}

function sha256(filePath: string) {
  return execFileSync('shasum', ['-a', '256', filePath], { encoding: 'utf8' }).trim().split(/\s+/)[0];
}

test('system startup-maintenance applies OPL Framework runtime archive to a managed Linux Docker root', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-framework-archive-'));
  const targetRoot = path.join(homeRoot, 'data', 'opl', 'framework-current');
  const sourceParent = path.join(homeRoot, 'artifact-source');
  const sourceRoot = path.join(sourceParent, 'one-person-lab');
  const archivePath = path.join(homeRoot, 'one-person-lab-framework.tar.gz');
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.134.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    writeMinimalFrameworkRoot(targetRoot, 'old-framework');
    writeMinimalFrameworkRoot(sourceRoot, 'new-framework');
    execFileSync('tar', ['-czf', archivePath, '-C', sourceParent, 'one-person-lab']);

    const output = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance', '--scope', 'runtime_substrate'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_DATA_DIR: path.join(homeRoot, 'data'),
      OPL_STATE_DIR: path.join(homeRoot, 'data', 'opl', 'state'),
      OPL_FRAMEWORK_UPDATE_TARGET_ROOT: targetRoot,
      OPL_FRAMEWORK_UPDATE_ARCHIVE: archivePath,
      OPL_FRAMEWORK_UPDATE_ARCHIVE_SHA256: sha256(archivePath),
      OPL_FRAMEWORK_UPDATE_SKIP_DEPENDENCY_INSTALL: '1',
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    })) as {
      system_action: {
        status: string;
        details: {
          framework_summary: {
            completed_targets_count: number;
            manual_required_targets_count: number;
          };
          framework_targets: Array<{
            target_id: string;
            status: string;
            reason: string;
            result: {
              target_root: string;
              source_archive: string;
              previous_root: string;
              rollback_ref: string;
              metadata_ref: string;
            };
          }>;
        };
      };
    };

    assert.equal(output.system_action.status, 'completed');
    assert.equal(output.system_action.details.framework_summary.completed_targets_count, 1);
    assert.equal(output.system_action.details.framework_summary.manual_required_targets_count, 0);
    assert.equal(output.system_action.details.framework_targets[0].target_id, 'opl-framework');
    assert.equal(output.system_action.details.framework_targets[0].status, 'completed');
    assert.equal(output.system_action.details.framework_targets[0].reason, 'framework_runtime_artifact_applied');
    assert.equal(fs.readFileSync(path.join(targetRoot, 'MARKER.txt'), 'utf8'), 'new-framework\n');
    assert.equal(fs.readFileSync(path.join(`${targetRoot}.previous`, 'MARKER.txt'), 'utf8'), 'old-framework\n');
    assert.equal(output.system_action.details.framework_targets[0].result.target_root, targetRoot);
    assert.equal(output.system_action.details.framework_targets[0].result.source_archive, archivePath);
    assert.equal(output.system_action.details.framework_targets[0].result.previous_root, `${targetRoot}.previous`);
    assert.match(output.system_action.details.framework_targets[0].result.rollback_ref, /^opl:\/\/managed-update\/runtime_substrate\/framework\/rollback\//);
    const metadata = JSON.parse(fs.readFileSync(output.system_action.details.framework_targets[0].result.metadata_ref, 'utf8'));
    assert.equal(metadata.surface_kind, 'opl_framework_runtime_source');
    assert.equal(metadata.source_archive, archivePath);
    assert.equal(metadata.previous_root, `${targetRoot}.previous`);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('update rollback for runtime_substrate restores previous OPL Framework runtime root', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-substrate-framework-rollback-'));
  const targetRoot = path.join(homeRoot, 'data', 'opl', 'framework-current');
  const previousRoot = `${targetRoot}.previous`;
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.134.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    writeMinimalFrameworkRoot(targetRoot, 'new-framework');
    writeMinimalFrameworkRoot(previousRoot, 'old-framework');

    const output = withCliTimeout('120000', () => runCli(['update', 'rollback', '--component', 'runtime_substrate'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_DATA_DIR: path.join(homeRoot, 'data'),
      OPL_STATE_DIR: path.join(homeRoot, 'data', 'opl', 'state'),
      OPL_FRAMEWORK_UPDATE_TARGET_ROOT: targetRoot,
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    })) as {
      managed_update: {
        execution: {
          status: string;
          adapter_results: Array<{
            status: string;
            result: {
              framework_rollback: {
                status: string;
                reason: string;
                result: {
                  target_root: string;
                  rollback_root: string;
                };
              };
            };
          }>;
        };
        components: Array<{
          receipt: { verify_result: string; rollback_ref: string | null };
        }>;
      };
    };

    assert.equal(output.managed_update.execution.status, 'completed');
    assert.equal(output.managed_update.execution.adapter_results[0].status, 'completed');
    assert.equal(output.managed_update.execution.adapter_results[0].result.framework_rollback.status, 'completed');
    assert.equal(output.managed_update.execution.adapter_results[0].result.framework_rollback.reason, 'framework_runtime_rollback_completed');
    assert.equal(output.managed_update.execution.adapter_results[0].result.framework_rollback.result.target_root, targetRoot);
    assert.equal(output.managed_update.execution.adapter_results[0].result.framework_rollback.result.rollback_root, `${targetRoot}.rolled-back`);
    assert.equal(output.managed_update.components[0].receipt.verify_result, 'passed');
    assert.match(output.managed_update.components[0].receipt.rollback_ref ?? '', /^opl:\/\/managed-update\/runtime_substrate\/rollback\//);
    assert.equal(fs.readFileSync(path.join(targetRoot, 'MARKER.txt'), 'utf8'), 'old-framework\n');
    assert.equal(fs.readFileSync(path.join(`${targetRoot}.rolled-back`, 'MARKER.txt'), 'utf8'), 'new-framework\n');
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system startup-maintenance refreshes Codex CLI before module maintenance when latest is newer', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-codex-home-'));
  const logPath = path.join(homeRoot, 'codex-update.log');
  const developerCheckout = path.join(homeRoot, 'developer-module-checkout');
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.130.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);
  const updateScript = path.join(homeRoot, 'update-codex.sh');
  fs.writeFileSync(
    updateScript,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `printf 'codex-update\\n' >> ${JSON.stringify(logPath)}`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  fs.mkdirSync(developerCheckout, { recursive: true });
  runGitFixtureCommand(developerCheckout, ['init', '--initial-branch', 'main']);
  fs.writeFileSync(path.join(developerCheckout, 'README.md'), '# Developer checkout\n', 'utf8');
  runGitFixtureCommand(developerCheckout, ['add', 'README.md']);
  runGitFixtureCommand(developerCheckout, [
    '-c',
    'user.name=OPL Test',
    '-c',
    'user.email=opl@example.test',
    'commit',
    '-m',
    'Initial developer checkout',
  ]);

  try {
    const output = runCli(['system', 'startup-maintenance'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      OPL_CODEX_UPDATE_COMMAND: updateScript,
      OPL_MODULE_PATH_MEDAUTOSCIENCE: developerCheckout,
      OPL_MODULE_PATH_MEDAUTOGRANT: developerCheckout,
      OPL_MODULE_PATH_REDCUBE: developerCheckout,
      OPL_MODULE_PATH_OPLMETAAGENT: developerCheckout,
      OPL_MODULE_PATH_SCHOLARSKILLS: developerCheckout,
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
      ...{ OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' },
    }) as {
      system_action: {
        details: {
          engine_targets: Array<{
            target_id: string;
            status: string;
            reason: string;
            action: string | null;
          }>;
          engine_summary: {
            completed_targets_count: number;
            manual_required_targets_count: number;
          };
        };
      };
    };

    assert.deepEqual(output.system_action.details.engine_targets.map((target) => [
      target.target_id,
      target.status,
      target.reason,
      target.action,
    ]), [
      ['codex', 'completed', 'codex_cli_latest_outdated', 'update'],
    ]);
    assert.equal(output.system_action.details.engine_summary.completed_targets_count, 1);
    assert.equal(output.system_action.details.engine_summary.manual_required_targets_count, 0);
    assert.equal(fs.readFileSync(logPath, 'utf8'), 'codex-update\n');
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system startup-maintenance silently updates package-channel modules and syncs skill plugins', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-package-channel-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const moduleFixtures = (versionLabel: string): StartupPackageChannelModuleFixture[] => [
    {
      moduleId: 'medautoscience' as const,
      repoName: 'med-autoscience' as const,
      sourceHeadSha: `mas-${versionLabel}-sha`,
      files: {
        'plugins/mas/.codex-plugin/plugin.json': JSON.stringify({ name: 'mas', skills: './skills/' }, null, 2),
        'plugins/mas/skills/mas/SKILL.md': `---\nname: mas\ndescription: MAS ${versionLabel}.\n---\n\n# MAS ${versionLabel}\n`,
        'scripts/install-codex-plugin.sh': '#!/usr/bin/env bash\nset -euo pipefail\nprintf \'{"plugin":"mas","sync":"ok"}\\n\'\n',
      },
    },
    {
      moduleId: 'medautogrant' as const,
      repoName: 'med-autogrant' as const,
      sourceHeadSha: `mag-${versionLabel}-sha`,
      files: {
        'plugins/mag/.codex-plugin/plugin.json': JSON.stringify({ name: 'mag', skills: './skills/' }, null, 2),
        'plugins/mag/skills/mag/SKILL.md': `---\nname: mag\ndescription: MAG ${versionLabel}.\n---\n\n# MAG ${versionLabel}\n`,
        'scripts/install-codex-plugin.sh': '#!/usr/bin/env bash\nset -euo pipefail\nprintf \'{"plugin":"mag","sync":"ok"}\\n\'\n',
      },
    },
    {
      moduleId: 'redcube' as const,
      repoName: 'redcube-ai' as const,
      sourceHeadSha: `rca-${versionLabel}-sha`,
      files: {
        'plugins/rca/.codex-plugin/plugin.json': JSON.stringify({ name: 'rca', skills: './skills/' }, null, 2),
        'plugins/rca/skills/rca/SKILL.md': `---\nname: rca\ndescription: RCA ${versionLabel}.\n---\n\n# RCA ${versionLabel}\n`,
        'scripts/install-codex-plugin.mjs': 'console.log(JSON.stringify({ plugin: "rca", sync: "ok" }));\n',
      },
    },
    {
      moduleId: 'oplmetaagent' as const,
      repoName: 'opl-meta-agent' as const,
      sourceHeadSha: `oma-${versionLabel}-sha`,
      files: {
        'agent/interfaces/generated-interface-bundle.json': JSON.stringify({
          generated_interface_bundle_version: 1,
          plugin_manifest: {
            name: 'opl-meta-agent',
            skills: './skills/',
          },
          skill: {
            id: 'opl-meta-agent',
            frontmatter: {
              name: 'opl-meta-agent',
              description: `OMA ${versionLabel}.`,
            },
            body_markdown: `# OMA ${versionLabel}\n`,
          },
        }, null, 2),
        'scripts/verify.sh': '#!/usr/bin/env bash\nset -euo pipefail\ntest "${1:-}" = "fast"\n',
      },
    },
    {
      moduleId: 'oplbookforge' as const,
      repoName: 'opl-bookforge' as const,
      sourceHeadSha: `bookforge-${versionLabel}-sha`,
      files: {
        'agent/skills/book-production.md': `# Book Production ${versionLabel}\n`,
        'contracts/domain_descriptor.json': JSON.stringify({
          surface_kind: 'domain_agent_descriptor',
          schema_version: 1,
          domain_id: 'opl-bookforge',
          domain_label: 'OPL Book Forge',
        }, null, 2),
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
      assert.match(marker.package_channel_lifecycle.rollback_ref ?? '', new RegExp(`^opl://managed-module-package-channel/${moduleId}/rollback/`));
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

test('system startup-maintenance installs OMA managed root when only a sibling checkout is visible', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-oma-sibling-home-'));
  const workspaceRoot = path.join(homeRoot, 'workspace');
  const onePersonLabRoot = path.join(workspaceRoot, 'one-person-lab');
  const siblingCheckout = path.join(workspaceRoot, 'opl-meta-agent');
  const stateRoot = path.join(homeRoot, 'opl-state');
  const modulesRoot = path.join(stateRoot, 'modules');
  const logPath = path.join(homeRoot, 'startup-maintenance-oma.log');
  const omaHealthcheckLogPath = path.join(homeRoot, 'oma-healthcheck.log');
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
  const metaRemote = createOmaGeneratedSurfaceRemote({
    logPath,
    healthcheckLogPath: omaHealthcheckLogPath,
  });
  const bookForgeRemote = createBookForgeGeneratedSurfaceRemote({
    logPath,
  });
  const scholarSkillsChannel = writeStartupPackageChannelFixture({
    root: path.join(homeRoot, 'scholarskills-channel'),
    version: '26.6.10-nightly',
    modules: [scholarSkillsPackageFixture('v1')],
  });

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
      PATH: `${scholarSkillsChannel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
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
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(magRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(rcaRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(metaRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(bookForgeRemote.fixtureRoot, { recursive: true, force: true });
  }
});

test('system startup-maintenance does not block all modules on a timed-out module health check', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-timeout-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const logPath = path.join(homeRoot, 'startup-maintenance-timeout.log');
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
  const metaRemote = createOmaGeneratedSurfaceRemote({
    logPath,
  });
  const bookForgeRemote = createBookForgeGeneratedSurfaceRemote({
    logPath,
  });
  const scholarSkillsChannel = writeStartupPackageChannelFixture({
    root: path.join(homeRoot, 'scholarskills-channel'),
    version: '26.6.10-nightly',
    modules: [scholarSkillsPackageFixture('v1')],
  });

  try {
    fs.writeFileSync(
      path.join(masRemote.sourceRoot, 'scripts', 'opl-module-healthcheck.sh'),
      [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf 'mas-health-start\\n' >> ${JSON.stringify(logPath)}`,
        'sleep 5',
        `printf 'mas-health-finished\\n' >> ${JSON.stringify(logPath)}`,
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
    runGitFixtureCommand(masRemote.sourceRoot, ['add', 'scripts/opl-module-healthcheck.sh']);
    runGitFixtureCommand(masRemote.sourceRoot, ['commit', '-m', 'slow mas healthcheck']);
    runGitFixtureCommand(masRemote.sourceRoot, ['push', 'origin', 'main']);

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
    const masTarget = targets.get('medautoscience');
    assert.equal(output.system_action.status, 'manual_required');
    assert.equal(output.system_action.details.summary.manual_required_targets_count, 1);
    assert.equal(output.system_action.details.summary.completed_targets_count, 4);
    assert.equal(masTarget?.status, 'manual_required');
    assert.equal(masTarget?.reason, 'module_health_check_blocked');
    assert.equal(masTarget?.result.turnkey.health_check.status, 'blocked');
    assert.equal(masTarget?.result.turnkey.health_check.result.blocker_kind, 'module_action_step_timeout');
    assert.equal(masTarget?.result.turnkey.health_check.result.timeout_ms, 100);
    assert.equal(
      masTarget?.result.turnkey.health_check.result.authority_boundary.can_claim_module_healthy,
      false,
    );
    assert.equal(
      masTarget?.result.turnkey.health_check.result.authority_boundary.can_claim_production_ready,
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
    fs.rmSync(masRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(magRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(rcaRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(metaRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(bookForgeRemote.fixtureRoot, { recursive: true, force: true });
  }
});

test('system startup-maintenance syncs explicit developer checkouts and reports dirty managed checkouts', () => {
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
  const metaRemote = createOmaGeneratedSurfaceRemote({
    logPath,
  });
  const bookForgeRemote = createBookForgeGeneratedSurfaceRemote({
    logPath,
  });
  const scholarSkillsChannel = writeStartupPackageChannelFixture({
    root: path.join(homeRoot, 'scholarskills-channel'),
    version: '26.6.10-nightly',
    modules: [scholarSkillsPackageFixture('v1')],
  });
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
      PATH: `${scholarSkillsChannel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
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
      PATH: `${scholarSkillsChannel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
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
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(magRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(rcaRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(metaRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(bookForgeRemote.fixtureRoot, { recursive: true, force: true });
  }
});
