import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

import {
  assert,
  createGitModuleRemoteFixture,
  fs,
  os,
  parseJsonText,
  path,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';
import { rollbackManagedModulePackageChannel } from '../../../../src/modules/connect/system-installation/module-package-channel.ts';

const PACKAGE_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.package.source.v1+gzip';
const CHANNEL_MANIFEST_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.release.channel-manifest.v1+json';

const MAS_MODULE_SPEC = {
  module_id: 'medautoscience' as const,
  label: 'Med AutoScience',
  repo_name: 'med-autoscience',
  repo_url: 'https://github.com/gaofeng21cn/med-autoscience.git',
  scope: 'domain_module' as const,
  default_install: true,
  description: 'MAS package channel fixture.',
};

function sha256(filePath: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readPackageChannelMarker(checkoutPath: string) {
  return parseJsonText(fs.readFileSync(path.join(checkoutPath, 'opl-runtime-module.json'), 'utf8')) as {
    package_channel_lifecycle: {
      staged: { root: string; status: string };
      current: { root: string; source_git_head_sha: string | null };
      previous: { root: string; source_git_head_sha: string | null } | null;
      rollback_ref: string | null;
    };
  };
}

function writePackageChannelFixture(input: {
  root: string;
  moduleId: string;
  repoName: string;
  version: string;
  sourceHeadSha: string;
  sourceFiles?: Record<string, string>;
}) {
  const blobRoot = path.join(input.root, 'blobs');
  const fakeBin = path.join(input.root, 'bin');
  const sourceRoot = path.join(input.root, 'source', input.repoName);
  const archivePath = path.join(input.root, `${input.repoName}-${input.version}.tar.gz`);
  const channelManifestPath = path.join(blobRoot, 'channel-manifest.json');
  const curlLogPath = path.join(input.root, 'curl.jsonl');

  fs.mkdirSync(blobRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'README.md'), `${input.repoName} package fixture\n`, 'utf8');
  const sourceFiles = withStandardPrimarySkillCarrierFiles(input.repoName, input.sourceFiles ?? {});
  for (const [relativePath, contents] of Object.entries(sourceFiles)) {
    const targetPath = path.join(sourceRoot, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, contents, 'utf8');
  }

  execFileSync('tar', ['-czf', archivePath, input.repoName], {
    cwd: path.dirname(sourceRoot),
  });
  const archiveDigest = sha256(archivePath);

  const channelManifest = {
    manifest_version: 1,
    opl_version: input.version,
    package_catalog_surface_kind: 'opl_package_catalog.v1',
    packages: {
      package_catalog: {
        mas: {
          package_id: 'mas',
          latest_version: input.version,
          versions: [{
            package_version: input.version,
            module_id: input.moduleId,
            promotion_status: 'promoted',
            source_artifact_ref: `ghcr.io/owner/one-person-lab-packages/mas:${input.version}`,
            artifact_digest: `sha256:${'a'.repeat(64)}`,
            artifact_status: 'published_immutable',
            package_content_digest: `sha256:${archiveDigest}`,
            owner_source_commit: input.sourceHeadSha,
          }],
        },
      },
    },
  };
  fs.writeFileSync(channelManifestPath, JSON.stringify(channelManifest), 'utf8');
  const channelDigest = sha256(channelManifestPath);
  const manifests = {
    'owner/one-person-lab-manifest': {
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
    },
    'owner/one-person-lab-packages/mas': {
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      layers: [
        {
          mediaType: PACKAGE_LAYER_MEDIA_TYPE,
          digest: `sha256:${archiveDigest}`,
          annotations: {
            'org.opencontainers.image.title': `dist/opl-packages/packages/mas/mas-${input.version}.tar.gz`,
          },
        },
      ],
    },
  };
  const blobsByDigest = {
    [`sha256:${channelDigest}`]: channelManifestPath,
    [`sha256:${archiveDigest}`]: archivePath,
  };
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

function withStandardPrimarySkillCarrierFiles(repoName: string, files: Record<string, string>) {
  const pluginNameByRepo: Record<string, string> = {
    'med-autoscience': 'med-autoscience',
    'med-autogrant': 'med-autogrant',
    'redcube-ai': 'redcube-ai',
    'opl-meta-agent': 'opl-meta-agent',
    'opl-bookforge': 'opl-bookforge',
  };
  const pluginName = pluginNameByRepo[repoName];
  if (!pluginName || files['agent/primary_skill/SKILL.md']) {
    return files;
  }
  const carrierSkill = files[`plugins/${pluginName}/skills/${pluginName}/SKILL.md`];
  return carrierSkill
    ? {
        'agent/primary_skill/SKILL.md': carrierSkill,
        ...files,
      }
    : files;
}

test('managed module install and update consume the package channel by default', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-module-package-channel-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const managedCheckout = path.join(modulesRoot, 'med-autoscience');
  const firstChannel = writePackageChannelFixture({
    root: path.join(homeRoot, 'channel-v1'),
    moduleId: 'medautoscience',
    repoName: 'med-autoscience',
    version: '26.6.1',
    sourceHeadSha: 'package-channel-sha-v1',
    sourceFiles: {
      'README.md': 'med-autoscience package fixture v1\n',
      'plugins/med-autoscience/.codex-plugin/plugin.json': JSON.stringify({ name: 'med-autoscience', skills: './skills/' }, null, 2),
      'plugins/med-autoscience/skills/med-autoscience/SKILL.md': [
        '---',
        'name: med-autoscience',
        'description: MAS package channel fixture.',
        '---',
        '',
        '# MAS',
        '',
      ].join('\n'),
    },
  });
  const baseEnv = {
    HOME: homeRoot,
    CODEX_HOME: path.join(homeRoot, 'codex-home'),
    OPL_MODULES_ROOT: modulesRoot,
    OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/owner/one-person-lab-manifest:26.6.1',
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
    PATH: `${firstChannel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
  };

  try {
    const install = runCli(['connect', 'install', '--module', 'medautoscience'], baseEnv) as {
      module_action: {
        module: {
          module_id: string;
          installed: boolean;
          install_origin: string;
          checkout_path: string;
          git: { head_sha: string | null; sync_status: string } | null;
        };
        turnkey: {
          bootstrap: { status: string };
          skill_sync: { status: string; domain_id: string | null };
          health_check: { status: string; result: { packaged_runtime?: boolean; package_channel?: boolean } };
        };
      };
    };

    assert.equal(install.module_action.module.module_id, 'medautoscience');
    assert.equal(install.module_action.module.installed, true);
    assert.equal(install.module_action.module.install_origin, 'managed_root');
    assert.equal(install.module_action.module.checkout_path, managedCheckout);
    assert.equal(install.module_action.module.git?.head_sha, 'package-channel-sha-v1');
    assert.equal(install.module_action.module.git?.sync_status, 'no_upstream');
    assert.equal(install.module_action.turnkey.bootstrap.status, 'skipped');
    assert.equal(install.module_action.turnkey.skill_sync.status, 'completed');
    assert.equal(install.module_action.turnkey.skill_sync.domain_id, 'medautoscience');
    assert.equal(install.module_action.turnkey.health_check.status, 'completed');
    assert.equal(install.module_action.turnkey.health_check.result.packaged_runtime, false);
    assert.equal(install.module_action.turnkey.health_check.result.package_channel, true);
    assert.equal(fs.existsSync(path.join(managedCheckout, '.git')), false);
    assert.equal(fs.existsSync(path.join(managedCheckout, 'opl-runtime-module.json')), true);
    const installMarker = readPackageChannelMarker(managedCheckout);
    assert.equal(installMarker.package_channel_lifecycle.staged.root, `${managedCheckout}.stage`);
    assert.equal(installMarker.package_channel_lifecycle.staged.status, 'activated');
    assert.equal(installMarker.package_channel_lifecycle.current.root, managedCheckout);
    assert.equal(installMarker.package_channel_lifecycle.current.source_git_head_sha, 'package-channel-sha-v1');
    assert.equal(installMarker.package_channel_lifecycle.previous, null);
    assert.equal(installMarker.package_channel_lifecycle.rollback_ref, null);
    assert.equal(fs.existsSync(`${managedCheckout}.stage`), false);
    assert.equal(fs.existsSync(`${managedCheckout}.previous`), false);
    assert.match(fs.readFileSync(firstChannel.curlLogPath, 'utf8'), /one-person-lab-packages\/mas/);
    assert.doesNotMatch(fs.readFileSync(firstChannel.curlLogPath, 'utf8'), /one-person-lab-modules/);

    const secondChannel = writePackageChannelFixture({
      root: path.join(homeRoot, 'channel-v2'),
      moduleId: 'medautoscience',
      repoName: 'med-autoscience',
      version: '26.6.2',
      sourceHeadSha: 'package-channel-sha-v2',
      sourceFiles: {
        'README.md': 'med-autoscience package fixture v2\n',
        'plugins/med-autoscience/.codex-plugin/plugin.json': JSON.stringify({ name: 'med-autoscience', skills: './skills/' }, null, 2),
        'plugins/med-autoscience/skills/med-autoscience/SKILL.md': [
          '---',
          'name: med-autoscience',
          'description: MAS updated package channel fixture.',
          '---',
          '',
          '# MAS Updated',
          '',
        ].join('\n'),
      },
    });
    const update = runCli(['connect', 'update', '--module', 'medautoscience'], {
      ...baseEnv,
      PATH: `${secondChannel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/owner/one-person-lab-manifest:26.6.2',
    }) as {
      module_action: {
        module: {
          git: { head_sha: string | null } | null;
        };
        turnkey: {
          health_check: { status: string; result: { packaged_runtime?: boolean; package_channel?: boolean } };
        };
      };
    };

    assert.equal(update.module_action.module.git?.head_sha, 'package-channel-sha-v2');
    assert.equal(update.module_action.turnkey.health_check.status, 'completed');
    assert.equal(update.module_action.turnkey.health_check.result.packaged_runtime, false);
    assert.equal(update.module_action.turnkey.health_check.result.package_channel, true);
    assert.equal(fs.readFileSync(path.join(managedCheckout, 'README.md'), 'utf8'), 'med-autoscience package fixture v2\n');
    assert.equal(fs.readFileSync(path.join(`${managedCheckout}.previous`, 'README.md'), 'utf8'), 'med-autoscience package fixture v1\n');
    const updateMarker = readPackageChannelMarker(managedCheckout);
    assert.equal(updateMarker.package_channel_lifecycle.staged.root, `${managedCheckout}.stage`);
    assert.equal(updateMarker.package_channel_lifecycle.staged.status, 'activated');
    assert.equal(updateMarker.package_channel_lifecycle.current.root, managedCheckout);
    assert.equal(updateMarker.package_channel_lifecycle.current.source_git_head_sha, 'package-channel-sha-v2');
    assert.equal(updateMarker.package_channel_lifecycle.previous?.root, `${managedCheckout}.previous`);
    assert.equal(updateMarker.package_channel_lifecycle.previous?.source_git_head_sha, 'package-channel-sha-v1');
    assert.match(updateMarker.package_channel_lifecycle.rollback_ref ?? '', /^opl:\/\/managed-module-package-channel\/medautoscience\/rollback\//);
    assert.equal(fs.existsSync(`${managedCheckout}.stage`), false);
    assert.match(fs.readFileSync(secondChannel.curlLogPath, 'utf8'), /one-person-lab-manifest/);

    const rollback = rollbackManagedModulePackageChannel(MAS_MODULE_SPEC, managedCheckout);
    assert.equal(rollback.status, 'completed');
    assert.equal(rollback.module_id, 'medautoscience');
    assert.equal(rollback.current.source_git_head_sha, 'package-channel-sha-v1');
    assert.equal(rollback.previous?.source_git_head_sha, 'package-channel-sha-v2');
    assert.equal(fs.readFileSync(path.join(managedCheckout, 'README.md'), 'utf8'), 'med-autoscience package fixture v1\n');
    assert.equal(fs.readFileSync(path.join(`${managedCheckout}.previous`, 'README.md'), 'utf8'), 'med-autoscience package fixture v2\n');
    const rollbackMarker = readPackageChannelMarker(managedCheckout);
    assert.equal(rollbackMarker.package_channel_lifecycle.current.source_git_head_sha, 'package-channel-sha-v1');
    assert.equal(rollbackMarker.package_channel_lifecycle.previous?.source_git_head_sha, 'package-channel-sha-v2');
    assert.match(rollbackMarker.package_channel_lifecycle.rollback_ref ?? '', /^opl:\/\/managed-module-package-channel\/medautoscience\/rollback\//);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('managed package channel defaults to the latest-stable GHCR manifest independent of App release version', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-module-package-latest-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const channel = writePackageChannelFixture({
    root: path.join(homeRoot, 'channel-latest'),
    moduleId: 'medautoscience',
    repoName: 'med-autoscience',
    version: '26.6.11-nightly',
    sourceHeadSha: 'package-channel-latest-sha',
    sourceFiles: {
      'plugins/med-autoscience/.codex-plugin/plugin.json': JSON.stringify({ name: 'med-autoscience', skills: './skills/' }, null, 2),
      'plugins/med-autoscience/skills/med-autoscience/SKILL.md': [
        '---',
        'name: med-autoscience',
        'description: MAS latest package channel fixture.',
        '---',
        '',
        '# MAS Latest',
        '',
      ].join('\n'),
    },
  });

  try {
    const install = runCli(['connect', 'install', '--module', 'medautoscience'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_MODULES_ROOT: modulesRoot,
      OPL_PACKAGES_OWNER: 'owner',
      OPL_RELEASE_VERSION: '26.6.3',
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      PATH: `${channel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    }) as {
      module_action: {
        module: {
          git: { head_sha: string | null } | null;
          source_policy: {
            effective_install_update_source: string;
            configured_by: string;
            package_channel_auto_update: boolean;
          };
        };
        turnkey: {
          skill_sync: { status: string; domain_id: string | null };
          health_check: { status: string; result: { package_channel?: boolean } };
        };
      };
    };

    assert.equal(install.module_action.module.git?.head_sha, 'package-channel-latest-sha');
    assert.equal(install.module_action.module.source_policy.effective_install_update_source, 'package_channel');
    assert.equal(install.module_action.module.source_policy.configured_by, 'agent_latest_package_channel');
    assert.equal(install.module_action.module.source_policy.package_channel_auto_update, true);
    assert.equal(install.module_action.turnkey.skill_sync.status, 'completed');
    assert.equal(install.module_action.turnkey.skill_sync.domain_id, 'medautoscience');
    assert.equal(install.module_action.turnkey.health_check.status, 'completed');
    assert.equal(install.module_action.turnkey.health_check.result.package_channel, true);

    const curlLog = fs.readFileSync(channel.curlLogPath, 'utf8');
    assert.match(curlLog, /one-person-lab-manifest\/manifests\/latest-stable/);
    assert.doesNotMatch(curlLog, /one-person-lab-manifest\/manifests\/26\.6\.3/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('package-channel update refuses to overwrite a locally modified managed package root', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-module-package-dirty-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const managedCheckout = path.join(modulesRoot, 'med-autoscience');
  const firstChannel = writePackageChannelFixture({
    root: path.join(homeRoot, 'channel-v1'),
    moduleId: 'medautoscience',
    repoName: 'med-autoscience',
    version: '26.6.21',
    sourceHeadSha: 'package-channel-dirty-sha-v1',
    sourceFiles: {
      'README.md': 'clean package root\n',
    },
  });
  const secondChannel = writePackageChannelFixture({
    root: path.join(homeRoot, 'channel-v2'),
    moduleId: 'medautoscience',
    repoName: 'med-autoscience',
    version: '26.6.22',
    sourceHeadSha: 'package-channel-dirty-sha-v2',
    sourceFiles: {
      'README.md': 'replacement package root\n',
    },
  });
  const baseEnv = {
    HOME: homeRoot,
    CODEX_HOME: path.join(homeRoot, 'codex-home'),
    OPL_MODULES_ROOT: modulesRoot,
    OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/owner/one-person-lab-manifest:26.6.21',
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
    PATH: `${firstChannel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
  };

  try {
    runCli(['connect', 'install', '--module', 'medautoscience'], baseEnv);
    fs.writeFileSync(path.join(managedCheckout, 'LOCAL_EDIT.txt'), 'do not overwrite\n', 'utf8');

    const failure = runCliFailure(['connect', 'update', '--module', 'medautoscience'], {
      ...baseEnv,
      OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/owner/one-person-lab-manifest:26.6.22',
      PATH: `${secondChannel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    });

    assert.equal(failure.status, 2);
    assert.equal(failure.payload.error.code, 'cli_usage_error');
    assert.equal(failure.payload.error.details.module_id, 'medautoscience');
    assert.equal(fs.readFileSync(path.join(managedCheckout, 'README.md'), 'utf8'), 'clean package root\n');
    assert.equal(fs.readFileSync(path.join(managedCheckout, 'LOCAL_EDIT.txt'), 'utf8'), 'do not overwrite\n');
    assert.equal(fs.existsSync(`${managedCheckout}.previous`), false);
    assert.equal(fs.existsSync(`${managedCheckout}.stage`), false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('module-specific git checkout override bypasses the package channel', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-module-git-override-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const fakeChannel = writePackageChannelFixture({
    root: path.join(homeRoot, 'unused-channel'),
    moduleId: 'medautoscience',
    repoName: 'med-autoscience',
    version: '26.6.3',
    sourceHeadSha: 'unused-package-sha',
  });
  const medAutoScienceRemote = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'scripts/opl-module-bootstrap.sh': '#!/usr/bin/env bash\nset -euo pipefail\n',
      'scripts/opl-module-healthcheck.sh': '#!/usr/bin/env bash\nset -euo pipefail\n',
    },
  });
  const env = {
    HOME: homeRoot,
    CODEX_HOME: path.join(homeRoot, 'codex-home'),
    OPL_MODULES_ROOT: modulesRoot,
    OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: medAutoScienceRemote.remoteRoot,
    OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/owner/one-person-lab-manifest:26.6.3',
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
    PATH: `${fakeChannel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
  };

  try {
    const install = runCli(['connect', 'install', '--module', 'medautoscience'], env) as {
      module_action: {
        module: {
          install_origin: string;
          checkout_path: string;
          git: { head_sha: string | null } | null;
        };
      };
    };

    assert.equal(install.module_action.module.install_origin, 'managed_root');
    assert.equal(install.module_action.module.git?.head_sha, medAutoScienceRemote.getHeadSha());
    assert.equal(fs.existsSync(path.join(install.module_action.module.checkout_path, '.git')), true);
    assert.equal(fs.existsSync(fakeChannel.curlLogPath), false);
  } finally {
    fs.rmSync(medAutoScienceRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('Developer Mode git checkout source bypasses the package channel without raw env source mode', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-module-developer-source-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const stateDir = path.join(homeRoot, 'opl-state');
  const fakeChannel = writePackageChannelFixture({
    root: path.join(homeRoot, 'unused-channel'),
    moduleId: 'medautoscience',
    repoName: 'med-autoscience',
    version: '26.6.4',
    sourceHeadSha: 'unused-package-sha',
  });
  const gitConfigPath = path.join(homeRoot, 'gitconfig');
  const medAutoScienceRemote = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'scripts/opl-module-bootstrap.sh': '#!/usr/bin/env bash\nset -euo pipefail\n',
      'scripts/opl-module-healthcheck.sh': '#!/usr/bin/env bash\nset -euo pipefail\n',
    },
  });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'developer-supervisor.json'),
    JSON.stringify({
      version: 'g1',
      enabled: 'on',
      mode: 'developer_apply_safe',
      auto_enable_github_login: 'gaofeng21cn',
      updated_at: '2026-06-02T00:00:00.000Z',
    }),
    'utf8',
  );
  fs.writeFileSync(
    gitConfigPath,
    [
      `[url "${medAutoScienceRemote.remoteRoot}"]`,
      '\tinsteadOf = https://github.com/gaofeng21cn/med-autoscience.git',
      '',
    ].join('\n'),
    'utf8',
  );

  try {
    const install = runCli(['connect', 'install', '--module', 'medautoscience'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      GIT_CONFIG_GLOBAL: gitConfigPath,
      OPL_MODULES_ROOT: modulesRoot,
      OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/owner/one-person-lab-manifest:26.6.4',
      OPL_STATE_DIR: stateDir,
      PATH: `${fakeChannel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    }) as {
      module_action: {
        module: {
          install_origin: string;
          checkout_path: string;
          git: { head_sha: string | null } | null;
          source_policy: {
            effective_install_update_source: string;
            configured_by: string;
            package_channel_auto_update: boolean;
          };
        };
      };
    };

    assert.equal(install.module_action.module.install_origin, 'managed_root');
    assert.equal(install.module_action.module.git?.head_sha, medAutoScienceRemote.getHeadSha());
    assert.equal(install.module_action.module.source_policy.effective_install_update_source, 'git_checkout');
    assert.equal(install.module_action.module.source_policy.configured_by, 'developer_mode');
    assert.equal(install.module_action.module.source_policy.package_channel_auto_update, false);
    assert.equal(fs.existsSync(path.join(install.module_action.module.checkout_path, '.git')), true);
    assert.equal(fs.existsSync(fakeChannel.curlLogPath), false);
  } finally {
    fs.rmSync(medAutoScienceRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
