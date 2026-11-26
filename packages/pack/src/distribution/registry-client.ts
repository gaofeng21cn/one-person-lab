import crypto from 'node:crypto';
import fs from 'node:fs';
import semver from 'semver';
import { PackError } from '../errors.ts';

export type PackageVisibility = 'public' | 'authorized_only';

export type RegistryFetchResponse = {
  readonly ok: boolean;
  readonly status: number;
  readonly headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type RegistryFetch = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  },
) => Promise<RegistryFetchResponse>;

export const OPL_OCI_SOURCE_MEDIA_TYPES = new Set([
  'application/vnd.onepersonlab.package.source.v2+gzip',
  'application/vnd.onepersonlab.package.source.v1+gzip',
  'application/vnd.oci.image.layer.v1.tar+gzip',
]);

export function normalizeDistributionVersion(value: string): string {
  const trimmed = value.trim();
  const pep440Alpha = trimmed.match(/^(\d+)\.(\d+)\.(\d+)a(\d+)$/);
  if (pep440Alpha) {
    return `${pep440Alpha[1]}.${pep440Alpha[2]}.${pep440Alpha[3]}-alpha.${pep440Alpha[4]}`;
  }
  const pep440Beta = trimmed.match(/^(\d+)\.(\d+)\.(\d+)b(\d+)$/);
  if (pep440Beta) {
    return `${pep440Beta[1]}.${pep440Beta[2]}.${pep440Beta[3]}-beta.${pep440Beta[4]}`;
  }
  const pep440Rc = trimmed.match(/^(\d+)\.(\d+)\.(\d+)rc(\d+)$/);
  if (pep440Rc) {
    return `${pep440Rc[1]}.${pep440Rc[2]}.${pep440Rc[3]}-rc.${pep440Rc[4]}`;
  }
  const parsed = semver.valid(trimmed);
  if (parsed) return parsed;
  return trimmed;
}

export function packageVisibility(value: unknown): PackageVisibility {
  if (value === undefined || value === null || value === 'public') return 'public';
  if (value === 'authorized_only') return 'authorized_only';
  throw new PackError('INVALID_INPUT', 'Package visibility must be public or authorized_only.');
}

export function packageRegistryNamespace(visibility: unknown): string {
  return packageVisibility(visibility) === 'authorized_only'
    ? 'one-person-lab-private-packages'
    : 'one-person-lab-packages';
}

export function buildOciPackageRef(
  owner: string,
  packageId: string,
  version: string,
  visibility: PackageVisibility = 'public',
): string {
  return `ghcr.io/${owner}/${packageRegistryNamespace(visibility)}/${packageId}:${version}`;
}

export interface ParsedOciRef {
  readonly registry: string;
  readonly repository: string;
  readonly reference: string;
}

export function parseOciRef(ref: string, defaultTag = 'latest'): ParsedOciRef {
  const trimmed = ref.trim();
  const withoutScheme = trimmed.replace(/^oci:\/\//, '');
  const slashIdx = withoutScheme.indexOf('/');
  if (slashIdx <= 0) {
    throw new PackError('INVALID_INPUT', `Invalid OCI reference '${ref}'.`, { ref });
  }
  const registry = withoutScheme.slice(0, slashIdx);
  const rest = withoutScheme.slice(slashIdx + 1);
  const atIdx = rest.indexOf('@');
  if (atIdx > 0) {
    return {
      registry,
      repository: rest.slice(0, atIdx),
      reference: rest.slice(atIdx + 1),
    };
  }
  const colonIdx = rest.lastIndexOf(':');
  if (colonIdx > 0) {
    return {
      registry,
      repository: rest.slice(0, colonIdx),
      reference: rest.slice(colonIdx + 1),
    };
  }
  return {
    registry,
    repository: rest,
    reference: defaultTag,
  };
}

export function sha256Payload(payload: Uint8Array | string): string {
  return `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;
}

export function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let read: number;
    while ((read = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(fd);
  }
  return `sha256:${hash.digest('hex')}`;
}

export interface OciManifestLayer {
  readonly mediaType: string;
  readonly digest: string;
  readonly size: number;
}

export interface ResolvedOciArtifact {
  readonly registry: string;
  readonly repository: string;
  readonly reference: string;
  readonly token: string;
  readonly blob_url: string;
  readonly digest: string;
  readonly size: number;
  readonly layers: readonly OciManifestLayer[];
}

export const defaultRegistryFetch: RegistryFetch = async (url, init) => {
  const response = await fetch(url, init);
  return {
    ok: response.ok,
    status: response.status,
    headers: response.headers,
    json: () => response.json(),
    text: () => response.text(),
    arrayBuffer: () => response.arrayBuffer(),
  };
};

export async function resolveOciArtifact(input: {
  readonly ociRef: string;
  readonly version?: string;
  readonly authHeader?: string;
  readonly fetchImpl?: RegistryFetch;
  readonly signal?: AbortSignal;
}): Promise<ResolvedOciArtifact> {
  const fetchImpl = input.fetchImpl ?? defaultRegistryFetch;
  const parsed = parseOciRef(input.ociRef, input.version ? normalizeDistributionVersion(input.version) : 'latest');
  const reference = input.version ? normalizeDistributionVersion(input.version) : parsed.reference;
  const baseHttps = parsed.registry.startsWith('http://') || parsed.registry.startsWith('https://')
    ? parsed.registry
    : `https://${parsed.registry}`;

  let token = '';
  if (parsed.registry === 'ghcr.io') {
    const tokenUrl = `https://ghcr.io/token?service=ghcr.io&scope=${encodeURIComponent(`repository:${parsed.repository}:pull`)}`;
    const tokenRes = await fetchImpl(tokenUrl, {
      headers: {
        ...(input.authHeader ? { Authorization: input.authHeader } : {}),
      },
      signal: input.signal,
    });
    if (!tokenRes.ok) {
      throw new PackError(
        'PACK_DOWNLOAD_FAILED',
        `OCI token request failed with HTTP ${tokenRes.status}.`,
        { status: tokenRes.status, repository: parsed.repository },
      );
    }
    const tokenJson = (await tokenRes.json()) as { token?: unknown };
    if (typeof tokenJson?.token !== 'string' || !tokenJson.token) {
      throw new PackError('PACK_DOWNLOAD_FAILED', 'OCI registry returned invalid bearer token.');
    }
    token = tokenJson.token;
  }

  const manifestUrl = `${baseHttps}/v2/${parsed.repository}/manifests/${reference}`;
  const manifestRes = await fetchImpl(manifestUrl, {
    headers: {
      Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
      ...(token ? { Authorization: `Bearer ${token}` } : input.authHeader ? { Authorization: input.authHeader } : {}),
    },
    signal: input.signal,
  });
  if (!manifestRes.ok) {
    throw new PackError(
      'PACK_DOWNLOAD_FAILED',
      `OCI manifest fetch failed with HTTP ${manifestRes.status}.`,
      { status: manifestRes.status, url: manifestUrl },
    );
  }
  const manifestBody = (await manifestRes.json()) as {
    layers?: Array<{ mediaType?: unknown; digest?: unknown; size?: unknown }>;
  };
  const rawLayers = Array.isArray(manifestBody?.layers) ? manifestBody.layers : [];
  const layers: OciManifestLayer[] = [];
  for (const layer of rawLayers) {
    if (
      typeof layer?.mediaType === 'string'
      && typeof layer?.digest === 'string'
      && Number.isSafeInteger(layer?.size)
      && Number(layer.size) >= 0
    ) {
      layers.push({
        mediaType: layer.mediaType,
        digest: layer.digest,
        size: Number(layer.size),
      });
    }
  }

  const sourceLayer = layers.find((layer) => OPL_OCI_SOURCE_MEDIA_TYPES.has(layer.mediaType));
  if (!sourceLayer || sourceLayer.size <= 0) {
    throw new PackError(
      'PACK_DOWNLOAD_FAILED',
      'OCI manifest does not contain a valid package source archive layer.',
      { repository: parsed.repository, reference },
    );
  }

  return {
    registry: parsed.registry,
    repository: parsed.repository,
    reference,
    token,
    blob_url: `${baseHttps}/v2/${parsed.repository}/blobs/${sourceLayer.digest}`,
    digest: sourceLayer.digest,
    size: sourceLayer.size,
    layers,
  };
}

export interface ResolvedNpmTarball {
  readonly package_name: string;
  readonly version: string;
  readonly tarball_url: string;
  readonly shasum?: string;
  readonly integrity?: string;
}

export async function resolveNpmTarball(input: {
  readonly packageName: string;
  readonly version?: string;
  readonly registryUrl?: string;
  readonly authHeader?: string;
  readonly fetchImpl?: RegistryFetch;
  readonly signal?: AbortSignal;
}): Promise<ResolvedNpmTarball> {
  const fetchImpl = input.fetchImpl ?? defaultRegistryFetch;
  const registry = (input.registryUrl ?? 'https://registry.npmjs.org').replace(/\/+$/, '');
  const encodedName = input.packageName.startsWith('@')
    ? `@${encodeURIComponent(input.packageName.slice(1))}`
    : encodeURIComponent(input.packageName);
  const metadataUrl = `${registry}/${encodedName}`;
  const res = await fetchImpl(metadataUrl, {
    headers: {
      Accept: 'application/json',
      ...(input.authHeader ? { Authorization: input.authHeader } : {}),
    },
    signal: input.signal,
  });
  if (!res.ok) {
    throw new PackError(
      'PACK_DOWNLOAD_FAILED',
      `npm metadata fetch failed with HTTP ${res.status} for '${input.packageName}'.`,
      { status: res.status, package_name: input.packageName },
    );
  }
  const meta = (await res.json()) as {
    'dist-tags'?: Record<string, string>;
    versions?: Record<string, { dist?: { tarball?: string; shasum?: string; integrity?: string } }>;
  };
  const targetVersion = input.version
    ? normalizeDistributionVersion(input.version)
    : meta['dist-tags']?.latest;
  if (!targetVersion || !meta.versions?.[targetVersion]?.dist?.tarball) {
    throw new PackError(
      'PACK_NOT_FOUND',
      `Version '${targetVersion ?? 'latest'}' not found for npm package '${input.packageName}'.`,
      { package_name: input.packageName, version: targetVersion ?? null },
    );
  }
  const dist = meta.versions[targetVersion].dist!;
  return {
    package_name: input.packageName,
    version: targetVersion,
    tarball_url: dist.tarball!,
    ...(dist.shasum ? { shasum: dist.shasum } : {}),
    ...(dist.integrity ? { integrity: dist.integrity } : {}),
  };
}
