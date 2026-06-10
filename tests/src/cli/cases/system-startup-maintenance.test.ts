import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

import { assert, createFakeCodexFixture, createGitModuleRemoteFixture, fs, os, path, runCli, test } from '../helpers.ts';
import { runGitFixtureCommand } from '../helpers-parts/family-fixtures.ts';
import { listManagedInstallUpdateReceipts } from '../../../../src/managed-install-update-ledger.ts';
import { writeFakeOmaGeneratedSurfacePack } from '../../cli-codex-default-shell-helpers.ts';

const MODULE_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.module.source.v1+gzip';
const CHANNEL_MANIFEST_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.release.channel-manifest.v1+json';

function sha256(filePath: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

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
          'REPO_ROOT="$PWD"',
          'while (($#)); do',
          '  case "$1" in',
          '    --repo-root)',
          '      REPO_ROOT="$2"',
          '      shift 2',
          '      ;;',
          '    *)',
          '      shift',
          '      ;;',
          '  esac',
          'done',
          'mkdir -p "${REPO_ROOT}/.agents/plugins"',
          `cat >"\${REPO_ROOT}/.agents/plugins/marketplace.json" <<'EOF_MARKETPLACE_${input.pluginName}'`,
          JSON.stringify({
            name: `${input.pluginName}-local`,
            interface: {
              displayName: `${input.pluginName.toUpperCase()} Local`,
            },
            plugins: [
              {
                name: input.pluginName,
                source: {
                  source: 'local',
                  path: `./plugins/${input.pluginName}`,
                },
                policy: {
                  installation: 'AVAILABLE',
                  authentication: 'ON_INSTALL',
                },
                category: 'Productivity',
              },
            ],
          }, null, 2),
          `EOF_MARKETPLACE_${input.pluginName}`,
          `printf '${input.pluginName}-skill-sync\\n' >> ${JSON.stringify(input.logPath)}`,
          `printf '%s\\n' '{"plugin":"${input.pluginName}","sync":"ok"}'`,
          '',
        ].join('\n'),
      }
      : {
        'scripts/install-codex-plugin.mjs': [
          `import path from 'node:path';`,
          `import fs from 'node:fs';`,
          `let repoRoot = process.cwd();`,
          `const args = process.argv.slice(2);`,
          `for (let index = 0; index < args.length; index += 1) {`,
          `  if (args[index] === '--repo-root' && args[index + 1]) {`,
          `    repoRoot = path.resolve(args[index + 1]);`,
          `    index += 1;`,
          `  }`,
          `}`,
          `fs.mkdirSync(path.join(repoRoot, '.agents', 'plugins'), { recursive: true });`,
          `fs.writeFileSync(path.join(repoRoot, '.agents', 'plugins', 'marketplace.json'), ${JSON.stringify(JSON.stringify({
            name: `${input.pluginName}-local`,
            interface: {
              displayName: `${input.pluginName.toUpperCase()} Local`,
            },
            plugins: [
              {
                name: input.pluginName,
                source: {
                  source: 'local',
                  path: `./plugins/${input.pluginName}`,
                },
                policy: {
                  installation: 'AVAILABLE',
                  authentication: 'ON_INSTALL',
                },
                category: 'Productivity',
              },
            ],
          }, null, 2) + '\n')}, 'utf8');`,
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

function createOmaGeneratedSurfaceRemote(input: {
  logPath: string;
  healthcheckLogPath?: string;
}) {
  const remote = createGitModuleRemoteFixture('opl-meta-agent', {
    extraFiles: {
      'scripts/opl-module-bootstrap.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf 'opl-meta-agent-bootstrap\\n' >> ${JSON.stringify(input.logPath)}`,
        '',
      ].join('\n'),
      'scripts/verify.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        input.healthcheckLogPath
          ? `printf '%s\\n' "$1" > ${JSON.stringify(input.healthcheckLogPath)}`
          : `printf 'opl-meta-agent-health\\n' >> ${JSON.stringify(input.logPath)}`,
        'test "${1:-}" = "smoke"',
        '',
      ].join('\n'),
    },
    executableFiles: [
      'scripts/opl-module-bootstrap.sh',
      'scripts/verify.sh',
    ],
  });
  writeFakeOmaGeneratedSurfacePack(remote.sourceRoot);
  runGitFixtureCommand(remote.sourceRoot, ['add', 'agent', 'contracts', 'runtime']);
  runGitFixtureCommand(remote.sourceRoot, ['commit', '-m', 'Add OMA generated surface contract pack']);
  runGitFixtureCommand(remote.sourceRoot, ['push', 'origin', 'main']);
  return remote;
}

function writeStartupPackageChannelFixture(input: {
  root: string;
  version: string;
  modules: Array<{
    moduleId: 'medautoscience' | 'medautogrant' | 'redcube' | 'oplmetaagent';
    repoName: 'med-autoscience' | 'med-autogrant' | 'redcube-ai' | 'opl-meta-agent';
    sourceHeadSha: string;
    files: Record<string, string>;
  }>;
}) {
  const blobRoot = path.join(input.root, 'blobs');
  const fakeBin = path.join(input.root, 'bin');
  const sourceRoot = path.join(input.root, 'source');
  const moduleEntries: Record<string, Record<string, unknown>> = {};
  const manifests: Record<string, Record<string, unknown>> = {};
  const blobsByDigest: Record<string, string> = {};
  const curlLogPath = path.join(input.root, 'curl.jsonl');

  fs.mkdirSync(blobRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });

  for (const module of input.modules) {
    const moduleSourceRoot = path.join(sourceRoot, module.repoName);
    fs.mkdirSync(moduleSourceRoot, { recursive: true });
    fs.writeFileSync(path.join(moduleSourceRoot, 'README.md'), `${module.repoName} ${input.version}\n`, 'utf8');
    for (const [relativePath, contents] of Object.entries(module.files)) {
      const targetPath = path.join(moduleSourceRoot, relativePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, contents, 'utf8');
    }

    const archivePath = path.join(input.root, `${module.repoName}-${input.version}.tar.gz`);
    execFileSync('tar', ['-czf', archivePath, module.repoName], {
      cwd: sourceRoot,
    });
    const archiveDigest = sha256(archivePath);
    moduleEntries[module.moduleId] = {
      module_id: module.moduleId,
      repo_name: module.repoName,
      artifact: `ghcr.io/owner/one-person-lab-modules/${module.repoName}:${input.version}`,
      source_archive: {
        sha256: archiveDigest,
      },
      source_git: {
        head_sha: module.sourceHeadSha,
      },
    };
    manifests[`owner/one-person-lab-modules/${module.repoName}`] = {
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      layers: [
        {
          mediaType: MODULE_LAYER_MEDIA_TYPE,
          digest: `sha256:${archiveDigest}`,
          annotations: {
            'org.opencontainers.image.title': `dist/opl-packages/modules/${module.repoName}-${input.version}.tar.gz`,
          },
        },
      ],
    };
    blobsByDigest[`sha256:${archiveDigest}`] = archivePath;
  }

  const channelManifestPath = path.join(blobRoot, 'channel-manifest.json');
  fs.writeFileSync(
    channelManifestPath,
    JSON.stringify({
      manifest_version: 1,
      opl_version: input.version,
      packages: {
        modules: moduleEntries,
      },
    }),
    'utf8',
  );
  const channelDigest = sha256(channelManifestPath);
  manifests['owner/one-person-lab-manifest'] = {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    layers: [
      {
        mediaType: CHANNEL_MANIFEST_LAYER_MEDIA_TYPE,
        digest: `sha256:${channelDigest}`,
        annotations: {
          'org.opencontainers.image.title': 'dist/opl-packages/opl-channel-manifest.json',
        },
      },
    ],
  };
  blobsByDigest[`sha256:${channelDigest}`] = channelManifestPath;

  fs.writeFileSync(
    path.join(fakeBin, 'curl'),
    [
      '#!/usr/bin/env node',
      "const fs = require('node:fs');",
      "const args = process.argv.slice(2);",
      `fs.appendFileSync(${JSON.stringify(curlLogPath)}, JSON.stringify(args) + '\\n');`,
      "const url = args.find((arg) => arg.startsWith('http://') || arg.startsWith('https://')) || '';",
      "if (url.includes('/token?')) { process.stdout.write(JSON.stringify({ token: 'fixture-token' })); process.exit(0); }",
      `const manifests = ${JSON.stringify(manifests)};`,
      `const blobsByDigest = ${JSON.stringify(blobsByDigest)};`,
      "if (url.includes('/manifests/')) {",
      "  const match = url.match(/\\/v2\\/(.+)\\/manifests\\//);",
      "  const repo = match ? match[1] : '';",
      "  if (!manifests[repo]) process.exit(22);",
      "  process.stdout.write(JSON.stringify(manifests[repo]));",
      "  process.exit(0);",
      "}",
      "if (url.includes('/blobs/')) {",
      "  const outIndex = args.indexOf('-o');",
      "  if (outIndex < 0) process.exit(2);",
      "  const digest = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1));",
      "  if (!blobsByDigest[digest]) process.exit(22);",
      "  fs.copyFileSync(blobsByDigest[digest], args[outIndex + 1]);",
      "  process.exit(0);",
      "}",
      "process.exit(22);",
    ].join('\n'),
    { mode: 0o755 },
  );

  return {
    fakeBin,
    curlLogPath,
  };
}

type StartupPackageChannelModuleFixture = Parameters<typeof writeStartupPackageChannelFixture>[0]['modules'][number];

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
  const metaRemote = createOmaGeneratedSurfaceRemote({
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
          framework_targets: Array<{
            target_id: string;
            status: string;
            reason: string;
          }>;
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
    assert.deepEqual(output.system_action.details.framework_targets.map((target) => [
      target.target_id,
      target.status,
      target.reason,
    ]), [
      ['opl-framework', 'skipped', 'framework_update_source_not_configured'],
    ]);
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
      'mas-health',
      'mag-bootstrap',
      'mag-health',
      'rca-bootstrap',
      'rca-health',
      'opl-meta-agent-bootstrap',
      'opl-meta-agent-health',
    ]);
    for (const skillName of ['mas', 'mag', 'rca']) {
      assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', skillName, 'SKILL.md')), false);
    }
    assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', 'opl-meta-agent', 'SKILL.md')), false);
    assert.equal(
      fs.existsSync(path.join(
        homeRoot,
        'opl-state',
        'generated-codex-plugins',
        'opl-meta-agent-local',
        'plugins',
        'opl-meta-agent',
        '.codex-plugin',
        'plugin.json',
      )),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(
        homeRoot,
        'opl-state',
        'generated-codex-plugins',
        'opl-meta-agent-local',
        'plugins',
        'opl-meta-agent',
        'skills',
        'opl-meta-agent',
        'SKILL.md',
      )),
      true,
    );
    const codexConfig = fs.readFileSync(path.join(homeRoot, 'codex-home', 'config.toml'), 'utf8');
    assert.match(codexConfig, /\[plugins\."opl-meta-agent@opl-meta-agent-local"\]/);
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
        'scripts/verify.sh': '#!/usr/bin/env bash\nset -euo pipefail\ntest "${1:-}" = "smoke"\n',
      },
    },
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
    for (const moduleId of ['medautoscience', 'medautogrant', 'redcube', 'oplmetaagent']) {
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

    const output = runCli(['system', 'startup-maintenance'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_MODULES_ROOT: modulesRoot,
      OPL_PACKAGES_OWNER: 'owner',
      OPL_RELEASE_VERSION: '26.6.3',
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      PATH: `${secondChannel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    }) as {
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
    assert.equal(output.system_action.details.summary.completed_targets_count, 4);
    assert.equal(output.system_action.details.summary.manual_required_targets_count, 0);
    assert.equal(output.system_action.details.managed_install_update_receipts.recorded_receipt_count, 4);
    assert.equal(output.system_action.details.plugin_cache_freshness.status, 'freshened');
    assert.equal(output.system_action.details.plugin_cache_freshness.synced_domain_packs_count, 4);
    assert.equal(output.system_action.details.restart_reload_prompt.required, true);
    assert.deepEqual(output.system_action.details.restart_reload_prompt.affected_domains, [
      'medautoscience',
      'medautogrant',
      'redcube',
      'oplmetaagent',
    ]);

    const targets = new Map(output.system_action.details.module_targets.map((target) => [target.target_id, target]));
    for (const [moduleId, headSha] of [
      ['medautoscience', 'mas-v2-sha'],
      ['medautogrant', 'mag-v2-sha'],
      ['redcube', 'rca-v2-sha'],
      ['oplmetaagent', 'oma-v2-sha'],
    ] as const) {
      const target = targets.get(moduleId);
      assert.equal(target?.status, 'completed');
      assert.equal(target?.reason, 'agent_package_channel_refresh');
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

  try {
    fs.mkdirSync(onePersonLabRoot, { recursive: true });
    runGitFixtureCommand(workspaceRoot, ['clone', metaRemote.remoteRoot, siblingCheckout]);
    fs.writeFileSync(path.join(siblingCheckout, 'LOCAL_EDIT.txt'), 'dirty sibling\n', 'utf8');

    const output = runCli(['system', 'startup-maintenance'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: masRemote.remoteRoot,
      OPL_MODULE_REPO_URL_MEDAUTOGRANT: magRemote.remoteRoot,
      OPL_MODULE_REPO_URL_REDCUBE: rcaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLMETAAGENT: metaRemote.remoteRoot,
      OPL_STATE_DIR: stateRoot,
      OPL_DEVELOPER_MODE_GH_FIXTURE: JSON.stringify({ login: 'ordinary-user' }),
      OPL_GIT_RETRY_ATTEMPTS: '1',
      ...{ OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' },
    }) as {
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

    const output = runCli(['system', 'startup-maintenance'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_MODULES_ROOT: modulesRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: masRemote.remoteRoot,
      OPL_MODULE_REPO_URL_MEDAUTOGRANT: magRemote.remoteRoot,
      OPL_MODULE_REPO_URL_REDCUBE: rcaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLMETAAGENT: metaRemote.remoteRoot,
      OPL_MODULE_ACTION_STEP_TIMEOUT_MS: '100',
      OPL_GIT_RETRY_ATTEMPTS: '1',
      ...{ OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' },
    }) as {
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
    assert.equal(output.system_action.details.summary.completed_targets_count, 3);
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
    assert.equal(output.system_action.details.managed_install_update_receipts.status, 'recorded');
    assert.equal(output.system_action.details.managed_install_update_receipts.recorded_receipt_count, 3);
    assert.equal(
      output.system_action.details.managed_install_update_receipts.receipt_refs.some(
        (ref) => ref.startsWith('opl://managed-install-update/oplmetaagent/install/'),
      ),
      true,
    );
    assert.equal(output.system_action.details.plugin_cache_freshness.status, 'freshened');
    assert.equal(output.system_action.details.plugin_cache_freshness.synced_domain_packs_count, 4);
    assert.equal(fs.readFileSync(logPath, 'utf8').includes('opl-meta-agent-health'), true);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(magRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(rcaRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(metaRemote.fixtureRoot, { recursive: true, force: true });
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
    assert.equal(firstRun.system_action.status, 'completed');
    assert.equal(firstTargets.get('medautoscience')?.status, 'completed');
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
    assert.equal(secondRun.system_action.details.summary.manual_required_targets_count, 1);
    assert.equal(secondTargets.get('medautoscience')?.status, 'completed');
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

test('system startup-maintenance uses auto Developer Mode sibling checkouts for domain plugin sync', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-devmode-home-'));
  const workspaceRoot = path.join(homeRoot, 'workspace');
  const onePersonLabRoot = path.join(workspaceRoot, 'one-person-lab');
  const logPath = path.join(homeRoot, 'startup-maintenance-devmode.log');
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
  const siblingCheckouts = {
    medautoscience: path.join(workspaceRoot, 'med-autoscience'),
    medautogrant: path.join(workspaceRoot, 'med-autogrant'),
    redcube: path.join(workspaceRoot, 'redcube-ai'),
    oplmetaagent: path.join(workspaceRoot, 'opl-meta-agent'),
  };

  try {
    fs.mkdirSync(onePersonLabRoot, { recursive: true });
    runGitFixtureCommand(workspaceRoot, ['clone', masRemote.remoteRoot, siblingCheckouts.medautoscience]);
    runGitFixtureCommand(workspaceRoot, ['clone', magRemote.remoteRoot, siblingCheckouts.medautogrant]);
    runGitFixtureCommand(workspaceRoot, ['clone', rcaRemote.remoteRoot, siblingCheckouts.redcube]);
    runGitFixtureCommand(workspaceRoot, ['clone', metaRemote.remoteRoot, siblingCheckouts.oplmetaagent]);

    const output = runCli(['system', 'startup-maintenance'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_DEVELOPER_MODE_GH_FIXTURE: JSON.stringify({
        login: 'gaofeng21cn',
        permissions: {
          'gaofeng21cn/one-person-lab': 'admin',
          'gaofeng21cn/med-autoscience': 'admin',
          'gaofeng21cn/med-autogrant': 'admin',
          'gaofeng21cn/redcube-ai': 'admin',
          'gaofeng21cn/opl-meta-agent': 'admin',
        },
      }),
      OPL_GIT_RETRY_ATTEMPTS: '1',
      ...{ OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' },
    }) as {
      system_action: {
        status: string;
        details: {
          summary: {
            completed_targets_count: number;
            manual_required_targets_count: number;
          };
          managed_install_update_receipts: {
            recorded_receipt_count: number;
          };
          module_targets: Array<{
            target_id: keyof typeof siblingCheckouts;
            status: string;
            reason: string;
            action: string | null;
            install_origin_before: string;
            result: {
              module: {
                install_origin: string;
                checkout_path: string;
                managed_checkout_path: string;
                source_policy: {
                  configured_by: string;
                  effective_install_update_source: string;
                };
              };
              turnkey: {
                bootstrap: { status: string };
                skill_sync: { status: string };
                health_check: { status: string };
              };
            };
          }>;
          plugin_cache_freshness: {
            status: string;
            synced_domain_packs_count: number;
          };
          restart_reload_prompt: {
            required: boolean;
          };
        };
      };
    };

    assert.equal(output.system_action.status, 'completed');
    assert.equal(output.system_action.details.summary.completed_targets_count, 4);
    assert.equal(output.system_action.details.summary.manual_required_targets_count, 0);
    assert.equal(output.system_action.details.managed_install_update_receipts.recorded_receipt_count, 0);
    assert.equal(output.system_action.details.plugin_cache_freshness.status, 'freshened');
    assert.equal(output.system_action.details.plugin_cache_freshness.synced_domain_packs_count, 4);
    assert.equal(output.system_action.details.restart_reload_prompt.required, true);

    for (const target of output.system_action.details.module_targets) {
      assert.equal(target.status, 'completed');
      assert.equal(target.reason, 'developer_checkout_visible_not_app_managed');
      assert.equal(target.action, 'sync');
      assert.equal(target.install_origin_before, 'sibling_workspace');
      assert.equal(target.result.module.install_origin, 'sibling_workspace');
      assert.equal(target.result.module.checkout_path, siblingCheckouts[target.target_id]);
      assert.equal(target.result.module.source_policy.configured_by, 'developer_mode');
      assert.equal(target.result.module.source_policy.effective_install_update_source, 'git_checkout');
      assert.equal(target.result.turnkey.bootstrap.status, 'skipped');
      assert.equal(target.result.turnkey.skill_sync.status, 'completed');
      assert.equal(target.result.turnkey.health_check.status, 'completed');
    }

    assert.deepEqual(fs.readFileSync(logPath, 'utf8').trim().split('\n'), [
      'mas-health',
      'mag-health',
      'rca-health',
      'opl-meta-agent-health',
    ]);
    const codexConfig = fs.readFileSync(path.join(homeRoot, 'codex-home', 'config.toml'), 'utf8');
    for (const [moduleId, marketplaceId, pluginId] of [
      ['medautoscience', 'mas-local', 'mas'],
      ['medautogrant', 'mag-local', 'mag'],
      ['redcube', 'rca-local', 'rca'],
    ] as const) {
      const checkoutPath = siblingCheckouts[moduleId];
      const marketplaceRoot = path.join(homeRoot, 'opl-state', 'codex-plugin-marketplaces', marketplaceId);
      assert.equal(fs.existsSync(path.join(checkoutPath, '.agents', 'plugins', 'marketplace.json')), false);
      assert.equal(fs.existsSync(path.join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json')), true);
      assert.equal(
        fs.realpathSync(path.join(marketplaceRoot, 'plugins', pluginId)),
        fs.realpathSync(path.join(checkoutPath, 'plugins', pluginId)),
      );
      assert.match(codexConfig, new RegExp(`\\[marketplaces\\.${marketplaceId}\\]\\nsource_type = "local"\\nsource = "${marketplaceRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    }
    assert.match(codexConfig, /\[plugins\."opl-meta-agent@opl-meta-agent-local"\]/);
    assert.match(codexConfig, /codex-plugin-marketplaces\/opl-meta-agent-local/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(magRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(rcaRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(metaRemote.fixtureRoot, { recursive: true, force: true });
  }
});
