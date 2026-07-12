import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

import { createGitModuleRemoteFixture, fs, parseJsonText, path } from '../../helpers.ts';
import { runGitFixtureCommand } from '../../helpers-parts/family-fixtures.ts';
import {
  writeFakeBookForgeGeneratedSurfacePack,
  writeFakeOmaGeneratedSurfacePack,
} from '../../../cli-codex-default-shell-helpers.ts';

const PACKAGE_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.package.source.v1+gzip';
const CHANNEL_MANIFEST_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.release.channel-manifest.v1+json';

function sha256(filePath: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function packageIdForModule(moduleId: string) {
  return ({
    medautoscience: 'mas',
    medautogrant: 'mag',
    redcube: 'rca',
    oplmetaagent: 'oma',
    oplbookforge: 'obf',
    scholarskills: 'mas-scholar-skills',
  } as Record<string, string>)[moduleId] ?? moduleId;
}

export function readPackageChannelMarker(checkoutPath: string) {
  return parseJsonText(fs.readFileSync(path.join(checkoutPath, 'opl-runtime-module.json'), 'utf8')) as {
    package_channel_lifecycle: {
      staged: { root: string; status: string };
      current: { root: string; source_git_head_sha: string | null };
      previous: { root: string; source_git_head_sha: string | null } | null;
      rollback_ref: string | null;
    };
  };
}

export function withCliTimeout<T>(timeoutMs: string, fn: () => T): T {
  const previous = process.env.OPL_CLI_TEST_TIMEOUT_MS;
  process.env.OPL_CLI_TEST_TIMEOUT_MS = timeoutMs;
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.OPL_CLI_TEST_TIMEOUT_MS;
    } else {
      process.env.OPL_CLI_TEST_TIMEOUT_MS = previous;
    }
  }
}

export function createDomainModuleRemote(input: {
  repoName: string;
  pluginName: 'med-autoscience' | 'med-autogrant' | 'redcube-ai' | 'opl-meta-agent' | 'opl-bookforge';
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
          `printf '${input.pluginName}-skill-sync\n' >> ${JSON.stringify(input.logPath)}`,
          `printf '%s\n' '{"plugin":"${input.pluginName}","sync":"ok"}'`,
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
          `fs.appendFileSync(${JSON.stringify(input.logPath)}, '${input.pluginName}-skill-sync\n');`,
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
      'agent/primary_skill/SKILL.md': [
        '---',
        `name: ${input.pluginName}`,
        `description: Use ${input.pluginName.toUpperCase()} through its OPL-managed product entry.`,
        '---',
        '',
        `# ${input.pluginName.toUpperCase()} Skill`,
        '',
      ].join('\n'),
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
        `printf '${input.pluginName}-bootstrap\n' >> ${JSON.stringify(input.logPath)}`,
        '',
      ].join('\n'),
      'scripts/opl-module-healthcheck.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf '${input.pluginName}-health\n' >> ${JSON.stringify(input.logPath)}`,
        '',
      ].join('\n'),
      ...installScript,
    },
  });
}

export function createScholarSkillsRemote() {
  return createGitModuleRemoteFixture('mas-scholar-skills', {
    extraFiles: {
      ...scholarSkillsPluginFixtureFiles('startup-maintenance-managed-source'),
      'contracts/scholar-skills-capability-modules.json': JSON.stringify({
        fixture: 'startup-maintenance-managed-source',
      }, null, 2),
      'docs/README.md': '# ScholarSkills fixture docs\n',
      'gallery/medical-display/gallery_snapshot.json': '{"fixture":true}\n',
      'gallery/medical-display/assets/heavy.png': 'not copied\n',
      'outputs/intermediate.json': '{}\n',
    },
  });
}

export function scholarSkillsPluginFixtureFiles(fixture: string) {
  return {
    '.codex-plugin/plugin.json': JSON.stringify({
      name: 'mas-scholar-skills',
      skills: './skills/',
    }, null, 2),
    'skills/mas-scholar-skills/SKILL.md': [
      '---',
      'name: mas-scholar-skills',
      'description: Route professional capability tasks through the external package.',
      '---',
      '',
      '# MAS Scholar Skills',
      '',
      `Fixture: ${fixture}`,
      '',
    ].join('\n'),
    'skills/example-specialist/SKILL.md': [
      '---',
      'name: example-specialist',
      'description: External package-owned specialist fixture.',
      '---',
      '',
      '# Example Specialist',
      '',
    ].join('\n'),
  };
}

export function createOmaGeneratedSurfaceRemote(input: {
  logPath: string;
  healthcheckLogPath?: string;
}) {
  const remote = createGitModuleRemoteFixture('opl-meta-agent', {
    extraFiles: {
      'scripts/opl-module-bootstrap.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf 'opl-meta-agent-bootstrap\n' >> ${JSON.stringify(input.logPath)}`,
        '',
      ].join('\n'),
      'scripts/verify.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        input.healthcheckLogPath
          ? `printf '%s\n' "$1" > ${JSON.stringify(input.healthcheckLogPath)}`
          : `printf 'opl-meta-agent-health\n' >> ${JSON.stringify(input.logPath)}`,
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
  runGitFixtureCommand(remote.sourceRoot, ['add', 'agent', 'contracts', 'runtime', 'plugins']);
  runGitFixtureCommand(remote.sourceRoot, ['commit', '-m', 'Add OMA generated surface contract pack']);
  runGitFixtureCommand(remote.sourceRoot, ['push', 'origin', 'main']);
  return remote;
}

export function createBookForgeGeneratedSurfaceRemote(input: {
  logPath: string;
  healthcheckLogPath?: string;
}) {
  const remote = createGitModuleRemoteFixture('opl-bookforge', {
    extraFiles: {
      'scripts/opl-module-bootstrap.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf 'opl-bookforge-bootstrap\n' >> ${JSON.stringify(input.logPath)}`,
        '',
      ].join('\n'),
      'scripts/verify.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        input.healthcheckLogPath
          ? `printf '%s\n' "$1" > ${JSON.stringify(input.healthcheckLogPath)}`
          : `printf 'opl-bookforge-health\n' >> ${JSON.stringify(input.logPath)}`,
        'test "${1:-}" = "fast"',
        '',
      ].join('\n'),
    },
    executableFiles: [
      'scripts/opl-module-bootstrap.sh',
      'scripts/verify.sh',
    ],
  });
  writeFakeBookForgeGeneratedSurfacePack(remote.sourceRoot);
  runGitFixtureCommand(remote.sourceRoot, ['add', 'agent', 'contracts', 'plugins']);
  runGitFixtureCommand(remote.sourceRoot, ['commit', '-m', 'Add Book Forge generated surface contract pack']);
  runGitFixtureCommand(remote.sourceRoot, ['push', 'origin', 'main']);
  return remote;
}

export function createStartupDomainModuleRemotes(input: {
  logPath: string;
  omaHealthcheckLogPath?: string;
  bookForgeHealthcheckLogPath?: string;
}) {
  return {
    masRemote: createDomainModuleRemote({
      repoName: 'med-autoscience',
      pluginName: 'med-autoscience',
      installerKind: 'bash',
      logPath: input.logPath,
    }),
    magRemote: createDomainModuleRemote({
      repoName: 'med-autogrant',
      pluginName: 'med-autogrant',
      installerKind: 'bash',
      logPath: input.logPath,
    }),
    rcaRemote: createDomainModuleRemote({
      repoName: 'redcube-ai',
      pluginName: 'redcube-ai',
      installerKind: 'node',
      logPath: input.logPath,
    }),
    metaRemote: createOmaGeneratedSurfaceRemote({
      logPath: input.logPath,
      healthcheckLogPath: input.omaHealthcheckLogPath,
    }),
    bookForgeRemote: createBookForgeGeneratedSurfaceRemote({
      logPath: input.logPath,
      healthcheckLogPath: input.bookForgeHealthcheckLogPath,
    }),
  };
}

export function removeStartupDomainModuleRemotes(remotes: ReturnType<typeof createStartupDomainModuleRemotes>) {
  for (const remote of Object.values(remotes)) {
    fs.rmSync(remote.fixtureRoot, { recursive: true, force: true });
  }
}

export function writeStartupPackageChannelFixture(input: {
  root: string;
  version: string;
  modules: Array<{
    moduleId: 'medautoscience' | 'medautogrant' | 'redcube' | 'oplmetaagent' | 'oplbookforge' | 'scholarskills';
    repoName: 'med-autoscience' | 'med-autogrant' | 'redcube-ai' | 'opl-meta-agent' | 'opl-bookforge' | 'mas-scholar-skills';
    sourceHeadSha: string;
    files: Record<string, string>;
  }>;
}) {
  const blobRoot = path.join(input.root, 'blobs');
  const fakeBin = path.join(input.root, 'bin');
  const sourceRoot = path.join(input.root, 'source');
  const packageEntries: Record<string, Record<string, unknown>> = {};
  const manifests: Record<string, Record<string, unknown>> = {};
  const blobsByDigest: Record<string, string> = {};
  const curlLogPath = path.join(input.root, 'curl.jsonl');

  fs.mkdirSync(blobRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });

  for (const module of input.modules) {
    const moduleSourceRoot = path.join(sourceRoot, module.repoName);
    fs.mkdirSync(moduleSourceRoot, { recursive: true });
    fs.writeFileSync(path.join(moduleSourceRoot, 'README.md'), `${module.repoName} ${input.version}\n`, 'utf8');
    const moduleFiles = withStandardPrimarySkillCarrierFiles(module.repoName, module.files);
    for (const [relativePath, contents] of Object.entries(moduleFiles)) {
      const targetPath = path.join(moduleSourceRoot, relativePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, contents, 'utf8');
    }

    const archivePath = path.join(input.root, `${module.repoName}-${input.version}.tar.gz`);
    execFileSync('tar', ['-czf', archivePath, module.repoName], {
      cwd: sourceRoot,
    });
    const archiveDigest = sha256(archivePath);
    const packageId = packageIdForModule(module.moduleId);
    packageEntries[packageId] = {
      package_id: packageId,
      selected_version: input.version,
      versions: [{
        package_version: input.version,
        selection_status: 'selected_for_release_set',
        source_artifact_ref: `ghcr.io/owner/one-person-lab-packages/${packageId}:${input.version}`,
        artifact_digest: `sha256:${'a'.repeat(64)}`,
        artifact_status: 'published_immutable',
        package_content_digest: `sha256:${archiveDigest}`,
        owner_source_commit: module.sourceHeadSha,
      }],
    };
    manifests[`owner/one-person-lab-packages/${packageId}`] = {
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      layers: [
        {
          mediaType: PACKAGE_LAYER_MEDIA_TYPE,
          digest: `sha256:${archiveDigest}`,
          annotations: {
            'org.opencontainers.image.title': `dist/opl-packages/packages/${packageId}/${packageId}-${input.version}.tar.gz`,
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
      release_set_generation: input.version,
      package_catalog_surface_kind: 'opl_package_catalog.v1',
      packages: {
        package_catalog: packageEntries,
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

export type StartupPackageChannelModuleFixture = Parameters<typeof writeStartupPackageChannelFixture>[0]['modules'][number];
