#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MARKER_TYPE = 'application/vnd.onepersonlab.package.access-bootstrap.v1';
const MARKER = '{"schema_version":1,"purpose":"Private registry access check; no Package content"}\n';
const fail = (message) => { throw new Error(`Private Package registry: ${message}`); };
const denied = (result) => result.status !== 0 && /unauthorized|denied|forbidden|\b401\b|\b403\b|\b404\b|not found/i.test(`${result.stdout}\n${result.stderr}`);

/** No Package source, manifest, payload, credential or private predicate is uploaded here. */
export function ensurePrivatePackageRegistry(input, options = {}) {
  const env = options.env ?? process.env;
  const run = options.run ?? ((command, args, extraEnv = {}, cwd) => spawnSync(command, args, {
    env: { ...env, ...extraEnv }, cwd, encoding: 'utf8', stdio: 'pipe', timeout: 90_000, maxBuffer: 1024 * 1024,
  }));
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.ownerRepo ?? '')
    || env.GITHUB_REPOSITORY !== input.ownerRepo) {
    fail('authorized-only publication must run from its private owner repository.');
  }
  const read = (route) => {
    const result = run('gh', ['api', '--hostname', 'github.com', route]);
    if (result.status !== 0) {
      if (/HTTP 404|"status"\s*:\s*"404"/.test(`${result.stdout}\n${result.stderr}`)) return null;
      return fail('authenticated GitHub metadata could not be verified.');
    }
    try { return JSON.parse(result.stdout); } catch { return fail('GitHub metadata is invalid.'); }
  };
  const owner = read(`/repos/${input.ownerRepo}`);
  if (owner?.full_name !== input.ownerRepo || owner.private !== true) {
    fail('the publication owner must be an authenticated private repository.');
  }
  if (input.publisherOnly) return { status: 'private_publisher_verified' };
  const image = /^ghcr\.io\/([a-z0-9._-]+)\/(one-person-lab-private-packages\/[a-z0-9.-]+)$/.exec(input.image ?? '');
  if (!image || image[1] !== input.ownerRepo.split('/')[0].toLowerCase()) fail('private registry identity is invalid.');
  const route = `/users/${image[1]}/packages/container/${encodeURIComponent(image[2])}`;
  const validate = (metadata) => {
    // Actions can omit this optional association even when its token reads the
    // private package. The authenticated caller above is the publisher authority;
    // source identity is bound by the publication annotation and signed provenance.
    const reason = !metadata ? 'metadata_missing'
      : metadata.visibility !== 'private' ? 'visibility_not_private'
        : metadata.repository == null ? null
          : metadata.repository.full_name !== input.ownerRepo ? 'owner_association_mismatch'
            : metadata.repository.private == null ? 'associated_owner_privacy_missing'
              : metadata.repository.private !== true ? 'associated_owner_not_private' : null;
    if (reason) fail(`private visibility and any reported private owner association must match (${reason}).`);
    return metadata.repository == null ? 'association_metadata_unavailable' : 'association_verified';
  };
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-private-registry-'));
  try {
    let metadata = read(route);
    let bootstrapped = false;
    if (!metadata) {
      if (input.verifyOnly) validate(metadata);
      const marker = path.join(temporary, 'access-bootstrap.json');
      fs.writeFileSync(marker, MARKER, { mode: 0o600 });
      // GitHub Actions creates a package using the caller repository visibility.
      // Still verify the resulting registry state before uploading sensitive bytes.
      run('oras', ['push', '--format', 'json', `${input.image}:opl-access-bootstrap`,
        '--artifact-type', MARKER_TYPE, '--annotation', `org.opencontainers.image.source=https://github.com/${input.ownerRepo}`,
        `access-bootstrap.json:${MARKER_TYPE}+json`], {}, temporary);
      // A failed/unknown push is reconciled by metadata; never repeat the write.
      metadata = read(route);
      bootstrapped = true;
    }
    validate(metadata);
    const anonymous = path.join(temporary, 'anonymous');
    fs.mkdirSync(anonymous);
    const registryConfig = path.join(anonymous, 'config.json');
    fs.writeFileSync(registryConfig, '{"auths":{}}\n', { mode: 0o600 });
    const access = run('oras', ['repo', 'tags', '--registry-config', registryConfig, input.image], { DOCKER_CONFIG: anonymous });
    if (!denied(access)) fail('anonymous registry enumeration was not denied.');
    // Fresh registry metadata closes the access/read interval before returning.
    const ownerAssociation = validate(read(route));
    return { status: 'private_registry_verified', bootstrapped, anonymous_access: 'denied_verified', owner_association: ownerAssociation };
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

function main() {
  const input = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--publisher-only') input.publisherOnly = true;
    else if (argv[i] === '--verify-only') input.verifyOnly = true;
    else if (argv[i] === '--owner-repo' && argv[i + 1]) input.ownerRepo = argv[++i];
    else if (argv[i] === '--image' && argv[i + 1]) input.image = argv[++i];
    else fail('unknown or incomplete argument.');
  }
  process.stdout.write(`${JSON.stringify(ensurePrivatePackageRegistry(input))}\n`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
