import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

import { fs, path } from './helpers.ts';

const PACKAGE_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.package.source.v1+gzip';
const PACKAGE_MANIFEST_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.package.manifest.v1+json';
const PACKAGE_PAYLOAD_LAYER_MEDIA_TYPE = 'application/vnd.onepersonlab.package.payload.v1+json';

function sha256(filePath: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function contentLockDigest(paths: string[], sourceFiles: Map<string, string | Buffer>) {
  const digest = crypto.createHash('sha256');
  for (const relativePath of paths) {
    const pathBytes = Buffer.from(relativePath, 'utf8');
    const sourceFile = sourceFiles.get(relativePath);
    if (sourceFile === undefined) {
      throw new Error(`Fixture payload content lock references a missing source file: ${relativePath}`);
    }
    const fileBytes = Buffer.isBuffer(sourceFile) ? sourceFile : Buffer.from(sourceFile, 'utf8');
    const pathLength = Buffer.allocUnsafe(8);
    const fileLength = Buffer.allocUnsafe(8);
    pathLength.writeBigUInt64BE(BigInt(pathBytes.length));
    fileLength.writeBigUInt64BE(BigInt(fileBytes.length));
    digest.update(pathLength);
    digest.update(pathBytes);
    digest.update(fileLength);
    digest.update(fileBytes);
  }
  return `sha256:${digest.digest('hex')}`;
}

export function writeManagedRuntimeSourceFixture(input: {
  root: string;
  moduleId: string;
  repoName: string;
  version: string;
  sourceHeadSha: string;
  packageManifest?: Record<string, unknown>;
  payloadManifest?: Record<string, unknown>;
  sourceFiles?: Array<{
    sourcePath: string;
    content: string | Buffer;
    mode?: number;
  }>;
  artifactBackedPayload?: boolean;
}) {
  const blobRoot = path.join(input.root, 'blobs');
  const fakeBin = path.join(input.root, 'bin');
  const sourceParent = path.join(input.root, 'source');
  const sourceRoot = path.join(sourceParent, input.repoName);
  const archivePath = path.join(input.root, `${input.repoName}-${input.version}.tar.gz`);
  fs.rmSync(sourceRoot, { recursive: true, force: true });
  fs.mkdirSync(blobRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'src', 'fixture_agent.py'), 'import opl_framework\n');
  fs.writeFileSync(path.join(sourceRoot, 'package.json'), JSON.stringify({
    name: input.repoName,
    version: input.version,
    scripts: {},
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
  if (input.moduleId === 'medautogrant' || input.moduleId === 'redcube') {
    for (const relativePath of [
      'contracts/action_catalog.json',
      'contracts/domain_descriptor.json',
      'contracts/pack_compiler_input.json',
      'agent/stages/manifest.json',
    ]) {
      const targetPath = path.join(sourceRoot, relativePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, JSON.stringify({ fixture_version: input.version }, null, 2));
    }
    const skillPath = path.join(sourceRoot, 'agent', 'primary_skill', 'SKILL.md');
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.writeFileSync(skillPath, `# Standard Agent ${input.version}\n`);
  }
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
  for (const file of input.sourceFiles ?? []) {
    const targetPath = path.resolve(sourceRoot, file.sourcePath);
    if (!targetPath.startsWith(`${path.resolve(sourceRoot)}${path.sep}`)) {
      throw new Error(`Fixture source path escapes source root: ${file.sourcePath}`);
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, file.content, file.mode ? { mode: file.mode } : undefined);
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
  const sourceArtifactRef = `ghcr.io/fixture/one-person-lab-packages/${packageId}:${input.version}`;
  const exactSourceCommit = /^[0-9a-f]{40}$/.test(input.sourceHeadSha) ? input.sourceHeadSha : null;
  const packageManifest = structuredClone(input.packageManifest ?? {});
  if (packageManifest && exactSourceCommit) {
    const codexSurface = packageManifest.codex_surface;
    if (codexSurface && typeof codexSurface === 'object' && !Array.isArray(codexSurface)) {
      (codexSurface as Record<string, unknown>).carrier_source_commit = exactSourceCommit;
    }
  }
  const suppliedPayloadManifest = input.payloadManifest
    ? structuredClone(input.payloadManifest)
    : null;
  const sourceFiles = new Map(
    (input.sourceFiles ?? []).map((file) => [file.sourcePath, file.content]),
  );
  const payloadFiles: Array<Record<string, unknown>> = Array.isArray(suppliedPayloadManifest?.files)
    ? suppliedPayloadManifest.files.map((candidate) => {
        const file = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
          ? candidate as Record<string, unknown>
          : {};
        return {
          ...file,
          mode: file.mode ?? '100644',
        };
      })
    : [];
  const payloadPaths = payloadFiles
    .map((file) => typeof file.path === 'string' ? file.path : null)
    .filter((file): file is string => file !== null);
  const payloadManifest = suppliedPayloadManifest
    ? {
        ...suppliedPayloadManifest,
        surface_kind: 'opl_package_payload_manifest.v2',
        schema_ref: 'contracts/opl-framework/package-payload-manifest-v2.schema.json',
        package_id: packageId,
        plugin_id: input.repoName,
        package_version: input.version,
        source_repo: `https://github.com/gaofeng21cn/${input.repoName}.git`,
        source_commit: exactSourceCommit ?? input.sourceHeadSha,
        source_root: '.',
        content_lock: {
          algorithm: 'sha256',
          canonicalization: 'ordered_path_length_file_length_bytes',
          digest: contentLockDigest(payloadPaths, sourceFiles),
        },
        files: payloadFiles,
      }
    : null;
  const manifestJson = packageManifest
    ? `${JSON.stringify({
        ...packageManifest,
        package_id: packageId,
        version: input.version,
      }, null, 2)}\n`
    : null;
  const manifestDigest = manifestJson
    ? `sha256:${crypto.createHash('sha256').update(manifestJson).digest('hex')}`
    : null;
  const payloadManifestJson = payloadManifest
    ? `${JSON.stringify({
        ...payloadManifest,
        package_source: {
          transport: 'same_oci_artifact_source_archive',
          artifact_ref: sourceArtifactRef,
          archive_sha256: `sha256:${archiveDigest}`,
          archive_root: input.repoName,
        },
        files: payloadManifest.files.map((candidate) => {
          const file = candidate as Record<string, unknown>;
          return input.artifactBackedPayload === false
            ? file
            : {
                ...file,
                source_artifact_ref: sourceArtifactRef,
                content_utf8: undefined,
                content_base64: undefined,
                source_url: undefined,
              };
        }),
      }, null, 2)}\n`
    : null;
  const payloadManifestDigest = payloadManifestJson
    ? `sha256:${crypto.createHash('sha256').update(payloadManifestJson).digest('hex')}`
    : null;
  const manifestLayerPath = manifestJson ? path.join(blobRoot, 'package-manifest.json') : null;
  const payloadLayerPath = payloadManifestJson ? path.join(blobRoot, 'payload-manifest.json') : null;
  if (manifestJson && manifestLayerPath) fs.writeFileSync(manifestLayerPath, manifestJson);
  if (payloadManifestJson && payloadLayerPath) {
    fs.writeFileSync(payloadLayerPath, payloadManifestJson);
  }
  const packageArtifactManifest = {
    schemaVersion: 2,
    layers: [
      {
        mediaType: PACKAGE_LAYER_MEDIA_TYPE,
        digest: `sha256:${archiveDigest}`,
      },
      ...(manifestDigest ? [{
        mediaType: PACKAGE_MANIFEST_LAYER_MEDIA_TYPE,
        digest: manifestDigest,
        annotations: { 'org.opencontainers.image.title': 'package-manifest.json' },
      }] : []),
      ...(payloadManifestDigest ? [{
        mediaType: PACKAGE_PAYLOAD_LAYER_MEDIA_TYPE,
        digest: payloadManifestDigest,
        annotations: { 'org.opencontainers.image.title': 'payload-manifest.json' },
      }] : []),
    ],
  };
  const artifactDigest = `sha256:${crypto.createHash('sha256').update(JSON.stringify(packageArtifactManifest)).digest('hex')}`;
  const manifests = {
    [`fixture/one-person-lab-packages/${packageId}`]: packageArtifactManifest,
  };
  const blobs = {
    [`sha256:${archiveDigest}`]: archivePath,
    ...(manifestDigest && manifestLayerPath ? { [manifestDigest]: manifestLayerPath } : {}),
    ...(payloadManifestDigest && payloadLayerPath ? { [payloadManifestDigest]: payloadLayerPath } : {}),
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
    OPL_FIXTURE_ARTIFACT_DIGEST: artifactDigest,
    OPL_FIXTURE_ARCHIVE_DIGEST: `sha256:${archiveDigest}`,
  };
}
