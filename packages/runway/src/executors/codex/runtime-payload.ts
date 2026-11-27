import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { extractPackageSourceArchive, packageSourceArchiveDigest, resolveNpmTarball } from '@opl/pack';

const codexPackage = '@openai/codex';
const targets: Record<string, string> = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-arm64': 'aarch64-unknown-linux-musl',
  'linux-x64': 'x86_64-unknown-linux-musl',
  'win32-arm64': 'aarch64-pc-windows-msvc',
  'win32-x64': 'x86_64-pc-windows-msvc',
};
const stableVersion = /^\d+\.\d+\.\d+$/;

interface SeedArchive {
  path: string;
  size_bytes: number;
  sha256: string;
}

function readFullSeed(fullRoot: string) {
  const root = fs.realpathSync(fullRoot);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest', 'full-package-manifest.json'), 'utf8'));
  const seed = manifest?.codex_offline_seed;
  if (seed?.schema !== 'opl_full_codex_offline_seed.v1' || seed.installation_owner !== 'one-person-lab'
    || typeof seed.version !== 'string' || !stableVersion.test(seed.version)) {
    throw new Error('Full runtime is missing its verified Codex offline seed.');
  }
  return { root, version: seed.version as string, archives: seed.archives as Record<string, SeedArchive> };
}

function copyFullArchive(seed: ReturnType<typeof readFullSeed>, kind: 'package' | 'platform', destination: string) {
  const archive = seed.archives?.[kind];
  const relativePath = `runtime-payloads/codex-cli/${seed.version}/${kind}.tgz`;
  if (archive?.path !== relativePath || !/^[a-f0-9]{64}$/.test(archive.sha256)
    || !Number.isSafeInteger(archive.size_bytes) || archive.size_bytes <= 0) {
    throw new Error(`Invalid Full Codex ${kind} archive identity.`);
  }
  const source = path.join(seed.root, relativePath);
  if (!fs.lstatSync(source).isFile() || !fs.realpathSync(source).startsWith(seed.root + path.sep)) {
    throw new Error(`Invalid Full Codex ${kind} archive path.`);
  }
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  if (fs.statSync(destination).size !== archive.size_bytes
    || packageSourceArchiveDigest(destination) !== `sha256:${archive.sha256}`) {
    throw new Error(`Full Codex ${kind} archive does not match the frozen manifest.`);
  }
}

async function downloadNpmArchive(destination: string, version?: string) {
  const resolved = await resolveNpmTarball({ packageName: codexPackage, version, signal: AbortSignal.timeout(60_000) });
  const url = new URL(resolved.tarball_url);
  if (url.origin !== 'https://registry.npmjs.org' || !/^sha512-[A-Za-z0-9+/]+=*$/.test(resolved.integrity ?? '')) {
    throw new Error('Invalid official Codex npm archive source or integrity.');
  }
  const download = new AbortController();
  const idleTimeout = setTimeout(() => download.abort(new Error('Codex npm archive transfer stopped making progress.')), 60_000);
  try {
    const response = await fetch(url, { signal: download.signal, redirect: 'error' });
    if (!response.ok || !response.body) throw new Error(`Codex archive download failed with HTTP ${response.status}.`);
    const hash = crypto.createHash('sha512');
    const reader = response.body.getReader();
    async function* hashedChunks() {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        idleTimeout.refresh();
        hash.update(value);
        yield value;
      }
    }
    await fs.promises.writeFile(destination, hashedChunks(), { flag: 'wx', mode: 0o600 });
    if (`sha512-${hash.digest('base64')}` !== resolved.integrity) throw new Error('Codex npm archive integrity mismatch.');
  } finally {
    clearTimeout(idleTimeout);
    download.abort();
  }
  return resolved.version;
}

export async function stageCodexPayload(stage: string, env: NodeJS.ProcessEnv) {
  const platform = `${process.platform}-${process.arch}`;
  const target = targets[platform];
  if (!target) throw new Error(`Unsupported Codex runtime platform: ${platform}.`);
  const fullRoot = env.OPL_FULL_RUNTIME_HOME?.trim();
  const seed = fullRoot ? readFullSeed(fullRoot) : null;
  const rootArchive = path.join(stage, 'package.tgz');
  const platformArchive = path.join(stage, 'platform.tgz');
  const version = seed ? seed.version : await downloadNpmArchive(rootArchive);
  if (!stableVersion.test(version)) throw new Error('Official Codex root version must be stable.');
  if (seed) copyFullArchive(seed, 'package', rootArchive);
  const rootDir = path.join(stage, 'root-package');
  extractPackageSourceArchive(rootArchive, rootDir, { expectedRoot: 'package', strip: 1 });
  const rootManifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const platformVersion = `${version}-${platform}`;
  if (rootManifest?.name !== codexPackage || rootManifest.version !== version
    || rootManifest.optionalDependencies?.[`${codexPackage}-${platform}`] !== `npm:${codexPackage}@${platformVersion}`) {
    throw new Error('Codex root Package does not declare the expected platform dependency.');
  }
  if (seed) copyFullArchive(seed, 'platform', platformArchive);
  else await downloadNpmArchive(platformArchive, platformVersion);
  const platformDir = path.join(stage, 'platform-package');
  extractPackageSourceArchive(platformArchive, platformDir, { expectedRoot: 'package', strip: 1 });
  const platformManifest = JSON.parse(fs.readFileSync(path.join(platformDir, 'package.json'), 'utf8'));
  if (platformManifest?.name !== codexPackage || platformManifest.version !== platformVersion) {
    throw new Error('Codex platform Package identity does not match the root Package.');
  }
  const vendorRoot = path.join(platformDir, 'vendor', target);
  const filename = process.platform === 'win32' ? 'codex.exe' : 'codex';
  const binary = ['bin', 'codex'].map(dir => path.join(vendorRoot, dir, filename))
    .find(candidate => fs.statSync(candidate, { throwIfNoEntry: false })?.isFile());
  if (!binary) throw new Error('Codex platform Package does not contain its native executable.');
  return { vendorRoot, binary, version };
}
