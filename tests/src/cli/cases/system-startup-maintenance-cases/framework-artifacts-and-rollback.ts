import { execFileSync } from 'node:child_process';

import { assert, createFakeCodexFixture, fs, os, path, runCli, test } from '../../helpers.ts';
import { withCliTimeout } from './shared.ts';

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

function writeFakeFrameworkChannel(input: { root: string; version: string; archivePath: string; archiveSha256: string }) {
  const fakeBin = path.join(input.root, 'bin');
  const blobRoot = path.join(input.root, 'blobs');
  const curlLogPath = path.join(input.root, 'curl.jsonl');
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.mkdirSync(blobRoot, { recursive: true });
  const channelManifestPath = path.join(blobRoot, 'opl-channel-manifest.json');
  fs.writeFileSync(channelManifestPath, JSON.stringify({
    manifest_version: 1,
    opl_version: input.version,
    packages: {
      framework_core: {
        artifact: `ghcr.io/owner/one-person-lab-framework:${input.version}`,
        source_archive: { sha256: input.archiveSha256 },
        source_git: { head_sha: 'f'.repeat(40) },
      },
      modules: {},
    },
  }), 'utf8');
  const channelDigest = `sha256:${sha256(channelManifestPath)}`;
  const archiveDigest = `sha256:${input.archiveSha256}`;
  const manifests = {
    'owner/one-person-lab-manifest': {
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      layers: [{
        mediaType: 'application/vnd.onepersonlab.release.channel-manifest.v1+json',
        digest: channelDigest,
        annotations: { 'org.opencontainers.image.title': 'dist/opl-packages/opl-channel-manifest.json' },
      }],
    },
    'owner/one-person-lab-framework': {
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      layers: [{
        mediaType: 'application/vnd.onepersonlab.framework.source.v1+gzip',
        digest: archiveDigest,
        annotations: { 'org.opencontainers.image.title': `dist/opl-packages/framework/one-person-lab-framework-${input.version}.tar.gz` },
      }],
    },
  };
  const blobsByDigest = {
    [channelDigest]: channelManifestPath,
    [archiveDigest]: input.archivePath,
  };
  fs.writeFileSync(path.join(fakeBin, 'curl'), [
    `#!${process.execPath}`,
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
  ].join('\n'), { mode: 0o755 });
  return { fakeBin, curlLogPath };
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
    assert.match(output.system_action.details.framework_targets[0].result.rollback_ref, /^opl:\/\/managed-update\/runtime_substrate\/framework\/rollback\//); // reuse-first: allow owner-routed runtime materializer assertion.
    const metadata = JSON.parse(fs.readFileSync(output.system_action.details.framework_targets[0].result.metadata_ref, 'utf8')); // reuse-first: allow local test fixture metadata parser.
    assert.equal(metadata.surface_kind, 'opl_framework_runtime_source');
    assert.equal(metadata.source_archive, archivePath);
    assert.equal(metadata.previous_root, `${targetRoot}.previous`);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system startup-maintenance applies OPL Framework runtime artifact from package channel', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-framework-channel-'));
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
    writeMinimalFrameworkRoot(sourceRoot, 'new-channel-framework');
    execFileSync('tar', ['-czf', archivePath, '-C', sourceParent, 'one-person-lab']);
    const channel = writeFakeFrameworkChannel({
      root: path.join(homeRoot, 'channel'),
      version: '26.7.9',
      archivePath,
      archiveSha256: sha256(archivePath),
    });

    const output = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance', '--scope', 'runtime_substrate'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_DATA_DIR: path.join(homeRoot, 'data'),
      OPL_STATE_DIR: path.join(homeRoot, 'data', 'opl', 'state'),
      OPL_FRAMEWORK_UPDATE_TARGET_ROOT: targetRoot,
      OPL_FRAMEWORK_UPDATE_SKIP_DEPENDENCY_INSTALL: '1',
      OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/owner/one-person-lab-manifest:26.7.9',
      OPL_CURL_BIN: path.join(channel.fakeBin, 'curl'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      PATH: `${channel.fakeBin}${path.delimiter}${codexFixture.fixtureRoot}${path.delimiter}/usr/bin:/bin`,
    })) as {
      system_action: {
        status: string;
        details: {
          framework_targets: Array<{
            status: string;
            reason: string;
            result: {
              source_archive_sha256: string;
              source_head_sha: string;
            };
          }>;
        };
      };
    };

    assert.equal(output.system_action.status, 'completed');
    assert.equal(output.system_action.details.framework_targets[0].status, 'completed');
    assert.equal(output.system_action.details.framework_targets[0].reason, 'framework_runtime_artifact_applied');
    assert.equal(output.system_action.details.framework_targets[0].result.source_head_sha, 'f'.repeat(40));
    assert.equal(fs.readFileSync(path.join(targetRoot, 'MARKER.txt'), 'utf8'), 'new-channel-framework\n');
    const curlLog = fs.readFileSync(channel.curlLogPath, 'utf8');
    assert.match(curlLog, /one-person-lab-manifest/);
    assert.match(curlLog, /one-person-lab-framework/);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system startup-maintenance applies package channel framework artifact into Docker data managed root by default', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-framework-docker-data-'));
  const dataRoot = path.join(homeRoot, 'data');
  const expectedTargetRoot = path.join(dataRoot, 'opl', 'framework');
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
    writeMinimalFrameworkRoot(sourceRoot, 'new-docker-data-framework');
    execFileSync('tar', ['-czf', archivePath, '-C', sourceParent, 'one-person-lab']);
    const channel = writeFakeFrameworkChannel({
      root: path.join(homeRoot, 'channel'),
      version: '26.7.10',
      archivePath,
      archiveSha256: sha256(archivePath),
    });

    const output = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance', '--scope', 'runtime_substrate'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_DATA_DIR: dataRoot,
      OPL_FRAMEWORK_UPDATE_SKIP_DEPENDENCY_INSTALL: '1',
      OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/owner/one-person-lab-manifest:26.7.10',
      OPL_CURL_BIN: path.join(channel.fakeBin, 'curl'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      PATH: `${channel.fakeBin}${path.delimiter}${codexFixture.fixtureRoot}${path.delimiter}/usr/bin:/bin`,
    })) as {
      system_action: {
        status: string;
        details: {
          framework_summary: {
            completed_targets_count: number;
            manual_required_targets_count: number;
          };
          framework_targets: Array<{
            status: string;
            reason: string;
            result: {
              target_root: string;
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
    assert.equal(output.system_action.details.framework_targets[0].status, 'completed');
    assert.equal(output.system_action.details.framework_targets[0].reason, 'framework_runtime_artifact_applied');
    assert.equal(output.system_action.details.framework_targets[0].result.target_root, expectedTargetRoot);
    assert.equal(output.system_action.details.framework_targets[0].result.previous_root, `${expectedTargetRoot}.previous`);
    assert.match(output.system_action.details.framework_targets[0].result.rollback_ref, /^opl:\/\/managed-update\/runtime_substrate\/framework\/rollback\//); // reuse-first: allow owner-routed runtime materializer assertion.
    assert.equal(fs.readFileSync(path.join(expectedTargetRoot, 'MARKER.txt'), 'utf8'), 'new-docker-data-framework\n');
    assert.equal(fs.existsSync(path.join(`${expectedTargetRoot}.previous`, 'package.json')), true);
    assert.equal(fs.existsSync(path.join(expectedTargetRoot, '.git')), false);
    const metadata = JSON.parse(fs.readFileSync(output.system_action.details.framework_targets[0].result.metadata_ref, 'utf8')); // reuse-first: allow local test fixture metadata parser.
    assert.equal(metadata.source_head_sha, 'f'.repeat(40));
    assert.equal(metadata.previous_root, `${expectedTargetRoot}.previous`);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('OPL Base rollback restores the previous OPL Framework runtime root', () => { // reuse-first: allow owner-routed runtime materializer assertion.
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-substrate-framework-rollback-')); // reuse-first: allow owner-routed runtime materializer fixture.
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

    const output = withCliTimeout('120000', () => runCli(['update', 'rollback'], {
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
    assert.match(output.managed_update.components[0].receipt.rollback_ref ?? '', /^opl:\/\/managed-update\/opl_base\/rollback\//); // reuse-first: allow owner-routed runtime materializer assertion.
    assert.equal(fs.readFileSync(path.join(targetRoot, 'MARKER.txt'), 'utf8'), 'old-framework\n');
    assert.equal(fs.readFileSync(path.join(`${targetRoot}.rolled-back`, 'MARKER.txt'), 'utf8'), 'new-framework\n');
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
