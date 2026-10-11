#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { Ajv2020 } from 'ajv/dist/2020.js';

import { parseJsonText } from './script-json-boundary.mjs';
import { materializeArchiveBackedPackagePayload } from '../src/adapters/integration/package-distribution.ts';

import { packageSourceArchiveDigest, readPackageSourceArchiveEntries, packageSourceArchiveMembersStayWithinRoot, extractPackageSourceArchive } from '../src/adapters/integration/agent-package-registry-parts/package-source-archive.ts';

const FRAMEWORK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAYLOAD_SCHEMA_REF = 'contracts/opl-framework/package-payload-manifest-v2.schema.json';
const MAX_FILE_BYTES = 128 * 1024 * 1024;

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      input: { type: 'string' },
      output: { type: 'string' },
      'package-manifest': { type: 'string' },
      archive: { type: 'string' },
      'artifact-ref': { type: 'string' },
      'archive-sha256': { type: 'string' },
      'archive-root': { type: 'string' },
      'package-id': { type: 'string' },
      'package-version': { type: 'string' },
      'source-commit': { type: 'string' },
    },
  });
  const required = [
    'input',
    'output',
    'package-manifest',
    'archive',
    'artifact-ref',
    'archive-sha256',
    'archive-root',
    'package-id',
    'package-version',
    'source-commit',
  ];
  const missing = required.filter((name) => typeof values[name] !== 'string' || !values[name].trim());
  if (missing.length > 0) {
    throw new Error(`Missing required options: ${missing.map((name) => `--${name}`).join(', ')}`);
  }
  return {
    input: path.resolve(values.input.trim()),
    output: path.resolve(values.output.trim()),
    packageManifest: path.resolve(values['package-manifest'].trim()),
    archive: path.resolve(values.archive.trim()),
    artifactRef: values['artifact-ref'].trim(),
    archiveSha256: values['archive-sha256'].trim(),
    archiveRoot: values['archive-root'].trim(),
    packageId: values['package-id'].trim(),
    packageVersion: values['package-version'].trim(),
    sourceCommit: values['source-commit'].trim(),
  };
}

function readPhysicalRegularFile(filePath, label) {
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    throw new Error(`Cannot open physical ${label}: ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size > BigInt(MAX_FILE_BYTES)) {
      throw new Error(`${label} must be a bounded physical regular file: ${filePath}`);
    }
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor, { bigint: true });
    const linked = fs.lstatSync(filePath, { bigint: true });
    if (!linked.isFile()
      || before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs
      || linked.dev !== after.dev
      || linked.ino !== after.ino
      || fs.realpathSync(filePath) !== filePath) {
      throw new Error(`${label} changed or is not a canonical physical file: ${filePath}`);
    }
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}

function parseJson(bytes, label) {
  let payload;
  try {
    payload = parseJsonText(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return payload;
}

function schemaValidator() {
  const schemaPath = path.join(FRAMEWORK_ROOT, PAYLOAD_SCHEMA_REF);
  const schema = parseJson(readPhysicalRegularFile(schemaPath, 'payload schema'), 'Payload schema');
  return new Ajv2020({ allErrors: true, strict: false }).compile(schema);
}

function assertSchema(validate, payload, label) {
  if (!validate(payload)) {
    throw new Error(`${label} failed ${PAYLOAD_SCHEMA_REF}: ${JSON.stringify(validate.errors)}`);
  }
}

function sourceCoordinates(payload) {
  let source;
  try {
    source = new URL(payload.source_repo);
  } catch {
    throw new Error('Payload source_repo must be a canonical GitHub HTTPS repository.');
  }
  const components = source.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/');
  if (source.protocol !== 'https:' || source.hostname !== 'github.com' || components.length !== 2) {
    throw new Error('Payload source_repo must be a canonical GitHub HTTPS repository.');
  }
  return { owner: components[0], repo: components[1] };
}

function stringRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}

function exactString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function packageContentLockPaths(packageManifest, payload, options) {
  const codexSurface = stringRecord(packageManifest.codex_surface);
  const packageSourceCommit = exactString(codexSurface?.carrier_source_commit)
    ?? exactString(packageManifest.source_commit);
  if (packageManifest.package_id !== options.packageId
    || packageManifest.version !== options.packageVersion
    || packageSourceCommit !== options.sourceCommit
    || packageManifest.source_repo !== payload.source_repo
    || exactString(codexSurface?.plugin_id) !== payload.plugin_id) {
    throw new Error('Package manifest identity does not match the exact Package publication selection.');
  }
  const packageRole = exactString(packageManifest.package_role) ?? 'standard_agent';
  if (packageRole === 'capability_package') {
    const packageContentLock = stringRecord(packageManifest.content_lock);
    const payloadContentLock = stringRecord(payload.content_lock);
    const paths = packageContentLock?.paths;
    if (packageContentLock?.algorithm !== 'sha256'
      || packageContentLock?.canonicalization !== 'ordered_path_length_file_length_bytes'
      || packageContentLock?.digest !== payloadContentLock?.digest
      || !Array.isArray(paths)
      || paths.length === 0
      || paths.some((entry) => typeof entry !== 'string' || !entry)) {
      throw new Error('Capability Package manifest must declare the exact canonical payload content lock.');
    }
    return paths;
  }
  if (packageRole !== 'standard_agent' && packageRole !== 'workflow_profile') {
    throw new Error(`Unsupported Package role for payload materialization: ${packageRole}`);
  }
  return payload.files.map((file) => file.path);
}

function lengthPrefixedContentLock(paths, archiveBytesByPath) {
  const hash = crypto.createHash('sha256');
  const seen = new Set();
  for (const packagePath of paths) {
    if (seen.has(packagePath)) {
      throw new Error(`Package content_lock repeats package path ${packagePath}.`);
    }
    seen.add(packagePath);
    const filePath = archiveBytesByPath.get(packagePath);
    if (!filePath) {
      throw new Error(`Package content_lock path is absent from the payload archive: ${packagePath}`);
    }
    const fileBytes = readPhysicalRegularFile(filePath, 'payload content');
    const pathBytes = Buffer.from(packagePath, 'utf8');
    const pathLength = Buffer.allocUnsafe(8);
    const fileLength = Buffer.allocUnsafe(8);
    pathLength.writeBigUInt64BE(BigInt(pathBytes.length));
    fileLength.writeBigUInt64BE(BigInt(fileBytes.length));
    hash.update(pathLength);
    hash.update(pathBytes);
    hash.update(fileLength);
    hash.update(fileBytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

function verifyArchiveEntries(archivePath, payload, packageManifest, options) {
  const archiveRoot = payload.package_source.archive_root;
  const entries = readPackageSourceArchiveEntries(archivePath, archiveRoot);
  if (!packageSourceArchiveMembersStayWithinRoot(entries, archiveRoot)) {
    throw new Error('Package source archive contains an escaping or non-physical member.');
  }
  const temporaryRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-payload-verify-')));
  try {
    // Extract once; repeated tar scans are prohibitively expensive for media libraries.
    extractPackageSourceArchive(archivePath, temporaryRoot);
    const archivePathsByPath = new Map();
    for (const file of payload.files) {
      const archivePathRef = `${archiveRoot}/${file.source_path}`;
      const filePath = path.resolve(temporaryRoot, archivePathRef);
      if (!filePath.startsWith(`${temporaryRoot}${path.sep}`)) {
        throw new Error(`Package payload escapes archive root: ${archivePathRef}`);
      }
      const bytes = readPhysicalRegularFile(filePath, 'payload content');
      const actualSha256 = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
      if (file.sha256 !== actualSha256) {
        throw new Error(`Package archive payload SHA-256 mismatch: ${archivePathRef}`);
      }
      archivePathsByPath.set(file.path, filePath);
    }
    const actualContentLock = lengthPrefixedContentLock(
      packageContentLockPaths(packageManifest, payload, options), archivePathsByPath,
    );
    if (payload.content_lock.digest !== actualContentLock) {
      throw new Error(`Package archive content_lock mismatch: expected=${payload.content_lock.digest} actual=${actualContentLock}`);
    }
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }

}

function writePhysicalRegularFile(filePath, bytes) {
  const parent = path.dirname(filePath);
  const parentState = fs.lstatSync(parent);
  if (!parentState.isDirectory() || parentState.isSymbolicLink() || fs.realpathSync(parent) !== parent) {
    throw new Error(`Output parent must be a canonical physical directory: ${parent}`);
  }
  let descriptor;
  try {
    descriptor = fs.openSync(
      filePath,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW ?? 0),
      0o644,
    );
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  const outputState = fs.lstatSync(filePath);
  if (!outputState.isFile() || outputState.isSymbolicLink() || fs.realpathSync(filePath) !== filePath) {
    throw new Error(`Output is not a canonical physical regular file: ${filePath}`);
  }
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.input === options.output) {
    throw new Error('Input and output paths must be distinct.');
  }
  const payload = parseJson(readPhysicalRegularFile(options.input, 'payload input'), 'Payload input');
  const packageManifest = parseJson(
    readPhysicalRegularFile(options.packageManifest, 'Package manifest'),
    'Package manifest',
  );
  const validate = schemaValidator();
  assertSchema(validate, payload, 'Payload input');
  if (payload.surface_kind !== 'opl_package_payload_manifest.v2'
    || payload.schema_ref !== PAYLOAD_SCHEMA_REF
    || payload.package_id !== options.packageId
    || payload.package_version !== options.packageVersion
    || payload.source_commit !== options.sourceCommit) {
    throw new Error('Payload input identity does not match the exact Package publication selection.');
  }
  const source = sourceCoordinates(payload);
  const expectedArtifactRef = `ghcr.io/${source.owner}/one-person-lab-packages/${options.packageId}:${options.packageVersion}`;
  if (options.artifactRef !== expectedArtifactRef) {
    throw new Error(`Artifact ref does not match the exact owner Package selection: expected=${expectedArtifactRef}`);
  }
  if (options.archiveRoot !== source.repo) {
    throw new Error(`Archive root does not match the Package owner repository: expected=${source.repo}`);
  }
  const actualArchiveSha256 = packageSourceArchiveDigest(options.archive);
  if (options.archiveSha256 !== actualArchiveSha256) {
    throw new Error(`Archive SHA-256 mismatch: expected=${options.archiveSha256} actual=${actualArchiveSha256}`);
  }
  const materialized = materializeArchiveBackedPackagePayload({
    payload,
    payloadRef: path.basename(options.input),
    packageId: options.packageId,
    packageVersion: options.packageVersion,
    ownerSourceCommit: options.sourceCommit,
    sourceArtifactRef: options.artifactRef,
    archiveSha256: actualArchiveSha256,
    archiveRoot: options.archiveRoot,
  });
  assertSchema(validate, materialized, 'Materialized payload');
  verifyArchiveEntries(options.archive, materialized, packageManifest, options);
  const output = Buffer.from(`${JSON.stringify(materialized, null, 2)}\n`, 'utf8');
  writePhysicalRegularFile(options.output, output);
  process.stdout.write(`${JSON.stringify({
    status: 'materialized',
    output: options.output,
    package_id: options.packageId,
    package_version: options.packageVersion,
    source_commit: options.sourceCommit,
    source_artifact_ref: options.artifactRef,
    archive_sha256: actualArchiveSha256,
    archive_root: options.archiveRoot,
    file_count: materialized.files.length,
    payload_sha256: `sha256:${crypto.createHash('sha256').update(output).digest('hex')}`,
  })}\n`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
