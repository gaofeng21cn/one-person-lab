import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

import { assert, fs, os, path, runCli, test } from '../../helpers.ts';
import { createCurrentCodexFixture, currentCodexEnvironment, withCliTimeout } from './shared.ts';
import {
  fetchFrameworkArtifactFromChannel,
  readFrameworkChannelEntry,
} from '../../../../../src/adapters/integration/system-installation/framework-self-update-parts/channel-artifact.ts';
import { readOplFrameworkRuntimeUpdateStatus, runOplFrameworkSelfUpdate } from '../../../../../src/adapters/integration/system-installation/framework-self-update.ts';

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

function writeRuntimeOnlyFrameworkRoot(root: string, marker: string) {
  fs.mkdirSync(path.join(root, 'dist', 'entrypoints'), { recursive: true });
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'opl-framework-fixture', version: '0.0.0-fixture', dependencies: {} }, null, 2),
    'utf8',
  );
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({
    name: 'opl-framework-fixture',
    version: '0.0.0-fixture',
    lockfileVersion: 3,
    packages: { '': { name: 'opl-framework-fixture', version: '0.0.0-fixture', dependencies: {} } },
  }, null, 2), 'utf8');
  fs.writeFileSync(path.join(root, 'dist', 'entrypoints', 'cli.js'), `export const marker = ${JSON.stringify(marker)};\n`, 'utf8');
  fs.writeFileSync(path.join(root, 'bin', 'opl'), '#!/usr/bin/env node\nconsole.log("opl fixture");\n', { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'MARKER.txt'), `${marker}\n`, 'utf8');
}

function sha256(filePath: string) {
  return execFileSync('shasum', ['-a', '256', filePath], { encoding: 'utf8' }).trim().split(/\s+/)[0];
}

function writeFakeFrameworkChannel(input: {
  root: string;
  version: string;
  archivePath: string;
  archiveSha256: string;
  artifactType?: string;
  duplicateSourceLayer?: boolean;
  failManifestWithArgs?: boolean;
  token?: string;
}) {
  const fakeBin = path.join(input.root, 'bin');
  const blobRoot = path.join(input.root, 'blobs');
  const curlLogPath = path.join(input.root, 'curl.jsonl');
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.mkdirSync(blobRoot, { recursive: true });
  const frameworkManifest = {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    artifactType: input.artifactType ?? 'application/vnd.onepersonlab.framework.v1',
    annotations: { "org.opencontainers.image.version": "0.2.0", "org.opencontainers.image.revision": "f".repeat(40) },
    layers: [{
      mediaType: 'application/vnd.onepersonlab.framework.source.v1+gzip',
      digest: `sha256:${input.archiveSha256}`,
      annotations: { 'org.opencontainers.image.title': 'dist/opl-packages/framework/one-person-lab-framework-0.2.0.tar.gz' },
    }],
  };
  if (input.duplicateSourceLayer) frameworkManifest.layers.push({ ...frameworkManifest.layers[0] });
  const frameworkManifestDigest = `sha256:${crypto.createHash('sha256')
    .update(JSON.stringify(frameworkManifest))
    .digest('hex')}`;
  const manifests = { 'owner/one-person-lab-framework': frameworkManifest };
  const blobsByDigest = { [`sha256:${input.archiveSha256}`]: input.archivePath };
  fs.writeFileSync(path.join(fakeBin, 'curl'), [
    `#!${process.execPath}`,
    "const fs = require('node:fs');",
    "const args = process.argv.slice(2);",
    `fs.appendFileSync(${JSON.stringify(curlLogPath)}, JSON.stringify(args) + '\\n');`,
    "const url = args.find((arg) => arg.startsWith('http://') || arg.startsWith('https://')) || '';",
    `if (url.includes('/token?')) { process.stdout.write(JSON.stringify({ token: ${JSON.stringify(input.token ?? 'fixture-token')} })); process.exit(0); }`,
    `const manifests = ${JSON.stringify(manifests)};`,
    `const blobsByDigest = ${JSON.stringify(blobsByDigest)};`,
    "if (url.includes('/manifests/')) {",
    `  if (${JSON.stringify(input.failManifestWithArgs === true)}) { process.stderr.write(JSON.stringify(args)); process.exit(22); }`,
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
  return { fakeBin, curlLogPath, frameworkManifestDigest };
}

test('Framework channel errors redact authorization headers and echoed credentials', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-channel-redaction-'));
  const archivePath = path.join(root, 'one-person-lab-framework.tar.gz');
  fs.writeFileSync(archivePath, 'framework archive\n');
  const channel = writeFakeFrameworkChannel({
    root: path.join(root, 'channel'),
    version: '26.8.5-redaction',
    archivePath,
    archiveSha256: sha256(archivePath),
    failManifestWithArgs: true,
    token: 'framework-secret-token',
  });
  const previous = {
    OPL_CURL_BIN: process.env.OPL_CURL_BIN,
    OPL_FRAMEWORK_ARTIFACT_REF: process.env.OPL_FRAMEWORK_ARTIFACT_REF,
  };
  process.env.OPL_CURL_BIN = path.join(channel.fakeBin, 'curl');
  process.env.OPL_FRAMEWORK_ARTIFACT_REF = 'ghcr.io/owner/one-person-lab-framework:26.8.5-redaction';
  try {
    assert.throws(
      () => readFrameworkChannelEntry(),
      (error: any) => {
        assert.equal(error.code, 'build_command_failed');
        assert.equal(error.details.command.includes('Authorization: <redacted>'), true);
        const serialized = JSON.stringify(error.details);
        assert.doesNotMatch(serialized, /framework-secret-token/);
        assert.match(serialized, /<redacted>/);
        return true;
      },
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Framework channel artifacts require and verify an immutable OCI manifest digest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-pinned-oci-'));
  const archivePath = path.join(root, 'one-person-lab-framework.tar.gz');
  fs.writeFileSync(archivePath, 'framework archive\n');
  const channel = writeFakeFrameworkChannel({
    root: path.join(root, 'channel'),
    version: '26.7.30',
    archivePath,
    archiveSha256: sha256(archivePath),
  });
  const previous = {
    OPL_CURL_BIN: process.env.OPL_CURL_BIN,
    OPL_FRAMEWORK_ARTIFACT_REF: process.env.OPL_FRAMEWORK_ARTIFACT_REF,
  };
  process.env.OPL_CURL_BIN = path.join(channel.fakeBin, 'curl');
  process.env.OPL_FRAMEWORK_ARTIFACT_REF = 'ghcr.io/owner/one-person-lab-framework:26.7.30';
  try {
    const entry = readFrameworkChannelEntry();
    const target = path.join(root, 'target');
    fs.mkdirSync(target);
    assert.throws(
      () => fetchFrameworkArtifactFromChannel(target, { ...entry, artifact: "ghcr.io/owner/one-person-lab-framework", artifact_digest: `sha256:${"b".repeat(64)}` }),
      /OCI manifest digest mismatch/,
    );
    assert.deepEqual(fs.readdirSync(target), []);
    for (const artifactDigest of [null, 'sha256:not-a-digest']) {
      assert.throws(
        () => fetchFrameworkArtifactFromChannel(target, {
          ...entry,
          artifact_digest: artifactDigest as string,
        }),
        /immutable SHA-256 digest/,
      );
    }
    assert.throws(
      () => fetchFrameworkArtifactFromChannel(target, {
        ...entry,
        artifact: `ghcr.io/owner/one-person-lab-framework@sha256:${'c'.repeat(64)}`,
      }),
      /artifact ref conflicts/,
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Framework currentness compares its independent artifact digest', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-currentness-'));
  const targetRoot = path.join(homeRoot, 'framework');
  const sourceParent = path.join(homeRoot, 'artifact-source');
  const sourceRoot = path.join(sourceParent, 'one-person-lab');
  const archivePath = path.join(homeRoot, 'one-person-lab-framework.tar.gz');
  try {
    writeMinimalFrameworkRoot(targetRoot, 'current-framework');
    writeRuntimeOnlyFrameworkRoot(sourceRoot, 'current-framework');
    execFileSync('tar', ['-czf', archivePath, '-C', sourceParent, 'one-person-lab']);
    const archiveSha256 = sha256(archivePath);
    fs.writeFileSync(path.join(targetRoot, '.opl-framework-source.json'), JSON.stringify({
      source_head_sha: 'f'.repeat(40),
      source_archive_sha256: archiveSha256,
    }));
    const channel = writeFakeFrameworkChannel({
      root: path.join(homeRoot, 'channel'),
      version: '26.7.13-r4',
      archivePath,
      archiveSha256,
    });
    const previous = {
      OPL_CURL_BIN: process.env.OPL_CURL_BIN,
      OPL_FRAMEWORK_ARTIFACT_REF: process.env.OPL_FRAMEWORK_ARTIFACT_REF,
      OPL_FRAMEWORK_UPDATE_TARGET_ROOT: process.env.OPL_FRAMEWORK_UPDATE_TARGET_ROOT,
    };
    process.env.OPL_CURL_BIN = path.join(channel.fakeBin, 'curl');
    process.env.OPL_FRAMEWORK_ARTIFACT_REF = 'ghcr.io/owner/one-person-lab-framework:latest-stable';
    process.env.OPL_FRAMEWORK_UPDATE_TARGET_ROOT = targetRoot;
    try {
      const status = readOplFrameworkRuntimeUpdateStatus(targetRoot);
      assert.equal(status.channel_version, '0.2.0');
      assert.equal(status.channel_artifact_current, true);
      assert.equal(status.update_available, false);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system startup-maintenance applies OPL Framework runtime archive to a managed Linux Docker root', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-framework-archive-'));
  const targetRoot = path.join(homeRoot, 'data', 'opl', 'framework-current');
  const sourceParent = path.join(homeRoot, 'artifact-source');
  const sourceRoot = path.join(sourceParent, 'one-person-lab');
  const archivePath = path.join(homeRoot, 'one-person-lab-framework.tar.gz');
  const codexFixture = createCurrentCodexFixture();

  try {
    writeMinimalFrameworkRoot(targetRoot, 'old-framework');
    writeRuntimeOnlyFrameworkRoot(sourceRoot, 'new-framework');
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
      ...currentCodexEnvironment(codexFixture),
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
    assert.equal(output.system_action.details.framework_targets[0].reason, 'framework_runtime_artifact_staged_for_restart');
    assert.equal(fs.readFileSync(path.join(targetRoot, 'MARKER.txt'), 'utf8'), 'old-framework\n');
    assert.equal(fs.readFileSync(path.join(`${targetRoot}.pending`, 'MARKER.txt'), 'utf8'), 'new-framework\n');
    assert.equal(output.system_action.details.framework_targets[0].result.target_root, targetRoot);
    assert.equal(output.system_action.details.framework_targets[0].result.source_archive, archivePath);
    assert.equal(output.system_action.details.framework_targets[0].result.previous_root, null);
    assert.equal(output.system_action.details.framework_targets[0].result.rollback_ref, null);
    const metadata = JSON.parse(fs.readFileSync(output.system_action.details.framework_targets[0].result.metadata_ref, 'utf8'));
    assert.equal(metadata.surface_kind, 'opl_framework_pending_generation.v1');
    assert.equal(metadata.target_root, targetRoot);
    assert.equal(metadata.pending_root, `${targetRoot}.pending`);
    assert.equal(metadata.source_archive, archivePath);
    assert.match(metadata.staging_process_instance_id, /^(headless-cli|app):/);
    const previousTarget = process.env.OPL_FRAMEWORK_UPDATE_TARGET_ROOT;
    try {
      process.env.OPL_FRAMEWORK_UPDATE_TARGET_ROOT = targetRoot;
      const pendingStatus = readOplFrameworkRuntimeUpdateStatus(targetRoot, { allowChannelLookup: false });
      assert.equal(pendingStatus.pending_generation?.pending_root, `${targetRoot}.pending`);
    } finally {
      if (previousTarget === undefined) delete process.env.OPL_FRAMEWORK_UPDATE_TARGET_ROOT;
      else process.env.OPL_FRAMEWORK_UPDATE_TARGET_ROOT = previousTarget;
    }
    const repeat = runOplFrameworkSelfUpdate({ targetRoot, sourceArchive: archivePath,
      sourceArchiveSha256: sha256(archivePath), skipDependencyInstall: true, stageOnly: true });
    assert.equal(repeat.reason, 'framework_runtime_artifact_pending_restart');
    assert.equal(fs.readFileSync(path.join(targetRoot, 'MARKER.txt'), 'utf8'), 'old-framework\n');
    const absentTarget = path.join(homeRoot, 'not-installed');
    const skipped = runOplFrameworkSelfUpdate({ targetRoot: absentTarget, sourceArchive: archivePath, stageOnly: true });
    assert.equal(skipped.reason, 'background_requires_existing_managed_framework');
    assert.equal(fs.existsSync(absentTarget), false);
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
  const codexFixture = createCurrentCodexFixture();

  try {
    writeMinimalFrameworkRoot(targetRoot, 'old-framework');
    writeRuntimeOnlyFrameworkRoot(sourceRoot, 'new-channel-framework');
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
      OPL_FRAMEWORK_ARTIFACT_REF: 'ghcr.io/owner/one-person-lab-framework:26.7.9',
      OPL_CURL_BIN: path.join(channel.fakeBin, 'curl'),
      ...currentCodexEnvironment(codexFixture, [channel.fakeBin]),
    })) as {
      system_action: {
        status: string;
        details: {
          framework_targets: Array<{
            status: string;
            reason: string;
            result: {
              target_root: string;
              source_archive_sha256: string;
              source_head_sha: string;
              metadata_ref: string;
            };
          }>;
        };
      };
    };

    assert.equal(output.system_action.status, 'completed');
    assert.equal(output.system_action.details.framework_targets[0].status, 'completed');
    assert.equal(output.system_action.details.framework_targets[0].reason, 'framework_runtime_artifact_staged_for_restart');
    assert.equal(output.system_action.details.framework_targets[0].result.source_head_sha, 'f'.repeat(40));
    assert.equal(fs.readFileSync(path.join(targetRoot, 'MARKER.txt'), 'utf8'), 'old-framework\n');
    assert.equal(fs.readFileSync(path.join(`${targetRoot}.pending`, 'MARKER.txt'), 'utf8'), 'new-channel-framework\n');
    const metadata = JSON.parse(fs.readFileSync(output.system_action.details.framework_targets[0].result.metadata_ref, 'utf8'));
    assert.equal(metadata.surface_kind, 'opl_framework_pending_generation.v1');
    assert.equal(metadata.target_root, targetRoot);
    assert.equal(metadata.pending_root, `${targetRoot}.pending`);
    assert.equal(metadata.source_head_sha, 'f'.repeat(40));
    const curlLog = fs.readFileSync(channel.curlLogPath, 'utf8');
    assert.match(curlLog, /one-person-lab-framework/);
    assert.match(curlLog, /one-person-lab-framework/);
    assert.match(
      curlLog,
      new RegExp(`one-person-lab-framework/manifests/${channel.frameworkManifestDigest}`),
    );
    assert.doesNotMatch(curlLog, /one-person-lab-framework\/manifests\/0\.2\.0/);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('Docker WebUI image carrier prevents Framework channel and dependency writes to the data mount', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-framework-image-carrier-'));
  const dataRoot = path.join(homeRoot, 'data');
  const targetRoot = path.join(dataRoot, 'opl', 'framework');
  const seedDir = path.join(homeRoot, 'image', 'seed');
  const frameworkRoot = path.join(seedDir, 'payload', 'opl_framework');
  const imageManifestPath = path.join(homeRoot, 'image', 'image-manifest.json');
  const sourceParent = path.join(homeRoot, 'artifact-source');
  const sourceRoot = path.join(sourceParent, 'one-person-lab');
  const archivePath = path.join(homeRoot, 'one-person-lab-framework.tar.gz');
  const npmLogPath = path.join(homeRoot, 'npm.jsonl');
  const codexFixture = createCurrentCodexFixture();

  try {
    writeRuntimeOnlyFrameworkRoot(frameworkRoot, 'image-carried-framework');
    writeRuntimeOnlyFrameworkRoot(sourceRoot, 'channel-framework-that-must-not-run');
    execFileSync('tar', ['-czf', archivePath, '-C', sourceParent, 'one-person-lab']);
    const channel = writeFakeFrameworkChannel({
      root: path.join(homeRoot, 'channel'),
      version: '26.7.24-r2',
      archivePath,
      archiveSha256: sha256(archivePath),
    });
    fs.writeFileSync(path.join(channel.fakeBin, 'npm'), [
      `#!${process.execPath}`,
      "const fs = require('node:fs');",
      `fs.appendFileSync(${JSON.stringify(npmLogPath)}, JSON.stringify(process.argv.slice(2)) + '\\n');`,
      'process.exit(97);',
    ].join('\n'), { mode: 0o755 });
    fs.writeFileSync(imageManifestPath, JSON.stringify({
      schema: 'dev.onepersonlab.opl-webui-image-manifest.v1',
      image_role: 'opl_webui_runtime_image',
      image_profile: 'webui-full',
      seed_strategy: 'payload_manifest',
      seed_dir: seedDir,
    }), 'utf8');
    fs.writeFileSync(path.join(seedDir, 'metadata.json'), JSON.stringify({
      schema: 'dev.onepersonlab.opl-webui-image-seed.v1',
      strategy: 'payload_preheated',
      image_profile: 'webui-full',
      applies_to: 'docker-webui-runtime-image',
      components: [{
        id: 'opl_framework',
        version: '26.7.24-r2',
        source: 'ghcr_image_build_framework_seed',
        payload_path: 'payload/opl_framework',
        receipt_kind: 'opl_framework_seed_payload_receipt',
        source_fingerprint: `git:${'a'.repeat(40)}:${'a'.repeat(40)}`,
      }],
    }), 'utf8');

    const output = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance', '--scope', 'runtime_substrate'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_DATA_DIR: dataRoot,
      OPL_STATE_DIR: path.join(dataRoot, 'opl', 'state'),
      OPL_FRAMEWORK_UPDATE_TARGET_ROOT: targetRoot,
      OPL_FRAMEWORK_ARTIFACT_REF: 'ghcr.io/owner/one-person-lab-framework:26.7.24-r2',
      OPL_CURL_BIN: path.join(channel.fakeBin, 'curl'),
      OPL_IMAGE_MANIFEST_PATH: imageManifestPath,
      OPL_IMAGE_SEED_DIR: seedDir,
      ...currentCodexEnvironment(codexFixture, [channel.fakeBin]),
    })) as {
      system_action: {
        status: string;
        details: {
          framework_summary: {
            skipped_targets_count: number;
            manual_required_targets_count: number;
          };
          framework_targets: Array<{
            status: string;
            reason: string;
            result: {
              target_root: string;
              source_root: string;
              source_head_sha: string;
              dependency_install: {
                status: string;
                command_preview: string[];
              };
              metadata_ref: string;
            };
          }>;
        };
      };
    };

    assert.equal(output.system_action.status, 'completed');
    assert.equal(output.system_action.details.framework_summary.skipped_targets_count, 1);
    assert.equal(output.system_action.details.framework_summary.manual_required_targets_count, 0);
    assert.equal(output.system_action.details.framework_targets[0].status, 'skipped');
    assert.equal(
      output.system_action.details.framework_targets[0].reason,
      'framework_runtime_owned_by_webui_image_carrier',
    );
    assert.equal(output.system_action.details.framework_targets[0].result.target_root, targetRoot);
    assert.equal(output.system_action.details.framework_targets[0].result.source_root, frameworkRoot);
    assert.equal(output.system_action.details.framework_targets[0].result.source_head_sha, 'a'.repeat(40));
    assert.equal(output.system_action.details.framework_targets[0].result.dependency_install.status, 'skipped');
    assert.deepEqual(output.system_action.details.framework_targets[0].result.dependency_install.command_preview, []);
    assert.equal(output.system_action.details.framework_targets[0].result.metadata_ref, path.join(seedDir, 'metadata.json'));
    assert.equal(fs.existsSync(channel.curlLogPath), false);
    assert.equal(fs.existsSync(npmLogPath), false);
    assert.equal(fs.existsSync(targetRoot), false);
    assert.equal(fs.existsSync(`${targetRoot}.pending`), false);
    assert.equal(fs.existsSync(`${targetRoot}.previous`), false);
    assert.deepEqual(
      fs.existsSync(path.dirname(targetRoot))
        ? fs.readdirSync(path.dirname(targetRoot)).filter((entry) => entry.startsWith('framework.incoming-'))
        : [],
      [],
    );
    assert.equal(fs.existsSync(frameworkRoot), true);
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
  const codexFixture = createCurrentCodexFixture();

  try {
    writeRuntimeOnlyFrameworkRoot(sourceRoot, 'new-docker-data-framework');
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
      OPL_FRAMEWORK_ARTIFACT_REF: 'ghcr.io/owner/one-person-lab-framework:26.7.10',
      OPL_CURL_BIN: path.join(channel.fakeBin, 'curl'),
      ...currentCodexEnvironment(codexFixture, [channel.fakeBin]),
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
    assert.match(output.system_action.details.framework_targets[0].result.rollback_ref, /^opl:\/\/managed-update\/runtime_substrate\/framework\/rollback\//);
    assert.equal(fs.readFileSync(path.join(expectedTargetRoot, 'MARKER.txt'), 'utf8'), 'new-docker-data-framework\n');
    assert.equal(fs.existsSync(path.join(`${expectedTargetRoot}.previous`, 'package.json')), true);
    assert.equal(fs.existsSync(path.join(expectedTargetRoot, '.git')), false);
    const metadata = JSON.parse(fs.readFileSync(output.system_action.details.framework_targets[0].result.metadata_ref, 'utf8'));
    assert.equal(metadata.source_head_sha, 'f'.repeat(40));
    assert.equal(metadata.previous_root, `${expectedTargetRoot}.previous`);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('OPL Base rollback restores the previous OPL Framework runtime root', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-substrate-framework-rollback-'));
  const targetRoot = path.join(homeRoot, 'data', 'opl', 'framework-current');
  const previousRoot = `${targetRoot}.previous`;
  const codexFixture = createCurrentCodexFixture();

  try {
    writeMinimalFrameworkRoot(targetRoot, 'new-framework');
    writeMinimalFrameworkRoot(previousRoot, 'old-framework');

    const output = withCliTimeout('120000', () => runCli(['update', 'rollback'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_DATA_DIR: path.join(homeRoot, 'data'),
      OPL_STATE_DIR: path.join(homeRoot, 'data', 'opl', 'state'),
      OPL_FRAMEWORK_UPDATE_TARGET_ROOT: targetRoot,
      ...currentCodexEnvironment(codexFixture),
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
    assert.match(output.managed_update.components[0].receipt.rollback_ref ?? '', /^opl:\/\/managed-update\/opl_base\/rollback\//);
    assert.equal(fs.readFileSync(path.join(targetRoot, 'MARKER.txt'), 'utf8'), 'old-framework\n');
    assert.equal(fs.readFileSync(path.join(`${targetRoot}.rolled-back`, 'MARKER.txt'), 'utf8'), 'new-framework\n');
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});


test('Framework channel rejects aggregate artifacts and ambiguous source layers', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-channel-identity-'));
  const archivePath = path.join(root, 'source.tar.gz');
  fs.writeFileSync(archivePath, 'fixture');
  const previous = { OPL_CURL_BIN: process.env.OPL_CURL_BIN, OPL_FRAMEWORK_ARTIFACT_REF: process.env.OPL_FRAMEWORK_ARTIFACT_REF };
  try {
    for (const [index, invalid] of [
      { artifactType: 'application/vnd.onepersonlab.manifest.v1' },
      { duplicateSourceLayer: true },
    ].entries()) {
      const channel = writeFakeFrameworkChannel({ root: path.join(root, String(index)), version: '0.2.0', archivePath, archiveSha256: sha256(archivePath), ...invalid });
      process.env.OPL_CURL_BIN = path.join(channel.fakeBin, 'curl');
      process.env.OPL_FRAMEWORK_ARTIFACT_REF = 'ghcr.io/owner/one-person-lab-framework:latest-stable';
      assert.throws(() => readFrameworkChannelEntry(), /Framework artifact must declare/);
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
