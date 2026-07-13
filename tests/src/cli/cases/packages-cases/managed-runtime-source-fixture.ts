import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

import { fs, path } from './helpers.ts';

const PACKAGE_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.package.source.v1+gzip';
const CHANNEL_MANIFEST_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.release.channel-manifest.v1+json';

function sha256(filePath: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function writeManagedRuntimeSourceFixture(input: {
  root: string;
  moduleId: string;
  repoName: string;
  version: string;
  sourceHeadSha: string;
}) {
  const blobRoot = path.join(input.root, 'blobs');
  const fakeBin = path.join(input.root, 'bin');
  const sourceParent = path.join(input.root, 'source');
  const sourceRoot = path.join(sourceParent, input.repoName);
  const archivePath = path.join(input.root, `${input.repoName}-${input.version}.tar.gz`);
  const channelManifestPath = path.join(blobRoot, 'channel-manifest.json');
  fs.rmSync(sourceRoot, { recursive: true, force: true });
  fs.mkdirSync(blobRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'src', 'fixture_agent.py'), 'import opl_framework\n');
  fs.writeFileSync(path.join(sourceRoot, 'package.json'), JSON.stringify({
    name: input.repoName,
    version: input.version,
    scripts: { redcube: 'node scripts/handler.mjs' },
  }, null, 2));
  fs.writeFileSync(path.join(sourceRoot, 'scripts', 'opl-module-bootstrap.sh'), [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `printf '%s\\n' ${JSON.stringify(input.version)} > .runtime-prepared`,
  ].join('\n'), { mode: 0o755 });
  fs.writeFileSync(path.join(sourceRoot, 'scripts', 'opl-module-healthcheck.sh'), [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'PYTHONPATH=src python3 -c "import opl_framework"',
    'external-runtime-tool --check',
    `test "$(cat .runtime-prepared)" = ${JSON.stringify(input.version)}`,
    'if [[ "${1:-}" == "--probe" ]]; then',
    `  printf '%s\\n' ${JSON.stringify(input.version)} > .runtime-probed`,
    'fi',
    `printf '%s\\n' ${JSON.stringify(`healthy:${input.version}`)}`,
  ].join('\n'), { mode: 0o755 });
  fs.writeFileSync(path.join(sourceRoot, 'scripts', 'handler.mjs'), [
    "import fs from 'node:fs';",
    "const version = fs.readFileSync('.runtime-prepared', 'utf8').trim();",
    "if (!process.argv.includes('--help')) process.exit(2);",
    "process.stdout.write(`handler-ready:${version}\\n`);",
  ].join('\n'));
  if (input.moduleId === 'medautoscience' || input.moduleId === 'medautogrant') {
    fs.writeFileSync(path.join(sourceRoot, 'scripts', 'run-python-clean.sh'), [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'test -s .runtime-prepared',
      'test "$1" = "-m"',
      'test "$3" = "--help"',
      'printf "handler-ready:%s\\n" "$(cat .runtime-prepared)"',
    ].join('\n'), { mode: 0o755 });
  }
  execFileSync('tar', ['-czf', archivePath, input.repoName], { cwd: sourceParent });
  const archiveDigest = sha256(archivePath);
  const packageIdByModule: Record<string, string> = {
    medautoscience: 'mas',
    medautogrant: 'mag',
    redcube: 'rca',
    oplmetaagent: 'oma',
    oplbookforge: 'obf',
    scholarskills: 'mas-scholar-skills',
  };
  const packageId = packageIdByModule[input.moduleId] ?? input.moduleId;
  const channelManifest = {
    release_set_generation: input.version,
    package_catalog_surface_kind: 'opl_package_catalog.v1',
    packages: {
      package_catalog: {
        [packageId]: {
          package_id: packageId,
          selected_version: input.version,
          versions: [{
            package_version: input.version,
            selection_status: 'selected_for_release_set',
            source_artifact_ref: `ghcr.io/fixture/one-person-lab-packages/${packageId}:${input.version}`,
            artifact_digest: `sha256:${'a'.repeat(64)}`,
            artifact_status: 'published_immutable',
            package_content_digest: `sha256:${archiveDigest}`,
            owner_source_commit: input.sourceHeadSha,
          }],
        },
      },
    },
  };
  fs.writeFileSync(channelManifestPath, JSON.stringify(channelManifest));
  const channelDigest = sha256(channelManifestPath);
  const manifests = {
    'fixture/one-person-lab-manifest': {
      layers: [{
        mediaType: CHANNEL_MANIFEST_LAYER_MEDIA_TYPE,
        digest: `sha256:${channelDigest}`,
      }],
    },
    [`fixture/one-person-lab-packages/${packageId}`]: {
      layers: [{
        mediaType: PACKAGE_LAYER_MEDIA_TYPE,
        digest: `sha256:${archiveDigest}`,
      }],
    },
  };
  const blobs = {
    [`sha256:${channelDigest}`]: channelManifestPath,
    [`sha256:${archiveDigest}`]: archivePath,
  };
  fs.writeFileSync(path.join(fakeBin, 'curl'), [
    '#!/usr/bin/env node',
    "const fs = require('node:fs');",
    'const args = process.argv.slice(2);',
    "const url = args.find((arg) => arg.startsWith('http://') || arg.startsWith('https://')) || '';",
    "if (url.includes('/token?')) { process.stdout.write(JSON.stringify({ token: 'fixture' })); process.exit(0); }",
    `const manifests = ${JSON.stringify(manifests)};`,
    `const blobs = ${JSON.stringify(blobs)};`,
    "if (url.includes('/manifests/')) {",
    "  const match = url.match(/\\/v2\\/(.+)\\/manifests\\//);",
    "  const payload = match ? manifests[match[1]] : null;",
    "  if (!payload) process.exit(22);",
    '  process.stdout.write(JSON.stringify(payload));',
    '  process.exit(0);',
    '}',
    "if (url.includes('/blobs/')) {",
    "  const digest = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1));",
    "  const out = args[args.indexOf('-o') + 1];",
    '  if (!blobs[digest] || !out) process.exit(22);',
    '  fs.copyFileSync(blobs[digest], out);',
    '  process.exit(0);',
    '}',
    'process.exit(22);',
  ].join('\n'), { mode: 0o755 });
  fs.writeFileSync(path.join(fakeBin, 'external-runtime-tool'), [
    '#!/usr/bin/env bash',
    'test "$1" = "--check"',
  ].join('\n'), { mode: 0o755 });
  return {
    PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
    OPL_PACKAGES_OWNER: 'fixture',
  };
}
