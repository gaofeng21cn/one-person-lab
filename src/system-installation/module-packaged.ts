import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../contracts.ts';
import { PACKAGED_MODULE_MARKER_FILE } from '../packaged-module-marker.ts';
import type {
  DomainModuleSpec,
  GitRepoSnapshot,
} from './shared.ts';
import { normalizeOptionalString } from './shared.ts';

export function readPackagedModuleGitSnapshot(repoPath: string, spec: DomainModuleSpec): GitRepoSnapshot | null {
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

  if (parsed.packaged_runtime !== true || parsed.module_id !== spec.module_id || parsed.repo_name !== spec.repo_name) {
    return null;
  }

  const sourceGit =
    typeof parsed.source_git === 'object' && parsed.source_git !== null
      ? parsed.source_git as Record<string, unknown>
      : {};
  const headSha = normalizeOptionalString(typeof sourceGit.head_sha === 'string' ? sourceGit.head_sha : null);

  return {
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
  };
}

export function isPackagedModuleCheckout(repoPath: string, spec: DomainModuleSpec) {
  return Boolean(readPackagedModuleGitSnapshot(repoPath, spec));
}

export function copyManagedModuleFromPackagedRuntime(
  spec: DomainModuleSpec,
  sourcePath: string,
  checkoutPath: string,
) {
  const packagedGit = readPackagedModuleGitSnapshot(sourcePath, spec);
  if (!packagedGit) {
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
