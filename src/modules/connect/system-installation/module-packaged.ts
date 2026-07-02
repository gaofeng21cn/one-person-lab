import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../charter/contracts.ts';
import { PACKAGED_MODULE_MARKER_FILE } from '../packaged-module-marker.ts';
import type {
  DomainModuleSpec,
  GitRepoSnapshot,
} from './shared.ts';
import { normalizeOptionalString } from './shared.ts';
import {
  computePackageChannelTreeSha256,
  readPackageChannelLifecycle,
  type PackageChannelLifecycle,
} from './module-package-channel.ts';

export type PackagedModuleMarker = {
  source_kind: 'full_runtime' | 'package_channel';
  source_git: GitRepoSnapshot;
  package_channel_lifecycle: PackageChannelLifecycle | null;
};

function readPackagedModuleMarkerRecord(repoPath: string, spec: DomainModuleSpec) {
  const markerPath = path.join(repoPath, PACKAGED_MODULE_MARKER_FILE);
  if (!fs.existsSync(markerPath) || !fs.statSync(markerPath).isFile()) {
    return null;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (parsed.module_id !== spec.module_id || parsed.repo_name !== spec.repo_name) {
    return null;
  }
  return parsed;
}

function markerFromRecord(
  repoPath: string,
  spec: DomainModuleSpec,
  parsed: Record<string, unknown>,
): PackagedModuleMarker | null {
  const sourceKind = parsed.packaged_runtime === true
    ? 'full_runtime'
    : parsed.package_channel === true
      ? 'package_channel'
      : null;
  if (!sourceKind) {
    return null;
  }

  const sourceGit =
    typeof parsed.source_git === 'object' && parsed.source_git !== null
      ? parsed.source_git as Record<string, unknown>
      : {};
  const headSha = normalizeOptionalString(typeof sourceGit.head_sha === 'string' ? sourceGit.head_sha : null);

  return {
    source_kind: sourceKind,
    source_git: {
      branch: null,
      head_sha: headSha,
      short_sha: headSha ? headSha.slice(0, 12) : null,
      origin_url: spec.repo_url,
      upstream_ref: null,
      upstream_head_sha: null,
      ahead_count: null,
      behind_count: null,
      sync_status: 'no_upstream',
      dirty: false,
    },
    package_channel_lifecycle: sourceKind === 'package_channel'
      ? readPackageChannelLifecycle(repoPath, spec)
      : null,
  };
}

export function readPackagedModuleMarker(repoPath: string, spec: DomainModuleSpec): PackagedModuleMarker | null {
  const parsed = readPackagedModuleMarkerRecord(repoPath, spec);
  return parsed ? markerFromRecord(repoPath, spec, parsed) : null;
}

export function readPackagedModuleGitSnapshot(repoPath: string, spec: DomainModuleSpec): GitRepoSnapshot | null {
  return readPackagedModuleMarker(repoPath, spec)?.source_git ?? null;
}

export function isPackagedModuleCheckout(repoPath: string, spec: DomainModuleSpec) {
  return Boolean(readPackagedModuleMarker(repoPath, spec));
}

export function packagedModuleDirty(repoPath: string, spec: DomainModuleSpec) {
  const marker = readPackagedModuleMarker(repoPath, spec);
  if (!marker) {
    return null;
  }
  if (marker.source_kind !== 'package_channel') {
    return false;
  }
  const expectedTreeSha256 = marker.package_channel_lifecycle?.current.tree_sha256;
  if (!expectedTreeSha256) {
    return true;
  }
  return computePackageChannelTreeSha256(repoPath) !== expectedTreeSha256;
}

export function inspectPackagedModule(repoPath: string, spec: DomainModuleSpec) {
  const parsed = readPackagedModuleMarkerRecord(repoPath, spec);
  if (!parsed) {
    return null;
  }
  const marker = markerFromRecord(repoPath, spec, parsed);
  if (!marker) {
    return null;
  }
  const dirty = marker.source_kind === 'package_channel'
    ? (
      marker.package_channel_lifecycle?.current.tree_sha256
        ? computePackageChannelTreeSha256(repoPath) !== marker.package_channel_lifecycle.current.tree_sha256
        : true
    )
    : false;
  return {
    marker,
    git: {
      ...marker.source_git,
      dirty,
    },
    dirty,
  };
}

export function copyManagedModuleFromPackagedRuntime(
  spec: DomainModuleSpec,
  sourcePath: string,
  checkoutPath: string,
) {
  const marker = readPackagedModuleMarker(sourcePath, spec);
  if (!marker || marker.source_kind !== 'full_runtime') {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Packaged module source is not a valid OPL Full runtime module.',
      {
        module_id: spec.module_id,
        source_path: sourcePath,
        expected_marker: PACKAGED_MODULE_MARKER_FILE,
      },
      2,
    );
  }

  fs.mkdirSync(path.dirname(checkoutPath), { recursive: true });
  const tempTarget = `${checkoutPath}.tmp-${process.pid}`;
  fs.rmSync(tempTarget, { recursive: true, force: true });
  fs.cpSync(sourcePath, tempTarget, {
    recursive: true,
    dereference: false,
    preserveTimestamps: true,
  });
  fs.rmSync(checkoutPath, { recursive: true, force: true });
  fs.renameSync(tempTarget, checkoutPath);
}
