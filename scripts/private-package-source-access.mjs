import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveStatePaths } from '../packages/core/src/paths.ts';

const privatePublication = /^ghcr\.io\/([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)\/one-person-lab-private-packages\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?:latest-stable$/;
const sourceFile = 'software-sources.json';

function readStore(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw new Error('Private Package software source store is unreadable.');
  }
}

function configuredHandle(owner) {
  const paths = resolveStatePaths();
  let store = readStore(path.join(paths.state_dir, sourceFile));
  // v1 used this default on every platform. Only consult it if the current
  // default has no store; an explicit state directory remains isolated.
  if (store === undefined && !process.env.OPL_STATE_DIR?.trim() && !process.env.OPL_DATA_DIR?.trim()) {
    const legacy = path.join(paths.home_dir, 'Library', 'Application Support', 'OPL', 'state');
    if (legacy !== paths.state_dir) store = readStore(path.join(legacy, sourceFile));
  }
  if (store?.surface_kind !== 'opl_software_sources_store.v1' || !Array.isArray(store.sources)) return null;
  const matches = store.sources.filter(source => source?.source_id === `github-packages:${owner}`);
  if (matches.length !== 1) return null;
  const [source] = matches;
  return source.enabled === true && (source.provider_id === undefined || source.provider_id === 'github_packages')
    ? source.credential_handle : null;
}

function helperOutput(binary, args, input) {
  const result = spawnSync(binary, args, {
    input, encoding: 'utf8', timeout: 5_000, maxBuffer: 64 * 1024,
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

function credential(user, secret) {
  if (typeof user !== 'string' || typeof secret !== 'string' ||
      !user.trim() || !secret.trim() || /[:\r\n\0]/.test(user) || /[\r\n\0]/.test(secret)) return null;
  return { username: user.trim(), token: secret.trim() };
}

function dockerCredential() {
  try {
    const home = resolveStatePaths().home_dir;
    const configPath = path.join(process.env.DOCKER_CONFIG?.trim() || path.join(home, '.docker'), 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const helper = config.credHelpers?.['ghcr.io'] ?? config.credsStore;
    if (typeof helper !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(helper)) return null;
    const result = JSON.parse(helperOutput(`docker-credential-${helper}`, ['get'], 'ghcr.io\n'));
    return credential(result.Username, result.Secret);
  } catch {
    return null;
  }
}

function ghCredential() {
  return credential('x-access-token', helperOutput('gh', ['auth', 'token', '--hostname', 'github.com']));
}

/** Prepare only the configured GHCR source in the caller's short-lived registry directory. */
export function preparePrivatePackageRegistryAccess(publicationRef, registryConfigRoot) {
  const owner = typeof publicationRef === 'string' && privatePublication.exec(publicationRef)?.[1];
  if (!owner) return 'source_not_configured';
  const handle = configuredHandle(owner);
  let selected;
  switch (handle) {
    case 'env:OPL_GITHUB_PACKAGES_TOKEN':
      selected = credential(process.env.OPL_GITHUB_USERNAME?.trim() || 'x-access-token', process.env.OPL_GITHUB_PACKAGES_TOKEN);
      break;
    case 'provider:github_packages:docker':
      selected = dockerCredential();
      break;
    case 'provider:github_packages:gh-cli':
      selected = ghCredential();
      break;
    case 'provider:github_packages:ghcr':
      selected = dockerCredential() ?? ghCredential();
      break;
    default:
      return 'source_not_configured';
  }
  if (!selected) return 'credential_unavailable';
  if (registryConfigRoot !== undefined) {
    const dir = fs.lstatSync(registryConfigRoot);
    if (!dir.isDirectory() || (process.platform !== 'win32' && (dir.mode & 0o077) !== 0)) {
      throw new Error('Private registry configuration requires an owner-only directory.');
    }
    const auth = Buffer.from(`${selected.username}:${selected.token}`, 'utf8').toString('base64');
    fs.writeFileSync(path.join(registryConfigRoot, 'config.json'), JSON.stringify({ auths: { 'ghcr.io': { auth } } }), {
      mode: 0o600, flag: 'wx',
    });
  }
  return 'ready';
}
